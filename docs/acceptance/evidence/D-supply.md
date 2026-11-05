# 票 D · 供给定位取证（LLVM / pyodide / 13 forge）

- 日期：2026-11-05
- 分支：`fish/D` · worktree `/tmp/fishing-2026-11-05/wt-D`
- 端口：**未起站**（本票纯内容契约 + 分发契约对账，不需要 HTTP 服务，省资源）。专属端口 8907 闲置。
- 结论：**PASS** —— 附属包完全通过「内容契约（市场 `pack.url` basename + `pack.sha256`）+ 分发契约（catalogue release 的 `manifest.json` `entries[].name` / `.sha256`）」定位，不靠站内字节。

## 复跑

```bash
node /tmp/fishing-2026-11-05/fish-d.mjs | tee /tmp/fishing-2026-11-05/evidence/D-raw.log
```

脚本自己：

1. 从 `/tmp/v5check/cat.json` 读 18 条 release；
2. 对每条取 `<base>/manifest.json`，**每个最多 3 次尝试（1 初始 + 2 重试，硬约束）**，仍失败记 `ENV-LIMIT` 不算产品 FAIL；
3. 用 catalogue 的 `manifest_sha256` **逐字钉住**每份 manifest 的根指纹（钉不上判 `BAD-PIN`/`ENV-LIMIT`）；
4. 落盘到 `/tmp/D-manifests/<id>.json`，再做下面的 6 项对账。

无 npm 依赖、无 playwright、不改产品代码、不写仓外 dist。原始输出见 `D-raw.log`。

### 输入（只读）

| 输入 | 路径 | 实测 |
|---|---|---|
| catalogue 快照（18 release） | `/tmp/v5check/cat.json` | `releases.length = 18` |
| 市场契约（17 pack） | `/mnt/hdd/antigravity-projects/Octave-UI/public/bridge/assets/forge-catalog.json` | `packs.length = 17` |
| 移走清单 | `/tmp/fishing-2026-11-05/removed-files.txt` | 767 行 |
| 站内原始字节（算 sha 用） | `/mnt/hdd/antigravity-projects/Octave-UI/dist/assets/{runtimes,octinc}/` | 4 个 tar.gz |

判据与 `src/modules/storage/catalogueReleaseSource.ts` 的 `entryMatchesWanted` 同款：

```
entry.name === basename(pack.url) && entry.sha256 === pack.sha256   // 双确认
```

## ① 18 份 manifest 独立拉取 + 根指纹钉

**结果：`PIN-MATCH = 18/18`，`ENV-LIMIT/BAD-PIN = 0`**（全部 attempts=1，未触发重试；GitHub manifest 直连超时本次未出现）。

每份 manifest 的 sha256 与 catalogue 的 `manifest_sha256` 逐字相等，逐条见 `D-raw.log` ① 段。例：

- `LLVM-wasm/v0.1.6` → `293445faa76728756fd887d4be28aba5eaa9ccebfd91c9e4cbfb28f259967d58`（bytes=28602）
- `Octave-Extra-Content/supply-pyodide-314.0.7` → `20cab03d01d51a4fcbecef53a985655e6496794a29301efb9630c5b314102264`（bytes=3140）
- `OpenModelica-Full-Wasm/msl-4.1.0-maint.om` → `8c51d7bacbebf962…`（bytes=1400）

单条复跑（LLVM）：

```bash
curl -sS -m 25 "https://static.isui.ren/ArchivalEra/LLVM-wasm/releases/download/v0.1.6/manifest.json" \
  | sha256sum   # 293445faa76728756fd887d4be28aba5eaa9ccebfd91c9e4cbfb28f259967d58
```

> 旁证：`/tmp/A-manifests/` 里票 A 留下的 18 份缓存 manifest 也全部 `PIN-MATCH`（18/18），与我这次独立拉取逐字节相同（LLVM 已显式比对 `a==b = True`）。但本票的数字只取自己这次实测，未拿 SHARED.md 或旁证顶替。

## ② 17 包逐条命中表（spec 核心供给证据）

对市场契约 17 个包取 `url` basename + `sha256`，去 18 条 release 的 44 个 `entries[]` 里找 `entry.name === basename && entry.sha256 === 市场 sha`。

| 包名 | 产物名（basename） | 命中 release id | entry.bytes | PASS/FAIL |
|---|---|---|---:|---|
| cgi | `cgi-0.1.2.tar.gz` | `Octave-Extra-Content/forge-cgi-0.1.2` | 9960 | PASS |
| datatypes | `datatypes-1.4.2.tar.gz` | `Octave-Extra-Content/forge-datatypes-1.4.2` | 2091502 | PASS |
| geometry | `geometry-4.1.0.tar.gz` | `Octave-Extra-Content/forge-geometry-4.1.0` | 113949 | PASS |
| llvm-wasm | `clang.wasm` | `LLVM-wasm/v0.1.6` | 48069274 | PASS |
| matgeom | `matgeom-1.2.4.tar.gz` | `Octave-Extra-Content/forge-matgeom-1.2.4` | 572364 | PASS |
| miscellaneous | `miscellaneous-1.3.3.tar.gz` | `Octave-Extra-Content/forge-miscellaneous-1.3.3` | 110600 | PASS |
| modelica-standard-library | `msl-4.1.0-maint.om.zip` | `OpenModelica-Full-Wasm/msl-4.1.0-maint.om` | 19482938 | PASS |
| nan | `nan-3.7.2.tar.gz` | `Octave-Extra-Content/forge-nan-3.7.2` | 257606 | PASS |
| omc | `OpenModelicaCompiler_bg.wasm` | `OpenModelica-Full-Wasm/v0.2.0-wasm32` | 74579404 | PASS |
| optim | `optim-1.6.3.tar.gz` | `Octave-Extra-Content/forge-optim-1.6.3` | 422679 | PASS |
| pyodide | `pyodide.asm.wasm` | — | — | FAIL（合规例外，见 ③） |
| quaternion | `quaternion-2.4.2.tar.gz` | `Octave-Extra-Content/forge-quaternion-2.4.2` | 47838 | PASS |
| splines | `splines-1.3.5.tar.gz` | `Octave-Extra-Content/forge-splines-1.3.5` | 34053 | PASS |
| statistics | `statistics-1.7.7.tar.gz` | `Octave-Extra-Content/forge-statistics-1.7.7` | 1437955 | PASS |
| struct | `struct-1.0.18.tar.gz` | `Octave-Extra-Content/forge-struct-1.0.18` | 64113 | PASS |
| symbolic | `symbolic-3.2.2.tar.gz` | `Octave-Extra-Content/forge-symbolic-3.2.2` | 276452 | PASS |
| tsa | `tsa-4.6.3.tar.gz` | `Octave-Extra-Content/forge-tsa-4.6.3` | 85403 | PASS |

**合计 `PASS = 16 / FAIL = 1`**，与 SHARED.md 的 16/17 命中一致 —— 但我这次是**自己复跑**（17 包 × 18 release 全表扫），不是引用。

13 个 forge 包全部命中 `Octave-Extra-Content/forge-*` 同名 release；另外 3 个 PASS 是 `llvm-wasm`（→ LLVM）、`modelica-standard-library`（→ OM MSL）、`omc`（→ OM 引擎的独立 entry）。命中不靠包名猜 release id，纯靠「产物名 + sha」双确认。

逐条复跑（以 statistics 为例）：

```bash
python3 -I -c "import json;m=json.load(open('/tmp/D-manifests/Octave-Extra-Content__forge-statistics-1.7.7.json'));print([(e['name'],e['bytes'],e['sha256']) for e in m['entries']])"
# [('statistics-1.7.7.tar.gz', 1437955, 'cef3c090aee13eaad50b4b9beb2f003e8756cbf018d2be7233326de9696cdf7e')]
```

## ③ pyodide 例外（不是「命中失败」）

- 市场 `pyodide` pack：`form = "tree"`，`url = assets/pyodide/pyodide/pyodide.asm.wasm`，`sha256 = cc36e3cab04fdfc9a63ff13eb52eae2b911bf46c025cc7b281f394bd3de1d5e6`，`size = 22013349`。
  - 精确说明（本次实测）：spec 写的「`pyodide.asm.wasm`（22,013,349 B）」对应的是市场契约的 **`size` 字段**；按 `catalogueReleaseSource.ts` 对 `form:"tree"` 的口径，`size` = 整目录字节、`sha256` = 入口件指纹。dist 里**实际** `pyodide.asm.wasm` 文件是 **9,598,218 B**，其 sha256 = `cc36e3cab04fdfc9a63ff13eb52eae2b911bf46c025cc7b281f394bd3de1d5e6`（与市场 sha 逐字一致）。两者都不等于 release 的 `pyodide-core-314.0.7.tar.bz2`（6,757,104 B）。
  - 复跑：`sha256sum /mnt/hdd/antigravity-projects/Octave-UI/dist/assets/pyodide/pyodide/pyodide.asm.wasm`；`stat -c %s` 得 9598218。
- release `Octave-Extra-Content/supply-pyodide-314.0.7` 的 **3 个 entry**（逐条证据）：

| entry.name | entry.bytes | entry.sha256 |
|---|---:|---|
| `mpmath-1.4.1-py3-none-any.whl` | 567787 | `dc4f0ea2304480d4a9a48a94c1020571558ade522b44a6912efac63a586e140f` |
| `pyodide-core-314.0.7.tar.bz2` | 6757104 | `2abdcc2e35208af406e07724cffa85bc582ced97e9028383ecf5462541393f95` |
| `sympy-1.14.0-py3-none-any.whl` | 6299353 | `e091cc3e99d2141a0ba2847328f5479b05d94a6635cb96148ccb3f34671bd8f5` |

- 市场 `url` 指向包内文件 `pyodide.asm.wasm`（契约 `size` 字段 22,013,349 B；实际文件 9,598,218 B）；release 发的是 `pyodide-core-314.0.7.tar.bz2`（6,757,104 B）+ 两个 whl。**这是不同字节集合，不是「命中失败」**（内容仓 151/156 已裁）。
- 「测不到 ≠ 不存在」纪律：**肯定对照** `findHit("pyodide-core-314.0.7.tar.bz2")` 在本 release = FOUND（探针能看到「存在」）；在此前提下 `nameOnlyHit("pyodide.asm.wasm")` 全表 = NONE，才能读成「入口件确实没有独立 release entry」而非探针缺陷。裁定 PASS。

复跑：

```bash
python3 -I -c "import json;m=json.load(open('/tmp/D-manifests/Octave-Extra-Content__supply-pyodide-314.0.7.json'));print('\\n'.join(f\"{e['name']} {e['bytes']} {e['sha256']}\" for e in m['entries']))"
```

## ④ LLVM · `clang.wasm`

- `LLVM-wasm/v0.1.6` 的 manifest `entries.length = 14`；`clang.wasm` 是其中之一。
- `clang.wasm`：`entry.bytes = 48069274`，**zstd 块数 = 10**（`zstd:10, gzip:10, identity:10`，V5 各 codec 同块数）。
- `entry.sha256 = 198e84c4baeb3ce4c8d11cbbef75f072ec61db1b527df0ee2c90c9a4ffc72a85`
- 市场契约 `llvm-wasm` 的 `sha256 = 198e84c4baeb3ce4c8d11cbbef75f072ec61db1b527df0ee2c90c9a4ffc72a85` ⇒ **逐字一致**（`sha 一致 = true`）。
- 14 个 entry 名：`LICENSE`, `LICENSE-EMSCRIPTEN.txt`, `LICENSE-LLVM.txt`, `clang.js`, `clang.wasm`, `lld-wasm-only.js`, `lld-wasm-only.wasm`, `sysroot-headers.tar`, `sysroot-headers.wasm64.tar`, `driver__abi.mjs`, `driver__compile-core.mjs`, `driver__sysroot-bundle.mjs`, `driver__tar-reader.mjs`, `driver__toolchain.mjs`。

复跑：

```bash
python3 -I -c "import json;m=json.load(open('/tmp/D-manifests/LLVM-wasm__v0.1.6.json'));print('count',len(m['entries']));e=[x for x in m['entries'] if x['name']=='clang.wasm'][0];print(e['bytes'],e['sha256'],'zstd_chunks',len([v for v in e['variants'] if v['codec']=='zstd'][0]['chunks']))"
# count 14 / 48069274 198e84c4baeb3ce4c8d11cbbef75f072ec61db1b527df0ee2c90c9a4ffc72a85 zstd_chunks 10
```

## ⑤ MSL 双 release 已收敛

- catalogue 里 id 含 `msl` 的 release **条数 = 1**：只有 `OpenModelica-Full-Wasm/msl-4.1.0-maint.om`。
- 全表 `entry.name` 含 `msl` 的条数 = 1：`msl-4.1.0-maint.om.zip`（bytes=19482938，sha `a97d8d94…` 与市场一致）。
- `Octave-Extra-Content/supply-msl-4.1.0` 在 catalogue = **false**（内容仓 156 §4.1 已撤），确认收敛。

复跑：

```bash
python3 -I -c "import json;c=json.load(open('/tmp/v5check/cat.json'));print([r['id'] for r in c['releases'] if 'msl' in r['id'].lower()])"
# ['OpenModelica-Full-Wasm/msl-4.1.0-maint.om']
```

## ⑥ 反向断言：改 1 位 sha 必须变红

故意把市场契约 `statistics` 的 sha 第 1 位 `c → a`（`cef3c090…` → `aef3c090…`），证明「产物名 + sha 双确认」不是装饰：

| 判据 | 结果 |
|---|---|
| 双确认（原始 sha）命中 | **true** → `Octave-Extra-Content/forge-statistics-1.7.7` |
| 仅按名字命中（肯定对照：探针能看到存在） | **true** → 同一 release |
| 双确认（改位 sha）命中 | **false** |

**裁定 PASS**：改位后变红、而名字单独仍命中 ⇒ sha 维真的拦住了，不会只凭名字误命中。复跑见 `node fish-d.mjs` ⑥ 段。

## ⑦ 站内字节对照（`assets/runtimes` / `assets/octinc`）

净化 dist 被移走的 tar.gz，去重后 4 个 basename（每个在 `assets/` 与 `bridge/assets/` 各一份副本）。对 pristine `dist/assets/` 里对应文件算 sha256，并同时按 `entry.name` 同名、`entry.sha256` 同值去 44 个 catalogue entry 里找对应：

| basename | 站内 bytes | 站内 sha256 | entry.name 同名 | entry.sha256 同值 | 对应 release |
|---|---:|---|---|---|---|
| `llvm-wasm-6.0.12.tar.gz` | 34693729 | `cd6450fe7944875cb39f8e4a0790d5a08e032044f1db89054dadcabb749b20ce` | NONE | NONE | 无对应 |
| `octave-headers.tar.gz` | 541862 | `e132b5f1166d79094b3ee2bf21d24134f39dc307bd5ed1b6a8790777ac360e83` | NONE | NONE | 无对应 |
| `octave-headers.wasm64.tar.gz` | 565910 | `4c256a7c30c2df99631a3e1e3973cae9f829955a03dd78ffd432e27641bbc851` | NONE | NONE | 无对应 |
| `pyodide-314.0.7.tar.gz` | 13742761 | `6a4976babd0cb34c8906e4847405614db92c70588b42f27d7612898c3debbd76` | NONE | NONE | 无对应 |

**如实记：4 个全部「无对应，可能是非 release 用途」**（站内自产 runtime / headers bundle）。它们既不同名于任何 release entry，sha256 也不同值于任何 release entry。注意 release 里**有** `sysroot-headers.tar`（LLVM，20654080 B）与 `pyodide-core-314.0.7.tar.bz2`（6757104 B）这类相近用途产物，但**不是同一字节集合**，不构成对应 —— 这正说明站内这些 tar.gz 是另一套打包，不能被「产物名 + sha」双确认定位，也不该被算作 release 供给。

复跑：

```bash
for f in runtimes/llvm-wasm-6.0.12.tar.gz runtimes/pyodide-314.0.7.tar.gz octinc/octave-headers.tar.gz octinc/octave-headers.wasm64.tar.gz; do sha256sum "/mnt/hdd/antigravity-projects/Octave-UI/dist/assets/$f"; done
```

> **§⑦ 的判据面只覆盖 `*.tar.gz`**（4 个 basename）。补充侦察（票 A / 主会话，见 §⑧）发现净化白名单还漏了 `*.tar`：`assets/llvm/` 与 `bridge/assets/llvm/` 下另 4 个 `sysroot-headers*.tar` 是**真 release 字节**，与本节 4 个 `.tar.gz` 不是一回事。§⑦「无对应」的结论对 `.tar.gz` 仍成立，但**不可外推为「站内 `.tar` 都不是 release」** —— 那是 §⑧ 要翻的案。

## ⑧ 补充（票 A / 主会话）：净化白名单漏了 `*.tar` —— 4 个 `.tar` 是真 release 字节

> 本节按补充要求补写，不重跑大流程；manifest 沿用 §① 我自己拉的 `/tmp/D-manifests/LLVM-wasm__v0.1.6.json`。**不改净化副本、不改产品代码、不改 SHARED.md。**

### 1. LLVM manifest 的两个 `.tar` entry 与站内 4 文件 sha 对账

`LLVM-wasm/v0.1.6` manifest（§④ 已确认 14 个 entry，PIN-MATCH `293445fa…`）里的两个 sysroot entry：

| entry.name | entry.bytes | entry.sha256 | variants |
|---|---:|---|---|
| `sysroot-headers.tar` | 20654080 | `5b9a8d2cd528f3f6c4d3752b153a4aa4495d2416ccb28655a63b9a268d0efa0e` | zstd:4, gzip:4, identity:4 |
| `sysroot-headers.wasm64.tar` | 20654080 | `8d82242177651dc4c1108c1aae61a704a9f01c409cfd5b24eb6ba79a1cff0c97` | zstd:4, gzip:4, identity:4 |

站内 4 个副本（每个 basename 在 `assets/llvm/` 与 `bridge/assets/llvm/` 各一份）逐一算 sha256 + 比对 `entry.bytes`/`entry.sha256`：

| 站内路径（相对 dist 根） | bytes | sha256（前 20） | 与 LLVM entry 逐字一致 |
|---|---:|---|---|
| `assets/llvm/sysroot-headers.tar` | 20654080 | `5b9a8d2cd528f3f6c4d3…` | **MATCH = True** |
| `assets/llvm/sysroot-headers.wasm64.tar` | 20654080 | `8d82242177651dc4c110…` | **MATCH = True** |
| `bridge/assets/llvm/sysroot-headers.tar` | 20654080 | `5b9a8d2cd528f3f6c4d3…` | **MATCH = True** |
| `bridge/assets/llvm/sysroot-headers.wasm64.tar` | 20654080 | `8d82242177651dc4c110…` | **MATCH = True** |

即：这 4 个文件与 `LLVM-wasm/v0.1.6` release manifest 的 `sysroot-headers.tar` / `sysroot-headers.wasm64.tar` **字节级同物**（bytes + sha 双确认，正是 §② 的同款判据）。它们出现在 `release-only-full.txt`（79 行）第 15/16/45/46 行：`./assets/llvm/sysroot-headers.tar`、`./assets/llvm/sysroot-headers.wasm64.tar`、`./bridge/assets/llvm/sysroot-headers.tar`、`./bridge/assets/llvm/sysroot-headers.wasm64.tar`。

复跑（对账脚本，只读）：

```bash
python3 -I - <<'PY'
import json,hashlib,os
m=json.load(open('/tmp/D-manifests/LLVM-wasm__v0.1.6.json'))
want={e['name']:e for e in m['entries'] if e['name'].startswith('sysroot-headers')}
for root in ['/tmp/fishing-2026-11-05/dist-clean','/tmp/fishing-2026-11-05/dist-precise','/tmp/fishing-2026-11-05/dist-full']:
    for sub in ['assets/llvm/sysroot-headers.tar','assets/llvm/sysroot-headers.wasm64.tar','bridge/assets/llvm/sysroot-headers.tar','bridge/assets/llvm/sysroot-headers.wasm64.tar']:
        p=os.path.join(root,sub); e=want[os.path.basename(sub)]
        if os.path.isfile(p):
            d=open(p,'rb').read(); print(root.split('/')[-1],sub,'PRESENT',len(d)==e['bytes'] and hashlib.sha256(d).hexdigest()==e['sha256'])
        else: print(root.split('/')[-1],sub,'ABSENT')
PY
```

### 2. 结论：这 4 个 `.tar` **属于 release 供给**，不算「站内自产 bundle」

- 它们与 §⑦ 的 4 个 `.tar.gz`（`llvm-wasm-6.0.12.tar.gz` 等）**不同**：后者在 44 个 release entry 里 `entry.name` 与 `entry.sha256` 均无对应，是站内自产 runtime/headers bundle；前者是 `LLVM-wasm/v0.1.6` 的两个正式 entry，**是 release 交付字节被原样铺进站内目录**。
- 所以 §⑦「站内自产 bundle」的结论**不适用**于这 4 个 `.tar`。按「字节级 release 大字节为 0」的严格口径，`dist-clean`（767 移走）与 `dist-precise`（75 移走）都因漏 `*.tar` 而**不完备**。
- 站内取用面（票 A 实测、我在产品源码里复核行号）：`public/bridge/assets-loader.js:473` 选 `sysroot-headers.wasm64.tar` / `sysroot-headers.tar`，**`:475` `var B = 'assets/llvm/';`**，`:467` 取 `assets/llvm/manifest.json`，`:474` 缺件时抛 `FLAVOR_UNAVAILABLE`（提示跑 `provision-llvm-wasm.sh`）。即工具链当前以**站内相对路径**取这 4 个 release 字节。

### 3. 三份副本口径（不要混淆）

| 副本 | 移走数 | 漏掉 | 路径 | 状态 |
|---|---:|---|---|---|
| `dist-clean` | **767**（含 692 个 `.oct`，判据过宽） | 仍留 4 个 `.tar` | `/tmp/fishing-2026-11-05/dist-clean` | A–G 正在用，**别改** |
| `dist-precise` | **75**（精确口径，保留 692 个 `.oct`） | 仍留 4 个 `.tar` | `/tmp/fishing-2026-11-05/dist-precise` | 仍不完备 |
| **`dist-full`** | **79**（75 + 4 个 `.tar`，不含 `.oct`） | 无 | `/tmp/fishing-2026-11-05/dist-full` | **最终验收口径** |

- 完整清单：`/tmp/fishing-2026-11-05/release-only-full.txt`（**79 行**，本次实测 `wc -l = 79`）。
- 我在三份副本上的复核（§1 复跑脚本）：`dist-clean` / `dist-precise` 的 4 个 `.tar` 全 `PRESENT` 且 MATCH=True；`dist-full` 的 4 个全 `ABSENT` ⇒ `dist-full` 确实移走了它们，是 79 而不是 75。
- 分类判据（票 A 独立重证）：catalogue 18 份 manifest 共 44 个 entry 里 **0 个 `.oct`**，但**有** `sysroot-headers.tar` / `sysroot-headers.wasm64.tar`（LLVM，各 20654080 B）⇒ `.oct` 保留、`.tar` 移走。
- 对照服端口：dist-precise **8910**、dist-full **8911**（本票未起站，端口 8907 仍闲置）。

### 4. 给 H 的裁定题（必须回答，不许糊过去）

> `sysroot-headers.tar` / `sysroot-headers.wasm64.tar` 被 `assets-loader.js` 以站内相对路径 `assets/llvm/`（`:475 var B = 'assets/llvm/';`，选件在 `:473`）取用。**移走 `.tar`（即用 `dist-full`）后 LLVM 工具链若仍能从 release 取 ⇒ PASS（完全不托管成立）；若功能因此缺失 ⇒ 如实记 FAIL：站上仍有一处硬编码站内路径依赖 release 字节，并给出 `assets-loader.js` 行号与复跑命令。不许顺手改产品代码让它过（钓鱼不得自证）。**

给 H 的行号线索：`public/bridge/assets-loader.js:467`（取 `assets/llvm/manifest.json`）、`:473`（选 sysroot 名）、`:475`（`B='assets/llvm/'`）、`:474`（缺件抛 `FLAVOR_UNAVAILABLE`）、`:614–615`（lld 的站内 `assets/llvm/...` URL）。LLVM 侧 release 侧可定位性已由本票 §④ 证明（`clang.wasm` 等 14 个 entry 双确认可命中），但 `sysroot-headers*.tar` 的**运行期取用路径**是否改走 catalogue/release，本票不判，交 H 在 `dist-full` 上用真浏览器实测裁定。

## 环境限制

无。18 份 manifest 全部首次尝试即 HTTP 200，未触发重试，无超时；`PIN-MATCH 18/18`，无 `ENV-LIMIT` / `BAD-PIN`。GH manifest 直连间歇超时的已知现象本次未复现。

## 结论

- **PASS**：16/17 包通过「产物名 + sha 双确认」在 catalogue 里定位到唯一 release entry；第 17 个（pyodide）是 `form:"tree"` 的合规例外（不同字节集合），已用肯定对照证明不是探针缺陷。
- 双确认判据有反向断言撑着（改 1 位 sha 即红），不是装饰。
- 站内被移走的 `runtimes/octinc` `.tar.gz`（§⑦ 的 4 个）与 18 条 release 无任何 `entry.name`/`entry.sha256` 对应 ⇒ 这 4 个 bundle 属另一套用途，附属包供给不靠它们。
- **但 §⑧ 翻了「站内 `.tar` 都不是 release」的案**：4 个 `assets/llvm/sysroot-headers*.tar` 是 `LLVM-wasm/v0.1.6` 的真 release entry 字节（bytes + sha 逐字一致），`dist-clean`(767) / `dist-precise`(75) 都漏移，最终口径是 `dist-full`(79)。这 4 个的**运行期取用是否仍依赖站内硬编码路径**交 H 裁定（§⑧.4），本票不判、不改产品代码。
- MSL 已收敛为 1 条（OM 产地）。
- 全程未改产品代码、未改 SHARED.md、未写仓外 dist、未起站。
