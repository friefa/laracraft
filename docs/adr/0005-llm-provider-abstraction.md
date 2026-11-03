# ADR-0005: LLM-Provider-Abstraktion

- Status: **Vorgeschlagen**
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

- `AnthropicProvider` als erste Implementierung (offizielles Anthropic-.NET-SDK oder HTTP, Streaming, Prompt
  Caching für Systemprompt und Tool-Definitionen). Modellwahl per Konfiguration, nicht im Code.
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
