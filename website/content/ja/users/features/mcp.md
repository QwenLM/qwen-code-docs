# MCP を介して Qwen Code をツールに接続する

Qwen Code は、[Model Context Protocol (MCP)](https://modelcontextprotocol.io/introduction) を介して外部ツールやデータソースに接続できます。MCP サーバーにより、Qwen Code はあなたのツール、データベース、API にアクセスできるようになります。

## MCP でできること

MCP サーバーを接続すると、Qwen Code に以下の操作を依頼できます：

- ファイルやリポジトリの操作（有効にするツールに応じて読み取り/検索/書き込み）
- データベースのクエリ実行（スキーマ確認、クエリ、レポート作成）
- 内部サービスの統合（API を MCP ツールとしてラップ）
- ワークフローの自動化（ツール/プロンプトとして公開された反復タスク）

> [!tip]
>
> 「まず最初に実行するコマンド」をお探しの方は、[クイックスタート](#quick-start) に進んでください。

## クイックスタート

Qwen Code は `settings.json` 内の `mcpServers` から MCP サーバーを読み込みます。サーバーの設定は、以下のいずれかの方法で行えます：

- `settings.json` を直接編集する
- `qwen mcp` コマンドを使用する（[CLI リファレンス](#qwen-mcp-cli) を参照）

### 最初のサーバーを追加する

1. サーバーを追加します（例：リモート HTTP MCP サーバー）：

```bash
qwen mcp add --transport http my-server http://localhost:3000/mcp
```

2. MCP 管理ダイアログを開き、サーバーの確認と管理を行います：

```bash
qwen mcp
```

3. 同じプロジェクトで Qwen Code を再起動します（まだ起動していない場合は起動）。その後、モデルにそのサーバーのツールを使用するよう指示してください。

## 設定の保存場所（スコープ）

ほとんどのユーザーは、以下の 2 つのスコープのみが必要です：

- **プロジェクトスコープ（デフォルト）**：プロジェクトルートの `.qwen/settings.json`
- **ユーザースコープ**：マシン上の全プロジェクトに適用される `~/.qwen/settings.json`

ユーザースコープに書き込む場合：

```bash
qwen mcp add --scope user --transport http my-server http://localhost:3000/mcp
```

> [!tip]
>
> 高度な設定レイヤー（システムデフォルト/システム設定と優先順位ルール）については、[設定](../configuration/settings) を参照してください。

## サーバーの設定

### トランスポートの選択

| トランスポート | 使用場面 | JSON フィールド |
| --------- | ----------------------------------------------------------------- | ------------------------------------------- |
| `http`    | リモートサービスに推奨。クラウド MCP サーバーで良好に動作 | `httpUrl`（オプションで `headers`）            |
| `sse`     | Server-Sent Events のみをサポートするレガシー/非推奨サーバー    | `url`（オプションで `headers`）                |
| `stdio`   | マシン上のローカルプロセス（スクリプト、CLI、Docker）             | `command`, `args`（オプションで `cwd`, `env`） |

> [!note]
>
> サーバーが両方をサポートしている場合は、**SSE** より **HTTP** を優先してください。

### `settings.json` と `qwen mcp add` による設定

どちらのアプローチでも `settings.json` に同じ `mcpServers` エントリが生成されます。お好みの方法を使用してください。

#### Stdio サーバー（ローカルプロセス）

JSON（`.qwen/settings.json`）：

```json
{
  "mcpServers": {
    "pythonTools": {
      "command": "python",
      "args": ["-m", "my_mcp_server", "--port", "8080"],
      "cwd": "./mcp-servers/python",
      "env": {
        "DATABASE_URL": "$DB_CONNECTION_STRING",
        "API_KEY": "${EXTERNAL_API_KEY}"
      },
      "timeout": 15000
    }
  }
}
```

CLI（デフォルトでプロジェクトスコープに書き込み）：

```bash
qwen mcp add pythonTools -e DATABASE_URL=$DB_CONNECTION_STRING -e API_KEY=$EXTERNAL_API_KEY \
  --timeout 15000 python -m my_mcp_server --port 8080
```

#### HTTP サーバー（リモートストリーミング HTTP）

JSON：

```json
{
  "mcpServers": {
    "httpServerWithAuth": {
      "httpUrl": "http://localhost:3000/mcp",
      "headers": {
        "Authorization": "Bearer your-api-token"
      },
      "timeout": 5000
    }
  }
}
```

CLI：

```bash
qwen mcp add --transport http httpServerWithAuth http://localhost:3000/mcp \
  --header "Authorization: Bearer your-api-token" --timeout 5000
```

#### SSE サーバー（リモート Server-Sent Events）

JSON：

```json
{
  "mcpServers": {
    "sseServer": {
      "url": "http://localhost:8080/sse",
      "timeout": 30000
    }
  }
}
```

CLI：

```bash
qwen mcp add --transport sse sseServer http://localhost:8080/sse --timeout 30000
```

## 安全性と制御

### 信頼（確認のスキップ）

- **サーバーの信頼**（`trust: true`）：そのサーバーに対する確認プロンプトをバイパスします（使用は最小限に留めてください）。

### ツールのフィルタリング（サーバーごとの許可/拒否）

`includeTools` / `excludeTools` を使用して、サーバーが公開するツールを制限します（Qwen Code からの視点）。

例：一部のツールのみを許可する場合：

```json
{
  "mcpServers": {
    "filteredServer": {
      "command": "python",
      "args": ["-m", "my_mcp_server"],
      "includeTools": ["safe_tool", "file_reader", "data_processor"],
      "timeout": 30000
    }
  }
}
```

### グローバルな許可/拒否リスト

`settings.json` 内の `mcp` オブジェクトは、すべての MCP サーバーに対するグローバルルールを定義します：

- `mcp.allowed`：許可する MCP サーバー名のリスト（`mcpServers` のキー）
- `mcp.excluded`：拒否する MCP サーバー名のリスト

例：

```json
{
  "mcp": {
    "allowed": ["my-trusted-server"],
    "excluded": ["experimental-server"]
  }
}
```

## トラブルシューティング

- **`qwen mcp list` でサーバーが「Disconnected」を表示する場合**：URL/コマンドが正しいか確認し、`timeout` を増やしてください。
- **Stdio サーバーが起動に失敗する場合**：絶対パスの `command` を使用し、`cwd`/`env` を再確認してください。
- **JSON 内の環境変数が解決されない場合**：Qwen Code が実行される環境に変数が存在することを確認してください（シェル環境と GUI アプリ環境は異なる場合があります）。

## リファレンス

### `settings.json` の構造

#### サーバー固有の設定（`mcpServers`）

`settings.json` ファイルに `mcpServers` オブジェクトを追加します：

```json
// ... file contains other config objects
{
  "mcpServers": {
    "serverName": {
      "command": "path/to/server",
      "args": ["--arg1", "value1"],
      "env": {
        "API_KEY": "$MY_API_TOKEN"
      },
      "cwd": "./server-directory",
      "timeout": 30000,
      "trust": false
    }
  }
}
```

設定プロパティ：

必須（以下のいずれか）：

| プロパティ  | 説明                                            |
| --------- | ------------------------------------------------------ |
| `command` | Stdio トランスポート用の実行ファイルへのパス             |
| `url`     | SSE エンドポイント URL（例：`"http://localhost:8080/sse"`） |
| `httpUrl` | HTTP ストリーミングエンドポイント URL                            |

オプション：

| プロパティ               | 型/デフォルト値                 | 説明                                                                                                                                                                                                                                                       |
| ---------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `args`                 | 配列                        | Stdio トランスポートのコマンドライン引数                                                                                                                                                                                                                        |
| `headers`              | オブジェクト                       | `url` または `httpUrl` を使用する場合のカスタム HTTP ヘッダー                                                                                                                                                                                                                 |
| `env`                  | オブジェクト                       | サーバープロセスの環境変数。値は `$VAR_NAME` または `${VAR_NAME}` 構文を使用して環境変数を参照できます                                                                                                                                |
| `cwd`                  | 文字列                       | Stdio トランスポートの作業ディレクトリ                                                                                                                                                                                                                             |
| `timeout`              | 数値<br>（デフォルト：600,000） | リクエストのタイムアウト（ミリ秒単位）（デフォルト：600,000ms = 10 分）                                                                                                                                                                                                 |
| `trust`                | ブール値<br>（デフォルト：false）  | `true` の場合、このサーバーのすべてのツール呼び出し確認をバイパスします（デフォルト：`false`）                                                                                                                                                                              |
| `includeTools`         | 配列                        | この MCP サーバーから含めるツール名のリスト。指定した場合、このサーバーから利用可能なツールはここにリストされたもののみになります（許可リスト動作）。指定しない場合、デフォルトでサーバーのすべてのツールが有効になります。                                       |
| `excludeTools`         | 配列                        | この MCP サーバーから除外するツール名のリスト。ここにリストされたツールは、サーバーによって公開されていてもモデルからは利用できなくなります。<br>注：`excludeTools` は `includeTools` より優先されます。ツールが両方のリストに含まれている場合、除外されます。 |
| `targetAudience`       | 文字列                       | アクセスしようとしている IAP 保護アプリケーションで許可リストに登録されている OAuth クライアント ID。`authProviderType: 'service_account_impersonation'` と組み合わせて使用します。                                                                                                         |
| `targetServiceAccount` | 文字列                       | なりすます Google Cloud サービス アカウントのメールアドレス。`authProviderType: 'service_account_impersonation'` と組み合わせて使用します。                                                                                                                              |

<a id="qwen-mcp-cli"></a>

### `qwen mcp` による MCP サーバーの管理

`settings.json` を手動で編集して MCP サーバーを設定することも常に可能ですが、CLI の方が通常は高速です。

#### サーバーの追加（`qwen mcp add`）

```bash
qwen mcp add [options] <name> <commandOrUrl> [args...]
```

| 引数/オプション     | 説明                                                         | デフォルト            | 例                                   |
| ------------------- | ------------------------------------------------------------------- | ------------------ | ----------------------------------------- |
| `<name>`            | サーバーの一意の名前。                                       | —                  | `example-server`                          |
| `<commandOrUrl>`    | 実行するコマンド（`stdio` 用）または URL（`http`/`sse` 用）。 | —                  | `/usr/bin/python` または `http://localhost:8` |
| `[args...]`         | `stdio` コマンドのオプション引数。                           | —                  | `--port 5000`                             |
| `-s`, `--scope`     | 設定スコープ（user または project）。                              | `project`          | `-s user`                                 |
| `-t`, `--transport` | トランスポートタイプ（`stdio`、`sse`、`http`）。                            | `stdio`            | `-t sse`                                  |
| `-e`, `--env`       | 環境変数を設定します。                                          | —                  | `-e KEY=value`                            |
| `-H`, `--header`    | SSE および HTTP トランスポートの HTTP ヘッダーを設定します。                       | —                  | `-H "X-Api-Key: abc123"`                  |
| `--timeout`         | 接続タイムアウトをミリ秒単位で設定します。                             | —                  | `--timeout 30000`                         |
| `--trust`           | サーバーを信頼します（すべてのツール呼び出し確認プロンプトをバイパス）。       | —（`false`）        | `--trust`                                 |
| `--description`     | サーバーの説明を設定します。                                 | —                  | `--description "Local tools"`             |
| `--include-tools`   | 含めるツールのカンマ区切りリスト。                         | すべてのツールを含める | `--include-tools mytool,othertool`        |
| `--exclude-tools`   | 除外するツールのカンマ区切りリスト。                         | なし               | `--exclude-tools mytool`                  |

#### サーバーの削除（`qwen mcp remove`）

```bash
qwen mcp remove <name>
```