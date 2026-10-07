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
  import { workbenchController } from '../modules/appContext';
  import type { WorkbenchMode } from '../modules/workbench/types';

  let sidebarOpen = $state(true);
  let bootModalOpen = $state(false);
  let warningModalOpen = $state(false);
  let examplesOpen = $state(false);
  let diagnosticsOpen = $state(false);
  let interceptedCmd = $state('');
  let interceptReason = $state('');
  let currentMode = $state<WorkbenchMode>(workbenchController.mode);

  $effect(() => {
    const unsub = workbenchController.subscribe(() => {
      currentMode = workbenchController.mode;
    });
    return unsub;
  });

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
    onOpenExamples={() => (examplesOpen = true)}
    onOpenDiagnostics={() => (diagnosticsOpen = true)}
    {sidebarOpen}
  />

  <main class="workspace-area">
    {#if currentMode === 'notebook'}
      <NotebookView onOpenExamples={() => (examplesOpen = true)} />
    {:else}
      <TerminalIsland onInterceptPlot={handleInterceptPlot} />
    {/if}

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

  .workspace-area {
    flex: 1;
    display: flex;
    overflow: hidden;
    position: relative;
  }
</style>
