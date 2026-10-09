// src/modules/storage/types.ts
// 存储端口抽象、POSIX 路径安全校验工具与工作区元数据定义

export type EntryKind = 'file' | 'dir';

export interface EntryMeta {
  path: string;
  name: string;
  kind: EntryKind;
  size?: number;
  mtime?: number;
}

export interface FileTreeNode {
  path: string;
  name: string;
  kind: EntryKind;
  size?: number;
  mtime?: number;
  children?: FileTreeNode[];
}

export interface StorageUsage {
  used: number;
  quota: number;
}

export interface ImportedFile {
  path: string;
  data: Uint8Array;
}

/**
 * 微内核 Store 接口
 * 无论是 OPFS 还是 MemoryStore，均必须完整实现该契约
 */
export interface Store {
  readonly name: string;
  readonly isSupported: boolean;
  init(): Promise<void>;
  list(): AsyncIterable<EntryMeta>;
  read(path: string): Promise<Uint8Array>;
  write(path: string, data: Uint8Array): Promise<void>;
  remove(path: string): Promise<void>;
  mkdir(path: string): Promise<void>;
  stat(path: string): Promise<EntryMeta | null>;
  usage(): Promise<StorageUsage>;
  clear(): Promise<void>;
}

/**
 * POSIX 路径安全标准化函数
 * 严防 Zip-Slip 漏洞、拒绝绝对路径、拒绝带有 '..' 的非法回退、统一斜杠
 */
export function validatePath(rawPath: string): string {
  if (!rawPath || typeof rawPath !== 'string') {
    throw new Error('Invalid path: path must be a non-empty string');
  }

  // 1. 将 Windows 反斜杠转换为标准 POSIX 正斜杠
  let normalized = rawPath.replace(/\\/g, '/');

  // 2. 移除前置斜杠（强制为相对于工作区根目录的相对路径）
  while (normalized.startsWith('/')) {
    normalized = normalized.slice(1);
  }

  // 3. 移除末尾斜杠
  while (normalized.endsWith('/') && normalized.length > 1) {
    normalized = normalized.slice(0, -1);
  }

  // 4. 禁止空路径
  if (!normalized || normalized === '.') {
    throw new Error('Invalid path: empty relative path is not permitted');
  }

  // 5. 禁止包含空字符或控制字符
  if (/[\x00-\x1f\x7f]/.test(normalized)) {
    throw new Error('Invalid path: contains null or control characters');
  }

  // 6. 分段检查防穿越
  const segments = normalized.split('/').filter(Boolean);
  for (const seg of segments) {
    if (seg === '..' || seg === '.') {
      throw new Error(`Invalid path security violation: traversal token "${seg}" is forbidden`);
    }
    // 禁止冒号等驱动器符号
    if (seg.includes(':')) {
      throw new Error(`Invalid path: segment "${seg}" contains illegal colon`);
    }
  }

  return segments.join('/');
}

/**
 * 路径组合助手
 */
export function joinPath(...segments: string[]): string {
  const cleanSegments = segments
    .map((s) => s.replace(/\\/g, '/').replace(/^\/+|\/+$/g, ''))
    .filter(Boolean);

  if (cleanSegments.length === 0) return '';
  return validatePath(cleanSegments.join('/'));
}

/**
 * 路径拆分助手（目录路径与基名）
 */
export function splitPath(path: string): { dir: string; name: string } {
  const valid = validatePath(path);
  const idx = valid.lastIndexOf('/');
  if (idx === -1) {
    return { dir: '', name: valid };
  }
  return {
    dir: valid.slice(0, idx),
    name: valid.slice(idx + 1),
  };
}
