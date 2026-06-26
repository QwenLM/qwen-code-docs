# Subagent-Trace-Tree-Design (P3 Phase 3)

> Issue #3731 — Phase 3 des hierarchischen Session-Tracings. Fügt einen `qwen-code.subagent`-Span hinzu, sodass Subagent-Aufrufe isolierte, abfragbare Trace-Strukturen erhalten, anstatt sich still unter dem übergeordneten `qwen-code.interaction`-Span zu vermischen.
>
> Baut auf Phase 1 (#4126), Phase 1.5 (#4302) und Phase 2 (#4321) auf.

## Problem

Heute läuft jeder `AgentTool.execute`-Aufruf innerhalb des übergeordneten `qwen-code.interaction`-Spans. Drei Pathologien:

1. **Gleichzeitige Subagents vermischen sich.** `coreToolScheduler.ts:728` markiert `AGENT` als nebenläufigkeitssicher – `Promise.all` führt bis zu 10 Subagents parallel aus. Ihre LLM-Request-/Tool-/Hook-Spans hängen alle am einzigen geteilten übergeordneten Interaction-Span, sodass Trace-Explorer nicht unterscheiden können, ob „dieser LLM-Request zu Subagent A gehört" oder „dieser zu Subagent B".
2. **Kein Span für die Subagent-Grenze selbst.** Es gibt einen `qwen-code.subagent_execution`-LogRecord (ausgegeben in `agent-headless.ts:268,329`), der über `LogToSpanProcessor` zu einem Span gleichen Namens überbrückt wird, aber es ist ein eigenständiger Marker, kein übergeordneter Span, der die LLM-/Tool-/Hook-Spans des Subagenten unter sich verschachtelt.
3. **Fork-/Hintergrund-Subagents treiben frei.** Fire-and-Forget-Pfade (`runInForkContext` / Hintergrund) überleben den übergeordneten `AgentTool.execute` und senden Spans über mehrere nachfolgende Benutzerinteraktionen hinweg. Der übergeordnete Tool-Span ist bereits beendet, wenn diese Spans erscheinen, daher hilft `context.active()` von OTel nicht – sie hängen sich an die Interaktion, die gerade zufällig aktiv war, oder an keine.

## Vorhandene Oberfläche (keine Änderung)

| Komponente                          | Ort                                                                                                                                                                                              | Warum wir sie nicht anfassen                                     |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| Erzeugungsort (vereinheitlicht)     | `packages/core/src/tools/agent/agent.ts:1147` `AgentTool.execute()`                                                                                                                              | Einziger Einstiegspunkt; idealer Haken für 3 Aufrufvarianten     |
| Drei Aufrufvarianten                | Vordergrund-benannt (`runFramed` at `:2154` — awaited), Fork (`void runInForkContext(runFramedFork)` at `:1991` — fire-and-forget), Hintergrund (`void framedBgBody()` at `:1934` — fire-and-forget) | Lebenszyklus unterscheidet sich — Span-Design deckt alle drei ab |
| Nebenläufigkeit                     | `coreToolScheduler.runConcurrently` (`Promise.all`, cap 10) — gesteuert durch `partitionToolCalls`, das AGENT als `concurrent: true` markiert                                                    | Der Grund, warum Isolation notwendig ist                         |
| `runInForkContext` ALS              | `packages/core/src/tools/agent/fork-subagent.ts:32` `forkExecutionStorage`                                                                                                                       | Nur rekursiver Fork-Schutz — gibt OTel-Kontext NICHT weiter      |
| Agent Identity ALS                  | `packages/core/src/agents/runtime/agent-context.ts:46` `runWithAgentContext(agentId, ...)`                                                                                                       | Trägt bereits `agentId`; wir erweitern es mit `depth`            |
| `SubagentExecutionEvent` LogRecord  | `agent-headless.ts:268,329` → `loggers.ts:773` → 3 Downstreams (LogToSpanProcessor-Span-Brücke + QwenLogger RUM + `recordSubagentExecutionMetrics`)                                             | LogRecord bleibt; Downstreams hängen davon ab                    |

## Nicht im Umfang (verschoben)

- **Token-Nutzungs-Aggregation pro Subagent** (`gen_ai.usage.*` summiert über alle LLM-Spans innerhalb eines Subagents). Gehört in Phase 4 (LLM-Request-Zerlegung).
- **Migration des `qwen-code.subagent_execution`-LogRecords auf den neuen Span als Span-Events.** RUM und Metriken sind eng an den LogRecord gekoppelt; auf ein Follow-up verschoben, das alle 3 Verbraucher gemeinsam neu verhandeln kann.
- **Auto-Kosten-Rollup.** Gleicher Grund – benötigt zuerst Token-Nutzung.
- **Entfernung des AGENT-Tool-Markers `concurrent: true`.** Nebenläufigkeit ist korrekt; wir instrumentieren sie, wir schränken sie nicht ein.

## Referenzen (Entscheidungsnachweise)

| Quelle                                                                                                               | Wichtigste Erkenntnis                                                                                                                                                                                                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [OTel Trace Spec — Links zwischen Spans](https://opentelemetry.io/docs/specs/otel/overview/#links-between-spans)      | Wörtlich: „Der neue verknüpfte Trace kann auch einen langlaufenden asynchronen Datenverarbeitungsvorgang darstellen, der von einer von vielen schnellen eingehenden Anfragen initiiert wurde." → Fork/Hintergrund sollten verknüpfte Root-Spans sein, keine Kinder.                                                              |
| [OTel GenAI Agent Spans](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-agent-spans/) (Status: Entwicklung) | Span-Name `invoke_agent {gen_ai.agent.name}`; erforderliche Attribute `gen_ai.operation.name`, `gen_ai.provider.name`; empfohlen: `gen_ai.agent.id`, `gen_ai.agent.name`, `gen_ai.conversation.id`.                                                                                                                            |
| LangSmith – 25.000 Runs / Trace-Limit                                                                                | Lange Agent-Sessions erzwingen irgendwann eine Trace-Aufteilung; begünstigt hybrides traceId-Design.                                                                                                                                                                                                                           |
| [Sentry – Distributed Tracing](https://docs.sentry.io/concepts/key-terms/tracing/distributed-tracing/)               | „Untergeordnete Transaktionen können die Transaktionen überleben, die ihre übergeordneten Spans enthalten" – Kind-mit-überlebender-Lebensdauer wird unterstützt.                                                                                                                                                                 |
| claude-code (Anthropic)                                                                                              | Hat Subagent-Hierarchie nur in lokaler Perfetto-JSON-Datei; OTel-Export ist flach. Kein portabler Code.                                                                                                                                                                                                                        |
| opencode (sst/opencode)                                                                                              | Verwendet `@effect/opentelemetry`-Auto-Instrumentierung; explizites `context.with(trace.setSpan(active, span), fn)` für `withRunSpan`. **Bestätigt das context.with-Isolationsmuster.** Ihre Warnung zur manuellen `AsyncLocalStorageContextManager`-Registrierung trifft nicht zu – qwen-code's `NodeSDK` registriert es automatisch. |

## Design – sechs Entscheidungen, jede begründet

### D1 – Span-Lebenszyklus: Aufrufer öffnet, Aufgerufener läuft innerhalb von `context.with(span, fn)`

`agent.ts` (Aufrufer) erstellt den Span. Der Rumpf – ob awaited (`runFramed`) oder fire-and-forget (`runInForkContext` / Hintergrund) – läuft innerhalb von `runInSubagentSpanContext(span, fn)`, welches `otelContext.with(trace.setSpan(active, span), fn)` aufruft.

**Wo genau in `AgentTool.execute` wird der Span geöffnet?** Öffne ihn **direkt VOR der aufrufvariante-spezifischen Einrichtung** (`createAgentHeadless` / `createForkSubagent` etc.) – sodass die Einrichtungszeit (Config-Aufbau, ToolRegistry-Neuerstellung, ContextOverride-Verdrahtung) in der `qwen-code.subagent`-Dauer enthalten ist. Betreiber, die verfolgen, „warum ist dieser Subagent langsam?", sehen das vollständige Bild. Die Einrichtung ist typischerweise << LLM-Zeit, also rauschfrei.

Betrachtete Alternative: nach der Einrichtung öffnen, Einrichtungszeit ausschließen. Verworfen, weil die Einrichtung des Subagents selbst Arbeit ist, die dem Subagenten zuzurechnen ist – wenn man sie verbirgt, wird die Gesamtdauer beim Summieren aller Subagent-Spans falsch.

**Warum nicht nur durch den Aufgerufenen**: Wenn der Fork-/Hintergrund-Rumpf tatsächlich läuft, ist der Aufrufer bereits zurückgekehrt. `otelContext.active()` liefert dann den Umgebungskontext, den die asynchrone Laufzeit gerade mit sich führt – was bei `void`-Fire-and-Forget, nachdem der übergeordnete Span beendet ist, unzuverlässig ist. Der übergeordnete Span wurde bereits geschlossen; eine nachträgliche Neuzuordnung ist falsch.

**Warum nicht nur durch den Aufrufer**: Vordergrund funktioniert so gut, aber Fork-/Hintergrund-Spans müssen weiterhin Kind-Spans (LLM / Tool / Hook) aussenden, nachdem `AgentTool.execute` zurückgekehrt ist. Diese Kind-Spans benötigen `context.active()`, um den Subagent-Span zurückzugeben – was nur passiert, wenn der Rumpf explizit innerhalb von `context.with(subagentSpan, body)` läuft.

Beide Enden werden benötigt. **Das Design ist die Brücke** – Aufrufer erstellt Span + aufrufvarianter-aware traceId-Strategie, übergibt dann via `runInSubagentSpanContext`.

### D2 – Hybride traceId: Vordergrund = Kind-Span, Fork/Hintergrund = neue traceId + Link

| Aufrufvariante | Übergeordneter                     | traceId                  | Warum                                                                                                                                                                         |
| -------------- | ---------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `foreground`   | Kind des Tool-Spans des Aufrufers | erbt die traceId des Aufrufers | OTel-Standard; Aufrufer schließt Aufgerufenen zeitlich vollständig ein                                                                                                        |
| `fork`         | verknüpfter Root-Span             | neue traceId             | Aufrufer kehrt sofort zurück; Fork läuft über mehrere nachfolgende Interaktionen hinweg. OTel-Spec empfiehlt wörtlich Link dafür. Vermeidet Aufblähen der Dauer/Größe des übergeordneten Traces. |
| `background`   | verknüpfter Root-Span             | neue traceId             | Gleiche Begründung wie Fork.                                                                                                                                                  |

**Link-Payload**:

```ts
tracer.startSpan(
  'qwen-code.subagent',
  {
    kind: SpanKind.INTERNAL,
    links: [
      {
        context: invokerSpanContext,
        attributes: { 'qwen-code.link.kind': 'invoker' },
      },
    ],
  } /* expliziter Kontext = root, nicht vererbender aktiver */,
);
```

Abfragbarkeit über Traces hinweg mittels Session-ID: `gen_ai.conversation.id` wird auf jedem Subagent-Span gesetzt (sowohl Vordergrund als auch verknüpfte Root-Spans), sodass eine ARMS-Abfrage nach `session.id` sowohl den Trace der übergeordneten Interaktion ALS AUCH die verknüpften Root-Subagent-Traces zurückgibt. Der Link selbst erscheint im UI des übergeordneten Traces als „Erzeugt: Subagent X (anderer Trace)", sodass Navigation funktioniert.

**Warum nicht immer Kind-Span**: Ein 4-stündiger Hintergrund-Subagent bläht die Wanduhrzeit des übergeordneten Traces auf 4 Stunden auf; die Trace-Größe wächst über die Limits mehrerer Backends hinaus (LangSmiths 25.000-Run-Limit ist die klarste dokumentierte Grenze). Vordergrund-Subagents, auf die der Benutzer tatsächlich wartet, haben dieses Problem nicht, da sie zeitlich eingeschlossen sind.

**Warum nicht immer verknüpfter Root-Span**: Vordergrund zerstört den natürlichen Trace-Baum. Eine Benutzeranfrage, die einen synchronen Explore-Subagenten ausführt, SOLLTE einen einzigen Baum zeigen, nicht zwei verknüpfte Traces.

### D3 – TTL: typbewusst, Subagent Fork/Hintergrund = 4h, andere = 30min

`session-tracing.ts:124` definiert `SPAN_TTL_MS = 30 * 60 * 1000`. Der Sweep bei `:144-152` behandelt `tool.blocked_on_user` bereits speziell, um `decision: 'aborted' + source: 'system'` zu setzen. Es ist bereits im Geiste typbewusst.

**Änderung**: Führe typabhängige TTL ein:

```ts
const SPAN_TTL_MS_DEFAULT = 30 * 60 * 1000; // 30min
const SPAN_TTL_MS_LONG = 4 * 60 * 60 * 1000; // 4h

function ttlFor(ctx: SpanContext): number {
  if (
    ctx.type === 'subagent' &&
    ctx.attributes['qwen-code.subagent.invocation_kind'] !== 'foreground'
  ) {
    return SPAN_TTL_MS_LONG;
  }
  return SPAN_TTL_MS_DEFAULT;
}
```

Bei TTL-Ablauf erhalten Subagent-Spans den Stempel:

```ts
{
  'qwen-code.span.ttl_expired': true,
  'qwen-code.span.duration_ms': age,
  'qwen-code.subagent.status': 'aborted',
  'qwen-code.subagent.terminate_reason': 'ttl_swept',
}
```

**Warum nicht flach 30min**: Legitime lange Subagents (große Repo-Analyse, langsame Builds, tiefgehende Rechercheaufgaben) werden fälschlich als TTL-abgelaufen gestempelt. 4h deckt das 99. Perzentil ab, ohne so locker zu sein, dass echte Hänger unentdeckt bleiben.

**Warum nicht gar keine TTL**: Prozessabsturz / OOM / kill -9 → Span bleibt für immer in der `activeSpans`-Map. Das 30-min-Sicherheitsnetz schützt davor; Subagent-Fork/Hintergrund braucht nur ein größeres Fenster, keine Entfernung.

**Woher kommt 4h**: Pragmatische Obergrenze für nicht-triviale Agent-Aufgaben (lange Deep-Research / große Codebasis-Analyse). Über Konstante konfigurierbar, falls Produktionsdaten zeigen, dass wir falsch liegen.

### D4 – LogRecord-Beibehaltung: Emission beibehalten, LogToSpanProcessor-Brücke überspringen

Der `SubagentExecutionEvent`-LogRecord hat 3 Downstreams (durch Repo-Audit bestätigt):

| Verbraucher                                                                                      | Position                                         | Aktion                                                                                     |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| OTel LogRecord → `LogToSpanProcessor` → Brücken-Span `qwen-code.subagent_execution`              | `loggers.ts:773` → `log-to-span-processor.ts:346` | **Diese Brücke überspringen** für das Subagent-Event – neuer `qwen-code.subagent`-Span ersetzt sie |
| QwenLogger-RUM-Erfassung (Alibaba-interne Statistiken)                                           | `qwen-logger.ts:573-574`                         | Beibehalten – RUM sieht keine OTel-Spans, nur LogRecords                                   |
| `recordSubagentExecutionMetrics`-Counter                                                         | `metrics.ts:829`                                 | Beibehalten – Metrik-Verbraucher ist unabhängig von der Trace-Brücke                       |

**Brücke überspringen** (die einzige Änderung an LogToSpanProcessor):

```ts
// log-to-span-processor.ts — innerhalb von onEmit, nach deriveSpanName
const skipBridge = new Set<string>([
  EVENT_SUBAGENT_EXECUTION, // wird durch nativen qwen-code.subagent-Span abgedeckt
]);
if (skipBridge.has(eventName)) return;
```

**Auswirkung auf Trace-Verbraucher**: Dashboards, die nach Span-Name `qwen-code.subagent_execution` filtern, zeigen ab sofort null Ergebnisse. Sie sollten auf `qwen-code.subagent` aktualisiert werden. Dies in den Release-Notes vermerken.

**Warum den LogRecord nicht löschen**: Er ist die Eingabe für RUM und Metriken. Das Löschen wäre ein 3-System-Refactoring; nicht im Umfang hier.

**Warum nicht beide behalten**: Der Trace würde zwei Spans pro Subagent zeigen (`qwen-code.subagent` + `qwen-code.subagent_execution`) mit überlappenden Informationen – verwirrend für Betreiber beim Lesen von Traces, doppeltes Span-Volumen.

### D5 – Span-Name + Attribute: hybride Spezifikationskonformität, anbieterpräfix für Erweiterungen

**Span-Name**: `qwen-code.subagent` (entspricht der Konvention aus Phase 1/2: `qwen-code.interaction`, `qwen-code.tool`, `qwen-code.hook`, …).

Die OTel-GenAI-Spezifikation sagt, der kanonische Span-Name sei `invoke_agent {gen_ai.agent.name}` – sagt aber **auch**: „Einzelne GenAI-Systeme/Frameworks KÖNNEN andere Span-Name-Formate festlegen." Wir verwenden unseren eigenen Namen und setzen `gen_ai.operation.name='invoke_agent'`, sodass spezifikationsbewusste Werkzeuge den Span dennoch identifizieren. Betreiber, die unseren Trace-Baum lesen, sehen konsistente `qwen-code.*`-Benennung.

**Span-Kind**: `INTERNAL` (In-Prozess-Subagent-Aufruf, gemäß Spezifikation).

**Attribut-Set**:

| Kategorie                                                           | Attribut                                        | Quelle                                                               | Anmerkungen                                                                                                                                                                                |
| ------------------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Erforderlich (Spez.)**                                            | `gen_ai.operation.name='invoke_agent'`          | Literal                                                              | spez.-erforderlich                                                                                                                                                                         |
| **Erforderlich (Spez.)**                                            | `gen_ai.provider.name='qwen-code'`              | Literal                                                              | spez.-erforderlich; mehrdeutig für In-Prozess-Agents (Spez. schrieb es für LLM-Provider). Es auf `'qwen-code'` zu setzen, ist die ehrlichste Interpretation                                  |
| **Erforderlich (Doppelemission)**                                   | `gen_ai.agent.id` + `qwen-code.subagent.id`     | `agentContext.agentId`                                               | Doppelemission bis Spez. Stable erreicht; später Anbieter-Key entfernen                                                                                                                    |
| **Erforderlich (Doppelemission)**                                   | `gen_ai.agent.name` + `qwen-code.subagent.name` | `agentConfig.subagentType` (z.B. `Explore`, `code-reviewer`, `fork`) | gleiche Doppelemission                                                                                                                                                                     |
| **Empfohlen (Spez.)**                                               | `gen_ai.conversation.id`                        | `config.getSessionId()`                                              | ermöglicht trace-übergreifende Abfragen nach Session; koexistiert mit dem bereits vorhandenen `session.id`-Span-Attribut (global per #4367 gesetzt) – beide zeigen auf dieselbe UUID, eins entfernen, wenn Spez. stabil ist |
| **Empfohlen (Spez.)**                                               | `gen_ai.request.model`                          | Modell-Override, falls vorhanden                                     | nur wenn Subagent das übergeordnete Modell überschreibt                                                                                                                                     |
| **Anbieter (Vendor)**                                               | `qwen-code.subagent.invocation_kind`            | `'foreground'` ❘ `'fork'` ❘ `'background'`                           | treibt TTL + traceId-Strategie                                                                                                                                                             |
| **Anbieter (Vendor)**                                               | `qwen-code.subagent.is_built_in`                | bool                                                                 | Dashboard-Filter                                                                                                                                                                           |
| **Anbieter (Vendor)**                                               | `qwen-code.subagent.parent_agent_id`            | übergeordnetes ALS `agentId`                                        | für verschachtelte Subagents + trace-übergreifende Abstammung                                                                                                                               |
| **Anbieter (Vendor)**                                               | `qwen-code.subagent.depth`                      | übergeordnete Tiefe + 1 (oben = 0)                                   | Rekursions-Bug-Detektor                                                                                                                                                                    |
| **Anbieter (Vendor)**                                               | `qwen-code.subagent.invoking_request_id`        | aus `agentContext`                                                   | Request-Ebene-Korrelation                                                                                                                                                                  |
| **Ende-des-Spans (Spez.)**                                          | `error.type` (bei Fehler)                       | Fehlerklasse                                                         | OTel-Standard                                                                                                                                                                              |
| **Ende-des-Spans (Spez.)**                                          | `exception.message` (bei Fehler)                | `truncateSpanError(error.message)`                                   | OTel-Standard; verwendet Phase-2-Kürzung                                                                                                                                                   |
| **Ende-des-Spans (Anbieter)**                                       | `qwen-code.subagent.status`                     | `'completed'` ❘ `'failed'` ❘ `'cancelled'` ❘ `'aborted'`             | feiner als OTel SpanStatus (der OK / ERROR / UNSET ist)                                                                                                                                    |
| **Ende-des-Spans (Anbieter)**                                       | `qwen-code.subagent.terminate_reason`           | aus `SubagentExecutionEvent.terminate_reason`                        | z.B. `task_complete`, `max_iterations`, `user_abort`, `ttl_swept`                                                                                                                          |
| **Ende-des-Spans (Anbieter)**                                       | `qwen-code.subagent.result_summary_present`     | bool                                                                 | „Hat Subagent Ausgabe produziert" – begrenzt                                                                                                                                                |
| **Opt-in (sensitiv)** geschützt durch `includeSensitiveSpanAttributes` | `gen_ai.input.messages`                         | strukturierte Chat-Historie                                         | verwendet #4097s Gate wieder                                                                                                                                                               |
| **Opt-in (sensitiv)**                                               | `gen_ai.output.messages`                        | Modell-Antworten                                                     | gleiches Gate                                                                                                                                                                              |
| **Opt-in (sensitiv)**                                               | `gen_ai.system_instructions`                    | System-Prompt                                                        | gleiches Gate                                                                                                                                                                              |
| **Opt-in (sensitiv)**                                               | `gen_ai.tool.definitions`                       | Tool-Schemata                                                        | gleiches Gate                                                                                                                                                                              |
**SpanStatus-Mapping**:

- `status === 'completed'` → `SpanStatus { code: OK }`
- `status === 'failed'` → `SpanStatus { code: ERROR, message: truncated(error.message) }`
- `status === 'cancelled'` oder `'aborted'` → `SpanStatus { code: UNSET }` (entspricht der Phase-2-Konvention)

**Warum dual-emit bei `id` + `name`**: Der Spec befindet sich in Development (eine Stufe vor Experimental). `OTEL_SEMCONV_STABILITY_OPT_IN=gen_ai_latest_experimental` existiert zum Opt-in. Spec-Attributnamen können sich vor Stable ändern. Dual-emit folgt dem gleichen Muster, das Phase 2 für `call_id` → `tool.call_id` verwendet hat; entferne den Vendor-Key, sobald der Spec Stable erreicht.

**Warum `qwen-code.subagent.*` (nicht `qwen.subagent.*`)**: Jeder vorhandene Vendor-präfixierte Key in `constants.ts` verwendet `qwen-code.*` (`qwen-code.user_prompt`, `qwen-code.tool_call`, usw.). Interne Konsistenz > OTel-Benennungskonventions-Präferenz, da Betreiber ARMS nach Prefix abfragen.

**Kardinalität**: Span-Attribute sind in OTel keine Metrik-Labels; UUID-basierte Attribute (`id`, `parent_agent_id`, `invoking_request_id`) sind auf der Span-Ebene sicher. Fördere sie später nicht zu Metrik-Labels.

**~10–15 Attribute pro Span** (abhängig von Aufrufart, Fehlern, Verschachtelung). Gleiche Reihenfolge wie `qwen-code.tool`.

### D6 – `AgentContext.depth`-Feld direkt hinzugefügt

`AgentContext` (`agent-context.ts:32`) wird **nicht exportiert** – nur die Hilfsfunktionen (`getCurrentAgentId`, `runWithAgentContext`, `getRuntimeContentGenerator`, `runWithRuntimeContentGenerator`). Keine TypeScript-Level-Downstream-Breakage. Die 6 bekannten Leser via `getCurrentAgentId()` lesen nur `agentId`; das Hinzufügen von `depth?: number` ist für sie unsichtbar.

```ts
interface AgentContext {
  agentId: string;
  subagentName: string;
  invokingRequestId: string;
  invocationKind: 'spawn' | 'resume';
  isBuiltIn: boolean;
  depth?: number; // NEU – Standard 0 in den Lesern
}
```

`runWithAgentContext` verwendet bereits den Spread `{ ...current, agentId }`, daher überlebt `depth` unveränderte Aufrufe. **`runWithAgentContext` aktualisieren, um `depth` intern automatisch zu erhöhen** – kein Aufrufer muss von `depth` wissen:

```ts
function runWithAgentContext<T>(agentId: string, fn: () => T): T {
  const parent = agentContextStorage.getStore();
  const next: AgentContext = {
    ...parent,
    agentId,
    depth: (parent?.depth ?? -1) + 1, // Auto-Inkrement
  };
  return agentContextStorage.run(next, fn);
}
```

Top-Level-Subagent: kein parent ALS → `depth: 0`. Verschachtelt: parent depth + 1.

Ein neuer kleiner Accessor `getCurrentAgentDepth(): number` gibt `agentContextStorage.getStore()?.depth ?? 0` zurück – verwendet von `startSubagentSpan`, um `qwen-code.subagent.depth` zu füllen.

**Warum kein separater ALS nur für Telemetrie**: würde die gleiche Context-Form duplizieren, die wir bereits pflegen. Schlecht. Wiederverwende den vorhandenen.

## Hilfs-API (`session-tracing.ts`)

```ts
// constants.ts
export const SPAN_SUBAGENT = 'qwen-code.subagent';

// session-tracing.ts
export interface StartSubagentSpanOptions {
  agentId: string;
  subagentName: string;
  invocationKind: 'foreground' | 'fork' | 'background';
  isBuiltIn: boolean;
  parentAgentId?: string;
  depth: number;
  invokingRequestId?: string;
  sessionId: string;
  modelOverride?: string;
  invokerSpanContext?: SpanContext; // erforderlich für fork / background (Link-Quelle)
}

export interface SubagentSpanMetadata {
  status: 'completed' | 'failed' | 'cancelled' | 'aborted';
  terminateReason?: string;
  resultSummaryPresent?: boolean;
  error?: string;
  errorType?: string;
}

export function startSubagentSpan(opts: StartSubagentSpanOptions): Span;
export function endSubagentSpan(
  span: Span,
  metadata: SubagentSpanMetadata,
): void;
export function runInSubagentSpanContext<T>(
  span: Span,
  fn: () => Promise<T>,
): Promise<T>;
```

`runInSubagentSpanContext` ist das Isolations-Primitiv:

```ts
export function runInSubagentSpanContext<T>(
  span: Span,
  fn: () => Promise<T>,
): Promise<T> {
  const ctx = trace.setSpan(otelContext.active(), span);
  return otelContext.with(ctx, fn);
}
```

`startSubagentSpan` verzweigt intern nach `invocationKind`:

```ts
function startSubagentSpan(opts: StartSubagentSpanOptions): Span {
  const attributes = buildSpanAttributes(opts);
  const tracer = getTracer();

  if (opts.invocationKind === 'foreground') {
    // Kind des aktuellen aktiven Spans (Tool-Span des Aufrufers)
    return tracer.startSpan(SPAN_SUBAGENT, {
      kind: SpanKind.INTERNAL,
      attributes,
    });
  }

  // fork / background: verknüpfter Root-Span
  return tracer.startSpan(SPAN_SUBAGENT, {
    kind: SpanKind.INTERNAL,
    attributes,
    links: opts.invokerSpanContext
      ? [
          {
            context: opts.invokerSpanContext,
            attributes: { 'qwen-code.link.kind': 'invoker' },
          },
        ]
      : undefined,
    root: true, // erzwingt neue traceId; ignoriert aktiven Context als Parent
  });
}
```

## Lifecycle-Verkabelung

### Foreground benannt (der häufige Pfad)

```ts
// agent.ts:~2154
// Parent-ALS-Frame holen, um parentAgentId auf dem Span zu setzen. Die Tiefe des neuen
// Kindes wird innerhalb von runWithAgentContext automatisch berechnet (D6) — wir
// lesen sie via getCurrentAgentDepth(), sobald wir INNERHALB des Kind-ALS-Frames sind.
// Zwei Schritte:
const parentAgentId = getCurrentAgentId();  // VOR Eintritt in den Kind-Frame

// ... vorhandener runFramed-Aufruf tritt in runWithAgentContext(hookOpts.agentId, ...) ein ...

// INNERHALB runFramed können wir die Tiefe des Kindes lesen:
//   const depth = getCurrentAgentDepth();
//
// Praktische Platzierung: depth als Closure-Variable übergeben, nachdem
// runWithAgentContext wirkt — ODER als `(getCurrentAgentDepth() außen) + 1`
// von der Aufruferseite aus berechnen (einfacher).
const depth = getCurrentAgentDepth();  // außerhalb des Frames; das Kind wird dies + 1 sein
// (setze qwen-code.subagent.depth = depth in startSubagentSpan-Argumenten)

const span = startSubagentSpan({
  agentId, subagentName, invocationKind: 'foreground',
  isBuiltIn, parentAgentId, depth, invokingRequestId, sessionId,
  modelOverride,
  // invokerSpanContext weggelassen — foreground erbt auf natürliche Weise via context.with
});
let metadata: SubagentSpanMetadata = { status: 'aborted' };
try {
  await runInSubagentSpanContext(span, () =>
    runFramed(() => this.runSubagentWithHooks(...)),
  );
  metadata = { status: 'completed' /* + resultSummaryPresent */ };
} catch (error) {
  metadata = {
    status: signal.aborted ? 'aborted' : 'failed',
    error: error instanceof Error ? error.message : String(error),
    errorType: error?.constructor?.name,
  };
  throw error;
} finally {
  endSubagentSpan(span, metadata);
}
```

### Fork (Feuern-und-Vergessen)

```ts
const invokerSpanContext = trace.getSpan(otelContext.active())?.spanContext();
const span = startSubagentSpan({
  ..., invocationKind: 'fork', invokerSpanContext,
});
void runInForkContext(() =>
  runInSubagentSpanContext(span, async () => {
    let metadata: SubagentSpanMetadata = { status: 'aborted' };
    try {
      await runFramedFork();
      metadata = { status: 'completed' };
    } catch (error) {
      metadata = {
        status: signal.aborted ? 'aborted' : 'failed',
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      endSubagentSpan(span, metadata);
    }
  }),
);
// AgentTool.execute gibt sofort FORK_PLACEHOLDER_RESULT zurück;
// der Span lebt über nachfolgende Interaktionen der Eltern-Session hinweg.
```

### Background

Gleiche Form wie Fork, mit `invocationKind: 'background'` und `bgEventEmitter` statt `eventEmitter`. TTL beträgt 4h (wie Fork – Typenregel aus D3).

## Nebenläufigkeitsisolation – die Hauptgarantie

Drei gleichzeitige Subagent-Aufrufe aus einer Benutzereingabe (Modell sendet 3 AGENT tool_use-Blöcke → `coreToolScheduler.runConcurrently` führt 3 `executeSingleToolCall` parallel aus; jeder öffnet seinen eigenen `qwen-code.tool`-Span gemäß Phase 2):

```
qwen-code.interaction                         [traceId=T0]
├─ qwen-code.tool [agent call #A]
│  └─ qwen-code.subagent (A, foreground)     [traceId=T0, child]
│     ├─ qwen-code.llm_request
│     └─ qwen-code.tool [...]
│        └─ qwen-code.tool.execution
├─ qwen-code.tool [agent call #B]
│  └─ qwen-code.subagent (B, foreground)     [traceId=T0, child]
│     └─ qwen-code.llm_request
└─ qwen-code.tool [agent call #C]
   └─ qwen-code.subagent (C, fork)           [traceId=T1, linked root]
      └─ qwen-code.llm_request                [traceId=T1]
         └─ ...                               [traceId=T1, kann Stunden später emittiert werden]
```

`context.with(span, runX)` für A, B, C läuft parallel. `AsyncLocalStorageContextManager` (bereits automatisch von NodeSDK unter `sdk.ts:273` registriert) begrenzt den Gültigkeitsbereich pro Fiber; kein Übersprechen. Die Kind-LLM-/Tool-/Hook-Spans jedes Subagents sehen `span` via `context.active()` innerhalb ihrer eigenen asynchronen Kette.

Fork (C) ist eine separate Trace – ihre Kind-Spans erben `traceId=T1`, selbst wenn sie über mehrere nachfolgende Interaktionen der Eltern-Session hinweg emittiert werden. Eine ARMS-Abfrage nach `session.id` gibt sowohl T0 als auch T1 zurück; der Link von T1s Root → zum aufrufenden `qwen-code.tool`-Span von C bietet explizite Navigation.

## Zu ändernde Dateien

| Datei                                                        | Änderung                                                                                                                                                                                                                                                      | LOC geschätzt |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `packages/core/src/telemetry/constants.ts`                  | Füge `SPAN_SUBAGENT`, `SPAN_TTL_MS_LONG`, Attribut-Key-Konstanten hinzu                                                                                                                                                                                       | +8            |
| `packages/core/src/telemetry/session-tracing.ts`            | Füge `startSubagentSpan` (Foreground/Linked-Root-Verzweigung), `endSubagentSpan`, `runInSubagentSpanContext`, Typen hinzu; erweitere `SpanType`-Union um `'subagent'`; erweitere TTL-Räumung um `ttlFor(ctx)`                                                   | +120          |
| `packages/core/src/telemetry/log-to-span-processor.ts`      | Skip-Liste, um Bridging von `qwen-code.subagent_execution` zu umgehen                                                                                                                                                                                           | +6            |
| `packages/core/src/telemetry/index.ts`                      | Re-export neue Hilfsfunktionen + Typen                                                                                                                                                                                                                         | +6            |
| `packages/core/src/agents/runtime/agent-context.ts`         | Füge `depth?: number` zu `AgentContext` + `getCurrentAgentDepth()`-Accessor hinzu                                                                                                                                                                              | +12           |
| `packages/core/src/tools/agent/agent.ts`                    | Umwickle 3 Ausführungspfade (Foreground/Fork/Background) in `runInSubagentSpanContext` mit try/catch/finally                                                                                                                                                   | +60           |
| `packages/core/src/telemetry/session-tracing.test.ts`       | Neuer `describe('subagent spans')`: start/end, child vs linked-root, Context-Weitergabe, depth, TTL pro Typ, idempotentes end, NOOP unter SDK-nicht-initialisiert                                                                                              | +120          |
| `packages/core/src/telemetry/log-to-span-processor.test.ts` | Stelle sicher, dass Skip-Liste das subagent_execution-Bridging kurzschließt                                                                                                                                                                                    | +20           |
| `packages/core/src/tools/agent/agent.test.ts`               | End-to-End: 3 gleichzeitige Subagents erhalten jeweils isolierte Subtrees; fork-Spans erben neue traceId via Link; Background-Lebenszyklus                                                                                                                      | +80           |

Insgesamt: 9 Dateien, ~430 LOC. Größer als typische Phase-2-Commits, aber gerechtfertigt – TTL-Änderung betrifft eine separate Datei, LogToSpanProcessor-Skip ist eine separate Datei, und die Test-Dateien verdoppeln sich. Ein Splitten würde eine unvollständige Telemetrieoberfläche hinterlassen.

Falls das Review die Größe beanstandet: aufteilen in 2 PRs – (A) Telemetrie-Hilfsfunktionen + Tests, (B) `agent.ts`-Verkabelung + E2E-Tests. Zuerst eingecheckte Hilfsfunktionen ändern das Laufzeitverhalten nicht.

## Teststrategie

| Test                                                                                     | Was wird bewiesen                                             |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `startSubagentSpan foreground hängt an aktiven OTel-Span`                               | Kind-Span-Pfad                                                |
| `startSubagentSpan fork erzeugt neue traceId + Link zum Aufrufer`                       | Linked-Root-Pfad                                              |
| `runInSubagentSpanContext propagiert Span durch awaits / Promise.all`                   | Isolationsprimitive                                           |
| `3 gleichzeitige Subagent-Spans teilen sich keine Kinder`                               | Hauptgarantie für Nebenläufigkeit                             |
| `verschachtelter Subagent zeichnet depth + parentAgentId auf`                           | Verschachtelungsmetadaten                                     |
| `endSubagentSpan Status-Mapping (completed / failed / cancelled / aborted)`            | Status-Taxonomie                                              |
| `endSubagentSpan dual-emittiert gen_ai.agent.id + qwen-code.subagent.id`               | Spec-konformer Dual-Emit                                      |
| `Fork-Lebenszyklus: Span überlebt AgentTool.execute-Rückgabe`                           | Feuer-und-Vergessen-Korrektheit                               |
| `TTL: Fork-Subagent bleibt länger als 30 Minuten, wird gestempelt und nach 4h beendet`  | Typbewusste TTL                                               |
| `TTL: Foreground-Subagent wird nach 30 Minuten standardmäßig geräumt`                   | TTL wird nicht überdehnt                                      |
| `LogToSpanProcessor überspringt qwen-code.subagent_execution, sendet aber weiterhin RUM` | Bridge-Skip funktioniert                                      |
| `runConcurrently von 3 Agent-Tool-Aufrufen erzeugt 3 verschiedene Subagent-Spans`        | End-to-End auf Scheduler-Ebene                                |
| `fehlgeschlagener Subagent setzt exception.message + error.type + SpanStatus=ERROR`      | OTel-Standard-Fehlerpfad                                      |
| `opt-in-Attribute geschützt durch includeSensitiveSpanAttributes`                       | Nutzt #4097s Gate korrekt wieder                              |
| `startSubagentSpan gibt NOOP_SPAN zurück, wenn SDK nicht initialisiert`                 | Entspricht Phase-1/2-NOOP-Disziplin; Downstream-Aufrufe bleiben sicher |
| `Fork-Span Link.context entspricht spanContext des aufrufenden Tool-Spans`               | Cross-Trace-Navigation funktioniert End-to-End                |
| `runWithAgentContext erhöht depth automatisch: parent=0, child=1, grandchild=2`          | Depth-Buchhaltung ist korrekt ohne Mitwirkung des Aufrufers   |

## Randfälle

| Fall                                                                                                                   | Behandlung                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Subagent innerhalb eines Tools innerhalb eines Subagents (depth > 1)                                                   | `depth`-Attribut verfolgt; empfohlenes weiches `debugLogger.warn` bei depth ≥ 5 (Endlos-Rekursionsdetektor)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Subagent wird während `awaiting_approval` eines Eltern-Tools erzeugt                                                    | Subagent-Span ist Kind des AGENT-Tool-Spans; das `tool.blocked_on_user` des AGENT-Tools ist ein Geschwisterkind, nicht Eltern – beide sind Kinder des AGENT-Tool-Spans. Der Baum bleibt korrekt.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `signal.aborted` mitten im Subagent                                                                                    | Der Callback von `runInSubagentSpanContext` wirft einen Fehler oder löst auf; `finally` setzt `status='aborted'`, SpanStatus UNSET                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Fork noch am Leben, wenn die Eltern-Session endet                                                                      | 4h-TTL feuert; Sentinel-Attribute `qwen-code.span.ttl_expired:true`, `qwen-code.subagent.terminate_reason='ttl_swept'`, `status='aborted'`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `endSubagentSpan` zweimal aufgerufen                                                                                   | Idempotent – prüft `activeSpans`-Map; zweiter Aufruf ist No-Op (entspricht Phase-2-Muster)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Der LLM-Aufruf eines Subagents verwendet ein anderes Modell als das Eltern                                              | `gen_ai.request.model` wird auf dem Subagent-Span gesetzt; der LLM-Request-Unter-Span zeichnet das Modell AUCH auf – kein Konflikt                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Prelude-Wurf eines Schwester-Subagents entkommt `attemptExecutionOfScheduledCalls`                                      | Landet im kürzlich gefixten `handleConfirmationResponse`-Catch von Phase 2, der AUSSERHALB des try liegt – wird nicht dem bestätigten Tool-Span zugeschrieben. Der Subagent-Span schließt korrekt über sein eigenes try/finally                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Gleichzeitiger Fork + Foreground von einem Eltern                                                                       | Foreground erbt T0-traceId, Fork erhält T1. Beide haben korrekte Context-Weitergabe unabhängig. Der Eltern-Tool-Span endet, wenn seine synchrone Arbeit zurückkehrt; der Fork-Span (separate Trace) lebt weiter                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Fork-Span startet im synchronen Ablauf des Aufrufers, aber der Body wird später ausgeführt                               | `startSubagentSpan` wird VOR `void runInForkContext(...)` aufgerufen, sodass der Span (und sein Link zum Aufrufer) erfasst wird, während der spanContext des Aufrufers noch lesbar ist. Die Span-Dauer enthält daher jegliche Microtask-Queue-Planungsverzögerung, bevor der Body tatsächlich startet – typischerweise sub-ms; falls die Produktion nicht-triviale Lücken zeigt, kann ein separates Attribut `qwen-code.subagent.scheduling_delay_ms` hinzugefügt werden (offene Frage)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| SDK nicht initialisiert (Telemetrie deaktiviert)                                                                        | `startSubagentSpan` gibt frühzeitig NOOP_SPAN zurück (wie jeder andere Phase-1/2-Helfer). `runInSubagentSpanContext(NOOP_SPAN, fn)` ruft `fn` trotzdem normal auf. `endSubagentSpan(NOOP_SPAN, …)` ist ein No-Op                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Fork-Log-Bridge-Spans (`tool_call`, `api_request`, usw.) verwenden Session-abgeleitete traceId, während native Fork-Spans T1 verwenden | Vorhandenes Verhalten – Log-Bridge-Spans verwenden immer `deriveTraceId(sessionId)`, native Spans den OTel-Context. Die Abweichung ist innerhalb einer Trace unsichtbar, bedeutet aber, dass eine ARMS-Nachschlage nach traceId auf T1 die Log-Bridge-Kinder des Forks nicht enthalten wird. Außerhalb des Umfangs dieses PRs; als offene Frage #5 vermerkt                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Foreground vs. Background `SubagentStart`-Hook-Span-Eltern unterscheiden sich                                           | Foreground feuert `fireSubagentStartEvent` innerhalb von `runSubagentWithHooks` → bereits innerhalb von `runInSubagentSpanContext`, also hängt der Hook-Span unter `qwen-code.subagent`. Background feuert es VOR der `runWithSubagentSpan`-Umwicklung (der Subagent-Span existiert also noch nicht), daher hängt sein Hook-Span unter dem AGENT-`qwen-code.tool`. Betreiber, die "Hook-Spans unter Subagent-Spans" abfragen, sollten erwarten, dass der `SubagentStart` des Hintergrunds in dieser Ansicht fehlt. Das Verschieben des Background-Hook-Feuers innerhalb von `framedBgBody` ist mechanisch einfach (die `contextState`-Mutation erreicht `bgSubagent.execute` ohnehin), aber es ändert die benutzersichtbare Semantik: Der Hook feuert heute synchron, bevor `AgentTool.execute` die Nachricht "Background agent launched" zurückgibt, sodass jede synchrone Einrichtungsarbeit des Hooks innerhalb des benutzerblockierenden Turns stattfindet; durch das Verschieben würde der Hook feuern, nachdem die Startnachricht zurückgegeben wurde, also losgelöst. Zurückgestellt bis zur bewussten Entscheidung, welche Semantik bevorzugt wird. |
## Rollback

Die Änderung ist auf OTel-Ebene additiv – bestehende Dashboards, die nicht nach Subagent-bezogenen Spannamen filtern, funktionieren weiterhin. Trace-Konsumenten, die nach übergeordnetem Span gruppieren, sehen neue `qwen-code.subagent`-Knoten zwischen `qwen-code.tool` und `qwen-code.llm_request`; dies in den Release Notes dokumentieren.

Die verhaltensändernde Änderung ist der `LogToSpanProcessor`-Skip – Dashboards, die zuvor den Span `qwen-code.subagent_execution` konsumiert haben, liefern Null. Minderungsmaßnahme: den LogRecord intakt lassen (RUM + Metriken sehen ihn weiterhin); nur die Span-Bridge wird entfernt. Bestehende log-basierte Abfragen sind nicht betroffen.

Rollback-Pfad: den einzelnen PR zurücknehmen. Die neuen Span-Helfer werden nur von `agent.ts` aus aufgerufen; das Entfernen der Verkabelung plus des `LogToSpanProcessor`-Skips stellt das vorherige Verhalten 1:1 wieder her.

## Auswirkungen auf das Sampling

| Aufruf                                         | Quelle der Sampling-Entscheidung                                                |
| ---------------------------------------------- | ------------------------------------------------------------------------------- |
| `foreground` (Kind-Span, gleiche traceId)      | Übernimmt die Sampled-Entscheidung des übergeordneten Traces via Parent-based Sampler |
| `fork` / `background` (verknüpfter Root, neue traceId) | Unabhängige Sampling-Entscheidung bei der Root-Erstellung                         |

Bei qwen-codes aktueller Voreinstellung (laut `tracer.ts:shouldForceSampled()` – parentbased + always_on, sonst always_on) wird jeder Span gesamplet, sodass die Abweichung nicht ins Gewicht fällt. Bei Deployments mit probabilistischen Samplern (z. B. `traceidratio=0.1`) bedeutet das:

- Ein Benutzer-Prompt kann gesamplet werden (T0 vollständig erfasst), aber sein Fork (T1) verworfen werden, oder umgekehrt.
- Betreiber, die den übergeordneten T0 lesen, sehen „Link: subagent C (T1)" – ein Klick kann zu 404 führen, wenn T1 nicht gesamplet wurde.

Minderungsmaßnahme: für Betreiber dokumentieren. Falls vollständige Subagent-Erfassung wichtig ist, Sampling für Fork/Background über einen zukünftigen Konfigurationsknopf erzwingen. Hier nicht im Scope.

## Sensitive Attribute (#4097 Integration)

Das bestehende `includeSensitiveSpanAttributes`-Gate wiederverwenden. Wenn true, am Subagent-Span an den Lifecycle-Hooks setzen, an denen die Daten verfügbar sind:

| Spec-Attribut                 | Quelle                                                        | Zeitpunkt des Setzens                                                                              |
| ----------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `gen_ai.system_instructions`  | gerenderter System-Prompt aus `agentConfig` / übergeordnetem Kontext | `startSubagentSpan` (falls vor Span-Öffnung verfügbar) oder via `setAttributes` früh im Body       |
| `gen_ai.tool.definitions`     | dem Subagent bekannte Tool-Deklarationen                     | wie oben                                                                                            |
| `gen_ai.input.messages`       | an den Subagent übergebener initialer Input (Prompt + extraHistory) | zu Beginn des Bodys                                                                                 |
| `gen_ai.output.messages`      | vom Subagent zurückgegebene finale Response-Messages           | in den Metadaten von `endSubagentSpan`                                                              |

Diese sind alle bereits gegatet; das Muster von #4097 besteht darin, einen `addSubagentSensitiveAttributes(span, opts)`-Helper innerhalb des Bodys aufzurufen. Implementierungsdetail – das Design notiert nur den Integrationspunkt.

## Sequenzierung

- Unabhängig von #4367 (Resource-Attribute – in Review). Keine Merge-Reihenfolgen-Beschränkung, aber `gen_ai.conversation.id` auf Subagent-Spans profitiert davon, dass `session.id` in #4367 von der Resource entfernt wird. **Empfehlung: #4367 zuerst landen lassen**, damit die `getSessionId()`-Single-Source-of-Truth festgelegt ist.
- Unabhängig von Phase 4 (LLM-Request-Dekomposition / TTFT). Phase 4 hängt an `qwen-code.llm_request`-Spans, unabhängig davon, ob sie unter einem Subagent oder einer Interaktion liegen. Empfehlung: Phase 3 vor Phase 4, damit die Per-Attempt-Metriken von Phase 4 pro Subagent aggregiert werden können.

## Offene Fragen

1. **`gen_ai.provider.name`**: Spec verlangt es, beschreibt aber den LLM-Provider, nicht das Agent-Framework. Auf `'qwen-code'` zu setzen ist die beste Interpretation; falls eine zukünftige Spec-Revision eine `agent.provider.name`-Variante einführt, sollten wir wechseln.
2. **Span-Name `qwen-code.subagent` vs. Spec `invoke_agent {name}`**: Interne Konsistenz gewählt. Falls GenAI-bewusstes Tooling wächst und `invoke_agent ${name}` für die automatische Erkennung kritisch wird, können wir wechseln – der Span-Name ist in OTel das am einfachsten umbenennbare Element.
3. **Soft-Warnung bei Tiefe ≥ 5**: willkürliche Zahl. Könnte ein Konfigurationsknopf sein. Zurückstellen, bis Produktionsdaten einen Bedarf zeigen.
4. **`SubagentExecutionEvent.result` mit vollständigem LLM-Output ist groß**: heute bläht es das LogRecord-Volumen auf. Der Migrationsplan (LogRecord → Span-Events) ist zurückgestellt, aber sinnvoll, sobald die Token-Usage-Aggregation in Phase 4 landet.
5. **Log-Bridge-Spans innerhalb eines Forks landen auf der session-abgeleiteten traceId, nicht auf der traceId des Forks (T1)**: siehe Edge Cases. Die Lösung ist das breitere Problem „Interaktions-Span erbt nicht den Session-Root-Kontext", das im Thread zu sessionId-vs-traceId aufgeworfen wurde – ein separates Design, das alle nativen Spans betrifft, nicht nur Subagent. Nicht im Scope.