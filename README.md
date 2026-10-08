# Octave-UI

GNU Octave 11.3.0 WebAssembly (memory64 + pthreads) 网页端用户界面与交互前端。

> 💡 **开发者 / AI 开工指引**：请先阅读 [maintaince.md](maintaince.md) 了解项目地图与开发方向。

## 核心特性与架构原则

- **100% 纯客户端计算**：无任何后端计算服务，所有算力由浏览器端 WebAssembly 本地提供。
- **纯静态 gzip 交付**：产物为纯静态资源与 pre-compressed `.gz` 文件，直接适配 CDN/EdgeOne 的 `gzip_static on;` 静态托管。
- **上游绝对只读**：`ArchivalEra/Octave-Full-Wasm` 引擎仓库保持绝对只读，交互严格经由 14/14 Embed API 契约进行。
- **深模块架构**：`EngineSession`（FIFO 互斥队列与渲染让帧）、`TerminalController`（零双重回显与 16ms 批量合并）、`FigureBoundary`（E6 GL 防崩安全屏障）。

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
- 闸门自证请运行 `sh gates-selftest.sh`

