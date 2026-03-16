# Qwen Code 拡張機能の使い始め

このガイドでは、初めての Qwen Code 拡張機能を作成する手順を説明します。新しい拡張機能のセットアップ、MCP サーバーを介したカスタムツールの追加、カスタムコマンドの作成、および `QWEN.md` ファイルによるモデルへのコンテキスト提供について学びます。

## 前提条件

開始する前に、Qwen Code がインストール済みであること、および Node.js と TypeScript の基本的な知識があることを確認してください。

## ステップ 1: 新しい拡張機能の作成

最も簡単な開始方法は、組み込みテンプレートのいずれかを使用することです。ここでは、基盤として `mcp-server` のサンプルを使用します。

以下のコマンドを実行して、テンプレートファイルを含む `my-first-extension` という新しいディレクトリを作成します：

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

## ステップ 2: 拡張機能のファイルを理解する

新しく作成した拡張機能の主要なファイルについて確認しましょう。

### `qwen-extension.json`

これは、拡張機能のマニフェストファイルです。Qwen Code がこの拡張機能をどのように読み込み、使用するかを定義します。

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

- `name`: 拡張機能の固有の名前です。
- `version`: 拡張機能のバージョンです。
- `mcpServers`: このセクションでは、1 つ以上のモデル コンテキスト プロトコル (MCP) サーバーを定義します。MCP サーバーは、モデルが利用できる新しいツールを追加するための仕組みです。
  - `command`、`args`、`cwd`: これらのフィールドは、サーバーの起動方法を指定します。`${extensionPath}` 変数が使用されていることに注意してください。これは Qwen Code によって、拡張機能のインストール先ディレクトリへの絶対パスに置き換えられます。これにより、拡張機能はインストール場所に関係なく正常に動作します。

### `example.ts`

このファイルには、MCP サーバーのソースコードが含まれています。これは、`@modelcontextprotocol/sdk` を使用するシンプルな Node.js サーバーです。

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
    description: 'パブリック API から投稿一覧を取得します。',
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

// ... (簡潔さのため、プロンプト登録は省略)

const transport = new StdioServerTransport();
await server.connect(transport);
```

このサーバーでは、パブリック API からデータを取得する単一のツール `fetch_posts` が定義されています。

### `package.json` および `tsconfig.json`

これらは TypeScript プロジェクトの標準的な設定ファイルです。`package.json` ファイルでは依存関係と `build` スクリプトが定義され、`tsconfig.json` では TypeScript コンパイラの設定が行われます。

## ステップ 3: 拡張機能のビルドとリンク

拡張機能を使用するには、TypeScript コードをコンパイルし、ローカル開発用に Qwen Code のインストールと拡張機能をリンクする必要があります。

1.  **依存関係をインストールします:**

    ```bash
    cd my-first-extension
    npm install
    ```

2.  **サーバーをビルドします:**

    ```bash
    npm run build
    ```

    このコマンドにより、`example.ts` が `dist/example.js` にコンパイルされます。これは `qwen-extension.json` で参照されるファイルです。

3.  **拡張機能をリンクします:**

    `link` コマンドは、Qwen Code の拡張機能ディレクトリから開発ディレクトリへシンボリックリンクを作成します。これにより、変更を加えるたびに再インストールせずに即座に反映されるようになります。

    ```bash
    qwen extensions link .
    ```

これで、Qwen Code セッションを再起動してください。新しい `fetch_posts` ツールが利用可能になります。「posts を取得」などと尋ねてテストできます。

## ステップ 4: カスタムコマンドの追加

カスタムコマンドは、複雑なプロンプトに対するショートカットを作成するための仕組みです。ここでは、コード内にパターンを検索するコマンドを追加します。

1.  `commands` ディレクトリと、その中にコマンドグループ用のサブディレクトリを作成します。

    ```bash
    mkdir -p commands/fs
    ```

2.  `commands/fs/grep-code.md` という名前のファイルを作成します。

    ```markdown
    ---
    description: コード内でパターンを検索し、結果を要約する
    ---

    パターン `{{args}}` についての検索結果を要約してください。

    検索結果:
    !{grep -r {{args}} .}
    ```

    このコマンド `/fs:grep-code` は引数を受け取り、それを用いて `grep` シェルコマンドを実行し、その出力を要約用のプロンプトに渡します。

> **注意:** コマンドは、任意の YAML フロントマターを含む Markdown 形式で記述します。TOML 形式は非推奨ですが、下位互換性のため引き続きサポートされています。

ファイルを保存した後、Qwen Code を再起動してください。これで、新しいコマンド `/fs:grep-code "some pattern"` を実行できるようになります。

## ステップ 5: カスタムスキルおよびサブエージェントの追加（任意）

拡張機能は、Qwen Code の機能を拡張するためのカスタムスキルおよびサブエージェントも提供できます。

### カスタムスキルの追加

スキルとは、関連性がある場合に AI が自動的に利用できる、モデルによって呼び出される機能です。

1.  スキル用のサブディレクトリを含む `skills` ディレクトリを作成します：

    ```bash
    mkdir -p skills/code-analyzer
    ```

2.  `skills/code-analyzer/SKILL.md` ファイルを作成します：

    ```markdown
    ---
    name: code-analyzer
    description: コード構造を分析し、複雑さ、依存関係、および改善の可能性に関するインサイトを提供します
    ---

    # コードアナライザー

    ## 指示事項

    コードを分析する際は、以下の点に注目してください：

    - コードの複雑さと保守性
    - 依存関係および結合度
    - あり得るパフォーマンス上の問題
    - 改善のための提案

    ## 例

    - 「この関数の複雑さを分析してください」
    - 「このモジュールの依存関係は何ですか？」
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
    description: コードのリファクタリング、コード構造および保守性の向上に特化
    tools:
      - read_file
      - write_file
      - read_many_files
    ---

    あなたは、コード品質の向上に焦点を当てたリファクタリングの専門家です。

    あなたの専門知識には以下が含まれます：

    - コードスメルおよびアンチパターンの特定
    - SOLID原則の適用
    - コードの可読性および保守性の向上
    - リスクを最小限に抑えた安全なリファクタリング

    各リファクタリングタスクに対して：

    1. 現在のコード構造を分析する
    2. 改善が必要な箇所を特定する
    3. リファクタリングの手順を提案する
    4. 変更を段階的に実装する
    5. 機能が維持されていることを検証する
    ```

Qwen Code を再起動した後、カスタムスキルは `/skills` から、サブエージェントは `/agents manage` から利用可能になります。

## ステップ 6: カスタム `QWEN.md` ファイルの追加

`QWEN.md` ファイルを拡張機能のルートディレクトリに追加することで、モデルに永続的なコンテキストを提供できます。これにより、モデルの振る舞いに関する指示や、拡張機能が提供するツールに関する情報を与えることができます。ただし、コマンドやプロンプトを公開することを目的として作成された拡張機能では、このファイルが必要ない場合もあります。

1.  拡張機能のルートディレクトリ内に `QWEN.md` という名前のファイルを作成します。

    ```markdown
    # 私の最初の拡張機能の指示

    あなたは優れた開発者アシスタントです。ユーザーが投稿を取得するよう依頼した場合は、`fetch_posts` ツールを使用してください。応答は簡潔にしてください。
    ```

2.  CLI がこのファイルを読み込むよう、`qwen-extension.json` を更新します。

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

CLI を再度再起動してください。これで、拡張機能が有効なすべてのセッションにおいて、モデルが `QWEN.md` ファイルのコンテキストを活用できるようになります。

## ステップ 7: 拡張機能のリリース

拡張機能の開発が完了し、満足のいく状態になったら、他のユーザーと共有できます。拡張機能を公開する主な方法は、Git リポジトリ経由か GitHub Releases 経由の 2 つです。パブリックな Git リポジトリを利用する方法が最もシンプルです。

両方の方法に関する詳細な手順については、[拡張機能のリリースガイド](extension-releasing.md) を参照してください。

## まとめ

Qwen Code の拡張機能を正常に作成しました！ 以下の内容を学びました。

- テンプレートから新しい拡張機能を初期化する方法。
- MCP サーバーを用いてカスタムツールを追加する方法。
- 便利なカスタムコマンドを作成する方法。
- カスタムスキルおよびサブエージェントを追加する方法。
- モデルに対して永続的なコンテキストを提供する方法。
- ローカル開発のために拡張機能をリンクする方法。

ここからさらに高度な機能を探索し、Qwen Code に強力な新機能を追加していきましょう。