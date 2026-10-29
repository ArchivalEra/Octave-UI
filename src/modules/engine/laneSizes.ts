// src/modules/engine/laneSizes.ts — 车道体量的运行期缝（fix/lane-sizes；fix/omc-display 扩 OMC）
// Copyright (C) 2026 ArchivalEra
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// ── 真源与注入 ───────────────────────────────────────────────────────────────
// 真源 = 各车道 octave.build.json 的 measured.files 字节和（与 DownloadStore 下载
// 记账同裁定，scripts/lane-sizes.mjs 头注有完整证据链）+ omc 键 = 下载闭包两件
// （wasm+js）真实字节和（同文件头注「OMC 档」节）。astro.config.mjs 在构建期
// 经 vite define 注入 `__LANE_SIZES__`（Record<lane, bytes | null>）；运行期零网络
// 依赖——用户断网时值仍在。
//
// ── 降级契约（不许编数）─────────────────────────────────────────────────────
// 注入缺失 / 该车道不在注入表 / 注入值 null ⇒ getLaneSizeBytes 返回 null，
// formatAssetSize 显示显式的「体量数据缺失」文案。任何分支都不许退回编造数字。
//
// ── 注入缝 ──────────────────────────────────────────────────────────────────
// setLaneSizeBytes 供测试替换真源（组件测试用它证明「显示是真源的函数，不是常量」）。
// 组件只准经 getLaneSizeBytes + formatAssetSize 取值，源码里不许再出现体量字面量
// ——tests/engine/laneSizes.test.ts 有静态反向断言守这条。

import type { TranslateFn } from '../i18n/types';

export type LaneSizeBytes = number | null;

// 构建期注入（astro.config.mjs vite.define）。测试/裸构建下未注入 ⇒ 空表（全 null）。
declare const __LANE_SIZES__: Record<string, LaneSizeBytes> | undefined;

function injectedSizes(): Record<string, LaneSizeBytes> {
  try {
    return typeof __LANE_SIZES__ === 'undefined' ? {} : __LANE_SIZES__;
  } catch {
    return {};
  }
}

let laneSizes: Record<string, LaneSizeBytes> = injectedSizes();

/** 测试缝：整体替换注入表（构建期注入在模块求值时已生效，运行期不调它）。 */
export function setLaneSizeBytes(next: Record<string, LaneSizeBytes>): void {
  laneSizes = { ...next };
}

/**
 * 车道 → 字节数。表里没有该车道，或真源本身缺失（null）⇒ 返回 null。
 * 「键存在但值 null」与「键不存在」在显示层同样走显式降级，不区分。
 */
export function getLaneSizeBytes(lane: string): LaneSizeBytes {
  return Object.prototype.hasOwnProperty.call(laneSizes, lane) ? laneSizes[lane] : null;
}

/**
 * 体量显示格式化（全站唯一入口）：字节 → 「~N.N MB」文案。
 * 口径与 PackageManagerModal 的包体量一致：1 MB = 1024 × 1024，一位小数。
 * bytes 非法（null / 负数 / 非有限数）⇒ 显式降级文案——不编数、不显示 0。
 */
export function formatAssetSize(bytes: LaneSizeBytes, t: TranslateFn): string {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) {
    return t('common.asset_size_unavailable');
  }
  return t('common.asset_size_mb', { mb: (bytes / (1024 * 1024)).toFixed(1) });
}
