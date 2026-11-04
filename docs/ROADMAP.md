# laracraft – Roadmap

Legende: ✅ fertig · 🔄 in Arbeit · ⏳ offen · ⛔ blockiert (wartet auf PO)
Jedes Paket = ein Agent, eine Lib bzw. ein klar umrissenes Feature. Kein Merge ohne Review durch den Lead Developer.
Kritische Logik (Formate, Build-Order, DSL) bekommt zusätzlich einen unabhängigen Review-Agenten.

## M0 – Fundament ✅ (Bericht: [milestones/M0.md](milestones/M0.md))

Ziel: Monorepo, CI für Web/iOS/Android, Core-Model, Blockregistry (~150 Blöcke), Textur-Pipeline mit Lizenz-Manifest.

| Paket | Inhalt                                                                                                                           | Owner / Agent    | Hängt ab von | Status |
| ----- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ------------ | ------ |
| P0.1  | Nx + pnpm Workspace, TS strict, ESLint-Boundaries, Prettier, Vitest, Angular-App (zoneless), Lib-Skelette                        | Lead             | –            | ✅     |
| P0.2  | `core-model` Verträge + Implementierung: Blockstate, Registry-Typen, Palette, ChunkedVolume, BuildDocument, ChangeSet, Format v1 | Lead             | P0.1         | ✅     |
| P0.2r | Unabhängiger Review von P0.2 gegen Spezifikation (ADR-0001): 12 Befunde, alle behoben                                            | Review-Agent     | P0.2         | ✅     |
| P0.3  | Blockregistry-Daten (~150 Java-Blöcke inkl. Redstone-Grundteile) + Invarianten-Tests                                             | Agent „registry“ | P0.2         | ✅     |
| P0.3r | Fachlicher Review der Registry-Daten gegen Java Edition (Properties, Placement, Support)                                         | Review-Agent     | P0.3         | ✅     |
| P0.4  | Textur-Pipeline: Manifest + Schema, Validator, Atlas-Builder, Credits-Generator, Platzhalter-Texturen, Lizenzrecherche           | Agent „textures“ | P0.1         | ✅     |
| P0.4b | Import Pixel Perfection Legacy (ADR-0003) inkl. Manifest-Einträgen mit Autorenschaft pro Datei                                   | Agent „textures“ | ADR-0003 ✅  | 🔄     |
| P0.5  | Capacitor (Android/iOS) + GitHub-Actions-CI (Lint, Typecheck, Test, Web-, Android-, iOS-Build), Dependabot                       | Agent „ci“       | P0.1         | ✅     |
| P0.6  | App-Shell: i18n (de/en, Laufzeit), Disclaimer, Credits-Seite aus `credits.json`                                                  | Agent „shell“    | P0.4, P0.5   | ✅     |

**Schnittstellen M0:** `libs/core-model/src/index.ts` (Lead), `assets/textures/manifest.json` + `atlas.json` (P0.4),
`credits.json` (P0.4 → P0.6).

## M1 – Viewer und Editor

Ziel: Bau laden, flüssig rendern, mit Touch und Maus bearbeiten, Undo/Redo, lokal speichern.

| Paket | Inhalt                                                                                                                                                                     | Lib               | Hängt ab von     | Parallel zu |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ---------------- | ----------- |
| P1.0  | **Verträge** (Lead): `EditorTool`-Interface, `UndoStack`, `RendererPort` (Dokument → Szene, Hover/Pick), Worker-Protokoll für Mesher                                       | core-model/editor | M0               | –           |
| P1.1  | Chunk-Mesher (DOM-frei): Greedy Meshing für `full`, Face-Culling über Chunkgrenzen, Ausgabe als Typed Arrays; Benchmarks                                                   | renderer (worker) | P1.0, P0.3, P0.4 | P1.2, P1.4  |
| P1.2  | Sonderformen: Modell-Geometrien je `modelId` (Stufe, Treppe, Fackel, Zaun, Scheibe, Tür, Schiene, Draht, Repeater …) als `InstancedMesh`                                   | renderer          | P1.0, P0.3       | P1.1        |
| P1.3  | Szene + Kamera: three.js-Setup, Orbit/Pan/Zoom für Touch (Gesten) und Maus, Frustum Culling, Atlas-Material, Picking (Raycast auf Voxel)                                   | renderer          | P1.1             | P1.4        |
| P1.4  | Editor-Kern: `UndoStack` auf `ChangeSet`, Werkzeuge Setzen/Entfernen/Pipette, Auswahlbox, Füllen, Ersetzen, Spiegeln, Drehen (mit Blockstate-Rotation!), Kopieren/Einfügen | editor            | P1.0             | P1.1–P1.3   |
| P1.5  | Blockstate-Transformationen (Rotation/Spiegelung von `facing`, `axis`, `shape`, Wire-Seiten …) als reine Funktionen + Tests                                                | core-model        | P0.3             | alle        |
| P1.6  | Editor-UI: Blockpalette mit Suche/Favoriten, Werkzeugleiste, Layer-Slider, Desktop-Shortcuts                                                                               | app + editor      | P1.3, P1.4       | P1.7        |
| P1.7  | **Touch-Prototyp** auf echten Geräten (frühzeitig, eigenständig): Setzen/Entfernen/Kamera-Gesten, Messprotokoll, UX-Empfehlung                                             | app               | P1.3             | P1.6        |
| P1.8  | Lokales Speichern: IndexedDB (Web) / Capacitor Filesystem, Liste der Bauten, Autosave, Import/Export Format v1                                                             | app               | P0.2             | alle        |
| P1.9  | Performance-Messung 50 000 Blöcke auf Referenzgeräten → `docs/PERFORMANCE.md`, CI-Budgets (Mesh-Zeit, Speicher, Bundle)                                                    | renderer + CI     | P1.1–P1.3        | –           |
| P1.r  | Unabhängiger Review: Mesher (Korrektheit Face-Culling/Greedy) und Blockstate-Transformationen                                                                              | Review-Agent      | P1.1, P1.5       | –           |

| P1.10 | Registry auf die **aktuellste** Java-Version heben (26.x, Version bei Paketstart verifizieren; neue Blöcke/Properties seit 1.21.11), `dataVersion` aktualisieren, Review; danach Update-Pflege pro Release | core-model | P0.3 | alle |
| P1.11 | Lokaler Dev-Texturmodus: `textures:import-local --jar <eigene client.jar>` entpackt Texturen der eigenen Minecraft-Installation in ein git-ignoriertes Verzeichnis (`.local-textures/`), Atlas nutzt sie als höchste Priorität. Schutz: Prod-Build, CI und Capacitor-Sync brechen ab, wenn dieser Modus aktiv ist; nie im Repo, nie im Artefakt | tools/textures + renderer | P0.4 | P1.1 |

Kritischer Pfad M1: P1.0 → P1.1 → P1.3 → P1.7 (Touch-Risiko so früh wie möglich auf Geräte bringen).

## Bekannte Lücken nach M0 (Backlog für M2)

Aus dem fachlichen Review der Registry (P0.3r), vor Start der Build-Order-Engine zu lösen (**P2.0, Lead: Vertrag**):

- `solid` ist ein einzelnes Boolean. Java unterscheidet Tragfähigkeit pro Fläche und Art: volle Fläche
  (Knöpfe, Wandfackeln, Leitern), „rigid“ Oberseite (Schienen, Repeater, Comparator), Mittel-Auflage (Fackel,
  Laterne, Druckplatte auf Zaun/Mauer), Redstone-Staub (auch auf Trichter, oberen Stufen). Ersatz durch
  Support-Profile pro Fläche.
- Redstone-Staub Punkt vs. Kreuz (Rechtsklick nach dem Setzen), Schienen-Ausrichtung ohne Nachbarn
  (Blickachse), Tür-Scharnier (Klickposition), Falltür-`facing` je nach geklickter Fläche, Laterne `hanging` bei
  Seitenklick, Kisten nebeneinander (Schleichen), Betonpulver härtet neben Wasser aus.
- Optik: Spender/Werfer-Frontseite vertikal, Ofen `lit`-Licht, Tür-Seitentextur.
- Texturen: Registry nutzt 175 Texturnamen, 17 Platzhalter existieren; der Rest fällt bis zur Freigabe von
  ADR-0003 auf `missing` zurück.

## M2–M5 (Grobplanung)

- **M2 Build-Order-Engine**: Regeln aus Briefing §2, Validator, Golden-Tests (Haus, Turm mit Überhang, Sandstruktur,
  2×2-Kolbentür, Observer-Takt, Wasserfall), Anleitungsmodus in der UI.
- **M3 Lara**: `apps/api` (.NET), ILlmProvider + Anthropic, DSL + Interpreter + Property-Based-Tests, SSE-Streaming,
  erste 10 Redstone-Module.
- **M4 Teilen**: Accounts, Veröffentlichen, Feed/Suche, Remix, `.schem`/`.litematic`, PDF-Anleitung, Moderation.
- **M5 Store-Release**: Performance-Härtung, Accessibility, DSGVO, Store-Assets, TestFlight/Play-Beta.
