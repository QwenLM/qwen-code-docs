# ウェブ検索

Qwen Code は2つの方法でウェブ検索を提供します。

1. **組み込み `web_search` ツール** — DashScope Responses API のサーバー側検索、または Qwen サブスクリプション セッションの場合は Qwen MCP 検索サービスによってバックエンドされます。Plus/Pro サブスクリプションへのサインイン後に有効になり、対応する ModelStudio および OpenAI 互換の DashScope 構成では起動時にデフォルトでオンになります。追加のプロバイダーや MCP の設定は不要です。
2. **MCP (Model Context Protocol) 統合** — 外部の検索サービス（Tavily、GLM など）を接続します。プロバイダーがビルトインツールをサポートできない場合に使用してください。

## ビルトインの `web_search` [#built-in-web_search]

DashScope では、組み込みツールが自己完結型の検索リクエストを小さな補助モデルに送信し、サーバー側の `web_search` (および `web_extractor`) ツールを使用します。ナレーション付きの調査結果とソース URL を返します。[Qwen アカウント（サブスクリプション付き）](../../users/configuration/auth.md) を使用すると、Qwen MCP 検索サービスと現在のログイン資格情報を利用します。個別の検索 API キー、補助モデル、または `mcpServers` の設定は必要ありません。`webExtractor` は DashScope 検索にのみ適用されます。

### 自動的に有効になる条件

`tools.webSearch` に何も設定していない場合、実行中のモデルが同じ認証情報で検索リクエストをサポートできる場合にツールが登録されます。

| サインイン方法                                                                                                          | ビルトイン検索                                  |
| -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| [Qwen アカウント（サブスクリプション付き）](https://chat.qwen.ai/?memberPlan=qwen_code) — **Plus または Pro**                             | オン                                              |
| Alibaba ModelStudio → **標準 API キー**                                                                                 | オン                                              |
| Alibaba ModelStudio → **Token Plan**                                                                                       | オン                                              |
| Alibaba ModelStudio → **Coding Plan**                                                                                      | off — この API に対してエンドポイントが検証されていません |
| QwenCloud → **標準 API キー**                                                                                           | オン                                              |
| QwenCloud → **Token Plan**                                                                                                 | オン                                              |
| 認識された DashScope Responses ホスト上の OpenAI 互換 `modelProviders` または Custom Provider エントリ（直接キー付き） | on                                              |
| サードパーティプロバイダー（OpenRouter、DeepSeek、ModelScope など）、他のホスト上のカスタムエンドポイント、ローカルモデル                 | off                                             |

DashScope 検索はメイン モデルと同じキーに対して課金されます。サブスクリプション検索は Qwen のログイン資格情報を再利用します。権限処理はアクティブな承認モードとルールに従います。`default` 承認モードでは、最初の検索で確認を求められます。プロバイダーがツールをサポートできない場合、起動時に表示されません — 起動時の警告はありません。

オフにする方法:

```json
{ "tools": { "webSearch": { "enabled": false } } }
```

または `ENABLE_WEB_SEARCH=false`。ベアモードとセーフモードでは常に無効になります。

### 明示的な設定

このセクションでは DashScope 検索を設定します。サブスクリプション検索はメンバーシップの資格情報を再利用するため、追加の設定は不要です。明示的な検索設定は、自動サブスクリプション検索よりも優先されます。

ツールを ModelStudio Standard/Token Plan または別の検証済み DashScope Responses エントリに向けます。これは、メインモデルが別のプロバイダーで動作していて、サポートされている別の DashScope キーを持っている場合に便利です。Coding Plan ホストは、Responses 検索ツールがそこで検証されていないため、自動アクティベーションから除外されています。`tools.webSearch.model` で明示的にオプトインできます。エンドポイントがそれらを提供しない場合、最初の検索時に明示的に失敗します。その検証されていないパスに依存したくない場合は、MCP 検索プロバイダーを使用してください。

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3.8-flash",
        "envKey": "DASHSCOPE_API_KEY",
        "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1"
      }
    ]
  },
  "tools": {
    "webSearch": {
      "enabled": true,
      "model": "qwen3.8-flash"
    }
  }
}
```

| 設定                           | 環境変数オーバーライド    | 意味                                                                                                                                                                     |
| ------------------------------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `tools.webSearch.enabled`      | `ENABLE_WEB_SEARCH`       | `false` を設定するとツールをオフにします。暗黙的な起動時アクティベーションには、`enabled`、`model`、および環境変数のみのバックエンドが未設定である必要があります。`true` を設定すると、環境変数のみのバックエンドが未設定の場合にのみ自動派生が許可されます。それ以外の場合は `model` が必要です。 |
| `tools.webSearch.model`        | `WEB_SEARCH_MODEL`        | 明示的パスの検索モデルセレクター（`modelId` または `authType:modelId`）。`WEB_SEARCH_BASE_URL` と共に、そのエンドポイントのプレーンなモデル ID です。それ以外の場合は、宣言された DashScope 互換の `modelProviders` エントリと一致する必要があります。自動パスは `qwen3.8-flash` を使用します。 |
| `tools.webSearch.webExtractor` | `WEB_SEARCH_EXTRACTOR`    | 検索エージェントが結果ページを開いてより的確な回答を得られるようにします（デフォルト `true`。DashScope により別途課金されます）。                                         |
| `tools.webSearch.timeoutMs`    | `WEB_SEARCH_TIMEOUT_MS`   | 1回の検索の合計時間予算（ミリ秒単位、デフォルト `120000`、最大 `600000`。その他の値はデフォルトに戻ります）。時間切れになった検索は、少なくとも1回の検索呼び出しが完了していれば、到着したものを部分的な結果として返します。最初の検索呼び出しが完了する前に予算が尽きた場合、ツールは代わりにタイムアウトエラーを報告します。実行された検索なしのナレーションは監査可能な証拠ではないためです。この予算より低い値のツールごとの実行上限（`QWEN_CODE_TOOL_EXECUTION_TIMEOUT_MS`）が先に発生し、部分的な結果を破棄します。`timeoutMs` より大きい値に設定してください。 |
| `tools.webSearch.allowedHosts`  | `WEB_SEARCH_ALLOWED_HOSTS`   | 明示的に設定した検索バックエンドに対して信頼される追加のホストサフィックス — 完全一致のホスト、またはリストされたサフィックスの任意のサブドメイン（環境変数内でカンマ区切り）。デフォルトでは空のため、設定しない限り動作は変わりません。`WEB_SEARCH_BASE_URL` バックエンドと `modelProviders` パスでのみ参照されます。自動導出では決して参照されないため、カスタム ホストは独自の構成で名前が指定されている場合にのみ使用されます。設定されたホストには API キーが渡されます。エントリはトリミングされ小文字化され、ドットを含まないエントリは無視されます。                                                 |
| `tools.webSearch.maxPerSession`| `WEB_SEARCH_MAX_PER_SESSION` | 1セッションあたりの `web_search` 呼び出しの最大数（デフォルト `200`、最大 `10000`。その他の値はデフォルトに戻ります）。このカウントはサブエージェントと共有され、セッションが変更されるとリセットされます（`/clear`、`/resume`、分岐）。上限に達すると、それ以降の検索はスキップされ、収集したもので続行するようモデルに指示されます。 |

### 環境変数のみの設定（settings.json なし）

設定ファイルを書き込めない環境（ロックダウンされたコンテナ、環境変数の注入のみを行う CI など）では、ツールを完全に環境変数で構成できます。`modelProviders` エントリは不要です。

```bash
export ENABLE_WEB_SEARCH=true
export WEB_SEARCH_MODEL=qwen3.8-flash
export WEB_SEARCH_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
export WEB_SEARCH_ALLOWED_HOSTS=llm-gw.example.com   # only for a gateway host
export DASHSCOPE_API_KEY=sk-...        # or set WEB_SEARCH_API_KEY instead
```

`WEB_SEARCH_BASE_URL` は `modelProviders` エントリの `baseUrl` に対応し、DashScope 互換のエンドポイントである必要があります。これが設定されている場合、`modelProviders` の解決より優先され、`WEB_SEARCH_MODEL` が通常の DashScope モデル ID として使用されます。API キーは、`WEB_SEARCH_API_KEY` が設定されていればそこから読み込まれ、そうでなければ `DASHSCOPE_API_KEY` から読み込まれます。エンドポイントが独自ドメイン上のゲートウェイである場合は、そのホストを `WEB_SEARCH_ALLOWED_HOSTS` （または `tools.webSearch.allowedHosts` ）にリストしてください。それ以外の場合、組み込みのリストのみがチェックによって受け入れられます。誤った設定は、起動時の通知として表示されます。

備考:

- 明示的な DashScope 検索では、セレクターが `envKey` を介して直接の API キーを持つ DashScope 互換の `modelProviders` エントリに解決される必要があります。メイン モデルは任意のプロバイダーでも構いません。レガシーの無料 Qwen OAuth プロバイダーはこのパスをサポートできません。Qwen サブスクリプション検索は上記の個別の MCP サービスを使用します。
- 認証の変更が成功した後、検索の登録は再評価されます。Qwen サブスクリプションへのサインインにより、再起動せずに現在のセッションで検索が有効になります。明示的な無効化、ベア/セーフ モード、およびツールの権限ルールは引き続き適用されます。
- 自動ホスト検出は、既知の DashScope リージョン別ホスト、Model Studio および QwenCloud MaaS ホスト（それらの `token-plan.` サブスクリプションサブドメインを含む）、および内部 Alibaba ホストのみを意図的に受け入れます。汎用的な `*.alicloudapi.com` ゲートウェイ、`DASHSCOPE_PROXY_BASE_URL`、および `allowedHosts` に追加しただけのホストは、その自動パスから除外されます。これはユーザーの関与なしに実行されるため、誰も宣言していないホストにメインプロバイダーのキーを渡してしまう可能性があるからです。宣言したゲートウェイを使用する場合は、`tools.webSearch.allowedHosts` にリストし、`WEB_SEARCH_BASE_URL`（または `modelProviders` エントリ）をそちらに向けます。
- 明示的に有効化されているが設定が誤っている場合、ツールはオフのままになり、どの条件が失敗したかを説明する起動時の通知が表示されます。自動有効化では通知は出力されません。
- DashScope 検索は DashScope キーに対して課金されます（`usage.x_tools` も対象です）。自動承認モード（デフォルト）では、分類器がプロンプトなしで検索を承認できます。`default` 承認モードではツールが確認を求め、「常に許可」で承認すると、他のツールと同様に標準的な `WebSearch` 権限ルールが永続化されます。
- クライアントサイドのモデル許可リストはありません。Responses エンドポイントが提供しないモデルは、初回使用時に明示的に失敗します。
- 時間予算を超えた検索は、少なくとも1回の検索呼び出しが完了していれば、到着したものを部分的な結果として返します。最初の検索呼び出しが完了する前に予算が尽きた場合、ツールは代わりにタイムアウトエラーを報告します。実行された検索なしのナレーションは監査可能な証拠ではないためです。検索呼び出しは完了したがナレーションされた回答が届かなかった場合、結果にはエージェントが読み取ったページテキストの最大6,000文字が生のページコンテンツとして含まれます。
- セッションごとの上限は `web_search` ツール呼び出しの数をカウントします。1回の呼び出しが内部で実行する検索の数ではありません。失敗した呼び出しも、リクエストが送信されたためカウントされます。スキップされた呼び出しはエラーではありません。予算が使用済みであることをモデルに伝え、本当に追加の検索が必要な場合は `tools.webSearch.maxPerSession` を上げるようユーザーに依頼するように指示します。

## MCP 代替手段

プロバイダーがビルトインツールをサポートできない場合、外部 MCP サーバーを接続することでウェブ検索が利用可能です — 以下のサービスを参照してください。

## ⚠️ 過去の破壊的変更: 元のビルトイン `web_search` の削除

> **影響を受けるバージョン:** 元のマルチプロバイダービルトインウェブ検索を含む最後のリリースまでの `V0.0.7+`。

元のビルトイン `web_search` ツール（Tavily/Google/GLM/DashScope マルチプロバイダー）とその設定は**削除**されました。上記の新しいオプトインビルトインツールは異なる実装であり、異なる設定を持ちます。以下のいずれかを使用していた場合は、新しいビルトインツール（DashScope）または MCP に移行してください。

| 削除された項目                                                           | 対応方法                                                        |
| ----------------------------------------------------------------------- | --------------------------------------------------------------- |
| `settings.json` の `webSearch` ブロック                                   | MCP サーバーを代わりに `mcpServers` で設定します（下記参照）     |
| `settings.json` の `advanced.tavilyApiKey`                             | [Tavily MCP サーバー](#tavily-websearch) を使用                  |
| 環境変数 `TAVILY_API_KEY`                                                | [Tavily MCP サーバー](#tavily-websearch) を使用してください      |
| ウェブ検索用の `DASHSCOPE_API_KEY`                                       | [ビルトイン `web_search` ツール](#built-in-web_search) を使用してください |
| ウェブ検索用の `GLM_API_KEY`                                             | [GLM WebSearch Prime MCP](#glm-websearch-prime-zhipuai) を使用してください |
| `--tavily-api-key` / `--glm-api-key` / `--dashscope-api-key` CLI フラグ | `settings.json` の `mcpServers` を通じて設定                   |

### 移行例

**Before（ビルトインツール経由の Tavily）:**

```json
{
  "webSearch": {
    "provider": [{ "type": "tavily", "apiKey": "tvly-xxx" }],
    "default": "tavily"
  }
}
```

**After（MCP 経由の Tavily）:**

```json
{
  "mcpServers": {
    "tavily": {
      "httpUrl": "https://mcp.tavily.com/mcp/?tavilyApiKey=tvly-xxx"
    }
  }
}
```

---

**Before（ビルトインツール経由の DashScope）:**

```json
{
  "webSearch": {
    "provider": [{ "type": "dashscope", "apiKey": "sk-xxx" }],
    "default": "dashscope"
  }
}
```

**After（MCP 経由の Alibaba Cloud Bailian WebSearch）:**

```json
{
  "mcpServers": {
    "WebSearch": {
      "httpUrl": "https://dashscope.aliyuncs.com/api/v1/mcps/WebSearch/mcp",
      "headers": {
        "Authorization": "Bearer sk-xxx"
      }
    }
  }
}
```

---

## サポートされている MCP Web Search サービス

### Alibaba Cloud Bailian WebSearch

Alibaba Cloud Bailian プラットフォームによって提供される公式の web search MCP サービスで、DashScope によって駆動されています。DashScope キーがある場合は、上記の組み込み `web_search` ツールを優先してください。この MCP サービスよりも強力な検索パスを使用します。

- **MCP マーケットプレイス:** https://bailian.console.aliyun.com/cn-beijing?tab=mcp#/mcp-market/detail/WebSearch
- **料金:** 有料（Alibaba Cloud DashScope 経由で請求）
- **API キーの取得:** https://help.aliyun.com/zh/model-studio/get-api-key
- **最適な用途:** 中国語のクエリ、中国のウェブコンテンツへのアクセス、Alibaba Cloud エコシステムとの統合

#### セットアップ

**方法 1: CLI コマンド**

```bash
qwen mcp add WebSearch \
  -t http \
  "https://dashscope.aliyuncs.com/api/v1/mcps/WebSearch/mcp" \
  -H "Authorization: Bearer ${DASHSCOPE_API_KEY}"
```

**方法 2: `settings.json`**

```json
{
  "mcpServers": {
    "WebSearch": {
      "httpUrl": "https://dashscope.aliyuncs.com/api/v1/mcps/WebSearch/mcp",
      "headers": {
        "Authorization": "Bearer ${DASHSCOPE_API_KEY}"
      }
    }
  }
}
```

`${DASHSCOPE_API_KEY}` を実際の API キーに置き換えるか、環境変数として設定すると、Qwen Code が自動的に認識します。

---

### Tavily WebSearch

本番環境対応の MCP サーバーで、リアルタイムウェブ検索、抽出、マップ、クロール機能を提供します。

- **リポジトリ:** https://github.com/tavily-ai/tavily-mcp
- **料金:** 有料（無料枠あり）
- **API キーの取得:** https://app.tavily.com/home
- **最適な用途:** 高品質な AI 生成回答を伴う汎用ウェブ検索

#### 利用可能なツール

- `tavily_search` — リアルタイムウェブ検索
- `tavily_extract` — ウェブページからのインテリジェントなデータ抽出
- `tavily_map` — ウェブサイトの構造化マップを作成
- `tavily_crawl` — ウェブサイトを体系的に探索

#### セットアップ

**方法 1: CLI コマンド（リモート MCP）**

```bash
qwen mcp add tavily \
  -t http \
  "https://mcp.tavily.com/mcp/?tavilyApiKey=${TAVILY_API_KEY}"
```

**方法 2: `settings.json`（リモート MCP）**

```json
{
  "mcpServers": {
    "tavily": {
      "httpUrl": "https://mcp.tavily.com/mcp/?tavilyApiKey=${TAVILY_API_KEY}"
    }
  }
}
```

`${TAVILY_API_KEY}` を実際の API キーに置き換えるか、環境変数として設定してください。

**方法 3: `settings.json`（ローカル NPX）**

```json
{
  "mcpServers": {
    "tavily-mcp": {
      "command": "npx",
      "args": ["-y", "tavily-mcp@latest"],
      "env": {
        "TAVILY_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

---

### GLM WebSearch Prime（ZhipuAI） [#glm-websearch-prime-zhipuai]

ZhipuAI（智谱AI）が提供する公式ウェブ検索リモート MCP サービスで、GLM Coding Plan ユーザー向けに設計されています。ニュース、株価、天気などを含むリアルタイムウェブ検索を提供します。

- **ドキュメント:** https://docs.bigmodel.cn/cn/coding-plan/mcp/search-mcp-server
- **料金:** GLM Coding Plan サブスクリプションに含まれています（Lite: 100 回/月、Pro: 1,000 回/月、Max: 4,000 回/月）
- **API キーの取得:** https://open.bigmodel.cn/apikey/platform
- **最適な用途:** 中国語のクエリ、リアルタイム情報検索

#### 利用可能なツール

- `webSearchPrime` — ページタイトル、URL、サマリー、サイト名、ファビコンを返すウェブ検索

#### セットアップ

**方法 1: CLI コマンド**

```bash
qwen mcp add web-search-prime \
  -t http \
  "https://open.bigmodel.cn/api/mcp/web_search_prime/mcp" \
  -H "Authorization: Bearer ${GLM_API_KEY}"
```

**方法 2: `settings.json`**

```json
{
  "mcpServers": {
    "web-search-prime": {
      "httpUrl": "https://open.bigmodel.cn/api/mcp/web_search_prime/mcp",
      "headers": {
        "Authorization": "Bearer ${GLM_API_KEY}"
      }
    }
  }
}
```

`${GLM_API_KEY}` を実際の ZhipuAI API キーに置き換えるか、環境変数として設定してください。

---

### Firecrawl

Firecrawl による公式のホスト型 MCP サーバーで、web search、ページスクレイピング、ウェブサイトクロールとマッピング、ブラウザインタラクション、ファイル解析を提供します。検索結果には各ページのコンテンツを Markdown として含めることができるため、モデルは個別の fetch ステップなしでソースを読むことができます。ホスト型サーバーは、search、scrape、parse において API キーなしで動作します。検索クエリ、読み取りを依頼した URL、解析したファイルは Firecrawl に送信されます。

- **ドキュメント:** https://docs.firecrawl.dev/mcp-server
- **コスト:** search、scrape、parse には API キー不要（IP ごとの日次制限あり）。より高い制限のための有料プランあり
- **API キー取得:** https://www.firecrawl.dev/app/api-keys
- **適している用途:** モデルが見つけたページも読む必要がある web search、および API キーなしでの MCP web search の試行

#### 利用可能なツール

- `firecrawl_search` — Web search、オプションで各結果のページコンテンツを Markdown として返す
- `firecrawl_scrape` — 単一のページをクリーンな Markdown として取得
- `firecrawl_parse` — ローカルファイル（PDF、Word、スプレッドシートなど）を Markdown に変換

API キーを使用すると、サーバーはウェブサイトのマッピングとクロール、ページとのインタラクション（クリック、入力、ナビゲーション）、GitHub issue やドキュメントなどの開発者向けソースの検索を行うためのツールも提供します。

#### セットアップ

**方法 1: CLI コマンド（リモート MCP）**

```bash
qwen mcp add firecrawl \
  -t http \
  "https://mcp.firecrawl.dev/v2/mcp" \
  -H "Authorization: Bearer ${FIRECRAWL_API_KEY}"
```

キーなしで試すには、`-H` 行を省略してください。IP ごとの日次制限内で `firecrawl_search`、`firecrawl_scrape`、`firecrawl_parse` が利用可能になります。

**方法 2: `settings.json`（リモート MCP）**

```json
{
  "mcpServers": {
    "firecrawl": {
      "httpUrl": "https://mcp.firecrawl.dev/v2/mcp",
      "headers": {
        "Authorization": "Bearer ${FIRECRAWL_API_KEY}"
      }
    }
  }
}
```

`${FIRECRAWL_API_KEY}` を実際の API キーに置き換えるか、環境変数として設定してください。キーが空の場合、サーバーは接続しますが、3 つのキーレスツールのみを提供します。

**方法 3: `settings.json`（ローカル NPX）**

```json
{
  "mcpServers": {
    "firecrawl-mcp": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp@latest"],
      "env": {
        "FIRECRAWL_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

---

### SerpApi

SerpApi による公式のホスト型 MCP サーバーで、Google、Baidu、Bing などの検索エンジンからのリアルタイム構造化検索結果を単一のツールを通じて提供します。検索クエリとそのパラメータは SerpApi に送信されます。

- **ドキュメント:** https://serpapi.com/integrations/mcp
- **コスト:** 有料（無料プランあり）
- **API キー取得:** https://serpapi.com/manage-api-key
- **適している用途:** 幅広い選択肢のある検索エンジンからの構造化結果

#### 利用可能なツール

- `search` — Web search、オプションで結果を Markdown として返す

#### セットアップ

**方法 1: CLI コマンド**

```bash
qwen mcp add serpapi \
  -t http \
  "https://mcp.serpapi.com/mcp" \
  -H "Authorization: Bearer ${SERPAPI_API_KEY}"
```

**方法 2: `settings.json`**

```json
{
  "mcpServers": {
    "serpapi": {
      "httpUrl": "https://mcp.serpapi.com/mcp",
      "headers": {
        "Authorization": "Bearer ${SERPAPI_API_KEY}"
      }
    }
  }
}
```

`${SERPAPI_API_KEY}` を実際の API キーに置き換えるか、環境変数として設定してください。キーは検索時にのみ必要です。有効な API キーがない場合、サーバーは接続してツールをリストしますが、`search` はエラーを返します。

---

### looot

loootによるホスト型MCPサーバー。Web検索、Google SERP結果、ニュース検索、Webページの読み取りに対応しています。検索クエリおよび読み取りを依頼したURLはloootに送信されます。

- **ドキュメント:** https://docs.looot.ai
- **コスト:** 有料（プリペイド残高、無料枠なし）
- **APIキーの取得:** https://looot.ai
- **最適な用途:** Web検索、Google SERPおよびニュース結果、ページをテキストとして読み取る場合

#### 利用可能なツール

- `web_search` — Web検索
- `google_search_results` — Google SERP結果
- `news_search` — ニュース検索
- `read_web_page` — 単一のページをテキストとして読み取る

このサーバーでは、企業およびメールアドレスの検索機能も提供されています。

#### セットアップ

**方法 1: CLI コマンド（リモート MCP）**

```bash
qwen mcp add looot \
  -t http \
  "https://api.looot.ai/mcp" \
  -H "Authorization: Bearer ${LOOOT_API_KEY}"
```

**方法 2: `settings.json`（リモート MCP）**

```json
{
  "mcpServers": {
    "looot": {
      "httpUrl": "https://api.looot.ai/mcp",
      "headers": {
        "Authorization": "Bearer ${LOOOT_API_KEY}"
      }
    }
  }
}
```

`${LOOOT_API_KEY}`を実際のAPIキーに置き換えるか、環境変数として設定してください。

---
