// src/modules/figure/GraphicsSink.ts
// 输出侧渲染接收模块：挂载宿主 Canvas，隔离 GPU 异常生命周期，局部降级不反噬计算引擎
export interface DeviceLostInfo {
  reason?: string;
  message: string;
}

export type DeviceLostCallback = (info: DeviceLostInfo) => void;
export type SinkErrorCallback = (error: Error) => void;

// 图表事件载荷：imageDataUrl 为渲染就绪的图片地址（当前为 Blob URL），
// bytes/count 为可选的体积与序号透传字段
export interface FigureEvent {
  imageDataUrl: string;
  bytes?: number;
  count?: number;
}

export type FigureEventCallback = (fig: FigureEvent) => void;

// 转发源的最小接口：只依赖 subscribe，不绑死具体插件类型
export interface FigureSource {
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

export class GraphicsSink {
  private _canvas: HTMLCanvasElement | null = null;
  private _device: any = null; // GPUDevice
  private _isDegraded = false;
  private _deviceLostListeners: Set<DeviceLostCallback> = new Set();
  private _errorListeners: Set<SinkErrorCallback> = new Set();
  private _figureListeners: Set<FigureEventCallback> = new Set();

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
  emitFigure(fig: FigureEvent): void {
    for (const cb of this._figureListeners) {
      try {
        cb(fig);
      } catch {}
    }
  }
}
