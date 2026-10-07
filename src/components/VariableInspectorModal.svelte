<!-- src/components/VariableInspectorModal.svelte -->
<script lang="ts">
  import { variableInspectorStore, workbenchController, supervisor, t } from '../modules/appContext';
  import type { VariableDetail } from '../modules/inspector/types';

  let isOpen = $state(variableInspectorStore.isOpen);
  let v = $state<VariableDetail | null>(variableInspectorStore.selectedVar);

  $effect(() => {
    const unsub = variableInspectorStore.subscribe(() => {
      isOpen = variableInspectorStore.isOpen;
      v = variableInspectorStore.selectedVar;
    });
    return unsub;
  });

  function handleClose() {
    variableInspectorStore.close();
  }

  function handlePlot() {
    if (!v) return;
    const plotCode = `plot(${v.name});`;
    if (workbenchController.mode === 'notebook') {
      const cell = workbenchController.addCell(plotCode);
      workbenchController.executeCell(cell.id, supervisor);
    } else {
      supervisor.eval(plotCode);
    }
    handleClose();
  }

  function handleCopy() {
    if (!v || typeof navigator === 'undefined') return;
    navigator.clipboard?.writeText(v.name);
    handleClose();
  }

  async function handleTranspose() {
    if (!v) return;
    const transposeCode = `${v.name} = ${v.name}.';`;
    await supervisor.eval(transposeCode);
    await supervisor.getWorkspace();
    handleClose();
  }
</script>

{#if isOpen && v}
  <div class="modal-overlay" onclick={handleClose} role="dialog" aria-modal="true">
    <div class="modal-card" onclick={(e) => e.stopPropagation()}>
      <div class="modal-header">
        <h2 class="title">{t('inspector.title', { name: v.name })}</h2>
        <button class="btn-close" onclick={handleClose} aria-label="Close">✕</button>
      </div>

      <div class="modal-body">
        <!-- 元数据概要 -->
        <div class="meta-row">
          <div class="meta-pill"><strong>Type:</strong> {v.class}</div>
          <div class="meta-pill"><strong>Dimensions:</strong> {v.size}</div>
          <div class="meta-pill"><strong>Memory:</strong> {v.bytes} B</div>
        </div>

        <!-- 数值统计分析 -->
        {#if v.stats}
          <div class="stats-box">
            <h3 class="box-title">{t('inspector.stats_title')}</h3>
            <div class="stats-grid">
              <div class="stat-item">
                <span class="label">{t('inspector.min')}</span>
                <span class="val font-mono">{v.stats.min.toFixed(4)}</span>
              </div>
              <div class="stat-item">
                <span class="label">{t('inspector.max')}</span>
                <span class="val font-mono">{v.stats.max.toFixed(4)}</span>
              </div>
              <div class="stat-item">
                <span class="label">{t('inspector.mean')}</span>
                <span class="val font-mono">{v.stats.mean.toFixed(4)}</span>
              </div>
            </div>
          </div>
        {/if}

        <!-- 矩阵预览网格 -->
        {#if v.previewGrid && v.previewGrid.length > 0}
          <div class="grid-box">
            <h3 class="box-title">{t('inspector.grid_preview')}</h3>
            <div class="table-container">
              <table class="data-table">
                <tbody>
                  {#each v.previewGrid as row}
                    <tr>
                      {#each row as val}
                        <td>{typeof val === 'number' ? val.toFixed(4) : val}</td>
                      {/each}
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          </div>
        {/if}

        <!-- 上下文动作按钮组 -->
        <div class="actions-row">
          {#if v.isNumeric}
            <button class="btn-action primary" onclick={handlePlot}>
              📈 {t('inspector.action_plot')}
            </button>
            <button class="btn-action" onclick={handleTranspose}>
              🔄 {t('inspector.action_transpose')}
            </button>
          {/if}
          <button class="btn-action" onclick={handleCopy}>
            📋 {t('inspector.action_copy')}
          </button>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn-close-action" onclick={handleClose}>{t('inspector.close')}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.65);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal-card {
    width: 90vw;
    max-width: 620px;
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5);
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    border-bottom: 1px solid var(--border-subtle);
  }

  .title {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 600;
    color: var(--text-main);
  }

  .btn-close {
    background: transparent;
    border: none;
    color: var(--text-muted);
    font-size: 1.25rem;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 4px;
  }

  .modal-body {
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .meta-row {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
  }

  .meta-pill {
    background: var(--bg-surface-hover);
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 0.8rem;
    color: var(--text-main);
    border: 1px solid var(--border-subtle);
  }

  .box-title {
    margin: 0 0 8px;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-main);
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    background: var(--bg-surface-hover);
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    padding: 10px 14px;
  }

  .stat-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .stat-item .label {
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .stat-item .val {
    font-size: 1rem;
    font-weight: 600;
    color: var(--accent-primary);
  }

  .table-container {
    max-height: 200px;
    overflow: auto;
    background: var(--bg-surface-hover);
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
  }

  .data-table {
    width: 100%;
    border-collapse: collapse;
    font-family: var(--font-mono, monospace);
    font-size: 0.8rem;
  }

  .data-table td {
    border: 1px solid var(--border-subtle);
    padding: 4px 8px;
    color: var(--text-main);
    text-align: right;
  }

  .actions-row {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: 4px;
  }

  .btn-action {
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    color: var(--text-main);
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 0.825rem;
    cursor: pointer;
  }

  .btn-action:hover {
    background: var(--bg-surface-hover);
  }

  .btn-action.primary {
    background: var(--accent-primary);
    color: #ffffff;
    font-weight: 600;
    border-color: transparent;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    padding: 12px 20px;
    border-top: 1px solid var(--border-subtle);
    background: var(--bg-surface-hover);
  }

  .btn-close-action {
    background: transparent;
    border: 1px solid var(--border-subtle);
    color: var(--text-muted);
    padding: 6px 16px;
    border-radius: 6px;
    font-size: 0.85rem;
    cursor: pointer;
  }

  .font-mono {
    font-family: var(--font-mono, monospace);
  }
</style>
