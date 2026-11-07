# 站侧补头后复跑 + 下载/装载解耦回归修复（2026-11-06）

> 接 `2026-11-05-no-hosted-release.md` 的 FAIL 裁定。站侧回信 `mail/104-shirone-cors-corp-fixed-both-lines.md`
> 报告 EO 主线与 CF 备线均已给 `/ArchivalEra/*` 的 manifest / 分片补
> `Access-Control-Allow-Origin: *` + `Cross-Origin-Resource-Policy: cross-origin`。
> 本文件记录**补齐后的默认线上路径复跑**、期间发现并修掉的四处产品/探针缺陷，
> 以及一次「为了过判据把站点特色改没了」的回归与回退。
>
> **⚠️ 2026-11-06 晚间 code-review 后追加（§7）：真站 `https://isui.ren/repo/Octave/`
> 的编译链实测仍 FAIL**（Forge 货架 404）。§0 的五个 PASS 表只成立于
> `localhost:8906` 的净化副本与各自判据面，**不构成真站全链路跑通**。
> 该缺陷已定位并修复，证据见 §7；判定口径见 §7.4。

---

## 0. 三分钟速读

**站侧 BLOCKER 已解除。** 补头后真浏览器在净化 dist 上重跑：

| 面 | 复跑结果（括号为复跑命令） | 证据 |
|---|---|---|
| Octave 三档真 boot + 大字节全走 release | **PASS**（`38/0`；`node fish-b-octave.mjs`） | `docs/acceptance/evidence/B-2026-11-06-final.md` |
| OMC 引擎 + MSL 工具链（**最终解耦版**） | **PASS**（`24/0`；`node fish-c-final-1106.mjs main`） | `docs/acceptance/evidence/C-final-real-omc-2026-11-06.md` |
| 五插件 + WebMCP 七工具 + 三条 callTool | **PASS**（`41/0`；`node fish-e-plugins-1106e.mjs`） | `docs/acceptance/evidence/E-verdict-2026-11-06.md` |
| fzstd 只拉一次 / 不持久 / 编解码 / 并发 2 | **PASS**（`38/0`；`node fish-f-fzstd-1106f.mjs`） | `docs/acceptance/evidence/F-verdict-2026-11-06.md` |
| 下载/装载解耦（独立探针面） | **PASS**（`9/0`；`node fish-msl-decoupled2.mjs`） | `docs/acceptance/evidence/C-decoupled-2026-11-06.md` |

> 复跑命令均在 `/mnt/hdd/zcode-test/harness` 下执行，预览服指向净化副本 `dist-clean`。
> `docs/acceptance/evidence/C-2026-11-06-retest.md`（`19/0`）是**已翻案的历史记录**：
> 它采自 §3.4 回退前的「装载时现场装配」耦合版，不作最终态证据。

**但本文件不把 11-05 报告的 FAIL 改判。** 原因见 §5：仍有未闭合的债（LLVM 工具链
运行期取字节、CF 备线浏览器直连、4 个 `.tar` 白名单缺口、失败可见性结构化原因），
且本报告新增的 `.md` 会令 `md_files`/`md_lines` 漂移，数值以 `FACTS.json` 为唯一产地、
由 `--render-doc` 重渲 `STATE.md`，本文件不作第二产地（纪律 2）。

---

## 1. 站侧响应头复核（实测，不是转述回信）

复跑：

```bash
for u in \
  https://static.isui.ren/catalogue.json \
  https://static.isui.ren/ArchivalEra/OpenModelica-Full-Wasm/releases/download/msl-4.1.0-maint.om/manifest.json \
  https://static.isui.ren/ArchivalEra/LLVM-wasm/releases/download/v0.1.6/manifest.json; do
  curl -sS --max-time 20 -I "$u" | grep -icE '^access-control-allow-origin|^cross-origin-resource-policy'
done
# ⇒ 三条各输出 2
```

EO 主线 manifest / zstd 分片 / catalogue 全部 `HTTP/2 200` + 两头。
CF 备线 `static.mango-mesa.ccwu.cc` 直连 TLS 被重置（本环境出口限制，11-05 A 票已记），
走系统代理 `HTTP/2 200` + 两头 ⇒ **默认线上路径未验**，不算 PASS 也不算产品 FAIL。

---

## 2. 净化副本口径（沿用 11-05 的 `dist-clean`，不是最终 `dist-full`）

`dist/` 重建后 release 类白名单计数仍为 767（复跑
`find dist -type f | grep -E '\.(wasm|tar\.gz|zip|whl|tar\.bz2|oct|data)$' | wc -l`），
净化副本 `dist-clean` 移走 767 条、保留 394 文件、白名单计数 0。
`npm run build` 只重打 source，不动 `lanes/*` 下的 release 字节（前后清单 `diff` 为空）。

**这与 11-05 报告 §4.4/§5.18 的口径不同**：那里判定「最终口径应是 `dist-full`
（79 个 release 字节移走）」，因为 `dist-clean` 的白名单漏了
`assets/llvm/` 与 `bridge/assets/llvm/` 下 4 个 `sysroot-headers*.tar`
（票 A §1.4 / 票 D §8 实测）。本轮**没有**在 `dist-full` 上重跑 A–G，
所以下面所有 PASS 都只对 `dist-clean` 口径成立，§5.4 如实列为未验边界。

---

## 3. 本轮修掉的四处缺陷（每处都有反向断言）

### 3.1 D1 · w64 车道 `assets/manifest.json` 拼错目录

**实测**：`lanes/master/w64/assets/manifest.json` 404，
`lanes/master/assets/manifest.w64.json` 200（`curl -sS -o /dev/null -w '%{http_code}' <url>`）。
旧实现把清单拼在 `chosenFolder`（`lanes/<lane>/w64`）下 ⇒ 整个引擎下载在
`saveManifest()` 前抛 `STORAGE_WRITE_FAILED` ⇒ 记账为空 ⇒ boot 判 `unchecked` 拒启，
错误文案还误导成「盘坏了」。

**修复**：`src/modules/storage/DownloadStore.ts` 把清单 URL 折叠回车道根，
并按 variant 选 `manifest.w64.json` / `manifest.json`（与 boot 侧 `lanePlan.manifest` 对齐）。

**回归**：`tests/storage/DownloadStore.test.ts` 新增「只给真实站点布局三条 fixture」用例；
旧测试把错误路径和正确路径都塞了 fixture，所以从未红过。反向断言用
`MockFetchAdapter.requestedUrls()` 钉住「绝不请求 `lanes/master/w64/assets/manifest.json`」。
`MockFetchAdapter` 的 `requestLog` 是为此新增的诊断面（`src/modules/storage/FetchPort.ts`）。

### 3.2 D2 · OPFS inline script 无 `src` ⇒ w64 pthread 全挂

**实测**：`verified` + `assertBootable=true`，但 w64 两档卡在
「Starting WebAssembly kernel」30 秒超时；console 四次
`Unexpected token '<'`，四个 worker 去加载 `http://localhost:8904/repo/Octave/`
（`text/html`）。根因是 Emscripten 胶水用
`var _scriptName = globalThis.document?.currentScript?.src`，再在
`allocateUnusedWorker()` 里 `new Worker(_scriptName)`；inline `textContent` 注入没有 src
⇒ worker 加载文档 HTML ⇒ pthread 全挂。

**修复**：`src/modules/engine/WasmEmbedAdapter.ts` 改为 `URL.createObjectURL(jsBlob)` +
`script.src = blob:...` 并等待 onload。

**回归**：`tests/engine/WasmEmbedAdapter.test.ts` 断言注入 script 的 `src` 是
`blob:octave-local-glue`、`textContent` 为空、且 `createObjectURL` 只调一次。
修复后票 B 三档全 boot（原先仅 wasm32-final）。

### 3.3 探针缺陷 · `disp(40+2)` 判据测错了面

`disp()` 在 Octave 里打印但不返回值，`callTool('octave_eval')` 的 text 恒空 ⇒
11-05 票 B 用「text 里有 42」当判据，是探针面缺陷不是产品缺陷（纪律 3：
断言面自己也要有判据）。改用
`window.octave.evalJSON('40+2').value === 42` + `eval('disp(40+2)').ok === true`
+ `callTool` 非错误三面判据；独立探针实测 `{"ok":true,"value":42,"rc":0}`、
console `[log] 42`，反向 `!==41` 亦成立。

### 3.4 D3 · MSL 装载硬编码站内路径 ⇒ 改走 catalogue ⇒ 再回退为解耦

这一段是本轮最该记的教训，分三步：

1. **11-05 报告的债**：`omc_load_msl.ts` 直接 `fetch(站内 assets/msl/*.zip)`，
   净化盘 404。票 C 站侧补头后仍 `16 PASS / 3 FAIL`，同类肯定用例证明运行时能装、
   release 字节是对的，缺的是「工具按分发契约去取」这条产品路径。
2. **第一次修（错误）**：新增 `src/modules/storage/releaseAssetBytes.ts`，让装载工具
   现场从 catalogue 装分片、`不落盘`。票 C 一度 `19 PASS / 0 FAIL`（历史/已翻案，
   见 `docs/acceptance/evidence/C-2026-11-06-retest.md` 的翻案标记），
   **但这把站点特色「下载（写 OPFS）与装载（载入运行时）彻底解耦」
   （README.md:28-29 / `mail/read/018-extra-content-re-047-answers.md` 复验）改没了**：
   不能预下载、不进 OPFS 缓存、配额预检覆盖不到、重进页面要重拉分片。
   **根因是改之前没读 README 契约**，只读了工具与分发源两个文件。
3. **回退重做（正确）**：
   - 删除 `releaseAssetBytes.ts` 及其测试；
   - `omc_load_msl` 注入 `setMslDownloadedAsset`，装载只读 OPFS 已下载字节，
     未下载 / 物理缺件 ⇒ 显式 `NOT_DOWNLOADED`，证据面 `source:'opfs-download'`；
   - `appContext.ts` 闭包**不自己造 ref**（UI 的 ref 含 `selectedVersions` /
     `isTreeForm` 等态，装载侧复刻必然漂）：按市场条目 `name` 在
     `downloadStore.index()` 记账里找已下载记录，用记录自身的 `ref` 做
     `stat()` 物理对账，再 `workspaceStorage.store.read(f.path)` 读字节；
   - `DownloadStore.resolvePreTarget` 的 `form:"file"` 分支**保持 086 裁定的历史形状**：
     产品下载走 `kind:'src' → resolveSrcTarget`（那里本就有 releaseSource 分支），
     `kind:'pre'` 全仓零构造点。审查一度指出「给不可达分支复制一份 releaseSource
     会造出形状 A 测试、形状 B 生产」，故删掉该复制，回归测试改用产品真实形状
     （`kind:'src'`、落盘 `downloads/src/...`）。

**真浏览器解耦验收**（`=== 9 PASS / 0 FAIL ===`，复跑见
`docs/acceptance/evidence/C-decoupled-2026-11-06.md`）：
- 未下载 ⇒ `NOT_DOWNLOADED` + 零外部网络请求（反向断言）；
- 真 UI 点包管理器下载 ⇒ 4 个 `msl__...identity.NNN` 分片 200 → OPFS 落盘；
- 装载 ⇒ 从 OPFS 读 19482938 B、`opfsPath` 与下载落盘路径逐字一致、
  装载阶段零外部网络、`omc_vfs_load_zip` 真收到字节、装后 `loadModel(Modelica)=true`。

单元测试反向锁：`tests/plugins/webmcp-omc-msl.test.ts` 把装载期的
`globalThis.fetch` 桩改成**任何 URL 都抛**（不只站内，含 release 域名）——
旧版只禁站内 fetch 却放行 release fetch，正是解耦回归没被测到的原因。

---

## 4. 票 C 反向断言（能力拿掉必须红）

`abort` 两份 OMC/MSL release manifest、`catalogue` 与 Octave release 放行 ⇒
主引擎仍 boot，`__omc` 从 `object` 变 `undefined`，`omc_load_msl` 报
`CAPABILITY_UNAVAILABLE`，`abortHits=2` 先证摘到了。
复跑见 `docs/acceptance/evidence/C-verdict-2026-11-06.md`（§反向断言段）
与 `/tmp/msl-verify-2026-11-06/evidence/C-msl-reverse.log`。

---

## 5. 未闭合的债（不写「已解决」）

1. **LLVM 工具链运行期取字节**：`public/assets-loader.js` 仍硬编码
   `assets/llvm/manifest.json` / `sysroot-headers.tar`。catalogue 的
   `LLVM-wasm/v0.1.6` 发 14 个独立 entry（含 `clang.wasm`、
   `sysroot-headers.tar`、`driver__*.mjs`），票 D 的「产物名+sha 定位」判据 PASS，
   但**真编译链的取字节路径**没走分发契约，也没在本轮验真编一次 `.oct`。
2. ~~**BrowserAssetsAdapter.fetchCatalog**~~：**已修**（11-05 报告 §3.5 的债）。
   `p.versions = e.versions` 整组覆盖会让 `browse()` 的无 url 条目冲掉市场契约的定位三键；
   改为按 version 逐条合流、市场侧 `url`/`sha256`/`size` 优先，`browse()` 只补元数据。
   回归 `tests/plugins/BrowserAssetsAdapter.test.ts` 反向锁「合流后 url/sha256/size 仍在」。
3. **引擎回落站内 `lanes/`** 与 **`loadCatalogue` 只有 `console.error`、
   无结构化原因/UI**：回信 104 §5 也点名建议优先，本轮未动。
4. **CF 备线浏览器直连**、**`base_proxy` 未被消费**、**4 个 `.tar` 白名单缺口**
   （票 A §1.4 / 票 D §8）：如实列为未验边界。
5. **CDN 边缘节流**：连续拉约 38 MB 时偶发卡在 2 个分片；票 F 的 4 条旧 FAIL
   经「3 个全新 document 独立复现 + 写 marker 肯定用例」确认为探针窗口而非产品缺陷，
   修正脚本对卡顿 document 自动重开后 `38 PASS / 0 FAIL`。
6. **低端设备（2GB 内存手机）性能量测**：未验。
7. **原 30 条表的 #29（`assertBootable` 在真盘返回 verified）**：D2 诊断期间曾在
   浏览器 console 临时观测到 `checkPhysicalStatus(master,w64)` 的 `integrity:"verified"`
   与 `assertBootable=true`，但那是诊断日志、未落成可复跑证据文件，按纪律
   「写不出复跑方式的句子只能当历史读」**不写成已验**。票 B 的 38 PASS 判据面是
   `window.octave`/`__octaveReady`/分片 URL，不直接调该断言；补证需另跑一条
   带落盘日志的浏览器探针。

---

## 6. 复跑与闸门

```bash
# 站侧头
curl -sS --max-time 20 -I <manifest-or-chunk-url> | grep -iE 'HTTP/|access-control|cross-origin-resource-policy'

# 真浏览器各票（预览服指向净化副本 dist-clean，COOP/COEP 与真站同款）
cd /mnt/hdd/zcode-test/harness
node fish-b-octave.mjs                    # 票 B 三档
node fish-c-final-1106.mjs main       # 票 C 最终解耦版（真 OMC 引擎，24/0）
node fish-msl-decoupled2.mjs         # 下载/装载解耦独立探针（9/0）
node fish-e-plugins-1106e.mjs            # 票 E
node fish-f-fzstd-1106f.mjs              # 票 F

# 本仓
CI=true npx vitest run                    # 用例数以当次输出为准
npx tsc --noEmit                         # 49 个既存 TS 错误，零新增
sh gates-selftest.sh
for g in zreflect/check_*.py; do python3 "$g" || exit 1; done
```

数值口径：新增 `.md` 后 `md_files` / `md_lines` 会漂移，按 §6 纪律以
`FACTS.json` 为唯一产地、`--accept-changes=md_files,md_lines` 逐键放行重测，
`STATE.md` 机器块由 `--render-doc` 重渲，本文件不手抄这些值。

**三语 README 既有缺口（如实记录，非本轮引入）**：仓内只有 `README.md`，
`Einfacht.env` 把 `REFLECT_READMES=README.md` 设为单条目 ⇒ 互链判据退化；
不加载该 env 时 `python3 zreflect/check_readme_sync.py` 裸跑报 4 个问题。
钩子实际执行时通过 `reflect-hooks/einfacht-env.sh` 加载该文件 ⇒ pre-push 绿。
单条目清单下 `--changed` 判据**仍要求本次推送的改动集含 `README.md`**
（AGENTS.md 硬坑「改任何一份 ⇒ 同批」），故最终提交 `e0a430e` 把 §0 的
事实摘要同步进了 `README.md` 一并推送；`README.zh.md` / `README.de.md`
在仓内不存在，是 `Einfacht.env` 单条目配置造成的既有缺口，如实记录未修。

---

## 7. 真站线上复测（code-review 后追加，2026-11-06 晚间）

### 7.1 线上实测失败（用户贴回，不是推断）

```
[failed] 编译失败：读不到 Forge 货架（assets/forge-catalog.json）：
取清单失败 /repo/Octave/lanes/wasm32-final/assets/forge-catalog.json → HTTP 404
errCode@https://isui.ren/repo/Octave/bridge/bundle.js:82:15
createOctaveAssets/catalog/_catalogP<@https://isui.ren/repo/Octave/bridge/bundle.js:1050:17
```

本地净化盘与真站逐字复现（复跑
`curl -sS -o /dev/null -w '%{http_code}' <url>`）：

| 路径 | 本地 8906 | 真站 |
|---|---|---|
| `/repo/Octave/assets/forge-catalog.json` | 200 | 200 |
| `/repo/Octave/bridge/assets/forge-catalog.json` | 200 | 200 |
| `/repo/Octave/lanes/wasm32-final/assets/forge-catalog.json` | **404** | **404** |

### 7.2 根因（两轴审查一致判定）

`WasmEmbedAdapter.ts` 传给 `OctaveEmbed.create({base})` 的是
`${normalizedBase}lanes/${laneFolder}/` —— 这是**引擎产物 base**
（胶水 / `octave.build.json` / `assets/manifest.*.json` 都在 `lanes/<lane>/` 下，正确）。
但 `public/bridge/assets-loader.js` 的 `createOctaveAssets(module, base, isReady)`
把同一个 `base` 用 `withBase(u){return base+u}` 套到**站点级资产**上：
`catalog()` 的 `fetchJSON('assets/forge-catalog.json')` ⇒ 拼出
`/repo/Octave/lanes/wasm32-final/assets/forge-catalog.json` ⇒ 404。

一个 `base` 承载两种语义（Primitive Obsession / Mysterious Name）。
11-05 报告 §3.4 已判「`assets-loader.js` 硬编码站内路径」FAIL，
11-06 §5.1 却把它降级成「未闭合的债 / 没验真编一次 .oct」——
**把已实测的 FAIL 写成未验边界**，违反 AGENTS.md 纪律 5（活状态只写实测）。

### 7.3 为什么之前的「全绿」没抓到（纪律 3 反例）

- `git diff main...e0a430e -- public/` 为空：`public/bridge/` 一行未改。
- 770 个 vitest 用例里 `tests/` 对 `createOctaveAssets` / `API.catalog()` /
  `CATALOG_UNREADABLE` **零引用**；`BrowserAssetsAdapter.test.ts` 用的是注入的
  `window.OctaveAssets.catalog()`，不是 bridge 实例。
- 票 B/C/E/F 的判据面是 boot / MSL 装载 / 插件 WebMCP / fzstd；票 E 的反向
  `abort` 刻意模拟的是**站点根** `assets/forge-catalog.json`，
  从没走一次带 `lanes/<lane>/` 前缀的 `API.catalog()`。
- 11-05 §5.19 把「线上 `isui.ren` 路径」列为 spec Out of Scope，
  于是真站已发生的 FAIL 在验收口径里没有归属。
  这正是「测不到 ≠ 不存在」：探针面根本没对准缺陷面。

### 7.4 修复与复跑

`public/bridge/assets-loader.js`：
- 新增 `siteRoot()` 从 `base` 剥掉 `lanes/<lane>/` 段得站点根，`withSiteBase(u)`；
- `fetchJSON(url, siteLevel)` / `fetchBinary(url, siteLevel)` 在 `siteLevel` 时走站点根；
- 6 个站点级调用（`forge-catalog` / `llvm/manifest` / `llvm/config.h` ×3 /
  `pkg-module-table` / `octinc`）显式标 `true`；
- `fetchJSON(url || MANIFEST_URL)`（lane 级引擎清单）**不标**，保持 `withBase`。

复跑（`/mnt/hdd/zcode-test/harness`）：

```bash
node probe-bridge-catalog-1106.mjs     # === BRIDGE_CATALOG: PASS ===
#   catalog() → /repo/Octave/assets/forge-catalog.json HTTP200, packs:17, 零 lane 404
node probe-bridge-lane-base-1106.mjs   # === LANE_BASE: PASS ===
#   init('assets/manifest.json') → /repo/Octave/lanes/wasm32-final/assets/manifest.json HTTP200
CI=true npx vitest run tests/bridge/siteLevelAssets.test.ts   # 4/4 静态防回潮锁
```

两条探针是**同类肯定 + 反向**成对：站点级走根 200、lane 级仍走车道 200，
互不干扰。原始输出：`/tmp/msl-verify-2026-11-06/evidence/bridge-*.log`。

### 7.5 判定口径（如实写）

- **11-05 的 FAIL 判定仍不改判**：真站编译链此前实测 FAIL，
  本轮修复只在本地净化盘 + 真浏览器探针上验过，**没有**在 `https://isui.ren`
  重新部署后再跑一次（部署不在本仓职责内，spec Out of Scope）。
- §0 的五个 PASS 表**只成立于各自的 localhost 判据面**，
  不是「真站全链路跑通」。Spec 轴据此判「今天一定要跑通」的目标
  **按真站事实未达成**；本轮补上的修复与证据是朝目标推进，不是达成证明。
- 30 条判据里，#2（重跑全链路）、#12（LLVM 运行期取用）、#15
  （包管理器目录非空，真站插件面曾空壳）、#30（诚实列边界）
  受这条 404 直接影响，需在真站重部署后重定性。
- 仍未闭合：`compile-worker.mjs` 里 `assets/llvm/` 与 `octincTarUrl` 的
  worker 相对 URL 解析、`pyodide` 的 `pBase` 双拼、CF 备线直连、
  `dist-full`（79 字节）口径、`loadCatalogue` 结构化原因。
