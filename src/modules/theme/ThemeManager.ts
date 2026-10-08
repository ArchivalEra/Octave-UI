// src/modules/theme/ThemeManager.ts
// 白根（Shirone）设计规范主题管理器与防闪烁内联脚本生成器

export type Theme = 'dark' | 'light' | 'auto';

export class ThemeManager {
  public static readonly STORAGE_KEY = 'octave_ui_theme';
  public static readonly HUE_STORAGE_KEY = 'theme-hue';
  public static readonly FONT_SIZE_STORAGE_KEY = 'theme-font-size';
  public static readonly DEFAULT_HUE = 248;
  public static readonly DEFAULT_FONT_SIZE = 14;

  private _theme: Theme = 'dark';
  private _hue: number = ThemeManager.DEFAULT_HUE;
  private _fontSize: number = ThemeManager.DEFAULT_FONT_SIZE;
  private _listeners: Set<(theme: Theme, hue: number, fontSize: number) => void> = new Set();

  constructor() {
    this.load();
  }

  get theme(): Theme {
    return this._theme;
  }

  get hue(): number {
    return this._hue;
  }

  get fontSize(): number {
    return this._fontSize;
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
      const savedTheme = storage.getItem(ThemeManager.STORAGE_KEY) as Theme;
      if (savedTheme === 'dark' || savedTheme === 'light' || savedTheme === 'auto') {
        this._theme = savedTheme;
      } else {
        this._theme = 'dark';
      }

      const savedHue = storage.getItem(ThemeManager.HUE_STORAGE_KEY);
      if (savedHue !== null && /^\d+$/.test(savedHue)) {
        this._hue = parseInt(savedHue, 10);
      } else {
        this._hue = ThemeManager.DEFAULT_HUE;
      }

      const savedFontSize = storage.getItem(ThemeManager.FONT_SIZE_STORAGE_KEY);
      if (savedFontSize !== null && /^\d+$/.test(savedFontSize)) {
        this._fontSize = Math.max(12, Math.min(22, parseInt(savedFontSize, 10)));
      } else {
        this._fontSize = ThemeManager.DEFAULT_FONT_SIZE;
      }
    } catch {
      this._theme = 'dark';
      this._hue = ThemeManager.DEFAULT_HUE;
      this._fontSize = ThemeManager.DEFAULT_FONT_SIZE;
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
    this._notify();
  }

  setHue(newHue: number): void {
    const hue = Math.max(0, Math.min(360, Math.round(newHue)));
    this._hue = hue;
    const storage = this._getStorage();
    if (storage) {
      try {
        storage.setItem(ThemeManager.HUE_STORAGE_KEY, String(hue));
      } catch {}
    }
    this.applyToDocument();
    this._notify();
  }

  resetHue(): void {
    this.setHue(ThemeManager.DEFAULT_HUE);
  }

  setFontSize(newSize: number): void {
    const size = Math.max(12, Math.min(22, Math.round(newSize)));
    this._fontSize = size;
    const storage = this._getStorage();
    if (storage) {
      try {
        storage.setItem(ThemeManager.FONT_SIZE_STORAGE_KEY, String(size));
      } catch {}
    }
    this.applyToDocument();
    this._notify();
  }

  resetFontSize(): void {
    this.setFontSize(ThemeManager.DEFAULT_FONT_SIZE);
  }

  private _notify(): void {
    for (const cb of this._listeners) {
      try { cb(this._theme, this._hue, this._fontSize); } catch {}
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
    root.style.setProperty('--hue', String(this._hue));
    root.style.setProperty('--primary-h', String(this._hue));
    root.style.setProperty('--base-font-size', `${this._fontSize}px`);
    root.style.fontSize = `${this._fontSize}px`;
  }

  subscribe(cb: (theme: Theme, hue: number, fontSize: number) => void): () => void {
    this._listeners.add(cb);
    cb(this._theme, this._hue, this._fontSize);
    return () => this._listeners.delete(cb);
  }

  /**
   * 生成必须放置在 <head> 最前方的防闪烁内联 JavaScript 代码（主题明暗、动态色相与字号缩放）
   */
  static getAntiFlashScript(): string {
    return `(function(){try{var r=document.documentElement;var s=localStorage.getItem('${ThemeManager.STORAGE_KEY}');var t=s==='light'||s==='dark'?s:(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');r.setAttribute('data-theme',t);var h=localStorage.getItem('${ThemeManager.HUE_STORAGE_KEY}');if(h!==null&&/^\\d+$/.test(h)){r.style.setProperty('--hue',h);r.style.setProperty('--primary-h',h);}var f=localStorage.getItem('${ThemeManager.FONT_SIZE_STORAGE_KEY}');if(f!==null&&/^\\d+$/.test(f)){r.style.setProperty('--base-font-size',f+'px');r.style.fontSize=f+'px';}}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`;
  }
}
