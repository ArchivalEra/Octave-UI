// tests/engine/laneSizes.test.ts — 车道体量真源缝（fix/lane-sizes；fix/omc-display 扩 OMC）
//
// 真源裁定：构建期注入 __LANE_SIZES__（astro.config.mjs → scripts/lane-sizes.mjs
// 读 public/lanes/*/octave.build.json 的 measured.files 求和；omc 键 = public/omc/
// 下载闭包 wasm+js 两件真实字节和）。本文件钉四件事：
//   1. 求和纯函数的形状契约（读不出真值 ⇒ null，不猜）；
//   2. 注入缝的行为契约：真源变 ⇒ 取值变；真源缺失 ⇒ null；
//   3. OMC 闭包读取器契约（两件齐 ⇒ 和；缺一件 / 目录缺 ⇒ null，不许部分和冒充）；
//   4. 静态反向断言：组件里编造的体量字面量不得复活（对修复前代码红——
//      旧组件写死 ~39.3/~40.7/~74.6 MB，见 git 16d5bf2 的 BootModal/HeaderBar）。
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { sumMeasuredFiles, readLaneSizes, readOmcSize, OMC_CLOSURE_FILES } from '../../scripts/lane-sizes.mjs';
import {
  formatAssetSize,
  getLaneSizeBytes,
  setLaneSizeBytes,
} from '../../src/modules/engine/laneSizes';
import { i18n, t } from '../../src/modules/i18n/I18nManager.svelte';

// 真源实测形状：复跑（需已跑 sync-lanes 的检出，如宿主仓）：
//   python3 -c "import json;print(sum(v['bytes'] for v in json.load(open('public/lanes/wasm32-final/octave.build.json'))['measured']['files'].values()))"
//   ⇒ 39807224（2026-10-28 实测；三车道同值——见 grilling Q10）
const REAL_SHAPE_BUILD = {
  measured: {
    files: {
      'octave.wasm': { bytes: 29632229, sha256: 'aa'.repeat(32) },
      'octave.js': { bytes: 462821, sha256: 'bb'.repeat(32) },
      'octave.data': { bytes: 9712174, sha256: 'cc'.repeat(32) },
    },
  },
};

describe('sumMeasuredFiles（octave.build.json → 字节和）', () => {
  it('实测形状 ⇒ 三件求和 39807224（与真源一致）', () => {
    expect(sumMeasuredFiles(REAL_SHAPE_BUILD)).toBe(39807224);
  });

  it('缺 measured / 缺 files / files 为空 ⇒ null（不编 0）', () => {
    expect(sumMeasuredFiles(null)).toBeNull();
    expect(sumMeasuredFiles({})).toBeNull();
    expect(sumMeasuredFiles({ measured: {} })).toBeNull();
    expect(sumMeasuredFiles({ measured: { files: {} } })).toBeNull();
  });

  it('bytes 非法（字符串 / 负数 / NaN / 缺项）⇒ null（形状坏 = 没有真值）', () => {
    expect(sumMeasuredFiles({ measured: { files: { a: { bytes: '123' } } } })).toBeNull();
    expect(sumMeasuredFiles({ measured: { files: { a: { bytes: -1 } } } })).toBeNull();
    expect(sumMeasuredFiles({ measured: { files: { a: { bytes: Number.NaN } } } })).toBeNull();
    expect(sumMeasuredFiles({ measured: { files: { a: {} } } })).toBeNull();
    expect(sumMeasuredFiles({ measured: { files: [1, 2] } })).toBeNull();
  });
});

describe('readLaneSizes（发现式扫描 public/lanes/ 下各车道）', () => {
  it('有效车道 ⇒ 求和；build.json 坏 ⇒ null；目录缺 ⇒ {}（全显式降级）', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'lane-sizes-'));
    try {
      const lanesDir = path.join(root, 'public', 'lanes');
      const good = path.join(lanesDir, 'wasm32-final');
      const bad = path.join(lanesDir, 'master');
      mkdirSync(good, { recursive: true });
      mkdirSync(bad, { recursive: true });
      writeFileSync(path.join(good, 'octave.build.json'), JSON.stringify(REAL_SHAPE_BUILD));
      writeFileSync(path.join(bad, 'octave.build.json'), '{ "measured": { "files": {} } }');

      const sizes = readLaneSizes(root);
      expect(sizes['wasm32-final']).toBe(39807224);
      expect(sizes['master']).toBeNull();
      expect(Object.keys(sizes).sort()).toEqual(['master', 'wasm32-final']);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('lanes 目录不存在（裸仓）⇒ 空表', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'lane-empty-'));
    try {
      expect(readLaneSizes(root)).toEqual({});
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('readOmcSize（public/omc/ 下载闭包两件真实字节和，fix/omc-display）', () => {
  // 结案真值形状：闭包 = OMC_CLOSURE_FILES 两件（与 DownloadStore.resolveEngineTarget
  // 同名单）。复跑（wasm 在场的检出）：
  //   python3 -c "import os;print(sum(os.stat('public/omc/'+n).st_size for n in ['OpenModelicaCompiler_bg.wasm','OpenModelicaCompiler.js']))"
  //   ⇒ 74635990（commit bf0c9e4 结案；= KNOWN_ENGINE_METADATA['omc'].files 求和）
  function makeOmcRoot(sizes: Record<string, number | null>): string {
    const root = mkdtempSync(path.join(tmpdir(), 'omc-size-'));
    const omcDir = path.join(root, 'public', 'omc');
    mkdirSync(omcDir, { recursive: true });
    for (const [name, size] of Object.entries(sizes)) {
      if (size === null) continue; // null = 该件缺（不写文件）
      writeFileSync(path.join(omcDir, name), Buffer.alloc(size, 0));
    }
    return root;
  }

  it('两件齐 ⇒ 真实字节求和；真源值变（wasm 字节变）⇒ 求和跟着变', () => {
    let root = makeOmcRoot({ 'OpenModelicaCompiler_bg.wasm': 100, 'OpenModelicaCompiler.js': 23 });
    try {
      expect(readOmcSize(root)).toBe(123);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
    // 真源变 ⇒ 显示源跟着变（反断言：注入值是测出来的，不是常数）
    root = makeOmcRoot({ 'OpenModelicaCompiler_bg.wasm': 200, 'OpenModelicaCompiler.js': 23 });
    try {
      expect(readOmcSize(root)).toBe(223);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('缺任一件（wasm 缺 / js 缺）⇒ null（缺一件 = 没有完整闭包真值，不许部分和冒充）', () => {
    for (const partial of [
      { 'OpenModelicaCompiler_bg.wasm': 100 },
      { 'OpenModelicaCompiler.js': 23 },
    ] as const) {
      const root = makeOmcRoot(partial);
      try {
        expect(readOmcSize(root)).toBeNull();
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }
  });

  it('omc 目录不存在（裸仓）⇒ null；非常规文件（目录占位）⇒ null', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'omc-empty-'));
    try {
      expect(readOmcSize(root)).toBeNull();
      // 目录像（非常规文件）：stat.isFile() 为假 ⇒ null
      mkdirSync(path.join(root, 'public', 'omc', OMC_CLOSURE_FILES[0]), { recursive: true });
      writeFileSync(path.join(root, 'public', 'omc', OMC_CLOSURE_FILES[1]), Buffer.alloc(23, 0));
      expect(readOmcSize(root)).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('注入缝与格式化（显示 = 真源的函数）', () => {
  beforeEach(() => {
    i18n.setLocale('en');
    setLaneSizeBytes({});
  });

  it('真源变 ⇒ getLaneSizeBytes 跟着变', () => {
    setLaneSizeBytes({ 'wasm32-final': 39807224 });
    expect(getLaneSizeBytes('wasm32-final')).toBe(39807224);
    setLaneSizeBytes({ 'wasm32-final': 1234 });
    expect(getLaneSizeBytes('wasm32-final')).toBe(1234);
  });

  it('真源缺失（不在表 / 表为 null）⇒ null，绝不编数', () => {
    setLaneSizeBytes({ master: null });
    expect(getLaneSizeBytes('wasm32-final')).toBeNull();
    expect(getLaneSizeBytes('master')).toBeNull();
  });

  it('formatAssetSize：字节 → ~N.N MB（口径 = PackageManagerModal，1 MB = 1024²）', () => {
    expect(formatAssetSize(39807224, t)).toBe('~38.0 MB');
    expect(formatAssetSize(1024 * 1024, t)).toBe('~1.0 MB');
  });

  it('formatAssetSize：非法值（null / 负数）⇒ 显式降级文案，无 MB 无 ~', () => {
    for (const bad of [null, -1, Number.NaN]) {
      const s = formatAssetSize(bad as any, t);
      expect(s).toBe(t('common.asset_size_unavailable'));
      expect(s).not.toMatch(/MB/);
      expect(s).not.toContain('~');
    }
  });

  it('三语降级文案随 locale 切换（en / zh-Hans / de）', () => {
    i18n.setLocale('en');
    expect(t('common.asset_size_unavailable')).toBe('Size data not available');
    i18n.setLocale('zh-Hans');
    expect(t('common.asset_size_unavailable')).toBe('体量数据缺失');
    i18n.setLocale('de');
    expect(t('common.asset_size_unavailable')).toBe('Größendaten nicht verfügbar');
  });
});

describe('静态反向断言：编造的体量字面量不得复活', () => {
  // 与 zreflect/check_i18n.py 同款去注释（HTML / 块 / 行注释）——注释里**提到**
  // 退役值不算复活，模板与脚本里的真字面量才算。
  function stripComments(src: string): string {
    return src
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .map((l) => l.replace(/\/\/.*$/, ''))
      .join('\n');
  }
  const bootSrc = stripComments(readFileSync(path.resolve(process.cwd(), 'src/components/BootModal.svelte'), 'utf8'));
  const headerSrc = stripComments(readFileSync(path.resolve(process.cwd(), 'src/components/HeaderBar.svelte'), 'utf8'));
  const MB_LITERAL = /~\d+(?:\.\d+)?\s*MB/g;

  it('退役的编造值 ~39.3 / ~40.7 / ~74.6 在两个组件里出现 0 次（对修复前代码必红）', () => {
    for (const [name, src] of [['BootModal', bootSrc], ['HeaderBar', headerSrc]] as const) {
      expect(src, name).not.toContain('~39.3');
      expect(src, name).not.toContain('~40.7');
      expect(src, name).not.toContain('~74.6');
    }
  });

  it('组件必须经注入缝取值（getLaneSizeBytes 出现在两个组件源里）', () => {
    expect(bootSrc).toContain('getLaneSizeBytes');
    expect(headerSrc).toContain('getLaneSizeBytes');
  });

  it('OMC 档必须走同一缝（getLaneSizeBytes(\'omc\') 在 HeaderBar 源里）', () => {
    expect(headerSrc).toContain("getLaneSizeBytes('omc')");
  });

  it('两个组件的体量字面量 = 0（~74.6MB 遗留已退役，fix/omc-display）', () => {
    expect(bootSrc.match(MB_LITERAL)).toBeNull();
    expect(headerSrc.match(MB_LITERAL)).toBeNull();
  });
});
