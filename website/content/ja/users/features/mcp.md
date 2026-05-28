---
description: "MCP で Qwen Code をデータベース、API、Google Drive、Jira、Figma などに接続し、AI コーディングの文脈と自動化を拡張します。"
---

# MCP を介して Qwen Code をツールに接続する

Qwen Code は [Model Context Protocol (MCP)](https://modelcontextprotocol.io/introduction) を介して外部ツールやデータソースに接続できます。MCP サーバーにより、Qwen Code はあなたのツール、データベース、API にアクセスできるようになります。

## MCP でできること

MCP サーバーを接続すると、Qwen Code に対して以下の操作を依頼できます：

- ファイルやリポジトリの操作（有効にするツールに応じて読み取り/検索/書き込み）
- データベースのクエリ実行（スキーマ検査、クエリ、レポート作成）
- 内部サービスの統合（API を MCP ツールとしてラップ）
- ワークフローの自動化（ツール/プロンプトとして公開された反復タスク）

> [!tip]
>
> 「まず最初に実行するコマンド」をお探しの方は、[クイックスタート](#quick-start) に進んでください。

## クイックスタート

Qwen Code は `settings.json` 内の `mcpServers` から MCP サーバーを読み込みます。サーバーの設定は以下のいずれかの方法で行えます：

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

3. 同じプロジェクトで Qwen Code を再起動します（まだ起動していない場合は起動）。その後、モデルに対してそのサーバーのツールを使用するよう指示してください。

## 設定の保存場所（スコープ）

ほとんどのユーザーは以下の 2 つのスコープのみが必要です：

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

| トランスポート | 使用すべき場合 | JSON フィールド |
| --------- | ----------------------------------------------------------------- | ------------------------------------------- |
| `http`    | リモートサービスに推奨。クラウド MCP サーバーで良好に動作 | `httpUrl`（オプションで `headers`）            |
| `sse`     | Server-Sent Events のみをサポートするレガシー/非推奨サーバー    | `url`（オプションで `headers`）                |
| `stdio`   | マシン上のローカルプロセス（スクリプト、CLI、Docker）             | `command`、`args`（オプションで `cwd`、`env`） |

> [!note]
>
> サーバーが両方をサポートしている場合は、**SSE** より **HTTP** を優先してください。

### `settings.json` と `qwen mcp add` による設定

どちらのアプローチでも `settings.json` に同じ `mcpServers` エントリが作成されます。使いやすい方を選択してください。

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

## セキュリティと制御

### 信頼（確認のスキップ）

- **サーバー信頼**（`trust: true`）：そのサーバーに対する確認プロンプトをバイパスします（使用は最小限に留めてください）。

### OAuth 認証

Qwen Code は MCP サーバー向けの OAuth 2.0 認証をサポートしています。認証が必要なリモートサーバーにアクセスする際に便利です。

#### 基本的な使い方

OAuth 認証情報付きで MCP サーバーを追加すると、Qwen Code が認証フローを自動的に処理します：

```bash
qwen mcp add --transport sse oauth-server https://api.example.com/sse/ \
  --oauth-client-id your-client-id \
  --oauth-redirect-uri https://your-server.com/oauth/callback \
  --oauth-authorization-url https://provider.example.com/authorize \
  --oauth-token-url https://provider.example.com/token
```

#### 重要：リダイレクト URI の設定

OAuth フローでは、認証プロバイダーが認証コードを送信するリダイレクト URI が必要です。

- **ローカル開発**：デフォルトでは、Qwen Code は `http://localhost:7777/oauth/callback` を使用します。ローカルマシンでローカルブラウザを使用して Qwen Code を実行している場合に機能します。

- **リモート/クラウドデプロイ**：リモートサーバー、クラウド IDE、または Web ターミナルで Qwen Code を実行する場合、デフォルトの `localhost` リダイレクトは機能しません。OAuth コールバックを受信できる公開アクセス可能な URL を指すように `--oauth-redirect-uri` を設定する必要があります。

リモートサーバーの例：

```bash
qwen mcp add --transport sse remote-server https://api.example.com/sse/ \
  --oauth-redirect-uri https://your-remote-server.example.com/oauth/callback
```

#### settings.json による手動設定

`settings.json` を直接編集して OAuth を設定することもできます：

```json
{
  "mcpServers": {
    "oauthServer": {
      "url": "https://api.example.com/sse/",
      "oauth": {
        "enabled": true,
        "clientId": "your-client-id",
        "clientSecret": "your-client-secret",
        "authorizationUrl": "https://provider.example.com/authorize",
        "tokenUrl": "https://provider.example.com/token",
        "redirectUri": "https://your-server.com/oauth/callback",
        "scopes": ["read", "write"]
      }
    }
  }
}
```

OAuth 設定プロパティ：

| プロパティ           | 説明                                                                                                           |
| ------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `enabled`          | このサーバーで OAuth を有効にする（boolean）                                                                                |
| `clientId`         | OAuth クライアント識別子（string、動的登録の場合はオプション）                                                  |
| `clientSecret`     | OAuth クライアントシークレット（string、パブリッククライアントの場合はオプション）                                                             |
| `authorizationUrl` | OAuth 認可エンドポイント（string、省略した場合は自動検出）                                                     |
| `tokenUrl`         | OAuth トークンエンドポイント（string、省略した場合は自動検出）                                                             |
| `scopes`           | 必要な OAuth スコープ（string の配列）                                                                              |
| `redirectUri`      | カスタムリダイレクト URI（string）。**リモートデプロイでは必須**。デフォルトは `http://localhost:7777/oauth/callback` |
| `tokenParamName`   | SSE URL 内のトークン用クエリパラメータ名（string）                                                                  |
| `audiences`        | トークンが有効なオーディエンス（string の配列）                                                                   |

#### トークン管理

OAuth トークンは自動的に以下の処理が行われます：

- `~/.qwen/mcp-oauth-tokens.json` に**安全に保存**
- 有効期限切れ時に**更新**（リフレッシュトークンが利用可能な場合）
- 各接続試行前に**検証**

Qwen Code 内で `/mcp auth` コマンドを使用すると、OAuth 認証を対話的に管理できます。

### ツールのフィルタリング（サーバーごとのツール許可/拒否）

`includeTools` / `excludeTools` を使用して、サーバーが公開するツールを制限します（Qwen Code 側からの視点）。

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

### グローバル許可/拒否リスト

`settings.json` 内の `mcp` オブジェクトは、すべての MCP サーバーに対するグローバルルールを定義します：

- `mcp.allowed`：MCP サーバー名の許可リスト（`mcpServers` のキー）
- `mcp.excluded`：MCP サーバー名の拒否リスト

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

- **`qwen mcp list` でサーバーが「Disconnected」を表示**：URL/コマンドが正しいか確認し、`timeout` を増やしてください。
- **Stdio サーバーが起動に失敗**：`command` に絶対パスを使用し、`cwd`/`env` を再確認してください。
- **JSON 内の環境変数が解決されない**：Qwen Code が実行される環境に変数が存在することを確認してください（シェル環境と GUI アプリ環境は異なる場合があります）。

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

| プロパティ               | 型/デフォルト                 | 説明                                                                                                                                                                                                                                                       |
| ---------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `args`                 | array                        | Stdio トランスポートのコマンドライン引数                                                                                                                                                                                                                        |
| `headers`              | object                       | `url` または `httpUrl` 使用時のカスタム HTTP ヘッダー                                                                                                                                                                                                                 |
| `env`                  | object                       | サーバープロセスの環境変数。値は `$VAR_NAME` または `${VAR_NAME}` 構文を使用して環境変数を参照可能                                                                                                                                |
| `cwd`                  | string                       | Stdio トランスポートの作業ディレクトリ                                                                                                                                                                                                                             |
| `timeout`              | number<br>（デフォルト: 600,000） | リクエストタイムアウト（ミリ秒）（デフォルト: 600,000ms = 10 分）                                                                                                                                                                                                 |
| `trust`                | boolean<br>（デフォルト: false）  | `true` の場合、このサーバーのすべてのツール呼び出し確認をバイパス（デフォルト: `false`）                                                                                                                                                                              |
| `includeTools`         | array                        | この MCP サーバーから含めるツール名のリスト。指定した場合、このサーバーからリストされたツールのみが利用可能になります（許可リスト動作）。指定しない場合、デフォルトでサーバーのすべてのツールが有効になります。                                       |
| `excludeTools`         | array                        | この MCP サーバーから除外するツール名のリスト。ここにリストされたツールは、サーバーによって公開されていてもモデルからは利用できません。<br>注：`excludeTools` は `includeTools` より優先されます。ツールが両方のリストにある場合、除外されます。 |
| `targetAudience`       | string                       | アクセスしようとしている IAP 保護アプリケーションで許可リストに登録されている OAuth クライアント ID。`authProviderType: 'service_account_impersonation'` と組み合わせて使用します。                                                                                                         |
| `targetServiceAccount` | string                       | なりすます Google Cloud サービスアカウントのメールアドレス。`authProviderType: 'service_account_impersonation'` と組み合わせて使用します。                                                                                                                              |

<a id="qwen-mcp-cli"></a>

### `qwen mcp` による MCP サーバーの管理

`settings.json` を手動で編集して MCP サーバーを設定することも常に可能ですが、CLI の方が通常は高速です。

#### サーバーの追加（`qwen mcp add`）

```bash
qwen mcp add [options] <name> <commandOrUrl> [args...]
```

| 引数/オプション             | 説明                                                         | デフォルト                                | 例                                                            |
| --------------------------- | ------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------ |
| `<name>`                    | サーバーの一意の名前。                                       | —                                      | `example-server`                                                   |
| `<commandOrUrl>`            | 実行するコマンド（`stdio` 用）または URL（`http`/`sse` 用）。 | —                                      | `/usr/bin/python` または `http://localhost:8`                          |
| `[args...]`                 | `stdio` コマンドのオプション引数。                           | —                                      | `--port 5000`                                                      |
| `-s`, `--scope`             | 設定スコープ（user または project）。                              | `project`                              | `-s user`                                                          |
| `-t`, `--transport`         | トランスポートタイプ（`stdio`、`sse`、`http`）。                            | `stdio`                                | `-t sse`                                                           |
| `-e`, `--env`               | 環境変数を設定します。                                          | —                                      | `-e KEY=value`                                                     |
| `-H`, `--header`            | SSE および HTTP トランスポートの HTTP ヘッダーを設定します。                       | —                                      | `-H "X-Api-Key: abc123"`                                           |
| `--timeout`                 | 接続タイムアウトをミリ秒で設定します。                             | —                                      | `--timeout 30000`                                                  |
| `--trust`                   | サーバーを信頼します（すべてのツール呼び出し確認プロンプトをバイパス）。       | —（`false`）                            | `--trust`                                                          |
| `--description`             | サーバーの説明を設定します。                                 | —                                      | `--description "Local tools"`                                      |
| `--include-tools`           | 含めるツールのカンマ区切りリスト。                         | すべてのツールが含まれる                     | `--include-tools mytool,othertool`                                 |
| `--exclude-tools`           | 除外するツールのカンマ区切りリスト。                         | none                                   | `--exclude-tools mytool`                                           |
| `--oauth-client-id`         | MCP サーバー認証用の OAuth クライアント ID。                      | —                                      | `--oauth-client-id your-client-id`                                 |
| `--oauth-client-secret`     | MCP サーバー認証用の OAuth クライアントシークレット。                  | —                                      | `--oauth-client-secret your-client-secret`                         |
| `--oauth-redirect-uri`      | 認証コールバック用の OAuth リダイレクト URI。                     | `http://localhost:7777/oauth/callback` | `--oauth-redirect-uri https://your-server.com/oauth/callback`      |
| `--oauth-authorization-url` | OAuth 認可 URL。                                            | —                                      | `--oauth-authorization-url https://provider.example.com/authorize` |
| `--oauth-token-url`         | OAuth トークン URL。                                                    | —                                      | `--oauth-token-url https://provider.example.com/token`             |
| `--oauth-scopes`            | OAuth スコープ（カンマ区切り）。                                     | —                                      | `--oauth-scopes scope1,scope2`                                     |

> `--oauth-*` フラグは `--transport sse` および `--transport http` のみに適用されます。`--transport stdio` との組み合わせは拒否されます。

#### サーバーの削除（`qwen mcp remove`）

```bash
qwen mcp remove <name>
```