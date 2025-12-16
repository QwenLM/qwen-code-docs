# Web 検索ツール (`web_search`)

このドキュメントでは、複数のプロバイダーを使用して Web 検索を実行するための `web_search` ツールについて説明します。

## 説明

`web_search` を使用して Web 検索を実行し、インターネットから情報を取得します。このツールは複数の検索プロバイダーをサポートしており、利用可能な場合はソース引用付きの簡潔な回答を返します。

### サポートされているプロバイダー

1. **DashScope** (公式、無料) - Qwen OAuth ユーザーに対して自動的に利用可能 (200リクエスト/分、2000リクエスト/日)
2. **Tavily** - 組み込みの回答生成機能を持つ高品質な検索 API
3. **Google カスタム検索** - Google のカスタム検索 JSON API

### 引数

`web_search` は以下の2つの引数を取ります：

- `query` (文字列、必須): 検索クエリ
- `provider` (文字列、任意): 使用する特定のプロバイダー ("dashscope"、"tavily"、"google")
  - 指定しない場合、設定からデフォルトのプロバイダーを使用します

## 設定

### 方法1: 設定ファイル（推奨）

`settings.json`に追加してください：

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

**注意：**

- DashScopeはAPIキー不要（公式、無料サービス）
- **Qwen OAuthユーザー：** 明示的に設定しなくても、DashScopeがプロバイダーリストに自動追加されます
- DashScopeと一緒に使用したい場合は、追加のプロバイダー（Tavily、Google）を設定してください
- `default`を設定して、デフォルトで使用するプロバイダーを指定できます（未設定の場合、優先順位：Tavily > Google > DashScope）

### 方法2: 環境変数

シェルまたは`.env`ファイルで環境変数を設定してください：

```bash

# Tavily
export TAVILY_API_KEY="tvly-xxxxx"

# Google
export GOOGLE_API_KEY="your-api-key"
export GOOGLE_SEARCH_ENGINE_ID="your-engine-id"
```

### 方法 3: コマンドライン引数

Qwen Code を実行する際に API キーを渡す:

```bash

# Tavily
qwen --tavily-api-key tvly-xxxxx

# Google
qwen --google-api-key your-key --google-search-engine-id your-id

# デフォルトプロバイダーの指定
qwen --web-search-default tavily
```

### 後方互換性 (非推奨)

⚠️ **非推奨:** レガシーな `tavilyApiKey` の設定は、後方互換性のためにまだサポートされていますが、非推奨です:

```json
{
  "advanced": {
    "tavilyApiKey": "tvly-xxxxx" // ⚠️ 非推奨
  }
}
```

**重要:** この設定は非推奨であり、将来のバージョンで削除される予定です。上記の新しい `webSearch` 設定形式への移行をお願いします。古い設定では自動的に Tavily がプロバイダーとして設定されますが、設定の更新を強く推奨します。

## Web 検索の無効化

Web 検索機能を無効にしたい場合は、`settings.json` で `web_search` ツールを除外できます。

```json
{
  "tools": {
    "exclude": ["web_search"]
  }
}
```

**注意:** この設定を反映するには、Qwen Code の再起動が必要です。無効化されると、Web 検索プロバイダーが設定されていても、モデルは `web_search` ツールを利用できなくなります。

## 使用例

### 基本的な検索（デフォルトプロバイダーを使用）

```
web_search(query="latest advancements in AI")
```

### 特定のプロバイダーを指定して検索

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

### DashScope (公式)

- **コスト:** 無料
- **認証:** Qwen OAuth認証を使用している場合、自動的に利用可能
- **設定:** APIキー不要、Qwen OAuthユーザーには自動的にプロバイダーリストに追加される
- **クォータ:** 200リクエスト/分、2000リクエスト/日
- **最適な用途:** 一般的なクエリ、Qwen OAuthユーザーにとっては常にフォールバックとして利用可能
- **自動登録:** Qwen OAuthを使用している場合、明示的に設定しなくてもDashScopeが自動的にプロバイダーリストに追加される

### Tavily

- **コスト:** APIキーが必要（無料枠付きの有料サービス）
- **サインアップ:** https://tavily.com
- **特徴:** AI生成回答付きの高品質な結果
- **最適な用途:** リサーチ、引用付きの包括的な回答

### Google カスタム検索

- **コスト:** 無料枠あり（100クエリ/日）
- **セットアップ:**
  1. Google Cloud Console でカスタム検索 API を有効化
  2. https://programmablesearchengine.google.com でカスタム検索エンジンを作成
- **特徴:** Google の検索品質
- **最適な用途:** 特定の事実に関するクエリ

## 重要な注意点

- **レスポンス形式:** 番号付きの出典引用とともに簡潔な回答を返す
- **引用:** 出典リンクは番号付きリストとして追加される: [1], [2] など
- **複数プロバイダー:** あるプロバイダーが失敗した場合、`provider` パラメータを使用して別のプロバイダーを手動で指定
- **DashScope の利用可否:** Qwen OAuth ユーザーに対しては自動的に利用可能で、設定不要
- **デフォルトプロバイダー選択:** システムは利用可能なプロバイダーに基づいて自動的にデフォルトプロバイダーを選択:
  1. 明示的な `default` 設定（最優先）
  2. CLI 引数 `--web-search-default`
  3. 優先順位に従った最初に利用可能なプロバイダー: Tavily > Google > DashScope

## トラブルシューティング

**ツールが利用できない場合**

- **Qwen OAuth ユーザーの場合:** ツールは自動的に DashScope プロバイダーに登録されるため、設定は不要です
- **その他の認証タイプの場合:** 少なくとも1つのプロバイダー（Tavily または Google）が設定されていることを確認してください
- Tavily/Google を使用している場合: API キーが正しいことを確認してください

**プロバイダー固有のエラーが発生する場合**

- `provider` パラメーターを使用して別の検索プロバイダーを試してください
- API のクォータとレート制限を確認してください
- 設定で API キーが正しく設定されていることを確認してください

**サポートが必要な場合**

- 設定を確認してください: `qwen` を実行し、設定ダイアログを使用してください
- 現在の設定は `~/.qwen-code/settings.json` (macOS/Linux) または `%USERPROFILE%\.qwen-code\settings.json` (Windows) で確認できます