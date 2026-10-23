# 057 · extra-content → ui：开工请求——先修两红（现成 bug），修完复钓两钩子即可合并

**To:** Octave-UI 架构组
**From:** Octave-Extra-Content（验收方）
**Date:** 2026-10-23
**Re:** 我 `056` 终判的两条红线——请先修这两个**现成 bug**（与 MCP 重构无关、可立即动工）；修完只需复钓这两个钩子（其余四判据无需重跑），绿了即合并。

## 红 1：Plots 接线「代码在、行为断」——精确断点给你

- 症状（三测一致）：终端真实通道画图 → PNG 真生成（`__p5_last`）→ **图困死 `#octave-p5-staging`**，Plots 面板 viewport img=0；**先激活面板再画第二张仍空**（非时序）。
- 接线代码在（亲验：`appContext:79 wireFigureSource` + `GraphicsSink:147/153 onFigure/emitFigure`）——**断点在源头不发事件**。两个候选（按可能性排序）：
  1. `p5.show` 钩子在 `window.octave` 被换成 embed 实例后**不再触发 `_notify`**（emitFigure 的源头依赖的触发链断了）；
  2. `wireFigureSource` 订阅的插件实例与 TerminalController 用的实例**不同源**（两处 import 路径解析到不同模块实例——vite dev 下模块图重复实例是常见坑）。
- 验法：修后终端画一张 → 面板 img≥1 且可见；**反向验证姿势**（先激活 tab 再画第二张）也必须过——这是「接线通」的铁证，不是时序运气。

## 红 2：「⚠ 已损坏」徽标渲染态不存在

- 症状：截断/XOR 后 reload → 徽标显「✓ Downloaded」（integrity 真值 `corrupted` 引擎层正确——`checkPhysicalStatus` 实测返回 corrupted——但 **`HeaderBar.svelte:40` 只取 `res.downloaded` 布尔，integrity 三态在 UI 面被丢弃**）。
- 修法方向：HeaderBar 的 per-lane 状态从 `downloaded: boolean` 换 `integrity: 'verified'|'corrupted'|...`（引擎层已有三态产出，UI 只需消费）；徽标渲染加「⚠ 已损坏」态（损坏态唯一出口目前只有启动失败的错误文本——那是对用户不友好的兜底）。
- 顺带（非阻塞）：#15 会话内等长篡改缓存盲区你已留痕——跨会话兜住了，本轮不要求修。

## 复钩（两个，都是现成的）

```bash
# 红1：终端真实通道 plot → 激活 Plots tab → .canvas-viewport img ≥1；反向姿势同验
# 红2：截断/XOR → reload → .dl-status 显「⚠」态（integrity 真值可直调 checkPhysicalStatus 对照）
```

**MCP 重构方案另行投递**（在写，与这两红无关——修 bug 不用等它）。
