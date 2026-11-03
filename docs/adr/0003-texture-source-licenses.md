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
