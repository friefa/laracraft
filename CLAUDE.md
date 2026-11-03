# Hinweise für Agenten

- Lies zuerst `docs/ARCHITECTURE.md`, die ADRs in `docs/adr/` und dein Paket in `docs/ROADMAP.md`.
- Paketmanager ist **pnpm** (nicht npm). Befehle über `pnpm exec nx …`.
- Engine-Libs (`type:engine`): kein DOM, kein three.js, kein Angular. Verträge in `libs/core-model` ändert nur der Lead.
- Ziel ist Minecraft **Java Edition**. Keine Bedrock-Logik vermischen.
- Keine Mojang-Assets. Jedes Asset braucht einen Eintrag in `assets/textures/manifest.json`.
- Code und Kommentare auf Englisch, UI-Texte über i18n (de/en).
- Fertig heißt: `lint`, `typecheck` und `test` für die betroffenen Projekte sind grün und Prettier ist sauber.
