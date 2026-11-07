// src/modules/plugins/package/BrowserAssetsAdapter.ts
// 浏览器真实环境适配器：IAssetsPort 的 prod adapter。
// spec §2.3：forge-catalog 只有一个读者（window.OctaveAssets.catalog()）。
// 本适配器**不自己拼 URL、不直 fetch、不合成目录、不覆盖 versions**。

import type { IAssetsPort, InstallOptions } from './AssetsPort';
import type { ForgeCatalog, PackageStatusResult, InstallResult } from './types';
import { semanticRoles, bindCompatCatalog } from '../../contract/projection';

export class BrowserAssetsAdapter implements IAssetsPort {
  /** 零参构造：不再有 `base?: string`（那是「调用方自带 base」的最后一个入口）。 */
  constructor() {}

  async fetchCatalog(): Promise<ForgeCatalog> {
    if (typeof window === 'undefined' || !(window as any).OctaveAssets?.catalog) {
      const e = new Error('CATALOG_UNREADABLE: window.OctaveAssets is not available') as Error & { code: string };
      e.code = 'CATALOG_UNREADABLE';
      throw e;
    }
    // 唯一读者。失败即响亮上抛（CONTEXT.md 降级信号）：
    // 不再 console.warn 后静默落到直 fetch / browse() 合成目录 —— 那会把
    // 「读不到」洗成 total>0 的假绿（11-06 code-review Standards 轴点名的那条）。
    const cat = await (window as any).OctaveAssets.catalog();
    // 旧兼容层：从同一份装配态目录投影语义（工具链身份），零手写名字。
    bindCompatCatalog(cat);
    if (!cat || !Array.isArray(cat.packs)) {
      const e = new Error('CATALOG_UNREADABLE: catalog() returned no packs') as Error & { code: string };
      e.code = 'CATALOG_UNREADABLE';
      throw e;
    }

    // 只补运行时安装态 `status`：实测 forge-catalog.json 17 包顶层已带
    // description / links / url / sha256 / size，13 个 versions[] 也带三键，
    // 故不再合流/覆盖任何市场契约字段（D6）。browse() 失败不影响目录本身。
    if (typeof (window as any).OctaveAssets.browse === 'function') {
      try {
        const entries = await (window as any).OctaveAssets.browse();
        if (Array.isArray(entries)) {
          const byName = new Map<string, any>();
          for (const e of entries) if (e && e.name) byName.set(e.name, e);
          for (const p of cat.packs) {
            const e = byName.get(p.name);
            if (e) (p as any).status = {
              compatible: e.compatible,
              fromSource: e.fromSource,
              installed: e.installed,
              state: e.state,
              why: e.why,
            };
          }
        }
      } catch (err) {
        // 状态元数据是可选的，不构成目录不可用；但不静默 —— 打一条 warn。
        console.warn('[BrowserAssetsAdapter] browse() failed; catalog itself is intact', err);
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
    // 工具链身份由契约 role 投影，零手写名字 / includes。
    const sem = semanticRoles();
    if (sem.toolchainName && name === sem.toolchainName) {
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
