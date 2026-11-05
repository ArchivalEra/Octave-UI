// src/modules/storage/catalogueReleaseSource.ts
// `ReleaseSource` 的生产实现：从 catalogue 现读 base → 取 manifest → 选变体。
//
// 三条设计判断（每条都对应一个实测事实）：
//
// ① **base 每次从 catalogue 现读，绝不硬编码 tag**。
//    实测（2026-11-02）：上游当场删了两个 octave-11.3.0* release 换成
//    octave-full-wasm-v0.1.0；硬编码的基址立刻 404。
//
// ② **catalogue 自身有死条目，必须逐个试探**（死链容忍）。
//    同一时刻实测：catalogue 里仍是旧的两个 tag（派生滞后 6 小时），
//    其中 octave-11.3.0 的 manifest 是 404、-r2 直接连接超时，而新 tag 活着。
//    ⇒ 「取第一个就开工」会全黑。
//
// ③ **每个包有自己的 release**（第二轮复查的 Critical 修正）。
//    catalogue 的 id 形如 `<repo>/<product>-<name>-<version>`（条数会随上游发版变，
//    不在代码里写死条数——要现数值请 `curl .../catalogue.json | jq '.releases|length'`）：
//    LLVM-wasm/v0.1.6、Octave-Extra-Content/forge-statistics-1.7.7 …
//    所以**必须先用包名把候选 release 缩下来**，再在那几条里做死链容忍。
//    我最初写成「取全局第一个活的 release 再找包」——第一个活的是 LLVM，
//    里面永远没有 statistics ⇒ 所有 forge 包永远回落整包（功能上等于没接线）。
//
// ④ **解析不出就返回 null，让 DownloadStore 回落整包**。
//    派生窗口里这是正常形态不是错误；但「为什么没用 release」必须可观察——
//    所以失败原因走 onFallback 回调而不是静默吞掉。

import type { ForgePackageItem } from '../plugins/package/types';
import type { DownloadRef } from './downloadTypes';
import type { FetchPort } from './FetchPort';
import type { ReleaseSource, ResolvedReleaseTarget } from './DownloadStore';
import type { ReleaseCodec, ReleaseEntry, ReleaseVariant } from './releaseContract';
import { selectVariant, type CodecPreference } from './releaseContract';
import { fetchReleaseManifest, loadCatalogue, orderByAuthority } from './releaseCatalogue';
import type { Catalogue, CatalogueRelease, DeadReleaseEntry } from './releaseCatalogue';
import { detectCodecCapabilities } from './chunkAssembler';

export interface CatalogueReleaseSourceOptions {
  /** catalogue 的 URL（派生件；在**域名根**，不在站点 base 下——见 deriveCatalogueUrl） */
  /** catalogue 地址或**候选列表**（按序探测；域名会变，见 appContext 的实测注释） */
  catalogueUrl: string | readonly string[];
  /** 取字节/JSON 的端口（与 DownloadStore 共用同一个 ⇒ 测试可注入 Mock） */
  fetchPort: FetchPort;
  /**
   * 是否可解 zstd。传**函数**则是「每次选变体时现问」（活查询，正确做法）；
   * 传布尔是构造时快照（仅测试/无 loader 场景）。
   *
   * ⚠️ 曾经的 bug（design-it-twice 方案 B 指出）：默认值 `hasZstd ?? true` 是**谎言**——
   * fzstd 是懒加载的，加载失败后能力集仍声称有 zstd ⇒ 每次都先白下 zstd 分片再回落 gzip。
   * 现在默认改为「问 loader 的当次状态」，见 resolve 里 capabilitiesOf()。
   */
  hasZstd?: boolean | (() => boolean);
  /** **成功**结果的缓存毫秒数（派生件 6 小时一更） */
  catalogueTtlMs?: number;
  /**
   * 失败（catalogue 不可达 / 空）的结果缓存毫秒数 —— **默认 0 = 不缓存失败**。
   *
   * 为什么不缓存失败（第二轮复查 NEW-3）：一次瞬时网络抖动若被缓存 30 分钟，
   * 就把 release 路径封死半小时。派生件 6 小时一更已经够滞后，再叠故障缓存
   * 只会让用户多等。失败的下一次调用立刻重试。
   */
  failureTtlMs?: number;
  /**
   * 编码偏好（按条目回调或全局链）。
   *
   * 生产默认给一条**按体积**的策略：大件优先 zstd（省 27% 字节），
   * 小件（< 1 MiB）优先 gzip（不值得为它挂 fzstd）。
   */
  codecPreference?: CodecPreference;
  /** 解析失败/回落的观察口（生产接日志；不吞掉原因） */
  onFallback?: (info: { packageName: string; reason: string }) => void;
}

/** 取 url 的 basename —— 市场契约的「产物名」就在这里 */
export function artifactNameOf(url: string): string {
  const clean = url.split('?')[0].split('#')[0];
  const parts = clean.split('/');
  return parts[parts.length - 1] || '';
}

/** 市场契约里的一个版本候选（只取定位与核验需要的字段） */
export interface WantedArtifact {
  /** 产物名（= 发布 manifest 的 entry.name） */
  name: string;
  /** 市场契约给的期望指纹；有值才做双确认 */
  sha256?: string;
  /** 期望字节数（可选，仅诊断） */
  bytes?: number;
}

/**
 * 从市场契约的包记录里推出「我要哪个产物」。
 *
 * 判据链（**不猜包名、不查 release id**）：
 *   · 优先用调用方指定的 version 候选（`versions[]` 里 stage!=='withheld' 的）；
 *   · 否则用顶层 `url`；
 *   · 产物名 = url 的 basename；
 *   · 期望 sha = 同一候选里的 `sha256`。
 *
 * 为什么这么做（2026-11-03 与用户对齐后的结论）：
 *   分发契约的 `entry.name` 与市场契约 `url` 的 basename **是同一个身份**（产物文件名），
 *   两边还都带 sha256 ⇒ 两套契约自己就能完整表述，消费端不需要任何映射表。
 *   我上一版用「包名」去猜 release id（`releaseIdMatchesPackage`）是越权且已失灵：
 *   `modelica-standard-library` 匹配不上 `supply-msl-4.1.0`，`msl` 会命中两条。
 *
 * 返回 null = 这个包**没有可定位的单产物**（例如 `form:"tree"` 的 pyodide：
 * 它的 url 指向包内文件 `pyodide.asm.wasm`，而 release 发的是 `pyodide-core-*.tar.bz2`
 * ——两者不是同一身份）。此时调用方应回落原路径，**不许猜**。
 */
/**
 * 是否 `form:"tree"`（目录树形态）。
 *
 * 判据取**版本候选里的 form 优先**，回落到包级 form：一个包可能某些版本是 tree、
 * 某些是 pkg（目前没有，但形状上允许）。
 */
export function isTreeForm(pkg: ForgePackageItem, version?: string): boolean {
  type Cand = { version?: string; form?: string };
  const cands = Array.isArray(pkg.versions) ? (pkg.versions as Cand[]) : [];
  const v = version ? cands.find((c) => c.version === version) : undefined;
  const form = v?.form ?? (pkg as { form?: string }).form;
  return form === 'tree';
}

export function wantedArtifactOf(pkg: ForgePackageItem, version?: string): WantedArtifact | null {
  type Cand = { version?: string; url?: string; sha256?: string; size?: number; stage?: string };
  const candidates: Cand[] = (Array.isArray(pkg.versions) && pkg.versions.length > 0
    ? (pkg.versions as Cand[])
    : [{ version: pkg.version, url: pkg.url, sha256: (pkg as any).sha256, size: pkg.size, stage: 'staged' }]
  ).filter((c) => c && c.stage !== 'withheld');

  const chosen =
    (version ? candidates.find((c) => c.version === version) : undefined) ??
    candidates[0] ??
    (pkg.url ? ({ url: pkg.url, sha256: (pkg as any).sha256, size: pkg.size } as Cand) : undefined);

  const url = chosen?.url;
  if (!url) return null;
  const name = artifactNameOf(url);
  if (!name) return null;

  return { name, sha256: chosen?.sha256, bytes: chosen?.size };
}

/**
 * 一个 entry 是否就是我要的那个产物。
 *
 * 判据：**名字逐字相等**；若市场契约给了 sha，**还要求 sha 逐字相等**（双确认）。
 *
 * 为什么必须双确认而不是只信名字：同名不同字节在多文件包里是常态
 * （例如两个 release 都发 `msl-4.1.0-maint.om.zip`，实测同 sha ⇒ 取哪条都对；
 *  但若哪天不同 sha，只按名字就会取错）。sha 是市场契约自己给的，用它不算猜。
 */
export function entryMatchesWanted(entry: ReleaseEntry, wanted: WantedArtifact): boolean {
  if (entry.name !== wanted.name) return false;
  if (wanted.sha256 && entry.sha256 !== wanted.sha256) return false;
  return true;
}

/**
 * 全表扫：找第一个「manifest 活着且真有这个产物」的 release。
 *
 * 为什么是**全表**而不是先筛 release（2026-11-03 修正）：
 *   消费端不知道「哪个包在哪条 release」——那是内容契约/分发命名的职责。
 *   市场契约给的是**产物名 + sha**，分发契约给的是**entry.name + sha**，两者同构
 *   ⇒ 直接按产物名全表扫，命中即用。零映射、零猜测。
 *
 * 代价：每次解析最多打开 N 份 manifest（N = catalogue 的 release 数，**不在代码里写死**）。
 * 用 getCatalogue() 的缓存 +
 *   这里按需取，实测可接受；且**只在真的要下载时**发生（不是每次页面加载）。
 *
 * `dead` 如实收集：让「这个产物到底哪里去了」可回答，不随 null 消失。
 */
async function firstLiveEntryAcrossCatalogue(
  fetchPort: FetchPort,
  catalogue: Catalogue,
  wanted: WantedArtifact,
): Promise<{
  hit: { entry: ReleaseEntry; base: string; codecs: readonly ReleaseCodec[] } | null;
  dead: DeadReleaseEntry[];
}> {
  const dead: DeadReleaseEntry[] = [];
  // 同名同 sha 的冗余发布：优先权威产地（内容仓 151 §2 裁定）。
  // 实例：`msl-4.1.0-maint.om.zip` 同时由 `Octave-Extra-Content/supply-msl-4.1.0`
  // 与 `OpenModelica-Full-Wasm/msl-4.1.0-maint.om` 发布，实测 sha 逐字相同；
  // MSL 的产地是 OM，所以取 OM 那条。内容仓会撤掉自己的重复件。
  const ordered = orderByAuthority(catalogue.releases);
  for (const release of ordered) {
    const loaded = await fetchReleaseManifest(fetchPort, release.base);
    if (!loaded.ok) {
      dead.push({ id: release.id, rejection: loaded.rejection });
      continue;
    }
    const entry = loaded.manifest.entries.find((e) => entryMatchesWanted(e, wanted));
    if (!entry) continue;
    return { hit: { entry, base: release.base, codecs: loaded.manifest.codecs }, dead };
  }
  return { hit: null, dead };
}

/**
 * 按契约 codecs 链给出「主变体 + 本端能解的其余变体」。
 * 回落链的意义在 chunkAssembler 里兑现（运行时失败才换下一个）；这里只负责列出候选。
 */
function pickVariantChain(
  entry: ReleaseEntry,
  codecs: readonly ReleaseCodec[],
  capabilities: ReadonlySet<ReleaseCodec>,
): { variant: ReleaseVariant; fallbacks: ReleaseVariant[] } | null {
  const variant = selectVariant(entry, codecs, capabilities);
  if (!variant) return null;
  const fallbacks: ReleaseVariant[] = [];
  for (const codec of codecs) {
    if (codec === variant.codec) continue;
    if (!capabilities.has(codec)) continue;
    const v = entry.variants.find((x) => x.codec === codec);
    if (v) fallbacks.push(v);
  }
  return { variant, fallbacks };
}

export function createCatalogueReleaseSource(options: CatalogueReleaseSourceOptions): ReleaseSource {
  const successTtl = options.catalogueTtlMs ?? 30 * 60 * 1000;
  const failureTtl = options.failureTtlMs ?? 0;
  let cached: { at: number; catalogue: Catalogue | null } | null = null;

  /**
   * 能力集**每次现算**（不缓存）：fzstd 的可用性会在运行期变化
   * （idle → loading → ready | unavailable），快照会让「已失败」的会话继续选 zstd。
   */
  const capabilitiesOf = (): Set<ReleaseCodec> => {
    const hz = options.hasZstd;
    // 默认 false（不是 true）—— fzstd 是懒加载的，调用方不传 = 还没确认能解；
    // 默认 true 会让它每次都先白下 zstd 分片再回落 gzip（这正是本文件 45 行记的 bug）。
    const available = typeof hz === 'function' ? hz() : hz ?? false;
    return detectCodecCapabilities(available);
  };

  async function getCatalogue(): Promise<Catalogue | null> {
    const now = Date.now();
    if (cached) {
      const ttl = cached.catalogue ? successTtl : failureTtl;
      if (ttl > 0 && now - cached.at < ttl) return cached.catalogue;
    }
    const catalogue = await loadCatalogue(options.fetchPort, options.catalogueUrl);
    cached = { at: now, catalogue };
    return catalogue;
  }

  return {
    async resolve(pkg: ForgePackageItem, ref: DownloadRef): Promise<ResolvedReleaseTarget | null> {
      const fail = (reason: string): null => {
        options.onFallback?.({ packageName: pkg.name, reason });
        return null;
      };

      // ⓪ `form:"tree"` 的语义（内容仓 151 裁定 C + 我仓实测补充）
      //
      //    内容契约的三键对 tree 是这样指向的：
      //      url    = 入口件（如 `omc/OpenModelicaCompiler_bg.wasm`）
      //      sha256 = **入口件**的指纹
      //      size   = 整目录字节
      //
      //    ⇒ 「按产物名 + sha 命中 release」对 tree **是否成立，取决于入口件是不是
      //      在 release 里作为独立 entry 发布**：
      //        · OMC   ：入口件 `OpenModelicaCompiler_bg.wasm` **是** release 的独立 entry
      //                  ⇒ 能命中，走 catalogue（这也正是用户「两个引擎都上 catalogue」的要求）
      //        · pyodide：入口件 `pyodide.asm.wasm` 在 `pyodide-core-*.tar.bz2` **内部**
      //                  ⇒ 命不中，回落站点（内容仓 151 §1 实测：22,013,349 vs 6,757,104
      //                     是两个不同字节集合）
      //
      //    所以这里**不按 form 一刀切**，而是：tree 也去试一次产物名 + sha 命中；
      //    命不中就如实回落（下面 fail 分支会说清是 tree 且没命中）。
      //    —— 一刀切会让 OMC 引擎被迫走站点，直接违背用户目标；而「先试再回落」
      //      既不猜也不丢能力：命中说明发布方确实把入口件当独立产物发了，那就用它。
      const treeForm = isTreeForm(pkg);

      // ① 先从**市场契约**推出「我要哪个产物」（产物名 + 期望 sha）。
      //    这不是猜：市场契约的 url basename 与分发契约的 entry.name 是同一个身份。
      const wanted = wantedArtifactOf(pkg, ref.version || pkg.version);
      if (!wanted) {
        return fail('market contract gives no locatable single artifact (missing url)');
      }

      const catalogue = await getCatalogue();
      if (!catalogue) return fail('catalogue unavailable or empty');

      // ② 全表扫：找「该产物名 + sha 双确认」的 entry。
      //    不再按包名筛 release —— 那是内容契约的职责，消费端不该猜。
      const { hit, dead } = await firstLiveEntryAcrossCatalogue(
        options.fetchPort,
        catalogue,
        wanted,
      );

      if (!hit) {
        const kinds = dead.map((d) => `${d.id}:${d.rejection.kind}`).join(', ');
        return fail(
          (treeForm
            ? `form:"tree" entry "${wanted.name}" is not published as a standalone release entry` +
              ` (its bytes live inside an archive — different byte sets); falling back to site path`
            : '') +
            (dead.length
              ? ` | no live release carried artifact "${wanted.name}" (dead: ${kinds})`
              : ` | no release carried artifact "${wanted.name}" (${catalogue.releases.length} releases scanned)` +
                (wanted.sha256 ? ' with expected sha' : ''))
        );
      }

      // 按契约 codecs 链给出主变体 + 回落链（内部 seam：pickVariantChain）
      const capabilities = capabilitiesOf();
      const chain = pickVariantChain(hit.entry, hit.codecs, capabilities);
      if (!chain) return fail(`no decodable variant (capabilities: ${[...capabilities].join(',')})`);

      return { entry: hit.entry, variant: chain.variant, base: hit.base, fallbacks: chain.fallbacks };
    },
  };
}
