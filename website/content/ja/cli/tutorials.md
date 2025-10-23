# チュートリアル

このページには、Qwen Code とやり取りするためのチュートリアルが含まれています。

## Model Context Protocol (MCP) サーバーのセットアップ

> [!CAUTION]
> サードパーティの MCP サーバーを使用する前に、そのソースを信頼できること、および提供されるツールを理解していることを確認してください。サードパーティ サーバーの使用は自己責任となります。

このチュートリアルでは、[GitHub MCP サーバー](https://github.com/github/github-mcp-server) を例に、MCP サーバーのセットアップ方法を説明します。GitHub MCP サーバーは、GitHub リポジトリとやり取りするためのツールを提供します。たとえば、Issue の作成やプルリクエストへのコメントなどです。

### 前提条件

開始する前に、以下がインストールおよび設定されていることを確認してください。

- **Docker:** [Docker] をインストールして実行します。
- **GitHub Personal Access Token (PAT):** 必要なスコープを持つ新しい [classic] または [fine-grained] PAT を作成します。

[Docker]: https://www.docker.com/
[classic]: https://github.com/settings/tokens/new
[fine-grained]: https://github.com/settings/personal-access-tokens/new

### ガイド

#### `settings.json` で MCP サーバーを設定する

プロジェクトのルートディレクトリにある [`.qwen/settings.json` ファイル](./configuration.md) を作成または開きます。ファイル内に `mcpServers` 設定ブロックを追加し、GitHub MCP サーバーの起動方法を指定します。

```json
{
  "mcpServers": {
    "github": {
      "command": "docker",
      "args": [
        "run",
        "−i",
        "−−rm",
        "−e",
        "GITHUB_PERSONAL_ACCESS_TOKEN",
        "ghcr.io/github/github-mcp-server"
      ],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_PERSONAL_ACCESS_TOKEN}"
      }
    }
  }
}
```

#### GitHub トークンの設定

> [!CAUTION]
> 個人用および非公開リポジトリへのアクセス権を持つ、広範囲なスコープの Personal Access Token (PAT) を使用すると、非公開リポジトリからの情報が公開リポジトリへ漏洩する可能性があります。公開・非公開両方のリポジトリへのアクセスを共有しない、細かなスコープを持つアクセストークンの利用を推奨します。

環境変数を使って GitHub PAT を保存してください：

```bash
GITHUB_PERSONAL_ACCESS_TOKEN="pat_YourActualGitHubTokenHere"
```

Qwen Code は、この値を `settings.json` ファイルで定義した `mcpServers` 設定内で使用します。

#### Qwen Code の起動と接続確認

Qwen Code を起動すると、自動的に設定を読み込み、バックグラウンドで GitHub MCP サーバーを起動します。その後、自然言語のプロンプトを使って、Qwen Code に GitHub アクションを実行させることができます。例：

```bash
"repo 'foo/bar' で自分にアサインされたすべてのオープン状態の issue を取得して、優先順位をつけて"
```