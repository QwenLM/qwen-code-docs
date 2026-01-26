# Qwen Code 拡張機能の開始

このガイドでは、初めての Qwen Code 拡張機能を作成する方法を説明します。新しい拡張機能のセットアップ方法、MCP サーバー経由でのカスタムツールの追加方法、カスタムコマンドの作成方法、および `QWEN.md` ファイルを使用してモデルにコンテキストを提供する方法について学びます。

## 前提条件

開始する前に、Qwen Code がインストールされており、Node.js と TypeScript の基本的な知識があることを確認してください。

## ステップ 1: 新しい拡張機能を作成する

開始する最も簡単な方法は、組み込みテンプレートのいずれかを使用することです。ここでは `mcp-server` の例を基盤として使用します。

次のコマンドを実行して、テンプレートファイルと共に `my-first-extension` という名前の新しいディレクトリを作成します：

```bash
qwen extensions new my-first-extension mcp-server
```

これにより、以下の構造を持つ新しいディレクトリが作成されます：

```
my-first-extension/
├── example.ts
├── qwen-extension.json
├── package.json
└── tsconfig.json
```

## ステップ 2: 拡張機能ファイルを理解する

新しく作成した拡張機能の主要なファイルを見てみましょう。

### `qwen-extension.json`

これは拡張機能のマニフェストファイルです。Qwen Code に対して、どのようにして拡張機能を読み込み利用するかを伝えます。

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
- `mcpServers`: このセクションでは、1つ以上のモデルコンテキストプロトコル（MCP）サーバーを定義します。MCP サーバーは、モデルが使用できる新しいツールを追加する方法です。
  - `command`, `args`, `cwd`: これらのフィールドは、サーバーの起動方法を指定します。`${extensionPath}` 変数が使用されていることに注目してください。Qwen Code はこれを拡張機能のインストールディレクトリへの絶対パスに置き換えます。これにより、どこにインストールされていても拡張機能が動作するようになります。

### `example.ts`

このファイルには、MCPサーバーのソースコードが含まれています。これは、`@modelcontextprotocol/sdk` を使用するシンプルなNode.jsサーバーです。

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
    description: '公開APIから投稿リストを取得します。',
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

// ... (プロンプト登録は省略されています)

const transport = new StdioServerTransport();
await server.connect(transport);
```

このサーバーは、公開APIからデータを取得する `fetch_posts` という単一のツールを定義しています。

### `package.json` と `tsconfig.json`

これらは、TypeScript プロジェクトの標準的な設定ファイルです。`package.json` ファイルは依存関係と `build` スクリプトを定義し、`tsconfig.json` は TypeScript コンパイラを設定します。

## ステップ 3: 拡張機能をビルドしてリンクする

拡張機能を使用する前に、TypeScript コードをコンパイルし、ローカル開発用に Qwen Code インストールに拡張機能をリンクする必要があります。

1.  **依存関係をインストール:**

    ```bash
    cd my-first-extension
    npm install
    ```

2.  **サーバーをビルド:**

    ```bash
    npm run build
    ```

    これにより、`example.ts` が `dist/example.js` にコンパイルされます。これは `qwen-extension.json` で参照されているファイルです。

3.  **拡張機能をリンク:**

    `link` コマンドは、Qwen Code 拡張機能ディレクトリから開発ディレクトリへのシンボリックリンクを作成します。つまり、変更した内容は再インストールすることなく即座に反映されます。

    ```bash
    qwen extensions link .
    ```

次に、Qwen Code セッションを再起動してください。新しい `fetch_posts` ツールが利用可能になります。「fetch posts」と尋ねてテストできます。

## ステップ 4: カスタムコマンドを追加する

カスタムコマンドを使用すると、複雑なプロンプトのショートカットを作成できます。ここでは、コード内でパターンを検索するコマンドを追加してみましょう。

1.  `commands` ディレクトリとそのサブディレクトリ（コマンドグループ用）を作成します。

    ```bash
    mkdir -p commands/fs
    ```

2.  `commands/fs/grep-code.md` という名前のファイルを作成します。

    ```markdown
    ---
    description: コード内のパターンを検索し、結果を要約する
    ---

    パターン `{{args}}` の検索結果を要約してください。

    検索結果:
    !{grep -r {{args}} .}
    ```

    このコマンド `/fs:grep-code` は引数を受け取り、`grep` シェルコマンドを実行し、その結果をプロンプトに渡して要約します。

> **Note:** コマンドはオプションの YAML フロントマターを持つ Markdown 形式を使用します。TOML 形式は非推奨ですが、下位互換性のために引き続きサポートされています。

ファイルを保存した後、Qwen Code を再起動してください。これで `/fs:grep-code "some pattern"` を実行して新しいコマンドを使用できるようになります。

## ステップ 5: カスタムスキルとサブエージェントの追加（オプション）

エクステンションは、Qwen Code の機能を拡張するためのカスタムスキルやサブエージェントも提供できます。

### カスタムスキルの追加

スキルとは、AI が関連性があると判断した際に自動的に使用できるモデル呼び出し型の機能です。

1.  スキルのサブディレクトリを持つ `skills` ディレクトリを作成します。

    ```bash
    mkdir -p skills/code-analyzer
    ```

2.  `skills/code-analyzer/SKILL.md` ファイルを作成します。

    ```markdown
    ---
    name: code-analyzer
    description: コード構造を分析し、複雑さ、依存関係、改善点についての洞察を提供します
    ---

    # コードアナライザー

    ## 命令

    コードを分析する際には以下の点に注目してください。

    - コードの複雑さと保守性
    - 依存関係と結合度
    - 潜在的なパフォーマンスの問題
    - 改善のための提案

    ## 例

    - "この関数の複雑さを分析してください"
    - "このモジュールの依存関係は何ですか？"
    ```

### カスタムサブエージェントの追加

サブエージェントは、特定のタスクに特化したAIアシスタントです。

1.  `agents` ディレクトリを作成します：

    ```bash
    mkdir -p agents
    ```

2.  `agents/refactoring-expert.md` ファイルを作成します：

    ```markdown
    ---
    name: refactoring-expert
    description: コードのリファクタリング、コード構造と保守性の向上に特化
    tools:
      - read_file
      - write_file
      - read_many_files
    ---

    コード品質の向上に焦点を当てたリファクタリング専門家です。

    専門知識には以下が含まれます：

    - コードスメルやアンチパターンの識別
    - SOLID原則の適用
    - コードの可読性と保守性の向上
    - 最小限のリスクでの安全なリファクタリング

    各リファクタリングタスクでは：

    1. 現在のコード構造を分析する
    2. 改善点を特定する
    3. リファクタリング手順を提案する
    4. 変更を段階的に実装する
    5. 機能が維持されていることを確認する
    ```

Qwen Code を再起動後、カスタムスキルは `/skills` から、サブエージェントは `/agents manage` から利用可能になります。

## ステップ 6: カスタム `QWEN.md` の追加

拡張機能に `QWEN.md` ファイルを追加することで、モデルに対して永続的なコンテキストを提供できます。これは、モデルに振る舞い方の指示や、拡張機能のツールに関する情報を与えるのに役立ちます。ただし、コマンドやプロンプトを公開するために構築された拡張機能では、常にこれが必要になるとは限りません。

1.  拡張機能ディレクトリのルートに `QWEN.md` という名前のファイルを作成します：

    ```markdown
    # My First Extension Instructions

    あなたはエキスパートな開発者アシスタントです。ユーザーが投稿を取得するように依頼した際には、`fetch_posts` ツールを使用してください。返答は簡潔にしてください。
    ```

2.  `qwen-extension.json` を更新して、CLI がこのファイルを読み込むように指示します：

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

再度 CLI を再起動してください。これで、モデルは拡張機能がアクティブなすべてのセッションにおいて、`QWEN.md` ファイルからのコンテキストを持つようになります。

## ステップ 7: 拡張機能のリリース

拡張機能に満足したら、それを他の人と共有できます。拡張機能をリリースする主な方法は、Git リポジトリを使用する方法と GitHub Releases を使用する方法の2つです。公開 Git リポジトリを使用するのが最も簡単な方法です。

両方の方法に関する詳細な手順については、[拡張機能リリースガイド](extension-releasing.md)を参照してください。

## まとめ

Qwen Code 拡張機能の作成に成功しました！以下のことを学びました。

- テンプレートから新しい拡張機能をブートストラップする方法。
- MCP サーバーでカスタムツールを追加する方法。
- 便利なカスタムコマンドを作成する方法。
- カスタムスキルとサブエージェントを追加する方法。
- モデルへの永続的なコンテキストを提供する方法。
- ローカル開発のために拡張機能をリンクする方法。

ここから、より高度な機能を探求し、Qwen Code に強力な新機能を構築していけます。