<script lang="ts">
  import { supervisor, themeManager, projectWorkspace, i18n, t } from '../modules/appContext';
  import type { SupervisorState, EngineLane } from '../modules/engine/types';
  import type { Locale } from '../modules/i18n/types';
  import type { WorkbenchMode } from '../modules/workspace/ProjectWorkspace';

  let {
    onOpenBootModal,
    onToggleSidebar,
    onOpenExamples,
    onOpenDiagnostics,
    sidebarOpen = true,
  } = $props<{
    onOpenBootModal: () => void;
    onToggleSidebar: () => void;
    onOpenExamples: () => void;
    onOpenDiagnostics: () => void;
    sidebarOpen?: boolean;
  }>();

  let state = $state<SupervisorState>(supervisor.state);
  let theme = $state<'dark' | 'light' | 'auto'>(themeManager.theme);
  let currentMode = $state<WorkbenchMode>(projectWorkspace.mode);
  let currentLane = $state<EngineLane>(projectWorkspace.activeLane);

  $effect(() => {
    const unsubState = supervisor.onStateChange((s) => {
      state = s;
    });
    const unsubTheme = themeManager.subscribe((t) => {
      theme = t;
    });
    const unsubPw = projectWorkspace.subscribe(() => {
      currentMode = projectWorkspace.mode;
      currentLane = projectWorkspace.activeLane;
    });

    return () => {
      unsubState();
      unsubTheme();
      unsubPw();
    };
  });

  function handleSwitchLane(targetLane: EngineLane) {
    if (state !== 'unloaded') return;
    if (currentLane === targetLane) return;
    projectWorkspace.selectLane(targetLane);
  }

  function handleInterrupt() {
    supervisor.abort(1500);
  }

  function handleKill() {
    supervisor.kill('user-kill');
  }

  function handleRecover() {
    supervisor.recover().catch(() => {});
  }

  function handleStop() {
    projectWorkspace.stopEngine();
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
  <!-- 品牌区 -->
  <div class="brand">
    <svg class="logo" viewBox="0 0 100 100" width="28" height="28">
      <rect width="100" height="100" rx="20" fill="#005f87" />
      <circle cx="35" cy="50" r="16" fill="#f57900" />
      <circle cx="65" cy="50" r="16" fill="#73d216" />
      <circle cx="50" cy="50" r="10" fill="#ffffff" />
    </svg>
    <div class="brand-text">
      <span class="title">Octave Web</span>
      <span class="tagline">{t('header.brand_tag')}</span>
    </div>
  </div>

  <!-- 进程内 3 档引擎车道无缝切换 (wasm32-final / master / IllegalPerformance) -->
  <nav class="lane-switcher" aria-label="Backend lane switcher">
    <button
      type="button"
      class="lane-btn"
      class:active={currentLane === 'wasm32-final'}
      disabled={state !== 'unloaded'}
      onclick={() => handleSwitchLane('wasm32-final')}
      title={state !== 'unloaded' ? '计算已启动，禁止切换引擎（需先点击停止引擎）' : 'Wasm32 终极冻结基线 (跨源隔离/通用兼容)'}
    >
      wasm32-final
    </button>
    <button
      type="button"
      class="lane-btn"
      class:active={currentLane === 'master'}
      disabled={state !== 'unloaded'}
      onclick={() => handleSwitchLane('master')}
      title={state !== 'unloaded' ? '计算已启动，禁止切换引擎（需先点击停止引擎）' : 'Master 主线稳定基线 (Wasm64 + Pthreads)'}
    >
      master
    </button>
    <button
      type="button"
      class="lane-btn"
      class:active={currentLane === 'IllegalPerformance'}
      disabled={state !== 'unloaded'}
      onclick={() => handleSwitchLane('IllegalPerformance')}
      title={state !== 'unloaded' ? '计算已启动，禁止切换引擎（需先点击停止引擎）' : 'IllegalPerformance 极限性能 (mimalloc + FMA + Rust)'}
    >
      IllegalPerformance
    </button>
  </nav>

  <!-- 工作台视图模式切换器 (Notebook / Terminal) -->
  <nav class="mode-switcher" aria-label="Workbench mode">
    <button
      type="button"
      class="mode-btn"
      class:active={currentMode === 'notebook'}
      onclick={() => projectWorkspace.setMode('notebook')}
    >
      📓 {t('header.mode_notebook')}
    </button>
    <button
      type="button"
      class="mode-btn"
      class:active={currentMode === 'terminal'}
      onclick={() => projectWorkspace.setMode('terminal')}
    >
      💻 {t('header.mode_console')}
    </button>
  </nav>

  <!-- 动作与控制区 -->
  <div class="actions">
    <!-- 示例画廊触发按钮 -->
    <button class="btn btn-outline" onclick={onOpenExamples}>
      {t('header.btn_examples')}
    </button>

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

    <!-- 启动计算 / 停止引擎控制 -->
    {#if state === 'unloaded'}
      <button class="btn btn-primary" onclick={onOpenBootModal} title={t('action.boot_tooltip')}>
        {t('header.btn_start')}
      </button>
    {:else}
      <button class="btn btn-outline-danger" onclick={handleStop} title={t('action.stop_tooltip')}>
        🛑 {t('action.stop')}
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

    <!-- 诊断弹窗触发 -->
    <button class="btn btn-ghost" onclick={onOpenDiagnostics} title="Diagnostics">
      {t('header.btn_diagnostics')}
    </button>

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
    height: 52px;
    background: var(--bg-surface, #1e1e2e);
    border-bottom: 1px solid var(--border-subtle, #313244);
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
    flex-shrink: 0;
  }

  .brand-text {
    display: flex;
    flex-direction: column;
  }

  .title {
    font-size: 15px;
    font-weight: 700;
    color: var(--text-primary, #cdd6f4);
    line-height: 1.2;
  }

  .tagline {
    font-size: 11px;
    color: var(--text-secondary, #a6adc8);
  }

  .lane-switcher {
    display: inline-flex;
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid var(--border-color, #313244);
    border-radius: 6px;
    padding: 2px;
    gap: 2px;
    flex-shrink: 0;
  }

  .lane-btn {
    background: transparent;
    border: none;
    cursor: pointer;
    text-decoration: none;
    font-size: 11px;
    padding: 3px 8px;
    border-radius: 4px;
    color: var(--text-secondary, #a6adc8);
    font-weight: 500;
    transition: all 0.15s ease;
    white-space: nowrap;
    display: inline-flex;
    align-items: center;
  }

  .lane-btn:hover {
    color: var(--text-primary, #cdd6f4);
    background: rgba(255, 255, 255, 0.05);
  }

  .lane-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
    color: var(--text-muted, #6c7086);
  }

  .lane-btn:disabled:hover {
    background: transparent;
    color: var(--text-muted, #6c7086);
  }

  .lane-btn.active {
    background: var(--bg-surface, #1e1e2e);
    color: var(--accent-primary, #89b4fa);
    font-weight: 600;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }

  .mode-switcher {
    display: flex;
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid var(--border-color, #313244);
    border-radius: 6px;
    padding: 2px;
    gap: 2px;
  }

  .mode-btn {
    background: transparent;
    border: none;
    color: var(--text-secondary, #a6adc8);
    padding: 4px 12px;
    border-radius: 4px;
    font-size: 0.825rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .mode-btn:hover {
    color: var(--text-primary, #cdd6f4);
  }

  .mode-btn.active {
    background: var(--bg-surface, #1e1e2e);
    color: var(--primary-color, #89b4fa);
    font-weight: 600;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .status-badge {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 12px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--border-color, #313244);
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .status-unloaded .status-dot { background: #6c7086; }
  .status-booting .status-dot { background: #f9e2af; animation: pulse 1s infinite; }
  .status-idle .status-dot { background: #a6e3a1; }
  .status-busy .status-dot { background: #89b4fa; animation: pulse 1s infinite; }
  .status-aborting .status-dot { background: #fab387; animation: pulse 0.5s infinite; }
  .status-crashed .status-dot { background: #f38ba8; }
  .status-recovering .status-dot { background: #cba6f7; animation: pulse 0.8s infinite; }
  .status-failed .status-dot { background: #f38ba8; }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }

  .btn {
    height: 30px;
    padding: 0 10px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    border: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: opacity 0.15s;
  }

  .btn:hover {
    opacity: 0.85;
  }

  .btn-primary {
    background: #007acc;
    color: #fff;
    font-weight: 600;
  }

  .btn-danger {
    background: #f38ba8;
    color: #11111b;
  }

  .btn-warning {
    background: #fab387;
    color: #11111b;
  }

  .btn-outline {
    background: rgba(137, 180, 250, 0.1);
    border: 1px solid rgba(137, 180, 250, 0.3);
    color: var(--primary-color, #89b4fa);
    font-weight: 600;
  }

  .btn-outline-danger {
    background: rgba(243, 139, 168, 0.1);
    border: 1px solid rgba(243, 139, 168, 0.4);
    color: #f38ba8;
    font-weight: 600;
  }

  .btn-outline-danger:hover {
    background: rgba(243, 139, 168, 0.2);
    border-color: #f38ba8;
  }

  .btn-ghost {
    background: transparent;
    border: 1px solid var(--border-color, #313244);
    color: var(--text-secondary, #a6adc8);
  }

  .btn-icon {
    background: transparent;
    color: var(--text-secondary, #a6adc8);
    padding: 0 6px;
    border: 1px solid var(--border-color, #313244);
  }

  .lang-select {
    background: rgba(0, 0, 0, 0.2);
    border: 1px solid var(--border-color, #313244);
    color: var(--text-primary, #cdd6f4);
    border-radius: 4px;
    height: 30px;
    font-size: 12px;
    padding: 0 4px;
    outline: none;
  }
</style>
