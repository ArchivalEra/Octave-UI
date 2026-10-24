// src/modules/plugins/webmcp/server.ts
// 装配根（spec B.2）：createServer 时**一次性给定**静态名册（provision 静态决定
// 名册；health 只影响调用结果，不进 list wire —— provision/health 正交）。
// callTool 全权委托纯函数分发机 dispatcher.ts（零领域值 import 的那一半）。

import type { WebMcpContextApi, WebMcpToolDefinition } from './types';
import type { WebMcpCtxResolver } from './ctx';
import { dispatchTool } from './dispatcher';
import { octaveToolTable } from './tools';

export type WebMcpServer = WebMcpContextApi;

export function createServer(resolve: WebMcpCtxResolver): WebMcpServer {
  // 静态名册：不靠 thunk 键存在性判断 provision（服务晚构造不抖名册）
  const tools = octaveToolTable;

  return {
    async listTools(): Promise<WebMcpToolDefinition[]> {
      // wire 投影：name → description → parameters 三键，键序与旧实现字面量一致
      return tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      }));
    },

    callTool(name: string, args?: Record<string, unknown>) {
      return dispatchTool(tools, resolve, name, args);
    },
  };
}
