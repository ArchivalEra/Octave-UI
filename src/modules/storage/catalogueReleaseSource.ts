// src/modules/storage/catalogueReleaseSource.ts
// `ReleaseSource` 的生产实现：从 catalogue 现读 base → 取 manifest → 选变体。
//
// 为什么需要这一层（内容仓 099 §6.5 + Standards 审查）：`DownloadStore` 只声明了
// `ReleaseSource` 这个注入面，**没有任何实现方** ⇒ 分片路径在产物里永远走不到
// （=「能编过 ≠ 能用了」的原义）。这一层就是把它接上的那根线。
//
// 三条设计判断（每条都对应一个实测事实）：
//
// ① **base 每次从 catalogue 现读，绝不硬编码 tag**。
//    实测（2026-11-02）：上游当场删了两个 `octave-11.3.0*` release 换成
//    `octave-full-wasm-v0.1.0`；硬编码的基址立刻 404。
//
// ② **catalogue 自身有死条目，必须逐个试探**（死链容忍）。
//    同一时刻实测：catalogue 里仍是旧的两个 tag（派生滞后 6 小时），
//    其中 `octave-11.3.0` 的 manifest 是 404、`-r2` 直接连接超时，
//    而新 tag 活着。⇒ 「取第一个就开工」会全黑。
//
// ③ **解析不出就返回 null，让 DownloadStore 回落整包**。
//    派生窗口里这是**正常形态**不是错误；但「为什么没用 release」必须可观察——
//    所以失败原因走 `onFallback` 回调而不是静默吞掉（Standards 审查第 3 条）。

import type { ForgePackageItem } from '../plugins/package/types';
import type { DownloadRef } from './downloadTypes';
import type { FetchPort } from './FetchPort';
import type { ReleaseSource, ResolvedReleaseTarget } from './DownloadStore';
import type { ReleaseEntry, ReleaseVariant } from './releaseContract';
import { selectVariant } from './releaseContract';
import { loadCatalogue, resolveFirstLiveRelease, type Catalogue } from './releaseCatalogue';
import { detectCodecCapabilities } from './chunkAssembler';

export interface CatalogueReleaseSourceOptions {
  /** catalogue 的 URL（派生件；`https://isui.ren/static/catalogue.json`） */
  catalogueUrl: string;
  /** 取字节/JSON 的端口（与 DownloadStore 共用同一个 ⇒ 测试可注入 Mock） */
  fetchPort: FetchPort;
  /** 是否可解 zstd（默认：本进程能 import fzstd 就算可以；测试可覆盖） */
  hasZstd?: boolean;
  /** catalogue 缓存毫秒数（派生件 6 小时一更，缓存别太短也别太久） */
  catalogueTtlMs?: number;
  /** 解析失败/回落的观察口（生产接日志；不吞掉原因） */
  onFallback?: (info: { packageName: string; reason: string }) => void;
}

/** 包名 → 契约 entry 的 `name` 匹配规则。
 *  契约里 `entry.name` 是产物文件名（`statistics-1.7.7.tar.gz`），
 *  catalogue 包名是 `statistics`（无版本、无扩展）。所以按 `product` + 前缀匹配。 */
function matchesPackage(entry: ReleaseEntry, pkg: ForgePackageItem): boolean {
  const n = entry.name;
  if (n === pkg.name) return true;
  // `statistics-1.7.7.tar.gz` 对 `statistics`：以 `<name>-` 开头
  if (n.startsWith(`${pkg.name}-`)) return true;
  // `octave.wasm` 对包名 `octave`：以 `<name>.` 开头
  if (n.startsWith(`${pkg.name}.`)) return true;
  return false;
}

/** 版本消歧：同一包多个版本时，优先取 entry.name 里含该版本的 */
function scoreByVersion(entry: ReleaseEntry, version: string): number {
  return entry.name.includes(version) ? 1 : 0;
}

export function createCatalogueReleaseSource(options: CatalogueReleaseSourceOptions): ReleaseSource {
  const ttl = options.catalogueTtlMs ?? 30 * 60 * 1000;
  let cached: { at: number; catalogue: Catalogue | null } | null = null;

  const capabilities = detectCodecCapabilities(options.hasZstd ?? true);

  async function getCatalogue(): Promise<Catalogue | null> {
    const now = Date.now();
    if (cached && now - cached.at < ttl) return cached.catalogue;
    const catalogue = await loadCatalogue(options.fetchPort, options.catalogueUrl);
    cached = { at: now, catalogue };
    return catalogue;
  }

  return {
    async resolve(pkg: ForgePackageItem, ref: DownloadRef): Promise<ResolvedReleaseTarget | null> {
      const catalogue = await getCatalogue();
      if (!catalogue) {
        options.onFallback?.({ packageName: pkg.name, reason: 'catalogue unavailable or empty' });
        return null;
      }

      // 逐个试探到第一个活的 release（死链容忍，见文件头 ②）。
      // onDead 让「全死」时的诊断不被 null 吞掉（Standards 审查第 3 条）。
      const resolved = await resolveFirstLiveRelease(options.fetchPort, catalogue, {
        onDead: (dead) => {
          const kinds = dead.map((d) => `${d.id}:${d.rejection.kind}`).join(', ');
          options.onFallback?.({
            packageName: pkg.name,
            reason: `every catalogue entry is dead (${kinds})`,
          });
        },
      });
      if (!resolved) {
        options.onFallback?.({
          packageName: pkg.name,
          reason: `no live release among ${catalogue.releases.length} catalogue entries`,
        });
        return null;
      }

      // 在这个 release 里找该包的 entry
      const candidates = resolved.manifest.entries.filter((e) => matchesPackage(e, pkg));
      if (candidates.length === 0) {
        options.onFallback?.({
          packageName: pkg.name,
          reason: `entry not found in release ${resolved.release.id}`,
        });
        return null;
      }

      const version = ref.version || pkg.version || '';
      const sorted = [...candidates].sort((a, b) => scoreByVersion(b, version) - scoreByVersion(a, version));
      const entry = sorted[0];

      // 按契约 codecs 有序回退链选本端能解的第一个变体
      const variant = selectVariant(entry, resolved.manifest.codecs, capabilities);
      if (!variant) {
        options.onFallback?.({
          packageName: pkg.name,
          reason: `no decodable variant (capabilities: ${[...capabilities].join(',')})`,
        });
        return null;
      }

      // 把本端能解的**其余**变体按契约链顺序带出去，供运行时回落
      // （主变体取块/解码失败时依次尝试——见 chunkAssembler 的 AssembleOptions.fallbackVariants）
      const fallbacks: ReleaseVariant[] = [];
      for (const codec of resolved.manifest.codecs) {
        if (codec === variant.codec) continue;
        if (!capabilities.has(codec)) continue;
        const v = entry.variants.find((x) => x.codec === codec);
        if (v) fallbacks.push(v);
      }

      return { entry, variant, base: resolved.release.base, fallbacks };
    },
  };
}