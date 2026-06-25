# Web Fetch ツール (`web_fetch`)

このドキュメントでは、Qwen Code の `web_fetch` ツールについて説明します。

## 概要

`web_fetch` は、指定した URL からコンテンツを取得し、AI モデルで処理するツールです。URL とプロンプトを入力として受け取り、URL のコンテンツを取得した後、小型で高速なモデルを使用してプロンプトに基づいてコンテンツを処理します。

### 引数

`web_fetch` は以下の 3 つの引数を受け取ります：

- `url`（文字列、必須）: コンテンツを取得する URL。`http://` または `https://` で始まる有効な完全形式の URL を指定してください。
- `prompt`（文字列、必須）: ページコンテンツから抽出したい情報を説明するプロンプト。
- `format`（文字列、省略可能）: サーバーに送信する `Accept` ヘッダーのみを制御し、コンテンツの優先形式を指定します。**取得したコンテンツは、指定した形式に関わらず、LLM 処理のためにプレーンテキストに正規化されます**。省略した場合のデフォルトは `"auto"` です。
  - `"auto"`（デフォルト）: コンテンツネゴシエーション（`Accept: text/markdown, text/html;q=0.9, text/plain;q=0.8, */*;q=0.1`）により markdown を優先し、HTML、プレーンテキスト、その他のコンテンツタイプにフォールバックします。**ほとんどのユースケースで推奨**されます。markdown をサポートするサーバーではトークン使用量を最大 80% 削減でき、JSON のみの API にも対応しています。
  - `"markdown"`: `Accept: text/markdown, */*;q=0.1` を優先します。明示的に markdown コンテンツが必要な場合に使用してください。
  - `"html"`: `Accept: text/html, */*;q=0.1` を優先します。サーバーが Accept ヘッダーに HTML を必要とする場合に使用してください。コンテンツは LLM 処理のためにプレーンテキストに変換されます。
  - `"text"`: `Accept: text/plain, */*;q=0.1` を優先します。プレーンテキストコンテンツが特に必要な場合に使用してください。

## Qwen Code で `web_fetch` を使用する方法

Qwen Code で `web_fetch` を使用するには、URL と、その URL から抽出したい内容を説明するプロンプトを指定します。ツールは URL を取得する前に確認を求めます。確認後、ツールはコンテンツを直接取得し、AI モデルを使用して処理します。

ツールは以下を自動的に行います：

- 必要に応じて HTML をテキストに変換
- GitHub の blob URL を raw URL に変換
- セキュリティのために HTTP URL を HTTPS にアップグレード
- markdown 向けのコンテンツネゴシエーションをサポート（トークン使用量を大幅に削減）

使用例：

```
web_fetch(url="https://example.com", prompt="Summarize the main points of this article")
```

形式を指定する場合：

```
web_fetch(url="https://example.com", prompt="Get the raw content", format="markdown")
```

## `web_fetch` の使用例

記事を要約する：

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

markdown コンテンツを取得する（Markdown for Agents をサポートするサーバー向け）：

```
web_fetch(url="https://developers.cloudflare.com/fundamentals/reference/markdown-for-agents/", prompt="Extract the key information", format="markdown")
```

## 重要な注意事項

- **単一 URL の処理:** `web_fetch` は一度に 1 つの URL を処理します。複数の URL を分析するには、ツールを個別に呼び出してください。
- **URL 形式:** ツールは HTTP URL を自動的に HTTPS にアップグレードし、GitHub の blob URL をコンテンツに適切にアクセスできるよう raw 形式に変換します。
- **コンテンツネゴシエーション:** ツールは「Markdown for Agents」コンテンツネゴシエーションをサポートしています。`format="auto"`（デフォルト）を使用すると、`Accept: text/markdown, text/html;q=0.9, text/plain;q=0.8, */*;q=0.1` を送信し、markdown をサポートするサーバーが HTML の代わりに markdown を直接返せるようになります。低優先度の `*/*` フォールバックにより、JSON のみの API やその他のテキスト以外のエンドポイントにも対応できます。これにより、トークン使用量を最大 80% 削減できます。
- **コンテンツ処理:** ツールはコンテンツを直接取得し、AI モデルで処理します。サーバーが HTML を返した場合は読み取り可能なテキスト形式に変換します。サーバーが markdown、プレーンテキスト、または JSON などのフォールバックコンテンツタイプを返した場合は、そのまま使用します。
- **出力品質:** 出力の品質はプロンプトの指示の明確さに依存します。
- **MCP ツール:** MCP が提供する web fetch ツール（"mcp\_\_" で始まるもの）が利用可能な場合は、制限が少ない可能性があるためそちらを優先して使用してください。

## Markdown for Agents サポート

Qwen Code の `web_fetch` ツールは、[Cloudflare の Markdown for Agents](https://blog.cloudflare.com/markdown-for-agents/) 仕様のサポートを実装しています。この機能により、ウェブサイトが AI エージェントに直接 markdown コンテンツを提供できるようになり、HTML を解析する場合と比較してトークン使用量を大幅に削減できます。

### 仕組み

1. `format` パラメータはサーバーに送信する `Accept` ヘッダー**のみ**を制御します（出力形式には影響しません）：
   - `format="auto"`: `Accept: text/markdown, text/html;q=0.9, text/plain;q=0.8, */*;q=0.1` を送信
   - `format="markdown"`: `Accept: text/markdown, */*;q=0.1` を送信
   - `format="html"`: `Accept: text/html, */*;q=0.1` を送信
   - `format="text"`: `Accept: text/plain, */*;q=0.1` を送信
2. サーバーが markdown をサポートしている場合、`Content-Type: text/markdown` を返します
3. ツールは markdown またはプレーンテキストのコンテンツを変換せずにそのまま使用します
4. サーバーが HTML を返した場合、LLM 処理のために読み取り可能なテキスト形式に変換します。markdown、プレーンテキスト、JSON などのフォールバックコンテンツタイプはそのまま使用します
5. すべてのコンテンツは AI モデルによる処理前にテキストに正規化されます

### メリット

- **トークン効率:** markdown コンテンツは同等の HTML と比較して通常 80% 少ないトークン数で済みます
- **より良い構造:** markdown は意味的な構造（見出し、リストなど）を保持します
- **後方互換性:** すべてのウェブサイトで動作し、サポートするサーバーではより優れたエクスペリエンスを提供します

### markdown をサポートするサーバーの例

- Cloudflare Developer Documentation
- Cloudflare Blog
- Cloudflare の「Markdown for Agents」機能を使用するすべてのウェブサイト
