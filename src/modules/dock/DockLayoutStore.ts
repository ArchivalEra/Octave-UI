// src/modules/dock/DockLayoutStore.ts
// 可拖拽多引擎工作台（Dock Workspace）唯一深模块：
// 掌管 2D 递归分屏树、5-区拖拽停靠算法、分割条比例归一化、浮动窗口与持久化

import type {
  DockLayoutState,
  DockNode,
  DockSplitNode,
  DockTabNode,
  DropTarget,
  FloatingPanel,
  LayoutPreset,
  PanelId,
  SplitDirection,
  ZonePosition,
} from './types';

let nextNodeId = 1;
function genId(prefix = 'dock'): string {
  return `${prefix}-${Date.now().toString(36)}-${(nextNodeId++).toString(36)}`;
}

export class DockLayoutStore {
  private _state: DockLayoutState;
  private _listeners = new Set<(state: DockLayoutState) => void>();
  private _storageKey = 'octave-dock-layout-v1';

  constructor(initialPreset: LayoutPreset = 'studio') {
    this._state = this.loadSavedLayout() ?? this.createPreset(initialPreset);
  }

  get state(): DockLayoutState {
    return this._state;
  }

  // ── 外部高杠杆方法（Small Interface）────────────────────────────────────────

  openPanel(panelId: PanelId, target?: { relativeTo?: string; position?: ZonePosition }): void {
    // 1. 如果已在浮动窗口中，直接激活置顶
    const floatIdx = this._state.floating.findIndex((f) => f.panelId === panelId);
    if (floatIdx !== -1) {
      this.bringFloatingToFront(panelId);
      this._state.activePanelId = panelId;
      this.notify();
      return;
    }

    // 2. 如果已在分屏树中，直接切换所在 Tab 为 activePanel
    const existingTab = this.findTabContainingPanel(this._state.root, panelId);
    if (existingTab) {
      existingTab.activePanel = panelId;
      this._state.activePanelId = panelId;
      this.notify();
      return;
    }

    // 3. 不在树中，挂载至指定位置或默认区域
    if (target?.relativeTo) {
      const targetNode = this.findNode(this._state.root, target.relativeTo);
      if (targetNode) {
        this.movePanel(panelId, {
          targetNodeId: target.relativeTo,
          position: target.position ?? 'center',
        });
        return;
      }
    }

    // 默认回退：附加至第一个 Tab 节点
    const firstTab = this.findFirstTab(this._state.root);
    if (firstTab) {
      firstTab.panels.push(panelId);
      firstTab.activePanel = panelId;
      this._state.activePanelId = panelId;
      this.notify();
    }
  }

  closePanel(panelId: PanelId): void {
    // 1. 检查浮动窗口
    const floatIdx = this._state.floating.findIndex((f) => f.panelId === panelId);
    if (floatIdx !== -1) {
      this._state.floating.splice(floatIdx, 1);
      if (this._state.activePanelId === panelId) {
        this._state.activePanelId = null;
      }
      this.notify();
      return;
    }

    // 2. 从分屏树中移除
    const tabNode = this.findTabContainingPanel(this._state.root, panelId);
    if (!tabNode) return;

    tabNode.panels = tabNode.panels.filter((p) => p !== panelId);
    if (tabNode.activePanel === panelId) {
      tabNode.activePanel = tabNode.panels[0] ?? ('' as PanelId);
    }

    // 如果该 Tab 节点空了，修剪二叉树
    if (tabNode.panels.length === 0) {
      this._state.root = this.pruneEmptyNode(this._state.root, tabNode.id);
    }

    if (this._state.activePanelId === panelId) {
      this._state.activePanelId = null;
    }
    this.notify();
  }

  movePanel(panelId: PanelId, dropTarget: DropTarget): void {
    // 1. 先从原位置摘除面板
    this.removePanelFromLayout(panelId);

    // 2. 目标节点寻找
    const targetNode = this.findNode(this._state.root, dropTarget.targetNodeId);
    if (!targetNode) {
      // 容错：直接塞入首个 Tab
      const fallbackTab = this.findFirstTab(this._state.root);
      if (fallbackTab) {
        fallbackTab.panels.push(panelId);
        fallbackTab.activePanel = panelId;
      }
      this.notify();
      return;
    }

    // 3. 处理 5-区拖拽落点
    if (dropTarget.position === 'center' && targetNode.type === 'tab') {
      // 放入已有 Tab
      targetNode.panels.push(panelId);
      targetNode.activePanel = panelId;
      this._state.activePanelId = panelId;
      this.notify();
      return;
    }

    // 上下左右分裂：生成独立 Tab 节点
    const newTabNode: DockTabNode = {
      type: 'tab',
      id: genId('tab'),
      panels: [panelId],
      activePanel: panelId,
    };

    const direction: SplitDirection =
      dropTarget.position === 'left' || dropTarget.position === 'right' ? 'horizontal' : 'vertical';
    const isFirst = dropTarget.position === 'left' || dropTarget.position === 'top';

    const parent = this.findParent(this._state.root, targetNode.id);

    if (parent && parent.direction === direction) {
      // 父级同方向，直接就近插入
      const idx = parent.children.findIndex((c) => c.id === targetNode.id);
      const insertIdx = isFirst ? idx : idx + 1;
      parent.children.splice(insertIdx, 0, newTabNode);
      this.normalizeRatios(parent);
    } else {
      // 需要在原目标节点位置包裹一层新的 SplitNode
      const newSplit: DockSplitNode = {
        type: 'split',
        id: genId('split'),
        direction,
        children: isFirst ? [newTabNode, targetNode] : [targetNode, newTabNode],
        ratios: [0.5, 0.5],
      };

      if (!parent) {
        this._state.root = newSplit;
      } else {
        const idx = parent.children.findIndex((c) => c.id === targetNode.id);
        parent.children[idx] = newSplit;
        this.normalizeRatios(parent);
      }
    }

    this._state.activePanelId = panelId;
    this.notify();
  }

  resizeSplit(splitId: string, ratios: number[]): void {
    const node = this.findNode(this._state.root, splitId);
    if (!node || node.type !== 'split') return;

    // 限制每个比例最小 10%
    const minRatio = 0.1;
    const clamped = ratios.map((r) => Math.max(minRatio, r));
    const sum = clamped.reduce((acc, v) => acc + v, 0);
    node.ratios = clamped.map((v) => Number((v / sum).toFixed(4)));
    this.notify();
  }

  toggleFloating(panelId: PanelId, bounds?: { x: number; y: number; width: number; height: number }): void {
    const floatIdx = this._state.floating.findIndex((f) => f.panelId === panelId);
    if (floatIdx !== -1) {
      // 从浮动恢复至主分屏树
      this._state.floating.splice(floatIdx, 1);
      const firstTab = this.findFirstTab(this._state.root);
      if (firstTab) {
        firstTab.panels.push(panelId);
        firstTab.activePanel = panelId;
      }
    } else {
      // 从分屏树脱离为浮动
      this.removePanelFromLayout(panelId);
      const maxZ = this._state.floating.reduce((m, f) => Math.max(m, f.zIndex), 100);
      this._state.floating.push({
        panelId,
        x: bounds?.x ?? 80,
        y: bounds?.y ?? 80,
        width: bounds?.width ?? 480,
        height: bounds?.height ?? 380,
        zIndex: maxZ + 1,
      });
    }
    this._state.activePanelId = panelId;
    this.notify();
  }

  updateFloatingBounds(panelId: PanelId, bounds: Partial<FloatingPanel>): void {
    const item = this._state.floating.find((f) => f.panelId === panelId);
    if (!item) return;
    Object.assign(item, bounds);
    this.notify();
  }

  bringFloatingToFront(panelId: PanelId): void {
    const item = this._state.floating.find((f) => f.panelId === panelId);
    if (!item) return;
    const maxZ = this._state.floating.reduce((m, f) => Math.max(m, f.zIndex), 100);
    item.zIndex = maxZ + 1;
  }

  setActivePanel(panelId: PanelId): void {
    this._state.activePanelId = panelId;
    const tabNode = this.findTabContainingPanel(this._state.root, panelId);
    if (tabNode) {
      tabNode.activePanel = panelId;
    }
    this.notify();
  }

  applyPreset(preset: LayoutPreset): void {
    this._state = this.createPreset(preset);
    this.notify();
  }

  reset(): void {
    this.applyPreset('studio');
  }

  subscribe(fn: (state: DockLayoutState) => void): () => void {
    this._listeners.add(fn);
    fn(this._state);
    return () => this._listeners.delete(fn);
  }

  // ── 内部树修剪与辅助算法（Deep Implementation）───────────────────────────────

  private removePanelFromLayout(panelId: PanelId): void {
    // 浮动窗口中移除
    const floatIdx = this._state.floating.findIndex((f) => f.panelId === panelId);
    if (floatIdx !== -1) {
      this._state.floating.splice(floatIdx, 1);
      return;
    }

    // 分屏树中移除
    const tabNode = this.findTabContainingPanel(this._state.root, panelId);
    if (!tabNode) return;

    tabNode.panels = tabNode.panels.filter((p) => p !== panelId);
    if (tabNode.activePanel === panelId) {
      tabNode.activePanel = tabNode.panels[0] ?? ('' as PanelId);
    }

    if (tabNode.panels.length === 0) {
      this._state.root = this.pruneEmptyNode(this._state.root, tabNode.id);
    }
  }

  private pruneEmptyNode(current: DockNode, emptyNodeId: string): DockNode {
    if (current.id === emptyNodeId) {
      // 根节点被清空，重置为包含默认面板的 Tab
      return {
        type: 'tab',
        id: genId('tab-empty'),
        panels: ['octave-notebook'],
        activePanel: 'octave-notebook',
      };
    }

    if (current.type === 'split') {
      current.children = current.children
        .filter((child) => child.id !== emptyNodeId)
        .map((child) => this.pruneEmptyNode(child, emptyNodeId));

      if (current.children.length === 0) {
        return {
          type: 'tab',
          id: genId('tab-fallback'),
          panels: ['octave-notebook'],
          activePanel: 'octave-notebook',
        };
      }

      if (current.children.length === 1) {
        // 单子节点坍缩：去掉多余分屏层
        return current.children[0];
      }

      this.normalizeRatios(current);
    }

    return current;
  }

  private normalizeRatios(node: DockSplitNode): void {
    const len = node.children.length;
    if (len === 0) return;
    if (node.ratios.length !== len) {
      node.ratios = Array(len).fill(Number((1 / len).toFixed(4)));
      return;
    }
    const sum = node.ratios.reduce((acc, v) => acc + v, 0);
    if (sum <= 0) {
      node.ratios = Array(len).fill(Number((1 / len).toFixed(4)));
    } else {
      node.ratios = node.ratios.map((r) => Number((r / sum).toFixed(4)));
    }
  }

  private findNode(current: DockNode, id: string): DockNode | null {
    if (current.id === id) return current;
    if (current.type === 'split') {
      for (const child of current.children) {
        const found = this.findNode(child, id);
        if (found) return found;
      }
    }
    return null;
  }

  private findParent(current: DockNode, targetId: string): DockSplitNode | null {
    if (current.type === 'split') {
      for (const child of current.children) {
        if (child.id === targetId) return current;
        const found = this.findParent(child, targetId);
        if (found) return found;
      }
    }
    return null;
  }

  private findTabContainingPanel(current: DockNode, panelId: PanelId): DockTabNode | null {
    if (current.type === 'tab') {
      return current.panels.includes(panelId) ? current : null;
    }
    for (const child of current.children) {
      const found = this.findTabContainingPanel(child, panelId);
      if (found) return found;
    }
    return null;
  }

  private findFirstTab(current: DockNode): DockTabNode | null {
    if (current.type === 'tab') return current;
    for (const child of current.children) {
      const found = this.findFirstTab(child);
      if (found) return found;
    }
    return null;
  }

  private notify(): void {
    this.saveLayout();
    for (const listener of this._listeners) {
      listener(this._state);
    }
  }

  private saveLayout(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(this._storageKey, JSON.stringify(this._state));
    } catch {}
  }

  private loadSavedLayout(): DockLayoutState | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      const raw = localStorage.getItem(this._storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed?.root && Array.isArray(parsed?.floating)) {
        return parsed as DockLayoutState;
      }
    } catch {}
    return null;
  }

  private createPreset(preset: LayoutPreset): DockLayoutState {
    switch (preset) {
      case 'studio': {
        // 双引擎全能工作台：左侧文件舱，中部分屏（上 Notebook，下双终端），右侧变量/绘图
        const root: DockSplitNode = {
          type: 'split',
          id: genId('split-root'),
          direction: 'horizontal',
          ratios: [0.2, 0.55, 0.25],
          children: [
            {
              type: 'tab',
              id: genId('tab-left'),
              panels: ['opfs-files'],
              activePanel: 'opfs-files',
            },
            {
              type: 'split',
              id: genId('split-center'),
              direction: 'vertical',
              ratios: [0.6, 0.4],
              children: [
                {
                  type: 'tab',
                  id: genId('tab-center-top'),
                  panels: ['octave-notebook'],
                  activePanel: 'octave-notebook',
                },
                {
                  type: 'tab',
                  id: genId('tab-center-bottom'),
                  panels: ['octave-terminal', 'omc-shell'],
                  activePanel: 'octave-terminal',
                },
              ],
            },
            {
              type: 'tab',
              id: genId('tab-right'),
              panels: ['variables', 'plot-canvas', 'history'],
              activePanel: 'variables',
            },
          ],
        };
        return { root, floating: [], activePanelId: 'octave-notebook' };
      }

      case 'octave-focus': {
        const root: DockSplitNode = {
          type: 'split',
          id: genId('split-octave'),
          direction: 'horizontal',
          ratios: [0.2, 0.8],
          children: [
            {
              type: 'tab',
              id: genId('tab-files'),
              panels: ['opfs-files'],
              activePanel: 'opfs-files',
            },
            {
              type: 'tab',
              id: genId('tab-main'),
              panels: ['octave-notebook', 'octave-terminal', 'variables'],
              activePanel: 'octave-notebook',
            },
          ],
        };
        return { root, floating: [], activePanelId: 'octave-notebook' };
      }

      case 'omc-focus': {
        const root: DockSplitNode = {
          type: 'split',
          id: genId('split-omc'),
          direction: 'horizontal',
          ratios: [0.2, 0.8],
          children: [
            {
              type: 'tab',
              id: genId('tab-files'),
              panels: ['opfs-files'],
              activePanel: 'opfs-files',
            },
            {
              type: 'split',
              id: genId('split-omc-center'),
              direction: 'vertical',
              ratios: [0.6, 0.4],
              children: [
                {
                  type: 'tab',
                  id: genId('tab-omc-main'),
                  panels: ['omc-shell'],
                  activePanel: 'omc-shell',
                },
                {
                  type: 'tab',
                  id: genId('tab-omc-aux'),
                  panels: ['variables', 'plot-canvas'],
                  activePanel: 'variables',
                },
              ],
            },
          ],
        };
        return { root, floating: [], activePanelId: 'omc-shell' };
      }

      case 'twin-console': {
        const root: DockSplitNode = {
          type: 'split',
          id: genId('split-consoles'),
          direction: 'horizontal',
          ratios: [0.5, 0.5],
          children: [
            {
              type: 'tab',
              id: genId('tab-octave-term'),
              panels: ['octave-terminal'],
              activePanel: 'octave-terminal',
            },
            {
              type: 'tab',
              id: genId('tab-omc-term'),
              panels: ['omc-shell'],
              activePanel: 'omc-shell',
            },
          ],
        };
        return { root, floating: [], activePanelId: 'octave-terminal' };
      }
    }
  }
}
