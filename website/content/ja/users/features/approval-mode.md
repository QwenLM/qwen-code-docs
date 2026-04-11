# 承認モード

Qwen Code は、タスクの複雑さやリスクレベルに応じて AI がコードやシステムとどのように対話するかを柔軟に制御できる、4 つの権限モードを提供します。

## 権限モードの比較

| モード           | ファイル編集                | シェルコマンド              | 推奨用途                                                                                               | リスクレベル |
| -------------- | --------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------ | ---------- |
| **Plan**​      | ❌ 読み取り専用分析のみ  | ❌ 実行しない             | • コードの探索 <br>• 複雑な変更の計画 <br>• 安全なコードレビュー                               | 最低     |
| **Default**​   | ✅ 手動承認が必要 | ✅ 手動承認が必要 | • 新規/不慣れなコードベース <br>• 重要なシステム <br>• チームコラボレーション <br>• 学習と教育 | 低        |
| **Auto-Edit**​ | ✅ 自動承認            | ❌ 手動承認が必要 | • 日常の開発タスク <br>• リファクタリングとコード改善 <br>• 安全な自動化                | 中     |
| **YOLO**​      | ✅ 自動承認            | ✅ 自動承認            | • 信頼できる個人プロジェクト <br>• 自動化スクリプト/CI/CD <br>• バッチ処理タスク                 | 最高    |

### クイックリファレンスガイド

- **Plan モードから始める**: 変更を加える前にコードを理解するのに最適
- **Default モードで作業する**: ほとんどの開発作業にバランスの取れた選択肢
- **Auto-Edit に切り替える**: 安全なコード変更を多数行う場合
- **YOLO は控えめに使う**: 制御された環境での信頼できる自動化のみに使用

> [!tip]
>
> セッション中に **Shift+Tab**（Windows では **Tab**）を使用して、モードを素早く切り替えることができます。ターミナルのステータスバーに現在のモードが表示されるため、Qwen Code が持つ権限を常に把握できます。

## 1. 安全なコード分析に Plan モードを使用する

Plan モードは、Qwen Code に **読み取り専用** 操作でコードベースを分析して計画を作成するよう指示します。コードベースの探索、複雑な変更の計画、安全なコードレビューに最適です。

### Plan モードを使用するタイミング

- **複数ステップの実装**: 機能の実装に多数のファイル編集が必要な場合
- **コードの探索**: 変更を加える前にコードベースを徹底的に調査したい場合
- **インタラクティブな開発**: Qwen Code と対話しながら方向性を反復して改善したい場合

### Plan モードの使用方法

**セッション中に Plan モードを有効にする**

セッション中に **Shift+Tab**（Windows では **Tab**）を使用して権限モードを切り替え、Plan モードに移動できます。

通常モードにいる場合、**Shift+Tab**（Windows では **Tab**）を最初に押すと `auto-edits` モードに切り替わり、ターミナル下部に `⏵⏵ accept edits on` と表示されます。再度 **Shift+Tab**（Windows では **Tab**）を押すと Plan モードに切り替わり、`⏸ plan mode` と表示されます。

**`/plan` コマンドを使用する**

`/plan` コマンドは、Plan モードの開始と終了を素早く行うショートカットを提供します：

```bash
/plan                          # Enter plan mode
/plan refactor the auth module # Enter plan mode and start planning
/plan exit                     # Exit plan mode, restore previous mode
```

`/plan exit` で Plan モードを終了すると、以前の承認モードが自動的に復元されます（例：Plan モードに入る前に Auto-Edit モードだった場合、Auto-Edit モードに戻ります）。

**Plan モードで新しいセッションを開始する**

Plan モードで新しいセッションを開始するには、`/approval-mode` を実行して `plan` を選択します。

```bash
/approval-mode
```

**Plan モードでヘッドレスクエリを実行する**

`-p` または `prompt` オプションを使用して、Plan モードで直接クエリを実行することもできます：

```bash
qwen --prompt "What is machine learning?"
```

### 例：複雑なリファクタリングの計画

```bash
/plan I need to refactor our authentication system to use OAuth2. Create a detailed migration plan.
```

Qwen Code は Plan モードに入り、現在の実装を分析して詳細な計画を作成します。フォローアップの質問で計画を洗練させましょう：

```
What about backward compatibility?
How should we handle database migration?
```

### Plan モードをデフォルトとして設定する

```json
// .qwen/settings.json
{
  "permissions": {
    "defaultMode": "plan"
  }
}
```

## 2. 制御された対話に Default モードを使用する

Default モードは、Qwen Code を使用する標準的な方法です。このモードでは、潜在的にリスクのあるすべての操作を完全に制御できます。Qwen Code はファイルの変更やシェルコマンドの実行を行う前に、必ず承認を求めます。

### Default モードを使用するタイミング

- **コードベースに不慣れな場合**: 不慣れなプロジェクトを探索し、特に慎重に作業したい場合
- **重要なシステム**: 本番環境のコード、インフラストラクチャ、または機密データを扱う場合
- **学習と教育**: Qwen Code が実行する各ステップを理解したい場合
- **チームコラボレーション**: 複数のメンバーが同じコードベースで作業している場合
- **複雑な操作**: 変更が複数のファイルや複雑なロジックに及ぶ場合

### Default モードの使用方法

**セッション中に Default モードを有効にする**

セッション中に **Shift+Tab**（Windows では **Tab**）を使用して権限モードを切り替え、Default モードに移動できます。他のモードにいる場合、**Shift+Tab**（Windows では **Tab**）を繰り返し押すと最終的に Default モードに戻ります。ターミナル下部にモードインジケーターが表示されなくなっていることで確認できます。

**Default モードで新しいセッションを開始する**

Default モードは、Qwen Code 起動時の初期モードです。モードを変更した後で Default モードに戻したい場合は、以下を使用します：

```
/approval-mode default
```

**Default モードでヘッドレスクエリを実行する**

ヘッドレスコマンドを実行する場合、Default モードがデフォルトの動作です。明示的に指定するには以下を使用します：

```
qwen --prompt "Analyze this code for potential bugs"
```

### 例：機能を安全に実装する

```
/approval-mode default
```

```
I need to add user profile pictures to our application. The pictures should be stored in an S3 bucket and the URLs saved in the database.
```

Qwen Code はコードベースを分析して計画を提案します。その後、以下の操作を行う前に承認を求めます：

1. 新しいファイルの作成（コントローラー、モデル、マイグレーション）
2. 既存ファイルの変更（新しい列の追加、API の更新）
3. シェルコマンドの実行（データベースマイグレーション、依存関係のインストール）

提案された各変更を確認し、個別に承認または拒否できます。

### Default モードをデフォルトとして設定する

```bash
// .qwen/settings.json
{
  "permissions": {
"defaultMode": "default"
  }
}
```

## 3. Auto-Edit モード

Auto-Edit モードは、Qwen Code にファイル編集を自動的に承認させつつ、シェルコマンドには手動承認を要求するよう指示します。システムの安全性を維持しながら開発ワークフローを加速するのに最適です。

### Auto-Edit モードを使用するタイミング

- **日常の開発**: ほとんどのコーディングタスクに最適
- **安全な自動化**: 危険なコマンドの誤実行を防ぎつつ、AI によるコード変更を許可
- **チームコラボレーション**: 共有プロジェクトで他者への意図しない影響を避けるために使用

### このモードへの切り替え方法

```
# Switch via command
/approval-mode auto-edit

# Or use keyboard shortcut
Shift+Tab (or Tab on Windows) # Switch from other modes
```

### ワークフローの例

1. Qwen Code に関数のリファクタリングを依頼する
2. AI がコードを分析し、変更を提案する
3. 確認なしでファイル変更を **自動的に** 適用する
4. テストの実行が必要な場合、`npm test` の実行について **承認を要求する**

## 4. YOLO モード - 完全自動化

YOLO モードは Qwen Code に最高レベルの権限を付与し、ファイル編集やシェルコマンドを含むすべてのツール呼び出しを自動的に承認します。

### YOLO モードを使用するタイミング

- **自動化スクリプト**: 定義済みの自動化タスクを実行する場合
- **CI/CD パイプライン**: 制御された環境での自動実行
- **個人プロジェクト**: 完全に信頼できる環境での迅速な反復開発
- **バッチ処理**: 複数ステップのコマンドチェーンを必要とするタスク

> [!warning]
>
> **YOLO モードは慎重に使用する**: AI はターミナルの権限で任意のコマンドを実行できます。以下の点を確認してください：
>
> 1. 現在のコードベースを信頼していること
> 2. AI が実行するすべての操作を理解していること
> 3. 重要なファイルがバックアップ済み、またはバージョン管理システムにコミット済みであること

### YOLO モードの有効化方法

```
# Temporarily enable (current session only)
/approval-mode yolo

# Set as project default
/approval-mode yolo --project

# Set as user global default
/approval-mode yolo --user
```

### 設定例

```bash
// .qwen/settings.json
{
  "permissions": {
"defaultMode": "yolo",
"confirmShellCommands": false,
"confirmFileEdits": false
  }
}
```

### 自動化ワークフローの例

```bash
# Fully automated refactoring task
qwen --prompt "Run the test suite, fix all failing tests, then commit changes"

# Without human intervention, AI will:
# 1. Run test commands (auto-approved)
# 2. Fix failed test cases (auto-edit files)
# 3. Execute git commit (auto-approved)
```

## モードの切り替えと設定

### キーボードショートカットによる切り替え

Qwen Code セッション中、**Shift+Tab**（Windows では **Tab**）を使用して 4 つのモードを素早く切り替えることができます：

```
Default Mode → Auto-Edit Mode → YOLO Mode → Plan Mode → Default Mode
```

### 永続的な設定

```
// Project-level: ./.qwen/settings.json
// User-level: ~/.qwen/settings.json
{
  "permissions": {
"defaultMode": "auto-edit",  // or "plan" or "yolo"
"confirmShellCommands": true,
"confirmFileEdits": true
  }
}
```

### モード使用の推奨事項

1. **コードベースに不慣れな場合**: 安全な探索のために **Plan モード** から始める
2. **日常の開発タスク**: 効率的かつ安全な **Auto-Edit**（デフォルトモード）を使用する
3. **自動化スクリプト**: 制御された環境で完全自動化のために **YOLO モード** を使用する
4. **複雑なリファクタリング**: 詳細な計画のためにまず **Plan モード** を使用し、実行時に適切なモードに切り替える