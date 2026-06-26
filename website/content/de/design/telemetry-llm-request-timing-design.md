# LLM-Request-Timing-Zerlegung – Design (P3 Phase 4)

> Issue #3731 – Phase 4 des hierarchischen Session-Tracings. Fügt Time-to-First-Token, Request-Setup-Dauer, Sampling-Dauer und Telemetrie pro Wiederholungsversuch zum `qwen-code.llm_request`-Span hinzu, damit Betreiber beantworten können „Warum war dieser LLM-Aufruf langsam?“, ohne raten zu müssen.
>
> Baut auf Phase 1 (#4126), Phase 1.5 (#4302), Phase 2 (#4321) auf. Unabhängig von Phase 3 (#4410, in Review) – es wird empfohlen, Phase 3 zuerst zu landen, damit die Felder pro Versuch von Phase 4 sauber unter den Subagent-Unterbäumen aggregiert werden können.

## Problem

`qwen-code.llm_request`-Spans tragen heute nur `model`, `prompt_id`, `input_tokens`, `output_tokens`, `success`, `error`, `duration_ms`. Betreiber, die einen einzelnen Trace lesen, können nicht erkennen:

1. **Wie viel von `duration_ms` auf das Nachdenken des Modells entfällt und wie viel auf den Netzwerk-Setup.** Eine `duration_ms` von 12 Sekunden könnte 11 s Wiederholungen gefolgt von 1 s schneller Generierung sein, oder 100 ms Setup gefolgt von 12 s langsamem Streaming – der Trace sagt es nicht.
2. **Wann der Benutzer das erste Token gesehen hat.** TTFT (Time-to-First-Token) ist das Standard-Latenz-SLO für Chat-UIs. Wir können es nicht berechnen; wir erfassen es nicht.
3. **Was während der Wiederholungen passiert ist.** `retryWithBackoff` (`utils/retry.ts:285`) ruft nur `debugLogger.warn` auf – kein OTel-Ereignis, kein Span-Attribut. Die 4 LLM-Aufrufstellen, die es durchlaufen (`client.ts:1540`, `baseLlmClient.ts:193,282`, `geminiChat.ts:1039`), haben null Sichtbarkeit von Wiederholungen in Traces oder Metriken. `ContentRetryEvent` existiert für Wiederholungen zur Inhaltswiederherstellung innerhalb von `geminiChat.ts:806,830`, aber nicht für die häufigeren Rate-Limit-/5xx-Wiederholungen.
4. **Dass `api.request.breakdown` toter Code ist.** Die Metrik ist unter `metrics.ts:242-251` mit 4 `ApiRequestPhase`-Werten definiert, aus `index.ts:117` exportiert, in `metrics.test.ts:646-675` getestet – aber `recordApiRequestBreakdown()` hat null Aufrufer im Produktionscode. Die Metrikinfrastruktur ist bezahlt; der Datenfluss wurde nie angeschlossen.

Diese Lücken machen `qwen-code.llm_request` zum am wenigsten informativen Span im Trace-Baum. Tool-Spans (#4126/#4321) und Subagent-Spans (#4410) zeigen beide Lebenszyklusphasen; LLM-Span fasst die gesamte Anfrage in eine undurchsichtige Dauer zusammen.

## Vorhandene Oberfläche (keine Änderung)

| Komponente                                                     | Ort                                                              | Warum wir sie nicht anfassen                                                                                                                                                                                                                  |
| -------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lebenszyklus des LLM-Request-Spans                             | `session-tracing.ts` `startLLMRequestSpan` / `endLLMRequestSpan` | Phase 1 (#4126) hat die Helfer eingeführt. Wir erweitern das Metadaten-Interface, restrukturieren nicht                                                                                                                                       |
| Aktive Span-Propagation in Provider-Generatoren                | `loggingContentGenerator.ts:213,287`                             | Phase 1 (#4126) hat `withSpan('api.*')` durch native Helfer ersetzt; der aktive Kontext erreicht bereits den Stream-Wrapper                                                                                                                   |
| `ContentRetryEvent`-Schema + Konsumenten                       | `types.ts:626`, `qwen-logger.ts:947`, `loggers.ts:717`           | Bestehendes Ereignis behält seine Form und Downstreams; wir fügen eine verwandte Ereignisklasse für den `retryWithBackoff`-Pfad hinzu                                                                                                          |
| `LogToSpanProcessor`-Log-Bridge-Spans                          | `log-to-span-processor.ts`                                       | Die bestehende Bridge des ContentRetryEvent schachtelt sich weiterhin unter den aktiven LLM-Span ein. Phase 4 ändert dies nicht                                                                                                                |
| `ApiRequestPhase`-Enum                                         | `metrics.ts:330-334`                                             | Öffentliche Oberfläche (4 Werte). Wir befüllen 3 der 4 aus Produktionscode; lassen das Enum aus Gründen der Abwärtskompatibilität unverändert                                                                                                   |
| Provider-übergreifende Chunk-Normalisierung → `GenerateContentResponse` | `loggingContentGenerator.ts:286-393`                             | Jeder Provider normalisiert bereits vor der Übergabe an LoggingContentGenerator auf Googles `GenerateContentResponse`-Form. TTFT-Erkennung läuft zentral über diese normalisierte Form; kein pro-Provider-Code                                       |
| `retryWithBackoff`-Allzweck-Wiederholung                       | `utils/retry.ts:140`                                             | Wird sowohl von LLM-Aufrufern als auch von Nicht-LLM (`channels/weixin/src/api.ts`) verwendet. Wir erweitern um einen optionalen `onRetry`-Callback, anstatt eine harte Kopplung an LLM-Telemetrie einzuführen                                      |
| Nicht-Streaming `generateContent`                              | `loggingContentGenerator.ts:212`                                 | TTFT ist für Nicht-Streaming nicht sinnvoll; die neuen Felder bleiben `undefined`. Span-Lebenszyklus und vorhandene Attribute unverändert                                                                                                      |

## Nicht im Umfang (verschoben)

- **SDK-eigene Wiederholungen** (openai SDK `maxRetries=3`, google-genai SDK interne Wiederholungen). Diese finden vollständig innerhalb des Drittanbieter-SDKs statt; ihre Beobachtung erfordert das Deaktivieren von SDK-Wiederholungen und die Neuimplementierung in `retryWithBackoff`. Separate Entscheidung, nicht Phase 4.
- **Metriken pro Token beim Streaming** (Inter-Token-Latenz, Größe pro Chunk). Nützlich für das Debuggen der Inferenz-Engine-Performance, nicht für die vom Benutzer wahrgenommenen Latenzfragen, die Phase 4 adressiert.
- **Separate TTFT für Reasoning/Thinking-Blöcke.** „Erstes Token“ umfasst Thinking-Inhalte (siehe D1). Eine zukünftige Erweiterung könnte `ttft_to_reasoning_ms` vs. `ttft_to_answer_ms` aufteilen, aber erst, wenn wir einen Bedarf sehen.
- **Sampling-Phase als dedizierter Kind-Span.** Berechenbar aus `duration_ms - ttft_ms - request_setup_ms`; ein Kind-Span fügt für reine OTel-Backends nichts hinzu (claude-code verwendet einen nur für Perfetto). Stattdessen als Span-Attribut gespeichert – siehe D6.
- **Ereignis-Ratenbegrenzung für persistenten Wiederholungsmodus (`QWEN_CODE_UNATTENDED_RETRY`).** Eine einzige LLM-Anfrage kann unter persistenter Wiederholung 50+ `ContentRetryEvent`/`ApiRetryEvent`-Datensätze erzeugen. Die Begrenzung der Emission ist ein Folgearbeitsschritt – Phase 4 sendet alle Ereignisse; falls die Produktionsvolumen untragbar werden, füge in einem Folge-PR eine Begrenzung der Emission pro Span mit einem Zusammenfassungsereignis „+N weitere Versuche (abgeschnitten)“ hinzu.
- **`TOKEN_PROCESSING`-Zerlegungsphase.** Enum-Wert existiert, aber qwen-code hat keine nennenswerte lokale Verarbeitung nach dem Stream (<10 ms typisch). Wird in Produktionsaufrufern übersprungen; Enum-Wert für zukünftige Verwendung oder für Aufrufer, die wir nicht kontrollieren, beibehalten.
- **Migration von `ContentRetryEvent` auf LLM-Span als Span-Ereignisse.** Gleiche Begründung wie bei Phase 3`s `subagent_execution` LogRecord: bestehende Konsumenten (qwen-logger RUM, zukünftige Metriken) sind eng an den LogRecord gekoppelt. Die Bridge-Span-Abdeckung ist gut genug.

## Referenzen (Entscheidungsnachweise)

| Quelle                                                                                                                     | Wichtigste Erkenntnis                                                                                                                                                                                                                                                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| claude-code (Anthropic) `claude.ts:1762, 1789, 1982, 2882`                                                                 | TTFT erfasst als `Date.now() - start` beim `message_start`-SSE-Ereignis; `start` wird pro Wiederholungsversuch zurückgesetzt. `requestSetupMs = start - startIncludingRetries`. `attemptStartTimes`-Array pro Versuch erhalten. Bestätigt Machbarkeit des Ansatzes; ihre TTFT-Semantik ist „erstes Stream-Ereignis“ (wir weichen auf „erster Inhalt“ ab – siehe D1) |
| claude-code `perfettoTracing.ts:549-671`                                                                                   | Rendert Request Setup → Attempt N (Wiederholung) → First Token → Sampling als verschachtelte B/E-Paare. Demonstriert die visuelle Zerlegung; qwen-code führt die gleiche Zerlegung mit OTel-Attributen durch, da wir kein Perfetto haben                                                                                                             |
| claude-code `sessionTracing.ts:447`                                                                                        | Nur `ttft_ms` landet auf dem OTel-Span (nicht `requestSetupMs`, nicht `samplingMs`, nicht Zeiten pro Versuch). Wir legen bewusst mehr auf den Span – claude-code hat Perfetto zur Visualisierung; wir nicht                                                                                                                                  |
| opencode (sst/opencode) `session/llm.ts`, `route/client.ts`                                                                | Keine TTFT-Messung. Einzelner `LLM.run`-Effect-Span deckt alles ab. Bestätigt, dass die Lücke auch bei konkurrierenden Tools besteht; keine Referenz dafür, was zu tun ist                                                                                                                                                                  |
| [OTel GenAI Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/) (Status: Development / Experimental) | `gen_ai.usage.input_tokens` (Stable), `gen_ai.usage.output_tokens` (Stable), `gen_ai.usage.cached_tokens` (Experimental), `gen_ai.request.model` (Stable), `gen_ai.server.time_to_first_token` (Experimental, Sekunden als double). Dual-Emit-Muster folgt #4410-Präzedenzfall                                                               |
| [OTel Trace Spec — Span Events](https://opentelemetry.io/docs/specs/otel/trace/api/#add-events)                             | „Events SHOULD NOT be used to record information that's better captured as Span Attributes.“ Bestätigt, dass Informationen pro Versuch als LLM-Span-Attribute + Log-Bridge-Spans gehören, nicht als Span-Ereignisse auf dem Eltern-Span                                                                                                      |
| Phase 3-Design-Dokument (`telemetry-subagent-spans-design.md`)                                                              | Hat das Dual-Emit-Muster (`qwen-code.subagent.id` + `gen_ai.agent.id`) und die Regel „privater Name ist maßgeblich“ etabliert. Phase 4 folgt der gleichen Konvention für TTFT- und Token-Felder                                                                                                                                             |

## Design – sieben Entscheidungen, jeweils begründet

### D1 – TTFT-Semantik: „erster Chunk, der benutzersichtbaren Inhalt enthält“

TTFT misst die Wanduhrzeit vom **Versand des erfolgreichen Versuchs** bis zum **ersten Stream-Chunk, der benutzersichtbare Ausgabe enthält**. Ein Chunk ist „benutzersichtbar“, wenn ein normalisierter `Part` in `candidates[0].content.parts` einer der folgenden ist:

- `text` mit nicht-leerem String
- `functionCall` (Tool-Nutzung)
- `inlineData` (Bild, binär)
- `executableCode`
- `thought` / Reasoning-Inhalt (was auch immer der Provider liefert – Geminis `thought`, Anthropics `<thinking>`-Block, OpenAI o1-Reasoning-Chunk)

Chunks, die nur `role`-Metadaten oder nur `usageMetadata` (finaler Usage-Summary-Chunk) enthalten, lösen TTFT nicht aus.

**Warum nicht „erstes Stream-Ereignis jeglicher Art“ (claude-codes Wahl)**: claude-code misst TTFT bei `message_start`, einem Anthropic-spezifischen Metadaten-Ereignis, das 50–300 ms vor jedem tatsächlichen Inhalt ausgelöst wird. Ihr internes `headlessProfiler.ts` trennt bereits `time_to_first_response_ms` für die Semantik „Benutzer hat etwas gesehen“ und erkennt die Unterscheidung an. qwen-code deckt mehrere Provider ab (Anthropic, OpenAI, Gemini, Qwen) – die Wahl der Metadaten-Ereignis-Semantik würde bedeuten, dass TTFT für Anthropic grundlegend anders ist als TTFT für OpenAI (das kein analoges reines Metadaten-Erstereignis hat). Die benutzersichtbare Inhalts-Semantik ist über alle 4 Provider einheitlich und entspricht wörtlich „Time-to-First-Token“.

**Warum `thought` / Reasoning einbeziehen**: Aus Betreibersicht sind Reasoning-Chunks immer noch „das Modell hat Ausgabe produziert.“ Ihr Ausschluss würde TTFT für reasoning-lastige Modelle (o1, Qwen Thinking-Varianten) zu niedrig ansetzen. Eine zukünftige Aufteilung in `ttft_to_reasoning_ms` vs. `ttft_to_answer_ms` ist möglich; nicht Phase 4.

**Warum reine Tool-Call-Chunks einbeziehen**: Agent-Tool-Entscheidungs-LLM-Aufrufe (ein `tool_use`, kein Text) sind in qwen-codes Workflow üblich. Ihr Ausschluss würde bedeuten, dass TTFT für diese Anfragen undefiniert ist. Der `functionCall`-Part ist sinnvolle Ausgabe.

**Hinweis zum produktübergreifenden Vergleich**: Das Design-Dokument hält ausdrücklich fest: `qwen-code.ttft_ms ≈ claude-code.time_to_first_response_ms ≠ claude-code.ttft_ms`. Betreiber, die Produkte vergleichen, sollten sich auf die benutzersichtbare Inhalts-Semantik einigen.

### D2 – TTFT-Messort: Methoden-lokale Variablen in `LoggingContentGenerator.generateContentStream`

Die Erkennung des ersten Chunks läuft innerhalb des bestehenden Stream-Wrappers unter `loggingContentGenerator.ts:393` (`async function* processStreamGenerator`). Pro-Aufruf-Variablen (`start`, `ttftMs`) leben im Closure der Methode; **niemals als Instanzfelder**.

**Warum niemals Instanzfelder**: `LoggingContentGenerator` wird **einmal pro `ContentGenerator`** instanziiert (`contentGenerator.ts:377`) und über alle gleichzeitigen `generateContentStream`-Aufrufe hinweg geteilt – Subagent-Fan-out, Warmup-Queries, Side-Queries von `geminiChat`. Ein Instanzfeld würde bei gleichzeitigen Aufrufen überschrieben werden und für einen von zwei verschränkten Requests sinnlose TTFT-Werte produzieren.

**Warum nicht AsyncLocalStorage**: ALS würde funktionieren, fügt aber eine Kontext-Management-Ebene für einen Zustand hinzu, der die Methode nicht verlassen muss. Methoden-lokal ist einfacher, null Overhead, null Risiko von Lecks.

```ts
// loggingContentGenerator.ts — inside generateContentStream
const attemptStart = Date.now(); // per-call local
const requestEntryTime = Date.now(); // also per-call local — see D3
let ttftMs: number | undefined;
const attemptStartTimes: number[] = [attemptStart];
let retryTotalDelayMs = 0;
let finalAttempt = 1;
// stream wrapper inspects each chunk; first one matching hasUserVisibleContent:
//   ttftMs = Date.now() - attemptStart;
```

`hasUserVisibleContent(chunk)` ist ein kleiner eigenständiger Helfer, der zusammen mit dem Wrapper platziert und für Tests exportiert wird:

```ts
function hasUserVisibleContent(chunk: GenerateContentResponse): boolean {
  const parts = chunk.candidates?.[0]?.content?.parts;
  if (!parts?.length) return false;
  return parts.some(
    (p) =>
      (typeof p.text === 'string' && p.text.length > 0) ||
      p.functionCall !== undefined ||
      p.inlineData !== undefined ||
      p.executableCode !== undefined ||
      // @ts-expect-error — `thought` is not on all SDK versions but providers emit it
      p.thought !== undefined,
  );
}
```

### D3 – `request_setup_ms`-Berechnung: Eintrittszeit vs. Start des erfolgreichen Versuchs

`request_setup_ms` misst die Wanduhrzeit vom Eintritt in `generateContentStream`/`generateContent` bis zum **Start des erfolgreichen Versuchs** – einschließlich aller fehlgeschlagenen Wiederholungen, Backoff-Sleeps und aller Vorbereitungsarbeit vor der Wiederholung.

```ts
request_setup_ms = attemptStart_of_successful_attempt - requestEntryTime;
```

Wenn `attempt === 1` und keine Wiederholungen stattfanden, ist `request_setup_ms` klein (nur SDK-Setup). Wenn Wiederholungen auftraten, erfasst es den gesamten Overhead des Wiederholungsbudgets.

**Auf dem OTel-Span platzieren (weicht von claude-code ab, das es nur auf Perfetto platziert)**: Begründung auf drei Ebenen:

1. **Kein Perfetto** – qwen-code hat keine Out-of-Band-Visualisierungsschicht. OTel-Attribute sind der einzige Kanal.
2. **Single-Trace-Debugging** – Betreiber sieht `duration_ms=12000, request_setup_ms=11500, ttft_ms=200, sampling_ms=300` → diagnostiziert sofort „Wiederholungen haben 11,5 s gefressen, das Modell selbst war schnell.“ Die Berechnung von `request_setup_ms` aus anderen Feldern erfordert auch die Offenlegung von `sampling_ms`, was wir ohnehin tun (D6).
3. **Vernachlässigbare Kosten** – 1 INT64-Attribut. Gleiche Größenordnung wie die vorhandenen Attribute `input_tokens`, `output_tokens`. Die Ingest-Kosten im Backend sind nicht wesentlich.

### D4 – Wiederholungstelemetrie: `onRetry`-Callback-Option auf `retryWithBackoff` + `ApiRetryEvent` + AsyncLocalStorage-Propagation

> **Phase-4b-Update (Entdeckung nach dem Design)**: Dieser Abschnitt wurde ursprünglich unter der Annahme von claude-codes Muster „ein LLM-Span besitzt die Wiederholungsschleife“ geschrieben. Während der Implementierung von Phase 4b entdeckten wir, dass die 4 `retryWithBackoff`-Aufrufstellen von qwen-code (`client.ts:2109`, `baseLlmClient.ts:235,333`, `geminiChat.ts:2035` – Zeilennummern zum Zeitpunkt des Merges) alle `apiCall = () => contentGenerator.generateContent(...)` umschließen. Die Wiederholungsschicht sitzt **oberhalb** von LoggingContentGenerator. Jeder Wiederholungsversuch ruft `apiCall()` frisch auf → frischer `qwen-code.llm_request`-Span. Es gibt keinen einzigen gemeinsamen Span über die Versuche hinweg. Ein Akkumulator innerhalb von `LoggingContentGenerator` würde nicht funktionieren.
>
> **Lösung**: Wiederholungszustand über `AsyncLocalStorage` propagieren (`retryContext` in `packages/core/src/utils/retryContext.ts`). `retryWithBackoff` umschließt jedes `await fn()` mit `retryContext.run({ attempt, requestSetupMs, retryTotalDelayMs }, fn)`. `LoggingContentGenerator` liest das ALS in seinem synchronen Präludium und leitet die Werte an `endLLMRequestSpan` weiter. Dies bietet tatsächlich eine **reichere** Beobachtbarkeit als der ursprüngliche Plan – jeder Span pro Versuch hat seine eigene `duration_ms`/`ttft_ms`/Fehlerdetails UND weiß über die Attribute `attempt`/`requestSetupMs`/`retryTotalDelayMs`, wo er sich im Wiederholungsbudget befindet.
>
> Der ALS-Ansatz passt zu vorhandenen Mustern in der Codebasis (`promptIdContext`, `subagentNameContext`, `agent-context`) – minimale neue Oberfläche, gut verstandene Semantik. Der Plan-Mode-Review-Prozess hat diese Überarbeitung in 3 Review-Runden mit 22 gefundenen Problemen erfasst, die alle vor dem Merge behoben wurden.

`retryWithBackoff` ruft derzeit `logRetryAttempt` (`retry.ts:343`) auf, das nur in `debugLogger.warn` schreibt. Wir erweitern das `RetryOptions`-Interface um einen optionalen Callback:

```ts
// utils/retry.ts
interface RetryOptions<T> {
  // ... existing fields ...
  /**
   * Optional. Wird einmal pro fehlgeschlagenem Versuch aufgerufen, vor dem Backoff-Sleep.
   * Erhält die Versuchsnummer (1-basiert), den Fehler und die Verzögerung vor
   * dem nächsten Versuch. Verwenden Sie dies, um Telemetrieereignisse für LLM-Aufrufstellen zu senden;
   * für Nicht-LLM-Aufrufer (z. B. channels/weixin) undefiniert lassen, damit diese
   * in LLM-spezifischen Telemetriekanälen still bleiben.
   */
  onRetry?: (info: RetryAttemptInfo) => void;
}

interface RetryAttemptInfo {
  attempt: number; // 1‑based, entspricht debugLogger‑Ausgabe
  error: unknown;
  errorStatus?: number;
  delayMs: number; // Verzögerung vor dem nächsten Versuch
}
```

Die 4 LLM-Aufrufstellen (`client.ts:1540`, `baseLlmClient.ts:193,282`, `geminiChat.ts:1039`) registrieren einen Callback, der ein neues `ApiRetryEvent` ausgibt:
```ts
// types.ts — new event class, sibling to ContentRetryEvent
export class ApiRetryEvent implements BaseTelemetryEvent {
  'event.name': typeof EVENT_API_RETRY;
  'event.timestamp': string;
  model: string;
  prompt_id?: string;
  attempt_number: number; // 1-based
  error_type: string;
  error_message: string; // truncated to 256 chars
  status_code?: number;
  retry_delay_ms: number;
  // ... duration_ms set to retry_delay_ms so LogToSpanProcessor renders
  // a bridge span of meaningful width
  duration_ms: number;
}
```

**Warum eine neue Event-Klasse und nicht `ContentRetryEvent` erweitern**:

- `ContentRetryEvent` hat 2 Downstream-Consumer (qwen-logger, log-record-Export). Eine Änderung des Payloads könnte sie beschädigen.
- Die Bezeichnung „content retry“ bezieht sich semantisch auf Content-Recovery-Retrys (ungültiger Stream, Schema-Reparatur) – eine Erweiterung auf Rate-Limit-Retrys würde das Schema aufweichen.
- Das neue Event ist additiv; kein Consumer wird überrascht.

**Warum den Callback nicht in `retry.ts` einbetten**: `retry.ts` wird auch von `channels/weixin/src/api.ts` verwendet (Microsoft-Messaging-API-Retrys). Eine feste Kopplung von LLM-Telemetrie innerhalb von `retry.ts` würde `ApiRetryEvent` für Nicht-LLM-Retrys auslösen. Der `onRetry`-Callback ist pro Aufrufer optional – LLM-Aufrufer aktivieren ihn, der Weixin-Aufrufer nicht.

**Koexistenz von `ContentRetryEvent`**: `ContentRetryEvent` bleibt unverändert für Content-Recovery-Retrys innerhalb von `geminiChat.ts:806,830`. `ApiRetryEvent` deckt die Rate-Limit-/5xx-Retrys aus `retryWithBackoff` ab. Die beiden Events feuern aus verschiedenen Schichten und duplizieren sich nie. Das bestehende Log-Bridge-Verhalten für beide Events bleibt über `LogToSpanProcessor` erhalten – beide Events schachteln sich automatisch unter den aktiven LLM-Span (Phase-1-Verkabelung stellt sicher, dass der LLM-Span während der Retrys aktiv ist).

**Persistenter Retry-Modus (`QWEN_CODE_UNATTENDED_RETRY`)**: Eine einzelne 429-Schleifenanfrage kann 50+ Events auslösen. Eine Ratenbegrenzung der Emission in Phase 4 ist nicht vorgesehen – falls die Produktionsvolumen untragbar werden, fügen Sie in einem Folge-PR ein Per-Span-Limit mit einem zusammenfassenden Event hinzu. Die aggregierten `attempt`- und `retry_total_delay_ms`-Werte auf dem übergeordneten LLM-Span (D5) bleiben unabhängig von einer Event-Obergrenze korrekt.

### D5 — Aggregation des übergeordneten LLM-Spans: nur skalare Attribute (keine Map-typisierten Attribute)

OTel-Span-Attribute sind skalare Werte (`string | number | boolean | array of these`). Map-typierte Attribute (wie `retry_count_by_status: {429:2, 503:1}`) erfordern eine JSON-Serialisierung und sind schwer abfragbar. Wir verzichten darauf.

| Attribut                  | Typ    | Semantik                                                                                                                              |
| ------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `attempt`                 | int    | 1-basierter monotoner Zähler aus `retryContext.attempt` (Iteration dieses Versuchs). Immer befüllt (Standardwert 1, wenn kein Retry-Kontext vorhanden) |
| `retry_total_delay_ms`    | int    | Kumulative Backoff-Schlafzeit VOR Beginn dieses Versuchs. Undefiniert für direkte Aufrufe; 0 für Versuch 1; > 0 für nachfolgende wiederholte Versuche |
| `ttft_ms`                 | int    | TTFT gemäß D1; undefiniert für Nicht-Streaming- oder vor dem ersten Chunk abgebrochene Anfragen                                      |
| `request_setup_ms`        | int    | Gemäß D3                                                                                                                              |
| `sampling_ms`             | int    | Gemäß D6                                                                                                                              |
| `output_tokens_per_second` | double | Abgeleitet; `output_tokens / (sampling_ms / 1000)`; undefiniert, wenn `sampling_ms === 0`                                            |

Die Verteilung der Statuscodes pro Versuch (z. B. „2 der 3 Versuche waren 429“) ist über Log-Bridge-Spans der `ApiRetryEvent`-Datensätze abfragbar. Es ist nicht nötig, dies als abgeflachtes Attribut auf dem übergeordneten Span zu duplizieren.

**Warum `sampling_ms` und `output_tokens_per_second` auf dem Span**: Ableitbar, aber in Backend-Abfragen umständlich zu berechnen, wenn viele Spans summiert werden. Gleiches Kosten-Nutzen-Verhältnis wie `request_setup_ms` (D3).

### D6 — `recordApiRequestBreakdown()` für 3 von 4 Phasen aktivieren

In `endLLMRequestSpan` (oder dem Wrapper, der sie aufruft) nach Berechnung von TTFT/Setup/Sampling:

```ts
recordApiRequestBreakdown(config, model, [
  { phase: ApiRequestPhase.REQUEST_PREPARATION, durationMs: requestSetupMs },
  { phase: ApiRequestPhase.NETWORK_LATENCY, durationMs: ttftMs }, // ttftMs = network + first-token-generation
  { phase: ApiRequestPhase.RESPONSE_PROCESSING, durationMs: samplingMs },
]);
```

**Warum `TOKEN_PROCESSING** überspringen**: qwen-code führt die Stream-Chunk-Verarbeitung inline durch (Konsolidierung erfolgt im Wrapper bei `loggingContentGenerator.ts:644`); die Post-Stream-Abschlussphase dauert <10ms und ist architektonisch nicht eigenständig. Das Füllen mit einem bedeutungslosen Wert verschmutzt das Histogramm. Den Enum-Wert ungenutzt zu lassen, ist sicher – `apiRequestBreakdownHistogram.record(value, {model, phase})` ist nur ein Histogramm mit `phase` als Label; fehlende Labels sind in Abfragen einfach nicht vorhanden.

**Warum `NETWORK_LATENCY` nicht neu definieren**: Der Spec-Name ist etwas irreführend (es ist Netzwerk + First-Token-Generierung, nicht reine Netzwerklatenz), aber:

- Der Enum ist Teil von `metrics.ts:330-334`, das aus `index.ts:117` exportiert und getestet wird.
- Backend-Dashboards könnten diese Phasennamen bereits referenzieren.
- Eine Umbenennung oder Hinzufügung einer neuen Phase wäre ein Breaking Change für eine vernachlässigbare Genauigkeitsverbesserung.

Dokumentieren Sie die Semantik im Design-Doc; lassen Sie den Enum unverändert.

**Warum auf dem Span-Pfad, nicht parallel**: Hält `recordApiRequestBreakdown` zusammen mit den Span-Attributschreibvorgängen – ein einzelner geschützter Emissionspunkt (siehe D7 Idempotenz), eine einzelne Ordnungsinvariante.

### D7 — `endLLMRequestSpan`-Idempotenz: Metrikerfassung hinter dem vorhandenen Double-End-Guard

Phase 1.5 (#4302) hat festgestellt, dass `endLLMRequestSpan` zweimal aufgerufen werden kann (Abbruch-Pfad + Fehler-Pfad-Kollision). Der vorhandene Guard bei `session-tracing.ts:~470` (`if (!activeSpans.has(...)) return;`) verhindert doppeltes `span.end()`. Die Metrikerfassung in Phase 4 (D6) **muss innerhalb desselben geschützten Blocks sitzen**, vor `span.end()`:

```ts
// session-tracing.ts — endLLMRequestSpan
const llmCtx = activeSpans.get(spanRef);
if (!llmCtx) return;            // bereits beendet – Double-End-Guard
activeSpans.delete(spanRef);    // Ende beanspruchen

// ... Dauer berechnen, Attribute setzen ...
if (metadata) {
  recordApiRequestBreakdown(config, llmCtx.attributes.model, [...]);   // NEU – geschützt
  recordTokenUsageMetrics(...); // vorhanden
}

span.end();
```

Dies stellt sicher, dass die Metrik **exakt einmal** pro LLM-Anfrage erfasst wird, passend zum Span-Lebenszyklus.

**Warum nicht in `loggingContentGenerator` erfassen**: Dieser sieht den Abbruch-Pfad nicht. Die Erfassung auf der Span-Lebenszyklus-Ebene stellt sicher, dass jede LLM-Anfrage, die einen Span öffnet, genau eine Breakdown-Stichprobe erzeugt, unabhängig von Erfolg/Fehler/Abbruch.

### D8 — Dual-Emission der GenAI-SemConventions (private Namen maßgeblich)

Jedes Phase-4-Attribut, das einem OTel GenAI SemConv-Attribut entspricht, wird zweimal auf den Span geschrieben:

| qwen-code privat (maßgeblich)              | GenAI SemConv (Kompatibilitätsschicht)                 | Einheitenumrechnung | Spec-Status  |
| ------------------------------------------ | ------------------------------------------------------ | ------------------- | ------------ |
| `ttft_ms` (ms, int)                        | `gen_ai.server.time_to_first_token` (s, double)        | `ttftMs / 1000`     | Experimental |
| `input_tokens` (int)                       | `gen_ai.usage.input_tokens` (int)                      | identisch           | Stable       |
| `output_tokens` (int)                      | `gen_ai.usage.output_tokens` (int)                     | identisch           | Stable       |
| `cached_input_tokens` (int) (falls vorhanden) | `gen_ai.usage.cached_tokens` (int)                     | identisch           | Experimental |
| `qwen-code.model` (string)                 | `gen_ai.request.model` (string)                        | identisch           | Stable       |

**Vorhandene Token-Attributnamen** auf dem LLM-Span (gesetzt in `endLLMRequestSpan` vor Phase 4): qwen-code verwendet bereits `input_tokens` und `output_tokens`. Phase 4 fügt die `gen_ai.usage.*`-Geschwister hinzu, um dem Muster von #4410 zu entsprechen. Die einfachen Namen bleiben; **nicht umbenennen**.

Felder ohne GenAI-SemConv-Äquivalent – `request_setup_ms`, `sampling_ms`, `retry_total_delay_ms`, `attempt`, `output_tokens_per_second` – werden nur unter dem qwen-code-Namespace emittiert.

**Warum „private maßgeblich, SemConv als Kompatibilität“**:

- Interne Dashboards, SLOs, debugLogger-Ausgabe, qwen-logger RUM, ARMS-Abfragen – alle referenzieren `ttft_ms` usw. Die Behandlung dieser als kanonisch vermeidet eine Tag-Flag-Migration.
- Die experimentelle GenAI SemConv könnte `gen_ai.server.time_to_first_token` umbenennen, bevor sie den Stable-Status erreicht. Wenn dies geschieht, aktualisieren wir die SemConv-Emission; die qwen-code-Namen bleiben unverändert.
- Zukünftige spec-bewusste Backends (Datadog AI Views, Honeycomb AI, ARMS GenAI Dashboards) erkennen die `gen_ai.*`-Attribute automatisch ohne unser Zutun.

**Warum Dual-Emission mit Einheitenumrechnung** (ms ↔ Sekunden): GenAI SemConv hat Sekunden-als-Double für Latenz gewählt; qwen-code hat ms-als-int gewählt (passt zu `duration_ms`, das bereits auf dem Span vorhanden ist). Beide Darstellungen haben ihren Wert; die Umrechnung ist kostengünstig.

## Helper-API (additiv zu `session-tracing.ts`)

```ts
// session-tracing.ts — LLMRequestMetadata interface extended (additive)
export interface LLMRequestMetadata {
  // ... vorhandene Felder: inputTokens, outputTokens, cachedInputTokens, success, error, ...

  /** Zeit vom Start des erfolgreichen Versuchs bis zum ersten sichtbaren Inhalts-Chunk (ms). Undefiniert für Nicht-Streaming- oder vor dem ersten Chunk abgebrochene Anfragen. */
  ttftMs?: number;

  /** Zeit vom Eintritt in generateContent bis zum Start des erfolgreichen Versuchs (ms). Beinhaltet alle fehlgeschlagenen Retrys + Backoff. */
  requestSetupMs?: number;

  /** Letzte Versuchsnummer (1-basiert). 1 = keine Retrys. */
  attempt?: number;

  /** Summe aller Backoff-Verzögerungen vor dem erfolgreichen Versuch (ms). */
  retryTotalDelayMs?: number;
}

// Keine neuen exportierten Hilfsfunktionen – Phase 4 verwendet startLLMRequestSpan / endLLMRequestSpan mit erweiterten Metadaten.
```

```ts
// types.ts — new event class
export class ApiRetryEvent implements BaseTelemetryEvent {
  'event.name': typeof EVENT_API_RETRY = EVENT_API_RETRY;
  'event.timestamp': string;
  model: string;
  prompt_id?: string;
  attempt_number: number;
  error_type: string;
  error_message: string;
  status_code?: number;
  retry_delay_ms: number;
  duration_ms: number;  // = retry_delay_ms, treibt die LogToSpanProcessor-Bridge-Span-Breite

  constructor(opts: { model: string; promptId?: string; attemptNumber: number; error: unknown; statusCode?: number; retryDelayMs: number }) { ... }
}

// constants.ts
export const EVENT_API_RETRY = 'qwen-code.api_retry';

// loggers.ts
export function logApiRetry(config: Config, event: ApiRetryEvent): void { ... }
```

```ts
// utils/retry.ts — RetryOptions extension
interface RetryOptions<T> {
  // ... vorhanden ...
  onRetry?: (info: RetryAttemptInfo) => void;
}

interface RetryAttemptInfo {
  attempt: number;
  error: unknown;
  errorStatus?: number;
  delayMs: number;
}

// Innerhalb von retryWithBackoff, wo heute logRetryAttempt aufgerufen wird:
options.onRetry?.({ attempt, error, errorStatus, delayMs: actualDelay });
logRetryAttempt(attempt, error, errorStatus); // vorhandener debugLogger-Aufruf unverändert
```

## Lebenszyklus-Verkabelung

### Streaming-Pfad (der häufige Fall)

```ts
// loggingContentGenerator.ts:283 — generateContentStream
async generateContentStream(req, userPromptId): Promise<AsyncGenerator<GenerateContentResponse>> {
  const requestEntryTime = Date.now();
  let attemptStart = requestEntryTime;
  const attemptStartTimes: number[] = [attemptStart];
  let retryTotalDelayMs = 0;
  let finalAttempt = 1;

  // Vorhandenes startLLMRequestSpan verwenden (Phase 1)
  // onRetry-Callback an die verwendete Retry-Schicht weitergeben:
  const onRetry: RetryAttemptInfo & { invoke: ... } = (info) => {
    finalAttempt = info.attempt + 1;        // wir beginnen gleich Versuch N+1
    retryTotalDelayMs += info.delayMs;
    attemptStart = Date.now() + info.delayMs; // ungefähr; tatsächliches Zurücksetzen erfolgt am Anfang des nächsten Versuchs
    attemptStartTimes.push(attemptStart);
    // ApiRetryEvent auslösen
    logApiRetry(this.config, new ApiRetryEvent({
      model: req.model,
      promptId: userPromptId,
      attemptNumber: info.attempt,
      error: info.error,
      statusCode: info.errorStatus,
      retryDelayMs: info.delayMs,
    }));
  };

  // Stream-Wrapper erkennt den ersten für den Benutzer sichtbaren Chunk:
  return this.processStreamGenerator(stream, ..., {
    onFirstUserVisibleChunk: (now) => {
      ttftMs = now - attemptStart;
    },
  });
}
```

Am Span-Ende (bereits im Phase-1-Fluss von `endLLMRequestSpan`) die neuen Felder in `LLMRequestMetadata` aufnehmen:

```ts
endLLMRequestSpan(llmSpan, {
  success: true,
  inputTokens,
  outputTokens,
  cachedInputTokens,
  ttftMs,
  requestSetupMs: attemptStart - requestEntryTime,
  attempt: finalAttempt,
  retryTotalDelayMs,
});
```

### Nicht-Streaming-Pfad

`generateContent` (`loggingContentGenerator.ts:212`) erzeugt keine Streaming-Chunks. TTFT ist `undefined`; `request_setup_ms` ist weiterhin sinnvoll (erfasst Retry-Overhead). Die Breakdown-Metrik erfasst 2 Phasen (REQUEST_PREPARATION + RESPONSE_PROCESSING, wobei `RESPONSE_PROCESSING = duration_ms - request_setup_ms`), nicht 3.

### Integration der Retry-Schicht (4 Stellen)

Jede der 4 LLM-`retryWithBackoff`-Aufrufstellen fügt `onRetry` hinzu:

```ts
// client.ts:1540 (ähnlich in baseLlmClient.ts:193, 282, geminiChat.ts:1039)
const result = await retryWithBackoff(apiCall, {
  ...existingOptions,
  onRetry: (info) => {
    logApiRetry(
      this.config,
      new ApiRetryEvent({
        model,
        promptId: userPromptId,
        attemptNumber: info.attempt,
        error: info.error,
        statusCode: info.errorStatus,
        retryDelayMs: info.delayMs,
      }),
    );
    // auch an den lokalen Retry-Akkumulator von LoggingContentGenerator zurückmelden
    // (wenn im Scope – für Aufrufer, die nicht über LoggingContentGenerator gehen,
    // erhält der LLM-Span trotzdem `attempt` und `retry_total_delay_ms` über den
    // Metadaten-Pfad, da endLLMRequestSpan auf der LLM-Ebene aufgerufen wird)
  },
});
```

Der Nicht-LLM-Aufrufer (`channels/weixin/src/api.ts`) **registriert `onRetry` nicht** – für seine Retrys wird kein `ApiRetryEvent` ausgelöst, entsprechend dem heutigen Verhalten.

## Gleichzeitigkeitssicherheit – die Hauptgarantie

Die `LoggingContentGenerator`-Instanz wird gemeinsam genutzt (eine pro `ContentGenerator`, `contentGenerator.ts:377`). Drei gleichzeitige `generateContentStream`-Aufrufe (z. B. 3 Sub-Agenten, die über `coreToolScheduler.runConcurrently` ausgeführt werden) führen drei unabhängige Closures von `generateContentStream` aus:

```
call_A: attemptStart_A, ttftMs_A, ... (Closure)
call_B: attemptStart_B, ttftMs_B, ... (Closure)
call_C: attemptStart_C, ttftMs_C, ... (Closure)
```

Lokale Variablen pro Aufruf überschneiden sich nie. Stream-Chunks werden gegen das lokale `attemptStart` jedes Aufrufs erkannt. Span-Attribute werden im eigenen `endLLMRequestSpan` jedes Aufrufs gesetzt.

`AsyncLocalStorageContextManager` (registriert von NodeSDK unter `sdk.ts:273`) stellt bereits sicher, dass der aktive OTel-Kontext – und damit der an `startLLMRequestSpan` übergebene Eltern-Span – pro Fiber korrekt ist.

## Zu ändernde Dateien

| Datei                                                                           | Änderung                                                                                                                                                                                                                                  | LOC-Schätzung |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- |
| `packages/core/src/telemetry/constants.ts`                                      | `EVENT_API_RETRY`-Konstante hinzufügen                                                                                                                                                                                                     | +2            |
| `packages/core/src/telemetry/types.ts`                                          | `ApiRetryEvent`-Klasse + Union-Member hinzufügen                                                                                                                                                                                           | +40           |
| `packages/core/src/telemetry/loggers.ts`                                        | `logApiRetry()`-Funktion hinzufügen                                                                                                                                                                                                        | +20           |
| `packages/core/src/telemetry/qwen-logger/qwen-logger.ts`                        | `logApiRetryEvent()` für RUM-Downstream-Konsistenz hinzufügen                                                                                                                                                                               | +20           |
| `packages/core/src/telemetry/session-tracing.ts`                                | `LLMRequestMetadata` erweitern (ttftMs, requestSetupMs, attempt, retryTotalDelayMs); `endLLMRequestSpan` erweitern, um neue Attribute + Breakdown-Metrik + Dual-Emission gen_ai.* zu setzen                                                | +60           |
| `packages/core/src/telemetry/metrics.ts`                                        | `recordApiRequestBreakdown`-Aufrufstelle innerhalb von `endLLMRequestSpan` verdrahten (keine Änderung am vorhandenen Recorder)                                                                                                              | 0             |
| `packages/core/src/utils/retry.ts`                                              | `onRetry?: (info: RetryAttemptInfo) => void` zu `RetryOptions` hinzufügen; `RetryAttemptInfo` exportieren; Callback an der vorhandenen `logRetryAttempt`-Stelle aufrufen                                                                  | +25           |
| `packages/core/src/core/loggingContentGenerator/loggingContentGenerator.ts`     | TTFT-Erfassung: methodenlokale Akkumulatoren + `hasUserVisibleContent`-Helper + First-Chunk-Erkennung im Stream-Wrapper; neue Metadaten an `endLLMRequestSpan` übergeben                                                                   | +80           |
| `packages/core/src/core/client.ts`                                              | `onRetry`-Callback an der `retryWithBackoff`-Aufrufstelle verdrahten (`client.ts:1540`)                                                                                                                                                     | +15           |
| `packages/core/src/core/baseLlmClient.ts`                                       | `onRetry`-Callback an 2 `retryWithBackoff`-Aufrufstellen verdrahten                                                                                                                                                                        | +25           |
| `packages/core/src/core/geminiChat.ts`                                          | `onRetry`-Callback an der `retryWithBackoff`-Aufrufstelle verdrahten (`geminiChat.ts:1039`)                                                                                                                                                | +15           |
| `packages/core/src/telemetry/session-tracing.test.ts`                           | `endLLMRequestSpan` setzt ttft_ms / request_setup_ms / attempt / retry_total_delay_ms / sampling_ms / output_tokens_per_second + gen_ai-Dual-Emission + Breakdown-Metrik (jede Phase) + idempotentes Ende                                  | +120          |
| `packages/core/src/core/loggingContentGenerator/loggingContentGenerator.test.ts`| `hasUserVisibleContent` (text / functionCall / inlineData / executableCode / thought / role-only / usage-only); gleichzeitige Aufrufe kontaminieren sich nicht gegenseitig; TTFT undefiniert bei Abbruch vor erstem Chunk; TTFT undefiniert bei Nicht-Streaming | +100          |
| `packages/core/src/utils/retry.test.ts`                                         | `onRetry` wird pro fehlgeschlagenem Versuch mit korrektem `attempt`, `delayMs`, `error`, `errorStatus` aufgerufen; Fehlen von `onRetry` ist still (keine Telemetrie ausgelöst)                                                              | +50           |
| `packages/core/src/telemetry/loggers.test.ts`                                   | `logApiRetry` gibt LogRecord mit erwartetem Payload aus; bridget über LogToSpanProcessor in einen unter dem aktiven LLM-Span geschachtelten Span                                                                                           | +40           |
```
Gesamt: 14 Dateien, ~610 LOC. Größer als Phase 2 (#4321) aber vergleichbar mit Phase 3 (#4410) und gerechtfertigt durch die Breite der Integration (4 Retry-Stellen + Telemetrie-Infrastruktur + Streaming-Wrapper).

Falls das Review wegen der Größe Druck macht: Aufteilen in **Phase 4a + 4b + 4c**:

- **4a** (~200 LOC): TTFT-Erfassung + erweitertes `LLMRequestMetadata` + Dual-Emit. In sich geschlossener Wert (TTFT-Sichtbarkeit ab Tag eins).
- **4b** (~250 LOC): `onRetry`-Callback + `ApiRetryEvent` + 4 Aufrufer-Verdrahtung. **Unabhängig ein Bugfix** für die `retryWithBackoff`-Telemetrielücke.
- **4c** (~160 LOC): `recordApiRequestBreakdown`-Aktivierung + Parent-Span-Aggregationsattribute (`attempt`, `retry_total_delay_ms`, `sampling_ms`, `output_tokens_per_second`). Hängt von 4a + 4b ab.

## Teststrategie

| Test                                                                                                                                         | Beweis                                                                                   |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `hasUserVisibleContent` gibt true für text/functionCall/inlineData/executableCode/thought zurück                                              | D1-Semantik über Part-Typen hinweg                                                        |
| `hasUserVisibleContent` gibt false für reine-role- und reine-usage-Chunks zurück                                                             | D1-Negativfälle                                                                          |
| Streaming: TTFT gemessen vom Start eines Versuchs bis zum ersten sichtbaren Chunk                                                              | End-to-End-TTFT-Erkennung                                                                |
| Streaming: TTFT undefiniert, wenn der Stream vor dem ersten sichtbaren Chunk abbricht                                                          | Grenzfall                                                                                |
| Streaming: TTFT berechnet ab dem Start des letzten Versuchs (nicht des ersten)                                                                 | D3 — TTFT-Reset bei Wiederholung                                                         |
| Nicht-Streaming: TTFT bleibt undefiniert                                                                                                     | S3-Entscheidung                                                                          |
| Gleichzeitige `generateContentStream`-Aufrufe kontaminieren TTFT nicht gegenseitig                                                           | D2 — methodenlokale Garantie                                                             |
| `endLLMRequestSpan` setzt alle Phase-4-Attribute (ttft_ms, request_setup_ms, sampling_ms, attempt, retry_total_delay_ms, output_tokens_per_second) | Vorhandensein der Attribute                                                              |
| `endLLMRequestSpan` emittiert dual gen_ai.server.time_to_first_token + gen_ai.usage.\* + gen_ai.request.model                                  | D8-Dual-Emit                                                                             |
| `endLLMRequestSpan` zeichnet Breakdown-Metrik mit 3 Phasen für Streaming, 2 für Nicht-Streaming auf                                            | D6                                                                                       |
| `endLLMRequestSpan` zweimal aufgerufen: Metrik genau einmal aufgezeichnet, Attribute nicht zurückgesetzt                                      | D7-Idempotenz                                                                            |
| `retryWithBackoff` mit `onRetry`: Callback wird pro fehlgeschlagenem Versuch mit korrekten Argumenten aufgerufen                               | D4-Callback-Vertrag                                                                      |
| `retryWithBackoff` ohne `onRetry`: keine Telemetrie emittiert (stumm für Nicht-LLM-Aufrufer)                                                  | P2 — Channels/Weixin-Bereichsschutz                                                      |
| `client.ts` / `baseLlmClient.ts` / `geminiChat.ts`-Retry-Callstellen emittieren `ApiRetryEvent` bei Wiederholung                                | Integration von D4 an 4 Stellen                                                          |
| `ApiRetryEvent` LogRecord wird via LogToSpanProcessor zu einem Child-Span unter dem aktiven LLM-Span verbunden                                 | Korrektheit des Tracebaums                                                               |
| LLM-Span-Attribut `attempt` spiegelt korrekt die endgültige Versuchsnummer bei Wiederholungen wider                                            | D5-Aggregation                                                                           |
| LLM-Span-Attribut `retry_total_delay_ms` summiert korrekt onRetry-Verzögerungen                                                               | D5-Aggregation                                                                           |
| `output_tokens_per_second` undefiniert wenn `sampling_ms === 0` (kein Streaming)                                                               | Vermeidung von Division-durch-Null                                                        |

## Grenzfälle

| Fall                                                                                  | Behandlung                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stream bricht ab, bevor ein Chunk ankommt                                             | `ttftMs = undefined`, `sampling_ms = undefined`, `output_tokens_per_second = undefined`. `attempt`, `request_setup_ms` werden trotzdem gesetzt. `success = false`                                                                                 |
| Stream bricht nach dem ersten Chunk ab                                                | `ttftMs` gesetzt; `sampling_ms` = `duration_ms - ttftMs - request_setup_ms`; spiegelt partielle Antwortzeit wider. `success = false`                                                                                                              |
| Wiederholung erfolgreich bei Versuch 1 (keine Wiederholungen)                         | `attempt = 1`, `retry_total_delay_ms = 0`, kein `ApiRetryEvent` emittiert, Breakdown-Metrik zeichnet `request_setup_ms` nahe 0 auf                                                                                                                |
| Dauerhafter Wiederholungsmodus mit 50+ Versuchen                                      | 50+ `ApiRetryEvent`-Datensätze emittiert (Obergrenze außerhalb des Scopes zurückgestellt); LLM-Span `attempt = 51`, `retry_total_delay_ms = Summe aller Verzögerungen`. Operator sieht aggregierte Ansicht auf Span; vollständige Details pro Versuch in Log-Bridge-Spans |
| Nicht-LLM-`retryWithBackoff`-Aufrufer (channels/weixin)                                | Kein `onRetry` registriert; nur vorhandener `debugLogger.warn` feuert. Kein `ApiRetryEvent`; keine Breakdown-Metrik (Aufrufer ist keine LLM-Stelle)                                                                                               |
| `endLLMRequestSpan` zweimal aufgerufen (Abbruch + Fehler-Race)                        | Phase 1.5-Guarde bei `activeSpans.delete()` gibt bei zweitem Aufruf vorzeitig zurück; `recordApiRequestBreakdown` befindet sich innerhalb der Guarde, genau einmal aufgezeichnet                                                                  |
| Anthropic-`message_start`-Chunk kommt vor Inhalt an                                  | `hasUserVisibleContent` gibt false zurück (keine Parts mit text/functionCall/etc.); TTFT wird erst beim nachfolgenden `content_block_delta`-Chunk ausgelöst                                                                                        |
| OpenAI erster Chunk mit leerem `delta.content` aber nur `role`                        | `hasUserVisibleContent` gibt false zurück; TTFT wird erst beim ersten Chunk mit nicht-leerem delta ausgelöst                                                                                                                                      |
| Nur-Tool-Call-Antwort (kein Text)                                                      | Erster Chunk mit `functionCall`-Part löst TTFT aus; `output_tokens_per_second` wird gegen Tool-Call-Tokenanzahl berechnet                                                                                                                          |
| Gleichzeitige Subagenten (3 Aufrufe parallel)                                          | Jeder Aufruf hat seinen eigenen Closure mit `attemptStart`, `ttftMs`, `attemptStartTimes`. Pro-Aufruf-Span erhält eigene Metadaten bei `endLLMRequestSpan`. Keine Überlappung (D2)                                                                |
| SDK-interne Wiederholungen in openai-sdk (`maxRetries=3`)                              | Unsichtbar für qwen-code-Telemetrie – finden vollständig innerhalb des SDKs statt, bevor retryWithBackoff die Anfrage sieht. `attempt` spiegelt nur retryWithBackoff-Versuche wider. Außerhalb des Scopes (siehe Out-of-scope)                     |
| `gen_ai.server.time_to_first_token`-Spezifikation wird vor Stable umbenannt           | Einzelfile-Update: `session-tracing.ts:endLLMRequestSpan`. Das qwen-code-native `ttft_ms` bleibt maßgeblich – keine Auswirkungen nachgelagerter Systeme                                                                                            |
| LLM-Anfrage eines Subagenten                                                            | Parent ist der Subagenten-Span (Phase 3). Phase-4-Felder verschachteln sich korrekt. Aggregationen gruppiert nach `qwen-code.subagent.id` liefern LLM-Performance pro Subagent – Design-Doc-Zukunft, einfaches Follow-up                            |
| Reasoning-Modell mit langen Thought-Blöcken                                           | Erster `thought`-Part löst TTFT aus; `sampling_ms` umfasst sowohl Denk- als auch Antwortphase. Aufteilung in separate Metriken zurückgestellt                                                                                                     |

## Rollback

Die Änderung ist auf OTel- und Metrikebene additiv – jedes neue Attribut ist optional, jedes neue Event ist eine neue Klasse. Bestehende Dashboards, die nicht auf die neuen Felder filtern, funktionieren unverändert weiter.

Verhaltensändernde Auswirkungen:

- Neue `ApiRetryEvent` LogRecord fließen → Logvolumen steigt proportional zur Wiederholungsrate (typischerweise <1% der Anfragen wiederholt). Abmildern durch Sampling von LogRecord auf SDK-Ebene, falls nötig.
- Neue Breakdown-Metrik `qwen-code.api.request.breakdown` beginnt Zeitreihen zu produzieren → leichter Prometheus-Kardinalitätsanstieg (`{model, phase}` – begrenzt).
- Abgeleitetes Attribut `output_tokens_per_second` kann auf Dashboards, die „alle Attribute“ filtern, ungewöhnlich erscheinen – dokumentieren.

Rollback-Pfad: Den einzelnen PR zurücksetzen (oder unabhängig jeden von 4a/4b/4c). Alle neuen Felder verwenden defensive Defaults (undefined / 0) und ändern die Span-Struktur nicht.

## Sequenzierung

- **Nach Phase 3 (#4410, im Review)**: keine harte Abhängigkeit. Phase-4-Attribute werden an `qwen-code.llm_request`-Spans angehängt, unabhängig davon, ob sie unter einem `qwen-code.subagent` (Phase 3) oder `qwen-code.interaction` (Phase 1) als Parent liegen. Empfehlung: Phase 3 zuerst landen lassen, damit die Aggregation pro Versuch unter Subagenten-Subbäumen natürlich funktioniert.
- **Unabhängig von #4384** (`traceparent` + `X-Qwen-Code-Session-Id`-Outbound-Propagation). Sie betreffen die HTTP-Schicht; Phase 4 betrifft die Stream-/Retry-/Metrik-Schicht.
- **Unabhängig vom `clearDetailedSpanState`-Chat-Kompaktierungs-Follow-up** (#4097 Follow-up). Unterschiedliche Oberfläche.

## Offene Fragen

1. **Semantik des `onRetry`-Callback-Aufrufs**: Wird er **vor** dem Backoff-Schlaf (aktueller Vorschlag) oder **danach** (wenn der nächste Versuch kurz vor dem Start steht) aufgerufen? Vorher ist einfacher – der Callback hat alle Informationen sofort; danach müsste die gerade abgeschlossene Verzögerung separat erfasst werden. Vor-Schlaf wird empfohlen; im Callback-Vertrag dokumentieren.
2. **Timing pro Versuch auf dem LLM-Span**: Sollten wir ein Array `attempt_durations_ms: number[]` hinzufügen? OTel unterstützt Array-von-Primitiven-Attribute. Nützlich für die Diagnose „Welcher der N-Versuche war langsam“. Zurückstellen, bis Produktionsdaten Bedarf zeigen – Log-Bridge-Spans tragen bereits das Äquivalent.
3. **Obergrenze für Emission im dauerhaften Wiederholungsmodus**: Ab welchem `attempt > N`-Schwellwert sollten wir samplen? `N = 5` dann 1-in-10? `N = 10` dann nur zusammenfassend? Zurückstellen, bis wir Produktionsvolumendaten haben.
4. **`TOKEN_PROCESSING`-Phase**: Enum-Wert ruhend lassen oder mit etwas verbinden (z.B. Konsolidierungszeit)? Zurückstellen – auf einen echten Anwendungsfall warten.
5. **Subagenten-LLM-Zusammenfassungen**: Triviales Follow-up, sobald Phase 4 landet – summiere `ttft_ms`/`output_tokens`/`input_tokens` pro Subagenten-Subbaum. Nicht Phase-4-Scope, aber der Datenfluss ermöglicht es.