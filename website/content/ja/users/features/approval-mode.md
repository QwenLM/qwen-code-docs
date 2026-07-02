# 承認モード

Qwen Code は、タスクの複雑さとリスクレベルに基づいて、AI がコードやシステムとどのように対話するかを柔軟に制御できる 5 つの異なる権限モードを提供します。

## 権限モードの比較

| モード                 | ファイル編集                | シェルコマンド              | 最適な用途                                                                                               | リスクレベル |
| -------------------- | --------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------ | ---------- |
| **Plan**            | ❌ 読み取り専用分析のみ  | ❌ 実行されない             | • コードの探索 <br>• 複雑な変更の計画 <br>• 安全なコードレビュー                               | 最低     |
| **Ask Permissions** | ✅ 手動承認が必要 | ✅ 手動承認が必要 | • 新規/未知のコードベース <br>• 重要なシステム <br>• チームコラボレーション <br>• 学習と教育 | 低        |
| **Auto-Edit**       | ✅ 自動承認            | ❌ 手動承認が必要 | • 日々の開発タスク <br>• リファクタリングとコードの改善 <br>• 安全な自動化                | 中     |
| **Auto**            | ✅ 分類器による評価     | ✅ 分類器による評価     | • 長時間の自律セッション <br>• Auto-Edit が慎重すぎるが YOLO はリスクが高すぎる場合                  | 中     |
| **YOLO**            | ✅ 自動承認            | ✅ 自動承認            | • 信頼された個人プロジェクト <br>• 自動化スクリプト/CI/CD <br>• バッチ処理タスク                 | 最高    |

> [!NOTE]
>
> 以前 **Default** という名前だったモードは、その動作をより適切に説明するために **Ask Permissions** に改名されました。後方互換性のため、基礎となる設定値 (`tools.approvalMode: "default"`) と `/approval-mode default` コマンドは変更されていません。

### クイックリファレンスガイド

- **Plan Mode で開始**: 変更を加える前に理解するのに最適
- **Ask Permissions Mode で作業**: ほとんどの開発作業においてバランスの取れた選択肢
- **Auto-Edit に切り替え**: 安全なコード変更を多数行う場合
- **Auto Mode を試す**: 中断を減らしたいが、シェルコマンドとネットワーク呼び出しの安全性も確保したい場合 — LLM 分類器が各呼び出しを評価します
- **YOLO は慎重に使用**: 管理された環境下での信頼された自動化のみに使用

> [!tip]
>
> セッション中に **Shift+Tab** (Windows の場合は **Tab**) を使用して、モードを素早く切り替えることができます。ターミナルのステータスバーに現在のモードが表示されるため、Qwen Code が持つ権限を常に把握できます。

> 切り替え順序: **plan → default → auto-edit → auto → yolo → plan → ...**

## 1. 安全なコード分析に Plan Mode を使用する

Plan Mode は、Qwen Code に **読み取り専用** 操作でコードベースを分析して計画を作成するよう指示します。コードベースの探索、複雑な変更の計画、または安全なコードレビューに最適です。

### Plan Mode を使用するタイミング

- **マルチステップの実装**: 機能の実装に多数のファイルへの編集が必要な場合
- **コードの探索**: 何かを変更する前にコードベースを徹底的に調査したい場合
- **対話型開発**: Qwen Code と方向性について反復しながら進めたい場合

### Plan Mode の使用方法

**セッション中に Plan Mode をオンにする**

セッション中に **Shift+Tab** (Windows の場合は **Tab**) を使用して権限モードを切り替え、Plan Mode に切り替えることができます。

Normal Mode の場合、**Shift+Tab** (Windows の場合は **Tab**) を最初に押すと `auto-edits` Mode に切り替わり、ターミナルの下部に `⏵⏵ accept edits on` と表示されます。さらに **Shift+Tab** (Windows の場合は **Tab**) を押すと、`⏸ plan mode` と表示され Plan Mode に切り替わります。

**`/plan` コマンドを使用する**

`/plan` コマンドは、Plan Mode の開始と終了のためのクイックショートカットを提供します。

通常の計画リクエストだけではモードは切り替わりません。読み取り専用の Plan Mode ワークフローを希望する場合は、`/plan`、キーボードショートカットを使用するか、承認モードを明示的に `plan` に設定してください。

```bash
/plan                          # plan mode に入る
/plan refactor the auth module # plan mode に入り、計画を開始
/plan exit                     # plan mode を終了し、前のモードに戻す
```

`/plan exit` で Plan Mode を終了すると、以前の承認モードが自動的に復元されます (たとえば、Plan Mode に入る前に Auto-Edit にいた場合、Auto-Edit に戻ります)。

**Plan Mode で新しいセッションを開始する**

Plan Mode で新しいセッションを開始するには、`/approval-mode` を使用して `plan` を選択します。

```bash
/approval-mode
```

**Plan Mode で "ヘッドレス" クエリを実行する**

`-p` または `prompt` を使用して、Plan Mode で直接クエリを実行することもできます。

```bash
qwen --prompt "What is machine learning?"
```

### 例: 複雑なリファクタリングの計画

```bash
/plan I need to refactor our authentication system to use OAuth2. Create a detailed migration plan.
```

Qwen Code は Plan Mode に入り、現在の実装を分析して包括的な計画を作成します。フォローアップで洗練させます。

```
後方互換性についてはどうですか？
データベースの移行はどのように処理すべきですか？
```

### Plan Mode をデフォルトとして設定する

```json
// .qwen/settings.json
{
  "tools": {
    "approvalMode": "plan"
  }
}
```

## 2. 制御された対話に Ask Permissions Mode を使用する

Ask Permissions Mode は Qwen Code を操作する標準的な方法です。このモードでは、潜在的にリスクのあるすべての操作を完全に制御できます。Qwen Code はファイルの変更やシェルコマンドの実行を行う前に、あなたの承認を求めます。

### Ask Permissions Mode を使用するタイミング

- **コードベースに不慣れな場合**: 未知のプロジェクトを探索しており、特に慎重になりたい場合
- **重要なシステム**: 本番コード、インフラストラクチャ、または機密データを扱っている場合
- **学習と教育**: Qwen Code が実行している各ステップを理解したい場合
- **チームコラボレーション**: 複数の人が同じコードベースで作業している場合
- **複雑な操作**: 変更に複数のファイルや複雑なロジックが関与する場合

### Ask Permissions Mode の使用方法

**セッション中に Ask Permissions Mode をオンにする**

セッション中に **Shift+Tab** (Windows の場合は **Tab**) を使用して権限モードを切り替え、Ask Permissions Mode に切り替えることができます。他のモードにいる場合、**Shift+Tab** (Windows の場合は **Tab**) を押すと、最終的に Ask Permissions Mode に戻ります。これはターミナルの下部にモードインジケーターが表示されないことでわかります。

**Ask Permissions Mode で新しいセッションを開始する**

Ask Permissions Mode は Qwen Code を起動したときの初期モードです。モードを変更していて Ask Permissions Mode に戻りたい場合は、以下を使用します。

```
/approval-mode default
```

**Ask Permissions Mode で "ヘッドレス" クエリを実行する**

ヘッドレスコマンドを実行する場合、Ask Permissions Mode がデフォルトの動作です。以下のように明示的に指定することもできます。

```
qwen --prompt "Analyze this code for potential bugs"
```

### 例: 安全な機能実装

```
/approval-mode default
```

```
アプリケーションにユーザーのプロフィール写真を追加する必要があります。写真は S3 バケットに保存し、URL をデータベースに保存してください。
```

Qwen Code はコードベースを分析し、計画を提案します。その後、以下の前に承認を求めます。

1. 新しいファイルの作成 (コントローラー、モデル、マイグレーション)
2. 既存ファイルの変更 (新しい列の追加、API の更新)
3. シェルコマンドの実行 (データベースのマイグレーション、依存関係のインストール)

提案された各変更を確認し、個別に承認または拒否することができます。

### Ask Permissions Mode をデフォルトとして設定する

```bash
// .qwen/settings.json
{
  "tools": {
    "approvalMode": "default"
  }
}
```

## 3. Auto Edits Mode

Auto-Edit Mode は、Qwen Code にファイル編集を自動的に承認し、シェルコマンドには手動承認を要求するよう指示します。システム安全性を維持しながら開発ワークフローを高速化するのに最適です。

自動承認される編集ツールには `edit`、`write_file`、`notebook_edit` が含まれます。

### Auto-Accept Edits Mode を使用するタイミング

- **日々の開発**: ほとんどのコーディングタスクに最適
- **安全な自動化**: AI がコードを変更できるようにしつつ、危険なコマンドの誤実行を防ぐ
- **チームコラボレーション**: 共有プロジェクトで使用し、他者への意図しない影響を回避する

### このモードへの切り替え方法

```
# コマンドで切り替え
/approval-mode auto-edit

# またはキーボードショートカットを使用
Shift+Tab (Windows の場合は Tab) # 他のモードから切り替え
```

### ワークフローの例

1. Qwen Code に関数のリファクタリングを依頼する
2. AI がコードを分析し、変更を提案する
3. 確認なしにすべてのファイル変更を**自動**で適用する
4. テストを実行する必要がある場合、`npm test` を実行するために**承認を要求**する

## 4. Auto Mode - 分類器駆動の承認

Auto Mode は Auto-Edit と YOLO の間に位置します。LLM 分類器が各シェルコマンド、ネットワーク呼び出し、ワークスペース外の編集を評価し、安全と判断したものを自動承認し、リスクのあるものをブロックします。ほとんどの読み取り専用操作とワークスペース内の編集は、速度のために分類器をスキップします。

完全なリファレンス (ヒントの設定、トラブルシューティング、FAQ) については、[auto-mode.md](./auto-mode.md) を参照してください。

### Auto Mode を使用するタイミング

- **長時間の自律セッション**: Ask Permissions Mode が頻繁に中断を引き起こす場合や、YOLO がリスクが高すぎる場合。
- **信頼されたプロジェクト**: エージェントに作業を継続させたいが、破壊的なシェルコマンドや送信ネットワーク呼び出しに対するガードレールは残しておきたい内部コードベース。
- **ヘッドレス / スケジュール実行**: Auto-Edit では不十分な場合 (エージェントがシェルコマンドも実行する必要がある) が、`rm -rf /`、`curl ... | sh`、認証情報の流出などに対する安全性を確保したい場合。

### Auto Mode の使用方法

**セッション中に Auto Mode をオンにする**

**Shift+Tab** (Windows の場合は **Tab**) を押して Auto Mode に切り替えます。ステータスバーにアクティブなモードが表示されます。

**`/approval-mode` コマンドを使用する**

```
/approval-mode auto
```

初めて Auto Mode に入ると、その動作を説明する情報メッセージが表示されます。この通知は再度表示されません。

**Auto Mode で新しいセッションを開始する**

```jsonc
// .qwen/settings.json
{
  "tools": {
    "approvalMode": "auto",
  },
}
```

### Auto Mode が自動承認するものとブロックするもの

分類器は不確実な場合、ブロックする方向にバイアスがかかっています。デフォルト:

- **自動承認**: 読み取り専用コマンド (ls, cat, git status, grep, find)、cwd でのパッケージインストール、ビルド/テストコマンド、ワークスペース内のファイル編集、ローカル専用の操作。
- **ブロック**: 不可逆な破壊 (rm -rf /, fdisk, mkfs)、外部からのコード実行 (curl | sh、リモートコンテンツの eval)、認証情報の流出、不正な永続化 (.bashrc の編集、crontab)、セキュリティの弱化、main/master への強制プッシュ。

settings.json で自然言語のヒントを使用して、分類器の判断をカスタマイズできます。[auto-mode.md](./auto-mode.md#configuring-hints) を参照してください。

### 安全なガードレール

- **ハードルールは有効なまま**: `permissions.deny` ルールは、分類器が実行される前にアクションをブロックします。
- **過度に広い許可ルールは Auto Mode 中に削除される**: たとえば、`permissions.allow: ["Bash"]` (すべてのシェルコマンドを許可) は分類器を無効化します。Auto Mode に入ると、分類器が機能できるようにこのようなルールは一時的に無効化されます。Auto Mode を離れるとルールは復元されます。ディスク上の設定が変更されることはありません。
- **Fail-closed**: 分類器 API に到達できない場合、アクションは許可されるのではなくブロックされます。2 回連続で利用できない呼び出しがあった後、次のツール呼び出しは手動承認にフォールバックします。
- **ループガード**: 3 回連続でポリシーによってブロックされた後、次の呼び出しも手動承認にフォールバックし、エージェントが行き詰まったアプローチでループしないようにします。

### 例

```
/approval-mode auto
OAuth2 を使用するように auth モジュールをリファクタリングしてください。その後、フルテストスイートを実行してください。
```

Qwen Code はファイル編集を行い (ワークスペース内の編集は分類器をスキップします)、`npm test` を実行し (分類器は安全と判断)、`rm -rf /Users/me/.aws` のようなリスクのあることを試みた場合にブロックを表面化させます。理由をインラインで確認し、そのステップのために Ask Permissions Mode に切り替えるかどうかを決定できます。

### Auto Mode をデフォルトとして設定する

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
      // オプション: 防御を多層化するために、すべてのシェルコマンド (ls や cat などの
      // 読み取り専用コマンドを含む) を分類器経由にルーティングします。
      // "classifyAllShell": true,
    },
  },
}
```

## 5. YOLO Mode - 完全自動化

YOLO Mode は Qwen Code に最高レベルの権限を付与し、ファイル編集やシェルコマンドを含むすべてのツール呼び出しを自動的に承認します。

### YOLO Mode を使用するタイミング

- **自動化スクリプト**: 事前定義された自動化タスクを実行する場合
- **CI/CD パイプライン**: 管理された環境での自動実行
- **個人プロジェクト**: 完全に信頼された環境での迅速な反復
- **バッチ処理**: 多段階のコマンドチェーンを必要とするタスク

> [!warning]
>
> **YOLO Mode は慎重に使用してください**: AI はターミナルの権限で任意のコマンドを実行できます。以下を確認してください:
>
> 1. 現在のコードベースを信頼していること
> 2. AI が実行するすべてのアクションを理解していること
> 3. 重要なファイルがバックアップされているか、バージョン管理にコミットされていること

### YOLO Mode を有効にする方法

```
# 一時的に有効化 (現在のセッションのみ)
/approval-mode yolo

# プロジェクトのデフォルトとして設定
/approval-mode yolo --project

# ユーザーのグローバルデフォルトとして設定
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

### 自動化ワークフローの例

```bash
# 完全自動化されたリファクタリングタスク
qwen --prompt "Run the test suite, fix all failing tests, then commit changes"

# 人間の介入なしに、AI は以下を行います:
# 1. テストコマンドの実行 (自動承認)
# 2. 失敗したテストケースの修正 (ファイルの自動編集)
# 3. git commit の実行 (自動承認)
```

## モードの切り替えと設定

### キーボードショートカットによる切り替え

Qwen Code のセッション中、**Shift+Tab** (Windows の場合は **Tab**) を使用して、5 つのモードを素早く切り替えることができます。

```
Plan Mode → Ask Permissions Mode → Auto-Edit Mode → Auto Mode → YOLO Mode → Plan Mode
```

### 永続的な設定

```
// プロジェクトレベル: ./.qwen/settings.json
// ユーザーレベル: ~/.qwen/settings.json
{
  "tools": {
    "approvalMode": "auto-edit"  // または "plan", "default", "auto", "yolo"
  }
}
```

### モードの使用推奨

1. **コードベースに不慣れな場合**: **Plan Mode** で開始して安全に探索する
2. **日々の開発タスク**: **Auto-Accept Edits** (デフォルトモード) を使用。効率的で安全
3. **自動化スクリプト**: 管理された環境で **YOLO Mode** を使用して完全自動化を実現
4. **複雑なリファクタリング**: まず **Plan Mode** を使用して詳細な計画を立て、その後実行に適したモードに切り替える