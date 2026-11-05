# 票 A · 供给层证据（净化 dist 完备性 / 预览服 / catalogue 双线 / 供给清单对账）

- 采集日期：2026-11-05
- 采集者：implement-spec 票 A 子代理（无人值守）
- 采集面（唯一 dist 副本）：`/tmp/fishing-2026-11-05/dist-clean`
- 原始命令输出：`/tmp/fishing-2026-11-05/evidence/A-raw.log`
- 复跑判据脚本：`/tmp/fishing-2026-11-05/evidence/A-releaselike-predicate.sh`
- 原始生成脚本（原子重建 raw log）：`/tmp/fishing-2026-11-05/evidence/A-gen-rawlog.py`
- 预览服日志：`/tmp/fishing-2026-11-05/evidence/A-serve-8903.log`

> 纪律：每个数字旁给复跑命令；「测不到 ≠ 不存在」先给肯定用例；反向断言必须能变红。
> 本票**不改产品代码、不改净化 dist 副本**（其他票共用这份 767 条清单的副本）。

---

## 0. 判据口径（先定义，再判）

**release 类字节判据（spec 白名单）**：文件名以
`*.wasm / *.tar.gz / *.zip / *.whl / *.tar.bz2 / *.oct / *.data` 结尾。

判据脚本（可复跑）：
```sh
sh /tmp/fishing-2026-11-05/evidence/A-releaselike-predicate.sh /tmp/fishing-2026-11-05/dist-clean
# 输出裸数字：0 = 绿（无 release 类字节），>0 = 红
```

**肯定用例（证明探针能测到「存在」，不是恒真 0）**：同一个 `find | grep` 作用在未净化的原 dist 上：
```sh
find /mnt/hdd/antigravity-projects/Octave-UI/dist -type f | grep -E '\.(wasm|tar\.gz|zip|whl|tar\.bz2|oct|data)$' | wc -l
# => 767
```
同一个判据在净化副本上得到 0 ⇒ **0 是真 absence，不是坏探针**（满足 SHARED「测不到≠不存在」）。

---

## 1. 净化 dist 完备性证据

### 1.1 移走清单 `removed-files.txt` 核对 — PASS

| 项 | 实测值 | 复跑命令 |
|---|---|---|
| 清单总行数 | 767 | `wc -l /tmp/fishing-2026-11-05/removed-files.txt` |
| 不匹配白名单的行数 | 0 | `grep -cvE '\.(wasm\|tar\.gz\|zip\|whl\|tar\.bz2\|oct\|data)$' /tmp/fishing-2026-11-05/removed-files.txt` |
| 767 条在 dist-clean 仍存在数 | 0 | `while IFS= read -r f; do [ -e "/tmp/fishing-2026-11-05/dist-clean/${f#./}" ] && echo "$f"; done < /tmp/fishing-2026-11-05/removed-files.txt \| wc -l` |
| 扩展名分布 | 692 `.oct` / 34 `.gz`(全为 `.tar.gz`) / 21 `.wasm` / 14 `.data` / 4 `.whl` / 2 `.zip` | `sed -E 's/.*\.([a-zA-Z0-9.]+)$/\1/' /tmp/fishing-2026-11-05/removed-files.txt \| sort \| uniq -c \| sort -rn` |
| `.gz` 中非 `.tar.gz` 的 | 0 | `grep -E '\.gz$' /tmp/fishing-2026-11-05/removed-files.txt \| grep -vE '\.tar\.gz$'` |
| 净化后 dist-clean 全部文件 | 394 | `find /tmp/fishing-2026-11-05/dist-clean -type f \| wc -l` |

**PASS**：767 条全部是白名单扩展名、全部确实从 dist-clean 移走；净化副本 releaselike 计数 = 0。

### 1.2 粗净化（767）vs 精确净化（75）分类 — 按 coordinator 补充，PASS（分类结论，非 FAIL）

coordinator 实测指出：767 条里 **692 个 `.oct`** 不是 release 交付的引擎字节，而是 forge 内容包
`*.tar.gz` 解包后的工具箱产物（「内容契约解包面」）。我用自己的复跑独立重证如下：

| 项 | 实测值 | 复跑命令 |
|---|---|---|
| 粗净化条数 | 767 | `wc -l /tmp/fishing-2026-11-05/removed-files.txt` |
| 其中 `.oct` | 692 | `grep -c '\.oct$' /tmp/fishing-2026-11-05/removed-files.txt` |
| 精确净化条数（非 `.oct`） | 75 | `grep -vc '\.oct$' /tmp/fishing-2026-11-05/removed-files.txt` |
| 精确净化 75 的扩展名 | 34 `.tar.gz` / 21 `.wasm` / 14 `.data` / 4 `.whl` / 2 `.zip` | `grep -v '\.oct$' /tmp/fishing-2026-11-05/removed-files.txt \| sed -E 's/.*\.([a-zA-Z0-9.]+)$/\1/' \| sort \| uniq -c \| sort -rn` |

**`.oct` 归属判据（catalogue 里 0 个 `.oct` entry 的实测输出）**：我把 18 条 release 的
`base+manifest.json` 全部拉下来（见 §4），逐条枚举 `entries[].name`：

```sh
# 18 份 manifest 在 /tmp/A-manifests/*.json（由 §4 命令生成）
python3 -I -c "
import json,glob
tot=octn=0
for f in sorted(glob.glob('/tmp/A-manifests/*.json')):
    for e in json.load(open(f)).get('entries',[]):
        tot+=1
        if e['name'].endswith('.oct'): octn+=1
print('total manifest entries across 18 releases:',tot)
print('.oct entries:',octn)
"
# => total manifest entries across 18 releases: 44
# => .oct entries: 0
```

44 个 entry 的名字扩展名分布（我自测）：
`gz:13, js:6, wasm:6, mjs:5, data:3, txt:2, tar:2, whl:2, ts:2, bz2:1, zip:1, (none):1` —
含 0 个 `.oct`。说明 catalogue 的 release 从不交付 `.oct`，那 692 个 `.oct` 是 forge 压缩包解包产物。

**结论（按 coordinator 要求明确写出）**：本轮验收应采用**精确净化口径（75 条）**；
`removed-files.txt` 的 767 条是过宽的粗净化。692 个 `.oct` 的移除**不是**产品缺陷证据，
若某票因 `.oct` 缺失 FAIL，那是**假红不是产品缺陷**。
为保持各票证据一致，**我没有改动净化副本**（仍是移走 767 条的那份，其他票照用）。

### 1.3 保留下来的非 release 文件分类，及「为什么不是 release 字节」

`dist-clean` 共 394 个文件。扩展名全分布（复跑：
`find /tmp/fishing-2026-11-05/dist-clean -type f | sed -E 's/.*\.([a-zA-Z0-9]+)$/\1/' | sort | uniq -c | sort -rn`）：

| 类别 | 数量 | 代表 | 为什么不是 release 字节 |
|---|---|---|---|
| `.js` | 206 | `assets-loader.js`、`octave-*.js`、`_astro/*.js`、`bridge/**`、forge `pkg/*.js` | JS 胶水/编译产物，spec 白名单明确豁免「bridge JS」；非引擎 wasm/data 大字节 |
| `.m` | 65 | `assets/**/*.m`、lanes 下的 Octave 脚本 | Octave 源码脚本（文本，最大 13 KB），非二进制 release 载荷 |
| `.json` | 48 | `assets/manifest.json`、`assets/meta.json`、`*octave.build.json`、`forge-catalog.json`、`pyodide-lock.json` | 站点自建索引/构建清单（见下方说明），不是 catalogue 的 release manifest |
| `.mjs` | 23 | `compile-worker.mjs`、`multi-tu.mjs`、`assets/llvm/driver/*.mjs` | 模块胶水 |
| `.html` | 9 | `index.html`、`embed-demo.html`、`lanes/*/index.html` | 页面骨架 |
| `.ts` | 6 | `omc/*.d.ts`、`pyodide/*.d.ts` | 类型声明 |
| `.texi` / `.txt` / `.css` / `.svg` / `.tar` / `.exe` / `.bat` | 5/4/2/1/4/2/2 | `favicon.svg`、LLVM LICENSE、pyodide `python.exe`、sysroot `.tar` | 见下方 `.tar` 例外与 `python.exe` 说明 |
| 无扩展名 | 17 | `VERSION`、`doc-cache`、`built-in-docstrings`、`LICENSE`、`python` | 文本/缓存/启动器 |

**站点 JSON 不是 release manifest（关键区分）**：`dist-clean/assets/llvm/manifest.json` 的
sha256 为 `d2ede618…`，而 catalogue 里 `LLVM-wasm/v0.1.6` 的 `manifest_sha256` 是 `293445fa…`
（复跑 `sha256sum /tmp/fishing-2026-11-05/dist-clean/assets/llvm/manifest.json`，对照 §4 表）。
二者不同 ⇒ 站点内这些 `manifest.json` 是站点自己的资产索引，不是「托管的 release 字节」。

**pyodide 的 `python.exe`/`python.bat`/`python`**：COM 启动器/脚本与包内文件，非 wasm/data/release 载荷；
按 SHARED 的 pyodide `form:"tree"` 合规例外，不写成命中失败。

### 1.4 ⚠️ 发现：白名单遗漏了 4 个真正的 release 大字节 `.tar` — **FAIL（完备性缺口，记录不修）**

这是本票**独立发现**、必须诚实报出的缺口。spec 的移走白名单列了
`*.tar.gz / *.tar.bz2 / *.zip / *.whl / *.oct / *.wasm / *.data`，**没有列 `*.tar`**。
但 LLVM-wasm/v0.1.6 的 release manifest 里确实有两个 `.tar` entry：

```sh
python3 -I -c "
import json
d=json.load(open('/tmp/A-manifests/LLVM-wasm__v0.1.6.json'))
for e in d['entries']:
    if e['name'].endswith('.tar'):
        print(e['name'], e['bytes'], e['sha256'])
"
# => sysroot-headers.tar        20654080 5b9a8d2cd528f3f6c4d3752b153a4aa4495d2416ccb28655a63b9a268d0efa0e
# => sysroot-headers.wasm64.tar 20654080 8d82242177651dc4c1108c1aae61a704a9f01c409cfd5b24eb6ba79a1cff0c97
```

dist-clean 里仍留着 4 个这样的文件（2 份 × `assets/` 与 `bridge/` 镜像）：
```sh
find /tmp/fishing-2026-11-05/dist-clean -type f -name '*.tar' -printf '%s %p\n' | sort -n
# => 20654080 ./assets/llvm/sysroot-headers.tar
# => 20654080 ./assets/llvm/sysroot-headers.wasm64.tar
# => 20654080 ./bridge/assets/llvm/sysroot-headers.tar
# => 20654080 ./bridge/assets/llvm/sysroot-headers.wasm64.tar
find /tmp/fishing-2026-11-05/dist-clean -type f -name '*.tar' -exec sha256sum {} \; | sort
# => 5b9a8d2c…  assets/llvm/sysroot-headers.tar
# => 5b9a8d2c…  bridge/assets/llvm/sysroot-headers.tar
# => 8d822421…  assets/llvm/sysroot-headers.wasm64.tar
# => 8d822421…  bridge/assets/llvm/sysroot-headers.wasm64.tar
```

**字节级判据（不是只看扩展名）**：我算了 dist-clean 全部 394 个文件的 sha256，与 18 份 release
manifest 的全部 sha 逐一对账。18 份 manifest 共 44 个 entry + 266 个 chunk = 310 个 sha 值，
去重后 **264 个不同 sha**（复跑：`python3 -I -c "import json;print(len(json.load(open('/tmp/A-sha-map.json'))))"` ⇒ 264；
重复源于跨 release / 跨 variant 的相同字节块）。对账结果：**23 个保留文件命中**
（复跑见 `A-gen-rawlog.py` §6；`A-raw.log` §6）。其中：

- **19 个是小文本/胶水**（`clang.js` 76 KB、`lld-wasm-only.js` 72 KB、OMC `*.js`/`*.d.ts`、
  LLVM `LICENSE*`、`driver/*.mjs` 1–6 KB）：属于 spec 明确豁免的 JS/类型声明/文本，
  且站点把它们当胶水用，不是被「托管的大字节」。按 spec「非 release 用途（bridge JS 内嵌小段数据、
  favicon 类）不算违规」的口径，可归为豁免面。
- **4 个是 20,654,080 B 的 `sysroot-headers*.tar`**：既是 release manifest 的 entry，又是大二进制
  载荷，且被站点代码以**站点本地路径**取用：
  `dist-clean/assets-loader.js:470-476` 里 `fetchJSON('assets/llvm/manifest.json')` 后
  `var B = 'assets/llvm/'` 并据 `sysroot-headers.tar` 取文件，注释写着
  `「工具链缺 sysroot…（站点供给不全？跑 provision-llvm-wasm.sh）」`。

**FAIL 判定**：粗净化（767）与精确净化（75）两个白名单**都漏了这 4 个 release 大字节**。
因此「dist-clean 内 release 类字节为 0」这一判据按扩展名口径为 0（见 §1.1、§5），
但按「字节级是否命中 release manifest」口径**不为 0（有 4 个）**。这是净化完备性的真实缺口，
**不是产品缺陷、不是恒真判据**。按分工（钓鱼不改产品/不改副本），本票**只记录，不修**，
交给汇总票 H 与 LLVM 相关票（D）裁定：
- 若判「完全不托管」按字节级口径 ⇒ 这 4 个 `.tar` 也必须移走，否则 LLVM 工具链可能靠站内兜底；
- 若按 spec 扩展名口径 ⇒ 需在报告里显式豁免，并说明站点 `assets-loader.js` 对它们的本地取用路径。

> 附带观察（交消费层票 B–F，不在本票判 PASS/FAIL）：站点构建 JS 里仍硬编码了
> `w64/octave.wasm`、`assets/llvm/lld-wasm-only.wasm`、`omc/OpenModelicaCompiler_bg.wasm`
> 等站点本地路径；同时 `_astro/App.BL-Zkp6f.js` 也含
> `static.isui.ren/catalogue.json` 与 `static.mango-mesa.ccwu.cc/catalogue.json` 两个候选。
> 到底是「catalogue 解析器覆盖」还是「站内路径兜底」，需要真浏览器网络日志判定——那正是消费层的职责。

---

## 2. 预览服（端口 8903） — PASS

启动（后台常驻，保留给其他票做 8903 基线对照）：
```sh
cd /mnt/hdd/antigravity-projects/Octave-UI && \
  nohup python3 scripts/serve.py --dir /tmp/fishing-2026-11-05/dist-clean --port 8903 \
  > /tmp/fishing-2026-11-05/evidence/A-serve-8903.log 2>&1 &
```

| 项 | 实测值 | 复跑命令 |
|---|---|---|
| 监听 | `127.0.0.1:8903` (pid 存活) | `ss -ltnp \| grep ':8903'` |
| `http://localhost:8903/repo/Octave/` | HTTP 200 / 23858 B | `curl -sS -o /dev/null -w 'HTTP:%{http_code} bytes:%{size_download}\n' http://localhost:8903/repo/Octave/` |
| `http://127.0.0.1:8903/repo/Octave/` | HTTP 200 / 23858 B | 同上换 host |
| 返回体 == `dist-clean/index.html` | 逐字相同（sha `abf0f6ef…`） | `sha256sum <(curl -sS http://localhost:8903/repo/Octave/) /tmp/fishing-2026-11-05/dist-clean/index.html` |
| 响应头 | `COOP: same-origin` / `COEP: require-corp` | `curl -sS -D - -o /dev/null http://localhost:8903/repo/Octave/` |
| 页面标题 | `GNU Octave 11.3.0 WebAssembly UI` | `grep -oi '<title>[^<]*</title>'` |

> 环境说明：SHARED.md 写「serve.py 绑 `[::1]` 用 localhost」，但本仓 `scripts/serve.py` 默认
> `bind="127.0.0.1"`；实测 `localhost` 与 `127.0.0.1` 均 200，两者都记下。**端口 8905 已被另一票占用**，
> 8903/8904/8906 各票专用，本票只占 8903。预览服在反向断言后复查仍 200。

---

## 3. catalogue 双线探测 — PASS

| 线 | URL | HTTP | 字节数 | verified_at | release 条数 | excluded |
|---|---|---|---|---|---|---|
| EO 主线 | `https://static.isui.ren/catalogue.json` | 200 | 11245 | `2026-11-05T12:24:38Z` | 18 | 7 |
| CF 备线 | `https://static.mango-mesa.ccwu.cc/catalogue.json` | 200 | 11425 | `2026-11-05T12:24:38Z` | 18 | 7 |

复跑：
```sh
curl -sS --max-time 40 -o /tmp/A-cat-EO.json -w 'HTTP:%{http_code} bytes:%{size_download}\n' https://static.isui.ren/catalogue.json
curl -sS --max-time 40 -o /tmp/A-cat-CF.json -w 'HTTP:%{http_code} bytes:%{size_download}\n' https://static.mango-mesa.ccwu.cc/catalogue.json
python3 -I -c "
import json
for p in ['/tmp/A-cat-EO.json','/tmp/A-cat-CF.json']:
    d=json.load(open(p)); print(p, d['verified_at'], len(d['releases']), len(d['excluded']))
"
```

**两线一致性（我自测）**：
```sh
python3 -I -c "
import json
a=json.load(open('/tmp/A-cat-EO.json')); b=json.load(open('/tmp/A-cat-CF.json'))
ba={r['id']:r for r in a['releases']}; bb={r['id']:r for r in b['releases']}
print('ids ordered equal:', [r['id'] for r in a['releases']]==[r['id'] for r in b['releases']])
print('manifest_sha256 all equal:', all(ba[k]['manifest_sha256']==bb[k]['manifest_sha256'] for k in ba))
print('base_proxy all equal:', all(ba[k]['base_proxy']==bb[k]['base_proxy'] for k in ba))
print('base_proxy present all 18:', all('base_proxy' in r for r in a['releases']))
"
# => ids ordered equal: True / manifest_sha256 all equal: True / base_proxy all equal: True / present: True
```
字节差 11245 → 11425 = **+180**，完全由 `base` 主机名长度差解释：
`static.mango-mesa.ccwu.cc` 比 `static.isui.ren` 长 10 字符 × 18 条 = 180（复跑：
`python3 -I -c "print((len('static.mango-mesa.ccwu.cc')-len('static.isui.ren'))*18)"` ⇒ 180）。
差异只在 `base` 字段（逐字段对比只有 18 个 `base` 不同），`verified_at`/`note`/`ids`/`manifest_sha256`/`base_proxy` 全同。

> 环境观察：`curl -w remote_ip` 返回 `127.0.0.1`，说明本机对这两个域走了本地透明代理；
> 字节与字段判定不受影响，但如实在 `A-raw.log` §3 记下。

**18 条 id（逐条列出，两线顺序一致）**：
```
 1. LLVM-wasm/v0.1.6
 2. Octave-Extra-Content/forge-cgi-0.1.2
 3. Octave-Extra-Content/forge-datatypes-1.4.2
 4. Octave-Extra-Content/forge-geometry-4.1.0
 5. Octave-Extra-Content/forge-matgeom-1.2.4
 6. Octave-Extra-Content/forge-miscellaneous-1.3.3
 7. Octave-Extra-Content/forge-nan-3.7.2
 8. Octave-Extra-Content/forge-optim-1.6.3
 9. Octave-Extra-Content/forge-quaternion-2.4.2
10. Octave-Extra-Content/forge-splines-1.3.5
11. Octave-Extra-Content/forge-statistics-1.7.7
12. Octave-Extra-Content/forge-struct-1.0.18
13. Octave-Extra-Content/forge-symbolic-3.2.2
14. Octave-Extra-Content/forge-tsa-4.6.3
15. Octave-Extra-Content/supply-pyodide-314.0.7
16. Octave-Full-Wasm/v0.1.0
17. OpenModelica-Full-Wasm/msl-4.1.0-maint.om
18. OpenModelica-Full-Wasm/v0.2.0-wasm32
```
覆盖：Octave 三档产物(16) / OpenModelica + MSL(17,18) / LLVM(1) / 13 forge(2–14) /
pyodide(15)。与 spec 的「18 条覆盖」一致。

---

## 4. 供给清单对账（18 条 `base+manifest.json` + `manifest_sha256` 校验） — PASS 18/18

口径：用 **EO catalogue 的 `base` 字段**拼 `manifest.json`（不手拼）；把响应体做 `sha256sum`
与 catalogue 的 `manifest_sha256` 逐字比对。`base_proxy` 在场也记录。

复跑（完整脚本输出在 `A-raw.log` §4）：
```sh
python3 -I -c "
import json,urllib.request,hashlib
cat=json.load(open('/tmp/A-cat-EO.json'))
for i,r in enumerate(cat['releases'],1):
    u=r['base'].rstrip('/')+'/manifest.json'
    with urllib.request.urlopen(u,timeout=45) as f: b=f.read(); http=f.status
    ok=hashlib.sha256(b).hexdigest()==r['manifest_sha256']
    print(i, http, len(b), 'PASS' if ok else 'FAIL', r['id'])
"
```

| # | id | HTTP | bytes | sha 比对 | base_proxy 在场 |
|---|---|---|---|---|---|
| 1 | LLVM-wasm/v0.1.6 | 200 | 28602 | PASS | ✓ |
| 2 | Octave-Extra-Content/forge-cgi-0.1.2 | 200 | 765 | PASS | ✓ |
| 3 | Octave-Extra-Content/forge-datatypes-1.4.2 | 200 | 789 | PASS | ✓ |
| 4 | Octave-Extra-Content/forge-geometry-4.1.0 | 200 | 802 | PASS | ✓ |
| 5 | Octave-Extra-Content/forge-matgeom-1.2.4 | 200 | 793 | PASS | ✓ |
| 6 | Octave-Extra-Content/forge-miscellaneous-1.3.3 | 200 | 808 | PASS | ✓ |
| 7 | Octave-Extra-Content/forge-nan-3.7.2 | 200 | 770 | PASS | ✓ |
| 8 | Octave-Extra-Content/forge-optim-1.6.3 | 200 | 798 | PASS | ✓ |
| 9 | Octave-Extra-Content/forge-quaternion-2.4.2 | 200 | 796 | PASS | ✓ |
| 10 | Octave-Extra-Content/forge-splines-1.3.5 | 200 | 813 | PASS | ✓ |
| 11 | Octave-Extra-Content/forge-statistics-1.7.7 | 200 | 793 | PASS | ✓ |
| 12 | Octave-Extra-Content/forge-struct-1.0.18 | 200 | 783 | PASS | ✓ |
| 13 | Octave-Extra-Content/forge-symbolic-3.2.2 | 200 | 781 | PASS | ✓ |
| 14 | Octave-Extra-Content/forge-tsa-4.6.3 | 200 | 768 | PASS | ✓ |
| 15 | Octave-Extra-Content/supply-pyodide-314.0.7 | 200 | 3140 | PASS | ✓ |
| 16 | Octave-Full-Wasm/v0.1.0 | 200 | 20782 | PASS | ✓ |
| 17 | OpenModelica-Full-Wasm/msl-4.1.0-maint.om | 200 | 1400 | PASS | ✓ |
| 18 | OpenModelica-Full-Wasm/v0.2.0-wasm32 | 200 | 12946 | PASS | ✓ |

**PASS 18 / 18，FAIL 0 / 18**；逐条 expected/actual sha 见 `A-raw.log` §4。
`base_proxy` 18/18 在场（均为 `https://github.com/ArchivalEra/.../releases/download/.../`）。

### 4.1 CF 备线 base 也逐条可 200 + sha PASS（18/18） — PASS

用 CF catalogue 的 `base` 拼 `manifest.json` 重跑（复跑见 `A-raw.log` §4b）：
```sh
python3 -I -c "
import json,subprocess,hashlib
b=json.load(open('/tmp/A-cat-CF.json'))
for r in b['releases']:
    u=r['base'].rstrip('/')+'/manifest.json'
    subprocess.run(['curl','-sS','--max-time','45','-o','/tmp/A-cfm','-w','%{http_code} %{size_download}',u],capture_output=True,text=True)
    # 判据：HTTP 200 且 sha256(body)==r['manifest_sha256']
"
```
=> CF base PASS 18 / 18，FAIL 0 / 18。

**探针纪律（「测不到 ≠ 不存在」实例的正面记录）**：我第一次用 Python `urllib` 探 CF base 得到
**403 `error code: 1010`（Cloudflare bot 拦截）**，18/18 全 FAIL——这是**探针缺陷**，不是供给故障。
换 `curl`（带正常 UA/指纹）后 18/18 全 200。复跑对照：
```sh
python3 -I -c "import urllib.request; urllib.request.urlopen('https://static.mango-mesa.ccwu.cc/ArchivalEra/LLVM-wasm/releases/download/v0.1.6/manifest.json',timeout=30)"   # => HTTP 403 error code: 1010
curl -sS -o /dev/null -w 'HTTP:%{http_code} bytes:%{size_download}\n' https://static.mango-mesa.ccwu.cc/ArchivalEra/LLVM-wasm/releases/download/v0.1.6/manifest.json  # => 200 / 28602
```
⇒ 结论以 `curl` 探针为准；CF 备线供给 **PASS**。

### 4.2 GitHub `base_proxy` 可达（抽样 3 条） — PASS（在场 + 可达）

SHARED 提到「GitHub 直连超时」已知现象；本票实测 3 条 `-L` 跟随 302 后均 200：
```sh
for u in \
 https://github.com/ArchivalEra/LLVM-wasm/releases/download/v0.1.6/manifest.json \
 https://github.com/ArchivalEra/Octave-Extra-Content/releases/download/forge-statistics-1.7.7/manifest.json \
 https://github.com/ArchivalEra/OpenModelica-Full-Wasm/releases/download/v0.2.0-wasm32/manifest.json; do
 curl -sSL --max-time 25 -o /dev/null -w "HTTP:%{http_code} bytes:%{size_download} redirects:%{num_redirects}\n" "$u"
done
# => 200 / 28602 / 1 ; 200 / 793 / 1 ; 200 / 12946 / 1
```
按分工「`base_proxy` 在场也记下（不要求逐个都通）」：本票只记在场 + 3 条抽样可达；
**未逐条全测 18 条 GitHub**（如实列为未验边界，交汇总票 H）。
即便 GitHub 直连超时，EO 主线与 CF 备线均 18/18 PASS ⇒ 按硬约束「EO 主线通就算供给 PASS」。

---

## 5. 反向断言（证明判据不是恒真） — PASS

| 步 | 操作 | 判据输出 | 判定 |
|---|---|---|---|
| 1 | 净化态基线 | `0` | 绿 |
| 2 | 把一个**真实 release 字节**放回：`cp /mnt/hdd/antigravity-projects/Octave-UI/dist/w64/octave.wasm → /tmp/fishing-2026-11-05/dist-clean/w64/octave.wasm`（31,003,790 B） | `1` | **红**（判据能抓到存在） |
| 3 | 恢复：`rm /tmp/fishing-2026-11-05/dist-clean/w64/octave.wasm` | `0` | 绿 |

复跑（完整可复制，见 `A-raw.log` §5）：
```sh
P=/tmp/fishing-2026-11-05/evidence/A-releaselike-predicate.sh
D=/tmp/fishing-2026-11-05/dist-clean
sh "$P" "$D"                                    # => 0   (绿)
cp /mnt/hdd/antigravity-projects/Octave-UI/dist/w64/octave.wasm "$D/w64/octave.wasm"
sh "$P" "$D"                                    # => 1   (红)
find "$D" -type f | grep -E '\.(wasm|tar\.gz|zip|whl|tar\.bz2|oct|data)$'   # 抓到的正是该文件
rm "$D/w64/octave.wasm"
sh "$P" "$D"                                    # => 0   (绿，已恢复)
find "$D" -type f | wc -l                       # => 394 (副本未被破坏)
curl -sS -o /dev/null -w 'HTTP:%{http_code}\n' http://localhost:8903/repo/Octave/   # => 200 (服仍在)
```
**PASS**：判据可证伪（拿掉能力 ⇒ 放一个字节即变红），且恢复后副本与预览服完好，其他票可继续用 8903。

> 注意：此反向断言证明的是「spec 扩展名口径」的判据不自恒真。§1.4 已指出该口径本身
> 漏了 4 个 `.tar`；即「扩展名=0」为真，但「字节级 release 命中=0」为假。两者不矛盾，
> 都如实记录。

---

## 6. 逐项 PASS/FAIL 汇总

| # | 项 | 判定 | 一句话 |
|---|---|---|---|
| 1 | 767 条移走清单为白名单字节、且确实移走 | **PASS** | 0 条越界、0 条残留；肯定用例原 dist 767 |
| 2 | dist-clean releaselike = 0 | **PASS**（扩展名口径） | `find|grep` 得 0，探针有肯定用例 |
| 3 | 粗 767 / 精确 75 分类、`.oct` 归属 | **PASS** | 692 `.oct`，catalogue 44 entry 中 0 个 `.oct`；本轮应采用精确口径，`.oct` 缺失 FAIL 是假红 |
| 4 | 保留文件分类与「非 release」说明 | **PASS**（除 §1.4） | 394 文件按类别列明；站点 JSON 是自建索引非 release manifest |
| 5 | **白名单完整性（字节级）** | **FAIL** | 4 个 20 MB `sysroot-headers*.tar` 命中 LLVM release manifest entry 且仍在 dist-clean；粗/精两口径都漏 |
| 6 | 预览服 8903 / `/repo/Octave/` 200 | **PASS** | localhost 与 127.0.0.1 均 200/23858 B，COOP/COEP 在 |
| 7 | catalogue EO 主线 200 | **PASS** | 11245 B / verified_at 2026-11-05T12:24:38Z / 18 条 |
| 8 | catalogue CF 备线 200 | **PASS** | 11425 B / 同 verified_at / 同 18 ids 顺序 |
| 9 | 双线 18 条 id 逐条列出 | **PASS** | 见 §3 清单 |
| 10 | EO base + manifest sha256 对账 | **PASS 18/18** | 全 200、全逐字一致 |
| 11 | CF base + manifest sha256 对账 | **PASS 18/18** | 全 200、全逐字一致（curl 探针） |
| 12 | `base_proxy` 在场 | **PASS** | 18/18 在场；GitHub 抽样 3 条 -L 后 200 |
| 13 | 反向断言（放回 .wasm 变红再恢复） | **PASS** | 0→1→0，副本 394 文件、服 200 |
| 14 | 供给层总判定 | **PASS（EO 主线通）** | 见下 |

**票 A 总判定：供给层 PASS**（EO 主线 18/18 manifest sha 逐字一致、CF 备线 18/18、
双线 catalogue 在线、预览服 200、反向断言成立）。
唯一 **FAIL** 是 §1.4 的**净化副本完备性缺口**（4 个 `.tar` release 大字节未被移走）——
这是**验收夹具的口径问题/发现**，按分工记录为 FAIL + 复跑命令，**不修产品、不改副本**，
交汇总票 H 与票 D 裁定是否需补移。

---

## 7. 未验边界（诚实列出）

- GitHub `base_proxy` **未逐条测全 18 条**（按分工只需「在场」，本票抽样 3 条可达）；若 GitHub 直连超时属已知现象，按硬约束不算 FAIL。
- CF base 首轮 `urllib` 403（Cloudflare 1010）已用 `curl` 纠正；本票未测浏览器内 fetch 是否被 CF 拦（属消费层票 B–F）。
- 站点 JS 内仍存在 `w64/octave.wasm` 等站内路径与两条 catalogue 候选并存的情形：到底 catalogue 是否覆盖站内兜底，本票（供给层）**不判**，交真浏览器网络日志的消费层票。
- 4 个 `sysroot-headers*.tar` 是否在真浏览器里被实际请求、以及是否构成 LLVM 工具链的站内兜底，本票只证明了「字节在 + 被站点代码本地取用」，**未做运行时验证**（票 D / 汇总票 H）。
- catalogue 全失败时的「响亮报错」是票 G 的职责，本票未触发、未验。
- pyodide `form:"tree"` 例外按 SHARED 如实记录，本票未写成命中失败。
- 低端设备性能、真站点 `isui.ren` 部署操作：Out of Scope，未验。
