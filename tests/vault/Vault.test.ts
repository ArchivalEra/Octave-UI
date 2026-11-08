// tests/vault/Vault.test.ts
// OPFS 深模块：接口即测试面（fetch / read / reconcile / index / evict）。
// AGENTS 纪律 3：先证同类肯定（能测到「装上了」），再证反向（该报错的必须报错）。

import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { Vault } from '../../src/modules/vault/Vault';
import type { ContractIdentity } from '../../src/modules/contract/projection';
import { MemoryStore } from '../../src/modules/storage/MemoryStore';

function sha(data: Uint8Array | string): string {
  return createHash('sha256').update(data).digest('hex');
}

function identity(over: Partial<ContractIdentity> = {}): ContractIdentity {
  const bytes = new Uint8Array([1, 2, 3, 4]);
  return Object.freeze({
    artifactName: 'signal-1.4.3.tar.gz',
    sha256: sha(bytes),
    bytes: bytes.length,
    name: 'signal',
    version: '1.4.3',
    codecs: Object.freeze(['identity']),
    chunkFiles: Object.freeze(['signal.identity.000']),
    extra: Object.freeze({}),
    isToolchain: false,
    needsCompile: false,
    ...over,
  });
}

/** 分片装配用的注入源：一个 identity 变体、一块字节。 */
function makeDeps(bytes: Uint8Array, mem = new MemoryStore()) {
  const chunkSha = sha(bytes);
  const fetchPort = {
    fetchBytes: async (url: string) => url.endsWith('signal.identity.000')
      ? { ok: true, status: 200, data: bytes, sha256: chunkSha, totalBytes: bytes.length }
      : { ok: false, status: 404, data: new Uint8Array(0), sha256: '', totalBytes: null },
    fetchJSON: async () => ({}),
  } as any;
  const releaseSource: any = {
    resolve: async () => ({
      entry: {
        product: 'signal', name: 'signal-1.4.3.tar.gz',
        bytes: bytes.length, sha256: chunkSha,
        variants: [{ codec: 'identity', chunks: [
          { part: 0, file: 'signal.identity.000', bytes: bytes.length, sha256: chunkSha },
        ] }],
      },
      variant: { codec: 'identity', chunks: [
        { part: 0, file: 'signal.identity.000', bytes: bytes.length, sha256: chunkSha },
      ] },
      base: 'https://static.example/release/',
      fallbacks: [],
    }),
  };
  const catalog = {
    schema: 2,
    packs: [{
      name: 'signal', version: '1.4.3', size: bytes.length, sha256: chunkSha,
      url: 'assets/forge/signal-1.4.3.tar.gz', form: 'pkg', content: ['m'],
    }],
  };
  return {
    mem, fetchPort,
    deps: {
      store: mem,
      fetchPort,
      downloadOptions: {
        baseUrl: '',
        catalogProvider: () => catalog,
        releaseSource,
      },
    },
  };
}

describe('Vault（OPFS 深模块）', () => {
  it('★ 下载/装载解耦：fetch 写 OPFS，read 零网络且返回同一份字节', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const { mem, fetchPort, deps } = makeDeps(bytes);
    const vault = new Vault(deps);
    const id = identity();

    const rec = await vault.fetch(id);
    expect(rec.bytes).toBe(bytes.length);
    expect(rec.files.length).toBe(1);
    // 同类肯定：探针先证盘上真有这份字节
    const onDisk = await mem.read(rec.files[0].path);
    expect(Array.from(onDisk)).toEqual([1, 2, 3, 4]);

    // 装载：零网络（请求计数不增），且是 Promise<BytesVerdict>
    const before = (fetchPort as any).fetchBytes.mock?.calls?.length ?? 0;
    const verdict = await vault.read(id);
    expect(verdict.state).toBe('ok');
    expect(Array.from(verdict.bytes!)).toEqual([1, 2, 3, 4]);
    expect(verdict.path).toBe(rec.files[0].path);
    const after = (fetchPort as any).fetchBytes.mock?.calls?.length ?? 0;
    expect(after).toBe(before); // 装载期零 fetch
  });

  it('★ 反向：未下载时 read 必 not-found/not-downloaded，绝不假绿', async () => {
    const { deps } = makeDeps(new Uint8Array([1]));
    const vault = new Vault(deps);
    const v = await vault.read(identity({ name: 'never-downloaded' }));
    expect(v.state).toBe('not-found');
    expect(v.cause).toBe('not-downloaded');
    expect(v.bytes).toBeUndefined();
  });

  it('★ 反向：盘上字节 sha 与契约身份不符 ⇒ failed/sha-mismatch', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const { mem, deps } = makeDeps(bytes);
    const vault = new Vault(deps);
    const id = identity();
    const rec = await vault.fetch(id);
    // 篡改盘上字节，但账本不动
    await mem.write(rec.files[0].path, new Uint8Array([9, 9, 9, 9]));
    const v = await vault.read(id);
    expect(v.state).toBe('failed');
    expect(v.cause).toBe('sha-mismatch');
    expect(v.bytes).toBeUndefined();
  });

  it('★ Promise<BytesVerdict>：类型强制 await，同步 peek .bytes 恒 undefined', async () => {
    const { deps } = makeDeps(new Uint8Array([1]));
    const vault = new Vault(deps);
    const pending = vault.read(identity({ name: 'x' }));
    expect(pending).toBeInstanceOf(Promise);
    // 复刻旧断点：把 Promise 当同步 BytesVerdict 读
    expect((pending as any).bytes).toBeUndefined();
    expect((pending as any).bytes?.length).toBeUndefined();
    const v = await pending;
    expect(v.state).toBe('not-found');
  });

  it('★ reconcile 物理对账：盘面说了算', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const { mem, deps } = makeDeps(bytes);
    const vault = new Vault(deps);
    const id = identity();
    expect((await vault.reconcile(id)).integrity).toBe('unchecked');
    const rec = await vault.fetch(id);
    expect((await vault.reconcile(id)).integrity).toBe('verified');
    await mem.remove(rec.files[0].path);
    expect((await vault.reconcile(id)).integrity).toBe('unchecked');
  });

  it('★ 并发去重：同身份双发复用单 promise', async () => {
    const { deps } = makeDeps(new Uint8Array([7, 7]));
    const vault = new Vault(deps);
    const id = identity();
    const [a, b] = await Promise.all([vault.fetch(id), vault.fetch(id)]);
    expect(a).toBe(b);
    expect((await vault.index()).count).toBe(1);
  });

  it('★ evict 后 read 回到 not-found', async () => {
    const { deps } = makeDeps(new Uint8Array([5]));
    const vault = new Vault(deps);
    const id = identity();
    await vault.fetch(id);
    await vault.evict(id);
    expect((await vault.read(id)).state).toBe('not-found');
  });
});
