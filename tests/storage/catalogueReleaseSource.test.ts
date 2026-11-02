// tests/storage/catalogueReleaseSource.test.ts
// `ReleaseSource` 生产实现的判据 —— 这一层是把「分片路径」真正接进产物的那根线。
//
// Standards 审查第 1 条抓到的正是「只声明注入面、无实现方、生产不接线」：
// 那时 `releaseSource` 在 src/ 里只出现在 DownloadStore 自己的类型与字段上。
// 这组测试证明实现存在、行为正确、并且**在解析不出时如实上报原因**（不静默吞）。
//
// 复跑：CI=true npx vitest run tests/storage/catalogueReleaseSource.test.ts

import { describe, it, expect, vi } from 'vitest';
import { createCatalogueReleaseSource } from '../../src/modules/storage/catalogueReleaseSource';
import type { FetchPort } from '../../src/modules/storage/FetchPort';
import type { ForgePackageItem } from '../../src/modules/plugins/package/types';
import type { DownloadRef } from '../../src/modules/storage/downloadTypes';

const CATALOGUE_URL = 'https://site.test/static/catalogue.json';

function manifest(entries: unknown[], codecs = ['zstd', 'gzip', 'identity']): Record<string, unknown> {
  return { schema: 3, id: 'R/x', codecs, entries };
}

function entry(name: string, variants?: unknown[]): Record<string, unknown> {
  return {
    product: 'forge',
    name,
    bytes: 8,
    sha256: 'a'.repeat(64),
    variants: variants ?? [
      {
        codec: 'identity',
        chunks: [{ part: 0, file: `${name}.identity.000`, bytes: 8, sha256: 'a'.repeat(64) }],
      },
    ],
  };
}

/** 造一个 catalogue + 若干 release 的假网络 */
function port(opts: {
  catalogue?: unknown;
  releases?: Record<string, unknown | 'dead'>;
} ): FetchPort {
  return {
    async fetchBytes() {
      return { ok: false, status: 404, data: new Uint8Array(0), sha256: '', totalBytes: null };
    },
    async fetchJSON<T>(url: string): Promise<T> {
      if (url === CATALOGUE_URL) {
        if (opts.catalogue === undefined) throw Object.assign(new Error('404'), { status: 404 });
        return opts.catalogue as T;
      }
      const base = url.replace(/\/manifest\.json$/, '');
      const hit = opts.releases?.[base];
      if (hit === undefined || hit === 'dead') throw Object.assign(new Error('404'), { status: 404 });
      return hit as T;
    },
  };
}

const pkg: ForgePackageItem = {
  name: 'statistics',
  version: '1.7.7',
  form: 'pkg',
  content: ['m'],
};

const ref: DownloadRef = { kind: 'src', name: 'statistics', version: '1.7.7' } as DownloadRef;

describe('createCatalogueReleaseSource：从 catalogue 现读到变体选型', () => {
  it('★ 正常路径：catalogue 有活 release + 该包有 entry ⇒ 返回 entry/variant/base', async () => {
    const p = port({
      catalogue: { schema: 1, releases: [{ id: 'X/r1', base: 'https://rel.test/r1/' }] },
      releases: { 'https://rel.test/r1': manifest([entry('statistics-1.7.7.tar.gz')]) },
    });
    const src = createCatalogueReleaseSource({ catalogueUrl: CATALOGUE_URL, fetchPort: p });
    const r = await src.resolve(pkg, ref);
    expect(r).not.toBeNull();
    expect(r!.entry.name).toBe('statistics-1.7.7.tar.gz');
    expect(r!.variant.codec).toBe('identity');
    expect(r!.base).toBe('https://rel.test/r1/');
  });

  it('★ 按 codecs 链选变体：有 zstd 能力时优先 zstd', async () => {
    const withZstd = entry('statistics-1.7.7.tar.gz', [
      { codec: 'zstd', chunks: [{ part: 0, file: 'z.zstd.000', bytes: 4, sha256: 'a'.repeat(64) }] },
      { codec: 'identity', chunks: [{ part: 0, file: 'z.identity.000', bytes: 8, sha256: 'a'.repeat(64) }] },
    ]);
    const p = port({
      catalogue: { schema: 1, releases: [{ id: 'X/r1', base: 'https://rel.test/r1/' }] },
      releases: { 'https://rel.test/r1': manifest([withZstd]) },
    });
    const src = createCatalogueReleaseSource({ catalogueUrl: CATALOGUE_URL, fetchPort: p, hasZstd: true });
    expect((await src.resolve(pkg, ref))!.variant.codec).toBe('zstd');
  });

  it('★ 无 zstd 能力 ⇒ 落到 identity（多下字节但能跑）', async () => {
    const withZstd = entry('statistics-1.7.7.tar.gz', [
      { codec: 'zstd', chunks: [{ part: 0, file: 'z.zstd.000', bytes: 4, sha256: 'a'.repeat(64) }] },
      { codec: 'identity', chunks: [{ part: 0, file: 'z.identity.000', bytes: 8, sha256: 'a'.repeat(64) }] },
    ]);
    const p = port({
      catalogue: { schema: 1, releases: [{ id: 'X/r1', base: 'https://rel.test/r1/' }] },
      releases: { 'https://rel.test/r1': manifest([withZstd]) },
    });
    const src = createCatalogueReleaseSource({ catalogueUrl: CATALOGUE_URL, fetchPort: p, hasZstd: false });
    expect((await src.resolve(pkg, ref))!.variant.codec).toBe('identity');
  });

  it('★★ 死链容忍（099 §6.5）：第一个 release 的 manifest 404 ⇒ 换下一个', async () => {
    const p = port({
      catalogue: {
        schema: 1,
        releases: [
          { id: 'X/dead', base: 'https://dead.test/x/' },
          { id: 'X/live', base: 'https://rel.test/r1/' },
        ],
      },
      releases: { 'https://dead.test/x': 'dead', 'https://rel.test/r1': manifest([entry('statistics-1.7.7.tar.gz')]) },
    });
    const src = createCatalogueReleaseSource({ catalogueUrl: CATALOGUE_URL, fetchPort: p });
    const r = await src.resolve(pkg, ref);
    expect(r).not.toBeNull();
    expect(r!.base).toBe('https://rel.test/r1/');
  });

  it('★ base 每次从 catalogue 现读（不硬编码 tag）：换 catalogue 后 base 跟着变', async () => {
    // 第一次
    const p1 = port({
      catalogue: { schema: 1, releases: [{ id: 'X/old', base: 'https://rel.test/old/' }] },
      releases: { 'https://rel.test/old': manifest([entry('statistics-1.7.7.tar.gz')]) },
    });
    const s1 = createCatalogueReleaseSource({ catalogueUrl: CATALOGUE_URL, fetchPort: p1, catalogueTtlMs: 0 });
    expect((await s1.resolve(pkg, ref))!.base).toBe('https://rel.test/old/');

    // 上游换 tag 后（新 instance，模拟新会话）
    const p2 = port({
      catalogue: { schema: 1, releases: [{ id: 'X/new', base: 'https://rel.test/new/' }] },
      releases: { 'https://rel.test/new': manifest([entry('statistics-1.7.7.tar.gz')]) },
    });
    const s2 = createCatalogueReleaseSource({ catalogueUrl: CATALOGUE_URL, fetchPort: p2, catalogueTtlMs: 0 });
    expect((await s2.resolve(pkg, ref))!.base).toBe('https://rel.test/new/');
  });
});

describe('解析不出时必须**如实上报原因**（不静默吞）', () => {
  it('★ catalogue 不可达 ⇒ null + onFallback 收到原因', async () => {
    const onFallback = vi.fn();
    const p = port({});
    const src = createCatalogueReleaseSource({ catalogueUrl: CATALOGUE_URL, fetchPort: p, onFallback });
    const r = await src.resolve(pkg, ref);
    expect(r).toBeNull();
    expect(onFallback).toHaveBeenCalledOnce();
    expect(onFallback.mock.calls[0][0].reason).toContain('catalogue unavailable');
  });

  it('★ 全部 release 都死 ⇒ null + 原因里带条目数（调用方知道「N 个条目暂不可用」）', async () => {
    const onFallback = vi.fn();
    const p = port({
      catalogue: {
        schema: 1,
        releases: [
          { id: 'X/a', base: 'https://dead.test/a/' },
          { id: 'X/b', base: 'https://dead.test/b/' },
        ],
      },
      releases: {},
    });
    const src = createCatalogueReleaseSource({ catalogueUrl: CATALOGUE_URL, fetchPort: p, onFallback });
    expect(await src.resolve(pkg, ref)).toBeNull();
    // onDead 给出的诊断比笼统的「no live release」更具体：逐条目 id + 拒绝类别
    const reason = onFallback.mock.calls[0][0].reason;
    expect(reason).toContain('every catalogue entry is dead');
    expect(reason).toContain('X/a');
    expect(reason).toContain('X/b');
  });

  it('★ 活着但该包不在 release 里 ⇒ null + 原因点名 release id', async () => {
    const onFallback = vi.fn();
    const p = port({
      catalogue: { schema: 1, releases: [{ id: 'X/r1', base: 'https://rel.test/r1/' }] },
      releases: { 'https://rel.test/r1': manifest([entry('other-pkg-1.0.0.tar.gz')]) },
    });
    const src = createCatalogueReleaseSource({ catalogueUrl: CATALOGUE_URL, fetchPort: p, onFallback });
    expect(await src.resolve(pkg, ref)).toBeNull();
    expect(onFallback.mock.calls[0][0].reason).toContain('entry not found');
    expect(onFallback.mock.calls[0][0].reason).toContain('X/r1');
  });

  it('★ 本端解不了任何编码 ⇒ null + 原因列出能力集', async () => {
    const onFallback = vi.fn();
    const onlyZstd = entry('statistics-1.7.7.tar.gz', [
      { codec: 'zstd', chunks: [{ part: 0, file: 'z.zstd.000', bytes: 4, sha256: 'a'.repeat(64) }] },
    ]);
    const p = port({
      catalogue: { schema: 1, releases: [{ id: 'X/r1', base: 'https://rel.test/r1/' }] },
      releases: { 'https://rel.test/r1': manifest([onlyZstd], ['zstd']) },
    });
    // hasZstd=false ⇒ 能力集只有 identity，而这个 entry 没有 identity
    const src = createCatalogueReleaseSource({ catalogueUrl: CATALOGUE_URL, fetchPort: p, hasZstd: false, onFallback });
    expect(await src.resolve(pkg, ref)).toBeNull();
    expect(onFallback.mock.calls[0][0].reason).toContain('no decodable variant');
  });
});

describe('catalogue 缓存', () => {
  it('TTL 内复用（不重复拉 catalogue）', async () => {
    const catalogueFetch = vi.fn();
    const base = port({
      catalogue: { schema: 1, releases: [{ id: 'X/r1', base: 'https://rel.test/r1/' }] },
      releases: { 'https://rel.test/r1': manifest([entry('statistics-1.7.7.tar.gz')]) },
    });
    const p: FetchPort = {
      fetchBytes: base.fetchBytes.bind(base),
      async fetchJSON<T>(url: string): Promise<T> {
        if (url === CATALOGUE_URL) catalogueFetch();
        return base.fetchJSON<T>(url);
      },
    };
    const src = createCatalogueReleaseSource({ catalogueUrl: CATALOGUE_URL, fetchPort: p, catalogueTtlMs: 60_000 });
    await src.resolve(pkg, ref);
    await src.resolve(pkg, ref);
    expect(catalogueFetch).toHaveBeenCalledTimes(1);
  });

  it('TTL=0 ⇒ 每次都重读（保证跟上派生态）', async () => {
    const catalogueFetch = vi.fn();
    const base = port({
      catalogue: { schema: 1, releases: [{ id: 'X/r1', base: 'https://rel.test/r1/' }] },
      releases: { 'https://rel.test/r1': manifest([entry('statistics-1.7.7.tar.gz')]) },
    });
    const p: FetchPort = {
      fetchBytes: base.fetchBytes.bind(base),
      async fetchJSON<T>(url: string): Promise<T> {
        if (url === CATALOGUE_URL) catalogueFetch();
        return base.fetchJSON<T>(url);
      },
    };
    const src = createCatalogueReleaseSource({ catalogueUrl: CATALOGUE_URL, fetchPort: p, catalogueTtlMs: 0 });
    await src.resolve(pkg, ref);
    await src.resolve(pkg, ref);
    expect(catalogueFetch).toHaveBeenCalledTimes(2);
  });
});