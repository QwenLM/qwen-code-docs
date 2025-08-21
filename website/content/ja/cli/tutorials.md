# チュートリアル

このページには、Qwen Code とやり取りするためのチュートリアルが含まれています。

## Model Context Protocol (MCP) サーバーのセットアップ

> [!CAUTION]
> サードパーティの MCP サーバーを使用する前に、そのソースを信頼できること、および提供されるツールを理解していることを確認してください。サードパーティ サーバーの使用は自己責任となります。

このチュートリアルでは、[GitHub MCP サーバー](https://github.com/github/github-mcp-server)を例に、MCP サーバーのセットアップ方法を説明します。GitHub MCP サーバーは、GitHub リポジトリとやり取りするためのツールを提供します。たとえば、Issue の作成やプルリクエストへのコメントなどが可能です。

### 前提条件

開始する前に、以下のソフトウェアがインストールされ、設定されていることを確認してください：

- **Docker:** [Docker] をインストールし、実行してください。
- **GitHub Personal Access Token (PAT):** 必要なスコープを持つ新しい [classic] または [fine-grained] PAT を作成してください。

[Docker]: https://www.docker.com/  
[classic]: https://github.com/settings/tokens/new  
[fine-grained]: https://github.com/settings/personal-access-tokens/new  

### ガイド

#### `settings.json` で MCP サーバーを設定する

プロジェクトのルートディレクトリにある [`.qwen/settings.json` ファイル](./configuration.md) を作成または開きます。ファイル内に `mcpServers` 設定ブロックを追加し、GitHub MCP サーバーを起動するための手順を記述します。

```json
{
  "mcpServers": {
    "github": {
      "command": "docker",
      "args": [
        "run",
        " -i",
        "--rm",
        "-e",
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

#### GitHub token の設定

> [!CAUTION]
> 個人およびプライベートリポジトリへのアクセス権を持つ、広範囲なスコープの personal access token (PAT) を使用すると、プライベートリポジトリの情報がパブリックリポジトリに漏洩する可能性があります。パブリックとプライベートの両方のリポジトリへのアクセスを共有しない、fine-grained access token の使用を推奨します。

環境変数を使用して GitHub PAT を保存します：

```bash
GITHUB_PERSONAL_ACCESS_TOKEN="pat_YourActualGitHubTokenHere"
```

Qwen Code は、`settings.json` ファイルで定義した `mcpServers` 設定内でこの値を使用します。

#### Qwen Code の起動と接続確認

Qwen Code を起動すると、自動的に設定を読み込み、バックグラウンドで GitHub MCP サーバーを起動します。その後、自然言語のプロンプトを使用して、Qwen Code に GitHub アクションの実行を依頼できます。例：

```bash
"get all open issues assigned to me in the 'foo/bar' repo and prioritize them"
```