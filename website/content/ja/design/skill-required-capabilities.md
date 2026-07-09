# Skill Required Capabilities の設計

Status: 設計ノート。本 PR は Option B で進め、`required-capabilities` は将来の提案として残します。

## Context

Web Shell は Markdown レンダラーを通じてカスタムのフェンスコードブロックをレンダリングできます。
チャートレンダラーの提案では `echarts-fulldata` フェンスコードブロックを使用し、モデルが完全な ECharts オプションとデータセットペイロードを返せるようにします。これを Web Shell がインタラクティブなチャートとしてレンダリングします。

この出力コントラクトは、それをレンダリングできるクライアントでのみ有用です。CLI、ACP クライアント、または一致するレンダラーを持たないその他のサーフェスでは、同じレスポンスはチャートではなく大きなコードブロックとして表示されます。

初期のバンドルチャート skill の提案では、フォーマットが Web Shell 用であることをモデルに伝えるために文言に依存していました。これはソフトガードです。skill が Web Shell 以外のセッションで公開された場合、モデルはクライアントがレンダリングできない出力フォーマットを依然として選択する可能性があります。

現在の PR では、Qwen Code は Web Shell にレンダラーの拡張ポイントを残しますが、`qwencode-viz` をコアにバンドルしません。Web Shell パッケージには、コピー可能な自動ロードされない skill テンプレートが含まれており、ホストは `echarts-fulldata` レンダラーを登録する場合にのみ、その skill をインストールまたは注入する必要があります。

## Problem

Qwen Code には、ホスト固有の skill をモデルおよびユーザーに表示するかどうかを決定するための明確な方法が必要です。

`qwencode-viz` の場合、具体的な疑問は次のとおりです。

- コアは汎用的な `required-capabilities` skill メタデータフィールドをサポートすべきか？
- または、`qwencode-viz` はコアのバンドル skill にはせず、代わりにそれをインストールまたは注入する Web Shell クライアントによってのみ提供されるべきか？

## Goals

- 現在のクライアントが出力コントラクトを満たせない場合に、レンダラー固有の skill が公開されるのを防ぐ。
- スタートアップ時の skill リマインダー、明示的な skill 有効化、スラッシュコマンドの検出、および skill の検証を一貫して維持する。
- `qwencode-viz` を特殊なケースとしてハードコーディングするのを避ける。
- capability 要件が宣言されていない場合、既存の skill の動作を維持する。
- 設計を ECharts だけでなく、将来のホスト capability に対して拡張可能に保つ。

## Non-goals

- ECharts レンダラー自体の実装。
- すべてのクライアント/サーバー capability ネゴシエーションの再設計。
- 既存の skill フロントマターのセマンティクスの変更。
- 初版でのマルチクライアント共有セッションの capability 変更の解決。

## Current Related Mechanisms

コードベースにはすでにいくつかの可視性制御がありますが、クライアントのレンダリング capability を表すものはありません。

- `disable-model-invocation`: skill がモデルによって自動呼び出しされるのを防ぎます。
- `user-invocable`: バンドルされた skill をコマンドとして利用可能かどうかを制御します。
- `paths`: skill の可用性を一致するワークスペースパスにスコープします。
- `skills.disabled`: 設定された skill を無効にします。
- `allowedTools`: 現在、cron ツールが利用できない場合に cron 指向の skill を非表示にするために、バンドル skill のロードで使用されています。
- スラッシュコマンドの `supportedModes`: 実行モードによってコマンドをフィルタリングします。
- Daemon および ACP capability オブジェクト: プロトコルまたはクライアントのサポートを記述しますが、現在は skill の公開には接続されていません。

既存の `required-capabilities` または同等の skill フロントマターはありません。それを追加することは、新しい skill コントラクトになります。

## Option A: Add `required-capabilities`

汎用的な skill フロントマターフィールドを追加します。

```yaml
---
name: qwencode-viz
description: Render analytical charts in Web Shell using echarts-fulldata fenced code blocks.
required-capabilities:
  - markdown.codeBlock.echarts-fulldata
---
```

現在のクライアント/セッションがリストされたすべての capability をアドバタイズしない場合、その skill は利用不可として扱われます。

### Capability Naming

名前空間付きの文字列 capability を使用します。

```text
markdown.codeBlock.echarts-fulldata
```

これにより、フィールドを汎用的に保ちながら、コントラクトを正確にします。

- `markdown`: capability はレンダリングされた Markdown に属します。
- `codeBlock`: capability はフェンスコードブロックのレンダリングに適用されます。
- `echarts-fulldata`: レンダラーによってサポートされる特定の言語/info 文字列です。

将来の例としては次のようなものが考えられます。

- `markdown.codeBlock.vega-lite`
- `markdown.codeBlock.mermaid-interactive`
- `artifact.openUrl`

### Skill Metadata

フロントマターのキー `required-capabilities` を解析した後、skill 設定に `requiredCapabilities?: string[]` を追加します。

両方の skill 解析パスがこのフィールドを理解する必要があります。

- `packages/core/src/skills/skill-load.ts`
- `packages/core/src/skills/skill-manager.ts`

このフィールドはオプションである必要があります。欠落しているか空の場合は、skill にクライアント capability 要件がないことを意味します。

### Runtime Capability Source

ランタイム設定にクライアント/セッションの capability を追加します。

```ts
interface ConfigParameters {
  clientCapabilitiesProvider?: () => ReadonlySet<string>;
}
```

`Config` にヘルパーを公開します。例:

```ts
config.getClientCapabilities(): ReadonlySet<string>
```

次に、チェックを一元化します。

```ts
function skillMeetsRequiredCapabilities(skill: Skill, config: Config): boolean {
  return skill.config.requiredCapabilities.every((capability) =>
    config.getClientCapabilities().has(capability),
  );
}
```

### Filtering Points

capability フィルタは、skill がモデルまたはユーザーのいずれかに公開される前に適用される必要があります。

- `packages/core/src/tools/skill-utils.ts` の `collectAvailableSkillEntries` は、必要な capability が欠落している skill をスキップする必要があります。これにより、スタートアップ時の skill リマインダー、デルタリマインダー、`SkillTool` の検証、およびモデル呼び出し可能なアクティベーションが整合します。
- `BundledSkillLoader` は、ユーザー向けコマンドを作成する際に、利用できないバンドル skill をスキップする必要があります。
- `SkillCommandLoader` は、ユーザー向けコマンドを作成する際に、利用できないファイルシステム skill をスキップする必要があります。

重要な不変条件は、プロジェクトが意図的に手動オーバーライドをサポートしていない限り、モデルから隠された skill が呼び出し可能なコマンドとして表示されないことです。

### Web Shell Registration

Web Shell は、不透明な `renderCodeBlock` コールバックの存在に依存するのではなく、レンダラーのサポートを明示的にアドバタイズする必要があります。

例:

```tsx
<WebShell
  customization={{
    markdown: {
      renderableCodeBlockLanguages: ['echarts-fulldata'],
      renderCodeBlock(info) {
        // render custom blocks
      },
    },
  }}
/>
```

Web Shell クライアントはそれを次のようにマッピングできます。

```text
markdown.codeBlock.echarts-fulldata
```

これにより、レンダラーコールバックにカスタムロジック、フォールバック、または複数のサポートされる言語が含まれている場合でも、capability の宣言は安定します。

### Daemon and ACP Propagation

ホスト型またはデーモンベースのセッションの場合、skill がロードまたはリストされる前に、クライアント capability セットがコアに到達する必要があります。最小限のバージョンでは、セッション作成時に capability を渡すことができます。

```ts
interface CreateSessionRequest {
  clientCapabilities?: string[];
}
```

デーモンブリッジ、SDK、および ACP セッション作成フローは、これをセッションスコープの設定として保存できます。

初版では、capability はセッションスコープにできます。複数のクライアントが同じセッションにアタッチする場合、その動作はセッション作成時の capability を使用するとドキュメント化する必要があります。

### Pros

- `qwencode-viz` を 1 つの標準的なバンドル skill として維持します。
- ホスト固有の出力コントラクトがサポートされていないクライアントに漏洩するのを防ぎます。
- 将来のレンダラー固有またはホスト固有の skill に対する再利用可能なメカニズムを作成します。
- 依存関係を明示的でテスト可能にします。

### Cons

- 新しい横断的な skill メタデータフィールドを追加します。
- Web Shell、デーモン、SDK、および ACP サーフェス間でクライアント/セッション capability の接続を必要とします。
- 共有セッションの動作について注意深いドキュメント化が必要です。
- `qwencode-viz` が唯一の予想される capability ゲート付き skill である場合、必要以上に多くの仕組みになる可能性があります。

## Option B: Client-Supplied Skill

汎用的な `required-capabilities` フィールドは追加しません。代わりに、`qwencode-viz` をコアにバンドルしないようにします。Web Shell クライアント、またはレンダラーをサポートする任意のクライアントが、skill 自体を提供します。

考えられる配布モデル:

- Web Shell ホストが `.qwen/skills/qwencode-viz/SKILL.md` をインストールします。
- Web Shell パッケージは、チャートレンダリングが有効になっているときにホストがコピーまたはインストールできる、オプションの自動ロードされない skill テンプレートを出荷します。
- Web Shell 統合は拡張 skill パッケージを出荷します。
- Web Shell 統合は、チャートレンダラーが有効になっている場合にのみ、同等のモデル指示を注入します。

このモデルでは、レンダリングクライアントが提供することを選択したためにのみ、skill が利用可能になります。

### Web Shell Host Integration

チャート出力を希望する Web Shell ホストは、コントラクトの両方の部分にオプトインする必要があります。

1. `echarts-fulldata` Markdown コードブロックレンダラーを登録します。
2. `packages/web-shell/docs/examples/qwencode-viz/SKILL.md` から一致するチャート skill を提供します。

例:

```tsx
import * as echarts from 'echarts';
import {
  WebShellWithProviders,
  createEchartsFullDataRenderer,
} from '@qwen-code/web-shell';

<WebShellWithProviders
  baseUrl="http://127.0.0.1:4170"
  token={token}
  sessionId={sessionId}
  markdown={{
    renderCodeBlock: createEchartsFullDataRenderer({
      loadEcharts: () => echarts,
      resolveDataRef: async (ref, meta) =>
        loadControlledChartDataset(ref, meta),
    }),
  }}
/>;
```

このレンダラー設定では、`loadEcharts` により、ホストは静的インポートまたは遅延読み込みモジュールとして、承認された ECharts ランタイムを提供できます。`resolveDataRef` は `data.kind="ref"` チャートブロックにのみ使用されます。これは、モデルから参照可能なデータ参照から信頼されたデータセットへの、ホストが所有するブリッジです。モデル向けのエンベロープフォーマットは、`packages/web-shell/docs/examples/qwencode-viz/SKILL.md` のオプションの skill テンプレートで説明されています。レンダラー側の検証は `packages/web-shell/client/components/messages/EchartsFullDataBlock.tsx` にあります。

skill ファイルは、この登録を実行するホストによってのみインストールまたは注入される必要があります。シンプルなファイルベースの統合では、次のものをコピーできます。

```text
packages/web-shell/docs/examples/qwencode-viz/SKILL.md
```

ワークスペースまたはユーザー skill ディレクトリへ。例:

```text
.qwen/skills/qwencode-viz/SKILL.md
```

独自の skill 配布レイヤーを持つ統合では、代わりに同じファイルを正規のソースコンテンツとしてロードし、そのレイヤーを通じて公開できます。どちらの場合も、コアは skill を自動ロードしません。ホストがレンダラーを所有しているため、skill を有効にする所有権はホストにあります。

`data.kind="ref"` エンベロープの場合、組み込みのレンダラーは、ホスト制御の `resolveDataRef(ref, meta)` 実装を呼び出す前に、`data.ref` が正規化された `artifact://` または `session-file://` 参照を使用していることを検証します。レンダラーはまた、ブロックを JSON として解析し、レンダリング前に ECharts オプションをサニタイズします。モデル提供の JavaScript を評価したり、任意の URL をフェッチしたり、ローカルファイルを自分で読み込んだりすることはありません。カスタムレンダラーも同じ分割を維持する必要があります。まずレンダラーレベルの JSON/ref/option の検証を行い、次にホストが所有する artifact の解決を行います。

デーモンバックエンドのホストは、ワークスペースファイル API を 1 つの artifact バックエンドとして扱うことができます。たとえば、ホストは `.qwen/artifacts/` などの制御されたワークスペースディレクトリの下にチャート artifact を永続化し、`artifact://chart-data/orders.csv` のようなモデル向けの参照を公開し、デーモンの `GET /file?path=.qwen/artifacts/chart-data/orders.csv` を通じてそれらを解決できます。これにより、`artifact://` を公開チャートコントラクトとして維持しつつ、最初の実装でデーモンのワークスペースファイルを再利用できます。

リゾルバーは、デーモンを呼び出す前に artifact ルートを強制する必要があります。

```tsx
const ARTIFACT_ROOT = '.qwen/artifacts/';
const MAX_CHART_DATA_BYTES = 256 * 1024;

async function resolveDataRef(
  ref: string,
  meta: { format?: string; dimensions?: string[] },
) {
  const artifactPrefix = 'artifact://';
  if (!ref.startsWith(artifactPrefix)) {
    throw new Error(`Unsupported chart data ref: ${ref}`);
  }

  const artifactPath = ref.slice(artifactPrefix.length);
  if (
    artifactPath.length === 0 ||
    artifactPath.startsWith('/') ||
    artifactPath.includes('\\') ||
    artifactPath.split('/').includes('..')
  ) {
    throw new Error(`Invalid chart data ref: ${ref}`);
  }

  const url = new URL('/file', daemonBaseUrl);
  url.searchParams.set('path', `${ARTIFACT_ROOT}${artifactPath}`);
  url.searchParams.set('maxBytes', String(MAX_CHART_DATA_BYTES));

  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!response.ok) {
    throw new Error(`Failed to read chart data: ${response.status}`);
  }

  const file = (await response.json()) as { content: string };
  return meta.format === 'csv'
    ? parseCsvAsArrayRows(file.content, meta.dimensions)
    : JSON.parse(file.content);
}
```
この例では、意図的に正規化された `artifact://` パスのみを `.qwen/artifacts/` 配下にマッピングしています。ホストが後でアーティファクトをオブジェクトストレージやセッションスコープのアーティファクトサービスに移動した場合でも、変更が必要なのは `resolveDataRef` だけです。モデルに公開される `echarts-fulldata` ブロックは、同じ ref 形状をそのまま使い続けることができます。

### メリット

- コアへの変更を最小限に抑えられる。
- 新しいグローバルな skill メタデータ契約が不要。
- capability の可用性は、レンダラーを実装するクライアントが自然に所有することになる。
- クライアントがすでに skill 注入メカニズムを持っている場合を除き、デーモンや ACP の基盤実装を回避できる。

### デメリット

- すべてのクライアントが同じ内容をコピーしない限り、標準的なバンドル skill は存在しない。
- 各 Web Shell インテグレーターの負担が増える。
- クライアント間を移動するユーザーは、skill の可用性に一貫性がないことに直面する可能性がある。
- 将来のホスト固有の skill に対する一般的なセーフガードを作成しない。
- 可用性が外部インストールや注入に依存するため、コアでのテストが難しくなる。

## 推奨事項

この PR では、Option B を使用します。

これにより、コアの skill システムは変更されず、サポートされていないクライアントで `echarts-fulldata` 命令が公開されるのを回避できます。Web Shell レンダラーフックは、ホストが所有する任意のブロックレンダラーに対して引き続き有用であり、チャート固有のモデル命令はホストによる明示的なオプトインとなります。

長期的には、これをプロダクト/API バウンダリの決定事項として議論する必要があります。

メンテナーが Qwen Code で今後より多くのクライアントレンダリング出力契約をサポートすることを期待する場合は、Option A を選択します。その場合、`required-capabilities` は、CLI、Web Shell、ACP、および将来のクライアント間で skill の公開を適切に保つための小さな一般契約となります。

`qwencode-viz` が Web Shell 専用の拡張機能のままとなり、メンテナーがコアの skill をクライアントのレンダリング機能に依存させたくない場合は、Option B を選択します。その場合、現在のバンドル skill はコアから削除し、`echarts-fulldata` をサポートする Web Shell クライアントによって提供されるべきです。

推奨される将来のデフォルトは、メンテナーがクライアント/セッションの capability を skill システムの一部にすることに問題がない場合にのみ Option A となります。それ以外の場合は、ホストレンダラー skill をクライアント所有のままにしておきます。

## 未解決の質問

- capability はセッションスコープ、リクエストスコープ、クライアントスコープのどれにすべきか？
- 欠落している capability は、ユーザーが呼び出し可能なコマンドを非表示にするべきか、それともモデルが呼び出し可能な skill のアクティブ化のみを非表示にするべきか？
- capability 名は自由形式の文字列にするべきか、それとも既知のレジストリに対して検証するべきか？
- 利用できない skill は `/skills` から完全に非表示にするべきか、それとも理由とともに無効として表示するべきか？
- サポートされていないクライアントで意図的に生の `echarts-fulldata` ブロックを出力したいユーザーのために、手動オーバーライドを用意すべきか？
- フィールド名は `required-capabilities`、`requires-capabilities`、`client-capabilities` のどれにすべきか？

## 検証計画

Option A が実装された場合、以下のテストを追加します。

- 両方の skill 解析パスにおけるフロントマターの解析。
- capability が欠落しているときに `collectAvailableSkillEntries` が skill を非表示にすること。
- capability が存在するときに同じ skill が表示されること。
- `paths`、`skills.disabled`、および `disable-model-invocation` との相互作用。
- `BundledSkillLoader` および `SkillCommandLoader` のコマンドの可視性。
- サポートされているコードブロック言語からクライアント capability への Web Shell マッピング。
- capability セットを保持したままのデーモンまたは ACP セッションの作成。
- `required-capabilities` のない skill が変更されていないことを確認するための、既存のバンドル skill 統合テスト。

## マイグレーション

新しいフィールドはオプションであるため、既存の skill にマイグレーションは不要です。

現在の Option B のパスでは、コアのバンドル skill からチャート skill を削除します。Web Shell パッケージテンプレートはコアによって自動的にロードされてはなりません。ホストはそれをインストールまたは注入することでオプトインします。

Option A が受け入れられた場合、将来のバンドル `qwencode-viz` に以下を追加します。

```yaml
required-capabilities:
  - markdown.codeBlock.echarts-fulldata
```

Option B が受け入れられた場合、コアのバンドル skill からチャート skill を削除し、`echarts-fulldata` レンダラーを登録する際に Web Shell クライアントがそれをインストールまたは注入する方法をドキュメント化します。