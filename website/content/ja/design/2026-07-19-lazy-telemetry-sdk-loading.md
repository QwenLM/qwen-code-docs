# OpenTelemetry SDK を ACP 子プロセス起動パスから外して遅延読み込みする

- **Issue**: #4748（デーモンコールドスタートと qwen serve の fast-path レイテンシの最適化）
- **Status**: 実装済み
- **Date**: 2026-07-19
- **依存**: #7182（TUI モジュール削除）、以下の metafile 監査

## 問題

`channel.initialize`（2C4G で P50 約 1035ms）はデーモンのコールドな最初のセッションにおける支配的なコストであり、その約 67% は ACP 子プロセス内のモジュール読み込みです。#7182 後のバンドルの metafile 監査（コミット `de962a5ecf`、`DEV=true` の esbuild metafile）によると、ACP 子プロセスの eager な静的クロージャは **17.24 MiB / 2420 モジュール**であり、その中で OpenTelemetry クラスタが単一の最大の一貫したブロックです:

| グループ                                                                  | バイト数（tree-shake 後） |
| ---------------------------------------------------------------------- | ----------------------- |
| `@grpc/grpc-js`                                                        | 577 KiB                 |
| `@opentelemetry/otlp-transformer`                                      | 479 KiB                 |
| `protobufjs` + `long` + `@grpc/proto-loader`                           | 305 KiB                 |
| `@opentelemetry/sdk-metrics` / `sdk-node` / `sdk-trace-*` / `sdk-logs` | 約 260 KiB                |
| `@opentelemetry/instrumentation-*` + `instrumentation`                 | 約 132 KiB                |
| 残りの `@opentelemetry/*`（エクスポーター、プロパゲーター、リソース、…）    | 約 250 KiB                |
| **テレメトリークラスタ合計**                                            | **2.16 MiB**            |

この 1 バイト 1 バイトすべてが ACP 子プロセスの起動時に評価されますが:

1. テレメトリーは**デフォルトで無効** — 一般的なケースは、`initializeTelemetry()` がその後実行を拒否するコードに対して完全なモジュール税を支払っています（`sdk.ts:202` の `!config.getTelemetryEnabled()` による早期リターン）。
2. 有効な場合でも、最初の span/log/metric より前に SDK を必要とするものはなく、それは常に `initialize` が ACK された後です。

基準として: #7182 は 1.16 MiB を削除し、ACP のインポート時間を 115→52ms（-63ms）に削減しました。このクラスタはそのほぼ 2 倍のサイズであり、同程度の効果が妥当に見込めます — ただし issue の計測ゲート（下記）に従います。

## なぜインポートチェーンが eager なのか

`sdk.ts` はトップレベルですべてを静的にインポートしています（`sdk.ts:13-32`）: 6 つの OTLP エクスポーター（gRPC + HTTP × traces/logs/metrics）、`NodeSDK`、バッチプロセッサ、`PeriodicExportingMetricReader`、および両方の instrumentation。`sdk.ts` 自体は `telemetry/index.ts` を介してコアのバレルから静的に到達され、2 つのホットパスモジュールがその軽量な状態ゲッターに静的に依存しているため、完全に lazy にすることはできません:

- `telemetry/loggers.ts:80` → `isTelemetrySdkInitialized()`（すべてのログをゲート）
- `telemetry/session-tracing.ts:31` → 同上（すべての span ヘルパーをゲート）

したがって、分割は 6 つのエクスポーターインポートを `await import()` でラップするだけでなく、**軽量な状態ファサード**と**重い SDK アセンブリ**を分離しなければなりません — `NodeSDK` / instrumentation / sdk-metrics のインポート（約 0.7 MiB）も同様に削除可能で、同じファイルに存在します。

## 設計

### `packages/core/src/telemetry/` 内のファイル分割

**`sdk.ts`（残留; ファサードになる — 重いインポートなし）。** 他のモジュールが静的に到達するすべてを、名前とセマンティクスを変更せずに保持します:

- モジュール状態: `sdk`、`telemetryInitialized`、`telemetryShutdownPromise`、`activeMetricReader`（`import type` 経由で型付けされるため、実行時の読み込みなし）
- `isTelemetrySdkInitialized()`、`refreshSessionContext()`、`shutdownTelemetry()`、`forceFlushMetrics()`
- `resolveHttpOtlpUrl()`（エクスポート済み、純粋; 重い依存なし）
- `diag.setLogger(...)` の副作用（`@opentelemetry/api` のみが必要で、これはすでに広く使われていて軽量 — 56 KiB、`loggers.ts`/`metrics.ts` でも使用）

その唯一の `@opentelemetry/*` 実行時インポートは `@opentelemetry/api` です。

**`sdk-impl.ts`（新規; 重い側）。** 以下をそのまま受け取ります: 6 つの OTLP エクスポーターインポート、`NodeSDK`、`BatchSpanProcessor`、`BatchLogRecordProcessor`、`PeriodicExportingMetricReader`、両方の instrumentation、`CompressionAlgorithm`、`resourceFromAttributes`、`SessionIdSpanProcessor`、`parseOtlpEndpoint`、`validateUrl`、`normalizeOtlpPrefix` + プレフィックスマッチング、プロパゲーターゲート、および現行 `initializeTelemetry()` の本体のうちリソース構築以降の部分。1 つの関数をエクスポートします:

```ts
export function startTelemetrySdk(config: TelemetryRuntimeConfig):
  | {
      sdk: NodeSDK;
      metricReader: PeriodicExportingMetricReader | undefined;
    }
  | undefined;
```

既存の「ベースエンドポイントなしの gRPC」スキップパスでは `undefined` を返します。
`file-exporters.ts` と `log-to-span-processor.ts` も `sdk-impl.ts` の後ろに移動します（これらは現在 `sdk.ts` からのみインポートされ、`sdk-logs`/`sdk-metrics`/`sdk-trace-base` を引き込みます）。

### `initializeTelemetry` は async になる

ファサードでは:

```ts
let telemetryInitPromise: Promise<void> | undefined;

export function initializeTelemetry(
  config: TelemetryRuntimeConfig,
): Promise<void> {
  if (telemetryInitialized || !config.getTelemetryEnabled()) {
    return Promise.resolve();
  }
  telemetryInitPromise ??= (async () => {
    const { startTelemetrySdk } = await import('./sdk-impl.js');
    const started = startTelemetrySdk(config);
    if (!started) return;
    sdk = started.sdk;
    // sdk.start() + telemetryInitialized = true + setSessionContext +
    // setShellTracePropagation + initializeMetrics — 現在と同じ順序、
    // ログのみを記録する同じ try/catch。
  })().finally(() => {
    telemetryInitPromise = undefined;
  });
  return telemetryInitPromise;
}
```

重要な性質:

- **無効パスは同期的で無料のまま** — `getTelemetryEnabled()` チェックは動的インポートの前に実行されるため、デフォルト設定のユーザーは 2.16 MiB のクラスタをまったく読み込みません。これが ACP 子プロセスにとっての実際の実益です。
- シングルフライトガード（`telemetryInitPromise`）は、並行する呼び出し元の下で関数をべき等に保ち、現在の `telemetryInitialized` の再チェックに対応します。
- `shutdownTelemetry()` は変更不要: ファサードの `sdk` 変数に対して動作し、すでに `!telemetryInitialized` のときは何もしません。

### 呼び出し箇所の扱い（3 つの本番呼び出し元すべて）

1. **`packages/core/src/config/config.ts:2192`**（Config コンストラクタ — 同期コンテキスト; `deferTelemetryInitialization` は ACP モードでは false であるため（`packages/cli/src/config/config.ts:2075` 参照）、これが ACP 子プロセスの通るパスです）。ログ付き catch の fire-and-forget:

   ```ts
   void initializeTelemetry(this).catch(...)
   ```

   リスク分析: 遅延開始の唯一の結果は、その隙間に発行された span/log が `isTelemetrySdkInitialized()` ゲートによってドロップされることです — これはコンストラクタ前のウィンドウ全体およびインタラクティブ TUI パスにおいて_すでに_そうなっている動作であり、TUI ではテレメトリー初期化はバックグラウンドタスクに遅延されています（`startup-prefetch.ts:259`）。新しい失敗モードはありません。

   動作変更（意図的、文書化済み）: 遅延されないパス — ACP 子プロセスとヘッドレス `-p` 実行（`deferTelemetryInitialization` が false）— では、以前は同期的な `initializeTelemetry` 呼び出しが返るまでにテレメトリーが完全に登録されていました; 現在は非同期的に確定するため、既存のドロップウィンドウが動的インポートのコスト分（約 50〜150ms）広がります。ここで意図的に `await` _しません_: await すると 2.16 MiB のインポートが ACP 子プロセスのクリティカルパスに戻り、実益が帳消しになります。続行前にテレメトリーの準備完了を保証する必要がある呼び出し元（デーモンランタイム、呼び出し元 3）は明示的に `await` します。

2. **`packages/cli/src/startup/startup-prefetch.ts:261`**（遅延タスクランナー）。タスククロージャが promise を返すように変更します（`() => initializeTelemetry(config)`）。これにより `runDeferredTask` の既存のエラー処理が reject を観測できます。それ以外のセマンティクスは変更なし。

3. **`packages/cli/src/serve/run-qwen-serve.ts:2925`**（デーモンランタイム）。
   **`await` が必須。** すぐ次の行が `initializeDaemonMetrics()` を呼び出しており、OTel の `metrics.getMeter()` は、SDK がグローバルな MeterProvider を登録する前に呼び出されると noop メーターを恒久的にキャッシュするため — デーモンメトリクスは暗黙のうちに死にます。囲む関数はすでに async なので、`await
core.initializeTelemetry(...)` は 1 単語の変更です。これによりモジュール読み込みコストは、テレメトリーが有効な場合のみ_デーモンランタイム_の読み込みに加わります（遅延、fast パスから外れる）— 許容範囲であり、すべての ACP 子プロセスで支払うよりも厳密に優れています。

   同じ順序上の危険は原理的には `initializeMetrics()`（`metrics.ts:409`）にも存在しますが、それは `sdk.start()` の後に初期化 promise の_内部_で呼び出されるため、順序は構造上保たれます。

### バンドルガードの拡張

`scripts/check-serve-fast-path-bundle.js` の ACP 境界チェック（`findAcpImportBoundaryOffenders`）にテレメトリーブラックリストを追加し、分割が暗黙のうちにリグレッションしないようにします:

```
@grpc/grpc-js, @grpc/proto-loader, protobufjs,
@opentelemetry/otlp-transformer, @opentelemetry/sdk-node,
@opentelemetry/exporter-trace-otlp-grpc, @opentelemetry/exporter-logs-otlp-grpc,
@opentelemetry/exporter-metrics-otlp-grpc,
@opentelemetry/instrumentation-http, @opentelemetry/instrumentation-undici
```

（`@opentelemetry/api`、`semantic-conventions`、`core`、`resources`、`api-logs` はブラックリスト外に残ります — `loggers.ts`、`metrics.ts`、および型レベルのエクスポートから正当に到達可能だからです。）

## この変更が変えないもの

- テレメトリー有効時の動作変更なし — 同じエクスポーター、同じプロセッサ、同じ instrumentation フック、同じシャットダウン/フラッシュのセマンティクス。
- パブリック API の削除なし: `initializeTelemetry` の戻り型は `void → Promise<void>` に変わりますが、これは既存の fire-and-forget 呼び出し元にとってソース互換です（いずれにせよ、すべての呼び出し箇所は同じコミットで更新されます; これはコアパッケージの変更であり、AGENTS.md に従いメンテナ作成です）。
- `telemetry/index.ts` のバレルエクスポートは同じ名前を保ちます。

## 受け入れ（issue #4748 の計測ゲート）

バイト数はミリ秒に換算できません; この変更はマージ前に issue の継続的な規律を通過しなければなりません:

1. **2C4G、30 回のシリアルコールドスタート**、テレメトリー無効（デフォルト設定）: `de962a5ecf` ベースラインに対して `channel.initialize` の P50/P95 と process→最初のセッションの P50 を比較。P50 が実行間ノイズを超えて改善した場合のみ出荷。
2. **テレメトリー有効の機能パス**: 変更後に OTLP の gRPC と HTTP ターゲットがそれぞれ traces/logs/metrics を受信すること（既存の `sdk.test.ts` マトリクスに加え、ローカルコレクターに対する 1 回の手動エンドツーエンド）; `--telemetry-outfile` のファイルエクスポーターが引き続き書き込むこと。
3. **デーモンメトリクス**: テレメトリー有効時に、デーモン Status メトリクスがリングし、`initializeDaemonMetrics()` のゲージが引き続き報告すること（呼び出し箇所 3 の await をガード）。
4. **バンドルガード**: `node scripts/check-serve-fast-path-bundle.js` が拡張ブラックリストでグリーン; クロージャ監査（`.qwen/scripts/acp-closure-audit.mjs`）を再実行し、新しい ACP クロージャ合計を記録（期待値 ≈ 17.24 − 約 2.0 MiB、`@opentelemetry/api` 等が eager に保つ分を差し引く）。
5. **ユニットテスト**: `sdk.test.ts` は `initializeTelemetry` を await（15 の呼び出し箇所）; エクスポーター構築をアサートするテストは `sdk-impl.ts` に移動またはモック化。

## 検討された代替案

- **6 つのエクスポータークラスのみを遅延インポートし、`initializeTelemetry` を同期のままにする。** 却下: 約 0.7 MiB（`NodeSDK`、instrumentation、`sdk-metrics`、バッチプロセッサ）が理由なく eager なまま残り、依然としてどこかに async 境界を強制する — 有効なパスは無条件にエクスポーターを構築するため、関数はいずれにせよ async になる。
- **`telemetry/sdk.ts` モジュール全体を動的にする。** 却下: `loggers.ts` と `session-tracing.ts` はすべてのテレメトリー呼び出しを `isTelemetrySdkInitialized()` でゲートしている; そのゲートを async にすると、数十のホットな同期呼び出し箇所を汚染する。
- **ACP 子プロセスでテレメトリーを完全にスキップする。** issue ですでに却下済み（一律のスキップは、テレメトリーを有効にするユーザーにとって観測可能な動作を変える）。
