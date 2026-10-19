<!-- src/components/dock/panels/HistoryPanel.svelte -->
<script lang="ts">
  import { historyStore, terminalController, t } from '../../../modules/appContext';

  let historySearch = $state('');
  let historyList = $state<string[]>(historyStore.getAll());

  let filteredHistory = $derived(
    historySearch.trim()
      ? historyList.filter((item) => item.toLowerCase().includes(historySearch.toLowerCase()))
      : historyList
  );

  $effect(() => {
    const unsub = historyStore.subscribe((items) => {
      historyList = items;
    });
    return unsub;
  });

  function handleHistoryClick(cmd: string) {
    terminalController.setInput(cmd);
  }

  function handleHistoryClear() {
    historyStore.clear();
    historyList = [];
  }
</script>

<div class="history-panel" role="region" aria-label={t('dock.panel_history')}>
  <div class="history-toolbar">
    <input
      type="text"
      class="search-input"
      placeholder={t('history.search_placeholder')}
      bind:value={historySearch}
    />
    <button class="clear-btn" onclick={handleHistoryClear} title={t('history.clear')}>
      🧹
    </button>
  </div>

  <div class="history-list">
    {#if filteredHistory.length === 0}
      <div class="empty-state">{t('history.empty')}</div>
    {:else}
      {#each filteredHistory as cmd, idx (idx)}
        <div
          class="history-item"
          onclick={() => handleHistoryClick(cmd)}
          onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleHistoryClick(cmd); }}
          title={t('history.item_tooltip')}
          role="button"
          tabindex="0"
        >
          <span class="history-icon">&gt;</span>
          <span class="history-text">{cmd}</span>
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
  .history-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    background: var(--bg-surface);
    overflow: hidden;
    box-sizing: border-box;
  }

  .history-toolbar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    background: var(--bg-surface-hover);
    border-bottom: 1px solid var(--border-subtle);
    flex-shrink: 0;
  }

  .search-input {
    flex: 1;
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: 4px;
    padding: 4px 8px;
    font-size: 11.5px;
    color: var(--text-main);
    outline: none;
  }

  .clear-btn {
    background: transparent;
    border: none;
    cursor: pointer;
    font-size: 12px;
    color: var(--text-muted);
    padding: 2px 4px;
  }

  .history-list {
    flex: 1;
    overflow-y: auto;
    padding: 6px 0;
  }

  .history-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 12px;
    font-size: 12px;
    font-family: var(--font-mono, monospace);
    color: var(--text-main);
    cursor: pointer;
    transition: background 0.1s;
    user-select: none;
  }

  .history-item:hover {
    background: var(--bg-surface-hover);
  }

  .history-icon {
    color: var(--accent-primary);
    font-weight: bold;
    font-size: 11px;
  }

  .history-text {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .empty-state {
    padding: 32px 16px;
    text-align: center;
    font-size: 12px;
    color: var(--text-muted);
  }
</style>
