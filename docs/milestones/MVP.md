# MVP (M1 + M2) – Demo und bekannte Lücken

Stand: 2026-11-04 · Branch `claude/peaceful-archimedes-3vk3n8`

## Demo

```sh
pnpm install
pnpm exec nx serve laracraft          # http://localhost:4200
```

1. **Meine Bauten** (`mvp-list.png`): „Beispiel öffnen“ → z. B. _Haus_ oder _2×2-Kolbentür_. Alternativ „Neuer Bau“ oder
   eine `.lcb.json` importieren. Alles wird lokal (IndexedDB) gespeichert, offline nutzbar.
2. **Editor** (`mvp-editor.png`): 1 Finger drehen, 2 Finger zoomen/verschieben, Tippen setzt den aktiven Block.
   Werkzeuge Setzen/Entfernen/Pipette/Auswahl; mit Auswahl Füllen, Ersetzen, Drehen, Spiegeln, Kopieren, Ausschneiden,
   Einfügen. Ebenen-Regler rechts, Palette unten (Suche de/en, Favoriten, zuletzt benutzt). Undo/Redo, Autosave.
   Desktop: Maus (Rechtsklick entfernt, Mittelklick Pipette) und Tastenkürzel. Blöcke verhalten sich wie in
   Minecraft (Zaun-/Scheiben-/Redstone-Verbindungen, Treppenecken, Wandfackeln, obere/untere Hälfte per Klickpunkt,
   Kolben/Observer nach Blickneigung).
3. **Bauanleitung** (⋮ → Bauanleitung; `mvp-guide-step.png`, `mvp-guide-overview.png`): Schritte à 10–30 Blöcke mit
   Phase (Struktur → Redstone → Strom → Flüssigkeiten → Aufräumen), Material pro Schritt und gesamt (Stacks,
   Abhakliste), pro Block Standposition, Blickrichtung, Klickfläche, Hälfte, Sprung, Schleichen, Rechtsklicks.
   Hinweise wie „Kreis offen lassen“. Wischen/Pfeiltasten zum Blättern, Bottom-Sheet mit drei Stufen.
4. **Qualitätsnachweis**: `libs/build-order/src/lib/integration.spec.ts` – Planer × unabhängiger Validator auf allen
   sechs Referenzbauten des Briefings (Haus, Turm mit Überhang, Sandstruktur, 2×2-Kolbentür, Observer-Takt,
   Wasserfall): **0 Regelverstöße**. Zusätzlich 50 760-Block-Stadt: 0 Verstöße, 0 Warnungen, Planung ≈ 1–2 s
   (`libs/build-order/scripts/validate-city.ts`).
5. Entwickeln mit Originaltexturen (nur lokal, nie im Repo/Build): `textures:import-local -- --jar <client.jar>`,
   dann `nx serve laracraft --configuration=local-textures`.

## Zahlen

| Bereich  | Wert                                                                                                    |
| -------- | ------------------------------------------------------------------------------------------------------- |
| Registry | 234 Blöcke, Java **26.3** (Data Version 5023), deutsche Blocknamen                                      |
| Texturen | Pixel Perfection Legacy (CC BY-SA 4.0), 186 Texturen, Autorenschaft pro Datei                           |
| Bundle   | initial ≈ 300 kB (83 kB übertragen); three.js lazy (588 kB); eigene Worker-Chunks für Mesher und Planer |
| Mesher   | ≈ 53 000 Blöcke in ≈ 0,1 s (Node)                                                                       |
| Planer   | 50 760 Blöcke → 52 448 Platzierungen, 1 688 Gerüst-Abbauten (−71 % durch Sprung/Säulen), ≈ 1–2 s        |
| Tests    | alle Projekte grün (Lint, Typecheck, Vitest, Build, Textur-Validierung)                                 |

## Bekannte Lücken

**Ungeprüft auf echten Geräten.** Alles wurde in Node-Tests und headless Chrome (SwiftShader) verifiziert, nicht auf
iOS/Android-Hardware. Offen: Touch-Prototyp mit echten Nutzern (größtes UX-Risiko laut Briefing), 60 fps bei 50 000
Blöcken auf einem Mittelklasse-Android (P1.9), iOS-WebView-Verhalten. → Frage 9 an den PO (Testgeräte).

Engine/Regeln:

- Kein Laufweg-Modell: Der Planer prüft nicht, ob der Spieler die Standposition erreichen kann.
- Restliche Gerüste vor allem für nach außen zeigende Treppen in großer Höhe (kein Bauen an der Kante im Schleichen).
- Nicht im Survival herstellbare Zustände (ausgefahrene Kolben, gedrückte Knöpfe) werden mit Warnung gesetzt.
- Wasserausbreitung wird nicht simuliert; Fließwasser-Zellen gelten nach den Quellen als belegt.
- Falltüren und hängende Laterne: vereinfachte Platzierungsregeln; Tür-Scharnier bei Doppeltüren nicht abgeleitet.
- Redstone-Leiter-Erkennung vereinfacht (z. B. Leuchtstein fälschlich als Leiter).
- Doppelstufen sind eine Aktion statt zwei Klicks.

Darstellung:

- Truhe ohne Textur (Entity-Textur, braucht eigenes Modell), Observer-Front im Stil ersetzen, Animationen nur erstes
  Frame, keine Mipmaps, Textur-Rotation auf Flächen (z. B. Observer-Pfeil) nicht gedreht.
- Standposition wird relativ zum Bau angegeben (keine Weltkoordinaten).

App:

- Auf dem Handy verdecken Editor/Anleitung Kopf- und Fußzeile; Disclaimer und Sprache sind über Liste und Menü
  erreichbar (Briefing verlangt „sichtbar“ – prüfen, ob das reicht).
- Export auf Android ohne Web-Share-Dateiunterstützung unzuverlässig (Capacitor Filesystem/Share fehlt).
- App-Icons und Splash noch Capacitor-Standard.
- Undo-Buttons zeigen keine Aktionsbezeichnung.

Recht/Organisation:

- Lizenzbestätigung von Nova_Wostra (Pixel Perfection Legacy) steht aus.
- DRM-freier Download von Texturen und Atlas vor Store-Release (CC BY-SA, ADR-0003).
- Offene PO-Fragen 3–10 (Lizenz des Codes, Nutzerbauten, Altersgruppe, Monetarisierung, Hosting, Offline, Geräte, Größe).

## Nächste Schritte (Vorschlag)

1. Gerätetest + Performance-Messung (P1.9), Touch-Feedback einarbeiten.
2. M3 Lara: `apps/api` (.NET 10), `ILlmProvider` + Anthropic, Lara-DSL + Interpreter, erste Redstone-Module.
3. M4 Teilen: Accounts, Veröffentlichen, `.schem`/`.litematic`, PDF-Anleitung.
