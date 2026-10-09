// tests/plugins/P5FigureOverlayPlugin.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { P5FigureOverlayPlugin } from '../../src/modules/plugins/figure/P5FigureOverlayPlugin';
import { PluginRegistry } from '../../src/modules/plugins/PluginRegistry';
import { SemanticResultRenderer } from '../../src/modules/semantic/SemanticResultRenderer';

describe('P5FigureOverlayPlugin', () => {
  let plugin: P5FigureOverlayPlugin;
  let registry: PluginRegistry;

  beforeEach(() => {
    plugin = new P5FigureOverlayPlugin();
    registry = new PluginRegistry();
  });

  afterEach(() => {
    plugin.destroy();
  });

  it('has correct plugin metadata and registers successfully', () => {
    expect(plugin.id).toBe('p5-figure-overlay');
    expect(plugin.enabled).toBe(true);

    registry.register(plugin);
    expect(registry.has('p5-figure-overlay')).toBe(true);
    expect(registry.get('p5-figure-overlay')).toBe(plugin);

    registry.disable('p5-figure-overlay');
    expect(plugin.enabled).toBe(false);
  });

  describe('prepareCode (auto drawnow flush)', () => {
    it('appends drawnow; to bare plot commands', () => {
      expect(plugin.prepareCode('plot(1:10);')).toBe('plot(1:10);\ndrawnow;');
      expect(plugin.prepareCode('plot(x, y)')).toBe('plot(x, y)\ndrawnow;');
      expect(plugin.prepareCode('surf(peaks)')).toBe('surf(peaks)\ndrawnow;');
      expect(plugin.prepareCode('figure(1); mesh(Z);')).toBe('figure(1); mesh(Z);\ndrawnow;');
      expect(plugin.prepareCode('contourf(X, Y, Z)')).toBe('contourf(X, Y, Z)\ndrawnow;');
    });

    it('does not append drawnow if drawnow is already present', () => {
      const code = 'plot(1:10); drawnow;';
      expect(plugin.prepareCode(code)).toBe(code);

      const codeWithNewline = 'plot(1:10);\ngrid on;\ndrawnow';
      expect(plugin.prepareCode(codeWithNewline)).toBe(codeWithNewline);
    });

    it('does not modify non-plot code', () => {
      expect(plugin.prepareCode('A = rand(10); b = inv(A);')).toBe('A = rand(10); b = inv(A);');
      expect(plugin.prepareCode('disp("hello world");')).toBe('disp("hello world");');
      expect(plugin.prepareCode('')).toBe('');
      expect(plugin.prepareCode('   ')).toBe('   ');
    });

    it('does not modify code when plugin is disabled', () => {
      plugin.enabled = false;
      expect(plugin.prepareCode('plot(1:10);')).toBe('plot(1:10);');
    });
  });

  describe('hook and figure capture', () => {
    it('captures figure event and notifies subscribers', () => {
      const listener = vi.fn();
      const unsub = plugin.subscribe(listener);

      plugin.captureFigure({
        path: '/tmp/p5_1.png',
        bytes: 12345,
        type: 'image/png',
        url: 'blob:http://localhost/fig-1',
        count: 1,
        timestamp: Date.now(),
      });

      expect(plugin.lastFigureCount).toBe(1);
      expect(plugin.lastFigure?.url).toBe('blob:http://localhost/fig-1');
      expect(listener).toHaveBeenCalledTimes(1);

      unsub();
      plugin.captureFigure({
        path: '/tmp/p5_2.png',
        bytes: 23456,
        type: 'image/png',
        url: 'blob:http://localhost/fig-2',
        count: 2,
        timestamp: Date.now(),
      });
      expect(plugin.lastFigureCount).toBe(2);
      expect(listener).toHaveBeenCalledTimes(1); // unsubscribed
    });

    it('integrates with SemanticResultRenderer to output figure_image kind', () => {
      const result = SemanticResultRenderer.parse('some output', {
        ok: true,
        rc: 0,
        figureImage: {
          url: 'blob:http://localhost/test-figure',
          bytes: 4096,
        },
      });

      expect(result.kind).toBe('figure_image');
      if (result.kind === 'figure_image') {
        expect(result.url).toBe('blob:http://localhost/test-figure');
        expect(result.bytes).toBe(4096);
      }
    });
  });
});
