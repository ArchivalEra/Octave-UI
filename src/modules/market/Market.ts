// src/modules/market/Market.ts
// ★ 2026-11-07 市场/OPFS 彻底重写：**市场深模块**。
//
// Interface（6 个入口，全部只认契约投影层）：
//   axes() / list(sel) / select(name, version?) —— 货架投影与筛选，零手写选项。
//   ensure(name)        —— ★ 一次直达：自动决定 下载→boot→装载→编译，
//                           返四态 ProvisionVerdict（UI / MCP / 测试同缝）。
//   plan(name) / capability(name) —— 零网络预演与运行时状态。
//
// 实现藏在 seam 后：依赖闭包、角色门、quota、toolchain 判定、四态折叠、
// 进度收集、lazy-boot 编排。全部从 ContractProjection 的字段投影，代码里没有
// 任何版本 / 形态 / 架构 / 消费者 / 包列表 / 工具链名字面量。
//
// ⚠️ 本模块**不认识** Store / FetchPort / DownloadRef / ForgePackageItem。
//    与 Vault 之间零 import、零方法调用：只经冻结值 ContractIdentity 在组合根串联。

import {
  readProjection,
  identityOf,
  type ContractIdentity,
  type ContentPack,
  type Facet,
  type AxisName,
  type VerdictState,
  ContractProjectionError,
} from '../contract/projection';

/**
 * ★ 值缝：Market 只声明它需要的**结构**，不 import Vault 的类型。
 * 两个深模块彼此零类型依赖——删掉 Vault 文件，Market 仍能编译。
 * 组合根把 Vault 实例（结构上满足本接口）交给它。
 */
export interface VaultPort {
  fetch(id: ContractIdentity): Promise<unknown>;
  read(id: ContractIdentity): Promise<{
    state: VerdictState; cause: string; bytes?: Uint8Array; path?: string; sha256?: string;
  }>;
  reconcile(id: ContractIdentity): Promise<{ integrity: string }>;
  index(): Promise<{ totalBytes: number }>;
}

/** 一次调用的终态（四态逐字对齐 bridge __verdict__.state）。 */
export interface ProvisionVerdict {
  readonly state: VerdictState;
  readonly name: string;
  readonly cause: string;
  readonly installed: readonly string[];
  readonly evidence: Readonly<{
    downloaded: readonly string[];
    loadedFromOpfs: boolean;
    booted: boolean;
    compiled: readonly string[];
    shaChecked: readonly string[];
  }>;
  readonly identity?: ContractIdentity;
}

/** 装载进运行时的 port：prod = bridge adapter，test = mock（真缝 ≥2 adapter）。 */
export interface RuntimeInstaller {
  ensureBooted(): Promise<void>;
  /** 接收已 resolve 的字节（不是 Promise）——桥侧必须 await 完才能调。 */
  install(id: ContractIdentity, bytes: Uint8Array): Promise<void>;
  compile?(id: ContractIdentity, bytes: Uint8Array): Promise<void>;
}

export interface MarketDeps {
  readonly vault: VaultPort;
  readonly runtime: RuntimeInstaller;
}

export type FacetSelection = Readonly<{ axis: AxisName; value: string }>;

function verdict(
  state: VerdictState,
  name: string,
  cause: string,
  extra: Partial<ProvisionVerdict> = {},
): ProvisionVerdict {
  return Object.freeze({
    state, name, cause,
    installed: Object.freeze([]),
    evidence: Object.freeze({
      downloaded: Object.freeze([]),
      loadedFromOpfs: false,
      booted: false,
      compiled: Object.freeze([]),
      shaChecked: Object.freeze([]),
    }),
    ...extra,
  });
}

/** 从投影字段读角色/内容/依赖：零手写判定，字段名来自契约。 */
function fieldOf(pack: ContentPack, key: string): unknown {
  return (pack as Readonly<Record<string, unknown>>)[key];
}

function asStringArray(v: unknown): readonly string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
  if (typeof v === 'string') return [v];
  return [];
}

export class Market {
  private readonly vault: VaultPort;
  private readonly runtime: RuntimeInstaller;
  /** 同名单发复用单 promise（与 _bootPromise / Vault.active 同款单飞）。 */
  private readonly active = new Map<string, Promise<ProvisionVerdict>>();

  constructor(deps: MarketDeps) {
    this.vault = deps.vault;
    this.runtime = deps.runtime;
  }

  /** UI pill 与 MCP enum 的唯一产地。 */
  axes(): readonly Facet[] {
    return readProjection().facets;
  }

  /** 按轴筛选：值来自 facets，缺省不附加任何手写 'all' 语义。 */
  list(sel?: FacetSelection): readonly ContentPack[] {
    const packs = readProjection().packs;
    if (!sel) return packs;
    return packs.filter((p) => asStringArray(fieldOf(p, sel.axis)).includes(sel.value));
  }

  /** 只回身份，不触发下载（下载/装载解耦的显式分步面）。 */
  select(name: string, version?: string): ContractIdentity {
    const pack = readProjection().packs.find((p) => p.name === name);
    if (!pack) {
      throw new ContractProjectionError('NOT_IN_ANY_LIST', `package "${name}" is not in the content contract`);
    }
    return version ? identityOf(pack, version) : pack.identity;
  }

  /** 零网络预演：依赖闭包 ∩ 体积，quota 事实随投影字段走。 */
  async plan(name: string): Promise<{ bytes: number; layers: readonly string[]; quotaOk: boolean | null }> {
    const p = readProjection();
    const pack = p.packs.find((x) => x.name === name);
    if (!pack) throw new ContractProjectionError('NOT_IN_ANY_LIST', `package "${name}" is not in the content contract`);
    const layers: string[] = [];
    let bytes = pack.identity.bytes;
    const seen = new Set<string>([name]);
    const stack = [name];
    while (stack.length) {
      const cur = stack.pop()!;
      const curPack = p.packs.find((x) => x.name === cur);
      for (const dep of asStringArray(fieldOf(curPack ?? pack, 'deps'))) {
        if (seen.has(dep)) continue;
        seen.add(dep);
        const d = p.packs.find((x) => x.name === dep);
        if (d) { bytes += d.identity.bytes; layers.push(dep); stack.push(dep); }
      }
    }
    // quota 真值走 navigator.storage.estimate()（A5 门）；读不到明说 unknown，
    // 绝不恒 true 假绿（AGENTS 纪律 4：断言要能证伪）。
    let quotaOk: boolean | null = null;
    if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
      try {
        const est = await navigator.storage.estimate();
        const remaining = (est.quota ?? 0) - (est.usage ?? 0);
        quotaOk = remaining >= bytes;
      } catch { quotaOk = null; }
    } else {
      quotaOk = null;
    }
    return Object.freeze({ bytes, layers: Object.freeze(layers), quotaOk });
  }

  /** 运行时能力面：物理对账说了算，不自己推第二份真源。 */
  async capability(name: string): Promise<{ ready: boolean; integrity: string }> {
    const id = this.select(name);
    const facts = await this.vault.reconcile(id);
    return Object.freeze({ ready: facts.integrity === 'verified', integrity: facts.integrity });
  }

  /**
   * ★ 唯一默认入口：一次调用装好一个包。
   * 顺序：投影 → 依赖/工具链门 → Vault.fetch（写 OPFS）→ lazy-boot →
   *       Vault.read（零网络）→ RuntimeInstaller.install → 四态。
   * 工具链判定走契约 role，绝不手写 name.includes('llvm')。
   */
  ensure(name: string): Promise<ProvisionVerdict> {
    const inFlight = this.active.get(name);
    if (inFlight) return inFlight;
    const p = this._ensureBody(name).finally(() => this.active.delete(name));
    this.active.set(name, p);
    return p;
  }

  private async _ensureBody(name: string): Promise<ProvisionVerdict> {
    let id: ContractIdentity;
    try {
      id = this.select(name);
    } catch (err: any) {
      return verdict('not-found', name, 'not-in-any-list');
    }
    const p = readProjection();
    const pack = p.packs.find((x) => x.name === name)!;

    // 工具链包：身份由契约 role 投影的标志给，先当依赖自动装配（解锁源码包）。
    const toolchain = p.packs.find((x) => x.identity.isToolchain);
    const needsToolchain = id.needsCompile;
    if (needsToolchain && toolchain && toolchain.name !== name) {
      const tcVerdict = await this._provisionOne(toolchain.identity, false);
      if (tcVerdict.state !== 'ok') {
        return verdict('failed', name, 'toolchain-required', { evidence: tcVerdict.evidence });
      }
    }

    return this._provisionOne(id, needsToolchain);
  }

  private async _provisionOne(id: ContractIdentity, needsCompile: boolean): Promise<ProvisionVerdict> {
    const name = id.name;
    const downloaded: string[] = [];
    const compiled: string[] = [];
    const shaChecked: string[] = [];
    let booted = false;
    let loadedFromOpfs = false;

    try {
      // ① 下载半条（写 OPFS）；缺件/装配失败由 Vault 的错误码折叠。
      await this.vault.fetch(id);
      downloaded.push(name);

      // ② lazy-boot：一次直达，不要求用户先点「开始计算」。
      await this.runtime.ensureBooted();
      booted = true;

      // ③ 装载半条：零网络，read() 返回已 resolve 的 BytesVerdict。
      const v = await this.vault.read(id);
      if (v.state !== 'ok' || !v.bytes) {
        return verdict(v.state, name, v.cause, {
          installed: Object.freeze([]),
          evidence: Object.freeze({ downloaded, loadedFromOpfs, booted, compiled, shaChecked }),
          identity: id,
        });
      }
      loadedFromOpfs = true;
      shaChecked.push(name);

      // ④ 编译 / 装载进运行时（port，桥侧只收已 resolve 的字节）。
      if (needsCompile && this.runtime.compile) {
        await this.runtime.compile(id, v.bytes);
        compiled.push(name);
      }
      await this.runtime.install(id, v.bytes);

      return verdict('ok', name, 'ok', {
        installed: Object.freeze([name]),
        evidence: Object.freeze({ downloaded, loadedFromOpfs, booted, compiled, shaChecked }),
        identity: id,
      });
    } catch (err: any) {
      const cause = err?.code || err?.cause || 'install-failed';
      return verdict(cause === 'CATALOG_UNREADABLE' ? 'cannot-know' : 'failed', name, String(cause), {
        evidence: Object.freeze({ downloaded, loadedFromOpfs, booted, compiled, shaChecked }),
        identity: id,
      });
    }
  }
}
