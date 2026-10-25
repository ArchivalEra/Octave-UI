# WebMCP 网桥重构 · 偏差表（spec v2 步骤 3）

偏差表只列**有意新增的拒绝/错误码/wire 形状变化**（spec C 小项 1）。步骤 2（骨架迁移）验收
= 全量零差异时本表为空；步骤 3 每项落地后逐项从「未实现」→「已实现→已确认」→「已勾销」。
golden master 快照的更新**只允许出现在对应项的提交里**（spec C 小项 3）。

## 保真清单（不是偏差——旧路径行为，零差异）

- 空串 code 守卫：`Error: parameter "code" is required and cannot be empty.`（run 内旧路径，
  校验器放行 string 空串——两道守卫并存）
- Unknown tool 原文案：`Unknown tool name: "x". Use listTools() to see available tools.`
- catch-all 原文案：`Execution failed for tool "x": <msg>`（crashed/failed 旧路径经此）
- 类型强转放行：`code:42→'42'`、`planOnly:'yes'→true`、`consumer:5 原样透传`（ARGS_INVALID
  落地后依旧放行——可强转面是放行面不是偏差面）
- booting 排队（supervisor 内部）、ready 单次握手、事件协议形状

## ① ARGS_INVALID —— 已实现 → 已确认（2026-10-24）

- **适用面**：参数明确违规——缺 required 键 / 类型明确错（string 目标收 object/array/null；
  number 目标收非数值串或 object；boolean 目标收 object）/ enum 越界（string 实参非成员）。
- **放行面**（不报）：可强转值（number/boolean→string、数值串→number、原始值→boolean）、
  未知字段、非 required 缺省、enum 目标收非串值（强转语义下不比成员）。
- **信封**：`ARGS_INVALID: parameter "<字段>" <is required | must be of type <t> | must be one of [...]>.`
- **落点**：dispatcher 在 run 之前校验（validate.ts 纯函数，规则从表 schema 生成）。
- **golden 快照变化（3 条，全部在本项提交）**：
  - `A7 > octave_eval | missing code arg → guard`（旧守卫文案 → ARGS_INVALID）
  - `A7 > octave_eval | callTool invoked with no args object at all`（同上）
  - `A7 > octave_install_package | missing name → guard`（同上）
  - **不变的**：`code:42 强转成功`、`run_cell 缺 cellId/index 落 not-found 守卫`（无 required，
    校验器不拦）、空串 code 旧守卫、全部成功/失败/双通道面。
- **反向断言**：tests/plugins/webmcp-args-validation.test.ts（14 用例：必报 ×5 / 放行 ×4 /
  全链并存 ×5）。

**偏差表状态：3/3 项已实现→已确认（ARGS_INVALID / TIMEOUT / CAPABILITY_UNAVAILABLE）——2026-10-24 全部勾销。**

## 观测面记录（非偏差——不上 wire，无 wire 形状变化）

- **onCall 计数器**（步骤 3 第 4 项，spec B.3/用户故事 11）：每次 callTool 终态记
  `{name, ok, ms, ts}` 四元组进环形缓冲（容量 512，溢出丢最旧）；读取口 =
  调试句柄 `window.__webmcp_debug.stats()`（init 挂 / destroy 卸，不误删后来者的）。
  **不记 args**（隐私/体积）；**不上 wire、不改 get_system_state 输出**（golden F 面
  88 用例零变化即证——等价断言「输出对象无 stats 键」在反向断言里）；**默认零行为**
  （记录在终态之后，对调用结果零影响）。反向断言 10 用例
  （webmcp-call-stats.test.ts）。

- **适用面**：工具调用在 timeoutMs（缺省 120_000，表项可覆盖）内未完成 ⇒ TIMEOUT 信封。
  计时**含排队**（从调用发起算——machine 在 supervisor 之上看不到执行起点，首版如实承认）。
- **不碰 supervisor**（实施仓归属纪律）：Promise.race 在 machine 层；超时后底层任务
  **不被取消**（JS 无取消原语），信封如实告知。
- **兜底范围**（spec B.1 明示）：eval 挂起由 Kill Ladder 先决议（120s > Kill Ladder 最终阈值，
  超时几乎不触发）；真正兜住 = 懒加载引擎装载 / 装包下载 / UI 类工具读大量文件系统。
- **信封**（措辞 spec 逐字，进 golden 即钉死）：`TIMEOUT: tool "<名>" did not finish within
  <ms>ms (counting from call initiation, queueing included). The underlying task may still be
  running or queued — do not blindly retry.`
- **golden 快照变化：0 条**——120s 缺省窗内正常调用零影响（88 用例全体绿即证）；
  超时触发面只存在于反向断言（tests/plugins/webmcp-timeout.test.ts，9 用例）。
- **落点**：dispatcher 的 raceTimeout（defineTool 增加 timeoutMs 可选字段）。

## ③ CAPABILITY_UNAVAILABLE —— 已实现 → 已确认（2026-10-24）

- **适用面**：provision **在册**但运行期不可给——懒加载引擎装载失败 / 服务 boot 中且该
  工具选择**不排队**（排队语义的工具不声明本门，booting 走旧路径不报——spec B.4）。
- **零偏差红线**：provision 缺失（未在名册）⇒ Unknown tool **原文案**（golden F 面盯住，
  有反向断言钉死不是 CAPABILITY）；六个旧工具不声明 capability ⇒ 服务缺席的**旧守卫文案
  一字不变**（golden F 组「三服务缺席」全体绿即证）。
- **provision 在哪算**：createServer 一次性静态名册（server.ts `tools = octaveToolTable`，
  不靠 thunk 键存在性判断——服务晚构造不抖名册）。
- **信封**：`CAPABILITY_UNAVAILABLE: tool "<名>" requires <原因>, which is not currently
  available (the tool is provisioned but its runtime capability is missing — e.g., lazy engine
  load failed, or the service is still booting on a non-queuing path).`
- **golden 快照变化：0 条**——六旧工具不声明门，行为零变化；触发面全在反向断言
  （webmcp-capability.test.ts，7 用例：必报 ×2 / 恢复放行 / 缺名原文案 / 不声明不介入 /
  检查抛错落 catch-all / 门在 ARGS_INVALID 之后）。
- **落点**：defineTool 增 capability 可选字段（收窄 ctx 同 Pick 面）；dispatcher 在
  校验之后、超时壳之前执行；omc 软依赖路径用 supervisor 模拟（catalog 无 omc 条目前的
  等价物——验收方 068 提示的路径）。

---

## ④ omc 工具族进名册（`omc_load_msl`）—— **已确认 → 已勾销（2026-10-25，内容仓 093 裁定 A）**

**确认引用**：内容仓 `093`（我方槽 `087`）——裁定 A「认 provision 自然生长」，四条绑定全满足：
① 4 条 golden 快照更新与工具注册**同一提交**（无过期窗口期）；
② 本项标已确认→已勾销并引本信；
③ **本确认只覆盖 `omc_load_msl` 一个工具**——名册再变（omc 工具族后续成员、任何新工具族）
仍需逐条显式登记，A 不是「以后生长免确认」；
④ 能力门三道反向断言是工具体的一部分（`tests/plugins/webmcp-omc-msl.test.ts` 5 用例钉住，
含「装后自检不通过 ⇒ isError」），将来重构不许改成静默缺席。

**wire 变化实测**：`listTools()` 6→7 条；六条 octave 工具的 schema **逐字节零改动**
（diff 只在末尾追加 `omc_load_msl`，键序保持）——golden 快照 2 条按此更新。

**工具实现要点**（recipes/msl.md 权威形状）：挂载 `/.openmodelica/libraries` 一次
`omc_vfs_load_zip`；**反例在案**（`MODELICAPATH` 经 `omc_set_env` 传不进 loader）；
装后自检三条进返回体（不静默成功）。

---

## ④-原 待验收方确认（历史记录，已由上方裁定取代）

- **性质**：**新增 wire 面**——`listTools()` 从 6 条变 7 条（外部 agent 的工具发现面变化）。
  按 spec C 小项 1，偏差表只列「有意新增的拒绝/错误码/wire 形状变化」——本项属 wire 形状变化，
  **必须显式登记并经验收方确认**，不得以「加工具是正常生长」为由悄悄改 golden。
- **依据**：内容仓 `086` 裁定 #4「MSL 供给面 + WebMCP 工具族**即刻可开工**」；spec 用户故事 13
  「第二引擎工具按 provision 加前缀自然生长」。
- **实现现状**：工具体已写（`tools/omcLoadMsl.ts`，含 recipes/msl.md 的挂载形状 + 反例注释 +
  装后自检三条），**但未注册进名册**——注册即触发 4 条 golden 快照变化
  （`listTools` 6→7、`ready.detail.tools ≡ listTools`），已实测。
- **需要裁定**：① 认可这是「provision 自然生长」的正当 wire 变化（则更新 golden 4 条快照，
  本项标「已确认→已勾销」）；② 或要求 omc 工具族走**独立 provision 开关**（默认不进
  octave 面名册，避免 octave-only 构建的工具面被 omc 工具污染）。
- **反向断言已备**：缺 packageManager ⇒ `CAPABILITY_UNAVAILABLE`；catalog 无 MSL 条目 ⇒ 明说
  未找到；`window.__omc` 缺席 ⇒ `CAPABILITY_UNAVAILABLE`（不冒充成功）。
