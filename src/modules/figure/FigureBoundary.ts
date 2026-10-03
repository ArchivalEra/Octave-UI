// src/modules/figure/FigureBoundary.ts
// E6 GL 边界安全屏障：前置拦截潜在导致 Wasm GL 纹理未结边界崩溃的画图指令，提供安全警示卡片

export interface InterceptResult {
  blocked: boolean;
  reason?: string;
  matchedCommand?: string;
}

export class FigureBoundary {
  // 危险绘图指令正则：涵盖常见图形生成与渲染触发词（包含 subplot、fplot、ezplot、contourf 等高频画图指令）
  private static readonly PLOT_PATTERNS = [
    /\b(subplot|fplot|ezplot|ezsurf|ezmesh|plot|plot3|mesh|meshc|meshz|surf|surfc|surfl|contour|contourf|bar|bar3|barh|pie|pie3|hist|histogram|scatter|scatter3|drawnow|figure|imagesc|imshow|stem|stem3|stairs|semilogx|semilogy|loglog|polarplot)\s*\(/i,
    /\b(drawnow|figure)\b/i,
  ];

  public static isPlotCommand(code: string): boolean {
    for (const pattern of FigureBoundary.PLOT_PATTERNS) {
      if (pattern.test(code)) {
        return true;
      }
    }
    return false;
  }

  public static intercept(code: string, allowOverride = false): InterceptResult {
    if (allowOverride) {
      return { blocked: false };
    }

    for (const pattern of FigureBoundary.PLOT_PATTERNS) {
      const match = pattern.exec(code);
      if (match) {
        const cmd = match[1] || match[0];
        return {
          blocked: true,
          matchedCommand: cmd,
          reason: `已拦截指令 '${cmd}'：上游 Octave WebAssembly 在 embed 模式下存在已知未结 GL 纹理边界（Issue #38 / E6 GL 边界），直接触发会导致底层 Wasm 解释器崩溃。当前 v1 界面已安全阻断该调用。`,
        };
      }
    }

    return { blocked: false };
  }
}
