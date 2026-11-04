# ADR-0006: Bedrock Edition als zweites Ziel

- Status: **Vorgeschlagen** (PO-Vorgabe 2026-11-04: „nicht nur für die Java Edition, sondern auch Bedrock“)
- Datum: 2026-11-04
- Ersetzt teilweise: Briefing „Bedrock nur als späterer Hinweis-Layer“ und Architekturprinzip 4 („Java Edition only“)

## Kontext

Bisher ist alles auf Java ausgerichtet: die Registry (Java-Blockstates), das Dateiformat (Java-Palette), die
Build-Order-Regeln und die Bauanleitung. Viele Spieler (Konsole, Handy, Windows) spielen Bedrock. Die Unterschiede
sind real und betreffen genau unseren Kern:

- **Blocknamen und -zustände:** Bedrock nutzt teils andere IDs und Zustände (z. B. abweichende Namen für
  Ausrichtung/Hälfte, andere Varianten-Modelle). Ein Teil ist seit den Bedrock-Angleichungen gleich, ein Teil nicht.
- **Platzierung und Erreichbarkeit:** u. a. andere Reichweite und andere Regeln für das Bauen an Kanten und das
  Platzieren unter sich („Bridging“).
- **Redstone:** keine Quasi-Konnektivität bei Kolben/Spendern, andere Kolben-Mechanik (z. B. Schleimblöcke und
  Kolben-Timing), Observer- und Verstärker-Verhalten im Detail, Wasser/Lava-Verhalten teilweise anders.
- **Dateien:** `.mcstructure` statt `.schem`/`.litematic` für den Import und Export.

Genau diese Unterschiede entscheiden, ob eine Anleitung im Spiel funktioniert. Ein „Hinweis-Layer“ reicht deshalb
nicht für eine verlässliche Bedrock-Anleitung.

## Entscheidung

1. **Ein internes Modell, zwei Ziel-Profile.** Das Bau-Dokument bleibt in **Java-Blockstates** (kanonisch, ADR-0001
   unverändert). Jeder Bau bekommt eine Ziel-Edition (`metadata.edition: 'java' | 'bedrock'`, wählbar, Standard je
   nach Gerät/letzter Wahl). Format v1 wird dafür um den Wert `bedrock` erweitert (rückwärtskompatibel, keine
   neue Format-Version nötig, da bisher nur `java` erlaubt war).
2. **Bedrock-Mapping in `core-model`:** eine geprüfte Übersetzungstabelle Java-Blockstate → Bedrock-ID + Zustände
   (für alle Registry-Blöcke) mit Kennzeichnung „nicht in Bedrock verfügbar“. Der Editor warnt bei Blöcken, die es
   in der Ziel-Edition nicht gibt.
3. **Edition-Profile in `build-order`:** Planer und Validator bekommen ein `EditionProfile` (Reichweite, Augenhöhe,
   Platzierungsregeln, Redstone-Sicherheitsregeln, Flüssigkeitsregeln). Die Golden-Tests laufen für **beide**
   Profile; Referenzbauten, die nur in einer Edition funktionieren (z. B. Quasi-Konnektivitäts-Schaltungen), sind als
   solche markiert.
4. **Redstone-Module** (`libs/redstone-modules`, M3) tragen eine Kompatibilitätsangabe pro Edition; Lara wählt nur
   Module, die in der Ziel-Edition getestet sind.
5. **Anleitung und Texte** zeigen Bedrock-Bezeichnungen und -Hinweise, wenn die Ziel-Edition Bedrock ist.
6. **Formate (M4):** `.mcstructure` für Bedrock-Import und -Export zusätzlich zu `.schem`/`.litematic`.
7. **Recherche zuerst:** Jede Regel-Abweichung wird vor der Umsetzung mit Quelle belegt (minecraft.wiki,
   Bedrock-Dokumentation, Changelogs); was nicht belegt ist, bleibt als offene Frage im Code markiert.

## Alternativen

- **Nur Hinweise für Bedrock** (bisheriger Plan): billig, aber Anleitungen wären in Bedrock teilweise falsch
  (Redstone, Reichweite) – widerspricht unserem Kernversprechen „funktioniert im Spiel genau so“.
- **Zwei getrennte Datenmodelle:** doppelte Registry und doppelte Editor-Logik; Bauten wären nicht zwischen den
  Editionen übertragbar. Verworfen.

## Konsequenzen

- Zusätzliche Pakete in der Roadmap (B1–B5, siehe `docs/ROADMAP.md`).
- Testaufwand für Build-Order steigt (zwei Profile); der unabhängige Validator braucht ebenfalls beide Profile.
- Lara (M3) bekommt die Ziel-Edition als Kontext.
- Architekturprinzip 4 in `docs/ARCHITECTURE.md` lautet künftig: „Java-Blockstates als internes Modell, Java und
  Bedrock als Ziel-Editionen.“
