# Agent ツール（`agent`）

このドキュメントでは、Qwen Code の `agent` ツールについて説明します。

## 概要

`agent` を使用すると、複雑なマルチステップのタスクを自律的に処理する専門サブエージェントを起動できます。Agent ツールは作業を専門エージェントに委譲し、各エージェントは独自のツールセットにアクセスしながら独立して動作するため、並列タスク実行や専門知識の活用が可能になります。

### 引数

`agent` は以下の引数を受け取ります。

- `description`（string、必須）: ユーザーの視認性とトラッキング目的のための短い（3〜5語）タスク説明。
- `prompt`（string、必須）: サブエージェントが実行する詳細なタスクプロンプト。自律実行のための包括的な指示を含める必要があります。
- `subagent_type`（string、任意）: このタスクに使用する専門エージェントの種類。省略した場合は `general-purpose` がデフォルトになります。
- `run_in_background`（boolean、任意）: `true` に設定するとエージェントをバックグラウンドで実行します。完了時に通知されます。
- `isolation`（string、任意）: `"worktree"` に設定するとエージェントを隔離された git ワークツリー内で実行します。

## Qwen Code での `agent` の使い方

Agent ツールは設定から利用可能なサブエージェントを動的に読み込み、タスクを委譲します。各サブエージェントは独立して動作し、独自のツールセットを使用できるため、専門知識の活用と並列実行が可能です。

Agent ツールを使用すると、サブエージェントは以下を行います。

1. タスクプロンプトを完全な自律権とともに受け取る
2. 利用可能なツールを使ってタスクを実行する
3. 最終的な結果メッセージを返す
4. 終了する（サブエージェントはステートレスで使い捨て）

使用例：

```
agent(description="Brief task description", prompt="Detailed task instructions for the subagent", subagent_type="agent_name")
```

## 利用可能なサブエージェント

利用可能なサブエージェントは設定によって異なります。一般的なサブエージェントの種類には以下が含まれます。

- **general-purpose**: 様々なツールを必要とする複雑なマルチステップタスク向け
- **code-reviewer**: コード品質のレビューと分析向け
- **test-runner**: テストの実行と結果分析向け
- **documentation-writer**: ドキュメントの作成と更新向け

利用可能なサブエージェントは Qwen Code の `/agents` コマンドで確認できます。

## Agent ツールの機能

### リアルタイムの進行状況更新

Agent ツールは以下のライブ更新を提供します。

- サブエージェントの実行ステータス
- サブエージェントが行っている個々のツール呼び出し
- ツール呼び出しの結果とエラー
- タスク全体の進行状況と完了ステータス

### 並列実行

1 つのメッセージで Agent ツールを複数回呼び出すことで、複数のサブエージェントを同時に起動でき、並列タスク実行と効率向上が実現します。

### 専門知識の活用

各サブエージェントは以下を設定できます。

- 特定のツールアクセス権限
- 専門的なシステムプロンプトと指示
- カスタムモデル設定
- ドメイン固有の知識と機能

## `agent` の使用例

### 汎用エージェントへの委譲

```
agent(
  description="Code refactoring",
  prompt="Please refactor the authentication module in src/auth/ to use modern async/await patterns instead of callbacks. Ensure all tests still pass and update any related documentation.",
  subagent_type="general-purpose"
)
```

### 並列タスクの実行

```
# Launch code review and test execution in parallel
agent(
  description="Code review",
  prompt="Review the recent changes in the user management module for code quality, security issues, and best practices compliance.",
  subagent_type="general-purpose"
)

agent(
  description="Run tests",
  prompt="Execute the full test suite and analyze any failures. Provide a summary of test coverage and recommendations for improvement.",
  subagent_type="test-engineer"
)
```

### ドキュメント生成

```
agent(
  description="Update docs",
  prompt="Generate comprehensive API documentation for the newly implemented REST endpoints in the orders module. Include request/response examples and error codes.",
  subagent_type="general-purpose"
)
```

## Agent ツールを使うべき場面

以下の場合に Agent ツールを使用します。

1. **複雑なマルチステップタスク** - 自律的に処理できる複数の操作を必要とするタスク
2. **専門知識が必要なタスク** - ドメイン固有の知識やツールから恩恵を受けるタスク
3. **並列実行** - 同時に実行できる複数の独立したタスクがある場合
4. **委譲が必要な場合** - ステップをマイクロマネジメントするのではなく、タスク全体を引き渡したい場合
5. **リソース集約型の操作** - 相当な時間や計算リソースを要する可能性があるタスク

## Agent ツールを使うべきでない場面

以下の場合は Agent ツールを使用しないでください。

- **シンプルな単一ステップの操作** - Read、Edit などの直接ツールを使用する
- **対話的なタスク** - やり取りが必要なタスク
- **特定のファイル読み込み** - パフォーマンス向上のために Read ツールを直接使用する
- **簡単な検索** - Grep または Glob ツールを直接使用する

## 重要な注意事項

- **ステートレスな実行**: 各サブエージェントの呼び出しは独立しており、以前の実行の記憶はない
- **単一の通信**: サブエージェントは最終結果メッセージを 1 回だけ提供し、継続的な通信はない
- **包括的なプロンプト**: プロンプトには自律実行に必要なすべてのコンテキストと指示を含める必要がある
- **ツールアクセス**: サブエージェントは各自の設定で構成されたツールにのみアクセス可能
- **並列実行能力**: 効率向上のために複数のサブエージェントを同時に実行できる
- **設定依存**: 利用可能なサブエージェントの種類はシステム設定によって異なる

## 設定

サブエージェントは Qwen Code のエージェント設定システムを通じて構成されます。`/agents` コマンドを使用して以下を行えます。

- 利用可能なサブエージェントの表示
- 新しいサブエージェント設定の作成
- 既存のサブエージェント設定の変更
- ツールの権限と機能の設定

サブエージェントの設定に関する詳細は、サブエージェントのドキュメントを参照してください。
