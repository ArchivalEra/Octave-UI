// tests/storage/productionWiring.test.ts
// ★ 2026-11-07 判据迁移（replace, don't layer）：旧文件是 8 条 `readFileSync`
//   正则钉「旧装配形状」的静态锁（__octaveDownloadedBytes / __octaveLlvmReady =
//   () => packageManagerPlugin.hasLLVM() / setMslDownloadedAsset 三件套 …），
//   那些名字在彻底重写后全部不存在。按 DEEPENING「接口即测试面」重写为
//   **跨接口行为用例**：组合根真的把投影层 / Vault / Market 接起来了吗？
//
// 站点契约（README.md:28-29）仍锁：下载（写 OPFS）与装载（只读盘）彻底解耦，
// 装载期零网络，绝不现场从 release 装配。

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../..');
function readSource(rel: string): string {
  return readFileSync(resolve(ROOT, rel), 'utf8');
}
/** 只取代码行（注释里提到旧名字是教育性的，不算违规）。 */
function codeOnly(src: string): string {
  return src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*|<!--)/.test(l)).join('\n');
}

describe('★ 生产可达性：组合根真的把两个深模块接起来了', () => {
  it('appContext 装配了契约投影层（bindProjection + projectContract）', () => {
    const src = readSource('src/modules/appContext.ts');
    expect(src).toContain('bindProjection(projectContract(');
    expect(src).toContain("import { LANE_PRODUCT } from './engine/laneProducts'");
  });

  it('appContext 装配了 Vault 与 Market，且注入 packageManagerPlugin', () => {
    const src = readSource('src/modules/appContext.ts');
    expect(src).toContain('new Vault({');
    expect(src).toContain('new Market({ vault: v, runtime }');
    expect(src).toContain('packageManagerPlugin.setMarket(m)');
    expect(src).toContain('packageManagerPlugin.setVault(v)');
  });

  it('★ 三路同轴：两个 window 谓词都是 async，且真源是 Vault / 契约投影', () => {
    const src = codeOnly(readSource('src/modules/appContext.ts'));
    expect(src).toContain('__octaveLoadBytes = async');
    expect(src).toContain('__octaveLlvmReady = async');
    expect(src).toContain('__octaveNeedsCompile');
    expect(src).toContain('vault.read(id)');
    expect(src).toContain('vault.reconcile(id)');
    // 旧同步 peek 断点不可回潮
    expect(src).not.toContain('__octaveDownloadedBytes');
    expect(src).not.toContain('() => packageManagerPlugin.hasLLVM()');
  });

  it('★ bridge install() 必须 await 字节来源（旧 Promise/同步读断点不回潮）', () => {
    const bridge = codeOnly(readSource('public/bridge/assets-loader.js'));
    expect(bridge).toContain('__octaveLoadBytes');
    expect(bridge).toContain("Promise.resolve().then(function () { return global.__octaveLoadBytes(p); })");
    expect(bridge).toContain("source: 'opfs-download'");
    // __forge_install__ 调用形状逐字保留
    expect(bridge).toContain("__forge_install__ ('\" + tar + \"', '\" + p.name + \"', '/usr/src/octave/m/forge');");
    expect(bridge).not.toContain('__octaveDownloadedBytes');
    expect(bridge).not.toContain("content.indexOf('src') >= 0");
  });

  it('★ 下载/装载解耦：MSL 装载经 Vault.read，零网络、不现场装配', () => {
    const src = readSource('src/modules/appContext.ts');
    expect(src).toContain('setMslDownloadedAsset(async (pkg) =>');
    expect(src).toContain('vault.read(id)');
    expect(src).not.toContain('downloadStore.stat(rec.ref)');
    expect(src).not.toContain('fetchReleaseAssetBytes');
    expect(src).not.toContain("kind: 'src', arch: null");
  });

  it('★ 零手写选项：市场消费面只经 readProjection()/axisValues()，无枚举字面量', () => {
    const ui = readSource('src/components/PackageManagerModal.svelte');
    expect(ui).toContain('refreshContractAxes()');
    expect(ui).toContain('axisValues(');
    expect(ui).not.toContain("$state<'all' | 'octave' | 'omc'>");
    expect(ui).not.toContain("name === 'llvm-wasm'");
  });

  it('★ 两条 releaseSource 缝共享同一份 fzstd loader 单例', () => {
    const src = readSource('src/modules/appContext.ts');
    const defs = src.match(/createBrowserFzstdLoader\(/g) ?? [];
    expect(defs.length).toBe(1);
    const uses = src.match(/hasZstd:\s*\(\)\s*=>\s*getFzstdLoaderForReleases\(\)\.isUsable\(\)/g) ?? [];
    expect(uses.length).toBeGreaterThanOrEqual(2);
    expect(src).toContain('getDeployment().siteBase');
    expect(src).not.toContain('function getSiteBase');
  });

  it('★ w64 车道先查 w64/ 子目录（引擎契约顺序即优先级）', () => {
    const lp = readSource('src/modules/engine/laneProducts.ts');
    const masterBlock = lp.slice(lp.indexOf('master:'), lp.indexOf('IllegalPerformance:'));
    expect(masterBlock).toMatch(/siteFolders:\s*\[\s*'lanes\/master\/w64'/);
  });

  it('★ 引擎缝共用具名单例（不再两份 catalogue 缓存）', () => {
    const src = readSource('src/modules/appContext.ts');
    expect(src).toContain('const engineReleaseSource = createCatalogueEngineReleaseSource(');
    expect((src.match(/createCatalogueEngineReleaseSource\(/g) ?? []).length).toBe(1);
    expect(src).toContain('engineReleaseSource,');
  });

  it('★ KNOWN 表不再含 LLVM 陈旧 sha（三套互斥 sha 断点不回潮）', () => {
    const dl = codeOnly(readSource('src/modules/storage/DownloadStore.ts'));
    expect(dl).not.toContain('cd6450fe7944875cb39f8e4a0790d5a08e032044f1db89054dadcabb749b20ce');
    expect(dl).not.toContain('KNOWN_RUNTIME_METADATA');
  });
});

describe('反模式不许回潮', () => {
  it('`hasZstd ?? true` 不许出现在任何发布源', () => {
    const codeOnly = (src: string) =>
      src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
    for (const f of ['src/modules/storage/catalogueReleaseSource.ts', 'src/modules/engine/engineReleaseSource.ts']) {
      expect(codeOnly(readSource(f)), `${f}`).not.toMatch(/hz\s*\?\?\s*true/);
    }
  });

  it('fzstd 不许回到打包图', () => {
    const ca = readSource('src/modules/storage/chunkAssembler.ts')
      .split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
    expect(ca).not.toMatch(/import\(\s*['"]fzstd['"]\s*\)/);
  });

  it('引擎缝不许再写 `hz ?? true`', () => {
    expect(readSource('src/modules/engine/engineReleaseSource.ts')).toMatch(/hz\s*\?\?\s*false/);
  });
});
