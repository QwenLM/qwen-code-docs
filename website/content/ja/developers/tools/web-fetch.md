# Web Fetch ツール（`web_fetch`）

本ドキュメントでは、Qwen Code 用の `web_fetch` ツールについて説明します。

## 概要

`web_fetch` は、指定された URL からコンテンツを取得し、AI モデルで処理するために使用します。このツールは URL とプロンプトを入力として受け取り、URL のコンテンツを取得して HTML を Markdown に変換した後、軽量で高速なモデルを使用してプロンプトに基づきコンテンツを処理します。

### 引数

`web_fetch` は 2 つの引数を受け取ります：

- `url`（string, 必須）: コンテンツを取得する URL。`http://` または `https://` で始まる、完全に構成された有効な URL である必要があります。
- `prompt`（string, 必須）: ページのコンテンツから抽出したい情報を記述したプロンプト。

## Qwen Code での `web_fetch` の使用方法

Qwen Code で `web_fetch` を使用するには、URL と、その URL から抽出したい内容を記述したプロンプトを指定します。ツールは URL を取得する前に確認を求めます。確認が完了すると、ツールはコンテンツを直接取得し、AI モデルを使用して処理します。

このツールは HTML を自動的にテキストに変換し、GitHub の blob URL を raw URL に変換して処理します。また、セキュリティのために HTTP URL を HTTPS にアップグレードします。

使用方法:

```
web_fetch(url="https://example.com", prompt="Summarize the main points of this article")
```

## `web_fetch` の使用例

単一の記事を要約する:

```
web_fetch(url="https://example.com/news/latest", prompt="Can you summarize the main points of this article?")
```

特定の情報を抽出する:

```
web_fetch(url="https://arxiv.org/abs/2401.0001", prompt="What are the key findings and methodology described in this paper?")
```

GitHub のドキュメントを分析する:

```
web_fetch(url="https://github.com/QwenLM/Qwen/blob/main/README.md", prompt="What are the installation steps and main features?")
```

## 重要な注意事項

- **単一 URL の処理:** `web_fetch` は一度に 1 つの URL しか処理できません。複数の URL を分析する場合は、ツールを個別に呼び出してください。
- **URL 形式:** ツールは HTTP URL を自動的に HTTPS にアップグレードし、コンテンツへのアクセスを最適化するために GitHub の blob URL を raw 形式に変換します。
- **コンテンツ処理:** ツールはコンテンツを直接取得し、AI モデルを使用して処理します。この際、HTML は読みやすいテキスト形式に変換されます。
- **出力品質:** 出力の品質は、プロンプト内の指示の明確さに依存します。
- **MCP ツール:** MCP 提供の Web 取得ツール（`mcp__` で始まる）が利用可能な場合は、制限が少ない可能性があるため、そちらの使用を推奨します。