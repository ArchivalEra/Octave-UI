<!-- src/components/FigureWarningModal.svelte -->
<script lang="ts">
  import { terminalController, t } from '../modules/appContext';

  let {
    isOpen = false,
    command = '',
    reason = '',
    onClose,
  } = $props<{
    isOpen?: boolean;
    command?: string;
    reason?: string;
    onClose: () => void;
  }>();

  async function handleForceExecute() {
    onClose();
    if (command) {
      terminalController.setInput(command);
    }
    // 强制直接提交，绕过边界检测
    await terminalController.submit();
  }
</script>

{#if isOpen}
  <div class="modal-backdrop" role="dialog" aria-modal="true">
    <div class="modal-card">
      <div class="modal-header">
        <h3 class="modal-title">{t('figure.title')}</h3>
        <button class="btn-close" onclick={onClose}>×</button>
      </div>

      <div class="modal-body">
        <div class="cmd-preview">
          <code>{command}</code>
        </div>

        <p class="warning-text">
          {reason || t('figure.default_reason')}
        </p>

        <div class="details-box">
          <strong>{t('figure.details_title')}</strong>
          <p>{t('figure.details_p1')}</p>
          <p>{t('figure.details_p2')}</p>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn btn-primary" onclick={onClose}>
          {t('figure.btn_cancel')}
        </button>
        <button class="btn btn-outline-danger" onclick={handleForceExecute}>
          {t('figure.btn_force')}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: var(--bg-overlay);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    backdrop-filter: blur(2px);
  }

  .modal-card {
    background: var(--bg-surface);
    border: 1px solid var(--accent-warning);
    border-radius: 8px;
    width: 90%;
    max-width: 500px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border-subtle);
    background: rgba(210, 153, 34, 0.1);
  }

  .modal-title {
    font-size: 15px;
    font-weight: 600;
    color: var(--accent-warning);
  }

  .btn-close {
    background: transparent;
    border: none;
    font-size: 18px;
    color: var(--text-muted);
    padding: 0 4px;
  }

  .modal-body {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .cmd-preview {
    background: var(--bg-canvas);
    border: 1px solid var(--border-muted);
    padding: 8px 12px;
    border-radius: 6px;
    font-family: monospace;
    font-size: 13px;
    color: var(--accent-warning);
  }

  .warning-text {
    font-size: 13px;
    color: var(--text-main);
    line-height: 1.5;
  }

  .details-box {
    background: var(--bg-canvas);
    border: 1px solid var(--border-muted);
    border-radius: 6px;
    padding: 10px 12px;
    font-size: 12px;
    color: var(--text-muted);
    line-height: 1.5;
  }

  .details-box code {
    color: var(--accent-primary);
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid var(--border-subtle);
    background: var(--bg-canvas);
  }

  .btn-primary {
    background: var(--accent-primary);
    color: #fff;
    border-color: var(--accent-primary);
  }

  .btn-outline-danger {
    background: transparent;
    color: var(--accent-danger);
    border-color: var(--accent-danger);
  }
</style>
