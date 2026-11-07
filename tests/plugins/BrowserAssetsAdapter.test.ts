// tests/plugins/BrowserAssetsAdapter.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrowserAssetsAdapter } from '../../src/modules/plugins/package/BrowserAssetsAdapter';

describe('BrowserAssetsAdapter Deep Module', () => {
  let adapter: BrowserAssetsAdapter;
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    adapter = new BrowserAssetsAdapter();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    (globalThis as any).window = originalWindow;
    (globalThis as any).fetch = originalFetch;
  });

  // spec §2.3：唯一读者 = window.OctaveAssets.catalog()。
  // 旧的三层兜底（catalog() → 直 fetch ×2 → browse() 合成目录）已删：
  // 它在 bridge 404 时自捏一份没有 url/sha256 的假目录且 isError:false，
  // 正是「包管理器目录非空」那个 PASS 的假绿来源。
  it('★ 正常：只经 catalog() 取目录，browse() 只补 status（不覆盖市场三键）', async () => {
    const market = [
      { name: 'cgi', version: '0.1.2', url: 'assets/forge/cgi-0.1.2.tar.gz',
        sha256: 'a'.repeat(64), size: 9960, description: 'CGI', links: [{ label: 'x', url: 'u' }],
        versions: [{ version: '0.1.2', stage: 'staged', url: 'assets/forge/cgi-0.1.2.tar.gz',
                     sha256: 'a'.repeat(64), size: 9960 }] },
    ];
    (globalThis as any).window = {
      OctaveAssets: {
        catalog: vi.fn().mockResolvedValue({ packs: market.map((p) => ({ ...p })) }),
        browse: vi.fn().mockResolvedValue([
          { name: 'cgi', compatible: true, installed: true, state: 'installed' },
        ]),
      },
    };
    const cat = await adapter.fetchCatalog();
    expect(cat.packs.length).toBe(1);
    expect(cat.packs[0].url).toBe('assets/forge/cgi-0.1.2.tar.gz');
    expect((cat.packs[0] as any).sha256).toBe('a'.repeat(64));
    expect((cat.packs[0] as any).versions[0].url).toBe('assets/forge/cgi-0.1.2.tar.gz');
    expect((cat.packs[0] as any).status.installed).toBe(true);   // 只补 status
    expect((window as any).OctaveAssets.catalog).toHaveBeenCalledTimes(1);
  });

  it('★ 反向：catalog() 404 ⇒ CATALOG_UNREADABLE 响亮上抛，绝不合成目录/直 fetch', async () => {
    const err: any = new Error('HTTP 404');
    err.code = 'CATALOG_UNREADABLE';
    (globalThis as any).window = {
      OctaveAssets: {
        catalog: vi.fn().mockRejectedValue(err),
        browse: vi.fn().mockResolvedValue([{ name: 'cgi' }]),
      },
      fetch: vi.fn(),   // 若适配器偷偷直 fetch，这条会被调用 ⇒ 立刻暴露
    };
    await expect(adapter.fetchCatalog()).rejects.toMatchObject({ code: 'CATALOG_UNREADABLE' });
    expect((window as any).fetch).not.toHaveBeenCalled();
    expect((window as any).OctaveAssets.browse).not.toHaveBeenCalled();
  });

  it('★ 空输入：window.OctaveAssets 缺席 ⇒ CATALOG_UNREADABLE（不静默空目录）', async () => {
    (globalThis as any).window = {};
    await expect(adapter.fetchCatalog()).rejects.toMatchObject({ code: 'CATALOG_UNREADABLE' });
  });

  it('★ 同类肯定：catalog() 返回空 packs ⇒ 同样拒，不冒充成功', async () => {
    (globalThis as any).window = {
      OctaveAssets: { catalog: vi.fn().mockResolvedValue({ packs: [] }) },
    };
    // 空数组仍是合法目录（0 包），探针能测到"存在"；但缺 packs 键必须红
    const cat = await adapter.fetchCatalog();
    expect(cat.packs.length).toBe(0);
    (window as any).OctaveAssets.catalog = vi.fn().mockResolvedValue({});
    await expect(adapter.fetchCatalog()).rejects.toMatchObject({ code: 'CATALOG_UNREADABLE' });
  });

  it('★ 零手写：工具链身份由契约 role 投影，拦截 NOT_INSTALLABLE (mail/024 & Q1)', async () => {
    // 同类肯定：先让探针能从契约测到「工具链条目存在」
    (globalThis as any).window = {
      OctaveAssets: {
        catalog: vi.fn().mockResolvedValue({
          schema: 2,
          packs: [
            { name: 'zig-wasm', version: '0.11.0', form: 'tree', role: 'toolchain',
              content: [], consumer: ['octave'], recipe: 'zig', url: 'assets/llvm/zig.wasm' },
            { name: 'signal', version: '1.4.3', form: 'pkg', role: 'package',
              content: ['m'], consumer: ['octave'], url: 'assets/forge/signal.tar.gz' },
          ],
        }),
      },
    };
    await adapter.fetchCatalog();
    const blocked = await adapter.install('zig-wasm');
    expect(blocked.state).toBe('failed');
    expect(blocked.why).toBe('NOT_INSTALLABLE');
    expect(blocked.cause).toBe('NOT_INSTALLABLE');
    expect(blocked.message).toContain('编译工具链');
    // 反向：普通包不因名字含 wasm 之类形状被误拦
    const normal = await adapter.install('signal');
    expect(normal.state).not.toBe('failed');
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
