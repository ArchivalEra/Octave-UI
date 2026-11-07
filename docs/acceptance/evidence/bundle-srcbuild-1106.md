# 从源码构建的 bundle 真浏览器验收（2026-11-07）

> 直接回答「从源码构建从来没有跑通」：线上 `bundle.js` 是**旧源码**拼的
> （`deploy-contract.mjs adapt` 由 CI 每次部署执行；修复进仓后站侧未重部署）。
> 本证据用**当前源码**完整走 `npm run build` → `deploy-contract.mjs adapt` →
> 真浏览器，证明构建产物本身是通的。
>
> 复跑：`node scripts/deploy-contract.mjs adapt` 后
> `node probe-bridge-catalog-1106.mjs http://localhost:8910/repo/Octave/`
> `node probe-user-install-1106.mjs http://localhost:8910/repo/Octave/`
> （8910 服务 `dist` 的净化副本：bundle 版 index.html + 修复后 bridge）
>
> 结果：BRIDGE_CATALOG **PASS**（站点根 200 / 17 包 / 零 lane 404）＋
> 用户路径 **7 PASS / 0 FAIL**（点 [data-action=download] → release 分片 200、
> 零站内 assets/forge/ 回退）。
>
> 线上 404 的唯一消法 = 站侧重部署（spec S9，Out of Scope）。

```
RESULT={"catalog":{"ok":true,"packs":17},"unknown":"covered-by-unit-test","hasResolver":true}
REQS=["HTTP200 /repo/Octave/assets/forge-catalog.json"]
PASS 站点根 200 = true | PASS 零 lane 404 = true
PASS catalog ok = true | PASS 对账面未被验收碰 = true
=== BRIDGE_CATALOG: PASS ===

```

### 用户路径

```
PASS | 同类肯定：菜单与 📦 入口都点到了 :: {"opened":{"ok":true},"pkg":{"ok":true}}
PASS | 点到了 [data-action="download"] 卡片 :: {"ok":true,"name":"cgi"}
PASS | 点到了 [data-action="confirm-download"] 确认 :: {"confirmed":true}
SEEN=["200 /repo/Octave/assets/forge-catalog.json @localhost:8910","200 /ArchivalEra/Octave-Extra-Content/releases/download/forge-cgi-0.1.2/forge__cgi-0.1.2.tar.gz.identity.000 @static.isui.ren"]
PASS | S6：forge-catalog.json 从站点根 200 :: ["200 /repo/Octave/assets/forge-catalog.json @localhost:8910"]
PASS | S6 反向：零 lane 前缀 catalog 请求 :: []
PASS | S7：包字节来自 catalogue release 分片 200（不托管 release） :: ["200 /ArchivalEra/Octave-Extra-Content/releases/download/forge-cgi-0.1.2/forge__cgi-0.1.2.tar.gz.identity.000 @static.isui.ren"]
PASS | S7 反向：零站内 assets/forge/ 回退 :: []
=== 用户路径验收: 7 PASS / 0 FAIL ===

```
