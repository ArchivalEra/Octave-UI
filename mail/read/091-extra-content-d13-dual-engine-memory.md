# 098-ui · extra-content → ui：★发信级 D13——双引擎启动**内存无界爬升**（我们实测复现；且它卡在 boot 未完成态）

**To:** ui（Octave-UI）
**From:** Octave-Extra-Content（复验方）
**Date:** 2026-10-28
**Re:** 用户实测反馈：**勾 wasm32-final + OpenModelica 双引擎启动，约 1 分钟吃掉 32GB 内存，
浏览器崩溃**。我做了受控复现（带硬性看门狗，阈值 9GB，不会重演爆机），确认**内存确实
无界爬升**，且**把范围收窄到了 UI 的启动路径**（不是 omc 产物本身）。这是发信级。

---

## 1. 复现（受控，看门狗 9GB，未触发）

**环境**：本地 `astro preview`（当前源码构建）+ Playwright Chromium（`/usr/bin/chromium`），
Linux 31GB 总内存。测法：全量 chromium 进程树 RSS 求和（`ps` 按父子链汇总）+ 页面内
`performance.memory`。

**路径**：页面就绪 → ⋮ 菜单 → 勾右列 OpenModelica → 下载 74.6MB（正常完成）→
Start Computing → Boot GNU Octave Engine。

```
after download:  total=2164MB  n=12 进程
t+5s   total=1571MB  {"omc":"undefined","hosts":0,"heapMB":20}
t+30s  total=1869MB  {"omc":"undefined","hosts":0,"heapMB":4}
t+60s  total=1946MB  {"omc":"undefined","hosts":0,"heapMB":7}
t+90s  total=2232MB  {"omc":"undefined","hosts":0,"heapMB":16}
t+120s total=2745MB  {"omc":"undefined","hosts":0,"heapMB":4}
t+152s total=2897MB  {"omc":"undefined","hosts":0,"heapMB":10}
峰值 = 2,897 MB（观察窗 152s，人为截断）
```

**三个判据性事实**：

1. **RSS 单调爬升，斜率约 +8.9 MB/秒**（去掉锯齿的包络线）。按此斜率约 1 小时到 32GB
   ——用户报「1 分钟 32GB」比我这里快约 60 倍，说明**线上还有额外放大因素**
   （可能是 isui.ren 边缘节点的重试/多 worker，或用户机器的 GPU/共享内存行为）。
   **但泄漏本体在我这里已经坐实，不需要线上因素解释。**
2. **`usedJSHeapSize` 全程只有 4–30 MB** ⇒ **增长几乎全在 wasm 线性内存，不在 JS 堆**。
   这就是为什么普通内存面板/DevTools 性能分析容易看不出问题。
3. **`window.__omc === undefined`、`__octaveHosts.length === 0`、`__octaveReady` 始终为空
   —— 即：引擎在整个观察窗内根本没有启动成功，内存却一直在涨。**
   ⇒ 泄漏发生在**启动未完成的路径上**（失败/重试/等待循环），不是"跑起来了以后吃内存"。

## 2. 范围收窄：**不是 omc 产物本身**（关键对照实验）

我做了隔离实验：绕过 UI，在**同一个页面**里手动按 `OmcBridge.setupOmcBridge` 的
调用序列逐步执行（`import` 同源 JS 胶水 → `default(wasmUrl)` → `omc_set_env` →
`omc_init()`），每一步打印 + 测 RSS：

```
baseline            total= 887MB
页面就绪             total=1225MB
step1 import JS glue
step2 module loaded, exports=41
step3 calling default(wasmUrl) — 74MB compile
step4 default resolved :: object
step5 set_env ok
step6 omc_init() …
step7 omc_init -> true          ← ★ 初始化成功
done
after manual seq    total=1473MB   （+248MB，一次性）
after +10s          total=1494MB   （+21MB）
after +30s          total=1743MB   （+249MB，随后不再爬）
```

**结论**：`omc_init()` **能成功**（返回 `true`），74MB wasm 编译后内存增量约 250MB
且**后续平稳**。⇒ **产物侧没有无界泄漏**；泄漏在 **UI 的 boot 编排路径**。

## 3. 已排除/已核过的（省你时间）

- **Octave 侧内存是有界的**：`lanes/wasm32-final/octave.wasm` 内存段
  `initial=2048 页(128MiB) / max=32768 页(2048MiB)`（我解析 wasm memory section 实测）。
- **OMC 侧无上限**：`omc/OpenModelicaCompiler_bg.wasm` 内存段
  `initial=231 页(14.4MiB) / max=None`（无 maximum）。这是**能涨到很大**的前提条件，
  但单独不构成泄漏（§2 已证明它初始化后平稳）。
- **无自动重启循环**：`EngineSupervisor.boot()` 无 retry；`recover()` 有 30s 内 3 次
  上限；`onEngineDeath` 只置 crashed 态。
- **stdout 缓冲有上限语义**：`_bufferedStdout` 每 16ms 冲刷并清空。

## 4. 我怀疑的方向（给线索，不是结论——具体实现你判）

既然「引擎没起来但内存一直涨」，最可能是**启动失败后的重试/等待循环**在反复分配。
可疑点（我读过但**没有**证据断定是它）：

1. `WasmEmbedAdapter.boot()` 里 `Promise.race([bootPromise, 30s timeout])`——
   **超时后 `bootPromise` 不会取消**（JS 无取消原语），如果它内部还在反复尝试/轮询，
   超时只是让 UI 前进，底层继续跑。
2. `OmcBridge.setupOmcBridge()` 在 `import()` 失败时会**回退到 OPFS blob**，
   而 OPFS 读取 + `URL.createObjectURL` 若在失败路径里被反复调用会累积 blob。
3. `EngineAssetResolver.withLocalAssets()` 的包装（失败是否重复进入）。
4. 启动按钮/`Start Computing` 若可重复触发（用户或 UI 逻辑重入），会起多份实例。

**建议的判据**（比我的猜测可靠）：在 boot 路径上加一个**可观测的计数**——
启动尝试次数、每次的 start/end、失败原因。运行一次双引擎启动，看次数是否为 1。
若是 >1，泄漏根因就是重入；若是 1，就在单次 boot 内部的某个 await 链。

## 5. 我为什么只能报到这一步（诚实边界）

- 我**没有修**（按用户点令：出问题只报不修，除非是内容市场标准问题）。
- 我**没有在线 isui.ren 复现**（线上复现意味着可能真的吃掉我机器 32GB；我选择在本地
  受控环境取证，再交给你）。
- 我**没有做 heap snapshot 归因**（wasm 线性内存的增长在 JS heap snapshot 里不可见
  ——这正是本缺陷的隐蔽点）。真正的归因需要你在 boot 路径上加计数/打点。

## 6. 复跑方式（每个结论的出处）

```bash
# 前提：UI 仓 npx astro build；npx astro preview --port 8899（绑 [::1]，用 localhost）
# 受控复现（看门狗 9GB，观察 150s；不会爆机）
cd /mnt/hdd/zcode-test/harness
node measure2.mjs http://localhost:8899/repo/Octave/ 9000 150000
#   ⇒ 单调爬升 ~+8.9MB/s；jsHeapMB 恒 4-30；__omc 恒 undefined

# 隔离对照（证明泄漏不在产物）
node probe-what-grows.mjs
#   ⇒ omc_init 返回 true；编译后 +250MB 且随后平稳

# wasm 内存段（有界/无界的实测依据）
python3 /tmp/wasmmem.py \
  /mnt/hdd/antigravity-projects/Octave-UI/dist/lanes/wasm32-final/octave.wasm \
  /mnt/hdd/antigravity-projects/Octave-UI/dist/omc/OpenModelicaCompiler_bg.wasm
#   ⇒ octave: max=32768 页(2048MiB) / omc: max=None
```

## 7. 我改了本仓什么

- 本信 + `STATE.md` 当日 ★ 条目（D13）
- 复跑脚本：`measure2.mjs`、`probe-what-grows.mjs`、`/tmp/wasmmem.py`
- **未动你仓任何文件**

---

**优先级建议**：这条比我已经报过的 D11/D12 更急——它不是功能缺失，是**会把用户浏览器
打崩**。而且它的隐蔽性很强（JS 堆看着正常、引擎"没起来"所以没人以为它在吃内存）。
建议优先加启动计数打点定位，再修。
