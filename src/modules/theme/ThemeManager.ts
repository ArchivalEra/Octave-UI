// src/modules/theme/ThemeManager.ts
// 白根（Shirone）设计规范主题管理器与防闪烁内联脚本生成器

export type Theme = 'dark' | 'light' | 'auto';

export class ThemeManager {
  public static readonly STORAGE_KEY = 'octave_ui_theme';
  private _theme: Theme = 'dark';
  private _listeners: Set<(theme: Theme) => void> = new Set();

  constructor() {
    this.load();
  }

  get theme(): Theme {
    return this._theme;
  }

  private _getStorage(): Storage | null {
    if (typeof window !== 'undefined') {
      try {
        return window.localStorage || null;
      } catch {
        return null;
      }
    }
    return null;
  }

  load(): void {
    const storage = this._getStorage();
    if (!storage) return;
    try {
      const saved = storage.getItem(ThemeManager.STORAGE_KEY) as Theme;
      if (saved === 'dark' || saved === 'light' || saved === 'auto') {
        this._theme = saved;
      } else {
        this._theme = 'dark';
      }
    } catch {
      this._theme = 'dark';
    }
  }

  setTheme(newTheme: Theme): void {
    this._theme = newTheme;
    const storage = this._getStorage();
    if (storage) {
      try {
        storage.setItem(ThemeManager.STORAGE_KEY, newTheme);
      } catch {}
    }
    this.applyToDocument();
    for (const cb of this._listeners) {
      cb(newTheme);
    }
  }

  applyToDocument(): void {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    let effective = this._theme;
    if (effective === 'auto') {
      effective = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    root.setAttribute('data-theme', effective);
  }

  subscribe(cb: (theme: Theme) => void): () => void {
    this._listeners.add(cb);
    cb(this._theme);
    return () => this._listeners.delete(cb);
  }

  /**
   * 生成必须放置在 <head> 最前方的防闪烁内联 JavaScript 代码
   */
  static getAntiFlashScript(): string {
    return `(function(){try{var s=localStorage.getItem('${ThemeManager.STORAGE_KEY}');var t=s==='light'||s==='dark'?s:(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`;
  }
}
