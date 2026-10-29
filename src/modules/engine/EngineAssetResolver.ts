// src/modules/engine/EngineAssetResolver.ts
// 离线资产解析深模块：瞬态作用域拦截代理、OPFS 物理对账、并发防护与内存生命周期管理

import type { Store } from '../storage/types';
import { OpfsStore } from '../storage/OpfsStore';
import { MemoryStore } from '../storage/MemoryStore';

export type EngineLane = 'master' | 'wasm32-final' | 'IllegalPerformance' | 'omc';
export type EngineVariant = 'w64' | 'w32';

/**
 * 物理对账三态（对账单一真源 = downloads/manifest.json 的 files[] 记账）：
 * - verified   盘上字节与记账逐项对上（size 硬判 + SHA-256 复验）；
 * - corrupted  文件物理在但字节对不上（截断被 size 硬判拦、同尺寸篡改被 sha 复验拦）；
 * - unchecked  无账可对（manifest 缺失/损坏/无该车道条目）或未下载。
 * downloaded 保持纯存在语义，corrupted 是独立维度——坏盘不自动 evict，重下是用户显式动作。
 */
export type EngineIntegrity = 'verified' | 'corrupted' | 'unchecked';

export interface EngineAssetStatus {
  readonly lane: EngineLane;
  readonly downloaded: boolean;
  readonly variant: EngineVariant;
  readonly totalBytes: number;
  readonly verifiedAt: number;
  readonly integrity: EngineIntegrity;
}

interface IEngineAssetResolver {
  /**
   * 物理对账检查目标引擎是否已完整持久化于 OPFS：
   * stat 查文件在 → size 硬判（与 manifest 记账 bytes 逐一相等；无记账退回 size>0 旧判）→
   * 盘上字节重算 SHA-256 与记账 sha 比对。OMC 车道同走这套（其文件同样在 manifest files[] 里）。
   */
  checkPhysicalStatus(lane: EngineLane, variant?: EngineVariant): Promise<EngineAssetStatus>;

  /**
   * 受控作用域执行闭包:
   * 在 bootFn 执行期间，挂载针对 target lane 文件的精准 Fetch 拦截代理；
   * 拦截匹配到的 .wasm / .data 请求并直接从 OPFS 流式返回 Response；
   * 无论 bootFn 成功或失败，退出时必定注销拦截器并回收瞬态内存句柄。
   */
  withLocalAssets<T>(
    lane: EngineLane,
    variant: EngineVariant,
    bootFn: () => Promise<T>
  ): Promise<T>;

  /**
   * 清理损坏或陈旧的本地引擎缓存
   */
  evict(lane: EngineLane, variant?: EngineVariant): Promise<void>;

  /**
   * 显式失效会话内 integrity 缓存：
   * evict() 内部必须调用；DownloadStore download() 成功后、removeEngine()（经 evict 覆盖）
   * 也应调用——不用事件监听（engine 层订阅 UI 事件是倒挂形状）。
   */
  invalidateCache(lane: EngineLane, variant?: EngineVariant): void;

  /**
   * boot 前置拦截：已下载但未通过完整性对账（corrupted / unchecked）⇒ throw
   * ENGINE_CORRUPTED（引擎层错误，普通 Error 带 code 字段，不进 DownloadError 的 7 码闭集）；
   * 未下载 ⇒ 返回 false 不 throw（未下载走网络下载是合法路径）。
   */
  assertBootable(lane: EngineLane, variant?: EngineVariant): Promise<boolean>;
}

export function getDefaultVariant(lane: EngineLane): EngineVariant {
  if (lane === 'wasm32-final' || lane === 'omc') {
    return 'w32';
  }
  return 'w64';
}

interface ActiveInterceptionRule {
  id: string;
  lane: EngineLane;
  variant: EngineVariant;
  resolver: EngineAssetResolver;
}

// 全局作用域代理规则栈与原始 fetch 句柄
const activeRules: ActiveInterceptionRule[] = [];
let originalFetch: typeof globalThis.fetch | null = null;

async function scopedFetchProxy(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  let urlString = '';
  if (typeof input === 'string') {
    urlString = input;
  } else if (input instanceof URL) {
    urlString = input.href;
  } else if (input && typeof input === 'object' && 'url' in input) {
    urlString = (input as Request).url;
  } else {
    urlString = String(input);
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(urlString, typeof location !== 'undefined' ? location.href : 'http://localhost');
  } catch {
    if (originalFetch) {
      return originalFetch.apply(globalThis, [input, init]);
    }
    return new Response(null, { status: 404, statusText: 'Not Found' });
  }

  const pathname = parsedUrl.pathname;

  // 遍历拦截规则栈（从顶到底 / 栈顶优先）
  for (let i = activeRules.length - 1; i >= 0; i--) {
    const rule = activeRules[i];
    const match = rule.resolver.matchRequest(rule.lane, rule.variant, pathname);
    if (match) {
      const resp = await rule.resolver.tryServeFromStorage(rule.lane, rule.variant, match.filename);
      if (resp) {
        return resp;
      }
    }
  }

  // 无规则匹配或 OPFS 无对应文件，回退到原始 fetch 代理
  if (originalFetch) {
    return originalFetch.apply(globalThis, [input, init]);
  }
  return new Response(null, { status: 404, statusText: 'Not Found' });
}

export class EngineAssetResolver implements IEngineAssetResolver {
  private static _instance: EngineAssetResolver | null = null;
  private _store: Store;

  // 会话内 integrity 缓存：key = `${lane}/${variant}`，值为**三态结论** + 结论作出时的盘面指纹。
  // 三态都进缓存：corrupted 的可缓存性完全由指纹决定（指纹变 = 盘变了 = 该重验），
  // 不需要第二套失效逻辑；unchecked（无账可对）同理——盘没变就不必再读一遍 manifest。
  // 缓存命中路径只花 stat 的钱（指纹只拼 stat size），不读盘内容。
  // 失效只走显式 invalidateCache() / evict()，不用事件监听。
  private _integrityCache = new Map<
    string,
    { verdict: EngineIntegrity; fingerprint: string; at: number }
  >();

  constructor(store?: Store) {
    if (store) {
      this._store = store;
    } else {
      const opfs = new OpfsStore();
      this._store = opfs.isSupported ? opfs : new MemoryStore();
    }
  }

  get store(): Store {
    return this._store;
  }

  static getInstance(store?: Store): EngineAssetResolver {
    if (!EngineAssetResolver._instance || store) {
      // 实例化唯一产地：写成 `new this(...)` 而非类名，好让静态断言
      // 「src/ 里另开 EngineAssetResolver 实例的写法必须为 0」真的成立——绕过单例
      // 就等于另起一个缓存，对账会被静默架空（候选 3 的根因）。
      EngineAssetResolver._instance = new this(store);
    }
    return EngineAssetResolver._instance;
  }

  static setInstance(instance: EngineAssetResolver | null): void {
    EngineAssetResolver._instance = instance;
  }

  static resetInstance(): void {
    EngineAssetResolver._instance = null;
    activeRules.length = 0;
    if (originalFetch) {
      globalThis.fetch = originalFetch;
      originalFetch = null;
    }
  }

  static async checkPhysicalStatus(lane: EngineLane, variant?: EngineVariant): Promise<EngineAssetStatus> {
    return EngineAssetResolver.getInstance().checkPhysicalStatus(lane, variant);
  }

  static async withLocalAssets<T>(
    lane: EngineLane,
    variant: EngineVariant,
    bootFn: () => Promise<T>
  ): Promise<T> {
    return EngineAssetResolver.getInstance().withLocalAssets(lane, variant, bootFn);
  }

  static async evict(lane: EngineLane, variant?: EngineVariant): Promise<void> {
    return EngineAssetResolver.getInstance().evict(lane, variant);
  }

  static invalidateCache(lane: EngineLane, variant?: EngineVariant): void {
    EngineAssetResolver.getInstance().invalidateCache(lane, variant);
  }

  static async assertBootable(lane: EngineLane, variant?: EngineVariant): Promise<boolean> {
    return EngineAssetResolver.getInstance().assertBootable(lane, variant);
  }

  matchRequest(
    lane: EngineLane,
    variant: EngineVariant,
    pathname: string
  ): { filename: string } | null {
    if (lane === 'omc') {
      if (
        pathname.endsWith('/OpenModelicaCompiler_bg.wasm') ||
        pathname.endsWith('OpenModelicaCompiler_bg.wasm')
      ) {
        return { filename: 'OpenModelicaCompiler_bg.wasm' };
      }
      if (
        pathname.endsWith('/OpenModelicaCompiler.js') ||
        pathname.endsWith('OpenModelicaCompiler.js')
      ) {
        return { filename: 'OpenModelicaCompiler.js' };
      }
      return null;
    }

    // Octave 资产匹配: octave.wasm, octave.data, octave.js
    // 加上离线五件套的两条拦截键（#6）：
    //   · assets/manifest.json  —— assets-loader.js 的 Assets.init(lane.manifest) 按此 URL 取清单；
    //   · octave.build.json     —— octave-core.js 的 loadManifest() 按此 URL 取构建清单。
    // w64 档的 manifest.w64.json **不拦**（层③ 按需资产维持网络 + 如实报错，票面裁定）。
    const isWasm = pathname.endsWith('/octave.wasm') || pathname === 'octave.wasm' || pathname.endsWith('octave.wasm');
    const isData = pathname.endsWith('/octave.data') || pathname === 'octave.data' || pathname.endsWith('octave.data');
    const isJs = pathname.endsWith('/octave.js') || pathname === 'octave.js' || pathname.endsWith('octave.js');
    // 注意 endsWith('manifest.json') 不含 manifest.w64.json（后缀不同），w64 档天然走网络
    const isAssetsManifest = pathname.endsWith('/assets/manifest.json') || pathname === 'assets/manifest.json';
    const isBuildJson = pathname.endsWith('/octave.build.json') || pathname === 'octave.build.json';

    if (!isWasm && !isData && !isJs && !isAssetsManifest && !isBuildJson) {
      return null;
    }

    // 存储名映射（#6 唯一一处）：URL 里的 assets/manifest.json 在 OPFS 记账里是
    // 平铺名 assets-manifest.json（下载时 destPath 就这么定——避免与站点资产清单语义混淆）。
    // tryServeFromStorage 按 filename 拼存储路径，这里在匹配出口直接换算。
    const filename = isWasm
      ? 'octave.wasm'
      : isData
      ? 'octave.data'
      : isJs
      ? 'octave.js'
      : isAssetsManifest
      ? 'assets-manifest.json'
      : 'octave.build.json';

    // 路径防交叉污染检查：
    // 1. 若路径显式包含其他车道名，严禁跨车道误拦截
    const allLanes: EngineLane[] = ['master', 'wasm32-final', 'IllegalPerformance', 'omc'];
    for (const other of allLanes) {
      if (other !== lane && (pathname.includes(`/lanes/${other}/`) || pathname.includes(`/${other}/`))) {
        return null;
      }
    }

    // 2. 若路径显式包含冲突的架构名，严禁跨架构误拦截
    if (variant === 'w64' && (pathname.includes('/w32/') || pathname.includes('w32/'))) {
      return null;
    }
    if (variant === 'w32' && (pathname.includes('/w64/') || pathname.includes('w64/'))) {
      return null;
    }

    // 3. 必须包含本车道名、本架构名、或为通用相对路径 (!pathname.includes('/lanes/'))
    const hasLaneInPath = pathname.includes(`/lanes/${lane}/`) || pathname.includes(`/${lane}/`);
    const hasVariantInPath = pathname.includes(`/${variant}/`) || pathname.includes(`${variant}/`);
    const isGeneric = !pathname.includes('/lanes/');

    if (hasLaneInPath || hasVariantInPath || isGeneric) {
      return { filename };
    }

    return null;
  }

  async tryServeFromStorage(
    lane: EngineLane,
    variant: EngineVariant,
    filename: string
  ): Promise<Response | null> {
    await this._store.init();

    // 优先检索 downloads/engine/${lane}/${variant}/${filename}，降级兼容 downloads/engine/${lane}/${filename}
    const standardPath = `downloads/engine/${lane}/${variant}/${filename}`;
    const legacyPath = `downloads/engine/${lane}/${filename}`;

    let targetPath = '';
    const statStandard = await this._store.stat(standardPath);
    if (statStandard && (statStandard.size ?? 0) > 0) {
      targetPath = standardPath;
    } else {
      const statLegacy = await this._store.stat(legacyPath);
      if (statLegacy && (statLegacy.size ?? 0) > 0) {
        targetPath = legacyPath;
      }
    }

    if (!targetPath) {
      return null;
    }

    try {
      const blob = await this.getBlob(targetPath);
      const isWasm = filename.endsWith('.wasm');
      const isJs = filename.endsWith('.js');
      const mime = isWasm
        ? 'application/wasm'
        : isJs
        ? 'application/javascript'
        : 'application/octet-stream';

      const body = typeof blob.stream === 'function' ? blob.stream() : blob;

      return new Response(body as any, {
        status: 200,
        statusText: 'OK',
        headers: {
          'Content-Type': mime,
          'Content-Length': blob.size.toString(),
        },
      });
    } catch (err) {
      console.warn(`[EngineAssetResolver] Failed to serve local asset ${targetPath}:`, err);
      return null;
    }
  }

  async getBlob(path: string): Promise<Blob> {
    if (typeof (this._store as any).readBlob === 'function') {
      return await (this._store as any).readBlob(path);
    }
    const data = await this._store.read(path);
    return new Blob([data]);
  }

  async checkPhysicalStatus(lane: EngineLane, variant?: EngineVariant): Promise<EngineAssetStatus> {
    await this._store.init();
    const v = variant || getDefaultVariant(lane);

    if (lane === 'omc') {
      const standardWasm = `downloads/engine/omc/${v}/OpenModelicaCompiler_bg.wasm`;
      const legacyWasm = `downloads/engine/omc/OpenModelicaCompiler_bg.wasm`;
      const standardJs = `downloads/engine/omc/${v}/OpenModelicaCompiler.js`;
      const legacyJs = `downloads/engine/omc/OpenModelicaCompiler.js`;

      let wasmStat = await this._store.stat(standardWasm);
      if (!wasmStat || (wasmStat.size ?? 0) <= 0) {
        wasmStat = await this._store.stat(legacyWasm);
      }

      let jsStat = await this._store.stat(standardJs);
      if (!jsStat || (jsStat.size ?? 0) <= 0) {
        jsStat = await this._store.stat(legacyJs);
      }

      const wasmOk = !!wasmStat && (wasmStat.size ?? 0) > 0;
      const jsOk = !!jsStat && (jsStat.size ?? 0) > 0;
      const downloaded = wasmOk && jsOk;
      const totalBytes = downloaded ? (wasmStat!.size ?? 0) + (jsStat!.size ?? 0) : 0;

      const integrity = downloaded
        ? await this._checkLaneIntegrity('omc', v, [
            { stat: wasmStat!, path: wasmStat!.path },
            { stat: jsStat!, path: jsStat!.path },
          ])
        : 'unchecked';

      return {
        lane,
        downloaded,
        variant: v,
        totalBytes,
        verifiedAt: Date.now(),
        integrity,
      };
    }

    // Octave: 离线五件套（#6）—— wasm/data/js/build/assets-manifest。
    // downloaded 语义仍由 wasm+data 两件决定（对齐历史存在语义）；
    // 五件全部 stat 进 physicals ⇒ 指纹面与 #7 的记账面同宽：
    // 记账收的是全部五件，指纹只看两件的话，用户删 assets-manifest.json
    // 而 wasm/data size 不变 ⇒ 缓存命中误报 verified（对账漏判）。
    const standardWasm = `downloads/engine/${lane}/${v}/octave.wasm`;
    const legacyWasm = `downloads/engine/${lane}/octave.wasm`;
    const standardData = `downloads/engine/${lane}/${v}/octave.data`;
    const legacyData = `downloads/engine/${lane}/octave.data`;
    const standardJs = `downloads/engine/${lane}/${v}/octave.js`;
    const standardBuild = `downloads/engine/${lane}/${v}/octave.build.json`;
    const standardAssetsManifest = `downloads/engine/${lane}/${v}/assets-manifest.json`;

    let wasmStat = await this._store.stat(standardWasm);
    if (!wasmStat || (wasmStat.size ?? 0) <= 0) {
      wasmStat = await this._store.stat(legacyWasm);
    }

    let dataStat = await this._store.stat(standardData);
    if (!dataStat || (dataStat.size ?? 0) <= 0) {
      dataStat = await this._store.stat(legacyData);
    }

    const wasmOk = !!wasmStat && (wasmStat.size ?? 0) > 0;
    const dataOk = !!dataStat && (dataStat.size ?? 0) > 0;
    const downloaded = wasmOk && dataOk;
    const totalBytes = downloaded ? (wasmStat!.size ?? 0) + (dataStat!.size ?? 0) : 0;

    const integrity = downloaded
      ? await this._checkLaneIntegrity(lane, v, [
          { stat: wasmStat!, path: wasmStat!.path },
          { stat: dataStat!, path: dataStat!.path },
          // 缺件进指纹按 size -1：文件删了 ⇒ 指纹必变 ⇒ 缓存不命中 ⇒ 重走全量对账
          { stat: (await this._store.stat(standardJs)) || { size: -1 }, path: standardJs },
          { stat: (await this._store.stat(standardBuild)) || { size: -1 }, path: standardBuild },
          { stat: (await this._store.stat(standardAssetsManifest)) || { size: -1 }, path: standardAssetsManifest },
        ])
      : 'unchecked';

    return {
      lane,
      downloaded,
      variant: v,
      totalBytes,
      verifiedAt: Date.now(),
      integrity,
    };
  }

  /**
   * 车道级对账入口：先看会话缓存，miss 才走三步对账。
   *
   * 缓存键是**三态结论**（verified / corrupted / unchecked），判据只有一个：
   * 盘面指纹（stat size 拼接）与结论作出时是否一致。指纹变 ⇒ 盘变了 ⇒ 重验。
   * 三种结论都入缓存——corrupted 命中时不再重读约 40MB 引擎字节，
   * unchecked 命中时不再重读 manifest（盘没变，账也不会变）。
   *
   * 边界（如实写明）：指纹只覆盖**引擎文件**的 stat size，不含 downloads/manifest.json。
   * 账本身变化必须靠写路径显式 invalidateCache()——本仓所有 manifest 写入都在
   * DownloadStore 里成对带失效（download 终态 / removeEngine→evict）。
   */
  private async _checkLaneIntegrity(
    lane: EngineLane,
    variant: EngineVariant,
    physicals: Array<{ stat: { size?: number }; path: string }>
  ): Promise<EngineIntegrity> {
    const cacheKey = `${lane}/${variant}`;
    const fingerprint = this._fingerprintOf(physicals);

    // 缓存命中：结论与当时指纹都还在，且每个文件 stat size 与缓存时一致 ⇒ 盘未变
    const cached = this._integrityCache.get(cacheKey);
    if (cached && cached.fingerprint === fingerprint) {
      return cached.verdict;
    }

    const verdict = await this._reconcileLane(lane, variant, physicals);
    this._integrityCache.set(cacheKey, { verdict, fingerprint, at: Date.now() });
    return verdict;
  }

  /**
   * 车道级三步对账（stat 已由调用方完成，这里收全部 stat 结果）：
   * 1. size 硬判：盘上 size === manifest files[] 记账 bytes（逐文件）；
   * 2. sha 复验：盘上字节重算 SHA-256 与记账 sha256 比对；
   * 3. 无 manifest 记账（缺失/损坏/无该车道条目）⇒ 'unchecked'（退回 size>0 旧存在语义）。
   * 结论由调用方进缓存。
   */
  private async _reconcileLane(
    lane: EngineLane,
    variant: EngineVariant,
    physicals: Array<{ stat: { size?: number }; path: string }>
  ): Promise<EngineIntegrity> {
    const entries = await this._readManifestFilesForLane(lane, variant);
    if (!entries || entries.length === 0) {
      // 无账可对：不猜好坏，如实标记 unchecked（downloaded 仍是 size>0 的存在语义）
      return 'unchecked';
    }

    // 记账与物理文件按 path 精确对齐；任意记账文件盘上缺席 ⇒ corrupted
    const byPath = new Map(entries.map((e) => [e.path, e]));
    for (const phys of physicals) {
      const record = byPath.get(phys.path);
      if (!record) {
        // 五件指纹把「缺件」（size -1 的占位 stat）也送进来对账：只对**物理在**的件
        // 查记账缺号；缺件本身不必有账（是否 corrupted 由下面的 sha 复验环对全部记账
        // 文件逐条 read 兜住——记账有、盘上无 ⇒ read 失败 ⇒ corrupted）。
        if ((phys.stat.size ?? 0) < 0) {
          continue;
        }
        return 'corrupted';
      }
      // size 硬判：截断/膨胀在算哈希前就拦下
      if ((phys.stat.size ?? 0) !== record.bytes) {
        return 'corrupted';
      }
    }

    // sha 复验：盘上字节重算与记账比对（记账里的每个文件都要对，盘变账没变即红）
    for (const entry of entries) {
      let data: Uint8Array;
      try {
        data = await this._store.read(entry.path);
      } catch {
        return 'corrupted';
      }
      const sha = await this._computeSha256(data);
      if (sha !== entry.sha256) {
        return 'corrupted';
      }
    }

    return 'verified';
  }

  /**
   * 盘状态的便宜指纹：全部文件 stat size 的拼接。
   * 只用 stat 可得的量——缓存命中判据绝不读盘内容，否则缓存就失去意义。
   * 局限（如实写明）：stat size 只能看见截断/膨胀；等长 XOR 篡改盘未变时命中缓存
   * 是设计行为——篡改后必须走 invalidateCache()（DownloadStore download() 成功后的挂点）。
   */
  private _fingerprintOf(physicals: Array<{ stat: { size?: number } }>): string {
    return physicals.map((p) => String(p.stat.size ?? 0)).join(',');
  }

  /**
   * 读 downloads/manifest.json，按 destPath 前缀匹配取该 lane/variant 的 files[] 记账。
   * 不解析 ref 键形状（items 键是 `engine:octave@11.3.0:arch` 一类，形状会漂）；
   * 引擎文件固定落在 downloads/engine/${lane}/${variant}/ 前缀下，按 files[].path 前缀匹配最稳。
   * manifest 读不出 / 无匹配条目 ⇒ null（调用方按无账可对处理）。
   */
  private async _readManifestFilesForLane(
    lane: EngineLane,
    variant: EngineVariant
  ): Promise<Array<{ path: string; sha256: string; bytes: number }> | null> {
    try {
      const stat = await this._store.stat('downloads/manifest.json');
      if (!stat) return null;
      const data = await this._store.read('downloads/manifest.json');
      const parsed = JSON.parse(new TextDecoder().decode(data));
      if (!parsed || parsed.schema !== 1 || typeof parsed.items !== 'object' || !parsed.items) {
        return null;
      }
      const prefix = `downloads/engine/${lane}/${variant}/`;
      const collected: Array<{ path: string; sha256: string; bytes: number }> = [];
      for (const record of Object.values(parsed.items as Record<string, any>)) {
        if (!record || !Array.isArray(record.files)) continue;
        for (const f of record.files) {
          if (
            f &&
            typeof f.path === 'string' &&
            f.path.startsWith(prefix) &&
            typeof f.sha256 === 'string' &&
            typeof f.bytes === 'number'
          ) {
            collected.push({ path: f.path, sha256: f.sha256, bytes: f.bytes });
          }
        }
      }
      return collected.length > 0 ? collected : null;
    } catch {
      // manifest 坏 / 读失败：无账可对，不是盘坏——降级 unchecked 而非 corrupted
      return null;
    }
  }

  /**
   * SHA-256 计算（私有封装）：浏览器走 crypto.subtle.digest；
   * Node 测试环境无 crypto.subtle 时动态 import node:crypto 兜底——同一输入两种路径必须同值。
   */
  private async _computeSha256(data: Uint8Array): Promise<string> {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const hashBuffer = await crypto.subtle.digest('SHA-256', data as unknown as BufferSource);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    const nodeCrypto = await import('node:crypto');
    return nodeCrypto.createHash('sha256').update(data).digest('hex');
  }

  invalidateCache(lane: EngineLane, variant?: EngineVariant): void {
    if (variant) {
      this._integrityCache.delete(`${lane}/${variant}`);
      return;
    }
    const prefix = `${lane}/`;
    for (const key of Array.from(this._integrityCache.keys())) {
      if (key.startsWith(prefix)) {
        this._integrityCache.delete(key);
      }
    }
  }

  async assertBootable(lane: EngineLane, variant?: EngineVariant): Promise<boolean> {
    const status = await this.checkPhysicalStatus(lane, variant);
    if (!status.downloaded) {
      // 未下载走网络下载是合法路径，不拦
      return false;
    }
    if (status.integrity !== 'verified') {
      // fail fast：绝不把坏字节送进 WebAssembly.compile；不自动 evict，重下是用户显式动作
      const err = new Error(
        `引擎 ${lane}/${status.variant} 本地文件完整性校验未通过（${status.integrity}），拒绝启动——请重新下载修复`
      ) as Error & { code: string };
      err.code = 'ENGINE_CORRUPTED';
      throw err;
    }
    return true;
  }

  async withLocalAssets<T>(
    lane: EngineLane,
    variant: EngineVariant,
    bootFn: () => Promise<T>
  ): Promise<T> {
    const rule: ActiveInterceptionRule = {
      id: `rule_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      lane,
      variant,
      resolver: this,
    };

    if (activeRules.length === 0) {
      originalFetch = globalThis.fetch;
      globalThis.fetch = scopedFetchProxy;
    }
    activeRules.push(rule);

    try {
      return await bootFn();
    } finally {
      const idx = activeRules.findIndex((r) => r.id === rule.id);
      if (idx !== -1) {
        activeRules.splice(idx, 1);
      }
      if (activeRules.length === 0 && originalFetch) {
        globalThis.fetch = originalFetch;
        originalFetch = null;
      }
    }
  }

  async evict(lane: EngineLane, variant?: EngineVariant): Promise<void> {
    await this._store.init();
    const variantsToClean: EngineVariant[] = variant ? [variant] : ['w64', 'w32'];
    const filesToEvict: string[] = [];

    // 物理删除 ⇒ 对账结论必然失效：evict 内部必须显式失效缓存（决议 3 的挂点）
    this.invalidateCache(lane, variant);

    if (lane === 'omc') {
      for (const varName of variantsToClean) {
        filesToEvict.push(
          `downloads/engine/omc/${varName}/OpenModelicaCompiler_bg.wasm`,
          `downloads/engine/omc/${varName}/OpenModelicaCompiler.js`
        );
      }
      filesToEvict.push(
        `downloads/engine/omc/OpenModelicaCompiler_bg.wasm`,
        `downloads/engine/omc/OpenModelicaCompiler.js`
      );
    } else {
      for (const varName of variantsToClean) {
        filesToEvict.push(
          `downloads/engine/${lane}/${varName}/octave.wasm`,
          `downloads/engine/${lane}/${varName}/octave.data`,
          `downloads/engine/${lane}/${varName}/octave.js`
        );
      }
      filesToEvict.push(
        `downloads/engine/${lane}/octave.wasm`,
        `downloads/engine/${lane}/octave.data`,
        `downloads/engine/${lane}/octave.js`
      );
    }

    for (const f of filesToEvict) {
      try {
        await this._store.remove(f);
      } catch {}
    }
  }
}
