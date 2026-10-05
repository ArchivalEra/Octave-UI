// src/modules/i18n/types.ts
// 国际化核心类型定义与占位符模板字面量推导
import type { en } from './locales/en';

export type Locale = 'en' | 'zh-Hans' | 'de';
export type CanonicalLocale = 'en';

export const SUPPORTED_LOCALES: readonly Locale[] = ['en', 'zh-Hans', 'de'] as const;
export const CANONICAL_LOCALE: CanonicalLocale = 'en';

export type EnDictionary = typeof en;
export type TranslationKey = keyof EnDictionary;

/**
 * 递归提取模板字符串字面量中所有形如 `{param}` 的占位符名称联合
 */
export type ExtractPlaceholders<S extends string> =
  S extends `${string}{${infer P}}${infer Rest}`
    ? P | ExtractPlaceholders<Rest>
    : never;

/**
 * 根据模板字符串字面量推导所需的参数对象类型
 * 若无占位符，则推导为 void | Record<string, string | number>（允许省略参数）
 */
export type ParamsOf<S extends string> =
  [ExtractPlaceholders<S>] extends [never]
    ? Record<string, string | number> | void
    : { [K in ExtractPlaceholders<S>]: string | number };

/**
 * 根据翻译 Key 推导其在权威英文字典中所需的参数字典
 */
export type KeyParams<K extends TranslationKey> = ParamsOf<EnDictionary[K]>;

/**
 * 任意语言字典契约：保证必须实现权威英文字典中的所有 Key
 */
export type LocaleDictionary = {
  readonly [K in TranslationKey]: string;
};

/**
 * 编译期静态占位符等价性校验器：
 * 保证目标语言字典中的每个 Key 包含的占位符集合与规范英文字典严格一致
 */
export type EnsureParity<T extends Record<TranslationKey, string>> = {
  [K in TranslationKey]: [ExtractPlaceholders<T[K]>] extends [ExtractPlaceholders<EnDictionary[K]>]
    ? [ExtractPlaceholders<EnDictionary[K]>] extends [ExtractPlaceholders<T[K]>]
      ? T[K]
      : `[i18n Parity Error] Key "${K}" placeholder mismatch. Expected {${ExtractPlaceholders<EnDictionary[K]>}}`
    : `[i18n Parity Error] Key "${K}" placeholder mismatch. Expected {${ExtractPlaceholders<EnDictionary[K]>}}`;
};

/**
 * 严格类型化的翻译函数签名
 */
export type TranslateFn = {
  <K extends TranslationKey>(
    key: K,
    ...args: [ExtractPlaceholders<EnDictionary[K]>] extends [never]
      ? [params?: Record<string, string | number>]
      : [params: KeyParams<K>]
  ): string;
  <S extends string>(
    key: S extends TranslationKey ? never : S,
    params?: Record<string, string | number>
  ): string;
};
