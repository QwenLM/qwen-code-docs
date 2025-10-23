# Web Search Tool (`web_search`)

このドキュメントでは `web_search` ツールについて説明します。

## 概要

`web_search` を使用して、Tavily API を介した Web 検索を実行します。このツールは、可能な場合はソース付きの簡潔な回答を返します。

### 引数

`web_search` は以下の引数を取ります：

- `query` (string, 必須): 検索クエリ。

## `web_search` の使い方

`web_search` は Tavily API を直接呼び出します。以下のいずれかの方法で `TAVILY_API_KEY` を設定する必要があります：

1. **設定ファイル**: `settings.json` に `"tavilyApiKey": "your-key-here"` を追加
2. **環境変数**: 環境または `.env` ファイルで `TAVILY_API_KEY` を設定
3. **コマンドライン**: CLI 実行時に `--tavily-api-key your-key-here` を使用

キーが設定されていない場合、ツールは無効化されスキップされます。

使用例:

```
web_search(query="Your query goes here.")
```

## `web_search` の例

トピックに関する情報を取得:

```
web_search(query="latest advancements in AI-powered code generation")
```

## 重要な注意点

- **レスポンスの返却:** `web_search` ツールは、利用可能な場合は簡潔な回答を返し、ソースリンクのリストを付加します。
- **引用:** ソースリンクは番号付きリストとして追加されます。
- **API key:** `TAVILY_API_KEY` は settings.json、環境変数、.env ファイル、またはコマンドライン引数で設定してください。設定されていない場合、ツールは登録されません。