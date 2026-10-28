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
    // 装配缺陷诊断（内容仓 095 D11）：注入与 require 回退双失败时报一次——
    // 「服务没接上」必须能被看见，不许伪装成「能力暂不可用」。
    // 只 console.error（每键一次），返回面不变 ⇒ golden 的服务缺席文案零影响。
    const reported = new Set<string>();
    this._resolve = resolveCtx(
      () => this.options,
      (key) => {
        if (reported.has(key)) return;
        reported.add(key);
        console.error(
          `[WebMCP] assembly fault: ctx key "${key}" is neither injected nor resolvable — ` +
            'tools depending on it will report CAPABILITY_UNAVAILABLE even though the service exists. ' +
            'Inject services at the composition root (see plugins/index.ts / appContext.ts).'
        );
      },
    );
    this._server = createServer(this._resolve);
  }

  /**
   * 组合根后置注入（内容仓 095 D11 的修法）。
   *
   * 为什么不是构造时注入：`plugins/index.ts` 在 `appContext.ts` 之前求值，而
   * supervisor / projectWorkspace 都在 appContext 里创建——构造期注入会成环。
   * `resolveCtx` 的 getServices 是**每次访问动态读取** options（旧 getter 语义），
   * 所以后置覆写天然生效，晚绑也能被工具解析到。
   *
   * 只合并不覆盖：已显式给的键保留（测试注入 mock 不受影响），缺的键补上。
   */
  injectServices(services: WebMcpPluginServices): void {
    this.options = { ...(this.options || {}), ...services };
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
