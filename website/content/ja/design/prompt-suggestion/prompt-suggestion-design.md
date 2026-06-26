# プロンプトサジェスト（NES）設計

> AIが応答を完了した後に、ユーザーが次に自然に入力するであろう内容を予測し、それを入力プロンプトにゴーストテキストとして表示します。
>
> 実装状況: `prompt-suggestion-implementation.md`。投機エンジン: `speculation-design.md`。

## 概要

**プロンプトサジェスト**（Next-step Suggestion / NES）とは、各AI応答の後にLLM呼び出しによって生成される、ユーザーの次の入力を予測する短いテキスト（2〜12語）です。入力プロンプト内にゴーストテキストとして表示されます。ユーザーはTab / Enter / 右矢印キーで受け入れるか、入力を開始することで dismiss できます。

## アーキテクチャ

```
┌─────────────────────────────────────────────────────────────┐
│  AppContainer (CLI)                                         │
│                                                             │
│  Responding → Idle への遷移                                  │
│       │                                                     │
│       ▼                                                     │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  ガード条件 (11カテゴリ)                              │    │
│  │  settings, interactive, sdk, plan mode, dialogs,    │    │
│  │  elicitation, API error                             │    │
│  └────────────────────┬────────────────────────────────┘    │
│                       │                                     │
│                       ▼                                     │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  generatePromptSuggestion()                         │    │
│  │                                                     │    │
│  │  ┌─── CacheSafeParams は利用可能？ ───┐             │    │
│  │  │                                  │               │    │
│  │  ▼ YES                         NO ▼                 │    │
│  │  runForkedQuery()      BaseLlmClient.generateJson() │    │
│  │  (cache-aware)         (スタンドアロンのフォールバック)   │    │
│  │                                                     │    │
│  │  ──── SUGGESTION_PROMPT ────                        │    │
│  │  ──── 12のフィルタルール ───                           │    │
│  │  ──── getFilterReason() ────                        │    │
│  └────────────────────┬────────────────────────────────┘    │
│                       │                                     │
│                       ▼                                     │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  FollowupController (フレームワーク非依存)            │    │
│  │  300ms遅延 → ゴーストテキストとして表示               │    │
│  │                                                     │    │
│  │  Tab    → 受け入れ (入力欄に入力)                     │    │
│  │  Enter  → 受け入れ + 送信                            │    │
│  │  Right  → 受け入れ (入力欄に入力)                     │    │
│  │  Type   → dismiss + 投機の中止                       │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Telemetry (PromptSuggestionEvent)                  │    │
│  │  outcome, accept_method, timing, similarity,        │    │
│  │  keystroke, focus, suppression reason, prompt_id     │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## サジェスト生成

### LLM プロンプト

```
[SUGGESTION MODE: What the user would naturally type next.を提案してください]

まず、アシスタントの最新メッセージの最後の数行を読んでください。そこには次のステップのヒント、
アドバイス、アクション可能な提案が通常含まれています。次に、ユーザーの最近のメッセージと
元のリクエストを確認してください。

あなたの仕事は、ユーザーが次に何を入力するかを予測することです — あなたがすべきと
考えることではありません。
判断基準: ユーザーが「今まさにそれを入力しようとしていた」と思うでしょうか？

優先ルール: アシスタントの最後のメッセージに "Tip: type X to ..." や
"type X to ..." のようなヒントやアドバイスが含まれている場合、X を抽出して
サジェストとしてください。これらは明示的な次のステップのヒントです。

例:
アシスタントが "Tip: type post comments to publish findings" → "post comments"
アシスタントが "type /review to start" → "/review"
ユーザーが「バグを修正してテストを実行して」と依頼、バグ修正完了 → "run the tests"
コード作成後 → "try it out"
タスク完了、明確なフォローアップがある場合 → "commit this" または "push it"

フォーマット: 2〜12語、ユーザーのスタイルに合わせてください。または何も出力しないでください。
サジェストのみを回答として出力し、引用符や説明は不要です。
```

### フィルタルール（12種類）

| Rule               | ブロック例                                        |
| ------------------ | ------------------------------------------------ |
| done               | "done"                                           |
| meta_text          | "nothing found", "no suggestion", "silence"      |
| meta_wrapped       | "(silence)", "[no suggestion]"                   |
| error_message      | "api error: 500"                                 |
| prefixed_label     | "Suggestion: commit"                             |
| too_few_words      | "hmm"（ただし "yes", "commit", "push" などは許可） |
| too_many_words     | > 12語                                           |
| too_long           | >= 100文字                                       |
| multiple_sentences | "Run tests. Then commit."                        |
| has_formatting     | 改行、マークダウンの太字                              |
| evaluative         | "looks good", "thanks"（\b 単語境界を使用）        |
| ai_voice           | "Let me...", "I'll...", "Here's..."              |

### ガード条件

**AppContainer useEffect（コード内で13のチェック）:**

| Guard                | チェック内容                                          |
| -------------------- | --------------------------------------------------- |
| Settings toggle      | `enableFollowupSuggestions`                         |
| Non-interactive      | `config.isInteractive()`                            |
| SDK mode             | `!config.getSdkMode()`                              |
| Streaming transition | `Responding → Idle`（2回チェック）                    |
| API error (履歴)     | `historyManager.history[last]?.type !== 'error'`    |
| API error (保留中)   | `!pendingGeminiHistoryItems.some(type === 'error')` |
| Confirmation dialogs | shell + general + loop 検出（3回チェック）            |
| Permission dialog    | `isPermissionsDialogOpen`                           |
| Elicitation          | `settingInputRequests.length === 0`                 |
| Plan mode            | `ApprovalMode.PLAN`                                 |

**generatePromptSuggestion() 内部:**

| Guard              | チェック内容     |
| ------------------ | ---------------- |
| 会話初期            | `modelTurns < 2` |

**別個の機能フラグ（ガードブロック外）:**

| Flag                 | 制御対象                                                |
| -------------------- | ------------------------------------------------------- |
| `enableCacheSharing` | forked query を使用するか、generateJson にフォールバックするか |
| `enableSpeculation`  | サジェスト表示時に投機を開始するかどうか                     |

## 状態管理

### FollowupState

```typescript
interface FollowupState {
  suggestion: string | null;
  isVisible: boolean;
  shownAt: number; // テレメトリ用のタイムスタンプ
}
```

### FollowupController

フレームワーク非依存のコントローラで、CLI（Ink）とWebUI（React）で共有:

- `setSuggestion(text)` — 300msの遅延後に表示、nullの場合は即座にクリア
- `accept(method)` — 状態をクリア、マイクロタスク経由で `onAccept` を発火、100msのデバウンスロック
- `dismiss()` — 状態をクリア、`ignored` テレメトリを記録
- `clear()` — すべての状態 + タイマーをハードリセット
- `Object.freeze(INITIAL_FOLLOWUP_STATE)` で誤った変更を防止

## キーボード操作

| キー        | CLI                         | WebUI                                |
| ----------- | --------------------------- | ------------------------------------ |
| Tab         | 入力欄にセット（送信なし）     | 入力欄にセット（送信なし）               |
| Enter       | セット + 送信               | セット + 送信（`explicitText` パラメータ） |
| 右矢印キー   | 入力欄にセット（送信なし）     | 入力欄にセット（送信なし）               |
| 文字入力     | Dismiss + 投機の中止         | Dismiss                              |
| 貼り付け     | Dismiss + 投機の中止         | Dismiss                              |

### キーバインディングに関する注意

Tab ハンドラは明示的に `key.name === 'tab'` を使用しています（`ACCEPT_SUGGESTION` マッチャーではありません）。なぜなら `ACCEPT_SUGGESTION` は Enter キーにもマッチし、Enter キーは SUBMIT ハンドラで処理される必要があるためです。

## テレメトリ

### PromptSuggestionEvent

| Field                      | Type                        | 説明                                |
| -------------------------- | --------------------------- | ----------------------------------- |
| outcome                    | accepted/ignored/suppressed | 最終的な結果                          |
| prompt_id                  | string                      | デフォルト: 'user_intent'            |
| accept_method              | tab/enter/right             | ユーザーが受け入れた方法                |
| time_to_accept_ms          | number                      | 表示から受け入れまでの時間              |
| time_to_ignore_ms          | number                      | 表示からdismissまでの時間              |
| time_to_first_keystroke_ms | number                      | 表示中に最初のキー入力があった時間       |
| suggestion_length          | number                      | 文字数                              |
| similarity                 | number                      | 受け入れ時は1.0、無視時は0.0          |
| was_focused_when_shown     | boolean                     | 表示時にターミナルにフォーカスがあったか  |
| reason                     | string                      | suppressedの場合: フィルタルール名    |

### SpeculationEvent

| Field                    | Type                    | 説明                        |
| ------------------------ | ----------------------- | --------------------------- |
| outcome                  | accepted/aborted/failed | 投機の結果                    |
| turns_used               | number                  | API ラウンドトリップ数        |
| files_written            | number                  | オーバーレイ内のファイル数     |
| tool_use_count           | number                  | 実行されたツール数            |
| duration_ms              | number                  | 経過時間（ウォールクロック）   |
| boundary_type            | string                  | 投機を停止した要因            |
| had_pipelined_suggestion | boolean                 | 次のサジェストが生成されたか    |

## 機能フラグと設定

| Setting                     | Type    | Default | 説明                                                                    |
| --------------------------- | ------- | ------- | ----------------------------------------------------------------------- |
| `enableFollowupSuggestions` | boolean | true    | プロンプトサジェストのマスタートグル                                       |
| `enableCacheSharing`        | boolean | true    | キャッシュを考慮した forked query を使用する                                |
| `enableSpeculation`         | boolean | false   | 予測実行エンジン                                                           |
| `fastModel` (トップレベル)   | string  | ""      | 全バックグラウンドタスク用のモデル（空の場合はメインモデルを使用）。`/model --fast` で設定 |

### 内部プロンプトIDフィルタリング

バックグラウンド操作は専用のプロンプトID（`utils/internalPromptIds.ts` 内の `INTERNAL_PROMPT_IDS`）を使用し、APIトラフィックやツール呼び出しがユーザー表示用UIに表示されないようにします:

| Prompt ID           | 使用場所                     |
| ------------------- | ---------------------------- |
| `prompt_suggestion` | サジェスト生成                  |
| `forked_query`      | キャッシュ対応の forked query  |
| `speculation`       | 投機エンジン                    |

**適用されるフィルタリング:**

- `loggingContentGenerator` — 内部IDの場合、`logApiRequest` と OpenAI インタラクションのログ記録をスキップ
- `logApiResponse` / `logApiError` — `chatRecordingService.recordUiTelemetryEvent` をスキップ
- `logToolCall` — `chatRecordingService.recordUiTelemetryEvent` をスキップ
- `uiTelemetryService.addEvent` — **フィルタリングされない**（`/stats` のトークン追跡が機能するように）

### Thinking モード

全バックグラウンドタスクパスで、Thinking/推論は明示的に無効化されています（`thinkingConfig: { includeThoughts: false }`）:

- **Forked query パス**（`createForkedChat`）— クローンされた `generationConfig` で `thinkingConfig` をオーバーライド。サジェスト生成と投機の両方をカバー
- **BaseLlm フォールバックパス**（`generateViaBaseLlm`）— リクエストごとの設定でベースコンテンツジェネレーターのthinking設定をオーバーライド

これは以下の理由で安全です:

- キャッシュプレフィックスは `systemInstruction` + `tools` + `history` によって決定され、`thinkingConfig` は影響しないため、キャッシュヒットに影響はありません
- 全バックエンド（Gemini、OpenAI互換、Anthropic）は `includeThoughts: false` を処理してthinkingフィールドを省略するため、thinking未対応のモデルでもAPIエラーは発生しません
- サジェスト生成と投機は推論トークンの恩恵を受けません