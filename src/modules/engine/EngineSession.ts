// src/modules/engine/EngineSession.ts
// 核心引擎会话管理器：FIFO 调度互斥队列、让帧机制、带外 help 探测、协作式中断与生命周期状态
import type {
  OctaveEmbedPort,
  EngineState,
  EvalResult,
  EvalJSONResult,
  WorkspaceVariable,
  BootOptions,
  OutputCallback,
  ErrorCallback,
  StateCallback,
} from './types';

export class EngineSession {
  private _adapter: OctaveEmbedPort | null = null;
  private _state: EngineState = 'unloaded';
  private _queue: Promise<any> = Promise.resolve();
  private _stateListeners: Set<StateCallback> = new Set();
  private _outputListeners: Set<OutputCallback> = new Set();
  private _errorListeners: Set<ErrorCallback> = new Set();
  private _workspaceListeners: Set<(vars: WorkspaceVariable[]) => void> = new Set();

  constructor(adapter?: OctaveEmbedPort) {
    if (adapter) {
      this.attachAdapter(adapter);
    }
  }

  get state(): EngineState {
    return this._state;
  }

  get isReady(): boolean {
    return this._state === 'idle' || this._state === 'busy';
  }

  get adapter(): OctaveEmbedPort | null {
    return this._adapter;
  }

  attachAdapter(adapter: OctaveEmbedPort) {
    this._adapter = adapter;
    this._setState(adapter.state === 'idle' ? 'idle' : 'booting');

    adapter.on.state((s) => {
      this._setState(s);
    });

    adapter.on.output((text) => {
      for (const cb of this._outputListeners) {
        cb(text);
      }
    });

    adapter.on.error((err) => {
      for (const cb of this._errorListeners) {
        cb(err);
      }
    });
  }

  private _setState(newState: EngineState) {
    if (this._state === newState) return;
    this._state = newState;
    for (const cb of this._stateListeners) {
      cb(newState);
    }
  }

  onStateChange(cb: StateCallback): () => void {
    this._stateListeners.add(cb);
    cb(this._state);
    return () => this._stateListeners.delete(cb);
  }

  onOutput(cb: OutputCallback): () => void {
    this._outputListeners.add(cb);
    return () => this._outputListeners.delete(cb);
  }

  onError(cb: ErrorCallback): () => void {
    this._errorListeners.add(cb);
    return () => this._errorListeners.delete(cb);
  }

  onWorkspaceUpdate(cb: (vars: WorkspaceVariable[]) => void): () => void {
    this._workspaceListeners.add(cb);
    return () => this._workspaceListeners.delete(cb);
  }

  /**
   * 让出主线程渲染帧（rAF + setTimeout），确保浏览器将 busy 状态徽章与按钮绘制到屏幕
   */
  async yieldFrame(): Promise<void> {
    if (typeof requestAnimationFrame === 'function') {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => setTimeout(resolve, 0));
      });
    } else {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }

  /**
   * FIFO 队列调度执行器：严格排队，防止非重入的 WebAssembly 解释器并发冲突
   */
  private _enqueue<T>(task: () => Promise<T>): Promise<T> {
    const next = this._queue.then(async () => {
      return await task();
    });
    // 保持队列链式推进，即使单个任务异常也不中断后续任务
    this._queue = next.catch(() => {});
    return next;
  }

  /**
   * 执行代码语句（eval）
   */
  async eval(code: string): Promise<EvalResult> {
    if (!this._adapter) {
      throw new Error('EngineSession: Engine is not booted or adapter is missing.');
    }

    return this._enqueue(async () => {
      this._setState('busy');
      await this.yieldFrame();

      let res: EvalResult;
      try {
        res = await this._adapter!.eval(code);
      } finally {
        // 在互斥队列保护内先静默拉取工作区，防止未拉取完成就让下一个任务重入
        try {
          await this._silentRefreshWorkspace();
        } catch {}
        this._setState('idle');
      }
      return res;
    });
  }

  /**
   * 执行表达式并取回 JSON 序列化结果（evalJSON）
   */
  async evalJSON<T = any>(expr: string): Promise<EvalJSONResult<T>> {
    if (!this._adapter) {
      throw new Error('EngineSession: Engine is not booted or adapter is missing.');
    }

    return this._enqueue(async () => {
      this._setState('busy');
      await this.yieldFrame();

      try {
        return await this._adapter!.evalJSON<T>(expr);
      } finally {
        this._setState('idle');
      }
    });
  }

  /**
   * 获取当前工作区变量列表
   */
  async getWorkspace(): Promise<WorkspaceVariable[]> {
    if (!this._adapter) return [];

    return this._enqueue(async () => {
      const res = await this._adapter!.workspace();
      const vars = Array.isArray(res) ? res : (res.value || []);
      for (const cb of this._workspaceListeners) {
        cb(vars);
      }
      return vars;
    });
  }

  private async _silentRefreshWorkspace(): Promise<void> {
    if (!this._adapter) return;
    try {
      const res = await this._adapter.workspace();
      const vars = Array.isArray(res) ? res : (res.value || []);
      for (const cb of this._workspaceListeners) {
        cb(vars);
      }
    } catch {
      // 静默拉取失败不抛错
    }
  }

  /**
   * 带外获取函数文档（不污染终端 stdout）
   */
  async queryDocumentation(name: string): Promise<string> {
    if (!this._adapter) {
      throw new Error('EngineSession: Engine is not booted.');
    }

    // 优先通过 evalJSON 调用 get_help_text，避免将文档推入 on.output
    const safeName = name.replace(/'/g, "''");
    const jsonRes = await this.evalJSON<string>(`get_help_text('${safeName}')`);
    if (jsonRes.ok && typeof jsonRes.value === 'string' && jsonRes.value.trim().length > 0) {
      return jsonRes.value;
    }

    return `Simulated or fallback documentation for '${name}'.`;
  }

  /**
   * 触发协作式安全点中断
   */
  interrupt(): boolean {
    if (!this._adapter) return false;
    return this._adapter.interrupt();
  }

  /**
   * 预填标准输入
   */
  input(text: string): number {
    if (!this._adapter) return 0;
    return this._adapter.input(text);
  }

  /**
   * 虚拟文件系统操作
   */
  fsLs(dir = '/home/web_user') {
    if (!this._adapter) return [];
    return this._adapter.fs.ls(dir);
  }

  fsRead(path: string): string {
    if (!this._adapter) throw new Error('Engine is not booted');
    return this._adapter.fs.read(path);
  }

  fsWrite(path: string, content: string): boolean {
    if (!this._adapter) return false;
    return this._adapter.fs.write(path, content);
  }

  fsRm(path: string): boolean {
    if (!this._adapter) return false;
    return this._adapter.fs.rm(path);
  }

  fsDownload(path: string): boolean {
    if (!this._adapter) return false;
    return this._adapter.fs.download(path);
  }
}
