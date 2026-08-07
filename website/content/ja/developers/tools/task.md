# Agent Tool（`agent`）

このドキュメントでは、Qwen Code の `agent` ツールについて説明します。

## 説明

`agent` は、複雑なマルチステップタスクを自律的に処理するために、専門のサブエージェントを起動するために使用します。Agent Tool は、それぞれが独自のツールセットにアクセスして独立して作業できる専門エージェントにタスクを委譲し、並列タスク実行と専門知識を活用できるようにします。

### 引数

`agent` は以下の引数を受け取ります。

- `description` （string、必須）: ユーザーが確認し追跡するための、タスクの短い（3～5語）説明。
- `prompt` （string、必須）: サブエージェントが実行するための詳細なタスクプロンプト。自律実行のための包括的な指示を含める必要があります。
- `subagent_type` （string、オプション）: このタスクに使用する専門エージェントの種類。省略時は `general-purpose` になります。
- `fork_turns` （string、オプション）: `subagent_type="fork"` でのみ有効。省略するか `all` を使用すると親の会話全体を引き継ぎ、`"3"` のような正の整数文字列を使用すると直近の3回の実際のユーザーターンを引き継ぎます。ツール応答と純粋なシステムリマインダーはターンとしてカウントされません。
- `fork_tools` （string の配列、オプション）: `subagent_type="fork"` でのみ有効。フォークの現在のモデルから見えるツール宣言をプロンプトキャッシュ共有のために変更せずに、実行を正確な正規ツール名または MCP サーバーパターンに制限します。エントリに前後の空白を含めることはできません。ワイルドカードは `mcp__*` または `mcp__github__read_*` のような末尾の MCP ツール接頭辞パターみに限定されます。フォークは `ask_user_question` を決して実行しません。他の継承されたツールをすべて許可するには `fork_tools` を省略し、すべてのツール呼び出しを拒否するには空の配列を使用してください。
- `fork_profile` （string、オプション）: `subagent_type="fork"` でのみ有効。アクティブなプロジェクトルートから最大64 KiB の frontmatter のみの通常の `.qwen/fork-profiles/<name>.md` を読み込み、必須の `tools` 配列と最大200文字のオプションの `promptHint` を適用します。ファイルはプロジェクトプロファイルディレクトリの外には解決できません。`fork_profile` は `fork_tools` や名前付きチームメイトと組み合わせることはできず、セーフモードまたはベアモードでは使用できません。
- `run_in_background` （boolean、オプション）: トップレベルの通常エージェントではデフォルトで `true` です。通常エージェントの結果をインラインで待つ場合は `false` に設定します。ヘッドレスフォークは常にバックグラウンドで実行されます。ネストされたエージェントは `run_in_background` が明示的に `true` でない限りフォアグラウンドで実行されますが、ネストされたエージェントはバックグラウンド完了通知を受信できないため拒否されます。呼び出し元所有の `working_dir` の起動はフォアグラウンドで実行され、明示的または設定されたバックグラウンド実行を拒否します。
- `isolation` （string、オプション）: `"worktree"` に設定すると、Qwen Code が作成・管理する隔離された git ワークツリー内で、明示的に名前を付けられたフォーク以外のエージェントを実行します。
- `working_dir` （string、オプション）: 明示的に名前を付けられたフォーク以外のエージェントを、現在のリポジトリ内の既存の登録済み git ワークツリーにピン留めします。呼び出し元がワークツリーのライフサイクルを管理するため、このモードはフォアグラウンドで実行されます。`working_dir` と `isolation` の両方が指定された場合、`working_dir` が優先されます。

## Qwen Code で `agent` を使用する方法

Agent Tool は設定から利用可能なサブエージェントを動的に読み込み、タスクを委譲します。各サブエージェントは独立して実行され、独自のツールセットを使用できるため、専門知識と並列実行が可能になります。

Agent Tool を使用すると、サブエージェントは以下の動作をします：

1. タスクプロンプトと、フォークの場合は選択された親の会話コンテキストを受け取る
2. 利用可能なツールを使用してタスクを実行する
3. デフォルトでは完了通知を報告する。通常エージェントがフォアグラウンドで実行された場合は最終結果メッセージを返す
4. バックグラウンド実行後、保持された状態が継続をサポートしている場合にアドレス指定可能であり続ける

使用法:

```
agent(description="Brief task description", prompt="Detailed task instructions for the subagent", subagent_type="agent_name")
agent(description="Brief task description", prompt="Detailed task instructions for the fork", subagent_type="fork", fork_turns="3")
agent(description="Read-only investigation", prompt="Inspect the implementation", subagent_type="fork", fork_tools=["read_file", "grep_search", "mcp__github"])
agent(description="Profiled investigation", prompt="Inspect the implementation", subagent_type="fork", fork_profile="ro-research")
```

現在のターンがサブエージェントの結果を使用してから続行する必要がある場合は、`run_in_background=false` を設定してください。

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

### バックグラウンドエージェントの継続

バックグラウンドエージェントは、初期完了後にフォローアップの作業を受け取ることができます：

1. `list_agents` を呼び出して、現在のセッションのアドレス指定可能なバックグラウンドエージェントとその `task_id` 値を確認します。これには、親セッションが再開された後に復元された互換性のあるエージェントも含まれます。
2. `task_id` とフォローアップの指示を指定して `send_message` を呼び出します。実行中のエージェントは次のツールラウンドの境界でメッセージを受信し、一時停止中のエージェントはそれで再開し、完了したエージェントは常駐ランタイムが利用可能な場合は継続し、保持されたトランスクリプトから復活します。
3. フォローアップの結果を使用する前に、次の完了通知を待ちます。

エージェントを継続できない場合、`list_agents` は `resume_blocked_reason` を返します。復元または継続されたエージェントの出力は証拠として扱い、変更を統合する前に検証してください。

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

- **独立したコンテキスト**: 通常のサブエージェントは親の会話履歴なしで開始します。フォークはデフォルトで会話全体を継承し、境界付きの最近のウィンドウで十分な場合は `fork_turns` を受け入れます。
- **サブエージェントのインタラクション**: 通常のサブエージェントは `ask_user_question` を受信しません。フォークはキャッシュ共有のために親の宣言リストを保持しますが、スケジューリングや承認の前にそのツールを拒否します。ユーザー入力が不足していて作業がブロックされる場合、サブエージェントはブロッカーを親に報告します。
- **フォークの実行制限**: `fork_tools` は、フォークが実行できる既に宣言されたツールをさらに Narrow down します。許可されない呼び出しは、スケジューリングや承認の前にエラーを返します。同じ宣言リストがキャッシュ共有のためにモデルから見えるままになります。これは呼び出し元が選択する呼び出しごとの制限であり、管理者が強制するサンドボックスではありません。
- **フォークプロファイル**: `.qwen/fork-profiles/` 下のプロジェクトプロファイルは、`fork_tools` と同じ実行ゲートを再利用します。起動前に1回だけ解決され、解決されたリストは復活のために永続化され、オプションの `promptHint` はタスクディレクティブのみに追加されます。
- **完了の配信**: バックグラウンドの結果は、後のターンの完了通知を通じて届きます。通知が届く前に結果を想定しないでください。
- **継続**: 重複するエージェントを起動する代わりに、関連するフォローアップ作業には `list_agents` と `send_message` を使用してください。継続は互換性のある保持状態に依存し、利用できない場合があります。
- **包括的なプロンプト**: 初期プロンプトには自律実行に必要なすべてのコンテキストと指示を含める必要があります。通常のサブエージェントは親の会話を参照できません。
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
