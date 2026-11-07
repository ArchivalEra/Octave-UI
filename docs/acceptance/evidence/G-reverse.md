# 票 G · 反向断言 + catalogue 失败可见性（真浏览器取证）

- 子代理：`fish/G`，worktree `/tmp/fishing-2026-11-05/wt-G`（分支 `fish/G`，基线 `c2ab60f`）
- 采集时刻：**2026-11-05T13:25:52Z**（`date -u +%Y-%m-%dT%H:%M:%SZ`）
- 交付：本文件 + `/tmp/fishing-2026-11-05/evidence/G-raw.log`（全部原始 stdout）+ `/mnt/hdd/zcode-test/harness/fish-g-reverse.mjs`
- 端口：**8909** = 共享净化 `dist-clean`（只读，按分配）；**8919** = `dist-G`（本票为做反向断言另建的受控副本，见 §0）
- 唯一可信 seam：`/usr/bin/chromium` + harness 目录 playwright，真页面真点击

> 纪律：数字只认实测，每个数字旁给复跑命令；「测不到 ≠ 不存在」先给同类肯定用例；
> 断言可证伪（把能力拿掉必须红）。**本票不改产品代码**（唯一临时注释见 §3，已还原，`git diff` 空）。
> **不碰净化 dist-clean**（只读）；不改 SHARED.md。

---

## §0 先说清一个绕不开的前置事实（否则所有判据都会假绿/假红）

**共享 `dist-clean` 的构建产物早于 PR #27 的修复提交**，其 `loadCatalogue` 是**旧的静默版**。
所以「在共享 dist-clean 上掐掉所有 catalogue 候选」必然看不到新日志 —— 这不是产品缺陷，是
「拿旧产物验新代码」的时间差。必须先把修复后的源码编进产物，才能验这条改动。

复跑（`G-raw.log` §0 逐字）：

```bash
stat -c '%y %n' /mnt/hdd/antigravity-projects/Octave-UI/dist/_astro/App.BL-Zkp6f.js
#   => 2026-11-05 20:13:45 +0800
git -C /tmp/fishing-2026-11-05/wt-G log --format='%h %ci %s' -1 c2ab60f
#   => c2ab60f 2026-11-05 20:22:31 +0800 feat(storage): catalogue probe failure must be loud (letter 103)
python3 -I -c "s=open('/tmp/fishing-2026-11-05/dist-clean/_astro/App.BL-Zkp6f.js').read(); i=s.find('async function wo('); print(s[i:i+200])"
#   => async function wo(s,e,t){...for(const r of a)try{...}catch{}return null}   ← 旧静默版，catch 吞掉，无 console.error
grep -c 'release benefits are LOST' /tmp/fishing-2026-11-05/dist-clean/_astro/App.BL-Zkp6f.js   # => 0
```

**受控 A/B 的做法（不改 dist-clean、不改产品源码）**：从 `wt-G` 源码 `node_modules/.bin/astro build`
重编，取重编出的 `_astro/App.js`，拷进 `dist-clean` 的**一份副本** `dist-G` 并只替换
`index.html` 里 `App.BL-Zkp6f.js` → `App.sEtJRffo.js` 这一处引用。**兄弟 chunk 逐字节一致**
（`G-raw.log` §0 的 md5 对：`client.svelte.r4scnHsL.js` / `render.hnfFKuod.js` /
`__vite-browser-external.BIHI7g3E.js` / `index.D4Wc3Vo-.css` 全同），因此 A/B 之间唯一的变量
就是 `App.js` 里 `loadCatalogue` 那一段。重编 bundle 里修复版逐字：

```
return console.error(`[catalogue] ALL ${a.length} candidate(s) failed — falling back to whole-file path (release benefits are LOST). Failures: ${r.join(" | ")}`),null
```

复跑：`cd /tmp/fishing-2026-11-05/wt-G && node_modules/.bin/astro build`（约 3 秒，
`G-raw.log` §0 有完整输出）；`dist-G` 的构造命令见 `G-reverse.md` 交付说明末尾。

**因此下面 §1 有两个结果，必须分开读**：
- `A-shared`（共享 dist-clean，旧产物）⇒ 判据 **RED / 2 FAIL**：这是「产物滞后」的证据，
  **不是**「修复没生效」的证据；
- `A`（dist-G，修复后产物）⇒ 判据 **GREEN / 0 FAIL**：这才是本改动在真产物上的验收。

---

## §1 验「失败要让人看见」（回信 103 §2）—— 情形甲

**触发路径（实探测得到，先证「点到了」）**：真页面加载 → 菜单 → `wasm32-final` 车道
`⬇ Download` → 依次 GET **4 个** catalogue 候选：同源 `/static/catalogue.json`、同源
`/catalogue.json`、EO `https://static.isui.ren/catalogue.json`、CF
`https://static.mango-mesa.ccwu.cc/catalogue.json`。这四个 URL 都由 `page.on('request')`
逐字记录（`G-A.log`/`G-A-shared.log` 的「catalogue.json 请求流水」8 行 REQ+FAIL）。

**拦截**：`page.route('**/*', route => /catalogue\.json/.test(url) ? route.abort('failed') : route.continue())`
—— 用 `**/*` + 谓词，覆盖**全部**候选（含 EO 与 CF 两域名、同源两条），不漏一个。

**同类肯定用例（证明「没看到日志」不是探针瞎）**：每次运行前 `page.evaluate(() => console.error(mark))`
注入一条合成 `[G-PROBE] <ts> synthetic-error-is-observable`，`page.on('console')` 必须看见它
（所有 6 个 mode 的 `0d` 全 PASS）。**这条也同时证明 A-reverse 的 RED 不是探针坏了。**

| 判据 | A-shared（旧产物, 8909） | A（修复后, 8919） |
|---|---|---|
| 页面 200 / modelContext 在 / 7 工具可达 | PASS（各 3 条） | PASS（各 3 条） |
| 4 个候选全被 abort 且被探针看见 | PASS（8 行流水） | PASS（8 行流水） |
| `0d` 合成 console.error 探针能测到「存在」 | PASS | PASS |
| **`[catalogue] ALL … candidate(s) failed`** | **FAIL（(none)）** | **PASS** |
| **含 `release benefits are LOST`** | **FAIL（(none)）** | **PASS** |
| 情形甲不误报乙原因 | PASS（0 行） | PASS（0 行） |
| **页面不白屏**（`bodyLen` / 关键 DOM） | PASS（`bodyLen=1223`） | PASS（`bodyLen=1283`） |
| **无未捕获 JS 异常**（pageerror=0） | PASS | PASS |
| 机器行 | `=== MODE=A-shared: 9 PASS / 2 FAIL ===` | `=== MODE=A: 11 PASS / 0 FAIL ===` |

**情形甲日志原文（逐字，`G-A.log` [2] 段）**：

```
[error] [catalogue] ALL 4 candidate(s) failed — falling back to whole-file path (release benefits are LOST). Failures: http://localhost:8919/static/catalogue.json: Failed to fetch | http://localhost:8919/catalogue.json: Failed to fetch | https://static.isui.ren/catalogue.json: Failed to fetch | https://static.mango-mesa.ccwu.cc/catalogue.json: Failed to fetch
```

> `ALL 4` 里的 `4` = 本轮 `catalogueUrlCandidates()` 实际产出的候选数（实测 4 条请求流水），
> 不是抄来的常量。复跑：`grep -c '^REQ .*catalogue.json' /tmp/fishing-2026-11-05/evidence/G-A.log`
> 与 `grep '\[甲\]\[abort\]' /tmp/fishing-2026-11-05/evidence/G-A.log | wc -l`（均为 4）。

**回落整包仍是合法降级**：catalogue 全断后 console 里同时出现
`[downloads] engine release unavailable for lane "wasm32-final": catalogue unavailable or empty — falling back to site lanes path`
（warn 级），页面 `bodyLen>100`、`astro-island` 与菜单按钮仍在、pageerror=0 ⇒ **不白屏、不抛未捕获异常**。

复跑（完整命令，stdout 即 `G-A.log` / `G-A-shared.log`）：

```bash
python3 scripts/serve.py --dir /tmp/fishing-2026-11-05/dist-clean --port 8909   # 共享净化副本
python3 scripts/serve.py --dir /tmp/fishing-2026-11-05/dist-G     --port 8919   # 本票受控副本
cd /mnt/hdd/zcode-test/harness
node fish-g-reverse.mjs 8909 A-shared | tee /tmp/fishing-2026-11-05/evidence/G-A-shared.log
node fish-g-reverse.mjs 8919 A         | tee /tmp/fishing-2026-11-05/evidence/G-A.log
```

---

## §2 两种原因不合并 —— 情形甲 vs 情形乙

**情形乙定义**：catalogue 可达（200，含 CORS 允许），但目标产物不在任何 release 里
⇒ `catalogueReleaseSource` 的 `onFallback` 报 `no release carried artifact …`。

**乙的真触发路径**：`octave_list_packages` / 不存在的包名**都不触发** `loadCatalogue`
（实测 `G-B.log` 之前的探索：`list_packages` 与 `octave_install_package{name:"signal"}` 的
`catalogue.json` 请求流水均为 `(none)`）。真触发是 **Packages 模态 → 包 Download → 确认
`data-action="confirm-download"`** → `downloadStore.download` → `resolveSrcTarget` →
`releaseSource.resolve`。

**诚实说明（一处探针必须修的坑）**：真产物里 `BrowserAssetsAdapter.fetchCatalog` 会用
`OctaveAssets.browse()` 的元数据**覆盖** `versions[]`，而 `browse()` 的 `versions[0]` 不带 `url`
（逐字：`{"version":"0.1.2","stage":"staged","form":"pkg","content":["m"]}`）⇒ `wantedArtifactOf`
直接返回 `market contract gives no locatable single artifact (missing url)`，**根本走不到 catalogue**。
这是产品侧另一条缺陷（本票不改、不替它修，如实记录）。为让乙判据可达，本票用 spec 允许的
`addInitScript` 注入一份**标识全部来自真实产物**的市场目录（`cgi` 的 `url`/`sha256` 取自
`forge-catalog.json`），并 `route.fulfill` 一份**受控合法** catalogue（1 条 release，base 取自真实
`cat.json`）与一份**受控合法** manifest（schema 3，`entries` 里只有 `octave.wasm`，与市场产物
basename `cgi-0.1.2.tar.gz` 不同）。注入前后都先证「注入到位 / catalogue 真的 200」。

**情形乙日志原文（逐字，`G-B.log` [2] 段）**：

```
[warning] [downloads] release contract unavailable for "cgi":  | no release carried artifact "cgi-0.1.2.tar.gz" (1 releases scanned) with expected sha — falling back to whole-file path
```

**两种原因可区分（机器判据，从两份原始 log 直接 grep）**：

| 关键串 | `G-A.log`（甲） | `G-B.log`（乙） |
|---|---|---|
| `ALL 4 candidate(s) failed` | 5 行（其中 1 行是断言标签，4 行是 console/关键行） | **0 行** |
| `release benefits are LOST` | 5 行 | **0 行** |
| `no release carried artifact` | **1 行（仅断言标签 `2c`，console 全量里 0 行）** | 4 行 |

复跑：

```bash
cd /mnt/hdd/zcode-test/harness
node fish-g-reverse.mjs 8919 B | tee /tmp/fishing-2026-11-05/evidence/G-B.log
printf '甲: '; grep -m1 '\[甲 loud \]' /tmp/fishing-2026-11-05/evidence/G-A.log
printf '乙: '; grep -m1 '\[乙 artifact\]' /tmp/fishing-2026-11-05/evidence/G-B.log
for k in 'ALL 4 candidate(s) failed' 'release benefits are LOST' 'no release carried artifact'; do
  echo "$k : A=$(grep -c "$k" /tmp/fishing-2026-11-05/evidence/G-A.log) B=$(grep -c "$k" /tmp/fishing-2026-11-05/evidence/G-B.log)"
done
```

**结论：PASS** —— 甲是「连目录都没拿到」（`[catalogue] ALL … failed` / `release benefits are LOST`，
error 级，出自 `loadCatalogue`）；乙是「目录拿到了、但没这条产物」（`no release carried artifact …`
，warn 级，出自 `catalogueReleaseSource` 的 `onFallback`）。两条日志的**级别、前缀、原因串、
出处都不同**，不合并成一句 fallback。

---

## §3 反向断言：把能力拿掉就红，还原就绿

**唯一允许改代码的地方**：在 `wt-G` worktree 的 `src/modules/storage/releaseCatalogue.ts`
把 `loadCatalogue` 末尾那句 `console.error(...)` 临时注释（标记为 `[G-REVERSE-TEMP]`），
重编 → `dist-G-rev`；跑完**立即还原**、重编 → `dist-G`。**未改 dist-clean、未改 SHARED.md。**

| 步骤 | 产物 | 情形甲判据 | 机器行 |
|---|---|---|---|
| 基线（修复后） | `dist-G` / `App.sEtJRffo.js`（含 `release benefits are LOST`） | `2a PASS` / `2b PASS` | `=== MODE=A: 11 PASS / 0 FAIL ===` |
| **拿掉能力** | `dist-G-rev` / `App.Bi2i-eHK.js`（`grep -c 'candidate(s) failed'` = **0**） | **`2a FAIL (none)` / `2b FAIL (none)`** | `=== MODE=A-reverse: 9 PASS / 2 FAIL ===` |
| **还原** | `dist-G` / `App.sEtJRffo.js`（`grep -c` = **1**） | `2a PASS` / `2b PASS` | `=== MODE=A-restore: 11 PASS / 0 FAIL ===` |

反向态的 console 关键行原文（`G-A-reverse.log` [2] 段）：

```
  [甲 loud ] (none)
  [甲 LOST ] (none)
  [fallback] [downloads] engine release unavailable for lane "wasm32-final": catalogue unavailable or empty — falling back to site lanes path
```

**这条 RED 是有效反向证据，不是探针坏**：`0d` 合成 `console.error` 探针在反向页**仍 PASS**
（`[G-PROBE] … synthetic-error-is-observable` 被看见），`0a/0b/0c/1a/1c/3a/3b` 全 PASS，
4 个候选照样被 abort 且被看见 ⇒ 只少了那一句 `console.error`。还原后 0 FAIL。

**额外的天然反向对照（非人造 abort）**：`A-shared`（共享 dist-clean 的旧静默产物）在同样
情形甲下也是 `2a/2b FAIL` —— 与「注释掉 console.error」得到的 RED **同形**，从产物侧交叉印证
「这句日志就是判据的唯一来源」。

复跑（临时注释/还原的完整命令见 `G-raw.log` §0 与本节；**注意每次都必须在 wt-G 下重编**）：

```bash
# 在 /tmp/fishing-2026-11-05/wt-G/src/modules/storage/releaseCatalogue.ts 注释 console.error(...)
cd /tmp/fishing-2026-11-05/wt-G && node_modules/.bin/astro build          # 产出 App.Bi2i-eHK.js
# 用该 App.js 换进 dist-clean 的副本 dist-G-rev，起服 8919
cd /mnt/hdd/zcode-test/harness && node fish-g-reverse.mjs 8919 A-reverse   # => 9 PASS / 2 FAIL（红）
# 还原源码（git diff 必须为空）→ 重编 → 重建 dist-G → 起服 8919
node fish-g-reverse.mjs 8919 A-restore                                      # => 11 PASS / 0 FAIL（绿）
```

---

## §4 ★ 人造 abort 与真实 CORS 失败必须分开（主会话 2026-11-05 追加要求）

### 4.1 两者不同源、同形，不许混成一个结论

- **人造 abort（§1 / §3）**：`page.route(...).abort('failed')` 主动掐断 4 个 `catalogue.json`
  候选 ⇒ `loadCatalogue` 全部 `fetchJSON` 抛 `Failed to fetch` ⇒ 触发 `[catalogue] ALL 4 …`。
  这是**为验「失败可见性」而造的受控失败**，与生产里 catalogue 为什么会失败无关。
- **真实 CORS 失败（本批共同根因）**：`catalogue.json` 本身 **200 且带
  `access-control-allow-origin: *`**；但同域 `/ArchivalEra/*` 的 release `manifest.json` 由
  Azure Blob 提供、**无 ACAO**，浏览器全拦。主会话票 C 真浏览器日志逐字：
  `Access to fetch at 'https://static.isui.ren/ArchivalEra/.../manifest.json' from origin 'http://localhost:8905' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource`。

本票 curl 复核（`G-raw.log` 末段逐字）：

```bash
curl -s -D - -o /dev/null https://static.isui.ren/catalogue.json | grep -iE 'HTTP/2|access-control|content-length'
#   HTTP/2 200 / access-control-allow-origin: * / content-length: 11245
curl -s -D - -o /dev/null https://static.isui.ren/ArchivalEra/LLVM-wasm/releases/download/v0.1.6/manifest.json | grep -iE 'HTTP/2|access-control|content-length|server'
#   HTTP/2 200 / server: Windows-Azure-Blob/1.0 Microsoft-HTTPAPI/2.0 / content-length: 28602
#   （无 access-control-allow-origin 行）
```

### 4.2 自然状态（不 abort）下的真实观察 —— `MODE=natural`

复跑：`cd /mnt/hdd/zcode-test/harness && node fish-g-reverse.mjs 8919 natural`
（stdout = `G-natural.log`）。**不注入任何 abort**，只点 `wasm32-final` 下载，观察 console：

- `catalogue.json` 请求流水逐字：同源两条 `RESP 404` → EO `RESP 200`（`static.isui.ren`），
  ⇒ **`loadCatalogue` 成功**，目录拿到了；
- console 里**没有** `[catalogue] ALL … candidate(s) failed`（`2c PASS`，`loudLines=0`）；
- 随后 **18 条** release `manifest.json` 全部
  `blocked by CORS policy: No 'Access-Control-Allow-Origin' header …`（`2b PASS`，`corsLines=18`）；
- 全表扫失败后只有一条 warn：
  `[downloads] engine release unavailable for lane "wasm32-final": no live release carried product "wasm32" (LLVM-wasm/v0.1.6:network, …, Octave-Extra-Content/supply-pyodide-314.0.7:network) — falling back to site lanes path`；
- 页面不白屏、pageerror=0。

**⇒ 判据：FAIL / 待修（本仓可修的真缺陷，不许改代码自证）**

`2d` 在 `G-natural.log` 里是 **FAIL**（机器行 `=== MODE=natural: 10 PASS / 1 FAIL ===`）。
根因：`loadCatalogue` 的成功判据**只看「目录 JSON 拿到且形状合法」**，不看「目录里的 release
能不能用」。于是「catalogue 可达但 18 条 release 全线不可达」这种最该响亮的场景，被折叠成
一条下属 `onFallback` 的 warn，**上层看不出「release 全线不可达」**，与回信 103 §2
「失败要让人看见」的精神不符。

**建议（仅记录，不实现、不改产品代码）**：在 `resolveFirstLiveRelease` /
`firstLiveEntryAcrossCatalogue` 全表扫完且 `dead.length === catalogue.releases.length` 时，
补一条 error 级诊断（例如 `[release] ALL N release(s) unreachable — …`），与
`loadCatalogue` 的 `[catalogue] ALL … failed` 以及 `onFallback` 的
`no release carried artifact` 三者各自独立、可区分。修完需补一条真浏览器反向断言
（把这条诊断拿掉 ⇒ 自然态判据变红）。

---

## §5 其他票的反向断言汇总（截至 2026-11-05T13:24:04Z 检查）

检查面：`/tmp/fishing-2026-11-05/evidence/*.md`。**此刻 A–F 六张票的证据文件全部已生成**
（无 MISSING）。逐张只看「是否真的给了『把能力拿掉就红』的演示」，不替别人补、不美化。

| 票 | 证据文件 | 反向断言演示 | 判定 |
|---|---|---|---|
| A | `A-supply.md` §5 | 净化态判据 `0`（绿）→ 放回 1 个真实 `w64/octave.wasm`（31,003,790 B）判据 `1`（红）→ 移除回 `0`（绿），副本 394 文件、服 200 | **成立**（有绿→红→绿 + 同类肯定用例）；注：A 自己声明该反证只证「扩展名口径」不自恒真，§1.4 另记口径漏 4 个 `.tar`，如实 |
| B | `B-octave.md` §反向 | `fish-b-reverse2.mjs`：**在同一本来能 boot 成功的正控环境里**只 abort 4 个 catalogue 候选 ⇒ `BOOT_OK=false`（红），同类肯定用例仍在；主探针里另有一次反证但因基线本就红，明确标为「非决定性」并另做无混淆版 | **成立**（决定性反证，且诚实区分了两次） |
| C | `C-omc.md` §反向断言 | `reverse` 模式 abort 全部 release 域名 ⇒ `__omc` 判据红（`9 PASS / 7 FAIL`）；同类肯定用例（页面 200 / modelContext / 7 工具 / positive 下载态 `✓ Downloaded`）全在 | **部分成立**：C **自己如实写明**「main 模式本来就没绿，该反向证据不能单独证明是 release 供给让 main 变红，只证明探针能演示能力缺席态」⇒ 按本票汇总口径记为 **PARTIAL**，不替它升格为 PASS |
| D | `D-supply.md` §⑥ | 把 `statistics` 的 sha 第 1 位 `c→a`（`cef3c090…`→`aef3c090…`）：双确认从 `true` → `false`（红），「仅按名字命中」仍 `true`（同类肯定对照：探针能看到存在） | **成立**（可证伪 + 正控） |
| E | `E-plugins.md` §8 | 同一 `listToolsCriterion()`：① 页面内 `window.modelContext = undefined` ⇒ `pass:false`（红），恢复 ⇒ `pass:true,count:7`（绿）；② `page.route` 拦掉 `App.*.js` ⇒ `modelContext`/三处直柄/`__webmcp_debug` 全消失（红），标题/`astro-island`/`OctaveP5`/`OctaveEmbed` 仍在（同类肯定），反向页 `pageerror=[]` | **成立**（两条、均含同类肯定用例 + 绿→红→绿） |
| F | `F-fzstd.md` §F8 | `route.abort('failed')` 掉 `lib/fzstd-0.1.1.mjs` ⇒ `[fzstd] load failed — zstd decoding disabled …`、zstd 解码抛错、codecs 回退链换 gzip（8 zstd 分片 → 9 gzip 分片），下载仍成功；与主态（大件全 zstd、小件 gzip）反差明确 | **成立**（能力拿掉→解码路径变红 + 回退链兑现）；F 自己在 §0 如实记「默认网络 F0 路径未触发、F2–F7 属未验」，不替它改写 |

- **MISSING：无**（六张票证据文件均存在，且都有反向断言段落）。
- **诚实边界**：C 记为 PARTIAL（证据作者自己标注的局限）；其余五张按各自原文判为成立。
- 复跑（列出检查面与时间戳）：
  ```bash
  date -u +%Y-%m-%dT%H:%M:%SZ     # => 2026-11-05T13:24:04Z
  ls -la /tmp/fishing-2026-11-05/evidence/*.md
  for f in A-supply.md B-octave.md C-omc.md D-supply.md E-plugins.md F-fzstd.md; do
    echo "=== $f ==="; grep -niE '反向|reverse|拿掉|变红|未验' "/tmp/fishing-2026-11-05/evidence/$f" | head -8
  done
  ```

---

## §6 逐项 PASS/FAIL 总表

| # | 判据 | 判定 | 证据 / 复跑 |
|---|---|---|---|
| 0 | 共享 dist-clean 产物早于修复提交（20:13 vs 20:22），旧静默 `loadCatalogue` | **实测事实**（非 PASS/FAIL） | §0，`G-raw.log` §0 |
| 1 | 情形甲（4 候选全 abort）出现 `[catalogue] ALL … candidate(s) failed` | **PASS**（修复后产物）/ **FAIL**（共享旧产物，如实记） | §1 `G-A.log` / `G-A-shared.log` |
| 2 | 且含 `release benefits are LOST` | **PASS** / **FAIL（旧产物）** | 同上 |
| 3 | 回落整包不白屏、无未捕获 JS 异常 | **PASS**（`bodyLen=1283` / pageerror=0） | §1 `3a/3b` |
| 4 | 四种候选（EO/CF/同源 ×2）全覆盖被 abort 且被探针看见 | **PASS**（8 行 REQ/FAIL 流水） | §1 `1c` |
| 5 | 探针同类肯定用例（合成 console.error 能测到「存在」） | **PASS**（6 个 mode 全 PASS） | §1 / §3 `0d` |
| 6 | 情形甲不误报乙原因 | **PASS**（console 全量 0 行） | §1 `2c` |
| 7 | 情形乙出现 `no release carried artifact …` | **PASS** | §2 `G-B.log` |
| 8 | 情形乙不误报甲原因 | **PASS**（0 行） | §2 `2c` |
| 9 | 两种原因可区分（级别/前缀/原因串/出处） | **PASS** | §2 表格 |
| 10 | 反向断言：注释 `console.error` ⇒ 判据红 | **PASS**（`9 PASS / 2 FAIL`，探针仍绿） | §3 `G-A-reverse.log` |
| 11 | 还原后判据回绿 + `git diff` 空 | **PASS**（`11 PASS / 0 FAIL`，`CLEAN`） | §3 / `G-raw.log` 末段 |
| 12 | 人造 abort vs 真实 CORS 失败分开记录 | **PASS**（已明确区分） | §4.1 |
| 13 | 自然态：catalogue 200、无 `ALL … failed`、18 条 manifest CORS 拦 | **PASS**（`10 PASS` 部分） | §4.2 `G-natural.log` |
| 14 | **catalogue 可达但 release 全线不可达时应响亮报「release 全线不可达」** | **FAIL（待修，不许改代码自证）** | §4.2 `2d` |
| 15 | A–F 反向断言汇总 | **6 张证据全在**；A/B/D/E/F 成立、**C PARTIAL**；MISSING 无 | §5 |

**总体**：本票自身 1–13 全 PASS；第 14 项是主会话要求如实记的 **FAIL / 待修建议**，
**没有改产品代码自证**。第 0 项与 `A-shared` 的 RED 是「产物滞后」的时间差，不是产品判据。

---

## §7 没验到的边界（诚实清单）

- 未验「修好 release manifest 的 ACAO 之后」自然态是否还会静默回落 —— 需生产侧
  CORS 修复或中继补头后重跑 `MODE=natural`（本票不修、不补头自证）。
- 未验情形乙在**未经 `addInitScript` 注入**的真货架上是否可达 —— 实测 `browse()` 覆盖
  `versions[].url` 导致 `missing url`，catalogue 根本没被请求；这是产品侧另一条缺陷，
  本票只记录、不修（§2）。
- 未验 `base_proxy`（GitHub）回退路径；本批 CORS 根因下它同样无 ACAO。
- 未验 CF 备线作为首个 200 的情形（自然态 EO 先 200 即停）；双线各自 200 由票 A 验。
- 低端 2GB 设备性能、真站点 `isui.ren` 部署操作：spec Out of Scope。

---

## §8 交付物与复跑命令总清单

```bash
# 0) 预览服（两个端口互不冲突；serve.py 在 wt-G 下跑，--dir 传绝对路径）
cd /tmp/fishing-2026-11-05/wt-G
python3 scripts/serve.py --dir /tmp/fishing-2026-11-05/dist-clean --port 8909
python3 scripts/serve.py --dir /tmp/fishing-2026-11-05/dist-G     --port 8919

# 1) 构造 dist-G（= dist-clean 副本，仅换 App.js；不改共享净化副本）
cd /tmp/fishing-2026-11-05/wt-G && node_modules/.bin/astro build          # App.sEtJRffo.js
cp -a /tmp/fishing-2026-11-05/dist-clean /tmp/fishing-2026-11-05/dist-G
cp wt-G/dist/_astro/App.sEtJRffo.js dist-G/_astro/ && rm dist-G/_astro/App.BL-Zkp6f.js
# index.html 里 App.BL-Zkp6f.js → App.sEtJRffo.js（G-raw.log §0 有 python3 -I 逐字脚本）

# 2) 六个 mode（stdout 分别落 G-<mode>.log，汇总见 G-raw.log）
cd /mnt/hdd/zcode-test/harness
node fish-g-reverse.mjs 8909 A-shared
node fish-g-reverse.mjs 8919 A
node fish-g-reverse.mjs 8919 A-reverse     # 需先在 wt-G 注释 console.error 并重编/换 dist-G-rev
node fish-g-reverse.mjs 8919 A-restore     # 还原源码 + 重编 + 重建 dist-G
node fish-g-reverse.mjs 8919 B
node fish-g-reverse.mjs 8919 natural
```

- 脚本：`/mnt/hdd/zcode-test/harness/fish-g-reverse.mjs`
- 证据：`/tmp/fishing-2026-11-05/evidence/G-reverse.md`、同目录 `G-raw.log` 及
  `G-A-shared.log` / `G-A.log` / `G-A-reverse.log` / `G-A-restore.log` / `G-B.log` / `G-natural.log`
- worktree `/tmp/fishing-2026-11-05/wt-G`：`git diff` 为空（临时注释已还原），提交见交付报告 sha。
