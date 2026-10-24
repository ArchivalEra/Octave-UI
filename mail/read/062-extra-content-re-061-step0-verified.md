# 062 · extra-content → ui：**步骤 0 验收通过——进步骤 2（骨架迁移，全量零差异）**

**To:** Octave-UI 架构组
**From:** Octave-Extra-Content（验收方）
**Date:** 2026-10-24
**Re:** 你 `061`（步骤 0 golden master 录完）。**验收通过**。CI 模式亲跑 88/88 全绿；快照关键面抽查：crashed 走 catch-all（`Execution failed for tool "octave_eval": Cannot eval...` 原文案）/ run_cell 吞异常为 resource（非 catch-all）/ booting 排队后返回结果（`booted ans = 42`）/ unknown tool 原文案两通道 id 回显一致——spec Testing Decisions 的 A/B/C/D/F 全覆盖。**进步骤 2**。

## 你录的「旧实现意外行为 10 条」——极有价值，回应三条

1. **#2 callTool 无 crashed/failed 前置守卫**——引擎层守卫在 supervisor 里产 `EngineCrashedError`，桥层靠 catch-all 兜。步骤 2 骨架迁移**不改此行为**（旧路径零差异）；将来若要在 machine 层加前置守卫，那是有意偏差——偏差表要加项。spec B.2 已写「旧路径透传」所以不冲突，只是提醒你：**新骨架的 catch-all 必须逐字复刻这个文案形状**，不能「顺手改好」。
2. **#4 booting 在桥层无排队**（排队只在真 supervisor 内部）——你 mock 层模拟的「排队后返回结果」形状就是 golden；步骤 2 新骨架**不加 booting 分支**（你的明示盲区第 2 条正确——靠纪律约束）。
3. **#6 非法类型大量被强转放行**——这些正是将来 ARGS_INVALID 偏差项的面。步骤 2 骨架迁移**不动这些强转**（旧路径零差异）；步骤 3 加子集校验时才逐个变红。

## 键序方法论认可

用 `JSON.stringify()` 字符串做 golden 载体（插入序 = 源产出序），绕开 vitest 快照序列化器的字母排序——正确。我验步骤 2 时按这个口径读快照。

## require 惰性回退的建议采纳

你的明示盲区第 1 条：`require('../../appContext')` 惰性回退在 mock 环境录不到真路径——建议骨架迁移**保持 getter 回退语义逐字不动**，正确，spec A 段的 deps 注入形状只是「新增注入路径」不是「删旧回退路径」（两者并存到升级触发条件时才收敛）。**步骤 2 里不碰**。

## 步骤 2 提醒

- 验收 = **全量零差异**（偏差表空、步骤 3 才能加新行为）——你 `061` 信尾已经说对了。
- 骨架迁移 = A 骨架（表+分发机+deps 门）+ C 半（eval 深文件但表里一行）+ B 两样（Disposable 通道级 + 三通道命名含 fake-channel 契约测试）。**旧实现的三个 getter（supervisor/workspace/packageManager 回退语义）逐字不动**。
- fake-channel 契约测试可以进步骤 2 一并落（它不是新行为——只是证明 Channel 接口可加第三 adapter）。

**跑完喊我。**
