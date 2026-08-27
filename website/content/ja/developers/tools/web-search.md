# ウェブ検索

Qwen Code は2つの方法でウェブ検索を提供します。

1. **ビルトインの `web_search` ツール**（オプトイン）— DashScope Responses API のサーバーサイド検索を使用します。標準的な Bailian (DashScope) API キーで動作し、追加のプロバイダーや MCP の設定は不要です。
2. **MCP (Model Context Protocol) 統合** — 外部の検索サービス（Tavily、GLM など）を接続します。DashScope キーを持っていない場合はこちらを使用してください。

## ビルトインの `web_search`（オプトイン）

ビルトインツールは、DashScope のサーバーサイド `web_search`（および `web_extractor`）ツールを使用して、小さな補助モデルに自己完結型の検索リクエストを発行し、ナレーションされた結果とソース URL を返します。暗黙的に有効になることはありません。以下の2つの設定が必要です。

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3.6-plus",
        "envKey": "DASHSCOPE_API_KEY",
        "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1"
      }
    ]
  },
  "tools": {
    "webSearch": {
      "enabled": true,
      "model": "qwen3.6-plus"
    }
  }
}
```

| 設定                           | 環境変数オーバーライド    | 意味                                                                                                                                                                     |
| ------------------------------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `tools.webSearch.enabled`      | `ENABLE_WEB_SEARCH`       | オプトインフラグ。必須。                                                                                                                                                 |
| `tools.webSearch.model`        | `WEB_SEARCH_MODEL`        | 検索モデルセレクター。`fastModel` と同様に `modelProviders` に対して解決されます（`modelId` または `authType:modelId`）。必須 — デフォルトなし。推奨: `qwen3.6-plus`。      |
| `tools.webSearch.webExtractor` | `WEB_SEARCH_EXTRACTOR`    | 検索エージェントが結果ページを開いてより的確な回答を得られるようにします（デフォルト `true`。DashScope により別途課金されます）。                                         |

### 環境変数のみの設定（settings.json なし）

設定ファイルを書き込めない環境（ロックダウンされたコンテナ、環境変数注入のみの CI）では、このツールは環境変数のみで完全に設定できます — `modelProviders` のエントリは不要です。

```bash
export ENABLE_WEB_SEARCH=true
export WEB_SEARCH_MODEL=qwen3.6-plus
export WEB_SEARCH_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
export DASHSCOPE_API_KEY=sk-...        # または WEB_SEARCH_API_KEY を設定
```

`WEB_SEARCH_BASE_URL` は `modelProviders` エントリの `baseUrl` をミラーし、DashScope 互換のエンドポイントである必要があります。これが設定されている場合、`modelProviders` の解決よりも優先され、`WEB_SEARCH_MODEL` はプレーンな DashScope モデル ID として使用されます。API キーは `WEB_SEARCH_API_KEY` が設定されていればそこから、そうでなければ `DASHSCOPE_API_KEY` から読み取られます。設定ミスは起動時の通知として表示されます。

注意:

- セレクターは `envKey` 経由で直接 API キーを持つ DashScope 互換の `modelProviders` エントリに解決される必要があります。メインモデルはどのプロバイダーでも構いません — 検索サイドのリクエストのみが DashScope エントリを必要とします。Qwen OAuth はこのツールをサポートできません。
- 有効になっているが設定が誤っている場合、ツールはオフのままで、起動時の通知にどの条件が失敗したかが説明されます。
- 検索は DashScope キーで課金されます（`usage.x_tools` カウント）。このツールはデフォルトで確認を要求します。「常に許可」で承認すると、他のツールと同様に標準の `WebSearch` 権限ルールが永続化されます。
- クライアントサイドのモデル許可リストはありません。Responses エンドポイントが提供しないモデルは、初回使用時に明示的に失敗します。

## MCP 代替手段

DashScope キーを持っていない場合、外部 MCP サーバーを接続することでウェブ検索が利用可能です — 以下のサービスを参照してください。

## ⚠️ 過去の破壊的変更: 元のビルトイン `web_search` の削除

> **影響を受けるバージョン:** 元のマルチプロバイダービルトインウェブ検索を含む最後のリリースまでの `V0.0.7+`。

元のビルトイン `web_search` ツール（Tavily/Google/GLM/DashScope マルチプロバイダー）とその設定は**削除**されました。上記の新しいオプトインビルトインツールは異なる実装であり、異なる設定を持ちます。以下のいずれかを使用していた場合は、新しいビルトインツール（DashScope）または MCP に移行してください。

| 削除された項目                                                           | 対応方法                                                        |
| ----------------------------------------------------------------------- | --------------------------------------------------------------- |
| `settings.json` の `webSearch` ブロック                                  | 代わりに `mcpServers` で MCP サーバーを設定してください（下記参照）|
| `settings.json` の `advanced.tavilyApiKey`                               | [Tavily MCP サーバー](#tavily-websearch) を使用してください      |
| 環境変数 `TAVILY_API_KEY`                                                | [Tavily MCP サーバー](#tavily-websearch) を使用してください      |
| ウェブ検索用の `DASHSCOPE_API_KEY`                                       | [ビルトイン `web_search` ツール](#built-in-web_search-opt-in) を使用してください |
| ウェブ検索用の `GLM_API_KEY`                                             | [GLM WebSearch Prime MCP](#glm-websearch-prime-zhipuai) を使用してください |
| CLI フラグ `--tavily-api-key` / `--glm-api-key` / `--dashscope-api-key`  | `settings.json` の `mcpServers` を使用して設定してください       |

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

## サポートされている MCP ウェブ検索サービス

### Alibaba Cloud Bailian WebSearch

Alibaba Cloud Bailian プラットフォームが提供する公式ウェブ検索 MCP サービスで、DashScope を搭載しています。DashScope キーをお持ちの場合は、上記のビルトイン `web_search` ツールを優先してください — この MCP サービスよりも強力な検索パスを使用します。

- **MCP Marketplace:** https://bailian.console.aliyun.com/cn-beijing?tab=mcp#/mcp-market/detail/WebSearch
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

### GLM WebSearch Prime（ZhipuAI）

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
