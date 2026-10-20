// src/modules/plugins/package/types.ts
// Forge 包与扩展管理数据模型与接口规范（对齐 mail/001, mail/003, mail/004 内容契约）

export type ContentKind = 'm' | 'src' | 'oct';
export type DeliveryForm = 'pkg' | 'tree' | 'oct' | 'octdir' | 'file' | 'js';
export type ConsumerEngine = 'octave' | 'omc';
export type VersionStage = 'staged' | 'withheld';

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
  content: ContentKind[];
  consumer?: ConsumerEngine | ConsumerEngine[];
  deps?: string[];
  size?: number;
  url?: string;
  upstream_url?: string;
  description?: string;
  links?: Record<string, string> | PackageLinkItem[];
  versions?: PackageVersionCandidate[];
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
  message?: string;
  installed?: string[];
  cause?: string;
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
  consumer?: 'all' | 'octave' | 'omc';
  form?: 'all' | 'pkg' | 'tree';
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

