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
import type { ReleaseManifest } from './releaseContract';
import { parseManifest, type ManifestLoadResult, type ManifestRejection } from './releaseContract';

/** catalogue 里的一个 release 条目（派生件，字段随 Static-Contract 演进） */
export interface CatalogueRelease {
  readonly id: string;
  readonly base: string;
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
export async function loadCatalogue(fetchPort: FetchPort, url: string, signal?: AbortSignal): Promise<Catalogue | null> {
  try {
    const raw = await fetchPort.fetchJSON<unknown>(url, { signal });
    return parseCatalogue(raw);
  } catch {
    return null;
  }
}

/**
 * 取一个 release 的 manifest，失败返回结构化原因（不 throw——死链是常态，不是异常）。
 *
 * ⚠️ catalogue 的 `manifest_sha256` **本层不做校验**（如实说明，不假装做了）：
 * 它证明「我拿到的是派生件记的那份 manifest」，但派生滞后期间新 tag 的 manifest
 * 还不该被旧 sha 判死——所以它只作为**诊断信号**被 `CatalogueRelease` 带出来，
 * 供上层决定是否使用。这里只解析、不比对；要校验是调用方的事，
 * 写「校验但不阻断」而实际没有比对代码，就是声称与实存不符。
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
): Promise<ManifestLoadResult> {
  // base 拼接的唯一产地：与 chunkAssembler.chunkUrl 同形（base 末尾补 / 再拼裸名）
  const url = `${base.endsWith('/') ? base : `${base}/`}manifest.json`;
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