// tests/plugins/webmcp-call-stats.test.ts
// onCall 内存计数器的反向断言（spec v2 步骤 3 第 4 项 · 用户故事 11）。
//   必须做：每次调用记 {name, ok, ms, ts} 四元组；环形覆盖（丢最旧）；调试句柄可读；
//           记录经 server.callTool 真实链路产生；记录不影响调用结果（默认零行为）。
//   必须不做（红线，spec B.3 + 验收方 070）：不上 wire、不改 get_system_state 输出
//   （golden F 面盯住）；不记 args（隐私/体积）。
//
// 复跑：CI=true npx vitest run tests/plugins/webmcp-call-stats.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { WebMcpPlugin } from '../../src/modules/plugins/webmcp/WebMcpPlugin';
import { CallStats, createDebugHandle, attachDebugHandle, detachDebugHandle } from '../../src/modules/plugins/webmcp/callStats';
import type { EngineSupervisor } from '../../src/modules/engine/EngineSupervisor';
import type { ProjectWorkspace } from '../../src/modules/workspace/ProjectWorkspace';
import type { PackageManagerPlugin } from '../../src/modules/plugins/package/PackageManagerPlugin';

function makePlugin() {
  const sup = {
    isReady: true,
    state: 'idle',
    currentLane: 'wasm32-final',
    eval: async () => ({ ok: true, rc: 0, output: 'ans = 42\n' }),
    getWorkspace: async () => [],
  };
  const ws: any = {
    mode: 'notebook', activeLane: 'wasm32-final', activeFile: null, files: [], variables: [], cells: [],
    syncVariables: async () => [],
  };
  const pm: any = { getCatalog: () => ({}), loadCatalog: async () => ({}), filterPackages: () => [], getStatus: () => ({}), planInstall: async () => ({ bytes: 1, layers: [] }), installPackage: async () => ({ state: 'ok' }) };
  const plugin = new WebMcpPlugin({
    supervisor: sup as unknown as EngineSupervisor,
    projectWorkspace: ws as unknown as ProjectWorkspace,
    packageManagerPlugin: pm as unknown as PackageManagerPlugin,
    windowTarget: typeof window !== 'undefined' ? window : undefined,
    documentTarget: typeof document !== 'undefined' ? document : undefined,
  });
  plugin.init();
  return plugin;
}

describe('onCall 计数器（spec B.3：四元组环形缓冲 + 调试句柄，不上 wire）', () => {
  let plugin: WebMcpPlugin;

  beforeEach(() => {
    delete (window as any).__webmcp_debug;
    plugin = makePlugin();
  });

  it('★ 调试句柄挂载：window.__webmcp_debug.stats 可读且初始为空', () => {
    const dbg = (window as any).__webmcp_debug;
    expect(typeof dbg?.stats).toBe('function');
    expect(dbg.stats()).toEqual([]);
  });

  it('★ 成功调用记 {name, ok:true} 四元组（含 ms/ts 数值）', async () => {
    await plugin.callTool('octave_eval', { code: '1+1' });
    const recs = (window as any).__webmcp_debug.stats();
    expect(recs.length).toBe(1);
    expect(recs[0].name).toBe('octave_eval');
    expect(recs[0].ok).toBe(true);
    expect(typeof recs[0].ms).toBe('number');
    expect(typeof recs[0].ts).toBe('number');
  });

  it('★ 失败调用记 ok:false（Unknown tool 也算一次调用）', async () => {
    await plugin.callTool('no_such_tool', {});
    const recs = (window as any).__webmcp_debug.stats();
    expect(recs.length).toBe(1);
    expect(recs[0].name).toBe('no_such_tool');
    expect(recs[0].ok).toBe(false);
  });

  it('★ 不记 args（隐私/体积红线）：记录里只有四元组字段', async () => {
    await plugin.callTool('octave_eval', { code: 'SECRET_USER_CODE = 1' });
    const recs = (window as any).__webmcp_debug.stats();
    expect(Object.keys(recs[0]).sort()).toEqual(['ms', 'name', 'ok', 'ts']);
    expect(JSON.stringify(recs)).not.toContain('SECRET_USER_CODE');
  });

  it('★ 默认零行为：记录不影响调用结果（成功输出原样）', async () => {
    const res = await plugin.callTool('octave_eval', { code: '1+1' });
    expect((res.content[0] as any).text).toContain('ans = 42');
    // 再来一次也一样——计数器累积不改结果
    const res2 = await plugin.callTool('octave_eval', { code: '1+1' });
    expect((res2.content[0] as any).text).toContain('ans = 42');
    expect((window as any).__webmcp_debug.stats().length).toBe(2);
  });

  it('★ 环形覆盖：直接灌 600 条（容量 512）⇒ 只剩最新 512（丢最旧）', () => {
    const stats = new CallStats();
    for (let i = 0; i < 600; i++) stats.record(`tool_${i}`, true, 1);
    const snap = stats.stats();
    expect(snap.length).toBe(512);
    expect(snap[0].name).toBe('tool_88'); // 最旧的 88 条被环形丢弃
    expect(snap[511].name).toBe('tool_599');
  });

  it('★ 快照是副本：调用方改不动内部缓冲', () => {
    const stats = new CallStats();
    stats.record('t', true, 1);
    const snap = stats.stats();
    (snap as any).push({ name: 'injected', ok: true, ms: 0, ts: 0 });
    expect(stats.stats().length).toBe(1);
  });

  it('★ setEnabled(false) 后 record 零成本直返（观测暂停）', () => {
    const stats = new CallStats();
    stats.enabled = false;
    stats.record('t', true, 1);
    expect(stats.stats()).toEqual([]);
    stats.enabled = true;
    stats.record('t', true, 1);
    expect(stats.stats().length).toBe(1);
  });

  it('★ 不改 get_system_state 输出（golden F 面的等价断言：输出对象无 stats 键）', async () => {
    await plugin.callTool('octave_eval', { code: '1+1' }); // 先产生计数
    const res = await plugin.callTool('octave_get_system_state', {});
    const data = (res.content[0] as any).data;
    expect(Object.keys(data).sort()).toEqual(
      ['activeFile', 'activeLane', 'activeMode', 'filesCount', 'notebookCellsCount', 'supervisorState', 'variablesCount'].sort(),
    );
    expect(JSON.stringify(data)).not.toContain('stats');
  });

  it('★ destroy 卸载调试句柄（不误删后来者的）', () => {
    const handle = (window as any).__webmcp_debug;
    plugin.destroy();
    expect((window as any).__webmcp_debug).toBeUndefined();
    // 后来者语义：别处挂的新句柄不被 destroy 误删（用 CallStats 直测）
    const stats2 = new CallStats();
    const h2 = createDebugHandle(stats2);
    attachDebugHandle(window, h2);
    detachDebugHandle(window, handle); // 旧句柄再 detach 一次
    expect((window as any).__webmcp_debug).toBe(h2);
  });
});
