// src/modules/dock/types.ts
// 可拖拽多引擎工作台（Dock Workspace）类型系统

export type PanelId =
  | 'opfs-files'
  | 'omc-shell'
  | 'octave-notebook'
  | 'octave-terminal'
  | 'variables'
  | 'plot-canvas'
  | 'history';

export type ZonePosition = 'top' | 'bottom' | 'left' | 'right' | 'center';

export type SplitDirection = 'horizontal' | 'vertical';

export interface DockTabNode {
  type: 'tab';
  id: string;
  panels: PanelId[];
  activePanel: PanelId;
}

export interface DockSplitNode {
  type: 'split';
  id: string;
  direction: SplitDirection;
  children: DockNode[];
  ratios: number[];
}

export type DockNode = DockSplitNode | DockTabNode;

export interface FloatingPanel {
  panelId: PanelId;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
}

export interface DockLayoutState {
  root: DockNode;
  floating: FloatingPanel[];
  activePanelId: PanelId | null;
}

export interface DropTarget {
  targetNodeId: string;
  position: ZonePosition;
}

export type LayoutPreset = 'studio' | 'octave-focus' | 'omc-focus' | 'twin-console';

export interface PanelMetadata {
  id: PanelId;
  titleKey: string;
  icon: string;
  defaultZone: 'left' | 'center' | 'right' | 'bottom';
  closable?: boolean;
}
