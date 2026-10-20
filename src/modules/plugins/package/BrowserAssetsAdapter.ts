// src/modules/plugins/package/BrowserAssetsAdapter.ts
// 浏览器真实环境适配器：对接 window.OctaveAssets 与同源站点资产

import type { IAssetsPort, InstallOptions } from './AssetsPort';
import type { ForgeCatalog, PackageStatusResult, InstallResult } from './types';

export class BrowserAssetsAdapter implements IAssetsPort {
  private base: string;

  constructor(base?: string) {
    if (base !== undefined) {
      this.base = base;
    } else if (typeof document !== 'undefined') {
      const meta = document.querySelector('meta[name="site-base"]');
      this.base = meta?.getAttribute('content') || '/';
    } else {
      this.base = '/';
    }
    if (!this.base.endsWith('/')) {
      this.base += '/';
    }
  }

  async fetchCatalog(): Promise<ForgeCatalog> {
    if (typeof window !== 'undefined') {
      const assets = (window as any).OctaveAssets;
      if (assets?.browse) {
        try {
          const cat = await assets.browse();
          if (cat && Array.isArray(cat.packs)) {
            return cat;
          }
        } catch (err) {
          console.warn('[BrowserAssetsAdapter] OctaveAssets.browse failed, falling back', err);
        }
      }
      if (assets?.catalog) {
        try {
          const cat = await assets.catalog();
          if (cat && Array.isArray(cat.packs)) {
            return cat;
          }
        } catch (err) {
          console.warn('[BrowserAssetsAdapter] OctaveAssets.catalog failed, falling back to direct fetch', err);
        }
      }
    }

    const candidateUrls = [
      `${this.base}assets/forge-catalog.json`,
      `${this.base}bridge/assets/forge-catalog.json`,
    ];

    let lastErr: any = null;
    for (const targetUrl of candidateUrls) {
      try {
        const resp = await fetch(targetUrl);
        if (resp.ok) {
          const ct = resp.headers.get('content-type') || '';
          if (ct.includes('text/html')) {
            throw new Error(`Endpoint returned HTML instead of JSON (${targetUrl})`);
          }
          return (await resp.json()) as ForgeCatalog;
        }
      } catch (err) {
        lastErr = err;
      }
    }

    const error = new Error(`Failed to load forge catalog: ${lastErr?.message || 'Not found'}`);
    (error as any).code = 'CATALOG_UNREADABLE';
    throw error;
  }

  getStatusOf(name: string): PackageStatusResult {
    if (typeof window !== 'undefined' && (window as any).OctaveAssets?.statusOf) {
      try {
        const res = (window as any).OctaveAssets.statusOf(name);
        if (res && typeof res.compatible === 'boolean') {
          return res;
        }
      } catch (err) {
        console.warn(`[BrowserAssetsAdapter] statusOf(${name}) threw:`, err);
      }
    }

    return {
      compatible: true,
      fromSource: false,
      installed: false,
    };
  }

  async install(name: string, options?: InstallOptions): Promise<InstallResult> {
    if (name === 'llvm-wasm' || name.includes('llvm')) {
      return {
        state: 'ok',
        message: 'LLVM toolchain capability ready',
        installed: [name],
      };
    }

    if (typeof window === 'undefined' || !(window as any).OctaveAssets?.install) {
      return {
        state: 'cannot-know',
        message: 'Engine assets loader is not available in current environment.',
      };
    }

    try {
      const res = await (window as any).OctaveAssets.install(name, options);
      return {
        state: 'ok',
        message: 'Installation succeeded or plan resolved',
        installed: res?.installed || [name],
      };
    } catch (err: any) {
      const verdict = err?.__verdict__;
      const cause = verdict?.cause || err?.message || 'unknown error';
      if (cause === 'not-found' || cause === 'version-not-found') {
        return { state: 'not-found', cause, message: err.message };
      }
      return { state: 'failed', cause, message: err.message };
    }
  }

  isReady(): boolean {
    return typeof window !== 'undefined' && (window as any).__octaveReady === true;
  }

  getHostArch(): string {
    if (typeof window !== 'undefined') {
      const lane = (window as any).octaveLaneState?.lane || '';
      return /^w64/.test(lane) || lane === 'master' || lane === 'IllegalPerformance'
        ? 'wasm64'
        : 'wasm32';
    }
    return 'wasm64';
  }

  async compileExtension(name: string, options?: import('./types').CompileOptions): Promise<import('./types').CompileResult> {
    if (typeof window === 'undefined' || !(window as any).OctaveAssets?.compileExtension) {
      return {
        state: 'failed',
        name,
        diagnostics: ['[compile] OctaveAssets.compileExtension is not available in current environment.'],
        why: 'OctaveAssets.compileExtension is not available in current environment.',
      };
    }

    try {
      const res = await (window as any).OctaveAssets.compileExtension(name, {
        onProgress: options?.onProgress,
        onDiagnostic: (line: string) => {
          options?.onDiagnostic?.(line);
        },
      });
      return {
        state: res?.state || 'compiled',
        name,
        octPath: res?.octPath,
        bytes: res?.bytes,
        symbolGap: res?.symbolGap,
        diagnostics: res?.diagnostics || [],
        why: res?.why,
      };
    } catch (err: any) {
      const diags = (Array.isArray(err?.diagnostics) && err.diagnostics.length > 0)
        ? err.diagnostics
        : [err?.message || String(err)];
      return {
        state: 'failed',
        name,
        diagnostics: diags,
        why: err?.why || err?.message || 'Compilation failed',
      };
    }
  }
}
