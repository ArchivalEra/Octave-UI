// src/modules/plugins/package/AssetsPort.ts
// 资产加载与引擎交互端口（Seam 契约）：解耦实际 window.OctaveAssets 与测试适配器

import type { ForgeCatalog, PackageStatusResult, InstallResult } from './types';

export interface InstallOptions {
  version?: string;
  planOnly?: boolean;
  onProgress?: (progress: number) => void;
}

export interface IAssetsPort {
  /**
   * 拉取或读取装配态目录 assets/forge-catalog.json
   */
  fetchCatalog(): Promise<ForgeCatalog>;

  /**
   * 委托引擎查询包状态（从 statusOf 拿取真值，不可在 UI 端推测）
   */
  getStatusOf(name: string): PackageStatusResult;

  /**
   * 委托引擎安装或预演执行计划（planOnly）
   */
  install(name: string, options?: InstallOptions): Promise<InstallResult>;

  /**
   * 宿主引擎是否已就绪
   */
  isReady(): boolean;

  /**
   * 获取当前宿主架构（wasm64 或 wasm32）
   */
  getHostArch(): string;
}
