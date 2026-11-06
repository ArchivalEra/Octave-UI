// public/bridge/assets-loader.js 的站点级 / lane 级 base 分离判据。
// 2026-11-06 真站线上失败：createOctaveAssets 收到的 base 是引擎产物 base
// (`/repo/Octave/lanes/wasm32-final/`)，catalog() 却用它去取站点级
// `assets/forge-catalog.json` ⇒ /repo/Octave/lanes/wasm32-final/assets/... 404
// ⇒ 「编译失败：读不到 Forge 货架」。这是「能编过 ≠ 能用」纪律 3 的反例：
// 770 个 vitest 用例与票 B/C/E/F 真浏览器都没对准这条探针面。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';

const loader = readFileSync(
  fileURLToPath(new NodeURL('../../public/bridge/assets-loader.js', import.meta.url)),
  'utf-8',
);

/** 只看代码行（注释里记「为什么」不算实现） */
const codeOnly = (s: string) =>
  s.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

describe('bridge 站点级资产必须走站点根（线上 404 回归锁）', () => {
  it('★ withSiteBase / siteRoot 存在，且 fetchJSON/fetchBinary 有 siteLevel 分支', () => {
    const code = codeOnly(loader);
    expect(code).toMatch(/function\s+siteRoot\(\)/);
    expect(code).toMatch(/function\s+withSiteBase\(/);
    expect(code).toMatch(/function\s+fetchJSON\(url,\s*siteLevel\)/);
    expect(code).toMatch(/function\s+fetchBinary\(url,\s*siteLevel\)/);
    expect(code).toMatch(/siteLevel\s*\?\s*withSiteBase\(url\)\s*:\s*withBase\(url\)/);
  });

  it('★ 所有站点级裸路径都显式标了 true（漏一个就是下一次 404）', () => {
    const code = codeOnly(loader);
    const siteLevelPaths = [
      'assets/forge-catalog.json',
      'assets/llvm/manifest.json',
      'assets/llvm/config.h.json',
      'assets/pkg-module-table.json',
      'assets/octinc/octave-headers.tar.gz',
    ];
    for (const p of siteLevelPaths) {
      // 只数 fetchJSON/fetchBinary 调用里的路径；其它字符串字面量（例如传给
      // compile-worker.mjs 的 octincTarUrl）解析基准不同，不在本判据面内。
      const esc = p.replace(/[.]/g, '\\.');
      const called = (code.match(new RegExp(`(fetchJSON|fetchBinary)\\(\\s*['"]${esc}['"]`, 'g')) || []).length;
      const marked = (code.match(new RegExp(`(fetchJSON|fetchBinary)\\(\\s*['"]${esc}['"]\\s*,\\s*true\\)`, 'g')) || []).length;
      expect(called, `${p} 没有 fetch 调用`).toBeGreaterThan(0);
      expect(marked, `${p} 有 ${called - marked} 处 fetch 调用未标 true`).toBe(called);
    }
  });

  it('★ lane 级 MANIFEST_URL 不许被标 true（否则引擎清单也会 404）', () => {
    const code = codeOnly(loader);
    expect(code).toMatch(/fetchJSON\(url \|\| MANIFEST_URL\)/);
    expect(code).not.toMatch(/fetchJSON\(url \|\| MANIFEST_URL,\s*true\)/);
  });

  it('★ siteRoot 从 lane base 剥出站点根，而不是硬编码 /repo/Octave/', () => {
    const code = codeOnly(loader);
    expect(code).toMatch(/replace\(\/lanes\\\/\[\^\/\]\+\\\/\?\$\/,\s*''\)/);
    expect(code).not.toMatch(/siteRoot[\s\S]{0,120}\/repo\/Octave\//);
  });
});
