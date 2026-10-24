// tests/plugins/webmcp-channels.test.ts
// fake-channel 契约测试（spec v2 · B 两样之「三通道命名」，mail/062 批准随步骤 2 落）：
// 证明**新增 Channel 只需实现 WebMcpChannel 接口**即可与既有两通道
// （legacy-event / global-handle）并存 —— 这是 Channel 接口的稳定性断言，
// 不是新行为（不触碰 wire 面，golden master 不受影响）。
//
// 测试层次（spec Testing Decisions：最高位 seam 是分发机，协议层归一化）：
// 直接用 createServer + resolveCtx 造 DOM-free 的 api 面，再把三通道挂上去——
// 不经过 WebMcpPlugin（通道契约只依赖 WebMcpContextApi，不该依赖插件壳）。

import { describe, it, expect, afterEach } from 'vitest';
import { createServer } from '../../src/modules/plugins/webmcp/server';
import { resolveCtx } from '../../src/modules/plugins/webmcp/ctx';
import { createLegacyEventChannel } from '../../src/modules/plugins/webmcp/channels/eventChannel';
import { createGlobalHandleChannel } from '../../src/modules/plugins/webmcp/channels/globalHandle';
import type { WebMcpChannel } from '../../src/modules/plugins/webmcp/channels/types';
import type { WebMcpContextApi, WebMcpToolCallResult } from '../../src/modules/plugins/webmcp/types';
import type { EngineSupervisor } from '../../src/modules/engine/EngineSupervisor';
import type { ProjectWorkspace } from '../../src/modules/workspace/ProjectWorkspace';
import type { PackageManagerPlugin } from '../../src/modules/plugins/package/PackageManagerPlugin';

// 最小 mock：只覆盖本文件用到的行为（三服务齐备；require 回退在测试环境拿不到
// 全局上下文，缺席注入即 undefined —— 与 golden master 的 mock 语义一致）。
function makeApi(): WebMcpContextApi {
  const supervisor: any = {
    isReady: true,
    state: 'idle',
    eval: async () => ({ ok: true, rc: 0, output: 'ans = 42\n' }),
    getWorkspace: async () => [],
  };
  const workspace: any = {
    mode: 'notebook',
    activeLane: 'wasm32-final',
    activeFile: 'script.m',
    files: [],
    variables: [],
    cells: [],
    syncVariables: async () => [],
    executeCell: async () => ({ ok: true, rc: 0, output: '' }),
  };
  const packageManager: any = {
    getCatalog: () => ({ packs: [] }),
    loadCatalog: async () => ({ packs: [] }),
    filterPackages: () => [],
    getStatus: () => ({ compatible: true, fromSource: false, installed: false }),
    planInstall: async () => ({ bytes: 0, layers: [] }),
    installPackage: async () => ({ state: 'ok', cause: null }),
  };
  return createServer(
    resolveCtx(() => ({
      supervisor: supervisor as unknown as EngineSupervisor,
      projectWorkspace: workspace as unknown as ProjectWorkspace,
      packageManagerPlugin: packageManager as unknown as PackageManagerPlugin,
    }))
  );
}

// 契约测试的第三通道：假 Channel —— 只实现 attach/detach（接口的最小完整实现），
// 不碰 DOM 不碰事件协议。未来原生 modelContext 通道按同样形状接入。
class FakeChannel implements WebMcpChannel {
  readonly id = 'fake-channel';
  private api: WebMcpContextApi | null = null;
  attachCount = 0;
  detachCount = 0;

  attach(api: WebMcpContextApi): void {
    this.api = api;
    this.attachCount += 1;
  }

  detach(): void {
    this.api = null;
    this.detachCount += 1;
  }

  get attached(): boolean {
    return this.api !== null;
  }

  async call(name: string, args?: Record<string, unknown>): Promise<WebMcpToolCallResult> {
    if (!this.api) throw new Error('fake channel is detached');
    return this.api.callTool(name, args);
  }
}

describe('WebMCP Channel contract: a third channel plugs in next to the two existing ones', () => {
  afterEach(() => {
    // 兜底清全局直柄（正常用例已由通道 detach 清理；这里防挂掉的用例泄漏到别处）
    delete (window as any).modelContext;
    delete (document as any).modelContext;
    try {
      delete (navigator as any).modelContext;
    } catch {
      // Navigator might be non-extensible in some engines
    }
  });

  it('attach 后可调用收响应：fake 通道经同一分发机拿到与直柄一致的结果', async () => {
    const api = makeApi();
    const fake = new FakeChannel();
    fake.attach(api);

    expect(fake.attached).toBe(true);

    const res = await fake.call('octave_eval', { code: 'ans = 42' });
    expect(res.isError).toBeFalsy();
    expect((res.content[0] as { text?: string }).text).toBe('ans = 42\n');

    // unknown tool 在 fake 通道里走同一分发机 ⇒ 旧文案逐字（spec B.2）
    const unknown = await fake.call('nonexistent_tool', {});
    expect((unknown.content[0] as { text?: string }).text).toBe(
      'Unknown tool name: "nonexistent_tool". Use listTools() to see available tools.'
    );
  });

  it('detach 后不收：再调用即拒；attach/detach 计数各恰一次', async () => {
    const api = makeApi();
    const fake = new FakeChannel();
    fake.attach(api);
    fake.detach();

    expect(fake.attached).toBe(false);
    expect(fake.attachCount).toBe(1);
    expect(fake.detachCount).toBe(1);
    await expect(fake.call('octave_eval', { code: 'x=1' })).rejects.toThrow('detached');
  });

  it('不影响另两通道：fake 挂/摘期间 legacy 事件与全局直柄照常工作', async () => {
    const api = makeApi();
    const legacy = createLegacyEventChannel(window, 'webmcp');
    const handle = createGlobalHandleChannel(window, document);
    const fake = new FakeChannel();

    legacy.attach(api);
    handle.attach(api);
    fake.attach(api);

    // 三通道并存：直柄挂上的是同一个 api 面
    expect((window as any).modelContext).toBe(api);

    // 事件通道中继照常（ready 握手也在挂载时异步发出，不干扰 call/response）
    const responses: Array<{ id?: string; result: WebMcpToolCallResult }> = [];
    const onResponse = (e: Event) => {
      responses.push((e as CustomEvent<{ id?: string; result: WebMcpToolCallResult }>).detail);
    };
    window.addEventListener('webmcp:response', onResponse);
    window.dispatchEvent(
      new CustomEvent('webmcp:call', { detail: { id: 'fake-1', name: 'octave_eval', arguments: { code: 'x=1' } } })
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(responses.length).toBe(1);
    expect(responses[0].id).toBe('fake-1');
    expect((responses[0].result.content[0] as { text?: string }).text).toBe('ans = 42\n');

    // 摘掉 fake：另两通道不受影响（直柄可调、事件可中继）
    fake.detach();
    const direct = await api.callTool('octave_eval', { code: 'x=1' });
    expect((direct.content[0] as { text?: string }).text).toBe('ans = 42\n');
    window.dispatchEvent(
      new CustomEvent('webmcp:call', { detail: { id: 'fake-2', name: 'octave_eval', arguments: { code: 'x=1' } } })
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(responses.length).toBe(2);
    expect(responses[1].id).toBe('fake-2');

    // 卸载：legacy 摘后不再中继，直柄摘后 modelContext 复位
    legacy.detach();
    handle.detach();
    expect((window as any).modelContext).toBeUndefined();
    window.dispatchEvent(
      new CustomEvent('webmcp:call', { detail: { id: 'fake-3', name: 'octave_eval', arguments: { code: 'x=1' } } })
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(responses.length).toBe(2); // fake-3 无响应
    window.removeEventListener('webmcp:response', onResponse);
  });
});
