# Telemetry: カスタムリソース属性 + メトリクスカーディナリティ制御

> 配套 issue: [#4365](https://github.com/QwenLM/qwen-code/issues/4365)
> 父 issue: [#3731](https://github.com/QwenLM/qwen-code/issues/3731)
> 基于 2026-05-21 对 qwen-code main 分支的代码复核

## 1. 背景

Qwen Code はすでに OpenTelemetry SDK を統合していますが、Resource の構築方法により、以下の 2 つの一般的な本番シナリオで機能しません：

1. **カスタムディメンションを付加できない**：運用側はすべての telemetry データに `team` / `env` / `cost_center` / `user_id` タグを付けたいが、現状ではそのための仕組みが一切ない。標準の `OTEL_RESOURCE_ATTRIBUTES` 環境変数を設定しても**まったく効かない**。
2. **メトリクスのカーディナリティが制御不能**：`session.id` が Resource レイヤーに注入されているため、自動的に全メトリクスデータポイントに付着する。CLI セッションごとに新しい値が生成され、メトリクスバックエンド（Prometheus / 阿里云 ARMS Metric / VictoriaMetrics）が無制限の time-series で溢れてしまう。

この 2 つの問題は密接に関連しています。前者を解決すると、ユーザーが**より簡単に**高カーディナリティのフィールドをデータに追加できるようになるため、後者の対策も合わせて提供する必要があります。

## 2. 現状

### 2.1 Resource の構築

`packages/core/src/telemetry/sdk.ts:156-161`：

```ts
const resource = resourceFromAttributes({
  [SemanticResourceAttributes.SERVICE_NAME]: SERVICE_NAME,
  [SemanticResourceAttributes.SERVICE_VERSION]:
    config.getCliVersion() || 'unknown',
  'session.id': config.getSessionId(),
});
```

`sdk.ts:274-278`：

```ts
sdk = new NodeSDK({
  resource,
  // Disable async host/process/env resource detectors: they leave attributes
  // pending and trigger an OTel diag.error on any resource attribute read
  // before the detectors settle (e.g. during HttpInstrumentation span creation).
  autoDetectResources: false,
  ...
});
```

`autoDetectResources: false` は標準 OTel の `envDetector` を無効にしています。これは通常 `OTEL_RESOURCE_ATTRIBUTES` と `OTEL_SERVICE_NAME` を読み取るレイヤーです。無効化には理由がありますが（detector が非同期で、settle 前に `diag.error` が発生する）、副作用としてこれら 2 つの標準環境変数が Qwen Code では**まったく機能しない**状態になっています。

### 2.2 `session.id` は実際には 3 箇所に注入されている

| 位置                        | 行番号                   | 影響範囲                                |
| --------------------------- | ------------------------ | --------------------------------------- |
| Resource                    | `sdk.ts:160`             | 全 signal（spans / logs / metrics）     |
| Per-span                    | `session-tracing.ts:169` | spans                                   |
| Per-log                     | `loggers.ts:128`         | logs                                    |
| **`getCommonAttributes()`** | `metrics.ts:57`          | **全メトリクスレコードに明示的に追加**  |

つまり、**`session.id` を Resource から削除するだけでは不十分**です。`metrics.ts:57` の `baseMetricDefinition.getCommonAttributes()` は 30 以上のメトリクス呼び出し箇所で `...spread` されており、`session.id` が再び追加されます。

```ts
// metrics.ts:55-59
const baseMetricDefinition = {
  getCommonAttributes: (config: Config): Attributes => ({
    'session.id': config.getSessionId(),
  }),
};
```

良い点：30 以上のメトリクス呼び出し箇所がすべてこの 1 つの関数を経由しているため、自然なチョークポイントになっています。

### 2.3 config resolver のパターン

`packages/core/src/telemetry/config.ts:resolveTelemetrySettings()` は統一された優先度チェーンを使用しています：

```
argv (最高)  >  QWEN_* env  >  OTEL_* env  >  settings.json (最低)
```

新規追加項目もこのパターンに従います。

### 2.4 settings schema の現状

`packages/cli/src/config/settingsSchema.ts:998-1018` は `telemetry` の JSON schema を定義しています：

```ts
telemetry: {
  type: 'object',
  // ...
  jsonSchemaOverride: {
    type: 'object',
    properties: {
      includeSensitiveSpanAttributes: { ... },
    },
    additionalProperties: true,  // ← 現状は他の telemetry.* キーをバリデーションしない
  },
}
```

`additionalProperties: true` は、現状の schema が `otlpEndpoint` / `otlpProtocol` / `resourceAttributes` などの他のフィールドをすべて検証なしで受け入れることを意味します。`resourceAttributes` / `metrics` フィールドを追加する際は、IDE の自動補完と settings UI レンダリングのために、ここにも schema を補完すべきです。

### 2.5 本設計の対象外となるコードパス

`packages/core/src/telemetry/qwen-logger/qwen-logger.ts` は Qwen Code の**ファーストパーティデータ送信チャネル**（阿里 RUM 内部プロトコル `RumResourceEvent` ベース）で、OTel SDK とは完全に独立しています。独自のエンドポイント、プロキシ、データモデルを持ち、**本設計の影響を受けません**。詳細はセクション 3 を参照してください。

### 2.6 サポート済み / 未サポートの `OTEL_*` 環境変数

| 環境変数                                            | 現状                              |
| --------------------------------------------------- | --------------------------------- |
| `OTEL_EXPORTER_OTLP_ENDPOINT`                       | ✅ サポート済み（`config.ts:79`） |
| `OTEL_EXPORTER_OTLP_{TRACES,LOGS,METRICS}_ENDPOINT` | ✅ サポート済み                   |
| `OTEL_EXPORTER_OTLP_HEADERS`                        | ✅ 下位 exporter が直接読み取り   |
| `OTEL_TRACES_SAMPLER`                               | ✅ サポート済み（`tracer.ts:247`）|
| **`OTEL_RESOURCE_ATTRIBUTES`**                      | ❌ 未サポート                     |
| **`OTEL_SERVICE_NAME`**                             | ❌ 未サポート                     |
| **`OTEL_METRICS_INCLUDE_*`**                        | ❌ 未サポート（claude-code 方式） |

## 3. 目標 / 非目標

### 3.1 目標

- 運用担当者が標準 `OTEL_RESOURCE_ATTRIBUTES` と自社の `settings.json` を通じて、OTLP でエクスポートする全 span / log / metric にカスタムリソース属性を付加できるようにする
- `OTEL_SERVICE_NAME` を OTel 仕様どおりに動作させる（`OTEL_RESOURCE_ATTRIBUTES` 内の `service.name` との優先度関係を含む）
- デフォルトでメトリクスに `session.id` を**付加しない**（バックエンドのカーディナリティを保護する）
- メトリクスレベルのセッション相関が必要なユーザーが再び有効にできる明示的なトグルを提供する
- spans と logs の `session.id` は保持する（トレース相関に必須）
- `autoDetectResources: false` を維持し、修正済みの `diag.error` バグを再発させない
- 新しいフィールドが settings UI と IDE に表示されるよう `settingsSchema.ts` も合わせて更新する

### 3.2 非目標

- **`qwen-logger` ファーストパーティ送信**：完全に独立した RUM チャネルであり、本設計の対象外。送信フィールド（デバイス ID、ユーザーエージェントなど）は RUM プロトコルで決定されており、ユーザーのリソース属性に干渉されるべきではない。将来的に `qwen-logger` にカスタムディメンションを追加する場合は、別途独立した設計で対応する。
- **Per-span 動的属性フック**：ユーザーがコード / フックで各 span の属性を計算できるようにすること。claude-code もこの部分を解決しておらず、複雑さが高い割に効果が低い。
- **`service.version` のカーディナリティ制御**：バージョンの変化頻度は限られており（月単位）、time series の増加は管理可能。必要な場合は v2 で OTel View API を導入する。
- **Agent SDK 形態の per-query リソース属性**：Qwen Code には現在 SDK 呼び出しシナリオがない。
- **OTLP リクエストヘッダー（auth headers）の設定**：別の issue ライン（#3731 P1）であり、本設計とは独立している。
- **CLI フラグ形式のリソース属性**：環境変数と settings.json でテンポラリ・ベースラインの両シナリオをカバーできるため、CLI フラグはコマンドラインを冗長にする割に明確な利点がない。

## 4. 設計

### 4.1 全体的なレイヤー構成

```
┌─ Resource（sdk.ts:156）────────────────────────────────────────┐
│   service.name        ← OTEL_SERVICE_NAME                      │
│                          > OTEL_RESOURCE_ATTRIBUTES.service.name│
│                          > 'qwen-code'                         │
│   service.version     ← config.getCliVersion()  [reserved]     │
│   ...user attrs       ← OTEL_RESOURCE_ATTRIBUTES               │
│                          + settings.resourceAttributes         │
│   ✗ session.id 移走                                            │
└────────────────────────────────────────────────────────────────┘
       │
       ├──→ Spans     ＋ session.id（session-tracing.ts:169，保留）
       ├──→ Logs      ＋ session.id（loggers.ts:128，保留）
       └──→ Metrics   ＋ getCommonAttributes() — デフォルト {}
                          toggle ON: { session.id }
```

### 4.2 優先度 / マージ順序

#### 一般属性

低 → 高：

1. `OTEL_RESOURCE_ATTRIBUTES`（標準 OTel 環境変数）
2. `settings.telemetry.resourceAttributes`
3. 内部予約キー（上記と同名のものを上書き）

**理由**：環境変数は ops-time の一時的な上書き（CI / 単一マシンデバッグ）、settings.json はフリートに展開されたベースライン、内部キーはプロダクト契約です。ベースラインは一時変数より優先され、内部キーはすべてに優先されるべきです。

#### `service.name` の特別処理

`service.name` は [OTel 仕様](https://opentelemetry.io/docs/specs/otel/configuration/sdk-environment-variables/)に従う必要があります：

> **`OTEL_SERVICE_NAME` takes precedence over `service.name` defined with the `OTEL_RESOURCE_ATTRIBUTES` variable.**

そのため `service.name` には個別に優先度チェーン（高 → 低）を適用します：

1. `OTEL_SERVICE_NAME`（最高。標準 OTel 仕様で規定）
2. `settings.resourceAttributes.service.name`（settings が env より優先。本設計の一般ルールを踏襲）
3. `OTEL_RESOURCE_ATTRIBUTES.service.name`
4. 内部デフォルト `'qwen-code'`

`service.name` は settings による上書きを許可します。これはサービスのアイデンティティであり、企業のフリート環境で統一された settings.json を使って `service.name` を設定することは一般的かつ合理的です。禁止すると GitOps 配布シナリオが阻害されます。`OTEL_SERVICE_NAME` は OTel 仕様で規定された「最高優先度」のチャネルとして、CI / 単一マシンデバッグ時に settings を一時的に上書きできます。

具体的なルール：

| ソース                                                          | `service.name` への書き込みが有効か                    |
| --------------------------------------------------------------- | ------------------------------------------------------ |
| `OTEL_SERVICE_NAME=foo`                                         | ✅ 最高優先度（他のすべてのソースを上書き）            |
| `settings.resourceAttributes={ "service.name": "foo" }`        | ✅ `OTEL_SERVICE_NAME` がない場合のみ有効              |
| `OTEL_RESOURCE_ATTRIBUTES=service.name=foo`                     | ✅ 上記 2 つがない場合のみ有効                         |

### 4.3 予約キーのポリシー

| キー              | ユーザーが上書き可能か                                                       | 理由                                                                                                       |
| ----------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `service.name`    | ✅ env var も settings も可能（§4.2 の優先度チェーンを参照）                 | サービスのアイデンティティ。ops による制御を許可すべき                                                     |
| `service.version` | ❌ どのソースからも破棄 + warn                                               | テレメトリの信頼性。ユーザーがバージョンを偽ることを許可しない                                            |
| `session.id`      | ❌ どのソースからも破棄 + warn（メトリクスではランタイム注入の toggle も別途） | runtime-only。ユーザーが Resource に書くとメトリクスカーディナリティ toggle を迂回できてしまう（Resource 属性は全 signal に自動付着） |
| `qwen.*` プレフィックス | ⚠️ 強制保留はしないが、docs ではプロダクト用に予約を推奨              | 将来の内部属性とユーザー属性の衝突を防ぐ                                                                   |

**予約キーは定数として一元管理**：

```ts
// telemetry/resource-attributes.ts (new file)
/** Keys that cannot be overridden from any source (env or settings). */
export const RESERVED_RESOURCE_ATTRIBUTE_KEYS = new Set<string>([
  'service.version',
  'session.id',
]);
```

`service.name` は RESERVED リストに**含まれません**。独自の優先度チェーン（§4.2）を持ち、「グローバルに上書き禁止」という意味合いではないためです。RESERVED は「どのソースから書いても警告して破棄」を意味し、env と settings の両方の入口に一律適用されます。

### 4.4 `OTEL_RESOURCE_ATTRIBUTES` の解析

OTel 組み込みの非同期 envDetector を回避し、同期実装します：

```ts
function parseOtelResourceAttributes(
  raw: string | undefined,
): Record<string, string> {
  if (!raw) return {};
  const out: Record<string, string> = {};
  for (const pair of raw.split(',')) {
    const trimmed = pair.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) {
      diag.warn(
        `Skipping malformed OTEL_RESOURCE_ATTRIBUTES entry: ${trimmed}`,
      );
      continue;
    }
    const key = trimmed.slice(0, idx).trim();
    const valueRaw = trimmed.slice(idx + 1).trim();
    if (!key) continue;
    let value: string;
    try {
      value = decodeURIComponent(valueRaw);
    } catch {
      diag.warn(
        `Invalid percent-encoding in OTEL_RESOURCE_ATTRIBUTES for key "${key}", using raw value`,
      );
      value = valueRaw;
    }
    out[key] = value; // duplicate keys: last wins (matches OTel reference impls)
  }
  return out;
}
```

フォーマットは OTel 仕様に厳密に従います：`key1=val1,key2=val2`、値はパーセントエンコード。

### 4.5 メトリクス属性フィルター

変更箇所は `metrics.ts:55-59` のみ：

```ts
const baseMetricDefinition = {
  getCommonAttributes: (config: Config): Attributes => {
    const out: Attributes = {};
    if (config.getTelemetryMetricsIncludeSessionId()) {
      out['session.id'] = config.getSessionId();
    }
    return out;
  },
};
```

呼び出し箇所（30 以上）は変更なし。空のオブジェクトを `...spread` することはフィールドを展開しないのと同等です。

### 4.6 エッジケースとバリデーション

| 入力                                                               | 動作                                                                         |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `OTEL_RESOURCE_ATTRIBUTES=""` (空文字列)                           | `{}` を返し、正常起動                                                        |
| `OTEL_RESOURCE_ATTRIBUTES="a"` (`=` なし)                          | そのエントリをスキップ + `diag.warn`、残りを解析継続                         |
| `OTEL_RESOURCE_ATTRIBUTES="=val"` (空 key)                         | そのエントリをスキップ、残りを解析継続                                       |
| `OTEL_RESOURCE_ATTRIBUTES="a=,b=2"` (空 value)                     | `a=''`, `b='2'`（OTel 仕様では空 value を許可）                              |
| `OTEL_RESOURCE_ATTRIBUTES="a=val%ZZbad"` (無効なパーセントエンコード) | 元の `val%ZZbad` を保持 + `diag.warn`                                    |
| `OTEL_RESOURCE_ATTRIBUTES="a=1,a=2"` (重複キー)                    | 後者が勝ち `a=2`（OTel SDK リファレンス実装と一致）                          |
| `OTEL_RESOURCE_ATTRIBUTES="a=1, b=2 "` (スペースあり)              | 自動 trim                                                                    |
| `OTEL_RESOURCE_ATTRIBUTES=service.version=x`                       | `service.version` を静かに破棄 + `diag.warn`、他のキーは保持                |
| `settings.resourceAttributes={ "service.name": "x" }`             | 受け入れ（settings では service.name の設定が可能。§4.2 参照）              |
| `settings.resourceAttributes={ "service.version": "x" }`          | 静かに破棄 + `diag.warn`                                                     |
| `settings.resourceAttributes={ "team": 123 }` (string 以外)        | TypeScript 型でブロック。ランタイム入力は settings JSON schema バリデーターが拒否 |
| Resource の総サイズ > OTel 制限 (4KB?)                             | 下位の OTel SDK が処理。このレイヤーでは検証しない                           |

**このレイヤーで属性キー命名の検証を行わない理由**（OTel 推奨の `[a-z][a-z0-9_.]*` パターンなど）：OTel SDK 自体がエクスポート時に検証するため、ここで重複検証すると遅くなり、SDK の動作と乖離するリスクがあります。フォーマットの解析のみを行い、セマンティクスの検証は行いません。

**RESERVED キーの強制保護は両方の入口に適用されます**：

```ts
// env からパースした attrs に適用
for (const k of RESERVED_RESOURCE_ATTRIBUTE_KEYS) {
  if (k in envAttrs) {
    diag.warn(`OTEL_RESOURCE_ATTRIBUTES cannot override "${k}"; ignoring`);
    delete envAttrs[k];
  }
}

// settings attrs に適用
for (const k of RESERVED_RESOURCE_ATTRIBUTE_KEYS) {
  if (k in settingsAttrs) {
    diag.warn(
      `settings.telemetry.resourceAttributes cannot override "${k}"; ignoring`,
    );
    delete settingsAttrs[k];
  }
}
```

### 4.7 ライフサイクルとマルチプロセス

- **SDK 初期化タイミング**：Resource は `initializeTelemetry()` 時に一度だけ構築され、**プロセス内では不変**です。これは OTel SDK の設計と一致しています。
- **Subagent のフォーク**：Qwen Code の subagent は同一プロセス内（`subagent-runtime.ts`）で Resource を共有します。将来クロスプロセスの subagent が導入された場合、子プロセスは **SDK を再 init** し、env var と settings を再読み込みします。env が正しく引き継がれれば、動作は一貫します。
- **ホットリロード**：settings 変更後は **Resource が再構築されません**。設定を反映させるには CLI の再起動が必要です。ドキュメントに明記すべきです。
- **`refreshSessionContext()`** (`sdk.ts:306`)：セッション ALS コンテキストのみをリフレッシュし、**Resource は再構築しません**。Resource に `session.id` がなくなった（本設計の核心変更の 1 つ）ためです。

## 5. Config schema の変更

### 5.1 `TelemetrySettings` インターフェース（`packages/core/src/config/config.ts:293`）

```ts
export interface TelemetrySettings {
  // ... existing fields
  /** Static resource attributes attached to every span/log/metric. */
  resourceAttributes?: Record<string, string>;
  /** Per-signal cardinality controls. */
  metrics?: {
    /** Include session.id on metric data points (default: false). */
    includeSessionId?: boolean;
  };
}
```

### 5.2 `Config` ゲッター（同ファイル）

```ts
class Config {
  getTelemetryResourceAttributes(): Record<string, string> {
    return this.telemetrySettings.resourceAttributes ?? {};
  }
  getTelemetryMetricsIncludeSessionId(): boolean {
    return this.telemetrySettings.metrics?.includeSessionId ?? false;
  }
}
```

### 5.3 `resolveTelemetrySettings()` への追加

```ts
const envResourceAttrs = parseOtelResourceAttributes(
  env['OTEL_RESOURCE_ATTRIBUTES'],
);
const settingsResourceAttrs = { ...(settings.resourceAttributes ?? {}) };

// Strip RESERVED keys from both sources (warn if user tried to set them).
for (const k of RESERVED_RESOURCE_ATTRIBUTE_KEYS) {
  if (k in envResourceAttrs) {
    diag.warn(`OTEL_RESOURCE_ATTRIBUTES cannot override "${k}"; ignoring`);
    delete envResourceAttrs[k];
  }
  if (k in settingsResourceAttrs) {
    diag.warn(
      `settings.telemetry.resourceAttributes cannot override "${k}"; ignoring`,
    );
    delete settingsResourceAttrs[k];
  }
}

// Merge: env < settings (settings wins on conflict).
const merged: Record<string, string> = {
  ...envResourceAttrs,
  ...settingsResourceAttrs,
};

// service.name precedence: OTEL_SERVICE_NAME (env-only escape) wins over
// everything else. settings already overwrote env in the spread above.
if (env['OTEL_SERVICE_NAME']) {
  merged['service.name'] = env['OTEL_SERVICE_NAME'];
}

const resourceAttributes = merged;

const metricsIncludeSessionId =
  parseBooleanEnvFlag(env['QWEN_TELEMETRY_METRICS_INCLUDE_SESSION_ID']) ??
  settings.metrics?.includeSessionId ??
  false;

return {
  // ... existing fields
  resourceAttributes,
  metrics: { includeSessionId: metricsIncludeSessionId },
};
```

### 5.4 `sdk.ts` の Resource 構築変更

```ts
const userAttrs = config.getTelemetryResourceAttributes();
// service.version is always built-in; service.name flows through userAttrs
// (it was already resolved with OTEL_SERVICE_NAME precedence in resolver).
const builtinServiceName = userAttrs['service.name'] ?? SERVICE_NAME;
const { 'service.name': _, 'service.version': __, ...nonReserved } = userAttrs;

const resource = resourceFromAttributes({
  ...nonReserved,
  [SemanticResourceAttributes.SERVICE_NAME]: builtinServiceName,
  [SemanticResourceAttributes.SERVICE_VERSION]:
    config.getCliVersion() || 'unknown',
  // session.id deliberately NOT placed on Resource — see design doc §4.1
});
```

### 5.5 `settingsSchema.ts` の変更

`packages/cli/src/config/settingsSchema.ts:998-1018` の `telemetry.jsonSchemaOverride.properties` に追加：

```ts
{
  // ... existing includeSensitiveSpanAttributes
  resourceAttributes: {
    type: 'object',
    additionalProperties: { type: 'string' },
    description:
      'Static resource attributes attached to all telemetry data. ' +
      'Keys must be strings; values must be strings. ' +
      'Reserved keys (service.name, service.version) are silently dropped.',
    default: {},
  },
  metrics: {
    type: 'object',
    additionalProperties: false,
    properties: {
      includeSessionId: {
        type: 'boolean',
        default: false,
        description:
          'Include session.id on every metric data point. ' +
          'WARNING: each CLI session creates a new value, causing unbounded ' +
          'metric time-series fan-out. Only enable for short-term debugging.',
      },
    },
  },
}
```

`additionalProperties: true` についても再評価が必要です。現状は permissive ですが、維持するか strict に変更するか検討してください。schema で宣言されていない他の `telemetry.*` フィールドへの破壊的変更を避けるため、permissive のままにすることを推奨しますが、ドキュメントには「未宣言フィールドは無視される」と明記してください。

## 6. ファイル変更一覧

| ファイル                                                           | 変更内容                                                                       |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `packages/core/src/telemetry/sdk.ts`                               | Resource 構築を変更（ユーザー属性のマージ、`session.id` の削除）               |
| `packages/core/src/telemetry/resource-attributes.ts` (新規ファイル) | `parseOtelResourceAttributes()` + `RESERVED_RESOURCE_ATTRIBUTE_KEYS` 定数      |
| `packages/core/src/telemetry/config.ts`                            | resolver に `resourceAttributes` + `metrics.includeSessionId` の解析とマージを追加 |
| `packages/core/src/telemetry/metrics.ts`                           | `getCommonAttributes()` にトグルゲートを追加                                   |
| `packages/core/src/config/config.ts`                               | `TelemetrySettings` スキーマ + 2 つのゲッター                                  |
| `packages/cli/src/config/settingsSchema.ts`                        | `jsonSchemaOverride` に `resourceAttributes` + `metrics` を追加                |
| `docs/developers/development/telemetry.md`                         | 「リソース属性」「カーディナリティ制御」の 2 節 + マイグレーション説明 + 例を追加 |
| `packages/core/src/telemetry/resource-attributes.test.ts` (新規)   | パーサーのユニットテスト（§4.6 の全ケースをカバー）                            |
| `packages/core/src/telemetry/sdk.test.ts`                          | マージ優先度 / 予約キー / `OTEL_SERVICE_NAME`                                  |
| `packages/core/src/telemetry/metrics.test.ts`                      | toggle off/on 時の `session.id` の有無                                         |
| `packages/core/src/telemetry/config.test.ts`                       | env / settings のマージ                                                        |
| `CHANGELOG.md` または release notes                                | PR 2 の破壊的変更の説明                                                        |

## 7. PR 分割

レビューの容易さと影響範囲を考慮し、3 つの PR に分割します：

### PR 1 — カスタムリソース属性（additive、破壊的変更なし）

- 新規ファイル `resource-attributes.ts`：`parseOtelResourceAttributes()` + `RESERVED_RESOURCE_ATTRIBUTE_KEYS`
- `TelemetrySettings.resourceAttributes` フィールド + resolver マージロジック
- `OTEL_SERVICE_NAME` / `OTEL_RESOURCE_ATTRIBUTES` の統合（§4.2 の優先度に従う）
- Resource へのマージ（`sdk.ts`）
- `settingsSchema.ts` に `resourceAttributes` の JSON schema を追加
- Resource 上の `session.id` の位置は**変更しない**
- docs に「リソース属性」節を追加

**リスク**：低。完全に additive であり、既存の動作は変更されません。ユーザーが環境変数や settings を明示的に設定しない限り、エクスポートされるデータに変化はありません。

### PR 2 — カーディナリティ制御（セマンティック上の破壊的変更）

- Resource から `session.id` を削除（`sdk.ts:160` の 1 行）
- `metrics.includeSessionId` トグルを追加（settings + env）+ `getCommonAttributes()` ゲート
- `settingsSchema.ts` に `metrics` の JSON schema を追加
- CHANGELOG / マイグレーション説明
- メトリクス属性セットをロックするスナップショットテスト（回帰防止）
- docs に「カーディナリティ制御」節 + マイグレーションガイドを追加

**リスク**：中程度。メトリクスの `session.id` に依存する Prometheus クエリ / Grafana ダッシュボード / アラートルールが機能しなくなります。明示的なリリースノートと 1〜2 バージョンのマイグレーション期間が必要です。

**Opt-in 移行オプション**（候補。今回は**採用しない**ことを推奨）：

> PR 2 は最初「opt-out」形式で実施することも可能です。デフォルトで `session.id` を引き続きメトリクスに注入しながら、"this default will flip in v0.X" という warn ログを追加する。1 リリース後にデフォルトを反転する。

採用しない理由：（1）現在の Qwen Code ユーザーベースは小さく、破壊的影響は限定的；（2）これはカーディナリティのバグであり、早めに安全なデフォルトに変更すべき；（3）2 段階リリースはドキュメント負担が増える。親 issue のオーナーが保守的なアプローチを望む場合は採用を検討できます。

### PR 3 — docs の改善 + サンプル（cleanup）

- `docs/developers/development/telemetry.md` にサンプルを追加（§10 参照）
- 阿里云 ARMS / Prometheus / Grafana 接続例
- 典型的なユースケースの settings.json スニペットを追加

## 8. テスト計画

### 8.1 `parseOtelResourceAttributes()` のユニットテスト

§4.6 の表の全行をパラメータ化でカバー（vitest の `it.each` を推奨）：

```ts
it.each([
  ['', {}],
  ['a=1', { a: '1' }],
  ['a=1,b=2', { a: '1', b: '2' }],
  ['a=hello%20world', { a: 'hello world' }],
  ['a=val%ZZbad', { a: 'val%ZZbad' }], // invalid percent
  ['malformed', {}],
  ['=val', {}],
  ['a=', { a: '' }],
  ['a=1,a=2', { a: '2' }],
  [' a = 1 , b = 2 ', { a: '1', b: '2' }],
])('parses %j → %j', (input, expected) => {
  expect(parseOtelResourceAttributes(input)).toEqual(expected);
});
```

### 8.2 resolver マージテスト

| シナリオ                                                                        | 期待される `service.name`                                       | 期待されるユーザー属性               |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------ |
| 全て空                                                                          | `'qwen-code'`                                                   | なし                                 |
| env のみ `OTEL_SERVICE_NAME=A`                                                  | `'A'`                                                           | —                                    |
| env のみ `OTEL_RESOURCE_ATTRIBUTES=service.name=B`                              | `'B'`                                                           | —                                    |
| `OTEL_SERVICE_NAME=A` + `OTEL_RESOURCE_ATTRIBUTES=service.name=B`               | `'A'`（`OTEL_SERVICE_NAME` が優先）                             | —                                    |
| `OTEL_SERVICE_NAME=A` + `settings={service.name:C}`                             | `'A'`（`OTEL_SERVICE_NAME` が優先）                             | —                                    |
| `OTEL_RESOURCE_ATTRIBUTES=service.name=B` + `settings={service.name:C}`         | `'C'`（settings が env より優先。`OTEL_SERVICE_NAME` なし）     | —                                    |
| `OTEL_RESOURCE_ATTRIBUTES=team=x` + `settings={team:y}`                         | `'qwen-code'`                                                   | `team='y'`（settings が優先）        |
| `OTEL_RESOURCE_ATTRIBUTES=service.version=fake`                                 | `'qwen-code'` + warn                                            | service.version は実際の cli version |
| `settings={service.version:fake}`                                               | `'qwen-code'` + warn                                            | service.version は実際の cli version |

### 8.3 Resource コンテンツのスナップショットテスト

`InMemorySpanExporter` で span を 1 つ取得し、以下をアサート：

```ts
expect(span.resource.attributes['service.name']).toBe('qwen-code');
expect(span.resource.attributes['service.version']).toBe(EXPECTED_VERSION);
expect(span.resource.attributes['session.id']).toBeUndefined(); // 重要
expect(span.resource.attributes['team']).toBe('platform'); // ユーザーが追加したもの
```

### 8.4 メトリクス属性トグルテスト

```ts
it('does not emit session.id on metrics by default', async () => {
  // emit one tool call counter
  recordToolCallMetrics(...);
  const data = await metricReader.collect();
  const dp = data.resourceMetrics.scopeMetrics[0].metrics[0].dataPoints[0];
  expect(dp.attributes['session.id']).toBeUndefined();
});

it('emits session.id when toggle is true', async () => {
  config.telemetrySettings.metrics = { includeSessionId: true };
  recordToolCallMetrics(...);
  const data = await metricReader.collect();
  const dp = data.resourceMetrics.scopeMetrics[0].metrics[0].dataPoints[0];
  expect(dp.attributes['session.id']).toBe(KNOWN_SESSION_ID);
});
```

### 8.5 spans / logs の動作が維持されることのテスト

- spans には `session.id` が引き続き存在する（メトリクストグルの影響を受けない）
- logs には `session.id` が引き続き存在する（メトリクストグルの影響を受けない）

### 8.6 回帰保護

- `autoDetectResources: false` が維持されること（config のアサーション）
- 起動時に新たな `diag.error` が発生しないこと（OTel diag ログをキャプチャしてアサート）
- 既存の全 telemetry テストが通過すること（CI）

### 8.7 diag warn テスト

以下の入力がそれぞれ `diag.warn` を 1 回トリガーすることを確認：

- `settings.resourceAttributes = { 'service.version': 'x' }`（予約キー）
- `OTEL_RESOURCE_ATTRIBUTES=service.version=x`（予約キー。env でも warn が必要）
- `OTEL_RESOURCE_ATTRIBUTES=malformed`（`=` なし）
- `OTEL_RESOURCE_ATTRIBUTES=a=val%ZZ`（無効なパーセントエンコード）

以下の入力が warn を**トリガーしない**ことを確認（正常パス）：

- `settings.resourceAttributes = { 'service.name': 'x' }`（settings での service.name 設定は許可）
- `OTEL_SERVICE_NAME=foo` + `settings.resourceAttributes = { 'service.name': 'bar' }`（`OTEL_SERVICE_NAME` が優先されれば十分。warn は不要）

## 9. マイグレーション / 破壊的変更

### 9.1 破壊的変更（PR 2）

**メトリクスの `session.id` がデフォルトで消える**。これは以下に影響します：

- Prometheus クエリ内の `by (session_id)` / `group_left(session_id)` による集計
- Grafana ダッシュボードのセッション別スライスグラフ
- `session.id` でアラートグループを分けているルール

注：spans と logs の `session.id` は**影響を受けません**。

### 9.2 マイグレーションパス

ドキュメントで 2 つのオプションを提示：

**オプション A**：旧動作に戻す（短期デバッグ推奨）

```bash
export QWEN_TELEMETRY_METRICS_INCLUDE_SESSION_ID=true
```

または `settings.json`：

```json
{
  "telemetry": {
    "metrics": { "includeSessionId": true }
  }
}
```

⚠️ **警告**：長期間有効にすると、メトリクス time-series 数 = 過去のセッション数になり、バックエンドが溢れます。短期デバッグのみに使用してください。

**オプション B**：spans / logs でセッション別スライスに切り替える（推奨）

- spans / logs には引き続き `session.id` があり、トレースバックエンド（Jaeger / 阿里云 ARMS Tracing など）/ ログバックエンド（Loki / SLS など）でセッション別にスライスできます
- これらのデータはもともと per-event で保存されているため、カーディナリティが爆発しません
- セッションレベルのドリルダウン分析に適しています

### 9.3 リリースノートのテンプレート

```
**Breaking change (metric attribute):**

The `session.id` attribute is no longer attached to metric data
points by default. This protects metric backends from unbounded
time-series fan-out.

- Spans and logs are unaffected — `session.id` is still present.
- To restore the previous behavior (short-term debugging only), set
  `QWEN_TELEMETRY_METRICS_INCLUDE_SESSION_ID=true` or in settings.json:
  `telemetry.metrics.includeSessionId: true`.
- For long-term session correlation, query against trace / log
  backends instead of metric backends.

See docs/developers/development/telemetry.md "Migration" for details.
```

## 10. 設定例（ドキュメント用）

### 10.1 team / env 別に全 telemetry をスライスする

```bash
export OTEL_RESOURCE_ATTRIBUTES="team=platform,env=prod,cost_center=eng-123"
```

効果：全 span / log / metric に `team=platform` `env=prod` `cost_center=eng-123` が付与されます。

### 10.2 `OTEL_SERVICE_NAME` を使って共有コレクターでルーティングする

```bash
export OTEL_SERVICE_NAME=qwen-code-ci
```

効果：`service.name=qwen-code-ci` になり、マルチテナント OTel コレクターが `service.name` で異なるバックエンドにルーティングできます。

### 10.3 フリートベースライン + 単一マシン上書き

企業フリートの `~/.qwen/settings.json`（GitOps 配布）：

```json
{
  "telemetry": {
    "resourceAttributes": {
      "deployment.environment": "production",
      "service.namespace": "engineering-tooling"
    }
  }
}
```

単一マシンでの ops による一時上書き（settings は変更しない）：

```bash
export OTEL_RESOURCE_ATTRIBUTES="debug_run=true"
# settings の deployment.environment / service.namespace は引き続き有効
# この実行では追加で debug_run=true が付与される
```

### 10.4 短期デバッグ用にメトリクスの session.id を有効にする

```bash
# 単発のデバッグ実行
QWEN_TELEMETRY_METRICS_INCLUDE_SESSION_ID=true qwen "投資分析"
```

完了後はすぐに無効にし、settings に永続化しないこと。

### 10.5 阿里云 ARMS Metric 接続（推奨設定）

```json
{
  "telemetry": {
    "enabled": true,
    "otlpEndpoint": "http://<arms-endpoint>/api/v1/...",
    "otlpProtocol": "http",
    "resourceAttributes": {
      "team": "platform",
      "deployment.environment": "production"
    },
    "metrics": {
      "includeSessionId": false
    }
  }
}
```

## 11. claude-code 実装との比較

| 次元                       | claude-code                                      | Qwen Code 本設計                                 | 決定根拠                                           |
| -------------------------- | ------------------------------------------------ | ------------------------------------------------ | -------------------------------------------------- |
| 標準 OTel 環境変数         | `OTEL_RESOURCE_ATTRIBUTES` / `OTEL_SERVICE_NAME` | ✅ 一致                                          | 標準契約                                           |
| `OTEL_SERVICE_NAME` 優先度 | OTel 仕様に準拠                                  | ✅ 準拠                                          | 仕様に明記                                         |
| カーディナリティトグル命名 | `OTEL_METRICS_INCLUDE_*`                         | `QWEN_TELEMETRY_METRICS_INCLUDE_*`               | 標準 OTel 名前空間を汚染しない                     |
| トグルのスコープ           | メトリクスのみ                                   | ✅ メトリクスのみ                                | spans / logs は per-event でカーディナリティ問題なし |
| デフォルト値               | 高カーディナリティ属性はデフォルト false         | ✅ デフォルト false                              | セキュリティ優先                                   |
| Per-attribute の粒度       | 属性ごとにトグル                                 | ✅ 一致                                          | 柔軟で実際の診断ニーズに合致                       |
| settings.json 相当物       | ❌ なし                                          | ✅ `telemetry.resourceAttributes` + `metrics` あり | 企業フリートのベース設定に対応                    |
| Per-span 動的フック        | ❌ なし                                          | ❌ なし                                          | 複雑さが高く、claude-code も未解決。今回は対象外   |
| マルチテナント `account_uuid` | あり                                          | ❌ なし                                          | Qwen Code のメトリクスにこの属性がない             |
| Agent SDK の `options.env` | あり                                             | ❌ なし                                          | Qwen Code には同等のパターンがない                 |
| 予約キーポリシー           | 内部 ID の上書きを禁止                           | ✅ 一致                                          | テレメトリの信頼性                                 |
| ファーストパーティ送信チャネル | claude-code も独立したファーストパーティチャネルあり（OTel と分離） | ✅ qwen-logger も同様に分離 | ファーストパーティとサードパーティの職責分離 |

**特に参考にすべき 2 点**：

1. **命名規約**：`*_INCLUDE_*` は意味が一目瞭然。否定形の命名（`*_EXCLUDE_*` / `*_DROP_*`）より明確
2. **スコープの節制**：メトリクスのみゲート。span/log はゲートしない。claude-code がこの境界を踏んだ経験から学んでいる

**Qwen Code がより優れている点**：

- settings.json サポート：claude-code は env var のみに依存しており、企業フリートのシナリオに不向き
- 明確な予約キーポリシー（`service.version` は上書き不可）：テレメトリが汚染される可能性を低減
- ファーストパーティ送信の分離：qwen-logger は独立したチャネルを使用し、ユーザーの OTLP 設定と完全に分離されている

## 12. 将来の作業（v2 以降の候補）

- **`service.version` のカーディナリティ制御**：OTel View API を使ってメトリクスレイヤーで属性を削除する
- **追加のカーディナリティトグル**：将来メトリクスに `user.account_uuid` / `model` などが導入された場合、必要に応じてトグルを追加する
- **Per-span 動的属性フック**：Qwen Code 独自のフックシステムを活用し、`OnSpanStart(span, context) => attrs` コールバックを追加する。別途設計が必要。
- **リソース属性スキーマの検証**：キーの名前空間を制限する（例：内部属性として `service.*` プレフィックス以外の上書きを禁止する）。現状は予約キーリストのハードコーディングで十分。
- **Resource のホットリロード**：プロセス内で settings.json が変更された場合（qwen-serve デーモンシナリオを想定）、現状は Resource が再構築されない。デーモンシナリオが成熟したら、リロードパスを追加する。
- **クロスプロセス subagent のコンテキスト伝播**：subagent がクロスプロセスの場合、親のトレースコンテキスト（resource を含む）を OTel コンテキスト伝播の標準ヘッダーで渡す。別途設計が必要。
