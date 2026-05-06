# Web検索

Qwen Code は **MCP (Model Context Protocol)** 統合を通じて Web 検索機能を提供します。組み込みの検索ツールではなく、外部 MCP サーバーに接続することで Web 検索が実現されるため、ニーズに最適な検索サービスを自由に選択できます。

## ⚠️ 破壊的変更: 組み込み `web_search` ツールの削除

> **影響を受けるバージョン:** `V0.0.7+` から組み込み Web 検索サポートを含む最終リリースまで。

組み込みの `web_search` ツールおよび関連するすべての設定は**削除されました**。以下を使用していた場合は、このドキュメントで説明する MCP ベースのアプローチに移行してください。

| 削除された項目 | 対応方法 |
| --- | --- |
| `settings.json` 内の `webSearch` ブロック | 代わりに `mcpServers` で MCP サーバーを設定する（下記参照） |
| `settings.json` 内の `advanced.tavilyApiKey` | [Tavily MCP サーバー](#tavily-websearch) を使用する |
| `TAVILY_API_KEY` 環境変数 | [Tavily MCP サーバー](#tavily-websearch) を使用する |
| Web 検索用の `DASHSCOPE_API_KEY` | [Alibaba Cloud Bailian WebSearch MCP](#alibaba-cloud-bailian-websearch-recommended) を使用する |
| Web 検索用の `GLM_API_KEY` | [GLM WebSearch Prime MCP](#glm-websearch-prime-zhipuai) を使用する |
| `--tavily-api-key` / `--glm-api-key` / `--dashscope-api-key` CLI フラグ | `settings.json` の `mcpServers` で設定する |

### 移行例

**Before（組み込みツール経由の Tavily）:**

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

**Before（組み込みツール経由の DashScope）:**

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

## サポートされている MCP Web 検索サービス

### Alibaba Cloud Bailian WebSearch（推奨）

DashScope を基盤とする、Alibaba Cloud Bailian プラットフォームが提供する公式 Web 検索 MCP サービスです。

- **MCP マーケットプレイス:** https://bailian.console.aliyun.com/cn-beijing?tab=mcp#/mcp-market/detail/WebSearch
- **料金:** 有料（Alibaba Cloud DashScope 経由で課金）
- **API キーの取得:** https://help.aliyun.com/zh/model-studio/get-api-key
- **推奨用途:** 中国語クエリ、中国の Web コンテンツへのアクセス、Alibaba Cloud エコシステムとの統合

#### 設定方法

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

`${DASHSCOPE_API_KEY}` を実際の API キーに置き換えるか、環境変数として設定して Qwen Code が自動的に読み込むようにしてください。

---

### Tavily WebSearch

リアルタイムの Web 検索、抽出、マップ作成、クロール機能を提供する、本番環境対応の MCP サーバーです。

- **リポジトリ:** https://github.com/tavily-ai/tavily-mcp
- **料金:** 有料（無料枠あり）
- **API キーの取得:** https://app.tavily.com/home
- **推奨用途:** 高品質な AI 生成回答を伴う汎用 Web 検索

#### 利用可能なツール

- `tavily_search` — リアルタイム Web 検索
- `tavily_extract` — Web ページからのインテリジェントなデータ抽出
- `tavily_map` — Web サイトの構造化マップの作成
- `tavily_crawl` — Web サイトの体系的な探索

#### 設定方法

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

### GLM WebSearch Prime (ZhipuAI)

ZhipuAI（智谱AI）が提供する公式 Web 検索リモート MCP サービスで、GLM Coding Plan ユーザー向けに設計されています。ニュース、株価、天気などを含むリアルタイム Web 検索を提供します。

- **ドキュメント:** https://docs.bigmodel.cn/cn/coding-plan/mcp/search-mcp-server
- **料金:** GLM Coding Plan サブスクリプションに含まれる（Lite: 月 100 回、Pro: 月 1,000 回、Max: 月 4,000 回）
- **API キーの取得:** https://open.bigmodel.cn/apikey/platform
- **推奨用途:** 中国語クエリ、リアルタイム情報取得

#### 利用可能なツール

- `webSearchPrime` — ページタイトル、URL、要約、サイト名、ファビコンを返す Web 検索

#### 設定方法

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