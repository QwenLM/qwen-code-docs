# Subagent Trace Tree Design (P3 Phase 3)

> Issue #3731 — Phase 3 des hierarchischen Session-Tracings. Fügt einen `qwen-code.subagent`-Span hinzu, sodass Subagenten-Aufrufe isolierte, abfragbare Trace-Strukturen erhalten, anstatt sich stillschweigend unter dem übergeordneten `qwen-code.interaction`-Span zu vermischen.
>
> Baut auf Phase 1 (#4126), Phase 1.5 (#4302) und Phase 2 (#4321) auf.

## Problem

Derzeit läuft jede `AgentTool.execute`-Invokation unter dem übergeordneten `qwen-code.interaction`-Span. Drei Pathologien:

1. **Gleichzeitige Subagenten vermischen sich.** `coreToolScheduler.ts:728` markiert `AGENT` als nebenläufigkeitssicher – `Promise.all` führt bis zu 10 Subagenten parallel aus. Ihre LLM-Request-/Tool-/Hook-Spans hängen alle an dem einen gemeinsamen Eltern-Interaction-Span, sodass Trace-Explorer nicht unterscheiden können, ob „dieser LLM-Request zu Subagent A" oder „dieser zu Subagent B" gehört.
2. **Kein Span für die Subagenten-Grenze selbst.** Es gibt einen `qwen-code.subagent_execution`-LogRecord (ausgegeben in `agent-headless.ts:268,329`), der über `LogToSpanProcessor` in einen Span gleichen Namens überführt wird, aber es ist ein eigenständiger Marker, kein Elternteil, das die LLM-/Tool-/Hook-Spans des Subagenten unter sich verschachtelt.
3. **Fork-/Hintergrund-Subagenten schweben frei.** Fire-and-Forget-Pfade (`runInForkContext` / Hintergrund) überleben den übergeordneten `AgentTool.execute` und senden Spans über mehrere nachfolgende Benutzerinteraktionen hinweg. Der Eltern-Tool-Span ist bereits beendet, wenn diese Spans auftauchen, sodass `context.active()` von OTel nicht hilft – sie hängen an der gerade aktiven Interaktion zum Zeitpunkt des Auslösens oder gar keiner.

## Bestehende Oberfläche (keine Änderung)

| Komponente                          | Ort                                                                                                                                                                                             | Warum wir sie nicht anfassen                                    |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| Erzeugungsort (vereinheitlicht)     | `packages/core/src/tools/agent/agent.ts:1147` `AgentTool.execute()`                                                                                                                              | Einziger Einstiegspunkt; idealer Hook für 3 Invokationsarten    |
| Drei Invokationsarten               | Vordergrund-benannt (`runFramed` bei `:2154` – awaited), Fork (`void runInForkContext(runFramedFork)` bei `:1991` – fire-and-forget), Hintergrund (`void framedBgBody()` bei `:1934` – fire-and-forget) | Lebenszyklus unterscheidet sich – Span-Design deckt alle drei ab |
| Nebenläufigkeit                     | `coreToolScheduler.runConcurrently` (`Promise.all`, cap 10) – gesteuert durch `partitionToolCalls`, das AGENT als `concurrent: true` markiert                                                    | Das, was Isolation notwendig macht                             |
| `runInForkContext` ALS              | `packages/core/src/tools/agent/fork-subagent.ts:32` `forkExecutionStorage`                                                                                                                       | Nur rekursiver Fork-Guard – propagiert KEINEN OTel-Kontext      |
| Agentenidentität ALS                | `packages/core/src/agents/runtime/agent-context.ts:46` `runWithAgentContext(agentId, ...)`                                                                                                       | Trägt bereits `agentId`; wir erweitern es um `depth`            |
| `SubagentExecutionEvent` LogRecord  | `agent-headless.ts:268,329` → `loggers.ts:773` → 3 nachgelagerte (LogToSpanProcessor Span-Bridge + QwenLogger RUM + `recordSubagentExecutionMetrics`)                                              | LogRecord bleibt; nachgelagerte hängen davon ab                 |

## Nicht im Umfang (verschoben)

- **Token-Nutzungsaggregation pro Subagent** (`gen_ai.usage.*` über alle LLM-Spans innerhalb eines Subagenten summiert). Gehört in Phase 4 (LLM-Request-Zerlegung).
- **Migration des `qwen-code.subagent_execution`-LogRecords auf den neuen Span als Span-Events.** RUM und Metriken sind stark an den LogRecord gekoppelt; verschoben auf ein Follow-up, das alle 3 Verbraucher gemeinsam neu verhandeln kann.
- **Auto-Cost-Rollup.** Gleicher Grund – benötigt zuerst Token-Nutzung.
- **Entfernung des AGENT-Tool-`concurrent: true`-Markers.** Nebenläufigkeit ist korrekt; wir instrumentieren sie, wir schränken sie nicht ein.

## Referenzen (Entscheidungsnachweise)

| Quelle                                                                                                                 | Wichtigste Erkenntnis                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [OTel Trace Spec – Links between spans](https://opentelemetry.io/docs/specs/otel/overview/#links-between-spans)        | Wörtlich: „Der neue verknüpfte Trace kann auch eine lang laufende asynchrone Datenverarbeitungsoperation darstellen, die von einer von vielen schnellen eingehenden Anfragen initiiert wurde." → Fork/Hintergrund sollten verknüpfte Wurzeln sein, keine Kinder.                                                              |
| [OTel GenAI Agent Spans](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-agent-spans/) (Status: Entwicklung) | Span-Name `invoke_agent {gen_ai.agent.name}`; erforderliche Attribute `gen_ai.operation.name`, `gen_ai.provider.name`; empfohlen: `gen_ai.agent.id`, `gen_ai.agent.name`, `gen_ai.conversation.id`.                                                                                                                           |
| LangSmith – 25.000 Läufe / Trace-Limit                                                                                 | Lange Agent-Sessions erzwingen letztlich eine Trace-Aufteilung; begünstigt hybrides traceId-Design.                                                                                                                                                                                                                          |
| [Sentry – Distributed Tracing](https://docs.sentry.io/concepts/key-terms/tracing/distributed-tracing/)                 | „Kind-Transaktionen können die Transaktionen überdauern, die ihre Eltern-Spans enthalten" – ein Kind mit überdauerndem Leben wird unterstützt.                                                                                                                                                                                |
| claude-code (Anthropic)                                                                                                | Hat Subagent-Hierarchie nur in lokaler Perfetto-JSON-Datei; OTel-Export ist flach. Kein portierbarer Code.                                                                                                                                                                                                                    |
| opencode (sst/opencode)                                                                                                | Verwendet `@effect/opentelemetry`-Auto-Instrumentierung; explizites `context.with(trace.setSpan(active, span), fn)` für `withRunSpan`. **Bestätigt das context.with-Isolationsmuster.** Ihre Warnung zur manuellen Registrierung von `AsyncLocalStorageContextManager` trifft nicht zu – qwen-code's `NodeSDK` registriert es automatisch. |
## Design – sechs Entscheidungen, jede begründet

### D1 — Lebensdauer des Spans: Aufrufer öffnet, Aufgerufener läuft innerhalb `context.with(span, fn)`

`agent.ts` (Aufrufer) erstellt den Span. Der Rumpf – ob nun erwartet (`runFramed`) oder Feuer-und-Vergessen (`runInForkContext` / Hintergrund) – läuft innerhalb `runInSubagentSpanContext(span, fn)`, das wiederum `otelContext.with(trace.setSpan(active, span), fn)` aufruft.

**Wo genau in `AgentTool.execute` wird der Span geöffnet?** Öffne ihn **direkt VOR der aufrufartspezifischen Einrichtung** (`createAgentHeadless` / `createForkSubagent` usw.) – sodass die Einrichtungszeit (Config-Aufbau, ToolRegistry-Neuerstellung, ContextOverride-Verdrahtung) in der `qwen-code.subagent`-Dauer enthalten ist. Operatoren, die nachvollziehen möchten, „Warum ist dieser Subagent langsam?“, sehen das vollständige Bild. Die Einrichtung ist typischerweise << LLM-Zeit, daher ist dies rauschfrei.

Betrachtete Alternative: Öffnen nach der Einrichtung, Ausschluss der Einrichtungszeit. Verworfen, weil die Einrichtung des Subagents selbst eine dem Subagenten zurechenbare Arbeit ist – das Verstecken führt zu falschen Gesamtdauerberechnungen, wenn alle Subagent-Spans summiert werden.

**Warum nicht nur der Aufgerufene**: Zu dem Zeitpunkt, an dem der Fork-/Hintergrund-Rumpf tatsächlich läuft, ist der Aufrufer bereits zurückgekehrt. `OTel context.active()` gibt dann den ambienten Kontext zurück, den die asynchrone Laufzeitumgebung mit sich führt – was bei `void`-Feuer-und-Vergessen nach Ende des übergeordneten Prozesses unzuverlässig ist. Der übergeordnete Span wurde bereits geschlossen; eine Neuverknüpfung im Nachhinein ist falsch.

**Warum nicht nur der Aufrufer**: Vordergrund funktioniert so einwandfrei, aber Fork-/Hintergrund-Spans müssen weiterhin Kind-Spans (LLM/Tool/Hook) ausgeben, nachdem `AgentTool.execute` zurückkehrt. Diese Kind-Spans benötigen `context.active()`, das den Subagent-Span zurückgibt – was nur geschieht, wenn der Rumpf explizit innerhalb von `context.with(subagentSpan, body)` läuft.

Beide Enden werden benötigt. **Das Design ist die Brücke** – Aufrufer erstellt Span + aufrufartspezifische TraceId-Strategie, dann Übergabe via `runInSubagentSpanContext`.

### D2 — Hybride TraceId: Vordergrund = Kind-Span, Fork/Hintergrund = neue TraceId + Link

| Aufruf-Art           | Elternspan                  | TraceId                 | Warum                                                                                                                                                                          |
| -------------------- | --------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `foreground`         | Kind des Tool-Spans des Aufrufers | erbt die TraceId des übergeordneten | OTel-Standard; Aufrufer schließt den Aufgerufenen zeitlich vollständig ein                                                                                                                        |
| `fork`               | verknüpfter Root-Span       | neue TraceId             | Aufrufer kehrt sofort zurück; Fork läuft über mehrere nachfolgende Interaktionen hinweg. OTel-Spezifikation empfiehlt hierfür ausdrücklich Link. Vermeidet Aufblähen der Dauer/Größe des übergeordneten Traces. |
| `background`         | verknüpfter Root-Span       | neue TraceId             | Gleiche Begründung wie bei Fork.                                                                                                                                                      |

**Link-Nutzlast**:

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
  } /* expliziter Kontext = Root, nicht Vererbung von active */,
);
```

Übergreifende Trace-Abfragbarkeit via Sitzungs-ID: `gen_ai.conversation.id` wird auf jedem Subagent-Span gesetzt (sowohl Vordergrund als auch verknüpfter Root), sodass eine ARMS-Abfrage mit `session.id` sowohl den Trace der übergeordneten Interaktion als auch die verknüpften Root-Subagent-Traces zurückgibt. Der Link selbst erscheint in der UI des übergeordneten Traces als „Spawned: Subagent X (anderer Trace)“, sodass die Navigation funktioniert.

**Warum nicht immer Kind-Span**: Ein 4-Stunden-Hintergrund-Subagent bläht die Wanduhrzeit des übergeordneten Traces auf 4 Stunden auf; die Trace-Größe überschreitet mehrere Backend-Grenzwerte (LangSmiths Limit von 25.000 Runs ist die klarste dokumentierte Schranke). Vordergrund-Subagents, auf die der Benutzer tatsächlich wartet, haben dieses Problem nicht, da sie zeitlich eingeschlossen sind.

**Warum nicht immer verknüpfter Root**: Der Vordergrund zerstört den natürlichen Trace-Baum. Eine Benutzereingabe, die einen synchronen Explore-Subagent ausführt, SOLLTE einen Baum zeigen, nicht zwei verknüpfte Traces.

### D3 — TTL: typbewusst, Subagent Fork/Hintergrund = 4h, andere = 30min

`session-tracing.ts:124` definiert `SPAN_TTL_MS = 30 * 60 * 1000`. Der Durchlauf bei `:144-152` behandelt `tool.blocked_on_user` bereits speziell, indem er `decision: 'aborted' + source: 'system'` setzt. Er ist bereits dem Geiste nach typbewusst.

**Änderung**: Einführung einer TTL pro Typ:

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
Bei Ablauf der TTL werden Subagenten-Spans mit folgenden Daten versehen:

```ts
{
  'qwen-code.span.ttl_expired': true,
  'qwen-code.span.duration_ms': age,
  'qwen-code.subagent.status': 'aborted',
  'qwen-code.subagent.terminate_reason': 'ttl_swept',
}
```

**Warum nicht 30 Minuten genau**: Legitime langlebige Subagenten (große Repo-Analysen, langsame Builds, tiefgehende Rechercheaufgaben) werden fälschlich als TTL-abgelaufen gekennzeichnet. 4 Stunden decken das 99. Perzentil ab, ohne so großzügig zu sein, dass echte Hänger unentdeckt bleiben.

**Warum kein TTL**: Bei Prozessabsturz / OOM / kill -9 bleibt die Span für immer in der `activeSpans`-Map. Das 30-minütige Sicherheitsnetz schützt davor; Subagent-Fork/Background benötigt nur ein breiteres Zeitfenster, nicht die Entfernung.

**Woher die 4 Stunden kommen**: Pragmatische Obergrenze für nicht-triviale Agent-Aufgaben (lange Deep-Research / große Codebasis-Analyse). Über eine Konstante konfigurierbar, falls Produktionsdaten zeigen, dass wir falsch liegen.

### D4 — LogRecord-Aufbewahrung: Emission beibehalten, LogToSpanProcessor-Brücke überspringen

Das LogRecord `SubagentExecutionEvent` hat 3 nachgelagerte Konsumenten (durch Repo-Audit bestätigt):

| Konsument                                                                            | Position                                          | Aktion                                                                                   |
| ------------------------------------------------------------------------------------ | ------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| OTel LogRecord → `LogToSpanProcessor` → Brücken-Span `qwen-code.subagent_execution` | `loggers.ts:773` → `log-to-span-processor.ts:346` | **Diese Brücke überspringen** für das Subagenten-Ereignis – neue `qwen-code.subagent`-Span ersetzt sie |
| QwenLogger RUM-Aufnahme (Aliyun-interne Statistiken)                                 | `qwen-logger.ts:573-574`                          | Beibehalten – RUM sieht nur LogRecords, keine OTel-Spans                                  |
| `recordSubagentExecutionMetrics` Counter                                             | `metrics.ts:829`                                  | Beibehalten – Metrik-Konsument ist unabhängig von der Trace-Brücke                        |

**Brücke überspringen** (die einzige Änderung am LogToSpanProcessor):

```ts
// log-to-span-processor.ts — inside onEmit, after deriveSpanName
const skipBridge = new Set<string>([
  EVENT_SUBAGENT_EXECUTION, // covered by native qwen-code.subagent span
]);
if (skipBridge.has(eventName)) return;
```

**Auswirkung auf Trace-Konsumenten**: Dashboards, die nach dem Span-Namen `qwen-code.subagent_execution` filtern, liefern fortan null Ergebnisse. Sie sollten auf `qwen-code.subagent` aktualisiert werden. Dies in den Versionshinweisen vermerken.

**Warum das LogRecord nicht löschen**: Es ist die Eingabe für RUM und Metriken. Das Löschen wäre ein 3-System-Refactoring – außerhalb des Rahmens hier.

**Warum nicht beide behalten**: Der Trace würde zwei Spans pro Subagenten anzeigen (`qwen-code.subagent` + `qwen-code.subagent_execution`) mit überlappenden Informationen – verwirrend für Betreiber, die Traces lesen, doppeltes Span-Volumen.

### D5 — Span-Name + Attribute: hybride Spezifikationskonformität, herstellerpräfixierte Erweiterungen

**Span-Name**: `qwen-code.subagent` (folgt der Konvention von Phase 1/2: `qwen-code.interaction`, `qwen-code.tool`, `qwen-code.hook`, …).

Die OTel GenAI-Spezifikation gibt den kanonischen Span-Namen als `invoke_agent {gen_ai.agent.name}` vor – sagt aber **auch**: "Einzelne GenAI-Systeme/-Frameworks KÖNNEN andere Span-Namen-Formate festlegen." Wir verwenden unseren eigenen Namen und setzen `gen_ai.operation.name='invoke_agent'`, sodass spezifikationsbewusste Tools die Span trotzdem identifizieren. Betreiber, die unseren Trace-Baum lesen, sehen durchgängige `qwen-code.*`-Benennung.

**Span-Kind**: `INTERNAL` (In-Process-Subagenten-Aufruf, gemäß Spezifikation).

**Attribut-Satz**:

| Kategorie                                                          | Attribut                                        | Quelle                                                                | Hinweise                                                                                                                                                                                                  |
| ------------------------------------------------------------------ | ----------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Erforderlich (Spez.)**                                           | `gen_ai.operation.name='invoke_agent'`          | literal                                                               | spezifikationsgefordert                                                                                                                                                                                   |
| **Erforderlich (Spez.)**                                           | `gen_ai.provider.name='qwen-code'`              | literal                                                               | spezifikationsgefordert; mehrdeutig für In-Process-Agenten (Spezifikation schrieb es für LLM-Anbieter). Die Setzung auf `'qwen-code'` ist die ehrlichste Interpretation                                    |
| **Erforderlich (Dual-Emit)**                                       | `gen_ai.agent.id` + `qwen-code.subagent.id`     | `agentContext.agentId`                                                | Dual-Emit bis die Spezifikation den Stable-Status erreicht; später den Herstellerschlüssel entfernen                                                                                                     |
| **Erforderlich (Dual-Emit)**                                       | `gen_ai.agent.name` + `qwen-code.subagent.name` | `agentConfig.subagentType` (z.B. `Explore`, `code-reviewer`, `fork`) | selbes Dual-Emit                                                                                                                                                                                          |
| **Empfohlen (Spez.)**                                              | `gen_ai.conversation.id`                        | `config.getSessionId()`                                               | ermöglicht übergreifende Trace-Abfragen nach Sitzung; koexistiert mit dem bestehenden `session.id`-Span-Attribut (global gesetzt gemäß #4367) – beide zeigen auf dieselbe UUID, eines entfernen, wenn Spezifikation sich stabilisiert |
| **Empfohlen (Spez.)**                                              | `gen_ai.request.model`                          | Modell-Override, falls vorhanden                                     | nur wenn der Subagent das Eltern-Modell überschreibt                                                                                                                                                     |
| **Hersteller**                                                     | `qwen-code.subagent.invocation_kind`            | `'foreground'` ❘ `'fork'` ❘ `'background'`                           | treibt TTL- + TraceId-Strategie                                                                                                                                                                           |
| **Hersteller**                                                     | `qwen-code.subagent.is_built_in`                | bool                                                                 | Dashboard-Filter                                                                                                                                                                                          |
| **Hersteller**                                                     | `qwen-code.subagent.parent_agent_id`            | parent ALS `agentId`                                                  | für verschachtelte Subagenten + übergreifende Trace-Abstammung                                                                                                                                            |
| **Hersteller**                                                     | `qwen-code.subagent.depth`                      | parent depth + 1 (top = 0)                                            | Erkennung von Rekursionsfehlern                                                                                                                                                                           |
| **Hersteller**                                                     | `qwen-code.subagent.invoking_request_id`        | aus `agentContext`                                                    | anforderungsübergreifende Korrelation                                                                                                                                                                     |
| **Ende-der-Span (Spez.)**                                          | `error.type` (bei Fehler)                       | error class                                                          | OTel-Standard                                                                                                                                                                                             |
| **Ende-der-Span (Spez.)**                                          | `exception.message` (bei Fehler)                | `truncateSpanError(error.message)`                                   | OTel-Standard; verwendet Phase 2-Kürzung wieder                                                                                                                                                           |
| **Ende-der-Span (Hersteller)**                                     | `qwen-code.subagent.status`                     | `'completed'` ❘ `'failed'` ❘ `'cancelled'` ❘ `'aborted'`             | feiner als OTel SpanStatus (OK / ERROR / UNSET)                                                                                                                                                           |
| **Ende-der-Span (Hersteller)**                                     | `qwen-code.subagent.terminate_reason`           | aus `SubagentExecutionEvent.terminate_reason`                        | z.B. `task_complete`, `max_iterations`, `user_abort`, `ttl_swept`                                                                                                                                         |
| **Ende-der-Span (Hersteller)**                                     | `qwen-code.subagent.result_summary_present`     | bool                                                                 | "Hat Subagent Ausgabe erzeugt" – begrenzt                                                                                                                                                                 |
| **Opt-in (sensitiv)** geschützt durch `includeSensitiveSpanAttributes` | `gen_ai.input.messages`                         | strukturierter Chat-Verlauf                                         | verwendet #4097's Gate wieder                                                                                                                                                                             |
| **Opt-in (sensitiv)**                                              | `gen_ai.output.messages`                        | Modell-Antworten                                                    | selbes Gate                                                                                                                                                                                               |
| **Opt-in (sensitiv)**                                              | `gen_ai.system_instructions`                    | System-Prompt                                                       | selbes Gate                                                                                                                                                                                               |
| **Opt-in (sensitiv)**                                              | `gen_ai.tool.definitions`                       | Tool-Schemas                                                         | selbes Gate                                                                                                                                                                                               |
**SpanStatus-Zuordnung**:

- `status === 'completed'` → `SpanStatus { code: OK }`
- `status === 'failed'` → `SpanStatus { code: ERROR, message: truncated(error.message) }`
- `status === 'cancelled'` oder `'aborted'` → `SpanStatus { code: UNSET }` (entspricht Phase-2-Konvention)

**Warum Dual-Emit bei `id` + `name`**: Der Spec ist in Development (eine Stufe früher als Experimental). `OTEL_SEMCONV_STABILITY_OPT_IN=gen_ai_latest_experimental` existiert für Opt-in. Spec-Attributsnamen können sich vor Stable ändern. Dual-Emit ist dasselbe Muster, das Phase 2 für `call_id` → `tool.call_id` verwendet hat; entfernen Sie den Vendor-Key, sobald der Spec Stable erreicht.

**Warum `qwen-code.subagent.*` (nicht `qwen.subagent.*`)**: Jeder vorhandene vendor-präfixierte Key in `constants.ts` verwendet `qwen-code.*` (`qwen-code.user_prompt`, `qwen-code.tool_call` usw.). Interne Konsistenz > OTel-Namenskonventionspräferenz, da Operatoren ARMS per Prefix abfragen.

**Kardinalität**: Span-Attribute sind in OTel keine Metrik-Labels; UUID-basierte Attribute (`id`, `parent_agent_id`, `invoking_request_id`) sind auf Span-Ebene sicher. Fördern Sie sie später nicht zu Metrik-Labels.

**~10-15 Attribute pro Span** (abhängig von Aufrufart, Fehler, Verschachtelung). Gleiche Reihenfolge wie `qwen-code.tool`.

### D6 — `AgentContext.depth` direkt hinzugefügt

`AgentContext` (`agent-context.ts:32`) wird **nicht exportiert** – nur die Hilfsfunktionen (`getCurrentAgentId`, `runWithAgentContext`, `getRuntimeContentGenerator`, `runWithRuntimeContentGenerator`). Null TypeScript-Level Downstream-Breakage. Die 6 bekannten Leser via `getCurrentAgentId()` lesen nur `agentId`; das Hinzufügen von `depth?: number` ist für sie unsichtbar.

```ts
interface AgentContext {
  agentId: string;
  subagentName: string;
  invokingRequestId: string;
  invocationKind: 'spawn' | 'resume';
  isBuiltIn: boolean;
  depth?: number; // NEU – Standard 0 in Lesern
}
```

`runWithAgentContext` verwendet bereits den `{ ...current, agentId }`-Spread, sodass `depth` an bestehenden Aufrufstellen unverändert bleibt. **`runWithAgentContext` aktualisieren, um depth automatisch zu erhöhen** – kein Aufrufer muss etwas über depth wissen:

```ts
function runWithAgentContext<T>(agentId: string, fn: () => T): T {
  const parent = agentContextStorage.getStore();
  const next: AgentContext = {
    ...parent,
    agentId,
    depth: (parent?.depth ?? -1) + 1, // automatische Erhöhung
  };
  return agentContextStorage.run(next, fn);
}
```

Top-Level-Subagent: kein Parent ALS → `depth: 0`. Verschachtelt: Parent depth+1.

Ein neuer kleiner Accessor `getCurrentAgentDepth(): number` gibt `agentContextStorage.getStore()?.depth ?? 0` zurück – wird von `startSubagentSpan` verwendet, um `qwen-code.subagent.depth` zu befüllen.

**Warum kein separater ALS nur für Telemetrie**: würde dieselbe Context-Form duplizieren, die wir bereits pflegen. Schlecht. Den vorhandenen wiederverwenden.

## Helper-API (`session-tracing.ts`)

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
    // Kind des aktuell aktiven Spans (Tool-Span des Aufrufers)
    return tracer.startSpan(SPAN_SUBAGENT, {
      kind: SpanKind.INTERNAL,
      attributes,
    });
  }

  // fork / background: Linked Root Span
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

## Lifecycle-Verdrahtung

### Benannter Vordergrund (der häufige Pfad)

```ts
// agent.ts:~2154
// Parent-ALS-Frame ziehen, um parentAgentId auf dem Span zu setzen. Die Tiefe
// des neuen Childs wird automatisch in runWithAgentContext berechnet (D6) –
// wir lesen sie via getCurrentAgentDepth(), sobald wir IM Child-ALS-Frame sind.
// Zwei Schritte:
const parentAgentId = getCurrentAgentId();  // VOR Betreten des Child-Frames

// ... bestehender runFramed-Aufruf betritt runWithAgentContext(hookOpts.agentId, ...) ...

// INNERHALB von runFramed können wir die Child-Tiefe lesen:
//   const depth = getCurrentAgentDepth();
//
// Praktische Platzierung: depth als Closure-Variable übergeben, nachdem
// runWithAgentContext wirkt – ODER berechnen als
// `(getCurrentAgentDepth() außerhalb) + 1` von der Aufruferseite (einfacher).
const depth = getCurrentAgentDepth();  // außerhalb des Frames; Child wird this + 1
// (setzen qwen-code.subagent.depth = depth in startSubagentSpan-Argumenten)

const span = startSubagentSpan({
  agentId, subagentName, invocationKind: 'foreground',
  isBuiltIn, parentAgentId, depth, invokingRequestId, sessionId,
  modelOverride,
  // invokerSpanContext weggelassen – foreground erbt natürlich via context.with
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
### Fork (fire-and-forget)

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
// Der Span lebt über nachfolgende Interaktionen der übergeordneten Sitzung hinweg.
```

### Background

Gleiche Form wie Fork, mit `invocationKind: 'background'` und `bgEventEmitter` statt `eventEmitter`. TTL beträgt 4h (wie bei Fork — Typregel aus D3).

## Parallele Isolation — das Hauptversprechen

Drei parallele Subagent-Aufrufe aus einer Benutzeranfrage (das Modell sendet 3 AGENT tool_use-Blöcke → `coreToolScheduler.runConcurrently` führt 3 `executeSingleToolCall` parallel aus; jeder öffnet seinen eigenen `qwen-code.tool`-Span pro Phase 2):

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
         └─ ...                               [traceId=T1, may emit hours later]
```

`context.with(span, runX)` für jeden von A, B, C wird parallel ausgeführt. `AsyncLocalStorageContextManager` (bereits automatisch vom NodeSDK in `sdk.ts:273` registriert) begrenzt den Gültigkeitsbereich pro Fiber; es gibt keine Übersprechungen. Jeder untergeordnete LLM-/Tool-/Hook-Span eines Subagenten sieht `span` über `context.active()` innerhalb seiner eigenen asynchronen Kette.

Fork (C) ist ein separater Trace — seine untergeordneten Spans erben `traceId=T1`, selbst wenn sie über mehrere nachfolgende Interaktionen der übergeordneten Sitzung hinweg ausgegeben werden. Eine ARMS-Abfrage nach `session.id` gibt sowohl T0 als auch T1 zurück; der Link vom Root von T1 → aufrufendem `qwen-code.tool`-Span von C bietet eine explizite Navigation.

## Zu ändernde Dateien

| Datei                                                                               | Änderung                                                                                                                                                                                        | LOC geschätzt |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- |
| `packages/core/src/telemetry/constants.ts`                                          | Füge `SPAN_SUBAGENT`, `SPAN_TTL_MS_LONG`, Konstanten für Attributsschlüssel hinzu                                                                                                                | +8            |
| `packages/core/src/telemetry/session-tracing.ts`                                    | Füge `startSubagentSpan` (Vordergrund/verknüpfter-Root-Zweig), `endSubagentSpan`, `runInSubagentSpanContext`, Typen hinzu; erweitere `SpanType`-Union um `'subagent'`; erweitere TTL-Durchlauf um `ttlFor(ctx)` | +120          |
| `packages/core/src/telemetry/log-to-span-processor.ts`                               | Sprungliste, um das Bridging von `qwen-code.subagent_execution` zu umgehen                                                                                                                       | +6            |
| `packages/core/src/telemetry/index.ts`                                              | Neue Helfer + Typen reexportieren                                                                                                                                                                | +6            |
| `packages/core/src/agents/runtime/agent-context.ts`                                 | Füge `depth?: number` zu `AgentContext` + `getCurrentAgentDepth()`-Accessor hinzu                                                                                                                | +12           |
| `packages/core/src/tools/agent/agent.ts`                                            | Ummantle 3 Ausführungspfade (Vordergrund/Fork/Hintergrund) mit `runInSubagentSpanContext` mit try/catch/finally                                                                                  | +60           |
| `packages/core/src/telemetry/session-tracing.test.ts`                               | Neues `describe('subagent spans')`: start/end, child vs linked-root, Kontextweitergabe, Tiefe, TTL pro Typ, idempotentes Ende, NOOP bei nicht initialisiertem SDK                                | +120          |
| `packages/core/src/telemetry/log-to-span-processor.test.ts`                         | Stelle sicher, dass die Sprungliste das Bridging von subagent_execution kurzschließt                                                                                                             | +20           |
| `packages/core/src/tools/agent/agent.test.ts`                                       | Ende-zu-Ende: 3 parallele Subagenten erhalten jeweils einen isolierten Teilbaum; Forks Spans erben neue traceId über Link; Hintergrundlebenszyklus                                                | +80           |
Insgesamt: 9 Dateien, ~430 Codezeilen. Größer als typische Phase-2-Commits, aber gerechtfertigt – die TTL-Änderung betrifft eine separate Datei, der LogToSpanProcessor-Übersprung ist eine separate Datei, und die Testdateien verdoppeln sich. Eine Aufteilung würde eine unvollständige Telemetrieoberfläche hinterlassen.

Falls das Review die Größe beanstandet: Aufteilen in 2 PRs – (A) Telemetrie-Helper + Tests, (B) `agent.ts`-Verdrahtung + E2E-Tests. Die zuerst ausgelieferten Helper ändern das Laufzeitverhalten nicht.

## Teststrategie

| Test                                                                         | Was er beweist                                                  |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `startSubagentSpan foreground parents to active OTel span`                   | Kind-span-Pfad                                                 |
| `startSubagentSpan fork creates new traceId + Link to invoker`               | Verknüpfte-Root-Pfad                                            |
| `runInSubagentSpanContext propagates span through awaits / Promise.all`      | Isolierungsprimitiv                                             |
| `3 concurrent subagent spans don't share children`                           | Wichtigste Nebenläufigkeitsgarantie                             |
| `nested subagent records depth + parentAgentId`                              | Verschachtelungsmetadaten                                       |
| `endSubagentSpan status mapping (completed / failed / cancelled / aborted)`  | Status-Taxonomie                                                |
| `endSubagentSpan dual-emits gen_ai.agent.id + qwen-code.subagent.id`         | Spezifikationskonformer Dual-Emit                               |
| `fork lifecycle: span survives AgentTool.execute return`                     | Fire-and-Forget-Korrektheit                                     |
| `TTL: subagent fork stays past 30min, gets stamped + ended at 4h`            | Typbewusste TTL                                                 |
| `TTL: foreground subagent at 30min gets default sweep`                       | TTL dehnt sich nicht übermäßig aus                              |
| `LogToSpanProcessor skips qwen-code.subagent_execution but still RUM-emits`  | Bridge-Übersprung funktioniert                                  |
| `runConcurrently of 3 agent tool calls produces 3 distinct subagent spans`   | Ende-zu-Ende auf Scheduler-Ebene                                |
| `failed subagent sets exception.message + error.type + SpanStatus=ERROR`     | OTel-Standard-Fehlerpfad                                        |
| `opt-in attrs gated on includeSensitiveSpanAttributes`                       | Wiederverwendung der #4097-Sperre korrekt                       |
| `startSubagentSpan returns NOOP_SPAN when SDK is uninitialized`              | Entspricht Phase 1/2 NOOP-Disziplin; Downstream-Aufrufe bleiben sicher |
| `fork span Link.context matches invoker tool span's spanContext`             | Trace-übergreifende Navigation funktioniert Ende-zu-Ende        |
| `runWithAgentContext auto-increments depth: parent=0, child=1, grandchild=2` | Tiefenbuchhaltung ist korrekt ohne Aufruferkooperation          |

## Randfälle

| Fall                                                                                                                    | Behandlung                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Subagent innerhalb eines Tools innerhalb eines Subagenten (Tiefe > 1)                                                   | `depth`-Attribut verfolgt; empfehle weiches `debugLogger.warn` bei Tiefe ≥ 5 (Endlos-Rekursionserkennung)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Subagent, der während eines übergeordneten Tools `awaiting_approval` erzeugt wird                                       | Subagent-Span ist ein Kind des AGENT-Tool-Spans; das `tool.blocked_on_user` des AGENT-Tools ist ein Geschwister, nicht Eltern – beide Kinder des AGENT-Tool-Spans. Der Baum bleibt korrekt                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `signal.aborted` mitten im Subagenten                                                                                   | Der Callback von `runInSubagentSpanContext` wirft oder löst auf; `finally` setzt `status='aborted'`, SpanStatus UNSET                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Fork noch aktiv, wenn übergeordnete Sitzung endet                                                                       | 4h TTL feuert; Sentinel-Attribute `qwen-code.span.ttl_expired:true`, `qwen-code.subagent.terminate_reason='ttl_swept'`, `status='aborted'`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `endSubagentSpan` zweimal aufgerufen                                                                                    | Idempotent – prüft `activeSpans`-Map; zweiter Aufruf tut nichts (entspricht Phase-2-Muster)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Der LLM-Aufruf des Subagenten verwendet ein anderes Modell als das übergeordnete                                        | `gen_ai.request.model` wird am Subagent-Span gesetzt; der LLM-Request-Unter-Span zeichnet das Modell EBENFALLS auf – kein Konflikt                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Wurf des Vorlaufs eines Schwester-Subagenten entkommt `attemptExecutionOfScheduledCalls`                                | Landet im kürzlich korrigierten `handleConfirmationResponse`-Catch von Phase 2, der AUSSERHALB des try liegt – nicht dem Span des bestätigten Tools zugeordnet. Der Subagent-Span schließt korrekt über sein eigenes try/finally                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Gleichzeitiger Fork + Vordergrund von einem Elternteil                                                                  | Vordergrund erbt T0 traceId, Fork erhält T1. Beide haben unabhängig korrekte Kontextweitergabe. Der übergeordnete Tool-Span endet, wenn seine synchrone Arbeit zurückkehrt; der Fork-Span (separater Trace) lebt weiter                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Fork-Span beginnt im synchronen Ablauf des Aufrufers, aber der Körper läuft später                                      | `startSubagentSpan` wird VOR `void runInForkContext(...)` aufgerufen, sodass der Span (und sein Link zum Aufrufer) erfasst wird, während der spanContext des Aufrufers noch lesbar ist. Die Span-Dauer umfasst daher jede Mikrotask-Queue-Planungsverzögerung, bevor der Körper tatsächlich startet – typischerweise sub-ms; falls die Produktion nicht-triviale Lücken zeigt, kann ein separates Attribut `qwen-code.subagent.scheduling_delay_ms` hinzugefügt werden (offene Frage)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| SDK nicht initialisiert (Telemetrie deaktiviert)                                                                        | `startSubagentSpan` gibt früh NOOP_SPAN zurück (entspricht jedem anderen Phase-1/2-Helper). `runInSubagentSpanContext(NOOP_SPAN, fn)` ruft `fn` weiterhin normal auf. `endSubagentSpan(NOOP_SPAN, …)` tut nichts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Die Log-Bridge-Spans des Forks (`tool_call`, `api_request`, usw.) verwenden die von der Sitzung abgeleitete traceId, während die nativen Spans des Forks T1 verwenden | Bestehendes Verhalten – Log-Bridge-Spans verwenden immer `deriveTraceId(sessionId)`, native Spans verwenden OTel-Kontext. Die Abweichung ist innerhalb eines Traces unsichtbar, bedeutet aber, dass eine ARMS-by-traceId-Suche auf T1 die Log-Bridge-Kinder des Forks nicht enthält. Außerhalb des Rahmens dieses PRs; als offene Frage #5 benannt                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Die Eltern der Hook-Spans von `SubagentStart` im Vordergrund vs. Hintergrund unterscheiden sich                         | Vordergrund feuert `fireSubagentStartEvent` innerhalb von `runSubagentWithHooks` → bereits innerhalb von `runInSubagentSpanContext`, daher sind die Eltern der Hook-Spans unter `qwen-code.subagent`. Hintergrund feuert es VOR der `runWithSubagentSpan`-Ummantelung (der Subagent-Span existiert noch nicht), daher sind seine Hook-Span-Eltern unter dem AGENT `qwen-code.tool`. Operatoren, die nach "Hook-Spans unter Subagent-Spans" suchen, sollten erwarten, dass bg `SubagentStart` in dieser Ansicht fehlt. Das Verschieben des bg-Hook-Feuerns innerhalb von `framedBgBody` ist mechanisch einfach (die `contextState`-Mutation erreicht `bgSubagent.execute` sowieso), ändert aber die benutzersichtbare Semantik: Heute feuert der Hook synchron vor der Rückkehr von `AgentTool.execute` mit der Nachricht "Background agent launched", sodass jede synchrone Einrichtungsarbeit des Hooks innerhalb des benutzerblockierenden Turns stattfindet; das Verschieben bewirkt, dass der Hook getrennt feuert, nachdem die Startnachricht zurückgegeben wurde. Zurückgestellt bis eine absichtliche Entscheidung getroffen ist, welche Semantik bevorzugt wird. |
## Rollback

Die Änderung ist auf OTel-Ebene additiv – bestehende Dashboards, die nicht nach subagent-bezogenen Spannamen filtern, funktionieren weiterhin. Trace-Verbraucher, die nach Parent-Span gruppieren, sehen neue `qwen-code.subagent`-Knoten zwischen `qwen-code.tool` und `qwen-code.llm_request`; dies in den Release Notes dokumentieren.

Die verhaltensändernde Änderung ist das Überspringen des LogToSpanProcessor – Dashboards, die zuvor den `qwen-code.subagent_execution`-Span konsumiert haben, geben null zurück. Abhilfe: Das LogRecord intakt lassen (RUM + Metriken sehen es weiterhin); nur die Span-Bridge wird entfernt. Bestehende logbasierte Abfragen sind nicht betroffen.

Rücknahme-Pfad: Den einzelnen PR rückgängig machen. Die neuen Span-Helfer werden nur von `agent.ts` aufgerufen; das Entfernen der Verkabelung + das Überspringen des LogToSpanProcessor stellt das vorherige Verhalten 1:1 wieder her.

## Sampling implications

| Aufruf                                          | Quelle der Sampling-Entscheidung                                                    |
| ----------------------------------------------- | ----------------------------------------------------------------------------------- |
| `foreground` (child span, same traceId)          | Erbt die Entscheidung, ob der Parent-Trace gesampelt wurde oder nicht, über den parent-basierten Sampler |
| `fork` / `background` (linked root, new traceId) | Unabhängige Sampling-Entscheidung bei der Root-Erstellung                           |

Für die aktuelle Standardeinstellung von qwen-code (gemäß `tracer.ts:shouldForceSampled()` — parentbased + always_on sonst always_on) wird jeder Span gesampelt, sodass die Abweichung nicht zuschlägt. Für Bereitstellungen mit probabilistischen Samplern (z.B. `traceidratio=0.1`) bedeutet dies:

- Ein Benutzer-Prompt kann gesampelt werden (T0 vollständig erfasst), aber sein Fork (T1) kann verworfen werden, oder umgekehrt.
- Betreiber, die den Parent T0 lesen, sehen "Link: subagent C (T1)" — ein Klick kann zu einem 404 führen, wenn T1 nicht gesampelt wurde.

Abhilfe: Für Betreiber dokumentieren. Wenn die vollständige Erfassung des Subagents wichtig ist, Sampling für Fork/Background über einen zukünftigen Konfigurationsknopf erzwingen. Hier nicht relevant.

## Sensitive attributes (#4097 integration)

Das bestehende `includeSensitiveSpanAttributes`-Gate wiederverwenden. Wenn true, auf dem Subagent-Span an Lifecycle-Hooks setzen, wo die Daten verfügbar sind:

| Spez-Attribut                 | Quelle                                                    | Wann gesetzt                                                                                              |
| ----------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `gen_ai.system_instructions`  | gerenderter System-Prompt aus `agentConfig` / Parent-Kontext | `startSubagentSpan` (falls vor Spanneröffnung verfügbar) oder über `setAttributes` früh im Body            |
| `gen_ai.tool.definitions`     | Tool-Deklarationen, die dem Subagenten zur Verfügung stehen | wie oben                                                                                                   |
| `gen_ai.input.messages`       | anfängliche Eingabe, die an den Subagenten übergeben wird (Prompt + extraHistory) | am Anfang des Bodys                                                                                        |
| `gen_ai.output.messages`      | endgültige Antwortnachrichten, die vom Subagenten zurückgegeben werden | in den `endSubagentSpan`-Metadaten                                                                          |

Diese sind alle bereits gegated; #4097's Muster ist es, den `addSubagentSensitiveAttributes(span, opts)`-Helfer innerhalb des Bodys aufzurufen. Implementierungsdetail – das Design notiert nur den Integrationspunkt.

## Ablaufplanung

- Unabhängig von #4367 (Ressourcenattribute – in Prüfung). Keine Reihenfolgebeschränkung beim Mergen, aber `gen_ai.conversation.id` auf Subagent-Spans profitiert davon, dass #4367 `session.id` von der Ressource entfernt hat. **Empfehlung: #4367 zuerst landen**, damit die `getSessionId()`-Quelle der Wahrheit festgelegt ist.
- Unabhängig von Phase 4 (LLM-Anfragenzerlegung / TTFT). Phase 4 hängt an `qwen-code.llm_request`-Spans, unabhängig davon, ob sie unter einem Subagenten oder einer Interaktion liegen. Empfehlung: Phase 3 vor Phase 4, damit die Metriken pro Versuch von Phase 4 pro Subagent aggregiert werden können.

## Offene Fragen

1. **`gen_ai.provider.name`**: Die Spezifikation verlangt es, beschreibt es aber für den LLM-Anbieter, nicht für das Agent-Framework. Die Setzung auf `'qwen-code'` ist die beste Interpretation; falls eine zukünftige Spezifikationsrevision eine `agent.provider.name`-Variante hinzufügt, sollten wir wechseln.
2. **Spanname `qwen-code.subagent` vs. Spezifikation `invoke_agent {name}`**: Wir haben uns für interne Konsistenz entschieden. Falls die Akzeptanz von GenAI-fähigen Tools wächst und `invoke_agent ${name}` für die automatische Erkennung kritisch wird, können wir wechseln – der Spanname ist das am einfachsten umzubenennende Element in OTel.
3. **Soft-Warnung bei Tiefe ≥ 5**: Willkürliche Zahl. Könnte ein Konfigurationsknopf sein. Zurückstellen, bis Produktionsdaten einen Bedarf zeigen.
4. **`SubagentExecutionEvent.result`'s vollständige LLM-Ausgabe ist groß**: Heutzutage bläht es das LogRecord-Volumen auf. Der Migrationsplan (LogRecord → Span Events) ist zurückgestellt, aber lohnenswert, sobald die Token-Nutzungsaggregation in Phase 4 landet.
5. **Log-Bridge-Spans innerhalb eines Forks landen auf der session-abgeleiteten traceId, nicht auf dem Fork-T1**: Siehe Randfälle. Die Behebung ist das breitere Problem "Interaktions-Span erbt nicht den Session-Root-Kontext", das im Thread sessionId-vs-traceId aufgeworfen wurde – ein separates Design, das alle nativen Spans betrifft, nicht nur Subagent. Nicht im Rahmen.
