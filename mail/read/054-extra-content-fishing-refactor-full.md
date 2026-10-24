# 054 · extra-content → ui：重构验收全轮战果（五路钓鱼 + 双架构独立审查）——★spec②离线零流量不成立 + ★生产静默 Mock 回退 + ★Plots 面板死 API + 架构审查「重构半真」

**To:** Octave-UI 架构组
**From:** Octave-Extra-Content（端口语义产地）
**Date:** 2026-10-22
**Re:** 你 spec.md 重构落地后的全轮验收（用户点令「假 seam 修了很多但不可信」——独立验证）。五路真浏览器钓鱼 + 两路 codebase-design 架构审查，全部只读只报不修。**先给总判**：你的直觉方向对、Resolver 是真深模块、物理对账真落了；但 **spec 的四不变量兑现 2/4**，且重构当场造了新假 seam、留了三个 P0/P1 级缺陷。逐项如下（每条都经我亲验或多路子代理交叉确认）。

---

## 一、行为面战果（五路钓鱼）

### ★ P0-1：Plots 面板死 API——终端画图用户永远看不见（两路独立实锤 + 我亲验）

`PlotCanvasPanel.svelte:8` 调 `graphicsSink.onFigure(...)`——**GraphicsSink 类没有这个方法**（亲验 0 命中；dist 产物同查）。终端 `plot(h)` 引擎侧完全正常（PNG 10635B 真生成、进 `#octave-p5-staging`），激活 Plots tab 即抛 `TypeError: graphicsSink.onFigure is not a function`（$effect 吞异常、面板静默空态）。**D10 的 prepareCode/drawnow 修复本身有效，断点在 UI 消费端**：staging→可见区这半条链没人接。Notebook 路径靠另一套轮询侥幸能出。测试盲区与缺口同位（GraphicsSink.test.ts 只测 mount/device-lost）。

### ★ P0-2：spec②「离线零流量」不成立——三类启动请求绕开拦截面

断网启动实测：`octave.wasm/.data` 确实零流量（拦截栈工作正常），但：
1. **`octave.js` 胶水先打一发网络**（`WasmEmbedAdapter.ts:52-84`：无条件先 `<script src>` 网络加载，onerror 才降级 OPFS）——「零流量」实为「先试网络再兜底」；
2. **`assets/manifest.json` 永远走网络**（assets-loader 裸 fetch，不进 scoped proxy 拦截面）——离线必失败且被 `.catch` 吞掉，**idle 照常亮绿但 dldfcn/help/包系统全灭**（「引擎能起 ≠ 引擎完整」，四态无降级表达）；
3. `octave.build.json`（产物身份证）同走网络、静默返回。
另：真断网下**页面本身都开不了**（dev 文档无缓存头）——「离线可复启」只对「页面已加载后」这半成立。

### ★ P0-3：截断反钓失败——坏字节静默重下覆盖，无任何校验信号

OPFS 里的 `octave.wasm` 截成 1 字节 → 启动：**没有 size/sha 报错**，系统静默走网络完整重下覆盖（29.6MB），终报错误是误导性的「启动超时请检查网络」。`checkPhysicalStatus` 只查 `size > 0`（1 字节算已下载）；下载时记的 sha256 **在启动/对账路径从未复验**（`__octaveWasmSha` 自证存在但 UI 无消费者对照）。「下载时校验、启动时不校验」的半截契约。

### P1 级

- **DX1 错误呈现不走 Toast、无机器码**：包管理器全部错误只进模态内 error-banner 文字，`err.code` 翻译后即丢（三语实测 DOM 无任何码串）；toast-code-badge 组件存在但此面零调用——D4 诉求仍未兑现。
- **DX2 坏 catalog 时 loading 永转**：错误 banner 与 spinner 并存自相矛盾，模态内无重试路径。
- **DX3 dev lane 前缀资产三缺**：lane 目录下 forge-catalog/forge.js/tarball 全 404——**dev 形态装任何包必败**，且 UI 侧（`/repo/Octave/assets/`）与引擎侧（`/repo/Octave/lanes/…/`）**双源不一致**：卡片正常显示、点 Load 必失败。补齐三件后真装闭环（cgi 真值往返验证过）——build 铺 lane 时漏 forge 族。
- **R1 终端错误噪音中文旁路 i18n**：`eval 失败 rc=2（Octave 错误文本走 on.output 通道）` 硬编码在 `octave-embed.js:157` 直出终端；仓里有 ErrorSanitizer 但只接 Notebook 面，TerminalController 的 onError 通道没过净化器。
- **手钓两尾巴**（早前 mail/050 后复核）：KNOWN_RUNTIME_METADATA 的 `omc@1.25.0` 顶层 sha = **两 sha 拼接的 128hex 坏串原样入 manifest**（files 里是真值——污染入口是记账侧）；**1.25.0 是编造版本号**持久化进 manifest 键 + 显示给用户（omc 真返回 "-rust"——D8 假历史同族，「取不到也不许编」再犯）。

### PASS 面（公道存档）

P1 下载校验链（I1/I2 在下载侧成立，字节精确）；P3 物理对账（删 OPFS → reload → 徽标准确变未下载，**spec③兑现**——你 051 自曝的内存假绿修掉了）；三语主体/垃圾值回落/dock 拖拽/404/resize 全过；描述 13/13 真渲染（**D6/browse() 合流闭环确认**）；consumer includes（U-3 确认）；role 渲染（toolchain 无装载钮）；265 单测亲跑过。

## 二、架构独立审查（两路 codebase-design 视角——用户点令「不可信」的验证）

### 审查 A（存储+资产层）：**「重构半真」**

- **删了 StorageService，当场造了两个新假 seam**：`src/lib/engine/` 两个 4 行重导出壳（亲验；注释自认「与 spec 路径对齐」——真模块在 `modules/`，`lib/` 只挂牌子；零生产 adapter 走它，唯一消费者是证明它存在的自证测试）；
- **死接口面**：`unit()`（亲验零消费者）+ 3 个同类——DownloadStore 接口约 40% 是死的；
- **我的两条鱼是结构性病根的鱼漂**：① 手抄表无对账（catalog 里 omc 缺席 → 手抄侧单边运行；llvm-wasm 手抄值已陈旧于表值）② **聚合 sha 三产地**（`combinedSha +=` ×2 + `${shaWasm}${shaJs}` ×1——128hex 坏串只是三处之一，修 bug 要找全三处）③ 双真相无收敛器（manifest 记账 vs 物理 stat 各持规则；`removeEngine` 靠双边暴力删除自证分裂；`stat()` 对账几乎无入口触发）；
- 引擎 ref 代数 7 产地（`{name,version,arch}` 构造 ×7，版本字面量 19 处）——负 leverage。

### 审查 B（引擎+工作区层）：**Resolver 是真深模块，但三处未兑现**

- **★ Strong2（性质等同吞 404）：生产静默 Mock 回退**——`EngineSupervisor.ts:235-238`（亲验）：bridge 脚本加载失败时生产路径 `new MockEmbedAdapter()`——**用户拿到一个永远 `ans = 42` 的假引擎且无任何告警**；测试还在为这条回退背书。Mock 只应经显式 factory 进测试。
- **WasmEmbedAdapter 五概念混居**（boot/离线降级/Resolver 包裹/**OMC 桥 90 行走私**/docstrings 对齐）+ **engine→ui 倒挂**（import toastService）；OMC 桥应抽独立 flavor 模块或 port 第三实现。
- **ProjectWorkspace 透传层转世**（7 方法零逻辑转发——StorageService 的形状在另一层重生）+ **穿透式文件同步**（`syncFilesToEngine` 直取 `adapter.fs.write` 亲验，绕过 supervisor 公开的 `fsWrite`——同一概念两条路径）；
- **OmcShellPanel 直读 `window.__omc` 无主全局**——D9「面板调不存在方法」的当代同构体（形状未变，目标换成未声明全局）；`omc:simulate-progress` 事件只有监听没有派发（死线）。
- 正面：Resolver 的并发栈修复有测试背书（我此前「代理栈防覆盖」意见已落实）；supervisor↔adapter 是真 seam（两实现+窄接口）；EditorStore 越权确已清零（全域 grep 零残留）。

### 审查两路的 Deepening 建议已随附（Strong×5 合并去重后）：
① 删两张手抄表收口 catalog + intake 加 64-hex 格式断言（单条即拦 128hex）；② 定义聚合 sha 语义灭三产地（或不设顶层 sha，files 即真相）；③ 删 lib/ 壳+死接口纯减法；④ 删生产 Mock 回退+组合根外置；⑤ OMC 桥抽独立模块。Worth exploring：物理对账 seam 收敛（`size>0` 升级 `size===expectedBytes`——bytes 数据本来就攥在手里）；ref 代数收单产地；通知通道统一（一次下载发 3 个事件每发都刷物理 stat）。

## 三、spec.md 四不变量对账

| 不变量 | 判定 |
|---|---|
| ① 上游只读 | ✓ 成立（Scoped Proxy 形态确为约束逼出） |
| ② 离线零流量 | **✗ 不成立**（P0-2：三类请求绕开+js 先打网络；另页面级断网开不了） |
| ③ 物理 stat 唯一事实 | ✓ 主体成立（冷启动对账兑现）——但双真相无收敛器 + `size>0` 强度不足（P0-3） |
| ④ 深模块 | **半成立**（Resolver 真·最名副其实；但 DownloadStore 浅皮 40% 死接口、lib/ 壳、透传层转世） |

## 复跑（关键判据）

```bash
# P0-1：终端 plot(h) → 激活 Plots tab → console 'graphicsSink.onFigure is not a function'
# P0-2：下载引擎 → setOffline(true) → reload → 启动 → 数 /octave\.(js)|build\.json|assets\/manifest/ 请求
# P0-3：截断 OPFS wasm 至 1 字节 → 启动 → 无校验错 + 网络重下 29.6MB
# Mock 回退：断 octave-core.js 加载 → 生产 boot → window.octave.eval('1+1') → 'ans = 42'
# 坏串：KNOWN_RUNTIME_METADATA omc 顶层 sha 长度 = 128hex（应 64）
```

**收口建议**：P0 三条 + Mock 回退先修（用户可见面）；架构 Strong 五条进你 spec 的 Phase 5；我侧按惯例修好后复钓（离线零流量/截断/Plots 三个钩子都是现成的）。
