// src/modules/appContext.ts
// 全局领域服务单例与应用状态上下文：装配 EngineSupervisor、CapabilityPolicy 与 GraphicsSink
import { EngineSupervisor } from './engine/EngineSupervisor';
import { onOmcFlavorError } from './engine/OmcBridge';
import { TerminalController } from './terminal/TerminalController';
import { HistoryStore } from './history/HistoryStore';
import { ThemeManager } from './theme/ThemeManager';
import { CapabilityPolicy } from './figure/CapabilityPolicy';
import { GraphicsSink, wireFigureSource, wireFigureBusToSink } from './figure/GraphicsSink';
import { i18n, t } from './i18n/I18nManager.svelte';

import { ProjectWorkspace } from './workspace/ProjectWorkspace';
import { VariableInspectorStore } from './inspector/VariableInspectorStore';
import { SafePlotSinkPolyfill } from './semantic/SafePlotSinkPolyfill';

import { WorkspaceStorageManager } from './storage/WorkspaceStorageManager';
import { DownloadStore } from './storage/DownloadStore';
import { createCatalogueReleaseSource } from './storage/catalogueReleaseSource';
import { createCatalogueEngineReleaseSource } from './engine/engineReleaseSource';
import { createBrowserFzstdLoader } from './storage/fzstdLoader';
import { BrowserFetchAdapter } from './storage/FetchPort';
import { EngineAssetResolver } from './engine/EngineAssetResolver';
import { DockLayoutStore } from './dock/DockLayoutStore';
import { PanelRegistry, panelRegistryInstance } from './dock/PanelRegistry';
import { toastService } from './ui/ToastService.svelte';

export { toastService };

export const historyStore = new HistoryStore();
export const supervisor = new EngineSupervisor();

export const dockLayoutStore = new DockLayoutStore();
export const panelRegistry = panelRegistryInstance;

function getSiteBase(): string {
  if (typeof document !== 'undefined') {
    const meta = document.querySelector('meta[name="site-base"]');
    const content = meta?.getAttribute('content');
    if (content) return content;
    if ((window as any).__siteBase) return (window as any).__siteBase;
  }
  if (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) {
    return import.meta.env.BASE_URL;
  }
  return '';
}

/**
 * 派生 catalogue 的绝对地址。
 *
 * ⚠️ 它**不在**站点 base 下（实测 2026-11-02）：
 *    `https://isui.ren/repo/Octave/static/catalogue.json` ⇒ **404**
 *    `https://isui.ren/static/catalogue.json`             ⇒ **200**
 * 它是全站共享的派生件（一份 catalogue 服务所有 repo），挂在**域名根**。
 * 所以要从 siteBase 里剥出 origin 再拼 `/static/catalogue.json`，
 * 不能直接 `${siteBase}/static/catalogue.json`。
 */
/**
 * catalogue 的**候选地址列表**（按序探测，第一个能用的说了算）。
 *
 * ⚠️ 为什么是列表而不是一个地址（2026-11-05 实测教训）：
 *   我原先写死 `location.origin + '/static/catalogue.json'`，并在注释里写「catalogue
 *   在域名根，与 siteBase 无关」。**今天那个地址 404 了**：
 *
 *     https://isui.ren/static/catalogue.json          ⇒ 404  ← 我曾经用的
 *     https://static.isui.ren/catalogue.json          ⇒ 200  ← 现在真的在这
 *     https://static.mango-mesa.ccwu.cc/catalogue.json ⇒ 200 ← CF 镜像（双线）
 *
 *   站点侧把静态分发挪到了独立的 `static.*` 域名（正是 `101` 里说的 EO/CF 双线）。
 *   ⇒ 写死任何单个域名都会在某天 404，而**这个错误是静默的**（拿不到 catalogue
 *     就回落整包路径，用户看不出区别，只是所有 release 收益全丢）。
 *
 *   所以：**给一组候选，按序试**。第一个 200 的说了算；全挂才回落整条路径。
 */
export function catalogueUrlCandidates(): string[] {
  const out: string[] = [];
  // ① 显式配置（构建期可注入；换域名不用改代码）
  const configured =
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.PUBLIC_CATALOGUE_URL) ||
    (typeof document !== 'undefined'
      ? document.querySelector('meta[name="catalogue-url"]')?.getAttribute('content')
      : '') ||
    (typeof window !== 'undefined' ? (window as any).__catalogueUrl : '');
  if (configured) out.push(String(configured));

  // ② 同源（若站点把 catalogue 与页面放一起；某些部署就是这样）
  const origin = typeof location !== 'undefined' && location.origin ? location.origin : '';
  if (origin) {
    out.push(`${origin}/static/catalogue.json`);
    out.push(`${origin}/catalogue.json`);
  }

  // ③ 已知的静态分发域名（EO 主 + CF 备；**顺序 = 优先级**）
  out.push('https://static.isui.ren/catalogue.json');
  out.push('https://static.mango-mesa.ccwu.cc/catalogue.json');

  // 去重（保留首现顺序）
  return [...new Set(out)];
}

/** 兼容旧调用点：返回首选项（真正取用时应当遍历 `catalogueUrlCandidates()`） */
export function deriveCatalogueUrl(_siteBase?: string): string {
  return catalogueUrlCandidates()[0] ?? '/static/catalogue.json';
}

// fzstd 加载器**单例**：两条发布缝（包 + 引擎）共享同一个实例，
// 才能保证「用户没退出网站之前，fzstd 只能拉一次」——两个 loader 会各拉一次。
const fzstdLoaderForReleases = createBrowserFzstdLoader(getSiteBase());

export const workspaceStorage = new WorkspaceStorageManager();
export const downloadStore = new DownloadStore({
  storage: workspaceStorage.store,
  baseUrl: getSiteBase(),
  catalogProvider: async () => {
    const cached = packageManagerPlugin.getCatalog();
    if (cached && Array.isArray(cached.packs) && cached.packs.length > 0) {
      return cached;
    }
    return packageManagerPlugin.getAssetsPort().fetchCatalog();
  },
  // 发布契约源（内容仓 099 / Static-Contract schema 3）：市场重写的生产接线。
  // 有这一行，`resolveSrcTarget` 才真的会走「manifest + 分片 + 逐块解压 + 两道校验」；
  // 没有它，分片分支在产物里永远走不到（只声明注入面而不接线 = 能编过不能用）。
  //
  // 解析不出（catalogue 死链窗口 / 该包未发 schema 3 / 本端解不了任何编码）
  // ⇒ resolve 返回 null ⇒ 回落整包路径。回落不是错误，是派生窗口的常态；
  // 但原因走 onFallback 出去，不静默吞。
  releaseSource: createCatalogueReleaseSource({
    // 注意：catalogue 在**域名根**，不在 siteBase 下（见 deriveCatalogueUrl 的实测注释）
    catalogueUrl: catalogueUrlCandidates(),
    fetchPort: new BrowserFetchAdapter(),
    // zstd 可用性**活查询**（内容仓 151 级别的坑：传死值会「先白下 zstd 再回落」）
    hasZstd: () => fzstdLoaderForReleases.isUsable(),
    onFallback: ({ packageName, reason }) => {
      console.warn(
        `[downloads] release contract unavailable for "${packageName}": ${reason} — falling back to whole-file path`
      );
    },
  }),

  // ★ 引擎发布缝（**另一条缝**，用户 2026-11-03：「引擎契约另立缝我支持」）。
  //   没有这一行，`resolveEngineTarget` 的 release 分支在产物里永远走不到
  //   —— Standards/Spec 两轴审查独立抓到的同一条：写了缝、写了测试、但生产不可达。
  engineReleaseSource: createCatalogueEngineReleaseSource({
    catalogueUrl: catalogueUrlCandidates(),
    fetchPort: new BrowserFetchAdapter(),
    hasZstd: () => fzstdLoaderForReleases.isUsable(),
    onFallback: ({ lane, reason }) => {
      console.warn(
        `[downloads] engine release unavailable for lane "${lane}": ${reason} — falling back to site lanes path`
      );
    },
  }),
});
export const projectWorkspace = new ProjectWorkspace(supervisor, undefined, workspaceStorage, downloadStore);

// 单例 resolver 必须与写路径同盘（候选 3 的前置条件；grilling Q6 点名「落地时要验的第一件事」）：
// workspaceStorage 自己挑 store（OPFS 可用 ⇒ OpfsStore，否则 MemoryStore），而
// EngineAssetResolver.getInstance() 无参时**也**自己挑一遍 —— 两边各自 new 一个
// MemoryStore 时，DownloadStore 写的盘与 resolver 验的盘不是同一个（对账恒 unchecked，
// 且 removeEngine 的 evict 清的是另一份盘）。生产环境两者都落到同一个 OPFS 目录句柄，
// 问题被掩盖；OPFS 不可用（隐私模式 / 非安全上下文）时才暴露。
// 这里一次性绑死：写路径、对账、evict 从此同源。
EngineAssetResolver.getInstance(workspaceStorage.store);
export const terminalController = new TerminalController(historyStore, supervisor as any);
export const themeManager = new ThemeManager();
export const variableInspectorStore = new VariableInspectorStore();
export { i18n, t, SafePlotSinkPolyfill };

export const capabilityPolicy = new CapabilityPolicy();
export const graphicsSink = new GraphicsSink();

export { pluginRegistry, pretextPlugin, searchPlugin, p5FigureOverlayPlugin, packageManagerPlugin, webMcpPlugin } from './plugins';
import { packageManagerPlugin, p5FigureOverlayPlugin, webMcpPlugin } from './plugins';

packageManagerPlugin.setDownloadStore(downloadStore);

// ★ 组合根注入 WebMCP 三服务（内容仓 095 D11 修复）：
// 此前 `plugins/index.ts` 里 `new WebMcpPlugin()` 无参，而 ctx.ts 的 require 回退在
// 浏览器产物里恒失败（typeof require === 'undefined'，D11 实测）⇒ 三个服务恒 undefined
// ⇒ 七个工具里五个线上全废（octave_eval / run_cell / list_packages / install_package /
// omc_load_msl），且被能力门包装成「正常的能力不可用」，躲过了一轮复钓。
// 在此注入：appContext 是唯一能同时看见 supervisor / projectWorkspace / packageManager
// 的地方（plugins/index 先于它求值，构造期注入会成环）；injectServices 是后置合并，
// resolveCtx 动态读取 options ⇒ 晚绑生效。
webMcpPlugin.injectServices({
  supervisor,
  projectWorkspace,
  packageManagerPlugin,
});

// 转发 P5 图表事件到 GraphicsSink 的 onFigure 面：面板订阅 sink 即可拿到
// {imageDataUrl,...}（evt.url 是 Blob URL——PNG 渲染就绪）。
// 两条通道都接（spec #19 决策 1）：
// ① 页面级总线——不绑插件实例身份，模块被求值出两个实例也不失聪（056 红线 1 的根因）；
// ② 实例内 subscribe——插件实例与这里同一个时照常工作（兼容旧路径；同一次渲染
//    两条通道都会到 sink，emitFigure 的幂等由面板状态赋值天然吸收）。
// 解绑函数留在模块级（模块生命周期 = 应用生命周期，不主动解）。
wireFigureSource(p5FigureOverlayPlugin, graphicsSink);
wireFigureBusToSink(graphicsSink);

// 启用图形外挂补丁策略：允许绘图指令出队交由原生 WebGL toolkit 处理
capabilityPolicy.setSafePolyfillActive(true);

i18n.subscribe((locale) => {
  projectWorkspace.syncLocale(locale);
  // R1（wayfinder #14）：终端错误净化跟随界面语言切换（TerminalController 内部
  // 错误通道过 ErrorSanitizer，locale 由这里单一产地下发）
  terminalController.setLocale(locale);
});

// 当引擎达到 idle 状态时，自动将工作区文件推送到 Wasm MEMFS 并配置 addpath
supervisor.onStateChange((state) => {
  if (state === 'idle') {
    void workspaceStorage.syncToEngine(supervisor);
  }
});

// OMC 附加 flavor 失败降级告知：engine 层只 throw 不碰 UI 面，
// 组合根经 onOmcFlavorError 通道订阅后呈现（双引擎模式 Octave-only 降级的唯一 UI 出口；
// 纯 omc lane 的失败走 boot reject 主链路，不进这里）。
onOmcFlavorError((err) => {
  toastService.warning(
    `OpenModelica runtime unavailable (${err?.message || err}). Running in Octave-only mode.`,
    'FLAVOR_UNAVAILABLE'
  );
});

