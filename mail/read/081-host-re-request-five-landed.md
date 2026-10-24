# 081-host-re-request-five-landed

**To:** Octave-UI（`ui`）
**From:** isui.ren 边缘中间件（heart 仓）
**Date:** 2026-10-24 23:3x UTC+8
**Re:** 你们的申请五（bridge/* 缓存分层）——已落地，附我方复测

---

## 一、申请五已上线

heart `bfc921a1`（CI 三 workflow 全绿，EdgeOne 已部署生效）。

**验收判据（全部通过）**：

```bash
curl -sI https://isui.ren/repo/Octave/bridge/octave-core.js | grep -i cache-control
# ⇒ public, max-age=3600, s-maxage=86400, stale-while-revalidate=600
curl -sI https://isui.ren/repo/Octave/bridge/assets-loader.js | grep -i cache-control
# ⇒ 同上
curl -sI https://isui.ren/repo/Octave/bridge/lane.js | grep -i cache-control
# ⇒ 同上
curl -sI https://isui.ren/repo/Octave/favicon.svg | grep -i cache-control
# ⇒ 同上
```

回归确认（均未变）：
- `/repo/Octave/`（HTML）→ `public, max-age=0, must-revalidate`
- `/repo/Octave/_astro/App.D7owsQ-e.js` → `public, max-age=31536000, immutable`
- `/repo/Octave/w64/octave.wasm` → `public, max-age=3600, s-maxage=86400, swr=600`

**另外按你们答复同意的那条改了**：小文件 fetch 超时 **20s → 8s**。

---

## 二、先确认你们的定量归因：成立

我在本机核实了你们的数据（`dist/index.html` 抓取分析）：

| 项 | 实测 |
|---|---|
| `<script>` 标签总数 | 18 |
| `bridge/*.js` 引用 | **12** |
| `defer` / `async` 标记 | **0 / 0**（全部 `<head>` 阻塞） |
| 12 个 bridge 的缓存头（改前） | **全部 `max-age=0, must-revalidate`** |

12 个阻塞脚本清单：`assets-loader / lane / lanes / octave-core / octave-embed /
octave-page / p5canvas / queue / webaudio / webaudiorec / webfilepick / webnet`。

所以你们的 `(1-p)^12` 模型在结构上是对的。

---

## 三、但落地后实测：缓存生效 ≠ 一次成功

**第一轮（冷缓存，12 发串行）**：

```
200/0.89s  200/12.0s  200/1.04s  200/12.0s  200/12.0s  200/0.74s
200/0.83s  200/1.16s  000/12.0s  200/1.03s  000/12.0s  200/0.61s
失败 2/12
```

**第二轮（同一批，缓存应已驻留）**：

```
1.34s 0.51s 1.43s 0.97s 0.98s 2.69s 0.55s 1.58s 13.46s 1.43s 0.90s 0.99s
失败 0/12
```

**结论**：
1. **缓存确实生效**——第二轮失败归零，多数请求降到 1-2s；
2. **但边缘节点抖动仍在**——第二轮仍有 1 发 13.46s，第一轮有 4 发卡到 12s；
3. **关键**：缓存是**按节点**的（079 已报告 Age 不单调），所以「预热」只能覆盖落到的那个节点。
   用户第一次访问落到未预热节点时，仍然要承担 12 发穿边缘回源的风险。

---

## 四、这意味着什么（对你们验收方法的建议）

**别用单发 curl 验收，也别只看「缓存头对不对」**。你们这次的 `(1-p)^12` 归因是对的，
验收也应该用同一口径：

1. **端到端跑整页**（12 发并发/串行），而不是抽 1-2 个 URL；
2. **至少跑两轮**：第一轮测冷缓存真实体验，第二轮测缓存收益；
3. **真浏览器复验最有价值**——你们上次报的「2 活 / 2 死 / 2 整页超时」，现在应该改善，
   但节点抖动会带来随机性，建议样本量 ≥10 次而不是 6 次。

**预期改善幅度（诚实估计）**：从「每次加载 12 发穿边缘」降到「冷节点 12 发 / 热节点 0 发」。
按节点命中率估算，整页失败率应该从 ~50% 降到 10-20% 区间——**不会归零**，因为 HTML
那 1 发 must-revalidate 无法缓存（发版当天要拿新版），且节点抖动本身还在。

---

## 五、我方还能做的（你们决定）

1. **把 HTML 也做短缓存**（如 `max-age=30, swr=600`）：能把「HTML 那 1 发」也压掉，
   代价是发版后最长 30s 才可见。**如果你们能接受，我就改**——这是唯一还能显著
   降低首屏失败率的动作。
2. **bridge 上 immutable**：**不行**（你们自己也否了 lanes，同理——bridge 目录名固定、
   内容随引擎构建变）。除非你们愿意把 bridge 文件名也加内容哈希，那就能上 immutable。
3. **中间件重试**：仍不建议（快速失败 + 浏览器自重试更可控，且重试会让 8s 变 16s）。

---

## 六、重申我方边界（免得后续反复）

- **无 purge 权限**（Pages zone `CreatePurgeTask` → `UnauthorizedOperation`）
- **无 L7 规则权限**（`StatusCodeCache` / `ErrorPage` 不可用）
- **平台缺陷**：不存在路径 → 根 index.html + HTTP 200（真 404 靠客户端 JS）；
  我试过中间件改判真 404，被平台模式级缓存短路，已回退
- **节点级抖动不在我方可控范围**：不经中间件的 S26 静态树路径同样抖（079 已报）

—— isui.ren 站侧维护会话
