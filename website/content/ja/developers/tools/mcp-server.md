# Qwen Code を使用した MCP サーバー

このドキュメントでは、Model Context Protocol (MCP) サーバーを Qwen Code で設定および使用する方法について説明します。

## MCP サーバーとは何か？

MCP サーバーは、Model Context Protocol（モデル・コンテキスト・プロトコル）を介して CLI にツールやリソースを公開するアプリケーションであり、CLI が外部システムやデータソースと連携できるようにします。MCP サーバーは、モデルとローカル環境、あるいは API などの他のサービスとの間の橋渡し役を果たします。

MCP サーバーにより、CLI は以下の機能を実現できます：

- **ツールの検出：** 標準化されたスキーマ定義を通じて、利用可能なツールの一覧、その説明、およびパラメーターを取得できます。
- **ツールの実行：** 定義済みの引数で特定のツールを呼び出し、構造化された応答を受け取れます。
- **リソースへのアクセス：** 特定のリソースからデータを読み込むことができます（ただし、CLI は主にツール実行に焦点を当てています）。

MCP サーバーを活用することで、CLI の組み込み機能を超えた動作（例：データベースや API、カスタムスクリプト、または専門的なワークフローとの連携など）を実現し、その機能を拡張できます。

## コア統合アーキテクチャ

Qwen Code は、コアパッケージ (`packages/core/src/tools/`) に組み込まれた高度な検出および実行システムを通じて、MCP サーバーと統合します。

### 検出レイヤー (`mcp-client.ts`)

検出プロセスは `discoverMcpTools()` によって制御され、以下の処理を行います。

1. **設定済みサーバーを反復処理**：`settings.json` の `mcpServers` 設定からサーバーを取得
2. **接続の確立**：適切なトランスポートメカニズム（Stdio、SSE、またはストリーム対応 HTTP）を使用
3. **ツール定義の取得**：MCP プロトコルを用いて各サーバーからツール定義を取得
4. **スキーマのサニタイズおよび検証**：Qwen API との互換性を確保するためのツールスキーマの検証
5. **ツールの登録**：競合解決機能付きでグローバルツールレジストリにツールを登録

### 実行レイヤー (`mcp-tool.ts`)

検出された各 MCP ツールは、`DiscoveredMCPTool` インスタンスでラップされます。このインスタンスは以下の機能を提供します。

- **確認ロジックの処理**: サーバーの信頼設定およびユーザーの設定に基づいて確認処理を実行
- **ツール実行の管理**: 適切なパラメーターを指定して MCP サーバーを呼び出す
- **応答の処理**: LLM のコンテキストおよびユーザー表示の両方に対応した応答処理
- **接続状態の維持**: タイムアウト処理を含む接続状態の管理

### トランスポート機構

CLI は、以下の 3 種類の MCP トランスポートをサポートしています。

- **Stdio トランスポート**: サブプロセスを起動し、標準入力／標準出力を介して通信
- **SSE トランスポート**: サーバー送信イベント（Server-Sent Events）エンドポイントに接続
- **ストリーミング対応 HTTP トランスポート**: HTTP ストリーミングを用いた通信

## MCP サーバーのセットアップ方法

Qwen Code では、`settings.json` ファイル内の `mcpServers` 設定を使用して MCP サーバーを検出し、接続します。この設定では、異なるトランスポート機構を用いる複数のサーバーを指定できます。

### `settings.json` での MCP サーバーの設定

`settings.json` ファイル内で、MCP サーバーを以下の 2 つの主な方法で設定できます。1 つは、特定のサーバー定義を記述するための最上位レベルの `mcpServers` オブジェクトを使用する方法、もう 1 つは、サーバーの検出および実行を制御するグローバル設定を指定する `mcp` オブジェクトを使用する方法です。

#### グローバル MCP 設定 (`mcp`)

`settings.json` 内の `mcp` オブジェクトでは、すべての MCP サーバーに適用されるグローバルルールを定義できます。

- **`mcp.serverCommand`**（文字列）：MCP サーバーを起動するためのグローバルコマンド。
- **`mcp.allowed`**（文字列の配列）：許可する MCP サーバー名のリスト。この設定が指定されている場合、このリストに含まれるサーバー（`mcpServers` オブジェクト内のキーと一致するもの）のみが接続対象となります。
- **`mcp.excluded`**（文字列の配列）：除外する MCP サーバー名のリスト。このリストに含まれるサーバーには接続されません。

**例：**

```json
{
  "mcp": {
    "allowed": ["my-trusted-server"],
    "excluded": ["experimental-server"]
  }
}
```

#### サーバー固有の設定（`mcpServers`）

`mcpServers` オブジェクトでは、CLI が接続する各 MCP サーバーを個別に定義します。

### 設定構造

`settings.json` ファイルに `mcpServers` オブジェクトを追加します：

```json
{ ...ファイルには他の設定オブジェクトも含まれます
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

各サーバー設定では、以下のプロパティをサポートしています：

#### 必須（以下のいずれか 1 つ）

- **`command`**（文字列）：Stdio トランスポート用の実行可能ファイルへのパス
- **`url`**（文字列）：SSE エンドポイントの URL（例：`"http://localhost:8080/sse"`）
- **`httpUrl`**（文字列）：HTTP ストリーミングエンドポイントの URL

#### オプション

- **`args`** (string[]): Stdio トランスポート用のコマンドライン引数
- **`headers`** (object): `url` または `httpUrl` を使用する際のカスタム HTTP ヘッダー
- **`env`** (object): サーバープロセスの環境変数。値には `$VAR_NAME` または `${VAR_NAME}` 構文で環境変数を参照できます。
- **`cwd`** (string): Stdio トランスポート用の作業ディレクトリ
- **`timeout`** (number): リクエストタイムアウト（ミリ秒単位）。デフォルトは `600,000ms`（10 分）
- **`trust`** (boolean): `true` の場合、このサーバーに対するすべてのツール呼び出し確認をバイパスします（デフォルト: `false`）
- **`includeTools`** (string[]): この MCP サーバーから含めるツール名のリスト。指定した場合、このリストに記載されたツールのみがこのサーバーから利用可能になります（ホワイトリスト方式）。未指定の場合、サーバーから提供されるすべてのツールがデフォルトで有効になります。
- **`excludeTools`** (string[]): この MCP サーバーから除外するツール名のリスト。このリストに記載されたツールは、サーバー側で公開されていてもモデルからは利用できません。**注:** `excludeTools` は `includeTools` より優先されます。つまり、同一のツールが両方のリストに含まれている場合、そのツールは除外されます。
- **`targetAudience`** (string): アクセスしようとしている IAP 保護アプリケーション上で許可されている OAuth クライアント ID。`authProviderType: 'service_account_impersonation'` と併用します。
- **`targetServiceAccount`** (string): なりすましを行う Google Cloud サービスアカウントのメールアドレス。`authProviderType: 'service_account_impersonation'` と併用します。

### リモート MCP サーバー向けの OAuth サポート

Qwen Code は、SSE または HTTP トランスポートを用いたリモート MCP サーバーに対する OAuth 2.0 認証をサポートしています。これにより、認証を必要とする MCP サーバーへの安全なアクセスが可能になります。

#### 自動 OAuth 検出

OAuth 検出をサポートするサーバーの場合、OAuth 設定を省略し、CLI に自動検出させることができます：

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

- サーバーが OAuth 認証を必要としていること（401 応答）を検出
- サーバーのメタデータから OAuth エンドポイントを検出
- 対応している場合、動的クライアント登録を実行
- OAuth フローおよびトークン管理を処理

#### 認証フロー

OAuth 対応サーバーに接続する際：

1. **初期接続試行** が 401 Unauthorized エラーで失敗
2. **OAuth ディスカバリー** により、認可エンドポイントおよびトークンエンドポイントが特定される
3. **ブラウザが起動** し、ユーザーによる認証が行われる（ローカルマシン上のブラウザへのアクセスが必要）
4. **認可コード** がアクセストークンと交換される
5. **トークンは安全に保存** され、今後の利用に備える
6. **接続の再試行** が有効なトークンを用いて成功

#### ブラウザリダイレクトの要件

**重要:** OAuth 認証を利用するには、ローカルマシンが以下の条件を満たす必要があります：

- 認証のために Web ブラウザを開けること
- `http://localhost:7777/oauth/callback` へのリダイレクトを受信できること

この機能は、以下の環境では動作しません：

- ブラウザにアクセスできないヘッドレス環境
- X11 フォワーディングなしのリモート SSH セッション
- ブラウザサポートのないコンテナ化された環境

#### OAuth 認証の管理

OAuth 認証を管理するには、`/mcp auth` コマンドを使用します：

```bash

# 認証を必要とするサーバーの一覧表示
/mcp auth

# 特定のサーバーで認証する
/mcp auth serverName

# トークンが有効期限切れになった場合に再認証する
/mcp auth serverName
```

#### OAuth 設定プロパティ

- **`enabled`**（ブール値）：このサーバーで OAuth を有効化する
- **`clientId`**（文字列）：OAuth クライアント識別子（動的登録を使用する場合は省略可能）
- **`clientSecret`**（文字列）：OAuth クライアントシークレット（パブリッククライアントの場合は省略可能）
- **`authorizationUrl`**（文字列）：OAuth 承認エンドポイント（省略した場合は自動検出される）
- **`tokenUrl`**（文字列）：OAuth トークンエンドポイント（省略した場合は自動検出される）
- **`scopes`**（文字列配列）：必要な OAuth スコープ
- **`redirectUri`**（文字列）：カスタムリダイレクト URI（デフォルトは `http://localhost:7777/oauth/callback`）
- **`tokenParamName`**（文字列）：SSE URL 内のトークン用クエリパラメーター名
- **`audiences`**（文字列配列）：トークンが有効な対象（オーディエンス）

#### トークン管理

OAuth トークンは自動的に以下のように処理されます。

- `~/.qwen/mcp-oauth-tokens.json` に**安全に保存**されます。
- 有効期限が切れた場合（リフレッシュ・トークンが利用可能な場合）に**自動的に更新**されます。
- 各接続試行の**直前に検証**されます。
- 無効または有効期限が切れた場合に**クリーンアップ**されます。

#### 認証プロバイダーの種類

`authProviderType` プロパティを使用して、認証プロバイダーの種類を指定できます。

- **`authProviderType`**（文字列）：認証プロバイダーを指定します。以下のいずれかを指定できます。
  - **`dynamic_discovery`**（デフォルト）：CLI がサーバーから OAuth 設定を自動的に検出します。
  - **`google_credentials`**：CLI が Google のアプリケーション標準資格情報（ADC）を使用してサーバーに認証します。このプロバイダーを使用する場合、必要なスコープを明示的に指定する必要があります。
  - **`service_account_impersonation`**：CLI が Google Cloud サービスアカウントを模倣してサーバーに認証します。これは IAP で保護されたサービス（特に Cloud Run サービス向けに設計されています）へのアクセスに便利です。

#### Google の認証情報

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

#### サービス アカウントのなりすまし

サービス アカウントのなりすましを使用してサーバーに認証するには、`authProviderType` を `service_account_impersonation` に設定し、以下のプロパティを指定する必要があります。

- **`targetAudience`**（文字列）：アクセスしようとしている IAP で保護されたアプリケーション上で許可されている OAuth クライアント ID。
- **`targetServiceAccount`**（文字列）：なりすます Google Cloud サービス アカウントのメールアドレス。

CLI は、ローカルのアプリケーション デフォルト認証情報（ADC）を使用して、指定されたサービス アカウントおよび対象オーディエンス向けの OIDC ID トークンを生成します。このトークンは、MCP サーバーへの認証に使用されます。

#### セットアップ手順

1. **[OAuth 2.0 クライアント ID を作成する](https://cloud.google.com/iap/docs/oauth-client-creation)か、既存のものを使用します。** 既存の OAuth 2.0 クライアント ID を使用する場合は、「[OAuth クライアントの共有方法](https://cloud.google.com/iap/docs/sharing-oauth-clients)」の手順に従ってください。
2. **OAuth ID をアプリケーションの [プログラムによるアクセス](https://cloud.google.com/iap/docs/sharing-oauth-clients#programmatic_access) の許可リストに追加します。** Cloud Run は現時点で `gcloud iap` でサポートされているリソースタイプではないため、クライアント ID をプロジェクト全体の許可リストに登録する必要があります。
3. **サービスアカウントを作成します。** [ドキュメント](https://cloud.google.com/iam/docs/service-accounts-create#creating)、[Cloud Console リンク](https://console.cloud.google.com/iam-admin/serviceaccounts)
4. **サービスアカウントとユーザーの両方を、Cloud Run サービス自体の「セキュリティ」タブ、または `gcloud` を使用して IAP ポリシーに追加します。**
5. **MCP サーバーにアクセスするすべてのユーザーおよびグループに、サービスアカウントを[なりすまし](https://cloud.google.com/docs/authentication/use-service-account-impersonation)するための必要な権限（つまり `roles/iam.serviceAccountTokenCreator`）を付与します。**
6. **プロジェクトに対して [IAM Credentials API を有効化](https://console.cloud.google.com/apis/library/iamcredentials.googleapis.com) します。**

### 例: 設定構成

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

#### Docker を使用した MCP サーバー

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

#### ツールフィルタリングを伴う MCP サーバー

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

### SA による偽装をサポートする SSE MCP サーバー

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

## 発見プロセスの詳細解説

Qwen Code が起動すると、以下の詳細な手順で MCP サーバーの発見を行います：

### 1. サーバーの反復処理と接続

`mcpServers` で設定された各サーバーに対して：

1. **ステータス追跡の開始：** サーバーのステータスが `CONNECTING` に設定されます。
2. **トランスポートの選択：** 設定プロパティに基づいて以下のいずれかが選択されます：
   - `httpUrl` → `StreamableHTTPClientTransport`
   - `url` → `SSEClientTransport`
   - `command` → `StdioClientTransport`
3. **接続の確立：** MCP クライアントは、設定されたタイムアウトで接続を試行します。
4. **エラー処理：** 接続失敗はログに記録され、サーバーのステータスは `DISCONNECTED` に設定されます。

### 2. ツールの検出

接続が成功すると、以下の処理が実行されます。

1. **ツール一覧の取得:** クライアントが MCP サーバーのツール一覧エンドポイントを呼び出します。
2. **スキーマ検証:** 各ツールの関数宣言が検証されます。
3. **ツールのフィルタリング:** `includeTools` および `excludeTools` 設定に基づいてツールがフィルタリングされます。
4. **名前の正規化:** ツール名は Qwen API の要件を満たすよう正規化されます：
   - 無効な文字（英数字、アンダースコア `_`、ドット `.`、ハイフン `-` 以外）はすべてアンダースコア `_` に置換されます。
   - 文字数が 63 文字を超える名前は、中央を `___` で置換して切り詰められます。

### 3. 衝突解決

複数のサーバーが同一名称のツールを公開している場合：

1. **先着順優先:** 最初にツール名を登録したサーバーが、プレフィックスなしの名前を取得します。
2. **自動プレフィックス付与:** 以降のサーバーには、`serverName__toolName` の形式でプレフィックス付きの名前が割り当てられます。
3. **レジストリによる追跡:** ツールレジストリは、サーバー名とそのツールとのマッピングを維持します。

### 4. スキーマ処理

ツールパラメータのスキーマは、API互換性のためにサニタイズされます。

- **`$schema` プロパティ** は削除されます
- **`additionalProperties`** は削除されます
- **`default` を含む `anyOf`** については、デフォルト値が削除されます（Vertex AI 互換性のため）
- **再帰的処理** は、入れ子になったスキーマにも適用されます

### 5. 接続管理

ディスカバリー後：

- **永続的な接続：** ツールを正常に登録したサーバーは、その接続を維持します
- **クリーンアップ：** 有効なツールを提供しないサーバーの接続は閉じられます
- **ステータス更新：** 各サーバーの最終ステータスは `CONNECTED` または `DISCONNECTED` に設定されます

## ツール実行フロー

モデルが MCP ツールを使用すると判断した場合、以下の実行フローが発生します。

### 1. ツール呼び出し

モデルは、以下の要素を含む `FunctionCall` を生成します。

- **ツール名：** 登録された名前（プレフィックス付きの場合あり）
- **引数：** ツールのパラメータスキーマと一致する JSON オブジェクト

### 2. 確認プロセス

各 `DiscoveredMCPTool` は、高度な確認ロジックを実装しています。

#### 信頼に基づくバイパス

```typescript
if (this.trust) {
  return false; // 確認は不要
}
```

#### 動的な許可リスト（Allow-list）管理

システムは、以下の単位で内部の許可リストを維持します。

- **サーバー単位:** `serverName` → このサーバーから提供されるすべてのツールが信頼されます
- **ツール単位:** `serverName.toolName` → この特定のツールのみが信頼されます

#### ユーザーによる選択処理

確認が必要な場合、ユーザーは以下のいずれかを選択できます。

- **1 回だけ実行:** 今回のみ実行します
- **このツールを常に許可:** ツール単位の許可リストに追加します
- **このサーバーを常に許可:** サーバー単位の許可リストに追加します
- **キャンセル:** 実行を中止します

### 3. 実行

確認（または信頼バイパス）後：

1. **パラメーターの準備：** 引数がツールのスキーマに対して検証されます。
2. **MCP 呼び出し：** 基盤となる `CallableTool` が、以下の内容でサーバーを呼び出します。

   ```typescript
   const functionCalls = [
     {
       name: this.serverToolName, // オリジナルのサーバーツール名
       args: params,
     },
   ];
   ```

3. **応答の処理：** 結果は、LLM のコンテキスト用およびユーザー表示用の両方に対応する形式に整形されます。

### 4. 応答の処理

実行結果には以下の要素が含まれます：

- **`llmContent`：** 言語モデルのコンテキスト用の生の応答部分
- **`returnDisplay`：** ユーザー表示用に整形された出力（多くの場合、Markdown のコードブロック内に JSON 形式で記述されます）

## MCP サーバーとの対話方法

### `/mcp` コマンドの使用

`/mcp` コマンドは、MCP サーバー設定に関する包括的な情報を提供します。

```bash
/mcp
```

このコマンドを実行すると、以下の情報が表示されます。

- **サーバー一覧**: 設定済みのすべての MCP サーバー
- **接続ステータス**: `CONNECTED`（接続済み）、`CONNECTING`（接続中）、または `DISCONNECTED`（切断済み）
- **サーバー詳細**: 機密データを除く設定の概要
- **利用可能なツール**: 各サーバーから提供されるツールの一覧とその説明
- **ディスカバリー状態**: ディスカバリー処理全体のステータス

### `/mcp` コマンド実行例の出力

```
MCP サーバーのステータス:

📡 pythonTools (CONNECTED)
  コマンド: python -m my_mcp_server --port 8080
  ワーキングディレクトリ: ./mcp-servers/python
  タイムアウト: 15000ms
  ツール: calculate_sum, file_analyzer, data_processor

🔌 nodeServer (DISCONNECTED)
  コマンド: node dist/server.js --verbose
  エラー: 接続拒否

🐳 dockerizedServer (CONNECTED)
  コマンド: docker run -i --rm -e API_KEY my-mcp-server:latest
  ツール: docker__deploy, docker__status

ディスカバリー状態: COMPLETED
```

### ツールの使用方法

検出された MCP ツールは、Qwen モデルにとって組み込みツールと同様に利用可能です。モデルは自動的に以下の処理を行います：

1. **適切なツールを選択** — あなたのリクエストに基づいて
2. **確認ダイアログを表示** — サーバーが信頼済みでない場合に限る
3. **適切なパラメーターでツールを実行**
4. **結果をユーザーフレンドリーな形式で表示**

## ステータス監視およびトラブルシューティング

### 接続状態

MCP 統合では、以下の複数の状態が追跡されます。

#### サーバー状態 (`MCPServerStatus`)

- **`DISCONNECTED`:** サーバーが未接続、またはエラーが発生しています
- **`CONNECTING`:** 接続試行中です
- **`CONNECTED`:** サーバーに接続済みで、準備完了しています

#### 検出状態 (`MCPDiscoveryState`)

- **`NOT_STARTED`:** 検出がまだ開始されていません
- **`IN_PROGRESS`:** 現在、サーバーの検出中です
- **`COMPLETED`:** 検出が完了しました（エラーの有無に関わらず）

### よくある問題と解決策

#### サーバーに接続できません

**症状：** サーバーのステータスが `DISCONNECTED` と表示される

**トラブルシューティング：**

1. **設定を確認：** `command`、`args`、`cwd` が正しく設定されているか確認してください
2. **手動でテスト：** サーバー起動コマンドを直接実行し、正常に動作することを確認してください
3. **依存関係を確認：** 必要なパッケージがすべてインストール済みであるか確認してください
4. **ログを確認：** CLI の出力にエラーメッセージがないか確認してください
5. **権限を確認：** CLI がサーバー起動コマンドを実行できる権限を持っているか確認してください

#### ツールが検出されません

**症状：** サーバーには接続できますが、利用可能なツールがありません

**トラブルシューティング：**

1. **ツール登録を確認：** サーバーが実際にツールを登録しているか確認してください
2. **MCP プロトコルを確認：** サーバーが MCP のツール一覧取得機能を正しく実装しているか確認してください
3. **サーバーログを確認：** サーバー側のエラーがないか、stderr 出力を確認してください
4. **ツール一覧取得をテスト：** サーバーのツール検出エンドポイントを手動でテストしてください

#### ツールが実行されない

**症状：** ツールは検出されるが、実行時に失敗する

**トラブルシューティング：**

1. **パラメーターの検証：** ツールが期待されるパラメーターを受け付けることを確認する
2. **スキーマの互換性：** 入力スキーマが有効な JSON Schema であることを確認する
3. **エラー処理：** ツールで未処理の例外がスローされていないか確認する
4. **タイムアウト問題：** `timeout` 設定を増やすことを検討する

#### サンドボックス互換性

**症状：** サンドボックス機能が有効な状態で MCP サーバーが失敗する

**解決策：**

1. **Docker ベースのサーバー：** すべての依存関係を含む Docker コンテナーを使用する
2. **パスのアクセス可能性：** サーバーの実行可能ファイルがサンドボックス内で利用可能であることを確認する
3. **ネットワークアクセス：** サンドボックスが必要なネットワーク接続を許可するよう設定する
4. **環境変数：** 必要な環境変数がサンドボックスに正しく渡されていることを確認する

### デバッグのヒント

1. **デバッグモードを有効化する:** CLI を `--debug` オプション付きで実行して、詳細な出力を表示します
2. **標準エラー出力（stderr）を確認する:** MCP サーバーの標準エラー出力はキャプチャされ、ログに記録されます（INFO メッセージはフィルタリングされます）
3. **テストの分離:** MCP サーバーを統合する前に、独立してテストを行ってください
4. **段階的なセットアップ:** 複雑な機能を追加する前に、シンプルなツールから始めます
5. **頻繁に `/mcp` を使用する:** 開発中にサーバーのステータスを監視します

## 重要な注意事項

### セキュリティに関する考慮事項

- **信頼設定:** `trust` オプションはすべての確認ダイアログをバイパスします。完全に制御しているサーバーに対してのみ、慎重に使用してください
- **アクセストークン:** API キーやトークンを含む環境変数を設定する際は、セキュリティに十分注意してください
- **サンドボックス互換性:** サンドボックスを使用する場合、MCP サーバーがサンドボックス環境内から利用可能であることを確認してください
- **プライベートデータ:** 広範なスコープを持つパーソナルアクセストークンを使用すると、リポジトリ間での情報漏洩につながる可能性があります

### パフォーマンスとリソース管理

- **接続の持続性**: CLI は、ツールを正常に登録したサーバーに対して永続的な接続を維持します。
- **自動クリーンアップ**: ツールを提供しないサーバーへの接続は、自動的に閉じられます。
- **タイムアウト管理**: サーバーの応答特性に応じて、適切なタイムアウト値を設定してください。
- **リソース監視**: MCP サーバーは個別のプロセスとして実行され、システムリソースを消費します。

### スキーマ互換性

- **スキーマ準拠モード:** デフォルトでは (`schemaCompliance: "auto"`)、ツールのスキーマはそのまま通過します。`settings.json` で `"model": { "generationConfig": { "schemaCompliance": "openapi_30" } }` を設定すると、モデルが厳密な OpenAPI 3.0 形式に変換されます。
- **OpenAPI 3.0 変換:** `openapi_30` モードが有効になると、システムは以下の処理を行います:
  - null 許容型: `["string", "null"]` → `type: "string", nullable: true`
  - 定数値: `const: "foo"` → `enum: ["foo"]`
  - 排他的制限: 数値型の `exclusiveMinimum` → `minimum` と組み合わせたブール型形式
  - キーワード削除: `$schema`, `$id`, `dependencies`, `patternProperties`
- **名前の正規化:** ツール名は API 要件を満たすよう自動的に正規化されます。
- **競合解決:** サーバー間でツール名が重複した場合、自動的にプレフィックスを付加して解決します。

この包括的な統合により、MCP サーバーはセキュリティ、信頼性、使いやすさを維持しつつ、CLI の機能を強力に拡張する手段となります。

## ツールからのリッチコンテンツの返却

MCP ツールは、単純なテキストを返すことに限定されません。1 回のツール応答で、テキスト、画像、音声、その他のバイナリデータなど、リッチでマルチパートなコンテンツを返却できます。これにより、1 回のターンでモデルに多様な情報を提供できる強力なツールを構築できます。

ツールから返却されるすべてのデータは処理され、モデルの次回生成のコンテキストとして送信されます。これにより、モデルは提供された情報を推論したり要約したりできるようになります。

### 動作の仕組み

豊富なコンテンツを返すには、ツールの応答が MCP 仕様に準拠した [`CallToolResult`](https://modelcontextprotocol.io/specification/2025-06-18/server/tools#tool-result) である必要があります。この結果の `content` フィールドは、`ContentBlock` オブジェクトの配列でなければなりません。CLI はこの配列を正しく処理し、テキストとバイナリデータを分離して、モデル向けにパッケージ化します。

`content` 配列内では、異なるタイプのコンテンツブロックを自由に混在させることができます。サポートされているブロックタイプは以下のとおりです。

- `text`
- `image`
- `audio`
- `resource`（埋め込みコンテンツ）
- `resource_link`

### 例：テキストと画像を返す

以下は、テキストの説明と画像の両方を返す有効な MCP ツールからの JSON 応答の例です。

```json
{
  "content": [
    {
      "type": "text",
      "text": "ご依頼のロゴをお送りします。"
    },
    {
      "type": "image",
      "data": "BASE64_ENCODED_IMAGE_DATA_HERE",
      "mimeType": "image/png"
    },
    {
      "type": "text",
      "text": "このロゴは 2025 年に作成されました。"
    }
  ]
}
```

Qwen Code がこの応答を受け取ると、以下の処理を行います。

1.  すべてのテキストを抽出し、モデル向けの単一の `functionResponse` 部分として統合します。
2.  画像データを別個の `inlineData` 部分として提示します。
3.  CLI 上で、テキストと画像の両方が受信されたことを示す、見やすく使いやすい要約を提供します。

これにより、Qwen モデルに対して豊かでマルチモーダルなコンテキストを提供できる高度なツールを構築できます。

## MCP プロンプトをスラッシュコマンドとして使用

ツールに加えて、MCP サーバーは、Qwen Code 内でスラッシュコマンドとして実行可能な事前定義されたプロンプトを公開できます。これにより、よく使うクエリや複雑なクエリに対して名前付きのショートカットを作成し、簡単に呼び出せるようになります。

### サーバー上でのプロンプト定義

以下は、プロンプトを定義するシンプルな stdio MCP サーバーの例です。

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

このサーバーは、`settings.json` の `mcpServers` 配下に次のように記述して利用できます。

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

### プロンプトの実行

プロンプトが見つかった後は、スラッシュコマンドとしてその名前を指定して実行できます。CLI が引数の解析を自動的に処理します。

```bash
/poem-writer --title="Qwen Code" --mood="reverent"
```

または、位置引数を使用する場合：

```bash
/poem-writer "Qwen Code" reverent
```

このコマンドを実行すると、CLI は MCP サーバー上で `prompts/get` メソッドを、指定された引数とともに実行します。サーバーは、これらの引数をプロンプトテンプレートに置き換え、最終的なプロンプトテキストを返します。その後、CLI はこのプロンプトをモデルに送信して実行します。これにより、一般的なワークフローを自動化・共有することが容易になります。

## `qwen mcp` を使用した MCP サーバーの管理

`settings.json` ファイルを手動で編集して MCP サーバーを設定することも可能ですが、CLI にはサーバー設定をプログラムで管理するための便利なコマンド群が用意されています。これらのコマンドにより、JSON ファイルを直接編集することなく、MCP サーバーの追加、一覧表示、削除といった作業を効率化できます。

### サーバーの追加 (`qwen mcp add`)

`add` コマンドは、`settings.json` に新しい MCP サーバーを設定します。スコープ (`-s, --scope`) に応じて、ユーザー設定ファイル `~/.qwen/settings.json` またはプロジェクト設定ファイル `.qwen/settings.json` のいずれかに追加されます。

**コマンド:**

```bash
qwen mcp add [オプション] <名前> <コマンドまたはURL> [引数...]
```

- `<名前>`: サーバーの固有の名前。
- `<コマンドまたはURL>`: 実行するコマンド（`stdio` の場合）または URL（`http`/`sse` の場合）。
- `[引数...]`: `stdio` コマンドに対する任意の引数。

**オプション（フラグ）:**

- `-s, --scope`: 設定のスコープ（user または project）。[デフォルト: "project"]
- `-t, --transport`: トランスポートの種類（stdio、sse、http）。[デフォルト: "stdio"]
- `-e, --env`: 環境変数を設定（例: `-e KEY=value`）。
- `-H, --header`: SSE および HTTP トランスポート用の HTTP ヘッダーを設定（例: `-H "X-Api-Key: abc123" -H "Authorization: Bearer abc123"`）。
- `--timeout`: 接続タイムアウト（ミリ秒単位）を設定。
- `--trust`: サーバーを信頼（すべてのツール呼び出し確認プロンプトをバイパス）。
- `--description`: サーバーの説明を設定。
- `--include-tools`: 含めるツールのカンマ区切りリスト。
- `--exclude-tools`: 除外するツールのカンマ区切りリスト。

#### stdio サーバーの追加

これは、ローカルサーバーを実行する際のデフォルトのトランスポートです。

```bash

# 基本構文
qwen mcp add <名前> <コマンド> [引数...]

# 例：ローカルサーバーの追加
qwen mcp add my-stdio-server -e API_KEY=123 /path/to/server arg1 arg2 arg3

# 例：ローカル Python サーバーの追加
qwen mcp add python-server python server.py --port 8080
```

#### HTTP サーバーの追加

このトランスポートは、ストリーム対応の HTTP トランスポートを使用するサーバー向けです。

```bash

# 基本構文
qwen mcp add --transport http <名前> <URL>

# 例：HTTP サーバーの追加
qwen mcp add --transport http http-server https://api.example.com/mcp/

# 例：認証ヘッダー付き HTTP サーバーの追加
qwen mcp add --transport http secure-http https://api.example.com/mcp/ --header "Authorization: Bearer abc123"
```

#### SSE サーバーの追加

このトランスポートは、Server-Sent Events（SSE）を使用するサーバー向けです。

```bash

# 基本構文
qwen mcp add --transport sse <名前> <URL>
```

# 例: SSE サーバーの追加
qwen mcp add --transport sse sse-server https://api.example.com/sse/

# 例: 認証ヘッダー付きの SSE サーバーの追加
qwen mcp add --transport sse secure-sse https://api.example.com/sse/ --header "Authorization: Bearer abc123"
```

### サーバーの管理 (`qwen mcp`)

現在設定されているすべての MCP サーバーを表示・管理するには、`manage` コマンド、または単に `qwen mcp` を実行します。これにより、対話型の TUI ダイアログが起動し、以下の操作が可能になります。

- すべての MCP サーバーとその接続ステータスを表示
- サーバーの有効化／無効化
- 切断されたサーバーへの再接続
- 各サーバーが提供するツールおよびプロンプトの表示
- サーバーのログの表示

**コマンド:**

```bash
qwen mcp

# または
qwen mcp manage
```

管理ダイアログでは、各サーバーの名前、設定詳細、接続ステータス、および利用可能なツール／プロンプトを視覚的に表示します。

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

このコマンドは、スコープ (`-s, --scope`) に応じて適切な `settings.json` ファイル内の `mcpServers` オブジェクトから「my-server」エントリを検索し、削除します。