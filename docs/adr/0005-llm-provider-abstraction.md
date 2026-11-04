# ADR-0005: LLM-Provider-Abstraktion

- Status: **Vorgeschlagen** (überarbeitet 2026-11-04 nach PO-Vorgabe „eigenen OpenAI-kompatiblen Endpunkt angeben können, Anthropic API nutzen“)
- Datum: 2026-11-03

## Kontext

Lara arbeitet über Tool Calls auf der Build-Operation-DSL. Startprovider ist die Anthropic Claude API. Der
Provider soll austauschbar sein, Kosten und Rate-Limits werden pro Nutzer erfasst, Keys bleiben im Backend.

## Entscheidung

Im Backend ein schmales, provider-neutrales Interface:

```csharp
public interface ILlmProvider
{
    string Name { get; }
    IAsyncEnumerable<LlmStreamEvent> StreamAsync(LlmRequest request, CancellationToken ct);
}

public sealed record LlmRequest(
    string Model,                          // logischer Name, z. B. "lara-default" → per Konfiguration gemappt
    string SystemPrompt,
    IReadOnlyList<LlmMessage> Messages,    // user/assistant/tool_result
    IReadOnlyList<LlmToolDefinition> Tools,// aus dem DSL-JSON-Schema generiert
    int MaxOutputTokens,
    string UserId);                        // für Abrechnung/Rate-Limit, nicht ans LLM

public abstract record LlmStreamEvent;
public sealed record TextDelta(string Text) : LlmStreamEvent;
public sealed record ToolCall(string Id, string Name, JsonElement Arguments) : LlmStreamEvent;
public sealed record Usage(int InputTokens, int OutputTokens, int CachedInputTokens) : LlmStreamEvent;
public sealed record Completed(string StopReason) : LlmStreamEvent;
```

- **Zwei Implementierungen, per Konfiguration wählbar** (nur Backend-Konfiguration bzw. Secrets; Endnutzer geben
  nie Keys ein, keine Keys im Client):
  1. `AnthropicProvider` – **Standard für den MVP.** Offizielles Anthropic-.NET-SDK (NuGet-Paket `Anthropic`),
     native Messages API mit Streaming, Prompt Caching (Systemprompt + Tool-Definitionen), `strict: true` auf den
     DSL-Tools (schema-treue Tool-Argumente), adaptives Denken mit `effort`. Standardmodell laut Anthropic-Empfehlung
     `claude-opus-5-5` (4 $/20 $ pro Mio. Token); günstigere Alternative `claude-sonnet-5-5` (2 $/10 $) – Wahl per
     Konfiguration und Eval, nicht im Code. Hinweis: Diese Modelle unterstützen kein erzwungenes `tool_choice`
     (`any`/`tool`); Lara nutzt `auto` + Prompt-Anweisung + `strict`.
  2. `OpenAiCompatibleProvider` – **beliebiger OpenAI-kompatibler Chat-Completions-Endpunkt** (Konfiguration:
     `BaseUrl`, `ApiKey`, `Model`, optional Header). Damit lassen sich andere Anbieter oder selbst gehostete Modelle
     anbinden (z. B. vLLM, Ollama, Azure OpenAI, OpenRouter). Ohne Caching-/Thinking-Features; Tool-Argumente werden
     wie immer serverseitig gegen das DSL-Schema validiert.
- Anthropics eigener OpenAI-Kompatibilitätsmodus (`https://api.anthropic.com/v1/`) funktioniert technisch über
  Variante 2, ist aber **nicht** der Weg für Claude: laut Anthropic nur zum Testen/Vergleichen gedacht, `strict`
  wird ignoriert (kein Schema-Garantie für Tool-Argumente), kein Prompt Caching, kein zurückgegebenes Denken,
  System-Nachrichten werden zusammengezogen. Für Claude daher immer Variante 1.
- Darüber eine `LaraSession`, die den Tool-Loop steuert: Tool-Argumente gegen das DSL-Schema validieren,
  ungültige Calls als Tool-Fehler zurück ans Modell geben, gültige Operationen per SSE an den Client streamen.
- `UsageMeter` schreibt Token und Kosten pro Nutzer und Anfrage in Postgres; Rate-Limits per
  `Microsoft.AspNetCore.RateLimiting` plus Tages- bzw. Monatsbudget pro Nutzer.
- Testbarkeit: `FakeLlmProvider` mit aufgezeichneten Streams für deterministische Tests.

## Alternativen

- Generische Bibliotheken wie Semantic Kernel oder Microsoft.Extensions.AI: Letzteres (`IChatClient`) ist eine
  ernsthafte Option, wenn es Tool-Streaming und Prompt-Caching von Anthropic sauber abbildet. Prüfung in M3;
  unser Interface ist so geschnitten, dass ein Adapter darauf möglich bleibt.
- LLM direkt im Client: verworfen (Keys, Kosten, Missbrauch).

## Konsequenzen

- Der Client kennt keinen Provider, nur den Lara-Endpunkt und die DSL.
- Modellwechsel ist eine Konfigurationsänderung plus Eval-Lauf (Golden-Prompts → erwartete DSL-Operationen).
