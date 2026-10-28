// tests/plugins/webmcp-omc-msl.test.ts
// omc_load_msl 的三道能力门反向断言（内容仓 093 裁定 A 的绑定④：
// 「能力门不许退化——三道反向断言是工具体的一部分，不是可选装饰」）。
//
// 判据（每条都必须响亮不可用，不许静默成功、不许名册缺席）：
//   ① packageManager 缺席 ⇒ CAPABILITY_UNAVAILABLE
//   ② catalog 无 MSL 条目 ⇒ 明说未找到
//   ③ window.__omc 缺席（omc 引擎未加载）⇒ CAPABILITY_UNAVAILABLE
//   ④ 全绿路径：omc 在场 + 条目在场 ⇒ 走 omc_vfs_load_zip 且返回体带自检结果（不静默成功）
//
// 复跑：CI=true npx vitest run tests/plugins/webmcp-omc-msl.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { dispatchTool } from '../../src/modules/plugins/webmcp/dispatcher';
import { omcLoadMslTool, MSL_PACKAGE_NAME, MSL_MOUNT_PATH } from '../../src/modules/plugins/webmcp/tools/omcLoadMsl';
import type { WebMcpCtxResolver } from '../../src/modules/plugins/webmcp/ctx';
import type { WebMcpCtx } from '../../src/modules/plugins/webmcp/ctx';

function resolverWith(overrides: Partial<WebMcpCtx>): WebMcpCtxResolver {
  const merged = { supervisor: undefined, workspace: undefined, packageManager: undefined, ...overrides };
  return {
    supervisor: () => merged.supervisor,
    workspace: () => merged.workspace,
    packageManager: () => merged.packageManager,
  };
}

const mslEntry = {
  name: MSL_PACKAGE_NAME,
  version: '4.1.0+maint.om',
  form: 'file',
  sha256: 'a97d8d94ca7f7960f7f1c209613a35d65bcfa2426660e5052617e71326308535',
  url: 'assets/msl/msl-4.1.0-maint.om.zip',
  size: 19482938,
  content: [],
  consumer: ['omc'],
  role: 'package',
};

function fakePm(entry: any | null) {
  return {
    getCatalog: () => ({}),
    loadCatalog: async () => ({}),
    getPackage: (n: string) => (entry && n === entry.name ? entry : undefined),
  } as any;
}

describe('omc_load_msl 能力门（内容仓 093 绑定④：不许退化成静默缺席）', () => {
  beforeEach(() => {
    delete (window as any).__omc;
    // 桩 fetch：只有 MSL url 有内容
    (globalThis as any).fetch = async (u: string) => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => new ArrayBuffer(1024),
    });
  });
  afterEach(() => {
    delete (window as any).__omc;
  });

  it('★ ① packageManager 缺席 ⇒ CAPABILITY_UNAVAILABLE 信封（不是静默成功）', async () => {
    const res = await dispatchTool([omcLoadMslTool], resolverWith({}), 'omc_load_msl', {});
    expect(res.isError).toBe(true);
    const text = (res.content[0] as any).text;
    expect(text).toContain('CAPABILITY_UNAVAILABLE');
    expect(text).toContain('package manager');
  });

  it('★ ② catalog 无 MSL 条目 ⇒ 明说未找到（不冒充成功）', async () => {
    const res = await dispatchTool([omcLoadMslTool], resolverWith({ packageManager: fakePm(null) }), 'omc_load_msl', {});
    expect(res.isError).toBe(true);
    expect((res.content[0] as any).text).toContain(`"${MSL_PACKAGE_NAME}" not found`);
  });

  it('★ ③ window.__omc 缺席（omc 引擎未加载）⇒ CAPABILITY_UNAVAILABLE', async () => {
    const res = await dispatchTool(
      [omcLoadMslTool],
      resolverWith({ packageManager: fakePm(mslEntry) }),
      'omc_load_msl',
      {},
    );
    expect(res.isError).toBe(true);
    const text = (res.content[0] as any).text;
    expect(text).toContain('CAPABILITY_UNAVAILABLE');
    expect(text).toContain('OpenModelica runtime');
  });

  it('★ ④ 全绿路径：走 omc_vfs_load_zip(默认库目录) 且返回体带装后自检（不静默成功）', async () => {
    const calls: Array<{ path: string; bytes: number }> = [];
    // ★ 产物真实面（D12：自检曾调了两个产物里不存在的函数，现在只用 omc_eval）
    (window as any).__omc = {
      omc_vfs_load_zip: async (path: string, bytes: Uint8Array) => {
        calls.push({ path, bytes: bytes.length });
      },
      omc_eval: async (expr: string) => {
        if (expr === 'loadModel(Modelica)') return 'true';
        if (expr === 'getVersion(Modelica)') return '"4.1.0"'; // 实测带引号
        if (expr === 'loadModel(NoSuchPackageXYZ)') return 'false';
        return 'false';
      },
    };
    const res = await dispatchTool(
      [omcLoadMslTool],
      resolverWith({ packageManager: fakePm(mslEntry) }),
      'omc_load_msl',
      {},
    );
    expect(res.isError).toBeFalsy();
    // 挂载点 = recipes/msl.md 权威值（不是 MODELICAPATH —— 那条实测不生效）
    expect(calls.length).toBe(1);
    expect(calls[0].path).toBe(MSL_MOUNT_PATH);
    const data = (res.content[0] as any).data;
    expect(data.mountPath).toBe('/.openmodelica/libraries');
    // 装后自检三条进返回体（正向 true / 版本 / 反向 false）
    expect(data.selfCheck.loadModel).toBe(true);
    expect(data.selfCheck.version).toBe('4.1.0');
    expect(data.selfCheck.negative).toBe(false);
  });

  it('★ ⑤ 反向：装后自检不通过 ⇒ isError true（不静默成功）', async () => {
    (window as any).__omc = {
      omc_vfs_load_zip: async () => {},
      omc_eval: async () => 'false', // 装载真失败：loadModel 返回 false
    };
    const res = await dispatchTool(
      [omcLoadMslTool],
      resolverWith({ packageManager: fakePm(mslEntry) }),
      'omc_load_msl',
      {},
    );
    expect(res.isError).toBe(true);
  });
});

describe('D12 回归锁：自检必须调产物里存在的 API（内容仓 096）', () => {
  const okEval = async (expr: string) =>
    expr === 'loadModel(Modelica)' ? 'true' : expr === 'getVersion(Modelica)' ? '"4.1.0"' : 'false';

  it('★ 完整成功路径：omc_eval 面 ⇒ isError false（此前必然报失败）', async () => {
    (window as any).__omc = { omc_vfs_load_zip: async () => '4376', omc_eval: okEval };
    const res = await dispatchTool(
      [omcLoadMslTool],
      resolverWith({ packageManager: fakePm({ ...mslEntry, url: 'assets/msl/msl-4.1.0-maint.om.zip' }) }),
      'omc_load_msl',
      {},
    );
    expect(res.isError).toBeFalsy();
    const data = (res.content[0] as any).data;
    expect(data.selfCheck.loadModel).toBe(true);
    expect(data.selfCheck.version).toBe('4.1.0');   // 引号已去
    expect(data.selfCheck.negative).toBe(false);
  });

  it('★ 版本不符 ⇒ isError true（version 参与判据）', async () => {
    (window as any).__omc = {
      omc_vfs_load_zip: async () => '0',
      omc_eval: async (e: string) => (e === 'getVersion(Modelica)' ? '"3.2.3"' : e === 'loadModel(Modelica)' ? 'true' : 'false'),
    };
    const res = await dispatchTool([omcLoadMslTool], resolverWith({ packageManager: fakePm(mslEntry) }), 'omc_load_msl', {});
    expect(res.isError).toBe(true);
  });

  it('★ 运行时无 omc_eval ⇒ 明确报「API 缺口」而非冒充装载失败（096 §3 第 3 条）', async () => {
    (window as any).__omc = { omc_vfs_load_zip: async () => '0' }; // 无 omc_eval
    const res = await dispatchTool([omcLoadMslTool], resolverWith({ packageManager: fakePm(mslEntry) }), 'omc_load_msl', {});
    expect(res.isError).toBe(true);
    const text = (res.content[0] as any).text;
    expect(text).toContain('omc_eval');
    expect(text).toContain('not a load failure');
  });

  it('★ 自检单条异常不污染其它条（probeError 与装载结果分开记）', async () => {
    (window as any).__omc = {
      omc_vfs_load_zip: async () => '0',
      omc_eval: async (e: string) => {
        if (e === 'getVersion(Modelica)') throw new Error('probe boom');
        return e === 'loadModel(Modelica)' ? 'true' : 'false';
      },
    };
    const res = await dispatchTool([omcLoadMslTool], resolverWith({ packageManager: fakePm(mslEntry) }), 'omc_load_msl', {});
    const data = (res.content[0] as any).data;
    expect(data.selfCheck.loadModel).toBe(true);      // 其它条照常求值
    expect(data.selfCheck.probeError).toContain('probe boom');
  });

  it('★ 条目缺 url ⇒ 如实报（不猜文件名——096 §4.2）', async () => {
    (window as any).__omc = { omc_vfs_load_zip: async () => '0', omc_eval: okEval };
    const noUrl = { ...mslEntry }; delete (noUrl as any).url;
    const res = await dispatchTool([omcLoadMslTool], resolverWith({ packageManager: fakePm(noUrl) }), 'omc_load_msl', {});
    expect(res.isError).toBe(true);
    expect((res.content[0] as any).text).toContain('has no url');
  });
});
