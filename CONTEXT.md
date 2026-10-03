# CONTEXT · Octave-UI 项目上下文与架构边界

## 一、项目定位与边界规则

1. **定位**：GNU Octave WebAssembly 网页端交互界面与用户前端应用。
2. **严格外部依赖只读**：
   - 依赖的引擎仓库为 `ArchivalEra/Octave-Full-Wasm`。
   - **绝对只读**：严禁修改、提交或推送该引擎仓库；如遇引擎缺陷或接口需求，**一律在 `ArchivalEra/Octave-Full-Wasm` 提交 GitHub Issue**。
   - **网站部署侧解耦**：网站管理与部署（`isui.ren`）由部署人/管理员负责（对应 Issue #2），UI 仓不触碰部署与静态机配置。

## 二、领取的工单与唯一耦合面

- **工单**：`ArchivalEra/Octave-Full-Wasm` Issue #1（`UI 开工包：Embed API 全接口实测清单 (14/14 PASS) + 四条必知语义边界`）。
- **唯一耦合面**：`Embed API`（对照 Octave Qt 官方接口映射，不越级触碰 wasm 胶水层）。

### 核心接口契约：
- **启动与就绪**：`const oct = await OctaveEmbed.create();`，`oct.state === 'idle'`
- **执行**：
  - `oct.eval(code)` → `{ok, rc}`（文本输出走 `oct.on.output`）
  - `oct.evalJSON(expr)` → `{ok, value, error}`（结构化值通道）
- **事件订阅**：
  - `oct.on.output(text => ...)`
  - `oct.on.error(msg => ...)`
  - `oct.on.state(state => ...)`（'booting' | 'busy' | 'idle'）
- **工作区与文件系统**：
  - `oct.workspace()` → `[{name, class, size, bytes}, ...]`
  - `oct.pwd()` / `oct.cd(dir)`
  - `oct.fs.ls(dir)` / `oct.fs.read(path)` / `oct.fs.write(path, data)` / `oct.fs.rm(path)` / `oct.fs.download(path)`
- **交互与辅助**：
  - `oct.help(name)`
  - `oct.interrupt()`（安全点中断）
  - `oct.input(text)`（预填 stdin 队列）

## 三、四条必须遵守的语义边界

1. **命令历史 UI 自维护**：embed 模式是非交互会话，`eval` 进的命令不进 Octave 内部 history，UI 的历史面板由 UI store 自行维护 push/重放/检索。
2. **v1 屏蔽画图入口**：embed 页面在现有 wasm GL 纹理线有已知未结边界（E6 GL），v1 UI 不得触发 `drawnow`/`plot`，仅预留面板接口位。
3. **运行状态可观察性**：同步 eval 会占用主线程，UI 的“执行中”加载状态以前端自己的 Promise/await 生命周期为准。
4. **中断为协作式安全点**：`interrupt()` 是到安全点置位，非系统级抢占。

## 四、五条架构与集成原则

1. **单实例多面板**：v1 采用单个 `OctaveEmbed` 实例，终端、工作区表格、文件树、命令历史面板皆为该实例的视图。
2. **按需启动与进度态**：引擎体量较大（wasm 30.9MB + data 9.7MB），绝不随网页无条件自启，须由用户显式点击触发，并展示 booting → idle 进度。
3. **同源 COI 拓扑**：UI 页自身即为 `crossOriginIsolated` 宿主，不使用 iframe 套娃。
4. **适配声明**：在 UI 仓文档中声明所适配的引擎构建版本 sha。
5. **验收标准**：改动可经 `HARNESS=/mnt/hdd/octave-wasm-build/harness sh test/browser/run.sh test/browser/probe-embed-inventory.mjs <URL>` 运行验收。
