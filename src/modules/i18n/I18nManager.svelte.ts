// src/modules/i18n/I18nManager.svelte.ts
// 国际化核心深模块：Svelte 5 响应式引擎、单一路标探测阶梯与安全插值
import type {
  Locale,
  TranslationKey,
  LocaleDictionary,
  KeyParams,
  ExtractPlaceholders,
  EnDictionary,
  TranslateFn,
} from './types';
import { SUPPORTED_LOCALES } from './types';
import { en } from './locales/en';
import { zhHans } from './locales/zh-Hans';
import { de } from './locales/de';

export function normalizeLocale(lang: string | null | undefined): Locale | null {
  if (!lang) return null;
  const lower = lang.trim().toLowerCase();
  if (lower === 'zh-hans' || lower === 'zh-cn' || lower === 'zh-sg' || lower === 'zh') {
    return 'zh-Hans';
  }
  if (lower.startsWith('zh')) {
    return 'zh-Hans';
  }
  if (lower.startsWith('de')) {
    return 'de';
  }
  if (lower.startsWith('en')) {
    return 'en';
  }
  return null;
}

export function detectInitialLocale(): Locale {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return 'en';
  }

  // 1. 第一顺位：检查 document.documentElement.lang（由 head 防闪烁脚本预先设置）
  const docLang = normalizeLocale(document.documentElement.lang);
  if (docLang) return docLang;

  // 2. 第二顺位：从 localStorage['octave_ui_locale'] 读取用户过往选择
  try {
    const saved = window.localStorage?.getItem(I18nManager.STORAGE_KEY);
    const savedLocale = normalizeLocale(saved);
    if (savedLocale) return savedLocale;
  } catch {}

  // 3. 第三顺位：按序遍历 navigator.languages 数组
  try {
    const langs =
      window.navigator?.languages ||
      (window.navigator?.language ? [window.navigator.language] : []);
    for (const l of langs) {
      const match = normalizeLocale(l);
      if (match) return match;
    }
  } catch {}

  // 4. 终极兜底：规范英语
  return 'en';
}

export class I18nManager {
  public static readonly STORAGE_KEY = 'octave_ui_locale';

  // Svelte 5 响应式状态：所有在模板中调用 t() 的组件自动获得跨 Island 响应式重渲染
  private _locale = $state<Locale>(detectInitialLocale());
  private _subscribers = new Set<(locale: Locale) => void>();
  private _numberFormatters = new Map<Locale, Intl.NumberFormat>();

  private readonly _dictionaries: Record<Locale, LocaleDictionary> = {
    en,
    'zh-Hans': zhHans,
    de,
  };

  get currentLocale(): Locale {
    return this._locale;
  }

  get locale(): Locale {
    return this._locale;
  }

  /**
   * 仅在用户显式触发切换操作时持久化到 localStorage
   */
  setLocale = (newLocale: Locale): void => {
    if (!SUPPORTED_LOCALES.includes(newLocale)) return;
    if (this._locale === newLocale) return;
    this._locale = newLocale;

    if (typeof window !== 'undefined') {
      try {
        window.localStorage?.setItem(I18nManager.STORAGE_KEY, newLocale);
      } catch {}
    }

    if (typeof document !== 'undefined') {
      document.documentElement.lang = newLocale;
      document.documentElement.setAttribute('data-locale', newLocale);
    }

    for (const cb of this._subscribers) {
      try {
        cb(newLocale);
      } catch {}
    }
  };

  /**
   * 基于本地语言环境格式化数字（O(1) 缓存复用）
   */
  formatNumber = (num: number, locale: Locale = this._locale): string => {
    let formatter = this._numberFormatters.get(locale);
    if (!formatter) {
      formatter = new Intl.NumberFormat(locale === 'zh-Hans' ? 'zh-CN' : locale);
      this._numberFormatters.set(locale, formatter);
    }
    return formatter.format(num);
  };

  /**
   * 纯函数翻译与多级降级：
   * locale 字典 -> canonical en 字典 -> key 文本本身
   * 采用函数替换器进行参数插值，免疫 $& / $1 等正则注入
   */
  translate = (
    locale: Locale,
    key: string,
    params?: Record<string, string | number>
  ): string => {
    const dict = this._dictionaries[locale];
    let text = dict ? dict[key as TranslationKey] : undefined;

    // 1. 若当前语言缺失，回退到规范英文
    if (text === undefined && locale !== 'en') {
      text = this._dictionaries.en[key as TranslationKey];
    }

    // 2. 若英文亦缺失，回退到 Key 本身（永不抛异常或返回空串）
    if (text === undefined) {
      text = String(key ?? '');
    }

    if (!params) {
      return text;
    }

    return text.replace(/\{(\w+)\}/g, (match, k) => {
      if (Object.prototype.hasOwnProperty.call(params, k)) {
        const val = params[k];
        if (typeof val === 'number') {
          return this.formatNumber(val, locale);
        }
        return val !== undefined && val !== null ? String(val) : match;
      }
      return match;
    });
  };

  /**
   * 响应式绑定的独立翻译函数（实现严格重载契约与动态降级）
   */
  t: TranslateFn = ((
    key: string,
    params?: Record<string, string | number>
  ): string => {
    const current = this._locale;
    return this.translate(current, key, params);
  }) as TranslateFn;

  /**
   * 供非 Svelte 纯 TS 订阅者监听语言变化
   */
  subscribe = (cb: (locale: Locale) => void): (() => void) => {
    this._subscribers.add(cb);
    cb(this._locale);
    return () => {
      this._subscribers.delete(cb);
    };
  };

  /**
   * 重新从环境中检测语言（供测试或特殊场景重置）
   */
  resetFromEnvironment = (): void => {
    this._locale = detectInitialLocale();
    if (typeof document !== 'undefined') {
      document.documentElement.lang = this._locale;
      document.documentElement.setAttribute('data-locale', this._locale);
    }
    for (const cb of this._subscribers) {
      try {
        cb(this._locale);
      } catch {}
    }
  };

  /**
   * 生成必须放置在 <head> 最前方的防闪烁内联 JavaScript 代码
   */
  static getAntiFlashScript(): string {
    return `(function(){try{var s=localStorage.getItem('${I18nManager.STORAGE_KEY}');var l=['en','zh-Hans','de'];var r='';if(s&&l.indexOf(s)!==-1){r=s;}else{var langs=navigator.languages||(navigator.language?[navigator.language]:[]);for(var i=0;i<langs.length;i++){var n=(langs[i]||'').toLowerCase();if(n.indexOf('zh')===0){r='zh-Hans';break;}if(n.indexOf('de')===0){r='de';break;}if(n.indexOf('en')===0){r='en';break;}}}if(!r)r='en';document.documentElement.lang=r;document.documentElement.setAttribute('data-locale',r);}catch(e){document.documentElement.lang='en';document.documentElement.setAttribute('data-locale','en');}})();`;
  }
}

export const i18n = new I18nManager();
export const t = i18n.t;
