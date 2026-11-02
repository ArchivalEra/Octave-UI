// tests/storage/chunkAssembler.test.ts
// 分片装配的判据（Static-Contract v4 V1–V10 的消费侧）。
//
// 三条铁律逐条钉死（都是踩过的坑，注释在 chunkAssembler.ts 里）：
//   ① 逐块解码，不许把多块当一个流解；
//   ② 块级 sha 不能省（中途断块要当场定位，不能等全局校验）；
//   ③ chunks[].file 是裸名，base + file 直接拼。
//
// 解码器全部**注入**（CodecDecoders），所以这组测试不需要浏览器、不需要真 zstd 库。
// 真字节的端到端验证在 tests/integration/ 里另立（需要网络/fixture）。
//
// 复跑：CI=true npx vitest run tests/storage/chunkAssembler.test.ts

import { describe, it, expect, vi } from 'vitest';
import {
  assembleEntry,
  chunkUrl,
  concatInPartOrder,
  detectCodecCapabilities,
  type CodecDecoders,
} from '../../src/modules/storage/chunkAssembler';
import type { FetchPort } from '../../src/modules/storage/FetchPort';
import { computeSha256 } from '../../src/modules/storage/FetchPort';
import type { ReleaseChunk, ReleaseCodec, ReleaseEntry, ReleaseVariant } from '../../src/modules/storage/releaseContract';

/** 造一个可控的假 FetchPort：按 url 给字节，可注入 HTTP 失败/网络异常 */
function makePort(files: Record<string, Uint8Array>, calls?: string[]): FetchPort {
  return {
    async fetchBytes(url: string) {
      calls?.push(url);
      const hit = files[url];
      if (!hit) return { ok: false, status: 404, data: new Uint8Array(0), sha256: '', totalBytes: null };
      return { ok: true, status: 200, data: hit, sha256: await computeSha256(hit), totalBytes: hit.length };
    },
    async fetchJSON() {
      throw new Error('not used');
    },
  };
}

/** 身份解码器（大多数用例用 identity，把注意力集中在块逻辑上） */
const idDecoders: CodecDecoders = {
  identity: (d) => d,
  zstd: () => {
    throw new Error('zstd decoder should not be called in identity cases');
  },
  gzip: async () => {
    throw new Error('gzip decoder should not be called in identity cases');
  },
};

async function makeEntry(parts: Uint8Array[], codec: ReleaseCodec = 'identity'): Promise<{
  entry: ReleaseEntry;
  variant: ReleaseVariant;
  files: Record<string, Uint8Array>;
}> {
  const base = 'https://release.test/r1/';
  const chunks: ReleaseChunk[] = [];
  const files: Record<string, Uint8Array> = {};
  let offset = 0;
  for (let i = 0; i < parts.length; i++) {
    const file = `pkg__x.${codec}.${String(i).padStart(3, '0')}`;
    files[chunkUrl(base, file)] = parts[i];
    chunks.push({ part: i, file, bytes: parts[i].length, sha256: await computeSha256(parts[i]) });
    offset += parts[i].length;
  }
  const whole = concatInPartOrder(parts);
  return {
    entry: { product: 'pkg', name: 'x', bytes: whole.length, sha256: await computeSha256(whole), variants: [] },
    variant: { codec, chunks },
    files,
  };
}

describe('块级校验：中途坏块要当场定位', () => {
  it('全部正确 ⇒ 装配成功，字节与 entry.sha256 一致', async () => {
    const parts = [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5]), new Uint8Array([6])];
    const { entry, variant, files } = await makeEntry(parts);
    const r = await assembleEntry(makePort(files), 'https://release.test/r1/', entry, variant, idDecoders);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Array.from(r.data)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(r.chunkCount).toBe(3);
  });

  it('★ 中间一块 sha 不符 ⇒ 报 chunk-sha 并点名那一块（不是笼统的 entry-sha）', async () => {
    const parts = [new Uint8Array([1]), new Uint8Array([2]), new Uint8Array([3])];
    const { entry, variant, files } = await makeEntry(parts);
    // 把第 2 块换成别的字节（size 相同，sha 不同 —— 正是"截断被 size 拦住、篡改要靠 sha"）
    const key = chunkUrl('https://release.test/r1/', variant.chunks[1].file);
    files[key] = new Uint8Array([9]);
    const r = await assembleEntry(makePort(files), 'https://release.test/r1/', entry, variant, idDecoders);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.failure.kind).toBe('chunk-sha');
    if (r.failure.kind !== 'chunk-sha') return;
    expect(r.failure.chunk.part).toBe(1);
    expect(r.failure.actual).not.toBe(r.failure.expected);
  });

  it('★ HTTP 失败 ⇒ 报 http 且带 status 与该块', async () => {
    const parts = [new Uint8Array([1]), new Uint8Array([2])];
    const { entry, variant } = await makeEntry(parts);
    // 直接构造端口：第 2 块返回 503（比在 files 里塞失败标记更直白）
    const port: FetchPort = {
      async fetchBytes(url: string) {
        if (url.endsWith(variant.chunks[1].file)) {
          return { ok: false, status: 503, data: new Uint8Array(0), sha256: '', totalBytes: null };
        }
        const data = new Uint8Array([1]);
        return { ok: true, status: 200, data, sha256: await computeSha256(data), totalBytes: 1 };
      },
      async fetchJSON() {
        throw new Error('no');
      },
    };
    const r = await assembleEntry(port, 'https://release.test/r1/', entry, variant, idDecoders);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.failure.kind).toBe('http');
    if (r.failure.kind !== 'http') return;
    expect(r.failure.status).toBe(503);
  });

  it('网络层异常（fetch throw）⇒ 归类 http status=0，不把裸异常漏给调用方', async () => {
    const parts = [new Uint8Array([1])];
    const { entry, variant } = await makeEntry(parts);
    const port: FetchPort = {
      async fetchBytes(): Promise<never> {
        throw new TypeError('network down');
      },
      async fetchJSON() {
        throw new Error('no');
      },
    };
    const r = await assembleEntry(port, 'https://release.test/r1/', entry, variant, idDecoders);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.failure.kind).toBe('http');
    if (r.failure.kind !== 'http') return;
    expect(r.failure.status).toBe(0);
  });
});

describe('拼接顺序：由 part 决定，绝不靠下载完成顺序', () => {
  it('★ 块以乱序完成 ⇒ 仍按 part 拼（并发完成序随机，靠它会拼出 size 对内容错的流）', async () => {
    const parts = [new Uint8Array([10, 11]), new Uint8Array([20]), new Uint8Array([30, 31, 32])];
    const { entry, variant, files } = await makeEntry(parts);
    // 让第 0 块最慢、第 2 块最快：完成顺序 = 2,1,0
    const delays: Record<string, number> = {
      [chunkUrl('https://release.test/r1/', variant.chunks[0].file)]: 30,
      [chunkUrl('https://release.test/r1/', variant.chunks[1].file)]: 15,
      [chunkUrl('https://release.test/r1/', variant.chunks[2].file)]: 0,
    };
    const port: FetchPort = {
      async fetchBytes(url) {
        await new Promise((r) => setTimeout(r, delays[url] ?? 0));
        const data = files[url];
        return { ok: true, status: 200, data, sha256: await computeSha256(data), totalBytes: data.length };
      },
      async fetchJSON() {
        throw new Error('no');
      },
    };
    const r = await assembleEntry(port, 'https://release.test/r1/', entry, variant, idDecoders);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // 若按完成序拼会是 [30,31,32,20,10,11] —— 这里必须是 part 序
    expect(Array.from(r.data)).toEqual([10, 11, 20, 30, 31, 32]);
  });

  it('concatInPartOrder 空数组 ⇒ 空字节（不崩）', () => {
    expect(concatInPartOrder([]).length).toBe(0);
  });
});

describe('全局校验：拼接后两道', () => {
  it('★ 块全绿但拼出来 size 不对 ⇒ entry-bytes（说明 manifest 自相矛盾）', async () => {
    const parts = [new Uint8Array([1, 2])];
    const { entry, variant, files } = await makeEntry(parts);
    // 伪造 entry.bytes：块都对，但声明的总量是错的
    const lyingEntry: ReleaseEntry = { ...entry, bytes: 999 };
    const r = await assembleEntry(makePort(files), 'https://release.test/r1/', lyingEntry, variant, idDecoders);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.failure.kind).toBe('entry-bytes');
  });

  it('★ 块全绿、size 对但 sha 不对 ⇒ entry-sha（size 判据看不见的坏法）', async () => {
    const parts = [new Uint8Array([1, 2])];
    const { entry, variant, files } = await makeEntry(parts);
    const lyingEntry: ReleaseEntry = { ...entry, sha256: 'b'.repeat(64) };
    const r = await assembleEntry(makePort(files), 'https://release.test/r1/', lyingEntry, variant, idDecoders);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.failure.kind).toBe('entry-sha');
  });
});

describe('逐块解码（铁律 ①）', () => {
  it('★ zstd 分支必须**逐块**调用解码器（调用次数 == 块数），不许一次解多帧', async () => {
    const parts = [new Uint8Array([1]), new Uint8Array([2]), new Uint8Array([3])];
    const { entry, variant, files } = await makeEntry(parts, 'zstd');
    const zstdSpy = vi.fn((d: Uint8Array) => d);
    const decoders: CodecDecoders = { ...idDecoders, zstd: zstdSpy };
    const r = await assembleEntry(makePort(files), 'https://release.test/r1/', entry, variant, decoders);
    expect(r.ok).toBe(true);
    expect(zstdSpy).toHaveBeenCalledTimes(3);
    // 每次收到的都是单块（不是拼接后的整块）
    for (let i = 0; i < 3; i++) {
      expect(zstdSpy.mock.calls[i][0].length).toBe(1);
    }
  });

  it('gzip 分支同判：调用次数 == 块数', async () => {
    const parts = [new Uint8Array([1]), new Uint8Array([2])];
    const { entry, variant, files } = await makeEntry(parts, 'gzip');
    const gzipSpy = vi.fn(async (d: Uint8Array) => d);
    const r = await assembleEntry(makePort(files), 'https://release.test/r1/', entry, variant, { ...idDecoders, gzip: gzipSpy });
    expect(r.ok).toBe(true);
    expect(gzipSpy).toHaveBeenCalledTimes(2);
  });

  it('★ 解码器抛错 ⇒ 报 decode 且点名那一块（不是笼统失败）', async () => {
    const parts = [new Uint8Array([1]), new Uint8Array([2])];
    const { entry, variant, files } = await makeEntry(parts, 'zstd');
    const decoders: CodecDecoders = {
      ...idDecoders,
      zstd: (d) => {
        if (d[0] === 2) throw new Error('bad frame');
        return d;
      },
    };
    const r = await assembleEntry(makePort(files), 'https://release.test/r1/', entry, variant, decoders);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.failure.kind).toBe('decode');
    if (r.failure.kind !== 'decode') return;
    expect(r.failure.chunk.part).toBe(1);
    expect(r.failure.reason).toContain('bad frame');
  });
});

describe('并发与取消', () => {
  it('并发上限生效：同时进行的取块数不超过 concurrency', async () => {
    const parts = Array.from({ length: 8 }, (_, i) => new Uint8Array([i]));
    const { entry, variant, files } = await makeEntry(parts);
    let inFlight = 0;
    let peak = 0;
    const port: FetchPort = {
      async fetchBytes(url) {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight--;
        const data = files[url];
        return { ok: true, status: 200, data, sha256: await computeSha256(data), totalBytes: data.length };
      },
      async fetchJSON() {
        throw new Error('no');
      },
    };
    const r = await assembleEntry(port, 'https://release.test/r1/', entry, variant, idDecoders, { concurrency: 3 });
    expect(r.ok).toBe(true);
    expect(peak).toBeLessThanOrEqual(3);
  });

  it('★ 中途 abort ⇒ 报 aborted，且不把半成品当成功', async () => {
    const parts = Array.from({ length: 4 }, (_, i) => new Uint8Array([i]));
    const { entry, variant, files } = await makeEntry(parts);
    const controller = new AbortController();
    controller.abort();
    const r = await assembleEntry(makePort(files), 'https://release.test/r1/', entry, variant, idDecoders, {
      signal: controller.signal,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.failure.kind).toBe('aborted');
  });

  it('进度回调覆盖 fetching 与 decoding 两阶段', async () => {
    const parts = [new Uint8Array([1]), new Uint8Array([2])];
    const { entry, variant, files } = await makeEntry(parts);
    const phases = new Set<string>();
    await assembleEntry(makePort(files), 'https://release.test/r1/', entry, variant, idDecoders, {
      onProgress: (p) => phases.add(p.phase),
    });
    expect(phases.has('fetching')).toBe(true);
    expect(phases.has('decoding')).toBe(true);
  });
});

describe('URL 拼接（铁律 ③）', () => {
  it('base 末尾有 / ⇒ 直接拼', () => {
    expect(chunkUrl('https://x/r1/', 'a.000')).toBe('https://x/r1/a.000');
  });
  it('base 末尾无 / ⇒ 补一个（仍是 base + 裸名，不引入 chunks/ 一类子路径）', () => {
    expect(chunkUrl('https://x/r1', 'a.000')).toBe('https://x/r1/a.000');
  });
  it('★ 裸名含 / 时本函数不负责拦（拦在 parseManifest 的入口校验）', () => {
    // 这条钉住责任边界：URL 拼接不做安全判断，坏名字在解析期已被拒
    expect(chunkUrl('https://x/', 'a/b')).toBe('https://x/a/b');
  });
});

describe('能力探测', () => {
  it('有无 DecompressionStream 决定 gzip 能力', () => {
    const caps = detectCodecCapabilities(true);
    expect(caps.has('gzip')).toBe(typeof DecompressionStream !== 'undefined');
    expect(caps.has('identity')).toBe(true);
  });
  it('fzstd 可用性由调用方给（探测不到就如实不给）', () => {
    expect(detectCodecCapabilities(false).has('zstd')).toBe(false);
    expect(detectCodecCapabilities(true).has('zstd')).toBe(true);
  });
});