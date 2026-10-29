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

