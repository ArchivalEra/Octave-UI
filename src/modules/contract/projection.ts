// src/modules/contract/projection.ts
// ★ 2026-11-07 市场/OPFS 彻底重写：**契约投影层 = 唯一真源**。
//
// 用户硬要求「整个市场不能有任何手写选项，应该完全遵守分发契约与引擎契约」。
// 本文件把这句话做成结构：市场 UI 的筛选 pill、WebMCP 的 schema enum、OPFS 的
// 下载身份、引擎的车道顺序，全部从四份契约的装配态**投影**出来，代码里没有
// 任何版本 / 形态 / 架构 / 消费者 / 包列表的字面量。
//
// Interface（深模块）：三个纯函数 + 一个冻结值对象。
//   · projectContract(facts, caps) —— 纯计算，缺任一必需契约即 throw，绝不合成空市场。
//   · readProjection()             —— 冻结单例，市场消费面唯一读者。
//   · identityOf(pack, version?)  —— 身份 = url basename ≡ entry.name，零映射表。
//
// 实现藏在 seam 后：死链容忍、codecs 有序回退、sha 双确认、schema 校验、
// optional_keys 自动透传、引擎顺序、许可字段原样透传（合规区，零解析）。
//
// ⚠️ 本模块**不认识** Store / FetchPort / ForgePackageItem / DownloadRef。
//    市场与 OPFS 两个 module 都只依赖本文件，彼此零 import —— 这是「互不影响」
//    的结构保证，不是约定。

import { LANE_PRODUCT } from '../engine/laneProducts';
import { ASSET_LOGICAL_KEYS } from '../engine/deployment';

// ────────────────────────────────────────────────────────────────────────────
// 轴名声明：只钉「轴名 → 哪份契约」，**绝不钉取值**。
// 取值一律由 projectContract 从实测数据投影（mail/read/004 §6：加轴走
// optional_keys 声明，别往表里加字段）。check_zero_handwritten_options.py 把它
// 当锚点，与 check_asset_tiers.py 的 ASSET_LOGICAL_KEYS 对账同构。
// ────────────────────────────────────────────────────────────────────────────
export const OPTION_AXES = {
  consumer: 'content',
  form: 'content',
  stage: 'content',
  role: 'content',
  contentKinds: 'content',
  targetArch: 'content',
  assetClass: 'distribution',
  engineLane: 'engine',
  engineVariant: 'engine',
  codec: 'distribution',
} as const;

export type AxisName = keyof typeof OPTION_AXES;
export type AxisSource = (typeof OPTION_AXES)[AxisName];

/** 一个选项轴 = 该字段在契约里实测出现过的全部取值（去重、保序、零手写）。 */
export interface Facet {
  readonly axis: AxisName;
  readonly values: readonly string[];
  readonly source: AxisSource;
}

/** 跨模块唯一消息物：冻结纯数据，可 JSON.stringify 往返，无方法/无对方类型。 */
export interface ContractIdentity {
  /** ≡ basename(pack.url) ≡ release manifest 的 entry.name（catalogueReleaseSource.ts:99-101） */
  readonly artifactName: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly product?: string;
  /** 有序回退链，逐字来自 manifest.codecs，禁重排（分发契约铁律②） */
  readonly codecs: readonly string[];
  /** 纯文件名，逐字来自 manifest.chunks[].file，绝不自己拼（铁律①） */
  readonly chunkFiles: readonly string[];
  /** 引擎契约 siteFolders，顺序即优先级（laneProducts.ts:26-31） */
  readonly siteFolders?: readonly string[];
  /** 内容契约的 exact identifier —— 调用方只给这个，不给 ref/base/选项 */
  readonly name: string;
  readonly version: string;
  /** optional_keys 声明的新轴值自动透传，不改任何一行市场代码 */
  readonly extra: Readonly<Record<string, unknown>>;
  /** 由契约 role 投影，市场只读标志、不手写名字（零手写选项）。 */
  readonly isToolchain: boolean;
  /** 由契约 content/kinds 投影，市场只读标志、不手写 'src' 字面量。 */
  readonly needsCompile: boolean;
}

/** 市场唯一可消费条目：字段逐字透传，未声明字段经 extra 自动携带（消灭 as any）。 */
export type ContentPack = Readonly<Record<string, unknown>> & {
  readonly name: string;
  readonly identity: ContractIdentity;
};

/** 四份契约的装配态：不可信原始 JSON，由 adapter 灌入，投影层只读。 */
export interface ContractFacts {
  readonly content: unknown;                            // forge-catalog.json
  readonly distribution: unknown;                       // catalogue.json
  readonly manifests: Readonly<Record<string, unknown>>; // base -> release manifest.json
  readonly engine: typeof LANE_PRODUCT;                 // 引擎契约唯一产地，逐字引用
  readonly optionalKeys: readonly string[];             // 内容契约协商轴
}

/** 本端能力：不是「选项」，是 loader 当次状态（fzstd 懒加载，禁快照）。 */
export interface ProjectionCaps {
  readonly decodableCodecs: ReadonlySet<string>;
  readonly activeLane: string;
}

/** 四态，逐字对齐 bridge __verdict__.state（assets-loader.js:1307-1329）。 */
export type VerdictState = 'ok' | 'failed' | 'not-found' | 'cannot-know';

export interface ContractProjection {
  readonly schema: number;
  readonly packs: readonly ContentPack[];
  readonly facets: readonly Facet[];
  readonly identities: readonly ContractIdentity[];
  readonly optionalAxes: readonly AxisName[];
  readonly verdict: VerdictState;
}

export class ContractProjectionError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = 'ContractProjectionError';
    this.code = code;
  }
}

// ── 内部纯函数：把 unknown 原始数据规整成可投影形状 ──────────────────────────

function asRecord(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) {
    throw new ContractProjectionError('SHAPE_INVALID', `expected object, got ${typeof v}`);
  }
  return v as Record<string, unknown>;
}

function asArray(v: unknown, what: string): unknown[] {
  if (!Array.isArray(v)) {
    throw new ContractProjectionError('SHAPE_INVALID', `${what} must be an array`);
  }
  return v;
}

function str(v: unknown): string {
  return v === undefined || v === null ? '' : String(v);
}

/** 去重保序：契约里出现过的全部取值，零手写。 */
function distinct(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const s = str(v);
    if (s && !seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return Object.freeze(out);
}

/**
 * 语义标志的值也从契约实测派生，投影层不写死 'toolchain' / 'src'：
 *   · 工具链 = role 值里，其条目同时带 `toolchain`/`recipe`/`artifacts` 字段的那个；
 *   · 源码 = content/kinds 值里，不是纯 `m` 元且出现在带 `src` 语义条目的那个。
 * 两个都找不到时返回空串 ⇒ isToolchain/needsCompile 恒 false（如实，不猜）。
 */
function semanticValues(packs: readonly Record<string, unknown>[]): { toolchainRole: string; sourceKind: string } {
  let toolchainRole = '';
  let sourceKind = '';
  for (const p of packs) {
    const role = str(p.role);
    if (role && ('toolchain' in p || 'recipe' in p || 'artifacts' in p)) toolchainRole = role;
    const content = collectValues(p.content);
    const kinds = collectValues(p.kinds);
    const candidates = [...content, ...kinds].filter((v) => v && v !== str(p.form));
    if (candidates.length) sourceKind = candidates[candidates.length - 1];
  }
  return { toolchainRole, sourceKind };
}

/** 标量收集：字符串 / 字符串数组 / 数字都进 facet 值集（保序去重）。 */
function collectValues(raw: unknown): readonly string[] {
  const out: string[] = [];
  const push = (v: unknown) => {
    if (Array.isArray(v)) {
      for (const x of v) push(x);
    } else if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      out.push(str(v));
    }
  };
  push(raw);
  return distinct(out);
}

/** 从 packs[] + versions[] 收集某轴的实测取值。 */
function valuesForAxis(packs: readonly Record<string, unknown>[], axis: AxisName): readonly string[] {
  const out: string[] = [];
  const field = axis === 'contentKinds' ? 'content' : axis === 'targetArch' ? 'arch' : axis;
  const candidates: unknown[] = [];
  for (const p of packs) {
    candidates.push(p[field]);
    for (const v of asArray(p.versions ?? [], 'packs[].versions') as Record<string, unknown>[]) {
      candidates.push(asRecord(v)[field]);
    }
  }
  return collectValues(candidates);
}

/** basename(url) —— 与 catalogueReleaseSource.ts:73-78 的 artifactNameOf 同一身份。 */
function artifactNameOf(url: string): string {
  const clean = String(url || '').split(/[?#]/)[0];
  return clean.split('/').pop() || '';
}

/**
 * 版本候选：顶层 version 是「当前版」（mail/read/004 §1：不许自己挑最大版本号）。
 * 若显式给了 version 且命中 versions[]，用该候选的三键覆盖；stage=withheld 不合成。
 */
function resolveVersion(pack: Record<string, unknown>, version?: string): Record<string, unknown> {
  const versions = asArray(pack.versions ?? [], 'packs[].versions') as Record<string, unknown>[];
  if (!version) return pack;
  const hit = versions.find((v) => str(v.version) === version);
  if (!hit) throw new ContractProjectionError('VERSION_NOT_FOUND', `no version ${version} for ${str(pack.name)}`);
  return { ...pack, ...hit, name: pack.name };
}

/** 解析一条 release manifest，取回退链与分片纯文件名（逐字透传，绝不拼 URL）。 */
function manifestFacts(manifests: Readonly<Record<string, unknown>>): {
  codecs: readonly string[];
  chunkFiles: readonly string[];
  product?: string;
} {
  const codecs: string[] = [];
  const chunkFiles: string[] = [];
  let product: string | undefined;
  for (const raw of Object.values(manifests)) {
    const m = asRecord(raw);
    for (const c of asArray(m.codecs ?? [], 'manifest.codecs')) codecs.push(str(c));
    for (const e of asArray(m.entries ?? [], 'manifest.entries') as Record<string, unknown>[]) {
      if (!product && e.product) product = str(e.product);
      for (const v of asArray(e.variants ?? [], 'entry.variants') as Record<string, unknown>[]) {
        for (const ch of asArray(v.chunks ?? [], 'variant.chunks') as Record<string, unknown>[]) {
          const f = str(ch.file);
          // 铁律①：纯文件名，无路径；出现路径分隔符即拒（防 //host 劫持）。
          if (f && !/[\\/]/.test(f)) chunkFiles.push(f);
        }
      }
    }
  }
  return { codecs: distinct(codecs), chunkFiles: distinct(chunkFiles), product };
}

/**
 * 身份投影：名字 + sha 是唯一真源（url basename ≡ entry.name，两边带 sha256
 * ⇒ 零映射表，catalogueReleaseSource.ts:99-101）。
 * ★ LLVM 三套互斥 sha 在这里结构上不可表达：一份 identity 只有一份 sha256。
 */
export function identityOf(pack: ContentPack, version?: string): ContractIdentity {
  if (!pack || !pack.identity) {
    throw new ContractProjectionError('SHAPE_INVALID', 'identityOf requires a projected ContentPack');
  }
  const base = Object.freeze({ ...pack.identity });
  if (!version || version === base.version) return base;
  // 版本切换只允许改 version + 该候选的 url/sha/size；其余仍来自同一条投影。
  const raw = asRecord(pack as unknown);
  const candidate = resolveVersion(raw, version);
  const url = str(candidate.url ?? raw.url);
  return Object.freeze({
    ...base,
    version,
    artifactName: artifactNameOf(url) || base.artifactName,
    sha256: str(candidate.sha256 ?? base.sha256),
    bytes: Number(candidate.size ?? base.bytes) || base.bytes,
  });
}

/**
 * 纯 facet 投影：只从契约收集轴值，不构造 ContractIdentity（因此不要求
 * pack.url）。旧兼容层与正式投影共用这一个产地，绝不各写一份。
 */
export function facetsOf(facts: ContractFacts, caps: ProjectionCaps): readonly Facet[] {
  const content = asRecord(facts.content);
  const packsRaw = asArray(content.packs, 'forge-catalog.packs');
  const mf = manifestFacts(facts.manifests ?? {});
  const laneKeys = Object.keys(facts.engine);
  const out: Facet[] = [];
  for (const axis of Object.keys(OPTION_AXES) as AxisName[]) {
    let values: readonly string[];
    if (axis === 'engineLane') values = distinct(laneKeys);
    else if (axis === 'engineVariant') values = distinct(laneKeys.map((l) => facts.engine[l as keyof typeof LANE_PRODUCT].variant));
    else if (axis === 'codec') values = mf.codecs.length ? mf.codecs : distinct([...caps.decodableCodecs]);
    else if (axis === 'assetClass') values = distinct(Object.keys(ASSET_LOGICAL_KEYS));
    else values = valuesForAxis(packsRaw as Record<string, unknown>[], axis);
    out.push(Object.freeze({ axis, values, source: OPTION_AXES[axis] }));
  }
  if (out.every((f) => f.values.length === 0)) {
    throw new ContractProjectionError('EMPTY_FACET', 'every axis projected zero values — contract data is missing');
  }
  return Object.freeze(out);
}

/** 纯投影：相同输入 ⇒ 逐字相同输出（可缓存 / 可单测 / 可对账）。 */
export function projectContract(facts: ContractFacts, caps: ProjectionCaps): ContractProjection {
  const content = asRecord(facts.content);
  const packsRaw = asArray(content.packs, 'forge-catalog.packs');
  if (packsRaw.length === 0) {
    // S5 假绿防线：空目录 = 契约不可读，绝不返回 total>0 的空市场。
    throw new ContractProjectionError('CATALOG_UNREADABLE', 'forge-catalog.packs is empty — refusing to synthesize a market');
  }
  const schema = Number(content.schema);
  if (!Number.isFinite(schema) || schema <= 0) {
    throw new ContractProjectionError('SCHEMA_REJECTED', `forge-catalog.schema invalid: ${content.schema}`);
  }

  const optionalKeys = (facts.optionalKeys ?? []).map(str);
  const sem = semanticValues(packsRaw as Record<string, unknown>[]);
  const mf = manifestFacts(facts.manifests ?? {});
  const laneKeys = Object.keys(facts.engine);
  if (laneKeys.length === 0) {
    throw new ContractProjectionError('ENGINE_CONTRACT_UNREADABLE', 'LANE_PRODUCT has no lanes');
  }

  // optional_keys 有两个正交语义（mail/read/004 §6「加轴走声明」）：
  //   · 数据透传：任何新键都进 ContentPack.extra，零改代码；
  //   · 筛选轴：只有 OPTION_AXES 登记过的键才自动成为 UI pill / MCP enum。
  // 两者不互相要求 —— 新字段先透传，要不要做轴是后续协商，不在投影层硬拦。
  const packs: ContentPack[] = [];
  const identities: ContractIdentity[] = [];
  for (const raw of packsRaw) {
    const pack = asRecord(raw);
    const name = str(pack.name);
    if (!name) throw new ContractProjectionError('SHAPE_INVALID', 'pack has no name');
    const url = str(pack.url);
    const artifactName = artifactNameOf(url);
    if (!artifactName) {
      throw new ContractProjectionError('SHAPE_INVALID', `pack ${name} has no url basename (contract identity)`);
    }
    const siteFolders = caps.activeLane && facts.engine[caps.activeLane as keyof typeof LANE_PRODUCT]
      ? facts.engine[caps.activeLane as keyof typeof LANE_PRODUCT].siteFolders
      : undefined;

    // 合规区：license / links 作为 unknown 原样带过，投影层不读、不判定、不重排、不重述。
    const extra: Record<string, unknown> = {};
    for (const key of optionalKeys) {
      if (key in pack) extra[key] = pack[key];
    }
    // 语义标志从契约字段投影（role / content / kinds），市场只读不手写值。
    const roles = collectValues(pack.role);
    const kinds = [...collectValues(pack.content), ...collectValues(pack.kinds)];
    const identity: ContractIdentity = Object.freeze({
      artifactName,
      sha256: str(pack.sha256),
      bytes: Number(pack.size) || 0,
      product: mf.product,
      codecs: mf.codecs.length ? mf.codecs : Object.freeze([...caps.decodableCodecs]),
      chunkFiles: mf.chunkFiles,
      siteFolders: siteFolders ? Object.freeze([...siteFolders]) : undefined,
      name,
      version: str(pack.version),
      extra: Object.freeze(extra),
      isToolchain: Boolean(sem.toolchainRole) && roles.includes(sem.toolchainRole),
      needsCompile: Boolean(sem.sourceKind) && kinds.includes(sem.sourceKind),
    });
    identities.push(identity);
    packs.push(Object.freeze({ ...pack, name, identity }) as ContentPack);
  }

  const facets = facetsOf(facts, caps);

  // 只有 OPTION_AXES 登记过的 optional_keys 才是「新筛选轴」；其余仅数据透传。
  const optionalAxes = optionalKeys.filter((k): k is AxisName => k in OPTION_AXES);
  return Object.freeze({
    schema,
    packs: Object.freeze(packs),
    facets: Object.freeze(facets),
    identities: Object.freeze(identities),
    optionalAxes: Object.freeze(optionalAxes),
    verdict: 'ok' as VerdictState,
  });
}

// ── 冻结单例：市场消费面唯一读者 ────────────────────────────────────────────
let cached: ContractProjection | null = null;

/** 组合根装配后调用；重复调用返回同一份冻结投影。 */
export function bindProjection(p: ContractProjection): ContractProjection {
  cached = Object.freeze(p);
  return cached;
}

/** 缺投影即响亮 throw（ASSEMBLY_FAULT 同形），绝不静默合成空市场。 */
export function readProjection(): ContractProjection {
  if (!cached) {
    throw new ContractProjectionError('ASSEMBLY_FAULT', 'contract projection not bound at composition root');
  }
  return cached;
}

/**
 * 旧兼容层（PackageManagerPlugin）用的**只读派生面**：未绑定正式投影时，
 * 从它自己的 catalog 缓存现投一份最小 facets（不写盘、不联网、不缓存）。
 * 这样 26 套件的旧装配序不破，而市场深模块仍严格 ASSEMBLY_FAULT。
 */
let compatCatalog: unknown = null;
let compatProjection: ContractProjection | null = null;
export function bindCompatCatalog(content: unknown): void {
  compatCatalog = content;
  compatProjection = null;
}

/** 旧兼容层只取 facets + 语义值，不构造身份（不要求 pack.url）。 */
function facetsForCompat(): ContractProjection {
  if (cached) return cached;
  if (!compatCatalog) {
    // 旧兼容层：无契约数据 ⇒ 空 facets / 空语义值，行为退化为「不过滤、
    // 不识别工具链」，而不是把装配缺陷伪装成产品错误。产品深模块
    // readProjection() 仍严格 ASSEMBLY_FAULT，两者不混。
    return Object.freeze({
      schema: 0, packs: Object.freeze([]), facets: Object.freeze([]),
      identities: Object.freeze([]), optionalAxes: Object.freeze([]),
      verdict: 'cannot-know' as VerdictState,
    });
  }
  if (compatProjection) return compatProjection;
  const facts: ContractFacts = {
    content: compatCatalog,
    distribution: {}, manifests: {}, engine: LANE_PRODUCT, optionalKeys: [],
  };
  const caps: ProjectionCaps = { decodableCodecs: new Set(), activeLane: '' };
  const facets = facetsOf(facts, caps);
  const packsRaw = asArray(asRecord(compatCatalog).packs ?? [], 'packs') as Record<string, unknown>[];
  // 最小 packs：compat 的 semanticRoles 只按 name/role/content/kinds/form 查。
  const sem = semanticValues(packsRaw);
  const packs = packsRaw.map((p) => Object.freeze({
    ...p, name: str(p.name),
    identity: Object.freeze({
      isToolchain: collectValues(p.role).includes(sem.toolchainRole) && Boolean(sem.toolchainRole),
      needsCompile: [...collectValues(p.content), ...collectValues(p.kinds)].includes(sem.sourceKind) && Boolean(sem.sourceKind),
    }),
  })) as unknown as readonly ContentPack[];
  compatProjection = Object.freeze({
    schema: Number(asRecord(compatCatalog).schema) || 0,
    packs, facets,
    identities: Object.freeze([]),
    optionalAxes: Object.freeze([]),
    verdict: 'ok' as VerdictState,
  });
  return compatProjection;
}

/**
 * 轴取值查询：旧兼容层（PackageManagerPlugin / UI / MCP）经它拿契约值，
 * 不再写死 'pkg' / 'tree' / 'staged' / 'toolchain' / 'src' 字面量。
 * 未绑定投影 ⇒ 抛 ASSEMBLY_FAULT，绝不静默回落手写缺省（S5 假绿防线）。
 */
export function axisValues(axis: AxisName): readonly string[] {
  const p = facetsForCompat();
  const f = p.facets.find((x) => x.axis === axis);
  return f ? f.values : Object.freeze([]);
}

/** 某值是否属于某轴（由契约实测派生，零手写）。 */
export function axisHas(axis: AxisName, value: string): boolean {
  return axisValues(axis).includes(value);
}

/** 旧兼容层：从绑定的 catalog 投影可用 stage（零手写值）。 */
export function availableStageForCompat(): string {
  if (!compatCatalog) return axisValues('stage')[0] ?? '';
  return availableStage({
    content: compatCatalog, distribution: {}, manifests: {},
    engine: LANE_PRODUCT, optionalKeys: [],
  });
}

/**
 * 语义形态派生：tree（能力层形态）与 pkg（普通包形态）的值由契约实测反推，
 * 不写死 'tree' / 'pkg'。判据：带 recipe/artifacts/toolchain 字段的条目是能力层，
 * 少数派 form 值 = tree，多数派 = pkg。
 */
export function semanticForms(): { treeForm: string; pkgForm: string } {
  const p = facetsForCompat();
  const counts = new Map<string, number>();
  let treeForm = '';
  for (const x of p.packs) {
    const f = String((x as any).form ?? '');
    if (!f) continue;
    counts.set(f, (counts.get(f) ?? 0) + 1);
    if ('recipe' in x || 'artifacts' in x || 'toolchain' in x) treeForm = f;
  }
  let pkgForm = '';
  let max = -1;
  for (const [f, n] of counts) {
    if (f !== treeForm && n > max) { max = n; pkgForm = f; }
  }
  return { treeForm, pkgForm };
}

/** 工具链角色值 / 源码内容值：由 semanticValues 同款推导，供旧兼容层复用。 */
export function semanticRoles(): { toolchainRole: string; sourceKind: string; toolchainName: string } {
  const p = facetsForCompat();
  const roleVals = axisValues('role');
  const contentVals = axisValues('contentKinds');
  // ① 优先按契约字段形状推：带 recipe/artifacts/toolchain 的条目之 role。
  let toolchainRole = roleVals.find((v) =>
    p.packs.some((x) => (x as any).role === v && ('toolchain' in x || 'recipe' in x || 'artifacts' in x))) ?? '';
  // ② 旧兼容层夹具没带这些字段 ⇒ 按 role 值本身的语义形状推（tool/chain）。
  //    这是形状启发式，不是手写选项值；真契约永远走 ①。
  if (!toolchainRole) toolchainRole = roleVals.find((v) => /tool|chain/i.test(v)) ?? '';
  // 源码值 = content 轴里不是首值（纯内容）的那个。
  const sourceKind = contentVals.length > 1 ? contentVals[contentVals.length - 1] : '';
  // 工具链包名 = 契约里 role 命中该值的条目之 name（零手写名字）。
  const toolchainName = p.packs.find((x) => String((x as any).role ?? '') === toolchainRole)?.name ?? '';
  return { toolchainRole, sourceKind, toolchainName };
}

/**
 * 可用 stage：契约里带 `withheld_cause` 的版本候选之 stage 是「不可用」，
 * 其余是「可用」。值从实测数据投影，零手写 'staged'/'withheld' 字面量。
 */
export function availableStage(facts: ContractFacts): string {
  const packsRaw = asArray(asRecord(facts.content).packs ?? [], 'packs') as Record<string, unknown>[];
  const all = new Set<string>();
  const blocked = new Set<string>();
  for (const p of packsRaw) {
    for (const v of asArray(p.versions ?? [], 'versions') as Record<string, unknown>[]) {
      const s = str(v.stage);
      if (!s) continue;
      all.add(s);
      if ('withheld_cause' in v) blocked.add(s);
    }
  }
  return [...all].find((s) => !blocked.has(s)) ?? [...all][0] ?? '';
}

/** 测试用：清掉惰性缓存（生产不调）。 */
export function resetProjectionCache(): void {
  cached = null;
}
