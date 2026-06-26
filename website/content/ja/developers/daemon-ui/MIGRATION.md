# `@qwen-code/sdk/daemon` v2 への移行

PR #4328 で v1 デーモン UI レイヤーがリリースされました。PR #4353（この PR）では、7 つの追加機能コミットを含む v2 がリリースされています。このガイドでは、最初に Web チャットおよび Web ターミナルアダプターの作成者向けの変更内容を説明します。ネイティブのローカル TUI、チャンネル、IDE のメンテナーは後で同じプリミティブを再利用できますが、これらのデフォルトのプロダクトパスはこの PR では移行されません。

## 既存のコンシューマー向け TL;DR

**破壊的変更はありません。** この PR のすべてのコミットは追加的なものです：

- v1 のフィールドは引き続き動作します（`createdAt` は `clientReceivedAt` の `@deprecated` エイリアスとして保持）
- v1 ノーマライザーは引き続き同じ 13 のイベントタイプを同じ方法でマッピングします
- v1 リデューサーは引き続きチャットイベントに対して同じブロックを生成します
- 新しい API は追加のパラメーターとヘルパーを通じてオプトイン方式です

この PR はコンシューマーの変更なしでマージしても安全です。**新機能の採用は段階的に行えます。**

## 推奨される採用順序

各アダプターについて、労力/価値比の順に：

### 1. 並び順：ソートキーを `createdAt` から `eventId` に変更

**Before：**

```ts
const ordered = [...state.blocks].sort((a, b) => a.createdAt - b.createdAt);
```

**After：**

```ts
import { selectTranscriptBlocksOrderedByEventId } from '@qwen-code/sdk/daemon';
const ordered = selectTranscriptBlocksOrderedByEventId(state);
```

**理由**：`eventId` はデーモン内で単調増加し、SSE の再接続後のリプレイにも耐えます。`createdAt` はクライアント時刻であり、リプレイ時にずれます。

### 2. 表示：`createdAt` を `serverTimestamp ?? clientReceivedAt` に切り替え

**Before：**

```tsx
<TimeLabel ms={block.createdAt} />
```

**After：**

```tsx
import { formatBlockTimestamp } from '@qwen-code/sdk/daemon';
<TimeLabel text={formatBlockTimestamp(block, { locale })} />;
```

**理由**：複数のクライアントが一貫した「X 分前」を表示するには、両方がデーモンクロックを参照する必要があります。`formatBlockTimestamp` とレンダラーがタイムゾーンとロケールを処理します。

**注**：これを有効にするには、デーモンがエンベロープに `_meta.serverTimestamp` をスタンプする必要があります。SDK は前方互換性があり、それまでは `clientReceivedAt` にフォールバックします。

### 3. 新しいイベントタイプをリッスン — レンダリングするサブセットを選択

16 の新しいイベントタイプ（session-meta、workspace、auth）はトランスクリプトブロックをプッシュしません。これらはサイドチャネル観測です。各アダプターはどのイベントを表示するかを選択します：

```ts
// あなたの SSE コンシューマー内
const uiEvents = normalizeDaemonEvent(envelope, {
  clientId,
  suppressOwnUserEcho: true,
});
store.dispatch(uiEvents);

// その後、UI 側で
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
    // ... など、UI が必要なものをオプトイン
  }
}
```

または、ステートミラーリングされたサイドチャネル用のセレクターを使用します：

```ts
import { selectApprovalMode, selectCurrentTool } from '@qwen-code/sdk/daemon';

const mode = selectApprovalMode(state); // approval_mode.changed からミラーリング
const currentTool = selectCurrentTool(state); // 現在処理中のツール
```

### 4. レンダリング契約：`daemonBlockToMarkdown`（または HTML / plainText）を使用

**Before**（各アダプターが独自のプロジェクションを行う）：

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

**After**（SDK に委譲）：

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

### 5. 適合性テスト

アダプターのテストスイートに追加します：

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

これにより、アダプターが 10 のフィクスチャシナリオに対してテストされ、ユーザーに届く前にプロジェクションのずれが表面化します。

### 6. `provenance` によるツールアイコンの振り分け

**Before**（toolName の文字列マッチ）：

```tsx
const isMcp = toolName?.startsWith('mcp__');
const isBuiltin = ['Bash', 'Edit', 'Read'].includes(toolName);
```

**After**（PR-A からの型付き provenance）：

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

SDK には `mcp__<server>__<tool>` という命名ヒューリスティックのフォールバックがあり、デーモンが明示的に provenance をスタンプしなくても現在動作します。

### 7. `errorKind` によるエラー分類

**Before**（テキストの正規表現）：

```ts
if (error.text.includes('auth')) showAuthRetry();
else if (error.text.includes('file not found')) showFilePicker();
```

**After**（PR-A からの閉じた列挙型）：

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

**注**：これを設定するには、デーモンが session_died / stream_error に `data.errorKind` をスタンプする必要があります。SDK は既に読み取っています。

### 8. キャンセル処理 — すでに自動化

v1 では、キャンセルされたプロンプトにより処理中のツールブロックが永久にスピンし続ける可能性がありました。v2（PR-E）では、`propagateCancellationToInFlightTools` が `assistant.done.reason === 'cancelled'` で自動的に実行されます。サブエージェントの子は親と一緒にキャンセルされます。

**アダプターの変更は不要です** — スピナーは正しく解決されます。

### 8a. サブエージェントのネスト — ネストされたレンダリングをオプトイン（PR-K）

サブエージェント委譲内で呼び出されたツールブロックには、`parentToolCallId`、`subagentType`、および（親が state 内にある場合）`parentBlockId` が含まれるようになりました。アダプターはネストされたレンダリングをオプトインできます：

**Before**（フラットリスト、サブエージェント呼び出しがトップレベルと視覚的に区別不可）：

```tsx
state.blocks.map((b) => <ToolBlock block={b} />);
```

**After**（再帰的なネストレンダリング）：

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

**フラットビューを希望する場合、アダプターの変更は不要です** — 新しいフィールドは追加的なものであり、読み取らないコードでは無視されます。

### 9. ツールプレビューの分類 — カスタムコンポーネントでレンダリングするサブセットを選択

PR-D + PR-F により、13 のプレビュータイプが導入されました：

- 4 つのファイル型：`file_diff`、`file_read`、`web_fetch`、`mcp_invocation`
- 5 つのコンテンツ型：`code_block`、`search`、`tabular`、`image_generation`、`subagent_delegation`
- 2 つの制御型：`ask_user_question`、`command`
- 2 つの汎用型：`key_value`、`generic`

各アダプターは `preview.kind` で振り分けます：

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
    // ... またはフォールバック：
    default:
      return <Markdown text={daemonToolPreviewToMarkdown(preview)} />;
  }
}
```

13 種類すべてにカスタムコンポーネントがないアダプターは、処理されない種類に対して SDK の `daemonToolPreviewToMarkdown` にフォールバックできます。

## 後方互換性チェックリスト

| 懸念事項                                               | 状態                                          |
| ------------------------------------------------------ | --------------------------------------------- |
| 既存の `block.createdAt` の読み取り                    | ✅ 引き続き動作（`clientReceivedAt` のエイリアス） |
| 既存のリデューサーのイベント処理                        | ✅ v1 イベントタイプでは変更なし              |
| `daemonTranscriptToUnifiedMessages(blocks)` の呼び出し箇所 | ✅ 新しい options パラメーターはオプション   |
| 既存の `selectTranscriptBlocks` コンシューマー          | ✅ 変更なし                                   |
| v1 リデューサーでの新しいイベントタイプ                 | ✅ ノーオペレーション、`lastEventId` は引き続き進む |

## 参考リンク

- [PR #4353 SUMMARY](https://github.com/QwenLM/qwen-code/pull/4353)
- [Daemon UI README](./README.md) — 完全な API リファレンス
- [PR #4328](https://github.com/QwenLM/qwen-code/pull/4328) — ベース PR（共有 UI トランスクリプトレイヤー）