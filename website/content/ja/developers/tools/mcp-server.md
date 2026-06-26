# Qwen Code での MCP サーバー

このドキュメントでは、Qwen Code で Model Context Protocol (MCP) サーバーを設定および使用するためのガイドを提供します。

## MCP サーバーとは

MCP サーバーは、Model Context Protocol を通じてツールやリソースを CLI に公開し、外部システムやデータソースと対話できるようにするアプリケーションです。MCP サーバーは、モデルとローカル環境や API などの他のサービスとの間のブリッジとして機能します。

MCP サーバーにより、CLI は以下のことが可能になります:

- **ツールの検出:** 標準化されたスキーマ定義を通じて、利用可能なツール、その説明、パラメータを一覧表示します。
- **ツールの実行:** 定義された引数で特定のツールを呼び出し、構造化された応答を受け取ります。
- **リソースへのアクセス:** 特定のリソースからデータを読み取ります（ただし、CLI は主にツールの実行に焦点を当てています）。

MCP サーバーを使用すると、データベース、API、カスタムスクリプト、または特殊なワークフローとの対話など、CLI の組み込み機能を超えたアクションを実行できるようになります。

## コア統合アーキテクチャ

Qwen Code は、コアパッケージ (`packages/core/src/tools/`) に組み込まれた洗練された検出・実行システムを通じて MCP サーバーと統合します。

### 検出レイヤー (`mcp-client.ts`)

検出プロセスは `discoverMcpTools()` によって調整され、以下の処理を行います:

1.  **設定されたサーバーを反復処理** `settings.json` の `mcpServers` 設定から
2.  **適切なトランスポートメカニズム** (Stdio、SSE、または Streamable HTTP) を使用して接続を確立
3.  各サーバーから MCP プロトコルを使用して**ツール定義を取得**
4.  Qwen API との互換性のためにツールスキーマを**サニタイズおよび検証**
5.  競合解決を行いながらグローバルツールレジストリに**ツールを登録**

### 実行レイヤー (`mcp-tool.ts`)

検出された各 MCP ツールは `DiscoveredMCPTool` インスタンスにラップされ、以下の処理を行います:

- サーバーの信頼設定とユーザー設定に基づいた**確認ロジックの処理**
- 適切なパラメータで MCP サーバーを呼び出す**ツール実行の管理**
- LLM コンテキストとユーザー表示の両方に対する**応答の処理**
- **接続状態の維持**とタイムアウトの処理

### トランスポートメカニズム

CLI は 3 つの MCP トランスポートタイプをサポートしています:

- **Stdio トランスポート:** サブプロセスを起動し、stdin/stdout を介して通信します
- **SSE トランスポート:** Server-Sent Events エンドポイントに接続します
- **Streamable HTTP トランスポート:** HTTP ストリーミングを使用して通信します

## MCP サーバーの設定方法

Qwen Code は `settings.json` ファイルの `mcpServers` 設定を使用して MCP サーバーを見つけ、接続します。この設定は、異なるトランスポートメカニズムを持つ複数のサーバーをサポートしています。

### settings.json で MCP サーバーを設定する

`settings.json` ファイルで MCP サーバーを設定する方法は主に 2 つあります。特定のサーバー定義のためのトップレベルの `mcpServers` オブジェクトと、サーバーの検出と実行を制御するグローバル設定のための `mcp` オブジェクトです。

#### グローバル MCP 設定 (`mcp`)

`settings.json` の `mcp` オブジェクトを使用すると、すべての MCP サーバーに対するグローバルルールを定義できます。

- **`mcp.serverCommand`** (文字列): MCP サーバーを起動するためのグローバルコマンド。
- **`mcp.allowed`** (文字列の配列): 許可する MCP サーバー名のリスト。これが設定されている場合、このリストのサーバー（`mcpServers` オブジェクトのキーと一致するもの）のみが接続されます。
- **`mcp.excluded`** (文字列の配列): 除外する MCP サーバー名のリスト。このリストにあるサーバーは接続されません。

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

`mcpServers` オブジェクトでは、CLI が接続する個々の MCP サーバーを定義します。

### 設定構造

`settings.json` ファイルに `mcpServers` オブジェクトを追加します:

```json
{ ...ファイルには他の設定オブジェクトが含まれています
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

各サーバー設定は以下のプロパティをサポートしています:

#### 必須 (いずれか一つ)

- **`command`** (文字列): Stdio トランスポートの実行可能ファイルへのパス
- **`url`** (文字列): SSE エンドポイント URL (例: `"http://localhost:8080/sse"`)
- **`httpUrl`** (文字列): HTTP ストリーミングエンドポイント URL

#### オプション

- **`args`** (文字列の配列): Stdio トランスポートのコマンドライン引数
- **`headers`** (オブジェクト): `url` または `httpUrl` を使用する場合のカスタム HTTP ヘッダー
- **`env`** (オブジェクト): サーバープロセスの環境変数。値は `$VAR_NAME` または `${VAR_NAME}` 構文を使用して環境変数を参照できます
- **`cwd`** (文字列): Stdio トランスポートの作業ディレクトリ
- **`timeout`** (数値): リクエストのタイムアウト (ミリ秒、デフォルト: 600,000ms = 10 分)
- **`trust`** (ブール値): `true` の場合、このサーバーのすべてのツール呼び出し確認をバイパスします (デフォルト: `false`)
- **`includeTools`** (文字列の配列): この MCP サーバーから含めるツール名のリスト。指定すると、ここにリストされたツールのみがこのサーバーから利用可能になります (許可リスト動作)。指定しない場合、サーバーからのすべてのツールがデフォルトで有効になります。
- **`excludeTools`** (文字列の配列): この MCP サーバーから除外するツール名のリスト。ここにリストされたツールは、サーバーによって公開されていてもモデルから利用できなくなります。**注:** `excludeTools` は `includeTools` よりも優先されます。ツールが両方のリストにある場合、除外されます。
- **`targetAudience`** (文字列): アクセスしようとしている IAP で保護されたアプリケーションで許可リストに登録されている OAuth クライアント ID。`authProviderType: 'service_account_impersonation'` と共に使用します。
- **`targetServiceAccount`** (文字列): 偽装する Google Cloud サービスアカウントのメールアドレス。`authProviderType: 'service_account_impersonation'` と共に使用します。

### リモート MCP サーバー向け OAuth サポート

Qwen Code は、SSE または HTTP トランスポートを使用するリモート MCP サーバー向けの OAuth 2.0 認証をサポートしています。これにより、認証が必要な MCP サーバーへの安全なアクセスが可能になります。

#### 自動 OAuth 検出

OAuth 検出をサポートするサーバーの場合、OAuth 設定を省略して CLI に自動検出させることができます:

```json
{
  "mcpServers": {
    "discoveredServer": {
      "url": "https://api.example.com/sse"
    }
  }
}
```

CLI は自動的に以下を実行します:

- サーバーが OAuth 認証を必要とする場合の検出 (401 応答)
- サーバーメタデータからの OAuth エンドポイントの検出
- サポートされている場合の動的クライアント登録の実行
- OAuth フローとトークン管理の処理

#### 認証フロー

OAuth 対応サーバーに接続する場合:

1.  **初期接続試行** が 401 Unauthorized で失敗
2.  **OAuth 検出** で認可エンドポイントとトークンエンドポイントを発見
3.  ユーザー認証のために**ブラウザが開く** (ローカルブラウザへのアクセスが必要)
4.  **認可コード** がアクセストークンと交換される
5.  **トークンは保存**され、将来の使用のために安全に保管される
6.  **接続の再試行** が有効なトークンで成功

#### ブラウザリダイレクト要件

**重要:** OAuth 認証では、リダイレクト URI がアクセス可能である必要があります:

- **デフォルトの動作:** `http://localhost:7777/oauth/callback` にリダイレクト (ローカル設定で動作)
- **カスタムリダイレクト URI:** `--oauth-redirect-uri` を使用するか、settings.json で `redirectUri` を設定して別の URL を指定します

**リモート/クラウドサーバーデプロイメント** (例: Web ターミナル、SSH セッション、クラウド IDE) の場合:

- デフォルトの `localhost` リダイレクトは**機能しません**
- 公的にアクセス可能な URL を指すカスタム `redirectUri` を**設定する必要があります**
- ユーザーのブラウザがこの URL に到達し、サーバーにリダイレクトできる必要があります

リモートサーバーの例:

```bash
qwen mcp add --transport sse remote-server https://api.example.com/sse/ \
  --oauth-redirect-uri https://your-remote-server.example.com/oauth/callback
```

OAuth は以下では機能しません:

- ブラウザアクセスのないヘッドレス環境
- 設定された `redirectUri` がユーザーのブラウザから到達できない環境

#### OAuth 認証の管理

インタラクティブな Qwen Code セッション内で `/mcp` ダイアログを使用して、MCP サーバーを検査し、OAuth 認証を管理します。

#### OAuth 設定プロパティ

- **`enabled`** (ブール値): このサーバーの OAuth を有効にする
- **`clientId`** (文字列): OAuth クライアント識別子 (動的登録の場合はオプション)
- **`clientSecret`** (文字列): OAuth クライアントシークレット (パブリッククライアントの場合はオプション)
- **`authorizationUrl`** (文字列): OAuth 認可エンドポイント (省略した場合は自動検出)
- **`tokenUrl`** (文字列): OAuth トークンエンドポイント (省略した場合は自動検出)
- **`scopes`** (文字列の配列): 必要な OAuth スコープ
- **`redirectUri`** (文字列): カスタムリダイレクト URI。**リモートデプロイメントでは重要**: デフォルトは `http://localhost:7777/oauth/callback` です。リモート/クラウドサーバーで Qwen Code を実行する場合、公的にアクセス可能な URL (例: `https://your-server.com/oauth/callback`) に設定します。`qwen mcp add --oauth-redirect-uri` を使用するか、直接 settings.json で設定できます。
- **`tokenParamName`** (文字列): SSE URL 内のトークンのクエリパラメータ名
- **`audiences`** (文字列の配列): トークンが有効な対象者

#### トークン管理

OAuth トークンは自動的に:

- デフォルトで `~/.qwen/mcp-oauth-tokens.json` (プレーンテキスト、モード 0600) に**保存**されます。`QWEN_CODE_FORCE_ENCRYPTED_FILE_STORAGE=true` が設定されている場合、Qwen Code は利用可能な場合はキーチェーンバッキングストレージを使用し、それ以外の場合は AES-256-GCM 暗号化を使用して `~/.qwen/mcp-oauth-tokens-v2.json` に保存します。
- 期限切れ時に (更新トークンが利用可能な場合)**更新**されます
- 接続試行前に**検証**されます
- 無効または期限切れの場合に**クリーンアップ**されます

> [!WARNING]
> デフォルトでは、OAuth トークンはディスク上に暗号化されずに保存されます。共有マシンまたはマルチユーザーマシンでは、`QWEN_CODE_FORCE_ENCRYPTED_FILE_STORAGE=true` を設定して資格情報を保護してください。

#### 認証プロバイダータイプ

`authProviderType` プロパティを使用して認証プロバイダータイプを指定できます:

- **`authProviderType`** (文字列): 認証プロバイダーを指定します。以下のいずれかになります:
  - **`dynamic_discovery`** (デフォルト): CLI がサーバーから OAuth 設定を自動的に検出します。
  - **`google_credentials`**: CLI は Google アプリケーションデフォルト資格情報 (ADC) を使用してサーバーで認証します。このプロバイダーを使用する場合、必要なスコープを指定する必要があります。
  - **`service_account_impersonation`**: CLI は Google Cloud サービスアカウントを偽装してサーバーで認証します。これは IAP で保護されたサービス (特に Cloud Run サービス向けに設計されています) にアクセスする場合に便利です。

#### Google 資格情報

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

サービスアカウントの偽装を使用してサーバーで認証するには、`authProviderType` を `service_account_impersonation` に設定し、次のプロパティを指定する必要があります:

- **`targetAudience`** (文字列): アクセスしようとしている IAP で保護されたアプリケーションで許可リストに登録されている OAuth クライアント ID。
- **`targetServiceAccount`** (文字列): 偽装する Google Cloud サービスアカウントのメールアドレス。

CLI はローカルのアプリケーションデフォルト資格情報 (ADC) を使用して、指定されたサービスアカウントと対象者向けの OIDC ID トークンを生成します。このトークンは MCP サーバーでの認証に使用されます。

#### 設定手順

1.  **[OAuth 2.0 クライアント ID を作成](https://cloud.google.com/iap/docs/oauth-client-creation) または既存のものを使用します。** 既存の OAuth 2.0 クライアント ID を使用するには、[OAuth クライアントの共有方法](https://cloud.google.com/iap/docs/sharing-oauth-clients) の手順に従います。
2.  アプリケーションの[プログラムによるアクセス](https://cloud.google.com/iap/docs/sharing-oauth-clients#programmatic_access) の許可リストに OAuth ID を追加します。Cloud Run は gcloud iap でまだサポートされているリソースタイプではないため、プロジェクトでクライアント ID を許可リストに登録する必要があります。
3.  **サービスアカウントを作成します。** [ドキュメント](https://cloud.google.com/iam/docs/service-accounts-create#creating)、[Cloud Console リンク](https://console.cloud.google.com/iam-admin/serviceaccounts)
4.  Cloud Run サービス自体の [セキュリティ] タブまたは gcloud を介して、**サービスアカウントとユーザーの両方を IAP ポリシーに追加します。**
5.  MCP サーバーにアクセスする**すべてのユーザーとグループ**に、[サービスアカウントを偽装する](https://cloud.google.com/docs/authentication/use-service-account-impersonation) ために必要な権限 (`roles/iam.serviceAccountTokenCreator` など) を付与します。
6.  プロジェクトで **IAM Credentials API を[有効にします](https://console.cloud.google.com/apis/library/iamcredentials.googleapis.com)**。

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

#### カスタムヘッダーを使用した HTTP ベースの MCP サーバー

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

#### ツールフィルタリングを使用した MCP サーバー

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

### SA 偽装を使用した SSE MCP サーバー

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

Qwen Code が起動すると、以下の詳細なプロセスを通じて MCP サーバーの検出を実行します:

### 1. サーバーの反復と接続

`mcpServers` の各設定サーバーに対して:

1.  **ステータストラッキングが開始:** サーバーステータスが `CONNECTING` に設定されます
2.  **トランスポートの選択:** 設定プロパティに基づく:
   - `httpUrl` → `StreamableHTTPClientTransport`
   - `url` → `SSEClientTransport`
   - `command` → `StdioClientTransport`
3.  **接続の確立:** MCP クライアントは設定されたタイムアウトで接続を試みます
4.  **エラーハンドリング:** 接続失敗はログに記録され、サーバーステータスは `DISCONNECTED` に設定されます

### 2. ツールの検出

接続成功時:

1.  **ツール一覧:** クライアントは MCP サーバーのツール一覧エンドポイントを呼び出します
2.  **スキーマ検証:** 各ツールの関数宣言が検証されます
3.  **ツールフィルタリング:** ツールは `includeTools` および `excludeTools` 設定に基づいてフィルタリングされます
4.  **名前のサニタイズ:** ツール名は Qwen API 要件を満たすためにクリーンアップされます:
   - 無効な文字 (英数字、アンダースコア、ドット、ハイフン以外) はアンダースコアに置き換えられます
   - 63 文字を超える名前は、中間置換 (`___`) で切り詰められます

### 3. 競合解決

複数のサーバーが同じ名前のツールを公開する場合:

1.  **最初の登録が優先:** 最初にツール名を登録したサーバーは、接頭辞なしの名前を取得します
2.  **自動接頭辞:** 後続のサーバーは `serverName__toolName` のように接頭辞付きの名前を取得します
3.  **レジストリ追跡:** ツールレジストリはサーバー名とそのツールの間のマッピングを維持します

### 4. スキーマ処理

ツールパラメータスキーマは、API 互換性のためにサニタイズ処理を受けます:

- **`$schema` プロパティ** が削除されます
- **`additionalProperties`** が取り除かれます
- **`default` を持つ `anyOf`** はデフォルト値が削除されます (Vertex AI 互換性)
- **再帰的処理** はネストされたスキーマに適用されます

### 5. 接続管理

検出後:

- **永続的な接続:** ツールの登録に成功したサーバーは接続を維持します
- **クリーンアップ:** 使用可能なツールを提供しないサーバーは接続が閉じられます
- **ステータス更新:** 最終的なサーバーステータスは `CONNECTED` または `DISCONNECTED` に設定されます

## ツール実行フロー

モデルが MCP ツールを使用することを決定した場合、次の実行フローが発生します:

### 1. ツール呼び出し

モデルは以下を含む `FunctionCall` を生成します:

- **ツール名:** 登録された名前 (接頭辞付きの可能性あり)
- **引数:** ツールのパラメータスキーマに一致する JSON オブジェクト

### 2. 確認プロセス

各 `DiscoveredMCPTool` は洗練された確認ロジックを実装しています:

#### 信頼ベースのバイパス

```typescript
if (this.trust) {
  return false; // 確認不要
}
```

#### 動的許可リスト

システムは内部で許可リストを維持します:

- **サーバーレベル:** `serverName` → このサーバーのすべてのツールが信頼されます
- **ツールレベル:** `serverName.toolName` → この特定のツールが信頼されます

#### ユーザーの選択処理

確認が必要な場合、ユーザーは以下を選択できます:

- **1 回だけ実行:** 今回のみ実行
- **このツールを常に許可:** ツールレベルの許可リストに追加
- **このサーバーを常に許可:** サーバーレベルの許可リストに追加
- **キャンセル:** 実行を中止

### 3. 実行

確認 (または信頼バイパス) 後:

1.  **パラメータの準備:** 引数がツールのスキーマに対して検証されます
2.  **MCP 呼び出し:** 基盤となる `CallableTool` がサーバーを呼び出します:

   ```typescript
   const functionCalls = [
     {
       name: this.serverToolName, // 元のサーバーツール名
       args: params,
     },
   ];
   ```

3.  **応答処理:** 結果は LLM コンテキストとユーザー表示の両方のためにフォーマットされます

### 4. 応答処理

実行結果には以下が含まれます:

- **`llmContent`:** 言語モデルのコンテキスト用の生の応答部分
- **`returnDisplay`:** ユーザー表示用にフォーマットされた出力 (多くの場合、Markdown コードブロック内の JSON)

## MCP サーバーとの対話方法

### `/mcp` コマンドの使用

`/mcp` コマンドは、MCP サーバーのセットアップに関する包括的な情報を提供します:

```bash
/mcp
```

これにより、以下が表示されます:

- **サーバーリスト:** 設定されているすべての MCP サーバー
- **接続状態:** `CONNECTED`、`CONNECTING`、または `DISCONNECTED`
- **サーバーの詳細:** 設定の概要 (機密データを除く)
- **利用可能なツール:** 各サーバーのツールの説明付きリスト
- **検出状態:** 検出プロセスの全体的な状態

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

MCP ツールは、一度検出されると、組み込みツールと同様に Qwen モデルで利用可能になります。モデルは自動的に以下を実行します：

1. **適切なツールの選択**：リクエストに基づいて
2. **確認ダイアログの表示**（サーバーが信頼されていない場合）
3. **ツールの実行**：適切なパラメータで
4. **結果の表示**：ユーザーフレンドリーな形式で

## ステータス監視とトラブルシューティング

### 接続状態

MCP 統合はいくつかの状態を追跡します：

#### サーバーステータス（`MCPServerStatus`）

- **`DISCONNECTED`：** サーバーが接続されていないか、エラーが発生しています
- **`CONNECTING`：** 接続試行中
- **`CONNECTED`：** サーバーが接続され、準備完了です

#### 検出状態（`MCPDiscoveryState`）

- **`NOT_STARTED`：** 検出が開始されていません
- **`IN_PROGRESS`：** 現在サーバーを検出中
- **`COMPLETED`：** 検出が完了しました（エラーの有無にかかわらず）

### よくある問題と解決策

#### サーバーに接続できない

**症状：** サーバーが `DISCONNECTED` ステータスを表示する

**トラブルシューティング：**

1. **設定を確認：** `command`、`args`、`cwd` が正しいことを確認します
2. **手動でテスト：** サーバーコマンドを直接実行して、正常に動作することを確認します
3. **依存関係を確認：** 必要なパッケージがすべてインストールされていることを確認します
4. **ログを確認：** CLI 出力内のエラーメッセージを確認します
5. **権限を確認：** CLI がサーバーコマンドを実行できることを確認します

#### ツールが検出されない

**症状：** サーバーは接続されるが、ツールが利用できない

**トラブルシューティング：**

1. **ツール登録を確認：** サーバーが実際にツールを登録していることを確認します
2. **MCP プロトコルを確認：** サーバーが MCP ツール一覧を正しく実装していることを確認します
3. **サーバーログを確認：**  stderr 出力でサーバー側のエラーを確認します
4. **ツール一覧をテスト：** サーバーのツール検出エンドポイントを手動でテストします

#### ツールが実行されない

**症状：** ツールは検出されるが、実行中に失敗する

**トラブルシューティング：**

1. **パラメータ検証：** ツールが期待するパラメータを受け入れていることを確認します
2. **スキーマ互換性：** 入力スキーマが有効な JSON Schema であることを確認します
3. **エラーハンドリング：** ツールが未処理の例外をスローしていないか確認します
4. **タイムアウトの問題：** `timeout` 設定を増やすことを検討します

#### サンドボックス互換性

**症状：** サンドボックスが有効な場合、MCP サーバーが失敗する

**解決策：**

1. **Docker ベースのサーバー：** すべての依存関係を含む Docker コンテナを使用します
2. **パスアクセス性：** サーバーの実行ファイルがサンドボックス内で利用可能であることを確認します
3. **ネットワークアクセス：** 必要なネットワーク接続を許可するようにサンドボックスを設定します
4. **環境変数：** 必要な環境変数が正しく渡されていることを確認します

### デバッグのヒント

1. **デバッグモードを有効にする：** CLI を `--debug` で実行すると、詳細な出力が得られます
2. **stderr を確認：** MCP サーバーの stderr はキャプチャされてログに記録されます（INFO メッセージはフィルタリングされます）
3. **テスト分離：** 統合する前に、MCP サーバーを単独でテストします
4. **段階的セットアップ：** 複雑な機能を追加する前に、シンプルなツールから始めます
5. **`/mcp` を頻繁に使用：** 開発中にサーバーのステータスを監視します

## 重要な注意事項

### セキュリティに関する考慮事項

- **信頼設定：** `trust` オプションは、すべての確認ダイアログをバイパスします。注意して使用し、完全に制御できるサーバーにのみ使用してください。
- **アクセストークン：** API キーやトークンを含む環境変数を設定する際は、セキュリティに注意してください。
- **サンドボックス互換性：** サンドボックスを使用する場合、MCP サーバーがサンドボックス環境内で利用可能であることを確認してください。
- **プライベートデータ：** 広いスコープの個人アクセストークンを使用すると、リポジトリ間で情報漏洩が発生する可能性があります。

### パフォーマンスとリソース管理

- **接続の永続性：** CLI は、ツールの登録に成功したサーバーへの永続的な接続を維持します。
- **自動クリーンアップ：** ツールを提供しないサーバーへの接続は自動的に閉じられます。
- **タイムアウト管理：** サーバーの応答特性に基づいて適切なタイムアウトを設定します。
- **リソース監視：** MCP サーバーは個別のプロセスとして実行され、システムリソースを消費します。

### スキーマ互換性

- **スキーマ準拠モード：** デフォルト（`schemaCompliance: "auto"`）では、ツールスキーマはそのまま渡されます。`settings.json` で `"model": { "generationConfig": { "schemaCompliance": "openapi_30" } }` を設定すると、モデルが Strict OpenAPI 3.0 形式に変換されます。
- **OpenAPI 3.0 変換：** `openapi_30` モードが有効な場合、システムは以下を処理します：
  - Nullable 型：`["string", "null"]` -> `type: "string", nullable: true`
  - Const 値：`const: "foo"` -> `enum: ["foo"]`
  - 排他的制限：数値の `exclusiveMinimum` -> `minimum` とのブール形式
  - キーワード削除：`$schema`, `$id`, `dependencies`, `patternProperties`
- **名前のサニタイズ：** ツール名は API 要件を満たすために自動的にサニタイズされます。
- **競合解決：** サーバー間のツール名の競合は、自動プレフィックスによって解決されます。

この包括的な統合により、MCP サーバーは、セキュリティ、信頼性、および使いやすさを維持しながら、CLI の機能を拡張する強力な方法となります。

## ツールからのリッチコンテンツの返却

MCP ツールは単純なテキストの返却に限定されません。1 回のツール応答で、テキスト、画像、音声、その他のバイナリデータを含むリッチなマルチパートコンテンツを返すことができます。これにより、1 ターンで多様な情報をモデルに提供できる強力なツールを構築できます。

ツールから返されたすべてのデータは処理され、モデルへのコンテキストとして次の生成に送られるため、モデルは提供された情報を推論または要約できます。

### 仕組み

リッチコンテンツを返すには、ツールの応答が `CallToolResult` の MCP 仕様に準拠している必要があります。結果の `content` フィールドは、`ContentBlock` オブジェクトの配列である必要があります。CLI はこの配列を正しく処理し、テキストとバイナリデータを分離してモデル用にパッケージ化します。

`content` 配列内で異なるコンテンツブロックタイプを混在させることができます。サポートされているブロックタイプは次のとおりです：

- `text`
- `image`
- `audio`
- `resource`（埋め込みコンテンツ）
- `resource_link`

### 例：テキストと画像の返却

以下は、テキストの説明と画像の両方を返す MCP ツールからの有効な JSON 応答の例です：

```json
{
  "content": [
    {
      "type": "text",
      "text": "こちらがリクエストされたロゴです。"
    },
    {
      "type": "image",
      "data": "BASE64_ENCODED_IMAGE_DATA_HERE",
      "mimeType": "image/png"
    },
    {
      "type": "text",
      "text": "ロゴは 2025 年に作成されました。"
    }
  ]
}
```

Qwen Code はこの応答を受け取ると、次の処理を行います：

1.  すべてのテキストを抽出し、モデル用の単一の `functionResponse` パートに結合します。
2.  画像データを別の `inlineData` パートとして提示します。
3.  CLI に、テキストと画像の両方を受信したことを示す、クリーンでユーザーフレンドリーなサマリーを提供します。

これにより、Qwen モデルにリッチなマルチモーダルコンテキストを提供できる高度なツールを構築できます。

## MCP プロンプトとスラッシュコマンド

ツールに加えて、MCP サーバーは、Qwen Code 内でスラッシュコマンドとして実行できる定義済みのプロンプトを公開できます。これにより、名前で簡単に呼び出せる、一般的または複雑なクエリのショートカットを作成できます。

### サーバーでのプロンプトの定義

以下は、プロンプトを定義する stdio MCP サーバーの小さな例です：

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

これは、`mcpServers` の下で `settings.json` に次のように含めることができます：

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

プロンプトが検出されると、スラッシュコマンドとしてその名前を使用して呼び出すことができます。CLI は自動的に引数を解析します。

```bash
/poem-writer --title="Qwen Code" --mood="reverent"
```

または、位置引数を使用：

```bash
/poem-writer "Qwen Code" reverent
```

このコマンドを実行すると、CLI は提供された引数を使用して MCP サーバーで `prompts/get` メソッドを実行します。サーバーは引数をプロンプトテンプレートに代入し、最終的なプロンプトテキストを返す役割を担います。CLI はこのプロンプトをモデルに送信して実行します。これにより、一般的なワークフローを自動化および共有する便利な方法が提供されます。

## `qwen mcp` を使用した MCP サーバーの管理

`settings.json` ファイルを手動で編集して MCP サーバーを設定することもできますが、CLI はサーバー設定をプログラムで管理するための便利なコマンドセットを提供します。これらのコマンドは、JSON ファイルを直接編集することなく、サーバーの追加、一覧表示、削除のプロセスを効率化します。

### サーバーの追加（`qwen mcp add`）

`add` コマンドは、`settings.json` に新しい MCP サーバーを設定します。スコープ（`-s, --scope`）に基づいて、ユーザー設定 `~/.qwen/settings.json` またはプロジェクト設定 `.qwen/settings.json` ファイルのいずれかに追加されます。

**コマンド：**

```bash
qwen mcp add [options] <name> <commandOrUrl> [args...]
```

- `<name>`：サーバーの一意の名前。
- `<commandOrUrl>`：実行するコマンド（`stdio` の場合）または URL（`http`/`sse` の場合）。
- `[args...]`：`stdio` コマンドのオプションの引数。

**オプション（フラグ）：**

- `-s, --scope`：設定のスコープ（user または project）。 [デフォルト："project"]
- `-t, --transport`：トランスポートタイプ（stdio、sse、http）。 [デフォルト："stdio"]
- `-e, --env`：環境変数を設定します（例：`-e KEY=value`）。
- `-H, --header`：SSE および HTTP トランスポートの HTTP ヘッダーを設定します（例：`-H "X-Api-Key: abc123" -H "Authorization: Bearer abc123"`）。
- `--timeout`：接続タイムアウトをミリ秒単位で設定します。
- `--trust`：サーバーを信頼します（すべてのツール呼び出し確認プロンプトをバイパスします）。
- `--description`：サーバーの説明を設定します。
- `--include-tools`：含めるツールのカンマ区切りリスト。
- `--exclude-tools`：除外するツールのカンマ区切りリスト。
- `--oauth-client-id`：MCP サーバー認証用の OAuth クライアント ID。
- `--oauth-client-secret`：MCP サーバー認証用の OAuth クライアントシークレット。
- `--oauth-redirect-uri`：OAuth リダイレクト URI（例：`https://your-server.com/oauth/callback`）。ローカル設定のデフォルトは `http://localhost:7777/oauth/callback` です。**リモートデプロイメントでは重要**：Qwen Code をリモート/クラウドサーバーで実行する場合、公開アクセス可能な URL を設定してください。
- `--oauth-authorization-url`：OAuth 認可 URL。
- `--oauth-token-url`：OAuth トークン URL。
- `--oauth-scopes`：OAuth スコープ（カンマ区切り）。

#### stdio サーバーの追加

これはローカルサーバーを実行するためのデフォルトのトランスポートです。

```bash
# 基本構文
qwen mcp add <name> <command> [args...]

# 例：ローカルサーバーの追加
qwen mcp add my-stdio-server -e API_KEY=123 /path/to/server arg1 arg2 arg3

# 例：ローカルの Python サーバーの追加
qwen mcp add python-server python server.py --port 8080
```

#### HTTP サーバーの追加

このトランスポートは、ストリーム可能な HTTP トランスポートを使用するサーバー向けです。

```bash
# 基本構文
qwen mcp add --transport http <name> <url>

# 例：HTTP サーバーの追加
qwen mcp add --transport http http-server https://api.example.com/mcp/

# 例：認証ヘッダー付き HTTP サーバーの追加
qwen mcp add --transport http secure-http https://api.example.com/mcp/ --header "Authorization: Bearer abc123"
```

#### SSE サーバーの追加

このトランスポートは、Server-Sent Events（SSE）を使用するサーバー向けです。

```bash
# 基本構文
qwen mcp add --transport sse <name> <url>

# 例：SSE サーバーの追加
qwen mcp add --transport sse sse-server https://api.example.com/sse/

# 例：認証ヘッダー付き SSE サーバーの追加
qwen mcp add --transport sse secure-sse https://api.example.com/sse/ --header "Authorization: Bearer abc123"

# 例：OAuth 対応 SSE サーバーの追加
qwen mcp add --transport sse oauth-server https://api.example.com/sse/ \
  --oauth-client-id your-client-id \
  --oauth-redirect-uri https://your-server.com/oauth/callback \
  --oauth-authorization-url https://provider.example.com/authorize \
  --oauth-token-url https://provider.example.com/token
```

### サーバーの管理（`/mcp`）

現在設定されているすべての MCP サーバーを表示および管理するには、インタラクティブな Qwen Code セッション内で `/mcp` ダイアログを開きます。このダイアログでは以下を実行できます：

- すべての MCP サーバーを接続状態とともに表示
- サーバーの有効化/無効化
- 切断されたサーバーへの再接続
- 各サーバーが提供するツールとプロンプトの表示
- サーバーログの表示

**コマンド：**

```bash
qwen
```

次に次を入力：

```text
/mcp
```

管理ダイアログは、各サーバーの名前、設定の詳細、接続状態、利用可能なツール/プロンプトを表示するビジュアルインターフェースを提供します。

### サーバーの削除（`qwen mcp remove`）

設定からサーバーを削除するには、サーバー名を指定して `remove` コマンドを使用します。

**コマンド：**

```bash
qwen mcp remove <name>
```

**例：**

```bash
qwen mcp remove my-server
```

これにより、スコープ（`-s, --scope`）に基づいて、適切な `settings.json` ファイル内の `mcpServers` オブジェクトから "my-server" エントリが検索され、削除されます。