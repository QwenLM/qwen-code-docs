# 一般的なワークフロー

> Qwen Code を使用した一般的なワークフローについて学びます。

このドキュメントの各タスクには、Qwen Code を最大限に活用するための明確な手順、コマンド例、ベストプラクティスが含まれています。

## 新しいコードベースを理解する

### コードベースの概要を素早く把握する

新しいプロジェクトに参加し、その構造をすぐに理解する必要があるとします。

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

**4. 特定のコンポーネントをさらに深く掘り下げる**

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
> - まずは広い質問から始め、その後特定の領域に絞り込みます
> - プロジェクトで使用されているコーディング規約やパターンについて質問します
> - プロジェクト固有の用語集をリクエストします

### 関連コードを見つける

特定の機能や機能性に関連するコードを特定する必要があるとします。

**1. Qwen Code に関連ファイルを検索してもらう**

```
find the files that handle user authentication
```

**2. コンポーネント間の相互作用のコンテキストを得る**

```
how do these authentication files work together?
```

**3. 実行フローを理解する**

```
trace the login process from front-end to database
```

> [!tip]
>
> - 探しているものを具体的に指定します
> - プロジェクトのドメイン用語を使用します

## バグを効率的に修正する

エラーメッセージに遭遇し、その原因を見つけて修正する必要があるとします。

**1. エラーを Qwen Code に共有する**

```
I'm seeing an error when I run npm test
```

**2. 修正の提案を求める**

```
suggest a few ways to fix the @ts-ignore in user.ts
```

**3. 修正を適用する**

```
update user.tsto add the null check you suggested
```

> [!tip]
>
> - 問題を再現するコマンドとスタックトレースを Qwen Code に伝えます
> - エラーを再現する手順があれば、それも伝えます
> - エラーが断続的に発生するのか、常に発生するのかを Qwen Code に知らせます

## コードをリファクタリングする

古いコードを最新のパターンやプラクティスに更新する必要があるとします。

**1. リファクタリング対象のレガシーコードを特定する**

```
find deprecated API usage in our codebase
```

**2. リファクタリングの推奨事項を得る**

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
> - モダンなアプローチの利点を Qwen Code に説明してもらいます
> - 必要に応じて、変更が後方互換性を維持するように依頼します
> - リファクタリングは小さく、テスト可能な単位で行います

## 専門サブエージェントを使用する

特定のタスクをより効果的に処理するために、専門の AI サブエージェントを使用したいとします。

**1. 利用可能なサブエージェントを表示する**

```
/agents
```

これにより、利用可能なすべてのサブエージェントが表示され、新しいものを作成できます。

**2. サブエージェントを自動的に使用する**

Qwen Code は適切なタスクを専門のサブエージェントに自動的に委譲します。

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

**4. ワークフロー用のカスタムサブエージェントを作成する**

```
/agents
```

次に、「作成」を選択し、プロンプトに従って以下を定義します。

- サブエージェントの目的を説明する一意の識別子（例：`code-reviewer`、`api-designer`）
- Qwen Code がこのエージェントを使用するタイミング
- アクセスできるツール
- エージェントの役割と動作を説明するシステムプロンプト

> [!tip]
>
> - チーム共有のために `.qwen/agents/` にプロジェクト固有のサブエージェントを作成します
> - 自動委譲を有効にするために、説明的な `description` フィールドを使用します
> - 各サブエージェントが実際に必要とするツールのみにアクセスを制限します
> - サブエージェントの詳細については、[Sub Agents](./features/sub-agents) を参照してください
> - 承認モードの詳細については、[Approval Mode](./features/approval-mode) を参照してください

## テストを活用する

カバレッジがないコードにテストを追加する必要があるとします。

**1. テスト対象外のコードを特定する**

```
find functions in NotificationsService.swift that are not covered by tests
```

**2. テストのスキャフォールディングを生成する**

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

Qwen Code は、プロジェクトの既存のパターンと規約に従ったテストを生成できます。テストを依頼する際は、検証したい動作を具体的に指定してください。Qwen Code は既存のテストファイルを調べ、使用されているスタイル、フレームワーク、アサーションパターンに合わせます。

包括的なカバレッジを得るために、見逃しがちなエッジケースを Qwen Code に特定してもらいましょう。Qwen Code はコードパスを分析し、見落としがちなエラー条件、境界値、予期しない入力に対するテストを提案できます。

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

**3. レビューと改善を行う**

```
enhance the PR description with more context about the security improvements
```

**4. テストの詳細を追加する**

```
add information about how these changes were tested
```

> [!tip]
>
> - Qwen Code に直接プルリクエストを作成するよう依頼します
> - 送信前に Qwen Code が生成した PR をレビューします
> - 潜在的なリスクや考慮事項を Qwen Code に強調してもらいます

## ドキュメントを扱う

コードのドキュメントを追加または更新する必要があるとします。

**1. ドキュメント化されていないコードを特定する**

```
find functions without proper JSDoc comments in the auth module
```

**2. ドキュメントを生成する**

```
add JSDoc comments to the undocumented functions in auth.js
```

**3. レビューと改善を行う**

```
improve the generated documentation with more context and examples
```

**4. ドキュメントを検証する**

```
check if the documentation follows our project standards
```

> [!tip]
>
> - 希望するドキュメントスタイル（JSDoc、docstrings など）を指定します
> - ドキュメント内の例を要求します
> - 公開 API、インターフェース、複雑なロジックのドキュメントをリクエストします

## ファイルとディレクトリを参照する

`@` を使用して、Qwen Code がファイルを読み取るのを待たずに、素早くファイルやディレクトリを含めます。

**1. 単一のファイルを参照する**

```
Explain the logic in @src/utils/auth.js
```

これにより、ファイルの全内容が会話に含まれます。

**2. ディレクトリを参照する**

```
What's the structure of @src/components?
```

これにより、ファイル情報を含むディレクトリリストが提供されます。

**3. MCP リソースを参照する**

```
Show me the data from @github: repos/owner/repo/issues
```

これにより、`@server: resource` 形式を使用して、接続された MCP サーバーからデータを取得します。詳細は [MCP](./features/mcp) を参照してください。

> [!tip]
>
> - ファイルパスは相対パスでも絶対パスでも構いません
> - @ファイル参照は、ファイルのディレクトリと親ディレクトリにある `QWEN.md` をコンテキストに追加します
> - ディレクトリ参照はファイルリストを表示し、内容は表示しません
> - 1 つのメッセージで複数のファイルを参照できます（例: 「`@file 1.js` と `@file 2.js`」）

## 以前の会話を再開する

Qwen Code でタスクに取り組んでいて、後続のセッションで中断したところから続行する必要があるとします。

Qwen Code は、以前の会話を再開するための 2 つのオプションを提供します。

- `--continue` : 最新の会話を自動的に続行します
- `--resume` : 会話選択画面を表示します

**1. 最新の会話を続行する**

```bash
qwen --continue
```

これにより、プロンプトなしで最新の会話が直ちに再開されます。

**2. 非対話モードで続行する**

```bash
qwen --continue -p "Continue with my task"
```

`-p`（または `--prompt`）を `--continue` とともに使用すると、最新の会話を非対話モードで再開できます。スクリプトや自動化に最適です。

**3. 会話選択画面を表示する**

```bash
qwen --resume
```

これにより、クリーンなリストビューを持つインタラクティブな会話セレクターが表示されます。

- セッションの概要（または最初のプロンプト）
- メタデータ: 経過時間、メッセージ数、Git ブランチ

矢印キーで移動し、Enter キーで会話を選択します。Esc キーで終了します。

> [!tip]
>
> - 会話履歴はローカルマシンに保存されます
> - 最新の会話にすばやくアクセスするには `--continue` を使用します
> - 特定の過去の会話を選択する必要がある場合は `--resume` を使用します
> - 再開すると、続行する前に会話履歴全体が表示されます
> - 再開された会話は、元の会話と同じモデルと設定で開始されます
>
> **仕組み**:
>
> 1. **会話の保存**: すべての会話は完全なメッセージ履歴とともに自動的にローカルに保存されます
> 2. **メッセージのデシリアライズ**: 再開時にメッセージ履歴全体が復元され、コンテキストが維持されます
> 3. **ツールの状態**: 以前の会話でのツールの使用と結果は保持されます
> 4. **コンテキストの復元**: 以前のすべてのコンテキストがそのままの状態で会話が再開されます
>
> **例**:
>
> ```bash
> # 最新の会話を続行
> qwen --continue
>
> # 特定のプロンプトで最新の会話を続行
> qwen --continue -p "Show me our progress"
>
> # 会話選択画面を表示
> qwen --resume
>
> # 非対話モードで最新の会話を続行
> qwen --continue -p "Run the tests again"
> ```

## Git ワークツリーを使用して並列 Qwen Code セッションを実行する

Qwen Code インスタンス間で完全なコード分離を行いながら、複数のタスクを同時に処理する必要があるとします。

**1. Git ワークツリーを理解する**

Git ワークツリーを使用すると、同じリポジトリから複数のブランチを別々のディレクトリにチェックアウトできます。各ワークツリーは独立したファイルを持つ独自のワーキングディレクトリを持ちながら、同じ Git 履歴を共有します。詳細は [公式 Git ワークツリードキュメント](https://git-scm.com/docs/git-worktree) を参照してください。

**2. 新しいワークツリーを作成する**

```bash
# 新しいブランチで新しいワークツリーを作成
git worktree add ../project-feature-a -b feature-a

# 既存のブランチでワークツリーを作成
git worktree add ../project-bugfix bugfix-123
```

これにより、リポジトリの別のワーキングコピーを持つ新しいディレクトリが作成されます。

**3. 各ワークツリーで Qwen Code を実行する**

```bash
# ワークツリーに移動
cd ../project-feature-a

# この分離された環境で Qwen Code を実行
qwen
```

**4. 別のワークツリーで Qwen Code を実行する**

```bash
cd ../project-bugfix
qwen
```

**5. ワークツリーを管理する**

```bash
# すべてのワークツリーを一覧表示
git worktree list

# ワークツリーを削除
git worktree remove ../project-feature-a
```

> [!tip]
>
> - 各ワークツリーは独立したファイル状態を持つため、並列 Qwen Code セッションに最適です
> - 1 つのワークツリーで行われた変更は他のワークツリーに影響を与えず、Qwen Code インスタンスが相互に干渉するのを防ぎます
> - すべてのワークツリーは同じ Git 履歴とリモート接続を共有します
> - 長時間実行されるタスクの場合、あるワークツリーで Qwen Code を実行しながら、別のワークツリーで開発を続行できます
> - 各ワークツリーがどのタスク用かを簡単に識別できるように、説明的なディレクトリ名を使用します
> - プロジェクトのセットアップに従って、各新しいワークツリーで開発環境を初期化することを忘れないでください。スタックに応じて、以下が含まれる場合があります。
>   - JavaScript プロジェクト: 依存関係のインストール（`npm install`、`yarn`）
>   - Python プロジェクト: 仮想環境のセットアップ、またはパッケージマネージャーでのインストール
>   - その他の言語: プロジェクトの標準的なセットアッププロセスに従う

## Qwen Code を Unix スタイルのユーティリティとして使用する

### 検証プロセスに Qwen Code を追加する

Qwen Code をリンターやコードレビュアーとして使用したいとします。

**ビルドスクリプトに Qwen Code を追加:**

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
> - CI/CD パイプラインでの自動コードレビューに Qwen Code を使用します
> - プロジェクトに関連する特定の問題をチェックするようにプロンプトをカスタマイズします
> - 異なるタイプの検証のために複数のスクリプトを作成することを検討します

### パイプ入力、パイプ出力

Qwen Code にデータをパイプで渡し、構造化された形式でデータを戻してもらいたいとします。

**Qwen Code にデータをパイプで渡す:**

```bash
cat build-error.txt | qwen -p 'concisely explain the root cause of this build error' > output.txt
```

> [!tip]
>
> - パイプを使用して、Qwen Code を既存のシェルスクリプトに統合します
> - 強力なワークフローのために他の Unix ツールと組み合わせます
> - 構造化された出力には `--output-format` の使用を検討します

### 出力形式を制御する

スクリプトや他のツールに Qwen Code を統合する場合など、特定の形式で出力が必要な場合があるとします。

**1. テキスト形式を使用する（デフォルト）**

```bash
cat data.txt | qwen -p 'summarize this data' --output-format text > summary.txt
```

これにより、Qwen Code のプレーンテキスト応答のみが出力されます（デフォルトの動作）。

**2. JSON 形式を使用する**

```bash
cat code.py | qwen -p 'analyze this code for bugs' --output-format json > analysis.json
```

これにより、コストや期間を含むメタデータを含むメッセージの JSON 配列が出力されます。

**3. ストリーミング JSON 形式を使用する**

```bash
cat log.txt | qwen -p 'parse this log file for errors' --output-format stream-json
```

これにより、Qwen Code がリクエストを処理する際に、リアルタイムで一連の JSON オブジェクトが出力されます。各メッセージは有効な JSON オブジェクトですが、連結された場合、出力全体が有効な JSON になるとは限りません。

> [!tip]
>
> - Qwen Code の応答だけが必要な単純な統合には `--output-format text` を使用します
> - 完全な会話ログが必要な場合は `--output-format json` を使用します
> - 各会話ターンのリアルタイム出力が必要な場合は `--output-format stream-json` を使用します

## Qwen Code に自身の機能について質問する

Qwen Code は組み込みでドキュメントにアクセスでき、自身の機能や制限についての質問に答えることができます。

### 質問例

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
> Qwen Code はこれらの質問に対してドキュメントベースの回答を提供します。実行可能な例やハンズオンデモについては、上記の特定のワークフローセクションを参照してください。

> [!tip]
>
> - Qwen Code は、使用しているバージョンに関係なく、常に最新の Qwen Code ドキュメントにアクセスできます
> - 詳細な回答を得るには、具体的な質問をします
> - Qwen Code は、MCP 統合、エンタープライズ設定、高度なワークフローなどの複雑な機能について説明できます