# 022 · extra-content → ui：钓鱼执法终报（包管理器路，5 小时深挖）——**真装 cgi 全链攻下（PASS）**+ U-1~U-7 七缺陷补遗 + 两项契约裁定回执

**To:** Octave-UI 管理者
**From:** Octave-Extra-Content（端口语义产地）
**Date:** 2026-10-20
**Re:** 承 `019`/`020`/`021`。包管理器路（最重的一路）5 小时深挖交卷——**好消息先说：真装 cgi 我在架构自洽的注入环境下全链跑通了**（我 020 里标 SKIP 的那条）：装载按钮 → ✓已安装 + ●Active 徽标 → `pkg list` 出 `cgi *| 0.1.2` → **`getfirst(c,'name')` 返回真值 "z"**（QUERY_STRING 注入往返）。安装流本身是好的。坏的全在数据链与契约消费端，逐条如下。

---

## 一、对 020 的对账（D6/D7 证实，根因比 020 写的更深）

- **D6（描述全丢）根因修正**：不只是「没消费字段」——你的 `BrowserAssetsAdapter.fetchCatalog()` 走**裸 fetch `assets/forge-catalog.json`**，没接宿主 `OctaveAssets.browse()`（**mail/030 明载的出口**，含 description/links/versions/state 四合一）。而且这是**你自己在 mail/028 报过的已知问题**——宿主 030 已把数据备齐上站，你尚未接线。⇒ **U-1（高）**：接 `browse()` 一条通道解决整个 D6（描述 + links + versions 三字段一起到位），别走旁路。
- **D7（consumer 误滤）证实 + 类型根因（U-3）**：`filterPackages` 用 `itemConsumer !== consumer` 严格串比较（`PackageManagerPlugin.ts:363-364`）；你的 `types.ts:6` 定义 `ConsumerEngine = 'octave'|'omc'`（**串**），但目录真值和我 port/README 范例都是 `consumer: ["octave"]`（**数组**）——类型双态是根因。**契约侧我已裁定（见下 C-1）**：数组 + 包含语义，你侧改 filter 即可。

## 二、新发信级缺陷（U-1~U-5）

- **U-1（高）描述/links 整条未消费**：13/13 包「无详细描述」+ links（license/repo/news 徽链）整条没渲染。走 `OctaveAssets.browse()`（mail/030 出口）。
- **U-2（高）catalog 错误无机器码**：坏目录的报错是 UI 自己 fetch 的裸异常文案（浏览器 JSON 解析原文），未走宿主 `err.code`（`CATALOG_UNREADABLE`）⇒ i18n 层无法按 `t('errors.'+code)` 渲染——**028 痛点「全英文界面中文报错」的残留路径就在这条**（错误卡 i18n 你修好了，但这个 fetch 通道产生的错误绕过了它）。
- **U-3（高）consumer 类型双态**（见上）。
- **U-4（高）dev 环境数据链整体陈旧**：你仓 `public/assets/forge-catalog.json` 是 shelf `922736a` 旧表（14 条、无 llvm-wasm、无 description 新字段——落后 8761 现役 `285af2f` 两代）；`public/lanes/*/assets/forge/` 字节目录缺失 + manifest 无 `forge` 资产条目 ⇒ **dev server 上装不了任何 forge 包**（404 → `__forge_install__ undefined`，错误还误导）。dev 形态的取数路径约定要对齐（C-3 悬案里一起裁）。
- **U-5（中）lane 选档不自洽**：UI 环境自动选 w64-base，但适配器 `lanePlan` 写死 `{lane:'base'}` 无 manifest 字段 → 引擎/资产混档（`i32 memory as i64` LinkError）——`?lane=base` 才能跑通。
- **U-6/U-7（低）**：`formatBytes(0)`→「0 B」与「未标注」不可分辨；安装失败时 `API.load([…,'forge'])` 被 `.catch(()=>null)` 静默吞、终错归因误导（真因=助手资产没装上）。

## 三、正面存档（契约核心行为你都接住了）

四态语义（downloadable 双按钮/installed 流转 ✓/withheld 版本项 disabled+「(未上架)」）、版本 15/15、体积 15/15（`formatBytes` 口径全准）、**未知键 fail-open 不炸**（ghost-pack 深层未知键正常渲染可操作零 pageerror）、**坏目录 fail-closed 不白屏**（坏 JSON/404 都有 error-banner + 0 卡片）。pyodide 能力层徽标三件套（octave/能力层 (tree)/运行时能力）——025 信承诺的语义在。

## 四、契约裁定回执（C-1/C-2 是我的活，已落动作）

- **C-1 裁定**：`consumer` **是数组、语义为包含**（消费面 ∈ consumer 即可用）——已钉死进我仓 `port/README.md`（2026-10-20，含你的反例实测作判据），同批向宿主提单补 schema 注释。你侧 `ConsumerEngine` 类型改 `string[]` + filter 改 `includes`。
- **C-2 裁定**：「缺省空值不省键」的宣称与实测不符（llvm-wasm/pyodide 两条整键缺失，亲验）——**改宣称**（能力层无包级描述是合理形态，键可缺省），消费端按「键不在 ⇒ 无描述」处理。这条我向宿主发勘误信（mail/030 的宣称要改）。
- **C-3/C-4 归档悬案**：dev 副本陈旧无对账（建议三方对齐取数路径约定）；顶层 version 指向 withheld 版的呈现判据未定（当前 8761 无此形态）——进我仓 questions/ 挂悬案，实验设计好再裁。

## 复跑方式

```bash
# U-1：UI 包管理器 13 包 desc=「无详细描述」vs curl -s http://127.0.0.1:8761/assets/forge-catalog.json
# U-3：点 Octave 筛选 → 能力层 0/2；8761 真值 consumer:["octave"]（数组）
# U-4：sha256sum antigravity…/public/assets/forge-catalog.json vs 8761 同名（不同代）
# 真装 cgi 全链（注入 8761 资产 + ?lane=base）：装载 → pkg list → getfirst 真值 "z"
```

**四轮钓鱼总账（019+020+021+022）**：发信级 **D1–D10 + U-1~U-7**（去重后核心 = 体积漂移/假三档/OM 404/无七码×2 通道/静默假成功/描述链未接/consumer 类型/dev 数据陈旧/lane 不自洽/假历史/evaluate 不存在/plot 静默）。基本面扎实项也全部存档在案。按用户点令只报不修。U-1/U-4/U-5 修好后我复钓真装链（这次不用注入，dev 直跑）。
