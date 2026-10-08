<script lang="ts">
  import { supervisor, projectWorkspace, t } from '../modules/appContext';

  let { isOpen, onClose } = $props<{
    isOpen: boolean;
    onClose: () => void;
  }>();

  let activeLane = $state(projectWorkspace.activeLane);
  let coiStatus = $state(false);
  let sabStatus = $state(false);

  $effect(() => {
    const unsub = projectWorkspace.subscribe(() => {
      activeLane = projectWorkspace.activeLane;
    });
    if (typeof window !== 'undefined') {
      coiStatus = window.crossOriginIsolated === true;
      sabStatus = typeof SharedArrayBuffer !== 'undefined';
    }
    return unsub;
  });

  const laneDisplay = $derived.by(() => {
    switch (activeLane) {
      case 'wasm32-final':
        return {
          name: 'wasm32-final',
          gear: 'base (32-bit)',
        };
      case 'master':
        return {
          name: 'master',
          gear: 'w64 (64-bit + threads)',
        };
      case 'IllegalPerformance':
        return {
          name: 'IllegalPerformance',
          gear: 'w64 (mimalloc + SIMD)',
        };
      default:
        return {
          name: activeLane,
          gear: activeLane,
        };
    }
  });
</script>

{#if isOpen}
  <div class="modal-overlay" onclick={onClose} role="dialog" aria-modal="true">
    <div class="modal-card" onclick={(e) => e.stopPropagation()}>
      <div class="modal-header">
        <h2 class="title">{t('diagnostics.title')}</h2>
        <button class="btn-close" onclick={onClose} aria-label="Close">✕</button>
      </div>

      <div class="modal-body">
        <p class="desc">{t('diagnostics.desc')}</p>

        <div class="meta-grid">
          <div class="meta-item">
            <span class="label">{t('diagnostics.active_lane')}</span>
            <span class="val badge">{laneDisplay.name}</span>
          </div>

          <div class="meta-item">
            <span class="label">{t('diagnostics.gear')}</span>
            <span class="val font-mono">{laneDisplay.gear}</span>
          </div>

          <div class="meta-item">
            <span class="label">{t('diagnostics.epoch')}</span>
            <span class="val font-mono">{supervisor.epoch}</span>
          </div>

          <div class="meta-item">
            <span class="label">{t('diagnostics.coi_status')}</span>
            <span class="val" class:pass={coiStatus} class:fail={!coiStatus}>
              {coiStatus ? t('diagnostics.coi_active') : t('diagnostics.coi_inactive')}
            </span>
          </div>

          <div class="meta-item">
            <span class="label">{t('diagnostics.sab_status')}</span>
            <span class="val" class:pass={sabStatus} class:fail={!sabStatus}>
              {sabStatus ? 'AVAILABLE' : 'UNAVAILABLE'}
            </span>
          </div>
        </div>

        {#if !coiStatus}
          <div class="coi-notice">
            <span>{t('diagnostics.coi_notice')}</span>
          </div>
        {/if}

        <div class="lane-switcher-box">
          <h3 class="box-title">{t('diagnostics.lane_specs')}</h3>
          <div class="lanes-nav">
            <div
              class="lane-link"
              class:active={laneBadge === 'wasm32-final'}
            >
              <div class="lane-title-row">
                <strong>wasm32-final</strong>
                {#if laneBadge === 'wasm32-final'}
                  <span class="active-tag">{t('diagnostics.current_active')}</span>
                {/if}
              </div>
              <small>{t('diagnostics.spec_wasm32')}</small>
            </div>
            <div
              class="lane-link"
              class:active={laneBadge === 'master'}
            >
              <div class="lane-title-row">
                <strong>master</strong>
                {#if laneBadge === 'master'}
                  <span class="active-tag">{t('diagnostics.current_active')}</span>
                {/if}
              </div>
              <small>{t('diagnostics.spec_master')}</small>
            </div>
            <div
              class="lane-link"
              class:active={laneBadge === 'IllegalPerformance'}
            >
              <div class="lane-title-row">
                <strong>IllegalPerformance</strong>
                {#if laneBadge === 'IllegalPerformance'}
                  <span class="active-tag">{t('diagnostics.current_active')}</span>
                {/if}
              </div>
              <small>{t('diagnostics.spec_illegal')}</small>
            </div>
          </div>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn-primary" onclick={onClose}>{t('diagnostics.close')}</button>
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
    max-width: 580px;
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

  .desc {
    margin: 0;
    font-size: 0.85rem;
    color: var(--text-muted);
  }

  .meta-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 10px;
    background: var(--bg-surface-hover);
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    padding: 12px 16px;
  }

  .meta-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.85rem;
  }

  .label {
    color: var(--text-muted);
  }

  .val {
    color: var(--text-main);
    font-weight: 500;
  }

  .badge {
    background: rgba(56, 139, 253, 0.15);
    color: var(--accent-primary);
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 0.8rem;
  }

  .pass {
    color: var(--accent-success);
    font-weight: 600;
  }

  .fail {
    color: var(--accent-danger);
    font-weight: 600;
  }

  .font-mono {
    font-family: var(--font-mono, monospace);
  }

  .coi-notice {
    padding: 8px 12px;
    background: rgba(56, 139, 253, 0.08);
    border: 1px solid rgba(56, 139, 253, 0.25);
    border-radius: 6px;
    font-size: 0.8rem;
    color: var(--text-muted);
    line-height: 1.45;
  }

  .lane-switcher-box {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .box-title {
    margin: 0;
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--text-main);
  }

  .lanes-nav {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }

  .lane-link {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    background: var(--bg-surface-hover);
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    padding: 8px;
    text-decoration: none;
    color: var(--text-main);
    transition: all 0.15s ease;
  }

  .lane-link:hover {
    border-color: var(--accent-primary);
    background: var(--bg-surface);
  }

  .lane-link.active {
    border-color: var(--accent-primary);
    background: rgba(56, 139, 253, 0.15);
  }

  .lane-link strong {
    font-size: 0.85rem;
  }

  .lane-title-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .active-tag {
    font-size: 0.65rem;
    padding: 1px 5px;
    border-radius: 3px;
    background: var(--accent-primary);
    color: #ffffff;
    font-weight: 600;
  }

  .lane-link small {
    font-size: 0.7rem;
    color: var(--text-muted);
    margin-top: 2px;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    padding: 12px 20px;
    border-top: 1px solid var(--border-subtle);
    background: var(--bg-surface-hover);
  }

  .btn-primary {
    background: var(--accent-primary);
    color: #ffffff;
    border: none;
    padding: 6px 16px;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
  }
</style>
