# Daemon UI SDK — 開発者ガイド

`@qwen-code/sdk/daemon` サブパスは、デーモンクライアント向けの共有UIプリミティブを提供します。現在の採用目標はWebチャットとWebターミナルです。ネイティブのローカルTUI、チャンネル、IDE統合は既存のデフォルトパスを維持し、デーモンのUI契約が安定するのを待ちます。このガイドでは、PR #4353（PR #4328の共有UIトランスクリプトレイヤーの後続となる統一版）で導入されたAPIサーフェスについて説明します。

## 3層モデル

```
Daemon SSE wire (NDJSON envelopes)
   │
   ▼
normalizeDaemonEvent(envelope) → DaemonUiEvent[]
   │
   ▼
reduceDaemonTranscriptEvents(state, events) → DaemonTranscriptState
   │                                            { blocks, currentToolCallId,
   │                                              approvalMode, toolProgress, ... }
   ▼
daemonBlockToMarkdown(block) / ToHtml / ToPlainText  ← your renderer plugs here
```

- **ノーマライザー**: 生のデーモンSSEエンベロープを受け取り、型付きUIイベントを返します
- **リデューサー**: イベントをトランスクリプト状態マシンに集約します
- **レンダーヘルパー**: 状態ブロックをレンダリング可能な文字列に投影します

## クイックスタート

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

// Read state from any subscriber
store.subscribe(() => {
  const state = store.getSnapshot();
  const currentTool = selectCurrentTool(state);
  const mode = selectApprovalMode(state);
  const markdown = state.blocks.map(daemonBlockToMarkdown).join('\n\n');
  myRenderer.render({ markdown, currentTool, mode });
});
```

## イベント分類（28以上のタイプ）

`DaemonUiEvent` は、すべてのUI向けイベントの判別共用体です：

### チャットストリームイベント

| イベント                       | タイミング                                            |
| ----------------------------- | ----------------------------------------------------- |
| `user.text.delta`             | デーモンからユーザーメッセージのチャンクが到着        |
| `assistant.text.delta`        | アシスタントのストリーミングチャンク                  |
| `assistant.done`              | プロンプト完了（sendPromptのresolveから）              |
| `thought.text.delta`          | エージェントの推論チャンク                            |
| `tool.update`                 | ツールコールのライフサイクル（running / completed / cancelled） |
| `shell.output`                | シェルツールのstdout/stderrチャンク                   |
| `permission.request`          | ツールがユーザー認可を必要とする                      |
| `permission.resolved`         | 権限決定が到着                                        |
| `model.changed`               | セッションモデルが切り替わった                        |
| `status` / `debug` / `error`  | ステータス / デバッグ / エラーブロック                |

### セッションメタイベント（PR-A）

| イベント                           | タイミング                                                |
| ---------------------------------- | --------------------------------------------------------- |
| `session.metadata.changed`         | セッションタイトル / 表示名が更新された                   |
| `session.approval_mode.changed`    | モードが切り替わった（plan / default / yolo / auto-edit）|
| `session.available_commands`       | スラッシュコマンドリストが更新された                      |

### ワークスペースイベント（PR-A, Wave 3-4）

| イベント                                  | タイミング                                  |
| ----------------------------------------- | ------------------------------------------- |
| `workspace.memory.changed`                | QWEN.md / メモリファイルが変更された         |
| `workspace.agent.changed`                 | サブエージェントが作成/更新/削除された       |
| `workspace.tool.toggled`                  | ビルトインツールが有効化/無効化された        |
| `workspace.initialized`                   | `qwen init` が完了した                       |
| `workspace.mcp.budget_warning`            | MCP子プロセス数が上限に近づいている          |
| `workspace.mcp.child_refused`             | MCPサーバーが予算超過で拒否された            |
| `workspace.mcp.server_restarted`          | 手動MCP再起動が成功した                      |
| `workspace.mcp.server_restart_refused`    | 手動再起動がブロックされた                   |

### 認証デバイスフローイベント（PR-A, Wave 4 OAuth）

`auth.device_flow.{started,throttled,authorized,failed,cancelled}`

各イベントはデーモンの `deviceFlowId` を持ちます。失敗イベントはクローズド列挙型の `errorKind` を持ちます（クローズド列挙 — 正規のリストは `@qwen-code/sdk/daemon` からエクスポートされる `KNOWN_DEVICE_FLOW_ERROR_KINDS` を参照。現在は `expired_token` / `access_denied` / `invalid_grant` / `upstream_error` / `persist_failed` / `not_found_or_evicted`）。

## レンダー契約（PR-D）

3つの投影ヘルパーと1つのプレビューヘルパー。すべて `block.kind` または `preview.kind` で判別します：

```ts
daemonBlockToMarkdown(block, { sanitizeUrls?, maxFieldLength?, locale? })
daemonBlockToHtml(block, { sanitizer?, ...renderOpts })
daemonBlockToPlainText(block, renderOpts)
daemonToolPreviewToMarkdown(preview, renderOpts)
```

### クックブック：トランスクリプトをMarkdownにレンダリング

```ts
const markdown = state.blocks
  .map((b) => daemonBlockToMarkdown(b, { sanitizeUrls: true }))
  .join('\n\n');
```

### クックブック：SSR用にサニタイズされたHTMLにレンダリング

```ts
import DOMPurify from 'dompurify';
import MarkdownIt from 'markdown-it';
const md = new MarkdownIt();

const html = state.blocks
  .map((b) => {
    // 2段階パイプライン: markdown → HTML → DOMPurify
    const rawHtml = md.render(daemonBlockToMarkdown(b));
    return DOMPurify.sanitize(rawHtml);
  })
  .join('\n');
```

または、組み込みの保守的なHTMLレンダラー（Markdownパースなし、HTMLエスケープのみ）を使用：

```ts
const html = state.blocks
  .map((b) => daemonBlockToHtml(b, { sanitizer: DOMPurify.sanitize }))
  .join('\n');
```

### クックブック：プレーンテキストのコピー＆ペースト

```ts
const plain = state.blocks.map(daemonBlockToPlainText).join('\n');
navigator.clipboard.writeText(plain);
```

## ツールプレビュー分類（13種類）

| 種類                     | 表面                                            |
| ------------------------ | ----------------------------------------------- |
| `ask_user_question`      | 選択肢付きの多肢選択質問                        |
| `command`                | Bash形式のコマンド + cwd                        |
| `file_diff`              | oldText/newText またはパッチによるファイル編集   |
| `file_read`              | パス + オプションの行範囲                       |
| `web_fetch`              | URL + HTTPメソッド                              |
| `mcp_invocation`         | MCPサーバー + ツール + 引数のサマリー           |
| `code_block`             | 言語タグ付きコードスニペット                    |
| `search`                 | クエリ + 結果件数 + 上位結果                    |
| `tabular`                | カラム + 行（最大50行、切り捨てフラグあり）     |
| `image_generation`       | プロンプト + オプションのサムネイルURL          |
| `subagent_delegation`    | エージェント名 + タスク                         |
| `key_value`              | 汎用ラベル/値の行                               |
| `generic`                | フォールバックサマリー                          |

それぞれに `daemonToolPreviewToMarkdown` 投影関数があります。カスタムレンダラーは `preview.kind` で分岐して、種類ごとにリッチな表示（構文ハイライト付きファイル差分、MCPサーバーバッジ、画像サムネイルなど）を行うことができます。

## 状態セレクター（PR-E）

```ts
selectCurrentTool(state); // → DaemonToolTranscriptBlock | undefined
selectApprovalMode(state); // → 'plan' | 'default' | 'auto-edit' | 'yolo' | undefined
selectToolProgress(state, toolCallId); // → { ratio?, step? } | undefined
selectPendingPermissionBlocks(state); // → ReadonlyArray<DaemonPermissionTranscriptBlock>
selectTranscriptBlocks(state); // → ReadonlyArray<DaemonTranscriptBlock>
selectTranscriptBlocksOrderedByEventId(state); // デーモン単調IDでソート

// PR-K — サブエージェントのネスト
selectSubagentChildBlocks(state, parentToolCallId); // 直接の子のみ
isSubagentChildBlock(block); // 型ガード: このツールはサブエージェント内で呼び出されたか？
```

`currentToolCallId` はリデューサーによって自動的に管理されます：

- ツールが処理中ステータス（`running` / `in_progress` / `pending` / `confirming`）に入ると設定
- ツールが終了ステータス（`completed` / `failed` / `cancelled` など）に入るとクリア
- 未知のステータスはそのまま（前方互換）

## キャンセル伝播（PR-E）

`assistant.done.reason === 'cancelled'` の場合、リデューサーは処理中のすべてのツールブロックを走査し、ステータスを強制的に `'cancelled'` に設定します。親プロンプトがキャンセルされた場合、デーモンは処理中のすべてのツールに対して終端の `tool_call_update` を保証しません。この伝播により、UIのスピナーが永久に回り続けるのを防ぎます。

サブエージェントの子は親と一緒にキャンセルされます。なぜなら、キャンセルは現在のポインターだけでなく、`toolBlockByCallId` 内のすべての処理中ツールブロックを反復処理するからです。

## サブエージェントのネスト（PR-K）

メインエージェントがサブエージェント（`Task` ツールなど）に委譲する場合、デーモンは子ツール呼び出しに `parentToolCallId` と `subagentType` を `tool_call._meta` 経由でスタンプします。リデューサーは両方を読み取り：

- `parentToolCallId` + `subagentType` を `DaemonToolTranscriptBlock` に反映
- 親ブロックがすでに状態にある場合は `parentBlockId`（親のトランスクリプトブロック `id`）を解決し、ない場合は `undefined` のままにし、後で親ブロックが出現したときにバックフィル

子が親より先に到着する（out-of-order）は透過的に処理されます。`maxBlocks` によって親がトリミングされた子は、セレクタークエリ用に `parentToolCallId` を保持しますが、`parentBlockId` は null になります（ぶら下がったIDは `blockIndexById` で解決できなくなります）。

```ts
import {
  selectSubagentChildBlocks,
  isSubagentChildBlock,
} from '@qwen-code/sdk/daemon';

// 親ツールブロックをレンダリングし、子を走査:
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

// または、レンダリング時にトップレベルとネストをフィルタリング:
const topLevel = state.blocks.filter((b) => !isSubagentChildBlock(b));
```

`selectSubagentChildBlocks` は**直接**の子のみを返します。ネストされたサブエージェント（サブエージェント内のサブエージェント）をレンダリングするには再帰的に走査します。デーモンは循環を出力しませんが、`parentBlockId` を介して上にたどるレンダラーは防御的に検出する必要があります（例：深さ制限または訪問済みセット）。

自己参照（`parentToolCallId === toolCallId`）は、リデューサーに到達する前にノーマライザーによって削除されます。

## 時間セマンティクス（PR-B）

```ts
interface DaemonTranscriptBlockBase {
  eventId?: number; // プライマリソートキー — デーモン単調増加
  serverTimestamp?: number; // 推奨表示 — デーモン権威
  clientReceivedAt: number; // フォールバック — ローカルクロック
  createdAt: number; // @deprecated clientReceivedAtのエイリアス
}
```

長いセッションを表示するときは、**常に `eventId` でソート**してください（`selectTranscriptBlocksOrderedByEventId` を使用）。デーモン単調増加カーソルは、SSE再接続後も保持されます。クライアントクロックは保証されません。

**表示タイムスタンプは常に `serverTimestamp` からフォーマット**してください（フォールバックとして `clientReceivedAt` を使用）。同じセッションを表示する複数のクライアントは、デーモンクロックから読み取った場合にのみ同じ「5分前」を表示します。

```ts
import { formatBlockTimestamp } from '@qwen-code/sdk/daemon';

const label = formatBlockTimestamp(block, {
  locale: 'zh-CN',
  timeZone: 'Asia/Shanghai',
  timeStyle: 'short',
});
```

## アダプター適合性テスト（PR-G）

アダプターがSDKの参照コーパスを意味的に等価な出力に投影することを検証します：

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

フィクスチャコーパス（`DAEMON_UI_CONFORMANCE_FIXTURES`）は、チャット、ツールライフサイクル、ファイル編集、MCP、権限、MCP予算警告、キャンセル、不正ペイロードの編集、OAuth、コマンド更新、サブエージェントのネストをカバーします。（カウントは実行時に取得可能 — `DAEMON_UI_CONFORMANCE_FIXTURES.length` を読み取ってください。）

**形式に依存しません** — アダプターはANSI / HTML / Markdown / JSXでレンダリングできます。フレームワークは `expectedContains` と `expectedAbsent` を介して意味的内容のみをチェックします。

## エラー分類（PR-A）

`DaemonUiErrorEvent.errorKind` は、デーモンの型付けされたエラー分類（デーモンがスタンプする場合）から伝播されるクローズド列挙型です：

```ts
import type { DaemonErrorKind } from '@qwen-code/sdk/daemon';
// 'missing_binary' | 'blocked_egress' | 'auth_env_error' | 'init_timeout'
// | 'protocol_error' | 'missing_file' | 'parse_error' | 'budget_exhausted'
```

レンダラーは `errorKind` で分岐して、アクション可能なアフォーダンスを提供する必要があります：

```ts
function errorAffordance(errorKind?: DaemonErrorKind): React.ReactNode {
  switch (errorKind) {
    case 'auth_env_error': return <button>再認証</button>;
    case 'missing_file':   return <button>ファイルを選択</button>;
    case 'blocked_egress': return <span>ネットワークがブロックされています — プロキシを確認</span>;
    default:               return null;
  }
}
```

## ツールプロバイダンスディスパッチ（PR-A）

`DaemonUiToolUpdateEvent.provenance` はクローズド列挙型（`builtin` / `mcp` / `subagent` / `unknown`）です。`mcp` の場合は `serverId?: string` が付きます。アイコンディスパッチとバッジ付けに使用します：

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

SDKには `mcp__<server>__<tool>` 命名ヒューリスティックのフォールバックがあります。デーモンが明示的にプロバイダンスをスタンプしない場合でも、MCPツールは検出可能です。

## 前方互換の原則

デーモンUI SDKのすべてのレイヤーは**前方互換の原則**に従います。未知の値はスローせず、グレースフルに低下します。

- 未知のデーモンイベントタイプ → 生のタイプ名を持つ `debug` イベント
- 未知のツールステータス → `currentToolCallId` はそのまま（クリアしない）
- 未知のエラー種別 → `errorKind` は undefined（レンダラーはテキストにフォールバック）
- 欠落した serverTimestamp → `clientReceivedAt` にフォールバック
- 認識できないプレビュー形状 → `generic` 種類と `summary`

つまり、**SDKはデーモンの発行よりも先に出荷できます**。PR-Aのツールプロバイダンスヒューリスティック、PR-Bの3箇所タイムスタンプ抽出、PR-Eの未知ステータス保持はすべて、「デーモンが送信したときに準備完了、送信しないときは安全」の例です。

## 相互参照

- [PR #4328](https://github.com/QwenLM/qwen-code/pull/4328) — 共有UIトランスクリプトレイヤーのベースPR
- [PR #4353](https://github.com/QwenLM/qwen-code/pull/4353) — このPR（統合完全性フォローアップ）
- [Issue #3803](https://github.com/QwenLM/qwen-code/issues/3803) — デーモンモードの提案
- [Issue #4175](https://github.com/QwenLM/qwen-code/issues/4175) — Mode B v0.16実装トラッカー