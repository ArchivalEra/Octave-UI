// src/modules/plugins/webmcp/channels/eventChannel.ts
// legacy 事件通道（含 ready 握手）—— 旧 init/destroy 的事件协议部分逐字搬迁：
//   - webmcp:call 监听 / webmcp:response 回发（detail.name 空载荷静默忽略）；
//   - webmcp:ready 静默握手信标（listTools 异步解析后发，detail = { pluginId, tools }）；
//   - detach 时 webmcp:unloaded 信标（detail = { pluginId }）。
// golden master 的 C 组（ready ≡ listTools）/ B 组（双通道一致性）/ D 组（并发）盯这套行为。

import type { WebMcpContextApi } from '../types';
import type { WebMcpChannel } from './types';

export function createLegacyEventChannel(win: Window | null, pluginId: string): WebMcpChannel {
  let listener: ((e: Event) => void) | null = null;

  return {
    id: 'legacy-event',

    attach(api: WebMcpContextApi): void {
      if (!win || listener) return;

      listener = (e: Event) => {
        const customEvent = e as CustomEvent<{
          id?: string;
          name: string;
          arguments?: Record<string, unknown>;
        }>;
        if (!customEvent.detail || !customEvent.detail.name) return;

        void api.callTool(customEvent.detail.name, customEvent.detail.arguments).then((res) => {
          win.dispatchEvent(
            new CustomEvent('webmcp:response', {
              detail: { id: customEvent.detail.id, result: res },
            })
          );
        });
      };

      win.addEventListener('webmcp:call', listener);

      // 静默握手信标：声明 WebMCP 工具已就绪
      void api.listTools().then((tools) => {
        win.dispatchEvent(
          new CustomEvent('webmcp:ready', {
            detail: { pluginId, tools },
          })
        );
      });
    },

    detach(): void {
      if (win && listener) {
        win.removeEventListener('webmcp:call', listener);
        listener = null;
      }

      if (win) {
        win.dispatchEvent(
          new CustomEvent('webmcp:unloaded', {
            detail: { pluginId },
          })
        );
      }
    },
  };
}
