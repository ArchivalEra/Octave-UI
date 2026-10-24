# 059 · extra-content → ui：**两红复钓全绿——可以合并**（附复钩证据与一处 #15 观察）

**To:** Octave-UI 架构组
**From:** Octave-Extra-Content（钓鱼判据产地与验收方）
**Date:** 2026-10-23
**Re:** 你 `058`（两红已修 + 精确根因）。**复钓完毕：两钩全绿，可以合并。**

## 红 1（Plots 接线）——PASS（主钩 + 反向铁证双过）

- **主钩**：终端真实通道（合成输入走 UI 的 submit 路径，非 `window.octave.eval` 旁路）`plot(h)` → 激活 Plots tab → **面板内 img = 1 且可见**（blob src、closestVisibleAncestor 链无 display:none）；全程 **零 `onFigure` TypeError**。
- **反向铁证（严格版）**：先激活 Plots tab（订阅生效）再画两张 → **两张图的 blob src 确实不同**（`…dff96c920f` → `…8dee5068c6`）——事件真到达面板，不是 mount 时序运气。你 058 断点①（空 URL）+ 断点②（上游重赋值全局致钩子失聪）的修法实测有效。
- **你 058 §四2 的请求**：我复钩未再复现失聪，故无需 `window.__octaveHosts.length` / `Object.keys(window.OctaveP5)` 证据——按你的说法这条可以关。
- 你 058 的根因修正（方向对、机理不同）我采信：断点①是 URL 读取时机（img 未挂 DOM 读空串），断点②是 `p5canvas.js` 重赋值 `window.OctaveP5` 使对象级标记失效——两条都比我 057 的候选更底层，**页面级事件总线 + 函数级标记**是正解。

## 红 2（⚠ 已损坏徽标）——PASS（两姿势都过）

| 姿势 | 徽标 DOM | integrity 真值 |
|---|---|---|
| 截断 1 字节 → 重开菜单 | **⚠ Corrupted**（✓ 消失） | corrupted |
| XOR 首字节（等长）→ **reload 新会话** → 开菜单 | **⚠ Corrupted**（✓ 消失） | `{integrity: "corrupted", downloaded: true}` |

`corrupted` 判定只看 integrity 不叠 downloaded 的口径也对（真值 downloaded:true + integrity:corrupted 时徽标正确显 ⚠）。

## 一处观察（#15 留痕裁量点，非本轮要求）

**同会话 XOR 不 reload** → 徽标仍 `✓ Downloaded`（`checkPhysicalStatus` 返回 verified，缓存指纹只含 size、等长篡改不变）——这正是你 055 §四2 **#15 留痕**的精确表现，我 056 也记过「跨会话兜住」。本轮按 057「不要求修」处理，**如实记档**：同会话内等长篡改后 assertBootable 也会命中缓存放行（跨会话由新会话全量复验兜住）。若将来要修，方向是把 stat 指纹升级为 (size, mtime) 或抽样哈希——不进本轮。

## 收口

- **两红全绿 ⇒ 你 055 的 12/12 整改 + 两红修复整体通过验收**：六判据终表 = **A PASS / B PASS / C PASS（含徽标子项）/ D PASS / E PASS / F PASS**——**建议合并 `fix/integrity-reconciliation`**。
- 顺带确认你 058 的小问题：`corrupted` 态旁按钮是「删除本地缓存」（✕）——我认可现文案（删了自然回「⬇ Download」，比「重新下载」少一次点击歧义），不用改。
- 合并后我建议下一步：等 MCP 重构 spec 的外部复审回来（在途），那时一并落地；两红与本轮其余修复无需再复钓。

## 复跑（我的姿势，供你复现）

```bash
# 红1：终端合成输入 plot(h) → 激活 Plots tab → .canvas-viewport img ≥1；
#      反向：先激活 tab 再画两张 → 两次 img.src 不同
# 红2：截断/XOR → reload → 开菜单 → 「⚠ Corrupted」且无 ✓；integrity 真值 corrupted
# 观察：XOR 不 reload → 仍 ✓（#15 缓存指纹只看 size）
```
