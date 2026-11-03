// tests/engine/engineReleaseSource.test.ts
// 引擎侧发布契约缝（用户 2026-11-03：「引擎契约另立缝我支持」）。
//
// 这条缝与内容侧的 `ReleaseSource` 关键差别：**多件原子**。
// 一个 product 的三件（Octave）或两件（OMC）必须**一起成功或一起失败**——
// 混装不同构建/不同 release 会让「用户到底拿到了什么」不可观测。
//
// 复跑：CI=true npx vitest run tests/engine/engineReleaseSource.test.ts

import { describe, it, expect, vi } from 'vitest';
import {
  collectProductArtifacts,
  createCatalogueEngineReleaseSource,
} from '../../src/modules/engine/engineReleaseSource';
import { LANE_PRODUCT, artifactsOfLane, OCTAVE_ARTIFACTS, OMC_ARTIFACTS } from '../../src/modules/engine/laneProducts';
import type { FetchPort } from '../../src/modules/storage/FetchPort';
import type { ReleaseEntry } from '../../src/modules/storage/releaseContract';

const CATALOGUE_URL = 'https://site.test/static/catalogue.json';

/**
 * 造一个 entry。`seed` 可以是任意短串——自动补齐成 64hex
 * （`parseManifest` 对 sha 形状是硬判据，短串会让整份 manifest 被拒，
 *  那时失败的是「fixture 不合契约」，不是被测逻辑）。
 */
function norm64(seed: string): string {
  const c = seed.split('').filter((ch) => /[0-9a-f]/.test(ch)).join('') || 'a';
  return (c + c.repeat(64)).slice(0, 64);
}

function entry(product: string, name: string, seed: string): ReleaseEntry {
  const sha = norm64(seed);
  return {
    product,
    name,
    bytes: 8,
    sha256: sha,
    variants: [
      { codec: 'identity', chunks: [{ part: 0, file: `${name}.id.000`, bytes: 8, sha256: sha }] },
    ],
  };
}

function manifest(entries: ReleaseEntry[], codecs = ['zstd', 'gzip', 'identity']): Record<string, unknown> {
  return { schema: 3, id: 'R/x', codecs, entries };
}

function port(opts: {
  catalogue?: unknown;
  releases?: Record<string, unknown | 'dead'>;
}): FetchPort {
  return {
    async fetchBytes() {
      return { ok: false, status: 404, data: new Uint8Array(0), sha256: '', totalBytes: null };
    },
    async fetchJSON<T>(url: string): Promise<T> {
      if (url === CATALOGUE_URL) {
        if (opts.catalogue === undefined) throw Object.assign(new Error('404'), { status: 404 });
        return opts.catalogue as T;
      }
      // base 去掉尾斜杠再查表：fetchReleaseManifest 会把 base 拼成 base + '/manifest.json'
      const base = url.replace(/\/?manifest\.json$/, '');
      const hit = opts.releases?.[base];
      if (hit === undefined || hit === 'dead') throw Object.assign(new Error('404'), { status: 404 });
      return hit as T;
    },
  };
}

describe('laneProducts：引擎契约的单一产地', () => {
  it('★ 三车道 ↔ 三 product 映射（上游 README 明写）', () => {
    expect(LANE_PRODUCT['wasm32-final'].product).toBe('wasm32');
    expect(LANE_PRODUCT['wasm32-final'].variant).toBe('w32');
    expect(LANE_PRODUCT.master.product).toBe('wasm64std');
    expect(LANE_PRODUCT.master.variant).toBe('w64');
    expect(LANE_PRODUCT.IllegalPerformance.product).toBe('wasm64ip');
    expect(LANE_PRODUCT.IllegalPerformance.variant).toBe('w64');
    expect(LANE_PRODUCT.omc.product).toBe('omc');
  });

  it('★ w64 车道的站点候选目录必须**先子目录**（根目录那份是 wasm32 的镜像复制）', () => {
    // 这是 2026-11-03 修的真缺陷：master/w64/octave.wasm = 30,984,954 才是真 w64，
    // 而 master/octave.wasm = 29,632,229 是 wasm32 的复制。
    const folders = LANE_PRODUCT.master.siteFolders;
    expect(folders[0]).toContain('/w64');
    expect(folders.indexOf('lanes/master')).toBeGreaterThan(0);
    expect(LANE_PRODUCT.IllegalPerformance.siteFolders[0]).toContain('/w64');
  });

  it('★ OMC 只要两件，明确排除 .d.ts（浏览器不用，下载是白付字节）', () => {
    expect(artifactsOfLane('omc')).toEqual(OMC_ARTIFACTS);
    expect(OMC_ARTIFACTS).toHaveLength(2);
    expect(OMC_ARTIFACTS).not.toContain('OpenModelicaCompiler.d.ts');
    expect(OMC_ARTIFACTS).not.toContain('OpenModelicaCompiler_bg.wasm.d.ts');
    expect(artifactsOfLane('master')).toEqual(OCTAVE_ARTIFACTS);
  });
});

describe('collectProductArtifacts：按 (product, name) 切片', () => {
  it('★ 同名不同 product（octave.wasm ×3）必须按 product 切，不许拿错构建', () => {
    const entries = [
      entry('wasm32', 'octave.wasm', 'a'.repeat(64)),
      entry('wasm64std', 'octave.wasm', 'b'.repeat(64)),
      entry('wasm64ip', 'octave.wasm', 'c'.repeat(64)),
      entry('wasm32', 'octave.data', 'd'.repeat(64)),
      entry('wasm32', 'octave.js', 'e'.repeat(64)),
    ];
    const got = collectProductArtifacts(entries, 'wasm32', OCTAVE_ARTIFACTS);
    expect(got).not.toBeNull();
    expect(got!.get('octave.wasm')!.sha256).toBe('a'.repeat(64)); // wasm32 那份
    expect(got!.size).toBe(3);
  });

  it('★ 缺任一件 ⇒ null（整组失败，不返回半套）', () => {
    const entries = [
      entry('wasm32', 'octave.wasm', 'a'.repeat(64)),
      entry('wasm32', 'octave.js', 'e'.repeat(64)),
      // 缺 octave.data
    ];
    expect(collectProductArtifacts(entries, 'wasm32', OCTAVE_ARTIFACTS)).toBeNull();
  });

  it('OMC 的 .d.ts 即使在场也不计入（只要两件）', () => {
    const entries = [
      entry('omc', 'OpenModelicaCompiler_bg.wasm', 'a'.repeat(64)),
      entry('omc', 'OpenModelicaCompiler.js', 'b'.repeat(64)),
      entry('omc', 'OpenModelicaCompiler.d.ts', 'c'.repeat(64)),
      entry('omc', 'OpenModelicaCompiler_bg.wasm.d.ts', 'd'.repeat(64)),
    ];
    const got = collectProductArtifacts(entries, 'omc', OMC_ARTIFACTS);
    expect(got).not.toBeNull();
    expect(got!.size).toBe(2);
  });
});

describe('resolveEngine：整组解析', () => {
  const octaveEntries = (seed: string) => [
    entry('wasm32', 'octave.wasm', seed),
    entry('wasm32', 'octave.data', seed === 'a' ? 'd'.repeat(64) : 'g'.repeat(64)),
    entry('wasm32', 'octave.js', seed === 'a' ? 'e'.repeat(64) : 'h'.repeat(64)),
    entry('wasm64std', 'octave.wasm', 'f'.repeat(64)),
    entry('wasm64std', 'octave.data', 'i'.repeat(64)),
    entry('wasm64std', 'octave.js', 'j'.repeat(64)),
  ];

  it('★ 正常：wasm32-final ⇒ 拿到 wasm32 product 的三件', async () => {
    const p = port({
      catalogue: { schema: 1, releases: [{ id: 'Octave-Full-Wasm/v0.1.0', base: 'https://rel.test/oct/' }] },
      releases: { 'https://rel.test/oct': manifest(octaveEntries('a')) },
    });
    const src = createCatalogueEngineReleaseSource({ catalogueUrl: CATALOGUE_URL, fetchPort: p });
    const r = await src.resolveEngine('wasm32-final');
    expect(r).not.toBeNull();
    expect(r!.product).toBe('wasm32');
    expect(r!.artifacts.map((a) => a.filename)).toEqual(['octave.wasm', 'octave.data', 'octave.js']);
    // 必须是 wasm32 那份的 sha，不是 wasm64std
    expect(r!.artifacts[0].entry.sha256).toBe('a'.repeat(64));
  });

  it('★ master ⇒ 拿到 wasm64std 的三件（不是同名 wasm32 的）', async () => {
    const p = port({
      catalogue: { schema: 1, releases: [{ id: 'Octave-Full-Wasm/v0.1.0', base: 'https://rel.test/oct/' }] },
      releases: { 'https://rel.test/oct': manifest(octaveEntries('a')) },
    });
    const src = createCatalogueEngineReleaseSource({ catalogueUrl: CATALOGUE_URL, fetchPort: p });
    const r = await src.resolveEngine('master');
    expect(r!.product).toBe('wasm64std');
    expect(r!.artifacts[0].entry.sha256).toBe('f'.repeat(64)); // wasm64std 那份
  });

  it('★ OMC ⇒ 两件，不含 .d.ts', async () => {
    const p = port({
      catalogue: { schema: 1, releases: [{ id: 'OpenModelica-Full-Wasm/v0.2.0-wasm32', base: 'https://rel.test/omc/' }] },
      releases: {
        'https://rel.test/omc': manifest([
          entry('omc', 'OpenModelicaCompiler_bg.wasm', 'a'.repeat(64)),
          entry('omc', 'OpenModelicaCompiler.js', 'b'.repeat(64)),
          entry('omc', 'OpenModelicaCompiler.d.ts', 'c'.repeat(64)),
        ]),
      },
    });
    const src = createCatalogueEngineReleaseSource({ catalogueUrl: CATALOGUE_URL, fetchPort: p });
    const r = await src.resolveEngine('omc');
    expect(r!.artifacts).toHaveLength(2);
    expect(r!.artifacts.map((a) => a.filename)).toEqual([
      'OpenModelicaCompiler_bg.wasm',
      'OpenModelicaCompiler.js',
    ]);
  });

  it('★ 原子性：某一条 release 缺一件 ⇒ 换下一条，不混装', async () => {
    const incomplete = manifest([
      entry('wasm32', 'octave.wasm', 'x'.repeat(64)),
      entry('wasm32', 'octave.js', 'y'.repeat(64)),
      // 缺 octave.data
    ]);
    const complete = manifest(octaveEntries('a'));
    const p = port({
      catalogue: {
        schema: 1,
        releases: [
          { id: 'Octave-Full-Wasm/broken', base: 'https://rel.test/bad/' },
          { id: 'Octave-Full-Wasm/v0.1.0', base: 'https://rel.test/oct/' },
        ],
      },
      releases: { 'https://rel.test/bad': incomplete, 'https://rel.test/oct': complete },
    });
    const src = createCatalogueEngineReleaseSource({ catalogueUrl: CATALOGUE_URL, fetchPort: p });
    const r = await src.resolveEngine('wasm32-final');
    // 必须整组来自 complete 那条，不许从 broken 拿 2 件 + complete 拿 1 件
    expect(r!.base).toBe('https://rel.test/oct/');
    expect(r!.artifacts[0].entry.sha256).toBe('a'.repeat(64));
  });

  it('★ 全死 / 无该 product ⇒ null + 原因可观察', async () => {
    const onFallback = vi.fn();
    const p = port({
      catalogue: { schema: 1, releases: [{ id: 'X/other', base: 'https://rel.test/o/' }] },
      releases: { 'https://rel.test/o': manifest([entry('other', 'x.wasm', 'a'.repeat(64))]) },
    });
    const src = createCatalogueEngineReleaseSource({ catalogueUrl: CATALOGUE_URL, fetchPort: p, onFallback });
    expect(await src.resolveEngine('master')).toBeNull();
    expect(onFallback.mock.calls[0][0].lane).toBe('master');
    expect(onFallback.mock.calls[0][0].reason).toContain('wasm64std');
  });

  it('★ variant 与契约档不符 ⇒ 明说，不猜', async () => {
    const onFallback = vi.fn();
    const src = createCatalogueEngineReleaseSource({
      catalogueUrl: CATALOGUE_URL,
      fetchPort: port({}),
      onFallback,
    });
    // master 是 w64，显式要 w32 ⇒ 必须是明确拒绝，不是静默换成 w64
    expect(await src.resolveEngine('master', 'w32')).toBeNull();
    expect(onFallback.mock.calls[0][0].reason).toContain('is variant "w64"');
  });

  it('★ catalogue 不可达 ⇒ null + 原因', async () => {
    const onFallback = vi.fn();
    const src = createCatalogueEngineReleaseSource({ catalogueUrl: CATALOGUE_URL, fetchPort: port({}), onFallback });
    expect(await src.resolveEngine('wasm32-final')).toBeNull();
    expect(onFallback.mock.calls[0][0].reason).toContain('catalogue unavailable');
  });

  it('★ 无本端可解变体 ⇒ 整组换/失败（不混装不同编码来源）', async () => {
    // 只有 zstd 变体，而 hasZstd=false ⇒ 无可解
    const onlyZstd: ReleaseEntry = {
      product: 'omc',
      name: 'OpenModelicaCompiler_bg.wasm',
      bytes: 8,
      sha256: 'a'.repeat(64),
      variants: [{ codec: 'zstd', chunks: [{ part: 0, file: 'z', bytes: 4, sha256: 'a'.repeat(64) }] }],
    };
    const onlyZstd2: ReleaseEntry = { ...onlyZstd, name: 'OpenModelicaCompiler.js', sha256: 'b'.repeat(64) };
    const p = port({
      catalogue: { schema: 1, releases: [{ id: 'OM/v', base: 'https://rel.test/omc/' }] },
      releases: { 'https://rel.test/omc': manifest([onlyZstd, onlyZstd2], ['zstd']) },
    });
    const src = createCatalogueEngineReleaseSource({
      catalogueUrl: CATALOGUE_URL,
      fetchPort: p,
      hasZstd: false,
    });
    expect(await src.resolveEngine('omc')).toBeNull();
  });
});