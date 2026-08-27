# Agent Plugins v1

Qwen Code は、ポータブルな [Agent Plugins v1](https://agent-plugins.org/) パッケージをネイティブに読み込みます。パッケージは標準の `plugin.json`、`mcp.json`、`SKILL.md` ファイルをそのまま保持します。インストール時に `qwen-extension.json` が生成されたり、ポータブルファイルが書き換えられたりすることはありません。

既存の拡張機能コマンドをローカルディレクトリ、リンク、アーカイブ、Git リポジトリ、アーカイブ URL、またはスコープ付き npm パッケージに対して使用します。

```bash
qwen extensions install ./my-agent-plugin
qwen extensions link ./my-agent-plugin
qwen extensions install owner/my-agent-plugin
```

ルートマニフェストは正規の v1 スキーマをターゲットにする必要があります。

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  "name": "my-agent-plugin",
  "version": "1.0.0"
}
```

## サポートされている機能

| 機能                                         | サポート                                 |
| -------------------------------------------- | ---------------------------------------- |
| 直下の子 `skills/*/SKILL.md`                 | はい                                      |
| stdio MCP サーバー                           | はい                                      |
| Streamable HTTP MCP サーバー                 | はい                                      |
| レガシー HTTP+SSE MCP サーバー               | なし。エントリはスキップされます          |
| コマンド、エージェント、フック               | なし。これらのディレクトリは無視されます  |
| Qwen コンテキスト、設定、チャネル、アプリ    | なし                                      |
| `extensions.*` クライアント名前空間          | なし。未実装の名前空間は無視されます      |

スキルは [Agent Skills 仕様](https://agentskills.io/specification) に従います。無効なスキルはスキップされますが、有効な兄弟スキルが無効になることはありません。実験的な `allowed-tools` フィールドは文字列として認識されますが、Qwen ツールの事前承認は行いません。

stdio MCP サーバーの場合、Qwen Code は `args`、環境変数の値、および `cwd` 内で `${PLUGIN_ROOT}` と `${PLUGIN_DATA}` を一度だけ展開します。`PLUGIN_DATA` は書き込み可能なインストールごとのディレクトリで、その内容はアップデートや再インストールをまたいで保持されます。リモート MCP エンドポイントは HTTPS を使用する必要があります。ただし、ループバック HTTP エンドポイントは例外です。

Agent Plugins v1 はパッケージ形式であり、マーケットプレイス統合ではありません。Qwen Code の既存の拡張機能ソースを通じてパッケージをインストールしてください。
