# Daemon UI SDK — 開発者ガイド

`@qwen-code/sdk/daemon` サブパスは、デーモンクライアント向けの共有 UI プリミティブを提供します。現在の採用対象はウェブチャットおよびウェブターミナルです。ネイティブのローカル TUI、チャンネル、IDE 統合については、デーモン UI コントラクトが安定するまで既存のデフォルトパスを維持します。このガイドでは、PR #4353（PR #4328 の共有 UI トランスクリプトレイヤーに対する統合フォローアップ）で導入された API サーフェスについて説明します。

## 3 層モデル

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

- **Normalizer**: 生のデーモン SSE エンベロープを受け取り、型付き UI イベントを返す
- **Reducer**: イベントをトランスクリプトステートマシンに蓄積する
- **Render helpers**: 状態ブロックをレンダリング可能な文字列に変換する

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

// 任意のサブスクライバーから状態を読み取る
store.subscribe(() => {
  const state = store.getSnapshot();
  const currentTool = selectCurrentTool(state);
  const mode = selectApprovalMode(state);
  const markdown = state.blocks.map(daemonBlockToMarkdown).join('\n\n');
  myRenderer.render({ markdown, currentTool, mode });
});
```

## イベント分類（28 種類以上）

`DaemonUiEvent` は UI 向けのすべてのイベントを含む判別共用体です。

### チャットストリームイベント

| イベント                     | タイミング                                            |
| ---------------------------- | ----------------------------------------------------- |
| `user.text.delta`            | デーモンからユーザーメッセージのチャンクが到着        |
| `assistant.text.delta`       | アシスタントのストリーミングチャンク                  |
| `assistant.done`             | プロンプト完了（sendPrompt の resolve より）          |
| `thought.text.delta`         | エージェントの推論チャンク                            |
| `tool.update`                | ツール呼び出しのライフサイクル（実行中 / 完了 / キャンセル） |
| `shell.output`               | シェルツールの stdout/stderr チャンク                 |
| `permission.request`         | ツールがユーザーの認可を要求                          |
| `permission.resolved`        | 権限の判断が到着                                      |
| `model.changed`              | セッションのモデルが切り替わった                      |
| `status` / `debug` / `error` | ステータス / デバッグ / エラーブロック                |

### セッションメタイベント（PR-A）

| イベント                        | タイミング                                       |
| ------------------------------- | ------------------------------------------------ |
| `session.metadata.changed`      | セッションのタイトル / 表示名が更新された        |
| `session.approval_mode.changed` | モードが切り替わった（plan / default / yolo / auto-edit） |
| `session.available_commands`    | スラッシュコマンドリストが更新された             |

### ワークスペースイベント（PR-A、Wave 3-4）

| イベント                               | タイミング                            |
| -------------------------------------- | ------------------------------------- |
| `workspace.memory.changed`             | QWEN.md / メモリファイルが変更された  |
| `workspace.agent.changed`              | サブエージェントが作成 / 更新 / 削除された |
| `workspace.tool.toggled`               | 組み込みツールが有効 / 無効になった   |
| `workspace.initialized`                | `qwen init` が完了した                |
| `workspace.mcp.budget_warning`         | MCP 子プロセス数が上限に近づいている  |
| `workspace.mcp.child_refused`          | MCP サーバーが予算超過で拒否した      |
| `workspace.mcp.server_restarted`       | 手動 MCP 再起動が成功した             |
| `workspace.mcp.server_restart_refused` | 手動再起動がブロックされた            |

### 認証デバイスフローイベント（PR-A、Wave 4 OAuth）

`auth.device_flow.{started,throttled,authorized,failed,cancelled}`

それぞれデーモンの `deviceFlowId` を持ちます。Failed イベントはクローズド列挙型の `errorKind` を持ちます（クローズド列挙 — 正式なリストは `@qwen-code/sdk/daemon` からエクスポートされる `KNOWN_DEVICE_FLOW_ERROR_KINDS` を参照。現在: `expired_token` / `access_denied` / `invalid_grant` / `upstream_error` / `persist_failed` / `not_found_or_evicted`）。

## レンダーコントラクト（PR-D）

3 つの変換ヘルパーと 1 つのプレビューヘルパーがあります。すべて `block.kind` または `preview.kind` で判別します。

```ts
daemonBlockToMarkdown(block, { sanitizeUrls?, maxFieldLength?, locale? })
daemonBlockToHtml(block, { sanitizer?, ...renderOpts })
daemonBlockToPlainText(block, renderOpts)
daemonToolPreviewToMarkdown(preview, renderOpts)
```

### Cookbook: トランスクリプトを markdown にレンダリングする

```ts
const markdown = state.blocks
  .map((b) => daemonBlockToMarkdown(b, { sanitizeUrls: true }))
  .join('\n\n');
```

### Cookbook: SSR 向けにサニタイズした HTML にレンダリングする

```ts
import DOMPurify from 'dompurify';
import MarkdownIt from 'markdown-it';
const md = new MarkdownIt();

const html = state.blocks
  .map((b) => {
    // 2 段階パイプライン: markdown → HTML → DOMPurify
    const rawHtml = md.render(daemonBlockToMarkdown(b));
    return DOMPurify.sanitize(rawHtml);
  })
  .join('\n');
```

または、組み込みの保守的な HTML レンダラーを使用する（markdown パースなし、HTML エスケープのみ）。

```ts
const html = state.blocks
  .map((b) => daemonBlockToHtml(b, { sanitizer: DOMPurify.sanitize }))
  .join('\n');
```

### Cookbook: コピー＆ペースト用のプレーンテキスト

```ts
const plain = state.blocks.map(daemonBlockToPlainText).join('\n');
navigator.clipboard.writeText(plain);
```

## ツールプレビューの分類（13 種類）

| Kind                  | 説明                                              |
| --------------------- | ------------------------------------------------- |
| `ask_user_question`   | 選択肢付きの複数選択式質問                        |
| `command`             | Bash スタイルのコマンド + cwd                     |
| `file_diff`           | oldText/newText またはパッチによるファイル編集    |
| `file_read`           | パス + オプションの行範囲                         |
| `web_fetch`           | URL + HTTP メソッド                               |
| `mcp_invocation`      | MCP サーバー + ツール + 引数のサマリー            |
| `code_block`          | 言語タグ付きコードスニペット                      |
| `search`              | クエリ + 結果件数 + 上位結果                      |
| `tabular`             | カラム + 行（上限 50 件、切り詰めをフラグで通知） |
| `image_generation`    | プロンプト + オプションのサムネイル URL           |
| `subagent_delegation` | エージェント名 + タスク                           |
| `key_value`           | 汎用的なラベル / 値の行                           |
| `generic`             | フォールバックサマリー                            |

それぞれに `daemonToolPreviewToMarkdown` 変換があります。カスタムレンダラーは `preview.kind` でディスパッチすることで、ファイル差分のシンタックスハイライト、MCP サーバーバッジ、画像サムネイルなど、種類ごとのリッチな表示が可能です。

## 状態セレクター（PR-E）

```ts
selectCurrentTool(state); // → DaemonToolTranscriptBlock | undefined
selectApprovalMode(state); // → 'plan' | 'default' | 'auto-edit' | 'yolo' | undefined
selectToolProgress(state, toolCallId); // → { ratio?, step? } | undefined
selectPendingPermissionBlocks(state); // → ReadonlyArray<DaemonPermissionTranscriptBlock>
selectTranscriptBlocks(state); // → ReadonlyArray<DaemonTranscriptBlock>
selectTranscriptBlocksOrderedByEventId(state); // デーモンモノトニック ID でソート済み

// PR-K — サブエージェントのネスト
selectSubagentChildBlocks(state, parentToolCallId); // 直接の子のみ
isSubagentChildBlock(block); // 型ガード: このツールはサブエージェント内から呼ばれたか？
```

`currentToolCallId` はリデューサーによって自動的に管理されます。

- ツールがインフライト状態（`running` / `in_progress` / `pending` / `confirming`）に入ったときにセット
- ツールが終了状態（`completed` / `failed` / `cancelled` など）に入ったときにクリア
- 未知のステータスは変更なし（前方互換性のため）

## キャンセルの伝播（PR-E）

`assistant.done.reason === 'cancelled'` の場合、リデューサーはすべてのインフライトのツールブロックを走査し、強制的にステータスを `'cancelled'` に設定します。親プロンプトがキャンセルされたとき、デーモンはすべてのインフライトツールに対して終了 `tool_call_update` を送ることを保証しません。この伝播により、UI のスピナーが永遠に回り続けることを防ぎます。

サブエージェントの子は、`toolBlockByCallId` 内のすべてのインフライトツールブロックを走査することで、親と一緒にキャンセルされます（現在のポインタだけではありません）。

## サブエージェントのネスト（PR-K）

メインエージェントがサブエージェント（`Task` ツールまたは同等のもの）に委譲する場合、デーモンは `tool_call._meta` を通じて **子** ツール呼び出しに `parentToolCallId` と `subagentType` を付与します。リデューサーは両方を読み取り、次の処理を行います。

- `parentToolCallId` + `subagentType` を `DaemonToolTranscriptBlock` にミラーリング
- 親ブロックが既に状態に存在する場合は `parentBlockId`（親のトランスクリプトブロックの `id`）を解決し、存在しない場合は `undefined` のままにして、後で親ブロックが現れたときに補完する

順序が逆の到着（親より先に子が届く場合）は透過的に処理されます。親が `maxBlocks` によってトリミングされた子は、セレクタークエリ用に `parentToolCallId` を保持しますが、`parentBlockId` は null になります（ダングリング ID は `blockIndexById` で解決できなくなるため）。

```ts
import {
  selectSubagentChildBlocks,
  isSubagentChildBlock,
} from '@qwen-code/sdk/daemon';

// 親ツールブロックをレンダリングし、子を走査する:
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

// またはレンダリング時にトップレベルとネストを振り分ける:
const topLevel = state.blocks.filter((b) => !isSubagentChildBlock(b));
```

`selectSubagentChildBlocks` は **直接の** 子のみを返します。ネストされたサブエージェント（サブエージェント内のサブエージェント）をレンダリングするには再帰的に走査してください。デーモンは循環を送出しませんが、`parentBlockId` を辿るレンダラーは防御的に循環を検出すべきです（例: 深さの上限や訪問済みセット）。

自己参照（`parentToolCallId === toolCallId`）はノーマライザーがリデューサーに渡す前にドロップします。

## 時刻のセマンティクス（PR-B）

```ts
interface DaemonTranscriptBlockBase {
  eventId?: number; // 主ソートキー — デーモンモノトニック
  serverTimestamp?: number; // 表示推奨 — デーモン権威的
  clientReceivedAt: number; // フォールバック — ローカルクロック
  createdAt: number; // @deprecated clientReceivedAt の別名
}
```

長いセッションを表示する際は、**必ず `eventId` でソートしてください**（`selectTranscriptBlocksOrderedByEventId` を使用）。デーモンモノトニックカーソルは SSE 再接続後のリプレイ間でも保持されますが、クライアントのクロックは保持されません。

**表示タイムスタンプは必ず `serverTimestamp`** からフォーマットしてください（`clientReceivedAt` にフォールバック）。同じセッションを閲覧している複数のクライアントが「5 分前」と同じ表示を見るには、両方がデーモンのクロックから読み取る必要があります。

```ts
import { formatBlockTimestamp } from '@qwen-code/sdk/daemon';

const label = formatBlockTimestamp(block, {
  locale: 'zh-CN',
  timeZone: 'Asia/Shanghai',
  timeStyle: 'short',
});
```

## アダプター適合性（PR-G）

アダプターが SDK のリファレンスコーパスに対して意味的に等価な出力を生成することを検証します。

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

フィクスチャーコーパス（`DAEMON_UI_CONFORMANCE_FIXTURES`）は、チャット、ツールライフサイクル、ファイル編集、MCP、権限、MCP バジェット警告、キャンセル、不正ペイロードの削除、OAuth、コマンド更新、サブエージェントのネストをカバーしています。（件数は実行時に取得可能 — `DAEMON_UI_CONFORMANCE_FIXTURES.length` を参照。）

**フォーマット非依存** — アダプターは ANSI / HTML / markdown / JSX にレンダリング可能です。フレームワークは `expectedContains` と `expectedAbsent` によってセマンティックな内容のみを確認します。

## エラーの分類（PR-A）

`DaemonUiErrorEvent.errorKind` はデーモンの型付きエラー分類から伝播されるクローズド列挙型です（デーモンが付与する場合）。

```ts
import type { DaemonErrorKind } from '@qwen-code/sdk/daemon';
// 'missing_binary' | 'blocked_egress' | 'auth_env_error' | 'init_timeout'
// | 'protocol_error' | 'missing_file' | 'parse_error' | 'budget_exhausted'
```

レンダラーは `errorKind` でアクション可能なアフォーダンスを分岐させるべきです。

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

## ツールの出所ディスパッチ（PR-A）

`DaemonUiToolUpdateEvent.provenance` はクローズド列挙型（`builtin` / `mcp` / `subagent` / `unknown`）です。`mcp` の場合は `serverId?: string` も付きます。アイコンのディスパッチやバッジに使用します。

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

SDK には `mcp__<server>__<tool>` という命名ヒューリスティックのフォールバックがあります。デーモンが明示的に出所を付与しない場合でも、MCP ツールを検出できます。

## 前方互換性の原則

デーモン UI SDK のすべての層は **前方互換性の原則** に従っています。未知の値は例外をスローせず、グレースフルに降下します。

- 未知のデーモンイベント型 → 生の型名を含む `debug` イベント
- 未知のツールステータス → `currentToolCallId` をそのまま維持（クリアしない）
- 未知のエラー種別 → `errorKind` が undefined（レンダラーはテキストにフォールバック）
- `serverTimestamp` がない → `clientReceivedAt` にフォールバック
- 認識できないプレビューの形状 → `summary` を持つ `generic` 種別

これにより **SDK はデーモンの出力より先にリリースできます**。PR-A のツール出所ヒューリスティック、PR-B の 3 ロケーションタイムスタンプ抽出、PR-E の未知ステータス保持はすべて「デーモンが送れば使い、送らなくても安全」の実例です。

## 関連リンク

- [PR #4328](https://github.com/QwenLM/qwen-code/pull/4328) — 共有 UI トランスクリプトレイヤーのベース PR
- [PR #4353](https://github.com/QwenLM/qwen-code/pull/4353) — 本 PR（統合完全性フォローアップ）
- [Issue #3803](https://github.com/QwenLM/qwen-code/issues/3803) — デーモンモードの提案
- [Issue #4175](https://github.com/QwenLM/qwen-code/issues/4175) — Mode B v0.16 実装トラッカー
