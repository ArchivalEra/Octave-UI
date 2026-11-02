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
//    catalogue 实测 18 条，id 形如 `<repo>/<product>-<name>-<version>`：
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
import { selectVariant } from './releaseContract';
import { fetchReleaseManifest, loadCatalogue } from './releaseCatalogue';
import type { Catalogue, CatalogueRelease, DeadReleaseEntry } from './releaseCatalogue';
import { detectCodecCapabilities } from './chunkAssembler';

export interface CatalogueReleaseSourceOptions {
  /** catalogue 的 URL（派生件；在**域名根**，不在站点 base 下——见 deriveCatalogueUrl） */
  catalogueUrl: string;
  /** 取字节/JSON 的端口（与 DownloadStore 共用同一个 ⇒ 测试可注入 Mock） */
  fetchPort: FetchPort;
  /** 是否可解 zstd（默认假定可以；测试可覆盖） */
  hasZstd?: boolean;
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
  /** 解析失败/回落的观察口（生产接日志；不吞掉原因） */
  onFallback?: (info: { packageName: string; reason: string }) => void;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * catalogue 的 release id 是否「可能就是承载这个包的 release」。
 *
 * 实测 id 形状：`<repo>/<product>-<name>-<version>`，例如
 *   Octave-Extra-Content/forge-statistics-1.7.7  ← 包名 statistics
 *   Octave-Full-Wasm/octave-full-wasm-v0.1.0     ← product octave
 *
 * ⚠️ 这是**宽松筛选**，不是权威匹配：筛出候选后仍要打开 manifest 按 entry 名核。
 * 宽松是对的——漏掉一条真 release 比多打开一份 manifest 代价大得多。
 */
export function releaseIdMatchesPackage(releaseId: string, pkg: ForgePackageItem): boolean {
  const tail = releaseId.includes('/') ? releaseId.slice(releaseId.lastIndexOf('/') + 1) : releaseId;
  const name = pkg.name;
  if (!name) return false;
  const esc = escapeRe(name);
  return new RegExp(`(^|[-_])${esc}($|[-_])`).test(tail);
}

/** 包名 → manifest entry 的 name 匹配（entry 名是产物文件名） */
function matchesPackage(entry: ReleaseEntry, pkg: ForgePackageItem): boolean {
  const n = entry.name;
  if (n === pkg.name) return true;
  if (n.startsWith(`${pkg.name}-`)) return true;
  if (n.startsWith(`${pkg.name}.`)) return true;
  return false;
}

/** 同一包多个版本时优先取 entry.name 里含该版本的 */
function pickBestVersion(hits: ReleaseEntry[], version: string): ReleaseEntry {
  const scored = hits.map((e) => ({ e, s: version && e.name.includes(version) ? 1 : 0 }));
  scored.sort((a, b) => b.s - a.s);
  return scored[0].e;
}

/**
 * 在一批候选 release 里找第一个「manifest 活着且真有这个包 entry」的。
 *
 * 抽成具名函数（deepening 2026-11-03）：原本这段嵌在 `resolve` 里，与
 * 「筛候选 / 选变体 / 组回落链」挤在一起，让 resolve 有 5 层深嵌套。
 * 现在它自己是一个可读的循环：死链跳过、无 entry 跳过、命中即返回。
 *
 * 返回 `dead` 是为了让调用方能如实说出「N 条候选里这些是死的」——
 * 诊断信息不许随 null 消失。
 */
async function firstLiveCandidateWithEntry(
  fetchPort: FetchPort,
  candidates: readonly CatalogueRelease[],
  pkg: ForgePackageItem,
  version: string,
): Promise<{
  hit: { entry: ReleaseEntry; base: string; codecs: readonly ReleaseCodec[] } | null;
  dead: DeadReleaseEntry[];
}> {
  const dead: DeadReleaseEntry[] = [];
  for (const release of candidates) {
    const loaded = await fetchReleaseManifest(fetchPort, release.base);
    if (!loaded.ok) {
      dead.push({ id: release.id, rejection: loaded.rejection });
      continue;
    }
    const entries = loaded.manifest.entries.filter((e) => matchesPackage(e, pkg));
    if (entries.length === 0) continue;
    return {
      hit: { entry: pickBestVersion(entries, version), base: release.base, codecs: loaded.manifest.codecs },
      dead,
    };
  }
  return { hit: null, dead };
}

/**
 * 按契约 codecs 链给出「主变体 + 本端能解的其余变体」。
 *
 * 回落链的意义在 chunkAssembler 里兑现（运行时失败才换下一个）；
 * 这里只负责按契约顺序**列出**候选，不预判哪个会失败。
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

  const capabilities = detectCodecCapabilities(options.hasZstd ?? true);

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

      const catalogue = await getCatalogue();
      if (!catalogue) return fail('catalogue unavailable or empty');

      // ③ 每个包有自己的 release ⇒ 先按包名筛候选
      const candidates = catalogue.releases.filter((r) => releaseIdMatchesPackage(r.id, pkg));
      if (candidates.length === 0) {
        return fail(`no catalogue release looks like it carries "${pkg.name}" (${catalogue.releases.length} entries scanned)`);
      }

      // ② 候选里做死链容忍（内部 seam：firstLiveCandidateWithEntry）
      const version = ref.version || pkg.version || '';
      const { hit, dead } = await firstLiveCandidateWithEntry(options.fetchPort, candidates, pkg, version);
      if (!hit) {
        const kinds = dead.map((d) => `${d.id}:${d.rejection.kind}`).join(', ');
        return fail(
          dead.length
            ? `every candidate release for "${pkg.name}" is dead (${kinds})`
            : `no candidate release had an entry for "${pkg.name}"`
        );
      }

      // 按契约 codecs 链给出主变体 + 回落链（内部 seam：pickVariantChain）
      const chain = pickVariantChain(hit.entry, hit.codecs, capabilities);
      if (!chain) return fail(`no decodable variant (capabilities: ${[...capabilities].join(',')})`);

      return { entry: hit.entry, variant: chain.variant, base: hit.base, fallbacks: chain.fallbacks };
    },
  };
}
