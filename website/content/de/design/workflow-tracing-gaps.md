# Workflow-Level-Span-Granularitätsanalyse (P1)

> Basierend auf der Überprüfung von qwen-code origin/main vom 2026-05-13

## Aktueller Stand

qwen-code verfügt bereits über eine Tracing-Infrastruktur:

| Komponente           | Position                                           | Beschreibung                                                  |
| -------------------- | -------------------------------------------------- | ------------------------------------------------------------- |
| Span-Typdefinitionen | `packages/core/src/telemetry/session-tracing.ts`   | `interaction`, `llm_request`, `tool`, `tool.execution`        |
| Tracer-Werkzeuge     | `packages/core/src/telemetry/tracer.ts`            | Session-Root-Context, `withSpan`, `startSpanWithContext`      |
| Interaktions-Einstieg| `packages/core/src/core/client.ts`                 | Top-Level-Interaktion startet explizit einen `interaction` Span |
| Lebenszyklus-Management | —                                                 | AsyncLocalStorage + WeakRef + TTL-Cleanup                    |

Aktuell stabil in der Runtime eingebunden sind hauptsächlich zwei Arten von generischen Spans:

- `api.generateContent` / `api.generateContentStream`
- `tool.<toolName>`

**Fazit: Die Phase „Tracing-Backbone vorhanden“ ist erreicht, aber die Phasengrenzen des Agenten-Workflows sind noch nicht vollständig im Trace-Baum kodiert.**

### Vergleich: Bereits implementierte Span-Typen in claude-code

Referenz: `claude-code/src/utils/telemetry/sessionTracing.ts` (Zeile 49):

- `interaction`
- `llm_request`
- `tool`
- `tool.blocked_on_user`
- `tool.execution`
- `hook`

## Fehlende Elemente

| Fehlender Span / Mechanismus                    | Auswirkung                                         |
| ----------------------------------------------- | -------------------------------------------------- |
| `permission_wait` / `blocked_on_user` Span      | Keine Unterscheidung zwischen Genehmigungswartezeit vs. Tool-Ausführungszeit |
| `hook` Span                                     | Hook-Ausführungszeit wird in den Tool-Span eingefaltet, Grenzverlauf unklar |
| `subagent` Root-Span                            | Interne LLM/Tool-Aufrufe des Subagenten können keinen Trace-Unterbaum bilden |
| Tatsächliche Verdrahtung von `tool.execution`   | Helper definiert, aber in der Hauptkette nicht aufgerufen |
| Stabile Parent-Child-Verdrahtung                | Spans sind meist Geschwister unter dem Session-Root statt einer Hierarchieebene |

## Detailanalyse

### 1. Benutzergenehmigungswartezeit nicht im Trace

Wenn ein Tool-Aufruf auf Genehmigung wartet, durchläuft der Status den Pfad `awaiting_approval` → `scheduled` → Ausführung.

- „Warten auf Benutzerbestätigung“ ist nur ein Statusübergang, kein Trace-Knoten
- Die Wartezeit auf Genehmigung ist im Trace nicht sichtbar
- Bei langsamen Tools kann nicht unterschieden werden, ob es „auf den Benutzer wartet“ oder „das Tool selbst langsam ist“

### 2. Hook-Ereignisaufzeichnung, aber kein eigener Span

Prä-/Post-Hook-Ausführungen erzeugen ein `HookCallEvent` über `logHookCall()`, jedoch keinen eigenständigen OTel-Span.

- Wenn ein Hook langsam ist, erscheint dies als langsamer äußerer Tool-Span
- Wenn ein Hook fehlschlägt, erscheint dies als „Tool-Fehler“
- Der Trace kann nicht beantworten, „ob die Zeit im Hook oder in der Tool-Ausführung verbracht wurde“

### 3. Subagent als Log/Metric, nicht als Trace-Unterbaum

Start/Ende eines Subagenten werden als `SubagentExecutionEvent` aufgezeichnet und in Log/Metric verarbeitet, aber es wird kein expliziter Span-Unterbaum gebildet.

- Es kann gezählt werden, „welcher Subagent ausgeführt wurde“
- Es kann nicht im Trace nachvollzogen werden, „welche LLM/Tool-Aufrufe dieser Subagent ausgelöst hat“
- Bei parallelen Subagenten ist die Kausalkette unklar

### 4. `tool.execution` Helper definiert, aber nicht in der Hauptkette eingebunden

`session-tracing.ts` enthält bereits `startToolExecutionSpan()` / `endToolExecutionSpan()`, aber in Nicht-Test-Code gibt es keine Aufrufstelle.

Aktueller tatsächlicher Trace-Baum:

```
session-root
  interaction
    api.generateContent
    tool.Bash
  subagent_execution        (log/metric)
  hook_call                 (event/QwenLogger)
```

Idealer Trace-Baum:

```
interaction
  llm_request
    tool
      tool.blocked_on_user
      hook(pre)
      tool.execution
      hook(post)
  subagent
    interaction
      llm_request
        tool
```

### 5. Parent-Child-Verdrahtung nicht stabil genug

Der `interaction` Span ist vorhanden, aber viele aktive Spans hängen als Geschwister unter dem Session-Root statt als Kinder des `interaction` Spans.

- Aufrufbaum ist flach
- Kausalbeziehungen zwischen Knoten sind nicht intuitiv
- Die Nachverfolgung von einem Benutzerdurchlauf zu internen LLM/Tool/Hook/Subagent-Aufrufen ist nicht durchgängig

## Auswirkungen

- Traces haben grundlegenden Wert, reichen aber nicht für Worklevel-Fehlerdiagnose
- Kann nicht direkt beantworten: „Diese Runde war langsam wegen Warten auf Benutzer, Hook oder tatsächlicher Tool-Ausführung?“
- Kann den Ausführungsprozess eines Subagenten nicht als lesbaren Trace-Unterbaum darstellen
- Hook-Probleme werden in den Tool-Span eingefaltet, Grenzverlauf unklar
- Der Baum in Jaeger / Tempo / ARMS ist flacher und schwerer zu lesen als bei claude-code

---

## Analyse zur Wiederverwendung des claude-code-Ansatzes

> Basierend auf einem detaillierten Vergleich des claude-code-Quellcodes vom 2026-05-13

### Tracing-Architektur von claude-code

claude-code implementiert in `src/utils/telemetry/sessionTracing.ts` ein **einheitliches, auf zwei ALS basierendes Span-Managementsystem**:

```
                    interactionContext (ALS)          toolContext (ALS)
                          │                                │
                          ▼                                ▼
              ┌─────────────────────┐           ┌─────────────────────┐
              │  interaction span   │           │    tool span        │
              │  (session root)     │           │  (child of intxn)   │
              └─────────────────────┘           └─────────────────────┘
                   ▲ parent of                       ▲ parent of
                   │                                 │
           ┌───────┴───────┐              ┌──────────┼──────────┐
           │               │              │          │          │
      llm_request      tool          blocked    execution    hook
                                     _on_user
```

**Kernmechanismen:**

| Mechanismus       | Implementierung                                                                                                                                                                                      |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Zwei ALS          | `interactionContext` speichert den aktuellen interaction Span; `toolContext` speichert den aktuellen tool Span                                                                                       |
| Parent-Auflösung  | Jeder Span-Typ codiert fest, aus welchem ALS der Parent bezogen wird: `llm_request`/`tool` beziehen aus `interactionContext`; `blocked_on_user`/`execution`/`hook` beziehen aus `toolContext`; `hook` hat Fallback auf `interactionContext` |
| Lebenszyklus      | `enterWith` injizieren → Span läuft → `enterWith(undefined)` löschen                                                                                                                                |
| Span-Findung      | Nicht im ALS gespeicherte Spans (z. B. `blocked_on_user`) werden über die `activeSpans` Map anhand von `span.type` zurückgesucht                                                                        |
| Speichermanagement| Vom ALS gehaltene Spans verwenden WeakRef; nicht im ALS gehaltene Spans verwenden strongRef gegen GC; TTL 30min automatische Bereinigung                                                            |

**Vollständiger Lebenszyklus eines claude-code tool Spans** (`toolExecution.ts`):

```
startToolSpan(name, attrs)                    // → toolContext.enterWith(spanCtx)
  startToolBlockedOnUserSpan()                // → parent = toolContext.getStore()
    [permission resolution / user prompt]
  endToolBlockedOnUserSpan(decision, source)
  startToolExecutionSpan()                    // → parent = toolContext.getStore()
    [tool.call()]
  endToolExecutionSpan({ success })
endToolSpan(result)                           // → toolContext.enterWith(undefined)
```

**claude-code hook Span** (`hooks.ts`):

```
startHookSpan(event, name, count, defs)       // → parent = toolContext ?? interactionContext
  [parallel hook execution]
endHookSpan(span, { success, blocking, ... })
```

### qwen-code Aktuelle Architektur vs. claude-code

#### Grundlegender Unterschied: Zwei getrennte Span-Erstellungspfade

Dies ist das derzeit kritischste Architekturproblem von qwen-code:

| Schicht            | Datei                | Verwendung                                                                                     | Parent-Auflösung                                               |
| ------------------ | -------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| session-tracing    | `session-tracing.ts` | `startInteractionSpan` / `startLLMRequestSpan` / `startToolSpan` / `startToolExecutionSpan`   | Explizit aus dem `interactionContext` ALS                      |
| tracer             | `tracer.ts`          | `withSpan` / `startSpanWithContext`                                                            | Aus `context.active()`, Fallback auf Session-Root              |

**Tatsächliche Aufrufsituation in der Runtime:**

- `startInteractionSpan` → **bereits eingebunden** (`client.ts` Zeile 956), schreibt in `interactionContext` ALS
- `startLLMRequestSpan` / `endLLMRequestSpan` → **nicht eingebunden**, Runtime verwendet `withSpan('api.generateContent', ...)` (in `loggingContentGenerator.ts`)
- `startToolSpan` / `endToolSpan` → **nicht eingebunden**, Runtime verwendet `withSpan('tool.${name}', ...)` (in `coreToolScheduler.ts`)
- `startToolExecutionSpan` / `endToolExecutionSpan` → **nicht eingebunden**

**Konsequenz:**

`withSpan`‘s `getParentContext()` prüft zuerst `context.active()` (OTel-nativen Context). Wenn kein aktiver Span vorhanden ist, wird auf den Session-Root-Context zurückgegriffen. Es **liest überhaupt nicht** den `interactionContext` ALS aus.

Daher werden interaction Span und LLM/Tool Spans zu **gleichrangigen Geschwistern** unter dem Session-Root, nicht als Parent-Child-Baum:

```
session-root
  ├── interaction         (aus session-tracing, schreibt in interactionContext ALS)
  ├── api.generateContent (aus withSpan, liest interactionContext nicht → hängt an session root)
  ├── tool.Bash           (aus withSpan, wie oben)
  └── tool.Read           (aus withSpan, wie oben)
```

**In claude-code gibt es dagegen nur einen einzigen Span-Erstellungspfad (`sessionTracing.ts`). Alle Spans durchlaufen dieselbe ALS → OTel-Context-Konvertierungslogik, daher ist der Baum vollständig.**

#### Bewertung der Wiederverwendbarkeit im Einzelnen

##### 1. Zwei ALS + explizite Parent-Auflösung — Wiederverwendbar, Kern der Reparatur

| Dimension       | claude-code                                           | qwen-code                                   |
| --------------- | ----------------------------------------------------- | ------------------------------------------- |
| Anzahl ALS      | 2 (`interactionContext` + `toolContext`)              | 1 (`interactionContext`, kein `toolContext`)|
| Parent-Auflösung | Jeder Span-Typ gibt explizit an, aus welchem ALS der Parent bezogen wird | `withSpan` verwendet einheitlich `context.active()` |
| Context-Injektion | `trace.setSpan(otelContext.active(), parentCtx.span)` | `withSpan` intern durch `startActiveSpan` implizit |

**Wiederverwendungsschema:**

qwen-code‘s `session-tracing.ts` implementiert bereits ein **nahezu identisches Parent-Auflösungsmuster** wie claude-code:

```typescript
// qwen-code session-tracing.ts (bereits vorhanden, aber nicht verwendet)
export function startLLMRequestSpan(model, promptId): Span {
  const parentCtx = interactionContext.getStore();
  const ctx = parentCtx
    ? trace.setSpan(otelContext.active(), parentCtx.span)
    : otelContext.active();
  // ...
}
```

Dieser Code stimmt **vollständig** mit der Logik von claude-codes `startLLMRequestSpan` überein.

**Kernreparaturpfad:** Ersetze die `withSpan('api.*')` / `withSpan('tool.*')` Aufrufe in der Runtime durch Aufrufe der typisierten Helper aus session-tracing. Die session-tracing-Schicht muss nicht neu geschrieben werden – ihre API ist bereits einsatzbereit.

Neu hinzugefügt werden müssen nur:

- Ein `toolContext` ALS (analog zu claude-code)
- `blocked_on_user` und `hook` Span-Typen sowie dazugehörige Helper-Funktionen

##### 2. tool.blocked_on_user — Anpassung an den Genehmigungsablauf erforderlich

| Dimension       | claude-code                                | qwen-code                                                                  |
| --------------- | ------------------------------------------ | -------------------------------------------------------------------------- |
| Genehmigungsort | Innerhalb von `toolExecution.ts`, innerhalb des tool Spans | Innerhalb von `coreToolScheduler._schedule()`, vor dem tool Span           |
| Genehmigungsmodus | Synchrones Warten auf `resolveHookPermissionDecision()` | Zustandsmaschinengesteuert: `validating` → `awaiting_approval` → `scheduled` → `executing` |
| Span-Abdeckung  | tool Span enthält blocked + execution       | tool Span(`withSpan`) enthält nur execution (beginnt bei `executeSingleToolCall`) |

**Kernunterschied:** qwen-codes `executeSingleToolCall`-Einstieg prüft erst, ob `toolCall.status !== 'scheduled'` ist – das bedeutet, die Genehmigung ist bei Aufruf bereits abgeschlossen. Der tool Span mit `withSpan` umfasst die Wartezeit auf Genehmigung nicht.

**Anpassungsschema (zwei Optionen):**

**Option A — Tool-Span-Start vorverlegen (empfohlen):**

Verschiebe den `startToolSpan`-Aufruf von `executeSingleToolCall` in `_schedule` vor die Genehmigungsprüfung, sodass der tool Span den gesamten Lebenszyklus abdeckt. Beim Eintritt in den Status `awaiting_approval` wird `startToolBlockedOnUserSpan` aufgerufen, beim Abschluss der Genehmigung (`scheduled`) wird `endToolBlockedOnUserSpan` aufgerufen.

```
_schedule():
  startToolSpan(name)                         // ← neu
    startToolBlockedOnUserSpan()              // ← neu, bei Eintritt in awaiting_approval
      [Zustandsmaschine wartet]
    endToolBlockedOnUserSpan(decision)        // ← neu, bei Eintritt in scheduled
executeSingleToolCall():
    startToolExecutionSpan()                  // ← bestehenden Helper einbinden
      [hook + execute]
    endToolExecutionSpan()
  endToolSpan()                               // ← muss in finally erfolgen
```

**Option B — Tool-Span-Position beibehalten, Genehmigung separat verfolgen:**

Erstelle in `_schedule` einen eigenständigen `approval_wait` Span (nicht als Kind des tools), der unter dem interaction hängt. Vorteil: geringere Änderungen. Nachteil: Inkonsistenz mit claude-code-Modell, schlechtere Lesbarkeit des Trace-Baums.

**Option A wird empfohlen**, da:

- Konsistenz mit dem Trace-Baum von claude-code
- Ein einzelner tool-Knoten im Trace zeigt sowohl „Wartezeit“ als auch „Ausführungszeit“
- Der zustandsmaschinengesteuerte Ablauf beeinflusst nur den Auslösezeitpunkt von Span-Start/Ende, nicht die Parent-Child-Modellierung

##### 3. hook Span — Direkt wiederverwendbar

| Dimension       | claude-code                         | qwen-code                                                            |
| --------------- | ----------------------------------- | -------------------------------------------------------------------- |
| Hook-Einstieg   | `executeHooks()` in `hooks.ts`      | `firePreToolUseHook`/`firePostToolUseHook` über `hookEventHandler.ts` |
| Aktuelle Aufzeichnung | OTel Span + Perfetto Span         | `HookCallEvent` → `QwenLogger` (kein OTel)                          |
| Parent          | `toolContext ?? interactionContext` | —                                                                    |

**Wiederverwendungsschema:**

1. Füge in `session-tracing.ts` `startHookSpan` / `endHookSpan` hinzu (parent = `toolContext ?? interactionContext`, identisch zu claude-code)
2. Rufe in `coreToolScheduler.ts`‘s `executeSingleToolCall` vor/nach dem pre/post Hook die Hook-Span-Helper auf
3. Behalte die bestehende `logHookCall` Ereignisaufzeichnung bei (beide parallel, nicht exklusiv)

Geringer Änderungsaufwand, beeinträchtigt nicht die bestehende Hook-Logik.

##### 4. tool.execution — Helper vorhanden, nur Verdrahtung erforderlich

qwen-codes `startToolExecutionSpan(parentToolSpan)` / `endToolExecutionSpan(span, metadata)` sind bereits vollständig implementiert. Sie müssen nur in `executeSingleToolCall` aufgerufen werden:

```typescript
// coreToolScheduler.ts executeSingleToolCall intern
const toolSpan = startToolSpan(toolName, attrs);
// ... hook pre ...
const execSpan = startToolExecutionSpan(toolSpan);
try {
  // ... invocation.execute() ...
  endToolExecutionSpan(execSpan, { success: true });
} catch (e) {
  endToolExecutionSpan(execSpan, { success: false, error: e.message });
}
// ... hook post ...
endToolSpan(toolSpan);
```

Hinweis: qwen-codes `startToolExecutionSpan` erhält einen expliziten `parentToolSpan` Parameter, während claude-code ihn implizit aus dem `toolContext` ALS bezieht. Das beeinträchtigt die Funktionalität nicht, es ist nur ein Stilunterschied. Falls ein `toolContext` ALS eingeführt wird, kann auf implizite Bezugnahme umgestellt werden.

##### 5. Subagent-Trace-Baum — Beide Seiten unvollständig, direkte Übernahme nicht empfohlen

| Dimension            | claude-code                                                             | qwen-code                                            |
| -------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------- |
| OTel Trace-Ausbreitung | **Keine** — Subagent-Interaktion ist neue Root                        | **Keine** — Subagent hat keine explizite Trace-Ausbreitung |
| Identitätsverknüpfung | Perfetto-Metadaten (Agent Process/Thread) + `teammateContextStorage` ALS | `subagentNameContext` ALS + `SubagentExecutionEvent` |
| Parallelitätsisolierung | OTel ALS hat Leckrisiko (`enterWith` ist prozessweit, parallele Subagenten überschreiben sich gegenseitig) | Gleiches Risiko |

claude-code hat das Subagent-OTel-Tracing **selbst nicht gut gelöst**:

- `interactionContext.enterWith()` ist prozessweit, parallele Subagenten überschreiben gegenseitig ihre ALS-Werte
- Echte Agent-Hierarchieebenen existieren nur in Perfetto (einem Anthropic-internen, feature-flagged System), nicht in OTel

**Empfehlung:**

- Kurzfristig: Bestehendes `subagentNameContext` + Ereignisprotokollschema beibehalten
- Mittelfristig: Beim Start eines Subagenten einen `subagent` Span erstellen (parent = aktueller `toolContext`) und `context.with()` statt `enterWith()` verwenden, um die OTel-Context-Isolierung paralleler Subagenten zu gewährleisten
- Dies ist ein eigenständig zu entwerfender Arbeitspunkt, eine direkte Übernahme von claude-code wird nicht empfohlen

##### 6. LLM Request Span — Klarer Pfad

qwen-code verwendet derzeit in `loggingContentGenerator.ts` `withSpan('api.generateContent', ...)` und `startSpanWithContext('api.generateContentStream', ...)`.

Ersetzen durch den Aufruf von `startLLMRequestSpan` / `endLLMRequestSpan` (in der session-tracing-Schicht bereits implementiert) ist ausreichend. Bei Streaming-Szenarien ist Folgendes zu beachten:

- `startLLMRequestSpan` gibt ein `Span`-Objekt zurück
- Muss manuell durch `endLLMRequestSpan(span, metadata)` abgeschlossen werden
- Dies ist kompatibel mit dem manuellen Verwaltungsmodus von `startSpanWithContext`

### Zusammenfassung der Wiederverwendung

| Änderungsposten                                                                 | Wiederverwendbarkeit                        | Änderungsaufwand                               | Priorität |
| ------------------------------------------------------------------------------- | ------------------------------------------- | ---------------------------------------------- | --------- |
| Vereinheitlichung des Span-Erstellungspfads (Runtime `withSpan` durch session-tracing Helper ersetzen) | **Kernreparatur** – behebt Parent-Child-Bruch | Mittel (~5 Aufrufstellen)                      | P0        |
| Neuer `toolContext` ALS                                                         | Direkte Übernahme von claude-code-Muster    | Niedrig (innerhalb von session-tracing.ts)     | P0        |
| tool.blocked_on_user Span                                                       | Option A erfordert Anpassung an Zustandsmaschine | Mittel (Koordination zwischen _schedule + executeSingleToolCall) | P1        |
| tool.execution Verdrahtung                                                      | Helper vorhanden, nur Aufruf erforderlich   | Niedrig (3 Zeilen in executeSingleToolCall)    | P1        |
| hook Span                                                                       | Neuer Helper + Aufrufstelle                 | Niedrig                                        | P1        |
| LLM Request Span-Umstellung                                                     | withSpan durch typisierten Helper ersetzen  | Niedrig (2 Aufrufstellen)                      | P1        |
| Subagent-Trace-Baum                                                             | **Direkte Übernahme nicht empfohlen** – eigenständiges Design erforderlich | Hoch | P2        |

### Empfohlene Implementierungsreihenfolge

```
Phase 1 — Trace-Baumstruktur reparieren (P0)
├── 1a. session-tracing.ts: Neuer toolContext ALS + blocked_on_user / hook Span Helper
├── 1b. loggingContentGenerator.ts: withSpan → startLLMRequestSpan/endLLMRequestSpan
└── 1c. coreToolScheduler.ts: withSpan → startToolSpan/endToolSpan

Phase 2 — Workflow-Spans ergänzen (P1)
├── 2a. coreToolScheduler._schedule: blocked_on_user Span einbinden
├── 2b. coreToolScheduler.executeSingleToolCall: tool.execution Span einbinden
└── 2c. Hook pre/post Aufrufstellen: hook Span einbinden

Phase 3 — Subagent-Trace-Baum (P2)
├── 3a. context.with() Isolierungsschema entwerfen (Ersatz für enterWith)
├── 3b. Beim Subagent-Start einen Subagent-Root-Span erstellen
└── 3c. Szenario mit parallelen Subagenten validieren
```