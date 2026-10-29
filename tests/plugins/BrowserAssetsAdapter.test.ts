// tests/plugins/BrowserAssetsAdapter.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrowserAssetsAdapter } from '../../src/modules/plugins/package/BrowserAssetsAdapter';

describe('BrowserAssetsAdapter Deep Module', () => {
  let adapter: BrowserAssetsAdapter;
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    adapter = new BrowserAssetsAdapter('/');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    (globalThis as any).window = originalWindow;
    (globalThis as any).fetch = originalFetch;
  });

  it('merges OctaveAssets.catalog() packs with OctaveAssets.browse() entries (U-1 & mail/030)', async () => {
    const mockCatPacks = [
      {
        name: 'cgi',
        version: '0.1.2',
        size: 9960,
        form: 'pkg',
        role: 'package',
        consumer: ['octave'],
        deps: [],
      },
      {
        name: 'llvm-wasm',
        version: '6.0.12',
        size: 34693729,
        form: 'tree',
        role: 'toolchain',
        consumer: ['octave'],
        deps: [],
      },
    ];

    const mockBrowseEntries = [
      {
        name: 'cgi',
        version: '0.1.2',
        description: 'Common Gateway Interface for Octave',
        links: [{ label: 'Source', url: 'https://octave.test/cgi' }],
        versions: [{ version: '0.1.2', stage: 'staged' }],
        compatible: true,
        fromSource: false,
        installed: false,
        state: 'available',
        why: [],
      },
      {
        name: 'llvm-wasm',
        version: '6.0.12',
        description: 'LLVM Toolchain capability layer',
        links: [],
        versions: [{ version: '6.0.12', stage: 'staged' }],
        compatible: true,
        fromSource: false,
        installed: true,
        state: 'installed',
        why: [],
      },
    ];

    (globalThis as any).window = {
      OctaveAssets: {
        catalog: vi.fn().mockResolvedValue({ packs: mockCatPacks }),
        browse: vi.fn().mockResolvedValue(mockBrowseEntries),
      },
    };

    const result = await adapter.fetchCatalog();
    expect(result.packs.length).toBe(2);

    const cgi = result.packs.find((p) => p.name === 'cgi');
    expect(cgi).toBeDefined();
    expect(cgi?.description).toBe('Common Gateway Interface for Octave');
    expect(cgi?.links).toEqual([{ label: 'Source', url: 'https://octave.test/cgi' }]);
    expect(cgi?.versions).toEqual([{ version: '0.1.2', stage: 'staged' }]);
    expect((cgi as any)?.status?.compatible).toBe(true);

    const llvm = result.packs.find((p) => p.name === 'llvm-wasm');
    expect(llvm).toBeDefined();
    expect(llvm?.role).toBe('toolchain');
    expect((llvm as any)?.status?.installed).toBe(true);
  });

  it('falls back to fetching forge-catalog.json when OctaveAssets is absent, still merging browse() if present', async () => {
    (globalThis as any).window = {
      OctaveAssets: {
        browse: vi.fn().mockResolvedValue([
          {
            name: 'cgi',
            version: '0.1.2',
            description: 'Live browse description',
            compatible: true,
            fromSource: false,
            installed: false,
          },
        ]),
      },
    };

    (globalThis as any).fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({
        packs: [
          {
            name: 'cgi',
            version: '0.1.2',
            role: 'package',
            consumer: ['octave'],
            size: 9960,
          },
        ],
      }),
    });

    const result = await adapter.fetchCatalog();
    expect(result.packs.length).toBe(1);
    expect(result.packs[0].description).toBe('Live browse description');
    expect(result.packs[0].role).toBe('package');
  });

  it('throws CATALOG_UNREADABLE error code when catalog fetch fails (U-2 / D4)', async () => {
    (globalThis as any).window = {};
    (globalThis as any).fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      headers: { get: () => 'text/plain' },
    });

    await expect(adapter.fetchCatalog()).rejects.toMatchObject({
      code: 'CATALOG_UNREADABLE',
    });
  });

  it('blocks toolchain installation with NOT_INSTALLABLE verdict (mail/024 & Q1)', async () => {
    const res = await adapter.install('llvm-wasm');
    expect(res.state).toBe('failed');
    expect(res.why).toBe('NOT_INSTALLABLE');
    expect(res.cause).toBe('NOT_INSTALLABLE');
    expect(res.message).toContain('编译工具链');
  });

  it('maps upstream error codes such as LAYER_NOT_IMPLEMENTED into verdict (mail/024 §5)', async () => {
    const mockErr: any = new Error('Layer not implemented');
    mockErr.code = 'LAYER_NOT_IMPLEMENTED';

    (globalThis as any).window = {
      OctaveAssets: {
        install: vi.fn().mockRejectedValue(mockErr),
      },
    };

    const res = await adapter.install('pyodide');
    expect(res.state).toBe('failed');
    expect(res.why).toBe('LAYER_NOT_IMPLEMENTED');
    expect(res.cause).toBe('LAYER_NOT_IMPLEMENTED');
  });
});
