// tests/plugins/webmcp-identity.test.ts
// Spec v2「Testing Decisions → 反向断言清单」最后两条（前三条已各有归属）：
//   ① 恒等式 `eval(code) ≡ callTool('octave_eval',{code})`；
//   ② 删 `octave_eval` 表行必红（名册是唯一真源，不是装饰）。
//
// ── 关于①的左侧：实测发现（本文件的立论前提，必须先读）────────────────────
// spec 原文写的是 `eval(code)`（全局直柄上的 eval 快捷方式）。**本仓现行实现里
// 这个快捷方式不存在**——实测三处都拿不到：
//   · `WebMcpPlugin` 原型 = [constructor, injectServices, listTools, callTool, init, destroy]；
//   · `window.modelContext.eval` / `document.modelContext.eval` = undefined；
//   · 全 refs `git grep -n "modelContext\.eval\|eval(code: string)" -- src` = 0 命中。
// 所以这条恒等式**按字面无法成立**——不是两侧不等，而是左侧压根没有（见交付报告）。
// 本文件不改产品行为（任务硬约束），改按任务给定的实际两路写：
//   · 左侧 = legacy 事件通道（`webmcp:call` → `webmcp:response`，channels/eventChannel.ts）；
//   · 右侧 = 全局直柄（`window.modelContext.callTool('octave_eval', {code})`，channels/globalHandle.ts）。
// 二者共享同一个 `api.callTool`，断言的是「两条通道不各自加工结果」——即归一化一致。
// 一旦有人在某条通道上加包装/改写，本文件立刻红（已做变异实测，见交付报告）。
//
// ── 关于②：名册是唯一真源 ────────────────────────────────────────────────
// `createServer` 的名册是构造期静态数组（server.ts:19 `const tools = octaveToolTable`），
// **没有**名册参数。任务要求「不改产品代码，用构造参数或测试内组装」⇒ 本文件：
//   1) 把 server.ts:26-30 的 wire 投影**镜像**成纯函数，并用真 `createServer().listTools()`
//      逐字对拍（`listTools ≡ 镜像(octaveToolTable)`）——证明镜像不是自说自话；
//   2) 在同一镜像 + `dispatchTool` 上喂「不含 octave_eval 行」的名册 ⇒ 必须
//      ① listTools 不含它、② 调用返回 Unknown tool **原文案**；
//   3) 正向对照：真名册同一调用必须真跑到实现（否则「删了才 Unknown」毫无信息量）；
//   4) 行绑定：`octaveToolTable` 里的 octave_eval 必须**就是** tools/octaveEval.ts 导出的
//      那个对象 ⇒ 删行 = 实现留下但不可达 = 行为立刻变（正是「必红」要证的东西）。
//
// 归一化规则（spec「比较前屏蔽耗时/关联 id/时间戳」+ golden master 同款标记）：
//   - 循环引用 → '[Circular]'；undefined → '[Undefined]'（同 tests/plugins/
//     webmcp-golden-master.test.ts 的 normalizeForGolden）；
//   - 易变量按**键名**屏蔽成 '[Volatile]'（durationMs / elapsedMs / ms / ts /
//     timestamp / id / callId / requestId / startedAt / finishedAt）——只改值不改键存在性：
//     某一侧**丢键**仍然会红（这正是要抓的加工）。
//   - octave_eval 的响应面实测不含这些键（纯文本 content），屏蔽是防御性的。
//
// 变异实测（证明这些断言对错误实现真会红；每条都在本 worktree 里跑过并已还原）：
//   A. eventChannel 左侧给 text 追加 '\n'          ⇒ ① 10 红 / ② 5 绿（共 10 failed / 15）
//   B. window 侧 modelContext 包一层丢 isError      ⇒ ① 10 红 / ② 5 绿（共 10 failed / 15）
//   C. tools/index.ts 真删 octaveEvalTool 表行      ⇒ 14 failed（含 ② 四条前提/绑定）
//   D. octaveEval.ts 给成功文案追加 ' (mutated)'    ⇒ 7 failed（行为漂移，非 plumbing）
//   E. octaveEval.ts wire 名改成 octave_eval_v2     ⇒ 14 failed（行在但按名不可达）
//   基线（未变异）：15 passed。
//
// 复跑：CI=true npx vitest run tests/plugins/webmcp-identity.test.ts

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebMcpPlugin } from '../../src/modules/plugins/webmcp/WebMcpPlugin';
import { createServer } from '../../src/modules/plugins/webmcp/server';
import { resolveCtx } from '../../src/modules/plugins/webmcp/ctx';
import type { WebMcpCtxResolver } from '../../src/modules/plugins/webmcp/ctx';
import { dispatchTool } from '../../src/modules/plugins/webmcp/dispatcher';
import { octaveToolTable } from '../../src/modules/plugins/webmcp/tools';
import { octaveEvalTool } from '../../src/modules/plugins/webmcp/tools/octaveEval';
import type { WebMcpToolDefinition, WebMcpToolCallResult } from '../../src/modules/plugins/webmcp/types';
import type { EngineSupervisor } from '../../src/modules/engine/EngineSupervisor';
import type { ProjectWorkspace } from '../../src/modules/workspace/ProjectWorkspace';
import type { PackageManagerPlugin } from '../../src/modules/plugins/package/PackageManagerPlugin';

// ---------------------------------------------------------------------------
// 归一化
// ---------------------------------------------------------------------------

const VOLATILE_KEYS = new Set([
  'durationMs',
  'elapsedMs',
  'ms',
  'ts',
  'timestamp',
  'id',
  'callId',
  'requestId',
  'startedAt',
  'finishedAt',
]);

function normalize(value: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (value === undefined) return '[Undefined]';
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value as object)) return '[Circular]';
  seen.add(value as object);
  if (Array.isArray(value)) return value.map((v) => normalize(v, seen));
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>)) {
    // 只屏蔽值、保留键 —— 一侧丢键仍会红（见文件头归一化规则）
    out[key] = VOLATILE_KEYS.has(key)
      ? '[Volatile]'
      : normalize((value as Record<string, unknown>)[key], seen);
  }
  return out;
}

function golden(value: unknown): string {
  return JSON.stringify(normalize(value));
}

// ---------------------------------------------------------------------------
// mock 工厂（与 golden master 同款形状：默认三服务齐备）
// ---------------------------------------------------------------------------

function makeMocks() {
  const mockSupervisor: any = {
    isReady: true,
    state: 'idle',
    currentLane: 'wasm32-final',
    eval: vi.fn().mockResolvedValue({ ok: true, rc: 0, output: 'ans = 42\n' }),
  };
  const mockWorkspace: any = {
    mode: 'notebook',
    activeLane: 'wasm32-final',
    activeFile: 'script.m',
    files: [],
    variables: [],
    cells: [],
    syncVariables: vi.fn().mockResolvedValue([]),
  };
  const mockPackageManager: any = {
    getCatalog: () => ({ packs: [] }),
    loadCatalog: async () => ({ packs: [] }),
    filterPackages: () => [],
    getStatus: () => ({ compatible: true, fromSource: false, installed: false }),
    planInstall: async () => ({ bytes: 0, layers: [] }),
    installPackage: async () => ({ state: 'ok', cause: null }),
  };
  return { mockSupervisor, mockWorkspace, mockPackageManager };
}

type Mocks = ReturnType<typeof makeMocks>;

function makePlugin(mocks: Mocks): WebMcpPlugin {
  return new WebMcpPlugin({
    supervisor: mocks.mockSupervisor as unknown as EngineSupervisor,
    projectWorkspace: mocks.mockWorkspace as unknown as ProjectWorkspace,
    packageManagerPlugin: mocks.mockPackageManager as unknown as PackageManagerPlugin,
  });
}

function makeResolver(mocks: Mocks): WebMcpCtxResolver {
  const { mockSupervisor, mockWorkspace, mockPackageManager } = mocks;
  return {
    supervisor: () => mockSupervisor as unknown as EngineSupervisor,
    workspace: () => mockWorkspace as unknown as ProjectWorkspace,
    packageManager: () => mockPackageManager as unknown as PackageManagerPlugin,
  };
}

async function waitFor(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) return;
    await new Promise((r) => setTimeout(r, 5));
  }
}

// ---------------------------------------------------------------------------
// ① 恒等式矩阵：同一批 code × 两条真实路径
// ---------------------------------------------------------------------------

interface IdentityCase {
  readonly label: string;
  readonly args: Record<string, unknown> | undefined;
  /** 每例的确定性服务行为（两条路径各跑一次，必须同输入同输出） */
  readonly setup?: (mocks: Mocks) => void;
  /** 该例的响应正文（字符串分支；非序列化分支用 null 表示「text 是对象」） */
  readonly expectedText: string | null;
  readonly expectedIsError: boolean;
}

const IDENTITY_CASES: readonly IdentityCase[] = [
  {
    label: 'normal: ok with output',
    args: { code: 'ans = 42' },
    setup: (m) => m.mockSupervisor.eval.mockResolvedValue({ ok: true, rc: 0, output: 'ans = 42\n' }),
    expectedText: 'ans = 42\n',
    expectedIsError: false,
  },
  {
    label: 'normal: ok with empty output → "(execution completed with no output)"',
    args: { code: 'x = 1;' },
    setup: (m) => m.mockSupervisor.eval.mockResolvedValue({ ok: true, rc: 0, output: '' }),
    expectedText: '(execution completed with no output)',
    expectedIsError: false,
  },
  {
    label: 'failure: ok:false rc=3 with empty output → "Error (rc=3)"',
    args: { code: 'bad(' },
    setup: (m) => m.mockSupervisor.eval.mockResolvedValue({ ok: false, rc: 3, output: '' }),
    expectedText: 'Error (rc=3)',
    expectedIsError: true,
  },
  {
    label: 'failure: eval throws Error → catch-all verbatim',
    args: { code: 'boom' },
    setup: (m) => m.mockSupervisor.eval.mockRejectedValue(new Error('engine exploded')),
    expectedText: 'Execution failed for tool "octave_eval": engine exploded',
    expectedIsError: true,
  },
  {
    label: 'empty code string → old guard verbatim',
    args: { code: '' },
    expectedText: 'Error: parameter "code" is required and cannot be empty.',
    expectedIsError: true,
  },
  {
    label: 'whitespace-only code → trim empties it → same old guard',
    args: { code: '   ' },
    expectedText: 'Error: parameter "code" is required and cannot be empty.',
    expectedIsError: true,
  },
  {
    label: 'missing code key → ARGS_INVALID (dispatcher gate, before run)',
    args: {},
    expectedText: 'ARGS_INVALID: parameter "code" is required.',
    expectedIsError: true,
  },
  {
    label: 'non-string code 42 → String() coercion → success path',
    args: { code: 42 },
    setup: (m) => m.mockSupervisor.eval.mockResolvedValue({ ok: true, rc: 0, output: '42\n' }),
    expectedText: '42\n',
    expectedIsError: false,
  },
  {
    label: 'non-serializable: circular output object flows into text field',
    args: { code: 'circ' },
    setup: (m) => {
      const circular: Record<string, unknown> = { out: null };
      circular.out = circular;
      m.mockSupervisor.eval.mockResolvedValue({ ok: true, rc: 0, output: circular });
    },
    // text 是那个对象本身，不是字符串 —— 用归一化后逐字比（'[Circular]' 标记）
    expectedText: null,
    expectedIsError: false,
  },
];

describe('① 恒等式：legacy 事件通道 ≡ 全局直柄（octave_eval，全 code 矩阵）', () => {
  let mocks: Mocks;
  let plugin: WebMcpPlugin;

  beforeEach(() => {
    mocks = makeMocks();
    plugin = makePlugin(mocks);
    plugin.init();
  });

  afterEach(() => {
    plugin.destroy();
  });

  /** 左侧：legacy 事件通道（webmcp:call → webmcp:response），按调用 id 认领响应 */
  async function viaEvent(args: Record<string, unknown> | undefined, id: string): Promise<WebMcpToolCallResult> {
    const got: WebMcpToolCallResult[] = [];
    const listener = (e: Event) => {
      const detail = (e as CustomEvent<{ id?: string; result: WebMcpToolCallResult }>).detail;
      if (detail?.id === id) got.push(detail.result);
    };
    window.addEventListener('webmcp:response', listener);
    window.dispatchEvent(
      new CustomEvent('webmcp:call', { detail: { id, name: 'octave_eval', arguments: args } }),
    );
    await waitFor(() => got.length === 1);
    window.removeEventListener('webmcp:response', listener);
    expect(got.length, 'event channel must answer exactly once').toBe(1);
    return got[0];
  }

  /** 右侧：全局直柄（globalHandle attach 在 window.modelContext 的那一面） */
  async function viaGlobalHandle(args: Record<string, unknown> | undefined): Promise<WebMcpToolCallResult> {
    const handle = (window as unknown as { modelContext?: { callTool(n: string, a?: Record<string, unknown>): Promise<WebMcpToolCallResult> } }).modelContext;
    expect(handle, 'global handle must be mounted by init()').toBeTruthy();
    return handle!.callTool('octave_eval', args);
  }

  for (const c of IDENTITY_CASES) {
    it(`identity | ${c.label}`, async () => {
      c.setup?.(mocks);
      const left = await viaEvent(c.args, `id-${c.label}`);
      const right = await viaGlobalHandle(c.args);

      // 逐字等价（含键序）：归一化后 JSON 串同串
      expect(golden(left)).toBe(golden(right));

      // 两侧都必须符合该例的期望（否则「两侧一致地错」也能骗过恒等式）
      expect(left.isError ?? false).toBe(c.expectedIsError);
      expect(right.isError ?? false).toBe(c.expectedIsError);
      if (c.expectedText !== null) {
        expect((left.content[0] as { text?: string }).text).toBe(c.expectedText);
        expect((right.content[0] as { text?: string }).text).toBe(c.expectedText);
      } else {
        // 非序列化分支：text 不是字符串，归一化后是循环标记
        expect(typeof (left.content[0] as { text?: unknown }).text).toBe('object');
        expect(golden(left.content)).toContain('[Circular]');
      }
    });
  }

  it('identity | unknown tool not named octave_eval is not silently swallowed by either path', async () => {
    // 反向对照：两路对「不在名册」的反应也必须一致（不是只对 octave_eval 成立）
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const leftGot: WebMcpToolCallResult[] = [];
    const listener = (e: Event) => {
      const detail = (e as CustomEvent<{ id?: string; result: WebMcpToolCallResult }>).detail;
      if (detail?.id === 'unknown-cross') leftGot.push(detail.result);
    };
    window.addEventListener('webmcp:response', listener);
    window.dispatchEvent(
      new CustomEvent('webmcp:call', {
        detail: { id: 'unknown-cross', name: 'not_a_tool', arguments: {} },
      }),
    );
    await waitFor(() => leftGot.length === 1);
    window.removeEventListener('webmcp:response', listener);
    const right = await viaGlobalHandleFor('not_a_tool');
    expect(golden(leftGot[0])).toBe(golden(right));
    consoleError.mockRestore();
  });

  async function viaGlobalHandleFor(name: string): Promise<WebMcpToolCallResult> {
    const handle = (window as unknown as { modelContext?: { callTool(n: string, a?: Record<string, unknown>): Promise<WebMcpToolCallResult> } }).modelContext;
    expect(handle).toBeTruthy();
    return handle!.callTool(name, {});
  }
});

// ---------------------------------------------------------------------------
// ② 删 octave_eval 表行必红：名册是唯一真源
// ---------------------------------------------------------------------------

/** server.ts:26-30 的 wire 投影镜像（name → description → parameters，键序不动） */
function projectWire(roster: readonly { name: string; description: string; parameters: WebMcpToolDefinition['parameters'] }[]): WebMcpToolDefinition[] {
  return roster.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }));
}

describe('② 名册是唯一真源：删 octave_eval 表行必红', () => {
  let mocks: Mocks;
  let resolver: WebMcpCtxResolver;

  beforeEach(() => {
    mocks = makeMocks();
    resolver = makeResolver(mocks);
  });

  it('anchor | wire 投影镜像 ≡ 真 createServer().listTools()（镜像不是自说自话）', async () => {
    const server = createServer(
      resolveCtx(() => ({
        supervisor: mocks.mockSupervisor as unknown as EngineSupervisor,
        projectWorkspace: mocks.mockWorkspace as unknown as ProjectWorkspace,
        packageManagerPlugin: mocks.mockPackageManager as unknown as PackageManagerPlugin,
      })),
    );
    const real = await server.listTools();
    // 逐字（含键序）—— 镜像若漂了，删表行那条断言就失去锚点
    expect(JSON.stringify(projectWire(octaveToolTable))).toBe(JSON.stringify(real));
    expect(real.map((t) => t.name)).toContain('octave_eval');
  });

  it('row binding | 名册里的 octave_eval 就是 tools/octaveEval.ts 导出的那个对象', () => {
    const rows = octaveToolTable.filter((t) => t.name === 'octave_eval');
    expect(rows, 'octave_eval must occupy exactly one row in the roster').toHaveLength(1);
    // ★ 关键：同一对象引用 ⇒ 删行 = 实现留下但不可达（行为立刻变）
    expect(rows[0], 'roster row must be the exported tool object, not a copy').toBe(octaveEvalTool);
    expect(octaveToolTable).toContain(octaveEvalTool);
  });

  it('positive control | 真名册同一调用必须真跑到实现（否则「删了才 Unknown」没信息量）', async () => {
    const res = await dispatchTool(octaveToolTable, resolver, 'octave_eval', { code: 'x=1' });
    expect(res.isError ?? false).toBe(false);
    expect((res.content[0] as { text?: string }).text).toBe('ans = 42\n');
    expect(mocks.mockSupervisor.eval).toHaveBeenCalledTimes(1);
  });

  it('★ 删行 ⇒ listTools 不含它 + 调用返回 Unknown tool 原文案（该报的必须报）', async () => {
    // 前提（这条前提本身就是「删表行必红」的红点：真名册一旦被删行，这里立刻红）
    expect(
      octaveToolTable.map((t) => t.name),
      'octave_eval must be in the real roster — deleting that row is exactly what this assertion guards',
    ).toContain('octave_eval');

    // 模拟「实现文件留着、名册里那一行被删掉」——用同一投影 + 同一分发机
    const withoutRow = octaveToolTable.filter((t) => t !== octaveEvalTool);
    expect(withoutRow).toHaveLength(octaveToolTable.length - 1);

    // ① wire 面立即消失
    const listed = projectWire(withoutRow);
    expect(listed.map((t) => t.name)).not.toContain('octave_eval');

    // ② 调用落到旧路径原文案（不是 CAPABILITY、不是静默成功）
    const res = await dispatchTool(withoutRow, resolver, 'octave_eval', { code: 'x=1' });
    expect(res.isError).toBe(true);
    expect((res.content[0] as { text?: string }).text).toBe(
      'Unknown tool name: "octave_eval". Use listTools() to see available tools.',
    );
    // 实现代码一次都没被执行（名册是唯一入口）
    expect(mocks.mockSupervisor.eval).not.toHaveBeenCalled();
  });

  it('★ 删行断言本身可证伪：把行放回去，同一条调用立刻恢复实现路径', async () => {
    const withRow = octaveToolTable.filter((t) => t === octaveEvalTool);
    expect(withRow).toHaveLength(1);
    const res = await dispatchTool(withRow, resolver, 'octave_eval', { code: 'x=1' });
    expect((res.content[0] as { text?: string }).text).toBe('ans = 42\n');
    // 与上一条只差「行在不在」，结果从 Unknown tool 翻成实现输出
    expect((res.content[0] as { text?: string }).text).not.toContain('Unknown tool name');
  });
});
