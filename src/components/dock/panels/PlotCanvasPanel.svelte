<!-- src/components/dock/panels/PlotCanvasPanel.svelte -->
<script lang="ts">
  import { graphicsSink, t } from '../../../modules/appContext';

  let currentFigure = $state<string | null>(null);

  $effect(() => {
    const unsub = graphicsSink.onFigure((fig) => {
      if (fig?.imageDataUrl) {
        currentFigure = fig.imageDataUrl;
      }
    });
    return unsub;
  });

  function downloadPng() {
    if (!currentFigure) return;
    const a = document.createElement('a');
    a.href = currentFigure;
    a.download = `octave-plot-${Date.now()}.png`;
    a.click();
  }

  function clearFigure() {
    currentFigure = null;
  }
</script>

<div class="plot-canvas-panel" role="region" aria-label={t('dock.panel_plots')}>
  <div class="canvas-toolbar">
    <div class="toolbar-title">
      <span>📈</span>
      <span>{t('dock.panel_plots')}</span>
    </div>
    <div class="toolbar-actions">
      {#if currentFigure}
        <button class="action-btn" onclick={downloadPng} title={t('workbench.download_figure')}>
          💾 {t('workbench.download_figure')}
        </button>
        <button class="action-btn" onclick={clearFigure} title={t('workbench.clear')}>
          🧹
        </button>
      {/if}
    </div>
  </div>

  <div class="canvas-viewport">
    {#if currentFigure}
      <div class="figure-wrapper">
        <img src={currentFigure} alt="Octave / OMC Plot Output" class="figure-img" />
      </div>
    {:else}
      <div class="empty-canvas">
        <div class="empty-icon">📈</div>
        <div class="empty-title">{t('dock.panel_plots')}</div>
        <div class="empty-hint">plot(sin(linspace(0, 2*pi, 100)))</div>
      </div>
    {/if}
  </div>
</div>

<style>
  .plot-canvas-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    background: var(--bg-surface);
    overflow: hidden;
    box-sizing: border-box;
  }

  .canvas-toolbar {
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

  .toolbar-title {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--text-main);
  }

  .toolbar-actions {
    display: flex;
    gap: 6px;
  }

  .action-btn {
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: 4px;
    padding: 3px 8px;
    font-size: 11px;
    cursor: pointer;
    color: var(--text-main);
  }

  .action-btn:hover {
    background: var(--bg-surface-hover);
  }

  .canvas-viewport {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: auto;
    padding: 16px;
    background: var(--bg-terminal);
  }

  .figure-wrapper {
    max-width: 100%;
    max-height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
    border-radius: 6px;
    overflow: hidden;
    background: var(--figure-canvas);
  }

  .figure-img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    display: block;
  }

  .empty-canvas {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    color: var(--text-muted);
  }

  .empty-icon {
    font-size: 32px;
    opacity: 0.5;
  }

  .empty-title {
    font-size: 13px;
    font-weight: 600;
  }

  .empty-hint {
    font-size: 11px;
    font-family: var(--font-mono, monospace);
    opacity: 0.7;
    background: var(--bg-surface);
    padding: 4px 8px;
    border-radius: 4px;
  }
</style>
