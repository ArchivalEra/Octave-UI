// tests/figure/GraphicsSink.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GraphicsSink } from '../../src/modules/figure/GraphicsSink';

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
