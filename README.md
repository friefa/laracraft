# laracraft

3D-Baukasten für Minecraft-Bauten und Redstone-Schaltungen (iOS, Android, Web) mit KI-Assistentin **Lara** und
automatischer, Survival-tauglicher Schritt-für-Schritt-Bauanleitung.

> Nicht offiziell. Nicht mit Mojang oder Microsoft verbunden. Für Minecraft: Java Edition.

## Entwicklung

Voraussetzungen: Node 22, pnpm 10 (`corepack enable`).

```sh
pnpm install
pnpm exec nx serve laracraft            # Web-App
pnpm exec nx run-many -t lint test typecheck build
```

## Dokumentation

- [Architektur](docs/ARCHITECTURE.md)
- [Entscheidungen (ADRs)](docs/adr/README.md)
- [Roadmap](docs/ROADMAP.md)
- [Design-Dokument (alle Ansichten)](docs/design/index.html) – UI-Änderungen werden zuerst dort vorgeschlagen, siehe [Design](docs/DESIGN.md)
- [Offene Fragen an den PO](docs/OPEN-QUESTIONS.md)
- [M0-Bericht](docs/milestones/M0.md)
- [MVP-Bericht (M1 + M2)](docs/milestones/MVP.md)
