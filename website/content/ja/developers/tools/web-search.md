# Web 検索ツール (`web_search`)

このドキュメントでは、複数のプロバイダーを用いて Web 検索を実行するための `web_search` ツールについて説明します。

## 概要

`web_search` を使用して Web 検索を実行し、インターネットから情報を取得します。このツールは複数の検索プロバイダーに対応しており、利用可能な場合は簡潔な回答と出典の参照情報を返します。

### 対応プロバイダー

1. **DashScope**（公式、無料）— Qwen OAuth ユーザーには自動的に利用可能（1 分間に 200 回、1 日に 1000 回のリクエスト）
2. **Tavily** — 高品質な検索 API。組み込みの回答生成機能を備える
3. **Google カスタム検索** — Google の Custom Search JSON API

### 引数

`web_search` は以下の 2 つの引数を取ります：

- `query`（文字列、必須）：検索クエリ
- `provider`（文字列、任意）：使用する特定のプロバイダー（"dashscope"、"tavily"、"google"）
  - 指定しない場合、設定ファイルで指定されたデフォルトのプロバイダーが使用されます

## 設定

### 方法 1：設定ファイル（推奨）

`settings.json` に以下を追加します：

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

**注意点：**

- DashScope は API キーを必要としません（公式の無料サービスです）
- **Qwen OAuth ユーザーの場合：** 明示的に設定しなくても、DashScope が自動的にプロバイダー一覧に追加されます
- DashScope に加えて Tavily や Google を使用したい場合は、それらのプロバイダーも設定してください
- `default` を設定することで、デフォルトで使用するプロバイダーを指定できます（未設定の場合、優先順位は「Tavily > Google > DashScope」になります）

### 方法 2：環境変数

シェルまたは `.env` ファイルで環境変数を設定します：

```bash

# Tavily
export TAVILY_API_KEY="tvly-xxxxx"

# Google
```bash
export GOOGLE_API_KEY="your-api-key"
export GOOGLE_SEARCH_ENGINE_ID="your-engine-id"
```

### 方法 3: コマンドライン引数

Qwen Code を実行する際に API キーを渡します。

```bash
# Tavily
qwen --tavily-api-key tvly-xxxxx

# Google
qwen --google-api-key your-key --google-search-engine-id your-id

# デフォルトのプロバイダーを指定
qwen --web-search-default tavily
```

### 後方互換性（非推奨）

⚠️ **非推奨:** 従来の `tavilyApiKey` 設定は、後方互換性のために引き続きサポートされていますが、非推奨です。

```json
{
  "advanced": {
    "tavilyApiKey": "tvly-xxxxx" // ⚠️ 非推奨
  }
}
```

**重要:** この設定は非推奨であり、今後のバージョンで削除されます。上記に示した新しい `webSearch` 設定形式へ移行してください。旧設定では自動的に Tavily がプロバイダーとして設定されますが、設定の更新を強く推奨します。

## Web 検索の無効化

Web 検索機能を無効化したい場合は、`settings.json` で `web_search` ツールを除外できます。

```json
{
  "tools": {
    "exclude": ["web_search"]
  }
}
```

**注意:** この設定を有効にするには、Qwen Code を再起動する必要があります。無効化されると、Web 検索プロバイダーが設定されていても、モデルは `web_search` ツールを利用できなくなります。

## 使用例

### 基本検索（デフォルトプロバイダー使用）

```
web_search(query="AI 分野における最新の進展")
```

### 特定のプロバイダーを指定した検索

```
web_search(query="AI 分野における最新の進展", provider="tavily")
```

### 実際の使用例

```
web_search(query="今日のサンフランシスコの天気")
web_search(query="最新の Node.js LTS バージョン", provider="google")
web_search(query="React 19 のベストプラクティス", provider="dashscope")
```

## プロバイダーの詳細

### DashScope（公式）

- **コスト:** 無料  
- **認証:** Qwen OAuth 認証を使用している場合、自動的に利用可能  
- **設定:** API キーは不要。Qwen OAuth ユーザーには自動的にプロバイダー一覧に追加されます  
- **クォータ:** 分間 200 件、1 日あたり 1000 件  
- **推奨用途:** 一般質問。Qwen OAuth ユーザー向けのフォールバックとして常に利用可能です  
- **自動登録:** Qwen OAuth を使用している場合、明示的に設定しなくても、DashScope が自動的にプロバイダー一覧に追加されます  

### Tavily

- **コスト:** API キーが必要（有料サービスですが、無料枠あり）  
- **サインアップ:** https://tavily.com  
- **機能:** 高品質な検索結果と AI 生成による回答を提供  
- **推奨用途:** リサーチ、引用付きの包括的な回答

### Google カスタム検索

- **料金:** 無料枠あり（1日100件のクエリ）
- **セットアップ:**
  1. Google Cloud Console で Custom Search API を有効化
  2. https://programmablesearchengine.google.com にてカスタム検索エンジンを作成
- **特徴:** Google の高品質な検索機能
- **推奨用途:** 特定の事実に基づくクエリ

## 重要なお知らせ

- **レスポンス形式:** 番号付き出典引用を含む簡潔な回答を返します
- **出典引用:** 出典リンクは番号付きリスト（[1]、[2] など）として末尾に付加されます
- **複数のプロバイダー対応:** いずれかのプロバイダーが失敗した場合、`provider` パラメーターを手動で指定して別のプロバイダーを選択できます
- **DashScope の利用可能性:** Qwen OAuth ユーザーには自動的に利用可能であり、追加設定は不要です
- **デフォルトプロバイダーの選択:** システムは利用可能性に基づいて自動的にデフォルトプロバイダーを選択します：
  1. 明示的に設定した `default` 設定（最優先）
  2. CLI 引数 `--web-search-default`
  3. 優先順位順に最初に利用可能なプロバイダー：Tavily > Google > DashScope

## トラブルシューティング

**ツールが利用できない場合？**

- **Qwen OAuth ユーザーの場合：** このツールは DashScope プロバイダーと自動的に登録されるため、設定は不要です。
- **その他の認証方式を使用している場合：** 少なくとも 1 つのプロバイダー（Tavily または Google）が設定されていることを確認してください。
- **Tavily / Google を使用している場合：** API キーが正しいか確認してください。

**プロバイダー固有のエラーが発生した場合？**

- `provider` パラメーターを使用して、別の検索プロバイダーを試してください。
- API のクォータおよびレート制限を確認してください。
- 設定ファイルで API キーが正しく設定されているか確認してください。

**サポートが必要な場合？**

- 設定を確認してください：`qwen` コマンドを実行し、設定ダイアログを使用します。
- 現在の設定は、macOS/Linux の場合は `~/.qwen-code/settings.json`、Windows の場合は `%USERPROFILE%\.qwen-code\settings.json` で確認できます。