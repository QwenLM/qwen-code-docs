# Migration zu `@qwen-code/sdk/daemon` v2

PR #4328 hat die v1-Daemon-UI-Ebene ausgeliefert. PR #4353 (dieser PR) liefert v2 mit sieben additiven Feature-Commits aus. Dieser Leitfaden führt Sie zunächst durch die Änderungen für Web-Chat- und Web-Terminal-Adapter-Autoren. Maintainer von nativen lokalen TUI-, Kanal- und IDE-Implementierungen können die gleichen Primitiven später wiederverwenden, aber diese Standard-Produktpfade werden von diesem PR nicht migriert.

## TL;DR für bestehende Nutzer

**Keine Breaking Changes.** Jeder Commit in diesem PR ist additiv:

- v1-Felder funktionieren weiterhin (`createdAt` bleibt als `@deprecated`-Alias für `clientReceivedAt` erhalten)
- v1-Normalizer bildet weiterhin dieselben 13 Ereignistypen auf dieselbe Weise ab
- v1-Reduzierer erzeugt weiterhin dieselben Blöcke für Chat-Ereignisse
- Neue API ist per zusätzlicher Parameter und Helfer opt-in

Der PR kann ohne Änderungen auf Konsumentenseite sicher gemergt werden. **Die Einführung der neuen Features erfolgt inkrementell.**

## Empfohlene Einführungsreihenfolge

Für jeden Adapter, in der Reihenfolge des Aufwands-/Nutzen-Verhältnisses:

### 1. Bestellung: Sortierschlüssel von `createdAt` auf `eventId` umstellen

**Vorher:**

```ts
const ordered = [...state.blocks].sort((a, b) => a.createdAt - b.createdAt);
```

**Nachher:**

```ts
import { selectTranscriptBlocksOrderedByEventId } from '@qwen-code/sdk/daemon';
const ordered = selectTranscriptBlocksOrderedByEventId(state);
```

**Warum**: `eventId` ist daemon-monoton; überlebt SSE-Replay nach Wiederverbindung.
`createdAt` ist die Client-Uhr und verschiebt sich bei Replay.

### 2. Anzeige: `createdAt` auf `serverTimestamp ?? clientReceivedAt` umstellen

**Vorher:**

```tsx
<TimeLabel ms={block.createdAt} />
```

**Nachher:**

```tsx
import { formatBlockTimestamp } from '@qwen-code/sdk/daemon';
<TimeLabel text={formatBlockTimestamp(block, { locale })} />;
```

**Warum**: Mehrere Clients sehen konsistent „X Minuten zuvor" nur, wenn beide die Daemon-Uhr lesen. Renderer plus `formatBlockTimestamp` kümmern sich um Zeitzone und Gebietsschema.

**Hinweis:** Der Daemon muss `_meta.serverTimestamp` auf Envelopes stempeln, damit dieser Effekt eintritt. SDK ist vorwärtskompatibel; fällt bis dahin auf `clientReceivedAt` zurück.

### 3. Auf neue Ereignistypen hören — Teilmenge zum Rendern auswählen

Die 16 neuen Ereignistypen (session-meta, workspace, auth) schieben keine Transkript-Blöcke. Sie sind Sidechannel-Beobachtungen. Jeder Adapter wählt aus, welche er anzeigen möchte:

```ts
// In Ihrem SSE-Konsument
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
    // ... usw., nach Bedarf in Ihre UI einbinden
  }
}
```

Oder Selektoren für zustandsgespiegelte Sidechannels verwenden:

```ts
import { selectApprovalMode, selectCurrentTool } from '@qwen-code/sdk/daemon';

const mode = selectApprovalMode(state); // gespiegelt von approval_mode.changed
const currentTool = selectCurrentTool(state); // aktuelles laufendes Tool
```

### 4. Render-Vertrag: `daemonBlockToMarkdown` verwenden (oder HTML / PlainText)

**Vorher** (jeder Adapter macht seine eigene Projektion):

```ts
function blockToString(block: DaemonTranscriptBlock): string {
  switch (block.kind) {
    case 'user':
      return `Sie: ${block.text}`;
    case 'assistant':
      return block.text;
    case 'tool':
      return `[${block.title}]\n${block.status}`;
    // ... usw.
  }
}
```

**Nachher** (Delegation an SDK):

```ts
import { daemonBlockToMarkdown } from '@qwen-code/sdk/daemon';
const md = daemonBlockToMarkdown(block);
```

Für HTML SSR:

```ts
import MarkdownIt from 'markdown-it';
import DOMPurify from 'dompurify';
const html = DOMPurify.sanitize(md.render(daemonBlockToMarkdown(block)));
```

Für Klartext:

```ts
import { daemonBlockToPlainText } from '@qwen-code/sdk/daemon';
const plain = daemonBlockToPlainText(block);
```

### 5. Konformitätstest

Zu Ihrer Adapter-Testsuite hinzufügen:

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

Dies führt Ihren Adapter gegen 10 Fixture-Szenarien aus und zeigt jegliche Projektionsabweichungen, bevor sie die Nutzer erreichen.

### 6. Tool-Icon-Dispatch über `provenance`

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
SDK hat eine `mcp__<server>__<tool>`-Benennungsheuristik als Fallback – funktioniert bereits heute, auch wenn der Daemon keine explizite Provenienz stempelt.

### 7. Fehlerkategorisierung via `errorKind`

**Vorher** (Regex auf Text):

```ts
if (error.text.includes('auth')) showAuthRetry();
else if (error.text.includes('file not found')) showFilePicker();
```

**Nachher** (geschlossener Enum aus PR-A):

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

**Hinweis**: Der Daemon muss `data.errorKind` bei session_died / stream_error stempeln, damit dies befüllt wird. Das SDK liest es bereits.

### 8. Abbruchbehandlung – bereits automatisch

In v1 ließen abgebrochene Prompts in Bearbeitung befindliche Tool-Blöcke für immer rotieren.
In v2 (PR-E) läuft `propagateCancellationToInFlightTools` automatisch bei `assistant.done.reason === 'cancelled'`. Sub-Agent-Kinder werden zusammen mit ihrem Eltern-Element abgebrochen.

**Keine Adapter-Änderungen nötig** – Ihre Spinner werden korrekt aufgelöst.

### 8a. Sub-Agent-Verschachtelung – Opt-in zu verschachteltem Rendering (PR-K)

Tool-Blöcke, die innerhalb einer Sub-Agent-Delegation aufgerufen werden, tragen jetzt `parentToolCallId`, `subagentType` und (wenn der Eltern-Element im Zustand ist) `parentBlockId`. Adapter können für verschachteltes Rendering optieren:

**Vorher** (flache Liste, Sub-Agent-Aufrufe visuell nicht von Top-Level unterscheidbar):

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

**Keine Adapter-Änderungen nötig, wenn Sie die flache Ansicht bevorzugen** – die neuen Felder sind additiv und werden von Code, der sie nicht liest, ignoriert.

### 9. Tool-Preview-Taxonomie – Teilmenge auswählen, um mit benutzerdefinierten Komponenten zu rendern

PR-D + PR-F bringen 13 Preview-Arten:

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
    // ... oder fallback auf:
    default:
      return <Markdown text={daemonToolPreviewToMarkdown(preview)} />;
  }
}
```

Adapter ohne benutzerdefinierte Komponenten für alle 13 Arten können auf das `daemonToolPreviewToMarkdown` des SDKs für jede nicht behandelte Art zurückfallen.

## Rückwärtskompatibilitäts-Checkliste

| Anliegen                                                | Status                                        |
| ------------------------------------------------------- | --------------------------------------------- |
| Bestehende Lesezugriffe auf `block.createdAt`           | ✅ funktioniert weiterhin (Alias für `clientReceivedAt`) |
| Bestehende Reducer-Ereignisbehandlung                   | ✅ unverändert für v1-Ereignistypen           |
| Aufrufstellen von `daemonTranscriptToUnifiedMessages(blocks)` | ✅ neuer Optionen-Parameter ist optional      |
| Bestehende Konsumenten von `selectTranscriptBlocks`     | ✅ unverändert                                 |
| Neue Ereignistypen im v1-Reducer                        | ✅ No-op, `lastEventId` wird weiterhin hochgezählt |

## Querverweise

- [PR #4353 SUMMARY](https://github.com/QwenLM/qwen-code/pull/4353)
- [Daemon UI README](./README.md) – vollständige API-Referenz
- [PR #4328](https://github.com/QwenLM/qwen-code/pull/4328) – Basis-PR mit gemeinsamem UI-Transcript-Layer
