# LLM-Request-Timing-Zerlegungsdesign (P3 Phase 4)

> Issue #3731 — Phase 4 der hierarchischen Session-Traces. Fügt dem `qwen-code.llm_request`-Span Zeit bis zum ersten Token, Anfrage-Setup-Dauer, Sampling-Dauer sowie Telemetrie für einzelne Wiederholungsversuche hinzu, damit Betreiber die Frage "Warum war dieser LLM-Aufruf langsam?" beantworten können, ohne raten zu müssen.
>
> Baut auf Phase 1 (#4126), Phase 1.5 (#4302), Phase 2 (#4321) auf. Unabhängig von Phase 3 (#4410, in Review) — es wird empfohlen, Phase 3 zuerst zu integrieren, damit die feldspezifischen Wiederholungsdaten von Phase 4 sauber in den Subagent-Subbäumen aggregieren.

## Problem

`qwen-code.llm_request`-Spans tragen heute nur `model`, `prompt_id`, `input_tokens`, `output_tokens`, `success`, `error`, `duration_ms`. Betreiber, die einen einzelnen Trace lesen, können nicht erkennen:

1. **Wie viel von `duration_ms` war das Nachdenken des Modells und wie viel der Netzwerkaufbau.** Eine `duration_ms` von 12 Sekunden könnte 11 s Wiederholungen gefolgt von 1 s schneller Generierung sein, oder 100 ms Setup gefolgt von 12 s langsamen Streamings — der Trace sagt es nicht.
2. **Wann der Benutzer das erste Token gesehen hat.** TTFT (Time to First Token) ist das standardmäßige Latenz-SLO für Chat-Oberflächen. Wir können es nicht berechnen; wir erfassen es nicht.
3. **Was während der Wiederholungen passiert ist.** `retryWithBackoff` (`utils/retry.ts:285`) ruft nur `debugLogger.warn` auf — kein OTel-Ereignis, kein Span-Attribut. Die 4 LLM-Aufrufstellen, die es verwenden (`client.ts:1540`, `baseLlmClient.ts:193,282`, `geminiChat.ts:1039`), haben keine Wiederholungssichtbarkeit in Traces oder Metriken. `ContentRetryEvent` existiert für Content-Recovery-Wiederholungen innerhalb von `geminiChat.ts:806,830`, aber nicht für die häufigeren Rate-Limit-/5xx-Wiederholungen.
4. **Dass `api.request.breakdown` toter Code ist.** Die Metrik ist in `metrics.ts:242-251` mit 4 `ApiRequestPhase`-Werten definiert, aus `index.ts:117` exportiert, in `metrics.test.ts:646-675` getestet — aber `recordApiRequestBreakdown()` hat null Aufrufer im Produktionscode. Die Metrikinfrastruktur ist bezahlt; der Datenfluss wurde nie angeschlossen.

Diese Lücken machen `qwen-code.llm_request` zum am wenigsten informativen Span im Trace-Baum. Tool-Spans (#4126/#4321) und Subagent-Spans (#4410) zeigen beide Lebenszyklusphasen; LLM-Spans kollabieren die gesamte Anfrage in eine undurchsichtige Dauer.

## Bestehende Oberfläche (keine Änderung)

| Komponente                                                    | Standort                                                         | Warum wir sie nicht anfassen                                                                                                                                                                                       |
| ------------------------------------------------------------ | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LLM-Anfrage-Span-Lebenszyklus                                   | `session-tracing.ts` `startLLMRequestSpan` / `endLLMRequestSpan` | Phase 1 (#4126) hat die Helfer etabliert. Wir erweitern das Metadaten-Interface, restrukturieren nicht                                                                                                                |
| Aktive Span-Propagation in Provider-Generatoren             | `loggingContentGenerator.ts:213,287`                             | Phase 1 (#4126) hat `withSpan('api.*')` durch native Helfer ersetzt; der aktive Kontext erreicht den Stream-Wrapper bereits                                                                                     |
| `ContentRetryEvent`-Schema + Verbraucher                       | `types.ts:626`, `qwen-logger.ts:947`, `loggers.ts:717`           | Bestehendes Ereignis behält seine Form und nachgelagerten Verbraucher; wir fügen eine verwandte Ereignisklasse für den `retryWithBackoff`-Pfad hinzu                                                                                                |
| `LogToSpanProcessor`-Log-Bridge-Spans                        | `log-to-span-processor.ts`                                       | Die bestehende Bridge von ContentRetryEvent verschachtelt sich weiterhin unter dem aktiven LLM-Span. Phase 4 ändert dies nicht                                                                                               |
| `ApiRequestPhase`-Enum                                       | `metrics.ts:330-334`                                             | Öffentliche Oberfläche (4 Werte). Wir befüllen 3 der 4 aus Produktionscode; lassen das Enum aus Gründen der Rückwärtskompatibilität unverändert                                                                                 |
| Pro-Provider-Chunk-Normalisierung → `GenerateContentResponse` | `loggingContentGenerator.ts:286-393`                             | Jeder Provider normalisiert bereits auf Googles `GenerateContentResponse`-Form, bevor LoggingContentGenerator den Stream sieht. TTFT-Erkennung läuft zentral über diese normalisierte Form; kein pro-Provider-Code |
| `retryWithBackoff`-Allzweck-Wiederholung                     | `utils/retry.ts:140`                                             | Wird sowohl von LLM-Aufrufern als auch von Nicht-LLM (`channels/weixin/src/api.ts`) verwendet. Wir erweitern mit einem opt-in `onRetry`-Callback, anstatt eine feste Kopplung an LLM-Telemetrie zu erzwingen                                                 |
| Nicht-Streaming `generateContent`                              | `loggingContentGenerator.ts:212`                                 | TTFT ist für Nicht-Streaming nicht sinnvoll; die neuen Felder bleiben `undefined`. Span-Lebenszyklus und bestehende Attribute bleiben unverändert                                                                             |
## Außerhalb des Gültigkeitsbereichs (verschoben)

- **SDK-Level-Wiederholungen** (openai SDK `maxRetries=3`, google-genai SDK interne Wiederholungen). Diese finden vollständig innerhalb des Drittanbieter-SDKs statt; um sie zu beobachten, müsste man SDK-Wiederholungen deaktivieren und in `retryWithBackoff` neu implementieren. Separate Entscheidung, nicht Phase 4.
- **Streaming-Metriken pro Token** (Latenz zwischen Tokens, Größe pro Chunk). Nützlich für das Debugging der Inferenz-Engine-Leistung, nicht für die vom Benutzer wahrgenommene Latenz, die Phase 4 anvisiert.
- **Separate TTFT für Reasoning/Thinking-Blöcke.** „Erster Token" beinhaltet Thinking-Inhalte (siehe D1). Eine zukünftige Erweiterung könnte `ttft_to_reasoning_ms` vs. `ttft_to_answer_ms` aufteilen, aber erst wenn bekannt ist, dass Bedarf besteht.
- **Sampling-Phase als dediziertes Child-Span.** Berechenbar aus `duration_ms - ttft_ms - request_setup_ms`; Child-Span bringt keinen Mehrwert für reine OTel-Backends (claude-code verwendet eines nur für Perfetto). Stattdessen als Span-Attribut gespeichert – siehe D6.
- **Persistenter Wiederholungsmodus (`QWEN_CODE_UNATTENDED_RETRY`) – Ereignisratenbegrenzung.** Eine einzelne LLM-Anfrage kann unter persistentem Wiederholungsmodus über 50 `ContentRetryEvent`/`ApiRetryEvent`-Datensätze produzieren. Die Begrenzung der Ausgabe erfolgt in einem späteren Schritt – Phase 4 gibt alle Ereignisse aus; falls die Produktionsauslastung untragbar wird, füge in einem späteren PR eine Begrenzung pro Span mit einem zusammenfassenden Ereignis „+N weitere Versuche (abgeschnitten)" hinzu.
- **Aufschlüsselungsphase `TOKEN_PROCESSING`.** Der Enum-Wert existiert, aber qwen-code hat keine nennenswerte lokale Verarbeitung nach dem Stream, die gemessen werden könnte (typischerweise <10ms). Wird in produktiven Aufrufern übersprungen; Enum-Wert für zukünftige Verwendung oder für Aufrufer, die wir nicht kontrollieren, beibehalten.
- **Migration von `ContentRetryEvent` auf LLM-Span als Span-Events.** Gleiche Begründung wie bei Phase 3's `subagent_execution` LogRecord: bestehende Verbraucher (qwen-logger RUM, zukünftige Metriken) sind eng an das LogRecord gebunden. Bridge-Span-Abdeckung ist gut genug.

## Referenzen (Entscheidungsnachweise)

| Quelle                                                                                                                      | Wesentliche Erkenntnis                                                                                                                                                                                                                                                                                                             |
| --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| claude-code (Anthropic) `claude.ts:1762, 1789, 1982, 2882`                                                                  | TTFT erfasst als `Date.now() - start` beim `message_start` SSE-Ereignis; `start` wird pro Wiederholungsversuch zurückgesetzt. `requestSetupMs = start - startIncludingRetries`. `attemptStartTimes`-Array wird pro Versuch gespeichert. Bestätigt die Machbarkeit des Ansatzes; ihre TTFT-Semantik ist „erstes Stream-Ereignis" (wir weichen ab auf „erster Inhalt" – siehe D1) |
| claude-code `perfettoTracing.ts:549-671`                                                                                    | Rendert Request Setup → Attempt N (Wiederholung) → First Token → Sampling als verschachtelte B/E-Paare. Zeigt die visuelle Zerlegung; qwen-code führt die gleiche Zerlegung mit OTel-Attributen durch, da wir kein Perfetto haben                                                                                                                                                                                |
| claude-code `sessionTracing.ts:447`                                                                                         | Nur `ttft_ms` gelangt auf das OTel-Span (nicht `requestSetupMs`, nicht `samplingMs`, nicht die Zeitmessung pro Versuch). Wir legen bewusst mehr auf das Span – claude-code hat Perfetto zur Visualisierung; wir nicht                                                                                                                                                                                           |
| opencode (sst/opencode) `session/llm.ts`, `route/client.ts`                                                                 | Keine TTFT-Messung. Ein einzelnes `LLM.run` Effect-Span deckt alles ab. Bestätigt, dass die Lücke in konkurrierenden Tools besteht; keine Referenz für das Vorgehen                                                                                                                                                                          |
| [OTel GenAI Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/) (Status: Development / Experimental) | `gen_ai.usage.input_tokens` (Stabil), `gen_ai.usage.output_tokens` (Stabil), `gen_ai.usage.cached_tokens` (Experimentell), `gen_ai.request.model` (Stabil), `gen_ai.server.time_to_first_token` (Experimentell, Sekunden als Double). Das Dual-Emit-Muster folgt dem Präzedenzfall von #4410                                                        |
| [OTel Trace Spec – Span Events](https://opentelemetry.io/docs/specs/otel/trace/api/#add-events)                             | „Events SOLLTEN NICHT verwendet werden, um Informationen aufzuzeichnen, die besser als Span-Attribute erfasst werden." Bestätigt, dass Informationen pro Versuch zu den LLM-Span-Attributen + Log-Bridge-Spans gehören, nicht als Span-Events auf dem Eltern-Span                                                                                                                     |
| Phase 3 Design-Dokument (`telemetry-subagent-spans-design.md`)                                                               | Etablierte das Dual-Emit-Muster (`qwen-code.subagent.id` + `gen_ai.agent.id`) und die Regel „privater Name ist maßgeblich". Phase 4 folgt der gleichen Konvention für TTFT- und Token-Felder                                                                                                                                        |
## Design — sieben Entscheidungen, jeweils begründet

### D1 — TTFT-Semantik: "erster Chunk mit benutzersichtbarem Inhalt"

TTFT misst die Wanduhrzeit vom **Dispatch des erfolgreichen Versuchs** bis zum **ersten Stream-Chunk, der benutzersichtbare Ausgabe enthält**. Ein Chunk ist "benutzersichtbar", wenn ein normalisiertes `Part` in `candidates[0].content.parts` eines der folgenden ist:

- `text` mit nicht-leerem String
- `functionCall` (Tool-Nutzung)
- `inlineData` (Bild, Binärdaten)
- `executableCode`
- `thought` / Reasoning-Inhalt (was auch immer der Anbieter ausspielt — Geminis `thought`, Anthropics `<thinking>`-Block, OpenAI-o1-Reasoning-Chunk)

Chunks, die nur `role`-Metadaten oder nur `usageMetadata` enthalten (finaler Usage-Summary-Chunk), lösen TTFT nicht aus.

**Warum nicht "erstes Stream-Event jeglicher Art" (claude-codes Wahl)**: claude-code misst TTFT bei `message_start`, einem Anthropic-spezifischen Metadaten-Event, das 50–300 ms vor jedem tatsächlichen Inhalt ausgelöst wird. Dessen interner `headlessProfiler.ts` trennt bereits `time_to_first_response_ms` für die "Benutzer hat etwas gesehen"-Semantik und erkennt damit die Unterscheidung an. qwen-code umfasst mehrere Anbieter (Anthropic, OpenAI, Gemini, Qwen) — die Wahl der Metadaten-Event-Semantik würde bedeuten, dass TTFT für Anthropic grundlegend anders ist als TTFT für OpenAI (das kein vergleichbares reines Metadaten-Erstereignis hat). Die benutzersichtbare-Inhalts-Semantik ist über alle 4 Anbieter hinweg einheitlich und entspricht wörtlich der "Time-to-First-Token"-Definition.

**Warum `thought` / Reasoning einbeziehen**: Aus Operator-Sicht sind Reasoning-Chunks immer noch "vom Modell produzierte Ausgabe." Sie auszuschließen würde TTFT für reasoning-lastige Modelle (o1, Qwen-Denkvarianten) unterbewerten. Eine zukünftige Aufteilung in `ttft_to_reasoning_ms` vs `ttft_to_answer_ms` ist möglich, aber nicht Teil von Phase 4.

**Warum reine Tool-Call-Chunks einbeziehen**: Agent-Toolentscheidungs-LLM-Aufrufe (ein `tool_use`, kein Text) sind in qwen-codes Workflow üblich. Sie auszuschließen würde bedeuten, dass TTFT für diese Anfragen undefiniert ist. Das `functionCall`-Part ist eine sinnvolle Ausgabe.

**Hinweis zum Produktvergleich**: Das Design-Dokument stellt explizit klar: `qwen-code.ttft_ms ≈ claude-code.time_to_first_response_ms ≠ claude-code.ttft_ms`. Operatoren, die Produkte vergleichen, sollten sich auf die benutzersichtbare-Inhalts-Semantik einigen.

### D2 — TTFT-Messort: methodenlokale Variablen in `LoggingContentGenerator.generateContentStream`

Die Erst-Chunk-Erkennung läuft innerhalb des bestehenden Stream-Wrappers in `loggingContentGenerator.ts:393` (`async function* processStreamGenerator`). Aufrufspezifische Variablen (`start`, `ttftMs`) leben in der Closure der Methode; **niemals als Instanzfelder**.

**Warum niemals Instanzfelder**: `LoggingContentGenerator` wird **einmal pro `ContentGenerator`** instanziiert (`contentGenerator.ts:377`) und von allen gleichzeitigen `generateContentStream`-Aufrufen gemeinsam genutzt — Subagent-Fan-Out, Warmup-Queries, Side-Queries von `geminiChat`. Ein Instanzfeld würde bei gleichzeitigen Aufrufen überschrieben und für einen von jeweils zwei verschränkten Requests unsinnige TTFT-Werte produzieren.

**Warum nicht AsyncLocalStorage**: ALS würde funktionieren, fügt aber eine Kontextverwaltungsebene für einen Zustand hinzu, der die Methode nicht verlassen muss. Methodenlokal ist einfacher, hat null Overhead und null Risiko von Leckagen.

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

`hasUserVisibleContent(chunk)` ist ein kleiner, eigenständiger Helfer, der zusammen mit dem Wrapper plaziert und für Tests exportiert wird:

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

### D3 — `request_setup_ms`-Berechnung: Eintrittszeitpunkt vs. Start des erfolgreichen Versuchs

`request_setup_ms` misst die Wanduhrzeit vom Eintritt in `generateContentStream`/`generateContent` bis zum **Start des erfolgreichen Versuchs** — inklusive aller fehlgeschlagenen Wiederholungen, Backoff-Schlafzeiten und jeglicher Vor-Wiederholungs-Vorbereitungsarbeit.

```ts
request_setup_ms = attemptStart_of_successful_attempt - requestEntryTime;
```

Wenn `attempt === 1` und keine Wiederholungen stattfanden, ist `request_setup_ms` klein (nur SDK-Setup). Wenn Wiederholungen stattfanden, erfasst es den gesamten Overhead des Wiederholungsbudgets.

**Platzierung auf dem OTel-Span (Abweichung von claude-code, das es nur auf Perfetto setzt)**: Begründung auf drei Ebenen:

1. **Kein Perfetto** — qwen-code hat keine Out-of-Band-Visualisierungsschicht. OTel-Attribute sind der einzige Kanal.
2. **Single-Trace-Debugging** — Der Operator sieht `duration_ms=12000, request_setup_ms=11500, ttft_ms=200, sampling_ms=300` → diagnostiziert sofort "Wiederholungen haben 11,5 s gefressen, das Modell selbst war schnell." Die Berechnung von `request_setup_ms` aus anderen Feldern erfordert auch die Offenlegung von `sampling_ms`, was wir ohnehin tun (D6).
3. **Vernachlässigbare Kosten** — 1 INT64-Attribut. Gleiche Größenordnung wie die bestehenden `input_tokens`-, `output_tokens`-Attribute. Die Backend-Ingest-Kosten sind nicht wesentlich.
### D4 — Wiederholungstelemetrie: `onRetry`-Callback-Option auf `retryWithBackoff` + `ApiRetryEvent` + AsyncLocalStorage-Propagation

> **Phase-4b-Update (Post-Design-Discovery)**: Dieser Abschnitt wurde ursprünglich unter der Annahme geschrieben, dass claude-code ein „ein LLM-Span besitzt den gesamten Wiederholungsdurchlauf“-Muster verwendet. Während der Implementierung von Phase 4b haben wir festgestellt, dass die 4 `retryWithBackoff`-Aufrufstellen von qwen-code (`client.ts:2109`, `baseLlmClient.ts:235,333`, `geminiChat.ts:2035` — Zeilennummern zum Zeitpunkt des Merges) alle `apiCall = () => contentGenerator.generateContent(...)` umschließen. Die Wiederholungsschicht liegt **oberhalb** von LoggingContentGenerator. Jeder Wiederholungsversuch ruft `apiCall()` frisch auf → neuer `qwen-code.llm_request`-Span. Es gibt keinen einzelnen geteilten Span über alle Versuche hinweg. Ein Akkumulator innerhalb von `LoggingContentGenerator` würde nicht funktionieren.
>
> **Lösung**: Wiederholungsstatus über `AsyncLocalStorage` propagieren (`retryContext` in `packages/core/src/utils/retryContext.ts`). `retryWithBackoff` umschließt jedes `await fn()` mit `retryContext.run({ attempt, requestSetupMs, retryTotalDelayMs }, fn)`. `LoggingContentGenerator` liest das ALS im synchronen Präludium und leitet die Werte an `endLLMRequestSpan` weiter. Dies bietet tatsächlich **reichhaltigere** Beobachtbarkeit als der ursprüngliche Plan – jeder versuchsspezifische Span hat seine eigene `duration_ms` / `ttft_ms` / Fehlerdetails und weiß über die versuchsspezifischen Attribute `attempt` / `requestSetupMs` / `retryTotalDelayMs`, wo er sich im Wiederholungsbudget befindet.
>
> Der ALS-Ansatz passt zu bestehenden Mustern in der Codebasis (`promptIdContext`, `subagentNameContext`, `agent-context`) – minimale neue Oberfläche, gut verstandene Semantik. Der Plan-Mode-Review-Prozess hat diese Überarbeitung in 3 Review-Durchläufen erfasst, wobei 22 Probleme gefunden und alle vor dem Merge behoben wurden.

`retryWithBackoff` ruft derzeit `logRetryAttempt` auf (`retry.ts:343`), das nur in `debugLogger.warn` schreibt. Wir erweitern das `RetryOptions`-Interface um einen opt-in Callback:

```ts
// utils/retry.ts
interface RetryOptions<T> {
  // ... bestehende Felder ...
  /**
   * Optional. Wird einmal pro fehlgeschlagenem Versuch aufgerufen, vor dem Backoff-Sleep.
   * Erhält die Versuchsnummer (1-basiert), den Fehler und die Verzögerung vor dem
   * nächsten Versuch. Verwende dies, um Telemetrie-Ereignisse für LLM-Aufrufstellen auszugeben;
   * für Nicht-LLM-Aufrufer (z.B. channels/weixin) undefiniert lassen, damit sie
   * in LLM-spezifischen Telemetriekanälen still bleiben.
   */
  onRetry?: (info: RetryAttemptInfo) => void;
}

interface RetryAttemptInfo {
  attempt: number; // 1-basiert, entspricht der debugLogger-Ausgabe
  error: unknown;
  errorStatus?: number;
  delayMs: number; // Backoff-Verzögerung vor dem nächsten Versuch
}
```

Die 4 LLM-Aufrufstellen (`client.ts:1540`, `baseLlmClient.ts:193,282`, `geminiChat.ts:1039`) registrieren einen Callback, der ein neues `ApiRetryEvent` ausgibt:

```ts
// types.ts — neue Ereignisklasse, Schwester von ContentRetryEvent
export class ApiRetryEvent implements BaseTelemetryEvent {
  'event.name': typeof EVENT_API_RETRY;
  'event.timestamp': string;
  model: string;
  prompt_id?: string;
  attempt_number: number; // 1-basiert
  error_type: string;
  error_message: string; // auf 256 Zeichen gekürzt
  status_code?: number;
  retry_delay_ms: number;
  // ... duration_ms auf retry_delay_ms gesetzt, damit LogToSpanProcessor
  // einen Bridgespan mit aussagekräftiger Breite erzeugt
  duration_ms: number;
}
```

**Warum eine neue Ereignisklasse, nicht `ContentRetryEvent` erweitern**:

- `ContentRetryEvent` hat 2 nachgelagerte Konsumenten (qwen-logger, log-record-Export). Eine Änderung seines Payloads riskiert, diese zu brechen.
- Die Bezeichnung „Inhaltswiederholung“ bezieht sich semantisch auf Inhaltswiederherstellungsversuche (ungültiger Stream, Schema-Reparatur) – eine Erweiterung um Ratenbegrenzungsversuche würde das Schema unklar machen.
- Neues Ereignis ist additiv; keine Konsumentenüberraschung.

**Warum Callback nicht IN `retry.ts` einbetten**: `retry.ts` wird auch von `channels/weixin/src/api.ts` aufgerufen (Nicht-LLM-API-Wiederholungen für Microsoft-Messaging). Eine feste Kopplung von LLM-Telemetrie innerhalb von `retry.ts` würde `ApiRetryEvent` für Nicht-LLM-Wiederholungen ausgeben. Der `onRetry`-Callback ist pro Aufrufer opt-in – LLM-Aufrufer melden sich an, der Weixin-Aufrufer nicht.

**Koexistenz von ContentRetryEvent**: ContentRetryEvent bleibt unverändert für Inhaltswiederherstellungsversuche innerhalb von `geminiChat.ts:806,830`. ApiRetryEvent deckt die Ratenbegrenzungs- / 5xx-Wiederholungen von `retryWithBackoff` ab. Die beiden Ereignisse feuern auf unterschiedlichen Ebenen und duplizieren sich nie. Das bestehende Log-Bridge-Verhalten für beide Ereignisse bleibt über `LogToSpanProcessor` erhalten – beide Ereignisse werden automatisch unter dem aktiven LLM-Span verschachtelt (Phase-1-Verdrahtung stellt sicher, dass der LLM-Span während der Wiederholungen aktiv ist).

**Persistenter Wiederholungsmodus (`QWEN_CODE_UNATTENDED_RETRY`)**: Eine einzelne 429-Schleifenanfrage kann 50+ Ereignisse ausgeben. Die Begrenzung der Emissionsrate in Phase 4 ist nicht vorgesehen – falls sich die Produktionsvolumina als unerträglich erweisen, in einem Folge-PR eine Obergrenze pro Span mit einem Zusammenfassungsereignis hinzufügen. Die aggregierten `attempt`- und `retry_total_delay_ms`-Werte auf dem übergeordneten LLM-Span (D5) bleiben unabhängig von einer Ereignisbegrenzung korrekt.

### D5 — Aggregation des übergeordneten LLM-Spans: nur skalare Attribute (keine Map-typisierten Attribute)

OTel-Span-Attribute sind Skalare (`string | number | boolean | Array davon`). Map-typierte Attribute (wie `retry_count_by_status: {429:2, 503:1}`) erfordern JSON-Serialisierung und sind umständlich abzufragen. Überspringe sie.
| Attribut                    | Typ    | Semantik                                                                                                                            |
| --------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `attempt`                   | int    | 1-basierter monotoner Zähler aus `retryContext.attempt` (Iteration dieses Versuchs). Immer gesetzt (Standard 1 ohne Retry-Kontext)  |
| `retry_total_delay_ms`      | int    | Kumulierte Backoff-Verzögerung VOR diesem Versuch. Undefiniert bei Direktaufrufen; 0 für Versuch 1; > 0 für spätere Wiederholungen   |
| `ttft_ms`                   | int    | TTFT pro D1; undefiniert bei Nicht-Streaming oder bei vor dem ersten Chunk abgebrochenen Anfragen                                  |
| `request_setup_ms`          | int    | Pro D3                                                                                                                              |
| `sampling_ms`               | int    | Pro D6                                                                                                                              |
| `output_tokens_per_second`  | double | Abgeleitet; `output_tokens / (sampling_ms / 1000)`; undefiniert wenn `sampling_ms === 0`                                            |

Die Verteilung der Statuscodes pro Versuch (z. B. „2 der 3 Versuche waren 429“) kann aus den Log-Bridge-Spans von `ApiRetryEvent`-Datensätzen abgefragt werden. Es ist nicht nötig, dies als ein abgeflachtes Attribut auf dem Elternelement zu duplizieren.

**Warum `sampling_ms` und `output_tokens_per_second` auf dem Span**: Ableitbar, aber in Backend-Abfragen beim Summieren über viele Spans umständlich zu berechnen. Gleiches Kosten-Nutzen-Verhältnis wie `request_setup_ms` (D3).

### D6 — `recordApiRequestBreakdown()` für 3 von 4 Phasen aktivieren

Rufe in `endLLMRequestSpan` (oder im Wrapper, der sie aufruft) nach Berechnung von TTFT/Setup/Sampling Folgendes auf:

```ts
recordApiRequestBreakdown(config, model, [
  { phase: ApiRequestPhase.REQUEST_PREPARATION, durationMs: requestSetupMs },
  { phase: ApiRequestPhase.NETWORK_LATENCY, durationMs: ttftMs }, // ttftMs = Netzwerk + Token-Erzeugung des ersten Tokens
  { phase: ApiRequestPhase.RESPONSE_PROCESSING, durationMs: samplingMs },
]);
```

**Warum `TOKEN_PROCESSING` auslassen**: qwen-code verarbeitet Stream-Chunks inline (die Konsolidierung erfolgt im Wrapper in `loggingContentGenerator.ts:644`); die Phase nach dem Stream-Abschluss dauert <10 ms und ist architektonisch nicht eigenständig. Das Füllen mit einem bedeutungslosen Wert verunreinigt das Histogramm. Das Weglassen des Enum-Werts ist sicher – `apiRequestBreakdownHistogram.record(value, {model, phase})` ist nur ein Histogramm mit `phase` als Label; fehlende Labels sind in Abfragen einfach nicht vorhanden.

**Warum `NETWORK_LATENCY` nicht umdefinieren**: der Name in der Spezifikation ist leicht irreführend (es ist Netzwerk + erste Token-Erzeugung, nicht reine Netzwerklatenz), aber:

- Das Enum ist Teil von `metrics.ts:330-334`, das aus `index.ts:117` exportiert und getestet wird.
- Backend-Dashboards könnten bereits auf diese Phasennamen verweisen.
- Das Umbenennen oder Hinzufügen einer neuen Phase wäre ein Breaking Change für eine kaum merkliche Genauigkeitsverbesserung.

Dokumentiere die Semantik im Design-Dokument; lasse das Enum unverändert.

**Warum auf dem Span-Pfad, nicht parallel**: dies hält `recordApiRequestBreakdown` mit den Span-Attributschreibvorgängen zusammen – ein einzelner geschützter Auslösepunkt (siehe D7 Idempotenz), eine einzige Ordnungsinvarianz.

### D7 — `endLLMRequestSpan`-Idempotenz: Metrikerfassung durch vorhandenen Doppelende-Schutz geschützt

Phase 1.5 (#4302) hat festgestellt, dass `endLLMRequestSpan` zweimal aufgerufen werden kann (Abbruchpfad + Fehlerpfad kollidieren). Der vorhandene Schutz in `session-tracing.ts:~470` (`if (!activeSpans.has(...)) return;`) verhindert doppeltes `span.end()`. Die Metrikerfassung aus Phase 4 (D6) **muss innerhalb desselben geschützten Blocks liegen**, vor `span.end()`:

```ts
// session-tracing.ts — endLLMRequestSpan
const llmCtx = activeSpans.get(spanRef);
if (!llmCtx) return;            // bereits beendet — Doppelende-Schutz
activeSpans.delete(spanRef);    // das Ende beanspruchen

// ... Dauer berechnen, Attribute setzen ...
if (metadata) {
  recordApiRequestBreakdown(config, llmCtx.attributes.model, [...]);   // NEU — geschützt
  recordTokenUsageMetrics(...); // vorhanden
}

span.end();
```

Dies garantiert, dass die Metrik genau **einmal** pro LLM-Anfrage erfasst wird – entsprechend dem Span-Lebenszyklus.

**Warum nicht in `loggingContentGenerator` erfassen**: dieser sieht den Abbruchpfad nicht. Die Erfassung auf der Span-Lebenszyklusebene stellt sicher, dass jede LLM-Anfrage, die einen Span öffnet, genau ein Breakdown-Beispiel erzeugt – unabhängig von Erfolg/Fehler/Abbruch.

### D8 — Dual-Emission der GenAI-Semantikkonventionen (privater Name maßgeblich)

Jedes Phase-4-Attribut, das einem OTel GenAI-Semconv-Attribut entspricht, wird zweimal auf dem Span geschrieben:

| qwen-code privat (maßgeblich)              | GenAI semconv (Kompatibilitätsebene)             | Einheitenumrechnung | Spezifikationsstatus |
| ------------------------------------------ | ------------------------------------------------ | ------------------- | -------------------- |
| `ttft_ms` (ms, int)                        | `gen_ai.server.time_to_first_token` (s, double)  | `ttftMs / 1000`     | Experimentell        |
| `input_tokens` (int)                       | `gen_ai.usage.input_tokens` (int)                | identisch           | Stabil               |
| `output_tokens` (int)                      | `gen_ai.usage.output_tokens` (int)               | identisch           | Stabil               |
| `cached_input_tokens` (int) (falls vorhanden) | `gen_ai.usage.cached_tokens` (int)              | identisch           | Experimentell        |
| `qwen-code.model` (string)                 | `gen_ai.request.model` (string)                  | identisch           | Stabil               |
**Vorhandene Token-Attributnamen** im LLM-Span (gesetzt in `endLLMRequestSpan` vor Phase 4): qwen-code verwendet bereits nackte `input_tokens` und `output_tokens`. Phase 4 fügt die `gen_ai.usage.*`-Geschwister hinzu, um dem Muster von #4410 zu entsprechen. Die nackten Namen bleiben bestehen; **nicht umbenennen**.

Felder ohne GenAI-semconv-Äquivalent – `request_setup_ms`, `sampling_ms`, `retry_total_delay_ms`, `attempt`, `output_tokens_per_second` – werden nur unter dem qwen-code-Namensraum ausgegeben.

**Warum „private als autoritativ, semconv als Kompatibilität"**:

- Interne Dashboards, SLOs, debugLogger-Ausgabe, qwen-logger-RUM, ARMS-Abfragen – alle referenzieren `ttft_ms` usw. Diese als kanonisch zu behandeln vermeidet eine Flag-Day-Migration.
- Die experimentellen GenAI-semconv könnten `gen_ai.server.time_to_first_token` umbenennen, bevor sie Stabil erreicht. Wenn/dann dies geschieht, aktualisieren wir die semconv-Ausgabe; die qwen-code-Namen bewegen sich nicht.
- Zukünftige spezifikationsbewusste Backends (Datadog AI-Views, Honeycomb AI, ARMS-GenAI-Dashboards) übernehmen die `gen_ai.*`-Attribute automatisch ohne unser Zutun.

**Warum Dual-Emit-Einheitenumrechnung** (ms ↔ Sekunden): GenAI semconv hat Sekunden-als-Double für Latenz gewählt; qwen-code hat ms-als-int gewählt (entspricht `duration_ms`, das bereits im Span vorhanden ist). Beide Darstellungen haben Wert; die Umrechnung ist günstig.

## Hilfs-API (additiv zu `session-tracing.ts`)

```ts
// session-tracing.ts – LLMRequestMetadata-Interface erweitert (additiv)
export interface LLMRequestMetadata {
  // ... vorhandene Felder: inputTokens, outputTokens, cachedInputTokens, success, error, ...

  /** Zeit vom Start eines erfolgreichen Versuchs bis zum ersten sichtbaren Inhaltsblock (ms). Undefiniert für Nicht-Streaming oder abgebrochene vor dem ersten Block. */
  ttftMs?: number;

  /** Zeit vom Eintritt in generateContent bis zum Start des erfolgreichen Versuchs (ms). Enthält alle fehlgeschlagenen Wiederholungen + Backoff. */
  requestSetupMs?: number;

  /** Endgültige Versuchsnummer (1-basiert). 1 = keine Wiederholungen. */
  attempt?: number;

  /** Summe aller Backoff-Verzögerungen vor dem erfolgreichen Versuch (ms). */
  retryTotalDelayMs?: number;
}

// Keine neuen exportierten Hilfsfunktionen – Phase 4 verwendet weiterhin startLLMRequestSpan / endLLMRequestSpan mit erweiterten Metadaten.
```

```ts
// types.ts – neue Ereignisklasse
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
  duration_ms: number;  // = retry_delay_ms, treibt LogToSpanProcessor-Bridge-Span-Breite

  constructor(opts: { model: string; promptId?: string; attemptNumber: number; error: unknown; statusCode?: number; retryDelayMs: number }) { ... }
}

// constants.ts
export const EVENT_API_RETRY = 'qwen-code.api_retry';

// loggers.ts
export function logApiRetry(config: Config, event: ApiRetryEvent): void { ... }
```

```ts
// utils/retry.ts – RetryOptions-Erweiterung
interface RetryOptions<T> {
  // ... vorhandene ...
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
logRetryAttempt(attempt, error, errorStatus); // bestehender debugLogger-Aufruf unverändert
```

## Lebenszyklus-Verdrahtung

### Streaming-Pfad (der häufigste Fall)

```ts
// loggingContentGenerator.ts:283 – generateContentStream
async generateContentStream(req, userPromptId): Promise<AsyncGenerator<GenerateContentResponse>> {
  const requestEntryTime = Date.now();
  let attemptStart = requestEntryTime;
  const attemptStartTimes: number[] = [attemptStart];
  let retryTotalDelayMs = 0;
  let finalAttempt = 1;

  // Vorhandenes startLLMRequestSpan verwenden (Phase 1)
  // onRetry-Callback an die verwendete Wiederholungsschicht übergeben:
  const onRetry: RetryAttemptInfo & { invoke: ... } = (info) => {
    finalAttempt = info.attempt + 1;        // wir starten gleich Versuch N+1
    retryTotalDelayMs += info.delayMs;
    attemptStart = Date.now() + info.delayMs; // ungefähr; tatsächlicher Reset am Anfang des nächsten Versuchs
    attemptStartTimes.push(attemptStart);
    // ApiRetryEvent ausgeben
    logApiRetry(this.config, new ApiRetryEvent({
      model: req.model,
      promptId: userPromptId,
      attemptNumber: info.attempt,
      error: info.error,
      statusCode: info.errorStatus,
      retryDelayMs: info.delayMs,
    }));
  };

  // Stream-Wrapper erkennt ersten sichtbaren Block:
  return this.processStreamGenerator(stream, ..., {
    onFirstUserVisibleChunk: (now) => {
      ttftMs = now - attemptStart;
    },
  });
}
```

Am Span-Ende (bereits im Phase-1-Ablauf von `endLLMRequestSpan`) die neuen Felder in `LLMRequestMetadata` einfügen:

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
### Non-streaming-Pfad

`generateContent` (`loggingContentGenerator.ts:212`) erzeugt keine Streaming-Chunks. TTFT ist `undefined`; `request_setup_ms` ist weiterhin aussagekräftig (erfasst Wiederholungs-Overhead). Die Breakdown-Metrik erfasst 2 Phasen (REQUEST_PREPARATION + RESPONSE_PROCESSING, wobei `RESPONSE_PROCESSING = duration_ms - request_setup_ms`), nicht 3.

### Integration der Wiederholungsschicht (4 Stellen)

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
    // speist auch zurück in den lokalen Retry-Akkumulator von LoggingContentGenerator
    // (wenn im Gültigkeitsbereich – für Aufrufer, die nicht über LoggingContentGenerator gehen,
    // erhält der LLM-Span trotzdem `attempt` und `retry_total_delay_ms` über den
    // Metadaten-Pfad, da endLLMRequestSpan auf der LLM-Ebene aufgerufen wird)
  },
});
```

Der Nicht-LLM-Aufrufer (`channels/weixin/src/api.ts`) **registriert kein `onRetry`** – für dessen Wiederholungen wird kein `ApiRetryEvent` ausgegeben, was dem heutigen Verhalten entspricht.

## Gleichzeitigkeitssicherheit – die zentrale Garantie

Die `LoggingContentGenerator`-Instanz wird gemeinsam genutzt (eine pro `ContentGenerator`, `contentGenerator.ts:377`). Drei gleichzeitige `generateContentStream`-Aufrufe (z. B. 3 Sub-Agenten, die über `coreToolScheduler.runConcurrently` ausgesendet werden) führen drei unabhängige Closures von `generateContentStream` aus:

```
call_A: attemptStart_A, ttftMs_A, ... (closure)
call_B: attemptStart_B, ttftMs_B, ... (closure)
call_C: attemptStart_C, ttftMs_C, ... (closure)
```

Pro-Aufruf-Lokale überschneiden sich nie. Stream-Chunks werden gegen das lokale `attemptStart` jedes Aufrufs erkannt. Span-Attribute werden im eigenen `endLLMRequestSpan` jedes Aufrufs gesetzt.

`AsyncLocalStorageContextManager` (registriert von NodeSDK in `sdk.ts:273`) stellt bereits sicher, dass der aktive OTel-Kontext – und damit der übergeordnete Span, der an `startLLMRequestSpan` übergeben wird – pro Fiber korrekt ist.

## Zu ändernde Dateien

| Datei                                                                             | Änderung                                                                                                                                                                                                                                                           | LOC geschätzt |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- |
| `packages/core/src/telemetry/constants.ts`                                       | Konstante `EVENT_API_RETRY` hinzufügen                                                                                                                                                                                                                             | +2            |
| `packages/core/src/telemetry/types.ts`                                           | Klasse `ApiRetryEvent` + Union-Member hinzufügen                                                                                                                                                                                                                   | +40           |
| `packages/core/src/telemetry/loggers.ts`                                         | Funktion `logApiRetry()` hinzufügen                                                                                                                                                                                                                                | +20           |
| `packages/core/src/telemetry/qwen-logger/qwen-logger.ts`                         | Methode `logApiRetryEvent()` für RUM-Downstream-Konsistenz hinzufügen                                                                                                                                                                                              | +20           |
| `packages/core/src/telemetry/session-tracing.ts`                                 | `LLMRequestMetadata` erweitern (ttftMs, requestSetupMs, attempt, retryTotalDelayMs); `endLLMRequestSpan` erweitern, um neue Attribute + Breakdown-Metrik + Dual-Emit gen_ai.* zu setzen                                                                               | +60           |
| `packages/core/src/telemetry/metrics.ts`                                         | Aufrufstelle `recordApiRequestBreakdown` innerhalb von `endLLMRequestSpan` verdrahten (keine Änderung am vorhandenen Recorder)                                                                                                                                     | 0             |
| `packages/core/src/utils/retry.ts`                                               | `onRetry?: (info: RetryAttemptInfo) => void` zu RetryOptions hinzufügen; `RetryAttemptInfo` exportieren; Callback in der vorhandenen logRetryAttempt-Stelle aufrufen                                                                                               | +25           |
| `packages/core/src/core/loggingContentGenerator/loggingContentGenerator.ts`      | TTFT-Erfassung: methodenlokale Akkumulatoren + Helper `hasUserVisibleContent` + Erst-Chunk-Erkennung im Stream-Wrapper; neue Metadaten an `endLLMRequestSpan` übergeben                                                                                             | +80           |
| `packages/core/src/core/client.ts`                                               | `onRetry`-Callback an der `retryWithBackoff`-Aufrufstelle verdrahten (`client.ts:1540`)                                                                                                                                                                            | +15           |
| `packages/core/src/core/baseLlmClient.ts`                                        | `onRetry`-Callback an 2 `retryWithBackoff`-Aufrufstellen verdrahten                                                                                                                                                                                                | +25           |
| `packages/core/src/core/geminiChat.ts`                                           | `onRetry`-Callback an der `retryWithBackoff`-Aufrufstelle verdrahten (`geminiChat.ts:1039`)                                                                                                                                                                        | +15           |
| `packages/core/src/telemetry/session-tracing.test.ts`                            | `endLLMRequestSpan` setzt ttft_ms / request_setup_ms / attempt / retry_total_delay_ms / sampling_ms / output_tokens_per_second + gen_ai Dual-Emit + Breakdown-Metrik (jede Phase) + idempotenter Abschluss                                                          | +120          |
| `packages/core/src/core/loggingContentGenerator/loggingContentGenerator.test.ts` | `hasUserVisibleContent` (text / functionCall / inlineData / executableCode / thought / role-only / usage-only); gleichzeitige Aufrufe kontaminieren sich nicht gegenseitig; TTFT undefined, wenn vor erstem Chunk abgebrochen; TTFT undefined bei Nicht-Streaming | +100          |
| `packages/core/src/utils/retry.test.ts`                                          | `onRetry` wird pro fehlgeschlagenem Versuch mit korrektem `attempt`, `delayMs`, `error`, `errorStatus` aufgerufen; Fehlen von `onRetry` ist still (keine Telemetrie ausgegeben)                                                                                    | +50           |
| `packages/core/src/telemetry/loggers.test.ts`                                    | `logApiRetry` gibt LogRecord mit erwartetem Payload aus; leitet über LogToSpanProcessor an verschachtelten Span unter aktivem LLM-Span weiter                                                                                                                      | +40           |
Insgesamt: 14 Dateien, ~610 LOC. Größer als Phase 2 (#4321) aber vergleichbar mit Phase 3 (#4410) und gerechtfertigt durch die Breite der Integration (4 Retry-Stellen + Telemetrie-Infrastruktur + Streaming-Wrapper).

Falls das Review die Größe beanstandet: Aufteilung in **Phase 4a + 4b + 4c**:

- **4a** (~200 LOC): TTFT-Erfassung + erweitertes `LLMRequestMetadata` + Dual-Emit. In sich geschlossener Wert (TTFT-Sichtbarkeit ab Tag 1).
- **4b** (~250 LOC): `onRetry`-Callback + `ApiRetryEvent` + Verdrahtung der 4 Aufrufer. **Eigenständig ein Bugfix** für die Telemetrie-Lücke von `retryWithBackoff`.
- **4c** (~160 LOC): `recordApiRequestBreakdown`-Aktivierung + Attribute für die übergeordnete Span-Aggregation (`attempt`, `retry_total_delay_ms`, `sampling_ms`, `output_tokens_per_second`). Hängt von 4a + 4b ab.

## Teststrategie

| Test                                                                                                                         | Was wird nachgewiesen                         |
| ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `hasUserVisibleContent` gibt true zurück für text/functionCall/inlineData/executableCode/thought                             | D1-Semantik über Part-Typen hinweg            |
| `hasUserVisibleContent` gibt false zurück für reine Role- und Usage-Chunks                                                  | D1-Negativfälle                               |
| Streaming: TTFT gemessen ab Start des Versuchs bis zum ersten benutzersichtbaren Chunk                                      | End-to-End-TTFT-Erkennung                     |
| Streaming: TTFT undefiniert, wenn der Stream vor dem ersten benutzersichtbaren Chunk abgebrochen wird                       | Randfall                                      |
| Streaming: TTFT berechnet ab Start des letzten Versuchs (nicht des ersten)                                                  | D3 – TTFT-Reset bei Wiederholung              |
| Nicht-Streaming: TTFT bleibt undefiniert                                                                                    | S3-Entscheidung                               |
| Gleichzeitige `generateContentStream`-Aufrufe kontaminieren TTFT nicht gegenseitig                                          | D2 – methodenlokale Garantie                  |
| `endLLMRequestSpan` setzt alle Phase-4-Attribute (ttft_ms, request_setup_ms, sampling_ms, attempt, retry_total_delay_ms, output_tokens_per_second) | Attributpräsenz                               |
| `endLLMRequestSpan` sendet Dual-Emit für gen_ai.server.time_to_first_token + gen_ai.usage.* + gen_ai.request.model          | D8 Dual-Emit                                  |
| `endLLMRequestSpan` zeichnet Breakdown-Metrik mit 3 Phasen für Streaming, 2 Phasen für Nicht-Streaming auf                  | D6                                            |
| `endLLMRequestSpan` zweimal aufgerufen: Metrik genau einmal aufgezeichnet, Attribute nicht zurückgesetzt                    | D7 Idempotenz                                 |
| `retryWithBackoff` mit `onRetry`: Callback wird pro fehlgeschlagenem Versuch mit korrekten Argumenten aufgerufen            | D4 Callback-Vertrag                           |
| `retryWithBackoff` ohne `onRetry`: keine Telemetrie ausgegeben (stumm für Nicht-LLM-Aufrufer)                               | P2 – Bereichsschutz für Channels/Weixin       |
| Wiederholungs-Stellen in `client.ts` / `baseLlmClient.ts` / `geminiChat.ts` geben bei Wiederholung `ApiRetryEvent` aus      | Integration von D4 an 4 Stellen               |
| `ApiRetryEvent`-LogRecord wird über LogToSpanProcessor zu einer Child-Span unter der aktiven LLM-Span verbunden             | Korrektheit des Trace-Baums                   |
| LLM-Span-Feld `attempt` gibt unter Wiederholungen korrekt die endgültige Versuchsnummer wieder                             | D5 Aggregation                                |
| LLM-Span-Feld `retry_total_delay_ms` summiert korrekt die onRetry-Verzögerungen                                             | D5 Aggregation                                |
| `output_tokens_per_second` undefiniert, wenn `sampling_ms === 0` (kein Streaming)                                           | Vermeidung Division durch Null                |

## Randfälle

| Fall                                                                          | Behandlung                                                                                                                                                                                                               |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Stream wird abgebrochen, bevor ein Chunk ankommt                              | `ttftMs = undefined`, `sampling_ms = undefined`, `output_tokens_per_second = undefined`. `attempt`, `request_setup_ms` weiterhin gesetzt. `success = false`                                                               |
| Stream wird nach dem ersten Chunk abgebrochen                                 | `ttftMs` gesetzt; `sampling_ms = duration_ms - ttftMs - request_setup_ms`; spiegelt teilweise Antwortzeit wider. `success = false`                                                                                       |
| Wiederholung erfolgreich beim ersten Versuch (keine Wiederholungen)           | `attempt = 1`, `retry_total_delay_ms = 0`, kein `ApiRetryEvent` ausgegeben, Breakdown-Metrik zeichnet `request_setup_ms` nahe 0 auf                                                                                      |
| Hartnäckiger Wiederholungsmodus: 50+ Versuche                                 | 50+ `ApiRetryEvent`-Datensätze ausgegeben (Deckelung auf später verschoben); LLM-Span `attempt = 51`, `retry_total_delay_ms = Summe aller Verzögerungen`. Operator sieht aggregierte Ansicht auf Span; volles Detail pro Versuch in Log-Bridge-Spans |
| Nicht-LLM-Aufrufer von `retryWithBackoff` (channels/weixin)                   | Kein `onRetry` registriert; nur vorhandener `debugLogger.warn` wird ausgelöst. Kein `ApiRetryEvent`; keine Breakdown-Metrik (Aufrufer ist keine LLM-Stelle)                                                              |
| `endLLMRequestSpan` zweimal aufgerufen (Abbruch + Fehler-Race)                | Phase-1.5-Sperre bei `activeSpans.delete()` kehrt beim zweiten Aufruf früh zurück; `recordApiRequestBreakdown` befindet sich innerhalb der Sperre, genau einmal aufgezeichnet                                             |
| Anthropic-`message_start`-Chunk kommt vor dem Inhalt an                       | `hasUserVisibleContent` gibt dafür false zurück (keine Parts mit text/functionCall/etc.); TTFT wird erst beim darauffolgenden `content_block_delta`-Chunk ausgelöst                                                      |
| OpenAI erster Chunk mit leerem `delta.content` aber nur `role`                | `hasUserVisibleContent` gibt false zurück; TTFT wird erst beim ersten Chunk mit nicht-leerem delta ausgelöst                                                                                                             |
| Nur Tool-Call-Antwort (kein Text)                                             | Erster Chunk mit `functionCall`-Part löst TTFT aus; `output_tokens_per_second` gegen die Tool-Call-Tokenanzahl berechnet                                                                                                 |
| Gleichzeitige Sub-Agenten (3 laufende Aufrufe)                                | Jeder Aufruf hat seine eigene Closure mit `attemptStart`, `ttftMs`, `attemptStartTimes`. Pro-Aufruf-Span erhält eigene Metadaten bei `endLLMRequestSpan`. Keine Überlappung (D2)                                          |
| SDK-interne Wiederholungen innerhalb von openai-sdk (`maxRetries=3`)          | Für die qwen-code-Telemetrie unsichtbar – finden vollständig innerhalb des SDK statt, bevor retryWithBackoff die Anfrage sieht. `attempt` spiegelt nur retryWithBackoff-Versuche wider. Nicht im Umfang (siehe Außerhalb des Umfangs) |
| `gen_ai.server.time_to_first_token`-Spezifikation wird vor Erreichen von Stable umbenannt | Einzelfile-Update: `session-tracing.ts:endLLMRequestSpan`. Das qwen-code-native `ttft_ms` bleibt maßgeblich – keine Auswirkungen nachgelagerter Systeme                                                                  |
| Sub-Agenten-LLM-Anfrage                                                       | Übergeordnete Span ist die Sub-Agenten-Span (Phase 3). Phase-4-Felder schachteln sich korrekt. Gruppierungen nach `qwen-code.subagent.id` ergeben LLM-Performance pro Sub-Agent – Design-Doc-Zukunft, einfache Nachverfolgung |
| Reasoning-Modell mit langen Thought-Blöcken                                   | Erster `thought`-Part löst TTFT aus; `sampling_ms` umfasst sowohl die Denk- als auch die Antwortphase. Aufteilung in separate Metriken auf später verschoben                                                             |
## Rollback

Die Änderung ist auf OTel- und Metrikebene additiv – jedes neue Attribut ist optional, jedes neue Ereignis ist eine neue Klasse. Bestehende Dashboards, die nicht auf die neuen Felder filtern, funktionieren unverändert weiter.

Verhaltensbeeinflussende Änderungen:

- Neuer `ApiRetryEvent`-LogRecord wird erzeugt → Log-Volumen steigt proportional zur Wiederholungsrate (typischerweise <1% der Anfragen wiederholt). Mildern durch Sampling des LogRecords auf SDK-Ebene, falls nötig.
- Neue Breakdown-Metrik `qwen-code.api.request.breakdown` beginnt Zeitreihen zu erzeugen → leichter Prometheus-Kardinalitätsanstieg (`{model, phase}` – begrenzt).
- Abgeleitetes Attribut `output_tokens_per_second` kann auf Dashboards seltsam erscheinen, die "alle Attribute" filtern – dokumentieren.

Rollback-Pfad: Den einzelnen PR zurückrollen (oder jeden der 4a/4b/4c unabhängig). Alle neuen Felder verwenden defensive Defaults (undefined / 0) und ändern die Span-Struktur nicht.

## Reihenfolge

- **Nach Phase 3 (#4410, in Review)**: Keine feste Abhängigkeit. Phase-4-Attribute werden an `qwen-code.llm_request`-Spans angehängt, unabhängig davon, ob sie unter einem `qwen-code.subagent` (Phase 3) oder `qwen-code.interaction` (Phase 1) liegen. Empfehlung: Phase 3 zuerst landen lassen, damit die Aggregation pro Versuch unter Subagent-Subbäumen natürlich funktioniert.
- **Unabhängig von #4384** (`traceparent` + `X-Qwen-Code-Session-Id`-Ausgangsweiterleitung). Sie betreffen die HTTP-Ebene; Phase 4 betrifft die Stream/Retry/Metrik-Ebene.
- **Unabhängig vom `clearDetailedSpanState`-Chat-Kompression-Follow-up** (#4097 Follow-up). Anderer Bereich.

## Offene Fragen

1. **Semantik des `onRetry`-Callback-Aufrufs**: Wird er **vor** dem Backoff-Schlaf aufgerufen (aktueller Vorschlag) oder **danach** (wenn der nächste Versuch kurz vor dem Start steht)? Vorher ist einfacher – Callback hat sofort alle Informationen; nachher müsste die gerade abgeschlossene Verzögerung separat erfasst werden. Empfehlung: Vor dem Schlaf; im Callback-Vertrag dokumentieren.
2. **Timing pro Versuch auf dem LLM-Span**: Sollten wir ein Array `attempt_durations_ms: number[]` hinzufügen? OTel unterstützt Arrays aus primitiven Attributen. Nützlich für Diagnosen wie "welcher Versuch von N war langsam". Aufschieben, bis Produktionsdaten Bedarf zeigen – Log-Bridge-Spans enthalten bereits die äquivalenten Informationen.
3. **Obergrenze für Emission im persistenten Wiederholungsmodus**: Bei welchem Schwellwert `attempt > N` sollten wir mit dem Sampling beginnen? `N = 5` dann 1-in-10? `N = 10` dann nur Zusammenfassung? Aufschieben, bis Produktionsvolumendaten vorliegen.
4. **`TOKEN_PROCESSING`-Phase**: Enum-Wert ruhend lassen oder mit etwas verknüpfen (z.B. Konsolidierungszeit)? Aufschieben – auf einen echten Anwendungsfall warten.
5. **LLM-Zusammenfassungen auf Subagent-Ebene**: Triviales Follow-up, sobald Phase 4 gelandet ist – `ttft_ms`/`output_tokens`/`input_tokens` pro Subagent-Subbaum summieren. Nicht im Umfang von Phase 4, aber der Datenfluss ermöglicht es.
