// src/modules/plugins/webmcp/types.ts
// WebMCP 规范类型定义：DOM-free 自主智能体标准协议

export interface WebMcpToolProperty {
  type: string;
  description?: string;
  enum?: string[];
  items?: Record<string, unknown>;
}

export interface WebMcpToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, WebMcpToolProperty>;
    required?: string[];
  };
}

export interface WebMcpTextContent {
  type: 'text';
  text: string;
}

export interface WebMcpJsonContent {
  type: 'resource';
  data: unknown;
  mimeType: 'application/json';
}

export type WebMcpContent = WebMcpTextContent | WebMcpJsonContent;

export interface WebMcpToolCallResult {
  content: WebMcpContent[];
  isError?: boolean;
}

export interface WebMcpContextApi {
  listTools(): Promise<WebMcpToolDefinition[]>;
  callTool(name: string, args?: Record<string, unknown>): Promise<WebMcpToolCallResult>;
}
