// tests/figure/GraphicsSink.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GraphicsSink, wireFigureSource } from '../../src/modules/figure/GraphicsSink';
import { P5FigureOverlayPlugin } from '../../src/modules/plugins/figure/P5FigureOverlayPlugin';

describe('GraphicsSink Output Module', () => {
  let sink: GraphicsSink;

  beforeEach(() => {
    sink = new GraphicsSink();
  });

  it('manages canvas mounting and unmounting correctly', () => {
    expect(sink.isMounted).toBe(false);
    expect(sink.isReady).toBe(false);

    const mockCanvas = {} as HTMLCanvasElement;
    sink.mount(mockCanvas);
    expect(sink.isMounted).toBe(true);
    expect(sink.canvas).toBe(mockCanvas);

    sink.unmount();
    expect(sink.isMounted).toBe(false);
    expect(sink.canvas).toBeNull();
  });

  it('handles GPUDevice loss gracefully and degrades locally without crashing', async () => {
    let lostResolver: (info: any) => void = () => {};
    const lostPromise = new Promise((resolve) => {
      lostResolver = resolve;
    });

    const mockDevice = {
      lost: lostPromise,
    };

    const mockCanvas = {} as HTMLCanvasElement;
    sink.mount(mockCanvas);

    await sink.initDevice(mockDevice);
    expect(sink.isReady).toBe(true);
    expect(sink.isDegraded).toBe(false);

    const lostSpy = vi.fn();
    sink.onDeviceLost(lostSpy);

    // 触发 GPU device lost
    lostResolver({ reason: 'destroyed', message: 'GPU device reset' });
    await new Promise((r) => setTimeout(r, 10));

    expect(sink.isDegraded).toBe(true);
    expect(sink.isReady).toBe(false);
    expect(lostSpy).toHaveBeenCalledWith({
      reason: 'destroyed',
      message: 'GPU device reset',
    });

    // 降级状态下帧渲染安全返回 false，不抛出异常
    const renderRes = await sink.renderFrame({});
    expect(renderRes).toBe(false);
  });
});

describe('GraphicsSink onFigure event surface', () => {
  let sink: GraphicsSink;

  beforeEach(() => {
    sink = new GraphicsSink();
  });

  it('delivers one emit to all subscribers and stops delivering after unsubscribe', () => {
    const cbA = vi.fn();
    const cbB = vi.fn();
    const unsubA = sink.onFigure(cbA);
    sink.onFigure(cbB);

    sink.emitFigure({ imageDataUrl: 'blob:http://localhost/a', bytes: 10, count: 1 });
    expect(cbA).toHaveBeenCalledTimes(1);
    expect(cbB).toHaveBeenCalledTimes(1);
    expect(cbA).toHaveBeenCalledWith({ imageDataUrl: 'blob:http://localhost/a', bytes: 10, count: 1 });
    expect(cbB).toHaveBeenCalledWith({ imageDataUrl: 'blob:http://localhost/a', bytes: 10, count: 1 });

    unsubA();
    sink.emitFigure({ imageDataUrl: 'blob:http://localhost/b', count: 2 });
    expect(cbA).toHaveBeenCalledTimes(1); // 退订后不再响
    expect(cbB).toHaveBeenCalledTimes(2); // 仍在订阅的照常响
  });

  it('keeps emitting to remaining callbacks when one callback throws', () => {
    const good = vi.fn();
    sink.onFigure(() => {
      throw new Error('listener boom');
    });
    sink.onFigure(good);

    expect(() => sink.emitFigure({ imageDataUrl: 'blob:x' })).not.toThrow();
    expect(good).toHaveBeenCalledTimes(1);
  });

  it('unsubscribing twice is safe (delete is idempotent)', () => {
    const cb = vi.fn();
    const unsub = sink.onFigure(cb);
    unsub();
    unsub(); // 二次解绑不炸
    sink.emitFigure({ imageDataUrl: 'blob:x' });
    expect(cb).not.toHaveBeenCalled();
  });

  it('with zero events, an existing listener never fires (empty state stays quiet)', () => {
    const cb = vi.fn();
    sink.onFigure(cb);
    // 零事件：不 emit，监听器不响（面板空态不炸的 sink 层等价断言）
    expect(cb).not.toHaveBeenCalled();
  });
});

describe('wireFigureSource (appContext 转发管道)', () => {
  it('forwards source {url,...} events as sink {imageDataUrl,...} figure events', () => {
    const sink = new GraphicsSink();
    const received: Array<{ imageDataUrl: string; bytes?: number; count?: number }> = [];
    sink.onFigure((fig) => received.push(fig));

    // mock 事件源：形状对齐 P5 插件的 subscribe
    const listeners = new Set<(e: { url: string; bytes?: number; count?: number }) => void>();
    const source = {
      subscribe: (l: (e: { url: string; bytes?: number; count?: number }) => void) => {
        listeners.add(l);
        return () => listeners.delete(l);
      },
    };

    const unwire = wireFigureSource(source, sink);
    const emit = (e: { url: string; bytes?: number; count?: number }) => {
      for (const l of listeners) l(e);
    };

    emit({ url: 'blob:http://localhost/fig-1', bytes: 100, count: 1 });
    emit({ url: 'blob:http://localhost/fig-2', count: 2 });

    expect(received).toEqual([
      { imageDataUrl: 'blob:http://localhost/fig-1', bytes: 100, count: 1 },
      { imageDataUrl: 'blob:http://localhost/fig-2', bytes: undefined, count: 2 },
    ]);
    // 面板消费形状：fig.imageDataUrl 必须存在
    expect(typeof received[0].imageDataUrl).toBe('string');

    unwire();
    emit({ url: 'blob:http://localhost/fig-3' });
    expect(received).toHaveLength(2); // 解绑后不再转发
  });

  it('pipes a real P5FigureOverlayPlugin into a real GraphicsSink', () => {
    const plugin = new P5FigureOverlayPlugin();
    const sink = new GraphicsSink();
    const got: Array<{ imageDataUrl: string; count?: number }> = [];
    sink.onFigure((fig) => got.push({ imageDataUrl: fig.imageDataUrl, count: fig.count }));

    const unwire = wireFigureSource(plugin, sink);

    plugin.captureFigure({
      path: '/tmp/p5_1.png',
      bytes: 111,
      type: 'image/png',
      url: 'blob:http://localhost/pipe-1',
      count: 1,
      timestamp: Date.now(),
    });

    expect(got).toEqual([{ imageDataUrl: 'blob:http://localhost/pipe-1', count: 1 }]);

    unwire();
    plugin.destroy();
  });
});
