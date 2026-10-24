// src/modules/plugins/webmcp/validate.ts
// 子集校验器（spec v2 步骤 3 第 1 项 · 偏差表 ARGS_INVALID）：从表的 params schema
// 生成校验规则，在分发机调 run **之前**执行。纯函数、零领域 import。
//
// 判据（spec 用户故事 5 + B.2，钉死）：
//   报 ARGS_INVALID（带字段名）——「参数明确违规」的窄面：
//     · 缺 required 键；
//     · 类型明确错：目标 string 而实参是 object/array/null；目标 number 而实参是
//       非数值串/boolean/object；目标 boolean 而实参是 object/array/null；
//     · enum 越界：目标带 enum 而实参不是 enum 成员（含非字符串实参——先过类型关再比成员）。
//   放行（旧调用不被新校验误杀）——「可强转值 + 未知字段」：
//     · 可强转：目标 string 收 number/boolean ⇒ String() 可表达，放行（工具体内
//       依旧逐字跑旧强转，红线 3）；目标 number 收 '42' 这类数值串 ⇒ 放行；
//       目标 boolean 收任何真值/假值 ⇒ Boolean() 放行；
//     · 未知字段：schema 未声明的键一律不校验（additionalProperties 不查）；
//     · undefined/null 实参整体归一：args 缺省为 {}（分发机已归一），null 属性值
//       按「类型明确错」判（null 不是任何 schema 类型的合法值）。
//   空 string 实参（code:''）是合法 string ⇒ 进 run 落**旧守卫**（非 ARGS_INVALID）。
//
// 信封文案（进 golden 即钉死）：`ARGS_INVALID: parameter "<字段>" <原因>`，
// isError: true。原因短语三种：is required / must be of type <t> / must be one of [...]

import type { WebMcpToolDefinition } from './types';
import type { WebMcpToolCallResult } from './types';

/** 宽松强转判定：这个实参能否被安全地强转成目标类型（能 ⇒ 放行） */
function isCoercibleTo(value: unknown, target: string): boolean {
  if (value === null || value === undefined) return false; // null/undefined 不是合法值
  const jsType = typeof value;
  if (target === 'string') {
    // number/boolean 可 String()；object/array 不可（序列化语义不是强转）
    return jsType === 'string' || jsType === 'number' || jsType === 'boolean';
  }
  if (target === 'number') {
    // 数值串可 Number()；boolean 可（true→1）——与旧实现里 Number 可达的强转面一致
    if (jsType === 'number' || jsType === 'boolean') return true;
    if (jsType === 'string' && value !== '' && !Number.isNaN(Number(value))) return true;
    return false;
  }
  if (target === 'boolean') {
    // 任何原始值都可 Boolean()；object/array 语义不明不收
    return jsType !== 'object';
  }
  return true; // 未知目标类型（未来扩展）：不拦
}

/** 校验器（纯函数）：违规 ⇒ ARGS_INVALID 信封；合格 ⇒ null（放行进 run） */
export function validateArgs(
  parameters: WebMcpToolDefinition['parameters'],
  args: Record<string, unknown>,
): WebMcpToolCallResult | null {
  if (!parameters || !parameters.properties) return null;
  const props = parameters.properties;
  const required = parameters.required || [];

  // ① required 关（缺键即报——undefined 属性视同缺）
  for (const key of required) {
    if (args[key] === undefined) {
      return argsInvalid(`parameter "${key}" is required`);
    }
  }
  // ② 已声明字段的类型/enum 关（未知字段不进这关——放行面）
  for (const key of Object.keys(props)) {
    const value = args[key];
    if (value === undefined) continue; // 非 required 的缺省合法
    const target = props[key].type;
    if (!isCoercibleTo(value, target)) {
      return argsInvalid(`parameter "${key}" must be of type ${target}`);
    }
    const enumValues = props[key].enum;
    if (enumValues && enumValues.length > 0) {
      // enum 关在类型关之后：string 目标 + 非串值已被 ① 放行面强转规则放过的话
      // （如 number），强转语义下比成员没有意义——只在 string 实参上比。
      if (typeof value === 'string' && !enumValues.includes(value)) {
        return argsInvalid(`parameter "${key}" must be one of [${enumValues.join(', ')}]`);
      }
    }
  }
  return null;
}

function argsInvalid(reason: string): WebMcpToolCallResult {
  return {
    isError: true,
    content: [{ type: 'text', text: `ARGS_INVALID: ${reason}.` }],
  };
}
