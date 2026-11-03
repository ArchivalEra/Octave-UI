// src/modules/engine/laneProducts.ts
// **引擎契约**的消费侧：车道 ↔ 上游 product 的映射，唯一产地。
//
// 为什么单列一个文件（且放在 engine/ 而不是 storage/）：
//   这条映射是**引擎契约**的内容（上游 README 明写三个产品的名称与特性，
//   `release/products/{wasm32,wasm64ip,wasm64std}/` 目录名与之对应），
//   与分发契约（release 怎么传字节）、内容契约（包是什么）都正交。
//   之前它散在三处手写推断里（`isW64` / `getDefaultVariant` / variant 推导），
//   三处会各自漂——这里收成一份数据。
//
// ⚠️ 绝不能从 git 分支名推导映射：上游已删 `wasm32-final` / `IllegalPerformance`
//    分支（归档为 tag），`pins.json` 里有记录。映射是**契约事实**，不是仓库状态。

import type { EngineLane } from './EngineAssetResolver';
import type { EngineVariant } from './EngineAssetResolver';

/** 一个车道在发布契约里的身份 */
export interface LaneProduct {
  /** 上游 product 名（release manifest 的 `entry.product` 取值） */
  readonly product: string;
  /** 本仓架构档（决定 destPath 与 resolver 的 variant 面） */
  readonly variant: EngineVariant;
  /**
   * 站点静态路径的候选目录（**顺序即优先级**）。
   *
   * ⚠️ 顺序有意义（2026-11-03 修的真缺陷）：`master` / `IllegalPerformance` 的
   * **根目录** `octave.wasm` 其实是 wasm32 那份（镜像脚本把根目录复制了三份），
   * 真 w64 只在 `w64/` 子目录。旧实现的候选顺序把根目录排在前面 ⇒ w64 车道
   * 先命中 wasm32 的字节，元数据也跟着错。所以 w64 档必须**先查子目录**。
   */
  readonly siteFolders: readonly string[];
}

/**
 * 车道 → 发布身份。这是**引擎契约的单一产地**。
 *
 * product 名来源：上游 `release/products/` 的三个目录名 + README 的产品表。
 */
export const LANE_PRODUCT: Readonly<Record<EngineLane, LaneProduct>> = {
  'wasm32-final': {
    product: 'wasm32',
    variant: 'w32',
    // 单线程档：站点把三件直接放在车道根目录
    siteFolders: ['lanes/wasm32-final'],
  },
  master: {
    product: 'wasm64std',
    variant: 'w64',
    // ⚠️ w64 先看子目录（根目录那份是 wasm32 的镜像复制）
    siteFolders: ['lanes/master/w64', 'w64', 'lanes/master'],
  },
  IllegalPerformance: {
    product: 'wasm64ip',
    variant: 'w64',
    siteFolders: ['lanes/IllegalPerformance/w64', 'w64', 'lanes/IllegalPerformance'],
  },
  omc: {
    product: 'omc',
    variant: 'w32',
    siteFolders: ['omc'],
  },
};

/** Octave 三件（发布契约里每个 product 的 entry 名） */
export const OCTAVE_ARTIFACTS = ['octave.wasm', 'octave.data', 'octave.js'] as const;

/**
 * OMC 两件。
 *
 * **明确排除 `.d.ts`**：release manifest 里有 `OpenModelicaCompiler.d.ts` 与
 * `OpenModelicaCompiler_bg.wasm.d.ts`，但浏览器运行期不需要它们（它们是给
 * TypeScript 消费方用的）。下载它们等于白付字节。
 */
export const OMC_ARTIFACTS = ['OpenModelicaCompiler_bg.wasm', 'OpenModelicaCompiler.js'] as const;

/** 该车道要走 release 取的产物名（按固定顺序，保证 destPath 稳定） */
export function artifactsOfLane(lane: EngineLane): readonly string[] {
  return lane === 'omc' ? OMC_ARTIFACTS : OCTAVE_ARTIFACTS;
}

/** 全部车道（替代各处的 `['master','wasm32-final',...]` 手写数组） */
export const ALL_ENGINE_LANES: readonly EngineLane[] = ['wasm32-final', 'master', 'IllegalPerformance', 'omc'];