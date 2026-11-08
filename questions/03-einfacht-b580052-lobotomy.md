# 悬案 03：上游 Einfacht `b580052` 额叶切除（机制层整层替换）

**Status:** resolved
**Raised:** 2026-11-07
**Settling:** `python3 zreflect/registry.py --run commit` 且 `./reflect-hooks/pre-commit`
且 `gates/` 22 道自证全绿 ⇒ rc=0 即结案；任一判据红 ⇒ 未结案。`harness` 那条
上游夹具 rc=1 是已登记的上游问题，不属本仓判据，不因它翻案。

## 背景

用户裁定「给仓库做额叶切除手术，接入最新版本 Einfacht，与当前版本几乎不兼容」。
两项前置决策：**先提交独立基线**（`8fd7e7c`，市场/OPFS 重写 47 文件，不推送）、
**换机制层但业务判据全留**（22 道领域闸门 / FACTS 22 条事实含 14 条 witness /
wayfinder 42 断言 / 三语 README 同步判据全部保留）。

上游实体：`/mnt/hdd/zcode-projects/Einfacht` @ `b580052`（2026-11-07 21:35，
比同体系 `Octave-Extra-Content` 剧本用的 `b815cd1` 新一提交，恰好修掉 #27①②③
与 #28/#29）。接入方式 **vendored 源码整层拷贝**（无 pin / 无 submodule / 无 npm 依赖），
旧版停在 10-18 的 `d44b8a9`（C1–C5）。

试验场：`/tmp/lobotomy`（`git archive HEAD` + 独立 git init），先在试验场换层跑通再落主仓。

## 已落地（主仓实测）

| # | 不兼容 / 动作 | 修法 |
|---|---|---|
| 1 | 机制层形状差异（旧 35 py → 上游 33 py + `lang/` 93 json + 9 新模块） | `zreflect/` / `reflect-hooks/` / `gates-selftest.sh` 整层从上游 `b580052` 拷贝；删 `zreflect/__init__.py`、`reflect-hooks/install.sh`；**上游 vendored 文件逐字不改** |
| 2 | 上游 16 道 `check_*.py` 与我们的 22 道有 14 个同名（`check_i18n` 同名不同物） | 22 道领域闸门移到仓根 `gates/`（`check_i18n` → `check_svelte_i18n`），`zreflect/` 只留上游 16 道；`wayfinder_gates.json` / `mail-read.py` 一并移到 `gates/` |
| 3 | 新版 `check_i18n` 全树扫 CJK 字符串常量（实测 326 条），领域闸门全在扫描面 | 领域闸门移出 `zreflect/`（扫描面 = `zreflect/` + `reflect-hooks/`）；混合 `pre-commit` 壳用 `PYTHONPATH=$REPO/zreflect` 逐道跑 `--selftest` + 执行，**领域闸门文件零改动** |
| 4 | 上游 `facts.py` 不再默认本仓 `measure_example()`；不配 `REFLECT_MEASURE_MODULE` 回落占位量空表 | 旧 `facts.py` 的「你的部分」整段（22 条事实注册）抽到仓根 `measure_octave_ui.py`（带 `MODULE = module_meta(...)`）；`reflect-hooks/Einfacht.env` 显式配旋钮；仓根 `facts.py` 壳补 `PYTHONPATH=REPO` 与默认旋钮 |
| 5 | 上游 `facts.py --check` 无条件扫 `PRINCIPLES.md`（下游剧本用 `push_gate.py` 兼容层绕） | `b580052` 已修：`_doc_names()` 尊重 `REFLECT_NO_PRINCIPLES`。env 配 `export REFLECT_NO_PRINCIPLES=1` 后 **`pre-push` 直接用上游薄壳**，无需兼容层 |
| 6 | 新版 `check_facts` 反向判据（白名单式）：STATE 7 个历史数字无出处 | 逐段人工标行内代码（不是 `REFLECT_NAKED_MIN` 短路——下游剧本实测它会连旧黑名单一起关）；README 里 CI run id `42344977722` 被 `SHA_TOKEN` 误当 hex，同样标反引号 |
| 7 | `py_lines` 旧 cmd 用 `xargs cat`，删 `__init__.py` 后 `git ls-files` 仍列它 ⇒ rc=123 | cmd 改成 POSIX 兼容的 `xargs -0 -r sh -c 'for f; do [ -f "$f" ] && cat "$f"; done' _ | wc -l`（dash 不支持 `read -d ''`）；数据层与 FACTS.json 同源，按纪律 `--accept-changes=py_lines` 逐键放行实测值 |
| 8 | 两份 `Einfacht.env` 漂移（根 5 份 DOCS / 钩 4 份，README 单条目） | 删根版，钩子目录那份是唯一产地；`REFLECT_DOCS` 统一 5 份、`REFLECT_READMES` 改三语齐全、`REFLECT_LANG=zh` |
| 9 | 新版 `registry.problems()` 要 `off_reason=` / 幻影旋钮 / 恒真断言探测 | 领域闸门移出 `zreflect/` 后这些判据不再扫它们；两个本仓私有旋钮 `REFLECT_HARNESS_DIR` / `REFLECT_OMC_DTS` 改名 `OCTAVE_UI_*`（非框架旋钮，不进名册） |
| 10 | `AUTO:GATES` 表头从 4 列变 5 列（多「可未启用的理由」） | `python3 facts.py --render-doc STATE.md` 重渲染；`[[键名]]` / 4 个 `AUTO:` 标记逐字不变，19 处引用全部继续被认 |

**保留清单（零改动）**：`FACTS.json` 22 条事实（8 条裸值 cmd + 14 条 `replay:false` + witness/witness_expect 成对）、`gates/wayfinder_gates.json` 13 anchors + 42 assertions、`retractions.json`、`questions/`、`src/**`、`tests/**`、`.github/workflows/pages.yml`、`scripts/deploy-contract.mjs`、`package.json`、三语 README 同步判据。

## 主仓复验（2026-11-07）

```
python3 facts.py --check                     → 机器块与现算一致
python3 zreflect/registry.py --run commit   → 相位 commit：ran 11 / off 5 / failed 0 / fatal 0 / error 0
gates/ 22 道（自证 + 执行）                 → 17 ran / 5 off / 0 red；--selftest 22/22
./reflect-hooks/pre-commit                  → rc=0（上游 gate.py commit + 22 道领域闸门）
python3 zreflect/check_facts_replay.py     → 8 条 cmd 逐字一致 / 14 条 witness 计入
```

## 如实留账（不造假、不改 vendored 自证）

**`env -u REFLECT_NAKED_MIN sh gates-selftest.sh` 在本仓 rc=1**：上游 `registry.py`
自证的一条夹具报 `gate.require_nonempty(name='x', …)`「输入是空的」。
实测**上游自己仓 `/mnt/hdd/zcode-projects/Einfacht` 跑同一个 harness 也是 rc=1**
（不是「上游绿 / vendored 红」）——这是 `b580052` 自身状态，非本仓切除引入。
按剧本：**不造假占位文件、不改 vendored 自证**，生产判据以
`registry --run commit`（11 ran / 0 failed）为准。

## 后续修正（2026-11-08）：构建期 MSL 不再与运行期正交

额叶切除当天，`deploy-contract.mjs verify` 缺 `assets/msl/msl-4.1.0-maint.om.zip`
时，曾用裸 `curl` 从 GitHub 整包 release 拉单个 zip 凑存在性。用户指出
「这样就跟实际路径正交了，实际应该是用那个照 contract 仓库的 example 改的 ts 来拉」。

- **正交点**：`pages.yml` 旧步骤取 `v0.1.0-wasm32/msl-4.1.0-maint.om.zip`
  （整包 release 的单资产）；产品运行期是 `catalogue → manifest → chunks → 逐块 sha
  → 拼接 → 双 sha`（`catalogueReleaseSource.ts` / `chunkAssembler.ts`），
  本仓那套 TS 正是照 `Static-Contract/examples/fetch-concurrent.ts` 移植的。
- **修法**：新增 `scripts/sync-msl.mjs`（+ `sync-msl.sh` 薄壳），用 lockfile 里
  已有的 `vite-node` 加载**现成 TS 消费侧**：`loadCatalogue` /
  `fetchReleaseManifest` / `selectVariant` / `assembleEntry` / `computeSha256`；
  只在 Node 侧注入 `FetchPort`（带退避重试）与 `CodecDecoders`（`node:zlib`）。
  按 `entry.name === 'msl-4.1.0-maint.om.zip'` 全表扫、不猜 release id；
  落盘后钉 `a97d8d94…` + 19482938 字节（与 `forge-catalog.json` 同源）。
- **CI**：`pages.yml` 删裸 curl + `sha256sum` + `stat`，改 `pnpm sync:msl`
  并移到 `Install dependencies` 之后；`deploy-contract.mjs:236` 的 verify
  存在性断言原样保留。零新增 npm 依赖。
- **实测（2026-11-08）**：`pnpm sync:msl` 命中
  `OpenModelica-Full-Wasm/msl-4.1.0-maint.om`（identity / 4 chunks），
  拼接后 19482938 B、sha `a97d8d94…`，`Contract · verify` 通过。
  构建期与运行期从此走同一条字节链。

## Out of Scope

- 不改上游 vendored 机制层任何文件（012 信「整层换、别半换」）。
- 不把领域闸门逐条 i18n 化（用户裁定「移出扫描面 + 混合壳兜住」）。
- 三语 README 的「同一条断言三份拷贝」纪律保留；`CONTRIBUTING.md` / `AGENTS.md`
  提交前命令已按新执行面更新。
