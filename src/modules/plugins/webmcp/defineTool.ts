// src/modules/plugins/webmcp/defineTool.ts
// 工具定义工厂（spec v2 · A 骨架）：`defineTool<D extends keyof WebMcpCtx>` 把
// deps 声明与 run 收到的 ctx 在**类型层绑死**（Pick<WebMcpCtx, D>）——
//   - dep key 写错（如 'superviser'）⇒ D 不满足 keyof WebMcpCtx ⇒ 编译期报错；
//   - run 里访问未声明的 ctx 键 ⇒ Pick 面上没有该键 ⇒ 编译期报错。
// 两条能力门的活体断言在 tests/plugins/webmcp-compile-gates.test.ts（@ts-expect-error）。
//
// 加新工具只动两处：tools/ 下加一个 defineTool 文件 + tools/index.ts 名册加一行
// （spec 用户故事 7）—— 分发 / 协议 / 装配代码零触碰。

import type { WebMcpCtx } from './ctx';
import type { WebMcpToolCallResult, WebMcpToolDefinition } from './types';

export type WebMcpDepKey = keyof WebMcpCtx;

export interface WebMcpToolSpec<D extends WebMcpDepKey = WebMcpDepKey> {
  /** wire 名（名册主键，分发机按它查找） */
  readonly name: string;
  /** wire 描述（listTools 的 description 字段，逐字对齐旧实现） */
  readonly description: string;
  /** wire JSON Schema —— schema.ts 的 builder 产出（字节一致含键序） */
  readonly parameters: WebMcpToolDefinition['parameters'];
  /** 能力声明：运行期要解析哪些 ctx 键（键面 = keyof WebMcpCtx，写错编译期红） */
  readonly deps: readonly D[];
  /**
   * 工具体。args 保持 Record<string, unknown> 原始面（旧实现的类型强转
   * `String(args.code)` 等在工具体内逐字保留 —— 红线 3，ARGS_INVALID 是步骤 3 的事）。
   * ctx 只暴露 deps 声明过的键（Pick<WebMcpCtx, D>）。
   */
  run: (args: Record<string, unknown>, ctx: Pick<WebMcpCtx, D>) => Promise<WebMcpToolCallResult>;
  /**
   * 超时覆盖（毫秒，spec B.1）：缺省 120_000；计时**含排队**（从调用发起算——
   * machine 在 supervisor 之上看不到「开始执行」时刻，首版如实承认这一点）。
   * OMC 仿真分钟级场景将来按需设。超时后底层任务仍在跑/排着——信封明示勿盲目重试。
   */
  readonly timeoutMs?: number;
}

/** 恒等工厂：类型咬合全部发生在 WebMcpToolSpec<D> 的推导里，运行期零行为 */
export function defineTool<D extends WebMcpDepKey>(spec: WebMcpToolSpec<D>): WebMcpToolSpec<D> {
  return spec;
}
