<!-- src/components/ToastContainer.svelte -->
<script lang="ts">
  import { toastService } from '../modules/ui/ToastService.svelte';
</script>

{#if toastService.toasts.length > 0}
  <div class="toast-container" aria-live="polite">
    {#each toastService.toasts as toast (toast.id)}
      <div class="toast-card {toast.type}" role="alert">
        <div class="toast-header">
          {#if toast.title}
            <span class="toast-title">{toast.title}</span>
          {/if}
          {#if toast.code}
            <span class="toast-code-badge">{toast.code}</span>
          {/if}
          <button
            type="button"
            class="toast-close-btn"
            onclick={() => toastService.dismiss(toast.id)}
            aria-label="Close"
          >✕</button>
        </div>
        <div class="toast-body">{toast.message}</div>
      </div>
    {/each}
  </div>
{/if}

<style>
  .toast-container {
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 99999;
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-width: 420px;
    pointer-events: none;
  }

  .toast-card {
    pointer-events: auto;
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    padding: 12px 16px;
    box-shadow: var(--shadow-3);
    display: flex;
    flex-direction: column;
    gap: 6px;
    animation: toast-in 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  }

  @keyframes toast-in {
    from {
      opacity: 0;
      transform: translateY(12px) scale(0.97);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  .toast-card.error {
    border-left: 4px solid var(--accent-danger);
  }

  .toast-card.warning {
    border-left: 4px solid var(--accent-warning);
  }

  .toast-card.success {
    border-left: 4px solid var(--accent-success);
  }

  .toast-card.info {
    border-left: 4px solid var(--accent-primary);
  }

  .toast-header {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .toast-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-main);
    flex: 1;
  }

  .toast-code-badge {
    font-size: 10px;
    font-family: var(--font-mono);
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 4px;
    background: var(--bg-canvas);
    color: var(--text-muted);
    border: 1px solid var(--border-subtle);
  }

  .toast-close-btn {
    background: transparent;
    border: none;
    color: var(--text-muted);
    font-size: 12px;
    cursor: pointer;
    padding: 2px 4px;
    border-radius: 4px;
  }

  .toast-close-btn:hover {
    color: var(--text-main);
    background: var(--bg-surface-hover);
  }

  .toast-body {
    font-size: 12px;
    line-height: 1.5;
    color: var(--text-muted);
    word-break: break-word;
  }
</style>
