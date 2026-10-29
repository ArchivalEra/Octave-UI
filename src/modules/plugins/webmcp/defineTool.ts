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

/**
 * 工具副作用类别（spec v2 · B.3「新增 wire 面：不上 wire」）。
 *
 * **这是表内元数据，不是 wire 字段**：`listTools()` 与 `ready` 载荷都不含它——
 * 它没有消费者（权限机制尚未实现）；等第一个消费者出现再谈上 wire。
 * 现在只让标注在（spec 原话）。
 *
 * 三档按**影响面由内向外**排序：`read` < `mutates-workspace` < `sandbox-escape`。
 * 将来权限机制出现时，按档位收窄/拒绝即可（顺序是语义的一部分，别打乱）。
 *
 *   · `read`              —— 只读：不改引擎工作区、不写盘、不做装包/下载类外部副作用；
 *   · `mutates-workspace` —— 只改引擎工作区 / 笔记本运行态，*不*越出沙箱；
 *   · `sandbox-escape`    —— 沙箱逃逸面：任意代码执行、下载/写盘、装包、装载运行库。
 *
 * 判档是**保守**的：取调用面全部分支的最大档（例：`octave_install_package` 的
 * `planOnly` 分支只做预算推演，但 install 分支下载写盘 ⇒ 整工具记 `sandbox-escape`）。
 * `octave_eval` / `octave_run_cell` 执行任意 Octave 代码 —— 宿主 pkg shim 使 eval 内的
 * `pkg install` / `pkg load` 直接触发 `OctaveAssets.install`（下载/写盘/装包），
 * `urlread` 经 webnet 桥出网 ⇒ 记 `sandbox-escape`（spec 明文要求保守标注，
 * 见 2026-10-23-webmcp-final-spec.md「effects 修正」）。
 *
 * ⚠️ 本字段**零运行期消费者**：dispatcher 不读它、server 不投影它、没有权限检查逻辑。
 * 断言锚点：tests/plugins/webmcp-effects-nonwire.test.ts（表内有标注 / wire 上零字节）。
 */
export type WebMcpEffect = 'read' | 'mutates-workspace' | 'sandbox-escape';

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
   * 副作用类别（表内元数据，**不上 wire** —— 见 WebMcpEffect 的说明）。
   *
   * 可选：目前没有消费者，缺省不代表「无副作用」（缺省 = 未标注，不要当成 `read`）。
   * 七个在册工具全部显式标注；新工具加表时也该标 —— 但本字段不参与任何运行期判定，
   * 所以漏标不会改变任何 wire 字节（也就不会被 golden master 抓到）。
   */
  readonly effects?: WebMcpEffect;
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
  /**
   * 运行期能力门（spec B.2 · 偏差表 CAPABILITY_UNAVAILABLE）：声明了本字段的工具在
   * run 之前接受一次「provision 在册但运行期是否可供给」的检查。
   * 返回 null = 可供给（照常进 run）；返回短原因串 = 不可供给 ⇒ CAPABILITY_UNAVAILABLE 信封。
   * 适用面**只限新路径**（懒加载引擎装载失败 / 服务 boot 中且该工具选择不排队）——
   * 六个旧工具不声明本字段，服务缺席的旧守卫文案（golden 盯住）一字不变；
   * 排队语义的工具同样不声明（booting 排队走旧路径不报——spec B.4）。
   * 检查自身抛错按代码缺陷落 catch-all（与旧实现意外异常同路）。
   */
  readonly capability?: (ctx: Pick<WebMcpCtx, D>) => string | null;
}

/** 恒等工厂：类型咬合全部发生在 WebMcpToolSpec<D> 的推导里，运行期零行为 */
export function defineTool<D extends WebMcpDepKey>(spec: WebMcpToolSpec<D>): WebMcpToolSpec<D> {
  return spec;
}
