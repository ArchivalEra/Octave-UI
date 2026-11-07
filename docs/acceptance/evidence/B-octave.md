# 票 B · Octave 三档真 boot（净化 dist 真浏览器验收）

- 日期：2026-11-05
- 子代理：`fish/B`，专属端口 **8904**（中继 8905 仅用于正控/反向，不碰净化 dist）
- 产物：本文件 + `/tmp/fishing-2026-11-05/evidence/B-raw.log` + `B-positive.log` + `B-eval42.log` + `B-reverse2.log` + `B-summary.json`
- 脚本（全部在 harness 目录，那里有 playwright 的 node_modules）：
  `/mnt/hdd/zcode-test/harness/fish-b-octave.mjs`（主探针）、`fish-b-positivecontrol.mjs`、
  `fish-b-eval42.mjs`、`fish-b-reverse2.mjs`、`fish-b-headers.mjs`、`fish-b-corstest.mjs`、
  `/tmp/fishing-2026-11-05/evidence/routeserve.py`（正控中继）。
- 纪律：**未改任何产品代码**；净化 dist 只读；未改 `SHARED.md`；未手动装配 `window.octave` / `__omc`。

## 结论（先给判据）

**票 B 判据 FAIL。** 净化 dist 上三档（默认 `wasm32-final` + 切档 `master` / `IllegalPerformance`）
**零档真 boot 成功**，且**没有一条大字节请求以 200 打到 release 侧**。

- `anyBoot=false`、`anyBigRelease=false`（`B-summary.json` 的 `key`，复跑见下）。
- 主探针自证：`27 PASS / 8 FAIL`（`B-raw.log` 末行）。
- **但「引擎没起来」不是探针坏了**：我做了两次同类肯定用例（见 §4），
  在**只补两个 HTTP 响应头**的同一份净化 dist / 同一真浏览器 / 同一真 UI 路径上，
  `wasm32-final` **真 boot 成功**、`disp(40+2)` 真得到 **42**。
  ⇒ 全红是**真缺陷**，不是内容仓 104 那种「点了空元素」。
- 反向断言（无混淆版，见 §5）：在「本来能成功」的正控环境里把 catalogue 拿掉 ⇒
  boot 判据**从绿变红**，证明「跑起来」确实依赖 catalogue，不是 JS 兜底。

## 根因（实测，不猜）

catalogue 自身可达，但 **release 产物域（Azure Blob）响应缺 CORS/CORP 两个头**，
在页面 `Cross-Origin-Embedder-Policy: require-corp`（`scripts/serve.py` 下发，真站同款）下
被浏览器拦死：

| URL | HTTP | `access-control-allow-origin` | `cross-origin-resource-policy` |
|---|---|---|---|
| `https://static.isui.ren/catalogue.json` | 200 | `*` | `cross-origin` |
| `…/octave-full-wasm-v0.1.0/manifest.json` | 200 | **缺失** | **缺失** |
| `…/wasm32__octave.wasm.zstd.000`（分片） | 200 | **缺失** | **缺失** |

- catalogue 由 `TencentEdgeOne` 发（带头）；manifest/分片由 `Windows-Azure-Blob/1.0` 发（不带头）。
- 页内 `fetch()` 实测（`node fish-b-headers.mjs`）：catalogue `200 / 11245 B`，
  release manifest 与分片均 `TypeError: Failed to fetch`；`window.crossOriginIsolated=true`。
- 服务端 `page.request.get()` 实测（`node fish-b-corstest.mjs`）：manifest `200 / 20782 B`、
  分片 `200 / 1655400 B` ⇒ **字节与 URL 都是好的，是浏览器跨源头拦截**。
- `curl` 带 `Origin` 复跑：见「复跑命令」§2；逐字头差异同上表。
- 兄弟票 C（`C-omc.md`）独立复现同一路径级 CORS 差异，互为印证。

链路后果（`B-raw.log` 三档 console 尾部逐字）：
`loadCatalogue` 拿到 18 条 → `fetchReleaseManifest` 对每条 `base/manifest.json` 全部
`FAILED / net::ERR_FAILED`（CORS）→ `engineReleaseSource.resolveEngine` 返回 null →
`[downloads] engine release unavailable for lane "…": no live release carried product …` →
**回落整包站点路径** → 净化 dist 里 `octave.wasm` / `octave.data` 已移走 ⇒ `404` →
`STORAGE_WRITE_FAILED` → boot 时胶水取到 HTML 404 页当 wasm：
`WebAssembly.instantiate(): expected magic word 00 61 73 6d, found 3c 21 44 4f`（`<!DO`）。

> 这是**供给层缺陷**（release 侧响应头），不是产品 JS 里硬编码备用 URL 的 FAIL。
> 代码里没有发现隐藏的站内/JS 备用大字节 URL；三档大字节请求全部如实打向站点 `lanes/*` 并 404。

## 逐档结果（真 UI 路径，每档独立新 context，无跨档 OPFS 残留）

三档都先证「点到了」再证「结果是 X」：菜单选档（`.menu-item-choice`，`unloaded` 态）→
`.btn-dl-action.download` → `Start Computing` → `.modal-card .modal-footer .btn-primary`
（文案 `Start Engine Now`，**不是** `<h3>` 标题 `Boot GNU Octave Engine`）。

| 档位 | 页面 200 / modelContext / listTools | 选档选中态 | 下载徽标 | 点到 boot 按钮且状态变化 | `window.octave` | `__octaveHosts` | `__octaveReady` | `disp(40+2)` |
|---|---|---|---|---|---|---|---|---|
| `wasm32-final`（默认） | 200 / 在 / 7 工具 | selected=true | **失败**（`STORAGE_WRITE_FAILED`） | 点到 + `loading=true` | `undefined` | `1` (`ready:false`) | 未置 | 未执行 |
| `master`（切档） | 200 / 在 / 7 工具 | selected=true | **失败** | 点到 + `loading=true` | `undefined` | `1` (`ready:false`) | 未置 | 未执行 |
| `IllegalPerformance`（切档） | 200 / 在 / 7 工具 | selected=true | **失败** | 点到 + `loading=true` | `undefined` | `1` (`ready:false`) | 未置 | 未执行 |

每档 boot 终态（逐字，三档同形）：
`"octave":"undefined", "hosts":1, "hostReady":[false], "modalStatus":"Boot failed…",
"error":"Octave 引擎 (<lane>) 启动超时 (30 秒)。请检查网络或控制台。"`

每档下载失败 toast（逐字）：
`STORAGE_WRITE_FAILED … HTTP 404 fetching octave.wasm from /repo/Octave/lanes/<lane>/octave.wasm`
（`master` / `IllegalPerformance` 的路径是 `lanes/<lane>/w64/octave.wasm`）。

### 请求 URL 表（每档点「下载」之后，去重；完整流水见 `B-raw.log`）

| 分类 | status | method | resourceType | URL | 失败原因 |
|---|---|---|---|---|---|
| CATALOGUE/site | 404 | GET | fetch | `http://localhost:8904/static/catalogue.json` | 站点根无此派生件 |
| CATALOGUE/site | 404 | GET | fetch | `http://localhost:8904/catalogue.json` | 同上 |
| CATALOGUE/release | **200** | GET | fetch | `https://static.isui.ren/catalogue.json` | —（11245 B / 18 条） |
| RELEASE | **FAILED** `net::ERR_FAILED` | GET | fetch | `https://static.isui.ren/ArchivalEra/LLVM-wasm/releases/download/v0.1.6/manifest.json` | CORS：无 `Access-Control-Allow-Origin` |
| RELEASE | **FAILED** | GET | fetch | `…/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/manifest.json` | 同上 |
| RELEASE | **FAILED** | GET | fetch | `…/OpenModelica-Full-Wasm/releases/download/v0.2.0-wasm32/manifest.json` | 同上 |
| RELEASE | **FAILED** | GET | fetch | `…/OpenModelica-Full-Wasm/releases/download/msl-4.1.0-maint.om/manifest.json` | 同上 |
| RELEASE | **FAILED** ×13 | GET | fetch | `…/Octave-Extra-Content/releases/download/forge-*/manifest.json`（13 个 forge + pyodide） | 同上 |
| SITE | 200 | GET | fetch | `…/repo/Octave/lanes/<lane>/octave.build.json` | 小 JSON 未移走（SHARED.md 已说明） |
| SITE | 200 | GET | fetch | `…/repo/Octave/lanes/<lane>/octave.js` | 胶水 JS 未移走 |
| SITE | **404** | GET | fetch | `…/repo/Octave/lanes/<lane>/octave.wasm` | **release 字节已移走** |
| SITE | **404** | GET | fetch | `…/repo/Octave/lanes/<lane>/octave.data` | **release 字节已移走** |

- 主探针全量：`171` 条请求 / 去重 `56` 条；分类 `OTHER:19 SITE:12 CATALOGUE/release:7 RELEASE:18`。
- **release 侧 200 的只有 `catalogue.json` 一条；分片（`.zstd.*` / `.gzip.*` / `.wasm` / `.data`）
  零条 200** —— 因为卡在 manifest 阶段，分片请求根本没发出。
- 站内路径命中 `lanes/` 的全是 404 的小清单/胶水之外的大字节；**无任何 200 的站内大字节**
  ⇒ 不存在「本地字节兜底冒充 catalogue」，但也不存在「catalogue 真供给」。
- 目标 `static.mango-mesa.ccwu.cc`（CF 备线）在 Chromium 直连下 `ECONNRESET`（`netcheck.mjs`），
  EO 主线 `static.isui.ren` 200；`base_proxy`（github.com）在 `resolveEngine` 里未被使用
  （`releaseCatalogue.ts` 注释亦记「当前线上只给 base」）。

## 同类肯定用例（内容仓 104 / AGENTS.md 纪律 3：先证探针能测到「存在」）

`fish-b-positivecontrol.mjs`：净化 dist 不变、真浏览器不变、真 UI 路径不变、
真 catalogue 快照（`cat-eo.json`，11245 B / 18 条）与真 release 字节不变；
唯一改动 = playwright `page.route()` 把 release URL 重定向到本地中继 `routeserve.py`，
中继从真实 `static.isui.ren` 取字节并**只补** `access-control-allow-origin: *` 与
`cross-origin-resource-policy: cross-origin` 两个头（字节不进净化 dist，磁盘未写产品）。

实测（`B-positive.log`）：
- 下载：t+8s `✓ Downloaded` 徽标，`header.engine_download_success` toast。
- boot：t+2.5s `{"octave":"object","hosts":1,"hostReady":[true],"ready":true}` ⇒ **BOOT_OK=true**。
- release 侧 11 条请求 **全部 200 / 0 FAILED**，其中大字节分片 9 条，真 URL 例如
  `https://static.isui.ren/ArchivalEra/LLVM-wasm/releases/download/v0.1.6/wasm32__octave.wasm.zstd.000`
  （catalogue 的 `orderByAuthority` 把 LLVM 排在前，分片名同形 ⇒ 中继按 basename 回放真字节）。
- relay 命中 15 次（`routeserve.log`）：`catalogue.json 11245`、`manifest.json 20782`、
  `wasm32__octave.wasm.zstd.000…005`、`octave.js.gzip.000`、`octave.data.zstd.000…001`。
- **`POSITIVE_CONTROL: PASS`** —— 探针能测到成功；三档全红的根因被钉死为那两个响应头。

`disp(40+2)` 的 42（`B-eval42.log`，正控环境，三通道）：
- `window.modelContext.callTool('octave_eval',{code:'disp(40+2)'})` → `{"isError":false}`，
  text 为 `(execution completed with no output)`（已知输出捕获形状，`probe-octave-output-shape.mjs` 同款）；
- `window.octave.eval('disp(40+2)')` → `{"ok":true,"rc":0}`；
- **`window.octave.evalJSON('40+2')` → `{"ok":true,"value":42,"rc":0}`**（数值硬证据）；
- console 输出逐字 `[log] 42`（两次）；
- `window.__octaveReady === true`，`__octaveHosts[0].ready === true`。

## 反向断言（无混淆版，证明依赖 catalogue 而非 JS 兜底）

`fish-b-reverse2.mjs`：在**同一正控环境**（中继补 CORS/CORP 头，本来能 boot 成功）里，
唯一改动 = `page.route('**/catalogue.json', abort)` 把 4 个 catalogue 候选全部 abort。

实测（`B-reverse2.log`）：
- 同类肯定用例仍在：页面 200 / modelContext 在 / `listTools()` 7 工具（探针没被整体弄坏）。
- `aborts=2`（route 命中），4 条 catalogue 请求全 `FAILED`，逐字：
  `[downloads] engine release unavailable for lane "wasm32-final": catalogue unavailable or empty — falling back to site lanes path`。
- 下载回落站点 ⇒ `HTTP 404 fetching octave.wasm from /repo/Octave/lanes/wasm32-final/octave.wasm`。
- **BOOT_OK=false**：`octave:"undefined"`, `err:"Octave 引擎 (wasm32-final) 启动超时 (30 秒)…"`。
- `=== REVERSE2: PASS ===` ⇒ 把 catalogue 拿掉，本来能成功的 boot 变红，
  证明「跑起来」确实依赖 catalogue，不是 JS 兜底、也不是恒真判据。

（主探针 `fish-b-octave.mjs` 里也做了一次 `route.abort()` 的反证：`routeHits=4 / aborted=4`、
`catalogue unavailable or empty`、boot red；但因基线本就红，故另做上面的无混淆版作为决定性反证。）

## 复跑命令（逐字）

```bash
# 0) 预览服（绑 [::1]，用 localhost；端口 8904）
cd /tmp/fishing-2026-11-05/wt-B
python3 scripts/serve.py --dir /tmp/fishing-2026-11-05/dist-clean --port 8904 > /tmp/fishing-2026-11-05/evidence/B-serve.log 2>&1 &
curl -s -o /dev/null -w "index: %{http_code}\n" http://localhost:8904/repo/Octave/
curl -s -o /dev/null -w "wasm(removed): %{http_code}\n" http://localhost:8904/repo/Octave/lanes/wasm32-final/octave.wasm

# 1) 主探针：三档 + 全量请求拦截 + 一次 route.abort 反证（约 3 分钟）
cd /mnt/hdd/zcode-test/harness
node fish-b-octave.mjs 2>&1 | tee /tmp/fishing-2026-11-05/evidence/B-raw.log

# 2) 根因：路径级 CORS 差异 + 页内 fetch + 服务端 fetch 对照
node fish-b-headers.mjs
node fish-b-corstest.mjs
for u in "https://static.isui.ren/catalogue.json" \
         "https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/manifest.json" ; do
  echo "-- $u"
  curl -sS --max-time 25 --noproxy '*' -H "Origin: http://localhost:8904" -D - -o /dev/null "$u" \
    | grep -iE '^HTTP/2 |access-control-allow-origin|cross-origin-resource-policy|server:'
done

# 3) 正控中继（另开终端常驻；从真 release 取字节 + 只补两个头，写 /tmp 缓存）
python3 /tmp/fishing-2026-11-05/evidence/routeserve.py

# 4) 同类肯定用例（boot 成功 + 42）+ 决定性反向断言 + eval42 三通道
cd /mnt/hdd/zcode-test/harness
node fish-b-positivecontrol.mjs 2>&1 | tee /tmp/fishing-2026-11-05/evidence/B-positive.log
node fish-b-eval42.mjs       2>&1 | tee /tmp/fishing-2026-11-05/evidence/B-eval42.log
node fish-b-reverse2.mjs     2>&1 | tee /tmp/fishing-2026-11-05/evidence/B-reverse2.log
```

## PASS / FAIL 汇总

| 判据 | 结果 | 证据 |
|---|---|---|
| 页面 200 / modelContext 在 / listTools 7 工具（三档各一次） | **PASS** | `B-raw.log` 每档「肯定用例」行 |
| 真 UI 点击面自证（选档 / 下载 / Start Computing / Start Engine Now / booting 态） | **PASS** | `B-raw.log` 每档 PASS 行 |
| 切档在 `unloaded` 态生效（默认 + 两次切档，三成员全枚举） | **PASS** | `B-raw.log` `选档 selected=true` |
| **三档至少一档在净化 dist 上真 boot 成功** | **FAIL** | `anyBoot=false`，三档 `octave:undefined / ready 未置` |
| **大字节请求打到 release 侧且 200** | **FAIL** | `anyBigRelease=false`；release 200 仅 catalogue.json 一条 |
| 同类肯定用例：探针能测到「成功」（boot + 42） | **PASS** | `B-positive.log` `BOOT_OK=true`；`B-eval42.log` `value:42` |
| 反向断言：拿掉 catalogue ⇒ boot 判据变红 | **PASS** | `B-reverse2.log` `=== REVERSE2: PASS ===` |
| 主探针自证输出 | **27 PASS / 8 FAIL** | `B-raw.log` 末行 |

**票 B 总判：FAIL**（关键判据两条都红）。根因明确、可证伪、可由正控复现：
release 产物域响应缺 `Access-Control-Allow-Origin` / `Cross-Origin-Resource-Policy`，
在 `require-corp` 页面下 manifest/分片全被 CORS 拦死 ⇒ 回落已被净化的站点路径 ⇒ 404 ⇒ boot 超时。
这是需要修票阶段处理的**真缺陷**（供给层 / 分发配置面），不是探针问题。

## 诚实边界 / 未验项

- 未验「修好 CORS 头之后 master / IllegalPerformance 两档是否也能 boot」：正控只跑了
  默认 `wasm32-final` 一档（受时间与分片拉取成本约束）。三档基线全红结论不受影响，
  但「补头后三档全绿」未被证明。
- `static.mango-mesa.ccwu.cc`（CF 备线）在本机 Chromium 直连下 `ECONNRESET`，
  未验备线自身是否带 CORS 头；`base_proxy`（github.com）在 `resolveEngine` 路径未被消费。
- 正控中继按 **basename** 回放真字节（`routeserve.py`），因此分片 URL 显示的目录
  （`LLVM-wasm/v0.1.6/`）来自 catalogue 的 `orderByAuthority` 排序，字节来自
  `Octave-Full-Wasm` 同形分片；本票用它证明「补头即可跑通」，不作为逐块 sha 对账证据。
- 低端设备（2GB 内存手机）性能未测（spec 已列为未验边界）。
