# Offene Fragen an den Product Owner

Stand: 2026-11-03. Bis zur Antwort arbeite ich mit dem jeweils genannten **Default** weiter.

1. ~~**Minecraft-Version**~~ — **Entschieden (PO, 2026-11-04):** immer die aktuellste Version. Java und Bedrock
   teilen seit 2026 die Jahres-Nummerierung (26.x). Umsetzung: Registry auf die aktuelle Java-26.x-Version heben
   (P1.10) und jedem Release zeitnah folgen. Bedrock bleibt laut Briefing ein späterer Hinweis-Layer auf derselben
   Versionsbasis.
2. ~~**Texturen**~~ — **Entschieden (PO, 2026-11-04):** beste geeignete freie Quelle → Pixel Perfection Legacy
   (CC BY-SA 4.0), siehe ADR-0003. Offene Aufgabe für dich: Lizenzbestätigung bei Nova_Wostra anfragen.
3. **Lizenz unseres Codes:** Bleibt das Repo proprietär (closed source) oder soll es (teilweise) Open Source werden,
   z. B. die Redstone-Modul-Bibliothek?
   _Default: proprietär, „UNLICENSED“._
4. **Lizenz von Nutzer-Bauten:** Unter welchen Bedingungen dürfen veröffentlichte Bauten geremixt werden
   (z. B. CC BY 4.0 verpflichtend, oder Nutzer wählt)?
   _Default: Nutzer stimmt beim Veröffentlichen einer Remix-Erlaubnis mit Quellenangabe zu._
5. **Altersgruppe:** Richten wir uns auch an unter 16-Jährige (bzw. unter 13)? Das hat große Auswirkungen auf
   DSGVO-Einwilligung (Art. 8), Store-Einstufung, Moderation und Lara-Inhaltsfilter.
   _Default: ab 13, mit Elternhinweis; Lara mit strengen Inhaltsfiltern._
6. **Monetarisierung und Lara-Budget:** _(PO 2026-11-04: Anbieter Anthropic API, zusätzlich frei konfigurierbarer OpenAI-kompatibler Endpunkt – ADR-0005. Budget pro Nutzer noch offen.)_ Kostenlos mit Limit, Abo, In-App-Käufe? Welches monatliche LLM-Budget pro
   aktivem Nutzer ist akzeptabel?
   _Default: Free-Tier mit Tageslimit für Lara, Abrechnung vorbereitet, aber nicht gebaut._
7. **Hosting:** Bevorzugter Cloud-Anbieter (Azure passt zu .NET) und EU-Region verpflichtend?
   _Default: Azure, Region West-/Nordeuropa; Code bleibt cloud-neutral (S3-kompatibler Storage, Postgres)._
8. **Account-Pflicht und Offline:** Soll der Editor ohne Account und offline voll nutzbar sein (Account nur für
   Lara und Teilen)?
   _Default: ja, offline-first; Account nur für Lara/Teilen._
9. **Testgeräte:** Welche Geräte stehen für den Touch-Prototyp und das Performance-Budget zur Verfügung
   (Referenz „Mittelklasse-Android“, minimale iOS-/Android-Version)?
   _Default: Referenz Samsung Galaxy A5x-Klasse, iOS 17+, Android 10+ (API 29)._
10. **Maximale Baugröße:** Welche Bauten sollen wir unterstützen?
    _Default: Format bis 1024 pro Achse; Editor-/Performance-Ziel 50 000 Blöcke, weiche Warnung ab 200 000._
