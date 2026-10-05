// src/modules/i18n/locales/en.ts
// Canonical English dictionary (single source of truth for keys and placeholders)

export const en = {
  // Brand / Header
  'header.title': 'GNU Octave 11.3.0',
  'header.badge_wasm64': 'Wasm64',
  'header.select_language': 'Language',
  'header.theme_light': '☀️ Light',
  'header.theme_dark': '🌙 Dark',
  'header.theme_tooltip': 'Toggle light/dark theme',
  'header.sidebar_hide': '⇥ Hide Sidebar',
  'header.sidebar_show': '⇤ Show Sidebar',
  'header.sidebar_tooltip': 'Toggle sidebar',

  // Status badges
  'status.unloaded': 'Not Ready',
  'status.booting': 'Booting...',
  'status.idle': 'Ready (Idle)',
  'status.busy': 'Busy...',
  'status.aborting': 'Aborting...',
  'status.crashed': 'Crashed',
  'status.recovering': 'Recovering...',
  'status.failed': 'Failed',
  'status.error': 'Error',

  // Actions
  'action.boot': 'Boot Engine',
  'action.boot_tooltip': 'Load WebAssembly kernel on demand',
  'action.interrupt': 'Interrupt',
  'action.interrupt_tooltip': 'Cooperative safepoint interrupt',
  'action.kill': 'Force Kill',
  'action.kill_tooltip': 'Force terminate hung engine',
  'action.recover': 'Recover',
  'action.recover_tooltip': 'In-place self-healing recovery',

  // Terminal
  'terminal.aria_label': 'Octave Terminal',
  'terminal.err_crashed': "\x1b[31m[Error] Engine is currently in '{state}' state. Please click \"Recover\" to heal the engine.\x1b[0m\n",
  'terminal.warn_aborting': "\x1b[33m[Notice] Engine is aborting. Please wait or click \"Force Kill\".\x1b[0m\n",
  'terminal.warn_booting': "\x1b[33m[Notice] Engine is booting, please wait...\x1b[0m\n",
  'terminal.warn_recovering': "\x1b[33m[Notice] Engine is recovering, please wait...\x1b[0m\n",
  'terminal.warn_not_ready': "\x1b[33m[Notice] GNU Octave engine is not started yet. Click \"Boot Engine\" in the top bar to load.\x1b[0m\n",
  'terminal.banner_aborting': '⚠️ Attempting to interrupt computation... If the engine hangs, you can force kill it:',
  'terminal.banner_crashed': '💥 Engine crashed (cause: {cause}). Command history and output have been preserved.',
  'terminal.banner_failed': '🛑 Circuit breaker triggered: maximum recovery retries reached. Engine is in failed state.',
  'terminal.retry_unstarted': 'Refill unstarted command: {code}',

  // Sidebar Tabs
  'sidebar.tab_workspace': 'Workspace',
  'sidebar.tab_files': 'Files',
  'sidebar.tab_history': 'History',
  'sidebar.tab_docs': 'Docs',

  // Workspace
  'workspace.title': 'Variables ({count})',
  'workspace.refresh': 'Refresh',
  'workspace.empty': 'No variables in workspace',
  'workspace.col_name': 'Name',
  'workspace.col_type': 'Type',
  'workspace.col_dimensions': 'Dimensions',
  'workspace.col_size': 'Size',

  // Files
  'files.path': 'Path: {path}',
  'files.refresh': 'Refresh',
  'files.empty': 'Directory is empty',
  'files.download': 'Download',
  'files.delete': 'Delete',

  // History
  'history.search_placeholder': 'Search command history...',
  'history.clear': 'Clear',

  // Docs
  'docs.search_placeholder': 'Enter function name (e.g. magic, svd)...',
  'docs.query': 'Search',
  'docs.querying': 'Searching...',
  'docs.loading_state': 'Querying silently via out-of-band channel...',
  'docs.empty_state': 'Enter an Octave function name to get offline help docs',
  'docs.error': 'Query failed: {error}',

  // Boot Modal
  'boot.title': 'Boot GNU Octave Engine',
  'boot.desc': 'This project runs 100% client-side local computation. All matrix operations and scientific computations execute directly in your browser without any backend server.',
  'boot.engine_version_label': 'Engine Version:',
  'boot.runtime_mode_label': 'Runtime Mode:',
  'boot.runtime_mode_val': 'Wasm64 Multi-threaded (Memory64 + Pthreads)',
  'boot.asset_size_label': 'Asset Size:',
  'boot.asset_size_val': '~40.6 MB (Wasm 30.9MB + Data 9.7MB, on-demand single load)',
  'boot.data_privacy_label': 'Data Privacy:',
  'boot.data_privacy_val': 'Code and data stay strictly in local memory and IDBFS, never uploaded to cloud',
  'boot.status_ready': 'Ready. Click the button below to start on-demand loading.',
  'boot.status_checking': 'Validating Cross-Origin Isolation (COI) and Memory64 support...',
  'boot.status_starting': 'Starting 64-bit WebAssembly kernel and initializing session...',
  'boot.status_success': 'GNU Octave 11.3.0 Ready!',
  'boot.status_failed': 'Boot failed. Please check browser console or network configuration.',
  'boot.cancel': 'Cancel',
  'boot.start': 'Start Engine Now',
  'boot.starting': 'Starting...',

  // Figure Warning Modal
  'figure.title': '⚠️ E6 GL Plot Boundary Intercept',
  'figure.default_reason': 'Graphics plot call intercepted to prevent WebAssembly interpreter crash.',
  'figure.details_title': 'Boundary & Capability Policy Background (CapabilityPolicy):',
  'figure.details_p1': 'In GNU Octave WebAssembly Embed architecture, OpenGL/WebGL pipeline is at E6 boundary stage. The current environment does not yet have WebGPU offscreen graphics pipeline ready. Calling plot() or drawnow may trigger null pointer exceptions in underlying WebGL texture containers.',
  'figure.details_p2': 'EngineSupervisor provides self-healing circuit breaker protection for execution anomalies, but outputting data or using GraphicsSink offscreen slots is recommended until graphical channels are ready.',
  'figure.btn_cancel': 'Cancel Safely (Recommended)',
  'figure.btn_force': 'Force Execute (High Risk)',
} as const;
