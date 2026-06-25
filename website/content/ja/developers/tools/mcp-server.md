# Qwen Code の MCP サーバー

このドキュメントでは、Qwen Code で Model Context Protocol (MCP) サーバーを設定・使用する方法を説明します。

## MCP サーバーとは？

MCP サーバーは、Model Context Protocol を通じて CLI にツールとリソースを公開するアプリケーションです。これにより、外部システムやデータソースと連携できます。MCP サーバーは、モデルとローカル環境、または API などの外部サービスとの橋渡し役を担います。

MCP サーバーを使うと、CLI は以下のことが可能になります。

- **ツールの検出:** 標準化されたスキーマ定義を通じて、利用可能なツール、その説明、パラメーターを一覧表示する。
- **ツールの実行:** 定義された引数で特定のツールを呼び出し、構造化されたレスポンスを受け取る。
- **リソースへのアクセス:** 特定のリソースからデータを読み取る（ただし CLI は主にツールの実行に焦点を当てている）。

MCP サーバーを使えば、データベース、API、カスタムスクリプト、専門的なワークフローとの連携など、組み込み機能を超えた操作に CLI の能力を拡張できます。

## コア統合アーキテクチャ

Qwen Code は、コアパッケージ（`packages/core/src/tools/`）に組み込まれた高度な検出・実行システムを通じて MCP サーバーと統合します。

### 検出レイヤー（`mcp-client.ts`）

検出プロセスは `discoverMcpTools()` によって調整され、以下を行います。

1. **設定済みサーバーを反復処理:** `settings.json` の `mcpServers` 設定から
2. **接続を確立:** 適切なトランスポートメカニズム（Stdio、SSE、Streamable HTTP）を使用
3. **ツール定義を取得:** MCP プロトコルを使用して各サーバーから
4. **サニタイズと検証:** Qwen API との互換性のためにツールスキーマを検証
5. **ツールを登録:** 競合解決を行いながらグローバルツールレジストリに登録

### 実行レイヤー（`mcp-tool.ts`）

検出された各 MCP ツールは `DiscoveredMCPTool` インスタンスにラップされ、以下を行います。

- **確認ロジックを処理:** サーバーの信頼設定とユーザーの設定に基づいて
- **ツール実行を管理:** 適切なパラメーターで MCP サーバーを呼び出す
- **レスポンスを処理:** LLM コンテキストとユーザー表示の両方に対して
- **接続状態を維持:** タイムアウトを処理する

### トランスポートメカニズム

CLI は 3 種類の MCP トランスポートをサポートします。

- **Stdio トランスポート:** サブプロセスを起動し、stdin/stdout で通信
- **SSE トランスポート:** Server-Sent Events エンドポイントに接続
- **Streamable HTTP トランスポート:** HTTP ストリーミングで通信

## MCP サーバーのセットアップ方法

Qwen Code は `settings.json` ファイルの `mcpServers` 設定を使用して MCP サーバーを検索・接続します。この設定は、異なるトランスポートメカニズムを持つ複数のサーバーをサポートします。

### settings.json で MCP サーバーを設定する

`settings.json` ファイルで MCP サーバーを設定するには主に 2 つの方法があります。特定のサーバー定義用のトップレベル `mcpServers` オブジェクトと、サーバー検出・実行を制御するグローバル設定用の `mcp` オブジェクトです。

#### グローバル MCP 設定（`mcp`）

`settings.json` の `mcp` オブジェクトを使用すると、すべての MCP サーバーに対するグローバルルールを定義できます。

- **`mcp.serverCommand`**（string）: MCP サーバーを起動するグローバルコマンド。
- **`mcp.allowed`**（string の配列）: 許可する MCP サーバー名のリスト。設定すると、このリスト（`mcpServers` オブジェクトのキーと一致するもの）のサーバーのみに接続します。
- **`mcp.excluded`**（string の配列）: 除外する MCP サーバー名のリスト。このリストのサーバーには接続しません。

**例:**

```json
{
  "mcp": {
    "allowed": ["my-trusted-server"],
    "excluded": ["experimental-server"]
  }
}
```

#### サーバー固有の設定（`mcpServers`）

`mcpServers` オブジェクトには、CLI が接続する個々の MCP サーバーを定義します。

### 設定の構造

`settings.json` ファイルに `mcpServers` オブジェクトを追加します。

```json
{ ...file contains other config objects
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

### 設定プロパティ

各サーバー設定では以下のプロパティをサポートします。

#### 必須（以下のいずれか一つ）

- **`command`**（string）: Stdio トランスポート用の実行ファイルのパス
- **`url`**（string）: SSE エンドポイント URL（例: `"http://localhost:8080/sse"`）
- **`httpUrl`**（string）: HTTP ストリーミングエンドポイント URL

#### オプション

- **`args`**（string[]）: Stdio トランスポート用のコマンドライン引数
- **`headers`**（object）: `url` または `httpUrl` 使用時のカスタム HTTP ヘッダー
- **`env`**（object）: サーバープロセスの環境変数。値は `$VAR_NAME` または `${VAR_NAME}` 構文で環境変数を参照できる
- **`cwd`**（string）: Stdio トランスポート用の作業ディレクトリ
- **`timeout`**（number）: リクエストのタイムアウト（ミリ秒、デフォルト: 600,000ms = 10 分）
- **`trust`**（boolean）: `true` の場合、このサーバーのすべてのツール呼び出し確認をバイパスする（デフォルト: `false`）
- **`includeTools`**（string[]）: この MCP サーバーから含めるツール名のリスト。指定した場合、ここに列挙したツールのみがこのサーバーから利用可能になる（許可リスト）。指定しない場合、サーバーのすべてのツールがデフォルトで有効になる。
- **`excludeTools`**（string[]）: この MCP サーバーから除外するツール名のリスト。ここに列挙したツールは、サーバーが公開していてもモデルから利用できない。**注意:** `excludeTools` は `includeTools` より優先される。両方のリストにあるツールは除外される。
- **`targetAudience`**（string）: アクセスしようとしている IAP 保護アプリケーションで許可リストに登録された OAuth クライアント ID。`authProviderType: 'service_account_impersonation'` と共に使用する。
- **`targetServiceAccount`**（string）: なりすましする Google Cloud サービスアカウントのメールアドレス。`authProviderType: 'service_account_impersonation'` と共に使用する。

### リモート MCP サーバーの OAuth サポート

Qwen Code は、SSE または HTTP トランスポートを使用するリモート MCP サーバー向けに OAuth 2.0 認証をサポートします。これにより、認証が必要な MCP サーバーへのセキュアなアクセスが可能になります。

#### OAuth の自動検出

OAuth 検出をサポートするサーバーでは、OAuth 設定を省略して CLI に自動検出させることができます。

```json
{
  "mcpServers": {
    "discoveredServer": {
      "url": "https://api.example.com/sse"
    }
  }
}
```

CLI は自動的に以下を行います。

- サーバーが OAuth 認証を必要としているか検出（401 レスポンス）
- サーバーメタデータから OAuth エンドポイントを検出
- サポートされている場合はダイナミッククライアント登録を実行
- OAuth フローとトークン管理を処理

#### 認証フロー

OAuth 対応サーバーへの接続時：

1. **初回接続試行**が 401 Unauthorized で失敗
2. **OAuth 検出**で認可・トークンエンドポイントを特定
3. **ブラウザが開き**ユーザー認証を行う（ローカルブラウザアクセスが必要）
4. **認可コード**がアクセストークンと交換される
5. **トークンが安全に保存**され将来の使用に備える
6. **接続の再試行**が有効なトークンで成功

#### ブラウザリダイレクトの要件

**重要:** OAuth 認証ではリダイレクト URI がアクセス可能である必要があります。

- **デフォルト動作**: `http://localhost:7777/oauth/callback` にリダイレクト（ローカルセットアップで動作）
- **カスタムリダイレクト URI**: `--oauth-redirect-uri` を使用するか、`settings.json` の `redirectUri` に別の URL を指定

**リモート/クラウドサーバー環境**（Web ターミナル、SSH セッション、クラウド IDE など）では：

- デフォルトの `localhost` リダイレクトは機能しない
- 公開アクセス可能な URL を指すカスタム `redirectUri` を必ず設定すること
- ユーザーのブラウザがその URL に到達でき、サーバーにリダイレクトバックできる必要がある

リモートサーバーの例：

```bash
qwen mcp add --transport sse remote-server https://api.example.com/sse/ \
  --oauth-redirect-uri https://your-remote-server.example.com/oauth/callback
```

OAuth が動作しない環境：

- ブラウザアクセスのないヘッドレス環境
- 設定した `redirectUri` にユーザーのブラウザからアクセスできない環境

#### OAuth 認証の管理

Qwen Code のインタラクティブセッション内で `/mcp` ダイアログを使用すると、MCP サーバーの確認と OAuth 認証の管理ができます。

#### OAuth 設定プロパティ

- **`enabled`**（boolean）: このサーバーで OAuth を有効にする
- **`clientId`**（string）: OAuth クライアント識別子（ダイナミック登録ではオプション）
- **`clientSecret`**（string）: OAuth クライアントシークレット（パブリッククライアントではオプション）
- **`authorizationUrl`**（string）: OAuth 認可エンドポイント（省略時は自動検出）
- **`tokenUrl`**（string）: OAuth トークンエンドポイント（省略時は自動検出）
- **`scopes`**（string[]）: 必要な OAuth スコープ
- **`redirectUri`**（string）: カスタムリダイレクト URI。**リモートデプロイ時は重要**: デフォルトは `http://localhost:7777/oauth/callback`。リモート/クラウドサーバーで Qwen Code を実行する場合、公開アクセス可能な URL に設定すること（例: `https://your-server.com/oauth/callback`）。`qwen mcp add --oauth-redirect-uri` または `settings.json` で直接設定できる。
- **`tokenParamName`**（string）: SSE URL でトークンを渡すクエリパラメーター名
- **`audiences`**（string[]）: トークンが有効なオーディエンス

#### トークン管理

OAuth トークンは自動的に以下の処理が行われます。

- **保存:** デフォルトでは `~/.qwen/mcp-oauth-tokens.json`（プレーンテキスト、モード 0600）。`QWEN_CODE_FORCE_ENCRYPTED_FILE_STORAGE=true` が設定されている場合、利用可能であればキーチェーンバックストレージを使用し、そうでなければ AES-256-GCM 暗号化を用いた `~/.qwen/mcp-oauth-tokens-v2.json` を使用する。
- **更新:** 期限切れ時（リフレッシュトークンが利用可能な場合）
- **検証:** 各接続試行前
- **クリーンアップ:** 無効または期限切れ時

> [!WARNING]
> デフォルトでは、OAuth トークンはディスク上に暗号化されずに保存されます。共有または複数ユーザーのマシンでは、`QWEN_CODE_FORCE_ENCRYPTED_FILE_STORAGE=true` を設定して認証情報を保護してください。

#### 認証プロバイダーの種類

`authProviderType` プロパティを使用して認証プロバイダーの種類を指定できます。

- **`authProviderType`**（string）: 認証プロバイダーを指定する。以下のいずれかを指定：
  - **`dynamic_discovery`**（デフォルト）: CLI がサーバーから OAuth 設定を自動検出する。
  - **`google_credentials`**: CLI が Google Application Default Credentials（ADC）を使用してサーバーに認証する。このプロバイダーを使用する場合は必要なスコープを指定すること。
  - **`service_account_impersonation`**: CLI が Google Cloud サービスアカウントになりすましてサーバーに認証する。IAP 保護サービス（特に Cloud Run サービス向けに設計）にアクセスする際に有用。

#### Google Credentials

```json
{
  "mcpServers": {
    "googleCloudServer": {
      "httpUrl": "https://my-gcp-service.run.app/mcp",
      "authProviderType": "google_credentials",
      "oauth": {
        "scopes": ["https://www.googleapis.com/auth/userinfo.email"]
      }
    }
  }
}
```

#### サービスアカウントのなりすまし

サービスアカウントのなりすましを使用してサーバーに認証するには、`authProviderType` を `service_account_impersonation` に設定し、以下のプロパティを指定します。

- **`targetAudience`**（string）: アクセスしようとしている IAP 保護アプリケーションで許可リストに登録された OAuth クライアント ID。
- **`targetServiceAccount`**（string）: なりすましする Google Cloud サービスアカウントのメールアドレス。

CLI はローカルの Application Default Credentials（ADC）を使用して、指定したサービスアカウントとオーディエンス向けの OIDC ID トークンを生成します。このトークンが MCP サーバーへの認証に使用されます。

#### セットアップ手順

1. **[OAuth 2.0 クライアント ID を作成する](https://cloud.google.com/iap/docs/oauth-client-creation)か既存のものを使用する。** 既存の OAuth 2.0 クライアント ID を使用するには、[OAuth クライアントの共有方法](https://cloud.google.com/iap/docs/sharing-oauth-clients)の手順に従う。
2. **アプリケーションの[プログラマティックアクセス](https://cloud.google.com/iap/docs/sharing-oauth-clients#programmatic_access)の許可リストに OAuth ID を追加する。** Cloud Run は gcloud iap でサポートされているリソースタイプではないため、プロジェクトでクライアント ID を許可リストに登録する必要がある。
3. **サービスアカウントを作成する。** [ドキュメント](https://cloud.google.com/iam/docs/service-accounts-create#creating)、[Cloud Console リンク](https://console.cloud.google.com/iam-admin/serviceaccounts)
4. **Cloud Run サービス自体の「セキュリティ」タブまたは gcloud を通じて、IAP ポリシーにサービスアカウントとユーザーの両方を追加する。**
5. **MCP サーバーにアクセスするすべてのユーザーとグループに**、[サービスアカウントをなりすます](https://cloud.google.com/docs/authentication/use-service-account-impersonation)ための必要な権限（`roles/iam.serviceAccountTokenCreator`）を付与する。
6. **プロジェクトで [IAM Credentials API を有効にする](https://console.cloud.google.com/apis/library/iamcredentials.googleapis.com)。**

### 設定例

#### Python MCP サーバー（Stdio）

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

#### Node.js MCP サーバー（Stdio）

```json
{
  "mcpServers": {
    "nodeServer": {
      "command": "node",
      "args": ["dist/server.js", "--verbose"],
      "cwd": "./mcp-servers/node",
      "trust": true
    }
  }
}
```

#### Docker ベースの MCP サーバー

```json
{
  "mcpServers": {
    "dockerizedServer": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-e",
        "API_KEY",
        "-v",
        "${PWD}:/workspace",
        "my-mcp-server:latest"
      ],
      "env": {
        "API_KEY": "$EXTERNAL_SERVICE_TOKEN"
      }
    }
  }
}
```

#### HTTP ベースの MCP サーバー

```json
{
  "mcpServers": {
    "httpServer": {
      "httpUrl": "http://localhost:3000/mcp",
      "timeout": 5000
    }
  }
}
```

#### カスタムヘッダー付き HTTP ベースの MCP サーバー

```json
{
  "mcpServers": {
    "httpServerWithAuth": {
      "httpUrl": "http://localhost:3000/mcp",
      "headers": {
        "Authorization": "Bearer your-api-token",
        "X-Custom-Header": "custom-value",
        "Content-Type": "application/json"
      },
      "timeout": 5000
    }
  }
}
```

#### ツールフィルタリング付き MCP サーバー

```json
{
  "mcpServers": {
    "filteredServer": {
      "command": "python",
      "args": ["-m", "my_mcp_server"],
      "includeTools": ["safe_tool", "file_reader", "data_processor"],
      // "excludeTools": ["dangerous_tool", "file_deleter"],
      "timeout": 30000
    }
  }
}
```

### SA なりすまし付き SSE MCP サーバー

```json
{
  "mcpServers": {
    "myIapProtectedServer": {
      "url": "https://my-iap-service.run.app/sse",
      "authProviderType": "service_account_impersonation",
      "targetAudience": "YOUR_IAP_CLIENT_ID.apps.googleusercontent.com",
      "targetServiceAccount": "your-sa@your-project.iam.gserviceaccount.com"
    }
  }
}
```

## 検出プロセスの詳細

Qwen Code が起動すると、以下の詳細なプロセスで MCP サーバーの検出を行います。

### 1. サーバーの反復処理と接続

`mcpServers` に設定された各サーバーに対して：

1. **ステータス追跡を開始:** サーバーのステータスが `CONNECTING` に設定される
2. **トランスポートの選択:** 設定プロパティに基づいて：
   - `httpUrl` → `StreamableHTTPClientTransport`
   - `url` → `SSEClientTransport`
   - `command` → `StdioClientTransport`
3. **接続確立:** MCP クライアントが設定されたタイムアウトで接続を試みる
4. **エラー処理:** 接続失敗はログに記録され、サーバーステータスが `DISCONNECTED` に設定される

### 2. ツールの検出

接続が成功した場合：

1. **ツール一覧取得:** クライアントが MCP サーバーのツール一覧エンドポイントを呼び出す
2. **スキーマ検証:** 各ツールの関数宣言が検証される
3. **ツールフィルタリング:** `includeTools` と `excludeTools` の設定に基づいてツールがフィルタリングされる
4. **名前のサニタイズ:** ツール名が Qwen API の要件を満たすようにクリーニングされる：
   - 無効な文字（英数字、アンダースコア、ドット、ハイフン以外）はアンダースコアで置き換えられる
   - 63 文字を超える名前は中間置換（`___`）によって短縮される

### 3. 競合解決

複数のサーバーが同じ名前のツールを公開している場合：

1. **先着優先:** 最初にツール名を登録したサーバーがプレフィックスなしの名前を取得
2. **自動プレフィックス付与:** 後続のサーバーにはプレフィックス付きの名前が付く：`serverName__toolName`
3. **レジストリ追跡:** ツールレジストリがサーバー名とそのツール間のマッピングを保持

### 4. スキーマ処理

ツールパラメータースキーマは API 互換性のためにサニタイズされます。

- **`$schema` プロパティ**が削除される
- **`additionalProperties`** が除去される
- **`default` を持つ `anyOf`** のデフォルト値が削除される（Vertex AI 互換性）
- **再帰的処理**がネストされたスキーマに適用される

### 5. 接続管理

検出後：

- **永続的な接続:** ツールの登録に成功したサーバーは接続を維持する
- **クリーンアップ:** 利用可能なツールを提供しないサーバーへの接続は自動的に閉じられる
- **ステータス更新:** 最終的なサーバーステータスが `CONNECTED` または `DISCONNECTED` に設定される

## ツール実行フロー

モデルが MCP ツールの使用を決定すると、以下の実行フローが発生します。

### 1. ツールの呼び出し

モデルが以下を含む `FunctionCall` を生成します。

- **ツール名:** 登録された名前（プレフィックス付きの場合あり）
- **引数:** ツールのパラメータースキーマに一致する JSON オブジェクト

### 2. 確認プロセス

各 `DiscoveredMCPTool` は高度な確認ロジックを実装しています。

#### 信頼ベースのバイパス

```typescript
if (this.trust) {
  return false; // No confirmation needed
}
```

#### ダイナミック許可リスト

システムは以下の内部許可リストを保持します。

- **サーバーレベル:** `serverName` → このサーバーのすべてのツールが信頼される
- **ツールレベル:** `serverName.toolName` → この特定のツールが信頼される

#### ユーザーの選択処理

確認が必要な場合、ユーザーは以下を選択できます。

- **今回のみ実行:** 今回だけ実行する
- **このツールを常に許可:** ツールレベルの許可リストに追加
- **このサーバーを常に許可:** サーバーレベルの許可リストに追加
- **キャンセル:** 実行を中止

### 3. 実行

確認後（または信頼バイパス時）：

1. **パラメーターの準備:** 引数がツールのスキーマに対して検証される
2. **MCP 呼び出し:** 基となる `CallableTool` が以下でサーバーを呼び出す：

   ```typescript
   const functionCalls = [
     {
       name: this.serverToolName, // Original server tool name
       args: params,
     },
   ];
   ```

3. **レスポンス処理:** 結果が LLM コンテキストとユーザー表示の両方向けにフォーマットされる

### 4. レスポンス処理

実行結果には以下が含まれます。

- **`llmContent`:** 言語モデルのコンテキスト用の生レスポンスパーツ
- **`returnDisplay`:** ユーザー表示用にフォーマットされた出力（多くの場合、markdown コードブロック内の JSON）

## MCP サーバーとの対話方法

### `/mcp` コマンドの使用

`/mcp` コマンドは MCP サーバーのセットアップに関する包括的な情報を提供します。

```bash
/mcp
```

表示内容：

- **サーバーリスト:** 設定されているすべての MCP サーバー
- **接続ステータス:** `CONNECTED`、`CONNECTING`、または `DISCONNECTED`
- **サーバー詳細:** 設定の概要（機密データを除く）
- **利用可能なツール:** 各サーバーのツールリストと説明
- **検出状態:** 全体的な検出プロセスのステータス

### `/mcp` の出力例

```
MCP Servers Status:

📡 pythonTools (CONNECTED)
  Command: python -m my_mcp_server --port 8080
  Working Directory: ./mcp-servers/python
  Timeout: 15000ms
  Tools: calculate_sum, file_analyzer, data_processor

🔌 nodeServer (DISCONNECTED)
  Command: node dist/server.js --verbose
  Error: Connection refused

🐳 dockerizedServer (CONNECTED)
  Command: docker run -i --rm -e API_KEY my-mcp-server:latest
  Tools: docker__deploy, docker__status

Discovery State: COMPLETED
```

### ツールの使用

検出されると、MCP ツールは組み込みツールと同様に Qwen モデルから利用できます。モデルは自動的に以下を行います。

1. **適切なツールを選択:** リクエストに基づいて
2. **確認ダイアログを表示:** （サーバーが信頼されていない場合）
3. **ツールを実行:** 適切なパラメーターで
4. **結果を表示:** ユーザーフレンドリーな形式で

## ステータスの監視とトラブルシューティング

### 接続状態

MCP 統合はいくつかの状態を追跡します。

#### サーバーステータス（`MCPServerStatus`）

- **`DISCONNECTED`:** サーバーが接続されていないかエラーがある
- **`CONNECTING`:** 接続試行中
- **`CONNECTED`:** サーバーが接続されて準備完了

#### 検出状態（`MCPDiscoveryState`）

- **`NOT_STARTED`:** 検出がまだ開始されていない
- **`IN_PROGRESS`:** 現在サーバーを検出中
- **`COMPLETED`:** 検出が完了（エラーの有無にかかわらず）

### よくある問題と解決策

#### サーバーが接続しない

**症状:** サーバーが `DISCONNECTED` ステータスを示す

**トラブルシューティング:**

1. **設定を確認:** `command`、`args`、`cwd` が正しいか確認する
2. **手動でテスト:** サーバーコマンドを直接実行して動作確認する
3. **依存関係を確認:** 必要なパッケージがすべてインストールされているか確認する
4. **ログを確認:** CLI 出力のエラーメッセージを確認する
5. **権限を確認:** CLI がサーバーコマンドを実行できるか確認する

#### ツールが検出されない

**症状:** サーバーは接続するがツールが利用できない

**トラブルシューティング:**

1. **ツール登録を確認:** サーバーが実際にツールを登録しているか確認する
2. **MCP プロトコルを確認:** サーバーが MCP ツール一覧を正しく実装しているか確認する
3. **サーバーログを確認:** サーバー側のエラーの stderr 出力を確認する
4. **ツール一覧をテスト:** サーバーのツール検出エンドポイントを手動でテストする

#### ツールが実行されない

**症状:** ツールは検出されるが実行中に失敗する

**トラブルシューティング:**

1. **パラメーター検証:** ツールが期待するパラメーターを受け入れるか確認する
2. **スキーマ互換性:** 入力スキーマが有効な JSON Schema であるか確認する
3. **エラー処理:** ツールが未処理の例外を投げていないか確認する
4. **タイムアウトの問題:** `timeout` 設定の増加を検討する

#### サンドボックス互換性

**症状:** サンドボックスが有効な場合に MCP サーバーが失敗する

**解決策:**

1. **Docker ベースのサーバー:** すべての依存関係を含む Docker コンテナを使用する
2. **パスのアクセス可能性:** サーバー実行ファイルがサンドボックス内で利用可能か確認する
3. **ネットワークアクセス:** 必要なネットワーク接続を許可するようサンドボックスを設定する
4. **環境変数:** 必要な環境変数が正しく渡されているか確認する

### デバッグのヒント

1. **デバッグモードを有効にする:** CLI を `--debug` で実行して詳細な出力を得る
2. **stderr を確認:** MCP サーバーの stderr はキャプチャされてログに記録される（INFO メッセージはフィルタリング）
3. **分離してテスト:** 統合前に MCP サーバーを独立してテストする
4. **段階的なセットアップ:** 複雑な機能を追加する前にシンプルなツールから始める
5. **`/mcp` を頻繁に使用:** 開発中にサーバーステータスを監視する

## 重要な注意事項

### セキュリティに関する考慮事項

- **信頼設定:** `trust` オプションはすべての確認ダイアログをバイパスする。完全に管理下にあるサーバーに対してのみ慎重に使用すること
- **アクセストークン:** API キーやトークンを含む環境変数を設定する際はセキュリティを意識すること
- **サンドボックス互換性:** サンドボックスを使用する場合、MCP サーバーがサンドボックス環境内で利用可能であることを確認すること
- **プライベートデータ:** 広いスコープの個人アクセストークンを使用すると、リポジトリ間で情報が漏洩する可能性がある

### パフォーマンスとリソース管理

- **接続の永続性:** CLI はツールの登録に成功したサーバーへの永続的な接続を維持する
- **自動クリーンアップ:** ツールを提供しないサーバーへの接続は自動的に閉じられる
- **タイムアウト管理:** サーバーのレスポンス特性に基づいて適切なタイムアウトを設定すること
- **リソース監視:** MCP サーバーは別プロセスとして実行され、システムリソースを消費する

### スキーマ互換性

- **スキーマコンプライアンスモード:** デフォルト（`schemaCompliance: "auto"`）では、ツールスキーマはそのまま渡される。`settings.json` に `"model": { "generationConfig": { "schemaCompliance": "openapi_30" } }` を設定すると、モデルを Strict OpenAPI 3.0 形式に変換する。
- **OpenAPI 3.0 変換:** `openapi_30` モードが有効な場合、システムは以下を処理する：
  - Nullable 型: `["string", "null"]` → `type: "string", nullable: true`
  - Const 値: `const: "foo"` → `enum: ["foo"]`
  - 排他的な制限: 数値の `exclusiveMinimum` → `minimum` を使用した boolean 形式
  - キーワードの削除: `$schema`、`$id`、`dependencies`、`patternProperties`
- **名前のサニタイズ:** ツール名は API の要件を満たすように自動的にサニタイズされる
- **競合解決:** サーバー間のツール名の競合は自動的なプレフィックス付与によって解決される

この包括的な統合により、MCP サーバーはセキュリティ、信頼性、使いやすさを維持しながら CLI の機能を拡張する強力な手段となります。

## ツールからリッチなコンテンツを返す

MCP ツールはシンプルなテキストを返すだけに留まりません。テキスト、画像、音声、その他のバイナリデータを含むリッチなマルチパートコンテンツを単一のツールレスポンスで返すことができます。これにより、1 回のターンでモデルに多様な情報を提供できる強力なツールを構築できます。

ツールから返されたすべてのデータは処理され、次の生成のためのコンテキストとしてモデルに送られ、提供された情報を推論したり要約したりできるようになります。

### 仕組み

リッチなコンテンツを返すには、ツールのレスポンスが MCP 仕様の [`CallToolResult`](https://modelcontextprotocol.io/specification/2025-06-18/server/tools#tool-result) に準拠している必要があります。結果の `content` フィールドは `ContentBlock` オブジェクトの配列である必要があります。CLI はこの配列を正しく処理し、テキストとバイナリデータを分離してモデル向けにパッケージングします。

`content` 配列では異なるコンテンツブロックタイプを組み合わせることができます。サポートされているブロックタイプは以下の通りです。

- `text`
- `image`
- `audio`
- `resource`（埋め込みコンテンツ）
- `resource_link`

### 例: テキストと画像を返す

テキストの説明と画像の両方を返す MCP ツールの有効な JSON レスポンスの例です。

```json
{
  "content": [
    {
      "type": "text",
      "text": "Here is the logo you requested."
    },
    {
      "type": "image",
      "data": "BASE64_ENCODED_IMAGE_DATA_HERE",
      "mimeType": "image/png"
    },
    {
      "type": "text",
      "text": "The logo was created in 2025."
    }
  ]
}
```

Qwen Code がこのレスポンスを受け取ると、以下を行います。

1.  すべてのテキストを抽出し、モデル向けの単一の `functionResponse` パーツに結合する。
2.  画像データを別の `inlineData` パーツとして提供する。
3.  テキストと画像の両方が受信されたことを示す、わかりやすい概要を CLI に表示する。

これにより、Qwen モデルにリッチなマルチモーダルコンテキストを提供できる高度なツールを構築できます。

## スラッシュコマンドとしての MCP プロンプト

ツールに加えて、MCP サーバーは Qwen Code 内でスラッシュコマンドとして実行できる定義済みプロンプトを公開できます。これにより、名前で簡単に呼び出せる一般的なクエリや複雑なクエリへのショートカットを作成できます。

### サーバーでのプロンプトの定義

プロンプトを定義する stdio MCP サーバーの小さな例を以下に示します。

```ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({
  name: 'prompt-server',
  version: '1.0.0',
});

server.registerPrompt(
  'poem-writer',
  {
    title: 'Poem Writer',
    description: 'Write a nice haiku',
    argsSchema: { title: z.string(), mood: z.string().optional() },
  },
  ({ title, mood }) => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Write a haiku${mood ? ` with the mood ${mood}` : ''} called ${title}. Note that a haiku is 5 syllables followed by 7 syllables followed by 5 syllables `,
        },
      },
    ],
  }),
);

const transport = new StdioServerTransport();
await server.connect(transport);
```

これは `settings.json` の `mcpServers` に以下で含めることができます。

```json
{
  "mcpServers": {
    "nodeServer": {
      "command": "node",
      "args": ["filename.ts"]
    }
  }
}
```

### プロンプトの呼び出し

プロンプトが検出されると、その名前をスラッシュコマンドとして使用して呼び出せます。CLI は引数の解析を自動的に処理します。

```bash
/poem-writer --title="Qwen Code" --mood="reverent"
```

または位置引数を使用して：

```bash
/poem-writer "Qwen Code" reverent
```

このコマンドを実行すると、CLI は提供された引数で MCP サーバーの `prompts/get` メソッドを実行します。サーバーは引数をプロンプトテンプレートに代入し、最終的なプロンプトテキストを返す役割を担います。CLI はこのプロンプトをモデルに送って実行します。これにより、一般的なワークフローを自動化・共有する便利な方法が提供されます。

## `qwen mcp` を使った MCP サーバーの管理

`settings.json` ファイルを手動で編集して MCP サーバーを設定することもできますが、CLI にはサーバー設定をプログラムで管理するための便利なコマンドセットが用意されています。これらのコマンドにより、JSON ファイルを直接編集せずにサーバーの追加、一覧表示、削除を効率化できます。

### サーバーの追加（`qwen mcp add`）

`add` コマンドは `settings.json` に新しい MCP サーバーを設定します。スコープ（`-s, --scope`）に基づいて、ユーザー設定 `~/.qwen/settings.json` またはプロジェクト設定 `.qwen/settings.json` ファイルに追加されます。

**コマンド:**

```bash
qwen mcp add [options] <name> <commandOrUrl> [args...]
```

- `<name>`: サーバーの一意の名前。
- `<commandOrUrl>`: 実行するコマンド（`stdio` の場合）または URL（`http`/`sse` の場合）。
- `[args...]`: `stdio` コマンドのオプション引数。

**オプション（フラグ）:**

- `-s, --scope`: 設定スコープ（user または project）。[デフォルト: "project"]
- `-t, --transport`: トランスポートタイプ（stdio、sse、http）。[デフォルト: "stdio"]
- `-e, --env`: 環境変数を設定する（例: -e KEY=value）。
- `-H, --header`: SSE および HTTP トランスポートの HTTP ヘッダーを設定する（例: -H "X-Api-Key: abc123" -H "Authorization: Bearer abc123"）。
- `--timeout`: 接続タイムアウトをミリ秒で設定する。
- `--trust`: サーバーを信頼する（すべてのツール呼び出し確認プロンプトをバイパス）。
- `--description`: サーバーの説明を設定する。
- `--include-tools`: 含めるツールのカンマ区切りリスト。
- `--exclude-tools`: 除外するツールのカンマ区切りリスト。
- `--oauth-client-id`: MCP サーバー認証用の OAuth クライアント ID。
- `--oauth-client-secret`: MCP サーバー認証用の OAuth クライアントシークレット。
- `--oauth-redirect-uri`: OAuth リダイレクト URI（例: `https://your-server.com/oauth/callback`）。ローカルセットアップではデフォルトで `http://localhost:7777/oauth/callback`。**リモートデプロイ時は重要**: リモート/クラウドサーバーで Qwen Code を実行する場合、公開アクセス可能な URL に設定すること。
- `--oauth-authorization-url`: OAuth 認可 URL。
- `--oauth-token-url`: OAuth トークン URL。
- `--oauth-scopes`: OAuth スコープ（カンマ区切り）。

#### stdio サーバーの追加

これはローカルサーバーを実行するためのデフォルトトランスポートです。

```bash
# 基本的な構文
qwen mcp add <name> <command> [args...]

# 例: ローカルサーバーの追加
qwen mcp add my-stdio-server -e API_KEY=123 /path/to/server arg1 arg2 arg3

# 例: ローカル Python サーバーの追加
qwen mcp add python-server python server.py --port 8080
```

#### HTTP サーバーの追加

このトランスポートは Streamable HTTP トランスポートを使用するサーバー向けです。

```bash
# 基本的な構文
qwen mcp add --transport http <name> <url>

# 例: HTTP サーバーの追加
qwen mcp add --transport http http-server https://api.example.com/mcp/

# 例: 認証ヘッダー付き HTTP サーバーの追加
qwen mcp add --transport http secure-http https://api.example.com/mcp/ --header "Authorization: Bearer abc123"
```

#### SSE サーバーの追加

このトランスポートは Server-Sent Events（SSE）を使用するサーバー向けです。

```bash
# 基本的な構文
qwen mcp add --transport sse <name> <url>

# 例: SSE サーバーの追加
qwen mcp add --transport sse sse-server https://api.example.com/sse/

# 例: 認証ヘッダー付き SSE サーバーの追加
qwen mcp add --transport sse secure-sse https://api.example.com/sse/ --header "Authorization: Bearer abc123"

# 例: OAuth 対応 SSE サーバーの追加
qwen mcp add --transport sse oauth-server https://api.example.com/sse/ \
  --oauth-client-id your-client-id \
  --oauth-redirect-uri https://your-server.com/oauth/callback \
  --oauth-authorization-url https://provider.example.com/authorize \
  --oauth-token-url https://provider.example.com/token
```

### サーバーの管理（`/mcp`）

現在設定されているすべての MCP サーバーを表示・管理するには、Qwen Code のインタラクティブセッション内で `/mcp` ダイアログを開きます。このダイアログでは以下ができます。

- 接続ステータスとともにすべての MCP サーバーを表示
- サーバーの有効化/無効化
- 切断されたサーバーへの再接続
- 各サーバーが提供するツールとプロンプトの表示
- サーバーログの表示

**コマンド:**

```bash
qwen
```

次に入力：

```text
/mcp
```

管理ダイアログには、各サーバーの名前、設定の詳細、接続ステータス、利用可能なツール/プロンプトを示すビジュアルインターフェースが表示されます。

### サーバーの削除（`qwen mcp remove`）

設定からサーバーを削除するには、サーバー名を指定して `remove` コマンドを使用します。

**コマンド:**

```bash
qwen mcp remove <name>
```

**例:**

```bash
qwen mcp remove my-server
```

これにより、スコープ（`-s, --scope`）に基づいて適切な `settings.json` ファイルの `mcpServers` オブジェクトから "my-server" エントリが検索され削除されます。
