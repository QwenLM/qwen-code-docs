# Design zur adaptiven Eskalation von Output-Tokens

> Reduziert die Überreservierung von GPU-Slots um das ~4-fache durch eine „niedriger Standardwert + Eskalation bei Trunkierung“-Strategie für Output-Tokens, mit Multi-Turn-Wiederherstellung für Antworten, die selbst das eskalierte Limit überschreiten.

## Problem

Jede API-Anfrage reserviert einen festen GPU-Slot, der proportional zu `max_tokens` ist. Der bisherige Standardwert von 32K Tokens bedeutet, dass jede Anfrage einen 32K-Output-Slot reserviert, obwohl 99 % der Antworten unter 5K Tokens liegen. Dies reserviert die GPU-Kapazität um das 4- bis 6-fache über, was die Server-Konkurrenz einschränkt und die Kosten erhöht.

## Lösung

Verwende einen begrenzten Standardwert von **8K** Output-Tokens. Wenn eine Antwort trunkiert wird (das Modell erreicht `max_tokens`):

1. **Eskaliere** auf das volle Output-Limit des Modells (mit 64K als Mindestwert für unbekannte Modelle)
2. Falls sie immer noch trunkiert ist, **stelle sie wieder her**, indem du die Teilantwort im Verlauf behältst und bis zu 3-mal eine Fortsetzungsnachricht einfügst
3. Wenn die Wiederherstellung ausgeschöpft ist, greife auf die Trunkierungsanleitung des Tool-Schedulers zurück

Da <1 % der Anfragen tatsächlich trunkiert werden, reduziert dies die durchschnittliche Slot-Reservierung erheblich, während die Output-Qualität für lange Antworten erhalten bleibt.

## Architektur

```
Request (max_tokens = 8K)
│
▼
┌─────────────────────────┐
│  Response truncated?     │──── No ──▶ Done ✓
│  (MAX_TOKENS)            │
└───────────┬──────────────┘
            │ Yes
            ▼
┌──────────────────────────────────────────────────┐
│  Layer 1: Escalate to model output limit         │
│  ┌────────────────────────────────────────────┐  │
│  │ Pop partial response from history          │  │
│  │ RETRY (isContinuation: false → reset UI)   │  │
│  │ Re-send at max(64K, model output limit)    │  │
│  └────────────────────────────────────────────┘  │
└───────────┬──────────────────────────────────────┘
            │
            ▼
┌─────────────────────────┐
│  Still truncated?        │──── No ──▶ Done ✓
│  (MAX_TOKENS)            │
└───────────┬──────────────┘
            │ Yes
            ▼
┌──────────────────────────────────────────────────┐
│  Layer 2: Multi-turn recovery (up to 3×)         │
│  ┌────────────────────────────────────────────┐  │
│  │ Keep partial response in history           │  │
│  │ Push user message: "Resume directly..."    │  │
│  │ RETRY (isContinuation: true → keep UI buf) │  │
│  │ Re-send with updated history               │  │
│  │ Model continues from where it left off     │  │
│  └──────────────┬─────────────────────────────┘  │
│                 │                                 │
│          ┌──────┴──────┐                          │
│          │ Succeeded?  │── Yes ──▶ Done ✓         │
│          └──────┬──────┘                          │
│                 │ No (still truncated)            │
│                 ▼                                 │
│          attempt < 3? ── Yes ──▶ loop back ↑      │
└───────────┬──────────────────────────────────────┘
            │ No (exhausted)
            ▼
┌──────────────────────────────────────────────────┐
│  Layer 3: Tool scheduler fallback                │
│  ┌────────────────────────────────────────────┐  │
│  │ Reject truncated Edit/Write tool calls     │  │
│  │ Return guidance: "You MUST split into      │  │
│  │ smaller parts — write skeleton first,      │  │
│  │ then edit incrementally."                  │  │
│  └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

## Bestimmung des Token-Limits

Das effektive `max_tokens` wird in folgender Prioritätsreihenfolge aufgelöst:

| Priorität   | Quelle                                               | Wert (bekanntes Modell)        | Wert (unbekanntes Modell) | Eskalationsverhalten                            |
| ----------- | ---------------------------------------------------- | ---------------------------- | --------------------- | ----------------------------------------------- |
| 1 (höchste) | Benutzerkonfiguration (`samplingParams.max_tokens`)  | `min(userValue, modelLimit)` | `userValue`           | Keine Eskalation                                |
| 2           | Umgebungsvariable (`QWEN_CODE_MAX_OUTPUT_TOKENS`)    | `min(envValue, modelLimit)`  | `envValue`            | Keine Eskalation                                |
| 3 (niedrigste) | Begrenzter Standardwert                            | `min(modelLimit, 8K)`        | `min(32K, 8K)` = 8K   | Eskaliert auf Modell-Limit (64K Mindestwert) + Wiederherstellung |

Ein „bekanntes Modell“ ist eines, das einen expliziten Eintrag in `OUTPUT_PATTERNS` hat (geprüft über `hasExplicitOutputLimit()`). Für bekannte Modelle wird der effektive Wert immer auf das deklarierte Output-Limit des Modells begrenzt, um API-Fehler zu vermeiden. Unbekannte Modelle (Custom Deployments, selbst gehostete Endpunkte) leiten den Benutzerwert direkt weiter, da das Backend möglicherweise größere Limits unterstützt.

Diese Logik ist in drei Content-Generatoren implementiert:

- `DefaultOpenAICompatibleProvider.applyOutputTokenLimit()` — OpenAI-kompatible Provider
- `DashScopeProvider` — erbt `applyOutputTokenLimit()` vom Standard-Provider
- `AnthropicContentGenerator.buildSamplingParameters()` — Anthropic-Provider

## Eskalationsmechanismus

Die Eskalationslogik befindet sich in `geminiChat.ts` und liegt **außerhalb** der Hauptschleife für Wiederholungsversuche. Dies ist beabsichtigt:

1. Die Wiederholungsschleife behandelt vorübergehende Fehler (Rate Limits, ungültige Streams, Content-Validierung)
2. Trunkierung ist kein Fehler – es ist eine erfolgreiche Antwort, die abgeschnitten wurde
3. Fehler aus dem eskalierten Stream sollten direkt an den Aufrufer weitergeleitet werden, anstatt von der Wiederholungslogik abgefangen zu werden

### Eskalationsschritte (geminiChat.ts)

```
1. Stream completes successfully (lastError === null)
2. Last chunk has finishReason === MAX_TOKENS
3. Guard checks pass:
   - maxTokensEscalated === false (prevent infinite escalation)
   - hasUserMaxTokensOverride === false (respect user intent)
4. Compute escalated limit: max(ESCALATED_MAX_TOKENS, tokenLimit(model, 'output'))
5. Pop the partial model response from chat history
6. Yield RETRY event (isContinuation: false) → UI discards partial output and resets buffers
7. Re-send the same request with maxOutputTokens: escalatedLimit
```

### Wiederherstellungsschritte (geminiChat.ts)

Wenn die eskalierte Antwort ebenfalls trunkiert ist (finishReason === MAX_TOKENS), wird die Wiederherstellungsschleife bis zu `MAX_OUTPUT_RECOVERY_ATTEMPTS` (3) Mal ausgeführt:

```
1. Partial model response is already in history (pushed by processStreamResponse)
2. Push a recovery user message: OUTPUT_RECOVERY_MESSAGE
3. Yield RETRY event (isContinuation: true) → UI keeps text buffer for continuation
4. Re-send with updated history (model sees its partial output + recovery instruction)
5. If still truncated and attempts remain, loop back to step 1
6. If recovery attempt throws (empty response, network error):
   - Pop the dangling recovery message from history
   - Break out of recovery loop
```

### State-Bereinigung bei RETRY (turn.ts)

Wenn die `Turn`-Klasse ein RETRY-Event erhält, löscht sie den angesammelten State, um Inkonsistenzen zu vermeiden:

- `pendingToolCalls` — wird gelöscht, um doppelte Tool-Aufrufe zu vermeiden, falls die erste trunkierte Antwort bereits abgeschlossene Tool-Aufrufe enthielt, die in der eskalierten Antwort wiederholt werden
- `pendingCitations` — wird gelöscht, um doppelte Zitate zu vermeiden
- `debugResponses` — wird gelöscht, um veraltete Debug-Daten zu vermeiden
- `finishReason` — wird auf `undefined` zurückgesetzt, damit der Finish-Reason der neuen Antwort verwendet wird

Das `isContinuation`-Flag wird an die UI weitergereicht, damit diese entscheiden kann, ob Textpuffer zurückgesetzt (Eskalation) oder beibehalten (Wiederherstellung) werden sollen.

## Konstanten

Definiert in `geminiChat.ts` und `tokenLimits.ts`:

| Konstante                      | Wert   | Zweck                                                   |
| ------------------------------ | ------ | ------------------------------------------------------- |
| `CAPPED_DEFAULT_MAX_TOKENS`    | 8.000  | Standard-Output-Token-Limit, wenn kein Benutzer-Override gesetzt ist |
| `ESCALATED_MAX_TOKENS`         | 64.000 | Mindestwert für Eskalation (wird verwendet, wenn das Modell-Limit unbekannt ist) |
| `MAX_OUTPUT_RECOVERY_ATTEMPTS` | 3      | Maximale Anzahl an Multi-Turn-Wiederherstellungsversuchen nach Eskalation |

Das effektive eskalierte Limit ist `max(ESCALATED_MAX_TOKENS, tokenLimit(model, 'output'))`:

| Modell           | Eskaliertes Limit |
| ---------------- | ----------------- |
| Claude Opus 4.6  | 131.072 (128K)    |
| GPT-5 / o-series | 131.072 (128K)    |
| Qwen3.x          | 65.536 (64K)      |
| Unbekannte Modelle | 64.000 (Mindestwert) |

## Designentscheidungen

### Warum 8K als Standardwert?

- 99 % der Antworten liegen unter 5K Tokens
- 8K bietet einen angemessenen Spielraum für etwas längere Antworten, ohne unnötige Wiederholungsversuche auszulösen
- Reduziert die durchschnittliche Slot-Reservierung von 32K auf 8K (4-fache Verbesserung)

### Warum auf das Modell-Limit eskalieren statt auf feste 64K?

- Modelle mit höheren Output-Limits (Claude Opus 128K, GPT-5 128K) wurden unnötigerweise auf 64K begrenzt
- Die Verwendung des tatsächlichen Modell-Limits deckt die überwiegende Mehrheit langer Outputs ab, ohne einen zweiten Wiederholungsversuch
- `ESCALATED_MAX_TOKENS` (64K) dient als Mindestwert für unbekannte Modelle, bei denen `tokenLimit()` den Standardwert 32K zurückgibt

### Warum Multi-Turn-Wiederherstellung statt progressiver Eskalation?

- Progressive Eskalation (8K → 16K → 32K → 64K) erfordert jedes Mal die Neugenerierung der vollständigen Antwort
- Multi-Turn-Wiederherstellung behält die Teilantwort bei und lässt das Modell fortfahren, was Tokens und Latenz spart
- Wiederherstellungsnachrichten sind kostengünstig (~40 Tokens pro Nachricht) im Vergleich zur Neugenerierung großer Antworten
- Das Limit von 3 Versuchen verhindert Endlosschleifen und deckt gleichzeitig die meisten praktischen Fälle ab

### Warum liegt die Eskalation außerhalb der Wiederholungsschleife?

- Trunkierung ist ein Erfolgsfall, kein Fehler
- Fehler aus dem eskalierten Stream (Rate Limits, Netzwerkausfälle) sollten direkt weitergeleitet werden, anstatt stillschweigend mit falschen Parametern wiederholt zu werden
- Hält die Wiederholungsschleife auf ihren ursprünglichen Zweck fokussiert (Wiederherstellung bei vorübergehenden Fehlern)
- Wiederherstellungsfehler werden separat abgefangen, um ein Abbrechen der gesamten Konversation zu vermeiden