# laracraft – Design (Stand 2026-11-04)

Entscheidung PO: **verspielter, freundlicher Lern-App-Stil** (Referenz: Duolingo). Wir übernehmen den _Stil_, nicht die
Marke: keine Eule/Maskottchen-Kopie, nicht exakt deren Farben, nicht deren (proprietäre) Schrift. Ebenso nichts, was wie
offizielles Minecraft aussieht (kein Minecraft-Font, keine Mojang-UI, kein Logo-Stil).

Quelle der Wahrheit für Tokens und Basis-Komponenten: `apps/laracraft/src/styles.scss`.

## Prinzipien

1. **Dick und drückbar.** Buttons und Karten haben 2 px Rand, große Radien (16 px) und eine dunklere Unterkante
   (4 px), die sich beim Drücken „eindrückt“ (`.lc-btn`, `.lc-card`).
2. **Kräftige Farben mit Bedeutung.** Grün = Hauptaktion/Erfolg/Weiter, Blau = Auswahl/sekundär/Links,
   Orange = Hinweis/Redstone/Aufpassen, Rot = Entfernen/Fehler, Gelb = Hervorhebung. Viel Weiß, kühle Neutraltöne.
3. **Runde, fette Schrift.** Nunito (OFL, lokal gebündelt). Fließtext 600, Labels/Buttons 800–900, Buttons in
   Versalien mit Laufweite.
4. **Eine Sache pro Bildschirm.** Große Haupt-CTA unten (volle Breite auf dem Handy), klare Fortschrittsanzeige.
5. **Kleine Erfolgsmomente.** Kurze federnde Animationen (`.lc-pop`, `--lc-ease-bounce`) beim Abschließen eines
   Schritts, Speichern, Setzen. Immer `prefers-reduced-motion` respektieren.
6. **Touch zuerst.** Ziele ≥ 48 px, Abstände großzügig, Daumenzone unten.
7. **Hell und dunkel.** Alle Farben über Tokens; Dark-Mode über `prefers-color-scheme` und `data-theme`.

## Bausteine

| Klasse                                                                                             | Zweck                     |
| -------------------------------------------------------------------------------------------------- | ------------------------- |
| `.lc-btn` + `--primary/--secondary/--warn/--danger/--ghost/--selected`, `--sm/--lg/--block/--icon` | Buttons                   |
| `.lc-card`, `.lc-card--interactive`                                                                | Karten, Panels            |
| `.lc-progress` (`style="--value: 0.4"`)                                                            | dicker Fortschrittsbalken |
| `.lc-pill` + `--blue/--orange/--red`                                                               | Badges (Phase, Status)    |
| `.lc-input`                                                                                        | Textfelder                |
| `.lc-pop`                                                                                          | einmalige Federanimation  |

## Bildschirm-Leitlinien

- **Meine Bauten:** große Begrüßung, Karten mit Vorschau-Kachel (Blockanzahl/Größe), primärer „Neuer Bau“-Button,
  Beispiele als bunte Karten.
- **Editor:** 3D-Ansicht bleibt ruhig; Werkzeugleiste unten als dicke Icon-Buttons (aktives Werkzeug `--selected`),
  Palette als Bottom-Sheet mit großen Blockkacheln.
- **Bauanleitung = Lektion:** oben dicker Fortschrittsbalken über alle Schritte + Schließen-X; unten großer grüner
  „Weiter“-Button; nach jedem Schritt kurzer Erfolgsmoment („Schritt geschafft!“); Phase als farbige Pill
  (Struktur grün, Redstone orange, Strom gelb, Flüssigkeiten blau, Aufräumen grau).
