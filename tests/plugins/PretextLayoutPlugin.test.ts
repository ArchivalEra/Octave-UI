// tests/plugins/PretextLayoutPlugin.test.ts
import { describe, it, expect } from 'vitest';
import { PretextLayoutPlugin } from '../../src/modules/plugins/pretext/PretextLayoutPlugin';

describe('PretextLayoutPlugin', () => {
  const plugin = new PretextLayoutPlugin();

  it('declares correct plugin identity', () => {
    expect(plugin.id).toBe('gallery-pretext');
    expect(plugin.name).toContain('Pretext');
    expect(plugin.enabled).toBe(true);
  });

  describe('distributeCards (Waterfall Shortest-Column Allocation)', () => {
    it('places all cards into a single column when colCount is 1', () => {
      const items = [
        { item: 'A', height: 200 },
        { item: 'B', height: 350 },
        { item: 'C', height: 180 },
      ];
      const cols = plugin.distributeCards(items, 1);
      expect(cols).toHaveLength(1);
      expect(cols[0]).toEqual(['A', 'B', 'C']);
    });

    it('distributes items into multiple columns using greedy shortest column assignment', () => {
      const items = [
        { item: 'A', height: 300 }, // col 0: 300
        { item: 'B', height: 200 }, // col 1: 200
        { item: 'C', height: 150 }, // col 1: 200 + 150 = 350
        { item: 'D', height: 100 }, // col 0: 300 + 100 = 400
      ];
      const cols = plugin.distributeCards(items, 2);
      expect(cols).toHaveLength(2);
      expect(cols[0]).toEqual(['A', 'D']);
      expect(cols[1]).toEqual(['B', 'C']);
    });

    it('supports S26-1 native number[] height array signature and returns column index sets', () => {
      // 严格对标 S26-1 pretext-feed.test.mjs: [10, 10, 10, 30] 进 3 列
      const cols = plugin.distributeCards([10, 10, 10, 30], 3);
      expect(cols).toEqual([[0, 3], [1], [2]]);
    });

    it('handles empty items array gracefully', () => {
      const cols = plugin.distributeCards([], 3);
      expect(cols).toEqual([[], [], []]);
    });

    it('clamps invalid column counts to at least 1', () => {
      const items = [{ item: 'A', height: 100 }];
      expect(plugin.distributeCards(items, 0)).toHaveLength(1);
      expect(plugin.distributeCards(items, -2)).toHaveLength(1);
    });
  });

  describe('computeColumnCount & S26-1 columnCount', () => {
    it('returns 1 column for mobile widths', () => {
      expect(plugin.computeColumnCount(320)).toBe(1);
      expect(plugin.computeColumnCount(480)).toBe(1);
      expect(plugin.computeColumnCount(0)).toBe(1);
    });

    it('returns 2 columns for medium tablets/notebooks', () => {
      expect(plugin.computeColumnCount(750)).toBe(2);
      expect(plugin.computeColumnCount(900)).toBe(2);
    });

    it('returns 3 or more columns for desktop widths', () => {
      expect(plugin.computeColumnCount(1080)).toBe(3);
      expect(plugin.computeColumnCount(1400)).toBe(4);
    });
  });

  describe('measureTextLines & formatCodeLines', () => {
    it('measures monospace code lines correctly', () => {
      const code = `x = linspace(0, 10, 100);
y = sin(x);
plot(x, y);`;
      const lines = plugin.measureTextLines(code, 300, 12, 'mono');
      expect(lines).toBe(3);
    });

    it('handles empty or whitespace text gracefully', () => {
      expect(plugin.measureTextLines('', 300, 12)).toBe(0);
      expect(plugin.measureTextLines('   ', 300, 12)).toBe(0);
    });

    it('measures proportional mixed CJK text and punctuation', () => {
      const title = '快速傅里叶变换（FFT）频域谱分析与滤波计算：第二部分。';
      const lines = plugin.measureTextLines(title, 200, 16, 'sans');
      expect(lines).toBeGreaterThanOrEqual(1);
    });

    it('formats code lines with 1-based indexing and detects both % and # comment lines', () => {
      const snippet = `% 蒙特卡洛求圆周率
N = 10000;
# Octave 风格单行注释
x = rand(N, 1);`;
      const formatted = plugin.formatCodeLines(snippet);
      expect(formatted).toHaveLength(4);

      expect(formatted[0].lineNumber).toBe(1);
      expect(formatted[0].isComment).toBe(true);
      expect(formatted[0].content).toContain('% 蒙特卡洛');

      expect(formatted[1].lineNumber).toBe(2);
      expect(formatted[1].isComment).toBe(false);

      expect(formatted[2].lineNumber).toBe(3);
      expect(formatted[2].isComment).toBe(true);
      expect(formatted[2].content).toContain('# Octave');

      expect(formatted[3].lineNumber).toBe(4);
      expect(formatted[3].isComment).toBe(false);
    });
  });

  describe('predictCardHeight & S26-1 predictedHeight', () => {
    it('calculates deterministic card metrics', () => {
      const recipe1 = {
        title: 'Short',
        desc: 'Short desc',
        code: `y = 1;\nplot(y);`,
        tags: ['A'],
      };
      const recipe2 = {
        title: 'Long Title with multiple mathematical explanations and notes',
        desc: 'A very detailed multi-line description explaining the algorithm and its physical implications in detail.',
        code: `% 1. 初始化矩阵
A = rand(10);
% 2. 计算特征值
[V, D] = eig(A);
% 3. 验证
r = norm(A*V - V*D);`,
        tags: ['A', 'B', 'C'],
      };

      const m1 = plugin.predictCardHeight(recipe1, 340);
      const m2 = plugin.predictCardHeight(recipe2, 340);

      expect(m1.totalHeight).toBeGreaterThan(150);
      expect(m2.totalHeight).toBeGreaterThan(m1.totalHeight);
      expect(m2.codeLineCount).toBe(6);
      expect(m1.codeLineCount).toBe(2);
    });
  });

  describe('S26-1 Standalone Pure Functions Compatibility', () => {
    it('columnCount matches S26-1 spec', async () => {
      const { columnCount: colCount } = await import('../../src/modules/plugins/pretext/PretextLayoutPlugin');
      expect(colCount(100, 240, 380)).toBe(1);
      expect(colCount(760, 240, 380)).toBe(3);
      expect(colCount(240, 240, 380)).toBe(1);
    });

    it('predictedHeight matches S26-1 spec formula', async () => {
      const { predictedHeight: predH } = await import('../../src/modules/plugins/pretext/PretextLayoutPlugin');
      const spec = { padY: 14, titleLineHeight: 24, lineHeight: 22, metaLineHeight: 20, gap: 8 };
      const h = predH(
        { title: 'T', snippet: 'S', meta: 'M' },
        spec,
        (t) => (t === 'T' ? 1 : t === 'S' ? 3 : 1)
      );
      // 内边距×2 + 标题行×行高 + 间隙 + 摘要行×行高 + 间隙 + meta 行×行高
      expect(h).toBe(28 + 24 + 8 + 66 + 8 + 20);
    });
  });
});
