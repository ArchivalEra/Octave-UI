// src/modules/figure/CapabilityPolicy.ts
// 输入侧策略分析模块：绘图语法意图探测与出队时（Time-of-Dequeue）宿主能力核验，不持有引擎适配器
export interface PolicyDecision {
  allowed: boolean;
  isPlot: boolean;
  matchedCommand?: string;
  reason?: string;
}

export interface CapabilityStatus {
  webgpuSupported: boolean;
  reason?: string;
}

export type InterceptListener = (decision: PolicyDecision) => void;

export class CapabilityPolicy {
  // 危险绘图指令正则：涵盖常见图形生成与渲染触发词（包含 subplot、fplot、ezplot、contourf 等高频画图指令）
  private static readonly PLOT_PATTERNS = [
    /\b(subplot|fplot|ezplot|ezsurf|ezmesh|plot|plot3|mesh|meshc|meshz|surf|surfc|surfl|contour|contourf|bar|bar3|barh|pie|pie3|hist|histogram|scatter|scatter3|drawnow|figure|imagesc|imshow|stem|stem3|stairs|semilogx|semilogy|loglog|polarplot)\s*\(/i,
    /\b(drawnow|figure)\b/i,
  ];

  private _mockWebGpuSupported: boolean | null = null;
  private _listeners: Set<InterceptListener> = new Set();

  setMockWebGpuSupport(supported: boolean | null) {
    this._mockWebGpuSupported = supported;
  }

  isPlotCommand(code: string): { isPlot: boolean; matchedCommand?: string } {
    for (const pattern of CapabilityPolicy.PLOT_PATTERNS) {
      const match = pattern.exec(code);
      if (match) {
        return { isPlot: true, matchedCommand: match[1] || match[0] };
      }
    }
    return { isPlot: false };
  }

  async checkHostCapability(): Promise<CapabilityStatus> {
    if (this._mockWebGpuSupported !== null) {
      return {
        webgpuSupported: this._mockWebGpuSupported,
        reason: this._mockWebGpuSupported ? undefined : 'WebGPU capability disabled or unsupported (mocked)',
      };
    }

    const nav = typeof navigator !== 'undefined' ? (navigator as any) : undefined;
    if (!nav || !nav.gpu) {
      return {
        webgpuSupported: false,
        reason: '当前浏览器或宿主环境不支持 WebGPU 离屏图形管线。',
      };
    }

    try {
      const adapter = await nav.gpu.requestAdapter();
      if (!adapter) {
        return {
          webgpuSupported: false,
          reason: '未能成功请求 WebGPU 适配器，图形硬件加速不可用。',
        };
      }
      return { webgpuSupported: true };
    } catch (err: any) {
      return {
        webgpuSupported: false,
        reason: `WebGPU 探测异常: ${err?.message || err}`,
      };
    }
  }

  async evaluateAtDequeue(code: string, allowOverride = false): Promise<PolicyDecision> {
    if (allowOverride) {
      return { allowed: true, isPlot: false };
    }

    const { isPlot, matchedCommand } = this.isPlotCommand(code);
    if (!isPlot) {
      return { allowed: true, isPlot: false };
    }

    const cap = await this.checkHostCapability();
    if (cap.webgpuSupported) {
      return { allowed: true, isPlot: true, matchedCommand };
    }

    const decision: PolicyDecision = {
      allowed: false,
      isPlot: true,
      matchedCommand,
      reason: `已拦截绘图调用 '${matchedCommand}'：当前运行环境未就绪 WebGPU 离屏图形管线（Issue #38 / E6 GL 边界）。调用绘图指令可能导致 Wasm 解释器发生底层内存违例。`,
    };

    for (const cb of this._listeners) {
      try {
        cb(decision);
      } catch {}
    }

    return decision;
  }

  onIntercept(cb: InterceptListener): () => void {
    this._listeners.add(cb);
    return () => this._listeners.delete(cb);
  }
}
