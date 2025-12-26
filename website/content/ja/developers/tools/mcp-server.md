# Qwen Code での MCP サーバー

このドキュメントでは、Model Context Protocol (MCP) サーバーを Qwen Code で設定して使用する方法について説明します。

## MCPサーバーとは？

MCPサーバーは、Model Context Protocol (モデルコンテキストプロトコル) を介してCLIにツールやリソースを公開し、外部システムやデータソースとやり取りできるようにするアプリケーションです。MCPサーバーは、モデルとローカル環境またはAPIなどの他のサービスの間を橋渡しする役割を果たします。

MCPサーバーにより、CLIは以下のことを行えるようになります：

- **ツールの検出：** 利用可能なツール、その説明、およびパラメータを標準化されたスキーマ定義を通じて一覧表示します。
- **ツールの実行：** 定義された引数で特定のツールを呼び出し、構造化された応答を受け取ります。
- **リソースへのアクセス：** 特定のリソースからデータを読み取ります（ただし、CLIは主にツールの実行に焦点を当てています）。

MCPサーバーを使用することで、CLIの機能を拡張し、データベース、API、カスタムスクリプト、または特殊なワークフローとのやり取りなど、組み込み機能を超えた操作を実行できるようになります。

## コア統合アーキテクチャ

Qwen Code は、MCP サーバーと `packages/core/src/tools/` に組み込まれた洗練されたディスカバリおよび実行システムを通じて統合します。

### ディスカバリ層 (`mcp-client.ts`)

ディスカバリプロセスは `discoverMcpTools()` によって調整され、以下の処理を行います。

1. `settings.json` の `mcpServers` 設定から**構成されたサーバーをイテレートする**
2. 適切なトランスポートメカニズム（Stdio、SSE、または Streamable HTTP）を使用して**接続を確立する**
3. 各サーバーから MCP プロトコルを使用して**ツール定義を取得する**
4. Qwen API との互換性のためにツールスキーマを**サニタイズおよび検証する**
5. 競合解決付きで**ツールをグローバルツールレジストリに登録する**

### 実行層 (`mcp-tool.ts`)

発見された各MCPツールは `DiscoveredMCPTool` インスタンスでラップされ、以下を実行します。

- サーバーの信頼設定とユーザー設定に基づいた**確認ロジックの処理**
- 適切なパラメータでMCPサーバーを呼び出すことによる**ツール実行の管理**
- LLMコンテキストとユーザー表示の両方に対する**レスポンスの処理**
- **接続状態の維持**とタイムアウト処理

### トランスポートメカニズム

CLIは3つのMCPトランスポートタイプをサポートしています。

- **Stdioトランスポート:** サブプロセスを起動し、stdin/stdout経由で通信します
- **SSEトランスポート:** Server-Sent Eventsエンドポイントに接続します
- **ストリーム可能HTTPトランスポート:** 通信にHTTPストリーミングを使用します

## MCPサーバーの設定方法

Qwen Codeは、MCPサーバーの検出と接続のために `settings.json` ファイル内の `mcpServers` 設定を使用します。この設定では、異なるトランスポートメカニズムを持つ複数のサーバーをサポートしています。

### settings.json で MCP サーバーを設定する

`settings.json` ファイルでは、2つの主な方法で MCP サーバーを設定できます。1つは特定のサーバー定義用のトップレベルの `mcpServers` オブジェクトによる方法、もう1つはサーバーの検出と実行を制御するグローバル設定用の `mcp` オブジェクトによる方法です。

#### グローバル MCP 設定 (`mcp`)

`settings.json` 内の `mcp` オブジェクトを使用して、すべての MCP サーバーに対するグローバルルールを定義できます。

- **`mcp.serverCommand`** (文字列): MCP サーバーを起動するためのグローバルコマンド。
- **`mcp.allowed`** (文字列の配列): 許可する MCP サーバー名のリスト。この設定が指定された場合、このリスト内のサーバーのみ (`mcpServers` オブジェクト内のキーに一致する) 接続されます。
- **`mcp.excluded`** (文字列の配列): 除外する MCP サーバー名のリスト。このリスト内のサーバーには接続しません。

**例:**

```json
{
  "mcp": {
    "allowed": ["my-trusted-server"],
    "excluded": ["experimental-server"]
  }
}
```

#### サーバー固有の設定 (`mcpServers`)

`mcpServers` オブジェクトは、CLI が接続する個々の MCP サーバーを定義する場所です。

### 設定構造

`settings.json` ファイルに `mcpServers` オブジェクトを追加します:

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

各サーバー設定は、以下のプロパティをサポートしています:

#### 必須 (以下のいずれか)

- **`command`** (string): Stdio トランスポート用の実行可能ファイルのパス
- **`url`** (string): SSE エンドポイント URL (例: `"http://localhost:8080/sse"`)
- **`httpUrl`** (string): HTTP ストリーミングエンドポイント URL

#### オプション

- **`args`** (string[]): Stdio トランスポート用のコマンドライン引数
- **`headers`** (object): `url` または `httpUrl` を使用する際のカスタム HTTP ヘッダー
- **`env`** (object): サーバープロセス用の環境変数。値は `$VAR_NAME` または `${VAR_NAME}` 構文を使用して環境変数を参照できます
- **`cwd`** (string): Stdio トランスポート用の作業ディレクトリ
- **`timeout`** (number): リクエストタイムアウト（ミリ秒単位、デフォルト: 600,000ms = 10分）
- **`trust`** (boolean): `true` の場合、このサーバーに対するすべてのツール呼び出し確認をバイパスします（デフォルト: `false`）
- **`includeTools`** (string[]): この MCP サーバーから含めるツール名のリスト。指定された場合、ここにリストされたツールのみがこのサーバーから利用可能になります（ホワイトリスト方式）。指定されていない場合、サーバーのすべてのツールがデフォルトで有効になります。
- **`excludeTools`** (string[]): この MCP サーバーから除外するツール名のリスト。ここにリストされたツールは、サーバーによって公開されていてもモデルでは利用できません。**注意:** `excludeTools` は `includeTools` より優先されます。ツールが両方のリストにある場合、除外されます。
- **`targetAudience`** (string): アクセスしようとしている IAP 保護アプリケーションで許可されている OAuth クライアント ID。`authProviderType: 'service_account_impersonation'` と共に使用します。
- **`targetServiceAccount`** (string): フェデレーションする Google Cloud サービスアカウントのメールアドレス。`authProviderType: 'service_account_impersonation'` と共に使用します。

### リモート MCP サーバーの OAuth サポート

Qwen Code は、SSE または HTTP トランスポートを使用するリモート MCP サーバーに対して OAuth 2.0 認証をサポートしています。これにより、認証を必要とする MCP サーバーへの安全なアクセスが可能になります。

#### 自動 OAuth 検出

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

CLI は自動的に以下のことを行います。

- サーバーが OAuth 認証を必要としていることを検出する（401 レスポンス）
- サーバーメタデータから OAuth エンドポイントを検出する
- サポートされている場合は動的クライアント登録を実行する
- OAuth フローとトークン管理を処理する

#### 認証フロー

OAuth有効化サーバーへの接続時：

1. **初期接続試行** が401 Unauthorizedで失敗
2. **OAuthディスカバリー** が認可エンドポイントとトークンエンドポイントを検出
3. **ブラウザが開き** ユーザー認証を実施（ローカルブラウザアクセスが必要）
4. **認可コード** がアクセストークンと交換
5. **トークンが安全に保存** され将来の利用に備える
6. **接続再試行** が有効なトークンで成功

#### ブラウザリダイレクト要件

**重要:** OAuth認証では、ローカルマシンが以下の条件を満たす必要があります：

- 認証用にWebブラウザを開けること
- `http://localhost:7777/oauth/callback` でリダイレクトを受け取れること

この機能は以下の環境では動作しません：

- ブラウザアクセスのないヘッドレス環境
- X11フォワーディングのないリモートSSHセッション
- ブラウザサポートのないコンテナ化環境

#### OAuth認証の管理

OAuth認証を管理するには `/mcp auth` コマンドを使用してください：

```bash

# 認証が必要なサーバーを一覧表示
/mcp auth
```

# 特定のサーバーで認証
/mcp auth serverName

# トークンが期限切れの場合に再認証
/mcp auth serverName
```

#### OAuth 設定プロパティ

- **`enabled`** (boolean): このサーバーに対してOAuthを有効にする
- **`clientId`** (string): OAuthクライアント識別子（動的登録時はオプション）
- **`clientSecret`** (string): OAuthクライアントシークレット（パブリッククライアントの場合はオプション）
- **`authorizationUrl`** (string): OAuth認可エンドポイント（省略時は自動検出）
- **`tokenUrl`** (string): OAuthトークンエンドポイント（省略時は自動検出）
- **`scopes`** (string[]): 必須OAuthスコープ
- **`redirectUri`** (string): カスタムリダイレクトURI（デフォルトは `http://localhost:7777/oauth/callback`）
- **`tokenParamName`** (string): SSE URL内のトークン用クエリパラメータ名
- **`audiences`** (string[]): トークンが有効な対象ユーザー

#### トークン管理

OAuth トークンは自動的に以下のように処理されます。

- `~/.qwen/mcp-oauth-tokens.json` に**安全に保存**
- 有効期限が切れた場合に**更新**（リフレッシュトークンが利用可能な場合）
- 各接続試行の前に**検証**
- 無効または期限切れ時に**クリーンアップ**

#### 認証プロバイダータイプ

`authProviderType` プロパティを使用して、認証プロバイダータイプを指定できます。

- **`authProviderType`** (文字列): 認証プロバイダーを指定します。以下のいずれかを指定できます。
  - **`dynamic_discovery`** (デフォルト): CLI はサーバーから OAuth 設定を自動的に検出します。
  - **`google_credentials`**: CLI は Google アプリケーションデフォルト認証情報 (ADC) を使用してサーバーとの認証を行います。このプロバイダーを使用する場合は、必要なスコープを指定する必要があります。
  - **`service_account_impersonation`**: CLI は Google Cloud サービスアカウントを模倣してサーバーとの認証を行います。これは IAP 保護されたサービスにアクセスする際に便利です (これは特に Cloud Run サービス用に設計されました)。

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

#### サービスアカウントの偽装

サービスアカウントの偽装を使用してサーバーで認証するには、`authProviderType` を `service_account_impersonation` に設定し、以下のプロパティを指定する必要があります。

- **`targetAudience`** (文字列): アクセスしようとしている IAP 保護アプリケーションで許可リストに登録されている OAuth クライアント ID。
- **`targetServiceAccount`** (文字列): 偽装する Google Cloud サービスアカウントのメールアドレス。

CLI は、ローカルのアプリケーションデフォルト認証情報 (ADC) を使用して、指定されたサービスアカウントおよび対象者用の OIDC ID トークンを生成します。このトークンは、MCP サーバーでの認証に使用されます。

#### セットアップ手順

1. **[作成](https://cloud.google.com/iap/docs/oauth-client-creation)するか、既存の OAuth 2.0 クライアント ID を使用します。** 既存の OAuth 2.0 クライアント ID を使用する場合は、[OAuth クライアントの共有方法](https://cloud.google.com/iap/docs/sharing-oauth-clients)の手順に従ってください。
2. **アプリケーションの[プログラムによるアクセス](https://cloud.google.com/iap/docs/sharing-oauth-clients#programmatic_access)のために、OAuth ID を許可リストに追加します。** Cloud Run はまだ gcloud iap でサポートされているリソースタイプではないため、プロジェクトでクライアント ID を許可リストに追加する必要があります。
3. **サービスアカウントを作成します。** [ドキュメント](https://cloud.google.com/iam/docs/service-accounts-create#creating)、[Cloud Console リンク](https://console.cloud.google.com/iam-admin/serviceaccounts)
4. **Cloud Run サービス自体の「Security」タブまたは gcloud 経由で、IAP ポリシーにサービスアカウントとユーザーの両方を追加します。**
5. **MCP サーバーにアクセスするすべてのユーザーおよびグループに、サービスアカウントを[偽装する](https://cloud.google.com/docs/authentication/use-service-account-impersonation)ための必要な権限（例: `roles/iam.serviceAccountTokenCreator`）を付与します。**
6. **プロジェクトに対して** [IAM Credentials API を有効化](https://console.cloud.google.com/apis/library/iamcredentials.googleapis.com) **します。**

### 設定例

#### Python MCP サーバー (Stdio)

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

#### Node.js MCP サーバー (Stdio)

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

### SA インパーソネーションによる SSE MCP サーバー

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

## ディスカバリプロセスの詳細

Qwen Code が起動すると、以下の詳細なプロセスを通じて MCP サーバーのディスカバリーを実行します:

### 1. サーバーのイテレーションと接続

`mcpServers` で設定された各サーバーに対して：

1. **ステータス追跡の開始:** サーバーステータスが `CONNECTING` に設定される
2. **トランスポートの選択:** 設定プロパティに基づく：
   - `httpUrl` → `StreamableHTTPClientTransport`
   - `url` → `SSEClientTransport`
   - `command` → `StdioClientTransport`
3. **接続確立:** MCP クライアントは設定されたタイムアウトで接続を試みる
4. **エラー処理:** 接続失敗はログに記録され、サーバーステータスは `DISCONNECTED` に設定される

### 2. ツールの検出

接続が正常に確立された後：

1. **ツール一覧:** クライアントが MCP サーバーのツール一覧エンドポイントを呼び出す
2. **スキーマ検証:** 各ツールの関数宣言が検証される
3. **ツールフィルタリング:** `includeTools` および `excludeTools` 設定に基づいてツールがフィルタリングされる
4. **名前のサニタイズ:** ツール名は Qwen API の要件を満たすようにクリーンアップされる：
   - 無効な文字（英数字、アンダースコア、ドット、ハイフン以外）はアンダースコアに置き換えられる
   - 63 文字より長い名前は中央を `___` で置き換えて切り詰められる

### 3. 衝突の解決

複数のサーバーが同じ名前のツールを公開している場合：

1. **最初の登録が優先:** 最初にツール名を登録したサーバーがプレフィックスなしの名前を取得する
2. **自動プレフィックス付与:** その後に登録されたサーバーには `serverName__toolName` のようなプレフィックス付きの名前が付与される
3. **レジストリ追跡:** ツールレジストリはサーバー名とそのツールの間のマッピングを維持する

### 4. スキーマ処理

ツールパラメータスキーマは、API互換性のためにサニタイズ処理されます。

- **`$schema` プロパティ** は削除されます
- **`additionalProperties`** は削除されます
- **`default` 値を持つ `anyOf`** は、デフォルト値が削除されます (Vertex AI 互換性のため)
- **再帰的処理** は、ネストされたスキーマに適用されます

### 5. 接続管理

検出後:

- **永続接続:** ツールの登録に成功したサーバーは接続を維持します
- **クリーンアップ:** 利用可能なツールを提供しないサーバーの接続は閉じられます
- **ステータス更新:** 最終的なサーバーステータスは `CONNECTED` または `DISCONNECTED` に設定されます

## ツール実行フロー

モデルが MCP ツールの使用を決定した場合、以下の実行フローが発生します。

### 1. ツール呼び出し

モデルは以下の情報を含む `FunctionCall` を生成します。

- **ツール名:** 登録された名前 (プレフィックスが付加されている可能性があります)
- **引数:** ツールのパラメータスキーマに一致する JSON オブジェクト

### 2. 確認プロセス

各 `DiscoveredMCPTool` は、洗練された確認ロジックを実装しています。

#### 信頼ベースのバイパス

```typescript
if (this.trust) {
  return false; // 確認は不要
}
```

#### 動的ホワイトリスト

システムは内部的に以下のホワイトリストを維持します。

- **サーバーレベル:** `serverName` → このサーバーからのすべてのツールが信頼される
- **ツールレベル:** `serverName.toolName` → この特定のツールが信頼される

#### ユーザー選択の処理

確認が必要な場合、ユーザーは以下の選択肢から選ぶことができます。

- **一度だけ実行:** 今回のみ実行
- **このツールを常に許可:** ツールレベルのホワイトリストに追加
- **このサーバーを常に許可:** サーバーレベルのホワイトリストに追加
- **キャンセル:** 実行を中止

### 3. 実行

確認（または信頼バイパス）後：

1. **パラメータ準備：** 引数はツールのスキーマに対して検証されます
2. **MCP呼び出し：** 基盤となる `CallableTool` は以下のコードでサーバーを呼び出します：

   ```typescript
   const functionCalls = [
     {
       name: this.serverToolName, // 元のサーバーツール名
       args: params,
     },
   ];
   ```

3. **レスポンス処理：** 結果はLLMコンテキストとユーザー表示の両方のためにフォーマットされます

### 4. レスポンス処理

実行結果には以下が含まれます：

- **`llmContent`：** 言語モデルのコンテキスト用の生レスポンスパーツ
- **`returnDisplay`：** ユーザー表示用のフォーマット済み出力（多くの場合、Markdownコードブロック内のJSON）

## MCPサーバーとのやり取り方法

### `/mcp` コマンドの使用

`/mcp` コマンドは、MCPサーバー設定に関する包括的な情報を提供します：

```bash
/mcp
```

これは以下を表示します：

- **サーバーリスト：** 設定されたすべてのMCPサーバー
- **接続ステータス：** `CONNECTED`、`CONNECTING`、または `DISCONNECTED`
- **サーバー詳細：** 設定の概要（機密データを除く）
- **利用可能なツール：** 各サーバーから提供されるツール一覧と説明
- **ディスカバリ状態：** 全体のディスカバリプロセスのステータス

### `/mcp` 出力例

```
MCPサーバーのステータス：

📡 pythonTools (接続済み)
  コマンド: python -m my_mcp_server --port 8080
  作業ディレクトリ: ./mcp-servers/python
  タイムアウト: 15000ms
  ツール: calculate_sum, file_analyzer, data_processor

🔌 nodeServer (切断中)
  コマンド: node dist/server.js --verbose
  エラー: 接続拒否

🐳 dockerizedServer (接続済み)
  コマンド: docker run -i --rm -e API_KEY my-mcp-server:latest
  ツール: docker__deploy, docker__status

ディスカバリ状態: 完了
```

### ツールの使用方法

MCPツールが検出されると、組み込みツールと同様にQwenモデルで利用可能になります。モデルは自動的に以下の処理を行います。

1. **リクエストに基づいて適切なツールを選択**
2. **確認ダイアログを表示**（サーバーが信頼されている場合を除く）
3. **適切なパラメータでツールを実行**
4. **ユーザーフレンドリーな形式で結果を表示**

## ステータス監視とトラブルシューティング

### 接続状態

MCP統合では、以下の複数の状態を追跡しています。

#### サーバー状態 (`MCPServerStatus`)

- **`DISCONNECTED`:** サーバーが接続されていないか、エラーが発生しています
- **`CONNECTING`:** 接続試行中です
- **`CONNECTED`:** サーバーが接続され、準備完了です

#### 検出状態 (`MCPDiscoveryState`)

- **`NOT_STARTED`:** 検出が開始されていません
- **`IN_PROGRESS`:** 現在サーバーを検出中です
- **`COMPLETED`:** 検出が完了しました（エラーの有無にかかわらず）

### 一般的な問題と解決策

#### サーバーが接続しない

**症状:** サーバーが `DISCONNECTED` ステータスを表示する

**トラブルシューティング:**

1. **設定を確認:** `command`、`args`、`cwd` が正しいことを確認する
2. **手動でテスト:** サーバーコマンドを直接実行して、正常に動作することを確認する
3. **依存関係を確認:** 必要なパッケージがすべてインストールされていることを確認する
4. **ログを確認:** CLI出力でエラーメッセージがないか確認する
5. **権限を確認:** CLIがサーバーコマンドを実行できることを確認する

#### ツールが発見されない

**症状:** サーバーは接続するが、ツールが利用できない

**トラブルシューティング:**

1. **ツール登録を確認:** サーバーが実際にツールを登録していることを確認する
2. **MCPプロトコルを確認:** サーバーがMCPツール一覧を正しく実装していることを確認する
3. **サーバーログを確認:** サーバー側のエラーのためにstderr出力を確認する
4. **ツール一覧をテスト:** サーバーのツール検出エンドポイントを手動でテストする

#### ツールが実行されない

**症状:** ツールは検出されるが、実行中に失敗する

**トラブルシューティング:**

1. **パラメータ検証:** ツールが期待されるパラメータを受け入れることを確認する
2. **スキーマ互換性:** 入力スキーマが有効な JSON Schema であることを検証する
3. **エラー処理:** ツールが未処理の例外をスローしていないか確認する
4. **タイムアウト問題:** `timeout` 設定を増やすことを検討する

#### サンドボックス互換性

**症状:** サンドボックス機能が有効な場合、MCP サーバーが失敗する

**解決策:**

1. **Docker ベースのサーバー:** すべての依存関係を含む Docker コンテナを使用する
2. **パスのアクセシビリティ:** サーバー実行可能ファイルがサンドボックス内で利用可能であることを確認する
3. **ネットワークアクセス:** サンドボックスが必要なネットワーク接続を許可するように構成する
4. **環境変数:** 必要な環境変数が渡されていることを確認する

### デバッグのヒント

1. **デバッグモードを有効にする:** `--debug` を付けて CLI を実行して詳細な出力を得る
2. **stderr を確認する:** MCP サーバーの stderr はキャプチャされログ出力される（INFO メッセージはフィルタリングされる）
3. **テスト分離:** 統合前に MCP サーバーを独立してテストする
4. **段階的なセットアップ:** 複雑な機能を追加する前に、単純なツールから始める
5. **`/mcp` を頻繁に使用する:** 開発中にサーバーの状態を監視する

## 重要な注意点

### セキュリティに関する考慮事項

- **信頼設定:** `trust` オプションはすべての確認ダイアログをバイパスします。完全に制御しているサーバーの場合にのみ、注意して使用してください
- **アクセストークン:** API キーやトークンを含む環境変数を設定する際は、セキュリティに注意してください
- **サンドボックス互換性:** サンドボックス機能を使用する際は、MCP サーバーがサンドボックス環境内で利用可能であることを確認してください
- **プライベートデータ:** 広範囲にスコープされたパーソナルアクセストークンを使用すると、リポジトリ間での情報漏洩が発生する可能性があります

### パフォーマンスとリソース管理

- **接続の持続性:** CLI はツールの登録に成功したサーバーとの永続的な接続を維持します
- **自動クリーンアップ:** 何もツールを提供しないサーバーへの接続は自動的に閉じられます
- **タイムアウト管理:** サーバーの応答特性に基づいて適切なタイムアウトを設定してください
- **リソース監視:** MCP サーバーは個別のプロセスとして実行され、システムリソースを消費します

### スキーマ互換性

- **スキーマ準拠モード:** デフォルトでは (`schemaCompliance: "auto"`)、ツールスキーマはそのまま渡されます。`settings.json` で `"model": { "generationConfig": { "schemaCompliance": "openapi_30" } }` を設定すると、モデルが Strict OpenAPI 3.0 形式に変換されます。
- **OpenAPI 3.0 変換:** `openapi_30` モードが有効な場合、システムは以下を処理します:
  - null許容型: `["string", "null"]` -> `type: "string", nullable: true`
  - 定数値: `const: "foo"` -> `enum: ["foo"]`
  - 排他的制限: 数値の `exclusiveMinimum` -> `minimum` 付きのブール形式
  - キーワード削除: `$schema`, `$id`, `dependencies`, `patternProperties`
- **名前サニタイズ:** ツール名は API 要件を満たすように自動的にサニタイズされます
- **競合解決:** サーバー間のツール名の競合は、自動プレフィックス付与によって解決されます

この包括的な統合により、MCP サーバーはセキュリティ、信頼性、使いやすさを維持しながら CLI の機能を拡張する強力な方法となります。

## ツールからのリッチコンテンツの返却

MCPツールは単純なテキストの返却に限定されません。1つのツール応答で、テキスト、画像、音声、その他のバイナリデータを含むリッチでマルチパートのコンテンツを返却できます。これにより、1回のやり取りで多様な情報をモデルに提供できる強力なツールを構築できます。

ツールから返却されたすべてのデータは処理され、モデルの次の生成のためのコンテキストとして送信されるため、提供された情報を推論したり要約したりできるようになります。

### 動作原理

リッチコンテンツを返すには、ツールの応答がMCP仕様の [`CallToolResult`](https://modelcontextprotocol.io/specification/2025-06-18/server/tools#tool-result) に準拠している必要があります。結果の `content` フィールドは `ContentBlock` オブジェクトの配列である必要があります。CLIはこの配列を正しく処理し、テキストとバイナリデータを分離してモデル用にパッケージ化します。

`content` 配列内では、異なるコンテンツブロックタイプを混在させることができます。サポートされているブロックタイプは以下の通りです：

- `text`
- `image`
- `audio`
- `resource` (埋め込みコンテンツ)
- `resource_link`

### 例: テキストと画像を返す場合

以下は、テキスト記述と画像の両方を返すMCPツールからの有効なJSONレスポンスの例です。

```json
{
  "content": [
    {
      "type": "text",
      "text": "リクエストされたロゴはこちらです。"
    },
    {
      "type": "image",
      "data": "BASE64_ENCODED_IMAGE_DATA_HERE",
      "mimeType": "image/png"
    },
    {
      "type": "text",
      "text": "このロゴは2025年に作成されました。"
    }
  ]
}
```

Qwen Codeがこのレスポンスを受け取ると、以下の処理を行います。

1.  すべてのテキストを抽出し、モデル用に1つの`functionResponse`パーツに結合します。
2.  画像データを別の`inlineData`パーツとして提示します。
3.  CLIで、テキストと画像の両方が受信されたことを示す、クリーンでユーザーフレンドリーな要約を提供します。

これにより、Qwenモデルにリッチでマルチモーダルなコンテキストを提供できる高度なツールを構築することが可能になります。

## スラッシュコマンドとしてのMCPプロンプト

ツールに加えて、MCPサーバーは事前定義されたプロンプトを公開でき、これらはQwen Code内でスラッシュコマンドとして実行できます。これにより、名前で簡単に呼び出せる共通または複雑なクエリのショートカットを作成できます。

### サーバー上でプロンプトを定義する

以下は、プロンプトを定義する stdio MCP サーバーの小さな例です。

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
    description: '素敵な俳句を書く',
    argsSchema: { title: z.string(), mood: z.string().optional() },
  },
  ({ title, mood }) => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `${title}というタイトルの俳句を書いてください。${mood ? `気分は${mood}` : ''}でお願いします。俳句は5音、7音、5音の順で構成されることに注意してください。`,
        },
      },
    ],
  }),
);

const transport = new StdioServerTransport();
await server.connect(transport);
```

これは、`settings.json` の `mcpServers` 配下に以下のように含めることができます。

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

一度プロンプトが見つかると、その名前をスラッシュコマンドとして使用して呼び出すことができます。CLI は引数の解析を自動的に処理します。

```bash
/poem-writer --title="Qwen Code" --mood="reverent"
```

または、位置引数を使用して:

```bash
/poem-writer "Qwen Code" reverent
```

このコマンドを実行すると、CLI は提供された引数を使用して MCP サーバー上で `prompts/get` メソッドを実行します。サーバーは、引数をプロンプトテンプレートに挿入し、最終的なプロンプトテキストを返す責任を負います。CLI はその後、このプロンプトをモデルに送信して実行します。これにより、一般的なワークフローを自動化して共有する便利な方法が提供されます。

## `qwen mcp` による MCP サーバーの管理

手動で `settings.json` ファイルを編集して MCP サーバーを設定することも可能ですが、CLI はサーバー構成をプログラムで管理するための便利なコマンド群を提供します。これらのコマンドを使用することで、JSON ファイルを直接編集することなく、MCP サーバーの追加、一覧表示、削除のプロセスを効率化できます。

### サーバーの追加 (`qwen mcp add`)

`add` コマンドは、`settings.json` に新しい MCP サーバーを設定します。スコープ (`-s, --scope`) に基づいて、ユーザー設定 `~/.qwen/settings.json` またはプロジェクト設定 `.qwen/settings.json` ファイルに追加されます。

**コマンド:**

```bash
qwen mcp add [options] <name> <commandOrUrl> [args...]
```

- `<name>`: サーバーの一意な名前。
- `<commandOrUrl>`: 実行するコマンド (`stdio` の場合) または URL (`http`/`sse` の場合)。
- `[args...]`: `stdio` コマンドのオプション引数。

**オプション (フラグ):**

- `-s, --scope`: 設定スコープ (user または project)。[デフォルト: "project"]
- `-t, --transport`: トランスポートタイプ (stdio, sse, http)。[デフォルト: "stdio"]
- `-e, --env`: 環境変数を設定します (例: -e KEY=value)。
- `-H, --header`: SSE および HTTP トランスポート用の HTTP ヘッダーを設定します (例: -H "X-Api-Key: abc123" -H "Authorization: Bearer abc123")。
- `--timeout`: 接続タイムアウトをミリ秒単位で設定します。
- `--trust`: サーバーを信頼します (すべてのツール呼び出し確認プロンプトをバイパスします)。
- `--description`: サーバーの説明を設定します。
- `--include-tools`: 含めるツールのカンマ区切りリスト。
- `--exclude-tools`: 除外するツールのカンマ区切りリスト。

#### stdioサーバーの追加

これはローカルサーバーを実行するためのデフォルトトランスポートです。

```bash

# 基本構文
qwen mcp add <name> <command> [args...]

# 例: ローカルサーバーの追加
qwen mcp add my-stdio-server -e API_KEY=123 /path/to/server arg1 arg2 arg3

# 例: ローカルPythonサーバーの追加
qwen mcp add python-server python server.py --port 8080
```

#### HTTPサーバーの追加

このトランスポートはストリーム可能なHTTPトランスポートを使用するサーバー向けです。

```bash

# 基本構文
qwen mcp add --transport http <name> <url>

# 例: HTTPサーバーの追加
qwen mcp add --transport http http-server https://api.example.com/mcp/

# 例: 認証ヘッダー付きHTTPサーバーの追加
qwen mcp add --transport http secure-http https://api.example.com/mcp/ --header "Authorization: Bearer abc123"
```

#### SSEサーバーの追加

このトランスポートはServer-Sent Events (SSE) を使用するサーバー向けです。

```bash

# 基本構文
qwen mcp add --transport sse <name> <url>
```

# 例: SSEサーバーの追加
qwen mcp add --transport sse sse-server https://api.example.com/sse/

# 例: 認証ヘッダー付きのSSEサーバーの追加
qwen mcp add --transport sse secure-sse https://api.example.com/sse/ --header "Authorization: Bearer abc123"
```

### サーバーのリスト表示 (`qwen mcp list`)

現在設定されているすべてのMCPサーバーを表示するには、`list` コマンドを使用します。各サーバーの名前、設定詳細、および接続状態が表示されます。

**コマンド:**

```bash
qwen mcp list
```

**出力例:**

```sh
✓ stdio-server: command: python3 server.py (stdio) - 接続済み
✓ http-server: https://api.example.com/mcp (http) - 接続済み
✗ sse-server: https://api.example.com/sse (sse) - 切断中
```

### サーバーの削除 (`qwen mcp remove`)

設定からサーバーを削除するには、サーバー名を指定して `remove` コマンドを使用します。

**コマンド:**

```bash
qwen mcp remove <name>
```

**例:**

```bash
qwen mcp remove my-server
```

これにより、スコープ (`-s, --scope`) に基づいて適切な `settings.json` ファイル内の `mcpServers` オブジェクトから "my-server" エントリが検索・削除されます。