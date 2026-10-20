// tests/storage/DownloadStore.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { DownloadStore } from '../../src/modules/storage/DownloadStore';
import { MemoryStore } from '../../src/modules/storage/MemoryStore';
import { MockFetchAdapter } from '../../src/modules/storage/FetchPort';
import { DownloadError, refToKey } from '../../src/modules/storage/downloadTypes';
import type { DownloadRef } from '../../src/modules/storage/downloadTypes';
import type { ForgeCatalog } from '../../src/modules/plugins/package/types';

describe('DownloadStore Deep Module', () => {
  let memoryStore: MemoryStore;
  let mockFetch: MockFetchAdapter;
  let store: DownloadStore;

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
            sha256: 'sha-cgi-0.1.2-abc123',
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
            sha256: 'sha-symbolic-3.2.2',
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
            sha256: 'sha-signal-w32',
            files: [{ name: 'signal.oct', size: 5000, sha256: 'sha-signal-w32' }],
          },
          {
            arch: 'w64',
            version: '1.4.5',
            size: 6000,
            sha256: 'sha-signal-w64',
            files: [{ name: 'signal.oct', size: 6000, sha256: 'sha-signal-w64' }],
          },
        ],
      } as any,
      {
        name: 'llvm-wasm',
        version: '19.1.0',
        size: 36700160,
        form: 'tree',
        content: [],
      },
    ],
  };

  const sampleEngineBuild = {
    measured: {
      files: {
        'octave.js': { sha256: 'sha-js', bytes: 100 },
        'octave.wasm': { sha256: 'sha-wasm', bytes: 500 },
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
    const ref: DownloadRef = { name: 'cgi', version: '0.1.2', kind: 'src' };
    const url = 'https://octave.test/assets/packages/cgi-0.1.2.tar.gz';
    mockFetch.setFile(url, 'fake-tarball-cgi', 'sha-cgi-0.1.2-abc123');

    const rec = await store.download(ref);
    expect(rec.ref.name).toBe('cgi');
    expect(rec.sha256).toBe('sha-cgi-0.1.2-abc123');
    expect(rec.files[0].path).toBe('downloads/src/cgi/0.1.2/cgi-0.1.2.tar.gz');

    // 清单存在
    expect(store.has(ref)).toBe(true);
  });

  it('I2: atomic rollback when SHA256 mismatch or write fails', async () => {
    const ref: DownloadRef = { name: 'cgi', version: '0.1.2', kind: 'src' };
    const url = 'https://octave.test/assets/packages/cgi-0.1.2.tar.gz';
    // 伪造错误哈希
    mockFetch.setFile(url, 'tampered-data', 'wrong-sha');

    await expect(store.download(ref)).rejects.toThrow(DownloadError);
    await expect(store.download(ref)).rejects.toMatchObject({
      code: 'STORAGE_WRITE_FAILED',
    });

    // 确认清单中没有任何残留记录 (I2)
    expect(store.has(ref)).toBe(false);
    const snap = await store.index();
    expect(snap.count).toBe(0);
  });

  it('I3: idempotency on unchanged SHA and drift detection when SHA changes', async () => {
    const ref: DownloadRef = { name: 'symbolic', version: '3.2.2', kind: 'src' };
    const url = 'https://octave.test/assets/packages/symbolic-3.2.2.tar.gz';
    mockFetch.setFile(url, 'symbolic-v1', 'sha-symbolic-3.2.2');

    const rec1 = await store.download(ref);
    expect(rec1.sha256).toBe('sha-symbolic-3.2.2');

    // 第二次复跑：哈希一致，直接返回已存记录
    const rec2 = await store.download(ref);
    expect(rec2.sha256).toBe(rec1.sha256);
    expect(rec2.downloadedAt).toBe(rec1.downloadedAt);

    // 模拟远端当日重新发布导致 SHA 漂移
    (sampleCatalog.packs[1].versions![0] as any).sha256 = 'sha-symbolic-3.2.2-new';
    mockFetch.setFile(url, 'symbolic-v2', 'sha-symbolic-3.2.2-new');

    const rec3 = await store.download(ref);
    expect(rec3.sha256).toBe('sha-symbolic-3.2.2-new');
    expect(rec3.bytes).toBe(11);
  });

  it('I6: maintains independent records for different architectures', async () => {
    const refW32: DownloadRef = { name: 'signal', version: '1.4.5', kind: 'pre', arch: 'wasm32' };
    const refW64: DownloadRef = { name: 'signal', version: '1.4.5', kind: 'pre', arch: 'w64' };

    mockFetch.setFile('https://octave.test/assets/packages/wasm32/signal.oct', 'oct-32', 'sha-signal-w32');
    mockFetch.setFile('https://octave.test/assets/packages/w64/signal.oct', 'oct-64', 'sha-signal-w64');

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
    const ref: DownloadRef = { name: 'symbolic', version: '3.2.2', kind: 'src' };
    await expect(smallStore.download(ref)).rejects.toMatchObject({
      code: 'STORAGE_QUOTA_EXHAUSTED',
    });
  });

  it('reconciles stat with disk deletion and cleans up missing records', async () => {
    const ref: DownloadRef = { name: 'cgi', version: '0.1.2', kind: 'src' };
    const url = 'https://octave.test/assets/packages/cgi-0.1.2.tar.gz';
    mockFetch.setFile(url, 'fake-tarball-cgi', 'sha-cgi-0.1.2-abc123');

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
    // 1. NOT_DOWNLOADED
    const refUncut: DownloadRef = { name: 'cgi', version: '0.1.2', kind: 'src' };
    await expect(store.unit(refUncut)).rejects.toMatchObject({ code: 'NOT_DOWNLOADED' });

    // 2. VERSION_WITHHELD
    const refWithheld: DownloadRef = { name: 'cgi', version: '0.1.0', kind: 'src' };
    await expect(store.download(refWithheld)).rejects.toMatchObject({ code: 'VERSION_WITHHELD' });

    // 3. FLAVOR_UNAVAILABLE
    const refNoArch: DownloadRef = { name: 'signal', version: '1.4.5', kind: 'pre' };
    await expect(store.download(refNoArch)).rejects.toMatchObject({ code: 'FLAVOR_UNAVAILABLE' });

    // 4. STORAGE_WRITE_FAILED
    const refBad: DownloadRef = { name: 'cgi', version: '0.1.2', kind: 'src' };
    mockFetch.setFile('https://octave.test/assets/packages/cgi-0.1.2.tar.gz', 'bad', 'bad-sha');
    await expect(store.download(refBad)).rejects.toMatchObject({ code: 'STORAGE_WRITE_FAILED' });

    // 5. DOWNLOAD_ABORTED
    const controller = new AbortController();
    controller.abort();
    mockFetch.setFile('https://octave.test/assets/packages/cgi-0.1.2.tar.gz', 'data', 'sha-cgi-0.1.2-abc123');
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
    mockFetch.setFile('https://octave.test/lanes/master/octave.js', 'js-content', 'sha-js');
    mockFetch.setFile('https://octave.test/lanes/master/octave.wasm', 'wasm-content', 'sha-wasm');

    expect(store.isEngineDownloaded('master')).toBe(false);
    const recOctave = await store.downloadEngine('master');
    expect(recOctave.ref.kind).toBe('engine');
    expect(recOctave.ref.name).toBe('octave');
    expect(recOctave.ref.arch).toBe('master');
    expect(store.isEngineDownloaded('master')).toBe(true);

    // 2. 同时下载 OpenModelica 第二引擎档 (omc)
    mockFetch.setFile('https://octave.test/omc/OpenModelicaCompiler_bg.wasm', 'omc-wasm', '8287589ebdb53b4cc37c337c2ae88f798d8889f7ac3c29d693ca12e539b8d001');
    mockFetch.setFile('https://octave.test/omc/OpenModelicaCompiler.js', 'omc-js', '56c399bd455d57c8e21206287445643b81db6fd4e3ac183989616b903d165f17');

    expect(store.isEngineDownloaded('omc')).toBe(false);
    const recOmc = await store.downloadEngine('omc');
    expect(recOmc.ref.kind).toBe('engine');
    expect(recOmc.ref.name).toBe('omc');
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
          'octave.js': { sha256: 'sha-root-js', bytes: 120 },
          'octave.wasm': { sha256: 'sha-root-wasm', bytes: 600 },
        },
      },
    };

    const rootFetch = new MockFetchAdapter();
    rootFetch.setJSON('https://octave.test/octave.build.json', rootEngineBuild);
    rootFetch.setFile('https://octave.test/octave.js', 'root-js', 'sha-root-js');
    rootFetch.setFile('https://octave.test/octave.wasm', 'root-wasm', 'sha-root-wasm');

    const realStore = new DownloadStore({
      storage: memoryStore,
      fetchPort: rootFetch,
      baseUrl: 'https://octave.test',
    });
    await realStore.init();

    const rec = await realStore.downloadEngine('wasm32-final');
    expect(rec.ref.arch).toBe('wasm32-final');
    expect(rec.bytes).toBe(16);
    expect(realStore.isEngineDownloaded('wasm32-final')).toBe(true);
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
});
