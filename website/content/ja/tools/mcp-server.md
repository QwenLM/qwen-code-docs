# Qwen Code での MCP サーバー

このドキュメントでは、Qwen Code で Model Context Protocol (MCP) サーバーを設定・使用するためのガイドを提供します。

## MCPサーバーとは？

MCPサーバーは、Model Context Protocolを通じてCLIにツールやリソースを公開するアプリケーションで、外部システムやデータソースとのインタラクションを可能にします。MCPサーバーは、モデルとローカル環境やAPIなどの他のサービスとの間のブリッジとして機能します。

MCPサーバーにより、CLIは以下のような機能を実現できます：

- **ツールの検出:** 標準化されたスキーマ定義を通じて、利用可能なツール、その説明、パラメータをリスト表示
- **ツールの実行:** 定義された引数で特定のツールを呼び出し、構造化されたレスポンスを受信
- **リソースへのアクセス:** 特定のリソースからデータを読み込み（ただしCLIは主にツール実行に焦点を当てています）

MCPサーバーを使用することで、CLIの機能を拡張し、データベースやAPI、カスタムスクリプト、または専門的なワークフローとのインタラクションなど、組み込み機能を超えたアクションを実行できます。

## コアインテグレーションアーキテクチャ

Qwen Code は、コアパッケージ (`packages/core/src/tools/`) に組み込まれた洗練された Discovery および実行システムを通じて、MCP サーバーと統合されます。

### Discovery レイヤー (`mcp-client.ts`)

Discovery プロセスは `discoverMcpTools()` によって制御され、以下の処理を実行します：

1. `settings.json` の `mcpServers` 設定から**設定されたサーバーをイテレート**
2. 適切なトランスポートメカニズム（Stdio、SSE、または Streamable HTTP）を使用して**接続を確立**
3. MCP プロトコルを使用して各サーバーから**ツール定義を取得**
4. Qwen API との互換性を確保するためにツールスキーマを**サニタイズおよび検証**
5. 競合解決を行いながらグローバルツールレジストリに**ツールを登録**

### 実行レイヤー (`mcp-tool.ts`)

検出された各 MCP ツールは、以下を行う `DiscoveredMCPTool` インスタンスでラップされます：

- サーバーの信頼設定とユーザー設定に基づいた**確認ロジックを処理**
- 適切なパラメータで MCP サーバーを呼び出して**ツール実行を管理**
- LLM コンテキストとユーザーディスプレイの両方のために**レスポンスを処理**
- 接続状態を**維持**し、タイムアウトを処理

### トランスポート機構

CLI は3種類の MCP トランスポートタイプをサポートしています：

- **Stdio Transport:** サブプロセスを起動し、stdin/stdout 経由で通信します
- **SSE Transport:** Server-Sent Events エンドポイントに接続します
- **Streamable HTTP Transport:** HTTP ストリーミングを使用して通信を行います

## MCP サーバーのセットアップ方法

Qwen Code は、`settings.json` ファイル内の `mcpServers` 設定を使用して、MCP サーバーの場所を特定し、接続します。この設定では、異なるトランスポート機構を持つ複数のサーバーをサポートしています。

### settings.json で MCP サーバーを設定する

`settings.json` ファイル内で MCP サーバーを設定する方法は主に2つあります。1つはトップレベルの `mcpServers` オブジェクトを使って特定のサーバー定義を行う方法、もう1つは `mcp` オブジェクトを使ってサーバーの検出と実行を制御するグローバル設定を行う方法です。

#### グローバル MCP 設定 (`mcp`)

`settings.json` 内の `mcp` オブジェクトでは、すべての MCP サーバーに対するグローバルルールを定義できます。

- **`mcp.serverCommand`** (string): MCP サーバーを起動するためのグローバルコマンド。
- **`mcp.allowed`** (string の配列): 許可する MCP サーバー名のリスト。この設定がある場合、このリスト内のサーバー（`mcpServers` オブジェクトのキーと一致するもの）のみが接続されます。
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

#### サーバー固有の設定 (`mcpServers`)

`mcpServers` オブジェクトは、CLI が接続する各 MCP サーバーを定義する場所です。

### 設定構造

`settings.json` ファイルに `mcpServers` オブジェクトを追加してください：

```json
{ ...ファイルには他の設定オブジェクトも含まれる
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

各サーバー設定では以下のプロパティをサポートしています：

#### 必須（以下のいずれか1つ）

- **`command`** (string): Stdio トランスポート用の実行可能ファイルへのパス
- **`url`** (string): SSE エンドポイント URL（例: `"http://localhost:8080/sse"`）
- **`httpUrl`** (string): HTTP ストリーミング エンドポイント URL

#### オプショナル

- **`args`** (string[]): Stdio トランスポート用のコマンドライン引数
- **`headers`** (object): `url` または `httpUrl` 使用時のカスタム HTTP ヘッダー
- **`env`** (object): サーバープロセス用の環境変数。値には `$VAR_NAME` または `${VAR_NAME}` 構文を使って環境変数を参照できます
- **`cwd`** (string): Stdio トランスポート用のワーキングディレクトリ
- **`timeout`** (number): リクエストタイムアウト（ミリ秒単位）（デフォルト: 600,000ms = 10分）
- **`trust`** (boolean): `true` の場合、このサーバーに対するすべてのツール呼び出し確認をスキップします（デフォルト: `false`）
- **`includeTools`** (string[]): この MCP サーバーからインクルードするツール名のリスト。指定された場合、ここにリストされたツールのみがこのサーバーから利用可能になります（allowlist の動作）。指定しない場合、サーバーからのすべてのツールがデフォルトで有効になります。
- **`excludeTools`** (string[]): この MCP サーバーから除外するツール名のリスト。ここにリストされたツールは、サーバーから公開されていてもモデルからは利用できません。**注意:** `excludeTools` は `includeTools` よりも優先されます — 両方のリストに同じツールがある場合は除外されます。
- **`targetAudience`** (string): アクセスしようとしている IAP 保護アプリケーションで許可されている OAuth Client ID。`authProviderType: 'service_account_impersonation'` と共に使用します。
- **`targetServiceAccount`** (string): インパーソネートする Google Cloud Service Account のメールアドレス。`authProviderType: 'service_account_impersonation'` と共に使用します。

### リモート MCP サーバーでの OAuth サポート

Qwen Code は、SSE または HTTP トランスポートを使用するリモート MCP サーバーに対して OAuth 2.0 認証をサポートしています。これにより、認証が必要な MCP サーバーへの安全なアクセスが可能になります。

#### 自動 OAuth 検出

OAuth 検出をサポートするサーバーでは、OAuth 設定を省略して CLI に自動検出させることができます：

```json
{
  "mcpServers": {
    "discoveredServer": {
      "url": "https://api.example.com/sse"
    }
  }
}
```

CLI は自動的に以下を行います：

- サーバーが OAuth 認証を必要とするかどうかを検出（401 レスポンス）
- サーバーメタデータから OAuth エンドポイントを検出
- サポートされている場合は動的クライアント登録を実行
- OAuth フローとトークン管理を処理

#### 認証フロー

OAuthが有効なサーバーに接続する場合：

1. **初回接続試行** が401 Unauthorizedで失敗する
2. **OAuthディスカバリー** により認可エンドポイントとトークンエンドポイントを検出
3. **ブラウザが開き** ユーザー認証を行う（ローカルブラウザへのアクセスが必要）
4. **認可コード** をアクセストークンと交換
5. **トークンを安全に保存** して次回以降の利用に備える
6. **再接続試行** が有効なトークンを使って成功する

#### ブラウザリダイレクトの要件

**重要：** OAuth認証には以下の条件が必要です：

- 認証用にウェブブラウザを開けること
- `http://localhost:7777/oauth/callback` でリダイレクトを受け取れること

この機能は以下の環境では動作しません：

- ブラウザアクセスがないヘッドレス環境
- X11フォワーディングなしのリモートSSHセッション
- ブラウザサポートがないコンテナ環境

#### OAuth認証の管理

`/mcp auth` コマンドを使ってOAuth認証を管理できます：

```bash

# 認証が必要なサーバー一覧を表示
/mcp auth
```

```markdown
# 特定のサーバーで認証する
/mcp auth serverName

# トークンが期限切れの場合に再認証する
/mcp auth serverName
```

#### OAuth 設定プロパティ

- **`enabled`** (boolean): このサーバーで OAuth を有効化する
- **`clientId`** (string): OAuth クライアント識別子 (動的登録時は省略可)
- **`clientSecret`** (string): OAuth クライアントシークレット (パブリッククライアントでは省略可)
- **`authorizationUrl`** (string): OAuth 認可エンドポイント (省略時は自動検出)
- **`tokenUrl`** (string): OAuth トークンエンドポイント (省略時は自動検出)
- **`scopes`** (string[]): 必須の OAuth スコープ
- **`redirectUri`** (string): カスタムリダイレクト URI (デフォルト: `http://localhost:7777/oauth/callback`)
- **`tokenParamName`** (string): SSE URL 内のトークン用クエリパラメータ名
- **`audiences`** (string[]): トークンが有効なオーディエンス
```

#### トークン管理

OAuth トークンは自動的に：

- **安全に保存される**：`~/.qwen/mcp-oauth-tokens.json` に
- **リフレッシュされる**：期限切れ時に（リフレッシュトークンが利用可能な場合）
- **検証される**：各接続試行前に
- **クリーンアップされる**：無効または期限切れの場合に

#### 認証プロバイダータイプ

`authProviderType` プロパティを使用して、認証プロバイダーのタイプを指定できます：

- **`authProviderType`** (string): 認証プロバイダーを指定します。以下のいずれかを指定できます：
  - **`dynamic_discovery`** (デフォルト): CLI がサーバーから OAuth 設定を自動的に検出します。
  - **`google_credentials`**: CLI が Google Application Default Credentials (ADC) を使用してサーバーに認証します。このプロバイダーを使用する場合、必要なスコープを指定する必要があります。
  - **`service_account_impersonation`**: CLI が Google Cloud サービスアカウントを偽装してサーバーに認証します。これは IAP で保護されたサービスへのアクセスに便利です（これは特に Cloud Run サービス用に設計されました）。

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

#### Service Account Impersonation

Service Account Impersonation を使用してサーバーで認証するには、`authProviderType` を `service_account_impersonation` に設定し、以下のプロパティを指定する必要があります：

- **`targetAudience`** (string): アクセス先の IAP で保護されたアプリケーションで許可リストに登録されている OAuth Client ID。
- **`targetServiceAccount`** (string): 権限を借用する Google Cloud Service Account のメールアドレス。

CLI はローカルの Application Default Credentials (ADC) を使用して、指定されたサービスアカウントとオーディエンス向けの OIDC ID トークンを生成します。このトークンは MCP サーバーへの認証に使用されます。

#### セットアップ手順

1. **OAuth 2.0 クライアント ID を[作成](https://cloud.google.com/iap/docs/oauth-client-creation)するか、既存のものを使用します。** 既存の OAuth 2.0 クライアント ID を使用する場合は、[OAuth クライアントの共有方法](https://cloud.google.com/iap/docs/sharing-oauth-clients)の手順に従ってください。
2. **アプリケーションの[プログラムによるアクセス](https://cloud.google.com/iap/docs/sharing-oauth-clients#programmatic_access)用に OAuth ID を許可リストに追加します。** Cloud Run はまだ gcloud iap でサポートされているリソースタイプではないため、プロジェクト上でクライアント ID を許可リストに登録する必要があります。
3. **サービスアカウントを作成します。** [ドキュメント](https://cloud.google.com/iam/docs/service-accounts-create#creating)、[Cloud Console リンク](https://console.cloud.google.com/iam-admin/serviceaccounts)
4. **サービスアカウントとユーザーの両方を IAP ポリシーに追加します。** これは Cloud Run サービス自体の「セキュリティ」タブから、または gcloud を介して行います。
5. **MCP Server にアクセスするすべてのユーザーおよびグループに、サービスアカウントを[偽装する](https://cloud.google.com/docs/authentication/use-service-account-impersonation)ために必要な権限**（つまり、`roles/iam.serviceAccountTokenCreator`）を付与します。
6. **プロジェクトで IAM Credentials API を[有効化](https://console.cloud.google.com/apis/library/iamcredentials.googleapis.com)します。**

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

#### HTTPベースのMCP Server

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

#### カスタムヘッダー付きHTTPベースのMCP Server

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

#### ツールフィルタリング付きMCP Server

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

### SA Impersonation を使用した SSE MCP サーバー

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

## Discovery Process の詳細

Qwen Code が起動すると、以下の詳細なプロセスを通じて MCP サーバーの Discovery を実行します：

### 1. サーバーのイテレーションと接続

`mcpServers` で設定された各サーバーに対して:

1. **ステータス追跡開始:** サーバーのステータスが `CONNECTING` に設定される
2. **Transport の選択:** 設定プロパティに基づいて選択:
   - `httpUrl` → `StreamableHTTPClientTransport`
   - `url` → `SSEClientTransport`
   - `command` → `StdioClientTransport`
3. **接続確立:** MCP クライアントが設定されたタイムアウトで接続を試行する
4. **エラー処理:** 接続失敗はログに記録され、サーバーのステータスは `DISCONNECTED` に設定される

### 2. ツールの検出

接続に成功すると以下の処理が実行されます：

1. **ツール一覧の取得:** クライアントがMCPサーバーのツール一覧エンドポイントを呼び出します  
2. **スキーマの検証:** 各ツールのfunction宣言が検証されます  
3. **ツールのフィルタリング:** `includeTools` および `excludeTools` の設定に基づいてツールがフィルタリングされます  
4. **名前のサニタイズ:** Qwen APIの要件を満たすためにツール名がクリーニングされます：
   - 無効な文字（英数字、アンダースコア、ドット、ハイフン以外）はアンダースコアに置換されます  
   - 63文字を超える名前は中間置換（`___`）によって短縮されます  

### 3. 競合の解決

複数のサーバーが同じ名前のツールを公開している場合：

1. **最初の登録が優先:** 最初にツール名を登録したサーバーがプレフィックスなしの名前を取得します  
2. **自動プレフィックス付与:** その後に登録するサーバーには `serverName__toolName` の形式でプレフィックスが付与されます  
3. **レジストリの追跡:** ツールレジストリはサーバー名とそのツールのマッピングを維持します

### 4. スキーマ処理

ツールのパラメータスキーマは、API互換性のためにサニタイズ処理が行われます：

- **`$schema` プロパティ** は削除されます
- **`additionalProperties`** は除去されます
- **`default` 付きの `anyOf`** では、デフォルト値が削除されます（Vertex AI互換性のため）
- **再帰的処理** により、ネストされたスキーマにも同様の処理が適用されます

### 5. コネクション管理

Discoveryプロセス終了後：

- **永続接続：** ツール登録に成功したサーバーは接続を維持します
- **クリーンアップ：** 利用可能なツールを提供しないサーバーの接続はクローズされます
- **ステータス更新：** 最終的なサーバーステータスは `CONNECTED` または `DISCONNECTED` に設定されます

## ツール実行フロー

モデルがMCPツールを使用することを決定すると、以下の実行フローが発生します：

### 1. ツール呼び出し

モデルは以下を含む `FunctionCall` を生成します：

- **ツール名：** 登録された名前（プレフィックスが付いている可能性あり）
- **引数：** ツールのパラメータスキーマに一致するJSONオブジェクト

### 2. 確認プロセス

各 `DiscoveredMCPTool` は高度な確認ロジックを実装しています：

#### 信頼ベースのバイパス

```typescript
if (this.trust) {
  return false; // 確認不要
}
```

#### 動的な許可リスト管理

システムは以下の内部許可リストを維持します：

- **サーバーレベル：** `serverName` → このサーバーからのすべてのツールが信頼済み
- **ツールレベル：** `serverName.toolName` → この特定のツールが信頼済み

#### ユーザー選択の処理

確認が必要な場合、ユーザーは以下から選択できます：

- **今回のみ実行：** 今回は実行する
- **常にこのツールを許可：** ツールレベルの許可リストに追加
- **常にこのサーバーを許可：** サーバーレベルの許可リストに追加
- **キャンセル：** 実行を中止

### 3. 実行

確認（または信頼のバイパス）後：

1. **パラメータ準備：** 引数はツールのスキーマに対して検証される
2. **MCP呼び出し：** 基底の`CallableTool`が以下でサーバを呼び出す：

   ```typescript
   const functionCalls = [
     {
       name: this.serverToolName, // 元のサーバツール名
       args: params,
     },
   ];
   ```

3. **レスポンス処理：** 結果はLLMコンテキストとユーザ表示の両方で整形される

### 4. レスポンスハンドリング

実行結果には以下の内容が含まれる：

- **`llmContent`：** 言語モデルのコンテキスト用の生レスポンス部分
- **`returnDisplay`：** ユーザ表示用の整形された出力（多くの場合、markdownコードブロック内のJSON）

## MCPサーバとのやり取り方法

### `/mcp` コマンドの使用

`/mcp` コマンドは、MCP サーバー設定に関する包括的な情報を提供します：

```bash
/mcp
```

このコマンドを実行すると以下が表示されます：

- **サーバーリスト：** 設定されているすべての MCP サーバー
- **接続状態：** `CONNECTED`、`CONNECTING`、または `DISCONNECTED`
- **サーバー詳細：** 機密情報以外の設定概要
- **利用可能なツール：** 各サーバーから提供されるツールとその説明
- **検出状態：** 全体の Discovery プロセスのステータス

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

### ツールの使用方法

発見されたMCPツールは、Qwenモデルにとって組み込みツールのように利用可能です。モデルは自動的に：

1. リクエストに基づいて**適切なツールを選択**
2. （サーバーが信頼されていない場合）**確認ダイアログを表示**
3. 適切なパラメータで**ツールを実行**
4. 結果をユーザーフレンドリーな形式で**表示**

## ステータス監視とトラブルシューティング

### 接続状態

MCP連携では以下のステートが管理されます：

#### サーバーステータス（`MCPServerStatus`）

- **`DISCONNECTED`:** サーバーが未接続またはエラー状態
- **`CONNECTING`:** 接続試行中
- **`CONNECTED`:** サーバーに接続済みで準備完了

#### 発見状態（`MCPDiscoveryState`）

- **`NOT_STARTED`:** 発見処理がまだ開始されていない
- **`IN_PROGRESS`:** 現在サーバーを発見中
- **`COMPLETED`:** 発見処理が完了（エラーあり／なし問わず）

### よくある問題と解決策

#### サーバーに接続できない

**症状:** サーバーのステータスが `DISCONNECTED` と表示される

**トラブルシューティング:**

1. **設定を確認:** `command`、`args`、`cwd` が正しいことを確認
2. **手動でテスト:** サーバーコマンドを直接実行して動作することを確認
3. **依存関係を確認:** 必要なパッケージがすべてインストールされていることを確認
4. **ログを確認:** CLI出力でエラーメッセージを探す
5. **権限を確認:** CLIがサーバーコマンドを実行できることを確認

#### ツールが検出されない

**症状:** サーバーには接続できるがツールが利用できない

**トラブルシューティング:**

1. **ツール登録を確認:** サーバーが実際にツールを登録していることを確認
2. **MCPプロトコルを確認:** サーバーがMCPのツール一覧機能を正しく実装していることを確認
3. **サーバーログを確認:** サーバー側のエラーについてstderr出力を確認
4. **ツール一覧をテスト:** サーバーのツール検出endpointを手動でテスト

#### ツールが実行されない

**症状:** ツールは検出されるが実行時に失敗する

**トラブルシューティング:**

1. **パラメータ検証:** ツールが期待するパラメータを受け取れているか確認する
2. **スキーマ互換性:** 入力スキーマが有効な JSON Schema であることを検証する
3. **エラー処理:** ツールが未処理の例外をスローしていないかチェックする
4. **タイムアウト問題:** `timeout` 設定を増やすことを検討する

#### サンドボックス互換性

**症状:** サンドボックスが有効な場合に MCP サーバーが失敗する

**解決策:**

1. **Dockerベースのサーバー:** すべての依存関係を含む Docker コンテナを使用する
2. **パスのアクセシビリティ:** サンドボックス内でサーバー実行ファイルが利用可能であることを確認する
3. **ネットワークアクセス:** 必要なネットワーク接続を許可するようにサンドボックスを設定する
4. **環境変数:** 必要な環境変数が正しく渡されていることを検証する

### デバッグのヒント

1. **デバッグモードを有効化:** 詳細な出力を得るために `--debug` オプション付きで CLI を実行する
2. **stderr を確認:** MCP サーバーの stderr はキャプチャされログに記録される（INFO メッセージはフィルタリングされる）
3. **テストの分離:** 統合前に MCP サーバーを独立してテストする
4. **段階的なセットアップ:** 複雑な機能を追加する前にシンプルなツールから始める
5. **`/mcp` を頻繁に使用:** 開発中にサーバーの状態を監視する

## 重要な注意点

### セキュリティに関する考慮事項

- **信頼設定:** `trust` オプションはすべての確認ダイアログをバイパスします。慎重に使用し、完全に制御しているサーバーに対してのみ使用してください
- **アクセストークン:** API キーやトークンを含む環境変数を設定する際は、セキュリティに注意してください
- **サンドボックス互換性:** サンドボックスを使用する場合、MCP サーバーがサンドボックス環境内で利用可能であることを確認してください
- **プライベートデータ:** 広範囲にわたるスコープを持つ個人用アクセストークンを使用すると、リポジトリ間での情報漏洩を引き起こす可能性があります

### パフォーマンスとリソース管理

- **接続の永続化:** CLI は、ツールの登録に成功したサーバーへの持続的な接続を維持します
- **自動クリーンアップ:** ツールを提供しないサーバーへの接続は自動的に閉じられます
- **タイムアウト管理:** サーバーの応答特性に基づいて適切なタイムアウトを設定してください
- **リソース監視:** MCP サーバーは別プロセスとして実行され、システムリソースを消費します

### スキーマ互換性

- **プロパティの除去:** Qwen API との互換性を保つため、システムは特定のスキーマプロパティ（`$schema`、`additionalProperties`）を自動的に削除します
- **名前サニタイズ:** ツール名は API 要件を満たすために自動的にサニタイズされます
- **競合解決:** サーバー間でのツール名の競合は、自動的なプレフィックス付与により解決されます

この包括的な統合により、MCP サーバーは CLI の機能を拡張する強力な手段となり、セキュリティ、信頼性、使いやすさを維持できます。

## ツールからのリッチコンテンツの返却

MCPツールは単純なテキストの返却に限定されません。1つのツールレスポンス内で、テキスト、画像、音声、その他のバイナリデータを含む、リッチでマルチパートのコンテンツを返却できます。これにより、1回のやり取りでモデルに多様な情報を提供できる強力なツールを構築することが可能になります。

ツールから返却されたすべてのデータは処理され、モデルの次の生成のためのコンテキストとして送信されます。これにより、モデルは提供された情報について推論したり要約したりすることが可能になります。

### 動作原理

リッチなコンテンツを返すためには、ツールのレスポンスが [`CallToolResult`](https://modelcontextprotocol.io/specification/2025-06-18/server/tools#tool-result) の MCP 仕様に準拠している必要があります。result の `content` フィールドには `ContentBlock` オブジェクトの配列を指定してください。CLI はこの配列を正しく処理し、テキストとバイナリデータを分離して、モデル用にパッケージ化します。

`content` 配列内では、異なる content block タイプを混在させることができます。サポートされているブロックタイプは以下の通りです：

- `text`
- `image`
- `audio`
- `resource` (埋め込みコンテンツ)
- `resource_link`

### 例: テキストと画像を返す

以下は、テキストの説明と画像の両方を返すMCPツールからの有効なJSONレスポンスの例です：

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

Qwen Codeがこのレスポンスを受信すると、以下の処理を行います：

1. すべてのテキストを抽出し、モデル用の単一の`functionResponse`パートに結合します。
2. 画像データを別の`inlineData`パートとして表示します。
3. CLIに、テキストと画像の両方が受信されたことを示す、クリーンでユーザーフレンドリーなサマリーを提供します。

これにより、Qwenモデルにリッチでマルチモーダルなコンテキストを提供できる、洗練されたツールを構築できます。

## MCP Prompts as Slash Commands

ツールに加えて、MCP サーバーは事前に定義されたプロンプトを公開することができ、これらは Qwen Code 内でスラッシュコマンドとして実行できます。これにより、一般的なクエリや複雑なクエリに対してショートカットを作成し、名前で簡単に呼び出すことが可能になります。

### サーバーでのプロンプト定義

プロンプトを定義する stdio MCP サーバーの小さな例がこちらです：

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

これは `settings.json` の `mcpServers` 以下に次のように含めることができます：

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

プロンプトが見つかったら、スラッシュコマンドとして名前を指定して呼び出すことができます。CLI は引数の解析を自動的に処理します。

```bash
/poem-writer --title="Qwen Code" --mood="reverent"
```

または、位置引数を使って：

```bash
/poem-writer "Qwen Code" reverent
```

このコマンドを実行すると、CLI は MCP サーバー上で `prompts/get` メソッドを実行し、指定された引数を渡します。サーバー側では、これらの引数をプロンプトテンプレートに埋め込み、最終的なプロンプトテキストを返却します。その後、CLI はそのプロンプトをモデルに送信して実行します。これにより、一般的なワークフローを簡単に自動化・共有できるようになります。

## `qwen mcp` による MCP サーバーの管理

MCP サーバーは `settings.json` ファイルを直接編集して設定することもできますが、CLI ではサーバー設定をプログラムで管理するための便利なコマンド群を提供しています。これらのコマンドを使うことで、JSON ファイルを直接編集することなく、MCP サーバーの追加、一覧表示、削除を簡単に行えます。

### サーバーの追加 (`qwen mcp add`)

`add` コマンドは、新しい MCP サーバーを `settings.json` に設定します。スコープ（`-s, --scope`）に応じて、ユーザー設定の `~/.qwen/settings.json` またはプロジェクト設定の `.qwen/settings.json` ファイルに追加されます。

**コマンド:**

```bash
qwen mcp add [options] <name> <commandOrUrl> [args...]
```

- `<name>`: サーバーのユニークな名前。
- `<commandOrUrl>`: 実行するコマンド（`stdio` の場合）または URL（`http`/`sse` の場合）。
- `[args...]`: `stdio` コマンドに渡す任意の引数。

**オプション（フラグ）:**

- `-s, --scope`: 設定のスコープ（user または project）。[デフォルト: "project"]
- `-t, --transport`: 通信方式（stdio, sse, http）。[デフォルト: "stdio"]
- `-e, --env`: 環境変数を設定（例: -e KEY=value）。
- `-H, --header`: SSE および HTTP 通信で使用する HTTP ヘッダーを設定（例: -H "X-Api-Key: abc123" -H "Authorization: Bearer abc123"）。
- `--timeout`: 接続タイムアウトをミリ秒で設定。
- `--trust`: サーバーを信頼（すべてのツール呼び出し確認プロンプトをバイパス）。
- `--description`: サーバーの説明を設定。
- `--include-tools`: 含めるツールのカンマ区切りリスト。
- `--exclude-tools`: 除外するツールのカンマ区切りリスト。

#### stdio サーバーの追加

これはローカルサーバーを実行するためのデフォルトの transport です。

```bash

# 基本構文
qwen mcp add <name> <command> [args...]

# 例: ローカルサーバーの追加
qwen mcp add my-stdio-server -e API_KEY=123 /path/to/server arg1 arg2 arg3

# 例: ローカル Python サーバーの追加
qwen mcp add python-server python server.py --port 8080
```

#### HTTP サーバーの追加

この transport は、streamable HTTP transport を使用するサーバー用です。

```bash

# 基本構文
qwen mcp add --transport http <name> <url>

# 例: HTTP サーバーの追加
qwen mcp add --transport http http-server https://api.example.com/mcp/

# 例: 認証ヘッダー付き HTTP サーバーの追加
qwen mcp add --transport http secure-http https://api.example.com/mcp/ --header "Authorization: Bearer abc123"
```

#### SSE サーバーの追加

この transport は、Server-Sent Events (SSE) を使用するサーバー用です。

```bash

# 基本構文
qwen mcp add --transport sse <name> <url>
```

```markdown
# 例: SSE サーバーの追加
qwen mcp add --transport sse sse-server https://api.example.com/sse/

# 例: 認証ヘッダー付きの SSE サーバーの追加
qwen mcp add --transport sse secure-sse https://api.example.com/sse/ --header "Authorization: Bearer abc123"
```

### サーバー一覧の表示 (`qwen mcp list`)

現在設定されているすべての MCP サーバーを確認するには、`list` コマンドを使用します。各サーバーの名前、設定詳細、接続状態が表示されます。

**コマンド:**

```bash
qwen mcp list
```

**出力例:**

```sh
✓ stdio-server: command: python3 server.py (stdio) - Connected
✓ http-server: https://api.example.com/mcp (http) - Connected
✗ sse-server: https://api.example.com/sse (sse) - Disconnected
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

このコマンドは、スコープ (`-s, --scope`) に応じた適切な `settings.json` ファイル内の `mcpServers` オブジェクトから "my-server" のエントリを検索し、削除します。