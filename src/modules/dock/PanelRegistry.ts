// src/modules/dock/PanelRegistry.ts
// 可拖拽面板目录与元数据管理深模块

import type { PanelId, PanelMetadata } from './types';

export class PanelRegistry {
  private _panels = new Map<PanelId, PanelMetadata>();

  constructor() {
    this.registerDefaults();
  }

  private registerDefaults(): void {
    const defaults: PanelMetadata[] = [
      {
        id: 'opfs-files',
        titleKey: 'dock.panel_files',
        icon: '📁',
        defaultZone: 'left',
        closable: true,
      },
      {
        id: 'octave-notebook',
        titleKey: 'dock.panel_notebook',
        icon: '📓',
        defaultZone: 'center',
        closable: true,
      },
      {
        id: 'octave-terminal',
        titleKey: 'dock.panel_terminal',
        icon: '💻',
        defaultZone: 'center',
        closable: true,
      },
      {
        id: 'omc-shell',
        titleKey: 'dock.panel_omc_shell',
        icon: '⚙️',
        defaultZone: 'bottom',
        closable: true,
      },
      {
        id: 'variables',
        titleKey: 'dock.panel_variables',
        icon: '📊',
        defaultZone: 'right',
        closable: true,
      },
      {
        id: 'plot-canvas',
        titleKey: 'dock.panel_plots',
        icon: '📈',
        defaultZone: 'right',
        closable: true,
      },
      {
        id: 'history',
        titleKey: 'dock.panel_history',
        icon: '📜',
        defaultZone: 'bottom',
        closable: true,
      },
    ];

    for (const def of defaults) {
      this.register(def);
    }
  }

  register(metadata: PanelMetadata): void {
    this._panels.set(metadata.id, metadata);
  }

  get(id: PanelId): PanelMetadata | undefined {
    return this._panels.get(id);
  }

  getAll(): PanelMetadata[] {
    return Array.from(this._panels.values());
  }

  has(id: PanelId): boolean {
    return this._panels.has(id);
  }
}

export const panelRegistryInstance = new PanelRegistry();
