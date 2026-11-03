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

// 市场契约给的是**产物名 + sha**（url 的 basename 与分发契约 entry.name 同构）
const pkg: ForgePackageItem = {
  name: 'statistics',
  version: '1.7.7',
  form: 'pkg',
  content: ['m'],
  url: 'assets/forge/statistics-1.7.7.tar.gz',
} as ForgePackageItem;

const ref: DownloadRef = { kind: 'src', name: 'statistics', version: '1.7.7' } as DownloadRef;

describe('createCatalogueReleaseSource：从 catalogue 现读到变体选型', () => {
  it('★ 正常路径：catalogue 有活 release + 该包有 entry ⇒ 返回 entry/variant/base', async () => {
    const p = port({
      catalogue: { schema: 1, releases: [{ id: 'X/statistics-1.7.7', base: 'https://rel.test/r1/' }] },
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
      catalogue: { schema: 1, releases: [{ id: 'X/statistics-1.7.7', base: 'https://rel.test/r1/' }] },
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
      catalogue: { schema: 1, releases: [{ id: 'X/statistics-1.7.7', base: 'https://rel.test/r1/' }] },
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
          { id: 'X/statistics-1.7.6', base: 'https://dead.test/x/' },
          { id: 'X/statistics-1.7.7', base: 'https://rel.test/r1/' },
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
      catalogue: { schema: 1, releases: [{ id: 'X/statistics-1.7.7', base: 'https://rel.test/old/' }] },
      releases: { 'https://rel.test/old': manifest([entry('statistics-1.7.7.tar.gz')]) },
    });
    const s1 = createCatalogueReleaseSource({ catalogueUrl: CATALOGUE_URL, fetchPort: p1, catalogueTtlMs: 0 });
    expect((await s1.resolve(pkg, ref))!.base).toBe('https://rel.test/old/');

    // 上游换 tag 后（新 instance，模拟新会话）
    const p2 = port({
      catalogue: { schema: 1, releases: [{ id: 'X/statistics-1.7.8', base: 'https://rel.test/new/' }] },
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
          { id: 'X/statistics-a', base: 'https://dead.test/a/' },
          { id: 'X/statistics-b', base: 'https://dead.test/b/' },
        ],
      },
      releases: {},
    });
    const src = createCatalogueReleaseSource({ catalogueUrl: CATALOGUE_URL, fetchPort: p, onFallback });
    expect(await src.resolve(pkg, ref)).toBeNull();
    // onDead 给出的诊断比笼统的「no live release」更具体：逐条目 id + 拒绝类别
    const reason = onFallback.mock.calls[0][0].reason;
    expect(reason).toContain('no live release carried artifact');
    expect(reason).toContain('statistics-1.7.7.tar.gz');
    expect(reason).toContain('X/statistics-a');
    expect(reason).toContain('X/statistics-b');
  });

  it('★ 活着但该包不在 release 里 ⇒ null + 原因点名 release id', async () => {
    const onFallback = vi.fn();
    const p = port({
      catalogue: { schema: 1, releases: [{ id: 'X/statistics-1.7.7', base: 'https://rel.test/r1/' }] },
      releases: { 'https://rel.test/r1': manifest([entry('other-pkg-1.0.0.tar.gz')]) },
    });
    const src = createCatalogueReleaseSource({ catalogueUrl: CATALOGUE_URL, fetchPort: p, onFallback });
    expect(await src.resolve(pkg, ref)).toBeNull();
    expect(onFallback.mock.calls[0][0].reason).toContain('no release carried artifact');
    expect(onFallback.mock.calls[0][0].reason).toContain('statistics-1.7.7.tar.gz');
  });

  it('★ 本端解不了任何编码 ⇒ null + 原因列出能力集', async () => {
    const onFallback = vi.fn();
    const onlyZstd = entry('statistics-1.7.7.tar.gz', [
      { codec: 'zstd', chunks: [{ part: 0, file: 'z.zstd.000', bytes: 4, sha256: 'a'.repeat(64) }] },
    ]);
    const p = port({
      catalogue: { schema: 1, releases: [{ id: 'X/statistics-1.7.7', base: 'https://rel.test/r1/' }] },
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
      catalogue: { schema: 1, releases: [{ id: 'X/statistics-1.7.7', base: 'https://rel.test/r1/' }] },
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
      catalogue: { schema: 1, releases: [{ id: 'X/statistics-1.7.7', base: 'https://rel.test/r1/' }] },
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
describe('★ NEW-1 反向断言：每个包有自己的 release（真实 catalogue 形状）', () => {
  // 实测线上 catalogue 18 条，每个包一条 release，第一条活的是 LLVM
  const REAL_LIKE = {
    schema: 1,
    releases: [
      { id: 'LLVM-wasm/v0.1.6', base: 'https://rel.test/llvm/' },
      { id: 'Octave-Extra-Content/forge-cgi-0.1.2', base: 'https://rel.test/cgi/' },
      { id: 'Octave-Extra-Content/forge-statistics-1.7.7', base: 'https://rel.test/stat/' },
    ],
  };

  it('★★ statistics 包必须找到 forge-statistics release，不许被第一个 LLVM release 挡住', async () => {
    const p = port({
      catalogue: REAL_LIKE,
      releases: {
        'https://rel.test/llvm': manifest([entry('clang.wasm')]),
        'https://rel.test/cgi': manifest([entry('cgi-0.1.2.tar.gz')]),
        'https://rel.test/stat': manifest([entry('statistics-1.7.7.tar.gz')]),
      },
    });
    const src = createCatalogueReleaseSource({ catalogueUrl: CATALOGUE_URL, fetchPort: p });
    const r = await src.resolve(pkg, ref);
    expect(r).not.toBeNull();
    expect(r!.entry.name).toBe('statistics-1.7.7.tar.gz');
    expect(r!.base).toBe('https://rel.test/stat/');
  });

  it('★ 候选 release 的 manifest 死 ⇒ 不因为别的 release 活着就假装成功', async () => {
    const p = port({
      catalogue: REAL_LIKE,
      releases: {
        'https://rel.test/llvm': manifest([entry('clang.wasm')]), // 活，但不是这个包
        'https://rel.test/cgi': manifest([entry('cgi-0.1.2.tar.gz')]), // 活，不是这个包
        'https://rel.test/stat': 'dead', // 这个包的 release 死了
      },
    });
    const src = createCatalogueReleaseSource({ catalogueUrl: CATALOGUE_URL, fetchPort: p });
    const r = await src.resolve(pkg, ref);
    expect(r).toBeNull(); // 必须回落，不许拿 LLVM 的 release 凑数
  });

  it('★ 产物名匹配（wantedArtifactOf / entryMatchesWanted）：按市场契约的 url basename', async () => {
    const { wantedArtifactOf, entryMatchesWanted, artifactNameOf } = await import(
      '../../src/modules/storage/catalogueReleaseSource'
    );
    // 产物名来自 url 的 basename —— 不是包名
    expect(artifactNameOf('assets/forge/statistics-1.7.7.tar.gz')).toBe('statistics-1.7.7.tar.gz');
    expect(artifactNameOf('omc/OpenModelicaCompiler_bg.wasm?v=1')).toBe('OpenModelicaCompiler_bg.wasm');

    // 市场契约 → 想要哪个产物
    const statPkg = {
      name: 'statistics',
      version: '1.7.7',
      form: 'pkg' as const,
      content: ['m' as const],
      url: 'assets/forge/statistics-1.7.7.tar.gz',
      sha256: 'c'.repeat(64),
      size: 100,
    };
    const wanted = wantedArtifactOf(statPkg)!;
    expect(wanted.name).toBe('statistics-1.7.7.tar.gz');
    expect(wanted.sha256).toBe('c'.repeat(64));

    // 名字 + sha 双确认：名字对、sha 不对 ⇒ 不匹配（同名不同字节是真实风险）
    const mk = (name: string, sha: string) => ({ product: 'p', name, bytes: 1, sha256: sha, variants: [] });
    expect(entryMatchesWanted(mk('statistics-1.7.7.tar.gz', 'c'.repeat(64)), wanted)).toBe(true);
    expect(entryMatchesWanted(mk('statistics-1.7.7.tar.gz', 'd'.repeat(64)), wanted)).toBe(false);
    // 名字不对 ⇒ 不匹配（哪怕 sha 一致）
    expect(entryMatchesWanted(mk('cgi-0.1.2.tar.gz', 'c'.repeat(64)), wanted)).toBe(false);

    // 市场契约没有 sha ⇒ 只按名字
    const noSha = wantedArtifactOf({ ...statPkg, sha256: undefined } as any)!;
    expect(noSha.sha256).toBeUndefined();
    expect(entryMatchesWanted(mk('statistics-1.7.7.tar.gz', 'e'.repeat(64)), noSha)).toBe(true);

    // 没有 url ⇒ null（不许猜）
    expect(wantedArtifactOf({ name: 'x', version: '1', form: 'pkg', content: [] } as any)).toBeNull();
  });

  it('★ pyodide 形态：url 指向包内文件、release 发的是压缩包 ⇒ 匹配不上（如实回落，不猜）', async () => {
    const { wantedArtifactOf } = await import('../../src/modules/storage/catalogueReleaseSource');
    // 真实形态（实测）：url = assets/pyodide/pyodide/pyodide.asm.wasm (form=tree)
    const wanted = wantedArtifactOf({
      name: 'pyodide',
      version: '314.0.7',
      form: 'tree',
      content: [],
      url: 'assets/pyodide/pyodide/pyodide.asm.wasm',
      size: 22013349,
    } as any)!;
    // 产物名是包内文件，而 release 里是 pyodide-core-314.0.7.tar.bz2 —— 不同身份
    expect(wanted.name).toBe('pyodide.asm.wasm');
    // 这正是缺口：它永远匹配不上，必须回落（等内容仓裁 A/B/C）
  });

  it('★ 失败不缓存（NEW-3）：一次抖动不许封死半小时', async () => {
    let calls = 0;
    let fail = true;
    const base = port({
      catalogue: REAL_LIKE,
      releases: { 'https://rel.test/stat': manifest([entry('statistics-1.7.7.tar.gz')]) },
    });
    const p: FetchPort = {
      fetchBytes: base.fetchBytes.bind(base),
      async fetchJSON<T>(url: string): Promise<T> {
        if (url === CATALOGUE_URL) {
          calls++;
          if (fail) throw Object.assign(new Error('transient'), { status: 503 });
        }
        return base.fetchJSON<T>(url);
      },
    };
    const src = createCatalogueReleaseSource({ catalogueUrl: CATALOGUE_URL, fetchPort: p, catalogueTtlMs: 60_000 });
    expect(await src.resolve(pkg, ref)).toBeNull();
    fail = false; // 网络恢复
    // 失败没被缓存 ⇒ 立刻能成功（若缓存了 30 分钟这里会拿到 null）
    expect(await src.resolve(pkg, ref)).not.toBeNull();
    expect(calls).toBe(2);
  });
});
