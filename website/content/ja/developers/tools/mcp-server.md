# Qwen Code での MCP サーバー

このドキュメントでは、Qwen Code で Model Context Protocol (MCP) サーバーを構成および使用する方法について説明します。

## MCP サーバーとは？

MCP サーバーは、Model Context Protocol を介して CLI にツールとリソースを公開するアプリケーションであり、外部システムやデータソースとの対話を可能にします。MCP サーバーは、モデルとローカル環境、または API などの他のサービスとの間のブリッジとして機能します。

MCP サーバーを使用すると、CLI は以下のことが可能になります：

- **ツールの検出:** 標準化されたスキーマ定義を通じて、利用可能なツール、その説明、パラメータを一覧表示します。
- **ツールの実行:** 定義された引数で特定のツールを呼び出し、構造化されたレスポンスを受け取ります。
- **リソースへのアクセス:** 特定のリソースからデータを読み取ります（CLI は主にツールの実行に焦点を当てています）。

MCP サーバーを使用することで、データベース、API、カスタムスクリプト、または専門的なワークフローとの対話など、組み込み機能を超えたアクションを実行するように CLI の機能を拡張できます。

## コア統合アーキテクチャ

Qwen Code は、コアパッケージ（`packages/core/src/tools/`）に組み込まれた高度な検出および実行システムを通じて MCP サーバーと統合されます：

### 検出レイヤー（`mcp-client.ts`）

検出プロセスは `discoverMcpTools()` によって調整され、以下の処理を行います：

1. `settings.json` の `mcpServers` 設定から**構成済みサーバーを反復処理**
2. 適切なトランスポートメカニズム（Stdio、SSE、または Streamable HTTP）を使用して**接続を確立**
3. MCP プロトコルを使用して各サーバーから**ツール定義を取得**
4. Qwen API との互換性のためにツールスキーマを**サニタイズおよび検証**
5. 競合解決を行いながら**ツールをグローバルツールレジストリに登録**

### 実行レイヤー（`mcp-tool.ts`）

検出された各 MCP ツールは `DiscoveredMCPTool` インスタンスでラップされ、以下の処理を行います：

- サーバーの信頼設定とユーザーの設定に基づいて**確認ロジックを処理**
- 適切なパラメータで MCP サーバーを呼び出して**ツールの実行を管理**
- LLM コンテキストとユーザー表示の両方に対して**レスポンスを処理**
- **接続状態を維持**し、タイムアウトを処理

### トランスポートメカニズム

CLI は以下の 3 つの MCP トランスポートタイプをサポートしています：

- **Stdio トランスポート:** サブプロセスを起動し、stdin/stdout を介して通信
- **SSE トランスポート:** Server-Sent Events エンドポイントに接続
- **Streamable HTTP トランスポート:** 通信に HTTP ストリーミングを使用

## MCP サーバーのセットアップ方法

Qwen Code は `settings.json` ファイル内の `mcpServers` 設定を使用して MCP サーバーを検出し、接続します。この設定は、異なるトランスポートメカニズムを持つ複数のサーバーをサポートしています。

### settings.json での MCP サーバーの構成

`settings.json` ファイルで MCP サーバーを構成するには、主に 2 つの方法があります。特定のサーバー定義にはトップレベルの `mcpServers` オブジェクトを、サーバーの検出と実行を制御するグローバル設定には `mcp` オブジェクトを使用します。

#### グローバル MCP 設定（`mcp`）

`settings.json` 内の `mcp` オブジェクトを使用すると、すべての MCP サーバーに対するグローバルルールを定義できます。

- **`mcp.serverCommand`** (string): MCP サーバーを起動するグローバルコマンド。
- **`mcp.allowed`** (string の配列): 許可する MCP サーバー名のリスト。設定されている場合、このリスト内のサーバー（`mcpServers` オブジェクトのキーと一致するもの）のみが接続されます。
- **`mcp.excluded`** (string の配列): 除外する MCP サーバー名のリスト。このリスト内のサーバーには接続されません。

**例:**

```json
{
  "mcp": {
    "allowed": ["my-trusted-server"],
    "excluded": ["experimental-server"]
  }
}
```

#### サーバー固有の構成（`mcpServers`）

`mcpServers` オブジェクトは、CLI が接続する個々の MCP サーバーを定義する場所です。

### 構成構造

`settings.json` ファイルに `mcpServers` オブジェクトを追加します：

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

### 構成プロパティ

各サーバー構成は以下のプロパティをサポートしています：

#### 必須（以下のいずれか）

- **`command`** (string): Stdio トランスポート用の実行ファイルへのパス
- **`url`** (string): SSE エンドポイント URL（例：`"http://localhost:8080/sse"`）
- **`httpUrl`** (string): HTTP ストリーミングエンドポイント URL

#### オプション

- **`args`** (string[]): Stdio トランスポート用のコマンドライン引数
- **`headers`** (object): `url` または `httpUrl` を使用する場合のカスタム HTTP ヘッダー
- **`env`** (object): サーバープロセスの環境変数。値は `$VAR_NAME` または `${VAR_NAME}` 構文を使用して環境変数を参照できます
- **`cwd`** (string): Stdio トランスポートの作業ディレクトリ
- **`timeout`** (number): リクエストのタイムアウト（ミリ秒単位）（デフォルト：600,000ms = 10 分）
- **`trust`** (boolean): `true` の場合、このサーバーのすべてのツール呼び出し確認をバイパスします（デフォルト：`false`）
- **`includeTools`** (string[]): この MCP サーバーから含めるツール名のリスト。指定した場合、ここにリストされたツールのみがこのサーバーから利用可能になります（許可リスト動作）。指定しない場合、サーバーのすべてのツールがデフォルトで有効になります。
- **`excludeTools`** (string[]): この MCP サーバーから除外するツール名のリスト。ここにリストされたツールは、サーバーによって公開されている場合でもモデルでは利用できません。**注:** `excludeTools` は `includeTools` より優先されます。両方のリストにツールが含まれている場合、除外されます。
- **`targetAudience`** (string): アクセスしようとしている IAP 保護アプリケーションで許可リストに登録されている OAuth クライアント ID。`authProviderType: 'service_account_impersonation'` と組み合わせて使用します。
- **`targetServiceAccount`** (string): なりすます Google Cloud サービスアカウントのメールアドレス。`authProviderType: 'service_account_impersonation'` と組み合わせて使用します。

### リモート MCP サーバーの OAuth サポート

Qwen Code は、SSE または HTTP トランスポートを使用するリモート MCP サーバーの OAuth 2.0 認証をサポートしています。これにより、認証が必要な MCP サーバーへの安全なアクセスが可能になります。

#### 自動 OAuth 検出

OAuth 検出をサポートするサーバーの場合、OAuth 構成を省略し、CLI に自動的に検出させることができます：

```json
{
  "mcpServers": {
    "discoveredServer": {
      "url": "https://api.example.com/sse"
    }
  }
}
```

CLI は自動的に以下の処理を行います：

- サーバーが OAuth 認証を必要とするタイミング（401 レスポンス）を検出
- サーバーメタデータから OAuth エンドポイントを検出
- サポートされている場合は動的クライアント登録を実行
- OAuth フローとトークン管理を処理

#### 認証フロー

OAuth 対応サーバーに接続する場合：

1. **初期接続試行**が 401 Unauthorized で失敗
2. **OAuth 検出**が認可エンドポイントとトークンエンドポイントを特定
3. ユーザー認証のために**ブラウザが開く**（ローカルブラウザへのアクセスが必要）
4. **認可コード**がアクセストークンと交換される
5. **トークン**が将来の使用のために安全に保存される
6. 有効なトークンを使用して**接続再試行**が成功

#### ブラウザリダイレクトの要件

**重要:** OAuth 認証では、リダイレクト URI にアクセスできる必要があります：

- **デフォルトの動作:** `http://localhost:7777/oauth/callback` にリダイレクト（ローカル環境で動作）
- **カスタムリダイレクト URI:** `--oauth-redirect-uri` を使用するか、settings.json で `redirectUri` を構成して別の URL を指定

**リモート/クラウドサーバーデプロイメント**（例：Web ターミナル、SSH セッション、クラウド IDE）の場合：

- デフォルトの `localhost` リダイレクトは機能**しません**
- 公開アクセス可能な URL を指すカスタム `redirectUri` を構成**する必要があります**
- ユーザーのブラウザがこの URL に到達し、サーバーにリダイレクトバックできる必要があります

リモートサーバーの例：

```bash
qwen mcp add --transport sse remote-server https://api.example.com/sse/ \
  --oauth-redirect-uri https://your-remote-server.example.com/oauth/callback
```

OAuth は以下の環境では機能しません：

- ブラウザアクセスのないヘッドレス環境
- 構成された `redirectUri` にユーザーのブラウザから到達できない環境

#### OAuth 認証の管理

`/mcp auth` コマンドを使用して OAuth 認証を管理します：

```bash
# List servers requiring authentication
/mcp auth

# Authenticate with a specific server
/mcp auth serverName

# Re-authenticate if tokens expire
/mcp auth serverName
```

#### OAuth 構成プロパティ

- **`enabled`** (boolean): このサーバーの OAuth を有効にする
- **`clientId`** (string): OAuth クライアント識別子（動的登録の場合はオプション）
- **`clientSecret`** (string): OAuth クライアントシークレット（パブリッククライアントの場合はオプション）
- **`authorizationUrl`** (string): OAuth 認可エンドポイント（省略した場合は自動検出）
- **`tokenUrl`** (string): OAuth トークンエンドポイント（省略した場合は自動検出）
- **`scopes`** (string[]): 必要な OAuth スコープ
- **`redirectUri`** (string): カスタムリダイレクト URI。**リモートデプロイメントで重要**: デフォルトは `http://localhost:7777/oauth/callback` です。Qwen Code をリモート/クラウドサーバーで実行する場合は、公開アクセス可能な URL（例：`https://your-server.com/oauth/callback`）に設定します。`qwen mcp add --oauth-redirect-uri` または settings.json で直接構成できます。
- **`tokenParamName`** (string): SSE URL 内のトークンのクエリパラメータ名
- **`audiences`** (string[]): トークンが有効なオーディエンス

#### トークン管理

OAuth トークンは自動的に以下の処理が行われます：

- `~/.qwen/mcp-oauth-tokens.json` に**安全に保存**
- 期限切れになると**更新**（リフレッシュトークンが利用可能な場合）
- 各接続試行の前に**検証**
- 無効または期限切れの場合は**クリーンアップ**

#### 認証プロバイダータイプ

`authProviderType` プロパティを使用して認証プロバイダータイプを指定できます：

- **`authProviderType`** (string): 認証プロバイダーを指定します。以下のいずれかになります：
  - **`dynamic_discovery`**（デフォルト）: CLI がサーバーから OAuth 構成を自動的に検出します。
  - **`google_credentials`**: CLI が Google Application Default Credentials (ADC) を使用してサーバーを認証します。このプロバイダーを使用する場合は、必要なスコープを指定する必要があります。
  - **`service_account_impersonation`**: CLI が Google Cloud サービスアカウントになりすましてサーバーを認証します。IAP 保護サービスへのアクセスに便利です（Cloud Run サービス向けに特別に設計されています）。

#### Google 認証情報

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

サービスアカウントのなりすましを使用してサーバーを認証するには、`authProviderType` を `service_account_impersonation` に設定し、以下のプロパティを提供する必要があります：

- **`targetAudience`** (string): アクセスしようとしている IAP 保護アプリケーションで許可リストに登録されている OAuth クライアント ID。
- **`targetServiceAccount`** (string): なりすます Google Cloud サービスアカウントのメールアドレス。

CLI はローカルの Application Default Credentials (ADC) を使用して、指定されたサービスアカウントとオーディエンス用の OIDC ID トークンを生成します。このトークンはその後、MCP サーバーの認証に使用されます。

#### セットアップ手順

1. OAuth 2.0 クライアント ID を**[作成](https://cloud.google.com/iap/docs/oauth-client-creation)**するか、既存のものを使用します。既存の OAuth 2.0 クライアント ID を使用するには、[OAuth クライアントの共有方法](https://cloud.google.com/iap/docs/sharing-oauth-clients)の手順に従ってください。
2. アプリケーションの**[プログラムによるアクセス](https://cloud.google.com/iap/docs/sharing-oauth-clients#programmatic_access)の許可リストに OAuth ID を追加します**。Cloud Run はまだ gcloud iap でサポートされているリソースタイプではないため、プロジェクトでクライアント ID を許可リストに登録する必要があります。
3. サービスアカウントを**作成します**。[ドキュメント](https://cloud.google.com/iam/docs/service-accounts-create#creating)、[Cloud Console リンク](https://console.cloud.google.com/iam-admin/serviceaccounts)
4. Cloud Run サービス自体の「セキュリティ」タブ、または gcloud を介して、**サービスアカウントとユーザーの両方を IAP ポリシーに追加します**。
5. MCP サーバーにアクセスする**すべてのユーザーとグループに**、[サービスアカウントのなりすまし](https://cloud.google.com/docs/authentication/use-service-account-impersonation)に必要な権限（例：`roles/iam.serviceAccountTokenCreator`）を**付与します**。
6. プロジェクトの IAM Credentials API を**[有効化](https://console.cloud.google.com/apis/library/iamcredentials.googleapis.com)**します。

### 構成例

#### Python MCP Server (Stdio)

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

#### Node.js MCP Server (Stdio)

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

#### Docker-based MCP Server

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

#### HTTP-based MCP Server

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

#### HTTP-based MCP Server with Custom Headers

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

#### MCP Server with Tool Filtering

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

### SSE MCP Server with SA Impersonation

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

Qwen Code の起動時、以下の詳細なプロセスを通じて MCP サーバーの検出を実行します：

### 1. サーバーの反復処理と接続

`mcpServers` 内の構成済みサーバーごとに：

1. **ステータス追跡開始:** サーバーステータスが `CONNECTING` に設定されます
2. **トランスポートの選択:** 構成プロパティに基づきます：
   - `httpUrl` → `StreamableHTTPClientTransport`
   - `url` → `SSEClientTransport`
   - `command` → `StdioClientTransport`
3. **接続の確立:** MCP クライアントが構成されたタイムアウトで接続を試みます
4. **エラー処理:** 接続失敗はログに記録され、サーバーステータスが `DISCONNECTED` に設定されます

### 2. ツールの検出

接続が成功すると：

1. **ツール一覧:** クライアントが MCP サーバーのツール一覧エンドポイントを呼び出します
2. **スキーマ検証:** 各ツールの関数宣言が検証されます
3. **ツールのフィルタリング:** `includeTools` および `excludeTools` 構成に基づいてツールがフィルタリングされます
4. **名のサニタイズ:** ツール名が Qwen API の要件を満たすようにクリーンアップされます：
   - 無効な文字（英数字、アンダースコア、ドット、ハイフン以外）はアンダースコアに置き換えられます
   - 63 文字を超える名前は中央置換（`___`）で切り捨てられます

### 3. 競合解決

複数のサーバーが同じ名前のツールを公開している場合：

1. **先着優先:** ツール名を最初に登録したサーバーがプレフィックスなしの名前を取得します
2. **自動プレフィックス付与:** 後続のサーバーにはプレフィックス付きの名前が付与されます：`serverName__toolName`
3. **レジストリ追跡:** ツールレジストリはサーバー名とそのツールの間のマッピングを維持します

### 4. スキーマ処理

ツールパラメータスキーマは API 互換性のためにサニタイズされます：

- **`$schema` プロパティ**が削除されます
- **`additionalProperties`**が削除されます
- **`default` を持つ `anyOf`** はデフォルト値が削除されます（Vertex AI 互換性）
- **再帰処理**がネストされたスキーマに適用されます

### 5. 接続管理

検出後：

- **永続接続:** ツールの登録に成功したサーバーは接続を維持します
- **クリーンアップ:** 使用可能なツールを提供しないサーバーの接続は閉じられます
- **ステータス更新:** 最終的なサーバーステータスは `CONNECTED` または `DISCONNECTED` に設定されます

## ツール実行フロー

モデルが MCP ツールの使用を決定すると、以下の実行フローが発生します：

### 1. ツールの呼び出し

モデルは以下を含む `FunctionCall` を生成します：

- **ツール名:** 登録された名前（プレフィックス付きの場合あり）
- **引数:** ツールのパラメータスキーマに一致する JSON オブジェクト

### 2. 確認プロセス

各 `DiscoveredMCPTool` は高度な確認ロジックを実装しています：

#### 信頼に基づくバイパス

```typescript
if (this.trust) {
  return false; // No confirmation needed
}
```

#### 動的許可リスト

システムは以下の内部許可リストを維持します：

- **サーバーレベル:** `serverName` → このサーバーのすべてのツールが信頼されます
- **ツールレベル:** `serverName.toolName` → この特定のツールが信頼されます

#### ユーザー選択の処理

確認が必要な場合、ユーザーは以下を選択できます：

- **1 回だけ続行:** 今回のみ実行
- **このツールを常に許可:** ツールレベルの許可リストに追加
- **このサーバーを常に許可:** サーバーレベルの許可リストに追加
- **キャンセル:** 実行を中止

### 3. 実行

確認後（または信頼バイパス後）：

1. **パラメータ準備:** 引数がツールのスキーマに対して検証されます
2. **MCP 呼び出し:** 基盤となる `CallableTool` が以下でサーバーを呼び出します：

   ```typescript
   const functionCalls = [
     {
       name: this.serverToolName, // Original server tool name
       args: params,
     },
   ];
   ```

3. **レスポンス処理:** 結果が LLM コンテキストとユーザー表示の両方用にフォーマットされます

### 4. レスポンス処理

実行結果には以下が含まれます：

- **`llmContent`:** 言語モデルのコンテキスト用の生のレスポンスパーツ
- **`returnDisplay`:** ユーザー表示用のフォーマット済み出力（多くの場合 Markdown コードブロック内の JSON）

## MCP サーバーとの対話方法

### `/mcp` コマンドの使用

`/mcp` コマンドは、MCP サーバーのセットアップに関する包括的な情報を提供します：

```bash
/mcp
```

これにより以下が表示されます：

- **サーバーリスト:** 構成済みのすべての MCP サーバー
- **接続ステータス:** `CONNECTED`、`CONNECTING`、または `DISCONNECTED`
- **サーバー詳細:** 構成の概要（機密データを除く）
- **利用可能なツール:** 説明付きの各サーバーからのツールリスト
- **検出状態:** 検出プロセス全体のステータス

### `/mcp` 出力例

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

検出されると、MCP ツールは組み込みツールと同様に Qwen モデルで利用可能になります。モデルは自動的に以下の処理を行います：

1. リクエストに基づいて**適切なツールを選択**
2. **確認ダイアログを表示**（サーバーが信頼されていない場合）
3. 適切なパラメータで**ツールを実行**
4. ユーザーフレンドリーな形式で**結果を表示**

## ステータス監視とトラブルシューティング

### 接続状態

MCP 統合は以下の複数の状態を追跡します：

#### サーバーステータス（`MCPServerStatus`）

- **`DISCONNECTED`:** サーバーが接続されていない、またはエラーが発生している
- **`CONNECTING`:** 接続試行中
- **`CONNECTED`:** サーバーが接続され、準備完了

#### 検出状態（`MCPDiscoveryState`）

- **`NOT_STARTED`:** 検出が開始されていない
- **`IN_PROGRESS`:** 現在サーバーを検出中
- **`COMPLETED`:** 検出が完了（エラーの有無にかかわらず）

### 一般的な問題と解決策

#### サーバーが接続しない

**症状:** サーバーが `DISCONNECTED` ステータスを示す

**トラブルシューティング:**

1. **構成の確認:** `command`、`args`、`cwd` が正しいことを確認
2. **手動テスト:** サーバーコマンドを直接実行して動作することを確認
3. **依存関係の確認:** 必要なすべてのパッケージがインストールされていることを確認
4. **ログの確認:** CLI 出力にエラーメッセージがないか確認
5. **権限の確認:** CLI がサーバーコマンドを実行できることを確認

#### ツールが検出されない

**症状:** サーバーは接続されるがツールが利用できない

**トラブルシューティング:**

1. **ツール登録の確認:** サーバーが実際にツールを登録していることを確認
2. **MCP プロトコルの確認:** サーバーが MCP ツール一覧を正しく実装していることを確認
3. **サーバーログの確認:** サーバー側エラーの stderr 出力を確認
4. **ツール一覧のテスト:** サーバーのツール検出エンドポイントを手動でテスト

#### ツールが実行されない

**症状:** ツールは検出されるが実行中に失敗する

**トラブルシューティング:**

1. **パラメータ検証:** ツールが期待されるパラメータを受け入れることを確認
2. **スキーマ互換性:** 入力スキーマが有効な JSON Schema であることを確認
3. **エラー処理:** ツールが未処理の例外をスローしていないか確認
4. **タイムアウトの問題:** `timeout` 設定の増加を検討

#### サンドボックス互換性

**症状:** サンドボックスが有効な場合に MCP サーバーが失敗する

**解決策:**

1. **Docker ベースのサーバー:** すべての依存関係を含む Docker コンテナを使用
2. **パスのアクセシビリティ:** サーバー実行ファイルがサンドボックス内で利用可能であることを確認
3. **ネットワークアクセス:** 必要なネットワーク接続を許可するようにサンドボックスを構成
4. **環境変数:** 必要な環境変数が渡されていることを確認

### デバッグのヒント

1. **デバッグモードの有効化:** 詳細出力のために `--debug` を付けて CLI を実行
2. **stderr の確認:** MCP サーバーの stderr がキャプチャされログに記録されます（INFO メッセージはフィルタリング）
3. **分離テスト:** 統合前に MCP サーバーを独立してテスト
4. **段階的なセットアップ:** 複雑な機能を追加する前に単純なツールから開始
5. **`/mcp` の頻繁な使用:** 開発中にサーバーステータスを監視

## 重要な注意事項

### セキュリティに関する考慮事項

- **信頼設定:** `trust` オプションはすべての確認ダイアログをバイパスします。注意して使用し、完全に制御しているサーバーのみに使用してください
- **アクセストークン:** API キーやトークンを含む環境変数を構成する際はセキュリティに注意してください
- **サンドボックス互換性:** サンドボックスを使用する場合は、MCP サーバーがサンドボックス環境内で利用可能であることを確認してください
- **プライベートデータ:** 広範なスコープのパーソナルアクセストークンを使用すると、リポジトリ間で情報が漏洩する可能性があります

### パフォーマンスとリソース管理

- **接続の永続化:** CLI はツールの登録に成功したサーバーへの永続接続を維持します
- **自動クリーンアップ:** ツールを提供しないサーバーへの接続は自動的に閉じられます
- **タイムアウト管理:** サーバーのレスポンス特性に基づいて適切なタイムアウトを構成してください
- **リソース監視:** MCP サーバーは別プロセスとして実行され、システムリソースを消費します

### スキーマ互換性

- **スキーマ準拠モード:** デフォルト（`schemaCompliance: "auto"`）では、ツールスキーマはそのまま渡されます。モデルを Strict OpenAPI 3.0 形式に変換するには、`settings.json` に `"model": { "generationConfig": { "schemaCompliance": "openapi_30" } }` を設定します。
- **OpenAPI 3.0 変換:** `openapi_30` モードが有効な場合、システムは以下を処理します：
  - Nullable 型: `["string", "null"]` -> `type: "string", nullable: true`
  - Const 値: `const: "foo"` -> `enum: ["foo"]`
  - 排他的制限: 数値 `exclusiveMinimum` -> `minimum` を持つ boolean 形式
  - キーワード削除: `$schema`, `$id`, `dependencies`, `patternProperties`
- **名のサニタイズ:** ツール名は API 要件を満たすように自動的にサニタイズされます
- **競合解決:** サーバー間のツール名の競合は自動プレフィックス付与によって解決されます

この包括的な統合により、MCP サーバーはセキュリティ、信頼性、使いやすさを維持しながら CLI の機能を拡張する強力な手段となります。

## ツールからのリッチコンテンツの返却

MCP ツールは単純なテキストの返却に限定されません。1 つのツールレスポンスで、テキスト、画像、音声、その他のバイナリデータを含むリッチなマルチパートコンテンツを返すことができます。これにより、1 回のターンでモデルに多様な情報を提供できる強力なツールを構築できます。

ツールから返されたすべてのデータは処理され、次の生成のコンテキストとしてモデルに送信されるため、提供された情報について推論したり要約したりすることが可能になります。

### 動作原理

リッチコンテンツを返すには、ツールのレスポンスが [`CallToolResult`](https://modelcontextprotocol.io/specification/2025-06-18/server/tools#tool-result) の MCP 仕様に準拠している必要があります。結果の `content` フィールドは `ContentBlock` オブジェクトの配列である必要があります。CLI はこの配列を正しく処理し、テキストとバイナリデータを分離してモデル用にパッケージ化します。

`content` 配列内で異なるコンテンツブロックタイプを自由に組み合わせることができます。サポートされているブロックタイプには以下が含まれます：

- `text`
- `image`
- `audio`
- `resource` (embedded content)
- `resource_link`

### 例: テキストと画像の返却

テキストの説明と画像の両方を返す MCP ツールからの有効な JSON レスポンスの例を以下に示します：

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

Qwen Code がこのレスポンスを受信すると、以下の処理を行います：

1.  すべてのテキストを抽出し、モデル用の単一の `functionResponse` パーツに結合します。
2.  画像データを個別の `inlineData` パーツとして提示します。
3.  CLI に、テキストと画像の両方が受信されたことを示すクリーンでユーザーフレンドリーな要約を提供します。

これにより、Qwen モデルにリッチなマルチモーダルコンテキストを提供できる高度なツールを構築できます。

## スラッシュコマンドとしての MCP プロンプト

ツールに加えて、MCP サーバーは Qwen Code 内でスラッシュコマンドとして実行できる定義済みプロンプトを公開できます。これにより、名前で簡単に呼び出せる一般的なクエリや複雑なクエリのショートカットを作成できます。

### サーバーでのプロンプトの定義

プロンプトを定義する stdio MCP サーバーの小さな例を以下に示します：

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

これは `settings.json` の `mcpServers` 以下に以下のように含めることができます：

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

プロンプトが検出されると、その名前をスラッシュコマンドとして使用して呼び出すことができます。CLI は引数の解析を自動的に処理します。

```bash
/poem-writer --title="Qwen Code" --mood="reverent"
```

または、位置引数を使用します：

```bash
/poem-writer "Qwen Code" reverent
```

このコマンドを実行すると、CLI は提供された引数を使用して MCP サーバーの `prompts/get` メソッドを実行します。サーバーは引数をプロンプトテンプレートに置換し、最終的なプロンプトテキストを返す役割を担います。その後、CLI はこのプロンプトをモデルに送信して実行します。これにより、一般的なワークフローを自動化して共有する便利な方法が提供されます。

## qwen mcp による MCP サーバーの管理

`settings.json` ファイルを手動で編集して MCP サーバーを構成することも常に可能ですが、CLI はサーバー構成をプログラムで管理するための便利なコマンドセットを提供します。これらのコマンドにより、JSON ファイルを直接編集することなく、MCP サーバーの追加、一覧表示、削除のプロセスを効率化できます。

### サーバーの追加（`qwen mcp add`）

`add` コマンドは `settings.json` に新しい MCP サーバーを構成します。スコープ（`-s, --scope`）に基づいて、ユーザー設定 `~/.qwen/settings.json` またはプロジェクト設定 `.qwen/settings.json` ファイルのいずれかに追加されます。

**コマンド:**

```bash
qwen mcp add [options] <name> <commandOrUrl> [args...]
```

- `<name>`: サーバーの一意の名前。
- `<commandOrUrl>`: 実行するコマンド（`stdio` の場合）または URL（`http`/`sse` の場合）。
- `[args...]`: `stdio` コマンドのオプション引数。

**オプション（フラグ）:**

- `-s, --scope`: 構成スコープ（ユーザーまたはプロジェクト）。[デフォルト: "project"]
- `-t, --transport`: トランスポートタイプ（stdio、sse、http）。[デフォルト: "stdio"]
- `-e, --env`: 環境変数を設定（例: -e KEY=value）。
- `-H, --header`: SSE および HTTP トランスポートの HTTP ヘッダーを設定（例: -H "X-Api-Key: abc123" -H "Authorization: Bearer abc123"）。
- `--timeout`: 接続タイムアウトをミリ秒単位で設定。
- `--trust`: サーバーを信頼（すべてのツール呼び出し確認プロンプトをバイパス）。
- `--description`: サーバーの説明を設定。
- `--include-tools`: 含めるツールのコンマ区切りリスト。
- `--exclude-tools`: 除外するツールのコンマ区切りリスト。
- `--oauth-client-id`: MCP サーバー認証用の OAuth クライアント ID。
- `--oauth-client-secret`: MCP サーバー認証用の OAuth クライアントシークレット。
- `--oauth-redirect-uri`: OAuth リダイレクト URI（例: `https://your-server.com/oauth/callback`）。ローカル環境のデフォルトは `http://localhost:7777/oauth/callback` です。**リモートデプロイメントで重要**: Qwen Code をリモート/クラウドサーバーで実行する場合は、公開アクセス可能な URL に設定します。
- `--oauth-authorization-url`: OAuth 認可 URL。
- `--oauth-token-url`: OAuth トークン URL。
- `--oauth-scopes`: OAuth スコープ（コンマ区切り）。

#### stdio サーバーの追加

これはローカルサーバーを実行するためのデフォルトのトランスポートです。

```bash
# Basic syntax
qwen mcp add <name> <command> [args...]

# Example: Adding a local server
qwen mcp add my-stdio-server -e API_KEY=123 /path/to/server arg1 arg2 arg3

# Example: Adding a local python server
qwen mcp add python-server python server.py --port 8080
```

#### HTTP サーバーの追加

このトランスポートは、ストリーミング可能な HTTP トランスポートを使用するサーバー用です。

```bash
# Basic syntax
qwen mcp add --transport http <name> <url>

# Example: Adding an HTTP server
qwen mcp add --transport http http-server https://api.example.com/mcp/

# Example: Adding an HTTP server with an authentication header
qwen mcp add --transport http secure-http https://api.example.com/mcp/ --header "Authorization: Bearer abc123"
```

#### SSE サーバーの追加

このトランスポートは、Server-Sent Events (SSE) を使用するサーバー用です。

```bash
# Basic syntax
qwen mcp add --transport sse <name> <url>

# Example: Adding an SSE server
qwen mcp add --transport sse sse-server https://api.example.com/sse/

# Example: Adding an SSE server with an authentication header
qwen mcp add --transport sse secure-sse https://api.example.com/sse/ --header "Authorization: Bearer abc123"

# Example: Adding an OAuth-enabled SSE server
qwen mcp add --transport sse oauth-server https://api.example.com/sse/ \
  --oauth-client-id your-client-id \
  --oauth-redirect-uri https://your-server.com/oauth/callback \
  --oauth-authorization-url https://provider.example.com/authorize \
  --oauth-token-url https://provider.example.com/token
```

### サーバーの管理（`qwen mcp`）

現在構成されているすべての MCP サーバーを表示および管理するには、`manage` コマンド、または単に `qwen mcp` を使用します。これにより、以下の操作が可能なインタラクティブな TUI ダイアログが開きます：

- 接続ステータス付きですべての MCP サーバーを表示
- サーバーの有効化/無効化
- 切断されたサーバーへの再接続
- 各サーバーが提供するツールとプロンプトを表示
- サーバーログを表示

**コマンド:**

```bash
qwen mcp
# or
qwen mcp manage
```

管理ダイアログは、各サーバーの名前、構成詳細、接続ステータス、利用可能なツール/プロンプトを表示するビジュアルインターフェースを提供します。

### サーバーの削除（`qwen mcp remove`）

構成からサーバーを削除するには、サーバーの名前を指定して `remove` コマンドを使用します。

**コマンド:**

```bash
qwen mcp remove <name>
```

**例:**

```bash
qwen mcp remove my-server
```

これにより、スコープ（`-s, --scope`）に基づいて、適切な `settings.json` ファイルの `mcpServers` オブジェクトから "my-server" エントリを検索して削除します。