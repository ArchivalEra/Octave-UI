// tests/figure/FigureBoundary.test.ts
import { describe, it, expect } from 'vitest';
import { FigureBoundary } from '../../src/modules/figure/FigureBoundary';

describe('FigureBoundary Deep Module (E6 GL Safety Barrier)', () => {
  it('blocks known GL crash drawing commands', () => {
    const dangerousCommands = [
      'plot(1:10)',
      'plot3(x, y, z)',
      'mesh(peaks())',
      'surf(X, Y, Z)',
      'contour(peaks())',
      'bar([1, 2, 3])',
      'hist(randn(100, 1))',
      'scatter(x, y)',
      'figure',
      'figure(1)',
      'drawnow',
      'imagesc(rand(10))',
      'polarplot(theta, rho)',
      'subplot(2, 1, 1)',
      'fplot(@sin, [-5, 5])',
      'ezplot("x^2")',
      'surfc(peaks())',
      'meshc(peaks())',
    ];

    for (const cmd of dangerousCommands) {
      const res = FigureBoundary.intercept(cmd);
      expect(res.blocked).toBe(true);
      expect(res.reason).toContain('E6 GL 边界');
    }
  });

  it('safely passes normal mathematical and computational commands', () => {
    const safeCommands = [
      'A = magic(4);',
      'b = svd(A);',
      'inv(A) * b;',
      'x = [1, 2, 3];',
      'disp("hello octave");',
      'whos()',
      'plot_variable = 42;', // 变量名带 plot 但不是函数调用
      'my_drawnow_flag = true;',
    ];

    for (const cmd of safeCommands) {
      const res = FigureBoundary.intercept(cmd);
      expect(res.blocked).toBe(false);
      expect(res.reason).toBeUndefined();
    }
  });

  it('allows user override when allowOverride is true', () => {
    const res = FigureBoundary.intercept('plot(x, y)', true);
    expect(res.blocked).toBe(false);
  });
});
