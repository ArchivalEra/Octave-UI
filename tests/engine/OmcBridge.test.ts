// tests/engine/OmcBridge.test.ts
// OMC 桥抽离契约：导出形状、双引擎失败上抛 + code、纯 omc lane 上抛、
// engine 层不碰 UI 面（无 toastService import）、__omcError 旁路取消、
// WasmEmbedAdapter.boot 的双引擎降级接线（FLAVOR_UNAVAILABLE 吞掉、其余上抛）。
// 另有成功路径锁（回归锁，见文件末尾 describe）：
//   ① 装配成功 ⇒ window.__omc 被赋为该模块 namespace + init 调用顺序 + blobUrl 回收；
//   ② 装配前置失败（embed 无 mod.FS）⇒ 响亮失败 FLAVOR_UNAVAILABLE，不许静默早退。
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as OmcBridge from '../../src/modules/engine/OmcBridge';
import { setupOmcBridge, onOmcFlavorError } from '../../src/modules/engine/OmcBridge';
import { EngineAssetResolver } from '../../src/modules/engine/EngineAssetResolver';
import { MemoryStore } from '../../src/modules/storage/MemoryStore';
import { WasmEmbedAdapter } from '../../src/modules/engine/WasmEmbedAdapter';
import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';

// 每个用例自管 resolver 实例与 window 状态，用例间不串台
afterEach(() => {
  EngineAssetResolver.resetInstance();
  vi.restoreAllMocks();
  delete (window as any).__omc;
  delete (window as any).__omcError;
});

/** 空 MemoryStore resolver：OMC 网络 import 与 OPFS 降级全失败的标准失败环境 */
function installEmptyResolver(): void {
  EngineAssetResolver.setInstance(new EngineAssetResolver(new MemoryStore()));
}

function makeEmbed(): any {
  return {
    mod: { FS: { mkdir: vi.fn() } },
    eval: vi.fn().mockResolvedValue({ ok: true, rc: 0 }),
  };
}

describe('OmcBridge module shape', () => {
  it('exports setupOmcBridge as a function on an independent module', () => {
    expect(typeof OmcBridge.setupOmcBridge).toBe('function');
    expect(typeof setupOmcBridge).toBe('function');
  });

  it('does not import toastService (engine layer must not touch the UI surface)', () => {
    const source = readFileSync(
      resolvePath(__dirname, '../../src/modules/engine/OmcBridge.ts'),
      'utf-8'
    );
    expect(source).not.toContain('toastService');
  });
});

describe('OmcBridge dual-engine failure (OMC as附加 flavor)', () => {
  it('throws an Error carrying code=FLAVOR_UNAVAILABLE when both network and OPFS fail', async () => {
    installEmptyResolver();
    const embed = makeEmbed();

    await expect(setupOmcBridge(embed, 'wasm32-final')).rejects.toMatchObject({
      code: 'FLAVOR_UNAVAILABLE',
    });
  });

  it('notifies flavor-error listeners (composition-root toast channel) with the coded error', async () => {
    installEmptyResolver();
    const embed = makeEmbed();
    const seen: OmcBridge.OmcFlavorError[] = [];
    const unsub = onOmcFlavorError((err) => seen.push(err));

    await expect(setupOmcBridge(embed, 'wasm32-final')).rejects.toMatchObject({
      code: 'FLAVOR_UNAVAILABLE',
    });

    expect(seen.length).toBe(1);
    expect(seen[0].code).toBe('FLAVOR_UNAVAILABLE');
    unsub();
  });

  it('flavor-error subscription is unsubscribable', async () => {
    installEmptyResolver();
    const embed = makeEmbed();
    const seen: OmcBridge.OmcFlavorError[] = [];
    const unsub = onOmcFlavorError((err) => seen.push(err));
    unsub();

    await expect(setupOmcBridge(embed, 'wasm32-final')).rejects.toMatchObject({
      code: 'FLAVOR_UNAVAILABLE',
    });
    expect(seen.length).toBe(0);
  });

  it('does not write the window.__omcError bypass on failure (error goes through throw chain only)', async () => {
    installEmptyResolver();
    const embed = makeEmbed();

    await expect(setupOmcBridge(embed, 'wasm32-final')).rejects.toMatchObject({
      code: 'FLAVOR_UNAVAILABLE',
    });

    expect((window as any).__omcError).toBeUndefined();
  });

  it('resolver.getBlob total rejection drives the OPFS fallback to failure', async () => {
    // mock resolver.getBlob 全拒 + import 失败路径：双引擎失败的最小复现条件
    const resolver = EngineAssetResolver.getInstance();
    vi.spyOn(resolver, 'getBlob').mockRejectedValue(new Error('blob unavailable'));
    vi.spyOn(resolver, 'withLocalAssets').mockImplementation(
      async (_lane: any, _variant: any, bootFn: () => Promise<any>) => bootFn()
    );

    const embed = makeEmbed();
    await expect(setupOmcBridge(embed, 'master')).rejects.toMatchObject({
      code: 'FLAVOR_UNAVAILABLE',
    });
    expect(resolver.getBlob).toHaveBeenCalled();
  });
});

describe('OmcBridge pure omc lane (main flavor)', () => {
  it('rethrows the failure (boot must fail; not swallowed, no downgrade notification)', async () => {
    installEmptyResolver();
    const embed = makeEmbed();
    const seen: OmcBridge.OmcFlavorError[] = [];
    const unsub = onOmcFlavorError((err) => seen.push(err));

    await expect(setupOmcBridge(embed, 'omc')).rejects.toMatchObject({
      code: 'FLAVOR_UNAVAILABLE',
    });
    // 主 flavor 失败无降级可言：不走路由通知（呈现走 boot reject 主链路）
    expect(seen.length).toBe(0);
    expect((window as any).__omcError).toBeUndefined();
    unsub();
  });
});

describe('WasmEmbedAdapter boot integration', () => {
  function installMockEmbedHost(): void {
    (globalThis as any).window = {
      OctaveEmbed: {
        create: vi.fn().mockResolvedValue({
          id: 'dual-engine',
          state: 'idle',
          mod: { FS: { mkdir: vi.fn() } },
          eval: vi.fn().mockResolvedValue({ ok: true, rc: 0 }),
          on: { output: vi.fn(), error: vi.fn(), state: vi.fn(), figure: vi.fn() },
          fs: { read: vi.fn(), write: vi.fn(), ls: vi.fn(), rm: vi.fn(), download: vi.fn() },
          figures: { export: vi.fn() },
        }),
      },
    };
    const existingScript = document.createElement('script');
    existingScript.setAttribute('data-lane', 'wasm32-final-base');
    document.head.appendChild(existingScript);
  }

  it('dual-engine mode (enableOmc) swallows FLAVOR_UNAVAILABLE and boots Octave-only', async () => {
    installEmptyResolver();
    installMockEmbedHost();
    const flavorErrors: OmcBridge.OmcFlavorError[] = [];
    const unsub = onOmcFlavorError((err) => flavorErrors.push(err));

    const adapter = await WasmEmbedAdapter.boot({ lane: 'wasm32-final', enableOmc: true });
    expect(adapter).toBeInstanceOf(WasmEmbedAdapter);
    expect(flavorErrors.length).toBe(1);
    expect(flavorErrors[0].code).toBe('FLAVOR_UNAVAILABLE');
    expect((window as any).__omcError).toBeUndefined();
    unsub();
  });

  it('dual-engine mode rethrows non-flavor OMC errors (only the coded downgrade is swallowable)', async () => {
    const resolver = EngineAssetResolver.getInstance();
    vi.spyOn(resolver, 'withLocalAssets').mockImplementation(async () => {
      throw new Error('resolver scope broken');
    });
    installMockEmbedHost();

    await expect(
      WasmEmbedAdapter.boot({ lane: 'wasm32-final', enableOmc: true })
    ).rejects.toThrow('resolver scope broken');
  });

  it('pure omc lane propagates OMC failure as boot failure', async () => {
    installEmptyResolver();
    installMockEmbedHost();

    await expect(WasmEmbedAdapter.boot({ lane: 'omc' })).rejects.toMatchObject({
      code: 'FLAVOR_UNAVAILABLE',
    });
    expect((window as any).__omcError).toBeUndefined();
  });

  // ── 无 mod.FS 的前置失败不许升级成「勾了 omc 就整个 boot 失败」 ──
  // 早退改 throw 之前这条形状根本走不到 catch（静默 resolve），boot 也不会降级通知。
  // 现在它必须走既有的 FLAVOR_UNAVAILABLE 降级分支：adapter 照常返回、toast 一次。
  function installMockEmbedHostWithoutFs(): void {
    (globalThis as any).window = {
      OctaveEmbed: {
        create: vi.fn().mockResolvedValue({
          id: 'dual-engine-no-fs',
          state: 'idle',
          // ★ 无 mod.FS、无 eval —— 模拟 lane 模块形状与桥接契约不符
          on: { output: vi.fn(), error: vi.fn(), state: vi.fn(), figure: vi.fn() },
          fs: { read: vi.fn(), write: vi.fn(), ls: vi.fn(), rm: vi.fn(), download: vi.fn() },
          figures: { export: vi.fn() },
        }),
      },
    };
    const existingScript = document.createElement('script');
    existingScript.setAttribute('data-lane', 'wasm32-final-base');
    document.head.appendChild(existingScript);
  }

  it('dual-engine mode with FS-less embed still boots Octave-only and notifies once', async () => {
    installEmptyResolver();
    installMockEmbedHostWithoutFs();
    const flavorErrors: OmcBridge.OmcFlavorError[] = [];
    const unsub = onOmcFlavorError((err) => flavorErrors.push(err));

    const adapter = await WasmEmbedAdapter.boot({ lane: 'wasm32-final', enableOmc: true });

    expect(adapter).toBeInstanceOf(WasmEmbedAdapter);
    expect(flavorErrors.length).toBe(1);
    expect(flavorErrors[0].code).toBe('FLAVOR_UNAVAILABLE');
    expect(flavorErrors[0].message).toMatch(/mod\.FS/);
    expect((window as any).__omc).toBeUndefined();
    unsub();
  });

  it('pure omc lane with FS-less embed fails boot (no Octave fallback to downgrade to)', async () => {
    installEmptyResolver();
    installMockEmbedHostWithoutFs();

    await expect(WasmEmbedAdapter.boot({ lane: 'omc' })).rejects.toMatchObject({
      code: 'FLAVOR_UNAVAILABLE',
    });
    expect((window as any).__omc).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 成功路径回归锁（票：test/omc-boot-success）
//
// 背景：内容仓 092 §二 曾据「151 秒观察窗内 window.__omc 恒 undefined」判定
// 「双引擎 boot 到 omc 可用从未走通」。真浏览器复跑（点 BootModal 的
// 「Start Engine Now」）3 秒内即得 __omc=object / omc_eval=function，说明探针
// 点错了元素（把模态 h3 标题当按钮）。但本文件当时只有失败路径覆盖 ——
// 「装配成功时 __omc 被赋值」在单测层没有任何锁，这正是误判能溜过去的结构原因。
// 下面两条用例补上这个锁；产品行为零改动。
//
// 假 OMC 模块放在 tests/engine/fixtures/omc/OpenModelicaCompiler.js：
// 形状对齐 wasm-bindgen ESM 产物（default = 异步加载器 + 具名导出），
// 调用全部转记到 globalThis.__omcFixtureState.calls，便于断言顺序与传参。
// 网络 import 的 URL 由 site-base 推导：置 window.__siteBase 指向 fixtures 目录
// ⇒ vitest 的 vite-node 解析到 fixture 模块（源码零改动，不 mock import()）。
// ─────────────────────────────────────────────────────────────────────────────

const FIXTURE_BASE = '/tests/engine/fixtures/';
const FIXTURE_OMC_PATH = `${FIXTURE_BASE}omc/OpenModelicaCompiler.js`;
const FIXTURE_OMC_WASM_URL = `${FIXTURE_BASE}omc/OpenModelicaCompiler_bg.wasm`;

function resetOmcFixture(): void {
  (globalThis as any).__omcFixtureState = { calls: [] as any[][] };
  // OmcBridge 优先读 <meta name="site-base">，因此测试里清掉可能残留的 meta，
  // 让 __siteBase 成为唯一基址来源（离线降级用例会改用不可解析的基址）
  document.querySelectorAll('meta[name="site-base"]').forEach((m) => m.remove());
  (window as any).__siteBase = FIXTURE_BASE;
  delete (window as any).__octaveHosts;
  delete (window as any).Module;
}

function fixtureCalls(): any[][] {
  return (globalThis as any).__omcFixtureState.calls;
}

describe('OmcBridge success path (assembly success ⇒ window.__omc assigned)', () => {
  afterEach(() => {
    delete (globalThis as any).__omcFixtureState;
    delete (window as any).__siteBase;
    delete (window as any).__octaveHosts;
    delete (window as any).Module;
  });

  it('assigns window.__omc to the loaded module namespace (same reference) and makes omc_eval callable', async () => {
    installEmptyResolver();
    resetOmcFixture();
    const embed = makeEmbed();

    await setupOmcBridge(embed, 'wasm32-final');

    // 同一对象引用：不是拷贝、不是包装壳——后续宿主代码按此引用调 omc_eval
    const expectedNamespace = await import(/* @vite-ignore */ FIXTURE_OMC_PATH);
    expect((window as any).__omc).toBe(expectedNamespace);
    expect(typeof (window as any).__omc.omc_eval).toBe('function');

    // omc_eval 真能调：调用落进 fixture 的调用日志
    const rc = (window as any).__omc.omc_eval('1+1');
    expect(rc).toBe('eval:1+1');
    expect(fixtureCalls()).toContainEqual(['omc_eval', '1+1']);
  });

  it('runs default(wasmUrl) → omc_set_env → omc_init → omc_set_inwasm_driver exactly once each, in that order', async () => {
    installEmptyResolver();
    resetOmcFixture();
    const embed = makeEmbed();

    await setupOmcBridge(embed, 'wasm32-final');

    // 顺序即实现里的固定装配次序：先加载 wasm（default 收显式 wasmUrl，
    // 防 blob: 作用域下 new URL(bg, import.meta.url) 抛 Invalid URL），再环境变量，
    // 再 init，最后接 in-wasm driver。
    expect(fixtureCalls()).toEqual([
      ['default', FIXTURE_OMC_WASM_URL],
      ['omc_set_env', 'OPENMODELICAHOME', '/usr'],
      ['omc_init'],
      ['omc_set_inwasm_driver', 1],
    ]);

    // MEMFS 前置接线同样发生：mkdir('/tmp') + addpath('/tmp')
    expect(embed.mod.FS.mkdir).toHaveBeenCalledWith('/tmp');
    expect(embed.eval).toHaveBeenCalledWith("addpath('/tmp');");
  });

  it('revokes the OPFS blob URL on the success path (fallback import succeeded ⇒ still cleaned up)', async () => {
    // 网络 import 必修失败：基址指向不存在的目录 ⇒ vite-node 解析报错；
    // 随后走 OPFS 降级，createObjectURL 被改成 data: URL（内容 = fixture 源码），
    // 使降级 import 成功 —— 这正是真实离线环境里「成功也必须回收 blobUrl」的形状。
    const resolver = new EngineAssetResolver(new MemoryStore());
    EngineAssetResolver.setInstance(resolver);
    await resolver.store.init();
    await resolver.store.write(
      'downloads/engine/omc/w32/OpenModelicaCompiler.js',
      new TextEncoder().encode('// opfs omc glue placeholder')
    );

    resetOmcFixture();
    (window as any).__siteBase = '/definitely-missing-base/';

    const fixtureSource = readFileSync(
      resolvePath(__dirname, './fixtures/omc/OpenModelicaCompiler.js'),
      'utf-8'
    );
    const dataUrl =
      'data:text/javascript;base64,' + Buffer.from(fixtureSource, 'utf-8').toString('base64');
    const createSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue(dataUrl);
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    const embed = makeEmbed();
    await setupOmcBridge(embed, 'wasm32-final');

    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(revokeSpy).toHaveBeenCalledTimes(1);
    // 回收的正是刚创建的那个句柄
    expect(revokeSpy).toHaveBeenCalledWith(createSpy.mock.results[0].value);
    // 且成功路径仍然完成装配
    expect((window as any).__omc).toBeTruthy();
    expect(typeof (window as any).__omc.omc_eval).toBe('function');
  });

  it('does not re-import when window.__omc is already set (idempotent guard)', async () => {
    const resolver = new EngineAssetResolver(new MemoryStore());
    EngineAssetResolver.setInstance(resolver);
    const withLocalSpy = vi.spyOn(resolver, 'withLocalAssets');
    resetOmcFixture();
    const existing = { omc_eval: () => 'existing' };
    (window as any).__omc = existing;

    await setupOmcBridge(makeEmbed(), 'wasm32-final');

    // 已装配 ⇒ 不重走资产作用域、不重放 init 调用
    expect(withLocalSpy).not.toHaveBeenCalled();
    expect((window as any).__omc).toBe(existing);
    expect(fixtureCalls()).toEqual([]);
  });
});

describe('OmcBridge prerequisite failure when embed has no mod.FS (must fail loudly)', () => {
  // ⚠️ 这是**期望语义**，不是现状记录。
  // 历史实现第一行 `const FS = embed?.mod?.FS || ...; if (!FS) return;` —— embed 无 FS 时
  // 静默返回：__omc 永不设置、不抛错、不通知 flavor 失败。这正是「用户勾了 omc 但什么也
  // 没发生」的形状（内容仓 092 §二 / 102 §二；104 §三 附议改）。
  // 现裁定为响亮失败：与文件内其余失败同一条分叉路径 —— lane='omc' 原样上抛（boot 失败），
  // 双引擎模式带 code=FLAVOR_UNAVAILABLE 上抛 + 经 onOmcFlavorError 通知一次（调用方降级）。
  // 反向咬合：把 `if (!FS) return;` 改回静默 ⇒ 下面所有 rejects 断言立刻变红。
  afterEach(() => {
    delete (window as any).__siteBase;
    delete (window as any).__octaveHosts;
    delete (window as any).Module;
  });

  /** 无 mod.FS；window 上也没有 __octaveHosts[0].mod.FS / Module.FS */
  function embedWithoutFs(): any {
    return { eval: vi.fn() };
  }

  it('rejects with code=FLAVOR_UNAVAILABLE instead of silently resolving', async () => {
    installEmptyResolver();
    resetOmcFixture();

    const err = await setupOmcBridge(embedWithoutFs(), 'wasm32-final').then(
      () => {
        throw new Error('setupOmcBridge resolved — the silent early return is back');
      },
      (e: any) => e
    );

    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe('FLAVOR_UNAVAILABLE');
    // 错误信息必须说清是哪一环，不许只写 "unavailable"
    expect(err.message).toMatch(/mod\.FS/);
    expect(err.message).toMatch(/MEMFS/);
  });

  it('leaves no half-assembled state: __omc undefined and asset scope never entered', async () => {
    const resolver = new EngineAssetResolver(new MemoryStore());
    EngineAssetResolver.setInstance(resolver);
    const withLocalSpy = vi.spyOn(resolver, 'withLocalAssets');
    const getBlobSpy = vi.spyOn(resolver, 'getBlob');
    resetOmcFixture();
    const embed = embedWithoutFs();

    await expect(setupOmcBridge(embed, 'wasm32-final')).rejects.toMatchObject({
      code: 'FLAVOR_UNAVAILABLE',
    });

    // 失败时不许留半个装配：既不设 __omc，也没碰资产 / MEMFS 接线
    expect((window as any).__omc).toBeUndefined();
    expect(withLocalSpy).not.toHaveBeenCalled();
    expect(getBlobSpy).not.toHaveBeenCalled();
    expect(embed.eval).not.toHaveBeenCalled();
  });

  it('dual-engine mode notifies the flavor-error channel exactly once with the coded error', async () => {
    installEmptyResolver();
    resetOmcFixture();
    const seen: OmcBridge.OmcFlavorError[] = [];
    const unsub = onOmcFlavorError((err) => seen.push(err));

    await expect(setupOmcBridge(embedWithoutFs(), 'wasm32-final')).rejects.toMatchObject({
      code: 'FLAVOR_UNAVAILABLE',
    });

    // 订阅者真收到：恰好一次、带 code、带说清环节的信息（toast 用它）
    expect(seen.length).toBe(1);
    expect(seen[0].code).toBe('FLAVOR_UNAVAILABLE');
    expect(seen[0].message).toMatch(/mod\.FS/);
    unsub();
  });

  it('pure omc lane (main flavor) rethrows as-is without flavor notification', async () => {
    installEmptyResolver();
    resetOmcFixture();
    const seen: OmcBridge.OmcFlavorError[] = [];
    const unsub = onOmcFlavorError((err) => seen.push(err));

    await expect(setupOmcBridge(embedWithoutFs(), 'omc')).rejects.toMatchObject({
      code: 'FLAVOR_UNAVAILABLE',
    });
    // 主 flavor 失败 = boot 失败，无降级可言：不走路由通知，也不写旁路
    expect(seen.length).toBe(0);
    expect((window as any).__omc).toBeUndefined();
    expect((window as any).__omcError).toBeUndefined();
    unsub();
  });

  it('takes the same loud path when embed is undefined / null', async () => {
    installEmptyResolver();
    resetOmcFixture();

    await expect(setupOmcBridge(undefined, 'wasm32-final')).rejects.toMatchObject({
      code: 'FLAVOR_UNAVAILABLE',
    });
    await expect(setupOmcBridge(null, 'omc')).rejects.toMatchObject({
      code: 'FLAVOR_UNAVAILABLE',
    });

    expect((window as any).__omc).toBeUndefined();
  });
});
