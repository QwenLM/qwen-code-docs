# Web Fetch ツール (`web_fetch`)

このドキュメントでは、Qwen Code 用の `web_fetch` ツールについて説明します。

## 説明

`web_fetch` を使用して、指定された URL からコンテンツを取得し、AI モデルを使用して処理します。このツールは URL とプロンプトを入力として受け取り、URL のコンテンツを取得し、HTML をマークダウンに変換したうえで、そのコンテンツを小型で高速なモデルを使ってプロンプトに基づいて処理します。

### 引数

`web_fetch` は以下の2つの引数を取ります：

- `url`（文字列、必須）：コンテンツを取得する URL。`http://` または `https://` で始まる、完全に正しい形式の URL である必要があります。
- `prompt`（文字列、必須）：ページのコンテンツから抽出したい情報を記述するプロンプト。

## Qwen Code で `web_fetch` を使用する方法

Qwen Code で `web_fetch` を使用するには、URL とその URL から抽出したい内容を記述したプロンプトを指定します。このツールは、URL を取得する前に確認を求めます。確認されると、ツールはコンテンツを直接取得し、AI モデルを使用して処理します。

このツールは、HTML をテキストに自動変換し、GitHub の blob URL を処理（raw URL に変換）し、セキュリティのために HTTP URL を HTTPS にアップグレードします。

使用方法:

```
web_fetch(url="https://example.com", prompt="Summarize the main points of this article")
```

## `web_fetch` の例

単一の記事を要約する：

```
web_fetch(url="https://example.com/news/latest", prompt="この記事の要点をまとめていただけますか？")
```

特定の情報を抽出する：

```
web_fetch(url="https://arxiv.org/abs/2401.0001", prompt="この論文で述べられている主な結果と手法は何ですか？")
```

GitHub のドキュメントを分析する：

```
web_fetch(url="https://github.com/QwenLM/Qwen/blob/main/README.md", prompt="インストール手順と主な機能は何ですか？")
```

## 重要な注意点

- **単一URL処理:** `web_fetch` は一度に1つのURLを処理します。複数のURLを分析するには、ツールに対して個別に呼び出しを行ってください。
- **URL形式:** ツールはHTTP URLを自動的にHTTPSにアップグレードし、GitHubのblob URLをraw形式に変換して、より良いコンテンツアクセスを実現します。
- **コンテンツ処理:** ツールはコンテンツを直接取得し、AIモデルを使用して処理を行い、HTMLを読みやすいテキスト形式に変換します。
- **出力品質:** 出力の品質は、プロンプト内の指示の明確さに依存します。
- **MCPツール:** MCPが提供するウェブ取得ツール（"mcp\_\_"で始まる）が利用可能な場合、そのツールの方が制限が少ない可能性があるため、そちらの使用を推奨します。