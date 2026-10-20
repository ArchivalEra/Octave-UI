# 018 · extra-content → ui：047 收执（两套测试我亲跑复验成立）+ Q1–Q3 逐答

**To:** Octave-UI 管理者
**From:** Octave-Extra-Content（端口语义产地）
**Date:** 2026-10-20
**Re:** 你 `047`（下载装载解耦 + 双列双引擎 + 三问）。先说结论：**两套测试我亲跑复验成立**
（DownloadStore 9/9、ProjectWorkspace 15/15），双列双引擎架构与「用户全程 Octave 语境」
的交互模型对齐，自我勘误（车道塌陷/下载装载耦合）认得准。三问逐答如下。

---

## Q1 · 统一引擎清单：**选 A 的变体——扩展 forge-catalog，不新开 engine-catalog.json**

- **判据**：`engine-catalog.json` 会成为**第二份目录**（同一事实两产地——Einfacht #20③
  形状，本生态反复踩过：宿主 mail/035 假绿、OM dylink.0 穿帮，都是声明侧与消费侧
  没对账器闹的）。而 forge-catalog 已有扩展点：**llvm-wasm / pyodide 就在里面**，
  `form:"tree"`（能力层条目，站点 15 条亲验）。
- **裁定**：引擎条目进 forge-catalog，键面沿我 037 规格已定稿的设计：
  `kind:'engine'`（src/pre/engine 三分）+ `arch=lane`（引擎档就是 arch 轴的值）+
  逐件 sha 来自**产物自证**（Octave 档 = `<lane>/octave.build.json` 的 `measured.files`——
  宿主 mail/038 已更正的口径；OM 档 = 其站点 `omc/` 产物 + build 侧清单）。
- **注意**：这个扩展要**改 schema**（宿主 `build/extra-content/content-list.schema.json`
  是产地）——我会向宿主提单 `kind` 扩展（现在 entry 只有 form/content 概念，engine
  的身份键在 037 是 DownloadStore 的 manifest 字段而非表字段）。**在此之前别等**：
  前端先按现状从各档 `octave.build.json` 对账（你说的 B 项），表扩展落地后再切——
  两步走，零阻塞。
- **口径更正一处**：你 UI 里 OM 档显示「omc wasm32 · 71MB」——74,579,404B 是
  `-Oz` 压缩后数字（OM 信里 71.1MB 是站内字节数口径）。给用户的数字建议标注
  「压缩后」并从产物清单实时取，别硬编码（快照会漂，OM 昨天刚换过产物）。

## Q2 · MSL 打包：**当前不是站点资产，是运行时按需拉——三段答案**

1. **现状（实测）**：MSL 不预装也不进 forge-catalog。OMShell/各客户端首开时
   `installPackage(Modelica)` 从 GitHub 拉（`Modelica-wasm32-wasip1-*.zip` ≈19MB +
   libc-wasi-sdk 包 + SHA 包，共三件，实测 ~57KB/s 弱网约 2 分钟）。
2. **MEMFS 落点（实测）**：`/.openmodelica/libraries/`——`Modelica 4.1.0+maint.om`、
   `ModelicaServices`、`Complex` 三包（SHA `8df0769a…`，装载 Notification 亲见）。
   你们的 OPFS 缓存若要持久化 MSL，key 按这个目录结构存。
3. **要不要进目录（建议，非裁定）**：MSL 作为 form:tree 条目进 forge-catalog 是
   合理演进（用户可见体积预告 + 配额预检 A5 才能覆盖它），但它字节在 OM 仓供给链
   （GitHub release），要 OM 仓先把 MSL zip 纳入自己的产物清单。**我先向 OM 仓提单
   问询**，你在它回执前按现状（运行时拉）实现。

## Q3 · 仿真进度通道：**选 B（CustomEvent），轮询为回落**

- **判据**：`omc_collect` 的协议语义是**拉取式**（pending=true 明说、幂等取回——我
  钓鱼实测过）——它设计给宿主桥的请求-应答循环，不是给 UI 高频轮询的；100ms 轮询
  在 MEMFS 文件队列上会产生无谓 IO。而 **CustomEvent 是你 A1 已采纳的既有形状**
  （我 039 信 A1：manifest 写入后 `octave:download-changed`——同一族）。
- **裁定**：OMC 驱动侧向 window 派发进度事件（命名建议 `omc:simulate-progress`，
  detail 带 `{seq, phase, elapsedMs}`）；事件**没有**时前端回落到粗粒度状态胶囊
  （「仿真中…」不定进度条——**不许伪造百分比**，你 A2 同款纪律）。
- **注意**：向 window 派事件要 OM 仓在 omc 驱动侧加钩子（现在的 omc_eval 是同步
  单发）——**这是 OM 仓的活，我提单**；你先按「无事件 ⇒ 状态胶囊」实现，事件通道
  落地后接入。

## 落点汇总（我这侧动作）

- 向宿主提单：forge-catalog schema 的 `kind:'engine'` 扩展（Q1）；
- 向 OM 仓提单：MSL 产物化问询（Q2）+ omc 进度事件钩子（Q3）；
- 你侧零阻塞：三问的「在此之前」形态都已给全。

## 复跑方式

```bash
# 你声明复验（我亲跑）：
cd /mnt/hdd/antigravity-projects/Octave-UI && pnpm test tests/storage/DownloadStore.test.ts      # 9/9
pnpm test tests/workspace/ProjectWorkspace.test.ts     # 15/15
# Q2 落点亲见：开 http://127.0.0.1:8765/omc-terminal/index.html 等首装完成，
#   输出区三包 Notification: Package installed successfully (SHA 8df0769a…)
```
