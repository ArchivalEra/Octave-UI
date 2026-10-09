// src/modules/storage/WorkspaceStorageManager.ts
// 工作区存储唯一深模块：统管底层 Store 适配、层级目录树构建、三大导入/导出与 Wasm MEMFS 二进制桥接

import {
  type Store,
  type EntryMeta,
  type FileTreeNode,
  type ImportedFile,
  validatePath,
  splitPath,
} from './types';
import { MemoryStore } from './MemoryStore';
import { OpfsStore } from './OpfsStore';
import { pickFolder, fromDroppedEntries, fromZip } from './ImportSources';
import { createZip, downloadFile } from './ExportService';
import type { EngineSupervisor } from '../engine/EngineSupervisor';

export interface StorageStats {
  filesCount: number;
  totalBytes: number;
  usedBytes: number;
  quota: number;
  storageType: 'opfs' | 'memory';
}

export class WorkspaceStorageManager {
  private _store: Store;
  private _isInitialized = false;
  private _storageType: 'opfs' | 'memory' = 'memory';

  private _tree: FileTreeNode[] = [];
  private _entries: EntryMeta[] = [];
  private _activeFile: string | null = null;
  private _listeners: Set<() => void> = new Set();

  constructor(preferredStore?: Store) {
    if (preferredStore) {
      this._store = preferredStore;
      this._storageType = preferredStore instanceof OpfsStore ? 'opfs' : 'memory';
    } else {
      const opfs = new OpfsStore();
      if (opfs.isSupported) {
        this._store = opfs;
        this._storageType = 'opfs';
      } else {
        this._store = new MemoryStore();
        this._storageType = 'memory';
      }
    }
  }

  get store(): Store {
    return this._store;
  }

  get storageType(): 'opfs' | 'memory' {
    return this._storageType;
  }

  get isMounted(): boolean {
    return this._isInitialized && this._entries.length > 0;
  }

  get tree(): FileTreeNode[] {
    return this._tree;
  }

  get entries(): EntryMeta[] {
    return [...this._entries];
  }

  get activeFile(): string | null {
    return this._activeFile;
  }

  subscribe(cb: () => void): () => void {
    this._listeners.add(cb);
    return () => this._listeners.delete(cb);
  }

  private _notify(): void {
    for (const cb of this._listeners) {
      try {
        cb();
      } catch (err) {
        console.error('[WorkspaceStorageManager] listener error:', err);
      }
    }
  }

  async init(): Promise<void> {
    if (this._isInitialized) return;

    try {
      await this._store.init();
    } catch (err) {
      console.warn('[WorkspaceStorageManager] Preferred store init failed, falling back to MemoryStore:', err);
      this._store = new MemoryStore();
      this._storageType = 'memory';
      await this._store.init();
    }

    this._isInitialized = true;
    await this.refresh();
  }

  async refresh(): Promise<void> {
    if (!this._isInitialized) {
      await this.init();
    }

    const collected: EntryMeta[] = [];
    for await (const item of this._store.list()) {
      collected.push(item);
    }
    this._entries = collected;
    this._tree = this._buildTree(collected);

    // 若当前活跃文件已被删除，则重置为 null 或首个 .m 文件
    if (this._activeFile && !collected.some((e) => e.path === this._activeFile && e.kind === 'file')) {
      const firstM = collected.find((e) => e.kind === 'file' && e.name.endsWith('.m'));
      this._activeFile = firstM ? firstM.path : null;
    } else if (!this._activeFile) {
      const firstM = collected.find((e) => e.kind === 'file' && e.name.endsWith('.m'));
      if (firstM) {
        this._activeFile = firstM.path;
      }
    }

    this._notify();
  }

  private _buildTree(entries: EntryMeta[]): FileTreeNode[] {
    const nodeMap = new Map<string, FileTreeNode>();
    const roots: FileTreeNode[] = [];

    // 1. 初始化各节点
    for (const e of entries) {
      nodeMap.set(e.path, {
        path: e.path,
        name: e.name,
        kind: e.kind,
        size: e.size,
        mtime: e.mtime,
        children: e.kind === 'dir' ? [] : undefined,
      });
    }

    // 2. 组装父子层级关系
    for (const e of entries) {
      const node = nodeMap.get(e.path)!;
      const { dir } = splitPath(e.path);
      if (!dir) {
        roots.push(node);
      } else {
        const parent = nodeMap.get(dir);
        if (parent && parent.children) {
          parent.children.push(node);
        } else {
          // 兜底：如果父目录未显式列出，挂在根层级
          roots.push(node);
        }
      }
    }

    // 3. 排序：目录优先，其次按名称字母升序
    function sortNodes(nodes: FileTreeNode[]): FileTreeNode[] {
      nodes.sort((a, b) => {
        if (a.kind !== b.kind) {
          return a.kind === 'dir' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
      for (const n of nodes) {
        if (n.children) {
          sortNodes(n.children);
        }
      }
      return nodes;
    }

    return sortNodes(roots);
  }

  // --- 导入与导出操作 ---

  async importFiles(files: ImportedFile[]): Promise<number> {
    if (!this._isInitialized) await this.init();

    let count = 0;
    for (const f of files) {
      try {
        await this._store.write(f.path, f.data);
        count++;
      } catch (err) {
        console.warn('[WorkspaceStorageManager] Failed to write imported file:', f.path, err);
      }
    }

    await this.refresh();
    return count;
  }

  async importFromPicker(): Promise<number> {
    const files = await pickFolder();
    return await this.importFiles(files);
  }

  async importFromDrop(dataTransfer: DataTransfer): Promise<number> {
    const files = await fromDroppedEntries(dataTransfer);
    return await this.importFiles(files);
  }

  async importFromZip(source: Uint8Array | File | Blob): Promise<number> {
    const files = await fromZip(source);
    return await this.importFiles(files);
  }

  async exportAsZip(filename = 'octave-workspace.zip'): Promise<void> {
    if (!this._isInitialized) await this.init();

    const fileEntries: Array<{ path: string; data: Uint8Array }> = [];
    for (const entry of this._entries) {
      if (entry.kind === 'file') {
        const data = await this._store.read(entry.path);
        fileEntries.push({ path: entry.path, data });
      }
    }

    if (fileEntries.length === 0) {
      throw new Error('Workspace is empty, nothing to export');
    }

    const zipData = await createZip(fileEntries);
    downloadFile(zipData, filename);
  }

  // --- 文件与目录 CRUD ---

  async readFile(path: string): Promise<Uint8Array> {
    if (!this._isInitialized) await this.init();
    return await this._store.read(path);
  }

  async readText(path: string): Promise<string> {
    const bytes = await this.readFile(path);
    return new TextDecoder('utf-8').decode(bytes);
  }

  async writeFile(path: string, content: Uint8Array | string): Promise<void> {
    if (!this._isInitialized) await this.init();

    const data = typeof content === 'string'
      ? new TextEncoder().encode(content)
      : content;

    await this._store.write(path, data);
    await this.refresh();
  }

  async createDirectory(path: string): Promise<void> {
    if (!this._isInitialized) await this.init();
    await this._store.mkdir(path);
    await this.refresh();
  }

  async deleteEntry(path: string): Promise<void> {
    if (!this._isInitialized) await this.init();
    await this._store.remove(path);
    if (this._activeFile === path) {
      this._activeFile = null;
    }
    await this.refresh();
  }

  async clearWorkspace(): Promise<void> {
    if (!this._isInitialized) await this.init();
    await this._store.clear();
    this._activeFile = null;
    await this.refresh();
  }

  setActiveFile(path: string | null): void {
    if (this._activeFile !== path) {
      this._activeFile = path ? validatePath(path) : null;
      this._notify();
    }
  }

  async getStats(): Promise<StorageStats> {
    const usage = await this._store.usage();
    let totalBytes = 0;
    let filesCount = 0;

    for (const e of this._entries) {
      if (e.kind === 'file') {
        filesCount++;
        totalBytes += e.size || 0;
      }
    }

    return {
      filesCount,
      totalBytes,
      usedBytes: usage.used,
      quota: usage.quota,
      storageType: this._storageType,
    };
  }

  // --- Octave Wasm MEMFS 二进制桥接 ---

  /**
   * 将工作区的所有文件镜像到 Octave Wasm 虚拟文件系统 (/home/web_user/workspace/)
   */
  async syncToEngine(supervisor: EngineSupervisor): Promise<number> {
    if (!this._isInitialized) await this.init();
    if (!supervisor.isReady) return 0;

    let syncedCount = 0;
    const WORKSPACE_MOUNT_DIR = '/home/web_user/workspace';

    for (const entry of this._entries) {
      if (entry.kind === 'file') {
        try {
          const data = await this._store.read(entry.path);
          const memfsPath = `${WORKSPACE_MOUNT_DIR}/${entry.path}`;

          // 二进制安全写入 Wasm MEMFS
          supervisor.fsWrite(memfsPath, data);

          // 同时兼容性写入根目录直接引用 (如果是一级文件)
          if (!entry.path.includes('/')) {
            supervisor.fsWrite(`/home/web_user/${entry.path}`, data);
          }
          syncedCount++;
        } catch (err) {
          console.warn('[WorkspaceStorageManager] Sync file to engine failed:', entry.path, err);
        }
      }
    }

    // 在 Octave 中注册 workspace 路径
    if (syncedCount > 0) {
      try {
        await supervisor.eval(
          `addpath('${WORKSPACE_MOUNT_DIR}'); if exist('${WORKSPACE_MOUNT_DIR}', 'dir'), addpath(genpath('${WORKSPACE_MOUNT_DIR}')); endif;`
        );
      } catch (e) {
        console.warn('[WorkspaceStorageManager] Failed to run addpath in engine:', e);
      }
    }

    return syncedCount;
  }

  /**
   * 将在 Octave 运行时由脚本新产生的文件（如 save('out.mat')）捕获并写回工作区
   */
  async syncFromEngine(supervisor: EngineSupervisor): Promise<number> {
    if (!this._isInitialized) await this.init();
    if (!supervisor.isReady) return 0;

    let recoveredCount = 0;
    const WORKSPACE_MOUNT_DIR = '/home/web_user/workspace';

    try {
      const memfsEntries = supervisor.fsLs(WORKSPACE_MOUNT_DIR);
      for (const entry of memfsEntries) {
        if (!entry.dir) {
          const relPath = entry.name;
          // 若工作区中尚不存在此文件，或者需要回写
          const exists = this._entries.some((e) => e.path === relPath && e.kind === 'file');
          if (!exists) {
            try {
              const textOrRaw = supervisor.fsRead(`${WORKSPACE_MOUNT_DIR}/${relPath}`);
              await this.writeFile(relPath, textOrRaw);
              recoveredCount++;
            } catch {}
          }
        }
      }
    } catch {}

    if (recoveredCount > 0) {
      await this.refresh();
    }

    return recoveredCount;
  }
}
