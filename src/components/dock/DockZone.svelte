<!-- src/components/dock/DockZone.svelte -->
<script lang="ts">
  import type { DockNode, PanelId, ZonePosition } from '../../modules/dock/types';
  import { dockLayoutStore } from '../../modules/appContext';
  import DockTabBar from './DockTabBar.svelte';
  import OpfsFilesPanel from './panels/OpfsFilesPanel.svelte';
  import OmcShellPanel from './panels/OmcShellPanel.svelte';
  import VariableInspectorPanel from './panels/VariableInspectorPanel.svelte';
  import PlotCanvasPanel from './panels/PlotCanvasPanel.svelte';
  import HistoryPanel from './panels/HistoryPanel.svelte';
  import NotebookView from '../NotebookView.svelte';
  import TerminalIsland from '../TerminalIsland.svelte';

  let {
    node,
    onOpenExamples,
    onInterceptPlot,
    onDragStartPanel,
    currentDraggedPanelId,
  } = $props<{
    node: DockNode;
    onOpenExamples: () => void;
    onInterceptPlot: (cmd: string, reason: string) => void;
    onDragStartPanel: (panelId: PanelId, sourceNodeId: string) => void;
    currentDraggedPanelId: PanelId | null;
  }>();

  let hoveredDropZone = $state<ZonePosition | null>(null);
  let containerEl: HTMLElement | null = $state(null);

  // ── 分割条拖拽逻辑 ────────────────────────────────────────────────────────
  function startResize(e: MouseEvent, index: number) {
    if (node.type !== 'split') return;
    e.preventDefault();
    const isHorizontal = node.direction === 'horizontal';
    const startCoord = isHorizontal ? e.clientX : e.clientY;
    const initialRatios = [...node.ratios];
    const totalSize = isHorizontal
      ? (e.currentTarget as HTMLElement).parentElement?.clientWidth || 1000
      : (e.currentTarget as HTMLElement).parentElement?.clientHeight || 600;

    function onMouseMove(ev: MouseEvent) {
      if (node.type !== 'split') return;
      const currentCoord = isHorizontal ? ev.clientX : ev.clientY;
      const deltaPx = currentCoord - startCoord;
      const deltaRatio = deltaPx / totalSize;

      const newRatios = [...initialRatios];
      const rA = initialRatios[index] + deltaRatio;
      const rB = initialRatios[index + 1] - deltaRatio;

      if (rA >= 0.1 && rB >= 0.1) {
        newRatios[index] = rA;
        newRatios[index + 1] = rB;
        dockLayoutStore.resizeSplit(node.id, newRatios);
      }
    }

    function onMouseUp() {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  // ── 5-区拖拽命中判定 ──────────────────────────────────────────────────────
  function handleDragOver(e: DragEvent) {
    if (!currentDraggedPanelId || !containerEl || node.type !== 'tab') return;
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move';
    }

    const rect = containerEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const relX = x / rect.width;
    const relY = y / rect.height;

    if (relX < 0.25) {
      hoveredDropZone = 'left';
    } else if (relX > 0.75) {
      hoveredDropZone = 'right';
    } else if (relY < 0.25) {
      hoveredDropZone = 'top';
    } else if (relY > 0.75) {
      hoveredDropZone = 'bottom';
    } else {
      hoveredDropZone = 'center';
    }
  }

  function handleDragLeave() {
    hoveredDropZone = null;
  }

  function handleDrop(e: DragEvent) {
    if (!currentDraggedPanelId || !hoveredDropZone || node.type !== 'tab') return;
    e.preventDefault();
    dockLayoutStore.movePanel(currentDraggedPanelId, {
      targetNodeId: node.id,
      position: hoveredDropZone,
    });
    hoveredDropZone = null;
  }
</script>

{#if node.type === 'split'}
  <div
    class="dock-split-container {node.direction}"
    role="group"
  >
    {#each node.children as child, i (child.id)}
      <div
        class="dock-child-wrapper"
        style="flex: {node.ratios[i] ?? 1};"
      >
        <svelte:self
          node={child}
          {onOpenExamples}
          {onInterceptPlot}
          {onDragStartPanel}
          {currentDraggedPanelId}
        />
      </div>

      {#if i < node.children.length - 1}
        <div
          class="dock-splitter {node.direction}"
          onmousedown={(e) => startResize(e, i)}
          role="separator"
          tabindex="0"
          aria-orientation={node.direction}
        ></div>
      {/if}
    {/each}
  </div>
{:else}
  <div
    class="dock-tab-container"
    bind:this={containerEl}
    ondragover={handleDragOver}
    ondragleave={handleDragLeave}
    ondrop={handleDrop}
    role="region"
  >
    <!-- Tab 头部栏 -->
    <DockTabBar
      {node}
      {onDragStartPanel}
    />

    <!-- 面板内容体 -->
    <div class="dock-panel-content">
      {#if node.activePanel === 'opfs-files'}
        <OpfsFilesPanel />
      {:else if node.activePanel === 'octave-notebook'}
        <NotebookView {onOpenExamples} />
      {:else if node.activePanel === 'octave-terminal'}
        <TerminalIsland {onInterceptPlot} />
      {:else if node.activePanel === 'omc-shell'}
        <OmcShellPanel />
      {:else if node.activePanel === 'variables'}
        <VariableInspectorPanel />
      {:else if node.activePanel === 'plot-canvas'}
        <PlotCanvasPanel />
      {:else if node.activePanel === 'history'}
        <HistoryPanel />
      {:else}
        <div class="empty-panel-prompt">Select a panel tab</div>
      {/if}
    </div>

    <!-- 5-区拖拽高亮半透明指示器 -->
    {#if hoveredDropZone && currentDraggedPanelId}
      <div class="drop-overlay zone-{hoveredDropZone}">
        <span class="drop-tag">Dock {hoveredDropZone}</span>
      </div>
    {/if}
  </div>
{/if}

<style>
  .dock-split-container {
    display: flex;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }

  .dock-split-container.horizontal {
    flex-direction: row;
  }

  .dock-split-container.vertical {
    flex-direction: column;
  }

  .dock-child-wrapper {
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    display: flex;
    position: relative;
  }

  /* 分割条 */
  .dock-splitter {
    background: var(--border-subtle);
    flex-shrink: 0;
    z-index: 20;
    transition: background-color 0.15s ease;
  }

  .dock-splitter.horizontal {
    width: 4px;
    cursor: col-resize;
  }

  .dock-splitter.vertical {
    height: 4px;
    cursor: row-resize;
  }

  .dock-splitter:hover,
  .dock-splitter:active {
    background: var(--accent-primary);
  }

  /* Tab 容器 */
  .dock-tab-container {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    overflow: hidden;
    position: relative;
    background: var(--bg-surface);
  }

  .dock-panel-content {
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    position: relative;
    display: flex;
  }

  .empty-panel-prompt {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    width: 100%;
    color: var(--text-muted);
    font-size: 13px;
  }

  /* 拖拽落点半透明高亮 */
  .drop-overlay {
    position: absolute;
    background: var(--bg-surface-hover);
    border: 2px dashed var(--accent-primary);
    border-radius: 4px;
    pointer-events: none;
    z-index: 80;
    display: flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(1px);
    transition: all 0.1s ease-out;
    opacity: 0.85;
  }

  .drop-tag {
    background: var(--accent-primary);
    color: var(--accent-primary-text);
    font-size: 11px;
    font-weight: 600;
    padding: 3px 8px;
    border-radius: 4px;
    text-transform: uppercase;
  }

  .zone-center {
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
  }

  .zone-left {
    top: 0;
    left: 0;
    width: 50%;
    bottom: 0;
  }

  .zone-right {
    top: 0;
    right: 0;
    width: 50%;
    bottom: 0;
  }

  .zone-top {
    top: 0;
    left: 0;
    right: 0;
    height: 50%;
  }

  .zone-bottom {
    bottom: 0;
    left: 0;
    right: 0;
    height: 50%;
  }
</style>
