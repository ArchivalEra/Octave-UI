<!-- src/components/dock/panels/VariableInspectorPanel.svelte -->
<script lang="ts">
  import { projectWorkspace, supervisor, variableInspectorStore, t } from '../../../modules/appContext';
  import { ProjectWorkspace } from '../../../modules/workspace/ProjectWorkspace';
  import type { WorkspaceVariable } from '../../../modules/engine/types';

  let variables = $state<WorkspaceVariable[]>(projectWorkspace.variables);

  $effect(() => {
    const unsub = projectWorkspace.subscribe(() => {
      variables = projectWorkspace.variables;
    });
    return unsub;
  });

  async function handleVarClick(v: WorkspaceVariable) {
    const detail = await variableInspectorStore.inspect(v, supervisor);
    variableInspectorStore.open(detail);
  }

  function refresh() {
    projectWorkspace.syncVariables();
  }
</script>

<div class="variable-inspector-panel" role="region" aria-label={t('dock.panel_variables')}>
  <div class="panel-header">
    <div class="header-title">
      <span>📊</span>
      <span>{t('workspace.title', { count: variables.length })}</span>
    </div>
    <button class="refresh-btn" onclick={refresh} title={t('workspace.refresh')}>
      🔄
    </button>
  </div>

  <div class="table-container">
    {#if variables.length === 0}
      <div class="empty-state">
        <span>{t('workspace.empty')}</span>
      </div>
    {:else}
      <table class="data-table">
        <thead>
          <tr>
            <th>{t('workspace.col_name')}</th>
            <th>{t('workspace.col_type')}</th>
            <th>{t('workspace.col_dimensions')}</th>
            <th>{t('workspace.col_size')}</th>
          </tr>
        </thead>
        <tbody>
          {#each variables as v (v.name)}
            <tr onclick={() => handleVarClick(v)} title="Click to inspect variable">
              <td class="var-name">{v.name}</td>
              <td class="var-class">{v.class}</td>
              <td class="var-dim">{ProjectWorkspace.formatSize(v.size)}</td>
              <td class="var-size">{ProjectWorkspace.formatBytes(v.bytes)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>
</div>

<style>
  .variable-inspector-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    background: var(--bg-surface);
    overflow: hidden;
    box-sizing: border-box;
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    background: var(--bg-surface-hover);
    border-bottom: 1px solid var(--border-subtle);
    font-size: 12px;
    font-weight: 600;
    flex-shrink: 0;
  }

  .header-title {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--text-main);
  }

  .refresh-btn {
    background: transparent;
    border: none;
    cursor: pointer;
    font-size: 12px;
    color: var(--text-muted);
    padding: 2px 4px;
    border-radius: 4px;
  }

  .refresh-btn:hover {
    background: var(--bg-surface);
  }

  .table-container {
    flex: 1;
    overflow: auto;
  }

  .data-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 11.5px;
    text-align: left;
  }

  .data-table th {
    position: sticky;
    top: 0;
    background: var(--bg-surface-hover);
    padding: 6px 10px;
    font-weight: 600;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border-subtle);
    white-space: nowrap;
    z-index: 10;
  }

  .data-table td {
    padding: 6px 10px;
    border-bottom: 1px solid var(--border-subtle);
    color: var(--text-main);
    white-space: nowrap;
  }

  .data-table tbody tr {
    cursor: pointer;
    transition: background 0.1s;
  }

  .data-table tbody tr:hover {
    background: var(--bg-surface-hover);
  }

  .var-name {
    font-weight: 600;
    color: var(--accent-primary);
    font-family: var(--font-mono, ui-monospace, monospace);
  }

  .empty-state {
    padding: 32px 16px;
    text-align: center;
    font-size: 12px;
    color: var(--text-muted);
  }
</style>
