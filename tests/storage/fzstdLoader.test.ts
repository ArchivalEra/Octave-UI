// tests/storage/fzstdLoader.test.ts
// fzstd 加载器的两条硬约束（用户 2026-11-03）：
//   ① **绝对不能持久存储**（不许落 HTTP 缓存 / 磁盘 / OPFS / IndexedDB / sessionStorage）
//   ② **用户没退出网站之前只能拉一次**（一个 document 内只取一次字节）
//
// 这两条是相反方向的要求（省流量 vs 不留痕），所以每条都要有**反向断言**：
// 不能只测「能加载」，要测「没落盘」和「没重复拉」。
//
// 复跑：CI=true npx vitest run tests/storage/fzstdLoader.test.ts

import { describe, it, expect, vi } from 'vitest';
import { createFzstdLoader, FzstdLoadError, type FzstdLoaderDeps } from '../../src/modules/storage/fzstdLoader';

const SOURCE = new TextEncoder().encode('export function decompress(){return new Uint8Array([1])}');
const SHA = 'a'.repeat(64);

/** 造一个可观测的依赖集：记录 fetch 次数、URL、cache 指令、存储 API 调用 */
function makeDeps(overrides: Partial<FzstdLoaderDeps> = {}) {
  const fetches: Array<{ url: string; cache: string }> = [];
  const revokes: string[] = [];
  const created: Blob[] = [];
  let fetchFail = false;
  let badSha = false;
  let importFail = false;

  const deps: FzstdLoaderDeps = {
    url: 'https://site.test/lib/fzstd-0.1.1.mjs',
    expectedSha256: SHA,
    fetchBytes: vi.fn(async (url: string, init: { cache: string }) => {
      fetches.push({ url, cache: init.cache });
      if (fetchFail) return { ok: false, status: 503, bytes: new Uint8Array(0) };
      return { ok: true, status: 200, bytes: SOURCE };
    }),
    importModule: vi.fn(async () => {
      if (importFail) throw new Error('blob import blocked by CSP');
      return { decompress: (d: Uint8Array) => d };
    }),
    sha256: vi.fn(async () => (badSha ? 'b'.repeat(64) : SHA)),
    createObjectURL: vi.fn((blob: Blob) => {
      created.push(blob);
      return `blob:test/${created.length}`;
    }),
    revokeObjectURL: vi.fn((url: string) => revokes.push(url)),
    ...overrides,
  };

  return {
    deps,
    fetches,
    revokes,
    created,
    setFetchFail: (v: boolean) => (fetchFail = v),
    setBadSha: (v: boolean) => (badSha = v),
    setImportFail: (v: boolean) => (importFail = v),
  };
}

describe('约束 ②：一个 document 内只拉一次', () => {
  it('★ 串行 3 次 load ⇒ 只 fetch 1 次，且拿到同一模块实例', async () => {
    const { deps, fetches } = makeDeps();
    const loader = createFzstdLoader(deps);
    const a = await loader.load();
    const b = await loader.load();
    const c = await loader.load();
    expect(fetches).toHaveLength(1);
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it('★ 并发 5 次 load ⇒ 只 fetch 1 次（单飞，不是各拉一次）', async () => {
    const { deps, fetches } = makeDeps();
    const loader = createFzstdLoader(deps);
    const results = await Promise.all([1, 2, 3, 4, 5].map(() => loader.load()));
    expect(fetches).toHaveLength(1);
    // 全部同一个实例
    expect(new Set(results).size).toBe(1);
  });

  it('★ 解码器实际用到两次也不要重取（loader 层面已保证）', async () => {
    const { deps, fetches } = makeDeps();
    const loader = createFzstdLoader(deps);
    const mod1 = await loader.load();
    mod1.decompress(new Uint8Array([1]));
    const mod2 = await loader.load();
    mod2.decompress(new Uint8Array([2]));
    expect(fetches).toHaveLength(1);
  });
});

describe('约束 ①：绝对不能持久存储', () => {
  it('★ 请求必须带 cache: "no-store"（浏览器不得读/写任何 HTTP 缓存）', async () => {
    const { deps, fetches } = makeDeps();
    const loader = createFzstdLoader(deps);
    await loader.load();
    expect(fetches[0].cache).toBe('no-store');
  });

  it('★ URL 必须带每次 document 唯一的 nonce（缓存键结构上不可复用）', async () => {
    const { deps, fetches } = makeDeps();
    const loader = createFzstdLoader(deps);
    await loader.load();
    const url = fetches[0].url;
    expect(url).toMatch(/\?v=[0-9a-f]{32}$/);
    expect(url).toContain('fzstd-0.1.1.mjs');
  });

  it('★ 两个独立 loader（模拟两次访问）⇒ nonce 不同（跨会话缓存键不同）', async () => {
    const d1 = makeDeps();
    const d2 = makeDeps();
    await createFzstdLoader(d1.deps).load();
    await createFzstdLoader(d2.deps).load();
    const n1 = new URL(d1.fetches[0].url).searchParams.get('v');
    const n2 = new URL(d2.fetches[0].url).searchParams.get('v');
    expect(n1).not.toBe(n2);
  });

  it('★ blob URL 必须在 import 后立即回收（blob 不许长期存活）', async () => {
    const { deps, revokes, created } = makeDeps();
    const loader = createFzstdLoader(deps);
    await loader.load();
    expect(created).toHaveLength(1);
    expect(revokes).toHaveLength(1);
    expect(revokes[0]).toContain('blob:test');
  });

  it('★ 绝不触碰任何存储 API（sessionStorage 会在 Chromium 落盘且跨 reload 存活）', async () => {
    // 装探测器：任何存储写入都记下来
    const touched: string[] = [];
    const g = globalThis as any;
    const originals = {
      sessionStorage: g.sessionStorage,
      localStorage: g.localStorage,
      indexedDB: g.indexedDB,
      caches: g.caches,
    };
    g.sessionStorage = new Proxy({} as Storage, {
      get: (_t, k) => {
        if (typeof k === 'string' && !['length', 'key', 'getItem', 'removeItem', 'clear'].includes(k)) touched.push(`sessionStorage.${k}`);
        return () => undefined;
      },
      set: (_t, k) => {
        touched.push(`sessionStorage[${String(k)}]`);
        return true;
      },
    });
    try {
      const { deps } = makeDeps();
      const loader = createFzstdLoader(deps);
      await loader.load();
      await loader.load();
      expect(touched.filter((t) => !t.startsWith('sessionStorage.get') && !t.startsWith('sessionStorage.remove') && !t.startsWith('sessionStorage.key'))).toEqual([]);
    } finally {
      Object.assign(g, originals);
    }
  });
});

describe('失败语义：失败后本 document 内永久不可用（不重试）', () => {
  it('★ fetch 失败 ⇒ 抛 FzstdLoadError，且第二次 load 不再发起新请求', async () => {
    const { deps, fetches, setFetchFail } = makeDeps();
    setFetchFail(true);
    const loader = createFzstdLoader(deps);
    await expect(loader.load()).rejects.toBeInstanceOf(FzstdLoadError);
    expect(loader.state()).toBe('unavailable');
    // 第二次：仍然 reject，且**不再 fetch**（"只能拉一次"按字面执行）
    await expect(loader.load()).rejects.toBeInstanceOf(FzstdLoadError);
    expect(fetches).toHaveLength(1);
  });

  it('★ sha 不符 ⇒ 拒绝执行（抛错，import 零调用）—— 字节被投毒不许跑', async () => {
    const { deps, setBadSha } = makeDeps();
    setBadSha(true);
    const loader = createFzstdLoader(deps);
    await expect(loader.load()).rejects.toThrow(/sha256 mismatch/i);
    expect(deps.importModule).not.toHaveBeenCalled();
  });

  it('★ blob import 失败（CSP 拦 blob:）⇒ 抛错，reject 路径也要回收 blob URL', async () => {
    const { deps, revokes, setImportFail } = makeDeps();
    setImportFail(true);
    const loader = createFzstdLoader(deps);
    await expect(loader.load()).rejects.toBeInstanceOf(FzstdLoadError);
    expect(revokes).toHaveLength(1); // finally 里回收
  });

  it('模块没有 decompress ⇒ 抛错（不许把空模块当成功）', async () => {
    const { deps } = makeDeps({ importModule: vi.fn(async () => ({})) });
    const loader = createFzstdLoader(deps);
    await expect(loader.load()).rejects.toThrow(/no decompress/i);
  });

  it('失败后 isUsable() 变 false（供 selectVariant 及时回落到 gzip）', async () => {
    const { deps, setFetchFail } = makeDeps();
    setFetchFail(true);
    const loader = createFzstdLoader(deps);
    expect(loader.isUsable()).toBe(true); // idle：还没试过，不能预先排除 zstd
    await loader.load().catch(() => {});
    expect(loader.isUsable()).toBe(false); // unavailable：别再选 zstd
  });
});

describe('状态机', () => {
  it('idle → loading → ready', async () => {
    const { deps } = makeDeps();
    const loader = createFzstdLoader(deps);
    expect(loader.state()).toBe('idle');
    const p = loader.load();
    expect(loader.state()).toBe('loading');
    await p;
    expect(loader.state()).toBe('ready');
  });

  it('★ _resetForTest 后重新可拉（仅测试用，生产不该调）', async () => {
    const { deps, fetches } = makeDeps();
    const loader = createFzstdLoader(deps);
    await loader.load();
    expect(fetches).toHaveLength(1);
    loader._resetForTest();
    await loader.load();
    expect(fetches).toHaveLength(2);
  });
});