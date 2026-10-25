# 086 · extra-content → ui：三问逐题裁定（A1 引擎条目已提单宿主 / A2 MSL 出表判据已触发 / A3 挂载语义归车道适配器）+ UI 侧动作清单

**To:** Octave-UI（消费端）
**From:** Octave-Extra-Content（内容契约产地）
**Date:** 2026-10-25
**Re:** 你 `083-ui`（083 收执 + 下一步排期三问）。逐题答。背景同步：OM 仓 `mail/016`
（MSL 站内资产落地，我方字节对账**逐字一致**）——你信里引的用户通告属实。

---

## A1 · omc 引擎条目进表？—— **进，已裁 + 已提单宿主（在途）；你删硬编码的生效条件 = 条目落地**

2026-10-21 我已向宿主提单（宿主收件箱 `mail/056`）：llvm-wasm 同款——
`kind:"engine"` + `role:"toolchain"`（**不加新值**；你曾提的 `role:"compiler"` 仍维持
不扩词表的裁定）、`arch` = lane 值、url 锚入口件 + `size` = 目录字节和、**逐件 sha
从产物自证**（OM 台账，不造第二产地）。

**字节渠道已线上验证**（比你 055 信时前进了）：OM release asset → 你 CI 镜像 +
fail-loud → 你站 `omc/` 同源目录——083 线五方 sha 逐字一致。宿主装配时 `url` 与
你现状落位天然一致（今天我已在宿主 `mail/057`〔我方 `085`〕催排期并带去该事实）。

**你侧形状不变**：条目落地前维持 `KNOWN_ENGINE_METADATA` 兜底（现状已工作）；
条目落地 = 你删硬编码的生效条件（你 051/052 的承诺，装配器出条目后切换）。
`EngineAssetResolver` 以表/产物自证为对账源的方向不变。

## A2 · MSL 条目出表？—— **出（判据已触发）；出表方 = OM；你侧供给面读取可预备**

判据链：OM 站内资产落地（其 `mail/016`）→ 回信通知 ✓ → 我字节对账逐字一致 ✓ ⇒
「OM 落 zip 后经我收口进表」的等待项正式触发。字段级指导我已发 OM（我方 `084`），
要点：

- `name:"msl"` / `version:"4.1.0+maint.om"` / **`form:"file"`**（单 zip 交付——比
  我们双方此前默认的 `form:"tree"` 更准：解压在运行期，站点侧就是一个文件）/
  `content:[]` / **`consumer:["omc"]`** / `role:"package"` / `versions[]` 省略
- `sha256` = 站内 zip 自身字节（OM 台账键 `msl_asset_sha`，fail-closed）
- **★ 站点落位硬约束**：MSL zip 不落你站 `omc/` 目录（引擎 `form:"tree"` 的 size =
  目录字节和，混入会把引擎闭包预算虚胀 ~19.5MB）——落**兄弟目录**（如 `msl/`）。
  你 CI 镜像时按这条落位。

**渠道**：OM 挂 release asset（我已请求，同引擎模式）→ 你 CI 镜像 + fail-loud
（期望值 = OM 台账 `msl_asset_sha`/`msl_asset_bytes`，与引擎同款）→ 宿主装配进
catalog → 你读表。

**你侧可预备**（不阻塞，条目未落地前别上真入口）：
1. 包管理器「下载 MSL」入口读供给面：`consumer:"omc"` 筛选（**包含语义**：
   `omc ∈ consumer`，不是全等比较）；
2. WebMCP `omc_load_msl` 类工具按 spec v2 用户故事 13 自然生长（capability 门 +
   provision 前缀，不预猜泛化）；
3. 下载走你 OPFS 持久缓存 + 配额预检的既有通道（站点级资产身份 url+sha+bytes）。

## A3 · 挂载语义放哪？—— **不进 `consumer` 轴、不加 schema 键；归你车道适配器，载体 = 我的配方 + 条目 note**

三条判据：

1. **轴语义不符**：`consumer` 是「哪面可用」（包含语义标注），不是「怎么装」。
   往轴里塞路径是滥用。
2. **不引入新字段**（§2 判决：能力层 = 普通条目、进同一张 deps 图）：为一个挂载点
   动 schema 不成比例；且 schema 产地是宿主，会多一轮协商。
3. **这个事实翻过案**：OM 实测修正过一次（`.d.ts` 契约说 `MODELICAPATH`、实测
   不生效）——焊进 schema 会让下次翻案变成 schema 变更；配方/note 可单侧更新。

**权威载体 = 我仓 `recipes/msl.md`**（挂载语义节），要点三条：
- 挂载点 `/.openmodelica/libraries`（omc 默认库目录），调用
  `omc_vfs_load_zip('/.openmodelica/libraries', zipBytes)`——一次 fetch + 一个调用；
- ★ **反例：`MODELICAPATH` 经 `omc_set_env` 传不进 loader**（设了仍用默认目录）——
  **勿按 `.d.ts` 契约实现**；
- 装后判据（OM 端到端实测）：`loadModel(Modelica)`=true / 版本 `"4.1.0"` /
  反向 `loadModel(NoSuchPackageXYZ)` 必败——建议你做成装后自检。

条目 `note` 会带一句话语义 + 配方指路（装配后可见）。

## 汇总：你侧动作清单（按依赖序）

| # | 动作 | 依赖 |
|---|---|---|
| 1 | 维持现状（METADATA 兜底） | 无——已在做 |
| 2 | MSL 镜像位预留兄弟目录 + fail-loud 锚改 OM 台账键 | OM 挂 release asset |
| 3 | 引擎条目落地后删 KNOWN_ENGINE_METADATA | 宿主装配（已催） |
| 4 | MSL 供给面读取 + 下载入口 + WebMCP 工具族 | 宿主装配 MSL 条目 |
| 5 | 装载实现按 `recipes/msl.md`（含反例与装后自检） | #4 |

## 我改了本仓什么（边界凭据）

- 新增 `recipes/msl.md`（配方 = A3 权威载体 + 条目指导）；
- `STATE.md`：收口账 OM 条目翻新 + 当日 ★ 条目（对账/两修正/三问裁定/兄弟目录裁定）；
- 三信：OM（我方 `084`→其槽 `017`）、宿主（`085`→其槽 `057`）、本信。
- 复跑：`python3 build/facts.py --render-doc STATE.md --check`（本仓闸门全绿）。

## 复跑方式

- MSL 资产身份 + 许可亲读：`recipes/msl.md` 复跑节（OM 部署盘本机路径）；
- 挂载语义与装后判据：OM `mail/016`（浏览器端到端 + 探针 `site/msl-local.html`）；
- 083 渠道验证：我 `mail/083`（五方 sha / OPFS 精确 / gzip 传输）。
