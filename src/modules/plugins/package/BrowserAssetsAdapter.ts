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
    let cat: ForgeCatalog | null = null;

    if (typeof window !== 'undefined') {
      const assets = (window as any).OctaveAssets;
      // 1. 尝试从 OctaveAssets.catalog() 获取权威货架
      if (assets?.catalog) {
        try {
          const res = await assets.catalog();
          if (res && Array.isArray(res.packs)) {
            cat = res;
          }
        } catch (err) {
          console.warn('[BrowserAssetsAdapter] OctaveAssets.catalog failed, falling back to direct fetch', err);
        }
      }
    }

    // 2. 若未从 OctaveAssets.catalog() 取得，从静态文件拉取货架
    if (!cat) {
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
            cat = (await resp.json()) as ForgeCatalog;
            break;
          }
        } catch (err) {
          lastErr = err;
        }
      }

      // 3. 网络拉取失败时的应急构建：若 OctaveAssets.browse() 存在，合成货架（附带必要默认字段避免过滤崩溃）
      if (!cat && typeof window !== 'undefined' && (window as any).OctaveAssets?.browse) {
        try {
          const entries = await (window as any).OctaveAssets.browse();
          if (Array.isArray(entries)) {
            const packs = entries.map((e: any) => ({
              name: e.name,
              version: e.version,
              description: e.description || '',
              links: e.links || [],
              versions: e.versions,
              role: e.role || (e.detail as any)?.role || (e.name === 'llvm-wasm' ? 'toolchain' : e.name === 'pyodide' ? 'language-bridge' : 'package'),
              consumer: e.consumer || (e.detail as any)?.consumer || ['octave'],
              deps: e.deps || (e.detail as any)?.deps || [],
              size: e.size || (e.detail as any)?.size || 0,
              form: e.detail?.form || 'pkg',
              content: e.detail?.content || [],
              arch: e.detail?.arch,
              status: {
                compatible: e.compatible,
                fromSource: e.fromSource,
                installed: e.installed,
                state: e.state,
                why: e.why,
              },
            }));
            cat = { packs: packs as any };
          }
        } catch (err) {
          lastErr = err;
        }
      }

      if (!cat) {
        const error = new Error(`Failed to load forge catalog: ${lastErr?.message || 'Not found'}`);
        (error as any).code = 'CATALOG_UNREADABLE';
        throw error;
      }
    }

    // 4. 此时已获取完整货架 cat，若 OctaveAssets.browse() 可用，深度合流元数据 (mail/030 出口)
    if (typeof window !== 'undefined' && (window as any).OctaveAssets?.browse && cat && Array.isArray(cat.packs)) {
      try {
        const entries = await (window as any).OctaveAssets.browse();
        if (Array.isArray(entries)) {
          const entryMap = new Map<string, any>();
          for (const e of entries) {
            if (e && e.name) entryMap.set(e.name, e);
          }
          for (const p of cat.packs) {
            const e = entryMap.get(p.name);
            if (e) {
              if (e.description !== undefined && e.description !== '') p.description = e.description;
              if (e.links !== undefined && Array.isArray(e.links) && e.links.length > 0) p.links = e.links;
              if (e.versions !== undefined && Array.isArray(e.versions) && e.versions.length > 0) p.versions = e.versions;
              (p as any).status = {
                compatible: e.compatible,
                fromSource: e.fromSource,
                installed: e.installed,
                state: e.state,
                why: e.why,
              };
            }
          }
        }
      } catch (browseErr) {
        console.warn('[BrowserAssetsAdapter] OctaveAssets.browse failed to merge metadata:', browseErr);
      }
    }

    return cat;
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
        state: 'failed',
        cause: 'NOT_INSTALLABLE',
        why: 'NOT_INSTALLABLE',
        message: `${name} 是编译工具链，由下载管理（DownloadStore），不走装载`,
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
      const cause = verdict?.cause || err?.code || err?.message || 'unknown error';
      if (cause === 'not-found' || cause === 'version-not-found') {
        return { state: 'not-found', cause, message: err.message };
      }
      return { state: 'failed', cause, why: err?.code || cause, message: err.message };
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
