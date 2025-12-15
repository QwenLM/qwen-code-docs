# Qwen Code による MCP サーバー

このドキュメントでは、Qwen Code を使用した Model Context Protocol (MCP) サーバーの設定および利用方法について説明します。

## MCPサーバーとは？

MCPサーバーは、Model Context Protocolを通じてCLIにツールやリソースを公開し、外部システムやデータソースとやり取りできるようにするアプリケーションです。MCPサーバーは、モデルとローカル環境またはAPIなどの他のサービス間のブリッジとして機能します。

MCPサーバーにより、CLIは以下が可能になります：

- **ツールの検出：** 標準化されたスキーマ定義を通じて、利用可能なツール、その説明、およびパラメータを一覧表示します。
- **ツールの実行：** 定義された引数で特定のツールを呼び出し、構造化されたレスポンスを受け取ります。
- **リソースへのアクセス：** 特定のリソースからデータを読み込みます（ただし、CLIは主にツールの実行に焦点を当てています）。

MCPサーバーを使用することで、データベースやAPI、カスタムスクリプト、または特殊なワークフローとのやり取りなど、CLIの組み込み機能を超えたアクションを実行するための拡張機能を提供できます。

## コア統合アーキテクチャ

Qwen Code は、コアパッケージ (`packages/core/src/tools/`) に組み込まれた洗練された検出および実行システムを通じて、MCP サーバーと統合されます。

### 検出レイヤー (`mcp-client.ts`)

検出プロセスは `discoverMcpTools()` によって制御され、以下の処理を行います。

1. **設定されたサーバーをイテレート** — `settings.json` の `mcpServers` 設定から取得
2. **接続を確立** — 適切なトランスポートメカニズム（Stdio、SSE、またはストリーム可能 HTTP）を使用
3. **ツール定義を取得** — 各サーバーから MCP プロトコルを使ってツール定義をフェッチ
4. **スキーマのサニタイズと検証** — Qwen API との互換性を確保するためにツールスキーマをクリーンアップ・検証
5. **グローバルツールレジストリへの登録** — 競合解決を行いながらツールをグローバルレジストリに登録

### 実行レイヤー (`mcp-tool.ts`)

発見された各MCPツールは、以下を行う `DiscoveredMCPTool` インスタンスでラップされます：

- サーバーの信頼設定とユーザーの設定に基づいた**確認ロジックの処理**
- 適切なパラメータでMCPサーバーを呼び出すことで**ツール実行の管理**
- LLMコンテキストとユーザーディスプレイの両方に対する**レスポンスの処理**
- 接続状態の**維持**およびタイムアウトの処理

### トランスポート機構

CLIは3種類のMCPトランスポートタイプをサポートしています：

- **Stdioトランスポート：** サブプロセスを起動し、stdin/stdout経由で通信します
- **SSEトランスポート：** Server-Sent Eventsエンドポイントに接続します
- **ストリーム可能HTTPトランスポート：** HTTPストリーミングを使用して通信を行います

## MCPサーバーのセットアップ方法

Qwen Codeは、`settings.json` ファイル内の `mcpServers` 設定を使用して、MCPサーバーの場所を特定し、接続します。この設定では、異なるトランスポート機構を持つ複数のサーバーがサポートされています。

### settings.json で MCP サーバーを設定する

`settings.json` ファイル内で、MCP サーバーを2つの主要な方法で設定できます。1つはトップレベルの `mcpServers` オブジェクトを通じて特定のサーバー定義を行う方法、もう1つは `mcp` オブジェクトを通じてサーバーの検出と実行を制御するグローバル設定を行う方法です。

#### グローバル MCP 設定 (`mcp`)

`settings.json` 内の `mcp` オブジェクトを使用して、すべての MCP サーバーに対するグローバルルールを定義できます。

- **`mcp.serverCommand`** (文字列): MCP サーバーを起動するためのグローバルコマンド。
- **`mcp.allowed`** (文字列の配列): 許可する MCP サーバー名のリスト。これが設定されている場合、このリストからのサーバー（`mcpServers` オブジェクト内のキーと一致するもの）のみが接続されます。
- **`mcp.excluded`** (文字列の配列): 除外する MCP サーバー名のリスト。このリスト内のサーバーには接続されません。

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

`settings.json` ファイルに `mcpServers` オブジェクトを追加します：

```json
{ ...ファイルには他の設定オブジェクトが含まれる
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

各サーバー設定は以下のプロパティをサポートしています：

#### 必須（以下のいずれか一つ）

- **`command`** (string): Stdio トランスポート用の実行可能ファイルへのパス
- **`url`** (string): SSE エンドポイント URL（例：`"http://localhost:8080/sse"`）
- **`httpUrl`** (string): HTTP ストリーミング エンドポイント URL

#### オプション

- **`args`** (string[]): Stdio トランスポート用のコマンドライン引数
- **`headers`** (object): `url` または `httpUrl` を使用する際のカスタム HTTP ヘッダー
- **`env`** (object): サーバープロセス用の環境変数。値には `$VAR_NAME` または `${VAR_NAME}` 構文を使用して、他の環境変数を参照できます
- **`cwd`** (string): Stdio トランスポート用の作業ディレクトリ
- **`timeout`** (number): リクエストタイムアウト（ミリ秒単位）（デフォルト: 600,000ms = 10分）
- **`trust`** (boolean): `true` の場合、このサーバーに対するすべてのツール呼び出し確認をバイパスします（デフォルト: `false`）
- **`includeTools`** (string[]): この MCP サーバーから含めるツール名のリスト。指定された場合、ここにリストされたツールのみがこのサーバーから利用可能になります（許可リスト方式）。指定しない場合、サーバーからのすべてのツールがデフォルトで有効になります。
- **`excludeTools`** (string[]): この MCP サーバーから除外するツール名のリスト。ここにリストされたツールは、サーバーから公開されていてもモデルからは利用できません。**注意:** `excludeTools` は `includeTools` よりも優先されます — 両方のリストに同じツールがある場合は除外されます。
- **`targetAudience`** (string): アクセスしようとしている IAP 保護アプリケーション上で許可リストに登録されている OAuth クライアント ID。`authProviderType: 'service_account_impersonation'` と共に使用します。
- **`targetServiceAccount`** (string): 権限を借用する Google Cloud サービスアカウントのメールアドレス。`authProviderType: 'service_account_impersonation'` と共に使用します。

### リモート MCP サーバーの OAuth サポート

Qwen Code は、SSE または HTTP トランスポートを使用するリモート MCP サーバーに対して OAuth 2.0 認証をサポートしています。これにより、認証が必要な MCP サーバーへの安全なアクセスが可能になります。

#### 自動 OAuth 検出

OAuth 検出をサポートするサーバーの場合、OAuth 設定を省略し、CLI に自動的に検出させることができます：

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

- サーバーが OAuth 認証を必要とする場合（401 応答）を検出
- サーバーメタデータから OAuth エンドポイントを検出
- サポートされている場合は動的クライアント登録を実行
- OAuth フローとトークン管理を処理

#### 認証フロー

OAuthが有効なサーバーに接続する場合：

1. **初回接続試行**は401 Unauthorizedで失敗する
2. **OAuthディスカバリー**により認可エンドポイントとトークンエンドポイントを検出する
3. **ブラウザを開いて**ユーザー認証を行う（ローカルブラウザへのアクセスが必要）
4. **認可コード**をアクセストークンと交換する
5. **トークンを安全に保存**して将来の使用に備える
6. **再接続試行**は有効なトークンにより成功する

#### ブラウザリダイレクト要件

**重要：** OAuth認証には以下の条件が必要です：

- 認証用にウェブブラウザを開けること
- `http://localhost:7777/oauth/callback` でのリダイレクトを受け取れること

この機能は以下では動作しません：

- ブラウザアクセスがないヘッドレス環境
- X11転送なしのリモートSSHセッション
- ブラウザサポートがないコンテナ化された環境

#### OAuth認証の管理

`/mcp auth` コマンドを使用してOAuth認証を管理します：

```bash

# 認証が必要なサーバー一覧表示
/mcp auth
```

```markdown
# 特定のサーバーで認証する
/mcp auth serverName

# トークンが期限切れの場合に再認証する
/mcp auth serverName
```

#### OAuth 設定プロパティ

- **`enabled`** (boolean): このサーバーに対して OAuth を有効にする
- **`clientId`** (string): OAuth クライアント識別子（動的登録時は省略可）
- **`clientSecret`** (string): OAuth クライアントシークレット（パブリッククライアントでは省略可）
- **`authorizationUrl`** (string): OAuth 認可エンドポイント（省略時は自動検出）
- **`tokenUrl`** (string): OAuth トークンエンドポイント（省略時は自動検出）
- **`scopes`** (string[]): 必要な OAuth スコープ
- **`redirectUri`** (string): カスタムリダイレクト URI（デフォルトは `http://localhost:7777/oauth/callback`）
- **`tokenParamName`** (string): SSE URL 内のトークン用クエリパラメータ名
- **`audiences`** (string[]): トークンが有効なオーディエンス
```

#### トークン管理

OAuthトークンは自動的に：

- `~/.qwen/mcp-oauth-tokens.json` に**安全に保存**されます
- 期限切れ時に（リフレッシュトークンが利用可能な場合）**更新**されます
- 各接続試行前に**検証**されます
- 無効または期限切れになったときに**クリーンアップ**されます

#### 認証プロバイダータイプ

`authProviderType` プロパティを使用して、認証プロバイダーのタイプを指定できます：

- **`authProviderType`** (文字列): 認証プロバイダーを指定します。以下のいずれかを指定できます：
  - **`dynamic_discovery`** (デフォルト): CLI はサーバーから OAuth 設定を自動的に検出します。
  - **`google_credentials`**: CLI は Google Application Default Credentials (ADC) を使用してサーバーで認証を行います。このプロバイダーを使用する場合、必要なスコープを指定する必要があります。
  - **`service_account_impersonation`**: CLI は Google Cloud サービスアカウントを偽装してサーバーで認証を行います。これは IAP で保護されたサービス（特に Cloud Run サービス向けに設計されています）にアクセスする際に便利です。

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

サービスアカウントの偽装を使用してサーバーで認証するには、`authProviderType` を `service_account_impersonation` に設定し、以下のプロパティを指定する必要があります：

- **`targetAudience`**（文字列）：アクセスしようとしている IAP 保護されたアプリケーションで許可リストに登録されている OAuth クライアント ID。
- **`targetServiceAccount`**（文字列）：偽装する Google Cloud サービスアカウントのメールアドレス。

CLI はローカルの Application Default Credentials（ADC）を使用して、指定されたサービスアカウントとオーディエンスに対応する OIDC ID トークンを生成します。このトークンは MCP サーバーでの認証に使用されます。

#### 設定手順

1. **OAuth 2.0 クライアント ID を[作成](https://cloud.google.com/iap/docs/oauth-client-creation)するか、既存のものを使用します。** 既存の OAuth 2.0 クライアント ID を使用するには、[OAuth クライアントの共有方法](https://cloud.google.com/iap/docs/sharing-oauth-clients)の手順に従ってください。
2. **アプリケーションの[プログラムによるアクセス](https://cloud.google.com/iap/docs/sharing-oauth-clients#programmatic_access)用に OAuth ID を許可リストに追加します。** Cloud Run はまだ gcloud iap でサポートされているリソースタイプではないため、プロジェクト上でクライアント ID を許可リストに登録する必要があります。
3. **サービスアカウントを作成します。** [ドキュメント](https://cloud.google.com/iam/docs/service-accounts-create#creating)、[Cloud Console リンク](https://console.cloud.google.com/iam-admin/serviceaccounts)
4. **サービスアカウントとユーザーの両方を IAP ポリシーに追加します**。Cloud Run サービス自体の「セキュリティ」タブから、または gcloud 経由で追加してください。
5. **MCP サーバーにアクセスするすべてのユーザーおよびグループに**、サービスアカウントを[偽装する](https://cloud.google.com/docs/authentication/use-service-account-impersonation)ために必要な権限（つまり、`roles/iam.serviceAccountTokenCreator`）を付与します。
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

#### HTTPベースのMCPサーバ

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

#### カスタムヘッダー付きHTTPベースのMCPサーバ

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

#### ツールフィルタリング付きMCPサーバ

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

### SA による SSE MCP サーバー偽装

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

Qwen Code の起動時、以下の詳細なプロセスを通じて MCP サーバーの検出が行われます：

### 1. サーバーのイテレーションと接続

`mcpServers` で設定された各サーバーについて：

1. **ステータス追跡開始：** サーバーのステータスが `CONNECTING` に設定されます
2. **トランスポート選択：** 設定プロパティに基づいて選択されます：
   - `httpUrl` → `StreamableHTTPClientTransport`
   - `url` → `SSEClientTransport`
   - `command` → `StdioClientTransport`
3. **接続確立：** MCPクライアントは、設定されたタイムアウト時間を使用して接続を試みます
4. **エラー処理：** 接続失敗はログに記録され、サーバーのステータスは `DISCONNECTED` に設定されます

### 2. ツールの検出

接続に成功すると：

1. **ツール一覧取得：** クライアントがMCPサーバーのツール一覧エンドポイントを呼び出します  
2. **スキーマ検証：** 各ツールの関数宣言が検証されます  
3. **ツールフィルタリング：** `includeTools` および `excludeTools` 設定に基づいてツールがフィルタリングされます  
4. **名前サニタイズ：** Qwen API の要件を満たすために、ツール名がクリーニングされます：
   - 無効な文字（英数字、アンダースコア、ドット、ハイフン以外）はアンダースコアに置き換えられます  
   - 63文字を超える名前は中間置換（`___`）によって切り詰められます  

### 3. 競合解決

複数のサーバーが同じ名前のツールを公開している場合：

1. **最初の登録が優先：** 最初にツール名を登録したサーバーがプレフィックスなしの名前を取得します  
2. **自動プレフィックス付与：** その後のサーバーにはプレフィックス付きの名前が付与されます：`serverName__toolName`  
3. **レジストリ追跡：** ツールレジストリは、サーバー名とそのツールの間のマッピングを維持します

### 4. スキーマ処理

ツールパラメータのスキーマは、API互換性のためにサニタイズ処理が行われます：

- **`$schema` プロパティ**は削除されます
- **`additionalProperties`** は除去されます
- **`default` 付きの `anyOf`** はデフォルト値が削除されます（Vertex AI互換性のため）
- **再帰的処理**がネストされたスキーマに適用されます

### 5. 接続管理

ディスカバリ後：

- **永続接続：** ツール登録に成功したサーバーは接続を維持します
- **クリーンアップ：** 利用可能なツールを提供しないサーバーの接続は閉じられます
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

#### 動的な許可リスト

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

確認（または信頼バイパス）後:

1. **パラメータ準備:** 引数はツールのスキーマに対して検証されます
2. **MCP呼び出し:** 基盤となる`CallableTool`が以下でサーバーを呼び出します:

   ```typescript
   const functionCalls = [
     {
       name: this.serverToolName, // 元のサーバーツール名
       args: params,
     },
   ];
   ```

3. **レスポンス処理:** 結果はLLMコンテキストとユーザーディスプレイの両方でフォーマットされます

### 4. レスポンス処理

実行結果には以下が含まれます:

- **`llmContent`:** 言語モデルのコンテキスト用の生レスポンス部分
- **`returnDisplay`:** ユーザーディスプレイ用のフォーマット済み出力（多くの場合、マークダウンコードブロック内のJSON）

## MCPサーバーとのやり取り方法

### `/mcp` コマンドの使用

`/mcp` コマンドは、MCP サーバー設定に関する包括的な情報を提供します：

```bash
/mcp
```

このコマンドを実行すると以下が表示されます：

- **サーバーリスト：** 設定されているすべての MCP サーバー
- **接続状態：** `CONNECTED`、`CONNECTING`、または `DISCONNECTED`
- **サーバー詳細：** 機密情報以外の設定概要
- **利用可能なツール：** 各サーバーから提供されるツールとその説明の一覧
- **検出状態：** 全体の検出プロセスのステータス

### `/mcp` コマンド出力例

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

発見された MCP ツールは、Qwen モデルにとって組み込みツールと同様に利用可能です。モデルは自動的に以下の処理を行います：

1. **適切なツールを選択** — リクエストに基づいて適切なツールを選択します  
2. **確認ダイアログを表示** — サーバーが信頼されていない場合に限り表示されます  
3. **ツールを実行** — 適切なパラメータでツールを実行します  
4. **結果を表示** — ユーザーに分かりやすい形式で結果を表示します  

## ステータス監視とトラブルシューティング

### 接続状態

MCP 統合では以下の状態が管理されます：

#### サーバーステータス（`MCPServerStatus`）

- **`DISCONNECTED`:** サーバーが接続されていないか、エラーが発生しています  
- **`CONNECTING`:** 接続試行中です  
- **`CONNECTED`:** サーバーが接続され、準備完了です  

#### 発見状態（`MCPDiscoveryState`）

- **`NOT_STARTED`:** 発見プロセスがまだ開始されていません  
- **`IN_PROGRESS`:** 現在サーバーを発見中です  
- **`COMPLETED`:** 発見プロセスが完了しました（エラーの有無に関わらず）  

### よくある問題と解決策

#### サーバーに接続できない

**症状:** サーバーのステータスが `DISCONNECTED` と表示される

**トラブルシューティング:**

1. **設定を確認する:** `command`、`args`、および `cwd` が正しいことを確認する
2. **手動でテストする:** サーバーコマンドを直接実行して、正常に動作することを確認する
3. **依存関係を確認する:** 必要なパッケージがすべてインストールされていることを確認する
4. **ログを確認する:** CLI 出力でエラーメッセージを探す
5. **権限を確認する:** CLI がサーバーコマンドを実行できることを確認する

#### ツールが検出されない

**症状:** サーバーには接続できるが、ツールが利用できない

**トラブルシューティング:**

1. **ツール登録を確認する:** サーバーが実際にツールを登録していることを確認する
2. **MCP プロトコルを確認する:** サーバーが MCP ツール一覧を正しく実装していることを確認する
3. **サーバーログを確認する:** サーバー側のエラーについて stderr 出力を確認する
4. **ツール一覧をテストする:** サーバーのツール検出エンドポイントを手動でテストする

#### ツールが実行されない

**症状:** ツールは検出されるが実行時に失敗する

**トラブルシューティング:**

1. **パラメータ検証:** ツールが期待するパラメータを受け取ることを確認する
2. **スキーマ互換性:** 入力スキーマが有効なJSON Schemaであることを検証する
3. **エラー処理:** ツールが未処理の例外をスローしていないかチェックする
4. **タイムアウト問題:** `timeout`設定を増やすことを検討する

#### サンドボックス互換性

**症状:** サンドボックスが有効な場合にMCPサーバーが失敗する

**解決策:**

1. **Dockerベースのサーバー:** すべての依存関係を含むDockerコンテナを使用する
2. **パスアクセス性:** サンドボックス内でサーバー実行ファイルが利用可能であることを確認する
3. **ネットワークアクセス:** 必要なネットワーク接続を許可するようにサンドボックスを設定する
4. **環境変数:** 必要な環境変数が引き渡されていることを検証する

### デバッグのヒント

1. **デバッグモードを有効にする:** 冗長な出力を得るために `--debug` を付けて CLI を実行してください
2. **stderr を確認する:** MCP サーバーの stderr はキャプチャされログに記録されます（INFO メッセージはフィルタリングされます）
3. **テストの分離:** 統合前に MCP サーバーを独立してテストしてください
4. **段階的なセットアップ:** 複雑な機能を追加する前に、シンプルなツールから始めましょう
5. **頻繁に `/mcp` を使用する:** 開発中にサーバーの状態を監視してください

## 重要な注意点

### セキュリティに関する考慮事項

- **信頼設定:** `trust` オプションはすべての確認ダイアログをバイパスします。注意して使用し、完全に制御しているサーバーに対してのみ使用してください
- **アクセストークン:** API キーやトークンを含む環境変数を設定する際は、セキュリティに注意してください
- **サンドボックス互換性:** サンドボックスを使用する場合、MCP サーバーがサンドボックス環境内で利用可能であることを確認してください
- **プライベートデータ:** 広範囲にわたる個人アクセストークンを使用すると、リポジトリ間での情報漏洩を引き起こす可能性があります

### パフォーマンスとリソース管理

- **接続の永続化:** CLI は、ツールを正常に登録したサーバーへの持続的な接続を維持します
- **自動クリーンアップ:** ツールを提供しないサーバーへの接続は自動的に閉じられます
- **タイムアウト管理:** サーバーの応答特性に基づいて適切なタイムアウトを設定してください
- **リソース監視:** MCP サーバーは別プロセスとして実行され、システムリソースを消費します

### スキーマ互換性

- **プロパティの除去:** Qwen API との互換性を保つため、システムは特定のスキーマプロパティ（`$schema`、`additionalProperties`）を自動的に削除します
- **名前サニタイズ:** ツール名は API 要件を満たすように自動でサニタイズされます
- **競合解決:** サーバー間でのツール名の競合は、自動的な接頭辞付与により解決されます

この包括的な統合により、MCP サーバーは CLI の機能を拡張する強力な手段となり、セキュリティ、信頼性、使いやすさを維持できます。

## ツールからのリッチコンテンツの返却

MCPツールは単純なテキストの返却に限定されません。テキスト、画像、音声、その他のバイナリデータを含む、リッチで複数パートからなるコンテンツを単一のツールレスポンスで返却できます。これにより、1回のやり取りでモデルに多様な情報を提供できる強力なツールを構築することが可能になります。

ツールから返却されたすべてのデータは処理され、モデルの次の生成のコンテキストとして送信されるため、モデルが提供された情報について推論したり要約したりできるようになります。

### 動作原理

リッチなコンテンツを返すには、ツールのレスポンスが MCP 仕様の [`CallToolResult`](https://modelcontextprotocol.io/specification/2025-06-18/server/tools#tool-result) に準拠している必要があります。結果の `content` フィールドは `ContentBlock` オブジェクトの配列であるべきです。CLI はこの配列を正しく処理し、テキストとバイナリデータを分離してモデルにパッケージングします。

`content` 配列内では異なるコンテンツブロックタイプを混在させることができます。サポートされているブロックタイプは以下の通りです：

- `text`
- `image`
- `audio`
- `resource`（埋め込みコンテンツ）
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

Qwen Codeがこのレスポンスを受け取ると、以下の処理を行います：

1. すべてのテキストを抽出し、モデル用の単一の`functionResponse`パートに結合します。
2. 画像データを別の`inlineData`パートとして表示します。
3. CLIに、テキストと画像の両方が受信されたことを示す、クリーンでユーザーフレンドリーなサマリーを提供します。

これにより、Qwenモデルにリッチでマルチモーダルなコンテキストを提供できる、洗練されたツールを構築できます。

## MCP プロンプトをスラッシュコマンドとして使用

ツールに加えて、MCP サーバーは事前に定義されたプロンプトを公開することができ、これらは Qwen Code 内でスラッシュコマンドとして実行できます。これにより、一般的なクエリや複雑なクエリに対してショートカットを作成し、名前で簡単に呼び出すことができるようになります。

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

これは、`settings.json` の `mcpServers` 以下に次のように含めることができます。

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

プロンプトが見つかったら、その名前をスラッシュコマンドとして使用して呼び出すことができます。CLI は引数の解析を自動的に処理します。

```bash
/poem-writer --title="Qwen Code" --mood="reverent"
```

または、位置引数を使用する場合:

```bash
/poem-writer "Qwen Code" reverent
```

このコマンドを実行すると、CLI は MCP サーバー上で `prompts/get` メソッドを提供された引数とともに実行します。サーバーは引数をプロンプトテンプレートに代入し、最終的なプロンプトテキストを返す役割を担います。その後、CLI はこのプロンプトをモデルに送信して実行します。これにより、一般的なワークフローを自動化し、共有するための便利な方法が提供されます。

## `qwen mcp` による MCP サーバーの管理

MCP サーバーは `settings.json` ファイルを手動で編集して設定することもできますが、CLI ではサーバー設定をプログラムで管理するための便利なコマンドセットが提供されています。これらのコマンドにより、JSON ファイルを直接編集することなく、MCP サーバーの追加、一覧表示、削除の処理が効率化されます。

### サーバーの追加 (`qwen mcp add`)

`add` コマンドは、新しい MCP サーバーを `settings.json` に設定します。スコープ（`-s, --scope`）に基づき、ユーザー設定ファイル `~/.qwen/settings.json` またはプロジェクト設定ファイル `.qwen/settings.json` のいずれかに追加されます。

**コマンド:**

```bash
qwen mcp add [options] <name> <commandOrUrl> [args...]
```

- `<name>`: サーバーの一意な名前。
- `<commandOrUrl>`: 実行するコマンド（`stdio` の場合）または URL（`http`/`sse` の場合）。
- `[args...]`: `stdio` コマンド用のオプション引数。

**オプション（フラグ）:**

- `-s, --scope`: 設定スコープ（user または project）。[デフォルト: "project"]
- `-t, --transport`: 通信タイプ（stdio, sse, http）。[デフォルト: "stdio"]
- `-e, --env`: 環境変数を設定（例: -e KEY=value）。
- `-H, --header`: SSE および HTTP 通信で使用する HTTP ヘッダーを設定（例: -H "X-Api-Key: abc123" -H "Authorization: Bearer abc123"）。
- `--timeout`: 接続タイムアウトをミリ秒単位で設定。
- `--trust`: サーバーを信頼（すべてのツール呼び出し確認プロンプトをバイパス）。
- `--description`: サーバーの説明を設定。
- `--include-tools`: 含めるツールのカンマ区切りリスト。
- `--exclude-tools`: 除外するツールのカンマ区切りリスト。

#### stdio サーバーの追加

これはローカルサーバーを実行するためのデフォルトのトランスポートです。

```bash

# 基本構文
qwen mcp add <name> <command> [args...]

# 例: ローカルサーバーの追加
qwen mcp add my-stdio-server -e API_KEY=123 /path/to/server arg1 arg2 arg3

# 例: ローカルPythonサーバーの追加
qwen mcp add python-server python server.py --port 8080
```

#### HTTP サーバーの追加

このトランスポートは、ストリーミング可能な HTTP トランスポートを使用するサーバー向けです。

```bash

# 基本構文
qwen mcp add --transport http <name> <url>

# 例: HTTP サーバーの追加
qwen mcp add --transport http http-server https://api.example.com/mcp/

# 例: 認証ヘッダー付きの HTTP サーバーの追加
qwen mcp add --transport http secure-http https://api.example.com/mcp/ --header "Authorization: Bearer abc123"
```

#### SSE サーバーの追加

このトランスポートは、Server-Sent Events (SSE) を使用するサーバー向けです。

```bash

# 基本構文
qwen mcp add --transport sse <name> <url>
```

# 例: SSE サーバーの追加
qwen mcp add --transport sse sse-server https://api.example.com/sse/

# 例: 認証ヘッダー付きの SSE サーバーの追加
qwen mcp add --transport sse secure-sse https://api.example.com/sse/ --header "Authorization: Bearer abc123"
```

### サーバー一覧表示 (`qwen mcp list`)

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

設定からサーバーを削除するには、サーバー名と共に `remove` コマンドを使用します。

**コマンド:**

```bash
qwen mcp remove <name>
```

**例:**

```bash
qwen mcp remove my-server
```

これにより、スコープ (`-s, --scope`) に基づいて適切な `settings.json` ファイル内の `mcpServers` オブジェクトから "my-server" のエントリが検索され、削除されます。