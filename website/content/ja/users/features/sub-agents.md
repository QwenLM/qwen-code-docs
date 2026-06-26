# サブエージェント

サブエージェントは、Qwen Code 内で特定の種類のタスクを処理するための専門化されたAIアシスタントです。タスク固有のプロンプト、ツール、動作を設定したAIエージェントに、集中した作業を委任できます。

## サブエージェントとは

サブエージェントは独立したAIアシスタントであり、以下の特徴があります:

- **特定のタスクに特化** - 各サブエージェントは、特定の種類の作業に焦点を当てたシステムプロンプトで設定されています
- **個別のコンテキストを持つ** - メインのチャットとは別に、独自の会話履歴を維持します
- **制御されたツールを使用** - 各サブエージェントがアクセスできるツールを設定できます
- **自律的に動作** - タスクを与えられると、完了または失敗するまで独立して動作します
- **詳細なフィードバックを提供** - 進捗状況、ツール使用状況、実行統計をリアルタイムで確認できます

## Fork サブエージェント

名前付きサブエージェントに加えて、Qwen Code は **フォーク** をサポートしています。これは `subagent_type: "fork"` で明示的に選択します（インタラクティブセッションで利用可能）。フォークは親の完全な会話コンテキストを継承し、バックグラウンドでデタッチされて実行されます。`subagent_type` を省略した場合、**フォークにはなりません**。汎用サブエージェントが起動され、完了まで実行され、結果がインラインで返されます。

### フォークと名前付きサブエージェントの違い

|               | 名前付きサブエージェント                    | Fork サブエージェント                                         |
| ------------- | --------------------------------- | ----------------------------------------------------- |
| コンテキスト       | 新規開始、親の履歴なし   | 親の完全な会話履歴を継承           |
| システムプロンプト | 自身の設定済みプロンプトを使用    | 親のシステムプロンプトをそのまま使用（キャッシュ共有のため）      |
| 実行     | 完了するまで親をブロック      | バックグラウンドで実行、親は即座に続行      |
| ユースケース      | 専門タスク（テスト、ドキュメント） | 現在のコンテキストが必要な並列タスク          |

### フォークが使用される場面

AI は以下の必要がある場合に自動的にフォークを使用します:

- 複数の調査タスクを並列実行する場合（例：「モジュールA、B、Cを調査してください」）
- メインの会話を続けながらバックグラウンド作業を実行する場合
- 現在の会話コンテキストの理解が必要なタスクを委任する場合

### プロンプトキャッシュの共有

すべてのフォークは親のAPIリクエストプレフィックス（システムプロンプト、ツール、会話履歴）をそのまま共有するため、DashScope プロンプトキャッシュがヒットします。3つのフォークが並列実行されると、共有プレフィックスは一度キャッシュされて再利用され、独立したサブエージェントと比較してトークンコストを80%以上削減します。

### 再帰的フォークの防止

フォークの子はさらにフォークを作成できません。これは実行時に強制されます。フォークが別のフォークを生成しようとすると、タスクを直接実行するように指示するエラーが返されます。

### 現在の制限事項

- **結果のフィードバックなし**: フォークの結果はUIの進捗表示に反映されますが、メインの会話に自動的にフィードバックされることはありません。親AIはプレースホルダーメッセージを認識し、フォークの出力に基づいて行動することはできません。
- **ワークツリーの分離なし**: フォークは親の作業ディレクトリを共有します。複数のフォークが同時にファイルを変更すると、競合が発生する可能性があります。

## 主な利点

- **タスクの特化**: 特定のワークフロー（テスト、ドキュメント、リファクタリングなど）に最適化されたエージェントを作成
- **コンテキストの分離**: 専門的な作業をメインの会話から分離して保持
- **コンテキストの継承**: フォークサブエージェントは、コンテキストが重要な並列タスクのために完全な会話を継承
- **プロンプトキャッシュの共有**: フォークサブエージェントは親のキャッシュプレフィックスを共有し、トークンコストを削減
- **再利用性**: エージェント設定をプロジェクトやセッション間で保存および再利用
- **アクセス制御**: 各エージェントが使用できるツールをセキュリティと集中力のために制限
- **進捗の可視化**: リアルタイムの進捗更新でエージェントの実行を監視

## サブエージェントの仕組み

1. **設定**: サブエージェントの動作、ツール、システムプロンプトを定義する設定を作成します
2. **委任**: メインAIは自動的に適切なサブエージェントにタスクを委任できます。また、完全な会話コンテキストを継承して中間出力を破棄したい場合は、自分自身をフォーク（`subagent_type: "fork"`）できます
3. **実行**: サブエージェントは独立して動作し、設定されたツールを使用してタスクを完了します
4. **結果**: 結果と実行サマリーをメインの会話に返します

## はじめに

### クイックスタート

1. **最初のサブエージェントを作成**:

   `/agents create`

   ガイド付きウィザードに従って、専門エージェントを作成します。

2. **既存のエージェントを管理**:

   `/agents manage`

   設定済みのサブエージェントを表示および管理します。

3. **サブエージェントを自動的に使用**: サブエージェントの専門分野に一致するタスクをメインAIに依頼するだけで、AIが自動的に適切な作業を委任します。

### 使用例

```
ユーザー: "認証モジュールの包括的なテストを書いてください"
AI: このタスクはテスト専門のサブエージェントに委任します。
[サブエージェント "testing-expert" に委任]
[テスト作成のリアルタイム進捗を表示]
[完了したテストファイルと実行サマリーを返す]
```

## 管理

### CLI コマンド

サブエージェントは `/agents` スラッシュコマンドとそのサブコマンドで管理します:

**使用方法:** `/agents create`。ガイド付きステップウィザードを通じて新しいサブエージェントを作成します。

**使用方法:** `/agents manage`。インタラクティブな管理ダイアログを開き、既存のサブエージェントを表示および管理します。

### 保存場所

サブエージェントは複数の場所にMarkdownファイルとして保存されます:

- **プロジェクトレベル**: `.qwen/agents/`（最優先）
- **ユーザーレベル**: `~/.qwen/agents/`（フォールバック）
- **拡張機能レベル**: インストールされた拡張機能によって提供

これにより、プロジェクト固有のエージェント、すべてのプロジェクトで機能する個人用エージェント、および特殊な機能を追加する拡張機能提供のエージェントを持つことができます。

### 拡張機能サブエージェント

拡張機能は、有効にすると利用可能になるカスタムサブエージェントを提供できます。これらのエージェントは拡張機能の `agents/` ディレクトリに保存され、個人用およびプロジェクト用エージェントと同じ形式に従います。

拡張機能サブエージェント:

- 拡張機能が有効になると自動的に検出されます
- `/agents manage` ダイアログの「拡張機能エージェント」セクションに表示されます
- 直接編集することはできません（代わりに拡張機能のソースを編集してください）
- ユーザー定義エージェントと同じ設定形式に従います

サブエージェントを提供する拡張機能を確認するには、拡張機能の `qwen-extension.json` ファイルの `agents` フィールドを確認してください。

### ファイル形式

サブエージェントはYAMLフロントマター付きのMarkdownファイルを使用して設定します。この形式は人間が読みやすく、任意のテキストエディタで簡単に編集できます。

#### 基本構造

```
---
name: agent-name
description: このエージェントをいつ、どのように使用するかの簡単な説明
model: inherit # オプション: inherit, fast, modelId, または authType:modelId
approvalMode: auto-edit # オプション: default, plan, auto-edit, yolo, bubble
tools:         # オプション: 許可リストのツール
  - tool1
  - tool2
disallowedTools: # オプション: ブロックリストのツール
  - tool3
---

システムプロンプトの内容をここに記述します。
複数の段落がサポートされています。
```

#### モデル選択

オプションの `model` フロントマターフィールドを使用して、サブエージェントが使用するモデルを制御します:

- `inherit`: メインの会話と同じモデルを使用します。
- フィールドを省略: `inherit` と同じ。
- `fast`: 設定された `fastModel` を使用します。有効なfastモデルが設定されていない場合、サブエージェントは `inherit` にフォールバックします。
- `glm-5`: そのモデルIDを使用します。Qwen Codeは最初にメインの会話の認証タイプを確認します。そのモデルが利用できない場合、別の設定済みプロバイダーからモデルを解決できます。
- `openai:gpt-4o`: 明示的なプロバイダーとモデルIDを使用します。これは、サブエージェントをメインの会話とは異なる認証タイプで登録されたモデルで実行する必要がある場合に便利です。

例:

```
---
name: fast-reviewer
description: 設定された高速モデルで小さな差分をレビューします
model: fast
tools:
  - read_file
  - grep_search
---
```

```
---
name: openai-researcher
description: 調査タスクにOpenAI互換プロバイダーを使用します
model: openai:gpt-4o
tools:
  - read_file
  - grep_search
  - glob
---
```

`fast` セレクターは、`settings.json` または `/model --fast` で設定された同じ `fastModel` 設定を使用します。その設定自体が、`openai:deepseek-v4-flash` のように別の設定済み認証タイプのモデルを参照する場合があります。セレクターが別の認証タイプに解決されると、Qwen Codeはそのサブエージェントリクエスト用に専用のランタイムプロバイダーを作成し、プロバイダーにはベアのモデルIDのみを送信します。

#### 許可モード

オプションの `approvalMode` フロントマターフィールドを使用して、サブエージェントのツール呼び出しがどのように承認されるかを制御します。有効な値:

- `default`: ツールはインタラクティブな承認が必要（メインセッションのデフォルトと同じ）
- `plan`: 分析のみモード — エージェントは計画を立てますが、変更は実行しません
- `auto-edit`: ツールはプロンプトなしで自動承認（ほとんどのエージェントに推奨）
- `yolo`: すべてのツールが自動承認（破壊的な可能性があるものを含む）
- `bubble`: バックグラウンドエージェントのツール承認が親セッションに表示されます

このフィールドを省略した場合、サブエージェントの許可モードは自動的に決定されます:

- 親セッションが **yolo** または **auto-edit** モードの場合、サブエージェントはそのモードを継承します。許可的な親は許可的なままです。
- 親セッションが **plan** モードの場合、サブエージェントはplanモードのままです。分析のみのセッションは、委任されたエージェントを通じてファイルを変更できません。
- 親セッションが **default** モード（信頼されたフォルダ内）の場合、サブエージェントは **auto-edit** を取得し、自律的に動作できます。

`approvalMode` を設定した場合でも、親の許可モードが優先されます。たとえば、親がyoloモードの場合、`approvalMode: plan` のサブエージェントでもyoloモードで実行されます。

```
---
name: cautious-reviewer
description: 変更を行わずにコードをレビューします
approvalMode: plan
tools:
  - read_file
  - grep_search
  - glob
---

あなたはコードレビュアーです。コードを分析し、結果を報告してください。
ファイルは変更しないでください。
```

#### ツール設定

`tools` および `disallowedTools` を使用して、サブエージェントがアクセスできるツールを制御します。

**`tools` (許可リスト):** 指定すると、サブエージェントはリストされたツールのみを使用できます。省略すると、サブエージェントは親セッションから利用可能なすべてのツールを継承します。

```
---
name: reader
description: コード探索のための読み取り専用エージェント
tools:
  - read_file
  - grep_search
  - glob
  - list_directory
---
```

**`disallowedTools` (ブロックリスト):** 指定すると、リストされたツールがサブエージェントのツールプールから削除されます。これは、すべての許可ツールをリストせずに「X以外のすべて」を許可したい場合に便利です。

```
---
name: safe-worker
description: ファイルを変更できないエージェント
disallowedTools:
  - write_file
  - edit
  - run_shell_command
---
```

`tools` と `disallowedTools` の両方が設定されている場合、許可リストが最初に適用され、次にブロックリストがそのセットから削除されます。

**MCP ツール** も同じルールに従います。サブエージェントに `tools` リストがない場合、親セッションからすべてのMCPツールを継承します。サブエージェントに明示的な `tools` リストがある場合、そのリストに明示的に名前が含まれているMCPツールのみを取得します。

`disallowedTools` フィールドは、MCPサーバーレベルのパターンをサポートします:

- `mcp__server__tool_name` — 特定のMCPツールをブロック
- `mcp__server` — そのMCPサーバーのすべてのツールをブロック

```
---
name: no-slack
description: Slackアクセスがないエージェント
disallowedTools:
  - mcp__slack
---
```

#### Claude Code 互換性フィールド

Qwen Code は、以下の Claude Code 2.1.168 フロントマターフィールドを受け入れます。これにより、CCのエージェントファイルを `.qwen/agents/` にドロップすると、サポートされているフィールドが同一に解析されます。無効な値を持つオプションフィールドは、拒否されるのではなく解析時に静かにドロップされます。これはCCが使用するのと同じ寛容な姿勢です。

| フィールド            | 型             | 備考                                                                                                                                                                                                                                                                            |
| ---------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `permissionMode` | enum string      | `acceptEdits`, `auto`, `bypassPermissions`, `default`, `dontAsk`, `plan`。解析時に `approvalMode` にマッピングされます。両方が設定されている場合、明示的な `approvalMode` が優先されます。                                                                                                           |
| `maxTurns`       | 正の整数 | エージェントのターン予算を制限します。実行時に `runConfig.max_turns` に配線されます。両方が設定されている場合、トップレベルのフィールドが優先されます。保存時に、レガシーのネストされた値はファイルから削除され、2つの真実のソースを防ぎます。                                                           |
| `color`          | enum string      | 表示色。許可リスト: `red`, `blue`, `green`, `yellow`, `purple`, `orange`, `pink`, `cyan` (CCの `_Y` をミラー)。レガシーのqwenセンチネル `auto` は後方互換性のために保持されます。その他の値は解析時に静かにドロップされます。                                         |
| `mcpServers`     | レコード of specs  | エージェントごとのMCPサーバーオーバーライド。エージェントが起動するときにセッションレベルのMCPサーバーセットとマージされます。キーが衝突した場合、エージェントの仕様が優先されます（CCの `scope: 'agent'` セマンティクスに一致）。不正なエントリは、エージェント全体を失敗させるのではなく、キーごとに警告付きでドロップされます。 |
| `hooks`          | レコード of 配列 | エージェントごとのフック。キーはCCフックイベント名（`PreToolUse`, `PostToolUse`, `UserPromptSubmit`, …）。値は、`settings.json` の `hooks` フィールドと同じ形状の `{ matcher?, hooks: [...] }` 定義の配列です。エージェントの実行中に登録され、停止時に削除されます。  |

上記すべてを使用した例:

```
---
name: rigorous-reviewer
description: ターン制限付きの詳細なコードレビュー
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

あなたはコードレビュアーです。コードを徹底的に分析し、重大度順に結果を報告してください。
```

残りのCCフロントマターフィールド（`effort`, `skills`, `initialPrompt`, `memory`, `isolation`）は、宣言的エージェント設計ドキュメントに文書化されており、前提となるインフラストラクチャが存在するようになったら、後続のPRで実装されます（`effort` はモデルレイヤーのパラメーターが必要、`memory` はスコープ付きメモリサブシステムが必要、`--agent` CLIフラグは `initialPrompt` を有効にする、など）。

> **`hooks` v1 の制限事項。** `hooks` を宣言するサブエージェントが実行されている間、そのフックエントリは、そのサブエージェント自身のツール呼び出しだけでなく、セッション内のすべての一致するイベントに対して発火します。異なるエージェントごとのフックセットを持つ2つのサブエージェントが同時に実行される場合、両方のセットが両方のエージェントに対して発火します。エージェントごとのスコープフィルタリングは後続の対応に委ねられます。v1では、エージェントの実行期間中グローバルに発火しても安全なエージェントごとのフック（例: ログ記録）を、動作を変更するフックよりも優先してください。

#### 使用例

```
---
name: project-documenter
description: プロジェクトのドキュメントとREADMEファイルを作成します
---

あなたはドキュメンテーションスペシャリストです。

新しいコントリビューターとエンドユーザーの両方がプロジェクトを理解するのに役立つ、
明確で包括的なドキュメントの作成に焦点を当ててください。
```

## サブエージェントを効果的に使用する

### 自動委任

Qwen Code は以下に基づいて積極的にタスクを委任します:

- リクエスト内のタスク説明
- サブエージェント設定の description フィールド
- 現在のコンテキストと利用可能なツール

より積極的なサブエージェントの使用を促進するには、description フィールドに「use PROACTIVELY」や「MUST BE USED」などのフレーズを含めてください。

### 明示的な呼び出し

コマンドで特定のサブエージェントを言及して呼び出します:

```
testing-expert サブエージェントに決済モジュールの単体テストを作成させてください
documentation-writer サブエージェントにAPIリファレンスを更新させてください
react-specialist サブエージェントにこのコンポーネントのパフォーマンスを最適化させてください
```

## 例

### 開発ワークフローエージェント

#### テストスペシャリスト

包括的なテスト作成とテスト駆動開発に最適です。

```
---
name: testing-expert
description: 包括的な単体テスト、統合テストを作成し、ベストプラクティスでテスト自動化を処理します
tools:
  - read_file
  - write_file
  - read_many_files
  - run_shell_command
---

あなたはテストスペシャリストです。高品質で保守可能なテストの作成に焦点を当てています。

専門知識には以下が含まれます:

- 適切なモックと分離を備えた単体テスト
- コンポーネント間の相互作用のための統合テスト
- テスト駆動開発のプラクティス
- エッジケースの特定と包括的なカバレッジ
- パフォーマンステストとロードテスト（適切な場合）

各テストタスクについて:

1. コード構造と依存関係を分析する
2. 主要機能、エッジケース、エラー条件を特定する
3. 説明的な名前を持つ包括的なテストスイートを作成する
4. 適切なセットアップ/ティアダウンと意味のあるアサーションを含める
5. 複雑なテストシナリオを説明するコメントを追加する
6. テストが保守可能でDRY原則に従っていることを確認する

検出された言語とフレームワークのテストベストプラクティスに常に従ってください。
ポジティブテストケースとネガティブテストケースの両方に焦点を当ててください。
```

**使用例:**

- 「認証サービスの単体テストを書いてください」
- 「支払い処理ワークフローの統合テストを作成してください」
- 「データ検証モジュールのエッジケースのテストカバレッジを追加してください」

#### ドキュメントライター

明確で包括的なドキュメントの作成に特化しています。

```
---
name: documentation-writer
description: 包括的なドキュメント、READMEファイル、APIドキュメント、ユーザーガイドを作成します
tools:
  - read_file
  - write_file
  - read_many_files
---

あなたはテクニカルドキュメンテーションスペシャリストです。

あなたの役割は、開発者とエンドユーザーの両方に役立つ、
明確で包括的なドキュメントを作成することです。以下に焦点を当ててください:

**APIドキュメントの場合:**

- 例を用いた明確なエンドポイントの説明
- 型と制約を含むパラメーターの詳細
- レスポンス形式のドキュメント
- エラーコードの説明
- 認証要件

**ユーザードキュメントの場合:**

- 役立つ場合はスクリーンショット付きのステップバイステップの手順
- インストールとセットアップガイド
- 設定オプションと例
- 一般的な問題のトラブルシューティングセクション
- よくあるユーザー質問に基づくFAQセクション

**開発者ドキュメントの場合:**

- アーキテクチャの概要と設計上の決定
- 実際に動作するコード例
- コントリビューションガイドライン
- 開発環境のセットアップ

コード例を常に検証し、ドキュメントが実際の実装と最新の状態を保つようにしてください。明確な見出し、箇条書き、例を使用してください。
```

**使用例:**

- 「ユーザー管理エンドポイントのAPIドキュメントを作成してください」
- 「このプロジェクトの包括的なREADMEを書いてください」
- 「トラブルシューティング手順を含むデプロイメントプロセスを文書化してください」

#### コードレビュアー

コード品質、セキュリティ、ベストプラクティスに焦点を当てています。

```
---
name: code-reviewer
description: コードをベストプラクティス、セキュリティ問題、パフォーマンス、保守性についてレビューします
tools:
  - read_file
  - read_many_files
---

あなたは経験豊富なコードレビュアーであり、品質、セキュリティ、保守性に焦点を当てています。

レビュー基準:

- **コード構造**: 整理、モジュール性、関心の分離
- **パフォーマンス**: アルゴリズムの効率性とリソース使用量
- **セキュリティ**: 脆弱性評価とセキュアコーディングプラクティス
- **ベストプラクティス**: 言語/フレームワーク固有の規約
- **エラーハンドリング**: 適切な例外処理とエッジケースのカバレッジ
- **可読性**: 明確な命名、コメント、コード構成
- **テスト**: テストカバレッジとテスト容易性の考慮事項

以下のように建設的なフィードバックを提供してください:

1. **重大な問題**: セキュリティの脆弱性、主要なバグ
2. **重要な改善点**: パフォーマンスの問題、設計上の問題
3. **マイナーな提案**: スタイルの改善、リファクタリングの機会
4. **ポジティブなフィードバック**: 適切に実装されたパターンと良いプラクティス

具体的な例と提案された解決策を含む、実行可能なフィードバックに焦点を当ててください。影響度で問題に優先順位を付け、推奨事項の根拠を提供してください。
```
**使用例:**

- 「この認証実装をセキュリティ上の問題についてレビューする」
- 「このデータベースクエリロジックのパフォーマンスへの影響を確認する」
- 「コード構造を評価し、改善点を提案する」

### テクノロジー特化型エージェント

#### Reactスペシャリスト

React開発、フック、コンポーネントパターンに最適化されています。

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

**使用例:**

- 「ソートとフィルタリング機能を持つ再利用可能なデータテーブルコンポーネントを作成する」
- 「キャッシング付きAPIデータ取得用のカスタムフックを実装する」
- 「このクラスコンポーネントをモダンなReactパターンにリファクタリングする」

#### Pythonエキスパート

Python開発、フレームワーク、ベストプラクティスに特化しています。

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

**使用例:**

- 「JWTトークンを使用したユーザー認証用のFastAPIサービスを作成する」
- 「pandasを使用したエラーハンドリング付きデータ処理パイプラインを実装する」
- 「argparseを使用し、包括的なヘルプドキュメントを備えたCLIツールを作成する」

## ベストプラクティス

### 設計原則

#### 単一責任の原則

各Subagentは明確で焦点を絞った目的を持つべきです。

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

**理由:** 焦点を絞ったエージェントの方が、より良い結果を生み出し、保守も容易です。

#### 明確な特化

広範な機能ではなく、特定の専門領域を定義します。

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

**理由:** 特定の専門知識により、より的を絞った効果的な支援が可能になります。

#### 実用的な説明

エージェントをいつ使用すべきかが明確にわかる説明を書きましょう。

**✅ 良い例:**

```
description: Reviews code for security vulnerabilities, performance issues, and maintainability concerns
```

**❌ 避けるべき例:**

```
description: A helpful code reviewer
```

**理由:** 明確な説明は、メインのAIが各タスクに適したエージェントを選択するのに役立ちます。

### 設定のベストプラクティス

#### システムプロンプトのガイドライン

**専門性を明確に:**

```
You are a Python testing specialist with expertise in:

- pytest framework and fixtures
- Mock objects and dependency injection
- Test-driven development practices
- Performance testing with pytest-benchmark
```

**段階的なアプローチを含める:**

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

- **ツール制限**: `tools`を使用してサブエージェントがアクセスできるツールを制限するか、`disallowedTools`を使用して特定のツールをブロックしながら他のツールは継承することができます
- **権限モード**: サブエージェントはデフォルトで親エージェントの権限モードを継承します。プランモードのセッションは、委任されたエージェントを通じてauto-editにエスカレーションすることはできません。特権モード（auto-edit、yolo）は信頼できないフォルダではブロックされます。
- **プロバイダー選択**: `model: authType:modelId` または `model: fast`（`fastModel`が別の認証タイプに解決される場合）を使用するサブエージェントは、そのサブエージェントのモデルリクエストを選択されたプロバイダーに送信します。そのプロバイダーがサブエージェントのタスクとデータに適切であることを確認してください。
- **サンドボックス化**: すべてのツール実行は、直接ツールを使用する場合と同じセキュリティモデルに従います
- **監査証跡**: すべてのSubagentのアクションはログに記録され、リアルタイムで表示可能です
- **アクセス制御**: プロジェクトレベルおよびユーザーレベルの分離により、適切な境界が提供されます
- **機密情報**: エージェント設定にシークレットや認証情報を含めないでください
- **本番環境**: 開発環境と本番環境には、それぞれ別のエージェントを用意することを検討してください

## 制限事項

Subagent設定には以下のソフト警告が適用されます（ハード制限はありません）:

- **説明フィールド**: 説明が1,000文字を超えると警告が表示されます
- **システムプロンプト**: システムプロンプトが10,000文字を超えると警告が表示されます