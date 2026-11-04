# Backend-Evaluation: Supabase als komplettes Backend

Status: Recherche-Input zu ADR-0004 (Backend-Stack, _Vorgeschlagen_) und ADR-0005 (LLM-Proxy). Stand: 2026-11-04.
Dieses Dokument trifft keine Entscheidung; es prüft, ob Supabase die Anforderungen aus `docs/ARCHITECTURE.md`
§6–§7 und `docs/OPEN-QUESTIONS.md` (Offline-first, Account nur für Lara/Teilen, EU-Hosting) abdeckt.

Legende: **[V]** verifiziert in offizieller Doku/Primärquelle (gelesen am 2026-11-04) ·
**[U]** unverifiziert (Forum, Blog, Drittanbieter, Schlussfolgerung oder Erinnerung).
Bewertung: ✅ passt · ⚠️ passt mit Einschränkung/Mehraufwand · ❌ passt nicht.
Quellen-Kürzel `[Sx]` siehe Abschnitt 14.

## 1. Kurzfazit

| #   | Thema                   | Bewertung | Kernaussage                                                                                                                                                                        |
| --- | ----------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Auth                    | ⚠️        | Apple/Google nativ per `signInWithIdToken`, anonym + Linking vorhanden. Kein offizieller Capacitor-Guide; Account-Löschung scheitert, solange Storage-Objekte dem User gehören.    |
| 2   | Datenbank               | ✅        | Normales Postgres mit RLS, `german`/`english` FTS, PITR ab Small-Compute (+100 $/Monat).                                                                                           |
| 3   | Storage                 | ✅/⚠️     | 20 MB kein Problem (Free 50 MB, Pro bis 500 GB). Image Transformations teuer pro Originalbild → Thumbnails im Client erzeugen.                                                     |
| 4   | Lara-Proxy (Edge Fn.)   | ❌/⚠️     | **Harte Wall-Clock-Grenze 400 s (Pro) / 150 s (Free), nicht konfigurierbar**, 2 s CPU, 256 MB. Für „mehrere Minuten“ pro Turn mit Tool-Loop zu knapp → separater Dienst empfohlen. |
| 5   | Shared TS-Code          | ⚠️        | npm-Specifier + Imports außerhalb von `supabase/` möglich; Bundle max. 20 MB (CLI) / 5 MB (server-seitig). Deno statt Node → Build-Setup im Nx-Monorepo nötig.                     |
| 6   | DSGVO/EU                | ⚠️        | Frankfurt wählbar, DPA mit SCCs gilt automatisch. Edge Functions laufen standardmäßig in der Region **nächst zum Nutzer** (inkl. London/Zürich) → per `x-region` pinnen.           |
| 7   | Lokale Entwicklung & CI | ✅        | CLI + Docker (oder kompatibel), Migrationen als SQL, pgTAP (`supabase test db`), `gen types`, Branching per GitHub.                                                                |
| 8   | Kosten                  | ✅        | Beta (1 000 MAU): ca. 25–35 $/Monat. 50 000 MAU: ca. 75–250 $/Monat (ohne LLM). Team-Plan (599 $) nur für SOC2-Report/SLA-Mail nötig.                                              |
| 9   | Betrieb                 | ⚠️        | Uptime-SLA **nur Enterprise**. Häufige kleinere Incidents (v. a. Management-API, Logs, us-east).                                                                                   |
| 10  | Lock-in/Exit            | ✅/⚠️     | Postgres + S3-API + Open-Source-Komponenten; Self-Hosting ohne Branching/PITR/Management-API. Auth-Exit mit bcrypt-Hashes möglich [U].                                             |
| 11  | Realtime                | ✅        | Broadcast/Presence; Pro 500 gleichzeitige Verbindungen (ohne Spend-Cap 10 000).                                                                                                    |

## 2. Auth

| Anforderung                                       | Supabase-Lösung                                                                                                                                                        | Grenzen/Zahlen                                                                                                                                                                           | Bewertung | Quelle                    |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------- |
| E-Mail (Magic Link/Passwort)                      | Supabase Auth, OTP/Magic Link, Passwort.                                                                                                                               | Eingebauter Mailversand **2 Mails/Stunde/Projekt**, nur mit eigenem SMTP oder Send-Email-Hook anhebbar → eigener SMTP-Anbieter Pflicht. OTP: 60-s-Fenster pro User.                      | ⚠️        | [S21] V                   |
| Sign in with Apple (iOS nativ)                    | Native ID-Token von Apple → `signInWithIdToken`. Nonce: gehashter Nonce an Apple, roher an Supabase.                                                                   | Apple liefert den Namen nur beim ersten Login (sofort per `updateUser` speichern). Nativ-only braucht keine 6-monatige Secret-Rotation; Web/Android-OAuth-Flow schon.                    | ✅        | [S14] V                   |
| Sign in with Apple (Android/Web)                  | OAuth-Flow (`signInWithOAuth`) mit Services ID; kein natives Apple auf Android.                                                                                        | Client-Secret aus `.p8` **alle 6 Monate neu erzeugen**, sonst Login-Ausfall. Bei Nativ+Web: Services ID zuerst in „Client IDs“.                                                          | ⚠️        | [S14] V                   |
| Google nativ (iOS/Android)                        | Google-ID-Token (GoogleSignIn-iOS / Android Credential Manager) → `signInWithIdToken`. Mehrere Client-IDs (Web, iOS, Android) kommagetrennt.                           | Nonce-Prüfung standardmäßig an; nur abschalten, wenn die Client-Lib Nonces nicht kann (Flutter/iOS-Beispiel schaltet ab). SHA-1-Fingerprints für Debug + Release.                        | ✅        | [S15] V                   |
| Capacitor 8 konkret                               | Kein offizieller Capacitor-Guide. Community-Weg: natives Plugin (z. B. `@capgo/capacitor-social-login`) liefert ID-Token → `signInWithIdToken`.                        | Plugin-Abhängigkeit von Drittanbieter; Nonce-Unterstützung des Plugins prüfen.                                                                                                           | ⚠️        | [S16] V (fehlt), [S24] U  |
| Deep Links/Redirects (Magic Link, OAuth-Fallback) | Custom Scheme oder Universal Links; Redirect-URL in „Additional Redirect URLs“ eintragen.                                                                              | AASA-Datei für Universal Links muss selbst gehostet werden. Native ID-Token-Logins brauchen keinen Redirect.                                                                             | ✅        | [S16] V                   |
| Token-Refresh                                     | supabase-js verwaltet Session/Refresh.                                                                                                                                 | Rate-Limit `/auth/v1/token`: 150 Requests/5 min pro IP (anpassbar). Gelöschte User behalten gültiges JWT bis Ablauf.                                                                     | ✅        | [S21] V, [S19] V          |
| App-Store-Regel Login-Dienste                     | Apple-Login anbieten (oder gleichwertigen Dienst).                                                                                                                     | Guideline 4.8 verlangt bei Google-Login „another login service“ mit Datensparsamkeit/E-Mail-Verbergen – Apple ist der übliche Weg. Gilt für alle Backends gleich.                        | ✅        | [S23] V                   |
| Gast/anonym + späteres Linking                    | Anonymous Sign-ins; Umwandlung via `updateUser` (E-Mail) oder `linkIdentity` (OAuth, auch mit nativem ID-Token in JS). Manuelles Linking muss aktiviert werden (Beta). | 30 anonyme Sign-ins/Stunde/IP (anpassbar); CAPTCHA/Turnstile „strongly recommended“. Kein Auto-Cleanup anonymer User. Ob Anonyme als MAU zählen, steht nicht in der Doku.                | ⚠️        | [S17] V, [S18] V, [S22] V |
| Offline ohne Account                              | Kein Supabase-Login nötig, solange Lara/Teilen nicht genutzt werden.                                                                                                   | Empfehlung: anonymen Login **erst** beim ersten Lara-/Teilen-Aufruf (spart MAU, vermeidet Datenmüll) [U, Schlussfolgerung].                                                              | ✅        | [S22] V                   |
| Account-Löschung (DSGVO + App Store 5.1.1(v))     | Edge Function mit Secret Key ruft `auth.admin.deleteUser()`; eigene Tabellen per `on delete cascade` auf `auth.users`.                                                 | **„You cannot delete a user if they are the owner of any objects in Supabase Storage.“** → vorher alle Objekte des Users löschen (Storage-API, nicht nur SQL). Kein eingebautes Cascade. | ⚠️        | [S19] V, [S20] V, [S23] V |
| Apple-Token-Widerruf bei Löschung                 | Nicht in Supabase-Doku gefunden → selbst per Apple-REST-API umsetzen.                                                                                                  | Offen, im Test-Projekt prüfen.                                                                                                                                                           | ⚠️        | U                         |

## 3. Datenbank

| Anforderung                             | Supabase-Lösung                                                                                                       | Grenzen/Zahlen                                                                                                                                                                     | Bewertung | Quelle                    |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------- |
| Postgres + RLS (privat/öffentlich/Link) | Volles Postgres, RLS-Policies mit `auth.uid()`/JWT-Claims; Link-Sharing über Token-Spalte + RPC (`security definer`). | Anonyme User haben Rolle `authenticated` → Policies müssen `is_anonymous` prüfen (restrictive policies).                                                                           | ✅        | [S17] V                   |
| Remix-Herkunft, Tags, Likes, Meldungen  | Normale Tabellen/Fremdschlüssel; Moderations-Queue als Tabelle + Edge Function/RPC mit Secret Key.                    | Keine Besonderheit.                                                                                                                                                                | ✅        | U (Standard-PG)           |
| Volltextsuche de + en                   | Generierte `tsvector`-Spalte + GIN-Index; supabase-js `textSearch(col, q, { config, type: 'websearch' })`.            | Doku-Beispiele nur `english`; Postgres liefert `german_stem` (Snowball) mit. Gemischtsprachige Titel → zwei Spalten oder `simple` + Sprachfeld.                                    | ✅        | [S28] V, [S29] V, [S30] V |
| Pagination                              | `range()` / Keyset über RPC.                                                                                          | Keine Besonderheit.                                                                                                                                                                | ✅        | U                         |
| DB-Größe                                | Free 500 MB; Pro/Team 8 GB pro Projekt inkl., danach 0,125 $/GB.                                                      | Baudateien liegen in Storage, nicht in der DB.                                                                                                                                     | ✅        | [S2] V                    |
| Verbindungen                            | Supavisor-Pooler.                                                                                                     | Nano/Micro 60 direkt/200 Pooler; Small 90/400 (~15 $); Medium 120/600 (~60 $); Large 160/800 (~110 $).                                                                             | ✅        | [S25] V                   |
| Backups/PITR                            | Pro tägl. Backup 7 Tage, Team 14, Enterprise bis 30; Free keine.                                                      | PITR: ab **Small-Compute**, 7 Tage ≈ 100 $/Monat, 14 ≈ 200 $, 28 ≈ 400 $; RPO ≤ 2 min. **Storage-Objekte sind nicht in Backups.** Physische Backups nicht downloadbar → `db dump`. | ⚠️        | [S26] V                   |

## 4. Storage

| Anforderung                          | Supabase-Lösung                                                                                     | Grenzen/Zahlen                                                                                                                                                          | Bewertung | Quelle           |
| ------------------------------------ | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---------------- |
| Baudateien bis ~20 MB (meist < 1 MB) | Buckets mit Größen-/MIME-Limit pro Bucket.                                                          | Globales Limit Free 50 MB, Pro/Team bis 500 GB. Standard-Upload empfohlen ≤ 6 MB, darüber resumable (TUS).                                                              | ✅        | [S31] V, [S32] V |
| Vorschaubilder                       | Öffentlicher Bucket für öffentliche Bauten (hohe CDN-Hitrate), privater Bucket + Signed URLs sonst. | Upsert auf gleichen Pfad wird wegen CDN-Staleness nicht empfohlen → versionierte Pfade.                                                                                 | ✅        | [S32] V, [S36] V |
| Signed URLs                          | `createSignedUrl(path, expiry)`.                                                                    | Smart CDN cached pro Token; Widerruf löscht Cache nicht – nur Objekt löschen (bis 60 s Invalidierung).                                                                  | ⚠️        | [S34] V, [S36] V |
| Image Transformation                 | Ab Pro, on-the-fly Resize.                                                                          | 100 Originalbilder/Monat inkl., dann **5 $ pro 1 000 Originalbilder**; max. 25 MB, 2 500 px, 50 MP. Bei 100 000+ Vorschaubildern teuer → Thumbnails im Client erzeugen. | ⚠️        | [S33] V          |
| CDN/Egress                           | Smart CDN ab Pro.                                                                                   | Je 250 GB cached + 250 GB uncached inkl. (Pro); danach 0,03 $/GB cached, 0,09 $/GB uncached. Free: 5 + 5 GB.                                                            | ✅        | [S34] V, [S37] V |
| RLS auf Storage                      | Policies auf `storage.objects`, Helfer `storage.foldername()`; Ordner = User-ID.                    | Ohne Policy keine Uploads. Secret/Service-Key umgeht RLS.                                                                                                               | ✅        | [S35] V          |
| Serverseitige Validierung (ADR-0004) | Upload über Edge Function (Validator aus `libs/core-model`) statt direkt in Bucket.                 | CPU 2 s pro Request; Dekompression großer Bauten (64 Mio. Zellen) könnte das sprengen → messen.                                                                         | ⚠️        | [S1] V, U        |

## 5. Lara-LLM-Proxy als Edge Function

| Anforderung                          | Supabase-Lösung                                                                                                                                                                                           | Grenzen/Zahlen                                                                                                                                                                                   | Bewertung | Quelle                    |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- | ------------------------- |
| Streaming (SSE) mehrere Minuten      | `ReadableStream` mit `text/event-stream`; Upstream-Pipe mit `EdgeRuntime.waitUntil()` am Leben halten (sonst `EarlyDrop`).                                                                                | **Wall-Clock Free 150 s, Paid 400 s – harte Grenze**, Abbruch mit HTTP 546. „Plans to make it configurable“, derzeit nur per Self-Hosting änderbar. `waitUntil` verlängert die Grenze **nicht**. | ❌        | [S1] V, [S3] V, [S4] V    |
| Idle-Timeout                         | –                                                                                                                                                                                                         | Request-Idle-Timeout 150 s → 504. Anthropic-Stream sendet Pings; Verhalten bei langem Denken ohne Output testen.                                                                                 | ⚠️        | [S1] V                    |
| CPU/Memory                           | –                                                                                                                                                                                                         | 2 s CPU-Zeit (I/O-Warten zählt nicht [U]), 256 MB RAM. Schema-Validierung der Tool-Calls + SSE-Parsing über einen langen Turn: messen.                                                           | ⚠️        | [S1] V                    |
| Request-/Response-Größe, Concurrency | Ein V8-Isolate pro Aufruf; globales Gateway routet zum nächsten Standort.                                                                                                                                 | Keine dokumentierten Werte für Body-Größe und Projekt-Concurrency gefunden.                                                                                                                      | ⚠️        | [S8] V, [S1] V (fehlt)    |
| Cold Starts                          | ESZip-Bundle; „Even initial executions are fast (milliseconds)“.                                                                                                                                          | Herstellerangabe; bei 1–2 MB Bundle messen.                                                                                                                                                      | ✅        | [S8] V                    |
| Regionen                             | Ausführung nächst zum Nutzer; pinnen per Header `x-region: eu-central-1` bzw. `forceFunctionRegion`.                                                                                                      | 15 Regionen, EU: Frankfurt, Zürich, Irland, London, Paris. Gepinnte Requests werden bei Ausfall nicht umgeroutet.                                                                                | ✅        | [S5] V                    |
| `@anthropic-ai/sdk`                  | `npm:@anthropic-ai/sdk` per npm-Specifier.                                                                                                                                                                | SDK unterstützt offiziell Deno ≥ 1.28. Ob es im Supabase Edge Runtime (Deno-basiert) streamt, ist nicht dokumentiert → Test.                                                                     | ⚠️        | [S6] V, [S13] V           |
| Secrets                              | `supabase secrets set`, Dashboard; lokal `supabase/functions/.env`. Wirken ohne Redeploy.                                                                                                                 | Namen dürfen nicht mit `SUPABASE_` beginnen.                                                                                                                                                     | ✅        | [S11] V                   |
| Aufruf mit User-JWT                  | `supabase.functions.invoke()` sendet Session-JWT im `Authorization`-Header; `verify_jwt = true` prüft vor dem Handler; `SUPABASE_JWKS` verfügbar.                                                         | Für SSE im Client eher `fetch` + `ReadableStream` mit demselben Header [U].                                                                                                                      | ✅        | [S9] V, [S11] V           |
| Rate-Limit pro User                  | Nicht eingebaut. Doku empfiehlt Upstash Redis; Alternative: Postgres-Tabelle + RPC (atomarer Zähler) – Upstash steht ohnehin auf der Subprozessor-Liste.                                                  | Postgres-Variante ohne Zusatzdienst, aber DB-Last pro Turn.                                                                                                                                      | ⚠️        | [S12] V, [S41] V          |
| Kosten-Metering                      | `usage`-Events aus dem Stream in Tabelle `llm_usage` schreiben (Secret Key, `waitUntil`).                                                                                                                 | Nicht eingebaut; selbst bauen (wie ADR-0005 `UsageMeter`).                                                                                                                                       | ⚠️        | U                         |
| **Alternative für lange Streams**    | Kleiner Lara-Dienst auf Cloud Run (Frankfurt `europe-west3`) oder Fly.io; Auth über Supabase-JWT gegen JWKS `https://<ref>.supabase.co/auth/v1/.well-known/jwks.json` (asymmetrische Keys, z. B. `jose`). | Cloud Run: Timeout bis **60 min** (Default 5 min), Reconnect-fähig bauen. Fly.io: 60 s Idle-Timeout im Proxy → Keepalive-Kommentare [U]. JWKS ~10 min gecacht; bei Rotation ≥ 20 min warten.     | ✅        | [S10] V, [S60] V, [S61] U |

Hinweis: Mit dem Alternativ-Dienst kann der Lara-Proxy in **C#/.NET** (ADR-0005, `ILlmProvider`) bleiben, während
Auth/DB/Storage von Supabase kommen. Der Dienst schreibt Usage über `SUPABASE_DB_URL`/Pooler direkt in Postgres.

## 6. Gemeinsamer TypeScript-Code

| Anforderung                               | Supabase-Lösung                                                                                                                         | Grenzen/Zahlen                                                                                                                                                         | Bewertung | Quelle         |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | -------------- |
| `libs/core-model`, `libs/lara-dsl` nutzen | Imports außerhalb von `supabase/` seit CLI-Deploy `--use-api` „für Monorepo-Setups“; pro Funktion `deno.json` mit Imports/Pfad-Mapping. | Changelog von 2025-02 nannte das „experimental“; aktueller Status nicht in der Doku bestätigt. Deno-Auflösung braucht Dateiendungen bzw. Import-Map für Nx-Pfadaliase. | ⚠️        | [S7] V, [S6] V |
| `fflate`                                  | `npm:fflate` per Specifier oder Mapping in `deno.json`.                                                                                 | Reines JS ohne Node-Spezifika [U] → unkritisch.                                                                                                                        | ✅        | [S6] V         |
| Bundle-Größe                              | ESZip.                                                                                                                                  | **20 MB** lokal per CLI gebündelt, **5 MB** server-seitig gebündelt. Funktionen pro Projekt: Free 100, Pro 1 000.                                                      | ✅        | [S1] V         |
| Alternative                               | Libs vorab mit esbuild zu einer ESM-Datei bündeln (Nx-Target) und in `supabase/functions/_shared` legen.                                | Robust, unabhängig vom experimentellen Pfad [U].                                                                                                                       | ✅        | U              |

## 7. DSGVO/EU

| Anforderung              | Supabase-Lösung                                                                                                     | Grenzen/Zahlen                                                                                                                                                                        | Bewertung | Quelle                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------ |
| EU-Region                | Spezifische Region **Frankfurt (eu-central-1)** wählen, nicht „General Europe“ (kann London/Zürich treffen).        | „Region selection is a data-location control, not proof of regulatory compliance.“                                                                                                    | ✅        | [S27] V                  |
| DPA                      | DPA (Version 1, 2026-08-01) gilt ab Vertragsschluss; Annahme = Unterzeichnung der SCCs (Modul 2/3, irisches Recht). | Daten werden in gewählter Region „stored and primarily Processed“ – Ausnahmen für Betrieb/Recht.                                                                                      | ✅        | [S40] V                  |
| Subprozessoren           | PDF-Liste (Stand 2026-06-01): u. a. AWS, Google, Cloudflare, Fly.io, Vercel, Upstash, Postmark, Sentry, OpenAI.     | Änderungen 30 Tage vorher nur bei Abo der Updates; Widerspruch binnen 5 Tagen.                                                                                                        | ⚠️        | [S41] V, [S40] V         |
| Wo läuft was?            | Auth läuft nur in der Projektregion; DB/Storage in der Projektregion.                                               | **Edge Functions** laufen standardmäßig nahe am Nutzer (weltweit) → für EU-Nutzer i. d. R. EU, aber nicht garantiert; mit `x-region: eu-central-1` pinnen. Smart CDN cached weltweit. | ⚠️        | [S10] V, [S5] V, [S34] V |
| SOC2/ISO                 | SOC 2 Type 2, jährlich; Report nur für **Team/Enterprise**. ISO 27001 auf der Seite nicht erwähnt.                  | HIPAA nur per BAA + Add-on (für uns irrelevant).                                                                                                                                      | ⚠️        | [S38] V                  |
| US-Transfer allgemein    | Datenschutzerklärung nennt Speicherung in den USA/Singapur mit SCCs (betrifft v. a. Kontodaten der Kunden).         | Für Endnutzer-Daten gilt die DPA-Regionszusage. Anthropic-API ist ohnehin US-Transfer (separat zu bewerten).                                                                          | ⚠️        | [S39] V, [S40] V         |
| Datenexport (Art. 15/20) | Selbst bauen: Edge Function sammelt DB-Zeilen + Storage-Objekte des Users.                                          | Nicht eingebaut.                                                                                                                                                                      | ⚠️        | U                        |

## 8. Lokale Entwicklung & CI

| Anforderung          | Supabase-Lösung                                                                                      | Grenzen/Zahlen                                                                                                                | Bewertung | Quelle           |
| -------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------- | ---------------- |
| Lokaler Stack        | `supabase start`: Postgres, Auth, Storage, Realtime, Edge Runtime, Studio, Mailpit.                  | Braucht Docker oder kompatibel (OrbStack, Podman, Rancher, colima); experimenteller nativer Runtime ohne Container.           | ✅        | [S42] V          |
| Migrationen als Code | SQL-Migrationen im Repo, Seed-Datei.                                                                 | Kein EF Core – SQL-first.                                                                                                     | ✅        | [S42] V, [S45] V |
| RLS-Tests            | pgTAP, `supabase test db`; Transaktionen + Negativfälle für `anon`/`authenticated`.                  | Edge-Function-Tests (`deno test`) nicht in der Testing-Übersicht beschrieben.                                                 | ✅        | [S43] V          |
| TS-Typen             | `supabase gen types typescript` (lokal oder `--remote`).                                             | Ersetzt den OpenAPI-generierten Client aus ADR-0004.                                                                          | ✅        | [S44] V          |
| Branching/Preview    | GitHub-Integration: Preview-Branch pro PR (automatisch gelöscht), persistente Branches für Staging.  | Ab ~0,01344 $/Stunde (Micro), nicht vom Spend-Cap gedeckt; Branches starten ohne Daten; OAuth-/SMTP-Secrets sind Platzhalter. | ⚠️        | [S45] V, [S46] V |
| GitHub Actions       | `supabase/setup-cli`, `supabase start` + `supabase test db`; Deploy mit `supabase functions deploy`. | Container-Start im CI kostet Laufzeit [U].                                                                                    | ✅        | [S43] V, [S47] V |

## 9. Kosten

### 9.1 Pläne

| Posten                | Free                     | Pro (ab 25 $/Monat)               | Team (ab 599 $/Monat)   | Quelle          |
| --------------------- | ------------------------ | --------------------------------- | ----------------------- | --------------- |
| MAU                   | 50 000                   | 100 000, dann 0,00325 $/MAU       | wie Pro                 | [S2] V, [S22] V |
| DB                    | 500 MB                   | 8 GB, dann 0,125 $/GB             | wie Pro                 | [S2] V          |
| Storage               | 1 GB, 50 MB/Datei        | 100 GB, dann 0,0213 $/GB          | wie Pro                 | [S2] V          |
| Egress                | 5 GB + 5 GB cached       | 250 + 250 GB, dann 0,09/0,03 $/GB | wie Pro                 | [S37] V         |
| Edge-Function-Aufrufe | 500 000                  | 2 Mio., dann 2 $/Mio.             | wie Pro                 | [S2] V          |
| Compute               | Nano                     | 10 $ Guthaben (= ein Micro)       | wie Pro                 | [S2] V, [S25] V |
| Backups/PITR          | keine                    | 7 Tage; PITR +100 $               | 14 Tage; PITR +100 $    | [S26] V         |
| Pausieren             | nach 7 Tagen Inaktivität | nie                               | nie                     | [S2] V, [S53] V |
| Logs                  | 1 Tag                    | 7 Tage                            | 28 Tage                 | [S2] V          |
| Support               | Community                | E-Mail                            | Priority-E-Mail mit SLA | [S2] V          |

Free ist für Produktion ungeeignet: 150 s Wall-Clock, keine Backups, Pausieren, keine Image Transformations.
Pro hat standardmäßig einen Spend-Cap [S2] V.

### 9.2 Schätzung (ohne LLM-Kosten, ohne SMTP-Anbieter)

Annahmen [U]: pro aktivem Nutzer 2 Bauten in der Cloud à 0,5 MB + 2 Vorschaubilder à 50 KB; 100 Vorschau-Aufrufe
und 5 Bau-Downloads pro MAU und Monat; Lara-Nutzer 50 Turns/Monat; Thumbnails im Client erzeugt (keine Image
Transformations); kein anonymer Login für Offline-Nutzer.

| Szenario                                              | Rechnung                                                                                                                                                                                                                            | Monatlich       |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| (a) Beta, 1 000 MAU                                   | Pro 25 $; Micro durch Guthaben gedeckt; alles weit unter Quoten.                                                                                                                                                                    | **≈ 25 $**      |
| (b) 50 000 MAU, 10 % öffentliche Bauten, 20 % Lara    | Pro 25 $ + Medium-Compute ≈ 60 − 10 $ = 50 $. MAU 50 000 < 100 000. Storage ≈ 60 GB < 100 GB. Egress: Vorschau ≈ 200 GB cached, Downloads ≈ 125 GB + API ≈ 50 GB uncached → in Quote. Edge: 10 000 × 50 = 0,5 Mio. Aufrufe < 2 Mio. | **≈ 75 $**      |
| (b) + PITR 7 Tage + Puffer (doppelter Egress)         | + 100 $ PITR + ≈ 15–30 $ Egress-Überschreitung.                                                                                                                                                                                     | **≈ 190–210 $** |
| (b) mit Image Transformations für 100 000 neue Bilder | + ≈ 500 $ (100 000 / 1 000 × 5 $).                                                                                                                                                                                                  | **+ 500 $**     |
| (b) mit anonymem Login für jede Installation          | MAU-Zahl ungewiss (Anonyme zählen evtl. als MAU, Doku schweigt) → jede 100 000 über Quote ≈ 325 $.                                                                                                                                  | **Risiko**      |

Rechenbasis: [S2] V, [S25] V, [S26] V, [S33] V, [S37] V. Wenn der Lara-Dienst separat läuft (§5), kommen dessen
Kosten (Cloud Run/Fly.io) dazu; die Edge-Aufrufe entfallen dann.

## 10. Betrieb

| Anforderung    | Supabase-Lösung                                                                   | Grenzen/Zahlen                                                                                                                                                                                                                                                                                               | Bewertung | Quelle                    |
| -------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- | ------------------------- |
| SLA            | 99,9 % pro Produkt **nur Enterprise**; Gutschriften 10–30 %, gedeckelt.           | Pro/Team ohne Uptime-SLA. Ausschlüsse u. a. Drittanbieter (AWS, Cloudflare), Standard-SMTP.                                                                                                                                                                                                                  | ⚠️        | [S48] V, [S2] V           |
| Incidents      | Statusseite.                                                                      | 2026-02-12: us-east-2 komplett 3 h 42 min down (DB, Auth, Edge, Storage) durch Konfigurationsfehler. Okt./Nov. 2026: v. a. Management-API, Logs, Pooler/Storage in us-east, 2026-10-13 Edge-Deploy-Störung, 2026-10-22 Lifecycle-Fehler in EU. Weitere Major-Incidents (Juli, Sept. 2026) laut Aggregatoren. | ⚠️        | [S50] V, [S49] V, [S51] U |
| Plattform-APIs | Management-API 120 Requests/min pro User und Scope.                               | Auth-Limits siehe §2.                                                                                                                                                                                                                                                                                        | ✅        | [S52] V, [S21] V          |
| Pausieren      | Free: nach 7 Tagen geringer DB-Aktivität; Wiederherstellung bis 1 Jahr. Pro: nie. | –                                                                                                                                                                                                                                                                                                            | ✅ (Pro)  | [S53] V, [S54] V          |
| Support        | Pro E-Mail; Team Priority mit E-Mail-SLA; Enterprise 24×7.                        | –                                                                                                                                                                                                                                                                                                            | ⚠️        | [S2] V                    |

## 11. Lock-in & Exit

| Anforderung                   | Supabase-Lösung                                                                                                             | Grenzen/Zahlen                                                                                                                                   | Bewertung | Quelle           |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------- | ---------------- |
| Self-Hosting                  | Docker Compose (empfohlen), Kubernetes (Community). Edge Runtime ist Open Source (MIT, „Beta Software“) mit eigenen Limits. | Fehlt: Branching, erweiterte Metriken, verwaltete Backups/PITR, Analytics, Management-API; nur ein Projekt pro Installation.                     | ⚠️        | [S55] V, [S56] V |
| DB-Export                     | `supabase db dump` / `pg_dump` (logisches Backup).                                                                          | Physische Backups nicht downloadbar.                                                                                                             | ✅        | [S26] V          |
| Storage-Export                | S3-kompatible API (List/Get/Put/Multipart).                                                                                 | S3 muss in den Settings aktiviert werden; keine Versionierung.                                                                                   | ✅        | [S57] V          |
| Auth-Export                   | `auth.users` + `auth.identities` per SQL; Passwörter als bcrypt in `encrypted_password`.                                    | Laut Migrationsguides von WorkOS/Kinde importierbar; Apple/Google-Identitäten hängen an `sub` und Client-IDs, bleiben also übertragbar.          | ⚠️        | [S58] U          |
| Migration auf eigenes Backend | RLS-Policies/`auth.uid()` und supabase-js-Aufrufe im Client sind Supabase-spezifisch; Edge Functions sind Deno.             | Aufwand mittel: Datenmodell bleibt, Client-Datenzugriff und Auth-Flows müssen neu. Mit einer dünnen Repository-Schicht im Client begrenzbar [U]. | ⚠️        | U                |

## 12. Realtime (später)

| Anforderung        | Supabase-Lösung                            | Grenzen/Zahlen                                                                                                                                                                                          | Bewertung | Quelle          |
| ------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | --------------- |
| Live-Kollaboration | Broadcast (ChangeSets), Presence (Cursor). | Gleichzeitige Verbindungen: Free 200, Pro 500 (ohne Spend-Cap 10 000); 500 bzw. 2 500 Nachrichten/s; Broadcast-Payload Pro 3 000 KB; 10 Presence-Keys. Inkl. 5 Mio. Nachrichten (Pro), dann 2,50 $/Mio. | ✅        | [S59] V, [S2] V |

## 13. Offene Punkte, die nur ein Test-Projekt klären kann

1. **Stream-Dauer real messen:** Lara-Turn mit Tool-Loop (mehrere Modellaufrufe) in einer Pro-Edge-Function bis zum
   Abbruch laufen lassen; prüfen, ob bei 400 s sauber 546 kommt oder der SSE-Stream still abreißt, und wie sich der
   150-s-Idle-Timeout bei langem Denken ohne Text-Deltas verhält.
2. **CPU-Budget:** Verbrauch von 2 s CPU durch SSE-Parsing, DSL-Schema-Validierung und JSON-Verarbeitung bei einem
   langen Turn; ebenso Format-v1-Validierung (Dekompression) eines 20-MB-Baus.
3. **`npm:@anthropic-ai/sdk` im Edge Runtime:** Streaming, Abbruch (`AbortSignal`) bei Client-Disconnect,
   Bundle-Größe und Kaltstart.
4. **Monorepo-Import:** `libs/core-model` + `libs/lara-dsl` per `deno.json`-Mapping vs. esbuild-Vorbundle; prüfen,
   ob der Deploy ohne `--use-api`/Docker in GitHub Actions funktioniert.
5. **Capacitor 8 nativ:** Apple (iOS nativ, Android über OAuth + Deep Link) und Google (Credential Manager/iOS SDK)
   über ein Capacitor-Plugin mit Nonce; Token-Refresh nach App-Resume; `linkIdentity` mit nativem ID-Token von
   einem anonymen User aus.
6. **Account-Löschung end-to-end:** Storage-Objekte löschen → `deleteUser` → Cascade; Apple-Token-Widerruf;
   Verhalten noch gültiger JWTs.
7. **Zählen anonyme User als MAU?** Im Usage-Dashboard nachsehen.
8. **Edge-Region:** Mit `x-sb-edge-region` prüfen, wo Requests aus DE/AT/CH ohne Pinning landen; Pinning auf
   `eu-central-1` gegen Latenz messen.
9. **Request-Body-Limit** der Edge Functions (nicht dokumentiert) mit 20-MB-Upload testen.
10. **Externer Lara-Dienst:** JWT-Prüfung gegen JWKS (asymmetrische Keys aktivieren) aus Cloud Run Frankfurt,
    inkl. Key-Rotation.

## 14. Quellen

Alle abgerufen am 2026-11-04.

- [S1] Edge Functions Limits – <https://supabase.com/docs/guides/functions/limits>
- [S2] Pricing – <https://supabase.com/pricing>
- [S3] Troubleshooting „wall clock time limit reached“ – <https://supabase.com/docs/guides/troubleshooting/edge-function-wall-clock-time-limit-reached-Nk38bW>
- [S4] Troubleshooting Worker-Timeouts/EarlyDrop – <https://supabase.com/docs/guides/troubleshooting/edge-functions-worker-timeouts-and-websocket-drops>
- [S5] Regional Invocation – <https://supabase.com/docs/guides/functions/regional-invocation>
- [S6] Managing Dependencies – <https://supabase.com/docs/guides/functions/dependencies>
- [S7] Changelog „Deploy Edge Functions without Docker + import files outside of supabase directory“ (2025-02-14) – <https://supabase.com/changelog/33613-deploy-edge-functions-from-cli-without-needing-docker-import-files-outside-of-supabase-directory>
- [S8] Edge Functions Architecture – <https://supabase.com/docs/guides/functions/architecture>
- [S9] Edge Functions Auth – <https://supabase.com/docs/guides/functions/auth>
- [S10] JWTs / JWKS – <https://supabase.com/docs/guides/auth/jwts>
- [S11] Edge Functions Secrets – <https://supabase.com/docs/guides/functions/secrets>
- [S12] Rate Limiting Edge Functions – <https://supabase.com/docs/guides/functions/examples/rate-limiting>
- [S13] Anthropic TypeScript SDK, Requirements – <https://github.com/anthropics/anthropic-sdk-typescript>
- [S14] Login with Apple – <https://supabase.com/docs/guides/auth/social-login/auth-apple>
- [S15] Login with Google – <https://supabase.com/docs/guides/auth/social-login/auth-google>
- [S16] Native Mobile Deep Linking – <https://supabase.com/docs/guides/auth/native-mobile-deep-linking>
- [S17] Anonymous Sign-Ins – <https://supabase.com/docs/guides/auth/auth-anonymous>
- [S18] Identity Linking – <https://supabase.com/docs/guides/auth/auth-identity-linking>
- [S19] User Management (Löschen) – <https://supabase.com/docs/guides/auth/managing-user-data>
- [S20] GitHub Discussion „deleteUser(): Add option to delete user-owned files“ – <https://github.com/orgs/supabase/discussions/15424>
- [S21] Auth Rate Limits – <https://supabase.com/docs/guides/auth/rate-limits>
- [S22] MAU-Abrechnung – <https://supabase.com/docs/guides/platform/manage-your-usage/monthly-active-users>
- [S23] App Store Review Guidelines 4.8, 5.1.1(v) – <https://developer.apple.com/app-store/review/guidelines/>
- [S24] Capgo: Supabase + Capacitor Social Login (Drittanbieter) – <https://capgo.app/blog/setup-supabase-with-capacitor-social-login/>
- [S25] Compute and Disk – <https://supabase.com/docs/guides/platform/compute-and-disk>
- [S26] Backups/PITR – <https://supabase.com/docs/guides/platform/backups>
- [S27] Regions – <https://supabase.com/docs/guides/platform/regions>
- [S28] Full Text Search – <https://supabase.com/docs/guides/database/full-text-search>
- [S29] supabase-js `textSearch` – <https://supabase.com/docs/reference/javascript/textsearch>
- [S30] PostgreSQL Text Search (`german_stem`) – <https://www.postgresql.org/docs/current/textsearch-psql.html>
- [S31] Storage File Limits – <https://supabase.com/docs/guides/storage/uploads/file-limits>
- [S32] Standard Uploads – <https://supabase.com/docs/guides/storage/uploads/standard-uploads>
- [S33] Image Transformations – <https://supabase.com/docs/guides/storage/serving/image-transformations>
- [S34] Smart CDN – <https://supabase.com/docs/guides/storage/cdn/smart-cdn>
- [S35] Storage Access Control – <https://supabase.com/docs/guides/storage/security/access-control>
- [S36] Storage Downloads/Signed URLs – <https://supabase.com/docs/guides/storage/serving/downloads>
- [S37] Egress – <https://supabase.com/docs/guides/platform/manage-your-usage/egress>
- [S38] SOC 2 – <https://supabase.com/docs/guides/security/soc-2-compliance>
- [S39] Privacy Policy – <https://supabase.com/privacy>
- [S40] Data Processing Addendum – <https://supabase.com/legal/customer-resources/data-processing-addendum>
- [S41] Subprozessoren (Stand 2026-06-01) – <https://supabase.com/legal/subprocessor-list/June-1-2026.pdf>
- [S42] CLI Getting Started – <https://supabase.com/docs/guides/local-development/cli/getting-started>
- [S43] Testing Overview – <https://supabase.com/docs/guides/local-development/testing/overview>
- [S44] Generating TypeScript Types – <https://supabase.com/docs/guides/api/rest/generating-types>
- [S45] Branching – <https://supabase.com/docs/guides/deployment/branching>
- [S46] Branching-Kosten – <https://supabase.com/docs/guides/platform/manage-your-usage/branching>
- [S47] Deploy Edge Functions – <https://supabase.com/docs/guides/functions/deploy>
- [S48] SLA – <https://supabase.com/sla>
- [S49] Statusseite, Historie – <https://status.supabase.com/history>
- [S50] Postmortem 2026-02-12 – <https://supabase.com/blog/supabase-incident-on-february-12-2026>
- [S51] IsDown Outage-Historie (Aggregator) – <https://isdown.app/status/supabase/outage-history>
- [S52] Management API – <https://supabase.com/docs/reference/api/introduction>
- [S53] Project Pausing – <https://supabase.com/docs/guides/platform/project-pausing>
- [S54] Billing – <https://supabase.com/docs/guides/platform/billing-on-supabase>
- [S55] Self-Hosting – <https://supabase.com/docs/guides/self-hosting>
- [S56] Edge Runtime – <https://github.com/supabase/edge-runtime>
- [S57] S3-Kompatibilität – <https://supabase.com/docs/guides/storage/s3/compatibility>
- [S58] WorkOS: Migrate from Supabase Auth – <https://workos.com/docs/migrate/supabase>
- [S59] Realtime Limits – <https://supabase.com/docs/guides/realtime/limits>
- [S60] Cloud Run Request Timeout – <https://docs.cloud.google.com/run/docs/configuring/request-timeout>
- [S61] Fly.io Community: 60-s-Idle-Timeout – <https://community.fly.io/t/request-timeouts-on-fly-io/5653>
