<!-- src/components/dock/FloatingWindow.svelte -->
<script lang="ts">
  import type { FloatingPanel } from '../../modules/dock/types';
  import { dockLayoutStore, panelRegistry, t } from '../../modules/appContext';
  import OpfsFilesPanel from './panels/OpfsFilesPanel.svelte';
  import OmcShellPanel from './panels/OmcShellPanel.svelte';
  import VariableInspectorPanel from './panels/VariableInspectorPanel.svelte';
  import PlotCanvasPanel from './panels/PlotCanvasPanel.svelte';
  import HistoryPanel from './panels/HistoryPanel.svelte';
  import NotebookView from '../NotebookView.svelte';
  import TerminalIsland from '../TerminalIsland.svelte';

  let {
    panel,
    onOpenExamples,
    onInterceptPlot,
  } = $props<{
    panel: FloatingPanel;
    onOpenExamples: () => void;
    onInterceptPlot: (cmd: string, reason: string) => void;
  }>();

  let meta = $derived(panelRegistry.get(panel.panelId));

  function handleFocus() {
    dockLayoutStore.bringFloatingToFront(panel.panelId);
  }

  function handleClose() {
    dockLayoutStore.closePanel(panel.panelId);
  }

  function handleDockBack() {
    dockLayoutStore.toggleFloating(panel.panelId);
  }

  // 窗口移动
  function startDragMove(e: MouseEvent) {
    if ((e.target as HTMLElement).closest('.window-btn')) return;
    e.preventDefault();
    handleFocus();

    const startX = e.clientX;
    const startY = e.clientY;
    const initialX = panel.x;
    const initialY = panel.y;

    function onMouseMove(ev: MouseEvent) {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      dockLayoutStore.updateFloatingBounds(panel.panelId, {
        x: Math.max(10, initialX + dx),
        y: Math.max(10, initialY + dy),
      });
    }

    function onMouseUp() {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  // 窗口缩放
  function startResize(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    handleFocus();

    const startX = e.clientX;
    const startY = e.clientY;
    const initialW = panel.width;
    const initialH = panel.height;

    function onMouseMove(ev: MouseEvent) {
      const dw = ev.clientX - startX;
      const dh = ev.clientY - startY;
      dockLayoutStore.updateFloatingBounds(panel.panelId, {
        width: Math.max(280, initialW + dw),
        height: Math.max(200, initialH + dh),
      });
    }

    function onMouseUp() {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }
</script>

<div
  class="floating-window"
  style="left: {panel.x}px; top: {panel.y}px; width: {panel.width}px; height: {panel.height}px; z-index: {panel.zIndex};"
  onmousedown={handleFocus}
  role="dialog"
  aria-label={meta ? t(meta.titleKey) : panel.panelId}
>
  <!-- 标题栏 -->
  <div class="window-titlebar" onmousedown={startDragMove} role="presentation">
    <div class="title-info">
      <span class="panel-icon">{meta?.icon ?? '📄'}</span>
      <span class="panel-title">{meta ? t(meta.titleKey) : panel.panelId}</span>
    </div>
    <div class="window-actions">
      <button
        type="button"
        class="window-btn"
        title={t('dock.dock_window')}
        onclick={handleDockBack}
      >⤡</button>
      <button
        type="button"
        class="window-btn close"
        title={t('dock.close_panel')}
        onclick={handleClose}
      >✕</button>
    </div>
  </div>

  <!-- 面板内容体 -->
  <div class="window-body">
    {#if panel.panelId === 'opfs-files'}
      <OpfsFilesPanel />
    {:else if panel.panelId === 'octave-notebook'}
      <NotebookView {onOpenExamples} />
    {:else if panel.panelId === 'octave-terminal'}
      <TerminalIsland {onInterceptPlot} />
    {:else if panel.panelId === 'omc-shell'}
      <OmcShellPanel />
    {:else if panel.panelId === 'variables'}
      <VariableInspectorPanel />
    {:else if panel.panelId === 'plot-canvas'}
      <PlotCanvasPanel />
    {:else if panel.panelId === 'history'}
      <HistoryPanel />
    {/if}
  </div>

  <!-- 右下角缩放手柄 -->
  <div class="resize-handle" onmousedown={startResize} role="separator" aria-orientation="vertical"></div>
</div>

<style>
  .floating-window {
    position: absolute;
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .window-titlebar {
    height: 34px;
    background: var(--bg-surface-hover);
    border-bottom: 1px solid var(--border-subtle);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 10px;
    cursor: move;
    user-select: none;
    flex-shrink: 0;
  }

  .title-info {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-main);
  }

  .window-actions {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .window-btn {
    border: none;
    background: transparent;
    color: var(--text-muted);
    font-size: 11px;
    padding: 2px 5px;
    border-radius: 3px;
    cursor: pointer;
  }

  .window-btn:hover {
    background: var(--bg-surface);
    color: var(--text-main);
  }

  .window-btn.close:hover {
    color: var(--accent-danger);
  }

  .window-body {
    flex: 1;
    overflow: hidden;
    display: flex;
    position: relative;
  }

  .resize-handle {
    position: absolute;
    bottom: 0;
    right: 0;
    width: 14px;
    height: 14px;
    cursor: nwse-resize;
    z-index: 50;
    background: linear-gradient(135deg, transparent 50%, var(--border-subtle) 50%, var(--border-subtle) 70%, transparent 70%, transparent 85%, var(--border-subtle) 85%);
  }
</style>
