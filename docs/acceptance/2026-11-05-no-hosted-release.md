# 完全不托管任何 release · 逐项验收报告（2026-11-05）

> 任务图票 H（汇总），依赖票 A–G 全部证据。对应 GitHub issue #26 / PR #27
> （分支 `feat/no-hosted-release-acceptance`）。
> 本文件是**唯一写进仓内的产物**；原始日志不复制进仓，全部在
> `/tmp/fishing-2026-11-05/evidence/`，下面每处都给绝对路径 + 复跑命令。
> 本报告**未改任何产品代码**、未改 `SHARED.md`、未碰净化 dist。

---

## 0. 三分钟速读（给两小时后回来的用户）

**结论：本次「完全不托管任何 release」验收 FAIL。** 不许写成「部分达成」。

| 能不能跑 | 结论 | 为什么 |
|---|---|---|
| 供给服务端（curl 层双线 catalogue / 18 份 manifest / 契约定位） | **能** | EO 主线 18/18、CF 备线 18/18，`manifest_sha256` 逐字一致；16/17 包按「产物名+sha」命中 release |
| 契约定位 / 插件 WebMCP / fzstd 产品代码 | **能** | 17 包双确认、7 工具+3 条 callTool、fzstd 只拉一次/不持久/编解码/并发 2 全 PASS |
| **浏览器里从 release 真 boot 三引擎** | **不能** | **站侧响应头缺口 + 本仓三处待修缺陷**，见 §3 |
| 站上不托管 release 后功能是否仍成立 | **FAIL** | 净化 dist 上 Octave 三档零档 boot、OMC 未就绪、release 大字节零条 200 |

**最值钱的一句话**：产品代码是**对的**——票 B 的同类肯定用例只补两个 HTTP 头
（`ACAO:*` + `CORP:cross-origin`，本地中继回放真 release 字节、**零产品改动**），
`wasm32-final` 就真 boot 成功、`evalJSON('40+2')` 得到 **42**、11/11 release 请求 200。
卡住的是**供给侧响应头**，不是 UI 消费逻辑。

**怎么修（按优先级）**：
1. 站侧（非本仓可改）：给 `static.isui.ren` 的 `/ArchivalEra/*`（release manifest 与
   `.zstd.*` / `.gzip.*` 分片）补 `Access-Control-Allow-Origin: *` +
   `Cross-Origin-Resource-Policy: cross-origin`；GitHub `base_proxy` 302 后的
   `release-assets.githubusercontent.com` 资产同样要补。修复后**必须重跑票 B、C、F 的线上路径**。
2. 本仓三处待修缺陷：引擎回落站内 `lanes/` 旧路径（§3.2）、失败可见性不足（§3.3）、
   LLVM/MSL 硬编码站内路径（§3.4）；另有包下载面第五处（§3.5）。
3. 夹具：本轮 A–G 跑在 `dist-clean`（粗净化 767，保留 4 个 `.tar`），最终口径应是
   `dist-full`（79 个 release 字节移走）。与 `.oct`/`.tar` 相关的 FAIL 要在最终口径上重定性。

---

## 1. 逐张票核对证据（不替别人补做）

复跑命令都在各票报告里逐字给出，下表「复跑」列给代表性命令；完整命令见对应 `.md`。
「反向断言」列按票 G §5 的汇总口径（C 自己注明局限 ⇒ PARTIAL，不替它升格）。

| 票 | 报告 .md | 原始日志 | 复跑命令 | PASS/FAIL 判定 | 反向断言 | 核心数字与判定（1–3 行） |
|---|---|---|---|---|---|---|
| **A** | `A-supply.md` | `A-raw.log`、`A-serve-8903.log` | `sh evidence/A-releaselike-predicate.sh /tmp/fishing-2026-11-05/dist-clean` | 有（§6 总表 14 项） | **成立**（§5 放回 `w64/octave.wasm` ⇒ 判据 0→1→0，含肯定用例；A 自注仅证「扩展名口径」） | 供给层 **PASS**：EO/CF 双线 catalogue 200（11245 B / 11425 B，18 条），18 份 manifest `manifest_sha256` 逐字一致 18/18，CF 备线 18/18。**一处 FAIL**：白名单漏 `*.tar`，4 个 20 MB `sysroot-headers*.tar` 是真 release 字节仍留在 dist-clean（§1.4）。 |
| **B** | `B-octave.md` | `B-raw.log`、`B-positive.log`、`B-eval42.log`、`B-reverse2.log`、`B-summary.json` | `cd /mnt/hdd/zcode-test/harness && node fish-b-octave.mjs` | 有（§PASS/FAIL 汇总；`B-summary.json` `verdict=FAIL`，27 PASS / 8 FAIL） | **成立**（`fish-b-reverse2.mjs`：正控环境里 abort 4 个 catalogue ⇒ `BOOT_OK=false` 变红，肯定用例仍在） | 三档（默认 + `master` + `IllegalPerformance`）**零档真 boot**（`anyBoot=false`）、**零条大字节 200 打到 release**（`anyBigRelease=false`）。**同类肯定用例**：只补两个头 ⇒ boot OK、`evalJSON('40+2')=42`、11/11 release 200。总判 **FAIL**。 |
| **C** | `C-omc.md` | `C-raw.log` | `node fish-c-omc.mjs main`（五模式 `main/diag/positive/mirror/reverse`） | 有（§逐项汇总，`main 7 PASS / 7 FAIL`） | **PARTIAL**（reverse 模式 9 PASS / 7 FAIL，但 C 自注「main 本就未绿，反证只证能力缺席态」，按 G §5 不升格） | OMC `__omc` 未就绪、三条 `omc_eval` 判据 SKIPPED、`omc_load_msl` 被能力门短路（`CAPABILITY_UNAVAILABLE`，未走到 fetch）。18 条 manifest 全 `net::ERR_FAILED`（CORS）。OMC 是附加 flavor，须主引擎先 boot（`WasmEmbedAdapter.ts:131`）。 |
| **D** | `D-supply.md` | `D-raw.log` | `node /tmp/fishing-2026-11-05/fish-d.mjs` | 有（§结论 PASS；§② 16/17 命中表） | **成立**（§⑥ 把 `statistics` sha 第 1 位 `c→a` ⇒ 双确认 true→false，仅按名字仍命中＝肯定对照） | 供给定位 **PASS**：18 份 manifest `PIN-MATCH 18/18`；17 包按「`basename(pack.url)`+`pack.sha256`」双确认命中 **16/17**；第 17 个 pyodide 是 `form:"tree"` 合规例外（不同字节集合，非命中失败）。§⑧ 翻案：4 个 `.tar` 是真 release 字节。 |
| **E** | `E-plugins.md` | `E-raw.log` | `node fish-e-plugins.mjs http://localhost:8906/repo/Octave/` | 有（§逐项总表，`=== 28 PASS / 0 FAIL ===`） | **成立**（§8.1 置空 `modelContext` ⇒ 红、恢复 ⇒ 绿；§8.2 拦 `App.*.js` ⇒ 面全消失，含同类肯定用例） | 插件 + WebMCP **PASS**：`listTools()` 恰好 7 个且名字逐字一致；3 条 `callTool` 真返回（`octave_list_packages` 得 17 包、system_state 七键、workspace 空结构）；5 个插件真注册。**`octave_eval` 成功路径未验**（本页引擎未 boot，交引擎票）。 |
| **F** | `F-fzstd.md` | `F-raw.log`、`F-result.json` | `cd /mnt/hdd/zcode-test/harness && node fish-f-fzstd.mjs` | 有（§逐项判定 F1–F8 全 PASS；但 §0 明确「默认网络 F2–F8 属未验/路径未触发」） | **成立**（§F8 abort `fzstd-0.1.1.mjs` ⇒ zstd 解码失败、回退链换 gzip、下载仍成功，与主态反差明确） | **受控补头条件下** F1–F8 **全 PASS**：fzstd 同一 document 只发 **1** 次请求、2 次独立解码 16 个 zstd 分片；4 类 storage 全空、写入 Proxy 0 次；nonce 每页唯一；大件 zstd / 小件 gzip；并发峰值 **2**。**默认网络（环境原样）下 zstd 路径未触发 ⇒ 未验，不是 PASS**。 |
| **G** | `G-reverse.md` | `G-raw.log` + `G-A*.log`/`G-B.log`/`G-natural.log` | `node fish-g-reverse.mjs 8919 natural`（六个 mode 见 §8） | 有（§6 总表 15 项） | **成立**（§3 注释 `console.error` ⇒ `9 PASS / 2 FAIL` 红、还原 ⇒ `11 PASS / 0 FAIL` 绿，`git diff` 空） | 失败可见性（情形甲）**PASS**：`[catalogue] ALL 4 candidate(s) failed … release benefits are LOST` 出现，回落不白屏、pageerror=0；甲/乙两种原因可区分。**`MODE=natural` 10 PASS / 1 FAIL**：目录 200 但 18 条 manifest 全被 CORS 拦、仅一条 warn ⇒ 「release 全线不可达」不响亮，**FAIL/待修**（不改代码自证）。 |
| **H** | 本文件 | —（汇总，原始日志见上七行） | 见本文件各节 | 有（§2 验收表 + §4 裁定） | 不适用（汇总票，不产新钓鱼探针） | 见 §2、§4。 |

**MISSING 检查**：A–G 七张票**报告 .md 全部存在**、**都有复跑命令**、**都有原始日志 / 结构化结果**、
**都有 PASS/FAIL 判定**、**都有反向断言段落**（C 为 PARTIAL，其余成立；票 G §5 记
「MISSING：无」）。**无任何一项 MISSING**。

### 1.1 八张票的 commit sha 与证据路径

| 票 | 分支 | commit sha | 报告 / 原始证据（绝对路径） |
|---|---|---|---|
| A | `fish/A` | `0bb46b3` | `/tmp/fishing-2026-11-05/evidence/A-supply.md` · `A-raw.log` · `A-releaselike-predicate.sh` |
| B | `fish/B` | `9c3b4c8` | `B-octave.md` · `B-raw.log` · `B-summary.json` · `B-positive.log` · `B-eval42.log` · `B-reverse2.log` |
| C | `fish/C` | `746acc7` | `C-omc.md` · `C-raw.log` |
| D | `fish/D` | `35fe7bb` | `D-supply.md` · `D-raw.log` |
| E | `fish/E` | `34d3598` | `E-plugins.md` · `E-raw.log` |
| F | `fish/F` | `d3e47d2` | `F-fzstd.md` · `F-raw.log` · `F-result.json` |
| G | `fish/G` | `cfb0eb6` | `G-reverse.md` · `G-raw.log` · `G-A*.log` · `G-B.log` · `G-natural.log` |
| H | `fish/H` | 本提交（见 §6） | 本文件 `docs/acceptance/2026-11-05-no-hosted-release.md` |

复跑（列出全部 sha）：
```bash
for t in A B C D E F G H; do git -C /mnt/hdd/antigravity-projects/Octave-UI log --format='fish/'$t' %h %s' -1 fish/$t; done
```

---

## 2. 30 条 User Story 逐项验收表

判定口径：**PASS** = 有真浏览器/真产物实测支持；**FAIL** = 实测不成立（含站侧 BLOCKER
导致的真 FAIL）；**未验** = 前置未满足 / 环境限制导致没测到（如实写，不美化）；
**假红（夹具过宽）** = 因净化判据把非 release 字节（`.oct`）一起移走而出现的 FAIL，非产品缺陷。
证据文件名均在 `/tmp/fishing-2026-11-05/evidence/` 下，表中省略目录前缀。

| # | User Story（缩写） | 判定 | 证据 / 复跑 |
|---|---|---|---|
| 1 | `dist/` 里 61 个大字节是否仍被依赖 | **PASS**（已查清） | `A-supply.md` §1：粗净化 767、精确 75、最终 79；4 个 `.tar` 漏移另计 `A-supply.md` §1.4 / `D-supply.md` §⑧ |
| 2 | 移走站内 release 字节后重跑全链路、证伪「本地兜底冒充 catalogue」 | **FAIL** | `B-octave.md`（零档 boot、`lanes/*.wasm` 404）、`C-omc.md`、`SHARED.md` ★★★★★ |
| 3 | 看每条大字节的真实请求 URL（release 侧而非站内） | **FAIL**（线上）/ **PASS**（正控） | `B-raw.log` 请求 URL 表（release 200 仅 catalogue 一条）；`B-positive.log` 11/11 release 200 分片 URL |
| 4 | catalogue 双线都验一遍 | **PASS** | `A-supply.md` §3/§4（EO 11245 B、CF 11425 B，18+18 manifest sha 一致） |
| 5 | `manifest_sha256` 在真链路被校验 | **PASS**（服务端/契约层） | `A-supply.md` §4（18/18）、`D-supply.md` §①（PIN-MATCH 18/18）、`F-fzstd.md`（受控补头逐份 sha） |
| 6 | `base_proxy` 在 `base` 超时时真被用上 / 至少记录为可用 | **FAIL（未消费）/ 在场** | `A-supply.md` §4.2（18/18 在场、抽样 3 条 -L 200）；`C-omc.md` §请求表、**`B-octave.md` §请求 URL 表**：`releaseCatalogue.ts` 只循环 `release.base`，`resolveEngine` 路径零 github.com 请求 |
| 7 | Octave 三档各自真 boot | **FAIL** | `B-summary.json` `anyBoot=false`、`verdict=FAIL`；三档 `octave:undefined` / 启动超时 |
| 8 | Octave 真执行一行代码并看到输出 | **PASS（仅正控）/ FAIL（线上）** | `B-eval42.log`：`evalJSON('40+2') → value:42`、`[log] 42`（只补两个头的正控）；线上 `B-octave.md` 零档 boot |
| 9 | OMC 引擎真起来 | **FAIL** | `C-omc.md` §逐项：`__omc:undefined`、`omcEval:null`、就绪耗时「未就绪」 |
| 10 | `omc_eval` 正反两条（真包 / 假包）都真跑 | **未验（SKIPPED）** | `C-omc.md` §判据 3a/3b/3c：三条 `omc_eval` 判据因 `__omc` 未就绪 SKIPPED，不手写复刻、不手动装配 |
| 11 | `omc_load_msl` 真装 MSL（不靠手动 `__omc`） | **FAIL / 未验到** | `C-omc.md` §判据 4：`CAPABILITY_UNAVAILABLE` 能力门短路、未走到 fetch；补充探针 `fish-c-msl-probe.mjs` 只证工具站内 `url` 目标 404 |
| 12 | LLVM `clang.wasm` 按产物名+sha 命中 release | **PASS**（契约定位）/ **FAIL**（运行期取用） | `D-supply.md` §④（14 entry，`clang.wasm` 48,069,274 B sha 与市场逐字一致）；`SHARED.md` ★★★ + `D-supply.md` §⑧（`assets-loader.js:475` 硬编码站内路径） |
| 13 | 13 个 forge 包按内容契约定位 release | **PASS** | `D-supply.md` §②（13/13 全命中 `Octave-Extra-Content/forge-*`，双确认） |
| 14 | pyodide `form:"tree"` 例外如实记录 | **PASS** | `D-supply.md` §③（肯定对照 `findHit` FOUND 后才判 `nameOnlyHit` NONE；契约 `size` 22,013,349 B vs 实际文件 9,598,218 B vs release `pyodide-core-314.0.7.tar.bz2` 6,757,104 B） |
| 15 | 五个插件真注册、包管理器目录非空 | **PASS** | `E-plugins.md` §6（webMcp/packageManager/p5FigureOverlay/pretext/search 逐项浏览器实测；`octave_list_packages` 得 17 包） |
| 16 | WebMCP 七个工具在真产物里可读 | **PASS** | `E-plugins.md` §2（`count:7`，七个名字逐字一致）；`C-omc.md` §环境、票 B 每档肯定用例互证 |
| 17 | WebMCP 至少三条主路径 `callTool` 真返回 | **PASS** | `E-plugins.md` §4（三条 resource(JSON) 真返回体 + `callStats` 3 条 `ok:true`） |
| 18 | fzstd 在真浏览器里只发一次请求 | **PASS（受控补头）/ 未验（默认网络）** | `F-fzstd.md` §F3（2 次独立解码 16 个 zstd 分片，fzstd 请求=1）；`F-raw.log`:40（默认网络 `fzstdReqs=0`，路径未触发 ⇒ 未验） |
| 19 | fzstd 字节不进任何 storage API 与 HTTP 缓存 | **PASS（受控补头）** | `F-fzstd.md` §F5（session/local/indexedDB/caches 全空、写入 Proxy 0 次）；OPFS 未直接观测列为未验 |
| 20 | fzstd 请求带 `no-store` 与每页唯一 nonce | **PASS（受控补头，间接证伪）** | `F-fzstd.md` §F4（32-hex nonce 逐页变）+ §F2（如实：`cache:'no-store'` 不产生请求头，未假装看到 `Cache-Control`） |
| 21 | `codecPreference` 在真产物上生效（大件 zstd / 小件 gzip） | **PASS（受控补头）** | `F-fzstd.md` §F6（`octave.wasm`/`.data` zstd、`octave.js` gzip） |
| 22 | 默认并发 2 在真下载上被观测（峰值 ≤ 2） | **PASS（受控补头）** | `F-fzstd.md` §F7（`peakInFlight = 2`，分片时序复核 `F-raw.log`:213-231） |
| 23 | catalogue 全探测失败时响亮报错 | **PASS**（修复后产物） | `G-A.log` 第 30 行 `[catalogue] ALL 4 candidate(s) failed … release benefits are LOST`（`=== MODE=A: 11 PASS / 0 FAIL ===`）；`G-reverse.md` §1/§3 |
| 24 | 探测失败与「确实没有 release」在 UI/日志里可区分 | **PASS** | `G-reverse.md` §2：甲 `ALL 4 … failed`（error 级，`loadCatalogue`）vs 乙 `no release carried artifact …`（warn 级，`onFallback`），级别/前缀/原因串/出处皆不同 |
| 25 | 每个子代理的钓鱼结果落成可复跑证据文件 | **PASS** | A–G 七份 `.md` 报告已收进本 PR 分支 `docs/acceptance/evidence/`（换 checkout 不丢）；原始 `-raw.log` 体量较大，留在 `/tmp/fishing-2026-11-05/evidence/` 并在各报告里给出绝对路径 + 复跑命令。本报告 §1 表（七份 .md + 各 -raw.log + 复跑命令）；票 G §5 记「MISSING：无」 |
| 26 | 每张票都有反向断言（把能力拿掉必须红） | **PASS（6 张成立）/ PARTIAL（C）** | `G-reverse.md` §5：A/B/D/E/F 成立、**C=PARTIAL**（C 自注 main 本就未绿，反证只证能力缺席态）；G 自身 §3 成立 |
| 27 | 所有证据在同一份 dist 副本上采集 | **PARTIAL（不是 PASS）** | `SHARED.md` §共享路径；`A-supply.md` §1.1（394 文件）。**破纪律三处**：① 票 G 为产物级反向断言另建 `dist-G` / `dist-G-rev` 并重编 `App.js`（`G-reverse.md` §3）；② 票 B / F 用本地中继回放真实字节、补 CORS/CORP 头（`B-octave.md` 正控、`F-fzstd.md` §受控补头）；③ 票 A 另用 `dist-precise` / `dist-full` 做分类对照。spec 要求「共用这份副本，不各自建自己的 dist，避免两张皮」⇒ 已破。另 `dist-clean` 漏 4 个 `.tar`，最终口径应为 `dist-full`（79）。**修复后需在 `dist-full` 上重跑 A–G 同一判据**（列入 §5 未验边界） |
| 28 | 验收集合覆盖 EO 主线与 CF 备线各至少一次 | **PASS** | `A-supply.md` §3/§4/§4.1（EO 18/18、CF 18/18）；`F-fzstd.md`（受控补头用两份真 catalogue 11245/11425 B） |
| 29 | `EngineAssetResolver.assertBootable` 在真盘返回 verified | **未验** | A–G 七份报告均未出现 `assertBootable` / `verified` 的实测判据；票 B 的 boot 判据走 `window.octave`/`__octaveReady`，未直接调该断言。如实记未验，不推断 |
| 30 | 最终拿到逐项 PASS/FAIL 报告 + 诚实列出没验到的边界 | **PASS（本文件）** | 本文件 §2（本表）、§4（裁定）、§5（未验边界清单） |

**统计（避免「全部通过」误读）**：30 条里 **FAIL = 7 条**，**PARTIAL = 2 条**（#26 中票 C 的反向断言、#27 同一份 dist 副本纪律），
**未验 = 2 条**（#10 SKIPPED、#29 未验），其余为 PASS 或分层/条件 PASS（#5/#8/#12/#18 带「正控 / 受控 / 分层」限定）。
双判定行（#26 的「6 张成立 / C=PARTIAL」）不压成单一计数，判定列已逐项拆开。
**没有任何一条可以读成「全链路通过」**；#27 由初稿的 PASS 降为 PARTIAL，是 code-review 双轴审查
（Spec 轴发现票 G 另建 `dist-G`/`dist-G-rev`、票 B/F 走中继补头 ⇒ 破「共用一份副本」纪律）。

**双斜杠判定归类口径（#3 / #6 / #8 / #11 / #12 / #18）**：判定列里带 `/` 的双判定
（如「PASS（正控）/ 未验（默认网络）」）**左边为受控条件下成立、右边为默认线上路径未验**，
两者各自独立、不许合并读成 PASS；写成双判定正是因为默认线上路径没有被验到
（受控补头 / 正控回放不等于线上路径已通）。本表其余带括号限定（如「PASS（受控补头）」）
同此口径：括号是成立条件，不是可省略的修饰。

---

## 3. 四处真缺陷（主会话独立诊断，本次验收最有价值的产出）

> 以下定性照抄 `SHARED.md` 主会话诊断并补证据指针。**均为 BLOCKER / 真 FAIL，
> 不是「测不到 ≠ 不存在」的探针缺陷**——同类肯定用例（catalogue 200 / 页面 200 /
> listTools 七工具 / 正控 boot+42）全部 PASS，探针看得到「存在」。
> 另有票 G 新报的**第五处**（§3.5，单独列，不混进前四条）。

### 3.1 站侧 CORS/CORP BLOCKER（决定整轮 FAIL 的根因）

`static.isui.ren/catalogue.json` 由 `TencentEdgeOne` 发送，带
`Access-Control-Allow-Origin: *` + `Cross-Origin-Resource-Policy: cross-origin`；
但同域 `/ArchivalEra/*` 的 **manifest 与 `.zstd.*` 分片由 `Windows-Azure-Blob/1.0` 发送、
两头都缺**；GitHub `base_proxy` 302 到 `release-assets.githubusercontent.com` 的资产**也缺**。
页面 `COEP: require-corp`（`scripts/serve.py` 与真站同款、`window.crossOriginIsolated=true`）
⇒ 浏览器里 **18 条 manifest 全 `net::ERR_FAILED`**（`blocked by CORS policy: No
'Access-Control-Allow-Origin' header`）。不是「整个域没开 CORS」，而是 `/ArchivalEra/*`
这条路径没继承 `/catalogue.json` 的规则。

- 证据：`/tmp/fishing-2026-11-05/evidence/C-raw.log:148–162`（逐字 CORS 报错）、
  `B-octave.md` §根因（路径级头差异表 + 页内 fetch vs 服务端 `page.request.get()` 对照）、
  `G-natural.log`（`corsLines=18`）、`C-omc.md` §根因（独立复现，互为印证）、
  `F-fzstd.md` §0（R1–R4 curl 带 `Origin` 复核）。
- 复跑：
  ```bash
  U=https://static.isui.ren/ArchivalEra/OpenModelica-Full-Wasm/releases/download/v0.2.0-wasm32/manifest.json
  curl -sSI "$U" | grep -iE "HTTP/|access-control"        # ⇒ 200，无 ACAO
  grep -n "blocked by CORS" /tmp/fishing-2026-11-05/evidence/C-raw.log | head -3
  ```
- 定性：**站侧/镜像交付面缺口（缺响应头），不是本仓 UI 消费代码缺陷**。票 A 用 curl
  拿到的 18/18 PASS 是服务端证据，**不能外推成浏览器可用**。但用户要的是「站上不托管、
  浏览器从 release 取」，浏览器此刻取不到 ⇒ **本次验收 FAIL 成立**。
- 修复（非本仓能改）：把 `/ArchivalEra/*`（release 资产与 manifest）纳入与
  `/catalogue.json` 相同的 `access-control-allow-origin: *` 规则，并确认 GitHub 备线最终
  资产域的 CORS/CORP。**修复后需重跑票 B、C、F 的线上路径**。

### 3.2 引擎下载回落站内 `lanes/` 旧路径

release 解析失败（`resolveEngine()` 返回 null）后，`DownloadStore` **静默回落到站点
`lanes/<lane>/octave.wasm` 整包路径**——该路径在净化 dist 里字节已被物理移走 ⇒
**404 ⇒ `STORAGE_WRITE_FAILED`**。三档 toast 逐字一致；`master`/`IllegalPerformance`
是 `lanes/<lane>/w64/octave.wasm`。「回落整包」本身是设计内降级（离线可用是真需求），
但在「站上零 release 字节」的新形态下必然失败，且报错指向站内路径，会把排障带向
「是不是 lanes 没同步」而不是「release 没取到」。

- 证据：`B-summary.json`（三档 toast + `verdict=FAIL`）、`B-octave.md` §根因/§逐档、
  `SHARED.md` ★★★★★ 根因链、`B-reverse2.log`（abort catalogue 后同样回落 404）。
- 复跑：
  ```bash
  grep -n "STORAGE_WRITE_FAILED" /tmp/fishing-2026-11-05/evidence/B-summary.json
  grep -n "anyBoot\|anyBigRelease" /tmp/fishing-2026-11-05/evidence/B-summary.json
  ```
- 定性：**真 FAIL，不是净化夹具过宽的假红**——`dist-full` 保留了 `.oct`、移走 79 个
  release 字节，而 404 的 `lanes/*.wasm` 属精确口径内应移走的字节。
- 修复方向（产品决策，本报告只报不改）：(a) release 解析失败时明确报「release 不可达」
  且不尝试站内引擎字节；或 (b) 保留离线兜底但把原因说清是「release 不可达 + 离线兜底
  也不存在」，不许指向 `lanes/` 让人误判同步问题。

### 3.3 失败可见性不足（catalogue 成功但 release 全线不可达只折叠成一条 warn）

`loadCatalogue` 的成功判据**只看「目录 200 / 形状合法」**，不看「目录里的 release 能不能用」。
自然状态（`MODE=natural`，不注入任何 abort）：catalogue 200 ⇒ **不报** `[catalogue] ALL …
failed`（`loudLines=0`）；随后 18 条 manifest 全被 CORS 拦；全表扫失败后**只有一条 warn**
（`[downloads] engine release unavailable … no live release carried product … — falling back
to site lanes path`）。上级看不出「release 全线不可达」，与回信 103 §2「失败要让人看见」
的精神不符。

- 证据：`/tmp/fishing-2026-11-05/evidence/G-reverse.md` §4.2、
  `/tmp/fishing-2026-11-05/evidence/G-natural.log`（`=== MODE=natural: 10 PASS / 1 FAIL ===`，
  第 33 行 `2d` 判据 FAIL/待修）。
- 复跑：
  ```bash
  cd /mnt/hdd/zcode-test/harness && node fish-g-reverse.mjs 8919 natural
  grep -nE 'MODE=natural|2d|loudLines|corsLines' /tmp/fishing-2026-11-05/evidence/G-natural.log
  ```
- 定性：**FAIL / 待修（本仓可修的真缺陷，钓鱼不改代码自证）**。注意与 §3.1 分开：
  人造 abort（情形甲）与真实 CORS 失败不同源、同形，`G-reverse.md` §4.1 已明确区分。
- **已知未修缺陷（spec 口径的如实记录）**：spec 对「唯一允许改产品行为的一处」还要求
  「**结构化原因 + 用户/维护者看得到**」。当前实现（`loadCatalogue` 全候选失败）只有
  `console.error` 一条字符串，**无结构化原因通道、无 UI 呈现**。本 PR 只实现
  `console.error` 一次；结构化原因与 UI 呈现属后续票，本次未做——不在本次修票范围
  擅自补 UI / 结构化通道（那会超出「唯一允许改产品行为的一处」，构成 scope creep）。
  故 `MODE=natural` 的 FAIL 保持 FAIL，不因本次修票改判。
- 建议（仅记录，不实现）：`resolveFirstLiveRelease` / `firstLiveEntryAcrossCatalogue`
  全表扫完且 `dead.length === catalogue.releases.length` 时补一条 error 级诊断，与
  `[catalogue] ALL … failed`、`no release carried artifact` 三者各自独立；修完补一条真浏览器
  反向断言（拿掉这条诊断 ⇒ 自然态判据变红）。

### 3.4 LLVM / MSL 硬编码站内路径（H 裁定题的答案：FAIL）

`assets-loader.js:475 var B='assets/llvm/';`（硬编码站内相对路径）；
`:467` 取 `assets/llvm/manifest.json`（站点自建索引，5559 B，非 release 字节）；
`:473` 选 `sysroot-headers.tar` / `.wasm64.tar`；`:474` 缺件即抛
`FLAVOR_UNAVAILABLE`（提示跑 `provision-llvm-wasm.sh`），**不会改从 release 取**。
4 个 `sysroot-headers*.tar`（各 20,654,080 B）与 `LLVM-wasm/v0.1.6` release entry
字节级同物（sha 逐字一致），在最终口径 `dist-full` 里 ABSENT。
下游 `omc_load_msl` 的货架 `url` 仍是站内 `assets/msl/msl-4.1.0-maint.om.zip`
（净化后 404，`C-omc.md` 补充探针实测），未改从 catalogue 的 MSL release 取。

- 证据：`SHARED.md` ★★★（主会话独立诊断 + 复跑命令）、`D-supply.md` §⑧（4 个 `.tar`
  bytes+sha 双确认、`assets-loader.js` 行号、三份副本口径）、`C-omc.md` §判据 4
  （`fish-c-msl-probe.mjs` 的站内 404）、`A-supply.md` §1.4。
- 复跑：
  ```bash
  cd /tmp/fishing-2026-11-05/dist-full
  grep -n "sysroot-headers\|var B = 'assets/llvm/'\|FLAVOR_UNAVAILABLE" bridge/assets-loader.js
  find . -name "sysroot-headers*.tar"     # ⇒ 0 个（已移走）
  ```
- **裁定：FAIL**（不是假红、不是探针问题）。站上仍存在「硬编码站内路径依赖 release 字节」，
  这正是「完全不托管任何 release」尚未达成的一处真缺陷。
- 建议票（产品决策，非验收代理能定）：让 LLVM 工具链供给也走「分发契约 + 内容契约」
  （按产物名 + sha 定位），或明确宣布 LLVM 编译面在「不托管 release」模式下为
  out-of-scope。**不许顺手改产品代码让它过（钓鱼不得自证）**。

### 3.5 第五处（票 G 新报）：`fetchCatalog` 覆盖 `versions[]` 导致包下载走不到 catalogue

`BrowserAssetsAdapter.fetchCatalog` 用 `OctaveAssets.browse()` 返回的元数据**覆盖**市场目录的
`versions[]`，而 `browse()` 的 `versions[0]` **不带 `url`**
（逐字 `{"version":"0.1.2","stage":"staged","form":"pkg","content":["m"]}`）⇒
`wantedArtifactOf` 直接返回 `market contract gives no locatable single artifact (missing url)`，
**根本走不到 catalogue**。票 G 的情形乙必须用 `addInitScript` 注入标识全部来自真实产物
（`forge-catalog.json` 的 `cgi` `url`/`sha256`）的受控市场目录 + 受控合法
catalogue/manifest 才可达。这是产品侧另一条缺陷，票 G 只记录、未修、未替它修。

- 证据：`/tmp/fishing-2026-11-05/evidence/G-reverse.md` §2「诚实说明（一处探针必须修的坑）」
  （第 118–126 行）、§7 未验边界第 2 条（第 312–314 行）。
- 定性：**FAIL / 待修（包下载面，单独列，不混进前四条）**。与 §3.3 的区别：那是
  「引擎下载」的失败可见性；这里是「包下载」根本没进 catalogue 解析。
- 未验边界：情形乙在**未经 `addInitScript` 注入**的真货架上是否可达，本轮未验。

### 3.6 票 G 的两条判定（按 coordinator 要求一并汇总）

- **反向断言汇总（`G-reverse.md` §5）**：A/B/D/E/F **成立**；**C = PARTIAL**
  （C 自己注明 main 模式本就未绿，reverse 只证「能力缺席态」，不能单独证明是 release
  供给让 main 变红 ⇒ 不替它升格为 PASS）。**MISSING：无**（A–F 六张证据文件全在）。
- **`MODE=natural` = 10 PASS / 1 FAIL**（`G-natural.log` 第 66 行 / `G-raw.log`）：
  catalogue 目录 200 故不报 `ALL failed`（`2c PASS`），但 18 条 manifest 全被 CORS 拦
  （`corsLines=18`）、仅一条 warn ⇒ 「release 全线不可达」不响亮，`2d` **FAIL/待修**
  （不改代码自证）。

---

## 4. 明确回答：「完全不托管任何 release」是否验收通过

# **结论：FAIL。**

不许写成「部分达成」「基本通过」。理由分层如下。

### 4.1 哪几层是 PASS（产品代码是对的）

| 层 | PASS 内容 | 证据 |
|---|---|---|
| **供给服务端** | 双线 catalogue 200、18 份 manifest `manifest_sha256` 逐字一致（EO 18/18、CF 18/18）、18 条 `base_proxy` 在场 | `A-supply.md` §3/§4/§4.1/§4.2 |
| **契约定位** | 16/17 包按「产物名 + sha」双确认命中唯一 release entry；`clang.wasm` sha 与市场逐字一致；pyodide `form:"tree"` 合规例外如实记录；反向断言（改 1 位 sha 即红）成立 | `D-supply.md` §②/§③/§④/§⑥ |
| **插件 WebMCP** | `listTools()` 7 个逐字一致、3 条 `callTool` 真返回、5 个插件真注册、包目录 17 条非空；两条反向断言（置空 / 拦 chunk）绿→红→绿 | `E-plugins.md` §2/§4/§6/§8 |
| **fzstd 产品代码** | 在「受控补头 + 真字节 + 真产品代码」条件下：只拉 1 次、no-store+每页唯一 nonce、4 类 storage 全空、codecPreference、并发峰值 2、abort 反向断言全 PASS | `F-fzstd.md` §F1–F8 |

### 4.2 FAIL 的根因（站侧响应头 + 本仓待修缺陷）

- **主因（非本仓代码 bug）**：站侧 `/ArchivalEra/*` 的 manifest/分片缺 `ACAO` + `CORP`
  （§3.1）。这是**部署/边缘配置**，UI 仓不能靠改代码自证。
- **本仓三处待修缺陷**：引擎回落站内 `lanes/` 旧路径（§3.2）、失败可见性不足（§3.3）、
  LLVM/MSL 硬编码站内路径（§3.4）；外加包下载面第五处（§3.5）。
- **判据纪律**：「测不到 ≠ 不存在」已守——同类肯定用例（catalogue 200 / 页面 200 /
  `listTools` 七工具 / eval 探针能区分真假 / 正控下载态 `✓ Downloaded`）全部 PASS，
  探针看得到「存在」，所以全红是**真缺陷**而非内容仓 104 那种「点了空元素」。

### 4.3 票 B 的同类肯定用例（决定性地证明产品代码是对的）

`fish-b-positivecontrol.mjs`：净化 dist 不变、真浏览器不变、真 UI 路径不变、真 catalogue
快照（`cat-eo.json`，11245 B / 18 条）与真 release 字节不变；**唯一改动** = playwright
`page.route()` 把 release URL 重定向到本地中继 `routeserve.py`，中继从真实
`static.isui.ren` 取字节并**只补** `access-control-allow-origin: *` 与
`cross-origin-resource-policy: cross-origin` 两个响应头（字节不进净化 dist、零产品改动）。

实测（`B-positive.log` / `B-eval42.log`）：
- `wasm32-final` **真 boot 成功**：`{"octave":"object","hosts":1,"hostReady":[true],"ready":true}`、
  `BOOT_OK=true`、`__octaveReady===true`；
- **`window.octave.evalJSON('40+2')` → `{"ok":true,"value":42,"rc":0}`**（数值硬证据），
  console `[log] 42`；
- **11/11 release 请求 200 / 0 FAILED**（其中 9 条大字节分片，真 URL 如
  `…/wasm32__octave.wasm.zstd.000`）；`POSITIVE_CONTROL: PASS`。

复跑：
```bash
python3 /tmp/fishing-2026-11-05/evidence/routeserve.py            # 另开终端常驻
cd /mnt/hdd/zcode-test/harness
node fish-b-positivecontrol.mjs   # → B-positive.log
node fish-b-eval42.mjs            # → B-eval42.log（value:42）
```

⇒ **证明产品代码是对的，卡的是供给侧响应头**。**修复后需重跑 B、C、F 的线上路径**
（B/C 同源 CORS 链；F 的默认网络 zstd 路径同样被该头拦住，F2–F8 目前只在受控补头下成立）。

### 4.4 「假红」与「真 FAIL」分开

| 类别 | 内容 | 定性 |
|---|---|---|
| **假红（夹具过宽）** | 粗净化 767 条里 **692 个 `.oct`** 是 forge 内容包 `.tar.gz` **解包后的工具箱产物**（catalogue 44 个 entry 中 **0 个 `.oct`**），不是 release 交付的引擎字节。因 `.oct` 缺失导致的 FAIL 一律**不算产品缺陷** | `SHARED.md` ★补充侦察、`A-supply.md` §1.2、`D-supply.md` §⑧；主会话另备 `dist-precise`（75，保留 `.oct`）与 **`dist-full`（79，最终口径）** 供重跑定性 |
| **真 FAIL** | `lanes/*.wasm` 404（§3.2）、18 条 manifest CORS 拦（§3.1）、`assets-loader.js` 硬编码站内路径（§3.4） | 这些 404/缺件都落在**精确口径内应移走的 release 字节**上，与 `.oct` 无关 ⇒ 不是假红 |
| **净化完备性自身缺口（夹具问题，非产品缺陷）** | 粗净化（767）与精净化（75）都**漏了 4 个 `*.tar`**（20 MB `sysroot-headers*.tar`，真 release 字节）⇒ 这两份副本按「字节级 release 大字节为 0」口径**不完备** | `A-supply.md` §1.4、`D-supply.md` §⑧、SHARED ★★；最终口径用 `dist-full`（79 行清单 `/tmp/fishing-2026-11-05/release-only-full.txt`） |

三份副本文件数（复跑 `for d in ...; do find $d -type f | wc -l; done`，`SHARED.md` ★★ 主会话核过）：
原始 `dist` 1161 / `dist-clean` 394（漏 4 `.tar`） / `dist-precise` 1086（漏 4 `.tar`） /
**`dist-full` 1082（非 `.oct` releaselike = 0，最终口径）**。

---

## 5. 没验到的边界（逐条列，不许用「应该可以」补）

1. **低端设备（2GB 内存手机）性能量测**：spec 已列 Out of Scope，A–G 均未测。
2. **CF 备线在本机 Chromium 直连 `ECONNRESET`**：`B-octave.md`（`netcheck.mjs`）、
   `C-omc.md` §mirror 模式（Chromium `--no-proxy-server` 直连出口限制，curl 走
   `127.0.0.1:2080` 代理则 200）⇒ 未验备线自身在浏览器里是否带 CORS 头；按硬约束
   记为「环境限制」，不计产品 FAIL。
3. **master / IllegalPerformance 两档补头后未验**：票 B 正控只跑了默认 `wasm32-final`
   一档（`B-octave.md` §诚实边界）；「补头后三档全绿」未被证明，三档基线全红结论不受影响。
4. **`base_proxy` 在 `resolveEngine` 路径未被消费**：`B-octave.md` / `C-omc.md` 实测浏览器
   零 `github.com` 请求；`firstLiveEntryAcrossCatalogue` 只循环 `release.base`
   （`catalogueReleaseSource.ts:186-197`）。18 条 `base_proxy` 仅票 A 抽样 3 条 `-L` 200，
   **未逐条测全 18 条**（`A-supply.md` §7）。
5. **pyodide `form:"tree"` 例外**：`D-supply.md` §③ 已如实记录为合规例外（不同字节集合），
   **不是命中失败**；本轮未把它写成能力上限，也未偷偷改成猜测性映射。
6. **`omc_eval` 三条 SKIPPED**：`C-omc.md` §未验边界第 1 条（3a/3b/3c 因 `__omc` 未就绪
   未真跑，不手写复刻、不手动装配）。
7. **`omc_load_msl` 未走到 fetch**：`C-omc.md` 第 2/3 条（能力门短路；「从 release 成功装
   MSL」与「工具报 404」两种结果都没拿到；MSL release 是否会被工具改用，本轮未验到）。
8. **正面 boot 探针的完整同类肯定用例缺失（OMC）**：`C-omc.md` 第 6 条（positive 模式只
   回放了 OMC wasm，主引擎三档字节仍在净化盘外，没能演示「净化盘 + release 可达 ⇒ `__omc`
   真起来并三条判据全绿」）。
9. **fzstd 默认网络（环境原样）F2–F8 = 未验（路径未触发）**：`F-fzstd.md` §0 / §诚实边界
   第 1 条（manifest/chunk 缺头 ⇒ `decoders.zstd` 从未被调用 ⇒ `fzstdReqs=0`，既不能证
   「只拉一次」也不能证「拉了多次」）。F2–F8 的 PASS **仅成立于受控补头条件**。
10. **`cache:'no-store'` 不产生请求头**：`F-fzstd.md` §F2 / §诚实边界第 3 条（如实说明未
    假装看到 `Cache-Control` 头，用 nonce 唯一性 + 单 document 单次 + 反向断言间接证伪）。
11. **OPFS 写入未直接观测 / 浏览器重启后 HTTP 缓存未跨进程取证**：`F-fzstd.md` §诚实边界
    第 4/6 条。
12. **`assertBootable` 在真盘返回 verified**：A–G 均未出现该判据实测 ⇒ 本报告 #29 记未验。
13. **情形乙在未经 `addInitScript` 注入的真货架上是否可达**：`G-reverse.md` §7 第 2 条
    （即 §3.5 第五处缺陷的未验面）。
14. **修好 release manifest ACAO 之后自然态是否还会静默回落**：`G-reverse.md` §7 第 1 条
    （需生产侧 CORS 修复或中继补头后重跑 `MODE=natural`，本轮不修、不补头自证）。
15. **`octave_eval` 成功路径（票 E 窗口内）**：`E-plugins.md` §5 / §诚实边界第 1 条
    （本页引擎未 boot，按票 E 指令未验；成功/失败由引擎票判，本报告的 #8 以 B 正控为准）。
16. **其余四个 WebMCP 工具的 `callTool` 返回体**：`E-plugins.md` §诚实边界第 3 条
    （`octave_run_cell` / `octave_install_package` / `omc_load_msl` 等仅验到在册，未逐条调用）。
17. **五个插件的 `pluginRegistry.getAll()` 枚举**：`E-plugins.md` §诚实边界第 5 条
    （registry 未挂 `window`，经各插件可观测副作用逐项量到，不是读 registry）。
18. **A–G 在 `dist-clean` 上跑出的 FAIL 与 `.oct`/`.tar` 缺失相关者**：按 `SHARED.md` ★★
    须在 `dist-full`（端口 8911）上重跑同一判据再定性；本轮 A–G 共用的是 `dist-clean`。
19. **真站点 `isui.ren` 的部署操作 / 线上 `isui.ren` 路径**：spec Out of Scope，本轮全在
    本地净化副本 + 本地中继；GH 直连间歇超时票 F 本票未复现（主会话/票 C 已记录）。

---

## 6. 提交与环境状态说明

- 本报告路径：`docs/acceptance/2026-11-05-no-hosted-release.md`（`fish/H` 分支）。
  原始日志**未复制进仓**，全在 `/tmp/fishing-2026-11-05/evidence/`；报告内给出的绝对路径
  与复跑命令即为取证入口。
- 本票**未改任何产品代码**、未改 `SHARED.md`、未碰净化 dist。除报告外，本次提交还含事实系统
  **机器维护**的台账更新（不是人工撰写的内容）：`FACTS.json` 由
  `python3 zreflect/facts.py --accept-changes=md_files,md_lines` 逐键放行重测，
  `STATE.md` 的 `AUTO:FACTS` 机器块由 pre-commit 自动 `--render-doc` 重渲染。
  原因是新增被 git 跟踪的 `.md` 后，`check_facts_replay.py` 的逐字复跑判据
  （`git ls-files -- '*.md' | wc -l`）输出必然变化；不重测会让「能复跑」断言
  永久变红、CI 也会拒。报告不手抄这些数值：数值以 `FACTS.json` 为唯一产地，
  由 `--render-doc` 重渲染进 `STATE.md`，本报告不作第二产地（纪律 2：数字只生产一次）。
- **闸门环境状态（如实记录）**：`wt-H` 是新建 worktree，`check_locks.py` 会因缺少
  gitignored 的 `*.wasm` 工件而红。已从主仓
  `/mnt/hdd/antigravity-projects/Octave-UI/public/{bridge/w64,lanes/*/…}/octave.wasm`
  拷入 5 个 gitignored 工件（不进 git），逐条 sha 与 `upstream-lock.json` 全部一致，
  `python3 zreflect/check_locks.py` ⇒ `锁定源闸门：OK（7 个锁定源全部一致）`。
  复跑：
  ```bash
  cd /tmp/fishing-2026-11-05/wt-H
  python3 zreflect/check_locks.py
  . ./Einfacht.env && python3 zreflect/registry.py --run commit
  # => 相位 commit：ran 13 / off 4 / failed 0
  ```
  注意：直接裸跑 `python3 zreflect/check_readme_sync.py` 会红（因为未加载钩子环境的
  `Einfacht.env`，其 `REFLECT_READMES=README.md` 是单条目清单、三语互链判据退化）；
  **钩子实际执行时通过 `reflect-hooks/einfacht-env.sh` 加载该文件**，故 pre-commit 绿。
  4 个 `off` 闸门（ab/instruments/invariants/world）是**明说未启用 = 未查，不是通过**。
