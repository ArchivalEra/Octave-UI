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
  });
});
