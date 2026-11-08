#!/usr/bin/env node
// scripts/sync-msl.mjs
// ★ 2026-11-08：构建期 MSL 同步，走**产品运行期同一条分发契约字节链**。
//
// 旧形态（pages.yml）用裸 curl 从 `v0.1.0-wasm32/msl-4.1.0-maint.om.zip`
// 整包 release 拉单个 zip —— 与运行期 `catalogue → manifest → chunks → 双 sha`
// 正交（用户：「这样就跟实际路径正交了」）。本脚本复用本仓照
// Static-Contract/examples/fetch-concurrent.ts 移植的那套 TS 消费侧：
//   loadCatalogue / fetchReleaseManifest / parseManifest / selectVariant /
//   assembleEntry / computeSha256
// 只在 Node 侧注入两个 adapter（FetchPort + CodecDecoders），不重写算法。
//
// 入口：`npx tsx scripts/sync-msl.mjs`（tsx 解析本仓 TS 内部无扩展名 import）
// 输出：public/assets/msl/msl-4.1.0-maint.om.zip
//   deploy-contract.mjs:236 的 verify 与 forge-catalog.json 的 url 都指它，路径不变。
//
// fail-closed：catalogue 全挂 / 找不到 entry / manifest pin 不符 / 逐块 sha 不符 /
// 拼接后 bytes+sha 不符 / 落盘指纹不符 ⇒ exit 1，绝不绿着缺件。

import { writeFileSync, mkdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync, zstdDecompressSync } from 'node:zlib';
import { resolve } from 'node:path';

const REPO = resolve(import.meta.dirname, '..');
const OUT = resolve(REPO, 'public/assets/msl/msl-4.1.0-maint.om.zip');
const ARTIFACT = 'msl-4.1.0-maint.om.zip';
// 与 forge-catalog.json 的 modelica-standard-library 条目同源（唯一指纹产地）
const PIN_SHA = 'a97d8d94ca7f7960f7f1c209613a35d65bcfa2426660e5052617e71326308535';
const PIN_BYTES = 19482938;

// catalogue 候选：与 appContext.ts:116 catalogueUrlCandidates() 同款顺序
const CATALOGUE_CANDIDATES = (process.env.PUBLIC_CATALOGUE_URL
  ? [process.env.PUBLIC_CATALOGUE_URL]
  : [
      'https://static.isui.ren/catalogue.json',
      'https://static.mango-mesa.ccwu.cc/catalogue.json',
    ]);

function die(msg) {
  console.error(`[sync-msl] FATAL: ${msg}`);
  process.exit(1);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

// ── Node 侧 FetchPort adapter（产品用 BrowserFetchAdapter，这里是同一接口的 Node 版） ──
// 构建期没有浏览器代理，瞬时网络抖动要有退避重试（与 assembleEntry 的逐块
// 重试同款纪律：0.3s / 0.6s / 1.2s）。catalogue 两个候选都撞上抖动时，
// 不重试就会误判「全挂」——实测 2026-11-08 第一次跑就撞到。
async function getWithRetry(url, asJson) {
  let last;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) {
        const e = new Error(`HTTP ${res.status} fetching ${url}`);
        e.status = res.status;
        throw e;
      }
      return asJson ? await res.json() : new Uint8Array(await res.arrayBuffer());
    } catch (err) {
      last = err;
      if (attempt < 3) await new Promise((r) => setTimeout(r, 300 * 2 ** attempt));
    }
  }
  throw last;
}

const fetchPort = {
  async fetchBytes(url) {
    const data = await getWithRetry(url, false);
    return {
      ok: true,
      status: 200,
      data,
      sha256: sha256(data),          // 逐块真值由 assembleEntry 再核，这里只给形状
      totalBytes: data.byteLength,
    };
  },
  async fetchJSON(url) {
    return getWithRetry(url, true);
  },
};

// ── Node 侧 CodecDecoders（产品用 createBrowserDecoders/fzstdLoader，这里是同一 seam） ──
const decoders = {
  zstd: (data) => zstdDecompressSync(Buffer.from(data)),
  gzip: async (data) => new Uint8Array(gunzipSync(Buffer.from(data))),
  identity: (data) => data,
};

const [
  { loadCatalogue, fetchReleaseManifest, orderByAuthority },
  { selectVariant },
  { assembleEntry, detectCodecCapabilities },
  { computeSha256 },
] = await Promise.all([
  import('../src/modules/storage/releaseCatalogue.ts'),
  import('../src/modules/storage/releaseContract.ts'),
  import('../src/modules/storage/chunkAssembler.ts'),
  import('../src/modules/storage/FetchPort.ts'),
]);

const caps = detectCodecCapabilities(true);   // Node 26 有 zstdDecompressSync / gzip
console.log(`[sync-msl] catalogue candidates: ${CATALOGUE_CANDIDATES.join(' → ')}`);
const catalogue = await loadCatalogue(fetchPort, CATALOGUE_CANDIDATES);
if (!catalogue) die('all catalogue candidates failed — refusing to synthesize a market');

// 按权威产地排序后逐条试探；命中「entry.name === 契约产物名」的那条 release，
// 不猜 release id（与 catalogueReleaseSource.ts:99-101 同一身份）。
const releases = orderByAuthority
  ? orderByAuthority(catalogue.releases)
  : catalogue.releases;
const wanted = [];
for (const rel of releases) {
  const loaded = await fetchReleaseManifest(fetchPort, rel.base, undefined, rel.manifest_sha256);
  if (!loaded.ok) {
    console.warn(`[sync-msl] dead release ${rel.id}: ${JSON.stringify(loaded.rejection)}`);
    continue;
  }
  const entry = loaded.manifest.entries.find((e) => e.name === ARTIFACT);
  if (!entry) continue;
  const variant = selectVariant(entry, loaded.manifest.codecs, caps);
  if (!variant) {
    die(`release ${rel.id} carries ${ARTIFACT} but no decodable variant (caps=${[...caps]})`);
  }
  wanted.push({ rel, entry, variant, base: loaded.base });
}
if (wanted.length === 0) die(`no live release carries entry ${ARTIFACT}`);

// 双发布（OM / Extra-Content）同 sha，取权威产地第一条；逐条试到装配成功为止。
let bytes = null;
for (const { rel, entry, variant, base } of wanted) {
  console.log(`[sync-msl] assembling ${entry.product}/${entry.name} from ${rel.id} (${variant.codec}, ${variant.chunks.length} chunks)`);
  const result = await assembleEntry(fetchPort, base, entry, variant, decoders, {
    concurrency: 2,
    onProgress: (p) => {
      if (p.phase === 'fetching') {
        process.stdout.write(`\r[sync-msl]   chunk ${p.chunkIndex + 1}/${p.chunkCount} ${p.receivedBytes}/${p.totalBytes} B`);
      }
    },
  });
  process.stdout.write('\n');
  if (result.ok) { bytes = result.data; break; }
  console.warn(`[sync-msl] ${rel.id} failed: ${JSON.stringify(result.failure)}`);
}
if (!bytes) die('all candidate releases failed assembly');

// assembleEntry 已做逐块 sha + 拼接后 bytes/sha 双闸；这里再钉货架同源指纹。
if (bytes.byteLength !== PIN_BYTES) die(`assembled ${bytes.byteLength} B, expected ${PIN_BYTES}`);
const got = await computeSha256(bytes);
if (got !== PIN_SHA) die(`assembled sha256 ${got} != catalog pin ${PIN_SHA}`);

mkdirSync(resolve(REPO, 'public/assets/msl'), { recursive: true });
writeFileSync(OUT, bytes);
const onDisk = statSync(OUT);
console.log(`[sync-msl] OK: ${OUT} (${onDisk.size} B, sha256 ${sha256(bytes).slice(0, 16)}…)`);
