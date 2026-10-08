// src/modules/workspace/WorkspaceStore.ts
// 工作区变量同步仓储：结构化表格解析、变量大小与字节格式化、命名工作区与快照管理、响应式订阅
import type { WorkspaceVariable, EngineSessionLike } from '../engine/types';

export interface WorkspaceSnapshot {
  id: string;
  name: string;
  timestamp: number;
  variables: WorkspaceVariable[];
  description?: string;
}

export type WorkspaceListener = (vars: WorkspaceVariable[]) => void;
export type SnapshotListener = (snapshots: WorkspaceSnapshot[]) => void;

const STORAGE_KEY_SNAPSHOTS = 'octave_workspace_snapshots';
const STORAGE_KEY_ACTIVE = 'octave_active_workspace';

export class WorkspaceStore {
  private _variables: WorkspaceVariable[] = [];
  private _snapshots: WorkspaceSnapshot[] = [];
  private _activeWorkspaceId: string = 'default';
  private _listeners: Set<WorkspaceListener> = new Set();
  private _snapshotListeners: Set<SnapshotListener> = new Set();
  private _session: EngineSessionLike | null = null;

  constructor(session?: EngineSessionLike) {
    this._loadSnapshotsFromStorage();
    if (session) {
      this.attachSession(session);
    }
  }

  get variables(): WorkspaceVariable[] {
    return [...this._variables];
  }

  get snapshots(): WorkspaceSnapshot[] {
    return [...this._snapshots];
  }

  get activeWorkspaceId(): string {
    return this._activeWorkspaceId;
  }

  attachSession(session: EngineSessionLike) {
    this._session = session;
    if (session.onWorkspaceUpdate) {
      session.onWorkspaceUpdate((vars) => {
        this.setVariables(vars);
      });
    }
  }

  setVariables(vars: WorkspaceVariable[]) {
    this._variables = vars;
    this._notify();
  }

  clearVariables() {
    this._variables = [];
    this._notify();
  }

  subscribe(cb: WorkspaceListener): () => void {
    this._listeners.add(cb);
    cb(this._variables);
    return () => this._listeners.delete(cb);
  }

  subscribeSnapshots(cb: SnapshotListener): () => void {
    this._snapshotListeners.add(cb);
    cb(this.snapshots);
    return () => this._snapshotListeners.delete(cb);
  }

  private _notify() {
    for (const cb of this._listeners) {
      try {
        cb(this._variables);
      } catch {}
    }
  }

  private _notifySnapshots() {
    for (const cb of this._snapshotListeners) {
      try {
        cb(this.snapshots);
      } catch {}
    }
  }

  async refresh(): Promise<WorkspaceVariable[]> {
    if (!this._session) return this._variables;
    const vars = await this._session.getWorkspace();
    this.setVariables(vars);
    return vars;
  }

  // --- 快照与命名工作区管理 ---

  private _loadSnapshotsFromStorage() {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY_SNAPSHOTS);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this._snapshots = parsed;
        }
      }
      const active = localStorage.getItem(STORAGE_KEY_ACTIVE);
      if (active) {
        this._activeWorkspaceId = active;
      }
    } catch {}
  }

  private _persistSnapshots() {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY_SNAPSHOTS, JSON.stringify(this._snapshots));
      localStorage.setItem(STORAGE_KEY_ACTIVE, this._activeWorkspaceId);
    } catch {}
  }

  listSnapshots(): WorkspaceSnapshot[] {
    return this.snapshots;
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

    // 如果同名快照已存在，则更新，否则新增
    const existingIndex = this._snapshots.findIndex((s) => s.name === snapshot.name);
    if (existingIndex >= 0) {
      this._snapshots[existingIndex] = snapshot;
    } else {
      this._snapshots.unshift(snapshot);
    }

    this._activeWorkspaceId = id;
    this._persistSnapshots();
    this._notifySnapshots();
    return snapshot;
  }

  loadSnapshot(id: string): WorkspaceVariable[] | null {
    const snap = this._snapshots.find((s) => s.id === id);
    if (!snap) return null;
    this._variables = [...snap.variables];
    this._activeWorkspaceId = id;
    this._persistSnapshots();
    this._notify();
    this._notifySnapshots();
    return this._variables;
  }

  switchWorkspace(id: string): WorkspaceVariable[] | null {
    if (id === 'default') {
      this._activeWorkspaceId = 'default';
      this._persistSnapshots();
      this._notifySnapshots();
      return this._variables;
    }
    return this.loadSnapshot(id);
  }

  deleteSnapshot(id: string): boolean {
    const prevLen = this._snapshots.length;
    this._snapshots = this._snapshots.filter((s) => s.id !== id);
    if (this._snapshots.length !== prevLen) {
      if (this._activeWorkspaceId === id) {
        this._activeWorkspaceId = 'default';
      }
      this._persistSnapshots();
      this._notifySnapshots();
      return true;
    }
    return false;
  }

  exportSnapshotJson(id: string): string | null {
    const snap = this._snapshots.find((s) => s.id === id);
    if (!snap) return null;
    return JSON.stringify(snap, null, 2);
  }

  importSnapshotJson(jsonStr: string): WorkspaceSnapshot | null {
    try {
      const parsed = JSON.parse(jsonStr);
      if (parsed && typeof parsed.name === 'string' && Array.isArray(parsed.variables)) {
        const id = `snap_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const snap: WorkspaceSnapshot = {
          id,
          name: parsed.name,
          timestamp: parsed.timestamp || Date.now(),
          variables: parsed.variables,
          description: parsed.description,
        };
        this._snapshots.unshift(snap);
        this._persistSnapshots();
        this._notifySnapshots();
        return snap;
      }
    } catch {}
    return null;
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

