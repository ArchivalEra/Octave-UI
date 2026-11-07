// src/modules/vault/Vault.ts
// ★ 2026-11-07 市场/OPFS 彻底重写：**OPFS 深模块**。
//
// Interface（5 个入口，全部只认 ContractIdentity）：
//   fetch(id)      —— 下载半条：release 分片装配 → 写 OPFS → 原子记账。零装载。
//   read(id)       —— 装载半条：按名查账 + 物理对账 + 读盘。**零网络**。
//                      返回 Promise<BytesVerdict>：bytes 只在 await 后 ok 态在场，
//                      从类型上根除「Promise 当同步值读」的恒假断点。
//   reconcile(id)  —— 盘面说了算的物理对账（verified / corrupted / unchecked）。
//   index()/evict()—— 账本读面与显式写路径。
//
// 实现藏在 seam 后：DownloadRef/refToKey 代数、manifest 原子 tmp→swap、
// 坏账自愈、_dirtyRefs 读标脏写清理、并发去重、分片装配、逐块 sha、codecs 链。
// 全部复用 DownloadStore 的既有深实现（local-substitutable），本模块不重写字节
// 搬运，只把「市场认识 OPFS」这条耦合切断。
//
// ⚠️ 本模块**不认识**内容契约的类型 / 货架模型 / 引擎车道类型；只认契约身份值。
//    跨模块唯一消息物 = 契约投影层产出的冻结值 ContractIdentity。

import type { ContractIdentity, VerdictState } from '../contract/projection';
import type { Store } from '../storage/types';
import type { FetchPort } from '../storage/FetchPort';
import { DownloadStore } from '../storage/DownloadStore';
import type { DownloadRef, DownloadRecord, DownloadSnapshot } from '../storage/downloadTypes';

/** 装载决议：state==='ok' ⟺ bytes 在场且 sha 相符（四态不塌陷）。 */
export interface BytesVerdict {
  readonly state: VerdictState;
  readonly cause: string;
  readonly bytes?: Uint8Array;
  readonly path?: string;
  readonly sha256?: string;
  /** 报告物理缺件，供 LLVM/toolchain 门折叠（不自己造第二份真源）。 */
  readonly missing: readonly string[];
}

/** 物理对账三态。 */
export interface PhysicalFacts {
  readonly integrity: 'verified' | 'corrupted' | 'unchecked';
  readonly files: readonly { path: string; sha256: string; bytes: number }[];
  readonly bytes: number;
}

export interface ProvisionRecord {
  readonly identity: ContractIdentity;
  readonly bytes: number;
  readonly files: readonly { path: string; sha256: string; bytes: number }[];
  readonly provenanceUrl?: string;
}

/** 唯一身份键：契约身份三键，零手写 ref 形状。 */
export function identityKey(id: ContractIdentity): string {
  return `${id.artifactName}@${id.sha256 || 'nohash'}`;
}

/**
 * 把契约身份映射到**内部** DownloadRef。这是 ref 代数最后一次露面：
 * 它是 Vault 的私有实现细节，市场与 UI/MCP 一律不可见。
 * kind 由身份推导而非手写：单产物 = src；引擎车道产物 = engine。
 */
function toInternalRef(id: ContractIdentity): DownloadRef {
  const isEngine = Boolean(id.product && id.siteFolders?.length);
  return {
    name: id.name,
    version: id.version,
    kind: isEngine ? 'engine' : 'src',
    arch: isEngine ? (id.siteFolders ?? []).join('/') : null,
  };
}

/** DownloadStore 构造面（未导出类型，从构造器参数派生，不改旧文件）。 */
type DownloadCtorOptions = NonNullable<ConstructorParameters<typeof DownloadStore>[0]>;

export interface VaultDeps {
  readonly store: Store;
  readonly fetchPort: FetchPort;
  /** 组合根注入的既有下载选项（releaseSource / engineReleaseSource / baseUrlProvider …）。 */
  readonly downloadOptions?: Omit<DownloadCtorOptions, 'storage' | 'fetchPort'>;
}

export class Vault {
  private readonly dl: DownloadStore;
  private readonly store: Store;
  /** 同身份双发复用单 promise（与 _bootPromise 同款单飞）。 */
  private readonly active = new Map<string, Promise<ProvisionRecord>>();

  constructor(deps: VaultDeps) {
    this.store = deps.store;
    this.dl = new DownloadStore({
      ...(deps.downloadOptions ?? {}),
      storage: deps.store,
      fetchPort: deps.fetchPort,
    });
  }

  /** 账本读面：只暴露冻结快照，不暴露 ref 形状。 */
  async index(): Promise<DownloadSnapshot> {
    return this.dl.index();
  }

  /**
   * 下载半条：release 分片装配 → 落盘 OPFS → 原子记账。
   * 零装载；同身份并发双发复用单 promise。
   */
  fetch(id: ContractIdentity, signal?: AbortSignal): Promise<ProvisionRecord> {
    const key = identityKey(id);
    const inFlight = this.active.get(key);
    if (inFlight) return inFlight;
    const p = this._fetchBody(id, signal).finally(() => this.active.delete(key));
    this.active.set(key, p);
    return p;
  }

  private async _fetchBody(id: ContractIdentity, signal?: AbortSignal): Promise<ProvisionRecord> {
    const ref = toInternalRef(id);
    const rec = await this.dl.download(ref, signal ? { signal } : undefined);
    return Object.freeze({
      identity: id,
      bytes: rec.bytes,
      files: Object.freeze(rec.files.map((f) => Object.freeze({ ...f }))),
      provenanceUrl: rec.provenanceUrl,
    });
  }

  /**
   * 装载半条：**零网络**。按名查账 + stat 物理对账 + store.read。
   * 这是 README.md:28-29「下载与装载解耦」的兑现点；绝不在装载时现场
   * 从 release 装配字节（2026-11-06 事故已回退，见 productionWiring 旧断言）。
   */
  async read(id: ContractIdentity): Promise<BytesVerdict> {
    const ref = toInternalRef(id);
    let rec: DownloadRecord | null = null;
    try {
      await this.dl.init();
      // 按身份查账：优先账本记录的 ref 自身（下载时逐字同一个对象），
      // 再 stat 做物理对账（盘面说了算，账面只是参照）。
      const snap = await this.dl.index();
      const k = identityKey(id);
      rec = (Object.values(snap.manifest.items).find(
        (r) => identityKeyFromRecord(r) === k || r.ref.name === id.name,
      ) as DownloadRecord | undefined) ?? null;
      if (!rec) {
        return Object.freeze({ state: 'not-found', cause: 'not-downloaded', missing: [id.name] });
      }
      const verified = await this.dl.stat(rec.ref);
      if (!verified || verified.files.length === 0) {
        return Object.freeze({ state: 'not-found', cause: 'not-downloaded', missing: [id.name] });
      }
      const f = verified.files[0];
      const bytes = await this.store.read(f.path);
      // sha 双确认：盘上字节必须与契约身份的 sha 一致（否则不假绿）。
      const { computeSha256 } = await import('../storage/FetchPort');
      const actual = await computeSha256(bytes);
      if (id.sha256 && actual !== id.sha256) {
        return Object.freeze({ state: 'failed', cause: 'sha-mismatch', missing: [] });
      }
      return Object.freeze({
        state: 'ok', cause: 'ok', bytes, path: f.path, sha256: f.sha256, missing: [],
      });
    } catch (err: any) {
      // 账本不可读 / 读盘失败 ⇒ cannot-know（可重试），绝不塌陷成 ok。
      return Object.freeze({
        state: 'cannot-know',
        cause: err?.code || 'index-unreadable',
        missing: [id.name],
      });
    }
  }

  /** 盘面说了算的物理对账：逐件 stat + 记录 sha/bytes。 */
  async reconcile(id: ContractIdentity): Promise<PhysicalFacts> {
    const ref = toInternalRef(id);
    await this.dl.init();
    const direct = this.dl.getRecord(ref);
    const snap = direct ? null : await this.dl.index();
    const rec = direct ?? (snap
      ? Object.values(snap.manifest.items).find((r) => r.ref.name === id.name) ?? null
      : null);
    if (!rec) {
      return Object.freeze({ integrity: 'unchecked', files: Object.freeze([]), bytes: 0 });
    }
    const files: { path: string; sha256: string; bytes: number }[] = [];
    let ok = true;
    for (const f of rec.files) {
      const st = await this.store.stat(f.path);
      if (!st) { ok = false; continue; }
      files.push({ path: f.path, sha256: f.sha256, bytes: f.bytes });
    }
    return Object.freeze({
      integrity: ok && files.length > 0 ? 'verified' : files.length === 0 ? 'unchecked' : 'corrupted',
      files: Object.freeze(files),
      bytes: files.reduce((a, f) => a + f.bytes, 0),
    });
  }

  /** 显式写路径：清账（读路径只标脏，不写）。 */
  async evict(id: ContractIdentity): Promise<void> {
    const ref = toInternalRef(id);
    await this.dl.remove(ref);
  }
}

/** 从账本记录反推身份键（与 identityKey 同一产地下游，不手写第二份）。 */
function identityKeyFromRecord(rec: DownloadRecord): string {
  const f = rec.files[0];
  const base = f ? f.path.split('/').pop() || '' : '';
  return `${base}@${rec.sha256 || 'nohash'}`;
}
