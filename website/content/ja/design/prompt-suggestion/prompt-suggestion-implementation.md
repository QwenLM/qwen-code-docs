# Prompt Suggestion 実装状況

> 全パッケージにおける prompt suggestion (NES) 機能の実装状況を追跡します。

## コアモジュール (`packages/core/src/followup/`)

| コンポーネント             | ステータス | 行数  | 説明                                                          |
| ------------------------ | ------- | ----- | ------------------------------------------------------------- |
| `followupState.ts`       | ✅ Done | ~230  | フレームワーク非依存のコントローラー（タイマー/デバウンス機能付き）             |
| `suggestionGenerator.ts` | ✅ Done | ~260  | LLM 生成 + 12 件のフィルタールール + forked query サポート       |
| `forkedQuery.ts`         | ✅ Done | ~240  | CacheSafeParams + createForkedChat + runForkedQuery           |
| `overlayFs.ts`           | ✅ Done | ~140  | Copy-on-write オーバーレイファイルシステム                              |
| `speculationToolGate.ts` | ✅ Done | ~150  | AST シェルパーサーによるツール境界の強制               |
| `speculation.ts`         | ✅ Done | ~540  | パイプライン化された suggestion + モデルオーバーライド機能付き speculation エンジン |

## CLI 統合 (`packages/cli/`)

| コンポーネント                    | ステータス | 説明                                                |
| ---------------------------- | ------- | ---------------------------------------------------------- |
| `AppContainer.tsx`           | ✅ Done | Suggestion 生成、speculation ライフサイクル、UI レンダリング |
| `InputPrompt.tsx`            | ✅ Done | Tab/Enter/右矢印キーによる確定、却下 + 中止          |
| `Composer.tsx`               | ✅ Done | Props の受け渡し                                            |
| `UIStateContext.tsx`         | ✅ Done | promptSuggestion + dismissPromptSuggestion                 |
| `useFollowupSuggestions.tsx` | ✅ Done | テレメトリ + キーストローク追跡機能付き React フック             |
| `settingsSchema.ts`          | ✅ Done | 3 つの feature flag + fastModel 設定                        |
| `settings.schema.json`       | ✅ Done | VSCode 設定スキーマ                                     |

## WebUI 統合 (`packages/webui/`)

| コンポーネント                   | ステータス | 説明                                 |
| --------------------------- | ------- | ------------------------------------------- |
| `InputForm.tsx`             | ✅ Done | Tab/Enter/右矢印キー + explicitText による送信 |
| `useFollowupSuggestions.ts` | ✅ Done | onOutcome サポート付き React フック           |
| `followup.ts`               | ✅ Done | サブパスエントリ                               |
| `components.css`            | ✅ Done | ゴーストテキストのスタイリング                          |
| `vite.config.followup.ts`   | ✅ Done | 分離されたビルド設定                       |

## テレメトリ (`packages/core/src/telemetry/`)

| コンポーネント               | ステータス | 説明          |
| ----------------------- | ------- | -------------------- |
| `PromptSuggestionEvent` | ✅ Done | 10 フィールド            |
| `SpeculationEvent`      | ✅ Done | 7 フィールド             |
| `logPromptSuggestion()` | ✅ Done | OpenTelemetry ロガー |
| `logSpeculation()`      | ✅ Done | OpenTelemetry ロガー |

## テストカバレッジ

| テストファイル                     | テスト数 | 説明                                                     |
| ----------------------------- | ----- | --------------------------------------------------------------- |
| `followupState.test.ts`       | 14    | コントローラーのタイマー、デバウンス、accept コールバック、onOutcome、クリア処理   |
| `suggestionGenerator.test.ts` | 16    | 全 12 件のフィルタールール + エッジケース + 誤検知              |
| `overlayFs.test.ts`           | 15    | COW 書き込み、読み込み解決、適用、クリーンアップ、パス走査      |
| `speculationToolGate.test.ts` | 27    | ツールカテゴリ、承認モード、シェル AST、パス書き換え         |
| `forkedQuery.test.ts`         | 6     | キャッシュパラメータの保存/取得/クリア、ディープクローン、バージョン検出      |
| `speculation.test.ts`         | 7     | ensureToolResultPairing のエッジケース                              |
| `smoke.test.ts`               | 21    | クロスモジュール E2E: フィルタ + オーバーレイ + toolGate + キャッシュ + ペアリング |
| `InputPrompt.test.tsx`        | 4     | Tab、Enter+送信、右矢印キー、補完ガード                |

## 監査履歴

| ラウンド           | 発見された問題 | 修正された問題                                             |
| --------------- | ------------ | -------------------------------------------------------- |
| R1-R4           | 10           | 10 (ルールエンジン → LLM、状態の簡素化)             |
| R5-R6           | 2            | 2 (Enter キーバインドの競合、右矢印キーのテレメトリ)     |
| R7-R8           | 3            | 3 (WebUI テレメトリ、未使用型、テストカバレッジ)            |
| R9              | 0            | — (収束)                                          |
| R10-R11         | 1            | 1 (historyManager 依存関係)                                   |
| R12-R13         | 1            | 1 (評価用正規表現の単語境界)                     |
| Phase 1+2 R1-R4 | 20+          | 20+ (権限バイパス、オーバーレイの安全性、競合状態) |
| **合計**       | **37+**      | **37+**                                                  |

## Claude Code との整合性

| 機能                          | 整合性 | 備考                                 |
| -------------------------------- | --------- | ------------------------------------- |
| Prompt text                      | 100%      | 同一（ブランド名のみ）           |
| 12 filter rules                  | 100%+     | `\b` 単語境界の改善        |
| UI interaction (Tab/Enter/Right) | 100%      |                                       |
| Guard conditions                 | 100%      | 13 件のチェック                             |
| Telemetry                        | 100%      | 10+7 フィールド                           |
| Cache sharing                    | ✅        | DashScope cache_control               |
| Speculation                      | ✅        | COW オーバーレイ + ツールゲーティング             |
| Pipelined suggestion             | ✅        | speculation 完了後に生成 |
| State management                 | 100%+     | コントローラーパターン、Object.freeze     |