// src/modules/engine/EngineAssetResolver.ts
// 离线资产解析深模块：瞬态作用域拦截代理、OPFS 物理对账、并发防护与内存生命周期管理

import type { Store } from '../storage/types';
import { OpfsStore } from '../storage/OpfsStore';
import { MemoryStore } from '../storage/MemoryStore';

export type EngineLane = 'master' | 'wasm32-final' | 'IllegalPerformance' | 'omc';
export type EngineVariant = 'w64' | 'w32';

export interface EngineAssetStatus {
  readonly lane: EngineLane;
  readonly downloaded: boolean;
  readonly variant: EngineVariant;
  readonly totalBytes: number;
  readonly verifiedAt: number;
}

export interface IEngineAssetResolver {
  /**
   * 物理对账检查目标引擎是否已完整持久化于 OPFS
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
      EngineAssetResolver._instance = new EngineAssetResolver(store);
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

    // Octave 资产匹配: octave.wasm, octave.data 与 octave.js
    const isWasm = pathname.endsWith('/octave.wasm') || pathname === 'octave.wasm' || pathname.endsWith('octave.wasm');
    const isData = pathname.endsWith('/octave.data') || pathname === 'octave.data' || pathname.endsWith('octave.data');
    const isJs = pathname.endsWith('/octave.js') || pathname === 'octave.js' || pathname.endsWith('octave.js');

    if (!isWasm && !isData && !isJs) {
      return null;
    }

    const filename = isWasm ? 'octave.wasm' : isData ? 'octave.data' : 'octave.js';

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

      return {
        lane,
        downloaded,
        variant: v,
        totalBytes,
        verifiedAt: Date.now(),
      };
    }

    // Octave: octave.wasm 与 octave.data 均须物理存在且 > 0 字节
    const standardWasm = `downloads/engine/${lane}/${v}/octave.wasm`;
    const legacyWasm = `downloads/engine/${lane}/octave.wasm`;
    const standardData = `downloads/engine/${lane}/${v}/octave.data`;
    const legacyData = `downloads/engine/${lane}/octave.data`;

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

    return {
      lane,
      downloaded,
      variant: v,
      totalBytes,
      verifiedAt: Date.now(),
    };
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
