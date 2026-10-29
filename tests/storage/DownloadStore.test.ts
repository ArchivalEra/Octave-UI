// tests/storage/DownloadStore.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import * as nodePath from 'node:path';
import { DownloadStore, KNOWN_ENGINE_METADATA } from '../../src/modules/storage/DownloadStore';
import { MemoryStore } from '../../src/modules/storage/MemoryStore';
import { MockFetchAdapter } from '../../src/modules/storage/FetchPort';
import { DownloadError, refToKey } from '../../src/modules/storage/downloadTypes';
import type { DownloadRef } from '../../src/modules/storage/downloadTypes';
import type { ForgeCatalog } from '../../src/modules/plugins/package/types';
import { EngineAssetResolver } from '../../src/modules/engine/EngineAssetResolver';
import * as nodeCrypto from 'node:crypto';

// #12 Q12.3：intake 断言只放行真 64hex 指纹 ⇒ 测试里的 catalog/manifest
// sha 一律真算（同 EngineAssetResolver.test.ts 的 sha256OfNode 写法）。
function sha256OfNode(data: string | Uint8Array): string {
  return nodeCrypto.createHash('sha256').update(data).digest('hex');
}

/** 仓根相对路径定位：必须用 node:url 的 URL（happy-dom 把全局 URL 补丁坏了，
 *  相对解析会产 http://localhost/@fs/... 垃圾）；仍失败则退 process.cwd()（vitest 从仓根起跑）。 */
function repoFile(relFromRepoRoot: string): string {
  try {
    return fileURLToPath(new NodeURL(`../../${relFromRepoRoot}`, import.meta.url));
  } catch {
    return nodePath.resolve(process.cwd(), relFromRepoRoot);
  }
}

describe('DownloadStore Deep Module', () => {
  let memoryStore: MemoryStore;
  let mockFetch: MockFetchAdapter;
  let store: DownloadStore;

  const CGI_SHA = sha256OfNode('fake-tarball-cgi');
  const SYMBOLIC_V1_SHA = sha256OfNode('symbolic-v1');
  const SYMBOLIC_V2_SHA = sha256OfNode('symbolic-v2');
  const SIGNAL_W32_SHA = sha256OfNode('oct-32');
  const SIGNAL_W64_SHA = sha256OfNode('oct-64');

  const sampleCatalog: ForgeCatalog = {
    schema: 2,
    octave: '11.3.0',
    packs: [
      {
        name: 'cgi',
        version: '0.1.2',
        size: 1024,
        form: 'pkg',
        content: ['m'],
        versions: [
          {
            version: '0.1.2',
            stage: 'staged',
            form: 'pkg',
            content: ['m'],
            size: 1024,
            sha256: CGI_SHA,
          } as any,
          {
            version: '0.1.0',
            stage: 'withheld',
            withheld_cause: 'bytes-not-staged',
            form: 'pkg',
            content: ['m'],
          },
        ],
      },
      {
        name: 'symbolic',
        version: '3.2.2',
        size: 2048,
        form: 'pkg',
        content: ['m'],
        versions: [
          {
            version: '3.2.2',
            stage: 'staged',
            form: 'pkg',
            content: ['m'],
            size: 2048,
            sha256: SYMBOLIC_V1_SHA,
          } as any,
        ],
      },
      {
        name: 'signal',
        version: '1.4.5',
        size: 4096,
        form: 'pkg',
        content: ['m', 'src'],
        artifacts: [
          {
            arch: 'wasm32',
            version: '1.4.5',
            size: 5000,
            sha256: SIGNAL_W32_SHA,
            files: [{ name: 'signal.oct', size: 5000, sha256: SIGNAL_W32_SHA }],
          },
          {
            arch: 'w64',
            version: '1.4.5',
            size: 6000,
            sha256: SIGNAL_W64_SHA,
            files: [{ name: 'signal.oct', size: 6000, sha256: SIGNAL_W64_SHA }],
          },
        ],
      } as any,
      {
        name: 'llvm-wasm',
        version: '6.0.12',
        size: 34693729,
        sha256: 'cd6450fe7944875cb39f8e4a0790d5a08e032044f1db89054dadcabb749b20ce',
        form: 'tree',
        content: [],
      },
      {
        name: 'pyodide',
        version: '314.0.7',
        size: 22013349,
        form: 'tree',
        content: [],
        url: 'assets/pyodide/pyodide/pyodide.asm.wasm',
        sha256: 'cc36e3cab04fdfc9a63ff13eb52eae2b911bf46c025cc7b281f394bd3de1d5e6',
      },
    ],
  };

  const sampleEngineBuild = {
    measured: {
      files: {
        'octave.js': { sha256: sha256OfNode('js-content'), bytes: 100 },
        'octave.wasm': { sha256: sha256OfNode('wasm-content'), bytes: 500 },
      },
    },
  };

  beforeEach(async () => {
    memoryStore = new MemoryStore();
    await memoryStore.init();
    mockFetch = new MockFetchAdapter();

    store = new DownloadStore({
      storage: memoryStore,
      fetchPort: mockFetch,
      baseUrl: 'https://octave.test',
      catalogProvider: () => sampleCatalog,
      engineBuildProvider: () => sampleEngineBuild,
      laneProvider: () => 'master',
      maxQuotaBytes: 100 * 1024 * 1024, // 100MB
    });
    await store.init();
  });

  it('I4: runs purely in-memory/OPFS without window.Module.FS dependency', () => {
    expect(typeof (globalThis as any).Module).toBe('undefined');
    expect(store.isReady).toBe(true);
  });

  it('I1: resolves SHA256 and target authoritatively from catalog', async () => {
    const ref: DownloadRef = { name: 'cgi', version: '0.1.2', kind: 'src' } as any;
    const url = 'https://octave.test/assets/packages/cgi-0.1.2.tar.gz';
    mockFetch.setFile(url, 'fake-tarball-cgi', CGI_SHA);

    const rec = await store.download(ref);
    expect(rec.ref.name).toBe('cgi');
    // 单文件下载：顶层 sha = 该文件自身指纹（#12 Q12.2）
    expect(rec.sha256).toBe(CGI_SHA);
    expect(rec.files[0].path).toBe('downloads/src/cgi/0.1.2/cgi-0.1.2.tar.gz');

    // 清单存在
    expect(store.has(ref)).toBe(true);
  });

  it('I2: atomic rollback when SHA256 mismatch or write fails', async () => {
    const ref: DownloadRef = { name: 'cgi', version: '0.1.2', kind: 'src' } as any;
    const url = 'https://octave.test/assets/packages/cgi-0.1.2.tar.gz';
    // 伪造错误哈希（仍是合法 64hex 形状——intake 断言放行，校验环拦截）
    mockFetch.setFile(url, 'tampered-data', sha256OfNode('tampered-data'));
    // catalog 声称的指纹与盘上字节不符 ⇒ 校验红
    (sampleCatalog.packs[0].versions![0] as any).sha256 = sha256OfNode('fake-tarball-cgi-X');

    await expect(store.download(ref)).rejects.toThrow(DownloadError);
    await expect(store.download(ref)).rejects.toMatchObject({
      code: 'STORAGE_WRITE_FAILED',
    });

    // 恢复 catalog 指纹供后续用例复用
    (sampleCatalog.packs[0].versions![0] as any).sha256 = CGI_SHA;

    // 确认清单中没有任何残留记录 (I2)
    expect(store.has(ref)).toBe(false);
    const snap = await store.index();
    expect(snap.count).toBe(0);
  });

  it('I3: idempotency on unchanged SHA and drift detection when SHA changes', async () => {
    const ref: DownloadRef = { name: 'symbolic', version: '3.2.2', kind: 'src' } as any;
    const url = 'https://octave.test/assets/packages/symbolic-3.2.2.tar.gz';
    mockFetch.setFile(url, 'symbolic-v1', SYMBOLIC_V1_SHA);

    const fetchSpy = vi.spyOn(mockFetch, 'fetchBytes');
    const rec1 = await store.download(ref);
    expect(rec1.sha256).toBe(SYMBOLIC_V1_SHA);

    // 第二次复跑：三元组一致，直接返回已存记录——零网络（#12 Q12.1）
    const callsAfterFirst = fetchSpy.mock.calls.length;
    const rec2 = await store.download(ref);
    expect(rec2.sha256).toBe(rec1.sha256);
    expect(rec2.downloadedAt).toBe(rec1.downloadedAt);
    expect(fetchSpy.mock.calls.length).toBe(callsAfterFirst);
    fetchSpy.mockRestore();

    // 模拟远端当日重新发布导致 SHA 漂移（字节变 ⇒ 指纹变）
    (sampleCatalog.packs[1].versions![0] as any).sha256 = SYMBOLIC_V2_SHA;
    mockFetch.setFile(url, 'symbolic-v2', SYMBOLIC_V2_SHA);

    const rec3 = await store.download(ref);
    expect(rec3.sha256).toBe(SYMBOLIC_V2_SHA);
    expect(rec3.bytes).toBe(11);

    // 复原 catalog 供后续用例
    (sampleCatalog.packs[1].versions![0] as any).sha256 = SYMBOLIC_V1_SHA;
  });

  it('I6: maintains independent records for different architectures', async () => {
    const refW32: DownloadRef = { name: 'signal', version: '1.4.5', kind: 'pre', arch: 'wasm32' } as any;
    const refW64: DownloadRef = { name: 'signal', version: '1.4.5', kind: 'pre', arch: 'w64' } as any;

    mockFetch.setFile('https://octave.test/assets/packages/wasm32/signal.oct', 'oct-32', SIGNAL_W32_SHA);
    mockFetch.setFile('https://octave.test/assets/packages/w64/signal.oct', 'oct-64', SIGNAL_W64_SHA);

    const recW32 = await store.download(refW32);
    const recW64 = await store.download(refW64);

    expect(recW32.ref.arch).toBe('wasm32');
    expect(recW64.ref.arch).toBe('w64');
    expect(refToKey(refW32)).not.toBe(refToKey(refW64));

    expect(store.has(refW32)).toBe(true);
    expect(store.has(refW64)).toBe(true);

    const snap = await store.index();
    expect(snap.count).toBe(2);
  });

  it('A5: enforces storage quota and throws STORAGE_QUOTA_EXHAUSTED', async () => {
    const smallStore = new DownloadStore({
      storage: memoryStore,
      fetchPort: mockFetch,
      baseUrl: 'https://octave.test',
      catalogProvider: () => sampleCatalog,
      maxQuotaBytes: 500, // 仅 500 字节
    });
    await smallStore.init();

    // symbolic 预估大小 2048 字节 > 500 字节
    const ref: DownloadRef = { name: 'symbolic', version: '3.2.2', kind: 'src' } as any;
    await expect(smallStore.download(ref)).rejects.toMatchObject({
      code: 'STORAGE_QUOTA_EXHAUSTED',
    });
  });

  it('reconciles stat with disk deletion and cleans up missing records', async () => {
    const ref: DownloadRef = { name: 'cgi', version: '0.1.2', kind: 'src' } as any;
    const url = 'https://octave.test/assets/packages/cgi-0.1.2.tar.gz';
    mockFetch.setFile(url, 'fake-tarball-cgi', CGI_SHA);

    await store.download(ref);
    expect(store.has(ref)).toBe(true);

    // 模拟用户从文件树/OPFS中意外删除了对应文件
    await memoryStore.remove('downloads/src/cgi/0.1.2/cgi-0.1.2.tar.gz');

    // stat 发现文件丢失，自动清理清单并返回 null
    const res = await store.stat(ref);
    expect(res).toBeNull();
    expect(store.has(ref)).toBe(false);
  });

  it('handles 7 closed error codes reliably', async () => {
    // 1. NOT_DOWNLOADED 的语义面（#10 Q10.2：unit() 死接口核销后，未下载态的
    //    observable 行为 = stat 无账对账返回 null + has 为 false——错误码本体
    //    仍在 downloadTypes.ts 的 7 码封闭集里，消费面在装载/对账侧）
    const refUncut: DownloadRef = { name: 'cgi', version: '0.1.2', kind: 'src' } as any;
    expect(await store.stat(refUncut)).toBeNull();
    expect(store.has(refUncut)).toBe(false);

    // 2. VERSION_WITHHELD
    const refWithheld: DownloadRef = { name: 'cgi', version: '0.1.0', kind: 'src' } as any;
    await expect(store.download(refWithheld)).rejects.toMatchObject({ code: 'VERSION_WITHHELD' });

    // 3. FLAVOR_UNAVAILABLE
    const refNoArch: DownloadRef = { name: 'signal', version: '1.4.5', kind: 'pre' } as any;
    await expect(store.download(refNoArch)).rejects.toMatchObject({ code: 'FLAVOR_UNAVAILABLE' });

    // 4. STORAGE_WRITE_FAILED（catalog 指纹与盘上字节不符——校验环拦截）
    const refBad: DownloadRef = { name: 'cgi', version: '0.1.2', kind: 'src' } as any;
    mockFetch.setFile('https://octave.test/assets/packages/cgi-0.1.2.tar.gz', 'bad', sha256OfNode('bad'));
    (sampleCatalog.packs[0].versions![0] as any).sha256 = sha256OfNode('other-bytes');
    await expect(store.download(refBad)).rejects.toMatchObject({ code: 'STORAGE_WRITE_FAILED' });
    (sampleCatalog.packs[0].versions![0] as any).sha256 = CGI_SHA;

    // 5. DOWNLOAD_ABORTED
    const controller = new AbortController();
    controller.abort();
    mockFetch.setFile('https://octave.test/assets/packages/cgi-0.1.2.tar.gz', 'data', sha256OfNode('data'));
    await expect(store.download(refBad, { signal: controller.signal })).rejects.toMatchObject({
      code: 'DOWNLOAD_ABORTED',
    });

    // 6. INDEX_UNREADABLE
    const brokenStore = new DownloadStore({
      storage: memoryStore,
      fetchPort: mockFetch,
      baseUrl: 'https://octave.test',
      catalogProvider: async () => {
        throw new Error('Network error loading catalog');
      },
    });
    await expect(brokenStore.download(refBad)).rejects.toMatchObject({ code: 'INDEX_UNREADABLE' });

    // 7. STORAGE_QUOTA_EXHAUSTED
    const quotaCheck = await store.checkQuota(200 * 1024 * 1024); // 200MB > 100MB
    expect(quotaCheck.ok).toBe(false);
  });

  it('supports decoupled engine download and multi-engine coexistence in OPFS', async () => {
    // 1. 下载 Octave 引擎档 (master)
    //    #6 起引擎下载是「五件套」：build/manifest 两件也随档抓取（sha256: undefined 走 intake 守卫跳过校验）
    mockFetch.setFile('https://octave.test/lanes/master/octave.js', 'js-content', sha256OfNode('js-content'));
    mockFetch.setFile('https://octave.test/lanes/master/octave.wasm', 'wasm-content', sha256OfNode('wasm-content'));
    mockFetch.setFile('https://octave.test/lanes/master/octave.build.json', '{}', sha256OfNode('{}'));
    mockFetch.setFile('https://octave.test/lanes/master/assets/manifest.json', '{}', sha256OfNode('{}'));

    expect(store.isEngineDownloaded('master')).toBe(false);
    const recOctave = await store.downloadEngine('master');
    expect(recOctave.ref.kind).toBe('engine');
    expect(recOctave.ref.name).toBe('octave');
    expect(recOctave.ref.arch).toBe('master');
    // 多文件下载：顶层 sha = undefined（#12 Q12.2——无聚合指纹，对账走 files[]）
    expect(recOctave.sha256).toBeUndefined();
    expect(recOctave.files.every((f) => /^[0-9a-f]{64}$/.test(f.sha256))).toBe(true);
    expect(store.isEngineDownloaded('master')).toBe(true);

    // 2. 同时下载 OpenModelica 第二引擎档 (omc)
    mockFetch.setFile('https://octave.test/omc/OpenModelicaCompiler_bg.wasm', 'omc-wasm', '8287589ebdb53b4cc37c337c2ae88f798d8889f7ac3c29d693ca12e539b8d001');
    mockFetch.setFile('https://octave.test/omc/OpenModelicaCompiler.js', 'omc-js', '56c399bd455d57c8e21206287445643b81db6fd4e3ac183989616b903d165f17');

    expect(store.isEngineDownloaded('omc')).toBe(false);
    const recOmc = await store.downloadEngine('omc');
    expect(recOmc.ref.kind).toBe('engine');
    expect(recOmc.ref.name).toBe('omc');
    // omc 也是两件套（多文件）⇒ 顶层 sha = undefined（#12 Q12.2）
    expect(recOmc.sha256).toBeUndefined();
    expect(recOmc.files.length).toBe(2);
    expect(store.isEngineDownloaded('omc')).toBe(true);

    // 3. 两档引擎独立保存在 OPFS 清单中
    const snap = await store.index();
    expect(snap.count).toBe(2);
    expect(store.getEngineRecord('master')).not.toBeNull();
    expect(store.getEngineRecord('omc')).not.toBeNull();

    // 4. 手动移除单个引擎不影响另一档
    await store.removeEngine('omc');
    expect(store.isEngineDownloaded('omc')).toBe(false);
    expect(store.isEngineDownloaded('master')).toBe(true);
  });

  it('resolves octave.build.json from candidate fallback when lanes/<lane> is absent (host-007)', async () => {
    // 模拟无 engineBuildProvider，且 lanes/wasm32-final 不存在，直接部署在站点根目录 <site>/octave.build.json
    const rootEngineBuild = {
      measured: {
        files: {
          'octave.js': { sha256: sha256OfNode('root-js'), bytes: 120 },
          'octave.wasm': { sha256: sha256OfNode('root-wasm'), bytes: 600 },
        },
      },
    };

    const rootFetch = new MockFetchAdapter();
    rootFetch.setJSON('https://octave.test/octave.build.json', rootEngineBuild);
    rootFetch.setFile('https://octave.test/octave.js', 'root-js', sha256OfNode('root-js'));
    rootFetch.setFile('https://octave.test/octave.wasm', 'root-wasm', sha256OfNode('root-wasm'));
    // #6 五件套 +2：部署在站点根目录的两件清单（chosenFolder='' ⇒ url 无前缀）
    rootFetch.setFile('https://octave.test/octave.build.json', 'root-build', sha256OfNode('root-build'));
    rootFetch.setFile('https://octave.test/assets/manifest.json', 'root-assets', sha256OfNode('root-assets'));

    const realStore = new DownloadStore({
      storage: memoryStore,
      fetchPort: rootFetch,
      baseUrl: 'https://octave.test',
    });
    await realStore.init();

    const rec = await realStore.downloadEngine('wasm32-final');
    expect(rec.ref.arch).toBe('wasm32-final');
    // #6 五件套：两件核心 (10+6) + 两件清单 ('root-build' 11 + 'root-assets' 12) = 37
    expect(rec.bytes).toBe(37);
    expect(realStore.isEngineDownloaded('wasm32-final')).toBe(true);
    // 五件套记账面：js/wasm/build/assets-manifest（平铺名）四条全落 downloads/engine/wasm32-final/w32/
    const paths = rec.files.map((f: { path: string }) => f.path);
    expect(paths).toContain('downloads/engine/wasm32-final/w32/octave.build.json');
    expect(paths).toContain('downloads/engine/wasm32-final/w32/assets-manifest.json');
  });

  it('rejects HTML responses with clear INDEX_UNREADABLE error rather than naked JSON.parse error', async () => {
    const htmlFetch = new MockFetchAdapter();
    htmlFetch.setError('https://octave.test/lanes/wasm32-final/octave.build.json', new Error('Expected JSON response, received HTML'));
    htmlFetch.setError('https://octave.test/octave.build.json', new Error('Expected JSON response, received HTML'));

    const htmlStore = new DownloadStore({
      storage: memoryStore,
      fetchPort: htmlFetch,
      baseUrl: 'https://octave.test',
    });
    await htmlStore.init();

    await expect(htmlStore.downloadEngine('wasm32-final')).rejects.toMatchObject({
      code: 'INDEX_UNREADABLE',
    });
  });

  it('resolves runtime target with direct url and wasm filename when specified in catalog', async () => {
    const ref: DownloadRef = { name: 'pyodide', version: '314.0.7', kind: 'runtime' } as any;
    const url = 'https://octave.test/assets/pyodide/pyodide/pyodide.asm.wasm';
    const sha = 'cc36e3cab04fdfc9a63ff13eb52eae2b911bf46c025cc7b281f394bd3de1d5e6';
    mockFetch.setFile(url, 'wasm-data-pyodide', sha);

    const rec = await store.download(ref);
    expect(rec.ref.name).toBe('pyodide');
    // 单文件下载：顶层 sha = 该文件自身指纹（#12 Q12.2）
    expect(rec.sha256).toBe(sha);
    expect(rec.files[0].path).toBe('downloads/runtime/pyodide/314.0.7/pyodide.asm.wasm');
    expect(store.has(ref)).toBe(true);
  });

  // ══ #12 Q12.5：sha 台账去装饰化的判据面 ═══════════════════════════════

  it('#12 Q12.3: rejects 128hex concatenated sha in items with INDEX_UNREADABLE', async () => {
    // mock catalog 给 omc 条目带 128hex 拼接串（顶层聚合 sha 的旧装饰形状）
    const badOmcCatalog: ForgeCatalog = {
      packs: [
        {
          name: 'omc',
          version: '1.25.0',
          form: 'tree',
          content: [],
          files: {
            'OpenModelicaCompiler_bg.wasm': {
              bytes: 12000,
              sha256: '8287589ebdb53b4cc37c337c2ae88f798d8889f7ac3c29d693ca12e539b8d00156c399bd455d57c8e21206287445643b81db6fd4e3ac183989616b903d165f17',
            },
            'OpenModelicaCompiler.js': { bytes: 345, sha256: sha256OfNode('omc-js') },
          },
        } as any,
      ],
    };
    const badStore = new DownloadStore({
      storage: memoryStore,
      fetchPort: mockFetch,
      baseUrl: 'https://octave.test',
      catalogProvider: () => badOmcCatalog,
    });
    await badStore.init();

    await expect(badStore.downloadEngine('omc')).rejects.toMatchObject({
      code: 'INDEX_UNREADABLE',
    });
  });

  it('#12 Q12.3: rejects empty-string sha in items with INDEX_UNREADABLE', async () => {
    // 空 sha（有值但不是 64hex）⇒ 同一出口断言拦下
    const emptyShaCatalog: ForgeCatalog = {
      packs: [
        {
          name: 'omc',
          version: '1.25.0',
          form: 'tree',
          content: [],
          files: {
            'OpenModelicaCompiler_bg.wasm': { bytes: 12000, sha256: sha256OfNode('omc-wasm') },
            'OpenModelicaCompiler.js': { bytes: 345, sha256: '' },
          },
        } as any,
      ],
    };
    const emptyStore = new DownloadStore({
      storage: memoryStore,
      fetchPort: mockFetch,
      baseUrl: 'https://octave.test',
      catalogProvider: () => emptyShaCatalog,
    });
    await emptyStore.init();

    await expect(emptyStore.downloadEngine('omc')).rejects.toMatchObject({
      code: 'INDEX_UNREADABLE',
    });
  });

  it('#12 Q12.3: rejects non-hex sha and uppercase hex with INDEX_UNREADABLE (intake 只认小写 64hex)', async () => {
    // 大写 hex 也是坏形状（断言是 ^[0-9a-f]{64}$ 逐字判）
    const upperCatalog: ForgeCatalog = {
      packs: [
        {
          name: 'omc',
          version: '1.25.0',
          form: 'tree',
          content: [],
          files: {
            'OpenModelicaCompiler_bg.wasm': { bytes: 12000, sha256: sha256OfNode('omc-wasm').toUpperCase() },
            'OpenModelicaCompiler.js': { bytes: 345, sha256: sha256OfNode('omc-js') },
          },
        } as any,
      ],
    };
    const upperStore = new DownloadStore({
      storage: memoryStore,
      fetchPort: mockFetch,
      baseUrl: 'https://octave.test',
      catalogProvider: () => upperCatalog,
    });
    await upperStore.init();

    await expect(upperStore.downloadEngine('omc')).rejects.toMatchObject({
      code: 'INDEX_UNREADABLE',
    });
  });

  it('#12 Q12.1: idempotent re-download after full five-piece engine download makes zero fetchPort calls (undefined sha skips sha dimension)', async () => {
    // 五件套形状：三条带真 sha 的 items + 两条 sha256: undefined（下载时真算型）。
    // 第一次下载记账 files[] 五条全存真算 sha；第二次 resolved.items 两条 undefined
    // ⇒ 三元组比对跳过 sha 维（只比 path）⇒ 幂等命中 ⇒ fetchPort 调用数 === 0。
    mockFetch.setFile('https://octave.test/lanes/master/octave.js', 'js-content', sha256OfNode('js-content'));
    mockFetch.setFile('https://octave.test/lanes/master/octave.wasm', 'wasm-content', sha256OfNode('wasm-content'));
    mockFetch.setFile('https://octave.test/lanes/master/octave.build.json', '{}', sha256OfNode('{}'));
    mockFetch.setFile('https://octave.test/lanes/master/assets/manifest.json', '{}', sha256OfNode('{}'));

    const first = await store.downloadEngine('master');
    expect(first.files.length).toBe(4);
    expect(first.sha256).toBeUndefined();

    const fetchSpy = vi.spyOn(mockFetch, 'fetchBytes');
    const second = await store.downloadEngine('master');
    expect(fetchSpy.mock.calls.length).toBe(0);
    expect(second.downloadedAt).toBe(first.downloadedAt);
    expect(second.bytes).toBe(first.bytes);
    fetchSpy.mockRestore();
  });

  it('#12 Q12.1: drift in a single file (bytes or sha) breaks idempotency and re-downloads', async () => {
    // 反向断言：目录当日更新（build.json 的 measured.files 变了）⇒ 三元组不等 ⇒ 重拉
    mockFetch.setFile('https://octave.test/lanes/master/octave.js', 'js-content', sha256OfNode('js-content'));
    mockFetch.setFile('https://octave.test/lanes/master/octave.wasm', 'wasm-content', sha256OfNode('wasm-content'));
    mockFetch.setFile('https://octave.test/lanes/master/octave.build.json', '{}', sha256OfNode('{}'));
    mockFetch.setFile('https://octave.test/lanes/master/assets/manifest.json', '{}', sha256OfNode('{}'));

    await store.downloadEngine('master');

    // 目录更新：octave.js 内容漂移（sha 变）
    sampleEngineBuild.measured.files['octave.js'] = {
      sha256: sha256OfNode('js-content-v2'),
      bytes: 100,
    };
    mockFetch.setFile('https://octave.test/lanes/master/octave.js', 'js-content-v2', sha256OfNode('js-content-v2'));

    const fetchSpy = vi.spyOn(mockFetch, 'fetchBytes');
    const rec2 = await store.downloadEngine('master');
    // 全量重拉（I2 原子语义：漂移即清账重下）
    expect(fetchSpy.mock.calls.length).toBe(4);
    expect(rec2.files.find((f) => f.path.endsWith('octave.js'))?.sha256).toBe(sha256OfNode('js-content-v2'));
    fetchSpy.mockRestore();

    // 复原目录供后续用例
    sampleEngineBuild.measured.files['octave.js'] = {
      sha256: sha256OfNode('js-content'),
      bytes: 100,
    };
  });

  it('#12 Q12.2: KNOWN_ENGINE_METADATA is slimmed — key omc, no top-level sha256/bytes, bytes derive from files', async () => {
    // 新形状断言：键 'omc'（版本语义从键除名，Q6C）
    expect(Object.keys(KNOWN_ENGINE_METADATA)).toEqual(['omc']);
    const omc = KNOWN_ENGINE_METADATA['omc'];
    // 顶层聚合字段删除（形状即断言：读不到就是 undefined）
    expect((omc as any).sha256).toBeUndefined();
    expect((omc as any).bytes).toBeUndefined();
    // files 逐件仍在（离线兜底的手抄指纹）
    expect(Object.keys(omc.files).sort()).toEqual(['OpenModelicaCompiler.js', 'OpenModelicaCompiler_bg.wasm']);
    for (const meta of Object.values(omc.files)) {
      expect(meta.bytes).toBeGreaterThan(0);
      expect(meta.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
    // bytes 从 files 累加即得（resolveEngineTarget omc 分支的真源）
    const sum = Object.values(omc.files).reduce((s, f) => s + f.bytes, 0);
    expect(sum).toBe(74579404 + 56586);

    // 离线兜底链路（无 catalogProvider ⇒ 用 KNOWN_ENGINE_METADATA）可走完：
    // 顶层 sha 已删 ⇒ resolved 无聚合指纹；分件 sha 真值 ⇒ 校验绿 ⇒ record 顶层 sha = undefined
    mockFetch.setFile('https://octave.test/omc/OpenModelicaCompiler_bg.wasm', 'omc-wasm', omc.files['OpenModelicaCompiler_bg.wasm'].sha256);
    mockFetch.setFile('https://octave.test/omc/OpenModelicaCompiler.js', 'omc-js', omc.files['OpenModelicaCompiler.js'].sha256);
    const offlineStore = new DownloadStore({
      storage: memoryStore,
      fetchPort: mockFetch,
      baseUrl: 'https://octave.test',
      maxQuotaBytes: 1024 * 1024 * 1024,
    });
    await offlineStore.init();
    const rec = await offlineStore.downloadEngine('omc');
    expect(rec.sha256).toBeUndefined();
    // record.bytes 是**实际下载字节数**（'omc-wasm' 8 + 'omc-js' 6），
    // 不是元数据表累加值——对账真源是 files[] 逐件记账
    expect(rec.bytes).toBe(14);
    expect(rec.files.map((f) => f.bytes)).toEqual([8, 6]);
    expect(rec.files.map((f) => f.sha256)).toEqual([
      omc.files['OpenModelicaCompiler_bg.wasm'].sha256,
      omc.files['OpenModelicaCompiler.js'].sha256,
    ]);
  });

  it('#12 Q12.2(钉死, investigate/omc-size): 兜底副本求和 === OM 产物台账真值；mirror catalog 顶层 size 是目录和，不一致以 files[] 为准', async () => {
    // ── 真源（OpenModelica-Full-Wasm 台账 build/FACTS.json，上游仓只读）──
    // 复跑（2026-10-29 实测，逐字；与台账键 omc_web_wasm_bytes / omc_web_js_bytes 同值）：
    //   stat -c%s /mnt/hdd/openmodelica-wasm-build/build/omc-out-web/web/omc/OpenModelicaCompiler_bg.wasm  ⇒ 74579404
    //   stat -c%s /mnt/hdd/openmodelica-wasm-build/site-omc/omc/OpenModelicaCompiler.js                    ⇒ 56586
    // 逐件 sha 对账台账 omc_web_wasm_sha / omc_web_js_sha ⇒ 与本表逐件一致
    //   （8287589e… / 56c399bd…；sha256sum 同路径可复跑）。
    const OM_LEDGER_WASM_BYTES = 74_579_404;
    const OM_LEDGER_JS_BYTES = 56_586;
    const omcMeta = KNOWN_ENGINE_METADATA['omc'];
    const fallbackSum = Object.values(omcMeta.files).reduce((s, f) => s + f.bytes, 0);
    // 兜底副本逐件 + 求和 === 产物台账真值：离线兜底不是「差不多」，是逐字节对账。
    // 手抄表漂移（任何一件改版没重测）⇒ 此处红。
    expect(omcMeta.files['OpenModelicaCompiler_bg.wasm'].bytes).toBe(OM_LEDGER_WASM_BYTES);
    expect(omcMeta.files['OpenModelicaCompiler.js'].bytes).toBe(OM_LEDGER_JS_BYTES);
    expect(fallbackSum).toBe(OM_LEDGER_WASM_BYTES + OM_LEDGER_JS_BYTES);

    // ── mirror 站点表（仓内真文件，不读副本/不改写）──
    const catalogPath = repoFile('public/bridge/assets/forge-catalog.json');
    const mirrorCatalog = JSON.parse(readFileSync(catalogPath, 'utf8')) as ForgeCatalog;
    const omcPack = (mirrorCatalog.packs || []).find((p) => p.name === 'omc') as any;
    expect(omcPack).toBeDefined();
    // catalog 顶层 size = **整个 omc/ 目录**字节和（该条目 note 自述
    // 「size = omc/ 目录字节和」），含浏览器永不下载的两件 TS 声明。
    // 复跑（OpenModelica 侧产物树，只读；2026-10-29 实测）：
    //   stat -c%s /mnt/hdd/openmodelica-wasm-build/site-omc/omc/OpenModelicaCompiler.d.ts         ⇒ 55625
    //   stat -c%s /mnt/hdd/openmodelica-wasm-build/site-omc/omc/OpenModelicaCompiler_bg.wasm.d.ts ⇒ 43840
    //   find /mnt/hdd/openmodelica-wasm-build/site-omc/omc/ -type f -exec stat -c%s {} \; \
    //     | python3 -c "import sys;print(sum(int(l) for l in sys.stdin))"                         ⇒ 74735455
    expect(omcPack.size).toBe(74_735_455);
    // 两口径之差恰 = 两件 .d.ts 的字节和——目录口径 vs 下载闭包口径，不是数据损坏。
    // 钉成形状：catalog 刷新 / 引擎改版后此处红 ⇒ 强制重对账上游台账再改字面量。
    expect(omcPack.size - fallbackSum).toBe(55_625 + 43_840);

    // ── 裁定语义（Q12.2 既定：顶层 size 有意忽略，files[] 为准）──
    // mirror omc 条目无 files[] ⇒ resolveEngineTarget 落回 KNOWN_ENGINE_METADATA；
    // 反向断言在紧随的 Q12.4 用例（catalog 给 size:999 + 真 files[] ⇒ 记账 = files 和）。
    // 这里补行为钉：配额给到**安全带**——大于兜底求和 50 000 B（覆盖 manifest 记账
    // 开销），但比 catalog 顶层 size 小 ~49 465 B。正确实现（记账 = files[] 求和
    // 74 635 990）能走完；谁把顶层 size（74 735 455）接进 resolved.bytes 谁撞墙
    // （STORAGE_QUOTA_EXCEEDED ⇒ 此处红）。
    const probe = new DownloadStore({
      storage: memoryStore,
      fetchPort: mockFetch,
      baseUrl: 'https://octave.test',
      catalogProvider: () => mirrorCatalog,
      maxQuotaBytes: fallbackSum + 50_000,
    });
    await probe.init();
    mockFetch.setFile(
      'https://octave.test/omc/OpenModelicaCompiler_bg.wasm',
      'omc-wasm-pin',
      omcMeta.files['OpenModelicaCompiler_bg.wasm'].sha256
    );
    mockFetch.setFile(
      'https://octave.test/omc/OpenModelicaCompiler.js',
      'omc-js-pin',
      omcMeta.files['OpenModelicaCompiler.js'].sha256
    );
    const rec = await probe.downloadEngine('omc');
    expect(rec.files.length).toBe(2);
    expect(rec.files.map((f) => f.sha256)).toEqual([
      omcMeta.files['OpenModelicaCompiler_bg.wasm'].sha256,
      omcMeta.files['OpenModelicaCompiler.js'].sha256,
    ]);
  });

  it('#12 Q12.4: catalog values override the handwritten KNOWN_ENGINE_METADATA fallback', async () => {
    // catalog 带真 64hex 分件指纹 ⇒ 覆盖手抄表值（#8 已有类似用例，这里补
    // 新形状侧：catalog 条目只取 files[]，顶层 sha/size 不再消费——聚合 sha 产地已删）
    const catWasmSha = sha256OfNode('catalog-omc-wasm');
    const catJsSha = sha256OfNode('catalog-omc-js');
    const omcCatalog: ForgeCatalog = {
      packs: [
        {
          name: 'omc',
          version: '1.25.0',
          form: 'tree',
          content: [],
          // 顶层 sha256/size 给的是旧装饰形状（128hex）——必须被忽略（只取 files）
          sha256: 'f'.repeat(128),
          size: 999,
          files: {
            'OpenModelicaCompiler_bg.wasm': { bytes: 12000, sha256: catWasmSha },
            'OpenModelicaCompiler.js': { bytes: 345, sha256: catJsSha },
          },
        } as any,
      ],
    };
    const catStore = new DownloadStore({
      storage: memoryStore,
      fetchPort: mockFetch,
      baseUrl: 'https://octave.test',
      catalogProvider: () => omcCatalog,
      maxQuotaBytes: 1024 * 1024,
    });
    await catStore.init();

    mockFetch.setFile('https://octave.test/omc/OpenModelicaCompiler_bg.wasm', 'a'.repeat(12000), catWasmSha);
    mockFetch.setFile('https://octave.test/omc/OpenModelicaCompiler.js', 'b'.repeat(345), catJsSha);

    const rec = await catStore.downloadEngine('omc');
    // 分件 sha / bytes 用 catalog 真值，不是 KNOWN_ENGINE_METADATA 手抄值
    expect(rec.files.map((f) => f.sha256)).toEqual([catWasmSha, catJsSha]);
    expect(rec.bytes).toBe(12000 + 345);
    // 顶层聚合 sha 不再从 catalog 顶层 sha256 取（Q7A：删顶层 sha ⇒ undefined）
    expect(rec.sha256).toBeUndefined();
  });

  // ══ #15 通知通道统一的判据面（两发定档 + 失效挂点）═══════════════════════════

  /** #15 事件计数器：window 上挂 'octave:download-changed' 计数监听（happy-dom 下 window 可用） */
  function countDownloadEvents(): { count: () => number; dispose: () => void } {
    let n = 0;
    const listener = () => { n++; };
    window.addEventListener('octave:download-changed', listener);
    return { count: () => n, dispose: () => window.removeEventListener('octave:download-changed', listener) };
  }

  it('#15 Q15.1: 一次完整 download ⇒ octave:download-changed 事件数 === 2（start null + 终态 record）', async () => {
    const ref: DownloadRef = { name: 'cgi', version: '0.1.2', kind: 'src' } as any;
    const url = 'https://octave.test/assets/packages/cgi-0.1.2.tar.gz';
    mockFetch.setFile(url, 'fake-tarball-cgi', CGI_SHA);

    const counter = countDownloadEvents();
    try {
      const rec = await store.download(ref);
      expect(rec.sha256).toBe(CGI_SHA);
      // 两发定档：第一发 = 进 downloading 态（null），第二发 = 终态（record）。
      // 旧三发形状（finally 里再发一次）⇒ 此处会是 3 —— 那是本断言要拦的坏形状。
      expect(counter.count()).toBe(2);
    } finally {
      counter.dispose();
    }
  });

  it('#15 Q15.1: 失败路径 ⇒ 事件数 === 2（start null + null 终态声——失败也是终态）', async () => {
    const ref: DownloadRef = { name: 'cgi', version: '0.1.2', kind: 'src' } as any;
    // catalog 指纹与盘上字节不符 ⇒ 校验环拦 ⇒ throw（复用 I2 用例的手法）
    mockFetch.setFile('https://octave.test/assets/packages/cgi-0.1.2.tar.gz', 'tampered', sha256OfNode('tampered'));
    (sampleCatalog.packs[0].versions![0] as any).sha256 = sha256OfNode('other');

    const counter = countDownloadEvents();
    try {
      await expect(store.download(ref)).rejects.toMatchObject({ code: 'STORAGE_WRITE_FAILED' });
      // 失败终态也必须有声（null）——删掉 catch 里的终态发 ⇒ 此处是 1，
      // 消费者（HeaderBar 重对账 / ProjectWorkspace._notify）会漏掉离开 downloading 态。
      expect(counter.count()).toBe(2);
    } finally {
      counter.dispose();
      // 复原 catalog 供后续用例
      (sampleCatalog.packs[0].versions![0] as any).sha256 = CGI_SHA;
    }
  });

  it('#15 Q15.2: download 终态后（成功与失败两路）单例 stat 缓存已失效（重对账重读盘，不再吃旧指纹）', async () => {
    // 复跑方式：spy 单例 resolver 的 invalidateCache + memoryStore.read 计数——
    // 与 EngineAssetResolver.test.ts 的「缓存失效 ⇒ 重新读盘」用例同款判据面，
    // 但失效触发点是 DownloadStore.download() 的 finally（写路径主动调，#15 挂点），
    // 不是测试手工调 resolver.invalidateCache。
    // ⚠️ 幂等命中路径不重写盘面字节（三元组比对只看记账），所以「对账值反映新文件」
    // 的观测点是：verified 进缓存 ⇒ 再跑一次 download（终态失效）⇒ 再 check ⇒
    // 必须重新读盘（read 计数上升），而不是命中旧缓存零重算。
    const cleanFetch = new MockFetchAdapter();
    const localBuild = {
      measured: {
        files: {
          'octave.js': { sha256: sha256OfNode('js-content'), bytes: 100 },
          'octave.wasm': { sha256: sha256OfNode('wasm-content'), bytes: 500 },
          'octave.data': { sha256: sha256OfNode('data-content'), bytes: 50 },
        },
      },
    };
    cleanFetch.setFile('https://octave.test/lanes/master/octave.js', 'js-content', sha256OfNode('js-content'));
    cleanFetch.setFile('https://octave.test/lanes/master/octave.wasm', 'wasm-content', sha256OfNode('wasm-content'));
    cleanFetch.setFile('https://octave.test/lanes/master/octave.data', 'data-content', sha256OfNode('data-content'));
    cleanFetch.setFile('https://octave.test/lanes/master/octave.build.json', '{}', sha256OfNode('{}'));
    cleanFetch.setFile('https://octave.test/lanes/master/assets/manifest.json', '{}', sha256OfNode('{}'));
    const engineStore = new DownloadStore({
      storage: memoryStore,
      fetchPort: cleanFetch,
      baseUrl: 'https://octave.test',
      // 与共享 store 的 beforeEach 同款：同步返回值经 as any 对齐 provider 签名
      // （基线 49→50 的那 1 条新 tsc 噪音就是 sync 返回型 provider 的既有形状，
      // 这里的 localBuild 与 sampleEngineBuild 同款写法）
      engineBuildProvider: (() => localBuild) as any,
      laneProvider: () => 'master',
      maxQuotaBytes: 100 * 1024 * 1024,
    });
    await engineStore.init();
    await engineStore.downloadEngine('master');

    // 消费侧共享的单例（HeaderBar / ProjectWorkspace / OmcBridge 全走 getInstance()）
    const resolver = EngineAssetResolver.getInstance(memoryStore);
    EngineAssetResolver.setInstance(resolver);
    try {
      const readSpy = vi.spyOn(memoryStore, 'read');
      // 第一次对账：verified 进会话缓存（真读盘——含 manifest 与各文件）
      expect((await resolver.checkPhysicalStatus('master')).integrity).toBe('verified');
      const readsAfterFirstCheck = readSpy.mock.calls.length;
      expect(readsAfterFirstCheck).toBeGreaterThan(0);

      // 挂点直接观测：download 终态必须调单例的 invalidateCache(lane)
      const invSpy = vi.spyOn(resolver, 'invalidateCache');

      // 成功路径（幂等重下也算 download 终态——finally 对成功/失败都跑）
      await engineStore.downloadEngine('master');
      expect(invSpy.mock.calls.length).toBe(1);
      expect(invSpy.mock.calls[0][0]).toBe('master');
      // 缓存已被挂点清掉 ⇒ 再 check 必须重新读盘（read 计数上升，零重算是坏形状）
      expect((await resolver.checkPhysicalStatus('master')).integrity).toBe('verified');
      expect(readSpy.mock.calls.length).toBeGreaterThan(readsAfterFirstCheck);

      // 失败路径（源 sha 与清单指纹不符 ⇒ 校验红 throw）：终态同样失效。
      // 注意先让既有记录失效成 drift——直接改 build 清单里的 wasm 指纹
      // ⇒ 幂等三元组不等 ⇒ 全量重拉 ⇒ mock 源 sha 与清单指纹不符 ⇒ throw。
      localBuild.measured.files['octave.wasm'] = {
        sha256: sha256OfNode('drifted-wasm'),
        bytes: 500,
      };
      cleanFetch.setFile('https://octave.test/lanes/master/octave.wasm', 'tampered-src', sha256OfNode('tampered-src'));
      await expect(engineStore.downloadEngine('master')).rejects.toMatchObject({
        code: 'STORAGE_WRITE_FAILED',
      });
      expect(invSpy.mock.calls.length).toBe(2);
      // 复原清单与源供后续用例
      localBuild.measured.files['octave.wasm'] = {
        sha256: sha256OfNode('wasm-content'),
        bytes: 500,
      };
      cleanFetch.setFile('https://octave.test/lanes/master/octave.wasm', 'wasm-content', sha256OfNode('wasm-content'));
      invSpy.mockRestore();
      readSpy.mockRestore();
    } finally {
      EngineAssetResolver.resetInstance();
    }
  });

  // ══ 候选 3：拆掉 new EngineAssetResolver 这条绕过（grilling Q6/Q7）══════════════
  // 根因不是「契约没写清」，是「可以 new 一个实例来绕过」这个结构允许了绕过：
  // 新实例只失效它自己的空缓存，单例里那条 verified 结论照样活着 ⇒ 对账被架空。
  //
  // 行为判据（不测私有字段）——观测点必须是「有没有重新对账」，不能只看结论：
  // 「删了又按原尺寸装回」时字节与账重新一致，重对账的结论**本来就是 verified**
  // （旧实现返回 verified 是蒙对的）。真正的差别是盘内容读取次数：必须重验。
  it('候选3: removeEngine 后按原尺寸装回 ⇒ 必须重新对账（真读盘，不许吃单例缓存）', async () => {
    const resolver = EngineAssetResolver.getInstance(memoryStore);
    EngineAssetResolver.setInstance(resolver);
    try {
      const engineStore = new DownloadStore({
        storage: memoryStore,
        fetchPort: new MockFetchAdapter(),
        baseUrl: 'https://octave.test',
        catalogProvider: () => sampleCatalog,
        engineBuildProvider: () => sampleEngineBuild,
        laneProvider: () => 'master',
        maxQuotaBytes: 100 * 1024 * 1024,
      });
      await engineStore.init();

      const wasmBytes = 'wasm-content';
      const dataBytes = 'data-content';
      // 账与盘手工铺好后再让 store 重读清单（初始化时清单还不存在）
      await memoryStore.write('downloads/engine/master/w64/octave.wasm', new TextEncoder().encode(wasmBytes));
      await memoryStore.write('downloads/engine/master/w64/octave.data', new TextEncoder().encode(dataBytes));
      await memoryStore.write(
        'downloads/manifest.json',
        new TextEncoder().encode(
          JSON.stringify({
            schema: 1,
            items: {
              'engine:octave@11.3.0:master/w64': {
                ref: { name: 'octave', version: '11.3.0', kind: 'engine', arch: 'master/w64' },
                sha256: 'combined',
                bytes: wasmBytes.length + dataBytes.length,
                files: [
                  { path: 'downloads/engine/master/w64/octave.wasm', sha256: sha256OfNode(wasmBytes), bytes: wasmBytes.length },
                  { path: 'downloads/engine/master/w64/octave.data', sha256: sha256OfNode(dataBytes), bytes: dataBytes.length },
                ],
                downloadedAt: '2026-10-22T00:00:00.000Z',
              },
            },
          })
        )
      );

      // ① 先验一次：verified 进单例缓存
      expect((await resolver.checkPhysicalStatus('master')).integrity).toBe('verified');

      // ② 删引擎：removeEngine 是生产里唯一的物理删除入口
      const readSpy = vi.spyOn(memoryStore, 'read');
      await engineStore.removeEngine('master');

      // ③ 物理删除必须真的发生（证明单例与写路径同盘——不是 evict 到了另一份盘）
      expect(await memoryStore.stat('downloads/engine/master/w64/octave.wasm')).toBeFalsy();

      // ④ 按原尺寸装回：stat size 与缓存时逐字相同 ⇒ 光看指纹看不出盘动过
      await memoryStore.write('downloads/engine/master/w64/octave.wasm', new TextEncoder().encode(wasmBytes));
      await memoryStore.write('downloads/engine/master/w64/octave.data', new TextEncoder().encode(dataBytes));

      const readsBefore = readSpy.mock.calls.length;
      const after = await resolver.checkPhysicalStatus('master');
      expect(after.integrity).toBe('verified');
      // ★ 关键判据：必须重新读盘对账。旧实现（new 一个实例 evict）会命中单例旧缓存 ⇒ 零新增读。
      expect(readSpy.mock.calls.length).toBeGreaterThan(readsBefore);
      readSpy.mockRestore();
    } finally {
      EngineAssetResolver.resetInstance();
    }
  });
});


describe('form:"file" 单件交付（内容仓 084 A2 / 086 裁定：MSL 形状）', () => {
  const mslEntry = {
    name: 'modelica-standard-library',
    version: '4.1.0+maint.om',
    form: 'file',
    sha256: 'a97d8d94ca7f7960f7f1c209613a35d65bcfa2426660e5052617e71326308535',
    url: 'assets/msl/msl-4.1.0-maint.om.zip',
    size: 19482938,
    content: [],
    consumer: ['omc'],
    role: 'package',
    deps: [],
  };

  it('★ file 形态：url/size/sha 三件齐 ⇒ 单件下载计划（无 arch 也走通）', async () => {
    const store = new DownloadStore({
      storage: new MemoryStore(),
      catalogProvider: () => ({ schema: 2, packs: [mslEntry] }),
      baseUrl: '',
      fetchPort: {
        fetchBytes: async () => ({
          ok: true,
          status: 200,
          data: new Uint8Array(19482938),
          sha256: mslEntry.sha256,
          totalBytes: 19482938,
        }),
        fetchJSON: async () => ({}),
      } as any,
    });
    const rec = await store.download({ name: 'modelica-standard-library', version: '4.1.0+maint.om', kind: 'pre', arch: null });
    expect(rec.files.length).toBe(1);
    expect(rec.files[0].path).toBe('downloads/file/modelica-standard-library/4.1.0+maint.om/msl-4.1.0-maint.om.zip');
    expect(rec.files[0].sha256).toBe(mslEntry.sha256);
    expect(rec.bytes).toBe(19482938);
  });

  it('★ 反向断言：file 条目缺 sha256 ⇒ 响亮 FLAVOR_UNAVAILABLE（不猜、不静默）', async () => {
    const broken = { ...mslEntry, sha256: undefined };
    const store = new DownloadStore({
      storage: new MemoryStore(),
      catalogProvider: () => ({ schema: 2, packs: [broken as any] }),
      baseUrl: '',
    });
    await expect(
      store.download({ name: 'modelica-standard-library', version: '4.1.0+maint.om', kind: 'pre', arch: null })
    ).rejects.toMatchObject({ code: 'FLAVOR_UNAVAILABLE' });
  });

  it('★ 反向断言：file 条目缺 size ⇒ 同报（三件缺一即拒）', async () => {
    const broken = { ...mslEntry, size: undefined };
    const store = new DownloadStore({
      storage: new MemoryStore(),
      catalogProvider: () => ({ schema: 2, packs: [broken as any] }),
      baseUrl: '',
    });
    await expect(
      store.download({ name: 'modelica-standard-library', version: '4.1.0+maint.om', kind: 'pre', arch: null })
    ).rejects.toMatchObject({ code: 'FLAVOR_UNAVAILABLE' });
  });
});


describe('catalog 优先于 KNOWN_ENGINE_METADATA 兜底（内容仓 096 §4.1 可证伪判据）', () => {
  it('★ catalog 的 sha 与兜底不同 ⇒ 必须用 catalog 的（证明表是真源，兜底只是副本）', async () => {
    const catalogSha = 'b'.repeat(64); // 与 KNOWN_ENGINE_METADATA 的 8287589e… 不同
    const store = new DownloadStore({
      storage: new MemoryStore(),
      baseUrl: '',
      catalogProvider: () => ({
        schema: 2,
        packs: [{
          name: 'omc', version: 'unversioned', form: 'tree', kind: 'engine',
          role: 'toolchain', arch: 'omc', consumer: ['omc'],
          files: {
            'OpenModelicaCompiler_bg.wasm': { bytes: 100, sha256: catalogSha },
            'OpenModelicaCompiler.js': { bytes: 50, sha256: 'c'.repeat(64) },
          },
        } as any],
      }),
    });
    const seen: string[] = [];
    // mock 按 catalog 的**逐件** sha 返回（js 件用 cccc…，wasm 件用 bbbb…）
    (store as any).fetchPort = {
      fetchBytes: async (url: string) => {
        seen.push(url);
        const isJs = url.endsWith('.js');
        return {
          ok: true,
          status: 200,
          data: new Uint8Array(isJs ? 50 : 100),
          sha256: isJs ? 'c'.repeat(64) : catalogSha,
          totalBytes: isJs ? 50 : 100,
        };
      },
    };
    await store.download({ name: 'omc', version: '-rust', kind: 'engine', arch: 'omc' });
    const rec = store.getRecord({ name: 'omc', version: '-rust', kind: 'engine', arch: 'omc' } as any);
    // 记账里的 sha 必须是 catalog 的（不是兜底的 8287589e…）
    expect(rec?.files.some((f) => f.sha256 === catalogSha)).toBe(true);
    expect(rec?.files.every((f) => !f.sha256.startsWith('8287589e'))).toBe(true);
  });

  // ── 096 §4.1 判据的完整证伪面（verify/nochange-switch 验证轮新增）──────────
  // 判据（DEVIATIONS ⑤ / mail 086 §2.4「catalog 优先、有则用」）：
  //   ① catalog files[] 的 sha/bytes 与 KNOWN_ENGINE_METADATA 不同 ⇒ 下载全链
  //     （配额预检 / 校验环 / 记账）用 catalog 值；
  //   ② catalog 缺条目（或条目无 files[]、provider 不可达）⇒ 才落兜底；
  //   ③ 兜底陈旧 ⇒ 下载 sha 校验红（fail fast，不静默收下坏字节）。
  // 复跑方式：CI=true npx vitest run tests/storage/DownloadStore.test.ts

  const FALLBACK_FILES = KNOWN_ENGINE_METADATA['omc'].files;
  const WASM_KEY = 'OpenModelicaCompiler_bg.wasm';
  const JS_KEY = 'OpenModelicaCompiler.js';

  /** 记录请求 URL 的假 fetch：字节按内容真算 sha（或显式 override）参与校验环。
   *  「预期 sha（catalog 或兜底给的）× 实际字节 sha」的比对发生在 DownloadStore 内部
   *  （DownloadStore.ts 校验环），这里只让两侧都可注入、请求面可观测。 */
  function recordingPort(files: Record<string, { content: string; sha256?: string }>) {
    const requested: string[] = [];
    return {
      requested,
      fetchBytes: async (url: string, opts?: any) => {
        requested.push(url);
        const entry = files[url];
        if (!entry) {
          return { ok: false, status: 404, data: new Uint8Array(0), sha256: '', totalBytes: null };
        }
        const data = new TextEncoder().encode(entry.content);
        opts?.onProgress?.({ receivedBytes: data.length, totalBytes: data.length });
        return {
          ok: true,
          status: 200,
          data,
          sha256: entry.sha256 ?? sha256OfNode(data),
          totalBytes: data.length,
        };
      },
      fetchJSON: async () => {
        throw new Error('recordingPort: fetchJSON not expected in omc engine path');
      },
    };
  }

  function omcCatalogWithFiles(files: Record<string, { bytes: number; sha256: string }>): ForgeCatalog {
    return {
      schema: 2,
      packs: [
        {
          name: 'omc',
          version: 'unversioned',
          form: 'tree',
          content: [],
          files,
        } as any,
      ],
    };
  }

  it('★ 判据①：catalog files[] 的 sha/bytes 与兜底都不同 ⇒ 校验环/记账/配额预检全用 catalog 值', async () => {
    const catWasm = sha256OfNode('catalog-omc-wasm-v2');
    const catJs = sha256OfNode('catalog-omc-js-v2');
    // 前置自证：给定的确实与兜底不同（判据前提；兜底值被人改掉时这条先红）
    expect(catWasm).not.toBe(FALLBACK_FILES[WASM_KEY].sha256);
    expect(catJs).not.toBe(FALLBACK_FILES[JS_KEY].sha256);

    const store = new DownloadStore({
      storage: new MemoryStore(),
      baseUrl: '',
      catalogProvider: () =>
        omcCatalogWithFiles({
          [WASM_KEY]: { bytes: 100, sha256: catWasm },
          [JS_KEY]: { bytes: 50, sha256: catJs },
        }),
    });
    // 字节按内容真算 sha：serve 的内容就是 catalog 指纹对应的那份（正向路径）
    const port = recordingPort({
      [store.resolveUrl(`/omc/${WASM_KEY}`)]: { content: 'catalog-omc-wasm-v2' },
      [store.resolveUrl(`/omc/${JS_KEY}`)]: { content: 'catalog-omc-js-v2' },
    });
    (store as any).fetchPort = port;

    const totals: Array<number | null> = [];
    const rec = await store.downloadEngine('omc', { onProgress: (p) => totals.push(p.totalBytes) });

    // 请求打到 /omc/ 两件、顺序同 items（wasm → js）
    expect(port.requested).toEqual([store.resolveUrl(`/omc/${WASM_KEY}`), store.resolveUrl(`/omc/${JS_KEY}`)]);
    // 校验环放行 + 记账 sha = catalog 值（预期 sha 来自 catalog 才会放行这两份字节）
    expect(rec.files.map((f) => f.sha256)).toEqual([catWasm, catJs]);
    // catalog bytes（100+50）进配额预检/进度 totalBytes——不是兜底和（74579404+56586）
    expect(Math.max(...(totals as number[]))).toBe(150);
    expect(Math.max(...(totals as number[]))).not.toBe(FALLBACK_FILES[WASM_KEY].bytes + FALLBACK_FILES[JS_KEY].bytes);
    // 实际下到的字节长度（'catalog-omc-wasm-v2' 19B + 'catalog-omc-js-v2' 17B）——
    // record.bytes 是实际字节数不是元数据声明值（已有用例 #12 Q12.2 钉过该语义）；
    // catalog 声称的 bytes 走配额预检 ⇒ 上面 totalBytes=150 那条已验。
    expect(rec.bytes).toBe(19 + 17);
  });

  it('★ 判据①反向芯：catalog sha ≠ 兜底时，喂「兜底指纹的旧字节」必须校验红（catalog 是被验的那个值）', async () => {
    // catalog 宣称新指纹；镜像上还是旧 blob（fetch 返回字节的 sha = 兜底值）。
    // catalog 优先 ⇒ 预期(catalog) ≠ 实际(兜底) ⇒ STORAGE_WRITE_FAILED；
    // 若实现反了（兜底优先，或「记 catalog 验兜底」），这里会假绿 —— 本测试红。
    const catWasm = sha256OfNode('catalog-omc-wasm-v2');
    const catJs = sha256OfNode('catalog-omc-js-v2');
    const store = new DownloadStore({
      storage: new MemoryStore(),
      baseUrl: '',
      catalogProvider: () =>
        omcCatalogWithFiles({
          [WASM_KEY]: { bytes: 100, sha256: catWasm },
          [JS_KEY]: { bytes: 50, sha256: catJs },
        }),
    });
    const port = recordingPort({
      [store.resolveUrl(`/omc/${WASM_KEY}`)]: { content: 'stale-blob', sha256: FALLBACK_FILES[WASM_KEY].sha256 },
      [store.resolveUrl(`/omc/${JS_KEY}`)]: { content: 'stale-js', sha256: FALLBACK_FILES[JS_KEY].sha256 },
    });
    (store as any).fetchPort = port;

    const err = await store.downloadEngine('omc').then(
      () => null,
      (e) => e
    );
    expect(err).toBeInstanceOf(DownloadError);
    // 红的原因必须是 sha 不匹配（不是 404 / intake 拦截 / 别的错）
    expect(err.code).toBe('STORAGE_WRITE_FAILED');
    expect(err.message).toMatch(/SHA256 mismatch/);
    // I2：失败不留账
    const snap = await store.index();
    expect(snap.count).toBe(0);
  });

  it('★ 判据②：catalog 缺 omc 条目 ⇒ 才落兜底（校验/记账用 KNOWN_ENGINE_METADATA 值）', async () => {
    const store = new DownloadStore({
      storage: new MemoryStore(),
      baseUrl: '',
      // 表在、但没有 omc 条目（如 085 信里 15 packs 时代的镜像表形状）
      catalogProvider: () => ({
        schema: 2,
        packs: [{ name: 'llvm-wasm', version: '6.0.12', form: 'tree', content: [] } as any],
      }),
    });
    const port = recordingPort({
      [store.resolveUrl(`/omc/${WASM_KEY}`)]: { content: 'offline-blob', sha256: FALLBACK_FILES[WASM_KEY].sha256 },
      [store.resolveUrl(`/omc/${JS_KEY}`)]: { content: 'offline-js', sha256: FALLBACK_FILES[JS_KEY].sha256 },
    });
    (store as any).fetchPort = port;

    const rec = await store.downloadEngine('omc');
    expect(rec.files.map((f) => f.sha256)).toEqual([
      FALLBACK_FILES[WASM_KEY].sha256,
      FALLBACK_FILES[JS_KEY].sha256,
    ]);
  });

  it('★ 判据②补：omc 条目在但无 files[]（086 之前的宿主形状）⇒ 同样落兜底', async () => {
    const store = new DownloadStore({
      storage: new MemoryStore(),
      baseUrl: '',
      catalogProvider: () => ({
        schema: 2,
        packs: [{ name: 'omc', version: '1.25.0', form: 'tree', content: [] } as any],
      }),
    });
    const port = recordingPort({
      [store.resolveUrl(`/omc/${WASM_KEY}`)]: { content: 'offline-blob', sha256: FALLBACK_FILES[WASM_KEY].sha256 },
      [store.resolveUrl(`/omc/${JS_KEY}`)]: { content: 'offline-js', sha256: FALLBACK_FILES[JS_KEY].sha256 },
    });
    (store as any).fetchPort = port;

    const rec = await store.downloadEngine('omc');
    expect(rec.files.map((f) => f.sha256)).toEqual([
      FALLBACK_FILES[WASM_KEY].sha256,
      FALLBACK_FILES[JS_KEY].sha256,
    ]);
  });

  it('★ 判据③：离线兜底值陈旧（字节 sha ≠ 兜底指纹）⇒ 下载 sha 校验红，fail fast 不静默', async () => {
    // DownloadStore.ts:50 的注释断言「兜底值陈旧 ⇒ 下载时 sha 校验红」——这里钉行为：
    // 无 catalogProvider，serve 的字节指纹与手抄表不符 ⇒ 必须红。
    // 若有人改成「收下字节、记账真算值」的静默降级，本测试红。
    const store = new DownloadStore({ storage: new MemoryStore(), baseUrl: '' });
    const port = recordingPort({
      [store.resolveUrl(`/omc/${WASM_KEY}`)]: { content: 'stale-offline-blob' }, // 真 sha ≠ 兜底指纹
      [store.resolveUrl(`/omc/${JS_KEY}`)]: { content: 'stale-offline-js' },
    });
    (store as any).fetchPort = port;

    const err = await store.downloadEngine('omc').then(
      () => null,
      (e) => e
    );
    expect(err).toBeInstanceOf(DownloadError);
    expect(err.code).toBe('STORAGE_WRITE_FAILED');
    expect(err.message).toMatch(/SHA256 mismatch/);
    const snap = await store.index();
    expect(snap.count).toBe(0);
  });

  it('★ 反向断言（不混用）：catalog files[] 残缺（只有 wasm 一件）⇒ 响亮 FLAVOR_UNAVAILABLE，不逐件回落兜底', async () => {
    // resolveEngineTarget 是整表替换（omcMeta = { files: pkg.files }），不是逐件合并：
    // 残缺 files[] 缺件 ⇒ 如实报缺件名（DownloadStore.ts:843-848）。
    // 若有人改成「缺的件回落兜底」的合并实现，这里会假成功 —— 本测试红。
    const store = new DownloadStore({
      storage: new MemoryStore(),
      baseUrl: '',
      catalogProvider: () =>
        omcCatalogWithFiles({
          [WASM_KEY]: { bytes: 100, sha256: sha256OfNode('catalog-omc-wasm-v2') },
        }),
    });
    await expect(store.downloadEngine('omc')).rejects.toMatchObject({ code: 'FLAVOR_UNAVAILABLE' });
    await expect(store.downloadEngine('omc')).rejects.toThrow(new RegExp(JS_KEY));
  });

  it('★ 反向断言：catalogProvider 抛错 ⇒ 降级兜底（不可达是合法路径，校验/记账仍走通）', async () => {
    const store = new DownloadStore({
      storage: new MemoryStore(),
      baseUrl: '',
      catalogProvider: () => {
        throw new Error('Failed to fetch');
      },
    });
    const port = recordingPort({
      [store.resolveUrl(`/omc/${WASM_KEY}`)]: { content: 'offline-blob', sha256: FALLBACK_FILES[WASM_KEY].sha256 },
      [store.resolveUrl(`/omc/${JS_KEY}`)]: { content: 'offline-js', sha256: FALLBACK_FILES[JS_KEY].sha256 },
    });
    (store as any).fetchPort = port;

    const rec = await store.downloadEngine('omc');
    expect(rec.files.map((f) => f.sha256)).toEqual([
      FALLBACK_FILES[WASM_KEY].sha256,
      FALLBACK_FILES[JS_KEY].sha256,
    ]);
  });
});
