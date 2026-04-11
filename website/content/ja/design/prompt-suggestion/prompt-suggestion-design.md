# プロンプト提案 (NES) の設計

> AI がレスポンスの完了後にユーザーが自然に入力しそうな次の入力を予測し、入力プロンプトにゴーストテキストとして表示します。
>
> 実装状況: `prompt-suggestion-implementation.md`。Speculation エンジン: `speculation-design.md`。

## 概要

**プロンプト提案**（Next-step Suggestion / NES）は、AI の各レスポンス後に LLM 呼び出しによって生成される、ユーザーの次の入力の短い予測（2〜12語）です。入力プロンプトにゴーストテキストとして表示されます。ユーザーは Tab/Enter/右矢印キーで accept するか、キー入力で dismiss できます。

## アーキテクチャ

```
┌─────────────────────────────────────────────────────────────┐
│  AppContainer (CLI)                                         │
│                                                             │
│  Responding → Idle transition                               │
│       │                                                     │
│       ▼                                                     │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Guard Conditions (11 categories)                    │    │
│  │  settings, interactive, sdk, plan mode, dialogs,    │    │
│  │  elicitation, API error                             │    │
│  └────────────────────┬────────────────────────────────┘    │
│                       │                                     │
│                       ▼                                     │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  generatePromptSuggestion()                         │    │
│  │                                                     │    │
│  │  ┌─── CacheSafeParams available? ───┐               │    │
│  │  │                                  │               │    │
│  │  ▼ YES                         NO ▼                 │    │
│  │  runForkedQuery()      BaseLlmClient.generateJson() │    │
│  │  (cache-aware)         (standalone fallback)        │    │
│  │                                                     │    │
│  │  ──── SUGGESTION_PROMPT ────                        │    │
│  │  ──── 12 filter rules ──────                        │    │
│  │  ──── getFilterReason() ────                        │    │
│  └────────────────────┬────────────────────────────────┘    │
│                       │                                     │
│                       ▼                                     │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  FollowupController (framework-agnostic)            │    │
│  │  300ms delay → show as ghost text                   │    │
│  │                                                     │    │
│  │  Tab    → accept (fill input)                       │    │
│  │  Enter  → accept + submit                           │    │
│  │  Right  → accept (fill input)                       │    │
│  │  Type   → dismiss + abort speculation               │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Telemetry (PromptSuggestionEvent)                  │    │
│  │  outcome, accept_method, timing, similarity,        │    │
│  │  keystroke, focus, suppression reason, prompt_id     │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## 提案の生成

### LLM プロンプト

```
[SUGGESTION MODE: Suggest what the user might naturally type next.]

FIRST: Read the LAST FEW LINES of the assistant's most recent message — that's where
next-step hints, tips, and actionable suggestions usually appear. Then check the user's
recent messages and original request.

Your job is to predict what THEY would type - not what you think they should do.
THE TEST: Would they think "I was just about to type that"?

PRIORITY: If the assistant's last message contains a tip or hint like "Tip: type X to ..."
or "type X to ...", extract X as the suggestion. These are explicit next-step hints.

EXAMPLES:
Assistant says "Tip: type post comments to publish findings" → "post comments"
Assistant says "type /review to start" → "/review"
User asked "fix the bug and run tests", bug is fixed → "run the tests"
After code written → "try it out"
Task complete, obvious follow-up → "commit this" or "push it"

Format: 2-12 words, match the user's style. Or nothing.
Reply with ONLY the suggestion, no quotes or explanation.
```

### フィルター規則（12項目）

| 規則               | ブロックされる例                                  |
| ------------------ | ------------------------------------------------ |
| done               | "done"                                           |
| meta_text          | "nothing found", "no suggestion", "silence"      |
| meta_wrapped       | "(silence)", "[no suggestion]"                   |
| error_message      | "api error: 500"                                 |
| prefixed_label     | "Suggestion: commit"                             |
| too_few_words      | "hmm" (but allows "yes", "commit", "push" etc.)  |
| too_many_words     | > 12 words                                       |
| too_long           | >= 100 chars                                     |
| multiple_sentences | "Run tests. Then commit."                        |
| has_formatting     | newlines, markdown bold                          |
| evaluative         | "looks good", "thanks" (with \b word boundaries) |
| ai_voice           | "Let me...", "I'll...", "Here's..."              |

### ガード条件

**AppContainer useEffect（コード内の13チェック）:**

| ガード                | チェック内容                                               |
| -------------------- | --------------------------------------------------- |
| 設定の切り替え      | `enableFollowupSuggestions`                         |
| 非インタラクティブ  | `config.isInteractive()`                            |
| SDK モード          | `!config.getSdkMode()`                              |
| ストリーミング遷移  | `Responding → Idle` (2 checks)                      |
| API エラー（履歴）  | `historyManager.history[last]?.type !== 'error'`    |
| API エラー（保留中）| `!pendingGeminiHistoryItems.some(type === 'error')` |
| 確認ダイアログ      | shell + general + loop detection (3 checks)         |
| 権限ダイアログ      | `isPermissionsDialogOpen`                           |
| Elicitation         | `settingInputRequests.length === 0`                 |
| プランモード        | `ApprovalMode.PLAN`                                 |

**generatePromptSuggestion() 内部:**

| ガード              | チェック内容     |
| ------------------ | ---------------- |
| 会話の初期段階     | `modelTurns < 2` |

**個別のフィーチャーフラグ（ガードブロック外）:**

| フラグ                 | 制御内容                                                |
| -------------------- | ------------------------------------------------------- |
| `enableCacheSharing` | フォーククエリを使用するか、`generateJson` にフォールバックするか |
| `enableSpeculation`  | 提案表示時に Speculation を開始するかどうか      |

## 状態管理

### FollowupState

```typescript
interface FollowupState {
  suggestion: string | null;
  isVisible: boolean;
  shownAt: number; // timestamp for telemetry
}
```

### FollowupController

CLI (Ink) と WebUI (React) で共有されるフレームワーク非依存のコントローラー:

- `setSuggestion(text)` — 300ms の遅延後に表示。null の場合は即時クリア
- `accept(method)` — 状態をクリアし、microtask 経由で `onAccept` を発火。100ms のデバウンスロックあり
- `dismiss()` — 状態をクリアし、`ignored` テレメトリを記録
- `clear()` — すべての状態とタイマーをハードリセット
- `Object.freeze(INITIAL_FOLLOWUP_STATE)` による意図しないミューテーションの防止

## キーボード操作

| キー         | CLI                         | WebUI                                |
| ----------- | --------------------------- | ------------------------------------ |
| Tab         | 入力欄に反映（送信なし）      | 入力欄に反映（送信なし）               |
| Enter       | 入力欄に反映 + 送信               | 入力欄に反映 + 送信 (`explicitText` パラメータ) |
| 右矢印キー | 入力欄に反映（送信なし）      | 入力欄に反映（送信なし）               |
| キー入力      | 無効化 + Speculation の中止 | 無効化                              |
| 貼り付け       | 無効化 + Speculation の中止 | 無効化                              |

### キーバインドの注意事項

Tab ハンドラーは `ACCEPT_SUGGESTION` マッチャーではなく `key.name === 'tab'` を明示的に使用します。これは `ACCEPT_SUGGESTION` が Enter にもマッチするため、SUBMIT ハンドラーにフォールスルーさせる必要があるためです。

## テレメトリ

### PromptSuggestionEvent

| フィールド                      | 型                        | 説明                         |
| -------------------------- | --------------------------- | ----------------------------------- |
| outcome                    | accepted/ignored/suppressed | 最終結果                       |
| prompt_id                  | string                      | デフォルト: 'user_intent'              |
| accept_method              | tab/enter/right             | ユーザーの確定方法                   |
| time_to_accept_ms          | number                      | 表示から確定までの時間           |
| time_to_ignore_ms          | number                      | 表示から無効化までの時間          |
| time_to_first_keystroke_ms | number                      | 表示中の最初のキー入力までの時間 |
| suggestion_length          | number                      | 文字数                     |
| similarity                 | number                      | 確定時は 1.0、無効化時は 0.0      |
| was_focused_when_shown     | boolean                     | 表示時にターミナルがフォーカスされていたか                  |
| reason                     | string                      | 抑制された場合: フィルター規則名    |

### SpeculationEvent

| フィールド                    | 型                    | 説明               |
| ------------------------ | ----------------------- | ------------------------- |
| outcome                  | accepted/aborted/failed | Speculation の結果        |
| turns_used               | number                  | API の往復回数           |
| files_written            | number                  | オーバーレイ内のファイル数          |
| tool_use_count           | number                  | 実行されたツール数            |
| duration_ms              | number                  | 実経過時間           |
| boundary_type            | string                  | Speculation を停止させた要因  |
| had_pipelined_suggestion | boolean                 | 次の提案が生成されたか |

## フィーチャーフラグと設定

| 設定                     | 型    | デフォルト | 説明                                                                      |
| --------------------------- | ------- | ------- | -------------------------------------------------------------------------------- |
| `enableFollowupSuggestions` | boolean | true    | プロンプト提案のマスター切り替え                                             |
| `enableCacheSharing`        | boolean | true    | キャッシュ対応のフォーククエリを使用する                                                   |
| `enableSpeculation`         | boolean | false   | 予測実行エンジン                                                      |
| `fastModel` (top-level)     | string  | ""      | すべてのバックグラウンドタスクに使用するモデル（空 = メインモデルを使用）。`/model --fast` で設定 |

### 内部プロンプト ID のフィルタリング

バックグラウンド操作では専用のプロンプト ID（`utils/internalPromptIds.ts` の `INTERNAL_PROMPT_IDS`）を使用し、API トラフィックとツール呼び出しがユーザーに表示される UI に現れないようにします:

| プロンプト ID           | 使用箇所                    |
| ------------------- | -------------------------- |
| `prompt_suggestion` | 提案の生成      |
| `forked_query`      | キャッシュ対応のフォーククエリ |
| `speculation`       | Speculation エンジン         |

**適用されるフィルタリング:**

- `loggingContentGenerator` — 内部 ID に対する `logApiRequest` と OpenAI 相互作用のログ記録をスキップ
- `logApiResponse` / `logApiError` — `chatRecordingService.recordUiTelemetryEvent` をスキップ
- `logToolCall` — `chatRecordingService.recordUiTelemetryEvent` をスキップ
- `uiTelemetryService.addEvent` — **フィルタリングされない**（`/stats` のトークン追跡が機能することを保証）

### Thinking モード

すべてのバックグラウンドタスクパスにおいて、Thinking/推論は明示的に無効化されています（`thinkingConfig: { includeThoughts: false }`）:

- **フォーククエリパス**（`createForkedChat`）— クローンされた `generationConfig` 内の `thinkingConfig` を上書きし、提案生成と Speculation の両方をカバー
- **BaseLlm フォールバックパス**（`generateViaBaseLlm`）— リクエストごとの設定がベースコンテンツジェネレーターの Thinking 設定を上書き

これは以下の理由により安全です:

- キャッシュプレフィックスは `thinkingConfig` ではなく `systemInstruction` + `tools` + `history` によって決定されるため、キャッシュヒットには影響しない
- すべてのバックエンド（Gemini、OpenAI 互換、Anthropic）は `includeThoughts: false` を thinking フィールドの省略として処理するため、Thinking 未対応のモデルでも API エラーが発生しない
- 提案生成と Speculation は推論トークンから恩恵を受けない