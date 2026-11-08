// src/modules/plugins/package/types.ts
// Forge 包与扩展管理数据模型与接口规范（对齐 mail/001, mail/003, mail/004 内容契约）

// ★ 2026-11-07 零手写选项：值域不再由 TS 联合闭集声明。
// 轴名/取值唯一产地 = src/modules/contract/projection.ts 的 OPTION_AXES + facets。
// 旧名字保留为 string 别名（26 套件 / .m 裸名逐字兼容），但值来自契约投影，
// 新增形态/stage/consumer 不再需要改这里（mail/read/004 §6「加轴走 optional_keys」）。
export type ContentKind = string;
export type DeliveryForm = string;
export type ConsumerEngine = string;
export type VersionStage = string;

export interface PackageVersionCandidate {
  version: string;
  stage: VersionStage;
  withheld_cause?: string;
  form?: DeliveryForm;
  content?: ContentKind[];
  arch?: string;
  requires?: string;
  size?: number;
  sha256?: string;
  url?: string;
  upstream_url?: string;
}

export interface PackageLinkItem {
  label: string;
  url: string;
  icon?: string;
}

export interface ForgePackageItem {
  name: string;
  version: string;
  form: DeliveryForm;
  content?: ContentKind[];
  consumer?: ConsumerEngine | ConsumerEngine[];
  deps?: string[];
  size?: number;
  url?: string;
  upstream_url?: string;
  description?: string;
  links?: Record<string, string> | PackageLinkItem[];
  versions?: PackageVersionCandidate[];
  // ★ 契约实测存在的字段（原类型缺 ⇒ 全代码 as any）。逐字透传，不解析。
  sha256?: string;
  role?: string;
  kinds?: string[];
  arch?: string;
  artifacts?: unknown;
  note?: string;
  license?: string;
  [key: string]: unknown;
}

export interface ForgeCatalog {
  schema?: number;
  octave?: string;
  packs: ForgePackageItem[];
}

export interface PackageStatusResult {
  compatible: boolean;
  fromSource: boolean;
  installed: boolean;
  detail?: {
    arch?: string | null;
    hostArch?: string | null;
    content?: string[];
    form?: string | null;
    acceleration?: string;
    why?: string;
  };
}

export type InstallVerdictState = 'ok' | 'failed' | 'not-found' | 'cannot-know';

export interface InstallResult {
  state: InstallVerdictState;
  name?: string;
  message?: string;
  installed?: string[];
  cause?: string;
  why?: string;
}

export interface InstallPlan {
  name: string;
  version?: string;
  bytes: number;
  layers: string[];
  extraSize: number;
}

export interface PackageFilter {
  query?: string;
  /** 值来自 facets（轴 consumer / form），零手写闭集。 */
  consumer?: string;
  form?: string;
  installedOnly?: boolean;
}

export type CompileState = 'compiled' | 'm-only' | 'failed';

export interface CompileResult {
  state: CompileState;
  name: string;
  octPath?: string;
  bytes?: number;
  symbolGap?: any;
  diagnostics: string[];
  why?: string;
}

export type DiagnosticCallback = (text: string) => void;

export interface CompileOptions {
  onProgress?: (received: number, total: number | null) => void;
  onDiagnostic?: DiagnosticCallback;
}

