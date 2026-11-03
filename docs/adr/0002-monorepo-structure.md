# ADR-0002: Monorepo-Struktur

- Status: **Vorgeschlagen** (umgesetzt)
- Datum: 2026-11-03

## Kontext

Client (Web, iOS, Android), Engine-Bibliotheken, Werkzeuge und Backend sollen gemeinsam versioniert werden.
Die Build-Order-Engine und die DSL müssen UI-frei bleiben, mehrere Agenten arbeiten parallel an getrennten Libs.

## Entscheidung

- **Nx 24** als Monorepo-Werkzeug, **pnpm** als Paketmanager (npm 10 scheitert reproduzierbar an Angulars
  Peer-Abhängigkeiten).
- Struktur wie im Briefing: `apps/laracraft`, `apps/api`, `libs/{core-model, build-order, renderer, editor,
lara-dsl, redstone-modules, formats}`, zusätzlich `tools/*` für Build-Werkzeuge und `assets/` für lizenzierte
  Assets.
- Tags + `@nx/enforce-module-boundaries` erzwingen die Schichten (`type:engine` < `type:render` <
  `type:feature` < `type:app`). Engine-Libs kompilieren ohne DOM-Typen und dürfen weder three.js noch Angular
  importieren (ESLint `no-restricted-imports`).
- Libs sind zunächst nicht „buildable“ (direkt aus dem Quellcode per TS-Pfad konsumiert). `lara-dsl` wird in
  M3 zusätzlich als JSON Schema exportiert, damit das .NET-Backend validieren kann.
- **Backend** liegt als .NET-Solution unter `apps/api`; Nx bindet es über `@nx/dotnet` oder `nx:run-commands`
  ein (Entscheidung in M3).
- Tests: Vitest in allen TS-Projekten; Angular-App über `@angular/build:unit-test`.

## Alternativen

- **Getrennte Repos** für Client und Backend: einfachere CI, aber DSL-Schema und Format müssten synchronisiert
  werden.
- **Turborepo/pnpm-Workspaces ohne Nx**: weniger Angular-Integration, keine Boundary-Regeln.

## Konsequenzen

- Neue Libs immer mit Generator und passenden Tags anlegen.
- `nx affected` hält die CI schnell.
