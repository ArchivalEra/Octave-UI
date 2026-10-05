<!-- src/components/HeaderBar.svelte -->
<script lang="ts">
  import { supervisor, themeManager, i18n, t } from '../modules/appContext';
  import type { SupervisorState } from '../modules/engine/types';
  import type { Locale } from '../modules/i18n/types';

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

  function handleLocaleChange(e: Event) {
    const target = e.currentTarget as HTMLSelectElement;
    i18n.setLocale(target.value as Locale);
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
    <span class="title">{t('header.title')} <span class="badge-lane">{t('header.badge_wasm64')}</span></span>
  </div>

  <div class="actions">
    <!-- 状态指示徽标 -->
    <div class="status-badge status-{state}">
      <span class="status-dot"></span>
      <span class="status-text">
        {#if state === 'unloaded'}
          {t('status.unloaded')}
        {:else if state === 'booting'}
          {t('status.booting')}
        {:else if state === 'idle'}
          {t('status.idle')}
        {:else if state === 'busy'}
          {t('status.busy')}
        {:else if state === 'aborting'}
          {t('status.aborting')}
        {:else if state === 'crashed'}
          {t('status.crashed')}
        {:else if state === 'recovering'}
          {t('status.recovering')}
        {:else if state === 'failed'}
          {t('status.failed')}
        {:else}
          {t('status.error')}
        {/if}
      </span>
    </div>

    <!-- 按需启动按钮 -->
    {#if state === 'unloaded'}
      <button class="btn btn-primary" onclick={onOpenBootModal} title={t('action.boot_tooltip')}>
        {t('action.boot')}
      </button>
    {/if}

    <!-- 协作式中断按钮 -->
    {#if state === 'busy'}
      <button class="btn btn-danger" onclick={handleInterrupt} title={t('action.interrupt_tooltip')}>
        {t('action.interrupt')}
      </button>
    {/if}

    <!-- 挂起杀死按钮 -->
    {#if state === 'aborting'}
      <button class="btn btn-danger" onclick={handleKill} title={t('action.kill_tooltip')}>
        {t('action.kill')}
      </button>
    {/if}

    <!-- 崩溃恢复按钮 -->
    {#if state === 'crashed'}
      <button class="btn btn-warning" onclick={handleRecover} title={t('action.recover_tooltip')}>
        {t('action.recover')}
      </button>
    {/if}

    <!-- 多语言切换 -->
    <div class="lang-selector">
      <select
        value={i18n.currentLocale}
        onchange={handleLocaleChange}
        class="lang-select"
        aria-label={t('header.select_language')}
        title={t('header.select_language')}
      >
        <option value="en">🌐 English</option>
        <option value="zh-Hans">🇨🇳 简体中文</option>
        <option value="de">🇩🇪 Deutsch</option>
      </select>
    </div>

    <!-- 主题切换 -->
    <button class="btn btn-icon" onclick={toggleTheme} title={t('header.theme_tooltip')}>
      {theme === 'dark' ? t('header.theme_light') : t('header.theme_dark')}
    </button>

    <!-- 侧边栏折叠按钮 -->
    <button class="btn btn-icon" onclick={onToggleSidebar} title={t('header.sidebar_tooltip')}>
      {sidebarOpen ? t('header.sidebar_hide') : t('header.sidebar_show')}
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
    gap: 12px;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    font-weight: 600;
    flex-shrink: 0;
  }

  .title {
    font-size: 15px;
    display: flex;
    align-items: center;
    gap: 8px;
    white-space: nowrap;
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
    gap: 8px;
    flex-shrink: 1;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .actions::-webkit-scrollbar {
    display: none;
  }

  .actions button,
  .actions select {
    white-space: nowrap;
    flex-shrink: 0;
  }

  .lang-selector {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  .lang-select {
    cursor: pointer;
    font-size: 12px;
    padding: 3px 8px;
    height: 28px;
    background: var(--bg-surface);
    color: var(--text-main);
    border: 1px solid var(--border-subtle);
    border-radius: 6px;
    font-family: inherit;
    transition: all 0.15s ease;
  }

  .lang-select:hover {
    border-color: var(--text-muted);
    background: var(--bg-surface-hover);
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
    white-space: nowrap;
    flex-shrink: 0;
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
