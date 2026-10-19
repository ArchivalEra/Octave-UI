<!-- src/components/dock/DockTabBar.svelte -->
<script lang="ts">
  import { dockLayoutStore, panelRegistry, t } from '../../modules/appContext';
  import type { DockTabNode, PanelId } from '../../modules/dock/types';

  let {
    node,
    onDragStartPanel,
  } = $props<{
    node: DockTabNode;
    onDragStartPanel: (panelId: PanelId, sourceNodeId: string) => void;
  }>();

  function selectTab(panelId: PanelId) {
    node.activePanel = panelId;
    dockLayoutStore.setActivePanel(panelId);
  }

  function handleClose(e: MouseEvent, panelId: PanelId) {
    e.stopPropagation();
    dockLayoutStore.closePanel(panelId);
  }

  function handleFloat(e: MouseEvent, panelId: PanelId) {
    e.stopPropagation();
    dockLayoutStore.toggleFloating(panelId);
  }

  function handleDragStart(e: DragEvent, panelId: PanelId) {
    if (!e.dataTransfer) return;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData(
      'application/json',
      JSON.stringify({ panelId, sourceNodeId: node.id })
    );
    onDragStartPanel(panelId, node.id);
  }
</script>

<div class="dock-tab-bar" role="tablist">
  <div class="tabs-scroll-area">
    {#each node.panels as panelId (panelId)}
      {@const meta = panelRegistry.get(panelId)}
      {@const isActive = node.activePanel === panelId}
      <div
        class="dock-tab"
        class:active={isActive}
        onclick={() => selectTab(panelId)}
        onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') selectTab(panelId); }}
        draggable="true"
        ondragstart={(e) => handleDragStart(e, panelId)}
        role="tab"
        tabindex="0"
        aria-selected={isActive}
        title={meta ? t(meta.titleKey) : panelId}
      >
        <span class="tab-icon">{meta?.icon ?? '📄'}</span>
        <span class="tab-title">{meta ? t(meta.titleKey) : panelId}</span>

        <div class="tab-actions">
          <button
            type="button"
            class="tab-action-btn"
            title={t('dock.float_window')}
            onclick={(e) => handleFloat(e, panelId)}
          >⤢</button>
          {#if meta?.closable !== false}
            <button
              type="button"
              class="tab-action-btn close"
              title={t('dock.close_panel')}
              onclick={(e) => handleClose(e, panelId)}
            >✕</button>
          {/if}
        </div>
      </div>
    {/each}
  </div>
</div>

<style>
  .dock-tab-bar {
    display: flex;
    align-items: center;
    background: var(--bg-surface-hover);
    border-bottom: 1px solid var(--border-subtle);
    height: 32px;
    flex-shrink: 0;
    overflow: hidden;
    user-select: none;
  }

  .tabs-scroll-area {
    display: flex;
    align-items: center;
    height: 100%;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
    gap: 1px;
  }

  .tabs-scroll-area::-webkit-scrollbar {
    display: none;
  }

  .dock-tab {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 10px;
    height: 100%;
    font-size: 11.5px;
    color: var(--text-muted);
    background: transparent;
    cursor: grab;
    border-right: 1px solid var(--border-subtle);
    white-space: nowrap;
    transition: all 0.15s ease;
  }

  .dock-tab:hover {
    color: var(--text-main);
    background: var(--bg-surface);
  }

  .dock-tab.active {
    background: var(--bg-surface);
    color: var(--accent-primary);
    font-weight: 600;
    border-top: 2px solid var(--accent-primary);
  }

  .dock-tab:active {
    cursor: grabbing;
  }

  .tab-icon {
    font-size: 12px;
  }

  .tab-title {
    max-width: 140px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tab-actions {
    display: flex;
    align-items: center;
    gap: 2px;
    opacity: 0.6;
    margin-left: 4px;
  }

  .dock-tab:hover .tab-actions {
    opacity: 1;
  }

  .tab-action-btn {
    border: none;
    background: transparent;
    color: var(--text-muted);
    border-radius: 3px;
    font-size: 10px;
    padding: 2px 3px;
    cursor: pointer;
    line-height: 1;
  }

  .tab-action-btn:hover {
    background: var(--bg-surface-hover);
    color: var(--text-main);
  }

  .tab-action-btn.close:hover {
    color: var(--accent-danger);
  }
</style>
