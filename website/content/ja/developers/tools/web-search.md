# Web Search ツール (`web_search`)

本ドキュメントでは、複数のプロバイダーを使用して Web 検索を実行する `web_search` ツールについて説明します。

## 概要

`web_search` を使用して Web 検索を実行し、インターネットから情報を取得します。このツールは複数の検索プロバイダーをサポートしており、利用可能な場合はソースの引用元付きで簡潔な回答を返します。

### サポートされているプロバイダー

1. **DashScope**（公式、無料） - Qwen OAuth ユーザーは自動的に利用可能（200 リクエスト/分、1000 リクエスト/日）
2. **Tavily** - 回答生成機能を備えた高品質な検索 API
3. **Google Custom Search** - Google の Custom Search JSON API

### 引数

`web_search` は以下の 2 つの引数を受け取ります：

- `query` (string, 必須): 検索クエリ
- `provider` (string, オプション): 使用する特定のプロバイダー ("dashscope", "tavily", "google")
  - 指定しない場合、設定からデフォルトのプロバイダーが使用されます

## 設定

### 方法 1: 設定ファイル（推奨）

`settings.json` に追加します：

```json
{
  "webSearch": {
    "provider": [
      { "type": "dashscope" },
      { "type": "tavily", "apiKey": "tvly-xxxxx" },
      {
        "type": "google",
        "apiKey": "your-google-api-key",
        "searchEngineId": "your-search-engine-id"
      }
    ],
    "default": "dashscope"
  }
}
```

**注記:**

- DashScope は API キーが不要です（公式の無料サービス）
- **Qwen OAuth ユーザー:** 明示的に設定しなくても、DashScope は自動的にプロバイダーリストに追加されます
- DashScope と併用する場合は、追加のプロバイダー（Tavily、Google）を設定してください
- `default` を設定してデフォルトで使用するプロバイダーを指定します（未設定の場合の優先順位: Tavily > Google > DashScope）

### 方法 2: 環境変数

シェルまたは `.env` ファイルで環境変数を設定します：

```bash
# Tavily
export TAVILY_API_KEY="tvly-xxxxx"

# Google
export GOOGLE_API_KEY="your-api-key"
export GOOGLE_SEARCH_ENGINE_ID="your-engine-id"
```

### 方法 3: コマンドライン引数

Qwen Code を実行する際に API キーを渡します：

```bash
# Tavily
qwen --tavily-api-key tvly-xxxxx

# Google
qwen --google-api-key your-key --google-search-engine-id your-id

# Specify default provider
qwen --web-search-default tavily
```

### 後方互換性（非推奨）

⚠️ **非推奨:** 従来の `tavilyApiKey` 設定は後方互換性のために引き続きサポートされていますが、非推奨となっています：

```json
{
  "advanced": {
    "tavilyApiKey": "tvly-xxxxx" // ⚠️ Deprecated
  }
}
```

**重要:** この設定は非推奨であり、将来のバージョンで削除される予定です。上記の新しい `webSearch` 設定形式に移行してください。旧設定は自動的に Tavily をプロバイダーとして構成しますが、設定の更新を強く推奨します。

## Web 検索の無効化

Web 検索機能を無効にする場合は、`settings.json` で `web_search` ツールを除外できます：

```json
{
  "tools": {
    "exclude": ["web_search"]
  }
}
```

**注:** この設定を有効にするには Qwen Code の再起動が必要です。無効化されると、Web 検索プロバイダーが設定されていても、モデルは `web_search` ツールを使用できなくなります。

## 使用例

### 基本的な検索（デフォルトプロバイダーを使用）

```
web_search(query="latest advancements in AI")
```

### 特定のプロバイダーを使用した検索

```
web_search(query="latest advancements in AI", provider="tavily")
```

### 実際の使用例

```
web_search(query="weather in San Francisco today")
web_search(query="latest Node.js LTS version", provider="google")
web_search(query="best practices for React 19", provider="dashscope")
```

## プロバイダーの詳細

### DashScope（公式）

- **コスト:** 無料
- **認証:** Qwen OAuth 認証を使用している場合は自動的に利用可能
- **設定:** API キーは不要。Qwen OAuth ユーザーの場合は自動的にプロバイダーリストに追加されます
- **クォータ:** 200 リクエスト/分、1000 リクエスト/日
- **推奨用途:** 一般的なクエリ。Qwen OAuth ユーザー向けのフォールバックとして常に利用可能
- **自動登録:** Qwen OAuth を使用している場合、明示的に設定しなくても DashScope は自動的にプロバイダーリストに追加されます

### Tavily

- **コスト:** API キーが必要（無料枠ありの有料サービス）
- **サインアップ:** https://tavily.com
- **機能:** AI 生成回答付きの高品質な検索結果
- **推奨用途:** リサーチ、引用元付きの包括的な回答

### Google Custom Search

- **コスト:** 無料枠あり（100 クエリ/日）
- **設定手順:**
  1. Google Cloud Console で Custom Search API を有効にする
  2. https://programmablesearchengine.google.com でカスタム検索エンジンを作成する
- **機能:** Google の検索品質
- **推奨用途:** 具体的で事実ベースのクエリ

## 重要な注意事項

- **レスポンス形式:** 番号付きのソース引用元付きで簡潔な回答を返します
- **引用:** ソースリンクは番号付きリストとして末尾に追加されます：[1]、[2] など。
- **複数のプロバイダー:** 1 つのプロバイダーが失敗した場合、`provider` パラメータを使用して別のプロバイダーを手動で指定できます
- **DashScope の利用:** Qwen OAuth ユーザーは自動的に利用可能で、設定は不要です
- **デフォルトプロバイダーの選択:** システムは可用性に基づいてデフォルトのプロバイダーを自動的に選択します：
  1. 明示的に設定した `default` 構成（最優先）
  2. CLI 引数 `--web-search-default`
  3. 優先順位に基づいて最初に利用可能なプロバイダー: Tavily > Google > DashScope

## トラブルシューティング

**ツールが利用できない場合？**

- **Qwen OAuth ユーザーの場合:** ツールは自動的に DashScope プロバイダーで登録されるため、設定は不要です
- **その他の認証タイプの場合:** 少なくとも 1 つのプロバイダー（Tavily または Google）が設定されていることを確認してください
- Tavily/Google の場合: API キーが正しいことを確認してください

**プロバイダー固有のエラーが発生する場合？**

- `provider` パラメータを使用して、別の検索プロバイダーを試してください
- API のクォータとレート制限を確認してください
- API キーが設定で正しく設定されていることを確認してください

**サポートが必要な場合？**

- 設定の確認: `qwen` を実行し、設定ダイアログを使用してください
- 現在の設定の確認: `~/.qwen-code/settings.json`（macOS/Linux）または `%USERPROFILE%\.qwen-code\settings.json`（Windows）