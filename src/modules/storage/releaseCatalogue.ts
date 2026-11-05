// src/modules/storage/releaseCatalogue.ts
// 发布目录（catalogue）消费层：从派生件取 release 列表，并**容忍死条目**。
//
// 为什么需要这一层（内容仓 099 §6.5 的实测事实）：
//
//   catalogue 是**6 小时定时派生**的（`cron: '17 */6 * * *'`）。上游删旧 tag、发新 tag 的
//   那一刻到下一次派生的窗口里，catalogue 会同时含有**已死**的旧条目与**尚未进来**的新条目。
//   实测（2026-11-02）：`Octave-Full-Wasm/octave-11.3.0` 与 `-r2` 的 `base + manifest.json`
//   都是 404，而新的 `octave-full-wasm-v0.1.0` 还没进表。
//
//   ⇒ 「取第一个 release 就开工」会随机 404。正确做法是**逐个试探、失败换下一个**。
//   这不是契约义务（契约只管字节形状），是客户端稳健性——但没有它，市场会在派生窗口里全黑。
//
// 另一条铁律（099 §6.5）：**绝不硬编码 tag 或 base**。base 每次从 catalogue 现读，
// 上游换 tag 我们不用改代码。

import type { FetchPort } from './FetchPort';
import { computeSha256 } from './FetchPort';
import type { ReleaseManifest } from './releaseContract';
import { parseManifest, type ManifestLoadResult, type ManifestRejection } from './releaseContract';

/** catalogue 里的一个 release 条目（派生件，字段随 Static-Contract 演进） */
export interface CatalogueRelease {
  readonly id: string;
  /** 集群镜像（先试） */
  readonly base: string;
  /**
   * 兜底 source（契约 §5.3 的 `base_proxy`）：`base` 不可达时换它。
   *
   * 移植自 Static-Contract 参考客户端（2026-11-05）：他们有完整的多 root 回退
   * （`base` → `base_proxy` + 共享失败账本 + 按字节量推导的重试预算）。
   * 我们之前只有单一 base 的固定退避 ⇒ **镜像挂了没有旁路**。
   *
   * 实测此刻 catalogue 只给 `base`（无 `base_proxy`）——所以这是**契约就绪、
   * 数据未用**的状态：字段有则用、无则跳过，零行为变化。
   */
  readonly base_proxy?: string | null;
  readonly manifest_sha256?: string;
  readonly license?: { readonly id?: string; readonly url?: string };
  readonly verified_at?: string;
}

export interface Catalogue {
  readonly schema: number;
  readonly verified_at?: string;
  readonly releases: readonly CatalogueRelease[];
  /** 派生件主动排除的条目（schema 不符等），消费端要知道「为什么没有」 */
  readonly excluded?: readonly { repo?: string; tag?: string; reason?: string }[];
}

/** 试探过程中失败的条目（UI 可显示「N 个条目暂不可用」而不是假装一切正常） */
export interface DeadReleaseEntry {
  readonly id: string;
  readonly rejection: ManifestRejection;
}

/** 逐个试探的结果：命中的第一个可用 release + 沿途的死条目（如实记录，不是静默跳过） */
export interface ResolvedRelease {
  readonly release: CatalogueRelease;
  readonly manifest: ReleaseManifest;
  readonly deadEntries: readonly DeadReleaseEntry[];
}

/**
 * 纯函数：从 catalogue 原始 JSON 收窄成 `Catalogue`。
 *
 * 判据：`releases` 非空才算有效目录。空目录**不是**「没有包」，是派生件坏了——
 * 返回 null 让调用方明说，而不是当作「市场上什么都没有」。
 */
export function parseCatalogue(raw: unknown): Catalogue | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  if (!Array.isArray(c.releases) || c.releases.length === 0) return null;

  const releases: CatalogueRelease[] = [];
  for (const r of c.releases as unknown[]) {
    if (!r || typeof r !== 'object') continue;
    const e = r as Record<string, unknown>;
    if (typeof e.id !== 'string' || !e.id) continue;
    if (typeof e.base !== 'string' || !e.base) continue;
    releases.push({
      id: e.id,
      base: e.base,
      base_proxy: typeof e.base_proxy === 'string' && e.base_proxy ? e.base_proxy : null,
      manifest_sha256: typeof e.manifest_sha256 === 'string' ? e.manifest_sha256 : undefined,
      license:
        e.license && typeof e.license === 'object'
          ? {
              id: typeof (e.license as any).id === 'string' ? (e.license as any).id : undefined,
              url: typeof (e.license as any).url === 'string' ? (e.license as any).url : undefined,
            }
          : undefined,
      verified_at: typeof e.verified_at === 'string' ? e.verified_at : undefined,
    });
  }
  if (releases.length === 0) return null;

  return {
    schema: typeof c.schema === 'number' ? c.schema : 1,
    verified_at: typeof c.verified_at === 'string' ? c.verified_at : undefined,
    releases,
    excluded: Array.isArray(c.excluded) ? (c.excluded as Catalogue['excluded']) : undefined,
  };
}

/** 拉取并解析 catalogue。空目录 / 坏形状 ⇒ null（调用方必须明说，不许当成空市场） */
export async function loadCatalogue(
  fetchPort: FetchPort,
  url: string | readonly string[],
  signal?: AbortSignal,
): Promise<Catalogue | null> {
  // 支持**候选列表**：按序试，第一个成功的说了算（2026-11-05 实测教训：
  // 静态分发域名会变，写死单个地址某天就 404，而拿不到 catalogue 是**静默降级**
  // ——所有 release 收益全丢，用户看不出区别）。全挂才返回 null。
  const candidates = typeof url === 'string' ? [url] : [...url];
  for (const candidate of candidates) {
    if (signal?.aborted) return null;
    try {
      const raw = await fetchPort.fetchJSON<unknown>(candidate, { signal });
      const parsed = parseCatalogue(raw);
      if (parsed) return parsed;
      // 拿到了但不是合法 catalogue（例如 HTML 落地页）⇒ 换下一个候选
    } catch {
      // 这个候选不可用 ⇒ 换下一个
    }
  }
  return null;
}

/**
 * 取一个 release 的 manifest，失败返回结构化原因（不 throw——死链是常态，不是异常）。
 *
 * `manifest_sha256`（可选）：catalogue 给了就**校验**（2026-11-05 起，移植自参考客户端）。
 * 没给就只解析——派生滞后期间新 tag 的 manifest 还不该被旧 sha 判死，所以是
 * **有则校验、无则跳过**，不是「校验但不阻断」（后者是假字段）。
 */
/**
 * 「权威产地优先」排序：上游产物仓优先于内容仓的供给副本。
 *
 * 唯一产地（2026-11-03 去重）：这条偏序原本在 `catalogueReleaseSource` 与
 * `engineReleaseSource` 各写一份正则，两处已当场漂移过一次（引擎侧多写了
 * `ArchivalEra/` 前缀，生产上永不命中）。读同一份 catalogue、同一 TTL、同一偏序的
 * 两处逻辑不该各写一遍。
 *
 * ⚠️ 只是**排序偏好**，不是正确性依赖：同名同 sha 的冗余发布取谁都对，
 * 这条只让「谁是产地」可解释。
 *
 * ⚠️ id 形状是 `<repo>/<asset>`，**不含 GitHub org 前缀**（实测：
 * `Octave-Extra-Content/supply-msl-4.1.0`、`OpenModelica-Full-Wasm/msl-4.1.0-maint.om`）。
 */
const UPSTREAM_REPO_RE = /^(OpenModelica-Full-Wasm|Octave-Full-Wasm|LLVM-wasm)\//;

export function orderByAuthority<T extends { id: string }>(releases: readonly T[]): T[] {
  return [...releases].sort((a, b) => {
    const au = UPSTREAM_REPO_RE.test(a.id) ? 0 : 1;
    const bu = UPSTREAM_REPO_RE.test(b.id) ? 0 : 1;
    return au - bu;
  });
}

export async function fetchReleaseManifest(
  fetchPort: FetchPort,
  base: string,
  signal?: AbortSignal,
  expectedSha256?: string | null,
): Promise<ManifestLoadResult> {
  // base 拼接的唯一产地：与 chunkAssembler.chunkUrl 同形（base 末尾补 / 再拼裸名）
  const url = `${base.endsWith('/') ? base : `${base}/`}manifest.json`;

  // ★ `manifest_sha256` 钉（移植自 Static-Contract 参考客户端 2026-11-05）。
  //   有期望值时**必须取字节**而不是 fetchJSON——校验要的是原始字节。
  //
  //   为什么值得付这一步（我们之前把它当"诊断信号"、从不校验，等于假字段）：
  //   manifest 是**整棵下载树的根**。CDN/代理返回一份被篡改或串了的 manifest，
  //   后续每个块都会「按错的 sha 校验」——症状是逐块全红却查不出为什么。
  //   钉住根比校验叶子便宜得多。
  //
  //   兼容性：catalogue 没给 `manifest_sha256` 时（当前线上就是）走原路径，
  //   零额外开销、零行为变化。
  if (expectedSha256) {
    let bytes: Uint8Array;
    try {
      const res = await fetchPort.fetchBytes(url, { signal });
      if (!res.ok) {
        return { ok: false, rejection: { kind: 'network', httpStatus: res.status, url } };
      }
      bytes = res.data;
    } catch (err: any) {
      const status = typeof err?.status === 'number' ? err.status : 0;
      return { ok: false, rejection: { kind: 'network', httpStatus: status, url } };
    }
    const actual = await computeSha256(bytes);
    if (actual !== expectedSha256) {
      // 根不对 ⇒ 整条 release 不可信。归到 network（换下一条 release 是对的），
      // 但原因要能看出是「内容不符」而不是「连不上」。
      return {
        ok: false,
        rejection: {
          kind: 'network',
          httpStatus: 0,
          url: `${url} (manifest sha256 mismatch: expected ${expectedSha256.slice(0, 16)}…, got ${actual.slice(0, 16)}…)`,
        },
      };
    }
    let raw: unknown;
    try {
      raw = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return { ok: false, rejection: { kind: 'shape-invalid', reason: 'manifest is not valid JSON', url } };
    }
    return parseManifest(raw, base);
  }

  let raw: unknown;
  try {
    raw = await fetchPort.fetchJSON<unknown>(url, { signal });
  } catch (err: any) {
    const status = typeof err?.status === 'number' ? err.status : 0;
    return { ok: false, rejection: { kind: 'network', httpStatus: status, url } };
  }
  return parseManifest(raw, base);
}

/**
 * 按顺序试探多个 release，返回第一个 manifest 可用的。
 *
 * `preferredIds` 是调用方希望优先尝试的（例如已知 product 归属的仓），
 * 其余按 catalogue 顺序兜底。**死条目被如实收集**，不是静默跳过。
 */
export async function resolveFirstLiveRelease(
  fetchPort: FetchPort,
  catalogue: Catalogue,
  options: {
    preferredIds?: readonly string[];
    signal?: AbortSignal;
    maxAttempts?: number;
    /**
     * 死条目观察口（Standards 审查第 3 条）：全死时返回 null，此时 `deadEntries`
     * 没有任何返回路径能带出去 ⇒ 调用方无法知道「N 个条目暂不可用」。
     * 这个回调让失败原因可观察；不传也能用（但那时你放弃了这份诊断）。
     */
    onDead?: (dead: readonly DeadReleaseEntry[]) => void;
  } = {},
): Promise<ResolvedRelease | null> {
  const ordered: CatalogueRelease[] = [];
  const seen = new Set<string>();
  for (const id of options.preferredIds ?? []) {
    const hit = catalogue.releases.find((r) => r.id === id);
    if (hit && !seen.has(hit.id)) {
      ordered.push(hit);
      seen.add(hit.id);
    }
  }
  for (const r of catalogue.releases) {
    if (!seen.has(r.id)) {
      ordered.push(r);
      seen.add(r.id);
    }
  }

  const deadEntries: DeadReleaseEntry[] = [];
  const limit = options.maxAttempts ?? ordered.length;

  for (const release of ordered.slice(0, limit)) {
    if (options.signal?.aborted) break;
    const result = await fetchReleaseManifest(fetchPort, release.base, options.signal);
    if (result.ok) {
      return { release, manifest: result.manifest, deadEntries };
    }
    deadEntries.push({ id: release.id, rejection: result.rejection });
  }
  // 全死：把诊断带出去，而不是让这份收集结果随 null 一起消失
  options.onDead?.(deadEntries);
  return null;
}