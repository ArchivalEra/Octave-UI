// tests/storage/releaseContract.test.ts
// 发布契约消费侧的纯函数判据（Static-Contract v4 V1–V10 + v1.1 V11）。
//
// 为什么这些测试重要：契约字段会演进（v1.1 加了 license、v3 加了 chunks），
// 而我们是消费端——**「我们对契约的理解」就是这组断言**。逐条喂坏形状，
// 证明的是「契约里写死的铁律我们真的在拦」，不是「代码能跑」。
//
// 复跑：CI=true npx vitest run tests/storage/releaseContract.test.ts

import { describe, it, expect } from 'vitest';
import {
  parseManifest,
  selectVariant,
  ACCEPTED_SCHEMAS,
  type ReleaseEntry,
  type ReleaseCodec,
} from '../../src/modules/storage/releaseContract';

/** 造一份形状合法的最小 manifest（每个用例只改它要考的那一处） */
function baseManifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema: 3,
    id: 'Test/release-1',
    chunkSize: 5242880,
    codecs: ['zstd', 'gzip', 'identity'],
    products: ['demo'],
    license: { id: 'MIT', url: 'https://example.test/LICENSE' },
    entries: [
      {
        product: 'demo',
        name: 'demo.wasm',
        bytes: 1024,
        sha256: 'a'.repeat(64),
        variants: [
          {
            codec: 'identity',
            chunks: [{ part: 0, file: 'demo__demo.wasm.identity.000', bytes: 1024, sha256: 'a'.repeat(64) }],
          },
        ],
      },
    ],
    ...overrides,
  };
}

function entryOf(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    product: 'demo',
    name: 'demo.wasm',
    bytes: 1024,
    sha256: 'a'.repeat(64),
    variants: [
      {
        codec: 'identity',
        chunks: [{ part: 0, file: 'demo__demo.wasm.identity.000', bytes: 1024, sha256: 'a'.repeat(64) }],
      },
    ],
    ...overrides,
  };
}

describe('parseManifest：契约铁律在消费侧真的被拦', () => {
  it('合法 schema 3 manifest ⇒ 收窄成功，license 保留（v1.1）', () => {
    const r = parseManifest(baseManifest(), 'https://example.test/base/');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.manifest.schema).toBe(3);
    expect(r.manifest.entries).toHaveLength(1);
    expect(r.manifest.license?.id).toBe('MIT');
    expect(r.manifest.codecs).toEqual(['zstd', 'gzip', 'identity']);
  });

  it('接受 schema 2 与 3（catalogue 的 excluded 明说客户端接受 2/3）', () => {
    expect(ACCEPTED_SCHEMAS).toContain(2);
    expect(ACCEPTED_SCHEMAS).toContain(3);
    expect(parseManifest(baseManifest({ schema: 2 }), 'b/').ok).toBe(true);
    expect(parseManifest(baseManifest({ schema: 3 }), 'b/').ok).toBe(true);
  });

  it('★ schema 1 ⇒ 明确拒绝（不是静默当成 schema 2/3 处理）', () => {
    const r = parseManifest(baseManifest({ schema: 1 }), 'b/');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.rejection.kind).toBe('schema-rejected');
  });

  it('★ chunks[].file 含路径分隔符 ⇒ 拒（铁律 ①：纯文件名）', () => {
    const r = parseManifest(
      baseManifest({
        entries: [
          entryOf({
            variants: [
              { codec: 'identity', chunks: [{ part: 0, file: 'chunks/identity/000', bytes: 1024, sha256: 'a'.repeat(64) }] },
            ],
          }),
        ],
      }),
      'b/',
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.rejection.kind).toBe('shape-invalid');
    expect((r.rejection as { reason: string }).reason).toContain('V1 name whitelist');
  });

  it('★ chunks[].file 含 .. ⇒ 拒（路径穿越）', () => {
    const r = parseManifest(
      baseManifest({
        entries: [
          entryOf({
            variants: [
              { codec: 'identity', chunks: [{ part: 0, file: '../evil.000', bytes: 1024, sha256: 'a'.repeat(64) }] },
            ],
          }),
        ],
      }),
      'b/',
    );
    expect(r.ok).toBe(false);
  });

  it('★ part 不连续（缺号）⇒ 拒：拼接顺序靠它，缺号会静默拼错', () => {
    const r = parseManifest(
      baseManifest({
        chunkSize: 4,
        entries: [
          entryOf({
            bytes: 8,
            variants: [
              {
                codec: 'identity',
                chunks: [
                  { part: 0, file: 'a.000', bytes: 4, sha256: 'a'.repeat(64) },
                  { part: 2, file: 'a.002', bytes: 4, sha256: 'a'.repeat(64) },
                ],
              },
            ],
          }),
        ],
      }),
      'b/',
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect((r.rejection as { reason: string }).reason).toContain('not contiguous');
  });

  it('part 乱序但完整（002,000,001）⇒ 排序后接受（顺序由 part 决定，不靠数组序）', () => {
    const r = parseManifest(
      baseManifest({
        entries: [
          entryOf({
            bytes: 8,
            variants: [
              {
                codec: 'identity',
                chunks: [
                  { part: 2, file: 'a.002', bytes: 2, sha256: 'a'.repeat(64) },
                  { part: 0, file: 'a.000', bytes: 3, sha256: 'a'.repeat(64) },
                  { part: 1, file: 'a.001', bytes: 3, sha256: 'a'.repeat(64) },
                ],
              },
            ],
          }),
        ],
      }),
      'b/',
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.manifest.entries[0].variants[0].chunks.map((c) => c.part)).toEqual([0, 1, 2]);
  });

  it('不认识的 codec ⇒ 跳过该变体，但不整体拒（本端可能只是旧版本）', () => {
    const r = parseManifest(
      baseManifest({
        entries: [
          entryOf({
            variants: [
              { codec: 'brotli-exotic', chunks: [{ part: 0, file: 'x.000', bytes: 1, sha256: 'a'.repeat(64) }] },
              { codec: 'identity', chunks: [{ part: 0, file: 'a.000', bytes: 1024, sha256: 'a'.repeat(64) }] },
            ],
          }),
        ],
      }),
      'b/',
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.manifest.entries[0].variants).toHaveLength(1);
    expect(r.manifest.entries[0].variants[0].codec).toBe('identity');
  });

  it('★ entry 只有不认识的 codec ⇒ 该 entry 不可用 ⇒ 整体拒（不许留一个空壳 entry）', () => {
    const r = parseManifest(
      baseManifest({
        entries: [
          entryOf({
            variants: [{ codec: 'brotli-exotic', chunks: [{ part: 0, file: 'x.000', bytes: 1, sha256: 'a'.repeat(64) }] }],
          }),
        ],
      }),
      'b/',
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect((r.rejection as { reason: string }).reason).toContain('no usable variant');
  });

  it('★ entry.sha256 不是 64hex ⇒ 拒（坏指纹是记账层污染）', () => {
    const r = parseManifest(baseManifest({ entries: [entryOf({ sha256: 'abc' })] }), 'b/');
    expect(r.ok).toBe(false);
  });

  it('codecs 缺失 ⇒ 拒（没有回退链就不知道该按什么顺序选）', () => {
    const r = parseManifest(baseManifest({ codecs: [] }), 'b/');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect((r.rejection as { reason: string }).reason).toContain('codecs');
  });

  it('entries 非数组 ⇒ 拒', () => {
    const r = parseManifest(baseManifest({ entries: {} }), 'b/');
    expect(r.ok).toBe(false);
  });

  it('空对象 / null / 字符串 ⇒ 拒且不崩', () => {
    for (const bad of [{}, null, 'x', 42, []]) {
      const r = parseManifest(bad as unknown, 'b/');
      expect(r.ok).toBe(false);
    }
  });

  it('license 缺失 ⇒ 合法（v1.1 说「不知道」是合法终态，进不了 catalogue 是派生件的判断）', () => {
    const m = baseManifest();
    delete (m as Record<string, unknown>).license;
    const r = parseManifest(m, 'b/');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.manifest.license).toBeUndefined();
  });
});

describe('selectVariant：codecs 是有序回退链', () => {
  const entry: ReleaseEntry = {
    product: 'demo',
    name: 'demo.wasm',
    bytes: 8,
    sha256: 'a'.repeat(64),
    variants: [
      { codec: 'zstd', chunks: [{ part: 0, file: 'z', bytes: 4, sha256: 'a'.repeat(64) }] },
      { codec: 'gzip', chunks: [{ part: 0, file: 'g', bytes: 5, sha256: 'a'.repeat(64) }] },
      { codec: 'identity', chunks: [{ part: 0, file: 'i', bytes: 8, sha256: 'a'.repeat(64) }] },
    ],
  };
  const all: readonly ReleaseCodec[] = ['zstd', 'gzip', 'identity'];

  it('本端全能解 ⇒ 选链上第一个（zstd）', () => {
    const caps = new Set<ReleaseCodec>(['identity', 'gzip', 'zstd']);
    expect(selectVariant(entry, all, caps)?.codec).toBe('zstd');
  });

  it('无 zstd 能力 ⇒ 落到 gzip（多下 24.5% 字节，但能跑）', () => {
    const caps = new Set<ReleaseCodec>(['identity', 'gzip']);
    expect(selectVariant(entry, all, caps)?.codec).toBe('gzip');
  });

  it('只有 identity 能力 ⇒ 落到 identity', () => {
    const caps = new Set<ReleaseCodec>(['identity']);
    expect(selectVariant(entry, all, caps)?.codec).toBe('identity');
  });

  it('★ 能力集为空 ⇒ 不许瞎选（返回 null，不是随便给一个）', () => {
    expect(selectVariant(entry, all, new Set<ReleaseCodec>())).toBeNull();
  });

  it('★ manifest 漏写 codecs ⇒ 兜底 identity（可用性优先于体积）', () => {
    expect(selectVariant(entry, [], new Set<ReleaseCodec>(['identity', 'gzip', 'zstd']))?.codec).toBe('identity');
  });

  it('链上有声明但该 entry 没有那个变体 ⇒ 跳过继续找', () => {
    const partial: ReleaseEntry = { ...entry, variants: [entry.variants[2]] };
    const caps = new Set<ReleaseCodec>(['identity', 'gzip', 'zstd']);
    expect(selectVariant(partial, all, caps)?.codec).toBe('identity');
  });
});
describe('坏形状必须返回结构化 rejection，不许崩（Standards 审查第 6 条）', () => {
  it('★ variants 里含 null ⇒ 不崩（跳过该变体，若有别的可用则仍成功）', () => {
    const r = parseManifest(
      baseManifest({
        entries: [
          entryOf({
            variants: [
              null,
              { codec: 'identity', chunks: [{ part: 0, file: 'a.000', bytes: 1024, sha256: 'a'.repeat(64) }] },
            ],
          }),
        ],
      }),
      'b/',
    );
    // 关键：不抛 TypeError
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.manifest.entries[0].variants).toHaveLength(1);
  });

  it('★ variants 全是 null ⇒ 结构化拒绝（no usable variant），不是崩溃', () => {
    const r = parseManifest(baseManifest({ entries: [entryOf({ variants: [null, undefined] })] }), 'b/');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.rejection.kind).toBe('shape-invalid');
    expect((r.rejection as { reason: string }).reason).toContain('no usable variant');
  });

  it('★ chunks 里含 null ⇒ 结构化拒绝（少一块会拼出 size 对内容错的流）', () => {
    const r = parseManifest(
      baseManifest({
        entries: [
          entryOf({
            variants: [{ codec: 'identity', chunks: [null] }],
          }),
        ],
      }),
      'b/',
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.rejection.kind).toBe('shape-invalid');
  });

  it('★ 顶层是数组 / 数字 ⇒ 结构化拒绝，不崩', () => {
    for (const bad of [[], 0, 'x', true]) {
      const r = parseManifest(bad as unknown, 'b/');
      expect(r.ok).toBe(false);
    }
  });
});

describe('V11 许可规则：entry.license ?? manifest.license（唯一一条）', () => {
  it('★ entry 有 license ⇒ 用 entry 的（覆盖 manifest）', async () => {
    const { resolveLicense } = await import('../../src/modules/storage/releaseContract');
    const got = resolveLicense({ license: { id: 'MIT' } }, { license: { id: 'GPL-3.0' } });
    expect(got?.id).toBe('MIT');
  });

  it('★ entry 无 license ⇒ 继承 manifest 的', async () => {
    const { resolveLicense } = await import('../../src/modules/storage/releaseContract');
    expect(resolveLicense({}, { license: { id: 'GPL-3.0' } })?.id).toBe('GPL-3.0');
  });

  it('★ 两层都没有 ⇒ undefined（v1.1：「不知道」是合法终态）', async () => {
    const { resolveLicense } = await import('../../src/modules/storage/releaseContract');
    expect(resolveLicense({}, {})).toBeUndefined();
  });

  it('★ entry.license 在 parseManifest 里被保留（不许在组装时丢弃）', () => {
    const r = parseManifest(
      baseManifest({
        entries: [entryOf({ license: { id: 'Apache-2.0', url: 'https://a/L' } })],
      }),
      'b/',
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.manifest.entries[0].license?.id).toBe('Apache-2.0');
    expect(r.manifest.entries[0].license?.url).toBe('https://a/L');
  });
});

  it('★ 安全：`//evil.example/x` 这类名字必须被白名单拒（会 new URL 到别的 host）', () => {
    const r = parseManifest(
      baseManifest({
        entries: [
          entryOf({
            variants: [
              { codec: 'identity', chunks: [{ part: 0, file: '//evil.example/x', bytes: 1, sha256: 'a'.repeat(64) }] },
            ],
          }),
        ],
      }),
      'b/',
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect((r.rejection as { reason: string }).reason).toContain('V1 name whitelist');
  });

  it('★ `?` / `#` 也会被拼进 URL ⇒ 同样必须拒（旧实现只拒 / 和 ..，这条会漏）', () => {
    for (const bad of ['x.000?evil=1', 'x.000#frag']) {
      const r = parseManifest(
        baseManifest({
          entries: [
            entryOf({
              variants: [{ codec: 'identity', chunks: [{ part: 0, file: bad, bytes: 1, sha256: 'a'.repeat(64) }] }],
            }),
          ],
        }),
        'b/',
      );
      expect(r.ok, `${bad} 应被拒`).toBe(false);
    }
  });

  it('★ V6：单块 > 2^25 ⇒ 拒（fzstd backreference 上限，超了解不出）', () => {
    const r = parseManifest(
      baseManifest({
        entries: [
          entryOf({
            bytes: 2 ** 25 + 1,
            variants: [
              {
                codec: 'identity',
                chunks: [{ part: 0, file: 'a.000', bytes: 2 ** 25 + 1, sha256: 'a'.repeat(64) }],
              },
            ],
          }),
        ],
      }),
      'b/',
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect((r.rejection as { reason: string }).reason).toContain('V6 max');
  });

describe('V5 跨变体块数一致（一个只在部分编码下有效的 manifest 是坏的）', () => {
  it('★ zstd 3 块 / gzip 2 块 ⇒ 必须拒（否则 gzip 客户端永远不知道自己拿到坏 manifest）', () => {
    const r = parseManifest(
      baseManifest({
        entries: [
          entryOf({
            bytes: 8,
            variants: [
              {
                codec: 'zstd',
                chunks: [
                  { part: 0, file: 'a.z.000', bytes: 3, sha256: 'a'.repeat(64) },
                  { part: 1, file: 'a.z.001', bytes: 3, sha256: 'a'.repeat(64) },
                  { part: 2, file: 'a.z.002', bytes: 2, sha256: 'a'.repeat(64) },
                ],
              },
              {
                codec: 'gzip',
                chunks: [
                  { part: 0, file: 'a.g.000', bytes: 4, sha256: 'a'.repeat(64) },
                  { part: 1, file: 'a.g.001', bytes: 4, sha256: 'a'.repeat(64) },
                ],
              },
            ],
          }),
        ],
      }),
      'b/',
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect((r.rejection as { reason: string }).reason).toContain('codecs disagree on chunk count');
    expect((r.rejection as { reason: string }).reason).toContain('zstd=3');
    expect((r.rejection as { reason: string }).reason).toContain('gzip=2');
  });

  it('块数一致（同为 2）⇒ 通过', () => {
    const mk = (codec: string, p: string) => ({
      codec,
      chunks: [
        { part: 0, file: `a.${p}.000`, bytes: 4, sha256: 'a'.repeat(64) },
        { part: 1, file: `a.${p}.001`, bytes: 4, sha256: 'a'.repeat(64) },
      ],
    });
    const r = parseManifest(
      baseManifest({ entries: [entryOf({ bytes: 8, variants: [mk('zstd', 'z'), mk('gzip', 'g')] })] }),
      'b/',
    );
    expect(r.ok).toBe(true);
  });
});

describe('codecPreference：消费端按条目决定编码（信 069 提、信 102 采纳）', () => {
  const entryWithBoth: ReleaseEntry = {
    product: 'p',
    name: 'big.wasm',
    bytes: 8,
    sha256: 'a'.repeat(64),
    variants: [
      { codec: 'zstd', chunks: [{ part: 0, file: 'z', bytes: 4, sha256: 'a'.repeat(64) }] },
      { codec: 'gzip', chunks: [{ part: 0, file: 'g', bytes: 5, sha256: 'a'.repeat(64) }] },
      { codec: 'identity', chunks: [{ part: 0, file: 'i', bytes: 8, sha256: 'a'.repeat(64) }] },
    ],
  };
  const all = new Set<ReleaseCodec>(['zstd', 'gzip', 'identity']);

  it('★ 无偏好 ⇒ 按 manifest 顺序（zstd 第一）', () => {
    expect(selectVariant(entryWithBoth, ['zstd', 'gzip', 'identity'], all)?.codec).toBe('zstd');
  });

  it('★ 全局链 ["gzip","zstd"] ⇒ 优先 gzip', () => {
    expect(selectVariant(entryWithBoth, ['zstd', 'gzip', 'identity'], all, ['gzip', 'zstd'])?.codec).toBe('gzip');
  });

  it('★ 按条目回调：大件走 zstd、小件走 gzip（同一条 release 内两种成本决策）', () => {
    const pref = (e: { name: string; bytes: number }): readonly ReleaseCodec[] =>
      e.bytes > 1024 ? ['zstd'] : ['gzip'];
    expect(selectVariant({ ...entryWithBoth, bytes: 999_999 }, ['zstd', 'gzip', 'identity'], all, pref)?.codec).toBe('zstd');
    expect(selectVariant({ ...entryWithBoth, bytes: 512 }, ['zstd', 'gzip', 'identity'], all, pref)?.codec).toBe('gzip');
  });

  it('★ 回调返回 undefined / [] ⇒ 回落 manifest 顺序，不是错误', () => {
    expect(selectVariant(entryWithBoth, ['zstd', 'gzip', 'identity'], all, () => undefined)?.codec).toBe('zstd');
    expect(selectVariant(entryWithBoth, ['zstd', 'gzip', 'identity'], all, () => [])?.codec).toBe('zstd');
  });

  it('★ 偏好链里的 codec 本端解不了 ⇒ 跳过，继续按 manifest 找', () => {
    const caps = new Set<ReleaseCodec>(['gzip', 'identity']); // 无 zstd
    expect(selectVariant(entryWithBoth, ['zstd', 'gzip', 'identity'], caps, ['zstd', 'gzip'])?.codec).toBe('gzip');
  });

  it('★ 偏好不是要求：链没覆盖到的 codec 仍按 producer 建议找', () => {
    expect(selectVariant(entryWithBoth, ['zstd', 'gzip', 'identity'], all, ['gzip'])?.codec).toBe('gzip');
    // 只偏好 gzip，但 manifest 里 zstd 在前且也可解 ⇒ 仍可能被 manifest 链覆盖？
    // 实际形状：消费端链**优先**，所以这里应严格是 gzip（已断言）。
  });
});
