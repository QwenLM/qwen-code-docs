# Qwen Code 拡張機能の使用を始める

このガイドでは、最初の Qwen Code 拡張機能を作成する手順を説明します。新しい拡張機能のセットアップ、MCP サーバーを介したカスタムツールの追加、カスタムコマンドの作成、`QWEN.md` ファイルによるモデルへのコンテキストの提供方法を学びます。

## 前提条件

始める前に、Qwen Code がインストールされていることと、Node.js と TypeScript の基本的な理解があることを確認してください。

## Step 1: 新しい拡張機能を作成する

最も簡単な開始方法は、組み込みのテンプレートの1つを使用することです。ここでは、`mcp-server` の例を基礎として使用します。

次のコマンドを実行して、テンプレートファイルを含む `my-first-extension` という新しいディレクトリを作成します。

```bash
qwen extensions new my-first-extension mcp-server
```

これにより、次の構造を持つ新しいディレクトリが作成されます。

```
my-first-extension/
├── example.ts
├── qwen-extension.json
├── package.json
└── tsconfig.json
```

## Step 2: 拡張機能ファイルを理解する

新しい拡張機能の主要なファイルを見てみましょう。

### `qwen-extension.json`

これは拡張機能のマニフェストファイルです。Qwen Code に拡張機能のロード方法と使用方法を指示します。

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
- `mcpServers`: このセクションでは、1つ以上の Model Context Protocol (MCP) サーバーを定義します。MCP サーバーは、モデルが使用する新しいツールを追加する方法です。
  - `command`, `args`, `cwd`: これらのフィールドはサーバーの起動方法を指定します。`${extensionPath}` 変数の使用に注意してください。これは Qwen Code によって拡張機能のインストールディレクトリの絶対パスに置き換えられます。これにより、拡張機能がどこにインストールされていても動作します。

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

// Registers a new tool named 'fetch_posts'
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

// ... (prompt registration omitted for brevity)

const transport = new StdioServerTransport();
await server.connect(transport);
```

このサーバーは、公開 API からデータを取得する `fetch_posts` という単一のツールを定義しています。

### `package.json` と `tsconfig.json`

これらは TypeScript プロジェクトの標準的な設定ファイルです。`package.json` ファイルは依存関係と `build` スクリプトを定義し、`tsconfig.json` は TypeScript コンパイラを設定します。

## Step 3: 拡張機能をビルドしてリンクする

拡張機能を使用する前に、TypeScript コードをコンパイルし、ローカル開発のために拡張機能を Qwen Code のインストールにリンクする必要があります。

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

    `link` コマンドは、Qwen Code の拡張機能ディレクトリから開発ディレクトリへのシンボリックリンクを作成します。つまり、再インストールしなくても、行った変更がすぐに反映されます。

    ```bash
    qwen extensions link .
    ```

次に、Qwen Code セッションを再起動します。新しい `fetch_posts` ツールが利用可能になります。「fetch posts」と質問してテストできます。

## Step 4: カスタムコマンドを追加する

カスタムコマンドは、複雑なプロンプトのショートカットを作成する方法を提供します。コード内のパターンを検索するコマンドを追加してみましょう。

1.  `commands` ディレクトリと、コマンドグループ用のサブディレクトリを作成します:

    ```bash
    mkdir -p commands/fs
    ```

2.  `commands/fs/grep-code.md` というファイルを作成します:

    ```markdown
    ---
    description: Search for a pattern in code and summarize findings
    ---

    Please summarize the findings for the pattern `{{args}}`.

    Search Results:
    !{grep -r {{args}} .}
    ```

    このコマンド `/fs:grep-code` は、引数を受け取り、`grep` シェルコマンドを実行し、その結果を要約用のプロンプトにパイプします。

> **注意:** コマンドはオプションの YAML フロントマターを持つ Markdown 形式を使用します。TOML 形式は非推奨ですが、後方互換性のために引き続きサポートされています。

ファイルを保存したら、Qwen Code を再起動します。これで、`/fs:grep-code "some pattern"` を実行して新しいコマンドを使用できます。

## Step 5: カスタムスキルとサブエージェントを追加する（オプション）

拡張機能は、Qwen Code の機能を拡張するために、カスタムスキルとサブエージェントも提供できます。

### カスタムスキルの追加

スキルは、AI が関連する場合に自動的に使用できる、モデルが呼び出す機能です。

1.  `skills` ディレクトリとスキル用のサブディレクトリを作成します:

    ```bash
    mkdir -p skills/code-analyzer
    ```

2.  `skills/code-analyzer/SKILL.md` ファイルを作成します:

    ```markdown
    ---
    name: code-analyzer
    description: Analyzes code structure and provides insights about complexity, dependencies, and potential improvements
    ---

    # Code Analyzer

    ## Instructions

    When analyzing code, focus on:

    - Code complexity and maintainability
    - Dependencies and coupling
    - Potential performance issues
    - Suggestions for improvements

    ## Examples

    - "Analyze the complexity of this function"
    - "What are the dependencies of this module?"
    ```

### カスタムサブエージェントの追加

サブエージェントは、特定のタスク向けの専門的な AI アシスタントです。

1.  `agents` ディレクトリを作成します:

    ```bash
    mkdir -p agents
    ```

2.  `agents/refactoring-expert.md` ファイルを作成します:

    ```markdown
    ---
    name: refactoring-expert
    description: Specialized in code refactoring, improving code structure and maintainability
    tools:
      - read_file
      - write_file
      - read_many_files
    ---

    You are a refactoring specialist focused on improving code quality.

    Your expertise includes:

    - Identifying code smells and anti-patterns
    - Applying SOLID principles
    - Improving code readability and maintainability
    - Safe refactoring with minimal risk

    For each refactoring task:

    1. Analyze the current code structure
    2. Identify areas for improvement
    3. Propose refactoring steps
    4. Implement changes incrementally
    5. Verify functionality is preserved
    ```

Qwen Code を再起動すると、カスタムスキルは `/skills` で、サブエージェントは `/agents manage` で利用可能になります。

## Step 6: カスタム `QWEN.md` を追加する

拡張機能に `QWEN.md` ファイルを追加することで、モデルに永続的なコンテキストを提供できます。これは、モデルに動作方法や拡張機能のツールに関する情報を指示するのに役立ちます。コマンドやプロンプトを公開するために構築された拡張機能では、これが常に必要とは限らないことに注意してください。

1.  拡張機能ディレクトリのルートに `QWEN.md` というファイルを作成します:

    ```markdown
    # My First Extension Instructions

    You are an expert developer assistant. When the user asks you to fetch posts, use the `fetch_posts` tool. Be concise in your responses.
    ```

2.  `qwen-extension.json` を更新して、CLI にこのファイルをロードするように指示します:

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

CLI を再度再起動します。これで、拡張機能がアクティブなすべてのセッションで、モデルが `QWEN.md` ファイルのコンテキストを持つようになります。

## Step 7: 拡張機能をリリースする

拡張機能に満足したら、他の人と共有できます。拡張機能をリリースする主な方法は2つあります。Git リポジトリ経由と GitHub Releases を通じてです。公開 Git リポジトリを使用するのが最も簡単な方法です。

両方の方法の詳細については、[拡張機能リリースガイド](extension-releasing.md) を参照してください。

## まとめ

Qwen Code 拡張機能の作成に成功しました！以下の方法を学びました：

- テンプレートから新しい拡張機能をブートストラップする方法
- MCP サーバーでカスタムツールを追加する方法
- 便利なカスタムコマンドを作成する方法
- カスタムスキルとサブエージェントを追加する方法
- モデルに永続的なコンテキストを提供する方法
- ローカル開発のために拡張機能をリンクする方法

ここから、より高度な機能を探求し、Qwen Code に強力な新機能を構築できます。