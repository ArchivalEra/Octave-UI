// src/modules/appContext.ts
// 全局领域服务单例与应用状态上下文
import { EngineSession } from './engine/EngineSession';
import { TerminalController } from './terminal/TerminalController';
import { HistoryStore } from './history/HistoryStore';
import { WorkspaceStore } from './workspace/WorkspaceStore';
import { FilesystemStore } from './filesystem/FilesystemStore';
import { ThemeManager } from './theme/ThemeManager';

export const historyStore = new HistoryStore();
export const engineSession = new EngineSession();
export const terminalController = new TerminalController(historyStore, engineSession);
export const workspaceStore = new WorkspaceStore(engineSession);
export const filesystemStore = new FilesystemStore(engineSession);
export const themeManager = new ThemeManager();
