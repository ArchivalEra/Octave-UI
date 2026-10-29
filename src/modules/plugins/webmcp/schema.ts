// src/modules/plugins/webmcp/schema.ts
// Args builder（spec v2 · C 小项 2）：**同一段声明**同时产出
//   ① JSON Schema（wire 面，listTools 快照盯字节一致含键序）；
//   ② TS 类型（编译期面，phantom 见证字段供 `typeof x.phantom` 提取）。
// 不引 json-schema-to-ts（外部依赖太重），也不自写类型体操 ——
// 类型派生只有一条映射（'string'→string / 'number'→number / 'boolean'→boolean）。
//
// 键序契约（与旧实现字节一致，golden master「C. protocol level」用例盯）：
//   - 参数 schema 对象：type → properties → required
//   - 单个属性对象：type → enum? → description?
// builder 内的插入顺序就是上面这个序，改动前先读 mail/062「键序方法论」。

import type { WebMcpToolProperty } from './types';

type WebMcpArgType = 'string' | 'number' | 'boolean';

/** TS 类型派生（唯一的类型层逻辑，刻意保持最小） */
type TsTypeOf<T extends WebMcpArgType> = T extends 'string' ? string : T extends 'number' ? number : boolean;

interface BuiltArgsSchema<TArgs extends Record<string, unknown>> {
  /** JSON Schema 面：键序 = 声明序（见文件头键序契约） */
  readonly schema: { type: 'object'; properties: Record<string, WebMcpToolProperty>; required?: string[] };
  /** TS 类型面：运行期恒为 undefined，仅供编译期 `typeof schema.phantom` 提取 */
  readonly phantom: TArgs;
}

class ArgsBuilder<TArgs extends Record<string, unknown> = {}> {
  private readonly props: Record<string, WebMcpToolProperty> = {};
  private readonly requiredNames: string[] = [];

  /** 声明一个参数属性；泛型累积出「参数名 → TS 类型」映射 */
  prop<K extends string, T extends WebMcpArgType>(
    name: K,
    type: T,
    opts?: { description?: string; enum?: string[] },
  ): ArgsBuilder<TArgs & Record<K, TsTypeOf<T>>> {
    // 属性键序：type → enum? → description?（逐字对齐旧实现的属性字面量键序）
    const p: WebMcpToolProperty = { type };
    if (opts?.enum) p.enum = opts.enum;
    if (opts?.description) p.description = opts.description;
    this.props[name] = p;
    return this as unknown as ArgsBuilder<TArgs & Record<K, TsTypeOf<T>>>;
  }

  /** 标记 required 参数（追加进 required 数组，序 = 调用序） */
  required(...names: string[]): this {
    this.requiredNames.push(...names);
    return this;
  }

  build(): BuiltArgsSchema<TArgs> {
    // schema 键序：type → properties → required（旧实现三键字面量的原始顺序）
    const schema: { type: 'object'; properties: Record<string, WebMcpToolProperty>; required?: string[] } = {
      type: 'object',
      properties: this.props,
    };
    if (this.requiredNames.length > 0) {
      schema.required = [...this.requiredNames];
    }
    return { schema, phantom: undefined as unknown as TArgs };
  }
}

/** 入口：args().prop(...).required(...).build() */
export function args(): ArgsBuilder {
  return new ArgsBuilder();
}
