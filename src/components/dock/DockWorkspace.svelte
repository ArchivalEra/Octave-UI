<!-- src/components/dock/DockWorkspace.svelte -->
<script lang="ts">
  import { dockLayoutStore, panelRegistry, t } from '../../modules/appContext';
  import type { DockLayoutState, LayoutPreset, PanelId } from '../../modules/dock/types';
  import DockZone from './DockZone.svelte';
  import FloatingWindow from './FloatingWindow.svelte';

  let {
    onOpenExamples,
    onInterceptPlot,
  } = $props<{
    onOpenExamples: () => void;
    onInterceptPlot: (cmd: string, reason: string) => void;
  }>();

  let state = $state<DockLayoutState>(dockLayoutStore.state);
  let currentDraggedPanelId = $state<PanelId | null>(null);
  let addPanelMenuOpen = $state(false);

  $effect(() => {
    const unsub = dockLayoutStore.subscribe((s) => {
      state = s;
    });

    function handleGlobalDragEnd() {
      currentDraggedPanelId = null;
    }

    window.addEventListener('dragend', handleGlobalDragEnd);
    return () => {
      unsub();
      window.removeEventListener('dragend', handleGlobalDragEnd);
    };
  });

  function handleDragStartPanel(panelId: PanelId) {
    currentDraggedPanelId = panelId;
  }

  function applyPreset(preset: LayoutPreset) {
    dockLayoutStore.applyPreset(preset);
  }

  function handleAddPanel(panelId: PanelId) {
    dockLayoutStore.openPanel(panelId);
    addPanelMenuOpen = false;
  }
</script>

<div class="dock-workspace" role="main" aria-label="Dock Workspace">
  <!-- 顶层工作台预设与面板快捷操作条 -->
  <div class="dock-toolbar">
    <div class="preset-group">
      <button
        type="button"
        class="preset-pill"
        onclick={() => applyPreset('studio')}
        title={t('dock.preset_studio')}
      >
        <span>🚀</span>
        <span>{t('dock.preset_studio')}</span>
      </button>

      <button
        type="button"
        class="preset-pill"
        onclick={() => applyPreset('octave-focus')}
        title={t('dock.preset_octave')}
      >
        <span>📓</span>
        <span>{t('dock.preset_octave')}</span>
      </button>

      <button
        type="button"
        class="preset-pill"
        onclick={() => applyPreset('omc-focus')}
        title={t('dock.preset_omc')}
      >
        <span>⚙️</span>
        <span>{t('dock.preset_omc')}</span>
      </button>

      <button
        type="button"
        class="preset-pill"
        onclick={() => applyPreset('twin-console')}
        title={t('dock.preset_consoles')}
      >
        <span>💻</span>
        <span>{t('dock.preset_consoles')}</span>
      </button>
    </div>

    <div class="toolbar-right">
      <!-- 添加面板下拉菜单 -->
      <div class="add-panel-container">
        <button
          type="button"
          class="add-panel-btn"
          onclick={() => (addPanelMenuOpen = !addPanelMenuOpen)}
        >
          <span>+ {t('dock.add_panel')}</span>
          <span class="arrow">{addPanelMenuOpen ? '▲' : '▼'}</span>
        </button>

        {#if addPanelMenuOpen}
          <div class="add-panel-dropdown">
            {#each panelRegistry.getAll() as meta}
              <button
                type="button"
                class="dropdown-item"
                onclick={() => handleAddPanel(meta.id)}
              >
                <span>{meta.icon}</span>
                <span>{t(meta.titleKey)}</span>
              </button>
            {/each}
          </div>
        {/if}
      </div>

      <button
        type="button"
        class="reset-btn"
        onclick={() => dockLayoutStore.reset()}
        title={t('dock.reset_layout')}
      >
        🔄
      </button>
    </div>
  </div>

  <!-- 分屏网格主视口 -->
  <div class="dock-grid-viewport">
    <DockZone
      node={state.root}
      {onOpenExamples}
      {onInterceptPlot}
      onDragStartPanel={handleDragStartPanel}
      {currentDraggedPanelId}
    />
  </div>

  <!-- 浮动窗口层 -->
  {#each state.floating as floatPanel (floatPanel.panelId)}
    <FloatingWindow
      panel={floatPanel}
      {onOpenExamples}
      {onInterceptPlot}
    />
  {/each}
</div>

<style>
  .dock-workspace {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    overflow: hidden;
    position: relative;
    background: var(--bg-canvas);
  }

  /* 顶层工具栏 */
  .dock-toolbar {
    height: 36px;
    background: var(--bg-surface);
    border-bottom: 1px solid var(--border-subtle);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 10px;
    gap: 8px;
    flex-shrink: 0;
    user-select: none;
    z-index: 30;
  }

  .preset-group {
    display: flex;
    align-items: center;
    gap: 4px;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .preset-group::-webkit-scrollbar {
    display: none;
  }

  .preset-pill {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 9px;
    border-radius: 9999px;
    background: var(--bg-surface-hover);
    border: 1px solid var(--border-subtle);
    font-size: 11.5px;
    font-weight: 500;
    color: var(--text-muted);
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.15s ease;
  }

  .preset-pill:hover {
    color: var(--text-main);
    border-color: var(--accent-primary);
    background: var(--bg-surface);
  }

  .toolbar-right {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .add-panel-container {
    position: relative;
  }

  .add-panel-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 9px;
    border-radius: 4px;
    background: var(--bg-surface-hover);
    color: var(--accent-primary);
    border: 1px solid var(--accent-primary);
    font-size: 11.5px;
    font-weight: 600;
    cursor: pointer;
  }

  .arrow {
    font-size: 9px;
  }

  .add-panel-dropdown {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.2);
    min-width: 170px;
    z-index: 100;
    display: flex;
    flex-direction: column;
    padding: 4px 0;
  }

  .dropdown-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    font-size: 12px;
    color: var(--text-main);
    background: transparent;
    border: none;
    cursor: pointer;
    text-align: left;
    width: 100%;
  }

  .dropdown-item:hover {
    background: var(--bg-surface-hover);
    color: var(--accent-primary);
  }

  .reset-btn {
    background: transparent;
    border: none;
    font-size: 13px;
    color: var(--text-muted);
    cursor: pointer;
    padding: 3px 5px;
    border-radius: 4px;
  }

  .reset-btn:hover {
    background: var(--bg-surface-hover);
    color: var(--text-main);
  }

  /* 网格视口 */
  .dock-grid-viewport {
    flex: 1;
    min-width: 0;
    min-height: 0;
    position: relative;
    overflow: hidden;
  }
</style>
