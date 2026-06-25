# サブエージェント

サブエージェントは、Qwen Code 内で特定の種類のタスクを処理する専門的な AI アシスタントです。タスク固有のプロンプト、ツール、動作で構成された AI エージェントに、集中した作業を委任できます。

## サブエージェントとは

サブエージェントは独立した AI アシスタントであり、以下の特性を持ちます：

- **特定タスクへの特化** - 各サブエージェントは特定の作業に向けたフォーカスされたシステムプロンプトで構成されています
- **独立したコンテキスト** - メインチャットとは別に、独自の会話履歴を保持します
- **制御されたツール** - 各サブエージェントがアクセスできるツールを設定できます
- **自律的な動作** - タスクが与えられると、完了または失敗するまで独立して動作します
- **詳細なフィードバック** - 進捗、ツール使用状況、実行統計をリアルタイムで確認できます

## フォークサブエージェント

名前付きサブエージェントに加えて、Qwen Code は**フォーク**をサポートしています。これは `subagent_type: "fork"` で明示的に選択します（インタラクティブセッションで利用可能）。フォークは親の会話コンテキストをすべて継承し、バックグラウンドで独立して実行されます。`subagent_type` を省略した場合はフォークではなく、汎用サブエージェントが起動し、完了後にインラインで結果を返します。

### 名前付きサブエージェントとの違い

|               | 名前付きサブエージェント                | フォークサブエージェント                                    |
| ------------- | --------------------------------- | ----------------------------------------------------- |
| コンテキスト       | 新規開始（親の履歴なし）   | 親の会話履歴をすべて継承           |
| システムプロンプト | 独自に設定されたプロンプトを使用    | 親のシステムプロンプトをそのまま使用（キャッシュ共有のため） |
| 実行     | 完了まで親をブロック      | バックグラウンド実行、親はすぐに処理を継続      |
| ユースケース      | 専門タスク（テスト、ドキュメントなど） | 現在のコンテキストが必要な並行タスク          |

### フォークが使われる場面

AI は以下の場合に自動的にフォークを使用します：

- 複数の調査タスクを並行して実行する場合（例：「モジュール A、B、C を調査する」）
- メインの会話を続けながらバックグラウンドで作業を行う場合
- 現在の会話コンテキストの理解が必要なタスクを委任する場合

### プロンプトキャッシュの共有

すべてのフォークは親の API リクエストのプレフィックス（システムプロンプト、ツール、会話履歴）を共有するため、DashScope のプロンプトキャッシュヒットが有効になります。3 つのフォークが並行して実行される場合、共有プレフィックスは一度キャッシュされ再利用されるため、独立したサブエージェントに比べてトークンコストを 80% 以上削減できます。

### 再帰フォークの防止

フォークの子は、さらにフォークを作成できません。これはランタイムで強制されており、フォークが別のフォークを生成しようとすると、タスクを直接実行するよう指示するエラーが返されます。

### 現在の制限事項

- **結果のフィードバックなし**: フォークの結果は UI の進捗表示に反映されますが、メインの会話には自動的に戻されません。親 AI はプレースホルダーメッセージを受け取り、フォークの出力に基づいて行動することはできません。
- **ワークツリーの分離なし**: フォークは親の作業ディレクトリを共有します。複数のフォークからの同時ファイル変更が競合する可能性があります。

## 主なメリット

- **タスクの特化**: 特定のワークフロー（テスト、ドキュメント、リファクタリングなど）に最適化されたエージェントを作成できます
- **コンテキストの分離**: 専門的な作業をメインの会話から切り離せます
- **コンテキストの継承**: フォークサブエージェントは、コンテキストが重要な並行タスクのために会話全体を継承します
- **プロンプトキャッシュの共有**: フォークサブエージェントは親のキャッシュプレフィックスを共有し、トークンコストを削減します
- **再利用性**: エージェントの設定をプロジェクトやセッションをまたいで保存・再利用できます
- **制御されたアクセス**: セキュリティとフォーカスのために、各エージェントが使用できるツールを制限できます
- **進捗の可視性**: リアルタイムの進捗更新でエージェントの実行を監視できます

## サブエージェントの仕組み

1. **設定**: サブエージェントの動作、ツール、システムプロンプトを定義する設定を作成します
2. **委任**: メイン AI は適切なサブエージェントにタスクを自動的に委任するか、会話コンテキストを継承して中間出力を破棄したい場合は自分自身をフォーク（`subagent_type: "fork"`）します
3. **実行**: サブエージェントは設定されたツールを使用して、独立してタスクを完了します
4. **結果**: 結果と実行サマリーをメインの会話に返します

## はじめに

### クイックスタート

1. **最初のサブエージェントを作成する**：

   `/agents create`

   ガイド付きウィザードに従って専門エージェントを作成します。

2. **既存のエージェントを管理する**：

   `/agents manage`

   設定済みのサブエージェントを表示・管理します。

3. **サブエージェントを自動的に使用する**: メイン AI に対して、サブエージェントの専門領域に合致するタスクを依頼するだけです。AI が適切な作業を自動的に委任します。

### 使用例

```
User: "Please write comprehensive tests for the authentication module"
AI: I'll delegate this to your testing specialist Subagents.
[Delegates to "testing-expert" Subagents]
[Shows real-time progress of test creation]
[Returns with completed test files and execution summary]`
```

## 管理

### CLI コマンド

サブエージェントは `/agents` スラッシュコマンドとそのサブコマンドで管理します：

**Usage:**：`/agents create`。ガイド付きのステップウィザードで新しいサブエージェントを作成します。

**Usage:**：`/agents manage`。既存のサブエージェントを表示・管理するインタラクティブな管理ダイアログを開きます。

### 保存場所

サブエージェントは複数の場所に Markdown ファイルとして保存されます：

- **プロジェクトレベル**: `.qwen/agents/`（最優先）
- **ユーザーレベル**: `~/.qwen/agents/`（フォールバック）
- **拡張機能レベル**: インストール済みの拡張機能が提供するもの

これにより、プロジェクト固有のエージェント、すべてのプロジェクトで使える個人エージェント、専門的な機能を追加する拡張機能提供のエージェントを使い分けられます。

### 拡張機能サブエージェント

拡張機能は、有効化されると利用可能になるカスタムサブエージェントを提供できます。これらのエージェントは拡張機能の `agents/` ディレクトリに保存され、個人エージェントやプロジェクトエージェントと同じ形式に従います。

拡張機能サブエージェントの特性：

- 拡張機能が有効化されると自動的に検出される
- `/agents manage` ダイアログの「Extension Agents」セクションに表示される
- 直接編集できない（拡張機能のソースを編集すること）
- ユーザー定義エージェントと同じ設定形式に従う

どの拡張機能がサブエージェントを提供しているかは、拡張機能の `qwen-extension.json` ファイルの `agents` フィールドを確認してください。

### ファイル形式

サブエージェントは YAML フロントマターを持つ Markdown ファイルで設定します。この形式は人が読みやすく、任意のテキストエディタで編集できます。

#### 基本構造

```
---
name: agent-name
description: Brief description of when and how to use this agent
model: inherit # Optional: inherit, fast, modelId, or authType:modelId
approvalMode: auto-edit # Optional: default, plan, auto-edit, yolo, bubble
tools:         # Optional: allowlist of tools
  - tool1
  - tool2
disallowedTools: # Optional: blocklist of tools
  - tool3
---

System prompt content goes here.
Multiple paragraphs are supported.
```

#### モデルの選択

オプションの `model` フロントマターフィールドを使用して、サブエージェントが使用するモデルを制御します：

- `inherit`: メインの会話と同じモデルを使用します。
- フィールドを省略: `inherit` と同じです。
- `fast`: 設定された `fastModel` を使用します。有効なファストモデルが設定されていない場合、サブエージェントは `inherit` にフォールバックします。
- `glm-5`: そのモデル ID を使用します。Qwen Code はまずメイン会話の認証タイプを確認し、そこでモデルが利用できない場合は別の設定済みプロバイダーからモデルを解決します。
- `openai:gpt-4o`: 明示的なプロバイダーとモデル ID を使用します。サブエージェントをメイン会話とは異なる認証タイプのモデルで実行する場合に便利です。

例：

```
---
name: fast-reviewer
description: Reviews small diffs with the configured fast model
model: fast
tools:
  - read_file
  - grep_search
---
```

```
---
name: openai-researcher
description: Uses an OpenAI-compatible provider for research tasks
model: openai:gpt-4o
tools:
  - read_file
  - grep_search
  - glob
---
```

`fast` セレクターは `settings.json` または `/model --fast` で設定した `fastModel` 設定を使用します。その設定自体が `openai:deepseek-v4-flash` のような別の認証タイプのモデルを参照している場合があります。セレクターが別の認証タイプに解決される場合、Qwen Code はそのサブエージェントリクエスト専用のランタイムプロバイダーを作成し、そのプロバイダーにはモデル ID のみを送信します。

#### 権限モード

オプションの `approvalMode` フロントマターフィールドを使用して、サブエージェントのツール呼び出しの承認方法を制御します。有効な値：

- `default`: ツールはインタラクティブな承認が必要（メインセッションのデフォルトと同じ）
- `plan`: 分析専用モード — エージェントは計画するが変更は実行しない
- `auto-edit`: ツールはプロンプトなしで自動承認（ほとんどのエージェントに推奨）
- `yolo`: 破壊的な可能性があるものを含む、すべてのツールが自動承認
- `bubble`: バックグラウンドエージェントのツール承認が親セッションに表示される

このフィールドを省略した場合、サブエージェントの権限モードは自動的に決定されます：

- 親セッションが **yolo** または **auto-edit** モードの場合、サブエージェントはそのモードを継承します。許可的な親は許可的なままです。
- 親セッションが **plan** モードの場合、サブエージェントは plan モードを維持します。分析専用セッションは委任されたエージェントを通じてファイルを変更できません。
- 親セッションが（信頼されたフォルダーで）**default** モードの場合、サブエージェントは自律的に動作できるよう **auto-edit** が設定されます。

`approvalMode` を設定した場合でも、親の許可的なモードが優先されます。例えば、親が yolo モードの場合、`approvalMode: plan` のサブエージェントも yolo モードで実行されます。

```
---
name: cautious-reviewer
description: Reviews code without making changes
approvalMode: plan
tools:
  - read_file
  - grep_search
  - glob
---

You are a code reviewer. Analyze the code and report findings.
Do not modify any files.
```

#### ツールの設定

`tools` と `disallowedTools` を使用して、サブエージェントがアクセスできるツールを制御します。

**`tools`（許可リスト）:** 指定した場合、サブエージェントはリストされたツールのみ使用できます。省略した場合、サブエージェントは親セッションの利用可能なすべてのツールを継承します。

```
---
name: reader
description: Read-only agent for code exploration
tools:
  - read_file
  - grep_search
  - glob
  - list_directory
---
```

**`disallowedTools`（ブロックリスト）:** 指定した場合、リストされたツールはサブエージェントのツールプールから除外されます。すべての許可ツールを列挙せずに「X 以外すべて」としたい場合に便利です。

```
---
name: safe-worker
description: Agent that cannot modify files
disallowedTools:
  - write_file
  - edit
  - run_shell_command
---
```

`tools` と `disallowedTools` の両方が設定されている場合、まず許可リストが適用され、その後ブロックリストがそのセットから除外します。

**MCP ツール**も同じルールに従います。サブエージェントに `tools` リストがない場合、親セッションのすべての MCP ツールを継承します。サブエージェントに明示的な `tools` リストがある場合、そのリストに明示的に記載されている MCP ツールのみを取得します。

`disallowedTools` フィールドは MCP サーバーレベルのパターンをサポートします：

- `mcp__server__tool_name` — 特定の MCP ツールをブロック
- `mcp__server` — その MCP サーバーのすべてのツールをブロック

```
---
name: no-slack
description: Agent without Slack access
disallowedTools:
  - mcp__slack
---
```

#### Claude Code 互換フィールド

Qwen Code は以下の Claude Code 2.1.168 フロントマターフィールドを受け入れます。CC エージェントファイルを `.qwen/agents/` にドロップするだけで、サポートされているフィールドが同様に解析されます。無効な値を持つオプションフィールドは、拒否されるのではなく解析時に黙って破棄されます — CC と同じ寛容な動作です。

| フィールド            | 型             | 備考                                                                                                                                                                                                                                                                            |
| ---------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `permissionMode` | enum string      | `acceptEdits`、`auto`、`bypassPermissions`、`default`、`dontAsk`、`plan`。解析時に `approvalMode` にマッピングされます。両方が設定されている場合、明示的な `approvalMode` が優先されます。                                                                                                           |
| `maxTurns`       | positive integer | エージェントのターン予算を制限します。実行時に `runConfig.max_turns` に接続されます。両方が設定されている場合、トップレベルのフィールドが優先されます。レガシーのネストされた値は、2 つの情報源を避けるために保存時にディスク上のファイルから削除されます。                                                           |
| `color`          | enum string      | 表示色。許可リスト: `red`、`blue`、`green`、`yellow`、`purple`、`orange`、`pink`、`cyan`（CC の `_Y` に対応）。レガシーの qwen センチネル `auto` は後方互換性のために保持されます。その他の値は解析時に黙って破棄されます。                                                                         |
| `mcpServers`     | record of specs  | エージェントごとの MCP サーバーオーバーライド。エージェント起動時にセッションレベルの MCP サーバーセットとマージされます。キーが衝突した場合、エージェントの仕様が優先されます（CC の `scope: 'agent'` セマンティクスに一致）。不正なエントリはエージェント全体を失敗させず、キーごとに警告付きで破棄されます。 |
| `hooks`          | record of arrays | エージェントごとのフック。キーは CC フックイベント名（`PreToolUse`、`PostToolUse`、`UserPromptSubmit` など）で、値は `settings.json` の `hooks` フィールドと同じ形式の `{ matcher?, hooks: [...] }` 定義の配列です。エージェント実行中に登録され、停止時に削除されます。  |

上記すべてを含む例：

```
---
name: rigorous-reviewer
description: Deep code review with a turn cap
permissionMode: plan
maxTurns: 50
color: cyan
tools:
  - read_file
  - grep_search
  - glob
mcpServers:
  filesystem:
    type: stdio
    command: node
    args: [/usr/local/lib/mcp-fs/server.js]
hooks:
  PreToolUse:
    - matcher: Bash
      hooks:
        - type: command
          command: echo "review-agent about to run a shell command"
---

You are a code reviewer. Analyze the code thoroughly and report findings
ordered by severity.
```

残りの CC フロントマターフィールド — `effort`、`skills`、`initialPrompt`、`memory`、`isolation` — は宣言的エージェント設計ドキュメントに記載されており、前提インフラが整い次第フォローアップ PR でリリースされます（`effort` はモデル層のパラメーターが必要、`memory` はスコープ付きメモリサブシステムが必要、`--agent` CLI フラグが `initialPrompt` を有効化するなど）。

> **`hooks` v1 の制限事項。** サブエージェントが `hooks` を宣言して実行中の間、そのフックエントリはそのサブエージェント自身のツール呼び出しだけでなく、セッション内のすべての一致するイベントに対して発火します。異なるエージェントごとのフックセットを持つ 2 つのサブエージェントが同時に実行される場合、両方のセットが両方のエージェントに対して発火します。フック発火時のエージェントごとのスコープフィルタリングはフォローアップに委ねられています。v1 では、エージェントの実行期間中グローバルに発火しても安全なエージェントごとのフック（ロギングなど）を、動作を変更するフックよりも優先してください。

#### 使用例

```
---
name: project-documenter
description: Creates project documentation and README files
---

You are a documentation specialist.

Focus on creating clear, comprehensive documentation that helps both
new contributors and end users understand the project.
```

## サブエージェントの効果的な活用

### 自動委任

Qwen Code は以下に基づいてタスクを積極的に委任します：

- リクエスト内のタスクの説明
- サブエージェント設定の description フィールド
- 現在のコンテキストと利用可能なツール

より積極的なサブエージェントの使用を促すには、description フィールドに「use PROACTIVELY」や「MUST BE USED」などのフレーズを含めてください。

### 明示的な呼び出し

コマンドで特定のサブエージェントを名指しして要求できます：

```
Let the testing-expert Subagents create unit tests for the payment module
Have the documentation-writer Subagents update the API reference
Get the react-specialist Subagents to optimize this component's performance
```

## 例

### 開発ワークフローエージェント

#### テストスペシャリスト

包括的なテスト作成とテスト駆動開発に最適です。

```
---
name: testing-expert
description: Writes comprehensive unit tests, integration tests, and handles test automation with best practices
tools:
  - read_file
  - write_file
  - read_many_files
  - run_shell_command
---

You are a testing specialist focused on creating high-quality, maintainable tests.

Your expertise includes:

- Unit testing with appropriate mocking and isolation
- Integration testing for component interactions
- Test-driven development practices
- Edge case identification and comprehensive coverage
- Performance and load testing when appropriate

For each testing task:

1. Analyze the code structure and dependencies
2. Identify key functionality, edge cases, and error conditions
3. Create comprehensive test suites with descriptive names
4. Include proper setup/teardown and meaningful assertions
5. Add comments explaining complex test scenarios
6. Ensure tests are maintainable and follow DRY principles

Always follow testing best practices for the detected language and framework.
Focus on both positive and negative test cases.
```

**ユースケース:**

- 「認証サービスのユニットテストを書いてください」
- 「決済処理ワークフローの統合テストを作成してください」
- 「データバリデーションモジュールのエッジケースのテストカバレッジを追加してください」

#### ドキュメントライター

明確で包括的なドキュメントの作成に特化しています。

```
---
name: documentation-writer
description: Creates comprehensive documentation, README files, API docs, and user guides
tools:
  - read_file
  - write_file
  - read_many_files
---

You are a technical documentation specialist.

Your role is to create clear, comprehensive documentation that serves both
developers and end users. Focus on:

**For API Documentation:**

- Clear endpoint descriptions with examples
- Parameter details with types and constraints
- Response format documentation
- Error code explanations
- Authentication requirements

**For User Documentation:**

- Step-by-step instructions with screenshots when helpful
- Installation and setup guides
- Configuration options and examples
- Troubleshooting sections for common issues
- FAQ sections based on common user questions

**For Developer Documentation:**

- Architecture overviews and design decisions
- Code examples that actually work
- Contributing guidelines
- Development environment setup

Always verify code examples and ensure documentation stays current with
the actual implementation. Use clear headings, bullet points, and examples.
```

**ユースケース:**

- 「ユーザー管理エンドポイントの API ドキュメントを作成してください」
- 「このプロジェクトの包括的な README を書いてください」
- 「トラブルシューティング手順を含むデプロイプロセスをドキュメント化してください」

#### コードレビュアー

コード品質、セキュリティ、ベストプラクティスに焦点を当てています。

```
---
name: code-reviewer
description: Reviews code for best practices, security issues, performance, and maintainability
tools:
  - read_file
  - read_many_files
---

You are an experienced code reviewer focused on quality, security, and maintainability.

Review criteria:

- **Code Structure**: Organization, modularity, and separation of concerns
- **Performance**: Algorithmic efficiency and resource usage
- **Security**: Vulnerability assessment and secure coding practices
- **Best Practices**: Language/framework-specific conventions
- **Error Handling**: Proper exception handling and edge case coverage
- **Readability**: Clear naming, comments, and code organization
- **Testing**: Test coverage and testability considerations

Provide constructive feedback with:

1. **Critical Issues**: Security vulnerabilities, major bugs
2. **Important Improvements**: Performance issues, design problems
3. **Minor Suggestions**: Style improvements, refactoring opportunities
4. **Positive Feedback**: Well-implemented patterns and good practices

Focus on actionable feedback with specific examples and suggested solutions.
Prioritize issues by impact and provide rationale for recommendations.
```

**ユースケース:**

- 「この認証実装のセキュリティ問題をレビューしてください」
- 「このデータベースクエリロジックのパフォーマンスへの影響を確認してください」
- 「コード構造を評価して改善点を提案してください」

### 技術特化エージェント

#### React スペシャリスト

React 開発、フック、コンポーネントパターンに最適化されています。

```
---
name: react-specialist
description: Expert in React development, hooks, component patterns, and modern React best practices
tools:
  - read_file
  - write_file
  - read_many_files
  - run_shell_command
---

You are a React specialist with deep expertise in modern React development.

Your expertise covers:

- **Component Design**: Functional components, custom hooks, composition patterns
- **State Management**: useState, useReducer, Context API, and external libraries
- **Performance**: React.memo, useMemo, useCallback, code splitting
- **Testing**: React Testing Library, Jest, component testing strategies
- **TypeScript Integration**: Proper typing for props, hooks, and components
- **Modern Patterns**: Suspense, Error Boundaries, Concurrent Features

For React tasks:

1. Use functional components and hooks by default
2. Implement proper TypeScript typing
3. Follow React best practices and conventions
4. Consider performance implications
5. Include appropriate error handling
6. Write testable, maintainable code

Always stay current with React best practices and avoid deprecated patterns.
Focus on accessibility and user experience considerations.
```

**ユースケース:**

- 「ソートとフィルタリング機能付きの再利用可能なデータテーブルコンポーネントを作成してください」
- 「キャッシュ付き API データフェッチのカスタムフックを実装してください」
- 「このクラスコンポーネントをモダンな React パターンにリファクタリングしてください」

#### Python エキスパート

Python 開発、フレームワーク、ベストプラクティスに特化しています。

```
---
name: python-expert
description: Expert in Python development, frameworks, testing, and Python-specific best practices
tools:
  - read_file
  - write_file
  - read_many_files
  - run_shell_command
---

You are a Python expert with deep knowledge of the Python ecosystem.

Your expertise includes:

- **Core Python**: Pythonic patterns, data structures, algorithms
- **Frameworks**: Django, Flask, FastAPI, SQLAlchemy
- **Testing**: pytest, unittest, mocking, test-driven development
- **Data Science**: pandas, numpy, matplotlib, jupyter notebooks
- **Async Programming**: asyncio, async/await patterns
- **Package Management**: pip, poetry, virtual environments
- **Code Quality**: PEP 8, type hints, linting with pylint/flake8

For Python tasks:

1. Follow PEP 8 style guidelines
2. Use type hints for better code documentation
3. Implement proper error handling with specific exceptions
4. Write comprehensive docstrings
5. Consider performance and memory usage
6. Include appropriate logging
7. Write testable, modular code

Focus on writing clean, maintainable Python code that follows community standards.
```

**ユースケース:**

- 「JWT トークンを使ったユーザー認証の FastAPI サービスを作成してください」
- 「pandas を使ったエラーハンドリング付きのデータ処理パイプラインを実装してください」
- 「包括的なヘルプドキュメント付きの argparse を使った CLI ツールを書いてください」

## ベストプラクティス

### 設計原則

#### 単一責任の原則

各サブエージェントには明確でフォーカスされた目的を持たせてください。

**✅ 良い例:**

```
---
name: testing-expert
description: Writes comprehensive unit tests and integration tests
---
```

**❌ 避けるべき例:**

```
---
name: general-helper
description: Helps with testing, documentation, code review, and deployment
---
```

**理由:** フォーカスされたエージェントはより良い結果を生み出し、保守しやすいです。

#### 明確な専門化

広範な能力ではなく、特定の専門領域を定義してください。

**✅ 良い例:**

```
---
name: react-performance-optimizer
description: Optimizes React applications for performance using profiling and best practices
---
```

**❌ 避けるべき例:**

```
---
name: frontend-developer
description: Works on frontend development tasks
---
```

**理由:** 具体的な専門知識はより的を絞った効果的な支援につながります。

#### 実行可能な説明

エージェントをいつ使用するかを明確に示す説明を書いてください。

**✅ 良い例:**

```
description: Reviews code for security vulnerabilities, performance issues, and maintainability concerns
```

**❌ 避けるべき例:**

```
description: A helpful code reviewer
```

**理由:** 明確な説明は、メイン AI が各タスクに適切なエージェントを選択するのに役立ちます。

### 設定のベストプラクティス

#### システムプロンプトのガイドライン

**専門知識を具体的に記述する:**

```
You are a Python testing specialist with expertise in:

- pytest framework and fixtures
- Mock objects and dependency injection
- Test-driven development practices
- Performance testing with pytest-benchmark
```

**ステップバイステップのアプローチを含める:**

```
For each testing task:

1. Analyze the code structure and dependencies
2. Identify key functionality and edge cases
3. Create comprehensive test suites with clear naming
4. Include setup/teardown and proper assertions
5. Add comments explaining complex test scenarios
```

**出力基準を指定する:**

```
Always follow these standards:

- Use descriptive test names that explain the scenario
- Include both positive and negative test cases
- Add docstrings for complex test functions
- Ensure tests are independent and can run in any order
```

## セキュリティに関する考慮事項

- **ツール制限**: `tools` を使用してサブエージェントがアクセスできるツールを制限するか、`disallowedTools` を使用して特定のツールをブロックしながら他のすべてを継承できます
- **権限モード**: サブエージェントはデフォルトで親の権限モードを継承します。plan モードのセッションは委任されたエージェントを通じて auto-edit にエスカレートできません。特権モード（auto-edit、yolo）は信頼されていないフォルダーではブロックされます。
- **プロバイダーの選択**: `model: authType:modelId` または `fastModel` が別の認証タイプに解決される `model: fast` を持つサブエージェントは、そのサブエージェントのモデルリクエストを選択したプロバイダーに送信します。そのプロバイダーがサブエージェントのタスクとデータに適切であることを確認してください。
- **サンドボックス化**: すべてのツール実行は直接ツール使用と同じセキュリティモデルに従います
- **監査証跡**: すべてのサブエージェントのアクションはリアルタイムでログに記録され、表示されます
- **アクセス制御**: プロジェクトレベルとユーザーレベルの分離により適切な境界を提供します
- **機密情報**: エージェント設定にシークレットや認証情報を含めないようにしてください
- **本番環境**: 本番環境と開発環境で別々のエージェントの使用を検討してください

## 制限事項

サブエージェント設定には以下のソフト警告が適用されます（ハードリミットは適用されません）：

- **Description フィールド**: 1,000 文字を超える説明には警告が表示されます
- **システムプロンプト**: 10,000 文字を超えるシステムプロンプトには警告が表示されます
