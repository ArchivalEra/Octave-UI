// tests/storage/productionWiring.test.ts
// **生产可达性**判据（不是单测，是"产物的装配方式"判据）。
//
// 为什么需要这个文件（2026-11-03 双轴审查抓到的严重失误）：
//   我写了 `engineReleaseSource` 缝、写了 14 条单测、提交信息说"接线完成"——
//   但 `appContext.ts` 里**根本没注入**它，所以生产 `this.engineReleaseSource` 恒 undefined，
//   整条 release 取引擎的路径在产物里**永远走不到**。
//   这正是本仓纪律 3 的原义：「只声明注入面而不接线 = 能编过不能用」。
//
//   单测看不出来：它们都 `new DownloadStore({ engineReleaseSource: fake })` 自己注入。
//   唯一能抓的是**检查真实组合根**。所以这里直接 import appContext。
//
// 复跑：CI=true npx vitest run tests/storage/productionWiring.test.ts

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../..');

function readSource(rel: string): string {
  return readFileSync(resolve(ROOT, rel), 'utf8');
}

describe('生产可达性：组合根真的注入了两条缝', () => {
  it('★ appContext 注入了 engineReleaseSource（否则引擎 release 路径永远走不到）', () => {
    const src = readSource('src/modules/appContext.ts');
    // 必须真的构造并注入，不是只 import
    expect(src).toMatch(/engineReleaseSource\s*:\s*createCatalogueEngineReleaseSource\(/);
    // 且该工厂必须已被 import（否则上面那行不可能通过 tsc，但这里钉住"不是写了个假名"）
    expect(src).toContain('createCatalogueEngineReleaseSource');
  });

  it('★ appContext 注入了 releaseSource（内容侧，既有）', () => {
    const src = readSource('src/modules/appContext.ts');
    expect(src).toMatch(/releaseSource\s*:\s*createCatalogueReleaseSource\(/);
  });

  it('★ 两条缝共享**同一个** fzstd loader 单例（否则会各拉一次，违反"只拉一次"）', () => {
    const src = readSource('src/modules/appContext.ts');
    // 单例定义一次
    const defs = src.match(/const\s+(\w*fzstd\w*)\s*=\s*createBrowserFzstdLoader\(/g) ?? [];
    expect(defs.length).toBe(1);
    const name = defs[0]!.match(/const\s+(\w+)/)![1]!;
    // 两处 hasZstd 都引用它
    const uses = src.match(new RegExp(`hasZstd:\\s*\\(\\)\\s*=>\\s*${name}\\.isUsable\\(\\)`, 'g')) ?? [];
    expect(uses.length).toBe(2);
  });

  it('★ w64 车道的站点候选**先查 w64/ 子目录**（根目录那份是 wasm32 的镜像复制）', () => {
    // 这是生产行为判据：candidateFolders 必须来自 laneProducts，不是手写
    const dl = readSource('src/modules/storage/DownloadStore.ts');
    expect(dl).toContain('LANE_PRODUCT');
    // 且不再手写「根目录优先」的老写法
    expect(dl).not.toMatch(/candidateFolders\.push\(`lanes\/\$\{lane\}`\);\s*\n\s*if \(variant === 'w64'\)/);

    const lp = readSource('src/modules/engine/laneProducts.ts');
    // master / IllegalPerformance 的第一候选必须含 /w64
    const masterBlock = lp.slice(lp.indexOf('master:'), lp.indexOf('IllegalPerformance:'));
    expect(masterBlock).toMatch(/siteFolders:\s*\[\s*'lanes\/master\/w64'/);
  });

  it('★ OMC 走引擎缝（"两个引擎都上 catalogue"）—— 不许在缝之前提前 return', () => {
    const dl = readSource('src/modules/storage/DownloadStore.ts');
    // OMC 分支内部必须调用 tryEngineRelease
    const omcIdx = dl.indexOf("if (ref.name === 'omc' || lane === 'omc')");
    expect(omcIdx).toBeGreaterThan(0);
    const omcBlock = dl.slice(omcIdx, omcIdx + 4000);
    expect(omcBlock).toContain("tryEngineRelease('omc'");
  });
});

describe('反模式不许回潮', () => {
  it('★ `hasZstd ?? true` 不许出现在任何发布源（那是"先白下 zstd 再回落"的谎言）', () => {
    // 只查代码行（注释里提到这个反模式是**教育性**的，不该被当成违规）
    const codeOnly = (src: string) =>
      src
        .split('\n')
        .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
        .join('\n');
    for (const f of ['src/modules/storage/catalogueReleaseSource.ts', 'src/modules/engine/engineReleaseSource.ts']) {
      const src = codeOnly(readSource(f));
      expect(src, `${f} 的代码里出现了 hz ?? true`).not.toMatch(/hz\s*\?\?\s*true/);
    }
  });

  it('★ fzstd 不许回到打包图（必须经 fzstdLoader 的 no-store 路径）', () => {
    // 只查代码行：注释里说明「为什么不能 import('fzstd')」是必要的
    const ca = readSource('src/modules/storage/chunkAssembler.ts')
      .split('\n')
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .join('\n');
    expect(ca).not.toMatch(/import\(\s*['"]fzstd['"]\s*\)/);
  });

  it('★ 引擎缝不许再写一遍 `hz ?? true`', () => {
    const src = readSource('src/modules/engine/engineReleaseSource.ts');
    expect(src).toMatch(/hz\s*\?\?\s*false/);
  });
});
