// src/modules/storage/DownloadStore.ts
// 纯下载深模块：解耦下载核验与引擎装载，OPFS downloads/ 布局管理，贯彻 I1-I6 不变量与 7 错误码闭集

import type { Store } from './types';
import { MemoryStore } from './MemoryStore';
import { OpfsStore } from './OpfsStore';
import type {
  DownloadRef,
  DownloadRecord,
  DownloadManifest,
  DownloadUnit,
  DownloadSnapshot,
  DownloadFileMeta,
  DownloadProgressCallback,
} from './downloadTypes';
import {
  refToKey,
  keyToRef,
  DownloadError,
} from './downloadTypes';
import type { FetchPort } from './FetchPort';
import { BrowserFetchAdapter, computeSha256 } from './FetchPort';
import type { ForgeCatalog, ForgePackageItem, PackageVersionCandidate } from '../plugins/package/types';

export interface DownloadStoreOptions {
  storage?: Store;
  fetchPort?: FetchPort;
  catalogProvider?: () => Promise<ForgeCatalog> | ForgeCatalog;
  engineBuildProvider?: (lane: string) => Promise<any>;
  laneProvider?: () => string;
  baseUrl?: string;
  maxQuotaBytes?: number;
}

export class DownloadStore {
  private storage: Store;
  private fetchPort: FetchPort;
  private catalogProvider?: () => Promise<ForgeCatalog> | ForgeCatalog;
  private engineBuildProvider?: (lane: string) => Promise<any>;
  private laneProvider?: () => string;
  private baseUrl: string;
  private maxQuotaBytes?: number;

  private manifest: DownloadManifest = { schema: 1, items: {} };
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private activeDownloads: Set<string> = new Set();

  constructor(options?: DownloadStoreOptions) {
    if (options?.storage) {
      this.storage = options.storage;
    } else {
      const opfs = new OpfsStore();
      this.storage = opfs.isSupported ? opfs : new MemoryStore();
    }
    this.fetchPort = options?.fetchPort || new BrowserFetchAdapter();
    this.catalogProvider = options?.catalogProvider;
    this.engineBuildProvider = options?.engineBuildProvider;
    this.laneProvider = options?.laneProvider;
    this.baseUrl = options?.baseUrl || '';
    this.maxQuotaBytes = options?.maxQuotaBytes;
  }

  get isReady(): boolean {
    return this.initialized;
  }

  has(ref: DownloadRef): boolean {
    const key = refToKey(ref);
    return !!this.manifest.items[key];
  }

  isDownloading(ref: DownloadRef): boolean {
    const key = refToKey(ref);
    return this.activeDownloads.has(key);
  }

  getEngineRecord(lane: string): DownloadRecord | null {
    const ref: DownloadRef = lane === 'omc'
      ? { kind: 'engine', name: 'omc', arch: 'wasm32' }
      : { kind: 'engine', name: 'octave', arch: lane };
    return this.getRecord(ref);
  }

  isEngineDownloaded(lane: string): boolean {
    const ref: DownloadRef = lane === 'omc'
      ? { kind: 'engine', name: 'omc', arch: 'wasm32' }
      : { kind: 'engine', name: 'octave', arch: lane };
    return this.has(ref);
  }

  isEngineDownloading(lane: string): boolean {
    const ref: DownloadRef = lane === 'omc'
      ? { kind: 'engine', name: 'omc', arch: 'wasm32' }
      : { kind: 'engine', name: 'octave', arch: lane };
    return this.isDownloading(ref);
  }

  async downloadEngine(
    lane: string,
    options?: { onProgress?: DownloadProgressCallback; signal?: AbortSignal }
  ): Promise<DownloadRecord> {
    const ref: DownloadRef = lane === 'omc'
      ? { kind: 'engine', name: 'omc', arch: 'wasm32' }
      : { kind: 'engine', name: 'octave', arch: lane };
    return this.download(ref, options);
  }

  async removeEngine(lane: string): Promise<void> {
    const ref: DownloadRef = lane === 'omc'
      ? { kind: 'engine', name: 'omc', arch: 'wasm32' }
      : { kind: 'engine', name: 'octave', arch: lane };
    await this.remove(ref);
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      await this.storage.init();
      await this.loadManifest();
      this.initialized = true;
    })();

    return this.initPromise;
  }

  private async loadManifest(): Promise<void> {
    try {
      const exists = await this.storage.stat('downloads/manifest.json');
      if (!exists) {
        this.manifest = { schema: 1, items: {} };
        await this.saveManifest();
        return;
      }
      const data = await this.storage.read('downloads/manifest.json');
      const text = new TextDecoder().decode(data);
      const parsed = JSON.parse(text);
      if (!parsed || parsed.schema !== 1 || typeof parsed.items !== 'object') {
        throw new DownloadError('INDEX_UNREADABLE', 'Invalid manifest format');
      }
      this.manifest = parsed;
    } catch (err: any) {
      if (err instanceof DownloadError) throw err;
      throw new DownloadError('INDEX_UNREADABLE', `Failed to read manifest.json: ${err?.message || err}`);
    }
  }

  private async saveManifest(): Promise<void> {
    try {
      const text = JSON.stringify(this.manifest, null, 2);
      const data = new TextEncoder().encode(text);
      await this.storage.write('downloads/manifest.json', data);
    } catch (err: any) {
      throw new DownloadError('STORAGE_WRITE_FAILED', `Failed to write manifest.json: ${err?.message || err}`);
    }
  }

  /**
   * 存储配额预检 (A5)
   */
  async checkQuota(
    requiredBytes: number,
    options: { throws?: boolean } = { throws: false }
  ): Promise<{ ok: boolean; remaining: number; available: number }> {
    let quota = this.maxQuotaBytes || 0;
    let used = 0;
    try {
      const usage = await this.storage.usage();
      if (usage) {
        if (!quota && usage.quota > 0) quota = usage.quota;
        used = usage.used || 0;
      }
    } catch {}

    const remaining = quota > 0 ? Math.max(0, quota - used) : Infinity;
    const ok = quota === 0 || remaining >= requiredBytes;
    if (!ok && options.throws) {
      throw new DownloadError(
        'STORAGE_QUOTA_EXHAUSTED',
        `Storage quota exhausted: needed ${requiredBytes} B, remaining ${remaining} B`
      );
    }
    return { ok, remaining, available: quota };
  }

  /**
   * 广播 CustomEvent ('octave:download-changed') (A1)
   */
  private broadcastChange(ref: DownloadRef, record: DownloadRecord | null): void {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      try {
        const event = new CustomEvent('octave:download-changed', {
          detail: { ref, record },
        });
        window.dispatchEvent(event);
      } catch {
        // ignore in non-browser testing
      }
    }
  }

  /**
   * 获取全部已下载清单快照
   */
  async index(): Promise<DownloadSnapshot> {
    await this.init();
    let totalBytes = 0;
    let count = 0;
    for (const rec of Object.values(this.manifest.items)) {
      totalBytes += rec.bytes;
      count++;
    }
    return {
      manifest: {
        schema: 1,
        items: { ...this.manifest.items },
      },
      totalBytes,
      count,
    };
  }

  /**
   * 获取单项记录（仅查清单内存缓存）
   */
  getRecord(ref: DownloadRef): DownloadRecord | null {
    const key = refToKey(ref);
    return this.manifest.items[key] || null;
  }

  /**
   * 对账校验与状态核验 (I3 & 用户裁决③)
   * 检查记录的文件是否真实存在于磁盘。若被用户从文件树中手动删除，自动降级移除记录并返回 null
   */
  async stat(ref: DownloadRef): Promise<DownloadRecord | null> {
    await this.init();
    const key = refToKey(ref);
    const rec = this.manifest.items[key];
    if (!rec) return null;

    // 检查核心文件是否真实存在
    for (const f of rec.files) {
      const exists = await this.storage.stat(f.path);
      if (!exists) {
        delete this.manifest.items[key];
        await this.saveManifest();
        this.broadcastChange(ref, null);
        return null;
      }
    }
    return rec;
  }

  /**
   * 装载界面取件 (Blob/Uint8Array 单元)
   */
  async unit(ref: DownloadRef): Promise<DownloadUnit> {
    await this.init();
    const rec = await this.stat(ref);
    if (!rec) {
      throw new DownloadError('NOT_DOWNLOADED', `Asset ${refToKey(ref)} is not downloaded`);
    }

    if (rec.files.length === 0) {
      throw new DownloadError('INDEX_UNREADABLE', `Record ${refToKey(ref)} has no files listed`);
    }

    const primaryFile = rec.files[0];
    const data = await this.storage.read(primaryFile.path);

    const subFiles = new Map<string, Uint8Array>();
    for (let i = 1; i < rec.files.length; i++) {
      const f = rec.files[i];
      const subData = await this.storage.read(f.path);
      subFiles.set(f.path, subData);
    }

    return {
      ref,
      record: rec,
      data,
      subFiles,
    };
  }

  /**
   * 核心下载入口：贯彻 I1-I6 不变量
   * 1. sha 绝不由调用方提供，由目录/manifest 自行解析 (I1)
   * 2. sha 校验通过后原子发布到 manifest.json (I2)
   * 3. 目录哈希漂移自动对账重拉 (I3)
   * 4. 零 Module.FS 依赖 (I4)
   * 5. other-arch 如实保留独立记录 (I6)
   */
  async download(
    ref: DownloadRef,
    options?: { onProgress?: DownloadProgressCallback; signal?: AbortSignal }
  ): Promise<DownloadRecord> {
    await this.init();

    const downloadKey = refToKey(ref);
    this.activeDownloads.add(downloadKey);
    this.broadcastChange(ref, null);

    try {
      // 1. 根据 ref 解析权威源下载目标、文件列表与预期哈希 (I1)
      const resolved = await this.resolveTarget(ref);

    // 2. 检查当日对账与幂等性 (I3)
    const existing = await this.stat(ref);
    if (existing) {
      if (existing.sha256 === resolved.sha256) {
        // 幂等：哈希完全一致且磁盘文件在，直接返回已有记录（零网络开销）
        return existing;
      }
      // 哈希漂移：当日目录已更新，清除旧记录重新下载
      delete this.manifest.items[refToKey(ref)];
      await this.saveManifest();
    }

    // 3. 配额预检 (A5)
    await this.checkQuota(resolved.bytes, { throws: true });

    // 4. 执行多文件抓取与校验 (I2)
    const downloadedFiles: DownloadFileMeta[] = [];
    let accumulatedBytes = 0;

    for (const item of resolved.items) {
      if (options?.signal?.aborted) {
        throw new DownloadError('DOWNLOAD_ABORTED', 'Download operation was cancelled');
      }

      options?.onProgress?.({
        receivedBytes: accumulatedBytes,
        totalBytes: resolved.bytes,
        phase: `Fetching ${item.filename}`,
      });

      const res = await this.fetchPort.fetchBytes(item.url, {
        signal: options?.signal,
        onProgress: (p) => {
          options?.onProgress?.({
            receivedBytes: accumulatedBytes + p.receivedBytes,
            totalBytes: resolved.bytes,
            phase: `Downloading ${item.filename}`,
          });
        },
      });

      if (!res.ok) {
        throw new DownloadError(
          'STORAGE_WRITE_FAILED',
          `HTTP ${res.status} fetching ${item.filename} from ${item.url}`
        );
      }

      // 验证单个文件 SHA256 (I2)
      if (item.sha256 && res.sha256 !== item.sha256) {
        throw new DownloadError(
          'STORAGE_WRITE_FAILED',
          `SHA256 mismatch for ${item.filename}: expected ${item.sha256}, got ${res.sha256}`
        );
      }

      // 写入 OPFS downloads 目标路径
      await this.storage.write(item.destPath, res.data);

      downloadedFiles.push({
        path: item.destPath,
        sha256: res.sha256,
        bytes: res.data.length,
      });

      accumulatedBytes += res.data.length;
    }

    // 5. 核验即发布 (I2)：全部成功后才登记至 manifest.json
    const record: DownloadRecord = {
      ref,
      sha256: resolved.sha256,
      bytes: accumulatedBytes,
      files: downloadedFiles,
      downloadedAt: new Date().toISOString(),
      provenanceUrl: resolved.provenanceUrl,
    };

    const key = refToKey(ref);
    this.manifest.items[key] = record;
    await this.saveManifest();

    // 广播事件 (A1)
    this.broadcastChange(ref, record);

    return record;
    } finally {
      this.activeDownloads.delete(downloadKey);
      this.broadcastChange(ref, this.manifest.items[downloadKey] || null);
    }
  }

  /**
   * 手动移除记录与文件
   */
  async remove(ref: DownloadRef): Promise<void> {
    await this.init();
    const key = refToKey(ref);
    const rec = this.manifest.items[key];
    if (rec) {
      for (const f of rec.files) {
        try {
          await this.storage.remove(f.path);
        } catch {
          // ignore already removed
        }
      }
      delete this.manifest.items[key];
      await this.saveManifest();
      this.broadcastChange(ref, null);
    }
  }

  /**
   * 权威产地解析 (I1：绝不接受调用方传参的 url/sha)
   */
  private async resolveTarget(ref: DownloadRef): Promise<{
    sha256: string;
    bytes: number;
    provenanceUrl: string;
    items: Array<{ filename: string; url: string; destPath: string; sha256?: string }>;
  }> {
    if (ref.kind === 'src') {
      return this.resolveSrcTarget(ref);
    } else if (ref.kind === 'pre') {
      return this.resolvePreTarget(ref);
    } else if (ref.kind === 'engine') {
      return this.resolveEngineTarget(ref);
    } else if (ref.kind === 'runtime') {
      return this.resolveRuntimeTarget(ref);
    }
    throw new DownloadError('FLAVOR_UNAVAILABLE', `Unknown download kind: ${ref.kind}`);
  }

  private async resolveRuntimeTarget(ref: DownloadRef) {
    if (this.catalogProvider) {
      try {
        const cat = await this.catalogProvider();
        const pkg = (cat.packs || []).find((p) => p.name === ref.name);
        if (pkg) {
          const sha256 = (pkg as any).sha256 || 'runtime-sha';
          const bytes = pkg.size || 22000000;
          const filename = `${ref.name}-${ref.version}.tar.gz`;
          const url = (pkg as any).url ? `${this.baseUrl}/${(pkg as any).url}` : `${this.baseUrl}/assets/runtimes/${filename}`;
          const destPath = `downloads/runtime/${ref.name}/${ref.version}/${filename}`;
          return {
            sha256,
            bytes,
            provenanceUrl: url,
            items: [{ filename, url, destPath, sha256 }],
          };
        }
      } catch {}
    }

    // 默认工具链运行时（如 llvm-wasm）
    const filename = `${ref.name}-${ref.version}.tar.gz`;
    const url = `${this.baseUrl}/assets/runtimes/${filename}`;
    const destPath = `downloads/runtime/${ref.name}/${ref.version}/${filename}`;
    const bytes = ref.name.includes('llvm') ? 36700160 : 20000000;
    return {
      sha256: `${ref.name}-${ref.version}-sha`,
      bytes,
      provenanceUrl: url,
      items: [{ filename, url, destPath, sha256: `${ref.name}-${ref.version}-sha` }],
    };
  }

  private async resolveSrcTarget(ref: DownloadRef) {
    if (!this.catalogProvider) {
      throw new DownloadError('INDEX_UNREADABLE', 'Catalog provider not configured');
    }
    let cat: ForgeCatalog;
    try {
      cat = await this.catalogProvider();
    } catch (err: any) {
      throw new DownloadError('INDEX_UNREADABLE', `Failed to load catalog: ${err?.message || err}`);
    }
    const pkg = (cat.packs || []).find((p) => p.name === ref.name);
    if (!pkg) {
      throw new DownloadError('VERSION_WITHHELD', `Package ${ref.name} not found in catalog`);
    }

    const versions = pkg.versions || [
      {
        version: pkg.version,
        stage: 'staged',
        form: pkg.form,
        content: pkg.content,
        size: pkg.size,
        sha256: (pkg as any).sha256,
      },
    ];

    const targetVersion = versions.find((v) => v.version === ref.version);
    if (!targetVersion || targetVersion.stage === 'withheld') {
      throw new DownloadError('VERSION_WITHHELD', `Version ${ref.version} of ${ref.name} is withheld or missing`);
    }

    const sha256 = (targetVersion as any).sha256 || '';
    const bytes = targetVersion.size || 0;
    const filename = `${ref.name}-${ref.version}.tar.gz`;
    const url = `${this.baseUrl}/assets/packages/${filename}`;
    const destPath = `downloads/src/${ref.name}/${ref.version}/${filename}`;

    return {
      sha256,
      bytes,
      provenanceUrl: url,
      items: [{ filename, url, destPath, sha256 }],
    };
  }

  private async resolvePreTarget(ref: DownloadRef) {
    if (!this.catalogProvider) {
      throw new DownloadError('INDEX_UNREADABLE', 'Catalog provider not configured');
    }
    let cat: ForgeCatalog;
    try {
      cat = await this.catalogProvider();
    } catch (err: any) {
      throw new DownloadError('INDEX_UNREADABLE', `Failed to load catalog: ${err?.message || err}`);
    }
    const pkg = (cat.packs || []).find((p) => p.name === ref.name);
    if (!pkg) {
      throw new DownloadError('VERSION_WITHHELD', `Package ${ref.name} not found in catalog`);
    }

    if (!ref.arch) {
      throw new DownloadError('FLAVOR_UNAVAILABLE', `Precompiled package ${ref.name} requires an arch`);
    }

    // 查找 artifacts 匹配当前 arch
    const artifacts = (pkg as any).artifacts || [];
    const matched = artifacts.find((a: any) => a.arch === ref.arch && (!a.version || a.version === ref.version));
    if (!matched) {
      throw new DownloadError(
        'FLAVOR_UNAVAILABLE',
        `No precompiled artifact for ${ref.name}@${ref.version} on arch ${ref.arch}`
      );
    }

    const items: Array<{ filename: string; url: string; destPath: string; sha256?: string }> = [];
    let totalBytes = 0;
    let combinedSha = '';

    const files = matched.files || [{ name: `${ref.name}.oct`, size: matched.size, sha256: matched.sha256 }];
    for (const f of files) {
      const filename = f.name || `${ref.name}.oct`;
      const url = `${this.baseUrl}/assets/packages/${ref.arch}/${filename}`;
      const destPath = `downloads/pre/${ref.name}/${ref.version}/${ref.arch}/${filename}`;
      items.push({ filename, url, destPath, sha256: f.sha256 });
      totalBytes += f.size || 0;
      combinedSha += f.sha256 || '';
    }

    return {
      sha256: combinedSha,
      bytes: totalBytes,
      provenanceUrl: items[0]?.url || '',
      items,
    };
  }

  private async resolveEngineTarget(ref: DownloadRef) {
    const lane = ref.arch || this.laneProvider?.() || 'master';

    if (ref.name === 'omc' || lane === 'omc') {
      // OpenModelica 第二引擎档 (mail/016, 017)
      const filenameWasm = 'OpenModelicaCompiler_bg.wasm';
      const filenameJs = 'OpenModelicaCompiler.js';
      const urlWasm = `${this.baseUrl}/omc/${filenameWasm}`;
      const urlJs = `${this.baseUrl}/omc/${filenameJs}`;

      // 快照估算 71.1 MB wasm + 1.2 MB js
      const bytes = 74579404;
      return {
        sha256: 'omc-lane-sha',
        bytes,
        provenanceUrl: urlWasm,
        items: [
          {
            filename: filenameWasm,
            url: urlWasm,
            destPath: `downloads/engine/omc/${filenameWasm}`,
          },
          {
            filename: filenameJs,
            url: urlJs,
            destPath: `downloads/engine/omc/${filenameJs}`,
          },
        ],
      };
    }

    // Octave 引擎档：从 <site>/lanes/<lane>/octave.build.json 的 measured.files 拿取权威 sha (host-007 §①)
    const lanePath = lane.startsWith('lanes/') ? lane : `lanes/${lane}`;
    let buildManifest: any = null;
    if (this.engineBuildProvider) {
      buildManifest = await this.engineBuildProvider(lane);
    } else {
      const manifestUrl = `${this.baseUrl}/${lanePath}/octave.build.json`.replace(/([^:]\/)\/+/g, '$1');
      buildManifest = await this.fetchPort.fetchJSON(manifestUrl);
    }

    if (!buildManifest || !buildManifest.measured || !buildManifest.measured.files) {
      throw new DownloadError('INDEX_UNREADABLE', `Invalid octave.build.json for lane ${lane}`);
    }

    const files = buildManifest.measured.files as Record<string, { sha256: string; bytes: number }>;
    const items: Array<{ filename: string; url: string; destPath: string; sha256?: string }> = [];
    let totalBytes = 0;
    let combinedSha = '';

    for (const [filename, meta] of Object.entries(files)) {
      const url = `${this.baseUrl}/${lanePath}/${filename}`.replace(/([^:]\/)\/+/g, '$1');
      const destPath = `downloads/engine/${lane}/${filename}`;
      items.push({ filename, url, destPath, sha256: meta.sha256 });
      totalBytes += meta.bytes;
      combinedSha += meta.sha256;
    }

    return {
      sha256: combinedSha,
      bytes: totalBytes,
      provenanceUrl: `${this.baseUrl}/${lanePath}/octave.build.json`.replace(/([^:]\/)\/+/g, '$1'),
      items,
    };
  }
}

export function createDownloadStore(options?: DownloadStoreOptions): DownloadStore {
  return new DownloadStore(options);
}
