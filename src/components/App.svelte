<!-- src/components/App.svelte -->
<script lang="ts">
  import HeaderBar from './HeaderBar.svelte';
  import TerminalIsland from './TerminalIsland.svelte';
  import SidebarIsland from './SidebarIsland.svelte';
  import BootModal from './BootModal.svelte';
  import FigureWarningModal from './FigureWarningModal.svelte';

  let sidebarOpen = $state(true);
  let bootModalOpen = $state(false);
  let warningModalOpen = $state(false);
  let interceptedCmd = $state('');
  let interceptReason = $state('');

  function handleInterceptPlot(cmd: string, reason: string) {
    interceptedCmd = cmd;
    interceptReason = reason;
    warningModalOpen = true;
  }
</script>

<div class="app-container">
  <HeaderBar
    onOpenBootModal={() => (bootModalOpen = true)}
    onToggleSidebar={() => (sidebarOpen = !sidebarOpen)}
    {sidebarOpen}
  />

  <main class="workspace-area">
    <TerminalIsland onInterceptPlot={handleInterceptPlot} />

    {#if sidebarOpen}
      <SidebarIsland />
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

  .workspace-area {
    flex: 1;
    display: flex;
    overflow: hidden;
    position: relative;
  }
</style>
