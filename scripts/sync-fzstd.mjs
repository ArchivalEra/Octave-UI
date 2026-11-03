#!/usr/bin/env node
// scripts/sync-fzstd.mjs —— 把 fzstd 拷成站点静态资产（**不进 vite 打包图**）。
//
// 为什么需要这一步（用户 2026-11-03 的硬要求）：
//   「fzstd 绝对不能持久存储，但是用户没退出网站之前，fzstd 只能拉一次」
//
// 若继续用 `import('fzstd')`，vite 会把它拆成 `_astro/index-<hash>.js` 一块
// **不可变长缓存**的静态资源 —— 首次访问后就落在浏览器磁盘上，第二次访问直接复用，
// 违反「不能持久存储」。所以要：
//   ① 把字节拷到 `public/lib/`（不走 vite 打包，独立 URL）；
//   ② 运行期用 `fetch(url, {cache:'no-store'})` 取，浏览器不得落盘；
//   ③ 字节只在内存 Blob + 模块单例里活，document 销毁即消失。
//
// sha 钉死：这份字节会被 blob-import 执行，等于在页内跑第三方代码。
// 所以同步时校验 sha256 —— 依赖被投毒/替换成别的版本时，构建期就 fail-loud，
// 而不是等到用户浏览器里执行了才发现。
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

/** 期望指纹：来自 `node_modules/fzstd/esm/index.mjs` 的实测值（2026-11-03） */
const EXPECTED_SHA = '1a901fc5a58c349bbdb4f2aa1e688637ef56891ec58243a9f0cd863166b0d2a4';
const SRC = join(ROOT, 'node_modules', 'fzstd', 'esm', 'index.mjs');
const OUT_DIR = join(ROOT, 'public', 'lib');
const OUT = join(OUT_DIR, 'fzstd-0.1.1.mjs');

function die(msg) {
  console.error(`[sync-fzstd] FATAL: ${msg}`);
  process.exit(1);
}

if (!existsSync(SRC)) {
  die(`源文件不存在：${SRC}（先 pnpm install）`);
}

const bytes = readFileSync(SRC);
const sha = createHash('sha256').update(bytes).digest('hex');

if (sha !== EXPECTED_SHA) {
  die(
    `fzstd 字节指纹不符：期望 ${EXPECTED_SHA.slice(0, 16)}…，实际 ${sha.slice(0, 16)}…\n` +
      `  这份字节会被 blob-import 执行（等于在页内跑第三方代码）。\n` +
      `  要么依赖版本变了（升级请同步改本脚本的 EXPECTED_SHA 并在提交信息里写明理由），\n` +
      `  要么 node_modules 被污染。`
  );
}

mkdirSync(OUT_DIR, { recursive: true });

// 拷字节 + 写一份随附清单（运行期要用 sha 校验取回的字节）
copyFileSync(SRC, OUT);
writeFileSync(
  join(OUT_DIR, 'fzstd-0.1.1.manifest.json'),
  JSON.stringify({ version: '0.1.1', sha256: sha, bytes: bytes.length }, null, 2) + '\n'
);

console.log(`[sync-fzstd] OK → public/lib/fzstd-0.1.1.mjs (${bytes.length} B, sha ${sha.slice(0, 16)}…)`);