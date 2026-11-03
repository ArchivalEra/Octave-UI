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
import {
  fetchReleaseManifest,
  loadCatalogue,
  orderByAuthority,
  type Catalogue,
  type DeadReleaseEntry,
} from '../storage/releaseCatalogue';
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

/**
 * 把「某 release 里属于该 product 的 entry 集」变成「N 件变体链」。
 *
 * 抽成具名函数（deepening 2026-11-03）：原本这是三层嵌套（release 循环 → 件循环 →
 * codec 循环）挤在 `resolveEngine` 里，7 处深嵌套。抽出来后每层只做一件事：
 *   release 循环 = 死链容忍；本函数 = 「这一组件能不能整组装配」；codec 循环 = 选变体。
 *
 * **原子性**：任一件没有本端可解的变体 ⇒ 返回 null（整组不合格），
 * 由调用方换下一条 release —— 绝不返回「2 件可用」的半套。
 */
function buildArtifactChain(
  got: Map<string, ReleaseEntry>,
  wanted: readonly string[],
  codecs: readonly ReleaseCodec[],
  capabilities: ReadonlySet<ReleaseCodec>,
): ResolvedEngineArtifact[] | null {
  const artifacts: ResolvedEngineArtifact[] = [];
  for (const filename of wanted) {
    const entry = got.get(filename)!;
    const variant = selectVariant(entry, codecs, capabilities);
    if (!variant) return null; // 该件无本端可解编码 ⇒ 整组不合格
    const fallbacks: ReleaseVariant[] = [];
    for (const codec of codecs) {
      if (codec === variant.codec || !capabilities.has(codec)) continue;
      const alt = entry.variants.find((x) => x.codec === codec);
      if (alt) fallbacks.push(alt);
    }
    artifacts.push({ filename, entry, variant, fallbacks });
  }
  return artifacts;
}

export function createCatalogueEngineReleaseSource(options: EngineReleaseSourceOptions): EngineReleaseSource {
  const successTtl = options.catalogueTtlMs ?? 30 * 60 * 1000;
  const failureTtl = options.failureTtlMs ?? 0;
  let cached: { at: number; catalogue: Catalogue | null } | null = null;

  /**
   * 能力集**每次现算**。
   *
   * ⚠️ 默认值是 `false`（不是 `true`）—— Standards 审查第 3 条抓到的回归：
   * 我之前抄了 `hz ?? true`，而内容侧 `catalogueReleaseSource` 已明确记着
   * 「`hasZstd ?? true` 是**谎言**」：fzstd 是懒加载的，调用方不传就意味着
   * 「本端还没确认能解 zstd」；默认 true 会让它每次都先白下 zstd 分片再回落 gzip。
   *
   * 调用方应当传**活查询**（`() => loader.isUsable()`）；不传 = 不信 zstd，
   * 走 gzip（多下约 27%，但一定能跑）。
   */
  const capabilitiesOf = (): Set<ReleaseCodec> => {
    const hz = options.hasZstd;
    return detectCodecCapabilities(typeof hz === 'function' ? hz() : hz ?? false);
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

      // 上游产物仓优先（与内容侧**共用同一个** orderByAuthority —— 唯一产地）
      const ordered = orderByAuthority(catalogue.releases);

      for (const release of ordered) {
        const loaded = await fetchReleaseManifest(options.fetchPort, release.base);
        if (!loaded.ok) {
          dead.push({ id: release.id, rejection: loaded.rejection });
          continue;
        }

        const got = collectProductArtifacts(loaded.manifest.entries, meta.product, wanted);
        if (!got) continue; // 这条 release 没发该 product 的整套件 —— 换下一条

        // 整组装配（缺件/无解编码 ⇒ null ⇒ 换下一条 release，不混装）
        const artifacts = buildArtifactChain(got, wanted, loaded.manifest.codecs, capabilities);
        if (!artifacts) continue;

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