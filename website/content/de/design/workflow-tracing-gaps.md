# Workflow-Span-Granularitätsanalyse (P1)

> Basierend auf dem Review von qwen-code origin/main vom 13.05.2026

## Aktueller Stand

qwen-code verfügt bereits über eine Tracing-Infrastruktur:

| Komponente       | Position                                           | Beschreibung                                                    |
| ---------------- | -------------------------------------------------- | --------------------------------------------------------------- |
| Span-Typdef.     | `packages/core/src/telemetry/session-tracing.ts`   | `interaction`, `llm_request`, `tool`, `tool.execution`          |
| Tracer-Werkzeug  | `packages/core/src/telemetry/tracer.ts`            | Session-Root-Context, `withSpan`, `startSpanWithContext`        |
| Interaktions-Einstieg | `packages/core/src/core/client.ts`             | Top-Level-Interaktion startet explizit einen `interaction`-Span |
| Lebenszyklus-Verwaltung | –                                             | AsyncLocalStorage + WeakRef + TTL-Bereinigung                   |

Derzeit sind in der Laufzeit stabil vor allem zwei Arten von generischen Spans angebunden:

- `api.generateContent` / `api.generateContentStream`
- `tool.<toolName>`

**Fazit: Es wurde das Stadium „Tracing-Grundgerüst vorhanden“ erreicht, aber die Phasengrenzen des Agent-Workflows sind noch nicht vollständig in den Trace-Baum eingebettet.**

### Vergleich: Bereits implementierte Span-Typen bei claude-code

Referenz `claude-code/src/utils/telemetry/sessionTracing.ts` (Zeile 49):

- `interaction`
- `llm_request`
- `tool`
- `tool.blocked_on_user`
- `tool.execution`
- `hook`

## Fehlende Elemente

| Fehlender Span / Mechanismus                     | Auswirkung                                           |
| ------------------------------------------------ | ---------------------------------------------------- |
| `permission_wait` / `blocked_on_user`-Span       | Keine Unterscheidbarkeit von Genehmigungswartezeit vs. Tool-Ausführungszeit |
| `hook`-Span                                      | Hook-Laufzeit wird in den Tool-Span gefaltet, Abgrenzung unklar |
| `subagent`-Root-Span                             | LLM/Tool-Aufrufe innerhalb eines Subagenten bilden keinen Trace-Subbaum |
| Tatsächliche Anbindung von `tool.execution`      | Helper definiert, aber Hauptkette ruft ihn nicht auf  |
| Stabile Parent-Child-Verdrahtung                 | Spans sind meist Geschwister unter Session-Root statt hierarchischer Baum |

## Einzelanalyse

### 1. Benutzerfreigabewartezeit nicht im Trace

Wenn ein Tool auf Freigabe wartet, durchläuft der Status den Pfad `awaiting_approval` → `scheduled` → Ausführung.

- „Warten auf Benutzerbestätigung“ ist nur ein Statusübergang, kein Trace-Knoten
- Im Trace ist die Wartezeit auf Freigabe nicht sichtbar
- Bei langsamen Tools kann nicht unterschieden werden, ob „auf den Benutzer gewartet“ oder „das Tool selbst langsam“ war

### 2. Hook hat Ereignisaufzeichnung, aber keinen eigenen Span

Nach Ausführung von Pre/Post-Hooks wird ein `HookCallEvent` erzeugt und über `logHookCall()` protokolliert, aber es wird kein eigener OTel-Span angelegt.

- Wenn ein Hook langsam ist, erscheint dies als verlängerte Laufzeit des äußeren Tool-Spans
- Bei Hook-Fehlern erscheint dies als „Tool-Fehler“
- Der Trace kann nicht beantworten „Zeit in Hook oder in tool.execution verbracht“

### 3. Subagent ist Log/Metrik, kein Trace-Subbaum

Beim Start/Abschluss eines Subagenten wird ein `SubagentExecutionEvent` aufgezeichnet und in Log/Metrik übernommen, aber es wird kein expliziter Span-Subbaum gebildet.

- Es ist nachvollziehbar, „welcher Subagent lief“
- Es kann nicht anhand des Traces verfolgt werden, „welche LLM/Tool-Aufrufe dieser Subagent ausgelöst hat“
- Bei parallelen Subagenten ist die Kausalkette unklar

### 4. tool.execution-Helper definiert, aber nicht in Hauptkette eingebunden

In `session-tracing.ts` sind `startToolExecutionSpan()` / `endToolExecutionSpan()` bereits vorhanden, aber in Nicht-Testcode wurden keine Aufrufstellen gefunden.

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

Der interaction-Span existiert bereits, aber viele laufende Spans hängen als Geschwister unter dem Session-Root, nicht als Kinder des interaction-Spans.

- Aufrufbaum ist flach
- Kausalbeziehungen zwischen Knoten sind nicht intuitiv
- Die Nachverfolgung von einer Benutzerrunde zu den internen llm/tool/hook/subagent-Aufrufen ist nicht durchgängig

## Auswirkungen

- Traces haben grundlegenden Wert, reichen aber nicht für die Worklevel-Fehlerdiagnose
- Es kann nicht direkt beantwortet werden: „Diese Runde war langsam wegen Warten auf Benutzer, Hook oder tatsächlicher Tool-Ausführung?“
- Die Ausführung eines Subagenten kann nicht als lesbarer Trace-Subbaum rekonstruiert werden
- Hook-Probleme werden in den Tool-Span gefaltet, Abgrenzung unklar
- Der Baum in Jaeger / Tempo / ARMS ist flacher und schwerer lesbar als bei claude-code

---

## Wiederverwendbarkeitsanalyse des claude-code-Ansatzes

> Basierend auf einem detaillierten Vergleich mit dem claude-code-Quellcode vom 13.05.2026

### Tracing-Architektur von claude-code

claude-code implementiert in `src/utils/telemetry/sessionTracing.ts` ein **einheitliches, auf zwei ALS basierendes Span-Management-System**:

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

| Mechanismus      | Implementierung                                                                                                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Doppel-ALS       | `interactionContext` speichert den aktuellen interaction-Span; `toolContext` speichert den aktuellen tool-Span                                                                                         |
| Parent-Auflösung | Jeder Span-Typ hat fest codiert, aus welchem ALS der Parent stammt: `llm_request`/`tool` holen sich Parent aus `interactionContext`; `blocked_on_user`/`execution`/`hook` aus `toolContext`; `hook` hat Fallback auf `interactionContext` |
| Lebenszyklus     | enterWith injectieren → Span läuft → enterWith(undefined) löschen                                                                                                                                    |
| Span-Suche       | Nicht ALS-gespeicherte Spans (z.B. blocked_on_user) werden über eine `activeSpans`-Map anhand von `span.type` zurückgesucht                                                                            |
| Speicherverwaltung | ALS-gespeicherte Spans verwenden WeakRef; nicht ALS-gespeicherte Spans verwenden strongRef, um GC zu verhindern; TTL 30min automatische Bereinigung                                                  |
**claude-code tool span vollständiger Lebenszyklus** (`toolExecution.ts`):

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

**claude-code hook span** (`hooks.ts`):

```
startHookSpan(event, name, count, defs)       // → parent = toolContext ?? interactionContext
  [parallel hook execution]
endHookSpan(span, { success, blocking, ... })
```

### qwen-code bestehende Architektur vs. claude-code

#### Grundlegender Unterschied: Zwei getrennte Span-Erstellungspfade

Dies ist das derzeit kritischste Architekturproblem in qwen-code:

| Ebene              | Datei                 | Nutzung                                                                                     | parent-Auflösung                                           |
| ------------------ | --------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| session-tracing    | `session-tracing.ts`  | `startInteractionSpan` / `startLLMRequestSpan` / `startToolSpan` / `startToolExecutionSpan` | Explizit aus dem `interactionContext` ALS parent holen     |
| tracer             | `tracer.ts`           | `withSpan` / `startSpanWithContext`                                                         | parent aus `context.active()` holen, Fallback auf session root |

**Tatsächliche Aufrufsituation zur Laufzeit:**

- `startInteractionSpan` → **bereits angebunden** (`client.ts` Zeile 956), schreibt in `interactionContext` ALS
- `startLLMRequestSpan` / `endLLMRequestSpan` → **nicht angebunden**, die Laufzeit nutzt `withSpan('api.generateContent', ...)` (in `loggingContentGenerator.ts`)
- `startToolSpan` / `endToolSpan` → **nicht angebunden**, die Laufzeit nutzt `withSpan('tool.${name}', ...)` (in `coreToolScheduler.ts`)
- `startToolExecutionSpan` / `endToolExecutionSpan` → **nicht angebunden**

**Konsequenz:**

`getParentContext()` in `withSpan` prüft zuerst `context.active()` (nativer OTel-Kontext) und fällt, falls kein aktiver Span gefunden wird, auf den session-root-Kontext zurück. Es **liest `interactionContext` ALS überhaupt nicht**.

Daher werden interaction-Span und LLM/Tool-Spans zu **gleichrangigen Geschwistern** unter dem session-root, nicht zu einem parent-child-Baum:

```
session-root
  ├── interaction         (aus session-tracing, schreibt in interactionContext ALS)
  ├── api.generateContent (aus withSpan, liest interactionContext nicht → hängt an session-root)
  ├── tool.Bash           (aus withSpan, genauso)
  └── tool.Read           (aus withSpan, genauso)
```

**In claude-code hingegen gibt es nur einen Span-Erstellungspfad (`sessionTracing.ts`); alle Spans durchlaufen dieselbe ALS → OTel-Kontext-Umwandlungslogik, sodass der Baum vollständig ist.**

#### Einzelne Wiederverwendbarkeitsbewertung

##### 1. Doppelter ALS + explizite parent-Auflösung – wiederverwendbar, Kern der Behebung

| Dimension       | claude-code                                          | qwen-code                                    |
| --------------- | ---------------------------------------------------- | -------------------------------------------- |
| Anzahl ALS      | 2 (`interactionContext` + `toolContext`)             | 1 (`interactionContext`, kein `toolContext`) |
| parent-Auflösung| Jeder Span-Typ gibt explizit an, aus welchem ALS parent geholt wird | `withSpan` einheitlich über `context.active()` |
| Kontext-Injektion| `trace.setSpan(otelContext.active(), parentCtx.span)` | Implizit durch `startActiveSpan` innerhalb von `withSpan` |

**Wiederverwendungsansatz:**

qwen-code's `session-tracing.ts` implementiert bereits **fast das gleiche parent-Auflösungsmuster** wie claude-code:

```typescript
// qwen-code session-tracing.ts (bereits vorhanden, aber ungenutzt)
export function startLLMRequestSpan(model, promptId): Span {
  const parentCtx = interactionContext.getStore();
  const ctx = parentCtx
    ? trace.setSpan(otelContext.active(), parentCtx.span)
    : otelContext.active();
  // ...
}
```

Dieser Code ist **völlig identisch** mit der `startLLMRequestSpan`-Logik von claude-code.

**Kern der Behebung: Die `withSpan('api.*')`/`withSpan('tool.*')`-Aufrufe in der Laufzeit verwerfen und stattdessen die getypten Helfer von session-tracing aufrufen.** Die session-tracing-Schicht muss nicht neu geschrieben werden – ihre API ist bereits bereit.

Neu hinzugefügt werden müssen nur:

- Ein `toolContext` ALS (angelehnt an claude-code)
- `blocked_on_user`- und `hook`-Span-Typen inklusive Helferfunktionen

##### 2. tool.blocked_on_user – Anpassung an Unterschiede im Genehmigungsablauf

| Dimension         | claude-code                                         | qwen-code                                                                      |
| ----------------- | --------------------------------------------------- | ------------------------------------------------------------------------------ |
| Genehmigungsort   | Innerhalb von `toolExecution.ts`, innerhalb des tool-Spans | Innerhalb von `coreToolScheduler._schedule()`, vor dem tool-Span              |
| Genehmigungsmodell| Synchrones Warten auf `resolveHookPermissionDecision()` | Zustandsautomat: `validating` → `awaiting_approval` → `scheduled` → `executing` |
| Span-Abdeckung    | tool-Span umfasst blocked + execution               | tool-Span (`withSpan`) deckt nur execution ab (ab `executeSingleToolCall`)      |

**Kernunterschied:** qwen-code prüft beim Eintritt in `executeSingleToolCall`, ob `toolCall.status !== 'scheduled'` – d.h. die Genehmigung ist zu diesem Zeitpunkt bereits abgeschlossen. Der `withSpan`-Aufruf des tool-Spans kann die Wartezeit auf Genehmigung nicht umfassen.

**Anpassungsansatz (zwei Möglichkeiten):**

**Ansatz A – Start des tool-Spans vorziehen (empfohlen):**

Den `startToolSpan`-Aufruf von `executeSingleToolCall` nach vorne in `_schedule` verschieben, bevor die Genehmigungsprüfung stattfindet, sodass der tool-Span den gesamten Lebenszyklus abdeckt. Beim Eintreten in den Zustand `awaiting_approval` `startToolBlockedOnUserSpan` aufrufen, bei Abschluss der Genehmigung (`scheduled`) `endToolBlockedOnUserSpan` aufrufen.
```
_schedule():
  startToolSpan(name)                         // ← 新增
    startToolBlockedOnUserSpan()              // ← 新增，进入 awaiting_approval 时
      [状态机等待]
    endToolBlockedOnUserSpan(decision)        // ← 新增，进入 scheduled 时
executeSingleToolCall():
    startToolExecutionSpan()                  // ← 接入已有 helper
      [hook + execute]
    endToolExecutionSpan()
  endToolSpan()                               // ← 需要在 finally 中
```

**Option B – Tool-Span-Position beibehalten, Genehmigung separat verfolgen:**

Erstelle einen unabhängigen `approval_wait`-Span in `_schedule` (nicht als Kind des Tools), hänge ihn unter interaction. Vorteil: geringere Änderungen. Nachteil: Inkonsistenz mit claude-code-Modell, schlechtere Lesbarkeit des Trace-Baums.

**Option A wird empfohlen, weil:**

- Konsistent mit der Trace-Baum-Struktur von claude‑code
- Ein Tool-Knoten im Trace zeigt, wie lange gewartet und wie lange ausgeführt wurde
- Die ereignisgesteuerte Zustandsmaschine beeinflusst nur den Zeitpunkt von Span-Start/Ende, nicht die Parent-Child-Modellierung

##### 3. hook span — direkt wiederverwendbar

| Dimension              | claude-code                                         | qwen-code                                                                     |
| ---------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------- |
| Hook-Ausführungseinstieg | `executeHooks()` in `hooks.ts`                      | `firePreToolUseHook`/`firePostToolUseHook` via `hookEventHandler.ts`          |
| Aktuelle Aufzeichnungsmethode | OTel span + Perfetto span                           | `HookCallEvent` → `QwenLogger` (kein OTel)                                    |
| Parent                 | `toolContext ?? interactionContext`                  | —                                                                             |

**Wiederverwendungsplan:**

1. Füge in `session-tracing.ts` `startHookSpan`/`endHookSpan` hinzu (parent = `toolContext ?? interactionContext`, konsistent mit claude‑code)
2. In `coreToolScheduler.ts` in `executeSingleToolCall` vor/nach dem pre/post-Hook-Aufruf jeweils hook span starten/beenden
3. Behalte die bestehenden `logHookCall`-Ereignisaufzeichnungen bei (beide parallel, nicht exklusiv)

Geringer Änderungsaufwand, beeinträchtigt nicht die bestehende Hook-Logik.

##### 4. tool.execution — helper bereits vorhanden, nur Verkabelung nötig

`startToolExecutionSpan(parentToolSpan)` / `endToolExecutionSpan(span, metadata)` in qwen‑code ist bereits vollständig implementiert, muss nur in `executeSingleToolCall` aufgerufen werden:

```typescript
// coreToolScheduler.ts executeSingleToolCall 内部
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

Hinweis: `startToolExecutionSpan` in qwen‑code erhält explizit den Parameter `parentToolSpan`, während claude‑code diesen implizit aus dem `toolContext` ALS bezieht. Dies beeinträchtigt die Funktionalität nicht, es ist ein Stilunterschied. Wenn ein `toolContext` ALS eingeführt wird, kann auf implizites Beziehen umgestellt werden.

##### 5. subagent trace tree — beide Seiten unvollständig, direkte Wiederverwendung nicht empfohlen

| Dimension                     | claude‑code                                                                      | qwen‑code                                            |
| ----------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------- |
| OTel-Trace-Weitergabe         | **Keine** – die interaction des Subagents ist ein neuer root                     | **Keine** – Subagent hat keine explizite Trace-Weitergabe |
| Identitätszuordnung           | Perfetto-Metadaten (Agent-Prozess/Thread) + `teammateContextStorage` ALS          | `subagentNameContext` ALS + `SubagentExecutionEvent`  |
| Parallelitätsisolierung       | OTel ALS hat Leckrisiko (`enterWith` ist prozessweit, parallele Subagents überschreiben sich gegenseitig) | Gleiches Risiko                                        |

claude‑code hat das Subagent‑OTel‑Tracing **selbst nicht gut gelöst**:

- `interactionContext.enterWith()` ist prozessweit, parallele Subagents überschreiben die ALS-Werte des jeweils anderen.
- Der echte Agent-Hierarchiebaum existiert nur in Perfetto (einem internen, feature-flagged System von Anthropic), nicht in OTel.

**Empfehlung:**

- Kurzfristig: Bestehendes `subagentNameContext` + Ereignisprotokoll-Schema von qwen‑code beibehalten
- Mittelfristig: Beim Start des Subagents einen `subagent`-Span erstellen (parent = aktueller toolContext) und `context.with()` statt `enterWith()` verwenden, um den OTel-Kontext paralleler Subagents zu isolieren.
- Dies ist ein eigenständiger Arbeitspunkt, der ein eigenes Design erfordert; es wird nicht empfohlen, claude‑code direkt zu kopieren.

##### 6. LLM request span — Weg klar

qwen‑code verwendet derzeit in `loggingContentGenerator.ts` `withSpan('api.generateContent', ...)` und `startSpanWithContext('api.generateContentStream', ...)`. Stattdessen sollten `startLLMRequestSpan` / `endLLMRequestSpan` aufgerufen werden (bereits in der session-tracing-Schicht implementiert). Für Streaming-Szenarien ist Folgendes zu beachten:

- `startLLMRequestSpan` gibt ein `Span`-Objekt zurück.
- Muss manuell durch `endLLMRequestSpan(span, metadata)` beendet werden.
- Dies ist kompatibel mit dem manuellen Verwaltungsmodus von `startSpanWithContext`.

### Zusammenfassung der Wiederverwendung

| Änderungspunkt                                                                                             | Wiederverwendbarkeit                                  | Änderungsaufwand                        | Priorität |
| ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------- | --------- |
| Vereinheitlichung des Span-Erstellungspfads (Abschaffung von runtime `withSpan`, Verwendung der session-tracing-Helper) | **Kernkorrektur** – Behebung der Parent-Child-Unterbrechung | Mittel (~5 Aufrufstellen)               | P0        |
| Neueinführung von `toolContext` ALS                                                                        | Direktes Übernehmen des claude‑code-Musters           | Niedrig (innerhalb von session‑tracing.ts) | P0        |
| tool.blocked_on_user span                                                                                  | Option A erfordert Anpassung an die Zustandsmaschine  | Mittel (Koordination von `_schedule` + `executeSingleToolCall`) | P1        |
| tool.execution-Verkabelung                                                                                 | Helper bereits vorhanden, nur Aufruf nötig            | Niedrig (3 Zeilen in `executeSingleToolCall`) | P1        |
| Hook-Span                                                                                                  | Neue Helper + Aufrufstellen                           | Niedrig                                  | P1        |
| LLM-Request-Span-Umstellung                                                                                | Ersetze withSpan durch typisierte Helper              | Niedrig (2 Aufrufstellen)                | P1        |
| Subagent-Trace-Baum                                                                                        | **Nicht direkt wiederverwendbar** – erfordert eigenes Design | Hoch                                     | P2        |
```
### Empfohlene Implementierungsreihenfolge

```
Phase 1 — 修复 trace 树结构 (P0)
├── 1a. session-tracing.ts 新增 toolContext ALS + blocked_on_user / hook span helpers
├── 1b. loggingContentGenerator.ts: withSpan → startLLMRequestSpan/endLLMRequestSpan
└── 1c. coreToolScheduler.ts: withSpan → startToolSpan/endToolSpan

Phase 2 — 补齐 workflow span (P1)
├── 2a. coreToolScheduler._schedule: blocked_on_user span 接入
├── 2b. coreToolScheduler.executeSingleToolCall: tool.execution span 接入
└── 2c. hook pre/post 调用处: hook span 接入

Phase 3 — Subagent trace tree (P2)
├── 3a. 设计 context.with() 隔离方案（替代 enterWith）
├── 3b. subagent 启动时创建 subagent root span
└── 3c. 并发 subagent 场景验证
```
