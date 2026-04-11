# Speculation Engine の設計

> ユーザーが確定する前に、提案された内容を copy-on-write によるファイル分離を用いて投機的に実行します。ユーザーが Tab キーを押すと、結果が即座に表示されます。

## 概要

プロンプトの提案が表示されると、**speculation engine** は fork された GeminiChat を使用してバックグラウンドで直ちに実行を開始します。ファイルへの書き込みは一時的な overlay ディレクトリに行われます。ユーザーが提案を承認（accept）すると、overlay ファイルが実際のファイルシステムにコピーされ、投機的に実行された会話履歴がメインのチャット履歴に挿入されます。ユーザーが別の入力を開始した場合、speculation は中止され、overlay はクリーンアップされます。

## アーキテクチャ

```
User sees suggestion "commit this"
           │
           ▼
┌──────────────────────────────────────────────────────────────┐
│  startSpeculation()                                          │
│                                                              │
│  ┌─────────────────┐    ┌────────────────────┐               │
│  │ Forked GeminiChat│    │  OverlayFs          │              │
│  │ (cache-shared)   │    │  /tmp/qwen-         │              │
│  │                  │    │   speculation/       │              │
│  │  systemInstruction│   │   {pid}/{id}/        │              │
│  │  + tools          │   │                      │              │
│  │  + history prefix │   │  COW: first write    │              │
│  │                  │    │  copies original     │              │
│  └────────┬─────────┘    └──────────┬───────────┘             │
│           │                         │                         │
│           ▼                         │                         │
│  ┌──────────────────────────────────┴──────────────────────┐  │
│  │  Speculative Loop (max 20 turns, 100 messages)          │  │
│  │                                                         │  │
│  │  Model response                                         │  │
│  │       │                                                 │  │
│  │       ▼                                                 │  │
│  │  ┌──────────────────────────────────────────────────┐   │  │
│  │  │  speculationToolGate                             │   │  │
│  │  │                                                  │   │  │
│  │  │  Read/Grep/Glob/LS/LSP → allow (+ overlay read) │   │  │
│  │  │  Edit/WriteFile → redirect to overlay            │   │  │
│  │  │    (only in auto-edit/yolo mode)                 │   │  │
│  │  │  Shell → AST check read-only? allow : boundary   │   │  │
│  │  │  WebFetch/WebSearch → boundary                   │   │  │
│  │  │  Agent/Skill/Memory/Ask → boundary               │   │  │
│  │  │  Unknown/MCP → boundary                          │   │  │
│  │  └──────────────────────────────────────────────────┘   │  │
│  │       │                                                 │  │
│  │       ▼                                                 │  │
│  │  Tool execution: toolRegistry.getTool → build → execute │  │
│  │  (bypasses CoreToolScheduler — gated by toolGate)       │  │
│  │                                                         │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                              │
│  On completion → generatePipelinedSuggestion()               │
└──────────────────────────────────────────────────────────────┘
           │
           │  User presses Tab / Enter
           ▼
     ┌─── status === 'completed'? ───┐
     │ YES                      NO (boundary) │
     ▼                                ▼
┌─────────────────────────┐  ┌────────────────────────┐
│  acceptSpeculation()    │  │  Discard speculation    │
│                         │  │  abort + cleanup        │
│  1. applyToReal()       │  │  Submit query normally  │
│  2. ensureToolPairing() │  │  (addMessage)           │
│  3. addHistory()        │  └────────────────────────┘
│  4. render tool_group   │
│  5. cleanup overlay     │
│  6. pipelined suggest   │
└─────────────────────────┘
           │
           │  User types instead
           ▼
┌──────────────────────────────────────────────────────────────┐
│  abortSpeculation()                                          │
│                                                              │
│  1. abortController.abort() — cancel LLM call               │
│  2. overlayFs.cleanup() — delete temp directory              │
│  3. Update speculation state (no telemetry on abort)         │
└──────────────────────────────────────────────────────────────┘
```

## Copy-on-Write Overlay

```
Real CWD: /home/user/project/
Overlay:  /tmp/qwen-speculation/12345/a1b2c3d4/

Write to src/app.ts:
  1. Copy /home/user/project/src/app.ts → overlay/src/app.ts (first time only)
  2. Tool writes to overlay/src/app.ts

Read from src/app.ts:
  - If in writtenFiles → read from overlay/src/app.ts
  - Otherwise → read from /home/user/project/src/app.ts

New file (src/new.ts):
  - Create overlay/src/new.ts directly (no original to copy)

Accept:
  - copyFile(overlay/src/app.ts → /home/user/project/src/app.ts)
  - copyFile(overlay/src/new.ts → /home/user/project/src/new.ts)
  - rm -rf overlay/

Abort:
  - rm -rf overlay/
```

## Tool Gate セキュリティ

| ツール                                                       | アクション | 条件                                    |
| ---------------------------------------------------------- | -------- | -------------------------------------------- |
| read_file, grep, glob, ls, lsp                             | allow    | overlay を介して解決された読み取りパス          |
| edit, write_file                                           | redirect | auto-edit / yolo 承認モードの場合のみ       |
| edit, write_file                                           | boundary | デフォルト / plan 承認モードの場合              |
| shell                                                      | allow    | `isShellCommandReadOnlyAST()` が true を返す   |
| shell                                                      | boundary | 読み取り専用ではないコマンド                       |
| web_fetch, web_search                                      | boundary | ネットワークリクエストにはユーザーの同意が必要        |
| agent, skill, memory, ask_user, todo_write, exit_plan_mode | boundary | speculation 中はユーザーとの対話不可 |
| Unknown / MCP ツール                                        | boundary | 安全なデフォルト動作                                 |

### パス書き換え

- **書き込みツール**: `rewritePathArgs()` は `overlayFs.redirectWrite()` を介して `file_path` を overlay にリダイレクトします
- **読み取りツール**: `resolveReadPaths()` は、以前に書き込まれた場合、`overlayFs.resolveReadPath()` を介して `file_path` を overlay にリダイレクトします
- **書き換え失敗**: boundary として処理されます（例: cwd 外の絶対パスは `redirectWrite` で例外をスロー）

## Boundary の処理

ターン途中で boundary に到達した場合:

1. 既に実行されたツール呼び出しは保持されます（名前ベースではなくインデックスベースで追跡）
2. 未実行の関数呼び出しはモデルメッセージから削除されます
3. 部分的なツールレスポンスが履歴に追加されます
4. `ensureToolResultPairing()` は挿入前に完全性を検証します

## Pipelined Suggestion

speculation が完了し（boundary に到達せず）、2回目の LLM 呼び出しによって**次の**提案が生成されます:

```
Context: original conversation + "commit this" + speculated messages
→ LLM predicts: "push it"
→ Stored in state.pipelinedSuggestion
→ On accept: setPromptSuggestion("push it") — appears instantly
```

これにより、承認するたびに次のステップが即座に表示される Tab-Tab-Tab ワークフローが可能になります。

pipelined suggestion は、初期提案との品質の一貫性を確保するため、`suggestionGenerator.ts` からエクスポートされた `SUGGESTION_PROMPT` 定数を再利用します（ローカルコピーではありません）。

## Fast Model

`startSpeculation` はオプションの `options.model` パラメータを受け取り、`runSpeculativeLoop` と `generatePipelinedSuggestion` を経由して `runForkedQuery` に渡されます。トップレベルの `fastModel` 設定で構成されます（空の場合はメインモデルを使用）。提案の生成、speculation、pipelined suggestion を含むすべてのバックグラウンドタスクで、同じ `fastModel` が使用されます。`/model --fast <name>` または `settings.json` で設定します。

## UI レンダリング

speculation が完了すると、`acceptSpeculation` は `historyManager.addItem()` を介して結果をレンダリングします:

- **ユーザーメッセージ**: `type: 'user'` アイテムとしてレンダリング
- **モデルテキスト**: `type: 'gemini'` アイテムとしてレンダリング
- **ツール呼び出し**: 構造化された `IndividualToolCallDisplay` エントリ（ツール名、引数の説明、結果テキスト、ステータス）を持つ `type: 'tool_group'` アイテムとしてレンダリング

これにより、ユーザーにはプレーンテキストだけでなく、ツール呼び出しの詳細を含む speculation の完全な出力が表示されます。

## Forked Query（キャッシュ共有）

### CacheSafeParams

```typescript
interface CacheSafeParams {
  generationConfig: GenerateContentConfig; // systemInstruction + tools
  history: Content[]; // curated, max 40 entries
  model: string;
  version: number; // increments on config changes
}
```

- `GeminiClient.sendMessageStream()` でメインのターンが正常に完了するたびに保存されます
- `startChat()` / `resetChat()` 時にクリアされ、セッション間のリークを防止します
- 履歴は 40 エントリに切り捨てられます。`createForkedChat` は shallow copy を使用します（パラメータは既に deep-cloned スナップショットです）
- 思考モードは明示的に無効化されます（`thinkingConfig: { includeThoughts: false }`）。speculation に推論トークンは不要であり、コストとレイテンシの無駄になります。これはキャッシュプレフィックスのマッチングには影響しません（`systemInstruction` + `tools` + `history` のみで決定されます）
- `systemInstruction` + `tools` の `JSON.stringify` 比較によるバージョン検出

### キャッシュメカニズム

DashScope は既に以下の方法でプレフィックスキャッシュを有効にしています:

- `X-DashScope-CacheControl: enable` ヘッダー
- メッセージとツールへの `cache_control: { type: 'ephemeral' }` アノテーション

fork された `GeminiChat` は同一の `generationConfig`（ツールを含む）と履歴プレフィックスを使用するため、DashScope の既存のキャッシュメカニズムが自動的にキャッシュヒットを生成します。

## 定数

| 定数                 | 値 | 説明                              |
| ------------------------ | ----- | ---------------------------------------- |
| MAX_SPECULATION_TURNS    | 20    | API ラウンドトリップの最大数                  |
| MAX_SPECULATION_MESSAGES | 100   | speculation 履歴内のメッセージ最大数   |
| SUGGESTION_DELAY_MS      | 300   | 提案表示までの遅延時間          |
| ACCEPT_DEBOUNCE_MS       | 100   | 連続承認時のデバウンスロック          |
| MAX_HISTORY_FOR_CACHE    | 40    | CacheSafeParams に保存される履歴エントリ数 |

## ファイル構成

```
packages/core/src/followup/
├── followupState.ts          # フレームワーク非依存のステートコントローラー
├── suggestionGenerator.ts    # LLM ベースの提案生成 + 12 のフィルタールール
├── forkedQuery.ts            # キャッシュ対応の forked query インフラストラクチャ
├── overlayFs.ts              # Copy-on-write overlay ファイルシステム
├── speculationToolGate.ts    # ツールの boundary 強制
├── speculation.ts            # Speculation エンジン（開始/承認/中止）
└── index.ts                  # モジュールのエクスポート
```