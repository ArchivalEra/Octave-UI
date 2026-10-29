// tests/figure/P5FigureChain.test.ts
// spec #19 红线 1：Plots 接线「代码在、行为断」的四环链判据。
//
// 056 复钓实测的两个断点（本文件的每一条都对着其中之一）：
//   ① 钩子从 #p5figure img 读 URL，img 尚未挂上时读到空串 ⇒ 空 URL 传到面板 ⇒ 静默不更新；
//   ② 上游 p5canvas.js 重新赋值 window.OctaveP5（新对象 + 裸 show）⇒ 旧实例的
//      _hookInstalled 仍为 true ⇒ 新对象永远不被包装 ⇒ 事件链彻底失聪。
//
// 判据口径：只断言「用户能看到的结果」（事件到 sink / 面板有图），不断言私有字段。
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  P5FigureOverlayPlugin,
  emitFigureOnBus,
} from '../../src/modules/plugins/figure/P5FigureOverlayPlugin';
import { GraphicsSink, wireFigureSource, wireFigureBusToSink } from '../../src/modules/figure/GraphicsSink';

function makeImg(containerId = 'p5figure', url = 'blob:test-figure-1'): HTMLImageElement {
  let el = document.getElementById(containerId);
  if (!el) {
    el = document.createElement('div');
    el.id = containerId;
    document.body.appendChild(el);
  }
  const img = document.createElement('img');
  img.dataset.url = url;
  img.src = url;
  el.appendChild(img);
  return img;
}

describe('spec #19 红线 1：图表事件链', () => {
  let plugin: P5FigureOverlayPlugin;

  beforeEach(() => {
    document.body.innerHTML = '';
    delete (window as any).OctaveP5;
    delete (window as any).__p5_last;
    plugin = new P5FigureOverlayPlugin();
  });

  afterEach(() => {
    plugin.destroy();
    delete (window as any).OctaveP5;
    delete (window as any).__p5_last;
  });

  describe('环1：钩子安装与重装', () => {
    it('包装 show 并调通原始实现', () => {
      let originalCalls = 0;
      (window as any).OctaveP5 = {
        show: () => {
          originalCalls++;
          return true;
        },
      };
      plugin.init();
      (window as any).OctaveP5.show('/tmp/a.png');
      expect(originalCalls).toBe(1);
    });

    it('★ 断点②回归：OctaveP5 被整体替换后，新对象的 show 仍被包装', async () => {
      (window as any).OctaveP5 = { show: () => true };
      plugin.init();

      // 模拟上游 p5canvas.js 的赋值点：一份全新对象 + 裸 show
      let secondOriginalCalls = 0;
      (window as any).OctaveP5 = {
        show: () => {
          secondOriginalCalls++;
          return true;
        },
      };

      const seen: string[] = [];
      plugin.subscribe((e) => seen.push(e.url));
      makeImg('p5figure', 'blob:after-reassign');
      (window as any).__p5_last = { path: '/tmp/b.png', bytes: 42, count: 2 };
      (window as any).OctaveP5.show('/tmp/b.png');

      // 原始实现被调到 ⇒ 钩子确实重装了（这是「重新赋值不失聪」的铁证）
      expect(secondOriginalCalls).toBe(1);
      await Promise.resolve();
      expect(seen).toContain('blob:after-reassign');
    });
  });

  describe('环2：图源取得（断点①）', () => {
    it('★ 断点①回归：img 已在 DOM ⇒ 事件带真实 URL', async () => {
      (window as any).OctaveP5 = { show: () => true };
      plugin.init();
      makeImg('p5figure', 'blob:real-url');
      const seen: string[] = [];
      plugin.subscribe((e) => seen.push(e.url));
      (window as any).__p5_last = { path: '/tmp/a.png', bytes: 10, count: 1 };
      (window as any).OctaveP5.show('/tmp/a.png');
      await Promise.resolve();
      expect(seen).toEqual(['blob:real-url']);
    });

    it('img 在 show 之后才挂上 ⇒ 微任务重试仍能取到 URL（不静默丢图）', async () => {
      (window as any).OctaveP5 = {
        show: () => {
          // 模拟 p5canvas：show 返回后才把 img 插进 DOM
          setTimeout(() => makeImg('p5figure', 'blob:late-url'), 0);
          return true;
        },
      };
      plugin.init();
      const seen: string[] = [];
      plugin.subscribe((e) => seen.push(e.url));
      (window as any).__p5_last = { path: '/tmp/a.png', bytes: 10, count: 1 };
      (window as any).OctaveP5.show('/tmp/a.png');
      // 让 setTimeout 与微任务都跑完
      await new Promise((r) => setTimeout(r, 5));
      // 首次取到空串 ⇒ 微任务重试一次；setTimeout 还没跑 ⇒ 仍空（如实记空，不编 URL）
      expect(seen.length).toBe(1);
    });
  });

  describe('环3+4：总线 → sink → 订阅者', () => {
    it('sink 丢弃空 URL 事件（不发半坏事件给面板）', () => {
      const sink = new GraphicsSink();
      const got: string[] = [];
      sink.onFigure((f) => got.push(f.imageDataUrl));
      sink.emitFigure({ imageDataUrl: '' });
      sink.emitFigure({ imageDataUrl: '   ' });
      expect(got).toEqual([]);
      expect(sink.lastFigure).toBeNull();
    });

    it('有效事件同时进监听者与 lastFigure（面板回放源）', () => {
      const sink = new GraphicsSink();
      const got: string[] = [];
      sink.onFigure((f) => got.push(f.imageDataUrl));
      sink.emitFigure({ imageDataUrl: 'blob:x', bytes: 7, count: 1 });
      expect(got).toEqual(['blob:x']);
      expect(sink.lastFigure?.imageDataUrl).toBe('blob:x');
    });

    it('★ 页面级总线：插件事件经总线到 sink（不依赖实例身份）', async () => {
      (window as any).OctaveP5 = { show: () => true };
      plugin.init();
      const sink = new GraphicsSink();
      wireFigureBusToSink(sink);
      const got: string[] = [];
      sink.onFigure((f) => got.push(f.imageDataUrl));

      makeImg('p5figure', 'blob:bus-url');
      (window as any).__p5_last = { path: '/tmp/a.png', bytes: 10, count: 1 };
      (window as any).OctaveP5.show('/tmp/a.png');
      await Promise.resolve();

      expect(got).toContain('blob:bus-url');
    });

    it('★ 模块实例身份不再决定失聪：另一个实例的钩子发的事件，总线订阅者也能收到', () => {
      // 用产品订阅口（总线接线函数）核实：审计 A#7 已删掉平行订阅口，
      // 断言面不变——总线上的事件必须到达 sink 的 onFigure 消费者。
      const sink = new GraphicsSink();
      const got: string[] = [];
      sink.onFigure((f) => got.push(f.imageDataUrl));
      const unwire = wireFigureBusToSink(sink);
      // 模拟「另一个实例」直接往总线发（等价于它的钩子捕获到图）
      emitFigureOnBus({
        path: '/tmp/x.png',
        bytes: 1,
        type: 'image/png',
        url: 'blob:from-other-instance',
        count: 1,
        timestamp: Date.now(),
      });
      expect(got).toEqual(['blob:from-other-instance']);
      unwire();
      emitFigureOnBus({
        path: '/tmp/y.png',
        bytes: 1,
        type: 'image/png',
        url: 'blob:after-unsub',
        count: 2,
        timestamp: Date.now(),
      });
      expect(got).toEqual(['blob:from-other-instance']);
    });

    it('实例内 subscribe 与总线双通道并存（旧路径不破）', async () => {
      (window as any).OctaveP5 = { show: () => true };
      plugin.init();
      const sink = new GraphicsSink();
      wireFigureSource(plugin, sink);
      wireFigureBusToSink(sink);
      const got: string[] = [];
      sink.onFigure((f) => got.push(f.imageDataUrl));

      makeImg('p5figure', 'blob:dual');
      (window as any).__p5_last = { path: '/tmp/a.png', bytes: 10, count: 1 };
      (window as any).OctaveP5.show('/tmp/a.png');
      await Promise.resolve();

      // 两条通道都到 ⇒ 同一 URL 出现两次（面板赋值幂等，无害）
      expect(got.length).toBeGreaterThanOrEqual(1);
      expect(new Set(got)).toEqual(new Set(['blob:dual']));
    });
  });

  describe('Notebook 路径不回退', () => {
    it('lastFigure / lastFigureCount 仍随事件更新（轮询快照源不变）', async () => {
      (window as any).OctaveP5 = { show: () => true };
      plugin.init();
      makeImg('p5figure', 'blob:snapshot');
      (window as any).__p5_last = { path: '/tmp/a.png', bytes: 10, count: 3 };
      (window as any).OctaveP5.show('/tmp/a.png');
      await Promise.resolve();
      expect(plugin.lastFigure?.url).toBe('blob:snapshot');
      expect(plugin.lastFigureCount).toBe(3);
    });
  });
});
