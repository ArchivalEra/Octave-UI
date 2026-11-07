# 票 E · 插件 + WebMCP 七工具 + 三条 callTool 主路径（净化 dist 真浏览器取证）

- 采集时刻：2026-11-05（无人值守批次）
- 子代理：`fish/E`，worktree `/tmp/fishing-2026-11-05/wt-E`，专属端口 **8906**
- 净化 dist：`/tmp/fishing-2026-11-05/dist-clean`（只读；394 个文件，767 个 release 类字节已物理移走，见 `removed-files.txt`）
- 真浏览器：`/usr/bin/chromium` + `/mnt/hdd/zcode-test/harness/node_modules/playwright` 1.64.1 + node `/usr/bin/node` 26.12.1
- 原始输出：`/tmp/fishing-2026-11-05/evidence/E-raw.log`（本文件所有「原始」块均逐字摘自该 log）
- harness：`/mnt/hdd/zcode-test/harness/fish-e-plugins.mjs`
- 总判定：**28 PASS / 0 FAIL**（另 1 项「未验」如实列出，不计 PASS/FAIL）

## 复跑命令（一次到位）

```bash
# 1) 起预览服（绑 [::1]，用 localhost 不用 127.0.0.1；--dir 必须是净化副本）
cd /tmp/fishing-2026-11-05/wt-E
python3 scripts/serve.py --dir /tmp/fishing-2026-11-05/dist-clean --port 8906

# 2) 另一个 shell：真浏览器取证（脚本必须放 harness 目录下跑，那里才有 node_modules）
cd /mnt/hdd/zcode-test/harness
node fish-e-plugins.mjs http://localhost:8906/repo/Octave/ \
  2>&1 | tee /tmp/fishing-2026-11-05/evidence/E-raw.log
# 退出码 0；末行固定机器行：=== 28 PASS / 0 FAIL ===
```

单项复跑（把对应 `page.evaluate` 抽出即可；下列每条判据的原始返回值都在 `E-raw.log` 里，
用 `grep -n "<判据号>" E-raw.log` 定位）。全部数字来自 `page.evaluate` 的返回值，
不是从源码读出来的常量。

---

## 0 · 页面加载 + 同类肯定用例 + 零 pageerror

**PASS 0.1** 页面 `load` + `window.modelContext` 就绪（复跑：`node fish-e-plugins.mjs ...`，
脚本 L115 `page.goto` + `waitForFunction`）。

**PASS 0.2 同类肯定用例**（判「某东西不存在」前，先证明探针能看到「存在」；SHARED.md 铁律）。
原始（`E-raw.log`「同类肯定用例」行）：

```
{"title":"GNU Octave 11.3.0 WebAssembly UI","base":"/repo/Octave/","islands":1,
 "OctaveP5":"object","OctaveEmbed":"object","OctaveAssets":"object","statusChip":"Not Ready"}
```

即：标题、`<astro-island>` 1 个、经典 `bridge/*.js` 产物 `OctaveP5`/`OctaveEmbed`/`OctaveAssets`
都能被测到 ⇒ 探针有「看见存在」的能力。这些数字（1 / object / Not Ready）实测于上述命令。

**PASS 0.3 零 pageerror**：`pageErrors` 原始 `[]`，console 条数 `0`（原始 `[]`）。
复跑同上命令，脚本 `page.on('pageerror')` / `page.on('console')` 收集。

---

## 1 · modelContext 三处直柄（global-handle 通道）

**PASS 1.1** 原始（`E-raw.log`「直柄原始」行）：

```
{"win":"object","doc":"object","nav":"object","isObject":true,
 "keys":["id","name","version","description","enabled","options","_resolve","_server",
         "_channels","_debugHandle","_debugWin"]}
```

`window` / `document` / `navigator` 三处 `modelContext` 均为对象（实测于主复跑命令的
`page.evaluate(() => ({win: typeof window.modelContext, ...}))`）。这是插件
`WebMcpPlugin.init()` 里 `createGlobalHandleChannel` 挂载的真产物面，非读源码推断。

---

## 2 · `listTools()` 七条（数组判据 + 逐条 name + description 前 40 字）

**PASS 2.1 / 2.2 / 2.3** 原始（`E-raw.log`「listTools 判据原始」块）：

```
{"pass":true,"reason":"ok","array":true,"count":7,
 "names":["octave_eval","octave_run_cell","octave_get_workspace","octave_list_packages",
          "octave_install_package","octave_get_system_state","omc_load_msl"],
 "tools":[ ... 7 条 ... ]}
```

- `array: true` ⇒ 返回的是**数组**，不是 `{tools:[]}`（复跑：主命令 L「listTools 判据」）。
- `count: 7` ⇒ 恰好 7 个（实测于同上 `page.evaluate` 的 `r.length`）。
- 七个名字与 spec 期望**逐字一致**（同上 `names` 数组）。

逐条 `name` + `description` 前 40 字（原始 `E-raw.log`「逐条 name」块，实测）：

| # | name | description 前 40 字 |
|---|------|----------------------|
| 1 | `octave_eval` | `Evaluate GNU Octave code directly in Web` |
| 2 | `octave_run_cell` | `Execute a specific notebook cell by cell` |
| 3 | `octave_get_workspace` | `Retrieve all current variables in the GN` |
| 4 | `octave_list_packages` | `Query available, compatible, and install` |
| 5 | `octave_install_package` | `Pre-plan or execute installation of an O` |
| 6 | `octave_get_system_state` | `Get engine supervisor state, active comp` |
| 7 | `omc_load_msl` | `Load the Modelica Standard Library into ` |

> 与 SHARED.md「已实测 7 个工具名」一致；本票在**净化 dist** 上独立复现，不是引用。

---

## 3 · WebMCP 调试句柄 + `webmcp:ready` 握手 + callStats

**PASS 3.1 / 3.2** 原始（`E-raw.log`「调试句柄/握手原始」行）：

```
{"handle":"object","keys":["stats","setEnabled"],"statsIsFn":true,
 "statsBefore":[],"ready":[{"pluginId":"webmcp","toolCount":7}]}
```

- `window.__webmcp_debug.stats()` 可读，句柄键 `stats` / `setEnabled`（实测）。
- `webmcp:ready` 握手由 `page.addInitScript` 在任何页面脚本之前挂监听抓到：
  `pluginId:"webmcp"`, `toolCount:7`（实测；1 条握手事件）。

---

## 4 · 三条 `callTool` 主路径（真返回体，不许只看「没抛错」）

三条都在主复跑命令里逐个 `await window.modelContext.callTool(name, args)`，判据要求
`!thrown && isError!==true && content[0].type==="resource" && mimeType==="application/json"`
（真返回体，不是「没抛错」）。三条均 **PASS**（`E-raw.log` 中 3 条 `PASS | 4.x ...`）。

### 4.1 `octave_list_packages` `{}` → 包数量 **17**（非 0）

原始返回体截取（`E-raw.log`「octave_list_packages 完整返回体截取」）：

```
{"content":[{"type":"resource","mimeType":"application/json","data":
 {"total":17,"packages":[
  {"name":"cgi","version":"0.1.2","description":"Common Gateway Interface for Octave.",
   "form":"pkg","size":9960,"status":{...},"deps":[]},
  {"name":"datatypes","version":"1.4.2",...}, ... ]}}]}
```

**PASS 4.1** 原始（`E-raw.log`「data.total 原始」行）：

```
octave_list_packages data.total 原始: 17 packages.length: 17
{"total":17,"arrLen":17,"first3":["cgi","datatypes","geometry"]}
```

即 `total=17` 且 `packages.length=17`（实测于主命令 `page.evaluate`；
`isError` 为 `undefined`，不是 `true`）。净化 dist 里 `assets/forge/` 目录确实为空
（`ls` 实测 0 文件），但**目录 JSON**（`assets/forge-catalog.json`，42188 B，17 条）被保留——
JSON 不是 release 类字节，故列表非空是合规的，不是站内 `.tar.gz` 兜底。

> 复跑：`node fish-e-plugins.mjs ...`；单项见脚本 §4 的第一个 `[name,args]`。

### 4.2 `octave_get_system_state` `{}` → 七个关键字段

原始完整返回体（`E-raw.log`）：

```
{"content":[{"type":"resource","mimeType":"application/json","data":{
 "supervisorState":"unloaded","activeLane":"wasm32-final","activeMode":"notebook",
 "activeFile":"untitled.m","filesCount":0,"variablesCount":0,"notebookCellsCount":1}}]}
```

**PASS 4.2** 七键齐备：`supervisorState` / `activeLane` / `activeMode` / `activeFile` /
`filesCount` / `variablesCount` / `notebookCellsCount`（实测值如上，逐字来自返回体）。
`supervisorState:"unloaded"` 是本页**未 boot 引擎**的实测证据（见 §5）。

### 4.3 `octave_get_workspace` `{}` → 返回体

原始完整返回体（`E-raw.log`）：

```
{"content":[{"type":"resource","mimeType":"application/json","data":
 {"count":0,"variables":[]}}]}
```

**PASS 4.3** `count=0`、`variables=[]`（实测）。结构正确；引擎未 boot 故工作区为空，
这是如实记录，不是「没测到」。

### 4b · callStats 计数器（真调用后 increment 的肯定用例）

**PASS 4b.1** 原始（`E-raw.log`「stats() 原始」行）：

```
[{"name":"octave_list_packages","ok":true,"ms":4,"ts":...},
 {"name":"octave_get_system_state","ok":true,"ms":0,"ts":...},
 {"name":"octave_get_workspace","ok":true,"ms":1,"ts":...}]
```

三次 `callTool` 都进了 `__webmcp_debug.stats()`（实测 3 条，`ok:true`）——
证明调试句柄不是空壳，也证明三条调用真经 `WebMcpPlugin.callTool` 分发机走了一遭。

---

## 5 · `octave_eval` 主路径 — **未验（引擎票 8904/8905 负责），不假造**

原始（`E-raw.log`「引擎 boot 态原始」行）：

```
{"statusChip":"Not Ready","supervisorState":"unloaded",
 "octave":"undefined","omc":"undefined","octaveHosts":0}
```

本页引擎**没有 boot**（`window.octave`/`window.__omc` 均 `undefined`，`supervisorState`
`unloaded`，UI 状态 `Not Ready`）。按票 E 指令「没 boot 就如实写未验，不要假造」：

- **`octave_eval {code:'disp(40+2)'}` 成功路径：未验**（引擎票负责）。
- 补充记录（**不作验收**）：未 boot 时真实调用返回
  `{"isError":true,"content":[{"type":"text","text":"Execution failed for tool \"octave_eval\": EngineSupervisor: Engine is not booted or adapter is missing."}]}`
  ——这证明**调用路径可达且会如实报错**，但它不是「eval 得到 42」的证据，不计 PASS/FAIL。
- 同类肯定用例已在 §0.2 / §4 给出（探针能测到返回体、能测到 `isError:true`），
  所以「未验」是范围边界，不是探针缺陷。

---

## 6 · 五个插件真注册（浏览器可观测面，不靠读源码）

> 纪律：以下每一条都是**真浏览器里量到**的（DOM 计数、`Object.getOwnPropertyDescriptor`、
> 事件往返、`typeof`、`callTool` 返回体），不是 grep 源码。

| 插件 | 判据 | 浏览器实测原始 | 判定 |
|------|------|----------------|------|
| **webMcp** | `modelContext` 三直柄 + `__webmcp_debug.stats()` + `webmcp:ready` 握手 + 三条 `callTool` | `{"mc":"object","dbg":"object","ready":1,"calls":3}` | **PASS 6.1** |
| **packageManager** | 真点「📦 Packages」菜单 → 模态里目录卡片非空 | `{"modal":true,"cards":17,"names":["cgi","datatypes","geometry","llvm-wasm","matgeom","miscellaneous"],"spinner":false,"error":null}` | **PASS 6.2** |
| **p5FigureOverlay** | `OctaveP5.show.__overlay_hooked` + `OctaveP5` 描述符 getter/setter 劫持 | `{"OctaveP5":"object","showType":"function","hooked":true,"desc":{"get":"function","set":"function","value":"undefined","configurable":true}}` | **PASS 6.3a** |
| **p5FigureOverlay（总线）** | 图形事件总线 `octave:figure-rendered` 收发往返 | `[{"url":"blob:e-probe","bytes":7,"count":1,"path":"/tmp/e.png","type":"image/png"}]` | **PASS 6.3b** |
| **pretext** | 真点「💡 Examples」→ `code-line`/`line-number` 算术排版 + masonry 列 + 徽章 | `{"overlay":true,"badge":"Pretext & Search Plugin","countBadge":"12 recipes","recipeCards":12,"codeLines":75,"lineNumbers":75,"masonryCols":3,"searchInput":true}` | **PASS 6.4** |
| **search** | 键入无匹配词 → 计数归零 + 空状态出现 | `{"before":"12 recipes","after":"0 recipes","emptyState":1}` | **PASS 6.5** |

数字（17 卡片 / 12 recipes / 75 行 / 3 列 / 12→0）全部实测于主复跑命令的 DOM 计数与
文本读取，写在各自 `E-raw.log` 原始块旁。

- **6.3b 是同类肯定用例**：先派合成 `CustomEvent('octave:figure-rendered')`，监听收到同一
  `detail`（`url`/`path`/`bytes`/`count` 逐字回传）⇒ 证明探针能看到「总线存在」，
  再据此说 6.3a 的钩子在场不是恒真。
- **6.5 同样有对照**：改动前 `12 recipes`，改动后 `0 recipes` + 1 个空状态 ⇒ 判据会随
  能力变化而变，不是恒真。

---

## 7 · 网络请求清单（release 侧 vs 站内路径）

**PASS 7.0 分类器自证**（探针非恒真）：原始
`{"release":"RELEASE","releaseGh":"RELEASE","site":"站内"}` —— 合成
`https://static.isui.ren/catalogue.json` 与 `github.com/.../a.tar.gz` 判 `RELEASE`，
`http://localhost:8906/repo/Octave/` 判 `站内`。这排除了「0 release 命中」是分类器
恒返回「站内」的探针缺陷。

> 探针缺陷修复记录（诚实边界）：初版脚本把页面地址常量命名为 `URL`，**遮蔽了全局
> `URL` 构造器**，导致 `classify()` 的 `new URL(url)` 抛错、20 条请求全被误判
> 「其他/外部」。已改名为 `PAGE_URL` 并加 7.0 自证后重跑，分类恢复正确。
> 这正是 SHARED.md「测不到 ≠ 不存在 / 探针自己要有判据」的实例：先修探针再出结论。

逐条请求（20 条，**全部 `200`**，原始 `E-raw.log`「逐条请求」块）：

```
200 站内  /repo/Octave/                                  (HTML)
200 站内  /repo/Octave/bridge/assets-loader.js
200 站内  /repo/Octave/bridge/queue.js
200 站内  /repo/Octave/bridge/p5canvas.js
200 站内  /repo/Octave/bridge/webaudio.js
200 站内  /repo/Octave/bridge/webaudiorec.js
200 站内  /repo/Octave/bridge/webfilepick.js
200 站内  /repo/Octave/bridge/webnet.js
200 站内  /repo/Octave/bridge/octave-core.js
200 站内  /repo/Octave/bridge/octave-page.js
200 站内  /repo/Octave/bridge/octave-embed.js
200 站内  /repo/Octave/bridge/lanes.js
200 站内  /repo/Octave/bridge/lane.js
200 站内  /repo/Octave/_astro/index.BSoCsxu1.css
200 站内  /repo/Octave/_astro/index.D4Wc3Vo-.css
200 站内  /repo/Octave/_astro/App.BL-Zkp6f.js
200 站内  /repo/Octave/_astro/client.svelte.r4scnHsL.js
200 站内  /repo/Octave/_astro/render.hnfFKuod.js
200 站内  /repo/Octave/favicon.svg
200 站内  /repo/Octave/assets/forge-catalog.json
```

**实测计数**：`release 侧命中数: 0`，`站内命中数: 20`，`其他/外部: 0`。

- **NOTE 7.1**：本页未 boot 引擎（引擎票 8904/8905 负责），故 catalogue / release 侧
  **0 命中属预期**，不是「供给失败」。目录来自站内 `assets/forge-catalog.json`
  （JSON，非 release 字节，净化 dist 保留）——与 §4.1 的 17 条目录一致。
- **NOTE 7.2**：20 条站内请求全部为 HTML / JS / CSS / SVG / JSON 静态件，
  **无一条 `*.wasm` / `*.data` / `*.tar.gz` / `*.zip` / `*.whl` 回退命中**——
  即本票观测窗口内没有站内 release 字节被当兜底加载。
- **诚实边界**：本票窗口只覆盖「页面加载 + 插件面 + 三条只读 callTool」，
  **不覆盖引擎 boot 后的 release 下载**（那是 A/B/C/D/F 票的职责）。因此「0 release 命中」
  不可外推成「全链路 0 release」；反之也不构成「无站内回退」的 FAIL。

---

## 8 · 反向断言（同一判据在「能力被拿掉」的页面上必须红）

> 主运行页与反向页吃**同一个 `listToolsCriterion(page)` 函数**（脚本 L~60），证明
> 「七工具判据」不是恒真；每次反向都先给同类肯定用例。

### 8.1 页面内临时置空 `modelContext`

- **PASS 8.1** 置空后判据原始：`{"pass":false,"reason":"window.modelContext 缺席或没有 listTools()","mc":"undefined"}` ⇒ **红**。
- **PASS 8.1b** 恢复后判据原始：`{"pass":true,"array":true,"count":7,...}` ⇒ **回绿**。
  这证明「红」是能力被拿掉造成的，不是探针坏了（SHARED.md 回信 156 教训的镜像）。
- 复跑：主命令 §8.1（`window.modelContext = undefined` → 同一判据 → 恢复）。

### 8.2 `page.route` 拦掉插件初始化脚本（App chunk）

拦掉的 URL（实测 1 条）：`["http://localhost:8906/repo/Octave/_astro/App.BL-Zkp6f.js"]`。

反向页的**同类肯定用例 + 消失面**原始（`E-raw.log`）：

```
{"title":"GNU Octave 11.3.0 WebAssembly UI","base":"/repo/Octave/","islands":1,
 "OctaveP5":"object","OctaveEmbed":"object",          ← 肯定用例：仍能看到「存在」
 "modelContext":"undefined","docMc":"undefined","navMc":"undefined",
 "debugHandle":"undefined","p5ShowHooked":false}       ← 被测面：全消失
```

- **PASS 8.2** App chunk 确实被拦掉（1 条）。
- **PASS 8.2a** 同类肯定用例仍能看到「存在」：标题 / `astro-island` 1 个 /
  `OctaveP5` / `OctaveEmbed`（经典 `bridge/*.js` 产物未被拦）⇒ 探针没瞎。
- **PASS 8.2b** 拦掉插件 chunk ⇒ `modelContext` + 三处直柄 + `__webmcp_debug` +
  `p5` 钩子**全消失**，同一判据 `{"pass":false,...}` ⇒ **红**。
- 反向页 `pageerror` 为 `[]`（复跑见主命令 §8.2），排除「因为整页崩了才测不到」。

---

## 逐项 PASS/FAIL 总表

| 编号 | 判据 | 判定 |
|------|------|------|
| 0.1 | 页面 load + modelContext 就绪 | PASS |
| 0.2 | 同类肯定用例（HTML/经典 bridge 产物能测到） | PASS |
| 0.3 | 零 pageerror | PASS |
| 1.1 | modelContext 三处直柄均为对象 | PASS |
| 2.1 | `listTools()` 返回数组（不是 `{tools:[]}`） | PASS |
| 2.2 | 恰好 7 个工具 | PASS |
| 2.3 | 七个工具名逐字一致 | PASS |
| 3.1 | `__webmcp_debug.stats()` 可读 | PASS |
| 3.2 | `webmcp:ready` 握手（pluginId=webmcp, tools=7） | PASS |
| 4.x ×3 | 三条 callTool 均返回 resource(JSON)，isError!=true | PASS ×3 |
| 4.1 | `octave_list_packages {}` 包数量 17（非 0） | PASS |
| 4.2 | `octave_get_system_state` 七键齐备 | PASS |
| 4.3 | `octave_get_workspace` count+variables 结构 | PASS |
| 4b.1 | 三次调用都进 callStats | PASS |
| 5.1 | `octave_eval disp(40+2)` 成功路径 | **未验**（引擎票负责，不假造） |
| 6.1 | webMcp 插件真注册 | PASS |
| 6.2 | packageManager 插件 UI 目录非空 | PASS |
| 6.3a | p5FigureOverlay 钩子 + 描述符劫持 | PASS |
| 6.3b | 图形事件总线可收发（肯定用例） | PASS |
| 6.4 | pretext 插件算术排版 + masonry | PASS |
| 6.5 | search 插件计数归零 + 空状态 | PASS |
| 7.0 | 网络分类器自证（非恒真） | PASS |
| 8.1 | 置空 modelContext ⇒ 判据红 | PASS |
| 8.1b | 恢复 ⇒ 判据回绿 | PASS |
| 8.2 | App chunk 确实被拦掉 | PASS |
| 8.2a | 反向页同类肯定用例仍看到「存在」 | PASS |
| 8.2b | 拦掉插件 ⇒ 面全消失、判据红 | PASS |

**=== 28 PASS / 0 FAIL ===**（与 `E-raw.log` 末行机器行一致）

## 没验到的边界（诚实列出，不补「应该可以」）

1. **`octave_eval` 成功路径**：本页引擎未 boot（实测 `supervisorState:"unloaded"`），
   按票 E 指令未验；成功/失败由引擎票 8904/8905 判定。未 boot 时的真实错误返回已记录，
   但不当作 eval 能力证据。
2. **引擎 boot 后的 release 侧下载**：本票窗口内 release 命中数 0（因为没 boot），
   不能外推成「全链路 0 release」，也不能据此判「无站内回退」FAIL；供给层由 A/D/F 票负责。
3. **`octave_run_cell` / `octave_install_package` / `omc_load_msl` 的 `callTool` 返回体**：
   票 E 只要求三条主路径（`list_packages` / `get_system_state` / `get_workspace`），
   其余四条工具仅验到「`listTools()` 里在册」，未逐条 `callTool`（spec 票 E 范围外）。
4. **`omc_load_msl` / `window.__omc` 运行时**：`typeof window.__omc === "undefined"`（实测），
   OMC 引擎属票 C，不在本票面内。
5. **五个插件的 `pluginRegistry.getAll()` 枚举**：registry 实例未挂到 `window`
   （bundle 里 `window.* =` 赋值面实测只有 `fetch`/`__omc`/`octave`/… 等，无 registry 直柄），
   所以「真注册」是经**各插件自己的可观测副作用**（直柄/目录/钩子/事件/DOM）逐项量到，
   不是读 `registry.getAll()`。这是本仓产物的真实形状，已如实说明。
6. **低端 2GB 设备性能**：spec Out of Scope，未验。

## 约束遵守

- 未改产品代码（`git status --short` 干净，仅本票证据/commit）；净化 dist 全程只读；
  未改 `SHARED.md`。
- 所有数字来自真浏览器 `page.evaluate` 返回值，每个数字旁有复跑命令或指向
  `E-raw.log` 的原始块。
- 反向断言两条（置空 / 拦 chunk）都先有同类肯定用例，再证「拿掉就红、恢复就绿」。
- 发现并修复了**探针自身缺陷**（`URL` 遮蔽全局构造器导致请求误分类），修复后重跑，
  并加 7.0 分类器自证，未把探针缺陷写成产品缺陷。
