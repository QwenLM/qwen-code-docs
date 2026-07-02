# MCP経由でQwen Codeをツールに接続する

Qwen Codeは、[Model Context Protocol (MCP)](https://modelcontextprotocol.io/introduction)を通じて外部ツールやデータソースに接続できます。MCPサーバーにより、Qwen Codeはあなたのツール、データベース、APIにアクセスできるようになります。

## MCPでできること

MCPサーバーを接続すると、Qwen Codeに以下のことを指示できます:

- ファイルやリポジトリの操作（有効化するツールに応じて、読み取り/検索/書き込み）
- データベースのクエリ（スキーマの検査、クエリ実行、レポート作成）
- 内部サービスの統合（APIをMCPツールとしてラップ）
- ワークフローの自動化（ツールやプロンプトとして公開される反復タスク）

> [!tip]
>
> 「まず最初のコマンド」を探している場合は、[クイックスタート](#quick-start)に進んでください。

## クイックスタート

Qwen Codeは、`settings.json`の`mcpServers`からMCPサーバーをロードします。サーバーの設定は以下のいずれかの方法で行えます:

- `settings.json`を直接編集する
- `qwen mcp`コマンドを使用する（[CLIリファレンス](#manage-mcp-servers-with-qwen-mcp)を参照）

### 最初のサーバーを追加する

1. サーバーを追加する（例: リモートHTTP MCPサーバー）:

```bash
qwen mcp add --transport http my-server http://localhost:3000/mcp
```

2. Qwen Codeを起動し、MCP管理ダイアログを開いてサーバーを表示・管理します:

```bash
qwen
```

次に、以下を入力します:

```text
/mcp
```

3. サーバーを追加する前にQwen Codeがすでに起動していた場合は、同じプロジェクトで再起動してください。その後、モデルにそのサーバーのツールを使用するよう指示します。

## 設定の保存場所（スコープ）

ほとんどのユーザーは、以下の2つのスコープのみで十分です:

- **ユーザースコープ（デフォルト）**: マシン上のすべてのプロジェクトに適用される `~/.qwen/settings.json`
- **プロジェクトスコープ**: プロジェクトルートにある `.qwen/settings.json`

ユーザースコープに書き込む:

```bash
qwen mcp add --scope user --transport http my-server http://localhost:3000/mcp
```

> [!tip]
>
> 高度な設定レイヤー（システムデフォルト/システム設定と優先順位ルール）については、[設定](../configuration/settings)を参照してください。

## サーバーの設定

### トランスポートの選択

| トランスポート | 使用すべき場面                                                       | JSONフィールド                               |
| --------- | ----------------------------------------------------------------- | ------------------------------------------- |
| `http`    | リモートサービスに推奨。クラウドMCPサーバーで良好に動作 | `httpUrl`（+ オプションの `headers`）            |
| `sse`     | Server-Sent Eventsのみをサポートするレガシー/非推奨サーバー    | `url`（+ オプションの `headers`）                |
| `stdio`   | マシン上のローカルプロセス（スクリプト、CLI、Docker）             | `command`, `args`（+ オプションの `cwd`, `env`） |

> [!note]
>
> サーバーが両方をサポートしている場合は、**SSE**よりも**HTTP**を優先してください。

### settings.jsonとqwen mcp addによる設定

どちらのアプローチでも、`settings.json`に同じ`mcpServers`エントリが生成されます。好みの方法を使用してください。

#### Stdioサーバー（ローカルプロセス）

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

CLI（デフォルトでユーザースコープに書き込み）:

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

## MCPプロンプトとリソースの使用

ツールに加えて、Qwen Codeは他の2つのMCPプリミティブを検出し、利用できるようにします。

### プロンプト（スラッシュコマンド）

サーバーが`prompts/list`経由で公開するプロンプトは、実行可能な**スラッシュコマンド**になります。検出後、`/`を入力するとプロンプトが一覧表示されます（`MCP: <server>`というラベル付き）。他のコマンドと同様に実行できます:

```text
/my_prompt --arg1="value" --arg2="value"
# 位置引数形式も機能します:
/my_prompt "value" "value"
# プロンプトの引数を表示:
/my_prompt help
```

プロンプトのメッセージはモデルに送信され、モデルがそれに基づいてアクションを実行します。

> 検出は宣言された`prompts`ケーパビリティに対して寛容です: 一部のサーバーは`prompts/list`を実装していますが、`initialize`ケーパビリティから`prompts`を省略しています。Qwen Codeはとにかく`prompts/list`を試行するため、それらのプロンプトも表示されます。プロンプトを本当に持たないサーバーは単に`Method not found`を返しますが、これは無視されます。

### リソース

サーバーが`resources/list`経由で公開するリソースは、サーバーごとに検出されます。`/mcp`で管理ダイアログを開き、サーバーを選択すると、ツールやプロンプト alongside **リソース**の数が表示されます。**View resources**を選択してサーバーのリソースURIを閲覧できます。1つを選択すると、説明とMIMEタイプ、およびメッセージに貼り付けるための正確な`@server:uri`参照が表示されます。プロンプトと同様に、`resources`ケーパビリティの宣言は必須ではありません。

`@server:uri`構文を使用して、メッセージにリソースの内容を挿入します。`@`、次にサーバー名、コロン、リソースURIの順に入力します:

```text
summarize @myserver:file:///docs/spec.md and list the open questions
```

`@myserver:`と入力すると、そのサーバーのリソースのオートコンプリートリストが表示されます。入力を続けると、リソースURIまたはフレンドリ名/タイトルが（大文字小文字を区別せずに）一致するようにフィルタリングされます。URIを暗記する必要はありません。コロンに到達する前にサーバー名の一部を入力するだけで、リソースを公開する一致するサーバーが提案されるため、1つを選択して直接リソースリストに移動できます。送信時、参照されたリソースが読み込まれ、その内容がメッセージに追加されます（テキストはインライン、バイナリブロブは添付ファイルとして）。`@server:uri`参照はプロンプトに保持されるため、モデルは何を見ているかを認識できます。`server`プレフィックスは設定済みのMCPサーバーと一致する必要があります。一致しない場合、トークンは通常のファイルパスとして扱われるため、既存の`@path/to/file`参照は影響を受けません。信頼されないフォルダではリソースの読み取りは無効になります。

## 段階的な利用可能性と検出タイムアウト

Qwen Codeは、UIがすでにインタラクティブになった後、バックグラウンドでMCPサーバーを検出します。MCPサーバーの1つが数秒かかる場合（または応答しない場合）でも、数ミリ秒以内にCLIの最初のプロンプトが表示され、モデルのツールリストは各サーバーが検出ハンドシェイクを完了する約1フレーム（〜16ミリ秒）ごとに更新されます。

- **インタラクティブモード**: UIはすぐに表示され、右下のMCPステータスピルに検出中の`N/M MCP servers ready`が表示されます。MCPが完了する前にプロンプトを送信した場合、モデルはその時点で準備ができているツールのみを認識します。その後のプロンプトでは、サーバーがオンラインになるにつれてより多くのツールが認識されます。
- **非インタラクティブモード**（`--prompt`、stream-json、ACP）: CLIは最初のプロンプトを送信する前にMCP検出が落ち着くのを待つため、スクリプト/パイプ呼び出しはレガシーな同期動作と同じ完全なツールセットを認識します。

### サーバーごとのdiscoveryTimeoutMs

各MCPサーバーには、初期ハンドシェイク（`connect` + `tools/list` + `prompts/list` + `resources/list`）に許可される時間を制限する、検出専用のタイムアウトが設定されます。デフォルト:

- **stdioサーバー**: 30秒
- **リモートHTTP / SSEサーバー**: 5秒（ネットワークリスクが高いため）

必要に応じてサーバーごとにオーバーライドします:

```jsonc
{
  "mcpServers": {
    "slow-stdio": {
      "command": "node",
      "args": ["./slow-server.js"],
      "discoveryTimeoutMs": 60000,
    },
    "flaky-remote": {
      "httpUrl": "https://example.com/mcp",
      "discoveryTimeoutMs": 10000,
    },
  },
}
```

既存の`timeout`フィールドは**ツール呼び出し**のタイムアウト（各`tools/call`リクエストに使用され、デフォルトは10分）であり、`discoveryTimeoutMs`の影響は受けません。長時間実行されるツール呼び出しはスタートアップの問題ではありません。

### 段階的MCPのロールバック

古い同期動作（CLIがUIを表示する前にすべてのMCPサーバーを待つ）が必要な場合は、環境変数に`QWEN_CODE_LEGACY_MCP_BLOCKING=1`を設定してください。これは少なくとも1リリースの間、エスケープハッチとして保持されます。

## 安全性と制御

### 信頼（確認のスキップ）

- **サーバー信頼**（`trust: true`）: そのサーバーの確認プロンプトをバイパスします（使用は慎重に）。

### OAuth認証

Qwen CodeはMCPサーバーのOAuth 2.0認証をサポートしています。これは、認証を必要とするリモートサーバーにアクセスする場合に便利です。

#### 基本的な使い方

OAuth認証情報を使用してMCPサーバーを追加すると、Qwen Codeが認証フローを自動的に処理します:

```bash
qwen mcp add --transport sse oauth-server https://api.example.com/sse/ \
  --oauth-client-id your-client-id \
  --oauth-redirect-uri https://your-server.com/oauth/callback \
  --oauth-authorization-url https://provider.example.com/authorize \
  --oauth-token-url https://provider.example.com/token
```

#### 重要: リダイレクトURIの設定

OAuthフローには、認証プロバイダーが認証コードを送信するリダイレクトURIが必要です。

- **ローカル開発**: デフォルトでは、Qwen Codeは`http://localhost:7777/oauth/callback`を使用します。これは、ローカルマシンでローカルブラウザを使用してQwen Codeを実行している場合に機能します。

- **リモート/クラウドデプロイ**: リモートサーバー、クラウドIDE、またはWebターミナルでQwen Codeを実行する場合、デフォルトの`localhost`リダイレクトは機能**しません**。OAuthコールバックを受信できる公開アクセス可能なURLを指すように`--oauth-redirect-uri`を必ず設定する必要があります。

リモートサーバーの例:

```bash
qwen mcp add --transport sse remote-server https://api.example.com/sse/ \
  --oauth-redirect-uri https://your-remote-server.example.com/oauth/callback
```

#### settings.jsonによる手動設定

`settings.json`を直接編集してOAuthを設定することもできます:

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

OAuth設定プロパティ:

| プロパティ           | 説明                                                                                                           |
| ------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `enabled`          | このサーバーのOAuthを有効にする（ブール値）                                                                                |
| `clientId`         | OAuthクライアント識別子（文字列、動的登録の場合は省略可能）                                                  |
| `clientSecret`     | OAuthクライアントシークレット（文字列、パブリッククライアントの場合は省略可能）                                                             |
| `authorizationUrl` | OAuth認可エンドポイント（文字列、省略した場合は自動検出）                                                     |
| `tokenUrl`         | OAuthトークンエンドポイント（文字列、省略した場合は自動検出）                                                             |
| `scopes`           | 必要なOAuthスコープ（文字列の配列）                                                                              |
| `redirectUri`      | カスタムリダイレクトURI（文字列）。**リモートデプロイでは重要**。デフォルトは`http://localhost:7777/oauth/callback` |
| `tokenParamName`   | SSE URL内のトークンのクエリパラメータ名（文字列）                                                                  |
| `audiences`        | トークンが有効な対象（文字列の配列）                                                                   |

#### トークン管理

OAuthトークンは自動的に以下のように処理されます:

- **保存**: デフォルトでは`~/.qwen/mcp-oauth-tokens.json`（プレーンテキスト、モード0600）に保存されます。`QWEN_CODE_FORCE_ENCRYPTED_FILE_STORAGE=true`が設定されている場合、Qwen Codeは利用可能な場合はキーチェーンバックのストレージを使用するか、AES-256-GCMで暗号化された`~/.qwen/mcp-oauth-tokens-v2.json`を使用します。
- **更新**: 期限切れになった場合（リフレッシュトークンが利用可能な場合）
- **検証**: 各接続試行の前

> [!WARNING]
> デフォルトでは、OAuthトークンは暗号化されずにディスクに保存されます。共有マシンまたはマルチユーザーマシンでは、`QWEN_CODE_FORCE_ENCRYPTED_FILE_STORAGE=true`を設定して認証情報を保護してください。

Qwen Code内の`/mcp`ダイアログを使用して、MCPサーバーを検査し、認証を対話的に管理します。

### ツールのフィルタリング（サーバーごとのツールの許可/拒否）

`includeTools` / `excludeTools`を使用して、サーバーによって公開されるツールを（Qwen Codeの観点から）制限します。

例: いくつかのツールのみを含める:

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

`settings.json`の`mcp`オブジェクトは、すべてのMCPサーバーに対するグローバルルールを定義します:

- `mcp.allowed`: MCPサーバー名（`mcpServers`のキー）の許可リスト
- `mcp.excluded`: MCPサーバー名の拒否リスト

どちらのリストもグロブパターンをサポートしています。`*`は任意の文字列に、`?`は1文字にマッチします（例: `"*puppeteer*"`は名前が`puppeteer`を含むすべてのサーバーにマッチ）。グロブ文字を含まないエントリは完全に一致します。サーバーが両方のリストにマッチする場合、`mcp.excluded`が優先されます。

例:

```json
{
  "mcp": {
    "allowed": ["my-trusted-server", "*-internal"],
    "excluded": ["experimental-server"]
  }
}
```

## トラブルシューティング

- **`qwen mcp list`でサーバーが「Disconnected」と表示される**: URL/コマンドが正しいことを確認し、`timeout`を増やしてください。
- **Stdioサーバーが起動しない**: 絶対パスの`command`を使用し、`cwd`/`env`を再確認してください。
- **JSON内の環境変数が解決されない**: Qwen Codeが実行されている環境（シェルとGUIアプリの環境は異なる場合があります）にそれらが存在することを確認してください。

## リファレンス

### settings.jsonの構造

#### サーバー固有の設定（mcpServers）

`settings.json`ファイルに`mcpServers`オブジェクトを追加します:

```json
// ... ファイルには他の設定オブジェクトが含まれます
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

設定プロパティ:

必須（以下のいずれか）:

| プロパティ  | 説明                                            |
| --------- | ------------------------------------------------------ |
| `command` | Stdioトランスポートの実行ファイルへのパス             |
| `url`     | SSEエンドポイントURL（例: `"http://localhost:8080/sse"`） |
| `httpUrl` | HTTPストリーミングエンドポイントURL                            |

オプション:

| プロパティ               | 型/デフォルト                 | 説明                                                                                                                                                                                                                                                       |
| ---------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `args`                 | array                        | Stdioトランスポートのコマンドライン引数                                                                                                                                                                                                                        |
| `headers`              | object                       | `url`または`httpUrl`を使用する場合のカスタムHTTPヘッダー                                                                                                                                                                                                                 |
| `env`                  | object                       | サーバープロセスの環境変数。値は`$VAR_NAME`または`${VAR_NAME}`構文を使用して環境変数を参照できます                                                                                                                                |
| `cwd`                  | string                       | Stdioトランスポートの作業ディレクトリ                                                                                                                                                                                                                             |
| `timeout`              | number<br>(default: 600,000) | ミリ秒単位の要求タイムアウト（デフォルト: 600,000ミリ秒 = 10分）                                                                                                                                                                                                 |
| `trust`                | boolean<br>(default: false)  | `true`の場合、このサーバーのすべてのツール呼び出し確認をバイパスします（デフォルト: `false`）                                                                                                                                                                              |
| `includeTools`         | array                        | このMCPサーバーから含めるツール名のリスト。指定した場合、ここにリストされているツールのみがこのサーバーから利用可能になります（許可リスト動作）。指定しない場合、デフォルトですべてのツールが有効になります。                                       |
| `excludeTools`         | array                        | このMCPサーバーから除外するツール名のリスト。ここにリストされているツールは、サーバーによって公開されていてもモデルが利用できません。<br>注: `excludeTools`は`includeTools`よりも優先されます。ツールが両方のリストにある場合、除外されます。 |
| `targetAudience`       | string                       | アクセスしようとしているIAP保護アプリケーションで許可リストに登録されているOAuthクライアントID。`authProviderType: 'service_account_impersonation'`と併用します。                                                                                                         |
| `targetServiceAccount` | string                       | 偽装するGoogle Cloudサービスアカウントのメールアドレス。`authProviderType: 'service_account_impersonation'`と併用します。                                                                                                                              |

<a id="qwen-mcp-cli"></a>

### qwen mcpによるMCPサーバーの管理

`settings.json`を手動で編集してMCPサーバーを設定することもできますが、CLIを使用する方が通常は高速です。

#### サーバーの追加（qwen mcp add）

```bash
qwen mcp add [options] <name> <commandOrUrl> [args...]
```

| 引数/オプション             | 説明                                                         | デフォルト                                | 例                                                            |
| --------------------------- | ------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------ |
| `<name>`                    | サーバーの一意の名前。                                       | —                                      | `example-server`                                                   |
| `<commandOrUrl>`            | 実行するコマンド（`stdio`用）またはURL（`http`/`sse`用）。 | —                                      | `/usr/bin/python` または `http://localhost:8`                          |
| `[args...]`                 | `stdio`コマンドのオプションの引数。                           | —                                      | `--port 5000`                                                      |
| `-s`, `--scope`             | 設定スコープ（`user`または`project`）。                              | `user`                                 | `-s user`                                                          |
| `-t`, `--transport`         | トランスポートタイプ（`stdio`、`sse`、`http`）。                            | `stdio`                                | `-t sse`                                                           |
| `-e`, `--env`               | 環境変数を設定します。                                          | —                                      | `-e KEY=value`                                                     |
| `-H`, `--header`            | SSEおよびHTTPトランスポートのHTTPヘッダーを設定します。                       | —                                      | `-H "X-Api-Key: abc123"`                                           |
| `--timeout`                 | 接続タイムアウトをミリ秒で設定します。                             | —                                      | `--timeout 30000`                                                  |
| `--trust`                   | サーバーを信頼します（すべてのツール呼び出し確認プロンプトをバイパス）。       | — (`false`)                            | `--trust`                                                          |
| `--description`             | サーバーの説明を設定します。                                 | —                                      | `--description "Local tools"`                                      |
| `--include-tools`           | 含めるツールのカンマ区切りリスト。                         | すべてのツールが含まれる                     | `--include-tools mytool,othertool`                                 |
| `--exclude-tools`           | 除外するツールのカンマ区切りリスト。                         | なし                                   | `--exclude-tools mytool`                                           |
| `--oauth-client-id`         | MCPサーバー認証用のOAuthクライアントID。                      | —                                      | `--oauth-client-id your-client-id`                                 |
| `--oauth-client-secret`     | MCPサーバー認証用のOAuthクライアントシークレット。                  | —                                      | `--oauth-client-secret your-client-secret`                         |
| `--oauth-redirect-uri`      | 認証コールバック用のOAuthリダイレクトURI。                     | `http://localhost:7777/oauth/callback` | `--oauth-redirect-uri https://your-server.com/oauth/callback`      |
| `--oauth-authorization-url` | OAuth認可URL。                                            | —                                      | `--oauth-authorization-url https://provider.example.com/authorize` |
| `--oauth-token-url`         | OAuthトークンURL。                                                    | —                                      | `--oauth-token-url https://provider.example.com/token`             |
| `--oauth-scopes`            | OAuthスコープ（カンマ区切り）。                                     | —                                      | `--oauth-scopes scope1,scope2`                                     |
> `--oauth-*` フラグは `--transport sse` および `--transport http` にのみ適用されます。`--transport stdio` と組み合わせて使用することはできません。

#### サーバーの削除 (`qwen mcp remove`)

```bash
qwen mcp remove <name>
```