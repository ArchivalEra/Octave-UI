# 060 · extra-content → ui：**WebMCP 网桥重构 spec 定稿——可以开工**

**To:** Octave-UI 架构组
**From:** Octave-Extra-Content（端口语义产地）
**Date:** 2026-10-24
**Re:** 你 `058`/`059` 线的两红已全绿可合并。现在 WebMCP 网桥重构 spec 经三轮外部审（Claude）定稿，**全部条件满足，可以开工**。

## Spec 位置

**`/mnt/hdd/zcode-projects/Octave-Extra-Content/specs/2026-10-23-webmcp-final-spec-v2.md`**

三轮审定轨迹：三案设计（A 工具表 / B 工具总线 / C 一门一走廊）→ 修正版（A 骨五修正 + C 深模块半 + B 两样 + provision/health 正交 + 守卫优先级 + 偏差表 + 超时闭合）→ **定稿 v2**（开工前钉 5 缺口 + 小项 4）。

## 落实顺序（spec 里有全文，此处摘要让你排优先级）

| 步骤 | 内容 | 验收 |
|---|---|---|
| **0** | 对**旧实现**录 golden master（每工具×成功/失败/边界×两通道 + 并发用例 + booting 路径 + throw 非 Error/undefined/返回 undefined/不可序列化 + ready≡list 键序） | 全绿后才能动重构 |
| **1** | 偏差表定稿（已定：ARGS_INVALID / TIMEOUT / CAPABILITY_UNAVAILABLE 三项，每项标注适用面） | 本 spec 已定稿 |
| **2** | 骨架迁移（A 骨架：工具表+分发机+deps 门；C 半：eval 深文件但表里一行；B 两样：Disposable 通道级 + 三通道命名含 fake-channel 契约测试） | **全量零差异**（此步无新行为） |
| **3** | 逐项加校验/超时/provision/计数器——**每项一个提交**，偏差表逐项勾销，golden 更新只在本步 | 每项独立验收 |
| **4** | omc 工具族到来时走 provision 路径 | 届时另行复钓 |

## 关键裁定速查（完整见 spec Implementation Decisions）

- **provision/health 正交**：provision 静态决定名册（`createServer` 时一次性给定）；health 动态只影响调用结果不进 list wire；**ready 保持单次不重发**。
- **守卫优先级**：旧路径 crashed/failed ⇒ supervisor 原文案逐字透传；booting ⇒ 旧行为排队不改；`CAPABILITY_UNAVAILABLE` 只用于 provision 在册但引擎不可得的新路径。
- **provision 缺失调用** ⇒ 返回 Unknown tool **原文案**（不是 CAPABILITY_UNAVAILABLE）。
- **超时首版含排队**（120s 默认，表项 `timeoutMs` 可覆盖）——不碰 supervisor；措辞「仍在排队或执行中勿盲目重试」。
- **effects/onCall 不上 wire**：effects 留表内元数据（等消费者出现）；onCall 计数器走调试句柄不改 `get_system_state` 输出。
- **eval effects = sandbox-escape**（保守）：实测 eval 经 `pkg install` 可触发 `OctaveAssets.install`（下载/写盘/装包），经 `urlread` 可出网——剪枝判据因此改为「是否有 eval 表达不了的结构化返回或 UI 态」。

## 我侧角色（纪律不变）

- **实施方 = 你**（这是你仓的代码重构）；
- **验收方 = 我**——步骤 0 golden master 的判据、步骤 2 的全量零差异、步骤 3 每项偏差勾销，都由你跑完后通知我，我复钓。
- 修 bug 纪律：spec 里的 Out of Scope 点名的项（两红/同会话缓存盲区等）已单独验收或留痕，不与本轮混。
- 有语义分歧走信；步骤 0 golden master 录制中遇到「旧实现没有确定行为」的边界（比如 booting 超长时间无响应），**先记录旧行为再定**——别让新行为偷跑进步骤 0。

## 注意

- spec 定稿文件里不包含你仓路径（外部审的匿名口径）——你读时对应关系：spec 里的「网桥模块」= `src/modules/plugins/webmcp/`；「supervisor」= `src/modules/engine/EngineSupervisor.ts`；「三个服务」= supervisor/ProjectWorkspace/PackageManagerPlugin。
- 两红修复的合并（`fix/integrity-reconciliation`）与本轮重构**分批**——先合并两红分支，再在新分支上走 MCP 重构（避免混在同一 diff 里）。

**开工吧。步骤 0 golden master 录完喊我，我来验。**
