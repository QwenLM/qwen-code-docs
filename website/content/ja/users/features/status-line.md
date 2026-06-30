# ステータスライン

> フッターにカスタム情報を表示します。

ステータスラインは、フッターの左側にセッションに応じた情報（モデル名、トークン使用量、Gitブランチなど）を表示します。設定モードは2つあります。

- **プリセットモード** — インタラクティブなダイアログまたはJSON設定から組み込みデータ項目を選択します。スクリプトは不要です。
- **コマンドモード** — stdin経由で構造化されたJSONコンテキストを受け取るシェルコマンドを実行します。カスタムフォーマットのための完全な柔軟性を提供します。

```
Single-line status (default approval mode — 1 row):
┌─────────────────────────────────────────────────────────────────┐
│  user@host ~/project (main) ctx:34%   docker | Debug | 67%     │  ← ステータスライン
└─────────────────────────────────────────────────────────────────┘

Multi-line status (up to 2 lines — 2 rows):
┌─────────────────────────────────────────────────────────────────┐
│  user@host ~/project (main) ctx:34%   docker | Debug | 67%     │  ← ステータスライン 1
│  ████████░░░░░░░░░░ 34% context                                │  ← ステータスライン 2
└─────────────────────────────────────────────────────────────────┘

Multi-line status + non-default mode (3 rows max):
┌─────────────────────────────────────────────────────────────────┐
│  user@host ~/project (main) ctx:34%   docker | Debug | 67%     │  ← ステータスライン 1
│  ████████░░░░░░░░░░ 34% context                                │  ← ステータスライン 2
│  auto-accept edits (shift + tab to cycle)                       │  ← モードインジケーター
└─────────────────────────────────────────────────────────────────┘
```

設定すると、ステータスラインはデフォルトの「? for shortcuts」ヒントを置き換えます。優先度の高いメッセージ（Ctrl+C/D 終了プロンプト、Esc、vim INSERTモード）はステータスラインを一時的にオーバーライドします。ステータスラインのテキストは、利用可能な幅に収まるように切り詰められます。

## クイックセットアップ

ステータスラインを設定する最も簡単な方法は、`/statusline` コマンドを使用することです。プリセット項目の選択、テーマカラーの切り替え、ライブプレビューの表示ができるインタラクティブなダイアログが開きます。

```
/statusline
```

これによりプリセットモードのコンフィギュレータが開きます。矢印キーで移動、スペースで項目を切り替え、Enterで確定します。選択内容は自動的に設定に保存されます。

特定の指示を `/statusline` に与えて、コマンドモードの設定を生成させることもできます。

```
/statusline show model name and context usage percentage
```

---

## プリセットモード

プリセットモードは、選択して組み合わせることができる組み込みデータ項目のセットを提供します。シェルコマンドも `jq` もスクリプトも不要です。項目は `item1 | item2 | item3` のように1行でレンダリングされます。

### 設定

`~/.qwen/settings.json` の `ui` キーの下に `statusLine` オブジェクトを追加します。

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

| Field                  | Type       | Required | Description                                                                                                |
| ---------------------- | ---------- | -------- | ---------------------------------------------------------------------------------------------------------- |
| `type`                 | `"preset"` | はい      | `"preset"` である必要があります                                                                                         |
| `items`                | string[]   | はい      | 表示するプリセット項目IDの順序付きリスト（下の表を参照）。項目は `\|` をセパレータとして結合されます。 |
| `useThemeColors`       | boolean    | いいえ       | アクティブな `/theme` の色をステータスラインのテキストに適用します。デフォルトは `true` です。                               |
| `hideContextIndicator` | boolean    | いいえ       | フッター右側の組み込みコンテキスト使用量インジケーターを非表示にします。デフォルトは `false` です。                |

### 利用可能なプリセット項目

| Item ID                | Default | Description                                                        |
| ---------------------- | ------- | ------------------------------------------------------------------ |
| `model-with-reasoning` | はい     | 推論レベルを含む現在のモデル名（例: `qwen-3-235b high`）  |
| `model`                |         | 推論レベルを含まない現在のモデル名                         |
| `git-branch`           | はい     | 現在のGitブランチ名（Gitリポジトリ内にない場合は非表示）            |
| `context-remaining`    | はい     | 残りのコンテキストウィンドウの割合（例: `Context 65.7% left`） |
| `total-input-tokens`   |         | セッション中に使用された累積入力トークン（例: `30.0k total in`）    |
| `total-output-tokens`  |         | セッション中に使用された累積出力トークン（例: `5.0k total out`）   |
| `current-dir`          | はい     | 現在の作業ディレクトリ                                          |
| `project-name`         |         | プロジェクト名（作業ディレクトリのベース名）                       |
| `pull-request-number`  |         | 現在のブランチのオープンなPR番号（`gh` CLIが必要）          |
| `branch-changes`       |         | セッションのファイル変更統計（例: `+120 -30`）                        |
| `context-used`         | はい     | 使用されたコンテキストウィンドウの割合（例: `Context 34.3% used`）      |
| `run-state`            |         | 圧縮されたセッション状態（`Ready`、`Working`、または `Confirm`）           |
| `qwen-version`         |         | Qwen Code のバージョン（例: `v0.14.1`）                                 |
| `context-window-size`  |         | 合計コンテキストウィンドウサイズ（例: `131.1k window`）                   |
| `used-tokens`          |         | 現在のプロンプトトークン数（例: `45.0k used`）                     |
| `session-id`           |         | 現在のセッション識別子                                         |

**Default** とマークされた項目は、`/statusline` ダイアログを初めて開いたときに事前選択されています。

`total-input-tokens` と `total-output-tokens` はセッションの合計値です。これらはターンをまたいだトークン使用量を集計するため、新しいモデルリクエストごとに現在の会話コンテキストが再度含まれることになり、入力トークンは急速に増加する可能性があります。累積セッション消費ではなく現在のプロンプトサイズを確認したい場合は、`used-tokens` を使用してください。

### 出力例

デフォルトの項目を使用すると、ステータスラインは次のようになります。

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

- 名前または説明で項目をフィルタリングするには入力します
- 項目を切り替えるとライブプレビューが更新されます
- Enterキーを押して設定を保存します

---

## コマンドモード

コマンドモードは、stdoutがステータスラインに表示されるシェルコマンドを実行します。コマンドはセッションに応じた出力のために、stdin経由で構造化されたJSONコンテキストを受け取ります。

### 前提条件

- JSON入力の解析には [`jq`](https://jqlang.github.io/jq/) をお勧めします（`brew install jq`、`apt install jq` などでインストール）
- JSONデータを必要としない単純なコマンド（例: `git branch --show-current`）は `jq` なしで動作します

### 設定

`~/.qwen/settings.json` の `ui` キーの下に `statusLine` オブジェクトを追加します。

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

| Field                  | Type        | Required | Description                                                                                                                       |
| ---------------------- | ----------- | -------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `type`                 | `"command"` | はい      | `"command"` である必要があります                                                                                                               |
| `command`              | string      | はい      | 実行するシェルコマンド。stdin経由でJSONを受け取り、stdoutが表示されます（最大2行）。                                           |
| `refreshInterval`      | number      | いいえ       | N秒ごとにコマンドを再実行します（最小1）。Agentの状態イベントなしに変更されるデータ（時計、クォータ、稼働時間）に便利です。 |
| `respectUserColors`    | boolean     | いいえ       | コマンド出力のANSIカラーコードを保持し、薄暗いフッタースタイリングを適用しません。デフォルトは `false` です。                       |
| `hideContextIndicator` | boolean     | いいえ       | フッター右側の組み込みコンテキスト使用量インジケーターを非表示にします。デフォルトは `false` です。                                       |

### JSON入力

コマンドはstdin経由で以下のフィールドを持つJSONオブジェクトを受け取ります。

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

| Field                                 | Type             | Description                                                                        |
| ------------------------------------- | ---------------- | ---------------------------------------------------------------------------------- |
| `session_id`                          | string           | 一意のセッション識別子                                                          |
| `version`                             | string           | Qwen Code のバージョン                                                                  |
| `model.display_name`                  | string           | 現在のモデル名                                                                 |
| `context_window.context_window_size`  | number           | トークン単位の合計コンテキストウィンドウサイズ                                                |
| `context_window.used_percentage`      | number           | パーセンテージ（0〜100）でのコンテキストウィンドウ使用量                                         |
| `context_window.remaining_percentage` | number           | パーセンテージ（0〜100）でのコンテキストウィンドウ残量                                     |
| `context_window.current_usage`        | number           | 最後のAPI呼び出しからのトークン数（現在のコンテキストサイズ）                          |
| `context_window.total_input_tokens`   | number           | このセッションで消費された合計入力トークン                                           |
| `context_window.total_output_tokens`  | number           | このセッションで消費された合計出力トークン                                          |
| `workspace.current_dir`               | string           | 現在の作業ディレクトリ                                                          |
| `git`                                 | object \| absent | Gitリポジトリ内にある場合にのみ存在します。                                              |
| `git.branch`                          | string           | 現在のブランチ名                                                                |
| `worktree`                            | object \| absent | アクティブなworktree内（`enter_worktree` によって作成されたもの）にある場合にのみ存在します。         |
| `worktree.name`                       | string           | worktreeのスラッグ名                                                                 |
| `worktree.path`                       | string           | worktreeディレクトリへの絶対パス                                            |
| `worktree.branch`                     | string           | worktreeでチェックアウトされているブランチ                                                 |
| `worktree.original_cwd`               | string           | worktreeに入る前の作業ディレクトリ                                     |
| `worktree.original_branch`            | string           | worktreeに入る前にアクティブだったブランチ                                |
| `metrics.models.<id>.api`             | object           | モデルごとのAPI統計: `total_requests`, `total_errors`, `total_latency_ms`          |
| `metrics.models.<id>.tokens`          | object           | モデルごとのトークン使用量: `prompt`, `completion`, `total`, `cached`, `thoughts`       |
| `metrics.files`                       | object           | ファイル変更統計: `total_lines_added`, `total_lines_removed`                      |
| `vim`                                 | object \| absent | vimモードが有効な場合にのみ存在します。`mode`（`"INSERT"` または `"NORMAL"`）を含みます。 |

> **重要:** stdinは1回しか読み取れません。常にまず変数に保存してください: `input=$(cat)`。

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

> 注: `git.branch` フィールドはJSON入力に直接提供されるため、`git` をシェル実行する必要はありません。

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

ステータスラインにAgentイベントなしに変更されるデータ（時計、稼働時間、レート制限カウンターなど）を表示する場合は `refreshInterval` を使用します。

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

出力（1秒ごとに更新）: `14:32:07  (main)`

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

- **更新トリガー**: モデルの変更、新しいメッセージの送信（トークンカウントの変更）、vimモードの切り替え、Gitブランチの変更、ツール呼び出しの完了、またはファイルの変更が発生したときにステータスラインが更新されます。更新はデバウンスされます（300ms）。
- **出力**: 最大2行。各行はフッターの左側に別々の行としてレンダリングされます。利用可能な幅を超える行は切り詰められます。
- **ホットリロード**: 設定の `ui.statusLine` への変更はすぐに反映されます。再起動は不要です。
- **削除**: 設定から `ui.statusLine` キーを削除すると無効になります。「? for shortcuts」ヒントが戻ります。

**コマンドモードのみ:**

- **タイムアウト**: 5秒以上かかるコマンドは強制終了されます。失敗時にはステータスラインがクリアされます。
- **リフレッシュ**: `refreshInterval`（秒）を設定すると、タイマーでコマンドを追加で再実行できます。Agentイベントなしに変更されるデータ（時計、レート制限、ビルドステータス）に便利です。
- **シェル**: コマンドはmacOS/Linuxでは `/bin/sh` 経由で実行されます。Windowsではデフォルトで `cmd.exe` が使用されます。POSIXコマンドは `bash -c "..."` でラップするか、bashスクリプト（例: `bash ~/.qwen/statusline-command.sh`）を指定してください。

**プリセットモードのみ:**

- **外部依存なし**: プリセット項目は内部で計算されるため、シェルコマンドも `jq` もタイムアウトもありません。
- **テーマ統合**: `useThemeColors` が `true`（デフォルト）の場合、ステータスラインのテキストはアクティブな `/theme` の色を使用します。`false` の場合、薄暗いフッタースタイリングが適用されます。
- **PRルックアップ**: `pull-request-number` 項目はバックグラウンドで `gh pr view` を実行します（2秒のタイムアウト）。これは更新ごとではなく、ブランチが変更されたときにのみトリガーされます。

## トラブルシューティング

| Problem                     | Cause                          | Fix                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ステータスラインが表示されない     | 設定のパスが間違っている           | ルートレベルの `statusLine` ではなく、`ui.statusLine` の下に配置する必要があります                                                                                                                                                                                                                                                                                                                                             |
| 空の出力（コマンドモード） | コマンドがサイレントに失敗する         | 手動でテストします: `echo '{"session_id":"test","version":"0.14.1","model":{"display_name":"test"},"context_window":{"context_window_size":0,"used_percentage":0,"remaining_percentage":100,"current_usage":0,"total_input_tokens":0,"total_output_tokens":0},"workspace":{"current_dir":"/tmp"},"metrics":{"models":{},"files":{"total_lines_added":0,"total_lines_removed":0}}}' \| sh -c 'your_command'` |
| 古いデータ（コマンドモード）   | トリガーが発生していない               | メッセージを送信するかモデルを切り替えて更新をトリガーします。または `refreshInterval` を設定してタイマーでコマンドを再実行します                                                                                                                                                                                                                                                                                       |
| コマンドが遅すぎる            | 複雑なスクリプト                 | スクリプトを最適化するか、重い処理をバックグラウンドキャッシュに移動します                                                                                                                                                                                                                                                                                                                                           |
| プリセット項目がない        | 条件付き項目にデータがない | `git-branch` はGitリポジトリ外では非表示になります。`context-used` は使用量が0のときに非表示になります。`branch-changes` はファイルが変更されていないときに非表示になります。これは想定された動作であり、データが利用可能になると項目が表示されます                                                                                                                                                                                                     |
| PR番号が表示されない       | `gh` CLIがインストールされていない         | [GitHub CLI](https://cli.github.com/) をインストールし、`gh auth login` で認証します。ルックアップは2秒のタイムアウトで実行されます                                                                                                                                                                                                                                                                                 |