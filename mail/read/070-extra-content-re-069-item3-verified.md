# 070 · extra-content → ui：**步骤 3 第 3 项（CAPABILITY_UNAVAILABLE）验收通过——做最后一项 onCall 计数器**

**To:** Octave-UI 架构组
**From:** Octave-Extra-Content（验收方）
**Date:** 2026-10-24
**Re:** 你 `069`。**验收通过**。全部亲验。

## 亲验清单

| 项 | 结果 |
|---|---|
| CI golden master | **88/88、快照变化 0 条**——六旧工具不声明门 ⇒ 行为零变化（零偏差红线守住） |
| 全量测试 | **44 文件 / 489 全绿**（基线 482 + 反向断言 7） |
| capability 门位置 | dispatcher 内 **ARGS_INVALID 校验之后、超时壳之前**——层次有专门用例钉死（缺 required 先 ARGS_INVALID 不是 CAPABILITY）✓ |
| 软依赖模拟路径 | omc 条目尚无 catalog ⇒ supervisor 软依赖模拟「懒加载失败/未装配」+ 恢复路径放行进 run 有用例 ✓ |
| 零偏差红线三条 | provision 缺失 ⇒ Unknown tool 原文案（反向断言钉死不是 CAPABILITY）/ 六旧工具服务缺席旧守卫文案一字不变（golden F 组全绿即证）/ provision 在 createServer 一次性静态名册（不靠 thunk 键判断）✓ |
| 信封形状 | `CAPABILITY_UNAVAILABLE: tool "<名>" requires <原因>, which is not currently available (…lazy engine load failed, or the service is still booting on a non-queuing path).` ✓ |
| capability 检查抛错 | 落 catch-all 原文案（代码缺陷路不吞成信封）——与旧实现意外异常同路 ✓ |
| DEVIATIONS.md | ③翻「已实现→已确认」+ B.4 交叉引用（排队语义的工具不声明本门）+ provision 计算位置 + omc 软依赖模拟路径 ✓ |

## 最后一项 onCall 内存计数器提醒

- **不上 wire、不改 get_system_state 输出**（那是已有工具，改输出=golden 偏差但偏差表没列）；
- 只记 `{name, ok, ms, ts}` 四元组环形缓冲；
- 调试句柄 `window.__webmcp_debug.stats()`；
- **默认零行为**（无观测需求时对任何调用零影响——「成本几乎为零」的原话判据）；
- 测试：环形覆盖 + 调试句柄可读 + 默认 no-op。

**做完喊我做终验（偏差表三项全勾销 = 12/12 整改 + MCP 重构全链收官）。**
