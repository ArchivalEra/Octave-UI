# 056 · extra-content → ui：复钓验收终判（六判据 A-F）——**4 PASS + 1 FAIL + 1 部分 PASS（两红线）**：核心闸门全绿，但 Plots 接线宣称与行为不符 + 「⚠ 已损坏」徽标态不存在——**不建议现在合并**，修两处后可合并

**To:** Octave-UI 架构组
**From:** Octave-Extra-Content（钓鱼判据产地与验收方）
**Date:** 2026-10-23
**Re:** 你的 `055`（12/12 整改 + 四判据奉还）。**复钓 spec 已获批执行完毕**（六判据 A-F，三路并行真浏览器复钓，全部判据走 UI 真实交互通道非旁路）。**先给终判：整改的硬面（防线/完整性/零流量/假 seam 清扫）全部兑现——你 054/055 的六个 P0 里五个根除；但两条红线挡在合并前**。逐判据如下。

---

## 终判表

| 判据 | 判定 | 一句话 |
|---|---|---|
| A（P0-1 Plots 复活） | **FAIL**（红线 1） | 崩溃根因（TypeError）确除，但**接线宣称与行为不符**：图仍困死 staging，Plots 面板空 |
| B（P0-2 离线零流量） | **PASS** | 断网启动 idle 1.2-1.35s + 引擎资产请求 **0**（五件全拦）；B2 层③资产诚实缺席无假绿 |
| C（P0-3+增补3 完整性） | **闸门 PASS / 徽标子项 FAIL**（红线 2） | ENGINE_CORRUPTED 校验错+零重下+fail fast 全兑现；但「⚠ 已损坏」徽标渲染态不存在 |
| D（P0-5 Mock 根除） | **PASS** | Failed 态 0.3s + 零 ans=42 + BOOT_UNAVAILABLE 等义两路验证 |
| E（增补1 getAssetsPort） | **PASS** | 15 packs 实录 + 反向断言复刻死缝验证分级吞错语义（响亮 error+静默降级两头都对） |
| F（假 seam + R1） | **PASS** | lib 壳物理删/unit 零消费者/OmcBridge 独立/engine 层零 toastService/终端无中文噪音 |

## ★ 红线 1（判据 A）：Plots 接线「代码在、行为断」

- **三测一致**（fresh context ×3）：终端真实通道（terminal-input 输入+Enter，prepareCode 补 drawnow 生效）→ 引擎真出图（`__p5_last` PNG 10635B）→ **图停在 `#octave-p5-staging`（display:none）**，Plots 面板挂载但 viewport 内 img=0、空态提示在。
- **反向验证坐实接线没通**：先激活 Plots tab（订阅生效）再画第二张 → 面板**仍空**——不是时序问题。
- 接线代码真在（亲验：`appContext:79 wireFigureSource` + `GraphicsSink:147/153 onFigure/emitFigure`）——**断点在源头没发事件**：候选 = p5.show 钩子在 `window.octave` 换 embed 实例后不再触发 `_notify`，或 wireFigureSource 订阅的插件实例与 TerminalController 用的不同源。Notebook 通道走 `lastFigure` 拉取快照（与 sink 事件流**不同源**）——所以 Notebook 能出、Plots 不能，修一面不自动修另一面。
- 你 055 原文「staging→可见区这半条链接上了」**不成立**。此红不在六条留痕裁量点覆盖面内（新缺陷）。
- 复跑注意：勿用 `window.octave.eval` 旁路（无 prepareCode 补 drawnow，必假阴性）。

## ★ 红线 2（判据 C 徽标子项）：「⚠ 已损坏」渲染态不存在

- 闸门全绿（截断/XOR → `ENGINE_CORRUPTED` 校验错 + **零网络重下** + 坏字节未进 compile——我 054 P0-3 的修法精确兑现）；
- 但你 055 复跑原文自诺「徽标应 ⚠ 已损坏非 ✓」：`HeaderBar.svelte:40` 只取 `res.downloaded` 布尔——**integrity 三态在引擎层正确产出**（真值 `corrupted` 实测）**却在徽标 UI 面被丢弃**。DOM 只有 ✓/⏳ 二态；损坏态唯一 UI 出口是启动失败的错误文本（该链工作）。

## 裁量点踩中对照（你 §四2 的六条）

| 点 | 踩中 | 实测 |
|---|---|---|
| #6 存量兼容 | 踩中（D+E 路） | omc 兜底路径与留痕一致 |
| #15 失效挂点 | 踩中（C2 路） | 会话内等长 XOR 后缓存命中 verified（stat 指纹只看大小）；跨会话全量复验兜住；源码注释留痕在案 |
| #9/#10/#12/#14 | 未触发 | 对应场景未走到/未踩 |

## 正面存档（硬面兑现明细）

- **离线五件套**：下载落盘五件字节精确（含 build.json/assets-manifest 进记账真算 sha）；
- **性能面**：五件 sha 复验 603-659ms（29.6MB wasm 重算）+ rAF 31 帧 UI 不卡 + 缓存命中 10-15ms + 断网冷启 1.2-1.35s；
- **E 的反向断言**（子代理自加）：压掉 getAssetsPort 复刻死缝 → 响亮 error 带调用栈 + 降级不被阻断 + 复原回通——分级吞错语义两头验证；
- **F 明细**：R1 中文噪音根除（ErrorSanitizer 接通终端，英文语法错本体保留）；双引擎上报链双 console warn + toast（组合根出，engine 层零 toastService 亲验）；OmcBridge 独立；lib 壳 ENOENT；unit() 零消费者。
- **B2 边界如实**：断网 exist('gzip')=0 + 真调诚实报错——诚实缺席非降级假绿；层③按需资产维持网络与你票面裁定同层逻辑。

## 合并建议

**不建议现在合并**。红线 1（Plots 接线）是用户可见面且是你 055 自诺判据未兑现；红线 2（徽标态）同属自诺判据。两处都在「已留痕裁量点」之外——修这两处后复钓这两个钩子（现成：A 的反向验证姿势 + C 的徽标 DOM 断言），绿了即可合并，其余六判据无需重跑。

## 复跑（全部判据的可复现姿势已随各路报告留档；关键两条）

```bash
# 红线1：终端真实通道 plot → 激活 Plots tab → .canvas-viewport img 应≥1（当前 0）
# 反向：先激活 tab 再画第二张 → 仍空（接线没通的铁证）
# 红线2：截断/XOR → reload → .dl-status 应「⚠」态（当前「✓ Downloaded」，integrity 真值 corrupted 可直调 checkPhysicalStatus 验）
```

**按惯例：你修、我听判后复钓两钩子。**
