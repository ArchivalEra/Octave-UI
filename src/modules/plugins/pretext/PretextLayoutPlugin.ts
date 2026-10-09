// src/modules/plugins/pretext/PretextLayoutPlugin.ts
// Pretext 零重排算术排版与瀑布流分配插件
// 借鉴 S26-1 (pretext-feed.mjs) 与 My-Shirone-Plugins (pretext-masonry)

import type { OctavePlugin } from '../types';

export interface PretextPluginOptions {
  minColWidth?: number;
  maxColWidth?: number;
  codeLineHeight?: number;
  codeFontSize?: number;
  descLineHeight?: number;
  descFontSize?: number;
  cardBasePadding?: number;
}

export interface TypesetCodeLine {
  lineNumber: number;
  content: string;
  isComment: boolean;
}

export interface CardLayoutMetrics {
  totalHeight: number;
  codeHeight: number;
  codeLineCount: number;
  titleLines: number;
  descLines: number;
}

/**
 * 纯函数：将卡片按「最短列优先」分配到 n 列（参考 S26-1 pretext-feed.mjs 原生算法规范）。
 * 既支持纯数字高度数组（返回每列下标，完全同 S26-1），也支持对象项数组（返回每列元素）。
 */
export function distributeCards(heights: number[], colCount: number): number[][];
export function distributeCards<T>(items: { item: T; height: number }[], colCount: number): T[][];
export function distributeCards(input: any[], colCount: number): any[][] {
  const cols = Math.max(1, Math.floor(colCount));
  const columns: any[][] = Array.from({ length: cols }, () => []);
  const sums = new Array(cols).fill(0);

  if (!input || input.length === 0) {
    return columns;
  }

  input.forEach((entry, idx) => {
    let best = 0;
    for (let c = 1; c < cols; c++) {
      if (sums[c] < sums[best]) {
        best = c;
      }
    }

    if (typeof entry === 'number') {
      columns[best].push(idx);
      sums[best] += Math.max(0, entry);
    } else if (entry && typeof entry === 'object' && 'item' in entry) {
      columns[best].push(entry.item);
      sums[best] += Math.max(0, entry.height ?? 0);
    } else {
      columns[best].push(entry);
      sums[best] += 1;
    }
  });

  return columns;
}

/**
 * 纯函数：桌面/移动宽度下的列数（同 S26-1 pretext-feed.mjs 规范）。
 */
export function columnCount(containerWidth: number, minCol = 240, maxCol = 380): number {
  if (containerWidth < minCol) return 1;
  return Math.max(1, Math.floor(containerWidth / minCol));
}

/**
 * 纯函数：pretext 路线的卡片高度预测规范（同 S26-1 pretext-feed.mjs 规范）。
 */
export function predictedHeight(
  { title, snippet, meta }: { title: string; snippet: string; meta: string },
  { padY, titleLineHeight, lineHeight, metaLineHeight, gap }: {
    padY: number;
    titleLineHeight: number;
    lineHeight: number;
    metaLineHeight: number;
    gap: number;
  },
  measureLines: (text: string, lh: number) => number
): number {
  const titleLines = measureLines(title, titleLineHeight);
  const snippetLines = measureLines(snippet, lineHeight);
  const metaLines = measureLines(meta, metaLineHeight);
  return padY * 2 + titleLines * titleLineHeight + gap + snippetLines * lineHeight + gap + metaLines * metaLineHeight;
}

/**
 * 纯函数：代码文本自动排版，按行清洗，标记注释（支持 Octave / MATLAB 的 % 与 #）与行号。
 */
export function formatCodeLines(code: string): TypesetCodeLine[] {
  if (!code) return [];
  const lines = code.trimEnd().split('\n');
  return lines.map((line, idx) => {
    const trimmed = line.trimStart();
    const isComment = trimmed.startsWith('%') || trimmed.startsWith('#');
    return {
      lineNumber: idx + 1,
      content: line,
      isComment,
    };
  });
}

export class PretextLayoutPlugin implements OctavePlugin<PretextPluginOptions> {
  readonly id = 'gallery-pretext';
  readonly name = 'Pretext Zero-Reflow Layout Plugin';
  readonly version = '1.0.0';
  readonly description = 'Pure arithmetic typography measurement and greedy shortest-column masonry waterfall layout engine';
  enabled = true;
  options: PretextPluginOptions;

  constructor(options: PretextPluginOptions = {}) {
    this.options = {
      minColWidth: options.minColWidth ?? 320,
      maxColWidth: options.maxColWidth ?? 460,
      codeLineHeight: options.codeLineHeight ?? 18,
      codeFontSize: options.codeFontSize ?? 12,
      descLineHeight: options.descLineHeight ?? 20,
      descFontSize: options.descFontSize ?? 13,
      cardBasePadding: options.cardBasePadding ?? 32,
    };
  }

  /**
   * 纯函数：将卡片项按「最短列优先」贪心分配到 n 列（纯算术瀑布流分配）。
   * 委托至 S26-1 兼容的统一 distributeCards 实现。
   */
  distributeCards(heights: number[], colCount: number): number[][];
  distributeCards<T>(items: { item: T; height: number }[], colCount: number): T[][];
  distributeCards(input: any[], colCount: number): any[][] {
    return distributeCards(input, colCount);
  }

  /**
   * 纯函数：根据容器宽度自适应列数（移动端 1 列，中屏 2 列，宽屏 3-4 列）。
   */
  computeColumnCount(containerWidth: number, minCol = 320, maxCol = 460): number {
    if (!containerWidth || containerWidth <= minCol * 1.5) {
      return 1;
    }
    if (containerWidth < 980) {
      return 2;
    }
    return Math.min(4, Math.max(1, Math.floor(containerWidth / minCol)));
  }

  /**
   * 纯函数：测算文本的折行行数（纯算术预估，杜绝 DOM 强制回流）。
   * 覆盖 CJK 表意字符、标点符号 (0x3000-0x303F) 与全角符号。
   */
  measureTextLines(text: string, maxWidthPx: number, fontSizePx: number, fontKind: 'sans' | 'mono' = 'sans'): number {
    if (!text || text.trim().length === 0) return 0;
    const clean = text.trim();
    const effectiveWidth = Math.max(80, maxWidthPx);

    if (fontKind === 'mono') {
      const charWidth = fontSizePx * 0.6;
      const charsPerLine = Math.max(10, Math.floor(effectiveWidth / charWidth));
      const logicalLines = clean.split('\n');
      let totalLines = 0;
      for (const line of logicalLines) {
        totalLines += Math.max(1, Math.ceil(Math.max(1, line.length) / charsPerLine));
      }
      return totalLines;
    }

    // Proportional font: 混合中西文宽度预测（含 CJK 符号与假名）
    const logicalLines = clean.split('\n');
    let totalLines = 0;
    for (const line of logicalLines) {
      let lineVisualWidth = 0;
      for (let i = 0; i < line.length; i++) {
        const code = line.charCodeAt(i);
        // CJK 标点 (0x3000-0x303F)、假名 (0x3040-0x30FF)、表意文字 (0x4E00-0x9FFF) 与全角 ASCII (0xFF00-0xFFEF)
        const isFullWidth =
          (code >= 0x3000 && code <= 0x9fff) ||
          (code >= 0xff00 && code <= 0xffef) ||
          (code >= 0x2e80 && code <= 0x2fff);
        lineVisualWidth += isFullWidth ? fontSizePx : fontSizePx * 0.55;
      }
      totalLines += Math.max(1, Math.ceil(lineVisualWidth / effectiveWidth));
    }
    return totalLines;
  }

  /**
   * 纯函数：预测卡片高度，包括头部、标签、文本框与代码框。
   */
  predictCardHeight(
    recipe: { title: string; desc: string; code: string; tags?: string[] },
    cardWidthPx = 340
  ): CardLayoutMetrics {
    const contentW = Math.max(120, cardWidthPx - (this.options.cardBasePadding ?? 32));

    // 1. 标题行预估
    const titleLines = Math.max(1, this.measureTextLines(recipe.title, contentW - 56, 16, 'sans'));
    const titleHeight = titleLines * 22;

    // 2. 标签与描述预估
    const tagsHeight = (recipe.tags && recipe.tags.length > 0) ? 26 : 0;
    const descLines = Math.max(1, this.measureTextLines(recipe.desc, contentW, this.options.descFontSize ?? 13, 'sans'));
    const descHeight = descLines * (this.options.descLineHeight ?? 20) + 8;

    // 3. 代码框自动排版预估（无截断自然撑开）
    const typesetLines = this.formatCodeLines(recipe.code);
    const codeLineCount = typesetLines.length;
    const codeHeight = codeLineCount * (this.options.codeLineHeight ?? 18) + 24; // 内边距 + 边框

    // 4. 底部按钮与各区域间距 (gap: 12px)
    const headerHeight = Math.max(40, titleHeight + tagsHeight);
    const footerHeight = 40;
    const gaps = 12 * 4;
    const totalHeight = (this.options.cardBasePadding ?? 32) + headerHeight + descHeight + codeHeight + footerHeight + gaps;

    return {
      totalHeight: Math.round(totalHeight),
      codeHeight: Math.round(codeHeight),
      codeLineCount,
      titleLines,
      descLines,
    };
  }

  /**
   * 纯函数：代码文本自动排版，按行清洗，标记注释与行号。
   */
  formatCodeLines(code: string): TypesetCodeLine[] {
    return formatCodeLines(code);
  }
}
