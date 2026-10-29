// src/modules/plugins/figure/P5FigureOverlayPlugin.ts
// P5 图形运行时外挂补丁插件：非侵入式代理 Octave Wasm 原生 toolkit WebGL 出图管线
// 解决 Issue #2 权威化后的三大痛点：
// 1. 不碰 MEMFS：不写任何虚拟 .m 影子桩，引擎 m 树守卫永不清除
// 2. 不碰 public/bridge：独立于 sync-bridge.sh 脚本，同步上游永不被冲掉
// 3. 挂载点拦截与自动 flush：防止 #p5figure 掉落到 document.body 底端，自动为 plot 补全 drawnow

import type { OctavePlugin, PluginContext } from '../types';
import { FIGURE_BUS_EVENT } from '../../figure/GraphicsSink';

export interface P5FigureRenderEvent {
  path: string;
  bytes: number;
  type: string;
  url: string;
  count: number;
  timestamp: number;
}

export type FigureRenderListener = (event: P5FigureRenderEvent) => void;

// 页面级图表事件总线（spec #19 决策 1）：把「谁装了钩」与「谁收事件」解耦。
// 为什么必须有它：钩子的幂等标记挂在 window.OctaveP5 上，模块若被求值出两个实例
// （Vite dev 的模块图重复实例），第二个实例会静默跳过安装 ⇒ 它自己的 _listeners
// 永远收不到事件，而 sink 订阅的恰好可能是那个没装钩的实例（056 复钓的红线 1）。
// ⇒ 事件发到页面级总线上，任何实例的钩子捕获到图都往这里发，订阅方不再依赖实例身份。
// 事件名产地只有一个：GraphicsSink.FIGURE_BUS_EVENT（订阅方 wireFigureBusToSink 同源）。

export function emitFigureOnBus(evt: P5FigureRenderEvent): void {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  try {
    window.dispatchEvent(new CustomEvent(FIGURE_BUS_EVENT, { detail: evt }));
  } catch {
    // 非浏览器环境（或 CustomEvent 缺席）静默跳过：总线是补充通道，不阻断实例内分发
  }
}

// 从 __p5_last 与 DOM 两侧取图源 URL（spec #19 决策 3）。
// 权威源是 __p5_last（p5canvas 写的路径/字节/序号），URL 只能从 DOM 的 img 拿——
// 但 img 可能尚未就位（实测：钩子在 img 挂载前读到空串，空 URL 一路传到面板 ⇒ 静默不更新）。
// ⇒ 优先 dataset.url / src；两处都空时**再查一次**（同一次 tick 内 img 可能刚插入）。
function resolveFigureUrl(): string {
  if (typeof document === 'undefined') return '';
  const containerEl = document.getElementById('p5figure');
  const imgEl = containerEl?.querySelector('img') as HTMLImageElement | null;
  if (!imgEl) return '';
  return (imgEl.dataset?.url || imgEl.src || '').trim();
}

export class P5FigureOverlayPlugin implements OctavePlugin {
  readonly id = 'p5-figure-overlay';
  readonly name = 'P5 Figure Graphics Overlay';
  readonly version = '1.0.0';
  enabled = true;

  private _listeners = new Set<FigureRenderListener>();
  private _lastFigure: P5FigureRenderEvent | null = null;
  private _lastFigureCount = 0;
  private _originalShow: ((path: string) => boolean) | null = null;
  private _hookInstalled = false;
  // staging 生命周期管 URL：新图事件 emit 前记录旧 url，新事件到达时 revoke 上一张的
  // Blob URL；同 url 不重复 revoke。卸载钩子时不动 URL——图还显示着就 revoke 是破坏行为
  private _lastEmittedUrl: string | null = null;

  get lastFigure(): P5FigureRenderEvent | null {
    return this._lastFigure;
  }

  get lastFigureCount(): number {
    return this._lastFigureCount;
  }

  init(_context?: PluginContext): void {
    this.installHook();
  }

  destroy(): void {
    this.uninstallHook();
    this._listeners.clear();
    // 不 revoke _lastEmittedUrl：卸载时图可能还显示着（见字段注释）
  }

  /**
   * 拦截与代理 window.OctaveP5.show，捕获原生图片并阻断落入 document.body
   *
   * 两个必须扛住的现实（056 复钓红线 1 的断点）：
   * ① 上游 p5canvas.js 会**重新赋值** `window.OctaveP5`（每次都是一份新对象 + 裸 show）——
   *    去重标记若挂在 window.OctaveP5 上，新对象上就没有它，但旧实例的 `_hookInstalled`
   *    仍为 true ⇒ 新对象永远不被包装。⇒ 标记挂在**包装函数自身**（`__overlay_hooked`
   *    放函数上），且「已装过」的判断按**当前对象**判，不用实例级布尔短路。
   * ② 钩子读 URL 时 img 可能还没插进 DOM（实测读到空串，空 URL 传到面板 ⇒ 面板静默不更新）。
   *    ⇒ 取不到 URL 时在同一 tick 后重试一次（微任务），仍取不到才发空事件
   *    （空事件由 sink 侧丢弃，见 GraphicsSink.emitFigure 的守卫）。
   */
  installHook(): void {
    if (typeof window === 'undefined') return;

    this._ensureStagingAnchor();

    const hookTarget = () => {
      const p5 = (window as any).OctaveP5;
      if (!p5 || typeof p5.show !== 'function') return;
      // 去重看**这个函数**是否已被包装，不看实例字段也不看对象字段
      if ((p5.show as any).__overlay_hooked) {
        this._hookInstalled = true;
        return;
      }
      const self = this;
      const original = p5.show;

      const wrapped = function (this: any, path: string) {
        self._ensureStagingAnchor();
        // 执行原生 show（从 MEMFS 读取字节并生成 Blob URL / 插 img）
        const ret = original.apply(this, arguments as any);
        if (self.enabled && ret) {
          self._captureAndEmit(path, 0);
        }
        return ret;
      };
      (wrapped as any).__overlay_hooked = true;

      p5.show = wrapped;
      this._originalShow = original;
      this._hookInstalled = true;
    };

    hookTarget();

    // window.OctaveP5 可能尚未加载，或**之后被整体替换**（p5canvas 的赋值点）——
    // 用 getter/setter 劫持，每次赋值都重新尝试包装。
    // ⚠️ 若上游已用普通属性赋值过，这里改写成访问器不会丢值（先读现值再接管）。
    try {
      const desc = Object.getOwnPropertyDescriptor(window, 'OctaveP5');
      if (!desc || desc.configurable) {
        let _val: any = desc?.value;
        Object.defineProperty(window, 'OctaveP5', {
          configurable: true,
          enumerable: true,
          get: () => _val,
          set: (v: any) => {
            _val = v;
            hookTarget();
          },
        });
        // 接管前已有值 ⇒ 补一次包装
        if (_val) hookTarget();
      }
    } catch {
      // 环境不支持 defineProperty 时忽略：至少首次 hookTarget 的包装仍有效
    }
  }

  /**
   * 从 __p5_last + DOM 组装事件并分发；URL 取不到时延一微任务重试一次
   * （img 插入与 show 返回在同一 tick 的常见形状）。
   */
  private _captureAndEmit(path: string, attempt: number): void {
    const last = (window as any).__p5_last;
    if (!last) return;

    const activeUrl = resolveFigureUrl();
    if (!activeUrl && attempt === 0) {
      // 图刚生成、img 可能还没挂上：延一微任务再取（不引 setTimeout——那会让事件顺序漂）
      Promise.resolve().then(() => this._captureAndEmit(path, 1));
      return;
    }

    const evt: P5FigureRenderEvent = {
      path: last.path || path,
      bytes: last.bytes || 0,
      type: last.type || 'image/png',
      url: activeUrl,
      count: last.count,
      timestamp: Date.now(),
    };

    this._lastFigure = evt;
    this._lastFigureCount = last.count;
    this._releaseStaleUrl(evt.url);
    this._notify(evt);
    // 页面级总线（决策 1）：实例可能不是 sink 订阅的那一个，总线是跨实例的同一出口
    emitFigureOnBus(evt);
  }

  uninstallHook(): void {
    if (typeof window === 'undefined') return;
    const p5 = (window as any).OctaveP5;
    if (p5 && this._originalShow && typeof p5.show === 'function' && (p5.show as any).__overlay_hooked) {
      p5.show = this._originalShow;
      this._originalShow = null;
    }
    this._hookInstalled = false;
  }

  /**
   * 确保 staging 隐藏锚点存在，使 p5canvas.js 的 container() 在 pre.nextSibling 时挂入此受控区域，
   * 绝不溢出到 document.body 底部
   */
  private _ensureStagingAnchor(): void {
    if (typeof document === 'undefined') return;
    let staging = document.getElementById('octave-p5-staging');
    if (!staging) {
      staging = document.createElement('div');
      staging.id = 'octave-p5-staging';
      staging.style.display = 'none';
      staging.setAttribute('aria-hidden', 'true');
      document.body.appendChild(staging);
    }

    let out = document.getElementById('output');
    if (!out) {
      out = document.createElement('div');
      out.id = 'output';
      out.style.display = 'none';
      out.setAttribute('data-purpose', 'octave-p5-staging-anchor');
      staging.appendChild(out);
    } else if (out.parentNode !== staging && !out.closest('#octave-p5-staging')) {
      // 若 output 存在但在其他位置，保证不干扰
    }
  }

  /**
   * 自动为绘图命令补全 drawnow（解决 Wasm 环境无 GUI 循环导致裸 plot 零像素的问题）
   */
  prepareCode(code: string): string {
    if (!this.enabled || !code) return code;
    const trimmed = code.trim();
    if (!trimmed) return code;

    // 检查是否包含常见绘图命令
    const hasPlotCmd = /\b(plot|plot3|figure|surf|surfc|surfl|mesh|meshc|meshz|contour|contourf|bar|bar3|barh|hist|histogram|scatter|scatter3|stem|stem3|pie|pie3|imagesc|imshow|polar|polarplot|semilogx|semilogy|loglog|errorbar|area|ezplot|ezsurf|ezmesh|fplot|subplot)\s*(\(|$)/i.test(trimmed);

    // 检查代码末尾是否已有 drawnow
    const hasDrawnow = /\bdrawnow\b/i.test(trimmed);

    if (hasPlotCmd && !hasDrawnow) {
      return `${trimmed}\ndrawnow;`;
    }
    return code;
  }

  /**
   * 手动注入图表捕获（主要供测试或 mock 使用）
   */
  captureFigure(evt: P5FigureRenderEvent): void {
    this._releaseStaleUrl(evt.url);
    this._lastFigure = evt;
    this._lastFigureCount = evt.count;
    this._notify(evt);
  }

  // 新图 URL 到手后，revoke「上一张已 emit 的 Blob URL」。
  // 空 url / 同 url 重复 / URL API 不存在 ⇒ 静默跳过
  private _releaseStaleUrl(nextUrl: string): void {
    const prev = this._lastEmittedUrl;
    this._lastEmittedUrl = nextUrl || null;
    if (!prev || prev === nextUrl) return;
    try {
      if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
        URL.revokeObjectURL(prev);
      }
    } catch {
      // revoke 失败不阻断事件分发
    }
  }

  subscribe(listener: FigureRenderListener): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  private _notify(event: P5FigureRenderEvent): void {
    for (const listener of this._listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('[P5FigureOverlayPlugin] Listener callback error:', err);
      }
    }
  }
}
