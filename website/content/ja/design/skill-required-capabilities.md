# Skill Required Capabilities の設計

ステータス: 設計ノート。本 PR では Option B を採用し、
`required-capabilities` は将来の提案として残します。

## 背景

Web Shell は Markdown レンダラーを通じてカスタムのフェンスコードブロックをレンダリングできます。
チャートレンダラーの提案では `echarts-fulldata` フェンスコードブロックを使用し、モデルが完全な ECharts オプションとデータセットペイロードを返せるようにします。これを Web Shell がインタラクティブなチャートとしてレンダリングします。

この出力コントラクトは、それをレンダリングできるクライアントでのみ有用です。CLI、ACP クライアント、または一致するレンダラーを持たないその他のインターフェースでは、同じレスポンスがチャートの代わりに大きなコードブロックとして表示されます。

初期のバンドルチャート skill の提案では、フォーマットが Web Shell 用であることをモデルに伝えるために文言に依存していました。これはソフトガードです。skill が Web Shell 以外のセッションで公開された場合、モデルはクライアントがレンダリングできない出力フォーマットを選択してしまう可能性があります。

現在の PR では、Qwen Code は Web Shell にレンダラーの拡張ポイントを残しますが、`qwencode-viz` をコアにバンドルしません。Web Shell パッケージには、コピー可能な非自動ロードの skill テンプレートが含まれており、ホストは `echarts-fulldata` レンダラーを登録する場合にのみ、その skill をインストールまたは注入する必要があります。

## 問題

Qwen Code には、ホスト固有の skill をモデルおよびユーザーに表示するかどうかを決定する明確な方法が必要です。

`qwencode-viz` の場合、具体的な疑問は次のとおりです。

- コアは汎用的な `required-capabilities` skill メタデータフィールドをサポートすべきか？
- または、`qwencode-viz` はコアのバンドル skill にはせず、インストールまたは注入する Web Shell クライアントのみが提供するべきか？

## 目標

- 現在のクライアントが出力コントラクトを満たせない場合に、レンダラー固有の skill が公開されるのを防ぐ。
- スタートアップ時の skill リマインダー、明示的な skill 有効化、スラッシュコマンドの検出、および skill の検証を一貫して維持する。
- `qwencode-viz` を特別なケースとしてハードコーディングしない。
- ケイパビリティ要件が宣言されていない場合、既存の skill の動作を維持する。
- 設計を ECharts だけでなく、将来のホストケイパビリティに対しても拡張可能に保つ。

## 対象外

- ECharts レンダラー自体の実装。
- すべてのクライアント/サーバー間のケイパビリティネゴシエーションの再設計。
- 既存の skill フロントマターのセマンティクスの変更。
- 最初のバージョンでのマルチクライアント共有セッションのケイパビリティ変更の解決。

## 現在関連しているメカニズム

コードベースにはすでにいくつかの可視性コントロールがありますが、クライアントのレンダリングケイパビリティを表すものはありません。

- `disable-model-invocation`: skill がモデルによって自動呼び出しされるのを防ぎます。
- `user-invocable`: バンドルされた skill をコマンドとして利用可能かどうかを制御します。
- `paths`: skill の利用可能性を一致するワークスペースパスにスコープ限定します。
- `skills.disabled`: 設定された skill を無効にします。
- `allowedTools`: 現在、cron ツールが利用できない場合に cron 指向の skill を非表示にするために、バンドル skill のロードで使用されています。
- スラッシュコマンドの `supportedModes`: 実行モードによってコマンドをフィルタリングします。
- Daemon および ACP のケイパビリティオブジェクト: プロトコルまたはクライアントのサポートを記述しますが、現在は skill の公開には接続されていません。

既存の `required-capabilities` または同等の skill フロントマターはありません。それを追加することは、新しい skill コントラクトになります。

## Option A: `required-capabilities` の追加

汎用的な skill フロントマターフィールドを追加します。

```yaml
---
name: qwencode-viz
description: Render analytical charts in Web Shell using echarts-fulldata fenced code blocks.
required-capabilities:
  - markdown.codeBlock.echarts-fulldata
---
```

現在のクライアント/セッションがリストされたすべてのケイパビリティを通知しない場合、その skill は利用不可として扱われます。

### ケイパビリティの命名

名前空間付きの文字列ケイパビリティを使用します。

```text
markdown.codeBlock.echarts-fulldata
```

これにより、フィールドを汎用的に保ちながら、コントラクトを正確にします。

- `markdown`: ケイパビリティはレンダリングされた Markdown に属します。
- `codeBlock`: ケイパビリティはフェンスコードブロックのレンダリングに適用されます。
- `echarts-fulldata`: レンダラーによってサポートされる特定の言語/info 文字列です。

将来の例としては次のようなものが考えられます。

- `markdown.codeBlock.vega-lite`
- `markdown.codeBlock.mermaid-interactive`
- `artifact.openUrl`

### Skill メタデータ

フロントマターのキー `required-capabilities` を解析した後、skill 設定に `requiredCapabilities?: string[]` を追加します。

両方の skill 解析パスがこのフィールドを理解する必要があります。

- `packages/core/src/skills/skill-load.ts`
- `packages/core/src/skills/skill-manager.ts`

このフィールドはオプションである必要があります。欠落しているか空の場合は、skill にクライアントケイパビリティ要件がないことを意味します。

### ランタイムケイパビリティソース

ランタイム設定にクライアント/セッションのケイパビリティを追加します。

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

### フィルタリングポイント

ケイパビリティフィルターは、skill がモデルまたはユーザーのいずれかに公開される前に適用する必要があります。

- `packages/core/src/tools/skill-utils.ts` の `collectAvailableSkillEntries` は、必要なケイパビリティが欠落している skill をスキップする必要があります。これにより、スタートアップ時の skill リマインダー、デルタリマインダー、`SkillTool` の検証、およびモデル呼び出し可能なアクティベーションが整合します。
- `BundledSkillLoader` は、ユーザー向けコマンドを作成する際に、利用できないバンドル skill をスキップする必要があります。
- `SkillCommandLoader` は、ユーザー向けコマンドを作成する際に、利用できないファイルシステム skill をスキップする必要があります。

重要な不変条件は、プロジェクトが意図的に手動オーバーライドをサポートしていない限り、モデルから隠された skill が呼び出し可能なコマンドとして表示されないようにすることです。

### Web Shell の登録

Web Shell は、不透明な `renderCodeBlock` コールバックの存在に依存するのではなく、レンダラーのサポートを明示的に通知する必要があります。

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

これにより、レンダラーコールバックにカスタムロジック、フォールバック、または複数のサポート言語が含まれている場合でも、ケイパビリティの宣言は安定します。

### Daemon および ACP の伝播

ホスト型または Daemon ベースのセッションの場合、skill がロードまたはリストされる前に、クライアントケイパビリティセットがコアに到達する必要があります。最小限のバージョンでは、セッション作成時にケイパビリティを渡すことができます。

```ts
interface CreateSessionRequest {
  clientCapabilities?: string[];
}
```

Daemon ブリッジ、SDK、および ACP セッション作成フローは、これをセッションスコープの設定として保存できます。

最初のバージョンでは、ケイパビリティはセッションスコープにできます。複数のクライアントが同じセッションにアタッチする場合、その動作はセッション作成時のケイパビリティを使用するものとしてドキュメント化する必要があります。

### メリット

- `qwencode-viz` を 1 つの標準的なバンドル skill として維持します。
- ホスト固有の出力コントラクトがサポートされていないクライアントに漏洩するのを防ぎます。
- 将来のレンダラー固有またはホスト固有の skill に対する再利用可能なメカニズムを作成します。
- 依存関係を明示的でテスト可能にします。

### デメリット

- 新しい横断的な skill メタデータフィールドを追加します。
- Web Shell、Daemon、SDK、および ACP の各インターフェース間で、クライアント/セッションのケイパビリティの伝達機構を実装する必要があります。
- 共有セッションの動作について注意深いドキュメント化が必要です。
- `qwencode-viz` が唯一のケイパビリティゲート付き skill であると予想される場合、必要以上の仕組みになる可能性があります。

## Option B: クライアント提供の Skill

汎用的な `required-capabilities` フィールドは追加しません。代わりに、`qwencode-viz` をコアにバンドルしないようにします。Web Shell クライアント、またはレンダラーをサポートする任意のクライアントが、skill 自体を提供します。

考えられる配布モデル:

- Web Shell ホストが `.qwen/skills/qwencode-viz/SKILL.md` をインストールする。
- Web Shell パッケージに、チャートレンダリングが有効な際にホストがコピーまたはインストールできるオプションの非自動ロード skill テンプレートを含める。
- Web Shell 統合が拡張 skill パッケージを提供する。
- Web Shell 統合が、チャートレンダラーが有効な場合にのみ、同等のモデル指示を注入する。

このモデルでは、レンダリングクライアントが提供することを選択した場合にのみ、skill が利用可能になります。

### メリット

- コアの変更が最小限で済む。
- 新しいグローバル skill メタデータコントラクトが不要。
- ケイパビリティの可用性は、レンダラーを実装するクライアントが自然に所有する。
- クライアントがすでに skill 注入メカニズムを持っている場合を除き、Daemon や ACP の伝達機構の実装を回避できる。

### デメリット

- すべてのクライアントが同じコンテンツをコピーしない限り、標準的なバンドル skill は存在しない。
- 各 Web Shell 統合者の負担が増える。
- クライアント間を移動するユーザーは、skill の可用性に一貫性がないことに気づく可能性がある。
- 将来のホスト固有の skill に対する一般的なセーフガードを作成しない。
- 可用性が外部のインストールまたは注入に依存するため、コアでのテストが難しくなる。

## 推奨事項

この PR では、Option B を使用します。

これにより、コアの skill システムは変更されず、サポートされていないクライアントで `echarts-fulldata` 指示が公開されるのを回避します。Web Shell のレンダラーフックは、ホスト所有のブロックレンダラーであれば引き続き有用であり、チャート固有のモデル指示は明示的なホストのオプトインとなります。

長期的には、これをプロダクト/API バウンダリの決定として議論します。

メンテナーが Qwen Code が時間の経過とともにさらに多くのクライアントレンダリング出力コントラクトをサポートすることを期待している場合は、Option A を選択します。その場合、`required-capabilities` は、CLI、Web Shell、ACP、および将来のクライアント間で skill の公開を適切に保つための小規模な汎用コントラクトです。

`qwencode-viz` が Web Shell 専用の拡張機能のままになると予想され、メンテナーがコアの skill をクライアントのレンダリング機能に依存させたくない場合は、Option B を選択します。その場合、現在のバンドル skill はコアから削除し、`echarts-fulldata` をサポートする Web Shell クライアントによって提供される必要があります。

推奨される将来のデフォルトは、メンテナーがクライアント/セッションのケイパビリティを skill システムの一部にすることに抵抗がない場合にのみ Option A です。それ以外の場合は、ホストレンダラー skill をクライアント所有のままにします。

## 未解決の疑問

- ケイパビリティはセッションスコープ、リクエストスコープ、またはクライアントスコープにすべきか？
- 欠落しているケイパビリティは、ユーザーが呼び出し可能なコマンドを非表示にするべきか、それともモデルが呼び出し可能な skill のアクティベーションのみを非表示にするべきか？
- ケイパビリティ名は自由形式の文字列にするべきか、それとも既知のレジストリに対して検証するべきか？
- 利用できない skill は `/skills` から完全に非表示にするべきか、それとも理由とともに無効として表示するべきか？
- サポートされていないクライアントで意図的に生の `echarts-fulldata` ブロックを出力したいユーザーのために、手動オーバーライドを用意すべきか？
- フィールド名は `required-capabilities`、`requires-capabilities`、または `client-capabilities` のどれにすべきか？

## 検証計画

Option A が実装された場合、次のテストを追加します。

- 両方の skill 解析パスにおけるフロントマターの解析。
- ケイパビリティが欠落しているときに skill を非表示にする `collectAvailableSkillEntries`。
- ケイパビリティが存在するときに同じ skill が表示されること。
- `paths`、`skills.disabled`、および `disable-model-invocation` との相互作用。
- `BundledSkillLoader` および `SkillCommandLoader` のコマンドの可視性。
- サポートされているコードブロック言語からクライアントケイパビリティへの Web Shell のマッピング。
- ケイパビリティセットを保持する Daemon または ACP セッションの作成。
- `required-capabilities` がない skill が変更されていないことを確認するための、既存のバンドル skill 統合テスト。

## 移行

新しいフィールドはオプションであるため、既存の skill に移行は必要ありません。

現在の Option B のパスでは、コアのバンドル skill からチャート skill を削除します。Web Shell パッケージテンプレートはコアによって自動的にロードされてはなりません。ホストはインストールまたは注入によってオプトインします。

Option A が受け入れられた場合、次のように追加します。

```yaml
required-capabilities:
  - markdown.codeBlock.echarts-fulldata
```

将来のバンドルされる `qwencode-viz` に追加します。

Option B が受け入れられた場合、コアのバンドル skill からチャート skill を削除し、`echarts-fulldata` レンダラーを登録する際に Web Shell クライアントがそれをインストールまたは注入する方法をドキュメント化します。