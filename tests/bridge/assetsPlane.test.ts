// tests/bridge/assetsPlane.test.ts
// 统一站点资产接缝 spec §2.3：逻辑键注册表是唯一拼接点，调用方不传 siteLevel。
// 这是**行为用例**（跨接口），替代 siteLevelAssets.test.ts 的正则读源码锁
// （DEEPENING「replace, don't layer」）。
//
// 复跑：CI=true npx vitest run tests/bridge/assetsPlane.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';

const SRC = readFileSync(
  fileURLToPath(new NodeURL('../../public/bridge/assets-loader.js', import.meta.url)),
  'utf-8',
);

/** 在受控 global 上 eval bridge，拿回 createOctaveAssets 与请求记录 */
function bootBridge(opts: {
  siteBase?: string;
  laneBase?: string;
  fetchImpl?: (url: string) => Promise<{
    ok: boolean;
    status: number;
    json?: () => Promise<any>;
    arrayBuffer?: () => Promise<ArrayBuffer>;
  }>;
}) {
  const requests: string[] = [];
  const g: any = {
    document: globalThis.document,
    __octaveWorker: false,
    __octaveReady: false,
    console,
    fetch: async (url: string) => {
      requests.push(url);
      const r = opts.fetchImpl
        ? await opts.fetchImpl(url)
        : { ok: true, status: 200, json: async () => ({ packs: [] }), arrayBuffer: async () => new ArrayBuffer(0) };
      return {
        ok: r.ok,
        status: r.status,
        json: r.json ?? (async () => ({})),
        arrayBuffer: r.arrayBuffer ?? (async () => new ArrayBuffer(0)),
      };
    },
  };
  // IIFE 用 `typeof window !== 'undefined' ? window : globalThis`；给 eval 一个独立 global。
  // 把 fetch 也作为形参传入，使 bridge 内部裸 `fetch(...)` 落到我们的记录桩上。
  const fn = new Function('globalThis', 'window', 'fetch', SRC + '\nreturn globalThis;');
  const result = fn(g, g, g.fetch);
  return { g: result, requests, create: result.createOctaveAssets };
}

const ok = (body: any = { packs: [] }) => async () => ({
  ok: true,
  status: 200,
  json: async () => body,
  arrayBuffer: async () => new ArrayBuffer(0),
});

describe('AssetsPlane 逻辑键注册表（唯一拼接点）', () => {
  it('★ catalog() 走站点根，不碰 lane 前缀', async () => {
    const { g, requests, create } = bootBridge({
      siteBase: '/repo/Octave/',
      laneBase: '/repo/Octave/lanes/wasm32-final/',
      fetchImpl: ok({ packs: [{ name: 'cgi' }] }),
    });
    const api = create(null, '/repo/Octave/lanes/wasm32-final/', () => false, {
      siteBase: '/repo/Octave/',
    });
    const cat = await api.catalog();
    expect(cat.packs.length).toBe(1);
    expect(requests).toEqual(['/repo/Octave/assets/forge-catalog.json']);
    expect(requests.every((u) => !/lanes\/[^/]+\/assets\//.test(u))).toBe(true);
    void g;
  });

  it('★ 同类肯定：init(engine-manifest) 从 lane 目录取清单 200', async () => {
    const { requests, create } = bootBridge({ fetchImpl: ok({ assets: [] }) });
    const api = create(null, '/repo/Octave/lanes/wasm32-final/', () => false, {
      siteBase: '/repo/Octave/',
    });
    await api.init('assets/manifest.json');
    expect(requests).toEqual(['/repo/Octave/lanes/wasm32-final/assets/manifest.json']);
    expect(requests.every((u) => !/^\/repo\/Octave\/assets\/manifest/.test(u))).toBe(true);
  });

  it('★ 反向：catalog 404 ⇒ CATALOG_UNREADABLE（不合成目录）', async () => {
    const { requests, create } = bootBridge({
      fetchImpl: async (u) =>
        /forge-catalog/.test(u)
          ? { ok: false, status: 404, json: async () => ({}) }
          : { ok: true, status: 200, json: async () => ({ assets: [] }), arrayBuffer: async () => new ArrayBuffer(0) },
    });
    const api = create(null, '/repo/Octave/lanes/wasm32-final/', () => false, {
      siteBase: '/repo/Octave/',
    });
    await expect(api.catalog()).rejects.toMatchObject({ code: 'CATALOG_UNREADABLE' });
    expect(requests[0]).toBe('/repo/Octave/assets/forge-catalog.json');
  });

  it('★ 反向：未注册逻辑键 ⇒ UNCLASSIFIED_ASSET（不猜 tier）', async () => {
    const { create } = bootBridge({ fetchImpl: ok() });
    const api = create(null, '/repo/Octave/lanes/wasm32-final/', () => false, {
      siteBase: '/repo/Octave/',
    });
    let caught: any = null;
    try { api.resolve('totally-unknown-key'); } catch (e) { caught = e; }
    expect(caught?.code).toBe('UNCLASSIFIED_ASSET');
  });

  it('★ 空输入：siteBase 缺失 ⇒ DEPLOYMENT_UNRESOLVED（不静默 /）', async () => {
    const { create } = bootBridge({ fetchImpl: ok() });
    let caught: any = null;
    try { create(null, '/repo/Octave/lanes/wasm32-final/', () => false); } catch (e) { caught = e; }
    expect(caught?.code).toBe('DEPLOYMENT_UNRESOLVED');
  });
});
