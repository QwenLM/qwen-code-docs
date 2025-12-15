# Qwen Code 拡張機能の始め方

このガイドでは、初めての Qwen Code 拡張機能を作成する手順を説明します。新しい拡張機能のセットアップ方法、MCP サーバーを使ってカスタムツールを追加する方法、カスタムコマンドを作成する方法、そして `QWEN.md` ファイルを使ってモデルにコンテキストを提供する方法について学びます。

## 前提条件

開始する前に、Qwen Code がインストールされており、Node.js と TypeScript の基本的な知識があることを確認してください。

## ステップ 1: 新しい拡張機能を作成する

最も簡単な開始方法は、組み込みテンプレートの一つを使用することです。ここでは `mcp-server` の例を基盤として使用します。

以下のコマンドを実行して、テンプレートファイル付きの `my-first-extension` という名前の新しいディレクトリを作成します：

```bash
qwen extensions new my-first-extension mcp-server
```

これにより、以下のような構造の新しいディレクトリが作成されます：

```
my-first-extension/
├── example.ts
├── qwen-extension.json
├── package.json
└── tsconfig.json
```

## ステップ 2: 拡張機能のファイルを理解する

新しい拡張機能の主要なファイルを見てみましょう。

### `qwen-extension.json`

これは拡張機能のマニフェストファイルです。Qwen Code が拡張機能をロードして使用する方法を示します。

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
  - `command`、`args`、`cwd`: これらのフィールドは、サーバーの起動方法を指定します。`${extensionPath}` 変数の使用に注目してください。Qwen Code はこれを拡張機能のインストールディレクトリへの絶対パスに置き換えます。これにより、拡張機能はどこにインストールされていても動作します。

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

// 'fetch_posts' という名前の新しいツールを登録します
server.registerTool(
  'fetch_posts',
  {
    description: '公開 API から投稿のリストを取得します。',
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

// ...（プロンプト登録は簡潔にするため省略）

const transport = new StdioServerTransport();
await server.connect(transport);
```

このサーバーでは、公開 API からデータを取得する `fetch_posts` という単一のツールを定義しています。

### `package.json` と `tsconfig.json`

これらは TypeScript プロジェクトの標準的な設定ファイルです。`package.json` ファイルは依存関係と `build` スクリプトを定義し、`tsconfig.json` は TypeScript コンパイラを設定します。

## ステップ 3: 拡張機能のビルドとリンク

拡張機能を使用する前に、TypeScript コードをコンパイルし、ローカル開発用に拡張機能を Qwen Code インストール環境にリンクする必要があります。

1.  **依存関係のインストール:**

    ```bash
    cd my-first-extension
    npm install
    ```

2.  **サーバーのビルド:**

    ```bash
    npm run build
    ```

    これにより `example.ts` が `dist/example.js` にコンパイルされ、これは `qwen-extension.json` で参照されているファイルです。

3.  **拡張機能のリンク:**

    `link` コマンドは、Qwen Code 拡張機能ディレクトリから開発ディレクトリへのシンボリックリンクを作成します。これにより、再インストールすることなく、変更内容が即座に反映されます。

    ```bash
    qwen extensions link .
    ```

これで、Qwen Code セッションを再起動してください。新しい `fetch_posts` ツールが利用可能になります。テストするには「fetch posts」と聞いてみてください。

## ステップ 4: カスタムコマンドの追加

カスタムコマンドは、複雑なプロンプトのショートカットを作成する方法を提供します。コード内のパターンを検索するコマンドを追加してみましょう。

1.  `commands` ディレクトリとコマンドグループ用のサブディレクトリを作成します：

    ```bash
    mkdir -p commands/fs
    ```

2.  `commands/fs/grep-code.toml` という名前のファイルを作成します：

    ```toml
    prompt = """
    パターン `{{args}}` の検索結果を要約してください。

    検索結果:
    !{grep -r {{args}} .}
    """

    ```

    このコマンド `/fs:grep-code` は引数を受け取り、それを使って `grep` シェルコマンドを実行し、その結果を要約用のプロンプトに渡します。

ファイルを保存した後、Qwen Code を再起動してください。これで新しいコマンドを使用するために `/fs:grep-code "some pattern"` を実行できます。

## ステップ 5: カスタムの `QWEN.md` を追加する

拡張機能に `QWEN.md` ファイルを追加することで、モデルに永続的なコンテキストを提供できます。これは、モデルに対して振る舞い方の指示や、拡張機能のツールに関する情報を与えるのに役立ちます。ただし、コマンドやプロンプトを公開するために構築された拡張機能では、必ずしもこのファイルが必要とは限りません。

1.  拡張機能ディレクトリのルートに `QWEN.md` という名前のファイルを作成します：

    ```markdown
    # My First Extension Instructions

    あなたはエキスパート開発者アシスタントです。ユーザーが投稿の取得を依頼した場合は、`fetch_posts` ツールを使用してください。返答は簡潔にしてください。
    ```

2.  CLI がこのファイルを読み込むように、`qwen-extension.json` を更新します：

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

再度 CLI を再起動してください。これで、拡張機能が有効なセッションでは、モデルが `QWEN.md` ファイルからのコンテキストを持つようになります。

## ステップ 6: 拡張機能のリリース

拡張機能に満足したら、他の人と共有できます。拡張機能をリリースする主な方法は2つあり、Git リポジトリ経由と GitHub Releases を通じてです。パブリックな Git リポジトリを使用するのが最も簡単な方法です。

両方の方法に関する詳細な手順については、[拡張機能リリースガイド](extension-releasing.md)を参照してください。

## まとめ

これで、Qwen Code の拡張機能を正常に作成できました！以下の方法を学びました：

- テンプレートから新しい拡張機能を作成する方法。
- MCP サーバーを使ってカスタムツールを追加する方法。
- 便利なカスタムコマンドを作成する方法。
- モデルに永続的なコンテキストを提供する方法。
- ローカル開発用に拡張機能をリンクする方法。

ここからさらに高度な機能を探求し、Qwen Code により強力な新機能を組み込むことができます。