# ADR-0003: Textur-Quelle und Lizenzen

- Status: **Vorgeschlagen** – Freigabe durch PO **zwingend**, bevor Fremd-Texturen ins Repo kommen
- Datum: 2026-11-03

## Kontext

Wir dürfen keine Mojang-Assets verwenden, wollen aber einen Look nah am Original. Die Lizenz bestimmt, welche
Pflichten wir in App, Store und Repo haben (Attribution, Share-Alike).

## Entscheidung (Vorschlag)

1. **Pixel Perfection** (Grundlage der Texturen von VoxeLibre/MineClone2) als primäre Quelle,
   vorbehaltlich der Lizenzprüfung (Ergebnisse: `docs/research/texture-sources.md`). Nach unserem
   Kenntnisstand: CC BY-SA 4.0.
2. **Manifest-Pflicht**: `assets/textures/manifest.json` mit Quelle, Autoren, SPDX-Lizenz, Änderungen und
   Share-Alike-Kennzeichen für jede Datei. Der Validator in `tools/textures` lässt die CI fehlschlagen, wenn
   eine Datei keinen Eintrag hat oder die Lizenz nicht auf der Allow-List steht.
3. **Attribution**: `assets/LICENSES.md` und `credits.json` werden aus dem Manifest generiert. Die App zeigt sie
   unter „Credits“.
4. **Share-Alike**: Texturen, das daraus erzeugte Atlas-Bild und eigene Ergänzungen, die von diesen Texturen
   abgeleitet sind, stehen unter CC BY-SA 4.0 und werden als solche ausgewiesen. Der App-Code ist davon
   **nicht** betroffen (eine Sammlung bzw. Nutzung, kein abgeleitetes Werk der Texturen). Diese Einschätzung
   ist keine Rechtsberatung und vor dem Store-Release juristisch zu bestätigen.
5. **Eigene Texturen** für Lücken im gleichen Stil, mit Manifest-Eintrag (eigene Neuschöpfung: CC0 oder
   CC BY-SA 4.0, je nachdem, ob sie aus Pixel-Perfection-Texturen abgeleitet ist).
6. **Bis zur Freigabe** arbeitet die Pipeline mit selbst generierten Platzhalter-Texturen (CC0).

## Rechercheergebnis (P0.4, Details in `docs/research/texture-sources.md`)

- **Pixel Perfection** von Hugh „XSSheep“ Rutland: **CC BY-SA 4.0** (belegt über VoxeLibre `LEGAL.md` und den
  Luanti-Port; die Originalseite war nur indirekt einsehbar).
- **VoxeLibre ist nicht einheitlich Pixel Perfection.** Concrete, glasierte Keramik, neuere Holzarten und Teile der
  Redstone-Texturen (Mesecons, CC BY-SA 3.0) stammen von anderen Autoren, teils mit unklarer Herkunft.
  **Folge:** Wir importieren nur aus dem Original bzw. dem Luanti-Port (gepinnter Commit), nicht pauschal aus VoxeLibre.
  Jede Zusatzdatei braucht eine Einzelprüfung, sonst zeichnen wir sie selbst oder nutzen den Platzhalter.
- Pixel Perfection 1.11 deckt nur Blöcke bis Minecraft 1.11 ab. Concrete/Concrete Powder u. a. müssen wir
  selbst ergänzen.
- **DRM-Risiko:** CC BY-SA 4.0 §2(a)(5)(C) verbietet technische Schutzmaßnahmen, die die Lizenzrechte
  einschränken, und App-Store-Apps sind verschlüsselt. **Gegenmaßnahme:** Texturen und Atlas zusätzlich DRM-frei
  veröffentlichen (Download-Link in den Credits). Vor Store-Release juristisch prüfen.
- Unklar: ob Pixel Perfection reine Eigenarbeit ist und nicht von Mojang-Texturen abgepaust wurde. Das ist eine
  Restunsicherheit, die wir nicht selbst ausräumen können.
- Vorgeschlagener Credits-Text: „Block textures based on "Pixel Perfection" by Hugh "XSSheep" Rutland, licensed
  under CC BY-SA 4.0. Modified by laracraft contributors: renamed and packed into a texture atlas. The texture atlas
  is distributed under CC BY-SA 4.0.“
- Alternativen: Kenney Voxel Pack (CC0, aber anderer Stil, keine Redstone-Teile), komplett eigene Texturen (CC0,
  schrittweise hinter dem Platzhalter-Fallback).

## Marke

„für Minecraft“ ist erlaubt, „offiziell“ und Logos nicht. Der Disclaimer „Nicht offiziell. Nicht mit Mojang oder
Microsoft verbunden.“ ist in der App (Footer, Credits, Store-Texte) Pflicht.

## Alternativen

- Eigene Texturen komplett selbst zeichnen: rechtlich am saubersten, aber viel Aufwand (~150+ Texturen) und
  Risiko, zu nah an Mojang-Originale zu geraten.
- CC0-Packs: weniger Share-Alike-Pflichten, aber kaum Packs mit vollständiger Abdeckung im passenden Look.

## Konsequenzen

- Wir müssen Quellen-Commit/Version für jede importierte Datei festhalten.
- Bei SA-Texturen müssen wir Änderungen an ihnen ebenfalls unter CC BY-SA veröffentlichen (z. B. im Repo bzw.
  als Download).
