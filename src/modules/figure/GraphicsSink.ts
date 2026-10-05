// src/modules/figure/GraphicsSink.ts
// 输出侧渲染接收模块：挂载宿主 Canvas，隔离 GPU 异常生命周期，局部降级不反噬计算引擎
export interface DeviceLostInfo {
  reason?: string;
  message: string;
}

export type DeviceLostCallback = (info: DeviceLostInfo) => void;
export type SinkErrorCallback = (error: Error) => void;

export class GraphicsSink {
  private _canvas: HTMLCanvasElement | null = null;
  private _device: any = null; // GPUDevice
  private _isDegraded = false;
  private _deviceLostListeners: Set<DeviceLostCallback> = new Set();
  private _errorListeners: Set<SinkErrorCallback> = new Set();

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
}
