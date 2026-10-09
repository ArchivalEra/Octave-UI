// src/modules/workspace/ProjectWorkspace.ts
// 统一深层领域模块：整合引擎会话、工作区变量、本地目录与 Octave %% 原生分节解析

import type { EngineSupervisor } from '../engine/EngineSupervisor';
import type { EngineLane, WorkspaceVariable, EvalResult } from '../engine/types';
import type { DirectoryAdapter, FileEntry } from './DirectoryAdapter';
import { FSAccessDirectoryAdapter, VirtualMemoryDirectoryAdapter } from './DirectoryAdapter';
import { OctaveCellParser, type ParsedCell } from './OctaveCellParser';
import { SemanticResultRenderer, type SemanticResult } from '../semantic/SemanticResultRenderer';
import { SafePlotSinkPolyfill } from '../semantic/SafePlotSinkPolyfill';
import type { WorkspaceStorageManager } from '../storage/WorkspaceStorageManager';

export type WorkbenchMode = 'notebook' | 'terminal';

export interface ProjectCell {
  id: string;
  title: string;
  description: string;
  code: string;
  status: 'idle' | 'running' | 'success' | 'error' | 'aborted';
  executionCount?: number | null;
  streamingOutput?: string;
  result?: SemanticResult;
  durationMs?: number;
}

export interface WorkspaceSnapshot {
  id: string;
  name: string;
  timestamp: number;
  variables: WorkspaceVariable[];
  description?: string;
}

export type ProjectWorkspaceListener = () => void;

export function getDefaultScript(locale?: string): string {
  const norm = (locale || '').toLowerCase();
  if (norm.startsWith('en')) {
    return `%% Welcome to Octave Web
% Client-side scientific computing workbench, native GNU Octave 11.3.0 support
% Organize script with %% sections, 100% compatible with native Octave/MATLAB
A = [1, 2; 3, 4];
b = [5; 6];
x = A \\ b
`;
  }
  if (norm.startsWith('de')) {
    return `%% Willkommen bei Octave Web
% Clientseitige wissenschaftliche Arbeitsumgebung mit GNU Octave 11.3.0
% Skripte mit %% Abschnitten gliedern, 100% kompatibel mit nativem Octave/MATLAB
A = [1, 2; 3, 4];
b = [5; 6];
x = A \\ b
`;
  }
  return `%% 欢迎使用 Octave Web
% 纯客户端科学计算工作台，原生支持 GNU Octave 11.3.0
% 脚本以官方 %% 规范分节存储，与本地 Octave/MATLAB 100% 兼容
A = [1, 2; 3, 4];
b = [5; 6];
x = A \\ b
`;
}

const STORAGE_KEY_SNAPSHOTS = 'octave_workspace_snapshots';

export class ProjectWorkspace {
  private _mode: WorkbenchMode = 'notebook';
  private _activeFile: string | null = 'untitled.m';
  private _cells: ProjectCell[] = [];
  private _activeCellId: string | null = null;
  private _variables: WorkspaceVariable[] = [];
  private _files: FileEntry[] = [];
  private _snapshots: WorkspaceSnapshot[] = [];
  private _executionCounter = 0;
  private _isRunning = false;
  private _listeners: Set<ProjectWorkspaceListener> = new Set();
  private _cellSeq = 0;

  private _supervisor: EngineSupervisor;
  private _dirAdapter: DirectoryAdapter;
  private _storageManager?: WorkspaceStorageManager;

  constructor(
    supervisor: EngineSupervisor,
    dirAdapter?: DirectoryAdapter,
    storageManager?: WorkspaceStorageManager
  ) {
    this._supervisor = supervisor;
    this._storageManager = storageManager;
    this._dirAdapter = dirAdapter ?? (
      typeof window !== 'undefined'
        ? new FSAccessDirectoryAdapter()
        : new VirtualMemoryDirectoryAdapter()
    );

    if (this._storageManager) {
      this._storageManager.subscribe(() => {
        void this.refreshFiles();
      });
    }

    // 监听引擎变量更新
    this._supervisor.onWorkspaceUpdate((vars) => {
      this._variables = vars;
      this._notify();
    });

    // 加载快照
    this._loadSnapshots();

    // 初始化默认分节
    this._initDefaultScript();

    // 如果是浏览器环境且未传入 storageManager，静默尝试恢复之前的目录句柄
    if (!this._storageManager && this._dirAdapter instanceof FSAccessDirectoryAdapter) {
      void this._dirAdapter.restorePreviousSession().then((restored) => {
        if (restored) {
          void this.refreshFiles();
        }
      });
    }
  }

  // --- 状态访问器 ---

  get mode(): WorkbenchMode {
    return this._mode;
  }

  get activeLane(): EngineLane {
    return this._supervisor.currentLane;
  }

  get activeFile(): string | null {
    return this._activeFile;
  }

  get isEngineReady(): boolean {
    return this._supervisor.isReady;
  }

  get isDirectoryMounted(): boolean {
    return this._storageManager ? this._storageManager.isMounted : this._dirAdapter.isMounted;
  }

  get directoryName(): string | null {
    if (this._storageManager) {
      return this._storageManager.storageType === 'opfs' ? 'OPFS 浏览器沙箱' : '内存工作区';
    }
    return this._dirAdapter.directoryName;
  }

  get storageManager(): WorkspaceStorageManager | undefined {
    return this._storageManager;
  }

  get variables(): WorkspaceVariable[] {
    return [...this._variables];
  }

  get files(): FileEntry[] {
    if (this._storageManager) {
      return this._storageManager.entries.map((e) => ({
        name: e.path,
        kind: (e.kind === 'dir' ? 'directory' : 'file') as 'directory' | 'file',
        size: e.size,
      }));
    }
    return [...this._files];
  }

  get cells(): ProjectCell[] {
    return [...this._cells];
  }

  get activeCellId(): string | null {
    return this._activeCellId;
  }

  get isRunning(): boolean {
    return this._isRunning;
  }

  get snapshots(): WorkspaceSnapshot[] {
    return [...this._snapshots];
  }

  get supervisor(): EngineSupervisor {
    return this._supervisor;
  }

  // --- 模式与后端 Lane 切换 ---

  setMode(mode: WorkbenchMode): void {
    if (this._mode !== mode) {
      this._mode = mode;
      this._notify();
    }
  }

  async switchLane(lane: EngineLane): Promise<void> {
    if (this._supervisor.state !== 'unloaded') {
      console.warn(`[ProjectWorkspace] 计算已启动 (状态: ${this._supervisor.state})，禁止切换引擎车道`);
      return;
    }
    this._supervisor.setLane(lane);
    this._activeLane = lane;
    this._notify();
  }

  selectLane(lane: EngineLane): void {
    if (this._supervisor.state !== 'unloaded') {
      console.warn(`[ProjectWorkspace] 计算已启动 (状态: ${this._supervisor.state})，禁止切换引擎车道`);
      return;
    }
    this._supervisor.setLane(lane);
    this._activeLane = lane;
    this._notify();
  }

  stopEngine(): void {
    this._supervisor.stop();
    this._variables = [];
    this._notify();
  }

  // --- 本地目录与工作区文件管理 ---

  async syncFilesToEngine(): Promise<void> {
    if (this._storageManager) {
      await this._storageManager.syncToEngine(this._supervisor);
      return;
    }

    if (!this._dirAdapter.isMounted || !this._supervisor.isReady) {
      return;
    }
    const adapter = this._supervisor.adapter;
    if (!adapter || !adapter.fs) return;

    try {
      const files = await this._dirAdapter.list();
      for (const file of files) {
        if (file.kind === 'file') {
          try {
            const content = await this._dirAdapter.readText(file.name);
            adapter.fs.write(file.name, content);
            try {
              adapter.fs.write(`/home/web_user/${file.name}`, content);
            } catch {}
          } catch {}
        }
      }
    } catch {}
  }

  async mountLocalDirectory(): Promise<boolean> {
    if (this._storageManager) {
      const count = await this._storageManager.importFromPicker();
      if (count > 0 || this._storageManager.isMounted) {
        await this.refreshFiles();
        if (this._storageManager.activeFile) {
          await this.openFile(this._storageManager.activeFile);
        } else {
          this._initDefaultScript();
          this._activeFile = 'untitled.m';
          await this.saveActiveFile();
        }
        await this.syncFilesToEngine();
        this._notify();
        return true;
      }
      return false;
    }

    const success = await this._dirAdapter.mount();
    if (success) {
      await this.refreshFiles();
      // 如果目录内已有 .m 脚本，自动加载第一个；否则重置为当前 untitled.m 并保存
      const mFiles = this._files.filter((f) => f.kind === 'file' && f.name.endsWith('.m'));
      if (mFiles.length > 0) {
        await this.openFile(mFiles[0].name);
      } else {
        this._initDefaultScript();
        this._activeFile = 'untitled.m';
        await this.saveActiveFile();
      }
      await this.syncFilesToEngine();
      this._notify();
    }
    return success;
  }

  async reselectDirectory(): Promise<boolean> {
    return await this.mountLocalDirectory();
  }

  disconnectDirectory(): void {
    if (this._storageManager) {
      void this._storageManager.clearWorkspace();
      this._files = [];
      this._activeFile = null;
      this._notify();
      return;
    }

    this._dirAdapter.disconnect();
    this._files = [];
    this._activeFile = null;
    this._notify();
  }

  async refreshFiles(): Promise<FileEntry[]> {
    if (this._storageManager) {
      await this._storageManager.refresh();
      this._files = this.files;
      this._notify();
      return this._files;
    }

    if (!this._dirAdapter.isMounted) {
      this._files = [];
      return [];
    }
    this._files = await this._dirAdapter.list();
    this._notify();
    return this._files;
  }

  // --- 原生 .m 文件管理 ---

  async openFile(filename: string): Promise<void> {
    let content: string;
    if (this._storageManager) {
      content = await this._storageManager.readText(filename);
    } else {
      if (!this._dirAdapter.isMounted) return;
      content = await this._dirAdapter.readText(filename);
    }

    const parsed = OctaveCellParser.parse(content);
    this._cells = parsed.map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      code: p.code,
      status: 'idle',
      executionCount: null,
      streamingOutput: '',
    }));

    this._activeFile = filename;
    this._activeCellId = this._cells[0]?.id || null;
    this._notify();
  }

  async saveActiveFile(contentOverride?: string): Promise<void> {
    const targetFile = this._activeFile || 'untitled.m';
    let textToSave: string;

    if (contentOverride !== undefined) {
      textToSave = contentOverride;
      const parsed = OctaveCellParser.parse(textToSave);
      this._cells = parsed.map((p) => ({
        id: p.id,
        title: p.title,
        description: p.description,
        code: p.code,
        status: 'idle',
        executionCount: null,
        streamingOutput: '',
      }));
    } else {
      textToSave = OctaveCellParser.serialize(
        this._cells.map((c) => ({
          id: c.id,
          title: c.title,
          description: c.description,
          code: c.code,
        }))
      );
    }

    if (this._storageManager) {
      await this._storageManager.writeFile(targetFile, textToSave);
      await this.refreshFiles();
      await this.syncFilesToEngine();
    } else if (this._dirAdapter.isMounted) {
      await this._dirAdapter.writeText(targetFile, textToSave);
      await this.refreshFiles();
      await this.syncFilesToEngine();
    }
    this._notify();
  }

  async createFile(filename: string, initialContent?: string): Promise<void> {
    const defaultContent =
      initialContent ??
      `%% 主小节\n% 脚本: ${filename}\ndisp("正在运行 ${filename}");\n`;

    if (this._storageManager) {
      await this._storageManager.writeFile(filename, defaultContent);
      await this.refreshFiles();
      await this.syncFilesToEngine();
    } else if (this._dirAdapter.isMounted) {
      await this._dirAdapter.writeText(filename, defaultContent);
      await this.refreshFiles();
      await this.syncFilesToEngine();
    }

    this._activeFile = filename;
    const parsed = OctaveCellParser.parse(defaultContent);
    this._cells = parsed.map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      code: p.code,
      status: 'idle',
      executionCount: null,
      streamingOutput: '',
    }));
    this._activeCellId = this._cells[0]?.id || null;
    this._notify();
  }

  async deleteFile(filename: string): Promise<void> {
    if (this._storageManager) {
      await this._storageManager.deleteEntry(filename);
      if (this._activeFile === filename) {
        const remaining = await this.refreshFiles();
        const nextM = remaining.find((f) => f.kind === 'file' && f.name.endsWith('.m'));
        if (nextM) {
          await this.openFile(nextM.name);
        } else {
          this._initDefaultScript();
        }
      } else {
        await this.refreshFiles();
      }
      return;
    }

    if (!this._dirAdapter.isMounted) return;
    await this._dirAdapter.remove(filename);
    if (this._activeFile === filename) {
      const remaining = await this.refreshFiles();
      const nextM = remaining.find((f) => f.kind === 'file' && f.name.endsWith('.m'));
      if (nextM) {
        await this.openFile(nextM.name);
      } else {
        this._initDefaultScript();
      }
    } else {
      await this.refreshFiles();
    }
  }

  async deleteLocalFile(filename: string): Promise<void> {
    await this.deleteFile(filename);
  }

  // --- 单元格生命周期管理 ---

  addCell(code = '', title = '', afterId?: string): ProjectCell {
    const newCell: ProjectCell = {
      id: `cell_${++this._cellSeq}_${Date.now().toString(36)}`,
      title: title || `Section ${this._cells.length + 1}`,
      description: '',
      code,
      status: 'idle',
      executionCount: null,
      streamingOutput: '',
    };

    if (!afterId) {
      this._cells.push(newCell);
    } else {
      const idx = this._cells.findIndex((c) => c.id === afterId);
      if (idx === -1) {
        this._cells.push(newCell);
      } else {
        this._cells.splice(idx + 1, 0, newCell);
      }
    }

    this._activeCellId = newCell.id;
    void this._autoSave();
    this._notify();
    return newCell;
  }

  deleteCell(id: string): boolean {
    if (this._cells.length <= 1) {
      const cell = this._cells[0];
      cell.code = '';
      cell.title = 'Section 1';
      cell.description = '';
      cell.status = 'idle';
      cell.executionCount = null;
      cell.streamingOutput = '';
      cell.result = undefined;
      void this._autoSave();
      this._notify();
      return true;
    }

    const idx = this._cells.findIndex((c) => c.id === id);
    if (idx === -1) return false;

    this._cells.splice(idx, 1);
    if (this._activeCellId === id) {
      const nextIdx = Math.max(0, idx - 1);
      this._activeCellId = this._cells[nextIdx]?.id || null;
    }

    void this._autoSave();
    this._notify();
    return true;
  }

  updateCellCode(id: string, code: string): void {
    const cell = this._cells.find((c) => c.id === id);
    if (cell && cell.code !== code) {
      cell.code = code;
      void this._autoSave();
      this._notify();
    }
  }

  updateCellTitle(id: string, title: string): void {
    const cell = this._cells.find((c) => c.id === id);
    if (cell && cell.title !== title) {
      cell.title = title;
      void this._autoSave();
      this._notify();
    }
  }

  updateCellDescription(id: string, description: string): void {
    const cell = this._cells.find((c) => c.id === id);
    if (cell && cell.description !== description) {
      cell.description = description;
      void this._autoSave();
      this._notify();
    }
  }

  setActiveCell(id: string | null): void {
    this._activeCellId = id;
    this._notify();
  }

  clearCells(): void {
    this._initDefaultScript();
  }

  // --- 执行双态性 (Notebook 单元格 & 终端 REPL) ---

  async executeCell(id: string): Promise<EvalResult> {
    const cell = this._cells.find((c) => c.id === id);
    if (!cell) throw new Error(`Cell not found: ${id}`);

    if (this._isRunning) {
      return { ok: false, rc: -1, output: 'Another execution is in progress' };
    }

    this._isRunning = true;
    cell.status = 'running';
    cell.streamingOutput = '';
    cell.result = undefined;
    this._notify();

    const startTime = Date.now();

    // 引擎未就绪则启动
    if (this._supervisor.state === 'unloaded') {
      try {
        await this._supervisor.boot();
        await this.syncFilesToEngine();
      } catch (err: any) {
        cell.status = 'error';
        cell.streamingOutput = `引擎启动失败: ${err?.message || err}`;
        cell.result = SemanticResultRenderer.parse(cell.streamingOutput, { ok: false });
        this._isRunning = false;
        this._notify();
        return { ok: false, rc: -1, output: cell.streamingOutput };
      }
    }

    // 安装绘图影子管线
    SafePlotSinkPolyfill.install(this._supervisor);

    const unsubOut = this._supervisor.onOutput((chunk) => {
      cell.streamingOutput = (cell.streamingOutput || '') + chunk;
      // 保持结果与流式输出响应式同步，防止分块输出延迟导致结果卡在残缺状态
      if (cell.status === 'running' || cell.status === 'success') {
        cell.result = SemanticResultRenderer.parse(cell.streamingOutput, {
          ok: cell.status !== 'error',
          rc: 0,
        });
      }
      this._notify();
    });
    const unsubErr = this._supervisor.onError((err) => {
      cell.streamingOutput = (cell.streamingOutput ? cell.streamingOutput + '\n' : '') + err;
      this._notify();
    });

    try {
      const evalRes = await this._supervisor.eval(cell.code);
      // 等待 DOM MutationObserver 与引擎 stdout 缓冲完全沉降
      await new Promise((resolve) => setTimeout(resolve, 60));
      this._supervisor._flushBufferedOutput();
      const durationMs = Date.now() - startTime;

      let plotData = null;
      if (
        cell.code.includes('plot') ||
        (cell.streamingOutput && cell.streamingOutput.includes('[OCTAVE_WEB_PLOT:'))
      ) {
        plotData = await SafePlotSinkPolyfill.extractPlotData(this._supervisor);
      }

      cell.executionCount = ++this._executionCounter;
      cell.durationMs = durationMs;
      cell.status = evalRes.ok ? 'success' : 'error';
      cell.result = SemanticResultRenderer.parse(cell.streamingOutput || evalRes.output || '', {
        ok: evalRes.ok,
        rc: evalRes.rc,
        plotData,
      });

      await this.syncVariables();
      void this._autoSave();
      return evalRes;
    } catch (err: any) {
      cell.status = 'error';
      const msg = err?.message || String(err);
      if (!cell.streamingOutput) cell.streamingOutput = msg;
      cell.result = SemanticResultRenderer.parse(cell.streamingOutput, { ok: false });
      return { ok: false, rc: -1, output: msg };
    } finally {
      unsubOut();
      unsubErr();
      this._isRunning = false;
      this._notify();
    }
  }

  async executeAll(supervisor?: EngineSupervisor): Promise<void> {
    for (const cell of this._cells) {
      if (cell.code.trim()) {
        await this.executeCell(cell.id);
      }
    }
  }

  async executeCommand(cmd: string): Promise<EvalResult> {
    if (this._supervisor.state === 'unloaded') {
      await this._supervisor.boot();
    }
    const res = await this._supervisor.eval(cmd);
    await this.syncVariables();
    return res;
  }

  async clearWorkspace(): Promise<void> {
    if (this._supervisor.isReady) {
      await this._supervisor.eval('clear -all;');
      await this.syncVariables();
    } else {
      this._variables = [];
      this._notify();
    }
  }

  async syncVariables(): Promise<WorkspaceVariable[]> {
    if (this._supervisor.isReady) {
      try {
        this._variables = await this._supervisor.getWorkspace();
      } catch {
        // Ignored if engine busy
      }
    }
    this._notify();
    return this._variables;
  }

  // --- 订阅机制 ---

  subscribe(listener: ProjectWorkspaceListener): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  private _notify(): void {
    for (const listener of this._listeners) {
      try {
        listener();
      } catch {}
    }
  }

  private async _autoSave(): Promise<void> {
    if (this._dirAdapter.isMounted && this._activeFile) {
      try {
        const text = OctaveCellParser.serialize(
          this._cells.map((c) => ({
            id: c.id,
            title: c.title,
            description: c.description,
            code: c.code,
          }))
        );
        await this._dirAdapter.writeText(this._activeFile, text);
      } catch {}
    }
  }

  syncLocale(locale: string): void {
    const knownTitles = [
      '欢迎使用 Octave Web',
      'Welcome to Octave Web',
      'Willkommen bei Octave Web',
    ];
    const targetTitle =
      locale === 'zh-Hans'
        ? '欢迎使用 Octave Web'
        : locale === 'de'
        ? 'Willkommen bei Octave Web'
        : 'Welcome to Octave Web';

    const targetDesc =
      locale === 'zh-Hans'
        ? '纯客户端科学计算工作台，原生支持 GNU Octave 11.3.0\n脚本以官方 %% 规范分节存储，与本地 Octave/MATLAB 100% 兼容'
        : locale === 'de'
        ? 'Clientseitige wissenschaftliche Plattform mit GNU Octave 11.3.0\nSkripte in offiziellen %%-Abschnitten gespeichert, 100% kompatibel mit lokalem Octave/MATLAB'
        : 'Client-side scientific computing workbench powered by GNU Octave 11.3.0\nScripts stored with official %% sections, 100% compatible with local Octave/MATLAB';

    if (this._isPristineScript()) {
      this._initDefaultScript(locale);
    } else {
      // 检查当前单元格中是否有未自定义的默认小节标题或描述，有则更新为目标语言
      let changed = false;
      for (const cell of this._cells) {
        if (knownTitles.includes(cell.title.trim())) {
          cell.title = targetTitle;
          changed = true;
        }
        if (
          cell.description.includes('GNU Octave 11.3.0') ||
          cell.description.includes('Octave/MATLAB')
        ) {
          cell.description = targetDesc;
          changed = true;
        }
      }
      if (changed) {
        this._notify();
      }
    }
  }

  private _isPristineScript(): boolean {
    if (this._cells.length !== 1) return false;
    const c = this._cells[0];
    const defaultCodes = [
      'A = [1, 2; 3, 4];\nb = [5; 6];\nx = A \\ b',
      'A = [1, 2; 3, 4];\nb = [5; 6];\nx = A \\ b\n',
    ];
    return defaultCodes.includes(c.code.trim());
  }

  private _initDefaultScript(locale?: string): void {
    const loc = locale || (typeof document !== 'undefined' ? document.documentElement.lang : 'zh-Hans');
    const parsed = OctaveCellParser.parse(getDefaultScript(loc));
    this._cells = parsed.map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      code: p.code,
      status: 'idle',
      executionCount: null,
      streamingOutput: '',
    }));
    this._activeCellId = this._cells[0]?.id || null;
    this._notify();
  }

  // --- 快照与格式辅助方法 (深度兼容) ---

  private _loadSnapshots(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY_SNAPSHOTS);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) this._snapshots = parsed;
      }
    } catch {}
  }

  private _persistSnapshots(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY_SNAPSHOTS, JSON.stringify(this._snapshots));
    } catch {}
  }

  saveSnapshot(name: string, description?: string): WorkspaceSnapshot {
    const id = `snap_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const snapshot: WorkspaceSnapshot = {
      id,
      name: name.trim() || `快照 ${new Date().toLocaleTimeString()}`,
      timestamp: Date.now(),
      variables: [...this._variables],
      description,
    };

    const existingIndex = this._snapshots.findIndex((s) => s.name === snapshot.name);
    if (existingIndex >= 0) {
      this._snapshots[existingIndex] = snapshot;
    } else {
      this._snapshots.unshift(snapshot);
    }

    this._persistSnapshots();
    this._notify();
    return snapshot;
  }

  loadSnapshot(id: string): WorkspaceVariable[] | null {
    const snap = this._snapshots.find((s) => s.id === id);
    if (!snap) return null;
    this._variables = [...snap.variables];
    this._notify();
    return this._variables;
  }

  deleteSnapshot(id: string): boolean {
    const prevLen = this._snapshots.length;
    this._snapshots = this._snapshots.filter((s) => s.id !== id);
    if (this._snapshots.length !== prevLen) {
      this._persistSnapshots();
      this._notify();
      return true;
    }
    return false;
  }

  static formatSize(size?: string | number[] | null): string {
    if (!size) return '-';
    if (Array.isArray(size)) return size.join('x');
    return String(size);
  }

  static formatBytes(bytes?: number | null): string {
    if (bytes === null || bytes === undefined || isNaN(bytes)) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}
