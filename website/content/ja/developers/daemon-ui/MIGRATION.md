# `@qwen-code/sdk/daemon` v2 への移行

PR #4328 で v1 daemon UI レイヤーが導入されました。PR #4353（本 PR）では、7 つの機能コミットを追加した v2 を提供します。このガイドでは、まず Web チャットおよび Web ターミナルアダプターの作成者向けの変更点について説明します。ネイティブのローカル TUI、チャンネル、IDE のメンテナーも後から同じプリミティブを再利用できますが、それらのデフォルトプロダクトパスは本 PR では移行対象外です。

## 既存ユーザー向け TL;DR

**破壊的変更はありません。** 本 PR のすべてのコミットは追加的なものです。

- v1 のフィールドは引き続き動作します（`createdAt` は `clientReceivedAt` の `@deprecated` エイリアスとして保持）
- v1 のノーマライザーは同じ 13 種類のイベントタイプを同じように処理し続けます
- v1 のリデューサーはチャットイベントに対して同じブロックを生成し続けます
- 新しい API は追加パラメーターとヘルパーによるオプトイン方式です

本 PR はコンシューマー側の変更なしに安全にマージできます。**新機能の採用は段階的に行えます。**

## 推奨採用順序

各アダプターについて、労力対効果の比率の高い順に：

### 1. 順序付け：ソートキーを `createdAt` から `eventId` へ切り替え

**変更前：**

```ts
const ordered = [...state.blocks].sort((a, b) => a.createdAt - b.createdAt);
```

**変更後：**

```ts
import { selectTranscriptBlocksOrderedByEventId } from '@qwen-code/sdk/daemon';
const ordered = selectTranscriptBlocksOrderedByEventId(state);
```

**理由**: `eventId` は daemon の単調増加値のため、再接続後の SSE リプレイ時にも有効です。`createdAt` はクライアントクロックに依存しており、リプレイ時にずれが生じます。

### 2. 表示：`createdAt` を `serverTimestamp ?? clientReceivedAt` へ切り替え

**変更前：**

```tsx
<TimeLabel ms={block.createdAt} />
```

**変更後：**

```tsx
import { formatBlockTimestamp } from '@qwen-code/sdk/daemon';
<TimeLabel text={formatBlockTimestamp(block, { locale })} />;
```

**理由**: 複数のクライアントが「X 分前」を一貫して表示するには、両者が daemon クロックを参照する必要があります。レンダラーと `formatBlockTimestamp` がタイムゾーンとロケールを処理します。

**注意**: daemon がエンベロープに `_meta.serverTimestamp` を付与することでこの機能が有効になります。SDK は前方互換に対応しており、それまでは `clientReceivedAt` にフォールバックします。

### 3. 新しいイベントタイプのリッスン — レンダリングするサブセットを選択

16 種類の新しいイベントタイプ（session-meta、workspace、auth）はトランスクリプトブロックをプッシュしません。これらはサイドチャネルの観測値です。各アダプターはどれを表示するかを選択します。

```ts
// SSE コンシューマー内
const uiEvents = normalizeDaemonEvent(envelope, {
  clientId,
  suppressOwnUserEcho: true,
});
store.dispatch(uiEvents);

// UI 側で
for (const event of uiEvents) {
  switch (event.type) {
    case 'session.approval_mode.changed':
      myApprovalModeBadge.update(event.next);
      break;
    case 'workspace.mcp.budget_warning':
      myToast.show(
        `MCP servers approaching budget: ${event.liveCount}/${event.budget}`,
      );
      break;
    case 'auth.device_flow.started':
      myAuthModal.show({
        deviceFlowId: event.deviceFlowId,
        providerId: event.providerId,
        expiresAt: event.expiresAt,
      });
      break;
    // ... など、UI に必要なものをオプトイン
  }
}
```

または、状態ミラーリングされたサイドチャネルにセレクターを使用します。

```ts
import { selectApprovalMode, selectCurrentTool } from '@qwen-code/sdk/daemon';

const mode = selectApprovalMode(state); // approval_mode.changed からミラー
const currentTool = selectCurrentTool(state); // 現在実行中のツール
```

### 4. レンダリング契約：`daemonBlockToMarkdown`（または HTML / plainText）を使用

**変更前**（各アダプターが独自に変換処理を実装）：

```ts
function blockToString(block: DaemonTranscriptBlock): string {
  switch (block.kind) {
    case 'user':
      return `You: ${block.text}`;
    case 'assistant':
      return block.text;
    case 'tool':
      return `[${block.title}]\n${block.status}`;
    // ... など
  }
}
```

**変更後**（SDK に委譲）：

```ts
import { daemonBlockToMarkdown } from '@qwen-code/sdk/daemon';
const md = daemonBlockToMarkdown(block);
```

HTML SSR の場合：

```ts
import MarkdownIt from 'markdown-it';
import DOMPurify from 'dompurify';
const html = DOMPurify.sanitize(md.render(daemonBlockToMarkdown(block)));
```

プレーンテキストの場合：

```ts
import { daemonBlockToPlainText } from '@qwen-code/sdk/daemon';
const plain = daemonBlockToPlainText(block);
```

### 5. 適合テスト

アダプターのテストスイートに追加します。

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

これにより、10 種類のフィクスチャシナリオに対してアダプターが検証され、ユーザーに届く前に変換のずれを検出できます。

### 6. `provenance` によるツールアイコンのディスパッチ

**変更前**（toolName の文字列マッチ）：

```tsx
const isMcp = toolName?.startsWith('mcp__');
const isBuiltin = ['Bash', 'Edit', 'Read'].includes(toolName);
```

**変更後**（PR-A の型付き provenance を使用）：

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

SDK には `mcp__<server>__<tool>` の命名規則によるヒューリスティックフォールバックがあり、daemon が明示的に provenance を付与していない現時点でも動作します。

### 7. `errorKind` によるエラーの分類

**変更前**（テキストへの正規表現）：

```ts
if (error.text.includes('auth')) showAuthRetry();
else if (error.text.includes('file not found')) showFilePicker();
```

**変更後**（PR-A のクローズド enum）：

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

**注意**: daemon が session_died / stream_error の `data.errorKind` に値を付与することでこのフィールドが設定されます。SDK はすでに読み取りに対応しています。

### 8. キャンセル処理 — 自動化済み

v1 では、キャンセルされたプロンプトにより実行中のツールブロックが永遠にスピンし続けることがありました。v2（PR-E）では、`assistant.done.reason === 'cancelled'` 時に `propagateCancellationToInFlightTools` が自動的に実行されます。サブエージェントの子は親と一緒にキャンセルされます。

**アダプターの変更は不要です** — スピナーは正しく解決されます。

### 8a. サブエージェントのネスト — ネストレンダリングへのオプトイン（PR-K）

サブエージェントの委譲内で呼び出されたツールブロックには、`parentToolCallId`、`subagentType`、（親が状態にある場合は）`parentBlockId` が付与されます。アダプターはネストレンダリングにオプトインできます。

**変更前**（フラットリスト、サブエージェントの呼び出しがトップレベルと視覚的に区別不可）：

```tsx
state.blocks.map((b) => <ToolBlock block={b} />);
```

**変更後**（再帰的なネストレンダリング）：

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

**フラットビューを維持したい場合はアダプターの変更は不要です** — 新しいフィールドは追加的なもので、読み取らないコードからは無視されます。

### 9. ツールプレビューの分類 — カスタムコンポーネントでレンダリングするサブセットを選択

PR-D + PR-F では 13 種類のプレビューが提供されます。

- ファイル型（4 種）: `file_diff`、`file_read`、`web_fetch`、`mcp_invocation`
- コンテンツ型（5 種）: `code_block`、`search`、`tabular`、`image_generation`、`subagent_delegation`
- 制御型（2 種）: `ask_user_question`、`command`
- 汎用型（2 種）: `key_value`、`generic`

各アダプターは `preview.kind` でディスパッチします。

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
    // ... または以下にフォールバック：
    default:
      return <Markdown text={daemonToolPreviewToMarkdown(preview)} />;
  }
}
```

13 種類すべてにカスタムコンポーネントを持たないアダプターは、未対応の種類に対して SDK の `daemonToolPreviewToMarkdown` にフォールバックできます。

## 後方互換チェックリスト

| 確認事項 | ステータス |
| ------------------------------------------------------ | --------------------------------------------- |
| 既存の `block.createdAt` の読み取り | ✅ 引き続き動作（`clientReceivedAt` のエイリアス） |
| 既存のリデューサーのイベント処理 | ✅ v1 イベントタイプは変更なし |
| `daemonTranscriptToUnifiedMessages(blocks)` の呼び出し箇所 | ✅ 新しい options パラメーターはオプション |
| 既存の `selectTranscriptBlocks` のコンシューマー | ✅ 変更なし |
| v1 リデューサー内の新しいイベントタイプ | ✅ no-op、`lastEventId` は引き続き進行 |

## 相互参照

- [PR #4353 SUMMARY](https://github.com/QwenLM/qwen-code/pull/4353)
- [Daemon UI README](./README.md) — 完全な API リファレンス
- [PR #4328](https://github.com/QwenLM/qwen-code/pull/4328) — 共有 UI トランスクリプトレイヤーを含むベース PR
