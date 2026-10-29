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
 *
 * 前置条件：embed（或 window 上的宿主）必须暴露 MEMFS 入口 FS。三源全缺同样按上面的
 * 分叉失败（带 code=FLAVOR_UNAVAILABLE）——**不许静默早退**，见函数内注释。
 */
export async function setupOmcBridge(embed: any, lane?: EngineLane): Promise<void> {
  try {
    const FS =
      embed?.mod?.FS ||
      (typeof window !== 'undefined'
        ? (window as any).__octaveHosts?.[0]?.mod?.FS || (window as any).Module?.FS
        : null);
    // 装配前置契约：MEMFS 入口三源全缺 = embed lane 模块形状不是本桥认得的形状。
    // 历史实现此处 `return`（静默早退）——用户勾了 omc 却「什么也没发生」，
    // __omc 永不赋值、不报错、也不走 flavor 失败通道。那是产品形状缺陷：
    // 未来换 embed 实现或某 lane 模块形状变化时，会静默失效且无人知晓。
    // 现在按本文件统一的失败语义响亮失败：lane='omc' 原样上抛（boot 失败），
    // 双引擎模式带 code 上抛 + 经 onOmcFlavorError 通知（调用方降级 Octave-only）。
    // 为何不「缺 FS 也降级继续」：mkdir('/tmp')/addpath 虽各自 best-effort，但二者正是
    // Octave↔OMC 的共享路径接线；FS 三源全缺意味着这条缝本身不存在，继续装配只会留下
    // 「__omc 有值但路径未接」的半成品，把契约缺陷推迟成后续 omc_eval 的费解报错。
    // 早早响亮失败比半装配后随机失败可查。
    if (!FS) {
      const err = new Error(
        'OMC 装配前置失败：embed 未暴露 mod.FS（OMC 的 MEMFS 入口不可得）——' +
          '已检查 embed.mod.FS / window.__octaveHosts[0].mod.FS / window.Module.FS 三源，均缺失。' +
          '这通常意味着 embed lane 模块形状与桥接契约不符。'
      ) as OmcFlavorError;
      err.code = 'FLAVOR_UNAVAILABLE';
      throw err;
    }
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
