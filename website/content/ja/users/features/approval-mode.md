# 承認モード

Qwen Code は、タスクの複雑さやリスクレベルに応じて AI とコード・システムのやり取りを柔軟に制御できる、5 つの異なる権限モードを提供します。

## 権限モードの比較

| モード                 | ファイル編集                      | シェルコマンド                    | 最適な用途                                                                                                       | リスクレベル |
| ---------------------- | --------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------ |
| **Plan**​              | ❌ 読み取り専用の分析のみ         | ❌ 実行されない                   | • コードの探索 <br>• 複雑な変更の計画 <br>• 安全なコードレビュー                                                | 最低         |
| **Ask Permissions**​   | ✅ 手動承認が必要                 | ✅ 手動承認が必要                 | • 新規／未知のコードベース <br>• 重要なシステム <br>• チームコラボレーション <br>• 学習と教育                    | 低           |
| **Auto-Edit**​         | ✅ 自動承認                       | ❌ 手動承認が必要                 | • 日常の開発タスク <br>• リファクタリングとコード改善 <br>• 安全な自動化                                        | 中           |
| **Auto**​              | ✅ 分類器による評価               | ✅ 分類器による評価               | • 長時間の自律セッション <br>• Auto-Edit では慎重すぎるが YOLO はリスクが高い場合                               | 中           |
| **YOLO**​              | ✅ 自動承認                       | ✅ 自動承認                       | • 信頼済みの個人プロジェクト <br>• 自動化スクリプト／CI/CD <br>• バッチ処理タスク                               | 最高         |

> [!NOTE]
>
> 以前 **Default** という名称だったモードは、動作をより正確に表現するために **Ask Permissions** に改名されました。設定値（`tools.approvalMode: "default"`）および `/approval-mode default` コマンドは後方互換性のため変更されていません。

### クイックリファレンス

- **Plan モードで開始**: 変更を加える前に内容を理解するのに最適
- **Ask Permissions モードで作業**: ほとんどの開発作業においてバランスの取れた選択
- **Auto-Edit に切り替え**: 安全なコード変更を多く行う場合
- **Auto モードを試す**: 中断を減らしたいがシェルコマンドやネットワーク呼び出しにはまだ安全性を確保したい場合 — LLM 分類器が各呼び出しを評価
- **YOLO は控えめに使用**: 制御された環境の信頼済み自動化にのみ使用

> [!tip]
>
> セッション中に **Shift+Tab**（Windows では **Tab**）を使ってモードを素早く切り替えられます。ターミナルのステータスバーに現在のモードが表示されるため、Qwen Code が持つ権限を常に確認できます。

> 切り替え順序: **plan → default → auto-edit → auto → yolo → plan → ...**

## 1. Plan モードで安全なコード分析を行う

Plan モードは、Qwen Code に**読み取り専用**操作でコードベースを分析して計画を作成するよう指示します。コードベースの探索、複雑な変更の計画、安全なコードレビューに最適です。

### Plan モードを使う場面

- **複数ステップの実装**: 多数のファイルを編集する機能を実装する場合
- **コードの探索**: 変更を加える前にコードベースを徹底的に調査したい場合
- **インタラクティブな開発**: Qwen Code と方向性を繰り返し検討したい場合

### Plan モードの使い方

**セッション中に Plan モードをオンにする**

セッション中に **Shift+Tab**（Windows では **Tab**）を押して権限モードを切り替えることで Plan モードに入れます。

通常モードの場合、**Shift+Tab**（Windows では **Tab**）を押すと最初に `auto-edits` モードに切り替わり、ターミナル下部に `⏵⏵ accept edits on` と表示されます。もう一度 **Shift+Tab**（Windows では **Tab**）を押すと Plan モードに切り替わり、`⏸ plan mode` と表示されます。

**`/plan` コマンドを使う**

`/plan` コマンドは Plan モードの開始・終了のショートカットです:

通常の計画リクエストだけではモードは切り替わりません。読み取り専用の Plan モードワークフローを使う場合は、`/plan`、キーボードショートカット、または承認モードを明示的に `plan` に設定してください。

```bash
/plan                          # Enter plan mode
/plan refactor the auth module # Enter plan mode and start planning
/plan exit                     # Exit plan mode, restore previous mode
```

`/plan exit` で Plan モードを終了すると、以前の承認モードが自動的に復元されます（例: Plan モードに入る前に Auto-Edit モードだった場合は Auto-Edit に戻ります）。

**Plan モードで新しいセッションを開始する**

Plan モードで新しいセッションを開始するには、`/approval-mode` を使用して `plan` を選択します:

```bash
/approval-mode
```

**Plan モードで「ヘッドレス」クエリを実行する**

`-p` または `prompt` オプションを使って Plan モードでクエリを直接実行することもできます:

```bash
qwen --prompt "What is machine learning?"
```

### 例: 複雑なリファクタリングの計画

```bash
/plan I need to refactor our authentication system to use OAuth2. Create a detailed migration plan.
```

Qwen Code は Plan モードに入り、現在の実装を分析して包括的な計画を作成します。フォローアップで精緻化できます:

```
What about backward compatibility?
How should we handle database migration?
```

### Plan モードをデフォルトに設定する

```json
// .qwen/settings.json
{
  "tools": {
    "approvalMode": "plan"
  }
}
```

## 2. Ask Permissions モードで制御されたインタラクションを行う

Ask Permissions モードは Qwen Code を使う標準的な方法です。このモードでは、潜在的にリスクのある操作をすべて完全にコントロールできます — Qwen Code はファイルの変更やシェルコマンドの実行前に承認を求めます。

### Ask Permissions モードを使う場面

- **コードベースが初めて**: 未知のプロジェクトを探索する際に慎重に進めたい場合
- **重要なシステム**: 本番コード、インフラ、機密データを扱う場合
- **学習と教育**: Qwen Code の各ステップを理解したい場合
- **チームコラボレーション**: 複数人が同じコードベースで作業している場合
- **複雑な操作**: 複数のファイルや複雑なロジックが関わる変更の場合

### Ask Permissions モードの使い方

**セッション中に Ask Permissions モードをオンにする**

セッション中に **Shift+Tab**​（Windows では **Tab**）を押して権限モードを切り替えることで Ask Permissions モードに入れます。他のモードからでも **Shift+Tab**（Windows では **Tab**）を繰り返し押すことで Ask Permissions モードに戻れます。このモードではターミナル下部にモード表示がなくなります。

**Ask Permissions モードで新しいセッションを開始する**

Ask Permissions モードは Qwen Code 起動時の初期モードです。他のモードに変更した後に戻るには、以下を使用します:

```
/approval-mode default
```

**Ask Permissions モードで「ヘッドレス」クエリを実行する**

ヘッドレスコマンドを実行する場合、Ask Permissions モードがデフォルトの動作です。明示的に指定するには:

```
qwen --prompt "Analyze this code for potential bugs"
```

### 例: 安全な機能実装

```
/approval-mode default
```

```
I need to add user profile pictures to our application. The pictures should be stored in an S3 bucket and the URLs saved in the database.
```

Qwen Code はコードベースを分析して計画を提案します。その後、以下の操作の前に承認を求めます:

1. 新しいファイルの作成（コントローラー、モデル、マイグレーション）
2. 既存ファイルの変更（新しいカラムの追加、API の更新）
3. シェルコマンドの実行（データベースマイグレーション、依存関係のインストール）

提案された各変更を個別にレビューして承認または拒否できます。

### Ask Permissions モードをデフォルトに設定する

```bash
// .qwen/settings.json
{
  "tools": {
    "approvalMode": "default"
  }
}
```

## 3. Auto Edits モード

Auto-Edit モードは、Qwen Code にファイル編集を自動承認させながらシェルコマンドには手動承認を要求するモードです。開発ワークフローの加速とシステムの安全性維持を両立するのに最適です。

自動承認される編集ツールには `edit`、`write_file`、`notebook_edit` が含まれます。

### Auto-Accept Edits モードを使う場面

- **日常の開発**: ほとんどのコーディングタスクに最適
- **安全な自動化**: AI がコードを変更しながら危険なコマンドの誤実行を防止
- **チームコラボレーション**: 共有プロジェクトで他のメンバーへの意図しない影響を避ける

### このモードに切り替える方法

```
# Switch via command
/approval-mode auto-edit

# Or use keyboard shortcut
Shift+Tab (or Tab on Windows) # Switch from other modes
```

### ワークフロー例

1. Qwen Code に関数のリファクタリングを依頼する
2. AI がコードを分析して変更を提案する
3. 確認なしにすべてのファイル変更を**自動的に**​適用する
4. テストを実行する必要がある場合は、`npm test` の実行について**承認を要求**​する

## 4. Auto モード — 分類器ベースの承認

Auto モードは Auto-Edit と YOLO の中間に位置します。LLM 分類器が各シェルコマンド、ネットワーク呼び出し、ワークスペース外の編集を評価し、安全と判断したものは自動承認し、リスクのあるものはブロックします。読み取り専用操作やワークスペース内の編集の多くは、速度向上のため分類器をスキップします。

完全なリファレンス（hints の設定、トラブルシューティング、FAQ）は [auto-mode.md](./auto-mode.md) を参照してください。

### Auto モードを使う場面

- **長時間の自律セッション**: Ask Permissions モードが頻繁に中断するが、YOLO はリスクが高すぎる場合。
- **信頼済みプロジェクト**: エージェントが作業を続けながら、破壊的なシェルコマンドや外部ネットワーク呼び出しにはガードレールをかけたい内部コードベース。
- **ヘッドレス／スケジュール実行**: Auto-Edit では不十分（エージェントがシェルコマンドも実行する必要がある）だが、`rm -rf /`、`curl ... | sh`、認証情報の漏洩などに安全対策を講じたい場合。

### Auto モードの使い方

**セッション中に Auto モードをオンにする**

**Shift+Tab**（Windows では **Tab**）を押して Auto モードに切り替えます。ステータスバーにアクティブなモードが表示されます。

**`/approval-mode` コマンドを使う**

```
/approval-mode auto
```

初めて Auto モードに入ると、動作を説明する情報メッセージが表示されます。このメッセージは次回以降は表示されません。

**Auto モードで新しいセッションを開始する**

```jsonc
// .qwen/settings.json
{
  "tools": {
    "approvalMode": "auto",
  },
}
```

### Auto モードが自動承認するものとブロックするもの

分類器は不確かな場合にはブロック寄りに判断します。デフォルト:

- **自動承認**: 読み取り専用コマンド（ls、cat、git status、grep、find）、cwd 内のパッケージインストール、ビルド／テストコマンド、ワークスペース内のファイル編集、ローカル限定の操作。
- **ブロック**: 不可逆的な破壊操作（rm -rf /、fdisk、mkfs）、外部コードの実行（curl | sh、リモートコンテンツの eval）、認証情報の漏洩、不正な永続化（.bashrc 編集、crontab）、セキュリティの弱体化、main/master へのフォースプッシュ。

settings.json の自然言語ヒントで分類器の判断をカスタマイズできます。[auto-mode.md](./auto-mode.md#configuring-hints) を参照してください。

### 安全ガードレール

- **ハードルールは常に有効**: `permissions.deny` ルールは分類器が実行される前にアクションをブロックします。
- **Auto モード中は過度に広い許可ルールが無効化**: 例えば `permissions.allow: ["Bash"]`（すべてのシェルコマンドを許可）は分類器を無効にします。Auto モードに入ると、分類器が機能できるようにそのようなルールが一時的に無効化されます。Auto モードを終了すると元に戻ります。ディスク上の設定は変更されません。
- **フェイルクローズド**: 分類器 API に到達できない場合、アクションは許可されずブロックされます。2 回連続で利用不可の呼び出しが発生した後は、次のツール呼び出しは手動承認にフォールバックします。
- **ループガード**: 3 回連続でポリシーブロックが発生した後は、次の呼び出しも手動承認にフォールバックし、行き詰まりのアプローチでエージェントが繰り返しにはまらないようにします。

### 例

```
/approval-mode auto
Refactor the auth module to use OAuth2. Run the full test suite afterwards.
```

Qwen Code はファイル編集を行い（ワークスペース内の編集は分類器をスキップ）、`npm test` を実行し（分類器が安全と判断）、`rm -rf /Users/me/.aws` のようなリスクのある操作を試みた場合はブロックを表示します。理由をインラインで確認し、そのステップに対して Ask Permissions モードに切り替えるかどうかを判断できます。

### Auto モードをデフォルトに設定する

```jsonc
// .qwen/settings.json
{
  "tools": {
    "approvalMode": "auto",
  },
  "permissions": {
    "autoMode": {
      "hints": {
        "allow": ["Running pytest, mypy, and ruff on this Python repo"],
        "deny": ["Any network call to intranet.example.com"],
      },
      "environment": ["Open-source monorepo; commits are signed"],
    },
  },
}
```

## 5. YOLO モード — 完全自動化

YOLO モードは Qwen Code に最高権限を付与し、ファイル編集とシェルコマンドを含むすべてのツール呼び出しを自動承認します。

### YOLO モードを使う場面

- **自動化スクリプト**: 定義済みの自動化タスクを実行する場合
- **CI/CD パイプライン**: 制御された環境での自動実行
- **個人プロジェクト**: 完全に信頼できる環境での高速なイテレーション
- **バッチ処理**: 複数ステップのコマンドチェーンが必要なタスク

> [!warning]
>
> **YOLO モードは慎重に使用してください**: AI はターミナルの権限で任意のコマンドを実行できます。以下を確認してください:
>
> 1. 現在のコードベースを信頼している
> 2. AI が実行するすべてのアクションを理解している
> 3. 重要なファイルがバックアップされているかバージョン管理にコミットされている

### YOLO モードを有効にする方法

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
  "tools": {
    "approvalMode": "yolo"
  }
}
```

### 自動化ワークフロー例

```bash
# Fully automated refactoring task
qwen --prompt "Run the test suite, fix all failing tests, then commit changes"

# Without human intervention, AI will:
# 1. Run test commands (auto-approved)
# 2. Fix failed test cases (auto-edit files)
# 3. Execute git commit (auto-approved)
```

## モードの切り替えと設定

### キーボードショートカットでの切り替え

Qwen Code のセッション中に **Shift+Tab**​（Windows では **Tab**）を使って 5 つのモードを素早く切り替えられます:

```
Plan Mode → Ask Permissions Mode → Auto-Edit Mode → Auto Mode → YOLO Mode → Plan Mode
```

### 永続的な設定

```
// Project-level: ./.qwen/settings.json
// User-level: ~/.qwen/settings.json
{
  "tools": {
    "approvalMode": "auto-edit"  // or "plan", "default", "auto", "yolo"
  }
}
```

### モード使用の推奨事項

1. **コードベースが初めて**: **Plan モード**​で安全な探索から始める
2. **日常の開発タスク**: **Auto-Accept Edits**​（デフォルトモード）を使用 — 効率的かつ安全
3. **自動化スクリプト**: 制御された環境で完全自動化のために **YOLO モード**​を使用
4. **複雑なリファクタリング**: まず **Plan モード**​で詳細な計画を立て、実行には適切なモードに切り替える
