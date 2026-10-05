<!-- src/components/HeaderBar.svelte -->
<script lang="ts">
  import { supervisor, themeManager } from '../modules/appContext';
  import type { SupervisorState } from '../modules/engine/types';

  let { onOpenBootModal, onToggleSidebar, sidebarOpen = true } = $props<{
    onOpenBootModal: () => void;
    onToggleSidebar: () => void;
    sidebarOpen?: boolean;
  }>();

  let state = $state<SupervisorState>(supervisor.state);
  let theme = $state<'dark' | 'light' | 'auto'>(themeManager.theme);

  $effect(() => {
    const unsubState = supervisor.onStateChange((s) => {
      state = s;
    });
    const unsubTheme = themeManager.subscribe((t) => {
      theme = t;
    });
    return () => {
      unsubState();
      unsubTheme();
    };
  });

  function handleInterrupt() {
    supervisor.abort(1500);
  }

  function handleKill() {
    supervisor.kill('user-kill');
  }

  function handleRecover() {
    supervisor.recover().catch(() => {});
  }

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    themeManager.setTheme(next);
  }
</script>

<header class="header-bar">
  <div class="brand">
    <svg class="logo" viewBox="0 0 100 100" width="24" height="24">
      <rect width="100" height="100" rx="20" fill="#005f87" />
      <circle cx="35" cy="50" r="16" fill="#f57900" />
      <circle cx="65" cy="50" r="16" fill="#73d216" />
      <circle cx="50" cy="50" r="10" fill="#ffffff" />
    </svg>
    <span class="title">GNU Octave 11.3.0 <span class="badge-lane">Wasm64</span></span>
  </div>

  <div class="actions">
    <!-- 状态指示徽标 -->
    <div class="status-badge status-{state}">
      <span class="status-dot"></span>
      <span class="status-text">
        {#if state === 'unloaded'}
          未就绪
        {:else if state === 'booting'}
          启动中…
        {:else if state === 'idle'}
          就绪 (Idle)
        {:else if state === 'busy'}
          计算中…
        {:else if state === 'aborting'}
          中断中…
        {:else if state === 'crashed'}
          已崩溃 (Crashed)
        {:else if state === 'recovering'}
          恢复中…
        {:else if state === 'failed'}
          不可用 (Failed)
        {:else}
          错误
        {/if}
      </span>
    </div>

    <!-- 按需启动按钮 -->
    {#if state === 'unloaded'}
      <button class="btn btn-primary" onclick={onOpenBootModal}>
        启动引擎 (Boot)
      </button>
    {/if}

    <!-- 协作式中断按钮 -->
    {#if state === 'busy'}
      <button class="btn btn-danger" onclick={handleInterrupt} title="协作式安全点中断">
        中断 (Interrupt)
      </button>
    {/if}

    <!-- 挂起杀死按钮 -->
    {#if state === 'aborting'}
      <button class="btn btn-danger" onclick={handleKill} title="强制杀死假死引擎">
        强制杀死 (Kill)
      </button>
    {/if}

    <!-- 崩溃恢复按钮 -->
    {#if state === 'crashed'}
      <button class="btn btn-warning" onclick={handleRecover} title="原地自愈恢复引擎">
        原地恢复 (Recover)
      </button>
    {/if}

    <!-- 主题切换 -->
    <button class="btn btn-icon" onclick={toggleTheme} title="切换浅色/深色主题">
      {theme === 'dark' ? '☀️ 浅色' : '🌙 深色'}
    </button>

    <!-- 侧边栏折叠按钮 -->
    <button class="btn btn-icon" onclick={onToggleSidebar} title="切换侧边栏">
      {sidebarOpen ? '⇥ 隐藏侧栏' : '⇤ 展开侧栏'}
    </button>
  </div>
</header>

<style>
  .header-bar {
    height: 48px;
    background: var(--bg-surface);
    border-bottom: 1px solid var(--border-subtle);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 16px;
    user-select: none;
    flex-shrink: 0;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    font-weight: 600;
  }

  .title {
    font-size: 15px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .badge-lane {
    font-size: 11px;
    background: var(--border-muted);
    color: var(--accent-primary);
    padding: 1px 6px;
    border-radius: 4px;
    border: 1px solid var(--border-subtle);
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .status-badge {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 3px 8px;
    border-radius: 12px;
    font-size: 12px;
    background: var(--bg-canvas);
    border: 1px solid var(--border-subtle);
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--text-dim);
  }

  .status-unloaded .status-dot {
    background: var(--text-dim);
  }

  .status-booting .status-dot {
    background: var(--accent-warning);
    animation: pulse 1s infinite alternate;
  }

  .status-idle .status-dot {
    background: var(--accent-success);
  }

  .status-busy .status-dot {
    background: var(--accent-warning);
    animation: pulse 0.5s infinite alternate;
  }

  .status-error .status-dot {
    background: var(--accent-danger);
  }

  .status-aborting .status-dot {
    background: var(--accent-danger);
    animation: pulse 0.3s infinite alternate;
  }

  .status-crashed .status-dot {
    background: var(--accent-danger);
  }

  .status-recovering .status-dot {
    background: var(--accent-warning);
    animation: pulse 0.5s infinite alternate;
  }

  .status-failed .status-dot {
    background: var(--accent-danger);
  }

  @keyframes pulse {
    from { opacity: 0.4; }
    to { opacity: 1; }
  }

  .btn-primary {
    background: var(--accent-primary);
    color: #fff;
    border-color: var(--accent-primary);
  }
  .btn-primary:hover {
    background: var(--accent-primary-hover);
  }

  .btn-danger {
    background: var(--accent-danger);
    color: #fff;
    border-color: var(--accent-danger);
  }

  .btn-warning {
    background: var(--accent-warning);
    color: #fff;
    border-color: var(--accent-warning);
  }
  .btn-warning:hover {
    opacity: 0.9;
  }
</style>
