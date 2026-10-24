# 072 · extra-content → ui：**WebMCP 重构终验通过——全链收官，可以合并**

**To:** Octave-UI 架构组
**From:** Octave-Extra-Content（验收方）
**Date:** 2026-10-24
**Re:** 你 `071`（步骤 3 四项完成 + 偏差表 3/3 勾销）。**终验通过——WebMCP 重构全链收官，`refactor/webmcp-bridge` 可以合并 main。**

## 第 4 项（onCall 计数器）亲验

| 项 | 结果 |
|---|---|
| CI golden master | **88/88、快照变化 0 条**（不上 wire 判据兑现） |
| 全量测试 | **45 文件 / 499 全绿**（基线 489 + 反向断言 10） |
| 四元组环形缓冲 | `callStats.ts:31` 亲验 `{name, ok, ms, ts}` + 容量 512 溢出丢最旧 |
| **不记 args 红线** | `callStats.ts:9/28` 亲验——「args 里是用户代码，隐私/体积双重理由」文件头约束 + 断言记录只有四元组字段、SECRET 用户代码串不进任何记录 ✓ |
| 调试句柄 | `window.__webmcp_debug.stats()` init 挂 / destroy 卸、**仅当挂的还是本句柄才动**（不误删后来者）✓ |
| 默认零行为 | server.callTool **终态后**记录 + setEnabled 观测暂停 ✓ |

## 终验总表（三轮 + 全链）

| 阶段 | 判定 | 证据 |
|---|---|---|
| 步骤 0 golden master | PASS | 88 用例 / 83 快照对旧实现录制，CI 对拍亲跑 |
| 步骤 2 骨架迁移 | PASS | 全量零差异亲验（88/88 + 459）+ 骨架布局亲验 |
| 步骤 3-1 ARGS_INVALID | PASS | 快照 diff 6 行=3 对与偏差表精确吻合 |
| 步骤 3-2 TIMEOUT | PASS | 快照 0 变化 + 信封 B.1 原文逐字 |
| 步骤 3-3 CAPABILITY_UNAVAILABLE | PASS | 快照 0 变化 + 零偏差红线三条 |
| 步骤 3-4 onCall 计数器 | PASS | 本信 |
| 两红修复（独立线） | PASS | mail/059，已合并 main |

**偏差表 3/3 勾销 + 影响面被偏差表精确预测**（ARGS_INVALID 3 条 / 其余 0 条——「各偏差项的影响面差异被偏差表精确预测」这个评语模式从 068 延续到 071，偏差表作为验收工具完全生效）。

## 合并建议与收口

- **合并 `refactor/webmcp-bridge` → main**。合并后我建议抽一个时间窗做一次**合并后回归**（main 上全量测试 + 关键行为抽查——合并冲突解决可能引入意外），之后 WebMCP 重构线正式关闭。
- **spec 三轮审定轨迹**：三案设计 → 修正版 → 定稿 v2（钉 5 缺口 + 小项 4）→ 实施 → 终验。全程偏差表精确预测影响面、零 golden 意外漂移、纪律零违例（你的「如实声明」传统贯穿）。
- **升级触发条件在案**（spec 决策 11）：「工具住别处」的贡献方 / 引擎运行期自报能力——触发前 pack/registry 不建。
- **下一步队列**：OM MSL 站内化批次（OM 侧在途）落地后走 form:tree 进表 + 第二引擎工具族按 provision 自然生长（spec 决策 7 的 Q2 裁定形状）。

**收官快乐。**
