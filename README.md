# Octave-UI

GNU Octave 11.3.0 WebAssembly (memory64 + pthreads) 网页端用户界面与交互前端。

> 💡 **开发者 / AI 开工指引**：请先阅读 [maintaince.md](maintaince.md) 了解项目地图与开发方向。

## 核心特性与架构原则

- **100% 纯客户端计算**：无任何后端计算服务，所有算力由浏览器端 WebAssembly 本地提供。
- **纯静态 gzip 交付**：产物为纯静态资源与 pre-compressed `.gz` 文件，直接适配 CDN/EdgeOne 的 `gzip_static on;` 静态托管。
- **上游绝对只读**：`ArchivalEra/Octave-Full-Wasm` 引擎仓库保持绝对只读，交互严格经由 14/14 Embed API 契约进行。
- **双契约分工与跨 Agent 通信**：严格区分引擎契约（`ArchivalEra/Octave-Full-Wasm` ↔ UI，只读 Issue 提单）与内容契约（`ArchivalEra/Octave-Extra-Content` ↔ UI，内容语义归属，通过 `mail/` 通道交流）；机器表由宿主装配至同源站点 `assets/forge-catalog.json`。
- **深模块架构**：`EngineSession`（FIFO 互斥队列与渲染让帧）、`TerminalController`（零双重回显与 16ms 批量合并）、`FigureBoundary`（E6 GL 防崩安全屏障）。
- **OPFS 工业标准持久沙箱工作区**：
  - 核心模型：遵循工业标准「导入 → OPFS 持久工作区 → 导出」模型，摒弃脆弱的用户磁盘实时双向句柄绑定，以 OPFS 作为唯一真源（支持纯内存 `MemoryStore` 自动回落）。
  - 三通道导入：文件夹选择（`webkitdirectory`，同一激活帧同步触发）、文件/目录拖拽（`webkitGetAsEntry` 递归解析）、ZIP 压缩包（`fflate` 纯客户端解包与安全校验）。
  - 双向二进制桥接：与 Octave Wasm MEMFS (`/home/web_user/workspace`) 无感双向同步，保持 `Uint8Array` 二进制透传，防止 `.mat` 矩阵文件被误编码为 UTF-8 损坏。
- **可插拔插件系统与优雅排版/图形外挂**：
  - **插件注册架构**（`PluginRegistry`）：支持插件热插拔、动态启用/禁用、生命周期托管与事件响应。
  - **Pretext 算术排版插件**（`PretextLayoutPlugin`）：对标 S26-1 算术纯排版，零 forced reflow 预测卡片高度，基于贪心最短列分配卡片瀑布流，文本框自动根据代码长度自然伸展无截断，支持不同大小卡片混排。
  - **画廊高精度检索插件**（`GallerySearchPlugin`）：对标 S26-1 优雅检索体验，具备多词中英文拆分、Bigram 索引、实体防破坏安全高亮、`kbd` 快捷键聚焦与键盘上下箭头可视区联动。
  - **P5 运行时图形外挂补丁**（`P5FigureOverlayPlugin`）：参考 S26 外挂补丁设计，纯宿主 JS 运行时拦截，不写 MEMFS 规避引擎 m 树守卫清理、独立于 bridge 目录防范同步覆写；自动为绘图指令补全 `drawnow` 解决 Wasm 无事件循环不 flush 问题，并将原生 WebGL toolkit 渲染的 PNG 高清图安全精准注入单元格卡片，根治 DOM 溢出。
  - **权威图形栈同步与验收**：全面同步上游最新 bridge 修复（`_gfxAbsent` 守卫、`moduleOf` 宿主解析与 `plotbridge` 资产 shim），通过上游浏览器端真实渲染验收套件（14 项断言全绿）。
  - **文档与参数报错自动对齐**（`WasmEmbedAdapter.alignDocstringsPaths`）：启动时自动检测并镜像 MEMFS 中的 `built-in-docstrings` 与 `doc-cache` 至官方安装前缀路径，彻底解决上游 Issue #6 中 `help` 不可用及函数参数误用被误导性报错掩盖的问题。
  - **科学计算示例画廊扩充与体验升级**：全面扩充典型科学计算算法配方（覆盖一阶 RC 暂态、二阶 RLC 欠阻尼衰减、方波奇次谐波合成、奈奎斯特采样混叠、病态希尔伯特条件数、中心极限定理直方图等），各配方均具备中/英/德三语详尽解析与专属矢量图示；示例代码块全面纯净化（不含注释）、Try Example 自动追加新建独立单元格保护现有代码，并深度适配深浅色主题高对比度按钮文字。
  - **包与扩展管理插件**（`PackageManagerPlugin`）：严格遵循与 `Octave-Extra-Content` 的内容契约与接入规范，基于 `PluginRegistry` 挂载；直读同源装配态 `assets/forge-catalog.json` 货架，委托宿主引擎 `statusOf` 与 `install(..., { planOnly: true })` 拿取兼容性与真算下载预算，支持版本候选切换、`form: "tree"` 能力层识别与四态安装，并配有深浅色自适应管理面板 `PackageManagerModal`。
  - **纯下载深模块与 OPFS 资产持久化**（`DownloadStore`）：贯彻 I1-I6 不变量体系（权威来源哈希解析、原子发布与无半包回滚、当日目录哈希防漂移、零 `Module.FS` 纯净依赖、多架构独立隔离与真实存储对账自动降级），采用 7 个封闭错误码（`NOT_DOWNLOADED`、`VERSION_WITHHELD`、`FLAVOR_UNAVAILABLE`、`STORAGE_WRITE_FAILED`、`DOWNLOAD_ABORTED`、`INDEX_UNREADABLE`、`STORAGE_QUOTA_EXHAUSTED`）和 3 语 100% 字典平权守护离线存储；支持 `octave:download-changed` 跨模块事件总线。
  - **包管理双动作与现场编译诊断流**（`PackageManagerModal`）：支持“下载（落盘 OPFS 沙箱）”与“装载/从源码构建（入 Octave 引擎）”双动作彻底解耦；落实裁决⑤前置依赖拦截（含 `src` 的 C++ 源码扩展包强制拦截并提示前置下载 `llvm-wasm` 编译器）；集成展开式实时编译诊断抽屉，输出结构化构建日志流并清晰区分“编译成功 ✓”与“跨边界调用待宿主工单 65 重链”；支持 A4 体量预演分件清单弹窗与 A5 存储配额（`STORAGE_QUOTA_EXHAUSTED`）强校验阻断。
  - **下载与装载解耦与双列多引擎协同架构**：支持将下载（写入 OPFS 沙箱）与装载（载入 WebAssembly 实例）彻底解耦，用户可同时将多档引擎（Octave 三档 + OpenModelica 一档）自由预下载至本地；界面重构为正交双列设计（左列 Octave 三档单选，右列 OpenModelica 独立打勾），两边不干涉，支持一键双引擎同页并发实例化（`Promise.all`）与 MEMFS 桥接，100% 纯客户端静态托管。
  - **引擎离线化与资产解析容错**（`DownloadStore` & `OpfsStore`）：自动探测站点基础路径（`site-base`），实现多车道（`lanes/<lane>/`）与根目录同源部署自动回退对账；`FetchPort` 具备 Content-Type 与 HTML 错误页识别防护；OPFS 扫描层深度适配 Chromium 临时 `.crswap` 文件过滤与瞬态文件竞争防护，确保多引擎二进制离线下载顺畅。
  - **可拖拽多引擎工作台架构**（`DockWorkspace` & `DockLayoutStore`）：
    - 采用深模块 2D 二叉分屏与标签树布局引擎，支持自由标签拖拽停靠（Docking）、独立浮动窗口（Floating Window）及 5 区域精准落点预览（上下左右中），状态透明持久化至 `localStorage`。
    - **OPFS 工业沙箱一级解耦面板**（`OpfsFilesPanel`）：将 OPFS 资源仓解耦为可自由停靠、浮动的独立工作区面板，完整保留目录导入导出、ZIP 解包及与 MEMFS 双向二进制同步能力。
    - **OpenModelica 交互控制台面板**（`OmcShellPanel`）：深度贯彻内容仓 016/017 规范，内置状态感知指示灯、经典物理系统配方演示（如 `BouncingBall`、`ChuaCircuit`）及与 Octave 宿主桥的高性能双向通信通道。
    - **4 套专业布局预设一键切换**：🚀 双引擎全能工作台（Studio）、📓 Octave 专注（Octave Focus）、⚙️ OpenModelica 建模（OMC Focus）、💻 双终端并排（Twin Consoles），支持 "+ 添加面板" 动态装配。
  - **全站 Design Tokens 严格约束与明暗模式自适应**：全面根除历史残留的幽灵 CSS 变量（`--bg-primary`、`--text-primary`、`--border-color` 等）与 `<style>` 块硬编码颜色，所有组件界面颜色均受控于 `src/styles/theme.css` 的语义化 Design Tokens，并配备自动化质量闸门 `check_theme_tokens.py` 阻止任何变量泄漏回归。
  - **三语完整平权国际化（i18n）**：提供英语（`en`）、简体中文（`zh-Hans`）与德语（`de`）全量键位字典对齐（100% 字典平权），全站所有组件模板及交互逻辑彻底移除硬编码中文，由专属质量闸门 `check_i18n.py` 实施静态正则扫描与反向断言防护。
  - **AI / WebMCP 代理原生桥接插件**（`WebMcpPlugin`）：面向未来 AI Agent 操作与 WebMCP 协议，内置开箱即用的 DOM-free 机器控制接口（双层协议暴露于 `document.modelContext` 与 `navigator.modelContext`，并支持标准 `webmcp:ready` 与 `webmcp:call` 事件广播），提供 `octave_eval`、`octave_run_cell`、`octave_get_workspace`、`octave_list_packages`、`octave_install_package` 与 `octave_get_system_state` 等原生高维计算与系统状态工具；全站交互元素配齐 `data-action`、`data-testid` 等机器识别锚点，支持按需卸载（`pluginRegistry.unregister('webmcp')`）。

## 快速上手与命令

```bash
# 启动本地带 COOP/COEP 的预览服务（默认端口 8868）
pnpm preview

# 构建纯静态产物（输出至 ./dist/）
pnpm build

# 生成 gzip -9 预压缩交付包
pnpm compress

# 运行 Vitest 单元测试
pnpm test

# 运行真实浏览器 E2E 交互测试（需先启动 preview）
pnpm test:e2e

# 一键同步上游三车道并生成独立交付包（./wasm32-final, ./master, ./IllegalPerformance）
pnpm build:lanes
```

## 三车道交付矩阵

本仓库支持同步上游三条独立维护车道并生成开箱即用的纯静态交付包（均含 `gzip -9` 预压缩）：
- `./wasm32-final/`：wasm32 冻结归档车道
- `./master/`：稳健 wasm64 车道
- `./IllegalPerformance/`：激进 wasm64 性能先锋车道（带 Rust 排序内核）
- OMC 双引擎资产（`/omc/`，74.5MB wasm）：CI 构建期从 [OpenModelica-Full-Wasm release](https://github.com/ArchivalEra/OpenModelica-Full-Wasm/releases/tag/v0.1.0-wasm32)（public，mail/076 产地裁定）拉取并 sha256 校验（fail-loud）；`.gz` 预压缩对由 deploy-contract verify 断言
- MSL 站内资产（`/assets/msl/msl-4.1.0-maint.om.zip`，19.5MB）：同款 fail-loud 镜像（锚 OM 台账 `msl_asset_sha`）；落位**以宿主 catalog 的 url 字段为权威**（`assets/msl/`，兄弟目录不混入 `omc/`——否则引擎 tree 闭包预算虚胀 ~19.5MB）
- `form:"file"` 单件交付（MSL 形状）：下载层已支持（条目 url+size+sha 三件齐即下单件计划，缺一即响亮拒）；omc 工具族 `omc_load_msl` 已上线（内容仓 093 裁定 A：provision 自然生长，`listTools()` 6→7；能力门三道反向断言钉住）


## 事实系统与纪律

本仓库已接入 [Einfacht](https://github.com/ArchivalEra/Einfacht) 反幻觉事实系统：
- 活状态文档见 [STATE.md](STATE.md)
- 架构契约与语义边界见 [CONTEXT.md](CONTEXT.md)（含领域词汇表：物理对账 / 钓鱼判据 / 见证 / 对账器 / 降级信号）
- Agent 纪律与硬规矩见 [AGENTS.md](AGENTS.md)
- 开发方向与地图见 [maintaince.md](maintaince.md)
- 工具面贡献规矩见 [CONTRIBUTING.md](CONTRIBUTING.md)（剪枝判据「能否被 `eval` 一行表达」+ 加工具的正确形状 + deps 能力门 + wire 面登记）
- 网站管理员交接手册见 [HANDOFF.md](HANDOFF.md)（2026-10-24 起边缘为运行时 gzip + 分层缓存，Range 已撤除）；边缘申请与回执（五项+HTML 短缓存+三杠杆+双前缀修复；产地渠道线 083 全链 PASS 关闭；镜像表 17 packs 含 omc/MSL；form:file 单件交付；omc_load_msl 已上线；WebMCP 三服务在组合根注入（D11 修复）；omc_load_msl 自检走 omc_eval 真实 API 面（D12 修复）+ 版本判据；KNOWN 表定位为离线兜底副本；18 道闸门含 mock 面收敛；D13 断两环：refresh 幂等 + 对账单飞 + addpath 路径指纹；架构审查 6 候选在案，其中 2/3/6 已落地：对账缓存三态化 + 单例不可绕过 + 跨模块频率断言；接口大清洗已落地（删三个平行整类与四个死单例、断链事件、孤儿类型、49 处多余 export，净删约 344 行，9 条静态断言防回潮）；WebMCP spec v2 全量对账完成且 3 处缺口已补（剪枝判据落地为 CONTRIBUTING.md、effects 表内元数据不上 wire、恒等式与删表行反向断言）；双引擎 boot 实测复核：`__omc` 3 秒内就绪（内容仓 102 §二的「恒 undefined」是其探针误把模态标题当按钮，已在信 103 更正，内容仓 104 认错并复测得 1.4s / 真 boot 下 -0.70 MB/s），成功路径回归锁已补，静默早退（`if (!FS) return`）已改为响亮失败（`FLAVOR_UNAVAILABLE`，双引擎降级 Octave-only + toast 语义不变）；「测不到 ≠ 不存在」已立为 AGENTS 纪律 3；市场重写已落地并修完两轮审查（Critical：每包各自的 release 定位）：消费发布契约 schema 3（manifest + 分片 + fzstd/gzip 逐块解压 + 两类 sha 校验），三个深模块 + 生产接线，含 catalogue 死链容忍、编码运行时回退链与两轮审查后的内部加深（DEEPENING）；**全家上 catalogue** 已落地：按「产物名 + sha 双确认」定位（零映射表、零包名猜测，16/17 命中），两个引擎各走一条独立缝（`ReleaseSource` 管包、`EngineReleaseSource` 管 product→N 件原子），fzstd 改为「静态资产 + no-store + 每页唯一 nonce + 整页只拉一次」（绝不进打包图、绝不持久存储），并修掉 w64 车道误命中 wasm32 镜像的真缺陷；移植参考客户端四项机制（`base_proxy` 多 root 回退、`manifest_sha256` 根校验、V1 名字白名单（防 `//host` 劫持）、V5 跨变体块数一致 + V6 单块上限），catalogue 地址改为**候选列表**按序探测（原 `isui.ren/static/` 已 404，迁到 `static.isui.ren` + CF 备线）；按条目体积的 `codecPreference`（大件 zstd、小件 gzip）与并发默认值 2（EO/CF 字节闸）已落地；catalogue 全候选探测失败现在**响亮报错**（回信 103：不许静默回落整包）；「完全不托管任何 release」首次验收已做完（issue #26 / PR #27 / `docs/acceptance/2026-11-05-no-hosted-release.md`）：8 个后台子代理在净化 dist + 真浏览器上钓鱼，裁定 **FAIL** —— 供给服务端、契约定位、插件 WebMCP、fzstd 产品代码四层 PASS，挡住全链路的 BLOCKER 是站侧 `/ArchivalEra/*` release 资产缺 CORS/CORP 响应头（只补两个头、零产品改动即可 `evalJSON('40+2')=42`）；另记本仓 4 处待修缺陷；修复请求已发站侧信 003；A–G 七份子代理证据已收进 `docs/acceptance/evidence/`，code-review 后 #27 降为 PARTIAL（证据副本纪律）；STATE.md 已补 WebMCP/D11-D13、清洗与市场重写活状态；站侧 2026-11-06 回信 104 补齐 EO/CF 两线 CORS/CORP 头后，净化 dist 真浏览器默认线上路径复跑：Octave 三档 boot（38/0）、OMC+MSL 最终解耦版（真 OMC 引擎 24/0）、五插件/WebMCP（41/0）、fzstd（38/0）、下载/装载解耦独立探针（9/0）；期间修掉 w64 assets 清单路径、OPFS inline script 无 src 致 pthread 挂、MSL 装载硬编码站内路径、BrowserAssetsAdapter 覆盖市场目录四处真缺陷，其中 MSL 首次修法误把「下载写 OPFS / 装载入运行时解耦」压成「装载时现场取字节」，已回退为按名字查 DownloadStore 记账 + stat 物理对账 + store.read 的零网络装载（`docs/acceptance/2026-11-06-post-cors-retest.md`）；11-05 FAIL 判定未改判，LLVM 运行期取字节等债仍列在该报告 §5；晚间 code-review 双轴发现真站 `https://isui.ren/repo/Octave/` 编译链实测 FAIL（Forge 货架被拼到 `lanes/wasm32-final/assets/forge-catalog.json` 404），根因是 `WasmEmbedAdapter` 的引擎产物 base 被 `public/bridge/assets-loader.js` 的 `catalog()` 当成站点根 base 复用，已加 `siteRoot()`/`siteLevel` 分离站点级与 lane 级 URL、补 4 条静态防回潮锁与两条真浏览器探针（`BRIDGE_CATALOG: PASS` / `LANE_BASE: PASS`），五个 localhost 判据面的 PASS 不构成真站全链路跑通，详见 `docs/acceptance/2026-11-06-post-cors-retest.md` §7；11-07 深挖发现三条验收/用户/MCP 路径正交的结构根（base 7 产地、forge-catalog 5 条读法、`OctaveAssets` 双实例、`install`/`compileExtension` 两套实现），按 codebase-design 三设计对比落成统一站点资产接缝 spec（`docs/spec/unified-assets-seam.md`）并实现：`engine/deployment.ts` 为 base 唯一产地（缺 meta ⇒ `DEPLOYMENT_UNRESOLVED` 不静默）、bridge `TIERS` 逻辑键注册表 + `resolve()` 唯一拼接点（删 `siteLevel` 布尔与 `siteRoot()` 正则反剥）、`window.OctaveAssets` 改惰性 getter 单实例（删文件级第二构造与 boot 时覆盖）、`BrowserAssetsAdapter` 删 `base?` 构造参数与三层 fallback（catalog 404 ⇒ `CATALOG_UNREADABLE` 响亮，绝不合成目录）、`octaveListPackages` 删吞错 `.catch`（S5 假绿关死）、`sync-lanes.sh` 删 DX3 双源复制、新增 `check_acceptance_no_handbase.py` / `check_asset_tiers.py` / `check_unified_seam.py` 三道闸门（发现式名录自证齐）；图形栈 A/B 取证（`probe-gfx-ab-1106.mjs`）：收口前后逐字同款、`plot(1:3)` 经 plot 桥出正确 PNG（MEMFS 抓图实证），`opengl_texture` 警告是 webgl toolkit 兜底路径的既有行为、非本轮引入；净化盘 `__init_web__.oct` 404 属 `*.oct` 白名单口径、真站 200；`install()`/`compileExtension()` 合并与 MCP 编译能力、真站重部署重跑（S9）仍列 Out of Scope）；11-07 正面证伪「从源码构建没跑通」：当前源码完整管线 build→adapt 产出的 bundle.js 含修复，真浏览器 bundle 页 catalog 站点根 200/17 包、用户点按钮序列 7 PASS/0 FAIL、零站内回退（`docs/acceptance/evidence/bundle-srcbuild-1106.md`）；线上 `bundle.js:1050` 404 是旧源码拼的 bundle，唯一消法站侧重部署，请求信 018 已投；11-07 深度排查（四路并行）钉死「三路同轴/MCP 一步直达」缺口并落地 P0：OPFS 账本加固（saveManifest 改 tmp→swap 原子提交 + init 坏账自愈 corrupt-<ts> 留证 + stat 只标脏不清账读零写入 + 同盘 wiring 锁——暴毙机制即非原子写被断电截断且无恢复路径）、引擎幂等 boot（并发复用拒绝双实例）+ supervisor.ensureBooted（lazy-boot 唯一产地，eval unloaded 态一步直达；booting 入队等 boot 会被 attachAdapter 的 epoch++ 静默丢弃⇒ 永久 pending 的死锁已根除——等待移到入队前）、下载并发去重（同 ref 双发复用单 promise）、quota 门覆盖 bridge install/planOnly（A5 不再被绕，plan 带 quota 字段=UI confirm 的 MCP 等价面）、裁决⑤ LLVM 门经组合根谓词注入覆盖 eval shim 路、名册 7→9（+octave_download_package/octave_compile_package，排查②矩阵空格补齐，DEVIATIONS ④ 登记）；witness 锚点随 _downloadBody 拆分修正（语义不变）见 [SITE-ADMIN-REQUEST.md](SITE-ADMIN-REQUEST.md)
- 跨 Agent 往来信箱见 [mail/README.md](mail/README.md)（与内容仓 Octave-Extra-Content 定稿纯下载模块规格）
- 事实台账见 [FACTS.json](FACTS.json)
- 安装 git hooks 守卫：`sh reflect-hooks/install.sh`
- 闸门自证请运行：`sh gates-selftest.sh`
- 18 道闸门运行：`. reflect-hooks/einfacht-env.sh && python3 zreflect/registry.py --run commit`
- 交付契约：`node scripts/deploy-contract.mjs {base|adapt|verify}`（构建期重写根绝对引用 +
  注入分片 shim + **bridge 12 脚本打包为单 bundle**——边缘挂起幸存率 (1-p)^12 → (1-p)
  + **fetch 守卫**（同源 GET 响应头 10s 超时 + 单次重试——挂起概率 p → p²，浏览器端 AbortController 完好）
  + **modulepreload 注入**（island 水合链 component→renderer→runtime 的串行瀑布打平为并行）
  + **字面量重写只及引擎/桥侧**：_astro 自有代码豁免（其字面量运行期经 resolveUrl 叠 base——构建期再叠=双重前缀=线上 404，081 号信实锤；verify 双向断言钉住）

## WebMCP 网桥

外部 AI agent 经页面事件协议 / 全局直柄（`modelContext`）调用引擎与 UI 能力。
重构后形状（[spec v2](https://github.com/ArchivalEra/Octave-UI/issues)）：工具表 +
纯函数分发机 + deps 能力门（`defineTool` 编译期绑死）+ 三通道 + 偏差表验收
（`src/modules/plugins/webmcp/DEVIATIONS.md`）——旧调用零迁移成本（golden master 盯住）。
调试句柄：`window.__webmcp_debug.stats()`（调用流量四元组环形缓冲，不上 wire）。

## Wayfinder × Einfacht 决策联动

重大整改走 GitHub Issues 上的 [wayfinder 决策图](https://github.com/ArchivalEra/Octave-UI/issues/4)：
每张决策票的 resolution 带 `gate:` 锚点（台账键 replay=False + witness，或
`zreflect/check_wayfinder.py` 形状断言），关票时锚点必须真实在册——「裁定面与实现面」
由闸门对账（详见[联动机制提案 issue #18](https://github.com/ArchivalEra/Octave-UI/issues/18)）。

