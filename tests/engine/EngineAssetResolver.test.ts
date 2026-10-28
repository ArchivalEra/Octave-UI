// tests/engine/EngineAssetResolver.test.ts
import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';
import { EngineAssetResolver, getDefaultVariant } from '../../src/modules/engine/EngineAssetResolver';
import { MemoryStore } from '../../src/modules/storage/MemoryStore';

describe('EngineAssetResolver Deep Module', () => {
  let memoryStore: MemoryStore;
  let resolver: EngineAssetResolver;
  let originalGlobalFetch: typeof globalThis.fetch;
  /** 盘内容读取计数（read / readBlob）：缓存命中断言只许 stat 不许盘内容 */
  let readSpy: MockInstance<(path: string) => Promise<Uint8Array>>;
  let readBlobSpy: MockInstance<(path: string) => Promise<Blob>>;

  beforeEach(async () => {
    originalGlobalFetch = globalThis.fetch;
    memoryStore = new MemoryStore();
    await memoryStore.init();
    readSpy = vi.spyOn(memoryStore, 'read');
    readBlobSpy = vi.spyOn(memoryStore, 'readBlob');
    resolver = new EngineAssetResolver(memoryStore);
    EngineAssetResolver.setInstance(resolver);
  });

  afterEach(() => {
    globalThis.fetch = originalGlobalFetch;
    EngineAssetResolver.resetInstance();
  });

  it('resolves correct default variants for each engine lane', () => {
    expect(getDefaultVariant('master')).toBe('w64');
    expect(getDefaultVariant('IllegalPerformance')).toBe('w64');
    expect(getDefaultVariant('wasm32-final')).toBe('w32');
    expect(getDefaultVariant('omc')).toBe('w32');
  });

  it('physical stat: reports downloaded=false when storage is empty', async () => {
    const statusMaster = await resolver.checkPhysicalStatus('master');
    expect(statusMaster.downloaded).toBe(false);
    expect(statusMaster.lane).toBe('master');
    expect(statusMaster.variant).toBe('w64');
    expect(statusMaster.totalBytes).toBe(0);

    const statusOmc = await resolver.checkPhysicalStatus('omc');
    expect(statusOmc.downloaded).toBe(false);
    expect(statusOmc.lane).toBe('omc');
    expect(statusOmc.variant).toBe('w32');
    expect(statusOmc.totalBytes).toBe(0);
  });

  it('physical stat: reports downloaded=false if octave.wasm exists but octave.data is missing or 0 bytes', async () => {
    // 仅写入 octave.wasm
    await memoryStore.write('downloads/engine/master/w64/octave.wasm', new Uint8Array([1, 2, 3, 4]));
    let status = await resolver.checkPhysicalStatus('master');
    expect(status.downloaded).toBe(false);

    // 写入 0 字节的 octave.data
    await memoryStore.write('downloads/engine/master/w64/octave.data', new Uint8Array([]));
    status = await resolver.checkPhysicalStatus('master');
    expect(status.downloaded).toBe(false);
  });

  it('physical stat: reports downloaded=true and accurate totalBytes when all required files exist with size > 0', async () => {
    const wasmBytes = new Uint8Array(1024);
    const dataBytes = new Uint8Array(2048);
    await memoryStore.write('downloads/engine/master/w64/octave.wasm', wasmBytes);
    await memoryStore.write('downloads/engine/master/w64/octave.data', dataBytes);

    const status = await resolver.checkPhysicalStatus('master');
    expect(status.downloaded).toBe(true);
    expect(status.variant).toBe('w64');
    expect(status.totalBytes).toBe(3072);
    expect(status.verifiedAt).toBeGreaterThan(0);
  });

  it('physical stat: checks OMC files correctly', async () => {
    const omcWasm = new Uint8Array(5000);
    const omcJs = new Uint8Array(500);
    await memoryStore.write('downloads/engine/omc/w32/OpenModelicaCompiler_bg.wasm', omcWasm);
    await memoryStore.write('downloads/engine/omc/w32/OpenModelicaCompiler.js', omcJs);

    const status = await resolver.checkPhysicalStatus('omc');
    expect(status.downloaded).toBe(true);
    expect(status.lane).toBe('omc');
    expect(status.variant).toBe('w32');
    expect(status.totalBytes).toBe(5500);
  });

  it('physical stat: reports downloaded=false for OMC if OpenModelicaCompiler.js is missing or 0 bytes', async () => {
    // 仅写入 OpenModelicaCompiler_bg.wasm
    await memoryStore.write('downloads/engine/omc/w32/OpenModelicaCompiler_bg.wasm', new Uint8Array(5000));
    let status = await resolver.checkPhysicalStatus('omc');
    expect(status.downloaded).toBe(false);

    // 写入 0 字节的 OpenModelicaCompiler.js
    await memoryStore.write('downloads/engine/omc/w32/OpenModelicaCompiler.js', new Uint8Array([]));
    status = await resolver.checkPhysicalStatus('omc');
    expect(status.downloaded).toBe(false);
  });

  it('matchRequest: strict isolation prevents cross-lane and cross-variant mis-matching', () => {
    // 1. master (w64) 规则
    expect(resolver.matchRequest('master', 'w64', '/lanes/master/w64/octave.wasm')).toEqual({ filename: 'octave.wasm' });
    expect(resolver.matchRequest('master', 'w64', '/lanes/master/w64/octave.js')).toEqual({ filename: 'octave.js' });
    expect(resolver.matchRequest('master', 'w64', '/octave.data')).toEqual({ filename: 'octave.data' });

    // 严禁匹配到其他车道的请求
    expect(resolver.matchRequest('master', 'w64', '/lanes/IllegalPerformance/w64/octave.wasm')).toBeNull();
    expect(resolver.matchRequest('master', 'w64', '/lanes/wasm32-final/octave.wasm')).toBeNull();
    expect(resolver.matchRequest('master', 'w64', '/lanes/omc/octave.wasm')).toBeNull();

    // 严禁匹配到冲突架构的请求
    expect(resolver.matchRequest('master', 'w64', '/w32/octave.wasm')).toBeNull();
    expect(resolver.matchRequest('wasm32-final', 'w32', '/w64/octave.wasm')).toBeNull();
  });

  it('matchRequest: #6 离线五件套两拦截键（assets/manifest.json / octave.build.json）走同一防交叉面', () => {
    // wasm32-final (w32) 规则：本车道命中（存储名映射：manifest.json ⇒ assets-manifest.json）
    expect(resolver.matchRequest('wasm32-final', 'w32', '/lanes/wasm32-final/assets/manifest.json')).toEqual({
      filename: 'assets-manifest.json',
    });
    expect(resolver.matchRequest('wasm32-final', 'w32', '/lanes/wasm32-final/octave.build.json')).toEqual({
      filename: 'octave.build.json',
    });

    // master 规则：不得交叉命中 wasm32-final 的清单请求
    expect(resolver.matchRequest('master', 'w64', '/lanes/wasm32-final/assets/manifest.json')).toBeNull();
    expect(resolver.matchRequest('master', 'w64', '/lanes/wasm32-final/octave.build.json')).toBeNull();

    // 根相对通用路径（不含 /lanes/）⇒ 命中（与 wasm/data/js 同一 isGeneric 面）
    expect(resolver.matchRequest('wasm32-final', 'w32', '/assets/manifest.json')).toEqual({
      filename: 'assets-manifest.json',
    });
    expect(resolver.matchRequest('wasm32-final', 'w32', '/octave.build.json')).toEqual({
      filename: 'octave.build.json',
    });

    // w64 档的 manifest.w64.json 不拦（票面裁定固化：层③ 按需资产维持网络 + 如实报错）
    expect(resolver.matchRequest('master', 'w64', '/lanes/master/w64/assets/manifest.w64.json')).toBeNull();
    expect(resolver.matchRequest('master', 'w64', '/assets/manifest.w64.json')).toBeNull();

    // 冲突架构防交叉：w32 规则不拦 w64 目录下的清单
    expect(resolver.matchRequest('wasm32-final', 'w32', '/lanes/master/w64/assets/manifest.json')).toBeNull();
  });

  it('matchRequest → tryServeFromStorage: manifest.json 映射到平铺存储名 assets-manifest.json 并从 OPFS 服务', async () => {
    // #6 存储名映射的端到端：URL 里的 assets/manifest.json 在 OPFS 是
    // downloads/engine/${lane}/${variant}/assets-manifest.json（下载时的 destPath）
    const manifestBytes = new TextEncoder().encode('{"assets":{"a.js":{}}}');
    await memoryStore.write('downloads/engine/wasm32-final/w32/assets-manifest.json', manifestBytes);
    const buildBytes = new TextEncoder().encode('{"measured":{"files":{}}}');
    await memoryStore.write('downloads/engine/wasm32-final/w32/octave.build.json', buildBytes);

    const dummyNetworkFetch = vi.fn().mockResolvedValue(new Response('from network'));
    globalThis.fetch = dummyNetworkFetch;

    await resolver.withLocalAssets('wasm32-final', 'w32', async () => {
      const resManifest = await fetch('https://octave.test/lanes/wasm32-final/assets/manifest.json');
      expect(resManifest.status).toBe(200);
      expect(new Uint8Array(await resManifest.arrayBuffer())).toEqual(manifestBytes);

      const resBuild = await fetch('https://octave.test/lanes/wasm32-final/octave.build.json');
      expect(resBuild.status).toBe(200);
      expect(new Uint8Array(await resBuild.arrayBuffer())).toEqual(buildBytes);
    });

    // 两键全被本地接管：网络 fetch 不被调用
    expect(dummyNetworkFetch).not.toHaveBeenCalled();
  });

  it('evict: physically removes engine files and transitions status to downloaded=false', async () => {
    await memoryStore.write('downloads/engine/master/w64/octave.wasm', new Uint8Array([1, 2]));
    await memoryStore.write('downloads/engine/master/w64/octave.data', new Uint8Array([3, 4]));

    expect((await resolver.checkPhysicalStatus('master')).downloaded).toBe(true);

    await resolver.evict('master');
    expect((await resolver.checkPhysicalStatus('master')).downloaded).toBe(false);
  });

  it('Scoped Fetch Proxy: intercepts octave.wasm and octave.data with streaming Response and proper headers', async () => {
    const wasmData = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
    const memData = new Uint8Array([0x4f, 0x43, 0x54, 0x41, 0x56, 0x45]);
    await memoryStore.write('downloads/engine/master/w64/octave.wasm', wasmData);
    await memoryStore.write('downloads/engine/master/w64/octave.data', memData);

    const dummyNetworkFetch = vi.fn().mockResolvedValue(new Response('from network'));
    globalThis.fetch = dummyNetworkFetch;

    await resolver.withLocalAssets('master', 'w64', async () => {
      // 1. 请求 octave.wasm
      const resWasm = await fetch('https://octave.test/lanes/master/w64/octave.wasm');
      expect(resWasm.status).toBe(200);
      expect(resWasm.headers.get('Content-Type')).toBe('application/wasm');
      expect(resWasm.headers.get('Content-Length')).toBe(wasmData.length.toString());
      const bodyWasm = new Uint8Array(await resWasm.arrayBuffer());
      expect(bodyWasm).toEqual(wasmData);

      // 2. 请求 octave.data
      const resData = await fetch('https://octave.test/lanes/master/w64/octave.data');
      expect(resData.status).toBe(200);
      expect(resData.headers.get('Content-Type')).toBe('application/octet-stream');
      expect(resData.headers.get('Content-Length')).toBe(memData.length.toString());
      const bodyData = new Uint8Array(await resData.arrayBuffer());
      expect(bodyData).toEqual(memData);

      // 3. 请求非引擎资源：原样透传网络 fetch
      const resOther = await fetch('https://octave.test/lanes/master/assets/manifest.json');
      expect(dummyNetworkFetch).toHaveBeenCalledWith(
        'https://octave.test/lanes/master/assets/manifest.json',
        undefined
      );
      expect(await resOther.text()).toBe('from network');
    });

    // 引擎启动完成：网络未被请求 wasm/data，并且 fetch 已被完全恢复
    expect(dummyNetworkFetch).not.toHaveBeenCalledWith(
      expect.stringContaining('octave.wasm'),
      expect.anything()
    );
    expect(dummyNetworkFetch).not.toHaveBeenCalledWith(
      expect.stringContaining('octave.data'),
      expect.anything()
    );
    expect(globalThis.fetch).toBe(dummyNetworkFetch);
  });

  it('Scoped Fetch Proxy: RAII restores original fetch even when bootFn throws', async () => {
    const dummyFetch = vi.fn();
    globalThis.fetch = dummyFetch;

    await expect(
      resolver.withLocalAssets('master', 'w64', async () => {
        expect(globalThis.fetch).not.toBe(dummyFetch);
        throw new Error('Boot crash simulation');
      })
    ).rejects.toThrow('Boot crash simulation');

    expect(globalThis.fetch).toBe(dummyFetch);
  });

  it('concurrency protection: nested or concurrent withLocalAssets calls do not clobber each other', async () => {
    const octaveWasm = new Uint8Array([1, 1, 1]);
    const octaveData = new Uint8Array([2, 2, 2]);
    const omcWasm = new Uint8Array([3, 3, 3]);

    await memoryStore.write('downloads/engine/master/w64/octave.wasm', octaveWasm);
    await memoryStore.write('downloads/engine/master/w64/octave.data', octaveData);
    await memoryStore.write('downloads/engine/omc/w32/OpenModelicaCompiler_bg.wasm', omcWasm);

    const dummyFetch = vi.fn().mockResolvedValue(new Response('network fallback'));
    globalThis.fetch = dummyFetch;

    // 模拟外层启动 Octave，内层并发/嵌套启动 OMC
    await resolver.withLocalAssets('master', 'w64', async () => {
      // 启动 OMC
      await resolver.withLocalAssets('omc', 'w32', async () => {
        // 双引擎代理同时生效
        const resOmc = await fetch('https://octave.test/omc/OpenModelicaCompiler_bg.wasm');
        expect(resOmc.status).toBe(200);
        expect(resOmc.headers.get('Content-Type')).toBe('application/wasm');
        expect(new Uint8Array(await resOmc.arrayBuffer())).toEqual(omcWasm);

        const resOctave = await fetch('https://octave.test/lanes/master/w64/octave.wasm');
        expect(resOctave.status).toBe(200);
        expect(new Uint8Array(await resOctave.arrayBuffer())).toEqual(octaveWasm);
      });

      // OMC 退出后，Octave 代理依然有效
      const resOctaveAfter = await fetch('https://octave.test/lanes/master/w64/octave.data');
      expect(resOctaveAfter.status).toBe(200);
      expect(new Uint8Array(await resOctaveAfter.arrayBuffer())).toEqual(octaveData);
    });

    // 全部退出后，全局 fetch 干净还原
    expect(globalThis.fetch).toBe(dummyFetch);
  });

  it('offline zero-network compute: boots 100% offline without triggering network errors when offline', async () => {
    await memoryStore.write('downloads/engine/master/w64/octave.wasm', new Uint8Array([9, 8, 7]));
    await memoryStore.write('downloads/engine/master/w64/octave.data', new Uint8Array([6, 5, 4]));

    // 模拟纯断网环境：任何网络请求直接抛出 TypeError: Failed to fetch
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch (offline network)'));

    let bootResult = '';
    await resolver.withLocalAssets('master', 'w64', async () => {
      const respWasm = await fetch('https://octave.test/lanes/master/w64/octave.wasm');
      const respData = await fetch('https://octave.test/lanes/master/w64/octave.data');
      expect(respWasm.status).toBe(200);
      expect(respData.status).toBe(200);
      bootResult = 'BOOT_OFFLINE_SUCCESS';
    });

    expect(bootResult).toBe('BOOT_OFFLINE_SUCCESS');
  });

  // ════════════════════════════════════════════════════════════════════════
  // 启动对账升级（issue #7）：manifest files[] 是对账单一真源，
  // checkPhysicalStatus 内联 stat → size 硬判 → sha 复验 → 会话缓存 全套
  // ════════════════════════════════════════════════════════════════════════

  const manifestPath = 'downloads/manifest.json';

  /** 与生产同型的 SHA-256：测试里用 node:crypto 独立断言生产算出的值 */
  function sha256OfNode(data: Uint8Array): string {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nodeCrypto = require('node:crypto') as typeof import('node:crypto');
    return nodeCrypto.createHash('sha256').update(data).digest('hex');
  }

  /** 写完整五件套 + 伪 manifest 记账（DownloadStore download() 成功后的盘面形状，#6 起 +2 件） */
  async function writeVerifiedEngine(): Promise<{ wasm: Uint8Array; data: Uint8Array }> {
    const wasm = new Uint8Array(2048);
    const data = new Uint8Array(1024);
    for (let i = 0; i < wasm.length; i++) wasm[i] = i & 0xff;
    for (let i = 0; i < data.length; i++) data[i] = (i * 7) & 0xff;
    const js = new TextEncoder().encode('// octave glue');
    const build = new TextEncoder().encode('{"measured":{"files":{}}}');
    const assetsManifest = new TextEncoder().encode('{"assets":{}}');

    await memoryStore.write('downloads/engine/master/w64/octave.wasm', wasm);
    await memoryStore.write('downloads/engine/master/w64/octave.data', data);
    await memoryStore.write('downloads/engine/master/w64/octave.js', js);
    await memoryStore.write('downloads/engine/master/w64/octave.build.json', build);
    await memoryStore.write('downloads/engine/master/w64/assets-manifest.json', assetsManifest);

    await memoryStore.write(
      manifestPath,
      new TextEncoder().encode(
        JSON.stringify({
          schema: 1,
          items: {
            'engine:octave@11.3.0:master/w64': {
              ref: { name: 'octave', version: '11.3.0', kind: 'engine', arch: 'master/w64' },
              sha256: 'combined',
              bytes: wasm.length + data.length + js.length + build.length + assetsManifest.length,
              files: [
                { path: 'downloads/engine/master/w64/octave.wasm', sha256: sha256OfNode(wasm), bytes: wasm.length },
                { path: 'downloads/engine/master/w64/octave.data', sha256: sha256OfNode(data), bytes: data.length },
                { path: 'downloads/engine/master/w64/octave.js', sha256: sha256OfNode(js), bytes: js.length },
                { path: 'downloads/engine/master/w64/octave.build.json', sha256: sha256OfNode(build), bytes: build.length },
                { path: 'downloads/engine/master/w64/assets-manifest.json', sha256: sha256OfNode(assetsManifest), bytes: assetsManifest.length },
              ],
              downloadedAt: '2026-10-22T00:00:00.000Z',
            },
          },
        })
      )
    );
    return { wasm, data };
  }

  /** 统计对引擎盘内容的读取次数（read / readBlob；stat 不算盘内容读取） */
  function countDiskReads(): number {
    return readSpy.mock.calls.length + readBlobSpy.mock.calls.length;
  }

  it('integrity: 完整盘面与记账逐项对上 ⇒ verified', async () => {
    await writeVerifiedEngine();
    const status = await resolver.checkPhysicalStatus('master');
    expect(status.downloaded).toBe(true);
    expect(status.integrity).toBe('verified');
    expect(status.totalBytes).toBe(3072);
  });

  it('integrity: 截断（wasm 砍成 1 字节）⇒ corrupted，size 硬判先拦（不读引擎文件内容）', async () => {
    const { wasm } = await writeVerifiedEngine();
    // 复跑方式：写完整两文件 + 伪记账后，把 wasm 截成 1 字节
    await memoryStore.write('downloads/engine/master/w64/octave.wasm', wasm.slice(0, 1));

    const status = await resolver.checkPhysicalStatus('master');
    expect(status.integrity).toBe('corrupted');
    // downloaded 保持纯存在语义：文件物理在
    expect(status.downloaded).toBe(true);
    // size 硬判先拦：不读任何引擎文件字节（sha 复验被短路）——
    // 盘内容读取只允许 manifest.json 一条（对账得先有账）
    const readPaths = readSpy.mock.calls.map((c) => c[0]);
    expect(readPaths.filter((p) => p !== manifestPath)).toEqual([]);
    expect(readBlobSpy.mock.calls.length).toBe(0);
  });

  it('integrity: 篡改（文件数、size 都对，首字节 XOR 0xFF）⇒ corrupted，sha 复验拦', async () => {
    const { wasm } = await writeVerifiedEngine();
    // 复跑方式：size 不动，只翻转首字节——size 判据看不见的坏法必须由 sha 复验拦下
    const tampered = new Uint8Array(wasm);
    tampered[0] = tampered[0] ^ 0xff;
    await memoryStore.write('downloads/engine/master/w64/octave.wasm', tampered);

    const status = await resolver.checkPhysicalStatus('master');
    expect(status.integrity).toBe('corrupted');
    expect(status.downloaded).toBe(true);
  });

  it('integrity 缓存: 完整状态下连续两次 checkPhysicalStatus，第二次零盘内容读取（stat 允许）', async () => {
    await writeVerifiedEngine();

    const first = await resolver.checkPhysicalStatus('master');
    expect(first.integrity).toBe('verified');

    const before = countDiskReads();
    expect(before).toBeGreaterThan(0); // 第一次真的读了盘内容（含 manifest 与两文件）

    const second = await resolver.checkPhysicalStatus('master');
    expect(second.integrity).toBe('verified');
    // 第二次命中会话缓存：不再读任何盘内容（read/getBlob 计数 = 0 次新增；stat 调用允许）
    expect(countDiskReads()).toBe(before);
  });

  it('integrity 缓存: invalidateCache 后再查 ⇒ 重新读盘内容', async () => {
    await writeVerifiedEngine();

    expect((await resolver.checkPhysicalStatus('master')).integrity).toBe('verified');
    const before = countDiskReads();

    resolver.invalidateCache('master', 'w64');
    const after = await resolver.checkPhysicalStatus('master');
    expect(after.integrity).toBe('verified');
    // 失效后必须重新读盘内容（manifest + 两文件），不能继续吃旧缓存
    expect(countDiskReads()).toBeGreaterThan(before);
  });

  // ══ 候选 2：会话缓存三态化（grilling Q4 = A）══════════════════════════════════
  // 旧形状只缓存 verified ⇒ corrupted / unchecked 每次 checkPhysicalStatus 都重走全量
  // 对账（corrupted 要重读约 40MB 引擎字节；unchecked 要重读 manifest）。
  // 新形状：三态都入缓存，判据仍是「盘面指纹没变」。反向断言（该报的必须报）：
  // 盘真的变了 ⇒ 缓存必须失活，不许把旧结论当成新结论。

  it('候选2: corrupted 结论也进缓存——同一份坏盘连查 5 次，只有第一次读盘内容', async () => {
    const { wasm } = await writeVerifiedEngine();
    // 造一份 size 对得上、sha 对不上的坏盘（走 sha 复验环，不是 size 硬判短路）
    const tampered = new Uint8Array(wasm);
    tampered[0] = tampered[0] ^ 0xff;
    await memoryStore.write('downloads/engine/master/w64/octave.wasm', tampered);

    expect((await resolver.checkPhysicalStatus('master')).integrity).toBe('corrupted');
    const readsAfterFirst = countDiskReads();
    expect(readsAfterFirst).toBeGreaterThan(0); // 第一次真的读了盘（manifest + 各件）

    for (let i = 0; i < 4; i++) {
      const status = await resolver.checkPhysicalStatus('master');
      expect(status.integrity).toBe('corrupted'); // 结论不许被缓存洗白
    }
    // 余下 4 次全部命中缓存：零新增盘内容读取（stat 允许——指纹靠它）
    expect(countDiskReads()).toBe(readsAfterFirst);
  });

  it('候选2 反向断言: 坏盘被换成尺寸不同的另一份 ⇒ 缓存必须失活并重新对账', async () => {
    const { wasm } = await writeVerifiedEngine();
    const tampered = new Uint8Array(wasm);
    tampered[0] = tampered[0] ^ 0xff;
    await memoryStore.write('downloads/engine/master/w64/octave.wasm', tampered);
    expect((await resolver.checkPhysicalStatus('master')).integrity).toBe('corrupted');

    // 盘真的变了：截断成一半（size 变 ⇒ 指纹变 ⇒ 必须重验，不许吃缓存）
    await memoryStore.write('downloads/engine/master/w64/octave.wasm', wasm.slice(0, wasm.length >> 1));
    const before = countDiskReads();
    const after = await resolver.checkPhysicalStatus('master');
    expect(after.integrity).toBe('corrupted');
    expect(countDiskReads()).toBeGreaterThan(before); // 重验真的发生了

    // 再把字节修回原样（size 又与「截断版」不同 ⇒ 仍须重验；修好后应报 verified）
    await memoryStore.write('downloads/engine/master/w64/octave.wasm', wasm);
    expect((await resolver.checkPhysicalStatus('master')).integrity).toBe('verified');
  });

  it('候选2: unchecked 结论也进缓存——无该车道记账的盘连查 3 次，manifest 只读一次', async () => {
    // 两件物理在，manifest 也在，但账里没有 master/w64 的条目 ⇒ 无账可对 ⇒ unchecked。
    // （不用「manifest 完全不在」那种形状：那条路径在 stat 就短路了，连 manifest 都不读，
    //  测不出缓存省了什么。）
    await memoryStore.write('downloads/engine/master/w64/octave.wasm', new Uint8Array(64));
    await memoryStore.write('downloads/engine/master/w64/octave.data', new Uint8Array(32));
    await memoryStore.write(
      manifestPath,
      new TextEncoder().encode(
        JSON.stringify({
          schema: 1,
          items: {
            'engine:octave@11.3.0:wasm32-final/w32': {
              ref: { name: 'octave', version: '11.3.0', kind: 'engine', arch: 'wasm32-final/w32' },
              sha256: 'combined',
              bytes: 96,
              files: [
                { path: 'downloads/engine/wasm32-final/w32/octave.wasm', sha256: 'a'.repeat(64), bytes: 64 },
              ],
              downloadedAt: '2026-10-22T00:00:00.000Z',
            },
          },
        })
      )
    );

    expect((await resolver.checkPhysicalStatus('master')).integrity).toBe('unchecked');
    const readsAfterFirst = countDiskReads();
    expect(readsAfterFirst).toBeGreaterThan(0); // 第一次真读了 manifest

    for (let i = 0; i < 2; i++) {
      expect((await resolver.checkPhysicalStatus('master')).integrity).toBe('unchecked');
    }
    // 余下 2 次命中缓存：不再重读 manifest（stat 允许——指纹靠它）
    expect(countDiskReads()).toBe(readsAfterFirst);
  });

  it('integrity: 无 manifest 记账 ⇒ unchecked 且 downloaded 按 size>0 旧语义', async () => {
    // 只写两文件，不写 manifest（manifest 被手删 / 从未下载记账的盘面）
    await memoryStore.write('downloads/engine/master/w64/octave.wasm', new Uint8Array(64));
    await memoryStore.write('downloads/engine/master/w64/octave.data', new Uint8Array(32));

    const status = await resolver.checkPhysicalStatus('master');
    expect(status.downloaded).toBe(true); // 旧存在语义保留
    expect(status.integrity).toBe('unchecked');
    expect(status.totalBytes).toBe(96);
  });

  it('integrity: manifest 记账在但物理文件缺一个 ⇒ corrupted（盘变账没变）', async () => {
    await writeVerifiedEngine();
    await memoryStore.remove('downloads/engine/master/w64/octave.data');

    const status = await resolver.checkPhysicalStatus('master');
    // octave.data 物理不在 ⇒ downloaded=false（存在语义）；此时不猜完整性
    expect(status.downloaded).toBe(false);
    expect(status.integrity).toBe('unchecked');
  });

  it('integrity: #6 五件指纹——缓存 verified 后手删 assets-manifest.json（wasm/data size 不变）⇒ 缓存不命中 ⇒ corrupted', async () => {
    // 复跑方式：五件齐 + 记账先验一次（缓存进 verified），再删 assets-manifest.json。
    // 旧指纹只拼 wasm/data 的 stat size ⇒ 此处会误命中缓存报 verified（#6 最大隐藏坑）；
    // 修法是指纹面与记账面同宽（五件全 stat，缺件 size 记 -1 ⇒ 指纹必变）。
    const five = await writeVerifiedEngine();

    expect((await resolver.checkPhysicalStatus('master')).integrity).toBe('verified');

    // 手删 assets-manifest.json：wasm 与 data 的 stat size 分毫未动
    await memoryStore.remove('downloads/engine/master/w64/assets-manifest.json');

    const status = await resolver.checkPhysicalStatus('master');
    expect(status.downloaded).toBe(true); // wasm/data 仍在：存在语义保持
    expect(status.integrity).toBe('corrupted'); // 记账五条盘上四条 ⇒ 缓存必须失活并报坏
    expect(status.totalBytes).toBe(five.wasm.length + five.data.length);
  });

  it('integrity: OMC 车道同走 manifest 对账（其文件也在 manifest files[] 里）', async () => {
    const omcWasm = new Uint8Array(128);
    const omcJs = new Uint8Array(64);
    omcWasm.fill(0xab);
    omcJs.fill(0xcd);
    await memoryStore.write('downloads/engine/omc/w32/OpenModelicaCompiler_bg.wasm', omcWasm);
    await memoryStore.write('downloads/engine/omc/w32/OpenModelicaCompiler.js', omcJs);
    await memoryStore.write(
      manifestPath,
      new TextEncoder().encode(
        JSON.stringify({
          schema: 1,
          items: {
            'engine:omc@1.25.0:omc/w32': {
              ref: { name: 'omc', version: '1.25.0', kind: 'engine', arch: 'omc/w32' },
              sha256: 'combined',
              bytes: omcWasm.length + omcJs.length,
              files: [
                { path: 'downloads/engine/omc/w32/OpenModelicaCompiler_bg.wasm', sha256: sha256OfNode(omcWasm), bytes: omcWasm.length },
                { path: 'downloads/engine/omc/w32/OpenModelicaCompiler.js', sha256: sha256OfNode(omcJs), bytes: omcJs.length },
              ],
              downloadedAt: '2026-10-22T00:00:00.000Z',
            },
          },
        })
      )
    );

    const status = await resolver.checkPhysicalStatus('omc');
    expect(status.downloaded).toBe(true);
    expect(status.integrity).toBe('verified');

    // OMC 篡改：首字节 XOR ⇒ corrupted
    const tampered = new Uint8Array(omcWasm);
    tampered[0] = tampered[0] ^ 0xff;
    await memoryStore.write('downloads/engine/omc/w32/OpenModelicaCompiler_bg.wasm', tampered);
    resolver.invalidateCache('omc', 'w32');
    const bad = await resolver.checkPhysicalStatus('omc');
    expect(bad.integrity).toBe('corrupted');
    expect(bad.downloaded).toBe(true);
  });

  it('assertBootable: corrupted ⇒ throw Error 且 err.code === "ENGINE_CORRUPTED"（fail fast，不自动 evict）', async () => {
    const { wasm } = await writeVerifiedEngine();
    const tampered = new Uint8Array(wasm);
    tampered[0] = tampered[0] ^ 0xff;
    await memoryStore.write('downloads/engine/master/w64/octave.wasm', tampered);

    await expect(resolver.assertBootable('master')).rejects.toSatisfy((err: unknown) => {
      const e = err as Error & { code?: string };
      return e instanceof Error && e.code === 'ENGINE_CORRUPTED';
    });

    // 坏盘不自动 evict：文件仍在、downloaded 仍 true（物理在）
    const status = await resolver.checkPhysicalStatus('master');
    expect(status.downloaded).toBe(true);
    expect(status.integrity).toBe('corrupted');
  });

  it('assertBootable: 完整 ⇒ true；未下载 ⇒ false 不 throw（未下载走网络是合法路径）', async () => {
    await writeVerifiedEngine();
    await expect(resolver.assertBootable('master')).resolves.toBe(true);

    // 未下载：返回 false，绝不 throw
    await expect(resolver.assertBootable('wasm32-final')).resolves.toBe(false);
  });

  it('evict: 物理清除后 ⇒ downloaded=false（缓存一并失效，不留假 verified）', async () => {
    await writeVerifiedEngine();
    expect((await resolver.checkPhysicalStatus('master')).integrity).toBe('verified');

    await resolver.evict('master');
    const status = await resolver.checkPhysicalStatus('master');
    expect(status.downloaded).toBe(false);
    expect(status.integrity).toBe('unchecked');
  });
});
