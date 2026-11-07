// src/modules/engine/deployment.ts
// 统一站点资产接缝（docs/spec/unified-assets-seam.md §2.3）的**唯一 base 产地**。
//
// 在此之前 base 有 7 个产地（astro.config / Layout meta / appContext.getSiteBase /
// WasmEmbedAdapter / BrowserAssetsAdapter / DownloadStore / deploy-contract + harness
// 硬编码），各自重读 <meta site-base> 各自加工 ⇒ 三条路正交、真站编译链 404。
//
// 本模块只做一件事：把 <meta name="site-base"> 解析成冻结的 siteBase。
// laneBase 是 siteBase + 所选 EngineLane 的纯函数，不缓存、不推断页面档计划
// （__octaveLanePlan.lane 是 'base'|'w64'，与 EngineLane 不同轴，不可混用）。
//
// Interface 不变量（spec §2.2）：
//   · siteBase 与 laneBase 是两个独立值，永不合并成一个 `base` 字符串；
//   · 缺 meta 且无构建期兜底 ⇒ throw DEPLOYMENT_UNRESOLVED，绝不静默 '/'；
//   · 返回值冻结，组合根解析一次后所有消费者共用同一份。

import type { EngineLane } from './EngineAssetResolver';

/**
 * 资产**逻辑键 → tier** 的 TS 侧声明（对账器的锚点）。
 * 它不是运行时判据 —— 真正拼 URL 的是 `public/bridge/assets-loader.js` 的
 * `TIERS` + `resolve()`。这里只让 `zreflect/check_asset_tiers.py` 能核对
 * 两份语言的键集合与 tier 是否逐字一致（CONTEXT.md「对账器」）。
 * 新增站点级/车道级资产必须**两处同时加**，否则闸门红。
 */
export const ASSET_LOGICAL_KEYS = {
  'forge-catalog': 'site',
  'llvm-manifest': 'site',
  'llvm-config': 'site',
  'pkg-module-table': 'site',
  'octinc': 'site',
  'pyodide-dir': 'site',
  'forge-pack': 'site',
  'engine-manifest': 'lane',
  'engine-build': 'lane',
} as const;

export type AssetLogicalKey = keyof typeof ASSET_LOGICAL_KEYS;

export interface Deployment {
  /** 站点根，必带尾斜杠，如 `/repo/Octave/` */
  readonly siteBase: string;
  /** 默认引擎车道前缀（wasm32-final），boot 时由 bindHost 覆盖为实际 lane */
  readonly laneBase: string;
}

export class DeploymentError extends Error {
  readonly code = 'DEPLOYMENT_UNRESOLVED' as const;
  constructor() {
    super(
      'DEPLOYMENT_UNRESOLVED: <meta name="site-base"> 与 window.__siteBase 均不可用 — ' +
        '拒绝静默回落根路径（docs/spec/unified-assets-seam.md §2.2）'
    );
    this.name = 'DeploymentError';
  }
}

function readSiteBase(): string {
  if (typeof document !== 'undefined') {
    // 浏览器运行时只认这两个来源。<meta> 是 Layout.astro 唯一写入点；
    // __siteBase 是 deploy-contract.mjs 的构建期兜底信号。绝不回落到
    // import.meta.env.BASE_URL —— 那会把「meta 缺失」这个装配缺陷静默洗绿，
    // 正是 spec §2.2「DEPLOYMENT_UNRESOLVED 绝不静默 '/'」要堵的。
    const content = document
      .querySelector('meta[name="site-base"]')
      ?.getAttribute('content')
      ?.trim();
    if (content) return content;
    const fromWindow = typeof window !== 'undefined' ? (window as any).__siteBase : '';
    if (typeof fromWindow === 'string' && fromWindow.trim()) return fromWindow.trim();
    throw new DeploymentError();
  }
  // 无 document（SSR / 构建期脚本）：BASE_URL 是唯一合法来源
  if (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) {
    const b = String(import.meta.env.BASE_URL).trim();
    if (b) return b;
  }
  throw new DeploymentError();
}

/** 组合根唯一调用点。返回冻结对象，禁止就地修改。 */
export function resolveDeployment(): Deployment {
  const raw = readSiteBase();
  const siteBase = raw.endsWith('/') ? raw : `${raw}/`;
  return Object.freeze({ siteBase, laneBase: `${siteBase}lanes/wasm32-final/` });
}

let cached: Deployment | null = null;
/**
 * 惰性单例：appContext 等模块顶层不解析（vitest 的 happy-dom 没有 <meta>），
 * 真正被消费时才解析一次并冻结。生产里 meta 由 Layout.astro 在 <head> 输出，
 * DOM 就绪后才有人调它。
 */
export function getDeployment(): Deployment {
  if (!cached) cached = resolveDeployment();
  return cached;
}

/** 测试用：清掉惰性缓存（生产不调）。 */
export function resetDeploymentCache(): void {
  cached = null;
}

/** lane 级资产前缀。纯函数：同一 siteBase + 同一 lane 永远同值。 */
export function laneBaseOf(d: Deployment, lane: EngineLane): string {
  const folder = lane === 'omc' ? 'wasm32-final' : lane;
  return `${d.siteBase}lanes/${folder}/`;
}
