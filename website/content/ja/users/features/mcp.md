# MCP を通じて Qwen Code をツールに接続する

Qwen Code は、[Model Context Protocol (MCP)](https://modelcontextprotocol.io/introduction) を介して外部のツールやデータソースに接続できます。MCP サーバーにより、Qwen Code はあなたのツール、データベース、API にアクセスできるようになります。

## MCP でできること

MCP サーバーを接続すると、Qwen Code に以下のようなことを依頼できます：

- ファイルやリポジトリの操作（読み取り／検索／書き込み、有効化したツールによる）
- データベースへのクエリ発行（スキーマ確認、クエリ実行、レポート作成）
- 社内サービスとの統合（API を MCP ツールとしてラップ）
- ワークフローの自動化（ツール／プロンプトとして公開された繰り返し可能なタスク）

> [!tip]
> 「1 コマンドで始める」方法を探している場合は、[クイックスタート](#クイックスタート)に進んでください。

## クイックスタート

Qwen Code は `settings.json` の `mcpServers` から MCP サーバーを読み込みます。サーバーの設定方法は次のいずれかです：

- `settings.json` を直接編集する
- `qwen mcp` コマンドを使用する（[CLI リファレンス](#qwen-mcp-cli)を参照）

### 最初のサーバーを追加する

1. サーバーを追加します（例：リモートHTTP MCPサーバー）：

```bash
qwen mcp add --transport http my-server http://localhost:3000/mcp
```

2. 正しく表示されることを確認します：

```bash
qwen mcp list
```

3. 同じプロジェクトでQwen Codeを再起動するか（またはまだ実行されていない場合は起動し）、その後モデルにそのサーバーからのツールを使用するよう指示してください。

## 設定が保存される場所（スコープ）

ほとんどのユーザーは以下の2つのスコープのみを使用します：

- **プロジェクトスコープ（デフォルト）**：プロジェクトルートにある `.qwen/settings.json`
- **ユーザースコープ**：マシン上のすべてのプロジェクトで共有される `~/.qwen/settings.json`

ユーザースコープに書き込む場合：

```bash
qwen mcp add --scope user --transport http my-server http://localhost:3000/mcp
```

> [!tip]
> 高度な設定レイヤー（システムデフォルト／システム設定および優先順位ルール）については、[Settings](../users/configuration/settings) を参照してください。

## サーバーの設定

### トランスポートの選択

| トランスポート | 使用するタイミング                                                     | JSON フィールド                                  |
| -------------- | ---------------------------------------------------------------------- | ------------------------------------------------ |
| `http`         | リモートサービスに推奨；クラウド MCP サーバーで良好に動作します        | `httpUrl`（+ オプションの `headers`）            |
| `sse`          | Server-Sent Events のみをサポートするレガシー／非推奨サーバー          | `url`（+ オプションの `headers`）                |
| `stdio`        | ローカルプロセス（スクリプト、CLI、Docker）                           | `command`、`args`（+ オプションの `cwd`、`env`） |

> [!note]
> サーバーが両方をサポートしている場合、**SSE** よりも **HTTP** を優先してください。

### `settings.json` と `qwen mcp add` による設定

どちらの方法でも、`settings.json` 内の `mcpServers` エントリは同じになります。お好みの方法をお使いください。

#### Stdio サーバー（ローカルプロセス）

JSON (`.qwen/settings.json`):

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

CLI（デフォルトではプロジェクトスコープに書き込み）:

```bash
qwen mcp add pythonTools -e DATABASE_URL=$DB_CONNECTION_STRING -e API_KEY=$EXTERNAL_API_KEY \
  --timeout 15000 python -m my_mcp_server --port 8080
```

#### HTTPサーバー（リモートストリーミングHTTP）

JSON:

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

CLI:

```bash
qwen mcp add --transport http httpServerWithAuth http://localhost:3000/mcp \
  --header "Authorization: Bearer your-api-token" --timeout 5000
```

#### SSEサーバー（リモートServer-Sent Events）

JSON:

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

CLI:

```bash
qwen mcp add --transport sse sseServer http://localhost:8080/sse --timeout 30000
```

## セキュリティと制御

### 信頼（確認プロンプトをスキップ）

- **サーバー信頼** (`trust: true`): そのサーバーに対する確認プロンプトをバイパスします（控えめに使用してください）。

### ツールフィルタリング（サーバーごとの許可・拒否ツール）

`includeTools` / `excludeTools` を使用して、サーバーが公開するツールを制限します（Qwen Code の観点から）。

例：いくつかのツールのみを含める場合

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

### グローバルな許可・拒否リスト

`settings.json` 内の `mcp` オブジェクトは、すべての MCP サーバーに対するグローバルなルールを定義します：

- `mcp.allowed`: 許可された MCP サーバー名のリスト（`mcpServers` 内のキー）
- `mcp.excluded`: 拒否された MCP サーバー名のリスト

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

- **`qwen mcp list`でサーバーが「Disconnected」を表示する場合**: URL/コマンドが正しいことを確認し、`timeout`を増やしてください。
- **Stdioサーバーの起動に失敗する場合**: 絶対パスで`command`を指定し、`cwd`/`env`を再度確認してください。
- **JSON内の環境変数が解決されない場合**: Qwen Codeを実行している環境にそれらの変数が存在することを確認してください（シェルとGUIアプリの環境は異なる場合があります）。

## リファレンス

### `settings.json`の構造

#### サーバー固有の設定 (`mcpServers`)

`settings.json` ファイルに `mcpServers` オブジェクトを追加します：

```json
// ... 他の設定オブジェクトを含むファイル
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

必須（以下のいずれか1つ）：

| プロパティ | 説明                                               |
| ---------- | -------------------------------------------------- |
| `command`  | Stdio トランスポート用の実行可能ファイルのパス     |
| `url`      | SSE エンドポイント URL（例：`"http://localhost:8080/sse"`） |
| `httpUrl`  | HTTP ストリーミング エンドポイント URL             |

任意：

| プロパティ             | 型/デフォルト値               | 説明                                                                                                                                                                                                                                                           |
| ---------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `args`                 | 配列                          | Stdio トランスポート用のコマンドライン引数                                                                                                                                                                                                                     |
| `headers`              | オブジェクト                  | `url` または `httpUrl` 使用時のカスタム HTTP ヘッダー                                                                                                                                                                                                           |
| `env`                  | オブジェクト                  | サーバープロセスの環境変数。値には `$VAR_NAME` または `${VAR_NAME}` 構文を使用して、他の環境変数を参照できます                                                                                                                                                 |
| `cwd`                  | 文字列                        | Stdio トランスポートの作業ディレクトリ                                                                                                                                                                                                                         |
| `timeout`              | 数値<br>（デフォルト：600,000）| リクエストタイムアウト（ミリ秒単位）。デフォルトは 600,000ms（=10分）                                                                                                                                                                                          |
| `trust`                | 真偽値<br>（デフォルト：false）| `true` の場合、このサーバーに対するすべてのツール呼び出し確認をバイパスします（デフォルト：`false`）                                                                                                                                                           |
| `includeTools`         | 配列                          | この MCP サーバーからインクルードするツール名のリスト。指定された場合、ここにリストされたツールのみがこのサーバーから利用可能になります（許可リストの動作）。指定しない場合、サーバーからのすべてのツールがデフォルトで有効になります。                         |
| `excludeTools`         | 配列                          | この MCP サーバーから除外するツール名のリスト。ここにリストされたツールは、サーバーによって公開されていてもモデルからは利用できなくなります。<br>注：`excludeTools` は `includeTools` よりも優先されます。両方のリストに同じツールがある場合は除外されます。 |
| `targetAudience`       | 文字列                        | アクセスしようとしている IAP 保護アプリケーションで許可リストに登録された OAuth クライアント ID。`authProviderType: 'service_account_impersonation'` と共に使用します。                                                                                      |
| `targetServiceAccount` | 文字列                        | 権限を借用する Google Cloud サービスアカウントのメールアドレス。`authProviderType: 'service_account_impersonation'` と共に使用します。                                                                                                                       |

<a id="qwen-mcp-cli"></a>

### `qwen mcp` で MCP サーバーを管理する

MCP サーバーは常に `settings.json` を手動で編集して設定できますが、CLI の方が通常はより高速です。

#### サーバーの追加 (`qwen mcp add`)

```bash
qwen mcp add [options] <name> <commandOrUrl> [args...]
```

| 引数/オプション     | 説明                                                             | デフォルト         | 例                                           |
| ------------------- | ---------------------------------------------------------------- | ------------------ | -------------------------------------------- |
| `<name>`            | サーバーの一意の名前。                                             | —                  | `example-server`                             |
| `<commandOrUrl>`    | 実行するコマンド（`stdio`用）またはURL（`http`/`sse`用）。         | —                  | `/usr/bin/python` または `http://localhost:8` |
| `[args...]`         | `stdio` コマンド用のオプション引数。                               | —                  | `--port 5000`                                |
| `-s`, `--scope`     | 設定スコープ（ユーザーまたはプロジェクト）。                        | `project`          | `-s user`                                    |
| `-t`, `--transport` | 通信タイプ（`stdio`、`sse`、`http`）。                             | `stdio`            | `-t sse`                                     |
| `-e`, `--env`       | 環境変数を設定します。                                              | —                  | `-e KEY=value`                               |
| `-H`, `--header`    | SSEおよびHTTP通信で使用するHTTPヘッダーを設定します。                | —                  | `-H "X-Api-Key: abc123"`                     |
| `--timeout`         | 接続タイムアウトをミリ秒単位で設定します。                          | —                  | `--timeout 30000`                            |
| `--trust`           | サーバーを信頼する（すべてのツール呼び出し確認プロンプトをバイパス）。 | — (`false`)        | `--trust`                                    |
| `--description`     | サーバーの説明を設定します。                                        | —                  | `--description "Local tools"`                |
| `--include-tools`   | 含めるツールのカンマ区切りリスト。                                  | 全ツールが含まれる | `--include-tools mytool,othertool`           |
| `--exclude-tools`   | 除外するツールのカンマ区切りリスト。                                | なし               | `--exclude-tools mytool`                     |

#### サーバーの一覧表示 (`qwen mcp list`)

```bash
qwen mcp list
```

#### サーバーの削除 (`qwen mcp remove`)

```bash
qwen mcp remove <name>
```