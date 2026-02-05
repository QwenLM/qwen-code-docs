# ウェブ検索ツール (`web_search`)

このドキュメントでは、複数のプロバイダーを使用してウェブ検索を実行するための `web_search` ツールについて説明します。

## 説明

`web_search` を使用してウェブ検索を実行し、インターネットから情報を取得します。このツールは複数の検索プロバイダーをサポートしており、利用可能な場合はソース引用付きで簡潔な回答を返します。

### サポートされているプロバイダー

1. **DashScope** (公式、無料) - Qwen OAuth ユーザーに自動的に利用可能 (1分間に200リクエスト、1日に1000リクエスト)
2. **Tavily** - 組み込みの回答生成機能を持つ高品質な検索 API
3. **Google カスタム検索** - Google のカスタム検索 JSON API

### 引数

`web_search` は2つの引数を取ります：

- `query` (文字列、必須): 検索クエリ
- `provider` (文字列、オプション): 使用する特定のプロバイダー ("dashscope", "tavily", "google")
  - 指定しない場合、設定からデフォルトのプロバイダーが使用されます

## 設定

### メソッド 1: 設定ファイル (推奨)

`settings.json` に以下を追加してください：

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

- DashScope は API キーを必要としません（公式の無料サービス）
- **Qwen OAuth ユーザーの場合：** 明示的に設定されていなくても、DashScope は自動的にプロバイダーリストに追加されます
- DashScope と一緒に使用したい場合は、追加のプロバイダー（Tavily、Google）を設定してください
- `default` を設定して、デフォルトで使用するプロバイダーを指定します（設定しない場合の優先順位：Tavily > Google > DashScope）

### メソッド 2: 環境変数

シェルまたは `.env` ファイルで環境変数を設定してください：

```bash

# Tavily
export TAVILY_API_KEY="tvly-xxxxx"
```

# Google
export GOOGLE_API_KEY="your-api-key"
export GOOGLE_SEARCH_ENGINE_ID="your-engine-id"
```

### メソッド3: コマンドライン引数

Qwen Code 実行時に API キーを渡す:

```bash

# Tavily
qwen --tavily-api-key tvly-xxxxx

# Google
qwen --google-api-key your-key --google-search-engine-id your-id

# デフォルトプロバイダを指定
qwen --web-search-default tavily
```

### 下位互換性（非推奨）

⚠️ **非推奨:** 従来の `tavilyApiKey` 設定は下位互換性のために引き続きサポートされていますが、非推奨です:

```json
{
  "advanced": {
    "tavilyApiKey": "tvly-xxxxx" // ⚠️ 非推奨
  }
}
```

**重要:** この設定は非推奨であり、将来のバージョンで削除されます。上記で示した新しい `webSearch` 設定形式への移行をお願いします。古い設定では Tavily が自動的にプロバイダとして設定されますが、設定の更新を強く推奨します。

## ウェブ検索の無効化

ウェブ検索機能を無効にしたい場合は、`settings.json` で `web_search` ツールを除外できます。

```json
{
  "tools": {
    "exclude": ["web_search"]
  }
}
```

**注意:** この設定を有効にするには Qwen Code の再起動が必要です。一度無効化されると、ウェブ検索プロバイダーが設定されていても、モデルは `web_search` ツールを利用できなくなります。

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

### DashScope (公式)

- **料金:** 無料
- **認証:** Qwen OAuth 認証を使用している場合、自動的に利用可能になります
- **設定:** API キーは不要で、Qwen OAuth ユーザーのプロバイダーリストに自動的に追加されます
- **クォータ:** 1分あたり200リクエスト、1日あたり1000リクエスト
- **最適な用途:** 一般的なクエリ、Qwen OAuth ユーザーのフォールバックとして常に利用可能
- **自動登録:** Qwen OAuth を使用している場合、明示的に設定しなくても、DashScope が自動的にプロバイダーリストに追加されます

### Tavily

- **料金:** API キーが必要（無料枠付きの有料サービス）
- **サインアップ:** https://tavily.com
- **特徴:** AI 生成の回答による高品質な結果
- **最適な用途:** リサーチ、引用付きの包括的な回答

### Google カスタム検索

- **料金:** 無料利用枠あり (100クエリ/日)
- **セットアップ:**
  1. Google Cloud Console でカスタム検索 API を有効にする
  2. https://programmablesearchengine.google.com でカスタム検索エンジンを作成する
- **特徴:** Google の検索品質
- **最適な用途:** 特定の事実的なクエリ

## 重要な注意点

- **レスポンス形式:** 番号付きのソース引用を含む簡潔な回答を返す
- **引用:** ソースリンクは番号付きリストとして末尾に追加される: [1]、[2] など
- **複数プロバイダ:** 1つのプロバイダが失敗した場合、`provider` パラメータを使用して別のプロバイダを手動で指定する
- **DashScope 利用可能性:** Qwen OAuth ユーザーには自動的に利用可能、設定不要
- **デフォルトプロバイダ選択:** システムは利用可能性に基づいて自動的にデフォルトプロバイダを選択する:
  1. 明示的な `default` 設定 (最優先)
  2. CLI 引数 `--web-search-default`
  3. 優先順位による最初の利用可能なプロバイダ: Tavily > Google > DashScope

## トラブルシューティング

**ツールが利用できませんか？**

- **Qwen OAuth ユーザーの場合：** ツールは自動的に DashScope プロバイダーに登録されるため、設定は必要ありません
- **その他の認証タイプの場合：** 少なくとも1つのプロバイダー（Tavily または Google）が設定されていることを確認してください
- Tavily/Google の場合：API キーが正しいことを確認してください

**プロバイダー固有のエラーですか？**

- `provider` パラメータを使用して、別の検索プロバイダーを試してください
- API のクォータとレート制限を確認してください
- 設定で API キーが正しく設定されていることを確認してください

**ヘルプが必要ですか？**

- 設定を確認してください：`qwen` を実行し、設定ダイアログを使用してください
- 現在の設定は `~/.qwen-code/settings.json` (macOS/Linux) または `%USERPROFILE%\.qwen-code\settings.json` (Windows) で確認できます