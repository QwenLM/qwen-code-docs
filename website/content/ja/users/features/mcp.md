# MCP を使って Qwen Code をツールに接続する

Qwen Code は [Model Context Protocol (MCP)](https://modelcontextprotocol.io/introduction) を通じて外部ツールやデータソースに接続できます。MCP サーバーを使うと、Qwen Code からツール、データベース、API にアクセスできるようになります。

## MCP でできること

MCP サーバーを接続すると、Qwen Code に次のような操作を依頼できます。

- ファイルとリポジトリの操作（有効にしたツールに応じて読み取り・検索・書き込み）
- データベースのクエリ（スキーマ確認、クエリ実行、レポート生成）
- 内部サービスの統合（独自 API を MCP ツールとしてラップ）
- ワークフローの自動化（繰り返しタスクをツール/プロンプトとして公開）

> [!tip]
>
> 「とにかく始めたい」という方は、[クイックスタート](#quick-start) に進んでください。

## クイックスタート

Qwen Code は `settings.json` の `mcpServers` から MCP サーバーを読み込みます。サーバーの設定方法は次の 2 つです。

- `settings.json` を直接編集する
- `qwen mcp` コマンドを使用する（[CLI リファレンス](#manage-mcp-servers-with-qwen-mcp) を参照）

### 最初のサーバーを追加する

1. サーバーを追加します（例：リモート HTTP MCP サーバー）:

```bash
qwen mcp add --transport http my-server http://localhost:3000/mcp
```

2. Qwen Code を起動し、MCP 管理ダイアログを開いてサーバーを確認・管理します:

```bash
qwen
```

次のコマンドを入力します:

```text
/mcp
```

3. サーバーを追加する前にすでに Qwen Code が起動していた場合は、同じプロジェクトで再起動してください。その後、そのサーバーのツールを使うようモデルに依頼します。

## 設定の保存場所（スコープ）

ほとんどのユーザーは次の 2 つのスコープだけで十分です。

- **ユーザースコープ（デフォルト）**: マシン上のすべてのプロジェクトで共有される `~/.qwen/settings.json`
- **プロジェクトスコープ**: プロジェクトルートの `.qwen/settings.json`

ユーザースコープへ書き込む場合:

```bash
qwen mcp add --scope user --transport http my-server http://localhost:3000/mcp
```

> [!tip]
>
> 上級者向けの設定レイヤー（システムデフォルト・システム設定・優先順位ルール）については、[設定](../configuration/settings) を参照してください。

## サーバーの設定

### トランスポートの選択

| トランスポート | 使用場面                                                       | JSON フィールド                               |
| -------------- | -------------------------------------------------------------- | --------------------------------------------- |
| `http`         | リモートサービスに推奨。クラウド MCP サーバーに適している       | `httpUrl`（+ オプション `headers`）            |
| `sse`          | Server-Sent Events のみ対応のレガシー・非推奨サーバー           | `url`（+ オプション `headers`）               |
| `stdio`        | マシン上のローカルプロセス（スクリプト、CLI、Docker など）       | `command`、`args`（+ オプション `cwd`、`env`）|

> [!note]
>
> サーバーが両方に対応している場合は、**SSE** より **HTTP** を優先してください。

### `settings.json` と `qwen mcp add` のどちらで設定するか

どちらの方法でも `settings.json` に同じ `mcpServers` エントリが生成されます。使いやすい方を選んでください。

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

CLI（デフォルトでユーザースコープに書き込まれます）:

```bash
qwen mcp add pythonTools -e DATABASE_URL=$DB_CONNECTION_STRING -e API_KEY=$EXTERNAL_API_KEY \
  --timeout 15000 python -m my_mcp_server --port 8080
```

#### HTTP サーバー（リモートストリーミング HTTP）

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

#### SSE サーバー（リモート Server-Sent Events）

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

## MCP プロンプトとリソースの活用

Qwen Code はツール以外に、MCP の 2 つのプリミティブも検出して活用します。

### プロンプト（スラッシュコマンド）

サーバーが `prompts/list` で公開しているプロンプトは、実行可能な**スラッシュコマンド**として利用できます。検出後、`/` を入力すると一覧に表示されます（`MCP: <server>` というラベル付き）。通常のコマンドと同様に実行できます。

```text
/my_prompt --arg1="value" --arg2="value"
# 位置引数形式も使用可能:
/my_prompt "value" "value"
# プロンプトの引数を表示:
/my_prompt help
```

プロンプトのメッセージがモデルに送信され、モデルがそれに基づいて動作します。

> 検出時は `prompts` ケイパビリティの宣言を厳密にはチェックしません。`prompts/list` を実装していても `initialize` のケイパビリティに `prompts` を含めていないサーバーが存在しますが、Qwen Code は `prompts/list` を試行するため、そのようなプロンプトも表示されます。プロンプトが存在しないサーバーは `Method not found` を返しますが、これは無視されます。

### リソース

サーバーが `resources/list` で公開しているリソースは、サーバーごとに検出されます。`/mcp` で管理ダイアログを開き、サーバーを選択するとツールやプロンプトとともに**リソース**数が表示されます。**View resources** を選択するとサーバーのリソース URI を閲覧できます。リソースを選択すると、説明・MIME タイプと、メッセージに貼り付けるための `@server:uri` 参照が表示されます。プロンプトと同様に、`resources` ケイパビリティの宣言は必須ではありません。

リソースの内容をメッセージに埋め込むには `@server:uri` 構文を使います。`@` に続けてサーバー名、コロン、リソース URI を入力します。

```text
summarize @myserver:file:///docs/spec.md and list the open questions
```

`@myserver:` と入力するとそのサーバーのリソース一覧がオートコンプリートに表示され、続けて入力するとリソース URI または名前・タイトルで（大文字小文字を区別せず）絞り込めます。URI を事前に知っている必要はありません。コロンの前にサーバー名の一部を入力するだけで、リソースを公開しているサーバーが候補として表示されるため、選択してリソース一覧に直接進めます。送信時、参照されたリソースが読み込まれてメッセージに追記されます（テキストはインラインで、バイナリデータは添付ファイルとして）。`@server:uri` 参照はプロンプト内に保持されるため、モデルは何を参照しているかを把握できます。`server` プレフィックスは設定済みの MCP サーバーと一致する必要があり、一致しない場合はトークンが通常のファイルパスとして扱われるため、既存の `@path/to/file` 参照には影響しません。リソースの読み取りは信頼されていないフォルダでは無効になります。

## プログレッシブな可用性と検出タイムアウト

Qwen Code は UI がインタラクティブになった後、バックグラウンドで MCP サーバーを検出します。MCP サーバーの起動に数秒かかる場合やまったく応答しない場合でも、CLI の最初のプロンプトは数百ミリ秒以内に表示されます。各サーバーの検出ハンドシェイクが完了するたびに、モデルのツールリストが約 1 フレーム（約 16 ms）以内に更新されます。

- **インタラクティブモード**: UI はすぐに表示されます。検出中は右下に `N/M MCP servers ready` という MCP ステータスピルが表示されます。MCP の検出が完了する前にプロンプトを送信した場合、モデルは_その時点で_準備完了しているツールのみを認識します。以降のプロンプトでは、サーバーがオンラインになるにつれてより多くのツールが利用可能になります。
- **非インタラクティブモード**（`--prompt`、stream-json、ACP）: CLI は最初のプロンプトを送信する前に MCP 検出の完了を待機します。そのため、スクリプトやパイプ経由の実行でも、従来の同期的な動作と同様に完全なツールセットが利用できます。

### サーバーごとの `discoveryTimeoutMs`

各 MCP サーバーには、初回ハンドシェイク（`connect` + `tools/list` + `prompts/list` + `resources/list`）の所要時間を制限する検出専用タイムアウトが設定されています。デフォルト値:

- **stdio サーバー**: 30 秒
- **リモート HTTP / SSE サーバー**: 5 秒（ネットワークリスクが高いため）

必要に応じてサーバーごとに上書きできます:

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

既存の `timeout` フィールドは**ツール呼び出し**タイムアウト（各 `tools/call` リクエストに使用、デフォルト 10 分）であり、`discoveryTimeoutMs` とは独立しています。長時間実行されるツールの呼び出しは起動時の問題ではありません。

### プログレッシブ MCP のロールバック

旧来の同期動作（すべての MCP サーバーが準備完了するまで CLI が UI を表示しない）に戻したい場合は、環境変数に `QWEN_CODE_LEGACY_MCP_BLOCKING=1` を設定してください。この設定は少なくとも 1 リリースの間、エスケープハッチとして維持されます。

## 安全性と制御

### 信頼（確認プロンプトのスキップ）

- **サーバーの信頼** (`trust: true`): そのサーバーに対する確認プロンプトをバイパスします（使用は慎重に）。

### OAuth 認証

Qwen Code は MCP サーバーの OAuth 2.0 認証をサポートしています。認証が必要なリモートサーバーにアクセスする際に便利です。

#### 基本的な使い方

OAuth 認証情報を指定して MCP サーバーを追加すると、Qwen Code が自動的に認証フローを処理します。

```bash
qwen mcp add --transport sse oauth-server https://api.example.com/sse/ \
  --oauth-client-id your-client-id \
  --oauth-redirect-uri https://your-server.com/oauth/callback \
  --oauth-authorization-url https://provider.example.com/authorize \
  --oauth-token-url https://provider.example.com/token
```

#### 重要: リダイレクト URI の設定

OAuth フローには、認可プロバイダーが認証コードを送信するリダイレクト URI が必要です。

- **ローカル開発**: デフォルトでは Qwen Code は `http://localhost:7777/oauth/callback` を使用します。ローカルマシンでブラウザと一緒に Qwen Code を実行する場合に利用できます。

- **リモート・クラウド環境**: リモートサーバー、クラウド IDE、Web ターミナルで Qwen Code を実行する場合、デフォルトの `localhost` リダイレクトは**機能しません**。OAuth コールバックを受け取れる公開 URL を `--oauth-redirect-uri` に設定する**必要があります**。

リモートサーバーの例:

```bash
qwen mcp add --transport sse remote-server https://api.example.com/sse/ \
  --oauth-redirect-uri https://your-remote-server.example.com/oauth/callback
```

#### `settings.json` による手動設定

`settings.json` を直接編集して OAuth を設定することもできます。

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

| プロパティ         | 説明                                                                                                                       |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `enabled`          | このサーバーの OAuth を有効にする（boolean）                                                                               |
| `clientId`         | OAuth クライアント識別子（string、動的登録の場合はオプション）                                                             |
| `clientSecret`     | OAuth クライアントシークレット（string、パブリッククライアントの場合はオプション）                                         |
| `authorizationUrl` | OAuth 認可エンドポイント（string、省略時は自動検出）                                                                       |
| `tokenUrl`         | OAuth トークンエンドポイント（string、省略時は自動検出）                                                                   |
| `scopes`           | 必要な OAuth スコープ（文字列の配列）                                                                                      |
| `redirectUri`      | カスタムリダイレクト URI（string）。**リモート環境では必須**。デフォルトは `http://localhost:7777/oauth/callback`           |
| `tokenParamName`   | SSE URL でトークンを渡すクエリパラメータ名（string）                                                                       |
| `audiences`        | トークンが有効な対象オーディエンス（文字列の配列）                                                                         |

#### トークン管理

OAuth トークンは自動的に以下の処理が行われます。

- **保存**: デフォルトでは `~/.qwen/mcp-oauth-tokens.json`（プレーンテキスト、モード 0600）に保存されます。`QWEN_CODE_FORCE_ENCRYPTED_FILE_STORAGE=true` が設定されている場合、Qwen Code は利用可能な環境ではキーチェーンに保存し、利用できない環境では AES-256-GCM 暗号化を使用した `~/.qwen/mcp-oauth-tokens-v2.json` に保存します。
- **更新**: 期限切れになった場合（リフレッシュトークンがある場合）に自動更新
- **検証**: 接続試行のたびに検証

> [!WARNING]
> By default, OAuth tokens are stored unencrypted on disk. On shared or multi-user machines, set `QWEN_CODE_FORCE_ENCRYPTED_FILE_STORAGE=true` to protect credentials.

Qwen Code 内の `/mcp` ダイアログを使って、MCP サーバーの確認や認証の管理をインタラクティブに行えます。

### ツールフィルタリング（サーバーごとのツールの許可・拒否）

`includeTools` / `excludeTools` を使って、サーバーが公開するツールを（Qwen Code の視点から）制限できます。

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

### グローバルな許可・拒否リスト

`settings.json` の `mcp` オブジェクトで、すべての MCP サーバーに適用するグローバルルールを定義します。

- `mcp.allowed`: 許可する MCP サーバー名のリスト（`mcpServers` のキー）
- `mcp.excluded`: 拒否する MCP サーバー名のリスト

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

- **`qwen mcp list` でサーバーが「Disconnected」と表示される**: URL やコマンドが正しいか確認し、`timeout` を増やしてみてください。
- **Stdio サーバーが起動しない**: `command` には絶対パスを使用し、`cwd` と `env` を再確認してください。
- **JSON 内の環境変数が解決されない**: Qwen Code が実行される環境（シェルと GUI アプリでは環境が異なる場合があります）に変数が存在するか確認してください。

## リファレンス

### `settings.json` の構造

#### サーバー固有の設定（`mcpServers`）

`settings.json` に `mcpServers` オブジェクトを追加します。

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

設定プロパティ:

必須（以下のいずれか）:

| プロパティ | 説明                                                    |
| ---------- | ------------------------------------------------------- |
| `command`  | Stdio トランスポート用の実行ファイルパス                 |
| `url`      | SSE エンドポイント URL（例: `"http://localhost:8080/sse"`）|
| `httpUrl`  | HTTP ストリーミングエンドポイント URL                   |

オプション:

| プロパティ             | 型/デフォルト                 | 説明                                                                                                                                                                                                                                                                 |
| ---------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `args`                 | array                         | Stdio トランスポート用のコマンドライン引数                                                                                                                                                                                                                           |
| `headers`              | object                        | `url` または `httpUrl` 使用時のカスタム HTTP ヘッダー                                                                                                                                                                                                               |
| `env`                  | object                        | サーバープロセスの環境変数。値は `$VAR_NAME` または `${VAR_NAME}` 構文で環境変数を参照できます                                                                                                                                                                      |
| `cwd`                  | string                        | Stdio トランスポート用の作業ディレクトリ                                                                                                                                                                                                                             |
| `timeout`              | number<br>(デフォルト: 600,000) | リクエストタイムアウト（ミリ秒）（デフォルト: 600,000ms = 10 分）                                                                                                                                                                                                   |
| `trust`                | boolean<br>(デフォルト: false)  | `true` の場合、このサーバーのすべてのツール呼び出し確認をバイパスします（デフォルト: `false`）                                                                                                                                                                      |
| `includeTools`         | array                         | この MCP サーバーから含めるツール名のリスト。指定した場合、ここに記載されたツールのみがこのサーバーから利用できます（許可リスト動作）。指定しない場合、サーバーのすべてのツールがデフォルトで有効になります。                                                        |
| `excludeTools`         | array                         | この MCP サーバーから除外するツール名のリスト。サーバーが公開していても、ここに記載されたツールはモデルから利用できません。<br>注意: `excludeTools` は `includeTools` より優先されます。両方のリストに含まれるツールは除外されます。                                 |
| `targetAudience`       | string                        | IAP で保護されたアプリケーションに対して許可された OAuth クライアント ID。`authProviderType: 'service_account_impersonation'` と共に使用します。                                                                                                                    |
| `targetServiceAccount` | string                        | 偽装する Google Cloud サービスアカウントのメールアドレス。`authProviderType: 'service_account_impersonation'` と共に使用します。                                                                                                                                    |

<a id="qwen-mcp-cli"></a>

### `qwen mcp` で MCP サーバーを管理する

MCP サーバーの設定は `settings.json` を直接編集しても行えますが、CLI を使う方が通常は速いです。

#### サーバーの追加（`qwen mcp add`）

```bash
qwen mcp add [options] <name> <commandOrUrl> [args...]
```

| 引数/オプション             | 説明                                                             | デフォルト                             | 例                                                                 |
| --------------------------- | ---------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------ |
| `<name>`                    | サーバーの一意な名前。                                           | —                                      | `example-server`                                                   |
| `<commandOrUrl>`            | 実行するコマンド（`stdio` の場合）または URL（`http`/`sse` の場合）。| —                                 | `/usr/bin/python` または `http://localhost:8`                      |
| `[args...]`                 | `stdio` コマンドのオプション引数。                               | —                                      | `--port 5000`                                                      |
| `-s`, `--scope`             | 設定スコープ（user または project）。                            | `user`                                 | `-s user`                                                          |
| `-t`, `--transport`         | トランスポートタイプ（`stdio`、`sse`、`http`）。                 | `stdio`                                | `-t sse`                                                           |
| `-e`, `--env`               | 環境変数を設定する。                                             | —                                      | `-e KEY=value`                                                     |
| `-H`, `--header`            | SSE および HTTP トランスポート用の HTTP ヘッダーを設定する。     | —                                      | `-H "X-Api-Key: abc123"`                                           |
| `--timeout`                 | 接続タイムアウトをミリ秒単位で設定する。                         | —                                      | `--timeout 30000`                                                  |
| `--trust`                   | サーバーを信頼する（ツール呼び出し確認をすべてバイパス）。       | — (`false`)                            | `--trust`                                                          |
| `--description`             | サーバーの説明を設定する。                                       | —                                      | `--description "Local tools"`                                      |
| `--include-tools`           | 含めるツールのカンマ区切りリスト。                               | すべてのツールを含む                   | `--include-tools mytool,othertool`                                 |
| `--exclude-tools`           | 除外するツールのカンマ区切りリスト。                             | なし                                   | `--exclude-tools mytool`                                           |
| `--oauth-client-id`         | MCP サーバー認証用の OAuth クライアント ID。                     | —                                      | `--oauth-client-id your-client-id`                                 |
| `--oauth-client-secret`     | MCP サーバー認証用の OAuth クライアントシークレット。            | —                                      | `--oauth-client-secret your-client-secret`                         |
| `--oauth-redirect-uri`      | 認証コールバック用の OAuth リダイレクト URI。                    | `http://localhost:7777/oauth/callback` | `--oauth-redirect-uri https://your-server.com/oauth/callback`      |
| `--oauth-authorization-url` | OAuth 認可 URL。                                                 | —                                      | `--oauth-authorization-url https://provider.example.com/authorize` |
| `--oauth-token-url`         | OAuth トークン URL。                                             | —                                      | `--oauth-token-url https://provider.example.com/token`             |
| `--oauth-scopes`            | OAuth スコープ（カンマ区切り）。                                 | —                                      | `--oauth-scopes scope1,scope2`                                     |

> `--oauth-*` フラグは `--transport sse` および `--transport http` にのみ適用されます。`--transport stdio` と組み合わせると拒否されます。

#### サーバーの削除（`qwen mcp remove`）

```bash
qwen mcp remove <name>
```
