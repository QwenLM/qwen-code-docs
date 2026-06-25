# 一般的なワークフロー

> Qwen Code を使った一般的なワークフローについて学びます。

このドキュメントの各タスクには、明確な手順、コマンド例、ベストプラクティスが含まれており、Qwen Code を最大限に活用するのに役立ちます。

## 新しいコードベースを理解する

### コードベースの概要を素早く把握する

新しいプロジェクトに参加し、その構造を素早く理解する必要があるとします。

**1. プロジェクトのルートディレクトリに移動する**

```bash
cd /path/to/project
```

**2. Qwen Code を起動する**

```bash
qwen
```

**3. 高レベルの概要を尋ねる**

```
give me an overview of this codebase
```

**4. 特定のコンポーネントについて詳しく調べる**

```
explain the main architecture patterns used here
```

```
what are the key data models?
```

```
how is authentication handled?
```

> [!tip]
>
> - 広い質問から始め、特定の領域に絞り込む
> - プロジェクトで使用されているコーディング規約やパターンについて尋ねる
> - プロジェクト固有の用語集をリクエストする

### 関連するコードを見つける

特定の機能に関連するコードを探す必要があるとします。

**1. Qwen Code に関連ファイルの検索を依頼する**

```
find the files that handle user authentication
```

**2. コンポーネント間の連携に関するコンテキストを取得する**

```
how do these authentication files work together?
```

**3. 実行フローを理解する**

```
trace the login process from front-end to database
```

> [!tip]
>
> - 探しているものを具体的に指定する
> - プロジェクトのドメイン言語を使用する

## バグを効率的に修正する

エラーメッセージが発生し、その原因を特定して修正する必要があるとします。

**1. Qwen Code にエラーを共有する**

```
I'm seeing an error when I run npm test
```

**2. 修正方法を提案してもらう**

```
suggest a few ways to fix the @ts-ignore in user.ts
```

**3. 修正を適用する**

```
update user.tsto add the null check you suggested
```

> [!tip]
>
> - 問題を再現するコマンドとスタックトレースを Qwen Code に伝える
> - エラーを再現する手順を記載する
> - エラーが断続的に発生するのか、常に発生するのかを Qwen Code に伝える

## コードをリファクタリングする

古いコードを最新のパターンやプラクティスに合わせて更新する必要があるとします。

**1. リファクタリング対象のレガシーコードを特定する**

```
find deprecated API usage in our codebase
```

**2. リファクタリングの提案を取得する**

```
suggest how to refactor utils.js to use modern JavaScript features
```

**3. 変更を安全に適用する**

```
refactor utils.js to use ES 2024 features while maintaining the same behavior
```

**4. リファクタリングを検証する**

```
run tests for the refactored code
```

> [!tip]
>
> - 最新のアプローチの利点を Qwen Code に説明してもらう
> - 必要に応じて、変更が後方互換性を維持するようにリクエストする
> - リファクタリングは小さくテスト可能な単位で実施する

## 専門的なサブエージェントを使用する

特定のタスクをより効率的に処理するために、専門的な AI サブエージェントを使用したいとします。

**1. 利用可能なサブエージェントを表示する**

```
/agents
```

これにより、利用可能なすべてのサブエージェントが表示され、新しいサブエージェントを作成できます。

**2. サブエージェントを自動的に使用する**

Qwen Code は、適切なタスクを専門的なサブエージェントに自動的に委任します。

```
review my recent code changes for security issues
```

```
run all tests and fix any failures
```

**3. 特定のサブエージェントを明示的にリクエストする**

```
use the code-reviewer subagent to check the auth module
```

```
have the debugger subagent investigate why users can't log in
```

**4. ワークフロー用にカスタムサブエージェントを作成する**

```
/agents
```

「create」を選択し、プロンプトに従って以下を定義します。

- サブエージェントの目的を説明する一意の識別子（例：`code-reviewer`、`api-designer`）。
- Qwen Code がこのエージェントを使用すべきタイミング
- アクセス可能なツール
- エージェントの役割と動作を説明するシステムプロンプト

> [!tip]
>
> - チームで共有するために、プロジェクト固有のサブエージェントを `.qwen/agents/` に作成する
> - 自動委任を有効にするために、説明的な `description` フィールドを使用する
> - 各サブエージェントが実際に必要とするツールへのアクセスに制限する
> - [サブエージェント](./features/sub-agents) について詳しく知る
> - [承認モード](./features/approval-mode) について詳しく知る

## テストを活用する

カバレッジが不足しているコードにテストを追加する必要があるとします。

**1. テストされていないコードを特定する**

```
find functions in NotificationsService.swift that are not covered by tests
```

**2. テストのスケルトンを生成する**

```
add tests for the notification service
```

**3. 意味のあるテストケースを追加する**

```
add test cases for edge conditions in the notification service
```

**4. テストを実行して検証する**

```
run the new tests and fix any failures
```

Qwen Code は、プロジェクトの既存のパターンや規約に従ったテストを生成できます。テストを依頼する際は、検証したい動作を具体的に指定してください。Qwen Code は既存のテストファイルを調査し、使用中のスタイル、フレームワーク、アサーションパターンに合わせます。

包括的なカバレッジを確保するには、見落としがちなエッジケースを Qwen Code に特定してもらいます。Qwen Code はコードパスを分析し、エラー条件、境界値、予期しない入力など、見落としがちなテストを提案できます。

## プルリクエストを作成する

変更内容に対して、適切にドキュメント化されたプルリクエストを作成する必要があるとします。

**1. 変更内容を要約する**

```
summarize the changes I've made to the authentication module
```

**2. Qwen Code でプルリクエストを生成する**

```
create a pr
```

**3. レビューして改善する**

```
enhance the PR description with more context about the security improvements
```

**4. テストの詳細を追加する**

```
add information about how these changes were tested
```

> [!tip]
>
> - Qwen Code に直接 PR の作成を依頼する
> - 送信前に Qwen Code が生成した PR をレビューする
> - 潜在的なリスクや考慮事項を Qwen Code に指摘してもらう

## ドキュメントを管理する

コードのドキュメントを追加または更新する必要があるとします。

**1. ドキュメント未記載のコードを特定する**

```
find functions without proper JSDoc comments in the auth module
```

**2. ドキュメントを生成する**

```
add JSDoc comments to the undocumented functions in auth.js
```

**3. レビューして改善する**

```
improve the generated documentation with more context and examples
```

**4. ドキュメントを検証する**

```
check if the documentation follows our project standards
```

> [!tip]
>
> - 希望するドキュメントスタイル（JSDoc、docstrings など）を指定する
> - ドキュメントに例を含めるよう依頼する
> - 公開 API、インターフェース、複雑なロジックのドキュメントをリクエストする

## ファイルとディレクトリを参照する

Qwen Code がファイルを読み込むのを待たずに、`@` を使用してファイルやディレクトリを素早く含めることができます。

**1. 単一ファイルを参照する**

```
Explain the logic in @src/utils/auth.js
```

これにより、ファイルの全内容が会話に含まれます。

**2. ディレクトリを参照する**

```
What's the structure of @src/components?
```

これにより、ファイル情報を含むディレクトリ一覧が提供されます。

**3. MCP リソースを参照する**

```
Show me the data from @github: repos/owner/repo/issues
```

これにより、`@server: resource` 形式を使用して接続された MCP サーバーからデータを取得します。詳細は [MCP](./features/mcp) を参照してください。

> [!tip]
>
> - ファイルパスは相対パスでも絶対パスでも指定可能
> - `@` ファイル参照を使用すると、ファイルのディレクトリおよび親ディレクトリにある `QWEN.md` がコンテキストに追加される
> - ディレクトリ参照はファイル一覧を表示し、内容は表示しない
> - 1 つのメッセージで複数のファイルを参照可能（例："`@file 1.js` と `@file 2.js`"）

## 以前の会話を再開する

Qwen Code でタスクを進めており、後のセッションで中断した箇所から再開する必要があるとします。

Qwen Code には、以前の会話を再開するための 2 つのオプションがあります。

- `--continue`: 最新の会話を自動的に継続する
- `--resume`: 会話選択ツールを表示する

**1. 最新の会話を継続する**

```bash
qwen --continue
```

これにより、プロンプトなしで最新の会話がすぐに再開されます。

**2. 非インタラクティブモードで継続する**

```bash
qwen --continue -p "Continue with my task"
```

`-p`（または `--prompt`）と `--continue` を組み合わせると、最新の会話を非インタラクティブモードで再開できます。スクリプトや自動化に最適です。

**3. 会話選択ツールを表示する**

```bash
qwen --resume
```

これにより、以下の情報を表示するクリーンなリストビュー形式のインタラクティブな会話選択ツールが表示されます。

- セッションの要約（または初期プロンプト）
- メタデータ：経過時間、メッセージ数、git ブランチ

矢印キーで移動し、Enter キーで会話を選択します。Esc キーで終了します。

> [!tip]
>
> - 会話履歴はローカルマシンに保存される
> - 最新の会話に素早くアクセスするには `--continue` を使用する
> - 特定の過去の会話を選択する必要がある場合は `--resume` を使用する
> - 再開時、継続する前に会話履歴全体が表示される
> - 再開された会話は、元の会話と同じモデルと設定で開始される
>
> **動作原理**:
>
> 1. **会話の保存**: すべての会話は完全なメッセージ履歴とともにローカルに自動的に保存される
> 2. **メッセージのデシリアライズ**: 再開時、コンテキストを維持するためにメッセージ履歴全体が復元される
> 3. **ツールの状態**: 以前の会話でのツールの使用状況と結果が保持される
> 4. **コンテキストの復元**: 以前のコンテキストがすべて保持された状態で会話が再開される
>
> **例**:
>
> ```bash
> # Continue most recent conversation
> qwen --continue
>
> # Continue most recent conversation with a specific prompt
> qwen --continue -p "Show me our progress"
>
> # Show conversation picker
> qwen --resume
>
> # Continue most recent conversation in non-interactive mode
> qwen --continue -p "Run the tests again"
> ```

## Git worktrees を使用して Qwen Code セッションを並列実行する

Qwen Code インスタンス間でコードを完全に分離し、複数のタスクを同時に処理する必要があるとします。

**1. Git worktrees を理解する**

Git worktrees を使用すると、同じリポジトリから複数のブランチを別々のディレクトリにチェックアウトできます。各 worktree は独立したファイルを持つ作業ディレクトリを持ちながら、同じ Git 履歴を共有します。詳細は [公式 Git worktree ドキュメント](https://git-scm.com/docs/git-worktree) を参照してください。

**2. 新しい worktree を作成する**

```bash
# Create a new worktree with a new branch
git worktree add ../project-feature-a -b feature-a

# Or create a worktree with an existing branch
git worktree add ../project-bugfix bugfix-123
```

これにより、リポジトリの別の作業コピーを含む新しいディレクトリが作成されます。

**3. 各 worktree で Qwen Code を実行する**

```bash
# Navigate to your worktree
cd ../project-feature-a

# Run Qwen Code in this isolated environment
qwen
```

**4. 別の worktree で Qwen Code を実行する**

```bash
cd ../project-bugfix
qwen
```

**5. worktree を管理する**

```bash
# List all worktrees
git worktree list

# Remove a worktree when done
git worktree remove ../project-feature-a
```

> [!tip]
>
> - 各 worktree は独立したファイル状態を持つため、Qwen Code セッションの並列実行に最適
> - 1 つの worktree で行った変更は他の worktree に影響しないため、Qwen Code インスタンス間の干渉を防げる
> - すべての worktree は同じ Git 履歴とリモート接続を共有する
> - 長時間実行するタスクの場合、別の worktree で開発を続けながら、1 つの worktree で Qwen Code を動作させておける
> - 各 worktree がどのタスク用かを簡単に識別できるよう、説明的なディレクトリ名を使用する
> - プロジェクトのセットアップに従って、新しい worktree ごとに開発環境を初期化することを忘れないでください。スタックに応じて以下が含まれる場合があります。
>   - JavaScript プロジェクト: 依存関係のインストールの実行（`npm install`、`yarn`）
>   - Python プロジェクト: 仮想環境のセットアップまたはパッケージマネージャーを使用したインストール
>   - その他の言語: プロジェクトの標準セットアッププロセスに従う

## Qwen Code を Unix スタイルのユーティリティとして使用する

### 検証プロセスに Qwen Code を追加する

Qwen Code をリンターやコードレビュアーとして使用したいとします。

**ビルドスクリプトに Qwen Code を追加する:**

```json
// package.json
{
    ...
    "scripts": {
        ...
        "lint:Qwen Code": "qwen -p 'you are a linter. please look at the changes vs. main and report any issues related to typos. report the filename and line number on one line, and a description of the issue on the second line. do not return any other text.'"
    }
}
```

> [!tip]
>
> - CI/CD パイプラインでの自動コードレビューに Qwen Code を使用する
> - プロジェクトに関連する特定の問題をチェックするようプロンプトをカスタマイズする
> - 検証の種類に応じて複数のスクリプトを作成することを検討する

### パイプ入力とパイプ出力

Qwen Code にデータをパイプで渡し、構造化された形式でデータを受け取りたいとします。

**Qwen Code を介してデータをパイプする:**

```bash
cat build-error.txt | qwen -p 'concisely explain the root cause of this build error' > output.txt
```

> [!tip]
>
> - パイプを使用して Qwen Code を既存のシェルスクリプトに統合する
> - 他の Unix ツールと組み合わせて強力なワークフローを構築する
> - 構造化された出力には `--output-format` の使用を検討する

### 出力形式を制御する

特に Qwen Code をスクリプトや他のツールに統合する際に、出力を特定の形式で取得する必要があるとします。

**1. テキスト形式を使用する（デフォルト）**

```bash
cat data.txt | qwen -p 'summarize this data' --output-format text > summary.txt
```

これにより、Qwen Code のプレーンテキストレスポンスのみが出力されます（デフォルトの動作）。

**2. JSON 形式を使用する**

```bash
cat code.py | qwen -p 'analyze this code for bugs' --output-format json > analysis.json
```

これにより、コストや期間などのメタデータを含むメッセージの JSON 配列が出力されます。

**3. ストリーミング JSON 形式を使用する**

```bash
cat log.txt | qwen -p 'parse this log file for errors' --output-format stream-json
```

これにより、Qwen Code がリクエストを処理する際にリアルタイムで JSON オブジェクトのシリーズが出力されます。各メッセージは有効な JSON オブジェクトですが、連結した出力全体は有効な JSON ではありません。

> [!tip]
>
> - Qwen Code のレスポンスのみが必要な単純な統合には `--output-format text` を使用する
> - 会話ログ全体が必要な場合は `--output-format json` を使用する
> - 会話の各ターンをリアルタイムで出力するには `--output-format stream-json` を使用する

## Qwen Code の機能について質問する

Qwen Code はドキュメントへの組み込みアクセス権を持ち、自身の機能や制限に関する質問に回答できます。

### 質問の例

```
can Qwen Code create pull requests?
```

```
how does Qwen Code handle permissions?
```

```
what slash commands are available?
```

```
how do I use MCP with Qwen Code?
```

```
how do I configure Qwen Code for Amazon Bedrock?
```

```
what are the limitations of Qwen Code?
```

> [!note]
>
> Qwen Code はこれらの質問に対してドキュメントに基づいた回答を提供します。実行可能な例や実践的なデモについては、上記の特定のワークフローセクションを参照してください。

> [!tip]
>
> - 使用中のバージョンに関係なく、Qwen Code は常に最新の Qwen Code ドキュメントにアクセスできる
> - 詳細な回答を得るには、具体的な質問をする
> - Qwen Code は、MCP 統合、エンタープライズ構成、高度なワークフローなどの複雑な機能についても説明できる