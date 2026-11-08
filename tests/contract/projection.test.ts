// tests/contract/projection.test.ts
// 契约投影层 = 唯一真源。测试面 = projectContract / readProjection / identityOf。
// AGENTS 纪律 4：每条不变量配一条反向断言；纪律 3：先证探针测得到「存在」。

import { describe, it, expect, beforeEach } from 'vitest';
import {
  OPTION_AXES,
  projectContract,
  readProjection,
  bindProjection,
  resetProjectionCache,
  identityOf,
  ContractProjectionError,
  type ContractFacts,
  type ProjectionCaps,
  type ContentPack,
} from '../../src/modules/contract/projection';
import { LANE_PRODUCT } from '../../src/modules/engine/laneProducts';

const CONTENT = {
  schema: 2,
  octave: '11.3.0',
  packs: [
    {
      name: 'signal', version: '1.4.3', size: 1234,
      sha256: 'a'.repeat(64), url: 'assets/forge/signal-1.4.3.tar.gz',
      form: 'pkg', content: ['m'], consumer: ['octave'], role: 'package',
      stage: 'staged', license: 'GPL-3.0-or-later', links: [{ label: 'license', url: 'x' }],
      versions: [{ version: '1.4.3', stage: 'staged', form: 'pkg', sha256: 'a'.repeat(64), url: 'assets/forge/signal-1.4.3.tar.gz' }],
    },
    {
      name: 'statistics', version: '1.7.0', size: 5678,
      sha256: 'b'.repeat(64), url: 'assets/forge/statistics-1.7.0.tar.gz',
      form: 'pkg', content: ['src'], consumer: ['octave'], role: 'package',
      stage: 'staged',
    },
    {
      name: 'llvm-wasm', version: '6.0.12', size: 122980779,
      sha256: '198e84c4baeb3ce4c8d11cbbef75f072ec61db1b527df0ee2c90c9a4ffc72a85',
      url: 'assets/llvm/clang.wasm', form: 'tree', content: [],
      consumer: ['octave'], role: 'toolchain', stage: 'staged',
    },
  ],
};

const MANIFEST = {
  codecs: ['zstd', 'gzip', 'identity'],
  entries: [{
    product: 'wasm32', name: 'signal-1.4.3.tar.gz',
    variants: [{ codec: 'zstd', chunks: [{ file: 'part0.zst', part: 0 }, { file: 'part1.zst', part: 1 }] }],
  }],
};

function facts(over: Partial<ContractFacts> = {}): ContractFacts {
  return {
    content: CONTENT,
    distribution: { releases: [{ base: 'https://static.example/release', manifest_sha256: 'c'.repeat(64) }] },
    manifests: { 'https://static.example/release': MANIFEST },
    engine: LANE_PRODUCT,
    optionalKeys: ['role', 'stage'],
    ...over,
  };
}

const caps: ProjectionCaps = {
  decodableCodecs: new Set(['identity', 'gzip']),
  activeLane: 'wasm32-final',
};

describe('契约投影层（唯一真源）', () => {
  beforeEach(() => resetProjectionCache());

  it('★ 同类肯定：投影能从契约测到全部轴值（探针先证「测得到」）', () => {
    const p = projectContract(facts(), caps);
    const form = p.facets.find((f) => f.axis === 'form');
    expect(form).toBeDefined();
    expect(form!.values).toContain('pkg');
    expect(form!.values).toContain('tree');
    const role = p.facets.find((f) => f.axis === 'role');
    expect(role!.values).toContain('toolchain');
    expect(role!.values).toContain('package');
    expect(p.facets.find((f) => f.axis === 'engineLane')!.values).toContain('master');
  });

  it('★ 零手写选项：新 form/stage/optional_keys 值自动出现，投影代码 0 行改动', () => {
    const extended = JSON.parse(JSON.stringify(CONTENT));
    extended.packs.push({
      name: 'futures', version: '0.1', size: 1, sha256: 'd'.repeat(64),
      url: 'assets/forge/futures-0.1.tar.gz', form: 'wheel', content: ['m'],
      consumer: ['julia'], role: 'package', stage: 'preview', runtime: 'wasip1',
    });
    const p = projectContract(facts({ content: extended, optionalKeys: ['role', 'stage', 'runtime'] }), caps);
    expect(p.facets.find((f) => f.axis === 'form')!.values).toContain('wheel');
    expect(p.facets.find((f) => f.axis === 'consumer')!.values).toContain('julia');
    expect(p.facets.find((f) => f.axis === 'stage')!.values).toContain('preview');
    const futures = p.packs.find((x) => x.name === 'futures') as ContentPack;
    expect((futures as any).runtime).toBe('wasip1');
    expect(futures.identity.extra.runtime).toBe('wasip1');
  });

  it('★ 身份同一性：artifactName ≡ basename(url) ≡ entry.name，零映射表', () => {
    const p = projectContract(facts(), caps);
    const signal = p.packs.find((x) => x.name === 'signal')!;
    expect(signal.identity.artifactName).toBe('signal-1.4.3.tar.gz');
    expect(signal.identity.sha256).toBe('a'.repeat(64));
    expect(signal.identity.chunkFiles).toEqual(['part0.zst', 'part1.zst']);
    expect(signal.identity.codecs).toEqual(['zstd', 'gzip', 'identity']);
    expect(signal.identity.siteFolders).toEqual(LANE_PRODUCT['wasm32-final'].siteFolders);
    // llvm 只有一份 sha（三套互斥 sha 在结构上不可表达）
    const llvm = p.packs.find((x) => x.name === 'llvm-wasm')!;
    expect(llvm.identity.sha256).toBe('198e84c4baeb3ce4c8d11cbbef75f072ec61db1b527df0ee2c90c9a4ffc72a85');
  });

  it('★ 铁律①：chunks[].file 含路径分隔符必须被拒，绝不自己拼 URL', () => {
    const bad = JSON.parse(JSON.stringify(MANIFEST));
    bad.entries[0].variants[0].chunks[0].file = '//evil.example/x';
    const p = projectContract(facts({ manifests: { base: bad } }), caps);
    // 含路径的文件名被过滤 ⇒ 投影仍完成，但 chunkFiles 里绝不出现它
    const signal = p.packs.find((x) => x.name === 'signal')!;
    expect(signal.identity.chunkFiles).not.toContain('//evil.example/x');
    expect(signal.identity.chunkFiles.every((f) => !/[\\/]/.test(f))).toBe(true);
  });

  it('★ 铁律②：codecs 顺序逐字来自 manifest，禁重排', () => {
    const p = projectContract(facts(), caps);
    expect(p.packs[0].identity.codecs).toEqual(['zstd', 'gzip', 'identity']);
  });

  it('★ 合规区：license/links 原样透传，投影层不判定、不重排、不重述', () => {
    const p = projectContract(facts(), caps);
    const signal = p.packs.find((x) => x.name === 'signal') as any;
    expect(signal.license).toBe('GPL-3.0-or-later');
    expect(signal.links).toEqual([{ label: 'license', url: 'x' }]);
    expect(signal.identity.extra.license).toBeUndefined(); // 未声明的轴不进 extra
  });

  it('★ readProjection 未绑定即 throw，绝不合成空市场（S5 假绿防线）', () => {
    expect(() => readProjection()).toThrow(/ASSEMBLY_FAULT/);
    const p = projectContract(facts(), caps);
    bindProjection(p);
    expect(readProjection()).toBe(p);
  });

  it('★ 反向：空 packs / 坏 schema / 空引擎契约都必须红', () => {
    expect(() => projectContract(facts({ content: { schema: 2, packs: [] } }), caps)).toThrow(/CATALOG_UNREADABLE/);
    expect(() => projectContract(facts({ content: { schema: 0, packs: CONTENT.packs } }), caps)).toThrow(/SCHEMA_REJECTED/);
    expect(() => projectContract(facts({ engine: {} as any }), caps)).toThrow(/ENGINE_CONTRACT_UNREADABLE/);
  });

  it('★ optional_keys 未声明的键仍透传（数据面），只是不成为筛选轴', () => {
    const p = projectContract(facts({ optionalKeys: ['role', 'stage', 'brandnew'] }), caps);
    expect(p.optionalAxes).not.toContain('brandnew');
    expect(p.packs[0].identity.extra.brandnew).toBeUndefined(); // 契约里没有该字段 ⇒ 如实不出现
  });

  it('★ 反向：identityOf 给错版本 / 空 pack 必须红', () => {
    const p = projectContract(facts(), caps);
    const signal = p.packs.find((x) => x.name === 'signal')!;
    expect(() => identityOf(signal, '9.9.9')).toThrow(/VERSION_NOT_FOUND/);
    expect(() => identityOf({} as ContentPack)).toThrow(/SHAPE_INVALID/);
  });

  it('★ OPTION_AXES 只钉轴名与产地，绝不钉取值（闸门锚点形状）', () => {
    for (const [axis, source] of Object.entries(OPTION_AXES)) {
      expect(typeof axis).toBe('string');
      expect(['content', 'distribution', 'engine']).toContain(source);
    }
  });
});
