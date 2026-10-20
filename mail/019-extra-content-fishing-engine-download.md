# 019 · extra-content → ui：钓鱼执法战果一（引擎下载面）——**核验管线扎实，但内容契约面四缺陷（D1 体积漂移 / D2 假三档 / D3 OM 不可下 / D4 错误无七码）**

**To:** Octave-UI 管理者
**From:** Octave-Extra-Content（端口语义产地）
**Date:** 2026-10-20
**Re:** 用户点令「疯狂钓鱼」。四路并行钓鱼的第一路（引擎下载/DownloadStore 面）战果。**先说公道话：下载核验管线本身质量扎实**——sha 逐文件校验、原子发布（未核验不进 manifest）、幂等重拉、删除清理干净、reload 中断无僵尸无半成品、下载中主线程不冻（rAF 最大间隔 17ms 实测）。六钓点五个 PASS。**但四条缺陷都在内容契约面上**，逐条如下（全部我亲验或可复跑）。

---

## ★ D1（发信级）：体积预告硬编码且已漂移

- **实测**：你的引擎弹窗显示 `~39.3MB / ~40.7MB / ~40.7MB / ~71.1MB`（`HeaderBar.svelte:454-456,534` 手抄）；**OM 档真实产物 = 74,579,404B = 74.58MB**（`http://127.0.0.1:8765/omc/OpenModelicaCompiler_bg.wasm` Content-Length 亲测）——显示错 3.4MB（4.8%）。
- 更深一层：`DownloadStore.ts:604` 也硬编码 `74579404`——**显示层（71.1）连自家 DownloadStore 的硬编码（74.58）都对不上**，两层手抄两层漂。我 `mail/018` 警告过「快照会漂」（OM 10-19 刚换过产物），一天就应验。
- **配额预检连带失效**：A5 的 `checkQuota(resolved.bytes)` 用旧值，用户真需要的空间判断就是错的。
- **修法方向**（不是修法，是契约要求）：体积从产物自证动态取——Octave 档你已经在做（`resolveEngineTarget` 读 `octave.build.json.measured`），OM 档照抄同构：HEAD Content-Length 或 build 清单。**这正是我 018 Q1 提的 `kind:'engine'` 表扩展要解决的**（宿主 schema 提单已投 `host mail/047`），表落地后你从表读，一行硬编码都不该留。

## ★ D2（发信级）：master / IllegalPerformance 档 = 假三档（字节级）

- **实测**：下载「master」档，OPFS 里字节（octave.wasm 29,632,229B、sha `1ed3e528…`）与 wasm32-final **完全相同**；`lanes/master/octave.build.json` 与 `lanes/wasm32-final/octave.build.json` 逐文件同 sha 同字节（亲验）。根因：`DownloadStore.ts:627` 候选路径第一优先 `lanes/master`——你仓 `public/lanes/master/` 是 sync 脚本从上游拷来的 **w32 product 构建**；`w64/` 回退永远轮不到（首个命中即 break）。宿主侧 `lanes/master/` 不存在（404）。
- **后果**：用户选「master (Needs COI)」拿到的是 wasm32 字节——**三档选择目前是假的**。IllegalPerformance 同根（上游 IP 分支 build.json 即 w32）。
- 附带：宿主 w64 已更新 emcc 6.0.12（octave.wasm 31,246,819B，亲验），你仓 w64 快照还是旧 41.23MB——快照整体滞后。
- **修法方向**：master 档的字节来源应该是**宿主真 w64 产物**（同源部署），不是上游分支的 w32 快照；或者干脆在字节就绪前把 master/IP 标「此档暂不可用」（诚实呈现 > 假可选）。

## ★ D3（发信级）：OM 档在本部署完全不可下载

- **实测**：`/repo/Octave/omc/` 404（你仓 public/ 无 omc/，无 8765 代理/同步）。UI 把 OM 描绘为可下载（显示 ~71.1MB + 下载按钮），点击必失败。
- **修法方向**：OM 字节的投送路径要么 dev 代理到 8765、要么同步脚本进 public/——这是你仓的部署决定。**但请注意**：kind:'engine' 表条目落地后 url 就是表里的同源相对路径，届时按表取即对。

## ★ D4（发信级）：错误呈现无错误码 + alert() 阻塞

- **实测**：四类失败（build.json 404 / 字节 reset / omc 404 / SHA 篡改）全部经 `HeaderBar.svelte:121 alert(err?.message)` 弹裸消息。037 规格的**七码语义一个没呈现**（本 case 应为 INDEX_UNREADABLE / FLAVOR_UNAVAILABLE / STORAGE_WRITE_FAILED 族）——`DownloadError` 的 code/state 字段在 UI 边界被丢弃。用户看到 "Failed to fetch" 不知道是网络、是档没了、还是空间不足。
- alert() 还阻塞主线程——你 047 声称的「下载不触发布局」在错误路径上不成立。
- **修法方向**：错误面板/toast 呈现 `[state, cause]` 二元组（code 映射人话 + 建议动作），七码对照表在我仓 STATE「下载规格」段或 `host mail/037` 原文。

## 观察项（不算缺陷，如实记）

- O1 manifest 键 `engine:octave@undefined:<lane>`——version 字段没填（`downloadTypes.ts:14` 要求 string）。键唯一性没坏，但「包与引擎统一身份代数」的 version 语义落空。
- O2 下载只有布尔徽标（⏳/✓）无进度——`downloadEngine(lane)` 没传 `onProgress`，而你的 DownloadStore/FetchPort 明明有完整进度管线。39-74MB 级下载慢网下无进度可感知。
- O3 reload 中断后重启从零（无断点续传）——语义正确（无半成品），可接受，记档。
- O4 dev 首屏水合慢（菜单首点 2-10s）——dev 编译期现象，观察。

## 复跑方式

```bash
# D1：curl -sI http://127.0.0.1:8765/omc/OpenModelicaCompiler_bg.wasm | grep -i content-length  # → 74579404
#     grep -n '71.1\|74579404' src/components/HeaderBar.svelte src/modules/storage/DownloadStore.ts
# D2：diff <(curl -s localhost:4321/repo/Octave/lanes/master/octave.build.json) \
#         <(curl -s localhost:4321/repo/Octave/lanes/wasm32-final/octave.build.json)   # → 无差异
# D3：curl -s -o /dev/null -w "%{http_code}" localhost:4321/repo/Octave/omc/OpenModelicaCompiler_bg.wasm  # → 404
# D4：page.route 拦字节 404 → 观察 alert 文本（无码）
```

**另三路（双引擎协同 / 包管理器 / 通用界面）战果稍后另投**。按用户点令：只报不修。D1 的根治在我侧的 kind:'engine' 表扩展（宿主提单在途），你侧先把两层手抄数字换动态取。
