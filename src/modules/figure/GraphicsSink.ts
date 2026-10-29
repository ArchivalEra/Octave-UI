// src/modules/figure/GraphicsSink.ts
// 输出侧渲染接收模块：挂载宿主 Canvas，隔离 GPU 异常生命周期，局部降级不反噬计算引擎

// 页面级图表事件总线的**唯一产地**（spec #19 决策 1）。发射方
// （P5FigureOverlayPlugin）与订阅方（下文的总线接线函数）都引用它——
// 任何一侧改名都不会让另一侧静默失聪。
export const FIGURE_BUS_EVENT = 'octave:figure-rendered';

interface DeviceLostInfo {
  reason?: string;
  message: string;
}

type DeviceLostCallback = (info: DeviceLostInfo) => void;
type SinkErrorCallback = (error: Error) => void;

// 图表事件载荷：imageDataUrl 为渲染就绪的图片地址（当前为 Blob URL），
// bytes/count 为可选的体积与序号透传字段
interface FigureEvent {
  imageDataUrl: string;
  bytes?: number;
  count?: number;
}

type FigureEventCallback = (fig: FigureEvent) => void;

// 转发源的最小接口：只依赖 subscribe，不绑死具体插件类型
interface FigureSource {
  subscribe(listener: (event: { url: string; bytes?: number; count?: number }) => void): () => void;
}

/**
 * 单一出口的转发接线：把图表事件源（P5 插件）的 {url,...} 事件转成 sink 的
 * {imageDataUrl,...} 图表事件。返回解绑函数；测试直接测这条管道。
 */
export function wireFigureSource(source: FigureSource, sink: GraphicsSink): () => void {
  return source.subscribe((evt) => {
    sink.emitFigure({ imageDataUrl: evt.url, bytes: evt.bytes, count: evt.count });
  });
}

/**
 * 把页面级图表事件总线接到 sink（spec #19 决策 1）。
 * 与 wireFigureSource 的区别：总线不绑某个插件实例——模块被求值出两个实例时
 * 也不会失聪（任何实例捕获到图都往总线发），sink 只订阅总线这一个出口。
 */
export function wireFigureBusToSink(sink: GraphicsSink): () => void {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
    return () => {};
  }
  const handler = (e: Event) => {
    const detail = (e as CustomEvent).detail as
      | { url?: string; bytes?: number; count?: number }
      | undefined;
    if (!detail) return;
    sink.emitFigure({ imageDataUrl: detail.url || '', bytes: detail.bytes, count: detail.count });
  };
  window.addEventListener(FIGURE_BUS_EVENT, handler);
  return () => window.removeEventListener(FIGURE_BUS_EVENT, handler);
}

export class GraphicsSink {
  private _canvas: HTMLCanvasElement | null = null;
  private _device: any = null; // GPUDevice
  private _isDegraded = false;
  private _deviceLostListeners: Set<DeviceLostCallback> = new Set();
  private _errorListeners: Set<SinkErrorCallback> = new Set();
  private _figureListeners: Set<FigureEventCallback> = new Set();
  private _lastFigure: FigureEvent | null = null;

  get isMounted(): boolean {
    return this._canvas !== null;
  }

  get isDegraded(): boolean {
    return this._isDegraded;
  }

  get isReady(): boolean {
    return this.isMounted && !this._isDegraded && this._device !== null;
  }

  get canvas(): HTMLCanvasElement | null {
    return this._canvas;
  }

  mount(canvas: HTMLCanvasElement) {
    this._canvas = canvas;
  }

  unmount() {
    this._canvas = null;
  }

  async initDevice(device?: any): Promise<boolean> {
    try {
      if (device) {
        this._device = device;
      } else if (typeof navigator !== 'undefined' && (navigator as any).gpu) {
        const adapter = await (navigator as any).gpu.requestAdapter();
        if (adapter) {
          this._device = await adapter.requestDevice();
        }
      }

      if (this._device && this._device.lost) {
        this._device.lost
          .then((info: any) => {
            this._handleDeviceLost(info?.reason || 'unknown', info?.message || 'GPUDevice was lost');
          })
          .catch(() => {});
      }

      this._isDegraded = false;
      return true;
    } catch (err: any) {
      this._handleError(err instanceof Error ? err : new Error(String(err)));
      return false;
    }
  }

  private _handleDeviceLost(reason: string, message: string) {
    this._isDegraded = true;
    this._device = null;
    const info: DeviceLostInfo = { reason, message };
    for (const cb of this._deviceLostListeners) {
      try {
        cb(info);
      } catch {}
    }
  }

  private _handleError(err: Error) {
    this._isDegraded = true;
    for (const cb of this._errorListeners) {
      try {
        cb(err);
      } catch {}
    }
  }

  async renderFrame(data: any): Promise<boolean> {
    if (this._isDegraded) {
      return false;
    }
    if (!this._canvas) {
      return false;
    }
    try {
      if (typeof ImageData !== 'undefined' && data instanceof ImageData) {
        const ctx2d = this._canvas.getContext('2d');
        if (ctx2d) {
          ctx2d.putImageData(data, 0, 0);
          return true;
        }
      }
      return true;
    } catch (err: any) {
      this._handleError(err instanceof Error ? err : new Error(String(err)));
      return false;
    }
  }

  onDeviceLost(cb: DeviceLostCallback): () => void {
    this._deviceLostListeners.add(cb);
    return () => this._deviceLostListeners.delete(cb);
  }

  onError(cb: SinkErrorCallback): () => void {
    this._errorListeners.add(cb);
    return () => this._errorListeners.delete(cb);
  }

  onFigure(cb: FigureEventCallback): () => void {
    this._figureListeners.add(cb);
    return () => this._figureListeners.delete(cb);
  }

  // 通知全部图表监听；单个回调抛错不炸整次分发（与 deviceLost/error 同款纪律）
  //
  // 空图源守卫（spec #19 决策 4）：imageDataUrl 为空时不通知，也不覆盖 _lastFigure。
  // 为什么：钩子取 URL 时 img 可能还没挂进 DOM，会拿到空串（056 复钓红线 1 的实测根因之一）。
  // 把空串交给面板会让它静默不更新，看起来像「事件没到」——宁可保持上一张图，也不发半坏事件。
  emitFigure(fig: FigureEvent): void {
    const url = (fig?.imageDataUrl || '').trim();
    if (!url) return;
    const normalized: FigureEvent = { ...fig, imageDataUrl: url };
    this._lastFigure = normalized;
    for (const cb of this._figureListeners) {
      try {
        cb(normalized);
      } catch {}
    }
  }

  /**
   * 最近一张图（面板 mount 晚于首次事件时的回放源，spec #19 决策 5 的兜底）。
   * 这是**兜底**不是主修：主修是事件真的发出来；这里只解决「订阅晚于事件」的窗口。
   */
  get lastFigure(): FigureEvent | null {
    return this._lastFigure;
  }
}
