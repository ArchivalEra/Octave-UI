// tests/semantic/SemanticResultRenderer.test.ts
import { describe, it, expect } from 'vitest';
import { SemanticResultRenderer } from '../../src/modules/semantic/SemanticResultRenderer';
import { ErrorSanitizer } from '../../src/modules/semantic/ErrorSanitizer';
import { SafePlotSinkPolyfill } from '../../src/modules/semantic/SafePlotSinkPolyfill';
import { MockEmbedAdapter } from '../../src/modules/engine/MockEmbedAdapter';

describe('SemanticResultRenderer & ErrorSanitizer', () => {
  it('parses scalar numerical output', () => {
    const res = SemanticResultRenderer.parse('pi_est =\n   3.1416');
    expect(res.kind).toBe('scalar');
    if (res.kind === 'scalar') {
      expect(res.name).toBe('pi_est');
      expect(res.value).toBe(3.1416);
    }
  });

  it('parses 2D matrix output', () => {
    const raw = `M =

   4   1   2
   1   3   0
   2   0   5
`;
    const res = SemanticResultRenderer.parse(raw);
    expect(res.kind).toBe('matrix');
    if (res.kind === 'matrix') {
      expect(res.name).toBe('M');
      expect(res.rows).toBe(3);
      expect(res.cols).toBe(3);
      expect(res.values).toEqual([
        [4, 1, 2],
        [1, 3, 0],
        [2, 0, 5],
      ]);
    }
  });

  it('prioritizes plotData when available', () => {
    const plotData = { x: [0, 1, 2], y: [0, 1, 4], count: 3 };
    const res = SemanticResultRenderer.parse('some random stdout', {
      ok: true,
      plotData,
    });
    expect(res.kind).toBe('plot');
    if (res.kind === 'plot') {
      expect(res.data.count).toBe(3);
      expect(res.data.x).toEqual([0, 1, 2]);
    }
  });

  it('sanitizes singular matrix errors with actionable suggestions', () => {
    const raw = 'error: matrix singular to machine precision, rcond = 0';
    const sanitized = ErrorSanitizer.sanitize(raw);
    expect(sanitized.kind).toBe('singular_matrix');
    expect(sanitized.suggestion).toContain('pinv(A)');

    const res = SemanticResultRenderer.parse(raw, { ok: false, rc: 1 });
    expect(res.kind).toBe('sanitized_error');
    if (res.kind === 'sanitized_error') {
      expect(res.error.kind).toBe('singular_matrix');
    }
  });

  it('sanitizes undefined variable error', () => {
    const raw = "error: 'my_var' undefined near line 1, column 1";
    const sanitized = ErrorSanitizer.sanitize(raw);
    expect(sanitized.kind).toBe('undefined_variable');
    expect(sanitized.summary).toContain('my_var');
    expect(sanitized.suggestion).toContain('my_var');
  });

  it('sanitizes dimension mismatch error for operator *', () => {
    const raw = 'error: operator *: nonconformant arguments (op1 is 2x3, op2 is 2x3)';
    const sanitized = ErrorSanitizer.sanitize(raw);
    expect(sanitized.kind).toBe('dimension_mismatch');
    expect(sanitized.suggestion).toContain('.*');
  });

  it('accurately diagnoses operator / (mrdivide) with guidance for \\ and ./ in all locales', () => {
    const raw = 'eval 失败 rc=2 (Octave 错误文本走 on.output 通道) error: operator /: nonconformant arguments (op1 is 2x2, op2 is 2x1)';
    const sanitized = ErrorSanitizer.sanitize(raw);
    expect(sanitized.kind).toBe('dimension_mismatch');
    expect(sanitized.operator).toBe('/');
    expect(sanitized.suggestion).toContain('\\');
    expect(sanitized.suggestion).toContain('./');
    // Ensure bridge debug noise is stripped from raw
    expect(sanitized.raw).not.toContain('(Octave 错误文本走 on.output 通道)');
    expect(sanitized.raw).toContain('error: operator /: nonconformant arguments');

    // Test English formatting
    const enFmt = ErrorSanitizer.format(sanitized, 'en');
    expect(enFmt.summary).toContain('operator /');
    expect(enFmt.suggestion).toContain('left division A \\ b');
    expect(enFmt.suggestion).toContain('./');

    // Test German formatting
    const deFmt = ErrorSanitizer.format(sanitized, 'de');
    expect(deFmt.summary).toContain('Operator /');
    expect(deFmt.suggestion).toContain('Linksdivision A \\ b');
  });

  it('installs safe plot polyfill into virtual filesystem', () => {
    const adapter = new MockEmbedAdapter();
    const installed = SafePlotSinkPolyfill.install({
      fsWrite: (p, c) => adapter.fs.write(p, c),
    });
    expect(installed).toBe(true);
    const content = adapter.fs.read('/home/web_user/plot.m');
    expect(content).toContain('__octave_web_plot__');
  });
});
