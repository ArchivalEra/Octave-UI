// src/modules/plugins/webmcp/callStats.ts
// onCall 内存计数器（spec v2 步骤 3 第 4 项 · 用户故事 11）：每次调用记
// {name, ok, ms, ts} 四元组进环形缓冲，经调试句柄读取。
//
// 三条硬约束（spec B.3 + 验收方 070 复述）：
//   · **不上 wire、不改 get_system_state 输出**——计数器只走调试句柄
//     `window.__webmcp_debug.stats()`；那是已有工具，改它的输出就是 golden 偏差
//     （偏差表没列，也不该列——golden F 组盯住零变化）；
//   · **不记 args**（args 里是用户代码——隐私/体积双重理由），只记四元组；
//   · **默认零行为**：不联网、不改任何工具输出；记录是内存 push + 环形裁剪，
//     对调用路径的成本是一次对象分配（「成本几乎为零」的判据）。
//
// 环形缓冲容量 512（流量分布观测足够；溢出丢最旧——环形语义即此）。

export interface WebMcpCallRecord {
  readonly name: string;
  readonly ok: boolean;
  readonly ms: number;
  readonly ts: number;
}

const RING_CAPACITY = 512;

export class CallStats {
  private _ring: WebMcpCallRecord[] = [];
  private _enabled = true;

  /** 记一次调用（分发机在每次 callTool 终态后调）。args 一律不进记录（文件头约束）。 */
  record(name: string, ok: boolean, ms: number): void {
    if (!this._enabled) return;
    this._ring.push({ name, ok, ms, ts: Date.now() });
    if (this._ring.length > RING_CAPACITY) {
      this._ring.splice(0, this._ring.length - RING_CAPACITY);
    }
  }

  /** 环形快照（浅拷贝——调用方拿到的是副本，改不动内部缓冲） */
  stats(): readonly WebMcpCallRecord[] {
    return [...this._ring];
  }

  /** 观测暂停/恢复（调试用；暂停期间 record 零成本直接返回） */
  set enabled(on: boolean) {
    this._enabled = on;
  }

  get enabled(): boolean {
    return this._enabled;
  }
}

/** 调试句柄的类型面（挂在 window.__webmcp_debug 上——不进任何 wire/工具输出） */
export interface WebMcpDebugHandle {
  stats(): readonly WebMcpCallRecord[];
  setEnabled(on: boolean): void;
}

export function createDebugHandle(stats: CallStats): WebMcpDebugHandle {
  return {
    stats: () => stats.stats(),
    setEnabled: (on: boolean) => {
      stats.enabled = on;
    },
  };
}

/** 把调试句柄挂到宿主 window（幂等：重复挂载覆盖同一名——同插件多实例共用最新句柄） */
export function attachDebugHandle(win: Window | null | undefined, handle: WebMcpDebugHandle): void {
  if (!win || typeof win !== 'object') return;
  (win as unknown as { __webmcp_debug?: WebMcpDebugHandle }).__webmcp_debug = handle;
}

/** 卸载（destroy 时清——仅当挂的还是本句柄才动，避免误删后来者的） */
export function detachDebugHandle(win: Window | null | undefined, handle: WebMcpDebugHandle): void {
  if (!win || typeof win !== 'object') return;
  const slot = (win as unknown as { __webmcp_debug?: WebMcpDebugHandle }).__webmcp_debug;
  if (slot === handle) {
    delete (win as unknown as { __webmcp_debug?: WebMcpDebugHandle }).__webmcp_debug;
  }
}
