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
  it('canonical spec import path re-exports WasmEmbedAdapter correctly', async () => {
    const specModule = await import('../../src/lib/engine/adapters/WasmEmbedAdapter');
    expect(specModule.WasmEmbedAdapter).toBe(WasmEmbedAdapter);
  });

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
    const { MemoryStore } = await import('../../src/modules/storage/MemoryStore');
    const { EngineAssetResolver } = await import('../../src/modules/engine/EngineAssetResolver');

    const memoryStore = new MemoryStore();
    await memoryStore.init();
    await memoryStore.write('downloads/engine/master/w64/octave.wasm', new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01]));
    await memoryStore.write('downloads/engine/master/w64/octave.data', new Uint8Array([0x4f, 0x43, 0x54, 0x41, 0x56, 0x45]));

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

    const existingScript = document.createElement('script');
    existingScript.setAttribute('data-lane', 'master-w64');
    document.head.appendChild(existingScript);

    const adapter = await WasmEmbedAdapter.boot({ lane: 'master' });
    expect(adapter).toBeInstanceOf(WasmEmbedAdapter);
    expect(wasmFetchedStatus).toBe(200);
    expect(dataFetchedStatus).toBe(200);
    expect(networkFetchMock).not.toHaveBeenCalled();

    existingScript.remove();
    EngineAssetResolver.resetInstance();
  });
});
