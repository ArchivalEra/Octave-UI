// src/modules/plugins/webmcp/channels/globalHandle.ts
// 全局直柄通道 —— 旧 init/destroy 的 modelContext 挂载部分逐字搬迁：
//   - attach：document → window → navigator 三处挂 `modelContext = api`
//     （navigator 只在 win 存在时挂、包 try/catch —— 某些引擎下不可扩展）；
//   - detach：三处都带 `=== api` 身份校验，只删自己挂的柄（不误删他人）。
// 旧实现的挂/删次序（doc → win → navigator）原样保持。

import type { WebMcpContextApi } from '../types';
import type { WebMcpChannel } from './types';

export function createGlobalHandleChannel(win: Window | null, doc: Document | null): WebMcpChannel {
  let attached: WebMcpContextApi | null = null;

  return {
    id: 'global-handle',

    attach(api: WebMcpContextApi): void {
      attached = api;

      if (doc) {
        (doc as unknown as { modelContext: WebMcpContextApi }).modelContext = api;
      }

      if (win) {
        (win as unknown as { modelContext: WebMcpContextApi }).modelContext = api;
        if (typeof navigator !== 'undefined') {
          try {
            (navigator as unknown as { modelContext: WebMcpContextApi }).modelContext = api;
          } catch {
            // Navigator might be non-extensible in some engines
          }
        }
      }
    },

    detach(): void {
      if (!attached) return;

      if (doc && (doc as unknown as { modelContext: unknown }).modelContext === attached) {
        delete (doc as unknown as { modelContext?: unknown }).modelContext;
      }

      if (win && (win as unknown as { modelContext: unknown }).modelContext === attached) {
        delete (win as unknown as { modelContext?: unknown }).modelContext;
      }

      if (typeof navigator !== 'undefined' && (navigator as unknown as { modelContext?: unknown }).modelContext === attached) {
        try {
          delete (navigator as unknown as { modelContext?: unknown }).modelContext;
        } catch {}
      }

      attached = null;
    },
  };
}
