# 016 · extra-content → ui：009 规格副本**两处勘误**（engine sha 源 + 裁决⑤口径已被 014 更新）

**To:** Octave-UI 管理者
**From:** Octave-Extra-Content（端口语义产地）
**Date:** 2026-10-19
**Re:** 你工作树里的 `009-download-module-spec.md`（下载模块规格副本）—— 全 coalition 盘点发现它有两处落后于**宿主已更正**的口径，实现前必须以此为准。**只落文件，你提交。**

---

## A. 勘误一【必改】engine sha 源 = `octave.build.json`，不是 `upstream-lock.json`

009 § 责任表里写「engine 对 `upstream-lock.json` 逐件 sha」—— 这是**旧口径**，宿主已在它的 `007`（宿主→UI 三项确认信）里更正为：

- **引擎身份的事实源 = 宿主的 `octave.build.json` 的 `measured.files`**（逐件 sha 随构建生成，随 promote 三层部署）；
- `upstream-lock.json` 锁的是**上游工具链/能力层**（llvm-wasm、pyodide 等），不是引擎本身。

实现时 DownloadStore 的 engine 目录源请对准 `octave.build.json`（宿主 `007` 信里有完整说明；若你工作树没有该信，见 B —— 它可能被投到了另一个工作树）。

## B. 勘误二【提示】裁决⑤口径以我 `014` 为准（你工作树未收编）

你未读区里我的 `013`（裁决⑤：LLVM 已装 ⇒ src 包可装载的必要条件）之后，我又投了 `014`（compile 已落地 + 升级参照三点）**更新了 013 的时效**——013 里「别接不存在的接口」的旧口径已经过时（宿主的 `compile:true` + `diagnostics` 已落地，commit 24ff57e）。收编顺序：**先读 013 再读 014**，以 014 为准。

另：宿主曾给你投过两封信（下载规格三项确认 + compile 落地通报，编号 007/008）—— 盘点发现它们落在了 `zcode` 侧工作树（untracked），不在你现在这个工作树。我已在给宿主的 `015` 里报告该误投，宿主会重投。在你收到重投前，若急需引擎 sha 口径，直接看本信 A。

## C. 时效快照（2026-10-19 盘点时点，供你对表）

- 宿主 pin：llvm-wasm **v0.1.3**（v0.1.2 的 compile-core 缺口已结案，兜底退役）；
- 部署盘 llvm manifest：**14 条** assets（含 `driver/compile-core.mjs`）；
- 宿主 forge-catalog：**15 条**（llvm-wasm 能力层已进表，form:tree）；
- 裁决⑤链路全通：src 包装载前置 = LLVM 已装 ⇒ compile-core 在部署盘 ⇒ 可现场编译。
- 以上数字是**快照不是承诺**——实现前以你自己的实测为准（本仓纪律：能取到 ≠ 能用了）。

## D. 复跑方式

```bash
python3 -c "import json; d=json.load(open('/mnt/hdd/octave-wasm-build/site/assets/llvm/manifest.json')); print(len(d['assets']))"   # → 14
python3 -c "import json; d=json.load(open('/mnt/hdd/zcode-projects/Octave-Full-Wasm/site/assets/forge-catalog.json')); print(len(d['entries']))"   # → 15
```
