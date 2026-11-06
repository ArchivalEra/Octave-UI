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
import { omcLoadMslTool, MSL_PACKAGE_NAME, MSL_MOUNT_PATH, setMslDownloadedAsset } from '../../src/modules/plugins/webmcp/tools/omcLoadMsl';
import type { WebMcpCtxResolver } from '../../src/modules/plugins/webmcp/ctx';
import type { WebMcpCtx } from '../../src/modules/plugins/webmcp/ctx';

/** 装载侧桩：模拟「从 OPFS 读已下载资产」，不是现场装配 release 分片。 */
const OPFS_PATH = 'downloads/src/modelica-standard-library/4.1.0+maint.om/modelica-standard-library-4.1.0+maint.om.tar.gz';
const OPFS_SHA = 'a97d8d94ca7f7960f7f1c209613a35d65bcfa2426660e5052617e71326308535';
function stubMslDownloadedAsset(bytes = 1024) {
  setMslDownloadedAsset(async () => ({
    path: OPFS_PATH,
    sha256: OPFS_SHA,
    bytes: new Uint8Array(bytes),
  }));
}

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
    // 默认注入「已从 OPFS 读到已下载字节」桩；需要测「未接线 / 未下载」的用例自己覆盖。
    stubMslDownloadedAsset();
    // ★ 核心反向桩：装载期**任何** fetch 都抛（不仅站内，也包括 release 域名）。
    //   这是下载/装载解耦的可证伪判据：装载绝不发网络请求，字节只来自 OPFS。
    //   旧版只禁了站内 fetch 却放行 release fetch，正是解耦回归没被测到的原因。
    (globalThis as any).fetch = async (u: string) => {
      throw new Error(`NETWORK_FETCH_FORBIDDEN_DURING_LOAD: ${u}`);
    };
  });
  afterEach(() => {
    delete (window as any).__omc;
    setMslDownloadedAsset(null);
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

  beforeEach(() => stubMslDownloadedAsset());
  afterEach(() => setMslDownloadedAsset(null));

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

describe('★ 2026-11-06 票 C：MSL 字节必须走分发契约（站内路径已 404）', () => {
  const okEval = async (expr: string) =>
    expr === 'loadModel(Modelica)' ? 'true' : expr === 'getVersion(Modelica)' ? '"4.1.0"' : 'false';

  beforeEach(() => {
    delete (window as any).__omc;
    // 装载期任何 fetch 都抛（含 release 域名）——解耦的可证伪判据
    (globalThis as any).fetch = async (u: string) => { throw new Error(`NETWORK_FETCH_FORBIDDEN_DURING_LOAD: ${u}`); };
  });
  afterEach(() => {
    delete (window as any).__omc;
    setMslDownloadedAsset(null);
  });

  it('⑥ 未接线（组合根没注入）⇒ CAPABILITY_UNAVAILABLE，不假装能装', async () => {
    setMslDownloadedAsset(null);
    (window as any).__omc = { omc_vfs_load_zip: async () => '0', omc_eval: okEval };
    const res = await dispatchTool([omcLoadMslTool], resolverWith({ packageManager: fakePm(mslEntry) }), 'omc_load_msl', {});
    expect(res.isError).toBe(true);
    expect((res.content[0] as any).text).toContain('downloaded-asset reader');
  });

  it('⑦ ★ 未下载就装载 ⇒ NOT_DOWNLOADED，绝不现场拉字节（下载/装载解耦核心反向）', async () => {
    setMslDownloadedAsset(async () => null);
    const calls: number[] = [];
    (window as any).__omc = {
      omc_vfs_load_zip: async () => { calls.push(1); },
      omc_eval: okEval,
    };
    const res = await dispatchTool([omcLoadMslTool], resolverWith({ packageManager: fakePm(mslEntry) }), 'omc_load_msl', {});
    expect(res.isError).toBe(true);
    const text = (res.content[0] as any).text;
    expect(text).toContain('NOT_DOWNLOADED');
    expect(text).toContain('Download it first');
    expect(calls.length).toBe(0);                       // 没字节就绝不调运行时
    expect(text).not.toContain('NETWORK_FETCH_FORBIDDEN'); // 也绝不发网络请求
  });

  it('⑧ ★ 全绿路径零网络 + 证据面是 OPFS（不是 release 现场装配）', async () => {
    stubMslDownloadedAsset(2048);
    const calls: Array<{ path: string; bytes: number }> = [];
    (window as any).__omc = {
      omc_vfs_load_zip: async (path: string, bytes: Uint8Array) => { calls.push({ path, bytes: bytes.length }); },
      omc_eval: okEval,
    };
    const res = await dispatchTool([omcLoadMslTool], resolverWith({ packageManager: fakePm(mslEntry) }), 'omc_load_msl', {});
    expect(res.isError).toBeFalsy();
    expect(calls[0].bytes).toBe(2048);   // 用的是 OPFS 读出的字节
    const data = (res.content[0] as any).data;
    expect(data.source).toBe('opfs-download');
    expect(data.opfsPath).toBe(OPFS_PATH);
    expect(data.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(data.releaseBase).toBeUndefined();  // 装载不记 release 现场信息
  });
});
