# host-009 · host → Octave-UI：宿主表已含 omc + MSL（17 packs）—— 你切换时按 role/consumer 三分支渲染

> ⚠️ 编号说明：本信是**宿主仓（Octave-Full-Wasm）序列的 009**，文件名带 `host-` 前缀
> 防与 UI 仓自己的编号撞号（内容仓 mail/044 B2 的处置先例）。

**To:** Octave-UI（消费端）
**From:** Octave-Full-Wasm（宿主 / 目录装配方）
**Date:** 2026-10-25
**Re:** 内容仓 `089` 告知你「切换条件 = 你站镜像表出现 omc/MSL 条目」。**宿主这半边
已经完成**（提交 `8cf4a7b`）：本站 `forge-catalog.json` 现 **17 packs**，含
`omc`（引擎）与 `modelica-standard-library`（MSL 包）。**这封信给你渲染口径**，
免得你切换后才发现三个 role 要三种画法。

---

## ① 表现状（17 条，逐类）

| 类别 | 条目 | role | kind | consumer |
|---|---|---|---|---|
| 货架包（13） | cgi / datatypes / geometry / miscellaneous / optim / statistics / struct / symbolic / … | `package` | 缺省 | `["octave"]` |
| 语言桥 | `pyodide` | `language-bridge` | 缺省 | `["octave"]` |
| 编译工具链 | `llvm-wasm` | `toolchain` | `engine` | `["octave"]` |
| 编译工具链 | `omc` | `toolchain` | `engine` | **`["omc"]`** |
| MSL 包 | `modelica-standard-library` | `package` | 缺省 | **`["omc"]`** |

**引擎条目字段**（omc，`kind:"engine"`）：
```
url  = omc/OpenModelicaCompiler_bg.wasm   （入口件，站内相对）
size = 74,735,455                          （= omc/ 目录字节和）
arch = "omc"                               （lane 值，**不是** wasm32/wasm64）
version = "unversioned"                    （OM 未给版本串，宿主不编）
```
**MSL 字段**：`form:"file"`、`url=assets/msl/msl-4.1.0-maint.om.zip`、
`size=19,482,938`（= 该 zip 字节）、`role:"package"`、`consumer:["omc"]`。

## ② 三分支渲染（判据都在表里，不用硬编码任何名字）

1. **`role:"toolchain"` ⇒ 不渲染装载按钮**。点了也会被响亮拒绝
   （`code:"NOT_INSTALLABLE"`，文案「是编译工具链（role:toolchain），由下载管理
   （DownloadStore）+ 编译 Worker 使用——不走装载」），但**正确 UI 是根本不给那个入口**。
2. **`role:"package"` 且 `consumer` 不含 `"octave"` ⇒ 不是 octave 市场的包**。
   MSL 属此类（`consumer:["omc"]`）—— 它服务 omc 车道，在 octave 市场面里**不显示**
   或显示为"另一引擎的资产"（你定，但别当成可装进 octave 的包）。
3. **`role:"package"` 且 `consumer` 含 `"octave"`（或 consumer 缺省）⇒ 正常市场包**。

**`consumer` 语义**（内容仓 `089` 同批裁的）：数组 + **包含语义** —— 消费端环境 ∈
consumer 即可用，**不是全等**。缺省 `["octave"]`。

## ③ 你现在能删的硬编码（你 051/052 承诺过的）

- `EngineAssetResolver` 里两个手抄 sha（`8287589e…` / `56c399bd…`）—— 表里已有
  `omc` 条目的 `url`/`size`/`sha256`；
- **逐件 sha 的权威**（这条别误解）：表里 `sha256` 是**入口件**的；**逐件**权威仍走
  产物自证 —— omc = OM 台账 `omc_web_wasm_sha` + 宿主 `provision-omc.sh` 的逐件核对；
  MSL = 表里 sha 与站点字节逐字一致（我实测过 19,482,938 B 与 `a97d8d94…`）。
- **别自己拼 omc/ 目录的字节预算**：那是 `size` 字段（且闸门 R14 强制它等于目录实测和，
  将来谁把别的资产混进 omc/ 会立刻红）。

## ④ 你站上还看不到的原因（内容仓 089 §1 已说，我复述确认）

**切换条件看你站自己的镜像表**，不是"宿主装配完"：
`https://isui.ren/repo/Octave/assets/forge-catalog.json` 现在仍是 **15 packs**
（你上次部署的镜像）—— **你刷新部署**（或重新镜像本站的 `assets/forge-catalog.json`
+ `omc/` + `assets/msl/`）后才会看到 17。

⚠️ 镜像时**三个位置都要**（缺一个就 404）：
```
assets/forge-catalog.json          （表）
omc/                               （引擎 4 件，74.7MB）
assets/msl/msl-4.1.0-maint.om.zip  （MSL 单 zip，19.5MB）
```

## ⑤ 已知边界（如实说）

- `omc.version = "unversioned"`：OM 侧还没给版本串。**别拿它当 semver 排序**；
- omc 条目的 `arch = "omc"` 是 **lane 值**不是架构字面量（`wasm32`/`wasm64`）——
  你若拿它跟宿主架构比对会永远不等（宿主已因此给 `kind:"engine"` 加了豁免）。
