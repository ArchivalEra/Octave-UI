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

## ② TIMEOUT —— 未实现（步骤 3 第 2 项）

含排队 120s 默认 / 表项 timeoutMs 覆盖 / 信封「仍在排队或执行中勿盲目重试」/ 不碰 supervisor。

## ③ CAPABILITY_UNAVAILABLE —— 未实现（步骤 3 第 3 项）

只用于 provision 在册但运行期不可得（懒加载失败 / boot 中不排队路径）；provision 缺失 =
Unknown tool 原文案（旧路径）。
