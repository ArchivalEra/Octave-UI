# 下载/装载解耦 · 真浏览器独立验收（2026-11-06）

> 对应 README.md:28-29 / `mail/read/018-extra-content-re-047-answers.md`
> 的站点特色「下载（写 OPFS）与装载（载入运行时）彻底解耦」。
> 本票不依赖 OMC 引擎 boot（避开连续大流量时 CDN 边缘节流），
> 用最小同类肯定运行时证明探针能测到「装载」，从而隔离出网络判据。

- 复跑：
  ```bash
  cd /mnt/hdd/zcode-test/harness
  node fish-msl-decoupled2.mjs
  # 预览服：python3 scripts/serve.py --dir <净化副本 dist-clean> --port 8906
  ```
- 原始输出：`/tmp/msl-verify-2026-11-06/evidence/C-decoupled3.log`（测量记录，不进仓）
- 结果：`=== 9 PASS / 0 FAIL ===`

## 判据与实测

| # | 判据 | 结果 | 实测 |
|---|---|---|---|
| ① | 未下载就装载 ⇒ `NOT_DOWNLOADED` | PASS | `text` 含 `Download it first`；装载从未自己取字节 |
| ①-2 | 未下载时零外部网络请求 | PASS | 请求表空 |
| ② | 真 UI 点包管理器下载 MSL | PASS | 菜单 → 📦 → `data-package=modelica-standard-library` → 确认 |
| ②-2 | 下载阶段 4 个 release 分片全 200 | PASS | `msl__msl-4.1.0-maint.om.zip.identity.000..003` |
| ③ | 装载从 OPFS 读已下载字节 | PASS | `isError=false` |
| ③-2 | 证据面 `source=opfs-download` | PASS | 不是 `catalogue-release` 现场装配 |
| ③-3 | `opfsPath` 与下载落盘逐字一致 | PASS | `downloads/src/modelica-standard-library/4.1.0+maint.om/modelica-standard-library-4.1.0+maint.om.tar.gz` |
| ③-4 | 装载阶段零外部网络请求 | PASS | 外部请求表空（可证伪判据） |
| ③-5 | `omc_vfs_load_zip` 真收到 OPFS 字节 | PASS | `bytes=19482938` |

## 同类肯定用例与反向断言

- **同类肯定**：装载前注入最小 `window.__omc`（`omc_vfs_load_zip` + `omc_eval`），
  `omc_eval('loadModel(Modelica)')` 能返回 `true` ⇒ 证明「装载成功」探针不是恒假。
  装后 `selfCheck = {loadModel:true, version:'4.1.0', negative:false}`。
- **反向**：`globalThis.fetch` 对任何 URL（含 `static.isui.ren` release 域名）都抛；
  若工具在装载期现场取字节，③ 必红。旧版单测只禁站内 fetch 却放行 release fetch，
  正是 11-06 上午「解耦回归」没被测到的原因。
- **边界**：运行时是同类肯定桩，不是真 OMC 引擎；真引擎路径由
  `C-2026-11-06-retest.md`（`19 PASS / 0 FAIL`）与 `C-verdict-2026-11-06.md`
  的反向断言覆盖。本票只验「网络与盘面」的解耦，不宣称替代引擎 boot 验收。
