<!-- src/components/BootModal.svelte -->
<script lang="ts">
  import { supervisor, projectWorkspace, t } from '../modules/appContext';

  let { isOpen = false, onClose } = $props<{
    isOpen?: boolean;
    onClose: () => void;
  }>();

  type BootStep = 'ready' | 'checking' | 'starting' | 'success' | 'failed';
  let booting = $state(false);
  let bootStep = $state<BootStep>('ready');
  let errorMsg = $state<string | null>(null);

  let activeLane = $state(projectWorkspace.activeLane);

  $effect(() => {
    const unsub = projectWorkspace.subscribe(() => {
      activeLane = projectWorkspace.activeLane;
    });
    return unsub;
  });

  const laneInfo = $derived.by(() => {
    switch (activeLane) {
      case 'wasm32-final':
        return {
          name: 'wasm32-final',
          mode: 'Wasm32 通用兼容档 (32-bit Memory)',
          size: '~39.3 MB',
        };
      case 'master':
        return {
          name: 'master',
          mode: 'Master 主线稳定档 (WebAssembly / 线程)',
          size: '~40.7 MB',
        };
      case 'IllegalPerformance':
        return {
          name: 'IllegalPerformance',
          mode: 'IllegalPerformance 极限性能档 (mimalloc 优化编译)',
          size: '~40.7 MB',
        };
      default:
        return {
          name: activeLane,
          mode: `${activeLane} 档`,
          size: '按需加载',
        };
    }
  });

  async function startBoot() {
    booting = true;
    errorMsg = null;
    bootStep = 'checking';

    try {
      bootStep = 'starting';
      await supervisor.boot({ lane: activeLane });

      bootStep = 'success';
      setTimeout(() => {
        booting = false;
        bootStep = 'ready';
        onClose();
      }, 500);
    } catch (err: any) {
      booting = false;
      errorMsg = err.message || String(err);
      bootStep = 'failed';
    }
  }
</script>

{#if isOpen}
  <div class="modal-backdrop" role="dialog" aria-modal="true">
    <div class="modal-card">
      <div class="modal-header">
        <h3 class="modal-title">{t('boot.title')}</h3>
        {#if !booting}
          <button class="btn-close" onclick={onClose}>×</button>
        {/if}
      </div>

      <div class="modal-body">
        <p class="desc">{t('boot.desc')}</p>

        <div class="info-box">
          <div class="info-item">
            <span class="label">{t('boot.engine_version_label')}</span>
            <span class="val">GNU Octave 11.3.0</span>
          </div>
          <div class="info-item">
            <span class="label">{t('boot.runtime_mode_label')}</span>
            <span class="val">{laneInfo.mode}</span>
          </div>
          <div class="info-item">
            <span class="label">{t('boot.asset_size_label')}</span>
            <span class="val">{laneInfo.size}</span>
          </div>
          <div class="info-item">
            <span class="label">{t('boot.data_privacy_label')}</span>
            <span class="val">{t('boot.data_privacy_val')}</span>
          </div>
        </div>

        <div class="status-box">
          <div class="status-indicator" class:loading={booting}></div>
          <span class="status-info">
            {#if bootStep === 'ready'}
              {t('boot.status_ready')}
            {:else if bootStep === 'checking'}
              {t('boot.status_checking')}
            {:else if bootStep === 'starting'}
              {t('boot.status_starting')}
            {:else if bootStep === 'success'}
              {t('boot.status_success')}
            {:else}
              {t('boot.status_failed')}
            {/if}
          </span>
        </div>

        {#if errorMsg}
          <div class="error-box">
            {errorMsg}
          </div>
        {/if}
      </div>

      <div class="modal-footer">
        {#if !booting}
          <button class="btn" onclick={onClose}>{t('boot.cancel')}</button>
        {/if}
        <button class="btn btn-primary" disabled={booting} onclick={startBoot}>
          {booting ? t('boot.starting') : t('boot.start')}
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
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    width: 90%;
    max-width: 520px;
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
  }

  .modal-title {
    font-size: 15px;
    font-weight: 600;
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

  .desc {
    color: var(--text-muted);
    font-size: 13px;
    line-height: 1.5;
  }

  .info-box {
    background: var(--bg-canvas);
    border: 1px solid var(--border-muted);
    border-radius: 6px;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 12px;
  }

  .info-item {
    display: flex;
    justify-content: space-between;
  }

  .label {
    color: var(--text-muted);
  }

  .val {
    font-weight: 500;
  }

  .status-box {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    background: var(--bg-canvas);
    border-radius: 6px;
    font-size: 12px;
  }

  .status-indicator {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--accent-success);
    flex-shrink: 0;
  }

  .status-indicator.loading {
    background: var(--accent-warning);
    animation: spin-pulse 0.8s infinite linear alternate;
  }

  @keyframes spin-pulse {
    from { opacity: 0.3; transform: scale(0.8); }
    to { opacity: 1; transform: scale(1.1); }
  }

  .error-box {
    padding: 8px 12px;
    background: rgba(248, 81, 73, 0.15);
    border: 1px solid var(--accent-danger);
    color: var(--accent-danger);
    border-radius: 6px;
    font-size: 12px;
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
</style>
