<!-- src/components/App.svelte -->
<script lang="ts">
  import HeaderBar from './HeaderBar.svelte';
  import BootModal from './BootModal.svelte';
  import FigureWarningModal from './FigureWarningModal.svelte';
  import ExampleGallery from './ExampleGallery.svelte';
  import DiagnosticsModal from './DiagnosticsModal.svelte';
  import VariableInspectorModal from './VariableInspectorModal.svelte';
  import PackageManagerModal from './PackageManagerModal.svelte';
  import ToastContainer from './ToastContainer.svelte';
  import { projectWorkspace, dockLayoutStore, i18n } from '../modules/appContext';
  import DockWorkspace from './dock/DockWorkspace.svelte';
  import type { WorkbenchMode } from '../modules/workspace/ProjectWorkspace';
  import type { Locale } from '../modules/i18n/types';

  let bootModalOpen = $state(false);
  let warningModalOpen = $state(false);
  let examplesOpen = $state(false);
  let diagnosticsOpen = $state(false);
  let packagesOpen = $state(false);
  let interceptedCmd = $state('');
  let interceptReason = $state('');
  let currentMode = $state<WorkbenchMode>(projectWorkspace.mode);
  let currentLocale = $state<Locale>(i18n.currentLocale);

  $effect(() => {
    const unsub = projectWorkspace.subscribe(() => {
      if (projectWorkspace.mode !== currentMode) {
        currentMode = projectWorkspace.mode;
        dockLayoutStore.openPanel(currentMode === 'notebook' ? 'octave-notebook' : 'octave-terminal');
      }
    });
    const unsubI18n = i18n.subscribe((loc) => {
      currentLocale = loc;
    });

    return () => {
      unsub();
      unsubI18n();
    };
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
    onOpenExamples={() => (examplesOpen = true)}
    onOpenDiagnostics={() => (diagnosticsOpen = true)}
    onOpenPackages={() => (packagesOpen = true)}
  />

  <main class="workspace-area">
    <div class="view-pane">
      <DockWorkspace
        onOpenExamples={() => (examplesOpen = true)}
        onInterceptPlot={handleInterceptPlot}
      />
    </div>
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

  <PackageManagerModal
    isOpen={packagesOpen}
    onClose={() => (packagesOpen = false)}
  />

  <VariableInspectorModal />
  <ToastContainer />
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
</style>
