// src/modules/engine/types.ts
// 核心 Embed API 契约与引擎状态类型定义

export type EngineState = 'unloaded' | 'booting' | 'idle' | 'busy' | 'error';

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

export interface BootOptions {
  base?: string;
  mount?: string;
  home?: string;
  id?: string;
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
  input(text: string): number;

  on: {
    output(cb: OutputCallback): boolean;
    error(cb: ErrorCallback): boolean;
    state(cb: (s: 'booting' | 'idle' | 'busy') => void): boolean;
    figure(cb: FigureCallback): boolean;
  };

  fs: {
    read(path: string): string;
    write(path: string, content: string): boolean;
    ls(dir: string): FsEntry[];
    rm(path: string): boolean;
    download(path: string): boolean;
  };

  figures: {
    export(): string | null;
  };
}
