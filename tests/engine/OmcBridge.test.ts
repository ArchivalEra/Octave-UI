// tests/engine/OmcBridge.test.ts
// OMC 桥抽离契约：导出形状、双引擎失败上抛 + code、纯 omc lane 上抛、
// engine 层不碰 UI 面（无 toastService import）、__omcError 旁路取消、
// WasmEmbedAdapter.boot 的双引擎降级接线（FLAVOR_UNAVAILABLE 吞掉、其余上抛）。
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
});
