# セッション Recap の設計

> ユーザーがアイドル状態のセッションに戻った際、オンデマンド（`/recap`）またはターミナルが 5 分以上フォーカスを失った（blurred）後に、作業の続きを把握するための簡潔な要約（1〜2 文）を表示する機能。

## 概要

ユーザーが数日ぶりに古いセッションを `/resume` した際、何をやっていたか、次は何をすべきかを思い出すために長い履歴をスクロールするのは大きな摩擦ポイントとなる。単にメッセージを再読み込みするだけでは、この UX 上の課題は解決できない。

ユーザーが戻ってきた際に、簡潔な 1〜2 文の要約を積極的に表示することを目的とする：

- **高レベルのタスク**（何をしているか）→ **次のステップ**（次に何をすべきか）。
- アシスタントの実際の返信とは視覚的に区別し、新しいモデル出力と誤認されないようにする。
- **ベストエフォート型**：失敗時は静かに処理し、メインのフローを絶対に中断させない。

## トリガー

| トリガー | 条件 | 実装 |
| ---------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **手動** | ユーザーが `/recap` を実行 | `recapCommand.ts` が同じ基盤サービスを呼び出す |
| **自動** | ターミナルがフォーカスを失った状態（DECSET 1004 フォーカスプロトコル）が ≥ 5 分継続 + フォーカスが復帰 + ストリームが `Idle` | `useAwaySummary.ts` — 5 分のブラータイマー + `useFocus` イベントリスナー |

両方のパスは単一の関数 `generateSessionRecap()` に集約され、同一の動作を保証する。自動トリガーは `general.showSessionRecap` 設定によって制御される（デフォルト: 無効 — 明示的なオプトインが必要。これにより、待機中の LLM 呼び出しがユーザーの請求に静かに追加されることを防ぐ）。手動コマンドはこの設定を無視する。

## Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                          AppContainer.tsx                              │
│   isFocused = useFocus()                                               │
│   isIdle = streamingState === Idle                                     │
│       │                                                                │
│       ├─→ useAwaySummary({enabled, config, isFocused, isIdle,          │
│       │       │             addItem})                                  │
│       │       └─→ 5 min blur timer + idle/dedupe gates                 │
│       │              │                                                 │
│       │              ↓                                                 │
│       └─→ recapCommand (slash) ─→ generateSessionRecap(config, signal) │
│                                          │                             │
│                                          ↓                             │
│                              ┌─────────────────────────┐               │
│                              │ packages/core/services/ │               │
│                              │   sessionRecap.ts       │               │
│                              └─────────────────────────┘               │
│                                          │                             │
│                                          ↓                             │
│                              GeminiClient.generateContent              │
│                              (fastModel + tools:[])                    │
│                                                                        │
│   addItem({type: 'away_recap', text}) ─→ HistoryItemDisplay            │
│       └─ AwayRecapMessage rendered inline like any other history       │
│         item (※ + bold "recap: " + italic content, all dim);           │
│         scrolls naturally with the conversation. Mirrors Claude        │
│         Code's away_summary system message.                            │
└────────────────────────────────────────────────────────────────────────┘
```

### ファイル

| ファイル | 役割 |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `packages/core/src/services/sessionRecap.ts` | 1 回の LLM 呼び出し + 履歴フィルタリング + タグ抽出 |
| `packages/cli/src/ui/hooks/useAwaySummary.ts` | 自動トリガー用 React フック |
| `packages/cli/src/ui/commands/recapCommand.ts` | `/recap` 手動実行のエントリポイント |
| `packages/cli/src/ui/components/messages/StatusMessages.tsx` | `AwayRecapMessage` レンダラー（`※` + 太字 `recap:` + イタリック本文、すべて薄暗表示） |
| `packages/cli/src/ui/types.ts` | `HistoryItemAwayRecap` 型定義 |
| `packages/cli/src/ui/components/HistoryItemDisplay.tsx` | `away_recap` 履歴アイテムをレンダラーにディスパッチ |
| `packages/cli/src/config/settingsSchema.ts` | `general.showSessionRecap` および `general.sessionRecapAwayThresholdMinutes` 設定 |

## プロンプト設計

### システムプロンプト

`generationConfig.systemInstruction` がこの 1 回の呼び出しでメインエージェントのシステムプロンプトを上書きするため、モデルはコーディングアシスタントではなく要約ジェネレーターとしてのみ動作する。

なお、`GeminiClient.generateContent()` は内部的にプロンプトを `getCustomSystemPrompt()` に通し、ユーザーのメモリ（`QWEN.md` / 管理対象自動メモリ）をサフィックスとして追加する。最終的なシステムプロンプトは `要約用プロンプト + ユーザーメモリ` となり、要約にとって有用なプロジェクトコンテキストとなる（情報漏洩ではない）。

以下の箇条書きは `RECAP_SYSTEM_PROMPT` と 1:1 で対応している：

- 40 語以内、1〜2 文の平文（マークダウン / リスト / 見出しなし）。中国語の場合は、合計約 80 文字を上限とする。
- 1 文目：高レベルのタスク。2 文目：具体的な次のステップ。
- 明示的に禁止：実施内容の列挙、ツール呼び出しの羅列、ステータス報告。
- 会話の主要言語（英語または中国語）に合わせる。
- 出力を `<recap>...</recap>` で囲む。タグの外に何も出力しない。

### 構造化出力と抽出

モデルには、回答を `<recap>...</recap>` で囲むよう指示する：

```
<recap>Refactoring loopDetectionService.ts to address long-session OOM. Next step is to implement option B.</recap>
```

理由：一部のモデル（GLM ファミリー、推論モデル）は最終回答の前に「思考」段落を出力する。生のテキストをそのまま返すと、その推論過程が UI に漏れてしまう。

`extractRecap()` には 3 つのフォールバック階層がある：

1. 両方のタグが存在する場合：`<recap>...</recap>` の間のテキストを取得（推奨）。
2. 開始タグのみ存在する場合（例：`maxOutputTokens` により終了タグが切り捨てられた）：開始タグ以降のすべてを取得。
3. タグが完全に欠落している場合：空文字列を返す → サービスが `null` を返す → UI は何もレンダリングしない。

第 3 階層は「間違ったものを表示するより、表示しない方がまし」という方針に基づいている。モデルの推論前置きを表面化させることは、要約を一切表示しないよりも悪影響が大きい。

### 呼び出しパラメータ

| パラメータ | 値 | 理由 |
| ------------------- | ------------------------------ | ----------------------------------------------------- |
| `model` | `getFastModel() ?? getModel()` | 要約に最上位モデルは不要 |
| `tools` | `[]` | 1 回のクエリ実行、ツール使用なし |
| `maxOutputTokens` | `300` | 1〜2 文の短い文章 + タグ用の余裕 |
| `temperature` | `0.3` | ほぼ決定論的だが、自然なバリエーションを許容 |
| `systemInstruction` | 上記の要約専用プロンプト | メインエージェントの役割定義を上書き |

## 履歴フィルタリング

`geminiClient.getChat().getHistory()` は以下の要素を含む `Content[]` を返す：

- `user` / `model` のテキストメッセージ
- `model` の `functionCall` パート
- `user` の `functionResponse` パート（ファイル全体の内容を含む場合あり）
- `model` の思考パート（`part.thought` / `part.thoughtSignature`、モデルの隠れた推論）

`filterToDialog()` は、**テキストが空でなく、かつ思考パートではない** `user` / `model` パートのみを保持する。理由は 2 つある：

- **ツール呼び出し / 応答**：1 つの `functionResponse` が 10K トークンを超える場合がある。このようなメッセージが 30 件あると、要約用 LLM が無関係な詳細に埋もれ、トークンの無駄遣いになるだけでなく、「Y ファイルを読み取るために X ツールを呼び出した」といった実装ノイズに要約が偏ってしまう。
- **思考パート**：モデルの内部推論を保持する。これを含めると、隠れた思考連鎖を対話として扱い、要約テキストに表面化させてしまうリスクがある。

空のメッセージを除外した後、`takeRecentDialog` は直近 30 メッセージにスライスし、未完了のモデル/ツール応答が境界に来る位置からスライスを開始することを拒否する。

## 同時実行とエッジケース

### 自動トリガーフックのステートマシン

`useAwaySummary` は 3 つの ref を保持する：

| Ref | 意味 |
| ----------------- | ------------------------------------------------- |
| `blurredAtRef` | フォーカス喪失の開始時刻（フォーカス復帰までクリアされない） |
| `recapPendingRef` | LLM 呼び出しが実行中かどうか |
| `inFlightRef` | 現在実行中の `AbortController` |

`useEffect` の依存配列：`[enabled, config, isFocused, isIdle, addItem, thresholdMs]`。

| イベント | アクション |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `!enabled \|\| !config` | 実行中の呼び出しを中止 + `inFlightRef` をクリア + `blurredAtRef` をクリア |
| `!isFocused` かつ `blurredAtRef === null` | `blurredAtRef = Date.now()` を設定 |
| `isFocused` かつ `blurredAtRef === null` | 早期リターン（処理すべきブラーサイクルなし — 初回レンダリング、または短いブラーリセット直後） |
| `isFocused` かつブラー継続時間 < 5 分 | `blurredAtRef` をクリアし、次のブラーサイクルを待機 |
| `isFocused` かつブラー ≥ 5 分 かつ `recapPendingRef` | リターン（重複排除） |
| `isFocused` かつブラー ≥ 5 分 かつ `!isIdle` | `blurredAtRef` を保持し、ターンが完了するまで待機（`isIdle` が依存配列に含まれているため、ストリーミング完了時にエフェクトが再実行される） |
| `isFocused` かつブラー ≥ 5 分 かつ `shouldFireRecap` が false を返す | `blurredAtRef` をクリアしてリターン — 前回の要約以降、会話の進展が不十分（ユーザーターン ≥ 2 回が必要。Claude Code に準拠） |
| `isFocused` かつすべての条件を満たす | `blurredAtRef` をクリア、`recapPendingRef = true` を設定、`AbortController` を作成、LLM リクエストを送信 |

`.then` コールバック内で `isIdleRef.current` を**再チェック**する：LLM 実行中にユーザーが新しいターンを開始していた場合、遅れて到着した要約は破棄され、ターン途中への挿入を防ぐ。

`.finally` は `recapPendingRef` をクリアし、`inFlightRef.current === controller` の場合のみ `inFlightRef` をクリアする（これにより、新しいコントローラーを上書きしないようにする）。

2 つ目の `useEffect` は、アンマウント時に実行中のコントローラーを中止する。

### `/recap` のゲート処理

`CommandContext.ui.isIdleRef` は現在のストリーム状態を公開する（既存の `btwAbortControllerRef` パターンに準拠）。インタラクティブモードでは、`!isIdleRef.current` または `pendingItem !== null` の場合、`recapCommand` は実行を拒否する。`pendingItem` だけでは不十分である。通常のモデル返信は `streamingState === Responding` かつ `pendingItem` が `null` の状態で実行されるためである。

## 設定とモデル選択

### ユーザー向け設定項目

| 設定 | デフォルト | 備考 |
| ------------------------------------------ | ------- | ----------------------------------------------------------------------------------- |
| `general.showSessionRecap` | `false` | 自動トリガーのみ適用。手動 `/recap` はこれを無視する。 |
| `general.sessionRecapAwayThresholdMinutes` | `5` | フォーカス復帰時に自動要約が発火するまでのブラー時間（分）。Claude Code のデフォルトに一致。 |
| `fastModel` | 未設定 | 高速かつ低コストな要約に推奨（例：`qwen3-coder-flash`）。 |

### モデルのフォールバック

`config.getFastModel() ?? config.getModel()` の動作：

- ユーザーが `fastModel` を設定しており、現在の認証タイプで有効な場合 → `fastModel` を使用。
- それ以外の場合 → メインセッションモデルにフォールバック（動作はするが、コストが高く速度も遅い）。

## 観測性（Observability）

`createDebugLogger('SESSION_RECAP')` は以下を出力する：

- 要約パスでキャッチされた例外（`debugLogger.warn`）。

すべての失敗はユーザーに対して**完全に透過的**である。要約は補助機能であり、UI に例外をスローすることはない。開発者はデバッグログファイル内の `[SESSION_RECAP]` タグを `grep` できる：デフォルトでは `~/.qwen/debug/<sessionId>.txt` に書き込まれる（`latest.txt` は現在のセッションへのシンボリックリンク）。`QWEN_DEBUG_LOG_FILE=0` で無効化可能。

## スコープ外

| 項目 | 除外理由 |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `/recap` の進行状況 UI（スピナー / `pendingItem`） | 3〜5 秒の待機は許容範囲内であり、実装が複雑化する。 |
| 自動テスト | サービスは小規模（約 150 行）であり、まずは手動でエンドツーエンドテストを実施。ユニットテストは別の PR で対応可能。 |
| ローカライズされたプロンプト | システムプロンプトはモデル向けであり、英語が最も信頼性の高い基盤となる。出力言語はモデルが会話内容から自動的に選択する。 |
| `QWEN_CODE_ENABLE_AWAY_SUMMARY` 環境変数 | Claude Code はテレメトリ無効化時に機能を維持するために使用しているが、Qwen Code の現在のテレメトリモデルでは不要。 |
| `/resume` 完了時の自動要約 | 自然な拡張ではあるが、`useResumeCommand` へのフックポイントが必要であり、この PR のスコープ外。 |