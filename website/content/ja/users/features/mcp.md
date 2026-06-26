# MCP 経由で Qwen Code をツールに接続する

Qwen Code は [Model Context Protocol (MCP)](https://modelcontextprotocol.io/introduction) を通じて外部ツールやデータソースに接続できます。MCP サーバーにより、Qwen Code はあなたのツール、データベース、API にアクセスできるようになります。

## MCP でできること

MCP サーバーを接続すると、Qwen Code に以下のような操作を依頼できます:

- ファイルやリポジトリの操作 (有効にしたツールに応じて読み取り/検索/書き込み)
- データベースへのクエリ (スキーマ確認、クエリ、レポート)
- 内部サービスの統合 (API を MCP ツールとしてラップ)
- ワークフローの自動化 (反復タスクをツール/プロンプトとして公開)

> [!tip]
>
> 「すぐに始められる1つのコマンド」を探しているなら、[クイックスタート](#quick-start) に飛んでください。

## クイックスタート

Qwen Code は `settings.json` 内の `mcpServers` から MCP サーバーを読み込みます。以下のいずれかの方法でサーバーを設定できます:

- `settings.json` を直接編集する
- `qwen mcp` コマンドを使用する ([CLI リファレンス](#manage-mcp-servers-with-qwen-mcp) 参照)

### 最初のサーバーを追加する

1. サーバーを追加 (例: リモート HTTP MCP サーバー):

```bash
qwen mcp add --transport http my-server http://localhost:3000/mcp
```

2. Qwen Code を起動し、MCP 管理ダイアログを開いてサーバーを表示・管理します:

```bash
qwen
```

続けて次のように入力:

```text
/mcp
```

3. サーバー追加時に既に Qwen Code が起動していた場合は、同じプロジェクトで再起動します。その後、モデルにそのサーバーのツールを使うよう指示します。

## 設定の保存場所 (スコープ)

ほとんどのユーザーには次の2つのスコープで十分です:

- **ユーザースコープ (デフォルト)**: `~/.qwen/settings.json` マシン上のすべてのプロジェクトで共有
- **プロジェクトスコープ**: プロジェクトルートの `.qwen/settings.json`

ユーザースコープに書き込む場合:

```bash
qwen mcp add --scope user --transport http my-server http://localhost:3000/mcp
```

> [!tip]
>
> 詳細な設定レイヤー (システムデフォルト/システム設定と優先順位ルール) については、[設定](../configuration/settings) を参照してください。

## サーバーの設定

### トランスポートを選ぶ

| トランスポート | 使用するタイミング                                                 | JSON フィールド                        |
| -------------- | ------------------------------------------------------------------- | -------------------------------------- |
| `http`         | リモートサービスに推奨。クラウド MCP サーバーに適しています         | `httpUrl` (+ オプションで `headers`)   |
| `sse`          | Server-Sent Events のみをサポートするレガシー/非推奨サーバー向け    | `url` (+ オプションで `headers`)       |
| `stdio`        | ローカルマシン上のプロセス (スクリプト、CLI、Docker) 向け          | `command`, `args` (+ オプションで `cwd`, `env`) |

> [!note]
>
> 両方をサポートするサーバーがある場合は、**SSE よりも HTTP** を推奨します。

### `settings.json` 経由 vs `qwen mcp add`

どちらの方法でも `settings.json` に同じ `mcpServers` エントリが作成されます。お好みの方法を使用してください。

#### Stdio サーバー (ローカルプロセス)

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

CLI (デフォルトでユーザースコープに書き込み):

```bash
qwen mcp add pythonTools -e DATABASE_URL=$DB_CONNECTION_STRING -e API_KEY=$EXTERNAL_API_KEY \
  --timeout 15000 python -m my_mcp_server --port 8080
```

#### HTTP サーバー (リモートストリーミング HTTP)

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

#### SSE サーバー (リモート Server-Sent Events)

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

## MCP プロンプトとリソースの使用

ツールに加えて、Qwen Code は他の 2 つの MCP プリミティブも検出して表示します。

### プロンプト (スラッシュコマンド)

サーバーが `prompts/list` を通じてアドバタイズするプロンプトは、実行可能な **スラッシュコマンド** になります。検出後、`/` と入力するとそのプロンプトが一覧に表示されます (ラベル `MCP: <サーバー名>`)。他のコマンドと同様に実行できます:

```text
/my_prompt --arg1="value" --arg2="value"
# 位置引数形式も使用可能:
/my_prompt "value" "value"
# プロンプトの引数を表示:
/my_prompt help
```

プロンプトのメッセージがモデルに送信され、モデルがそれに基づいて動作します。

> 検出は、宣言された `prompts` 機能に関して寛容です。一部のサーバーは `prompts/list` を実装しているが、`initialize` 機能から `prompts` を省略しています。Qwen Code はそれでも `prompts/list` を試行するため、それらのプロンプトは表示されます。プロンプトが本当にないサーバーは単に `Method not found` と応答し、無視されます。

### リソース

サーバーが `resources/list` を通じてアドバタイズするリソースは、サーバーごとに検出されます。`/mcp` で管理ダイアログを開き、サーバーを選択すると、ツールやプロンプトとともに **リソース** 数が表示されます。「リソースを表示」を選択してサーバーのリソース URI を参照できます。リソースを選択すると、その説明と MIME タイプ、およびメッセージに貼り付ける正確な `@サーバー名:uri` 参照が表示されます。プロンプトと同様に、`resources` 機能の宣言は必須ではありません。

`@サーバー名:uri` 構文を使用してリソースの内容をメッセージに注入します。`@` と入力し、サーバー名、コロン、リソース URI を続けて入力します:

```text
summarize @myserver:file:///docs/spec.md and list the open questions
```

`@myserver:` と入力すると、そのサーバーのリソースのオートコンプリートリストが表示されます。入力を続けてフィルタリングします (リソース URI またはフレンドリ名/タイトルに対して大文字小文字を区別せずに一致)。URI を暗記する必要はありません。コロンの前にサーバー名の一部を入力すると、リソースを公開している一致するサーバーも提案されるため、選択してそのリソースリストに直接ドリルダウンできます。送信すると、参照されたリソースが読み取られ、その内容がメッセージに追加されます (テキストはインライン、バイナリ blob は添付ファイルとして)。`@サーバー名:uri` 参照はプロンプトに保持され、モデルが何を見ているかを認識します。`サーバー名` プレフィックスは設定済みの MCP サーバーと一致する必要があります。一致しない場合はトークンは通常のファイルパスとして扱われるため、既存の `@path/to/file` 参照には影響しません。リソース読み取りは、信頼されていないフォルダーでは無効になります。

## プログレッシブアベイラビリティと検出タイムアウト

Qwen Code は UI がインタラクティブになった後、バックグラウンドで MCP サーバーを検出します。MCP サーバーの1つが応答に数秒かかったり応答しなかったりしても、CLI の最初のプロンプトは数百ミリ秒以内に表示され、モデルのツールリストは各サーバーが検出ハンドシェイクを完了した後、約1フレーム (~16 ms) 以内に更新されます。

- **インタラクティブモード**: UI はすぐに表示され、右下の MCP ステータスピルに検出中の `N/M MCP servers ready` と表示されます。MCP が完了する前にプロンプトを送信すると、モデルはその時点で準備ができているツールのみを認識します。後続のプロンプトでは、サーバーがオンラインになるにつれてより多くのツールが表示されます。
- **非インタラクティブモード** (`--prompt`、stream-json、ACP): CLI は MCP 検出が完了するのを待ってから最初のプロンプトを送信するため、スクリプトやパイプ呼び出しでは、従来の同期動作と同じ完全なツールセットが表示されます。

### サーバーごとの `discoveryTimeoutMs`

各 MCP サーバーには、初期ハンドシェイク (`connect` + `tools/list` + `prompts/list` + `resources/list`) にかかる時間を制限する検出専用のタイムアウトがあります。デフォルト:

- **stdio サーバー**: 30 秒
- **リモート HTTP / SSE サーバー**: 5 秒 (ネットワークリスクが高いため)

必要に応じてサーバーごとにオーバーライド:

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

既存の `timeout` フィールドは **ツール呼び出し** タイムアウト (各 `tools/call` リクエストで使用、デフォルト 10 分) であり、`discoveryTimeoutMs` の影響を受けません。長時間実行されるツール呼び出しは起動時の問題ではありません。

### プログレッシブ MCP の元に戻す

古い同期動作が必要な場合 (すべての MCP サーバーを待ってから UI を表示する) は、環境変数 `QWEN_CODE_LEGACY_MCP_BLOCKING=1` を設定します。これは少なくとも 1 リリースはエスケープハッチとして維持されます。

## 安全と制御

### 信頼 (確認をスキップ)

- **サーバーの信頼** (`trust: true`): そのサーバーの確認プロンプトをバイパスします (控えめに使用)。

### OAuth 認証

Qwen Code は MCP サーバー向けの OAuth 2.0 認証をサポートしています。これは、認証が必要なリモートサーバーにアクセスする際に便利です。

#### 基本的な使用方法

OAuth クレデンシャルを使用して MCP サーバーを追加すると、Qwen Code が自動的に認証フローを処理します:

```bash
qwen mcp add --transport sse oauth-server https://api.example.com/sse/ \
  --oauth-client-id your-client-id \
  --oauth-redirect-uri https://your-server.com/oauth/callback \
  --oauth-authorization-url https://provider.example.com/authorize \
  --oauth-token-url https://provider.example.com/token
```

#### 重要: リダイレクト URI の設定

OAuth フローでは、認証プロバイダーが認証コードを送信するリダイレクト URI が必要です。

- **ローカル開発**: デフォルトで Qwen Code は `http://localhost:7777/oauth/callback` を使用します。これは Qwen Code をローカルマシンでローカルブラウザを使って実行する場合に機能します。

- **リモート/クラウドデプロイメント**: Qwen Code をリモートサーバー、クラウド IDE、または Web ターミナルで実行する場合、デフォルトの `localhost` リダイレクトは機能しません。OAuth コールバックを受け取れる公開アクセス可能な URL を `--oauth-redirect-uri` で指定する必要があります。

リモートサーバーの例:

```bash
qwen mcp add --transport sse remote-server https://api.example.com/sse/ \
  --oauth-redirect-uri https://your-remote-server.example.com/oauth/callback
```

#### settings.json による手動設定

`settings.json` を直接編集して OAuth を設定することもできます:

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

OAuth 設定プロパティ:

| プロパティ           | 説明                                                                                                                       |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `enabled`            | このサーバーで OAuth を有効にするかどうか (boolean)                                                                        |
| `clientId`           | OAuth クライアント識別子 (string、動的登録の場合はオプション)                                                              |
| `clientSecret`       | OAuth クライアントシークレット (string、パブリッククライアントの場合はオプション)                                          |
| `authorizationUrl`   | OAuth 認可エンドポイント (string、省略した場合は自動検出)                                                                 |
| `tokenUrl`           | OAuth トークンエンドポイント (string、省略した場合は自動検出)                                                              |
| `scopes`             | 必要な OAuth スコープ (文字列の配列)                                                                                       |
| `redirectUri`        | カスタムリダイレクト URI (string)。**リモートデプロイメントでは必須**。デフォルトは `http://localhost:7777/oauth/callback` |
| `tokenParamName`     | SSE URL 内のトークンのクエリパラメータ名 (string)                                                                          |
| `audiences`          | トークンが有効なオーディエンス (文字列の配列)                                                                               |

#### トークン管理

OAuth トークンは自動的に:

- **保存** されます: デフォルトでは `~/.qwen/mcp-oauth-tokens.json` (平文、モード 0600)。`QWEN_CODE_FORCE_ENCRYPTED_FILE_STORAGE=true` が設定されている場合、Qwen Code は利用可能な場合はキーチェーンストレージを使用し、そうでない場合は `~/.qwen/mcp-oauth-tokens-v2.json` に AES-256-GCM 暗号化で保存します。
- **リフレッシュ** されます: 期限切れ時 (リフレッシュトークンが利用可能な場合)
- **検証** されます: 接続試行のたびに

> [!WARNING]
> デフォルトでは、OAuth トークンはディスク上に暗号化されずに保存されます。共有またはマルチユーザーマシンでは、`QWEN_CODE_FORCE_ENCRYPTED_FILE_STORAGE=true` を設定してクレデンシャルを保護してください。

Qwen Code 内で `/mcp` ダイアログを使用して MCP サーバーを検査し、認証を対話的に管理します。

### ツールフィルタリング (サーバーごとのツールの許可/拒否)

`includeTools` / `excludeTools` を使用して、サーバーが公開するツールを制限します (Qwen Code の観点から)。

例: 一部のツールのみを含める:

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

`settings.json` の `mcp` オブジェクトは、すべての MCP サーバーに適用されるグローバルルールを定義します:

- `mcp.allowed`: MCP サーバー名の許可リスト (`mcpServers` のキー)
- `mcp.excluded`: MCP サーバー名の拒否リスト

例:

```json
{
  "mcp": {
    "allowed": ["my-trusted-server"],
    "excluded": ["experimental-server"]
  }
}
```

## トラブルシューティング

- **`qwen mcp list` でサーバーが "Disconnected" と表示される**: URL/コマンドが正しいことを確認し、`timeout` を増やしてください。
- **Stdio サーバーが起動しない**: `command` に絶対パスを使用し、`cwd`/`env` を再確認してください。
- **JSON 内の環境変数が解決されない**: Qwen Code が実行されている環境にそれらの環境変数が存在することを確認してください (シェルと GUI アプリの環境は異なる場合があります)。

## リファレンス

### `settings.json` の構造

#### サーバー固有の設定 (`mcpServers`)

`settings.json` ファイルに `mcpServers` オブジェクトを追加します:

```json
// ... ファイルには他の設定オブジェクトが含まれています
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

必須 (以下のいずれか):

| プロパティ  | 説明                                                         |
| ----------- | ------------------------------------------------------------ |
| `command`   | Stdio トランスポート用の実行可能ファイルのパス              |
| `url`       | SSE エンドポイント URL (例: `"http://localhost:8080/sse"`) |
| `httpUrl`   | HTTP ストリーミングエンドポイント URL                        |

オプション:

| プロパティ               | 型/デフォルト                | 説明                                                                                                                                                                                                                                                                                    |
| ------------------------ | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `args`                   | array                        | Stdio トランスポート用のコマンドライン引数                                                                                                                                                                                                                                               |
| `headers`                | object                       | `url` または `httpUrl` 使用時のカスタム HTTP ヘッダー                                                                                                                                                                                                                                   |
| `env`                    | object                       | サーバープロセス用の環境変数。値は `$VAR_NAME` または `${VAR_NAME}` 構文で環境変数を参照可能                                                                                                                              |
| `cwd`                    | string                       | Stdio トランスポート用の作業ディレクトリ                                                                                                                                                                                                                                                 |
| `timeout`                | number<br>(デフォルト: 600000) | リクエストタイムアウト (ミリ秒、デフォルト: 600000ms = 10 分)                                                                                                                                                                                                                           |
| `trust`                  | boolean<br>(デフォルト: false) | `true` の場合、このサーバーのすべてのツール呼び出し確認をバイパス (デフォルト: `false`)                                                                                                                                                                                                  |
| `includeTools`           | array                        | この MCP サーバーから含めるツール名のリスト。指定された場合、リストにあるツールのみがこのサーバーから利用可能になります (許可リスト動作)。指定されていない場合、サーバーのすべてのツールがデフォルトで有効になります。                                                                  |
| `excludeTools`           | array                        | この MCP サーバーから除外するツール名のリスト。ここにリストされたツールは、サーバーが公開していてもモデルから利用できなくなります。<br>注: `excludeTools` は `includeTools` より優先されます。ツールが両方のリストにある場合、除外されます。                                             |
| `targetAudience`         | string                       | アクセスしようとしている IAP 保護アプリケーションで許可リストに登録されている OAuth クライアント ID。`authProviderType: 'service_account_impersonation'` とともに使用します。                                                                                                              |
| `targetServiceAccount`   | string                       | 偽装する Google Cloud サービスアカウントのメールアドレス。`authProviderType: 'service_account_impersonation'` とともに使用します。                                                                                                                                                       |

<a id="qwen-mcp-cli"></a>

### `qwen mcp` で MCP サーバーを管理する

`settings.json` を手動で編集して MCP サーバーを設定することもできますが、CLI を使用する方が通常は高速です。

#### サーバーの追加 (`qwen mcp add`)

```bash
qwen mcp add [options] <name> <commandOrUrl> [args...]
```

| 引数/オプション              | 説明                                                         | デフォルト                               | 例                                                                  |
| ---------------------------- | ------------------------------------------------------------ | ---------------------------------------- | ------------------------------------------------------------------- |
| `<name>`                     | サーバーの一意な名前。                                       | —                                        | `example-server`                                                    |
| `<commandOrUrl>`             | 実行するコマンド (`stdio` の場合) または URL (`http`/`sse` の場合)。 | —                                        | `/usr/bin/python` や `http://localhost:8`                           |
| `[args...]`                  | `stdio` コマンドのオプション引数。                           | —                                        | `--port 5000`                                                       |
| `-s`, `--scope`              | 設定スコープ (user または project)。                         | `user`                                   | `-s user`                                                           |
| `-t`, `--transport`          | トランスポートタイプ (`stdio`, `sse`, `http`)。              | `stdio`                                  | `-t sse`                                                            |
| `-e`, `--env`                | 環境変数を設定。                                             | —                                        | `-e KEY=value`                                                      |
| `-H`, `--header`             | SSE および HTTP トランスポート用の HTTP ヘッダーを設定。     | —                                        | `-H "X-Api-Key: abc123"`                                            |
| `--timeout`                  | 接続タイムアウト (ミリ秒) を設定。                           | —                                        | `--timeout 30000`                                                   |
| `--trust`                    | サーバーを信頼する (すべてのツール呼び出し確認プロンプトをバイパス)。 | — (`false`)                              | `--trust`                                                           |
| `--description`              | サーバーの説明を設定。                                       | —                                        | `--description "Local tools"`                                       |
| `--include-tools`            | 含めるツールのカンマ区切りリスト。                           | すべてのツールを含める                    | `--include-tools mytool,othertool`                                  |
| `--exclude-tools`            | 除外するツールのカンマ区切りリスト。                         | なし                                     | `--exclude-tools mytool`                                            |
| `--oauth-client-id`          | MCP サーバー認証用の OAuth クライアント ID。                 | —                                        | `--oauth-client-id your-client-id`                                  |
| `--oauth-client-secret`      | MCP サーバー認証用の OAuth クライアントシークレット。         | —                                        | `--oauth-client-secret your-client-secret`                          |
| `--oauth-redirect-uri`       | 認証コールバック用の OAuth リダイレクト URI。                | `http://localhost:7777/oauth/callback`   | `--oauth-redirect-uri https://your-server.com/oauth/callback`       |
| `--oauth-authorization-url`  | OAuth 認可 URL。                                             | —                                        | `--oauth-authorization-url https://provider.example.com/authorize` |
| `--oauth-token-url`          | OAuth トークン URL。                                         | —                                        | `--oauth-token-url https://provider.example.com/token`             |
| `--oauth-scopes`             | OAuth スコープ (カンマ区切り)。                              | —                                        | `--oauth-scopes scope1,scope2`                                      |
> `--oauth-*` フラグは `--transport sse` および `--transport http` にのみ適用されます。`--transport stdio` と組み合わせることは拒否されます。

#### サーバーの削除 (`qwen mcp remove`)

```bash
qwen mcp remove <name>
```