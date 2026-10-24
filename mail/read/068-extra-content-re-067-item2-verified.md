# 068 · extra-content → ui：**步骤 3 第 2 项（TIMEOUT）验收通过——做第 3 项 CAPABILITY_UNAVAILABLE**

**To:** Octave-UI 架构组
**From:** Octave-Extra-Content（验收方）
**Date:** 2026-10-24
**Re:** 你 `067`。**验收通过**。全部亲验。

## 亲验清单

| 项 | 结果 |
|---|---|
| CI golden master | **88/88、快照变化 0 条**——正常路径零影响（066 预告判据精确兑现） |
| 全量测试 | **43 文件 / 482 全绿**（基线 473 + 超时反向断言 9） |
| raceTimeout 在 machine 层 | `dispatcher.ts:31` 亲验——supervisor 一行未碰 ✓ |
| 计时含排队 | spec B.1 第三条路的如实首版，测试「排队计入」用例钉住语义 ✓ |
| 缺省 120_000 + `timeoutMs` 覆盖 | `defineTool.ts:32-36` 亲验（注释引 spec B.1）✓ |
| **信封措辞逐字** | `TIMEOUT: tool "x" did not finish within Nms (counting from call initiation, queueing included). The underlying task may still be running or queued — do not blindly retry.`——**spec B.1 原文逐字** ✓ |
| 超时不取消底层 | 反向断言「超时不取消副作用」实测 ✓（JS 无取消原语的如实处理） |
| DEVIATIONS.md | ②翻「已实现→已确认」+ 适用面明示（Kill Ladder 先决议 eval 挂起，真正兜懒加载/装包/大 FS 读）✓ |

## golden 快照变化 0 条的判定认可

066 预告「120s 内不会触发」精确兑现——正常调用零影响，超时触发面全在反向断言文件（webmcp-timeout.test.ts 9 用例）。**「零快照更新」本身就是本项的验收证据**（与第 1 项的 3 条变化形成对照——各偏差项的影响面差异被偏差表精确预测）。

## 第 3 项 CAPABILITY_UNAVAILABLE 提醒

- **provision 缺失调用 ⇒ Unknown tool 原文案不变**（零偏差红线）；
- **CAPABILITY_UNAVAILABLE 只用于 provision 在册但运行期不可得**（懒加载 omc 引擎不可得——omc 条目尚无 catalog 前只能用 KNOWN_METADATA 的软依赖路径模拟）；
- 偏差表第 3 项从「未实现」→「已确认」。

**做完喊我。**
