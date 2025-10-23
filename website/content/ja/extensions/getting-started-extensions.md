# Qwen Code Extensions を始める

このガイドでは、初めての Qwen Code extension の作成方法を説明します。新しい extension のセットアップ、MCP サーバーを使ってカスタムツールを追加する方法、カスタムコマンドを作成する方法、そして `QWEN.md` ファイルを使ってモデルにコンテキストを提供する方法について学びます。

## 前提条件

開始する前に、Qwen Code がインストールされており、Node.js と TypeScript の基本的な知識があることを確認してください。

## ステップ 1: 新しい Extension を作成する

最も簡単な方法は、組み込みテンプレートの一つを使うことです。ここでは `mcp-server` の例をベースに使います。

以下のコマンドを実行して、テンプレートファイル付きの `my-first-extension` という新しいディレクトリを作成します：

```bash
qwen extensions new my-first-extension mcp-server
```

これにより、以下のような構造を持つ新しいディレクトリが作成されます：

```
my-first-extension/
├── example.ts
├── qwen-extension.json
├── package.json
└── tsconfig.json
```

## ステップ 2: 拡張機能のファイル構成を理解する

新しく作成した拡張機能の主要なファイルを見てみましょう。

### `qwen-extension.json`

これは拡張機能のマニフェストファイルです。Qwen Code がどのように拡張機能をロードし、使用するかを記述します。

```json
{
  "name": "my-first-extension",
  "version": "1.0.0",
  "mcpServers": {
    "nodeServer": {
      "command": "node",
      "args": ["${extensionPath}${/}dist${/}example.js"],
      "cwd": "${extensionPath}"
    }
  }
}
```

- `name`: 拡張機能の一意の名前。
- `version`: 拡張機能のバージョン。
- `mcpServers`: このセクションでは、1つ以上の Model Context Protocol (MCP) サーバーを定義します。MCP サーバーは、モデルが使用できる新しいツールを追加する方法です。
  - `command`, `args`, `cwd`: これらのフィールドはサーバーの起動方法を指定します。`${extensionPath}` 変数が使われていることに注目してください。これは Qwen Code によって拡張機能のインストールディレクトリへの絶対パスに置き換えられます。これにより、拡張機能がどこにインストールされても正常に動作するようになります。

### `example.ts`

このファイルには、MCP サーバーのソースコードが含まれています。これは `@modelcontextprotocol/sdk` を使用したシンプルな Node.js サーバーです。

```typescript
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({
  name: 'prompt-server',
  version: '1.0.0',
});

// 'fetch_posts' という名前の新しいツールを登録
server.registerTool(
  'fetch_posts',
  {
    description: 'Fetches a list of posts from a public API.',
    inputSchema: z.object({}).shape,
  },
  async () => {
    const apiResponse = await fetch(
      'https://jsonplaceholder.typicode.com/posts',
    );
    const posts = await apiResponse.json();
    const response = { posts: posts.slice(0, 5) };
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(response),
        },
      ],
    };
  },
);

// ... (prompt の登録は簡略化のため省略)

const transport = new StdioServerTransport();
await server.connect(transport);
```

このサーバーでは、パブリック API からデータを取得する `fetch_posts` という単一のツールが定義されています。

### `package.json` と `tsconfig.json`

これらは TypeScript プロジェクトの標準的な設定ファイルです。`package.json` ファイルでは依存関係と `build` スクリプトを定義し、`tsconfig.json` では TypeScript コンパイラを設定します。

## ステップ 3: 拡張機能のビルドとリンク

拡張機能を使用する前に、TypeScript コードをコンパイルし、ローカル開発用に拡張機能を Qwen Code にリンクする必要があります。

1.  **依存関係のインストール:**

    ```bash
    cd my-first-extension
    npm install
    ```

2.  **サーバーのビルド:**

    ```bash
    npm run build
    ```

    これにより `example.ts` が `dist/example.js` にコンパイルされ、これが `qwen-extension.json` で参照されているファイルになります。

3.  **拡張機能のリンク:**

    `link` コマンドは、Qwen Code の拡張機能ディレクトリから開発ディレクトリへのシンボリックリンクを作成します。これにより、再インストールすることなく、変更内容が即座に反映されます。

    ```bash
    qwen extensions link .
    ```

これで、Qwen Code セッションを再起動してください。新しい `fetch_posts` ツールが利用可能になります。"fetch posts" と質問してテストできます。

## ステップ 4: カスタムコマンドを追加する

カスタムコマンドは、複雑なプロンプトのショートカットを作成する方法を提供します。ここでは、コード内からパターンを検索するコマンドを追加してみましょう。

1.  `commands` ディレクトリと、その配下にコマンドグループ用のサブディレクトリを作成します：

    ```bash
    mkdir -p commands/fs
    ```

2.  `commands/fs/grep-code.toml` というファイルを作成します：

    ```toml
    prompt = """
    Please summarize the findings for the pattern `{{args}}`.

    Search Results:
    !{grep -r {{args}} .}
    """

    ```

    このコマンド `/fs:grep-code` は引数を受け取り、それを使って `grep` シェルコマンドを実行し、結果を要約するプロンプトに渡します。

ファイルを保存した後、Qwen Code を再起動してください。これで新しいコマンドを使用するために `/fs:grep-code "some pattern"` を実行できるようになります。

## ステップ 5: カスタム `QWEN.md` を追加する

拡張機能に `QWEN.md` ファイルを追加することで、モデルに永続的なコンテキストを提供できます。これは、モデルの振る舞い方に関する指示や、拡張機能のツールに関する情報を与えるのに便利です。ただし、コマンドやプロンプトを公開するために構築された拡張機能では、必ずしもこのファイルが必要とは限りません。

1.  拡張機能ディレクトリのルートに `QWEN.md` という名前のファイルを作成します：

    ```markdown
    # My First Extension Instructions

    あなたはエキスパートレベルの開発アシスタントです。ユーザーが投稿の取得を依頼した場合は、`fetch_posts` ツールを使用してください。返答は簡潔にしてください。
    ```

2.  `qwen-extension.json` を更新して、CLI がこのファイルを読み込むように指定します：

    ```json
    {
      "name": "my-first-extension",
      "version": "1.0.0",
      "contextFileName": "QWEN.md",
      "mcpServers": {
        "nodeServer": {
          "command": "node",
          "args": ["${extensionPath}${/}dist${/}example.js"],
          "cwd": "${extensionPath}"
        }
      }
    }
    ```

再度 CLI を再起動してください。これで、拡張機能が有効なすべてのセッションで、モデルが `QWEN.md` ファイルからのコンテキストを持つようになります。

## ステップ 6: エクステンションのリリース

エクステンションに満足したら、他の人と共有することができます。エクステンションをリリースする主な方法は2つあり、Git リポジトリ経由か GitHub Releases を通じて行います。パブリックな Git リポジトリを使用するのが最も簡単な方法です。

両方の方法について詳しく知るには、[Extension Releasing Guide](extension-releasing.md) を参照してください。

## まとめ

これで Qwen Code のエクステンションを無事に作成できました！以下のことを学びました：

- テンプレートから新しいエクステンションを初期化する方法
- MCP サーバーを使ってカスタムツールを追加する方法
- 便利なカスタムコマンドを作成する方法
- モデルに対して永続的なコンテキストを提供する方法
- ローカル開発用にエクステンションをリンクする方法

ここからさらに高度な機能を調べて、Qwen Code により強力な新機能を追加していきましょう。