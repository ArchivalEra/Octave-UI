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
    const base = opts.base || `${normalizedBase}lanes/${lane}/`;

    // 确保按需加载对应车道的 Emscripten 胶水脚本
    if (typeof document !== 'undefined') {
      const scriptUrl = `${base}octave.js`;
      if (!document.querySelector(`script[data-lane="${lane}"]`)) {
        await new Promise<void>((resolve, reject) => {
          const s = document.createElement('script');
          s.src = scriptUrl;
          s.setAttribute('data-lane', lane);
          s.onload = () => resolve();
          s.onerror = () => reject(new Error(`Failed to load engine runtime script from ${scriptUrl}`));
          document.head.appendChild(s);
        });
      }
    }

    // 构造符合 octave-core.js 契约的具象车道计划
    const lanePlan = {
      lane: lane === 'wasm32-final' ? 'base' : 'w64',
      dir: '',
      js: 'octave.js',
      wasm: 'octave.wasm',
      data: 'octave.data',
    };

    const bootPromise = window.OctaveEmbed.create({
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
    return new WasmEmbedAdapter(embed);
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
