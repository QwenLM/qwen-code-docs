# セッション要約設計

> ユーザーがアイドルセッションに戻った際に表示される、簡潔な（1～2文の）「どこまでやったか」の概要。`/recap` コマンドで手動表示、またはターミナルが5分以上フォーカスを失った後に自動表示されます。

## 概要

ユーザーが数日後に古いセッションを `/resume` したとき、履歴を何ページもさかのぼって **何をしていて、次に何をする予定だったか** を思い出すのは大きなストレスです。単にメッセージをリロードするだけでは、このUXの問題は解決しません。

目標は、ユーザーが戻ったときに簡潔な1～2文の要約をプロアクティブに表示することです。

- **高レベルのタスク**（何をしているか）→ **次のステップ**（次に何をすべきか）。
- 実際のアシスタントの応答と視覚的に区別され、新しいモデル出力と誤認されることがないようにします。
- **ベストエフォート**：失敗は必ずサイレントに処理し、メインフローを壊さないこと。

## トリガー

| トリガー        | 条件                                                                                     | 実装                                                                                                                                     |
| --------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **手動**        | ユーザーが `/recap` を実行                                                                | `recapCommand.ts` が同一の基盤サービスを呼び出す                                                                                         |
| **自動**        | ターミナルがブラー状態（DECSET 1004 フォーカスプロトコル）に5分以上 + フォーカス復帰 + ストリームが `Idle` | `useAwaySummary.ts` — 5分ブラータイマー + `useFocus` イベントリスナー                                                                     |
| **デーモンHTTP** | リモートクライアントが `POST /session/:id/recap` を呼び出す                                | `server.ts` ルート → `bridge.generateSessionRecap` (ext-method ラウンドトリップ) → `acpAgent.ts` が `generateSessionRecap(session.getConfig(), signal)` を呼び出す |

これら3つのパスはすべて、`core/services/sessionRecap.ts` の同じ `generateSessionRecap()` 関数に集約され、同一の動作を保証します。自動トリガーは `general.showSessionRecap` で制御されます（デフォルト: off — 明示的なオプトイン。環境LLM呼び出しがユーザーの請求に黙って追加されるのを防ぎます）。手動コマンドとデーモンHTTPルートはこの設定を無視します（呼び出し元が明示的にリクエストしているため）。

### デーモンアクセスパス

デーモンルートは非厳格ゲートです（`/session/:id/prompt` と同様の姿勢 — 要約はトークンを消費しますが、状態を変更しません）。機能タグ `session_recap` が `/capabilities.features` でルートを通知します。SDKヘルパー: `DaemonClient.recapSession(sessionId, opts)` および `DaemonSessionClient.recap(opts)`。ワイヤ契約とエラーエンベロープについては `docs/developers/qwen-serve-protocol.md` § `POST /session/:id/recap` を参照してください。

キャンセルは **v1では未実装** です。ルートはHTTPクライアントの切断をリッスンせず、`bridge.generateSessionRecap` に `AbortSignal` が渡されず、ACP子ハンドラは決して中断されない `AbortController().signal` をコアヘルパーに渡します（まだクロスプロセス中断の配管はありません）。唯一の上限はブリッジの60秒 `SESSION_RECAP_TIMEOUT_MS` バックストップと、ACPチャネル終了に対するトランスポートクローズの競合です。HTTP側の `AbortController` だけを配線しても外見的なものに過ぎません — 子側のLLM呼び出しは完了まで実行されるため、クロスプロセス中断部品なしではエンドツーエンドのキャンセルは実現できません。これはv1では許容範囲内です。なぜなら要約は短いからです（単一試行のサイドクエリ、`maxOutputTokens: 300`、通常1～5秒）。将来、リクエストIDベースのキャンセルext-methodによって、帯域コストが正当化された場合に完全なエンドツーエンドのキャンセルを配管できます。

## アーキテクチャ

```
┌────────────────────────────────────────────────────────────────────────┐
│                          AppContainer.tsx                              │
│   isFocused = useFocus()                                               │
│   isIdle = streamingState === Idle                                     │
│       │                                                                │
│       ├─→ useAwaySummary({enabled, config, isFocused, isIdle,          │
│       │       │             addItem})                                  │
│       │       └─→ 5分ブラータイマー + idle/dedupe ゲート                │
│       │              │                                                 │
│       │              ↓                                                 │
│       └─→ recapCommand (スラッシュ) ─→ generateSessionRecap(config, signal) │
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
│       └─ AwayRecapMessage が他の履歴アイテムと同様にインラインでレンダリング  │
│         （※ + 太字 "recap: " + 斜体コンテンツ、すべて薄く表示）;            │
│         会話と一緒に自然にスクロールします。Claude Code の away_summary   │
│         システムメッセージを模倣しています。                              │
└────────────────────────────────────────────────────────────────────────┘
```

### ファイル

| ファイル                                                        | 責務                                                                               |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `packages/core/src/services/sessionRecap.ts`                 | 単発のLLM呼び出し + 履歴フィルタリング + タグ抽出                                  |
| `packages/cli/src/ui/hooks/useAwaySummary.ts`                | 自動トリガー用Reactフック                                                           |
| `packages/cli/src/ui/commands/recapCommand.ts`               | `/recap` 手動エントリポイント                                                        |
| `packages/cli/src/ui/components/messages/StatusMessages.tsx` | `AwayRecapMessage` レンダラー（`※` + 太字 `recap:` + 斜体コンテンツ、すべて薄く表示）|
| `packages/cli/src/ui/types.ts`                               | `HistoryItemAwayRecap` 型                                                            |
| `packages/cli/src/ui/components/HistoryItemDisplay.tsx`      | `away_recap` 履歴アイテムをレンダラーにディスパッチ                                  |
| `packages/cli/src/config/settingsSchema.ts`                  | `general.showSessionRecap` + `general.sessionRecapAwayThresholdMinutes` 設定        |

## プロンプト設計

### システムプロンプト

`generationConfig.systemInstruction` は、この単一呼び出しのためにメインエージェントのシステムプロンプトを置き換えるため、モデルはコーディングアシスタントではなく、要約生成器としてのみ動作します。

`GeminiClient.generateContent()` は内部でプロンプトを `getCustomSystemPrompt()` に通し、ユーザーのメモリ（QWEN.md / 管理された自動メモリ）をサフィックスとして追加します。最終的なシステムプロンプトは `要約プロンプト + ユーザーメモリ` となります — 要約にとって有用なプロジェクトコンテキストであり、漏洩ではありません。

以下の箇条書きは `RECAP_SYSTEM_PROMPT` と1対1で対応します。

- 40語未満、1～2文のプレーンな文（マークダウン/リスト/見出しなし）。中国語の場合は、合計約80文字を予算として扱ってください。
- 最初の文：高レベルのタスク。次に：具体的な次のステップ。
- 明示的に禁止：やったことの列挙、ツール呼び出しの列挙、ステータスレポート。
- 会話の主要言語（英語または中国語）に合わせてください。
- 出力を `<recap>...</recap>` で囲むこと。タグの外側には何も出力しないこと。

### 構造化出力 + 抽出

モデルは回答を `<recap>...</recap>` で囲むように指示されています。

```
<recap>ループ検出サービスをリファクタリングして、長時間セッションのOOM問題に対処しています。次のステップはオプションBを実装することです。</recap>
```

理由：一部のモデル（GLMファミリー、推論モデル）は、最終回答の前に「思考」段落を出力します。生のテキストを返すと、その推論がUIに漏れてしまいます。

`extractRecap()` には3つのフォールバック階層があります。

1. 両方のタグが存在する場合：`<recap>...</recap>` の間のテキストを取得します（推奨）。
2. 開始タグのみ存在する場合（例：`maxOutputTokens` によって閉じタグが切り詰められた）：開始タグ以降のすべてを取得します。
3. タグが完全に欠落している場合：空文字列を返す → サービスは `null` を返す → UIは何もレンダリングしません。

3番目の階層は「間違ったものを表示するよりはスキップする」という方針です — モデルの推論前置きを表示することは、要約をまったく表示しないよりも悪いのです。

### 呼び出しパラメータ

| パラメータ           | 値                              | 理由                                                    |
| ------------------- | ------------------------------- | ------------------------------------------------------- |
| `model`             | `getFastModel() ?? getModel()`  | 要約に最先端モデルは不要                                |
| `tools`             | `[]`                            | 単発クエリ、ツール使用なし                              |
| `maxOutputTokens`   | `300`                           | 1～2短い文 + タグのための余裕                          |
| `temperature`       | `0.3`                           | ほぼ決定論的、わずかに自然なばらつき                    |
| `systemInstruction` | 上記の要約専用プロンプト        | メインエージェントの役割定義を置き換える                |

## 履歴フィルタリング

`geminiClient.getChat().getHistory()` は `Content[]` を返します。これには以下が含まれます。

- `user` / `model` のテキストメッセージ
- `model` の `functionCall` 部分
- `user` の `functionResponse` 部分（ファイルの完全な内容を含む可能性あり）
- `model` の思考部分（`part.thought` / `part.thoughtSignature`、モデルの隠れた推論）

`filterToDialog()` は、**空でないテキストを持ち、かつ思考部分ではない** `user` / `model` 部分のみを保持します。理由は2つ。

- **ツール呼び出し/応答**：単一の `functionResponse` が10K以上のトークンになることがあります。そのようなメッセージが30個あると、要約LLMを無関係な詳細で溺れさせ、トークンを浪費するだけでなく、要約を「Xツールを呼び出してYファイルを読んだ」といった実装ノイズに偏らせます。
- **思考部分**：モデルの内部推論を含みます。これを含めると、隠された思考連鎖を対話として扱い、要約テキストに表面化するリスクがあります。

空のメッセージを削除した後、`takeRecentDialog` は最後の30メッセージにスライスし、ぶら下がったモデル/ツール応答でスライスが始まらないようにします。

## 並行性とエッジケース

### 自動トリガーフックのステートマシン

`useAwaySummary` は3つのrefを保持します。

| Ref               | 意味                                             |
| ----------------- | ------------------------------------------------ |
| `blurredAtRef`    | ブラー開始時刻（フォーカスが戻るまでクリアされない）|
| `recapPendingRef` | LLM呼び出しが進行中かどうか                      |
| `inFlightRef`     | 現在進行中の `AbortController`                   |

`useEffect` の依存配列: `[enabled, config, isFocused, isIdle, addItem, thresholdMs]`

| イベント                                                          | アクション                                                                                                                               |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `!enabled \|\| !config`                                           | 進行中の呼び出しを中断 + `inFlightRef` をクリア + `blurredAtRef` をクリア                                                                |
| `!isFocused` かつ `blurredAtRef === null`                         | `blurredAtRef = Date.now()` を設定                                                                                                       |
| `isFocused` かつ `blurredAtRef === null`                          | 早期リターン（処理すべきブラーサイクルなし — 初回レンダリングまたは短時間ブラーリセット直後）                                                  |
| `isFocused` かつブラー期間が5分未満                                | `blurredAtRef` をクリア、次のブラーサイクルを待つ                                                                                         |
| `isFocused` かつブラー期間が5分以上で `recapPendingRef`           | リターン（重複防止）                                                                                                                     |
| `isFocused` かつブラー期間が5分以上で `!isIdle`                   | `blurredAtRef` を**保持**し、ターンが終わるのを待つ（`isIdle` が依存配列にあるため、ストリーミング完了時にエフェクトが再発火）             |
| `isFocused` かつブラー期間が5分以上で `shouldFireRecap` がfalse   | `blurredAtRef` をクリアしてリターン — 最後の要約以降、会話が十分に進んでいない（Claude Codeを模倣し、少なくとも2ユーザーターン必要）           |
| `isFocused` かつすべての条件を満たす                               | `blurredAtRef` をクリア、`recapPendingRef = true` を設定、`AbortController` を作成、LLMリクエストを送信                                     |

`.then` コールバックは **再度** `isIdleRef.current` をチェックします：LLM実行中にユーザーが新しいターンを開始していた場合、遅れて到着した要約は、ターン途中に挿入されるのを避けるために破棄されます。

`.finally` は `recapPendingRef` をクリアし、`inFlightRef.current === controller` の場合のみ `inFlightRef` をクリアします（新しいコントローラを上書きしないため）。

2つ目の `useEffect` は、アンマウント時に進行中のコントローラを中断します。

### `/recap` のゲート制御

`CommandContext.ui.isIdleRef` は現在のストリーム状態を公開します（既存の `btwAbortControllerRef` パターンを模倣）。インタラクティブモードでは、`recapCommand` は `!isIdleRef.current` **または** `pendingItem !== null` の場合に拒否します。`pendingItem` だけでは不十分です。通常のモデル応答は `streamingState === Responding` で実行され、`pendingItem` はnullだからです。

## 設定とモデル選択

### ユーザー向け設定項目

| 設定                                      | デフォルト | 備考                                                                                 |
| ----------------------------------------- | --------- | ------------------------------------------------------------------------------------ |
| `general.showSessionRecap`                | `false`   | 自動トリガーのみ。手動 `/recap` はこれを無視します。                                   |
| `general.sessionRecapAwayThresholdMinutes`| `5`       | フォーカス復帰時に自動要約が発動するまでのブラー時間（分）。Claude Codeのデフォルトに一致。|
| `fastModel`                               | 未設定    | 高速で安価な要約に推奨（例：`qwen3-coder-flash`）。                                     |

### モデルフォールバック

`config.getFastModel() ?? config.getModel()`:

- ユーザーが `fastModel` を設定しており、それが現在の認証タイプで有効な場合
  → `fastModel` を使用。
- それ以外の場合 → メインセッションモデルにフォールバック（動作はしますが、より高価で低速）。

## 観測可能性

`createDebugLogger('SESSION_RECAP')` が以下を出力します。

- 要約パスでキャッチされた例外（`debugLogger.warn`）。

すべての失敗はユーザーに対して **完全に透過的** です — 要約は補助的な機能であり、UIにスローされることはありません。開発者はデバッグログファイル内の `[SESSION_RECAP]` タグを grep できます：デフォルトで `~/.qwen/debug/<sessionId>.txt` に書き込まれます（`latest.txt` は現在のセッションへのシンボリックリンク）。`QWEN_DEBUG_LOG_FILE=0` で無効化可能。

## 対象外

| 項目                                             | 理由                                                                                                                                    |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `/recap` の進行状況UI（スピナー / pendingItem）   | 3～5秒の待ち時間は許容範囲。複雑さが増す。                                                                                               |
| 自動テスト                                        | サービスは小規模（約150行）、まず手動でエンドツーエンドテスト；単体テストは別PRで追加可能。                                                    |
| ローカライズされたプロンプト                      | システムプロンプトはモデル向け。英語が最も信頼性の高い基盤。モデルは会話から出力言語を選択する。                                               |
| `QWEN_CODE_ENABLE_AWAY_SUMMARY` 環境変数          | Claude Codeはテレメトリ無効時に機能を維持するために使用。Qwen Codeの現在のテレメトリモデルでは不要。                                            |
| `/resume` 完了時の自動要約                        | 自然なフォローアップだが、`useResumeCommand` にフックポイントが必要。このPRでは対象外。                                                      |