# 票 C · OMC 引擎 + MSL 工具链（净化 dist 真浏览器验收）

- 日期：2026-11-05
- 子代理：`fish/C`，端口 **8905**，预览服见下
- 产物：本文件 + `/tmp/fishing-2026-11-05/evidence/C-raw.log` + `/mnt/hdd/zcode-test/harness/fish-c-omc.mjs`（+ `fish-c-msl-probe.mjs`）
- 纪律：只改证据与仓外脚本，**未改任何产品代码**；净化 dist 只读（playwright `route.fulfill` 回放的字节来自生产仓 `public/omc/`，磁盘未写 dist）；未改 `SHARED.md`；未手动装配 `window.__omc`。

## 复跑命令（逐字）

```bash
# 0) 预览服（若已起则跳过；绑 [::1]，用 localhost）
cd /tmp/fishing-2026-11-05/wt-C
python3 scripts/serve.py --dir /tmp/fishing-2026-11-05/dist-clean --port 8905 &

# 1) 页面 / 净化字节 HTTP 形状
curl -s -o /dev/null -w "index: %{http_code}\n" http://localhost:8905/repo/Octave/
curl -s -o /dev/null -w "omc.js: %{http_code}\n" http://localhost:8905/repo/Octave/omc/OpenModelicaCompiler.js
curl -s -o /dev/null -w "omc.wasm: %{http_code}\n" http://localhost:8905/repo/Octave/omc/OpenModelicaCompiler_bg.wasm
curl -s -o /dev/null -w "msl.zip: %{http_code}\n" http://localhost:8905/repo/Octave/assets/msl/msl-4.1.0-maint.om.zip

# 2) 判据根因（路径级 CORS 差异；-I 带 Origin 模拟浏览器）
for u in \
  "https://static.isui.ren/catalogue.json" \
  "https://static.isui.ren/ArchivalEra/OpenModelica-Full-Wasm/releases/download/v0.2.0-wasm32/manifest.json" \
  "https://static.isui.ren/ArchivalEra/OpenModelica-Full-Wasm/releases/download/msl-4.1.0-maint.om/manifest.json" \
  "https://static.mango-mesa.ccwu.cc/catalogue.json" \
  "https://static.mango-mesa.ccwu.cc/ArchivalEra/OpenModelica-Full-Wasm/releases/download/v0.2.0-wasm32/manifest.json" ; do
  echo "-- $u"
  curl -sSI --max-time 20 -H "Origin: http://localhost:8905" "$u" | grep -iE '^HTTP/2 |^access-control-allow-origin:|^content-length:' | head -5
done
# GitHub base_proxy（302 → release-assets.githubusercontent.com）
curl -sS --max-time 30 -L -D - -o /dev/null -H "Origin: http://localhost:8905" \
  "https://github.com/ArchivalEra/OpenModelica-Full-Wasm/releases/download/v0.2.0-wasm32/manifest.json" \
  | grep -iE '^HTTP/2 |^access-control-allow-origin:' | head -8

# 3) 五个钓鱼模式（脚本必须在 harness 下跑，那里有 playwright 的 node_modules）
: > /tmp/fishing-2026-11-05/evidence/C-raw.log
cd /mnt/hdd/zcode-test/harness
for m in main diag positive mirror reverse; do
  echo "### MODE=$m START $(date -Is)" >> /tmp/fishing-2026-11-05/evidence/C-raw.log
  timeout 590 node fish-c-omc.mjs "$m" >> /tmp/fishing-2026-11-05/evidence/C-raw.log 2>&1
  echo "### MODE=$m EXIT=$? $(date -Is)" >> /tmp/fishing-2026-11-05/evidence/C-raw.log
done

# 4) MSL 工具 fetch 目标 URL 的 HTTP 层探针（工具因前置门短路，见 §判据 4）
cd /mnt/hdd/zcode-test/harness && node fish-c-msl-probe.mjs
```

单次复跑可只跑 `node fish-c-omc.mjs main`（约 2–3 分钟）；全套五模式约 13 分钟。

## 环境 / 前置（同类肯定用例，全部自跑，未抄 SHARED.md）

| 项 | 实测 | 复跑命令 |
|---|---|---|
| 预览服 index | `200`（23858 B / 479–517 ms） | `curl -s -o /dev/null -w "%{http_code}" http://localhost:8905/repo/Octave/` |
| `omc/OpenModelicaCompiler.js` | `200` | 同上换路径 |
| `omc/OpenModelicaCompiler_bg.wasm` | **404**（净化副本已移走，见 `removed-files.txt:763`） | 同上换路径 |
| `assets/msl/msl-4.1.0-maint.om.zip` | **404** | 同上换路径 |
| `window.modelContext` 就绪 | `mcOk=true` | `fish-c-omc.mjs main` §0b |
| `listTools()` | 7 个：`octave_eval / octave_run_cell / octave_get_workspace / octave_list_packages / octave_install_package / octave_get_system_state / omc_load_msl` | `fish-c-omc.mjs main` §0c |
| eval 探针自检 | `{"a":"true","b":"false"}` —— 能区分真假 | `fish-c-omc.mjs diag` §2-diag |
| catalogue 双线（HTTP 层，非浏览器） | `static.isui.ren/catalogue.json` 200 / 11245 B；`static.mango-mesa.ccwu.cc/catalogue.json` 200 / 11425 B；各 18 条 | `curl -sS -o /dev/null -w "%{http_code} %{size_download}" <url>` |

**探针缺陷自曝并修正**（写在明处，避免「测不到 = 不存在」）：脚本第一版把 `listTools()` 当同步函数，拿到 `"[object Promise]"` ⇒ 0c 误报 FAIL。`src/modules/plugins/webmcp/types.ts:40` 明确 `listTools(): Promise<...>`；改为 `await` 后 0c PASS。同理 `omc_eval` 探针在 `diag` 模式用确定值的 stub 自检过，证明「读到的 true/false 是真值」。

## 真 UI 路径（点击面自己有判据）

`fish-c-omc.mjs main` 逐段输出（均在净化 dist、未手动装配 `__omc`）：

1. `.menu-toggle-btn` 点击 ⇒ `{found:true}`。
2. `.menu-item-choice` 中 `OpenModelica wasm32` 项点击 ⇒ `{found:true,text:"OpenModelica wasm32 Modelica physical system modeling & simulation · 74.6MB ~71."}`（**1a PASS：先证"点到了"**）。
3. 下载按钮 `.btn-dl-action.download` 存在（`hasDownload:true`）⇒ 点击；下载态轮询 90s 仍 `⬇ Download`，**未出现 `.dl-status.downloaded`**（**1b FAIL**）。
4. `Start Computing` 按钮点击 ⇒ `{found:true}`（**1c PASS**）。
5. BootModal 打开；`h3` 文案 `Boot GNU Octave Engine`（**标题是 h3，不点它**）；按钮表中真按钮为 `btn btn-primary` 文案 `Start Engine Now`（**1d PASS**）。
6. `.modal-card .modal-footer .btn-primary` 点击 ⇒ `{found:true,text:"Start Engine Now",hadDisabled:false}`（**1e PASS**）。
7. 等 `window.__omc`：轮询 66s，始终 `{"omc":"undefined","omcEval":null,"hosts":1,"octave":"undefined","octaveReady":"undefined"}` ⇒ **2a/2b FAIL**；就绪耗时 `未就绪`。`__octaveHosts.length=1`、`__octaveReady=undefined (typeof)`（按职责 3 如实记录）。

> 同类肯定用例（`positive` 模式）证明这套点击序列**能测到"存在"**：把被净化的站内 `OpenModelicaCompiler_bg.wasm`（生产仓真实 74,579,404 B）经 `route.fulfill` 回放（净化 dist 磁盘只读、产品代码零改动）+ abort 全部 release 域名后，下载 UI 在 t+4s 变成 `✓ Downloaded`（**1b PASS**）。但 `__omc` 仍 `undefined` —— 见「根因」段的第二层：OMC 是**附加 flavor**，只有 Octave 主引擎先 boot 成功才会走到 `setupOmcBridge`（`src/modules/engine/WasmEmbedAdapter.ts:131`），而净化 dist 同时移走了主引擎 `lanes/*/octave.wasm|octave.data`，主引擎 boot 失败（pageerror：`404 .../lanes/wasm32-final/octave.data`）。所以这份 positive 只证明「下载探针 + 点击面」有效，不证明整套 boot 探针能在净化盘上看到 `__omc`；**该缺口如实列为未验边界**。

## 判据逐项（真跑，不是手写复刻）

`main` 模式 `=== MODE=main: 7 PASS / 7 FAIL ===`（C-raw.log:191 / 300；两轮 main 复跑结果一致）。

| # | 判据 | 结果 | 实测 / 复跑 |
|---|---|---|---|
| 3a | `String(await __omc.omc_eval('loadModel(Modelica)')).trim() === 'true'` | **FAIL（SKIPPED）** | `__omc` 未就绪 ⇒ 不手写复刻、不手动装配，如实记 FAIL。C-raw.log:107 |
| 3b | `loadModel(NoSuchPackageXYZ) === 'false'`（反向正确失败） | **FAIL（SKIPPED）** | 同上，C-raw.log:108 |
| 3c | `getVersion()` 有返回值 | **FAIL（SKIPPED）** | 同上，C-raw.log:109 |
| 4 | `window.modelContext.callTool('omc_load_msl', {})` | **FAIL** | 完整返回体见下，C-raw.log:112–122 |

`omc_load_msl` **完整返回体**（真 callTool，未手写复刻）：

```json
{
 "isError": true,
 "ms": 1,
 "text": "CAPABILITY_UNAVAILABLE: the OpenModelica runtime (window.__omc) is not loaded — load the omc engine first.",
 "data": null,
 "keys": ["isError", "content"]
}
```

工具在 `src/modules/plugins/webmcp/tools/omcLoadMsl.ts:59-71` 的**运行期能力门**就短路了（先查 `window.__omc`），**根本没走到 fetch**。因此本票**没有**拿到「工具从 release 成功装 MSL / 报 404」这两种结果之一 —— 这不是产品判据通过或失败，而是**前置未满足导致未验到**。

补充 HTTP 层探针（`fish-c-msl-probe.mjs`，不冒充工具自身调用）：工具若继续走，会 fetch 货架条目给的站内 URL ——

```
entry: modelica-standard-library / 4.1.0+maint.om /
       url=assets/msl/msl-4.1.0-maint.om.zip / size=19482938 /
       sha256=a97d8d94ca7f7960f7f1c209613a35d65bcfa2426660e5052617e71326308535
resolvedUrl: /repo/Octave/assets/msl/msl-4.1.0-maint.om.zip
status: 404 (460 B)
```

⇒ 即使 `__omc` 就绪，工具按当前货架 `url` 也只会拿到 **404**（站内 zip 已被净化移走），**没有**改从 catalogue 的 MSL release（`OpenModelica-Full-Wasm/msl-4.1.0-maint.om`，19,482,938 B）取。这条如实记为 **FAIL / 未验到（取决于从哪一层看）**，不猜、不修。

## 命中 `static.isui.ren` / `github.com` / 站内 `omc/` 的请求（main 模式，C-raw.log:124–144）

| 状态 | URL | 说明 |
|---|---|---|
| 200 | `https://static.isui.ren/catalogue.json` | catalogue 双线 EO 主线，浏览器里成功 |
| -1 `net::ERR_FAILED` | `https://static.isui.ren/ArchivalEra/LLVM-wasm/releases/download/v0.1.6/manifest.json` | 18 条 manifest 全表扫描 |
| -1 `net::ERR_FAILED` | `https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/manifest.json` | 同上 |
| -1 `net::ERR_FAILED` | `https://static.isui.ren/ArchivalEra/OpenModelica-Full-Wasm/releases/download/v0.2.0-wasm32/manifest.json` | **OMC 引擎 release manifest** |
| -1 `net::ERR_FAILED` | `https://static.isui.ren/ArchivalEra/OpenModelica-Full-Wasm/releases/download/msl-4.1.0-maint.om/manifest.json` | **MSL release manifest** |
| -1 `net::ERR_FAILED` ×13 | `https://static.isui.ren/ArchivalEra/Octave-Extra-Content/releases/download/forge-*/manifest.json`、`supply-pyodide-314.0.7/manifest.json` | 13 forge + pyodide |
| 404 | `http://localhost:8905/repo/Octave/omc/OpenModelicaCompiler_bg.wasm` | 站内被净化字节，兜底路径确实 404 |
| （无 github.com 请求） | — | `base_proxy` 在 catalogue 里**在场**，但消费侧 `firstLiveEntryAcrossCatalogue` 只循环 `release.base`，不换 `base_proxy`（`src/modules/storage/catalogueReleaseSource.ts:186-197`）；浏览器未发出任何 github.com 请求 |

`mirror` 模式（把 catalogue 里 18 处 `base` host 改成有 CORS 的 CF 镜像）：浏览器侧对这些 manifest 全部 `net::ERR_CONNECTION_RESET`（C-raw.log 段内），`1b` 依旧 FAIL。Chromium 用 `--no-proxy-server` 直连，而 curl 走系统 `HTTPS_PROXY=http://127.0.0.1:2080`；同一浏览器直连 `https://static.isui.ren/catalogue.json` 与 `https://static.mango-mesa.ccwu.cc/catalogue.json` 均 200，但 CF 镜像的 `/ArchivalEra/*/manifest.json` 在浏览器里 `ERR_CONNECTION_RESET` ⇒ **这是本环境的出口限制，不是产品判据**，按硬约束记为「环境限制」不计产品 FAIL。

## 反向断言（reverse 模式，C-raw.log:751–880）

`playwright route.abort()` 掉 `static.isui.ren` / `static.mango-mesa.ccwu.cc` / `github.com` 全部 release 域名：

```
[reverse][abort] https://static.isui.ren/catalogue.json
[reverse][abort] https://static.mango-mesa.ccwu.cc/catalogue.json
PASS | 7a ★反向：abort release 域名后 __omc 判据变红（不存在/不可用）
        :: omcPresent=false, lastState={"omc":"undefined",...}
PASS | 7b ★反向：三条判据不再全绿 :: {"skipped":true}
=== MODE=reverse: 9 PASS / 7 FAIL ===
```

⇒ 「把 release 供给拿掉 ⇒ `__omc` 判据变红」成立。但**必须诚实**：main 模式本来就没绿，所以这条反向证据**不能单独证明「是 release 供给让 main 变红」**；它证明的是「探针能演示能力缺席态」，与主模式的根因证据（CORS + 主引擎缺字节）合起来才完整。

## 根因（主会话独立复核，本代理 curl 复验一致）

**7 FAIL 不是「OMC 能力不存在」，也不是 UI 代码 bug、不是探针坏。** 同类肯定用例（页面 200 / modelContext 在 / listTools 七个 / eval 探针能区分真假 / positive 模式下载态能变 `✓ Downloaded`）全部 PASS。

`static.isui.ren` **同一域上的路径级 CORS 配置差异**（`curl -sSI -H "Origin: http://localhost:8905"`，复跑命令见上）：

| 路径 | HTTP | `access-control-allow-origin` |
|---|---|---|
| `/catalogue.json` | 200 / 11245 B | `*` ⇒ 浏览器能取（所以 main 里 catalogue 200） |
| `/ArchivalEra/OpenModelica-Full-Wasm/releases/download/v0.2.0-wasm32/manifest.json` | 200 / 12946 B | **无任何 ACAO**（Azure Blob 源，`server: Windows-Azure-Blob/1.0`） |
| `/ArchivalEra/OpenModelica-Full-Wasm/releases/download/msl-4.1.0-maint.om/manifest.json` | 200 / 1400 B | **无任何 ACAO** |
| `base_proxy`（GitHub 原始，302 → `release-assets.githubusercontent.com`） | 最终 200 / 12946 B | **同样无 ACAO**（302 与 200 两跳都没有） |
| CF 镜像 `/catalogue.json` 及 `/ArchivalEra/*/manifest.json`（curl 层） | 200 | `*`（Cloudflare 全路径都有） |

⇒ **两条线在浏览器里都取不到 manifest**，不是单线故障。定性：**站侧 `/ArchivalEra/*` 路径没继承 catalogue 的 CORS 规则**（EO 主线 Azure Blob 源缺头；GitHub `base_proxy` 最终资产域名也缺头）。浏览器控制台原文（C-raw.log §6）：

```
Access to fetch at 'https://static.isui.ren/ArchivalEra/OpenModelica-Full-Wasm/releases/download/v0.2.0-wasm32/manifest.json'
from origin 'http://localhost:8905' has been blocked by CORS policy:
No 'Access-Control-Allow-Origin' header is present on the requested resource.
[warning] [downloads] engine release unavailable for lane "omc": no live release carried product "omc" (... :network, ...)
```

连带第二层（本代理补充）：**OMC 是附加 flavor**（`WasmEmbedAdapter.ts:131` 只在 Octave 主引擎 `OctaveEmbed.create()` 成功后才 `setupOmcBridge`）；净化 dist 同时移走了 `lanes/*/octave.wasm|octave.data`（`removed-files.txt` 多条目），主引擎 boot 先失败（pageerror `404 .../lanes/wasm32-final/octave.data`；`[instantiate] 失败: CompileError: expected magic word 00 61 73 6d, found 3c 21 44 4f` = 把 404 HTML 当 wasm 编译）。所以**即使 manifest CORS 修好，票 C 也要在票 B 的三档 Octave 产物能从 release 真 boot 之后才能复跑**。

**定性：BLOCKER（站侧配置，非产品代码）**。修复方式：站侧给 `/ArchivalEra/*` 路径补 `access-control-allow-origin: *`，并确认 GitHub `base_proxy` 最终 `release-assets.githubusercontent.com` 资产的 CORS；修复后**重跑票 C 与票 B**。按硬约束本代理不改产品代码、不改净化副本、不偷偷装配 `__omc`。

## 未验边界 / 诚实清单

1. **三条 `omc_eval` 判据未真跑**（`__omc` 未就绪；不手写复刻、不手动装配）—— 记为 SKIPPED/FAIL，不是「OMC 不存在」。
2. **`omc_load_msl` 未走到 fetch**：工具在 `window.__omc` 能力门短路；「从 release 成功装 MSL」与「工具报 404」两种结果**都没拿到**。补充探针只证明「工具的站内 fetch 目标 = 404」，不冒充工具调用。
3. **MSL release 是否会被工具改用**：本轮**未验到**。已确认货架条目 `url` 仍是站内 `assets/msl/msl-4.1.0-maint.om.zip`（404），未发现工具内把它改写成 catalogue MSL release 的路径（`omcLoadMsl.ts:87-90` 直接 `fetch(base+url)`）。这是「完全不托管 release」要验的那条缝，需 CORS 修好后重跑才能判。
4. **`base_proxy` 浏览器侧未被消费**：catalogue 里 18 条都带 `base_proxy`，但本次浏览器零 github.com 请求；`firstLiveEntryAcrossCatalogue` 只循环 `release.base`。这条属票 A/G 的失败可见性面，本票只记录事实。
5. **CF 镜像浏览器直连 `ERR_CONNECTION_RESET`**：本环境 Chromium `--no-proxy-server` 直连出口限制（curl 走 127.0.0.1:2080 代理则 200）；不计产品 FAIL。
6. **正面 boot 探针的完整同类肯定用例缺失**：`positive` 模式只回放了 OMC wasm，主引擎三档字节仍在净化盘外；没能演示「净化盘 + release 可达 ⇒ `__omc` 真起来并三条判据全绿」。这条只有站侧 CORS 修好 + 票 B 三档能 boot 之后才能补。
7. **`__octaveReady`**：`typeof` 为 `undefined`（全局未定义该名），`__octaveHosts.length=1`；按职责 3 如实记录，未推断其语义。

## 逐项 PASS/FAIL 汇总（main 模式权威）

| 检查 | 结果 |
|---|---|
| 0a 页面 200 / 0b modelContext / 0c listTools 含 omc_load_msl | PASS（同类肯定用例，探针有效） |
| 1a 勾选 UI 点到了 / 1c Start Computing / 1d BootModal / 1e 真按钮 Start Engine Now | PASS（点击面自证） |
| 1b OMC 下载显示 downloaded | **FAIL**（90s 仍 `⬇ Download`） |
| 2a `window.__omc` 在 / 2b `omc_eval` 是 function | **FAIL**（`undefined` / `null`，就绪耗时：未就绪） |
| 3a/3b/3c 三条 `omc_eval` 判据 | **FAIL（SKIPPED）** |
| 4a `omc_load_msl` isError=false | **FAIL**（`CAPABILITY_UNAVAILABLE`，未走到 fetch） |
| 6 请求 URL 表 / 7 反向断言 | 见上表 / reverse 模式 PASS |

`grep -E '^=== MODE=' /tmp/fishing-2026-11-05/evidence/C-raw.log`：
`main 7 PASS / 7 FAIL`、`diag 8 PASS / 7 FAIL`、`positive 8 PASS / 6 FAIL`、`mirror 7 PASS / 7 FAIL`、`reverse 9 PASS / 7 FAIL`。
