<!-- src/components/App.svelte -->
<script lang="ts">
  import HeaderBar from './HeaderBar.svelte';
  import NotebookView from './NotebookView.svelte';
  import TerminalIsland from './TerminalIsland.svelte';
  import SidebarIsland from './SidebarIsland.svelte';
  import BootModal from './BootModal.svelte';
  import FigureWarningModal from './FigureWarningModal.svelte';
  import ExampleGallery from './ExampleGallery.svelte';
  import DiagnosticsModal from './DiagnosticsModal.svelte';
  import VariableInspectorModal from './VariableInspectorModal.svelte';
  import { projectWorkspace } from '../modules/appContext';
  import type { WorkbenchMode } from '../modules/workspace/ProjectWorkspace';

  let sidebarOpen = $state(false);
  let sidebarWidth = $state(320);
  let isResizing = $state(false);

  let bootModalOpen = $state(false);
  let warningModalOpen = $state(false);
  let examplesOpen = $state(false);
  let diagnosticsOpen = $state(false);
  let interceptedCmd = $state('');
  let interceptReason = $state('');
  let currentMode = $state<WorkbenchMode>(projectWorkspace.mode);

  const MIN_WIDTH = 240;
  const MAX_WIDTH = 580;
  const DEFAULT_WIDTH = 320;

  $effect(() => {
    const unsub = projectWorkspace.subscribe(() => {
      currentMode = projectWorkspace.mode;
    });

    if (typeof window !== 'undefined') {
      const savedWidth = localStorage.getItem('octave-sidebar-width');
      if (savedWidth) {
        const parsed = parseInt(savedWidth, 10);
        if (!isNaN(parsed) && parsed >= MIN_WIDTH && parsed <= MAX_WIDTH) {
          sidebarWidth = parsed;
        }
      }

      function handleKeyDown(e: KeyboardEvent) {
        if (e.key === '[' && !['INPUT', 'TEXTAREA'].includes((document.activeElement as HTMLElement)?.tagName)) {
          e.preventDefault();
          sidebarOpen = !sidebarOpen;
        }
      }

      window.addEventListener('keydown', handleKeyDown);
      return () => {
        unsub();
        window.removeEventListener('keydown', handleKeyDown);
      };
    }

    return unsub;
  });

  function handleInterceptPlot(cmd: string, reason: string) {
    interceptedCmd = cmd;
    interceptReason = reason;
    warningModalOpen = true;
  }

  function handleStartResize(e: MouseEvent) {
    if (typeof window === 'undefined' || window.innerWidth <= 768) return;
    isResizing = true;
    const startX = e.clientX;
    const startW = sidebarWidth;

    function onMouseMove(ev: MouseEvent) {
      // 侧栏在右侧：鼠标向左拖动 clientX 变小，宽度增加
      const dx = startX - ev.clientX;
      let newW = Math.round(startW + dx);
      if (newW < MIN_WIDTH) newW = MIN_WIDTH;
      if (newW > MAX_WIDTH) newW = MAX_WIDTH;
      sidebarWidth = newW;
    }

    function onMouseUp() {
      isResizing = false;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      localStorage.setItem('octave-sidebar-width', String(sidebarWidth));
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  function handleResetWidth() {
    sidebarWidth = DEFAULT_WIDTH;
    localStorage.setItem('octave-sidebar-width', String(DEFAULT_WIDTH));
  }
</script>

<div class="app-container" class:sidebar-resizing={isResizing}>
  <HeaderBar
    onOpenBootModal={() => (bootModalOpen = true)}
    onToggleSidebar={() => (sidebarOpen = !sidebarOpen)}
    onOpenExamples={() => (examplesOpen = true)}
    onOpenDiagnostics={() => (diagnosticsOpen = true)}
    {sidebarOpen}
  />

  <main class="workspace-area">
    <div class="view-pane">
      {#if currentMode === 'notebook'}
        <NotebookView onOpenExamples={() => (examplesOpen = true)} />
      {:else}
        <TerminalIsland onInterceptPlot={handleInterceptPlot} />
      {/if}
    </div>

    <!-- 侧栏拖拽与遮罩 -->
    {#if sidebarOpen}
      <!-- 移动端侧栏遮罩 -->
      <div
        class="sidebar-backdrop"
        onclick={() => (sidebarOpen = false)}
        role="presentation"
      ></div>

      <div class="sidebar-wrapper" style="width: {sidebarWidth}px;">
        <!-- 桌面端调整宽度的拖拽手柄 -->
        <div
          class="sidebar-resizer"
          class:resizing={isResizing}
          onmousedown={handleStartResize}
          ondblclick={handleResetWidth}
          title="拖拽调整侧边栏宽度，双击恢复默认 320px"
          role="separator"
          tabindex="0"
        ></div>

        <SidebarIsland />
      </div>
    {/if}
  </main>

  <BootModal
    isOpen={bootModalOpen}
    onClose={() => (bootModalOpen = false)}
  />

  <FigureWarningModal
    isOpen={warningModalOpen}
    command={interceptedCmd}
    reason={interceptReason}
    onClose={() => (warningModalOpen = false)}
  />

  <ExampleGallery
    isOpen={examplesOpen}
    onClose={() => (examplesOpen = false)}
  />

  <DiagnosticsModal
    isOpen={diagnosticsOpen}
    onClose={() => (diagnosticsOpen = false)}
  />

  <VariableInspectorModal />
</div>

<style>
  .app-container {
    width: 100vw;
    height: 100vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--bg-canvas);
  }

  .sidebar-resizing {
    cursor: col-resize !important;
    user-select: none !important;
  }

  .workspace-area {
    flex: 1;
    display: flex;
    overflow: hidden;
    position: relative;
    width: 100%;
  }

  .view-pane {
    flex: 1;
    min-width: 0;
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .sidebar-wrapper {
    position: relative;
    height: 100%;
    flex-shrink: 0;
    display: flex;
  }

  /* 拖拽手柄 */
  .sidebar-resizer {
    position: absolute;
    top: 0;
    left: -4px;
    width: 8px;
    height: 100%;
    cursor: col-resize;
    z-index: 45;
    background: transparent;
    transition: background-color 0.2s;
  }

  .sidebar-resizer:hover,
  .sidebar-resizer.resizing {
    background-color: var(--md-sys-color-primary, #005f87);
  }

  .sidebar-backdrop {
    display: none;
  }

  /* 移动端适配：侧栏浮层滑出模式 */
  @media (max-width: 768px) {
    .sidebar-backdrop {
      display: block;
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.45);
      z-index: 80;
      backdrop-filter: blur(2px);
    }

    .sidebar-wrapper {
      position: absolute;
      top: 0;
      right: 0;
      bottom: 0;
      width: 85vw !important;
      max-width: 360px;
      z-index: 90;
      box-shadow: -4px 0 20px rgba(0, 0, 0, 0.25);
    }

    .sidebar-resizer {
      display: none;
    }
  }
</style>
