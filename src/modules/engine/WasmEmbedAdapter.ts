// src/modules/engine/WasmEmbedAdapter.ts
// 浏览器真实适配器：连接 window.OctaveEmbed.create() 与 14/14 Embed API
import type {
  OctaveEmbedPort,
  WorkspaceVariable,
  FsEntry,
  EvalResult,
  EvalJSONResult,
  BootOptions,
  OutputCallback,
  ErrorCallback,
  FigureCallback,
} from './types';

import { EngineAssetResolver, type EngineLane, type EngineVariant } from './EngineAssetResolver';
import * as OmcBridge from './OmcBridge';

declare global {
  interface Window {
    OctaveEmbed?: {
      create(opts?: Record<string, any>): Promise<any>;
    };
    __octaveHosts?: any[];
    octave?: any;
  }
}

export class WasmEmbedAdapter implements OctaveEmbedPort {
  private _embed: any;

  private constructor(embed: any) {
    this._embed = embed;
  }

  static async boot(opts: BootOptions = {}): Promise<WasmEmbedAdapter> {
    if (typeof window === 'undefined' || !window.OctaveEmbed) {
      throw new Error('OctaveEmbed is not available on window. Ensure bridge scripts are loaded.');
    }

    const lane = opts.lane || 'wasm32-final';
    const globalBase = (typeof document !== 'undefined' && (document.querySelector('meta[name="site-base"]')?.getAttribute('content') || (window as any).__siteBase)) || '/';
    const normalizedBase = globalBase.endsWith('/') ? globalBase : `${globalBase}/`;
    const laneFolder = lane === 'omc' ? 'wasm32-final' : lane;
    const base = opts.base || `${normalizedBase}lanes/${laneFolder}/`;

    const isW64 = lane === 'master' || lane === 'IllegalPerformance';
    const scriptPath = isW64 ? 'w64/octave.js' : 'octave.js';
    const scriptUrl = `${base}${scriptPath}`;
    const scriptKey = `${laneFolder}-${isW64 ? 'w64' : 'base'}`;

    const variant: EngineVariant = isW64 ? 'w64' : 'w32';
    const octaveLane: EngineLane = (lane === 'omc' ? 'wasm32-final' : lane) as EngineLane;

    // boot 前置对账（#6 Q6.2b，路线反转）：
    // · verified ⇒ OPFS 直载零网络（octave.js 从本地读出注入 script）；
    // · 未下载 false ⇒ 网络路线（未下载走网络下载是合法路径）；
    // · 坏盘（downloaded 但对账不过）⇒ assertBootable throw ENGINE_CORRUPTED——
    //   fail fast，绝不把坏字节送进 WebAssembly.compile；重下是用户显式动作。
    const resolver = EngineAssetResolver.getInstance();
    const bootable = await resolver.assertBootable(octaveLane, variant);

    // 确保按需加载对应车道的 Emscripten 胶水脚本：
    // OPFS 已验（bootable）走本地直载；否则网络 <script src> 是唯一来源——
    // 网络路线失败就是失败（原 onerror 里的 OPFS 降级已按 #6 决议删除：
    // 对账不过的盘不该被静默拿来兜底，那正是本次修掉的「误报可用」坑）。
    if (typeof document !== 'undefined') {
      const existing = document.querySelector(`script[data-lane]`);
      const currentActive = existing?.getAttribute('data-lane');
      if (currentActive !== scriptKey) {
        if (existing) {
          existing.remove();
        }
        if (bootable) {
          // OPFS 直载：从本地资产读 octave.js 注入脚本（原 onerror 降级逻辑转正为主路线，
          // data-lane 标记保持；保留 legacy 平铺路径 .catch() 降级兼容旧布局）
          const jsPath = `downloads/engine/${octaveLane}/${variant}/octave.js`;
          const legacyJsPath = `downloads/engine/${octaveLane}/octave.js`;
          const jsBlob = await resolver.getBlob(jsPath).catch(() => resolver.getBlob(legacyJsPath));
          const jsText = await jsBlob.text();
          const localScript = document.createElement('script');
          localScript.setAttribute('data-lane', scriptKey);
          localScript.textContent = jsText;
          document.head.appendChild(localScript);
        } else {
          // 网络路线：未下载是唯一合法走网络的理由
          await new Promise<void>((resolve, reject) => {
            const s = document.createElement('script');
            s.src = scriptUrl;
            s.setAttribute('data-lane', scriptKey);
            s.onload = () => resolve();
            s.onerror = () => {
              reject(new Error(`Failed to load engine runtime script from ${scriptUrl}`));
            };
            document.head.appendChild(s);
          });
        }
      }
    }

    // 构造符合 octave-core.js 契约的具象车道计划
    const lanePlan = {
      lane: isW64 ? 'w64' : 'base',
      dir: isW64 ? 'w64/' : '',
      js: isW64 ? 'w64/octave.js' : 'octave.js',
      wasm: isW64 ? 'w64/octave.wasm' : 'octave.wasm',
      data: isW64 ? 'w64/octave.data' : 'octave.data',
      manifest: isW64 ? 'assets/manifest.w64.json' : 'assets/manifest.json',
    };

    return await EngineAssetResolver.getInstance().withLocalAssets(
      octaveLane,
      variant,
      async () => {
        const bootPromise = window.OctaveEmbed!.create({
          base,
          mount: opts.mount || '#octave-raw-output',
          home: opts.home,
          id: opts.id || 'default',
          lane: lanePlan,
        });

        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error(`Octave 引擎 (${lane}) 启动超时 (30 秒)。请检查网络或控制台。`));
          }, 30000);
        });

        const embed = await Promise.race([bootPromise, timeoutPromise]);
        window.octave = embed;
        WasmEmbedAdapter.alignDocstringsPaths(embed);
        if (lane === 'omc' || opts.enableOmc) {
          try {
            await OmcBridge.setupOmcBridge(embed, lane as EngineLane);
          } catch (err: any) {
            if (lane !== 'omc' && err?.code === 'FLAVOR_UNAVAILABLE') {
              // 双引擎模式（附加 flavor）失败带 FLAVOR_UNAVAILABLE code ⇒ 降级为 Octave-only：
              // engine 层不碰 UI 面，toast 由组合根经 onOmcFlavorError 通道呈现。
              console.warn('[WasmEmbedAdapter] OMC flavor unavailable, continuing in Octave-only mode:', err);
            } else {
              // lane='omc'（主 flavor）失败 = boot 失败，必须上抛；
              // 无 code 的意外错误（编程缺陷一类）也不许静默吞掉——静默降级比显式失败更难查。
              throw err;
            }
          }
        }
        return new WasmEmbedAdapter(embed);
      }
    );
  }

  /**
   * 自动对齐 MEMFS 中的 docstrings 与 doc-cache 路径。
   * 当清单将基础资产挂载至 /src/work/octave-install-{lane}/，而 Octave 二进制
   * 编译期固定检索 /src/work/octave-install/ 时，无感补齐文件，修复 help 与 print_usage。
   */
  static alignDocstringsPaths(embed: any): void {
    try {
      const FS =
        embed?.mod?.FS ||
        (typeof window !== 'undefined'
          ? (window as any).__octaveHosts?.[0]?.mod?.FS || (window as any).Module?.FS
          : null);
      if (!FS) return;
      const targetDir = '/src/work/octave-install/share/octave/11.3.0/etc';
      const targetDocstrings = `${targetDir}/built-in-docstrings`;
      const targetCache = `${targetDir}/doc-cache`;

      const sourceDirs = [
        '/src/work/octave-install-w64/share/octave/11.3.0/etc',
        '/src/work/octave-install-threads/share/octave/11.3.0/etc',
      ];

      for (const src of sourceDirs) {
        try {
          const srcDocstrings = `${src}/built-in-docstrings`;
          const srcCache = `${src}/doc-cache`;

          let hasDocstrings = false;
          let hasCache = false;
          try { hasDocstrings = (FS.stat(srcDocstrings)?.size ?? 0) > 0; } catch {}
          try { hasCache = (FS.stat(srcCache)?.size ?? 0) > 0; } catch {}

          if (hasDocstrings || hasCache) {
            try { FS.mkdirTree(targetDir); } catch {}
            if (hasDocstrings) {
              let targetExists = false;
              try { targetExists = (FS.stat(targetDocstrings)?.size ?? 0) > 0; } catch {}
              if (!targetExists) {
                try {
                  FS.writeFile(targetDocstrings, FS.readFile(srcDocstrings));
                } catch {}
              }
            }
            if (hasCache) {
              let cacheExists = false;
              try { cacheExists = (FS.stat(targetCache)?.size ?? 0) > 0; } catch {}
              if (!cacheExists) {
                try {
                  FS.writeFile(targetCache, FS.readFile(srcCache));
                } catch {}
              }
            }
          }
        } catch {}
      }
    } catch {}
  }


  get id(): string {
    return this._embed?.id || 'unknown';
  }

  get state(): 'booting' | 'idle' | 'busy' {
    return this._embed?.state || 'booting';
  }

  eval(code: string): Promise<EvalResult> {
    return this._embed.eval(code);
  }

  evalJSON<T = any>(expr: string): Promise<EvalJSONResult<T>> {
    return this._embed.evalJSON(expr);
  }

  async workspace(): Promise<EvalJSONResult<WorkspaceVariable[]> | WorkspaceVariable[]> {
    return this._embed.workspace();
  }

  pwd(): Promise<EvalJSONResult<string> | string> {
    return this._embed.pwd();
  }

  cd(dir: string): Promise<EvalResult> {
    return this._embed.cd(dir);
  }

  help(name: string): Promise<EvalResult> {
    return this._embed.help(name);
  }

  history(): Promise<EvalResult> {
    return this._embed.history();
  }

  interrupt(): boolean {
    return this._embed.interrupt();
  }

  terminate(): void {
    if (typeof this._embed?.terminate === 'function') {
      try {
        this._embed.terminate();
      } catch {}
    }
  }

  input(text: string): number {
    return this._embed.input(text);
  }

  flushOutput(): void {
    if (typeof this._embed?.flushOutput === 'function') {
      try {
        this._embed.flushOutput();
      } catch {}
    }
  }

  on = {
    output: (cb: OutputCallback): boolean => this._embed.on.output(cb),
    error: (cb: ErrorCallback): boolean => this._embed.on.error(cb),
    state: (cb: (s: 'booting' | 'idle' | 'busy') => void): boolean => this._embed.on.state(cb),
    figure: (cb: FigureCallback): boolean => this._embed.on.figure(cb),
  };

  fs = {
    read: (path: string): string => this._embed.fs.read(path),
    write: (path: string, content: string | Uint8Array): boolean => (this._embed.fs.write as any)(path, content),
    ls: (dir: string): FsEntry[] => this._embed.fs.ls(dir),
    rm: (path: string): boolean => this._embed.fs.rm(path),
    download: (path: string): boolean => this._embed.fs.download(path),
  };

  figures = {
    export: (): string | null => this._embed.figures.export(),
  };
}
