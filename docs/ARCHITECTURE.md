# laracraft – Architektur

> Quelle der Wahrheit für alle Agenten. Änderungen an Schnittstellen in `libs/core-model`
> oder an Entscheidungen aus `docs/adr/` gehen über den Lead Developer.
> Code und Kommentare: Englisch. Docs: Deutsch.

## 1. Überblick

```
                    ┌────────────────────────── apps/laracraft (Angular 22 + Capacitor 8) ─────────────────────────┐
                    │  UI-Shell · i18n (de/en) · Routing · Credits/Disclaimer                                      │
                    │                                                                                               │
                    │   libs/editor ──────► libs/renderer (three.js) ◄──── Mesh-Worker                              │
                    │      │   Werkzeuge,        Chunks 16³, Greedy Meshing,                                          │
                    │      │   Undo/Redo         InstancedMesh, Atlas                                                 │
                    │      ▼                                                                                        │
                    │   ┌──────────────── Engine-Schicht (reines TS, kein DOM/three/Angular) ─────────────────┐      │
                    │   │ libs/core-model   Blockregistry · Blockstates · BuildDocument · ChangeSet · Format   │      │
                    │   │ libs/build-order  Abhängigkeitsgraph · Sortierung · Schritte · Validator (Worker)    │      │
                    │   │ libs/lara-dsl     Operation-Schema · Interpreter → ChangeSet (auch im Backend)        │      │
                    │   │ libs/redstone-modules  geprüfte Schaltungsmodule + Metadaten + Tests                 │      │
                    │   │ libs/formats      .schem / .litematic Import & Export                                │      │
                    │   └──────────────────────────────────────────────────────────────────────────────────────┘      │
                    └───────────────────────────────────────────────┬───────────────────────────────────────────────┘
                                                                    │ HTTPS (Auth-Token), SSE-Streaming
                                                                    ▼
                    apps/api (ASP.NET Core, .NET LTS) ── PostgreSQL · Object Storage · ILlmProvider (Anthropic Claude)
```

Leitprinzipien:

1. **Engine zuerst, UI-frei.** Alles, was Bauten versteht (Blöcke, Regeln, Reihenfolge, DSL, Formate),
   ist reines TypeScript ohne DOM, three.js oder Angular. Es läuft in Web Workern, in Node (Tests, Tools)
   und – für die DSL-Validierung – serverseitig. Erzwungen per ESLint (`type:engine`-Tag, `no-restricted-imports`)
   und per `tsconfig` (`lib: ["es2022"]`, keine DOM-Typen).
2. **Daten statt Sonderfälle.** Blockwissen (Befestigung, Schwerkraft, Ausrichtung, Redstone-Rolle,
   Materialkosten) steht als Daten in der Blockregistry. Die Build-Order-Engine wertet Regeln aus, sie kennt
   keine Block-IDs.
3. **Ein Dokument, eine Undo-Historie.** Editor-Werkzeuge und Lara erzeugen beide `ChangeSet`s auf demselben
   `BuildDocument`.
4. **Java Edition only.** Blockstates sind Java-Strings. Bedrock-Unterschiede kommen später als separater
   Hinweis-Layer, nie vermischt.
5. **Rechtlich sauber.** Keine Mojang-Assets. Jedes Asset im Manifest mit Quelle und Lizenz (ADR-0003).

## 2. Monorepo (ADR-0002)

| Projekt                 | Tags                       | Zweck                                                        |
| ----------------------- | -------------------------- | ------------------------------------------------------------ |
| `apps/laracraft`        | `type:app`, `scope:client` | Angular-App, Capacitor-Hülle (iOS/Android)                   |
| `apps/api`              | (M3) .NET-Projekt          | Backend: Auth, Bauten, Lara-Proxy                            |
| `libs/core-model`       | `type:engine`              | Registry, Blockstates, Dokument, ChangeSet, Serialisierung   |
| `libs/build-order`      | `type:engine`              | Build-Order-Engine + Validator                               |
| `libs/lara-dsl`         | `type:engine`              | DSL-Schema (JSON Schema/TS), Interpreter                     |
| `libs/redstone-modules` | `type:engine`              | Modul-Bibliothek                                             |
| `libs/formats`          | `type:engine`              | `.schem`, `.litematic`                                       |
| `libs/renderer`         | `type:render`              | three.js-Rendering, Mesher (Mesher selbst DOM-frei → Worker) |
| `libs/editor`           | `type:feature` (M1)        | Werkzeuge, Interaktion, Undo/Redo-Stack                      |
| `tools/textures`        | `type:tool`                | Manifest-Validator, Atlas-Builder, Credits                   |

Abhängigkeitsregeln (ESLint `@nx/enforce-module-boundaries`):

- `type:engine` → nur `type:engine`
- `type:render` → `type:engine`, `type:render`
- `type:feature` → `engine`, `render`, `feature`
- `type:tool` → `engine`, `tool`
- `type:app` → alles

Paketmanager: **pnpm** (npm 10 scheitert reproduzierbar mit einem Arborist-Fehler an Angulars Peer-Abhängigkeiten).

## 3. Core-Model (Vertrag)

Datei-Einstieg: `libs/core-model/src/index.ts`.

- **Blockstate** (`blockstate/blockstate.ts`): `BlockStateString` (branded, kanonisch: Keys alphabetisch,
  z. B. `minecraft:oak_stairs[facing=east,half=bottom,shape=straight,waterlogged=false]`). `parseBlockState`,
  `stringifyBlockState`, `canonicalBlockState`.
- **Registry** (`registry/types.ts`): `BlockDefinition` mit
  - `properties` (Werte + Default, exakt wie Java),
  - `render` (`full` → Greedy Meshing, `model` → Instancing mit `modelId`, Texturnamen aus dem Manifest),
  - `solid` (kann Anbauteile tragen),
  - `physics.support` (`none | below | ceiling | facing | face | conditional`), `gravity`, `fluid`,
  - `placement[]` (woher ein Property beim Setzen kommt: Blickrichtung, geklickte Fläche, Nachbarn, Interaktion …),
  - `redstone` (`role`, `triggersOnPlace`),
  - `item` (Materialkosten, z. B. Doppelstufe = 2, Tür nur untere Hälfte).
    `resolveBlockState` validiert gegen die Registry und füllt Defaults.
- **Dokument** (`document/*`): `BlockPalette` (append-only, Index 0 = Luft), `ChunkedVolume` (sparse 16³,
  YZX-Reihenfolge, negative Koordinaten, Dirty-Chunks inkl. Nachbarn), `BuildDocument`
  (`setBlock`, `apply(ChangeSet)`), `invertChangeSet` für Undo.
- **Format v1** (`serialization/format.ts`, ADR-0001).

Wer eine Änderung an diesen Verträgen braucht, meldet sie im Paket-Report; der Lead Developer entscheidet.

## 4. Build-Order-Engine (M2, Skizze)

Eingabe: `BuildDocument` + Registry. Ausgabe: `BuildPlan { steps: Step[]; materials; warnings }`.

1. **Abhängigkeitsgraph**: Kanten aus `physics.support` (Träger vor Anbauteil), Schwerkraft (Untergrund vor
   Sand/Kies; sonst temporäre Stütze + späterer Abbau-Schritt), Erreichbarkeit/„Klickfläche“ (ein Nachbar muss
   existieren; sonst Gerüst), Redstone-Sicherheit (Quellen zuletzt, `triggersOnPlace`-Bauteile nach ihrer Umgebung,
   Hinweis „Kreis offen lassen“), Flüssigkeiten ganz am Ende.
2. **Topologische Sortierung** mit Priorität: Y-Ebene, dann räumliche Nähe (Cluster).
3. **Schritt-Bildung**: 10–30 Blöcke, Materialliste pro Schritt und gesamt, Crafting-Baum optional.
4. **Ausrichtung**: pro Block Spielerposition + Blickrichtung + Klickfläche, abgeleitet aus `placement`.
5. **Validator**: unabhängiges Modul, prüft jede Anleitung gegen alle Regeln. Golden-Tests: Haus,
   Turm mit Überhang, Sandstruktur, 2×2-Kolbentür, Observer-Takt, Wasserfall.

Läuft im Web Worker; Schnittstelle zum UI über `postMessage` mit serialisiertem Dokument (Format v1).

## 5. Rendering (M1)

- Chunks 16³ aus `ChunkedVolume`; Dirty-Chunks werden neu gemesht.
- `full`-Blöcke: Greedy Meshing pro Textur/Layer; `model`-Blöcke: `InstancedMesh` pro `modelId`+Zustand.
- Textur-Atlas aus `tools/textures` (`atlas.json` mit UV-Rechtecken, Padding gegen Bleeding).
- Mesher läuft im Worker (DOM-frei), three.js nur im Hauptthread.
- Budget: 60 fps bei 50 000 Blöcken auf Mittelklasse-Android. Wird in M1 gemessen und dann in
  `docs/PERFORMANCE.md` festgeschrieben; CI misst Mesh-Build-Zeit und Bundle-Größe.

## 6. Lara (M3, Skizze)

- Client sendet Chat + kompakte Bau-Zusammenfassung ans Backend. Backend ruft das LLM über `ILlmProvider`
  (ADR-0005) mit Tool-Definitionen = Lara-DSL.
- Tool Calls werden serverseitig gegen das Schema validiert, an den Client gestreamt (SSE), dort vom
  Interpreter (`libs/lara-dsl`) zu `ChangeSet`s gemacht und live gerendert. Eine Lara-Antwort = ein Undo-Schritt.
- Redstone nur über `insertModule` aus `libs/redstone-modules`.
- Rate-Limits und Token-Kosten pro Nutzer im Backend.

## 7. Backend (ADR-0004)

ASP.NET Core (.NET LTS), PostgreSQL (EF Core), Object Storage (S3-kompatibel) für Baudateien und Vorschaubilder,
Auth: E-Mail, Sign in with Apple, Google. API-Vertrag per OpenAPI; TypeScript-Client wird generiert.

## 8. Querschnitt

- **i18n**: Laufzeit-Übersetzung (de/en) ab M0/M1, keine hartkodierten UI-Texte.
- **Rechtliches**: Disclaimer „Nicht offiziell. Nicht mit Mojang oder Microsoft verbunden.“ immer sichtbar
  erreichbar; Credits-Seite aus `credits.json`.
- **Qualität**: TS strict (+ `noUncheckedIndexedAccess`), ESLint, Prettier, Vitest; C# mit Nullable + Analyzern.
- **CI**: Lint, Typecheck, Tests, Web-Build, Android-Build, iOS-Build; Performance-Budgets ab M1.
