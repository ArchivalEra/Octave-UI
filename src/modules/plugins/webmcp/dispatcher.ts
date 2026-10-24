// src/modules/plugins/webmcp/dispatcher.ts
// 纯函数分发机（spec v2 · A 骨架）：零领域值 import —— 引擎/工作区/包管理一律不进
// 本文件，只认 WebMcpToolSpec（表）与 WebMcpCtxResolver（解析器）两个抽象。
// 「网桥零 import 服务」断言（tests/plugins/webmcp-bridge-isolation.test.ts）盯住这一点。
//
// 逐字保真面（mail/062 三条红线中的两条落在这里）：
//   - catch-all 文案：`Execution failed for tool "x": ...` 形状逐字复刻，
//     不许「顺手改好」（红线 2）；
//   - Unknown tool 原文案逐字：`Unknown tool name: "x". Use listTools() ...`
//     （spec B.2：provision 缺失 = 不在名册 = 旧路径原文案，零偏差）。
//   - 不加 booting 分支（红线 3）：排队语义住在 supervisor 内部（spec B.4），
//     分发机对引擎健康态一无所知 —— crashed/failed 的旧路径就是服务异常直落 catch-all。

import type { WebMcpCtx, WebMcpCtxResolver } from './ctx';
import type { WebMcpDepKey, WebMcpToolSpec } from './defineTool';
import type { WebMcpToolCallResult } from './types';
import { validateArgs } from './validate';

/** 缺省超时（spec B.1）：120s——大于 Kill Ladder 最终决议阈值，只兜不经 supervisor 的慢路径 */
export const DEFAULT_TIMEOUT_MS = 120_000;

/** 超时信封（spec B.1 措辞逐字——进 golden 即钉死） */
export const TIMEOUT_ENVELOPE_TEXT = (name: string, ms: number) =>
  `TIMEOUT: tool "${name}" did not finish within ${ms}ms (counting from call initiation, queueing included). The underlying task may still be running or queued — do not blindly retry.`;

/** 能力不可得信封（spec B.2 · 偏差表第 3 项——只用于 provision 在册但运行期不可得的新路径） */
export const CAPABILITY_ENVELOPE_TEXT = (name: string, reason: string) =>
  `CAPABILITY_UNAVAILABLE: tool "${name}" requires ${reason}, which is not currently available (the tool is provisioned but its runtime capability is missing — e.g., lazy engine load failed, or the service is still booting on a non-queuing path).`;

/**
 * Promise.race 超时壳（spec B.1 第三条路）。超时后底层 promise **不被取消**——
 * JS 无取消原语，任务继续跑/排着；信封已如实告知调用方。工作 promise 先 settle
 * 则原样透传（成功/失败形状都不动）。
 */
function raceTimeout(
  work: Promise<WebMcpToolCallResult>,
  timeoutMs: number,
  name: string,
): Promise<WebMcpToolCallResult> {
  return new Promise<WebMcpToolCallResult>((resolve) => {
    const timer = setTimeout(() => {
      resolve({
        isError: true,
        content: [{ type: 'text', text: TIMEOUT_ENVELOPE_TEXT(name, timeoutMs) }],
      });
    }, timeoutMs);
    work.then(
      (res) => {
        clearTimeout(timer);
        resolve(res);
      },
      (err) => {
        clearTimeout(timer);
        resolve({
          isError: true,
          content: [{ type: 'text', text: `Execution failed for tool "${name}": ${err instanceof Error ? err.message : String(err)}` }],
        });
      },
    );
  });
}

/**
 * 把工具声明的 deps 物化成窄 ctx（Pick<WebMcpCtx, D> 的运行期对应物）。
 * 用惰性 getter：键的解析时机与旧实现 `this.supervisor` 这类属性访问完全一致
 * （比如 get_system_state 先读 supervisor 再读 workspace 的次序原样保持）。
 */
function materializeCtx<D extends WebMcpDepKey>(deps: readonly D[], resolve: WebMcpCtxResolver): Pick<WebMcpCtx, D> {
  const ctx = {} as Pick<WebMcpCtx, D>;
  for (const key of deps) {
    Object.defineProperty(ctx, key, {
      enumerable: true,
      configurable: true,
      get: () => resolve[key](),
    });
  }
  return ctx;
}

/**
 * 分发一次工具调用。形状与旧 callTool 的 try/switch/catch 同构：
 *   未知名 → 原文案；在册 → 执行工具体；任何异常 → catch-all 原文案。
 * （旧实现的 `args = {}` 默认参语义保持：undefined 归一为 {}，null 原样穿透
 *  —— null 上取属性键会 TypeError 落 catch-all，与旧实现一致。）
 */
export async function dispatchTool(
  tools: readonly WebMcpToolSpec[],
  resolve: WebMcpCtxResolver,
  name: string,
  args: Record<string, unknown> = {},
): Promise<WebMcpToolCallResult> {
  try {
    const tool = tools.find((t) => t.name === name);
    if (!tool) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Unknown tool name: "${name}". Use listTools() to see available tools.` }],
      };
    }
    // 子集校验（spec 步骤 3 第 1 项 · 偏差表 ARGS_INVALID）：明确违规（缺 required/
    // 类型错/enum 越界）在进 run 之前拦下；可强转值与未知字段放行——旧调用零误杀。
    // 校验器是纯函数，规则细节与放行面的边界见 validate.ts 文件头。
    const invalid = validateArgs(tool.parameters, args);
    if (invalid) {
      return invalid;
    }
    // 能力门（spec B.2 · 偏差表 CAPABILITY_UNAVAILABLE）：只对**声明了 capability 的
    // 工具**在 run 之前检查——provision 在册但运行期不可给（懒加载失败 / boot 中且该
    // 工具不排队）⇒ CAPABILITY_UNAVAILABLE 信封。六个旧工具不声明 ⇒ 零行为变化
    // （服务缺席的旧守卫文案一字不变，golden 盯住）；检查抛错落 catch-all（代码缺陷路）。
    if (tool.capability) {
      const ctxForCheck = materializeCtx(tool.deps, resolve);
      const unavailableReason = tool.capability(ctxForCheck);
      if (unavailableReason) {
        return {
          isError: true,
          content: [{ type: 'text', text: CAPABILITY_ENVELOPE_TEXT(name, unavailableReason) }],
        };
      }
    }
    // 超时兜底（spec 步骤 3 第 2 项 · 偏差表 TIMEOUT，spec B.1）：Promise.race——
    // 计时含排队（从调用发起算，不从 handler 开始执行算），缺省 120s，表项 timeoutMs
    // 可覆盖。不碰 supervisor（实施仓归属纪律）。超时只兜不经 supervisor 的慢路径：
    // 懒加载引擎装载 / 装包下载 / UI 类工具读大量文件系统；eval 挂起由 Kill Ladder
    // 先决议。超时后底层任务仍在跑/排着——信封明示勿盲目重试（spec 措辞逐字）。
    const timeoutMs = tool.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const work = tool.run(args, materializeCtx(tool.deps, resolve));
    const timed = raceTimeout(work, timeoutMs, name);
    return await timed;
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      isError: true,
      content: [{ type: 'text', text: `Execution failed for tool "${name}": ${errorMsg}` }],
    };
  }
}
