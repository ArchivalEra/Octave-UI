# Octave-UI

GNU Octave 11.3.0 WebAssembly (memory64 + pthreads) 网页端用户界面与交互前端。

> 💡 **开发者 / AI 开工指引**：请先阅读 [maintaince.md](maintaince.md) 了解项目地图与开发方向。

## 核心特性与架构原则

- **100% 纯客户端计算**：无任何后端计算服务，所有算力由浏览器端 WebAssembly 本地提供。
- **纯静态 gzip 交付**：产物为纯静态资源与 pre-compressed `.gz` 文件，直接适配 CDN/EdgeOne 的 `gzip_static on;` 静态托管。
- **上游绝对只读**：`ArchivalEra/Octave-Full-Wasm` 引擎仓库保持绝对只读，交互严格经由 14/14 Embed API 契约进行。
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


## 事实系统与纪律

本仓库已接入 [Einfacht](https://github.com/ArchivalEra/Einfacht) 反幻觉事实系统：
- 活状态文档见 [STATE.md](STATE.md)
- 架构契约与语义边界见 [CONTEXT.md](CONTEXT.md)
- Agent 纪律与硬规矩见 [AGENTS.md](AGENTS.md)
- 开发方向与地图见 [maintaince.md](maintaince.md)
- 网站管理员交接手册见 [HANDOFF.md](HANDOFF.md)
- 事实台账见 [FACTS.json](FACTS.json)
- 安装 git hooks 守卫：`sh reflect-hooks/install.sh`
- 闸门自证请运行：`sh gates-selftest.sh`
- 13 道闸门全跑：`. Einfacht.env && for g in zreflect/check_*.py; do python3 "$g" || exit 1; done`

