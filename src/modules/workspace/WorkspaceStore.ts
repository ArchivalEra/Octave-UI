// src/modules/workspace/WorkspaceStore.ts
// 工作区变量同步仓储：结构化表格解析、变量大小与字节格式化、响应式订阅
import type { WorkspaceVariable } from '../engine/types';
import type { EngineSession } from '../engine/EngineSession';

export type WorkspaceListener = (vars: WorkspaceVariable[]) => void;

export class WorkspaceStore {
  private _variables: WorkspaceVariable[] = [];
  private _listeners: Set<WorkspaceListener> = new Set();
  private _session: EngineSession | null = null;

  constructor(session?: EngineSession) {
    if (session) {
      this.attachSession(session);
    }
  }

  get variables(): WorkspaceVariable[] {
    return [...this._variables];
  }

  attachSession(session: EngineSession) {
    this._session = session;
    session.onWorkspaceUpdate((vars) => {
      this.setVariables(vars);
    });
  }

  setVariables(vars: WorkspaceVariable[]) {
    this._variables = vars;
    this._notify();
  }

  subscribe(cb: WorkspaceListener): () => void {
    this._listeners.add(cb);
    cb(this._variables);
    return () => this._listeners.delete(cb);
  }

  private _notify() {
    for (const cb of this._listeners) {
      cb(this._variables);
    }
  }

  async refresh(): Promise<WorkspaceVariable[]> {
    if (!this._session) return this._variables;
    const vars = await this._session.getWorkspace();
    this.setVariables(vars);
    return vars;
  }

  static formatSize(size?: string | number[] | null): string {
    if (!size) return '-';
    if (Array.isArray(size)) {
      return size.join('x');
    }
    return String(size);
  }

  static formatBytes(bytes?: number | null): string {
    if (bytes === null || bytes === undefined || isNaN(bytes)) {
      return '0 B';
    }
    if (bytes < 1024) {
      return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}
