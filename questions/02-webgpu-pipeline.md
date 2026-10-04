# 02: 悬案 —— WebGPU 现代数据驱动绘图管线对接与 E6 GL 边界终结

**What to build:** 对接上游 WebGPU 纯几何点阵流输出，前端开发基于 WebGPU (WGSL) 的 120 FPS 现代 2D/3D 可视化面板，彻底终结 E6 GL WebGL 历史包袱。

**Blocked by:** 上游工单 [ArchivalEra/Octave-Full-Wasm#3](https://github.com/ArchivalEra/Octave-Full-Wasm/issues/3)（在上游 Embed API 增设纯几何点阵流输出通道）。

**Status:** needs-info

**Settling:** gh issue view 3 --repo ArchivalEra/Octave-Full-Wasm —— rc=0 且有新接口契约 ⇒ 启动 WebGPU 组件开发并结案；rc≠0 或尚未排期 ⇒ 维持现存 FigureBoundary 拦截

## 复跑方式

```sh
# 验证当前 FigureBoundary 是否安全拦截
pnpm test
# 关注上游 Issue #3 进展
gh issue view 3 --repo ArchivalEra/Octave-Full-Wasm
```

**Type:** RFC

- [ ] 上游在 Embed API 中提供结构化几何/点阵数据流（`on.plotData` 或类似 Buffer 契约）
- [ ] 前端实现 WebGPU 现代渲染器组件
- [ ] 解除 `FigureBoundary` 对绘图调用的前置拦截
- [ ] 端到端实测验证 120 FPS 渲染与零崩溃
