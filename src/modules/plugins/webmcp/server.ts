// src/modules/plugins/webmcp/server.ts
// 装配根（spec B.2）：createServer 时**一次性给定**静态名册（provision 静态决定
// 名册；health 只影响调用结果，不进 list wire —— provision/health 正交）。
// callTool 全权委托纯函数分发机 dispatcher.ts（零领域值 import 的那一半）。

import type { WebMcpContextApi, WebMcpToolDefinition } from './types';
import type { WebMcpCtxResolver } from './ctx';
import { dispatchTool } from './dispatcher';
import { octaveToolTable } from './tools';
import { CallStats } from './callStats';

export type WebMcpServer = WebMcpContextApi & {
  /** onCall 计数器（spec 步骤 3 第 4 项）——装配根持有，调试句柄与分发机共用同一实例 */
  readonly callStats: CallStats;
};

export function createServer(resolve: WebMcpCtxResolver): WebMcpServer {
  // 静态名册：不靠 thunk 键存在性判断 provision（服务晚构造不抖名册）
  const tools = octaveToolTable;
  // onCall 计数器：默认零行为（内存 push + 环形裁剪）；不上 wire 不改工具输出
  const callStats = new CallStats();

  return {
    async listTools(): Promise<WebMcpToolDefinition[]> {
      // wire 投影：name → description → parameters 三键，键序与旧实现字面量一致
      return tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      }));
    },

    async callTool(name: string, args?: Record<string, unknown>) {
      // 计时与记录（spec B.3）：args 一律不进记录（隐私/体积），只记四元组；
      // 记录动作在终态之后——对调用结果零影响（默认零行为判据）
      const startedAt = Date.now();
      const res = await dispatchTool(tools, resolve, name, args);
      callStats.record(name, res.isError !== true, Date.now() - startedAt);
      return res;
    },

    callStats,
  };
}
