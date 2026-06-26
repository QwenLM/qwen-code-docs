# Qwen Code Agent Loop RT 最適化技術案

## 1. 背景と問題定義

### 1.1 現状

Qwen Code の Agent Loop は厳密な直列モデルである：

```
User Prompt → [LLM 決定] → Tool Execution → [LLM 決定] → Tool Execution → ... → [LLM 応答] → Idle
               ~3-4s          ~Xms-Ns          ~3-4s          ~Xms-Ns            ~3-4s
```

毎回の LLM 呼び出し（ネットワーク RTT ＋モデル推論）には約 3～4 秒かかり、エンドツーエンド RT の主要なコストとなっている。

### 1.2 実測データ

テストシナリオ：「自分のワークスペースは？」（3 ラウンドの agent loop、2 回のツール呼び出し、単一サンプル）

| フェーズ                    | 所要時間   | 割合 |
| --------------------------- | ---------- | ---- |
| LLM Round 1（skill 呼び出し決定） | 3.8s      | 28%  |
| Skill 実行                  | 1ms       | <1%  |
| LLM Round 2（shell 呼び出し決定） | 3.0s      | 22%  |
| Shell 実行                  | 2.5s      | 19%  |
| LLM Round 3（テキスト要約）     | 3.8s      | 28%  |
| フレームワークオーバーヘッド（状態同期、レンダリング） | 0.3s      | 3%   |
| **合計**                    | **13.4s** | 100% |

**結論**：LLM 呼び出しが 78%、ツール実行が 19%、フレームワークが 3% を占める。最適化の核心は **LLM 呼び出し回数の削減** と **1 回あたりの LLM 呼び出しレイテンシの低減** である。

> 注：単一サンプル、単一シナリオ。19% のツール実行は shell の遅い呼び出しが支配的であり、read-heavy シナリオではツール実行は 5% 未満に低下する可能性がある。本方式の導入前に、3 種類以上のシナリオ（書き込み操作、ツール間推論、エラーリカバリ）のベースラインを補完する必要がある。

### 1.3 現在のアーキテクチャにおける主要な制約

| 制約                      | コード位置                                                                                | 説明                                                                               |
| ------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| ツール結果に後続制御がない  | `tools.ts` `ToolResult` インターフェース (L422)                                            | `llmContent`/`returnDisplay`/`error` のみで、"LLM をスキップ" を表現できない        |
| 結果が無条件に LLM に戻される | `useGeminiStream.ts` `handleCompletedTools` (L2038) → `submitQuery(ToolResult, …)` (L2355) | gemini-initiated なツール結果はすべて LLM に戻される                                    |
| Stream 完了後にのみスケジュール | `useGeminiStream.ts` `processGeminiStreamEvents` (L1365)                                   | stream ループ終了後に `scheduleToolCalls` が実行され、増分スケジューリングはない              |
| モデル層の選択に戦略層がない  | `client.ts` `modelOverride ?? getModel()` (L1305, L1598)                                   | インフラは `turn.run(model, …)` (L1707) まで貫通しているが、呼び出し側は skill が明示的に指定した場合のみ使用 |

### 1.4 既に整備済みのインフラ（本方式で広く再利用）

| 能力                                           | 位置                                                   | 現状                                                                   |
| ---------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------- |
| `fastModel` 設定 + `/model --fast <id>`        | `config.ts:684`, `1987`, `2021`                        | 準備完了                                                               |
| `SendMessageOptions.modelOverride`             | `client.ts:142` → `1598` → `turn.run`                  | エンドツーエンドで `geminiChat.sendMessageStream(model, …)` まで貫通    |
| フック層 `modelOverrideRef`（skill のモデル選択を保持） | `useGeminiStream.ts:376`, `2225`, `1841`               | 貫通済み                                                               |
| fast-model **非ストリーミング** side query の先行例 | `services/toolUseSummary.ts:108`（via `runSideQuery`） | 本番投入済み、fast モデル設定の健全性を証明；ただし**非ストリーミングパス** |
| fast-model **ストリーミング** 先行例           | `followup/speculation.ts:224`                          | 本番投入済み、ただし**forked chat**（`createForkedChat`）を使用し、メインチャットとは分離 |

**主要なギャップ**：**メインチャット上で fast model を使ってストリーミングを実行する本番コードは存在しない**。本方式の D2 が最初のケースとなるため、事前に検証実験を行う必要がある（詳細は §3.2 前提条件を参照）。

---

## 2. 設計原則

1. **汎用性**：方式は特定の tool/skill に依存しない
2. **後方互換性**：既存のツールは修正なしで引き続き動作する
3. **段階的導入 + 明示的なシグナル**：戦略はデフォルトで conservative であり、ツール作成者が明示的なフィールドで opt-in する
4. **ロールバック可能**：すべての最適化は feature flag で制御可能；ユーザーレベルで強制無効化できる
5. **正直なトレードオフ**：品質リスク、コストリスク、適用範囲を明示的に示す

---

## 3. 最適化方式

### 3.1 方向性一：ツール後続実行指示（ToolResult Post-Execution Directive）

#### 問題点

現在の `ToolResult` は「次に何をすべきか」に関する情報を一切含まない。ツール結果が自己説明的かどうかに関わらず、無条件に LLM ラウンドがトリガーされる。

#### 設計

`ToolResult` インターフェースを拡張（`packages/core/src/tools/tools.ts` L422）：

```typescript
export interface ToolResult {
  llmContent: PartListUnion;
  returnDisplay: ToolResultDisplay;
  error?: { message: string; type?: ToolErrorType };

  // 新規追加：後続実行指示
  postExecution?: {
    /**
     * ツール結果を LLM に戻さず、最終応答としてユーザーに直接表示する。
     * 結果が完全に自己完結しており、モデルによる再解釈が不要な場合に使用する。
     * ToolResult のローカルプロパティ。
     */
    skipLlmRound?: boolean;

    /**
     * ツール結果が「自己完結しており、ユーザーに直接表示可能」——つまり
     * `returnDisplay` が既にユーザーが期待する最終形態であり、
     * モデルによる加工が不要であることを示す。
     * ToolResult のローカルプロパティであり、「次のラウンドが要約かどうか」を**予測しない**。
     * 方向性三（表示の分離）と連携：true → Summarizing 状態に入り、ユーザー入力を受け付ける。
     */
    resultIsTerminal?: boolean;
  };
}
```

> **設計修正**：初期バージョンでは単一の `selfExplanatory` フィールドに「ツール成果物の属性」と「対話フローの予測シグナル」の二つの役割を持たせていたが、これらは必ずしも一致しない（例：ユーザープロンプトが「X を読んで Y を修正して」の場合、read_file の出力は自己完結しているが、次のラウンドが要約であることは明らかにない）。**予測シグナルは対話フローのグローバル属性**であり、ツールフィールドで表現すべきではない——D2 では完全に対話フローのヒューリスティックを使用する（§3.2 参照）。

#### 動作変更

`handleCompletedTools` に新しい判定を追加：

```
ツールバッチ完了
  → バッチ内のすべてのツールの postExecution.skipLlmRound をチェック
  → すべて true か？
    → YES: markToolsAsSubmitted を実行、submitQuery を呼ばずに直接 idle に遷移
    → NO: 既存の動作を維持 (submitQuery)
```

**重要な制約**：`skipLlmRound` は**現在のバッチのすべてのツールが skip を宣言した場合にのみ**有効になる。混合バッチでは引き続き LLM に戻される。

#### 歴史的不変条件

LLM スキップ後の履歴は次のようになる：`user → function_call → function_response → <assistant なし>`

- `repairOrphanedToolUseTurnsInHistory`（session-load 時に呼び出される）がこの形式を許容するか確認する
- auto-compaction が assistant テキストがない場合の動作を確認する
- PR #4176 で tool_use↔tool_result の不変条件が修正されたばかりなので、導入前に「skip 後の次の user message」での alternation をカバーする単体テストを追加する
- Qwen / OpenAI スタイルの API は許容する；Anthropic は厳密な alternation を要求する —— 今後 Anthropic 直接接続をサポートする場合はフォールバックが必要（履歴に空の assistant テキストを注入する）

> **統一修正ポイント**：ここおよび §3.3（D3 の中途中断 Summarizing）は**同じ歴史的不変条件を破壊する**。修正方法は二択（空の assistant を注入する / Qwen の許容に依存する）であり、両方の方向で同じ選択を使用する必要がある。

#### シグナルエコシステム（Phase 2 の作業）

| ツール                                | `skipLlmRound`       | `resultIsTerminal` | 備考                                                            |
| ------------------------------------- | -------------------- | ------------------ | --------------------------------------------------------------- |
| `read_file`                           | query-only シナリオと連携 | true               | ファイル内容がそのまま回答                                      |
| `cat`（shell 経由）                   | シナリオ次第            | true               | read_file と同じ                                                |
| `grep` / `glob` / `ls`                | false                | **false（デフォルト）** | 結果はモデルによる選択/並べ替え/要約が必要なことが多い；skill 層が「純粋なクエリ」シナリオだとわかっている場合に明示的に true |
| `git status` / `git log`（shell 経由） | false                | true               | 出力は既にフォーマット済み                                      |
| Skill ツール                          | 各 skill が判断        | 各 skill が判断     | クエリ系 skill は true になる傾向あり                                |
| MCP ツール                            | デフォルト false       | デフォルト false    | allowlist によって明示的に opt-in                               |

サードパーティ / MCP ツールは信頼できないため、デフォルトではマークしない；`config.toolPostExecAllowlist` で明示的に有効化する。

> `grep/glob/ls` がデフォルト false なのは慎重な選択：モデルによる要約/並べ替えが必要なシナリオで D2/D3 が誤判定するのを防ぐため。

#### 適用可能と適用不可

- **適用可能**：終了状態のクエリ（read/cat/print タイプ）、自己完結した結果（skill が既にフォーマット済みの出力）
- **適用不可**：複数ステップの中間ステップ、書き込み操作の確認、解釈が必要な複雑なログ

#### リスクと緩和策

| リスク                                       | 深刻度 | 緩和策                                       |
| -------------------------------------------- | ------ | -------------------------------------------- |
| ツールが誤って skipLlmRound を設定し、マルチステップタスクが中断される | 中     | バッチレベルのセマンティクス ＋ llmContent は履歴に残り復元可能 |
| サードパーティツールの悪用                   | 中     | MCP はデフォルトで無効、allowlist で明示的に有効化 |
| 歴史的不変条件の破壊                         | 中     | 導入前に単体テストを追加；session-load リプレイでカバー |
| ユーザーの期待との不一致（要約を期待したが得られない） | 低     | setting `alwaysSummarize: true` で上書き可能 |

#### 効果

終了状態のクエリシナリオで 3～4 秒削減（最後の LLM ラウンドをスキップ）。

---

### 3.2 方向性二：要約ラウンドにおける fast-model ルーティング戦略

#### 位置づけ

**本方向性は新しいパイプラインを導入せず、GeminiChat インターフェースを拡張してランタイムでのモデル切り替えを可能にする必要がある**。

§1.4 のインフラは fast モデルの設定と modelOverride のエンドツーエンドでの貫通を提供しているが、**メインチャット上で fastModel ＋ストリーミングを実行する先例はなく**、以下が必要：

- 決定関数：いつ `config.getFastModel()` を override として渡すか
- 安全なフォールバック：`GeminiChat.retryStreamWithModel` という新しいインターフェース（チャット内部状態を処理するため）
- 実験による検証：メインチャットでの fast/primary 切り替えが compaction / history-recording を破壊しないこと

#### 適用範囲

D2 は以下にのみ作用する：

- **useGeminiStream**（TUI メインパス）—— `sendMessageStream` 呼び出しポイント L1841
- **ACP Session**（IDE 統合パス）—— `acp-integration/session/Session.ts:1182`、Phase 3 で同期改造

D2 は以下のパスには**作用しない**。非対話型または独立コンテキストで追加の障害モードを導入するのを避けるため：

- **Subagent ランタイム**（`agents/runtime/agent-core.ts:614`）：子エージェントは独立したモデル設定を持っている
- **Cron トリガー turn**（`SendMessageType.Cron`, client.ts:127）：非対話型、RT の緊急性なし
- **Notification turn**（`SendMessageType.Notification`, client.ts:129）：同上

#### 核心的難しさ

`submitQuery` を呼び出す時点で、**モデルが結果を確認した後に新しいツールを呼び出すのか、それとも単にテキストを出力するのか、私たちは知ることができない**。もし fast モデルで呼び出して、モデルが実際にはツールを呼び出す必要がある場合、結果は**静かに**失敗する：fast モデルが誤ったツールや誤ったパラメータを呼び出す可能性があり、エラーは明確なシグナルとして現れない。

**ツールレベルのフィールドは「次のラウンドが要約かどうか」を確実に予測できない**。なぜならそれは対話フロー（ユーザープロンプト＋累積コンテキスト）に依存しており、ツール成果物のローカル属性ではないからである。例：

```
ユーザー：「utils.ts を読んで、中の console.log をすべて logger.info に変更して」
  → Tool 1: read_file → 結果は自己完結
  → しかし次のラウンドが要約であることは明らかにない
```

したがって、D2 は**対話フローのヒューリスティック**のみを使用して予測し、ツールフィールドには依存しない。

#### 決定関数：対話フローヒューリスティック ＋ 拒否

```typescript
import { Kind, MUTATOR_KINDS } from '../tools/tools.js';

function selectContinuationTier(
  turn: Turn,
  userPrompt: string,
  batch: ToolCall[],
): 'fast' | 'primary' {
  // ===== ユーザーレベル強制スイッチ（最優先） =====
  const userPref = config.getSummaryTierStrategy();
  if (userPref === 'always_primary') return 'primary';
  if (userPref === 'always_fast') return 'fast'; // それでもランタイム保険の制約を受ける

  // ===== ユーザー意図による拒否 =====
  // 1. user prompt に動作動詞が含まれる → 次のラウンドはツール呼び出しの可能性が高い
  if (requestImpliesFurtherAction(userPrompt)) return 'primary';

  // 2. 現在のラウンドに mutator ツールが含まれる → 検証/読み取りの後続が可能性が高い
  if (batch.some((c) => MUTATOR_KINDS.includes(c.tool.kind))) return 'primary';

  // 3. 現在のラウンドまたは履歴に未解決のエラーがある → モデルは primary で診断する必要がある
  if (hasUnresolvedError(turn.toolResults, batch)) return 'primary';

  // ===== 出力複雑度による拒否 =====
  // 4. user prompt が深い分析を要求する（説明/比較/なぜ系）
  if (needsDeepReasoning(userPrompt)) return 'primary';

  // 5. ツール呼び出しが 3 つ以上の異なるツール → 結果間の叙述には primary が必要
  if (needsCrossResultReasoning(turn)) return 'primary';

  // 6. ツール出力が長すぎる → 長い内容の要約には primary が必要
  if (estimateTotalToolOutputTokens(turn) > 4000) return 'primary';

  // ===== モデル実現可能性による拒否 =====
  // 7. fast モデルの context window が足りない → fast に切り替えると compression がトリガーされる
  //    （compression 自体が LLM 呼び出しを必要とし、かえって遅くなりコストも増加する）
  if (wouldTriggerCompression(turn.history, config.getFastModel()))
    return 'primary';

  // ===== 多言語フォールバック =====
  if (!isPromptLanguageSupported(userPrompt)) return 'primary';

  // ===== Session 状態フォールバック =====
  if (turn.justCompacted || turn.justCleared) return 'primary';

  return 'fast';
}
```

8 つの拒否項目の意味：

- **`requestImpliesFurtherAction`**：動作動詞（`改|削除|追加|置換|修正|実装|新規作成|create|fix|change|add|remove|implement|write|update`）→ マルチステップタスク
- **`MUTATOR_KINDS` に該当**：現在のラウンドで既に書き込みが行われた → 読み取り/検証が続く可能性が高い。**`tools.ts:806` の既存の `MUTATOR_KINDS = [Edit, Delete, Move, Execute]` を再利用する**（各 Tool インスタンスの `kind: Kind` プロパティが権威ある分類であり、`isWriteTool` を再発明しない）
- **`hasUnresolvedError(turnResults, currentBatch)`**：二段階判定——
  - **現在のバッチにエラーがある → 常に未解決**（並列バッチが自己修正できるとは仮定しない）
  - **履歴は `(toolName, args fingerprint)` で重複除去、最後もエラーの場合は未解決とみなす**（toolName のみでは同名異パラメータで誤判定するため）
  - shell などは `ToolResult.error` を正しく設定する必要がある（事前データ品質依存）
- **`needsDeepReasoning`**：「分析/説明/なぜ/比較/診断」系のキーワードを含む
- **`needsCrossResultReasoning`**：異なるツール呼び出しが 3 以上（同じツール、同じパラメータは同一とみなす）
- **出力トークン数 > 4000**：経験的な閾値であり、**fast モデルのベースライン実測後に調整する**
- **`wouldTriggerCompression`**：fast モデルの context window は通常 primary より小さいため、同じ履歴では fast の方が早く `tryCompress`（geminiChat.ts:1418）をトリガーする可能性がある —— compression 自体に LLM 呼び出しが必要なため、**RT とコストを逆に悪化させる可能性がある**。予算見積もり：`estimateHistoryTokens(history) > fastModelContextWindow × COMPACTION_THRESHOLD` の場合、トリガーされるとみなす
- **未サポート言語**：中国語と英語のキーワードのみを検出し、その他の言語（日本語、韓国語など）はデフォルトで primary
- **session 状態の急変**：`/compact` または `/clear` 直後の最初の continuation → primary でメンタルモデルを再構築

拒否の方向性は**primary に偏っている**（2 秒多くかかっても品質を落とさない）。

#### 重要な実装：`GeminiChat.retryStreamWithModel`

**問題**：そのまま abort して `client.sendMessageStream` を呼び出すと、チャットの状態が破壊される：

1. `geminiChat.ts:1428` は stream 開始時に `userContent` を history に push する；再起動すると**もう一度 push され**、history に重複した `function_response` が現れる
2. `sendPromise` ロック（`geminiChat.ts:1392, 1398`）—— abort 後も `streamDoneResolver` が呼び出されることを保証する必要がある
3. `pendingPartialState` など PR #4176 で導入された不変条件マーカーの適切なクリーンアップが必要
4. Telemetry span の model 属性を更新する必要がある

**新しいインターフェース**（`packages/core/src/core/geminiChat.ts`）：

```typescript
/**
 * 実行中または abort されたばかりのストリーミング送信を、別のモデルで再試行する。
 * userContent を再 push しない（元の送信から保持）。
 * pendingPartialState をリセットし、古い sendPromise を解放し、span を再オープンする。
 */
async retryStreamWithModel(
  model: string,
  signal: AbortSignal,
): Promise<AsyncGenerator<StreamEvent>>;
```

呼び出し契約：

- 元の送信が abort された後にのみ呼び出す（同時実行はしない）
- prompt_id を再利用する（同じユーザー意図）
- 履歴に既に push された userContent は再 push しない

実装作業量は約 1.5 日＋単体テスト。

#### ランタイム保険

`selectContinuationTier` が `'fast'` を返したが、stream 中に `ServerGeminiEventType.ToolCallRequest` イベントが発生した場合 → **直ちに現在のストリームを abort し、`retryStreamWithModel(primaryModel)` を呼び出す**。

これにより、「要約と予測されたが、実際にはツールが必要だった」という唯一の静かな誤分類シナリオをカバーする。代償：1 回の fast 呼び出しで無駄になったトークン（コストは §5.3 で説明）。

#### skill `modelOverride` との分離

`useGeminiStream.modelOverrideRef`（L376, L2225）は現在 **skill が明示的に選択したモデル**を保持しており、「ビジネスセマンティクス」に属する。本方向性の fast ルーティングは「最適化セマンティクス」に属し、両者は**分離する必要がある**：

```typescript
// 新しい独立した ref
const summaryTierRef = useRef<'fast' | 'primary' | undefined>(undefined);

// 呼び出しポイントの統合（modelOverrideRef は再利用しない）
const stream = geminiClient.sendMessageStream(
  finalQueryToSend,
  abortSignal,
  prompt_id!,
  {
    type: submitType,
    notificationDisplayText: metadata?.notificationDisplayText,
    modelOverride:
      modelOverrideRef.current ?? // skill の明示的な選択が最優先
      (summaryTierRef.current === 'fast' ? config.getFastModel() : undefined),
  },
);
```

ライフサイクル：

| タイミング                                   | `modelOverrideRef`（skill） | `summaryTierRef`（fast ルーティング）            |
| -------------------------------------------- | --------------------------- | ------------------------------------------------ |
| 新しい user turn（`!Retry && !ToolResult`）  | クリア                      | クリア                                           |
| skill ツールが `modelOverride` フィールドを返す | 書き込み                    | 変更なし                                         |
| tool batch 完了 → `selectContinuationTier`   | 変更なし                    | 書き込み                                         |
| Runtime フォールバック（ToolCallRequest を検出） | 変更なし                    | `'primary'` に昇格                               |
| Retry（ユーザー手動 Ctrl+Y）                  | 保持                        | `'primary'` に昇格（fast 失敗後は fast を使わない） |

skill の明示的な選択が**常に勝つ**——ユーザーの明示的な意図は最適化戦略よりも優先される。

#### Telemetry の修正

`client.ts:1303` の interaction span は turn 開始時に `model` 属性を記録する。フォールバックがトリガーされると実際のモデルが変わり、span のデータが不正確になる。以下が必要：

```typescript
// フォールバックトリガー時
span.setAttribute('llm.model.requested', fastModel);
span.setAttribute('llm.model.actual', primaryModel);
span.setAttribute('llm.fallback.reason', 'tool_call_seen');
```

また、`addUserPromptAttributes` で `requested` / `actual` モデルを区別し、課金/監査の混乱を避ける。

#### ユーザーレベル強制スイッチ

新しい設定（`packages/cli/src/config/settingsSchema.ts`）：

```typescript
summaryTierStrategy: 'auto' | 'always_primary' | 'always_fast';
// default: 'auto'
```

- `'auto'`：`selectContinuationTier` を使用（推奨）
- `'always_primary'`：D2 の最適化を完全に無効化（プロダクション機密シナリオ）
- `'always_fast'`：拒否をスキップ、**それでもランタイム保険の制約を受ける**（上級ユーザー向け）

理由：D2 は品質と速度のトレードオフであり、一部のユーザー/シナリオでは明示的なオプトアウト権が必要。

#### 前提条件

- `config.getFastModel()` が設定済みであること
- **メインチャット上での fastModel-streaming 検証実験**（コーディング前に 1 日）：
  - `resultIsTerminal=true` のツールをモックし、メインチャットで要約ラウンドを繰り返しトリガーする
  - `tryCompress` が誤ってトリガーされないか観察する（fast モデルの context window が小さいため、早期にトリガーされる可能性がある）
  - chatRecordingService の出力に model mismatch がないか観察する
  - 1 回の fast 呼び出し後に次の primary 呼び出しが正常に履歴を読み取れるか観察する
- **Fast 候補モデルのベースライン測定**（1 日）：
  - 100 件の要約ラウンドプロンプト（入力に `function_response` を含む）を実行し、P50/P95 のエンドツーエンドレイテンシと time-to-first-token を測定
  - `tryCompress` のトリガー確率 `P_compact` を測定し、純 RT 利益 = `(1 - P_compact) × ΔRT − P_compact × compression_RT > 0` を検証
  - fast P50 ≤ primary P50 × 0.5 かつ P95 ≤ primary P95 × 0.6 の場合のみ有効化
- Fast モデルと primary モデルは同じファミリーであること（function_response のエンコーディングの違いを避ける）；異なるファミリーの場合は `getFastModel()` 層で拒否
- **`thinkingConfig` の互換性**：
  - Fast モデルは primary と `thinkingConfig.includeThoughts` のサポートで一致している必要がある；または
  - Fast パスで強制的に `includeThoughts: false` とする（`sideQuery.ts:118-122` と合わせる）
  - 検証：thought parts を含む履歴を fast モデルが正しく処理できること（エラーにならず、thought をユーザー入力とみなさない）

#### リスクと緩和策

| リスク                                                                      | 深刻度 | 緩和策                                                                                                                                 |
| --------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Fast モデルの tool-calling が静かに誤ったツールを呼び出す                         | 高     | 対話フローヒューリスティック ＋ ランタイムでの ToolCallRequest abort 保険                                                                     |
| Fast モデルがエラーを含む入力に対して「ユーザーに見える誤った回答」を幻覚する         | **高** | `hasUnresolvedError` で拒否；ユーザーの再質問率を監視（注：`emitToolUseSummaries` の同種リスクは 60 トークンのラベルにしか影響しないが、本リスクは最終回答に影響し、影響の度合いが大きい） |
| Fast パスで `tryCompress` がトリガーされ、**LLM 呼び出しが増え、RT とコストが逆に悪化** | **高** | `wouldTriggerCompression` による事前ゲート（決定関数 #7 参照）；事前ベースライン測定で P_compact 閾値を設定                                     |
| Compression 自体がどのモデルを使うか                                          | 中     | compression がトリガーされた場合は fast ルーティングを放棄（ゲート #7 で対応）；回答問題を回避                                        |
| メインチャットでのモデル切り替えがチャット内部状態/レコーディングを異常にする      | 中     | 事前検証実験でカバー；session resume リプレイテスト                                                                                       |
| D2 と `emitToolUseSummaries` が同時に concurrent fast 呼び出しをトリガーし、rate-limit を超える | 中     | 二択：D2 有効時は `emitToolUseSummaries` を無効にする（タイトルは機能に影響しない）、または rate-limit token bucket を共有する                       |
| `thinkingConfig` が fast / primary 間で一貫せず、履歴解析が異常になる          | 中     | 同ファミリー ＋ fast パスで強制的に `includeThoughts: false`（前提条件参照）                                                                |
| フォールバックパスがかえって高くつく（fast トークンの無駄＋ primary 全体）            | 中     | `fast_tokens_consumed` 決定ログを監視；フォールバック率が 20% を超えたら自動でフラグをオフ                                                    |
| Telemetry span の model が不正確になる                                       | 中     | `requested` / `actual` に分割（Telemetry 修正参照）                                                                                       |
| コンテキスト形式の非互換性（異なるファミリー間）                              | 中     | `getFastModel()` で異なるファミリーを拒否                                                                                                  |
| skill modelOverride とのセマンティクスの衝突                                    | 中     | 独立した ref ＋ skill 優先                                                                                                                |
| `/model` でメインモデルをランタイム切り替えした後、`summaryTierRef` の決定が無効になる | 低     | `/model` コマンド処理時に `summaryTierRef` も同期してクリア                                                                                |
| fast tokens/s がかえって遅い                                                  | 低     | 実測時に RT 全体だけでなく TTFT も測定する                                                                                               |

#### 効果（実測待ち）

- **RT**：要約ラウンドで 2～3 秒削減（実測前は PR タイトルに記載しない）
- **コスト**：fast モデルの単価は通常 primary より大幅に低く、高頻度要約シナリオではトークンコストが 30～50% 削減される可能性がある；ただしフォールバックパスでの無駄が一部の利益を相殺するため、`fast_tokens_consumed` で実測して純利益を確認する必要がある

---

### 3.3 方向性三：結果表示とインタラクションの分離（Presentation Decoupling）

#### 問題点

ユーザーはツール完了から再入力可能になるまで、LLM 要約ラウンドが完了するのを待つ必要がある：

```
ツール完了 → [結果のレンダリング] → [submitQuery] → [LLM のストリーミング応答を 3～4 秒待つ] → Idle → 入力可能
                                         ~~~~~~~~~~~~~~~~~~~~~~~~
                                         ユーザーは結果を既に見ているが操作できない
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

#### 状態遷移の変更

```
ツール完了かつ結果が表示済み
  → バッチの全員の postExecution.resultIsTerminal === true の場合：
    → Summarizing に遷移（ユーザーは入力可能）
    → submitQuery を非同期で実行
    → LLM の要約が履歴に追加される（またはユーザーの新しいメッセージでキャンセルされる）
  → それ以外の場合：
    → Responding を維持（ユーザーは入力不可）
```

#### ユーザーの新しいメッセージの処理

- `Summarizing` 状態でユーザーが新しいメッセージを送信 → 現在の要約を abort → 新しいメッセージを処理
- 生成済みの**部分的な要約テキストは破棄**（履歴に入れない）、不完全な assistant によるコンテキスト汚染を防ぐ
- `function_response` は履歴に残る（モデルはツールが実行されたことを認識している）
- followup suggestion は Summarizing が完了するかキャンセルされた後にトリガーする

#### Abort 時の部分テキストクリーンアップリスト

部分テキストは複数の場所に分散しており、**同時に**クリーンアップする必要がある。一つ欠けても状態の不整合が発生する：

| 位置                                                           | クリーンアップアクション                                                                          |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `pendingHistoryItemRef.current`（useGeminiStream React state） | `null` に設定、`addItem` を呼ばない                                                             |
| `GeminiChat.history` 内部の累積                                  | abort 前に部分的な assistant content が既に push されている場合、新しい `discardPendingAssistant()` インターフェースでロールバック |
| `ChatRecordingService` のバッファリングされた turn               | キャンセル済みとしてマーク、JSONL に書き込まない                                                |
| `dualOutput.emitText`（有効な場合）                              | abort sentinel を送信、sidecar 自身で破棄                                                        |
| `loopDetectorRef` の累積トークン                                 | 現在の turn カウントをリセット                                                                  |
执行顺序：abort signal の発火 → 上記5箇所のクリーンアップを収集 → その後はじめて新たな user message が `submitQuery` に入ることができる。競合テストの対象：abort の瞬間に最後の chunk が届くケース。

#### 適用条件

batch 全員の `postExecution.resultIsTerminal === true` であること。

#### 歴史的不変条件（§3.1 と同源）

途中で Summarizing が中断されると次のようになる：

```
[user_1, function_call, function_response, user_2]
                                          ↑ assistant turn なし
```

**これは §3.1 で LLM ラウンドをスキップした際に壊れるのと同じ不変条件である**。したがって D1 と同じ修正戦略（空の assistant の注入 / Qwen の許容に頼る）を使用しなければならない。

- D1 の不変条件ユニットテストを流用する
- session-load のリプレイ（`repairOrphanedToolUseTurnsInHistory` を含む）でこのパターンをカバーする必要がある
- Anthropic alternation：直結時には D1 と同時に補完処理を入れる

#### リスクと緩和

| リスク                                  | 深刻度 | 緩和                                                                        |
| --------------------------------------- | ------ | --------------------------------------------------------------------------- |
| Abort 時に中途半端な assistant が history に入る | **中** | partial text を明示的に破棄；function_response のみ保持；競合状態をユニットテストでカバー |
| 歴史的不変条件の破壊（assistant の後続がない） | **中** | D1 と同源の問題、統一的に修正する（§3.1 歴史的不変条件を参照）              |
| UI 状態の複雑さ増加                      | 中     | Summarizing = Idle + バックグラウンドタスク；入力経路は Idle を再利用       |
| ユーザー体感利益は行動パターンに依存    | 低     | ユーザーが 3 秒以内に入力しない場合、summary は完了 → 体感利益なし；ただし**劣化もしない** |

#### 利益

- **理論的上限**: 3-4 秒の体感 RT（ユーザーがツール完了時に入力する場合）
- **実質中央値**: ユーザーの入力間隔に依存——結果を読むのに 2-5 秒かかるユーザーには差を感じないが、**決して遅くなることはない**

---

### 3.4 方向四：ストリーム先読みスケジューリング（Stream-Ahead Scheduling）

#### 問題点

`processGeminiStreamEvents` はストリームが完全に終了した後にのみツールをバッチスケジューリングする。`ToolCallRequest` イベントはストリームの途中で yield される可能性がある。

#### 設計

ストリームイベント処理において、`ToolCallRequest` に対して**事前検証**（実行はしない）を直ちに開始する：

```typescript
case ServerGeminiEventType.ToolCallRequest:
  toolCallRequests.push(event.value);
  scheduler.prevalidate(event.value, signal);  // 新規追加
  break;
```

`CoreToolScheduler.prevalidate(request)`：

1. ツールの登録を検索
2. invocation を構築
3. `shouldConfirmExecute` を実行（結果をキャッシュ）
4. `schedule()` 時にキャッシュ結果を直接使用

#### 純粋性契約と Allowlist

`prevalidate` は `shouldConfirmExecute` が副作用がなく、**かつ** prevalidate→schedule の間に外部で結果が変更されて無効にならないことを要求する。

**`tools.ts:818` の `CONCURRENCY_SAFE_KINDS` を直接再利用する**：

```typescript
export const CONCURRENCY_SAFE_KINDS: ReadonlySet<Kind> = new Set([
  Kind.Read,
  Kind.Search,
  Kind.Fetch,
]);
```

これはプロジェクト既存の「副作用なし＋並行実行可能」分類であり、prevalidate の要件に正確に合致する。

| ツール Kind                     | allowlist 対象 | 理由                                                         |
| ------------------------------- | -------------- | ------------------------------------------------------------ |
| `Read`（read_file など）        | ✅             | 純粋読み取り                                                 |
| `Search`（grep / glob）         | ✅             | 純粋読み取り                                                 |
| `Fetch`（web_fetch など）       | ✅             | リモート読み取り、書き込み副作用なし                         |
| `Edit`                          | **❌**（後述の TOCTOU） | shouldConfirmExecute は純粋読み取りだが、スケジューリングの隙間に diff が無効になる可能性がある |
| `Delete` / `Move` / `Execute`   | ❌             | MUTATOR_KINDS                                                |
| `Think`                         | ❌             | save_memory / todo_write などの暗黙的な書き込みを含む        |
| MCP ツール                      | ❌             | 信頼できない                                                 |

**TOCTOU：なぜ Edit が allowlist に入らないか**

理論的には Edit の `shouldConfirmExecute` は純粋読み取り（ファイルを読み、diff を計算する）。しかし prevalidate と schedule の間には時間窓が存在する：

```
T=0      stream が Edit(file=a.ts, ...) を受信 → prevalidate
T=10ms   shouldConfirmExecute が a.ts を読み、diff_v0 をキャッシュ
T=300ms  stream 終了、scheduler.schedule()
T=305ms  その間に他のツール/IDE/外部プロセスが a.ts を変更
T=310ms  scheduler が diff_v0 をユーザーに表示
T=320ms  ユーザーが v0 に基づいて確認
T=330ms  Edit が古い params を v1 ファイルに適用 → 内容破損 / merge 失敗
```

これが TOCTOU である。修正方向：

- **A（推奨）**: Edit を allowlist に入れず、prevalidate は `CONCURRENCY_SAFE_KINDS` の 3 種類のみを対象とする。代償：利益が「50-200ms（Edit 主体）」から「50-100ms（読み取り系のみ）」に減少する。
- **B（オプション強化）**: Edit を allowlist に入れるが、キャッシュに `(mtime, size, content_hash)` を付与；schedule() 時に変更がない場合のみキャッシュを使用し、それ以外は再計算する。

ドキュメントでは当面 A を選択する。

#### 既存の並行スケジューリングとの相互作用

`coreToolScheduler.attemptExecutionOfScheduledCalls`（L2436+）は `partitionToolCalls` を使用してツールを「並行セーフ batch」と「直列 batch」に分割し、並行 batch は `runConcurrently`（L2473）で実行される。

prevalidate はこの分割モデルに適合しなければならない：

- キャッシュは `callId` でインデックス付けする（`(toolName, args)` ではない。同じ名前の並行呼び出しでの競合を避けるため）
- prevalidate に失敗した call → 他の call に影響せず、schedule 時にその call は元の `shouldConfirmExecute` パスをたどる
- stream がキャンセルされた場合、`signal` に従ってすべての実行中の prevalidate をカスケード abort する

#### リスク

| リスク                                                   | 深刻度 | 緩和                                                                                |
| -------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------- |
| キャッシュされた diff と確認時の実際のファイルが一致しない（TOCTOU） | 高     | 方式 A：Edit を allowlist に入れない；方式 B：キャッシュに `(mtime, size, hash)` 検証を付与 |
| prevalidate の失敗がスケジューリングに影響               | 低     | 失敗/タイムアウト時は元の `shouldConfirmExecute` パスにフォールバック、キャッシュ欠落 ≡ 未使用と同等 |
| 並行 prevalidate による fd / リソースの競合              | 低     | `QWEN_CODE_MAX_TOOL_CONCURRENCY` で並行上限を制限済み（デフォルト 10）              |

#### 利益

50-100ms/ラウンド（`CONCURRENCY_SAFE_KINDS` の範囲のみ）。方式 B で Edit を含めた場合、理論的利益は 100-200ms。

---

## 4. 総合評価とロードマップ

### 4.1 総合評価

| 方向                   | RT 利益                         | 実装複雑度                      | 品質リスク | 依存関係                                        | 優先度 |
| ---------------------- | ------------------------------- | ------------------------------- | ---------- | ----------------------------------------------- | ------ |
| D1 ツール後置命令      | 3-4秒/終端ラウンド              | 低（2-3日）                     | 低         | なし                                            | **P0** |
| D2 summary fast ルーティング | 2-3秒/summary ラウンド（実測待ち） | **中-高（9日）**                 | 中-高      | D2 独自のヒューリスティック + メインチャット検証実験 + ACP 同期 | **P1** |
| D3 表示分離            | 3-4秒の体感改善（ユーザー行動に依存） | 中（3-5日、不変条件修正を含む） | 中         | D1 の不変条件修正                                | **P1** |
| D4 ストリーム先読みスケジューリング | 50-200ms/ラウンド                   | 高（5-7日）                    | 極低       | なし                                            | P2     |

#### D2 作業量詳細

| サブタスク                                                                                                   | 所要時間 |
| ------------------------------------------------------------------------------------------------------------ | -------- |
| メインチャット fastModel-streaming 検証実験（P_compact 測定を含む）                                          | 1日      |
| Fast 候補モデルのベースライン測定（TTFT、P95、`thinkingConfig` 互換性を含む）                               | 1日      |
| `selectContinuationTier` + `summaryTierRef` の組み込み（useGeminiStream）                                    | 0.5日    |
| ヒューリスティックの実装（`MUTATOR_KINDS` の再利用 / `wouldTriggerCompression` の推定 / 多言語 / 状態変化） | 1日      |
| `GeminiChat.retryStreamWithModel` + `discardPendingAssistant` インターフェイスの実装                         | 1.5日    |
| ACP Session の同期改修（acp-integration/session/Session.ts）                                                 | 1日      |
| Telemetry span の修正（`requested` / `actual` の分割）                                                      | 0.5日    |
| User-level setting `summaryTierStrategy` + JSON schema + `/config` 統合                                     | 0.5日    |
| ユニットテスト（競合、abort タイミング、history 不変条件、フォールバックパス、ACP パス）                     | 2日      |
| **合計**                                                                                                     | **9日**  |

> 注：初期見積もり 6.5 日には ACP パス、`wouldTriggerCompression` gate、クリーンアップリスト、settings schema の工数などが含まれていなかった。

### 4.2 実装ロードマップ

#### Phase 1：D1 ツール後置命令（1 週間）

- `ToolResult.postExecution` を拡張（tools.ts L422）：`skipLlmRound` + `resultIsTerminal`
- `handleCompletedTools` で `skipLlmRound` のショートサーキットを実装（useGeminiStream.ts L2038）
- 歴史的不変条件のユニットテスト
- **Phase 1 では `resultIsTerminal` は使わない**（Phase 3 に回す）

#### Phase 2：シグナルエコシステムの構築（2 週間、Phase 4 と並行）

- 組み込みツールに順次 `skipLlmRound` / `resultIsTerminal` を付与（§3.1 の表を参照）
- 付与率 ≥60% を検証（呼び出し回数ではなく turn 数で加重）
- プロダクションデータを収集し、§3.2 の veto gate 閾値を調整
- Phase 2 終了時に §3.2 のメインチャット検証実験とベースライン測定を実施

#### Phase 3：D2 + D3（約 3 週間、ACP 同期を含む）

> **修正**：初期ロードマップでは 1 週間と見積もっていたが、fastModel-streaming 検証実験、`retryStreamWithModel` の実装、不変条件の統一的修正、ACP パスの同期が含まれていなかった。

- コーディング前：メインチャット検証実験 + ベースライン測定を完了（`P_compact` と thinkingConfig 互換性を含む）
- `summaryTierRef` + `selectContinuationTier` を追加（`wouldTriggerCompression` gate を含む）
- `GeminiChat.retryStreamWithModel` + `discardPendingAssistant` を追加
- **ACP Session パスを同時に改修**（acp-integration/session/Session.ts）し、同じ決定関数を使用
- `StreamingState.Summarizing` を追加 + 入力パスの再利用 + abort クリーンアップリスト
- 歴史的不変条件の統一的修正（D1+D3 同源）
- Feature flag `experimental.summaryRoundFastModel: false`、**Release N ではデフォルト OFF**
- User setting `summaryTierStrategy`
- Telemetry span の修正
- 実行時セーフティ（ToolCallRequest abort + retryStreamWithModel）

#### Phase 4：D4 ストリーム先読みスケジューリング（独立して挿入可能）

- `CoreToolScheduler.prevalidate` + allowlist
- `processGeminiStreamEvents` のインクリメンタルスケジューリング

---

## 5. 測定、受入基準と制限

### 5.1 パフォーマンス指標

| 指標                               | ベースライン | Phase 1 | Phase 3                   |
| ---------------------------------- | ------------ | ------- | ------------------------- |
| エンドツーエンド RT P50（3 ラウンドループ） | 13.4秒       | <10秒   | <8秒（実測待ち）          |
| エンドツーエンド RT P95            | -            | <13秒   | <12秒（フォールバックパス上限） |
| ユーザー体感初回結果時間 P50       | 13.4秒       | <10秒   | <5秒（D3 有効時）         |
| ユーザー体感初回結果時間 P95       | -            | <13秒   | <8秒                      |
| LLM 呼び出し回数（スキップ可能なシナリオ） | 3            | 2       | 2（より高速）             |

> 注：ベースラインは単一回のサンプリングであり、導入前に 3 クラス以上のシナリオで補完する必要がある。

### 5.2 品質指標

| 指標                                               | ベースライン | 許容劣化                 |
| -------------------------------------------------- | ------------ | ------------------------ |
| Tool-calling 精度（fast model summary ラウンド）    | 100%         | ≥98%                     |
| skipLlmRound 誤用率（ユーザーが「もっと詳しく」と尋ねるケース） | -            | <1%                      |
| Fast model fallback_triggered 率                   | -            | <10%（>20% で自動的にフラグを OFF） |
| Summarizing 状態で中途半端な assistant が history に入ること | 0            | 0（厳守）                |

### 5.3 コスト指標

| 指標                                | ベースライン | Phase 3 目標                                                |
| ----------------------------------- | ------------ | ------------------------------------------------------------ |
| 1000 セッションあたりのトークンコスト（summary ラウンド） | 100%         | <70%                                                         |
| フォールバックパスで無駄になるトークン割合 | 0            | <15%（フォールバック率 × 1 回の fast tokens / 1 回の primary tokens） |

### 5.4 決定ログスキーマ

`selectContinuationTier` と `handleCompletedTools` の各重要な判定を構造化ログとして 1 行記録する：

```
{
  turn_id, prompt_id,
  decision: 'skip' | 'fast' | 'primary',
  tier_requested: 'fast' | 'primary',          // 決定（フォールバック前）
  tier_actual:    'fast' | 'primary',          // 実際に実行されたもの（フォールバック後）
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
  fast_tokens_consumed: int,                    // フォールバックで無駄になったトークン（コスト帰属）
  total_rt_ms,
  fallback_triggered: bool,
  fallback_reason: 'tool_call_seen' | 'timeout' | 'error' | null,
}
```

観測指標：

- fast 発動率（想定 30-50%）
- fallback_triggered 率（想定 <10%；>20% の場合は次のリリースでデフォルトフラグを OFF にすることを検討）
- 各 veto の割合（過剰/過小の識別）
- fast_tokens_consumed × fallback_rate（コストの逆方向リスク）
- ユーザーが「もっと詳しく」と尋ねる頻度（fast 品質の回帰シグナル）

**`fast_tokens_consumed` 測定の説明**：

abort で中断されたストリームは、**ほとんどの場合 `finishReason` / `usageMetadata` を受信できない**——これらはストリームが完全に終了したときにのみ設定される。実装では推定が必要：

- 優先：abort 前に `stream.return()` を試み、ジェネレーターが finally パスを通るようにし、部分的な usage が取得できる可能性がある
- フォールバック：それまでに受信した chunk のテキスト長 × 4 で output tokens を推定；input tokens は history から推定
- 注釈：ログフィールドに `tokens_source: 'usage' | 'estimated'` を付与し、事後分析で区別可能にする

### 5.5 検証方法とリリース戦略

#### 検証

- `/tmp/tool-timing.log` タイミングフレームワークを再利用
- `T_userIdle`（ユーザーが再入力可能な時刻）を新規追加
- `T_firstToken`（ストリームの最初のトークン時刻）を新規追加
- A/B テストで各 Phase 前後の RT とコスト分布を比較

#### リリース戦略（ローカル CLI に適合）

Qwen Code はローカル CLI であり、**実行時に設定を配信する能力はない**——従来の「5% / 25% / 100% のカナリアリリース」は適用できない。**段階的なリリースで進める**：

| 段階                  | Release ノード         | feature flag デフォルト値 | トリガー条件                                                   |
| --------------------- | ---------------------- | ------------------------- | ------------------------------------------------------------ |
| Phase 3a：dogfood     | Release N              | `false`                   | 内部ユーザーが `summaryTierStrategy=always_fast` で自ら有効化 |
| Phase 3b：opt-in デフォルト | Release N+1（2 週間以上後） | `false`（変更なし）        | dogfood 段階で決定ログが基準を満たす：fallback <10%、正味の RT/コスト利益 >0 |
| Phase 3c：デフォルト有効 | Release N+2（4 週間以上後） | `true`                    | Phase 3b でユーザーレベルの品質回帰報告なし                   |
| ロールバック          | Release N+3（必要に応じて） | `true → false`            | 大規模な fallback >20% または品質指標の劣化                   |

**ロールバックメカニズム**：

- 実行時に配信不可であるため、**ロールバック = デフォルトフラグを OFF にした新しいリリースを出す**
- ユーザーレベルの `summaryTierStrategy=always_primary` は常に「すぐに抜け出す」手段を提供し、新しいリリースに依存しない
- 決定ログの `fallback_rate` / `cost_regression` を各 Release サイクルで評価し、次のステップを決定する

### 5.6 既知の制限

1. **ベースラインデータが不十分**：単一回のサンプリングではすべてのタスクパターンをカバーできない。導入前にシナリオを補完する必要がある。
2. **fast モデルの前提**：著しく高速で tool-calling が基準を満たす同族モデルが存在しない場合 → D2 は有効にしない。
3. **`skipLlmRound` は品質と速度のトレードオフ**：LLM をスキップ = モデルの理解と修正を放棄するため、決定性の高いシナリオにのみ適用する。
4. **D2 は品質+コストと速度のトレードオフ**：fast モデルの品質は primary より低い；フォールバックパスはむしろ高コストになる——決定ログで正味利益を実測しなければならない。
5. **`tryCompress` の起動が逆効果になる可能性**：fast モデルのコンテキストは小さく、圧縮自体が LLM 呼び出しを消費する——`wouldTriggerCompression` gate は必須の防御策である。
6. **表示分離は対話モデルを変える**：新しいモードにユーザーが適応する必要がある；ユーザーの行動が実際の体感利益を決定する。
7. **ネットワーク遅延は制御不能**：本方式は呼び出し回数を減らすのであって、個々の呼び出しを最適化するものではない。
8. **Anthropic 直結は未対応**：現在の alternation 許容度は Qwen / OpenAI スタイルの API に依存している。
9. **メインチャットでの fastModel-streaming は初めての導入**：プロダクションでの前例がないため、独立した検証実験が必要。
10. **ローカル CLI は実行時配信不可**：リリース戦略は段階的なリリースで進めるしかなく、迅速なカナリア調整はできない。
11. **D2 は対話パスにのみ作用**：Subagent / Cron / Notification は対象外（意図的）。
12. **混合モデル history の長期的影響は未知**：D2 有効後、セッション内の turn が fast/primary 間で切り替わるため、長いセッションの再開とコンテキストの一貫性を観察する必要がある。
13. **D4 の利益縮小**：Edit が allowlist から外れた後、prevalidate は純粋読み取り系ツールのみを対象とする（50-100ms の利益）；Edit を含めた 200ms の利益を得るには方式 B の mtime/hash 検証メカニズムが必要。

### 5.7 主要コード位置

| ファイル                                                | キーシンボル                                         | 位置                     |
| ------------------------------------------------------- | ---------------------------------------------------- | ------------------------ |
| `packages/core/src/tools/tools.ts`                      | `ToolResult` interface                               | L422                     |
| `packages/core/src/tools/tools.ts`                      | `Kind` enum + `MUTATOR_KINDS` + `CONCURRENCY_SAFE_KINDS` | L793, L806, L818         |
| `packages/core/src/tools/tools.ts`                      | `DeclarativeTool.kind: Kind`（各 Tool インスタンスに付与） | L165                     |
| `packages/core/src/core/client.ts`                      | `SendMessageOptions.modelOverride`                   | L142                     |
| `packages/core/src/core/client.ts`                      | `sendMessageStream`                                  | L1216                    |
| `packages/core/src/core/client.ts`                      | `modelOverride ?? getModel()`                        | L1305, L1598             |
| `packages/core/src/core/client.ts`                      | `turn.run(model, …)`                                 | L1707                    |
| `packages/core/src/core/geminiChat.ts`                  | `sendMessageStream(model, …)`                        | L1387                    |
| `packages/core/src/core/geminiChat.ts`                  | `history.push(userContent)`                          | L1428                    |
| `packages/core/src/core/geminiChat.ts`                  | `sendPromise` ロック                                 | L1392                    |
| `packages/cli/src/ui/hooks/useGeminiStream.ts`          | `modelOverrideRef`（skill のモデル選択）             | L376, L2225              |
| `packages/cli/src/ui/hooks/useGeminiStream.ts`          | `processGeminiStreamEvents`                          | L1365                    |
| `packages/cli/src/ui/hooks/useGeminiStream.ts`          | `sendMessageStream` 呼び出し箇所                     | L1841                    |
| `packages/cli/src/ui/hooks/useGeminiStream.ts`          | `handleCompletedTools`                               | L2038                    |
| `packages/cli/src/ui/hooks/useGeminiStream.ts`          | `submitQuery(ToolResult, …)`                         | L2355                    |
| `packages/core/src/services/toolUseSummary.ts`          | fast-model side query（非ストリーミングの先例）      | L108                     |
| `packages/core/src/followup/speculation.ts`             | fast-model streaming（forked chat の先例）           | L224                     |
| `packages/core/src/config/config.ts`                    | `fastModel` + `getFastModel` + `setFastModel`        | L684, L1987, L2021       |
| `packages/core/src/core/coreToolScheduler.ts`           | `attemptExecutionOfScheduledCalls`                   | L2436                    |
| `packages/core/src/core/coreToolScheduler.ts`           | `runConcurrently` + `partitionToolCalls`             | L2473                    |
| `packages/cli/src/acp-integration/session/Session.ts`   | `sendMessageStream` 呼び出し箇所（ACP / IDE パス）   | L705, L965, L1182, L1423 |
| `packages/core/src/agents/runtime/agent-core.ts`        | Subagent `sendMessageStream`（D2 の影響を受けない）  | L614                     |

---

## 6. Review 検証記録（2026-05-26）

### 6.1 検証方法

設計ドキュメントで**宣言のみで定量化されていない**いくつかの前提データ品質仮定と利益見積もりに対して、4 つの並行 Explore subagent を起動し、読み取り専用のコード調査を実施する。各 subagent は 1 つの事実質問のみに答え、判断は行わず、最適化提案もしない。調査は現在の `main` ブランチ（HEAD: `026f2f768`）に基づく。

| 検証質問                                                                 | 関連セクション                       |
| ------------------------------------------------------------------------ | ------------------------------------ |
| Q3 現在の全ツールの `ToolResult.error` フィールドの充填率                | §3.2 `hasUnresolvedError` の前提依存 |
| Q4 stream abort 後の `usageMetadata` の実際の取得可能性                  | §5.4 `fast_tokens_consumed` 測定     |
| Q5 "ユーザーが質問/明確化" の計装ポイントの有無                          | §5.2 fast 品質回帰監視シグナル       |
| Q6 `CONCURRENCY_SAFE_KINDS` ツールの `shouldConfirmExecute` 実際の IO 作業量 | §3.4 D4 利益見積もり                 |

### 6.2 発見 1：`hasUnresolvedError` ヒューリスティックに 32% のツール死角がある（D2 に影響）

**事実**：エラーパスを持つ 22 個のツールのうち、**15 個（68%）は `ToolResult.error` フィールドを正しく設定している**（shell、read-file、write-file、edit、grep、glob、ls、web-fetch、mcp-tool、cron-* などの主要 I/O ツールは揃っている）。**7 個（32%）はエラーを `llmContent` 文字列にだけ詰め込んでいる**：`askUserQuestion`、`monitor`、`skill`、`lsp`、`exitPlanMode`、`todoWrite` など。

**統一的な `createErrorResult` ヘルパーは存在せず**、各ツールが独立してエラー構造を構築している。

**設計への影響**：

- §3.2 の `hasUnresolvedError` 拒否項目が `ToolResult.error` フィールドのみをチェックする場合、**これら 7 個のツールの失敗は決して「primary に戻す」をトリガーしない**——次のラウンドも引き続き fast model にルーティングされる。
- 中でも **`skill` ツールの失敗が fast model によって誤って要約される**ことは高優先度のリスクシナリオである（本リポジトリでは大量の skill 駆動ワークフローが影響を受ける）。
- §3.2 で「shell などは正しく ToolResult.error を設定する必要がある（前提データ品質依存）」としているが、**範囲が狭すぎる**。shell は実際には正しく設定されており、本当の盲点は skill / lsp / todoWrite などである。

**修正提案**：「**`llmContent` のみでエラーを伝えている 7 個のツールを、正しく `error` フィールドを設定するように改造する**」を D2 のハードな前提依存として追加する（§3.2 前提条件）。所要見積もり ~2日；「`llmContent.match(/^Error:/i)` で誤魔化す」ような汚いパスは許容しない（誤判定リスクが高い）。

### 6.3 発見 2：`fast_tokens_consumed` 指標の実装コストが過小評価されている（D2 / §5.3 に影響）

**事実**：

- `turn.ts` の abort パス（L289-291）は直接 `return` しており、**finally ブロックはなく、`stream.return()` の呼び出しもない**——ドキュメント §5.4 で示唆された「abort 前に `stream.return()` でジェネレーターが finally パスを通る」は現在のコードには存在しない。
- `geminiChat.ts:processStreamResponse` の `for await` ループは、完全に走査された場合にのみ turn を記録する（L1286）。abort による中断は、通常完全なメタデータを持つ最後の usage-only chunk が**直接破棄される**ことを意味する。
- メインチャットパスには **chunk レベルのトークン累積のフォールバックは一切ない**；subagent 層（`agent.ts:731-744`）のみに累積があるが、再利用できない。
- 結論：abort 時には `usageMetadata` は **ゼロ取得**、`chars/4` による推定（±20% 誤差）のみに頼ることになる。

**設計への影響**：

- §5.4 末尾の「優先 / フォールバック / 注釈」の 3 層方式において、**「優先」パスは現在のコードでは到達不能**——まず `sendMessageStream` ジェネレーター構造を変更して finally を追加する必要があり、作業量約 1 日、設計ドキュメントにはこのコストが反映されていない。
- §5.3 では「1000 セッションあたりのトークンコスト <70%」を Phase 3 の目標としているが、指標自体に ±20% の誤差がある場合、**「70%」と「82%」は測定ノイズ内に収まる**。

**修正提案**：

- §5.3 を**トレンド指標**に書き換え、リリースゲートとして使わない；代わりに「決定ログの `fallback_triggered` 率 + `fast_tokens_consumed` の同方向トレンド」の複合指標で判断する。
- §5.4 に追記：`fast_tokens_consumed` の実装には、まず turn.ts の abort パスを変更して finally + `stream.return()` を追加する必要がある。これを §3.2 の作業量に加える（+1日）。

### 6.4 発見 3：`user_prompt_classification` と「ユーザーが質問」の計装ポイントは新規作成が必要（D2 / §5.2 に影響）

**事実**：

- `packages/core/src/followup/` には既に `speculation.ts` / `suggestionGenerator.ts` / `followupState.ts` が存在するが、そのテレメトリー（`PromptSuggestionEvent`）は **「システム提案が採用/無視された」** を記録するものであり、「ユーザーが自発的に質問した」ではない。
- `ChatRecordingService` はユーザーメッセージを保存するが、**分類タグは付けない**。
- リポジトリ全体を grep しても `user_prompt_classification`、日本語/英語の質問パターンマッチ、`clarif*` / `intentDetect` 系のメカニズムは存在しない。

**設計への影響**：

- §5.4 の決定ログスキーマの `user_prompt_classification: 'query' | 'action' | 'analysis'` フィールドには**データソースがない**——既存の PromptSuggestionEvent から導出することも、ChatRecord から読み出すこともできない。
- §5.2 の「ユーザーが「もっと詳しく」と尋ねる頻度」の監視シグナルも同様で、**最も近い既存のアンカーである `followupState.onOutcome` は再利用できない**。
**建议修正**：

- §3.2 前置条件に「ユーザー入力分類器最小実装」（中英パターンマッチ、~3d）を追加。追加しないと §5.4 の決定ログ内 `user_prompt_classification` と `requestImpliesFurtherAction` の両方にデータが不足する
- または **受け入れる**：Phase 3a dogfood 段階ではこれらの2つのシグナルがなく、`fallback_triggered` 率のみで品質回帰を監視する——コストは低いがリスクは高い

### 6.5 発見 4：D4 設計内在矛盾——allowlist と利益帰属の不一致（D4 / §3.4 に影響）

**事実**：

- `Kind.Read`（read_file）、`Kind.Search`（glob / grep）、`Kind.Fetch`（web_fetch）の3種類のツールにおける `shouldConfirmExecute` / `getConfirmationDetails` は、**ほぼすべてが `BaseToolInvocation` のデフォルト実装を継承し、IOをゼロ**（read_file / glob / grep は完全にオーバーライドなし、web_fetch は5-10行の文字列解析でURLホスト名を抽出するのみ）
- 実際にIOが発生するのは `Edit` / `WriteFile`（`calculateEdit` + `readTextFile` + `Diff.createPatch`、通常 ~20ms）だが、§3.4 の方案Aでは TOCTOU を回避するためにこれらを allowlist から除外している
- **結果**：allowlist に残る3種類のツールでは、prevalidate ありとなしで作業量がほぼ同じ——allowlist が実際に遮断しているのは「唯一IOの削減が可能なEdit」だけであり、「元々コストがゼロのツール」が残っている

**設計への影響**：

- §3.4 の「前置IO検証」という説明は**成立しない**：50-100ms の利益の真の源泉は **「stream が完全に終了 → その後に一括 schedule」というスケジューリング待ちを解消すること**であり、ツール側のIOとはほぼ無関係
- 利益帰属の誤りが2つの問題を引き起こす：
  1. **allowlist はもっと広くできる**——べき等な prevalidate が可能なツールであればよく、`CONCURRENCY_SAFE_KINDS` に縛られる必要はない
  2. **5-7dの投入が自己矛盾を起こす**——真の利益がスケジューリングモデル変更による ~50ms だけで、Edit が allowlist に含まれていないなら、この投入のROIは設計書が示唆するより低い

**建议修正**：§3.4 の利益帰属を書き直しする——

- (a) スケジューリングモデル変更による stream 待ち削減 ~50ms、(b) ツール側IO前置で削減可能な作業量 ~0ms（allowlist内） / ~20ms（Editがallowlistに入った場合） の2つに分割
- §4.1 の総合評価表で D4 RT 利益を "50-200ms" から "30-80ms（方案A、主にスケジューリングモデル）/ 100-200ms（方案B、Edit含む）" に変更
- §4.2 のロードマップで D4 を更に降格——純粋なスケジューリングモデル改造は独立して実施可能であり、prevalidate の概念に強く紐づける必要はない

### 6.6 ロードマップへの統合的影響

| 節                          | 元見積もり | 検証後見積もり | 増分源泉                                                                                         |
| ----------------------------- | ------ | ------------ | ------------------------------------------------------------------------------------------------ |
| D2 §3.2 作業量（§4.1 詳細表） | 9d     | **14-16d**   | +2d（発見1 前置ツール改造）+1d（発見2 turn.ts finally 改造）+3d（発見3 入力分類器、直截なパスを取る場合） |
| D4 §3.4 総合評価              | 5-7d   | 5-7d（不变） | 作業量は変わらず、**RT利益帰属が「ツール側IO」から「スケジューリングモデル」に変更**、投入ROIは低下                         |
| Phase 3 総期間（§4.2）        | ~3週間  | **~4-5週間**  | D2作業量増加 ＋ 前置ツール改造PRが単独でレビュー期間を要する                                               |

**元ロードマップへの修正提案**：

1. **D1（P0）とD3は引き続き優先**——今回の検証ではこれらのコア前提は触れておらず、ROI判断は不変
2. **D2 の開始条件を厳格化**——発見1/2/3の前置作業（合計 ~6d）を「D2開始ゲート」とし、完了しなければ §3.2 の前置実験に入らない
3. **D4 の優先度を再評価**——真の利益がツール側IOではなくスケジューリングモデル変更であるなら、(a) 30-80ms を受け入れて D4 を P3 後置に落とすか、(b) 方案B（Edit + mtime/hash）を検討して 100-200ms を確保するが追加 5-7d をかける
4. **§1.2 の単回サンプリングベースラインは修正しない**——ただし §5.1 P95 の欄は、D1 が実装され、≥3種のシナリオベースラインが完成するまでは具体的な数字を記載しない

### 6.7 検証でカバーできなかった追質問

以下の追質問は主観的判断や作者の意図に関するものであり、今回の検証では subagent で処理しなかった。今後の設計レビューでの議論のために残す：

- D2 の実施順序を D3 の後ろにするべきか（主観的順序）
- D1/D3 を Phase 1 にまとめて実施すべきか（実施戦略）
- §3.2 の `needsCrossResultReasoning` 閾値 ≥3 が §1.2 のベースラインシナリオに逆適合しているか（作者の意図）
- §5.7 のキーコード位置テーブルの行番号アンカーをシンボルアンカーに変更すべきか（ドキュメント安定性）

---

## 7. 浮利評価と次のステップ（2026-05-26 二次レビュー）

### 7.1 今回の再整理を引き起こした事実

§6 の検証後、さらに**ROI判断を変える2つの事実**が発見された：

1. **DashScope `cache_control` が実装済み**（`packages/core/src/core/openaiContentGenerator/provider/dashscope.ts:172-181`）
   - streaming リクエストに `system + 最後の message + 最後の tool definition` をマーク
   - ヒットデータ `cached_tokens` は既に `usageMetadata.cachedContentTokenCount` に収集されている（`converter.ts:1124-1149`）
   - これは prefix cache の仕組み：Round N+1 は Round N が書き込んだプレフィックスを自動的にヒット
   - **summary ラウンドはまさに最も長いプレフィックスをヒットするラウンド**

2. **system prompt は既に定常状態**（`prompts.ts` 監査結果）
   - cwd / timestamp / git status / ファイルリスト / LSP 状態など「ターンごとに変わる」決定的な問題はない
   - `process.cwd()` は `isGitRepository()` のスイッチとしてのみ使われ、prompt 内容には書き込まれない
   - 唯一の動的点：`save_memory` ツールのトリガー / `/model` 切り替え / MCP 動的ロード（いずれもイベント的であり、低頻度）

### 7.2 これら2つの事実が D2 のROI判断を変えた

§3.2 のドキュメントは「fast model は primary より ~2s 速い」と仮定し、対照ベースラインは **primary uncached vs fast uncached** であった。

しかし実際の稼働では primary は **cached**（summary ラウンドはちょうど最も強いキャッシュをヒットする）であるため、正しい対照は：

> primary cached vs fast uncached

| ルーティング                          | 推定遅延  | 備考                     |
| ----------------------------- | --------- | ------------------------ |
| primary が 80% の確率で prefix cache ヒット   | ~1.8-2.2s | summary ラウンドの現在の実際の性能 |
| fast キャッシュなし（モデル間共有なし） | ~1.5-2s   | D2 切り替え後の実際の性能 |

**純差分：数百ミリ秒、場合によっては fast の方が遅い可能性もある**。これに 14-16d の工数コスト + 品質リスク + fallback の浪費が加わり、**D2 の純利益はほぼゼロまたはマイナス**。

§3.2 の前提条件**に追加が必要**：ベースライン測定では primary **cached** vs fast **uncached** を比較しなければならない。`T_primary_cached < T_fast_uncached × 1.5` の場合、D2 は有効にすべきでない。

### 7.3 候補リスト（浮利度合いで再整理）

**真の浮利（すぐに着手、< 1d 投入、極低リスク、確実な利益）**：

| 項                            | 投入  | 利益                              | 操作位置                                                                    |
| ----------------------------- | ----- | --------------------------------- | --------------------------------------------------------------------------- |
| 簡潔な応答指示                  | 30分 | ~2s/summary ラウンド（出力トークン半減） | `prompts.ts` Final Reminder 段に一文追加                                        |
| cache hit rate テレメトリの露出 | 0.5d  | 0s 直接、後続判断の **enabler**   | `cachedContentTokenCount` は既に収集済み、露出が不足；さらに `save_memory` 後に別途タグを打つべき |

**準浮利（データを待って判断、0.5-1d 投入）**：

| 項                              | 投入                  | 利益                                    | 判断の前提                                                              |
| ------------------------------- | --------------------- | --------------------------------------- | --------------------------------------------------------------------- |
| summary ラウンド `tool_choice='none'` | 0.5-1d                | 0.3-1s（sampling で tool_call token をスキップ） | 「summary ラウンド」の判定ロジックが必要、誤判定リスクは低い                               |
| summary ラウンドで thinking をオフ | 1d                    | 0.5-2s                                  | thinking を有効にするモデルにのみ意味がある（qwen3.5-plus、glm-4.7、kimi-k2.5 等） |
| UI レンダリング層の chunk batching | 0.5d 調査 + 0.5d 実装 | 要検証                                  | 仮定：長い summary の `useGeminiStream` トークンレンダリングの累積オーバーヘッドは少なくない |

**調査待ち（大きな効果の可能性あり）**：

| 項                                   | 調査投入                 | 潜在的利益            | 主要な未知                                                                                   |
| ------------------------------------ | ------------------------ | ------------------- | ------------------------------------------------------------------------------------ |
| ~~DashScope `scope: 'global'` サポート~~ | ~~0.5d ドキュメント + 0.5d A/B~~ | ~~セッション間ヒット~~ | **既に調査、結論 (c) 不可行**（§7.4 発見 B 調査結果参照）。この行は決定記録として残し、調査を再開しないこと |

**中程度の改造（浮利とは言えない、個別評価）**：

| 項                                | 投入             | リスク | 利益        |
| --------------------------------- | ---------------- | ---- | ----------- |
| D1 `skipLlmRound`（終状態クエリシナリオ） | 2-3d             | 中   | 3-4s/終状態ラウンド |
| summary ラウンドツール結果のトリミング（D5 サブセット） | 2d               | 中   | 1-2s        |
| D3 `Summarizing` 状態             | 3-5d             | 中   | 体感改善 3s |
| system prompt の軽量化                | 2-3d 含 A/B テスト | 中   | 0.5-1s      |

**既に廃止した方向（今後実施しない）**：

| 項                                         | 廃止理由                                               |
| ------------------------------------------ | ------------------------------------------------------ |
| D2 fast model ルーティング                     | DashScope cache で相殺され、純利益はほぼゼロまたはマイナス             |
| D4 prevalidate                             | 利益帰属の誤り（実際はスケジューリングモデルによる ~50ms のみ）、5-7d の投入に値しない |
| system prompt 安定化                       | 既に定常状態、実施すべきことはない                                       |
| ストリーミングの早期終了（早期に abort して余計な挨拶を止める） | 誤判定リスクが高く、ユーザーは回答が途中で切られたと感じる                         |

### 7.4 詳細化する価値のある3つの新たな発見

#### 発見 A：`tool_choice='none'` の真の仕組み

OpenAI / DashScope API で `tool_choice='none'` は単に「ツールを呼ばない」という意味だけでなく、モデルの sampling 段階で **`<tool_call>` 特殊トークンの確率割り当てを完全にスキップ**し、デコーダは直接自然言語生成パスを進む。利益は「リトライを1、2回節約する」ことではなく、sampling 自体が高速になることにある。

#### 発見 B：`scope: 'global'` はリポジトリ内に Anthropic の先行例あり

`packages/core/src/core/anthropicContentGenerator/converter.test.ts:85, 1543` に既に `cache_control: { type: 'ephemeral', scope: 'global' }` の使用方法がある。しかし `provider/dashscope.ts:288` で cache_control を設定する際に **scope を渡していない**：

```typescript
cache_control: { type: 'ephemeral' },   // scope なし
```

もし DashScope サーバーが `scope: 'global'` を認識するなら：

- system + tools がグローバルキャッシュに昇格（TTL は ephemeral の 5分よりはるかに長い）
- **セッション間でヒット**、起動遅延も削減
- この1つの利益だけでも、元の D2 の全仮定利益を上回る可能性がある

##### 調査結果（2026-05-26、結論：(c) 不可行、この線は閉じる）

Alibaba Cloud 百煉の公式ドキュメント `help.aliyun.com/zh/model-studio/context-cache` を調べた事実リスト：

| 問題                   | 結論                                                                                                                                                                                               | 証拠                                               |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `scope` フィールドのサポート       | **非対応**。`type: 'ephemeral'` のみ認識。`scope`/`persistent`/`global` はすべて静かに無視される                                                                                                   | 公式ドキュメント原文：「`type` には `ephemeral` のみ設定可能」 |
| ephemeral の実際の TTL     | **5分のスライディングウィンドウ**（ヒット後にリセット）                                                                                                                                                                   | 百煉ドキュメントで明示                                       |
| 長い TTL / グローバル仕組み      | **パブリッククラウド API 側には全くメカニズムなし**。`persistent` type 値も、独立した事前アップロード API も、`prompt_cache_key` もない。唯一の「グローバル永続」プロダクトは PAI グローバルコンテキストキャッシュ（自社デプロイ + vLLM + 灵駿 + 共有 Redis）であり、DashScope API とは無関係 | PAI ドキュメント                                           |
| セッション間共有        | 同一アカウント + 同一モデル + 内容一致 → 既にヒット（これが ephemeral が既に行っていること）。異なるアカウント間では絶対に共有されない                                                                                                         | 百煉ドキュメント                                           |
| 料金                   | cache write 125%、明示的な cache read 10%、**暗黙の cache read 20%**（`cache_control` マークがなくても暗黙の 20% 割引が得られる）                                                                                     | 百煉料金ドキュメント                                       |
| 最小キャッシュ可能 prompt      | **1024 tokens**                                                                                                                                                                                    | 百煉ドキュメント                                           |
| モデルサポート（明示的 cache） | qwen3.7-max / qwen3.6-plus / qwen3.5-plus / qwen3-coder-plus / qwen3-vl-plus / deepseek-v3.2 / kimi-k2.5 / glm-5.1 が全て明示的にリストされている。**qwen3.6-plus と qwen3.7-max は同じく 90% の明示的キャッシュ割引が適用される**        | 百煉モデルリスト（2026-05-26 再確認）                    |

**いくつかの副発見による付随的意味**：

1. **TTL スライディングウィンドウ** は agent loop にとって良いニュース——ループ内の連続呼び出しの間隔は通常 < 30s であり、**キャッシュは常に新鮮で、5分で失効することはない**
2. **暗黙のキャッシュ 20% 割引** は無料のボーナス——`cache_control` をマークしていなくても得られる；ただし細かい制御には明示的マークが必要
3. ~~`qwen3.6-plus` は明示的リストにない~~ —— **訂正（2026-05-26）**：再確認の結果、qwen3.6-plus **は明示的キャッシュリストに含まれている**、90% 割引が適用される。前回の報告ではこの点が誤っていたため、本節の最初の表で訂正済み
4. **`dashscope.ts:288` の現在の実装は DashScope パブリッククラウド API の能力上限**——これ以上搾り出す余地はない

**§7.2 D2 判断への付随的な強化**：

TTL スライディングウィンドウは、agent loop 内で summary ラウンドが**ほぼ 100% の確率で** primary のキャッシュをヒットすることを意味する（直前のラウンドでちょうどヒットしており、5分以内）。D2 で fast model に切り替えると、累積されたキャッシュ書き込みチェーンが壊れるだけでなく、**summary ラウンドは「ほぼ 100% ヒット」から「完全ミス」に退化する**——純利益判断は §7.2 の元の仮定よりも明確にマイナスになる。

#### 発見 C：UI レンダリング層は見落とされていた盲点

§1.2 のベースラインでは「フレームワークオーバーヘッド」を 0.3s（3%）と見積もっているが、これは粗い見積もりである。Ink 7 + React 19.2 では各 chunk が setState → re-render をトリガーし、長い summary では累積で 200-500ms になる可能性がある。`useGeminiStream` がトークンストリームをどのように処理しているか、`requestAnimationFrame` / `useDeferredValue` で chunk をマージしているかを確認する必要がある。

### 7.5 データチェックポイント —— データが来たらどの判断を再確認すべきか

本節は**このドキュメントの活動エントリポイント**：今後何らかのメトリクスデータが得られたら、以下の表と照らし合わせてどの判断を再確認すべきかを決定する。

#### チェックポイント 1：cache hit rate データが出た後

**トリガー条件**：浮利「cache hit rate テレメトリの露出」が稼働開始 ≥3 日、決定ログに `cached_tokens` / `prompt_tokens` の分布が含まれている

**確認すべきデータ**：

- 全体のヒット率（cached / prompt）の P50、P90 分布
- ラウンド別：Round 1 / Round 2 / Round 3 (summary) それぞれのヒット率
- `save_memory` トリガー後の次のラウンドのヒット率（ほぼ 0 になるはず）
- `/model` 切り替え後の次のラウンドのヒット率（ほぼ 0 になるはず）

**判断パス**：

| 全体ヒット率 | 意味                 | 行動                                                                        |
| ---------- | -------------------- | --------------------------------------------------------------------------- |
| > 70%      | 現状は理論的上限に近い | 浮利 #1 簡潔な応答 + 発見 B 調査のみ実施。その他の浮利は必要に応じて                                |
| 40-70%     | まだ余地があるが原因不明   | ラウンド別ヒット率を分析し、どの部分でミスが発生しているかを特定                                         |
| < 40%      | キャッシュを壊す動的点がある  | system prompt / userMemory トリガー頻度を再監査。`save_memory` が想定より頻繁な可能性がある      |

#### チェックポイント 2：DashScope `scope: 'global'` ドキュメント調査結果 ✅ 完了（2026-05-26）

**結果**：**全く認識しない**。詳細は §7.4 発見 B の「調査結果」の段落を参照。

**実行済みの行動**：現状を受け入れ、この項目はスキップする。`dashscope.ts:288` は既存の `ephemeral` マークを維持し、改造は不要。

**この調査を再開しないこと**——ただし DashScope が公式発表で新しい永続化メカニズムを追加した場合を除く。

#### チェックポイント 3：UI レンダリング層の調査結果

**トリガー条件**：発見 C の調査完了（`useGeminiStream` のトークンストリーム処理 + Ink/React DevTools 実測を確認）。

**判断パス**：

| 結果                               | 行動                                             |
| ---------------------------------- | ------------------------------------------------ |
| 長い summary stream レンダリング累積 > 200ms | batching に変更（`useDeferredValue` またはカスタムスロットリング） |
| レンダリングオーバーヘッド < 100ms                   | この手がかりをクローズ                                       |

#### チェックポイント 4：「真の浮利」完了後の二次ベースライン測定

**トリガー条件**：#1 簡潔な応答 + チェックポイント 1/2/3 の判断完了 ≥1 週間。

**確認すべきデータ**：

- エンドツーエンド RT P50 と §1.2 単回サンプリングベースライン（13.4s）との比較
- summary ラウンド単独の P50 / P95
- ユーザー再質問率（浮利 A でユーザー入力分類も併せて行った場合）

**判断パス**：

| 累積削減                     | 行動                                                                          |
| ---------------------------- | ----------------------------------------------------------------------------- |
| > 4s（9.6s エンドツーエンド P50 を達成） | D1 `skipLlmRound` を評価（さらに 3-4s/終状態ラウンド省ける）                                    |
| 2-4s                         | 現状を受け入れ、D3 の体感改善に取り組む価値があるか評価                                          |
| < 2s                         | 再検討：浮利そのものが過大評価されていないか、識別されていないボトルネック（ネットワーク RTT、プロバイダ側レイテンシ）がないか |

### 7.6 §3 の各方向との最終判断

§6 の検証 + 本節の ROI 再整理に基づく：

| 方向                 | §3 元の優先度 | 本節の判断                             | 理由                                               |
| -------------------- | ----------- | ------------------------------------ | -------------------------------------------------- |
| D1 ツール後置命令      | P0          | **P0 維持**、ただし浮利完了後に再評価    | ROI は依然良好だが、「今すぐやる」必要はない——より安価な浮利を先に回収する |
| D2 summary fast ルーティング | P1          | **延期 / 対応しない**                | DashScope cache で相殺され、14-16d の投入に対してほぼ 0 の利益  |
| D3 表示切り離し          | P1          | **オプションとして維持**、チェックポイント 4 のデータを確認 | 体感改善は確実だが、絶対 RT は変わらず、ユーザー行動に依存         |
| D4 ストリーミング早期スケジューリング      | P2          | **延期**                            | 利益帰属の誤り、実際 ~50ms に対して 5-7d は価値がない                   |

### 7.7 推奨実行順序

**Day 1**（1人で1日で完了可能）：

- ✅ `prompts.ts` に簡潔な応答指示を追加（30分）
- ✅ `cachedContentTokenCount` をテレメトリに露出 + `save_memory` / `/model` 切り替え時にタグ付け（0.5d）
- ✅ 発見 B 調査を開始：DashScope `scope: 'global'` ドキュメント確認 + 既存の Anthropic 使用法の対照（0.5d）

**Day 2-3**：

- 最初の batch の cache hit rate データを収集
- 発見 C 調査を開始：`useGeminiStream` の React レンダリングパス
- チェックポイント 2 の結果に基づき、`scope: 'global'` 改造を行うかどうかを決定

**Week 1 末**：

- チェックポイント 1 データ判断（分布を確認）
- `tool_choice='none'` / thinking をオフにするかどうかを決定（hit rate データに基づく）

**Week 2-3**：

- チェックポイント 4 二次ベースライン測定
- D1 を開始するかどうかを決定（最大の非浮利項目、3-4s/終状態ラウンド）

**常に実施しない**：D2 / D4 / system prompt 安定化。

### 7.8 `prompts.ts` 動的コンテンツ監査（2026-05-27）

§7.1 で「system prompt は既に定常状態」という結論を出す際に、大まかな grep のみを行った。本節では `packages/core/src/core/prompts.ts`（1169行）の体系的な監査を行い、リストとして後続のキャッシュヒット率分析と浮利判断の根拠として残す。

**監査方法**：全ての `${...}` 補間式、IIFE、`process.*` / `new Date` / `Date.now` / `Math.random` / `fs.*` 呼び出しを列挙し、各箇所について「同一セッション内で変化するか」を判断する。

#### 完全に存在しない（よく疑われるが問題がない箇所）

| 候補                               | コードの事実                                                                            |
| ---------------------------------- | ----------------------------------------------------------------------------------- |
| `Date.now()` / `new Date()`        | 全文 **0 回出現**（`rg` で全くマッチなし）                                                  |
| `Math.random()`                    | **0 回出現**                                                                        |
| `process.cwd()` 値の prompt への書き込み      | L366 で `if (isGitRepository(process.cwd())) { ... }` のみ、**値は文字列に書き込まれず**、単なるスイッチとして使用 |
| git status / git branch サブプロセス呼び出し | **0 回**、git の部分は静的なガイダンステキスト                                                      |
| 現在のファイルリスト / プロジェクト構造の注入        | **0 回**                                                                            |
| LSP 状態 / エラー数                  | **0 回**                                                                            |
| ユーザー入力履歴                       | **0 回**（history は messages 経由で、system にはない）                                        |

#### 起動時に一度、セッション内で不変

| 位置     | 内容                                                                                             | いつ変わる可能性がある                |
| -------- | ------------------------------------------------------------------------------------------------ | ------------------------- |
| L190     | `process.env['QWEN_SYSTEM_MD']` が basePrompt のソースを決定（デフォルト vs ユーザー system.md）                   | プロセス内で不変                |
| L342-343 | `process.env['SANDBOX']` が sandbox 部分のバージョンを決定（Seatbelt / Sandbox / Outside）                 | プロセス内で不変                |
| L366     | `isGitRepository(process.cwd())` が git 部分を挿入するかどうかを決定                                             | cwd は同一セッション内で通常不変 |
| L871     | `process.env['QWEN_CODE_TOOL_CALL_STYLE']` が tool call スタイルを決定（qwen-coder / qwen-vl / general） | プロセス内で不変                |

#### イベントトリガー（低頻度）

| パラメータ                                              | トリガー条件                                          | 頻度推定           |
| ------------------------------------------------- | ------------------------------------------------- | ------------------ |
| `userMemory`（`getCoreSystemPrompt` 第1引数）     | `save_memory` ツール / `/memory refresh` / 拡張読み込み | 0-3 回/セッション     |
| `model` 名（`getToolCallExamples` のどのブランチを選ぶかに影響） | `/model` 切り替え                                     | 稀               |
| `appendInstruction`                               | 設定項目、セッション内でほぼ不変                        | ほぼなし           |
| `deferredTools`（`buildDeferredToolsSection`）    | MCP ツール動的ロード                                  | セッション起動期が多い |

#### 1つの隠れた小さな問題点

L207-209：`QWEN_SYSTEM_MD` env が設定されている場合、**毎回** `getCoreSystemPrompt` で `fs.readFileSync(systemMdPath)` が実行される：

```typescript
const basePrompt = systemMdEnabled
  ? fs.readFileSync(systemMdPath, 'utf8')
  : `...`;
```

- ファイルが変わらなければ内容は安定 → cache ヒットには影響しない
- しかし毎ラウンドの LLM 呼び出しで同期 IO が1回発生する（デフォルトは `.qwen/system.md`、ネットワークマウントファイルの場合はさらに遅くなる）
- 本節の「cache フレンドリー性」の結論には影響しないが、既知の性能上の小さな問題として記録する

#### 付随的結論

1. **system prompt は定常状態のセッション内で毎回 byte-for-byte で一致する** → DashScope ephemeral cache key（内容のハッシュベース）の全体が安定 → **system 部分の cache ヒット率はほぼ 100%**
2. cache を壊す唯一のイベントは `save_memory`——コア機能であり、cache のために譲歩することはできない
3. **浮利 #1（簡潔な応答指示）のコスト分析**：指示を Final Reminder セクション（L389-390）に追加 → system prompt 内容が一度変化 → **最初のリクエストは cache miss（一度限りのウォームアップコスト）、その後全てのリクエストは引き続き cache ヒット**
4. **§7 の「system prompt 安定化」は既に廃止とした判断が正式な証拠で裏付けられた**——実施する必要がないだけでなく、「理論上実施すれば cache miss 率をさらに下げられる」ということも成立しない。なぜなら、現状が既に ≈ 0 だからである
5. 本監査は後続の関連議論の参照ベースラインとして使用でき、重複した grep を避けることができる。`prompts.ts` に大きな変更があった場合、本節の更新が必要