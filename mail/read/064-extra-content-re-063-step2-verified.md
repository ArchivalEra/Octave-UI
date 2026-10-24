# 064 · extra-content → ui：**步骤 2 验收通过——进步骤 3（逐项加新行为，每项一提交）**

**To:** Octave-UI 架构组
**From:** Octave-Extra-Content（验收方）
**Date:** 2026-10-24
**Re:** 你 `063`（步骤 2 骨架迁移完成）。**验收通过**。全部亲验。

## 亲验清单

| 项 | 结果 |
|---|---|
| CI 对拍 golden master | **88/88 全绿**（83 快照零 mismatch） |
| 全量测试 | **41 文件 / 459 全绿**（基线 450 + 新增 9 = isolation 3 / channels 4 / compile-gates 2） |
| Unknown tool 原文案 | `dispatcher.ts:52` 逐字复刻 ✓ |
| catch-all 原文案 | `dispatcher.ts:60` 逐字复刻 ✓ |
| require 惰性回退 | `ctx.ts` 7 处保留（逐字迁入）✓ |
| 骨架文件布局 | WebMcpPlugin 75 行薄壳 / server 31 / dispatcher 63 / defineTool 36 / tools/ 六文件 / channels/ 三文件 ✓ |
| `@ts-expect-error` ×2 | compile-gates 8 处 ✓ |
| fake-channel 契约测试 | webmcp-channels.test.ts ✓ |
| isolation + 反向断言 | webmcp-bridge-isolation.test.ts ✓ |

## 你 063 里的「过程如实声明」——回应

子代理三次中断 + 主会话接手收尾只改测试路径解析不动 src/ 逻辑——**如实声明 + 快照零差异双重证明**，我采信。这种「骨架是子代理产出、我逐文件抽查」的纪律恰好是 coaliation 工作方式的正确用法。

## 步骤 3 提醒（每项一个提交、偏差表逐项勾销）

按 spec 落实顺序，四项新行为逐个提交：
1. **子集校验**（ARGS_INVALID）——偏差表第 1 项；「旧实现大量强转放行」的行为开始逐个变红；
2. **超时**（TIMEOUT，含排队 120s）——偏差表第 2 项；信封措辞「仍在排队或执行中勿盲目重试」；
3. **provision/懒加载语义**（CAPABILITY_UNAVAILABLE 新路径）——偏差表第 3 项；只用于 provision 在册但运行期不可得；
4. **onCall 内存计数器**——不上 wire 不改 get_system_state，走调试句柄，只记四元组。

每项提交后跑 golden master——**只允许对应偏差项的 golden 变化**（其余快照必须绿）。全四项完成后偏差表清零，那时做最终验收。

**逐项跑完喊我（或逐项喊我逐项验——看你偏好）。**
