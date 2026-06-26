# 投機実行エンジンの設計

> ユーザーが確定する前に、提案された内容を投機的に実行します。コピーオンライトのファイル分離を用いて、ユーザーがTabを押した瞬間に結果が表示されます。

## 概要

プロンプトの提案が表示されると、**投機実行エンジン**は即座にフォークしたGeminiChatを使ってその提案をバックグラウンドで実行し始めます。ファイル書き込みは一時的なオーバレイディレクトリに行われます。ユーザーが提案を受け入れた場合、オーバレイファイルは実際のファイルシステムにコピーされ、投機実行の会話履歴がメインチャット履歴に注入されます。ユーザーが別の内容を入力した場合は、投機実行は中断され、オーバレイはクリーンアップされます。

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

## コピーオンライトオーバレイ

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

## ツールゲートのセキュリティ

| ツール                                                     | アクション | 条件                                           |
| ---------------------------------------------------------- | -------- | ---------------------------------------------- |
| read_file, grep, glob, ls, lsp                             | allow    | オーバレイを通して読み取りパスを解決            |
| edit, write_file                                           | redirect | auto-edit / yolo 承認モード時のみ               |
| edit, write_file                                           | boundary | デフォルト / plan 承認モード時                  |
| shell                                                      | allow    | `isShellCommandReadOnlyAST()` が true を返す    |
| shell                                                      | boundary | 読み取り専用でないコマンド                      |
| web_fetch, web_search                                      | boundary | ネットワークリクエストにはユーザーの同意が必要  |
| agent, skill, memory, ask_user, todo_write, exit_plan_mode | boundary | 投機実行中はユーザーと対話できない              |
| 未知 / MCP ツール                                          | boundary | セーフデフォルト                                |

### パス書き換え

- **書き込みツール**: `rewritePathArgs()` は `overlayFs.redirectWrite()` を介して `file_path` をオーバレイにリダイレクトします。
- **読み取りツール**: `resolveReadPaths()` は、以前に書き込まれた場合、`overlayFs.resolveReadPath()` を介して `file_path` をオーバレイにリダイレクトします。
- **書き換え失敗**: バウンダリとして扱われます（例：cwd外の絶対パスは `redirectWrite` で例外をスロー）。

## バウンダリ処理

ターン中にバウンダリに達した場合：

1. 既に実行されたツール呼び出しは保持されます（名前ベースではなく、インデックスベースの追跡）。
2. 未実行の関数呼び出しはモデルメッセージから削除されます。
3. 部分的なツール応答は履歴に追加されます。
4. `ensureToolResultPairing()` は注入前に完全性を検証します。

## パイプライン化された提案

投機実行が完了した後（バウンダリなし）、2回目のLLM呼び出しで **次の** 提案を生成します。

```
Context: original conversation + "commit this" + speculated messages
→ LLM predicts: "push it"
→ Stored in state.pipelinedSuggestion
→ On accept: setPromptSuggestion("push it") — appears instantly
```

これにより、Tab-Tab-Tab ワークフローが可能になり、受け入れるたびに次のステップが即座に表示されます。

パイプライン化された提案は、`suggestionGenerator.ts` でエクスポートされた定数 `SUGGESTION_PROMPT` を（ローカルコピーではなく）再利用して、初期提案と一貫した品質を確保します。

## 高速モデル

`startSpeculation` はオプションの `options.model` パラメータを受け付け、`runSpeculativeLoop` および `generatePipelinedSuggestion` を通じて `runForkedQuery` に渡されます。これはトップレベルの `fastModel` 設定で設定します（空の場合はメインモデルを使用）。同じ `fastModel` が、提案生成、投機実行、パイプライン化された提案のすべてのバックグラウンドタスクで使用されます。設定は `/model --fast <name>` または `settings.json` で行います。

## UI レンダリング

投機実行が完了すると、`acceptSpeculation` は `historyManager.addItem()` を介して結果をレンダリングします。

- **ユーザーメッセージ**: `type: 'user'` アイテムとしてレンダリング
- **モデルテキスト**: `type: 'gemini'` アイテムとしてレンダリング
- **ツール呼び出し**: 構造化された `IndividualToolCallDisplay` エントリ（ツール名、引数の説明、結果テキスト、ステータス）を持つ `type: 'tool_group'` アイテムとしてレンダリング

これにより、ユーザーはプレーンテキストだけでなく、ツール呼び出しの詳細を含む投機実行の全体像を確認できます。

## フォークされたクエリ（キャッシュ共有）

### CacheSafeParams

```typescript
interface CacheSafeParams {
  generationConfig: GenerateContentConfig; // systemInstruction + tools
  history: Content[]; // curated, max 40 entries
  model: string;
  version: number; // increments on config changes
}
```

- `GeminiClient.sendMessageStream()` でメインのターンが成功するたびに保存されます
- セッション間の漏洩を防ぐため、`startChat()` / `resetChat()` でクリアされます
- 履歴は40エントリに切り詰められます。`createForkedChat` は浅いコピーを使用します（params はすでにディープクローンされたスナップショットです）
- 思考モードは明示的に無効化されます（`thinkingConfig: { includeThoughts: false }`）— 推論トークンは投機実行に不要であり、コストとレイテンシの無駄になるためです。これはキャッシュプレフィックスのマッチングには影響しません（systemInstruction + tools + history のみによって決定されます）
- バージョン検出は、systemInstruction + tools の `JSON.stringify` 比較によって行われます

### キャッシュ機構

DashScope は既に以下の方法でプレフィックスキャッシュを有効にしています。

- `X-DashScope-CacheControl: enable` ヘッダー
- メッセージとツールの `cache_control: { type: 'ephemeral' }` アノテーション

フォークされた `GeminiChat` は同一の `generationConfig`（ツールを含む）と履歴プレフィックスを使用するため、DashScope の既存のキャッシュ機構により自動的にキャッシュヒットが発生します。

## 定数

| 定数                     | 値    | 説明                                      |
| ------------------------ | ----- | ---------------------------------------- |
| MAX_SPECULATION_TURNS    | 20    | API の最大ラウンドトリップ数             |
| MAX_SPECULATION_MESSAGES | 100   | 投機履歴内の最大メッセージ数             |
| SUGGESTION_DELAY_MS      | 300   | 提案を表示する前の遅延                   |
| ACCEPT_DEBOUNCE_MS       | 100   | 高速受け入れのためのデバウンスロック      |
| MAX_HISTORY_FOR_CACHE    | 40    | CacheSafeParams に保存される履歴エントリ数 |

## ファイル構成

```
packages/core/src/followup/
├── followupState.ts          # フレームワーク非依存の状態コントローラ
├── suggestionGenerator.ts    # LLM ベースの提案生成 + 12 のフィルタルール
├── forkedQuery.ts            # キャッシュ対応のフォーククエリ基盤
├── overlayFs.ts              # コピーオンライトのオーバレイファイルシステム
├── speculationToolGate.ts    # ツールバウンダリの強制
├── speculation.ts            # 投機実行エンジン（開始/受け入れ/中断）
└── index.ts                  # モジュールエクスポート
```