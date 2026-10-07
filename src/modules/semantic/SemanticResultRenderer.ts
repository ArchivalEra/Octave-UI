// src/modules/semantic/SemanticResultRenderer.ts
// 语义化结果分流渲染解析器：将原始输出与数据通道分流解析为 Plot、Matrix、Scalar、SanitizedError 或 Stream

import type { PlotData } from './SafePlotSinkPolyfill';
import type { SanitizedError } from './ErrorSanitizer';
import { ErrorSanitizer } from './ErrorSanitizer';

export type SemanticResultKind = 'plot' | 'matrix' | 'scalar' | 'sanitized_error' | 'stream';

export interface PlotSemanticResult {
  kind: 'plot';
  data: PlotData;
  title?: string;
}

export interface MatrixSemanticResult {
  kind: 'matrix';
  name?: string;
  rows: number;
  cols: number;
  values: (number | string)[][];
}

export interface ScalarSemanticResult {
  kind: 'scalar';
  name?: string;
  value: number | string;
}

export interface ErrorSemanticResult {
  kind: 'sanitized_error';
  error: SanitizedError;
}

export interface StreamSemanticResult {
  kind: 'stream';
  text: string;
}

export type SemanticResult =
  | PlotSemanticResult
  | MatrixSemanticResult
  | ScalarSemanticResult
  | ErrorSemanticResult
  | StreamSemanticResult;

export class SemanticResultRenderer {
  /**
   * 解析输出文本并结合上下文数据决定最终呈现类型
   */
  static parse(
    output: string,
    options?: {
      ok?: boolean;
      rc?: number;
      plotData?: PlotData | null;
    }
  ): SemanticResult {
    const isOk = options?.ok !== false && (options?.rc === undefined || options?.rc === 0);

    // 1. 错误通道拦截
    if (!isOk || /error:/i.test(output)) {
      const sanitized = ErrorSanitizer.sanitize(output);
      return {
        kind: 'sanitized_error',
        error: sanitized,
      };
    }

    // 2. 绘图数据优先
    if (options?.plotData && options.plotData.count > 0) {
      return {
        kind: 'plot',
        data: options.plotData,
      };
    }

    if (output.includes('[OCTAVE_WEB_PLOT:') && options?.plotData) {
      return {
        kind: 'plot',
        data: options.plotData,
      };
    }

    const trimmed = output.trim();
    if (!trimmed) {
      return { kind: 'stream', text: '' };
    }

    // 3. 二维数值矩阵与向量模式识别
    const matrixParsed = this.tryParseMatrix(trimmed);
    if (matrixParsed) {
      if (matrixParsed.rows === 1 && matrixParsed.cols === 1) {
        return {
          kind: 'scalar',
          name: matrixParsed.name,
          value: matrixParsed.values[0][0],
        };
      }
      return matrixParsed;
    }

    // 4. 纯单行标量数字识别 (e.g. "ans = 42" 或 "pi_est = 3.1416")
    const scalarMatch = /^([a-zA-Z_][a-zA-Z0-9_]*)[ \t]*=[ \t]*([-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?)$/m.exec(
      trimmed
    );
    if (scalarMatch) {
      const num = parseFloat(scalarMatch[2]);
      if (!isNaN(num)) {
        return {
          kind: 'scalar',
          name: scalarMatch[1],
          value: num,
        };
      }
    }

    // 5. 默认回退为文本流
    return {
      kind: 'stream',
      text: output,
    };
  }

  private static tryParseMatrix(text: string): MatrixSemanticResult | null {
    // 匹配 "name =\n\n   1   2\n   3   4"
    const headerMatch = /^([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*\n/m.exec(text);
    const varName = headerMatch ? headerMatch[1] : undefined;
    const body = headerMatch ? text.slice(headerMatch[0].length).trim() : text.trim();

    const lines = body
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('Columns'));

    if (lines.length === 0) return null;

    const grid: number[][] = [];
    for (const line of lines) {
      const tokens = line.split(/\s+/);
      const rowNums: number[] = [];
      for (const tok of tokens) {
        const val = Number(tok);
        if (isNaN(val)) {
          return null; // 非纯数值矩阵，放弃解析
        }
        rowNums.push(val);
      }
      grid.push(rowNums);
    }

    // 校验各行长度是否一致
    const cols = grid[0].length;
    if (cols === 0) return null;
    for (const row of grid) {
      if (row.length !== cols) return null;
    }

    // 至少为 2x2 或 1xN/Nx1 向量
    return {
      kind: 'matrix',
      name: varName,
      rows: grid.length,
      cols,
      values: grid,
    };
  }
}
