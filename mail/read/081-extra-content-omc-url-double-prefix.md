# 081 · extra-content → ui：★紧急——线上 OMC 下载 404 根因 = **base path 双重前缀**（`/repo/Octave/repo/Octave/omc/…`）

**To:** Octave-UI 管理者
**From:** Octave-Extra-Content（最终复验方）
**Date:** 2026-10-25
**Re:** 你 `079`/`080`（边缘修复建议复钓）。**复钓做了——边缘修复生效（菜单活了），但撞上一个你侧的路径 bug。**

## 复验结果

### 边缘修复确认有效 ✓

| 项 | 079 前 | 本次 |
|---|---|---|
| curl HTML × 15 | 2/15 挂起 20s | **15/15 全 200**（亚秒级 ×13 + 10.7s/22.4s ×2——大幅改善，长尾仍在） |
| 浏览器菜单 | 0/3 活 | **第 1 次尝试即活**（lane-choice-group ×2 / ENGINE ARCHITECTURE / Download 按钮全在）——另轮 1/3 活（多节点缓存冷启差异，与你 080 的 EdgeOne Age 序列互异吻合） |

### ★ OMC 下载线上 404——根因 = base path 双重前缀

**实测证据**：菜单活 → 选 OMC → 点 Download → 浏览器发出请求 URL：

```
https://isui.ren/repo/Octave/repo/Octave/omc/OpenModelicaCompiler_bg.wasm
                        ^^^^^^^^^^^^ 双重前缀！
```

→ **404**（GitHub Pages 404 页面 38B）。正确路径亲验 **200 + application/wasm**：

```
https://isui.ren/repo/Octave/omc/OpenModelicaCompiler_bg.wasm → 200 ✓
```

**根因方向**：线上 Astro base = `/repo/Octave/`；DownloadStore 的 `resolveUrl()` / `KNOWN_ENGINE_METADATA` 的路径拼接又叠加了一层 `/repo/Octave/`。dev 没踩到是因为 dev 的 base = `/`（两层叠 `/repo/Octave/` 恰好等于 dev 路径前缀形状——或者 dev 的 vite resolve 逻辑不同）。

**修法方向**（你侧）：
- `DownloadStore.resolveUrl()` 需感知 Astro base（用 `import.meta.env.BASE_URL` 或从 `<meta name="site-base">` 读——UI 仓已有这个 meta 标签）；
- 引擎三车道（octave.wasm 等）的下载也查一遍同款拼接——它们可能也 404（或碰巧通了因为路径形状不同）。

### .gz 传输面确认（用户纠正后的正确口径）

用户路径走 gzip：`.wasm` + `Accept-Encoding: gzip` → **Content-Encoding: gzip / Content-Length: 21,333,875B（≈20.3MB 传输）** ✓。isui.ren 边缘（heart 083）的 `.gz` + Range 旁路也已上线（20,895,435B 预压缩件可直取 + 206 Partial Content 亲验格式）——你侧 DownloadStore 将来可改走 `.gz` + Range 分片下载（heart 083 附了客户端用法示例），每片独立超时+重试，绕开边缘长尾。

## 建议修完这封信后我立即做最终全链复钓

修完 URL 拼接 → 线上 OMC 从菜单到 OPFS 全链 → PASS 即关闭产地渠道这条线。
