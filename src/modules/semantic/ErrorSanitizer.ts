// src/modules/semantic/ErrorSanitizer.ts
// 错误净化器：拦截 Octave POSIX 错误通道 (eval 失败 rc=2 / on.output 混合流)，
// 屏蔽底层内核噪音，转化为具有指导意义的自然语言建议并支持响应式多语言渲染。

import type { Locale } from '../i18n/types';

export type ErrorCategory =
  | 'syntax'
  | 'undefined_variable'
  | 'dimension_mismatch'
  | 'singular_matrix'
  | 'unknown';

export interface SanitizedError {
  raw: string;
  kind: ErrorCategory;
  summary: string;
  suggestion?: string;
  userFriendlyText: string;
  operator?: string;
  op1?: string;
  op2?: string;
  identifier?: string;
}

export class ErrorSanitizer {
  private static readonly ANSI_REGEX = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;
  private static readonly BRIDGE_NOISE_REGEX = /eval\s*失败\s*rc=\d+.*?（.*?）\s*/gi;
  private static readonly BRIDGE_NOISE_PAREN = /\(Octave\s*错误文本走\s*on\.output\s*通道\)\s*/gi;

  static cleanRaw(rawError: string): string {
    return rawError
      .replace(this.ANSI_REGEX, '')
      .replace(this.BRIDGE_NOISE_REGEX, '')
      .replace(this.BRIDGE_NOISE_PAREN, '')
      .replace(/eval\s*失败\s*rc=\d+\s*/gi, '')
      .trim();
  }

  static sanitize(rawError: string, locale: Locale = 'zh-Hans'): SanitizedError {
    const clean = this.cleanRaw(rawError);

    // 1. 奇异矩阵 / 机器精度问题 (Singular matrix)
    if (
      /matrix singular|singular to machine precision|rcond\s*=/i.test(clean) ||
      /奇异矩阵/i.test(clean) ||
      /singuläre matrix/i.test(clean)
    ) {
      const err: SanitizedError = {
        raw: clean,
        kind: 'singular_matrix',
        summary: '',
        userFriendlyText: '',
      };
      const formatted = this.format(err, locale);
      err.summary = formatted.summary;
      err.suggestion = formatted.suggestion;
      err.userFriendlyText = formatted.summary;
      return err;
    }

    // 2. 未定义变量或函数 (Undefined variable / function)
    const undefMatch =
      /'([a-zA-Z_][a-zA-Z0-9_]*)'\s*undefined/i.exec(clean) ||
      /undefined symbol\s*'([a-zA-Z_][a-zA-Z0-9_]*)'/i.exec(clean) ||
      /变量或函数\s*'([a-zA-Z_][a-zA-Z0-9_]*)'\s*未定义/i.exec(clean) ||
      /'([a-zA-Z_][a-zA-Z0-9_]*)'\s*nicht definiert/i.exec(clean);

    if (undefMatch) {
      const varName = undefMatch[1];
      const err: SanitizedError = {
        raw: clean,
        kind: 'undefined_variable',
        identifier: varName,
        summary: '',
        userFriendlyText: '',
      };
      const formatted = this.format(err, locale);
      err.summary = formatted.summary;
      err.suggestion = formatted.suggestion;
      err.userFriendlyText = formatted.summary;
      return err;
    }

    // 3. 维度不匹配 (Nonconformant arguments / Dimension mismatch)
    if (
      /nonconformant arguments|dimension mismatch/i.test(clean) ||
      /operator.*nonconformant/i.test(clean) ||
      /维度不匹配/i.test(clean) ||
      /nicht übereinstimmende dimensionen/i.test(clean)
    ) {
      // 提取操作符与操作数尺寸: error: operator /: nonconformant arguments (op1 is 2x2, op2 is 2x1)
      let operator: string | undefined;
      let op1: string | undefined;
      let op2: string | undefined;

      const opMatch = /operator\s*([+\-*/\\^]|(?:\.\*)|(?:\.\/)|(?:\.\^)):\s*nonconformant arguments/i.exec(clean);
      if (opMatch) {
        operator = opMatch[1];
      }
      const sizeMatch = /\(op1 is ([^,]+),\s*op2 is ([^)]+)\)/i.exec(clean);
      if (sizeMatch) {
        op1 = sizeMatch[1].trim();
        op2 = sizeMatch[2].trim();
      }

      const err: SanitizedError = {
        raw: clean,
        kind: 'dimension_mismatch',
        operator,
        op1,
        op2,
        summary: '',
        userFriendlyText: '',
      };
      const formatted = this.format(err, locale);
      err.summary = formatted.summary;
      err.suggestion = formatted.suggestion;
      err.userFriendlyText = formatted.summary;
      return err;
    }

    // 4. 语法 / 解析错误 (Parse error / Syntax error)
    if (
      /parse error|syntax error/i.test(clean) ||
      /语法错误/i.test(clean) ||
      /syntaxfehler/i.test(clean)
    ) {
      const err: SanitizedError = {
        raw: clean,
        kind: 'syntax',
        summary: '',
        userFriendlyText: '',
      };
      const formatted = this.format(err, locale);
      err.summary = formatted.summary;
      err.suggestion = formatted.suggestion;
      err.userFriendlyText = formatted.summary;
      return err;
    }

    // 5. 默认未知错误（提取主要提示信息）
    const firstLine = clean.split('\n')[0] || '执行发生错误';
    const err: SanitizedError = {
      raw: clean,
      kind: 'unknown',
      summary: firstLine,
      userFriendlyText: firstLine,
    };
    const formatted = this.format(err, locale);
    err.summary = formatted.summary;
    return err;
  }

  static format(
    error: SanitizedError,
    locale: Locale = 'zh-Hans'
  ): { summary: string; suggestion?: string; badge: string } {
    switch (error.kind) {
      case 'singular_matrix':
        if (locale === 'en') {
          return {
            badge: 'SINGULAR_MATRIX',
            summary: 'Matrix is singular or close to singular (cannot compute exact inverse).',
            suggestion: 'Consider using pinv(A) for least-squares approximation, or check if matrix A is full rank.',
          };
        }
        if (locale === 'de') {
          return {
            badge: 'SINGULAR_MATRIX',
            summary: 'Matrix ist singulär oder nahezu singulär (Inverse nicht berechenbar).',
            suggestion: 'Nutzen Sie pinv(A) für kleinste Quadrate oder prüfen Sie den Rang der Matrix.',
          };
        }
        return {
          badge: 'SINGULAR_MATRIX',
          summary: '矩阵接近奇异（行列式为 0 或条件数过差），无法直接求精确逆。',
          suggestion: '建议使用伪逆 pinv(A) 进行最小二乘求解，或检查系数矩阵 A 是否满秩。',
        };

      case 'undefined_variable': {
        const v = error.identifier || 'x';
        if (locale === 'en') {
          return {
            badge: 'UNDEFINED_VARIABLE',
            summary: `Variable or function '${v}' is undefined.`,
            suggestion: `Check the spelling or assign a value before using it (e.g. ${v} = ...).`,
          };
        }
        if (locale === 'de') {
          return {
            badge: 'UNDEFINED_VARIABLE',
            summary: `Variable oder Funktion '${v}' ist nicht definiert.`,
            suggestion: `Prüfen Sie die Schreibweise oder weisen Sie vorab einen Wert zu (${v} = ...).`,
          };
        }
        return {
          badge: 'UNDEFINED_VARIABLE',
          summary: `变量或函数 '${v}' 尚未定义。`,
          suggestion: `请检查拼写是否正确，或在使用之前先为其赋值（如 ${v} = ...）。`,
        };
      }

      case 'dimension_mismatch': {
        const op = error.operator;
        if (op === '/') {
          if (locale === 'en') {
            return {
              badge: 'DIMENSION_MISMATCH',
              summary: 'Incompatible dimensions for operator / (matrix right division).',
              suggestion: 'Operator / is matrix right division (solves X*b = A). To solve linear system A*x = b, use left division A \\ b; for element-wise division, use ./.',
            };
          }
          if (locale === 'de') {
            return {
              badge: 'DIMENSION_MISMATCH',
              summary: 'Inkompatible Dimensionen für Operator / (Matrix-Rechtsdivision).',
              suggestion: 'Operator / steht für Matrix-Rechtsdivision (X*b = A). Zum Lösen von A*x = b nutzen Sie Linksdivision A \\ b; für elementweise Division ./.',
            };
          }
          return {
            badge: 'DIMENSION_MISMATCH',
            summary: '矩阵右除维度不兼容（操作符 /）。',
            suggestion: '操作符 / 为矩阵右除 (求解 X*b = A)。若要求解线性方程组 A*x = b，请使用左除运算符 A \\ b；若要逐元素相除，请使用点除运算符 ./。',
          };
        }

        if (op === '\\') {
          if (locale === 'en') {
            return {
              badge: 'DIMENSION_MISMATCH',
              summary: 'Incompatible dimensions for operator \\ (matrix left division).',
              suggestion: 'Solving A \\ b requires rows of A to match rows of vector b. Please check operand dimensions.',
            };
          }
          if (locale === 'de') {
            return {
              badge: 'DIMENSION_MISMATCH',
              summary: 'Inkompatible Dimensionen für Operator \\ (Matrix-Linksdivision).',
              suggestion: 'Das Lösen von A \\ b erfordert übereinstimmende Zeilen von A und b. Dimensionen prüfen.',
            };
          }
          return {
            badge: 'DIMENSION_MISMATCH',
            summary: '矩阵左除维度不兼容（操作符 \\）。',
            suggestion: '矩阵左除 A \\ b (求解 A*x = b) 要求矩阵 A 与向量 b 的行数一致。请检查操作数尺寸。',
          };
        }

        if (op === '*') {
          if (locale === 'en') {
            return {
              badge: 'DIMENSION_MISMATCH',
              summary: 'Incompatible dimensions for matrix multiplication (operator *).',
              suggestion: 'Matrix multiplication A * B requires columns of A to equal rows of B. For element-wise multiplication, use .* instead.',
            };
          }
          if (locale === 'de') {
            return {
              badge: 'DIMENSION_MISMATCH',
              summary: 'Inkompatible Dimensionen für Matrixmultiplikation (Operator *).',
              suggestion: 'Matrixmultiplikation A * B erfordert, dass Spalten von A gleich Zeilen von B sind. Für elementweise Multiplikation .* verwenden.',
            };
          }
          return {
            badge: 'DIMENSION_MISMATCH',
            summary: '矩阵乘法维度不匹配（操作符 *）。',
            suggestion: '请使用 size(A) 检查操作数维度。若是元素级相乘，请使用点乘运算符 .* 代替矩阵乘法 *。',
          };
        }

        if (op === '+' || op === '-') {
          if (locale === 'en') {
            return {
              badge: 'DIMENSION_MISMATCH',
              summary: `Dimension mismatch for addition/subtraction (operator ${op}).`,
              suggestion: `Both operands must have identical sizes or one must be a scalar. Check with size(A) and size(B).`,
            };
          }
          if (locale === 'de') {
            return {
              badge: 'DIMENSION_MISMATCH',
              summary: `Dimensionskonflikt bei Addition/Subtraktion (Operator ${op}).`,
              suggestion: `Beide Operanden müssen identische Dimensionen haben oder ein Skalar sein. Mit size(A) prüfen.`,
            };
          }
          return {
            badge: 'DIMENSION_MISMATCH',
            summary: `矩阵加减法维度不匹配（操作符 ${op}）。`,
            suggestion: '矩阵加减法要求两边维度完全一致，或其中一方为标量。请使用 size() 检查维度。',
          };
        }

        if (op === '^') {
          if (locale === 'en') {
            return {
              badge: 'DIMENSION_MISMATCH',
              summary: 'Matrix power requires a square matrix (operator ^).',
              suggestion: 'Matrix power A ^ n requires A to be square. For element-wise power, use .^ instead.',
            };
          }
          if (locale === 'de') {
            return {
              badge: 'DIMENSION_MISMATCH',
              summary: 'Matrixpotenz erfordert eine quadratische Matrix (Operator ^).',
              suggestion: 'Matrixpotenz A ^ n erfordert eine quadratische Matrix. Für elementweise Potenzierung .^ verwenden.',
            };
          }
          return {
            badge: 'DIMENSION_MISMATCH',
            summary: '矩阵乘方维度不匹配（操作符 ^）。',
            suggestion: '矩阵乘方 A ^ n 要求 A 为方阵。若要逐元素乘方，请使用点乘方运算符 .^ 代替。',
          };
        }

        if (locale === 'en') {
          return {
            badge: 'DIMENSION_MISMATCH',
            summary: 'Matrix or vector dimensions are nonconformant.',
            suggestion: 'Check operand dimensions with size(A). For element-wise operations, use dot operators (e.g. .*, ./).',
          };
        }
        if (locale === 'de') {
          return {
            badge: 'DIMENSION_MISMATCH',
            summary: 'Dimensionen von Matrix oder Vektor stimmen nicht überein.',
            suggestion: 'Prüfen Sie Dimensionen mit size(A). Für elementweise Operationen Punkt-Operatoren (z. B. .*, ./) nutzen.',
          };
        }
        return {
          badge: 'DIMENSION_MISMATCH',
          summary: '矩阵或向量维度不匹配，无法执行该运算。',
          suggestion: '请使用 size(A) 检查操作数维度。若需逐元素运算，请使用点运算符（如 .*、./）。',
        };
      }

      case 'syntax':
        if (locale === 'en') {
          return {
            badge: 'SYNTAX_ERROR',
            summary: 'Code parsing failed due to syntax error.',
            suggestion: 'Check for unmatched parentheses (), brackets [], missing semicolons, or unclosed quotes.',
          };
        }
        if (locale === 'de') {
          return {
            badge: 'SYNTAX_ERROR',
            summary: 'Code-Parsing aufgrund eines Syntaxfehlers fehlgeschlagen.',
            suggestion: 'Auf nicht geschlossene Klammern (), eckige Klammern [], fehlende Semikolons oder Anführungszeichen prüfen.',
          };
        }
        return {
          badge: 'SYNTAX_ERROR',
          summary: '代码解析失败，存在语法错误。',
          suggestion: '请检查是否存在未闭合的括号 ()、中括号 []、缺少的分号或引号不匹配。',
        };

      default:
        if (locale === 'en') {
          return {
            badge: 'ERROR',
            summary: error.raw.split('\n')[0] || 'Execution error occurred',
          };
        }
        if (locale === 'de') {
          return {
            badge: 'ERROR',
            summary: error.raw.split('\n')[0] || 'Ausführungsfehler aufgetreten',
          };
        }
        return {
          badge: 'ERROR',
          summary: error.raw.split('\n')[0] || '执行发生错误',
        };
    }
  }
}

