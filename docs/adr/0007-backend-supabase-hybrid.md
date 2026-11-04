# ADR-0007: Backend als Hybrid – Supabase + eigener Lara-Dienst

- Status: **Vertagt** (ADR-0008: v1 ohne Backend; ADR-0007 ist die Vorlage für Accounts/Teilen ab M4)
- Datum: 2026-11-04
- Ersetzt bei Annahme: ADR-0004 (ASP.NET-Core-Backend). ADR-0005 bleibt inhaltlich gültig (Provider-Abstraktion),
  wird aber in TypeScript statt C# umgesetzt.
- Grundlage: `docs/research/backend-supabase-fit.md` (Anforderungs-Abgleich) und
  `docs/research/backend-supabase-risks.md` (unabhängige Gegenposition). Beide kommen unabhängig zum selben Ergebnis.

## Kontext

Das Backend existiert noch nicht. Gebraucht werden: Accounts (E-Mail, Apple, Google – nativ in der App),
Speichern/Teilen von Bauten mit Feed und Suche, Moderation, DSGVO-konform in der EU, und der Lara-Proxy, der
KI-Antworten mit Tool-Aufrufen **mehrere Minuten** lang streamt. Unsere gesamte Engine (Format, Lara-DSL,
Redstone-Module) ist TypeScript.

## Prüfergebnis in Kürze

| Bereich                                       | Ergebnis                                                                                                      |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Postgres, Zugriffsregeln (RLS), Volltextsuche | ✅ passt                                                                                                      |
| Dateispeicher (Bauten, Vorschaubilder)        | ✅ passt (Pro: Uploads weit über unseren 20 MB)                                                               |
| Login E-Mail/Apple/Google, Gast → Konto       | ⚠️ geht, aber: eigener SMTP-Anbieter Pflicht, Apple-Fallstricke, kein offizieller Capacitor-Leitfaden         |
| Account-Löschung                              | ⚠️ eigene Logik nötig (erst Dateien löschen, Apple-Token widerrufen)                                          |
| **Lara-Streaming in Edge Functions**          | ❌ harte Grenze 400 s (Free 150 s), 2 s CPU, Abbruch dokumentiert – **nicht** in Supabase Edge Functions      |
| DSGVO/EU                                      | ⚠️ Region Frankfurt fest wählen, Edge Functions auf Frankfurt pinnen; DPA mit SCCs, kein EU-Anbieter          |
| Lokale Entwicklung, CI, RLS-Tests             | ✅ gut (lokaler Stack per Docker, pgTAP, generierte TS-Typen, Preview-Branches)                               |
| Kosten                                        | ✅ niedrig: ~25 $/Monat (Beta, 1 000 MAU), ~75–210 $/Monat bei 50 000 MAU; Treiber ist die KI, nicht Supabase |
| Betrieb                                       | ⚠️ SLA erst im Enterprise-Tarif; Vorfälle kommen vor                                                          |
| Ausstieg                                      | ✅ machbar (Postgres-Dump, S3-kompatibler Speicher, Self-Hosting)                                             |

## Entscheidung (Vorschlag)

1. **Supabase** (Pro-Tarif, Region **Frankfurt `eu-central-1`**) für **Auth, Postgres, Storage**. Keine
   Geschäftslogik in Edge Functions außer kurzen, unkritischen Hilfsfunktionen (auf Frankfurt gepinnt).
2. **Eigener kleiner Dienst `apps/lara-service`** in **TypeScript** (Node, Container) in einer **EU-Region**
   (Vorschlag: Google Cloud Run Frankfurt; Alternative Fly.io Frankfurt). Aufgaben:
   - Lara-Proxy mit langem Streaming (SSE) gemäß ADR-0005: Anthropic nativ (Standard) + OpenAI-kompatibler Endpunkt.
   - Serverseitige Prüfung von Bau-Uploads und Lara-Befehlen mit **denselben Bibliotheken** wie der Client
     (`@laracraft/core-model`, `@laracraft/lara-dsl`) – keine Portierung nach C#.
   - Rate-Limits und Kostenerfassung pro Nutzer (Tabellen in Supabase-Postgres).
   - Account-Löschung komplett (Dateien, Daten, Auth-User, Apple-Token-Widerruf).
   - Prüft das Supabase-JWT gegen den JWKS-Endpunkt des Projekts (asymmetrische Signaturschlüssel aktivieren).
3. **Pflichtmaßnahmen** (sonst kein Go-live):
   - RLS auf **jeder** Tabelle erzwingen (Migration-Check in CI), Views mit `security_invoker`, pgTAP-Tests für
     alle Zugriffsregeln in der CI; Service-Role-/Secret-Keys **nur** im Lara-Dienst, nie im Client, nie in KI-Tools.
   - Eigener EU-SMTP-Anbieter mit SPF/DKIM/DMARC für Auth-Mails.
   - Supabase erst bei Lara/Teilen aktiv nutzen (App bleibt offline ohne Konto voll nutzbar).
   - Eigene Thumbnails statt kostenpflichtiger Bild-Transformation.
   - Backups: PITR ab Beta-Ende; Storage-Dateien zusätzlich sichern (nicht in Supabase-Backups enthalten).
4. **Test-Projekt vor endgültiger Annahme** (Spike, 1–2 Tage, braucht ein Supabase-Projekt vom PO): native
   Apple/Google-Anmeldung in der Capacitor-App, Gast → Konto, JWT-Prüfung im Lara-Dienst, ein echter Lara-Turn
   mit Streaming über den Lara-Dienst, Account-Löschung inkl. Apple-Widerruf, RLS-Tests in CI.

## Alternativen

- **ASP.NET Core komplett selbst (ADR-0004):** kein RLS-Risiko, geringster Lock-in, C#-Know-how des PO; aber
  deutlich mehr Eigenbau (Auth, Storage, Admin) und doppelte Validierung (TS + C#). Bleibt die Rückfalloption.
- **Supabase komplett inkl. Edge Functions für Lara:** scheitert an der 400-s-Grenze.
- **Firebase:** Auth-Daten nur in den USA, NoSQL, starker Lock-in. **PocketBase:** Single-Node, 0.x.
  **Convex:** starker Lock-in. **Appwrite:** ähnlich wie Supabase, kleiner Ökosystem-Vorteil für Supabase.

## Konsequenzen

- Neue Projekte im Monorepo: `supabase/` (Migrationen, RLS-Policies, pgTAP-Tests, Seeds) und `apps/lara-service`.
- CI bekommt einen Job für den lokalen Supabase-Stack + pgTAP und einen Build/Test-Job für den Lara-Dienst.
- Kein .NET-SDK nötig.
