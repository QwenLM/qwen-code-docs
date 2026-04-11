# Design für adaptive Output-Token-Eskalation

> Reduziert die GPU-Slot-Überreservierung um das ~4-fache durch eine „niedriger Standardwert + Eskalation bei Trunkierung“-Strategie für Output-Tokens.

## Problem

Jede API-Anfrage reserviert einen festen GPU-Slot, der proportional zu `max_tokens` ist. Der bisherige Standardwert von 32K Tokens bedeutet, dass jede Anfrage einen 32K-Output-Slot reserviert, obwohl 99 % der Antworten unter 5K Tokens liegen. Dadurch wird die GPU-Kapazität um das 4- bis 6-fache überreserviert, was die Server-Parallelität einschränkt und die Kosten erhöht.

## Solution

Verwende einen begrenzten Standardwert von **8K** Output-Tokens. Wenn eine Antwort abgeschnitten wird (das Modell erreicht `max_tokens`), wird automatisch einmal mit einem eskalierten Limit von **64K** wiederholt. Da <1 % der Anfragen tatsächlich abgeschnitten werden, reduziert dies die durchschnittliche Slot-Reservierung erheblich, während die Output-Qualität für lange Antworten erhalten bleibt.

## Architecture

```
                      ┌─────────────────────────┐
                      │   Request starts        │
                      │   max_tokens = 8K       │
                      └───────────┬─────────────┘
                                  │
                                  ▼
                      ┌─────────────────────────┐
                      │   Stream response       │
                      └───────────┬─────────────┘
                                  │
                        ┌─────────┴─────────┐
                        │                   │
                   finish_reason        finish_reason
                   != MAX_TOKENS        == MAX_TOKENS
                        │                   │
                        ▼                   ▼
                  ┌───────────┐   ┌─────────────────────┐
                  │   Done    │   │  Check conditions:   │
                  └───────────┘   │  - No user override? │
                                  │  - No env override?  │
                                  │  - Not already       │
                                  │    escalated?        │
                                  └─────────┬───────────┘
                                     YES    │    NO
                                  ┌─────────┴────┐
                                  │              │
                                  ▼              ▼
                          ┌─────────────┐  ┌──────────┐
                          │ Pop partial │  │  Done    │
                          │ model resp  │  │ (truncd) │
                          │ from history│  └──────────┘
                          │             │
                          │ Yield RETRY │
                          │ event       │
                          │             │
                          │ Re-send     │
                          │ max_tokens  │
                          │   = 64K     │
                          └─────────────┘
```

## Token limit determination

Das effektive `max_tokens` wird in folgender Prioritätsreihenfolge ermittelt:

| Priorität | Quelle | Wert (bekanntes Modell) | Wert (unbekanntes Modell) | Eskalationsverhalten |
| ----------- | ---------------------------------------------------- | ---------------------------- | --------------------- | ------------------------------ |
| 1 (höchste) | User-Konfiguration (`samplingParams.max_tokens`) | `min(userValue, modelLimit)` | `userValue` | Keine Eskalation |
| 2 | Umgebungsvariable (`QWEN_CODE_MAX_OUTPUT_TOKENS`) | `min(envValue, modelLimit)` | `envValue` | Keine Eskalation |
| 3 (niedrigste) | Begrenzter Standardwert | `min(modelLimit, 8K)` | `min(32K, 8K)` = 8K | Eskaliert bei Trunkierung auf 64K |

Ein „bekanntes Modell“ ist ein Modell, das einen expliziten Eintrag in `OUTPUT_PATTERNS` besitzt (geprüft über `hasExplicitOutputLimit()`). Bei bekannten Modellen wird der effektive Wert immer auf das deklarierte Output-Limit des Modells begrenzt, um API-Fehler zu vermeiden. Unbekannte Modelle (Custom Deployments, selbst gehostete Endpunkte) leiten den Wert des Users direkt weiter, da das Backend möglicherweise größere Limits unterstützt.

Diese Logik ist in drei Content-Generatoren implementiert:

- `DefaultOpenAICompatibleProvider.applyOutputTokenLimit()` — OpenAI-kompatible Provider
- `DashScopeProvider` — erbt `applyOutputTokenLimit()` vom Standard-Provider
- `AnthropicContentGenerator.buildSamplingParameters()` — Anthropic-Provider

## Escalation mechanism

Die Eskalationslogik befindet sich in `geminiChat.ts` und liegt **außerhalb** der Hauptschleife für Wiederholungen. Dies ist beabsichtigt:

1. Die Retry-Schleife behandelt transiente Fehler (Rate Limits, ungültige Streams, Content-Validierung)
2. Trunkierung ist kein Fehler – es handelt sich um eine erfolgreiche Antwort, die lediglich abgeschnitten wurde
3. Fehler aus dem eskalierten Stream sollten direkt an den Aufrufer weitergegeben werden, statt von der Retry-Logik abgefangen zu werden

### Escalation steps (geminiChat.ts)

```
1. Stream wird erfolgreich abgeschlossen (lastError === null)
2. Letzter Chunk hat finishReason === MAX_TOKENS
3. Guard-Checks sind erfolgreich:
   - maxTokensEscalated === false (verhindert Endlos-Eskalation)
   - hasUserMaxTokensOverride === false (respektiert User-Intent)
4. Partielle Modell-Antwort aus Chat-History entfernen
5. RETRY-Event ausgeben → UI verwirft partiellen Output
6. Dieselbe Anfrage erneut senden mit maxOutputTokens: 64K
```

### State cleanup on RETRY (turn.ts)

Wenn die `Turn`-Klasse ein RETRY-Event erhält, wird der akkumulierte State gelöscht, um Inkonsistenzen zu vermeiden:

- `pendingToolCalls` — wird gelöscht, um doppelte Tool-Calls zu vermeiden, falls die erste abgeschnittene Antwort bereits abgeschlossene Tool-Calls enthielt, die in der eskalierten Antwort wiederholt werden
- `pendingCitations` — wird gelöscht, um doppelte Zitate zu vermeiden
- `debugResponses` — wird gelöscht, um veraltete Debug-Daten zu vermeiden
- `finishReason` — wird auf `undefined` zurückgesetzt, damit der Finish-Reason der neuen Antwort verwendet wird

## Constants

Definiert in `tokenLimits.ts`:

| Konstante | Wert | Zweck |
| --------------------------- | ------ | ------------------------------------------------------- |
| `CAPPED_DEFAULT_MAX_TOKENS` | 8.000 | Standard-Output-Token-Limit, wenn kein User-Override gesetzt ist |
| `ESCALATED_MAX_TOKENS` | 64.000 | Output-Token-Limit, das beim Retry nach Trunkierung verwendet wird |

## Design decisions

### Why 8K default?

- 99 % der Antworten liegen unter 5K Tokens
- 8K bietet einen angemessenen Puffer für etwas längere Antworten, ohne unnötige Retries auszulösen
- Reduziert die durchschnittliche Slot-Reservierung von 32K auf 8K (4-fache Verbesserung)

### Why 64K escalated limit?

- Deckt den Großteil der langen Outputs ab, die bei 8K abgeschnitten wurden
- Entspricht dem Output-Limit vieler moderner Modelle (Claude Sonnet, Gemini 3.x, Qwen3.x)
- Höhere Werte (z. B. 128K) würden die Vorteile der Slot-Optimierung für die <1 % der Anfragen, die eskalieren, zunichtemachen

### Why not progressive escalation (8K → 16K → 32K → 64K)?

- Jeder Retry fügt Latenz hinzu (die vollständige Antwort muss neu generiert werden)
- Ein einzelner Retry ist der einfachste Ansatz, der fast alle Fälle abdeckt
- Die Trunkierungsrate von <1 % bei 8K bedeutet, dass fast keine Anfragen eine Eskalation benötigen; jene, die es tun, benötigen wahrscheinlich deutlich mehr als 16K

### Why is escalation outside the retry loop?

- Trunkierung ist ein Erfolgsfall, kein Fehler
- Fehler aus dem eskalierten Stream (Rate Limits, Netzwerkausfälle) sollten direkt weitergegeben werden, statt stillschweigend mit falschen Parametern wiederholt zu werden
- Hält die Retry-Schleife auf ihren ursprünglichen Zweck fokussiert (Wiederherstellung nach transienten Fehlern)