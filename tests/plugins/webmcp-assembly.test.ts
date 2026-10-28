// tests/plugins/webmcp-assembly.test.ts
// 装配链判据（内容仓 095 D11 的核心缺口：**测试全绿 ≠ 产物能跑**）。
//
// D11 现场：`tests/plugins/WebMcpPlugin.test.ts` 每个用例都 `new WebMcpPlugin({mock...})`
// 注入 mock ⇒ 单测绿；而产物里 `new WebMcpPlugin()` 无参 + require 回退恒失败
// ⇒ 三个服务恒 undefined ⇒ 五个工具全废。**注入 mock 的测试永远抓不到这个。**
//
// 本文件的三条判据：
//   ① 【产物级】不注入 mock、经**组合根真装配**（appContext）后，服务必须解析得到
//      —— 这是 D11 的直接回归锁。
//   ② 【装配缺陷可见】无注入且 require 不可用时，必须**报装配缺陷**（console.error 一次/键），
//      不能静默返回 undefined —— 「服务没接上」与「服务暂不可用」必须可区分。
//   ③ 【注入优先级】显式注入覆盖回退；后置 injectServices 合并而非覆盖。
//
// 复跑：CI=true npx vitest run tests/plugins/webmcp-assembly.test.ts

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('WebMCP 装配链（095 D11 回归锁）', () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('★① 产物级：组合根真装配后三服务全部解析得到（D11 直接回归锁）', async () => {
    // 真组合根（不注入任何 mock）——这正是产物走的路径
    const app = await import('../../src/modules/appContext');
    const { webMcpPlugin } = app;
    const { resolveCtx } = await import('../../src/modules/plugins/webmcp/ctx');
    // 用插件自己的 resolver 语义核：注入面必须真的带着三个服务
    const services = (webMcpPlugin as any).options;
    expect(services?.supervisor).toBe(app.supervisor);
    expect(services?.projectWorkspace).toBe(app.projectWorkspace);
    expect(services?.packageManagerPlugin).toBe(app.packageManagerPlugin);

    // 端到端：经 resolveCtx（同一份 options）解析三键都非 undefined
    const resolver = resolveCtx(() => services);
    expect(resolver.supervisor()).toBe(app.supervisor);
    expect(resolver.workspace()).toBe(app.projectWorkspace);
    expect(resolver.packageManager()).toBe(app.packageManagerPlugin);
  });

  it('★② 装配缺陷可见：无注入 + require 不可用 ⇒ console.error 报装配缺陷（不是静默 undefined）', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { WebMcpPlugin } = await import('../../src/modules/plugins/webmcp/WebMcpPlugin');
    // 无参构造（D11 的原始形状）
    const plugin = new WebMcpPlugin();
    // 触发一次解析（工具调用路径会做）
    await plugin.callTool('octave_eval', { code: 'disp(1)' }).catch(() => {});
    const msgs = spy.mock.calls.map((c) => String(c[0]));
    const faults = msgs.filter((m) => m.includes('assembly fault'));
    // 至少报出 supervisor 键的装配缺陷（浏览器里 require 恒失败）
    expect(faults.length).toBeGreaterThan(0);
    expect(faults.some((m) => m.includes('"supervisor"'))).toBe(true);
  });

  it('★②b 同一键只报一次（不刷屏）', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { WebMcpPlugin } = await import('../../src/modules/plugins/webmcp/WebMcpPlugin');
    const plugin = new WebMcpPlugin();
    await plugin.callTool('octave_eval', { code: '1' }).catch(() => {});
    await plugin.callTool('octave_eval', { code: '2' }).catch(() => {});
    await plugin.callTool('octave_list_packages', {}).catch(() => {});
    const faults = spy.mock.calls.map((c) => String(c[0])).filter((m) => m.includes('assembly fault'));
    const supervisorFaults = faults.filter((m) => m.includes('"supervisor"'));
    expect(supervisorFaults.length).toBe(1);
  });

  it('★③ 后置 injectServices 合并而非覆盖（测试注入的 mock 不被组合根抹掉）', async () => {
    const { WebMcpPlugin } = await import('../../src/modules/plugins/webmcp/WebMcpPlugin');
    const mockSup = { state: 'idle', eval: async () => ({ ok: true, rc: 0, output: 'mock' }) };
    const plugin = new WebMcpPlugin({ supervisor: mockSup as any });
    plugin.injectServices({ packageManagerPlugin: { getCatalog: () => ({ packs: [] }) } as any });
    const opts = (plugin as any).options;
    expect(opts.supervisor).toBe(mockSup); // 原有注入保留
    expect(opts.packageManagerPlugin).toBeTruthy(); // 新注入补上
  });

  it('★④ 注入后工具真能跑（不注入 mock 的端到端：用真 supervisor 形状的替身但经 injectServices）', async () => {
    const { WebMcpPlugin } = await import('../../src/modules/plugins/webmcp/WebMcpPlugin');
    const plugin = new WebMcpPlugin();
    let evalCalled = false;
    plugin.injectServices({
      supervisor: {
        state: 'idle',
        eval: async () => {
          evalCalled = true;
          return { ok: true, rc: 0, output: 'ans = 1\n' };
        },
      } as any,
    });
    const res = await plugin.callTool('octave_eval', { code: 'disp(1)' });
    expect(evalCalled).toBe(true);
    expect(res.isError).toBeFalsy();
    expect((res.content[0] as any).text).toContain('ans = 1');
  });
});
