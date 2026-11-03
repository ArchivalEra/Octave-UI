// tests/storage/engineMixedSource.test.ts
// 引擎**混合来源**接线判据（用户 2026-11-03：全家上 catalogue）。
//
// 为什么必须单独测这个接线：
//   三件产物走 release（分片 + 逐块解 + 双校验），两件清单走站点
//   （octave.build.json / assets/manifest.json 不在 release 里）。
//   两种来源必须在**同一个 items[]** 里、destPath 与既有五件套布局**完全一致**，
//   否则一旦接通就会让 OPFS 对账、boot 拦截、evict 全部错位。
//
// 复跑：CI=true npx vitest run tests/storage/engineMixedSource.test.ts

import { describe, it, expect, vi } from 'vitest';
import { DownloadStore } from '../../src/modules/storage/DownloadStore';
import { MemoryStore } from '../../src/modules/storage/MemoryStore';
import { MockFetchAdapter } from '../../src/modules/storage/FetchPort';
import type { EngineReleaseSource } from '../../src/modules/engine/engineReleaseSource';

const LANE = 'wasm32-final';
const BUILD_JSON = {
  measured: {
    files: {
      'octave.wasm': { sha256: 'a'.repeat(64), bytes: 100 },
      'octave.data': { sha256: 'b'.repeat(64), bytes: 50 },
      'octave.js': { sha256: 'c'.repeat(64), bytes: 20 },
    },
  },
};

function mockPortWithSiteFiles(): MockFetchAdapter {
  const p = new MockFetchAdapter();
  // 站点两件清单（真实存在、release 里没有）
  p.setJSON(`https://site.test/lanes/${LANE}/octave.build.json`, BUILD_JSON);
  p.setFile(`https://site.test/assets/manifest.json`, '{"assets":{}}');
  return p;
}

describe('引擎混合来源：3 件走 release、2 件走站点', () => {
  it('★ items 形状：五件齐全、destPath 与既有布局逐字一致', async () => {
    const store = new MemoryStore();
    await store.init();
    const port = mockPortWithSiteFiles();

    // 假引擎 release 源：三件都来自 release
    const engineReleaseSource: EngineReleaseSource = {
      async resolveEngine(lane) {
        expect(lane).toBe(LANE);
        return {
          lane: LANE,
          product: 'wasm32',
          releaseId: 'Octave-Full-Wasm/v0.1.0',
          base: 'https://rel.test/oct/',
          codecs: ['identity'],
          artifacts: [
            {
              filename: 'octave.wasm',
              entry: {
                product: 'wasm32',
                name: 'octave.wasm',
                bytes: 100,
                sha256: 'a'.repeat(64),
                variants: [{ codec: 'identity', chunks: [{ part: 0, file: 'w.id.000', bytes: 100, sha256: 'a'.repeat(64) }] }],
              },
              variant: { codec: 'identity', chunks: [{ part: 0, file: 'w.id.000', bytes: 100, sha256: 'a'.repeat(64) }] },
              fallbacks: [],
            },
            {
              filename: 'octave.data',
              entry: {
                product: 'wasm32',
                name: 'octave.data',
                bytes: 50,
                sha256: 'b'.repeat(64),
                variants: [{ codec: 'identity', chunks: [{ part: 0, file: 'd.id.000', bytes: 50, sha256: 'b'.repeat(64) }] }],
              },
              variant: { codec: 'identity', chunks: [{ part: 0, file: 'd.id.000', bytes: 50, sha256: 'b'.repeat(64) }] },
              fallbacks: [],
            },
            {
              filename: 'octave.js',
              entry: {
                product: 'wasm32',
                name: 'octave.js',
                bytes: 20,
                sha256: 'c'.repeat(64),
                variants: [{ codec: 'identity', chunks: [{ part: 0, file: 'j.id.000', bytes: 20, sha256: 'c'.repeat(64) }] }],
              },
              variant: { codec: 'identity', chunks: [{ part: 0, file: 'j.id.000', bytes: 20, sha256: 'c'.repeat(64) }] },
              fallbacks: [],
            },
          ],
        };
      },
    };

    const dl = new DownloadStore({
      storage: store,
      fetchPort: port,
      baseUrl: 'https://site.test',
      engineReleaseSource,
    });
    await dl.init();

    // 取内部 resolveTarget 的结果（不真下载，只看 items 形状）
    const resolved = await (dl as any).resolveEngineTarget({ kind: 'engine', name: 'octave', arch: `${LANE}/w32` });
    const paths: string[] = resolved.items.map((i: any) => i.destPath);

    // 五件齐全，路径与既有布局逐字一致
    expect(paths).toContain(`downloads/engine/${LANE}/w32/octave.wasm`);
    expect(paths).toContain(`downloads/engine/${LANE}/w32/octave.data`);
    expect(paths).toContain(`downloads/engine/${LANE}/w32/octave.js`);
    expect(paths).toContain(`downloads/engine/${LANE}/w32/octave.build.json`);
    expect(paths).toContain(`downloads/engine/${LANE}/w32/assets-manifest.json`);

    // 三件产物带 release（走分片装配），sha 取 **release entry** 的
    const wasm = resolved.items.find((i: any) => i.filename === 'octave.wasm');
    expect(wasm.release).toBeTruthy();
    expect(wasm.release.base).toBe('https://rel.test/oct/');
    expect(wasm.sha256).toBe('a'.repeat(64));

    // 两件清单**不带** release（走站点直取）
    const buildJson = resolved.items.find((i: any) => i.filename === 'octave.build.json');
    expect(buildJson.release).toBeUndefined();
    expect(buildJson.url).toContain('lanes/');
  });

  it('★ 不注入 engineReleaseSource ⇒ 完全走站点（零行为变化）', async () => {
    const store = new MemoryStore();
    await store.init();
    const dl = new DownloadStore({
      storage: store,
      fetchPort: mockPortWithSiteFiles(),
      baseUrl: 'https://site.test',
      // 不注入
    });
    await dl.init();
    const resolved = await (dl as any).resolveEngineTarget({ kind: 'engine', name: 'octave', arch: `${LANE}/w32` });
    // 每件都不带 release（全部站点）
    expect(resolved.items.every((i: any) => i.release === undefined)).toBe(true);
    expect(resolved.items.length).toBeGreaterThanOrEqual(3);
  });

  it('★ engineReleaseSource 抛异常 ⇒ 响亮报错 + 回落站点（不伪装成降级）', async () => {
    const store = new MemoryStore();
    await store.init();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const dl = new DownloadStore({
      storage: store,
      fetchPort: mockPortWithSiteFiles(),
      baseUrl: 'https://site.test',
      engineReleaseSource: {
        async resolveEngine(): Promise<never> {
          throw new TypeError('boom: programming defect');
        },
      },
    });
    await dl.init();
    const resolved = await (dl as any).resolveEngineTarget({ kind: 'engine', name: 'octave', arch: `${LANE}/w32` });
    // 回落站点
    expect(resolved.items.some((i: any) => i.release !== undefined)).toBe(false);
    // 且缺陷被响亮报出
    expect(errSpy.mock.calls.map((c) => String(c[0])).join(' ')).toContain('code defect');
    errSpy.mockRestore();
  });

  it('★ 原子性：engineReleaseSource 返回 null ⇒ 整组回落站点（不混装半套）', async () => {
    const store = new MemoryStore();
    await store.init();
    const dl = new DownloadStore({
      storage: store,
      fetchPort: mockPortWithSiteFiles(),
      baseUrl: 'https://site.test',
      engineReleaseSource: { async resolveEngine() { return null; } },
    });
    await dl.init();
    const resolved = await (dl as any).resolveEngineTarget({ kind: 'engine', name: 'octave', arch: `${LANE}/w32` });
    expect(resolved.items.every((i: any) => i.release === undefined)).toBe(true);
  });
});
