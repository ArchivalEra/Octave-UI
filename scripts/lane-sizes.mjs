// scripts/lane-sizes.mjs — 车道体量构建期读取器（fix/lane-sizes 真源裁定）
// Copyright (C) 2026 ArchivalEra
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// ── 真源是谁，为什么 ─────────────────────────────────────────────────────────
// 真源 = 每车道 `public/lanes/<lane>/octave.build.json` 的 `measured.files[*].bytes`
// 求和。裁定理由（fix/lane-sizes，2026-10-28）：
//   1. 下载路径早已用它当记账真源：DownloadStore 的 Octave 分支按
//      `measured.files` 累加 totalBytes（源内「#7 裁定维持」注释）——显示与
//      下载配额/checkQuota 走同一个判断，不新增第二产地。
//   2. catalog（forge-catalog.json）里**没有**三个 Octave 车道的条目——
//      「运行期读 catalog size 字段」无源可读，等于要现编数据。
//   3. 用户离线时 build.json 注入值仍在（构建期定死，零运行期网络依赖）；
//      而 catalog 是运行期 fetch，断网 ⇒ 无值可显。
//
// ── 降级契约（不许编数）────────────────────────────────────────────────────
// 车道目录被 .gitignore 排除（二进制不入库），由 scripts/sync-lanes.sh 在构建前
// 同步进 public/lanes/（pages.yml 同款顺序：先同步引擎树、后 pnpm build）。
// 读不到（裸仓 / 车道未同步 / build.json 损坏或形状不对）⇒ 该车道值 = null，
// UI 经 formatAssetSize 显式显示「体量数据缺失」文案——绝不退回任何编造的数。
//
// 复跑（显示值 = 真源的实测）：在已跑 sync-lanes 的检出里
//   python3 -c "import json,glob;print({p.split('/')[2]:sum(v['bytes'] for v in json.load(open(p))['measured']['files'].values()) for p in glob.glob('public/lanes/*/octave.build.json')})"
//   ⇒ 三车道同为 39807224（2026-10-28 实测；tests/engine/laneSizes.test.ts 用同一形状钉住）
import fs from 'node:fs';
import path from 'node:path';

/**
 * 纯函数：octave.build.json → measured.files[*].bytes 求和。
 * 形状不对（缺 measured/files、空 files、bytes 非有限非负数）⇒ null——读不出真值就明说，不猜。
 */
export function sumMeasuredFiles(buildJson) {
  const files = buildJson && buildJson.measured && buildJson.measured.files;
  if (!files || typeof files !== 'object' || Array.isArray(files)) return null;
  let total = 0;
  let seen = 0;
  for (const meta of Object.values(files)) {
    if (!meta || typeof meta !== 'object') return null;
    const b = meta.bytes;
    if (typeof b !== 'number' || !Number.isFinite(b) || b < 0) return null;
    total += b;
    seen += 1;
  }
  return seen > 0 ? total : null;
}

/**
 * 发现式扫描：<root>/public/lanes/ 下每个车道目录的 octave.build.json
 * （不加车道名单，目录即车道）。
 * 目录不存在 ⇒ {}（构建期就没有真源）；车道在但 build.json 读不了 ⇒ 该车道 null。
 * 返回 Record<lane, number | null>，由 astro.config.mjs 经 vite define 注入运行期。
 */
export function readLaneSizes(repoRoot, lanesRelDir = path.join('public', 'lanes')) {
  const lanesDir = path.join(repoRoot, lanesRelDir);
  const out = {};
  let entries;
  try {
    entries = fs.readdirSync(lanesDir, { withFileTypes: true }).filter((e) => e.isDirectory());
  } catch {
    return out;
  }
  for (const entry of entries) {
    try {
      const raw = fs.readFileSync(path.join(lanesDir, entry.name, 'octave.build.json'), 'utf8');
      out[entry.name] = sumMeasuredFiles(JSON.parse(raw));
    } catch {
      out[entry.name] = null;
    }
  }
  return out;
}
