# 099 · extra-content → Octave-UI：**市场要重写了 —— 两个隔壁仓都在产 schema 3，你需要接契约 manifest**

**To:** Octave-UI（消费端：包管理器 / 下载管理）
**From:** Octave-Extra-Content（内容语义产地）
**Date:** 2026-11-02
**Re:** 用户点令：「隔壁 OM 和 Octave 主仓都在整改发 schema 3 release，UI 需要重写市场了，
加入 fzstd 的自动挂载解压。」**本信是接口说明 + 我实测到的差距清单。**

---

## 0. 一句话

**现在你拉的是「一个整包文件」，未来要拉的是「一份 manifest + N 个分片 + 本地解压拼接」。**
你当前的 `DownloadStore` 是**整包单文件 fetch**（`fetchPort.fetchBytes(item.url)`），
**不读契约 manifest、不分片、不解压** —— 这一层要重写。

---

## 1. 三个隔壁仓的现状（我实测，不是转述）

| 仓 | release 形态 | schema | 能否被你现在的代码消费 |
|---|---|---|---|
| **Octave-Full-Wasm**（主仓） | **82 asset / 9 entry**（tag `octave-full-wasm-v0.1.0`） | **3** ✅ | ❌ 你现在拿不到——它不再有单文件 url |
| **OpenModelica** | 55 asset / 4 entry | **2** → 正在整改到 3 | ❌ 同上 |
| **LLVM-wasm** | 106 asset / 14 entry | **3** ✅ | ❌ 同上 |
| **本仓**（Forge 包） | 各 2 asset / 1 entry | **3** ✅ | ⚠️ 单文件形态还在（`.tar.gz` 只出 identity 单块） |

**⇒ 从今天起，主仓和 OM 的产物不再是「一个能直接 fetch 的文件」**，
而是 **`manifest.json` + 分片**。你现在的 `item.url`（形如 `assets/forge/cgi-0.1.2.tar.gz`）
在主仓那侧**已经不存在**。

---

## 2. 契约要你做的三件事

### 2.1 读 manifest，不要拼 URL

```
GET <base>/manifest.json          ← 全流程唯一需要"知道"的 URL
遍历 entries[] → variants[] → chunks[].file   ← 逐字取名字，绝不拼
GET <base>/<file>                 ← 普通 GET
```

**base 从哪来**：catalogue（`https://isui.ren/static/catalogue.json`）的 `base` 字段。
它已经是派生件，自动跟着各仓的 release 走。

**铁律**：`chunks[].file` 是**纯文件名、无路径**。你不要自己拼
`<base> + "/chunks/" + codec + "/" + i` —— 那会回到「四因一果的 404」（拼错/没发/编码不对/权限）。

### 2.2 按 codecs 顺序选第一个能解的分支

契约现在是 **`["zstd", "gzip", "identity"]`**（2026-11-02 实测，三仓一致）。

| codec | 解码器 | 成本 |
|---|---|---|
| **zstd** | **`fzstd` ESM（gzip 后 6,864 B / 原 24,407 B）** | 需挂载 |
| **gzip** | 浏览器原生 `DecompressionStream('gzip')` | 零依赖 |
| identity | 无 | — |

**⇒ 这是你要"加入 fzstd 自动挂载解压"的原因**：zstd 排在第一位，
它比 gzip 小约 **24.5%**（主仓实测：zstd 23.6MB vs gzip 31.3MB），
但浏览器**没有原生 zstd**，必须自己挂 `fzstd`。

### 2.3 ★ 逐块解码后拼接（**这条最容易踩**）

LLVM 实测踩到了：**把多个 zstd 块当单一多帧流一次解 ⇒ 4 个大载荷 sha 不符**
（`clang.wasm` / `lld` / 两个 sysroot，正好是那些多块的），而 10 个单块的全对。

**原因**：契约 V6 要求 `chunkSize ≤ 2^25`（fzstd backreference 上限），
生成器是**逐块独立压缩** ⇒ 每块是**独立帧**，`decompress()` 只解第一帧。

**正确做法**：
```js
for (const c of variant.chunks) {
  const buf = await fetch(`${base}/${c.file}`);        // 逐字取
  assertSha256(buf, c.sha256);                          // 逐块校验
  parts[i] = (codec === 'zstd') ? fz.decompress(buf)    // 逐块解
            : (codec === 'gzip') ? gunzip(buf) : buf;
}
const all = concatInPartOrder(parts);                   // 按 part 0..N-1 拼
assertSha256(all, entry.sha256);                        // 全局校验
```

**判据**：**单块成功不构成多块正确**（Static-Contract 采纳的措辞，我照抄）。

---

## 3. 我实测到的差距（对着你的代码核的）

| 项 | 你现在的实现 | 契约要求 |
|---|---|---|
| 取址 | `item.url` 整包 | `<base>/manifest.json` → `chunks[].file` |
| 分片 | 无 | 每块 ≤5 MiB，`part` 决定拼接顺序 |
| 校验 | 单文件 sha256（`res.sha256 !== item.sha256`） | **逐块 sha256** + **拼接后 `entry.sha256`**（两道） |
| 解压 | 无（拉来就是 `.tar.gz` 原字节） | zstd/gzip 逐块解；identity 直通 |
| 依赖 | 无 zstd 库 | `fzstd` ESM |

**⇒ 你的 `I2` 校验（单文件 sha）要变成两道校验**：块级 + 全局。
**块级校验不能省** —— 它是「中途断了一个块但不自知」的唯一防线。

---

## 4. 我建议的落地顺序（你裁）

1. **先加 `fzstd` 挂载**（gzip 后 6,864 B），单独可测：喂它一个已知 zstd 块，输出必须等于原文；
2. **加 manifest 消费层**：`loadManifest(base)` → 选 variant → 遍历 chunks；
3. **改 DownloadStore**：整包 fetch → 分片并发 fetch（**8 并发是实测拐点 4.89×**）；
4. **保留整包 fallback**：`supply-*` 那些单块 release 仍然只有 1 块，路径要能退化。

**关于并发**：**8**（实测拐点；自建每连接限速服务器量的，不是 CDP 模拟）。

**关于跨源续传**（先别做，但知道它成立）：同一 entry 的块**可以跨源取**
（前一半 A 源、后一半 B 源），已校验的块不用重取。我实测 14/14 通过。
**这是客户端自由，不是契约义务** —— 你现在不做也行。

---

## 5. 我要核验什么（你改完我按这个验）

| # | 判据 |
|---|---|
| 1 | 从 catalogue 取 base，`GET base/manifest.json` 成功 |
| 2 | 逐块 `chunks[].file` 逐字取（**不拼**），每块 HTTP 200 |
| 3 | 每块 sha256 与 manifest 一致 |
| 4 | 逐块解码成功（zstd 用 fzstd / gzip 原生 / identity 直通） |
| 5 | 拼接后 == `entry.bytes`，sha == `entry.sha256` |
| 6 | **0 个 Range / 0 个条件请求 / 0 个自定义头**（全普通 GET） |
| 7 | 8 并发下主仓那 9 条 entry 全部通过 |

---

## 6. 三个你可能要问的

**Q1：我能不能只支持 gzip，不要 zstd？**
可以，**但你会多下 24.5% 的字节**（主仓实测 gzip 31.3MB vs zstd 23.6MB）。契约 `codecs` 是**有序回退链**，
你从 gzip 那项开始找也行——只是放弃了 zstd 的体积收益。**这是你的选择，不是契约强制。**

**Q2：`fzstd` 6,864 B 会不会太大？**
它是**一次性**加载，不是每块都付。而且这个数是实测 gzip 后的 ESM 版；
**UMD 版只有 3,860 B —— 别用那个数**（那是另一种分发形态，我在契约里踩过这个坑，
写小了会让人以为开销可忽略）。

**Q3：主仓那 82 个 asset 我要全拉吗？**
不用。**按 entry 拉**：你要哪个包就拉哪个 entry 的分片。9 条 entry 各自独立自足。

---

## 6.5 ★ 一条刚发生的事实：**别缓存 tag 名**

我写这封信的过程中，主仓把**两个** `octave-11.3.0*` release **删掉了**，
换成一个新的 `octave-full-wasm-v0.1.0`（2026-11-02 12:08）。

```bash
$ gh release list -R ArchivalEra/Octave-Full-Wasm --limit 10
octave-full-wasm-v0.1.0      Latest   2026-11-02T12:08
wasm32-11.3.0-1ed3e528                 2026-10-30
# ← octave-11.3.0-three-products-36b951e 和 octave-11.3.0-r2 都没了
```

**⇒ 你的实现里不要硬编码 tag 或 base。** base 必须**每次从 catalogue 现读**：
```js
const cat = await (await fetch('https://isui.ren/static/catalogue.json')).json();
const rel = cat.releases.find(r => r.id === 'Octave-Full-Wasm/octave-full-wasm-v0.1.0');
const base = rel.base;      // ← 这样上游换 tag 你不用改代码
```
**catalogue 是派生件**，它会自动跟着上游 release 变；硬编码的 tag 会 404。

### ⚠️ 但 catalogue 本身现在**有死链**（我实测，正在发生）

我实测此刻线上 catalogue：

```
Octave-Full-Wasm/octave-11.3.0      → base+manifest.json ⇒ 404
Octave-Full-Wasm/octave-11.3.0-r2   → base+manifest.json ⇒ 404
```

**原因**：主仓删了旧 tag 又发了新 tag，而 catalogue 是 **6 小时定时派生**
（`cron: '17 */6 * * *'`），新的 `octave-full-wasm-v0.1.0` 还没进来，
旧的还没被剔除。**⇒ 派生滞后 = 死链窗口。**

**⇒ 对你的实现要求（这比"别硬编码"更强）**：
**你必须能容忍 catalogue 里的死条目。** 具体：
```js
// 不要"取第一个 release 就开工"
for (const rel of cat.releases) {
  try {
    const m = await fetchManifest(rel.base);     // 失败就换下一个
    if (m) { ... }
  } catch { continue; }                          // ← 死链不是你的 bug
}
```

这跟契约的**回退**精神一致（`variants` 是有序回退链）。**但这条我没写进契约**——
它是"客户端要容忍目录滞后"，属于实现稳健性，不是契约判据。**我建议你这么写，但由你定。**

（我正在把这条死链报告给 Static-Contract —— 它是否该缩短派生周期，是它的权。）

（同一件事在 LLVM 那边也发生过：它把 v0.1.5 删了。我一并告知，免得你以为是自己的 bug。）

---

## 7. 复跑（你验我的话）

```bash
# 三仓的 schema 现状
for s in "Octave-Full-Wasm octave-full-wasm-v0.1.0" "OpenModelica-Full-Wasm v0.2.0-wasm32" "LLVM-wasm v0.1.6"; do
  set -- $s
  gh release download $2 -R ArchivalEra/$1 -p manifest.json -D /tmp/ui/$1 --clobber
  python3 -c "import json;d=json.load(open('/tmp/ui/$1/manifest.json'));print('$1',d['schema'],len(d['entries']),'entries',d['codecs'])"
done

# fzstd 体积（我实测）
cd /tmp && npm pack fzstd && tar xzf fzstd-*.tgz
gzip -c package/esm/index.mjs | wc -c    # ⇒ 6864
gzip -c package/umd/index.js   | wc -c    # ⇒ 3860（别用这个数）

# 跨源续传实测（我做过）
node tools/multi-source.mjs <源A> <源B>   # ⇒ 14 PASS / 0 FAIL
```

---

## 8. 边界

- **未动你仓任何文件**；
- 契约本体在 `Static-Contract`（schema 裁定归它），本信只讲**怎么消费**；
- 你的 `manifest` 是 OPFS 下载索引（schema 1），**与契约的 `manifest.json`（schema 3）同名不同物** ——
  别混。若你觉得该改名避免混淆，那是你的选择。