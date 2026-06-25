# セッションリキャップ設計

> ユーザーがアイドル状態のセッションに戻ったとき、「どこまでやったか」を
> 簡潔（1〜2文）に要約して表示します。オンデマンド（`/recap`）か、
> ターミナルが 5 分以上非アクティブになった後のフォーカス復帰時に動作します。

## 概要

ユーザーが数日後に古いセッションを `/resume` で再開するとき、
**何をしていたか・次に何をすべきか**を思い出すために大量の履歴をスクロールするのは
大きな摩擦ポイントです。メッセージを再読み込みするだけではこの UX 問題は解決しません。

ユーザーが戻ってきたときに、簡潔な 1〜2 文のリキャップをプロアクティブに表示することが目標です:

- **高レベルのタスク**（何をしているか）→ **次のステップ**（次に何をするか）
- 実際のアシスタントの返答と視覚的に区別され、新しいモデル出力と混同されない
- **ベストエフォート**: 失敗はサイレントで、メインフローを決して妨げない

## トリガー

| トリガー         | 条件                                                                                   | 実装                                                                                                                                     |
| --------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **手動**      | ユーザーが `/recap` を実行                                                           | `recapCommand.ts` が同じ基底サービスを呼び出す                                                                                                |
| **自動**        | ターミナルが非アクティブ（DECSET 1004 フォーカスプロトコル）5 分以上 + フォーカス復帰 + ストリームが `Idle` | `useAwaySummary.ts` — 5 分の非アクティブタイマー + `useFocus` イベントリスナー                                                                  |
| **Daemon HTTP** | リモートクライアントが `POST /session/:id/recap` を呼び出す                                                | `server.ts` ルート → `bridge.generateSessionRecap`（ext-method ラウンドトリップ）→ `acpAgent.ts` が `generateSessionRecap(session.getConfig(), signal)` を呼び出す |

3 つのパスはすべて `core/services/sessionRecap.ts` の同一の `generateSessionRecap()` 関数に集約され、動作の一貫性を保証します。
自動トリガーは `general.showSessionRecap`（デフォルト: オフ — 明示的なオプトインが必要で、アンビエントな LLM 呼び出しがユーザーの請求に黙って追加されることはない）でゲートされます。手動コマンドと Daemon HTTP ルートはこの設定を無視します（呼び出し元が明示的にリクエストしているため）。

### Daemon アクセスパス

Daemon ルートは非厳格ゲート（`/session/:id/prompt` と同じ方針 — リキャップはトークンを消費するが状態を変更しない）。ケイパビリティタグ `session_recap` が `/capabilities.features` でルートをアドバタイズします。SDK ヘルパー: `DaemonClient.recapSession(sessionId, opts)` および `DaemonSessionClient.recap(opts)`。ワイヤーコントラクトとエラーエンベロープは `docs/developers/qwen-serve-protocol.md` § `POST /session/:id/recap` を参照してください。

キャンセルは **v1 では未実装**です。ルートは HTTP クライアントの切断を監視せず、`AbortSignal` は `bridge.generateSessionRecap` に渡されず、ACP チャイルドハンドラーはキャンセルされない `AbortController().signal` をコアヘルパーに渡します（クロスプロセスのアボートプランビングはまだありません）。唯一の上限はブリッジの 60 秒 `SESSION_RECAP_TIMEOUT_MS` バックストップと、ACP チャネル終了に対するトランスポートクローズのレースです。HTTP 側に AbortController を単独で組み込んでも見た目だけ — チャイルド側の LLM 呼び出しは完了まで実行されるため、クロスプロセスのアボートなしに e2e キャンセルは実現できません。リキャップは短い（シングルアテンプトのサイドクエリ、`maxOutputTokens: 300`、通常 1〜5 秒）ため、v1 ではこれで十分です。将来的にリクエスト ID ベースのキャンセル ext-method で完全なエンドツーエンドキャンセルを実装することは、帯域コストが正当化される場合に検討できます。

## アーキテクチャ

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

| ファイル                                                         | 責務                                                                   |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `packages/core/src/services/sessionRecap.ts`                 | ワンショット LLM 呼び出し + 履歴フィルタリング + タグ抽出                              |
| `packages/cli/src/ui/hooks/useAwaySummary.ts`                | 自動トリガー React フック                                                          |
| `packages/cli/src/ui/commands/recapCommand.ts`               | `/recap` 手動エントリポイント                                                      |
| `packages/cli/src/ui/components/messages/StatusMessages.tsx` | `AwayRecapMessage` レンダラー（`※` + ボールド `recap:` + イタリック内容、全体ディム） |
| `packages/cli/src/ui/types.ts`                               | `HistoryItemAwayRecap` 型                                                        |
| `packages/cli/src/ui/components/HistoryItemDisplay.tsx`      | `away_recap` 履歴アイテムをレンダラーへディスパッチ                                  |
| `packages/cli/src/config/settingsSchema.ts`                  | `general.showSessionRecap` + `general.sessionRecapAwayThresholdMinutes` 設定      |

## プロンプト設計

### システムプロンプト

`generationConfig.systemInstruction` がこの単一の呼び出しに対してメインエージェントのシステムプロンプトを置き換えるため、モデルはリキャップジェネレーターとしてのみ動作し、コーディングアシスタントとしては動作しません。

`GeminiClient.generateContent()` は内部でプロンプトを `getCustomSystemPrompt()` に通し、ユーザーのメモリ（QWEN.md / 管理された自動メモリ）をサフィックスとして追加します。最終的なシステムプロンプトは `リキャッププロンプト + ユーザーメモリ` — リキャップに有用なプロジェクトコンテキストであり、漏洩ではありません。

以下の箇条書きは `RECAP_SYSTEM_PROMPT` と 1:1 対応しています:

- 40 語以内、プレーンテキスト 1〜2 文（markdown / リスト / 見出し不可）。中国語の場合は合計約 80 文字を目安とする。
- 最初の文: 高レベルのタスク。次に: 具体的な次のステップ。
- 明示的に禁止: 実施内容のリストアップ、ツール呼び出しの列挙、ステータスレポート。
- 会話の主要言語（英語または中国語）に合わせる。
- 出力を `<recap>...</recap>` で囲む。タグ外には何も出力しない。

### 構造化出力と抽出

モデルは回答を `<recap>...</recap>` で囲むよう指示されます:

```
<recap>Refactoring loopDetectionService.ts to address long-session OOM. Next step is to implement option B.</recap>
```

理由: 一部のモデル（GLM ファミリー、推論モデル）は最終回答の前に「思考」段落を書きます。生テキストを返すと、その推論が UI に漏洩してしまいます。

`extractRecap()` には 3 段階のフォールバックがあります:

1. 両タグが存在する場合: `<recap>...</recap>` の間の内容を取得（推奨）。
2. 開きタグのみの場合（例: `maxOutputTokens` で閉じタグが切り捨てられた場合）: 開きタグ以降のすべてを取得。
3. タグが完全に欠落している場合: 空文字列を返す → サービスが `null` を返す → UI は何もレンダリングしない。

3 番目の段階は「間違ったものを表示するくらいならスキップ」— モデルの推論プリアンブルを表示することは、リキャップをまったく表示しないよりも悪いためです。

### 呼び出しパラメーター

| パラメーター         | 値                             | 理由                                                |
| ------------------- | ------------------------------ | ----------------------------------------------------- |
| `model`             | `getFastModel() ?? getModel()` | リキャップにフロンティアモデルは不要                   |
| `tools`             | `[]`                           | ワンショットクエリ、ツール使用なし                      |
| `maxOutputTokens`   | `300`                          | 1〜2 短文 + タグのための余裕                          |
| `temperature`       | `0.3`                          | ほぼ決定論的で、自然なバリエーションを少し含む          |
| `systemInstruction` | 上記のリキャップ専用プロンプト    | メインエージェントのロール定義を置き換える              |

## 履歴フィルタリング

`geminiClient.getChat().getHistory()` は以下を含む `Content[]` を返します:

- `user` / `model` テキストメッセージ
- `model` の `functionCall` パーツ
- `user` の `functionResponse` パーツ（完全なファイル内容を含む場合がある）
- `model` の思考パーツ（`part.thought` / `part.thoughtSignature`、モデルの内部推論）

`filterToDialog()` は**テキストが空でなく、思考でない** `user` / `model` パーツのみを保持します。理由は 2 つあります:

- **ツール呼び出し / レスポンス**: 単一の `functionResponse` が 10K+ トークンになる場合があります。30 件のメッセージがあると、リキャップ LLM を無関係な詳細で溺れさせ、トークンを浪費するだけでなく、「X ツールを呼び出して Y ファイルを読んだ」といった実装ノイズにリキャップがバイアスされます。
- **思考パーツ**: モデルの内部推論を含みます。これを含めると、隠れたチェーン・オブ・ソートをダイアログとして扱い、リキャップテキストに露出するリスクがあります。

空のメッセージを除外した後、`takeRecentDialog` で最後の 30 メッセージにスライスし、ぶら下がった model/tool レスポンスでスライスが始まらないようにします。

## 並行性とエッジケース

### 自動トリガーフックのステートマシン

`useAwaySummary` は 3 つの ref を保持します:

| Ref               | 意味                                           |
| ----------------- | ------------------------------------------------- |
| `blurredAtRef`    | 非アクティブ開始時刻（フォーカスが戻るまでクリアされない） |
| `recapPendingRef` | LLM 呼び出しが実行中かどうか                  |
| `inFlightRef`     | 現在実行中の `AbortController`                |

`useEffect` の依存関係: `[enabled, config, isFocused, isIdle, addItem, thresholdMs]`。

| イベント                                                            | アクション                                                                                                                                 |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `!enabled \|\| !config`                                          | 実行中の呼び出しをアボート + `inFlightRef` をクリア + `blurredAtRef` をクリア                                                                      |
| `!isFocused` かつ `blurredAtRef === null`                         | `blurredAtRef = Date.now()` をセット                                                                                                        |
| `isFocused` かつ `blurredAtRef === null`                          | 早期リターン（処理する非アクティブサイクルなし — 初回レンダリングまたは短い非アクティブリセット直後）                                                |
| `isFocused` かつ非アクティブ時間 < 5 分                            | `blurredAtRef` をクリアし、次の非アクティブサイクルを待機                                                                                         |
| `isFocused` かつ非アクティブ ≥ 5 分 かつ `recapPendingRef`               | リターン（重複排除）                                                                                                                        |
| `isFocused` かつ非アクティブ ≥ 5 分 かつ `!isIdle`                       | `blurredAtRef` を**保持**してターンの完了を待機（`isIdle` が deps にあるため、ストリーミング完了時にエフェクトが再発火する） |
| `isFocused` かつ非アクティブ ≥ 5 分 かつ `shouldFireRecap` が false を返す | `blurredAtRef` をクリアしてリターン — 前回のリキャップ以降、会話が十分に進んでいない（ユーザーターン 2 回以上が必要、Claude Code と同様） |
| `isFocused` かつすべての条件を満たす                               | `blurredAtRef` をクリア、`recapPendingRef = true` をセット、`AbortController` を作成、LLM リクエストを送信                                     |

`.then` コールバックは `isIdleRef.current` を**再チェック**します: LLM 実行中にユーザーが新しいターンを開始した場合、遅れて届いたリキャップはターン途中への挿入を避けるためにドロップされます。

`.finally` は `recapPendingRef` をクリアし、`inFlightRef.current === controller` の場合のみ `inFlightRef` をクリアします（新しいコントローラーを上書きしないため）。

2 番目の `useEffect` がアンマウント時に実行中のコントローラーをアボートします。

### `/recap` のゲート制御

`CommandContext.ui.isIdleRef` が現在のストリーム状態を公開します（既存の `btwAbortControllerRef` パターンを踏襲）。インタラクティブモードでは、`recapCommand` は `!isIdleRef.current` **または** `pendingItem !== null` のときに拒否します。`pendingItem` だけでは不十分です。通常のモデル返答は `streamingState === Responding` で `pendingItem` が null のまま実行されるためです。

## 設定とモデル選択

### ユーザー向け設定

| 設定                                    | デフォルト | 備考                                                                               |
| ------------------------------------------ | ------- | ----------------------------------------------------------------------------------- |
| `general.showSessionRecap`                 | `false` | 自動トリガーのみ。手動 `/recap` はこれを無視する。                                    |
| `general.sessionRecapAwayThresholdMinutes` | `5`     | 自動リキャップが発火するまでの非アクティブ時間（分）。Claude Code のデフォルトと同じ。 |
| `fastModel`                                | 未設定   | 高速・低コストのリキャップに推奨（例: `qwen3-coder-flash`）。                          |

### モデルフォールバック

`config.getFastModel() ?? config.getModel()`:

- ユーザーが `fastModel` を設定していて、現在の認証タイプで有効な場合 → `fastModel` を使用。
- それ以外の場合 → メインセッションモデルにフォールバック（動作するが、コストと速度の面で不利）。

## オブザーバビリティ

`createDebugLogger('SESSION_RECAP')` が以下を出力します:

- リキャップパスからキャッチされた例外（`debugLogger.warn`）

すべての失敗は**ユーザーに対して完全に透明** — リキャップは補助機能であり、UI に例外をスローしません。開発者はデバッグログファイルで `[SESSION_RECAP]` タグを grep できます: デフォルトで `~/.qwen/debug/<sessionId>.txt` に書き込まれます（`latest.txt` は現在のセッションへのシンボリックリンク）。`QWEN_DEBUG_LOG_FILE=0` で無効化できます。

## スコープ外

| 項目                                             | 理由                                                                                                                                  |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `/recap` の進行状況 UI（スピナー / pendingItem） | 3〜5 秒の待機は許容範囲内で、複雑さを増すだけ。                                                                                           |
| 自動テスト                                  | サービスは小さく（約 150 行）、最初は手動でエンドツーエンドテスト済み。ユニットテストは別 PR で追加できる。                                   |
| ローカライズされたプロンプト                | システムプロンプトはモデル向けであり、英語が最も信頼性の高い基盤。モデルは会話から出力言語を選択する。 |
| `QWEN_CODE_ENABLE_AWAY_SUMMARY` 環境変数          | Claude Code はテレメトリ無効時にこの機能を維持するために使用しているが、Qwen Code の現在のテレメトリモデルではこれは不要。            |
| `/resume` 完了時の自動リキャップ               | 自然な後続機能だが `useResumeCommand` にフックポイントが必要であり、この PR のスコープ外。                                              |
