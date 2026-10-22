// src/modules/engine/OmcBridge.ts
// OpenModelica flavor 桥：OMC 运行时装载（网络 import → OPFS 离线降级）、环境变量与 in-wasm driver 接线。
// 约束：engine 层不碰 UI 面——本模块禁止 import UI 层的通知服务（engine→ui 倒挂），
// 失败一律 throw；附加 flavor（双引擎模式）的降级告知走 onOmcFlavorError 回调通道，由组合根订阅后呈现。

import { EngineAssetResolver, type EngineLane } from './EngineAssetResolver';

/** OMC flavor 失败错误：附加 flavor（双引擎模式）失败必带 code=FLAVOR_UNAVAILABLE */
export type OmcFlavorError = Error & { code?: string };

type FlavorErrorListener = (err: OmcFlavorError) => void;

// 附加 flavor 失败的单向通知通道：engine → 组合根（UI 层）。
// 错误对象同时照常上抛——通知供 UI 呈现（toast），上抛供调用方做控制流（分级吞或再抛）；
// 订阅方抛异常不得影响 engine 主流程。
const flavorErrorListeners = new Set<FlavorErrorListener>();

/** 订阅附加 flavor 失败（组合根接线用）；返回退订函数 */
export function onOmcFlavorError(cb: FlavorErrorListener): () => void {
  flavorErrorListeners.add(cb);
  return () => {
    flavorErrorListeners.delete(cb);
  };
}

function notifyFlavorError(err: OmcFlavorError): void {
  for (const cb of flavorErrorListeners) {
    try { cb(err); } catch {}
  }
}

/**
 * 初始化 OpenModelica 桥接环境与 MEMFS 路径。
 *
 * 失败语义（分叉，调用方须遵守）：
 * - lane === 'omc'（主 flavor）：失败原样上抛——主 flavor 失败即 boot 失败；
 * - 其他 lane（双引擎模式，OMC 为附加 flavor）：失败上抛带 code=FLAVOR_UNAVAILABLE 的
 *   Error（不许吞——吞了就是静默降级冒充成功），并经 onOmcFlavorError 通道送 UI 层呈现。
 */
export async function setupOmcBridge(embed: any, lane?: EngineLane): Promise<void> {
  try {
    const FS =
      embed?.mod?.FS ||
      (typeof window !== 'undefined'
        ? (window as any).__octaveHosts?.[0]?.mod?.FS || (window as any).Module?.FS
        : null);
    if (!FS) return;
    try { FS.mkdir('/tmp'); } catch {}
    if (embed?.eval) {
      try { await embed.eval("addpath('/tmp');"); } catch {}
    }

    if (typeof window !== 'undefined' && !(window as any).__omc) {
      await EngineAssetResolver.getInstance().withLocalAssets('omc', 'w32', async () => {
        const globalBase = (document.querySelector('meta[name="site-base"]')?.getAttribute('content') || (window as any).__siteBase) || '/';
        const normalizedBase = globalBase.endsWith('/') ? globalBase : `${globalBase}/`;
        const omcScriptUrl = `${normalizedBase}omc/OpenModelicaCompiler.js`;
        const omcWasmUrl = `${normalizedBase}omc/OpenModelicaCompiler_bg.wasm`;
        let omcMod: any = null;
        let blobUrl: string | null = null;

        try {
          omcMod = await import(/* @vite-ignore */ omcScriptUrl);
        } catch (netErr) {
          // 离线环境降级：若网络/同源加载失败，从 OPFS 本地资产读取 js 胶水
          try {
            const resolver = EngineAssetResolver.getInstance();
            const jsBlob = await resolver.getBlob('downloads/engine/omc/w32/OpenModelicaCompiler.js')
              .catch(() => resolver.getBlob('downloads/engine/omc/OpenModelicaCompiler.js'));
            blobUrl = URL.createObjectURL(new Blob([jsBlob], { type: 'text/javascript' }));
            omcMod = await import(/* @vite-ignore */ blobUrl);
          } catch (opfsErr) {
            console.warn('[OmcBridge] OMC import failed from network and OPFS:', netErr, opfsErr);
            omcMod = null;
          }
        }

        try {
          if (omcMod) {
            if (typeof omcMod.default === 'function') {
              // 显式传参 wasmUrl：防范 blob: 作用域下 new URL(bg, import.meta.url) 抛出 Invalid URL
              await omcMod.default(omcWasmUrl);
            }
            if (typeof omcMod.omc_set_env === 'function') {
              omcMod.omc_set_env('OPENMODELICAHOME', '/usr');
            }
            if (typeof omcMod.omc_init === 'function') {
              omcMod.omc_init();
            }
            if (typeof omcMod.omc_set_inwasm_driver === 'function') {
              omcMod.omc_set_inwasm_driver(1);
            }
            (window as any).__omc = omcMod;
          } else {
            const err = new Error('OpenModelica compiler runtime unavailable') as OmcFlavorError;
            err.code = 'FLAVOR_UNAVAILABLE';
            throw err;
          }
        } finally {
          if (blobUrl) {
            URL.revokeObjectURL(blobUrl);
          }
        }
      });
    }
  } catch (err: any) {
    if (lane === 'omc') {
      // 主 flavor 失败是 boot 失败：原样上抛，不走降级通知（没有可降级的 Octave 主通道）
      throw err;
    }
    // 双引擎模式（附加 flavor）：带 code 上抛交调用方分级，同时经回调通道送 UI 层 toast
    const coded = err as OmcFlavorError;
    if (!coded.code) {
      coded.code = 'FLAVOR_UNAVAILABLE';
    }
    notifyFlavorError(coded);
    throw err;
  }
}
