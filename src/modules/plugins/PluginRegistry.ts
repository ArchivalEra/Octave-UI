// src/modules/plugins/PluginRegistry.ts
// 插件注册表：统一管理插件生命周期、开关状态与能力发现

import type { OctavePlugin, PluginContext } from './types';

export class PluginRegistry {
  private plugins = new Map<string, OctavePlugin>();
  private initializedPlugins = new Set<string>();
  private changeListeners = new Set<() => void>();

  /**
   * 注册插件。若已存在相同 ID 的插件则抛出错误，杜绝隐式覆盖。
   */
  register<T extends OctavePlugin>(plugin: T): T {
    if (!plugin || !plugin.id || typeof plugin.id !== 'string') {
      throw new Error('[PluginRegistry] Plugin must provide a valid non-empty id string.');
    }
    if (this.plugins.has(plugin.id)) {
      throw new Error(`[PluginRegistry] Plugin with id "${plugin.id}" is already registered.`);
    }

    if (plugin.enabled === undefined) {
      plugin.enabled = true;
    }

    this.plugins.set(plugin.id, plugin);
    this.notify();
    return plugin;
  }

  /**
   * 注销插件并触发生命周期清理。
   */
  async unregister(id: string): Promise<boolean> {
    const plugin = this.plugins.get(id);
    if (!plugin) return false;

    if (this.initializedPlugins.has(id) && plugin.destroy) {
      try {
        await plugin.destroy();
      } catch (err) {
        console.error(`[PluginRegistry] Error destroying plugin "${id}":`, err);
      }
    }

    this.initializedPlugins.delete(id);
    const removed = this.plugins.delete(id);
    if (removed) {
      this.notify();
    }
    return removed;
  }

  get<T extends OctavePlugin = OctavePlugin>(id: string): T | undefined {
    return this.plugins.get(id) as T | undefined;
  }

  has(id: string): boolean {
    return this.plugins.has(id);
  }

  getAll(): OctavePlugin[] {
    return Array.from(this.plugins.values());
  }

  getEnabled(): OctavePlugin[] {
    return this.getAll().filter((p) => p.enabled !== false);
  }

  enable(id: string): void {
    const plugin = this.plugins.get(id);
    if (plugin) {
      plugin.enabled = true;
      this.notify();
    }
  }

  disable(id: string): void {
    const plugin = this.plugins.get(id);
    if (plugin) {
      plugin.enabled = false;
      this.notify();
    }
  }

  isEnabled(id: string): boolean {
    const plugin = this.plugins.get(id);
    return plugin ? plugin.enabled !== false : false;
  }

  /**
   * 初始化所有已启用插件。
   */
  async initAll(context?: PluginContext): Promise<void> {
    const ctx = context || {};
    for (const [id, plugin] of this.plugins.entries()) {
      if (plugin.enabled !== false && !this.initializedPlugins.has(id)) {
        if (plugin.init) {
          try {
            await plugin.init(ctx);
          } catch (err) {
            console.error(`[PluginRegistry] Error initializing plugin "${id}":`, err);
          }
        }
        this.initializedPlugins.add(id);
      }
    }
  }

  /**
   * 销毁并清理所有插件
   */
  async destroyAll(): Promise<void> {
    for (const [id, plugin] of this.plugins.entries()) {
      if (this.initializedPlugins.has(id) && plugin.destroy) {
        try {
          await plugin.destroy();
        } catch (err) {
          console.error(`[PluginRegistry] Error destroying plugin "${id}":`, err);
        }
      }
    }
    this.initializedPlugins.clear();
  }

  /**
   * 清空注册表（主要用于单元测试隔离）
   */
  reset(): void {
    this.plugins.clear();
    this.initializedPlugins.clear();
    this.changeListeners.clear();
  }

  subscribe(listener: () => void): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.changeListeners) {
      try {
        listener();
      } catch (err) {
        console.error('[PluginRegistry] Listener callback error:', err);
      }
    }
  }
}
