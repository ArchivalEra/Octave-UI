// tests/engine/EngineAssetResolver.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EngineAssetResolver, getDefaultVariant } from '../../src/modules/engine/EngineAssetResolver';
import { MemoryStore } from '../../src/modules/storage/MemoryStore';

describe('EngineAssetResolver Deep Module', () => {
  let memoryStore: MemoryStore;
  let resolver: EngineAssetResolver;
  let originalGlobalFetch: typeof globalThis.fetch;

  beforeEach(async () => {
    originalGlobalFetch = globalThis.fetch;
    memoryStore = new MemoryStore();
    await memoryStore.init();
    resolver = new EngineAssetResolver(memoryStore);
    EngineAssetResolver.setInstance(resolver);
  });

  afterEach(() => {
    globalThis.fetch = originalGlobalFetch;
    EngineAssetResolver.resetInstance();
  });

  it('resolves correct default variants for each engine lane', () => {
    expect(getDefaultVariant('master')).toBe('w64');
    expect(getDefaultVariant('IllegalPerformance')).toBe('w64');
    expect(getDefaultVariant('wasm32-final')).toBe('w32');
    expect(getDefaultVariant('omc')).toBe('w32');
  });

  it('physical stat: reports downloaded=false when storage is empty', async () => {
    const statusMaster = await resolver.checkPhysicalStatus('master');
    expect(statusMaster.downloaded).toBe(false);
    expect(statusMaster.lane).toBe('master');
    expect(statusMaster.variant).toBe('w64');
    expect(statusMaster.totalBytes).toBe(0);

    const statusOmc = await resolver.checkPhysicalStatus('omc');
    expect(statusOmc.downloaded).toBe(false);
    expect(statusOmc.lane).toBe('omc');
    expect(statusOmc.variant).toBe('w32');
    expect(statusOmc.totalBytes).toBe(0);
  });

  it('physical stat: reports downloaded=false if octave.wasm exists but octave.data is missing or 0 bytes', async () => {
    // 仅写入 octave.wasm
    await memoryStore.write('downloads/engine/master/w64/octave.wasm', new Uint8Array([1, 2, 3, 4]));
    let status = await resolver.checkPhysicalStatus('master');
    expect(status.downloaded).toBe(false);

    // 写入 0 字节的 octave.data
    await memoryStore.write('downloads/engine/master/w64/octave.data', new Uint8Array([]));
    status = await resolver.checkPhysicalStatus('master');
    expect(status.downloaded).toBe(false);
  });

  it('physical stat: reports downloaded=true and accurate totalBytes when all required files exist with size > 0', async () => {
    const wasmBytes = new Uint8Array(1024);
    const dataBytes = new Uint8Array(2048);
    await memoryStore.write('downloads/engine/master/w64/octave.wasm', wasmBytes);
    await memoryStore.write('downloads/engine/master/w64/octave.data', dataBytes);

    const status = await resolver.checkPhysicalStatus('master');
    expect(status.downloaded).toBe(true);
    expect(status.variant).toBe('w64');
    expect(status.totalBytes).toBe(3072);
    expect(status.verifiedAt).toBeGreaterThan(0);
  });

  it('physical stat: checks OMC files correctly', async () => {
    const omcWasm = new Uint8Array(5000);
    const omcJs = new Uint8Array(500);
    await memoryStore.write('downloads/engine/omc/w32/OpenModelicaCompiler_bg.wasm', omcWasm);
    await memoryStore.write('downloads/engine/omc/w32/OpenModelicaCompiler.js', omcJs);

    const status = await resolver.checkPhysicalStatus('omc');
    expect(status.downloaded).toBe(true);
    expect(status.lane).toBe('omc');
    expect(status.variant).toBe('w32');
    expect(status.totalBytes).toBe(5500);
  });

  it('physical stat: reports downloaded=false for OMC if OpenModelicaCompiler.js is missing or 0 bytes', async () => {
    // 仅写入 OpenModelicaCompiler_bg.wasm
    await memoryStore.write('downloads/engine/omc/w32/OpenModelicaCompiler_bg.wasm', new Uint8Array(5000));
    let status = await resolver.checkPhysicalStatus('omc');
    expect(status.downloaded).toBe(false);

    // 写入 0 字节的 OpenModelicaCompiler.js
    await memoryStore.write('downloads/engine/omc/w32/OpenModelicaCompiler.js', new Uint8Array([]));
    status = await resolver.checkPhysicalStatus('omc');
    expect(status.downloaded).toBe(false);
  });

  it('matchRequest: strict isolation prevents cross-lane and cross-variant mis-matching', () => {
    // 1. master (w64) 规则
    expect(resolver.matchRequest('master', 'w64', '/lanes/master/w64/octave.wasm')).toEqual({ filename: 'octave.wasm' });
    expect(resolver.matchRequest('master', 'w64', '/lanes/master/w64/octave.js')).toEqual({ filename: 'octave.js' });
    expect(resolver.matchRequest('master', 'w64', '/octave.data')).toEqual({ filename: 'octave.data' });

    // 严禁匹配到其他车道的请求
    expect(resolver.matchRequest('master', 'w64', '/lanes/IllegalPerformance/w64/octave.wasm')).toBeNull();
    expect(resolver.matchRequest('master', 'w64', '/lanes/wasm32-final/octave.wasm')).toBeNull();
    expect(resolver.matchRequest('master', 'w64', '/lanes/omc/octave.wasm')).toBeNull();

    // 严禁匹配到冲突架构的请求
    expect(resolver.matchRequest('master', 'w64', '/w32/octave.wasm')).toBeNull();
    expect(resolver.matchRequest('wasm32-final', 'w32', '/w64/octave.wasm')).toBeNull();
  });

  it('evict: physically removes engine files and transitions status to downloaded=false', async () => {
    await memoryStore.write('downloads/engine/master/w64/octave.wasm', new Uint8Array([1, 2]));
    await memoryStore.write('downloads/engine/master/w64/octave.data', new Uint8Array([3, 4]));

    expect((await resolver.checkPhysicalStatus('master')).downloaded).toBe(true);

    await resolver.evict('master');
    expect((await resolver.checkPhysicalStatus('master')).downloaded).toBe(false);
  });

  it('Scoped Fetch Proxy: intercepts octave.wasm and octave.data with streaming Response and proper headers', async () => {
    const wasmData = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
    const memData = new Uint8Array([0x4f, 0x43, 0x54, 0x41, 0x56, 0x45]);
    await memoryStore.write('downloads/engine/master/w64/octave.wasm', wasmData);
    await memoryStore.write('downloads/engine/master/w64/octave.data', memData);

    const dummyNetworkFetch = vi.fn().mockResolvedValue(new Response('from network'));
    globalThis.fetch = dummyNetworkFetch;

    await resolver.withLocalAssets('master', 'w64', async () => {
      // 1. 请求 octave.wasm
      const resWasm = await fetch('https://octave.test/lanes/master/w64/octave.wasm');
      expect(resWasm.status).toBe(200);
      expect(resWasm.headers.get('Content-Type')).toBe('application/wasm');
      expect(resWasm.headers.get('Content-Length')).toBe(wasmData.length.toString());
      const bodyWasm = new Uint8Array(await resWasm.arrayBuffer());
      expect(bodyWasm).toEqual(wasmData);

      // 2. 请求 octave.data
      const resData = await fetch('https://octave.test/lanes/master/w64/octave.data');
      expect(resData.status).toBe(200);
      expect(resData.headers.get('Content-Type')).toBe('application/octet-stream');
      expect(resData.headers.get('Content-Length')).toBe(memData.length.toString());
      const bodyData = new Uint8Array(await resData.arrayBuffer());
      expect(bodyData).toEqual(memData);

      // 3. 请求非引擎资源：原样透传网络 fetch
      const resOther = await fetch('https://octave.test/lanes/master/assets/manifest.json');
      expect(dummyNetworkFetch).toHaveBeenCalledWith(
        'https://octave.test/lanes/master/assets/manifest.json',
        undefined
      );
      expect(await resOther.text()).toBe('from network');
    });

    // 引擎启动完成：网络未被请求 wasm/data，并且 fetch 已被完全恢复
    expect(dummyNetworkFetch).not.toHaveBeenCalledWith(
      expect.stringContaining('octave.wasm'),
      expect.anything()
    );
    expect(dummyNetworkFetch).not.toHaveBeenCalledWith(
      expect.stringContaining('octave.data'),
      expect.anything()
    );
    expect(globalThis.fetch).toBe(dummyNetworkFetch);
  });

  it('Scoped Fetch Proxy: RAII restores original fetch even when bootFn throws', async () => {
    const dummyFetch = vi.fn();
    globalThis.fetch = dummyFetch;

    await expect(
      resolver.withLocalAssets('master', 'w64', async () => {
        expect(globalThis.fetch).not.toBe(dummyFetch);
        throw new Error('Boot crash simulation');
      })
    ).rejects.toThrow('Boot crash simulation');

    expect(globalThis.fetch).toBe(dummyFetch);
  });

  it('concurrency protection: nested or concurrent withLocalAssets calls do not clobber each other', async () => {
    const octaveWasm = new Uint8Array([1, 1, 1]);
    const octaveData = new Uint8Array([2, 2, 2]);
    const omcWasm = new Uint8Array([3, 3, 3]);

    await memoryStore.write('downloads/engine/master/w64/octave.wasm', octaveWasm);
    await memoryStore.write('downloads/engine/master/w64/octave.data', octaveData);
    await memoryStore.write('downloads/engine/omc/w32/OpenModelicaCompiler_bg.wasm', omcWasm);

    const dummyFetch = vi.fn().mockResolvedValue(new Response('network fallback'));
    globalThis.fetch = dummyFetch;

    // 模拟外层启动 Octave，内层并发/嵌套启动 OMC
    await resolver.withLocalAssets('master', 'w64', async () => {
      // 启动 OMC
      await resolver.withLocalAssets('omc', 'w32', async () => {
        // 双引擎代理同时生效
        const resOmc = await fetch('https://octave.test/omc/OpenModelicaCompiler_bg.wasm');
        expect(resOmc.status).toBe(200);
        expect(resOmc.headers.get('Content-Type')).toBe('application/wasm');
        expect(new Uint8Array(await resOmc.arrayBuffer())).toEqual(omcWasm);

        const resOctave = await fetch('https://octave.test/lanes/master/w64/octave.wasm');
        expect(resOctave.status).toBe(200);
        expect(new Uint8Array(await resOctave.arrayBuffer())).toEqual(octaveWasm);
      });

      // OMC 退出后，Octave 代理依然有效
      const resOctaveAfter = await fetch('https://octave.test/lanes/master/w64/octave.data');
      expect(resOctaveAfter.status).toBe(200);
      expect(new Uint8Array(await resOctaveAfter.arrayBuffer())).toEqual(octaveData);
    });

    // 全部退出后，全局 fetch 干净还原
    expect(globalThis.fetch).toBe(dummyFetch);
  });

  it('offline zero-network compute: boots 100% offline without triggering network errors when offline', async () => {
    await memoryStore.write('downloads/engine/master/w64/octave.wasm', new Uint8Array([9, 8, 7]));
    await memoryStore.write('downloads/engine/master/w64/octave.data', new Uint8Array([6, 5, 4]));

    // 模拟纯断网环境：任何网络请求直接抛出 TypeError: Failed to fetch
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch (offline network)'));

    let bootResult = '';
    await resolver.withLocalAssets('master', 'w64', async () => {
      const respWasm = await fetch('https://octave.test/lanes/master/w64/octave.wasm');
      const respData = await fetch('https://octave.test/lanes/master/w64/octave.data');
      expect(respWasm.status).toBe(200);
      expect(respData.status).toBe(200);
      bootResult = 'BOOT_OFFLINE_SUCCESS';
    });

    expect(bootResult).toBe('BOOT_OFFLINE_SUCCESS');
  });
});
