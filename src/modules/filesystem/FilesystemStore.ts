// src/modules/filesystem/FilesystemStore.ts
// 虚拟文件系统操作与路径状态管理：MEMFS 树状视图、文件读写、下载与刷新
import type { FsEntry, EngineSessionLike } from '../engine/types';

export type FsListener = (entries: FsEntry[], currentDir: string) => void;

export class FilesystemStore {
  private _session: EngineSessionLike | null = null;
  private _currentDir = '/home/web_user';
  private _entries: FsEntry[] = [];
  private _listeners: Set<FsListener> = new Set();

  constructor(session?: EngineSessionLike, initialDir = '/home/web_user') {
    this._currentDir = initialDir;
    if (session) {
      this.attachSession(session);
    }
  }

  get currentDir(): string {
    return this._currentDir;
  }

  get entries(): FsEntry[] {
    return [...this._entries];
  }

  attachSession(session: EngineSessionLike) {
    this._session = session;
  }

  subscribe(cb: FsListener): () => void {
    this._listeners.add(cb);
    cb(this._entries, this._currentDir);
    return () => this._listeners.delete(cb);
  }

  private _notify() {
    for (const cb of this._listeners) {
      cb(this._entries, this._currentDir);
    }
  }

  setDirectory(dir: string) {
    this._currentDir = dir;
    this.refresh();
  }

  refresh(): FsEntry[] {
    if (!this._session) return [];
    try {
      this._entries = this._session.fsLs(this._currentDir);
      this._notify();
      return this._entries;
    } catch {
      return [];
    }
  }

  readFile(filename: string): string {
    if (!this._session) throw new Error('Engine not available');
    const path = this._resolvePath(filename);
    return this._session.fsRead(path);
  }

  writeFile(filename: string, content: string): boolean {
    if (!this._session) return false;
    const path = this._resolvePath(filename);
    const ok = this._session.fsWrite(path, content);
    if (ok) {
      this.refresh();
    }
    return ok;
  }

  removeFile(filename: string): boolean {
    if (!this._session) return false;
    const path = this._resolvePath(filename);
    const ok = this._session.fsRm(path);
    if (ok) {
      this.refresh();
    }
    return ok;
  }

  downloadFile(filename: string): boolean {
    if (!this._session) return false;
    const path = this._resolvePath(filename);
    return this._session.fsDownload(path);
  }

  private _resolvePath(name: string): string {
    if (name.startsWith('/')) return name;
    const prefix = this._currentDir.endsWith('/') ? this._currentDir : `${this._currentDir}/`;
    return `${prefix}${name}`;
  }
}
