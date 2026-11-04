# ADR-0004: Backend-Stack

- Status: **Vorgeschlagen** – wird bei Annahme von ADR-0007 ersetzt
- Datum: 2026-11-03

## Kontext

Das Backend übernimmt Auth, Speicherung/Teilen von Bauten, Feed/Suche, Moderation und den LLM-Proxy für Lara
(keine API-Keys im Client). Der Product Owner kommt aus .NET/C#.

## Entscheidung

- **ASP.NET Core auf .NET 10 (LTS)**, Minimal APIs gruppiert nach Feature, `Nullable` an,
  `TreatWarningsAsErrors`, .NET-Analyzer + `AnalysisLevel=latest-recommended`.
- **PostgreSQL** mit EF Core (Npgsql). Volltextsuche zunächst über Postgres (`tsvector`), Tags als Array/Join-Tabelle.
- **Object Storage** S3-kompatibel (AWS S3, Azure Blob über Adapter, MinIO lokal) für Baudateien (Format v1)
  und Vorschaubilder. Uploads über pre-signed URLs.
- **Auth**: ASP.NET Core Identity bzw. OpenID-Connect-Flows für E-Mail (Magic Link oder Passwort),
  Sign in with Apple, Google; eigene JWTs (kurzlebiger Access-Token + Refresh-Token) für die App.
- **API-Vertrag**: OpenAPI (built-in `Microsoft.AspNetCore.OpenApi`), TS-Client wird generiert.
- **LLM-Proxy**: Streaming per Server-Sent Events, siehe ADR-0005.
- **Betrieb**: Container-Image, lokale Entwicklung mit Docker Compose (Postgres, MinIO). Hosting-Region EU (DSGVO).
- **Validierung**: Bau-Uploads werden serverseitig mit derselben Logik wie `libs/core-model` geprüft
  (Grenzen, Palette). Dafür entweder eine C#-Portierung des Format-Validators mit gemeinsamen Testvektoren oder
  Node-Sidecar; Entscheidung in M4.

## Alternativen

- Node/NestJS: eine Sprache im Stack, Code-Sharing mit der Engine. Dagegen: Vorrang für .NET laut Briefing,
  Know-how des POs.
- Firebase/Supabase: schneller Start, aber Lock-in und LLM-Proxy/Rate-Limits ohnehin selbst zu bauen.

## Konsequenzen

- Gemeinsame Verträge (Format, DSL-Schema) werden als JSON Schema + Testvektoren in beiden Sprachen geprüft.
- CI braucht einen .NET-Job ab M3.
