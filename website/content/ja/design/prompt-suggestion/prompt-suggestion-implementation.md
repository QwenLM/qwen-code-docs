# プロンプトサジェスト機能の実装状況

> 全パッケージにおけるプロンプトサジェスト（NES）機能の実装状況を追跡します。

## コアモジュール (`packages/core/src/followup/`)

| コンポーネント            | ステータス | 行数   | 説明                                                        |
| ------------------------ | --------- | ----- | ----------------------------------------------------------- |
| `followupState.ts`       | ✅ 完了    | ~230  | フレームワーク非依存のコントローラ（タイマー/デバウンス）      |
| `suggestionGenerator.ts` | ✅ 完了    | ~260  | LLM生成 + 12のフィルタルール + forked query対応              |
| `forkedQuery.ts`         | ✅ 完了    | ~240  | CacheSafeParams + createForkedChat + runForkedQuery          |
| `overlayFs.ts`           | ✅ 完了    | ~140  | コピーオンライトオーバレイファイルシステム                    |
| `speculationToolGate.ts` | ✅ 完了    | ~150  | ASTシェルパーサーによるツール境界の強制                       |
| `speculation.ts`         | ✅ 完了    | ~540  | パイプラインサジェスト＋モデルオーバーライドによる投機的実行エンジン |

## CLI統合 (`packages/cli/`)

| コンポーネント                   | ステータス | 説明                                                 |
| ------------------------------- | --------- | ---------------------------------------------------- |
| `AppContainer.tsx`              | ✅ 完了    | サジェスト生成、投機的実行ライフサイクル、UIレンダリング |
| `InputPrompt.tsx`               | ✅ 完了    | Tab/Enter/Right Arrow受付、dismiss + abort            |
| `Composer.tsx`                  | ✅ 完了    | Propsのスレッド化                                     |
| `UIStateContext.tsx`            | ✅ 完了    | promptSuggestion + dismissPromptSuggestion            |
| `useFollowupSuggestions.tsx`    | ✅ 完了    | テレメトリ＋キーストローク追跡付きReactフック          |
| `settingsSchema.ts`             | ✅ 完了    | 3つのフィーチャーフラグ + fastModel設定               |
| `settings.schema.json`          | ✅ 完了    | VSCode設定スキーマ                                    |

## WebUI統合 (`packages/webui/`)

| コンポーネント                  | ステータス | 説明                                          |
| ------------------------------ | --------- | --------------------------------------------- |
| `InputForm.tsx`                 | ✅ 完了    | Tab/Enter/Right Arrow + explicitText送信      |
| `useFollowupSuggestions.ts`     | ✅ 完了    | onOutcome対応のReactフック                     |
| `followup.ts`                   | ✅ 完了    | サブパスエントリ                               |
| `components.css`                | ✅ 完了    | ゴーストテキストのスタイリング                  |
| `vite.config.followup.ts`       | ✅ 完了    | 個別ビルド設定                                 |

## テレメトリ (`packages/core/src/telemetry/`)

| コンポーネント              | ステータス | 説明                   |
| -------------------------- | --------- | ---------------------- |
| `PromptSuggestionEvent`    | ✅ 完了    | 10フィールド            |
| `SpeculationEvent`         | ✅ 完了    | 7フィールド             |
| `logPromptSuggestion()`    | ✅ 完了    | OpenTelemetryロガー     |
| `logSpeculation()`         | ✅ 完了    | OpenTelemetryロガー     |

## テストカバレッジ

| テストファイル                    | テスト数 | 説明                                                              |
| -------------------------------- | ------- | ----------------------------------------------------------------- |
| `followupState.test.ts`          | 14      | コントローラのタイマー、デバウンス、acceptコールバック、onOutcome、クリア |
| `suggestionGenerator.test.ts`    | 16      | 全12のフィルタルール＋エッジケース＋偽陽性                           |
| `overlayFs.test.ts`              | 15      | COW書き込み、読み取り解決、適用、クリーンアップ、パストラバーサル    |
| `speculationToolGate.test.ts`    | 27      | ツールカテゴリ、承認モード、シェルAST、パス書き換え                 |
| `forkedQuery.test.ts`            | 6       | キャッシュパラメータの保存/取得/クリア、ディープクローン、バージョン検出 |
| `speculation.test.ts`            | 7       | ensureToolResultPairingのエッジケース                               |
| `smoke.test.ts`                  | 21      | クロスモジュールE2E：フィルタ＋オーバレイ＋toolGate＋キャッシュ＋ペアリング |
| `InputPrompt.test.tsx`           | 4       | Tab、Enter+送信、Right Arrow、補完ガード                            |

## 監査履歴

| ラウンド        | 発見された問題 | 修正された問題                                         |
| --------------- | ------------- | ---------------------------------------------------- |
| R1-R4           | 10            | 10（ルールエンジン→LLM、状態の簡略化）                 |
| R5-R6           | 2             | 2（Enterキーバインドの競合、Right Arrowテレメトリ）    |
| R7-R8           | 3             | 3（WebUIテレメトリ、デッド型、テストカバレッジ）        |
| R9              | 0             | —（収束）                                             |
| R10-R11         | 1             | 1（historyManager依存）                               |
| R12-R13         | 1             | 1（評価用正規表現の単語境界）                           |
| Phase 1+2 R1-R4 | 20+           | 20+（権限バイパス、オーバレイ安全性、競合状態）         |
| **合計**        | **37+**       | **37+**                                               |

## Claude Codeとの整合性

| 機能                              | 整合性    | 備考                                     |
| -------------------------------- | --------- | ---------------------------------------- |
| プロンプトテキスト                  | 100%      | 同一（ブランド名のみ異なる）               |
| 12のフィルタルール                 | 100%+     | \b単語境界の改善                          |
| UI操作（Tab/Enter/Right）         | 100%      |                                          |
| ガード条件                         | 100%      | 13のチェック                              |
| テレメトリ                         | 100%      | 10+7フィールド                           |
| キャッシュ共有                     | ✅        | DashScope cache_control                  |
| 投機的実行（Speculation）          | ✅        | COWオーバレイ＋ツールゲーティング          |
| パイプラインサジェスト             | ✅        | 投機的実行完了後に生成                     |
| 状態管理                           | 100%+     | コントローラパターン、Object.freeze       |