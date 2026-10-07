// src/modules/i18n/locales/de.ts
// Deutsche Sprachwörterbuch (German dictionary)
import type { LocaleDictionary, EnsureParity } from '../types';

const _de = {
  // Brand / Header
  'header.title': 'GNU Octave 11.3.0',
  'header.badge_wasm64': 'Wasm64',
  'header.select_language': 'Sprache',
  'header.theme_light': '☀️ Hell',
  'header.theme_dark': '🌙 Dunkel',
  'header.theme_tooltip': 'Hell-/Dunkel-Design umschalten',
  'header.sidebar_hide': '⇥ Seitenleiste ausblenden',
  'header.sidebar_show': '⇤ Seitenleiste einblenden',
  'header.sidebar_tooltip': 'Seitenleiste umschalten',

  // Status badges
  'status.unloaded': 'Nicht bereit',
  'status.booting': 'Wird gestartet…',
  'status.idle': 'Bereit (Leerlauf)',
  'status.busy': 'Berechnet…',
  'status.aborting': 'Wird abgebrochen…',
  'status.crashed': 'Abgestürzt',
  'status.recovering': 'Wird wiederhergestellt…',
  'status.failed': 'Fehlgeschlagen',
  'status.error': 'Fehler',

  // Actions
  'action.boot': 'Engine starten',
  'action.boot_tooltip': 'WebAssembly-Kernel nach Bedarf laden',
  'action.interrupt': 'Unterbrechen',
  'action.interrupt_tooltip': 'Kooperative Unterbrechung am Sicherungspunkt',
  'action.kill': 'Erzwungen beenden',
  'action.kill_tooltip': 'Blockierte Engine zwangsweise beenden',
  'action.recover': 'Wiederherstellen',
  'action.recover_tooltip': 'In-situ-Selbstheilung der Engine',

  // Terminal
  'terminal.aria_label': 'Octave-Terminal',
  'terminal.err_crashed': "\x1b[31m[Fehler] Die Engine befindet sich im Zustand '{state}'. Bitte klicken Sie auf „Wiederherstellen“.\x1b[0m\n",
  'terminal.warn_aborting': "\x1b[33m[Hinweis] Die Engine wird abgebrochen. Bitte warten Sie oder klicken Sie auf „Erzwungen beenden“.\x1b[0m\n",
  'terminal.warn_booting': "\x1b[33m[Hinweis] Die Engine wird gestartet, bitte warten…\x1b[0m\n",
  'terminal.warn_recovering': "\x1b[33m[Hinweis] Die Engine wird wiederhergestellt, bitte warten…\x1b[0m\n",
  'terminal.warn_not_ready': "\x1b[33m[Hinweis] Die GNU Octave Engine ist noch nicht gestartet. Klicken Sie oben rechts auf „Engine starten“.\x1b[0m\n",
  'terminal.banner_aborting': '⚠️ Berechnung wird abgebrochen… Falls die Engine hängt, können Sie diese erzwungen beenden:',
  'terminal.banner_crashed': '💥 Engine abgestürzt (Ursache: {cause}). Befehlsverlauf und Ausgabe wurden beibehalten.',
  'terminal.banner_failed': '🛑 Schutzschalter ausgelöst: Maximale Wiederherstellungsversuche erreicht. Engine fehlgeschlagen.',
  'terminal.retry_unstarted': 'Nicht gestarteten Befehl erneut einfügen: {code}',

  // Sidebar Tabs
  'sidebar.tab_workspace': 'Arbeitsbereich',
  'sidebar.tab_files': 'Dateien',
  'sidebar.tab_history': 'Verlauf',
  'sidebar.tab_docs': 'Dokumentation',

  // Workspace
  'workspace.title': 'Variablen ({count})',
  'workspace.refresh': 'Aktualisieren',
  'workspace.empty': 'Keine Variablen im Arbeitsbereich',
  'workspace.col_name': 'Name',
  'workspace.col_type': 'Typ',
  'workspace.col_dimensions': 'Dimensionen',
  'workspace.col_size': 'Größe',

  // Files
  'files.path': 'Pfad: {path}',
  'files.refresh': 'Aktualisieren',
  'files.empty': 'Verzeichnis ist leer',
  'files.download': 'Herunterladen',
  'files.delete': 'Löschen',

  // History
  'history.search_placeholder': 'Befehlsverlauf durchsuchen…',
  'history.clear': 'Leeren',

  // Docs
  'docs.search_placeholder': 'Funktionsname eingeben (z. B. magic, svd)…',
  'docs.query': 'Suchen',
  'docs.querying': 'Wird gesucht…',
  'docs.loading_state': 'Wird über Out-of-Band-Kanal abgefragt…',
  'docs.empty_state': 'Octave-Funktionsnamen eingeben, um Hilfedokumentation abzurufen',
  'docs.error': 'Abfrage fehlgeschlagen: {error}',

  // Boot Modal
  'boot.title': 'GNU Octave Engine starten',
  'boot.desc': 'Dieses Projekt führt Berechnungen zu 100 % clientseitig aus. Alle Matrix- und wissenschaftlichen Berechnungen laufen direkt im Browser ohne Backend-Server.',
  'boot.engine_version_label': 'Engine-Version:',
  'boot.runtime_mode_label': 'Laufzeitmodus:',
  'boot.runtime_mode_val': 'Wasm64 Multithread (Memory64 + Pthreads)',
  'boot.asset_size_label': 'Asset-Größe:',
  'boot.asset_size_val': '~40,6 MB (Wasm 30,9 MB + Daten 9,7 MB, einmaliges Laden nach Bedarf)',
  'boot.data_privacy_label': 'Datenschutz:',
  'boot.data_privacy_val': 'Code und Daten verbleiben lokal im Speicher und IDBFS und werden nie in die Cloud übertragen',
  'boot.status_ready': 'Bereit. Klicken Sie auf die Schaltfläche unten, um das Laden nach Bedarf zu starten.',
  'boot.status_checking': 'Cross-Origin Isolation (COI) und Memory64-Unterstützung werden geprüft…',
  'boot.status_starting': '64-Bit-WebAssembly-Kernel wird gestartet und Sitzung initialisiert…',
  'boot.status_success': 'GNU Octave 11.3.0 bereit!',
  'boot.status_failed': 'Start fehlgeschlagen. Bitte Browserkonsole oder Netzwerkkonfiguration prüfen.',
  'boot.cancel': 'Abbrechen',
  'boot.start': 'Engine jetzt starten',
  'boot.starting': 'Wird gestartet…',

  // Figure Warning Modal
  'figure.title': '⚠️ E6 GL Plot-Sicherheitsabfangung',
  'figure.default_reason': 'Grafikaufruf abgefangen, um einen Absturz des WebAssembly-Interpreters zu verhindern.',
  'figure.details_title': 'Hintergrund zur Grenz- und Richtlinienfähigkeit (CapabilityPolicy):',
  'figure.details_p1': 'In der Embed-Architektur von GNU Octave WebAssembly befindet sich die OpenGL/WebGL-Pipeline im E6-Grenzstadium. Die aktuelle Umgebung verfügt noch nicht über eine WebGPU-Offscreen-Pipeline. Der Aufruf von plot() oder drawnow kann Nullzeigerfehler im WebGL-Texturcontainer auslösen.',
  'figure.details_p2': 'EngineSupervisor bietet Schutz vor Laufzeitanomalien. Es wird jedoch empfohlen, Daten auszugeben oder GraphicsSink-Offscreen-Slots zu nutzen, bis der Grafikkanal bereit ist.',
  'figure.btn_cancel': 'Sicher abbrechen (Empfohlen)',
  'figure.btn_force': 'Erzwingen (Hohes Risiko)',

  // Header additions
  'header.brand_tag': 'Bereit · Lokal · 100% Privat',
  'header.btn_diagnostics': '⚙ Diagnose',
  'header.btn_examples': '💡 Beispiele',
  'header.btn_start': 'Rechnen Starten',
  'header.mode_notebook': 'Notebook',
  'header.mode_console': 'Konsole',

  // Workbench
  'workbench.add_cell': '+ Zelle hinzufügen',
  'workbench.run_cell': 'Ausführen (Shift+Enter)',
  'workbench.run_all': 'Alle ausführen',
  'workbench.clear': 'Leeren',
  'workbench.delete_cell': 'Löschen',
  'workbench.empty_placeholder': 'Octave- / MATLAB-Code hier eingeben...',
  'workbench.plot_title': 'Erfasste Plot-Vektoren ({count} Punkte)',
  'workbench.matrix_title': 'Matrix {name} ({rows}x{cols})',
  'workbench.scalar_title': 'Skalar {name}',
  'workbench.execution_time': 'Ausgeführt in {ms}ms',

  // Examples Gallery
  'examples.drawer_title': 'Beispielgalerie für Algorithmen',
  'examples.drawer_subtitle': 'Erkunden Sie wissenschaftliches Rechnen, lineare Algebra, DSP und Simulationen mit 1 Klick.',
  'examples.try_button': 'Ausführen',
  'examples.recipe_sine_wave_title': 'Sinuswelle & Harmonische',
  'examples.recipe_sine_wave_desc': 'Harmonische Signale generieren und die zusammengesetzte Wellenform sicher darstellen.',
  'examples.recipe_solve_linear_title': 'Lineares Gleichungssystem (A \\ b)',
  'examples.recipe_solve_linear_desc': 'Löse A * x = b effizient mit dem Gauß-Eliminationsoperator.',
  'examples.recipe_fft_spectrum_title': 'FFT-Frequenzspektrum',
  'examples.recipe_fft_spectrum_desc': 'Konvertiere Zeitbereichssignale in ein einseitiges Amplitudenspektrum.',
  'examples.recipe_monte_carlo_pi_title': 'Monte-Carlo-Pi-Simulation',
  'examples.recipe_monte_carlo_pi_desc': 'Schätze die Kreiszahl pi mit 10.000 Zufallspunkten.',
  'examples.recipe_matrix_eig_title': 'Eigenwertzerlegung',
  'examples.recipe_matrix_eig_desc': 'Berechne Eigenvektoren und Diagonalmatrix für symmetrische Matrizen.',
  'examples.recipe_poly_fit_title': 'Polynomische Kurvenanpassung (polyfit)',
  'examples.recipe_poly_fit_desc': 'Passe Parabelkoeffizienten an empirische Datenpunkte an.',

  // Diagnostics Modal
  'diagnostics.title': 'Engine- und Lane-Diagnose',
  'diagnostics.desc': 'Interne Deployment-Metadaten, Wasm-Isolationsflags und Architekturspezifikationen.',
  'diagnostics.active_lane': 'Aktive Lane:',
  'diagnostics.gear': 'Kernel-Stufe (Gear):',
  'diagnostics.port': 'Port:',
  'diagnostics.epoch': 'Engine-Epoche:',
  'diagnostics.coi_status': 'Cross-Origin Isolated:',
  'diagnostics.sab_status': 'SharedArrayBuffer-Status:',
  'diagnostics.switch_lane': 'Deployment-Lane wechseln',
  'diagnostics.lane_specs': 'Lane-Architekturspezifikationen',
  'diagnostics.current_active': 'Derzeit aktiv',
  'diagnostics.close': 'Schließen',

  // Variable Inspector
  'inspector.title': 'Variableninspektor: {name}',
  'inspector.stats_title': 'Numerische Statistiken',
  'inspector.min': 'Min:',
  'inspector.max': 'Max:',
  'inspector.mean': 'Mittelwert:',
  'inspector.grid_preview': 'Datenraster (Erste 10x10)',
  'inspector.action_plot': 'Variable plotten',
  'inspector.action_copy': 'Name kopieren',
  'inspector.action_transpose': 'Transponieren (\'.\')',
  'inspector.close': 'Schließen',
} as const;

export const de: EnsureParity<typeof _de> & LocaleDictionary = _de;
