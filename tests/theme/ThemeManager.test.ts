// tests/theme/ThemeManager.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { ThemeManager } from '../../src/modules/theme/ThemeManager';

describe('ThemeManager Deep Module', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('defaults to dark theme when no storage preference exists', () => {
    const manager = new ThemeManager();
    expect(manager.theme).toBe('dark');
  });

  it('updates theme and sets data-theme attribute on document', () => {
    const manager = new ThemeManager();
    manager.setTheme('light');

    expect(manager.theme).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(window.localStorage.getItem(ThemeManager.STORAGE_KEY)).toBe('light');
  });

  it('generates a valid anti-flash script snippet for head', () => {
    const script = ThemeManager.getAntiFlashScript();
    expect(typeof script).toBe('string');
    expect(script).toContain(ThemeManager.STORAGE_KEY);
    expect(script).toContain('data-theme');
    expect(script).toContain(ThemeManager.FONT_SIZE_STORAGE_KEY);
    expect(script).toContain('--base-font-size');
  });

  it('manages font size, clamps within 12-22px range and updates styles and storage', () => {
    const manager = new ThemeManager();
    expect(manager.fontSize).toBe(14);

    manager.setFontSize(18);
    expect(manager.fontSize).toBe(18);
    expect(window.localStorage.getItem(ThemeManager.FONT_SIZE_STORAGE_KEY)).toBe('18');
    expect(document.documentElement.style.fontSize).toBe('18px');
    expect(document.documentElement.style.getPropertyValue('--base-font-size')).toBe('18px');

    // Clamps below 12
    manager.setFontSize(8);
    expect(manager.fontSize).toBe(12);

    // Clamps above 22
    manager.setFontSize(30);
    expect(manager.fontSize).toBe(22);

    // Reset
    manager.resetFontSize();
    expect(manager.fontSize).toBe(14);
  });
});
