<!-- src/components/BootModal.svelte -->
<script lang="ts">
  import { supervisor } from '../modules/appContext';

  let { isOpen = false, onClose } = $props<{
    isOpen?: boolean;
    onClose: () => void;
  }>();

  let booting = $state(false);
  let statusText = $state('准备就绪，点击下方按钮开始按需加载。');
  let errorMsg = $state<string | null>(null);

  async function startBoot() {
    booting = true;
    errorMsg = null;
    statusText = '正在校验跨源隔离 (COI) 与 Memory64 支持…';

    try {
      statusText = '正在启动 64 位 WebAssembly 内核与初始化会话…';
      await supervisor.boot();

      statusText = 'GNU Octave 11.3.0 就绪！';
      setTimeout(() => {
        booting = false;
        onClose();
      }, 500);
    } catch (err: any) {
      booting = false;
      errorMsg = err.message || String(err);
      statusText = '启动失败，请检查浏览器控制台或网络配置。';
    }
  }
</script>

{#if isOpen}
  <div class="modal-backdrop" role="dialog" aria-modal="true">
    <div class="modal-card">
      <div class="modal-header">
        <h3 class="modal-title">启动 GNU Octave 引擎</h3>
        {#if !booting}
          <button class="btn-close" onclick={onClose}>×</button>
        {/if}
      </div>

      <div class="modal-body">
        <p class="desc">
          本项目为 <strong>100% 纯客户端本地计算</strong>。所有矩阵运算与科学计算均在浏览器端直接执行，无需任何后端计算服务器。
        </p>

        <div class="info-box">
          <div class="info-item">
            <span class="label">引擎版本：</span>
            <span class="val">GNU Octave 11.3.0</span>
          </div>
          <div class="info-item">
            <span class="label">运行档位：</span>
            <span class="val">Wasm64 多线程档 (Memory64 + Pthreads)</span>
          </div>
          <div class="info-item">
            <span class="label">资产体量：</span>
            <span class="val">~40.6 MB (Wasm 30.9MB + Data 9.7MB，按需单次加载)</span>
          </div>
          <div class="info-item">
            <span class="label">数据隐私：</span>
            <span class="val">代码与数据完全驻留本机内存与 IDBFS，不向云端外传</span>
          </div>
        </div>

        <div class="status-box">
          <div class="status-indicator" class:loading={booting}></div>
          <span class="status-info">{statusText}</span>
        </div>

        {#if errorMsg}
          <div class="error-box">
            {errorMsg}
          </div>
        {/if}
      </div>

      <div class="modal-footer">
        {#if !booting}
          <button class="btn" onclick={onClose}>取消</button>
        {/if}
        <button class="btn btn-primary" disabled={booting} onclick={startBoot}>
          {booting ? '正在启动…' : '立即启动引擎'}
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
