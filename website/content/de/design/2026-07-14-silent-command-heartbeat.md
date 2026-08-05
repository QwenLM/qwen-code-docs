# Silent Command Heartbeat

Datum: 2026-07-14
Status: implementiert

## Problem

Ein Vordergrund-Shell-Befehl, der keine Ausgabe erzeugt, emittiert zwischen Spawn und Settle keine Events. Im interaktiven TUI-Einsatz ist das in Ordnung — der Spinner dreht sich weiter — aber für headless Consumer (ACP-Gateways wie DataAgent, `--output-format stream-json`-Pipelines) wird die Session für die gesamte Dauer des Befehls vollständig still. Ein Gateway, das den Event-Stream beobachtet, kann „eine 165-Sekunden-SQL-Probe läuft noch" nicht von „die Ausführungskette ist gestorben" unterscheiden, sodass langlaufende stille Befehle von Benutzern als Hängen des Agenten gemeldet werden.

Die Produktionsdiagnose einer solchen Session (DataAgent-Session `77255d98`, 41-minütige Aufgabe, ~32 Minuten in Tool-Wartezeiten) identifizierte das fehlende Liveness-Signal als einen von drei P0-Zuverlässigkeitsfixes, neben Shell-Timeout-Semantik (PR 1, separate Änderung) und einem Todo-Stop-Guard (PR 3).

Referenzimplementierung: Claude Code pollt die Ausgabedatei jede Sekunde und ruft seinen Progress-Callback auch dann auf, wenn der Inhalt leer ist, und legt dann gedrosselte `tool_progress`-Events mit minimaler Payload an die SDK-Consumer offen. Der Progress gelangt niemals in den Modellkontext.

## Ziele

- Während ein Vordergrund-Shell-Befehl still ist, periodisch ein strukturiertes Liveness-Signal an Consumer emittieren, die es benötigen (ACP-Clients, stream-json).
- Nur Statistiken transportieren — verstrichene Zeit, Alter der letzten Ausgabe, Zeilen-/Byte-Zählung, effektiver Timeout. Niemals Befehlsausgabe.
- Niemals in den Modellkontext gelangen; niemals die Live-Output-Anzeige interaktiver Consumer stören.

## Nicht-Ziele

- Automatisches In-den-Hintergrund-Schicken bei Timeout (separat als P1-Item verfolgt).
- Streaming von Live-Befehlsausgabe an ACP-Clients (`content`-Frames).
- Weiterleitung von MCP-`mcp_tool_progress` über ACP, Propagierung von Subagent-Heartbeats in `AgentResultDisplay` oder TUI-Anzeigeverbesserungen — alles Follow-ups.

## Design

### Event-Form

`ShellProgressData` tritt der `ToolResultDisplay`-Union in `packages/core/src/tools/tools.ts` bei und spiegelt den bestehenden `McpToolProgressData`-Präzedenzfall, mit einem geteilten exportierten Guard `isShellProgressData`:

```ts
interface ShellProgressData {
  type: 'shell_progress';
  elapsedMs: number; // monotonic, since post-PTY-init spawn
  lastOutputAgeMs?: number; // monotonic age of last output; absent = none yet
  totalLines?: number; // PTY/AnsiOutput path only
  totalBytes?: number; // PTY/AnsiOutput path only
  timeoutMs?: number; // effective timeout incl. 120s default; absent when disabled
}
```

Dauern sind monoton (`performance.now()`-Deltas), damit NTP-Korrekturen sie nicht verzerren können; `lastOutputAgeMs` ist aus demselben Grund ein Alter statt eines Epoch-Zeitstempels.

### Producer

`ShellToolInvocation.execute()` startet ein `setInterval`, nachdem der Ausführungs-Handle erhalten wurde (damit die PTY-Dynamic-Import-Zeit keinen Heartbeat für einen Prozess erzeugen kann, der nicht existiert), und nur dann, wenn ein `updateOutput`-Callback vorhanden ist. Jeder Tick emittiert einen Heartbeat genau dann, wenn für ein volles Intervall kein Display-Update gefeuert wurde — der Check verwendet den bestehenden `lastUpdateTime`-Throttle-Zustand wieder, sodass Befehle mit fließender Ausgabe niemals heartbeaten. Der Timer wird an denselben drei Stellen geleert wie die bestehenden Trailing-Flush-/Timeout-Warnungs-Timer: im Service-Throw-Catch, im `finally` des Ergebnisses und in `onAbort` (nach dem Abbruch wäre ein „läuft noch"-Signal während des Kill-to-Settle-Fensters eine Lüge).

Das Intervall kommt aus `tools.shell.heartbeatIntervalMs` (Settings → CLI-Config → Core-`ConfigParameters` → `getShellHeartbeatIntervalMs()`, dieselbe Kette wie `defaultTimeoutMs`), mit einem Standard von 10 000 ms; `0` deaktiviert.

### Consumer

| Consumer                               | Verhalten                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `CoreToolScheduler` liveOutputCallback | Leitet Heartbeats an `outputUpdateHandler` weiter, überspringt aber den liveOutput-Ersatz und die Update-Benachrichtigung — ein Statistikobjekt darf die akkumulierte Live-Ansicht nicht leeren.                                                                                                                                                                                                                                                                                                                                                                       |
| `useReactToolScheduler` (TUI)          | Ignoriert Heartbeats; die TUI zeigt bereits einen Spinner.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `agent-core` (Subagent-Runtime)        | Ignoriert Heartbeats; das Broadcasten würde die `liveOutputs` der Subagent-Ansicht überschreiben.                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ACP `Session.runTool`                  | Übergibt einen Update-Callback an `invocation.execute()`. Heartbeats werden zu fire-and-forget, Meta-only-`tool_call_update { status: 'in_progress', _meta: { toolName, shellProgress } }`-Frames. Ein `toolSettled`-Gate, das in dem Moment gesetzt wird, in dem `execute()` zurückkehrt (einschließlich Throw), verwirft einen Tick, der mit dem Settle-Pfad um die Wette läuft, sodass der Client niemals `in_progress` nach `completed` beobachten kann. Heartbeat-Zählung und Alter der letzten Ausgabe werden als `shell.heartbeat_count` / `shell.last_output_age_ms`-Span-Attribute auf dem bestehenden Tool-Ausführungs-Span aufgezeichnet. |
| stream-json                            | `createToolProgressHandler` leitet Heartbeats durch die bestehende `emitToolProgress`-Pipeline (`tool_progress`-Stream-Events, gated durch `--include-partial-messages`). `ToolProgressStreamEvent.content` wird zu `McpToolProgressData \| ShellProgressData` erweitert.                                                                                                                                                                                                                                                                           |
| desktop `QwenAgent`                    | Überspringt `status: in_progress`-Updates in `handleToolCallUpdate` — er wandelte zuvor jedes `tool_call_update` in ein terminales `tool_result` um, was den Befehl beim ersten Heartbeat vorzeitig mit einem leeren Ergebnis abgeschlossen hätte.                                                                                                                                                                                                                                                                                            |
| channels `DaemonChannelBridge`         | Verwirft Kind-lose `in_progress`-Frames, statt sie als malformed zu markieren (`tool_call_update` erfordert dort `kind`, das Meta-only-Heartbeats nicht tragen).                                                                                                                                                                                                                                                                                                                                                                            |
| web-shell daemon UI-Normalizer         | Verwirft Heartbeat-Frames — das Normalisieren würde den menschenlesbaren Titel des Tool-Blocks mit dem bloßen Tool-Namen überschreiben, der aus `_meta.toolName` abgeleitet wird.                                                                                                                                                                                                                                                                                                                                                                                      |

ACPs `ToolCallUpdate` definiert jedes Feld außer der Id als optional und `_meta` als den Erweiterbarkeitspunkt, sodass protokollkonforme Clients die neuen Frames ignorieren. Dieser Vertrag erzwingt sich jedoch nicht selbst: Eine vollständige Durchsicht der `tool_call_update`-Consumer im Repo fand drei, die die Frames falsch behandelten (Desktop-Agent, Daemon-Channel-Bridge, Web-Shell-Normalizer — oben behoben, jeweils mit Regressionstest), während der Rest (VS-Code-Companion, acp-bridge-Compaction, Session-Export, Daemon-TUI-Adapter) bedingt zusammenführt und von Haus aus Heartbeat-sicher ist. Auf dem Permission-Request-Pfad (der heute keine Start-Notification emittiert) kann ein Heartbeat das erste Update sein, das ein Client für einen Tool-Call sieht — derselbe Sequenzierungsvertrag wie bei den bestehenden Completed-only-Updates.

### Warum nicht ShellExecutionService

Der Service würde ein marginal genaueres `lastOutputAt` liefern, aber die Tool-Schicht beobachtet bereits jedes Ausgabe-Event, und den Timer dort zu platzieren hätte bedeutet, ihn über die PTY-/child_process-/Promote-Lifecycles hinweg zu verwalten, während PR 1 gleichzeitig die Pre-Abort-Semantik derselben Datei überarbeitet. Die benutzerseitige `!`-Shell benötigt keine Heartbeats, daher geht nichts verloren.

## Verifikation

- Unit: Producer-Kadenz/-Form/-Cleanup (Fake-Timer einschließlich `performance`), Scheduler-Weiterleitung ohne liveOutput-Ersatz, Beibehaltung des TUI-Hooks, ACP-Meta-only-Frames + Late-Heartbeat-Gate, stream-json-Event-Form und Partial-Messages-Gate.
- E2E stream-json: `sleep 15` erzeugte `tool_progress` mit `{type:'shell_progress', elapsedMs:10001, timeoutMs:30000}` und ohne Ausgabe-Statistik-Felder.
- E2E ACP (stdio JSON-RPC): `tool_call` → Heartbeat-`tool_call_update` (Meta-only, 10 s) → `completed`, ohne nachträgliches `in_progress`.
- TUI (tmux): Stiller Befehl zeigt den normalen Spinner-/Elapsed-Zeilen an; kein JSON-Leak während des Laufs oder im finalen Transkript.
