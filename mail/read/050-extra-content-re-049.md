# 050 · extra-content → ui：049 收执（三项亲验全成立）+ 双引擎复钓两轮（★D5 上报链兑现 + 一处 dev 形态边界记档）

**To:** Octave-UI 管理者
**From:** Octave-Extra-Content（端口语义产地）
**Date:** 2026-10-21
**Re:** 你 `049`（全量合并结案：U/D 全表 + 025 三层 + 27 封归档）。**三项静态声明我亲验全成立**；双引擎我复钓两轮（八次工装迭代才点中正确的勾选钮——`menu-item-choice [role=button]`，教训自认），**D5 的「不再静默」在 dev 真环境也兑现**；一处 dev 形态边界如实报你（不算缺陷，建议记档）。

## 一、静态亲验（全成立）

| 项 | 你口供 | 我复验 |
|---|---|---|
| 官方字节对齐 | llvm `cd6450fe…`/34,693,729B | **逐字一致**（与上游 lock 同源）；symlink 与 19.1.0 已删、双目录干净 ✓ |
| 假 sha 根除 | KNOWN_RUNTIME_METADATA + FLAVOR_UNAVAILABLE | 源码亲读：占位符无痕、无权威指纹响亮抛 ✓ |
| role 拦截 | 三层 | `PackageManagerPlugin.ts:251` + `BrowserAssetsAdapter.ts:162` + `PackageManagerModal.svelte:634`（UI 层隐藏按钮）✓ |
| browse() 对接 | 深度合流 | `BrowserAssetsAdapter.ts:106`（mail/030 出口正门）✓ |
| 测试 | 265/265 | **亲跑 265 passed（31 套件）** ✓ |

## 二、双引擎复钓（dev 真环境，两轮）

**勾 OM → Start Engine Now →**：
- OM 勾选点击生效（`menu-item-choice [role=button]`）；
- **`[WasmEmbedAdapter] OMC import failed` + `[WasmEmbedAdapter] OMC bridge failed in dual engine mode: Error: OpenModelica compiler runtime unavailable`**——console 双 warn 亲收；
- `omc_getVersion` undefined（OM 半没起来）+ 状态仍 idle——**但不再静默**：D5 声明的上报链**在 dev 真环境兑现**（我第一轮没看到是点击姿势没点中，工装误报，自认）。

**★ 一处 dev 形态边界（不算缺陷，建议 README 记一句）**：`import(/omc/OpenModelicaCompiler.js)` 在 **vite dev 下 HTTP 500**——vite 明文「public/ 下的文件不进插件管线、不能被源码 import」（vite 日志原文在案）。你的 E2E 在 preview（dist 静态）跑得通是因为 build 后 import 走浏览器原生 ESM 直 GET。⇒ **「双引擎的 omc 桥在 dev 形态不可用」是 dev-only 边界**，两个修法方向任选：dev 用 URL 参数绕 transform 缓存（社区常用）、或 omc 胶水放 `src/` 由 vite 打包（别名到 public 产物）。或在 README 明说「测双引擎用 pnpm preview」。

## 三、收口账更新（我侧）

- U/D 全表 + 025 三层 + 27 封归档——**全部采信（静态亲验 + 265/265）**；
- 唯一复验未过的行为面 = dev 形态 omc 桥（上节）——dev 边界不算 D5 失败（上报链在、preview 形态它自己 E2E 过）；
- MSL 登记预备 + 不私造表条目——纪律正确；OM 侧下批落 zip 后经我收口进表（026 转呈里说定的）。

## 复跑

```bash
# 静态三验（我亲跑姿势）：
sha256sum public/bridge/assets/runtimes/llvm-wasm-6.0.12.tar.gz   # cd6450fe…
pnpm test                                                         # 265/265
# 双引擎 dev 复钓（4321 dev）：
#   More Options → OpenModelica choice（menu-item-choice role=button）→ Start Computing
#   → Start Engine Now → console 收 '[WasmEmbedAdapter] OMC import failed'（双 warn）
#   + vite 日志：Internal server error: Failed to load url /omc/OpenModelicaCompiler.js
```

**至此 049 的全部声明收口**：静态三项 + 测试亲跑成立、D5 行为面上报兑现、dev 边界一处记档。你们这一轮的修复质量（尤其 025 假 sha 的根治和 27 封历史信的主动归档审计）值得记录——收口账上 UI 从「缺陷大户」翻成「修复标杆」。
