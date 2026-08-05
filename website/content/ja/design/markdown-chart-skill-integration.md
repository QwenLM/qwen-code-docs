# Markdown チャートのスキル統合

ステータス: accepted

## Integration contract

Qwen Code WebShell が契約のレンダリング側を所有する:

- `@qwen-code/web-shell` は `markdown-chart` レンダラーと ECharts ランタイムを含む。
- ホストは正規の [`markdown-chart` スキル](https://github.com/datafe/markdown-chart/tree/main/skills/markdown-chart)をインストールし、モデルがレンダリング可能なチャートブロックを出力するようにする。
- Qwen Code コアはスキルをバンドルも注入もしない。プロジェクトは `.qwen/skills/markdown-chart/SKILL.md` にインストールでき、ユーザーレベルのスキルインストールもサポートされる。

スキルが生成する通常の `data.kind="inline"` 出力については、WebShell ホストにチャート固有のコードは不要である:

```tsx
import { WebShellWithProviders } from '@qwen-code/web-shell';

<WebShellWithProviders
  baseUrl="http://127.0.0.1:4170"
  token={token}
  sessionId={sessionId}
/>;
```

## Referenced data

ホストが実際に管理されたデータセットをスキルに公開し `data.kind="ref"` を許可する場合、カスタムレジストリを通じて `resolveDataRef` を提供する:

```tsx
import {
  createMarkdownChartRegistry,
  WebShellWithProviders,
} from '@qwen-code/web-shell';

const chartRegistry = createMarkdownChartRegistry({
  resolveDataRef: async (ref, context) =>
    loadControlledChartDataset(ref, context),
});
const markdown = { chart: { registry: chartRegistry } };

<WebShellWithProviders
  baseUrl="http://127.0.0.1:4170"
  token={token}
  sessionId={sessionId}
  markdown={markdown}
/>;
```

レンダラー自身が ref をフェッチしたりローカルパスを読み取ったりすることはない。`resolveDataRef` は、モデルから見える参照を信頼されたデータセットへ接続する、ホスト所有の境界である。デフォルトレジストリは正規化された `artifact://` と `session-file://` の ref を受け入れ、ブロックを JSON として解析し、オプションを検証した後、正規化された ref と宣言されたフォーマット・寸法をリゾルバーへ渡す。リゾルバーの待機は 30 秒に制限される。チャートがマウントされている間、`markdown`、`chart`、`labels` のオーバーライドは参照的に安定させておく。

## Streaming behavior

共有の React アダプターは、クローズされたチャートフェンスとアクティブな未終端の末尾フェンスを区別する:

- クローズされた `markdown-chart` ブロックは即座にレンダリングされ、フェンスがブロッククォート内にある場合を含め、後続の回答テキストがストリーミング中もマウントされたままである。
- ローディング状態を表示するのは、アクティブな未終端チャートフェンスのみである。

## Scope

- スキルはモデル出力の契約を定義する。レンダラーは読み込まない。
- WebShell はレンダリングの契約を定義する。スキルは自動インストールしない。
- デーモン、ACP、クライアント capability のネゴシエーションに変更は不要である。
- 自動のネットワークやファイルシステムアクセスは導入されない。
