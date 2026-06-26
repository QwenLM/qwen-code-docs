# テレメトリー：アウトバウンド Trace Context & Session ID ヘッダープロパゲーション

> 対応 issue: [#4384](https://github.com/QwenLM/qwen-code/issues/4384)
> 親 issue: [#3731](https://github.com/QwenLM/qwen-code/issues/3731) (P3 より深い可観測性)
> 先行 PR: #4367 (resource attributes — 2026-05-21 マージ、commit `64401e1`)
> 2026-05-21 時点の qwen-code main ブランチ + 直接検証した claude-code ソースコードに基づく

## 改訂履歴

| 改訂 | 日付       | トリガー                                    | 概要                                                                                                                                                                                                                                                                                                                                             |
| ---- | ---------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R1   | 2026-05-21 | 初稿                                        | 全ブロードキャスト：すべてのアウトバウンド LLM リクエストに `X-Qwen-Code-Session-Id` + `traceparent` を付与                                                                                                                                                                                                                                     |
| R2   | 2026-05-22 | wenshao R2/R3 review                        | 境界セキュリティ：URL 正規化、port マッチング、quote 調整、staticCorrelationHeaders の try/catch、host:port フォールバックの strip                                                                                                                                                                                                               |
| R3   | 2026-05-23 | LaZzyMan REQUEST_CHANGES                    | **重大な意味論的変更**：`X-Qwen-Code-Session-Id` のデフォルトスコープを first-party（Alibaba/DashScope）host ホワイトリストに絞り込み。詳細は §11                                                                                                                                                                                               |
| R4   | 2026-05-25 | LaZzyMan round-8 follow-up (scope conflation) | **PR スコープを大幅に縮小**：本 PR は client HTTP span + OTLP loop guard のみを保持；`traceparent` はデフォルトでオフ（NoopTextMapPropagator）；新規 `outboundCorrelation.*` トップレベル namespace にセキュリティ関連トグルを追加；R3 で実装された一連の `X-Qwen-Code-Session-Id` 機構は**本 PR から削除**し、独立した follow-up PR に移動。詳細は §12 |

**特別注意**：§3.1（目標）/ §3.2（非目標）/ §4.3（Part B 設計）/ §4.4（設定スキーマ影響）/ §5（ファイル変更リスト）/ §9（claude-code との比較）/ §10（将来の作業）/ §11（R3 host-allowlist scoping）を読む際は、同時に §12 を参照してください —— **R4 改訂により、R1-R3 の「本 PR で traceparent + session id header を同時に実装する」という主張は成立しなくなりました**：本 PR は現在、テレメトリー可観測性 + 独立した outbound trace-context toggle のみであり、すべての outbound correlation header 作業（R3 の host allowlist を含む）は全体として独立した follow-up PR に移動しました。R3 の作業コード自体は無駄になっておらず、follow-up PR で再利用可能です。

## 1. 背景

#4367 は**発行されたテレメトリー上の attribute と cardinality**（オペレーターが span/log/metric に `user.id`/`tenant.id` などのタグを付与可能）を解決しました。しかし、触れなかったものがあります：**アウトバウンド LLM リクエストの HTTP header**。現在 qwen-code が DashScope / OpenAI / Gemini / Anthropic に送信するリクエストは**クロスプロセス correlation header をまったく持ちません**——W3C `traceparent` も session id もありません。

結果：

1. trace context が qwen-code プロセス境界で切れます。モデルサービス（ARMS Tracing が組み込まれた DashScope など）に OTel instrumentation があっても、そのサービスが生成する span は qwen-code の trace と独立しており、エンドツーエンドの trace tree は存在しません。
2. ワイヤ上に session id がありません。バックエンドで qwen-code の metric/log をサーバー側ログと関連付けるには、オフラインで trace id やタイムスタンプを照合する必要があり、header を直接読むよりはるかに複雑です。
3. ローカルトレースに client-side HTTP span がありません。現在は `api.generateContent` の総処理時間しか見えず、ネットワーク TTFB / レスポンスボディサイズ / リトライ回数は確認できません。

## 2. 現状

### 2.1 `HttpInstrumentation` のみ有効

`packages/core/src/telemetry/sdk.ts:330`：

```ts
instrumentations: [new HttpInstrumentation()],
```

`HttpInstrumentation` は Node 組み込みの `http`/`https` モジュールのみをフックし、`globalThis.fetch` / undici パスは**カバーしません**。

### 2.2 両 LLM SDK が fetch / undici を使用

| SDK                                              | HTTP 実装                                                                                                                     | `HttpInstrumentation` のカバレッジ |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `openai@5.11.0`                                  | `globalThis.fetch`（Node 18+ では undici）。証拠：`node_modules/openai/internal/shims.mjs` で `'fetch' is not defined as a global` エラー | ❌                                 |
| `@google/genai@1.30.0`                           | `globalThis.fetch` + `new Headers()`。証拠：`dist/node/index.mjs` 内の `new Headers()` 呼び出し                               | ❌                                 |
| `@anthropic-ai/sdk`（anthropicContentGenerator） | 同様に fetch ベース                                                                                                           | ❌                                 |

### 2.3 コードベースに手動伝播はゼロ

```
grep -rn "propagation\.\|setGlobalPropagator\|W3CTraceContext\|traceparent" packages/core/src --include="*.ts" | grep -v "\.test\."
```

→ 空。`propagation.inject()` 呼び出しも、手動による traceparent 注入もありません。

### 2.4 各プロバイダーの `defaultHeaders` の現状

OpenAI ファミリー（`openai` SDK 使用）：

すべての OpenAI サブプロバイダーは `DefaultOpenAICompatibleProvider` を `extends` しています。**buildHeaders のオーバーライド動作は2種類**（grep audit で確認済み）：

| Provider   | ファイル                 | `buildHeaders()` の動作                                                                          | 影響                                         |
| ---------- | ------------------------ | ------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| 基底クラス | `default.ts:63-74`       | `{ 'User-Agent' }` + customHeaders を提供                                                        | ここを変更                                   |
| DashScope  | `dashscope.ts:110-124`   | **`override` するが `super` を呼ばない**——`User-Agent` + `X-DashScope-*` を含む新しいオブジェクトを返す | **ここを個別に変更必須**、そうしないと correlation header が失われる |
| OpenRouter | `openrouter.ts:20-30`    | `override` するが **`const baseHeaders = super.buildHeaders()` を先に実行**                       | 基底クラスの変更が自動継承 ✅               |
| DeepSeek   | `deepseek.ts`            | `buildHeaders` をオーバーライドしない（`buildRequest` / `getDefaultGenerationConfig` のみ）       | 基底クラスの変更が自動継承 ✅               |
| Minimax    | `minimax.ts`             | deepseek と同様                                                                                   | 自動継承 ✅                                  |
| Mistral    | `mistral.ts`             | deepseek と同様                                                                                   | 自動継承 ✅                                  |
| ModelScope | `modelscope.ts`          | deepseek と同様                                                                                   | 自動継承 ✅                                  |

→ **OpenAI ファミリーは2ファイルに影響**：`default.ts` と `dashscope.ts`。残り5つは自動継承。

Google Gemini：

| Provider | ファイル                         | ヘッダー注入パス                                                   |
| -------- | -------------------------------- | ------------------------------------------------------------------ |
| Gemini   | `geminiContentGenerator.ts:59`   | `new GoogleGenAI({ httpOptions: { headers } })` — SDK ネイティブ対応 |

Anthropic：

| Provider  | ファイル                                                                                               | ヘッダー注入パス       |
| --------- | ------------------------------------------------------------------------------------------------------ | ---------------------- |
| Anthropic | `anthropicContentGenerator.ts:177` (`buildHeaders`) + `:212` (`defaultHeaders` arg to `new Anthropic`) | `defaultHeaders` |

**合計4つのSDK構築ポイント**に session id header を注入する必要があります。すべてのSDKはすでに `defaultHeaders` / `httpOptions.headers` をサポートしており、fetch wrapper は不要です。

### 2.5 既存の proxy と fetch 設定

`provider/default.ts:87-89`：

```ts
const runtimeOptions = buildRuntimeFetchOptions(
  'openai',
  this.cliConfig.getProxy(),
);
```

`buildRuntimeFetchOptions` はユーザーが proxy を設定すると `{ fetch: customFetch }` などを返し、`setGlobalDispatcher(new ProxyAgent(...))` をトリガーします（`config.ts:1126-1128` 参照）。**undici のグローバル dispatcher モードは `UndiciInstrumentation` と互換性があります**——これは monkey-patch で `globalThis.fetch` と undici の channel diagnostics を連携させるため、特定の dispatcher に依存しません。

## 3. 目標 / 非目標

### 3.1 目標

- すべてのアウトバウンド LLM リクエストに自動で W3C `traceparent` header を付与（OTel SDK デフォルトの `W3CTraceContextPropagator`）
- ~~すべての~~ アウトバウンド LLM リクエストに `X-Qwen-Code-Session-Id` header を付与（claude-code と同様の製品名前空間） — **R3 改訂**：デフォルトでは first-party (Alibaba/DashScope) host にのみ注入し、サードパーティプロバイダーにはデフォルトで送信しません；詳細は §11
- OTLP exporter エンドポイント自身へのトレースを自動回避（フィードバックループ）
- LLM リクエストに精密な client span を追加（ネットワーク時間とモデル時間の分離）
- 4つのプロバイダー構築ポイントをカバー：OpenAI 基底クラス、DashScope override、Gemini、Anthropic
- streaming リクエスト / proxy モード / リトライシナリオのすべてで非退化
- #4367 の設計哲学と一貫：`defaultHeaders` のような SDK ネイティブなオプションを通じて — **R1 改訂**：stateness 問題のため fetch wrapper に変更；**R3 改訂**：fetch wrapper 内でさらに host gate を重ねる

### 3.2 非目標

- **`baggage` header**：標準SDKは対応済みだが、qwen-code は `propagation.setBaggage()` を呼び出していないため、デフォルトでは送信されない。本設計では積極的に有効化しない。
- **subprocess `TRACEPARENT` 環境変数の継承**：claude-code は Bash/PowerShell 子プロセスに `TRACEPARENT` を注入する。qwen-code の `BashTool` は未対応。独立した follow-up sub-issue。
- **インバウンド `TRACEPARENT` / `TRACESTATE` の読み取り**：claude-code の `-p` モードと Agent SDK は、環境変数から traceparent を読み取り、親プロセスの trace を継続する。qwen-code は未対応。独立した follow-up。
- **`X-Qwen-Code-Request-Id`**：claude-code には `x-client-request-id` があり、タイムアウト時のフォールトトレラントな相関付けに有用。今回は対象外。次のサブ issue として対応可能。
- **カスタム propagator（B3 / Jaeger / X-Ray）**：デフォルトの W3C で 99% のシナリオをカバー。将来の config option として対応可能。
- ~~**per-endpoint 選択的注入**：claude-code はサードパーティエンドポイント (Bedrock / Vertex) には traceparent を送信しない；qwen-code にはサードパーティの区別が必要ないため、一律に送信すれば良い。~~ — **R3 改訂**：この主張は覆されました。LaZzyMan review は、qwen-code は複数のサードパーティプロバイダー（OpenAI / Anthropic / OpenRouter / 等）に接続するオープンソース CLI であり、claude-code の first-party→first-party の類推は当てはまらないと指摘；session id header は host ごとに区別する必要があります。詳細は §11。`traceparent` は R1 設計通り全注入（OTel 標準ヘッダーであり、trace id は `sha256(sessionId)` ハッシュ値）、独立した follow-up で per-destination toggle（`telemetry.propagateTraceContext`）として追加可能。

## 4. 設計

### 4.1 全体のレイヤー

```
┌─ qwen-code プロセス ───────────────────────────────────────────┐
│                                                                │
│  ┌─ session-tracing.ts ─┐                                     │
│  │ active span ctx      │                                     │
│  └──────┬───────────────┘                                     │
│         │                                                      │
│         ▼                                                      │
│  ┌─ propagation.inject() (undici instrumentation から呼ばれる) ─┐│
│  │ `traceparent: 00-<traceId>-<spanId>-01` をヘッダーに書き込む  │
│  └─────────────────────────────────────────────────────────────┘│
│         │                                                      │
│  ┌──────▼──────────────────────────────────────────────────┐  │
│  │   fetch() — undici、インストルメント済み                │  │
│  │   HTTP client span を作成                               │  │
│  │   traceparent をリクエストヘッダーに注入                 │  │
│  │   （エンドポイントが OTLP の場合は ignoreRequestHook でスキップ）│
│  └─────────────────────────────────────────────────────────┘  │
│         │                                                      │
│         │   ┌─ defaultHeaders (SDK コンストラクタ毎) ─────────┐ │
│         │   │ { 'X-Qwen-Code-Session-Id': sessionId, ... }   │ │
│         └───┴────────────────────────────────────────────────┘ │
│             │                                                  │
└─────────────┼──────────────────────────────────────────────────┘
              │
              ▼ アウトバウンド HTTP
   POST /v1/chat/completions
   traceparent: 00-...
   X-Qwen-Code-Session-Id: ...
   ... (既存の User-Agent, X-DashScope-*, etc.)
```

2つの注入パスは独立しており、互いに依存しません：

| Layer                    | 注入タイミング                    | 注入元                                                          |
| ------------------------ | --------------------------------- | --------------------------------------------------------------- |
| `traceparent`            | fetch 呼び出し毎                  | `UndiciInstrumentation` 自動（OTel SDK デフォルト propagator より） |
| `X-Qwen-Code-Session-Id` | SDK 構築時に一度だけ `defaultHeaders` に書き込み | アプリケーションコード                                            |

### 4.2 Part A — `traceparent` via undici instrumentation

**変更箇所**：`packages/core/src/telemetry/sdk.ts`

```ts
import { UndiciInstrumentation } from '@opentelemetry/instrumentation-undici';

// ...
const otlpUrls = [
  config.getTelemetryOtlpEndpoint(),
  config.getTelemetryOtlpTracesEndpoint(),
  config.getTelemetryOtlpLogsEndpoint(),
  config.getTelemetryOtlpMetricsEndpoint(),
]
  .filter((u): u is string => !!u)
  .map((u) => u.replace(/\/$/, ''));

instrumentations: [
  new HttpInstrumentation(),
  new UndiciInstrumentation({
    ignoreRequestHook: (request) => {
      // request.origin = "https://collector:4318", request.path = "/v1/traces"
      const url = `${request.origin}${request.path}`;
      return otlpUrls.some((e) => url.startsWith(e));
    },
  }),
],
```

#### `ignoreRequestHook` が必要な理由

OTel SDK 自身が fetch を使ってデータを OTLP collector に POST します。スキップしないと、UndiciInstrumentation が「報告データ」のリクエストにも span を作成し、その新しい span が再度報告される → 無限ループ / 膨大なノイズ。すべての OTel プロジェクトがこの落とし穴に陥っており、OTel ドキュメントでもこの hook の使用が推奨されています。

#### デフォルト propagator

OTel SDK `NodeSDK` に `textMapPropagator` を渡さない場合、デフォルトは `CompositePropagator([W3CTraceContextPropagator, W3CBaggagePropagator])` です。明示的な設定は不要です。

#### `traceparent` の形式

```
traceparent: 00-<32hex traceId>-<16hex spanId>-<01 sampled | 00 not sampled>
              ─┬─                                          ─┬─
               version (固定 00)                            flags
```

固定 55 bytes、パディング無し。

#### `tracestate` と `baggage`

- `tracestate`: 上流から渡ってきた場合のみ継承；自身の inject では追加されない（OTel SDK の動作）。
- `baggage`: `propagation.setBaggage(ctx, ...)` が呼ばれた場合のみ存在。qwen-code は呼ばないため、送信されない。

### 4.3 Part B — `X-Qwen-Code-Session-Id` via fetch wrapper（OpenAI / Anthropic）+ static headers（Gemini）

> **R3 改訂**：以下の設計記述は、fetch wrapper の staleness 解決と4つのプロバイダー統合ポイントについてのものです——これらは保持されます。ただし、wrapper 内部に host allowlist gate が追加され、`staticCorrelationHeaders` にも `destinationUrl` パラメーターが追加されました。host gate を含む最新の実装コードとデフォルト allowlist は §11 を参照。

#### Critical：staleness 問題と方案選択

単純な方法（`defaultHeaders` に `getSessionId()` を直接焼き付ける）には**真のバグ**があります：

1. `pipeline.ts:60` で contentGenerator 構築時に一度だけ `this.client = this.config.provider.buildClient()` が呼ばれ、SDK client の `defaultHeaders` はその時点の session id をキャプチャする
2. `config.ts:1850` の session reset（ユーザーが `/clear` を実行したときに発動）は `this.sessionId` を更新し `refreshSessionContext()` を呼び出すが、**contentGenerator を再構築しない**
3. 以降の LLM 呼び出しは古い client を使用 → ワイヤ上の header は古い session id → バックエンドでの相関付けがずれる

→ session id は **リクエスト毎**に読み取らなければならない。構築時に焼き付けてはいけない。

#### 方案

```
                   ┌─ fetch 対応 ─┐  方案
OpenAI SDK          │     ✅       │  fetch wrapper (リクエスト毎に sessionId を読み取り) ✅
Anthropic SDK       │     ✅       │  fetch wrapper ✅
@google/genai SDK   │     ❌       │  static httpOptions.headers +  stale 性を受け入れ
                   └──────────────┘
```

`@google/genai` の `HttpOptions` インターフェースは `fetch` をサポートしていません（`node_modules/@google/genai/dist/genai.d.ts` を grep で確認済み：`baseUrl`/`apiVersion`/`headers`/`timeout`/`extraParams` のみ）。そのため Gemini は static headers 経由となり、OpenAI/Anthropic とは非一貫——これは **known limitation** です（§8.6 参照）。

#### 集中補助関数（per-request fetch wrapper）

新規ファイル `packages/core/src/telemetry/llm-correlation-fetch.ts`：

```ts
import type { Config } from '../config/config.js';

/**
 * すべてのアウトバウンドリクエストに、SDK client 構築時にキャプチャされた値ではなく、
 * **現在の** session id から取得したコリレーションヘッダー（`X-Qwen-Code-Session-Id`）が
 * 設定されるように fetch 実装をラップします。
 *
 * claude-code のパターン（src/services/api/client.ts:370-390 — `buildFetch()`）に一致。
 * `/clear` によりプロセスの途中で session id がリセットされる可能性があるため、
 * リクエスト毎の注入が必要です。SDK client（およびその静的な `defaultHeaders`）は
 * リセット時に再作成されません。
 *
 * 呼び出し元は基本となる fetch を選択します。通常は
 * `runtimeOptions?.fetch ?? globalThis.fetch` で、ProxyAgent 使用時は proxy 対応 fetch が
 * 維持されるようにします。
 *
 * テレメトリーが無効の場合、baseFetch をそのまま返します（§3.1 のプライバシー方針に従い、
 * コリレーションヘッダーは追加されません）。
 */
export function wrapFetchWithCorrelation(
  baseFetch: typeof fetch,
  config: Config,
): typeof fetch {
  return async function correlationFetch(input, init) {
    if (!config.getTelemetryEnabled()) {
      return baseFetch(input, init);
    }
    const sid = config.getSessionId();
    if (!sid) {
      // 防御的：空のヘッダー値は一部の HTTP ミドルウェアで拒否される。
      // 空の `X-Qwen-Code-Session-Id: ` を送信する代わりに注入をスキップ。
      return baseFetch(input, init);
    }
    const headers = new Headers(init?.headers);
    headers.set('X-Qwen-Code-Session-Id', sid);
    return baseFetch(input, { ...init, headers });
  };
}
```

静的ヘッダーしか取れない SDK（Gemini）向けのコンパニオンヘルパー：

```ts
/**
 * 静的なコリレーションヘッダー。呼び出し時に session id をキャプチャします。
 * **stale 性の影響を受けます**。ホスト SDK がこれらのヘッダーを
 * 構築時にキャプチャされたスロットに保持する場合（例：`@google/genai` の
 * `httpOptions.headers`）に該当。可能な限り `wrapFetchWithCorrelation` を優先してください。
 */
export function staticCorrelationHeaders(
  config: Config,
): Record<string, string> {
  if (!config.getTelemetryEnabled()) return {};
  return { 'X-Qwen-Code-Session-Id': config.getSessionId() };
}
```

#### 統合ポイント 1: `provider/default.ts` (OpenAI 基底クラス)

`buildClient()` の変更——既存の `runtimeOptions.fetch`（proxy）と wrapper を合成：

```ts
buildClient(): OpenAI {
  // ... 既存 ...
  const runtimeOptions = buildRuntimeFetchOptions('openai', this.cliConfig.getProxy());
  const baseFetch =
    (runtimeOptions as { fetch?: typeof fetch } | undefined)?.fetch
    ?? globalThis.fetch;
  return new OpenAI({
    apiKey,
    baseURL: baseUrl,
    timeout,
    maxRetries,
    defaultHeaders,
    ...(runtimeOptions || {}),
    // スプレッド後、`fetch` を上書きしてコリレーション wrapper が
    // proxy 対応 fetch（または proxy 未使用時は globalThis.fetch）をラップするようにする。
    fetch: wrapFetchWithCorrelation(baseFetch, this.cliConfig),
  });
}
```

`buildHeaders()` 自体は変更なし。

#### 統合ポイント 2: `provider/dashscope.ts` (override)

`buildClient()` で同じ合成パターン（もともと buildClient をオーバーライド済み）。`buildHeaders()` は変更なし。

#### 統合ポイント 3: `geminiContentGenerator/index.ts` (factory、コンストラクタではない)

**以前の設計での過剰な宣言を修正**：`geminiContentGenerator.ts` のコンストラクタシグネチャは**変更不要**です。`index.ts:48` の factory 関数はすでに `gcConfig: Config` を受け取っており（line 33 で `gcConfig?.getUsageStatisticsEnabled()` を利用済み）、factory 内で correlation 静的ヘッダーを `httpOptions.headers` にマージするだけです：

```ts
// geminiContentGenerator/index.ts
let headers: Record<string, string> = { ...baseHeaders };
if (gcConfig?.getUsageStatisticsEnabled()) {
  // ... 既存の x-gemini-api-privileged-user-id ...
}
headers = { ...headers, ...staticCorrelationHeaders(gcConfig) }; // ← 追加
const httpOptions = config.baseUrl
  ? { headers, baseUrl: config.baseUrl }
  : { headers };
// new GeminiContentGenerator(...) は変更なし
```

シグネチャへの変更はゼロ。

#### 統合ポイント 4: `anthropicContentGenerator.ts`

Anthropic SDK もカスタム fetch を受け入れます（すでに `buildRuntimeFetchOptions` を使用）。`buildClient` パス内で fetch をラップし、OpenAI default.ts と同様の方法で行います。`buildHeaders` は変更なし。

#### 優先順位チェーン

変更なし：ユーザーの `customHeaders` は `defaultHeaders` マージ内で引き続き優先されます（§8.2 の spoofing 議論を参照）。fetch wrapper が注入する `X-Qwen-Code-Session-Id` は、SDK のヘッダーリストの**後**に最終的な `Headers` オブジェクトに追加されます——Node `Headers.set()` のセマンティクスにより、同一名の以前の値（ユーザーの customHeaders で書かれた同名ヘッダーも含む）を上書きします。

**OpenAI/Anthropic（fetch wrapper パス）**：correlation > customHeaders > SDK デフォルト。
**Gemini（static headers パス）**：customHeaders > correlation > SDK デフォルト（既存のスプレッド順を継承）。

違いは、fetch wrapper パスでは spoofing が不可能になったことです（fetch wrapper は SDK ヘッダーの後で動作）。これは**バグ修正の副産物**であり、意図的な制限強化ではありませんが、より安全です。§8.2 で明示する必要があります。

### 4.4 設定スキーマへの影響

~~**ほぼゼロ**。本設計は新たな設定を導入しません~~ — **R3 改訂**：新たな設定項目 `telemetry.sessionIdHeaderHosts: string[]` を導入。デフォルトの first-party host ホワイトリストを上書きするために使用します。スキーマ項目は `packages/cli/src/config/settingsSchema.ts` に追加済み。説明とオーバーライド構文（`["*"]` でブロードキャスト復元 / `[]` で完全無効 / カスタム配列）は §11 を参照。以下の記述は R3 以前にのみ適用されます。
- `traceparent` 注入は telemetry enabled によってトリガーされます（既存の toggle）
- `X-Qwen-Code-Session-Id` 注入も telemetry enabled によってトリガーされます
- `ignoreRequestHook` の OTLP URL は既存の config から読み取られます

将来追加可能な設定（**スコープ外**）：

- `telemetry.outboundCorrelationHeader`: カスタムヘッダー名（デフォルト `X-Qwen-Code-Session-Id`）
- `telemetry.outboundPropagationDisabled`: グローバルに無効化（LLM サービスが未知のヘッダーに厳格な場合）
- ~~宛先ごとのヘッダースコープ toggle~~ — **R3 で実装済み**、§11 参照

## 5. ファイル変更一覧

| ファイル                                                                        | 変更タイプ | 説明                                                                                                                                                            |
| ------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/package.json`                                                    | 依存追加   | `@opentelemetry/instrumentation-undici`                                                                                                                         |
| `packages/core/src/telemetry/sdk.ts`                                            | 変更       | +`UndiciInstrumentation` + `ignoreRequestHook`                                                                                                                  |
| `packages/core/src/telemetry/llm-correlation-fetch.ts`                          | 新規ファイル | `wrapFetchWithCorrelation()` (OpenAI/Anthropic) + `staticCorrelationHeaders()` (Gemini fallback)                                                                |
| `packages/core/src/core/openaiContentGenerator/provider/default.ts`             | 変更       | `buildClient()` 内で `new OpenAI({...})` に `fetch: wrapFetchWithCorrelation(baseFetch, cliConfig)` を追加                                                  |
| `packages/core/src/core/openaiContentGenerator/provider/dashscope.ts`           | 変更       | 同上（`buildClient` をオーバーライド）                                                                                                                          |
| `packages/core/src/core/geminiContentGenerator/index.ts`                        | 変更       | factory 関数内で `staticCorrelationHeaders(gcConfig)` を `httpOptions.headers` にマージ（**呼び出し元は既に Config を保持しており、シグネチャ変更ゼロ** — 以前の過剰仕様を修正） |
| `packages/core/src/core/anthropicContentGenerator/anthropicContentGenerator.ts` | 変更       | `buildClient` パスで SDK の `fetch` option に `wrapFetchWithCorrelation` を適用                                                                                 |

**明示的に監査済みだが変更不要**（レビュワーがパス漏れを懸念しないようにするため）：

- `packages/core/src/qwen/qwenContentGenerator.ts` — `extends OpenAIContentGenerator` で `DashScopeOpenAICompatibleProvider` を使用、**dashscope.ts の buildClient 変更を自動継承**。すべての Qwen OAuth フローも同様に恩恵を受けます。
- `packages/core/src/core/loggingContentGenerator/loggingContentGenerator.ts` — wrapper パターンで SDK client を構築しない（他の contentGenerator をラップして telemetry logging を行う）、変更不要。
- `packages/core/src/core/contentGenerator.ts` — factory エントリポイントで client を保持しない。
  | `packages/core/src/telemetry/sdk.test.ts` | 変更 | undici instrumentation の登録 + ignoreRequestHook のテストを追加 |
  | `packages/core/src/telemetry/llm-correlation-fetch.test.ts` | 新規ファイル | telemetry on/off の動作単体テスト + リクエストごとの sessionId 読み取り確認（重要：session リセット後、wrapped fetch が新しい id を読み取る） |
  | 各プロバイダーの `*.test.ts` | 変更 | SDK 構築時に `fetch` option が wrapped バージョンであることをアサート（OpenAI/Anthropic）；Gemini 構築時に `httpOptions.headers` に `X-Qwen-Code-Session-Id` が含まれることをアサート |
  | `docs/developers/development/telemetry.md` | 変更 | "Trace context & session correlation propagation" セクションを追加 |
  | `docs/design/telemetry-outbound-propagation-design.md` | 本ファイル | 設計ドキュメント |

## 6. PR 分割

レビューのしやすさを考慮して 2 つの PR に分割（規模的に 1 つにまとめても可）：

### PR 1 — `traceparent` 自動注入（構造的）

- `@opentelemetry/instrumentation-undici` 依存を追加
- `sdk.ts` に `UndiciInstrumentation` + `ignoreRequestHook` を追加
- テスト：SDK 登録、OTLP endpoint がトレースされないこと
- ドキュメント断片

**リスク**：低。追加のみ。既存の client span はネットの利得であり、既存のスパン構造は変更されません。

### PR 2 — `X-Qwen-Code-Session-Id` ヘッダー（ヘルパー関数と組み合わせ）

- 新規ファイル `llm-correlation-headers.ts`
- 4 つのプロバイダー統合
- テスト：各プロバイダーでヘッダーが存在すること、telemetry-off 時には送信されないことをアサート
- ドキュメント断片

**リスク**：低〜中。`geminiContentGenerator` のコンストラクタシグネチャ拡張が呼び出し元に波及する可能性に注意。

### PR 3（任意） — Docs + E2E 検証

- `telemetry.md` の段落を充実
- E2E 検証スクリプト追加（`/tmp/verify-telemetry-pr-4367.mjs` パターンを再利用）：実際に fetch を実行してヘッダーをキャプチャ

PR 2 に統合することも可能。

### 順序の優先順位

PR 1 と PR 2 は技術的に**互いに独立**しています—コードを共有しません。しかし **PR 1 を先にマージすることを推奨**：

- `traceparent` は OTel **標準**ヘッダーであり、OTel 対応のコレクター/バックエンドが即座に認識 → ユーザーがすぐに恩恵を受ける
- `X-Qwen-Code-Session-Id` は**製品カスタム**ヘッダーであり、バックエンド側の設定認識が必要 → 価値が遅延する
- 万一 PR 2 のレビュー期間が長くなっても、PR 1 で cross-process trace が動作する
- PR 1 は追加的構造変更（低リスク）であり、先に信頼を築くのに適している

## 7. テスト計画

### 7.1 `sdk.ts` 単体テスト

- ✅ `UndiciInstrumentation` が `NodeSDK` の `instrumentations` に存在すること
- ✅ `ignoreRequestHook` が `https://collector:4318/v1/traces` に対して true を返すこと
- ✅ `ignoreRequestHook` が `https://dashscope.aliyuncs.com/...` に対して false を返すこと
- ✅ 末尾スラッシュあり・なしの両方で正しく一致すること

### 7.2 `llm-correlation-fetch.ts` 単体テスト

**`wrapFetchWithCorrelation`**：

| シナリオ                                                 | 期待                                                                   |
| -------------------------------------------------------- | ---------------------------------------------------------------------- |
| `getTelemetryEnabled() === false`                        | wrapped fetch = baseFetch（ヘッダー追加なし）                          |
| `getTelemetryEnabled() === true`, sessionId = "abc-123"  | wrapped fetch が送信する init.headers に `X-Qwen-Code-Session-Id: abc-123` が含まれる |
| `init.headers` に既に `X-Qwen-Code-Session-Id: spoof` が存在 | wrapper 後、真の sessionId で上書きされる（fetch wrapper パスでは spoof 不可、§8.1） |
| **session リセット後、wrapped fetch が再度呼ばれる**       | **新しい sessionId を読み取る**（古い値を使い続ける問題の回帰ガード）  |
| baseFetch が reject する                                  | wrapper は reject をそのまま透過し、飲み込まない                      |

**`staticCorrelationHeaders`**（Gemini パス）：

| シナリオ                                                 | 期待される戻り値                                                   |
| -------------------------------------------------------- | ------------------------------------------------------------------ |
| `getTelemetryEnabled() === false`                        | `{}`                                                               |
| `getTelemetryEnabled() === true`, sessionId = "abc-123"  | `{ 'X-Qwen-Code-Session-Id': 'abc-123' }`                          |
| sessionId に unicode が含まれる（`會話-1`）              | そのまま返す——HTTP header value は SDK がエンコードを担当           |
| sessionId が空文字列                                     | `{ 'X-Qwen-Code-Session-Id': '' }`——ビジネス不変条件、このレイヤーでは検証しない |

### 7.3 プロバイダーごとの統合テスト

各プロバイダーの `buildHeaders()` / コンストラクタテストに以下を追加：

```ts
it('telemetry 有効時に X-Qwen-Code-Session-Id を含む', () => {
  const config = makeFakeConfig({
    sessionId: 'sess-xyz',
    telemetry: { enabled: true },
  });
  const provider = new DefaultProvider(genConfig, config);
  expect(provider.buildHeaders()['X-Qwen-Code-Session-Id']).toBe('sess-xyz');
});

it('telemetry 無効時に X-Qwen-Code-Session-Id を省略する', () => {
  const config = makeFakeConfig({ telemetry: { enabled: false } });
  const provider = new DefaultProvider(genConfig, config);
  expect(provider.buildHeaders()).not.toHaveProperty('X-Qwen-Code-Session-Id');
});
```

### 7.4 E2E 検証（tmux + ローカル HTTP サーバー）

⚠️ ヘッダーをキャプチャするために `globalThis.fetch` をモック**しない**でください：`UndiciInstrumentation` は undici の diagnostics channel フックを通じて動作するため、`globalThis.fetch` をモンキーパッチすると（パッチの順序によっては）instrumentation を完全にバイパスし、`traceparent` 注入をテストできなくなります。**正しい方法はローカル HTTP サーバーを起動し**、SDK に実際にリクエストを送らせ、サーバー側で受け取ったヘッダーを記録することです。

`/tmp/verify-telemetry-pr-4367.mjs` と同様のスクリプトを作成：

1. `http.createServer((req, res) => { capturedHeaders.push(req.headers); res.end('{}') })` でローカルサーバーを起動
2. telemetry + outfile を有効にし、OpenAI SDK の `baseURL` を `http://127.0.0.1:<port>` に設定（または mock provider を使用して SDK に実際に fetch を送らせる）
3. `client.chat.completions.create(...)` を 1 回トリガー（解析可能な最小限の mock レスポンスが必要。ローカルサーバーは有効だが空の OpenAI レスポンスを返せば良い）
4. `capturedHeaders[0]` に `traceparent: 00-...` と `X-Qwen-Code-Session-Id: <sessionId>` が含まれることをアサート
5. 別のポートで OTLP collector mock を起動し、それへの OTLP レポート送信が `traceparent` 注入を**トリガーしない**ことを検証（`ignoreRequestHook` の確認）
6. **追加：古い値の検証** — request 1 を発行 → `config.resetSession(...)` を呼び出す → request 2 を発行 → request 2 の `X-Qwen-Code-Session-Id` が新しい session id であることをアサート（**#1 修正の重要な回帰テスト**）

### 7.5 回帰防御

- streaming chat completion の fetch（`stream: true` を含む）は正常に終了すること——`UndiciInstrumentation` は過去に streaming レスポンスのスパンライフサイクルにバグがありました。**実装時には実際に streaming completion をエンドツーエンドで実行し、client span が正常に終了し、スパンのリークがなく、ストリームが途中で切れないことを確認してください**；特定のバージョンですでに修正済みとは仮定しないでください。
- proxy モード (`ProxyAgent`) と instrumentation が同時に有効な場合——`ignoreRequestHook` は引き続き endpoint 文字列でマッチングされ、proxy は影響しません。
- リトライ（`maxRetries`）時、リトライごとに独立した client span が作成されますが、すべて同じ `traceparent` 親を共有します（理想的にはリトライが同じ親スパンの下の複数の子スパンになるべき — これは SDK の動作に依存するため、本設計では強制しません）。

## 8. 境界 / エッジケース

### 8.1 customHeaders の上書きと spoofing の不一致動作

プロバイダーパスによって spoofing の挙動が**異なります**（設計上の結果であり、意図的な強化ではありません）：

| Provider パス                               | spoofing 可能？ | 理由                                                                                                                  |
| ------------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------- |
| OpenAI / Anthropic (fetch wrapper パス)     | ❌ spoof 不可    | fetch wrapper は SDK の headers リストの後に `headers.set('X-Qwen-Code-Session-Id', ...)` を行い、ユーザーの customHeaders の同名キーを上書きする |
| Gemini (static headers パス)                | ✅ spoof 可能    | マージ順 `{ ...baseHeaders, ...correlationHeaders, ...customHeaders }`——customHeaders が最後に勝つ                    |

claude-code も fetch wrapper パスを使用しており、OpenAI/Anthropic と同じ動作（spoofing 不可）です。これは古い値問題の修正の副産物であり、本来意図したものではありません。

**二つのパスを「統一する」つもりはありません**——Gemini パスの動作は SDK の制限（`fetch` hook がない）によるもので、OpenAI 側を static にダウングレードするのは不合理です。

Session id spoofing は現実的な脅威ではありません（ユーザーはローカルを制御しており、ソースコードを直接変更できます）。ドキュメントではこの違いを明示し、レビュワーが fetch wrapper パスで spoof できないのを見て customHeaders の優先順位に疑問を持たないようにする必要があります。

### 8.2 OTLP collector URL マッチングの 2 種類のエッジケース

#### (a) URL 内の認証トークン

ユーザーの OTLP endpoint が `https://collector/path?token=secret` のような形式の場合、`ignoreRequestHook` の `url.startsWith(e)` は比較時にクエリ文字列も含む可能性があります。しかし undici から渡される `request.path` はパスのみ（クエリなし）なので、比較時には `e` もパス部分のみ使用されます。安全のため、クエリを除去します：

```ts
const otlpUrls = [...]
  .map((u) => u.replace(/\?.*$/, '').replace(/\/$/, ''));
```

#### (b) startsWith がホスト名境界を超える理論上の false positive

`e = "http://collector"`（ポートなし）の場合、リクエスト URL が `http://collector-fake/v1/traces` だと startsWith が誤って一致する恐れがあります。

**実際に発生する確率は極めて低い**：

- OTLP endpoint はほぼ常にポート番号（4317 gRPC / 4318 HTTP）を含み、`http://collector:4318` の形式では `-fake` のような拡張は不可能（ポートの後は `/` しか続かない）
- ユーザーが endpoint をポートなしで設定するのは設定ミスであり、本来 SDK はデフォルトのフォールバックを行う

**堅牢化したい場合**：URL の origin + path をそれぞれパースして比較し、裸の startsWith を使わない：

```ts
const parsed = otlpUrls.map((u) => new URL(u));
return parsed.some(
  (e) =>
    `${request.origin}` === e.origin && request.path.startsWith(e.pathname),
);
```

今回は実施しません——オーバーヘッドの割にメリットが不必要であり、実際に false positive が発生することもありません。

### 8.3 Vertex AI モードの Gemini

`@google/genai` は `vertexai: true` モード（GCP 認証情報を使用して Vertex endpoint にアクセス。generative ai endpoint ではない）をサポートしています。どちらのモードも fetch を使用するため、instrumentation はどちらもカバーします。`httpOptions.headers` はどちらのモードでも有効です。

### 8.4 Anthropic SDK の既存の `defaultHeaders` ロジック

`anthropicContentGenerator.ts:177` では既に `buildHeaders()` を呼び出し、その結果を `new Anthropic({ defaultHeaders })` に渡しています。しかし古い値問題も同様に適用されます——本設計では `fetch` wrapper パスを使用します（OpenAI と同様）。

### 8.5 SDK と fetch 間の trailer header

`openai` SDK は streaming 時に `Transfer-Encoding: chunked` と trailer headers を使用する可能性があります。これらはリクエスト時の `traceparent` / `X-Qwen-Code-Session-Id` 注入には影響しません——これらはリクエストヘッダーであり、送信時に一度だけ書き込まれます。

### 8.6 ⚠️ 既知の制限：Gemini の session id は `/clear` 後に古くなる

`@google/genai` SDK は `fetch` hook をサポートしていないため（`HttpOptions` インターフェースには `baseUrl`/`apiVersion`/`headers`/`timeout`/`extraParams` のみ）、Gemini provider は static な `httpOptions.headers` パスを使用します——session id は SDK 構築時にキャプチャされ、**`/clear` による session リセット後は更新されません**。

**実際の影響範囲**：

- ユーザーが qwen-code を起動 → `/clear` → Gemini モデルを使用 → ワイヤー上の `X-Qwen-Code-Session-Id` は古い session id
- バックエンドの correlation がずれる（trace id とログは新しい session に正しく切り替わっているが、ワイヤーヘッダーは古いまま）

**なぜ修正しないのか（今回）**：

- OpenAI / Anthropic パスには**このバグはありません**（fetch wrapper パスはリクエストごとに session id を読み取る）
- Gemini 修正パスにはいくつかの選択肢があり、すべて今回のスコープを超えています（以下参照）

**将来の修正パス選択肢**（推奨順）：

| 選択肢                                         | 説明                                                                                  | コスト                                                                                       |
| ---------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **A. Lazy invalidate** ★ 推奨                    | session リセット時に contentGenerator を dirty マークし、次の LLM 呼び出し時に遅延再作成 | 小：~10 行を `resetSession` + LLM 呼び出しエントリに追加；同期 API、非侵襲                   |
| B. Eager recreate                              | session リセット時に即座に `await createContentGenerator(...)`、`resetSession` の非同期化が必要 | 中：API 変更が複数箇所に波及                                                              |
| C. Proxy headers object                        | `httpOptions.headers` に Proxy をラップして getter をインターセプト                     | リスク高：`@google/genai` 内部がリクエストごとにヘッダーを再読み取りするか不明、動作が静かに壊れる可能性 |
| D. `@google/genai` 上流に `fetch` option を追加 | google-deepmind/generative-ai-js に PR を送る                                          | 長期間；制御不能                                                                             |

**ドキュメントではユーザーに明示する必要があります**：Gemini provider を使用する場合、`/clear` 直後に LLM 呼び出しが行われると、ワイヤー上の session id はその時点で古いものになります。trace correlation によって間接的に修正可能（spans/logs 上の session.id は既に新しい）。

フォローアップ sub-issue を別途作成し、選択肢 A を追跡する必要があります。

## 9. claude-code との比較

| 次元                          | claude-code                                                                                                                                          | qwen-code 本設計                                                                                                                                                            | 判断根拠                                                                                                                           |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Session id ヘッダー命名        | `X-Claude-Code-Session-Id`（製品プレフィックス）                                                                                                     | `X-Qwen-Code-Session-Id`（製品プレフィックス）                                                                                                                              | ✅ 同じ名前空間戦略                                                                                                                |
| Session id 注入メカニズム       | SDK `defaultHeaders`（`client.ts:108`）+ カスタム `buildFetch()` wrapper（`client.ts:370-390`、リクエストごとの `randomUUID()` 注入 `x-client-request-id`） | OpenAI/Anthropic は fetch wrapper（リクエストごとに session id を読み取り、`/clear` の古さを回避）；Gemini は static `httpOptions.headers`（SDK 制限）                        | claude-code の fetch wrapper パターンに合わせる。claude-code も fetch wrapper を使用してリクエストごとに `x-client-request-id` を追加 |
| Session id の持続性          | claude-code には `/clear` のような session リセットなし；session = process                                                                             | `/clear` リセットあり → fetch wrapper パスは自動追従；static headers パスは古くなる（§8.6）                                                                                | qwen-code 独自の複雑さ                                                                                                             |
| Session id エンコーディング  | HTTP header（baggage ではない）                                                                                                                       | HTTP header                                                                                                                                                                 | ✅ 同じ——バックエンドに優しい                                                                                                       |
| `traceparent` 注入            | クローズドソース；公開ドキュメントでは存在を説明；オープンソースリポジトリには `propagation.inject` / `UndiciInstrumentation` の参照なし                 | `@opentelemetry/instrumentation-undici` 自動                                                                                                                                | claude-code の実装は不明。OTel 公式推奨パスを選択、より軽量                                                                       |
| `traceparent` 送信範囲         | 第一方 Anthropic API のみ；Bedrock/Vertex/Foundry には送信しない                                                                                      | すべてのアウトバウンド fetch に送信（W3C 標準；trace id は `sha256(sessionId)` ハッシュ）。**R3 改訂**：session id header は first-party (Alibaba/DashScope) ホワイトリストのみに注入、サードパーティにはデフォルトで送信しない。詳細は §11 | R3 後、qwen-code の session header は claude-code と同じ first-party-only セマンティクス；`traceparent` は per-destination toggle のフォローアップ未定 |
| `x-client-request-id` (ランダム) | あり、自動                                                                                                                                           | 今回未実装（独立したフォローアップ sub-issue として価値が高い）                                                                                                              | スコープ管理                                                                                                                       |
| 子プロセス `TRACEPARENT` env    | ドキュメントで存在を認めている（実装はクローズド）                                                                                                   | 未実装（独立したフォローアップ）                                                                                                                                            | スコープ管理                                                                                                                       |
| 入站 `TRACEPARENT` 読み取り     | ドキュメントで存在を認めている（`-p` / Agent SDK モード）                                                                                               | 未実装（独立したフォローアップ）                                                                                                                                            | スコープ管理                                                                                                                       |

**verified vs documented 注記**：

| 主張                                           | 検証状態                                                                                                                                          |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `X-Claude-Code-Session-Id` via `defaultHeaders` | ✅ オープンソース `src/services/api/client.ts:108` を確認済み                                                                                     |
| `x-client-request-id` via fetch wrapper         | ✅ オープンソース `src/services/api/client.ts:370-390` を確認済み                                                                                 |
| `traceparent` 注入                              | ⚠️ docs.claude.com/docs/en/monitoring-usage.md のみで言及；オープンソースリポジトリ `grep -rn "propagation\.inject\|UndiciInstrumentation\|traceparent" src` は空 |
## 10. 将来の作業

#3731 P3 にぶら下がっており、本設計には**含まれません**が、関連します：

- **`X-Qwen-Code-Request-Id`** — リクエストごとのランダム UUID（claude-code 相当：`x-client-request-id`）。タイムアウト/エラー相関に有用です——タイムアウト時、サーバー側がまだ request id を割り当てていない可能性があり、クライアントが先に発行した id が唯一の関連付け手段となります。R3 改訂後、この提案はより意味を増しました。per-request UUID には「リクエストをまたがる行動プロファイリング」リスクがなく、「すべての LLM provider に送信するサポート/デバッグ用 header」として位置づけられます。
- **`traceparent` の per-destination scope 切り替え** — R3 改訂では session id header のスコープのみ処理しました。`traceparent` は引き続きすべての送信 fetch に注入されます。`telemetry.propagateTraceContext: 'trusted-hosts' | 'all' | 'none'` を追加し、§11 と同じ allowlist を使用して動作を決定することも可能です。
- **Gemini の session id 古さの lazy-invalidate 修正**（§8.6 オプションA）：`/clear` 時に contentGenerator を dirty とマークし、次の LLM 呼び出しで lazy recreate します。Gemini パスでも fetch wrapper のリアルタイム性を享受できるようにします。
- **子プロセスへの `TRACEPARENT` 環境変数**：`BashTool` が子プロセスを実行する際に env を注入し、外部ツールが trace を継続できるようにします。tool execution lifecycle を別途検討する必要があります。
- **受信 `TRACEPARENT`**：`--prompt` モード起動時に env を読み取り、CI / 外部 orchestrator が qwen-code をより大きな trace に接続できるようにします。
- **設定可能な `correlationHeader` 名**：企業運用で header 名をカスタマイズ可能にします（デフォルト `X-Qwen-Code-Session-Id`）。
- **`baggage` 伝搬ポリシー**：`user.id` / `tenant.id` などを baggage 経由で下流に渡すために、active に baggage を設定するかどうか。今回は実施せず、需要が明確になり次第対応します。

## 11. R3 改訂 — `X-Qwen-Code-Session-Id` のホスト許可リストスコープ

> トリガー：[LaZzyMan による PR #4390 の REQUEST_CHANGES review](https://github.com/QwenLM/qwen-code/pull/4390)
> 実装 commit：`1c8528a56`（コア実装）+ `cb162e716`（Vertex baseUrl fail-closed + `["*"]` トリム許容）

### 11.1 トリガーと論拠

R1 設計では、`X-Qwen-Code-Session-Id` を**すべての**送信 LLM リクエストに注入し、`telemetry.enabled` のみで制御していました。LaZzyMan の review は、3 つの段階的な問題を指摘しました：

1. **ラベルの不一致**：`feat(telemetry):` + `telemetry/` パス + `getTelemetryEnabled()` gate により、ユーザーは「自社の可観測性データが自社の collector に送られる」と合理的に解釈します。しかし、`X-Qwen-Code-Session-Id` は OTLP バックエンドには到達せず、LLM API リクエストに乗って DashScope / OpenAI / Anthropic / Gemini / OpenRouter / MiniMax / ModelScope / Mistral に送られます。2 つの異なるデータ出力先の決定が 1 つのスイッチに結びついています。

2. **claude-code の類推は成立しない**：R1 の §9 では、名前空間戦略と fetch wrapper パターンの両方を claude-code に「合わせました」。しかし claude-code は Anthropic 一方 → Anthropic 一方（single vendor, single direction）であり、qwen-code はオープンソース CLI → 複数のサードパーティ provider です。「安定した cross-request UUID をすべてのサードパーティにブロードキャストする」ことは、R1 が正面から答えなかった問題です。

3. **traceparent は同じフィンガープリントの別チャネル**：trace id = `sha256(sessionId).slice(0, 32)`。受信側にとっては依然として安定した per-session 識別子です（ハッシュ後は不可逆ですが、同一セッションでは安定しています）。

LaZzyMan は重要度を次のように設定しました：session id `high` / traceparent `medium`。

### 11.2 解決策概要

**デフォルトスコープを first-party ホストに限定します。** 以下の設定項目を新設します：

```jsonc
"telemetry": {
  "sessionIdHeaderHosts": ["*"]                          // R1 のブロードキャスト動作に戻す
  "sessionIdHeaderHosts": []                              // header を完全にオフ
  "sessionIdHeaderHosts": ["api.mycompany.com",
                           "*.gateway.mycompany.internal"]
}
```

デフォルト値（`packages/core/src/telemetry/trusted-llm-hosts.ts:DEFAULT_SESSION_ID_HEADER_HOSTS` より）：

```
dashscope.aliyuncs.com
dashscope-intl.aliyuncs.com
*.dashscope.aliyuncs.com
*.dashscope-intl.aliyuncs.com
*.alibaba-inc.com
*.aliyun-inc.com
```

この集合の意味は「LLM provider、ARMS Tracing バックエンド、qwen-code 配布と同じ法的エンティティ」——つまり、claude-code における single-vendor / single-direction の関係を qwen-code で対応させたものです。サードパーティ provider（OpenAI / Anthropic / OpenRouter / 等）はデフォルトで header を**受信しません**。

### 11.3 パターン構文（意図的に小さく）

`matchesTrustedHost(hostname, patterns)` は 2 つのパターンだけをサポートし、`DashScopeOpenAICompatibleProvider.isDashScopeProvider` と合わせます：

- bare hostname → 完全一致（大文字小文字を区別しない）
- `*.suffix` → `suffix` 自身 **および** 任意のサブドメインに一致；ドットアンカーにより `evil-alibaba-inc.com` / `alibaba-inc.com.attacker.tld` などの typo-suffix 攻撃ベクターを拒否

regex、ポート/スキーム認識 globbing は導入しません。settings 内の文字列は、そのままリテラルとしての意味を持ちます。

### 11.4 R1 との実装差異

#### `wrapFetchWithCorrelation`（OpenAI / Anthropic）

R1 の wrapper は telemetry-enabled + sessionId の 2 つのゲートのみでした。R3 ではその間に第 3 のゲートを挿入します：

```ts
const trustedHosts =
  config.getTelemetrySessionIdHeaderHosts?.() ??
  DEFAULT_SESSION_ID_HEADER_HOSTS;
const broadcastAll = trustedHosts.some((p) => p.trim() === '*');

return async function correlationFetch(input, init) {
  if (!config.getTelemetryEnabled()) return baseFetch(input, init);
  if (!broadcastAll) {
    const host = extractRequestHost(input);
    if (!host || !matchesTrustedHost(host, trustedHosts)) {
      return baseFetch(input, init); // host gate
    }
  }
  const sid = config.getSessionId();
  if (!sid) return baseFetch(input, init);
  // ... header injection
};
```

`trustedHosts` は wrap 時に一度だけ snapshot されます（session id の「リクエストごとにリアルタイム読み取り」とは異なります）。途中で `telemetry.sessionIdHeaderHosts` を変更するには、contentGenerator の再構築が必要です。`[" * "]` のようなスペースを含む記述は `.trim()` でブロードキャストとして扱い、settings.json の手入力ミスによるサイレント退化を防ぎます。

#### `staticCorrelationHeaders`（Gemini）

シグネチャに `destinationUrl?: string` パラメータを追加：

```ts
export function staticCorrelationHeaders(
  config: Config,
  destinationUrl?: string,
): Record<string, string> {
  if (!config.getTelemetryEnabled()) return {};
  if (!destinationUrl) return {}; // fail-closed: 送信先が不明なら送らない
  if (!matchesTrustedHost(new URL(destinationUrl).hostname, trustedHosts)) {
    return {};
  }
  return { [SESSION_ID_HEADER]: config.getSessionId() };
}
```

#### Gemini factory 統合

Gemini SDK には 2 つの不可視なデフォルトエンドポイントがあります（`generativelanguage.googleapis.com` と `{region}-aiplatform.googleapis.com`、`vertexai` が決定）。factory 層ではそのうちの 1 つを正確に復元できません。R3 では、`config.baseUrl` が設定されていない場合は `undefined` を渡すようにし、helper を fail-closed（header を送信しない）とします。事業者は相関を取得したい場合、明示的に `baseUrl` を設定する必要があります（これは SDK 自身が送信先を解決するために使用する入力と同じものです）。この変更により、Vertex の送信先を誤って推測し、許可リストに誤ヒットすることを回避します。

### 11.5 新規ファイル / 新規コード

| ファイル                                                                             | 説明                                                                                                                          |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/src/telemetry/trusted-llm-hosts.ts` (新規)                          | `DEFAULT_SESSION_ID_HEADER_HOSTS` + `matchesTrustedHost` + `extractRequestHost`                                               |
| `packages/core/src/telemetry/trusted-llm-hosts.test.ts` (新規)                     | ユニットテスト。TLD-suffix 攻撃ベクター、IPv6 fail-closed、port/userinfo/query 抽出を含む                                    |
| `packages/core/src/telemetry/llm-correlation-fetch.ts`                             | host gate を追加；`staticCorrelationHeaders` に `destinationUrl` パラメータを追加                                             |
| `packages/core/src/telemetry/llm-correlation-fetch.test.ts`                        | host-gate 8 ケースを追加；`mockConfig` で `'hosts' in opts` により「デフォルト allowlist」と「ブロードキャスト」を区別      |
| `packages/core/src/telemetry/config.ts` (`resolveTelemetrySettings`)               | `sessionIdHeaderHosts` の受け渡しを追加                                                                                       |
| `packages/core/src/config/config.ts`                                               | `TelemetrySettings.sessionIdHeaderHosts` + `getTelemetrySessionIdHeaderHosts()` getter                                        |
| `packages/core/src/core/geminiContentGenerator/index.ts`                           | `config.baseUrl` を helper に渡す；undefined 時は fail-closed                                                                 |
| `packages/core/src/core/geminiContentGenerator/index.test.ts`                      | telemetry-on Gemini テストを新しい fail-closed セマンティクスに合わせて書き直し                                                |
| `packages/cli/src/config/settingsSchema.ts`                                        | `sessionIdHeaderHosts` JSON schema エントリ                                                                                   |
| `packages/vscode-ide-companion/schemas/settings.schema.json`                       | `npm run generate:settings-schema` で再生成                                                                                   |
| `docs/developers/development/telemetry.md`                                         | "Session correlation header" 段落を書き直し + デフォルトスコープ + オーバーライド構文                                        |

### 11.6 各 LazzyMan の論点への対応

| LazzyMan の論点                                          | R3 の対応                                                                                                                                                                                         |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ① telemetry ラベルの不一致                               | **解決**：DashScope ユースケースでは、session id header は文字通り ARMS Tracing バックエンド（同じ法的エンティティ）に送信されるため、`telemetry.enabled` のセマンティクスは一致します                 |
| ② cross-vendor 安定識別子のブロードキャスト              | **解決**：デフォルトの allowlist は Alibaba 系 first-party host のみを含む；ブロードキャストは opt-in (`["*"]`) に変更                                                                              |
| ③ traceparent は同じフィンガープリントの別チャネル       | **一旦保留**：traceparent は引き続き R1 のまま全注入。理由：W3C 標準、trace id は sha256 ハッシュ、同一ベンダー内での trace 継承は W3C の中心的な設計シナリオ。per-destination traceparent 切り替えは §10 の将来作業に記載 |

### 11.7 既知の残存課題 + フォローアップ

- **traceparent スコープ** — 上記 ③ を参照、§10 に記載
- **Per-request random UUID** (`X-Qwen-Code-Request-Id`) — LazzyMan が提案した代替案、§10 に記載
- **Gemini stale の lazy-invalidate**（§8.6 オプションA） — R3 とは切り離し、独立した sub-issue
- **`matchesTrustedHost` IPv6 サポート** — 現在の IPv6 送信先は決して allowlist に一致しません（`URL.hostname` は `[::1]` のように角括弧付きで返し、パターン構文に対応する形式がありません）。現在のところ「名前付き first-party エンドポイント」のユースケースを満たしています。将来的に raw IP の allowlist が必要になった場合に拡張します。

## 12. R4 改訂 — スコープ混同の分割

> トリガー：[LaZzyMan round-8 follow-up review on PR #4390](https://github.com/QwenLM/qwen-code/pull/4390)
> 実装：本 PR でスコープを縮小；R3 で実装された session-id 一式は独立した follow-up PR に移動

### 12.1 トリガーと論拠

R3 は LaZzyMan の初回 review の「サードパーティ provider への安定フィンガープリントブロードキャスト」懸念（重要度: high）を解決しました。しかし round-8 follow-up では、より深いアーキテクチャ原則の反対に発展しました：

> "Telemetry は隣接する機能のコンテナではありません。`traceparent` のクロスプロセス伝搬と `X-Qwen-Code-Session-Id` header 注入は **telemetry ではありません**。これらは、内部的にいくつかの OTel API を実装の詳細として使用する、送信 ID / 送信相関処理です。"

彼の核心的なメタ論点：

- **"telemetry" 名前空間は、受信者 = ユーザー自身の OTLP collector を示唆する**
- しかし `traceparent` と `X-Qwen-Code-Session-Id` の受信者 = **サードパーティ LLM provider**
- 2 種類の異なる受信者には、2 種類の異なる同意判断ツリーが必要
- たとえデフォルト動作が安全でも（R3 で実装済み）、wire レベルの動作を `telemetry.*` の下に置くことは**悪い前例**を設定する：将来の telemetry PR が wire 動作をサードパーティに紛れ込ませ続ける可能性がある
- "If we accept that principle, the split is mechanical. If we don't, this PR is the wrong place to debate it because the technical fixes are already in."

### 12.2 解決策概要（"スキームC" hybrid split）

数回の内部議論（yiliang による customHeader テンプレート代替案を含むが、最終的に customHeader はランタイム動的な値を保持できないと判断）を経て、**スキームC** を採用することにしました：

**本 PR に残すもの**：

- `UndiciInstrumentation` の登録（クライアント HTTP span を生成 → ユーザー自身の OTLP collector へ）
- OTLP feedback-loop guard（前者の必要な副作用）
- **`NoopTextMapPropagator` をデフォルトでインストール** → `propagation.inject()` は no-op → 送信 `fetch` に **`traceparent` は付与されない**
- **新たに `outboundCorrelation.propagateTraceContext: bool`（デフォルト false）** を独立した名前空間のトップレベル設定として追加；true の場合はデフォルトの W3C composite propagator をインストール
- **R3 session-id のコード一式**（`llm-correlation-fetch.ts` / `trusted-llm-hosts.ts` / `telemetry.sessionIdHeaderHosts` setting / 4 つの provider 統合ポイント / 関連テストすべて）**はすべて削除**

**follow-up PR に移動**：

- `X-Qwen-Code-Session-Id` header の仕組み全体（R3 実装を再利用）
- 新しい `outboundCorrelation.*` 名前空間に配置（具体的な setting key は未定だが、**`telemetry.*` とは呼ばない**）
- Follow-up PR には以下を含む：threat model セクション、独立した review、security-relevant と明記されたドキュメント
- `X-Qwen-Code-Request-Id` per-request UUID（LazzyMan が R3 round で提案した代替設計）もこの follow-up の検討範囲に含める

### 12.3 R1/R3 論点との対応

| R1/R3 の論点                                                              | R4 後の状態                                                                                                                                                   |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| §3.1 「すべての送信 LLM リクエストに traceparent を付与」                 | ❌ **R4 ではデフォルト off**；`outboundCorrelation.propagateTraceContext: true` の場合のみ有効                                                                |
| §3.1 「すべての送信 LLM リクエストに `X-Qwen-Code-Session-Id` を付与」   | ❌ **R4 では本 PR から一式削除**、follow-up PR に移動                                                                                                         |
| §4.3 fetch wrapper による session id 注入                               | ❌ 該当コードは本 PR に含まれない；follow-up PR で再利用                                                                                                       |
| §11 host allowlist（R3 設計）                                             | ❌ 同上；follow-up PR に全体移行                                                                                                                              |
| §4.4 新しい設定を導入しない                                               | ❌ **本 PR では `outboundCorrelation.propagateTraceContext`** 1 つのブール値を新規導入；session id 関連の設定は follow-up PR                                    |
| §10 将来作業「`X-Qwen-Code-Request-Id`」                                  | ✅ 引き続き将来作業；session-id follow-up と併せて設計                                                                                                         |

### 12.4 新しい名前空間の設計意図

`outboundCorrelation.*` トップレベル名前空間は、本 PR では 1 つのブール値 (`propagateTraceContext`) のみを持ち、過剰な構造に見えるかもしれません。しかし、これは**慎重に選択されたもの**です：

- **名前空間をコミットメントとして確立**：今後の session-id / request-id / などを自然にこの名前空間に収められる
- **security-relevant と明示**：`settingsSchema.ts` の description に "SECURITY-RELEVANT" と明示的に書き、ドキュメントでも「セキュリティ設定」として分類（「可観測性設定」ではない）
- **デフォルトはすべて off**：LazzyMan が主張した「オープンソースクライアントは明示的な同意なしに安定した ID をサードパーティに送るべきではない」という原則に準拠
- **telemetry.\* から分離**：ユーザーが settings.json で `outboundCorrelation.*` を見れば、これが送信 wire 動作であり、可観測性ではないと即座に認識できる

#### 暗黙の依存関係：`telemetry.enabled`

名前空間は `telemetry.*` から分離されていますが、**実行時に有効にするには `telemetry.enabled: true` が必要です**——OTel SDK は telemetry が有効な場合のみ初期化され、SDK がなければ propagator のインストールも `propagation.inject()` の呼び出しも行われず、フラグは静かな no-op になります。ユーザーが陥りやすい footgun：事業者が `propagateTraceContext: true` を設定しても telemetry を忘れると、trap server 上で `traceparent` が全く見えず、エラーも警告も出ません。

2 つのユーザー向けパネルでこの依存関係を明示的に注記します：

- `telemetry.md` の `propagateTraceContext` セクションに、完全なデュアルフラグ JSON 例を添付
- `settingsSchema.ts` の description 文字列の**最初の文**に "Requires `telemetry.enabled: true`" と記述（VS Code の設定 UI で長い説明が折りたたまれた後も見えるようにするため）

将来的に session-id header やその他の `outboundCorrelation.*` 設定を追加する場合も、**同じ依存関係が適用されます**——いずれも telemetry が有効であることが前提となります（OTel instrumentation/SDK を介して注入されるため）。Follow-up PR ではこの footgun 警告パターンを継承する必要があります。

### 12.5 実装

| ファイル                                                                             | 変更内容                                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/src/telemetry/llm-correlation-fetch.ts`                             | **削除**                                                                                                                                                                                                                          |
| `packages/core/src/telemetry/llm-correlation-fetch.test.ts`                        | **削除**                                                                                                                                                                                                                          |
| `packages/core/src/telemetry/trusted-llm-hosts.ts`                                 | **削除**                                                                                                                                                                                                                          |
| `packages/core/src/telemetry/trusted-llm-hosts.test.ts`                            | **削除**                                                                                                                                                                                                                          |
| `packages/core/src/telemetry/sdk.ts`                                               | + `NoopTextMapPropagator`；`getOutboundCorrelationPropagateTraceContext()` に応じて SDK の textMapPropagator を決定                                                                                                              |
| `packages/core/src/core/openaiContentGenerator/provider/default.ts`                | `wrapFetchWithCorrelation` 参照を削除                                                                                                                                                                                           |
| `packages/core/src/core/openaiContentGenerator/provider/dashscope.ts`              | 同上                                                                                                                                                                                                                              |
| `packages/core/src/core/anthropicContentGenerator/anthropicContentGenerator.ts`    | 同上                                                                                                                                                                                                                              |
| `packages/core/src/core/geminiContentGenerator/index.ts`                           | `staticCorrelationHeaders` 参照を削除                                                                                                                                                                                           |
| 上記 4 つの provider の `*.test.ts`                                                 | session-id 関連のテストケースを削除                                                                                                                                                                                               |
| `packages/core/src/config/config.ts`                                               | `TelemetrySettings.sessionIdHeaderHosts`、`getTelemetrySessionIdHeaderHosts` を削除；**新たに `OutboundCorrelationSettings` インターフェース + `outboundCorrelationSettings` フィールド + `getOutboundCorrelationPropagateTraceContext()` getter を追加**        |
| `packages/core/src/telemetry/config.ts`                                            | `resolveTelemetrySettings` 内の sessionIdHeaderHosts 受け渡しを削除                                                                                                                                                             |
| `packages/cli/src/config/settingsSchema.ts`                                        | `sessionIdHeaderHosts` schema を削除；**新たに `outboundCorrelation` トップレベル schema エントリを追加**                                                                                                                         |
| `packages/cli/src/config/config.ts`                                                | `outboundCorrelation: settings.outboundCorrelation` を `ConfigParameters` に受け渡し                                                                                                                                               |
| `packages/vscode-ide-companion/schemas/settings.schema.json`                       | `npm run generate:settings-schema` で再生成（description の後続更新時に同期して更新）                                                                                                                                             |
| `docs/developers/development/telemetry.md`                                         | "Trace context propagation" を "Client-side HTTP span on outbound fetch" に書き換え；"Session correlation header" セクション全体を削除；"Outbound correlation (SECURITY-RELEVANT)" トップレベルセクションを新設；`telemetry.enabled` 依存説明 + JSON 設定例を追加 |
| `docs/design/telemetry-outbound-propagation-design.md`                             | 本節 + R4 ヘッダー + 改訂ポインタ                                                                                                                                                                                               |
| `packages/core/src/config/config.test.ts`                                          | **新たに `OutboundCorrelation Configuration` describe block を追加**；`it.each` 4 ケースで `getOutboundCorrelationPropagateTraceContext` のデフォルト false の安全性を固定（omitted / `{}` / explicit true / explicit false） |

### 12.6 LazzyMan のメタ論点への対応

| 論点                                                          | R4 後の状態                                                                                                                                   |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| "Telemetry 名前空間は自社 collector 受信者を示唆する"         | ✅ wire 動作を `telemetry.*` から移動；新 `outboundCorrelation.*` 名前空間は「送信先はサードパーティ」という意味を明示                          |
| "デフォルト動作では明示的な同意なしにサードパーティに識別子を送るべきでない" | ✅ `propagateTraceContext` デフォルト false；session-id 一式の follow-up PR でもデフォルト off とする                                         |
| "telemetry PR が wire レベルの動作を紛れ込ませるべきでない" | ✅ 本 PR では「telemetry が wire 動作を制御する」コードパスを一切追加しない；wire 動作は `outboundCorrelation.*` で一元管理                     |
| "split is mechanical, work isn't wasted"                      | ✅ R3 実装コードは本ブランチから物理削除されるが、git history に残り、follow-up PR で再利用（または cherry-pick）可能                              |
### 12.7 フォローアップPR概要（参考情報、本PRの範囲外）

今後のフォローアップPRには以下を含めること：

- `outboundCorrelation.sessionIdHeader: { enabled, trustedHosts }` または同様の設定
- R3で既に実装済みの `wrapFetchWithCorrelation` / `matchesTrustedHost` / `DEFAULT_SESSION_ID_HEADER_HOSTS` コードの骨格を再利用
- 脅威モデルのセクション：受信者集合、安定IDの非匿名化ウィンドウ、オプションのリクエストごとのUUID対応を明確化
- **デフォルトではオフ**（デフォルトの許可リストなし —— R3より厳格、LazzyManのオープンソースCLIの原則に準拠）
- セキュリティ関連の注釈 + `docs/users/configuration/settings.md` への収録