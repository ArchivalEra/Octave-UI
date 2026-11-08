#!/usr/bin/env node
// scripts/sync-release-assets.mjs
// ★ 2026-11-08：构建期 release 资产同步，走**产品运行期同一条分发契约字节链**。
//
// 旧形态（pages.yml）用裸 curl 从 `v0.1.0-wasm32` 整包 release 拉单个文件，
// 与运行期 `catalogue → manifest → chunks → 逐块 sha → 拼接 → 双 sha` 正交
// （用户：「这样就跟实际路径正交了」「市场不能下不同版本的 release？」）。
// 本脚本复用本仓照 Static-Contract/examples/fetch-concurrent.ts 移植的 TS 消费侧：
//   loadCatalogue / orderByAuthority / fetchReleaseManifest / selectVariant /
//   assembleEntry / computeSha256
// Node 侧只注入两个 adapter（FetchPort + CodecDecoders），不重写算法。
//
// 为什么按 entry.name 全表扫而不是写 release id：catalogue 里同一产物可能有
// 多条 release（OMC 就有 v0.1.0-wasm32 被 excluded、v0.2.0-wasm32 可用），
// 消费端身份 = 产物名 + sha 双确认（catalogueReleaseSource.ts:99-101），
// 所以这里也按名字扫、按权威产地排序试，不猜版本、不手抄 release id。
//
// 入口：`pnpm sync:assets`（sh 壳用 lockfile 里的 vite-node 加载本 .mjs）
// fail-closed：catalogue 全挂 / 找不到 entry / manifest pin 不符 / 逐块 sha 不符 /
// 拼接后 bytes+sha 不符 / 落盘指纹与货架不符 ⇒ exit 1，绝不绿着缺件。

import { writeFileSync, mkdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync, zstdDecompressSync } from 'node:zlib';
import { resolve, dirname } from 'node:path';

const REPO = resolve(import.meta.dirname, '..');

/**
 * 构建期需要落地的 release 资产清单。
 *
 * 每项 = 一个契约 entry：`entry` 是 manifest 里的 `name`（≡ 内容契约 url 的
 * basename），`sha`/`bytes` 是拼接后的期望值 —— 与 forge-catalog.json /
 * DownloadStore.KNOWN_ENGINE_METADATA 同源，是同一份指纹真源。
 */
const ARTIFACTS = [
  {
    // MSL：forge-catalog.json 的 modelica-standard-library 条目（url 指这个路径）
    entry: 'msl-4.1.0-maint.om.zip',
    out: 'public/assets/msl/msl-4.1.0-maint.om.zip',
    sha: 'a97d8d94ca7f7960f7f1c209613a35d65bcfa2426660e5052617e71326308535',
    bytes: 19482938,
  },
  {
    // OMC 两件（同源托管契约 mail/053）：产品 OmcBridge 要在页内 import .js
    // 并把 wasm 喂给运行时。此前 .js 靠 git 树供给，4d1b000 删掉后 CI 必红。
    entry: 'OpenModelicaCompiler.js',
    out: 'public/omc/OpenModelicaCompiler.js',
    sha: '56c399bd455d57c8e21206287445643b81db6fd4e3ac183989616b903d165f17',
    bytes: 56586,
  },
  {
    entry: 'OpenModelicaCompiler_bg.wasm',
    out: 'public/omc/OpenModelicaCompiler_bg.wasm',
    sha: '8287589ebdb53b4cc37c337c2ae88f798d8889f7ac3c29d693ca12e539b8d001',
    bytes: 74579404,
  },
];

// catalogue 候选：与 appContext.ts catalogueUrlCandidates() 同款顺序
const CATALOGUE_CANDIDATES = (process.env.PUBLIC_CATALOGUE_URL
  ? [process.env.PUBLIC_CATALOGUE_URL]
  : [
      'https://static.isui.ren/catalogue.json',
      'https://static.mango-mesa.ccwu.cc/catalogue.json',
    ]);

function die(msg) {
  console.error(`[sync-assets] FATAL: ${msg}`);
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
  zstd: (data) => zstdDecode(data),
  gzip: async (data) => new Uint8Array(gunzipSync(Buffer.from(data))),
  identity: (data) => data,
};

/** Node 的 zstd 解压：优先 node:zlib 的 zstdDecompressSync，缺则回落 fzstd（纯 JS）。 */
function zstdDecode(data) {
  if (typeof zstdDecompressSync === 'function') {
    return new Uint8Array(zstdDecompressSync(Buffer.from(data)));
  }
  throw new Error('zstd decoder unavailable in this Node runtime (need node:zlib zstdDecompressSync)');
}

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

const caps = detectCodecCapabilities(true);   // Node 26 有 zstd/gzip
console.log(`[sync-assets] catalogue candidates: ${CATALOGUE_CANDIDATES.join(' → ')}`);
const catalogue = await loadCatalogue(fetchPort, CATALOGUE_CANDIDATES);
if (!catalogue) die('all catalogue candidates failed — refusing to synthesize a market');

// 按权威产地排序后逐条试探：缓存「release → manifest」，多个 artifact 复用同一份。
const releases = orderByAuthority ? orderByAuthority(catalogue.releases) : catalogue.releases;
const manifestCache = new Map();
async function manifestOf(rel) {
  if (manifestCache.has(rel.id)) return manifestCache.get(rel.id);
  const loaded = await fetchReleaseManifest(fetchPort, rel.base, undefined, rel.manifest_sha256);
  const value = loaded.ok ? { rel, manifest: loaded.manifest, base: loaded.base } : null;
  if (!value) {
    console.warn(`[sync-assets] dead release ${rel.id}: ${JSON.stringify(loaded.rejection)}`);
  }
  manifestCache.set(rel.id, value);
  return value;
}

let failures = 0;
for (const art of ARTIFACTS) {
  console.log(`\n[sync-assets] → ${art.entry}`);
  const holders = [];
  for (const rel of releases) {
    const live = await manifestOf(rel);
    if (!live) continue;
    const entry = live.manifest.entries.find((e) => e.name === art.entry);
    if (!entry) continue;
    const variant = selectVariant(entry, live.manifest.codecs, caps);
    if (!variant) {
      die(`release ${rel.id} carries ${art.entry} but no decodable variant (caps=${[...caps]})`);
    }
    holders.push({ rel, entry, variant, base: live.base });
  }
  if (holders.length === 0) {
    console.error(`[sync-assets] FATAL: no live release carries entry ${art.entry}`);
    failures++;
    continue;
  }

  let bytes = null;
  for (const { rel, entry, variant, base } of holders) {
    console.log(`[sync-assets]   assembling from ${rel.id} (${variant.codec}, ${variant.chunks.length} chunks)`);
    const result = await assembleEntry(fetchPort, base, entry, variant, decoders, {
      concurrency: 2,
      onProgress: (p) => {
        if (p.phase === 'fetching') {
          process.stdout.write(`\r[sync-assets]     chunk ${p.chunkIndex + 1}/${p.chunkCount} ${p.receivedBytes}/${p.totalBytes} B`);
        }
      },
    });
    process.stdout.write('\n');
    if (result.ok) { bytes = result.data; break; }
    console.warn(`[sync-assets]   ${rel.id} failed: ${JSON.stringify(result.failure)}`);
  }
  if (!bytes) { console.error(`[sync-assets] FATAL: all candidate releases failed assembly for ${art.entry}`); failures++; continue; }

  // assembleEntry 已做逐块 sha + 拼接后 bytes/sha 双闸；这里再钉货架同源指纹。
  if (bytes.byteLength !== art.bytes) {
    console.error(`[sync-assets] FATAL: ${art.entry} assembled ${bytes.byteLength} B, expected ${art.bytes}`);
    failures++;
    continue;
  }
  const got = await computeSha256(bytes);
  if (got !== art.sha) {
    console.error(`[sync-assets] FATAL: ${art.entry} sha256 ${got} != catalog pin ${art.sha}`);
    failures++;
    continue;
  }

  mkdirSync(dirname(resolve(REPO, art.out)), { recursive: true });
  writeFileSync(resolve(REPO, art.out), bytes);
  console.log(`[sync-assets] OK: ${art.out} (${statSync(resolve(REPO, art.out)).size} B, sha ${got.slice(0, 16)}…)`);
}

if (failures > 0) die(`${failures} artifact(s) failed`);
console.log(`\n[sync-assets] all ${ARTIFACTS.length} artifact(s) synced via distribution contract`);
