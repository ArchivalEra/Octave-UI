// tests/dock/DockLayoutStore.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { DockLayoutStore } from '../../src/modules/dock/DockLayoutStore';
import type { DockSplitNode, DockTabNode } from '../../src/modules/dock/types';

describe('DockLayoutStore Deep Module', () => {
  let store: DockLayoutStore;

  beforeEach(() => {
    localStorage.clear();
    store = new DockLayoutStore('studio');
  });

  it('initializes with default studio preset containing OPFS files, Octave, and OMC shell', () => {
    const state = store.state;
    expect(state.root.type).toBe('split');
    const root = state.root as DockSplitNode;
    expect(root.direction).toBe('horizontal');
    expect(root.children.length).toBe(3);

    // Left: OPFS file bay
    const left = root.children[0] as DockTabNode;
    expect(left.type).toBe('tab');
    expect(left.panels).toContain('opfs-files');

    // Center: vertical split containing notebook and terminal+omc
    const center = root.children[1] as DockSplitNode;
    expect(center.type).toBe('split');
    expect(center.direction).toBe('vertical');
    const topCenter = center.children[0] as DockTabNode;
    expect(topCenter.panels).toContain('octave-notebook');
    const bottomCenter = center.children[1] as DockTabNode;
    expect(bottomCenter.panels).toContain('octave-terminal');
    expect(bottomCenter.panels).toContain('omc-shell');
  });

  it('switches active panel when opening an already loaded panel', () => {
    store.openPanel('omc-shell');
    expect(store.state.activePanelId).toBe('omc-shell');

    // Check that the tab containing omc-shell now has activePanel === 'omc-shell'
    const root = store.state.root as DockSplitNode;
    const center = root.children[1] as DockSplitNode;
    const bottomCenter = center.children[1] as DockTabNode;
    expect(bottomCenter.activePanel).toBe('omc-shell');
  });

  it('moves a panel to center of another tab node (tabs merge)', () => {
    const root = store.state.root as DockSplitNode;
    const left = root.children[0] as DockTabNode;
    const right = root.children[2] as DockTabNode;

    // Move opfs-files to center of right node
    store.movePanel('opfs-files', {
      targetNodeId: right.id,
      position: 'center',
    });

    // Right tab now contains opfs-files
    expect(right.panels).toContain('opfs-files');
    expect(right.activePanel).toBe('opfs-files');

    // Left tab was empty, so root tree collapsed
    expect(store.state.root.type).toBe('split');
  });

  it('moves a panel to left of a tab node (splits horizontally)', () => {
    store.applyPreset('octave-focus');
    const root = store.state.root as DockSplitNode;
    const mainTab = root.children[1] as DockTabNode;

    // Split mainTab by dropping variables to its left
    store.movePanel('variables', {
      targetNodeId: mainTab.id,
      position: 'left',
    });

    const newRoot = store.state.root as DockSplitNode;
    expect(newRoot.children.length).toBeGreaterThanOrEqual(2);
    expect(store.state.activePanelId).toBe('variables');
  });

  it('moves a panel to bottom of a tab node (splits vertically)', () => {
    store.applyPreset('twin-console');
    const root = store.state.root as DockSplitNode;
    const leftTab = root.children[0] as DockTabNode;

    store.movePanel('history', {
      targetNodeId: leftTab.id,
      position: 'bottom',
    });

    expect(store.state.activePanelId).toBe('history');
  });

  it('prunes empty tab nodes and collapses single child split nodes when closing panels', () => {
    store.applyPreset('twin-console');
    // twin-console has 2 tabs: octave-terminal and omc-shell
    store.closePanel('omc-shell');

    // Root should collapse from split to a single tab node
    expect(store.state.root.type).toBe('tab');
    const singleTab = store.state.root as DockTabNode;
    expect(singleTab.panels).toEqual(['octave-terminal']);
  });

  it('toggles floating window for a panel and brings to front', () => {
    store.toggleFloating('opfs-files', { x: 100, y: 150, width: 400, height: 300 });

    expect(store.state.floating.length).toBe(1);
    expect(store.state.floating[0].panelId).toBe('opfs-files');
    expect(store.state.floating[0].x).toBe(100);

    store.toggleFloating('omc-shell');
    expect(store.state.floating.length).toBe(2);

    // Bring opfs-files to front
    store.bringFloatingToFront('opfs-files');
    const opfsFloat = store.state.floating.find((f) => f.panelId === 'opfs-files');
    const omcFloat = store.state.floating.find((f) => f.panelId === 'omc-shell');
    expect(opfsFloat!.zIndex).toBeGreaterThan(omcFloat!.zIndex);

    // Toggle back to grid
    store.toggleFloating('opfs-files');
    expect(store.state.floating.length).toBe(1);
    expect(store.state.floating[0].panelId).toBe('omc-shell');
  });

  it('normalizes ratios when resizing split nodes', () => {
    const root = store.state.root as DockSplitNode;
    store.resizeSplit(root.id, [0.3, 0.4, 0.3]);

    const updatedRoot = store.state.root as DockSplitNode;
    const sum = updatedRoot.ratios.reduce((a, b) => a + b, 0);
    expect(Math.abs(sum - 1.0)).toBeLessThan(0.01);
  });

  it('switches between all 4 layout presets cleanly', () => {
    store.applyPreset('omc-focus');
    expect(store.state.activePanelId).toBe('omc-shell');

    store.applyPreset('twin-console');
    expect(store.state.activePanelId).toBe('octave-terminal');

    store.applyPreset('octave-focus');
    expect(store.state.activePanelId).toBe('octave-notebook');

    store.applyPreset('studio');
    expect(store.state.activePanelId).toBe('octave-notebook');
  });

  it('persists layout to localStorage and rehydrates on new instance', () => {
    store.applyPreset('twin-console');
    // Create new store instance with saved layout
    const newStore = new DockLayoutStore();
    expect(newStore.state.activePanelId).toBe('octave-terminal');
    const root = newStore.state.root as DockSplitNode;
    expect(root.children.length).toBe(2);
  });
});
