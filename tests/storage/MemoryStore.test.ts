// tests/storage/MemoryStore.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStore } from '../../src/modules/storage/MemoryStore';

describe('MemoryStore Port Implementation', () => {
  let store: MemoryStore;

  beforeEach(async () => {
    store = new MemoryStore();
    await store.init();
  });

  it('writes and reads binary data losslessly', async () => {
    const data = new Uint8Array([0, 1, 2, 255, 128, 64]);
    await store.write('test.bin', data);

    const read = await store.read('test.bin');
    expect(read).toEqual(data);
    expect(read.byteLength).toBe(6);

    // 防御性拷贝：修改读出的数据不影响内部存储
    read[0] = 99;
    const readAgain = await store.read('test.bin');
    expect(readAgain[0]).toBe(0);
  });

  it('throws on reading non-existent file', async () => {
    await expect(store.read('missing.m')).rejects.toThrowError(/File not found/);
  });

  it('automatically registers ancestor directories on writing nested files', async () => {
    await store.write('src/sub/deep/code.m', new TextEncoder().encode('a = 1;'));

    const statDir1 = await store.stat('src');
    const statDir2 = await store.stat('src/sub');
    const statDir3 = await store.stat('src/sub/deep');
    const statFile = await store.stat('src/sub/deep/code.m');

    expect(statDir1?.kind).toBe('dir');
    expect(statDir2?.kind).toBe('dir');
    expect(statDir3?.kind).toBe('dir');
    expect(statFile?.kind).toBe('file');
    expect(statFile?.size).toBe(6);
  });

  it('lists all files and directories', async () => {
    await store.write('root.m', new Uint8Array([1]));
    await store.write('src/a.m', new Uint8Array([2]));
    await store.write('src/b.m', new Uint8Array([3]));

    const entries = [];
    for await (const e of store.list()) {
      entries.push(e.path);
    }

    expect(entries).toContain('root.m');
    expect(entries).toContain('src');
    expect(entries).toContain('src/a.m');
    expect(entries).toContain('src/b.m');
  });

  it('removes a single file', async () => {
    await store.write('temp.txt', new Uint8Array([1, 2]));
    expect(await store.stat('temp.txt')).not.toBeNull();

    await store.remove('temp.txt');
    expect(await store.stat('temp.txt')).toBeNull();
  });

  it('cascades deletion on removing a directory', async () => {
    await store.write('pkg/sub/a.m', new Uint8Array([1]));
    await store.write('pkg/sub/b.m', new Uint8Array([2]));
    await store.write('pkg/other.m', new Uint8Array([3]));
    await store.write('unrelated.m', new Uint8Array([4]));

    await store.remove('pkg');

    expect(await store.stat('pkg/sub/a.m')).toBeNull();
    expect(await store.stat('pkg/sub/b.m')).toBeNull();
    expect(await store.stat('pkg/other.m')).toBeNull();
    expect(await store.stat('pkg')).toBeNull();
    expect(await store.stat('unrelated.m')).not.toBeNull();
  });

  it('tracks storage usage and handles clear()', async () => {
    await store.write('f1.dat', new Uint8Array(100));
    await store.write('f2.dat', new Uint8Array(200));

    const usage = await store.usage();
    expect(usage.used).toBe(300);

    await store.clear();
    const usageAfter = await store.usage();
    expect(usageAfter.used).toBe(0);
    expect(await store.stat('f1.dat')).toBeNull();
  });
});
