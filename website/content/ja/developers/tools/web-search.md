# ウェブ検索

Qwen Code は **MCP (Model Context Protocol)** 統合を通じてウェブ検索機能をサポートしています。ビルトインの検索ツールではなく、外部の MCP サーバーに接続してウェブ検索を提供するため、ニーズに最適な検索サービスを自由に選択できます。

## ⚠️ 破壊的変更: ビルトインの `web_search` ツールは削除されました

> **影響を受けるバージョン:** ビルトインのウェブ検索をサポートしていた最終リリースから `V0.0.7+`

ビルトインの `web_search` ツールとその関連設定はすべて**削除**されました。以下のいずれかを使用していた場合は、このドキュメントで説明する MCP ベースのアプローチに移行してください。

| 削除された項目                                                             | 対応方法                                                                                |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `settings.json` の `webSearch` ブロック                                   | 代わりに `mcpServers` で MCP サーバーを設定してください（下記参照）                      |
| `settings.json` の `advanced.tavilyApiKey`                                | 代わりに [Tavily MCP サーバー](#tavily-websearch) を使用してください                    |
| 環境変数 `TAVILY_API_KEY`                                                 | 代わりに [Tavily MCP サーバー](#tavily-websearch) を使用してください                    |
| ウェブ検索用の `DASHSCOPE_API_KEY`                                        | 代わりに [Alibaba Cloud Bailian WebSearch MCP](#alibaba-cloud-bailian-websearch-recommended) を使用してください |
| ウェブ検索用の `GLM_API_KEY`                                              | 代わりに [GLM WebSearch Prime MCP](#glm-websearch-prime-zhipuai) を使用してください      |
| CLI フラグ `--tavily-api-key` / `--glm-api-key` / `--dashscope-api-key`   | `settings.json` の `mcpServers` を使用して設定してください                               |

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

### Alibaba Cloud Bailian WebSearch（推奨）

Alibaba Cloud Bailian プラットフォームが提供する公式ウェブ検索 MCP サービスです。DashScope を搭載しています。

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