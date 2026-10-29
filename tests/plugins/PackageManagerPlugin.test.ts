// tests/plugins/PackageManagerPlugin.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PackageManagerPlugin } from '../../src/modules/plugins/package/PackageManagerPlugin';
import { MockAssetsAdapter } from '../../src/modules/plugins/package/MockAssetsAdapter';
import type { ForgeCatalog } from '../../src/modules/plugins/package/types';
import { DownloadStore } from '../../src/modules/storage/DownloadStore';
import { MemoryStore } from '../../src/modules/storage/MemoryStore';
import { MockFetchAdapter } from '../../src/modules/storage/FetchPort';
import { DownloadError } from '../../src/modules/storage/downloadTypes';

describe('PackageManagerPlugin Deep Module', () => {
  let mockAdapter: MockAssetsAdapter;
  let plugin: PackageManagerPlugin;

  const sampleCatalog: ForgeCatalog = {
    schema: 2,
    octave: '11.3.0',
    packs: [
      {
        name: 'cgi',
        version: '0.1.2',
        size: 9960,
        form: 'pkg',
        role: 'package',
        content: ['m'],
        consumer: 'octave',
        deps: [],
        description: 'Common Gateway Interface for Octave',
        versions: [
          {
            version: '0.1.2',
            stage: 'staged',
            form: 'pkg',
            content: ['m'],
            size: 9960,
          },
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
        size: 276452,
        form: 'pkg',
        role: 'package',
        content: ['m'],
        consumer: 'octave',
        deps: ['pyodide'],
        description: 'Symbolic computations via Pyodide/SymPy',
        versions: [
          {
            version: '3.2.2',
            stage: 'staged',
            form: 'pkg',
            content: ['m'],
            size: 276452,
          },
        ],
      },
      {
        name: 'pyodide',
        version: '0.26.2',
        size: 22013349,
        form: 'tree',
        role: 'language-bridge',
        content: [], // 能力层：content 为空数组，非未知
        consumer: 'octave',
        deps: [],
        description: 'WebAssembly Python Runtime capability layer',
      },
      {
        name: 'signal',
        version: '1.4.5',
        size: 345000,
        form: 'pkg',
        role: 'package',
        content: ['m', 'src'],
        consumer: 'octave',
        deps: ['control'],
        description: 'Signal processing package',
      },
      {
        name: 'control',
        version: '4.0.1',
        size: 210000,
        form: 'pkg',
        role: 'package',
        content: ['m'],
        consumer: 'octave',
        deps: [],
        description: 'Control systems package',
      },
      {
        name: 'omc-simulator',
        version: '1.2.0',
        size: 512000,
        form: 'pkg',
        role: 'package',
        content: ['m'],
        consumer: 'omc',
        deps: [],
        description: 'OpenModelica compiler runner for Octave',
      },
      {
        name: 'dual-tool',
        version: '1.0.0',
        size: 12000,
        form: 'pkg',
        role: 'package',
        content: ['m'],
        consumer: ['octave', 'omc'],
        deps: [],
        description: 'Dual engine compatible package',
      },
    ],
  };

  beforeEach(() => {
    mockAdapter = new MockAssetsAdapter(sampleCatalog);
    plugin = new PackageManagerPlugin(mockAdapter, makeStore());
  });

  /**
   * 测试用 store：与组合根同形（显式 storage），**不是**插件自带 fallback。
   * 旧实现对「无注入」的唯一出路是构造器静默 new 一个无 storage 的 DownloadStore，
   * 那条路已删（装配缺陷必须响亮）。
   */
  function makeStore(): DownloadStore {
    return new DownloadStore({ storage: new MemoryStore(), baseUrl: 'https://octave.test' });
  }

  it('initializes with correct plugin metadata and state', () => {
    expect(plugin.id).toBe('package-manager');
    expect(plugin.enabled).toBe(true);
    expect(plugin.getCatalog()).toBeNull();
    expect(plugin.isLoading()).toBe(false);
  });

  it('loads catalog and indexes packages by name', async () => {
    const cat = await plugin.loadCatalog();
    expect(cat.packs.length).toBe(7);
    expect(plugin.getCatalog()).toEqual(sampleCatalog);

    const symbolic = plugin.getPackage('symbolic');
    expect(symbolic).toBeDefined();
    expect(symbolic?.name).toBe('symbolic');
    expect(symbolic?.deps).toEqual(['pyodide']);

    const pyodide = plugin.getPackage('pyodide');
    expect(pyodide?.form).toBe('tree');
    expect(pyodide?.content).toEqual([]);
  });

  it('retrieves version candidates with staged and withheld states', async () => {
    await plugin.loadCatalog();
    const cgiVersions = plugin.getVersions('cgi');
    expect(cgiVersions.length).toBe(2);

    const vLatest = cgiVersions.find((v) => v.version === '0.1.2');
    expect(vLatest?.stage).toBe('staged');

    const vOld = cgiVersions.find((v) => v.version === '0.1.0');
    expect(vOld?.stage).toBe('withheld');
    expect(vOld?.withheld_cause).toBe('bytes-not-staged');
  });

  it('computes dependency closure accurately without infinite loops', async () => {
    await plugin.loadCatalog();
    const closure = plugin.computeDependencyClosure('symbolic');
    expect(closure.has('symbolic')).toBe(true);
    expect(closure.has('pyodide')).toBe(true);

    const signalClosure = plugin.computeDependencyClosure('signal');
    expect(signalClosure.has('signal')).toBe(true);
    expect(signalClosure.has('control')).toBe(true);
  });

  it('calculates extra download estimate by summing form:tree items in closure', async () => {
    await plugin.loadCatalog();
    // symbolic depends on pyodide (form: tree, size: 22013349)
    const extraForSymbolic = plugin.estimateExtraDownload('symbolic');
    expect(extraForSymbolic).toBe(22013349);

    // signal depends on control (form: pkg, not tree) => extra tree bytes is 0
    const extraForSignal = plugin.estimateExtraDownload('signal');
    expect(extraForSignal).toBe(0);

    // cgi has no deps => extra is 0
    const extraForCgi = plugin.estimateExtraDownload('cgi');
    expect(extraForCgi).toBe(0);
  });

  it('delegates status checks to port without inventing UI secondary truth', async () => {
    await plugin.loadCatalog();

    // Mock initial status
    mockAdapter.setStatus('cgi', {
      compatible: true,
      fromSource: false,
      installed: false,
    });
    mockAdapter.setStatus('signal', {
      compatible: true,
      fromSource: true,
      installed: true,
    });

    const cgiStatus = plugin.getStatus('cgi');
    expect(cgiStatus.compatible).toBe(true);
    expect(cgiStatus.fromSource).toBe(false);
    expect(cgiStatus.installed).toBe(false);

    const signalStatus = plugin.getStatus('signal');
    expect(signalStatus.installed).toBe(true);
    expect(signalStatus.fromSource).toBe(true);
  });

  it('handles planOnly resolution through engine port', async () => {
    await plugin.loadCatalog();
    mockAdapter.setInstallPlan('symbolic', {
      bytes: 22289801,
      layers: ['pyodide'],
    });

    const plan = await plugin.planInstall('symbolic');
    expect(plan.name).toBe('symbolic');
    expect(plan.bytes).toBe(22289801);
    expect(plan.layers).toEqual(['pyodide']);
    expect(plan.extraSize).toBe(22013349);
  });

  it('tracks installation progress and updates installed state', async () => {
    await plugin.loadCatalog();
    expect(plugin.isInstalling('cgi')).toBe(false);

    let notifyCount = 0;
    const unsub = plugin.subscribe(() => {
      notifyCount++;
    });

    const installPromise = plugin.installPackage('cgi');
    expect(plugin.isInstalling('cgi')).toBe(true);

    const result = await installPromise;
    expect(result.state).toBe('ok');
    expect(plugin.isInstalling('cgi')).toBe(false);
    expect(plugin.getStatus('cgi').installed).toBe(true);
    expect(notifyCount).toBeGreaterThanOrEqual(2);

    unsub();
  });

  it('correctly maps four-state install verdicts (ok, failed, not-found, cannot-know)', async () => {
    await plugin.loadCatalog();

    mockAdapter.setInstallResult('not_exist', {
      state: 'not-found',
      cause: 'package-not-in-catalog',
      message: 'Package not found',
    });

    const notFoundRes = await plugin.installPackage('not_exist');
    expect(notFoundRes.state).toBe('not-found');
    expect(notFoundRes.cause).toBe('package-not-in-catalog');

    mockAdapter.setInstallResult('broken', {
      state: 'failed',
      cause: 'download-checksum-mismatch',
      message: 'Checksum error',
    });

    const failedRes = await plugin.installPackage('broken');
    expect(failedRes.state).toBe('failed');
    expect(failedRes.cause).toBe('download-checksum-mismatch');
  });

  it('filters packages by consumer engine, form, installed state, and search query', async () => {
    await plugin.loadCatalog();
    mockAdapter.setStatus('cgi', { installed: true });

    // 1. Consumer filter (dual-tool with array consumer ['octave', 'omc'] matches both)
    const octaveOnly = plugin.filterPackages({ consumer: 'octave' });
    expect(octaveOnly.map((p) => p.name)).toEqual(['cgi', 'symbolic', 'pyodide', 'signal', 'control', 'dual-tool']);

    const omcOnly = plugin.filterPackages({ consumer: 'omc' });
    expect(omcOnly.map((p) => p.name)).toEqual(['omc-simulator', 'dual-tool']);

    // 2. Form filter
    const treeOnly = plugin.filterPackages({ form: 'tree' });
    expect(treeOnly.map((p) => p.name)).toEqual(['pyodide']);

    const pkgOnly = plugin.filterPackages({ form: 'pkg' });
    expect(pkgOnly.map((p) => p.name)).toEqual(['cgi', 'symbolic', 'signal', 'control', 'omc-simulator', 'dual-tool']);

    // 3. Installed only
    const installed = plugin.filterPackages({ installedOnly: true });
    expect(installed.map((p) => p.name)).toEqual(['cgi']);

    // 4. Query string
    const searchSym = plugin.filterPackages({ query: 'sympy' });
    expect(searchSym.map((p) => p.name)).toEqual(['symbolic']);

    const searchDep = plugin.filterPackages({ query: 'pyodide' });
    // matches pyodide itself and symbolic (which has pyodide in deps)
    expect(searchDep.map((p) => p.name)).toContain('symbolic');
    expect(searchDep.map((p) => p.name)).toContain('pyodide');
  });

  it('enforces Ruling ⑤: blocks compiling source package if LLVM is missing, succeeds when LLVM is present', async () => {
    await plugin.loadCatalog();

    // signal 包含 'src'，属于源码加速包
    expect(await plugin.hasLLVM()).toBe(false);

    // 未下载 LLVM 时，直接 installPackage 或 compilePackage 必须被裁决⑤拦截
    const blockedInstall = await plugin.installPackage('signal');
    expect(blockedInstall.state).toBe('failed');
    expect(blockedInstall.why).toBe('llvm_required');

    const blockedRes = await plugin.compilePackage('signal');
    expect(blockedRes.state).toBe('failed');
    expect(blockedRes.why).toBe('llvm_required');
    expect(blockedRes.diagnostics[0]).toContain('[ruling-5]');

    // 模拟将 llvm-wasm 记录写入 DownloadStore
    const downloadStore = plugin.getDownloadStore();
    await downloadStore.init();
    // 注入 llvm 资产 (6.0.12 单一权威版本)
    (downloadStore as any).manifest.items['llvm-wasm@6.0.12'] = {
      ref: { name: 'llvm-wasm', version: '6.0.12', kind: 'runtime' },
      sha256: 'cd6450fe7944875cb39f8e4a0790d5a08e032044f1db89054dadcabb749b20ce',
      bytes: 34693729,
      files: [{ path: 'downloads/runtime/llvm-wasm/6.0.12/llvm-wasm-6.0.12.tar.gz', bytes: 34693729, sha256: 'cd6450fe7944875cb39f8e4a0790d5a08e032044f1db89054dadcabb749b20ce' }],
      downloadedAt: new Date().toISOString(),
      provenanceUrl: 'https://octave.test/assets/runtimes/llvm-wasm-6.0.12.tar.gz',
    };

    expect(await plugin.hasLLVM()).toBe(true);

    // LLVM 就绪后，编译 signal 应通过并产生实时诊断日志流
    const diagnosticsStream: string[] = [];
    const compileRes = await plugin.compilePackage('signal', {
      onDiagnostic: (line) => {
        diagnosticsStream.push(line);
      },
    });

    expect(compileRes.state).toBe('ok');
    expect(compileRes.diagnostics.length).toBeGreaterThanOrEqual(3);
    expect(diagnosticsStream.length).toBeGreaterThanOrEqual(3);
    expect(diagnosticsStream).toContain('[compile] Emitted signal.oct');
  });

  it('forbids installing role: toolchain packages and returns NOT_INSTALLABLE (mail/024 & Q1)', async () => {
    await plugin.loadCatalog();
    const res = await plugin.installPackage('llvm-wasm');
    expect(res.state).toBe('failed');
    expect(res.why).toBe('NOT_INSTALLABLE');
    expect(res.cause).toBe('NOT_INSTALLABLE');
    expect(res.message).toContain('编译工具链');

    // 验证任意带 role: 'toolchain' 的条目均被消费端拦截
    const customToolchainCat: ForgeCatalog = {
      packs: [
        {
          name: 'zig-wasm',
          version: '0.11.0',
          role: 'toolchain',
          form: 'tree',
          size: 50000,
          consumer: ['octave'],
        },
      ],
    };
    const customAdapter = new MockAssetsAdapter(customToolchainCat);
    const customPlugin = new PackageManagerPlugin(customAdapter);
    await customPlugin.loadCatalog();
    const customRes = await customPlugin.installPackage('zig-wasm');
    expect(customRes.state).toBe('failed');
    expect(customRes.why).toBe('NOT_INSTALLABLE');
    expect(customRes.cause).toBe('NOT_INSTALLABLE');
    expect(customRes.message).toBe('zig-wasm 是编译工具链，由下载管理（DownloadStore），不走装载');
  });

  it('permits installing role: language-bridge packages through interpreter layer', async () => {
    await plugin.loadCatalog();
    const res = await plugin.installPackage('pyodide');
    expect(res.state).toBe('ok');
    expect(res.installed).toEqual(['pyodide']);
  });

  it('getAssetsPort() returns the port injected via constructor (issue #8 Q8.1)', () => {
    // 构造注入的 port 必须原样出站——插件是 seam 持有者，port 单一出口
    const port = plugin.getAssetsPort();
    expect(port).toBe(mockAdapter);
    // setPort 换 port 后访问器必须跟随
    const replacement = new MockAssetsAdapter();
    plugin.setPort(replacement);
    expect(plugin.getAssetsPort()).toBe(replacement);
    plugin.setPort(mockAdapter);
  });

  it('getAssetsPort().fetchCatalog() is callable and returns the synthetic catalog of the adapter (issue #8 Q8.1)', async () => {
    const cat = await plugin.getAssetsPort().fetchCatalog();
    // MockAssetsAdapter.fetchCatalog 返回深拷贝，按内容断言合成目录
    expect(cat.packs.length).toBe(sampleCatalog.packs.length);
    expect(cat.packs.map((p) => p.name)).toEqual(sampleCatalog.packs.map((p) => p.name));
    expect(cat.schema).toBe(sampleCatalog.schema);
  });

  it('DownloadStore catalogProvider closure via plugin.getAssetsPort does not throw TypeError (issue #8 Q8.4 反向断言)', async () => {
    // 模拟 appContext.ts 的接线形状：catalogProvider 闭包经 plugin.getAssetsPort().fetchCatalog()
    const memoryStore = new MemoryStore();
    await memoryStore.init();
    const mockFetch = new MockFetchAdapter();
    // 静态侧（KNOWN_ENGINE_METADATA）的 omc 分件 sha，让整链路可走完
    mockFetch.setFile(
      'https://octave.test/omc/OpenModelicaCompiler_bg.wasm',
      'omc-wasm',
      '8287589ebdb53b4cc37c337c2ae88f798d8889f7ac3c29d693ca12e539b8d001'
    );
    mockFetch.setFile(
      'https://octave.test/omc/OpenModelicaCompiler.js',
      'omc-js',
      '56c399bd455d57c8e21206287445643b81db6fd4e3ac183989616b903d165f17'
    );
    const store = new DownloadStore({
      storage: memoryStore,
      fetchPort: mockFetch,
      baseUrl: 'https://octave.test',
      catalogProvider: () => plugin.getAssetsPort().fetchCatalog(),
    });
    await store.init();

    // 直接调 provider：必须解析出目录而不抛 "is not a function"
    const cat = await (store as any).catalogProvider();
    expect(Array.isArray(cat.packs)).toBe(true);

    // 经 downloadEngine('omc') 整链路：provider 被真实消费，不允许吐出代码级 TypeError
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let brokenCalls: any[][] = [];
    try {
      const rec = await store.downloadEngine('omc');
      // catalog 无 omc 条目（合成目录 packs 不含 omc）⇒ 回退 KNOWN_ENGINE_METADATA 静态侧
      expect(rec.ref.name).toBe('omc');
      expect(rec.bytes).toBeGreaterThan(0);
      // #12 Q12.2：静态回退侧无顶层聚合 sha（拼接串产地已删）——多文件
      // record 的顶层 sha = undefined；分件 sha = KNOWN_ENGINE_METADATA['omc'].files 真值
      expect(rec.sha256).toBeUndefined();
      expect(rec.files.map((f) => f.sha256)).toEqual([
        '8287589ebdb53b4cc37c337c2ae88f798d8889f7ac3c29d693ca12e539b8d001',
        '56c399bd455d57c8e21206287445643b81db6fd4e3ac183989616b903d165f17',
      ]);
    } finally {
      brokenCalls = errSpy.mock.calls.filter(
        (c) => typeof c[0] === 'string' && c[0].includes('catalog provider is broken')
      );
      errSpy.mockRestore();
    }
    // 分级判据：合法降级路径不许触发「catalog provider is broken」响亮报
    expect(brokenCalls.length).toBe(0);
  });

  it('resolves omc engine metadata from catalog真值 when the pack entry exists (issue #8 Q8.4)', async () => {
    // 合成 catalog 携带 omc 条目（含 size/sha256/files），动态 catalog 必须覆盖静态手抄侧
    // #12 Q12.3：intake 断言只放行真 64hex ⇒ mock 分件 sha 真算
    function sha256OfNode(data: string): string {
      const nodeCrypto = require('node:crypto') as typeof import('node:crypto');
      return nodeCrypto.createHash('sha256').update(data).digest('hex');
    }
    const catWasmSha = sha256OfNode('a'.repeat(12000));
    const catJsSha = sha256OfNode('b'.repeat(345));
    const omcCatalog: ForgeCatalog = {
      packs: [
        {
          name: 'omc',
          version: '1.25.0',
          form: 'tree',
          content: [],
          size: 12345,
          // 顶层 sha256 不再被消费（#12 Q12.2：聚合 sha 产地删除，只取 files）
          sha256: 'catalog-omc-combined-sha',
          files: {
            'OpenModelicaCompiler_bg.wasm': { bytes: 12000, sha256: catWasmSha },
            'OpenModelicaCompiler.js': { bytes: 345, sha256: catJsSha },
          },
        } as any,
      ],
    };
    const omcAdapter = new MockAssetsAdapter(omcCatalog);
    const omcPlugin = new PackageManagerPlugin(omcAdapter);

    const memoryStore = new MemoryStore();
    await memoryStore.init();
    const mockFetch = new MockFetchAdapter();
    // 分件按 catalog files 的 sha256 抓取校验——mock 文件必须带同一 sha 才能走完链路
    mockFetch.setFile('https://octave.test/omc/OpenModelicaCompiler_bg.wasm', 'a'.repeat(12000), catWasmSha);
    mockFetch.setFile('https://octave.test/omc/OpenModelicaCompiler.js', 'b'.repeat(345), catJsSha);
    const store = new DownloadStore({
      storage: memoryStore,
      fetchPort: mockFetch,
      baseUrl: 'https://octave.test',
      catalogProvider: () => omcPlugin.getAssetsPort().fetchCatalog(),
      maxQuotaBytes: 1024 * 1024,
    });
    await store.init();

    const rec = await store.downloadEngine('omc');
    // record 的总字节必须来自 catalog files 累加真值，不是 KNOWN_ENGINE_METADATA
    expect(rec.bytes).toBe(12345);
    // #12 Q12.2：顶层聚合 sha 删除 ⇒ 多文件 record 顶层 sha = undefined
    // （catalog 顶层的 'catalog-omc-combined-sha' 装饰值不再被消费）
    expect(rec.sha256).toBeUndefined();
    // 文件级 sha 也必须用 catalog 值：分件下载项按 catalog files 的 sha256 抓取校验
    expect(rec.files.map((f) => f.sha256)).toEqual([catWasmSha, catJsSha]);
    expect(rec.files.map((f) => f.bytes)).toEqual([12000, 345]);
  });

  it('loudly reports catalog provider code defects while degrading silently on network-family errors (issue #8 Q8.2 分级)', async () => {
    const memoryStore = new MemoryStore();
    await memoryStore.init();
    const mockFetch = new MockFetchAdapter();
    // 三组对照共用静态侧 omc 分件 sha，保证降级链路本身可走完
    mockFetch.setFile(
      'https://octave.test/omc/OpenModelicaCompiler_bg.wasm',
      'omc-wasm',
      '8287589ebdb53b4cc37c337c2ae88f798d8889f7ac3c29d693ca12e539b8d001'
    );
    mockFetch.setFile(
      'https://octave.test/omc/OpenModelicaCompiler.js',
      'omc-js',
      '56c399bd455d57c8e21206287445643b81db6fd4e3ac183989616b903d165f17'
    );
    const store = new DownloadStore({
      storage: memoryStore,
      fetchPort: mockFetch,
      baseUrl: 'https://octave.test',
      // 模拟 appContext 接错缝的旧病：闭包引用不存在的方法 ⇒ TypeError 'is not a function'
      catalogProvider: () =>
        (plugin as any).missingAssetsPort().fetchCatalog(),
    });
    await store.init();

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let brokenCalls: any[][] = [];
    try {
      const rec = await store.downloadEngine('omc');
      // 降级仍然成立：静态 KNOWN_ENGINE_METADATA 兜底成功
      expect(rec.ref.name).toBe('omc');
    } finally {
      brokenCalls = errSpy.mock.calls.filter(
        (c) => typeof c[0] === 'string' && c[0].includes('catalog provider is broken')
      );
      errSpy.mockRestore();
    }

    // 代码缺陷必须响亮打出（不许无声吞掉死代码缝）
    expect(brokenCalls.length).toBe(1);
    expect(String((brokenCalls[0] as any[])[1])).toContain('is not a function');

    // 对照组：网络族错（'Failed to fetch'）必须静默降级，不许刷屏
    const networkStore = new DownloadStore({
      storage: memoryStore,
      fetchPort: mockFetch,
      baseUrl: 'https://octave.test',
      catalogProvider: async () => {
        throw new TypeError('Failed to fetch catalog from network');
      },
    });
    await networkStore.init();
    errSpy.mockClear();
    try {
      const rec = await networkStore.downloadEngine('omc');
      expect(rec.ref.name).toBe('omc');
    } finally {
      errSpy.mockRestore();
    }
    const networkBrokenCalls = errSpy.mock.calls.filter(
      (c) => typeof c[0] === 'string' && c[0].includes('catalog provider is broken')
    );
    expect(networkBrokenCalls.length).toBe(0);

    // 对照组：DownloadError（带 code 的合法降级路径）不许被打进 console.error
    const deStore = new DownloadStore({
      storage: memoryStore,
      fetchPort: mockFetch,
      baseUrl: 'https://octave.test',
      catalogProvider: () => {
        throw new DownloadError('INDEX_UNREADABLE', '目录读不出来');
      },
    });
    await deStore.init();
    errSpy.mockClear();
    try {
      const rec = await deStore.downloadEngine('omc');
      expect(rec.ref.name).toBe('omc');
    } finally {
      errSpy.mockRestore();
    }
    const deBrokenCalls = errSpy.mock.calls.filter(
      (c) => typeof c[0] === 'string' && c[0].includes('catalog provider is broken')
    );
    expect(deBrokenCalls.length).toBe(0);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 装配缺陷可见（内容仓 095 D11 落到本插件）：store 未注入 ⇒ 响亮失败。
  //
  // 旧实现的病灶：构造器静默 `new DownloadStore({catalogProvider})` 造出**第二个
  // 无 storage 的 store**（wayfinder #10 旁路实例），于是「忘了 setDownloadStore」
  // 不报错、不 throw —— 插件的写盘与 EngineAssetResolver 的验盘不是同一份盘，
  // 对账恒 unchecked、evict 清错盘，而测试全绿。
  //
  // 反向断言（旧代码必须红）：无注入 + 直接用 ⇒ throw + console.error；
  // 正向断言（行为零变化）：有注入 ⇒ 完全照旧。
  // ─────────────────────────────────────────────────────────────────────────

  it('无注入 + 首次使用 store ⇒ 响亮失败（throw ASSEMBLY_FAULT，不许静默造 fallback store）', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const bare = new PackageManagerPlugin(mockAdapter);

      // 构造期**不许** throw —— 启动序是「先 new，后 setDownloadStore」，
      // 构造期判死会把正常启动序当缺陷。
      expect(() => new PackageManagerPlugin(mockAdapter)).not.toThrow();

      // 首次使用才判死：三条 store 消费路径逐一验证
      expect(() => bare.getDownloadStore()).toThrow(/assembly fault/i);
      await expect(bare.hasLLVM()).rejects.toThrow(/assembly fault/i);
      await expect(
        bare.downloadPackage({ name: 'llvm-wasm', version: '6.0.12', kind: 'pre', arch: null })
      ).rejects.toMatchObject({ code: 'ASSEMBLY_FAULT' });

      // 判定为「装配缺陷」而非「能力暂不可用」：console.error 必须出过声
      const faults = errSpy.mock.calls
        .map((c) => String(c[0]))
        .filter((m) => m.includes('[PackageManagerPlugin] assembly fault'));
      expect(faults.length).toBeGreaterThan(0);
    } finally {
      errSpy.mockRestore();
    }
  });

  it('装配缺陷只报一次/实例（不刷屏）', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const bare = new PackageManagerPlugin(mockAdapter);
      for (let i = 0; i < 3; i++) {
        expect(() => bare.getDownloadStore()).toThrow();
      }
      const faults = errSpy.mock.calls
        .map((c) => String(c[0]))
        .filter((m) => m.includes('[PackageManagerPlugin] assembly fault'));
      expect(faults.length).toBe(1);
    } finally {
      errSpy.mockRestore();
    }
  });

  it('后置 setDownloadStore 生效：注入前响亮失败，注入后同一实例照常工作（启动序回归锁）', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      // appContext.ts 的形状：plugins/index.ts 先无参 new，之后才后置注入
      const late = new PackageManagerPlugin(mockAdapter);
      expect(() => late.getDownloadStore()).toThrow(/assembly fault/i);

      const injected = makeStore();
      await injected.init();
      late.setDownloadStore(injected);

      // 注入后行为零变化：拿到的是**同一个** store 实例（不是又造一个）
      expect(late.getDownloadStore()).toBe(injected);
      expect(await late.hasLLVM()).toBe(false);
    } finally {
      errSpy.mockRestore();
    }
  });

  it('有注入 ⇒ 行为零变化：store 就是注入的那一个，且不报装配缺陷', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const injected = makeStore();
      const wired = new PackageManagerPlugin(mockAdapter, injected);
      expect(wired.getDownloadStore()).toBe(injected);
      expect(await wired.hasLLVM()).toBe(false);
      const faults = errSpy.mock.calls
        .map((c) => String(c[0]))
        .filter((m) => m.includes('assembly fault'));
      expect(faults.length).toBe(0);
    } finally {
      errSpy.mockRestore();
    }
  });

  // ── 组合根接线锁（D11 的直接回归锁，与 webmcp-assembly ★① 同款）──────────
  // 上面四条只证明「插件自身会响亮失败」；本条证明**产物真的把 store 接上了**
  // —— 否则插件会在真实运行里响亮地炸，而单测全绿（D11 的原始形状）。
  it('★ 组合根真装配：appContext 后置注入的就是那个 store（删 appContext:85 则本用例红）', async () => {
    vi.resetModules();
    const app = await import('../../src/modules/appContext');
    // 插件持有的 store 必须**严格等于**组合根创建的 downloadStore 单例
    expect(app.packageManagerPlugin.getDownloadStore()).toBe(app.downloadStore);
    // 且可以真的用（不是拿了个空壳）
    expect(await app.packageManagerPlugin.hasLLVM()).toBe(false);
  });
});
