// src/modules/engine/types.ts
// 核心 Embed API 契约与引擎状态类型定义

export type SupervisorState =
  | 'unloaded'
  | 'booting'
  | 'idle'
  | 'busy'
  | 'aborting'
  | 'crashed'
  | 'recovering'
  | 'failed';

export type EngineState = SupervisorState;

export type CrashCause = 'trap' | 'oom' | 'hang' | 'user-kill' | 'boot-failed';

export class EngineCrashedError extends Error {
  readonly cause: CrashCause;
  readonly started: boolean;
  readonly epoch: number;
  constructor(info: { cause: CrashCause; started: boolean; epoch: number; message?: string }) {
    super(info.message || `Engine crashed due to ${info.cause} (epoch ${info.epoch}, started: ${info.started})`);
    this.name = 'EngineCrashedError';
    this.cause = info.cause;
    this.started = info.started;
    this.epoch = info.epoch;
  }
}

export interface StateTransitionEvent {
  from: SupervisorState;
  to: SupervisorState;
  epoch: number;
  cause?: CrashCause;
}

export interface WorkspaceVariable {
  name: string;
  class: string;
  size: string | number[];
  bytes: number;
  complex?: boolean;
}

export interface FsEntry {
  name: string;
  dir: boolean;
  size: number | null;
}

export interface EvalResult {
  ok: boolean;
  rc: number;
}

export interface EvalJSONResult<T = any> {
  ok: boolean;
  value?: T;
  error?: string;
  rc?: number;
}

export type EngineLane = 'wasm32-final' | 'master' | 'IllegalPerformance';

export interface BootOptions {
  base?: string;
  mount?: string;
  home?: string;
  id?: string;
  lane?: EngineLane;
}


export type OutputCallback = (text: string) => void;
export type ErrorCallback = (error: string) => void;
export type StateCallback = (state: EngineState) => void;
export type FigureCallback = (element: HTMLCanvasElement | HTMLImageElement | null) => void;

/**
 * 引擎底层端口契约（Seam 接缝接口）
 * 解耦具体的浏览器 window.OctaveEmbed 与纯内存测试适配器 MockEmbedAdapter
 */
export interface OctaveEmbedPort {
  readonly id: string;
  readonly state: 'booting' | 'idle' | 'busy';
  
  eval(code: string): Promise<EvalResult>;
  evalJSON<T = any>(expr: string): Promise<EvalJSONResult<T>>;
  workspace(): Promise<EvalJSONResult<WorkspaceVariable[]> | WorkspaceVariable[]>;
  pwd(): Promise<EvalJSONResult<string> | string>;
  cd(dir: string): Promise<EvalResult>;
  help(name: string): Promise<EvalResult>;
  history(): Promise<EvalResult>;
  interrupt(): boolean;
  terminate?(): void;
  input(text: string): number;

  on: {
    output(cb: OutputCallback): boolean;
    error(cb: ErrorCallback): boolean;
    state(cb: (s: 'booting' | 'idle' | 'busy') => void): boolean;
    figure(cb: FigureCallback): boolean;
  };

  fs: {
    read(path: string): string;
    write(path: string, content: string | Uint8Array): boolean;
    ls(dir: string): FsEntry[];
    rm(path: string): boolean;
    download(path: string): boolean;
  };

  figures: {
    export(): string | null;
  };
}

export interface EngineSessionLike {
  eval(code: string): Promise<EvalResult>;
  onOutput(cb: OutputCallback): () => void;
  onError(cb: ErrorCallback): () => void;
  onWorkspaceUpdate?(cb: (vars: WorkspaceVariable[]) => void): () => void;
  getWorkspace?(): Promise<WorkspaceVariable[]>;
  fsLs?(dir?: string): FsEntry[];
  cd?(dir: string): Promise<EvalResult>;
  pwd?(): Promise<string>;
  fsRead?(path: string): string;
  fsWrite?(path: string, content: string | Uint8Array): boolean;
  fsRm?(path: string): boolean;
}

