# ADR-0008: Erste Version komplett lokal – Lara mit eigenem Anbieter und API-Key

- Status: **Angenommen** (PO, 2026-11-04: „erste Version full local, OpenAI-kompatible Endpunkte und API-Schlüssel
  selbst hinterlegen, dann braucht man kein Backend“)
- Datum: 2026-11-04
- Verschiebt: ADR-0007 (Supabase-Hybrid) und ADR-0004 auf eine spätere Version (Teilen/Accounts, M4).
- Ändert: ADR-0005 – die Provider-Abstraktion läuft für v1 **im Client** statt im Backend.
- Abweichung vom Briefing: „LLM nur über das Backend, keine API-Keys im Client“ gilt für **unsere** Keys. In v1 gibt
  es keine eigenen Keys: Nutzer bringen ihren eigenen Schlüssel mit (Bring Your Own Key).

## Entscheidung

1. **Kein Backend in v1.** Bauen, Anleitung und Lara laufen auf dem Gerät. Bauten bleiben lokal (IndexedDB), Teilen
   über Export/Import-Dateien.
2. **Lara spricht direkt mit dem vom Nutzer gewählten Anbieter:**
   - **Anthropic (nativ)** – empfohlen. Offizielles TypeScript-SDK `@anthropic-ai/sdk` im Browser-Modus
     (`dangerouslyAllowBrowser`, sendet den Header für direkten Browserzugriff), Streaming, Tools mit
     `strict: true`, Prompt Caching. Standardmodell `claude-opus-5-5`, wählbar.
   - **OpenAI-kompatibel** – frei: Basis-URL, Modellname, API-Key (z. B. OpenAI, OpenRouter, Azure, lokale Server wie
     Ollama/LM Studio/vLLM). Chat Completions mit Tool-Aufrufen und Streaming; `strict` nur, wo der Anbieter es kann.
   - Laras Befehle werden **immer** clientseitig mit `@laracraft/lara-dsl` geprüft; ungültige Aufrufe gehen als
     Tool-Fehler an das Modell zurück. Kein Anbieter kann den Bau unkontrolliert verändern.
3. **Schlüssel-Speicherung:** in den nativen Apps im sicheren Speicher des Systems (iOS Keychain / Android Keystore
   über ein Capacitor-Plugin); im Web nur auf Wunsch dauerhaft (`localStorage`), sonst nur für die Sitzung – mit
   deutlichem Hinweis. Keys verlassen das Gerät nur zum gewählten Anbieter. Nie in Logs, Exporten oder Bau-Dateien.
4. **CORS / Netzwerk:** Web nutzt `fetch` des Browsers (Anbieter muss CORS erlauben; Anthropic tut das mit dem
   Browser-Header; lokale Server brauchen ggf. eine Freigabe, Hinweis in der App). Native Apps nutzen den nativen
   HTTP-Weg von Capacitor, damit CORS dort keine Rolle spielt.
5. **Kosten und Grenzen** liegen beim Nutzer (eigenes Konto). Die App zeigt den Token-Verbrauch pro Turn an und hat
   ein optionales, lokal einstellbares Limit pro Tag.
6. **Datenschutz:** Ohne Backend verarbeiten wir keine Daten. In der App steht klar, dass Chat-Inhalte und der
   Bau-Kontext an den gewählten Anbieter gehen. Altersfragen (Frage 5) betreffen dann vor allem die
   Nutzungsbedingungen des Anbieters; ein Hinweis in den Einstellungen ist Pflicht.

## Konsequenzen

- Neue Lib `libs/lara-agent` (Anbieter-Abstraktion, Tool-Loop, Systemprompt, Bau-Kontext) und eine Chat-Oberfläche
  in der App.
- Für Store-Releases mit vielen Nutzern ohne eigenen Key bleibt ein Backend (ADR-0007) die spätere Option.
- Apple/Google erlauben Apps mit eigenem API-Key des Nutzers; die Store-Texte müssen das erklären (M5).

## Umsetzung in der App (L2, 2026-11-04)

- **Sicherer Speicher (nativ):** `capacitor-secure-storage-plugin` 0.13.0 (MIT, Peer `@capacitor/core >= 8`,
  letzte Version 2026-01, iOS Keychain / Android Keystore, keine weiteren Abhängigkeiten). Verworfen:
  `@aparajita/capacitor-secure-storage` 8.x (MIT, gepflegt, zieht aber `@capacitor/app` und
  `@capacitor/keyboard` als Abhängigkeiten mit). Zugriff nur über `LARA_SECRET_STORE`
  (`apps/laracraft/src/app/lara/secret-store.ts`); Web: `sessionStorage`, `localStorage` nur mit Häkchen
  „Auf diesem Gerät merken“ und Warnung.
- **Netz in den Apps:** OpenAI-kompatible Endpunkte laufen nativ über `CapacitorHttp` (kein CORS). Grenze: die
  Antwort kommt dann am Stück statt Wort für Wort. Anthropic nutzt den normalen `fetch` mit Streaming.
- **Tageslimit:** `LaraSettings.usageStore` (lokal, pro Kalendertag) wird dem Agenten als `usageStore` übergeben.
- **Entwicklung:** `localStorage['laracraft.lara.devFake'] = '1'` schaltet auf einen Skript-Agenten ohne Netz
  (UI-Arbeit, Screenshots).
