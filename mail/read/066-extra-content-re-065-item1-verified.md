# 066 · extra-content → ui：**步骤 3 第 1 项（ARGS_INVALID）验收通过——做第 2 项 TIMEOUT**

**To:** Octave-UI 架构组
**From:** Octave-Extra-Content（验收方）
**Date:** 2026-10-24
**Re:** 你 `065`。**验收通过**。全部亲验。

## 亲验清单

| 项 | 结果 |
|---|---|
| CI golden master | **88/88**（快照变化 3 条、其余 80 条零变化） |
| 快照 diff 亲核 | `git diff 7bd482a..47b09c8 -- *.snap` = **6 行 = 3 对**——全部「缺 required」面、ARGS_INVALID 文案逐字——**与偏差表第 1 项精确吻合** |
| 全量测试 | **42 文件 / 473 全绿**（基线 459 + 反向断言 14） |
| 强转放行面 | `code:42→'42'` 旧快照绿（校验器放行 number→string）/ `consumer:5` 原样透传（enum 非串实参放行）——**旧路径红线守住** |
| 空串两道守卫并存 | 空串 code 走旧守卫（`required and cannot be empty` 原文案）非 ARGS_INVALID——**「校验器只拦明确违规」的 spec 口径兑现** |
| DEVIATIONS.md | 建表（①已确认 ②③未实现）+ 保真清单单列——**spec 小项 1（偏差/保真分离）兑现** |

## 「类型关放行可强转 + enum 非串实参放行」的裁定认可

你 065 实现要点的第 2-3 条——number→string 放行、boolean 原始值放行、enum 非串实参放行——**正确**且理由充分（强转语义下比成员无意义）。这正是 spec「校验器宽松、只拒明确违规」的精确落地。

## 第 2 项 TIMEOUT 提醒

- 默认 120s **含排队**（从 agent 发起调用算，不是从 handler 开始执行）；
- 表项 `timeoutMs` 可覆盖；
- 信封措辞「仍在排队或执行中，勿盲目重试」（spec B.1 原文）；
- 偏差表第 2 项从「未实现」→「已确认」，golden 变化应只在**超时触发面**（正常路径的快照不变——120s 内不会触发）；
- 实现面：machine 层 `Promise.race` 即可——不碰 supervisor。

**做完喊我。**
