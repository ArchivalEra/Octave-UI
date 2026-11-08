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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

/**
 * 两道指纹（2026-11-08 修）：合规审查给产物补了 MIT 头后，只把 EXPECTED_SHA
 * 改成产物指纹却仍从 node_modules 读原始字节 ⇒ 干净 CI 检出必红（实测
 * run 42445670653）。源与产物是两份不同字节，必须各钉各的：
 *   · SRC_SHA = node_modules/fzstd/esm/index.mjs 原始字节（防依赖投毒）
 *   · OUT_SHA = 补 MIT 头后的产物（fzstdLoader / deploy-contract verify /
 *     manifest 三处消费方同一真源）
 */
const SRC_SHA = '1a901fc5a58c349bbdb4f2aa1e688637ef56891ec58243a9f0cd863166b0d2a4';
const OUT_SHA = '6ecae2c7dc4cc35242de7dde0dd7d56b67f38a5bd255c745e9045c736e8f6f95';
const LICENSE_HEADER = `/*!
 * fzstd 0.1.1 — https://github.com/101arrowz/fzstd
 * MIT License — Copyright (c) 2020 Arjun Barrett
 * Full license text: THIRD-PARTY-NOTICES.md (shipped alongside) and
 * https://github.com/101arrowz/fzstd/blob/master/LICENSE
 * SPDX-License-Identifier: MIT
 *
 * Vendored for the release-chunk zstd decoder (chunkAssembler). Do not
 * re-minify this file: the license header must survive into dist/.
 */
`;
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

const srcBytes = readFileSync(SRC);
const srcSha = createHash('sha256').update(srcBytes).digest('hex');

if (srcSha !== SRC_SHA) {
  die(
    `fzstd 源字节指纹不符：期望 ${SRC_SHA.slice(0, 16)}…，实际 ${srcSha.slice(0, 16)}…\n` +
      `  这份字节会被 blob-import 执行（等于在页内跑第三方代码）。\n` +
      `  要么依赖版本变了（升级请同步改 SRC_SHA/OUT_SHA 并在提交信息里写明理由），\n` +
      `  要么 node_modules 被污染。`
  );
}

// 合规：产物必须带 MIT 头（随 dist 分发，minify 不许剥）。头是固定前缀，
// 原始部分逐字不动；补头后再核产物指纹，确保与三处消费方同源。
const outBytes = Buffer.concat([Buffer.from(LICENSE_HEADER, 'utf8'), srcBytes]);
const outSha = createHash('sha256').update(outBytes).digest('hex');
if (outSha !== OUT_SHA) {
  die(`fzstd 产物指纹不符：期望 ${OUT_SHA.slice(0, 16)}…，实际 ${outSha.slice(0, 16)}…（MIT 头与合规版不一致）`);
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT, outBytes);
writeFileSync(
  join(OUT_DIR, 'fzstd-0.1.1.manifest.json'),
  JSON.stringify({ version: '0.1.1', sha256: outSha, bytes: outBytes.length }, null, 2) + '\n'
);

console.log(`[sync-fzstd] OK → public/lib/fzstd-0.1.1.mjs (${outBytes.length} B, sha ${outSha.slice(0, 16)}…)`);