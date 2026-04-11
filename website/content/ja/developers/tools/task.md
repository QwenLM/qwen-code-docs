# Task ツール (`task`)

このドキュメントでは、Qwen Code の `task` ツールについて説明します。

## 概要

`task` を使用して、複雑なマルチステップタスクを自律的に処理する専門のサブエージェントを起動します。Task ツールは、独自のツールセットにアクセスして独立して動作できる専門エージェントに作業を委譲し、タスクの並列実行と専門的な知識の活用を可能にします。

### 引数

`task` は以下の引数を受け取ります：

- `description`（文字列、必須）：ユーザーの可視性と追跡を目的とした、タスクの短い説明（3〜5語程度）。
- `prompt`（文字列、必須）：サブエージェントが実行するための詳細なタスクプロンプト。自律実行に必要な包括的な指示を含める必要があります。
- `subagent_type`（文字列、必須）：このタスクに使用する専門エージェントのタイプ。設定済みの利用可能なサブエージェントのいずれかと一致している必要があります。

## Qwen Code での `task` の使用方法

Task ツールは設定から利用可能なサブエージェントを動的に読み込み、タスクを委譲します。各サブエージェントは独立して実行され、独自のツールセットを使用できるため、専門的な知識の活用と並列実行が可能になります。

Task ツールを使用すると、サブエージェントは以下の動作を行います：

1. タスクプロンプトを完全に自律的に受け取る
2. 利用可能なツールを使用してタスクを実行する
3. 最終結果メッセージを返す
4. 終了する（サブエージェントはステートレスで使い捨て）

使用例：

```
task(description="Brief task description", prompt="Detailed task instructions for the subagent", subagent_type="agent_name")
```

## 利用可能なサブエージェント

利用可能なサブエージェントは設定によって異なります。一般的なサブエージェントのタイプには以下が含まれます：

- **general-purpose**：様々なツールを必要とする複雑なマルチステップタスク用
- **code-reviewer**：コード品質のレビューと分析用
- **test-runner**：テストの実行と結果の分析用
- **documentation-writer**：ドキュメントの作成と更新用

Qwen Code で `/agents` コマンドを使用すると、利用可能なサブエージェントを確認できます。

## Task ツールの機能

### リアルタイムの進捗更新

Task ツールは以下の情報をライブで表示します：

- サブエージェントの実行ステータス
- サブエージェントによる個別のツール呼び出し
- ツール呼び出しの結果および発生したエラー
- タスク全体の進捗と完了ステータス

### 並列実行

1つのメッセージ内で Task ツールを複数回呼び出すことで、複数のサブエージェントを同時に起動でき、タスクの並列実行と効率の向上が可能になります。

### 専門的な知識

各サブエージェントには以下の設定が可能です：

- 特定のツールへのアクセス権限
- 専門的なシステムプロンプトと指示
- カスタムモデル設定
- ドメイン固有の知識と機能

## `task` の使用例

### general-purpose エージェントへの委譲

```
task(
  description="Code refactoring",
  prompt="Please refactor the authentication module in src/auth/ to use modern async/await patterns instead of callbacks. Ensure all tests still pass and update any related documentation.",
  subagent_type="general-purpose"
)
```

### 並列タスクの実行

```
# Launch code review and test execution in parallel
task(
  description="Code review",
  prompt="Review the recent changes in the user management module for code quality, security issues, and best practices compliance.",
  subagent_type="code-reviewer"
)

task(
  description="Run tests",
  prompt="Execute the full test suite and analyze any failures. Provide a summary of test coverage and recommendations for improvement.",
  subagent_type="test-runner"
)
```

### ドキュメントの生成

```
task(
  description="Update docs",
  prompt="Generate comprehensive API documentation for the newly implemented REST endpoints in the orders module. Include request/response examples and error codes.",
  subagent_type="documentation-writer"
)
```

## Task ツールを使用すべき場合

以下の場合は Task ツールを使用してください：

1. **複雑なマルチステップタスク**：自律的に処理可能な複数の操作を必要とするタスク
2. **専門的な知識**：ドメイン固有の知識やツールの活用が有効なタスク
3. **並列実行**：同時に実行可能な複数の独立したタスクがある場合
4. **委譲の必要性**：ステップを細かく管理するのではなく、タスク全体を任せたい場合
5. **リソース集約型の操作**：大幅な時間や計算リソースを要する可能性があるタスク

## Task ツールを使用すべきでない場合

以下の場合は Task ツールを使用しないでください：

- **単純な単一ステップ操作**：Read や Edit などの直接ツールを使用してください
- **対話型タスク**：双方向のコミュニケーションを必要とするタスク
- **特定のファイルの読み込み**：パフォーマンス向上のため Read ツールを直接使用してください
- **単純な検索**：Grep や Glob ツールを直接使用してください

## 重要な注意事項

- **ステートレスな実行**：各サブエージェントの呼び出しは独立しており、以前の実行の記憶は保持されません
- **1回のみの通信**：サブエージェントは最終結果メッセージを1回だけ返します（継続的な通信はありません）
- **包括的なプロンプト**：プロンプトには、自律実行に必要なすべてのコンテキストと指示を含める必要があります
- **ツールへのアクセス**：サブエージェントは、各自の設定で構成されたツールにのみアクセスできます
- **並列処理機能**：複数のサブエージェントを同時に実行し、効率を向上させることができます
- **設定依存**：利用可能なサブエージェントのタイプはシステム設定によって異なります

## 設定

サブエージェントは Qwen Code のエージェント設定システムを通じて構成されます。`/agents` コマンドを使用して以下を行います：

- 利用可能なサブエージェントの表示
- 新しいサブエージェント設定の作成
- 既存のサブエージェント設定の変更
- ツールの権限と機能の設定

サブエージェントの設定に関する詳細は、サブエージェントのドキュメントを参照してください。