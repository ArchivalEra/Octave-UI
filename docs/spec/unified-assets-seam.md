# Spec · 统一站点资产接缝（Unified Assets Seam）

> 状态：**ready-for-agent**。对应 2026-11-06 code-review 双轴与 codebase-design
> 三设计对比后的混合推荐。本 spec 只描述**一条**收口路径，不改判定：
> 真站编译链此前实测 FAIL，实现后仍需重部署重跑才谈改判。

---

## 0. 问题（用户裁定：不可接受）

**验收路径 / 用户真实路径 / MCP 端点三者正交**，导致验收全绿而真站编译链 FAIL。

清点结果（`docs/acceptance/2026-11-06-post-cors-retest.md` §7 + 分叉图）：

| 事实 | 产地数 | 代表 |
|---|---|---|
| `base` 推导 | 7 | `astro.config.mjs:27`、`Layout.astro:25`、`appContext.ts:36-47`、`WasmEmbedAdapter.ts:41-44`、`BrowserAssetsAdapter.ts:10-21`、`DownloadStore.ts:178-190`、`deploy-contract.mjs:23`，加 harness 硬编码端口 |
| Forge 货架读取 | 5 | `assets-loader.js:979 catalog()`、`BrowserAssetsAdapter` 四层兜底、`appContext.ts:149-155 catalogProvider`、`publish()` 落的 `/tmp/webassets.json`、harness 直 fetch |
| 「编译/装载」实现 | 3 个入口 2 套实现 | UI `compilePackage` → `compileExtension()`；UI/MCP `installPackage` → `install()`；MCP 无编译能力 |
| `OctaveAssets` 实例构造 | 3 | 文件级别名 `base=''`、`octave-page.js:201` boot 时覆盖成 lane-base、probe 手搓实例 |
| 真站产物 | 3 份 | `dist/assets-loader.js`、`dist/bridge/assets-loader.js`、真站 `deploy-contract.mjs` 拼的 `bridge/bundle.js` |

用 codebase-design 的话说：这是**四个假缝**（每个只有 1 个 adapter 却各自开接口），
不是深模块。删除测试不过：删掉任何一条读法，复杂度会在另外三处重现。

**直接后果（已实测）**：
- `catalog()` 用引擎 lane base 取站点级 `forge-catalog.json` ⇒ 线上 404（§7.1）。
- `BrowserAssetsAdapter.fetchCatalog()` 在 `catalog()` 404 时**自捏一份没有 url/sha256
  的假目录且 `isError:false`** ⇒ `octave_list_packages` 全绿，而 `octave_install_package`
  拿缺 url 的条目走不到 catalogue（CONTEXT.md「降级信号」的反面 = 假绿）。
- `assets-loader.js:1104` `fetchBinary(p.url)`（install）与 `:853` `fetchBinary(srcTar)`
  （compile）仍未走站点根 ⇒ catalog 里 17 包 url 全是 `assets/forge/*.tar.gz`，
  **第二发 404 潜伏**。逐个标 `siteLevel=true` 是打地鼠。
- 验收脚本从没点过 `[data-action="compile"]` / `[data-action="install"]`；
  `probe-*.mjs` 手工 `createOctaveAssets(null, laneBase)` 造产品里不存在的实例，
  跑在与票 B/C/E/F 不同的净化盘上（CONTEXT.md「钓鱼判据」：本仓不自造渔具）。

---

## 1. 目标与成功判据

**目标**：三条路跨**同一个外部 seam**，任何「验收专用入口」在机制上不可表达。

**成功判据（每条都要能证伪）**：

| # | 判据 | 复跑/反向 |
|---|---|---|
| S1 | `base` 只有一个产地：组合根 `resolveDeployment()` 一次解析并冻结 | 静态闸门：`src/` 里 `meta[name="site-base"]` 读取点 == 1；故意加第二处 ⇒ 红 |
| S2 | `forge-catalog.json` 只有一个读者 | 静态闸门：跨 `src/` + `public/bridge/` 读法计数 == 1；故意加直 fetch ⇒ 红 |
| S3 | 站点级 / lane 级 URL 由**逻辑键注册表**单点仲裁，调用方不传 `base` / `siteLevel` / `tier` | 静态闸门：`siteLevel` 布尔、`siteRoot()` 正则、`withSiteBase()` 在 `public/bridge/` 中为 0；反向：故意塞一个 ⇒ 红 |
| S4 | UI / MCP / 验收三条调用方**逐字同形**，且验收脚本不能自造实例 | 新增 `check_acceptance_no_handbase.py`：harness 里出现 `createOctaveAssets` / `__catalogSource` / `__siteBase` / `/repo/Octave/lanes/` 字面量 ⇒ 红；反向断言齐全 |
| S5 | `catalog()` 404 时**响亮失败**，不合成目录 | 单测反向：404 ⇒ `CATALOG_UNREADABLE`，`octave_list_packages` `isError:true`；不得返回 `total>0` |
| S6 | 真浏览器走**用户点按钮序列**：站点根 `assets/forge-catalog.json` 200、零 `lanes/*/assets/` 请求；lane 级 `assets/manifest.json` 200 | `probe` 用 `page.click('[data-action="install"]')` 与 `boot` 按钮，禁止 `page.evaluate` 里造实例 |
| S7 | 第二发 404 闭合：包字节走 catalogue release 分片，零站内 `assets/forge/` 回退 | 真浏览器点 `[data-action="download"]` → `probe-user-install-1106.mjs`：release 分片 200 + 站内回退计数 0；bridge `install()` 旧路径的 `p.url`/`srcTar` 则由 `resolve('forge-pack', …)` 收口（代码闭合，`tests/bridge/assetsPlane.test.ts` 表驱动） |
| S8 | 26 个验收套件与 `.m` 裸名调用零改动 | 全量 774+ 用例绿 + 真浏览器票 B/C/E/F 重跑 |
| S9 | 真站重部署后按用户序列重跑，才谈改判 | **本 spec 不含此项**，列为 Out of Scope（部署不在本仓职责） |

---

## 2. 设计（混合推荐）

### 2.1 Module / Seam / Adapter

| | 现状 | 目标 |
|---|---|---|
| **Module** | `createOctaveAssets` 工厂被 3 处构造 | **`AssetsPlane`**：一个 module、一个 implementation |
| **外部 Seam** | `IAssetsPort` + 裸 `window.OctaveAssets` + `__catalogSource` + 探针手搓实例 | **只有 `IAssetsPort`**，由 `PackageManagerPlugin.getAssetsPort()` 独占 |
| **默认门** | `createOctaveAssets(module, base, isReady)` | **`packageManagerPlugin.loadCatalog()` / `installPackage()` / `compilePackage()`** 零参零配置 |
| **显式门** | 每个调用点各自传 `base` | **`AssetsPlane.create(deployment)`**：仅组合根 / worker / 多 lane / 单测 |
| **Adapter** | `BrowserAssetsAdapter` 自造 base + 3 层兜底；`MockAssetsAdapter` 独立 | 外部缝留 **2 个**：`BrowserAssetsAdapter`（prod，零参转发单实例）+ `MockAssetsAdapter`（test）。内部缝 `fetch` 供给：真实 fetch + 内存 JSON（**不进接口**） |

`harness` 明确**不是 adapter**、不给它开 port：预览服与真站是同一个静态服、同一套
COOP/COEP，两端是同一个 adapter。按 DEEPENING「一个 adapter = 假缝」，给验收开注入口
正是「想作弊都难」要堵的洞。

### 2.2 Interface

**外部 seam（`IAssetsPort`，4 个零配置方法）**：

```ts
interface IAssetsPort {
  fetchCatalog(): Promise<ForgeCatalog>;                 // 唯一读者，失败即 CATALOG_UNREADABLE
  getStatusOf(name: string): PackageStatusResult;        // 只读 catalog 缓存
  install(name: string, opts?: InstallOptions): Promise<InstallResult>;
  compileExtension?(name: string, opts?: CompileOptions): Promise<CompileResult>;
}
```

`InstallOptions` 只允许 `{version, planOnly, onProgress, onDiagnostic}`；
`CompileOptions` 只允许 `{onProgress, onDiagnostic}`。
**删 `base?: string` 构造参数**（`BrowserAssetsAdapter.ts:10-22`）——最后一个「调用方自带 base」入口。

**显式门（同一 module 的第二道门，不是第二个 module）**：

```ts
type Deployment = Readonly<{
  siteBase: string;   // 由 <meta name="site-base"> 唯一解析，必填，缺即 THROW
  laneBase: string;   // `${siteBase}lanes/${laneFolder}/`
  lane: EngineLane;
}>;
AssetsPlane.create(deployment, opts?: { fetch?, module?, worker? }): AssetsPlane;
```

**不变量（Interface 的一部分，不只是 TS 签名）**：
1. `siteBase` 与 `laneBase` 是**两个独立字段，永不合并成一个 `base` 字符串**。
   这条使 2026-11-06 的 404 类缺陷**不可表达**。
2. 默认实例全页唯一；`window.OctaveAssets` 是**句柄**，不是构造点。
   `.m` 侧裸名调用与 26 套件保持逐字兼容（名字与方法全保留）。
3. `forge-catalog.json` 有且只有一个读者。
4. URL 的 `tier`（site / lane）由模块内**逻辑键注册表**判定；调用方只说逻辑键或
   市场条目，**不传 `siteLevel` 布尔、不传 `base`、不拼 URL**。
5. `bind/create` 前任何 `call` 必红（`ASSEMBLY_FAULT` 形状，照 `PackageManagerPlugin.ts:66-85`）。

**顺序**：`resolveDeployment()`（DOM 有 meta 之后）→ `AssetsPlane.bindDefault(deployment)`
→ `setAssetsPort()` / `setDownloadStore()` / `injectServices()` → 任何调用。
引擎 boot 在最后，`OctaveEmbed.create` 只消费 `deployment.laneBase`，不再自己算。

**错误模式**（沿用 `errCode` 闭集 + `__verdict__`，新增两档）：
- `DEPLOYMENT_UNRESOLVED`：meta 与 `BASE_URL` 都拿不到 ⇒ **throw，绝不静默 `'/'`**。
- `SITE_ASSET_UNREADABLE`（含 404）：站点级读取失败 ⇒ CONTEXT.md「降级信号」上抛，
  **不许**触发 `browse()` 合成目录把假绿端上来。
- `LANE_ASSET_UNREADABLE`：lane 级失败 ⇒ boot 链 fatal。
- `CATALOG_UNREADABLE`：删 `octaveListPackages.ts:45` 的 `.catch(() => {})`
  （它把装配缺陷包装成「能力不可用」，与 D11 同形）。
- `UNCLASSIFIED_ASSET`：逻辑键未注册 ⇒ 响亮拒绝，不猜 tier。

**性能**：`_catalog` / `_catalogP` 单例 promise 去重、失败不缓存可重试；
`deployment` 冻结后零次重算；`planOnly` 零网络；删 `BrowserAssetsAdapter` 的 2 个候选
URL + `browse()` 二次调用后，`loadCatalog()` 从最多 4 次网络降到 1 次。

### 2.3 Implementation 藏在 seam 后面

**`resolveDeployment()`（组合根唯一产地）**：

```ts
const siteBase = normalizeTrailingSlash(
  document.querySelector('meta[name="site-base"]')?.getAttribute('content')
  ?? import.meta.env.BASE_URL
  ?? THROW('DEPLOYMENT_UNRESOLVED')
);
const lane = window.__octaveLanePlan?.lane ?? 'wasm32-final';
const laneBase = `${siteBase}lanes/${laneFolderOf(lane)}/`;
return Object.freeze({ siteBase, laneBase, lane });
```

`WasmEmbedAdapter.boot()` 删 `:41-44` 局部推导，直接
`OctaveEmbed.create({ base: deployment.laneBase, lane: lanePlan, ... })`。
`octave-page.js:190-205` 的 `assets(mod, b, isReady)` 钩子**不再构造**：
`b` 废弃，返回唯一实例 + `bindModule(mod)`（保留 `module || global.Module` 惰性语义，
解决 MODULARIZE 别名失效）。C6 每实例状态由 `create()` 保留。

**逻辑键注册表（depth 的实体，吸收设计 B）**：

```js
// public/bridge/assets-loader.js —— 唯一拼接点，只产出绝对 URL
const TIERS = Object.freeze({
  'forge-catalog':   { tier: 'site', template: 'assets/forge-catalog.json' },
  'llvm-manifest':   { tier: 'site', template: 'assets/llvm/manifest.json' },
  'llvm-config':     { tier: 'site', template: 'assets/llvm/config.h.json' },
  'pkg-module-table':{ tier: 'site', template: 'assets/pkg-module-table.json' },
  'octinc':          { tier: 'site', template: 'assets/octinc/octave-headers.tar.gz' },
  'pyodide':         { tier: 'site', template: 'assets/pyodide/pyodide/' },
  'forge-pack':      { tier: 'site', template: 'assets/forge/*' },   // p.url / srcTar 走这里
  'engine-manifest': { tier: 'lane', template: 'assets/manifest*.json' },
  'engine-build':    { tier: 'lane', template: 'octave.build.json' },
});
function resolve(key) {
  const e = TIERS[key];
  if (!e) throw errCode('UNCLASSIFIED_ASSET', key);
  return (e.tier === 'site' ? dep.siteBase : dep.laneBase) + e.template;
}
```

- 删 `siteRoot()` / `withSiteBase()` / `fetchJSON(url, siteLevel)` / `fetchBinary(url, siteLevel)`。
- 六个站点级 + 两个第二发 404 调用点（`fetchBinary(p.url)`、`fetchBinary(srcTar)`）
  一律改走 `resolve('forge-pack')` / `resolve(key)`；**漏标 `true` 变得不可表达**。
- 同表顺手收掉 `installLayer()` 的 `pBase = withBase('assets/pyodide/…')` 双拼
  与 `toolchainWorker()` 的 `assets/llvm/` + `new Worker('compile-worker.mjs')` 相对 URL：
  worker 的 `document` 是 shim 读不到真 meta，由显式门把绝对 URL 序列化进 init 消息。
- `MANIFEST_URL` / `octave.build.json` 自动落 lane。

**catalog 单读者**：删 `BrowserAssetsAdapter.fetchCatalog()` 四层，收成
`async fetchCatalog() { return this.assets.catalog(); }`。
`appContext.ts:149-155` 的 `catalogProvider` 只留 `getCatalog()` 一支。
`__catalogSource`（`assets-loader.js:978`）从公开 API 降级为 `create({fetch})` 的**内部缝**。

**`browse()` 合流收窄**：复跑
`python3 -c "import json;d=json.load(open('public/bridge/assets/forge-catalog.json'));p=d['packs'];print(len(p),sum(1 for x in p if x.get('url')),sum(1 for x in p if x.get('sha256')),sum(1 for x in p if x.get('versions')),sum(1 for x in p if x.get('description')),sum(1 for x in p if x.get('links')))"`
实测：全部包都有 `url` / `sha256` / `size`，带 `versions[]` 的那部分版本条目也带
定位三键；`description` / `links` 并非全部包都有（`form:"tree"` 的能力层缺）。
故删「合成目录」与「versions 覆盖」是安全的（市场三键不丢），
但 `browse()` 仍只补 `status`（运行时安装态，目录里确实没有），
**不补 description/links** —— 免得把能力层条目洗成「有描述」的假象。

**错误分级**与**降级信号**见 §2.2。

### 2.4 三条路逐字同形（吸收设计 C）

共享的那一行是 `modelContext.callTool(name, args)`（或它驱动的同一个按钮 handler）：

```js
// ① UI · PackageManagerModal.svelte 的 onclick
onclick={() => modelContext.callTool('octave_install_package', { name: item.name })}

// ② MCP agent
await modelContext.callTool('octave_install_package', { name: 'signal' });

// ③ 验收脚本（唯一合法动作）
await page.click('[data-action="install"][data-package="signal"]');
// 或
await page.evaluate(() => modelContext.callTool('octave_install_package', { name: 'signal' }));
```

三条都跨同一 seam、拿到同一个 `packageManagerPlugin` 单例、同一个 `AssetsPlane` 实例。
schema 里没有 `base` / `lane` / `catalogSource` 参数（`octaveInstallPackage.ts:9-16`）。

**验收「只能像用户一样操作」**：

```js
const seen = [];
page.on('response', r => { if (/forge-catalog\.json/.test(r.url()))
  seen.push(`${r.status()} ${new URL(r.url()).pathname}`); });
await page.click('[data-action="install"][data-package="signal"]');
assert(seen.some(u => u.startsWith('200 ') && u.endsWith('/assets/forge-catalog.json')));
assert(seen.every(u => !/lanes\/[^/]+\/assets\//.test(u)));   // 零 lane 404
```

`page.evaluate` 里禁止出现 `createOctaveAssets` / `OctaveAssets` / `__catalogSource` /
`__siteBase` / 任何 `/repo/` 开头的字符串。探针的**同类肯定用例**（AGENTS 纪律 3）仍在：
点之前先证 `[data-action]` 按钮存在且被 `page.click` 命中。

> **`API.resolve` 的定位**（2026-11-06 收口后 review 澄清）：它是模块内的
> **只读对账面**（CONTEXT.md「对账器」），给 `check_asset_tiers.py` 与
> `tests/bridge/assetsPlane.test.ts` 核对逻辑键 → 绝对 URL，产品调用方零消费。
> 它不是验收入口：`check_acceptance_no_handbase.py` 禁止 harness 调它，
> 验收只能点按钮 / 调 `modelContext.callTool`。
> `window.__resolveOctaveDeployment` 同理是**组合根注入函数**（生产必需：
> `<meta>` 在 DOM 就绪后才可读），不是验收探针；harness 不得写它。

---

## 3. 删除清单（动手前逐条列给用户，不悄悄改）

| # | 文件 | 删除 | 理由 |
|---|---|---|---|
| D1 | `src/modules/appContext.ts:36-47` | `getSiteBase()` 独立推导（并入 `resolveDeployment()`） | S1 |
| D2 | `src/modules/appContext.ts:149-155` | `catalogProvider` 的 `getAssetsPort().fetchCatalog()` 直呼（改 `packageManagerPlugin.loadCatalog()`，走同一 port 的缓存填充） | S2（不算第二个读者，但消除「绕过插件缓存」支流） |
| D3 | `src/modules/engine/WasmEmbedAdapter.ts:41-44` | 局部 base 推导，改吃 `deployment.laneBase` | S1 |
| D4 | `src/modules/plugins/package/BrowserAssetsAdapter.ts:10-22` | `base?: string` 构造参数 | Interface 不变量 4 |
| D5 | 同上 `:24-104` | 四层 fallback（catalog()→直 fetch×2→browse() 合成） | S5，假绿来源 |
| D6 | 同上 `:107-151` | `versions[]` 覆盖式合流（收窄成只补 status） | 实测目录已带三键 |
| D7 | `public/bridge/assets-loader.js:123-126` | `siteRoot()` / `withSiteBase()` 正则反剥 | S3 |
| D8 | 同上 `:146-160` | `fetchJSON(url, siteLevel)` / `fetchBinary(url, siteLevel)` 布尔 | S3 |
| D9 | 同上 `:1210` | 文件级别名 `createOctaveAssets(null, '', …)` 的**构造**，改为绑定唯一实例 | S4 / 双实例 |
| D10 | `public/bridge/octave-page.js:190-205` | `assets()` 钩子里第二次 `createOctaveAssets(mod, b, …)` 与覆盖别名 | S4 / 双实例 |
| D11 | `public/bridge/assets-loader.js:978` | `__catalogSource` 公开面（降为 `create({fetch})` 内部缝） | S4 |
| D12 | `src/modules/storage/DownloadStore.ts:178-190` | 独立 `baseUrl` 推导（改吃 `deployment.siteBase`） | S1 |
| D13 | `scripts/deploy-contract.mjs:23,85-90` | **改口径，不删**：`BASE="/repo/Octave/"` 是**构建期**往 `<meta site-base>` 注入的字面量，与运行时 `resolveDeployment()` 不同层；`Layout.astro:25` 与它写的是同一个唯一 DOM 输入点，且 `:323` 有「缺 meta 即报」校验。真正要防的是**运行时第二产地**（D1/D3/D4/D12 已删）。保留并在注释里写清「构建期信号 ≠ 运行时 base 推导」 | S1（构建期/运行时分层） |
| D14 | `public/lanes/*/assets-loader.js` 3 份旧副本 | 无 `siteRoot` 的 394 行旧版（改 symlink / 同源单文件） | S3 locality |
| D15 | `tests/bridge/siteLevelAssets.test.ts` | 4 条正则读源码的静态锁（改成跨接口行为用例 + 表驱动） | DEEPENING「replace, don't layer」 |
| D16 | harness `probe-bridge-catalog-1106.mjs` / `probe-bridge-lane-base-1106.mjs` | 手搓 `laneBase` + `createOctaveAssets(null, …)` | S6 |
| D17 | harness `fish-g-catcheck{15,16,18}.mjs` | 标记**退役/历史诊断**（`__catalogSource` 已从公开面移除，脚本不再可跑；保留仅为 11-05 探索留痕，不作验收证据）。`fish-g-reverse.mjs:86-97` 的 `addInitScript` 注入删除，改由既有 `route('**/forge-catalog.json')` 提供受控字节；`1-pre` 判据改成「经统一 seam 的 `catalog()` 读到带 url 的目录」同类肯定用例 | S4 / S6 |
| D18 | harness `fish-e-plugins-1106e.mjs:496` | 只拦站点根的 `route('**/assets/forge-catalog.json')` | 补 lane 前缀反向 |

**保留**（不删）：`window.OctaveAssets` 名字与 `catalog()/install()/compileExtension()/
statusOf()/browse()` 方法面（26 套件 + `.m` 裸名依赖）、`MockAssetsAdapter`（外部缝
adapter #2，两个才成立真缝）、`catalogueUrlCandidates()` 跨源候选（不同 artifact、
不同缝）、`_catalogP` 去重缓存、C6 每实例状态（由 `create()` 保留）、
`deploy-contract.mjs` 的 bundle 拼接（真站第三份产物，属 Out of Scope 的部署面）。

---

## 4. 测试策略（DEEPENING：replace, don't layer）

1. **跨接口行为用例**替代静态正则：
   - `AssetsPlane.create({siteBase, laneBase, fetch: inMemory})` →
     `catalog()` 断言 URL 落站点根；`init('assets/manifest.json')` 断言落 lane。
   - 三类齐全：正常不报 / 该报的必须报（`UNCLASSIFIED_ASSET`、404 ⇒ `CATALOG_UNREADABLE`）/
     空输入（`DEPLOYMENT_UNRESOLVED`）。
2. **反向断言**：
   - 摘掉 meta ⇒ `DEPLOYMENT_UNRESOLVED`；
   - catalog 404 ⇒ `octave_list_packages` `isError:true`，**不得** `total>0`；
   - 把注册表里 `forge-catalog` 的 tier 改成 `lane` ⇒ 真浏览器必须红；
   - harness 里塞一行手搓 base ⇒ 新闸门必须红。
3. **同类肯定用例**：点 `[data-action="install"]` 前先证按钮存在且被命中；
   断言 catalog 200 前先证探针能数到请求。
4. **跨语言对账闸门**：`check_asset_tiers.py` 对 `public/bridge/assets-loader.js` 的
   `TIERS` 表与 `src/` 侧逻辑键常量做存在性核对（CONTEXT.md「对账器」：工单说判据在
   X，闸门查 X 真的在），防 JS/TS 两份判据漂移（设计 A 指出的风险）。
5. **验收脚本闸门**：`check_acceptance_no_handbase.py`，发现式名录接入
   `gates-selftest.sh`，必须带 `--selftest` + 机器行 + 三类用例。

---

## 5. Out of Scope

- 真站 `https://isui.ren` 重部署与重跑（部署不在本仓职责；S9 单列）。
- 改上游引擎仓（绝对只读）。
- 把 `install()` 与 `compileExtension()` 合并成 `ensure(mode)`：本 spec 只统一
  **入口与路径事实**，两套内部实现可在后续票收敛（避免本轮爆炸面过大）。
- 给 MCP 补编译能力：同上，后续票（但注册表要给它留 `compile` 逻辑键）。
- `dist-full`（79 字节）口径、CF 备线浏览器直连、低端设备性能。
- 11-05 报告的 **FAIL 判定不改判**。

---

## 6. 里程碑（implement 顺序）

1. spec（本文件）→ 2. `resolveDeployment()` + 类型 → 3. `TIERS` 注册表 + `resolve()` →
4. 删第二实例与三层 fallback → 5. 改 harness 与闸门 → 6. 全量 774+ 用例 / tsc /
   全闸门 / `gates-selftest.sh` → 7. 真浏览器按用户点按钮序列复跑（S6/S7）→
   8. code-review 双轴 → 9. 提交推送（README 同批 + FACTS 逐键）。

每步跑单文件测试 + tsc；最后跑一次全量。**不一边测一边悄悄改产品代码**：
删除清单 D1–D18 已逐条列出，实现时按清单走，不增不减。
