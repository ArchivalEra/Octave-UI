// tests/engine/WasmEmbedAdapter.test.ts
import { describe, it, expect, vi } from 'vitest';
import { WasmEmbedAdapter } from '../../src/modules/engine/WasmEmbedAdapter';

describe('WasmEmbedAdapter alignDocstringsPaths', () => {
  it('safely handles null or undefined embed', () => {
    expect(() => WasmEmbedAdapter.alignDocstringsPaths(null)).not.toThrow();
    expect(() => WasmEmbedAdapter.alignDocstringsPaths(undefined)).not.toThrow();
    expect(() => WasmEmbedAdapter.alignDocstringsPaths({})).not.toThrow();
    expect(() => WasmEmbedAdapter.alignDocstringsPaths({ mod: {} })).not.toThrow();
  });

  it('mirrors built-in-docstrings and doc-cache from w64 path to canonical prefix', () => {
    const files: Record<string, Uint8Array> = {
      '/src/work/octave-install-w64/share/octave/11.3.0/etc/built-in-docstrings': new Uint8Array([1, 2, 3]),
      '/src/work/octave-install-w64/share/octave/11.3.0/etc/doc-cache': new Uint8Array([4, 5, 6]),
    };
    const createdDirs = new Set<string>();

    const mockFS = {
      stat: (path: string) => {
        if (files[path]) {
          return { size: files[path].length };
        }
        throw new Error('ENOENT');
      },
      mkdirTree: (dir: string) => {
        createdDirs.add(dir);
      },
      readFile: (path: string) => {
        if (files[path]) return files[path];
        throw new Error('ENOENT');
      },
      writeFile: (path: string, content: Uint8Array) => {
        files[path] = content;
      },
    };

    const mockEmbed = {
      mod: { FS: mockFS },
    };

    WasmEmbedAdapter.alignDocstringsPaths(mockEmbed);

    expect(createdDirs.has('/src/work/octave-install/share/octave/11.3.0/etc')).toBe(true);
    expect(files['/src/work/octave-install/share/octave/11.3.0/etc/built-in-docstrings']).toEqual(new Uint8Array([1, 2, 3]));
    expect(files['/src/work/octave-install/share/octave/11.3.0/etc/doc-cache']).toEqual(new Uint8Array([4, 5, 6]));
  });

  it('is idempotent and does not overwrite if target files already exist', () => {
    const files: Record<string, Uint8Array> = {
      '/src/work/octave-install-w64/share/octave/11.3.0/etc/built-in-docstrings': new Uint8Array([1, 2, 3]),
      '/src/work/octave-install/share/octave/11.3.0/etc/built-in-docstrings': new Uint8Array([9, 9, 9]),
    };

    const writeFileSpy = vi.fn();
    const mockFS = {
      stat: (path: string) => {
        if (files[path]) {
          return { size: files[path].length };
        }
        throw new Error('ENOENT');
      },
      mkdirTree: vi.fn(),
      readFile: (path: string) => files[path],
      writeFile: writeFileSpy,
    };

    const mockEmbed = { mod: { FS: mockFS } };
    WasmEmbedAdapter.alignDocstringsPaths(mockEmbed);

    expect(writeFileSpy).not.toHaveBeenCalledWith(
      '/src/work/octave-install/share/octave/11.3.0/etc/built-in-docstrings',
      expect.anything()
    );
  });
});

describe('WasmEmbedAdapter boot with EngineAssetResolver', () => {
  // #10 Q10.1：原「canonical spec import path re-exports WasmEmbedAdapter」自证用例已删——
  // 它是 src/lib/engine/adapters/ 重导出壳的唯一消费者（壳存在才需要自证壳存在）；
  // 壳于 2026-10-23 物理删除（modules/ 为真模块产地），本文件其余用例早已直接
  // import '../../src/modules/engine/WasmEmbedAdapter'（核对过，无需改动）。

  it('routes engine boot through EngineAssetResolver.withLocalAssets with correct octaveLane for omc', async () => {
    const interceptedCalls: Array<{ lane: string; variant: string }> = [];

    // Mock EngineAssetResolver
    const { EngineAssetResolver } = await import('../../src/modules/engine/EngineAssetResolver');
    const resolver = EngineAssetResolver.getInstance();
    const originalWithLocalAssets = resolver.withLocalAssets.bind(resolver);

    vi.spyOn(resolver, 'withLocalAssets').mockImplementation(async (lane, variant, bootFn) => {
      interceptedCalls.push({ lane, variant });
      return bootFn();
    });

    const mockEmbedInstance = {
      id: 'test-omc',
      state: 'idle',
      eval: vi.fn(),
      on: { output: vi.fn(), error: vi.fn(), state: vi.fn(), figure: vi.fn() },
      fs: { read: vi.fn(), write: vi.fn(), ls: vi.fn(), rm: vi.fn(), download: vi.fn() },
      figures: { export: vi.fn() },
    };

    (globalThis as any).window = {
      OctaveEmbed: {
        create: vi.fn().mockResolvedValue(mockEmbedInstance),
      },
    };

    const existingScript = document.createElement('script');
    existingScript.setAttribute('data-lane', 'wasm32-final-base');
    document.head.appendChild(existingScript);

    const adapter = await WasmEmbedAdapter.boot({ lane: 'omc' });
    expect(adapter).toBeInstanceOf(WasmEmbedAdapter);

    // 对于 omc 车道，底层的 Octave 宿主必须是 wasm32-final (w32)
    expect(interceptedCalls[0]).toEqual({ lane: 'wasm32-final', variant: 'w32' });

    existingScript.remove();
    vi.restoreAllMocks();
  });

  it('boots 100% offline with zero network requests when OPFS assets are present', async () => {
    // #6 离线五件套 fixture：wasm/data/js/build/assets-manifest 五件盘上齐 +
    // 伪 manifest 记账五条带真算 sha（参照 EngineAssetResolver.test.ts 的
    // writeVerifiedEngine 写法）⇒ checkPhysicalStatus verified ⇒ boot 走
    // OPFS 直载路线（octave.js 从本地 Blob 注入），fetch 全断也零网络。
    const { MemoryStore } = await import('../../src/modules/storage/MemoryStore');
    const { EngineAssetResolver } = await import('../../src/modules/engine/EngineAssetResolver');

    function sha256OfNode(data: Uint8Array): string {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const nodeCrypto = require('node:crypto') as typeof import('node:crypto');
      return nodeCrypto.createHash('sha256').update(data).digest('hex');
    }

    const memoryStore = new MemoryStore();
    await memoryStore.init();

    const prefix = 'downloads/engine/master/w64';
    const fiveFiles: Array<{ name: string; data: Uint8Array }> = [
      { name: 'octave.wasm', data: new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01]) },
      { name: 'octave.data', data: new Uint8Array([0x4f, 0x43, 0x54, 0x41, 0x56, 0x45]) },
      { name: 'octave.js', data: new TextEncoder().encode('// glue') },
      { name: 'octave.build.json', data: new TextEncoder().encode('{"measured":{"files":{}}}') },
      { name: 'assets-manifest.json', data: new TextEncoder().encode('{"assets":{}}') },
    ];
    for (const f of fiveFiles) {
      await memoryStore.write(`${prefix}/${f.name}`, f.data);
    }
    await memoryStore.write(
      'downloads/manifest.json',
      new TextEncoder().encode(
        JSON.stringify({
          schema: 1,
          items: {
            'engine:octave@11.3.0:master/w64': {
              ref: { name: 'octave', version: '11.3.0', kind: 'engine', arch: 'master/w64' },
              sha256: 'combined',
              bytes: fiveFiles.reduce((s, f) => s + f.data.length, 0),
              files: fiveFiles.map((f) => ({
                path: `${prefix}/${f.name}`,
                sha256: sha256OfNode(f.data),
                bytes: f.data.length,
              })),
              downloadedAt: '2026-10-23T00:00:00.000Z',
            },
          },
        })
      )
    );

    const resolver = new EngineAssetResolver(memoryStore);
    EngineAssetResolver.setInstance(resolver);

    const networkFetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch (offline network)'));
    globalThis.fetch = networkFetchMock;

    let wasmFetchedStatus = 0;
    let dataFetchedStatus = 0;

    const mockEmbedInstance = {
      id: 'offline-master',
      state: 'idle',
      eval: vi.fn(),
      on: { output: vi.fn(), error: vi.fn(), state: vi.fn(), figure: vi.fn() },
      fs: { read: vi.fn(), write: vi.fn(), ls: vi.fn(), rm: vi.fn(), download: vi.fn() },
      figures: { export: vi.fn() },
    };

    (globalThis as any).window = {
      OctaveEmbed: {
        create: vi.fn().mockImplementation(async () => {
          // 模拟上游 octave-core.js 与 Emscripten 运行时发起的 fetch
          const respWasm = await globalThis.fetch('https://octave.test/lanes/master/w64/octave.wasm');
          wasmFetchedStatus = respWasm.status;
          const respData = await globalThis.fetch('https://octave.test/lanes/master/w64/octave.data');
          dataFetchedStatus = respData.status;
          return mockEmbedInstance;
        }),
      },
    };

    // 不预置 data-lane script：OPFS 直载路线必须自己从本地读 octave.js 注入
    document.querySelectorAll('script[data-lane]').forEach((s) => s.remove());

    const adapter = await WasmEmbedAdapter.boot({ lane: 'master' });
    expect(adapter).toBeInstanceOf(WasmEmbedAdapter);
    expect(wasmFetchedStatus).toBe(200);
    expect(dataFetchedStatus).toBe(200);
    // 零网络：dummy fetch 从未被调用（本地 script 注入 + scoped 代理全接管）
    expect(networkFetchMock).toHaveBeenCalledTimes(0);
    // OPFS 直载证据：data-lane script 是本地注入的（无 src 属性 = 不是网络 script）
    const injected = document.querySelector('script[data-lane]');
    expect(injected).not.toBeNull();
    expect(injected!.getAttribute('data-lane')).toBe('master-w64');
    expect(injected!.getAttribute('src')).toBeNull();

    injected?.remove();
    EngineAssetResolver.resetInstance();
  });

  it('throws ENGINE_CORRUPTED before boot when the five-piece set is broken on disk (missing assets-manifest)', async () => {
    // #6 Q6.4 缺件用例：记账五条、盘上四条（用户手删 assets-manifest.json）
    // ⇒ integrity corrupted（含缓存不命中验证：先验一次让缓存进 verified，
    // 再删件，第二次必须不再命中缓存——指纹面与记账面同宽）
    const { MemoryStore } = await import('../../src/modules/storage/MemoryStore');
    const { EngineAssetResolver } = await import('../../src/modules/engine/EngineAssetResolver');

    function sha256OfNode(data: Uint8Array): string {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const nodeCrypto = require('node:crypto') as typeof import('node:crypto');
      return nodeCrypto.createHash('sha256').update(data).digest('hex');
    }

    const memoryStore = new MemoryStore();
    await memoryStore.init();

    const prefix = 'downloads/engine/master/w64';
    const fiveFiles: Array<{ name: string; data: Uint8Array }> = [
      { name: 'octave.wasm', data: new Uint8Array(2048) },
      { name: 'octave.data', data: new Uint8Array(1024) },
      { name: 'octave.js', data: new TextEncoder().encode('// glue') },
      { name: 'octave.build.json', data: new TextEncoder().encode('{"measured":{"files":{}}}') },
      { name: 'assets-manifest.json', data: new TextEncoder().encode('{"assets":{}}') },
    ];
    for (const f of fiveFiles) {
      await memoryStore.write(`${prefix}/${f.name}`, f.data);
    }
    await memoryStore.write(
      'downloads/manifest.json',
      new TextEncoder().encode(
        JSON.stringify({
          schema: 1,
          items: {
            'engine:octave@11.3.0:master/w64': {
              ref: { name: 'octave', version: '11.3.0', kind: 'engine', arch: 'master/w64' },
              sha256: 'combined',
              bytes: fiveFiles.reduce((s, f) => s + f.data.length, 0),
              files: fiveFiles.map((f) => ({
                path: `${prefix}/${f.name}`,
                sha256: sha256OfNode(f.data),
                bytes: f.data.length,
              })),
              downloadedAt: '2026-10-23T00:00:00.000Z',
            },
          },
        })
      )
    );

    const resolver = new EngineAssetResolver(memoryStore);
    EngineAssetResolver.setInstance(resolver);

    // 先验一次让会话缓存进 verified（指纹记的是五件 stat size）
    expect((await resolver.checkPhysicalStatus('master')).integrity).toBe('verified');

    // 用户手删 assets-manifest.json：wasm/data 的 size 不变——旧指纹（只看两件）
    // 会误命中缓存报 verified；五件指纹必须让缓存失活
    await memoryStore.remove(`${prefix}/assets-manifest.json`);

    const status = await resolver.checkPhysicalStatus('master');
    expect(status.downloaded).toBe(true); // wasm/data 仍在：存在语义保持
    expect(status.integrity).toBe('corrupted'); // 记账五条盘上四条 ⇒ 盘变账没变

    // boot 前置对账：corrupted ⇒ throw ENGINE_CORRUPTED（fail fast，不静默走网络）
    const networkFetchMock = vi.fn();
    globalThis.fetch = networkFetchMock;

    (globalThis as any).window = {
      OctaveEmbed: {
        create: vi.fn(),
      },
    };

    await expect(WasmEmbedAdapter.boot({ lane: 'master' })).rejects.toSatisfy((err: unknown) => {
      const e = err as Error & { code?: string };
      return e instanceof Error && e.code === 'ENGINE_CORRUPTED';
    });
    // fail fast：坏盘不许碰网络下载路线
    expect(networkFetchMock).toHaveBeenCalledTimes(0);

    EngineAssetResolver.resetInstance();
  });
});
