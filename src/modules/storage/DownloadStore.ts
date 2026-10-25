// src/modules/storage/DownloadStore.ts
// 纯下载深模块：解耦下载核验与引擎装载，OPFS downloads/ 布局管理，贯彻 I1-I6 不变量与 7 错误码闭集

import type { Store } from './types';
import { MemoryStore } from './MemoryStore';
import { OpfsStore } from './OpfsStore';
import type {
  DownloadRef,
  DownloadRecord,
  DownloadManifest,
  DownloadSnapshot,
  DownloadFileMeta,
  DownloadProgressCallback,
} from './downloadTypes';
import {
  refToKey,
  keyToRef,
  DownloadError,
  engineRef,
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

// #12 Q12.2 手抄表瘦身：顶层 bytes/sha256 删除（bytes 从 files 累加即得，
// 顶层聚合 sha 是「装饰」不是对账真源——128hex 拼接串曾在此产地出现）；
// 键 omc@1.25.0 → omc（版本语义从键除名，Q6C）。
// 表值与 catalog 不可达时的离线兜底：陈旧 ⇒ 下载时 sha 校验红（fail fast）。
export const KNOWN_ENGINE_METADATA: Record<
  string,
  { files: Record<string, { bytes: number; sha256: string }> }
> = {
  omc: {
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
    // #10 Q10.4：ref 构造收单进 engineRef 工厂（downloadTypes.ts 唯一产地）
    const refWithVariant: DownloadRef = lane === 'omc'
      ? engineRef('omc', `omc/${v}`)
      : engineRef('octave', `${lane}/${v}`);
    const rec = this.getRecord(refWithVariant);
    if (rec) return rec;

    const refSimple: DownloadRef = lane === 'omc'
      ? engineRef('omc', 'wasm32')
      : engineRef('octave', lane);
    return this.getRecord(refSimple);
  }

  isEngineDownloaded(lane: string, variant?: 'w64' | 'w32'): boolean {
    const is64 = lane === 'master' || lane === 'IllegalPerformance';
    const v = variant || (is64 ? 'w64' : 'w32');
    const refWithVariant: DownloadRef = lane === 'omc'
      ? engineRef('omc', `omc/${v}`)
      : engineRef('octave', `${lane}/${v}`);
    const refSimple: DownloadRef = lane === 'omc'
      ? engineRef('omc', 'wasm32')
      : engineRef('octave', lane);
    return this.has(refWithVariant) || this.has(refSimple);
  }

  isEngineDownloading(lane: string, variant?: 'w64' | 'w32'): boolean {
    const is64 = lane === 'master' || lane === 'IllegalPerformance';
    const v = variant || (is64 ? 'w64' : 'w32');
    const refWithVariant: DownloadRef = lane === 'omc'
      ? engineRef('omc', `omc/${v}`)
      : engineRef('octave', `${lane}/${v}`);
    const refSimple: DownloadRef = lane === 'omc'
      ? engineRef('omc', 'wasm32')
      : engineRef('octave', lane);
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
      ? engineRef('omc', arch)
      : engineRef('octave', arch);
    return this.download(ref, options);
  }

  async removeEngine(lane: string, variant?: 'w64' | 'w32'): Promise<void> {
    const is64 = lane === 'master' || lane === 'IllegalPerformance';
    const v = variant || (is64 ? 'w64' : 'w32');
    const refWithVariant: DownloadRef = lane === 'omc'
      ? engineRef('omc', `omc/${v}`)
      : engineRef('octave', `${lane}/${v}`);
    const refSimple: DownloadRef = lane === 'omc'
      ? engineRef('omc', 'wasm32')
      : engineRef('octave', lane);
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
    // #15 通知通道统一（两发定档）：第一发 = 进 downloading 态（record=null，
    // 消费语义「进入下载中」——start 通知保留）；终态（成功 record / 失败 null）
    // 只再发一次，见 catch 与成功路径的 broadcastChange。
    this.broadcastChange(ref, null);

    try {
      // 1. 根据 ref 解析权威源下载目标、文件列表与预期哈希 (I1)
      const resolved = await this.resolveTarget(ref);

    // 2. 检查当日对账与幂等性 (I3)
    //    #12 Q12.1：幂等判据从「顶层 sha 全等」改为**逐文件三元组比对**——
    //    existing.files 与 resolved.items 的 (destPath, sha256, bytes) 全等 + 文件数相等。
    //    顶层聚合 sha 从比对面退场（多文件无单值，单文件时 files[0] 三元组即原语义）。
    //    sha 维的 undefined 语义：#6 五件套里两条 items（build.json/assets-manifest.json）
    //    是「下载时真算」型（sha256: undefined）；记账侧 files[] 存的是真算值。
    //    ⇒ 比对时**记账有值而 items 无值 ⇒ 跳过 sha 维只比 path+bytes**（undefined
    //    表示「下载时真算」，不是「没有指纹」）；两侧都有值时照常逐字比对。
    const existing = await this.stat(ref);
    if (existing) {
      if (this.filesMatch(existing.files, resolved.items)) {
        // 幂等：逐文件三元组全等且磁盘文件在，直接返回已有记录（零网络开销）
        return existing;
      }
      // 目标漂移（字节/路径/可用指纹任一变）：当日目录已更新，清除旧记录重新下载
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
    //    #12 Q12.2：顶层 sha 只在**单文件**下载时有真值（该文件自身指纹）；
    //    多文件无聚合 sha（拼接串是装饰不是指纹）⇒ undefined。
    //    消费面（幂等比对 / resolver 对账）一律走 files[] 逐件记账。
    const record: DownloadRecord = {
      ref,
      sha256: downloadedFiles.length === 1 ? downloadedFiles[0].sha256 : undefined,
      bytes: accumulatedBytes,
      files: downloadedFiles,
      downloadedAt: new Date().toISOString(),
      provenanceUrl: resolved.provenanceUrl,
    };

    const key = refToKey(ref);
    this.manifest.items[key] = record;
    await this.saveManifest();

    // 广播事件 (A1)
    // #15 两发定档：这是终态第二发（成功 record）——start 那发 null 之后
    // 直到这里才有终态声；原 finally 里的第三发已删（start 发过、终态前又发
    // null 是自相矛盾的第三声，消费者语义只需「进 downloading 态」+「终态」）。
    this.broadcastChange(ref, record);

    return record;
    } catch (err) {
      // #15 两发定档：失败也是终态，必须有声（null 终态声）。
      // 成功路径已在 return 前发过 record，这里只在 throw 路径补终态声后 rethrow。
      this.broadcastChange(ref, null);
      throw err;
    } finally {
      this.activeDownloads.delete(downloadKey);
      // #15 两发定档形状锚点：download() 内 finally 零 broadcastChange（第三声已删——
      // start 发过、终态前 finally 又发 null 是自相矛盾的第三声）。
      // #15 失效挂点：download 终态（成功或失败）后显式调 resolver.invalidateCache(lane)
      // （#7 的显式方法，不走事件——事件只管 UI 刷新，缓存失效是写路径主动调）。
      // 只对 engine ref 有意义；lane 推法与 removeEngine 的 refWithVariant 同款：
      // omc 车道名即 lane，Octave 档 arch 形如 `${lane}/${variant}` 取斜杠前段。
      // 失效必须落在**消费侧共享的单例**上（HeaderBar/ProjectWorkspace/OmcBridge
      // 全走 getInstance()）——new 一个新实例只会失效它自己的空缓存，等于没失效；
      // evict/removeEngine 内部已失效（#7 落过），这里补 download 写路径的缺口：
      // 等长 XOR 重下修账后，会话内 integrity 缓存若不失效会继续吃旧指纹。
      if (ref.kind === 'engine') {
        const lane = ref.name === 'omc'
          ? 'omc'
          : (ref.arch?.split('/')?.[0] ?? ref.name);
        try {
          EngineAssetResolver.getInstance().invalidateCache(lane as any);
        } catch {
          // 容错：失效失败不改变下载结果本身（缓存最坏情况是多验一次盘）
        }
      }
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
   *
   * #12 Q12.3：出口统一过 **64hex intake 断言**——三个分支 return 的 items
   * 都在此逐条验「有值的 sha256 必须 ^[0-9a-f]{64}$」。非 64hex（128hex
   * 拼接串、空串）⇒ throw INDEX_UNREADABLE（坏哈希是记账层污染，归 INDEX
   * 语义）。落点在出口不在 catalog 读入侧：一处拦全部来源（catalog /
   * 手抄表 / 未来新源都过这道门；读入侧拦会漏手抄表路径）。
   * undefined 条目跳过（#6 五件套的「下载时真算」型：intake 守卫跳过
   * 校验，记账存 fetchBytes 真算值）。
   */
  private async resolveTarget(ref: DownloadRef): Promise<{
    sha256: string | undefined;
    bytes: number;
    provenanceUrl: string;
    items: Array<{ filename: string; url: string; destPath: string; sha256?: string }>;
  }> {
    let resolved: {
      sha256: string | undefined;
      bytes: number;
      provenanceUrl: string;
      items: Array<{ filename: string; url: string; destPath: string; sha256?: string }>;
    };
    if (ref.kind === 'src') {
      resolved = await this.resolveSrcTarget(ref);
    } else if (ref.kind === 'pre') {
      resolved = await this.resolvePreTarget(ref);
    } else if (ref.kind === 'engine') {
      resolved = await this.resolveEngineTarget(ref);
    } else if (ref.kind === 'runtime') {
      resolved = await this.resolveRuntimeTarget(ref);
    } else {
      throw new DownloadError('FLAVOR_UNAVAILABLE', `Unknown download kind: ${ref.kind}`);
    }
    // 出口断言（#12 Q12.3）：只判有值条目；undefined = 「下载时真算」型，合法
    for (const item of resolved.items) {
      if (item.sha256 === undefined) continue;
      if (!/^[0-9a-f]{64}$/.test(item.sha256)) {
        throw new DownloadError(
          'INDEX_UNREADABLE',
          `下载目标 ${item.filename} 的 sha256 不是 64 位十六进制指纹（得到 ${item.sha256.length} 位）：` +
            `坏哈希是记账层污染（如 128 位拼接串），拒绝入库`
        );
      }
    }
    return resolved;
  }

  /**
   * #12 Q12.1 幂等三元组比对：existing.files 与 resolved.items 的
   * (destPath, sha256, bytes) 全等 + 文件数相等。
   * sha 维规则：记账有值而 items 无值 ⇒ 跳过 sha 维（undefined 表示
   * 「下载时真算」，见 download() 里的注释）；两侧都有值 ⇒ 逐字比对；
   * 记账无值（老坏账）⇒ 不等（重下修账）。
   */
  private filesMatch(
    files: DownloadFileMeta[],
    items: Array<{ destPath: string; sha256?: string }>
  ): boolean {
    if (files.length !== items.length) return false;
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const item = items[i];
      // path 维（destPath 对记账 path）：逐字比对
      if (f.path !== item.destPath) return false;
      // sha 维：items 侧 undefined = 「下载时真算」型（#6 五件套两件）——
      // 记账有值 ⇒ 视为相等（跳过 sha 维）；两侧都有值 ⇒ 逐字比对；
      // 记账无值而 items 有值 ⇒ 老坏账，判不等（重下修账）。
      if (item.sha256 !== undefined && f.sha256 !== item.sha256) {
        return false;
      }
    }
    return true;
  }

  private async resolveRuntimeTarget(ref: DownloadRef): Promise<{
    sha256: string | undefined;
    bytes: number;
    provenanceUrl: string;
    items: Array<{ filename: string; url: string; destPath: string; sha256?: string }>;
  }> {
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

  private async resolveSrcTarget(ref: DownloadRef): Promise<{
    sha256: string | undefined;
    bytes: number;
    provenanceUrl: string;
    items: Array<{ filename: string; url: string; destPath: string; sha256?: string }>;
  }> {
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

  private async resolvePreTarget(ref: DownloadRef): Promise<{
    sha256: string | undefined;
    bytes: number;
    provenanceUrl: string;
    items: Array<{ filename: string; url: string; destPath: string; sha256?: string }>;
  }> {
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

    // form:"file" 单件交付（内容仓 084 A2 / 086 裁定）：条目自带 url + size + sha256 三件，
    // 解压发生在运行期（omc_vfs_load_zip），站点侧就是一个文件 ⇒ 无 arch、无 artifacts[]。
    // 判据：表单形态 + 三件齐（缺一即如实报 FLAVOR_UNAVAILABLE，不猜）。
    if ((pkg as any).form === 'file') {
      const item = pkg as any;
      if (!item.url || typeof item.size !== 'number' || !item.sha256) {
        throw new DownloadError(
          'FLAVOR_UNAVAILABLE',
          `File-form package ${ref.name} is missing url/size/sha256 (catalog entry incomplete)`
        );
      }
      const filename = String(item.url).split('/').pop() || `${ref.name}-${ref.version}.zip`;
      const url = this.resolveUrl(item.url);
      const destPath = `downloads/file/${ref.name}/${ref.version}/${filename}`;
      return {
        sha256: item.sha256,
        bytes: item.size,
        provenanceUrl: url,
        items: [{ filename, url, destPath, sha256: item.sha256 }],
      };
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

    const files = matched.files || [{ name: `${ref.name}.oct`, size: matched.size, sha256: matched.sha256 }];
    for (const f of files) {
      const filename = f.name || `${ref.name}.oct`;
      const url = this.resolveUrl(`/assets/packages/${ref.arch}/${filename}`);
      const destPath = `downloads/pre/${ref.name}/${ref.version}/${ref.arch}/${filename}`;
      items.push({ filename, url, destPath, sha256: f.sha256 });
      totalBytes += f.size || 0;
    }

    // #12 Q12.2：顶层聚合 sha（拼接串）产地删除——多文件无单值指纹，
    // 对账真源是 items[] 逐件 sha（出口 64hex 断言 + 记账 files[]）。
    return {
      sha256: undefined,
      bytes: totalBytes,
      provenanceUrl: items[0]?.url || '',
      items,
    };
  }

  private async resolveEngineTarget(ref: DownloadRef): Promise<{
    sha256: string | undefined;
    bytes: number;
    provenanceUrl: string;
    items: Array<{ filename: string; url: string; destPath: string; sha256?: string }>;
  }> {
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
      // 优先从 catalogProvider 动态读取 omc 引擎条目 (mail/053 §二)；
      // #12 Q12.4：KNOWN_ENGINE_METADATA 仅在 catalog 不可达/缺条目时离线兜底。
      // #12 Q12.2：表形状瘦身——顶层 bytes/sha256 删除，bytes 从 files 累加；
      // catalog 条目同样只取 files[]（顶层聚合 sha 不再消费）。
      let omcMeta = KNOWN_ENGINE_METADATA['omc'];
      if (this.catalogProvider) {
        try {
          const cat = await this.catalogProvider();
          const pkg = (cat.packs || []).find((p) => p.name === 'omc');
          if (pkg && (pkg as any).files) {
            omcMeta = { files: (pkg as any).files };
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
      const metaWasm = files[filenameWasm];
      const metaJs = files[filenameJs];
      if (!metaWasm || !metaJs) {
        // 表缺件 = 手抄表/catalog 都没有完整两件指纹：如实报，不猜
        throw new DownloadError(
          'FLAVOR_UNAVAILABLE',
          `omc engine metadata incomplete: missing ${!metaWasm ? filenameWasm : filenameJs}`
        );
      }
      // bytes 从 files 累加（顶层聚合字段已删，重复产地退役）
      const totalBytes = metaWasm.bytes + metaJs.bytes;

      // #12 Q12.2：顶层聚合 sha 产地删除（曾有 128hex 拼接串）——
      // 多文件无单值指纹，resolved.sha256 = undefined（Q7A）；
      // 逐件 sha 由 items[] 携带，出口过 64hex 断言，对账走记账 files[]。
      return {
        sha256: undefined,
        bytes: totalBytes,
        provenanceUrl: urlWasm,
        items: [
          {
            filename: filenameWasm,
            url: urlWasm,
            destPath: `downloads/engine/omc/${variant}/${filenameWasm}`,
            sha256: metaWasm.sha256,
          },
          {
            filename: filenameJs,
            url: urlJs,
            destPath: `downloads/engine/omc/${variant}/${filenameJs}`,
            sha256: metaJs.sha256,
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

    for (const [filename, meta] of Object.entries(files)) {
      const fileSubPath = chosenFolder ? `${chosenFolder}/${filename}` : filename;
      const url = this.resolveUrl(fileSubPath);
      const destPath = `downloads/engine/${lane}/${variant}/${filename}`;
      items.push({ filename, url, destPath, sha256: meta.sha256 });
      totalBytes += meta.bytes;
    }

    // 离线五件套 +2（#6 Q6.1）：octave.build.json 与 assets/manifest.json 也随引擎下载，
    // 让 boot 侧（octave-core.js loadManifest / assets-loader.js Assets.init）的清单请求
    // 能被 EngineAssetResolver 拦截进 OPFS，实现五件齐零网络。
    // 两条 items 不给 sha256（octave.build.json 本身就是 sha 的产地，没有自证哈希可用；
    // assets/manifest.json 同为清单类文件）——intake 的 `if (item.sha256 && ...)` 守卫
    // 自动跳过校验，downloadedFiles.push 记账存 fetchBytes 真算的 sha（#7 对账有账可对）。
    // 注意 assets/manifest.json 的 destPath 用平铺名 assets-manifest.json——
    // 避免与站点资产清单语义混淆；EngineAssetResolver.matchRequest 出口做同名映射。
    // OMC 车道不追加（上面已 return）。
    const buildSubPath = chosenFolder ? `${chosenFolder}/octave.build.json` : 'octave.build.json';
    items.push({
      filename: 'octave.build.json',
      url: this.resolveUrl(buildSubPath),
      destPath: `downloads/engine/${lane}/${variant}/octave.build.json`,
      sha256: undefined,
    });
    const assetsManifestSubPath = chosenFolder ? `${chosenFolder}/assets/manifest.json` : 'assets/manifest.json';
    items.push({
      filename: 'assets/manifest.json',
      url: this.resolveUrl(assetsManifestSubPath),
      destPath: `downloads/engine/${lane}/${variant}/assets-manifest.json`,
      sha256: undefined,
    });
    // 清单类文件不计入 totalBytes（它们是元数据不是引擎内容，bytes 以
    // build.json 的 measured.files 累加为真源——#7 裁定维持）

    const provenanceSubPath = chosenFolder ? `${chosenFolder}/octave.build.json` : 'octave.build.json';
    // #12 Q12.2：顶层聚合 sha（拼接串）产地删除——多文件无单值指纹，
    // resolved.sha256 = undefined（Q7A）；对账真源是 items[] 逐件 sha。
    return {
      sha256: undefined,
      bytes: totalBytes,
      provenanceUrl: this.resolveUrl(provenanceSubPath),
      items,
    };
  }
}

export function createDownloadStore(options?: DownloadStoreOptions): DownloadStore {
  return new DownloadStore(options);
}
