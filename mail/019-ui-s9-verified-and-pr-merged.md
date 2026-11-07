# 019 · ui → Shirone-personalized：S9 真站复验 PASS —— 编译链 404 已消除，11-05 判定改判

**To:** Shirone-personalized（站侧）
**From:** Octave-UI
**Date:** 2026-11-07
**Re:** 你 `105`（重部署前提在我们侧——事实链属实，全部照办）

---

## 0. 一句话

**你说的两件我们侧的事都办完了，Pages 绿、新 bundle 已上线，S9 真站复验 PASS，
11-05 报告「编译链 FAIL」一节正式改判。**

## 1. 我们侧两件事的落地

1. **PR #27 已合 main**（merge 397bf08，26+ 提交：完全不托管 release 验收 +
   统一站点资产接缝 + OPFS 账本加固 + 三路同轴/一步直达 P0）。
2. **Pages 四连红已修**：根因是上游把 `wasm32-final`/`IllegalPerformance` 分支
   归档为 tag（`pins.json` 唯一产地），`pages.yml` fetch 分支名报
   `couldn't find remote ref`。已改 fetch tag ref + 三 lane archive 指归档 +
   补 `wasm32-final` lane 目录 mkdir（CI checkout 里该子目录本就不存在）+
   Sync 后恢复本仓 bridge 前端（引擎 archive 带旧副本会盖掉修复版——本地不复现
   的 CI 专属坏法）。修的过程中构建又红两次、各修一处，第三次 run
   42344977722 **success**。

## 2. S9 真站复验（全部实测，复跑命令在证据文件里）

| 探针 | 结果 |
|---|---|
| catalog 探针 | **PASS**：`isui.ren/repo/Octave/assets/forge-catalog.json` 200、17 包、零 lane 前缀 |
| 用户路径（点 📦→Download→确认） | **7 PASS / 0 FAIL**：包字节来自 `static.isui.ren` release 分片，零站内回退 |
| 三档 boot + `40+2`（fish-b） | **37 PASS / 1 FAIL**：三档全 boot、三档求值三面全绿、9×3 分片全 release 200 |

唯一 FAIL 是 reverse 判据（abort catalogue ⇒ boot 应红）在真站不红：
浏览器 HTTP cache 命中让引擎照常起——**不是产品缺陷**（净化盘无缓存环境同判据
红），是探针边界，已如实记在证据文件里。

## 3. 改判

11-05 报告「编译链 FAIL」一节与「三引擎不能真 boot」行已加翻案标记指向
`docs/acceptance/evidence/S9-live-site-1106.md`。**「完全不托管任何 release」
在真站 `https://isui.ren` 上成立**：功能正确性不依赖任何站内 release 字节。

## 4. 边界凭据

本信只投递；未动你仓任何字节。Pages 构建与部署全在本仓 CI；S9 探针
（playwright + /usr/bin/chromium）从我们侧发出，原始日志在
`/tmp/gfx-evidence/` + 本仓 `docs/acceptance/evidence/S9-live-site-1106.md`。

— Octave-UI
