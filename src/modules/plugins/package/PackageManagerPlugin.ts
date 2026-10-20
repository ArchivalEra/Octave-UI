// src/modules/plugins/package/PackageManagerPlugin.ts
// 包与扩展管理深模块：实现 OctavePlugin，挂载于 PluginRegistry 接缝，落实 mail/001-004 内容契约

import type { OctavePlugin, PluginContext } from '../types';
import type { IAssetsPort, InstallOptions } from './AssetsPort';
import { BrowserAssetsAdapter } from './BrowserAssetsAdapter';
import type {
  ForgeCatalog,
  ForgePackageItem,
  PackageVersionCandidate,
  PackageStatusResult,
  InstallResult,
  InstallPlan,
  PackageFilter,
  CompileOptions,
  CompileResult,
} from './types';
import { DownloadStore } from '../../storage/DownloadStore';
import type { DownloadRef, DownloadRecord, DownloadProgressCallback } from '../../storage/downloadTypes';
import { refToKey } from '../../storage/downloadTypes';

export class PackageManagerPlugin implements OctavePlugin {
  readonly id = 'package-manager';
  readonly name = 'Package and Extension Manager';
  readonly version = '1.0.0';
  readonly description = 'Forge packages and capability runtimes manager implementing the content contract';
  enabled = true;

  private port: IAssetsPort;
  private downloadStore: DownloadStore;
  private catalog: ForgeCatalog | null = null;
  private byName = new Map<string, ForgePackageItem>();
  private installingPackages = new Set<string>();
  private downloadingKeys = new Set<string>();
  private listeners = new Set<() => void>();
  private loading = false;
  private error: string | null = null;

  constructor(port?: IAssetsPort, downloadStore?: DownloadStore) {
    this.port = port || new BrowserAssetsAdapter();
    this.downloadStore =
      downloadStore ||
      new DownloadStore({
        catalogProvider: () => this.catalog || { packs: [] },
      });
  }

  setPort(port: IAssetsPort): void {
    this.port = port;
  }

  setDownloadStore(store: DownloadStore): void {
    this.downloadStore = store;
  }

  getDownloadStore(): DownloadStore {
    return this.downloadStore;
  }

  async init(context?: PluginContext): Promise<void> {
    // 惰性加载：初始化时不强制网络阻塞，但在环境就绪后尝试预热拉取目录
    try {
      await this.loadCatalog();
    } catch (err: any) {
      // 离线或启动初期静默失败，后续用户打开面板或显式触发时可重试
      this.error = err?.message || String(err);
    }
  }

  async destroy(): Promise<void> {
    this.listeners.clear();
    this.installingPackages.clear();
    this.byName.clear();
    this.catalog = null;
  }

  /**
   * 刷新或拉取 Forge 货架目录
   */
  async loadCatalog(): Promise<ForgeCatalog> {
    this.loading = true;
    this.error = null;
    this.notify();

    try {
      const cat = await this.port.fetchCatalog();
      this.catalog = cat;
      this.byName.clear();
      for (const item of cat.packs || []) {
        this.byName.set(item.name, item);
      }
      this.loading = false;
      this.notify();
      return cat;
    } catch (err: any) {
      this.loading = false;
      this.error = err?.message || 'Failed to load catalog';
      this.notify();
      throw err;
    }
  }

  getCatalog(): ForgeCatalog | null {
    return this.catalog;
  }

  isLoading(): boolean {
    return this.loading;
  }

  getError(): string | null {
    return this.error;
  }

  getPackage(name: string): ForgePackageItem | undefined {
    return this.byName.get(name);
  }

  getAllPackages(): ForgePackageItem[] {
    return this.catalog?.packs || [];
  }

  /**
   * 委托引擎获取当前包的就绪态（来自 statusOf，单一真源，UI 绝不猜测）
   */
  getStatus(name: string): PackageStatusResult {
    return this.port.getStatusOf(name);
  }

  /**
   * 检查包是否正在安装中
   */
  isInstalling(name: string): boolean {
    return this.installingPackages.has(name);
  }

  /**
   * 依赖闭包 ∩ form:"tree" 条目，把它们的 size 加起来（mail/003 §① 与 mail/004 §4 官方精确口径）
   * 用于快速给用户展示“还要额外拉取多少依赖体积”的秒级预览
   */
  estimateExtraDownload(name: string): number {
    const closure = this.computeDependencyClosure(name);
    let totalTreeBytes = 0;

    for (const depName of closure) {
      if (depName === name) continue;
      const item = this.byName.get(depName);
      if (item && item.form === 'tree' && typeof item.size === 'number') {
        totalTreeBytes += item.size;
      }
    }

    return totalTreeBytes;
  }

  /**
   * 递归计算硬依赖闭包（跳过循环依赖）
   */
  computeDependencyClosure(name: string): Set<string> {
    const result = new Set<string>();
    const stack = [name];

    while (stack.length > 0) {
      const current = stack.pop()!;
      if (result.has(current)) continue;
      result.add(current);

      const pkg = this.byName.get(current);
      if (pkg && Array.isArray(pkg.deps)) {
        for (const dep of pkg.deps) {
          if (!result.has(dep)) {
            stack.push(dep);
          }
        }
      }
    }

    return result;
  }

  /**
   * 获取版本候选集：规范化 versions[]（带 staged/withheld 标记）
   */
  getVersions(name: string): PackageVersionCandidate[] {
    const item = this.byName.get(name);
    if (!item) return [];

    if (Array.isArray(item.versions) && item.versions.length > 0) {
      return item.versions;
    }

    // 单版本兜底
    return [
      {
        version: item.version,
        stage: 'staged',
        form: item.form,
        content: item.content,
        size: item.size,
      },
    ];
  }

  /**
   * 委托引擎执行 planOnly 拿取预演事实（权威真值）
   */
  async planInstall(name: string, version?: string): Promise<InstallPlan> {
    const extraSize = this.estimateExtraDownload(name);
    const item = this.byName.get(name);
    const pkgSize = item?.size || 0;

    try {
      const res = await this.port.install(name, { version, planOnly: true });
      if (res.cause) {
        try {
          const parsed = JSON.parse(res.cause);
          if (typeof parsed.bytes === 'number') {
            return {
              name,
              version,
              bytes: parsed.bytes,
              layers: Array.isArray(parsed.layers) ? parsed.layers : [],
              extraSize,
            };
          }
        } catch {
          // not json cause
        }
      }
    } catch {
      // planOnly call threw, fallback to closure estimation
    }

    return {
      name,
      version,
      bytes: pkgSize + extraSize,
      layers: Array.from(this.computeDependencyClosure(name)).filter(
        (n) => n !== name && this.byName.get(n)?.form === 'tree'
      ),
      extraSize,
    };
  }

  /**
   * 安装指定包或指定版本
   */
  async installPackage(name: string, options?: InstallOptions): Promise<InstallResult> {
    const pkg = this.byName.get(name);
    // 裁决⑤：含 'src' 的源码包，装载/安装的必要条件是 LLVM 工具链已下载
    const hasSrc = pkg && Array.isArray(pkg.content) && pkg.content.includes('src');
    if (hasSrc) {
      const llvmReady = await this.hasLLVM();
      if (!llvmReady) {
        return {
          state: 'failed',
          name,
          why: 'llvm_required',
          message: '[ruling-5] 该源码包含 C++ 加速件 (src)，需要现场编译——请先下载 LLVM 工具链 (约 35 MB)。',
        };
      }
    }

    this.installingPackages.add(name);
    this.notify();

    try {
      const res = await this.port.install(name, options);
      this.installingPackages.delete(name);
      this.notify();
      return res;
    } catch (err: any) {
      this.installingPackages.delete(name);
      this.notify();
      return {
        state: 'failed',
        message: err?.message || 'Installation failed',
      };
    }
  }

  /**
   * 检查是否正在下载
   */
  isDownloading(refOrKey: DownloadRef | string): boolean {
    const key = typeof refOrKey === 'string' ? refOrKey : refToKey(refOrKey);
    return this.downloadingKeys.has(key);
  }

  /**
   * 获取指定引用的下载记录
   */
  getDownloadRecord(ref: DownloadRef): DownloadRecord | null {
    return this.downloadStore.getRecord(ref);
  }

  /**
   * 触发资产下载（OPFS downloads/ 写入）
   */
  async downloadPackage(
    ref: DownloadRef,
    options?: { onProgress?: DownloadProgressCallback; signal?: AbortSignal }
  ): Promise<DownloadRecord> {
    const key = refToKey(ref);
    this.downloadingKeys.add(key);
    this.notify();

    try {
      const rec = await this.downloadStore.download(ref, options);
      this.downloadingKeys.delete(key);
      this.notify();
      return rec;
    } catch (err) {
      this.downloadingKeys.delete(key);
      this.notify();
      throw err;
    }
  }

  /**
   * 检查 LLVM 编译工具链是否已下载就绪（裁决⑤ 必要条件）
   */
  async hasLLVM(): Promise<boolean> {
    const snap = await this.downloadStore.index();
    for (const rec of Object.values(snap.manifest.items)) {
      if (rec.ref.name === 'llvm-wasm' || rec.ref.name === 'llvm') {
        return true;
      }
    }
    return false;
  }

  /**
   * 编译或从源码构建扩展包（host-008 compileExtension + 裁决⑤ 前置拦截）
   */
  async compilePackage(name: string, options?: CompileOptions): Promise<CompileResult> {
    const pkg = this.byName.get(name);
    // 裁决⑤：含 'src' 的源码包，装载/编译的必要条件是 LLVM 工具链已下载
    const hasSrc = pkg && Array.isArray(pkg.content) && pkg.content.includes('src');
    if (hasSrc) {
      const llvmReady = await this.hasLLVM();
      if (!llvmReady) {
        return {
          state: 'failed',
          name,
          why: 'llvm_required',
          diagnostics: [
            '[ruling-5] 该源码包含 C++ 加速件 (src)，需要现场编译——请先下载 LLVM 工具链 (约 35 MB)。',
          ],
        };
      }
    }

    if (this.port.compileExtension) {
      return this.port.compileExtension(name, options);
    }

    return {
      state: 'failed',
      name,
      diagnostics: ['[compile] Host compileExtension port is not available.'],
      why: 'Host compileExtension port is not available.',
    };
  }

  /**
   * 条件筛选包清单
   */
  filterPackages(filter: PackageFilter): ForgePackageItem[] {
    const all = this.getAllPackages();
    const query = filter.query?.trim().toLowerCase() || '';
    const consumer = filter.consumer || 'all';
    const form = filter.form || 'all';
    const installedOnly = !!filter.installedOnly;

    return all.filter((item) => {
      // 1. consumer 筛选（支持 string 或 string[]，未注明的缺省为 octave）
      const itemConsumers: string[] = Array.isArray(item.consumer)
        ? item.consumer
        : item.consumer
        ? [item.consumer]
        : ['octave'];
      if (consumer !== 'all' && !itemConsumers.includes(consumer)) {
        return false;
      }

      // 2. form 筛选
      if (form !== 'all') {
        if (form === 'pkg' && item.form !== 'pkg') return false;
        if (form === 'tree' && item.form !== 'tree') return false;
      }

      // 3. 安装态筛选
      if (installedOnly) {
        const st = this.getStatus(item.name);
        if (!st.installed) return false;
      }

      // 4. 关键词筛选（名称、描述、依赖项）
      if (query) {
        const matchName = item.name.toLowerCase().includes(query);
        const matchDesc = item.description?.toLowerCase().includes(query) ?? false;
        const matchDeps = item.deps?.some((d) => d.toLowerCase().includes(query)) ?? false;
        if (!matchName && !matchDesc && !matchDeps) {
          return false;
        }
      }

      return true;
    });
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (err) {
        console.error('[PackageManagerPlugin] Listener error:', err);
      }
    }
  }
}
