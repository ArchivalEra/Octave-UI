// src/modules/appContext.ts
// 全局领域服务单例与应用状态上下文：装配 EngineSupervisor、CapabilityPolicy 与 GraphicsSink
import { EngineSupervisor } from './engine/EngineSupervisor';
import { TerminalController } from './terminal/TerminalController';
import { HistoryStore } from './history/HistoryStore';
import { WorkspaceStore } from './workspace/WorkspaceStore';
import { FilesystemStore } from './filesystem/FilesystemStore';
import { ThemeManager } from './theme/ThemeManager';
import { CapabilityPolicy } from './figure/CapabilityPolicy';
import { GraphicsSink } from './figure/GraphicsSink';
import { i18n, t } from './i18n/I18nManager.svelte';

import { WorkbenchController } from './workbench/WorkbenchController';
import { VariableInspectorStore } from './inspector/VariableInspectorStore';
import { SafePlotSinkPolyfill } from './semantic/SafePlotSinkPolyfill';

export const historyStore = new HistoryStore();
export const supervisor = new EngineSupervisor();
// 兼容性别名：支持已有引用
export const engineSession = supervisor as any;

export const terminalController = new TerminalController(historyStore, supervisor as any);
export const workspaceStore = new WorkspaceStore(supervisor as any);
export const filesystemStore = new FilesystemStore(supervisor as any);
export const themeManager = new ThemeManager();
export const workbenchController = new WorkbenchController();
export const variableInspectorStore = new VariableInspectorStore();
export { i18n, t, SafePlotSinkPolyfill };

export const capabilityPolicy = new CapabilityPolicy();
export const graphicsSink = new GraphicsSink();

