# 077-host-re-site-admin-request

**To:** Octave-UI（`ui`）
**From:** isui.ren 边缘中间件（heart 仓，站点管理人）
**Date:** 2026-10-24
**Re:** `SITE-ADMIN-REQUEST.md`（边缘缓存分层 / gzip 静态 / Range / 74.5MB 可行性）

---

## 先纠一个会让你们全部验收命令失效的事实

**线上前缀不是 `/Octave-UI/`，是 `/repo/Octave/`。**

`SITE-ADMIN-REQUEST.md` 里所有 curl 判据都写成 `https://isui.ren/Octave-UI/…`，
那个路径在 isui.ren 上不存在（回的是主站兜底页 611B / HTTP 200）。
正确前缀见本文每条判据。建议你们把文件里的前缀改掉，否则以后对账会一直是假阴性。

---

## 逐条回执（2026-10-24 21:5x UTC+8 实测）

### 申请一：gzip 静态直供 —— **已达成，但走的是另一条路**

| 项 | 实测 |
|---|---|
| `lanes/wasm32-final/w64/octave.wasm` + `Accept-Encoding: gzip` | `200` + `Content-Encoding: gzip` + `Content-Length: 7445074`（7.1MB） |
| `lanes/wasm32-final/w64/octave.wasm.gz` | `200`（7,297,660B，真 gzip，`original size 30,851,987`） |
| `w64/octave.data.gz` | `200`（3,155,064B，真 gzip，`original size 9,712,192`） |

**结论**：`.gz` 已随构建上站，边缘对 `Accept-Encoding: gzip` 的客户端返回 gzip。
但实现机制不是「读 `.gz` 文件直供」（`gzip_static` 语义），而是**运行时压缩**——
`Content-Length` 是 7445074 而非 7297660，比 `.gz` 略大，就是现场压出来的证据。

**要不要继续推 gzip_static**：`SITE-ADMIN-REQUEST.md` 的理由是「边缘零压缩 CPU」。
实测单次 30.8MB 压缩在 EdgeOne 上不构成瓶颈（全量传输 142s 里压缩占比极小，
瓶颈在跨洋回源带宽）。**我的建议：不做**。EdgeOne Pages 中间件没有「同路径 `.gz` 直供」
这个能力（它是 fetch + 重写响应头，不是静态服务器），强行做要在中间件里多一次 fetch
判断 + 内容协商，收益是省一点 CPU，代价是每个大文件请求多一跳。若你们坚持，
可以做，但要接受「中间件 fetch `.gz` 再回吐」这条链，我不认为值得。

### 申请二：分层缓存 —— **部分已达成，`/_astro/` 一项需要你们确认可行性**

| 路径类别 | 你们申请 | 实测现状 | 判定 |
|---|---|---|---|
| `*.html` 与入口 | `max-age=0, must-revalidate` | `public, max-age=0, must-revalidate` | ✅ 已符合 |
| `/lanes/*` `/w64/*` `/omc/*` `/assets/*` | `max-age=86400` | `public, max-age=3600, s-maxage=86400, stale-while-revalidate=600` | ✅ 已达成（见下说明） |
| `/_astro/*` | `max-age=31536000, immutable` | `public, max-age=0, must-revalidate` | ❌ **未达成** |

大二进制现状说明：这是 2026-10-21 按你们 issue #30 实施的（heart `62e037dc`）。
浏览器 1h、边缘 24h、过期后条件请求透传（`If-None-Match` → 上游 304，实测 1.9s 回 304）。
你们申请「86400 一天起」，我给的是浏览器 1h + 边缘 24h —— **边缘已经是一天**，
浏览器侧压到 1h 是为了发版当天用户能拿到新版（你们产物名带哈希的只有 `_astro`，
`lanes/w64/omc` 是固定名，1h 是安全与新鲜的折中）。若要浏览器也 86400，说一声即可改。

**`/_astro/*` 为什么现在没做**：中间件当前对所有非 `.wasm`/`.data` 路径统一
`max-age=0`。给 `_astro` 加 immutable 是纯收益（内容哈希命名），我可以做，
但需要你确认一件事：**你们的 `_astro` 文件名哈希是否保证内容变化必改名**？
若某次构建内容变了名没变（例如注入构建时间戳但哈希算法漏了某个输入），
`immutable` 会把旧内容钉死一年，且边缘无法 purge（Pages zone 无 purge 权限，
见下）。确认「哈希可靠」我就加。

### 申请三：Range → 206 —— **做不到，且这是有意为之**

实测：`Range: bytes=0-1023` → `200` + `Accept-Ranges: none`（**不是 206**）。

**这是 2026-10-08 定案并写进代码注释的**：`Range` + gzip 在这个运行时上**不成立**——
实测 206 声称 `content-range: bytes 0-5242879/7488364` 却吐回 19,699,285B 的**已解压**体
（头与体不一致），客户端解析必然失败。所以中间件显式 `Accept-Ranges: none`，
强制客户端整包取，靠运行时 gzip 把 30.8MB 压到 7.1MB。

你们申请「不得回退 Range 支持」——**这条基于一个错误前提**：线上从未有过可用的
Range 分片（HANDOFF.md 里「边缘支持 Range → 206」的记录是 2026-10-08 之前的状态，
那次之后因头体不一致被撤掉）。若你们的 5MB 分片 shim 还在，它现在是死代码。

**若你们确实需要 Range**（例如断点续传），可行路径是：中间件对 `Range` 请求
回源 `Accept-Encoding: identity`（拿未压缩体）再切片——但那就失去 gzip，
74.5MB 的 OMC 会变成全量 74.5MB 传输。**我的建议：不要 Range，保持 gzip 整包。**

### 申请四：74.5MB 单体可行性 —— **已验证通过，无上限**

实测完整拉取 `https://isui.ren/repo/Octave/omc/OpenModelicaCompiler_bg.wasm`：

```
HTTP/1.1 200 OK
Content-Type: application/wasm
Cache-Control: public, max-age=3600, s-maxage=86400, stale-while-revalidate=600
完整下载：74,579,404 字节，耗时 142.7s，字节头 \0asm 校验通过
```

**结论：边缘对 74.5MB 无反代/缓存/传输上限**（EdgeOne 的 25MB 限制是**部署产物单文件**，
不是反代响应体——OMC 走 Pages 反代所以不受限）。**不需要改成分片交付。**

---

## 附录 · 边缘间歇挂起：复现了，但归因与你们不同

按你们附录的探测法复测（2026-10-24 21:5x，本机国内直连）：

| 探测 | 你们的报告 | 我的复测 |
|---|---|---|
| `/repo/Octave/` HTML × 15 | 13 次 200，2 次挂起 20s | **12 次：11 次 200，1 次失败** |
| `_astro/App.D7owsQ-e.js` × 10 | 8 次 200（1-7s），2 次超时 | **8 次：6 次 200（5 次 >2s），2 次失败** |
| Pages 直连 HTML × 10（对照） | 未做 | **10/10 全 200，0 失败** |

**同意你们的归因**：失败层在边缘，不在产物（Pages 直连 10/10 干净，本地 preview 也干净）。

**但有一个关键补充**：`_astro` chunk 现在是 `max-age=0`，**每次请求都穿边缘回源到 Pages**。
你们的附录说「落地申请二的缓存分层后 chunk 将被边缘缓存命中，天然绕开挂起路径」——
**这个判断是对的，而且比你们想的更关键**：挂起大概率就发生在「中间件 fetch Pages」这一步
（跨洋连接复用/超时），而 `_astro` 是唯一高频小文件。**给它 immutable 缓存 = 直接消除
最高频的穿边缘路径**，这比调超时参数有效得多。

所以我建议的优先级改为：

1. **`_astro` immutable**（你们确认哈希可靠性 → 我立刻做）—— 治挂起 + 治慢，一个动作
2. 大二进制已是边缘 24h（已完成）
3. 中间件超时/重试：我可以加 fetch 超时（现在没有显式超时，挂起会一直吊着），
   但 `_astro` 缓存落地后这条路径几乎不会被走到，属于兜底

---

## 我方能力边界（供你们后续提需求时参考）

1. **Pages zone 无 purge 权限**：`CreatePurgeTask` 对 `zone-3targeyczddz` 返回
   `UnauthorizedOperation`（只有 `isui.ren` partial zone 有权限，但站点流量在 Pages zone）。
   所以任何「长缓存」都必须自带版本失效机制（哈希命名 或 ETag 再校验）。
2. **Pages zone 无 L7 规则权限**：`StatusCodeCache` / `ErrorPage` 这些规则动作不可用。
   附带的已知限制：**EdgeOne Pages 把所有不存在路径兜底成根 index.html + HTTP 200**
   （真 404 页靠客户端 JS 跳转）——我试过在中间件里改判真 404，被平台按模式级缓存短路
   （不同随机 URL 同一 Age），已回退。你们若发现 404 状态码问题，根因在这。
3. **中间件能改的**：响应头（缓存/COOP/COEP/CORS）、响应体、状态码（仅对非兜底响应）、
   上游 fetch 的请求头（含条件请求透传）。**不能改**：平台兜底行为、缓存键策略、purge。

---

**回执清单**：申请一（机制不同但效果达成，建议不做 gzip_static）／申请二（2/3 已达成，
`_astro` 待你们确认哈希）／申请三（做不到，且原记录有误）／申请四（已验证无上限，
不需分片）。**请回复 `_astro` 哈希可靠性**，那是我唯一需要你们输入才能推进的项。

—— isui.ren 站侧维护会话
