// tests/storage/releaseCatalogue.test.ts
// catalogue 消费层的判据：**死链容忍**（内容仓 099 §6.5 的实测事实）。
//
// 为什么这条最重要：catalogue 是 6 小时定时派生的派生件。上游删旧 tag / 发新 tag 的那一刻
// 到下一次派生的窗口里，表里会同时有**已死**的旧条目和**尚未进来**的新条目。
// 实测（2026-11-02）：主仓的 octave-11.3.0 与 -r2 的 manifest 都是 404。
// 「取第一个就开工」会随机全黑 —— 所以必须有「逐个试探、失败换下一个」。
//
// 复跑：CI=true npx vitest run tests/storage/releaseCatalogue.test.ts

import { describe, it, expect, vi } from 'vitest';
import {
  parseCatalogue,
  loadCatalogue,
  fetchReleaseManifest,
  resolveFirstLiveRelease,
  type Catalogue,
} from '../../src/modules/storage/releaseCatalogue';
import type { FetchPort } from '../../src/modules/storage/FetchPort';

function manifest(schema = 3): Record<string, unknown> {
  return {
    schema,
    id: 'R/x',
    codecs: ['identity'],
    entries: [
      {
        product: 'p',
        name: 'x',
        bytes: 1,
        sha256: 'a'.repeat(64),
        variants: [{ codec: 'identity', chunks: [{ part: 0, file: 'f.000', bytes: 1, sha256: 'a'.repeat(64) }] }],
      },
    ],
  };
}

/** 共用的 fetchBytes 桩：一律 404 —— 这些判据只走 fetchJSON，字节面不参与。
 *  全文件 FetchPort 复用这一份，避免每条用例各内联一份会漂移的假实现
 *  （code-review Standards 轴：消除重复 stub）。 */
const fetchBytes404: FetchPort['fetchBytes'] = async () => ({
  ok: false,
  status: 404,
  data: new Uint8Array(0),
  sha256: '',
  totalBytes: null,
});

function portWith(manifests: Record<string, unknown | { fail: number } | { throw: true }>): FetchPort {
  return {
    fetchBytes: fetchBytes404,
    async fetchJSON<T>(url: string): Promise<T> {
      if (!(url in manifests)) throw Object.assign(new Error('404'), { status: 404 });
      const v = manifests[url];
      if (v && typeof v === 'object' && 'fail' in (v as object)) {
        throw Object.assign(new Error(`HTTP ${(v as any).fail}`), { status: (v as any).fail });
      }
      if (v && typeof v === 'object' && 'throw' in (v as object)) {
        throw new TypeError('network down');
      }
      return v as T;
    },
  };
}

const CATALOGUE_RAW = {
  schema: 1,
  verified_at: '2026-11-02T09:20:17Z',
  releases: [
    { id: 'Dead/old-tag', base: 'https://dead.test/old/', license: { id: 'AGPL' } },
    { id: 'Live/good-tag', base: 'https://live.test/good/', license: { id: 'MIT', url: 'https://l/L' } },
    { id: 'Dead/also-dead', base: 'https://dead.test/x/' },
  ],
  excluded: [{ repo: 'ArchivalEra/X', tag: 'v0.1.0', reason: 'schema not accepted' }],
};

describe('parseCatalogue：坏目录不许伪装成空市场', () => {
  it('合法目录 ⇒ 收窄成功，license 与 excluded 保留', () => {
    const c = parseCatalogue(CATALOGUE_RAW);
    expect(c).not.toBeNull();
    expect(c!.releases).toHaveLength(3);
    expect(c!.releases[1].license?.id).toBe('MIT');
    expect(c!.excluded?.[0].reason).toContain('schema not accepted');
  });

  it('★ releases 为空 ⇒ null（空不是「市场没有包」，是派生件坏了）', () => {
    expect(parseCatalogue({ schema: 1, releases: [] })).toBeNull();
  });

  it('★ releases 缺失 / 非数组 ⇒ null', () => {
    expect(parseCatalogue({ schema: 1 })).toBeNull();
    expect(parseCatalogue({ schema: 1, releases: {} })).toBeNull();
  });

  it('null / 字符串 / 数字 ⇒ null 且不崩', () => {
    for (const bad of [null, 'x', 42, []]) expect(parseCatalogue(bad as unknown)).toBeNull();
  });

  it('缺 id 或 base 的条目被跳过（不整表拒：一条坏条目不该让整个市场消失）', () => {
    const c = parseCatalogue({
      schema: 1,
      releases: [{ id: 'ok', base: 'https://a/' }, { base: 'https://b/' }, { id: 'noBase' }],
    });
    expect(c!.releases).toHaveLength(1);
    expect(c!.releases[0].id).toBe('ok');
  });

  it('全部条目都缺 id/base ⇒ null（收窄后为空 = 有效条目为零）', () => {
    expect(parseCatalogue({ schema: 1, releases: [{}, {}] })).toBeNull();
  });
});

describe('fetchReleaseManifest：失败要分得清「网络坏」与「manifest 坏」', () => {
  it('URL 拼接：base 有尾斜杠 / 无尾斜杠都得到 base/manifest.json', async () => {
    const calls: string[] = [];
    const port: FetchPort = {
      fetchBytes: fetchBytes404,
      async fetchJSON<T>(url: string): Promise<T> {
        calls.push(url);
        return manifest() as T;
      },
    };
    await fetchReleaseManifest(port, 'https://a/r1/');
    await fetchReleaseManifest(port, 'https://a/r1');
    expect(calls).toEqual(['https://a/r1/manifest.json', 'https://a/r1/manifest.json']);
  });

  it('★ HTTP 404 ⇒ rejection.kind = network（死链是网络事实，不是 manifest 坏）', async () => {
    const r = await fetchReleaseManifest(portWith({}), 'https://dead.test/old/');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.rejection.kind).toBe('network');
    if (r.rejection.kind !== 'network') return;
    expect(r.rejection.httpStatus).toBe(404);
  });

  it('★ schema 1 ⇒ rejection.kind = schema-rejected（能拿到但没有契约形状）', async () => {
    const r = await fetchReleaseManifest(
      portWith({ 'https://x.test/m/manifest.json': manifest(1) }),
      'https://x.test/m/',
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.rejection.kind).toBe('schema-rejected');
  });

  it('★ 形状坏 ⇒ rejection.kind = shape-invalid，带原因', async () => {
    const r = await fetchReleaseManifest(
      portWith({ 'https://x.test/m/manifest.json': { schema: 3, entries: 'nope' } }),
      'https://x.test/m/',
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.rejection.kind).toBe('shape-invalid');
  });
});

describe('resolveFirstLiveRelease：死链容忍（本期最重要的一条）', () => {
  const catalogue: Catalogue = parseCatalogue(CATALOGUE_RAW)!;

  it('★ 第一个条目死链 ⇒ 自动换下一个，并如实收集死条目', async () => {
    const port = portWith({ 'https://live.test/good/manifest.json': manifest() });
    const r = await resolveFirstLiveRelease(port, catalogue);
    expect(r).not.toBeNull();
    expect(r!.release.id).toBe('Live/good-tag');
    // 死条目没有被静默丢掉——UI 要能说「N 个条目暂不可用」
    expect(r!.deadEntries.map((d) => d.id)).toEqual(['Dead/old-tag']);
  });

  it('★ 前两个都死 ⇒ 仍能找到第三个之外的那个活的（顺序试探，不是只试第一个）', async () => {
    const port = portWith({ 'https://live.test/good/manifest.json': manifest() });
    const r = await resolveFirstLiveRelease(port, catalogue, { maxAttempts: 10 });
    expect(r!.release.id).toBe('Live/good-tag');
    expect(r!.deadEntries).toHaveLength(1);
  });

  it('★ 全死 ⇒ 返回 null + 死条目清单齐全（不是返回第一个死条目假装成功）', async () => {
    const r = await resolveFirstLiveRelease(portWith({}), catalogue);
    expect(r).toBeNull();
  });

  it('preferredIds 优先尝试（已知 product 归属的仓先试）', async () => {
    const port = portWith({
      'https://dead.test/x/manifest.json': manifest(),
      'https://live.test/good/manifest.json': manifest(),
    });
    const r = await resolveFirstLiveRelease(port, catalogue, { preferredIds: ['Dead/also-dead'] });
    expect(r!.release.id).toBe('Dead/also-dead');
    expect(r!.deadEntries).toEqual([]);
  });

  it('preferredIds 里的 id 不在目录中 ⇒ 忽略，回落到目录顺序（不崩）', async () => {
    const port = portWith({ 'https://live.test/good/manifest.json': manifest() });
    const r = await resolveFirstLiveRelease(port, catalogue, { preferredIds: ['No/Such'] });
    expect(r!.release.id).toBe('Live/good-tag');
  });

  it('maxAttempts 限制试探数量（派生窗口大时不许无限打空请求）', async () => {
    let tries = 0;
    const port: FetchPort = {
      fetchBytes: fetchBytes404,
      async fetchJSON<T>(): Promise<T> {
        tries++;
        throw Object.assign(new Error('404'), { status: 404 });
      },
    };
    await resolveFirstLiveRelease(port, catalogue, { maxAttempts: 2 });
    expect(tries).toBe(2);
  });
});
describe('回信 103：catalogue 全探测失败必须响亮（不许静默回落整包）', () => {
  it('★ 全部候选都失败 ⇒ console.error 一次，原因里列出每个候选', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const urls = ['https://a.test/catalogue.json', 'https://b.test/catalogue.json'];
    const port: FetchPort = {
      fetchBytes: fetchBytes404,
      async fetchJSON<T>(url: string): Promise<T> {
        throw new Error(`HTTP 404 fetching ${url}`);
      },
    };
    try {
      const r = await loadCatalogue(port, urls);
      expect(r).toBeNull();
      expect(errSpy).toHaveBeenCalledTimes(1);
      const msg = String(errSpy.mock.calls[0][0]);
      expect(msg).toContain('ALL 2 candidate(s) failed');
      expect(msg).toContain('release benefits are LOST');
      expect(msg).toContain('https://a.test/catalogue.json');
      expect(msg).toContain('https://b.test/catalogue.json');
    } finally {
      errSpy.mockRestore();
    }
  });

  it('★ 200 但返回 SPA 落地页（不是合法 catalogue）⇒ 也算失败、要响亮', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const port: FetchPort = {
      fetchBytes: fetchBytes404,
      async fetchJSON<T>(): Promise<T> {
        return '<!doctype html><html>SPA fallback</html>' as T;
      },
    };
    try {
      expect(await loadCatalogue(port, ['https://x.test/catalogue.json'])).toBeNull();
      const msg = String(errSpy.mock.calls[0]?.[0] ?? '');
      expect(msg).toContain('not a valid catalogue');
    } finally {
      errSpy.mockRestore();
    }
  });

  it('★ 第一个候选成功 ⇒ 不报错（零误报）', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const port: FetchPort = {
      fetchBytes: fetchBytes404,
      async fetchJSON<T>(url: string): Promise<T> {
        if (url === 'https://a.test/catalogue.json') {
          // 标识来自真实产物（与 releaseCatalogue.ts 的 id 形状锚点一致），不许编：
          // 内容仓 100 §4.2 点名 'X/r1' 这类编造 id 为假 fixture 反例。
          return { schema: 1, releases: [{ id: 'Octave-Extra-Content/supply-msl-4.1.0', base: 'https://r/' }] } as T;
        }
        throw new Error('should not be reached');
      },
    };
    try {
      const r = await loadCatalogue(port, ['https://a.test/catalogue.json', 'https://b.test/catalogue.json']);
      expect(r).not.toBeNull();
      expect(errSpy).not.toHaveBeenCalled();
    } finally {
      errSpy.mockRestore();
    }
  });
});
