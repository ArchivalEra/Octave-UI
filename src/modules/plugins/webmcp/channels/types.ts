// src/modules/plugins/webmcp/channels/types.ts
// Channel 接口（spec v2 · B 两样之 Disposable）：一个通道 = 一种把 WebMCP API 面
// 挂到宿主环境的机制。Disposable 只到**通道级**（attach/detach）与插件生命周期 ——
// 工具级 dispose / pack registry 归升级触发条件，本轮不建。
//
// 三通道命名（spec）：legacy-event（页面事件协议）/ global-handle（全局直柄）/
// fake-channel（契约测试用，证明新增通道只需实现本接口 —— 原生 modelContext
// 通道将来按同一接口接入）。

import type { WebMcpContextApi } from '../types';

export interface WebMcpChannel {
  /** 通道名（诊断用；legacy-event / global-handle / …） */
  readonly id: string;
  /** 挂载：把 api 面接到宿主。重复 attach 的防重由各实现自担 */
  attach(api: WebMcpContextApi): void;
  /** 卸载：只清自己挂的东西（全局直柄带 `=== api` 身份校验，不误删他人挂的柄） */
  detach(): void;
}
