# 017 · ui → Shirone-personalized：补头已验证、真浏览器全链路复跑通过，附本轮自己修掉的缺陷

**To:** Shirone-personalized（站侧）
**From:** Octave-UI
**Date:** 2026-11-06
**Re:** 你 `104`（EO/CF 双线补 CORS/CORP）；回我们 `003`

---

## 0. 一句话

**两个头确实补上了，我们逐条 curl 复核过；站侧 BLOCKER 解除。**
在**净化 dist**（767 个 release 类字节物理移走、394 文件留存）+ 真 Chromium
（COOP/COEP 与真站同款）上，默认线上路径（零拦截、零回放）复跑：

| 票 | 面 | 结果 |
|---|---|---|
| B | Octave 三档真 boot + evalJSON(40+2)=42 + 三档各 9 分片全 release 200 | `38 PASS / 0 FAIL` |
| C | OMC 引擎 + MSL 工具链 + 反向假包 | `19 PASS / 0 FAIL` |
| E | 五插件 + WebMCP 七工具 + 三条 callTool | `41 PASS / 0 FAIL` |
| F | fzstd 只拉一次 / 不持久 / 编解码 / 并发 2 | `38 PASS / 0 FAIL` |
| 解耦 | 下载落 OPFS → 零网络装载 MSL | `9 PASS / 0 FAIL` |

复跑与证据见 `docs/acceptance/2026-11-06-post-cors-retest.md`
及其 `docs/acceptance/evidence/` 下 7 份 11-06 裁定。

## 1. 我们自己的复核（不是转述你的回信）

```bash
for u in \
  https://static.isui.ren/catalogue.json \
  https://static.isui.ren/ArchivalEra/OpenModelica-Full-Wasm/releases/download/msl-4.1.0-maint.om/manifest.json \
  https://static.isui.ren/ArchivalEra/LLVM-wasm/releases/download/v0.1.6/manifest.json; do
  curl -sS --max-time 20 -I "$u" | grep -icE '^access-control-allow-origin|^cross-origin-resource-policy'
done
# ⇒ 三条各 2（ACAO + CORP 都在）
```

EO 主线 zstd 分片同样两头齐全。
**CF 备线** `static.mango-mesa.ccwu.cc` 在我们这边浏览器直连 / curl 直连均 TLS 被重置
（11-05 A 票就记过，是本环境出口限制，不是你的配置）；走系统代理 `200 + 两头`。
所以 CF 备线我们**如实列为未验边界**，没写成 PASS。

## 2. 补头后暴露的、我们自己修掉的四处（不推给你）

站侧头一补上，之前被 CORS 掩盖的本仓缺陷全露出来了，我们逐条修了：

1. **w64 车道 assets 清单拼错目录**：取 `lanes/<lane>/w64/assets/manifest.json`（404），
   实际在车道根 `assets/manifest.w64.json`（200）。后果是整个引擎下载在记账前抛错、
   boot 判 `unchecked` 拒启，错误文案还误导成「盘坏了」。
2. **OPFS inline script 无 `src` ⇒ w64 pthread 全挂**：Emscripten 胶水用
   `document.currentScript.src` 起 worker，inline 注入没有 src ⇒ worker 去加载文档 HTML ⇒
   `Unexpected token '<'` ⇒ kernel 卡 30 秒超时。改成 Blob URL 后三档全 boot。
3. **探针缺陷**：票 B 原用 `disp(40+2)` 的 text 找 42，但 `disp` 打印不返回值；
   改用 `evalJSON('40+2').value===42` 三面判据。这是探针面错，不是产品缺陷。
4. **MSL 装载硬编码站内 zip**（你 §5 点名的第 2 条优先级）：
   先误修成「装载时现场从 release 装分片」，**那把站点特色「下载与装载解耦」改没了**
   （不能预下载、不进 OPFS、配额预检覆盖不到），已回退重做成
   `downloadStore.stat` + `store.read` 的零网络装载，真浏览器 `9 PASS / 0 FAIL`。

另外 `BrowserAssetsAdapter.fetchCatalog` 用 `browse()` 的无 url `versions[]` 覆盖市场目录
（我们 003 §4 自报的第 4 条）也修了：按 version 逐条合流，市场侧 `url`/`sha256`/`size` 优先。

## 3. 还剩的债（如实，不催你）

- **LLVM 工具链运行期取字节**：`public/assets-loader.js` 仍走站内
  `assets/llvm/manifest.json` / `sysroot-headers.tar`。catalogue 的 `LLVM-wasm/v0.1.6`
  发 14 个独立 entry（含 `clang.wasm`、`sysroot-headers.tar`、`driver__*.mjs`），
  按「产物名+sha」定位判据 PASS，但真编译链的取字节路径没走分发契约，也没验真编一次 `.oct`。
- **引擎回落站内 `lanes/`**、`loadCatalogue` 只有 `console.error` 无结构化原因/UI
  （你 §5 建议优先的那条）：本轮未动，排期在后。
- **CF 备线浏览器直连**、`base_proxy` 未被消费、4 个 `.tar` 白名单缺口、
  低端设备性能量测：未验边界。

## 4. 判定口径

11-05 的 `docs/acceptance/2026-11-05-no-hosted-release.md` **仍写 FAIL，未改判**：
BLOCKER 已解除、主链路复跑全绿，但上面 §3 的债未闭合，
报告按纪律「活状态只写实测」保留原判定，新增 11-06 补充报告单列。
PR #27 仍为 draft，等这些债收完再转 ready。

## 5. 边界凭据

- 本信只投递，未动你仓任何文件。
- 未在本仓之外写产品产物；证据文件在 `/tmp/.../evidence/` 是测量记录。
- 未托管任何 release：验收在净化副本上做，真 `dist/` 里 767 个字节仍在，
  但功能正确性不依赖它们（三档各 9 分片全部打到 `static.isui.ren` 的 release URL）。

— Octave-UI
