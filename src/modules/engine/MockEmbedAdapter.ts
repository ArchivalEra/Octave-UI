// src/modules/engine/MockEmbedAdapter.ts
// 纯内存测试适配器：用于在 Node/Vitest 环境下完全脱离 40MB Wasm 运行验证
import type {
  OctaveEmbedPort,
  WorkspaceVariable,
  FsEntry,
  EvalResult,
  EvalJSONResult,
  OutputCallback,
  ErrorCallback,
  FigureCallback,
} from './types';

export class MockEmbedAdapter implements OctaveEmbedPort {
  readonly id: string;
  private _state: 'booting' | 'idle' | 'busy' = 'idle';
  private _vars: Map<string, WorkspaceVariable> = new Map();
  private _files: Map<string, string> = new Map();
  private _currentDir = '/home/web_user';
  private _interrupted = false;

  private _subs = {
    output: [] as OutputCallback[],
    error: [] as ErrorCallback[],
    state: [] as ((s: 'booting' | 'idle' | 'busy') => void)[],
    figure: [] as FigureCallback[],
  };

  public evalDelayMs = 0;

  constructor(id = 'mock-octave') {
    this.id = id;
    // 初始化默认虚拟文件与工作区
    this._files.set('/home/web_user/welcome.m', "disp('Welcome to Octave UI');");
    this._files.set('/tmp/.demo.txt', 'hello mock fs');
    this._vars.set('ans', { name: 'ans', class: 'double', size: '1x1', bytes: 8 });
  }

  get state(): 'booting' | 'idle' | 'busy' {
    return this._state;
  }

  private _setState(s: 'booting' | 'idle' | 'busy') {
    if (this._state === s) return;
    this._state = s;
    for (const cb of this._subs.state) {
      cb(s);
    }
  }

  private _emitOutput(text: string) {
    for (const cb of this._subs.output) {
      cb(text);
    }
  }

  private _emitError(err: string) {
    for (const cb of this._subs.error) {
      cb(err);
    }
  }

  public emitError(err: any) {
    this._emitError(err);
  }

  on = {
    output: (cb: OutputCallback): boolean => {
      this._subs.output.push(cb);
      return true;
    },
    error: (cb: ErrorCallback): boolean => {
      this._subs.error.push(cb);
      return true;
    },
    state: (cb: (s: 'booting' | 'idle' | 'busy') => void): boolean => {
      this._subs.state.push(cb);
      return true;
    },
    figure: (cb: FigureCallback): boolean => {
      this._subs.figure.push(cb);
      return true;
    },
  };

  async eval(code: string): Promise<EvalResult> {
    this._setState('busy');
    this._interrupted = false;
    if (this.evalDelayMs > 0) {
      await new Promise(r => setTimeout(r, this.evalDelayMs));
    }

    if (this._interrupted) {
      this._setState('idle');
      this._emitOutput('\n[MockOctave] Execution interrupted by user.\n');
      return { ok: false, rc: 130 };
    }

    const trimmed = code.trim();
    if (trimmed.startsWith('error(')) {
      this._setState('idle');
      const msg = trimmed.replace(/^error\(['"]?/, '').replace(/['"]?\);?$/, '');
      this._emitError(msg);
      this._emitOutput(`error: ${msg}\n`);
      return { ok: false, rc: 1 };
    }

    if (trimmed.startsWith('disp(')) {
      const content = trimmed.replace(/^disp\(['"]?/, '').replace(/['"]?\);?$/, '');
      this._emitOutput(`${content}\n`);
    } else if (trimmed.includes('magic(4)')) {
      this._vars.set('inv_w', { name: 'inv_w', class: 'double', size: '4x4', bytes: 128 });
      this._emitOutput('   16    2    3   13\n    5   11   10    8\n    9    7    6   12\n    4   14   15    1\n');
    } else if (trimmed.startsWith('help')) {
      const target = trimmed.replace(/^help\s*['"]?/, '').replace(/['"]?;?$/, '');
      this._emitOutput(`-- Function File: ${target}\n   Simulated help text for ${target}.\n`);
    } else if (trimmed === 'history;' || trimmed === 'history') {
      this._emitOutput('  1  a = 1;\n  2  b = 2;\n');
    } else if (trimmed.startsWith('clear')) {
      this._vars.clear();
      this._setState('idle');
      return { ok: true, rc: 0 };
    } else {
      const assignMatch = /^([a-zA-Z_][a-zA-Z0-9_]*)\s*=/m.exec(trimmed);
      if (assignMatch) {
        const varName = assignMatch[1];
        this._vars.set(varName, { name: varName, class: 'double', size: '1x1', bytes: 8 });
        this._emitOutput(`${varName} =\n   42\n`);
      } else {
        this._emitOutput(`ans =\n   42\n`);
        this._vars.set('ans', { name: 'ans', class: 'double', size: '1x1', bytes: 8 });
      }
    }

    this._setState('idle');
    return { ok: true, rc: 0 };
  }

  async evalJSON<T = any>(expr: string): Promise<EvalJSONResult<T>> {
    this._setState('busy');
    if (this.evalDelayMs > 0) {
      await new Promise(r => setTimeout(r, this.evalDelayMs));
    }
    this._setState('idle');

    if (expr === '__no_such_var_xyz__') {
      const err = "error: '__no_such_var_xyz__' undefined";
      this._emitError(err);
      return { ok: false, error: err, rc: 1 };
    }

    if (expr === 'whos()') {
      return { ok: true, value: Array.from(this._vars.values()) as unknown as T, rc: 0 };
    }

    if (expr === 'pwd()') {
      return { ok: true, value: this._currentDir as unknown as T, rc: 0 };
    }

    if (expr.includes('magic(4)')) {
      return { ok: true, value: 34 as unknown as T, rc: 0 };
    }

    return { ok: true, value: 42 as unknown as T, rc: 0 };
  }

  async workspace(): Promise<EvalJSONResult<WorkspaceVariable[]>> {
    return {
      ok: true,
      value: Array.from(this._vars.values()),
      rc: 0,
    };
  }

  async pwd(): Promise<EvalJSONResult<string>> {
    return {
      ok: true,
      value: this._currentDir,
      rc: 0,
    };
  }

  async cd(dir: string): Promise<EvalResult> {
    this._currentDir = dir;
    return { ok: true, rc: 0 };
  }

  async help(name: string): Promise<EvalResult> {
    return this.eval(`help '${name}';`);
  }

  async history(): Promise<EvalResult> {
    return this.eval('history;');
  }

  public terminated = false;

  interrupt(): boolean {
    this._interrupted = true;
    return true;
  }

  terminate(): void {
    this.terminated = true;
    this._interrupted = true;
    this._setState('idle');
  }

  input(text: string): number {
    this._emitOutput(`${text}\n`);
    return 1;
  }

  fs = {
    read: (path: string): string => {
      const content = this._files.get(path);
      if (content === undefined) {
        throw new Error(`FS.readFile: No such file ${path}`);
      }
      return content;
    },
    write: (path: string, content: string): boolean => {
      this._files.set(path, content);
      return true;
    },
    ls: (dir: string): FsEntry[] => {
      const entries: FsEntry[] = [];
      const normalized = dir.endsWith('/') ? dir : `${dir}/`;
      for (const [path, content] of this._files.entries()) {
        if (path.startsWith(normalized)) {
          const rest = path.slice(normalized.length);
          const slash = rest.indexOf('/');
          if (slash === -1) {
            entries.push({ name: rest, dir: false, size: content.length });
          } else {
            const sub = rest.slice(0, slash);
            if (!entries.some(e => e.name === sub)) {
              entries.push({ name: sub, dir: true, size: null });
            }
          }
        }
      }
      return entries;
    },
    rm: (path: string): boolean => {
      return this._files.delete(path);
    },
    download: (path: string): boolean => {
      return this._files.has(path);
    },
  };

  figures = {
    export: (): string | null => {
      return null;
    },
  };
}
