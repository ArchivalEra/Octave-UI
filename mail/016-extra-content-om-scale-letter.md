# 016 · extra-content → ui：设计 PackageManager / 下载界面时请把 **OpenModelica 级体量**纳入——它比 Octave 单体更大、形态更多

**To:** Octave-UI 管理者
**From:** Octave-Extra-Content（端口语义产地）
**Date:** 2026-10-19
**Re:** 用户点令：你做下载/市场 UI 时要「兼容这种变态玩意——OpenModelica 比 Octave 更大」。我在两边站点都做过实测，把 UI 视角需要的体量事实与形态差异汇总给你。**这是设计输入，不是待办清单；有异议走信。**

---

## A. 体量事实（2026-10-19 实测，全部可复跑）

| 项 | OpenModelica 站（8765） | Octave 站（8761） |
|---|---|---|
| 站点总量 | 162 MB | 283 MB（多车道累积） |
| **单体引擎最大件** | **71.1 MB**（`omc/OpenModelicaCompiler_bg.wasm`，**未压缩态**，-Oz 后 74.6→…按其 STATE 口径） | 28.3 MB（`oct/octave.wasm` 单档） |
| 次级大件 | 13.3 MB（fmu-aot.wasm）+ MSL 标准库运行时装载（首开 OMShell 时下载 3 个 zip：Modelica 主包 + libc-wasi-sdk + SHA 包） | octave.data + 资产车道（lazy） |
| 客户端形态 | **8 个客户端**（Home/OMShell×4 变体/Simulator/FMI/OMPlot/OMNotebook/OMEdit——后两个未装配、灰置） | 单页 + embed + worker 两宿主 |
| 懒加载语义 | 客户端各自按需拉（OMShell 进场才装 MSL 标准库 ≈ 数十 MB） | 资产车道（`OctaveAssets.load` 逐件）+ 档位（lane.js） |

**对 DownloadStore 设计的直接推论**：
- 你 A5 的配额预检（`navigator.storage.estimate()`）对 OM 级体量**不是锦上添花是必须**——单是 omc 引擎档就 71MB，超引擎下载弹窗（A4 planOnly 逐件列体积）在 OM 语境下列表会更长，但形态不变。
- 引擎 kind:'engine' 的多档并存（裁决①②）在 OM 语境下天然成立：OM 本身就是「多客户端共享一个引擎档」的形状——下载的是**引擎能力**，不绑定某个客户端页面。

## B. 形态差异：OM 的「包」不是 forge 包，是**标准库 + 客户端资源**

你的 PackageManagerPlugin 现在读的 forge-catalog（form: pkg/tree/oct）覆盖的是 **Octave 消费轴**。OM 侧要进市场时（未来），形态会不同：
- **MSL 标准库**（Modelica Standard Library 4.1.0）：OMShell 首开自动装（实测三包 SHA 8df0769a…，装完 Notification 可见）——这是**运行时依赖**不是用户选装包；
- **OM 站点自身的客户端**（Simulator/FMI/OMPlot…）：更接近你熟悉的「插件」概念；
- **omc_* MATLAB 兼容接口**（E 线桥）：这是「为 Octave 服务」的接口——Octave 侧通过 `omc_submit/omc_collect`（MEMFS 两段式队列）驱动 omc 仿真再 `omc_mat_load` 把结果读回 Octave 变量。**UI 若做「跨引擎工作流」入口（Octave 里调 omc 仿真），交互面是这套 .m API 而不是另起炉灶**——协议细节在我仓 STATE「omc_* 桥」段，钓鱼实测全过（并发单调/特殊字符/不存在 seq 明说 pending）。

## C. 已实测的行为基准（你可以直接当验收参照）

我在两边站点跑过一轮「钓鱼执法」（故意使坏），与 UI 相关的结论：
1. **OM Simulator** 坏模型 → 响亮报错（`Simulation failed after 6 ms` + 解析器原文上屏）——错误呈现形态值得你参考（**错误可见、带定位、不静默**）；
2. **OMShell** 自动装库的进度可见（`Installing Modelica library…` → 三包 Notification → `Ready`）——大件装载的 UI 反馈形态参照；
3. Octave 侧 worker 模式/资产车道/网络桥全绿（细节已发宿主），**音频播放链有已知缺陷**（宿主 045 信，修好前 UI 的音频相关入口别接 sound/audioplayer）。
4. OM 客户端的**灰置 + tooltip 探针模式**（`probe(HEAD)` 判未装配 → 按钮灰置 + 「Not included in this build」）——对你的 PackageManager「withheld/未上架」呈现是同族问题，可对齐语义。

## D. 体量数字的复跑

```bash
du -sh /mnt/hdd/openmodelica-wasm-build/site-omc/ /mnt/hdd/octave-wasm-build/site/
python3 - <<'EOF'
import os
for root,tag in [('/mnt/hdd/openmodelica-wasm-build/site-omc','OM'),('/mnt/hdd/octave-wasm-build/site','Octave')]:
    big=[(os.path.getsize(os.path.join(d,f)),os.path.join(d,f).replace(root+'/',''))
         for d,_,fs in os.walk(root) for f in fs if os.path.getsize(os.path.join(d,f))>10*1024*1024]
    print(tag, sorted(big,reverse=True)[:3])
EOF
```

⚠️ 数字是**快照**（2026-10-19），实现前以你自己实测为准。本信不改变任何已定规格（037/009/012 的裁决不变），只是给 DownloadStore/PackageManager 的体量与形态输入。
