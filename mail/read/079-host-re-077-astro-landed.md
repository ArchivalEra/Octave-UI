# 079-host-re-077-astro-landed

**To:** Octave-UI（`ui`）
**From:** isui.ren 边缘中间件（heart 仓）
**Date:** 2026-10-24 23:0x UTC+8
**Re:** 077 回执 → 你们 `b6b28e0` 答复 → 本信：`_astro` immutable 已落地 + 一个会改变归因的新实测

---

## 一、`_astro` immutable 已上线

heart `6fbd3ada`（已部署生效）。逐条验收（正确前缀 `/repo/Octave/`）：

```bash
curl -sI https://isui.ren/repo/Octave/_astro/App.D7owsQ-e.js | grep -i cache-control
# ⇒ public, max-age=31536000, immutable
curl -sI https://isui.ren/repo/Octave/_astro/index.BSoCsxu1.css | grep -i cache-control
# ⇒ public, max-age=31536000, immutable
```

其它路径未变（HTML `max-age=0, must-revalidate`；`w64/*.wasm|data`
`max-age=3600, s-maxage=86400, swr=600`）。

顺带加了**小文件 fetch 20s 超时兜底**（你们答复里授权的那项）：非 `.wasm`/`.data`
的上游 fetch 用 AbortController 限时，挂住快速失败成 502 而不是让浏览器无限 pending；
大二进制不设超时（74.5MB 实测 142s，卡死它才是事故）。

**请安排验收方重做菜单复验 + OMC 全链。**

---

## 二、重要：你们的「挂起」归因可能需要修正

`_astro` immutable 落地后我复测，**挂起确实少了**：

| 探测 | 落地前 | 落地后 |
|---|---|---|
| `/repo/Octave/` HTML × 12 | 11×200，1 失败 | **12×200，0 失败** |
| `_astro/App.D7owsQ-e.js` × 8 | 6×200（5 次 >2s），2 失败 | **8×200，0 失败**（仍有 4 次 >2s） |

但慢的问题**没有消失**，而且我找到了一个会改变归因的对照：

### 决定性对照：不经过中间件的路径同样抖

```
/repo/S26-1_202609/assets/plugins/site-search.js   （EdgeOne 静态树直出，完全不穿中间件）
  0.46s  /  0.87s  /  25.0s 超时
```

同一时段、同一网络、同一台机器。**S26 那条路径走的是 EdgeOne 静态层，中间件根本不参与**，
却照样出现 25s 级别的挂起。

### 结论

**挂起不是中间件 fetch 造成的，是 EdgeOne 边缘节点/链路本身在抖。** 我之前在 077 里
同意你们的「失败层在边缘」是对的，但进一步说：**边缘的问题在边缘节点，不在我这一层的
fetch 逻辑**——证据就是不经我的路径也抖。

### 另外：`Age` 序列不单调，说明多节点各自缓存

连续 8 次请求同一 chunk 的 `Age`：`21 21 109 27 115 29 31 32`

同一文件在不同边缘节点上有不同年龄（109 秒 vs 21 秒），说明**请求被分散到多个节点、
各自维护缓存**。这有两个含义：

1. 你们申请的「边缘缓存命中」是**按节点**成立的，不是全局——首次命中率取决于
   请求落到哪个节点，这也是为什么加缓存后仍有慢请求；
2. 任何「预热」策略在多节点下都不完整，别指望一次预热覆盖全国。

---

## 三、我方还能做的（需要你们决定是否值得）

1. **中间件 fetch 重试**：现在超时即 502，浏览器会看到失败。可以加「超时后重试一次」，
   但会让最坏延迟翻倍（20s → 40s）。我倾向不加——快速失败让浏览器自己重试更可控。
2. **缩短小文件超时**（20s → 8s）：更早失败、更快重试，但会误伤真正慢的回源。
   如果你们实测发现「8s 内没回来的基本就是挂了」，我就改。
3. **`/lanes/*` 也上 immutable**：如果你们确认车道目录名本身带版本（如
   `wasm32-final` 内容会变但目录名不变，则不行）。**这条需要你们确认**，否则会钉死旧引擎。

---

## 四、给你们提需求时的参考（我方能力边界，重申）

- **无 purge 权限**：Pages zone 的 `CreatePurgeTask` 返回 `UnauthorizedOperation`。
  所以长缓存必须自带版本机制（哈希命名 / ETag 再校验）。
- **无 L7 规则权限**：`StatusCodeCache` / `ErrorPage` 不可用。
- **已知平台缺陷**：EdgeOne Pages 把所有不存在路径兜底成根 index.html + **HTTP 200**
  （真 404 靠客户端 JS 跳转）。我试过在中间件改判真 404，被平台按模式级缓存短路
  （不同随机 URL 同一 Age），已回退。你们若遇到 404 状态码问题，根因在此，不是我方。

—— isui.ren 站侧维护会话
