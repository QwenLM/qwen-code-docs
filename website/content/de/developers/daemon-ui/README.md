# Daemon UI SDK – Entwicklerhandbuch

Der Subpfad `@qwen-code/sdk/daemon` liefert gemeinsame UI-Primitive für Daemon-Clients. Das aktuelle Ziel ist Web-Chat und Web-Terminal; native lokale TUI-, Kanal- und IDE-Integrationen behalten ihre bestehenden Standardpfade, während der Daemon-UI-Vertrag stabilisiert wird. Dieser Leitfaden deckt die API-Oberfläche ab, die mit PR #4353 (dem vereinheitlichten Nachfolger des gemeinsamen UI-Transkriptlayers von PR #4328) eingeführt wurde.

## Drei-Schichten-Modell

```
Daemon SSE Wire (NDJSON Umschläge)
   │
   ▼
normalizeDaemonEvent(envelope) → DaemonUiEvent[]
   │
   ▼
reduceDaemonTranscriptEvents(state, events) → DaemonTranscriptState
   │                                            { blocks, currentToolCallId,
   │                                              approvalMode, toolProgress, ... }
   ▼
daemonBlockToMarkdown(block) / ToHtml / ToPlainText  ← hier steckst du deinen Renderer an
```

- **Normalisierer**: Nimmt rohe Daemon-SSE-Umschläge entgegen, gibt typisierte UI-Ereignisse zurück
- **Reducer**: Akkumuliert Ereignisse in eine Transkriptstatusmaschine
- **Render-Helfer**: Projiziert Statusblöcke in darstellbare Zeichenketten

## Schnellstart

```ts
import {
  DaemonSessionClient,
  createDaemonTranscriptStore,
  normalizeDaemonEvent,
  daemonBlockToMarkdown,
  selectCurrentTool,
  selectApprovalMode,
} from '@qwen-code/sdk/daemon';

const session = await DaemonSessionClient.createOrAttach(client, {
  workspaceCwd,
});
const store = createDaemonTranscriptStore();

for await (const envelope of session.events({ signal })) {
  const events = normalizeDaemonEvent(envelope, {
    clientId: session.clientId,
    suppressOwnUserEcho: true,
  });
  store.dispatch(events);
}

// Zustand von einem beliebigen Abonnenten auslesen
store.subscribe(() => {
  const state = store.getSnapshot();
  const currentTool = selectCurrentTool(state);
  const mode = selectApprovalMode(state);
  const markdown = state.blocks.map(daemonBlockToMarkdown).join('\n\n');
  myRenderer.render({ markdown, currentTool, mode });
});
```

## Ereignistaxonomie (28+ Typen)

`DaemonUiEvent` ist eine diskriminierte Vereinigung aller UI-Ereignisse:

### Chat-Stream-Ereignisse

| Ereignis                     | Wann                                                         |
| ---------------------------- | ------------------------------------------------------------ |
| `user.text.delta`            | Ein Teil einer Benutzernachricht kommt vom Daemon an         |
| `assistant.text.delta`       | Gestreamter Teil der Antwort des Assistenten                 |
| `assistant.done`             | Abschluss der Eingabeaufforderung (aus dem Auflösen von sendPrompt) |
| `thought.text.delta`         | Teil der Überlegungen des Agenten                            |
| `tool.update`                | Lebenszyklus eines Toolaufrufs (läuft / abgeschlossen / abgebrochen) |
| `shell.output`               | Teil von stderr/stdout des Shell-Tools                       |
| `permission.request`         | Tool benötigt Benutzerautorisierung                          |
| `permission.resolved`        | Entscheidung über die Berechtigung liegt vor                 |
| `model.changed`              | Sitzungsmodell gewechselt                                    |
| `status` / `debug` / `error` | Status-/Debug-/Fehlerblöcke                                  |

### Sitzungs-Meta-Ereignisse (PR-A)

| Ereignis                           | Wann                                                     |
| ---------------------------------- | -------------------------------------------------------- |
| `session.metadata.changed`         | Sitzungstitel / Anzeigename aktualisiert                 |
| `session.approval_mode.changed`    | Modus umgeschaltet (Plan / Standard / YOLO / Auto-Bearbeiten) |
| `session.available_commands`       | Liste der Schrägstrichbefehle aktualisiert                |

### Arbeitsbereichsereignisse (PR-A, Wave 3-4)

| Ereignis                                  | Wann                                                  |
| ----------------------------------------- | ----------------------------------------------------- |
| `workspace.memory.changed`                | QWEN.md / Speicherdatei verändert                     |
| `workspace.agent.changed`                 | Unter-Agent erstellt / aktualisiert / gelöscht        |
| `workspace.tool.toggled`                  | Eingebautes Tool aktiviert / deaktiviert              |
| `workspace.initialized`                   | `qwen init` abgeschlossen                             |
| `workspace.mcp.budget_warning`            | MCP-Kindanzahl nähert sich dem Limit                  |
| `workspace.mcp.child_refused`             | MCP-Server aufgrund des Budgets abgelehnt             |
| `workspace.mcp.server_restarted`          | Manueller MCP-Neustart erfolgreich                    |
| `workspace.mcp.server_restart_refused`    | Manueller Neustart blockiert                          |

### Authentifizierungs-Device-Flow-Ereignisse (PR-A, Wave 4 OAuth)

`auth.device_flow.{started,throttled,authorized,failed,cancelled}`

Jedes trägt die `deviceFlowId` des Daemons. Fehlgeschlagene Ereignisse enthalten eine geschlossene Aufzählung `errorKind` (closed enum – siehe `KNOWN_DEVICE_FLOW_ERROR_KINDS`, exportiert aus `@qwen-code/sdk/daemon` für die kanonische Liste, derzeit: `expired_token` / `access_denied` / `invalid_grant` / `upstream_error` / `persist_failed` / `not_found_or_evicted`).

## Render-Vertrag (PR-D)

Drei Projektionshelfer, ein Vorschauhelfer. Alle unterscheiden nach `block.kind` oder `preview.kind`:
```ts
daemonBlockToMarkdown(block, { sanitizeUrls?, maxFieldLength?, locale? })
daemonBlockToHtml(block, { sanitizer?, ...renderOpts })
daemonBlockToPlainText(block, renderOpts)
daemonToolPreviewToMarkdown(preview, renderOpts)
```

### Kochbuch: Ein Transkript als Markdown rendern

```ts
const markdown = state.blocks
  .map((b) => daemonBlockToMarkdown(b, { sanitizeUrls: true }))
  .join('\n\n');
```

### Kochbuch: In bereinigtes HTML für SSR rendern

```ts
import DOMPurify from 'dompurify';
import MarkdownIt from 'markdown-it';
const md = new MarkdownIt();

const html = state.blocks
  .map((b) => {
    // Zwei-Stufen-Pipeline: Markdown → HTML → DOMPurify
    const rawHtml = md.render(daemonBlockToMarkdown(b));
    return DOMPurify.sanitize(rawHtml);
  })
  .join('\n');
```

Oder verwenden Sie den eingebauten konservativen HTML-Renderer (kein Markdown-Parsing, nur HTML-Escape):

```ts
const html = state.blocks
  .map((b) => daemonBlockToHtml(b, { sanitizer: DOMPurify.sanitize }))
  .join('\n');
```

### Kochbuch: Klartext kopieren und einfügen

```ts
const plain = state.blocks.map(daemonBlockToPlainText).join('\n');
navigator.clipboard.writeText(plain);
```

## Tool-Vorschau-Taxonomie (13 Arten)

| Art                  | Darstellung                                       |
| -------------------- | ------------------------------------------------- |
| `ask_user_question`  | Multiple-Choice-Frage mit Optionen                |
| `command`            | Bash-ähnlicher Befehl + Arbeitsverzeichnis        |
| `file_diff`          | Dateibearbeitung mit oldText/newText oder Patch   |
| `file_read`          | Pfad + optionaler Zeilenbereich                   |
| `web_fetch`          | URL + HTTP-Methode                                |
| `mcp_invocation`     | MCP-Server + Tool + Argumente-Zusammenfassung     |
| `code_block`         | Sprachgetaggtes Code-Snippet                      |
| `search`             | Abfrage + Ergebnisanzahl + Top-Ergebnisse         |
| `tabular`            | Spalten + Zeilen (begrenzt auf 50, Kürzung markiert) |
| `image_generation`   | Prompt + optionale Miniaturbild-URL               |
| `subagent_delegation`| Agentenname + Aufgabe                             |
| `key_value`          | Generische Label/Wert-Zeilen                      |
| `generic`            | Fallback-Zusammenfassung                          |

Jede hat eine `daemonToolPreviewToMarkdown`-Projektion. Benutzerdefinierte Renderer können auf `preview.kind` verzweigen, um eine umfangreiche typabhängige Darstellung zu ermöglichen (Dateidiff mit Syntax-Highlighting, MCP-Server-Badge, Bild-Miniaturansicht usw.).

## Zustandsselektoren (PR-E)

```ts
selectCurrentTool(state); // → DaemonToolTranscriptBlock | undefined
selectApprovalMode(state); // → 'plan' | 'default' | 'auto-edit' | 'yolo' | undefined
selectToolProgress(state, toolCallId); // → { ratio?, step? } | undefined
selectPendingPermissionBlocks(state); // → ReadonlyArray<DaemonPermissionTranscriptBlock>
selectTranscriptBlocks(state); // → ReadonlyArray<DaemonTranscriptBlock>
selectTranscriptBlocksOrderedByEventId(state); // sorted by daemon-monotonic id

// PR-K — Sub-Agenten-Verschachtelung
selectSubagentChildBlocks(state, parentToolCallId); // direct children only
isSubagentChildBlock(block); // type guard: was this tool invoked inside a sub-agent?
```

`currentToolCallId` wird automatisch vom Reducer verwaltet:

- Wird gesetzt, wenn ein Tool den Status „in Bearbeitung“ erreicht (`running` / `in_progress` / `pending` / `confirming`)
- Wird gelöscht, wenn das Tool einen Endstatus erreicht (`completed` / `failed` / `cancelled` / usw.)
- Unbekannte Status lassen es unverändert (vorwärtskompatibel)

## Abbruchweitergabe (PR-E)

Wenn `assistant.done.reason === 'cancelled'`, durchläuft der Reducer jeden in Bearbeitung befindlichen Tool-Block und setzt dessen Status erzwingend auf `'cancelled'`. Der Daemon garantiert keine abschließende `tool_call_update` für jedes laufende Tool, wenn die übergeordnete Eingabeaufforderung abgebrochen wird – diese Weitergabe verhindert, dass UI-Ladeanzeigen endlos drehen.

Untergeordnete Sub-Agenten werden zusammen mit ihrem übergeordneten Agenten abgebrochen, da die Abbruchlogik jeden in Bearbeitung befindlichen Tool-Block in `toolBlockByCallId` durchläuft, nicht nur den aktuellen Zeiger.

## Sub-Agenten-Verschachtelung (PR-K)

Wenn der Hauptagent an einen Sub-Agenten delegiert (das `Task`-Tool oder ein Äquivalent), markiert der Daemon `parentToolCallId` und `subagentType` auf den **untergeordneten** Tool-Aufrufen über `tool_call._meta`. Der Reducer liest beide und:

- Spiegelt `parentToolCallId` + `subagentType` auf `DaemonToolTranscriptBlock`
- Löst `parentBlockId` (die `id` des übergeordneten Transkript-Blocks) auf, wenn der übergeordnete Block bereits im Zustand ist; andernfalls bleibt es `undefined` und wird nachgefüllt, wenn der übergeordnete Block später erscheint

Auftreten in falscher Reihenfolge (Kind vor Eltern) wird transparent behandelt. Ein Kind, dessen Elternteil durch `maxBlocks` abgeschnitten wird, behält `parentToolCallId` für Selektorabfragen, aber `parentBlockId` wird auf null gesetzt (die verwaiste ID würde nicht mehr über `blockIndexById` aufgelöst werden).

```ts
import {
  selectSubagentChildBlocks,
  isSubagentChildBlock,
} from '@qwen-code/sdk/daemon';

// Ein übergeordnetes Tool-Block rendern, dann Kinder durchlaufen:
function renderToolBlock(state, block) {
  if (block.kind !== 'tool') return renderOther(block);
  const children = selectSubagentChildBlocks(state, block.toolCallId);
  return (
    <ToolBlock block={block}>
      {children.length > 0 && (
        <Indent>
          {children.map((c) => renderToolBlock(state, c))}
        </Indent>
      )}
    </ToolBlock>
  );
}

// Oder auf oberster Ebene vs. verschachtelt zur Renderzeit filtern:
const topLevel = state.blocks.filter((b) => !isSubagentChildBlock(b));
```
`selectSubagentChildBlocks` gibt nur **direkte** Kinder zurück. Durchlaufen Sie rekursiv, um verschachtelte Sub-Agents darzustellen (ein Sub-Agent in einem Sub-Agent). Der Daemon erzeugt keine Zyklen, aber Renderer, die über `parentBlockId` nach oben gehen, sollten sie dennoch defensiv erkennen (z. B. Tiefenbegrenzung oder besuchte Menge).

Selbstreferenzen (`parentToolCallId === toolCallId`) werden vom Normalisierer verworfen, bevor sie den Reducer erreichen.

## Zeit-Semantik (PR-B)

```ts
interface DaemonTranscriptBlockBase {
  eventId?: number; // PRIMARY sort key — daemon-monotonic
  serverTimestamp?: number; // PREFERRED display — daemon-authoritative
  clientReceivedAt: number; // FALLBACK — local clock
  createdAt: number; // @deprecated alias for clientReceivedAt
}
```

**Sortieren Sie immer nach `eventId`** (verwenden Sie `selectTranscriptBlocksOrderedByEventId`), wenn Sie lange Sitzungen anzeigen. Der daemon-monotonische Cursor bleibt über SSE-Wiederholung nach Wiederverbindung erhalten; Client-Uhren nicht.

**Formatieren Sie Anzeigezeitstempel immer von `serverTimestamp`** (mit Fallback auf `clientReceivedAt`). Mehrere Clients, die dieselbe Sitzung anzeigen, sehen dieselbe „vor 5 Minuten"-Angabe nur, wenn beide von der Daemon-Uhr lesen.

```ts
import { formatBlockTimestamp } from '@qwen-code/sdk/daemon';

const label = formatBlockTimestamp(block, {
  locale: 'zh-CN',
  timeZone: 'Asia/Shanghai',
  timeStyle: 'short',
});
```

## Adapter-Konformität (PR-G)

Validieren Sie, dass Ihr Adapter das Referenzkorpus des SDKs semantisch äquivalent ausgibt:

```ts
import { runAdapterConformanceSuite } from '@qwen-code/sdk/daemon';

it('my adapter conforms to daemon UI corpus', () => {
  const result = runAdapterConformanceSuite({
    reduce: (events) => myReducer(events),
    renderToText: (state) => myRenderer(state),
  });
  expect(result.failed).toEqual([]);
});
```

Das Fixture-Korpus (`DAEMON_UI_CONFORMANCE_FIXTURES`) deckt Chat, Tool-Lebenszyklus, Dateibearbeitungen, MCP, Berechtigungen, MCP-Budgetwarnung, Stornierung, Schwärzung fehlerhafter Nutzdaten, OAuth, Befehlsaktualisierungen und Sub-Agent-Verschachtelung ab. (Die Anzahl ist zur Laufzeit ableitbar – lesen Sie `DAEMON_UI_CONFORMANCE_FIXTURES.length`.)

**Formatsagnostisch** – Ihr Adapter kann nach ANSI / HTML / Markdown / JSX rendern; das Framework prüft nur den semantischen Inhalt über `expectedContains` und `expectedAbsent`.

## Fehlerkategorisierung (PR-A)

`DaemonUiErrorEvent.errorKind` ist ein geschlossenes Enum, das aus der typisierten Fehlertaxonomie des Daemons weitergegeben wird (wenn der Daemon es stempelt):

```ts
import type { DaemonErrorKind } from '@qwen-code/sdk/daemon';
// 'missing_binary' | 'blocked_egress' | 'auth_env_error' | 'init_timeout'
// | 'protocol_error' | 'missing_file' | 'parse_error' | 'budget_exhausted'
```

Renderer sollten auf `errorKind` verzweigen, um umsetzbare Hilfsmittel bereitzustellen:

```ts
function errorAffordance(errorKind?: DaemonErrorKind): React.ReactNode {
  switch (errorKind) {
    case 'auth_env_error': return <button>Re-authenticate</button>;
    case 'missing_file':   return <button>Choose file</button>;
    case 'blocked_egress': return <span>Network blocked — check proxy</span>;
    default:               return null;
  }
}
```

## Tool-Herkunfts-Dispatch (PR-A)

`DaemonUiToolUpdateEvent.provenance` ist ein geschlossenes Enum (`builtin` / `mcp` / `subagent` / `unknown`). Mit `serverId?: string` bei `mcp`. Verwenden Sie es für die Icon-Dispatch und Badging:

```ts
function toolIcon(event: DaemonUiToolUpdateEvent): React.ReactNode {
  switch (event.provenance) {
    case 'mcp':      return <McpIcon server={event.serverId} />;
    case 'subagent': return <SubagentIcon />;
    case 'builtin':  return <BuiltinIcon name={event.toolName} />;
    default:         return <GenericIcon />;
  }
}
```

Das SDK hat einen `mcp__<server>__<tool>`-Namensheuristik-Fallback – selbst wenn der Daemon keine Herkunft explizit stempelt, sind MCP-Tools erkennbar.

## Forward-Compat-Prinzipien

Jede Schicht im Daemon-UI-SDK folgt dem **Forward-Compat-Prinzip**: unbekannte Werte werfen KEINE Fehler; sie degradieren elegant.

- Unbekannte Daemon-Ereignistypen → `debug`-Ereignis mit dem rohen Typnamen
- Unbekannter Tool-Status → `currentToolCallId` bleibt unberührt (kein Löschen)
- Unbekannter Fehlertyp → `errorKind` undefiniert (Renderer fällt auf Text zurück)
- Fehlender serverTimestamp → fällt auf `clientReceivedAt` zurück
- Nicht erkannte Vorschauform → `generic`-Art mit `summary`

Das bedeutet, dass das **SDK vor der Daemon-Emission ausgeliefert werden kann**. PR-As Tool-Herkunfts-Heuristik, PR-Bs Drei-Stellen-Zeitstempel-Extraktion und PR-Es Erhaltung unbekannter Status sind alles Beispiele für „bereit, wenn der Daemon sendet; sicher, wenn nicht".

## Querverweise

- [PR #4328](https://github.com/QwenLM/qwen-code/pull/4328) — Basis-PR mit der gemeinsamen UI-Transkript-Schicht
- [PR #4353](https://github.com/QwenLM/qwen-code/pull/4353) — dieser PR (vereinheitlichtes Vollständigkeits-Follow-up)
- [Issue #3803](https://github.com/QwenLM/qwen-code/issues/3803) — Daemon-Mode-Vorschlag
- [Issue #4175](https://github.com/QwenLM/qwen-code/issues/4175) — Mode B v0.16-Implementierungs-Tracker
