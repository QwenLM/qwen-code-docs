# ステータスライン

> フッターにカスタム情報を表示します。

ステータスラインは、セッション情報（モデル名、トークン使用量、gitブランチなど）をフッターの左セクションに表示します。設定モードは2つあります。

- **プリセットモード** — 内蔵のデータ項目をインタラクティブなダイアログまたはJSON設定から選択します。スクリプティングは不要です。
- **コマンドモード** — 構造化されたJSONコンテキストをstdinで受け取るシェルコマンドを実行します。カスタムフォーマットに完全な柔軟性を提供します。

```
シングルラインのステータス (デフォルト承認モード — 1行):
┌─────────────────────────────────────────────────────────────────┐
│  user@host ~/project (main) ctx:34%   🔒 docker | Debug | 67%  │  ← ステータスライン
└─────────────────────────────────────────────────────────────────┘

マルチラインのステータス (最大2行 — 2行):
┌─────────────────────────────────────────────────────────────────┐
│  user@host ~/project (main) ctx:34%   🔒 docker | Debug | 67%  │  ← ステータスライン 1
│  ████████░░░░░░░░░░ 34% context                                │  ← ステータスライン 2
└─────────────────────────────────────────────────────────────────┘

マルチラインのステータス + 非デフォルトモード (最大3行):
┌─────────────────────────────────────────────────────────────────┐
│  user@host ~/project (main) ctx:34%   🔒 docker | Debug | 67%  │  ← ステータスライン 1
│  ████████░░░░░░░░░░ 34% context                                │  ← ステータスライン 2
│  auto-accept edits (shift + tab to cycle)                       │  ← モードインジケーター
└─────────────────────────────────────────────────────────────────┘
```

設定すると、ステータスラインはデフォルトの「? for shortcuts」ヒントを置き換えます。優先度の高いメッセージ（Ctrl+C/D 終了プロンプト、Esc、vim INSERTモード）は一時的にステータスラインを上書きします。ステータスラインテキストは利用可能な幅に収まるように切り詰められます。

## クイックセットアップ

ステータスラインを設定する最も簡単な方法は `/statusline` コマンドです。インタラクティブなダイアログが開き、プリセット項目の選択、テーマカラーの切り替え、ライブプレビューの表示ができます。

```
/statusline
```

これによりプリセットモードの設定画面が開きます。矢印キーで移動、スペースキーで項目のオン/オフ切り替え、Enterキーで確定します。選択内容は自動的に設定に保存されます。

`/statusline` に特定の指示を与えて、コマンドモードの設定を生成させることもできます。

```
/statusline show model name and context usage percentage
```

---

## プリセットモード

プリセットモードでは、組み込みのデータ項目を選択して組み合わせることができます。シェルコマンド、`jq`、スクリプティングは不要です。項目は `item1 | item2 | item3` のように1行で表示されます。

### 設定

`~/.qwen/settings.json` の `ui` キー配下に `statusLine` オブジェクトを追加します。

```json
{
  "ui": {
    "statusLine": {
      "type": "preset",
      "items": [
        "model-with-reasoning",
        "git-branch",
        "context-remaining",
        "current-dir",
        "context-used"
      ],
      "useThemeColors": true
    }
  }
}
```

| フィールド              | タイプ       | 必須   | 説明                                                                                                         |
| ---------------------- | ---------- | ------ | ------------------------------------------------------------------------------------------------------------ |
| `type`                 | `"preset"` | はい   | `"preset"` である必要があります                                                                               |
| `items`                | string[]   | はい   | 表示するプリセット項目IDの順序付きリスト（以下の表を参照）。項目は `\|` で区切られます。                     |
| `useThemeColors`       | boolean    | いいえ | アクティブな `/theme` カラーをステータスラインテキストに適用します。デフォルトは `true`。                     |
| `hideContextIndicator` | boolean    | いいえ | フッター右セクションの組み込みコンテキスト使用量インジケーターを非表示にします。デフォルトは `false`。       |

### 利用可能なプリセット項目

| 項目ID                  | デフォルト | 説明                                                              |
| ---------------------- | --------- | ----------------------------------------------------------------- |
| `model-with-reasoning` | はい      | 推論レベルを含む現在のモデル名（例: `qwen-3-235b high`）        |
| `model`                |           | 推論レベルを含まない現在のモデル名                                |
| `git-branch`           | はい      | 現在のGitブランチ名（gitリポジトリ外では非表示）                  |
| `context-remaining`    | はい      | コンテキストウィンドウの残り割合（例: `Context 65.7% left`）      |
| `total-input-tokens`   |           | セッションで使用した累積入力トークン数（例: `30.0k total in`）    |
| `total-output-tokens`  |           | セッションで使用した累積出力トークン数（例: `5.0k total out`）  |
| `current-dir`          | はい      | 現在のワーキングディレクトリ                                      |
| `project-name`         |           | プロジェクト名（ワーキングディレクトリのベース名）                |
| `pull-request-number`  |           | 現在のブランチのオープンPR番号（`gh` CLIが必要）                  |
| `branch-changes`       |           | セッションのファイル変更統計（例: `+120 -30`）                  |
| `context-used`         | はい      | コンテキストウィンドウの使用割合（例: `Context 34.3% used`）    |
| `run-state`            |           | コンパクトなセッション状態（`Ready`、`Working`、`Confirm`）      |
| `qwen-version`         |           | Qwen Code バージョン（例: `v0.14.1`）                           |
| `context-window-size`  |           | コンテキストウィンドウの合計サイズ（例: `131.1k window`）        |
| `used-tokens`          |           | 現在のプロンプトのトークン数（例: `45.0k used`）                  |
| `session-id`           |           | 現在のセッション識別子                                            |

**デフォルト**とマークされた項目は、`/statusline` ダイアログを最初に開いたときに事前選択されています。

`total-input-tokens` と `total-output-tokens` はセッションの合計です。ターンごとにトークン使用量が加算されるため、新しいモデルリクエストには現在の会話コンテキストが再び含まれるため、入力トークンは急速に増加する可能性があります。累積セッション消費ではなく現在のプロンプトサイズが必要な場合は、`used-tokens` を使用してください。

### 出力例

デフォルト項目の場合、ステータスラインは次のようになります。

```
qwen-3-235b high | main | Context 65.7% left | /home/user/project | Context 34.3% used
```

### ダイアログによるカスタマイズ

`/statusline` を実行すると、インタラクティブな複数選択ダイアログが開きます。

```
┌ Configure Status Line ────────────────────────────────────────┐
│ Select which items to display in the status line.             │
│                                                               │
│ Type to search                                                │
│ >                                                             │
│                                                               │
│ [x] Use theme colors        Apply colors from the active /theme│
│ ───────────────────────                                       │
│ [x] model-with-reasoning    Current model name with reasoning │
│ [ ] model-only              Current model name without reason │
│ [x] git-branch              Current Git branch when available │
│ [x] context-remaining       Percentage of context remaining   │
│ ...                                                           │
│                                                               │
│ Preview                                                       │
│ qwen-3-235b high | main | Context 65.7% left                 │
│                                                               │
│ Use up/down to navigate, space to select, enter to confirm    │
└───────────────────────────────────────────────────────────────┘
```

- 入力して項目名または説明でフィルタリング
- 項目を切り替えるとライブプレビューが更新
- Enterキーを押して設定を保存

---

## コマンドモード

コマンドモードでは、シェルコマンドを実行し、その標準出力がステータスラインに表示されます。コマンドはstdinで構造化JSONコンテキストを受け取り、セッション認識型の出力を生成します。

### 前提条件

- [`jq`](https://jqlang.github.io/jq/) はJSON入力の解析に推奨されます（`brew install jq`、`apt install jq` などでインストール）
- JSONデータを必要としない単純なコマンド（例: `git branch --show-current`）は `jq` なしで動作します

### 設定

`~/.qwen/settings.json` の `ui` キー配下に `statusLine` オブジェクトを追加します。

```json
{
  "ui": {
    "statusLine": {
      "type": "command",
      "command": "input=$(cat); model=$(echo \"$input\" | jq -r '.model.display_name'); pct=$(echo \"$input\" | jq -r '.context_window.used_percentage'); echo \"$model  ctx:${pct}%\""
    }
  }
}
```

| フィールド              | タイプ        | 必須   | 説明                                                                                                                           |
| ---------------------- | ------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `type`                 | `"command"`  | はい   | `"command"` である必要があります                                                                                               |
| `command`              | string       | はい   | 実行するシェルコマンド。stdinでJSONを受け取り、stdoutが表示されます（最大2行）。                                               |
| `refreshInterval`      | number       | いいえ | コマンドをN秒ごとに再実行します（最小1）。エージェント状態イベントなしで変化するデータ（時計、クォータ、稼働時間など）に便利。 |
| `respectUserColors`    | boolean      | いいえ | コマンド出力のANSIカラーコードを保持し、フッターの薄暗いスタイルを適用しません。デフォルトは `false`。                         |
| `hideContextIndicator` | boolean      | いいえ | フッター右セクションの組み込みコンテキスト使用量インジケーターを非表示にします。デフォルトは `false`。                         |

### JSON入力

コマンドはstdinを介して次のフィールドを持つJSONオブジェクトを受け取ります。

```json
{
  "session_id": "abc-123",
  "version": "0.14.1",
  "model": {
    "display_name": "qwen-3-235b"
  },
  "context_window": {
    "context_window_size": 131072,
    "used_percentage": 34.3,
    "remaining_percentage": 65.7,
    "current_usage": 45000,
    "total_input_tokens": 30000,
    "total_output_tokens": 5000
  },
  "workspace": {
    "current_dir": "/home/user/project"
  },
  "git": {
    "branch": "main"
  },
  "worktree": {
    "name": "fix-auth",
    "path": "/home/user/project/.qwen/worktrees/fix-auth",
    "branch": "fix-auth",
    "original_cwd": "/home/user/project",
    "original_branch": "main"
  },
  "metrics": {
    "models": {
      "qwen-3-235b": {
        "api": {
          "total_requests": 10,
          "total_errors": 0,
          "total_latency_ms": 5000
        },
        "tokens": {
          "prompt": 30000,
          "completion": 5000,
          "total": 35000,
          "cached": 10000,
          "thoughts": 2000
        }
      }
    },
    "files": {
      "total_lines_added": 120,
      "total_lines_removed": 30
    }
  },
  "vim": {
    "mode": "INSERT"
  }
}
```

| フィールド                              | タイプ            | 説明                                                                             |
| -------------------------------------- | --------------- | -------------------------------------------------------------------------------- |
| `session_id`                           | string          | 一意のセッション識別子                                                           |
| `version`                              | string          | Qwen Code バージョン                                                            |
| `model.display_name`                   | string          | 現在のモデル名                                                                   |
| `context_window.context_window_size`   | number          | コンテキストウィンドウの合計サイズ（トークン数）                                 |
| `context_window.used_percentage`       | number          | コンテキストウィンドウの使用率（0～100）                                         |
| `context_window.remaining_percentage`  | number          | コンテキストウィンドウの残り率（0～100）                                         |
| `context_window.current_usage`         | number          | 最後のAPI呼び出しのトークン数（現在のコンテキストサイズ）                         |
| `context_window.total_input_tokens`    | number          | このセッションで消費した入力トークンの合計                                       |
| `context_window.total_output_tokens`   | number          | このセッションで消費した出力トークンの合計                                       |
| `workspace.current_dir`                | string          | 現在のワーキングディレクトリ                                                     |
| `git`                                  | object \| absent | gitリポジトリ内にのみ存在します。                                                |
| `git.branch`                           | string          | 現在のブランチ名                                                                 |
| `worktree`                             | object \| absent | アクティブなワークツリー内（`enter_worktree` で作成）にいる場合のみ存在します。  |
| `worktree.name`                        | string          | ワークツリーのスラッグ名                                                         |
| `worktree.path`                        | string          | ワークツリーディレクトリの絶対パス                                               |
| `worktree.branch`                      | string          | ワークツリーでチェックアウトされているブランチ                                   |
| `worktree.original_cwd`                | string          | ワークツリーに入る前のワーキングディレクトリ                                     |
| `worktree.original_branch`             | string          | ワークツリーに入る前にアクティブだったブランチ                                   |
| `metrics.models.<id>.api`              | object          | モデルごとのAPI統計: `total_requests`, `total_errors`, `total_latency_ms`        |
| `metrics.models.<id>.tokens`           | object          | モデルごとのトークン使用量: `prompt`, `completion`, `total`, `cached`, `thoughts` |
| `metrics.files`                        | object          | ファイル変更統計: `total_lines_added`, `total_lines_removed`                      |
| `vim`                                  | object \| absent | vimモードが有効な場合のみ存在します。`mode`（`"INSERT"` または `"NORMAL"`）を含む。 |

> **重要:** stdinは1回しか読み取れません。常に最初に変数に格納してください: `input=$(cat)`。

### 例

#### モデルとトークン使用量

```json
{
  "ui": {
    "statusLine": {
      "type": "command",
      "command": "input=$(cat); model=$(echo \"$input\" | jq -r '.model.display_name'); pct=$(echo \"$input\" | jq -r '.context_window.used_percentage'); echo \"$model  ctx:${pct}%\""
    }
  }
}
```

出力: `qwen-3-235b  ctx:34%`

#### Gitブランチ + ディレクトリ

```json
{
  "ui": {
    "statusLine": {
      "type": "command",
      "command": "input=$(cat); branch=$(echo \"$input\" | jq -r '.git.branch // empty'); dir=$(basename \"$(echo \"$input\" | jq -r '.workspace.current_dir')\"); echo \"$dir${branch:+ ($branch)}\""
    }
  }
}
```

出力: `my-project (main)`

> 注: `git.branch` フィールドはJSON入力に直接提供されます — `git` コマンドをシェルアウトする必要はありません。

#### ファイル変更統計

```json
{
  "ui": {
    "statusLine": {
      "type": "command",
      "command": "input=$(cat); added=$(echo \"$input\" | jq -r '.metrics.files.total_lines_added'); removed=$(echo \"$input\" | jq -r '.metrics.files.total_lines_removed'); echo \"+$added/-$removed lines\""
    }
  }
}
```

出力: `+120/-30 lines`

#### ライブクロックとGitブランチ

エージェントイベントなしで変化するデータ（時計、稼働時間、レート制限カウンターなど）をステータスラインに表示する場合は、`refreshInterval` を使用します。

```json
{
  "ui": {
    "statusLine": {
      "type": "command",
      "command": "input=$(cat); branch=$(echo \"$input\" | jq -r '.git.branch // \"no-git\"'); echo \"$(date +%H:%M:%S)  ($branch)\"",
      "refreshInterval": 1
    }
  }
}
```

出力（毎秒更新）: `14:32:07  (main)`

#### 複雑なコマンド用のスクリプトファイル

長いコマンドの場合は、`~/.qwen/statusline-command.sh` にスクリプトファイルを保存します。

```bash
#!/bin/bash
input=$(cat)
model=$(echo "$input" | jq -r '.model.display_name')
pct=$(echo "$input" | jq -r '.context_window.used_percentage')
branch=$(echo "$input" | jq -r '.git.branch // empty')
added=$(echo "$input" | jq -r '.metrics.files.total_lines_added')
removed=$(echo "$input" | jq -r '.metrics.files.total_lines_removed')

parts=()
[ -n "$model" ] && parts+=("$model")
[ -n "$branch" ] && parts+=("($branch)")
[ "$pct" != "0" ] 2>/dev/null && parts+=("ctx:${pct}%")
([ "$added" -gt 0 ] || [ "$removed" -gt 0 ]) 2>/dev/null && parts+=("+${added}/-${removed}")

echo "${parts[*]}"
```

次に、設定でそれを参照します。

```json
{
  "ui": {
    "statusLine": {
      "type": "command",
      "command": "bash ~/.qwen/statusline-command.sh"
    }
  }
}
```

## 動作

**両モード共通:**

- **更新トリガー**: モデルが変更されたとき、新しいメッセージが送信されたとき（トークン数変更）、vimモードが切り替わったとき、gitブランチが変更されたとき、ツール呼び出しが完了したとき、ファイル変更があったときにステータスラインが更新されます。更新はデバウンス（300ms）されます。
- **出力**: 最大2行。各行はフッター左セクションの個別の行として表示されます。利用可能な幅を超える行は切り詰められます。
- **ホットリロード**: 設定の `ui.statusLine` への変更は即座に反映されます — 再起動は不要です。
- **削除**: 設定から `ui.statusLine` キーを削除すると無効になります。「? for shortcuts」ヒントが戻ります。

**コマンドモードのみ:**

- **タイムアウト**: 5秒以上かかるコマンドは強制終了されます。エラー時はステータスラインがクリアされます。
- **リフレッシュ**: `refreshInterval`（秒）を設定すると、タイマーでコマンドを追加で再実行できます — エージェントイベントなしで変化するデータ（時計、レート制限、ビルドステータス）に便利です。
- **シェル**: macOS/Linuxでは `/bin/sh` でコマンドが実行されます。Windowsではデフォルトで `cmd.exe` が使用されます — POSIXコマンドは `bash -c "..."` でラップするか、bashスクリプト（例: `bash ~/.qwen/statusline-command.sh`）を指定してください。

**プリセットモードのみ:**

- **外部依存関係なし**: プリセット項目は内部で計算されます — シェルコマンド、`jq`、タイムアウトはありません。
- **テーマ統合**: `useThemeColors` が `true`（デフォルト）の場合、ステータスラインテキストはアクティブな `/theme` カラーを使用します。`false` の場合、フッターの薄暗いスタイルが適用されます。
- **PRルックアップ**: `pull-request-number` 項目はバックグラウンドで `gh pr view` を実行します（2秒タイムアウト）。更新のたびではなく、ブランチが変更されたときにのみトリガーされます。

## トラブルシューティング

| 問題                            | 原因                              | 修正方法                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------ | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ステータスラインが表示されない   | 設定のパスが間違っている          | `ui.statusLine` 配下にある必要があります。ルートレベルの `statusLine` ではありません。                                                                                                                                                                                                                                                                                                                 |
| 出力が空（コマンドモード）       | コマンドがサイレントに失敗        | 手動でテスト: `echo '{"session_id":"test","version":"0.14.1","model":{"display_name":"test"},"context_window":{"context_window_size":0,"used_percentage":0,"remaining_percentage":100,"current_usage":0,"total_input_tokens":0,"total_output_tokens":0},"workspace":{"current_dir":"/tmp"},"metrics":{"models":{},"files":{"total_lines_added":0,"total_lines_removed":0}}}' \| sh -c 'your_command'` |
| データが古い（コマンドモード）   | トリガーが発火していない          | メッセージを送信するかモデルを切り替えて更新をトリガー — または `refreshInterval` を設定してタイマーでコマンドを再実行                                                                                                                                                                                                                                                                                  |
| コマンドが遅すぎる              | 複雑なスクリプト                  | スクリプトを最適化するか、重い処理をバックグラウンドキャッシュに移動                                                                                                                                                                                                                                                                                                                                   |
| プリセット項目が不足している     | 条件付き項目にデータがない        | `git-branch` はgitリポジトリ外では非表示、`context-used` は使用量が0のとき非表示、`branch-changes` はファイル変更がないとき非表示。これは仕様です — データが利用可能になると項目が表示されます。                                                                                                                                                                                                         |
| PR番号が表示されない            | `gh` CLIがインストールされていない | [GitHub CLI](https://cli.github.com/) をインストールし、`gh auth login` で認証してください。ルックアップは2秒のタイムアウトで実行されます。                                                                                                                                                                                                                                                            |