# 推論努力度の統一 (/effort)

> **実装ステータス。** 実装済み: 5 段階のラダー + `core/reasoning-effort.ts`
> (ランクのクランプ/正規化)、グローバルな `model.reasoningEffort` 設定 + ランタイムの
> `Config.setReasoningEffort`/`getReasoningEffort` (`handleModelChange` での
> モデル切り替え時に再適用)、`/effort` コマンド、GLM の逐語的フラット化アダプタ
> (`provider/zai.ts`)、Gemini の `medium`/`xhigh` マッピング、
> **モデルごとの Anthropic ゲーティング** (`anthropicSupportedEffortTiers` + クランプ: Opus
> 4.7/4.8 および 5.x ファミリーは `xhigh`/`max` をそのまま通過、Opus 4.6/Sonnet 4.6 は
> `max` のみ、Opus 4.5 およびバージョンなし ID は `high` にクランプ)、および
> `model-with-reasoning` ステータスライン (`/effort` でライブ更新)、
> DashScope の tier→bool マッピング (設定された effort は qwen
> ハイブリッドモデルの `enable_thinking` をオンにする。qwen が実際の
> `reasoning_effort` フィールドを出荷する際に拡張する単一のカラム)、およびインタラクティブな
> `EffortDialog` — 引数なしの `/effort` はインタラクティブモードでティアピッカーを開き
> (非インタラクティブモードではティアをリスト表示)、
> `use-effort-command`、UI コンテキスト、`DialogManager`、および
> `useDialogClose` を介して配線されています。遅延しているものはありません。

## 問題

推論対応プロバイダーはそれぞれ、「モデルにどの程度考えさせるか」のための異なる設定項目を公開しています: OpenAI/DeepSeek/GLM はフラットな `reasoning_effort` 文字列を使用し、
Anthropic は `output_config.effort` (およびレガシーな `thinking.budget_tokens`) を使用し、
Gemini 3 は `thinking_level` (Gemini 2.5 は `thinkingConfig.thinkingBudget` を使用) を使用し、
Qwen/DashScope はブール値の `enable_thinking` のみを持っています。

コアはすでに統一された `reasoning: { effort }` 設定構造を持っており、各プロバイダーアダプタはすでにそれを翻訳しています (Current State を参照) が、ランタイムで努力レベルを選択するユーザー向けの方法がありません。レベルは、モデルごとの生成設定を手動で編集することによってのみ設定できます。私たちは、小さなティアのセットを提供し、アクティブなプロバイダーがサポートするものにそれらをマッピングし、選択を永続化する、単一の `/effort` コマンドを求めています。

統一レイヤーは、新しいプロバイダーの追加を自明なものにする必要があります。現在オン/オフスイッチしか持たないモデル (例: qwen3) が実際の努力ティアを獲得した場合、唯一の変更はマッピング/ケイパビリティテーブルの 1 行だけでなければなりません。

## 目標

- ユーザーに公開される単一の統一された努力ラダー: **`low | medium | high | xhigh | max`** (5 ティア)。
- `/effort` スラッシュコマンド: `/effort <tier>` で直接設定。引数なしの `/effort` でピッカーダイアログを開く。
- すべてのモデルに適用され、セッションをまたいで永続化される**単一のグローバル**設定。
- プロバイダーごとの翻訳 + **クランプ**レイヤー: サポートされていないティアは、アクティブなモデルでサポートされている最も近いティアにフォールバックし、1 回限りの警告を表示します (既存の Anthropic クランプ UX を再利用)。
- 既存の `model-with-reasoning` ステータスラインプリセットによるライブ表示。
- プロバイダーの追加/調整 = 1 つのケイパビリティ/マッピングテーブルの編集のみ。新しい配線は不要。

## 非目標

- `off` ティアはなし。推論を完全に無効にするのは、既存の `reasoning: false` 概念のまま分離されます。`/effort` はアクティブなティア間を移動するだけです。
- モデルごとの永続化された努力レベルはなし (決定: グローバルな単一設定)。
- 生の `budget_tokens` UI はなし。バジェット形式のプロバイダー (Gemini 2.5、レガシー Anthropic) は、ティア→バケットマッピングによって駆動され、数値では公開されません。
- マッピングのギャップとクランプを埋めること以外、既存のプロバイダーごとのリクエスト配線に変更はありません。
- デスクトップ統合はなし (デスクトップには独自の `thinkingLevel` 配線があるため、対象外)。

## 現状

統一された設定型 — [`packages/core/src/core/contentGenerator.ts:104-118`]:

```ts
reasoning?: false | { effort?: 'low' | 'medium' | 'high' | 'max'; budget_tokens?: number }
```

既存のプロバイダーごとのトランスレーター:

| プロバイダー             | ファイル                                                                                   | 動作                                                                                        |
| -------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| DeepSeek             | `provider/deepseek.ts:176-218`                                                         | ネストされたもの → フラットな `reasoning_effort`; `low/medium→high`, `xhigh→max`                                |
| Anthropic            | `anthropicContentGenerator.ts:521-593`, clamp `665-693`, beta hdr `393-431`            | `output_config.effort` + thinking; `max`→`high` クランプ + 1 回限りの警告; `effort-2025-11-24` beta |
| Gemini               | `geminiContentGenerator.ts:107-146`                                                    | `thinkingConfig`/`thinkingLevel`; `low→LOW`, `high/max→HIGH`                                    |
| OpenAI/GLM/DashScope | `openaiContentGenerator/pipeline.ts:689-717` (`buildReasoningConfig`), strip `597-602` | `reasoning_effort` の転送/削除; DashScope は `preserve_thinking` を追加                          |

ギャップ: 共用体には `xhigh` が欠けています。Gemini には `medium` と `xhigh→high` ルールが欠けています。汎用パイプラインがプレーンな OpenAI/GLM に対して `reasoning_effort` を出力し、`max→xhigh` にクランプすることを確認する必要があります。DashScope には tier→bool マッピングがありません。

## 先行事例: openclaw

`openclaw/openclaw` は、私たちが借用しているより成熟した形状で同じ問題を解決しています (`~/Documents/openclaw` で調査):

- **単一の正規化されたラダー + 数値ランク** (`src/auto-reply/thinking.shared.ts`):
  `ThinkLevel = off|minimal|low|medium|high|xhigh|adaptive|max` と
  `THINKING_LEVEL_RANKS` (off:0 … high:40, xhigh:60, max:70; adaptive≡30)。
- **ランクベースのクランプ** (`src/llm/model-utils.ts:59` `clampThinkingLevel`): モデルがそのレベルをサポートしている場合はそれを使用します。xhigh/max に対する明示的な `null` オプトアウトはハードキャップです (最初にダウンウォークします)。それ以外の場合は、次に強いサポートされているレベルを優先し、そうでなければダウンウォークします。モデルのキャップを超えてサイレントにコストを上昇させることはありません。
- **プロバイダーごとではなくモデルごとのケイパビリティ**: カタログは
  `compat.supportedReasoningEfforts` とモデルごとの `thinkingLevelMap`
  (値または `null`) を保持します。
- **3 つの形状マッパー**、API ファミリーごとに 1 つ:
  - OpenAI 互換 — `mapThinkingLevelToReasoningEffort()`: `off→none`,
    `adaptive→medium`, `max→xhigh`, それ以外はパススルー → `none|minimal|low|medium|high|xhigh`。
  - Anthropic — `mapThinkingLevelToEffort(model, level)`: クランプ後、アダプティブシンキングモデルには `output_config.effort` を出力し、古いモデルには `thinkingBudgetTokens` に変換します (`adjustMaxTokensForThinking` 付き)。
  - Gemini — `resolveGoogleGemini3ThinkingLevel()`: Gemini 3 Pro → LOW/HIGH,
    Flash → MINIMAL/LOW/MEDIUM/HIGH; Gemini 2.5 はバジェットをレベルにマッピングします
    (`≤0→MINIMAL, ≤2048→LOW, ≤8192→MEDIUM, それ以外 HIGH`; `gemini-2.5-pro` はバジェット 0 を拒否します — シンキングが必須)。
  - DeepSeek V4 ラッパー: `off`→削除; `xhigh|max→max`, それ以外は `high`。
- **プロバイダーシンキングプロファイル** (`src/plugins/provider-thinking.types.ts`):
  `levels`/`defaultLevel` を宣言します。バイナリプロバイダーは `low` を保存しますが `on` と表示します。
- **推論サニタイザー** (`extensions/opencode-go/reasoning-sanitizer.ts`):
  それらを拒否するプロバイダーに履歴をリプレイする際に、`reasoning_content`/`reasoning_effort` およびシンキング部分を削除します。

採用するもの: **ランクベースの中央クランプ**、**モデルごとのケイパビリティ宣言**、**3 つの形状マッパー**、および**正確な Gemini 2.5 バジェットバケット**。v1 で不採用とするもの: `minimal`/`adaptive` ユーザーティア (決定 = 5 ティア) — これらは有効な_内部_正規化ターゲットのままなので、モデルカタログは引き続きそれらを宣言できます。

## 設計

### 努力ラダーとケイパビリティテーブル

正規化された順序付きラダー: `low < medium < high < xhigh < max`。

各プロバイダーはサポートされているサブセットを宣言し、トランスレーターは要求されたティアをラダーの**下**方向に、最も近いサポートされているティアにクランプします。マッピング (正規値 → ワイヤー値)。`↓` はクランプを示します:

| ティア   | OpenAI `reasoning_effort` | DeepSeek `reasoning_effort` | GLM-5.2+ `reasoning_effort` | Anthropic `output_config.effort` | Gemini 3 `thinking_level` | Qwen DashScope       |
| ------ | ------------------------- | --------------------------- | --------------------------- | -------------------------------- | ------------------------- | -------------------- |
| low    | low                       | high¹                       | low                         | low                              | low                       | enable_thinking:true |
| medium | medium                    | high¹                       | medium                      | medium                           | medium                    | true                 |
| high   | high                      | high                        | high                        | high (デフォルト)                   | high                      | true                 |
| xhigh  | xhigh                     | max¹                        | xhigh                       | xhigh ↓high²                     | high ↓²                   | true                 |
| max    | xhigh ↓ (`max` なし)        | max                         | max                         | max ↓high²                       | high ↓²                   | true                 |

¹ DeepSeek/GLM の文書化された内部グループ化 (low/medium ≡ high, xhigh ≡ max)。
² モデルの文書化された上限にクランプされます (Anthropic モデルによって異なります。Gemini 3 は `high` でキャップ)。Gemini 2.5 モデルは、ティアを `thinking_level` の代わりに `thinkingConfig.thinkingBudget` バケットにマッピングします。

クランプは**中央集権的かつランクベース**です (openclaw の `clampThinkingLevel` から借用): 各ティアにランクを割り当て
(`low:20, medium:30, high:40, xhigh:60, max:70`)、プロバイダー/モデルはサポートされているセット (および `xhigh`/`max` に対するオプションの `null` ハードキャップ) を宣言します。クランプは最も近いサポートされているティアを選択します。ハードキャップされたリクエストはダウンウォークし、それ以外の場合は要求以下または等しい次のサポートされているティアを優先します。これは、アドホックなアダプタごとのクランプ (例: Anthropic の現在の `max→high`) を置き換えます。

ケイパビリティは**プロバイダーごとではなくモデルごと**に宣言されます (openclaw の教訓): モデルのカタログエントリ/プロバイダープリセットは `supportedReasoningEfforts?: EffortTier[]` (およびオプションのモデルごとのオーバーライドマップ) を保持します。未設定時のデフォルト = プロバイダーのフルサポートセット。新しいプロバイダー/モデルは 1 行のテーブル追加です。クランプと 3 つの形状マッパーは変更されません。

3 つの形状マッパーがワイヤー変換を所有し (API ファミリーごとに 1 つ)、すでにクランプされたティアが投入されます:

- `toReasoningEffort(tier)` — OpenAI/DeepSeek/GLM/DashScope のフラットな `reasoning_effort` (DashScope の場合は代わりに `enable_thinking` ブール値)。
- `toAnthropicThinking(tier, model)` — アダプティブモデルの場合は `output_config.effort`、それ以外の場合は `thinking.budget_tokens`。
- `toGeminiThinking(tier, model)` — `thinking_level` (Gemini 3) または `thinkingConfig.thinkingBudget` バケット (Gemini 2.5、しきい値は openclaw に準拠)。

### サンプリングパラメータのクリーンアップ

DeepSeek と GLM は、シンキングモードで `temperature`/`top_p`/`presence_penalty`/`frequency_penalty` を拒否します。トランスレーターがこれらのプロバイダーでシンキングを有効にする場合、リクエストボディからそれらのサンプリングパラメータを削除する必要があります。

### OpenAI 互換フィールド形状の相違

「OpenAI 互換」は単一の effort フィールドを意味するものではありません。正規化された設定はネストされた `reasoning: { effort }` オブジェクトです。`buildReasoningConfig()` (`pipeline.ts:689-717`) はそれを**逐語的に、値のマッピングなしで**パススルーします。ワイヤーフィールドが異なる各プロバイダーは、その `buildRequest` フックで形状を変更する必要があります。既知の形状:

| ワイヤー形状                           | プロバイダー                                             | qwen-code の処理                                                                                       |
| ------------------------------------ | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| ネストされた `reasoning: { effort }`       | OpenAI Responses, OpenRouter, gpt-5.x                 | パススルー (デフォルト) ✅                                                                                 |
| フラットなトップレベル `reasoning_effort`    | DeepSeek, **GLM/z.ai**, OpenAI Chat Completions, Groq | DeepSeek アダプタはフラット化 ✅。**GLM にはアダプタがない → 現在ネストされた形状を出荷しているため、おそらく誤り ❌** |
| `enable_thinking` ブール値               | qwen3 / DashScope                                     | アダプタはブール値を出力 (無効化のみ)。まだ努力ティアはなし                                                   |
| `extra_body.thinking.enabled` トグル | GLM                                                   | 努力値とは別のオン/オフノブ                                                               |
影響: 純粋なパススルーが「そのまま動作」するのは、ネストされた形状を受け入れるプロバイダーに対してのみです。**PR1では GLM/z.ai のフラット化を追加する必要があります**（`deepseek.ts` をミラーリング）。また、Qwen が effort フィールドを追加した際には、DashScope アダプターを拡張して、Qwen の API でドキュメント化されている形状（おそらくフラットな `reasoning_effort`）を出力するようにします。新しいプロバイダーは、ネストされた正規の形状を受け入れる場合にのみ自動サポートされます。それ以外の場合は、1つのフックでの形状変換（reshape）が必要です。

### 設定フローと永続化

- 新しいグローバル設定 **`model.reasoningEffort`**: `'low' | 'medium' | 'high' | 'xhigh' | 'max'` を `settingsSchema.ts`（`generationConfig` ノード付近、`1412-1504`）に追加します。
- コンテンツジェネレーターのビルド時に、設定レイヤーが `model.reasoningEffort` を `generationConfig.reasoning.effort` にマッピングします（既存のトランスレーターへの単一の信頼できる情報源）。1つのグローバル値で、すべてのモデルに適用されます。
- ランタイム変更: メモリ内の `generationConfig.reasoning.effort` を更新してアクティブな ContentGenerator をリフレッシュし、その後 `persistSetting('model.reasoningEffort', tier)` を実行する `config.setReasoningEffort(tier)`（`switchModel` と並列、`config.ts:~2047`）を追加します。

### CLI インターフェース

- 新しい `effortCommand.ts`（`modelCommand.ts:39-79` をモデル化）:
  - `/effort` → `{ type: 'dialog', dialog: 'effort' }`
  - `/effort high` → tier を検証し、`config.setReasoningEffort` を呼び出し、永続化して、ack メッセージを返します。
  - `completion()` は 5 つの tier を提供します。
- 新しい `EffortDialog` Ink コンポーネントと、`commands/types.ts:168-198` での `'effort'` ダイアログタイプの登録。このダイアログは 5 つの tier を一覧表示し、現在のモデルに対してどの tier がクランプ（制限）されるかを注釈で示します（例: 「このモデルでは max → high」）。
- ステータスライン: 既存の `model-with-reasoning` プリセット（`statusLinePresets.ts:13,46-51`）が現在の effort を読み取ります。新しいプリセットは不要です。

### 型の変更

`contentGenerator.ts:104-118` の effort ユニオン型を拡張して `'xhigh'` を追加します。`reasoning: false` による無効化パスは変更されません。

## フェーズ（小さな PR、それぞれが issue にリンク）

1. **core: ladder + mappings + clamps.** ユニオン型に `xhigh` を拡張。ランクベースの中央クランプとモデルごとの `supportedReasoningEfforts` を追加。3つの形状マッパーをファクタリング。Gemini の `medium`/`xhigh↓` と 2.5 のバジェットバケットを埋め、OpenAI/GLM の `reasoning_effort` 出力と `max↓xhigh` を確認。DashScope の tier→bool を追加。サンプリングパラメータの削除。既存の reasoning-strip パス（`pipeline.ts:597-602`）が openclaw のサニタイザーのような履歴リプレイをカバーしていることを検証。プロバイダーごとのトランスレーターとクランプ境界のユニットテスト。UI はなし。
2. **cli: setting + direct command.** `model.reasoningEffort` スキーマ、設定マッピングと `setReasoningEffort` ランタイムリフレッシュ、`/effort <tier>`、ステータスラインのリアルタイム読み取り。テスト。
3. **cli: picker dialog.** `EffortDialog` と引数なしの `/effort`、モデルごとのクランプヒント。
4. **docs.** `docs/users/` の effort ページ。reasoning/token-caching ドキュメントへの相互リンク。

## テストカバレッジ

最も価値の高いチェック: 各プロバイダーのトランスレーターが、クランプ境界（OpenAI での `max`→`xhigh`、Gemini-3 / 上限が設定された Anthropic モデルでの `xhigh`/`max`→`high`）を含むすべての tier に対して正しいワイヤーフィールドを出力すること。DeepSeek/GLM で thinking が有効な場合にサンプリングパラメータが削除されること。`model.reasoningEffort` が設定を通じて往復し、`generationConfig.reasoning.effort` に反映されること。`setReasoningEffort` が ContentGenerator を再構築すること。ワンタイムのクランプ警告がモデルと tier の組み合わせごとに 1 回だけ発生すること。