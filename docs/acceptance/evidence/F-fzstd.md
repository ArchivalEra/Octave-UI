# 票 F · fzstd 不持久 + 只拉一次 + codecPreference + 并发 2（真浏览器钓鱼证据）

- 采证时间：2026-11-05
- 端口：`8908`（票 F 专属）
- 预览服：`python3 scripts/serve.py --dir /tmp/fishing-2026-11-05/dist-clean --port 8908`
- 站点：`http://localhost:8908/repo/Octave/`（净化 dist，**只读**）
- 浏览器：`/usr/bin/chromium` + `/mnt/hdd/zcode-test/harness/node_modules/playwright`
- 脚本：`/mnt/hdd/zcode-test/harness/fish-f-fzstd.mjs`
- 原始日志：`/tmp/fishing-2026-11-05/evidence/F-raw.log`（`node fish-f-fzstd.mjs` 的 stdout 全量）
- 结构化结果：`/tmp/fishing-2026-11-05/evidence/F-result.json`
- 复跑总命令：`cd /mnt/hdd/zcode-test/harness && node fish-f-fzstd.mjs`
  （`--phase=F0|F1|main|F8` 可分段跑；不带参数 = 全跑）

> 纪律声明：只做钓鱼取证，**未改任何产品代码、未改净化 dist、未改 SHARED.md**。
> 数字只认实测，每个数字旁写复跑命令。
> 「0 次请求」不是 PASS —— 见 §0 与 §3 的同类肯定用例。

---

## ★ 环境限制 / 未验边界（本批次共同根因，先写）

### 根因：release manifest / chunk 缺 CORS/CORP 响应头

净化 dist 的 `serve.py` 给页面下发 `Cross-Origin-Embedder-Policy: require-corp`
+ `Cross-Origin-Opener-Policy: same-origin`，页面 `window.crossOriginIsolated === true`
（F-raw.log:11）。在该隔离上下文里，**跨源响应必须带 CORS 或 CORP 头**才能被 `fetch` 读到。

实测（复跑命令 R1–R3，逐字输出见下；`curl -D - -o /dev/null -H "Origin: http://localhost:8908"`）：

| 资源 | ACAO / CORP 响应头 | 浏览器 `fetch` 结果 |
|---|---|---|
| `static.isui.ren/catalogue.json` | **有** `access-control-allow-origin: *` + `cross-origin-resource-policy: cross-origin` | `200 cors`，11245 B（F-raw.log:13-18）|
| `static.isui.ren/ArchivalEra/.../octave-full-wasm-v0.1.0/manifest.json` | **无**（R2 输出只有 `HTTP/2 200`，无 ACAO/CORP 行）| `TypeError: Failed to fetch` + console `No 'Access-Control-Allow-Origin' header`（F-raw.log:19-30）|
| `static.isui.ren/.../wasm32__octave.js.zstd.000` | **无**（R3 同上）| `TypeError: Failed to fetch` + `net::ERR_FAILED` / `ERR_BLOCKED_BY_RESPONSE.NotSameOriginAfterDefaultedToSameOriginByCoep` |
| `base_proxy` = `github.com/.../manifest.json` | 302 → `release-assets.githubusercontent.com`，**无 ACAO**（R4）| 同样取不到 |

R1–R4 复跑命令：
```bash
curl -sS -m 20 -D - -o /dev/null -H "Origin: http://localhost:8908" "https://static.isui.ren/catalogue.json" 2>&1 | grep -iE "^HTTP/2|access-control-allow-origin|cross-origin-resource-policy"
# => HTTP/2 200 / access-control-allow-origin: * / cross-origin-resource-policy: cross-origin
curl -sS -m 20 -D - -o /dev/null -H "Origin: http://localhost:8908" "https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/manifest.json" 2>&1 | grep -iE "^HTTP/2|access-control-allow-origin|cross-origin-resource-policy"
# => HTTP/2 200  （无任何 ACAO/CORP 行 = 缺头）
curl -sS -m 20 -D - -o /dev/null -H "Origin: http://localhost:8908" "https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm32__octave.js.zstd.000" 2>&1 | grep -iE "^HTTP/2|access-control-allow-origin|cross-origin-resource-policy"
# => HTTP/2 200  （无任何 ACAO/CORP 行 = 缺头）
curl -sS -m 25 -I -H "Origin: http://localhost:8908" "https://github.com/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/manifest.json" 2>&1 | grep -iE "^HTTP|access-control-allow-origin|cross-origin-resource-policy|^location"
# => HTTP/2 302 / location: https://release-assets.githubusercontent.com/...  （无 ACAO）
```

这与主会话在票 C 抓到的日志逐字一致：
`Access to fetch at 'https://static.isui.ren/ArchivalEra/.../manifest.json' from origin 'http://localhost:8905' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header`。
**EO 主线的 manifest/chunk 与 GitHub 备线（`base_proxy`）都缺 ACAO ⇒ 浏览器里所有 release manifest 都取不到。**

### 对票 F 判据的影响（如实定性）

- **默认网络下 zstd 解码路径根本没触发**：拿不到 manifest ⇒ 选不出 variant ⇒ 取不到
  zstd 块 ⇒ `decoders.zstd` 永不被调用 ⇒ `fzstd-0.1.1.mjs` 请求数 = **0**
  （F-raw.log:40，F0：下载按钮点了、`downloaded` 徽标 30 s 内始终不出、F-raw.log:36-39）。
- 按票面硬约束，**「0 次请求」不是 PASS**，也**不是「fzstd 只拉一次」判据的 FAIL**：
  这是**环境限制导致的「未验：zstd 解码路径未触发」**。fzstd 的加载器代码没被跑到，
  既不能证明它只拉一次，也不能证明它拉了多次。
- 同类肯定用例（证明探针能看到「存在」，而非探针缺陷）：
  - 页面本体 `200`：`curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:8908/repo/Octave/` → `200`（R6）
  - catalogue 真浏览器 `200 cors` / 11245 B（F-raw.log:13-18，探针测到了「存在」）
  - fzstd 静态资产同源 `200` / 24407 B（F-raw.log:45-49，positive-control：页面能 fetch、blob-import 后有 `decompress()`）
  - Node 侧真 zstd 块解码肯定用例：`node` 里 `fzstd.decompress(真 zstd 块)` → 464339 B
    （= manifest 里 `octave.js` 的 `bytes`），证明「解码器真能解这批真字节」。
- **GH 直连间歇超时**：本票未走 GH 直连取字节（manifest/块都用 EO 主线预取，复跑见 §7），
  如实记录为「本票未复现 GH 超时」；主会话/票 C 已记录该现象。

### 为了让真实生产解码代码可达，做了什么（不是改产品）

用 `page.route().fulfill()` 把**真实预取的 CDN 字节**（catalogue 2 份、18 份 manifest、
54 个分片，全部按 `manifest_sha256` / `chunk[].sha256` 逐字节 sha 校验过）补上
`access-control-allow-origin: *` + `cross-origin-resource-policy: cross-origin` 响应头喂回页面。
**只剥离环境性的 CORS 头障碍**，不改产品源码、不伪造 release 数据、不改净化 dist。
在此受控条件下，`downloadStore.downloadEngine()` 真正走完
`resolveEngine → assembleEntry → 取块 → decoders.zstd → fzstdLoader.load()`，
于是 F2/F3/F4/F5/F6/F7/F8 判据可测。这一层是「同类肯定用例」的兑现：探针能测到存在。

> 口径分档（**必须分清**）：
> - **环境原样（默认网络）**：F1 可测；F2–F8 涉及 zstd 解码路径的 = **未验（路径未触发）**。
> - **受控补头（真字节 + 真产品代码）**：F2–F8 的实测值见下，是「产品行为」证据，
>   但**不等于**「线上 EO/CF 供给在浏览器里可达」——后者是供给侧缺陷，不在本票判据内。

---

## 逐项判定（受控补头条件下 = 真实产品解码路径）

| # | 判据 | 结果 | 实测 |
|---|---|---|---|
| F1 | fzstd 资产在场 + 指纹 | **PASS** | 24407 B / sha `1a901fc5…b0d2a4`，与产品钉值、manifest 三方逐字一致 |
| F2 | fzstd 请求日志（URL?v= / status / size / 头）| **PASS（记录完整）** | 1 条：`?v=f11f4aaa2d27aef4f442e28035beae2a` / 200 / 24407 B / GET / fetch |
| F3 | 只拉一次（≥2 次解码、同一 document）| **PASS** | 2 条车道各 9 分片、共 **16 个 zstd 分片 / 2 次独立解码**，fzstd 请求仍 = **1** |
| F4 | no-store + 每页唯一 nonce | **PASS** | nonce 32-hex；新 document nonce 变（f11f… → e8e8…）|
| F5 | 不碰 storage | **PASS** | 4 类 storage 全空、写入 Proxy 0 次、无 fzstd 相关项 |
| F6 | codecPreference | **PASS** | 大件（≥1 MiB）zstd、小件（<1 MiB）gzip |
| F7 | 并发峰值 ≤ 2 | **PASS** | peak = 2 |
| F8 | 反向断言（abort fzstd）| **PASS** | zstd 解码失败 → codecs 回退链换 gzip → 下载仍成功 |

### F1 · fzstd 静态资产在场
净化 dist 里 `lib/fzstd-0.1.1.mjs` **没被移走**（它是 JS/模块，不是 release 字节）。
- 复跑：`sha256sum /tmp/fishing-2026-11-05/dist-clean/lib/fzstd-0.1.1.mjs; wc -c < /tmp/fishing-2026-11-05/dist-clean/lib/fzstd-0.1.1.mjs`
- 实测：`1a901fc5a58c349bbdb4f2aa1e688637ef56891ec58243a9f0cd863166b0d2a4` / `24407`
- `lib/fzstd-0.1.1.manifest.json`：`bytes=24407`、`sha256` 同上
- 产品代码 `src/modules/storage/fzstdLoader.ts:170` 钉值：`1a901fc5a58c349bbdb4f2aa1e688637ef56891ec58243a9f0cd863166b0d2a4`
- 三方逐字一致 ⇒ **PASS**（F-raw.log:2-8）
- 同源 HTTP：`curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:8908/repo/Octave/lib/fzstd-0.1.1.mjs` → `200`

### F2 · fzstd 请求日志表（同一 document）
复跑：`node fish-f-fzstd.mjs --phase=main`（stdout → F-raw.log:108-120）

| # | URL | status | size | method | type |
|---|---|---|---|---|---|
| 1 | `http://localhost:8908/repo/Octave/lib/fzstd-0.1.1.mjs?v=f11f4aaa2d27aef4f442e28035beae2a` | 200 | 24407 | GET | fetch |

请求头逐字：`accept: */*`、`referer: http://localhost:8908/repo/Octave/`、`user-agent: HeadlessChrome/154.0.0.0`、`sec-ch-ua*`。
**关于 `cache:'no-store'` 与请求头（如实说明，不许假装看到头）**：
请求头里**没有** `Cache-Control` / `Pragma` / `If-None-Match` / `If-Modified-Since` 等缓存相关头。
`cache:'no-store'` 是 **Fetch API 的 RequestCache 指令**（`fzstdLoader.ts:98` 的 `fetch(url, { cache: init.cache })`），
由浏览器在 HTTP 缓存层执行「不读/不写缓存」，**不必然产生任何 Cache-Control 请求头**；
因此「没看到 Cache-Control 头」**既不支持也不否定** no-store 生效，属于指令语义而非头语义。
本票对 no-store 的**可证伪证据**是：URL 带每页唯一 nonce（F4）+ 同一 document 只发 1 次（F3）
+ 反向断言里 fzstd 失败后本 document 永久不可用、不重试（F8）。
响应头（serve.py）：`content-type: text/javascript`、`content-length: 24407`、COOP/COEP、`last-modified`（无 `cache-control`）。

### F3 · 只拉一次（必须 == 1）
复跑：`node fish-f-fzstd.mjs --phase=main`（F-raw.log:51-125）

同类肯定用例先证「探针能测到解码发生」：
- 下载 #1（`wasm32-final`，product=`wasm32`）：`downloaded=1`，**9 个分片**，其中 8 个 `.zstd.`、1 个 `.gzip.`（小件）→ 一次真实 zstd 解码。F-raw.log:51-61。
- 下载 #2（`master`，product=`wasm64std`）：同一 document 内**另一条独立车道**，`downloaded=1`，**另 9 个分片** `wasm64std__…`（F-raw.log:89-106）→ 第二次真实 zstd 解码，且复用 `appContext.ts:108` 的**全局单例 loader**。
- 合计 **18 个分片请求 / 16 个 zstd 分片 / 2 次独立解码**（F-raw.log:99-100、213-231）。
- 两次下载的 `dl-status.downloaded` 均为真（F-raw.log:55-60、93-98），下载**成功**（逐块 sha + 拼接后 entry sha 两道校验过），不是「只下了块没解」。

判据结果：`fzstdReqs = 1`（F-raw.log:109、125）⇒ **PASS**。
（探针自身的 2 次 `?probe=` 读取单列在 `fzstdProbes`，不混入计数 —— F-result.json `fzstdProbes=2`、`fzstdReqs=1`。）

> 反向说明：默认网络（F0）下 `fzstdReqs = 0`，按票面硬约束**不判 PASS**，见 §0「未验」。

### F4 · no-store + 每页唯一 nonce
复跑：`node fish-f-fzstd.mjs --phase=main`（F-raw.log:127-143）
- document 1 的 `v=`：`f11f4aaa2d27aef4f442e28035beae2a` → `/^[0-9a-f]{32}$/` **PASS**
- 新 document（全新 context/page，存储干净）触发一次解码 → `v=`：`e8e867ed1b88e18d58a55ef16b5226b4` → 32-hex **PASS**
- `f11f… != e8e8…` ⇒ 每次 document 唯一 **PASS**
- 产品代码 `fzstdLoader.ts:59-68` 用 `crypto.getRandomValues(16 B)` → 32 hex；`fzstdLoader.ts:70-73` 注释明确 nonce 必须**实例级**（每个 document 一份 loader 一个 nonce）。实测与之吻合。
- 新 document 内 fzstd 仍只发 1 次（F-raw.log:141）。

### F5 · 不碰 storage
复跑：`node fish-f-fzstd.mjs --phase=main`（F-raw.log:145-156）
- `sessionStorage` keys：`[]`
- `localStorage` keys：`[]`（页面内联脚本会读 `octave_ui_theme` 等，但**未写入** fzstd 相关项）
- `indexedDB.databases()`：`[]`
- `caches.keys()`：`[]`
- `addInitScript` Proxy 记录的 storage 写入调用：**0 次**（`writes: []`）。
  Proxy 包了 `sessionStorage/localStorage` 的 `setItem/removeItem/clear`、`indexedDB.open`、`caches.open`。
- fzstd 相关 key / 写入：**0**。⇒ **PASS**
- 补充：产品 `fzstdLoader.ts` 明确不用 sessionStorage/localStorage/IndexedDB/OPFS/CacheStorage；
  字节走 `fetch(cache:'no-store')` → `Blob` → `URL.createObjectURL` → `import()` → `finally revokeObjectURL`（立即回收）。
  本票未直接观测 OPFS 写入（属引擎落盘，非 fzstd），如实列为未验边界。

### F6 · codecPreference
复跑：`node fish-f-fzstd.mjs --phase=main`（F-raw.log:158-198）
从真实分片请求 URL 的 `.zstd.` / `.gzip.` 文件名判定（entry 体积取 release manifest 的 `entry.bytes`）：

| entry | bytes | 体积档 | 选中的 codec | 分片数 | 复跑依据 |
|---|---|---|---|---|---|
| `octave.wasm` | 29621256 | LARGE(≥1 MiB) | **zstd** | 6 | F-raw.log:214-219（wasm32）/ 223-228（wasm64std）|
| `octave.data` | 9712192 | LARGE(≥1 MiB) | **zstd** | 2 | F-raw.log:221-222 / 230-231 |
| `octave.js` | 464339 | small(<1 MiB) | **gzip** | 1 | F-raw.log:220 / 229 |

判据（大件 zstd / 小件 gzip）⇒ **PASS**。
产品策略 `appContext.ts:119-120`：`entry.bytes >= 1024*1024 ? ['zstd','gzip','identity'] : ['gzip','zstd','identity']`，实测吻合。
（注：forge 包全是 `identity`-only，无 zstd 变体，不走本判据；本票用引擎车道量，见 §7。）

### F7 · 并发峰值 ≤ 2
复跑：`node fish-f-fzstd.mjs --phase=main`（F-raw.log:200-202）
- `page.on('request')` / `response` / `requestfailed` 记账同时在飞的分片请求数。
- 实测 `peakInFlight = 2` ⇒ **PASS**。
- 产品 `chunkAssembler.ts:104` `DEFAULT_CONCURRENCY = 2`（2026-11-05 由 8 改 2，因 EO 免费版镜像字节闸）。
- 分片时序可复核：F-raw.log:213-231，`wasm32__octave.wasm.zstd.000` 与 `.001` 同起（start 1793884225947 / 1793884225950），
  `.002` 在 `.000` 响应后才起 ⇒ 两个 worker 排队取号，与并发 2 一致。

### F8 · 反向断言（把能力拿掉必须红）
复跑：`node fish-f-fzstd.mjs --phase=F8`（F-raw.log:233-261）
- 对 `lib/fzstd-0.1.1.mjs` 请求 `route.abort('failed')`。
- fzstd 请求：1 条，`v=bf059d4520fd36989be140477c1707d2`，`status=FAILED:net::ERR_FAILED`。
- 控制台逐字出现：`[fzstd] load failed — zstd decoding disabled for this session: TypeError: Failed to fetch`（F-raw.log:255）。
- **判据变红 + 回退链兑现**：zstd 分片仍下了 8 个（主变体先取块），解码阶段 `decoders.zstd` 抛错 →
  `assembleEntry` 的 `fallbackVariants` 换到 **gzip 变体**，重取 9 个 `.gzip.` 分片
  （F-raw.log:250 `zstd chunk reqs = 8 | gzip chunk reqs = 9`），下载最终 `downloaded=1` 成功（F-raw.log:238-243、258-259）。
- 对照：正常（main）只有小件 `octave.js` 走 gzip（2 个 gzip 分片），大件全 zstd（16 个 zstd 分片）；
  abort 后**所有件**回退 gzip ⇒ 反差明确，判据可证伪。⇒ **PASS**
- 这也验证了 `fzstdLoader.ts:134-138` 的失败语义：失败后本 document 内永久 `unavailable`、不重试
  （整个 F8 里 fzstd 只发 1 次，且是失败那次）。

---

## 请求日志总表

### fzstd-0.1.1.mjs 请求（全部）
| 场景 | URL `?v=` | status | size |
|---|---|---|---|
| main doc1（2 次解码）| `f11f4aaa2d27aef4f442e28035beae2a` | 200 | 24407 |
| main doc2（新 document）| `e8e867ed1b88e18d58a55ef16b5226b4` | 200 | 24407 |
| F8（abort）| `bf059d4520fd36989be140477c1707d2` | FAILED:net::ERR_FAILED | — |
| F0（默认网络）| — | **0 次请求**（路径未触发，见 §0）| — |

### 分片请求（main，2 次解码，18 条，全 200）
见 F-raw.log:212-231，逐条含 codec / 文件名 / start / end / dur。
摘要：`wasm32__*` 9 条（8 zstd + 1 gzip）+ `wasm64std__*` 9 条（8 zstd + 1 gzip）。

### catalogue / manifest（受控补头）
- `static.isui.ren/catalogue.json` → 200，11245 B（真字节，带 ACAO/CORP）
- `static.mango-mesa.ccwu.cc/catalogue.json` → 200，11425 B（真字节）
- 18 份 release `manifest.json` → 200（真字节，逐份 sha 与 `catalogue.manifest_sha256` 一致）
- 54 个分片 → 200（真字节，逐块 sha 与 `chunk[].sha256` 一致）

---

## 复跑命令清单

```bash
# 0) 起预览服（票 F 端口 8908；净化 dist 只读）
python3 scripts/serve.py --dir /tmp/fishing-2026-11-05/dist-clean --port 8908
# 需在 /mnt/hdd/antigravity-projects/Octave-UI 下跑（serve.py 相对仓根解析）

# 1) 全票复跑（stdout 全量 = F-raw.log；另产出 F-result.json）
cd /mnt/hdd/zcode-test/harness && node fish-f-fzstd.mjs | tee /tmp/fishing-2026-11-05/evidence/F-raw.log

# 分段
cd /mnt/hdd/zcode-test/harness && node fish-f-fzstd.mjs --phase=F0   # 默认网络诊断
cd /mnt/hdd/zcode-test/harness && node fish-f-fzstd.mjs --phase=F1   # 资产在场
cd /mnt/hdd/zcode-test/harness && node fish-f-fzstd.mjs --phase=main # F2–F7
cd /mnt/hdd/zcode-test/harness && node fish-f-fzstd.mjs --phase=F8   # 反向断言

# 2) F1 独立复跑
sha256sum /tmp/fishing-2026-11-05/dist-clean/lib/fzstd-0.1.1.mjs
wc -c < /tmp/fishing-2026-11-05/dist-clean/lib/fzstd-0.1.1.mjs

# 3) CORS 根因复跑（R1–R4，见 §0）
curl -sS -m 20 -D - -o /dev/null -H "Origin: http://localhost:8908" "https://static.isui.ren/catalogue.json" 2>&1 | grep -iE "^HTTP/2|access-control|cross-origin-resource-policy"
curl -sS -m 20 -D - -o /dev/null -H "Origin: http://localhost:8908" "https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/manifest.json" 2>&1 | grep -iE "^HTTP/2|access-control|cross-origin-resource-policy"
curl -sS -m 20 -D - -o /dev/null -H "Origin: http://localhost:8908" "https://static.isui.ren/ArchivalEra/Octave-Full-Wasm/releases/download/octave-full-wasm-v0.1.0/wasm32__octave.js.zstd.000" 2>&1 | grep -iE "^HTTP/2|access-control|cross-origin-resource-policy"

# 4) 真字节 fixture 预取/校验脚本（内嵌在采证过程，产物在 /tmp/fishing-2026-11-05/fixtures/）
#    catalogue ×2、manifest ×18、chunk ×54，全部按 catalogue.manifest_sha256 / chunk[].sha256 逐字校验
#    54/54 分片 sha OK、18/18 manifest sha OK（见采证 stdout）

# 5) 页面 / 资产 200 肯定用例
curl -sS -m 5 -o /dev/null -w "page=%{http_code}\n" "http://localhost:8908/repo/Octave/"
curl -sS -m 5 -o /dev/null -w "fzstd=%{http_code}\n" "http://localhost:8908/repo/Octave/lib/fzstd-0.1.1.mjs"
```

---

## 诚实边界 / 未验

1. **默认网络（环境原样）下 zstd 解码路径未触发**：所有 release manifest/chunk 因缺 ACAO/CORP 被
   COEP `require-corp` 上下文拦掉（§0）。因此「线上浏览器直接跑」时 F2–F8 属**未验（路径未触发）**，
   不是 PASS 也不是 FAIL。本票的 F2–F8 PASS 结论**仅成立于「受控补头 + 真字节 + 真产品代码」**条件。
2. **供给侧缺陷不属本票判据**：`static.isui.ren` 的 manifest/chunk 与 GitHub `base_proxy` 缺 ACAO，
   是产品供给/部署问题，应由修票阶段处理；本票不改产品代码、不改净化副本，只记录。
3. **`cache:'no-store'` 不产生请求头**：如实说明（F2），未假装看到 `Cache-Control` 头；
   本票用 nonce 唯一性 + 单 document 单次 + 反向断言间接证伪。
4. **OPFS 写入未直接观测**：F5 的 Proxy 覆盖 sessionStorage/localStorage/indexedDB.open/caches.open，
   未包 OPFS（`navigator.storage.getDirectory()`）；fzstd 模块本身不写 OPFS，引擎落盘另属他票。
5. **GH 直连间歇超时**：本票真字节走 EO 主线预取，未复现 GH 超时；如实记录为「本票未复现」。
6. **cache 命中/磁盘落盘未做跨进程取证**：只在同一浏览器进程内用 Playwright 网络层记账；
   未验证浏览器重启后 HTTP 缓存是否有该资源（但 `cache:'no-store'` + nonce 使缓存键不可复用，
   且 F5 确认无 CacheStorage 条目）。
7. **fixture 来自真实产物**：54 个分片、18 份 manifest、2 份 catalogue 全部 `urllib` 从
   `static.isui.ren` / `static.mango-mesa.ccwu.cc` 真取，逐块 sha 与 catalogue/contract 对账，未编造标识。
