// src/modules/semantic/SafePlotSinkPolyfill.ts
// 影子绘图管线 Polyfill：拦截 Octave 内部 OpenGL/GL4ES 原生 drawnow 崩溃通道 (E6 GL 边界)，
// 将 plot(x,y) 提取为纯内存结构体，由纯客户端高保真 SVG/Canvas 渲染。

export interface PlotData {
  x: number[];
  y: number[];
  count: number;
}

export class SafePlotSinkPolyfill {
  static readonly PLOT_M_PATH = '/home/web_user/plot.m';
  static readonly DRAWNOW_M_PATH = '/home/web_user/drawnow.m';

  static readonly PLOT_PATHS = [
    '/usr/src/octave/m/plot/draw/plot.m',
    '/plot.m',
    '/home/web_user/plot.m',
  ];

  static readonly DRAWNOW_PATHS = [
    '/usr/src/octave/m/plot/draw/drawnow.m',
    '/drawnow.m',
    '/home/web_user/drawnow.m',
  ];

  static readonly HELPER_PATHS = [
    '/usr/src/octave/m/plot/draw/__get_plot_data__.m',
    '/__get_plot_data__.m',
    '/home/web_user/__get_plot_data__.m',
  ];

  static readonly PLOT_SCRIPT = `% In-Engine Safe Shadow Plot Sink
function h = plot (varargin)
  x = [];
  y = [];
  if nargin == 1
    val = varargin{1};
    if isnumeric(val)
      y = double(val(:)');
      x = 1:length(y);
    endif
  elseif nargin >= 2
    v1 = varargin{1};
    v2 = varargin{2};
    if isnumeric(v1) && isnumeric(v2)
      x = double(v1(:)');
      y = double(v2(:)');
    endif
  endif
  s = struct('x', x, 'y', y, 'count', length(x));
  assignin('base', '__octave_web_plot__', s);
  printf("[OCTAVE_WEB_PLOT: %d points captured]\\n", length(x));
  h = 1;
endfunction
`;

  static readonly DRAWNOW_SCRIPT = `% Safe Drawnow Stub
function drawnow (varargin)
  % No-op safe stub preventing OpenGL flush
endfunction
`;

  static readonly HELPER_SCRIPT = `% Safe Helper for extracting plot data without scoping errors
function s = __get_plot_data__ ()
  try
    s = evalin('base', '__octave_web_plot__');
  catch
    s = struct('count', 0);
  end
endfunction
`;

  private static _installed = false;

  static isInstalled(): boolean {
    return this._installed;
  }

  static install(supervisor: { fsWrite(path: string, content: string): boolean }): boolean {
    try {
      let anyOk = false;
      for (const p of this.PLOT_PATHS) {
        if (supervisor.fsWrite(p, this.PLOT_SCRIPT)) anyOk = true;
      }
      for (const p of this.DRAWNOW_PATHS) {
        if (supervisor.fsWrite(p, this.DRAWNOW_SCRIPT)) anyOk = true;
      }
      for (const p of this.HELPER_PATHS) {
        if (supervisor.fsWrite(p, this.HELPER_SCRIPT)) anyOk = true;
      }
      this._installed = anyOk;
      return this._installed;
    } catch {
      this._installed = false;
      return false;
    }
  }

  static async extractPlotData(supervisor: {
    evalJSON<T = any>(expr: string): Promise<{ ok: boolean; value?: T; error?: string }>;
  }): Promise<PlotData | null> {
    try {
      const res = await supervisor.evalJSON<any>('__get_plot_data__()');
      if (res.ok && res.value && typeof res.value === 'object') {
        const val = res.value;
        const xRaw = val.x;
        const yRaw = val.y;
        if (Array.isArray(xRaw) && Array.isArray(yRaw) && xRaw.length > 0 && yRaw.length > 0) {
          const x = xRaw.map(Number).filter((n) => !isNaN(n));
          const y = yRaw.map(Number).filter((n) => !isNaN(n));
          return {
            x,
            y,
            count: Math.min(x.length, y.length),
          };
        }
      }
    } catch {}
    return null;
  }
}

