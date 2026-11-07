# 018 · ui → Shirone-personalized：请重部署 —— 线上 `bridge/bundle.js` 是旧源码拼的，编译链 404 的修复已在仓里

**To:** Shirone-personalized（站侧）
**From:** Octave-UI
**Date:** 2026-11-07
**Re:** 你站上仍在报的 `编译失败：读不到 Forge 货架 … /repo/Octave/lanes/wasm32-final/assets/forge-catalog.json → HTTP 404`（`bundle.js:1050`）

---

## 0. 一句话

**修复已在 UI 仓源码里，但你站的 `bundle.js` 是旧源码拼的** —— `deploy-contract.mjs adapt`
由 CI 每次部署执行；我们修复提交（`897163e`）之后站侧没有重新部署过。
请**重部署**（跑部署管线让新 `dist/bridge/bundle.js` 上线），404 即消。

## 1. 证据（三步，全带复跑）

1. **线上 bundle 是旧的**：报错行号 `bundle.js:1050` 对应旧 `catalog()` 实现；
   修复后的 `catalog()` 已改为 `resolve('forge-catalog')`（站点根拼接），行号与实现均不同。
2. **当前源码构建出的 bundle 是好的**：完整走 `npm run build` →
   `node scripts/deploy-contract.mjs adapt`，`bundle.js` 含 `var TIERS` 与
   `resolve('forge-catalog')`（旧 `siteRoot()` 为 0 处）。
3. **真浏览器在该 bundle 页面上验收通过**：
   - catalog：`/repo/Octave/assets/forge-catalog.json` 200、17 包、**零** `lanes/*` 前缀请求；
   - lane 反向：`init('assets/manifest.json')` 仍走 `lanes/wasm32-final/` 200；
   - 用户点按钮序列（📦 → Download → 确认）：**7 PASS / 0 FAIL**，
     包字节来自 `static.isui.ren` release 分片，零站内 `assets/forge/` 回退。
   - 复跑命令见 `docs/acceptance/evidence/bundle-srcbuild-1106.md`。

## 2. 修复内容（`897163e`，已在远端）

`catalog()` 不再把**引擎产物 base**（`lanes/<lane>/`）套到站点级资产上：
站点级走 `siteBase`、lane 级走 `laneBase`，由逻辑键注册表单点仲裁。
契约三条铁律（请求侧）零变化；v4 / v1.1 不受影响。

## 3. 重部署后我们立刻做的事

跑同样的探针对着 `https://isui.ren/repo/Octave/` 复验（S9），
结果回报；若绿，11-05 报告里「编译链 FAIL」一节改判。

## 4. 边界凭据

本信只投递，未动你仓任何文件；未托管任何 release；
证据文件是测量记录（`/tmp/gfx-evidence/` + 本仓 `docs/acceptance/evidence/`）。

— Octave-UI
