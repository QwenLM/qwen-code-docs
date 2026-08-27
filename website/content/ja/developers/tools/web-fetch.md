# Web Fetch ツール (`web_fetch`)

このドキュメントでは、Qwen Code 用の `web_fetch` ツールについて説明します。

## 説明

`web_fetch` を使用すると、指定された URL からコンテンツを取得し、AI モデルで処理できます。このツールは、URL とプロンプトを入力として受け取り、URL のコンテンツを取得し、小さく高速なモデルを用いてプロンプトでコンテンツを処理します。

### 引数

`web_fetch` は 3 つの引数を受け取ります。

- `url` (string, 必須): コンテンツを取得する URL。`http://` または `https://` で始まる完全な形式の有効な URL である必要があります。
- `prompt` (string, 必須): ページコンテンツから抽出したい情報を説明するプロンプト。
- `format` (string, オプション): サーバーに送信される `Accept` ヘッダーのみを制御し、コンテンツの希望形式を示します。**取得したすべてのコンテンツは LLM 処理用にプレーンテキストに正規化されます**。指定された形式は関係ありません。指定がない場合のデフォルトは `"auto"` です。
  - `"auto"` (デフォルト): コンテンツネゴシエーションによりマークダウンを優先します (`Accept: text/markdown, text/html;q=0.9, text/plain;q=0.8, */*;q=0.1`)。フォールバックとして HTML、プレーンテキスト、またはその他のコンテンツタイプを使用します。**ほとんどのユースケースに推奨**されます。マークダウンをサポートするサーバーではトークン使用量を最大 80% 削減でき、JSON のみの API でも動作します。
  - `"markdown"`: `Accept: text/markdown, */*;q=0.1` を優先します。マークダウンコンテンツが明示的に必要な場合に使用します。
  - `"html"`: `Accept: text/html, */*;q=0.1` を優先します。サーバーが Accept ヘッダーに HTML を必要とする場合に使用します。コンテンツは LLM 処理用にプレーンテキストに変換されます。
  - `"text"`: `Accept: text/plain, */*;q=0.1` を優先します。プレーンテキストコンテンツが特に必要な場合に使用します。

## Qwen Code での `web_fetch` の使い方

Qwen Code で `web_fetch` を使用するには、URL とその URL から抽出したい内容を説明するプロンプトを指定します。ツールは URL を取得する前に確認を求めます。確認されると、ツールはコンテンツを直接取得し、AI モデルで処理します。

ツールは自動的に以下を行います。

- 必要に応じて HTML をテキストに変換
- GitHub の blob URL を処理（raw URL に変換）
- セキュリティのために HTTP URL を HTTPS にアップグレード
- マークダウンのコンテンツネゴシエーションをサポート（トークン使用量を大幅に削減）

使用法:

```
web_fetch(url="https://example.com", prompt="この記事の主要なポイントをまとめてください")
```

形式指定あり:

```
web_fetch(url="https://example.com", prompt="生のコンテンツを取得", format="markdown")
```

## `web_fetch` の例

1 つの記事を要約:

```
web_fetch(url="https://example.com/news/latest", prompt="この記事の主要なポイントを要約してもらえますか？")
```

特定の情報を抽出:

```
web_fetch(url="https://arxiv.org/abs/2401.0001", prompt="この論文で説明されている主な発見と方法論は何ですか？")
```

GitHub のドキュメントを分析:

```
web_fetch(url="https://github.com/QwenLM/Qwen/blob/main/README.md", prompt="インストール手順と主な機能は何ですか？")
```

マークダウンコンテンツを取得（Markdown for Agents をサポートするサーバーの場合）:

```
web_fetch(url="https://developers.cloudflare.com/fundamentals/reference/markdown-for-agents/", prompt="主要な情報を抽出してください", format="markdown")
```

## 重要な注意点

- **単一 URL 処理:** `web_fetch` は一度に 1 つの URL を処理します。複数の URL を分析するには、ツールを個別に呼び出してください。
- **URL 形式:** ツールは HTTP URL を HTTPS に自動アップグレードし、GitHub の blob URL を raw 形式に変換してコンテンツアクセスを向上させます。
- **コンテンツネゴシエーション:** ツールは "Markdown for Agents" のコンテンツネゴシエーションをサポートしています。`format="auto"`（デフォルト）を使用すると、`Accept: text/markdown, text/html;q=0.9, text/plain;q=0.8, */*;q=0.1` を送信し、マークダウンをサポートするサーバーは HTML の代わりにマークダウンを直接返すことができます。優先度の低い `*/*` フォールバックにより、JSON のみの API やその他の非テキストエンドポイントも取得可能です。これによりトークン使用量を最大 80% 削減できます。
- **コンテンツ処理:** ツールはコンテンツを直接取得し、AI モデルで処理します。サーバーが HTML を返した場合は読み取り可能なテキスト形式に変換します。サーバーがマークダウン、プレーンテキスト、または JSON などのその他のフォールバックコンテンツタイプを返した場合は、そのまま使用します。
- **出力品質:** 出力の品質はプロンプトの指示の明確さに依存します。
- **MCP ツール:** MCP が提供する Web 取得ツール（"mcp\_\_" で始まるもの）が利用可能な場合は、制限が少ない可能性があるため、そちらを優先してください。

## Markdown for Agents のサポート

Qwen Code の `web_fetch` ツールは、[Cloudflare の Markdown for Agents](https://blog.cloudflare.com/markdown-for-agents/) 仕様をサポートしています。この機能により、ウェブサイトは AI エージェントに直接マークダウンコンテンツを提供でき、HTML をパースする場合と比較してトークン使用量を大幅に削減できます。

### 動作の仕組み

1. `format` パラメータはサーバーに送信される **`Accept` ヘッダーのみ**を制御します（出力形式には影響しません）。
   - `format="auto"`: `Accept: text/markdown, text/html;q=0.9, text/plain;q=0.8, */*;q=0.1` を送信
   - `format="markdown"`: `Accept: text/markdown, */*;q=0.1` を送信
   - `format="html"`: `Accept: text/html, */*;q=0.1` を送信
   - `format="text"`: `Accept: text/plain, */*;q=0.1` を送信
2. サーバーがマークダウンをサポートしている場合、`Content-Type: text/markdown` を返します
3. ツールはマークダウンまたはプレーンテキストコンテンツを変換せずにそのまま使用します
4. サーバーが HTML を返した場合は、LLM 処理用に読み取り可能なテキスト形式に変換します。マークダウン、プレーンテキスト、および JSON などのフォールバックコンテンツタイプはそのまま使用します
5. すべてのコンテンツは AI モデルで処理される前にテキストに正規化されます

### 利点

- **トークン効率:** マークダウンコンテンツは通常、同等の HTML よりも 80% 少ないトークンで済みます
- **構造の良さ:** マークダウンはセマンティック構造（見出し、リストなど）を保持します
- **後方互換性:** すべてのウェブサイトで動作し、サポートサーバーでは拡張された体験を提供します

### マークダウンをサポートするサーバーの例

- Cloudflare 開発者向けドキュメント
- Cloudflare ブログ
- Cloudflare の "Markdown for Agents" 機能を使用しているすべてのウェブサイト