// src/modules/plugins/search/GallerySearchPlugin.ts
// 实验画廊高精全文检索插件：参考隔壁 S26-1_202609 (site-search.mjs) 的优雅架构
// 采用 CJK 边界折叠规范化、Bigram/Unigram 字面子串匹配、多字段加权打分与安全高亮

import type { OctavePlugin } from '../types';
import type { ExperimentRecipe } from '../../experiment/types';

export const CJK_CLASS = '\\u3000-\\u303f\\u3040-\\u30ff\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff\\uff00-\\uffef';
export const ALNUM_CLASS = '0-9a-z';
export const CJK_RE_SRC = `[${CJK_CLASS}]`;

/**
 * 纯函数：查询与索引共用的规范化折叠（逐字匹配基础）。
 * NFKC 标准化 → 小写 → 折叠连续空白 → 合并汉字周围的排版空格。
 */
export function foldSearchText(input: unknown): string {
  if (input === null || input === undefined) return '';
  let s = String(input);
  try {
    s = s.normalize('NFKC');
  } catch {
    // 降级退化
  }
  s = s.toLowerCase();
  s = s.replace(/[ \t\u00a0\u3000]+/g, ' ');
  s = s.replace(/ *\n */g, '\n');
  s = s.replace(/\n{2,}/g, '\n');

  // 「正弦 波」「第 1 章」这类空格是排版习惯，用户查询不会严格敲打；
  // 汉字与汉字、汉字与英数字之间的空格合并，英数字之间的词空格完整保留。
  s = s.replace(new RegExp(`([${CJK_CLASS}${ALNUM_CLASS}]) (?=${CJK_RE_SRC})`, 'g'), '$1');
  s = s.replace(new RegExp(`(${CJK_RE_SRC}) (?=[${ALNUM_CLASS}])`, 'g'), '$1');
  return s.trim();
}

/**
 * 纯函数：二元组与一元组拆解。
 */
export function queryGrams(foldedQuery: string): { bigrams: string[]; unigrams: string[] } {
  const bigrams: string[] = [];
  const unigrams: string[] = [];
  const q = String(foldedQuery || '');

  for (let i = 0; i < q.length; i++) {
    const ch = q[i];
    if (ch !== ' ' && ch !== '\n' && !unigrams.includes(ch)) {
      unigrams.push(ch);
    }
    if (i + 1 < q.length) {
      const gram = q.slice(i, i + 2);
      if (gram.length === 2 && !gram.includes(' ') && !gram.includes('\n')) {
        bigrams.push(gram);
      }
    }
  }

  return { bigrams, unigrams };
}

/**
 * 纯函数：HTML 字符转义，防御 XSS。
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return c;
    }
  });
}

/**
 * 纯函数：安全高亮匹配字符。
 * 遵循 S26-1 site-search.mjs 设计：先在原始文本中寻找匹配区间，再对各段分别进行安全 HTML 转义，
 * 绝不在转义后的字符串上二次正则替换，从而杜绝破坏 <, >, &, ", ' 等 HTML 实体。
 */
export function highlightMatches(text: string, rawQuery: string): string {
  if (!text) return '';
  if (!rawQuery || !rawQuery.trim()) return escapeHtml(text);

  const rawTokens = rawQuery.trim().split(/\s+/).filter(Boolean);
  if (rawTokens.length === 0) return escapeHtml(text);

  // 优先匹配完整短语，再匹配各个独立词元（按长度降序排列避免子串抢占）
  const terms = Array.from(new Set([rawQuery.trim(), ...rawTokens]))
    .filter((t) => t.length > 0)
    .sort((a, b) => b.length - a.length);

  const escapedTerms = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const regex = new RegExp(`(${escapedTerms.join('|')})`, 'gi');

  let result = '';
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      result += escapeHtml(text.slice(lastIndex, match.index));
    }
    result += `<mark class="search-highlight">${escapeHtml(match[0])}</mark>`;
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    result += escapeHtml(text.slice(lastIndex));
  }

  return result;
}

export interface SearchHit<T = ExperimentRecipe> {
  recipe: T;
  score: number;
  titleMatches: boolean;
  tagMatches: string[];
  descMatches: boolean;
  codeMatches: boolean;
  highlightedTitle: string;
  highlightedDesc: string;
  highlightedCode: string;
}

export interface GallerySearchPluginOptions {
  debounceMs?: number;
}

export class GallerySearchPlugin implements OctavePlugin<GallerySearchPluginOptions> {
  readonly id = 'gallery-search';
  readonly name = 'Gallery Semantic & Fulltext Search Plugin';
  readonly version = '1.0.0';
  readonly description = 'High-precision CJK-aware fast search engine with ranking and keyboard navigation';
  enabled = true;
  options: GallerySearchPluginOptions;

  constructor(options: GallerySearchPluginOptions = {}) {
    this.options = {
      debounceMs: options.debounceMs ?? 120,
    };
  }

  /**
   * 纯函数：搜索画廊配方并计算加权评分。
   * 参考 S26-1 site-search.mjs 的多重判定：
   * 1. 当插件被禁用时，优雅降级返回原样列表。
   * 2. 支持独立词元切分与单项 CJK 折叠，保证如「正弦 谐波」多关键词能同时命中对应文档。
   * 3. 结合 Bigram 二元组做词元密度与位置加分，提升长文本与代码的检索精度。
   */
  searchRecipes<T extends ExperimentRecipe>(
    recipes: T[],
    rawQuery: string,
    tResolver: (key: string) => string
  ): SearchHit<T>[] {
    const makeFallbackHit = (recipe: T): SearchHit<T> => ({
      recipe,
      score: 0,
      titleMatches: false,
      tagMatches: [],
      descMatches: false,
      codeMatches: false,
      highlightedTitle: escapeHtml(tResolver(recipe.titleKey)),
      highlightedDesc: escapeHtml(tResolver(recipe.descKey)),
      highlightedCode: escapeHtml(recipe.code),
    });

    if (!this.enabled) {
      return recipes.map(makeFallbackHit);
    }

    const trimmed = (rawQuery ?? '').trim();
    if (!trimmed) {
      return recipes.map(makeFallbackHit);
    }

    // 1. 整体短语折叠（用于完整连续子串与短语匹配，如 "MATLAB 函数" → "matlab函数"）
    const foldedPhrase = foldSearchText(trimmed);

    // 2. 独立词元切分（按空白拆分后分别折叠，支持多关键词如「正弦 谐波」）
    const rawTokens = trimmed.split(/\s+/).filter(Boolean);
    const foldedTokens = Array.from(new Set(rawTokens.map((t) => foldSearchText(t)).filter(Boolean)));

    // 3. Grams 切分（提取 bigrams 与 unigrams，提升中西混排检索相关度）
    const { bigrams } = queryGrams(foldedPhrase);

    const hits: SearchHit<T>[] = [];

    for (const recipe of recipes) {
      const title = tResolver(recipe.titleKey);
      const desc = tResolver(recipe.descKey);
      const code = recipe.code;
      const tags = recipe.tags || [];

      const foldedTitle = foldSearchText(title);
      const foldedDesc = foldSearchText(desc);
      const foldedCode = foldSearchText(code);
      const foldedTags = tags.map((tg) => foldSearchText(tg));

      let score = 0;
      let titleMatches = false;
      let descMatches = false;
      let codeMatches = false;
      const matchedTags: string[] = [];

      // 整体短语完全/包含命中（参考 S26-1：标题完全命中权重最高）
      if (foldedTitle === foldedPhrase) {
        score += 1500;
        titleMatches = true;
      } else if (foldedTitle.includes(foldedPhrase)) {
        score += 800;
        titleMatches = true;
      }

      if (foldedDesc.includes(foldedPhrase)) {
        score += 250;
        descMatches = true;
      }

      if (foldedCode.includes(foldedPhrase)) {
        score += 200;
        codeMatches = true;
      }

      // 各独立词元匹配（解决 CJK 空格分隔多关键词检索）
      for (const token of foldedTokens) {
        if (foldedTitle.includes(token)) {
          score += 300;
          titleMatches = true;
        }

        for (let i = 0; i < foldedTags.length; i++) {
          if (foldedTags[i].includes(token)) {
            score += 200;
            if (!matchedTags.includes(tags[i])) {
              matchedTags.push(tags[i]);
            }
          }
        }

        if (foldedDesc.includes(token)) {
          score += 100;
          descMatches = true;
        }

        if (foldedCode.includes(token)) {
          score += 80;
          codeMatches = true;
        }

        if (recipe.category.toLowerCase().includes(token)) {
          score += 150;
        }
      }

      // 仅当标题、描述、代码、标签或分类确实命中时，才确认命中并计算相关度加权（杜绝孤立二元组误伤无关条目）
      const isMatched =
        titleMatches ||
        descMatches ||
        codeMatches ||
        matchedTags.length > 0 ||
        foldedTokens.some((t) => recipe.category.toLowerCase().includes(t));

      if (!isMatched) {
        continue;
      }

      // S26-1 风格 Bigrams 词元重叠加分（提升多字重叠度排序）
      if (bigrams.length > 0) {
        for (const bg of bigrams) {
          if (foldedTitle.includes(bg)) score += 40;
          if (foldedDesc.includes(bg)) score += 15;
          if (foldedCode.includes(bg)) score += 10;
        }
      }

      hits.push({
        recipe,
        score,
        titleMatches,
        tagMatches: matchedTags,
        descMatches,
        codeMatches,
        highlightedTitle: highlightMatches(title, trimmed),
        highlightedDesc: highlightMatches(desc, trimmed),
        highlightedCode: highlightMatches(code, trimmed),
      });
    }

    hits.sort((a, b) => b.score - a.score || a.recipe.id.localeCompare(b.recipe.id));
    return hits;
  }
}
