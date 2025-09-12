# Web Fetch Tool (`web_fetch`)

このドキュメントでは、Qwen Code 用の `web_fetch` ツールについて説明します。

## 概要

`web_fetch` を使用して、指定された URL からコンテンツを取得し、AI モデルを使って処理します。このツールは、URL と prompt を入力として受け取り、URL のコンテンツを取得、HTML を markdown に変換し、そのコンテンツを prompt と一緒に小型で高速なモデルを使って処理します。

### 引数

`web_fetch` は以下の2つの引数を取ります：

- `url` (string, 必須): コンテンツを取得する URL。`http://` または `https://` で始まる、完全に正しい形式の URL である必要があります。
- `prompt` (string, 必須): ページのコンテンツから抽出したい情報を記述する prompt。

## Qwen Code で `web_fetch` を使う方法

Qwen Code で `web_fetch` を使用するには、URL とその URL から抽出したい内容を記述した prompt を指定します。このツールは、URL を取得する前に確認を求めます。確認が取れれば、ツールはコンテンツを直接取得し、AI モデルを使って処理を行います。

このツールは自動的に HTML をテキストに変換し、GitHub の blob URL を raw URL に変換し、セキュリティのために HTTP URL を HTTPS にアップグレードします。

使用例:

```
web_fetch(url="https://example.com", prompt="Summarize the main points of this article")
```

## `web_fetch` の例

単一の記事を要約する：

```
web_fetch(url="https://example.com/news/latest", prompt="Can you summarize the main points of this article?")
```

特定の情報を抽出する：

```
web_fetch(url="https://arxiv.org/abs/2401.0001", prompt="What are the key findings and methodology described in this paper?")
```

GitHub のドキュメントを分析する：

```
web_fetch(url="https://github.com/QwenLM/Qwen/blob/main/README.md", prompt="What are the installation steps and main features?")
```

## 重要な注意事項

- **単一URL処理:** `web_fetch` は一度に1つのURLを処理します。複数のURLを分析するには、それぞれのURLに対して個別にツールを呼び出してください。
- **URLフォーマット:** このツールはHTTP URLを自動的にHTTPSにアップグレードし、GitHubのblob URLをraw形式に変換して、コンテンツへのアクセスを改善します。
- **コンテンツ処理:** このツールは直接コンテンツを取得し、AIモデルを使用して処理を行い、HTMLを読みやすいテキスト形式に変換します。
- **出力品質:** 出力の品質は、プロンプト内の指示の明確さに依存します。
- **MCPツール:** MCPが提供するweb fetchツール（"mcp\_\_"で始まるもの）が利用可能な場合、制限が少ない可能性があるため、そのツールの使用を推奨します。