# Octave-UI (Deutsch)

**Languages / 语言 / Sprachen**: [English](README.md) · [中文](README.zh.md) · [Deutsch](README.de.md)

Diese Datei, `README.md` (Englisch, Standard) und `README.zh.md` (Chinesisch) sind
**drei Kopien derselben Behauptung**. Die Synchronisation wird bei jedem Push von
`zreflect/check_readme_sync.py` erzwungen: fehlt eine der drei Dateien im Änderungssatz,
wird der Push abgewiesen.

> 💡 **Einstieg für Entwickler / KI**: Zuerst [maintaince.md](maintaince.md) lesen
> (Projektkarte und Richtung); der gemessene Zustand liegt im Faktsystem
> (`STATE.md` + `FACTS.json`), die Benutzung in `README.md`, die Vertragsgrenzen in `CONTEXT.md`.

## Kernmerkmale und Architekturprinzipien (entspricht der englischen Fassung Punkt für Punkt)

- **Reine Client-Berechnung und statische Auslieferung**: kein Backend-Dienst, kein Proxy;
  ausgeliefert werden ausschließlich statische Dateien und vorkomprimierte Pakete.
- **Upstream-Engine absolut schreibgeschützt**: `ArchivalEra/Octave-Full-Wasm` bleibt read-only;
  Schnittstellenwünsche und technische Hinweise gehen ausschließlich über GitHub Issues.
- **Zwei getrennte Verträge**: Engine-Vertrag (Upstream ↔ UI) und Inhaltsvertrag
  (`Octave-Extra-Content` ↔ UI, über `mail/`) sind strikt getrennt; die Maschinentabelle
  wird vom Host in das gleich-originäre Regal montiert.
- **Download und Laden vollständig entkoppelt** (Besonderheit der Site): Download (schreibt
  in die OPFS-Sandbox) und Laden (in die Laufzeit) sind zwei unabhängige Aktionen;
  beim Laden wird nur die Platte gelesen, null Netzwerk; mehrere Engine-Varianten lassen sich
  vorladen, ohne instanziiert zu werden.
- **Keine handgeschriebenen Optionen im Markt**: Version / Form / Architektur / Konsument /
  Abhängigkeiten / Prüfsumme / Pfad / Codec / Paketliste werden vollständig aus Inhalts-,
  Distributions- und Engine-Vertrag projiziert; im Marktcode steht kein Optionsliteral.
- **Zwei voneinander unabhängige tiefe Module**: Markt (Projektion und Entscheidung) und
  OPFS (Persistenz, Buchführung, physische Abgleich) haben keine Typabhängigkeit und
  keine injizierten Prädikate; sie werden nur über ein eingefrorenes, aus dem Vertrag
  projiziertes Wertobjekt im Kompositionswurzelpunkt verbunden.
- **Drei Wege auf einer Achse**: UI-Klick, ein WebMCP-Aufruf und Test-Assertion laufen über
  dieselbe «Ein-Aufruf»-Naht; Lazy-Boot der Engine hat genau einen Ursprung, der Nutzer muss
  nicht zuerst «Berechnung starten» klicken.
- **Tiefe Module**: Sitzungsqueue, Terminal ohne Doppel-Echo, Graphics-Guard verbergen ihre
  Komplexität hinter schmalen Schnittstellen.
- **OPFS-Industriestandard-Sandbox**: Import → persistenter Arbeitsbereich → Export;
  drei Importkanäle und bidirektionale Binärbrücke zum MEMFS mit `Uint8Array`-Durchreichung;
  In-Memory-Fallback.
- **Steckbare Plugins und Paketverwaltung**: Plugin-Registry, Satzlayout, Galeriesuche,
  Grafik-Overlay und Paketpanel sind vertragskonform verdrahtet; Kompilierdiagnose und
  Quota-Vorschau behalten das vierzuständige Verdict, Fehler werden nicht verwischt.

## Abnahme und Disziplin

Repo-Eisenregeln, sieben Disziplinen, Pre-Commit-Gates und die entdeckende Registrierung
stehen in [AGENTS.md](AGENTS.md). Zahlen nur aus Messung, nur einmal erzeugt; Assertionen
müssen falsifizierbar sein und eine Gegenassertion haben; lebende Dokumente nur Gemessenes;
jede README-Änderung muss alle drei Fassungen im selben Push enthalten (Pre-Push und CI
mit identischem Kriterium).

**2026-11-07 «Frontallappen-Entfernung»**: Die Mechanismusschicht wurde vollständig auf
Einfacht `b580052` umgestellt (`zreflect/` 33 py + `lang/`-Pakete + Hook-Einstieg
`gate.py` / `install.py` + `harness.py`). Die 22 domänenspezifischen Gatter liegen wegen
der neuen `check_i18n`-Regel (keine natürliche Sprache im Mechanismus) nun in `gates/`
und werden von der gemischten `pre-commit`-Shell einzeln ausgeführt; die Datenschicht
liegt als `measure_octave_ui.py` im Repo-Wurzel (`FACTS.json` 22 Fakten / 14 witness
unverändert), die `facts.py`-Shell übernimmt Dispatch und PYTHONPATH. Die dreisprachige
README-Synchronisation, `[[Schlüssel]]` und die `AUTO:`-Blöcke bleiben vollständig
erhalten. Vor dem Commit: `python3 zreflect/registry.py --run commit`, danach
`./reflect-hooks/pre-commit`. Siehe `questions/03-einfacht-b580052-lobotomy.md`.

Vollständiger englischer Text (Standard): [README.md](README.md); chinesisch: [README.zh.md](README.zh.md).
