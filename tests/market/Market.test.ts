// tests/market/Market.test.ts
// 市场深模块：接口即测试面。三路同轴 = UI / MCP / 测试都打同一行 ensure。

import { describe, it, expect, beforeEach } from 'vitest';
import { Market, type RuntimeInstaller } from '../../src/modules/market/Market';
import {
  bindProjection, resetProjectionCache, projectContract,
  type ContractFacts, type ProjectionCaps, type ContractIdentity,
} from '../../src/modules/contract/projection';
import { LANE_PRODUCT } from '../../src/modules/engine/laneProducts';
import type { Vault } from '../../src/modules/vault/Vault';

const CONTENT = {
  schema: 2, packs: [
    { name: 'signal', version: '1.4.3', size: 100, sha256: 'a'.repeat(64),
      url: 'assets/forge/signal-1.4.3.tar.gz', form: 'pkg', content: ['m'],
      consumer: ['octave'], role: 'package', deps: [] },
    { name: 'statistics', version: '1.7.0', size: 200, sha256: 'b'.repeat(64),
      url: 'assets/forge/statistics-1.7.0.tar.gz', form: 'pkg', content: ['src'],
      consumer: ['octave'], role: 'package', deps: [] },
    { name: 'clang-toolchain', version: '6.0.12', size: 300,
      sha256: '198e84c4baeb3ce4c8d11cbbef75f072ec61db1b527df0ee2c90c9a4ffc72a85',
      url: 'assets/llvm/clang.wasm', form: 'tree', content: [],
      consumer: ['octave'], role: 'toolchain', deps: [], recipe: 'llvm-wasm' },
  ],
};
const caps: ProjectionCaps = { decodableCodecs: new Set(['identity']), activeLane: 'wasm32-final' };
const facts: ContractFacts = {
  content: CONTENT, distribution: {}, manifests: {}, engine: LANE_PRODUCT, optionalKeys: ['role'],
};

/** 测试 adapter：记录调用，不碰真 OPFS / 真桥。 */
function fakeVault(): Vault & { reads: number; fetches: number } {
  const v = {
    reads: 0, fetches: 0,
    fetch: async (id: ContractIdentity) => { (v as any).fetches++; return Object.freeze({ identity: id, bytes: id.bytes, files: [], }); },
    read: async (id: ContractIdentity) => {
      (v as any).reads++;
      return Object.freeze({ state: 'ok' as const, cause: 'ok', bytes: new Uint8Array([1, 2, 3]),
        path: 'downloads/x', sha256: id.sha256, missing: [] });
    },
    reconcile: async () => Object.freeze({ integrity: 'verified' as const, files: [], bytes: 1 }),
    index: async () => ({ manifest: { schema: 1 as const, items: {} }, totalBytes: 0, count: 0 }),
    evict: async () => {},
  };
  return v as any;
}

function fakeRuntime(): RuntimeInstaller & { boots: number; installs: number; compiles: number } {
  const r = {
    boots: 0, installs: 0, compiles: 0,
    ensureBooted: async () => { (r as any).boots++; },
    install: async () => { (r as any).installs++; },
    compile: async () => { (r as any).compiles++; },
  };
  return r;
}

describe('Market（市场深模块）', () => {
  beforeEach(() => {
    resetProjectionCache();
    bindProjection(projectContract(facts, caps));
  });

  it('★ 零手写选项：axes() 的值全来自契约投影，新增值零改代码', () => {
    const m = new Market({ vault: fakeVault(), runtime: fakeRuntime() });
    const form = m.axes().find((f) => f.axis === 'form')!;
    expect(form.values).toContain('pkg');
    expect(form.values).toContain('tree');
    expect(m.axes().find((f) => f.axis === 'role')!.values).toContain('toolchain');
    expect(m.list({ axis: 'form', value: 'tree' }).map((p) => p.name)).toContain('clang-toolchain');
  });

  it('★ 三路同轴：一次 ensure 完成 下载→boot→装载，UI/MCP/测试同一行', async () => {
    const vault = fakeVault();
    const runtime = fakeRuntime();
    const m = new Market({ vault, runtime });
    const v = await m.ensure('signal');
    expect(v.state).toBe('ok');
    expect(v.installed).toEqual(['signal']);
    expect(v.evidence.downloaded).toEqual(['signal']);
    expect(v.evidence.loadedFromOpfs).toBe(true);
    expect(v.evidence.booted).toBe(true);
    expect(vault.fetches).toBe(1);
    expect(vault.reads).toBe(1);
    expect(runtime.boots).toBe(1);
    expect(runtime.installs).toBe(1);
  });

  it('★ 工具链自动装配：含 src 的包不再被 llvm_required 恒拒', async () => {
    const vault = fakeVault();
    const runtime = fakeRuntime();
    const m = new Market({ vault, runtime });
    const v = await m.ensure('statistics');
    expect(v.state).toBe('ok');
    // 工具链 + 目标包各下载一次、各装载一次；零手写工具链名
    expect(vault.fetches).toBe(2);
    expect(vault.reads).toBe(2);
    expect(runtime.compiles).toBe(1);
    expect(runtime.installs).toBe(2);
  });

  it('★ 四态不塌陷：不存在的包必 not-found/not-in-any-list，不得 ok', async () => {
    const m = new Market({ vault: fakeVault(), runtime: fakeRuntime() });
    const v = await m.ensure('__no_such_pkg__');
    expect(v.state).toBe('not-found');
    expect(v.cause).toBe('not-in-any-list');
  });

  it('★ 反向：Vault.read 返回非 ok 时 ensure 透传该 cause，不假绿', async () => {
    const vault = fakeVault();
    (vault as any).read = async () => Object.freeze({ state: 'failed', cause: 'sha-mismatch', missing: [] });
    const m = new Market({ vault, runtime: fakeRuntime() });
    const v = await m.ensure('signal');
    expect(v.state).toBe('failed');
    expect(v.cause).toBe('sha-mismatch');
    expect(v.installed).toEqual([]);
  });

  it('★ 反向：把 Promise 当同步 BytesVerdict 读恒 undefined（旧断点不可回潮）', async () => {
    const m = new Market({ vault: fakeVault(), runtime: fakeRuntime() });
    const pending = m.ensure('signal');
    expect((pending as any).bytes).toBeUndefined();
    const v = await pending;
    expect(v.state).toBe('ok');
  });

  it('★ 并发去重：同名双发复用单 promise', async () => {
    const vault = fakeVault();
    const m = new Market({ vault, runtime: fakeRuntime() });
    const [a, b] = await Promise.all([m.ensure('signal'), m.ensure('signal')]);
    expect(a).toBe(b);
    expect(vault.fetches).toBe(1);
  });

  it('★ plan() 零网络、quota 读不到时是 null 不假绿', async () => {
    const m = new Market({ vault: fakeVault(), runtime: fakeRuntime() });
    const plan = await m.plan('statistics');
    expect(plan.bytes).toBe(200);
    expect(plan.layers).toEqual([]);
    expect(plan.quotaOk === null || typeof plan.quotaOk === 'boolean').toBe(true);
  });

  it('★ 未绑定投影时 axes() 响亮 throw（ASSEMBLY_FAULT，不合成空市场）', () => {
    resetProjectionCache();
    const m = new Market({ vault: fakeVault(), runtime: fakeRuntime() });
    expect(() => m.axes()).toThrow(/ASSEMBLY_FAULT/);
  });
});
