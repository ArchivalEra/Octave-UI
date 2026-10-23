// src/modules/storage/downloadTypes.ts
// 纯下载模块 (DownloadStore) 核心类型代数与 7 错误码封闭集（落实 mail/009, mail/010, host-007, host-008）

export type DownloadKind = 'src' | 'pre' | 'engine';

/**
 * 资产唯一身份引用代数（用户裁决②：包与引擎共用统一代数）
 * - kind === 'src'   => arch = null（源码包无架构概念）
 * - kind === 'pre'   => arch = 'wasm32' | 'wasm64'（多档并存允许）
 * - kind === 'engine'=> name = 'octave' | 'omc', arch = lane (wasm32-final | master | IllegalPerformance | omc)
 */
export interface DownloadRef {
  name: string;
  version: string;
  kind: DownloadKind;
  arch: string | null;
}

/**
 * 产生身份键（用于 Map 与 manifest 索引）
 */
export function refToKey(ref: DownloadRef): string {
  return `${ref.kind}:${ref.name}@${ref.version}${ref.arch ? `:${ref.arch}` : ''}`;
}

/**
 * 引擎 ref 的唯一构造产地（wayfinder #10 Q10.4「ref 代数收单」）。
 *
 * 此前 DownloadStore 内 7 处手写 `{kind:'engine', name, version, arch}` 构造、
 * 版本字面量散布 19 处——054 审计点名 omc 的 '1.25.0' 是编造版本号（omc 真实
 * 返回 "-rust"，Q6C 裁定版本如实）。本工厂收单后：
 *   · omc 车道：name='omc'，version='-rust'（如实，不编造）
 *   · octave 档：name='octave'，version='11.3.0'
 *   · arch 由调用方给（`${lane}/${variant}` 档位形 或 'wasm32'/lane 平铺形）
 * 版本字面量只允许出现在这一处；`grep -c "1.25.0" src/` 必须为 0。
 */
export function engineRef(name: 'octave' | 'omc', arch: string): DownloadRef {
  return name === 'omc'
    ? { name: 'omc', version: '-rust', kind: 'engine', arch }
    : { name: 'octave', version: '11.3.0', kind: 'engine', arch };
}

export function keyToRef(key: string): DownloadRef {
  const colonIdx = key.indexOf(':');
  const atIdx = key.indexOf('@');
  if (colonIdx === -1 || atIdx === -1) {
    throw new Error(`Invalid download key: ${key}`);
  }
  const kind = key.slice(0, colonIdx) as DownloadKind;
  const name = key.slice(colonIdx + 1, atIdx);
  const rest = key.slice(atIdx + 1);
  const secondColon = rest.indexOf(':');
  if (secondColon === -1) {
    return { name, version: rest, kind, arch: null };
  }
  return {
    name,
    version: rest.slice(0, secondColon),
    kind,
    arch: rest.slice(secondColon + 1),
  };
}

export interface DownloadFileMeta {
  path: string;
  sha256: string;
  bytes: number;
}

/**
 * 已下载并过账的资产单项记录
 *
 * #12 Q12.2：顶层 sha256 仅单文件下载有真值（该文件自身指纹）；
 * 多文件下载无聚合指纹（拼接串是装饰不是对账真源）⇒ undefined。
 * 对账一律走 files[] 逐件三元组（path/sha256/bytes）。
 */
export interface DownloadRecord {
  ref: DownloadRef;
  sha256: string | undefined;
  bytes: number;
  files: DownloadFileMeta[];
  downloadedAt: string;
  provenanceUrl?: string;
}

/**
 * OPFS 接缝记录 downloads/manifest.json
 */
export interface DownloadManifest {
  schema: 1;
  items: Record<string, DownloadRecord>;
}

/**
 * 装载界面取件单元（句柄/二进制块，非物理路径）
 */
export interface DownloadUnit {
  ref: DownloadRef;
  record: DownloadRecord;
  data: Uint8Array;
  subFiles?: Map<string, Uint8Array>;
}

export interface DownloadSnapshot {
  manifest: DownloadManifest;
  totalBytes: number;
  count: number;
}

export interface DownloadProgress {
  receivedBytes: number;
  totalBytes: number | null;
  phase?: string;
}

export type DownloadProgressCallback = (progress: DownloadProgress) => void;

/**
 * 7 错误码封闭集（host-007 §④ & mail/012 A5）
 * state in ('not-found', 'failed', 'cannot-know')
 */
export type DownloadErrorCode =
  | 'NOT_DOWNLOADED'
  | 'VERSION_WITHHELD'
  | 'FLAVOR_UNAVAILABLE'
  | 'STORAGE_WRITE_FAILED'
  | 'DOWNLOAD_ABORTED'
  | 'INDEX_UNREADABLE'
  | 'STORAGE_QUOTA_EXHAUSTED';

export type ErrorState = 'not-found' | 'failed' | 'cannot-know';

export interface ErrorCodeMeta {
  code: DownloadErrorCode;
  state: ErrorState;
  cause: string;
}

export const DOWNLOAD_ERROR_SPECS: Record<DownloadErrorCode, { state: ErrorState; cause: string }> = {
  NOT_DOWNLOADED: { state: 'not-found', cause: 'not-downloaded' },
  VERSION_WITHHELD: { state: 'not-found', cause: 'version-withheld' },
  FLAVOR_UNAVAILABLE: { state: 'not-found', cause: 'flavor-unavailable' },
  STORAGE_WRITE_FAILED: { state: 'failed', cause: 'storage-write-failed' },
  DOWNLOAD_ABORTED: { state: 'failed', cause: 'download-aborted' },
  INDEX_UNREADABLE: { state: 'cannot-know', cause: 'index-unreadable' },
  STORAGE_QUOTA_EXHAUSTED: { state: 'failed', cause: 'storage-quota-exhausted' },
};

export class DownloadError extends Error {
  readonly code: DownloadErrorCode;
  readonly state: ErrorState;
  readonly cause: string;

  constructor(code: DownloadErrorCode, message?: string) {
    const spec = DOWNLOAD_ERROR_SPECS[code];
    super(message || `Download error: ${code} (${spec.state}/${spec.cause})`);
    this.name = 'DownloadError';
    this.code = code;
    this.state = spec.state;
    this.cause = spec.cause;
  }
}
