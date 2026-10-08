# maintaince.md · 方向与地图

本文件**只指明方向**。测出来的现状由**事实系统本身**承载（`FACTS.json` 台账 + `STATE.md` 末尾的机器块，每提交复跑证真），使用方法由 **README.md** 承载，架构契约与语义边界由 **CONTEXT.md** 承载。

本文件不抄数字、不抄流程 —— 抄了就会漂；工具自己会说话（闸门会明说未启用，改口会要求 `--accept-changes`，测龄会打印在重测输出里），听它们比读本文件的任何细节都可靠。

## 这个项目是什么

GNU Octave 11.3.0 WebAssembly (memory64 + pthreads) 的 100% 纯客户端网页交互界面与开发套件。
- **纯客户端运算**：所有运算完全由浏览器端 WebAssembly 驱动，无任何后端计算服务器；
- **纯静态交付**：最终构建产物仅为纯静态网站资源与 gzip 预压缩包，供 CDN / EdgeOne 直接开启 `gzip_static on;` 托管；
- **上游只读**：依赖的引擎仓库 `ArchivalEra/Octave-Full-Wasm` 绝对只读，仅经由 14/14 Embed API 契约进行交互。

## 地图（真值在哪里）

- **现在是什么（活状态）**：[`STATE.md`](STATE.md) —— 正文是活状态，末尾机器块由 `zreflect/facts.py --render-doc` 渲染，每提交重算。
- **架构契约与语义边界**：[`CONTEXT.md`](CONTEXT.md) —— 14/14 Embed API 接口规范、四项语义边界、纯静态交付原则、禁止向外写入目录锁。
- **给 agent 的硬规矩**：[`AGENTS.md`](AGENTS.md) —— 七条纪律、硬坑（反向断言、只认实测、数字单源）。
- **怎么用（入口与指令）**：[`README.md`](README.md) —— 启动开发、静态打包、运行测试与 E2E 验证。
- **网站管理员交接手册**：[`HANDOFF.md`](HANDOFF.md) —— 纯静态运维要求（COOP/COEP、Gzip、Range 分块）、指令手册与故障应急预案。
- **测量与闸门**：[`zreflect/`](zreflect/)（台账、事实、各闸门、开工预检 doctor、闸门平台 gate）。
- **git 钩子**：[`reflect-hooks/`](reflect-hooks/)（pre-commit / pre-push 与 `Einfacht.env` 载体插件）。
- **悬案与演进**：[`questions/`](questions/)（每条记录一个带结案实验的未决议题）。

## 开发方向（Future Directions）

### 1. WebGPU 现代数据驱动绘图管线（高优先级）
- **背景与痛点**：目前上游已知存在 E6 GL 边界（OpenGL ES 经 GL4ES 桥接 WebGL 在嵌入环境下存在纹理与上下文崩溃），v1 UI 前置拦截了画图调用。
- **已立工单**：已在上游提单 [`ArchivalEra/Octave-Full-Wasm#3`](https://github.com/ArchivalEra/Octave-Full-Wasm/issues/3)。
- **落地方向**：推动上游 Embed API 增设纯几何点阵流输出（`Float32Array` 点阵与网格 Buffer），由前端采用 WebGPU (WGSL) 开发 120 FPS 现代 2D/3D 可视化面板，从根本上甩掉 WebGL 历史包袱。

### 2. WebGPU 客户端矩阵计算加速探索
- 探索利用 WebGPU WGSL Compute Shaders 配合 WebAssembly 共享显存进行大规模线性代数与矩阵运算加速。

### 3. 虚拟文件系统持久化与本地目录接入（已落地）
- 已全面接入浏览器原生 File System Access API（`showDirectoryPicker`）与全平台（移动端/Firefox/Safari）文件降级，实现用户本地磁盘工程目录的即时挂载、`.m` 脚本双向读写与自由重新选择。

### 4. 极端大输出流的 WebGPU 终端文本渲染
- 保持当前 Svelte 5 批量合并渲染为主；持续跟踪 `@xterm/addon-webgpu` 社区进展，预留 WebGPU 终端加速插件插槽。

### 5. 解释器报错语言确定性与本地化
- **已立工单**：已在上游提单 [`ArchivalEra/Octave-Full-Wasm#4`](https://github.com/ArchivalEra/Octave-Full-Wasm/issues/4)（建议固化纯英文或通过 `OctaveEmbed.create({ locale })` 提供 gettext 本地化）。

## 开工与提交的顺序

1. **开工前**：
   - 检查端口与环境：`python3 zreflect/doctor.py`
2. **改完代码**：
   - 运行单元测试：`pnpm test`
   - 运行 E2E 验证：`pnpm test:e2e`（需先启动预览服务）
3. **提交前（本地守卫）**：
   - `sh gates-selftest.sh`
   - `python3 zreflect/facts.py --render-doc STATE.md`
   - `for g in zreflect/check_*.py; do python3 "$g" || exit 1; done`
   - （安装了 `sh reflect-hooks/install.sh` 后由 pre-commit 自动执行）
