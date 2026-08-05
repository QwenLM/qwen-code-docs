# Tool-Ausführungsstatus

## Motivation

Der terminale Tool-Call-Status beschreibt, ob der gesamte Aufruf erfolgreich
war, fehlgeschlagen ist oder abgebrochen wurde. Er sagt nicht, ob der
Dispatcher tatsächlich in `invocation.execute()` eingetreten ist.
Validierungsfehler, Berechtigungsablehnung, Ausführungsfehler und
Nach-Ausführungs-Fehler benötigen daher einen separaten Ausführungsstatus,
bevor sie korrekt gemessen werden können.

## Vertrag

`ToolCallResponseInfo` trägt ein optionales `executionStatus` für Quell- und
Aufzeichnungskompatibilität:

```ts
type ToolExecutionStatus = 'not_started' | 'success' | 'error' | 'cancelled';
```

Der Core-Scheduler (`CoreToolScheduler`) und ACP `Session.runTool` setzen das
Feld immer. Fehlende Werte aus älteren Aufzeichnungen, Drittanbieter-
Produzenten und Subagent-Ergebnis-Projektionen (der nicht-interaktive
`buildResponse`-Pfad, der das gemeldete Ergebnis eines anderen Agents
replayed) werden erst an der Telemetrie-Grenze zu `unknown` und werden nie
aus dem terminalen Call-Status abgeleitet.

Die terminale und die Ausführungs-Achse sind bewusst unabhängig:

| Terminaler Status | Ausführungsstatus | Beispiel                                                                             |
| ----------------- | ----------------- | ------------------------------------------------------------------------------------ |
| `success`         | `success`         | Normale Tool-Abschluss                                                                |
| `success`         | `not_started`     | Protokollebene synthetische Sibling-Response                                          |
| `error`           | beliebiger Wert   | Vor-Ausführungs-Ablehnung, Ausführungsfehler, Nachbearbeitungsfehler oder Batch-Hook-Override |
| `cancelled`       | beliebiger Wert   | Abbruch vor, während oder nach der Ausführung                                         |

Liest man jede Zeile als (Terminal-, Ausführungs-)Paar, sind die einzigen
ungültigen Kombinationen `success/error` und `success/cancelled`: Ein Aufruf,
der mit `success` terminiert, kann nur den Ausführungsstatus `success` oder
`not_started` tragen.
Der Ausführungsstatus wird eingefroren, wenn `invocation.execute()` settled;
Hooks, Ergebnis-Bridging, Persistenz und Batch-Verarbeitung können ihn nicht
überschreiben. Die PostToolBatch-Aktivierung und ihr Parent-Tool-Span werden
gesnapshotet, wenn ein Scheduler-Batch startet, sodass eine
Runtime-Hook-Rekonfiguration den nächsten Batch betrifft statt das
Abschlussverhalten eines laufenden Batches zu ändern.

## Telemetrie

Das normalisierte `tool_call`-Event erhält `call_id` und `execution_status`.
Die Normalisierung erfolgt einmal vor allen Senken:

- leere Tool-Namen werden zu `unknown_tool`;
- `success` wird aus dem terminalen `status` neu berechnet;
- terminale Fehler ohne Fehlertyp nutzen `unknown`;
- Erfolg und Abbruch lassen die Call-Level-Fehlerfelder weg;
- fehlender Ausführungsstatus wird zu `unknown`.

Die terminale `status`-Dimension auf `qwen-code.tool.call.count`, etabliert
durch den terminalen Telemetrie-Vertrag, bleibt von diesem Design unberührt.
Ein neuer `qwen-code.tool.execution.count`-Counter nutzt nur
`execution_status` und `tool_type` als Event-spezifische Dimensionen. Global
konfigurierte gemeinsame Metrik-Attribute, wie das Opt-in-`session.id`,
können ebenfalls vorhanden sein. Die Ausführungsfehlerrate ist:

```text
execution_status = error
────────────────────────────────────────
execution_status in {success, error}
```

Abbruch, `not_started` und `unknown` sind ausgeschlossen. Fehlertyp,
Funktionsname, Call-Id, Meldungen und MCP-Server-Namen bleiben in Logs oder
Spans statt in Metrik-Labels. Der Counter lässt `function_name` bewusst weg,
sodass eine Ausführungsfehlerrate nicht allein aus der Metrik einem
bestimmten Tool zugeordnet werden kann; Drilldown läuft über die
`tool_call`-Logs, die sowohl `call_id` als auch `function_name` tragen.

Ein Ausführungs-Span existiert erst, nachdem der Dispatcher `execute()`
versucht hat. Er zeichnet die Tool-Identität, den eingefrorenen
Ausführungsstatus und den Ausführungsfehlertyp auf. Parent-Tool-Spans stellen
weiterhin den terminalen Call-Status dar, und abgebrochene Spans bleiben unset
statt error. Core öffnet den Parent-Span nach Tool-Auflösung und
Aufruf-Validierung; frühere terminale Pfade sind durch das normalisierte Event
und den Ausführungs-Counter abgedeckt und synthetisieren keinen Span aus einem
nicht aufgelösten Request-Namen.

QwenLogger erhält den normalisierten terminalen Status, den Ausführungsstatus,
die Call-Id und den Tool-Typ, aber keine MCP-Server-Namen oder
Funktionsargumente. MCP-Server-Namen bleiben außerhalb von QwenLogger und
sind für konfigurierte Telemetrie-Log- und Span-Exporter verfügbar.

## Kompatibilität und Scope

Die öffentlichen Response- und Event-Felder bleiben optional. Eingebaute
Produzenten nutzen eine intern erforderliche Form, während alte
JSONL-Aufzeichnungen weder migriert noch nachgetragen werden. Neue
JSONL-Aufzeichnungen enthalten `executionStatus` auf aufgezeichneten
Tool-Ergebnissen; das Feld ist additiv, sodass Replay-Reader, die unbekannte
Felder ignorieren, nicht betroffen sind. Manuelle Aufzeichnungs-Projektionen
in Core, ACP, TUI und nicht-interaktiven Modi kopieren den neuen Skalar, ohne
ihn in der Nutzer-sichtbaren JSON-Ausgabe offenzulegen. Ein Aufruf, der vor
der Tool-Auflösung abgebrochen wird, kann in der öffentlichen
`CancelledToolCall`-Variante `tool` und `invocation` weglassen, sodass
Consumer dieser Variante diese Felder vor der Nutzung guarden müssen.
Wenn ein solcher Vor-Auflösungs-Abbruch über Telemetrie emittiert wird,
defaultet `tool_type` auf `"native"`, weil die Tool-Identität noch nicht
aufgelöst ist; dies ist eine bekannte Schieflage in der `tool_type`-Dimension
für Vor-Validierungs-Abbrüche.

Pro-Aufruf-Ausführungsfehler lassen `CoreToolScheduler.schedule()` nicht mehr
rejecten; das Ergebnis wird über die bestehenden Update- und
Completion-Callbacks als terminaler `error`-Call zugestellt, sodass der
Fehler eines Tools nicht seine Geschwister abbricht. Die Methode gibt
weiterhin `Promise<void>` zurück und kann bei Scheduler-Level-Setup- oder
Queue-Fehlern rejecten. `handleConfirmationResponse()` terminalisiert
Bestätigungs-Flow-Fehler, bevor es sie erneut wirft, und bewahrt sein
bestehendes Fehlersignal, ohne einen Aufruf in `awaiting_approval` zu
belassen. Embedder sollten den terminalen `status` und `executionStatus` von
Callback-zugestellten Aufrufen lesen und nicht erwarten, dass einer der beiden
öffentlichen Einstiegspunkte abgeschlossene Aufrufe zurückgibt.

Der erste Release deckt `CoreToolScheduler` und ACP `Session.runTool` ab.
Spekulation, direkte `/fork`-Ausführung, MCP-interne Retries, vorläufige
Subagent-Ergebnis-Abstimmung, Shell-Exit-Metadaten, Retrybarkeit, Ownership
und generelle Fehlerphasen bleiben außerhalb des Scopes.

Core und ACP müssen zusammen ausgeliefert werden. Dashboards sollten nach
Deployment-Zeit oder `service.version` umschalten, `unknown` separat
überwachen und nie die Legacy-`success`-Metrik als
Ausführungsfehler-SLI verwenden.

## Bekannte Wartungsrisiken

Die Vor-Ausführungs-Abbruch-Invariante („jedem `await` im
Vor-Ausführungs-Pfad folgt ein Abbruch-Check") wird von Hand platzierten
Checks an jeder Aufrufstelle in `CoreToolScheduler` und `Session.runTool`
durchgesetzt, nicht von einem strukturellen Mechanismus. Ein neues `await` in
einem der beiden Pfade ohne nachfolgenden Check führt still den
Stale-Execution-Bug wieder ein, den dieses Design behebt. Ein zukünftiges
Refactoring sollte die Awaits in einen geguardeten Helper einwickeln; bis
dahin sollten Reviewer dieser Pfade die Invariante manuell verifizieren.
