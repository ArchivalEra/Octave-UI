// src/modules/semantic/ErrorSanitizer.ts
// 错误净化器：拦截 Octave POSIX 错误通道 (eval 失败 rc=2 / on.output 混合流)，
// 屏蔽底层内核噪音，转化为具有指导意义的自然语言建议。

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
}

export class ErrorSanitizer {
  private static readonly ANSI_REGEX = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

  static sanitize(rawError: string): SanitizedError {
    const clean = rawError.replace(this.ANSI_REGEX, '').trim();

    // 1. 奇异矩阵 / 机器精度问题 (Singular matrix)
    if (
      /matrix singular|singular to machine precision|rcond\s*=/i.test(clean) ||
      /奇异矩阵/i.test(clean) ||
      /singuläre matrix/i.test(clean)
    ) {
      return {
        raw: clean,
        kind: 'singular_matrix',
        summary: '矩阵接近奇异（行列式为 0 或条件数过差），无法直接求精确逆。',
        suggestion: '建议使用伪逆 pinv(A) 进行最小二乘求解，或检查系数矩阵 A 是否满秩。',
        userFriendlyText:
          '矩阵接近奇异（不可逆）。如果您正在求解 A \\ b，建议改用 pinv(A) * b 求解最小二乘近似解。',
      };
    }

    // 2. 未定义变量或函数 (Undefined variable / function)
    const undefMatch =
      /'([a-zA-Z_][a-zA-Z0-9_]*)'\s*undefined/i.exec(clean) ||
      /undefined symbol\s*'([a-zA-Z_][a-zA-Z0-9_]*)'/i.exec(clean) ||
      /变量或函数\s*'([a-zA-Z_][a-zA-Z0-9_]*)'\s*未定义/i.exec(clean) ||
      /'([a-zA-Z_][a-zA-Z0-9_]*)'\s*nicht definiert/i.exec(clean);

    if (undefMatch) {
      const varName = undefMatch[1];
      return {
        raw: clean,
        kind: 'undefined_variable',
        summary: `变量或函数 '${varName}' 尚未定义。`,
        suggestion: `请检查拼写是否正确，或在使用之前先为其赋值（如 ${varName} = ...）。`,
        userFriendlyText: `变量或函数 '${varName}' 尚未定义。请检查拼写或先在上方单元格中定义该变量。`,
      };
    }

    // 3. 维度不匹配 (Nonconformant arguments / Dimension mismatch)
    if (
      /nonconformant arguments|dimension mismatch/i.test(clean) ||
      /operator.*nonconformant/i.test(clean) ||
      /维度不匹配/i.test(clean) ||
      /nicht übereinstimmende dimensionen/i.test(clean)
    ) {
      return {
        raw: clean,
        kind: 'dimension_mismatch',
        summary: '矩阵或向量维度不匹配，无法执行该运算。',
        suggestion:
          '请使用 size(A) 检查操作数维度。若是元素级相乘，请使用点乘运算符 .* 代替矩阵乘法 *。',
        userFriendlyText:
          '矩阵乘法维度不兼容。提示：如果要进行逐元素相乘，请使用 .*；如果要进行矩阵相乘，请检查矩阵的行数与列数是否匹配。',
      };
    }

    // 4. 语法 / 解析错误 (Parse error / Syntax error)
    if (
      /parse error|syntax error/i.test(clean) ||
      /语法错误/i.test(clean) ||
      /syntaxfehler/i.test(clean)
    ) {
      return {
        raw: clean,
        kind: 'syntax',
        summary: '代码解析失败，存在语法错误。',
        suggestion: '请检查是否存在未闭合的括号 ()、中括号 []、缺少的分号或引号不匹配。',
        userFriendlyText: '代码存在语法错误。请检查括号、引号或分号是否匹配。',
      };
    }

    // 5. 默认未知错误（提取主要提示信息）
    const firstLine = clean.split('\n')[0] || '执行发生错误';
    return {
      raw: clean,
      kind: 'unknown',
      summary: firstLine,
      userFriendlyText: firstLine,
    };
  }
}
