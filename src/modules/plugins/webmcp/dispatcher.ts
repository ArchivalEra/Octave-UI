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
    return await tool.run(args, materializeCtx(tool.deps, resolve));
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      isError: true,
      content: [{ type: 'text', text: `Execution failed for tool "${name}": ${errorMsg}` }],
    };
  }
}
