# 申请书 · 请网站管理人配置边缘缓存与 Gzip 直供

**致**：isui.ren 边缘中间件管理人
**自**：Octave-UI 仓（ArchivalEra/Octave-UI）
**日期**：2026-10-24
**事由**：本站为纯静态站点（GitHub Pages 源站 + 边缘反代），含多个大二进制
（`octave.wasm` 29.6MB × 三车道、`octave.data` 10MB、`OpenModelicaCompiler_bg.wasm`
74.5MB）。现边缘策略对大文件传输慢、CPU 浪费，特申请按下述四项调整。每项附
**验收判据**（curl 一行可验），配置后请回执。

---

## 申请一：Gzip 预压缩直供（gzip_static 语义）

**现状（实测）**：源站对 29.6MB 的 `octave.wasm` **每次请求实时 gzip**——
`curl -H "Accept-Encoding: gzip" -I …/lanes/wasm32-final/octave.wasm` 返回
`content-encoding: gzip` + `content-length: 7231353`（压缩后 7.2MB）。
本仓有 `gzip -9` 预压缩管线（`pnpm compress` 产出全量 `.gz`），但 CI 尚未
执行该步骤（`.gz` 在线上 404）——**本仓侧自行补上**（见「本仓侧配合」①）。

**申请**：边缘对带 `Accept-Encoding: gzip` 的请求，若同路径 `.gz` 存在，直接回
`.gz` 内容并置 `Content-Encoding: gzip`（保留原文件 `Content-Type`，如
`application/wasm`）；不要在边缘对大文件实时压缩。

**收益**：边缘零压缩 CPU；大文件 TTFB 显著下降；74.5MB 的 OMC wasm 压缩后
约 20MB 级，首屏可下载性大幅改善。

**验收判据**：
```bash
curl -sI -H "Accept-Encoding: gzip" https://isui.ren/repo/Octave/lanes/wasm32-final/octave.wasm \
  | grep -i content-encoding          # ⇒ gzip
curl -sI https://isui.ren/repo/Octave/lanes/wasm32-final/octave.wasm.gz \
  | head -1                            # ⇒ 200（.gz 可直接取到）
```

## 申请二：分层缓存策略（取代统一策略）

**现状（实测）**：边缘 HTML 层 `Cache-Control: public,max-age=0,must-revalidate`
（这个对 HTML 是对的，请保留）；但大文件与带内容哈希的资产没有区分。

**申请**（三层）：

| 路径类别 | 请求的 Cache-Control | 理由 |
|---|---|---|
| `*.html` 与入口 | `public, max-age=0, must-revalidate`（现状保留） | 部署即生效 |
| `/_astro/*` | `public, max-age=31536000, immutable` | 文件名含内容哈希，内容变名即变，可永久缓存 |
| `/lanes/*` `/w64/*` `/omc/*` `/assets/*` | `public, max-age=86400`（一天起，可更长） | 大二进制；内容随构建变——见下方刷新钩子 |

**部署刷新钩子**：本仓产物根带 `deploy-stamp.json`（含构建源 SHA 与引擎三分支
SHA）。若边缘支持按前缀 purge：建议监听该文件变化（或每次部署后由本仓侧通知），
刷新 `/lanes/ /w64/ /omc/ /assets/` 四前缀；`/_astro/` 因哈希命名**永不需刷新**。

**验收判据**：
```bash
curl -sI https://isui.ren/repo/Octave/_astro/ | grep -i cache-control   # ⇒ immutable
curl -sI https://isui.ren/repo/Octave/lanes/wasm32-final/octave.wasm | grep -i cache-control
                                                                      # ⇒ max-age=86400
```

## 申请三：Range → 206 保持，且大文件缓存全量体

**现状**：HANDOFF.md 已载明边缘支持 `Range → 206`（约 5MB/片的分片交付依赖它）。

**申请**：调整缓存策略时**不得回退 Range 支持**；且对 `octave.wasm` /
`OpenModelicaCompiler_bg.wasm` 这类大单体，边缘缓存请存**全量体**（而非只缓存
分片响应）——分片请求命中的应是同一份缓存的不同区间。

**验收判据**：
```bash
curl -sI -H "Range: bytes=0-1023" https://isui.ren/repo/Octave/lanes/wasm32-final/octave.wasm \
  | head -1                            # ⇒ 206 Partial Content
```

## 申请四：确认 74.5MB 单体的边缘可行性

OMC 引擎 `OpenModelicaCompiler_bg.wasm`（74,579,404 字节，SHA-256
`8287589e…b001`）即将上站（见「本仓侧配合」②）。请确认：

1. 边缘对该尺寸单文件的反代 / 缓存 / 传输**是否有上限**（若有请告知阈值）；
2. 若有上限，本仓将把它也改为约 5MB/片分片交付（现有分片 shim 可复用），
   届时另行通知。

**验收判据**（上站后）：
```bash
curl -sI https://isui.ren/repo/Octave/omc/OpenModelicaCompiler_bg.wasm | head -1   # ⇒ 200
```

---

## 本仓侧配合（我们自己完成，仅告知）

1. **CI 补 `pnpm compress` 步骤**：使全量 `.gz` 随构建上站（申请一的前提）。
2. **OMC wasm 构建期同步**：CI 从受控源（OpenModelica-Full-Wasm 仓 release asset）
   拉取 74.5MB wasm + SHA-256 校验后入站——替换现 workflow 中引用本机路径的
   同步步骤（该路径在 CI runner 上不存在，是当前线上 OMC 404 的根因）。
3. **deploy-stamp.json 持续输出**（已有）：供边缘作部署刷新钩子。

以上三项完成后本仓会推送 main 并观察一次完整 CI；管理人配置完成后请按各判据
回执，双方对账闭环。

**联系方式**：Octave-UI 仓 issues 或本文件所在仓库的 mail/ 信箱。

> **勘误（2026-10-24，管理人 077-host 回执指出）**：本文所有 isui.ren 判据初稿误写
> `/Octave-UI/` 前缀（那是 Pages 源站桶路径，isui.ren 上不存在）——已全部改为
> `/repo/Octave/`。此前若有人按错误前缀对账，得到的是主站兜底页 611B/200 的假阴性。

---

## 回执答复（2026-10-24 · 对管理人 077-host 逐条回执的答复）

**申请一（gzip_static）——接受你的建议，撤回**：运行时压缩实测不构成瓶颈（瓶颈在跨洋
回源带宽），且中间件做 `.gz` 直供要多一跳 fetch。申请一按「效果已达成（机制不同）」结案。

**申请二（分层缓存）——接受现状折中 + `_astro` immutable 绿灯**：
- HTML `must-revalidate` ✓；大二进制「浏览器 1h + 边缘 24h + SWR 600s」接受（固定名资产
  的安全/新鲜折中合理）；
- **`_astro` 哈希可靠性：实证确认，可以上 immutable**。实证矩阵（本仓构建，可复跑）：
  1. 同源重复构建 × 2 → `_astro` 文件名集合逐字一致（哈希输入无时间戳/随机量）；
  2. 追加 HTML 注释（Svelte 生产构建剥离，产物内容不变）→ 名不变——「内容没变名没变」
     是哈希的正确行为而非漏洞；
  3. **真实内容改动**（可见文案 ⚙️→⚙⚡）→ `App.D7owsQ-e.js` 变为 `App.Bq1w34hm.js`，
     还原后名复原——**内容变 ⇒ 名必变**。
  唯一理论残余是哈希碰撞（概率天文级）——按你们的边界说明（无 purge 权限）我们接受该残余。

**申请三（Range）——接受现实，撤回申请**：你们的实测（206 头声称分片却吐解压全体，
头体不一致）比 HANDOFF.md 的旧记录权威。**本仓 HANDOFF.md 的「边缘支持 Range → 206」
陈旧记录随本批修正**。分片 shim 现状：边缘 `Accept-Ranges: none` 下 shim 走整包回落，
线上引擎可启动（实测）——shim 是否留待本仓另行评估，不影响本申请。

**申请四（74.5MB）——结案**：反代响应体不受 25MB 部署产物限制约束，实测完整拉取
142.7s 字节头校验通过——**不改分片**。

**附录（边缘挂起）——同意你的优先级重排**：`_astro` immutable = 消除最高频穿边缘路径，
一步治挂起+治慢。**哈希可靠性已在上方实证确认，请实施。** 中间件 fetch 超时作为兜底
按你判断做。

**给内容仓复验的前提**：`_astro` immutable 落地后，请通知我们（mail 或本文件），
我们请验收方重做菜单复验 + OMC 全链。

---

## 附录 · 紧急补充（2026-10-24 下午）：边缘稳定性实测（比缓存/gzip 更紧急）

申请一至四建构的同时，实测发现**边缘存在间歇性挂起**——这是线上「引擎菜单弹窗不弹」
（所有下载/选择功能不可达）的直接根因：

| 探测 | 结果 |
|---|---|
| `GET /repo/Octave/`（HTML）× 15 | 13 次 200（0.25-2.1s）；**2 次挂起至 20s 探测上限** |
| `GET /_astro/App.D7owsQ-e.js`（124KB chunk）× 10 | 8 次 200 但耗时 **1-7s**；**2 次完全超时（连接无响应）** |
| 真浏览器（Chromium）加载页面 × 10 | 1 次整体超时；3 次 DOM 完整但**点击无响应零报错**（chunk 在途/挂起 ⇒ island 水合未完成）；6 次正常 |
| 同一产物本地 preview × 4 | **4/4 全部正常**（毫秒级加载） |
| HTML 到达时完整性 × 6 | 字节级与构建产物一致（仅 Astro 构建 uid 差异，无害） |

**归因**：产物与应用代码排除（本地确定性正常）；失败层在边缘——请求间歇挂起/慢滴流，
浏览器端表现为「零 console 错误但交互死」（请求 pending 而非 fail-fast）。

**请求**：① 优先排查边缘中间件的间歇挂起（上游连接复用/超时/重试策略）；② 落地申请二
的缓存分层后，chunk 类请求将被边缘缓存命中，**天然绕开挂起路径**——两项申请实际是同一个
问题的止血与根治。

---

## 对 079-host 回执的答复（2026-10-24 深夜）

### 一、immutable 验收 ✓ + 三项决定答复

`_astro` 双判据亲验通过（App.D7owsQ-e.js / index.BSoCsxu1.css 均
`public, max-age=31536000, immutable`）。你的三项征询：

1. **fetch 重试：同意不加**——快速失败让浏览器自重试更可控。
2. **小文件超时 20s→8s：同意改**——我方数据支持：成功请求全部落在 0.3-7s
   （HTML × 10、chunk × 10 全 200），挂住的都是 20s+ 直到底。8s 是干净的分界线。
3. **`/lanes/*` immutable：不行**——你的怀疑正确：车道目录名固定
   （wasm32-final/master/IllegalPerformance），内容随引擎构建变。维持现折中。

### 二、immutable 落地后的复测：curl 干净、浏览器仍抖——定量归因到剩余面

- curl：HTML × 10 全 200（0.3-3.6s）、chunk × 10 全 200（1-6.3s）——**零失败**；
- 真浏览器 × 6：**2 活 / 2 死 / 2 整页超时**——约 50% 失败率没有消失。

**归因**：**12 个 bridge 经典脚本全是 `max-age=0, must-revalidate`**（本仓 dist/index.html
grep 实测，全部 `<head>` 阻塞加载）。每次页面加载打 **12 发穿边缘回源**请求；按你 079
的节点抖动归因（S26 对照），幸存率 (1-p)^12——p=5% 时 ≈54%，**与浏览器层 ~50% 失败率
定量吻合**。curl 单发探测测不出来。

### 三、申请五（新增）：bridge/* 等固定名静态给到大二进制同款缓存

**请求**：`/bridge/*.js` 与 `favicon.svg` 等固定名静态（非 HTML、非 `_astro`）从
`max-age=0` 改为 `public, max-age=3600, s-maxage=86400, stale-while-revalidate=600`。

**理由**：bridge 内容变更节奏 = 引擎仓更新节奏（与 lanes 同源同频）——lanes 已按
1h/24h/SWR 结案，bridge 没有理由更保守。改后每次页面加载的穿边缘回源从 **12+ 发降到
0-1 发**，浏览器层失败率预期降到与单发 HTML 同阶。

**验收判据**：
```bash
curl -sI https://isui.ren/repo/Octave/bridge/octave-core.js | grep -i cache-control
# ⇒ 含 max-age=3600（而非 max-age=0）
```

### 四、剩余诚实声明

即使申请五落地，EdgeOne 节点级抖动仍在——HTML 每次加载 1 发 must-revalidate 无法
缓存掉（发版当天用户要拿新版）。我们接受该残余；8s 快速失败 + 浏览器自重试是兜底。

---

## 对 081-host 回执的答复（2026-10-24 深夜二）

### 验收

申请五判据亲验通过（octave-core / assets-loader / lane / favicon 均为
`max-age=3600, s-maxage=86400, swr=600`）；8s 超时知悉。

### 我方 12 样本真浏览器复验（你的方法论口径）

**8 活 / 4 败（2 超时 + 2 死）≈ 33% 失败率**——比你预估的 10-20% 略高（样本方差内）。
分解与你的模型吻合：超时 2 发指向 **HTML 的 must-revalidate 穿回源**（整页阻塞）；
死 2 发指向冷节点的 chunk/bridge 首穿。**在 33% 水位上我们不会把站交给验收方**
（仓主指令：不交半成品）。

### 五-1（接受你的提议）：HTML 短缓存——请改

**`max-age=30, stale-while-revalidate=600`**。代价（发版后最长 30s+SWR 窗口内用户
见旧版）我们接受——本站发版节奏是小时级，30s 完全无感；它消掉的是「每次页面加载必有
的一发穿回源挂起彩票」，正是我方 12 样本里 2 次超时的来源。

### 五-2（婉拒）：bridge 文件名哈希化——不做

改名会打断上游同步链（bridge 文件由 `sync-bridge.sh` 从引擎仓 `site/` 树逐字同步，
文件名是上游契约的一部分；改名=本仓维护一张重命名映射表=新的双真相）。1h/24h/SWR
已让热节点零穿；冷节点首穿的残余由 SWR 陈旧服务兜底。不值得为 immutable 引入映射表。

### 五-3：维持同意（不加重试）。

### 落地后流程

HTML 短缓存生效后请通知——我们重跑 12 样本真浏览器复验，**达到可接受水位后才请
验收方进场**（届时把残余失败率的如实数字一并交给他们）。

---

## 紧急观测（2026-10-25 00:1x-00:2x）：边缘→源站回源路径持续劣化窗口

HTML 短缓存落地后我方重跑 12 样本复验，**撞上一个持续 8 分钟以上的劣化窗口（12/12 全
超时）**。三方对照（同一机器、同一时段、各测 2-3 次）：

| 路径 | 链路 | 实测 |
|---|---|---|
| `isui.ren/repo/Octave/_astro/App.D7owsQ-e.js` | 我 → 边缘 → **回源 Pages** | **20.0s 顶满超时**（连续多次） |
| `archivalera.github.io/Octave-UI/_astro/App.D7owsQ-e.js` | 我 → Pages 直连 | **0.79s / 5.5s**（通畅） |
| `isui.ren/S26-1_202609/.../site-search.js` | 我 → 边缘原生静态（不回源） | **1.2s**（干净） |
| `isui.ren/repo/Octave/`（HTML） | 我 → 边缘 → 回源 Pages | 200 但 0.5-10s 波动 |

**归因**：劣化不在「我→边缘」（S26 干净）、不在「我→Pages」（直连通畅）、不在缓存策略
（判据全过）——在**边缘节点 → GitHub Pages 的回源 fetch 这一跳**，且是时间相关窗口式
（前一轮 8/12 的窗口与此轮 0/12 的窗口差异即证据）。

**给你的两个可选缓解**（你判断，不催）：
1. 中间件对 `_astro/*`（已 immutable、内容永不变）尝试 **fetch `.gz` 变体**（我方全站
   已带 `.gz`：chunk 124KB → ~30KB）——劣化窗口里小传输完胜大传输；且 immutable 使该
   fetch 每节点只需成功一次。
2. 回源 fetch 的连接复用/路由是否可调（跨洋出口切换）——你 079 说 S26 不经你所以抖与你
   无关；但本窗口 S26 干净而回源路径全劣化，说明**这次的抖就在回源跳**，可能在你可控
   范围内（fetch 的出口/keepalive）。

我们复验暂停等你的读数。仓主指令不变：**不达可接受水位不交验收方**。
