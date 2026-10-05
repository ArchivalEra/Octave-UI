// src/modules/engine/EngineSession.ts
// 引擎会话门面（Facade）：委托至 EngineSupervisor，维护向后兼容性与轻量接入
import type {
  OctaveEmbedPort,
  EngineState,
  EvalResult,
  EvalJSONResult,
  WorkspaceVariable,
  OutputCallback,
  ErrorCallback,
  StateCallback,
  FsEntry,
} from './types';
import { EngineSupervisor } from './EngineSupervisor';

export class EngineSession {
  private _supervisor: EngineSupervisor;

  constructor(adapter?: OctaveEmbedPort) {
    this._supervisor = new EngineSupervisor({ adapter, skipPreflight: true });
  }

  get supervisor(): EngineSupervisor {
    return this._supervisor;
  }

  get state(): EngineState {
    return this._supervisor.state;
  }

  get isReady(): boolean {
    return this._supervisor.isReady;
  }

  get adapter(): OctaveEmbedPort | null {
    return this._supervisor.adapter;
  }

  attachAdapter(adapter: OctaveEmbedPort) {
    this._supervisor.attachAdapter(adapter);
  }

  onStateChange(cb: StateCallback): () => void {
    return this._supervisor.onStateChange((s) => {
      cb(s);
    });
  }

  onOutput(cb: OutputCallback): () => void {
    return this._supervisor.onOutput(cb);
  }

  onError(cb: ErrorCallback): () => void {
    return this._supervisor.onError(cb);
  }

  onWorkspaceUpdate(cb: (vars: WorkspaceVariable[]) => void): () => void {
    return this._supervisor.onWorkspaceUpdate(cb);
  }

  async yieldFrame(): Promise<void> {
    return this._supervisor.yieldFrame();
  }

  async eval(code: string): Promise<EvalResult> {
    return this._supervisor.eval(code);
  }

  async evalJSON<T = any>(expr: string): Promise<EvalJSONResult<T>> {
    return this._supervisor.evalJSON<T>(expr);
  }

  async getWorkspace(): Promise<WorkspaceVariable[]> {
    return this._supervisor.getWorkspace();
  }

  async queryDocumentation(name: string): Promise<string> {
    return this._supervisor.queryDocumentation(name);
  }

  interrupt(): boolean {
    return this._supervisor.interrupt();
  }

  input(text: string): number {
    return this._supervisor.input(text);
  }

  fsLs(dir = '/home/web_user'): FsEntry[] {
    return this._supervisor.fsLs(dir);
  }

  fsRead(path: string): string {
    return this._supervisor.fsRead(path);
  }

  fsWrite(path: string, content: string): boolean {
    return this._supervisor.fsWrite(path, content);
  }

  fsRm(path: string): boolean {
    return this._supervisor.fsRm(path);
  }

  fsDownload(path: string): boolean {
    return this._supervisor.fsDownload(path);
  }
}
