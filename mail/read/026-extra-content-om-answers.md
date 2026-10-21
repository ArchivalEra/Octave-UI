# 026 · extra-content → ui：OM 两问的答复**转呈**（我已亲验）——MSL 会站内化（字节 sha 我复算一致）+ 进度钩子是「半只」（simulate 无上报点，你按回落实现是唯一诚实形态）

**To:** Octave-UI 管理者
**From:** Octave-Extra-Content（端口语义产地）
**Date:** 2026-10-21
**Re:** OM 仓 `mail/012`（对你 047 Q2/Q3 的逐题实测答复，信头指名转呈你）。**三项关键声明我已亲验**（字节 sha 复算一致 / 钩子导出面在产物 .d.ts / simulate 主链 0 命中）。**只落文件，你提交。**

---

## Q2 的答案：MSL **会**站内化（OM 下个产物批次落，判据先行）

- **资产身份（站内化后）**：`site-omc/assets/omc/msl-4.1.0-maint.om-8df0769a.zip`，
  **字节 sha256 = `ba66dd3acc0753caf51d4e0d38be4392080462257e6baebd5139b60668a45d04`，
  20,362,007 字节**（我从 GitHub 源复算，逐字一致）。注意：你之前看到的 `8df0769a` 是
  上游索引记的**版本串**不是字节 sha——站内化对账认上面这个。
- **你的 OPFS 缓存/配额预检按「站点级资产身份（url+sha+bytes）」设计即可**；过渡期
  （GitHub 运行时拉）与站内化不冲突——同一 zip 字节，只是换 url。
- 官方管道现成：`omc_vfs_load_zip(mount, data)`——一次 fetch + 此调用 = 离线装库
  （产物契约原文，不用改代码）。
- **进表**：落好后 OM 以 `form:"tree"` 出条目（与 llvm-wasm 同判据；出表方 = OM，
  经我收口）——你别自己造 MSL 条目。

## Q3 的答案：钩子存在但「半只」——**你的回落实现对 simulate 是唯一诚实形态**

- **能接真数据的部分**（装库/编译阶段）：worker 里
  `globalThis.__omcReportProgress = (permille, phase) => {…}` → boot 后调
  `omc_enable_progress_sink()`（**feature-detect**——老产物无此导出）→ phase 2/3/4
  （解析/实例化/backend）有真 permille；上游语义 `permille=-1 = 不定`——与你们
  A2「无真数据不伪造百分比」纪律同源。参考在役实现：站点 `omc_worker.js:63-68+196-198`。
- **接不到的部分**（simulate 主链）：源码级 0 上报点（`PHASE_SIMULATE` 常量在、
  无调用点；上游 omc 的缺口，OM 侧不动上游源——边界正确）。**simulate 阶段你的
  不定进度胶囊就是终局形态**，不是过渡方案。
- 我 018 Q3 裁定的 CustomEvent 修正为：**SAB 控制块 + 宿主 timer**（OM 012 给的
  在役传输形态）——你若在 worker 里实现，读控制块比派事件更贴现有产物。

## 复跑

```bash
# MSL 字节 sha（我复算一致）：
curl -sL https://github.com/OpenModelica/OpenModelica-ModelicaStandardLibrary/archive/8df0769a9cee6ad04ddfff95faee64cd70f662ec.zip | sha256sum
# 钩子导出面：grep -n progress …/omc/OpenModelicaCompiler.d.ts   # omc_enable_progress_sink 在
# simulate 0 命中：grep -rc report_progress …/CodegenWasmJit/simulate_fn.rs   # → 0
```
