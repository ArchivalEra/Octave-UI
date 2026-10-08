// src/modules/workspace/DirectoryAdapter.ts
// 文件系统隔离层：支持浏览器原生 File System Access API 与测试用内存适配器

export interface FileEntry {
  name: string;
  kind: 'file' | 'directory';
  size?: number;
  lastModified?: number;
}

export interface DirectoryAdapter {
  readonly isMounted: boolean;
  readonly directoryName: string | null;
  isSupported(): boolean;
  mount(): Promise<boolean>;
  disconnect(): void;
  list(): Promise<FileEntry[]>;
  readText(path: string): Promise<string>;
  writeText(path: string, content: string): Promise<void>;
  remove(path: string): Promise<void>;
}

const IDB_NAME = 'octave_workspace_db';
const IDB_STORE = 'handles';
const IDB_KEY = 'root_dir';

/**
 * IndexedDB 极简操作辅助，避免引入厚重第三方库
 */
function openHandleDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB not supported in current environment'));
    }
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getStoredHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openHandleDB();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(IDB_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function setStoredHandle(handle: FileSystemDirectoryHandle | null): Promise<void> {
  try {
    const db = await openHandleDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      const req = handle ? store.put(handle, IDB_KEY) : store.delete(IDB_KEY);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // Ignore IDB errors in fallback environments
  }
}

/**
 * 生产环境适配器：基于浏览器原生 File System Access API
 * 支持一次授权后跨刷新持久化句柄
 */
export class FSAccessDirectoryAdapter implements DirectoryAdapter {
  private _handle: FileSystemDirectoryHandle | null = null;
  private _isFallbackMounted: boolean = false;
  private _fallbackDirName: string | null = null;
  private _fallbackFiles = new Map<string, { name: string; text: string; size: number; lastModified: number }>();

  get isMounted(): boolean {
    return this._handle !== null || this._isFallbackMounted;
  }

  get directoryName(): string | null {
    if (this._handle) return this._handle.name;
    if (this._isFallbackMounted) return this._fallbackDirName;
    return null;
  }

  isSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      'showDirectoryPicker' in window &&
      typeof (window as any).showDirectoryPicker === 'function'
    );
  }

  /**
   * 尝试从 IndexedDB 恢复先前的句柄（页面加载时静默尝试）
   */
  async restorePreviousSession(): Promise<boolean> {
    if (!this.isSupported()) return false;
    try {
      const handle = await getStoredHandle();
      if (!handle) return false;

      // 验证权限
      const perm = await (handle as any).queryPermission({ mode: 'readwrite' });
      if (perm === 'granted') {
        this._handle = handle;
        return true;
      }
    } catch {
      // 句柄过期或受限
    }
    return false;
  }

  /**
   * 用户显式调用唤起文件夹选择
   * 支持优先使用原生 File System Access API，不兼容或受限时优雅降级至 HTML5 webkitdirectory
   */
  async mount(): Promise<boolean> {
    if (this.isSupported()) {
      try {
        const picker = (window as any).showDirectoryPicker;
        const handle: FileSystemDirectoryHandle = await picker({
          mode: 'readwrite',
        });

        this._handle = handle;
        this._isFallbackMounted = false;
        await setStoredHandle(handle);
        return true;
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          // 用户主动取消选择
          return false;
        }
        // 若原生 picker 抛出 SecurityError / NotAllowedError，尝试降级
        return await this._fallbackInputMount();
      }
    }

    // 非 Chromium / 不支持 showDirectoryPicker 环境：调用通用 webkitdirectory 降级
    return await this._fallbackInputMount();
  }

  private _fallbackInputMount(): Promise<boolean> {
    return new Promise((resolve) => {
      if (typeof document === 'undefined') {
        resolve(false);
        return;
      }

      const input = document.createElement('input');
      input.type = 'file';
      input.setAttribute('webkitdirectory', '');
      input.setAttribute('directory', '');
      input.setAttribute('multiple', '');
      input.style.position = 'fixed';
      input.style.top = '-9999px';
      input.style.opacity = '0';
      document.body.appendChild(input);

      input.onchange = async () => {
        const fileList = input.files;
        if (!fileList || fileList.length === 0) {
          try { document.body.removeChild(input); } catch {}
          resolve(false);
          return;
        }

        const first = fileList[0];
        const rawPath = first.webkitRelativePath || first.name;
        const parts = rawPath.split('/');
        const dirName = parts.length > 1 ? parts[0] : 'local_directory';
        this._fallbackDirName = dirName;
        this._fallbackFiles.clear();

        for (let i = 0; i < fileList.length; i++) {
          const file = fileList[i];
          const fullPath = file.webkitRelativePath || file.name;
          const relName = fullPath.startsWith(dirName + '/')
            ? fullPath.slice(dirName.length + 1)
            : fullPath;
          if (relName.startsWith('.') || relName.includes('/.')) continue;

          try {
            const text = await file.text();
            this._fallbackFiles.set(relName, {
              name: relName,
              text,
              size: file.size,
              lastModified: file.lastModified,
            });
          } catch {}
        }

        this._isFallbackMounted = true;
        try { document.body.removeChild(input); } catch {}
        resolve(true);
      };

      input.oncancel = () => {
        try { document.body.removeChild(input); } catch {}
        resolve(false);
      };

      input.click();
    });
  }

  disconnect(): void {
    this._handle = null;
    this._isFallbackMounted = false;
    this._fallbackDirName = null;
    this._fallbackFiles.clear();
    void setStoredHandle(null);
  }

  async list(): Promise<FileEntry[]> {
    if (!this.isMounted) throw new Error('No directory mounted');

    if (this._handle) {
      const entries: FileEntry[] = [];
      for await (const [name, handle] of (this._handle as any).entries()) {
        if (name.startsWith('.')) continue; // 忽略隐藏文件
        if (handle.kind === 'file') {
          try {
            const file = await handle.getFile();
            entries.push({
              name,
              kind: 'file',
              size: file.size,
              lastModified: file.lastModified,
            });
          } catch {}
        } else if (handle.kind === 'directory') {
          entries.push({
            name,
            kind: 'directory',
          });
        }
      }

      return entries.sort((a, b) => {
        if (a.kind === b.kind) return a.name.localeCompare(b.name);
        return a.kind === 'directory' ? -1 : 1;
      });
    }

    // 降级模式列表
    const entries: FileEntry[] = [];
    for (const item of this._fallbackFiles.values()) {
      entries.push({
        name: item.name,
        kind: 'file',
        size: item.size,
        lastModified: item.lastModified,
      });
    }
    return entries.sort((a, b) => a.name.localeCompare(b.name));
  }

  async readText(path: string): Promise<string> {
    if (!this.isMounted) throw new Error('No directory mounted');

    if (this._handle) {
      const fileHandle = await this._handle.getFileHandle(path);
      const file = await fileHandle.getFile();
      return await file.text();
    }

    const item = this._fallbackFiles.get(path);
    if (!item) throw new Error(`File not found: ${path}`);
    return item.text;
  }

  async writeText(path: string, content: string): Promise<void> {
    if (!this.isMounted) throw new Error('No directory mounted');

    if (this._handle) {
      const fileHandle = await this._handle.getFileHandle(path, { create: true });
      const writable = await (fileHandle as any).createWritable();
      await writable.write(content);
      await writable.close();
      return;
    }

    this._fallbackFiles.set(path, {
      name: path,
      text: content,
      size: new Blob([content]).size,
      lastModified: Date.now(),
    });
  }

  async remove(path: string): Promise<void> {
    if (!this.isMounted) throw new Error('No directory mounted');

    if (this._handle) {
      await this._handle.removeEntry(path);
      return;
    }

    this._fallbackFiles.delete(path);
  }
}

/**
 * 内存虚拟目录适配器：用于自动化测试及不支持 FSAccess API 的兜底环境
 */
export class VirtualMemoryDirectoryAdapter implements DirectoryAdapter {
  private _mounted = false;
  private _dirName: string | null = null;
  private _files = new Map<string, { content: string; mtime: number }>();

  constructor(initialDirName = 'VirtualWorkspace') {
    this._dirName = initialDirName;
  }

  get isMounted(): boolean {
    return this._mounted;
  }

  get directoryName(): string | null {
    return this._mounted ? this._dirName : null;
  }

  isSupported(): boolean {
    return true;
  }

  async mount(): Promise<boolean> {
    this._mounted = true;
    return true;
  }

  disconnect(): void {
    this._mounted = false;
  }

  async list(): Promise<FileEntry[]> {
    if (!this._mounted) throw new Error('No directory mounted');
    const entries: FileEntry[] = [];
    for (const [name, meta] of this._files.entries()) {
      entries.push({
        name,
        kind: 'file',
        size: meta.content.length,
        lastModified: meta.mtime,
      });
    }
    return entries.sort((a, b) => a.name.localeCompare(b.name));
  }

  async readText(path: string): Promise<string> {
    if (!this._mounted) throw new Error('No directory mounted');
    const item = this._files.get(path);
    if (!item) throw new Error(`File not found: ${path}`);
    return item.content;
  }

  async writeText(path: string, content: string): Promise<void> {
    if (!this._mounted) throw new Error('No directory mounted');
    this._files.set(path, { content, mtime: Date.now() });
  }

  async remove(path: string): Promise<void> {
    if (!this._mounted) throw new Error('No directory mounted');
    if (!this._files.has(path)) throw new Error(`File not found: ${path}`);
    this._files.delete(path);
  }
}
