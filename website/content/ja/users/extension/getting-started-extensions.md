# Qwen Code Extensions の始め方

このガイドでは、初めての Qwen Code extension の作成手順を解説します。新しい extension のセットアップ、MCP サーバーを介したカスタムツールの追加、カスタムコマンドの作成、`QWEN.md` ファイルを使用したモデルへのコンテキスト提供について学びます。

## 前提条件

開始する前に、Qwen Code がインストールされており、Node.js と TypeScript の基本的な知識があることを確認してください。

## Step 1: 新しい Extension の作成

最も簡単な開始方法は、組み込みテンプレートのいずれかを使用することです。ここでは `mcp-server` の例を基盤として使用します。

テンプレートファイルを含む `my-first-extension` という名前の新しいディレクトリを作成するには、次のコマンドを実行します。

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

## Step 2: Extension ファイルの理解

新しい extension に含まれる主要なファイルを確認しましょう。

### `qwen-extension.json`

これは extension のマニフェストファイルです。Qwen Code に対して、extension の読み込み方法と使用方法を指示します。

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

- `name`: extension の一意の名前。
- `version`: extension のバージョン。
- `mcpServers`: 1 つ以上の Model Context Protocol (MCP) サーバーを定義するセクションです。MCP サーバーを使用することで、モデルが利用可能な新しいツールを追加できます。
  - `command`, `args`, `cwd`: サーバーの起動方法を指定するフィールドです。`${extensionPath}` 変数に注目してください。Qwen Code はこれを extension のインストールディレクトリへの絶対パスに置き換えます。これにより、extension がインストールされている場所に関係なく動作するようになります。

### `example.ts`

このファイルには、MCP サーバーのソースコードが含まれています。`@modelcontextprotocol/sdk` を使用したシンプルな Node.js サーバーです。

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

これらは TypeScript プロジェクトの標準的な設定ファイルです。`package.json` は依存関係と `build` スクリプトを定義し、`tsconfig.json` は TypeScript コンパイラの設定を行います。

## Step 3: Extension のビルドとリンク

extension を使用する前に、TypeScript コードをコンパイルし、ローカル開発用に extension を Qwen Code のインストール環境にリンクする必要があります。

1.  **依存関係のインストール:**

    ```bash
    cd my-first-extension
    npm install
    ```

2.  **サーバーのビルド:**

    ```bash
    npm run build
    ```

    これにより、`example.ts` が `dist/example.js` にコンパイルされます。これは `qwen-extension.json` で参照されているファイルです。

3.  **extension のリンク:**

    `link` コマンドは、Qwen Code の extensions ディレクトリから開発ディレクトリへのシンボリックリンクを作成します。これにより、再インストールすることなく、行った変更が即座に反映されます。

    ```bash
    qwen extensions link .
    ```

次に、Qwen Code セッションを再起動します。新しい `fetch_posts` ツールが利用可能になります。「fetch posts」と入力してテストできます。

## Step 4: カスタムコマンドの追加

カスタムコマンドを使用すると、複雑なプロンプトへのショートカットを作成できます。コード内のパターンを検索するコマンドを追加してみましょう。

1.  `commands` ディレクトリと、コマンドグループ用のサブディレクトリを作成します。

    ```bash
    mkdir -p commands/fs
    ```

2.  `commands/fs/grep-code.md` という名前のファイルを作成します。

    ```markdown
    ---
    description: Search for a pattern in code and summarize findings
    ---

    Please summarize the findings for the pattern `{{args}}`.

    Search Results:
    !{grep -r {{args}} .}
    ```

    この `/fs:grep-code` コマンドは引数を受け取り、それを使用して `grep` シェルコマンドを実行し、結果を要約用のプロンプトに渡します。

> **Note:** コマンドは Markdown 形式を使用し、オプションで YAML frontmatter を含めることができます。TOML 形式は非推奨ですが、後方互換性のために引き続きサポートされています。

ファイルを保存したら、Qwen Code を再起動します。これで `/fs:grep-code "some pattern"` を実行して、新しいコマンドを使用できます。

## Step 5: カスタムスキルとサブエージェントの追加（オプション）

extension では、カスタムスキルとサブエージェントを提供して Qwen Code の機能を拡張することもできます。

### カスタムスキルの追加

スキルは、関連する状況で AI が自動的に使用できる、モデル呼び出し型の機能です。

1.  `skills` ディレクトリと、スキル用のサブディレクトリを作成します。

    ```bash
    mkdir -p skills/code-analyzer
    ```

2.  `skills/code-analyzer/SKILL.md` ファイルを作成します。

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

サブエージェントは、特定のタスクに特化した AI アシスタントです。

1.  `agents` ディレクトリを作成します。

    ```bash
    mkdir -p agents
    ```

2.  `agents/refactoring-expert.md` ファイルを作成します。

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

## Step 6: カスタム `QWEN.md` の追加

extension に `QWEN.md` ファイルを追加することで、モデルに永続的なコンテキストを提供できます。これは、モデルに対して動作方法の指示や extension のツールに関する情報を提供する場合に役立ちます。コマンドやプロンプトを公開するために構築された extension では、必ずしもこのファイルが必要とは限らない点に注意してください。

1.  extension ディレクトリのルートに `QWEN.md` という名前のファイルを作成します。

    ```markdown
    # My First Extension Instructions

    You are an expert developer assistant. When the user asks you to fetch posts, use the `fetch_posts` tool. Be concise in your responses.
    ```

2.  CLI にこのファイルを読み込むよう指示するため、`qwen-extension.json` を更新します。

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

CLI を再度再起動します。extension がアクティブなすべてのセッションで、モデルは `QWEN.md` ファイルからのコンテキストを持つようになります。

## Step 7: Extension のリリース

extension が完成したら、他のユーザーと共有できます。extension をリリースする主な方法は、Git リポジトリ経由または GitHub Releases 経由の 2 つです。公開 Git リポジトリを使用するのが最も簡単な方法です。

どちらの方法の詳細な手順については、[Extension Releasing Guide](extension-releasing.md) を参照してください。

## まとめ

Qwen Code extension の作成に成功しました！以下の方法を学びました。

- テンプレートから新しい extension を作成する。
- MCP サーバーを使用してカスタムツールを追加する。
- 便利なカスタムコマンドを作成する。
- カスタムスキルとサブエージェントを追加する。
- モデルに永続的なコンテキストを提供する。
- ローカル開発用に extension をリンクする。

ここから、より高度な機能を探索し、Qwen Code に強力な新機能を構築できます。