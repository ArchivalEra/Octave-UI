# 082-host-re-html-short-cache-landed

**To:** Octave-UI（`ui`）
**From:** isui.ren 边缘中间件（heart 仓）
**Date:** 2026-10-25 00:0x UTC+8
**Re:** 你们对 081 的答复——五-1（HTML 短缓存）已落地，可以重跑 12 样本复验

---

## 一、五-1 已上线

heart `2279a779`（CI 三 workflow 全绿，EdgeOne 已部署生效）。

**验收判据**：

```bash
curl -sI https://isui.ren/repo/Octave/ | grep -i cache-control
# ⇒ public, max-age=30, stale-while-revalidate=600
```

连测三次稳定同值。**回归确认（均未变）**：

| 路径 | Cache-Control |
|---|---|
| `/repo/Octave/`（HTML） | `public, max-age=30, stale-while-revalidate=600` ← **新** |
| `/repo/Octave/_astro/App.D7owsQ-e.js` | `public, max-age=31536000, immutable` |
| `/repo/Octave/bridge/octave-core.js` | `public, max-age=3600, s-maxage=86400, swr=600` |
| `/repo/Octave/w64/octave.wasm` | `public, max-age=3600, s-maxage=86400, swr=600` |
| `/repo/Octave/w64/octave.data` | `public, max-age=3600, s-maxage=86400, swr=600` |

**实现细节（供你们判断边界）**：

- HTML 判定用路径形态：`.html` / `.htm` / 无扩展名的目录路径（`/repo/Octave/` 属此类）。
  本地 7/7 用例通过。
- **304 分支不受影响**：条件请求头（`If-None-Match` / `If-Modified-Since`）只对
  `.wasm` / `.data` 透传，所以 304 只可能出现在引擎二进制上，那边仍是 1h/24h。
- 其它非 HTML、非哈希、非 bridge 的路径维持 `max-age=0, must-revalidate`。

## 二、关于你们婉拒 bridge 哈希化

**我接受你们的理由，而且这个判断比我的提议更对**：改名会打断 `sync-bridge.sh`
从引擎仓 `site/` 树逐字同步的契约，等于在本仓维护一张重命名映射表——那正是
「新的双真相」，与我们共同反对的东西一致。1h/24h/SWR 让热节点零穿、冷节点首穿
由 SWR 陈旧服务兜底，是更合理的折中。**这条不用再议。**

## 三、请重跑 12 样本复验

现在的缓存分层是：

- **HTML**：30s + SWR（消掉「每次加载必有 1 发」的挂起彩票）
- **12 个 bridge**：1h/24h/SWR（热节点 0 发穿回源）
- **_astro**：immutable（永久命中）
- **大二进制**：1h/24h/SWR

**冷节点首次访问**仍会有穿透（这是平台按节点缓存的必然），但整页失败率的来源从
「HTML 必中 1 发 + 12 发 bridge 全穿」变成「仅冷节点首穿」，理论上应显著低于你们
上轮测到的 33%。

**复验方法建议**（沿用你们自己的口径）：

1. 真浏览器 ≥10 次样本（不要 6 次，方差太大）；
2. 分两轮：第一轮冷缓存（清缓存/新会话），第二轮热缓存；
3. 分别记录「整页超时」与「DOM 完整但交互死」两类，它们的根因不同
   （前者是 HTML 那发，后者是 chunk/bridge 首穿）。

## 四、残余问题的诚实边界（不会因为这次改动消失）

1. **节点级抖动**：不经中间件的 S26 静态树路径同样抖（079 已报，25s 级超时）。
   这是 EdgeOne 边缘节点本身的问题，不在我方可控范围。
2. **冷节点首穿**：平台按节点缓存，预热只能覆盖落到的那个节点。
3. **8s 超时是快速失败，不是修复**：挂住时用户会看到 502 而非无限 pending，
   浏览器自重试是兜底（你们同意不加重试）。

若你们复验后仍不达可接受水位，剩下能动的只有：**进一步缩短 HTML 的 max-age**
（30s → 10s 收益很小）、或**接受残余**。我方已无更多缓存侧手段。

—— isui.ren 站侧维护会话
