// src/modules/engine/EngineSupervisor.ts
// 核心计算会话自愈深模块：单一引擎入口不变量、代际 Epoch 隔离、挂起 Kill Ladder、真熔断器与待决任务决议
import type {
  OctaveEmbedPort,
  SupervisorState,
  CrashCause,
  StateTransitionEvent,
  EvalResult,
  EvalJSONResult,
  WorkspaceVariable,
  BootOptions,
  OutputCallback,
  ErrorCallback,
  StateCallback,
  FsEntry,
  EngineLane,
} from './types';
import { EngineCrashedError } from './types';
import { WasmEmbedAdapter } from './WasmEmbedAdapter';
import { MockEmbedAdapter } from './MockEmbedAdapter';


export interface PendingTask {
  id: string;
  epoch: number;
  started: boolean;
  cmd?: string;
  resolve: (value: any) => void;
  reject: (reason: any) => void;
  task: () => Promise<any>;
}

export interface SupervisorOptions {
  adapter?: OctaveEmbedPort;
  adapterFactory?: () => Promise<OctaveEmbedPort> | OctaveEmbedPort;
  skipPreflight?: boolean;
}

export class EngineSupervisor {
  private _adapter: OctaveEmbedPort | null = null;
  private _adapterFactory: (() => Promise<OctaveEmbedPort> | OctaveEmbedPort) | null = null;
  private _state: SupervisorState = 'unloaded';
  private _crashCause: CrashCause | null = null;
  private _epoch = 0;
  private _taskSeq = 0;
  private _inFlightId: string | null = null;
  private _skipPreflight = false;

  private _pending: Map<string, PendingTask> = new Map();
  private _queue: Promise<any> = Promise.resolve();

  // 熔断器滑动窗口：记录近 30s 内的恢复失败时刻
  private _recoveryFailures: number[] = [];

  // Kill Ladder 挂起定时器与解析器
  private _abortTimer: any = null;
  private _abortResolver: (() => void) | null = null;

  // stdout 合并缓冲
  private _bufferedStdout: string[] = [];
  private _stdoutFlushTimer: any = null;

  // 监听器
  private _stateListeners: Set<(state: SupervisorState, event: StateTransitionEvent) => void> = new Set();
  private _transitionListeners: Set<(event: StateTransitionEvent) => void> = new Set();
  private _outputListeners: Set<OutputCallback> = new Set();
  private _errorListeners: Set<ErrorCallback> = new Set();
  private _workspaceListeners: Set<(vars: WorkspaceVariable[]) => void> = new Set();

  constructor(options?: SupervisorOptions) {
    if (options?.skipPreflight) {
      this._skipPreflight = true;
    }
    if (options?.adapterFactory) {
      this._adapterFactory = options.adapterFactory;
    }
    if (options?.adapter) {
      this.attachAdapter(options.adapter);
    }
  }

  get state(): SupervisorState {
    return this._state;
  }

  get crashCause(): CrashCause | null {
    return this._crashCause;
  }

  get epoch(): number {
    return this._epoch;
  }

  get isReady(): boolean {
    return this._state === 'idle' || this._state === 'busy';
  }

  get pendingCount(): number {
    return this._pending.size;
  }

  get inFlightTaskId(): string | null {
    return this._inFlightId;
  }

  private _currentLane: EngineLane = 'wasm32-final';

  get currentLane(): EngineLane {
    return this._currentLane;
  }

  setLane(lane: EngineLane): void {
    if (this._state !== 'unloaded') {
      throw new Error(`Cannot switch engine lane after computation has started (current state: ${this._state})`);
    }
    this._currentLane = lane;
  }

  async switchLane(lane: EngineLane): Promise<void> {
    if (this._state !== 'unloaded') {
      throw new Error(`Cannot switch engine lane after computation has started (current state: ${this._state})`);
    }
    this._currentLane = lane;
  }

  get adapter(): OctaveEmbedPort | null {
    return this._adapter;
  }


  static checkPreflight(lane: EngineLane = 'wasm32-final'): { ok: boolean; reason?: string } {
    if (typeof window !== 'undefined') {
      if (typeof WebAssembly === 'undefined') {
        return {
          ok: false,
          reason: '当前运行环境不支持 WebAssembly，无法运行任何 Octave 引擎。',
        };
      }

      // 仅多线程档位 (master / IllegalPerformance) 强制要求 COI 与 SharedArrayBuffer
      // wasm32-final 属于 32 位单线程通用兼容档，在无 COI (静态网页托管 / GitHub Pages) 环境下可直接运行
      const requiresMultiThreading = lane !== 'wasm32-final';
      if (requiresMultiThreading) {
        if (!window.crossOriginIsolated) {
          return {
            ok: false,
            reason: `当前档位 (${lane}) 需要多线程与跨源隔离 (crossOriginIsolated)。当前环境未启用 COI (缺少 COOP/COEP 响应头)，请切换至 wasm32-final 基础单线程兼容档。`,
          };
        }
        if (typeof SharedArrayBuffer === 'undefined') {
          return {
            ok: false,
            reason: `当前档位 (${lane}) 需要 SharedArrayBuffer 多线程支持。当前环境不可用，请切换至 wasm32-final 基础单线程兼容档。`,
          };
        }
      }
    }
    return { ok: true };
  }

  private _setState(to: SupervisorState, cause?: CrashCause) {
    if (to === 'crashed' && cause) {
      this._crashCause = cause;
    } else if (to === 'idle') {
      this._crashCause = null;
    }
    if (this._state === to) return;
    const from = this._state;
    this._state = to;
    const event: StateTransitionEvent = {
      from,
      to,
      epoch: this._epoch,
      cause: cause || (to === 'crashed' ? (this._crashCause || undefined) : undefined),
    };
    for (const cb of this._stateListeners) {
      try { cb(to, event); } catch {}
    }
    for (const cb of this._transitionListeners) {
      try { cb(event); } catch {}
    }
  }

  attachAdapter(adapter: OctaveEmbedPort) {
    this._adapter = adapter;
    this._epoch++;
    const currentEpoch = this._epoch;

    this._setState(adapter.state === 'idle' ? 'idle' : 'booting');

    adapter.on.state((s) => {
      if (this._epoch !== currentEpoch) return; // 丢弃过时代际消息
      if (this._state === 'crashed' || this._state === 'failed' || this._state === 'aborting') return;
      this._setState(s === 'idle' ? 'idle' : 'busy');
    });

    adapter.on.output((text) => {
      if (this._epoch !== currentEpoch) return; // 丢弃过时代际消息
      if (this._state === 'crashed' || this._state === 'failed') return;
      this._bufferStdout(text);
    });

    adapter.on.error((err) => {
      if (this._epoch !== currentEpoch) return; // 丢弃过时代际消息
      if (this._state === 'crashed' || this._state === 'failed') return;
      if (this._isWasmCrash(err)) {
        this.onEngineDeath(currentEpoch, this._isOom(err) ? 'oom' : 'trap');
        return;
      }
      for (const cb of this._errorListeners) {
        try { cb(err); } catch {}
      }
    });
  }

  async boot(opts: BootOptions & { skipPreflight?: boolean } = {}): Promise<void> {
    const effectiveLane = opts.lane || this._currentLane;
    this._currentLane = effectiveLane;

    const shouldSkip = opts.skipPreflight ?? this._skipPreflight;
    if (!shouldSkip) {
      const preflight = EngineSupervisor.checkPreflight(effectiveLane);
      if (!preflight.ok) {
        this._setState('failed', 'boot-failed');
        throw new Error(`Preflight check failed: ${preflight.reason}`);
      }
    }

    this._setState('booting');

    try {
      let adapter: OctaveEmbedPort;
      if (this._adapterFactory) {
        adapter = await this._adapterFactory();
      } else if (typeof window !== 'undefined' && window.OctaveEmbed) {
        adapter = await WasmEmbedAdapter.boot({ ...opts, lane: effectiveLane });
      } else {
        adapter = new MockEmbedAdapter(opts.id || 'default');
      }

      this.attachAdapter(adapter);
      this._setState('idle');
    } catch (err: any) {
      this._setState('failed', 'boot-failed');
      throw err;
    }
  }

  private _bufferStdout(chunk: string) {
    this._bufferedStdout.push(chunk);
    if (!this._stdoutFlushTimer) {
      this._stdoutFlushTimer = setTimeout(() => {
        this._flushBufferedOutput();
      }, 16);
    }
  }

  public _flushBufferedOutput() {
    if (this._adapter && typeof (this._adapter as any).flushOutput === 'function') {
      try { (this._adapter as any).flushOutput(); } catch {}
    }
    if (this._stdoutFlushTimer) {
      clearTimeout(this._stdoutFlushTimer);
      this._stdoutFlushTimer = null;
    }
    if (this._bufferedStdout.length === 0) return;
    const text = this._bufferedStdout.join('');
    this._bufferedStdout = [];
    for (const cb of this._outputListeners) {
      try { cb(text); } catch {}
    }
  }

  settle(id: string, outcome: { ok: true; value: any } | { ok: false; error: any }) {
    const entry = this._pending.get(id);
    if (!entry) return;
    // 关键不变量：在 resolve/reject 前先从 _pending 表中删除，杜绝重入
    this._pending.delete(id);
    if (outcome.ok) {
      entry.resolve(outcome.value);
    } else {
      entry.reject(outcome.error);
    }
  }

  private _clearAbort() {
    if (this._abortTimer) {
      clearTimeout(this._abortTimer);
      this._abortTimer = null;
    }
    if (this._abortResolver) {
      this._abortResolver();
      this._abortResolver = null;
    }
  }

  onEngineDeath(epoch: number, cause: CrashCause) {
    if (epoch !== this._epoch && this._state !== 'recovering') {
      return; // 丢弃不匹配代际
    }

    this._crashCause = cause;

    // 1. 优先冲刷 stdout 缓冲
    this._flushBufferedOutput();

    // 2. 清除 Kill Ladder 定时器
    this._clearAbort();

    // 3. 断开底层适配器引用
    this._adapter = null;

    // 4. 重置在途任务与执行队列，避免挂起的 Promise 导致恢复后的后续命令永久阻塞
    this._inFlightId = null;
    this._queue = Promise.resolve();

    // 5. 清理所有 pending 任务：当前正在执行的任务附带 started: true，其余 started: false
    const pendingList = Array.from(this._pending.values());
    this._pending.clear();
    for (const entry of pendingList) {
      const err = new EngineCrashedError({
        cause,
        started: entry.started,
        epoch,
        message: entry.started
          ? `Engine crashed while executing task (cause: ${cause}, epoch: ${epoch})`
          : `Task canceled before starting because engine crashed (cause: ${cause}, epoch: ${epoch})`,
      });
      entry.reject(err);
    }

    // 6. 转移至 crashed 状态
    this._setState('crashed', cause);
  }

  async abort(timeoutMs = 1500): Promise<void> {
    if (this._state !== 'busy' && this._state !== 'aborting') {
      return;
    }
    if (this._state === 'aborting') {
      return;
    }

    this._setState('aborting');

    // 第一阶梯：协作式中断
    try {
      this._adapter?.interrupt();
    } catch {}

    const targetEpoch = this._epoch;

    // 第二阶梯与第三阶梯：优雅超时与硬杀死
    return new Promise<void>((resolve) => {
      this._abortResolver = resolve;
      this._abortTimer = setTimeout(() => {
        this._abortTimer = null;
        this._abortResolver = null;
        if (this._state === 'aborting' && this._epoch === targetEpoch) {
          try {
            this._adapter?.terminate?.();
          } catch {}
          this.onEngineDeath(targetEpoch, 'hang');
        }
        resolve();
      }, timeoutMs);
    });
  }

  kill(cause: CrashCause = 'user-kill') {
    this._clearAbort();
    try {
      this._adapter?.terminate?.();
    } catch {}
    this.onEngineDeath(this._epoch, cause);
  }

  stop(): void {
    this._clearAbort();
    if (this._adapter && typeof this._adapter.terminate === 'function') {
      try {
        this._adapter.terminate();
      } catch {}
    }
    this._adapter = null;
    this._pending.clear();
    this._inFlightId = null;
    this._setState('unloaded');
  }

  async recover(): Promise<void> {
    if (this._state === 'failed') {
      throw new Error('Circuit breaker tripped: Engine is in terminal failed state.');
    }
    if (this._state !== 'crashed') {
      return; // 幂等安全返回
    }

    const now = Date.now();
    this._recoveryFailures = this._recoveryFailures.filter((t) => now - t < 30_000);
    if (this._recoveryFailures.length >= 3) {
      this._setState('failed', 'boot-failed');
      throw new Error('Circuit breaker tripped: 3 recovery failures within 30s. Transitioned to failed.');
    }

    this._setState('recovering');

    try {
      let newAdapter: OctaveEmbedPort;
      if (this._adapterFactory) {
        newAdapter = await this._adapterFactory();
      } else if (typeof window !== 'undefined' && window.OctaveEmbed) {
        newAdapter = await WasmEmbedAdapter.boot({});
      } else {
        newAdapter = new MockEmbedAdapter();
      }

      this.attachAdapter(newAdapter);
      if (newAdapter.state === 'idle') {
        this._setState('idle');
      }
    } catch (err: any) {
      this._recoveryFailures.push(Date.now());
      const recent = this._recoveryFailures.filter((t) => Date.now() - t < 30_000);
      if (recent.length >= 3) {
        this._setState('failed', 'boot-failed');
      } else {
        this._setState('crashed', 'boot-failed');
      }
      throw err;
    }
  }

  async yieldFrame(): Promise<void> {
    if (typeof requestAnimationFrame === 'function') {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => setTimeout(resolve, 0));
      });
    } else {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }

  private _enqueueTask<T>(id: string, taskFn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const entry: PendingTask = {
        id,
        epoch: this._epoch,
        started: false,
        task: taskFn,
        resolve,
        reject,
      };
      this._pending.set(id, entry);

      this._queue = this._queue
        .then(async () => {
          const curEntry = this._pending.get(id);
          if (!curEntry) return;

          // 关键防护：如果任务所属代际与当前代际不一致，静默丢弃
          if (curEntry.epoch !== this._epoch) return;

          curEntry.started = true;
          this._inFlightId = id;
          this._setState('busy');

          try {
            const res = await curEntry.task();
            // 关键防护：如果执行期间代际已改变，丢弃结果，不污染新代际状态
            if (curEntry.epoch !== this._epoch) return;

            this._clearAbort();
            if (this._state === 'busy' || this._state === 'aborting') {
              this._setState('idle');
            }
            this.settle(id, { ok: true, value: res });
          } catch (err: any) {
            // 关键防护：如果执行期间代际已改变，丢弃异常，不污染新代际状态
            if (curEntry.epoch !== this._epoch) return;

            this._clearAbort();
            // 自动侦测 Wasm 内存违例或崩溃
            if (this._isWasmCrash(err)) {
              const cause = this._isOom(err) ? 'oom' : 'trap';
              this.onEngineDeath(curEntry.epoch, cause);
            } else {
              if (this._state === 'busy' || this._state === 'aborting') {
                this._setState('idle');
              }
              this.settle(id, { ok: false, error: err });
            }
          } finally {
            if (this._inFlightId === id) {
              this._inFlightId = null;
            }
          }
        })
        .catch(() => {});
    });
  }

  private _isWasmCrash(err: any): boolean {
    if (!err) return false;
    const msg = String(err.message || err);
    return (
      (typeof WebAssembly !== 'undefined' && err instanceof (WebAssembly as any).RuntimeError) ||
      msg.includes('unreachable') ||
      msg.includes('memory access out of bounds') ||
      msg.includes('table index out of bounds') ||
      msg.includes('abort(') ||
      this._isOom(err)
    );
  }

  private _isOom(err: any): boolean {
    if (!err) return false;
    const msg = String(err.message || err).toLowerCase();
    return msg.includes('out of memory') || msg.includes('cannot enlarge memory');
  }

  async eval(code: string): Promise<EvalResult> {
    if (this._state === 'crashed' || this._state === 'failed') {
      throw new EngineCrashedError({
        cause: this._state === 'failed' ? 'boot-failed' : 'trap',
        started: false,
        epoch: this._epoch,
        message: `Cannot eval: Engine is in '${this._state}' state.`,
      });
    }
    if (!this._adapter && this._state !== 'booting') {
      throw new Error('EngineSupervisor: Engine is not booted or adapter is missing.');
    }

    const taskId = `eval_${++this._taskSeq}`;
    return this._enqueueTask(taskId, async () => {
      await this.yieldFrame();
      let res: EvalResult;
      try {
        res = await this._adapter!.eval(code);
      } finally {
        this._flushBufferedOutput();
        try {
          await this._silentRefreshWorkspace();
        } catch {}
      }
      return res;
    });
  }

  async evalJSON<T = any>(expr: string): Promise<EvalJSONResult<T>> {
    if (this._state === 'crashed' || this._state === 'failed') {
      throw new EngineCrashedError({
        cause: this._state === 'failed' ? 'boot-failed' : 'trap',
        started: false,
        epoch: this._epoch,
        message: `Cannot evalJSON: Engine is in '${this._state}' state.`,
      });
    }
    if (!this._adapter && this._state !== 'booting') {
      throw new Error('EngineSupervisor: Engine is not booted or adapter is missing.');
    }

    const taskId = `json_${++this._taskSeq}`;
    return this._enqueueTask(taskId, async () => {
      await this.yieldFrame();
      return await this._adapter!.evalJSON<T>(expr);
    });
  }

  async getWorkspace(): Promise<WorkspaceVariable[]> {
    if (!this._adapter) return [];

    const taskId = `ws_${++this._taskSeq}`;
    return this._enqueueTask(taskId, async () => {
      const res = await this._adapter!.workspace();
      const vars = Array.isArray(res) ? res : res.value || [];
      for (const cb of this._workspaceListeners) {
        try { cb(vars); } catch {}
      }
      return vars;
    });
  }

  private async _silentRefreshWorkspace(): Promise<void> {
    if (!this._adapter) return;
    try {
      const res = await this._adapter.workspace();
      const vars = Array.isArray(res) ? res : res.value || [];
      for (const cb of this._workspaceListeners) {
        try { cb(vars); } catch {}
      }
    } catch {}
  }

  async queryDocumentation(name: string): Promise<string> {
    if (!this._adapter) {
      throw new Error('EngineSupervisor: Engine is not booted.');
    }
    const safeName = name.replace(/'/g, "''");
    const jsonRes = await this.evalJSON<string>(`get_help_text('${safeName}')`);
    if (jsonRes.ok && typeof jsonRes.value === 'string' && jsonRes.value.trim().length > 0) {
      return jsonRes.value;
    }
    return `Simulated or fallback documentation for '${name}'.`;
  }

  interrupt(): boolean {
    if (!this._adapter) return false;
    return this._adapter.interrupt();
  }

  input(text: string): number {
    if (!this._adapter) return 0;
    return this._adapter.input(text);
  }

  fsLs(dir = '/home/web_user'): FsEntry[] {
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

  onStateChange(cb: (state: SupervisorState, event: StateTransitionEvent) => void): () => void {
    this._stateListeners.add(cb);
    const initialEvent: StateTransitionEvent = {
      from: this._state,
      to: this._state,
      epoch: this._epoch,
    };
    cb(this._state, initialEvent);
    return () => this._stateListeners.delete(cb);
  }

  onStateTransition(cb: (event: StateTransitionEvent) => void): () => void {
    this._transitionListeners.add(cb);
    return () => this._transitionListeners.delete(cb);
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
}
