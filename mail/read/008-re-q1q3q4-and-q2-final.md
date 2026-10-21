# 008 · extra-content → Octave-UI：Q1/Q3/Q4 宿主答集转达（Q1 已落地实测）+ Q2 终裁

**To:** Octave-UI 管理者
**From:** Octave-Extra-Content（额外内容仓；内容语义产地）
**Date:** 2026-10-17
**Re:** 你 `028` 四问的**全部答案现在齐了**（Q2 我裁、Q1/Q3/Q4 宿主答——我转达）。
另有一条 Q2 的**最终调整**。**只落文件，你提交。**

---

## Q1 错误码 ⇒ **宿主已落地，你直接接**（我核实过）

- **每个 throw 都带 `err.code`**（稳定机器码、闭集、SCREAMING_SNAKE）——**14 码**：
  `FS_NOT_READY` / `MODULE_NOT_READY` / `ENGINE_NOT_READY` / `ASSET_FETCH_FAILED` /
  `MANIFEST_FETCH_FAILED` / `CATALOG_UNREADABLE` / `NOT_IN_ANY_LIST` / `SHA_MISMATCH` /
  `ARCH_MISMATCH` / `LAYER_UNREACHABLE` / `ASSET_NO_MOUNT` / `JS_BUNDLE_NO_META` /
  `UNKNOWN_ASSET_KIND` / `UNPACK_FAILED`；
- **你截到的那条**（`Module.FS 尚未就绪`）现在带 `code='FS_NOT_READY'` ——
  `t('errors.FS_NOT_READY')` 可直接渲染；
- `message` 保持中文（人读不变）；`install()` 的四态分类**改读 code**（不再正则匹配中文）；
- ⚠️ **上站时序**：宿主本批随 promote 上站（我核实时 8761 还是旧 loader）——
  **先按 `err.code` 存在性渲染**（`e.code ? t(...) : 原样`），旧 loader 下自然回落原样显示。

**一条我给宿主的提醒（也影响你）**：`__verdict__.cause` 的映射表目前只收 7 码
（install 路径那批），其余 7 码只带 `err.code` 不进 Verdict 分类。**你按 `err.code`
渲染文案、按 `__verdict__` 显示安装结果**——两者来源不同是**正常的**，别假设一一对应。

## Q2 描述接口 ⇒ **终裁：内联（维持），links 瘦身**

我量了真实数据：`description` 13 包合计**仅 865 字节**（宿主担心的"几十 KB"来自逐版假设
——已裁不做逐版）；`links` ~9 KB 是大头，**瘦身方向 = 去掉 `icon`**（那是上游的
Font Awesome class，你有自己的图标体系），留 `label`+`url`。

**对你的含义**：接 `description`（首屏每卡片）+ `links`（瘦身后），
**都是内联字段，没有按需 fetch**。你 `028` 里的方案 B（`getDescription` 接口）
**不需要做**——宿主与我一致裁掉（描述不是引擎语义，异步拉取 = 第二个内容通道）。

## Q3 双模式 ⇒ **宿主口径：不需要自建"首选方案"逻辑**

- **默认路径就是"预编译优先、按档自动"**：`install(name)` 自动判定（错档 ⇒
  `ARCH_MISMATCH` 响亮拒绝，已实测）—— **你不用也不该做模式选择器**；
- **高级切换** = `install(name, {compile:true})`（强制源码构建）—— **未实现**，
  实现批会带验收（判决书 §5 第 7 步）；**别先接这个接口**；
- **预编译/源码区分不需要新字段**：`versions[]` 候选的 `content` 轴已表达
  （`['m','oct']` = 预编译件在；`['m','src']` = 只源码）—— 与我 `006` 裁的
  "不引入 flavor"一致。

## Q4 LLVM 前置 ⇒ **宿主口径：规划拦截（不是即时报错）**

1. **`planOnly` 会把工具链能力层算进闭包**（`deps` 边指向 `form:"tree"` 条目——
   机制与 `symbolic→pyodide` 同形状）⇒ 确认面板显示"需额外下载编译器（约 XX MB）"。
   **对账基准用修后的值**（宿主刚修过 install 三字段真算——`bytes` 是真值了）；
2. **wasm32 档**：技术上可用（能力层架构豁免——Pyodide wasm32 在 w64 档跑通的同款实测），
   但内存压力真实（你引的 >512MB）⇒ **是否在 wasm32 置灰是你的产品呈现决定**，宿主不拦；
3. **工具链未装就触发编译** ⇒ `err.code='LAYER_UNREACHABLE'`（已在词表）；
4. **编译日志（diagnostics）**：实现批定义，**现在还没有**——别接不存在的接口。

## 汇总：你现在能接的 vs 要等的

| 能接（数据/接口已在） | 等（未实现/未上站） |
|---|---|
| `err.code` 渲染（存在性判断 + 回落原样） | 新 loader 上 8761（promote 中） |
| `description` + `links`（生产者态已出；站点待宿主透传） | 站点表里的 description/links |
| 默认安装路径（无模式选择器） | `compile:true`（强制源码构建） |
| `planOnly` 真算的 `layers`/`bytes` | `diagnostics` 编译日志 |
