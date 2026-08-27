# Migration zu `@qwen-code/sdk/daemon` v2

PR #4328 hat die v1-Daemon-UI-Schicht ausgeliefert. PR #4353 (dieser PR) liefert v2 mit sieben zusätzlichen Feature-Commits. Diese Anleitung führt zuerst durch die Änderungen für Autoren von Web-Chat- und Web-Terminal-Adaptern. Maintainer von nativen lokalen TUI-, Channel- und IDE-Implementierungen können dieselben Grundlagen später wiederverwenden, aber diese Standard-Produktpfade werden von diesem PR nicht migriert.

## TL;DR für bestehende Nutzer

**Keine Breaking Changes.** Jeder Commit in diesem PR ist additiv:

- v1-Felder funktionieren weiterhin (`createdAt` bleibt als `@deprecated`-Alias für `clientReceivedAt` erhalten)
- v1-Normalizer bildet weiterhin dieselben 13 Ereignistypen auf dieselbe Weise ab
- v1-Reducer erzeugt weiterhin dieselben Blöcke für Chat-Ereignisse
- Neue API ist opt-in über zusätzliche Parameter und Hilfsfunktionen

Der PR kann ohne Änderungen von Nutzern sicher gemergt werden. **Die Einführung der neuen Funktionen erfolgt inkrementell.**

## Empfohlene Einführungsreihenfolge

Für jeden Adapter, in Reihenfolge des Aufwands-/Wertverhältnisses:

### 1. Sortierung: Umstellung des Sortierschlüssels von `createdAt` auf `eventId`

**Vorher:**

```ts
const ordered = [...state.blocks].sort((a, b) => a.createdAt - b.createdAt);
```

**Nachher:**

```ts
import { selectTranscriptBlocksOrderedByEventId } from '@qwen-code/sdk/daemon';
const ordered = selectTranscriptBlocksOrderedByEventId(state);
```

**Warum**: `eventId` ist daemon-monoton; überlebt SSE-Replay nach Wiederverbindung. `createdAt` ist die Client-Uhr und verschiebt sich bei Replay.

### 2. Anzeige: Umstellung von `createdAt` auf `serverTimestamp ?? clientReceivedAt`

**Vorher:**

```tsx
<TimeLabel ms={block.createdAt} />
```

**Nachher:**

```tsx
import { formatBlockTimestamp } from '@qwen-code/sdk/daemon';
<TimeLabel text={formatBlockTimestamp(block, { locale })} />;
```

**Warum**: Mehrere Clients sehen „X Minuten her" nur dann konsistent, wenn beide die Daemon-Uhr lesen. Der Renderer plus `formatBlockTimestamp` behandelt Zeitzone und Locale.

**Hinweis**: Der Daemon muss `_meta.serverTimestamp` auf Envelopes stempeln, damit dies greift. SDK vorwärtskompatibel; fällt bis dahin auf `clientReceivedAt` zurück.

### 3. Auf neue Ereignistypen hören – Teilmenge zur Darstellung auswählen

Die 16 neuen Ereignistypen (session-meta, workspace, auth) erzeugen keine Transcript-Blöcke. Sie sind Sidechannel-Beobachtungen. Jeder Adapter wählt aus, welche er anzeigen möchte:

```ts
// In Ihrem SSE-Consumer
const uiEvents = normalizeDaemonEvent(envelope, {
  clientId,
  suppressOwnUserEcho: true,
});
store.dispatch(uiEvents);

// Dann in Ihrer UI-Seite
for (const event of uiEvents) {
  switch (event.type) {
    case 'session.approval_mode.changed':
      myApprovalModeBadge.update(event.next);
      break;
    case 'workspace.mcp.budget_warning':
      myToast.show(
        `MCP-Server nähern sich dem Budget: ${event.liveCount}/${event.budget}`,
      );
      break;
    case 'auth.device_flow.started':
      myAuthModal.show({
        deviceFlowId: event.deviceFlowId,
        providerId: event.providerId,
        expiresAt: event.expiresAt,
      });
      break;
    // ... usw., opt-in für das, was Ihre UI benötigt
  }
}
```

Oder verwenden Sie Selektoren für zustandsgespiegelte Sidechannels:

```ts
import { selectApprovalMode, selectCurrentTool } from '@qwen-code/sdk/daemon';

const mode = selectApprovalMode(state); // gespiegelt von approval_mode.changed
const currentTool = selectCurrentTool(state); // aktuelles laufendes Tool
```

### 4. Render-Vertrag: Verwendung von `daemonBlockToMarkdown` (oder HTML / plainText)

**Vorher** (jeder Adapter macht seine eigene Projektion):

```ts
function blockToString(block: DaemonTranscriptBlock): string {
  switch (block.kind) {
    case 'user':
      return `You: ${block.text}`;
    case 'assistant':
      return block.text;
    case 'tool':
      return `[${block.title}]\n${block.status}`;
    // ... usw.
  }
}
```

**Nachher** (Delegation an das SDK):

```ts
import { daemonBlockToMarkdown } from '@qwen-code/sdk/daemon';
const md = daemonBlockToMarkdown(block);
```

Für HTML-SSR:

```ts
import MarkdownIt from 'markdown-it';
import DOMPurify from 'dompurify';
const html = DOMPurify.sanitize(md.render(daemonBlockToMarkdown(block)));
```

Für reinen Text:

```ts
import { daemonBlockToPlainText } from '@qwen-code/sdk/daemon';
const plain = daemonBlockToPlainText(block);
```

### 5. Konformitätstest

Fügen Sie Ihrer Testsuite hinzu:

```ts
import { runAdapterConformanceSuite } from '@qwen-code/sdk/daemon';

it('adapter projects daemon UI corpus correctly', () => {
  const result = runAdapterConformanceSuite({
    reduce: (events) => myReduce(events),
    renderToText: (state) => myRender(state),
  });
  expect(result.failed).toEqual([]);
});
```

Dies führt Ihren Adapter gegen 10 Fixture-Szenarien aus und deckt Projektionsabweichungen auf, bevor sie die Nutzer erreichen.

### 6. Werkzeug-Symbol-Dispatch via `provenance`

**Vorher** (String-Vergleich auf toolName):

```tsx
const isMcp = toolName?.startsWith('mcp__');
const isBuiltin = ['Bash', 'Edit', 'Read'].includes(toolName);
```

**Nachher** (typisierte Provenance aus PR-A):

```tsx
import type { DaemonUiToolUpdateEvent } from '@qwen-code/sdk/daemon';

function toolIcon(event: DaemonUiToolUpdateEvent): React.ReactNode {
  switch (event.provenance) {
    case 'mcp':
      return <McpIcon server={event.serverId} />;
    case 'subagent':
      return <SubagentIcon />;
    case 'builtin':
      return <BuiltinIcon name={event.toolName} />;
    case 'unknown':
    default:
      return <GenericIcon />;
  }
}
```

Das SDK hat eine `mcp__<server>__<tool>`-Heuristik als Fallback – funktioniert bereits heute, auch wenn der Daemon keine Provenance explizit stampelt.

### 7. Fehlerkategorisierung via `errorKind`

**Vorher** (Regex auf Text):

```ts
if (error.text.includes('auth')) showAuthRetry();
else if (error.text.includes('file not found')) showFilePicker();
```

**Nachher** (geschlossenes Enum aus PR-A):

```ts
import type { DaemonErrorKind } from '@qwen-code/sdk/daemon';

function errorAction(errorKind?: DaemonErrorKind): React.ReactNode {
  switch (errorKind) {
    case 'auth_env_error': return <RetryAuthButton />;
    case 'missing_file':   return <FilePicker />;
    case 'blocked_egress': return <CheckProxyHint />;
    case 'init_timeout':   return <RestartDaemonButton />;
    default:               return null;
  }
}
```

**Hinweis**: Der Daemon muss `data.errorKind` auf session_died / stream_error stempeln, damit dies befüllt wird. Das SDK liest es bereits.

### 8. Abbruchbehandlung – bereits automatisch

In v1 hinterlassen abgebrochene Prompts in Bearbeitung befindliche Tool-Blöcke, die endlos drehen. In v2 (PR-E) läuft `propagateCancellationToInFlightTools` automatisch bei `assistant.done.reason === 'cancelled'`. Sub-Agent-Kinder werden zusammen mit ihrem Elternteil abgebrochen.

**Keine Adapter-Änderungen erforderlich** – Ihre Spinner werden korrekt aufgelöst.

### 8a. Sub-Agent-Verschachtelung – Opt-in für verschachteltes Rendering (PR-K)

Tool-Blöcke, die innerhalb einer Sub-Agent-Delegation aufgerufen werden, tragen jetzt `parentToolCallId`, `subagentType` und (wenn der Elternteil im Zustand ist) `parentBlockId`. Adapter können opt-in für verschachteltes Rendering wählen:

**Vorher** (flache Liste, Sub-Agent-Aufrufe optisch nicht von Top-Level zu unterscheiden):

```tsx
state.blocks.map((b) => <ToolBlock block={b} />);
```

**Nachher** (rekursives verschachteltes Rendering):

```tsx
import {
  selectSubagentChildBlocks,
  isSubagentChildBlock,
} from '@qwen-code/sdk/daemon';

function renderTool(block) {
  const children = selectSubagentChildBlocks(state, block.toolCallId);
  return (
    <ToolBlock block={block}>
      {block.subagentType && <SubagentBadge type={block.subagentType} />}
      {children.length > 0 && <Indent>{children.map(renderTool)}</Indent>}
    </ToolBlock>
  );
}

const topLevel = state.blocks.filter((b) => !isSubagentChildBlock(b));
return topLevel.map(renderTool);
```

**Keine Adapter-Änderungen erforderlich, wenn Sie die flache Ansicht bevorzugen** – die neuen Felder sind additiv und werden von Code ignoriert, der sie nicht liest.

### 9. Werkzeug-Vorschau-Taxonomie – Teilmenge zur Darstellung mit benutzerdefinierten Komponenten auswählen

PR-D + PR-F bringen 13 Vorschau-Arten:

- 4 dateiförmige: `file_diff`, `file_read`, `web_fetch`, `mcp_invocation`
- 5 inhaltsförmige: `code_block`, `search`, `tabular`, `image_generation`, `subagent_delegation`
- 2 Steuerungsarten: `ask_user_question`, `command`
- 2 generische: `key_value`, `generic`

Jeder Adapter dispatched auf `preview.kind`:

```tsx
function ToolPreviewComponent({ preview }: { preview: DaemonToolPreview }) {
  switch (preview.kind) {
    case 'file_diff':
      return (
        <UnifiedDiffView
          path={preview.path}
          old={preview.oldText}
          new={preview.newText}
        />
      );
    case 'mcp_invocation':
      return (
        <McpCard serverId={preview.serverId} toolName={preview.toolName} />
      );
    case 'tabular':
      return <DataTable columns={preview.columns} rows={preview.rows} />;
    case 'image_generation':
      return (
        <ImagePreview
          thumbnailUrl={preview.thumbnailUrl}
          prompt={preview.prompt}
        />
      );
    // ... oder Fallback auf:
    default:
      return <Markdown text={daemonToolPreviewToMarkdown(preview)} />;
  }
}
```

Adapter ohne benutzerdefinierte Komponenten für alle 13 Arten können auf die `daemonToolPreviewToMarkdown`-Methode des SDK für jede nicht behandelte Art zurückfallen.

## Rückwärtskompatibilitäts-Checkliste

| Aspekt                                                | Status                                        |
| ----------------------------------------------------- | --------------------------------------------- |
| Bestehende `block.createdAt`-Abrufe                   | ✅ funktioniert weiterhin (Alias für `clientReceivedAt`) |
| Bestehende Reducer-Ereignisverarbeitung               | ✅ unverändert für v1-Ereignistypen               |
| `daemonTranscriptToUnifiedMessages(blocks)`-Aufrufstellen | ✅ neuer Parameter `options` ist optional              |
| Bestehende `selectTranscriptBlocks`-Nutzer                | ✅ unverändert                                  |
| Neue Ereignistypen im v1-Reducer                          | ✅ No-Op, `lastEventId` wird weiterhin erhöht        |

## Querverweise

- [PR #4353 ZUSAMMENFASSUNG](https://github.com/QwenLM/qwen-code/pull/4353)
- [Daemon UI README](./README.md) — vollständige API-Referenz
- [PR #4328](https://github.com/QwenLM/qwen-code/pull/4328) — Basis-PR mit gemeinsam genutzter UI-Transcript-Schicht