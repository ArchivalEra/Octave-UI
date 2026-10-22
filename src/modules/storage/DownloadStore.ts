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
import { EngineAssetResolver } from '../engine/EngineAssetResolver';

export interface DownloadStoreOptions {
  storage?: Store;
  fetchPort?: FetchPort;
  catalogProvider?: () => Promise<ForgeCatalog> | ForgeCatalog;
  engineBuildProvider?: (lane: string) => Promise<any>;
  laneProvider?: () => string;
  baseUrl?: string;
  maxQuotaBytes?: number;
}

export const KNOWN_RUNTIME_METADATA: Record<string, { bytes: number; sha256: string }> = {
  'llvm-wasm@6.0.12': {
    bytes: 34693729,
    sha256: 'cd6450fe7944875cb39f8e4a0790d5a08e032044f1db89054dadcabb749b20ce',
  },
  'pyodide@314.0.7': {
    bytes: 13742761,
    sha256: '6a4976babd0cb34c8906e4847405614db92c70588b42f27d7612898c3debbd76',
  },
};

export const KNOWN_ENGINE_METADATA: Record<
  string,
  {
    bytes: number;
    sha256: string;
    files: Record<string, { bytes: number; sha256: string }>;
  }
> = {
  'omc@1.25.0': {
    bytes: 74635990,
    sha256: '8287589ebdb53b4cc37c337c2ae88f798d8889f7ac3c29d693ca12e539b8d00156c399bd455d57c8e21206287445643b81db6fd4e3ac183989616b903d165f17',
    files: {
      'OpenModelicaCompiler_bg.wasm': {
        bytes: 74579404,
        sha256: '8287589ebdb53b4cc37c337c2ae88f798d8889f7ac3c29d693ca12e539b8d001',
      },
      'OpenModelicaCompiler.js': {
        bytes: 56586,
        sha256: '56c399bd455d57c8e21206287445643b81db6fd4e3ac183989616b903d165f17',
      },
    },
  },
};

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

    if (options?.baseUrl !== undefined && options.baseUrl !== '') {
      this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    } else {
      let detectedBase = '';
      if (typeof document !== 'undefined') {
        const meta = document.querySelector('meta[name="site-base"]');
        detectedBase = meta?.getAttribute('content') || (window as any).__siteBase || '';
      }
      if (!detectedBase && typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) {
        detectedBase = import.meta.env.BASE_URL;
      }
      this.baseUrl = (detectedBase || '').replace(/\/+$/, '');
    }

    this.maxQuotaBytes = options?.maxQuotaBytes;
  }

  resolveUrl(subPath: string): string {
    const cleanSub = subPath.startsWith('/') ? subPath : `/${subPath}`;
    return `${this.baseUrl}${cleanSub}`.replace(/([^:]\/)\/+/g, '$1');
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

  getEngineRecord(lane: string, variant?: 'w64' | 'w32'): DownloadRecord | null {
    const is64 = lane === 'master' || lane === 'IllegalPerformance';
    const v = variant || (is64 ? 'w64' : 'w32');
    const refWithVariant: DownloadRef = lane === 'omc'
      ? { kind: 'engine', name: 'omc', version: '1.25.0', arch: `omc/${v}` }
      : { kind: 'engine', name: 'octave', version: '11.3.0', arch: `${lane}/${v}` };
    const rec = this.getRecord(refWithVariant);
    if (rec) return rec;

    const refSimple: DownloadRef = lane === 'omc'
      ? { kind: 'engine', name: 'omc', version: '1.25.0', arch: 'wasm32' }
      : { kind: 'engine', name: 'octave', version: '11.3.0', arch: lane };
    return this.getRecord(refSimple);
  }

  isEngineDownloaded(lane: string, variant?: 'w64' | 'w32'): boolean {
    const is64 = lane === 'master' || lane === 'IllegalPerformance';
    const v = variant || (is64 ? 'w64' : 'w32');
    const refWithVariant: DownloadRef = lane === 'omc'
      ? { kind: 'engine', name: 'omc', version: '1.25.0', arch: `omc/${v}` }
      : { kind: 'engine', name: 'octave', version: '11.3.0', arch: `${lane}/${v}` };
    const refSimple: DownloadRef = lane === 'omc'
      ? { kind: 'engine', name: 'omc', version: '1.25.0', arch: 'wasm32' }
      : { kind: 'engine', name: 'octave', version: '11.3.0', arch: lane };
    return this.has(refWithVariant) || this.has(refSimple);
  }

  isEngineDownloading(lane: string, variant?: 'w64' | 'w32'): boolean {
    const is64 = lane === 'master' || lane === 'IllegalPerformance';
    const v = variant || (is64 ? 'w64' : 'w32');
    const refWithVariant: DownloadRef = lane === 'omc'
      ? { kind: 'engine', name: 'omc', version: '1.25.0', arch: `omc/${v}` }
      : { kind: 'engine', name: 'octave', version: '11.3.0', arch: `${lane}/${v}` };
    const refSimple: DownloadRef = lane === 'omc'
      ? { kind: 'engine', name: 'omc', version: '1.25.0', arch: 'wasm32' }
      : { kind: 'engine', name: 'octave', version: '11.3.0', arch: lane };
    return this.isDownloading(refWithVariant) || this.isDownloading(refSimple);
  }

  async downloadEngine(
    lane: string,
    options?: { variant?: 'w64' | 'w32'; onProgress?: DownloadProgressCallback; signal?: AbortSignal }
  ): Promise<DownloadRecord> {
    const is64 = lane === 'master' || lane === 'IllegalPerformance';
    const v = options?.variant || (is64 ? 'w64' : 'w32');
    const arch = options?.variant ? `${lane}/${v}` : (lane === 'omc' ? 'wasm32' : lane);
    const ref: DownloadRef = lane === 'omc'
      ? { kind: 'engine', name: 'omc', version: '1.25.0', arch }
      : { kind: 'engine', name: 'octave', version: '11.3.0', arch };
    return this.download(ref, options);
  }

  async removeEngine(lane: string, variant?: 'w64' | 'w32'): Promise<void> {
    const is64 = lane === 'master' || lane === 'IllegalPerformance';
    const v = variant || (is64 ? 'w64' : 'w32');
    const refWithVariant: DownloadRef = lane === 'omc'
      ? { kind: 'engine', name: 'omc', version: '1.25.0', arch: `omc/${v}` }
      : { kind: 'engine', name: 'octave', version: '11.3.0', arch: `${lane}/${v}` };
    const refSimple: DownloadRef = lane === 'omc'
      ? { kind: 'engine', name: 'omc', version: '1.25.0', arch: 'wasm32' }
      : { kind: 'engine', name: 'octave', version: '11.3.0', arch: lane };
    await this.remove(refWithVariant);
    await this.remove(refSimple);

    // 物理清理：即使清单未记录或损坏，也彻底物理清除存储中的残留文件
    try {
      const resolver = new EngineAssetResolver(this.storage);
      await resolver.evict(lane as any, v);
    } catch {
      // 容错处理
    }
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
    let filename = `${ref.name}-${ref.version}.tar.gz`;
    const known = KNOWN_RUNTIME_METADATA[`${ref.name}@${ref.version}`];

    if (this.catalogProvider) {
      try {
        const cat = await this.catalogProvider();
        const pkg = (cat.packs || []).find((p) => p.name === ref.name);
        if (pkg) {
          const sha256 = (pkg as any).sha256 || known?.sha256;
          const bytes = (pkg as any).size || known?.bytes;
          if (!sha256 || !bytes) {
            throw new DownloadError(
              'FLAVOR_UNAVAILABLE',
              `No verified checksum/size found for runtime ${ref.name}@${ref.version}`
            );
          }
          let url: string;
          if ((pkg as any).url) {
            url = this.resolveUrl((pkg as any).url);
            filename = (pkg as any).url.split('/').pop() || filename;
          } else if ((pkg as any).tarballUrl) {
            url = this.resolveUrl((pkg as any).tarballUrl);
            filename = (pkg as any).tarballUrl.split('/').pop() || filename;
          } else {
            url = this.resolveUrl(`assets/runtimes/${filename}`);
          }
          const destPath = `downloads/runtime/${ref.name}/${ref.version}/${filename}`;
          return {
            sha256,
            bytes,
            provenanceUrl: url,
            items: [{ filename, url, destPath, sha256 }],
          };
        }
      } catch (err) {
        if (err instanceof DownloadError) throw err;
        console.warn('[DownloadStore] resolveRuntimeTarget catalog error:', err);
      }
    }

    // 默认工具链/已知运行时（如 llvm-wasm、pyodide）
    if (!known) {
      throw new DownloadError(
        'FLAVOR_UNAVAILABLE',
        `Unknown runtime target or missing checksum: ${ref.name}@${ref.version}`
      );
    }

    const url = this.resolveUrl(`assets/runtimes/${filename}`);
    const destPath = `downloads/runtime/${ref.name}/${ref.version}/${filename}`;
    return {
      sha256: known.sha256,
      bytes: known.bytes,
      provenanceUrl: url,
      items: [{ filename, url, destPath, sha256: known.sha256 }],
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
    const url = this.resolveUrl(`/assets/packages/${filename}`);
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
      const url = this.resolveUrl(`/assets/packages/${ref.arch}/${filename}`);
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
    const rawArch = ref.arch || this.laneProvider?.() || 'master';
    let lane = rawArch;
    let variant: 'w64' | 'w32';
    if (rawArch.includes('/')) {
      const parts = rawArch.split('/');
      lane = parts[0];
      variant = parts[1] as 'w64' | 'w32';
    } else {
      variant = (lane === 'master' || lane === 'IllegalPerformance') ? 'w64' : 'w32';
    }

    if (ref.name === 'omc' || lane === 'omc') {
      // 优先从 catalogProvider 动态读取 omc 引擎条目 (mail/053 §二)
      let omcMeta = KNOWN_ENGINE_METADATA['omc@1.25.0'];
      if (this.catalogProvider) {
        try {
          const cat = await this.catalogProvider();
          const pkg = (cat.packs || []).find((p) => p.name === 'omc');
          if (pkg && (pkg as any).sha256 && (pkg as any).size) {
            omcMeta = {
              bytes: (pkg as any).size,
              sha256: (pkg as any).sha256,
              files: (pkg as any).files || omcMeta.files,
            };
          }
        } catch (err: any) {
          // 吞错分级：降级到静态元数据是合法路径，但代码级缺陷（"is not a function"）不许无声——
          // 那意味着 catalogProvider 闭包引用了不存在的方法（死代码缝），必须响亮打出；
          // 其余（网络族 TypeError 'Failed to fetch'、DownloadError 合法降级）维持静默，离线场景不刷屏
          if (
            err &&
            typeof err.message === 'string' &&
            err.message.includes('is not a function')
          ) {
            console.error('[DownloadStore] catalog provider is broken (code defect):', err);
          }
        }
      }

      const filenameWasm = 'OpenModelicaCompiler_bg.wasm';
      const filenameJs = 'OpenModelicaCompiler.js';
      const urlWasm = this.resolveUrl(`/omc/${filenameWasm}`);
      const urlJs = this.resolveUrl(`/omc/${filenameJs}`);

      const files = omcMeta.files;
      const shaWasm = files[filenameWasm]?.sha256 || '8287589ebdb53b4cc37c337c2ae88f798d8889f7ac3c29d693ca12e539b8d001';
      const shaJs = files[filenameJs]?.sha256 || '56c399bd455d57c8e21206287445643b81db6fd4e3ac183989616b903d165f17';

      return {
        sha256: omcMeta.sha256 || `${shaWasm}${shaJs}`,
        bytes: omcMeta.bytes,
        provenanceUrl: urlWasm,
        items: [
          {
            filename: filenameWasm,
            url: urlWasm,
            destPath: `downloads/engine/omc/${variant}/${filenameWasm}`,
            sha256: shaWasm,
          },
          {
            filename: filenameJs,
            url: urlJs,
            destPath: `downloads/engine/omc/${variant}/${filenameJs}`,
            sha256: shaJs,
          },
        ],
      };
    }

    // Octave 引擎档：统一按 downloads/engine/${lane}/${variant}/ 布局存储
    const candidateFolders: string[] = [];
    candidateFolders.push(`lanes/${lane}`);
    if (variant === 'w64') {
      candidateFolders.push(`lanes/${lane}/w64`);
      candidateFolders.push('w64');
    }
    candidateFolders.push('');

    let chosenFolder = '';
    let buildManifest: any = null;

    if (this.engineBuildProvider) {
      buildManifest = await this.engineBuildProvider(lane);
      chosenFolder = candidateFolders[0];
    } else {
      let lastErr: any = null;
      for (const folder of candidateFolders) {
        const manifestSubPath = folder ? `${folder}/octave.build.json` : 'octave.build.json';
        const manifestUrl = this.resolveUrl(manifestSubPath);
        try {
          const json = await this.fetchPort.fetchJSON(manifestUrl);
          if (json && json.measured && json.measured.files) {
            buildManifest = json;
            chosenFolder = folder;
            break;
          }
        } catch (e: any) {
          lastErr = e;
        }
      }

      if (!buildManifest || !buildManifest.measured || !buildManifest.measured.files) {
        throw new DownloadError(
          'INDEX_UNREADABLE',
          `Failed to load octave.build.json for lane ${lane}: ${lastErr?.message || 'Invalid or missing manifest'}`
        );
      }
    }

    const files = buildManifest.measured.files as Record<string, { sha256: string; bytes: number }>;
    const items: Array<{ filename: string; url: string; destPath: string; sha256?: string }> = [];
    let totalBytes = 0;
    let combinedSha = '';

    for (const [filename, meta] of Object.entries(files)) {
      const fileSubPath = chosenFolder ? `${chosenFolder}/${filename}` : filename;
      const url = this.resolveUrl(fileSubPath);
      const destPath = `downloads/engine/${lane}/${variant}/${filename}`;
      items.push({ filename, url, destPath, sha256: meta.sha256 });
      totalBytes += meta.bytes;
      combinedSha += meta.sha256;
    }

    const provenanceSubPath = chosenFolder ? `${chosenFolder}/octave.build.json` : 'octave.build.json';
    return {
      sha256: combinedSha,
      bytes: totalBytes,
      provenanceUrl: this.resolveUrl(provenanceSubPath),
      items,
    };
  }
}

export function createDownloadStore(options?: DownloadStoreOptions): DownloadStore {
  return new DownloadStore(options);
}
