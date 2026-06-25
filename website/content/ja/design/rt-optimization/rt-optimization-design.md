# Qwen Code Agent Loop RT 最適化技術設計書

## 1. 背景と問題定義

### 1.1 現状

Qwen Code の Agent Loop は厳密な直列モデルで動作している：

```
User Prompt → [LLM 決定] → Tool Execution → [LLM 決定] → Tool Execution → ... → [LLM 返答] → Idle
               ~3-4s          ~Xms-Ns          ~3-4s          ~Xms-Ns            ~3-4s
```

1 回の LLM 呼び出し（ネットワーク RTT＋モデル推論を含む）は約 3〜4 秒であり、エンドツーエンド RT のほとんどを占める。

### 1.2 実測データ

テストシナリオ：「私のワークスペース一覧を教えて」（agent loop 3 ラウンド、ツール呼び出し 2 回、シングルサンプル）

| フェーズ                              | 所要時間  | 割合 |
| ------------------------------------- | --------- | ---- |
| LLM Round 1（skill 呼び出しを決定）  | 3.8s      | 28%  |
| Skill 実行                            | 1ms       | <1%  |
| LLM Round 2（shell 呼び出しを決定）  | 3.0s      | 22%  |
| Shell 実行                            | 2.5s      | 19%  |
| LLM Round 3（テキスト要約）          | 3.8s      | 28%  |
| フレームワークオーバーヘッド（状態同期・レンダリング） | 0.3s | 3% |
| **合計**                              | **13.4s** | 100% |

**結論**：LLM 呼び出しが 78%、ツール実行が 19%、フレームワークが 3%。最適化の核心は **LLM 呼び出し回数の削減** と **単回 LLM 呼び出しレイテンシの低減** にある。

> 注：シングルサンプル・単一シナリオのデータ。19% のツール実行は shell の低速呼び出しが支配的であり、読み取り主体のシナリオではツール実行は <5% まで低下する可能性がある。方式導入前に ≥3 種のシナリオ（書き込み操作、複数ツールをまたぐ推論、エラー回復）のベースラインを取得する必要がある。

### 1.3 現アーキテクチャの主要制約

| 制約                    | コード位置                                                                                  | 説明                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| ツール結果に後置制御なし | `tools.ts` `ToolResult` インターフェース (L422)                                             | `llmContent`/`returnDisplay`/`error` のみで「LLM をスキップ」を表現できない       |
| 結果は無条件 LLM に返送  | `useGeminiStream.ts` `handleCompletedTools` (L2038) → `submitQuery(ToolResult, …)` (L2355) | gemini が起動したすべてのツール結果が返送される                                  |
| stream 完了後にスケジュール | `useGeminiStream.ts` `processGeminiStreamEvents` (L1365)                                 | stream ループ終了後に `scheduleToolCalls`、インクリメンタルスケジューリングなし  |
| モデル選択に戦略レイヤなし | `client.ts` `modelOverride ?? getModel()` (L1305, L1598)                                  | インフラは `turn.run(model, …)` (L1707) まで貫通しているが、呼び出し側は skill が明示した場合のみ使用 |

### 1.4 既存インフラ（本設計で多用）

| 機能                                          | 位置                                                   | 状態                                                                   |
| --------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------- |
| `fastModel` 設定 + `/model --fast <id>`        | `config.ts:684`, `1987`, `2021`                        | 利用可能                                                               |
| `SendMessageOptions.modelOverride`             | `client.ts:142` → `1598` → `turn.run`                  | `geminiChat.sendMessageStream(model, …)` まで貫通                      |
| フックレイヤ `modelOverrideRef`（skill のモデル選択を保持） | `useGeminiStream.ts:376`, `2225`, `1841`   | 貫通済み                                                               |
| fast-model **非ストリーミング** サイドクエリの先例 | `services/toolUseSummary.ts:108`（`runSideQuery` 経由） | 本番稼働中、fast モデル設定の健全性を証明；ただし**非ストリーミングパス** |
| fast-model **ストリーミング**の先例            | `followup/speculation.ts:224`                          | 本番稼働中、ただし **forked chat**（`createForkedChat`）を使用し、メイン chat とは分離 |

**重要なギャップ**：**本番コードには存在しない**、メイン chat 上で fast model を使ったストリーミングの事例。本設計の D2 が初のケースとなり、事前に検証実験が必要（詳細は §3.2 前提条件参照）。

---

## 2. 設計原則

1. **汎用性**：特定の tool/skill に依存しない
2. **後方互換性**：既存ツールは変更なしで引き続き動作する
3. **漸進的＋明示的シグナル**：デフォルトは conservative。ツール作者が明示的なフィールドで opt-in する
4. **ロールバック可能**：すべての最適化は feature flag で制御。ユーザーレベルで強制無効化できる
5. **誠実なトレードオフ**：品質リスク、コストリスク、適用範囲を明確に示す

---

## 3. 最適化方式

### 3.1 方向 1：ツール後置実行ディレクティブ（ToolResult Post-Execution Directive）

#### 問題

現在の `ToolResult` には「次に何をすべきか」の情報が含まれていない。ツール結果が自己説明的であるかに関わらず、無条件に 1 ラウンドの LLM が起動される。

#### 設計

`ToolResult` インターフェースを拡張する（`packages/core/src/tools/tools.ts` L422）：

```typescript
export interface ToolResult {
  llmContent: PartListUnion;
  returnDisplay: ToolResultDisplay;
  error?: { message: string; type?: ToolErrorType };

  // 新規追加：後置実行ディレクティブ
  postExecution?: {
    /**
     * ツール結果を LLM に返送せず、最終返答としてユーザーに直接表示する。
     * 結果が完全に自包含で、モデルによる再解釈が不要なシナリオに適用。
     * ToolResult のローカルプロパティ。
     */
    skipLlmRound?: boolean;

    /**
     * ツール結果が「自包含かつユーザーに直接表示可能」——つまり `returnDisplay` が
     * ユーザーの期待する最終形であり、モデルによる処理が不要。
     * ToolResult のローカルプロパティ。「次ラウンドが summary かどうか」は予測しない。
     * 方向 3（表示解耦）と連動：true → Summarizing 状態に遷移してユーザー入力を許可。
     */
    resultIsTerminal?: boolean;
  };
}
```

> **設計修正**：初期バージョンでは単一の `selfExplanatory` フィールドが「ツール成果物の属性」と「会話フロー予測シグナル」の 2 つの役割を兼ねていたが、両者は一致しない（例：ユーザーの prompt が「X を読んで Y を修正して」の場合、read_file の出力は自包含だが次のラウンドは明らかに summary ではない）。**予測シグナルは会話フロー全体のグローバル属性**であり、ツールフィールドで表現すべきでない——D2 では会話フロー起因のヒューリスティックのみを使用する（§3.2 参照）。

#### 動作変更

`handleCompletedTools` に新たな判定を追加：

```
ツールバッチ完了
  → バッチ内のすべてのツールの postExecution.skipLlmRound を確認
  → すべて true の場合?
    → YES: markToolsAsSubmitted、submitQuery を呼ばず直接 idle
    → NO: 既存の動作を維持（submitQuery）
```

**重要な制約**：`skipLlmRound` は**現在のバッチのすべてのツールが skip を宣言**した場合のみ有効。混在バッチは引き続き返送される。

#### 履歴不変条件

LLM をスキップした後の履歴の形式：`user → function_call → function_response → <assistant なし>`。

- `repairOrphanedToolUseTurnsInHistory`（セッション読み込み時に呼ばれる）がこの形式を許容するか検証
- assistant テキストがない場合の auto-compaction の動作を検証
- PR #4176 が tool_use↔tool_result 不変条件を直近でクローズしたため、「skip 後の次ラウンド user message」の alternation をカバーする単体テストを導入前に追加する必要がある
- Qwen / OpenAI スタイルの API は許容；Anthropic は厳密な alternation を要求——将来 Anthropic に直接接続する場合はフォールバックが必要（history に空の assistant text を注入）

> **統一修正ポイント**：ここと §3.3（D3 での Summarizing 中断）が破壊するのは**同じ履歴不変条件**。修正方法は 2 択（空 assistant 注入 / Qwen 許容を受け入れる）のいずれか——両方向で同じ選択を使う必要がある。

#### シグナルエコシステム（Phase 2 の作業）

| ツール                                | `skipLlmRound`           | `resultIsTerminal`      | 備考                                                            |
| ------------------------------------- | ------------------------ | ----------------------- | --------------------------------------------------------------- |
| `read_file`                           | クエリのみのシナリオと連動 | true                   | ファイル内容が回答そのもの                                       |
| `cat`（shell 経由）                   | シナリオによる           | true                    | read_file と同様                                                |
| `grep` / `glob` / `ls`                | false                    | **false（デフォルト）** | 結果をモデルが選別・並べ替え・要約する必要がある。skill レイヤが「純粋なクエリ」と判明している場合のみ明示的に true |
| `git status` / `git log`（shell 経由） | false                   | true                    | 出力はすでにフォーマット済み                                     |
| Skill ツール                          | 各 skill が判断          | 各 skill が判断         | クエリ系 skill は true 寄り                                     |
| MCP ツール                            | デフォルト false         | デフォルト false        | allowlist で明示的に opt-in                                     |

サードパーティ/MCP ツールは信頼できないためデフォルトでは付与しない。`config.toolPostExecAllowlist` で明示的に有効化する。

> `grep/glob/ls` のデフォルト false は厳格な選択：モデルによる要約・並べ替えが必要なシナリオで D2/D3 が誤判定しないようにするため。

#### 適用範囲と非適用範囲

- **適用**：終態クエリ（read/cat/print 系）、自包含な結果（skill がフォーマット済みで出力）
- **非適用**：マルチステップタスクの中間ステップ、書き込み操作の確認、解釈が必要な複雑なログ

#### リスクと緩和策

| リスク                                          | 深刻度 | 緩和策                                           |
| ----------------------------------------------- | ------ | ------------------------------------------------ |
| ツールが skipLlmRound を誤設定してマルチステップタスクが中断 | 中 | バッチレベルのセマンティクス＋llmContent は履歴で回復可能 |
| サードパーティツールの乱用                       | 中     | MCP はデフォルト無効、allowlist で明示的に有効化  |
| 履歴不変条件の破壊                               | 中     | 導入前に単体テストを追加；セッション読み込みリプレイを検証 |
| ユーザーの期待と不一致（要約を期待していたが存在しない） | 低 | setting `alwaysSummarize: true` でオーバーライド可能 |

#### メリット

終態クエリシナリオで 3〜4 秒を節約（最後の LLM ラウンドをスキップ）。

---

### 3.2 方向 2：summary ラウンド fast-model ルーティング戦略

#### 位置付け

**本方向では新たなパイプラインは導入せず、ランタイムでのモデル切り替えをサポートするために GeminiChat インターフェースを拡張する必要がある**。

§1.4 のインフラは fast モデル設定と modelOverride のエンドツーエンド貫通を提供しているが、**メイン chat で fastModel＋ストリーミングを実行した先例はなく**、以下が必要：

- 決定関数：いつ `config.getFastModel()` を override として渡すか
- 安全なフォールバック：`GeminiChat.retryStreamWithModel` 新インターフェース（chat の内部状態を処理）
- 実験的検証：メイン chat でのモデル切り替えが compaction / history 記録を破壊しないことを確認

#### 適用範囲

D2 の適用対象：

- **useGeminiStream**（TUI メインパス）—— `sendMessageStream` 呼び出し点 L1841
- **ACP Session**（IDE 統合パス）—— `acp-integration/session/Session.ts:1182`、Phase 3 で同時改修

D2 の**非適用対象**（非インタラクティブまたは独立したコンテキストで余分な障害モードを避けるため）：

- **Subagent ランタイム**（`agents/runtime/agent-core.ts:614`）：子 agent は独立したモデル設定を持つ
- **Cron トリガー turn**（`SendMessageType.Cron`, client.ts:127）：非インタラクティブ、RT の緊急性なし
- **Notification turn**（`SendMessageType.Notification`, client.ts:129）：同上

#### コアとなる難点

`submitQuery` の呼び出し時点では、**モデルが結果を見た後に新たなツールを呼び出すのか、テキストを直接出力するのかはわからない**。fast model で呼び出してモデルがさらにツールを呼び出す場合——その影響は**サイレント**となる：fast が誤ったツールや誤ったパラメータを呼び出す可能性があり、エラーは明らかなシグナルを発しない。

**どんなツールレベルのフィールドも「次ラウンドが summary かどうか」を確実に予測できない**——なぜなら、それは会話フロー（user prompt＋累積コンテキスト）に依存し、ツール成果物のローカル属性ではないから。例：

```
ユーザー：「utils.ts を読んで、その中の console.log をすべて logger.info に変えて」
  → Tool 1: read_file → 結果は自包含
  → しかし次のラウンドは明らかに summary ではない
```

したがって D2 は**会話フローのヒューリスティック**のみで予測し、ツールフィールドには依存しない。

#### 決定関数：会話フローヒューリスティック＋拒否

```typescript
import { Kind, MUTATOR_KINDS } from '../tools/tools.js';

function selectContinuationTier(
  turn: Turn,
  userPrompt: string,
  batch: ToolCall[],
): 'fast' | 'primary' {
  // ===== ユーザーレベルの強制スイッチ（最高優先度） =====
  const userPref = config.getSummaryTierStrategy();
  if (userPref === 'always_primary') return 'primary';
  if (userPref === 'always_fast') return 'fast'; // ランタイム安全策の制約は引き続き適用

  // ===== ユーザー意図による拒否 =====
  // 1. user prompt に動作動詞が含まれる → 次のラウンドはほぼツールを呼び出す
  if (requestImpliesFurtherAction(userPrompt)) return 'primary';

  // 2. 本ラウンドに mutator ツールが含まれる → 後続の読み取り/検証の可能性が高い
  if (batch.some((c) => MUTATOR_KINDS.includes(c.tool.kind))) return 'primary';

  // 3. 本ラウンドまたは履歴に未解決のエラーがある → primary でモデルが診断する必要
  if (hasUnresolvedError(turn.toolResults, batch)) return 'primary';

  // ===== 出力複雑度による拒否 =====
  // 4. user prompt が深い分析を要求（説明/比較/理由 など）
  if (needsDeepReasoning(userPrompt)) return 'primary';

  // 5. 3 つ以上の異なるツール呼び出し → 複数結果にまたがる叙述は primary が必要
  if (needsCrossResultReasoning(turn)) return 'primary';

  // 6. ツール出力が長い → 長いコンテンツの要約は primary が必要
  if (estimateTotalToolOutputTokens(turn) > 4000) return 'primary';

  // ===== モデルフィージビリティによる拒否 =====
  // 7. fast モデルのコンテキストウィンドウが不足 → fast に切ると compression がトリガーされる
  //    （compression 自体が LLM 呼び出しを必要とし、RT とコストが悪化する）
  if (wouldTriggerCompression(turn.history, config.getFastModel()))
    return 'primary';

  // ===== 多言語フォールバック =====
  if (!isPromptLanguageSupported(userPrompt)) return 'primary';

  // ===== セッション状態フォールバック =====
  if (turn.justCompacted || turn.justCleared) return 'primary';

  return 'fast';
}
```

8 つの拒否条件の意味：

- **`requestImpliesFurtherAction`**：動作動詞（`改|削|加|替換|修復|実装|新規作成|create|fix|change|add|remove|implement|write|update`）→ マルチステップタスク
- **`MUTATOR_KINDS` ヒット**：本ラウンドで書き込みが発生 → 後続の読み取り/検証の可能性が高い。**`tools.ts:806` の既存の `MUTATOR_KINDS = [Edit, Delete, Move, Execute]` を再利用**（各 Tool インスタンスの `kind: Kind` 属性が権威的な分類。`isWriteTool` を再発明しないこと）
- **`hasUnresolvedError(turnResults, currentBatch)`**：2 段階で判定——
  - **現在のバッチにエラーがある → 常に未解決**（並列バッチが自己修正できると仮定しない）
  - **履歴は `(toolName, args fingerprint)` で重複排除し、最後の結果がまだエラーなら未解決とみなす**（toolName のみでは同名で異なるパラメータの場合に誤判定）
  - shell などは `ToolResult.error` を正しく設定する必要がある（データ品質の前提依存）
- **`needsDeepReasoning`**：「分析/説明/なぜ/比較/診断」系のキーワードを含む
- **`needsCrossResultReasoning`**：異なるツール呼び出しが ≥3（同じツール・同じパラメータは 1 回とカウント）
- **出力トークン > 4000**：経験的閾値、**fast モデルのベースラインを実測した後に調整**
- **`wouldTriggerCompression`**：fast モデルのコンテキストウィンドウは通常 primary より小さく、同じ history で fast の方が早く `tryCompress`（geminiChat.ts:1418）をトリガーする——compression 自体が 1 回の LLM 呼び出しを必要とし、**RT とコストが逆に悪化する可能性がある**。予算見積もり：`estimateHistoryTokens(history) > fastModelContextWindow × COMPACTION_THRESHOLD` ならトリガーされると判断
- **未対応言語**：中国語と英語のキーワードのみ検出。その他の言語（日本語・韓国語など）はデフォルトで primary
- **セッション状態の突変**：`/compact` または `/clear` 直後の最初の continuation → primary でメンタルモデルを再構築

拒否の方向は **primary 寄り**（品質を落とすくらいなら 2 秒遅い方がよい）。

#### 重要な実装：`GeminiChat.retryStreamWithModel`

**問題**：abort して直接 `client.sendMessageStream` を呼び出すと chat の状態が破壊される：

1. `geminiChat.ts:1428` はストリーム開始時に `userContent` を history に push する。再起動すると**再度 push され、履歴に `function_response` が重複**する
2. `sendPromise` ロック（`geminiChat.ts:1392, 1398`）—— abort 後に `streamDoneResolver` が呼ばれることを保証する必要がある
3. PR #4176 で導入された `pendingPartialState` などの不変条件マーカーを正しくクリーンアップする必要がある
4. Telemetry span の model 属性を更新する必要がある

**新規インターフェース**（`packages/core/src/core/geminiChat.ts`）：

```typescript
/**
 * Retry an in-flight or just-aborted streaming send with a different model.
 * Does NOT re-push userContent (kept from original send).
 * Resets pendingPartialState; releases stale sendPromise; re-opens span.
 */
async retryStreamWithModel(
  model: string,
  signal: AbortSignal,
): Promise<AsyncGenerator<StreamEvent>>;
```

呼び出し規約：

- 元の send が abort された後にのみ呼び出す（並行しない）
- prompt_id を再利用（同じユーザー意図）
- 履歴にすでに push された userContent は再度 push しない

実装工数：約 1.5 日＋単体テスト。

#### ランタイム安全策

`selectContinuationTier` が `'fast'` を返したが、ストリームで `ServerGeminiEventType.ToolCallRequest` イベントを検出 → **現在のストリームを即 abort し、`retryStreamWithModel(primaryModel)` を呼び出す**。

これは「summary と予測したが実際にはツールが必要」というサイレントエラーの唯一のシナリオをカバーする。代償：fast 呼び出しで消費されたトークン（コスト帰属は §5.3 参照）。

#### skill `modelOverride` との分離

`useGeminiStream.modelOverrideRef`（L376, L2225）は現在 **skill が明示的に選択したモデル**を保持し、「ビジネスセマンティクス」に属する。本方向の fast ルーティングは「最適化セマンティクス」であり、両者は**必ず分離する**：

```typescript
// 独立した ref を新規追加
const summaryTierRef = useRef<'fast' | 'primary' | undefined>(undefined);

// 呼び出し点でのマージ（modelOverrideRef は再利用しない）
const stream = geminiClient.sendMessageStream(
  finalQueryToSend,
  abortSignal,
  prompt_id!,
  {
    type: submitType,
    notificationDisplayText: metadata?.notificationDisplayText,
    modelOverride:
      modelOverrideRef.current ?? // skill の明示的な選択を優先
      (summaryTierRef.current === 'fast' ? config.getFastModel() : undefined),
  },
);
```

ライフサイクル：

| タイミング                                       | `modelOverrideRef`（skill） | `summaryTierRef`（fast ルーティング）    |
| ------------------------------------------------ | --------------------------- | ---------------------------------------- |
| 新しい user turn（`!Retry && !ToolResult`）      | クリア                      | クリア                                   |
| skill ツールが `modelOverride` フィールドを返す  | 書き込み                    | 変更なし                                 |
| tool バッチ完了 → `selectContinuationTier`       | 変更なし                    | 書き込み                                 |
| ランタイムフォールバック（ToolCallRequest を検出） | 変更なし                   | `'primary'` に昇格                       |
| Retry（ユーザーが手動で Ctrl+Y）                  | 保持                        | `'primary'` に昇格（fast 失敗後は fast を使わない） |

skill の明示的な選択は**常に優先**——ユーザーの明示的な意図は最適化戦略よりも優先される。

#### Telemetry 修正

`client.ts:1303` の interaction span は turn 開始時に `model` 属性を記録する。フォールバックがトリガーされるとモデルが実際に変わるため、span のデータが歪む。以下が必要：

```typescript
// フォールバック時
span.setAttribute('llm.model.requested', fastModel);
span.setAttribute('llm.model.actual', primaryModel);
span.setAttribute('llm.fallback.reason', 'tool_call_seen');
```

また `addUserPromptAttributes` で `requested` / `actual` モデルを区別し、課金・監査の混乱を防ぐ。

#### ユーザーレベルの強制スイッチ

新規 setting（`packages/cli/src/config/settingsSchema.ts`）：

```typescript
summaryTierStrategy: 'auto' | 'always_primary' | 'always_fast';
// default: 'auto'
```

- `'auto'`：`selectContinuationTier` を使用（推奨）
- `'always_primary'`：D2 最適化を完全に無効化（本番の重要なシナリオ向け）
- `'always_fast'`：拒否をスキップするが、**ランタイム安全策は引き続き適用**（上級ユーザー向け）

理由：D2 は品質を速度と交換するものであり、一部のユーザー/シナリオには明示的なオプトアウト手段が必要。

#### 前提条件

- `config.getFastModel()` が設定済み
- **メイン chat での fastModel ストリーミング検証実験**（コーディング前に 1 日）：
  - `resultIsTerminal=true` のモックツールを用意し、メイン chat で繰り返し summary ラウンドをトリガー
  - `tryCompress` が誤ってトリガーされるか観察（fast モデルのコンテキストウィンドウが小さいと早期トリガーの可能性がある）
  - chatRecordingService の出力に model mismatch がないか観察
  - 1 回の fast 呼び出し後の次の primary 呼び出しが history を正常に読めるか観察
- **fast 候補モデルのベースライン測定**（1 日）：
  - summary ラウンドの prompt（`function_response` を含む入力）を 100 件実行し、エンドツーエンドの P50/P95 レイテンシと time-to-first-token を測定
  - `tryCompress` トリガー率 `P_compact` を測定し、正味 RT 収益 = `(1 - P_compact) × ΔRT − P_compact × compression_RT > 0` を検証
  - fast の P50 ≤ primary の P50 × 0.5、かつ P95 ≤ primary の P95 × 0.6 の場合のみ有効化
- fast モデルと primary モデルは同一ファミリー（`function_response` エンコーディングの差異を避けるため）；ファミリーをまたぐ場合は `getFastModel()` レイヤで拒否が必要
- **`thinkingConfig` 互換性**：
  - fast モデルと primary は `thinkingConfig.includeThoughts` のサポートが一致していること；または
  - fast パスで強制的に `includeThoughts: false`（`sideQuery.ts:118-122` と整合）
  - 検証：history に thought parts が含まれる場合、fast モデルが正しく処理できること（エラーなし、thought をユーザー入力として扱わない）

#### リスクと緩和策

| リスク                                                                   | 深刻度     | 緩和策                                                                                                                                   |
| ------------------------------------------------------------------------ | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Fast モデルがツール呼び出しをサイレントに誤る                            | 高         | 会話フローヒューリスティック＋ランタイム ToolCallRequest abort 安全策                                                                    |
| エラーを含む入力で fast がハルシネーションし「ユーザーに見える誤った回答」を生成 | **高** | `hasUnresolvedError` 拒否；ユーザー追質問率を監視（注：`emitToolUseSummaries` の同様リスクは 60 トークンのラベルにのみ影響するが、本リスクは最終回答に影響し重大度がより高い） |
| Fast パスが `tryCompress` をトリガー → 追加の LLM 呼び出しで **RT とコストが逆に悪化** | **高** | `wouldTriggerCompression` 予測ゲート（決定関数 #7 参照）；前置ベースライン測定で `P_compact` 閾値を確認 |
| Compression 自体がどのモデルを使うか                                      | 中         | compression トリガー時は fast ルーティングを放棄（ゲート #7 でカバー）；回答品質の問題を避ける                                            |
| メイン chat でのモデル切り替えが chat 内部状態/記録を破壊する            | 中         | 前置検証実験でカバー；セッション再開のリプレイテスト                                                                                    |
| D2 と `emitToolUseSummaries` が同時に fast を呼び出し、rate-limit を超過 | 中         | どちらか一方：D2 有効時は `emitToolUseSummaries` を無効化（タイトルに影響しない）、またはレート制限用のトークンバケットを共有             |
| `thinkingConfig` が fast / primary 間で不一致となり history のパースが異常 | 中         | 同一ファミリー＋fast パスで強制 `includeThoughts: false`（前提条件参照）                                                                 |
| フォールバックパスがより高コストになる（fast トークン浪費＋primary フル実行） | 中      | `fast_tokens_consumed` 決定ログで監視；フォールバック率 >20% で flag を自動無効化                                                         |
| Telemetry span のモデル情報が歪む                                         | 中         | `requested` / `actual` を分割（Telemetry 修正参照）                                                                                     |
| コンテキスト形式の非互換性（ファミリー間）                               | 中         | `getFastModel()` でファミリー間の選択を拒否                                                                                              |
| skill の modelOverride とセマンティクスが衝突                            | 中         | 独立した ref＋skill 優先                                                                                                                 |
| `/model` でプライマリモデルをランタイム切り替え後、`summaryTierRef` の決定が無効化 | 低  | `/model` コマンド処理時に `summaryTierRef` を同時にクリア                                                                                |
| fast のトークン/秒が逆に遅い                                              | 低         | 測定時は TTFT も同時に測定し、総 RT だけを見ない                                                                                         |

#### 収益（実測待ち）

- **RT**：summary ラウンドで 2〜3 秒の節約（実測前に PR タイトルには記載しない）
- **コスト**：fast モデルの単価は通常 primary より大幅に低く、高頻度 summary シナリオではトークンコストが 30〜50% 低下する可能性があるが、フォールバックパスの浪費が一部の収益を相殺する。`fast_tokens_consumed` の実測で正味収益を確認する必要がある

---

### 3.3 方向 3：結果表示とインタラクションの分離（Presentation Decoupling）

#### 問題

ユーザーはツールが完了してから再度入力できるようになるまで、LLM 要約ラウンドの完了を待たなければならない：

```
ツール完了 → [結果レンダリング] → [submitQuery] → [LLM ストリーミング 3-4s 待機] → Idle → 入力可能
                                                    ~~~~~~~~~~~~~~~~~~~~~~~~
                                                    ユーザーは結果を見ているが操作できない
```

#### 設計

新しい `StreamingState.Summarizing` 状態を追加：

```typescript
export enum StreamingState {
  Idle = 'idle',
  Responding = 'responding',
  WaitingForConfirmation = 'waiting_for_confirmation',
  Summarizing = 'summarizing', // 新規追加
}
```

#### 状態機械の変更

```
ツール完了かつ結果を表示済み
  → バッチ全体の postExecution.resultIsTerminal === true の場合:
    → Summarizing に遷移（ユーザーは入力可能）
    → submitQuery を非同期実行
    → LLM 要約を history に追記（またはユーザーの新しいメッセージでキャンセル）
  → それ以外:
    → Responding のまま（ユーザーは入力不可）
```

#### ユーザーの新規メッセージ処理

- `Summarizing` 状態でユーザーが新しいメッセージを送信 → 現在の要約を abort → 新しいメッセージを処理
- 生成された**部分的な要約テキストは破棄**（history に入れない）。半文 assistant がコンテキストを汚染しないようにするため
- `function_response` は history に保持（モデルはツールが実行されたことを知る）
- followup suggestion は Summarizing 完了またはキャンセル後にトリガー

#### Abort 時の partial text クリーンアップチェックリスト

partial text は複数箇所に存在する。**すべてを同時に**クリーンアップする必要があり、1 つでも漏れると状態不整合が発生する：

| 位置                                                          | クリーンアップ操作                                                                        |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `pendingHistoryItemRef.current`（useGeminiStream React state） | `null` を設定し、`addItem` を呼ばない                                                    |
| `GeminiChat.history` の内部累積                               | abort 前に部分的な assistant content を push していた場合、新しい `discardPendingAssistant()` インターフェースでロールバック |
| `ChatRecordingService` のバッファ済み turn                     | cancelled としてマークし、JSONL に書き込まない                                            |
| `dualOutput.emitText`（有効な場合）                           | abort sentinel を送信し、sidecar が自ら破棄する                                           |
| `loopDetectorRef` の累積トークン                              | 現在の turn カウントをリセット                                                            |

実行順序：abort シグナルがトリガー → 上記 5 箇所のクリーンアップが完了 → 新しい user message が `submitQuery` に入ることを許可。競合状態テスト：abort がトリガーされた瞬間にちょうど最後のチャンクを受信した場合をカバー。

#### 適用条件

バッチ全体が `postExecution.resultIsTerminal === true`。

#### 履歴不変条件（§3.1 と同源）

Summarizing 中に中断すると以下が発生する：

```
[user_1, function_call, function_response, user_2]
                                          ↑ assistant turn がない
```

**これは §3.1 で LLM ラウンドをスキップした場合と同じ不変条件を破壊する**。D1 と同じ修正戦略（空 assistant 注入 / Qwen 許容を受け入れる）を使う必要がある。

- D1 の不変条件単体テストを再利用する
- セッション読み込みリプレイ（`repairOrphanedToolUseTurnsInHistory` を含む）がこの形式をカバーする必要がある
- Anthropic alternation：直接接続時は D1 と同時にフォールバックを追加する

#### リスクと緩和策

| リスク                                          | 深刻度     | 緩和策                                                             |
| ----------------------------------------------- | ---------- | ------------------------------------------------------------------ |
| Abort 時に半文 assistant が history に入る      | **中**     | partial text を明示的に破棄；function_response のみ保持；競合の単体テスト |
| 履歴不変条件の破壊（assistant の後続なし）       | **中**     | D1 と同源の問題、統一修正（§3.1 履歴不変条件参照）                  |
| UI 状態の複雑度増加                             | 中         | Summarizing = Idle＋バックグラウンドタスク；入力パスは Idle を再利用 |
| ユーザーが体感できる収益が行動パターンに依存する | 低         | ユーザーが 3 秒以内に入力しなければ要約は完了している → 体感できる収益なし；ただし**悪化することはない** |

#### 収益

- **理論的上限**：3〜4 秒の体感 RT（ユーザーがツール完了直後に入力）
- **実際の中央値**：ユーザーの入力間隔に依存——結果を 2〜5 秒読んでから入力するユーザーは差を感じないが、**遅くなることは絶対にない**

---

### 3.4 方向 4：ストリーム先行スケジューリング（Stream-Ahead Scheduling）

#### 問題

`processGeminiStreamEvents` はストリームが完全に終了した後にバッチ処理でツールをスケジュールする。`ToolCallRequest` イベントはストリームの途中でも yield される可能性がある。

#### 設計

ストリームイベント処理で `ToolCallRequest` に対して即座に**事前検証**を開始する（実行はしない）：

```typescript
case ServerGeminiEventType.ToolCallRequest:
  toolCallRequests.push(event.value);
  scheduler.prevalidate(event.value, signal);  // 新規追加
  break;
```

`CoreToolScheduler.prevalidate(request)`：

1. ツール登録を検索
2. invocation を構築
3. `shouldConfirmExecute` を実行（結果をキャッシュ）
4. `schedule()` 時にキャッシュされた結果を直接使用

#### 純粋性契約と Allowlist

`prevalidate` は `shouldConfirmExecute` が副作用なし（side-effect-free）**かつ**、prevalidate→schedule の間隙に外部から結果が無効化されないことを要求する。

**`tools.ts:818` の `CONCURRENCY_SAFE_KINDS` をそのまま再利用する**：

```typescript
export const CONCURRENCY_SAFE_KINDS: ReadonlySet<Kind> = new Set([
  Kind.Read,
  Kind.Search,
  Kind.Fetch,
]);
```

これはプロジェクト既存の「副作用なし＋並行安全」分類であり、prevalidate の要件にちょうど合致する。

| ツール Kind                        | Allowlist に含まれるか  | 理由                                                    |
| ---------------------------------- | ----------------------- | ------------------------------------------------------- |
| `Read`（read_file など）           | ✅                      | 純粋な読み取り                                          |
| `Search`（grep / glob）            | ✅                      | 純粋な読み取り                                          |
| `Fetch`（web_fetch など）          | ✅                      | リモート読み取り、書き込み副作用なし                    |
| `Edit`                             | **❌**（以下の TOCTOU 参照） | shouldConfirmExecute は純粋な読み取りだが、スケジュール間隙で diff が無効化される可能性 |
| `Delete` / `Move` / `Execute`      | ❌                      | MUTATOR_KINDS                                           |
| `Think`                            | ❌                      | `save_memory` / `todo_write` などの暗黙的な書き込みを含む |
| MCP ツール                         | ❌                      | 信頼できない                                            |

**TOCTOU：なぜ Edit を Allowlist に含めないか**

理論的には Edit の `shouldConfirmExecute` は純粋な読み取り（ファイルを読んで diff を計算）。しかし prevalidate と schedule の間には時間窓が存在する：

```
T=0      stream が Edit(file=a.ts, ...) を受信 → prevalidate
T=10ms   shouldConfirmExecute が a.ts を読み、diff_v0 をキャッシュ
T=300ms  stream 終了、scheduler.schedule()
T=305ms  その間に別のツール/IDE/外部プロセスが a.ts を変更
T=310ms  scheduler が diff_v0 をユーザーに表示
T=320ms  ユーザーが v0 に基づいて承認
T=330ms  Edit が古いパラメータを v1 ファイルに適用 → 内容破損 / マージ失敗
```

これが TOCTOU である。修正方向：

- **A（推奨）**：Edit を Allowlist に含めず、prevalidate は `CONCURRENCY_SAFE_KINDS` の 3 種のみをカバー。代償：収益が「50〜200ms（Edit 主体）」から「50〜100ms（読み取り系のみ）」に低下
- **B（オプションで強化）**：Edit を Allowlist に含めるが、キャッシュに `(mtime, size, content_hash)` を添付；schedule() 時に変更がないことを確認してからキャッシュを使用。そうでなければ再計算

本ドキュメントは暫定的に A を採用。

#### 既存の並列スケジューリングとの相互作用

`coreToolScheduler.attemptExecutionOfScheduledCalls`（L2436+）は `partitionToolCalls` を使ってツールを「並行安全バッチ」と「直列バッチ」に分け、並行バッチは `runConcurrently`（L2473）で実行される。

prevalidate はこの分割モデルと整合する必要がある：

- キャッシュは `callId` でインデックス付け（`(toolName, args)` ではなく、並行する同名呼び出しの衝突を避ける）
- prevalidate が失敗した call → 他の call に影響せず、schedule 時にその call は元の `shouldConfirmExecute` パスを使用
- ストリームがキャンセルされた場合、`signal` を通じてすべてのインフライト prevalidate を連鎖的に abort

#### リスク

| リスク                                          | 深刻度 | 緩和策                                                                    |
| ----------------------------------------------- | ------ | ------------------------------------------------------------------------- |
| キャッシュされた diff と確認時の実際のファイルが不一致（TOCTOU） | 高 | 方案 A：Edit を Allowlist に含めない；方案 B：キャッシュに `(mtime, size, hash)` を添付して検証 |
| prevalidate の失敗がスケジューリングに影響する  | 低     | 失敗/タイムアウト時は元の `shouldConfirmExecute` パスに戻る。キャッシュなし = 無効化と等価 |
| 並行 prevalidate でファイルディスクリプタ/リソースの競合 | 低 | `QWEN_CODE_MAX_TOOL_CONCURRENCY` で並行数の上限を制限済み（デフォルト 10） |

#### 収益

50〜100ms/ラウンド（`CONCURRENCY_SAFE_KINDS` の範囲のみ）。方案 B で Edit を含む場合は理論的に 100〜200ms。

---

## 4. 総合評価とロードマップ

### 4.1 総合評価

| 方向                      | RT 収益                          | 実装複雑度               | 品質リスク | 依存                                          | 優先度 |
| ------------------------- | -------------------------------- | ------------------------ | ---------- | --------------------------------------------- | ------ |
| D1 ツール後置ディレクティブ | 3〜4s/終態ラウンド              | 低（2〜3 日）            | 低         | なし                                          | **P0** |
| D2 summary fast ルーティング | 2〜3s/summary ラウンド（実測待ち） | **中〜高（9 日）**       | 中〜高     | D2 独自のヒューリスティック＋メイン chat 検証実験＋ACP 同期 | **P1** |
| D3 表示解耦                | 3〜4s の体感改善（ユーザー行動依存） | 中（3〜5 日、不変条件修正含む） | 中    | D1 の履歴不変条件修正                         | **P1** |
| D4 ストリーム先行スケジューリング | 50〜200ms/ラウンド           | 高（5〜7 日）            | 極低       | なし                                          | P2     |

#### D2 工数内訳

| サブタスク                                                                                               | 見積もり |
| -------------------------------------------------------------------------------------------------------- | -------- |
| メイン chat での fastModel ストリーミング検証実験（P_compact 測定含む）                                   | 1 日     |
| fast 候補モデルのベースライン測定（TTFT、P95、`thinkingConfig` 互換性含む）                              | 1 日     |
| `selectContinuationTier` + `summaryTierRef` の接続（useGeminiStream）                                    | 0.5 日   |
| ヒューリスティック実装（`MUTATOR_KINDS` 再利用 / `wouldTriggerCompression` 見積もり / 多言語 / 状態突変含む） | 1 日   |
| `GeminiChat.retryStreamWithModel` + `discardPendingAssistant` インターフェース実装                       | 1.5 日   |
| ACP Session の同期改修（acp-integration/session/Session.ts）                                             | 1 日     |
| Telemetry span 修正（`requested` / `actual` 分割）                                                       | 0.5 日   |
| ユーザーレベル setting `summaryTierStrategy` + JSON schema + `/config` 統合                              | 0.5 日   |
| 単体テスト（競合、abort タイミング、履歴不変条件、フォールバックパス、ACP パス）                          | 2 日     |
| **合計**                                                                                                 | **9 日** |

> 注：初期見積もりの 6.5 日には ACP パス、`wouldTriggerCompression` ゲート、クリーンアップチェックリスト、settings schema のエンジニアリングコストが含まれていなかった。

### 4.2 実装ロードマップ

#### Phase 1：D1 ツール後置ディレクティブ（1 週間）

- `ToolResult.postExecution` を拡張（tools.ts L422）：`skipLlmRound` + `resultIsTerminal`
- `handleCompletedTools` で `skipLlmRound` のショートサーキットを実装（useGeminiStream.ts L2038）
- 履歴不変条件の単体テストを追加
- **Phase 1 では `resultIsTerminal` を消費しない**（Phase 3 に持ち越し）

#### Phase 2：シグナルエコシステム構築（2 週間、Phase 4 と並行）

- 組み込みツールに順次 `skipLlmRound` / `resultIsTerminal` を付与（§3.1 の表参照）
- 付与カバレッジ ≥60% を検証（turn 数で重み付け、呼び出し回数ではなく）
- 本番データを収集し、§3.2 の拒否ゲート閾値を校正
- Phase 2 末期に §3.2 のメイン chat 検証実験とベースライン測定を実施

#### Phase 3：D2 + D3（約 3 週間、ACP 同期含む）

> **修正**：初期ロードマップの見積もりは 1 週間だったが、fastModel ストリーミング検証実験、`retryStreamWithModel` 実装、不変条件の統一修正、ACP パスの同期が含まれていなかった。

- コーディング前：メイン chat 検証実験＋ベースライン測定完了（`P_compact` と thinkingConfig 互換性含む）
- `summaryTierRef` + `selectContinuationTier` を新規追加（`wouldTriggerCompression` ゲート含む）
- `GeminiChat.retryStreamWithModel` + `discardPendingAssistant` を新規追加
- **ACP Session パスを同期改修**（acp-integration/session/Session.ts）して同じ決定関数を使用
- `StreamingState.Summarizing` + 入力パスの再利用 + abort クリーンアップチェックリストを新規追加
- 履歴不変条件を統一修正（D1+D3 は同源）
- Feature flag `experimental.summaryRoundFastModel: false`、**Release N はデフォルト無効**
- ユーザー setting `summaryTierStrategy`
- Telemetry span 修正
- ランタイム安全策（ToolCallRequest abort + retryStreamWithModel）

#### Phase 4：D4 ストリーム先行スケジューリング（独立して挿入可能）

- `CoreToolScheduler.prevalidate` + allowlist
- `processGeminiStreamEvents` のインクリメンタルスケジューリング

---

## 5. 指標、受け入れ基準、制限

### 5.1 パフォーマンス指標

| 指標                                 | ベースライン | Phase 1 | Phase 3                    |
| ------------------------------------ | ------------ | ------- | -------------------------- |
| エンドツーエンド RT P50（3 ラウンドループ） | 13.4s      | <10s    | <8s（実測待ち）            |
| エンドツーエンド RT P95              | -            | <13s    | <12s（フォールバックパス上限） |
| ユーザー体感での最初の結果表示 P50   | 13.4s        | <10s    | <5s（D3 有効時）           |
| ユーザー体感での最初の結果表示 P95   | -            | <13s    | <8s                        |
| LLM 呼び出し回数（スキップ可能シナリオ） | 3           | 2       | 2（より高速）              |

> 注：ベースラインはシングルサンプル。導入前に ≥3 種のシナリオのデータを補完する必要がある。

### 5.2 品質指標

| 指標                                               | ベースライン | 許容劣化                 |
| -------------------------------------------------- | ------------ | ------------------------ |
| ツール呼び出し正確度（fast model summary ラウンド） | 100%         | ≥98%                     |
| skipLlmRound 誤用率（ユーザーが「もっと詳しく」と追質問） | -    | <1%                      |
| Fast model fallback_triggered 率                   | -            | <10%（>20% で flag を自動無効化） |
| Summarizing 状態で半文 assistant が history に入る | 0            | 0（ハード要件）          |

### 5.3 コスト指標

| 指標                                | ベースライン | Phase 3 目標                                                    |
| ----------------------------------- | ------------ | --------------------------------------------------------------- |
| 1000 セッションあたりのトークンコスト（summary ラウンド） | 100% | <70%                                              |
| フォールバックパスで浪費するトークンの割合 | 0        | <15%（フォールバック率 × 1 回の fast トークン / 1 回の primary トークン） |

### 5.4 決定ログのスキーマ

`selectContinuationTier` と `handleCompletedTools` の各判定で構造化ログを 1 件記録：

```
{
  turn_id, prompt_id,
  decision: 'skip' | 'fast' | 'primary',
  tier_requested: 'fast' | 'primary',          // 決定（フォールバック前）
  tier_actual:    'fast' | 'primary',          // 実際の実行（フォールバック後）
  signal_skipLlmRound: bool,
  signal_resultIsTerminal: bool,
  user_strategy: 'auto' | 'always_primary' | 'always_fast',
  veto_reason: 'further_action' | 'write_tool' | 'unresolved_error' |
               'deep_reasoning' | 'cross_result' | 'output_tokens' |
               'lang_unsupported' | 'compact_or_clear' | null,
  tool_count, distinct_tool_count,
  has_write_tool: bool,
  has_error: bool, has_cancel: bool,
  output_tokens_est: int,
  user_prompt_classification: 'query' | 'action' | 'analysis',
  fast_ttft_ms, primary_ttft_ms,                // フォールバック時は両方
  fast_tokens_consumed: int,                    // フォールバックで浪費したトークン（コスト帰属）
  total_rt_ms,
  fallback_triggered: bool,
  fallback_reason: 'tool_call_seen' | 'timeout' | 'error' | null,
}
```

観察指標：

- fast トリガー率（期待値 30〜50%）
- fallback_triggered 率（期待値 <10%；>20% は次の release でデフォルト flag を無効化するサイン）
- 各 veto の割合（厳しすぎる/緩すぎるの識別）
- fast_tokens_consumed × fallback_rate（コストの逆リスク）
- ユーザーの「もっと詳しく」追質問頻度（fast 品質劣化のシグナル）

**`fast_tokens_consumed` の測定に関する注記**：

abort で中断されたストリームは **`finishReason` / `usageMetadata` を受信できない可能性が高い**——後者は通常ストリームが完全に終了したときに返される。以下の推定実装が必要：

- 優先：abort 前に `stream.return()` を試みてジェネレーターが finally パスを通るようにする。partial usage を取得できる可能性がある
- フォールバック：受信済みチャンクのテキスト長 × 4 で output tokens を推定；input tokens は history から推定
- ラベル付け：ログフィールドに `tokens_source: 'usage' | 'estimated'` を添付。事後分析で区別が必要

### 5.5 検証方法とリリース戦略

#### 検証

- `/tmp/tool-timing.log` の計時フレームワークを再利用
- `T_userIdle`（ユーザーが再度入力できる時刻）を新規追加
- `T_firstToken`（ストリーミングの最初のトークン時刻）を新規追加
- A/B テストで各 Phase の前後の RT とコスト分布を比較

#### リリース戦略（ローカル CLI に適応）

Qwen Code はローカル CLI であり、**ランタイムでの配布機能を持たない**——従来の「5% / 25% / 100% グラデーション」は適用できない。**段階的な release 推進**を採用：

| フェーズ                   | Release ノード          | feature flag デフォルト値 | トリガー条件                                                      |
| -------------------------- | ----------------------- | ------------------------- | ----------------------------------------------------------------- |
| Phase 3a：ドッグフード     | Release N               | `false`                   | 社内ユーザーが `summaryTierStrategy=always_fast` で自己有効化     |
| Phase 3b：opt-in デフォルト | Release N+1（≥2 週後） | `false`（変更なし）        | ドッグフード段階の決定ログ達成：fallback <10%、正味 RT/cost 収益 >0 |
| Phase 3c：デフォルト有効   | Release N+2（≥4 週後） | `true`                    | Phase 3b ユーザーレベルでの品質劣化報告なし                       |
| ロールバック                | Release N+3（必要に応じて） | `true → false`        | 大規模 fallback >20% または品質指標の劣化                         |

**ロールバック機構**：

- ランタイム配布なし、**ロールバック = 新 release を発行してデフォルト flag を無効化**
- ユーザーレベルの `summaryTierStrategy=always_primary` は常に「今すぐ退出」チャンネルを提供し、新 release に依存しない
- 決定ログの `fallback_rate` / `cost_regression` を各 Release サイクルで評価し、次のステップを決定する

### 5.6 既知の制限

1. **ベースラインデータが希薄**：シングルサンプルはすべてのタスクパターンをカバーできない。導入前にシナリオを補完する必要がある
2. **fast モデルの前提**：大幅に高速でツール呼び出しの品質が同一ファミリー内で合格するモデルが存在しない場合 → D2 は有効化しない
3. **`skipLlmRound` は品質と速度のトレードオフ**：LLM をスキップする = モデルの理解とエラー修正を放棄する。確実性の高いシナリオにのみ適用
4. **D2 は品質＋コストと速度のトレードオフ**：fast モデルの品質は primary より低い。フォールバックパスはより高コストになる——決定ログで正味収益を実測する必要がある
5. **`tryCompress` トリガーが逆効果になる可能性**：fast モデルのコンテキストが小さく、compression 自体が LLM 呼び出しを消費する——`wouldTriggerCompression` ゲートは必須の防御策
6. **表示解耦はインタラクションモデルを変更する**：新しいモードにはユーザーの適応が必要；ユーザー行動が実際の体感収益を決定する
7. **ネットワークレイテンシは制御不能**：本設計は呼び出し回数を削減するが、単回呼び出しを最適化するものではない
8. **Anthropic 直接接続は未カバー**：現在の alternation 許容度は Qwen / OpenAI スタイルの API に依存
9. **メイン chat での fastModel ストリーミングは初の本番適用**：先例なし、独立した検証実験が必要
10. **ローカル CLI にランタイム配布なし**：リリース戦略は段階的な release 推進のみ。高速なグラデーション調整は不可能
11. **D2 はインタラクティブパスのみに適用**：Subagent / Cron / Notification には収益なし。これは意図的な設計
12. **混在モデル history の長期影響は未知**：D2 有効後、セッション内の turn が fast/primary 間で切り替わる。長いセッションの再開とコンテキスト連続性の観察が必要
13. **D4 の収益縮小**：Edit が Allowlist を外れた後、prevalidate は純粋な読み取り系ツールのみをカバー（50〜100ms の収益）；Edit を含む 200ms の収益には方案 B の mtime/hash 検証機構が必要

### 5.7 重要なコード位置

| ファイル                                                  | 重要なシンボル                                                    | 位置                     |
| --------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------ |
| `packages/core/src/tools/tools.ts`                        | `ToolResult` インターフェース                                     | L422                     |
| `packages/core/src/tools/tools.ts`                        | `Kind` enum + `MUTATOR_KINDS` + `CONCURRENCY_SAFE_KINDS`          | L793, L806, L818         |
| `packages/core/src/tools/tools.ts`                        | `DeclarativeTool.kind: Kind`（各 Tool インスタンスが持つ）        | L165                     |
| `packages/core/src/core/client.ts`                        | `SendMessageOptions.modelOverride`                                | L142                     |
| `packages/core/src/core/client.ts`                        | `sendMessageStream`                                               | L1216                    |
| `packages/core/src/core/client.ts`                        | `modelOverride ?? getModel()`                                     | L1305, L1598             |
| `packages/core/src/core/client.ts`                        | `turn.run(model, …)`                                              | L1707                    |
| `packages/core/src/core/geminiChat.ts`                    | `sendMessageStream(model, …)`                                     | L1387                    |
| `packages/core/src/core/geminiChat.ts`                    | `history.push(userContent)`                                       | L1428                    |
| `packages/core/src/core/geminiChat.ts`                    | `sendPromise` ロック                                              | L1392                    |
| `packages/cli/src/ui/hooks/useGeminiStream.ts`            | `modelOverrideRef`（skill のモデル選択）                          | L376, L2225              |
| `packages/cli/src/ui/hooks/useGeminiStream.ts`            | `processGeminiStreamEvents`                                       | L1365                    |
| `packages/cli/src/ui/hooks/useGeminiStream.ts`            | `sendMessageStream` 呼び出し点                                    | L1841                    |
| `packages/cli/src/ui/hooks/useGeminiStream.ts`            | `handleCompletedTools`                                            | L2038                    |
| `packages/cli/src/ui/hooks/useGeminiStream.ts`            | `submitQuery(ToolResult, …)`                                      | L2355                    |
| `packages/core/src/services/toolUseSummary.ts`            | fast-model サイドクエリ（非ストリーミングの先例）                  | L108                     |
| `packages/core/src/followup/speculation.ts`               | fast-model ストリーミング（forked chat の先例）                   | L224                     |
| `packages/core/src/config/config.ts`                      | `fastModel` + `getFastModel` + `setFastModel`                     | L684, L1987, L2021       |
| `packages/core/src/core/coreToolScheduler.ts`             | `attemptExecutionOfScheduledCalls`                                | L2436                    |
| `packages/core/src/core/coreToolScheduler.ts`             | `runConcurrently` + `partitionToolCalls`                          | L2473                    |
| `packages/cli/src/acp-integration/session/Session.ts`     | `sendMessageStream` 呼び出し点（ACP / IDE パス）                  | L705, L965, L1182, L1423 |
| `packages/core/src/agents/runtime/agent-core.ts`          | Subagent の `sendMessageStream`（D2 の適用外）                    | L614                     |

---

## 6. レビュー検証記録（2026-05-26）

### 6.1 検証方法

設計文書で**宣言のみで定量化されていない**いくつかのデータ品質の前提と収益見積もりに対して、4 つの並行 Explore subagent を起動して読み取り専用のコード調査を実施した。各 subagent は 1 つの事実確認のみを行い、判断や最適化提案は行わない。調査は現在の `main` ブランチ（HEAD: `026f2f768`）に基づく。

| 検証課題                                                                        | 関連セクション                      |
| ------------------------------------------------------------------------------- | ----------------------------------- |
| Q3 すべてのツールの `ToolResult.error` フィールドの記入率                       | §3.2 `hasUnresolvedError` の前提依存 |
| Q4 stream abort 後の `usageMetadata` の実際の取得可能性                         | §5.4 `fast_tokens_consumed` の測定   |
| Q5 「ユーザー追質問 / 明確化要求」のテレメトリポイントの有無                    | §5.2 fast 品質劣化の監視シグナル     |
| Q6 `CONCURRENCY_SAFE_KINDS` ツールの `shouldConfirmExecute` の実際の IO 工数    | §3.4 D4 収益見積もり                 |

### 6.2 発見 1：`hasUnresolvedError` ヒューリスティックに 32% のツール盲点が存在（D2 に影響）

**事実**：エラーパスを持つ 22 のツールのうち、**15 個（68%）が `ToolResult.error` フィールドを規範通りに記入**している（shell、read-file、write-file、edit、grep、glob、ls、web-fetch、mcp-tool、cron-\* などのコア I/O ツール）。**7 個（32%）はエラーを `llmContent` 文字列に詰めているだけ**：`askUserQuestion`、`monitor`、`skill`、`lsp`、`exitPlanMode`、`todoWrite` など。

統一された `createErrorResult` ヘルパーは**存在せず**、各ツールが独立してエラー構造を実装している。

**設計への影響**：

- §3.2 の `hasUnresolvedError` 拒否が `ToolResult.error` フィールドのみをチェックする場合、**これら 7 つのツールの失敗は「primary に切り戻す」をトリガーしない**——次のラウンドも fast model にルーティングされる
- 特に **`skill` ツールの失敗が fast model によって誤って要約される**のは高優先度リスク（本リポジトリには大量の skill 駆動ワークフローがある）
- §3.2 で「shell などは `ToolResult.error` を正しく記入する必要がある（データ品質の前提依存）」と記載しているが、**shell は実際に規範通り**。本当に漏れているのは skill / lsp / todoWrite などである

**修正提案**：「**`llmContent` のみでエラーを伝えている 7 つのツールを `error` フィールドを規範通りに記入するよう改修する**」を D2 のハード前提依存（§3.2 前提条件）として追加する。見積もり約 2 日；`llmContent.match(/^Error:/i)` によるダーティなフォールバックパスは許容しない（誤判定リスクが高い）。

### 6.3 発見 2：`fast_tokens_consumed` 指標の実装コストが過小評価（D2 / §5.3 に影響）

**事実**：

- `turn.ts` の abort パス（L289-291）は直接 `return` しており、**finally ブロックも `stream.return()` 呼び出しもない**——文書 §5.4 が示唆する「abort 前に `stream.return()` でジェネレーターを finally パスに導く」という入口は現在のコードに存在しない
- `geminiChat.ts:processStreamResponse` の `for await` ループは完全に反復した場合のみ turn を記録する（L1286）。abort による中断は最後の usage-only チャンク（通常完全な metadata を持つ）が**直接破棄**されることを意味する
- メインチャットパスには**チャンクレベルのトークン累計フォールバックが一切ない**；サブエージェントレイヤ（`agent.ts:731-744`）にのみ累計があるが再利用不可
- 結論：abort 時の `usageMetadata` は**ゼロ取得**であり、`chars/4` による推定（±20% 誤差）しかない

**設計への影響**：

- §5.4 末尾の「優先 / フォールバック / ラベル」3 層方案の**「優先」パスは現在のコードでは到達不能**——先に `sendMessageStream` ジェネレーター構造に finally を追加する必要があり、工数は約 1 日。設計文書にこのコストは反映されていない
- §5.3 で「1000 セッションあたりのトークンコスト <70%」を Phase 3 の目標としているが、指標自体の誤差が ±20% であれば、**「70%」と「82%」は測定ノイズの範囲内**

**修正提案**：

- §5.3 を**トレンド指標**に書き直す。release ゲートとして使用しない；代わりに「決定ログの `fallback_triggered` 率と `fast_tokens_consumed` の同方向トレンド」のデュアル指標で判断する
- §5.4 に追記：`fast_tokens_consumed` の実装には先に turn.ts の abort パスに finally + `stream.return()` を追加する必要がある。§3.2 の工数に補足（+1 日）

### 6.4 発見 3：`user_prompt_classification` と「ユーザー追質問」のテレメトリは新規作成が必要（D2 / §5.2 に影響）

**事実**：

- `packages/core/src/followup/` には `speculation.ts` / `suggestionGenerator.ts` / `followupState.ts` が存在するが、そのテレメトリ（`PromptSuggestionEvent`）は「**システムが提案した候補が採用/無視された**」を記録するものであり、「ユーザーが能動的に追質問した」ではない
- `ChatRecordingService` はユーザーメッセージを保存するが**分類ラベルは付与しない**
- リポジトリ全体で grep しても `user_prompt_classification`、中英文の追質問パターンマッチ、`clarif*` / `intentDetect` 系の機構は**存在しない**

**設計への影響**：

- §5.4 の決定ログスキーマの `user_prompt_classification: 'query' | 'action' | 'analysis'` フィールドは**データソースがない**——既存の `PromptSuggestionEvent` から推導できず、`ChatRecord` からも読み出せない
- §5.2 の「ユーザーが『もっと詳しく』と追質問する頻度」監視シグナルも同様。**最も近い既存のアンカー `followupState.onOutcome` は再利用不可**

**修正提案**：

- §3.2 前提条件に「最小限のユーザー入力分類器の実装」を追加（中英文パターンマッチ、約 3 日）。そうしないと §5.4 決定ログの `user_prompt_classification` と `requestImpliesFurtherAction` のデータが不足する
- または**受け入れる**：Phase 3a ドッグフード段階ではこれら 2 つのシグナルなしで進め、`fallback_triggered` 率のみで品質劣化を監視する——コストは低いがリスクは高い

### 6.5 発見 4：D4 設計に内在する矛盾——allowlist と収益帰属の不整合（D4 / §3.4 に影響）

**事実**：

- `Kind.Read`（read_file）、`Kind.Search`（glob / grep）、`Kind.Fetch`（web_fetch）の 3 種のツールの `shouldConfirmExecute` / `getConfirmationDetails` は、**大半が `BaseToolInvocation` のデフォルト実装を継承し、IO はゼロ**（read_file / glob / grep は完全に override なし。web_fetch は URL ホスト名のパースを行う 5〜10 行のコードのみ）
- 実際に IO があるのは `Edit` / `WriteFile`（`calculateEdit` + `readTextFile` + `Diff.createPatch`、典型的に約 20ms）だが、§3.4 方案 A では TOCTOU を避けるために allowlist から除外している
- **結果**：allowlist に残った 3 種のツールでは、prevalidate と prevalidate なしでほぼ同じ工数——allowlist が実際に遮断しているのは「唯一 IO を節約できる Edit」であり、「元々ゼロコストのツール」が残っている

**設計への影響**：

- §3.4 の「IO の事前検証」という叙述は**成立しない**：50〜100ms の収益の真の源泉は **「ストリーム完了 → バッチスケジュール」というスケジューリング待機の排除**であり、ツール側の IO とはほぼ無関係
- 収益帰属の誤りは 2 つの問題を引き起こす：
  1. **Allowlist はより広くできる**——べき等な prevalidate のツールであればよく、`CONCURRENCY_SAFE_KINDS` に縛る必要はない
  2. **5〜7 日の投資対効果が自己矛盾**——真の収益がスケジューリングモデルの変更のみの ~50ms であり、Edit が allowlist 外であれば、投資の ROI は設計文書が示すより低い

**修正提案**：§3.4 の収益帰属を書き直す——

- 2 部分に分割：(a) スケジューリングモデル変更でストリーム待機を省いた ~50ms、(b) ツール側 IO の事前実行で省ける工数 ~0ms（allowlist 内）/ ~20ms（Edit を allowlist に含める場合）
- §4.1 総合評価表で D4 の RT 収益を「50〜200ms」から「30〜80ms（方案 A、主にスケジューリングモデル）/ 100〜200ms（方案 B、Edit 含む）」に変更
- §4.2 ロードマップで D4 の優先度をさらに引き下げ——純粋なスケジューリングモデルの改修は独立して実施可能であり、prevalidate の概念に強引に結びつける必要はない

### 6.6 ロードマップへの合算影響

| セクション                    | 元の見積もり | 検証後の見積もり | 増加の原因                                                                                     |
| ----------------------------- | ------------ | ---------------- | ---------------------------------------------------------------------------------------------- |
| D2 §3.2 工数（§4.1 内訳表）  | 9 日         | **14〜16 日**    | +2 日（発見 1 の前置ツール改修）+1 日（発見 2 の turn.ts finally 改修）+3 日（発見 3 の入力分類器、ハードパスの場合） |
| D4 §3.4 総合評価              | 5〜7 日      | 5〜7 日（変更なし） | 工数は変わらないが、**RT 収益帰属を「ツール側 IO」から「スケジューリングモデル」に変更**。投資 ROI は下方修正 |
| Phase 3 総所要時間（§4.2）    | 約 3 週間    | **約 4〜5 週間** | D2 工数の上方修正＋前置ツール改修 PR の review サイクル                                        |

**元のロードマップへの修正提案**：

1. **D1（P0）と直後に続く D3 を維持**——今回の検証でコアの前提は揺らいでいない。ROI 判断は変わらない
2. **D2 の開始条件を厳格化**——発見 1/2/3 の前置作業（合計約 6 日）を「D2 開始ゲート」とし、完了しないと §3.2 の前置実験に進まない
3. **D4 の優先度を再評価**——真の収益がスケジューリングモデル変更であるなら、(a) 30〜80ms を受け入れて D4 を P3 に格下げするか、(b) 方案 B（Edit + mtime/hash）で 100〜200ms を取り戻すが追加 5〜7 日が必要
4. **§1.2 のシングルサンプルベースラインは変更しない**——ただし §5.1 の P95 欄は D1 が導入され、≥3 種のシナリオのベースラインが取得されるまで具体的な数字を記載しない

### 6.7 検証未カバーの追加課題

以下の追加課題は主観的判断または作者の意図の問題であり、今回 subagent では処理せず、後続の design review に委ねる：

- D2 の実施順序を D3 より後にすべきか（主観的な順序）
- D1/D3 を Phase 1 にまとめて実施すべきか（実施戦略）
- §3.2 の `needsCrossResultReasoning` 閾値 ≥3 が §1.2 のベースラインシナリオに対して逆方向過適合していないか（作者の意図）
- §5.7 重要コード位置表の行番号アンカーをシンボルアンカーに変更すべきか（文書の安定性）

---

## 7. 浮遊オイル評価と次のステップ（2026-05-26 第二次レビュー）

### 7.1 本次再評価のトリガーとなった事実

§6 の検証後、**ROI 判断を変える 2 つの事実**が発見された：

1. **DashScope の `cache_control` がすでに実装済み**（`packages/core/src/core/openaiContentGenerator/provider/dashscope.ts:172-181`）
   - ストリーミングリクエストに `system + 最後の message + 最後の tool definition` をマーク
   - ヒットデータ `cached_tokens` はすでに `usageMetadata.cachedContentTokenCount` に収集されている（`converter.ts:1124-1149`）
   - これは prefix cache 機構：Round N+1 が自動的に Round N の書き込みプレフィックスにヒットする
   - **summary ラウンドはプレフィックスのヒット率が最も高いラウンドに相当する**

2. **system prompt はすでに安定状態**（`prompts.ts` の監査結果）
   - cwd / timestamp / git status / ファイルリスト / LSP 状態など「turn ごとに変わる」ハードな問題がない
   - `process.cwd()` は `isGitRepository()` のスイッチにのみ使用され、prompt の内容には書き込まれない
   - 唯一の動的ポイント：`save_memory` ツールのトリガー / `/model` の切り替え / MCP の動的ロード（いずれもイベント性で低頻度）

### 7.2 これら 2 つの事実が D2 の ROI 判断を変えた

§3.2 の文書は「fast model が primary より約 2 秒速い」と仮定しており、比較対象は **primary uncached vs fast uncached** だった。

しかし実際の運用では primary は **cached**（summary ラウンドはキャッシュが最も効く）。よって正しい比較は：

> primary cached vs fast uncached

| ルーティング                          | 推定レイテンシ  | 備考                        |
| ------------------------------------- | --------------- | --------------------------- |
| primary が 80% のプレフィックスキャッシュにヒット | ~1.8〜2.2s | summary ラウンドの現実の実際の表現 |
| fast がキャッシュにミス（クロスモデルは共有されない） | ~1.5〜2s | D2 切り替え後の実際の表現   |

**正味の差：数百ミリ秒、場合によっては fast の方が遅い可能性もある**。14〜16 日の工数コスト＋品質リスク＋フォールバックの浪費を重ねると、**D2 の正味収益はゼロに近いかマイナス**。

§3.2 の前提条件に**必ず追加する**：ベースライン測定では primary **cached** と fast **uncached** を比較しなければならず、`T_primary_cached < T_fast_uncached × 1.5` の場合は D2 を有効化すべきでない。

### 7.3 候補リスト（浮遊オイル度順に再ソート）

**真の浮遊オイル（すぐに着手可能、<1 日の投資、極低リスク、確実な収益）**：

| 項目                            | 投資     | 収益                                | 操作箇所                                                                     |
| ------------------------------- | -------- | ----------------------------------- | ---------------------------------------------------------------------------- |
| 簡潔な返答指示                  | 30 分    | ~2s/summary ラウンド（出力トークン半減） | `prompts.ts` の Final Reminder セクションに 1 文追加                       |
| キャッシュヒット率テレメトリの公開 | 0.5 日 | 0s 直接、後続の意思決定の **enabler** | `cachedContentTokenCount` は収集済みだが公開されていない；`save_memory` 後の個別マーキングも追加 |

**ニアフローティング（データ取得後に判断、0.5〜1 日の投資）**：

| 項目                            | 投資                  | 収益                                   | 意思決定の前提                                                                    |
| ------------------------------- | --------------------- | -------------------------------------- | --------------------------------------------------------------------------------- |
| summary ラウンドの `tool_choice='none'` | 0.5〜1 日     | 0.3〜1s（sampling でツール呼び出しトークンをスキップ） | 「summary ラウンドである」の判定ロジックが必要。誤判定リスクは低い          |
| summary ラウンドの thinking 無効化 | 1 日               | 0.5〜2s                                | thinking を有効にしているモデル（qwen3.5-plus、glm-4.7、kimi-k2.5 など）にのみ意味がある |
| UI レンダリングレイヤのチャンクバッチング | 0.5 日調査 + 0.5 日実装 | 要検証                            | 仮説：長い summary の `useGeminiStream` のトークンレンダリング累積オーバーヘッドが無視できない |

**調査待ち（大きな成果の可能性）**：

| 項目                                   | 調査投資                   | 潜在的な収益          | 重要な未知点                                                                                       |
| -------------------------------------- | -------------------------- | --------------------- | -------------------------------------------------------------------------------------------------- |
| ~~DashScope の `scope: 'global'` 対応~~ | ~~0.5 日文書 + 0.5 日 A/B~~ | ~~クロスセッションヒット~~ | **調査済み、結論 (c) 不可。**（§7.4 発見 B の調査結果参照）。この行は意思決定記録として保持し、再調査を再開しないこと |

**中程度の改修（浮遊オイルではなく、個別に評価）**：

| 項目                                  | 投資             | リスク | 収益             |
| ------------------------------------- | ---------------- | ------ | ---------------- |
| D1 `skipLlmRound`（終態クエリシナリオ） | 2〜3 日        | 中     | 3〜4s/終態ラウンド |
| summary ラウンドのツール結果削減（D5 サブセット） | 2 日     | 中     | 1〜2s            |
| D3 `Summarizing` 状態                 | 3〜5 日          | 中     | 体感改善 3s      |
| system prompt のスリム化              | 2〜3 日（A/B テスト含む） | 中  | 0.5〜1s          |

**廃棄された方向（以降実施しない）**：

| 項目                                        | 廃棄理由                                               |
| ------------------------------------------- | ------------------------------------------------------ |
| D2 fast model ルーティング                  | DashScope キャッシュで相殺。正味収益はゼロに近いかマイナス |
| D4 prevalidate                              | 収益帰属が誤り（真の収益はスケジューリングモデル由来の ~50ms のみ）。5〜7 日の投資に見合わない |
| system prompt の安定化                      | すでに安定状態。実施不要                               |
| ストリームの早期終端（締めくくりの文を早期 abort） | 誤判定リスクが高く、ユーザーが回答を切り取られたと感じる |

### 7.4 展開に値する 3 つの新発見

#### 発見 A：`tool_choice='none'` の実際のメカニズム

OpenAI / DashScope API での `tool_choice='none'` は「ツール呼び出しを禁止する」だけではない——モデルの sampling 段階で **`<tool_call>` の特殊トークンの確率割り当てが完全にスキップ**され、デコーダが直接自然言語生成パスに進む。収益は「1〜2 回の retry の節約」ではなく、**sampling 自体が高速化**することにある。

#### 発見 B：`scope: 'global'` がリポジトリに既存の Anthropic 先例あり

`packages/core/src/core/anthropicContentGenerator/converter.test.ts:85, 1543` に `cache_control: { type: 'ephemeral', scope: 'global' }` の使用例がある。しかし `provider/dashscope.ts:288` では cache_control のマーキング時に **scope を渡していない**：

```typescript
cache_control: { type: 'ephemeral' },   // scope なし
```

DashScope サーバー側が `scope: 'global'` を認識する場合：

- system + tools がグローバルキャッシュにアップグレード（TTL が ephemeral の 5 分より大幅に長い）
- **クロスセッションヒット**が可能になり、起動レイテンシも低下
- この 1 点だけで D2 の全仮定収益を超える可能性がある

##### 調査結果（2026-05-26、結論：(c) 不可、本ラインをクローズ）

阿里云百炼公式ドキュメント `help.aliyun.com/zh/model-studio/context-cache` を確認して得た事実：

| 課題                     | 結論                                                                                                                                                                                                 | 証拠                                                   |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `scope` フィールドの対応  | **非対応**。`type: 'ephemeral'` のみ認識。`scope`/`persistent`/`global` はいずれもサイレントに無視される                                                                                              | 公式ドキュメント：「`type` を `ephemeral` に設定することのみをサポートする」 |
| ephemeral の実際の TTL    | **5 分のスライディングウィンドウ**（ヒット時にリセット）                                                                                                                                              | 百炼ドキュメントで明記                                  |
| 長い TTL / グローバルメカニズム | **パブリッククラウド API には一切存在しない**。`persistent` type 値なし、個別のアップロード API なし、`prompt_cache_key` なし；唯一の「グローバル永続」製品は PAI グローバルコンテキストキャッシュ（セルフデプロイ + vLLM + Lingjun + 共有 Redis）であり、DashScope API とは無関係 | PAI ドキュメント |
| クロスセッション共有      | 同アカウント + 同モデル + コンテンツ一致 → すでにヒット（これは `ephemeral` がすでに実施していること）；異なるアカウント間での共有は絶対にない                                                          | 百炼ドキュメント                                        |
| 料金                      | cache write 125%、明示的 cache read 10%、**暗黙的 cache read 20%**（`cache_control` マークなしでも暗黙的な 20% 割引が適用）                                                                            | 百炼料金ドキュメント                                    |
| 最小キャッシュ可能プロンプト | **1024 トークン**                                                                                                                                                                                   | 百炼ドキュメント                                        |
| モデル対応（明示的キャッシュ） | qwen3.7-max / qwen3.6-plus / qwen3.5-plus / qwen3-coder-plus / qwen3-vl-plus / deepseek-v3.2 / kimi-k2.5 / glm-5.1 がリストに明記。**qwen3.6-plus と qwen3.7-max はいずれも 90% の明示的キャッシュ割引を受ける** | 百炼モデルリスト（2026-05-26 再確認） |

**副次的な発見の連鎖的な意義**：

1. **TTL スライディングウィンドウ**は agent loop にとって好ましい——ループ内の連続呼び出しの間隔は通常 <30 秒。**キャッシュは常に新鮮で 5 分で失効しない**
2. **暗黙的キャッシュの 20% 割引**は無料の恩恵——`cache_control` なしでも取得できる；ただし精細な制御には明示的なマークが必要
3. ~~`qwen3.6-plus` が明示的リストにない~~——**訂正（2026-05-26）**：再確認の結果、qwen3.6-plus は**明示的キャッシュリストに確かに存在**し、90% 割引を受ける。前回のレポートのこの箇所は誤りで、本節の最初のテーブルで訂正済み
4. **`dashscope.ts:288` の現在のアプローチはすでに DashScope パブリッククラウド API の能力上限**——これ以上絞り出す余地はない

**§7.2 の D2 判断に対する連鎖的な強化**：

TTL スライディングウィンドウは、agent loop 内の summary ラウンドが **primary のキャッシュをほぼ 100% ヒットする**ことを意味する（直前の数ラウンドで 5 分以内にヒットしているため）。D2 が fast model に切り替えると、累積されたキャッシュ書き込みチェーンが崩れるだけでなく、**summary ラウンドが「ほぼ 100% ヒット」から「完全ミス」に退化する**——正味収益の判断は §7.2 の元の仮定よりも明確にマイナスとなる。

#### 発見 C：UI レンダリングレイヤは見落とされた盲点

§1.2 のベースラインは「フレームワークオーバーヘッド」を 0.3s（3%）と記載しているが、これは概算である。Ink 7 + React 19.2 は各チャンクで setState → re-render をトリガーし、長い summary では累積で 200〜500ms になる可能性がある。`useGeminiStream` がトークンストリームをどう処理しているか、`requestAnimationFrame` / `useDeferredValue` によるチャンク合算があるかどうかを確認する必要がある。

### 7.5 データ待ちチェックポイント——データが得られたらどの意思決定を見直すか

本節はこの**文書の活動的なエントリポイント**：以降、何らかの測定データが得られたら、下の表を参照してどの意思決定を確認するかを判断すること。

#### チェックポイント 1：キャッシュヒット率データが出てから

**トリガー条件**：浮遊オイル「キャッシュヒット率テレメトリの公開」が本番稼働から ≥3 日経過し、決定ログに `cached_tokens` / `prompt_tokens` の分布が含まれている。

**確認すべきデータ**：

- 全体のヒット率（cached / prompt）の P50、P90 分布
- ラウンド別：Round 1 / Round 2 / Round 3（summary）それぞれのヒット率
- `save_memory` トリガー後の次ラウンドのヒット率（ほぼ 0 のはず）
- `/model` 切り替え後の次ラウンドのヒット率（ほぼ 0 のはず）

**意思決定パス**：

| 全体ヒット率 | 意味                          | 行動                                                                        |
| ------------ | ----------------------------- | --------------------------------------------------------------------------- |
| > 70%        | 現状がほぼ理論上限に近い      | #1 簡潔指示＋発見 B の調査のみ実施；その他の浮遊オイルは必要に応じて        |
| 40〜70%      | 改善余地はあるが原因不明      | ラウンド別ヒット率を分析し、どのセグメントがミスしているかを特定             |
| < 40%        | 動的なポイントがキャッシュを壊している | system prompt / userMemory のトリガー頻度を再監査；`save_memory` が想定以上に頻繁な可能性 |

#### チェックポイント 2：DashScope の `scope: 'global'` 文書調査結果 ✅ 完了（2026-05-26）

**結果**：**完全に非対応**。詳細は §7.4 発見 B の「調査結果」セクション参照。

**実行済みの行動**：現状を受け入れ、本項をスキップ。`dashscope.ts:288` は現在の `ephemeral` マーキングを維持し、改修不要。

**以降この調査を再開しないこと**——DashScope が公式に新しい永続化メカニズムを発表しない限り。

#### チェックポイント 3：UI レンダリングレイヤ調査結果

**トリガー条件**：発見 C の調査完了（`useGeminiStream` のトークンフロー処理 + Ink/React DevTools での実測）。

**意思決定パス**：

| 結果                                         | 行動                                                 |
| -------------------------------------------- | ---------------------------------------------------- |
| 長い summary stream のレンダリング累積 > 200ms | バッチング（`useDeferredValue` または独自スロットリング）に変更 |
| レンダリングオーバーヘッド < 100ms            | 本ラインをクローズ                                   |

#### チェックポイント 4：「真の浮遊オイル」完了後の第二次ベースライン測定

**トリガー条件**：#1 簡潔指示＋チェックポイント 1/2/3 の意思決定完了から ≥1 週間。

**確認すべきデータ**：

- エンドツーエンド RT P50 と §1.2 のシングルサンプルベースライン（13.4s）との比較
- summary ラウンド単体の P50 / P95
- ユーザー追質問率（浮遊オイル A でユーザー入力分類も実施した場合）

**意思決定パス**：

| 累積節約時間                     | 行動                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------- |
| > 4s（エンドツーエンド P50 が 9.6s 以下） | D1 `skipLlmRound` の評価（さらに 3〜4s/終態ラウンドの節約）            |
| 2〜4s                            | 現状を受け入れ、D3 の体感改善が実施に値するか評価                               |
| < 2s                             | 再評価：浮遊オイル自体が過大評価されていたか、未特定のボトルネック（ネットワーク RTT、プロバイダ側のレイテンシ）があるか |

### 7.6 §3 各方向の最終判断

§6 検証＋本節の ROI 再ソートに基づく：

| 方向                      | §3 元の優先度 | 本節の判断                                         | 理由                                               |
| ------------------------- | ------------- | -------------------------------------------------- | -------------------------------------------------- |
| D1 ツール後置ディレクティブ | P0           | **P0 維持**、ただし浮遊オイル完了後に評価           | ROI は依然として良好。ただし「すぐ実施」ではない——より安価な浮遊オイルを先に取る |
| D2 summary fast ルーティング | P1          | **Defer / Won't Fix**                              | DashScope キャッシュで相殺。14〜16 日の投資でほぼゼロの収益 |
| D3 表示解耦                | P1            | **オプションとして維持**。チェックポイント 4 のデータを確認 | 体感改善は確実だが絶対 RT は変わらない。ユーザー行動に依存 |
| D4 ストリーム先行スケジューリング | P2       | **Defer**                                          | 収益帰属が誤り。真の ~50ms は 5〜7 日の価値なし    |

### 7.7 推奨実施順序

**Day 1**（1 人で 1 日で完了可能）：

- ✅ `prompts.ts` に簡潔な返答指示を追加（30 分）
- ✅ `cachedContentTokenCount` を telemetry に公開＋`save_memory` / `/model` 切り替え時のマーキング（0.5 日）
- ✅ 発見 B の調査開始：DashScope の `scope: 'global'` のドキュメント確認＋既存の Anthropic 使用例との対照（0.5 日）

**Day 2〜3**：

- 最初のキャッシュヒット率データを収集
- 発見 C の調査開始：`useGeminiStream` の React レンダリングパス
- チェックポイント 2 の結果に基づいて `scope: 'global'` 改修を実施するか判断

**Week 1 末**：

- チェックポイント 1 のデータ意思決定（分布を確認）
- `tool_choice='none'` / thinking 無効化を実施するか判断（ヒット率データに基づく）

**Week 2〜3**：

- チェックポイント 4 の第二次ベースライン測定
- D1 を開始するか判断（最大の非浮遊オイル項目、3〜4s/終態ラウンド）

**永遠に実施しない**：D2 / D4 / system prompt の安定化。

### 7.8 `prompts.ts` の動的コンテンツ監査（2026-05-27）

§7.1 で「system prompt が安定状態にある」と結論付けた際は大まかな grep のみ実施した。本節は `packages/core/src/core/prompts.ts`（1169 行）の体系的な監査であり、後続のキャッシュヒット率分析と浮遊オイル意思決定の根拠となる一覧を提供する。

**監査方法**：すべての `${...}` 補間表現、IIFE、`process.*` / `new Date` / `Date.now` / `Math.random` / `fs.*` 呼び出しを列挙し、それぞれについて「同一セッション内で変化するか」を判断する。

#### 完全に存在しない（よく疑われるハードな問題）

| 候補                               | コードの事実                                                                           |
| ---------------------------------- | -------------------------------------------------------------------------------------- |
| `Date.now()` / `new Date()`        | 全文で**ゼロ件**（`rg` でマッチなし）                                                  |
| `Math.random()`                    | **ゼロ件**                                                                             |
| `process.cwd()` の値を prompt に書き込む | L366 の `if (isGitRepository(process.cwd())) { ... }` のみ。**値は文字列に書き込まれない**、スイッチとしてのみ使用 |
| git status / git branch のサブプロセス呼び出し | **ゼロ件**。git セクションは静的なガイドテキスト                         |
| 現在のファイルリスト / プロジェクト構造の注入 | **ゼロ件**                                                                    |
| LSP の状態 / エラー数              | **ゼロ件**                                                                             |
| ユーザー入力履歴                   | **ゼロ件**（history は messages で管理され、system にない）                            |

#### 起動時に 1 回、セッション内では変化しない

| 位置     | 内容                                                                                                          | 変化するタイミング         |
| -------- | ------------------------------------------------------------------------------------------------------------- | -------------------------- |
| L190     | `process.env['QWEN_SYSTEM_MD']` が basePrompt のソースを決定（デフォルト vs ユーザーの system.md）            | プロセス内では変化しない    |
| L342-343 | `process.env['SANDBOX']` が sandbox セクションのバージョンを決定（Seatbelt / Sandbox / Outside）              | プロセス内では変化しない    |
| L366     | `isGitRepository(process.cwd())` が git セクションを挿入するかどうかを決定                                    | cwd は通常セッション内で変化しない |
| L871     | `process.env['QWEN_CODE_TOOL_CALL_STYLE']` がツール呼び出しスタイルを決定（qwen-coder / qwen-vl / general）   | プロセス内では変化しない    |

#### イベントトリガー（低頻度）

| パラメータ                                              | トリガー条件                                       | 頻度見積もり           |
| ------------------------------------------------------- | -------------------------------------------------- | ---------------------- |
| `userMemory`（`getCoreSystemPrompt` の第 1 引数）       | `save_memory` ツール / `/memory refresh` / 拡張ロード | 0〜3 回/セッション   |
| `model` 名（`getToolCallExamples` でどのブランチを使うかに影響） | `/model` 切り替え                          | まれ                   |
| `appendInstruction`                                     | 設定項目、セッション内でほぼ変化しない             | ほぼなし               |
| `deferredTools`（`buildDeferredToolsSection`）           | MCP ツールの動的ロード                             | セッション起動時が多い |

#### 隠れた小さな落とし穴

L207-209：`QWEN_SYSTEM_MD` env が設定されている場合、`getCoreSystemPrompt` が呼ばれるたびに `fs.readFileSync(systemMdPath)` が**毎回**実行される：

```typescript
const basePrompt = systemMdEnabled
  ? fs.readFileSync(systemMdPath, 'utf8')
  : `...`;
```

- ファイルが変化しない場合、内容は安定しているためキャッシュヒットには影響しない
- ただし LLM 呼び出しのたびに 1 回の同期 IO が発生する（デフォルトは `.qwen/system.md`；ネットワークマウントのファイルの場合はより遅い）
- 本節の「キャッシュ親和性」の結論には影響しない。既知のパフォーマンス上の小さな落とし穴として記録のみ

#### 連鎖的な結論

1. **安定状態のセッションでは、system prompt は毎回バイト単位で一致した出力をする** → DashScope の ephemeral キャッシュキー（コンテンツハッシュに基づく）がセクション全体で安定 → **system セクションのキャッシュヒット率はほぼ 100%**
2. キャッシュを壊す唯一のイベントは `save_memory`——コアな機能であり、キャッシュのために妥協できない
3. **浮遊オイル #1（簡潔な返答指示）のコスト分析**：Final Reminder セクション（L389-390）に指示を追加 → system prompt のコンテンツが一度変化 → **最初のリクエストはキャッシュミス（一度限りのウォームアップコスト）、その後のすべてのリクエストは引き続きヒット**
4. **§7 の「system prompt の安定化は廃棄」という判断が正式な証拠に裏付けられた**——実施する必要がないだけでなく、「理論的に実施することでキャッシュミス率をさらに低下させられる」すら成立しない。なぜなら元々 ≈ 0 だから
5. 本監査は後続の関連議論の引用ベースラインとして使用できる。重複した grep を避けるため；`prompts.ts` に大きな変更があった場合は本節を同時に更新すること
