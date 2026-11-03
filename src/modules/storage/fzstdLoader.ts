// src/modules/storage/fzstdLoader.ts
// fzstd 运行期加载器：**不持久存储**，但**一个 document 生命周期内只取一次**。
//
// 用户 2026-11-03 的硬要求（逐字）：
//   「fzstd 绝对不能持久存储，但是用户没退出网站之前，fzstd 只能拉一次」
//
// 为什么要专门写一个模块而不是直接 `import('fzstd')`：
//   动态 import 会让 vite 拆出一块 `_astro/index-<hash>.js` —— 那是**不可变长缓存**
//   的静态资源，首次访问后落盘，第二次访问直接复用 ⇒ 违反「不能持久存储」。
//   所以 fzstd 的字节**不进打包图**（由 `scripts/sync-fzstd.mjs` 拷到 `public/lib/`），
//   运行期用 `fetch(..., {cache:'no-store'})` 取，字节只活在 Blob + 模块单例里。
//
// 两条约束怎么保证（这是本模块存在的全部理由）：
//
//   ① **不持久**：三层
//      a) `cache: 'no-store'` —— 请求指令，浏览器不得读/写任何 HTTP 缓存；
//      b) URL 带**每次 document 唯一的 nonce** —— 即便某层忽略 no-store、
//         即便 `public/lib` 被配了长缓存，缓存键结构上也不可复用（双保险）；
//      c) 明确**不用** sessionStorage / localStorage / IndexedDB / OPFS / CacheStorage
//         （sessionStorage 在 Chromium 落盘且跨 reload 存活 —— 正是「持久存储」）。
//
//   ② **一次/访问**：模块级 memo promise。作用域 = 单个 document（本仓是单页站，
//      无客户端路由）。并发与多次 decode 都 await 同一个 promise。
//      tab 之间不共享（跨 tab 去重需要 SharedWorker 一类长活通道，与约束 ① 冲突）。
//
// 失败语义：fetch 失败 / sha 不符 / blob import 失败 ⇒ **本 document 内永久不可用**
//   （不重试 —— 「只能拉一次」按字面执行），抛类型化错误让上层回落 gzip 变体。

/** fzstd 模块里我们用到的最小面（照 `node_modules/fzstd/lib/index.d.ts`） */
export interface FzstdModule {
  decompress(data: Uint8Array): Uint8Array;
}

export class FzstdLoadError extends Error {
  readonly code = 'FZSTD_UNAVAILABLE';
  constructor(reason: string, cause?: unknown) {
    super(`fzstd unavailable: ${reason}`);
    this.name = 'FzstdLoadError';
    if (cause !== undefined) (this as { cause?: unknown }).cause = cause;
  }
}

export interface FzstdLoaderDeps {
  /** 取字节（可注入；测试给假实现） */
  fetchBytes: (url: string, init: { cache: string }) => Promise<{ ok: boolean; status: number; bytes: Uint8Array }>;
  /** 执行模块（可注入；测试给假 import） */
  importModule: (url: string) => Promise<unknown>;
  /** 校验指纹（可注入；测试可让它失败） */
  sha256: (bytes: Uint8Array) => Promise<string>;
  /** Blob URL 创建/回收（可注入） */
  createObjectURL: (blob: Blob) => string;
  revokeObjectURL: (url: string) => void;
  /** 期望指纹（来自 `public/lib/fzstd-0.1.1.manifest.json`） */
  expectedSha256: string;
  /** 模块地址（相对站点 base） */
  url: string;
}

/** 每次 document 唯一的 nonce：让缓存键结构上不可复用（约束 ①b） */
function makeSessionNonce(): string {
  const buf = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(buf);
  } else {
    for (let i = 0; i < buf.length; i++) buf[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}

// ⚠️ nonce 必须是**实例级**而不是模块级常量（2026-11-03 测试抓到的真 bug）：
// 模块级常量在整个 JS 进程里只有一个值；同一进程内重建 loader（比如测试、
// 或将来任何"重新初始化"路径）会复用同一个 nonce ⇒ 缓存键可复用 ⇒ 约束 ① 破功。
// 实例级保证「每个 document 一份 loader 一个 nonce」。

export interface FzstdLoader {
  /** 取（或复用）fzstd 模块。失败后本 document 内永久 reject。 */
  load(): Promise<FzstdModule>;
  /** 本端此刻能否解 zstd（同步、无副作用 —— 供 `detectCodecCapabilities` 用） */
  isUsable(): boolean;
  /** 本端是否**已经**拿过字节（用于诊断/测试断言） */
  state(): 'idle' | 'loading' | 'ready' | 'unavailable';
  /** 仅供测试：重置（生产不调） */
  _resetForTest(): void;
}

export function createFzstdLoader(deps: FzstdLoaderDeps): FzstdLoader {
  let memo: Promise<FzstdModule> | null = null;
  let current: 'idle' | 'loading' | 'ready' | 'unavailable' = 'idle';
  /** 本 loader 实例（≈ 本次 document）的缓存键盐 */
  const sessionNonce = makeSessionNonce();

  async function fetchAndInstantiate(): Promise<FzstdModule> {
    // 约束 ①b：每次 document 一个 nonce，拼进 URL ⇒ 缓存键不可复用
    const url = `${deps.url}?v=${sessionNonce}`;

    // ⚠️ 不带 signal：让站点的 `__octaveFetchGuard`（deploy-contract 注入的
    // 10s 头超时 + 单次重试）接管超时，而不是在这里另起一套。
    const res = await deps.fetchBytes(url, { cache: 'no-store' });
    if (!res.ok) throw new FzstdLoadError(`HTTP ${res.status} fetching ${url}`);

    // 这份字节会被 blob-import 执行（等于在页内跑第三方代码）⇒ 必须先钉指纹再执行
    const actual = await deps.sha256(res.bytes);
    if (actual !== deps.expectedSha256) {
      throw new FzstdLoadError(
        `sha256 mismatch: expected ${deps.expectedSha256.slice(0, 16)}…, got ${actual.slice(0, 16)}…`
      );
    }

    // 走 blob 而不是直接 import(url)：既免疫站点对 .mjs 的 MIME 处理差异，
    // 也让「取字节 → 验指纹 → 执行」三个步骤分离、可审计。
    const blob = new Blob([res.bytes as unknown as BlobPart], { type: 'text/javascript' });
    const blobUrl = deps.createObjectURL(blob);
    try {
      const mod = (await deps.importModule(blobUrl)) as Partial<FzstdModule>;
      if (typeof mod?.decompress !== 'function') {
        throw new FzstdLoadError('module has no decompress() export');
      }
      return mod as FzstdModule;
    } finally {
      deps.revokeObjectURL(blobUrl); // 立即回收：blob 本身也不许长期存活
    }
  }

  return {
    load(): Promise<FzstdModule> {
      if (memo) return memo; // 约束 ②：并发 + 后续调用共享同一个 promise
      current = 'loading';
      memo = fetchAndInstantiate().then(
        (mod) => {
          current = 'ready';
          return mod;
        },
        (err) => {
          // 失败也永久记住（"只能拉一次"按字面执行，不重试）
          current = 'unavailable';
          console.error('[fzstd] load failed — zstd decoding disabled for this session:', err);
          throw err instanceof FzstdLoadError ? err : new FzstdLoadError(String(err?.message ?? err), err);
        }
      );
      return memo;
    },

    isUsable(): boolean {
      // 'idle' 也算可用：还没试过，不能因为"没试"就把 zstd 从能力集里排除
      return current === 'idle' || current === 'ready' || current === 'loading';
    },

    state(): 'idle' | 'loading' | 'ready' | 'unavailable' {
      return current;
    },

    _resetForTest(): void {
      memo = null;
      current = 'idle';
    },
  };
}

/**
 * 生产环境的 loader（浏览器）。
 *
 * 这里刻意**不**读 `public/lib/*.manifest.json`（那要多一次网络请求），
 * 而是把期望指纹与 URL 写成常量 —— 它由 `scripts/sync-fzstd.mjs` 与
 * `scripts/deploy-contract.mjs verify` 双向看住（同步时校验、构建后断言在场）。
 */
export function createBrowserFzstdLoader(baseUrl = ''): FzstdLoader {
  const cleanBase = baseUrl.replace(/\/+$/, '');
  return createFzstdLoader({
    url: `${cleanBase}/lib/fzstd-0.1.1.mjs`,
    expectedSha256: '1a901fc5a58c349bbdb4f2aa1e688637ef56891ec58243a9f0cd863166b0d2a4',
    fetchBytes: async (url, init) => {
      const res = await fetch(url, { cache: init.cache as RequestCache });
      if (!res.ok) return { ok: false, status: res.status, bytes: new Uint8Array(0) };
      const buf = await res.arrayBuffer();
      return { ok: true, status: res.status, bytes: new Uint8Array(buf) };
    },
    importModule: (url) => import(/* @vite-ignore */ url),
    sha256: async (bytes) => {
      if (typeof crypto !== 'undefined' && crypto.subtle) {
        const h = await crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource);
        return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, '0')).join('');
      }
      const nodeCrypto = await import('node:crypto');
      return nodeCrypto.createHash('sha256').update(bytes).digest('hex');
    },
    createObjectURL: (blob) => URL.createObjectURL(blob),
    revokeObjectURL: (url) => URL.revokeObjectURL(url),
  });
}