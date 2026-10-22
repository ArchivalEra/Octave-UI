// src/modules/appContext.ts
// 全局领域服务单例与应用状态上下文：装配 EngineSupervisor、CapabilityPolicy 与 GraphicsSink
import { EngineSupervisor } from './engine/EngineSupervisor';
import { onOmcFlavorError } from './engine/OmcBridge';
import { TerminalController } from './terminal/TerminalController';
import { HistoryStore } from './history/HistoryStore';
import { WorkspaceStore } from './workspace/WorkspaceStore';
import { FilesystemStore } from './filesystem/FilesystemStore';
import { ThemeManager } from './theme/ThemeManager';
import { CapabilityPolicy } from './figure/CapabilityPolicy';
import { GraphicsSink, wireFigureSource } from './figure/GraphicsSink';
import { i18n, t } from './i18n/I18nManager.svelte';

import { WorkbenchController } from './workbench/WorkbenchController';
import { ProjectWorkspace } from './workspace/ProjectWorkspace';
import { VariableInspectorStore } from './inspector/VariableInspectorStore';
import { SafePlotSinkPolyfill } from './semantic/SafePlotSinkPolyfill';

import { WorkspaceStorageManager } from './storage/WorkspaceStorageManager';
import { DownloadStore } from './storage/DownloadStore';
import { DockLayoutStore } from './dock/DockLayoutStore';
import { PanelRegistry, panelRegistryInstance } from './dock/PanelRegistry';
import { toastService } from './ui/ToastService.svelte';

export { toastService };

export const historyStore = new HistoryStore();
export const supervisor = new EngineSupervisor();
// 兼容性别名：支持已有引用
export const engineSession = supervisor as any;

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
export const terminalController = new TerminalController(historyStore, supervisor as any);
export const workspaceStore = new WorkspaceStore(supervisor as any);
export const filesystemStore = new FilesystemStore(supervisor as any);
export const themeManager = new ThemeManager();
export const workbenchController = new WorkbenchController();
export const variableInspectorStore = new VariableInspectorStore();
export { i18n, t, SafePlotSinkPolyfill };

export const capabilityPolicy = new CapabilityPolicy();
export const graphicsSink = new GraphicsSink();

export { pluginRegistry, pretextPlugin, searchPlugin, p5FigureOverlayPlugin, packageManagerPlugin, webMcpPlugin } from './plugins';
import { packageManagerPlugin, p5FigureOverlayPlugin } from './plugins';

packageManagerPlugin.setDownloadStore(downloadStore);

// 转发 P5 图表事件到 GraphicsSink 的 onFigure 面：面板订阅 sink 即可拿到
// {imageDataUrl,...}（evt.url 是 Blob URL——PNG 渲染就绪）。单一出口收敛为
// wireFigureSource，解绑函数留在模块级（模块生命周期 = 应用生命周期，不主动解）
wireFigureSource(p5FigureOverlayPlugin, graphicsSink);

// 启用图形外挂补丁策略：允许绘图指令出队交由原生 WebGL toolkit 处理
capabilityPolicy.setSafePolyfillActive(true);

i18n.subscribe((locale) => {
  projectWorkspace.syncLocale(locale);
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

