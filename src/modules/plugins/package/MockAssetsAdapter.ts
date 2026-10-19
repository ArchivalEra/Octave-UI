// src/modules/plugins/package/MockAssetsAdapter.ts
// 纯内存测试适配器：支持在单元测试中任意注入合成目录、模拟引擎状态与验证断言

import type { IAssetsPort, InstallOptions } from './AssetsPort';
import type { ForgeCatalog, PackageStatusResult, InstallResult } from './types';

export class MockAssetsAdapter implements IAssetsPort {
  private catalog: ForgeCatalog = { packs: [] };
  private statuses = new Map<string, PackageStatusResult>();
  private installPlanResults = new Map<string, { bytes: number; layers: string[] }>();
  private installResults = new Map<string, InstallResult>();
  private ready = true;
  private hostArch = 'wasm64';
  public installCalls: { name: string; options?: InstallOptions }[] = [];

  constructor(initialCatalog?: ForgeCatalog) {
    if (initialCatalog) {
      this.catalog = initialCatalog;
    }
  }

  setCatalog(cat: ForgeCatalog): void {
    this.catalog = cat;
  }

  setStatus(name: string, status: Partial<PackageStatusResult>): void {
    this.statuses.set(name, {
      compatible: status.compatible ?? true,
      fromSource: status.fromSource ?? false,
      installed: status.installed ?? false,
      detail: status.detail,
    });
  }

  setInstallPlan(name: string, plan: { bytes: number; layers: string[] }): void {
    this.installPlanResults.set(name, plan);
  }

  setInstallResult(name: string, result: InstallResult): void {
    this.installResults.set(name, result);
  }

  setReady(ready: boolean): void {
    this.ready = ready;
  }

  setHostArch(arch: string): void {
    this.hostArch = arch;
  }

  async fetchCatalog(): Promise<ForgeCatalog> {
    return JSON.parse(JSON.stringify(this.catalog));
  }

  getStatusOf(name: string): PackageStatusResult {
    return this.statuses.get(name) || {
      compatible: true,
      fromSource: false,
      installed: false,
    };
  }

  async install(name: string, options?: InstallOptions): Promise<InstallResult> {
    this.installCalls.push({ name, options });

    if (options?.planOnly) {
      const plan = this.installPlanResults.get(name) || { bytes: 1024, layers: [] };
      return {
        state: 'ok',
        message: 'Plan resolved',
        installed: [],
        cause: JSON.stringify(plan),
      };
    }

    if (this.installResults.has(name)) {
      const custom = this.installResults.get(name)!;
      if (custom.state === 'ok') {
        const cur = this.getStatusOf(name);
        this.setStatus(name, { ...cur, installed: true });
      }
      return custom;
    }

    // Default successful install simulation
    const cur = this.getStatusOf(name);
    this.setStatus(name, { ...cur, installed: true });
    return {
      state: 'ok',
      message: `Successfully installed ${name}`,
      installed: [name],
    };
  }

  isReady(): boolean {
    return this.ready;
  }

  getHostArch(): string {
    return this.hostArch;
  }

  async compileExtension(name: string, options?: any): Promise<any> {
    const diag = [
      `[compile] Resolving source files for ${name}`,
      `[compile] Invoking llvm-wasm toolchain`,
      `[compile] Emitted ${name}.oct`,
    ];
    for (const d of diag) {
      options?.onDiagnostic?.(d);
    }
    return {
      state: 'ok',
      name,
      diagnostics: diag,
    };
  }
}
