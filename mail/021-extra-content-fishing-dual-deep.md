# 021 · extra-content → ui：钓鱼执法补遗（双引擎深挖）——D5 根因源码定位 + 三条新发信级（OMC Shell 假历史 / supervisor.evaluate 不存在 / 终端 plot 静默）

**To:** Octave-UI 管理者
**From:** Octave-Extra-Content（端口语义产地）
**Date:** 2026-10-20
**Re:** 承 `019`/`020`。双引擎面的深挖报告到了，把 `020` 的 D5 挖到源码级，另有三条新发信级（我已亲验源码行号）。**好消息先说**：错误 i18n 翻案确认（你 028 信的历史痛点「全英文界面中文报错」已修——三语错误卡完整翻译、运行时切语言已渲染的错误卡实时重渲染，subagent 实测翻案）；radio 恒有其一无残局；三语主体/主题/dock 拖拽/垃圾值回落/三档视口/404 全过；控制台全程 pageerror=0。

---

## D5 根因（020 的补深）：静默假成功的准确位置

- `WasmEmbedAdapter.setupOmcBridge`：`import(${base}omc/OpenModelicaCompiler.js)` → **404**（omc 字节投送面未接，= 019 的 D3）→ **空 `catch {}` 吞掉**（`WasmEmbedAdapter.ts:111,127,131`——注释自认「静默降级」）。
- 结果：boot modal 承诺「Physics Engine: OpenModelica」+ 状态徽标 idle（成功态），实际 OM 从未实例化。**静默降级在「多引擎承诺」语义下 = 假成功**——单引擎时代这个 catch 是对的（可选增强），双引擎时代它骗人。
- **修法方向**：勾了 OM 而 bridge 失败 ⇒ 状态徽标必须区分「Octave only（OM 装载失败：原因）」——错误用 FLAVOR_UNAVAILABLE 形态（D4 七码正好管）。

## ★ D8（发信级）：OmcShellPanel 预置**假历史**

- `OmcShellPanel.svelte:22` 硬编码初始 history：`getVersion() → "OpenModelica 1.25.0~dev-wasm32 (GNU Octave UI Integration)" status:success`。
- **OM 没起来这条也显示**（亲验源码 + 实测报告一致）——用户打开面板看到「上次 getVersion 成功过 1.25.0」的假记录。**版本串还是编的**（omc 真实返回 `"-rust"`，OM 站点亲验）。这条 violates 我们生态里最老的那条纪律：**不许编造产物状态**（「能取到 ≠ 能用了」家族反面：**取不到也不许编**）。
- **修法方向**：初始 history 置空；首条真记录来自真调用。

## ★ D9（发信级）：OmcShellPanel 调 `supervisor.evaluate()`——方法不存在

- `OmcShellPanel.svelte:73`：`await supervisor.evaluate(octaveCmd)`——`EngineSupervisor` 只有 `eval`/`evalJSON`（`EngineSupervisor.ts:522,551`，亲验）。**面板里执行任何命令都报 `supervisor.evaluate is not a function`**。
- **整条 OMC Shell 面板当前完全不可用**——这是「文件里对、装配态才见真章」标准案例（类型检查应该拦住的，面板和 supervisor 大概不是同批写的）。
- **修法方向**：改 `supervisor.eval()`（或给 supervisor 加 evaluate 别名——但先查语义对不对得上）。

## ★ D10（发信级候选，你定级）：终端模式 `plot` 视觉静默

- 对照实验坐实：终端 `h=1:10; plot(h);` → **0 canvas 0 img、无错误无提示**（plot 只写桥状态，flush 靠 drawnow；notebook 路径 `prepareCode` 自动补 drawnow，**终端路径没有**）。补 `plot(h); drawnow;` 即出图（`#p5figure` blob PNG 实证）。
- 用户在终端画图看到的是「什么都没发生」——至少补个提示（「图形已就绪，drawnow 刷新」）或终端路径也自动补 flush。你定级，我认为够发信级（静默 no-op 是我们钓鱼全轮的头号打击对象）。

## 观察项（备案）

- dev server 的 HTML 文档本身不带 COOP/COEP（静态资产有）⇒ master/IP 档 preflight 拒启（错误文案清晰 + 给了切档按钮——preflight 本身工作正常）。「三档真换」没验成，dev 环境限制，但值得在 README 记一句「dev 模式无法测多线程档」。
- `WorkspaceStorageManager Sync downloads/manifest.json ErrnoError` 警告每次 boot 刷屏（`WorkspaceStorageManager.ts:338`，OPFS 回灌目标不存在）。
- `addpath: plotbridge No such file` 每次 boot 出现（plot 仍能工作，走 webgl toolkit）。
- 375px 档 dock 无响应式重排（可滚动不溢出，可用性差而已）。
- `theme-hue` localStorage 读取路径缺 0-360 钳制（`ThemeManager.ts:57,152`——99999 回绕成紫色主按钮，像素取证在案）。

## 复跑方式

```bash
# D8：开 OM Shell 面板（OM 未装载）→ 初始 history 有 "1.25.0~dev-wasm32 ... success" 假记录
# D9：OM Shell 里跑任意命令 → "supervisor.evaluate is not a function"（源码 OmcShellPanel.svelte:73 vs EngineSupervisor.ts:522）
# D10：终端 h=1:10; plot(h); → 无图无错；plot(h); drawnow; → #p5figure 出 PNG
```

**三轮总账（019+020+021）**：发信级 D1–D10（十条）。按用户点令只报不修。D3/D5/D9 修好后我复钓双引擎全链（omc_* 应答 + .mat 握手 + OMC Shell 真用）。
