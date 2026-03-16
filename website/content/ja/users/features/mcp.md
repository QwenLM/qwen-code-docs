# MCP を介して Qwen Code をツールに接続する

Qwen Code は、[Model Context Protocol (MCP)](https://modelcontextprotocol.io/introduction) を通じて外部ツールおよびデータソースに接続できます。MCP サーバーを設定することで、Qwen Code はユーザーのツール、データベース、API にアクセスできるようになります。

## MCP を使ってできること

MCP サーバーを接続すると、Qwen Code に対して以下のようなタスクを指示できます：

- ファイルおよびリポジトリの操作（読み取り／検索／書き込み — 有効化したツールによって機能が異なります）
- データベースへのクエリ実行（スキーマの確認、クエリ実行、レポート生成）
- 内部サービスとの統合（自社 API を MCP ツールとしてラップ）
- ワークフローの自動化（ツールまたはプロンプトとして公開された反復可能なタスク）

> [!tip]
>
> 「すぐに始められるコマンドひとつ」をお探しの場合、「クイックスタート」へ進んでください。

## クイックスタート

Qwen Code は `settings.json` の `mcpServers` 設定から MCP サーバーを読み込みます。サーバーの設定は以下のいずれかの方法で行えます：

- `settings.json` を直接編集
- `qwen mcp` コマンドを使用（[CLI リファレンス](#qwen-mcp-cli) を参照）

### 最初のサーバーを追加する

1. サーバーを追加します（例：リモート HTTP MCP サーバー）：

```bash
qwen mcp add --transport http my-server http://localhost:3000/mcp
```

2. MCP 管理ダイアログを開き、サーバーを表示および管理します：

```bash
qwen mcp
```

3. 同じプロジェクトで Qwen Code を再起動します（または、まだ実行されていない場合は起動します）。その後、モデルにそのサーバーからツールを使用するよう指示します。

## 設定の保存場所（スコープ）

ほとんどのユーザーは以下の 2 つのスコープのみを必要とします：

- **プロジェクトスコープ（デフォルト）**: プロジェクトのルートディレクトリにある `.qwen/settings.json`
- **ユーザースコープ**: マシン上のすべてのプロジェクトにわたって有効な `~/.qwen/settings.json`

ユーザースコープに書き込むには：

```bash
qwen mcp add --scope user --transport http my-server http://localhost:3000/mcp
```

> [!tip]
>
> 詳細な設定レイヤー（システムデフォルト／システム設定および優先順位ルール）については、「[設定](../configuration/settings)」を参照してください。

## サーバーの設定

### トランスポートの選択

| トランスポート | 使用するタイミング                                               | JSON フィールド                             |
| -------------- | ---------------------------------------------------------------- | ------------------------------------------- |
| `http`         | リモートサービス向けに推奨。クラウド MCP サーバーとの連携に最適 | `httpUrl`（+ オプションで `headers`）       |
| `sse`          | サーバー・センテッド・イベント (SSE) のみをサポートする旧式／非推奨サーバー | `url`（+ オプションで `headers`）           |
| `stdio`        | ローカルマシン上のプロセス（スクリプト、CLI、Docker など）     | `command`、`args`（+ オプションで `cwd`、`env`） |

> [!note]
>
> サーバーが両方をサポートしている場合、**SSE** よりも **HTTP** を優先してください。

### `settings.json` による設定 vs `qwen mcp add` コマンドによる設定

どちらの方法でも、最終的に `settings.json` 内に同じ `mcpServers` エントリが生成されます。お好みの方をお使いください。

#### 標準入出力サーバー（ローカルプロセス）

JSON（`.qwen/settings.json`）:

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

CLI（デフォルトではプロジェクトスコープに書き込みます）:

```bash
qwen mcp add pythonTools -e DATABASE_URL=$DB_CONNECTION_STRING -e API_KEY=$EXTERNAL_API_KEY \
  --timeout 15000 python -m my_mcp_server --port 8080
```

#### HTTP サーバー（リモートでストリーミング可能な HTTP）

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

#### SSE サーバー（リモートの Server-Sent Events）

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

- **サーバーの信頼** (`trust: true`)：そのサーバーに対する確認プロンプトをバイパスします（慎重に使用してください）。

### ツールのフィルタリング（サーバーごとのツールの許可／拒否）

`includeTools`／`excludeTools` を使用して、サーバーが公開するツールを制限します（Qwen Code の視点から）。

例：特定の少数のツールのみを許可する場合：

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

### グローバルな許可／拒否リスト

`settings.json` 内の `mcp` オブジェクトは、すべての MCP サーバーに適用されるグローバルなルールを定義します。

- `mcp.allowed`: 許可する MCP サーバー名のリスト（`mcpServers` 内のキー）
- `mcp.excluded`: 拒否する MCP サーバー名のリスト

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

- **`qwen mcp list` でサーバーが「切断済み」と表示される**: URL/コマンドが正しいか確認し、その後 `timeout` を増加させます。
- **Stdio サーバーが起動しない**: `command` には絶対パスを使用し、`cwd` および `env` を再確認します。
- **JSON 内の環境変数が解決されない**: 環境変数が Qwen Code が実行される環境（シェルと GUI アプリケーションの環境では異なる場合があります）に存在することを確認します。

## 参照

### `settings.json` の構造

#### サーバー固有の設定（`mcpServers`）

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

必須（以下のいずれか 1 つ）：

| プロパティ  | 説明                                                  |
| ----------- | ----------------------------------------------------- |
| `command`   | Stdio トランスポート用実行可能ファイルへのパス         |
| `url`       | SSE エンドポイント URL（例：`"http://localhost:8080/sse"`） |
| `httpUrl`   | HTTP ストリーミング エンドポイント URL                |

任意：

| プロパティ               | 型／デフォルト                 | 説明                                                                                                                                                                                                                                                              |
| ------------------------ | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `args`                   | 配列                           | Stdio トランスポート用のコマンドライン引数                                                                                                                                                                                                                        |
| `headers`                | オブジェクト                     | `url` または `httpUrl` を使用する際のカスタム HTTP ヘッダー                                                                                                                                                                                                       |
| `env`                    | オブジェクト                     | サーバープロセスの環境変数。値には `$VAR_NAME` または `${VAR_NAME}` 構文で環境変数を参照できます                                                                                                                                                                   |
| `cwd`                    | 文字列                         | Stdio トランスポート用の作業ディレクトリ                                                                                                                                                                                                                          |
| `timeout`                | 数値<br>（デフォルト：600,000） | リクエストタイムアウト（ミリ秒単位）。デフォルトは 600,000ms（10 分）です。                                                                                                                                                                                       |
| `trust`                  | 真偽値<br>（デフォルト：false） | `true` の場合、このサーバーに対するすべてのツール呼び出し確認をバイパスします（デフォルト：`false`）                                                                                                                                                              |
| `includeTools`           | 配列                           | この MCP サーバーから含めるツール名のリスト。指定した場合、このサーバーから利用可能なのはリストに記載されたツールのみになります（ホワイトリスト方式）。未指定の場合は、サーバーから提供されるすべてのツールがデフォルトで有効になります。                                      |
| `excludeTools`           | 配列                           | この MCP サーバーから除外するツール名のリスト。このリストに記載されたツールは、サーバー側で公開されていてもモデルから利用できません。<br>注：`excludeTools` は `includeTools` より優先されます。ツール名が両方のリストに含まれている場合、そのツールは除外されます。 |
| `targetAudience`         | 文字列                         | アクセスしようとしている IAP 保護アプリケーション上で許可されている OAuth クライアント ID。`authProviderType: 'service_account_impersonation'` と併用します。                                                                                                    |
| `targetServiceAccount`   | 文字列                         | なりすましを行う Google Cloud サービス アカウントのメールアドレス。`authProviderType: 'service_account_impersonation'` と併用します。                                                                                                                             |

<a id="qwen-mcp-cli"></a>

### `qwen mcp` を使用して MCP サーバーを管理する

MCP サーバーは常に `settings.json` を手動で編集することで設定できますが、CLI を使用する方が通常は速いです。

#### サーバーの追加 (`qwen mcp add`)

```bash
qwen mcp add [オプション] <名前> <コマンドまたはURL> [引数...]
```

| 引数／オプション     | 説明                                                                 | デフォルト値       | 例                                       |
| -------------------- | -------------------------------------------------------------------- | ------------------ | ---------------------------------------- |
| `<名前>`             | サーバーの固有の名前。                                               | —                  | `example-server`                         |
| `<コマンドまたはURL>` | 実行するコマンド（`stdio` の場合）または URL（`http`／`sse` の場合）。 | —                  | `/usr/bin/python` または `http://localhost:8` |
| `[引数...]`          | `stdio` コマンドに対する任意の引数。                                 | —                  | `--port 5000`                            |
| `-s`, `--scope`      | 設定スコープ（ユーザーまたはプロジェクト）。                         | `project`          | `-s user`                                |
| `-t`, `--transport`  | トランスポートタイプ（`stdio`、`sse`、`http`）。                      | `stdio`            | `-t sse`                                 |
| `-e`, `--env`        | 環境変数を設定します。                                               | —                  | `-e KEY=value`                           |
| `-H`, `--header`     | SSE および HTTP トランスポート用の HTTP ヘッダーを設定します。        | —                  | `-H "X-Api-Key: abc123"`                 |
| `--timeout`          | 接続タイムアウト（ミリ秒単位）を設定します。                           | —                  | `--timeout 30000`                        |
| `--trust`            | サーバーを信頼する（すべてのツール呼び出し確認プロンプトをバイパス）。 | — (`false`)        | `--trust`                                |
| `--description`      | サーバーの説明を設定します。                                         | —                  | `--description "ローカルツール"`         |
| `--include-tools`    | 含めるツールのカンマ区切りリスト。                                   | すべてのツールが含まれる | `--include-tools mytool,othertool`       |
| `--exclude-tools`    | 除外するツールのカンマ区切りリスト。                                 | なし               | `--exclude-tools mytool`                 |

#### サーバーの削除 (`qwen mcp remove`)

```bash
qwen mcp remove <name>
```