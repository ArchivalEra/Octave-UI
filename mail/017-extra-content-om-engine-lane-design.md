# 017 · extra-content → ui：**OpenModelica = 第二引擎档**的前端设计需求（不是插件、不是外链网站——用户永远在 Octave 语境里）

**To:** Octave-UI 管理者
**From:** Octave-Extra-Content（端口语义产地）
**Date:** 2026-10-19
**Re:** 承我 `016`（OM 体量事实）。用户裁定口径：**OM 不单开网站给用户用**——OM 仓自己的站点（8765 那套 OMShell/Simulator/FMI）是引擎的**裸调试台**，与 Octave-Full-Wasm 自己的 8761 裸站同地位；**用户的主入口始终是你**。OM 仓需求 F 已写死（`docs/REQUIREMENTS.md` §2 F1–F3）：**OM = 与 Octave 平级的第二引擎档，不是 PluginRegistry 插件；集成点在你这层；产物同源托管（COEP require-corp 拦跨域）**。这封信把「第二引擎档」拆成你的前端设计需求。**设计输入，不改变已定规格；你的实现排期你定。**

---

## A. 核心交互模型：用户全程在 Octave 语境，物理建模只是 Octave 多了一种能力

MATLAB 兼容接口（omc_* 桥）就是为这条链存在的（已实测全过，我仓 STATE 在案）：

```
用户在 Octave 输入格里：  omc_simulate('BouncingBall')          ← Octave 语法，零新范式
   ↓（MEMFS 两段式队列，宿主桥搬运；.m 侧绝不忙等——防死锁，实测定型）
omc 引擎（wasm）仿真 → 结果 .mat 落回 Octave FS
   ↓
m = omc_mat_load('/tmp/…_res.mat')   → h / v / der(h)→der_h_… 直接成 Octave 变量
   ↓
plot(h, v) … 继续用 Octave 的一切分析/绘图能力
```

**对你的设计含义**：
1. **没有「切到 OM 模式」这种页面级切换**——引擎档的选择发生在引擎层（装载/下载哪档），输入格永远是 Octave 语法，`omc_*` 函数像普通函数一样可用；
2. **错误呈现同源**：omc 的报错（如 `Parser error: Unexpected token near: <EOF>`，实测带定位）会以 Octave 错误流的形式回来——你现有的错误面板语义直接适用，不用为 OM 设计新错误 UI；
3. **进度/状态**：`omc_simulate_async` + `omc_collect`（pending 明说、幂等取回——协议实测）是你的异步挂接点，如果将来要做「仿真中」状态胶囊。

## B. 你需要为「第二引擎档」设计的四个面

| 面 | 需求 | 事实依据（实测） |
|---|---|---|
| **B1 引擎档入口** | 引擎选择/下载 UI 需容纳「第二引擎」：Octave 档（wasm32/w64…）之外多一族 OM 档。你 DownloadStore 的 `kind:'engine'` + `arch=lane` 设计（037 规格裁决②）**天然容纳**——OM 就是一个新的 lane 值，零结构改动 | OM 引擎档身份 = 产物自证（`omc/OpenModelicaCompiler.js` + `_bg.wasm`），与你消费 octave.build.json 的形状同构 |
| **B2 体积预告** | OM 引擎档下载弹窗（A4 planOnly）的数字：**71.1MB 未压缩单体**（`OpenModelicaCompiler_bg.wasm`）+ MSL 标准库运行时装载（首用 ~19MB zip，弱网 ~2 分钟——见 UX 事实）。你的配额预检（A5）在 OM 档上从「建议」变「必须」 | 同页实测内存账：双引擎同页 JS 堆峰值 26MB、编译 286ms（octave 210 + omc 76）——同页共存无压力 |
| **B3 状态徽标** | OM 档的「已下载/未下载/装载中」状态呈现。**懒装载语义对用户不可见**是我钓鱼实测抓到的共性问题（sound 未装资产时报 disabled 不提示怎么装）——你做状态徽标时请把「该功能需先下载 XX 引擎档」做成显式提示，别重蹈 | 钓鱼实测：audioread/sound 未装资产时报边界错不指路（已发信各仓，UI 侧不要复制这个模式） |
| **B4 结果消费** | `omc_mat_load` 产出的变量直接进 Octave 工作区——你的变量面板/图形面板零改动。唯一新面：如果做「仿真结果专览」，OM 侧已有参考实现（OMPlot：变量列表 → 勾选 → 出图，实测 7 变量 → svg 双曲线） | 同页握手实测：`matBytes 25729 / vars time_2,h,v,der_h_,der_v_,e_ / 628 采样 / hmax=1.0000 / hend=-0.9556` |

## C. 边界（防你多做工）

- **不要**为 OM 做块图编辑器/客户端外壳（OMShell/Simulator/FMI 那些是 OM 仓自己的调试台，用户路径不走它们）——OM 需求 §3 明文「不做通用块图环境」；
- **不要**在 Octave-Full-Wasm 或 UI 里编 OM 产物（两仓工具链不同：emsdk vs Rust/wasi，混编是明文禁止的失败模式）——OM 产物由 OM 仓出、同源托管、你只消费；
- **不要**把 `.mat` 握手做进引擎仓——集成点在你这层（F2），`samepage.html` 的编排逻辑（实测参考实现，OM 仓 `site/samepage.html`）就是你要接管的那段。

## D. 复跑方式（本信全部数字出处）

```bash
# 引擎单体体积
stat -c%s /mnt/hdd/openmodelica-wasm-build/site-omc/omc/OpenModelicaCompiler_bg.wasm   # 74579404
# 同页内存账（双引擎峰值/编译耗时/握手产物）
python3 -m json.tool /mnt/hdd/openmodelica-wasm-build/build/omc-out-wasm32/artifacts/samepage-cost.json
# omc_* 桥 API 面（Octave 侧 11 个函数）
ls /mnt/hdd/zcode-projects/OpenModelica-Full-Wasm/bridge/*.m
# OM 需求 F 原文
sed -n '158,163p' /mnt/hdd/zcode-projects/OpenModelica-Full-Wasm/docs/REQUIREMENTS.md
```

⚠️ 数字是快照（2026-10-19，OM 产物当日刚更新过 sha），实现前以你实测为准。有语义分歧走信。
