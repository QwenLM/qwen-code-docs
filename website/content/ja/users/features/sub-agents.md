---
description: "Qwen Code Sub Agents を設定し、テスト、ドキュメント、リファクタリング、レビューに専用 AI 役割を割り当てて複雑な作業を正確に進めます。"
---

# サブエージェント

サブエージェントは、Qwen Code 内で特定のタスクを処理する専門的な AI アシスタントです。タスク固有のプロンプト、ツール、動作が構成された AI エージェントに、特定の作業を委譲できます。

## サブエージェントとは

サブエージェントは、以下の特性を持つ独立した AI アシスタントです：

- **特定のタスクに特化** - 各サブエージェントは、特定の作業に焦点を当てたシステムプロンプトで構成されます
- **独立したコンテキスト** - メインチャットとは別に、独自の会話履歴を維持します
- **制御されたツールの使用** - 各サブエージェントがアクセスできるツールを構成できます
- **自律的な動作** - タスクが与えられると、完了または失敗するまで独立して作業します
- **詳細なフィードバック** - 進捗状況、ツールの使用状況、実行統計をリアルタイムで確認できます

## フォークサブエージェント（暗黙的フォーク）

名前付きサブエージェントに加え、Qwen Code は**暗黙的フォーク（implicit forking）**をサポートしています。AI が `subagent_type` パラメータを省略した場合、親の完全な会話コンテキストを継承するフォークがトリガーされます。

### フォークと名前付きサブエージェントの違い

|               | 名前付きサブエージェント                    | フォークサブエージェント                                         |
| ------------- | --------------------------------- | ----------------------------------------------------- |
| コンテキスト       | 新規開始、親の履歴なし   | 親の完全な会話履歴を継承           |
| システムプロンプト | 独自の構成済みプロンプトを使用    | 親と完全に同じシステムプロンプトを使用（キャッシュ共有用） |
| 実行     | 完了するまで親をブロック      | バックグラウンドで実行、親はすぐに続行      |
| ユースケース      | 専門的なタスク（テスト、ドキュメント） | 現在のコンテキストが必要な並列タスク          |

### フォークが使用されるタイミング

AI は以下の必要がある場合に自動的にフォークを使用します：

- 複数の調査タスクを並列で実行する場合（例：「モジュール A、B、C を調査する」）
- メインの会話を継続しながらバックグラウンド作業を実行する場合
- 現在の会話コンテキストの理解が必要なタスクを委譲する場合

### プロンプトキャッシュの共有

すべてのフォークは親と完全に同じ API リクエストプレフィックス（システムプロンプト、ツール、会話履歴）を共有するため、DashScope のプロンプトキャッシュヒットが有効になります。3 つのフォークが並列で実行される場合、共有プレフィックスは 1 回キャッシュされて再利用されるため、独立したサブエージェントと比較してトークンコストを 80% 以上削減できます。

### 再帰的フォークの防止

フォークの子プロセスは、さらにフォークを作成できません。これはランタイムで強制されます。フォークが別のフォークを生成しようとすると、タスクを直接実行するよう指示するエラーが返されます。

### 現在の制限事項

- **結果のフィードバックなし**: フォークの結果は UI の進捗表示に反映されますが、メイン会話に自動的にフィードバックされません。親 AI はプレースホルダーメッセージを表示するだけで、フォークの出力に基づいて動作することはできません。
- **ワークツリーの分離なし**: フォークは親の作業ディレクトリを共有します。複数のフォークからの同時ファイル変更は競合する可能性があります。

## 主な利点

- **タスクの特化**: 特定のワークフロー（テスト、ドキュメント作成、リファクタリングなど）に最適化されたエージェントを作成
- **コンテキストの分離**: 専門的な作業をメイン会話から分離して維持
- **コンテキストの継承**: フォークサブエージェントは、コンテキストを重視する並列タスクのために完全な会話を継承
- **プロンプトキャッシュの共有**: フォークサブエージェントは親のキャッシュプレフィックスを共有し、トークンコストを削減
- **再利用性**: エージェント構成をプロジェクトやセッション間で保存・再利用
- **アクセス制御**: セキュリティと集中力を維持するため、各エージェントが使用できるツールを制限
- **進捗の可視化**: リアルタイムの進捗更新でエージェントの実行を監視

## サブエージェントの動作原理

1. **構成**: エージェントの動作、ツール、システムプロンプトを定義するサブエージェント構成を作成
2. **委譲**: メイン AI は適切なサブエージェントにタスクを自動的に委譲するか、特定のサブエージェントタイプが必要ない場合に暗黙的にフォーク
3. **実行**: サブエージェントは構成されたツールを使用して、独立してタスクを完了
4. **結果**: 結果と実行サマリーをメイン会話に返却

## はじめに

### クイックスタート

1. **最初のサブエージェントを作成**：

   `/agents create`

   ガイド付きウィザードに従って、専門的なエージェントを作成します。

2. **既存のエージェントを管理**：

   `/agents manage`

   構成済みのサブエージェントを表示・管理します。

3. **サブエージェントの自動使用**: メイン AI に、サブエージェントの特化分野に一致するタスクの実行を依頼するだけです。AI が適切な作業を自動的に委譲します。

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

**使用方法**：`/agents create`。ガイド付きステップウィザードを通じて新しいサブエージェントを作成します。

**使用方法**：`/agents manage`。既存のサブエージェントを表示・管理するための対話型管理ダイアログを開きます。

### 保存場所

サブエージェントは複数の場所に Markdown ファイルとして保存されます：

- **プロジェクトレベル**: `.qwen/agents/`（最優先）
- **ユーザーレベル**: `~/.qwen/agents/`（フォールバック）
- **拡張機能レベル**: インストール済みの拡張機能によって提供

これにより、プロジェクト固有のエージェント、すべてのプロジェクトで動作する個人用エージェント、専門的な機能を追加する拡張機能提供のエージェントを使い分けられます。

### 拡張機能サブエージェント

拡張機能は、有効化時に利用可能になるカスタムサブエージェントを提供できます。これらのエージェントは拡張機能の `agents/` ディレクトリに保存され、個人用およびプロジェクト用エージェントと同じ形式に従います。

拡張機能サブエージェント：

- 拡張機能が有効になると自動的に検出されます
- `/agents manage` ダイアログの「Extension Agents」セクションに表示されます
- 直接編集できません（代わりに拡張機能のソースを編集してください）
- ユーザー定義エージェントと同じ構成形式に従います

どの拡張機能がサブエージェントを提供しているかを確認するには、拡張機能の `qwen-extension.json` ファイル内の `agents` フィールドを確認してください。

### ファイル形式

サブエージェントは YAML フロントマター付きの Markdown ファイルで構成されます。この形式は人間が読みやすく、任意のテキストエディタで簡単に編集できます。

#### 基本構造

```
---
name: agent-name
description: Brief description of when and how to use this agent
model: inherit # Optional: inherit or model-id
approvalMode: auto-edit # Optional: default, plan, auto-edit, yolo
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

- `inherit`: メイン会話と同じモデルを使用
- フィールドを省略: `inherit` と同じ
- `glm-5`: メイン会話の認証タイプを使用して、そのモデル ID を使用
- `openai:gpt-4o`: 別のプロバイダーを使用（環境変数から認証情報を解決）

#### 権限モード

オプションの `approvalMode` フロントマターフィールドを使用して、サブエージェントのツール呼び出しの承認方法を制御します。有効な値：

- `default`: ツールには対話型の承認が必要（メインセッションのデフォルトと同じ）
- `plan`: 分析専用モード — エージェントは計画を立てますが、変更は実行しません
- `auto-edit`: ツールはプロンプトなしで自動承認されます（ほとんどのエージェントに推奨）
- `yolo`: 潜在的に破壊的なものを含むすべてのツールが自動承認されます

このフィールドを省略した場合、サブエージェントの権限モードは自動的に決定されます：

- 親セッションが **yolo** または **auto-edit** モードの場合、サブエージェントはそのモードを継承します。権限の広い親は権限の広いままです。
- 親セッションが **plan** モードの場合、サブエージェントは plan モードのままです。分析専用セッションは、委譲されたエージェントを通じてファイルを変更できません。
- 親セッションが **default** モード（信頼されたフォルダ内）の場合、サブエージェントは自律的に作業できるよう **auto-edit** が適用されます。

`approvalMode` を設定した場合でも、親の権限の広いモードが優先されます。例えば、親が yolo モードの場合、`approvalMode: plan` のサブエージェントも yolo モードで実行されます。

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

#### ツールの構成

`tools` と `disallowedTools` を使用して、サブエージェントがアクセスできるツールを制御します。

**`tools`（許可リスト）**: 指定すると、サブエージェントはリストされたツールのみを使用できます。省略すると、サブエージェントは親セッションから利用可能なすべてのツールを継承します。

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

**`disallowedTools`（ブロックリスト）**: 指定すると、リストされたツールがサブエージェントのツールプールから削除されます。許可するツールをすべて列挙せずに「X 以外すべて」を指定したい場合に便利です。

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

`tools` と `disallowedTools` の両方が設定されている場合、まず許可リストが適用され、その後ブロックリストがそのセットから削除します。

**MCP ツール**も同じルールに従います。サブエージェントに `tools` リストがない場合、親セッションからすべての MCP ツールを継承します。明示的な `tools` リストがある場合、そのリストに明示的に記載されている MCP ツールのみが取得されます。

`disallowedTools` フィールドは MCP サーバーレベルのパターンをサポートします：

- `mcp__server__tool_name` — 特定の MCP ツールをブロック
- `mcp__server` — その MCP サーバーからのすべてのツールをブロック

```
---
name: no-slack
description: Agent without Slack access
disallowedTools:
  - mcp__slack
---
```

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

## サブエージェントの効果的な使用方法

### 自動委譲

Qwen Code は以下の情報に基づいてタスクを積極的に委譲します：

- リクエスト内のタスク説明
- サブエージェント構成内の description フィールド
- 現在のコンテキストと利用可能なツール

サブエージェントのより積極的な使用を促すには、description フィールドに「use PROACTIVELY」や「MUST BE USED」などのフレーズを含めます。

### 明示的な呼び出し

コマンド内で特定のサブエージェントに言及してリクエストします：

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

**ユースケース：**

- 「認証サービスのユニットテストを作成する」
- 「支払い処理ワークフローの結合テストを作成する」
- 「データ検証モジュールのエッジケースに対するテストカバレッジを追加する」

#### ドキュメント作成者

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

**ユースケース：**

- 「ユーザー管理エンドポイントの API ドキュメントを作成する」
- 「このプロジェクトの包括的な README を作成する」
- 「トラブルシューティング手順を含むデプロイプロセスを文書化する」

#### コードレビュアー

コードの品質、セキュリティ、ベストプラクティスに焦点を当てています。

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

**ユースケース：**

- 「この認証実装のセキュリティ問題を確認する」
- 「このデータベースクエリロジックのパフォーマンスへの影響を確認する」
- 「コード構造を評価し、改善点を提案する」

### テクノロジー固有のエージェント

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

**ユースケース：**

- 「ソートとフィルタリング機能付きの再利用可能なデータテーブルコンポーネントを作成する」
- 「キャッシュ機能付きの API データ取得用カスタムフックを実装する」
- 「このクラスコンポーネントを最新の React パターンを使用してリファクタリングする」

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

**ユースケース：**

- 「JWT トークンを使用したユーザー認証用の FastAPI サービスを作成する」
- 「pandas とエラー処理を使用したデータ処理パイプラインを実装する」
- 「包括的なヘルプドキュメント付きの argparse を使用した CLI ツールを作成する」

## ベストプラクティス

### 設計原則

#### 単一責任の原則

各サブエージェントは明確で焦点を絞った目的を持つべきです。

**✅ 良い例：**

```
---
name: testing-expert
description: Writes comprehensive unit tests and integration tests
---
```

**❌ 避けるべき例：**

```
---
name: general-helper
description: Helps with testing, documentation, code review, and deployment
---
```

**理由:** 焦点を絞ったエージェントはより良い結果を生み出し、保守が容易です。

#### 明確な特化分野

広範な能力ではなく、特定の専門分野を定義します。

**✅ 良い例：**

```
---
name: react-performance-optimizer
description: Optimizes React applications for performance using profiling and best practices
---
```

**❌ 避けるべき例：**

```
---
name: frontend-developer
description: Works on frontend development tasks
---
```

**理由:** 特定の専門知識により、より的を絞った効果的な支援が可能になります。

#### 具体的な説明

エージェントを使用するタイミングが明確にわかる説明を記述します。

**✅ 良い例：**

```
description: Reviews code for security vulnerabilities, performance issues, and maintainability concerns
```

**❌ 避けるべき例：**

```
description: A helpful code reviewer
```

**理由:** 明確な説明は、メイン AI が各タスクに適切なエージェントを選択するのに役立ちます。

### 構成のベストプラクティス

#### システムプロンプトのガイドライン

**専門知識を具体的に記述する：**

```
You are a Python testing specialist with expertise in:

- pytest framework and fixtures
- Mock objects and dependency injection
- Test-driven development practices
- Performance testing with pytest-benchmark
```

**段階的なアプローチを含める：**

```
For each testing task:

1. Analyze the code structure and dependencies
2. Identify key functionality and edge cases
3. Create comprehensive test suites with clear naming
4. Include setup/teardown and proper assertions
5. Add comments explaining complex test scenarios
```

**出力基準を指定する：**

```
Always follow these standards:

- Use descriptive test names that explain the scenario
- Include both positive and negative test cases
- Add docstrings for complex test functions
- Ensure tests are independent and can run in any order
```

## セキュリティに関する考慮事項

- **ツールの制限**: `tools` を使用してサブエージェントがアクセスできるツールを制限するか、`disallowedTools` を使用して特定のツールをブロックしつつ他のすべてを継承
- **権限モード**: サブエージェントはデフォルトで親の権限モードを継承します。plan モードのセッションは、委譲されたエージェントを通じて auto-edit にエスカレートできません。特権モード（auto-edit、yolo）は信頼されていないフォルダではブロックされます。
- **サンドボックス化**: すべてのツール実行は、直接ツール使用時と同じセキュリティモデルに従います
- **監査証跡**: すべてのサブエージェントのアクションはログに記録され、リアルタイムで確認できます
- **アクセス制御**: プロジェクトレベルとユーザーレベルの分離により、適切な境界が提供されます
- **機密情報**: エージェント構成にシークレットや認証情報を含めないでください
- **本番環境**: 本番環境と開発環境でエージェントを分離することを検討してください

## 制限

サブエージェント構成には以下のソフト警告が適用されます（ハード制限は適用されません）：

- **Description フィールド**: 説明が 1,000 文字を超えると警告が表示されます
- **システムプロンプト**: システムプロンプトが 10,000 文字を超えると警告が表示されます