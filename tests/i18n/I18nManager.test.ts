import { describe, it, expect, beforeEach, vi } from 'vitest';
import { I18nManager, normalizeLocale, detectInitialLocale } from '../../src/modules/i18n/I18nManager.svelte';
import { observeI18nReactivity } from './reactivityHelper.svelte';
import { en } from '../../src/modules/i18n/locales/en';
import { zhHans } from '../../src/modules/i18n/locales/zh-Hans';
import { de } from '../../src/modules/i18n/locales/de';
import type { Locale, TranslationKey, EnsureParity } from '../../src/modules/i18n/types';

describe('I18nManager Deep Module', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.lang = '';
    document.documentElement.removeAttribute('data-locale');
  });

  describe('Locale Normalization & Detection Ladder', () => {
    it('normalizes common language tags properly', () => {
      expect(normalizeLocale('zh-CN')).toBe('zh-Hans');
      expect(normalizeLocale('zh-Hans')).toBe('zh-Hans');
      expect(normalizeLocale('zh-TW')).toBe('zh-Hans');
      expect(normalizeLocale('zh')).toBe('zh-Hans');

      expect(normalizeLocale('de-DE')).toBe('de');
      expect(normalizeLocale('de-AT')).toBe('de');
      expect(normalizeLocale('de')).toBe('de');

      expect(normalizeLocale('en-US')).toBe('en');
      expect(normalizeLocale('en-GB')).toBe('en');
      expect(normalizeLocale('en')).toBe('en');

      expect(normalizeLocale('fr')).toBeNull();
      expect(normalizeLocale('')).toBeNull();
      expect(normalizeLocale(null)).toBeNull();
      expect(normalizeLocale(undefined)).toBeNull();
    });

    it('step 1: resolves locale from document.documentElement.lang', () => {
      document.documentElement.lang = 'zh-Hans';
      window.localStorage.setItem(I18nManager.STORAGE_KEY, 'de'); // Should be shadowed by step 1
      expect(detectInitialLocale()).toBe('zh-Hans');
    });

    it('step 2: falls back to localStorage when document.documentElement.lang is unset', () => {
      document.documentElement.lang = '';
      window.localStorage.setItem(I18nManager.STORAGE_KEY, 'de');
      expect(detectInitialLocale()).toBe('de');
    });

    it('step 3: falls back to navigator.languages when document and storage are unset', () => {
      document.documentElement.lang = '';
      window.localStorage.clear();

      const originalNav = window.navigator;
      Object.defineProperty(window, 'navigator', {
        value: { languages: ['zh-CN', 'en-US'], language: 'zh-CN' },
        configurable: true,
      });

      expect(detectInitialLocale()).toBe('zh-Hans');

      // Restore navigator
      Object.defineProperty(window, 'navigator', {
        value: originalNav,
        configurable: true,
      });
    });

    it('step 4: falls back to canonical default "en" when all detectors fail', () => {
      document.documentElement.lang = '';
      window.localStorage.clear();

      const originalNav = window.navigator;
      Object.defineProperty(window, 'navigator', {
        value: { languages: ['ja', 'ko', 'es'], language: 'ja' },
        configurable: true,
      });

      expect(detectInitialLocale()).toBe('en');

      Object.defineProperty(window, 'navigator', {
        value: originalNav,
        configurable: true,
      });
    });

    it('does NOT write to localStorage during auto-detection', () => {
      document.documentElement.lang = '';
      window.localStorage.clear();
      detectInitialLocale();
      expect(window.localStorage.getItem(I18nManager.STORAGE_KEY)).toBeNull();
    });
  });

  describe('Explicit Persistence & Document Synchronization', () => {
    it('persists only when setLocale is explicitly called', () => {
      const manager = new I18nManager();
      expect(window.localStorage.getItem(I18nManager.STORAGE_KEY)).toBeNull();

      manager.setLocale('de');
      expect(manager.currentLocale).toBe('de');
      expect(window.localStorage.getItem(I18nManager.STORAGE_KEY)).toBe('de');
      expect(document.documentElement.lang).toBe('de');
      expect(document.documentElement.getAttribute('data-locale')).toBe('de');
    });

    it('ignores setLocale if setting the same locale', () => {
      const manager = new I18nManager();
      manager.setLocale('zh-Hans');

      const spy = vi.spyOn(window.localStorage, 'setItem');
      manager.setLocale('zh-Hans');
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  describe('Safe Interpolation & Number Formatting', () => {
    it('interpolates named parameters correctly', () => {
      const manager = new I18nManager();
      manager.setLocale('en');

      const result = manager.t('terminal.banner_crashed', { cause: 'sigsegv' });
      expect(result).toContain('(cause: sigsegv)');
    });

    it('is immune to regex injection tokens like $&, $1, $` in parameter values', () => {
      const manager = new I18nManager();
      manager.setLocale('en');

      const maliciousParam = '$& and $1 and $` and $\' and $$';
      const result = manager.t('terminal.banner_crashed', { cause: maliciousParam });

      // Verbatim replacement without regex corruption
      expect(result).toContain(`(cause: ${maliciousParam})`);
    });

    it('preserves unprovided placeholders intact', () => {
      const manager = new I18nManager();
      manager.setLocale('en');

      // @ts-expect-error test unprovided parameter
      const result = manager.t('terminal.banner_crashed', {});
      expect(result).toContain('{cause}');
    });

    it('formats numbers with Intl.NumberFormat according to active locale', () => {
      const manager = new I18nManager();

      expect(manager.formatNumber(1234567, 'en')).toBe('1,234,567');
      // German uses period as thousands separator and comma for decimals
      expect(manager.formatNumber(1234567, 'de')).toBe('1.234.567');
      expect(manager.formatNumber(0, 'en')).toBe('0');
      expect(manager.formatNumber(-9876, 'de')).toBe('-9.876');

      // Interpolation also respects number formatting
      manager.setLocale('de');
      const germanCount = manager.t('workspace.title', { count: 1234 });
      expect(germanCount).toBe('Variablen (1.234)');

      manager.setLocale('en');
      const englishCount = manager.t('workspace.title', { count: 1234 });
      expect(englishCount).toBe('Variables (1,234)');
    });
  });

  describe('Fallback Hierarchy (Last Fallback Rung)', () => {
    it('translates successfully when key is in active locale', () => {
      const manager = new I18nManager();
      manager.setLocale('zh-Hans');
      expect(manager.t('status.idle')).toBe('就绪 (Idle)');

      manager.setLocale('de');
      expect(manager.t('status.idle')).toBe('Bereit (Leerlauf)');

      manager.setLocale('en');
      expect(manager.t('status.idle')).toBe('Ready (Idle)');
    });

    it('falls back to canonical English when key is missing in active locale', () => {
      const manager = new I18nManager();
      // Test missing key in German dictionary
      const customKey = 'some.key.only.in.en';
      (en as any)[customKey] = 'English Fallback Value';

      try {
        manager.setLocale('de');
        expect(manager.t(customKey)).toBe('English Fallback Value');
      } finally {
        delete (en as any)[customKey];
      }
    });

    it('falls back to key itself when key is missing everywhere (never throws or returns empty)', () => {
      const manager = new I18nManager();
      manager.setLocale('de');
      const missingKey = 'non.existent.random.key';
      expect(manager.t(missingKey)).toBe(missingKey);
    });

    it('interpolates parameters even when falling back to dynamic key string', () => {
      const manager = new I18nManager();
      manager.setLocale('en');
      const dynamicKey = 'Hello {name}!';
      expect(manager.t(dynamicKey, { name: 'Octave' })).toBe('Hello Octave!');
    });

    it('gracefully handles nullish keys without throwing', () => {
      const manager = new I18nManager();
      expect(manager.t(null as any)).toBe('');
      expect(manager.t(undefined as any)).toBe('');
    });

    it('rejects unsupported locales in setLocale without corrupting state', () => {
      const manager = new I18nManager();
      manager.setLocale('en');
      manager.setLocale('fr' as any);
      expect(manager.currentLocale).toBe('en');
    });
  });

  describe('Subscribers & Reactivity', () => {
    it('notifies subscribers on locale change and allows unsubscribing', () => {
      const manager = new I18nManager();
      manager.setLocale('en');

      const received: Locale[] = [];
      const unsub = manager.subscribe((loc) => {
        received.push(loc);
      });

      expect(received).toEqual(['en']);

      manager.setLocale('zh-Hans');
      expect(received).toEqual(['en', 'zh-Hans']);

      unsub();
      manager.setLocale('de');
      // No more notifications after unsubscribe
      expect(received).toEqual(['en', 'zh-Hans']);
    });

    it('bound standalone t function dynamically reflects current locale', () => {
      const manager = new I18nManager();
      const boundT = manager.t;

      manager.setLocale('en');
      expect(boundT('action.boot')).toBe('Boot Engine');

      manager.setLocale('zh-Hans');
      expect(boundT('action.boot')).toBe('启动引擎 (Boot)');

      manager.setLocale('de');
      expect(boundT('action.boot')).toBe('Engine starten');
    });

    it('Svelte 5 $effect reactively re-evaluates when setLocale is called', async () => {
      const manager = new I18nManager();
      manager.setLocale('en');

      const observer = observeI18nReactivity(manager);
      await observer.tick();
      expect(observer.text).toBe('Boot Engine');

      manager.setLocale('zh-Hans');
      await observer.tick();
      expect(observer.text).toBe('启动引擎 (Boot)');

      manager.setLocale('de');
      await observer.tick();
      expect(observer.text).toBe('Engine starten');

      observer.cleanup();
    });
  });

  describe('Anti-Flash Script', () => {
    it('generates a valid, self-contained anti-flash snippet', () => {
      const script = I18nManager.getAntiFlashScript();
      expect(typeof script).toBe('string');
      expect(script).toContain(I18nManager.STORAGE_KEY);
      expect(script).toContain('document.documentElement.lang');
      expect(script).toContain('data-locale');
      expect(script).toContain('zh-Hans');
      expect(script).toContain('de');
    });
  });

  describe('Dictionary Parity & Placeholder Integrity (3-Way Check)', () => {
    const enKeys = Object.keys(en).sort();
    const zhKeys = Object.keys(zhHans).sort();
    const deKeys = Object.keys(de).sort();

    it('all keys in en exist in zh-Hans and no extra keys exist', () => {
      expect(zhKeys).toEqual(enKeys);
    });

    it('all keys in en exist in de and no extra keys exist', () => {
      expect(deKeys).toEqual(enKeys);
    });

    function extractPlaceholders(str: string): string[] {
      const matches = str.match(/\{(\w+)\}/g) || [];
      return matches.map((m) => m.slice(1, -1)).sort();
    }

    it('all placeholders match 100% across en, zh-Hans, and de for every key', () => {
      for (const key of enKeys) {
        const enPlaceholders = extractPlaceholders((en as any)[key]);
        const zhPlaceholders = extractPlaceholders((zhHans as any)[key]);
        const dePlaceholders = extractPlaceholders((de as any)[key]);

        expect(
          zhPlaceholders,
          `Placeholder mismatch in zh-Hans for key "${key}": expected ${JSON.stringify(enPlaceholders)}, got ${JSON.stringify(zhPlaceholders)}`
        ).toEqual(enPlaceholders);

        expect(
          dePlaceholders,
          `Placeholder mismatch in de for key "${key}": expected ${JSON.stringify(enPlaceholders)}, got ${JSON.stringify(dePlaceholders)}`
        ).toEqual(enPlaceholders);
      }
    });

    it('EnsureParity type produces descriptive error on placeholder mismatch', () => {
      type BadDict = {
        [K in TranslationKey]: string;
      } & {
        'terminal.banner_crashed': 'Wrong {wrong_cause}';
      };
      type Check = EnsureParity<BadDict>;
      type ErrorType = Check['terminal.banner_crashed'];
      type MatchesError = ErrorType extends `[i18n Parity Error]${string}` ? true : false;
      const isError: MatchesError = true;
      expect(isError).toBe(true);
    });
  });
});
