// src/modules/plugins/webmcp/WebMcpPlugin.ts
// WebMCP 网桥 · 薄壳（spec v2 步骤 2 骨架迁移后的形状，验收 = golden master 全量零差异）：
//   - 工具名册 / 分发 / 依赖解析下沉到 server.ts / dispatcher.ts / ctx.ts；
//   - 双通道挂载下沉到 channels/（legacy 事件 + 全局直柄，均实现 WebMcpChannel）；
//   - 本文件只剩插件生命周期与装配。
//
// 旧实现的三个服务 getter（含 require('../../appContext') 惰性回退）已逐字迁入
// ctx.ts 的 resolveCtx —— 注入与回退**并存**（mail/062 红线 1），本壳经
// `resolveCtx(() => this.options)` 保持「每次访问重读 options」的旧语义。
//
// 公开面（listTools/callTool/init/destroy + options 注入）签名与语义逐字保持
// —— golden master 双通道用例与 tests/plugins/WebMcpPlugin.test.ts 直接吃这个面。

import type { OctavePlugin } from '../types';
import type { WebMcpToolDefinition, WebMcpToolCallResult, WebMcpContextApi } from './types';
import { resolveCtx, type WebMcpCtxResolver } from './ctx';
import { createServer, type WebMcpServer } from './server';
import type { WebMcpChannel } from './channels/types';
import { createGlobalHandleChannel } from './channels/globalHandle';
import { createLegacyEventChannel } from './channels/eventChannel';
import { createDebugHandle, attachDebugHandle, detachDebugHandle, type WebMcpDebugHandle } from './callStats';

// 注入面迁至 ctx.ts（组合根），旧公开导入路径保持可用
export type { WebMcpPluginServices } from './ctx';

export class WebMcpPlugin implements OctavePlugin<WebMcpPluginServices>, WebMcpContextApi {
  readonly id = 'webmcp';
  readonly name = 'WebMCP Autonomous Agent Bridge';
  readonly version = '1.0.0';
  readonly description = 'DOM-free WebMCP interface exposing Octave engine, notebook, workspace, and packages to AI agents.';
  enabled = true;
  options?: WebMcpPluginServices;

  private readonly _resolve: WebMcpCtxResolver;
  private readonly _server: WebMcpServer;
  private _channels: WebMcpChannel[] = [];

  constructor(services?: WebMcpPluginServices) {
    this.options = services;
    this._resolve = resolveCtx(() => this.options);
    this._server = createServer(this._resolve);
  }

  // --- WebMcpContextApi：全权委托 server（签名与语义与旧实现逐字保持） ---

  async listTools(): Promise<WebMcpToolDefinition[]> {
    return this._server.listTools();
  }

  async callTool(name: string, args: Record<string, unknown> = {}): Promise<WebMcpToolCallResult> {
    return this._server.callTool(name, args);
  }

  // --- 插件生命周期与双通道挂载 ---

  private _debugHandle: WebMcpDebugHandle | null = null;
  private _debugWin: Window | null = null;

  init(): void {
    const win = this.options?.windowTarget ?? (typeof window !== 'undefined' ? window : null);
    const doc = this.options?.documentTarget ?? (typeof document !== 'undefined' ? document : null);

    this._channels = [
      createGlobalHandleChannel(win, doc), // 全局直柄通道（doc/win/navigator 的 modelContext）
      createLegacyEventChannel(win, this.id), // legacy 事件通道（call/response/ready/unloaded）
    ];
    for (const channel of this._channels) {
      channel.attach(this);
    }
    // 调试句柄（spec B.3）：window.__webmcp_debug.stats() —— 计数器唯一读取口；
    // 不上 wire、不改任何工具输出（get_system_state 的 golden 盯住零变化）
    this._debugHandle = createDebugHandle(this._server.callStats);
    this._debugWin = win;
    attachDebugHandle(win, this._debugHandle);
  }

  destroy(): void {
    // 摘通道次序：先直柄后事件 —— webmcp:unloaded 信标仍最后发出（与旧实现一致）
    for (const channel of this._channels) {
      channel.detach();
    }
    this._channels = [];
    // 调试句柄跟随插件生命周期卸载（仅当挂的还是本句柄才动，不误删后来者的）
    if (this._debugHandle) {
      detachDebugHandle(this._debugWin, this._debugHandle);
    }
    this._debugHandle = null;
    this._debugWin = null;
  }
}
