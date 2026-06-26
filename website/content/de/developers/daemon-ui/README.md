# Daemon UI SDK — Entwicklerleitfaden

Der `@qwen-code/sdk/daemon` Subpfad liefert gemeinsame UI-Primitiven für Daemon-Clients. Das aktuelle Einsatzgebiet sind Web-Chat und Web-Terminal; native lokale TUI-, Channel- und IDE-Integrationen behalten ihre vorhandenen Standardpfade, während sich der Daemon-UI-Vertrag stabilisiert. Dieser Leitfaden behandelt die API-Oberfläche, die mit PR #4353 (dem vereinheitlichten Folge-PR zu PR #4328s gemeinsamer UI-Transkriptschicht) eingeführt wurde.

## Drei-Schichten-Modell

```
Daemon SSE Wire (NDJSON-Envelopes)
   │
   ▼
normalizeDaemonEvent(envelope) → DaemonUiEvent[]
   │
   ▼
reduceDaemonTranscriptEvents(state, events) → DaemonTranscriptState
   │                                            { blocks, currentToolCallId,
   │                                              approvalMode, toolProgress, ... }
   ▼
daemonBlockToMarkdown(block) / ToHtml / ToPlainText  ← hier wird dein Renderer eingehängt
```

- **Normalizer**: Nimmt rohe Daemon-SSE-Envelopes entgegen, gibt typisierte UI-Events zurück
- **Reducer**: Akkumuliert Events in eine Transkript-Zustandsmaschine
- **Render-Helfer**: Projizieren Zustandsblöcke in darstellbare Zeichenketten

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

// Zustand von einem beliebigen Abonnenten lesen
store.subscribe(() => {
  const state = store.getSnapshot();
  const currentTool = selectCurrentTool(state);
  const mode = selectApprovalMode(state);
  const markdown = state.blocks.map(daemonBlockToMarkdown).join('\n\n');
  myRenderer.render({ markdown, currentTool, mode });
});
```

## Event-Taxonomie (28+ Typen)

`DaemonUiEvent` ist eine diskriminierte Vereinigung aller UI-Events:

### Chat-Stream-Events

| Ereignis                      | Wann                                                  |
| ----------------------------- | ----------------------------------------------------- |
| `user.text.delta`            | Benutzernachricht-Chunk vom Daemon                    |
| `assistant.text.delta`       | Assistents-Streaming-Chunk                            |
| `assistant.done`             | Prompt-Abschluss (durch sendPrompt-Auflösung)         |
| `thought.text.delta`         | Agenten-Überlegungs-Chunk                             |
| `tool.update`                | Tool-Call-Lebenszyklus (running / completed / cancelled) |
| `shell.output`               | Shell-Tool-stdout/stderr-Chunk                        |
| `permission.request`         | Tool benötigt Benutzerautorisierung                   |
| `permission.resolved`        | Berechtigungsentscheidung eingetroffen                |
| `model.changed`              | Sitzungsmodell gewechselt                             |
| `status` / `debug` / `error` | Status-/Debug-/Error-Blöcke                           |

### Sitzungs-Meta-Events (PR-A)

| Ereignis                          | Wann                                             |
| -------------------------------- | ------------------------------------------------ |
| `session.metadata.changed`      | Sitzungstitel / Anzeigename aktualisiert         |
| `session.approval_mode.changed` | Modus umgeschaltet (plan / default / yolo / auto-edit) |
| `session.available_commands`    | Slash-Befehl-Liste aktualisiert                  |

### Workspace-Events (PR-A, Wave 3-4)

| Ereignis                                  | Wann                                  |
| ----------------------------------------- | ------------------------------------- |
| `workspace.memory.changed`             | QWEN.md / Memory-Datei modifiziert    |
| `workspace.agent.changed`              | Sub-Agent erstellt / aktualisiert / gelöscht |
| `workspace.tool.toggled`               | Integriertes Tool aktiviert / deaktiviert |
| `workspace.initialized`                | `qwen init` abgeschlossen             |
| `workspace.mcp.budget_warning`         | MCP-Kind-Anzahl nähert sich Limit     |
| `workspace.mcp.child_refused`          | MCP-Server aufgrund von Budget abgelehnt |
| `workspace.mcp.server_restarted`       | Manueller MCP-Neustart erfolgreich    |
| `workspace.mcp.server_restart_refused` | Manueller Neustart blockiert          |

### Auth-Device-Flow-Events (PR-A, Wave 4 OAuth)

`auth.device_flow.{started,throttled,authorized,failed,cancelled}`

Jedes trägt die `deviceFlowId` des Daemon. Fehlgeschlagene Events haben einen geschlossenen Enum `errorKind` (geschlossener Enum – siehe die kanonische Liste in `KNOWN_DEVICE_FLOW_ERROR_KINDS`, exportiert aus `@qwen-code/sdk/daemon`, derzeit: `expired_token` / `access_denied` / `invalid_grant` / `upstream_error` / `persist_failed` / `not_found_or_evicted`).

## Render-Vertrag (PR-D)

Drei Projektionshelfer, ein Vorschauhelfer. Alle diskriminieren auf `block.kind` oder `preview.kind`:

```ts
daemonBlockToMarkdown(block, { sanitizeUrls?, maxFieldLength?, locale? })
daemonBlockToHtml(block, { sanitizer?, ...renderOpts })
daemonBlockToPlainText(block, renderOpts)
daemonToolPreviewToMarkdown(preview, renderOpts)
```

### Kochbuch: Transkript als Markdown rendern

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
    // Zweistufige Pipeline: Markdown → HTML → DOMPurify
    const rawHtml = md.render(daemonBlockToMarkdown(b));
    return DOMPurify.sanitize(rawHtml);
  })
  .join('\n');
```

Oder den integrierten konservativen HTML-Renderer verwenden (kein Markdown-Parsing, nur HTML-Escaping):

```ts
const html = state.blocks
  .map((b) => daemonBlockToHtml(b, { sanitizer: DOMPurify.sanitize }))
  .join('\n');
```

### Kochbuch: Klartext für Kopieren und Einfügen

```ts
const plain = state.blocks.map(daemonBlockToPlainText).join('\n');
navigator.clipboard.writeText(plain);
```

## Tool-Vorschau-Taxonomie (13 Arten)

| Art                   | Oberfläche                                           |
| --------------------- | ---------------------------------------------------- |
| `ask_user_question`   | Multiple-Choice-Frage mit Optionen                   |
| `command`             | Bash-ähnlicher Befehl + cwd                          |
| `file_diff`           | Dateibearbeitung mit oldText/newText oder Patch      |
| `file_read`           | Pfad + optionaler Zeilenbereich                      |
| `web_fetch`           | URL + HTTP-Methode                                   |
| `mcp_invocation`      | MCP-Server + Tool + Argumentzusammenfassung          |
| `code_block`          | Sprachgetaggtes Code-Snippet                         |
| `search`              | Suchanfrage + Ergebnisanzahl + Top-Ergebnisse        |
| `tabular`             | Spalten + Zeilen (max. 50, Kürzung markiert)         |
| `image_generation`    | Prompt + optionale Thumbnail-URL                     |
| `subagent_delegation` | Agentenname + Aufgabe                                |
| `key_value`           | Generische Label/Wert-Zeilen                         |
| `generic`             | Fallback-Zusammenfassung                             |

Jede hat eine `daemonToolPreviewToMarkdown`-Projektion. Benutzerdefinierte Renderer können auf `preview.kind` für eine reichhaltige, typabhängige Anzeige verzweigen (Dateidiff mit Syntaxhervorhebung, MCP-Server-Badge, Bild-Thumbnail usw.).

## Zustandsselektoren (PR-E)

```ts
selectCurrentTool(state); // → DaemonToolTranscriptBlock | undefined
selectApprovalMode(state); // → 'plan' | 'default' | 'auto-edit' | 'yolo' | undefined
selectToolProgress(state, toolCallId); // → { ratio?, step? } | undefined
selectPendingPermissionBlocks(state); // → ReadonlyArray<DaemonPermissionTranscriptBlock>
selectTranscriptBlocks(state); // → ReadonlyArray<DaemonTranscriptBlock>
selectTranscriptBlocksOrderedByEventId(state); // sortiert nach daemon-monotoner ID

// PR-K — Sub-Agent-Verschachtelung
selectSubagentChildBlocks(state, parentToolCallId); // nur direkte Kinder
isSubagentChildBlock(block); // Typwächter: wurde dieses Tool innerhalb eines Sub-Agenten aufgerufen?
```

`currentToolCallId` wird automatisch vom Reducer verwaltet:

- Gesetzt, wenn ein Tool in einen In-Flight-Status eintritt (`running` / `in_progress` / `pending` / `confirming`)
- Gelöscht, wenn das Tool einen Endstatus erreicht (`completed` / `failed` / `cancelled` / usw.)
- Unbekannte Status lassen es unberührt (vorwärtskompatibel)

## Abbruchweitergabe (PR-E)

Wenn `assistant.done.reason === 'cancelled'` durchläuft der Reducer jeden in Flight befindlichen Tool-Block und setzt dessen Status auf `'cancelled'`. Der Daemon garantiert keinen abschließenden `tool_call_update` für jedes in Flight befindliche Tool, wenn der übergeordnete Prompt abgebrochen wird – diese Weitergabe verhindert, dass UI-Spinner ewig drehen.

Sub-Agent-Kinder werden zusammen mit ihrem Elternteil abgebrochen, da die Abbruchlogik jeden in Flight befindlichen Tool-Block in `toolBlockByCallId` durchläuft, nicht nur den aktuellen Zeiger.

## Sub-Agent-Verschachtelung (PR-K)

Wenn der Haupt-Agent an einen Sub-Agenten delegiert (das `Task`-Tool oder Äquivalent), stempelt der Daemon `parentToolCallId` und `subagentType` auf die **Kind**-Tool-Aufrufe via `tool_call._meta`. Der Reducer liest beide und:

- Spiegelt `parentToolCallId` + `subagentType` auf `DaemonToolTranscriptBlock`
- Löst `parentBlockId` (die Transkriptblock-`id` des Elternteils) auf, wenn der Elternblock bereits im Zustand ist; andernfalls bleibt sie `undefined` und wird nachgefüllt, wenn der Elternblock später erscheint

Auftreten in falscher Reihenfolge (Kind vor Elternteil) wird transparent behandelt. Ein Kind, dessen Elternteil durch `maxBlocks` abgeschnitten wurde, behält `parentToolCallId` für Selektorabfragen, aber `parentBlockId` wird auf null gesetzt (die lose ID würde nicht mehr via `blockIndexById` aufgelöst werden).

```ts
import {
  selectSubagentChildBlocks,
  isSubagentChildBlock,
} from '@qwen-code/sdk/daemon';

// Einen Eltern-Tool-Block rendern, dann Kinder durchlaufen:
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

// Oder zur Renderzeit nach oberster Ebene vs. verschachtelt filtern:
const topLevel = state.blocks.filter((b) => !isSubagentChildBlock(b));
```

`selectSubagentChildBlocks` gibt nur **direkte** Kinder zurück. Rekursiv durchlaufen, um verschachtelte Sub-Agenten zu rendern (ein Sub-Agent innerhalb eines Sub-Agenten). Der Daemon emittiert keine Zyklen, aber Renderer, die via `parentBlockId` aufwärts gehen, sollten diese defensiv erkennen (z. B. Tiefenbegrenzung oder visited-Set).

Selbstreferenzen (`parentToolCallId === toolCallId`) werden vom Normalizer verworfen, bevor sie den Reducer erreichen.

## Zeitsemantik (PR-B)

```ts
interface DaemonTranscriptBlockBase {
  eventId?: number; // PRIMÄRER Sortierschlüssel — daemon-monoton
  serverTimestamp?: number; // BEVORZUGTE Anzeige — daemon-autoritativ
  clientReceivedAt: number; // FALLBACK — lokale Uhr
  createdAt: number; // @deprecated Alias für clientReceivedAt
}
```

**Immer nach `eventId` sortieren** (verwende `selectTranscriptBlocksOrderedByEventId`) bei der Anzeige langer Sitzungen. Der daemon-monotone Cursor bleibt über SSE-Wiederholung nach Wiederverbindung erhalten; Client-Uhren nicht.

**Anzeige-Zeitstempel immer von `serverTimestamp` formatieren** (mit Fallback auf `clientReceivedAt`). Mehrere Clients, die dieselbe Sitzung anzeigen, sehen nur dann dasselbe "vor 5 Minuten", wenn beide von der Daemon-Uhr lesen.

```ts
import { formatBlockTimestamp } from '@qwen-code/sdk/daemon';

const label = formatBlockTimestamp(block, {
  locale: 'zh-CN',
  timeZone: 'Asia/Shanghai',
  timeStyle: 'short',
});
```

## Adapter-Konformität (PR-G)

Validiere, dass dein Adapter das Referenzkorpus des SDK in semantisch äquivalente Ausgabe projiziert:

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

Das Fixture-Korpus (`DAEMON_UI_CONFORMANCE_FIXTURES`) deckt Chat, Tool-Lebenszyklus, Dateibearbeitungen, MCP, Berechtigungen, MCP-Budgetwarnung, Abbruch, Bereinigung fehlerhafter Nutzlasten, OAuth, Befehlsaktualisierungen und Sub-Agent-Verschachtelung ab. (Die Anzahl ist zur Laufzeit ableitbar – lies `DAEMON_UI_CONFORMANCE_FIXTURES.length`.)

**Formatunabhängig** – dein Adapter kann nach ANSI / HTML / Markdown / JSX rendern; das Framework prüft nur semantischen Inhalt via `expectedContains` und `expectedAbsent`.

## Fehlerkategorisierung (PR-A)

`DaemonUiErrorEvent.errorKind` ist ein geschlossener Enum, der aus der typisierten Fehler-Taxonomie des Daemon weitergegeben wird (wenn der Daemon ihn stempelt):

```ts
import type { DaemonErrorKind } from '@qwen-code/sdk/daemon';
// 'missing_binary' | 'blocked_egress' | 'auth_env_error' | 'init_timeout'
// | 'protocol_error' | 'missing_file' | 'parse_error' | 'budget_exhausted'
```

Renderer sollten auf `errorKind` verzweigen, um umsetzbare Hinweise zu geben:

```ts
function errorAffordance(errorKind?: DaemonErrorKind): React.ReactNode {
  switch (errorKind) {
    case 'auth_env_error': return <button>Erneut authentifizieren</button>;
    case 'missing_file':   return <button>Datei auswählen</button>;
    case 'blocked_egress': return <span>Netzwerk blockiert – Proxy prüfen</span>;
    default:               return null;
  }
}
```

## Tool-Herkunftsverteilung (PR-A)

`DaemonUiToolUpdateEvent.provenance` ist ein geschlossener Enum (`builtin` / `mcp` / `subagent` / `unknown`). Mit `serverId?: string` bei `mcp`. Verwende es für Icons und Badges:

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

Das SDK hat eine `mcp__<server>__<tool>`-Namensheuristik als Fallback – selbst wenn der Daemon die Herkunft nicht explizit stempelt, sind MCP-Tools erkennbar.

## Vorwärtskompatibilitätsprinzipien

Jede Schicht im Daemon-UI-SDK folgt dem **Vorwärtskompatibilitätsprinzip**: Unbekannte Werte werfen KEINE Exceptions; sie degradieren elegant.

- Unbekannte Daemon-Event-Typen → `debug`-Event mit dem rohen Typnamen
- Unbekannter Tool-Status → `currentToolCallId` bleibt unberührt (kein Löschen)
- Unbekannte Error-Art → `errorKind` undefined (Renderer fällt auf Text zurück)
- Fehlender serverTimestamp → fällt auf `clientReceivedAt` zurück
- Unerkannte Vorschauform → `generic`-Art mit `summary`

Das bedeutet, **das SDK kann vor der Daemon-Emission ausgeliefert werden**. PR-As Tool-Herkunfts-Heuristik, PR-Bs Drei-Ort-Zeitstempel-Extraktion und PR-Es Erhalt unbekannter Status sind alles Beispiele für "bereit, wenn der Daemon sendet; sicher, wenn nicht."

## Querverweise

- [PR #4328](https://github.com/QwenLM/qwen-code/pull/4328) — Basis-PR mit der gemeinsamen UI-Transkriptschicht
- [PR #4353](https://github.com/QwenLM/qwen-code/pull/4353) — dieser PR (vereinheitlichter Vollständigkeits-Follow-up)
- [Issue #3803](https://github.com/QwenLM/qwen-code/issues/3803) — Daemon-Mode-Vorschlag
- [Issue #4175](https://github.com/QwenLM/qwen-code/issues/4175) — Mode B v0.16 Implementierungs-Tracker