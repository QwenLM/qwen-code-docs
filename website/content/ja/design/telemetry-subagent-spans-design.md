# サブエージェントトレースツリー設計 (P3 フェーズ 3)

> Issue #3731 — 階層型セッショントレーシングのフェーズ 3。`qwen-code.subagent` スパンを追加することで、サブエージェント呼び出しが分離され、クエリ可能なトレース構造になり、親の `qwen-code.interaction` スパンに暗黙的に混在することがなくなります。
>
> フェーズ 1 (#4126)、フェーズ 1.5 (#4302)、フェーズ 2 (#4321) の上に構築されます。

## 問題

現在、すべての `AgentTool.execute` 呼び出しは親の `qwen-code.interaction` スパンの下で実行されます。3つの問題があります：

1. **並行するサブエージェントが混在する。** `coreToolScheduler.ts:728` は `AGENT` を同時実行安全としてマークします — `Promise.all` は最大10個のサブエージェントを並行して実行します。それらの LLM リクエスト / ツール / フック スパンはすべて、単一の共有親インタラクションスパンにアタッチされるため、トレースエクスプローラは「この LLM リクエストはサブエージェント A に属する」と「これはサブエージェント B に属する」を区別できません。
2. **サブエージェント境界自体のスパンがない。** `qwen-code.subagent_execution` LogRecord (`agent-headless.ts:268,329` から発行) があり、`LogToSpanProcessor` を介して同じ名前のスパンにブリッジされますが、これはスタンドアロンのマーカーであり、サブエージェントの LLM / ツール / フック スパンをネストする親ではありません。
3. **フォーク / バックグラウンドサブエージェントが宙に浮く。** ファイア・アンド・フォーゲットパス (`runInForkContext` / バックグラウンド) は親の `AgentTool.execute` よりも長生きし、複数の後続のユーザーターンにわたってスパンを発行します。それらのスパンが表示される頃には親のツールスパンは既に終了しているため、OTel の `context.active()` は役に立ちません。それらは発火時にたまたまアクティブだったインタラクションにアタッチされるか、どこにもアタッチされません。

## 既存の表面 (変更なし)

| コンポーネント                     | 場所                                                                                                                                                                                                 | 変更しない理由                                                                      |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 生成サイト (統合)                   | `packages/core/src/tools/agent/agent.ts:1147` `AgentTool.execute()`                                                                                                                                  | 単一のエントリポイント。3つの呼び出しフレーバーに理想的なフック                      |
| 3つの呼び出しフレーバー             | フォアグラウンド名前付き (`runFramed` at `:2154` — await 待機), フォーク (`void runInForkContext(runFramedFork)` at `:1991` — ファイア・アンド・フォーゲット), バックグラウンド (`void framedBgBody()` at `:1934` — ファイア・アンド・フォーゲット) | ライフサイクルが異なる — スパン設計は全てをカバー                                    |
| 並行性                             | `coreToolScheduler.runConcurrently` (`Promise.all`, 最大10) — `partitionToolCalls` が AGENT を `concurrent: true` とマークすることで駆動                                                      | これが分離を必要とする理由                                                            |
| `runInForkContext` ALS             | `packages/core/src/tools/agent/fork-subagent.ts:32` `forkExecutionStorage`                                                                                                                           | 再帰的フォークガードのみ — OTel コンテキストは伝播しない                              |
| エージェント ID ALS                | `packages/core/src/agents/runtime/agent-context.ts:46` `runWithAgentContext(agentId, ...)`                                                                                                           | 既に `agentId` を保持；`depth` で拡張する                                             |
| `SubagentExecutionEvent` LogRecord | `agent-headless.ts:268,329` → `loggers.ts:773` → 3つの下流 (LogToSpanProcessor スパンブリッジ + QwenLogger RUM + `recordSubagentExecutionMetrics`)                                                  | LogRecord は維持；下流はそれに依存する                                                |

## スコープ外 (延期)

- **サブエージェントごとのトークン使用量集計** (`gen_ai.usage.*` をサブエージェント内のすべての LLM スパンで合計)。フェーズ 4 (LLM リクエスト分解) に属します。
- **`qwen-code.subagent_execution` LogRecord を新しいスパンのスパンイベントとして移行する。** RUM とメトリクスは LogRecord に密結合されています。3つのコンシューマすべてをまとめて再交渉できるフォローアップに延期します。
- **自動コストロールアップ。** 同じ理由 — まずトークン使用量が必要です。
- **AGENT ツールの `concurrent: true` マーカーを削除する。** 並行性は正しいです。制約するのではなく、計装します。

## 参考文献 (意思決定の根拠)

| ソース                                                                                                                  | 重要なポイント                                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [OTel Trace Spec — Spans 間のリンク](https://opentelemetry.io/docs/specs/otel/overview/#links-between-spans)            | そのまま引用: "新しいリンクされた Trace は、多くの高速な受信リクエストの1つによって開始された、長時間実行される非同期データ処理操作を表すこともあります。" → フォーク/バックグラウンドは、リンクされたルートであるべきであり、子ではありません。                                                                                   |
| [OTel GenAI Agent Spans](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-agent-spans/) (ステータス: 開発中) | スパン名 `invoke_agent {gen_ai.agent.name}`; 必須属性 `gen_ai.operation.name`, `gen_ai.provider.name`; 推奨: `gen_ai.agent.id`, `gen_ai.agent.name`, `gen_ai.conversation.id`.                                                                                                                                                    |
| LangSmith — 25,000 実行 / トレース上限                                                                                   | 長いエージェントセッションは最終的にトレース分割を強制します。hybrid traceId 設計を支持します。                                                                                                                                                                                                                                   |
| [Sentry — 分散トレーシング](https://docs.sentry.io/concepts/key-terms/tracing/distributed-tracing/)                   | "子トランザクションは、親スパンを含むトランザクションよりも長生きする可能性があります" — 親より長生きする子はサポートされています。                                                                                                                                                                                              |
| claude-code (Anthropic)                                                                                                 | サブエージェント階層をローカルの Perfetto JSON ファイルにのみ保持; OTel エクスポートはフラットです。移植可能なコードはありません。                                                                                                                                                                                               |
| opencode (sst/opencode)                                                                                                 | `@effect/opentelemetry` 自動計装を使用; `withRunSpan` のために明示的な `context.with(trace.setSpan(active, span), fn)` を使用。**context.with 分離パターンを検証します。** 手動の `AsyncLocalStorageContextManager` 登録に関する彼らの警告は該当しません — qwen-code の `NodeSDK` が自動的に登録します。                                       |

## 設計 — 6つの決定、それぞれ正当化

### D1 — スパンライフサイクル: 呼び出し元が開始し、呼び出し先は `context.with(span, fn)` 内で実行

`agent.ts` (呼び出し元) がスパンを構築します。本体 — await 待機 (`runFramed`) かファイア・アンド・フォーゲット (`runInForkContext` / バックグラウンド) か — は `runInSubagentSpanContext(span, fn)` 内で実行され、これは `otelContext.with(trace.setSpan(active, span), fn)` を呼び出します。

**`AgentTool.execute` 内のどこでスパンが開かれるか？** 呼び出しフレーバー固有のセットアップ (`createAgentHeadless` / `createForkSubagent` など) の**直前**に開きます — これにより、セットアップ時間 (設定ビルド、ToolRegistry 再構築、ContextOverride 配線) が `qwen-code.subagent` の期間に含まれます。「なぜこのサブエージェントは遅いのか？」を追跡するオペレーターは全体像を見ることができます。セットアップは通常 LLM 時間よりもはるかに短いため、これはノイズになりません。

検討した代替案: セットアップ後に開き、セットアップ時間を除外する。却下: サブエージェントのセットアップはサブエージェントに帰属する作業そのものです。それを隠すと、すべてのサブエージェントスパンを合計するときに合計時間の計算が間違ってしまいます。

**呼び出し先のみではダメな理由**: フォーク/バックグラウンド本体が実際に実行される頃には、呼び出し元はすでに戻っています。OTel の `context.active()` は、非同期ランタイムが引き継ぐ任意のアンビエントコンテキストを返します — これは、親が終了した後の `void` ファイア・アンド・フォーゲットでは信頼できません。親スパンはすでに閉じられています。事後的に再ペアレントすることは誤りです。

**呼び出し元のみではダメな理由**: フォアグラウンドはそれでうまく動作しますが、フォーク/バックグラウンドスパンは `AgentTool.execute` が戻った後も子スパン (LLM / ツール / フック) を発行し続ける必要があります。これらの子スパンは `context.active()` がサブエージェントスパンを返す必要があります — これは、本体が明示的に `context.with(subagentSpan, body)` 内で実行された場合にのみ発生します。

両方の端が必要です。**設計は橋渡しです** — 呼び出し元がスパン + invocationKind 対応 traceId 戦略を作成し、`runInSubagentSpanContext` を介してハンドオフします。

### D2 — ハイブリッド traceId: フォアグラウンド = 子スパン、フォーク/バックグラウンド = 新しい traceId + Link

| 呼び出し種類   | 親                                                              | TraceId                 | 理由                                                                                                                                                                    |
| -------------- | --------------------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `foreground`   | 呼び出し元のツールスパンの子                                          | 親の traceId を継承        | OTel のデフォルト; 呼び出し元が呼び出し先を時間的に完全に包含する                                                                                     |
| `fork`         | リンクされたルートスパン                                                | 新しい traceId             | 呼び出し元はすぐに戻る; フォークは複数の後続インタラクションにわたって実行される。OTel 仕様はそのまま Link を推奨。親トレースの期間/サイズが膨らむのを防ぐ。        |
| `background`   | リンクされたルートスパン                                                | 新しい traceId             | フォークと同じ理由。                                                                                                                                                  |

**Link ペイロード**:

```ts
tracer.startSpan(
  'qwen-code.subagent',
  {
    kind: SpanKind.INTERNAL,
    links: [
      {
        context: invokerSpanContext,
        attributes: { 'qwen-code.link.kind': 'invoker' },
      },
    ],
  } /* 明示的コンテキスト = ルート、アクティブは継承しない */,
);
```

セッション ID によるクロストレース検索: `gen_ai.conversation.id` はすべてのサブエージェントスパン (フォアグラウンドとリンクされたルートの両方) に設定されるため、`session.id` で ARMS クエリを実行すると、親インタラクションのトレースとリンクされたルートサブエージェントトレースの両方が返されます。Link 自体は親トレースの UI に「Spawned: subagent X (other trace)」として表示されるため、ナビゲーションが機能します。

**常に子ではない理由**: 4時間のバックグラウンドサブエージェントは親トレースの壁掛け時間を4時間に引き伸ばし、トレースサイズがいくつかのバックエンドの上限 (LangSmith の25,000実行制限が最も明確に文書化された境界) を超えます。ユーザーが実際に待っているフォアグラウンドサブエージェントは、時間的に包含されているためこの問題はありません。

**常にリンクされたルートではない理由**: フォアグラウンドは自然なトレースツリーを壊します。同期的な Explore サブエージェントを実行するユーザープロンプトは、2つのリンクされたトレースではなく、1つのツリーを表示するべきです。

### D3 — TTL: タイプ認識、サブエージェントフォーク/バックグラウンド = 4h、その他 = 30min

`session-tracing.ts:124` は `SPAN_TTL_MS = 30 * 60 * 1000` を定義しています。スイープ (`:144-152`) は既に `tool.blocked_on_user` を特別扱いして `decision: 'aborted' + source: 'system'` をスタンプしています。精神的には既にタイプ認識です。

**変更**: タイプごとの TTL を導入:

```ts
const SPAN_TTL_MS_DEFAULT = 30 * 60 * 1000; // 30min
const SPAN_TTL_MS_LONG = 4 * 60 * 60 * 1000; // 4h

function ttlFor(ctx: SpanContext): number {
  if (
    ctx.type === 'subagent' &&
    ctx.attributes['qwen-code.subagent.invocation_kind'] !== 'foreground'
  ) {
    return SPAN_TTL_MS_LONG;
  }
  return SPAN_TTL_MS_DEFAULT;
}
```

TTL 期限切れ時に、サブエージェントスパンには次のようにスタンプされます:

```ts
{
  'qwen-code.span.ttl_expired': true,
  'qwen-code.span.duration_ms': age,
  'qwen-code.subagent.status': 'aborted',
  'qwen-code.subagent.terminate_reason': 'ttl_swept',
}
```

**なぜ30分固定ではないのか**: 正当な長時間サブエージェント (大規模リポジトリ分析、遅いビルド、深いリサーチタスク) が TTL 期限切れと誤ってスタンプされます。4時間は99パーセンタイルをカバーしつつ、実際のハングを見逃さないほど緩すぎません。

**なぜTTLなしではないのか**: プロセスクラッシュ / OOM / kill -9 → スパンが `activeSpans` Map に永遠に残ります。30分のセーフティネットはこれを防ぎます; サブエージェントフォーク/バックグラウンドはより広いウィンドウが必要なだけで、削除ではありません。

**4時間の根拠**: 非自明なエージェントタスク (長期深層リサーチ / 大規模コードベース分析) の実用的な上限。本番データが間違いを示した場合、定数で設定可能です。

### D4 — LogRecord 保持: 発行は維持し、LogToSpanProcessor ブリッジはスキップ

`SubagentExecutionEvent` LogRecord には3つの下流コンシューマがあります (リポジトリ監査で確認):

| コンシューマ                                                                                    | 位置                                                 | アクション                                                                                                                                |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| OTel LogRecord → `LogToSpanProcessor` → ブリッジスパン `qwen-code.subagent_execution`          | `loggers.ts:773` → `log-to-span-processor.ts:346`    | サブエージェントイベントに対してこの**ブリッジをスキップ** — 新しい `qwen-code.subagent` スパンが置き換える                                 |
| QwenLogger RUM 取り込み (Alibaba 内部統計)                                                        | `qwen-logger.ts:573-574`                             | 維持 — RUM は OTel スパンを見ず、LogRecord のみを見る                                                                                       |
| `recordSubagentExecutionMetrics` カウンター                                                       | `metrics.ts:829`                                     | 維持 — メトリクスコンシューマはトレースブリッジから独立                                                                                     |

**ブリッジスキップ** (LogToSpanProcessor への唯一の変更):

```ts
// log-to-span-processor.ts — onEmit 内、deriveSpanName の後
const skipBridge = new Set<string>([
  EVENT_SUBAGENT_EXECUTION, // ネイティブの qwen-code.subagent スパンでカバーされる
]);
if (skipBridge.has(eventName)) return;
```

**トレースコンシューマへの影響**: スパン名 `qwen-code.subagent_execution` でフィルタリングしていたダッシュボードはゼロ件の結果を返し始めます。これらは `qwen-code.subagent` に更新する必要があります。リリースノートに記載します。

**LogRecord を削除しない理由**: RUM とメトリクスの入力です。削除は3システムのリファクタリングになります。ここではスコープ外です。

**両方を維持しない理由**: トレースではサブエージェントあたり2つのスパン (`qwen-code.subagent` + `qwen-code.subagent_execution`) が重複情報を保持して表示され、トレースを読むオペレーターにとって混乱を招き、スパン容量が重複します。

### D5 — スパン名 + 属性: ハイブリッド仕様準拠、拡張用のベンダープレフィックス

**スパン名**: `qwen-code.subagent` (フェーズ1/2のコードベース規則に一致: `qwen-code.interaction`, `qwen-code.tool`, `qwen-code.hook`, …)。

OTel GenAI 仕様では、標準スパン名は `invoke_agent {gen_ai.agent.name}` ですが、**また**「個々の GenAI システム/フレームワークは異なるスパン名形式を指定してもよい」と述べています。独自の名前を使用し、`gen_ai.operation.name='invoke_agent'` を設定して、仕様認識ツールがスパンを識別できるようにします。トレースツリーを読むオペレーターは一貫した `qwen-code.*` 命名規則を確認できます。

**スパン種類**: `INTERNAL` (プロセス内サブエージェント呼び出し、仕様に従う)。

**属性セット**:

| カテゴリ                                                         | 属性                                             | ソース                                                                    | 備考                                                                                                                                                                            |
| ---------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **必須仕様**                                                     | `gen_ai.operation.name='invoke_agent'`           | リテラル                                                                  | 仕様必須                                                                                                                                                                        |
| **必須仕様**                                                     | `gen_ai.provider.name='qwen-code'`               | リテラル                                                                  | 仕様必須; プロセス内エージェントでは曖昧 (仕様は LLM プロバイダー用に書かれた)。`'qwen-code'` に設定するのが最も正直な解釈                                                       |
| **必須 (二重発行)**                                              | `gen_ai.agent.id` + `qwen-code.subagent.id`      | `agentContext.agentId`                                                    | 仕様が安定するまで二重発行; 後でベンダーキーを削除                                                                                                                              |
| **必須 (二重発行)**                                              | `gen_ai.agent.name` + `qwen-code.subagent.name`  | `agentConfig.subagentType` (例: `Explore`, `code-reviewer`, `fork`)       | 同じ二重発行                                                                                                                                                                    |
| **推奨仕様**                                                     | `gen_ai.conversation.id`                         | `config.getSessionId()`                                                   | セッションによるクロストレースクエリを有効にする; 既存の `session.id` スパン属性 (#4367 でグローバル設定) と共存 — 両方とも同じ UUID を指す。仕様が安定したら一方を削除                |
| **推奨仕様**                                                     | `gen_ai.request.model`                           | モデルオーバーライド (あれば)                                                     | サブエージェントが親モデルをオーバーライドする場合のみ                                                                                                                              |
| **ベンダー**                                                     | `qwen-code.subagent.invocation_kind`             | `'foreground'` ❘ `'fork'` ❘ `'background'`                               | TTL + traceId 戦略を駆動                                                                                                                                                          |
| **ベンダー**                                                     | `qwen-code.subagent.is_built_in`                 | bool                                                                      | ダッシュボードフィルター                                                                                                                                                          |
| **ベンダー**                                                     | `qwen-code.subagent.parent_agent_id`             | 親 ALS `agentId`                                                          | ネストされたサブエージェント + クロストレース系統用                                                                                                                              |
| **ベンダー**                                                     | `qwen-code.subagent.depth`                       | 親の depth + 1 (トップ = 0)                                               | 再帰バグ検出器                                                                                                                                                                  |
| **ベンダー**                                                     | `qwen-code.subagent.invoking_request_id`         | `agentContext` から                                                        | リクエストレベルの相関                                                                                                                                                          |
| **スパン終了仕様**                                               | `error.type` (失敗時)                            | エラークラス                                                              | OTel 標準                                                                                                                                                                        |
| **スパン終了仕様**                                               | `exception.message` (失敗時)                     | `truncateSpanError(error.message)`                                        | OTel 標準; フェーズ2のトランケーションを再利用                                                                                                                                   |
| **スパン終了ベンダー**                                           | `qwen-code.subagent.status`                      | `'completed'` ❘ `'failed'` ❘ `'cancelled'` ❘ `'aborted'`                  | OTel SpanStatus (OK / ERROR / UNSET) よりも細かい                                                                                                                                 |
| **スパン終了ベンダー**                                           | `qwen-code.subagent.terminate_reason`            | `SubagentExecutionEvent.terminate_reason` から                            | 例: `task_complete`, `max_iterations`, `user_abort`, `ttl_swept`                                                                                                                 |
| **スパン終了ベンダー**                                           | `qwen-code.subagent.result_summary_present`      | bool                                                                      | 「サブエージェントは出力を生成したか」— 有界                                                                                                                                       |
| **オプトイン (機密)** ゲート `includeSensitiveSpanAttributes` により制御 | `gen_ai.input.messages`                          | 構造化チャット履歴                                                        | #4097 のゲートを再利用                                                                                                                                                            |
| **オプトイン (機密)**                                           | `gen_ai.output.messages`                         | モデル応答                                                                | 同じゲート                                                                                                                                                                        |
| **オプトイン (機密)**                                           | `gen_ai.system_instructions`                     | システムプロンプト                                                        | 同じゲート                                                                                                                                                                        |
| **オプトイン (機密)**                                           | `gen_ai.tool.definitions`                        | ツールスキーマ                                                            | 同じゲート                                                                                                                                                                        |
**SpanStatus のマッピング**:

- `status === 'completed'` → `SpanStatus { code: OK }`
- `status === 'failed'` → `SpanStatus { code: ERROR, message: truncated(error.message) }`
- `status === 'cancelled'` または `'aborted'` → `SpanStatus { code: UNSET }` (Phase 2 の慣例に従う)

**`id` + `name` で dual-emit する理由**: 仕様は Development 段階 (Experimental より一段階手前)。`OTEL_SEMCONV_STABILITY_OPT_IN=gen_ai_latest_experimental` でオプトイン可能。仕様の属性名は Stable になる前に変更される可能性がある。Dual-emit は Phase 2 が `call_id` → `tool.call_id` で使用したのと同じパターン。仕様が Stable に達したら vendor key を削除する。

**なぜ `qwen-code.subagent.*` なのか (`qwen.subagent.*` ではないのか)**: `constants.ts` 内の既存の vendor 接頭辞付きキーはすべて `qwen-code.*` を使用している (`qwen-code.user_prompt`, `qwen-code.tool_call` など)。OTel の命名規則の好みよりも内部の一貫性を優先する。これは、オペレーターが ARMS で接頭辞によるクエリを実行するため。

**カーディナリティ**: OTel では span 属性はメトリクスラベルではない。UUID をキーとする属性 (`id`, `parent_agent_id`, `invoking_request_id`) は span レイヤーでは安全。後でメトリクスラベルに昇格させないこと。

**span あたり約 10～15 属性** (呼び出しの種類、失敗、ネストによって異なる)。`qwen-code.tool` と同じ順序。

### D6 — `AgentContext.depth` フィールドを直接追加

`AgentContext` (`agent-context.ts:32`) は **エクスポートされていない** — ヘルパー (`getCurrentAgentId`、`runWithAgentContext`、`getRuntimeContentGenerator`、`runWithRuntimeContentGenerator`) のみがエクスポートされている。TypeScript レベルでの下流への影響はゼロ。`getCurrentAgentId()` を介した 6 つの既知の読み取り元は `agentId` のみを読み取る。`depth?: number` を追加してもそれらには影響しない。

```ts
interface AgentContext {
  agentId: string;
  subagentName: string;
  invokingRequestId: string;
  invocationKind: 'spawn' | 'resume';
  isBuiltIn: boolean;
  depth?: number; // NEW — デフォルトは読み取り元で 0
}
```

`runWithAgentContext` は既に `{ ...current, agentId }` スプレッドを使用しているため、`depth` は既存の呼び出し箇所で変更されずに維持される。**`runWithAgentContext` を更新して内部で depth を自動インクリメントする** — 呼び出し側は depth を意識する必要がない:

```ts
function runWithAgentContext<T>(agentId: string, fn: () => T): T {
  const parent = agentContextStorage.getStore();
  const next: AgentContext = {
    ...parent,
    agentId,
    depth: (parent?.depth ?? -1) + 1, // 自動インクリメント
  };
  return agentContextStorage.run(next, fn);
}
```

トップレベルのサブエージェント: 親 ALS なし → `depth: 0`。ネスト: 親 depth + 1。

新しい小さなアクセサ `getCurrentAgentDepth(): number` は `agentContextStorage.getStore()?.depth ?? 0` を返す — `startSubagentSpan` で `qwen-code.subagent.depth` を設定するために使用される。

**なぜテレメトリ専用の別の ALS ではないのか**: 既に保持しているのと同じコンテキスト形状を複製することになる。良くない。既存のものを再利用する。

## ヘルパー API (`session-tracing.ts`)

```ts
// constants.ts
export const SPAN_SUBAGENT = 'qwen-code.subagent';

// session-tracing.ts
export interface StartSubagentSpanOptions {
  agentId: string;
  subagentName: string;
  invocationKind: 'foreground' | 'fork' | 'background';
  isBuiltIn: boolean;
  parentAgentId?: string;
  depth: number;
  invokingRequestId?: string;
  sessionId: string;
  modelOverride?: string;
  invokerSpanContext?: SpanContext; // fork / background で必須 (Link ソース)
}

export interface SubagentSpanMetadata {
  status: 'completed' | 'failed' | 'cancelled' | 'aborted';
  terminateReason?: string;
  resultSummaryPresent?: boolean;
  error?: string;
  errorType?: string;
}

export function startSubagentSpan(opts: StartSubagentSpanOptions): Span;
export function endSubagentSpan(
  span: Span,
  metadata: SubagentSpanMetadata,
): void;
export function runInSubagentSpanContext<T>(
  span: Span,
  fn: () => Promise<T>,
): Promise<T>;
```

`runInSubagentSpanContext` が分離プリミティブ:

```ts
export function runInSubagentSpanContext<T>(
  span: Span,
  fn: () => Promise<T>,
): Promise<T> {
  const ctx = trace.setSpan(otelContext.active(), span);
  return otelContext.with(ctx, fn);
}
```

`startSubagentSpan` は内部で `invocationKind` によって分岐する:

```ts
function startSubagentSpan(opts: StartSubagentSpanOptions): Span {
  const attributes = buildSpanAttributes(opts);
  const tracer = getTracer();

  if (opts.invocationKind === 'foreground') {
    // 現在のアクティブ span (呼び出し元のツール span) の子
    return tracer.startSpan(SPAN_SUBAGENT, {
      kind: SpanKind.INTERNAL,
      attributes,
    });
  }

  // fork / background: リンクされたルート span
  return tracer.startSpan(SPAN_SUBAGENT, {
    kind: SpanKind.INTERNAL,
    attributes,
    links: opts.invokerSpanContext
      ? [
          {
            context: opts.invokerSpanContext,
            attributes: { 'qwen-code.link.kind': 'invoker' },
          },
        ]
      : undefined,
    root: true, // 新しい traceId を強制。アクティブなコンテキストを親として無視
  });
}
```

## ライフサイクルの配線

### Foreground named (一般的なパス)

```ts
// agent.ts:~2154
// 親の ALS フレームを取得して、parentAgentId を span に設定する。新しい子の
// depth は runWithAgentContext 内で自動的に計算される (D6)。
// 子の ALS フレームの **内部** に入ったら getCurrentAgentDepth() で読み取る。
// 2 ステップ:
const parentAgentId = getCurrentAgentId();  // 子フレームに入る前

// ... 既存の runFramed 呼び出しが runWithAgentContext(hookOpts.agentId, ...) に入る ...

// runFramed の内部で、子の depth を読み取れる:
//   const depth = getCurrentAgentDepth();
//
// 実用的な配置: depth をクロージャ変数として渡し、runWithAgentContext が有効になった後に設定する
// または、呼び出し側で `(外側の getCurrentAgentDepth()) + 1` として計算する (よりシンプル)。
const depth = getCurrentAgentDepth();  // フレームの外側; 子はこれ + 1 になる
// (startSubagentSpan の引数で qwen-code.subagent.depth = depth を設定)

const span = startSubagentSpan({
  agentId, subagentName, invocationKind: 'foreground',
  isBuiltIn, parentAgentId, depth, invokingRequestId, sessionId,
  modelOverride,
  // invokerSpanContext は省略 — foreground は context.with で自然に継承される
});
let metadata: SubagentSpanMetadata = { status: 'aborted' };
try {
  await runInSubagentSpanContext(span, () =>
    runFramed(() => this.runSubagentWithHooks(...)),
  );
  metadata = { status: 'completed' /* + resultSummaryPresent */ };
} catch (error) {
  metadata = {
    status: signal.aborted ? 'aborted' : 'failed',
    error: error instanceof Error ? error.message : String(error),
    errorType: error?.constructor?.name,
  };
  throw error;
} finally {
  endSubagentSpan(span, metadata);
}
```

### Fork (fire-and-forget)

```ts
const invokerSpanContext = trace.getSpan(otelContext.active())?.spanContext();
const span = startSubagentSpan({
  ..., invocationKind: 'fork', invokerSpanContext,
});
void runInForkContext(() =>
  runInSubagentSpanContext(span, async () => {
    let metadata: SubagentSpanMetadata = { status: 'aborted' };
    try {
      await runFramedFork();
      metadata = { status: 'completed' };
    } catch (error) {
      metadata = {
        status: signal.aborted ? 'aborted' : 'failed',
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      endSubagentSpan(span, metadata);
    }
  }),
);
// AgentTool.execute は直ちに FORK_PLACEHOLDER_RESULT を返す;
// span は親セッションのその後のインタラクションにわたって存続する。
```

### Background

fork と同じ形状で、`invocationKind: 'background'` と `eventEmitter` の代わりに `bgEventEmitter` を使用する。TTL は 4h (fork と同じ — D3 の型ルール)。

## 並行分離 — 主要な保証

1 つのユーザープロンプトからの 3 つの並行サブエージェント呼び出し (モデルが 3 つの AGENT tool_use ブロックを出力 → `coreToolScheduler.runConcurrently` が 3 つの `executeSingleToolCall` を並行実行。それぞれが Phase 2 に従って自身の `qwen-code.tool` span を開始):

```
qwen-code.interaction                         [traceId=T0]
├─ qwen-code.tool [agent call #A]
│  └─ qwen-code.subagent (A, foreground)     [traceId=T0, child]
│     ├─ qwen-code.llm_request
│     └─ qwen-code.tool [...]
│        └─ qwen-code.tool.execution
├─ qwen-code.tool [agent call #B]
│  └─ qwen-code.subagent (B, foreground)     [traceId=T0, child]
│     └─ qwen-code.llm_request
└─ qwen-code.tool [agent call #C]
   └─ qwen-code.subagent (C, fork)           [traceId=T1, linked root]
      └─ qwen-code.llm_request                [traceId=T1]
         └─ ...                               [traceId=T1, 数時間後に出力される可能性あり]
```

A、B、C のそれぞれに対して `context.with(span, runX)` が並行実行される。`AsyncLocalStorageContextManager` (NodeSDK によって `sdk.ts:273` で既に自動登録済み) がファイバーごとにスコープするため、クロストークは発生しない。各サブエージェントの子 LLM / tool / hook span は、自身の非同期チェーン内で `context.active()` を介して `span` を認識する。

fork (C) は別のトレース — その子 span は、親セッションのその後の複数のインタラクションにわたって出力される場合でも `traceId=T1` を継承する。`session.id` による ARMS クエリは T0 と T1 の両方を返す。T1 のルートから C の呼び出し元 `qwen-code.tool` span への Link が明示的なナビゲーションを提供する。

## 変更するファイル

| ファイル                                                        | 変更内容                                                                                                                                                                                        | 推定 LOC |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `packages/core/src/telemetry/constants.ts`                  | `SPAN_SUBAGENT`、`SPAN_TTL_MS_LONG`、属性キー定数を追加                                                                                                                              | +8      |
| `packages/core/src/telemetry/session-tracing.ts`            | `startSubagentSpan` (foreground/linked-root 分岐)、`endSubagentSpan`、`runInSubagentSpanContext`、型を追加。`SpanType` union に `'subagent'` を追加。`ttlFor(ctx)` で TTL スイープを拡張 | +120    |
| `packages/core/src/telemetry/log-to-span-processor.ts`      | `qwen-code.subagent_execution` のブリッジをバイパスするためのスキップリスト                                                                                                                   | +6      |
| `packages/core/src/telemetry/index.ts`                      | 新しいヘルパー + 型を再エクスポート                                                                                                                                                                 | +6      |
| `packages/core/src/agents/runtime/agent-context.ts`         | `depth?: number` を `AgentContext` に追加 + `getCurrentAgentDepth()` アクセサ                                                                                                                    | +12     |
| `packages/core/src/tools/agent/agent.ts`                    | 3 つの実行パス (foreground/fork/background) を try/catch/finally 付き `runInSubagentSpanContext` でラップ                                                                                      | +60     |
| `packages/core/src/telemetry/session-tracing.test.ts`       | 新しい `describe('subagent spans')`: start/end、child vs linked-root、コンテキスト伝搬、depth、タイプ別 TTL、べき等な end、SDK 未初期化時の NOOP                                                                     | +120    |
| `packages/core/src/telemetry/log-to-span-processor.test.ts` | スキップリストが subagent_execution ブリッジをショートサーキットすることをアサート                                                                                                                   | +20     |
| `packages/core/src/tools/agent/agent.test.ts`               | エンドツーエンド: 3 つの並行サブエージェントがそれぞれ独立したサブツリーを取得。fork の span は Link を介して新しい traceId を継承。background のライフサイクル                                                                     | +80     |

合計: 9 ファイル、約 430 LOC。通常の Phase 2 コミットよりも大きいが、正当化される — TTL の変更は別のファイル、LogToSpanProcessor のスキップは別のファイル、テストファイルは倍増している。分割すると不完全なテレメトリーサーフェスになってしまう。

レビューでサイズが問題になった場合: 2 つの PR に分割 — (A) テレメトリーヘルパー + テスト、(B) `agent.ts` の配線 + e2e テスト。先にマージされたヘルパーはランタイムの動作を変更しない。

## テスト戦略

| テスト                                                                         | 何を証明するか                                                  |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `startSubagentSpan foreground parents to active OTel span`                   | 子 span パス                                                 |
| `startSubagentSpan fork creates new traceId + Link to invoker`               | linked-root パス                                                |
| `runInSubagentSpanContext propagates span through awaits / Promise.all`      | 分離プリミティブ                                             |
| `3 concurrent subagent spans don't share children`                           | 主要な並行性保証                                  |
| `nested subagent records depth + parentAgentId`                              | ネストのメタデータ                                                |
| `endSubagentSpan status mapping (completed / failed / cancelled / aborted)`  | ステータスの分類                                                 |
| `endSubagentSpan dual-emits gen_ai.agent.id + qwen-code.subagent.id`         | 仕様準拠の dual-emit                                       |
| `fork lifecycle: span survives AgentTool.execute return`                     | fire-and-forget の正確性                                     |
| `TTL: subagent fork stays past 30min, gets stamped + ended at 4h`            | タイプ認識型 TTL                                                  |
| `TTL: foreground subagent at 30min gets default sweep`                       | TTL が過度に拡張されない                                         |
| `LogToSpanProcessor skips qwen-code.subagent_execution but still RUM-emits`  | ブリッジスキップの動作確認                                               |
| `runConcurrently of 3 agent tool calls produces 3 distinct subagent spans`   | スケジューラーレベルでのエンドツーエンド                                   |
| `failed subagent sets exception.message + error.type + SpanStatus=ERROR`     | OTel 標準のエラーパス                                        |
| `opt-in attrs gated on includeSensitiveSpanAttributes`                       | #4097 のゲートを正しく再利用していること                                       |
| `startSubagentSpan returns NOOP_SPAN when SDK is uninitialized`              | Phase 1/2 の NOOP ディシプリンと一致。下流の呼び出しは安全なまま                             |
| `fork span Link.context matches invoker tool span's spanContext`             | クロストレースナビゲーションがエンドツーエンドで機能すること                         |
| `runWithAgentContext auto-increments depth: parent=0, child=1, grandchild=2` | 呼び出し側の協力なしで depth のブックキーピングが正しいこと |

## エッジケース

| ケース                                                                                                                    | 処理                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ツール内のサブエージェント内のサブエージェント (depth > 1)                                                                        | `depth` 属性で追跡。depth ≥ 5 でソフトな `debugLogger.warn` を推奨 (無限再帰検出器)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 親ツールの `awaiting_approval` 中に生成されたサブエージェント                                                             | サブエージェント span は AGENT ツール span の子。AGENT ツールの `tool.blocked_on_user` は兄弟であり、親ではない — 両方とも AGENT ツール span の子。ツリーは正しいまま                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| サブエージェント実行中に `signal.aborted`                                                                                           | `runInSubagentSpanContext` のコールバックが throw または resolve。`finally` で `status='aborted'`、SpanStatus UNSET を設定                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 親セッション終了時に fork がまだ生きている                                                                               | 4h TTL が発火。センチネル属性 `qwen-code.span.ttl_expired:true`、`qwen-code.subagent.terminate_reason='ttl_swept'`、`status='aborted'`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `endSubagentSpan` が 2 回呼び出された                                                                                          | べき等 — `activeSpans` マップをチェック。2 回目は no-op (Phase 2 のパターンと一致)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| サブエージェントの LLM 呼び出しが親とは異なるモデルを使用している                                                                  | `gen_ai.request.model` がサブエージェント span に設定される。LLM-request サブ span も model を記録 — 競合なし                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 姉妹サブエージェントのプレリュードでスローされた例外が `attemptExecutionOfScheduledCalls` をエスケープ                                                | Phase 2 で最近修正された `handleConfirmationResponse` の catch に到達。これは try の外側 — 確認済みツールの span には帰属しない。サブエージェント span は自身の try/finally で正しくクローズされる                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 1 つの親からの並行 fork と foreground                                                                            | Foreground は T0 traceId を継承、fork は T1 を取得。両方とも正しいコンテキスト伝搬を独立して持つ。親ツール span は同期処理が戻ると終了。fork span (別のトレース) は存続する                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Fork span は呼び出し元の同期フローで開始されるが、本体は後で実行される                                                                | `startSubagentSpan` は `void runInForkContext(...)` の **前に** 呼び出されるため、span (および呼び出し元への Link) は、呼び出し元の spanContext がまだ読み取り可能なうちにキャプチャされる。したがって、span の期間には、本体が実際に開始される前のマイクロタスクキューのスケジューリング遅延が含まれる — 通常はサブミリ秒。本番環境で無視できないギャップが発生する場合は、別途 `qwen-code.subagent.scheduling_delay_ms` 属性を追加できる (未解決の質問)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| SDK が初期化されていない (テレメトリー無効)                                                                                | `startSubagentSpan` は早期に NOOP_SPAN を返す (他のすべての Phase 1/2 ヘルパーと同じ)。`runInSubagentSpanContext(NOOP_SPAN, fn)` は通常どおり `fn` を呼び出す。`endSubagentSpan(NOOP_SPAN, …)` は no-op                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| fork のログブリッジ span (`tool_call`、`api_request` など) はセッション由来の traceId を使用するが、fork のネイティブ span は T1 を使用する | 既存の動作 — ログブリッジ span は常に `deriveTraceId(sessionId)` を使用し、ネイティブ span は OTel コンテキストを使用する。この相違は 1 つのトレース内では見えないが、T1 の traceId による ARMS ルックアップに fork のログブリッジ子が含まれないことを意味する。この PR の範囲外。未解決の質問 #5 として言及                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Foreground と background の `SubagentStart` フック span の親が異なる                                                       | Foreground は `runSubagentWithHooks` 内で `fireSubagentStartEvent` を発火 → 既に `runInSubagentSpanContext` 内にあるため、フック span は `qwen-code.subagent` の下に親が位置する。Background は `runWithSubagentSpan` ラッピングの **前** に発火する (そのためサブエージェント span はまだ存在しない)。したがって、そのフック span は AGENT `qwen-code.tool` の下に親が位置する。「サブエージェント span の下のフック span」をクエリするオペレーターは、bg `SubagentStart` がそのビューにないことを想定する必要がある。bg フックの発火を `framedBgBody` 内に移動することは機械的には簡単だが (`contextState` のミューテーションはどちらにせよ `bgSubagent.execute` に到達する)、ユーザーから見えるセマンティクスが変わる: 現在、フックは `AgentTool.execute` が「Background agent launched」メッセージを返す前に同期的に発火するため、フックが行う同期セットアップ作業はユーザーをブロックするターン内で発生する。移動すると、フックは起動メッセージが返された後に分離されて発火するようになる。どちらのセマンティクスが優先されるか意図的な決定が下されるまで延期 |
## ロールバック

この変更はOTelレベルでは追加的なものであり、subagentに関連するスパン名でフィルタリングしていない既存のダッシュボードは引き続き動作します。親スパンでグループ化するトレースコンシューマは、`qwen-code.tool` と `qwen-code.llm_request` の間に新しい `qwen-code.subagent` ノードを確認するようになります。リリースノートに記載してください。

動作に影響を与える変更は、LogToSpanProcessorのスキップです。以前に `qwen-code.subagent_execution` スパンを消費していたダッシュボードはゼロを返します。軽減策: LogRecordはそのまま維持し（RUM + メトリクスは引き続きそれを参照します）、スパンブリッジのみを削除します。既存のログベースのクエリには影響しません。

ロールバックのパス: 単一のPRを元に戻します。新しいスパンヘルパーは `agent.ts` からのみ呼び出されます。ワイヤリングを削除し、LogToSpanProcessorのスキップを元に戻すことで、以前の動作が1:1で復元されます。

## サンプリングの影響

| 呼び出し方法                                   | サンプリング判断のソース                                               |
| ------------------------------------------------ | ------------------------------------------------------------------------ |
| `foreground` (子スパン、同じtraceId)          | 親ベースのサンプラーを介して親トレースのサンプリング判断を継承 |
| `fork` / `background` (リンクされたルート、新しいtraceId) | ルート作成時に独立したサンプリング判断 |

qwen-codeの現在のデフォルト（`tracer.ts:shouldForceSampled()` による — parentbased + always_on、そうでなければalways_on）では、すべてのスパンがサンプリングされるため、この差異は問題になりません。確率的サンプラー（例: `traceidratio=0.1`）を使用するデプロイメントでは、次のことを意味します：

- ユーザープロンプトがサンプリングされ（T0が完全にキャプチャされる）ても、そのフォーク（T1）がドロップされる場合や、その逆の場合があります。
- 親T0を読んでいるオペレーターは「Link: subagent C (T1)」を参照しますが、T1がサンプリングされていない場合、クリックすると404になる可能性があります。

軽減策: オペレーター向けに文書化します。subagentの完全なキャプチャが重要な場合は、将来の設定ノブを介してfork/backgroundの強制サンプリングを行います。ここでは対象外です。

## 機密属性（#4097 統合）

既存の `includeSensitiveSpanAttributes` ゲートを再利用します。trueの場合、データが利用可能なライフサイクルフックでsubagentスパンに設定します：

| 仕様属性                       | ソース                                                     | 設定タイミング                                                                                 |
| ---------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `gen_ai.system_instructions` | `agentConfig` / 親コンテキストからのレンダリング済みシステムプロンプト | `startSubagentSpan`（スパンオープン前に利用可能な場合）またはボディ早期に `setAttributes` 経由 |
| `gen_ai.tool.definitions`    | subagentが利用可能なツール宣言                                | 同上                                                                            |
| `gen_ai.input.messages`      | subagentに渡される初期入力（プロンプト + extraHistory）        | ボディ開始時                                                                         |
| `gen_ai.output.messages`     | subagentが返す最終応答メッセージ                               | `endSubagentSpan` メタデータ内                                                            |

これらはすべてすでにゲートされています。#4097のパターンは、ボディ内部から `addSubagentSensitiveAttributes(span, opts)` ヘルパーを呼び出すことです。実装の詳細 — 設計では統合ポイントを記すだけです。

## 順序

- #4367（リソース属性 — レビュー中）とは独立。マージ順序の制約はありませんが、subagentスパンの `gen_ai.conversation.id` は、#4367で `session.id` がリソースから移動されることの恩恵を受けます。**#4367を先にマージすることを推奨** し、`getSessionId()` の信頼できる情報源を確定させます。
- フェーズ4（LLMリクエスト分解 / TTFT）とは独立。フェーズ4は、subagent配下かインタラクション配下かに関わらず、`qwen-code.llm_request` スパンにアタッチされます。フェーズ3の後にフェーズ4を行うことを推奨します。これにより、フェーズ4の試行ごとのメトリクスをsubagentごとに集計できます。

## 未解決の質問

1. **`gen_ai.provider.name`**: 仕様では必須ですが、説明はLLMプロバイダー向けに書かれており、エージェントフレームワーク向けではありません。`'qwen-code'` に設定するのが最良の解釈です。将来の仕様改訂で `agent.provider.name` バリアントが追加された場合は、切り替えるべきです。
2. **スパン名 `qwen-code.subagent` と仕様 `invoke_agent {name}`**: 内部の一貫性を選択しました。GenAI対応ツールの採用が増え、`invoke_agent ${name}` が自動検出に重要になった場合は切り替え可能です — スパン名はOTelで最もリブランドしやすいものです。
3. **深さ≥5でのソフト警告**: 任意の数字です。設定ノブにできる可能性があります。本番データで必要性が示されるまで延期します。
4. **`SubagentExecutionEvent.result` の完全なLLM出力は大きい**: 現在、LogRecordのボリュームを肥大化させています。移行計画（LogRecord → スパンイベント）は延期されていますが、トークン使用量の集計がフェーズ4で実装されたら実施する価値があります。
5. **フォーク内のログブリッジスパンは、フォークのT1ではなくセッション由来のtraceIdになる**: エッジケースを参照。修正は、sessionId-vs-traceIdスレッドで提起されたより広範な「インタラクションスパンがセッションルートコンテキストを継承しない」問題です。これはsubagentだけでなくすべてのネイティブスパンに影響する別の設計であり、スコープ外です。