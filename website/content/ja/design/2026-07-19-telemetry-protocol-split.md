# テレメトリーエクスポーターのプロトコル分割（lazy SDK フェーズ 2）

- Status: 実装済み
- Issue: QwenLM/qwen-code#7264（候補 1）、#4748 のフォローアップ
- 先行: `2026-07-19-lazy-telemetry-sdk-loading.md`（ファサード / impl の分割）

## 問題

フェーズ 1 はテレメトリー SDK 全体を動的な `import()` の後ろに移動し、テレメトリーオフのプロセスは何も読み込まなくなりました。しかしテレメトリー**オン**のプロセスは依然として `sdk-impl.ts` の完全な静的クロージャを読み込んでおり、設定がどちらを選択しても両方の OTLP プロトコルチェーンがバンドルされています:

| クラスタ                                                                                                              | サイズ（metafile、de962a5ecf + フェーズ 1） | 必要とするもの                            |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------ |
| gRPC チェーン（`@grpc/grpc-js`、`protobufjs`、`@grpc/proto-loader`、`exporter-*-otlp-grpc`、`long`、`lodash.camelcase`） | 1121 KiB / 125 モジュール                | `otlpProtocol: 'grpc'` のみ          |
| HTTP チェーン（`exporter-*-otlp-http`）                                                                                  | 23 KiB / 17 モジュール                   | `otlpProtocol: 'http'` のみ          |
| 共有 OTLP 層（`otlp-transformer`、`otlp-exporter-base`）                                                         | 915 KiB / 41 モジュール                  | 両方の OTLP プロトコル（outfile は**含まない**） |

metafile は、エクスポーターパッケージ自体以外で OTLP サーフェスの 2 つの静的インポーターを示しています:

1. `sdk-impl.ts`（その `CompressionAlgorithm` インポート）— エクスポーター構築をプロトコルモジュールに移動することで削除。
2. `@opentelemetry/sdk-node` 自体 — その `utils.js`/`sdk.js` は、`OTEL_*_EXPORTER` 環境変数ベースの自動設定をサポートするために、すべてのエクスポーターパッケージ（otlp proto/http/grpc × 3 シグナル、zipkin、prometheus）を eager に `require()` します。qwen-code はそれらのコードパスに到達しません: 常に明示的な `spanProcessors` / `logRecordProcessors` を渡します（空配列でも環境変数フォールバックをショートカットします）。以下のバンドル時スタブで対処。

両方を切ることで、この分割は outfile パスから OTLP サーフェス全体を、HTTP パスから gRPC チェーンを、gRPC パスから HTTP チェーンを削除します。

フェーズ 1 の 2C4G ベンチマークは、これがなぜ重要かを示しました: テレメトリーオン（outfile）で、sdk-impl の動的読み込みが 2 コア上でセッションセットアップと CPU を奪い合い（`config_construction`/`bootstrap` +50 ms）、インポートチェーンの −50 ms の実益の大部分を食べていました。実際に読み込まれるものを縮小すれば、その競合も縮小します。

## 設計

2 つの新しいモジュールがエクスポーター構築を所有し、それぞれ対応する設定ブランチでのみ `startTelemetrySdk` から動的な `import()` で読み込まれます:

- `packages/core/src/telemetry/sdk-exporters-grpc.ts`
  - 3 つの gRPC エクスポーター + `CompressionAlgorithm` + `PeriodicExportingMetricReader` をインポート。
  - `createGrpcExporters(endpoint)` → `{ spanExporter, logExporter, metricReader }`、すべて gzip 圧縮、現在の構築と完全に一致。
- `packages/core/src/telemetry/sdk-exporters-http.ts`
  - 3 つの HTTP エクスポーター + `PeriodicExportingMetricReader` + `LogToSpanProcessor` をインポート。
  - `createHttpExporters({ tracesUrl, logsUrl, metricsUrl, logToSpan })` →
    `{ spanExporter?, logExporter?, metricReader?, logToSpanProcessor? }`。
    logs→spans ブリッジの決定（logs エンドポイントなし、traces あり）もここに移動します。ブリッジは HTTP トレースエクスポーターを構築するためです。

`sdk-impl.ts` の変更:

- 6 つのエクスポーターインポートと `CompressionAlgorithm` をすべて削除; エクスポーター変数は、すでに依存している SDK インターフェース（`SpanExporter`、`LogRecordExporter`）に対して型付けされます。
- `startTelemetrySdk` は `async` になります。ブランチの順序は保持されます:
  - ベースエンドポイントなしの gRPC は、プロトコルモジュールの読み込み**前**に引き続き `undefined` を返します。
  - HTTP の URL 検証（`validateUrl`）は `sdk-impl.ts` に残ります; HTTP モジュールは、少なくとも 1 つのシグナル URL が検証を通過した場合のみインポートされます。
  - outfile ブランチはどちらのプロトコルモジュールにも触れません。
- ファサードは `startTelemetrySdk` を await します（すでにシングルフライトの async クロージャ内で実行されているため、呼び出し元から見える変更はありません）。

`esbuild.config.js` に `sdkNodeExporterStubPlugin` が追加されます: インポーターが `@opentelemetry/sdk-node` である場合にのみ、エクスポーターパッケージはコンストラクタがスローするスタブに解決されます。私たちのプロトコルモジュールは実際のパッケージに解決され続けます。sdk-node はこれらのバインディングに環境変数駆動の設定関数内部でのみ触れますが、qwen-code の明示的なプロセッサ引数により、traces と logs については到達不能になります; 到達可能な唯一のパス（`OTEL_METRICS_EXPORTER=otlp` など）は、デフォルトの localhost エンドポイントに暗黙のうちにエクスポートする代わりに、`NodeSDK.start()` 内でスローするようになります — ファサードの既存の try/catch がキャッチします。環境変数ベースのエクスポーター選択は、サポートされた qwen-code の設定サーフェスであったことはありません。

分割後に各設定が読み込むもの（各バンドルエントリチャンクの計測された静的クロージャ）:

| 設定    | 読み込み                                             | スキップ                |
| --------- | ------------------------------------------------- | -------------------- |
| outfile   | sdk-impl クロージャのみ（975 KiB）                   | 両方のプロトコルチェーン |
| OTLP http | + HTTP チェーンクロージャ（共有層込み 1.2 MiB） | gRPC クラスタ         |
| OTLP grpc | + gRPC チェーンクロージャ（共有層込み 1.9 MiB） | HTTP エクスポーター       |

## ガード

`scripts/check-serve-fast-path-bundle.js` に、`sdk-impl` チャンクをルートとするチェックが追加されます: その静的インポートクロージャは `FORBIDDEN_OTLP_PROTOCOL_PACKAGES` のメンバーに到達してはなりません — gRPC クラスタ（`@grpc/grpc-js`、`@grpc/proto-loader`、`protobufjs`、`exporter-*-otlp-grpc`）に加え、`@opentelemetry/otlp-transformer`。これは両方のプロトコルチェーンが引き込む共有シリアライゼーション層に位置し、HTTP モジュールの静的な再インポートも捕捉します。これにより、フェーズ 1 のブラックリストがファサード分割をロックするのと同じ方法で、プロトコル分割がロックされます。

## テスト

- `sdk.test.ts` は `vi.mock` セットアップをそのまま保持します: vitest のインターセプトは、同じエクスポーターパッケージに対するプロトコルモジュールのインポートに適用されるため、既存のコンストラクタ引数のアサーションが引き継がれます。
- 受け入れは #4748 の規律に従います: 2C4G ホストで 30 回のペアシリアルコールドスタート、テレメトリーオン（outfile）、コントロール = フェーズ 1 ビルド、候補 = この変更、channel.initialize と process→最初のセッションの P50/P95 を報告。

## 却下された代替案

- **エクスポーターごと（シグナルごと）のモジュール**: 測定可能な実益なくモジュールが 3 つ増えるだけ — 1 つのプロトコルの 3 つのシグナルは常に一緒に設定されます。
- **URL 検証の HTTP モジュールへの移動**: 無効な URL に対する `diag` 警告がモジュール読み込みの後ろに遅延し、有効な URL なしのパスが「インポートなし」から「インポートして何もしない」に変わってしまいます。
