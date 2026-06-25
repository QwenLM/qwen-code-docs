# サブエージェントトレースツリー設計 (P3 フェーズ3)

> Issue #3731 — 階層型セッショントレーシングのフェーズ3。`qwen-code.subagent` スパンを追加し、サブエージェントの呼び出しが親の `qwen-code.interaction` スパン配下に無音で混在するのではなく、独立してクエリ可能なトレース構造を持てるようにする。
>
> フェーズ1 (#4126)、フェーズ1.5 (#4302)、フェーズ2 (#4321) を基盤とする。

## 問題

現状では、すべての `AgentTool.execute` 呼び出しが親の `qwen-code.interaction` スパン配下で実行される。3つの問題点がある：

1. **並行サブエージェントが混在する。** `coreToolScheduler.ts:728` で `AGENT` が並行安全とマークされており、`Promise.all` により最大10個のサブエージェントが並列実行される。各サブエージェントのLLMリクエスト・ツール・フックのスパンはすべて共有された1つの親インタラクションスパンにアタッチされるため、トレースエクスプローラーで「このLLMリクエストがサブエージェントAのものか、サブエージェントBのものか」を区別できない。
2. **サブエージェント境界自体のスパンが存在しない。** `qwen-code.subagent_execution` LogRecord（`agent-headless.ts:268,329` から発行）が `LogToSpanProcessor` を介して同名のスパンにブリッジされているが、これはスタンドアロンのマーカーであり、サブエージェントのLLM・ツール・フックのスパンをその配下にネストする親スパンではない。
3. **フォーク・バックグラウンドサブエージェントが浮遊する。** fire-and-forget パス（`runInForkContext` / バックグラウンド）は親の `AgentTool.execute` より長生きし、その後の複数のユーザーターンをまたいでスパンを発行する。親ツールスパンはそれらのスパンが出現する時点で既に終了しているため、OTel の `context.active()` は役に立たず、発火時点でたまたまアクティブだったインタラクションや、場合によってはどのインタラクションにもアタッチされない。

## 既存のサーフェス（変更なし）

| コンポーネント                          | 場所                                                                                                                                                                                         | 変更しない理由                                               |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| スポーンサイト（統一）               | `packages/core/src/tools/agent/agent.ts:1147` `AgentTool.execute()`                                                                                                                              | 単一エントリーポイント；3つの呼び出しフレーバーに対する理想的なフック      |
| 3つの呼び出しフレーバー           | フォアグラウンド名前付き（`:2154` の `runFramed` — awaited）、フォーク（`:1991` の `void runInForkContext(runFramedFork)` — fire-and-forget）、バックグラウンド（`:1934` の `void framedBgBody()` — fire-and-forget） | ライフサイクルが異なる — スパン設計はすべてをカバー            |
| 並行性                        | `coreToolScheduler.runConcurrently`（`Promise.all`、上限10）— `partitionToolCalls` が AGENT を `concurrent: true` とマークすることで駆動                                                                 | 分離が必要な理由そのもの                    |
| `runInForkContext` ALS             | `packages/core/src/tools/agent/fork-subagent.ts:32` `forkExecutionStorage`                                                                                                                       | 再帰フォークガードのみ — OTel コンテキストを伝播しない |
| エージェントアイデンティティ ALS                 | `packages/core/src/agents/runtime/agent-context.ts:46` `runWithAgentContext(agentId, ...)`                                                                                                       | すでに `agentId` を持つ；`depth` を追加拡張        |
| `SubagentExecutionEvent` LogRecord | `agent-headless.ts:268,329` → `loggers.ts:773` → 3つのダウンストリーム（LogToSpanProcessor スパンブリッジ + QwenLogger RUM + `recordSubagentExecutionMetrics`）                                              | LogRecord は残す；ダウンストリームが依存している                   |

## スコープ外（延期）

- **サブエージェントごとのトークン使用量集計**（サブエージェント内のすべてのLLMスパンにまたがる `gen_ai.usage.*` の合計）。フェーズ4（LLMリクエスト分解）に属する。
- **`qwen-code.subagent_execution` LogRecord を新しいスパンのスパンイベントに移行する。** RUM とメトリクスはLogRecordと密結合しており、3つのコンシューマーを一括して再交渉できるフォローアップに延期する。
- **自動コストロールアップ。** 同様の理由 — 先にトークン使用量が必要。
- **AGENTツールの `concurrent: true` マーカーの削除。** 並行性は正しい；計装するのであって、制約するわけではない。

## 参考資料（意思決定の根拠）

| ソース                                                                                                                 | 主なポイント                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [OTel Trace Spec — Links between spans](https://opentelemetry.io/docs/specs/otel/overview/#links-between-spans)        | 原文：「新しくリンクされたトレースは、多くの高速着信リクエストの1つによって開始された、長時間実行される非同期データ処理操作を表す場合がある」→ フォーク/バックグラウンドはリンクされたルートにすべきであり、子にすべきではない。                                                                                  |
| [OTel GenAI Agent Spans](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-agent-spans/)（ステータス：開発中） | スパン名 `invoke_agent {gen_ai.agent.name}`；必須属性 `gen_ai.operation.name`、`gen_ai.provider.name`；推奨：`gen_ai.agent.id`、`gen_ai.agent.name`、`gen_ai.conversation.id`。                                                                                                                                                 |
| LangSmith — 25,000 ラン / トレース上限                                                                                    | 長時間のエージェントセッションは最終的にトレース分割を強制する；ハイブリッドtraceId設計に有利。                                                                                                                                                                                                                          |
| [Sentry — distributed tracing](https://docs.sentry.io/concepts/key-terms/tracing/distributed-tracing/)                 | 「子トランザクションは、親スパンを含むトランザクションより長生きする可能性がある」— 親より長生きする子はサポートされている。                                                                                                                                                                                    |
| claude-code (Anthropic)                                                                                                | ローカルのPerfetto JSONファイルにのみサブエージェント階層がある；OTelエクスポートはフラット。移植可能なコードなし。                                                                                                                                                                                                                              |
| opencode (sst/opencode)                                                                                                | `@effect/opentelemetry` 自動計装を使用；`withRunSpan` に `context.with(trace.setSpan(active, span), fn)` を明示的に使用。**context.with 分離パターンを検証。** `AsyncLocalStorageContextManager` の手動登録に関する警告は適用されない — qwen-code の `NodeSDK` が自動的に登録する。 |

## 設計 — 6つの決定、それぞれの根拠

### D1 — スパンのライフサイクル：呼び出し元が開き、呼び出し先が `context.with(span, fn)` の中で実行される

`agent.ts`（呼び出し元）がスパンを構築する。ボディ — awaited（`runFramed`）または fire-and-forget（`runInForkContext` / バックグラウンド）— は `runInSubagentSpanContext(span, fn)` の中で実行され、これは `otelContext.with(trace.setSpan(active, span), fn)` を呼び出す。

**`AgentTool.execute` のどこでスパンを開くか？** 呼び出し種別固有のセットアップ（`createAgentHeadless` / `createForkSubagent` など）の**直前**に開く — セットアップ時間（設定構築、ToolRegistry の再構築、ContextOverride の配線）が `qwen-code.subagent` の実行時間に含まれるようにする。「なぜこのサブエージェントが遅いのか？」を追跡するオペレーターは全体像を把握できる。セットアップは通常LLM時間よりはるかに短いため、ノイズにはならない。

検討した代替案：セットアップ後に開き、セットアップ時間を除外する。却下理由：サブエージェントのセットアップ自体がサブエージェントに帰属する作業であり、これを隠すとすべてのサブエージェントスパンを合計したときに合計実行時間の計算が狂う。

**呼び出し先のみではない理由**：フォーク/バックグラウンドボディが実際に実行される時点では、呼び出し元はすでにリターンしている。その時点で OTel の `context.active()` が返すのは非同期ランタイムが持つアンビエントコンテキスト — 親が終了した後の `void` fire-and-forget では信頼できない。親スパンはすでにクローズされており、事後の再ペアレンティングは誤りである。

**呼び出し元のみではない理由**：フォアグラウンドはこの方法で問題なく動作するが、フォーク/バックグラウンドスパンは `AgentTool.execute` がリターンした後も子スパン（LLM / ツール / フック）を発行し続ける必要がある。それらの子スパンは `context.active()` がサブエージェントスパンを返す必要があり、それはボディが明示的に `context.with(subagentSpan, body)` の中で実行された場合にのみ実現する。

両端が必要である。**この設計がブリッジである** — 呼び出し元がスパンと呼び出し種別に応じたtraceId戦略を作成し、`runInSubagentSpanContext` を介して引き渡す。

### D2 — ハイブリッドtraceId：フォアグラウンド = 子スパン、フォーク/バックグラウンド = 新しいtraceId + Link

| 呼び出し種別 | 親                      | TraceId                 | 理由                                                                                                                                                                          |
| --------------- | --------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `foreground`    | 呼び出し元のツールスパンの子 | 親traceIdを継承 | OTelのデフォルト；呼び出し元が時間的に呼び出し先を完全に内包する                                                                                                                                        |
| `fork`          | リンクされたルートスパン            | 新しいtraceId             | 呼び出し元は即座にリターンする；フォークはその後の複数のインタラクションにまたがって実行される。OTelの仕様がこのケースにLinkを明示的に推奨している。親トレースの実行時間/サイズの膨張を防ぐ。 |
| `background`    | リンクされたルートスパン            | 新しいtraceId             | フォークと同じ理由。                                                                                                                                                      |

**Linkペイロード**：

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
  } /* explicit context = root, not inheriting active */,
);
```

セッションIDによるクロストレースのクエリ可能性：`gen_ai.conversation.id` はすべてのサブエージェントスパン（フォアグラウンドとリンクされたルートの両方）に設定されているため、`session.id` による ARMS クエリは親インタラクションのトレースとリンクされたルートのサブエージェントトレースの両方を返す。Link 自体は親トレースのUI上に「Spawned: subagent X (other trace)」として表示されるため、ナビゲーションが機能する。

**常に子である場合のデメリット**：4時間のバックグラウンドサブエージェントが親トレースのウォールクロック時間を4時間に膨らませる；トレースサイズが複数のバックエンドの上限を超える（LangSmithの25,000ランの制限が最も明確に文書化された境界）。ユーザーが実際に待っているフォアグラウンドサブエージェントはこの問題を持たない。時間的に内包されているからである。

**常にリンクされたルートである場合のデメリット**：フォアグラウンドで自然なトレースツリーが壊れる。同期的なExploreサブエージェントを実行するユーザープロンプトは、2つのリンクされたトレースではなく、1つのツリーとして表示されるべきである。

### D3 — TTL：型対応、サブエージェントのフォーク/バックグラウンド = 4h、その他 = 30min

`session-tracing.ts:124` で `SPAN_TTL_MS = 30 * 60 * 1000` を定義している。`:144-152` のスイープは既に `tool.blocked_on_user` を特殊ケースとして扱い、`decision: 'aborted' + source: 'system'` をスタンプしている。精神的には既に型対応している。

**変更**：型ごとのTTLを導入する：

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

TTL期限切れ時、サブエージェントスパンには以下がスタンプされる：

```ts
{
  'qwen-code.span.ttl_expired': true,
  'qwen-code.span.duration_ms': age,
  'qwen-code.subagent.status': 'aborted',
  'qwen-code.subagent.terminate_reason': 'ttl_swept',
}
```

**一律30minではない理由**：正当な長時間サブエージェント（大規模リポジトリ解析、低速ビルド、深い調査タスク）がTTL期限切れとして誤ってスタンプされる。4hは第99パーセンタイルをカバーしつつ、実際のハングを検出できないほど緩くはない。

**TTLなしではない理由**：プロセスクラッシュ / OOM / kill -9 → スパンが `activeSpans` マップに永遠に残留する。30分のセーフティネットがこれを防ぐ；サブエージェントのフォーク/バックグラウンドは単に広いウィンドウが必要なだけで、削除ではない。

**4hの根拠**：非自明なエージェントタスク（長い深い調査 / 大規模コードベース解析）の実用的な上限。本番データが誤りを示した場合は定数で設定変更可能。

### D4 — LogRecord の保持：発行は保持、LogToSpanProcessor ブリッジはスキップ

`SubagentExecutionEvent` LogRecord には3つのダウンストリームコンシューマーがある（リポジトリ監査で確認済み）：

| コンシューマー                                                                           | 場所                                          | アクション                                                                                  |
| ---------------------------------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------- |
| OTel LogRecord → `LogToSpanProcessor` → ブリッジスパン `qwen-code.subagent_execution` | `loggers.ts:773` → `log-to-span-processor.ts:346` | サブエージェントイベントのこのブリッジを**スキップ** — 新しい `qwen-code.subagent` スパンが代替 |
| QwenLogger RUM インジェスト（Aliyun 内部統計）                                   | `qwen-logger.ts:573-574`                          | 保持 — RUM は OTel スパンを見ず、LogRecord のみを見る                                      |
| `recordSubagentExecutionMetrics` カウンター                                           | `metrics.ts:829`                                  | 保持 — メトリクスコンシューマーはトレースブリッジに依存しない                                   |

**ブリッジスキップ**（LogToSpanProcessor の唯一の変更）：

```ts
// log-to-span-processor.ts — inside onEmit, after deriveSpanName
const skipBridge = new Set<string>([
  EVENT_SUBAGENT_EXECUTION, // covered by native qwen-code.subagent span
]);
if (skipBridge.has(eventName)) return;
```

**トレースコンシューマーへの影響**：スパン名 `qwen-code.subagent_execution` でフィルタリングするダッシュボードは結果がゼロになる。`qwen-code.subagent` に更新すること。リリースノートに記載する。

**LogRecordを削除しない理由**：RUMとメトリクスへの入力であるため。削除は3システムのリファクタリングになる；スコープ外。

**両方を残さない理由**：トレースにサブエージェントごとに2つのスパン（`qwen-code.subagent` + `qwen-code.subagent_execution`）が重複した情報を持つことになる — トレースを読むオペレーターにとって混乱を招き、スパンボリュームが重複する。

### D5 — スパン名 + 属性：ハイブリッドな仕様準拠、拡張にはベンダープレフィックス

**スパン名**：`qwen-code.subagent`（フェーズ1/2 のコードベース規約に一致：`qwen-code.interaction`、`qwen-code.tool`、`qwen-code.hook`、…）。

OTel GenAI 仕様では標準スパン名が `invoke_agent {gen_ai.agent.name}` とされている — ただし「個々のGenAIシステム/フレームワークは異なるスパン名形式を指定してもよい」とも書かれている。独自の名前を使用しつつ `gen_ai.operation.name='invoke_agent'` を設定することで、仕様対応のツールがスパンを識別できるようにする。オペレーターがトレースツリーを読む際には一貫した `qwen-code.*` 命名が見える。

**スパンカインド**：`INTERNAL`（インプロセスサブエージェント呼び出し、仕様準拠）。

**属性セット**：

| カテゴリ                                                         | 属性                                       | ソース                                                               | 備考                                                                                                                                                                            |
| ---------------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **仕様必須**                                                | `gen_ai.operation.name='invoke_agent'`          | リテラル                                                              | 仕様必須                                                                                                                                                                    |
| **仕様必須**                                                | `gen_ai.provider.name='qwen-code'`              | リテラル                                                              | 仕様必須；インプロセスエージェントでは曖昧（仕様はLLMプロバイダー向けに書かれている）。`'qwen-code'` に設定するのが最も誠実な解釈                                                      |
| **必須（デュアル発行）**                                         | `gen_ai.agent.id` + `qwen-code.subagent.id`     | `agentContext.agentId`                                               | 仕様が Stable になるまでデュアル発行；後でベンダーキーを削除                                                                                                                     |
| **必須（デュアル発行）**                                         | `gen_ai.agent.name` + `qwen-code.subagent.name` | `agentConfig.subagentType`（例：`Explore`、`code-reviewer`、`fork`） | 同じデュアル発行                                                                                                                                                                   |
| **仕様推奨**                                             | `gen_ai.conversation.id`                        | `config.getSessionId()`                                              | セッションによるクロストレースクエリを可能にする；既存の `session.id` スパン属性（#4367 でグローバルに設定）と共存 — 両方が同じUUIDを指し、仕様が安定したらいずれかを削除 |
| **仕様推奨**                                             | `gen_ai.request.model`                          | モデルオーバーライド（ある場合）                                                | サブエージェントが親モデルをオーバーライドする場合のみ                                                                                                                                        |
| **ベンダー**                                                       | `qwen-code.subagent.invocation_kind`            | `'foreground'` ❘ `'fork'` ❘ `'background'`                           | TTL + traceId 戦略を駆動                                                                                                                                                    |
| **ベンダー**                                                       | `qwen-code.subagent.is_built_in`                | bool                                                                 | ダッシュボードフィルター                                                                                                                                                                 |
| **ベンダー**                                                       | `qwen-code.subagent.parent_agent_id`            | 親 ALS の `agentId`                                                 | ネストされたサブエージェント + クロストレースの系統                                                                                                                                           |
| **ベンダー**                                                       | `qwen-code.subagent.depth`                      | 親の depth + 1（トップ = 0）                                           | 再帰バグ検出器                                                                                                                                                                           |
| **ベンダー**                                                       | `qwen-code.subagent.invoking_request_id`        | `agentContext` から                                                  | リクエストレベルの相関                                                                                                                                                                |
| **スパン終了時の仕様**                                             | `error.type`（失敗時）                       | エラークラス                                                          | OTel 標準                                                                                                                                                                         |
| **スパン終了時の仕様**                                             | `exception.message`（失敗時）                | `truncateSpanError(error.message)`                                   | OTel 標準；フェーズ2 の切り詰めを再利用                                                                                                                                         |
| **スパン終了時のベンダー**                                           | `qwen-code.subagent.status`                     | `'completed'` ❘ `'failed'` ❘ `'cancelled'` ❘ `'aborted'`             | OTel SpanStatus（OK / ERROR / UNSET）より細かい                                                                                                                                         |
| **スパン終了時のベンダー**                                           | `qwen-code.subagent.terminate_reason`           | `SubagentExecutionEvent.terminate_reason` から                       | 例：`task_complete`、`max_iterations`、`user_abort`、`ttl_swept`                                                                                                                |
| **スパン終了時のベンダー**                                           | `qwen-code.subagent.result_summary_present`     | bool                                                                 | 「サブエージェントが出力を生成したか」— 有界                                                                                                                                          |
| **オプトイン（機密）** `includeSensitiveSpanAttributes` でゲート | `gen_ai.input.messages`                         | 構造化チャット履歴                                                              | #4097 のゲートを再利用                                                                                                                                                              |
| **オプトイン（機密）**                                           | `gen_ai.output.messages`                        | モデルレスポンス                                                      | 同じゲート                                                                                                                                                                        |
| **オプトイン（機密）**                                           | `gen_ai.system_instructions`                    | システムプロンプト                                                        | 同じゲート                                                                                                                                                                        |
| **オプトイン（機密）**                                           | `gen_ai.tool.definitions`                       | ツールスキーマ                                                         | 同じゲート                                                                                                                                                                        |

**SpanStatus マッピング**：

- `status === 'completed'` → `SpanStatus { code: OK }`
- `status === 'failed'` → `SpanStatus { code: ERROR, message: truncated(error.message) }`
- `status === 'cancelled'` または `'aborted'` → `SpanStatus { code: UNSET }`（フェーズ2 の規約に一致）

**`id` + `name` のデュアル発行の理由**：仕様は Development ステータス（Experimental より1段階前）。`OTEL_SEMCONV_STABILITY_OPT_IN=gen_ai_latest_experimental` でオプトイン可能。仕様の属性名は Stable 前に変更される可能性がある。デュアル発行はフェーズ2 が `call_id` → `tool.call_id` に使ったのと同じパターン；仕様が Stable になったらベンダーキーを削除する。

**`qwen-code.subagent.*`（`qwen.subagent.*` でなく）の理由**：`constants.ts` 内のすべての既存ベンダープレフィックスキーは `qwen-code.*` を使っている（`qwen-code.user_prompt`、`qwen-code.tool_call` など）。オペレーターが ARMS でプレフィックスによるクエリをするため、OTel の命名規則優先より内部一貫性を優先する。

**カーディナリティ**：スパン属性は OTel ではメトリクスラベルではない；UUID キー属性（`id`、`parent_agent_id`、`invoking_request_id`）はスパン層では安全。後でメトリクスラベルに昇格させないこと。

**スパンごとに約10〜15属性**（呼び出し種別、失敗、ネストに依存）。`qwen-code.tool` と同じ順序。

### D6 — `AgentContext.depth` フィールドを直接追加

`AgentContext`（`agent-context.ts:32`）は**エクスポートされていない** — ヘルパー（`getCurrentAgentId`、`runWithAgentContext`、`getRuntimeContentGenerator`、`runWithRuntimeContentGenerator`）のみエクスポートされている。TypeScript レベルでのダウンストリームへの影響はゼロ。`getCurrentAgentId()` 経由の既知の6つの読み取り箇所は `agentId` のみを読む；`depth?: number` の追加は透明である。

```ts
interface AgentContext {
  agentId: string;
  subagentName: string;
  invokingRequestId: string;
  invocationKind: 'spawn' | 'resume';
  isBuiltIn: boolean;
  depth?: number; // NEW — default 0 in readers
}
```

`runWithAgentContext` はすでに `{ ...current, agentId }` スプレッドを使っているため、`depth` は既存の呼び出しサイトで変更なく保持される。**`runWithAgentContext` を更新して内部で自動的に depth をインクリメントする** — 呼び出し元は depth について知る必要がない：

```ts
function runWithAgentContext<T>(agentId: string, fn: () => T): T {
  const parent = agentContextStorage.getStore();
  const next: AgentContext = {
    ...parent,
    agentId,
    depth: (parent?.depth ?? -1) + 1, // auto-increment
  };
  return agentContextStorage.run(next, fn);
}
```

トップレベルサブエージェント：親 ALS なし → `depth: 0`。ネスト：親の depth+1。

新しい小さなアクセサ `getCurrentAgentDepth(): number` が `agentContextStorage.getStore()?.depth ?? 0` を返す — `startSubagentSpan` が `qwen-code.subagent.depth` を設定するために使用する。

**テレメトリー専用に別の ALS を使わない理由**：すでに保持している同じコンテキスト形状を複製することになる。不適切。既存のものを再利用する。

## ヘルパー API（`session-tracing.ts`）

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
  invokerSpanContext?: SpanContext; // required for fork / background (Link source)
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

`runInSubagentSpanContext` は分離プリミティブである：

```ts
export function runInSubagentSpanContext<T>(
  span: Span,
  fn: () => Promise<T>,
): Promise<T> {
  const ctx = trace.setSpan(otelContext.active(), span);
  return otelContext.with(ctx, fn);
}
```

`startSubagentSpan` は内部で `invocationKind` に基づいて分岐する：

```ts
function startSubagentSpan(opts: StartSubagentSpanOptions): Span {
  const attributes = buildSpanAttributes(opts);
  const tracer = getTracer();

  if (opts.invocationKind === 'foreground') {
    // Child of current active span (caller's tool span)
    return tracer.startSpan(SPAN_SUBAGENT, {
      kind: SpanKind.INTERNAL,
      attributes,
    });
  }

  // fork / background: linked root span
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
    root: true, // forces new traceId; ignores active context as parent
  });
}
```

## ライフサイクルの配線

### フォアグラウンド名前付き（一般的なパス）

```ts
// agent.ts:~2154
// Pull parent ALS frame to set parentAgentId on the span. The new child's
// depth is computed inside runWithAgentContext automatically (D6) — we
// read it via getCurrentAgentDepth() once we're INSIDE the child ALS
// frame. Two-step:
const parentAgentId = getCurrentAgentId();  // BEFORE entering child frame

// ... existing runFramed call enters runWithAgentContext(hookOpts.agentId, ...) ...

// INSIDE runFramed, we can read child's depth:
//   const depth = getCurrentAgentDepth();
//
// Practical placement: thread `depth` as a closure variable, set after
// runWithAgentContext takes effect — OR compute it as
// `(getCurrentAgentDepth() outside) + 1` from the caller side (simpler).
const depth = getCurrentAgentDepth();  // outside frame; child will be this + 1
// (set qwen-code.subagent.depth = depth in startSubagentSpan args)

const span = startSubagentSpan({
  agentId, subagentName, invocationKind: 'foreground',
  isBuiltIn, parentAgentId, depth, invokingRequestId, sessionId,
  modelOverride,
  // invokerSpanContext omitted — foreground inherits naturally via context.with
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

### フォーク（fire-and-forget）

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
// AgentTool.execute returns FORK_PLACEHOLDER_RESULT immediately;
// span lives across subsequent interactions of the parent session.
```

### バックグラウンド

フォークと同じ形状で、`invocationKind: 'background'` と `eventEmitter` の代わりに `bgEventEmitter` を使用する。TTLは4h（フォークと同じ — D3の型ルール）。

## 並行分離 — 主要な保証

1つのユーザープロンプトから3つの並行サブエージェント呼び出し（モデルが3つのAGENT tool_useブロックを発行 → `coreToolScheduler.runConcurrently` が3つの `executeSingleToolCall` を並列実行；各々がフェーズ2 に従って独自の `qwen-code.tool` スパンを開く）：

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
         └─ ...                               [traceId=T1, may emit hours later]
```

A、B、C それぞれに対する `context.with(span, runX)` が並行して実行される。`AsyncLocalStorageContextManager`（`sdk.ts:273` で NodeSDK により既に自動登録済み）はファイバーごとにスコープされる；クロストークなし。各サブエージェントの子LLM / ツール / フックスパンは、自身の非同期チェーン内の `context.active()` を介して `span` を参照する。

フォーク（C）は別のトレース — その子スパンは、親セッションの後続の複数のインタラクションにまたがって発行された場合でも `traceId=T1` を継承する。`session.id` による ARMS クエリはT0とT1の両方を返す；T1のルート → Cの呼び出し `qwen-code.tool` スパンへのLinkが明示的なナビゲーションを提供する。

## 変更が必要なファイル

| ファイル                                                        | 変更内容                                                                                                                                                                        | 行数見積 |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `packages/core/src/telemetry/constants.ts`                  | `SPAN_SUBAGENT`、`SPAN_TTL_MS_LONG`、属性キー定数を追加                                                                                                                              | +8      |
| `packages/core/src/telemetry/session-tracing.ts`            | `startSubagentSpan`（フォアグラウンド/リンクルートブランチ）、`endSubagentSpan`、`runInSubagentSpanContext`、型を追加；`SpanType` ユニオンに `'subagent'` を追加；TTL スイープに `ttlFor(ctx)` を追加 | +120    |
| `packages/core/src/telemetry/log-to-span-processor.ts`      | `qwen-code.subagent_execution` のブリッジをバイパスするスキップリスト                                                                                                                                   | +6      |
| `packages/core/src/telemetry/index.ts`                      | 新しいヘルパーと型を再エクスポート                                                                                                                                                 | +6      |
| `packages/core/src/agents/runtime/agent-context.ts`         | `AgentContext` に `depth?: number` と `getCurrentAgentDepth()` アクセサを追加                                                                                                                    | +12     |
| `packages/core/src/tools/agent/agent.ts`                    | 3つの実行パス（フォアグラウンド/フォーク/バックグラウンド）を try/catch/finally で `runInSubagentSpanContext` にラップ                                                                                      | +60     |
| `packages/core/src/telemetry/session-tracing.test.ts`       | 新しい `describe('subagent spans')`：開始/終了、子対リンクルート、コンテキスト伝播、depth、型ごとのTTL、冪等な終了、SDK未初期化時のNOOP                                                                     | +120    |
| `packages/core/src/telemetry/log-to-span-processor.test.ts` | スキップリストが subagent_execution ブリッジを短絡することをアサート                                                                                                                                   | +20     |
| `packages/core/src/tools/agent/agent.test.ts`               | エンドツーエンド：3つの並行サブエージェントがそれぞれ分離されたサブツリーを取得；フォークのスパンがLinkを介して新しいtraceIdを継承；バックグラウンドライフサイクル                                                                 | +80     |

合計：9ファイル、約430行。フェーズ2の典型的なコミットより大きいが正当化される — TTL変更は別ファイルを触れ、LogToSpanProcessorスキップは別ファイルであり、テストファイルが倍増する。分割すると不完全なテレメトリーサーフェスをランドすることになる。

レビューでサイズへの異議があれば：2つのPRに分割 — (A) テレメトリーヘルパー + テスト、(B) `agent.ts` 配線 + e2eテスト。先にランドするヘルパーはランタイム動作を変更しない。

## テスト戦略

| テスト                                                                         | 何を証明するか                                                  |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `startSubagentSpan foreground parents to active OTel span`                   | 子スパンパス                                                 |
| `startSubagentSpan fork creates new traceId + Link to invoker`               | リンクルートパス                                                |
| `runInSubagentSpanContext propagates span through awaits / Promise.all`      | 分離プリミティブ                                             |
| `3 concurrent subagent spans don't share children`                           | 主要な並行性保証                                  |
| `nested subagent records depth + parentAgentId`                              | ネストメタデータ                                                |
| `endSubagentSpan status mapping (completed / failed / cancelled / aborted)`  | ステータス分類                                                 |
| `endSubagentSpan dual-emits gen_ai.agent.id + qwen-code.subagent.id`         | 仕様準拠のデュアル発行                                       |
| `fork lifecycle: span survives AgentTool.execute return`                     | Fire-and-forget の正確性                                     |
| `TTL: subagent fork stays past 30min, gets stamped + ended at 4h`            | 型対応TTL                                                  |
| `TTL: foreground subagent at 30min gets default sweep`                       | TTLが過度に延長されないこと                                       |
| `LogToSpanProcessor skips qwen-code.subagent_execution but still RUM-emits`  | ブリッジスキップが機能する                                               |
| `runConcurrently of 3 agent tool calls produces 3 distinct subagent spans`   | スケジューラーレベルのエンドツーエンド                                   |
| `failed subagent sets exception.message + error.type + SpanStatus=ERROR`     | OTel標準のエラーパス                                        |
| `opt-in attrs gated on includeSensitiveSpanAttributes`                       | #4097のゲートを正しく再利用                                   |
| `startSubagentSpan returns NOOP_SPAN when SDK is uninitialized`              | フェーズ1/2 のNOOP規律に一致；ダウンストリームの呼び出しは安全のまま |
| `fork span Link.context matches invoker tool span's spanContext`             | クロストレースナビゲーションがエンドツーエンドで機能する                         |
| `runWithAgentContext auto-increments depth: parent=0, child=1, grandchild=2` | 呼び出し元の協力なしにdepthの記帳が正確である         |

## エッジケース

| ケース                                                                                                                    | 対処方法                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ツール内のサブエージェント内のサブエージェント（depth > 1）                                                                        | `depth` 属性で追跡；depth ≥ 5 でソフト `debugLogger.warn` を推奨（無限再帰検出器）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 親ツールの `awaiting_approval` 中に生成されたサブエージェント                                                                             | サブエージェントスパンはAGENTツールスパンの子；AGENTツールの `tool.blocked_on_user` は親ではなく兄弟 — 両方ともAGENTツールスパンの子。ツリーは正しいまま                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| サブエージェント実行中の `signal.aborted`                                                                                           | `runInSubagentSpanContext` のコールバックがスローまたはリゾルブ；`finally` が `status='aborted'`、SpanStatus UNSET を設定                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 親セッション終了時にフォークがまだ生きている                                                                               | 4h TTLが発火；センチネル属性 `qwen-code.span.ttl_expired:true`、`qwen-code.subagent.terminate_reason='ttl_swept'`、`status='aborted'`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `endSubagentSpan` が2回呼び出される                                                                                          | 冪等 — `activeSpans` マップをチェック；2回目の呼び出しはno-op（フェーズ2 のパターンに一致）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| サブエージェントのLLM呼び出しが親とは異なるモデルを使用する                                                                  | `gen_ai.request.model` がサブエージェントスパンに設定される；LLMリクエストサブスパンもモデルを記録 — 競合なし                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 姉妹サブエージェントのプレリュードスローが `attemptExecutionOfScheduledCalls` からエスケープする                                                | フェーズ2 の最近修正された `handleConfirmationResponse` キャッチ（try の外にある）に到達 — 確認済みツールのスパンには帰属しない。サブエージェントスパンは独自の try/finally で正しくクローズされる                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 1つの親からの並行フォーク + フォアグラウンド                                                                            | フォアグラウンドはT0のtraceIdを継承し、フォークはT1を取得する。両方が独立して正しいコンテキスト伝播を持つ。親ツールスパンは同期処理がリターンしたときに終了；フォークスパン（別トレース）は生き続ける                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| フォークスパンは呼び出し元の同期フローで開始されるがボディは後で実行される                                                                | `startSubagentSpan` は `void runInForkContext(...)` の**前**に呼び出されるため、スパン（とその呼び出し元へのLink）は呼び出し元のspanContextがまだ読み取れる間にキャプチャされる。したがってスパン実行時間には、ボディが実際に開始されるまでのマイクロタスクキュースケジューリング遅延が含まれる — 通常はサブms；本番データが非自明なギャップを示した場合、別の `qwen-code.subagent.scheduling_delay_ms` 属性を追加できる（未解決の質問）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| SDK未初期化（テレメトリー無効）                                                                                                | `startSubagentSpan` は早期リターンでNOOP_SPANを返す（他のすべてのフェーズ1/2 ヘルパーに一致）。`runInSubagentSpanContext(NOOP_SPAN, fn)` は通常通り `fn` を呼び出す。`endSubagentSpan(NOOP_SPAN, …)` はno-op                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| フォークのログブリッジスパン（`tool_call`、`api_request` など）はセッション由来のtraceIdを使用するが、フォークのネイティブスパンはT1を使用する | 既存の動作 — ログブリッジスパンは常に `deriveTraceId(sessionId)` を使用し、ネイティブスパンはOTelコンテキストを使用する。この乖離は1つのトレース内では見えないが、T1でのARMS-by-traceIdルックアップにはフォークのログブリッジの子が含まれないことを意味する。このPRのスコープ外；未解決の質問#5として記載                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| フォアグラウンドとバックグラウンドの `SubagentStart` フックスパンの親が異なる                                                       | フォアグラウンドは `runSubagentWithHooks` 内で `fireSubagentStartEvent` を発火する → 既に `runInSubagentSpanContext` 内にあるため、フックスパンは `qwen-code.subagent` の配下に親を持つ。バックグラウンドは `runWithSubagentSpan` のラッピングの**前**に発火するため（サブエージェントスパンはまだ存在しない）、そのフックスパンはAGENT `qwen-code.tool` の配下に親を持つ。「サブエージェントスパン配下のフックスパン」をクエリするオペレーターはbg `SubagentStart` がそのビューに存在しないことを想定すべきである。bgフックの発火を `framedBgBody` 内に移動することは機械的には単純（`contextState` のミューテーションはいずれの方法でも `bgSubagent.execute` に到達する）が、ユーザーから見えるセマンティクスが変わる：現在フックはAGENTTool.executeが「Background agent launched」メッセージを返す前に同期的に発火するため、フックが行う同期的なセットアップ作業はユーザーブロッキングターン内で発生する；移動するとフックは起動メッセージが返った後に切り離されて発火するようになる。どちらのセマンティクスが望ましいかの意図的な決定を待って延期 |

## ロールバック

この変更はOTelレベルでは加算的である — サブエージェント関連のスパン名でフィルタリングしていない既存のダッシュボードは引き続き機能する。スパンでグループ化するトレースコンシューマーは `qwen-code.tool` と `qwen-code.llm_request` の間に新しい `qwen-code.subagent` ノードを見ることになる；リリースノートに文書化する。

動作に影響する変更は LogToSpanProcessor スキップ — 以前 `qwen-code.subagent_execution` スパンを消費していたダッシュボードはゼロを返す。緩和策：LogRecord をそのまま保持する（RUM + メトリクスは引き続き見える）；スパンブリッジのみ削除される。既存のログベースのクエリは影響を受けない。

ロールバックパス：単一のPRをリバートする。新しいスパンヘルパーは `agent.ts` からのみ呼び出される；配線 + LogToSpanProcessor スキップを削除すると以前の動作に1:1で戻る。

## サンプリングの影響

| 呼び出し                                       | サンプリング決定のソース                                                 |
| ------------------------------------------------ | ------------------------------------------------------------------------ |
| `foreground`（子スパン、同じtraceId）          | 親ベースのサンプラーによる親トレースのサンプリング決定を継承 |
| `fork` / `background`（リンクルート、新しいtraceId） | ルート作成時の独立したサンプリング決定                                   |

qwen-code の現在のデフォルト（`tracer.ts:shouldForceSampled()` — 親ベース + always_on、それ以外はalways_on）ではすべてのスパンがサンプリングされるため、この乖離は問題にならない。確率的サンプラー（例：`traceidratio=0.1`）を使用するデプロイでは：

- ユーザープロンプトがサンプリングされる（T0は完全にキャプチャ）が、そのフォーク（T1）がドロップされる場合、またはその逆の場合がある。
- 親T0を読んでいるオペレーターは「Link: subagent C (T1)」を見る — T1がサンプリングされていなかった場合、クリックスルーで404になる可能性がある。

緩和策：オペレーター向けに文書化する。サブエージェントの完全なキャプチャが重要な場合、将来の設定ノブでフォーク/バックグラウンドのサンプリングを強制する。ここではスコープ外。

## 機密属性（#4097 統合）

既存の `includeSensitiveSpanAttributes` ゲートを再利用する。trueの場合、データが利用可能なライフサイクルフックでサブエージェントスパンに設定する：

| 仕様属性                    | ソース                                                     | 設定タイミング                                                                                 |
| ---------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `gen_ai.system_instructions` | `agentConfig` / 親コンテキストからレンダリングされたシステムプロンプト | スパンオープン前に利用可能な場合は `startSubagentSpan`、または早期ボディで `setAttributes` を使用 |
| `gen_ai.tool.definitions`    | サブエージェントが利用可能なツール宣言                                | 上記と同じ                                                                            |
| `gen_ai.input.messages`      | サブエージェントに渡される初期入力（プロンプト + extraHistory）   | ボディ開始時                                                                         |
| `gen_ai.output.messages`     | サブエージェントが返す最終レスポンスメッセージ               | `endSubagentSpan` メタデータ内                                                            |

これらはすべて既にゲートされている；#4097 のパターンはボディ内から `addSubagentSensitiveAttributes(span, opts)` ヘルパーを呼び出すこと。実装の詳細 — 設計は統合ポイントを記録するのみ。

## シーケンシング

- #4367（リソース属性 — レビュー中）とは独立している。マージ順序の制約はないが、サブエージェントスパンの `gen_ai.conversation.id` は #4367 の `session.id` がリソースから外れることで恩恵を受ける。**#4367 を先にランドすることを推奨**し、`getSessionId()` の信頼できる情報源を確定させる。
- フェーズ4（LLMリクエスト分解 / TTFT）とは独立している。フェーズ4はサブエージェント配下かインタラクション配下かに関わらず `qwen-code.llm_request` スパンにアタッチする。フェーズ4 のリクエストごとのメトリクスをサブエージェントごとに集計できるよう、フェーズ3 を先にランドすることを推奨する。

## 未解決の質問

1. **`gen_ai.provider.name`**：仕様は必須とするが、説明はエージェントフレームワークではなくLLMプロバイダー向けに書かれている。`'qwen-code'` に設定するのが最善の解釈；将来の仕様改訂で `agent.provider.name` バリアントが追加された場合は切り替えるべきである。
2. **スパン名 `qwen-code.subagent` 対 仕様の `invoke_agent {name}`**：内部一貫性を選択。GenAI対応ツールの採用が増え `invoke_agent ${name}` が自動発見のために重要になった場合、切り替えることができる — スパン名はOTelで最も変更しやすいものである。
3. **depth ≥ 5 でソフト警告**：任意の数値。設定ノブにすることができる。本番データで必要性が示されるまで延期。
4. **`SubagentExecutionEvent.result` の完全なLLM出力は大きい**：現在はLogRecordボリュームを肥大化させる。移行計画（LogRecord → スパンイベント）は延期されているが、フェーズ4 でトークン使用量集計がランドされたら実施する価値がある。
5. **フォーク内のログブリッジスパンはセッション由来のtraceIdに帰着し、フォークのT1にならない**：エッジケースを参照。修正はより広範な「インタラクションスパンがセッションルートコンテキストを継承しない」問題であり、sessionId対traceIdのスレッドで提起された — サブエージェントだけでなくすべてのネイティブスパンに影響する別の設計。スコープ外。
