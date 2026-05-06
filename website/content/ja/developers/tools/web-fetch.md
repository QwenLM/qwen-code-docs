# Web Fetch ツール (`web_fetch`)

このドキュメントでは、Qwen Code 用の `web_fetch` ツールについて説明します。

## 概要

指定された URL からコンテンツを取得し、AI モデルで処理するには `web_fetch` を使用します。このツールは URL とプロンプトを入力として受け取り、URL のコンテンツを取得した後、軽量で高速なモデルを使用してプロンプトに基づいてコンテンツを処理します。

### 引数

`web_fetch` は次の 3 つの引数を受け取ります：

- `url` (string, 必須): コンテンツを取得する URL。`http://` または `https://` で始まる、完全に構成された有効な URL である必要があります。
- `prompt` (string, 必須): ページのコンテンツから抽出したい情報を説明するプロンプト。
- `format` (string, オプション): サーバーに送信される `Accept` ヘッダーのみを制御し、コンテンツの優先順位を示します。指定された形式に関係なく、**取得されたすべてのコンテンツは LLM 処理用にプレーンテキストに正規化されます**。指定しない場合のデフォルトは `"auto"` です。
  - `"auto"` (デフォルト): コンテンツネゴシエーションを通じて Markdown を優先し (`Accept: text/markdown, text/html`)、フォールバックとして HTML を受け入れます。Markdown をサポートするサーバーではトークン使用量を最大 80% 削減できるため、**ほとんどのユースケースで推奨されます**。
  - `"markdown"`: `Accept: text/markdown` を送信します。明示的に Markdown コンテンツが必要な場合に使用します。
  - `"html"`: `Accept: text/html` を送信します。サーバーが Accept ヘッダーに HTML を要求する場合に使用します。コンテンツは引き続き LLM 処理用にプレーンテキストに変換されます。
  - `"text"`: `Accept: text/plain` を送信します。明示的にプレーンテキストコンテンツが必要な場合に使用します。

## Qwen Code での `web_fetch` の使用方法

Qwen Code で `web_fetch` を使用するには、URL と、その URL から抽出したい内容を説明するプロンプトを指定します。ツールは URL を取得する前に確認を求めます。確認が完了すると、ツールはコンテンツを直接取得し、AI モデルを使用して処理します。

このツールは自動的に次の処理を行います：

- 必要に応じて HTML をテキストに変換
- GitHub blob URL の処理（raw URL への変換）
- セキュリティ向上のため HTTP URL を HTTPS にアップグレード
- Markdown のコンテンツネゴシエーションをサポート（トークン使用量を大幅に削減）

使用例：

```
web_fetch(url="https://example.com", prompt="Summarize the main points of this article")
```

形式を指定する場合：

```
web_fetch(url="https://example.com", prompt="Get the raw content", format="markdown")
```

## `web_fetch` の使用例

単一の記事を要約する：

```
web_fetch(url="https://example.com/news/latest", prompt="Can you summarize the main points of this article?")
```

特定の情報を抽出する：

```
web_fetch(url="https://arxiv.org/abs/2401.0001", prompt="What are the key findings and methodology described in this paper?")
```

GitHub ドキュメントを分析する：

```
web_fetch(url="https://github.com/QwenLM/Qwen/blob/main/README.md", prompt="What are the installation steps and main features?")
```

Markdown コンテンツを取得する（Markdown for Agents をサポートするサーバー向け）：

```
web_fetch(url="https://developers.cloudflare.com/fundamentals/reference/markdown-for-agents/", prompt="Extract the key information", format="markdown")
```

## 重要な注意事項

- **単一 URL の処理:** `web_fetch` は一度に 1 つの URL しか処理しません。複数の URL を分析する場合は、ツールを個別に呼び出してください。
- **URL 形式:** ツールは HTTP URL を自動的に HTTPS にアップグレードし、コンテンツへのアクセスを改善するため GitHub blob URL を raw 形式に変換します。
- **コンテンツネゴシエーション:** ツールは「Markdown for Agents」のコンテンツネゴシエーションをサポートしています。`format="auto"`（デフォルト）を使用すると、`Accept: text/markdown, text/html` ヘッダーが送信され、Markdown をサポートするサーバーは HTML の代わりに Markdown を直接返すことができます。これにより、トークン使用量を最大 80% 削減できます。
- **コンテンツ処理:** ツールはコンテンツを直接取得し、AI モデルで処理します。サーバーが HTML を返す場合、読みやすいテキスト形式に変換されます。サーバーが Markdown またはプレーンテキストを返す場合、コンテンツはそのまま使用されます。
- **出力品質:** 出力の品質は、プロンプト内の指示の明確さに依存します。
- **MCP ツール:** MCP 提供の Web 取得ツール（`mcp__` で始まる）が利用可能な場合は、制限が少ない可能性があるため、そちらの使用を推奨します。

## Markdown for Agents のサポート

Qwen Code の `web_fetch` ツールは、[Cloudflare の Markdown for Agents](https://blog.cloudflare.com/markdown-for-agents/) 仕様をサポートしています。この機能により、Web サイトは AI エージェントに対して Markdown コンテンツを直接提供できるようになり、HTML を解析する場合と比較してトークン使用量を大幅に削減できます。

### 動作原理

1. `format` パラメータはサーバーに送信される `Accept` ヘッダー**のみ**を制御します（出力形式には影響しません）：
   - `format="auto"`: `Accept: text/markdown, text/html` を送信
   - `format="markdown"`: `Accept: text/markdown` を送信
   - `format="html"`: `Accept: text/html` を送信
   - `format="text"`: `Accept: text/plain` を送信
2. サーバーが Markdown をサポートしている場合、`Content-Type: text/markdown` を返します
3. ツールは変換を行わず、Markdown またはプレーンテキストのコンテンツを直接使用します
4. サーバーが HTML を返す場合、LLM 処理用に読みやすいテキスト形式に変換します
5. すべてのコンテンツは AI モデルで処理される前にテキストに正規化されます

### メリット

- **トークン効率:** Markdown コンテンツは、同等の HTML と比較して通常 80% 少ないトークンで済みます
- **構造の保持:** Markdown は意味構造（見出し、リストなど）を保持します
- **後方互換性:** すべての Web サイトで動作し、対応サーバーではより優れた体験を提供します

### Markdown をサポートするサーバーの例

- Cloudflare 開発者ドキュメント
- Cloudflare ブログ
- Cloudflare の「Markdown for Agents」機能を使用しているすべての Web サイト