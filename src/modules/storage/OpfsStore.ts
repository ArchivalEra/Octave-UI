// src/modules/storage/OpfsStore.ts
// 基于 W3C 标准 OPFS (Origin Private File System) 的持久化 Store 实现

import {
  type Store,
  type EntryMeta,
  type StorageUsage,
  validatePath,
  splitPath,
} from './types';

export class OpfsStore implements Store {
  readonly name = 'OpfsStore';

  private _root: FileSystemDirectoryHandle | null = null;
  private _workspaceDir: FileSystemDirectoryHandle | null = null;
  private _initialized = false;

  get isSupported(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      typeof navigator.storage !== 'undefined' &&
      typeof navigator.storage.getDirectory === 'function'
    );
  }

  async init(): Promise<void> {
    if (this._initialized) return;

    if (!this.isSupported) {
      throw new Error('OPFS (Origin Private File System) is not supported in this environment');
    }

    try {
      // 降低浏览器因存储压力静默驱逐沙箱的风险
      if (typeof navigator.storage.persist === 'function') {
        void navigator.storage.persist().catch(() => {});
      }

      this._root = await navigator.storage.getDirectory();
      // 在源私有根目录下创建/获取 octave_workspace 独立沙箱目录
      this._workspaceDir = await this._root.getDirectoryHandle('octave_workspace', { create: true });
      this._initialized = true;
    } catch (err: any) {
      throw new Error(`Failed to initialize OPFS store: ${err?.message || err}`);
    }
  }

  private async _ensureWorkspace(): Promise<FileSystemDirectoryHandle> {
    if (!this._initialized || !this._workspaceDir) {
      await this.init();
    }
    return this._workspaceDir!;
  }

  private async _resolveDir(
    dirPath: string,
    create = false
  ): Promise<FileSystemDirectoryHandle> {
    let current = await this._ensureWorkspace();
    if (!dirPath) return current;

    const segments = dirPath.split('/').filter(Boolean);
    for (const seg of segments) {
      current = await current.getDirectoryHandle(seg, { create });
    }
    return current;
  }

  async *list(): AsyncIterable<EntryMeta> {
    const root = await this._ensureWorkspace();

    async function* scanDir(
      dirHandle: FileSystemDirectoryHandle,
      currentPrefix: string
    ): AsyncIterable<EntryMeta> {
      // @ts-ignore - FileSystemDirectoryHandle values() is async iterable in modern browsers
      for await (const entry of dirHandle.values()) {
        const itemPath = currentPrefix ? `${currentPrefix}/${entry.name}` : entry.name;
        if (entry.kind === 'directory') {
          yield {
            path: itemPath,
            name: entry.name,
            kind: 'dir',
          };
          yield* scanDir(entry as FileSystemDirectoryHandle, itemPath);
        } else if (entry.kind === 'file') {
          const file = await (entry as FileSystemFileHandle).getFile();
          yield {
            path: itemPath,
            name: entry.name,
            kind: 'file',
            size: file.size,
            mtime: file.lastModified,
          };
        }
      }
    }

    yield* scanDir(root, '');
  }

  async read(path: string): Promise<Uint8Array> {
    const valid = validatePath(path);
    const { dir, name } = splitPath(valid);

    try {
      const dirHandle = await this._resolveDir(dir, false);
      const fileHandle = await dirHandle.getFileHandle(name);
      const file = await fileHandle.getFile();
      const buffer = await file.arrayBuffer();
      return new Uint8Array(buffer);
    } catch (err: any) {
      throw new Error(`Failed to read file "${valid}" from OPFS: ${err?.message || err}`);
    }
  }

  async write(path: string, data: Uint8Array): Promise<void> {
    const valid = validatePath(path);
    const { dir, name } = splitPath(valid);

    const dirHandle = await this._resolveDir(dir, true);
    const fileHandle = await dirHandle.getFileHandle(name, { create: true });

    // 使用 createWritable 原子流写入
    const writable = await fileHandle.createWritable();
    try {
      await writable.write(data);
    } finally {
      await writable.close();
    }
  }

  async mkdir(path: string): Promise<void> {
    const valid = validatePath(path);
    await this._resolveDir(valid, true);
  }

  async remove(path: string): Promise<void> {
    const valid = validatePath(path);
    const { dir, name } = splitPath(valid);

    try {
      const dirHandle = await this._resolveDir(dir, false);
      await dirHandle.removeEntry(name, { recursive: true });
    } catch (err: any) {
      if (err?.name === 'NotFoundError') {
        return;
      }
      throw err;
    }
  }

  async stat(path: string): Promise<EntryMeta | null> {
    const valid = validatePath(path);
    const { dir, name } = splitPath(valid);

    try {
      const dirHandle = await this._resolveDir(dir, false);
      // 先探测是否是文件
      try {
        const fileHandle = await dirHandle.getFileHandle(name);
        const file = await fileHandle.getFile();
        return {
          path: valid,
          name,
          kind: 'file',
          size: file.size,
          mtime: file.lastModified,
        };
      } catch {
        // 探测是否是子目录
        await dirHandle.getDirectoryHandle(name);
        return {
          path: valid,
          name,
          kind: 'dir',
        };
      }
    } catch {
      return null;
    }
  }

  async usage(): Promise<StorageUsage> {
    if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
      try {
        const est = await navigator.storage.estimate();
        return {
          used: est.usage ?? 0,
          quota: est.quota ?? 0,
        };
      } catch {}
    }
    return { used: 0, quota: 0 };
  }

  async clear(): Promise<void> {
    const root = await this._ensureWorkspace();
    // @ts-ignore
    for await (const entry of root.values()) {
      await root.removeEntry(entry.name, { recursive: true });
    }
  }
}
