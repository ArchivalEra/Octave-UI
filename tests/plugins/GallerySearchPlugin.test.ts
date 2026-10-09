// tests/plugins/GallerySearchPlugin.test.ts
import { describe, it, expect } from 'vitest';
import {
  GallerySearchPlugin,
  foldSearchText,
  queryGrams,
  escapeHtml,
  highlightMatches,
} from '../../src/modules/plugins/search/GallerySearchPlugin';
import { RECIPES } from '../../src/modules/experiment/ExampleRegistry';

describe('GallerySearchPlugin & S26-1 Algorithm Reference', () => {
  const plugin = new GallerySearchPlugin();
  const mockResolver = (key: string) => {
    const map: Record<string, string> = {
      'examples.recipe_sine_wave_title': '正弦波与谐波合成',
      'examples.recipe_sine_wave_desc': '生成多频次谐波信号并安全呈现合成波形图。',
      'examples.recipe_solve_linear_title': '求解线性方程组 (A \\ b)',
      'examples.recipe_solve_linear_desc': '使用高斯消元左除运算符高效求解线性代数方程组。',
      'examples.recipe_fft_spectrum_title': '快速傅里叶变换 (FFT)',
      'examples.recipe_fft_spectrum_desc': '将时域双音信号转换为单侧频域幅值谱。',
      'examples.recipe_monte_carlo_pi_title': '蒙特卡洛随机求 π',
      'examples.recipe_monte_carlo_pi_desc': '基于 10,000 个随机投点统计四分之一圆面积估算圆周率。',
      'examples.recipe_matrix_eig_title': '特征值与特征向量分解',
      'examples.recipe_matrix_eig_desc': '计算对称方阵的特征向量矩阵与特征值对角阵。',
      'examples.recipe_poly_fit_title': '多项式曲线拟合 (polyfit)',
      'examples.recipe_poly_fit_desc': '针对实验散点数据拟合二次抛物线多项式系数。',
    };
    return map[key] ?? key;
  };

  it('declares valid plugin identity', () => {
    expect(plugin.id).toBe('gallery-search');
    expect(plugin.name).toContain('Search');
    expect(plugin.enabled).toBe(true);
  });

  describe('foldSearchText (CJK Folding & Normalization)', () => {
    it('normalizes fullwidth characters via NFKC', () => {
      expect(foldSearchText('ＦＦＴ')).toBe('fft');
      expect(foldSearchText('１２３')).toBe('123');
    });

    it('merges typography spaces around CJK and keeps ASCII spaces intact', () => {
      // 汉字与汉字、汉字与数字之间空格合并
      expect(foldSearchText('正弦 波')).toBe('正弦波');
      expect(foldSearchText('第 1 章')).toBe('第1章');
      expect(foldSearchText('fft 变换')).toBe('fft变换');

      // 纯英文词间空格完整保留
      expect(foldSearchText('monte carlo pi')).toBe('monte carlo pi');
    });

    it('collapses extra spaces and newlines', () => {
      expect(foldSearchText('  monte   \n\n  carlo  ')).toBe('monte\ncarlo');
    });

    it('handles empty and nullish inputs gracefully', () => {
      expect(foldSearchText('')).toBe('');
      expect(foldSearchText(null)).toBe('');
      expect(foldSearchText(undefined)).toBe('');
    });
  });

  describe('queryGrams', () => {
    it('generates bigrams and unigrams without whitespace', () => {
      const { bigrams, unigrams } = queryGrams('sin wave');
      expect(bigrams).toContain('si');
      expect(bigrams).toContain('in');
      expect(bigrams).toContain('wa');
      expect(bigrams).toContain('av');
      expect(bigrams).toContain('ve');
      expect(bigrams).not.toContain('n ');
      expect(bigrams).not.toContain(' w');
      expect(unigrams).toContain('s');
      expect(unigrams).toContain('w');
    });
  });

  describe('escapeHtml and highlightMatches', () => {
    it('escapes dangerous HTML characters', () => {
      expect(escapeHtml('<script>alert("xss")</script>')).toBe(
        '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
      );
      expect(escapeHtml('A & B')).toBe('A &amp; B');
    });

    it('wraps matching keywords in search-highlight marks', () => {
      const res = highlightMatches('快速傅里叶变换 (FFT)', 'fft');
      expect(res).toContain('<mark class="search-highlight">FFT</mark>');
    });

    it('highlights multiple search tokens correctly', () => {
      const res = highlightMatches('Monte Carlo Pi Simulation', 'monte pi');
      expect(res).toContain('<mark class="search-highlight">Monte</mark>');
      expect(res).toContain('<mark class="search-highlight">Pi</mark>');
    });

    it('safely escapes HTML entities and never corrupts them when searching entity substrings', () => {
      // 验证找 lt 时不会误破坏 x < 10 里的 &lt;
      expect(highlightMatches('x < 10', 'lt')).toBe('x &lt; 10');
      // 验证找 amp 时不会误破坏 A & B 里的 &amp;
      expect(highlightMatches('A & B', 'amp')).toBe('A &amp; B');
      // 验证直接搜索 < 时能正确高亮并转义
      expect(highlightMatches('x < 10', '<')).toBe('x <mark class="search-highlight">&lt;</mark> 10');
      // 验证直接搜索 & 时能正确高亮并转义
      expect(highlightMatches('A & B', '&')).toBe('A <mark class="search-highlight">&amp;</mark> B');
    });

    it('highlights multi-token CJK queries across the same text', () => {
      const res = highlightMatches('正弦波与谐波合成', '正弦 谐波');
      expect(res).toBe('<mark class="search-highlight">正弦</mark>波与<mark class="search-highlight">谐波</mark>合成');
    });

    it('handles regex special symbols safely (e.g. backslash, brackets)', () => {
      const res = highlightMatches('求解线性方程组 (A \\ b)', 'A \\ b');
      expect(res).toContain('<mark class="search-highlight">A \\ b</mark>');
    });
  });

  describe('searchRecipes Multi-field Weighted Search', () => {
    it('returns all recipes when query is empty', () => {
      const hits = plugin.searchRecipes(RECIPES, '', mockResolver);
      expect(hits).toHaveLength(RECIPES.length);
      expect(hits[0].score).toBe(0);
    });

    it('matches and ranks exact title matches at highest priority', () => {
      const hits = plugin.searchRecipes(RECIPES, '正弦波与谐波合成', mockResolver);
      expect(hits.length).toBeGreaterThanOrEqual(1);
      expect(hits[0].recipe.id).toBe('sine-wave');
      expect(hits[0].titleMatches).toBe(true);
      expect(hits[0].score).toBeGreaterThan(100);
    });

    it('successfully matches multi-keyword CJK queries separated by space', () => {
      // 核心缺陷修复回归断言：输入两个独立中文词，不能因粗暴空格折叠而全灭
      const hits = plugin.searchRecipes(RECIPES, '正弦 谐波', mockResolver);
      expect(hits.length).toBeGreaterThanOrEqual(1);
      expect(hits[0].recipe.id).toBe('sine-wave');
      expect(hits[0].titleMatches).toBe(true);
    });

    it('matches recipes by tag name (e.g., FFT, Matrix)', () => {
      const hits = plugin.searchRecipes(RECIPES, 'FFT', mockResolver);
      expect(hits.length).toBeGreaterThanOrEqual(1);
      expect(hits[0].recipe.id).toBe('fft-spectrum');
      expect(hits[0].tagMatches).toContain('FFT');
    });

    it('matches recipes by description keywords (e.g., 高斯消元, 抛物线)', () => {
      const hits = plugin.searchRecipes(RECIPES, '高斯消元', mockResolver);
      expect(hits.length).toBeGreaterThanOrEqual(1);
      expect(hits[0].recipe.id).toBe('solve-linear');
      expect(hits[0].descMatches).toBe(true);
    });

    it('matches recipes by code content (e.g., polyfit, eig, linspace)', () => {
      const hits = plugin.searchRecipes(RECIPES, 'polyfit', mockResolver);
      expect(hits.length).toBeGreaterThanOrEqual(1);
      expect(hits[0].recipe.id).toBe('poly-fit');
      expect(hits[0].codeMatches).toBe(true);
      expect(hits[0].highlightedCode).toContain('<mark class="search-highlight">polyfit</mark>');
    });

    it('returns uninhibited recipe list when plugin is disabled', () => {
      plugin.enabled = false;
      const hits = plugin.searchRecipes(RECIPES, 'FFT', mockResolver);
      expect(hits).toHaveLength(RECIPES.length);
      expect(hits[0].score).toBe(0);
      plugin.enabled = true;
    });

    it('returns empty array when nothing matches', () => {
      const hits = plugin.searchRecipes(RECIPES, 'nonexistent_keyword_xyz', mockResolver);
      expect(hits).toHaveLength(0);
    });
  });
});
