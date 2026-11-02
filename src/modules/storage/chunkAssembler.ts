// src/modules/storage/chunkAssembler.ts
// 分片装配深模块：把「发布 manifest 的一个变体」取回成本地可用的原始字节。
//
// 接口很小（`assemble(base, entry, variant, opts)` 一个方法），实现很深：
//   并发取块 → 逐块 sha256 校验 → 按 codec 逐块解码 → 按 part 顺序拼接 → 全局 sha256 校验
//
// 三条判据（每条都是踩过的坑，不是设计洁癖）：
//
// ① **逐块解码，不许把多块当一个流解**。
//    契约 V6 要求生成器逐块独立压缩（`chunkSize ≤ 2^25` 是 fzstd backreference 上限）。
//    实测（2026-11-02，LLVM clang.wasm 10 块）：当前 fzstd 0.1.1 的 `decompress()` 恰好
//    **能**沿多帧解完，所以"一次解"这次侥幸通过。但这是**解码器版本的偶然**，不是契约
//    保证——换实现/换版本就可能只解第一帧，症状是「大载荷 sha 不符而单块全对」
//    （LLVM 实测踩过 4 个大载荷）。所以这里坚持逐块解，并在注释里记下实测差异。
//
// ② **块级校验不能省**。全局 sha 只在拼接后才知道，若中途某块下载被截断，
//    全局校验会失败但无法告诉你「是哪一块、缺多少」；逐块校验能当场定位。
//    实测（同次）：10 块里有 1 块因网络超时只到 1,262,461/1,669,830 字节，
//    逐块校验立刻报出该块，而全局校验要等 9 块拉完才发现。
//
// ③ **`chunks[].file` 是纯文件名，绝不拼路径**（契约铁律）。
//    base 末尾必须有 `/`，直接 `base + file`。
//
// 关于并发：契约方言测拐点 = 8 并发。这里默认 8，可由调用方覆盖。

import type { FetchPort } from './FetchPort';
import { computeSha256 } from './FetchPort';
import type { ReleaseChunk, ReleaseCodec, ReleaseEntry, ReleaseVariant } from './releaseContract';

/** 解码器依赖：由调用方注入，便于在 Node 里逐条测而不模拟浏览器 */
export interface CodecDecoders {
  /** zstd：通常按需动态 import('fzstd')；返回解压后的字节 */
  zstd: (data: Uint8Array) => Uint8Array | Promise<Uint8Array>;
  /** gzip：浏览器原生 DecompressionStream；Node 测试可注入 fflate 版 */
  gzip: (data: Uint8Array) => Promise<Uint8Array>;
  /** identity：直通 */
  identity: (data: Uint8Array) => Uint8Array | Promise<Uint8Array>;
}

export interface AssembleOptions {
  /** 并发上限（契约方言实测拐点 8）。默认 8。 */
  concurrency?: number;
  /** 进度回调：`phase` 区分取块与解码，便于 UI 显示真实阶段 */
  onProgress?: (p: {
    phase: 'fetching' | 'decoding';
    receivedBytes: number;
    totalBytes: number;
    chunkIndex: number;
    chunkCount: number;
  }) => void;
  signal?: AbortSignal;
}

export type AssembleFailure =
  | { kind: 'aborted' }
  | { kind: 'http'; chunk: ReleaseChunk; status: number }
  | { kind: 'chunk-sha'; chunk: ReleaseChunk; expected: string; actual: string }
  | { kind: 'decode'; chunk: ReleaseChunk; reason: string }
  | { kind: 'entry-sha'; expected: string; actual: string; bytes: number }
  | { kind: 'entry-bytes'; expected: number; actual: number };

export type AssembleResult =
  | { ok: true; data: Uint8Array; codec: ReleaseCodec; chunkCount: number }
  | { ok: false; failure: AssembleFailure };

const DEFAULT_CONCURRENCY = 8;

/** 契约铁律 ③：base 末尾要有 `/`，file 是裸名，直接拼 */
export function chunkUrl(base: string, file: string): string {
  return base.endsWith('/') ? `${base}${file}` : `${base}/${file}`;
}

/**
 * 按 part 顺序拼接。分片顺序由 manifest 的 `part` 决定，**不许依赖下载完成顺序**
 * ——并发下载的完成序是随机的，靠完成序拼接会得到一个 size 对、内容错的字节流。
 */
export function concatInPartOrder(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

/**
 * 装配一个 entry：取回 → 解码 → 拼接 → 双重校验。
 *
 * 失败一律返回 `AssembleResult`（不 throw），因为调用方（DownloadStore）需要把失败
 * 映射进它自己的 7 个封闭错误码；让本模块抛裸 Error 会把「哪一类坏」丢在路上。
 */
export async function assembleEntry(
  fetchPort: FetchPort,
  base: string,
  entry: ReleaseEntry,
  variant: ReleaseVariant,
  decoders: CodecDecoders,
  options: AssembleOptions = {},
): Promise<AssembleResult> {
  const chunks = variant.chunks;
  if (chunks.length === 0) {
    return { ok: false, failure: { kind: 'decode', chunk: { part: 0, file: '', bytes: 0, sha256: '' }, reason: 'variant has no chunks' } };
  }

  const concurrency = Math.max(1, Math.min(options.concurrency ?? DEFAULT_CONCURRENCY, chunks.length));
  const chunkTotalBytes = chunks.reduce((s, c) => s + c.bytes, 0);

  // 逐块结果按 **part 下标**落位（不是按完成顺序）
  const rawParts: Uint8Array[] = new Array(chunks.length);
  const decodedParts: Uint8Array[] = new Array(chunks.length);
  let receivedBytes = 0;
  let abortFailure: AssembleFailure | null = null;

  // ── 阶段一：并发取块 + 逐块 sha ──
  let nextIndex = 0;
  const worker = async (): Promise<AssembleFailure | null> => {
    while (true) {
      const index = nextIndex++;
      if (index >= chunks.length) return null;
      if (options.signal?.aborted) return { kind: 'aborted' };
      if (abortFailure) return abortFailure;

      const chunk = chunks[index];
      const url = chunkUrl(base, chunk.file);
      let res;
      try {
        res = await fetchPort.fetchBytes(url, { signal: options.signal });
      } catch (err: any) {
        if (err?.name === 'AbortError') return { kind: 'aborted' };
        // 网络层异常：归类为 http（调用方按传输失败处理）
        return { kind: 'http', chunk, status: 0 };
      }
      if (!res.ok) return { kind: 'http', chunk, status: res.status };

      // ② 逐块校验：当场定位坏块，不等全局
      const actual = await computeSha256(res.data);
      if (actual !== chunk.sha256) {
        return { kind: 'chunk-sha', chunk, expected: chunk.sha256, actual };
      }

      rawParts[index] = res.data;
      receivedBytes += res.data.length;
      options.onProgress?.({
        phase: 'fetching',
        receivedBytes,
        totalBytes: chunkTotalBytes,
        chunkIndex: index,
        chunkCount: chunks.length,
      });
    }
  };

  // 第一批 worker 提前退出时不要继续起新 worker（否则会白白 fetch）
  const workers = Array.from({ length: concurrency }, () =>
    worker().then((failure) => {
      if (failure && !abortFailure) abortFailure = failure;
      return failure;
    }),
  );
  const failures = await Promise.all(workers);
  const firstFailure = failures.find((f) => f !== null) ?? abortFailure;
  if (firstFailure) return { ok: false, failure: firstFailure };

  // ── 阶段二：逐块解码（铁律 ①：绝不把多块当一个流） ──
  for (let i = 0; i < chunks.length; i++) {
    if (options.signal?.aborted) return { ok: false, failure: { kind: 'aborted' } };
    const chunk = chunks[i];
    const raw = rawParts[i];
    try {
      const decoder =
        variant.codec === 'zstd' ? decoders.zstd : variant.codec === 'gzip' ? decoders.gzip : decoders.identity;
      decodedParts[i] = await decoder(raw);
    } catch (err: any) {
      return {
        ok: false,
        failure: { kind: 'decode', chunk, reason: err?.message ? String(err.message) : String(err) },
      };
    }
    options.onProgress?.({
      phase: 'decoding',
      receivedBytes: chunkTotalBytes,
      totalBytes: chunkTotalBytes,
      chunkIndex: i,
      chunkCount: chunks.length,
    });
  }

  // ── 阶段三：按 part 顺序拼接 + 全局校验 ──
  const assembled = concatInPartOrder(decodedParts);

  if (assembled.length !== entry.bytes) {
    return { ok: false, failure: { kind: 'entry-bytes', expected: entry.bytes, actual: assembled.length } };
  }
  const entrySha = await computeSha256(assembled);
  if (entrySha !== entry.sha256) {
    return {
      ok: false,
      failure: { kind: 'entry-sha', expected: entry.sha256, actual: entrySha, bytes: assembled.length },
    };
  }

  return { ok: true, data: assembled, codec: variant.codec, chunkCount: chunks.length };
}

/**
 * 浏览器默认解码器：zstd 按需动态 import（一次性 6.8KB gzip），gzip 用原生流。
 *
 * 为什么 zstd 要动态：只有真的要走 zstd 分支时才付这 6.8KB；契约允许客户端
 * 从 gzip 那项开始（代价是多下约 24.5% 字节），所以「不用 zstd 的人不该付它的体积」。
 */
export function createBrowserDecoders(): CodecDecoders {
  let fzstdPromise: Promise<typeof import('fzstd')> | null = null;
  const loadFzstd = () => {
    if (!fzstdPromise) fzstdPromise = import('fzstd');
    return fzstdPromise;
  };

  return {
    zstd: async (data) => {
      const mod = await loadFzstd();
      // fzstd 的 decompress 返回 Uint8Array
      return mod.decompress(data);
    },
    gzip: async (data) => {
      if (typeof DecompressionStream === 'undefined') {
        throw new Error('DecompressionStream unavailable in this environment');
      }
      const stream = new Blob([data as unknown as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    },
    identity: (data) => data,
  };
}

/** 本端能解哪些编码（喂给 `selectVariant` 的能力集） */
export function detectCodecCapabilities(hasFzstdAvailable: boolean): Set<ReleaseCodec> {
  const caps = new Set<ReleaseCodec>(['identity']);
  if (typeof DecompressionStream !== 'undefined') caps.add('gzip');
  if (hasFzstdAvailable) caps.add('zstd');
  return caps;
}