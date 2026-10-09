// src/modules/storage/MemoryStore.ts
// 纯内存 Store 实现：用于 Vitest 单元测试、无 OPFS 环境或隐身模式无缝降级

import {
  type Store,
  type EntryMeta,
  type StorageUsage,
  validatePath,
  splitPath,
} from './types';

export class MemoryStore implements Store {
  readonly name = 'MemoryStore';
  readonly isSupported = true;

  private _files = new Map<string, { data: Uint8Array; mtime: number }>();
  private _dirs = new Set<string>();

  constructor() {
    this._dirs.add(''); // 根目录
  }

  async init(): Promise<void> {
    // 纯内存结构无须异步加载
  }

  private _ensureParentDirs(path: string): void {
    const segments = path.split('/');
    let current = '';
    for (let i = 0; i < segments.length - 1; i++) {
      current = current ? `${current}/${segments[i]}` : segments[i];
      this._dirs.add(current);
    }
  }

  async *list(): AsyncIterable<EntryMeta> {
    // 1. 枚举非根目录
    for (const dir of this._dirs) {
      if (!dir) continue;
      const { name } = splitPath(dir);
      yield {
        path: dir,
        name,
        kind: 'dir',
      };
    }

    // 2. 枚举所有文件
    for (const [path, entry] of this._files.entries()) {
      const { name } = splitPath(path);
      yield {
        path,
        name,
        kind: 'file',
        size: entry.data.byteLength,
        mtime: entry.mtime,
      };
    }
  }

  async read(path: string): Promise<Uint8Array> {
    const valid = validatePath(path);
    const entry = this._files.get(valid);
    if (!entry) {
      throw new Error(`File not found: "${valid}"`);
    }
    // 返回副本防止外部改写内部数据
    return new Uint8Array(entry.data);
  }

  async write(path: string, data: Uint8Array): Promise<void> {
    const valid = validatePath(path);
    this._ensureParentDirs(valid);

    // 存储浅拷贝字节数组
    this._files.set(valid, {
      data: new Uint8Array(data),
      mtime: Date.now(),
    });
  }

  async mkdir(path: string): Promise<void> {
    const valid = validatePath(path);
    this._ensureParentDirs(valid);
    this._dirs.add(valid);
  }

  async remove(path: string): Promise<void> {
    const valid = validatePath(path);

    // 1. 如果是文件，直接删除
    if (this._files.has(valid)) {
      this._files.delete(valid);
      return;
    }

    // 2. 如果是目录，级联删除所有子项目与自身
    if (this._dirs.has(valid)) {
      this._dirs.delete(valid);
      const prefix = `${valid}/`;

      for (const f of Array.from(this._files.keys())) {
        if (f.startsWith(prefix)) {
          this._files.delete(f);
        }
      }

      for (const d of Array.from(this._dirs)) {
        if (d.startsWith(prefix)) {
          this._dirs.delete(d);
        }
      }
    }
  }

  async stat(path: string): Promise<EntryMeta | null> {
    const valid = validatePath(path);
    const file = this._files.get(valid);
    if (file) {
      const { name } = splitPath(valid);
      return {
        path: valid,
        name,
        kind: 'file',
        size: file.data.byteLength,
        mtime: file.mtime,
      };
    }

    if (this._dirs.has(valid)) {
      const { name } = splitPath(valid);
      return {
        path: valid,
        name,
        kind: 'dir',
      };
    }

    return null;
  }

  async usage(): Promise<StorageUsage> {
    let totalBytes = 0;
    for (const entry of this._files.values()) {
      totalBytes += entry.data.byteLength;
    }
    return {
      used: totalBytes,
      quota: 100 * 1024 * 1024, // 默认虚拟 100MB
    };
  }

  async clear(): Promise<void> {
    this._files.clear();
    this._dirs.clear();
    this._dirs.add('');
  }
}
