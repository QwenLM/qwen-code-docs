# サブエージェント

サブエージェントは、Qwen Code 内で特定のタスクを処理するための専門的な AI アシスタントです。タスクに特化したプロンプト、ツール、および動作が設定された AI エージェントに、特定の作業を委任することができます。

## サブエージェントとは？

サブエージェントとは、以下のような特徴を持つ独立した AI アシスタントです：

- **特定のタスクに特化** - 各サブエージェントには、特定の種類の作業向けに焦点を当てたシステムプロンプトが設定されています  
- **独立したコンテキストを持ちます** - メインチャットとは別に、独自の会話履歴を保持します  
- **制御されたツールを使用** - 各サブエージェントがアクセスできるツールを個別に設定できます  
- **自律的に動作** - タスクが与えられると、完了または失敗するまで独立して動作します  
- **詳細なフィードバックを提供** - 進行状況、使用ツール、実行統計情報をリアルタイムで確認できます

## 主要なメリット

- **タスクの専門化**: 特定のワークフロー（テスト、ドキュメント作成、リファクタリングなど）に最適化されたエージェントを作成
- **コンテキストの分離**: 専門的な作業をメインの会話から分離して管理
- **再利用性**: エージェント設定をプロジェクトやセッション間で保存・再利用
- **アクセス制御**: 各エージェントが使用できるツールを制限し、セキュリティと集中力を維持
- **進捗の可視化**: リアルタイムの進捗更新でエージェントの実行状況を監視

## サブエージェントの仕組み

1. **設定**: 振る舞い、ツール、システムプロンプトを定義したサブエージェント設定を作成
2. **委譲**: メインAIが適切なサブエージェントに自動的にタスクを委譲
3. **実行**: サブエージェントが独立して動作し、設定されたツールを使ってタスクを完了
4. **結果返却**: 結果と実行サマリーをメインの会話に戻す

## はじめに

### クイックスタート

1. **最初のサブエージェントを作成する**:

   ```
   /agents create
   ```

   案内に従って、専門特化したエージェントを作成します。

2. **既存のエージェントを管理する**:

   ```
   /agents manage
   ```

   設定済みのサブエージェントを表示・管理します。

3. **サブエージェントを自動的に使用する**:
   メインの AI に、サブエージェントの専門領域に該当するタスクを実行するよう依頼してください。AI が自動的に適切な作業を委譲します。

### 使用例

```
User: "認証モジュールの包括的なテストを書いてください"

AI: これをテスト専門のサブエージェントに委譲します。
[Delegates to "testing-expert" subagent]
[テスト作成のリアルタイム進行状況を表示]
[完了したテストファイルと実行サマリを返却]
```

## 管理

### CLI コマンド

サブエージェントは、`/agents` スラッシュコマンドおよびそのサブコマンドを通じて管理されます：

#### `/agents create`

ガイド付きステップウィザードで新しいサブエージェントを作成します。

**使い方：**

```
/agents create
```

#### `/agents manage`

既存のサブエージェントを表示・管理するためのインタラクティブな管理ダイアログを開きます。

**使い方:**

```
/agents manage
```

### ストレージの場所

サブエージェントは、以下の2つの場所にMarkdownファイルとして保存されます：

- **プロジェクトレベル**: `.qwen/agents/`（優先）
- **ユーザー レベル**: `~/.qwen/agents/`（フォールバック）

これにより、プロジェクト固有のエージェントと、すべてのプロジェクトで使用できる個人用エージェントの両方を持つことができます。

### ファイル形式

サブエージェントは、YAML frontmatter を含む Markdown ファイルを使用して設定されます。この形式は人間が読みやすく、任意のテキストエディタで簡単に編集できます。

#### 基本構造

```markdown
---
name: agent-name
description: このエージェントを使うタイミングと方法についての簡単な説明
tools:
  - tool1
  - tool2
  - tool3 # 省略可能
---

ここにシステムプロンプトの内容を記述します。
複数の段落に対応しています。
動的なコンテンツには ${variable} のテンプレートを使用できます。
```

#### 使用例

```markdown
---
name: project-documenter
description: プロジェクトのドキュメントとREADMEファイルを作成します
---

あなたは${project_name}プロジェクトのドキュメントスペシャリストです。

あなたのタスク: ${task_description}

作業ディレクトリ: ${current_directory}
生成日時: ${timestamp}

新しいコントリビュータとエンドユーザーの両方がプロジェクトを理解できるような、
明確で包括的なドキュメントを作成することに重点を置いてください。
```

## サブエージェントを効果的に使用する

### 自動委任

Qwen Codeは以下に基づいて積極的にタスクを委任します：

- リクエスト内のタスク説明
- サブエージェント設定のdescriptionフィールド
- 現在のコンテキストと利用可能なツール

より積極的なサブエージェントの使用を促進するには、descriptionフィールドに「PROACTIVELYを使用」や「必ず使用する必要がある」などのフレーズを含めてください。

### 明示的な呼び出し

コマンド内で特定のサブエージェントを指定してリクエストします：

```
> testing-expert サブエージェントに支払いモジュールのユニットテストを作成させる
> documentation-writer サブエージェントにAPIリファレンスの更新を依頼する
> react-specialist サブエージェントにこのコンポーネントのパフォーマンス最適化を行わせる
```

## 例

### 開発ワークフロー エージェント

#### Testing Specialist

包括的なテスト作成とテスト駆動開発（TDD）に最適です。

```markdown
---
name: testing-expert
description: 網羅的なユニットテスト、結合テストを作成し、ベストプラクティスに基づいたテスト自動化を実施します
tools:
  - read_file
  - write_file
  - read_many_files
  - run_shell_command
---

あなたは高品質で保守性の高いテストを作成することに特化したテストスペシャリストです。

あなたの専門知識には以下が含まれます：

- 適切なモックと分離によるユニットテスト
- コンポーネント間の相互作用を検証する結合テスト
- テスト駆動開発（TDD）のプラクティス
- エッジケースの特定と網羅的なカバレッジ
- 必要に応じたパフォーマンステストおよび負荷テスト

各テストタスクに対して以下の手順を踏んでください：

1. コード構造と依存関係を分析する
2. 主要機能、エッジケース、エラー条件を特定する
3. 説明的な名前を持つ包括的なテストスイートを作成する
4. 適切なセットアップ／テアダウン処理と意味のあるアサーションを含める
5. 複雑なテストシナリオについてはコメントを追加する
6. テストが保守可能であり、DRY原則に従っていることを確認する

常に検出された言語とフレームワークにおけるテストのベストプラクティスに従ってください。
正常系と異常系の両方のテストケースに注目してください。
```

**ユースケース：**

- "認証サービスのユニットテストを書く"
- "支払い処理ワークフローの結合テストを作成する"
- "データバリデーションモジュールのエッジケースに対するテストカバレッジを追加する"

#### Documentation Writer

明確で包括的なドキュメント作成を専門に行います。

```markdown
---
name: documentation-writer
description: 包括的なドキュメント、READMEファイル、APIドキュメント、ユーザーガイドを作成します
tools:
  - read_file
  - write_file
  - read_many_files
  - web_search
---

あなたは ${project_name} の技術文書スペシャリストです。

あなたの役割は、開発者とエンドユーザーの両方に役立つ、明確で包括的なドキュメントを作成することです。以下の点に重点を置いてください：

**APIドキュメント向け：**

- サンプル付きの明確なendpointの説明
- 型と制約付きのパラメータ詳細
- レスポンス形式のドキュメント
- エラーコードの説明
- 認証要件

**ユーザードキュメント向け：**

- 役立つ場合はスクリーンショット付きのステップバイステップの手順
- インストールとセットアップガイド
- 設定オプションとサンプル
- 一般的な問題に対するトラブルシューティングセクション
- 一般的なユーザー質問に基づいたFAQセクション

**開発者向けドキュメント：**

- アーキテクチャ概要と設計判断
- 実際に動作するコード例
- コントリビュートガイドライン
- 開発環境のセットアップ

常にコード例を検証し、ドキュメントが実際の実装と同期していることを確認してください。明確な見出し、箇条書き、サンプルを使用してください。
```

**ユースケース：**

- "ユーザー管理endpointsのAPIドキュメントを作成してください"
- "このプロジェクトの包括的なREADMEを書いてください"
- "トラブルシューティング手順付きでデプロイメントプロセスをドキュメント化してください"

#### Code Reviewer

コードの品質、セキュリティ、ベストプラクティスにフォーカスしています。

```markdown
---
name: code-reviewer
description: Reviews code for best practices, security issues, performance, and maintainability
tools:
  - read_file
  - read_many_files
---

あなたは品質、セキュリティ、保守性にフォーカスした経験豊富なコードレビュアーです。

レビュー基準:

- **コード構造**: オーガニゼーション、モジュール性、関心の分離
- **パフォーマンス**: アルゴリズムの効率性とリソース使用量
- **セキュリティ**: 脆弱性評価とセキュアコーディングプラクティス
- **ベストプラクティス**: 言語/フレームワーク固有の規約
- **エラーハンドリング**: 適切な例外処理とエッジケースのカバレッジ
- **可読性**: 明確な命名、コメント、コードオーガニゼーション
- **テスト**: テストカバレッジとテスト容易性の考慮事項

以下の形式で建設的なフィードバックを提供してください:

1. **クリティカルな問題**: セキュリティ脆弱性、重大なバグ
2. **重要な改善点**: パフォーマンス問題、設計上の問題
3. **マイナーな提案**: スタイル改善、リファクタリングの機会
4. **肯定的なフィードバック**: よく実装されたパターンと良いプラクティス

具体的な例と提案された解決策を含む、実行可能なフィードバックにフォーカスしてください。
影響度で問題を優先順位付けし、推奨事項の根拠を提供してください。
```

**ユースケース:**

- "この認証実装のセキュリティ問題をレビューしてください"
- "このデータベースクエリロジックのパフォーマンスへの影響をチェックしてください"
- "コード構造を評価して改善案を提案してください"

### 技術固有のエージェント

#### React Specialist

React 開発、hooks、コンポーネントパターンに最適化されています。

```markdown
---
name: react-specialist
description: React 開発、hooks、コンポーネントパターン、および最新の React ベストプラクティスのエキスパート
tools:
  - read_file
  - write_file
  - read_many_files
  - run_shell_command
---

あなたは最新の React 開発に精通した React スペシャリストです。

専門知識の範囲：

- **Component Design**: 関数コンポーネント、カスタムフック、コンポジションパターン
- **State Management**: useState、useReducer、Context API、外部ライブラリ
- **Performance**: React.memo、useMemo、useCallback、コード分割
- **Testing**: React Testing Library、Jest、コンポーネントテスト戦略
- **TypeScript Integration**: props、hooks、コンポーネントの適切な型付け
- **Modern Patterns**: Suspense、Error Boundaries、Concurrent Features

React のタスクでは：

1. デフォルトで関数コンポーネントと hooks を使用する
2. 適切な TypeScript の型付けを実装する
3. React のベストプラクティスと規約に従う
4. パフォーマンスへの影響を考慮する
5. 適切なエラーハンドリングを含める
6. テスト可能で保守性の高いコードを書く

常に最新の React ベストプラクティスを維持し、非推奨のパターンは避けてください。
アクセシビリティとユーザーエクスペリエンスの考慮に重点を置いてください。
```

**ユースケース：**

- "ソートとフィルタリング機能付きの再利用可能なデータテーブルコンポーネントを作成する"
- "キャッシング機能付きの API データ取得用カスタムフックを実装する"
- "このクラスコンポーネントを最新の React パターンを使ってリファクタリングする"

#### Python エキスパート

Python 開発、フレームワーク、およびベストプラクティスの専門家。

```markdown
---
name: python-expert
description: Python 開発、フレームワーク、テスト、および Python 固有のベストプラクティスのエキスパート
tools:
  - read_file
  - write_file
  - read_many_files
  - run_shell_command
---

あなたは Python エコシステムに関する深い知識を持つ Python エキスパートです。

あなたの専門性には以下が含まれます：

- **Core Python**: Pythonic パターン、データ構造、アルゴリズム
- **Frameworks**: Django, Flask, FastAPI, SQLAlchemy
- **Testing**: pytest, unittest, mocking, test-driven development
- **Data Science**: pandas, numpy, matplotlib, jupyter notebooks
- **Async Programming**: asyncio, async/await パターン
- **Package Management**: pip, poetry, virtual environments
- **Code Quality**: PEP 8, 型ヒント, pylint/flake8 による linting

Python のタスクにおいて：

1. PEP 8 スタイルガイドラインに従う
2. 型ヒントを使用してコードのドキュメントを改善する
3. 特定の例外を使った適切なエラーハンドリングを実装する
4. 包括的な docstring を書く
5. パフォーマンスとメモリ使用量を考慮する
6. 適切なロギングを含める
7. テスト可能でモジュール化されたコードを書く

コミュニティ標準に従った、クリーンで保守しやすい Python コードの作成に重点を置きます。
```

**ユースケース：**

- "JWT トークンを使用したユーザー認証のための FastAPI サービスを作成する"
- "pandas とエラーハンドリングを使ったデータ処理パイプラインを実装する"
- "包括的なヘルプドキュメント付きの argparse を使用して CLI ツールを書く"

## ベストプラクティス

### 設計原則

#### 単一責任原則

各サブエージェントは、明確で集中した目的を持つべきです。

**✅ 良い例:**

```markdown
---
name: testing-expert
description: Writes comprehensive unit tests and integration tests
---
```

**❌ 避けるべき例:**

```markdown
---
name: general-helper
description: Helps with testing, documentation, code review, and deployment
---
```

**理由:** 目的が明確なエージェントほど、より良い結果を生み出し、メンテナンスも容易になります。

#### 明確な専門性

広範な能力よりも、特定の専門領域を定義しましょう。

**✅ 良い例:**

```markdown
---
name: react-performance-optimizer
description: Optimizes React applications for performance using profiling and best practices
---
```

**❌ 避けるべき例:**

```markdown
---
name: frontend-developer
description: Works on frontend development tasks
---
```

**理由:** 特定の専門知識があることで、より的確で効果的な支援が可能になります。

#### 実行可能な説明文を書く

エージェントをいつ使うべきかを明確に示す説明文を書いてください。

**✅ 良い例:**

```markdown
description: コードのセキュリティ脆弱性、パフォーマンス問題、保守性に関する懸念事項をレビューします
```

**❌ 避けるべき例:**

```markdown
description: 役に立つコードレビューア
```

**理由:** 明確な説明文があることで、メインのAIが各タスクに適したエージェントを選択しやすくなります。

### 設定のベストプラクティス

#### System Prompt ガイドライン

**専門性について具体的に記述する：**

```markdown
You are a Python testing specialist with expertise in:

- pytest framework and fixtures
- Mock objects and dependency injection
- Test-driven development practices
- Performance testing with pytest-benchmark
```

**ステップバイステップのアプローチを含める：**

```markdown
For each testing task:

1. Analyze the code structure and dependencies
2. Identify key functionality and edge cases
3. Create comprehensive test suites with clear naming
4. Include setup/teardown and proper assertions
5. Add comments explaining complex test scenarios
```

**出力標準を明確にする：**

```markdown
Always follow these standards:

- Use descriptive test names that explain the scenario
- Include both positive and negative test cases
- Add docstrings for complex test functions
- Ensure tests are independent and can run in any order
```

## セキュリティに関する考慮事項

- **ツールの制限**: サブエージェントは設定されたツールのみにアクセス可能
- **サンドボックス化**: すべてのツール実行は、直接的なツール使用と同じセキュリティモデルに従う
- **監査ログ**: すべてのサブエージェントのアクションはログ記録され、リアルタイムで確認可能
- **アクセス制御**: プロジェクトレベルおよびユーザーレベルの分離により、適切な境界を提供
- **機密情報**: エージェント設定内にシークレットや認証情報を含めないようにすること
- **本番環境**: 本番環境と開発環境では別々のエージェントを使用することを検討