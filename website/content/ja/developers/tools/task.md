# Agent Tool（`agent`）

このドキュメントでは、Qwen Code の `agent` ツールについて説明します。

## 説明

`agent` は、複雑なマルチステップタスクを自律的に処理するために、専門のサブエージェントを起動するために使用します。Agent Tool は、それぞれが独自のツールセットにアクセスして独立して作業できる専門エージェントにタスクを委譲し、並列タスク実行と専門知識を活用できるようにします。

### 引数

`agent` は以下の引数を受け取ります。

- `description` （string、必須）: ユーザーが確認し追跡するための、タスクの短い（3～5語）説明。
- `prompt` （string、必須）: サブエージェントが実行するための詳細なタスクプロンプト。自律実行のための包括的な指示を含める必要があります。
- `subagent_type` （string、オプション）: このタスクに使用する専門エージェントの種類。省略時は `general-purpose` になります。
- `run_in_background` （boolean、オプション）: `true` に設定すると、エージェントをバックグラウンドで実行します。完了時に通知されます。
- `isolation` （string、オプション）: `"worktree"` に設定すると、隔離された git worktree でエージェントを実行します。

## Qwen Code で `agent` を使用する方法

Agent Tool は設定から利用可能なサブエージェントを動的に読み込み、タスクを委譲します。各サブエージェントは独立して実行され、独自のツールセットを使用できるため、専門知識と並列実行が可能になります。

Agent Tool を使用すると、サブエージェントは次のようになります：

1. タスクプロンプトを完全な自律性で受け取る
2. 利用可能なツールを使用してタスクを実行する
3. 最終結果メッセージを返す
4. 終了する（サブエージェントはステートレスで使い捨て）

使用法:

```
agent(description="Brief task description", prompt="Detailed task instructions for the subagent", subagent_type="agent_name")
```

## 利用可能なサブエージェント

利用可能なサブエージェントは設定に依存します。一般的なサブエージェントの種類は次のとおりです：

- **general-purpose**: さまざまなツールを必要とする複雑なマルチステップタスク
- **code-reviewer**: コード品質のレビューと分析
- **test-runner**: テストの実行と結果の分析
- **documentation-writer**: ドキュメントの作成と更新

利用可能なサブエージェントは、Qwen Code の `/agents` コマンドを使用して確認できます。

## Agent Tool の機能

### リアルタイム進行状況の更新

Agent Tool はライブ更新を提供し、以下を表示します：

- サブエージェントの実行ステータス
- サブエージェントによる個々のツール呼び出し
- ツール呼び出しの結果とエラー
- タスク全体の進行状況と完了ステータス

### 並列実行

単一のメッセージ内で Agent Tool を複数回呼び出すことで、複数のサブエージェントを同時に起動でき、並列タスク実行と効率向上が可能です。

### 専門知識

各サブエージェントは次のように構成できます：

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

## Agent Tool を使用する場合

Agent Tool を使用するのは次の場合です：

1. **複雑なマルチステップタスク** - 自律的に処理できる複数の操作を必要とするタスク
2. **専門知識** - ドメイン固有の知識やツールの利点を活かせるタスク
3. **並列実行** - 複数の独立したタスクを同時に実行できる場合
4. **委譲の必要性** - 細かく指示するよりもタスク全体を任せたい場合
5. **リソース集約型操作** - 時間や計算リソースを多く消費する可能性のあるタスク

## Agent Tool を使用してはいけない場合

Agent Tool を使用してはいけないのは次の場合です：

- **単純な単一ステップ操作** - Read、Edit などの直接ツールを使用
- **インタラクティブなタスク** - 双方向のやり取りが必要なタスク
- **特定のファイル読み取り** - パフォーマンス向上のため Read ツールを直接使用
- **単純な検索** - Grep または Glob ツールを直接使用

## 重要な注意事項

- **ステートレス実行**: 各サブエージェントの呼び出しは独立しており、以前の実行の記憶はありません
- **単一通信**: サブエージェントは最終結果メッセージを1つ提供し、継続的な通信はありません
- **包括的なプロンプト**: プロンプトには自律実行に必要なすべてのコンテキストと指示を含める必要があります
- **ツールアクセス**: サブエージェントは、特定の構成で設定されたツールのみにアクセスできます
- **並列機能**: 複数のサブエージェントを同時に実行して効率を向上させることができます
- **構成依存**: 利用可能なサブエージェントの種類はシステム構成に依存します

## 設定

サブエージェントは Qwen Code のエージェント設定システムを通じて構成します。`/agents` コマンドを使用して次のことができます：

- 利用可能なサブエージェントを表示
- 新しいサブエージェント設定を作成
- 既存のサブエージェント設定を変更
- ツールの権限と機能を設定

サブエージェントの設定の詳細については、サブエージェントのドキュメントを参照してください。