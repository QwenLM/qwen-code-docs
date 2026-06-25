# テレメトリ：アウトバウンドトレースコンテキスト & セッションIDヘッダー伝播

> 配套 issue: [#4384](https://github.com/QwenLM/qwen-code/issues/4384)
> 父 issue: [#3731](https://github.com/QwenLM/qwen-code/issues/3731) (P3 deeper observability)
> 前置 PR: #4367 (resource attributes — merged 2026-05-21, commit `64401e1`)
> 基于 2026-05-21 对 qwen-code main 分支 + 直接验证的 claude-code 源码

## 改訂履歴

| 改訂 | 日付       | トリガー                                          | 概要                                                                                                                                                                                                                                                                              |
| ---- | ---------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1   | 2026-05-21 | 初稿                                          | 全ブロードキャスト：すべてのアウトバウンド LLM リクエストに `X-Qwen-Code-Session-Id` + `traceparent` を付与                                                                                                                                                                                                            |
| R2   | 2026-05-22 | wenshao R2/R3 review                          | 境界セキュリティ：URL normalize、port matching、quote 整合、staticCorrelationHeaders try/catch、host:port fallback strip                                                                                                                                                                  |
| R3   | 2026-05-23 | LaZzyMan REQUEST_CHANGES                      | **重大なセマンティクス変更**：`X-Qwen-Code-Session-Id` のデフォルトスコープをファーストパーティ（Alibaba/DashScope）ホスト許可リストに限定。詳細は §11 参照                                                                                                                                                                 |
| R4   | 2026-05-25 | LaZzyMan round-8 follow-up (scope conflation) | **PR スコープを大幅に縮小**：本 PR はクライアント HTTP span + OTLP ループガードのみを保持；`traceparent` はデフォルト off（NoopTextMapPropagator）；`outboundCorrelation.*` トップレベル namespace を新設してセキュリティ関連の toggle を配置；R3 で実装した `X-Qwen-Code-Session-Id` の仕組みを**本 PR から削除**し、独立した follow-up PR に移動。詳細は §12 参照 |

**重要な注意**：§3.1（目標）/ §3.2（非目標）/ §4.3（Part B 設計）/ §4.4（設定スキーマへの影響）/ §5（変更ファイル一覧）/ §9（claude-code との比較）/ §10（将来の作業）/ §11（R3 ホスト許可リストスコーピング）を読む際は、必ず §12 も参照すること。**R4 の改訂により、R1-R3 が「本 PR で traceparent + session id header を同時に実装する」としていた主張はもはや成立しない**：本 PR は telemetry observability + 独立したアウトバウンドトレースコンテキスト toggle のみに限定し、アウトバウンド相関ヘッダーに関わる作業（R3 のホスト許可リストを含む）はすべて独立した follow-up PR に移動する。R3 のコード実装は無駄にはならず、follow-up PR でそのまま再利用できる。

## 1. 背景

#4367 は **emitted テレメトリの attribute と cardinality**（オペレーターが span/log/metric に `user.id` / `tenant.id` などのタグを付与できる）を解決した。しかし、**アウトバウンド LLM リクエストの HTTP ヘッダー**には手をつけていない。現在、Qwen Code が DashScope / OpenAI / Gemini / Anthropic に送るリクエストには、W3C `traceparent` もセッション ID も**一切含まれていない**。

その結果：

1. トレースコンテキストが Qwen Code のプロセス境界で途切れる。モデルサービス（例：ARMS Tracing と連携した DashScope）自体に OTel インストルメンテーションがある場合でも、そこで生成される span と Qwen Code のトレースは互いに独立しており、エンドツーエンドのトレースツリーが存在しない。
2. ワイヤー上にセッション ID が存在しない。バックエンドで Qwen Code のメトリクス/ログとサーバーサイドログを関連付けるには、トレース ID やタイムスタンプのオフラインマッチングが必要で、ヘッダーを直接読み取る方法に比べてはるかに手間がかかる。
3. ローカルトレースにクライアントサイド HTTP span が欠けている。現状では `api.generateContent` の合計所要時間しか見えず、ネットワーク TTFB / レスポンスボディサイズ / リトライ回数が把握できない。

## 2. 現状

### 2.1 `HttpInstrumentation` のみが有効

`packages/core/src/telemetry/sdk.ts:330`：

```ts
instrumentations: [new HttpInstrumentation()],
```

`HttpInstrumentation` は Node 組み込みの `http`/`https` モジュールのみをフックし、`globalThis.fetch` / undici のパスは**カバーしない**。

### 2.2 2 つの LLM SDK がどちらも fetch / undici を使用

| SDK                                              | HTTP 実装                                                                                                                          | `HttpInstrumentation` がカバーするか |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `openai@5.11.0`                                  | `globalThis.fetch`（Node 18+ = undici）。根拠：`node_modules/openai/internal/shims.mjs` のエラー `'fetch' is not defined as a global` | ❌                             |
| `@google/genai@1.30.0`                           | `globalThis.fetch` + `new Headers()`。根拠：`dist/node/index.mjs` 内の `new Headers()` 呼び出し                                        | ❌                             |
| `@anthropic-ai/sdk`（anthropicContentGenerator） | 同様に fetch ベース                                                                                                                     | ❌                             |

### 2.3 コードベースに手動 propagation が存在しない

```
grep -rn "propagation\.\|setGlobalPropagator\|W3CTraceContext\|traceparent" packages/core/src --include="*.ts" | grep -v "\.test\."
```

→ 空。`propagation.inject()` の呼び出しも、traceparent の手動注入も、一切存在しない。

### 2.4 各プロバイダーの `defaultHeaders` の現状

OpenAI ファミリー（`openai` SDK を使用）：

すべての OpenAI サブプロバイダーは `DefaultOpenAICompatibleProvider` を継承している。**`buildHeaders` のオーバーライド動作は 2 種類**（grep audit により確認済み）：

| プロバイダー   | ファイル                   | `buildHeaders()` の動作                                                                   | 影響                                           |
| ---------- | ---------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 基底クラス       | `default.ts:63-74`     | `{ 'User-Agent' }` + customHeaders を提供                                                 | ここを変更                                         |
| DashScope  | `dashscope.ts:110-124` | **`override` だが `super` を呼ばない**——`User-Agent` + `X-DashScope-*` を新規オブジェクトとして返す          | **個別に変更が必要**、そうしないと相関ヘッダーが欠落する |
| OpenRouter | `openrouter.ts:20-30`  | `override` するが**先に `const baseHeaders = super.buildHeaders()` を呼ぶ**                          | 基底クラスの変更を自動継承 ✅                              |
| DeepSeek   | `deepseek.ts`          | `buildHeaders` をオーバーライドしない（`buildRequest` / `getDefaultGenerationConfig` のみオーバーライド） | 基底クラスの変更を自動継承 ✅                              |
| Minimax    | `minimax.ts`           | DeepSeek と同様                                                                             | 自動継承 ✅                                    |
| Mistral    | `mistral.ts`           | DeepSeek と同様                                                                             | 自動継承 ✅                                    |
| ModelScope | `modelscope.ts`        | DeepSeek と同様                                                                             | 自動継承 ✅                                    |

→ **OpenAI ファミリーは 2 つのファイルを変更する必要がある**：`default.ts` と `dashscope.ts`。残りの 5 つは自動継承。

Google Gemini：

| プロバイダー | ファイル                           | ヘッダー注入パス                                                     |
| -------- | ------------------------------ | -------------------------------------------------------------- |
| Gemini   | `geminiContentGenerator.ts:59` | `new GoogleGenAI({ httpOptions: { headers } })` — SDK ネイティブサポート |

Anthropic：

| プロバイダー  | ファイル                                                                                                   | ヘッダー注入パス       |
| --------- | ------------------------------------------------------------------------------------------------------ | ---------------- |
| Anthropic | `anthropicContentGenerator.ts:177` (`buildHeaders`) + `:212` (`defaultHeaders` arg to `new Anthropic`) | `defaultHeaders` |

**合計 4 つの SDK 構築ポイント**でセッション ID ヘッダーを注入する必要がある。すべての SDK は `defaultHeaders` / `httpOptions.headers` をすでにサポートしており、fetch wrapper は不要。

### 2.5 既存の proxy と fetch 設定

`provider/default.ts:87-89`：

```ts
const runtimeOptions = buildRuntimeFetchOptions(
  'openai',
  this.cliConfig.getProxy(),
);
```

`buildRuntimeFetchOptions` はユーザーが proxy を設定した場合に `{ fetch: customFetch }` などを返し、`setGlobalDispatcher(new ProxyAgent(...))` をトリガーする（`config.ts:1126-1128` 参照）。**undici のグローバル dispatcher モードは `UndiciInstrumentation` と互換性がある**——monkey-patch された `globalThis.fetch` と undici の channel diagnostics を組み合わせて動作し、特定の dispatcher には依存しない。

## 3. 目標 / 非目標

### 3.1 目標

- すべてのアウトバウンド LLM リクエストに W3C `traceparent` ヘッダーを自動付与（OTel SDK デフォルトの `W3CTraceContextPropagator`）
- ~~すべての~~ アウトバウンド LLM リクエストに `X-Qwen-Code-Session-Id` ヘッダーを付与（claude-code と同じ製品ネームスペース） — **R3 改訂**：デフォルトではファーストパーティ（Alibaba/DashScope）ホストへの注入のみ。サードパーティプロバイダーにはデフォルトで送信しない；§11 参照
- OTLP exporter endpoint 自体のトレース（フィードバックループ）を自動的に回避
- LLM リクエストに精確なクライアント span を追加（ネットワーク遅延とモデル遅延を分離）
- 4 つのプロバイダー構築ポイントをカバー：OpenAI 基底クラス、DashScope オーバーライド、Gemini、Anthropic
- ストリーミングリクエスト / proxy モード / リトライシナリオで退行しない
- #4367 の設計哲学と一致：`defaultHeaders` などの SDK ネイティブオプションを使用 — **R1 改訂**：staleness 問題のため fetch wrapper に変更；**R3 改訂**：fetch wrapper 内にさらに host gate を追加

### 3.2 非目標

- **`baggage` ヘッダー**：標準 SDK はサポートしているが、Qwen Code は `propagation.setBaggage()` を呼ばないため、デフォルトでは送信されない。本設計では有効化しない。
- **サブプロセスへの `TRACEPARENT` 環境変数の継承**：claude-code は Bash/PowerShell サブプロセスに `TRACEPARENT` を注入する。Qwen Code の `BashTool` は未対応。独立した follow-up サブ issue として扱う。
- **受信 `TRACEPARENT` / `TRACESTATE` の読み取り**：claude-code の `-p` モードと Agent SDK は env から traceparent を読み取って親プロセスのトレースを継続する。Qwen Code は未対応。独立した follow-up として扱う。
- **`X-Qwen-Code-Request-Id`**：claude-code には `x-client-request-id` があり、タイムアウトの相関に有用。今期は対応しない。次のサブ issue として検討可能。
- **カスタム propagator（B3 / Jaeger / X-Ray）**：デフォルトの W3C で 99% のシナリオをカバーできる。将来の設定オプションとして検討可能。
- ~~**per-endpoint 選択的注入**：claude-code はサードパーティ endpoint（Bedrock / Vertex）には traceparent を送信しない；Qwen Code はサードパーティ区別の必要がなく、一律送信で問題ない。~~ — **R3 改訂**：この主張は覆された。LaZzyMan のレビューで、Qwen Code は複数のサードパーティプロバイダー（OpenAI / Anthropic / OpenRouter / 等）に接続するオープンソース CLI であり、claude-code のファーストパーティ→ファーストパーティの類比は当てはまらないと指摘された。セッション ID ヘッダーはホストごとに区別する必要がある。§11 参照。`traceparent` は R1 設計どおり全送信を維持（W3C 標準ヘッダーであり、trace id は `sha256(sessionId)` のハッシュ値）。per-destination toggle は独立した follow-up として追加可能（`telemetry.propagateTraceContext`）。

## 4. 設計

### 4.1 全体レイヤー構成

```
┌─ qwen-code process ────────────────────────────────────────────┐
│                                                                │
│  ┌─ session-tracing.ts ─┐                                     │
│  │ active span ctx      │                                     │
│  └──────┬───────────────┘                                     │
│         │                                                      │
│         ▼                                                      │
│  ┌─ propagation.inject() (called by undici instrumentation) ─┐│
│  │ writes `traceparent: 00-<traceId>-<spanId>-01` to headers ││
│  └─────────────────────────────────────────────────────────────┘│
│         │                                                      │
│  ┌──────▼──────────────────────────────────────────────────┐  │
│  │   fetch() — undici, instrumented                        │  │
│  │   creates HTTP client span                              │  │
│  │   injects traceparent into request headers              │  │
│  │   (skipped via ignoreRequestHook if endpoint is OTLP)   │  │
│  └─────────────────────────────────────────────────────────┘  │
│         │                                                      │
│         │   ┌─ defaultHeaders (per SDK constructor) ───────┐  │
│         │   │ { 'X-Qwen-Code-Session-Id': sessionId, ... } │  │
│         └───┴────────────────────────────────────────────────┘ │
│             │                                                  │
└─────────────┼──────────────────────────────────────────────────┘
              │
              ▼ outbound HTTP
   POST /v1/chat/completions
   traceparent: 00-...
   X-Qwen-Code-Session-Id: ...
   ... (existing User-Agent, X-DashScope-*, etc.)
```

2 つの注入パスは独立しており、互いに依存しない：

| レイヤー                    | 注入タイミング                              | 注入主体                                                      |
| ------------------------ | ------------------------------------- | ------------------------------------------------------------- |
| `traceparent`            | fetch 呼び出しのたびに                     | `UndiciInstrumentation` が自動注入（OTel SDK デフォルト propagator から） |
| `X-Qwen-Code-Session-Id` | SDK 構築時に一度だけ `defaultHeaders` に書き込む | アプリケーションコード                                                      |

### 4.2 Part A — undici instrumentation による `traceparent`

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

OTel SDK 自体が fetch を使ってデータを OTLP collector に POST する。スキップしないと、UndiciInstrumentation が「データ上報」リクエストにも span を作成する → その新しい span がさらに上報される → 無限ループ / 大量のノイズが発生する。この問題はすべての OTel プロジェクトで踏まれており、OTel ドキュメントでもこの hook を明示的に推奨している。

#### デフォルト propagator

OTel SDK の `NodeSDK` に `textMapPropagator` を渡さない場合、デフォルトは `CompositePropagator([W3CTraceContextPropagator, W3CBaggagePropagator])` になる。明示的な設定は不要。

#### `traceparent` フォーマット

```
traceparent: 00-<32hex traceId>-<16hex spanId>-<01 sampled | 00 not sampled>
              ─┬─                                          ─┬─
               version (固定 00)                            flags
```

固定 55 バイト、パディングなし。

#### `tracestate` と `baggage`

- `tracestate`：上流から渡された場合にのみ引き継ぐ。自身の inject では能動的に追加しない（OTel SDK の動作）。
- `baggage`：`propagation.setBaggage(ctx, ...)` が呼ばれた場合のみ存在する。Qwen Code では呼ばないため送信されない。

### 4.3 Part B — fetch wrapper（OpenAI / Anthropic）+ static ヘッダー（Gemini）による `X-Qwen-Code-Session-Id`

> **R3 改訂**：以下の設計は fetch wrapper の staleness 解決と 4 つのプロバイダー統合ポイントを説明する——これらは保持される。ただし wrapper 内部にホスト許可リストゲートが追加され、`staticCorrelationHeaders` には `destinationUrl` パラメーターも追加された。ホストゲート付きの最新実装コードとデフォルト許可リストは §11 参照。

#### 重要：staleness 問題と解決策の選択

単純なアプローチ（`defaultHeaders` に `getSessionId()` をそのまま bake-in する）には**真のバグ**がある：

1. `pipeline.ts:60` で contentGenerator 構築時に一度だけ `this.client = this.config.provider.buildClient()` が呼ばれ、SDK クライアントの `defaultHeaders` にその時点のセッション ID が固定される
2. `config.ts:1850` のセッションリセット（ユーザーが `/clear` を実行したときにトリガー）は `this.sessionId` を更新して `refreshSessionContext()` を呼ぶが、**contentGenerator は再生成しない**
3. 以降の LLM 呼び出しは古いクライアントを使い続ける → ワイヤー上のヘッダーは古いセッション ID のまま → バックエンドの相関がずれる

→ セッション ID は**リクエストごとに**読み取る必要があり、構築時に固定してはならない。

#### 解決策

```
                   ┌─ fetch サポート ─┐  解決策
OpenAI SDK          │     ✅       │  fetch wrapper (リクエストごとに sessionId を読み取る) ✅
Anthropic SDK       │     ✅       │  fetch wrapper ✅
@google/genai SDK   │     ❌       │  static httpOptions.headers + staleness を許容
                   └──────────────┘
```

`@google/genai` の `HttpOptions` インターフェースは `fetch` をサポートしていない（`node_modules/@google/genai/dist/genai.d.ts` を grep で確認済み：`baseUrl`/`apiVersion`/`headers`/`timeout`/`extraParams` のみ）。そのため Gemini は static ヘッダーを使用し、OpenAI/Anthropic とは異なる——これは **known limitation** であり、§8.6 参照。

#### 集中ヘルパー関数（リクエストごとの fetch wrapper）

新規ファイル `packages/core/src/telemetry/llm-correlation-fetch.ts`：

```ts
import type { Config } from '../config/config.js';

/**
 * Wrap a fetch implementation so every outbound request gets correlation
 * headers (`X-Qwen-Code-Session-Id`) populated from the **current** session
 * id, not the value captured when the SDK client was constructed.
 *
 * Matches claude-code's pattern (src/services/api/client.ts:370-390 —
 * `buildFetch()`). Per-request injection is necessary because `/clear`
 * resets the session id mid-process; SDK clients (and their static
 * `defaultHeaders`) are NOT recreated on reset.
 *
 * Caller responsible for choosing the base fetch — usually
 * `runtimeOptions?.fetch ?? globalThis.fetch` so proxy-aware fetch is
 * preserved when ProxyAgent is in use.
 *
 * If telemetry is disabled, returns baseFetch unchanged (no correlation
 * header is added, matching the privacy stance of §3.1).
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
      // Defensive: empty header value is rejected by some HTTP middleware.
      // Skip injection rather than send `X-Qwen-Code-Session-Id: `.
      return baseFetch(input, init);
    }
    const headers = new Headers(init?.headers);
    headers.set('X-Qwen-Code-Session-Id', sid);
    return baseFetch(input, { ...init, headers });
  };
}
```

static ヘッダーしか渡せない SDK（Gemini）向けのコンパニオンヘルパー：

```ts
/**
 * Static correlation headers. Captures the session id at call time —
 * **subject to staleness** if the host SDK keeps these headers in a
 * captured-at-construction slot (e.g. `@google/genai`'s `httpOptions.headers`).
 * Prefer `wrapFetchWithCorrelation` whenever the SDK exposes a `fetch` hook.
 */
export function staticCorrelationHeaders(
  config: Config,
): Record<string, string> {
  if (!config.getTelemetryEnabled()) return {};
  return { 'X-Qwen-Code-Session-Id': config.getSessionId() };
}
```

#### 統合ポイント 1: `provider/default.ts`（OpenAI 基底クラス）

`buildClient()` の変更——既存の `runtimeOptions.fetch`（proxy）と wrapper を合成する：

```ts
buildClient(): OpenAI {
  // ... existing ...
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
    // After spread, override `fetch` so our correlation wrapper wraps the
    // proxy-aware fetch (or globalThis.fetch when no proxy).
    fetch: wrapFetchWithCorrelation(baseFetch, this.cliConfig),
  });
}
```

`buildHeaders()` 自体は変更なし。

#### 統合ポイント 2: `provider/dashscope.ts`（オーバーライド）

`buildClient()` も同様の合成パターン（元々 buildClient をオーバーライドしている）。`buildHeaders()` は変更なし。

#### 統合ポイント 3: `geminiContentGenerator/index.ts`（ファクトリー、コンストラクターではない）

**以前の設計で過剰に主張していた点を修正**：`geminiContentGenerator.ts` のコンストラクターは**シグネチャを変更する必要がない**。`index.ts:48` のファクトリー関数はすでに `gcConfig: Config` を受け取っている（line 33 で `gcConfig?.getUsageStatisticsEnabled()` を使用済み）。ファクトリー内で相関の static ヘッダーを `httpOptions.headers` にマージするだけでよい：

```ts
// geminiContentGenerator/index.ts
let headers: Record<string, string> = { ...baseHeaders };
if (gcConfig?.getUsageStatisticsEnabled()) {
  // ... existing x-gemini-api-privileged-user-id ...
}
headers = { ...headers, ...staticCorrelationHeaders(gcConfig) }; // ← 新規追加
const httpOptions = config.baseUrl
  ? { headers, baseUrl: config.baseUrl }
  : { headers };
// new GeminiContentGenerator(...) unchanged
```

シグネチャ変更ゼロ。

#### 統合ポイント 4: `anthropicContentGenerator.ts`

Anthropic SDK も同様にカスタム `fetch` を受け付ける（既に `buildRuntimeFetchOptions` を使用している）。`buildClient` のパスで fetch を wrap する。方法は OpenAI default.ts と同じ。`buildHeaders` は変更なし。

#### 優先度チェーン

変更なし：ユーザーの `customHeaders` は `defaultHeaders` のマージ内で依然として優先される（§8.2 の spoofing 議論参照）。fetch wrapper が注入する `X-Qwen-Code-Session-Id` は、SDK のヘッダーリストの**後**に最終 `Headers` オブジェクトに追加される——Node の `Headers.set()` のセマンティクスにより、以前の同名ヘッダー（ユーザーの customHeaders に書かれた同名ヘッダーを含む）を上書きする。

**OpenAI/Anthropic（fetch wrapper パス）**：correlation > customHeaders > SDK デフォルト。
**Gemini（static ヘッダーパス）**：customHeaders > correlation > SDK デフォルト（既存の spread 順序を踏襲）。

差異は、fetch wrapper パスでは spoofing ができなくなること（fetch wrapper が SDK ヘッダーの後に実行される）。これは**バグ修正の副産物**であり、意図的に制限を強化したわけではないが、よりセキュアである。§8.2 に明記する必要がある。

### 4.4 設定スキーマへの影響

~~**ほぼゼロ**。本設計では新しい設定を導入しない~~ — **R3 改訂**：`telemetry.sessionIdHeaderHosts: string[]` という新しい設定を導入した。デフォルトのファーストパーティホスト許可リストを上書きするためのもの。スキーマ項目は `packages/cli/src/config/settingsSchema.ts` に追加済み。説明とオーバーライド構文（`["*"]` でブロードキャスト復元 / `[]` で全無効 / カスタム配列）は §11 参照。以下の元の説明は R3 以前のみ有効：

- `traceparent` 注入は telemetry enabled によって制御（既存の toggle）
- `X-Qwen-Code-Session-Id` 注入も telemetry enabled によって制御
- `ignoreRequestHook` の OTLP URL は既存の設定から読み取り済み

将来追加できる設定（**スコープ外**）：

- `telemetry.outboundCorrelationHeader`：カスタムヘッダー名（デフォルト `X-Qwen-Code-Session-Id`）
- `telemetry.outboundPropagationDisabled`：グローバルに無効化（LLM サービスが未知のヘッダーに厳格な場合）
- ~~per-destination ヘッダースコープ toggle~~ — **R3 で実装済み**、§11 参照

## 5. 変更ファイル一覧

| ファイル                                                                            | 変更種別 | 説明                                                                                                                                                            |
| ------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/package.json`                                                    | 依存追加   | `@opentelemetry/instrumentation-undici`                                                                                                                         |
| `packages/core/src/telemetry/sdk.ts`                                            | 変更     | `UndiciInstrumentation` + `ignoreRequestHook` を追加                                                                                                                  |
| `packages/core/src/telemetry/llm-correlation-fetch.ts`                          | 新規ファイル   | `wrapFetchWithCorrelation()`（OpenAI/Anthropic）+ `staticCorrelationHeaders()`（Gemini フォールバック）                                                                |
| `packages/core/src/core/openaiContentGenerator/provider/default.ts`             | 変更     | `buildClient()` 内の `new OpenAI({...})` に `fetch: wrapFetchWithCorrelation(baseFetch, cliConfig)` を追加                                                             |
| `packages/core/src/core/openaiContentGenerator/provider/dashscope.ts`           | 変更     | 上記と同様（`buildClient` をオーバーライド）                                                                                                                                  |
| `packages/core/src/core/geminiContentGenerator/index.ts`                        | 変更     | ファクトリー関数内で `staticCorrelationHeaders(gcConfig)` を `httpOptions.headers` にマージ（**呼び出し元に既に Config があるためシグネチャ変更ゼロ** — 以前の過剰な仕様を修正） |
| `packages/core/src/core/anthropicContentGenerator/anthropicContentGenerator.ts` | 変更     | `buildClient` のパスで SDK の `fetch` option を `wrapFetchWithCorrelation` でラップ                                                                                      |

**明示的に audit 済みだが変更不要**（レビュアーがパスを見落としたと疑わないよう）：

- `packages/core/src/qwen/qwenContentGenerator.ts` — `OpenAIContentGenerator` を継承し、`DashScopeOpenAICompatibleProvider` を使用。**dashscope.ts の buildClient 変更を自動継承する**。すべての Qwen OAuth フローも恩恵を受ける。
- `packages/core/src/core/loggingContentGenerator/loggingContentGenerator.ts` — wrapper パターンで SDK クライアントを構築しない（telemetry logging 用に他の contentGenerator をラップする）。変更不要。
- `packages/core/src/core/contentGenerator.ts` — ファクトリーエントリーポイント。クライアントを保持しない。
  | `packages/core/src/telemetry/sdk.test.ts` | 変更 | undici instrumentation の登録 + ignoreRequestHook のテストを追加 |
  | `packages/core/src/telemetry/llm-correlation-fetch.test.ts` | 新規ファイル | telemetry on/off の動作の単体テスト + リクエストごとの sessionId 読み取り検証（重要：セッションリセット後、wrapped fetch が新しい ID を読み取ることを確認） |
  | 各プロバイダーの `*.test.ts` | 変更 | SDK 構築時に `fetch` option がラップされたバージョンであることをアサート（OpenAI/Anthropic）；Gemini 構築時に `httpOptions.headers` に `X-Qwen-Code-Session-Id` が含まれることをアサート |
  | `docs/developers/development/telemetry.md` | 変更 | "Trace context & session correlation propagation" セクションを追加 |
  | `docs/design/telemetry-outbound-propagation-design.md` | 本ファイル | 設計ドキュメント |

## 6. PR 分割方針

レビューのしやすさを考慮して 2 つの PR に分割（まとめることも可能、規模的には問題ない）：

### PR 1 — `traceparent` 自動注入（構造的変更）

- `@opentelemetry/instrumentation-undici` 依存関係の追加
- `sdk.ts` に `UndiciInstrumentation` + `ignoreRequestHook` を追加
- テスト：SDK 登録、OTLP endpoint がトレースされないことの確認
- ドキュメント断片

**リスク**：低。追加的変更。既存のクライアント span 構造は変わらず、ネット的にはプラス。

### PR 2 — `X-Qwen-Code-Session-Id` ヘッダー（ヘルパー関数と合わせて）

- 新規ファイル `llm-correlation-headers.ts`
- 4 つのプロバイダーへの統合
- テスト：各プロバイダーでヘッダーが存在することをアサート；telemetry 無効時は送信されないことを確認
- ドキュメント断片

**リスク**：低〜中。`geminiContentGenerator` コンストラクターのシグネチャ拡張が呼び出し元に波及する可能性に注意。

### PR 3（任意） — ドキュメント + E2E 検証

- `telemetry.md` セクションの充実
- E2E 検証スクリプトの追加（`/tmp/verify-telemetry-pr-4367.mjs` パターンを流用）：実際に fetch を実行してヘッダーをキャプチャ

PR 2 にまとめることも可能。

### 順序の優先度

PR 1 と PR 2 は技術的に**互いに独立している**——コードを共有しない。しかし**PR 1 を先にマージすることを推奨する**：

- `traceparent` は OTel **標準**ヘッダーであり、任意の OTel 対応 collector / バックエンドが即座に認識する → ユーザーはすぐに恩恵を受けられる
- `X-Qwen-Code-Session-Id` は**製品独自**のヘッダーであり、バックエンドが認識するよう設定されて初めて価値を持つ → 価値実現に時間がかかる
- PR 2 のレビューサイクルが長引いても、PR 1 ですでにクロスプロセストレースが機能する
- PR 1 は追加的構造変更（低リスク）であり、まず信頼を確立するのに適している

## 7. テスト計画

### 7.1 `sdk.ts` 単体テスト

- ✅ `UndiciInstrumentation` が `NodeSDK` の `instrumentations` に存在する
- ✅ `ignoreRequestHook` が `https://collector:4318/v1/traces` に対して true を返す
- ✅ `ignoreRequestHook` が `https://dashscope.aliyuncs.com/...` に対して false を返す
- ✅ 末尾スラッシュあり / なし の両方で正しくマッチする

### 7.2 `llm-correlation-fetch.ts` 単体テスト

**`wrapFetchWithCorrelation`**：

| シナリオ                                                    | 期待値                                                                   |
| ------------------------------------------------------- | ---------------------------------------------------------------------- |
| `getTelemetryEnabled() === false`                       | wrapped fetch = baseFetch（ヘッダーを追加しない）                           |
| `getTelemetryEnabled() === true`, sessionId = "abc-123" | wrapped fetch が送信する init.headers に `X-Qwen-Code-Session-Id: abc-123` が含まれる |
| `init.headers` に既に `X-Qwen-Code-Session-Id: spoof` がある     | wrapper が本物の sessionId で上書きする（fetch wrapper パスでは spoof を許可しない、§8.1）   |
| **セッションリセット後に wrapped fetch が再度呼ばれる**           | **新しい sessionId を読み取る**（staleness 修正のリグレッションガード）             |
| baseFetch が reject する                                        | wrapper は reject を透過させ、飲み込まない                                               |

**`staticCorrelationHeaders`**（Gemini パス）：

| シナリオ                                                    | 期待される戻り値                                                         |
| ------------------------------------------------------- | ---------------------------------------------------------------- |
| `getTelemetryEnabled() === false`                       | `{}`                                                             |
| `getTelemetryEnabled() === true`, sessionId = "abc-123" | `{ 'X-Qwen-Code-Session-Id': 'abc-123' }`                        |
| sessionId に Unicode が含まれる（`会話-1`）                      | そのまま返す——HTTP ヘッダー値のエンコードは SDK が担当                      |
| sessionId が空文字列                                    | `{ 'X-Qwen-Code-Session-Id': '' }`——ビジネス不変条件であり、このレイヤーでは検証しない |

### 7.3 プロバイダーごとの統合テスト

各プロバイダーの `buildHeaders()` / 構築テストに以下を追加：

```ts
it('includes X-Qwen-Code-Session-Id when telemetry enabled', () => {
  const config = makeFakeConfig({
    sessionId: 'sess-xyz',
    telemetry: { enabled: true },
  });
  const provider = new DefaultProvider(genConfig, config);
  expect(provider.buildHeaders()['X-Qwen-Code-Session-Id']).toBe('sess-xyz');
});

it('omits X-Qwen-Code-Session-Id when telemetry disabled', () => {
  const config = makeFakeConfig({ telemetry: { enabled: false } });
  const provider = new DefaultProvider(genConfig, config);
  expect(provider.buildHeaders()).not.toHaveProperty('X-Qwen-Code-Session-Id');
});
```

### 7.4 E2E 検証（tmux + ローカル HTTP サーバー）

⚠️ ヘッダーをキャプチャするために `globalThis.fetch` を**モックしてはならない**：`UndiciInstrumentation` は undici の diagnostics channel hook を通じて機能するため、globalThis.fetch を monkey-patch すると instrumentation が完全にバイパスされる可能性があり（patch の順序次第）、`traceparent` の注入をテストできなくなる。**正しい方法はローカル HTTP サーバーを立ち上げること**。SDK に実際にリクエストを送信させ、サーバー側で受信したヘッダーを記録する。

`/tmp/verify-telemetry-pr-4367.mjs` に倣ったスクリプトを作成する：

1. `http.createServer((req, res) => { capturedHeaders.push(req.headers); res.end('{}') })` でローカルサーバーを起動
2. telemetry + outfile を有効化し、OpenAI SDK の `baseURL` を `http://127.0.0.1:<port>` に向ける（または mock プロバイダーを使って SDK に実際の fetch を送信させる）
3. `client.chat.completions.create(...)` を 1 回実行（最小限の解析可能な mock レスポンスが必要。そうしないと SDK が解析エラーを起こす——ローカルサーバーは合法だが空の OpenAI レスポンスを返せばよい）
4. `capturedHeaders[0]` に `traceparent: 00-...` と `X-Qwen-Code-Session-Id: <sessionId>` が含まれることをアサート
5. 別ポートで OTLP collector mock を立ち上げ、そこへの OTLP レポートが `traceparent` 注入を**トリガーしない**ことを確認（`ignoreRequestHook` の検証）
6. **追加：staleness 検証** — リクエスト 1 を送信 → `config.resetSession(...)` を呼び出す → リクエスト 2 を送信 → リクエスト 2 の `X-Qwen-Code-Session-Id` が新しいセッション ID であることをアサート（**これが #1 修正の重要なリグレッションテスト**）

### 7.5 リグレッション保護

- ストリーミング chat completion の fetch（`stream: true` 付き）が正常に閉じられること——`UndiciInstrumentation` はストリーミングレスポンスに対する span ライフサイクルに過去バグがあったため、**実装時には実際にストリーミング completion をエンドツーエンドで実行し、クライアント span が正常に終了すること / span のリークがないこと / ストリームが切断されないことを確認する必要がある**。特定のバージョン番号で修正済みとは仮定しないこと
- proxy モード（`ProxyAgent`）と instrumentation の同時有効化——`ignoreRequestHook` は endpoint 文字列マッチングで動作するため、proxy の影響を受けない
- リトライ（`maxRetries`）時、各リトライが独立したクライアント span を持つが、いずれも同じ `traceparent` parent を共有する（理想的にはリトライが同一親 span 下の複数 child span になるが、これは SDK の動作に依存しており、本設計では強制しない）

## 8. 境界 / エッジケース

### 8.1 customHeaders のオーバーライドと spoofing の動作の不一致

プロバイダーのパスによって spoofing の挙動が**異なる**（設計上の結果であり、意図的な制限強化ではない）：

| プロバイダーパス                           | spoofing 可能? | 理由                                                                                                                |
| --------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------- |
| OpenAI / Anthropic (fetch wrapper パス) | ❌ 不可  | fetch wrapper が SDK ヘッダーリストの後に `headers.set('X-Qwen-Code-Session-Id', ...)` を実行し、ユーザーの customHeaders の同名ヘッダーを上書きする |
| Gemini (static ヘッダーパス)            | ✅ 可能    | マージ順序 `{ ...baseHeaders, ...correlationHeaders, ...customHeaders }`——customHeaders が最後に勝つ                      |

claude-code も fetch wrapper パスを使用しており、OpenAI/Anthropic と同じ挙動（spoofing 不可）。これは staleness バグの修正の副産物であり、元々意図した変更ではない。

**2 つのパスを「揃える」つもりはない**——Gemini パスの挙動は SDK の制限（`fetch` hook がない）によるものであり、OpenAI も static に降格させるのは合理的でない。

セッション ID の spoofing は実際の脅威ではない（ユーザーがローカルを制御しており、ソースコードを直接変更できる）。ドキュメントにこの差異を明記し、レビュアーが fetch wrapper パスで spoof できないことを見て customHeaders の優先度に疑問を持たないようにする。

### 8.2 OTLP collector URL マッチングの 2 種類のエッジケース

#### (a) URL 内の認証トークン

ユーザーの OTLP endpoint が `https://collector/path?token=secret` のような形式の場合、`ignoreRequestHook` の `url.startsWith(e)` 比較にクエリ文字列が含まれる。しかし undici が渡す `request.path` はパスまでであり（クエリを含まない）、比較時の `e` もパス部分のみを使用する。安全のため、クエリを取り除く：

```ts
const otlpUrls = [...]
  .map((u) => u.replace(/\?.*$/, '').replace(/\/$/, ''));
```

#### (b) startsWith によるホスト名境界を越えた理論上の false positive

`e = "http://collector"`（ポートなし）の場合、対象 URL = `http://collector-fake/v1/traces` に startsWith が誤ってマッチする。

**実際のトリガー確率は極めて低い**：

- OTLP endpoint はほぼ常にポートを含む（4317 gRPC / 4318 HTTP）。`http://collector:4318` の形式では `-fake` のような延長は不可能（ポートの後は `/` が続く）
- ポートなしで endpoint を設定することは設定ミスであり、元々 SDK はデフォルトのフォールバックを使う

**harden したい場合**：裸の startsWith を使わず、URL の origin と path を個別に比較する：

```ts
const parsed = otlpUrls.map((u) => new URL(u));
return parsed.some(
  (e) =>
    `${request.origin}` === e.origin && request.path.startsWith(e.pathname),
);
```

今期は対応しない——コストが不要であり、false positive が実際にトリガーされることもない。

### 8.3 Vertex AI モードの Gemini

`@google/genai` は `vertexai: true` モードをサポートする（GCP クレデンシャルを使って generative ai endpoint ではなく Vertex endpoint を使用）。両モードとも fetch を使うため、instrumentation がカバーする。`httpOptions.headers` は両モードで有効。

### 8.4 Anthropic SDK の既存 `defaultHeaders` ロジック

`anthropicContentGenerator.ts:177` はすでに `buildHeaders()` を呼び出してその結果を `new Anthropic({ defaultHeaders })` に渡している。しかし staleness は同様に適用される——本設計では `fetch` wrapper パスに変更する（OpenAI と統一）。

### 8.5 SDK と fetch の間の trailer ヘッダー

`openai` SDK はストリーミング時に `Transfer-Encoding: chunked` や trailer ヘッダーを使う場合がある。これらはリクエスト時の `traceparent` / `X-Qwen-Code-Session-Id` の注入には影響しない——どちらもリクエストヘッダーであり、送信時に一度に書き込まれる。

### 8.6 ⚠️ Known limitation: Gemini のセッション ID が `/clear` 後に stale になる

`@google/genai` SDK が `fetch` hook をサポートしていない（`HttpOptions` インターフェースには `baseUrl`/`apiVersion`/`headers`/`timeout`/`extraParams` しかない）ため、Gemini プロバイダーは static な `httpOptions.headers` パスを使用する——セッション ID は SDK 構築時にキャプチャされ、**`/clear` でセッションリセットが発生しても更新されない**。

**実際の影響範囲**：

- ユーザーが Qwen Code を起動 → `/clear` → Gemini モデルを使用 → ワイヤー上の `X-Qwen-Code-Session-Id` は古いセッション ID
- バックエンドの相関がずれる（trace id とログはすでに新しいセッションに切り替わっているが、ワイヤーヘッダーは遅れる）

**今期修正しない理由**：

- OpenAI / Anthropic のパスにはこのバグが**ない**（fetch wrapper パスはリクエストごとにセッション ID を読み取る）
- Gemini の修正パスには複数の選択肢があるが、いずれも今期のスコープを超えている（以下参照）

**将来の修正パス選択肢**（推奨順）：

| 選択肢                                          | 説明                                                                                 | コスト                                                                                      |
| --------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| **A. Lazy invalidate** ★ 推奨                 | セッションリセット時に contentGenerator を dirty とマークし、次の LLM 呼び出し時に lazy recreate        | 小：`resetSession` + LLM 呼び出しエントリーポイントに約 10 行追加；同期 API で侵襲性低い                            |
| B. Eager recreate                             | セッションリセット時に即座に `await createContentGenerator(...)` を呼び出し、`resetSession` の非同期化が必要 | 中：API 変更が連鎖的に波及                                                                      |
| C. Proxy headers オブジェクト                       | `httpOptions.headers` に Proxy を wrap して getter を傍受                                        | リスク高：`@google/genai` 内部でリクエストごとにヘッダーを再読するかどうかが不明。サイレントに壊れる可能性がある |
| D. `@google/genai` 上流に `fetch` option を追加するよう提案 | google-deepmind/generative-ai-js に PR を提出                                            | 長期；制御できない                                                                              |

**ドキュメントでユーザーに対して説明すること**：Gemini プロバイダーを使用する場合、`/clear` 直後に LLM 呼び出しがあると、その時点のワイヤー上のセッション ID は古い値になる。トレース相関で間接的に修正できる（span/log 上の session.id はすでに新しい値になっている）。

選択肢 A を追跡するための独立した follow-up サブ issue を作成すること。

## 9. claude-code との比較

| 次元                         | claude-code                                                                                                                                          | Qwen Code 本設計                                                                                                                                                              | 判断根拠                                                                                                                           |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| セッション ID ヘッダー名       | `X-Claude-Code-Session-Id`（製品プレフィックス）                                                                                                               | `X-Qwen-Code-Session-Id`（製品プレフィックス）                                                                                                                                          | ✅ 同じネームスペース戦略                                                                                                                |
| セッション ID 注入機構          | SDK `defaultHeaders`（`client.ts:108`）+ カスタム `buildFetch()` wrapper（`client.ts:370-390`、リクエストごとに `randomUUID()` を注入して `x-client-request-id` を設定） | OpenAI/Anthropic は fetch wrapper（リクエストごとにセッション ID を読み取り、`/clear` の staleness を回避）；Gemini は static `httpOptions.headers`（SDK 制限）                                   | claude-code の fetch wrapper パターンに合わせる。claude-code も fetch wrapper を使うことでリクエストごとに `x-client-request-id` を追加できる                 |
| セッション ID の永続性            | claude-code には `/clear` 式のセッションリセットがない；session = プロセス                                                                                        | `/clear` リセットがある → fetch wrapper パスは自動追従；static ヘッダーパスは stale になる（§8.6）                                                                                           | Qwen Code 固有の複雑さ                                                                                                             |
| セッション ID のエンコード              | HTTP ヘッダー（baggage ではない）                                                                                                                                          | HTTP ヘッダー                                                                                                                                                                   | ✅ 同じ——バックエンドフレンドリー                                                                                                                |
| `traceparent` 注入           | クローズドソース；公開ドキュメントには記載あり；オープンソースリポジトリに `propagation.inject` / `UndiciInstrumentation` の参照なし                                                           | `@opentelemetry/instrumentation-undici` で自動                                                                                                                                  | claude-code の実装は不可視。OTel 公式推奨パスを選択し、よりシンプル                                                                       |
| `traceparent` の送信範囲       | Anthropic ファーストパーティ API のみ；Bedrock/Vertex/Foundry には送信しない                                                                                                  | すべてのアウトバウンド fetch に送信（W3C 標準；trace id は `sha256(sessionId)` のハッシュ）。**R3 改訂**：セッション ID ヘッダーはファーストパーティ（Alibaba/DashScope）許可リストのみに注入、サードパーティにはデフォルトで送信しない。§11 参照 | R3 以降、Qwen Code のセッションヘッダーは claude-code と同様のファーストパーティのみのセマンティクスを持つ；`traceparent` は per-destination toggle の follow-up で対応予定 |
| `x-client-request-id`（ランダム） | あり、自動                                                                                                                                             | 今期は対応しない（独立した follow-up サブ issue として価値がより高い）                                                                                                                   | スコープ管理                                                                                                                           |
| サブプロセスの `TRACEPARENT` 環境変数     | ドキュメントに記載あり（実装はクローズドソース）                                                                                                                             | 対応しない（独立した follow-up）                                                                                                                                                        | スコープ管理                                                                                                                           |
| 受信 `TRACEPARENT` の読み取り      | ドキュメントに記載あり（`-p` / Agent SDK モード）                                                                                                                                | 対応しない（独立した follow-up）                                                                                                                                                        | スコープ管理                                                                                                                           |

**検証済み vs ドキュメント記載の注記**：

| 主張                                           | 検証状態                                                                                                                                          |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `X-Claude-Code-Session-Id` via `defaultHeaders` | ✅ オープンソースの `src/services/api/client.ts:108` を確認済み                                                                                              |
| `x-client-request-id` via fetch wrapper         | ✅ オープンソースの `src/services/api/client.ts:370-390` を確認済み                                                                                          |
| `traceparent` 注入                              | ⚠️ docs.claude.com/docs/en/monitoring-usage.md のみ言及；オープンソースリポジトリで `grep -rn "propagation\.inject\|UndiciInstrumentation\|traceparent" src` を実行すると空 |

## 10. 将来の作業

#3731 P3 に関連するが、本設計には**含まれない**：

- **`X-Qwen-Code-Request-Id`** リクエストごとのランダム UUID（claude-code 相当：`x-client-request-id`）。タイムアウト / timeout error の相関に有用——タイムアウト時、サーバーサイドではまだリクエスト ID が割り当てられていない可能性があり、クライアントが事前に送った ID が唯一の関連手段になる。R3 改訂後、この提案はより重要になった：リクエストごとの UUID は「クロスリクエストの行動プロファイリング」リスクがなく、「すべての LLM プロバイダーに送るサポート/デバッグヘッダー」として機能できる。
- **`traceparent` の per-destination スコープ toggle** — R3 はセッション ID ヘッダーのスコープのみを処理した；`traceparent` はすべてのアウトバウンド fetch に引き続き注入される。`telemetry.propagateTraceContext: 'trusted-hosts' | 'all' | 'none'` を追加し、§11 と同じ許可リストを使って動作を決定できるようにすることが可能。
- **Gemini のセッション ID staleness lazy-invalidate 修正**（§8.6 選択肢 A）：`/clear` 時に contentGenerator を dirty とマークし、次の LLM 呼び出し時に lazy recreate。Gemini パスでも fetch wrapper のリアルタイム性を享受できるようにする。
- **サブプロセスの `TRACEPARENT` 環境変数**：`BashTool` でサブプロセスを実行する際に環境変数を注入し、外部ツールがトレースを引き継げるようにする。ツール実行ライフサイクルを個別に確認する必要がある。
- **受信 `TRACEPARENT`**：`--prompt` モードで起動時に環境変数を読み取り、CI / 外部 orchestrator が Qwen Code をより大きなトレースに接続できるようにする。
- **`correlationHeader` 名の設定可能化**：企業のオペレーターがヘッダーをカスタマイズできるようにする（デフォルト `X-Qwen-Code-Session-Id`）。
- **`baggage` propagation ポリシー**：`user.id` / `tenant.id` などを baggage として積極的に設定し、下流に伝播させるかどうか。今期は対応しない。要件が明確になってから検討する。

## 11. R3 改訂 — `X-Qwen-Code-Session-Id` のホスト許可リストスコーピング

> トリガー：[LaZzyMan による PR #4390 での REQUEST_CHANGES レビュー](https://github.com/QwenLM/qwen-code/pull/4390)
> 実装 commit：`1c8528a56`（コア実装）+ `cb162e716`（Vertex baseUrl フェイルクローズド + `["*"]` trim フォールバック）

### 11.1 トリガーと論証

R1 の設計は `X-Qwen-Code-Session-Id` を**すべての**アウトバウンド LLM リクエストに注入し、`telemetry.enabled` のみで制御していた。LaZzyMan のレビューは 3 つの段階的な問題を指摘した：

1. **ラベルの不一致**：`feat(telemetry):` + `telemetry/` パス + `getTelemetryEnabled()` ゲートにより、ユーザーは「自社の可観測性データが自社の collector に流れる」と合理的に理解する。しかし `X-Qwen-Code-Session-Id` は OTLP バックエンドには届かず、LLM API リクエストとして DashScope / OpenAI / Anthropic / Gemini / OpenRouter / MiniMax / ModelScope / Mistral に送られる。2 種類の異なるデータ出力の決定が 1 つのスイッチに束ねられている。

2. **claude-code の類比が成立しない**：R1 の §9 でネームスペース戦略と fetch wrapper パターンを claude-code に「合わせた」。しかし claude-code は Anthropic（一者）→ Anthropic（一者）（シングルベンダー、単方向）であり、Qwen Code はオープンソース CLI → 複数のサードパーティプロバイダー。「安定したクロスリクエスト UUID をすべてのサードパーティにブロードキャストする」という点は、R1 が正面から答えていなかった問題。

3. **traceparent は同じ指紋の別チャンネル**：trace id = `sha256(sessionId).slice(0, 32)`。受信側にとっては依然として安定した per-session 識別子（ハッシュ後は不可逆だが、同じセッション内では安定している）。

LaZzyMan が深刻度を判定：session id `high` / traceparent `medium`。

### 11.2 解決策の概要

**デフォルトスコープをファーストパーティホストに限定する**。新しい設定を追加：

```jsonc
"telemetry": {
  "sessionIdHeaderHosts": ["*"]                          // R1 のブロードキャスト動作に戻す
  "sessionIdHeaderHosts": []                              // ヘッダーを全無効化
  "sessionIdHeaderHosts": ["api.mycompany.com",
                           "*.gateway.mycompany.internal"]
}
```

デフォルト値（`packages/core/src/telemetry/trusted-llm-hosts.ts:DEFAULT_SESSION_ID_HEADER_HOSTS`）：

```
dashscope.aliyuncs.com
dashscope-intl.aliyuncs.com
*.dashscope.aliyuncs.com
*.dashscope-intl.aliyuncs.com
*.alibaba-inc.com
*.aliyun-inc.com
```

このセットのセマンティクスは「LLM プロバイダー、ARMS Tracing バックエンド、Qwen Code ディストリビューションが同一法的主体」——つまり、claude-code のシングルベンダー/単方向の関係に対応する Qwen Code のセット。サードパーティプロバイダー（OpenAI / Anthropic / OpenRouter / 等）はデフォルトではヘッダーを**受信しない**。

### 11.3 パターン構文（意図的に最小限）

`matchesTrustedHost(hostname, patterns)` は 2 種類のパターンのみをサポートし、`DashScopeOpenAICompatibleProvider.isDashScopeProvider` と整合する：

- ベアホスト名 → 完全一致（大文字小文字無視）
- `*.suffix` → `suffix` 自体**AND** 任意のサブドメインにマッチ；ドット境界でアンカーされ、`evil-alibaba-inc.com` / `alibaba-inc.com.attacker.tld` などの typo-suffix 攻撃ベクトルを拒否する

正規表現、ポート/スキームを意識した glob は導入しない——settings.json 内の文字列は見た目どおりのセマンティクスを持たせる。

### 11.4 R1 との実装上の差異

#### `wrapFetchWithCorrelation`（OpenAI / Anthropic）

R1 の wrapper は telemetry-enabled + sessionId の 2 つのゲートのみだった。R3 では両者の間に 3 番目のゲートを挿入する：

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

`trustedHosts` は wrap 時に一度スナップショットされる（セッション ID の「リクエストごとのリアルタイム読み取り」とは異なる）。途中で `telemetry.sessionIdHeaderHosts` を変更した場合、有効にするには contentGenerator の再生成が必要。`[" * "]` のようにスペースを含む書き方は `.trim()` でブロードキャストにフォールバックし、settings.json の手入力ミスによるサイレントな退行を防ぐ。

#### `staticCorrelationHeaders`（Gemini）

シグネチャに `destinationUrl?: string` パラメーターを追加：

```ts
export function staticCorrelationHeaders(
  config: Config,
  destinationUrl?: string,
): Record<string, string> {
  if (!config.getTelemetryEnabled()) return {};
  if (!destinationUrl) return {}; // fail-closed: 宛先不明の場合は送信しない
  if (!matchesTrustedHost(new URL(destinationUrl).hostname, trustedHosts)) {
    return {};
  }
  return { [SESSION_ID_HEADER]: config.getSessionId() };
}
```

#### Gemini ファクトリーの統合

Gemini SDK には 2 つの不可視なデフォルト endpoint がある（`generativelanguage.googleapis.com` と `{region}-aiplatform.googleapis.com`、`vertexai` の設定によって決まる）。ファクトリーレイヤーではどちらか一方を正確に復元できない。R3 では「`config.baseUrl` が設定されていなければ `undefined` を渡す」アプローチをとり、helper を fail-closed にする → ヘッダーを送信しない。オペレーターが相関を必要とする場合は `baseUrl` を明示的に設定する必要がある（SDK 自体も宛先を解決するために同じ入力を使用する）。この変更により、Vertex の宛先を誤って推測して許可リストに誤ってマッチすることを防ぐ。

### 11.5 新規ファイル / 新規コード

| ファイル                                                                 | 説明                                                                                              |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `packages/core/src/telemetry/trusted-llm-hosts.ts`（新規）             | `DEFAULT_SESSION_ID_HEADER_HOSTS` + `matchesTrustedHost` + `extractRequestHost`                   |
| `packages/core/src/telemetry/trusted-llm-hosts.test.ts`（新規）        | 単体テスト：TLD suffix 攻撃ベクトル、IPv6 のフェイルクローズド、ポート/ユーザー情報/クエリの抽出を含む                          |
| `packages/core/src/telemetry/llm-correlation-fetch.ts`               | ホストゲートを追加；`staticCorrelationHeaders` に `destinationUrl` パラメーターを追加                                 |
| `packages/core/src/telemetry/llm-correlation-fetch.test.ts`          | ホストゲートの 8 つのケースを追加；`mockConfig` で `'hosts' in opts` を使って「デフォルト許可リスト」と「ブロードキャスト」を区別 |
| `packages/core/src/telemetry/config.ts`（`resolveTelemetrySettings`） | `sessionIdHeaderHosts` を透過                                                                       |
| `packages/core/src/config/config.ts`                                 | `TelemetrySettings.sessionIdHeaderHosts` + `getTelemetrySessionIdHeaderHosts()` getter            |
| `packages/core/src/core/geminiContentGenerator/index.ts`             | `config.baseUrl` を helper に渡す；undefined の場合はフェイルクローズド                                            |
| `packages/core/src/core/geminiContentGenerator/index.test.ts`        | 新しいフェイルクローズドのセマンティクスに合わせて telemetry-on の Gemini テストを書き直す                                            |
| `packages/cli/src/config/settingsSchema.ts`                          | `sessionIdHeaderHosts` の JSON スキーマエントリー                                                    |
| `packages/vscode-ide-companion/schemas/settings.schema.json`         | `npm run generate:settings-schema` で再生成                                                    |
| `docs/developers/development/telemetry.md`                           | "Session correlation header" セクションを書き直し、デフォルトスコープとオーバーライド構文を追加                                |

### 11.6 各 LaZzyMan の論点への回答

| LaZzyMan の論点                         | R3 での回答                                                                                                                                                             |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ① telemetry ラベルの不一致                  | **解消**：DashScope のユースケースでは、セッション ID ヘッダーは文字通り ARMS Tracing バックエンド（同一法的主体）に送られる。`telemetry.enabled` のセマンティクスと整合する                                                       |
| ② クロスベンダーの安定識別子ブロードキャスト | **解消**：デフォルトの許可リストには Alibaba 系ファーストパーティホストのみ含まれる；ブロードキャストは opt-in（`["*"]`）                                                                                                   |
| ③ traceparent は同じ指紋の別チャンネル    | **現時点では保持**：traceparent は R1 設計どおり全注入を継続。理由：W3C 標準、trace id は sha256 ハッシュ、同一ベンダー内でのトレース継続は W3C のコア設計シナリオ。per-destination traceparent toggle は §10 の将来の作業として記録 |

### 11.7 既知の残課題と追跡項目

- **traceparent のスコープ** — 上記 ③ 参照、§10 に記録
- **リクエストごとのランダム UUID**（`X-Qwen-Code-Request-Id`）— LaZzyMan が R3 ラウンドで提案した代替設計、§10 に記録
- **Gemini staleness lazy-invalidate**（§8.6 選択肢 A）— R3 とは分離して独立したサブ issue で追跡
- **`matchesTrustedHost` の IPv6 サポート** — 現在、IPv6 宛先は許可リストに一切含まれない（`URL.hostname` が `[::1]` のように角括弧付きで返し、パターン構文に対応形式がない）。現時点では「名前付きファーストパーティ endpoint」のユースケースを満たしている。将来 raw IP の許可リストが必要になった場合に拡張する。

## 12. R4 改訂 — スコープ混在の分割

> トリガー：[PR #4390 での LaZzyMan round-8 フォローアップレビュー](https://github.com/QwenLM/qwen-code/pull/4390)
> 実装：本 PR を縮小；R3 で実装したセッション ID 全体を独立した follow-up PR に移動

### 12.1 トリガーと論証

R3 は LaZzyMan の第 1 ラウンドレビューの「安定した指紋をサードパーティプロバイダーにブロードキャストする」懸念（深刻度：high）を解消した。しかし round-8 フォローアップでは、より深いアーキテクチャ原則への反対に発展した：

> "Telemetry is not a container for adjacent features. The `traceparent` cross-process propagation and the `X-Qwen-Code-Session-Id` header injection are **not telemetry**. They are outbound-identity / outbound-correlation work that uses some OTel APIs internally as an implementation detail."

彼のコアとなるメタ論点：

- **"telemetry" namespace は recipient = ユーザー自身の OTLP collector を暗示する**
- しかし `traceparent` と `X-Qwen-Code-Session-Id` の recipient = **サードパーティ LLM プロバイダー**
- 2 種類の異なる recipient には 2 種類の異なる同意判断ツリーが必要
- デフォルト動作がセキュアでも（R3 で実装済み）、ワイヤーレベルの動作を `telemetry.*` 下に置くことは**悪い先例を設ける**：将来の telemetry PR でもサードパーティへのワイヤー動作を持ち込めてしまう
- "If we accept that principle, the split is mechanical. If we don't, this PR is the wrong place to debate it because the technical fixes are already in."

### 12.2 解決策の概要（「方案 C」ハイブリッド分割）

複数ラウンドの内部議論（yiliang が提案した customHeader テンプレート代替案を含む。最終的に customHeader はランタイムダイナミックな値を持てないと判断）の後、**方案 C** を採用：

**本 PR に残すもの**：

- `UndiciInstrumentation` の登録（クライアント HTTP span を生成 → ユーザー自身の OTLP collector に送る）
- OTLP フィードバックループガード（前者の必要な副作用）
- **`NoopTextMapPropagator` をデフォルトとしてインストール** → `propagation.inject()` が no-op になる → アウトバウンド `fetch` に**`traceparent` が付かなくなる**
- **新設 `outboundCorrelation.propagateTraceContext: bool`（デフォルト false）** を独立した namespace のトップレベル設定として追加；true に設定するとデフォルトの W3C composite propagator がインストールされる
- R3 で実装したセッション ID 関連のコード全体（`llm-correlation-fetch.ts` / `trusted-llm-hosts.ts` / `telemetry.sessionIdHeaderHosts` 設定 / 4 つのプロバイダー統合ポイント / 関連するすべてのテスト）を**すべて削除**

**follow-up PR に移動するもの**：

- `X-Qwen-Code-Session-Id` ヘッダーの仕組み全体（R3 実装を再利用）
- 新しい `outboundCorrelation.*` namespace に移行（具体的な設定キーは TBD だが、**`telemetry.*` は使わない**）
- Follow-up PR には：脅威モデルセクション、独立したレビュー、security-relevant 標注のドキュメントを含める
- `X-Qwen-Code-Request-Id` リクエストごとの UUID（LaZzyMan が R3 ラウンドで提案した代替設計）もこの follow-up の検討範囲に含める

### 12.3 R3・R1 論点とのマッピング

| R1/R3 論点                                          | R4 以降の状態                                                                                                           |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| §3.1「すべてのアウトバウンド LLM リクエストに traceparent を付与」              | ❌ **R4 ではデフォルト off**；`outboundCorrelation.propagateTraceContext: true` が必要                                       |
| §3.1「すべてのアウトバウンド LLM リクエストに `X-Qwen-Code-Session-Id` を付与」 | ❌ **R4 では本 PR から丸ごと削除**し follow-up PR に移動                                                                          |
| §4.3 fetch wrapper によるセッション ID 注入                  | ❌ 本 PR にはコードが存在しない；follow-up PR で再利用                                                                           |
| §11 ホスト許可リスト（R3 設計）                        | ❌ 同上；follow-up PR に全体移行                                                                                      |
| §4.4 新しい設定を導入しない                               | ❌ **本 PR は `outboundCorrelation.propagateTraceContext` という boolean を 1 つ追加**；セッション ID 関連設定は follow-up PR |
| §10 将来の作業「`X-Qwen-Code-Request-Id`」          | ✅ 引き続き将来の作業；セッション ID の follow-up と合わせて設計                                                               |

### 12.4 新しい namespace の設計意図

`outboundCorrelation.*` トップレベル namespace は、本 PR では boolean が 1 つ（`propagateTraceContext`）しかなく、過剰に構造化されているように見える。しかしこれは**意図的な選択**だ：

- **namespace をコミットメントとして確立する**：後続のセッション ID / リクエスト ID / etc. がこの namespace に自然に収まるようにする
- **security-relevant と標注する**：`settingsSchema.ts` の description に "SECURITY-RELEVANT" を明示的に記載し、「セキュリティ設定」としてドキュメント化する（「observability 設定」ではなく）
- **デフォルトはすべて off**：LaZzyMan が提唱する「オープンソースクライアントは明示的な同意なしにサードパーティに安定した ID を送るべきでない」原則に合致する
- **`telemetry.*` との分離**：ユーザーが settings.json で `outboundCorrelation.*` を見ると、これがアウトバウンドのワイヤー動作であり observability ではないとすぐに識別できる

#### 暗黙の依存関係：`telemetry.enabled`

namespace は `telemetry.*` から分離されているが、**実行時の有効化は `telemetry.enabled: true` に依存している**——OTel SDK は telemetry が有効な場合にのみ初期化される。SDK なしでは propagator がインストールされず、`propagation.inject()` が呼ばれず、flag はサイレントな no-op になる。踏みやすい落とし穴：オペレーターが `propagateTraceContext: true` を設定しても telemetry を忘れて有効にしないと、サーバーで `traceparent` が一切見えず、エラーも警告も出ない。

ユーザー向けの 2 つのパネルにはこの依存関係を明示する：

- `telemetry.md` の `propagateTraceContext` セクションに両フラグの完全な JSON 例を添付
- `settingsSchema.ts` の description 文字列の**冒頭**に "Requires `telemetry.enabled: true`" と記載（VS Code 設定 UI で長い説明が折り畳まれても見えるように先頭に置く）

将来 session-id header や他の `outboundCorrelation.*` 設定を追加する場合、**同じ依存関係が適用される**——すべて OTel instrumentation/SDK を通じて注入されるため、telemetry が有効な前提でのみ意味を持つ。Follow-up PR ではこの落とし穴への注意喚起パターンを継承すること。

### 12.5 実装

| ファイル                                                                            | 変更内容                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/src/telemetry/llm-correlation-fetch.ts`                          | **削除**                                                                                                                                                                                                                          |
| `packages/core/src/telemetry/llm-correlation-fetch.test.ts`                     | **削除**                                                                                                                                                                                                                          |
| `packages/core/src/telemetry/trusted-llm-hosts.ts`                              | **削除**                                                                                                                                                                                                                          |
| `packages/core/src/telemetry/trusted-llm-hosts.test.ts`                         | **削除**                                                                                                                                                                                                                          |
| `packages/core/src/telemetry/sdk.ts`                                            | `NoopTextMapPropagator` を追加；`getOutboundCorrelationPropagateTraceContext()` の結果に基づいて SDK の textMapPropagator を決定                                                                                                                          |
| `packages/core/src/core/openaiContentGenerator/provider/default.ts`             | `wrapFetchWithCorrelation` の参照を削除                                                                                                                                                                                              |
| `packages/core/src/core/openaiContentGenerator/provider/dashscope.ts`           | 同上                                                                                                                                                                                                                              |
| `packages/core/src/core/anthropicContentGenerator/anthropicContentGenerator.ts` | 同上                                                                                                                                                                                                                              |
| `packages/core/src/core/geminiContentGenerator/index.ts`                        | `staticCorrelationHeaders` の参照を削除                                                                                                                                                                                              |
| 上記 4 つのプロバイダーの `*.test.ts`                                               | セッション ID 関連のテストケースを削除                                                                                                                                                                                                       |
| `packages/core/src/config/config.ts`                                            | `TelemetrySettings.sessionIdHeaderHosts`・`getTelemetrySessionIdHeaderHosts` を削除；**`OutboundCorrelationSettings` インターフェース + `outboundCorrelationSettings` フィールド + `getOutboundCorrelationPropagateTraceContext()` getter を新設**        |
| `packages/core/src/telemetry/config.ts`                                         | `resolveTelemetrySettings` から sessionIdHeaderHosts の透過を削除                                                                                                                                                                        |
| `packages/cli/src/config/settingsSchema.ts`                                     | `sessionIdHeaderHosts` スキーマを削除；**`outboundCorrelation` トップレベルスキーマ項目を新設**                                                                                                                                                   |
| `packages/cli/src/config/config.ts`                                             | `outboundCorrelation: settings.outboundCorrelation` を `ConfigParameters` に透過                                                                                                                                                    |
| `packages/vscode-ide-companion/schemas/settings.schema.json`                    | `npm run generate:settings-schema` で再生成（description 更新時に同期して更新）                                                                                                                                                     |
| `docs/developers/development/telemetry.md`                                      | "Trace context propagation" → "Client-side HTTP span on outbound fetch" に書き直し；"Session correlation header" セクション全体を削除；"Outbound correlation (SECURITY-RELEVANT)" トップレベルセクションを新設；`telemetry.enabled` 依存説明 + JSON 設定例を添付 |
| `docs/design/telemetry-outbound-propagation-design.md`                          | 本セクション + R4 表ヘッダー + 改訂ポインター                                                                                                                                                                                         |
| `packages/core/src/config/config.test.ts`                                       | **`OutboundCorrelation Configuration` describe ブロックを新設**、`it.each` で 4 つのケースを記述し `getOutboundCorrelationPropagateTraceContext` のデフォルト false というセキュリティ不変条件を固定（省略 / `{}` / 明示的 true / 明示的 false）                |

### 12.6 LaZzyMan のメタ論点への回答

| 論点                                            | R4 以降の状態                                                                                             |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| "Telemetry namespace は自社 collector の受信を暗示する" | ✅ ワイヤー動作は `telemetry.*` から移動済み；新しい `outboundCorrelation.*` namespace が「アウトバウンドのサードパーティ」セマンティクスを明示       |
| "デフォルト動作で明示的同意なしにサードパーティに識別子を送るべきでない"      | ✅ `propagateTraceContext` はデフォルト false；セッション ID 全体の follow-up PR もデフォルト off にする                      |
| "telemetry PR はワイヤーレベルの動作を持ち込むべきでない"         | ✅ 本 PR では「telemetry がワイヤー動作を制御する」コードパスを一切追加しない；ワイヤー動作は `outboundCorrelation.*` で統一管理 |
| "split is mechanical, work isn't wasted"        | ✅ R3 実装コードは本ブランチから物理削除し、git history に残して follow-up PR で再利用（または cherry-pick）          |

### 12.7 follow-up PR の概要（情報提供のみ、本 PR のスコープ外）

将来の follow-up PR に含めるべき内容：

- `outboundCorrelation.sessionIdHeader: { enabled, trustedHosts }` または類似の設定
- R3 で実装した `wrapFetchWithCorrelation` / `matchesTrustedHost` / `DEFAULT_SESSION_ID_HEADER_HOSTS` のコード骨格を再利用
- 脅威モデルのセクション：recipient セット、安定した ID の匿名性解除ウィンドウ、オプションのリクエストごとの UUID セット
- **デフォルト off**（デフォルトの許可リストなし——R3 よりも厳格。LaZzyMan のオープンソース CLI 原則に合致）
- security-relevant 標注 + docs/users/configuration/settings.md への収録
