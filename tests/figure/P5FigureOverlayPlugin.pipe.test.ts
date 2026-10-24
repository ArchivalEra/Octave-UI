// tests/figure/P5FigureOverlayPlugin.pipe.test.ts
// P5 插件 → GraphicsSink 转发管道与 Blob URL revoke 生命周期测试
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { P5FigureOverlayPlugin } from '../../src/modules/plugins/figure/P5FigureOverlayPlugin';
import { GraphicsSink, wireFigureSource } from '../../src/modules/figure/GraphicsSink';

// happy-dom 的 URL.createObjectURL/revokeObjectURL 可能缺失：测试需要就 stub
const realRevoke = (globalThis.URL && (globalThis.URL as any).revokeObjectURL) || undefined;

function makeEvent(url: string, count: number) {
  return {
    path: `/tmp/p5_${count}.png`,
    bytes: 1000 * count,
    type: 'image/png',
    url,
    count,
    timestamp: Date.now(),
  };
}

describe('P5FigureOverlayPlugin → GraphicsSink 管道', () => {
  let plugin: P5FigureOverlayPlugin;
  let sink: GraphicsSink;

  beforeEach(() => {
    plugin = new P5FigureOverlayPlugin();
    sink = new GraphicsSink();
    // 每例提供可 spy 的 revokeObjectURL；缺 createObjectURL 不影响本文件
    (globalThis.URL as any).revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    plugin.destroy();
    if (realRevoke) {
      (globalThis.URL as any).revokeObjectURL = realRevoke;
    } else {
      delete (globalThis.URL as any).revokeObjectURL;
    }
  });

  it('mock 插件事件经 wireFigureSource 转发，sink 回调收到 {imageDataUrl}', () => {
    const got: Array<{ imageDataUrl: string; bytes?: number; count?: number }> = [];
    sink.onFigure((fig) => got.push(fig));

    const unwire = wireFigureSource(plugin, sink);

    plugin.captureFigure(makeEvent('blob:http://localhost/w-1', 1));
    plugin.captureFigure(makeEvent('blob:http://localhost/w-2', 2));

    expect(got).toEqual([
      { imageDataUrl: 'blob:http://localhost/w-1', bytes: 1000, count: 1 },
      { imageDataUrl: 'blob:http://localhost/w-2', bytes: 2000, count: 2 },
    ]);

    unwire();
    plugin.captureFigure(makeEvent('blob:http://localhost/w-3', 3));
    expect(got).toHaveLength(2); // 解绑后不再转发
  });

  it('sink 侧回调抛错不阻断插件侧分发（两端各自 try/catch 纪律）', () => {
    const good = vi.fn();
    sink.onFigure(() => {
      throw new Error('sink listener boom');
    });
    sink.onFigure(good);
    const pluginListener = vi.fn();
    plugin.subscribe(pluginListener);

    wireFigureSource(plugin, sink);

    expect(() => plugin.captureFigure(makeEvent('blob:x', 1))).not.toThrow();
    expect(good).toHaveBeenCalledTimes(1);
    expect(pluginListener).toHaveBeenCalledTimes(1); // 插件自己的监听不受下游炸裂影响
  });

  it('零事件时已订阅的 sink 监听不响（面板空态不炸的 sink 层断言）', () => {
    const cb = vi.fn();
    sink.onFigure(cb);
    wireFigureSource(plugin, sink);
    expect(cb).not.toHaveBeenCalled();
    expect(plugin.lastFigure).toBeNull();
  });
});

describe('P5FigureOverlayPlugin Blob URL revoke 生命周期', () => {
  let plugin: P5FigureOverlayPlugin;
  let revokeSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    plugin = new P5FigureOverlayPlugin();
    revokeSpy = vi.fn();
    (globalThis.URL as any).revokeObjectURL = revokeSpy;
  });

  afterEach(() => {
    plugin.destroy();
    if (realRevoke) {
      (globalThis.URL as any).revokeObjectURL = realRevoke;
    } else {
      delete (globalThis.URL as any).revokeObjectURL;
    }
  });

  it('两次事件不同 url ⇒ 第一次的 url 被 revoke，第二次的未被 revoke', () => {
    plugin.captureFigure(makeEvent('blob:http://localhost/r-1', 1));
    expect(revokeSpy).not.toHaveBeenCalled(); // 首张：无旧 url 可 revoke

    plugin.captureFigure(makeEvent('blob:http://localhost/r-2', 2));
    expect(revokeSpy).toHaveBeenCalledTimes(1);
    expect(revokeSpy).toHaveBeenCalledWith('blob:http://localhost/r-1');
  });

  it('同 url 重复事件 ⇒ 只 revoke 一次', () => {
    plugin.captureFigure(makeEvent('blob:http://localhost/same', 1));
    plugin.captureFigure(makeEvent('blob:http://localhost/same', 2));
    expect(revokeSpy).not.toHaveBeenCalled(); // 同 url：跳过，不重复 revoke

    plugin.captureFigure(makeEvent('blob:http://localhost/other', 3));
    expect(revokeSpy).toHaveBeenCalledTimes(1);
    expect(revokeSpy).toHaveBeenCalledWith('blob:http://localhost/same');

    plugin.captureFigure(makeEvent('blob:http://localhost/same', 4)); // 回到旧 url（仍非当前）
    expect(revokeSpy).toHaveBeenCalledTimes(2);
    expect(revokeSpy).toHaveBeenLastCalledWith('blob:http://localhost/other');
  });

  it('URL API 不存在时静默跳过（不抛错，事件照常分发）', () => {
    const origURL = globalThis.URL;
    const listener = vi.fn();
    plugin.subscribe(listener);
    // 模拟环境无 URL API：整体摘掉并保证 revokeObjectURL 缺失
    (globalThis as any).URL = undefined;

    expect(() => {
      plugin.captureFigure(makeEvent('blob:http://localhost/nourl-1', 1));
      plugin.captureFigure(makeEvent('blob:http://localhost/nourl-2', 2));
    }).not.toThrow();
    expect(listener).toHaveBeenCalledTimes(2);

    (globalThis as any).URL = origURL;
  });

  it('revokeObjectURL 自身抛错不阻断事件分发', () => {
    (globalThis.URL as any).revokeObjectURL = () => {
      throw new Error('revoke boom');
    };
    const listener = vi.fn();
    plugin.subscribe(listener);

    plugin.captureFigure(makeEvent('blob:http://localhost/e-1', 1));
    expect(() => plugin.captureFigure(makeEvent('blob:http://localhost/e-2', 2))).not.toThrow();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(plugin.lastFigure?.url).toBe('blob:http://localhost/e-2');
  });

  it('destroy/uninstallHook 不 revoke 当前 URL（图还显示着）', () => {
    plugin.captureFigure(makeEvent('blob:http://localhost/keep-1', 1));
    plugin.captureFigure(makeEvent('blob:http://localhost/keep-2', 2));
    expect(revokeSpy).toHaveBeenCalledTimes(1);

    plugin.destroy();
    expect(revokeSpy).toHaveBeenCalledTimes(1); // 卸载不动当前 url
  });
});
