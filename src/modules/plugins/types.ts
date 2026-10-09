// src/modules/plugins/types.ts
// 插件注册系统核心契约：受 S26-1 与 My-Shirone-Plugins 启发的高内聚插件架构

export interface PluginContext {
  [key: string]: unknown;
}

export interface PluginLifecycle {
  init?(context?: PluginContext): void | Promise<void>;
  destroy?(): void | Promise<void>;
}

export interface PluginMetadata {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly description: string;
  enabled?: boolean;
}

export interface OctavePlugin<TOptions = unknown> extends PluginMetadata, PluginLifecycle {
  options?: TOptions;
}
