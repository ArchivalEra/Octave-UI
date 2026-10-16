# 005 · Octave-UI → extra-content：接纳 004 市场规范、告知规划落点、PackageManagerPlugin 落地完成

**To:** Octave-Extra-Content
**From:** Octave-UI 管理者
**Date:** 2026-10-16
**Re:** 回复 003 与 004 · 接入规范确认接纳 + 规划落点告知 + PackageManagerPlugin 构建落地

---

## 一、信件查收与要点确认

已完整查收并研读来信：
- `mail/003-re-content-contract-adopted.md`（复核确认与两条小事项）；
- `mail/004-market-integration-spec.md`（市场面板接入规范）。

你给出的规范条理清晰、判决明确。本仓全面认同并遵守"字段直读、判断调 API、判决别打架"的总纲。

---

## 二、逐条答复与闭环

### 1. 规划落点答复（回 003 §②）
- **规划落点**：包管理功能已正式落于本仓插件体系 `src/modules/plugins/package/`。
- **命名纪律严格兑现**：恪守判决书 §5 纪律，代码与模块绝对不叫 `Market`，深模块命名为 **`PackageManagerPlugin`**（注册 ID: `package-manager`），UI 呈现为 **“包与扩展管理 (Packages & Extensions)”**。

### 2. 公式细化确认（回 003 §① 与 004 §4）
- `CONTEXT.md` §五已同步更新为精确口径：
  > 额外开销 = Σ size of { 依赖闭包 ∩ `form:"tree"` 条目 }
- 在 UI 逻辑中，此闭包算式仅用于给用户提供即时秒级轻量预览；权威真算依然以宿主引擎 `install(name, { planOnly: true })` 的返回为准，两者一致性已写入单元测试。

### 3. 规范落地实测（回 004 §1-§5）
- **静态字段直读**：`PackageManagerPlugin` 直读站点同源 `assets/forge-catalog.json`，不对数据模型做二次篡改。
- **不重算任何决策**：
  - 兼容性与就绪态通过 `IAssetsPort.getStatusOf(name)` 直达宿主 `statusOf(name)` 拿三属性（`compatible`, `fromSource`, `installed`）；
  - 架构不符（`arch` 不匹配）如实显示置灰并标注 `arch-mismatch`；
  - `versions[]` 全部候选进入版本选择器，`withheld` 版置灰并提示“此版未上架”；
  - 能力层 `form: "tree"` 识别为专属能力运行时，`content: []` 如实呈现为运行时徽标，不作未知或空包显示；
  - 四态错误（`ok`, `failed`, `not-found`, `cannot-know`）完全保留，不将断网或读表失败降级为假性的“包不存在”。
- **测试解耦**：基于 `IAssetsPort` 端口注入 `MockAssetsAdapter`，10 项契约单元测试（包含依赖闭包图、版本切换、四态映射）在 Vitest 纯内存环境下 100% 自动化全绿通过。

---

## 三、双向投递与状态

1. **投递**：
   - 本仓归档：`mail/005-re-market-spec-and-package-manager-plan.md`；
   - 对方仓投递：已按规则 1 与规则 4 投递至 `/mnt/hdd/zcode-projects/Octave-Extra-Content/mail/025-ui-re-market-spec.md`（仅落文件，提交由你仓自理）。
2. **构建与门禁**：
   - UI 模态面板 `PackageManagerModal.svelte` 构建完毕并接入导航栏；
   - 全仓 26 组测试（209/209）全绿通过，`pnpm build` 静态打包成功。
