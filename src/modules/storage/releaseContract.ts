// src/modules/storage/releaseContract.ts
// 发布契约（Static-Contract v4 V1–V10 + v1.1 V11）的消费侧类型与不变量。
//
// 只声明**消费端需要知道的形状**——契约本体归 Static-Contract 仓，本文件不重述它的散文，
// 只钉住我们必须依赖的字段与两条铁律：
//
//   ① `chunks[].file` 是**纯文件名、无路径**。绝不自己拼 `<base>/chunks/<codec>/<i>`
//      —— 那会回到「四因一果的 404」（拼错/没发/编码不对/权限）。
//   ② `codecs` 是**有序回退链**。选第一个本端能解的；解不了就换下一个，不是报错退出。
//
// 与 OPFS 下载索引（`downloads/manifest.json`，schema 1）**同名不同物**：
// 那个是本地记账，这个是远端发布契约。本文件里一律叫「发布 manifest」。

/** 支持的编码（契约 codecs 链的成员；顺序即优先级） */
export type ReleaseCodec = 'zstd' | 'gzip' | 'identity';

/** 契约接受的 schema 版本（客户端接受 2/3，见 catalogue 的 excluded 说明） */
export const ACCEPTED_SCHEMAS: readonly number[] = [2, 3];

/** 一个分片的记账：`file` 纯文件名，`part` 决定拼接顺序 */
export interface ReleaseChunk {
  readonly part: number;
  readonly file: string;
  readonly bytes: number;
  readonly sha256: string;
}

/** 一个编码变体：同一 entry 的多种压缩表示，按 codecs 链有序回退 */
export interface ReleaseVariant {
  readonly codec: ReleaseCodec;
  /**
   * 分片列表（契约 v3 起所有编码都用 chunks）。
   * 实测三仓 schema 3 manifest：`chunked` 字段不写、`file` 从不出现 ⇒
   * 不声明这两个死字段（声明了却从不填充，是形状自述与实现不符）。
   */
  readonly chunks: readonly ReleaseChunk[];
}

/** 一个条目（一个可下载的完整产物） */
export interface ReleaseEntry {
  readonly product: string;
  readonly name: string;
  /** 拼接后（解压后）的原始字节数与指纹 —— 第二道校验的期望值 */
  readonly bytes: number;
  readonly sha256: string;
  readonly variants: readonly ReleaseVariant[];
  /** v1.1 V11：条目级许可覆盖（缺席 = 继承 manifest.license） */
  readonly license?: ReleaseLicense;
}

/** v1.1 许可字段：`resolveLicense(entry, manifest)` 是唯一规则（见文件尾） */
export interface ReleaseLicense {
  readonly id: string;
  readonly url?: string;
}

/** 发布 manifest 本体 */
export interface ReleaseManifest {
  readonly schema: number;
  readonly id: string;
  readonly chunkSize?: number;
  readonly codecs: readonly ReleaseCodec[];
  readonly products?: readonly string[];
  readonly entries: readonly ReleaseEntry[];
  readonly license?: ReleaseLicense;
}

/** 解析失败的原因分类（消费端要能分辨「manifest 坏」与「网络坏」） */
export type ManifestRejection =
  | { kind: 'network'; httpStatus: number; url: string }
  | { kind: 'schema-rejected'; schema: number; url: string }
  | { kind: 'shape-invalid'; reason: string; url: string };

export type ManifestLoadResult =
  | { ok: true; manifest: ReleaseManifest; base: string }
  | { ok: false; rejection: ManifestRejection };

/**
 * 契约 V1 的资产名白名单（与 Static-Contract 参考客户端逐字一致）：
 * `^[A-Za-z0-9_-][A-Za-z0-9._-]*$`。
 *
 * 为什么从严：块 URL 由 `base + chunk.file` 拼成。名字里若允许 `//`，
 * `new URL('//evil.example/x', base)` 会**换 host** —— manifest 能劫持下载源。
 */
const ASSET_NAME_RE = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/;

/** 契约 V6：单块上限 2^25 字节（fzstd backreference 安全边界） */
const MAX_CHUNK_BYTES = 2 ** 25;

const CODEC_ALIASES: Readonly<Record<string, ReleaseCodec>> = {
  zstd: 'zstd',
  gzip: 'gzip',
  identity: 'identity',
};

function isPositiveInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v > 0;
}

/** `part` 从 0 起（拼接顺序的 0-based 下标），所以单独一个非负判据 */
function isNonNegativeInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}

function isSha256Hex(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);
}

/**
 * 形状校验：把不可信的 JSON 收窄成 `ReleaseManifest`。
 *
 * 为什么单列一个纯函数：契约字段会演进（v1.1 已加 license、v3 加 chunks），
 * 校验逻辑必须能被单测逐条喂坏形状——它同时是「消费端对契约的理解」的可读文档。
 *
 * 判据从严的地方（都是踩过的坑）：
 *   · `chunks[].file` 含 `/` 或 `..` ⇒ 拒（契约要求纯文件名；允许路径会引入拼接歧义）
 *   · `part` 必须从 0 连续递增（拼接顺序靠它，缺号会静默拼错）
 *   · 块 `bytes` 之和**不必**等于 entry.bytes（那是压缩前的量，不成立）
 */
export function parseManifest(raw: unknown, url: string): ManifestLoadResult {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, rejection: { kind: 'shape-invalid', reason: 'not an object', url } };
  }
  const m = raw as Record<string, unknown>;

  if (!isPositiveInt(m.schema)) {
    return { ok: false, rejection: { kind: 'shape-invalid', reason: 'schema not a positive integer', url } };
  }
  if (!ACCEPTED_SCHEMAS.includes(m.schema as number)) {
    return { ok: false, rejection: { kind: 'schema-rejected', schema: m.schema as number, url } };
  }
  if (!Array.isArray(m.entries)) {
    return { ok: false, rejection: { kind: 'shape-invalid', reason: 'entries is not an array', url } };
  }
  const declaredCodecs = Array.isArray(m.codecs)
    ? (m.codecs as unknown[]).map((c) => CODEC_ALIASES[String(c)]).filter(Boolean)
    : [];
  if (declaredCodecs.length === 0) {
    return { ok: false, rejection: { kind: 'shape-invalid', reason: 'codecs missing or empty', url } };
  }

  const entries: ReleaseEntry[] = [];
  for (const rawEntry of m.entries as unknown[]) {
    if (!rawEntry || typeof rawEntry !== 'object') {
      return { ok: false, rejection: { kind: 'shape-invalid', reason: 'entry is not an object', url } };
    }
    const e = rawEntry as Record<string, unknown>;
    if (typeof e.name !== 'string' || !e.name) {
      return { ok: false, rejection: { kind: 'shape-invalid', reason: 'entry.name missing', url } };
    }
    if (!isPositiveInt(e.bytes) || !isSha256Hex(e.sha256)) {
      return { ok: false, rejection: { kind: 'shape-invalid', reason: `entry "${e.name}" bytes/sha256 invalid`, url } };
    }
    if (!Array.isArray(e.variants) || e.variants.length === 0) {
      return { ok: false, rejection: { kind: 'shape-invalid', reason: `entry "${e.name}" has no variants`, url } };
    }

    const variants: ReleaseVariant[] = [];
    for (const rawVariant of e.variants as unknown[]) {
      // null / 非对象变体：跳过（不是整体拒——别的变体可能可用），
      // 但**不能因此崩**：`(null).codec` 会抛 TypeError，把结构化 rejection 变成崩溃。
      if (!rawVariant || typeof rawVariant !== 'object') continue;
      const v = rawVariant as Record<string, unknown>;
      const codec = CODEC_ALIASES[String(v.codec)];
      if (!codec) {
        // 不认识的编码：跳过而不是整体拒——本端可能只是旧版本，别的变体还能用
        continue;
      }
      const rawChunks = Array.isArray(v.chunks) ? (v.chunks as unknown[]) : [];
      if (rawChunks.length === 0) continue;

      const chunks: ReleaseChunk[] = [];
      // 块数组里出现 null / 非对象 ⇒ 这是坏形状（不是「跳过」）：
      // 少一块就等于拼接不完整，静默跳过会拼出 size 对内容错的字节流。
      // 但同样不能崩——返结构化 rejection。
      for (const rawChunk of rawChunks) {
        if (!rawChunk || typeof rawChunk !== 'object') {
          return { ok: false, rejection: { kind: 'shape-invalid', reason: `entry "${e.name}" has a non-object chunk`, url } };
        }
        const c = rawChunk as Record<string, unknown>;
        if (typeof c.file !== 'string' || !c.file) {
          return { ok: false, rejection: { kind: 'shape-invalid', reason: `entry "${e.name}" chunk.file missing`, url } };
        }
        // 铁律 ①：名字必须在**契约白名单**内（V1：`^[A-Za-z0-9_-][A-Za-z0-9._-]*$`）。
        //
        // 移植自 Static-Contract 参考客户端（2026-11-05）。**这是安全控制不是洁癖**：
        // 块 URL 是 `new URL(chunk.file, root)` 拼的，一个 `//evil.example/x`
        // 会解析到**别的 host** —— 一份恶意 manifest 就能把客户端带离镜像。
        // 我们原来只拒 `/` 与 `..`，`?`/`#` 会被拼进 URL（同一类风险的弱版本）。
        if (!ASSET_NAME_RE.test(c.file)) {
          return {
            ok: false,
            rejection: {
              kind: 'shape-invalid',
              reason: `chunk.file violates the V1 name whitelist: "${c.file}"`,
              url,
            },
          };
        }
        if (!isNonNegativeInt(c.part) || !isPositiveInt(c.bytes) || !isSha256Hex(c.sha256)) {
          return { ok: false, rejection: { kind: 'shape-invalid', reason: `entry "${e.name}" chunk fields invalid`, url } };
        }
        chunks.push({ part: c.part as number, file: c.file, bytes: c.bytes as number, sha256: c.sha256 });
      }

      // 契约 V6：单块不得超过 2^25（fzstd backreference 上限）。超了就解不出。
      for (const c of chunks) {
        if (c.bytes > MAX_CHUNK_BYTES) {
          return {
            ok: false,
            rejection: {
              kind: 'shape-invalid',
              reason: `entry "${e.name}" chunk "${c.file}" is ${c.bytes} B > V6 max ${MAX_CHUNK_BYTES}`,
              url,
            },
          };
        }
      }

      // part 必须从 0 连续：拼接顺序靠它，缺号会静默拼错
      const sorted = [...chunks].sort((a, b) => a.part - b.part);
      for (let i = 0; i < sorted.length; i++) {
        if (sorted[i].part !== i) {
          return {
            ok: false,
            rejection: { kind: 'shape-invalid', reason: `entry "${e.name}" chunk parts not contiguous from 0`, url },
          };
        }
      }
      variants.push({ codec, chunks: sorted });
    }

    if (variants.length === 0) {
      return { ok: false, rejection: { kind: 'shape-invalid', reason: `entry "${e.name}" has no usable variant`, url } };
    }

    // 契约 V5 后半：**同一 entry 的所有 codec 必须切出相同块数**（它们切的是同一批原始字节）。
    //
    // 为什么必须查所有变体、而不只查本端要选的那个（移植自参考客户端 2026-11-05）：
    // 否则同一份 manifest 会对 zstd 客户端「有效」、对 gzip 客户端「无效」，
    // 而选不了 zstd 的客户端**永远不会知道这份 manifest 是坏的**——它会以为是自己解不了。
    const counts = new Set(variants.map((v) => v.chunks.length));
    if (counts.size > 1) {
      const detail = variants.map((v) => `${v.codec}=${v.chunks.length}`).join(', ');
      return {
        ok: false,
        rejection: {
          kind: 'shape-invalid',
          reason: `entry "${e.name}" codecs disagree on chunk count (${detail}); V5 requires them to slice the same bytes`,
          url,
        },
      };
    }
    entries.push({
      product: typeof e.product === 'string' ? e.product : '',
      name: e.name,
      bytes: e.bytes as number,
      sha256: e.sha256 as string,
      variants,
      license: parseLicense(e.license),
    });
  }

  return {
    ok: true,
    base: url,
    manifest: {
      schema: m.schema as number,
      id: typeof m.id === 'string' ? m.id : '',
      chunkSize: isPositiveInt(m.chunkSize) ? (m.chunkSize as number) : undefined,
      codecs: declaredCodecs as ReleaseCodec[],
      products: Array.isArray(m.products) ? (m.products as string[]) : undefined,
      entries,
      license: parseLicense(m.license),
    },
  };
}

function parseLicense(raw: unknown): ReleaseLicense | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const l = raw as Record<string, unknown>;
  if (typeof l.id !== 'string' || !l.id) return undefined;
  return { id: l.id, url: typeof l.url === 'string' ? l.url : undefined };
}

/**
 * 按契约 `codecs` 链选第一个**本端能解**的变体。
 *
 * `capabilities` 由调用方给出（浏览器有没有原生 gzip / fzstd 挂上了没有），
 * 这样这个函数保持纯函数、可在 Node 里逐条测——不必模拟浏览器。
 */
export function selectVariant(
  entry: ReleaseEntry,
  manifestCodecs: readonly ReleaseCodec[],
  capabilities: ReadonlySet<ReleaseCodec>,
): ReleaseVariant | null {
  // 先按 manifest 声明的优先级，再按本端能力过滤
  for (const codec of manifestCodecs) {
    if (!capabilities.has(codec)) continue;
    const hit = entry.variants.find((v) => v.codec === codec);
    if (hit) return hit;
  }
  // 契约链里没声明的编码：兜底 identity —— 但**能力集必须真的有 identity**。
  // 「能力集为空」= 本端什么都不能解（连直通都不敢保证），此时不许瞎选：
  // 返回 null 让调用方明说「本端不支持任何编码」，而不是拿一份字节去糊。
  if (capabilities.has('identity')) {
    return entry.variants.find((v) => v.codec === 'identity') ?? null;
  }
  return null;
}

/**
 * v1.1 V11 的**唯一一条许可规则**：`entry.license ?? manifest.license`。
 *
 * 契约定死「客户端只认一条规则——没有 glob、没有优先级表、没有命名空间歧义」。
 * 所以这里就是一个 ?? 。把它做成具名函数而不是让调用方各写一遍 `a ?? b`，
 * 是为了让「覆盖语义」只有一个产地（三处各写一次就会有一处写成 `b ?? a`）。
 *
 * 返回 undefined 表示**两个层级都没声明** —— v1.1 说「不知道」是合法终态
 * （进不进 catalogue 是派生件的判断，不是客户端的）。
 */
export function resolveLicense(
  entry: Pick<ReleaseEntry, 'license'>,
  manifest: Pick<ReleaseManifest, 'license'>,
): ReleaseLicense | undefined {
  return entry.license ?? manifest.license;
}
