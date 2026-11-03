// src/modules/engine/engineReleaseSource.ts
// **引擎侧的发布契约缝**（用户 2026-11-03 裁定：「引擎契约另立缝我支持」）。
//
// 为什么另立缝而不是加宽 `ReleaseSource`：
//   · `ReleaseSource` 的语义是「**一个包 → 一个 entry**」（内容契约的 `url` 指向一个产物）；
//   · 引擎的语义是「**一个 product → N 个产物，一起成功或一起失败**」
//     （Octave 三件同属一个 product，混装不同构建会让「用户拿到什么」不可观测）；
//   · 把引擎硬塞进 `ReleaseSource` 需要伪造 `ForgePackageItem`，并让「单 entry」
//     语义压在「多件原子」上——两边的回落条件、失败语义、去重单位都不同。
//
// 与分发契约的分工（这条缝只做**定位**，不碰取字节）：
//   · 本模块：给定 lane，从 catalogue 找「该 product 的 N 个 entry」并选出变体链；
//   · `chunkAssembler`：给定 entry + variant，把字节真取回并双重校验；
//   · `DownloadStore`：把两者拼起来落盘（destPath 与既有五件套布局一致）。
//
// 内容契约在这条路上**不参与**：引擎产物不是市场包，没有 `url` 可对账；
// 定位靠**引擎契约**给的 `(product, entry.name)`（`laneProducts.ts` 唯一产地）。

import type { FetchPort } from '../storage/FetchPort';
import type { ReleaseCodec, ReleaseEntry, ReleaseVariant } from '../storage/releaseContract';
import { selectVariant } from '../storage/releaseContract';
import { fetchReleaseManifest, loadCatalogue, type Catalogue, type DeadReleaseEntry } from '../storage/releaseCatalogue';
import { detectCodecCapabilities } from '../storage/chunkAssembler';
import { LANE_PRODUCT, artifactsOfLane, type LaneProduct } from './laneProducts';
import type { EngineLane, EngineVariant } from './EngineAssetResolver';

/** 引擎一件的解析结果：entry + 主变体 + 回落链 */
export interface ResolvedEngineArtifact {
  readonly filename: string;
  readonly entry: ReleaseEntry;
  readonly variant: ReleaseVariant;
  readonly fallbacks: readonly ReleaseVariant[];
}

/**
 * 一个引擎 product 的整组解析结果。
 *
 * **原子性**：要么 N 件全齐（`artifacts.length === artifactsOfLane(lane).length`），
 * 要么 `null`。不存在「拿到 2 件」的中间态——那会让落盘出现半套引擎。
 */
export interface ResolvedEngineRelease {
  readonly lane: EngineLane;
  readonly product: string;
  readonly releaseId: string;
  readonly base: string;
  readonly artifacts: readonly ResolvedEngineArtifact[];
  /** 该 release 声明的 codecs 链（供诊断） */
  readonly codecs: readonly ReleaseCodec[];
}

/** 引擎侧发布源：缺省不注入 ⇒ 完全走站点 lanes 路径（零行为变化） */
export interface EngineReleaseSource {
  resolveEngine(lane: EngineLane, variant?: EngineVariant): Promise<ResolvedEngineRelease | null>;
}

export interface EngineReleaseSourceOptions {
  /** catalogue 地址（域名根，不在站点 base 下） */
  catalogueUrl: string;
  fetchPort: FetchPort;
  /** zstd 可用性查询（传函数则每次现问；传布尔为快照，仅测试） */
  hasZstd?: boolean | (() => boolean);
  /** 成功缓存毫秒数；失败默认不缓存（同内容侧，避免一次抖动封死） */
  catalogueTtlMs?: number;
  failureTtlMs?: number;
  /** 回落原因观察口（不静默吞） */
  onFallback?: (info: { lane: EngineLane; reason: string }) => void;
}

/**
 * 把一个 release 的 entries 按「我需要的 N 个产物名」切开。
 *
 * 判据：`entry.product === 目标 product` **且** `entry.name` 在该车道的产物清单里。
 * 缺任一件 ⇒ 返回 null（整组失败，不混装其它 product 的同名件）。
 *
 * ⚠️ 为什么要显式比 product：`octave.wasm` 在同一个 release 里出现三次
 * （wasm32 / wasm64std / wasm64ip），只按名字取会拿错构建。
 */
export function collectProductArtifacts(
  entries: readonly ReleaseEntry[],
  product: string,
  wanted: readonly string[],
): Map<string, ReleaseEntry> | null {
  const got = new Map<string, ReleaseEntry>();
  for (const e of entries) {
    if (e.product !== product) continue;
    if (!wanted.includes(e.name)) continue;
    got.set(e.name, e);
  }
  if (got.size !== wanted.length) return null;
  return got;
}

export function createCatalogueEngineReleaseSource(options: EngineReleaseSourceOptions): EngineReleaseSource {
  const successTtl = options.catalogueTtlMs ?? 30 * 60 * 1000;
  const failureTtl = options.failureTtlMs ?? 0;
  let cached: { at: number; catalogue: Catalogue | null } | null = null;

  const capabilitiesOf = (): Set<ReleaseCodec> => {
    const hz = options.hasZstd;
    return detectCodecCapabilities(typeof hz === 'function' ? hz() : hz ?? true);
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
    async resolveEngine(lane: EngineLane, variant?: EngineVariant): Promise<ResolvedEngineRelease | null> {
      const fail = (reason: string): null => {
        options.onFallback?.({ lane, reason });
        return null;
      };

      const meta: LaneProduct | undefined = LANE_PRODUCT[lane];
      if (!meta) return fail(`no lane→product mapping for "${lane}"`);
      if (variant && variant !== meta.variant) {
        // 显式要的 variant 与契约档不符 ⇒ 明说，不猜
        return fail(`lane "${lane}" is variant "${meta.variant}", not "${variant}"`);
      }

      const catalogue = await getCatalogue();
      if (!catalogue) return fail('catalogue unavailable or empty');

      const wanted = artifactsOfLane(lane);
      const capabilities = capabilitiesOf();
      const dead: DeadReleaseEntry[] = [];

      // 上游产物仓优先（与内容侧同一判据：权威产地优先）
      const ordered = [...catalogue.releases].sort((a, b) => {
        const up = /^(Octave-Full-Wasm|OpenModelica-Full-Wasm|LLVM-wasm)\//;
        return (up.test(a.id) ? 0 : 1) - (up.test(b.id) ? 0 : 1);
      });

      for (const release of ordered) {
        const loaded = await fetchReleaseManifest(options.fetchPort, release.base);
        if (!loaded.ok) {
          dead.push({ id: release.id, rejection: loaded.rejection });
          continue;
        }

        const got = collectProductArtifacts(loaded.manifest.entries, meta.product, wanted);
        if (!got) continue; // 这条 release 没有该 product 的三件 —— 不是你坏了，是没在这里发

        // 三件必须**全部**有本端可解的变体；缺一件就整组换 release，不混装
        const artifacts: ResolvedEngineArtifact[] = [];
        let incomplete = false;
        for (const filename of wanted) {
          const entry = got.get(filename)!;
          const v = selectVariant(entry, loaded.manifest.codecs, capabilities);
          if (!v) {
            incomplete = true;
            break;
          }
          const fallbacks: ReleaseVariant[] = [];
          for (const codec of loaded.manifest.codecs) {
            if (codec === v.codec) continue;
            if (!capabilities.has(codec)) continue;
            const alt = entry.variants.find((x) => x.codec === codec);
            if (alt) fallbacks.push(alt);
          }
          artifacts.push({ filename, entry, variant: v, fallbacks });
        }
        if (incomplete) continue;

        return {
          lane,
          product: meta.product,
          releaseId: release.id,
          base: release.base,
          artifacts,
          codecs: loaded.manifest.codecs,
        };
      }

      const kinds = dead.map((d) => `${d.id}:${d.rejection.kind}`).join(', ');
      return fail(
        dead.length
          ? `no live release carried product "${meta.product}" (${kinds})`
          : `no release carried product "${meta.product}" with all ${wanted.length} artifacts` +
              ` (${catalogue.releases.length} releases scanned)`
      );
    },
  };
}