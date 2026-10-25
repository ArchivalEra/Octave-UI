// tests/plugins/webmcp-golden-master.test.ts
// WebMCP 重构 · 步骤 0：对旧实现（src/modules/plugins/webmcp/WebMcpPlugin.ts @03933ee）录 golden master。
//
// 形状纪律：本文件不判断「对错」，只「录制现状」。每个用例把 callTool 的完整
// WebMcpToolCallResult 交给 golden() 序列化后 toMatchSnapshot() —— 快照文件
// （__snapshots__/webmcp-golden-master.test.ts.snap）就是 golden master 的物理载体。
// 步骤 2 骨架迁移的验收 = CI 模式（CI=true）跑本文件对旧快照零差异。
//
// 快照载体为什么是 JSON 字符串而不是对象：
//   vitest 默认对象序列化器会把键**字母排序**（源对象 {type, text} 会录成
//   "text" 在 "type" 前）—— 键序黄金会被无声销毁。JSON.stringify 保插入序，
//   因此 golden() = JSON.stringify(normalizeForGolden(res))，快照录的是这个字符串。
//
// 归一化说明（spec Testing Decisions「比较前屏蔽耗时/关联 id/时间戳」）：
//   已逐工具检查旧实现的响应面 —— 旧 callTool 的所有分支都不自产耗时/时间戳/调用 id
//   字段（octave_run_cell resource data 里的 durationMs 来自 mock 的 cell.durationMs
//   —— 测试固定为 null，不是旧实现自测的时间量），因此 normalizeForGolden() 不需要
//   屏蔽任何字段，只做两件事：循环引用标记 + undefined 保真标记。唯一的外部 id 是
//   事件通道 detail.id，由调用方（测试）提供、逐字回显 —— 对 id 做字面量断言、对
//   result 走快照，互不污染。
//
// mock 语义注意（录制中发现，如实记录）：
//   - PackageManagerPlugin.filterPackages 在旧实现里被**同步调用且不 await**
//     （WebMcpPlugin.ts:299 `const list = pm.filterPackages({...})`）—— 对它注入
//     「rejected Promise」录到的不是 throw 路径而是 `list.map is not a function`
//     TypeError（Promise 没有 .map）。因此异常矩阵对 list_packages 用**同步 throw**
//     注入（忠实于真实服务的同步契约），Promise 形状的返回值单独录成
//     「A-extra」用例 —— 那也是旧实现的真行为。
//   - octave_get_system_state 是纯同步读取（无 awaited 服务调用）—— 异常矩阵对它
//     用 throwing getter 触达 catch-all。
//   - crashed 语义：旧 callTool **没有任何 crashed 守卫** —— supervisor.eval 抛出的
//     EngineCrashedError 直接落进 catch-all（A8 实录）。octave_run_cell 是例外：
//     真 ProjectWorkspace.executeCell 把 eval 异常吞成 {ok:false, rc:-1, output:msg}
//     （ProjectWorkspace.ts catch 分支），于是 WebMCP 拿到「普通失败」resource 而非
//     catch-all —— A8 按真形状录。
//   - booting 语义（B.4）：旧 callTool 没有 booting 分支 —— 排队发生在真 supervisor
//     内部（booting 不拦、直接入队）。mock 层用「慢速 resolve 的 eval」录
//     「排队后返回结果」形状；get_workspace 在 ws 缺席 + isReady=false 时走 `: []`
//     分支（booting 不算 ready）。
//
// 本文件对 src/ 零改动（纯录制步骤）。

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebMcpPlugin } from '../../src/modules/plugins/webmcp/WebMcpPlugin';
import { EngineCrashedError } from '../../src/modules/engine/types';
import type { EngineSupervisor } from '../../src/modules/engine/EngineSupervisor';
import type { ProjectWorkspace } from '../../src/modules/workspace/ProjectWorkspace';
import type { PackageManagerPlugin } from '../../src/modules/plugins/package/PackageManagerPlugin';
import type { WebMcpToolCallResult } from '../../src/modules/plugins/webmcp/types';

// ---------------------------------------------------------------------------
// 归一化 helper：所有快照统一入口。
// - 循环引用 → '[Circular]' 标记（mock 可能返回带循环的 data，序列化不能崩）；
// - undefined 值 → '[Undefined]' 标记（JSON.stringify 会把值为 undefined 的对象字段
//   静默丢掉 —— 那是「键不存在」而不是「值是 undefined」，两者对步骤 2 对拍是不同
//   形状，必须区分）；
// - 其余值原样（键序 = 对象插入序 = 旧实现产出序）。
// golden() 最后 JSON.stringify 成字符串 —— 键序载体（见文件头说明）。
// ---------------------------------------------------------------------------

function normalizeForGolden(value: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (value === undefined) return '[Undefined]';
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value as object)) return '[Circular]';
  seen.add(value as object);
  if (Array.isArray(value)) {
    return value.map((v) => normalizeForGolden(v, seen));
  }
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>)) {
    out[key] = normalizeForGolden((value as Record<string, unknown>)[key], seen);
  }
  return out;
}

function golden(res: WebMcpToolCallResult): string {
  return JSON.stringify(normalizeForGolden(res));
}

// 事件通道响应 detail 的形状：{ id, result } —— id 是调用方回显，单独字面量断言；
// result 走与直柄完全相同的 golden() 序列化。
function goldenEventResult(detail: { id?: string; result: WebMcpToolCallResult }): string {
  return JSON.stringify(normalizeForGolden(detail.result));
}

// ---------------------------------------------------------------------------
// mock 工厂：默认三服务全注入（与既有 tests/plugins/WebMcpPlugin.test.ts 同形状），
// per-case 覆写某个方法。getCatalog() 默认返回真值对象（跳过 loadCatalog 分支）。
// ---------------------------------------------------------------------------

function makeMocks() {
  const mockSupervisor: any = {
    isReady: true,
    state: 'idle',
    currentLane: 'wasm32-final',
    eval: vi.fn().mockResolvedValue({ ok: true, rc: 0, output: 'ans = 42\n' }),
    getWorkspace: vi.fn().mockResolvedValue([
      { name: 'ans', type: 'scalar', dimensions: '1x1', bytes: 8, valuePreview: '42' },
    ]),
  };

  const mockWorkspace: any = {
    mode: 'notebook',
    activeLane: 'wasm32-final',
    activeFile: 'script.m',
    files: [{ name: 'script.m', kind: 'file', size: 120 }],
    variables: [
      { name: 'ans', type: 'scalar', dimensions: '1x1', bytes: 8, valuePreview: '42' },
      { name: 'x', type: 'scalar', dimensions: '1x1', bytes: 8, valuePreview: '10' },
    ],
    cells: [
      {
        id: 'cell-1',
        title: 'Section 1',
        description: '',
        code: 'x = 10',
        status: 'idle',
        executionCount: null,
        durationMs: null,
        streamingOutput: '',
      },
    ],
    executeCell: vi.fn().mockResolvedValue({ ok: true, rc: 0, output: 'x = 10\n' }),
    syncVariables: vi.fn().mockResolvedValue([
      { name: 'ans', type: 'scalar', dimensions: '1x1', bytes: 8, valuePreview: '42' },
      { name: 'x', type: 'scalar', dimensions: '1x1', bytes: 8, valuePreview: '10' },
    ]),
  };

  const mockPackageManager: any = {
    getCatalog: vi.fn().mockReturnValue({ packs: [] }),
    loadCatalog: vi.fn().mockResolvedValue({ packs: [] }),
    filterPackages: vi.fn().mockReturnValue([
      {
        name: 'signal',
        version: '1.4.5',
        description: 'Signal processing toolbox',
        consumer: 'octave',
        form: 'pkg',
        size: 1048576,
        deps: ['control'],
      },
    ]),
    getStatus: vi.fn().mockReturnValue({
      compatible: true,
      fromSource: false,
      installed: false,
    }),
    planInstall: vi.fn().mockResolvedValue({
      name: 'signal',
      version: 'latest',
      bytes: 1048576,
      layers: ['openblas'],
      extraSize: 0,
    }),
    installPackage: vi.fn().mockResolvedValue({
      state: 'ok',
      cause: null,
    }),
  };

  return { mockSupervisor, mockWorkspace, mockPackageManager };
}

// 旧实现的调用入参集：与各工具真实 wire 契约一致的「正常参数」。
const TYPICAL_ARGS: Record<string, Record<string, unknown>> = {
  octave_eval: { code: 'ans = 42' },
  octave_run_cell: { index: 0 },
  octave_get_workspace: {},
  octave_list_packages: { query: 'signal', consumer: 'octave' },
  octave_install_package: { name: 'signal', planOnly: true },
  octave_get_system_state: {},
};

const TOOL_NAMES = [
  'octave_eval',
  'octave_run_cell',
  'octave_get_workspace',
  'octave_list_packages',
  'octave_install_package',
  'octave_get_system_state',
] as const;

type ToolName = (typeof TOOL_NAMES)[number];

// 每工具触达的主服务 mock 方法（用于统一覆写成 throw / resolve undefined）。
// - octave_eval: supervisor.eval（awaited）
// - octave_run_cell: workspace.executeCell（awaited）
// - octave_get_workspace: workspace.syncVariables（awaited；ws 注入时恒走 ws 分支）
// - octave_list_packages: pm.filterPackages（**同步、不 await** —— 见文件头注意）
// - octave_install_package: pm.planInstall（awaited；TYPICAL_ARGS 用 planOnly:true）
// - octave_get_system_state: 同步读取，无 awaited 服务调用 → null
function primaryServiceCall(tool: ToolName, m: ReturnType<typeof makeMocks>): any | null {
  switch (tool) {
    case 'octave_eval':
      return m.mockSupervisor.eval;
    case 'octave_run_cell':
      return m.mockWorkspace.executeCell;
    case 'octave_get_workspace':
      return m.mockWorkspace.syncVariables;
    case 'octave_list_packages':
      return m.mockPackageManager.filterPackages;
    case 'octave_install_package':
      return m.mockPackageManager.planInstall;
    case 'octave_get_system_state':
      return null;
  }
}

// 真实服务里被旧实现**同步调用**的方法（throw 注入必须同步才忠实）。
const SYNC_SERVICE_TOOLS: ReadonlySet<ToolName> = new Set(['octave_list_packages']);

type FaultKind = 'error' | 'string' | 'undefined' | 'resolveUndefined';

// 统一故障注入：按服务调用形态（awaited / 同步 / 无服务调用）选注入方式。
function applyFault(tool: ToolName, m: ReturnType<typeof makeMocks>, kind: FaultKind): void {
  const fn = primaryServiceCall(tool, m);
  if (!fn) {
    // octave_get_system_state：纯同步读取 —— 用 throwing getter 触达 catch-all；
    // resolveUndefined 场景则让变量源本身是 undefined。
    if (kind === 'resolveUndefined') {
      Object.defineProperty(m.mockWorkspace, 'variables', {
        configurable: true,
        get: () => undefined,
      });
    } else {
      const thrown =
        kind === 'error' ? new Error('sync getter blowup') : kind === 'string' ? 'raw string failure' : undefined;
      Object.defineProperty(m.mockWorkspace, 'cells', {
        configurable: true,
        get() {
          throw thrown;
        },
      });
    }
    return;
  }
  if (SYNC_SERVICE_TOOLS.has(tool)) {
    if (kind === 'resolveUndefined') fn.mockReturnValueOnce(undefined);
    else if (kind === 'error') fn.mockImplementationOnce(() => { throw new Error('service exploded'); });
    else if (kind === 'string') fn.mockImplementationOnce(() => { throw 'raw string failure'; });
    else fn.mockImplementationOnce(() => { throw undefined; });
  } else {
    if (kind === 'resolveUndefined') fn.mockResolvedValueOnce(undefined);
    else if (kind === 'error') fn.mockRejectedValueOnce(new Error('service exploded'));
    else if (kind === 'string') fn.mockImplementationOnce(() => Promise.reject('raw string failure'));
    else fn.mockImplementationOnce(() => Promise.reject(undefined));
  }
}

const FAULT_KINDS: Array<{ kind: FaultKind; label: string }> = [
  { kind: 'error', label: 'throw Error' },
  { kind: 'string', label: "throw 'string'" },
  { kind: 'undefined', label: 'throw undefined' },
  { kind: 'resolveUndefined', label: 'resolve undefined' },
];

// ---------------------------------------------------------------------------
// 测试主体
// ---------------------------------------------------------------------------

describe('WebMCP golden master (step 0, recorded against old implementation)', () => {
  let mocks: ReturnType<typeof makeMocks>;
  let plugin: WebMcpPlugin;

  beforeEach(() => {
    mocks = makeMocks();
    plugin = new WebMcpPlugin({
      supervisor: mocks.mockSupervisor as unknown as EngineSupervisor,
      projectWorkspace: mocks.mockWorkspace as unknown as ProjectWorkspace,
      packageManagerPlugin: mocks.mockPackageManager as unknown as PackageManagerPlugin,
    });
  });

  afterEach(() => {
    plugin.destroy();
  });

  // =========================================================================
  // A. 每工具 × 场景矩阵（spec Testing Decisions 逐条 + B.5 补录项）
  // =========================================================================

  describe('A1. success: per-tool full response with typical args', () => {
    for (const tool of TOOL_NAMES) {
      it(`success | ${tool} | typical args → full response`, async () => {
        const res = await plugin.callTool(tool, TYPICAL_ARGS[tool]);
        expect(golden(res)).toMatchSnapshot();
      });
    }
  });

  for (const { kind, label } of FAULT_KINDS) {
    describe(`A2-A5. fault injection: ${label} on primary service call`, () => {
      for (const tool of TOOL_NAMES) {
        it(`${label} | ${tool} → downstream shape`, async () => {
          applyFault(tool, mocks, kind);
          const res = await plugin.callTool(tool, TYPICAL_ARGS[tool]);
          expect(golden(res)).toMatchSnapshot();
        });
      }
    });
  }

  describe('A-extra. resolve undefined on the non-primary path of install (real-install branch)', () => {
    it('resolve undefined | octave_install_package | planOnly=false, installPackage resolves undefined → reading "state" TypeError', async () => {
      mocks.mockPackageManager.installPackage.mockResolvedValueOnce(undefined);
      const res = await plugin.callTool('octave_install_package', { name: 'signal' });
      expect(golden(res)).toMatchSnapshot();
    });
  });

  describe('A-extra. sync service returning a Promise (old code calls filterPackages without await)', () => {
    // 旧实现 :299 `const list = pm.filterPackages({...})` 不 await —— 若服务返回
    // Promise（真实 filterPackages 是同步的，但这是旧代码面对异步形状时的真行为），
    // `.map` 在 Promise 上当场 TypeError，服务的 rejection 被晾成 unhandled。
    it('filterPackages returns rejected Promise → "list.map is not a function" TypeError → catch-all', async () => {
      mocks.mockPackageManager.filterPackages.mockRejectedValueOnce(new Error('async service exploded'));
      const res = await plugin.callTool('octave_list_packages', {});
      expect(golden(res)).toMatchSnapshot();
    });

    it('filterPackages returns Promise resolving undefined → same "list.map is not a function" TypeError', async () => {
      mocks.mockPackageManager.filterPackages.mockResolvedValueOnce(undefined);
      const res = await plugin.callTool('octave_list_packages', {});
      expect(golden(res)).toMatchSnapshot();
    });
  });

  describe('A6. non-serializable value: circular reference flowing into response (B.5)', () => {
    it('circular | octave_eval | eval output field is a circular object → text field is that object, not a string', async () => {
      const circular: Record<string, unknown> = { out: null };
      circular.out = circular;
      mocks.mockSupervisor.eval.mockResolvedValueOnce({
        ok: true,
        rc: 0,
        output: circular as unknown as string,
      });
      const res = await plugin.callTool('octave_eval', { code: 'ans = 42' });
      expect(golden(res)).toMatchSnapshot();
    });

    it('circular | octave_run_cell | cell.streamingOutput is circular → data.output is that object', async () => {
      mocks.mockWorkspace.cells[0].streamingOutput = { circular: null } as unknown as string;
      (mocks.mockWorkspace.cells[0].streamingOutput as any).circular =
        mocks.mockWorkspace.cells[0].streamingOutput;
      const res = await plugin.callTool('octave_run_cell', { index: 0 });
      expect(golden(res)).toMatchSnapshot();
    });

    it('circular | octave_get_workspace | variable valuePreview is circular → data.variables[].valuePreview is that object', async () => {
      const circular: Record<string, unknown> = { preview: null };
      circular.preview = circular;
      mocks.mockWorkspace.syncVariables.mockResolvedValueOnce([
        { name: 'ans', type: 'scalar', dimensions: '1x1', bytes: 8, valuePreview: circular as unknown as string },
      ]);
      const res = await plugin.callTool('octave_get_workspace', {});
      expect(golden(res)).toMatchSnapshot();
    });

    it('circular | octave_list_packages | package deps array self-references → mapped entry keeps circular field', async () => {
      const circularDeps: unknown[] = ['control'];
      circularDeps.push(circularDeps);
      mocks.mockPackageManager.filterPackages.mockReturnValueOnce([
        {
          name: 'signal',
          version: '1.4.5',
          description: 'Signal processing toolbox',
          consumer: 'octave',
          form: 'pkg',
          size: 1048576,
          deps: circularDeps as string[],
        },
      ]);
      const res = await plugin.callTool('octave_list_packages', {});
      expect(golden(res)).toMatchSnapshot();
    });

    it('circular | octave_install_package | installPackage resolves circular InstallResult → data IS the circular object', async () => {
      const circular: Record<string, unknown> = { state: 'ok', payload: null };
      circular.payload = circular;
      mocks.mockPackageManager.installPackage.mockResolvedValueOnce(circular);
      const res = await plugin.callTool('octave_install_package', { name: 'signal' });
      expect(golden(res)).toMatchSnapshot();
    });

    it('circular | octave_get_system_state | ws.activeFile is circular → data.activeFile is that object', async () => {
      const circular: Record<string, unknown> = { file: null };
      circular.file = circular;
      mocks.mockWorkspace.activeFile = circular;
      const res = await plugin.callTool('octave_get_system_state', {});
      expect(golden(res)).toMatchSnapshot();
    });
  });

  describe('A7. boundary: missing / empty / illegal-typed args', () => {
    it('boundary | octave_eval | missing code arg → guard', async () => {
      const res = await plugin.callTool('octave_eval', {});
      expect(golden(res)).toMatchSnapshot();
    });

    it('boundary | octave_eval | callTool invoked with no args object at all (default {} → same guard)', async () => {
      const res = await plugin.callTool('octave_eval');
      expect(golden(res)).toMatchSnapshot();
    });

    it('boundary | octave_eval | code is non-string (number 42) → String() coercion → success path', async () => {
      const res = await plugin.callTool('octave_eval', { code: 42 });
      expect(golden(res)).toMatchSnapshot();
    });

    it('boundary | octave_run_cell | missing both cellId and index → not-found guard', async () => {
      const res = await plugin.callTool('octave_run_cell', {});
      expect(golden(res)).toMatchSnapshot();
    });

    it('boundary | octave_run_cell | index passed as string "0" (illegal type) → typeof check routes to not-found guard', async () => {
      const res = await plugin.callTool('octave_run_cell', { index: '0' });
      expect(golden(res)).toMatchSnapshot();
    });

    it('boundary | octave_run_cell | out-of-range index 99 → cells[99] undefined → not-found guard', async () => {
      const res = await plugin.callTool('octave_run_cell', { index: 99 });
      expect(golden(res)).toMatchSnapshot();
    });

    it('boundary | octave_list_packages | installedOnly passed as "yes" (illegal type) → Boolean("yes") = true', async () => {
      const res = await plugin.callTool('octave_list_packages', { installedOnly: 'yes' });
      expect(golden(res)).toMatchSnapshot();
      // 顺带录 filterPackages 实际收到的入参（旧实现的类型收敛行为）
      expect(mocks.mockPackageManager.filterPackages).toHaveBeenCalledWith({
        query: '',
        consumer: 'all',
        form: 'all',
        installedOnly: true,
      });
    });

    it('boundary | octave_list_packages | consumer passed as number 5 (illegal type) → passed through verbatim', async () => {
      const res = await plugin.callTool('octave_list_packages', { consumer: 5 });
      expect(golden(res)).toMatchSnapshot();
      expect(mocks.mockPackageManager.filterPackages).toHaveBeenCalledWith({
        query: '',
        consumer: 5,
        form: 'all',
        installedOnly: false,
      });
    });

    it('boundary | octave_install_package | missing name → guard', async () => {
      const res = await plugin.callTool('octave_install_package', {});
      expect(golden(res)).toMatchSnapshot();
    });

    it('boundary | octave_install_package | name passed as number 42 → String() coercion → success path', async () => {
      const res = await plugin.callTool('octave_install_package', { name: 42 });
      expect(golden(res)).toMatchSnapshot();
      expect(mocks.mockPackageManager.planInstall).not.toHaveBeenCalled();
    });

    it('boundary | octave_install_package | planOnly passed as "truthy-string" → Boolean() = true → plan path', async () => {
      const res = await plugin.callTool('octave_install_package', {
        name: 'signal',
        planOnly: 'truthy-string',
      });
      expect(golden(res)).toMatchSnapshot();
      expect(mocks.mockPackageManager.installPackage).not.toHaveBeenCalled();
    });

    it('boundary | octave_get_workspace | no-param tool given bogus args → args ignored, success shape', async () => {
      const res = await plugin.callTool('octave_get_workspace', { bogus: 'x', code: 1 });
      expect(golden(res)).toMatchSnapshot();
    });

    it('boundary | octave_get_system_state | no-param tool given bogus args → args ignored, success shape', async () => {
      const res = await plugin.callTool('octave_get_system_state', { bogus: 'x', code: 1 });
      expect(golden(res)).toMatchSnapshot();
    });
  });

  describe('A8. crashed: supervisor state=crashed (record old path — no guard in old callTool)', () => {
    // 旧 callTool 没有 crashed 守卫 —— supervisor.eval 的 EngineCrashedError 直接落
    // catch-all。用真 EngineCrashedError（即真 supervisor 在 crashed 态对 eval 的拒法，
    // EngineSupervisor.eval:529-536：cause:'trap', started:false, message 如下）。
    it('crashed | octave_eval | eval rejects with EngineCrashedError → swallowed by catch-all', async () => {
      mocks.mockSupervisor.state = 'crashed';
      mocks.mockSupervisor.eval.mockRejectedValueOnce(
        new EngineCrashedError({
          cause: 'trap',
          started: false,
          epoch: 3,
          message: `Cannot eval: Engine is in 'crashed' state.`,
        })
      );
      const res = await plugin.callTool('octave_eval', { code: 'ans = 42' });
      expect(golden(res)).toMatchSnapshot();
    });

    it('failed | octave_eval | state=failed, EngineCrashedError(cause boot-failed) → same catch-all, different message', async () => {
      mocks.mockSupervisor.state = 'failed';
      mocks.mockSupervisor.eval.mockRejectedValueOnce(
        new EngineCrashedError({
          cause: 'boot-failed',
          started: false,
          epoch: 3,
          message: `Cannot eval: Engine is in 'failed' state.`,
        })
      );
      const res = await plugin.callTool('octave_eval', { code: 'ans = 42' });
      expect(golden(res)).toMatchSnapshot();
    });

    it('crashed | octave_run_cell | real executeCell swallows crash into EvalResult {ok:false} → isError resource, not catch-all', async () => {
      // 真 ProjectWorkspace.executeCell 把 eval 抛的异常吞成 {ok:false, rc:-1, output:msg}
      // （ProjectWorkspace.ts catch 分支）—— WebMCP 于是拿到「普通失败」resource。
      mocks.mockSupervisor.state = 'crashed';
      mocks.mockWorkspace.executeCell.mockResolvedValueOnce({
        ok: false,
        rc: -1,
        output: `Cannot eval: Engine is in 'crashed' state.`,
      });
      const res = await plugin.callTool('octave_run_cell', { index: 0 });
      expect(golden(res)).toMatchSnapshot();
    });

    it('crashed | octave_get_workspace | ws.syncVariables rejects with EngineCrashedError → catch-all', async () => {
      mocks.mockSupervisor.state = 'crashed';
      mocks.mockWorkspace.syncVariables.mockRejectedValueOnce(
        new EngineCrashedError({
          cause: 'trap',
          started: false,
          epoch: 3,
          message: `Cannot eval: Engine is in 'crashed' state.`,
        })
      );
      const res = await plugin.callTool('octave_get_workspace', {});
      expect(golden(res)).toMatchSnapshot();
    });

    it('crashed | octave_get_system_state | sup.state=crashed → state passthrough, no error', async () => {
      mocks.mockSupervisor.state = 'crashed';
      const res = await plugin.callTool('octave_get_system_state', {});
      expect(golden(res)).toMatchSnapshot();
    });
  });

  describe('A9. booting: supervisor state=booting queues and still returns result (B.4)', () => {
    it('booting | octave_eval | slow eval (50ms) still resolves → queued-then-result shape', async () => {
      mocks.mockSupervisor.state = 'booting';
      mocks.mockSupervisor.isReady = false;
      mocks.mockSupervisor.eval.mockImplementationOnce(
        () => new Promise((r) => setTimeout(() => r({ ok: true, rc: 0, output: 'booted ans = 42\n' }), 50))
      );
      const res = await plugin.callTool('octave_eval', { code: 'ans = 42' });
      expect(golden(res)).toMatchSnapshot();
    });

    it('booting | octave_get_workspace | ws absent, sup.isReady=false → falls to [] without calling sup.getWorkspace', async () => {
      // booting 不算 ready（isReady = idle|busy）⇒ `sup?.isReady ? ... : []` 直接 []。
      // 插件层没有排队 —— 排队只存在于真 supervisor 的 eval 路径（B.4 实证）。
      const bootingPlugin = new WebMcpPlugin({
        supervisor: mocks.mockSupervisor as unknown as EngineSupervisor,
        packageManagerPlugin: mocks.mockPackageManager as unknown as PackageManagerPlugin,
      });
      mocks.mockSupervisor.state = 'booting';
      mocks.mockSupervisor.isReady = false;
      mocks.mockSupervisor.getWorkspace.mockImplementation(
        () =>
          new Promise((r) =>
            setTimeout(() => r([{ name: 'ans', type: 'scalar', dimensions: '1x1', bytes: 8, valuePreview: '42' }]), 50)
          )
      );
      const res = await bootingPlugin.callTool('octave_get_workspace', {});
      expect(golden(res)).toMatchSnapshot();
      expect(mocks.mockSupervisor.getWorkspace).not.toHaveBeenCalled();
      bootingPlugin.destroy();
    });
  });

  // =========================================================================
  // F. 既有守卫（保真清单候选：空 code / 缺 name / 服务缺席 / catalog 兜底）
  // =========================================================================

  describe('F. existing guards (fidelity-list candidates)', () => {
    it('guard | octave_eval | empty-string code → "parameter code is required"', async () => {
      const res = await plugin.callTool('octave_eval', { code: '' });
      expect(golden(res)).toMatchSnapshot();
    });

    it('guard | octave_eval | whitespace-only code → trim() empties it → same guard', async () => {
      const res = await plugin.callTool('octave_eval', { code: '   ' });
      expect(golden(res)).toMatchSnapshot();
    });

    it('guard | octave_install_package | empty-string name → "parameter name is required"', async () => {
      const res = await plugin.callTool('octave_install_package', { name: '' });
      expect(golden(res)).toMatchSnapshot();
    });

    it('guard | octave_install_package | whitespace-only name → same guard', async () => {
      const res = await plugin.callTool('octave_install_package', { name: '   ' });
      expect(golden(res)).toMatchSnapshot();
    });

    it('guard | octave_eval | supervisor service not injected → "EngineSupervisor service is not available"', async () => {
      // 空 services 对象（三服务全缺席）—— 旧实现的 require('../../appContext')
      // 惰性解析在测试环境里拿不到服务，走 catch 返回 undefined ⇒ 与「未注入」同路。
      const bare = new WebMcpPlugin({});
      const res = await bare.callTool('octave_eval', { code: 'x=1' });
      expect(golden(res)).toMatchSnapshot();
    });

    it('guard | octave_run_cell | workspace service not injected → "ProjectWorkspace service is not available"', async () => {
      const bare = new WebMcpPlugin({});
      const res = await bare.callTool('octave_run_cell', { index: 0 });
      expect(golden(res)).toMatchSnapshot();
    });

    it('guard | octave_list_packages | package manager not injected → "PackageManagerPlugin is not available"', async () => {
      const bare = new WebMcpPlugin({});
      const res = await bare.callTool('octave_list_packages', {});
      expect(golden(res)).toMatchSnapshot();
    });

    it('guard | octave_install_package | package manager not injected → "PackageManagerPlugin is not available"', async () => {
      const bare = new WebMcpPlugin({});
      const res = await bare.callTool('octave_install_package', { name: 'signal' });
      expect(golden(res)).toMatchSnapshot();
    });

    it('guard | octave_list_packages | catalog missing → loadCatalog() runs, its rejection is swallowed (.catch(()=>{}))', async () => {
      mocks.mockPackageManager.getCatalog.mockReturnValueOnce(null);
      mocks.mockPackageManager.loadCatalog.mockRejectedValueOnce(new Error('catalog fetch failed'));
      const res = await plugin.callTool('octave_list_packages', {});
      expect(golden(res)).toMatchSnapshot();
      expect(mocks.mockPackageManager.loadCatalog).toHaveBeenCalledTimes(1);
    });

    it('guard | octave_get_workspace | ws.syncVariables resolves [] (empty workspace) → count 0 shape', async () => {
      mocks.mockWorkspace.syncVariables.mockResolvedValueOnce([]);
      const res = await plugin.callTool('octave_get_workspace', {});
      expect(golden(res)).toMatchSnapshot();
    });
  });

  // =========================================================================
  // C. 协议级
  // =========================================================================

  describe('C. protocol level', () => {
    it('listTools() full response: 7 tool schemas with key order (6 octave byte-identical + omc_load_msl appended)', async () => {
      const tools = await plugin.listTools();
      expect(JSON.stringify(normalizeForGolden(tools))).toMatchSnapshot();
    });

    it('ready.detail.tools ≡ listTools(): JSON.stringify verbatim identical incl. key order (B.5)', async () => {
      let readyDetail: { pluginId: string; tools: unknown[] } | null = null;
      const onReady = (e: Event) => {
        readyDetail = (e as CustomEvent<{ pluginId: string; tools: unknown[] }>).detail;
      };
      window.addEventListener('webmcp:ready', onReady);
      plugin.init();
      await new Promise((r) => setTimeout(r, 20));
      window.removeEventListener('webmcp:ready', onReady);
      expect(readyDetail).not.toBeNull();
      const direct = await plugin.listTools();
      // 逐字一致性（含键序）：JSON.stringify 同串
      expect(JSON.stringify(readyDetail!.tools)).toBe(JSON.stringify(direct));
      // ready 载荷全文也入快照（golden 载体）
      expect(JSON.stringify(normalizeForGolden(readyDetail))).toMatchSnapshot();
    });

    it('unknown tool via direct handle → exact original message', async () => {
      const res = await plugin.callTool('nonexistent_tool', {});
      expect(golden(res)).toMatchSnapshot();
      expect(JSON.stringify(res)).toBe(
        '{"isError":true,"content":[{"type":"text","text":"Unknown tool name: \\"nonexistent_tool\\". Use listTools() to see available tools."}]}'
      );
    });

    it('unknown tool via event channel → response event carries same result, id echoed back', async () => {
      plugin.init();
      const responses: Array<{ id?: string; result: WebMcpToolCallResult }> = [];
      const onResponse = (e: Event) => {
        responses.push((e as CustomEvent<{ id?: string; result: WebMcpToolCallResult }>).detail);
      };
      window.addEventListener('webmcp:response', onResponse);
      window.dispatchEvent(
        new CustomEvent('webmcp:call', {
          detail: { id: 'unk-1', name: 'nonexistent_tool', arguments: {} },
        })
      );
      await new Promise((r) => setTimeout(r, 20));
      window.removeEventListener('webmcp:response', onResponse);
      expect(responses.length).toBe(1);
      expect(responses[0].id).toBe('unk-1');
      expect(goldenEventResult(responses[0])).toMatchSnapshot();
    });

    it('event channel detail without name → silently ignored (no response event)', async () => {
      plugin.init();
      const responses: unknown[] = [];
      const onResponse = (e: Event) => {
        responses.push((e as CustomEvent).detail);
      };
      window.addEventListener('webmcp:response', onResponse);
      window.dispatchEvent(new CustomEvent('webmcp:call', { detail: { id: 'no-name' } }));
      window.dispatchEvent(new CustomEvent('webmcp:call', { detail: undefined }));
      await new Promise((r) => setTimeout(r, 20));
      window.removeEventListener('webmcp:response', onResponse);
      expect(responses.length).toBe(0);
    });
  });

  // =========================================================================
  // B. 双通道一致性：legacy 事件通道 vs 全局直柄（每工具两通道逐字比对）
  // =========================================================================

  describe('B. dual-channel consistency (legacy event channel vs global direct handle)', () => {
    async function callViaEvent(
      p: WebMcpPlugin,
      name: string,
      args: Record<string, unknown>,
      id: string
    ): Promise<{ id?: string; result: WebMcpToolCallResult }> {
      const got: Array<{ id?: string; result: WebMcpToolCallResult }> = [];
      const listener = (e: Event) => {
        got.push((e as CustomEvent<{ id?: string; result: WebMcpToolCallResult }>).detail);
      };
      window.addEventListener('webmcp:response', listener);
      window.dispatchEvent(new CustomEvent('webmcp:call', { detail: { id, name, arguments: args } }));
      await new Promise((r) => setTimeout(r, 30));
      window.removeEventListener('webmcp:response', listener);
      expect(got.length).toBe(1);
      return got[0];
    }

    for (const tool of TOOL_NAMES) {
      it(`dual-channel | ${tool} | event channel full response detail`, async () => {
        plugin.init();
        const detail = await callViaEvent(plugin, tool, TYPICAL_ARGS[tool], `evt-${tool}`);
        expect(detail.id).toBe(`evt-${tool}`);
        expect(goldenEventResult(detail)).toMatchSnapshot();
      });

      it(`dual-channel | ${tool} | both channels byte-identical (JSON.stringify incl. key order)`, async () => {
        plugin.init();
        const viaEvent = await callViaEvent(plugin, tool, TYPICAL_ARGS[tool], `cmp-${tool}`);
        const viaDirect = await plugin.callTool(tool, TYPICAL_ARGS[tool]);
        // B.5：录它们是否真的一致 —— 本断言就是记录（一致 ⇒ 保真清单项）。
        expect(JSON.stringify(viaEvent.result)).toBe(JSON.stringify(viaDirect));
      });
    }
  });

  // =========================================================================
  // D. 并发：同一 tick 发两个 call（mock 延迟 10ms 保证并发真实发生）
  // =========================================================================

  describe('D. concurrency: two calls in the same tick', () => {
    it('concurrent | event channel | two webmcp:call dispatched same tick with 10ms-delayed eval → both responses recorded', async () => {
      plugin.init();
      mocks.mockSupervisor.eval.mockImplementation(
        (code: string) =>
          new Promise((r) => setTimeout(() => r({ ok: true, rc: 0, output: `slow: ${code}\n` }), 10))
      );
      const responses: Array<{ id?: string; result: WebMcpToolCallResult }> = [];
      const onResponse = (e: Event) => {
        responses.push((e as CustomEvent<{ id?: string; result: WebMcpToolCallResult }>).detail);
      };
      window.addEventListener('webmcp:response', onResponse);
      window.dispatchEvent(
        new CustomEvent('webmcp:call', {
          detail: { id: 'conc-1', name: 'octave_eval', arguments: { code: 'a = 1' } },
        })
      );
      window.dispatchEvent(
        new CustomEvent('webmcp:call', {
          detail: { id: 'conc-2', name: 'octave_eval', arguments: { code: 'b = 2' } },
        })
      );
      await new Promise((r) => setTimeout(r, 60));
      window.removeEventListener('webmcp:response', onResponse);
      expect(responses.length).toBe(2);
      const byId = Object.fromEntries(responses.map((d) => [d.id, d.result]));
      expect(golden(byId['conc-1'])).toMatchSnapshot();
      expect(golden(byId['conc-2'])).toMatchSnapshot();
    });

    it('concurrent | direct handle | two callTool() started without await in between, 10ms-delayed eval → both results recorded', async () => {
      mocks.mockSupervisor.eval.mockImplementation(
        (code: string) =>
          new Promise((r) => setTimeout(() => r({ ok: true, rc: 0, output: `slow: ${code}\n` }), 10))
      );
      const p1 = plugin.callTool('octave_eval', { code: 'a = 1' });
      const p2 = plugin.callTool('octave_eval', { code: 'b = 2' });
      const [r1, r2] = await Promise.all([p1, p2]);
      expect(golden(r1)).toMatchSnapshot();
      expect(golden(r2)).toMatchSnapshot();
    });
  });
});
