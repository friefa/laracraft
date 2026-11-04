# ADR-0003: Textur-Quelle und Lizenzen

- Status: **Angenommen** (PO, 2026-11-04: „die beste freie Textur, die sich eignet“)
- Datum: 2026-11-03, Entscheidung 2026-11-04

## Kontext

Wir dürfen keine Mojang-Assets verwenden, wollen aber einen Look nah am Original. Die Lizenz bestimmt, welche
Pflichten wir in App, Store und Repo haben (Attribution, Share-Alike).

## Entscheidung

1. **Pixel Perfection Legacy** (Fortsetzung von XSSheeps Pixel Perfection durch Nova_Wostra u. a.,
   Modrinth-Version `26.3-97.2`, Hash im Manifest gepinnt) ist die primäre Quelle, Lizenz **CC BY-SA 4.0**
   (Ableitung eines BY-SA-Werks; die widersprüchliche Modrinth-Angabe „CC-BY-4.0“ wird ignoriert, wir halten uns
   an die strengere Lizenz). Begründung und verworfene Alternativen (Faithful, VoxeLibre-Set, CE, Fidelity):
   `docs/research/texture-sources.md`.
   - Übernommen werden **nur Block-Texturen (PNG)**, keine anderen Dateien aus dem Archiv (es enthält z. B.
     Mojangs `credits.txt`).
   - **Autorenschaft pro Datei:** Ist die Datei mit XSSheeps Original identisch, wird XSSheep genannt, sonst
     „Nova_Wostra and Pixel Perfection Legacy contributors, based on Pixel Perfection by XSSheep“.
   - Texturen mit unklarer Herkunft oder deutlichem Stilbruch ersetzen wir durch eigene Zeichnungen.
   - Schriftliche Bestätigung der Lizenz durch Nova_Wostra wird angefragt (Aufgabe PO); bis dahin gilt BY-SA 4.0
     gemäß Ableitungskette.
   - Entwicklung mit Originaltexturen nur lokal aus der eigenen Installation (Roadmap P1.11), nie im Repo.
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
