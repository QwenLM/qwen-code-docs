# テレメトリー: カスタムリソース属性 + メトリクスカーディナリティ制御

> 関連 Issue: [#4365](https://github.com/QwenLM/qwen-code/issues/4365)
> 親 Issue: [#3731](https://github.com/QwenLM/qwen-code/issues/3731)
> 2026-05-21 時点の qwen-code main ブランチのコードレビューに基づく

## 1. 背景

qwen-code は OpenTelemetry SDK にすでに対応しているが、Resource の構成方法により、以下の2つの一般的な本番環境シナリオで使用できない。

1. **カスタムディメンションを追加できない**: 運用側がすべてのテレメトリーデータに `team` / `env` / `cost_center` / `user_id` タグを付けたい場合、現在それを行うメカニズムは存在しない。標準の `OTEL_RESOURCE_ATTRIBUTES` 環境変数を設定しても**全く効果がない**。
2. **メトリクスカーディナリティの制御不能**: `session.id` が Resource 層に注入され、すべてのメトリクスデータポイントに自動的に付与される。CLI セッションごとに新しい値が生成されるため、メトリクスバックエンド（Prometheus / 阿里雲 ARMS Metric / VictoriaMetrics）が無制限のタイムシリーズで溢れてしまう。

これら2つの問題は相互に関連している。前者を解決すると、ユーザーが**より簡単に**高カーディナリティのフィールドをデータに追加できるようになるため、後者の対策も併せて提供する必要がある。

## 2. 現状

### 2.1 Resource の構成

`packages/core/src/telemetry/sdk.ts:156-161`:

```ts
const resource = resourceFromAttributes({
  [SemanticResourceAttributes.SERVICE_NAME]: SERVICE_NAME,
  [SemanticResourceAttributes.SERVICE_VERSION]:
    config.getCliVersion() || 'unknown',
  'session.id': config.getSessionId(),
});
```

`sdk.ts:274-278`:

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

`autoDetectResources: false` により、標準 OTel の `envDetector`（通常 `OTEL_RESOURCE_ATTRIBUTES` と `OTEL_SERVICE_NAME` を読み取る層）が無効になっている。これには理由がある（detector が非同期であり、settle 前に `diag.error` をトリガーするため）。しかし、副作用として、これら2つの標準環境変数は qwen-code では**完全に無効**になっている。

### 2.2 `session.id` は実際には三重に注入されている

| 位置                        | 行番号                   | 影響                                  |
| --------------------------- | ------------------------ | ------------------------------------- |
| Resource                    | `sdk.ts:160`             | すべての signal（spans / logs / metrics） |
| Per-span                    | `session-tracing.ts:169` | spans                                 |
| Per-log                     | `loggers.ts:128`         | logs                                  |
| **`getCommonAttributes()`** | `metrics.ts:57`          | **各メトリクスレコードに明示的に重複付与** |

つまり、**Resource から `session.id` を削除するだけでは不十分**である。`metrics.ts:57` の `baseMetricDefinition.getCommonAttributes()` は 30 以上のメトリクス呼び出しポイントで `...spread` され、再び `session.id` が埋め込まれる。

```ts
// metrics.ts:55-59
const baseMetricDefinition = {
  getCommonAttributes: (config: Config): Attributes => ({
    'session.id': config.getSessionId(),
  }),
};
```

良い点: すべてのメトリクス呼び出しポイント（30 以上）はこの1つの関数を経由するため、これは自然なチョークポイントである。

### 2.3 config resolver パターン

`packages/core/src/telemetry/config.ts:resolveTelemetrySettings()` は統一された優先順位チェーンを使用する:

```
argv (最高)  >  QWEN_* env  >  OTEL_* env  >  settings.json (最低)
```

新しい項目もこのパターンに従う。

### 2.4 settings schema の現状

`packages/cli/src/config/settingsSchema.ts:998-1018` は `telemetry` の JSON schema を定義している:

```ts
telemetry: {
  type: 'object',
  // ...
  jsonSchemaOverride: {
    type: 'object',
    properties: {
      includeSensitiveSpanAttributes: { ... },
    },
    additionalProperties: true,  // ← 現在、他の telemetry.* キーは検証されない
  },
}
```

`additionalProperties: true` は、現在 schema が `otlpEndpoint` / `otlpProtocol` / `resourceAttributes` などの他のフィールドをすべて許可し、検証しないことを意味する。新しい `resourceAttributes` / `metrics` フィールドを追加する際には、ここに schema を同時に追加し、IDE の自動補完と settings UI のレンダリングを容易にする必要がある。

### 2.5 本設計範囲外のコードパス

`packages/core/src/telemetry/qwen-logger/qwen-logger.ts` は qwen-code の**ファーストパーティ使用状況報告チャネル**（阿里 RUM 内部プロトコル `RumResourceEvent` に基づく）であり、OTel SDK とは完全に独立している。独自のエンドポイント、プロキシ、データモデルを持ち、**本設計の影響を受けない**。詳細は第3節を参照。

### 2.6 サポート済み / 未サポートの `OTEL_*` 環境変数

| 環境変数                                            | 現状                              |
| --------------------------------------------------- | --------------------------------- |
| `OTEL_EXPORTER_OTLP_ENDPOINT`                       | ✅ サポート済み（`config.ts:79`）         |
| `OTEL_EXPORTER_OTLP_{TRACES,LOGS,METRICS}_ENDPOINT` | ✅ サポート済み                           |
| `OTEL_EXPORTER_OTLP_HEADERS`                        | ✅ 基底 exporter が直接読み取り         |
| `OTEL_TRACES_SAMPLER`                               | ✅ サポート済み（`tracer.ts:247`）        |
| **`OTEL_RESOURCE_ATTRIBUTES`**                      | ❌ 全くサポートされていない                     |
| **`OTEL_SERVICE_NAME`**                             | ❌ 全くサポートされていない                     |
| **`OTEL_METRICS_INCLUDE_*`**                        | ❌ 全くサポートされていない（claude-code スタイル） |

## 3. 目標 / 非目標

### 3.1 目標

- 運用担当者が標準の `OTEL_RESOURCE_ATTRIBUTES` と自社の `settings.json` を通じて、OTLP でエクスポートされるすべての span / log / metric にカスタムリソース属性を追加できるようにする
- `OTEL_SERVICE_NAME` が OTel 仕様通りに動作するようにする（`OTEL_RESOURCE_ATTRIBUTES` 内の `service.name` との優先順位を含む）
- デフォルトでは、metric には `session.id` を**含めない**（バックエンドの基数を保護）
- メトリクスレベルのセッション相関を必要とするユーザーが再度有効にできる明示的なスイッチを提供する
- spans と logs 上の `session.id` は保持する（トレース相関のために必須）
- `autoDetectResources: false` は維持し、`diag.error` の修正済みバグを退化させない
- `settingsSchema.ts` を更新し、新しいフィールドが settings UI と IDE から見えるようにする

### 3.2 非目標

- **`qwen-logger` ファーストパーティ報告**: 完全に独立した RUM チャネルであり、本設計範囲外。その報告フィールド（デバイス ID、ユーザーエージェントなど）は RUM プロトコルによって決定され、ユーザーのリソース属性に干渉されるべきではない。将来 `qwen-logger` にカスタムディメンションを追加する場合は、別の独立した設計となる。
- **Per-span 動的属性フック**: ユーザーがコード / フックを作成して各 span の属性を計算できるようにする。claude-code もこの部分を解決しておらず、複雑さが高く、利益が低い。
- **`service.version` カーディナリティ制御**: バージョン変更の頻度は限られている（月単位）、タイムシリーズの増加は制御可能。必要になったら v2 で、OTel View API を導入する。
- **Agent SDK 形態の per-query resource attrs**: qwen-code には現在 SDK 呼び出しシナリオがない。
- **OTLP リクエストヘッダー（認証ヘッダー）設定**: 別の Issue ライン（#3731 P1）であり、本設計とは独立している。
- **CLI フラグ形式の resource attribute**: env var + settings.json で一時的なシナリオとベースラインシナリオの両方をカバーできる。CLI フラグはコマンドラインを冗長にし、明確な利点はない。

## 4. 設計

### 4.1 全体の階層

```
┌─ Resource（sdk.ts:156）────────────────────────────────────────┐
│   service.name        ← OTEL_SERVICE_NAME                      │
│                          > OTEL_RESOURCE_ATTRIBUTES.service.name│
│                          > 'qwen-code'                         │
│   service.version     ← config.getCliVersion()  [予約済み]     │
│   ...ユーザー属性       ← OTEL_RESOURCE_ATTRIBUTES               │
│                          + settings.resourceAttributes         │
│   ✗ session.id 削除                                            │
└────────────────────────────────────────────────────────────────┘
       │
       ├──→ Spans     ＋ session.id（session-tracing.ts:169、維持）
       ├──→ Logs      ＋ session.id（loggers.ts:128、維持）
       └──→ Metrics   ＋ getCommonAttributes() — デフォルト {}
                          toggle ON: { session.id }
```

### 4.2 優先順位 / マージ順序

#### 一般属性

低 → 高:

1. `OTEL_RESOURCE_ATTRIBUTES`（標準 OTel env var）
2. `settings.telemetry.resourceAttributes`
3. 組み込み予約キー（上記の同名キーを上書き）

**理由**: 環境変数は運用時の一時的な上書き（CI / 単一マシンデバッグ）、settings.json はフリート全体のベースライン、組み込みはプロダクト契約である。ベースラインの優先順位は一時的な変数よりも高く、組み込みの優先順位はすべてよりも高い必要がある。

#### `service.name` 特別処理

`service.name` は [OTel 仕様](https://opentelemetry.io/docs/specs/otel/configuration/sdk-environment-variables/) に従わなければならない:

> **`OTEL_SERVICE_NAME` takes precedence over `service.name` defined with the `OTEL_RESOURCE_ATTRIBUTES` variable.**

したがって、`service.name` にはこの優先順位チェーンが個別に適用される（高 → 低）:

1. `OTEL_SERVICE_NAME`（最高、標準 OTel 仕様による）
2. `settings.resourceAttributes.service.name`（settings は env より優先、本設計の一般規則に従う）
3. `OTEL_RESOURCE_ATTRIBUTES.service.name`
4. 組み込みデフォルト `'qwen-code'`

`service.name` は settings による上書きを許可する。これは service の識別子であり、企業フリートが統一された settings.json を使用して service.name を設定することは一般的で合理的な方法であり、禁止すると GitOps 配布シナリオを妨げることになる。`OTEL_SERVICE_NAME` は標準 OTel 仕様で規定された「最優先」チャネルとして、CI / 単一マシンデバッグ時に settings を一時的に上書きできる。

具体的なルール:

| ソース                                                    | `service.name` への書き込みは有効か           |
| ------------------------------------------------------- | ------------------------------------------------------ |
| `OTEL_SERVICE_NAME=foo`                                 | ✅ 最優先（他のソースを上書き）      |
| `settings.resourceAttributes={ "service.name": "foo" }` | ✅ `OTEL_SERVICE_NAME` がない場合のみ有効 |
| `OTEL_RESOURCE_ATTRIBUTES=service.name=foo`             | ✅ 上記の両方がない場合のみ有効            |

### 4.3 予約キー戦略

| キー               | ユーザーが上書き可能か                                                            | 理由                                                                                                  |
| ----------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `service.name`    | ✅ env var + settings の両方が可能（§4.2 優先順位チェーン参照）                          | service 識別子。運用による制御を許可すべき                                                                         |
| `service.version` | ❌ いずれのソースでも破棄 + warn                                                | テレメトリの信頼性——ユーザーがバージョンを偽装することを許可しない                                                                        |
| `session.id`      | ❌ いずれのソースでも破棄 + warn（metric 上では実行時注入を制御する toggle が別途存在） | 実行時のみ。ユーザーが Resource に書き込むと、メトリクスカーディナリティの toggle をバイパスしてしまう（Resource attr はすべての signal に自動付与される） |
| `qwen.*` プレフィックス     | ⚠️ 強制予約ではないが、docs ではプロダクト自身の使用のために残すことを推奨                                 | 将来の組み込み attr とユーザー attr の競合を回避                                                                    |

**予約キーは定数で一元管理**:

```ts
// telemetry/resource-attributes.ts (新規ファイル)
/** Keys that cannot be overridden from any source (env or settings). */
export const RESERVED_RESOURCE_ATTRIBUTE_KEYS = new Set<string>([
  'service.version',
  'session.id',
]);
```

`service.name` は RESERVED リストには**ない**。これは独自の優先順位チェーン（§4.2）を持ち、「グローバルに上書き禁止」という意味には当てはまらない。RESERVED は「どのソースから書き込まれても警告して破棄」という意味であり、env と settings の両方のエントリポイントに均一に適用される。

### 4.4 `OTEL_RESOURCE_ATTRIBUTES` の解析

同期実装。OTel の非同期 envDetector をバイパスする:

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
    out[key] = value; // 重複キー: 最後が優先（OTel リファレンス実装と一致）
  }
  return out;
}
```

形式は OTel 仕様に厳密に従う: `key1=val1,key2=val2`、値はパーセントエンコードされる。

### 4.5 Metric 属性フィルター

唯一の変更点 `metrics.ts:55-59`:

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

呼び出しポイント（30 以上）は**ゼロ変更**——空のオブジェクトを `...spread` してもフィールドは展開されない。

### 4.6 境界ケースと検証

| 入力                                                             | 動作                                                                    |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `OTEL_RESOURCE_ATTRIBUTES=""` (空文字列)                         | `{}` を返し、正常起動                                                     |
| `OTEL_RESOURCE_ATTRIBUTES="a"` (`=` なし)                          | その項目をスキップ + `diag.warn`、残りを解析                                                    |
| `OTEL_RESOURCE_ATTRIBUTES="=val"` (空のキー)                       | その項目をスキップ、残りを解析                                                  |
| `OTEL_RESOURCE_ATTRIBUTES="a=,b=2"` (空の値)                   | `a=''`, `b='2'`（OTel 仕様は空の値を許可）                                |
| `OTEL_RESOURCE_ATTRIBUTES="a=val%ZZbad"` (無効なパーセントエンコーディング) | 生の `val%ZZbad` を保持 + `diag.warn`                                      |
| `OTEL_RESOURCE_ATTRIBUTES="a=1,a=2"` (重複キー)             | 後勝ち `a=2`（OTel SDK リファレンス実装と一致）                              |
| `OTEL_RESOURCE_ATTRIBUTES="a=1, b=2 "` (スペースを含む)                  | 自動トリム                                                               |
| `OTEL_RESOURCE_ATTRIBUTES=service.version=x`                     | `service.version` を静かに破棄 + `diag.warn`、他のキーは保持                    |
| `settings.resourceAttributes={ "service.name": "x" }`            | 受け入れ（settings は service.name を設定可能、§4.2 参照）                             |
| `settings.resourceAttributes={ "service.version": "x" }`         | 静かに破棄 + `diag.warn`                                                  |
| `settings.resourceAttributes={ "team": 123 }` (非文字列)        | TypeScript 型がブロック、実行時に渡された場合は settings JSON schema validator が拒否 |
| Resource 総サイズ > OTel 制限 (4KB?)                               | 基底 OTel SDK によって処理され、本層では検証しない                      |

**なぜ本層で属性キー名の検証を行わないのか**（OTel 推奨の `[a-z][a-z0-9_.]*` パターンなど）: OTel SDK 自体がエクスポート時に検証を行うため、本層で重複検証すると遅くなり、SDK の動作とずれる可能性がある。形式の解析のみを行い、意味的な検証は行わない。

**RESERVED キーの強制保護は両方のエントリポイントに適用される**:

```ts
// env で解析された属性に適用
for (const k of RESERVED_RESOURCE_ATTRIBUTE_KEYS) {
  if (k in envAttrs) {
    diag.warn(`OTEL_RESOURCE_ATTRIBUTES cannot override "${k}"; ignoring`);
    delete envAttrs[k];
  }
}

// settings の属性に適用
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

- **SDK init タイミング**: Resource は `initializeTelemetry()` で一度だけ構築され、**プロセス内では不変**。これは OTel SDK の設計と一致する。
- **Subagent fork**: qwen-code の subagent は同一プロセス内 (`subagent-runtime.ts`) であり、Resource を共有する。将来クロスプロセス subagent が導入された場合、子プロセスは SDK を**再初期化**し、env var と settings を再読み取りする。env が透過的に渡されれば、動作は一致する。
- **Hot reload**: settings を変更しても Resource は**再構築されない**。有効にするにはオペレーターが CLI を再起動する必要がある。ドキュメントで明確に説明する必要がある。
- **`refreshSessionContext()`** (`sdk.ts:306`): セッション ALS context のみをリフレッシュし、**Resource は再構築しない**。これは Resource 上に `session.id` がなくなったためである（本設計の中核的な変更の一つ）。

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

### 5.2 `Config` getter（同ファイル）

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

### 5.3 `resolveTelemetrySettings()` に追加

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

### 5.4 `sdk.ts` Resource 構築の変更

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

`packages/cli/src/config/settingsSchema.ts:998-1018` の `telemetry.jsonSchemaOverride.properties` に追加:

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

また、`additionalProperties: true` は見直しが必要。現在は許容的であり、そのまま維持するか、厳密にすることができる。許容的なままにしておき、schema で宣言されていない他の `telemetry.*` フィールドに対する破壊的変更を避けることを推奨するが、docs では「宣言されていないフィールドは無視される」ことを明確にすべきである。

## 6. ファイル変更リスト

| ファイル                                                           | 変更                                                                       |
| -------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `packages/core/src/telemetry/sdk.ts`                           | Resource 構築を変更（ユーザー属性をマージ、`session.id` を削除）                       |
| `packages/core/src/telemetry/resource-attributes.ts` (新規ファイル)  | `parseOtelResourceAttributes()` + `RESERVED_RESOURCE_ATTRIBUTE_KEYS` 定数  |
| `packages/core/src/telemetry/config.ts`                        | resolver に `resourceAttributes` + `metrics.includeSessionId` の解析とマージを追加 |
| `packages/core/src/telemetry/metrics.ts`                       | `getCommonAttributes()` に toggle ゲートを追加                                     |
| `packages/core/src/config/config.ts`                           | `TelemetrySettings` schema + 2つの getter                                   |
| `packages/cli/src/config/settingsSchema.ts`                    | `jsonSchemaOverride` に `resourceAttributes` + `metrics` を追加                   |
| `docs/developers/development/telemetry.md`                     | "Resource attributes" + "Cardinality controls" の2節と移行説明 + サンプルを追加   |
| `packages/core/src/telemetry/resource-attributes.test.ts` (新規) | パーサーのユニットテスト（§4.6 の全ケースを網羅）                                       |
| `packages/core/src/telemetry/sdk.test.ts`                      | マージ優先順位 / 予約キー / `OTEL_SERVICE_NAME` のテスト                                |
| `packages/core/src/telemetry/metrics.test.ts`                  | toggle off/on 時の `session.id` の有無                                    |
| `packages/core/src/telemetry/config.test.ts`                   | env / settings のマージ                                                        |
| `CHANGELOG.md` またはリリースノート                                | PR 2 の破壊的変更の説明                                               |

## 7. PR 分割

レビューのしやすさと blast radius に基づき、3つの PR に分割:

### PR 1 — カスタムリソース属性（追加的、破壊ゼロ）

- 新規ファイル `resource-attributes.ts`: `parseOtelResourceAttributes()` + `RESERVED_RESOURCE_ATTRIBUTE_KEYS`
- `TelemetrySettings.resourceAttributes` フィールド + resolver マージロジック
- `OTEL_SERVICE_NAME` / `OTEL_RESOURCE_ATTRIBUTES` の統合、§4.2 の優先順位に従う
- Resource へのマージ（`sdk.ts`）
- `settingsSchema.ts` に `resourceAttributes` JSON schema を追加
- **`session.id` の Resource 上の位置は変更しない**
- Docs に "Resource attributes" セクションを追加
**リスク**: 低。完全にadditiveであり、既存の動作を一切変更しません。ユーザーが明示的に環境変数やsettingsを設定しない限り、エクスポートされるデータは変わりません。

### PR 2 — Cardinality controls（セマンティックブレーク）

- Resourceから`session.id`を削除（`sdk.ts:160`の行）
- `metrics.includeSessionId` toggle（settings + env） + `getCommonAttributes()` gate を追加
- `settingsSchema.ts`に`metrics` JSON schemaを追加
- CHANGELOG / 移行説明
- スナップショットテストでmetric attribute集合を固定（回帰防止）
- Docsに"Cardinality controls"節 + 移行ガイドを追加

**リスク**: 中。metric上の`session.id`に依存するPrometheus query / Grafana dashboard / アラートルールがすべて無効になります。明示的なrelease noteと1〜2バージョンの移行ウィンドウが必要です。

**Opt-in 移行スキーム**（候補、今回のIssueでは**採用しない**ことを推奨）：

> PR 2はまず"opt-out"形式でリリースできます——デフォルトでは`session.id`をmetricに注入し続けますが、warn log "this default will flip in v0.X"を追加します。1リリース後にデフォルトを切り替えます。

採用を推奨しない理由：（1）現在のqwen-codeユーザーベースは小さく、影響範囲が限定的である；（2）これはcardinalityのバグであり、早く安全側に倒すほど良い；（3）二段階リリースはドキュメントの負担を増やす。親Issueのオーナーが保守的に進めたい場合は採用しても構いません。

### PR 3 — Docs polish + samples（cleanup）

- `docs/developers/development/telemetry.md` にサンプルを追加（§10参照）
- 阿里云 ARMS / Prometheus / Grafana 接続サンプル
- すべての典型的なuse caseのsettings.json断片を追加

## 8. テスト計画

### 8.1 `parseOtelResourceAttributes()` ユニットテスト

パラメータ化テストで§4.6の表の全行をカバー（vitest `it.each`を推奨）：

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

### 8.2 Resolver merge テスト

| シナリオ                                                                    | 期待`service.name`                                   | 期待user attr                       |
| ----------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------ |
| すべて空                                                                    | `'qwen-code'`                                         | 存在しない                               |
| envのみ `OTEL_SERVICE_NAME=A`                                            | `'A'`                                                 | —                                    |
| envのみ `OTEL_RESOURCE_ATTRIBUTES=service.name=B`                        | `'B'`                                                 | —                                    |
| `OTEL_SERVICE_NAME=A` + `OTEL_RESOURCE_ATTRIBUTES=service.name=B`       | `'A'`（OTEL_SERVICE_NAME優先）                       | —                                    |
| `OTEL_SERVICE_NAME=A` + `settings={service.name:C}`                     | `'A'`（OTEL_SERVICE_NAME優先）                       | —                                    |
| `OTEL_RESOURCE_ATTRIBUTES=service.name=B` + `settings={service.name:C}` | `'C'`（settingsがenvより優先、OTEL_SERVICE_NAMEがない場合） | —                                    |
| `OTEL_RESOURCE_ATTRIBUTES=team=x` + `settings={team:y}`                 | `'qwen-code'`                                         | `team='y'`（settings優先）          |
| `OTEL_RESOURCE_ATTRIBUTES=service.version=fake`                         | `'qwen-code'` + warn                                  | service.versionは実際のcli versionのまま |
| `settings={service.version:fake}`                                       | `'qwen-code'` + warn                                  | service.versionは実際のcli versionのまま |

### 8.3 Resource 内容スナップショットテスト

`InMemorySpanExporter`を使用して1つのspanを取得し、アサーション：

```ts
expect(span.resource.attributes['service.name']).toBe('qwen-code');
expect(span.resource.attributes['service.version']).toBe(EXPECTED_VERSION);
expect(span.resource.attributes['session.id']).toBeUndefined(); // キー
expect(span.resource.attributes['team']).toBe('platform'); // ユーザーが追加
```

### 8.4 Metric attribute toggle テスト

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

### 8.5 Spans / Logs 動作保持テスト

- spans には引き続き`session.id`がある（metric toggleの影響を受けない）
- logs には引き続き`session.id`がある（metric toggleの影響を受けない）

### 8.6 回帰防止

- `autoDetectResources: false` は変更しない（configに対するassertion）
- 起動中に新しい`diag.error`が発生しない（OTel diagログをキャプチャしてassertion）
- 既存の全telemetryテストが通過する（CI）

### 8.7 Diag warn テスト

以下の入力がそれぞれ`diag.warn`を1回トリガーすることを検証：

- `settings.resourceAttributes = { 'service.version': 'x' }`（reserved）
- `OTEL_RESOURCE_ATTRIBUTES=service.version=x`（reserved、envでもwarn）
- `OTEL_RESOURCE_ATTRIBUTES=malformed`（`=`がない）
- `OTEL_RESOURCE_ATTRIBUTES=a=val%ZZ`（無効なpercent-encoding）

以下の入力がwarnを**トリガーしない**ことを検証（正当なパス）：

- `settings.resourceAttributes = { 'service.name': 'x' }`（settingsではservice.nameの設定を許可）
- `OTEL_SERVICE_NAME=foo` + `settings.resourceAttributes = { 'service.name': 'bar' }`（OTEL_SERVICE_NAMEが優先されればよく、warnは不要）

## 9. 移行 / 破壊的変更

### 9.1 破壊的変更（PR 2）

**メトリクス上の`session.id`がデフォルトで消えます**。これにより影響を受けるもの：

- Prometheus queryでの`by (session_id)` / `group_left(session_id)`集計
- Grafana dashboardでのsession単位のグラフ
- session.idでアラートグループ化するルール

注：spansとlogs上の`session.id`は**影響を受けません**。

### 9.2 移行パス

ドキュメントで2つのオプションを提示：

**オプション A**：旧動作を復元（短期的なdebugに推奨）

```bash
export QWEN_TELEMETRY_METRICS_INCLUDE_SESSION_ID=true
```

または`settings.json`：

```json
{
  "telemetry": {
    "metrics": { "includeSessionId": true }
  }
}
```

⚠️ **警告**：長期間有効にすると、metric time-seriesの数 ＝ 過去のsession数となり、バックエンドを圧迫します。短期的なdebugのみに使用してください。

**オプション B**：代わりにspans / logsでsessionをスライスする（推奨）

- spans / logsには引き続き`session.id`が存在し、trace backend（Jaeger / Aliyun ARMS Tracingなど）/ log backend（Loki / SLSなど）でsession単位のスライスが可能
- これらのデータは元々per-event保存であり、cardinalityが爆発することはありません
- session-levelのドリルダウン分析に適しています

### 9.3 Release note テンプレート

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

## 10. サンプル設定（ドキュメント用）

### 10.1 team / env ですべてのtelemetryをスライス

```bash
export OTEL_RESOURCE_ATTRIBUTES="team=platform,env=prod,cost_center=eng-123"
```

効果：すべてのspan / log / metricに`team=platform` `env=prod` `cost_center=eng-123`が付与されます。

### 10.2 `OTEL_SERVICE_NAME` を使用して共有collectorでルーティング

```bash
export OTEL_SERVICE_NAME=qwen-code-ci
```

効果：`service.name=qwen-code-ci`、マルチテナントOTel collectorはservice.nameに基づいて異なるバックエンドにルーティングできます。

### 10.3 Fleet baseline + 単一マシンoverride

会社のfleetの`~/.qwen/settings.json`（GitOpsで配布）：

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

単一マシンのopsによる一時的な上書き（settingsは変更しない）：

```bash
export OTEL_RESOURCE_ATTRIBUTES="debug_run=true"
# settingsのdeployment.environment / service.namespaceは引き続き有効
# 同時にこの実行には追加でdebug_run=trueが付与される
```

### 10.4 短期的なdebugでmetric session.idを有効化

```bash
# 一度きりのdebug run
QWEN_TELEMETRY_METRICS_INCLUDE_SESSION_ID=true qwen "投資分析"
```

終わったらすぐにオフにし、settingsに永続化しない。

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

| 次元                       | claude-code                                      | qwen-code 本設計                                 | 決定根拠                                           |
| -------------------------- | ------------------------------------------------ | ------------------------------------------------ | -------------------------------------------------- |
| 標準OTel環境変数          | `OTEL_RESOURCE_ATTRIBUTES` / `OTEL_SERVICE_NAME` | ✅ 一致                                          | 標準契約                                           |
| `OTEL_SERVICE_NAME` 優先度 | OTel仕様に従う                                   | ✅ 従う                                          | specで明確に定義                                   |
| Cardinality スイッチ命名   | `OTEL_METRICS_INCLUDE_*`                         | `QWEN_TELEMETRY_METRICS_INCLUDE_*`               | 標準OTel名前空間を汚染しない                       |
| スイッチ対象範囲           | metricのみ                                       | ✅ metricのみ                                     | spans / logs はper-eventであり、cardinality爆発問題なし |
| デフォルト値               | 高基数attributeはデフォルトfalse                 | ✅ デフォルトfalse                                | 安全優先                                           |
| 属性ごとの粒度             | 属性ごとに1つのtoggle                            | ✅ 一致                                          | 柔軟で、実際の診断ニーズに合致                     |
| settings.json 相当         | ❌ なし                                          | ✅ あり（`telemetry.resourceAttributes` + `metrics`） | エンタープライズfleetでのベース設定配布に有用     |
| Per-span 動的フック        | ❌ なし                                          | ❌ なし                                          | 複雑性が高く、claude-codeでも未実装、今回はスコープ外 |
| マルチテナント`account_uuid`      | あり                                               | ❌ なし                                            | qwen-code metricにはこの属性がない                     |
| Agent SDK `options.env`    | あり                                               | ❌ なし                                            | qwen-codeに同等のパターンがない                             |
| 予約キー戦略               | built-in idの上書きを許可しない                   | ✅ 一致                                          | テレメトリの信頼性を確保                         |
| 第一通報チャンネル         | claude-codeにも独立した第一通報チャンネルあり（OTelと分離） | ✅ qwen-loggerでも同様に分離                    | 第一通報と第三者チャンネルの責務分離               |

**最も参考になる2点**：

1. **命名規則**：`*_INCLUDE_*` は一目で意味がわかり、反意語の命名（`*_EXCLUDE_*` / `*_DROP_*`）より明確
2. **範囲の抑制**：metricのみを対象とし、span/logは対象外——claude-codeが明らかにこの境界を踏み越えた経験から、我々は直接恩恵を受ける

**qwen-code がより優れている点**：

- settings.json対応：claude-codeはenv varのみに依存しており、エンタープライズfleetのシナリオに不親切
- 明確な予約キー戦略（`service.version`は上書き不可）：テレメトリが汚染される可能性を低減
- 第一通報の分離：qwen-loggerは独立したチャンネルを持ち、ユーザーのOTLP設定と完全に疎結合

## 12. 将来の作業（v2 + 候補）

- **`service.version` cardinality 制御**：OTel View APIを使用してmetric層でattributeをdrop
- **さらにcardinality toggle**：将来metricに`user.account_uuid` / `model`などが導入された場合、必要に応じてtoggleを追加
- **Per-span動的attributeフック**：qwen-code独自のhooksシステムを参考に、`OnSpanStart(span, context) => attrs` コールバックを追加。独立した設計が必要。
- **Resource attribute schema 検証**：キーの名前空間制限（例：`service.*`プレフィックス以外の組み込み属性の上書き禁止）、現在は予約キーリストのハードコードで十分。
- **Hot reload Resource**：プロセス内でsettings.jsonが変更された場合（qwen-serveデーモンシナリオを想定）、現在はResourceが再構築されない。デーモンシナリオが成熟したら、リロードパスを追加可能。
- **プロセス間subagent context 伝搬**：subagentがプロセスを跨ぐ際、親のtrace context（resourceを含む）をOTel context propagationの標準ヘッダーを通じて渡す。独立した設計が必要。