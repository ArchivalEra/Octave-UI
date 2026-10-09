// src/modules/plugins/figure/P5FigureOverlayPlugin.ts
// P5 图形运行时外挂补丁插件：非侵入式代理 Octave Wasm 原生 toolkit WebGL 出图管线
// 解决 Issue #2 权威化后的三大痛点：
// 1. 不碰 MEMFS：不写任何虚拟 .m 影子桩，引擎 m 树守卫永不清除
// 2. 不碰 public/bridge：独立于 sync-bridge.sh 脚本，同步上游永不被冲掉
// 3. 挂载点拦截与自动 flush：防止 #p5figure 掉落到 document.body 底端，自动为 plot 补全 drawnow

import type { OctavePlugin, PluginContext } from '../types';

export interface P5FigureRenderEvent {
  path: string;
  bytes: number;
  type: string;
  url: string;
  count: number;
  timestamp: number;
}

export type FigureRenderListener = (event: P5FigureRenderEvent) => void;

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
  }

  /**
   * 拦截与代理 window.OctaveP5.show，捕获原生图片并阻断落入 document.body
   */
  installHook(): void {
    if (typeof window === 'undefined' || this._hookInstalled) return;

    this._ensureStagingAnchor();

    const hookTarget = () => {
      const p5 = (window as any).OctaveP5;
      if (p5 && typeof p5.show === 'function' && !p5.__overlay_hooked) {
        this._originalShow = p5.show;
        const self = this;

        p5.show = function (path: string) {
          // 确保 staging anchor 存在
          self._ensureStagingAnchor();

          // 执行原生 show（从 MEMFS 读取字节并生成 Blob URL）
          const ret = self._originalShow ? self._originalShow.apply(this, arguments as any) : false;

          if (self.enabled && ret) {
            const last = (window as any).__p5_last;
            if (last) {
              // 读出生成的图片信息
              const containerEl = document.getElementById('p5figure');
              const imgEl = containerEl?.querySelector('img');
              const activeUrl = imgEl?.dataset?.url || imgEl?.src || '';

              const evt: P5FigureRenderEvent = {
                path: last.path || path,
                bytes: last.bytes || 0,
                type: last.type || 'image/png',
                url: activeUrl,
                count: last.count,
                timestamp: Date.now(),
              };

              self._lastFigure = evt;
              self._lastFigureCount = last.count;
              self._notify(evt);
            }
          }
          return ret;
        };

        p5.__overlay_hooked = true;
        this._hookInstalled = true;
      }
    };

    hookTarget();

    // 如果 window.OctaveP5 尚未加载，通过 getter/setter 劫持
    if (!(window as any).OctaveP5) {
      let _val: any = undefined;
      try {
        Object.defineProperty(window, 'OctaveP5', {
          configurable: true,
          enumerable: true,
          get: () => _val,
          set: (v: any) => {
            _val = v;
            hookTarget();
          },
        });
      } catch {
        // 环境不支持 defineProperty 时忽略
      }
    }
  }

  uninstallHook(): void {
    if (typeof window === 'undefined') return;
    const p5 = (window as any).OctaveP5;
    if (p5 && this._originalShow) {
      p5.show = this._originalShow;
      p5.__overlay_hooked = false;
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
    this._lastFigure = evt;
    this._lastFigureCount = evt.count;
    this._notify(evt);
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
