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
    sidebarOpen = false,
  } = $props<{
    onOpenBootModal: () => void;
    onToggleSidebar: () => void;
    onOpenExamples: () => void;
    onOpenDiagnostics: () => void;
    sidebarOpen?: boolean;
  }>();

  let state = $state<SupervisorState>(supervisor.state);
  let theme = $state<'dark' | 'light' | 'auto'>(themeManager.theme);
  let currentHue = $state<number>(themeManager.hue);
  let currentFontSize = $state<number>(themeManager.fontSize);
  let currentMode = $state<WorkbenchMode>(projectWorkspace.mode);
  let currentLane = $state<EngineLane>(projectWorkspace.activeLane);
  let currentLocale = $state<Locale>(i18n.currentLocale);
  let isDirectoryMounted = $state<boolean>(projectWorkspace.isDirectoryMounted);
  let directoryName = $state<string | null>(projectWorkspace.directoryName);

  let menuOpen = $state(false);
  let paletteOpen = $state(false);

  const PRESET_HUES = [
    { name: '粉紫', hue: 315 },
    { name: '紫罗兰', hue: 280 },
    { name: '学术蓝', hue: 248 },
    { name: '青碧', hue: 195 },
    { name: '薄荷绿', hue: 155 },
    { name: '暖金', hue: 45 },
    { name: '落日橙', hue: 25 },
    { name: '朱砂红', hue: 355 },
  ];

  $effect(() => {
    const unsubState = supervisor.onStateChange((s) => {
      state = s;
    });
    const unsubTheme = themeManager.subscribe((t, h, fs) => {
      theme = t;
      currentHue = h;
      currentFontSize = fs;
    });
    const unsubPw = projectWorkspace.subscribe(() => {
      currentMode = projectWorkspace.mode;
      currentLane = projectWorkspace.activeLane;
      isDirectoryMounted = projectWorkspace.isDirectoryMounted;
      directoryName = projectWorkspace.directoryName;
    });
    const unsubI18n = i18n.subscribe((loc) => {
      currentLocale = loc;
    });

    function handleClickOutside(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest('.dropdown-container')) {
        menuOpen = false;
        paletteOpen = false;
      }
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('click', handleClickOutside);
    }

    return () => {
      unsubState();
      unsubTheme();
      unsubPw();
      unsubI18n();
      if (typeof window !== 'undefined') {
        window.removeEventListener('click', handleClickOutside);
      }
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

  function handleHueChange(e: Event) {
    const val = parseInt((e.target as HTMLInputElement).value, 10);
    themeManager.setHue(val);
  }

  function selectHuePreset(h: number) {
    themeManager.setHue(h);
  }

  function resetHue() {
    themeManager.resetHue();
  }

  function handleFontSizeChange(e: Event) {
    const val = parseInt((e.target as HTMLInputElement).value, 10);
    themeManager.setFontSize(val);
  }

  function resetFontSize() {
    themeManager.resetFontSize();
  }

  function handleLocaleChange(locale: Locale) {
    i18n.setLocale(locale);
    currentLocale = locale;
  }

  async function handleReselectDir() {
    try {
      await projectWorkspace.reselectDirectory();
    } catch (err: any) {
      alert(t('workbench.mount_error', { error: err?.message || String(err) }));
    } finally {
      menuOpen = false;
    }
  }

  function handleDisconnectDir() {
    projectWorkspace.disconnectDirectory();
  }
</script>

<header class="m3-top-app-bar">
  <!-- 左侧：侧栏开关 + 品牌与当前文件 + 视图模式切换胶囊 -->
  <div class="top-bar-left">
    <button
      class="m3-icon-btn sidebar-toggle-btn"
      onclick={onToggleSidebar}
      title={sidebarOpen ? t('header.sidebar_hide') : t('header.sidebar_show')}
      aria-label="Toggle Sidebar"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M3 12h18M3 6h18M3 18h18"/>
      </svg>
    </button>

    <div class="brand-group">
      <div class="brand">
        <svg class="logo" viewBox="0 0 100 100" width="24" height="24">
          <rect width="100" height="100" rx="20" fill="var(--md-sys-color-primary, #005f87)" />
          <circle cx="35" cy="50" r="16" fill="#f57900" />
          <circle cx="65" cy="50" r="16" fill="#73d216" />
          <circle cx="50" cy="50" r="10" fill="#ffffff" />
        </svg>
        <span class="brand-title">Octave Web</span>
      </div>
    </div>

    <!-- 视图模式切换器 (Notebook / Terminal) -->
    <nav class="m3-segmented-button" aria-label="Workbench mode">
      <button
        type="button"
        class="segment-btn"
        class:active={currentMode === 'notebook'}
        onclick={() => projectWorkspace.setMode('notebook')}
        title="交互式笔记本模式"
      >
        <span class="segment-icon">📓</span>
        <span class="segment-label">{t('header.mode_notebook')}</span>
      </button>
      <button
        type="button"
        class="segment-btn"
        class:active={currentMode === 'terminal'}
        onclick={() => projectWorkspace.setMode('terminal')}
        title="全功能终端控制台模式"
      >
        <span class="segment-icon">💻</span>
        <span class="segment-label">{t('header.mode_console')}</span>
      </button>
    </nav>
  </div>

  <!-- 右侧：状态指示 + 启动/停止主按钮 + Colab 风格 ⋮ 菜单 -->
  <div class="top-bar-right">
    <!-- 状态指示徽标 -->
    <div class="status-chip status-{state}" title="引擎运行期状态">
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

    <!-- 核心动作：启动 / 停止 -->
    {#if state === 'unloaded'}
      <button class="m3-filled-btn start-btn" onclick={onOpenBootModal} title={t('action.boot_tooltip')}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
        <span class="btn-text">{t('header.btn_start')}</span>
      </button>
    {:else}
      <button class="m3-tonal-danger-btn stop-btn" onclick={handleStop} title={t('action.stop_tooltip')}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <rect x="5" y="5" width="14" height="14" rx="2"/>
        </svg>
        <span class="btn-text">{t('action.stop')}</span>
      </button>
    {/if}

    <!-- 异常状态动作：中断 / 杀死 / 恢复 -->
    {#if state === 'busy'}
      <button class="m3-danger-btn" onclick={handleInterrupt} title={t('action.interrupt_tooltip')}>
        {t('action.interrupt')}
      </button>
    {/if}
    {#if state === 'aborting'}
      <button class="m3-danger-btn" onclick={handleKill} title={t('action.kill_tooltip')}>
        {t('action.kill')}
      </button>
    {/if}
    {#if state === 'crashed'}
      <button class="m3-warning-btn" onclick={handleRecover} title={t('action.recover_tooltip')}>
        {t('action.recover')}
      </button>
    {/if}

    <!-- 调色盘弹窗按钮 -->
    <div class="dropdown-container">
      <button
        class="m3-icon-btn palette-toggle-btn"
        onclick={(e) => { e.stopPropagation(); paletteOpen = !paletteOpen; menuOpen = false; }}
        title={t('header.palette_title')}
        aria-label="Theme Palette"
      >
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/>
          <circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/>
          <circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/>
          <circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/>
          <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>
        </svg>
      </button>

      {#if paletteOpen}
        <div class="m3-popover palette-popover" onclick={(e) => e.stopPropagation()}>
          <!-- 强调色调节 -->
          <div class="popover-header">
            <span class="popover-title">{t('header.palette_accent_title')}</span>
            <button class="icon-subtle-btn" onclick={resetHue} title={t('header.palette_reset_hue')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                <path d="M3 3v5h5"/>
              </svg>
            </button>
          </div>
          <div class="palette-current-row">
            <span class="hue-badge">Hue {currentHue}°</span>
            <div class="hue-dot" style="background-color: var(--md-sys-color-primary);"></div>
          </div>
          <div class="slider-box">
            <span class="slider-label">{t('header.palette_hue_slider')}</span>
            <input
              type="range"
              min="0"
              max="360"
              value={currentHue}
              oninput={handleHueChange}
              class="hue-range-slider"
            />
          </div>
          <div class="presets-section">
            <span class="presets-label">{t('header.palette_presets')}</span>
            <div class="presets-grid">
              {#each PRESET_HUES as p}
                <button
                  type="button"
                  class="preset-btn"
                  class:active={currentHue === p.hue}
                  onclick={() => selectHuePreset(p.hue)}
                >
                  <span class="preset-dot" style="background: hsl({p.hue}, 75%, 45%);"></span>
                  <span class="preset-name">{p.name}</span>
                </button>
              {/each}
            </div>
          </div>

          <div class="palette-divider"></div>

          <!-- 界面字号缩放 -->
          <div class="popover-header">
            <span class="popover-title">{t('header.font_size_title')}</span>
            <button class="icon-subtle-btn" onclick={resetFontSize} title={t('header.font_size_reset')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                <path d="M3 3v5h5"/>
              </svg>
            </button>
          </div>
          <div class="palette-current-row">
            <span class="hue-badge">{currentFontSize}px ({Math.round((currentFontSize / 14) * 100)}%)</span>
            <span class="font-preview-sample" style="font-size: {currentFontSize}px;">Aa</span>
          </div>
          <div class="slider-box">
            <span class="slider-label">{t('header.font_size_slider')}</span>
            <input
              type="range"
              min="12"
              max="20"
              step="1"
              value={currentFontSize}
              oninput={handleFontSizeChange}
              class="font-range-slider"
            />
          </div>
        </div>
      {/if}
    </div>

    <!-- 明暗切换按钮 -->
    <button
      class="m3-icon-btn theme-toggle-btn"
      onclick={toggleTheme}
      title={theme === 'dark' ? t('header.theme_light') : t('header.theme_dark')}
      aria-label="Toggle Theme"
    >
      {#if theme === 'dark'}
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
          <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
        </svg>
      {:else}
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
      {/if}
    </button>

    <!-- Colab 风格统一功能菜单 (⋮) -->
    <div class="dropdown-container">
      <button
        class="m3-icon-btn menu-toggle-btn"
        onclick={(e) => { e.stopPropagation(); menuOpen = !menuOpen; paletteOpen = false; }}
        title={t('header.menu_title')}
        aria-label="More Options"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
          <circle cx="12" cy="5" r="1.5" fill="currentColor"/>
          <circle cx="12" cy="19" r="1.5" fill="currentColor"/>
        </svg>
      </button>

      {#if menuOpen}
        <div class="m3-popover menu-popover" onclick={(e) => e.stopPropagation()}>
          <!-- 引擎车道切换区 -->
          <div class="menu-section">
            <span class="menu-section-title">⚙️ {t('header.engine_arch_title', { status: state !== 'unloaded' ? t('header.arch_locked') : t('header.arch_switchable') })}</span>
            <div class="lane-choice-group">
              <button
                type="button"
                class="menu-item-choice"
                class:selected={currentLane === 'wasm32-final'}
                disabled={state !== 'unloaded'}
                onclick={() => handleSwitchLane('wasm32-final')}
              >
                <div class="choice-text">
                  <span class="choice-title">wasm32-final</span>
                  <span class="choice-desc">{t('header.lane_wasm32_desc')}</span>
                </div>
                {#if currentLane === 'wasm32-final'}
                  <span class="check-mark">✓</span>
                {/if}
              </button>

              <button
                type="button"
                class="menu-item-choice"
                class:selected={currentLane === 'master'}
                disabled={state !== 'unloaded'}
                onclick={() => handleSwitchLane('master')}
              >
                <div class="choice-text">
                  <span class="choice-title">master</span>
                  <span class="choice-desc">{t('header.lane_master_desc')}</span>
                </div>
                {#if currentLane === 'master'}
                  <span class="check-mark">✓</span>
                {/if}
              </button>

              <button
                type="button"
                class="menu-item-choice"
                class:selected={currentLane === 'IllegalPerformance'}
                disabled={state !== 'unloaded'}
                onclick={() => handleSwitchLane('IllegalPerformance')}
              >
                <div class="choice-text">
                  <span class="choice-title">IllegalPerformance</span>
                  <span class="choice-desc">{t('header.lane_illegal_desc')}</span>
                </div>
                {#if currentLane === 'IllegalPerformance'}
                  <span class="check-mark">✓</span>
                {/if}
              </button>
            </div>
          </div>

          <div class="menu-divider"></div>

          <!-- 本地工程文件夹 -->
          <div class="menu-section">
            <span class="menu-section-title">📁 {t('header.folder_section_title')}</span>
            {#if isDirectoryMounted}
              <div class="menu-folder-card">
                <div class="menu-folder-info">
                  <span class="menu-folder-name" title={directoryName}>📁 {directoryName}</span>
                  <span class="menu-folder-badge">{t('sidebar.status_connected')}</span>
                </div>
                <div class="menu-folder-actions">
                  <button
                    type="button"
                    class="menu-sub-btn primary"
                    onclick={handleReselectDir}
                    title={t('workbench.reselect_dir_tooltip')}
                  >
                    🔄 {t('header.reselect_folder')}
                  </button>
                  <button
                    type="button"
                    class="menu-sub-btn danger"
                    onclick={() => { menuOpen = false; handleDisconnectDir(); }}
                    title={t('workbench.disconnect_dir')}
                  >
                    ✕ {t('header.disconnect_folder')}
                  </button>
                </div>
              </div>
            {:else}
              <button
                type="button"
                class="menu-action-btn"
                onclick={handleReselectDir}
              >
                <span class="action-icon">📁</span>
                <span>{t('header.open_folder')}</span>
              </button>
            {/if}
          </div>

          <div class="menu-divider"></div>

          <!-- 工具与弹窗 -->
          <div class="menu-section">
            <button class="menu-action-btn" onclick={() => { menuOpen = false; onOpenExamples(); }}>
              <span class="action-icon">💡</span>
              <span>{t('header.btn_examples')}</span>
            </button>

            <button class="menu-action-btn" onclick={() => { menuOpen = false; onOpenDiagnostics(); }}>
              <span class="action-icon">🔧</span>
              <span>{t('header.btn_diagnostics')}</span>
            </button>
          </div>

          <div class="menu-divider"></div>

          <!-- 多语言选项 -->
          <div class="menu-section">
            <span class="menu-section-title">🌐 {t('header.lang_section_title')}</span>
            <div class="lang-grid">
              <button
                type="button"
                class="lang-pill"
                class:active={currentLocale === 'zh-Hans'}
                onclick={() => handleLocaleChange('zh-Hans')}
              >
                🇨🇳 中文
              </button>
              <button
                type="button"
                class="lang-pill"
                class:active={currentLocale === 'en'}
                onclick={() => handleLocaleChange('en')}
              >
                🇺🇸 English
              </button>
              <button
                type="button"
                class="lang-pill"
                class:active={currentLocale === 'de'}
                onclick={() => handleLocaleChange('de')}
              >
                🇩🇪 Deutsch
              </button>
            </div>
          </div>
        </div>
      {/if}
    </div>
  </div>
</header>

<style>
  .m3-top-app-bar {
    height: 60px;
    background-color: var(--md-sys-color-surface-container-lowest, #ffffff);
    border-bottom: 1px solid var(--md-sys-color-outline-variant, rgba(0,0,0,0.1));
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 1rem;
    position: sticky;
    top: 0;
    z-index: 50;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    flex-shrink: 0;
    box-sizing: border-box;
    gap: 12px;
  }

  .top-bar-left {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-width: 0;
    flex: 1;
  }

  .brand-group {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .brand-title {
    font-size: 1.05rem;
    font-weight: 700;
    color: var(--md-sys-color-primary, #005f87);
    white-space: nowrap;
  }

  /* Segmented button (Notebook vs Console) */
  .m3-segmented-button {
    display: flex;
    background-color: var(--md-sys-color-surface-container, rgba(0,0,0,0.05));
    border: 1px solid var(--md-sys-color-outline-variant, rgba(0,0,0,0.1));
    border-radius: 9999px;
    padding: 3px;
    gap: 2px;
    flex-shrink: 0;
  }

  .segment-btn {
    background: transparent;
    border: none;
    color: var(--md-sys-color-on-surface-variant, #49454f);
    padding: 4px 12px;
    border-radius: 9999px;
    font-size: 0.82rem;
    font-weight: 600;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    transition: all 0.2s cubic-bezier(0.2, 0, 0, 1);
  }

  .segment-btn:hover {
    color: var(--md-sys-color-on-surface);
  }

  .segment-btn.active {
    background-color: var(--md-sys-color-surface-container-lowest, #ffffff);
    color: var(--md-sys-color-primary, #005f87);
    box-shadow: 0 1px 3px rgba(0,0,0,0.12);
  }

  .top-bar-right {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
  }

  /* Status Chip */
  .status-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: 9999px;
    font-size: 0.78rem;
    font-weight: 600;
    background-color: var(--md-sys-color-surface-container, rgba(0,0,0,0.05));
    border: 1px solid var(--md-sys-color-outline-variant, rgba(0,0,0,0.1));
    color: var(--md-sys-color-on-surface, #1d1b20);
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .status-unloaded .status-dot { background-color: var(--md-sys-color-outline, #79747e); }
  .status-booting .status-dot { background-color: #f59e0b; animation: pulse 1s infinite; }
  .status-idle .status-dot { background-color: #10b981; }
  .status-busy .status-dot { background-color: var(--md-sys-color-primary, #3b82f6); animation: pulse 1s infinite; }
  .status-aborting .status-dot { background-color: #f97316; animation: pulse 0.5s infinite; }
  .status-crashed .status-dot { background-color: #ef4444; }
  .status-recovering .status-dot { background-color: #8b5cf6; animation: pulse 0.8s infinite; }
  .status-failed .status-dot { background-color: #ef4444; }

  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.4; transform: scale(0.85); }
  }

  /* Action Buttons */
  .m3-filled-btn {
    background-color: var(--md-sys-color-primary, #005f87);
    color: var(--md-sys-color-on-primary, #ffffff);
    border: none;
    border-radius: 9999px;
    padding: 0 16px;
    height: 36px;
    font-size: 0.84rem;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    box-shadow: 0 1px 3px rgba(0,0,0,0.15);
    transition: all 0.2s cubic-bezier(0.2, 0, 0, 1);
  }

  .m3-filled-btn:hover {
    filter: brightness(1.1);
    box-shadow: 0 3px 6px rgba(0,0,0,0.2);
  }

  .m3-tonal-danger-btn {
    background-color: rgba(239, 68, 68, 0.12);
    color: #ef4444;
    border: 1px solid rgba(239, 68, 68, 0.35);
    border-radius: 9999px;
    padding: 0 14px;
    height: 36px;
    font-size: 0.84rem;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .m3-tonal-danger-btn:hover {
    background-color: rgba(239, 68, 68, 0.22);
  }

  .m3-danger-btn {
    background: #ef4444;
    color: #fff;
    border: none;
    border-radius: 9999px;
    height: 34px;
    padding: 0 12px;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
  }

  .m3-warning-btn {
    background: #f59e0b;
    color: #fff;
    border: none;
    border-radius: 9999px;
    height: 34px;
    padding: 0 12px;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
  }

  /* M3 Icon Buttons */
  .m3-icon-btn {
    width: 38px;
    height: 38px;
    border-radius: 9999px;
    border: none;
    background: transparent;
    color: var(--md-sys-color-on-surface-variant, #49454f);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background-color 0.2s, color 0.2s;
    flex-shrink: 0;
  }

  .m3-icon-btn:hover {
    background-color: var(--md-sys-color-surface-container-high, rgba(0,0,0,0.08));
    color: var(--md-sys-color-on-surface);
  }

  /* Dropdown & Popovers */
  .dropdown-container {
    position: relative;
    display: inline-flex;
  }

  .m3-popover {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    background-color: var(--md-sys-color-surface-container-lowest, #ffffff);
    border: 1px solid var(--md-sys-color-outline-variant, rgba(0,0,0,0.15));
    border-radius: 16px;
    box-shadow: 0 10px 24px rgba(0,0,0,0.18);
    z-index: 100;
    animation: popoverFadeIn 0.15s cubic-bezier(0.2, 0, 0, 1);
  }

  @keyframes popoverFadeIn {
    from { opacity: 0; transform: translateY(-6px) scale(0.97); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }

  /* Menu Popover */
  .menu-popover {
    width: 280px;
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .menu-section {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .menu-section-title {
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--md-sys-color-outline, #79747e);
    padding: 0 0.4rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .lane-choice-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .menu-item-choice {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0.6rem;
    border-radius: 10px;
    border: 1px solid transparent;
    background: transparent;
    text-align: left;
    cursor: pointer;
    transition: all 0.15s;
  }

  .menu-item-choice:hover:not(:disabled) {
    background-color: var(--md-sys-color-surface-container, rgba(0,0,0,0.05));
  }

  .menu-item-choice.selected {
    background-color: var(--md-sys-color-primary-container, rgba(0, 95, 135, 0.15));
    border-color: var(--md-sys-color-primary, #005f87);
  }

  .menu-item-choice:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .choice-text {
    display: flex;
    flex-direction: column;
  }

  .choice-title {
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--md-sys-color-on-surface);
  }

  .choice-desc {
    font-size: 0.72rem;
    color: var(--md-sys-color-on-surface-variant);
  }

  .check-mark {
    color: var(--md-sys-color-primary);
    font-weight: 700;
  }

  .menu-divider {
    height: 1px;
    background-color: var(--md-sys-color-outline-variant, rgba(0,0,0,0.1));
    margin: 0.25rem 0;
  }

  .menu-action-btn {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.5rem 0.6rem;
    border-radius: 8px;
    border: none;
    background: transparent;
    color: var(--md-sys-color-on-surface);
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: background-color 0.15s;
    width: 100%;
    text-align: left;
  }

  .menu-action-btn:hover {
    background-color: var(--md-sys-color-surface-container, rgba(0,0,0,0.05));
  }

  .menu-folder-card {
    background: var(--md-sys-color-surface-container, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--md-sys-color-outline-variant, rgba(255, 255, 255, 0.08));
    border-radius: 8px;
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .menu-folder-info {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .menu-folder-name {
    font-size: 0.825rem;
    font-weight: 500;
    font-family: var(--font-mono, monospace);
    color: var(--md-sys-color-primary, #89b4fa);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 170px;
  }

  .menu-folder-badge {
    font-size: 0.7rem;
    padding: 1px 6px;
    border-radius: 4px;
    background: rgba(166, 227, 161, 0.15);
    color: #a6e3a1;
  }

  .menu-folder-actions {
    display: flex;
    gap: 6px;
  }

  .menu-sub-btn {
    flex: 1;
    font-size: 0.75rem;
    padding: 4px 6px;
    border-radius: 4px;
    border: 1px solid var(--md-sys-color-outline-variant, rgba(255, 255, 255, 0.15));
    background: transparent;
    color: var(--md-sys-color-on-surface, #e2e8f0);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .menu-sub-btn:hover {
    background: var(--md-sys-color-surface-container-high, rgba(255, 255, 255, 0.1));
  }

  .menu-sub-btn.primary {
    border-color: rgba(137, 180, 250, 0.3);
    color: var(--md-sys-color-primary, #89b4fa);
  }

  .menu-sub-btn.danger {
    color: #f38ba8;
    border-color: rgba(243, 139, 168, 0.3);
  }

  .lang-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 4px;
    margin-top: 4px;
  }

  .lang-pill {
    padding: 4px 6px;
    border-radius: 6px;
    border: 1px solid var(--md-sys-color-outline-variant);
    background: transparent;
    color: var(--md-sys-color-on-surface-variant);
    font-size: 0.75rem;
    cursor: pointer;
    text-align: center;
  }

  .lang-pill.active {
    background-color: var(--md-sys-color-primary);
    color: var(--md-sys-color-on-primary);
    border-color: var(--md-sys-color-primary);
    font-weight: 700;
  }

  /* Palette Popover */
  .palette-popover {
    width: 320px;
    max-width: calc(100vw - 20px);
    box-sizing: border-box;
    padding: 1.1rem;
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
    max-height: calc(100vh - 80px);
    overflow-y: auto;
    overflow-x: hidden;
  }

  .popover-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .popover-title {
    font-size: 0.88rem;
    font-weight: 700;
    color: var(--md-sys-color-on-surface);
  }

  .icon-subtle-btn {
    background: transparent;
    border: none;
    color: var(--md-sys-color-outline);
    cursor: pointer;
    padding: 4px;
    border-radius: 6px;
    display: flex;
  }

  .icon-subtle-btn:hover {
    color: var(--md-sys-color-primary);
  }

  .palette-current-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .hue-badge {
    font-size: 0.82rem;
    font-weight: 700;
    padding: 0.15rem 0.6rem;
    border-radius: 8px;
    background-color: var(--md-sys-color-surface-container-high);
    color: var(--md-sys-color-on-surface);
    font-family: var(--font-mono, monospace);
  }

  .hue-dot {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    border: 2px solid var(--md-sys-color-outline-variant);
  }

  .slider-box {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .slider-label {
    font-size: 0.75rem;
    color: var(--md-sys-color-outline);
  }

  .hue-range-slider {
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    height: 10px;
    border-radius: 9999px;
    background: linear-gradient(to right,
      hsl(0, 80%, 50%),
      hsl(60, 80%, 50%),
      hsl(120, 80%, 50%),
      hsl(180, 80%, 50%),
      hsl(240, 80%, 50%),
      hsl(300, 80%, 50%),
      hsl(360, 80%, 50%)
    );
    outline: none;
    cursor: pointer;
  }

  .hue-range-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #ffffff;
    border: 2px solid var(--md-sys-color-outline);
    box-shadow: 0 1px 3px rgba(0,0,0,0.3);
    cursor: pointer;
  }

  .presets-section {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .presets-label {
    font-size: 0.75rem;
    color: var(--md-sys-color-outline);
  }

  .presets-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.4rem;
  }

  .preset-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    background: transparent;
    border: 1px solid transparent;
    padding: 0.3rem 0.2rem;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .preset-btn:hover {
    background-color: var(--md-sys-color-surface-container);
  }

  .preset-btn.active {
    border-color: var(--md-sys-color-primary);
    background-color: var(--md-sys-color-primary-container);
  }

  .preset-dot {
    width: 20px;
    height: 20px;
    border-radius: 50%;
  }

  .preset-name {
    font-size: 0.65rem;
    color: var(--md-sys-color-on-surface-variant);
    white-space: nowrap;
  }

  .palette-divider {
    height: 1px;
    background-color: var(--md-sys-color-outline-variant, rgba(255, 255, 255, 0.12));
    margin: 0.2rem 0;
  }

  .font-preview-sample {
    font-weight: 700;
    line-height: 1;
    color: var(--md-sys-color-primary);
  }

  .font-range-slider {
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    height: 6px;
    border-radius: 9999px;
    background: var(--md-sys-color-surface-container-highest, rgba(255, 255, 255, 0.2));
    outline: none;
    cursor: pointer;
  }

  .font-range-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--md-sys-color-primary);
    border: 2px solid #ffffff;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
    cursor: pointer;
  }

  /* 移动端深度优化：隐藏次要文字，防止拥挤 */
  @media (max-width: 768px) {
    .brand-title {
      display: none;
    }
    .segment-label {
      display: none;
    }
    .status-text {
      display: none;
    }
    .status-chip {
      padding: 6px;
    }
    .start-btn .btn-text,
    .stop-btn .btn-text {
      display: none;
    }
    .m3-filled-btn,
    .m3-tonal-danger-btn {
      padding: 0 10px;
    }
  }
</style>
