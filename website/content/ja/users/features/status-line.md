# ステータスライン

> フッターにカスタム情報を表示する。

ステータスラインは、モデル名・トークン使用量・git ブランチなどのセッション情報をフッター左側に表示します。設定方法は 2 種類あります：

- **プリセットモード** — インタラクティブダイアログまたは JSON 設定で組み込みデータ項目を選択。スクリプト不要。
- **コマンドモード** — stdin 経由で構造化 JSON コンテキストを受け取るシェルコマンドを実行。カスタムフォーマットを自由に記述できる。

```
シングルラインステータス（デフォルト承認モード — 1 行）:
┌─────────────────────────────────────────────────────────────────┐
│  user@host ~/project (main) ctx:34%   🔒 docker | Debug | 67%  │  ← ステータスライン
└─────────────────────────────────────────────────────────────────┘

マルチラインステータス（最大 2 行）:
┌─────────────────────────────────────────────────────────────────┐
│  user@host ~/project (main) ctx:34%   🔒 docker | Debug | 67%  │  ← ステータスライン 1
│  ████████░░░░░░░░░░ 34% context                                │  ← ステータスライン 2
└─────────────────────────────────────────────────────────────────┘

マルチラインステータス + 非デフォルトモード（最大 3 行）:
┌─────────────────────────────────────────────────────────────────┐
│  user@host ~/project (main) ctx:34%   🔒 docker | Debug | 67%  │  ← ステータスライン 1
│  ████████░░░░░░░░░░ 34% context                                │  ← ステータスライン 2
│  auto-accept edits (shift + tab to cycle)                       │  ← モードインジケーター
└─────────────────────────────────────────────────────────────────┘
```

設定すると、ステータスラインはデフォルトの「? for shortcuts」ヒントを置き換えます。優先度の高いメッセージ（Ctrl+C/D 終了プロンプト、Esc、vim INSERT モード）は一時的にステータスラインを上書きします。ステータスラインのテキストは利用可能な幅に収まるよう切り詰められます。

## クイックセットアップ

ステータスラインを設定する最も簡単な方法は `/statusline` コマンドです。インタラクティブなダイアログが開き、プリセット項目の選択、テーマカラーの切り替え、ライブプレビューの確認ができます：

```
/statusline
```

これでプリセットモードの設定画面が開きます。矢印キーでナビゲート、スペースで項目の切り替え、Enter で確定します。選択内容は自動的に設定に保存されます。

`/statusline` に具体的な指示を渡すことで、コマンドモードの設定を生成させることもできます：

```
/statusline show model name and context usage percentage
```

---

## プリセットモード

プリセットモードは、シェルコマンド・`jq`・スクリプトなしで選択・組み合わせできる組み込みデータ項目セットを提供します。項目は 1 行に `item1 | item2 | item3` の形式でレンダリングされます。

### 設定

`~/.qwen/settings.json` の `ui` キー下に `statusLine` オブジェクトを追加します：

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

| フィールド             | 型         | 必須 | 説明                                                                                                       |
| ---------------------- | ---------- | ---- | ---------------------------------------------------------------------------------------------------------- |
| `type`                 | `"preset"` | Yes  | `"preset"` を指定する必要があります                                                                         |
| `items`                | string[]   | Yes  | 表示するプリセット項目 ID の順序付きリスト（下表参照）。項目は `\|` で区切られます。                         |
| `useThemeColors`       | boolean    | No   | アクティブな `/theme` のカラーをステータスラインテキストに適用します。デフォルトは `true`。                   |
| `hideContextIndicator` | boolean    | No   | フッター右側の組み込みコンテキスト使用量インジケーターを非表示にします。デフォルトは `false`。               |

### 利用可能なプリセット項目

| 項目 ID                | デフォルト | 説明                                                               |
| ---------------------- | ---------- | ------------------------------------------------------------------ |
| `model-with-reasoning` | Yes        | 推論レベル付きの現在のモデル名（例: `qwen-3-235b high`）            |
| `model`                |            | 推論レベルなしの現在のモデル名                                     |
| `git-branch`           | Yes        | 現在の Git ブランチ名（git リポジトリ外では非表示）                 |
| `context-remaining`    | Yes        | コンテキストウィンドウの残存割合（例: `Context 65.7% left`）        |
| `total-input-tokens`   |            | セッション累計入力トークン数（例: `30.0k total in`）               |
| `total-output-tokens`  |            | セッション累計出力トークン数（例: `5.0k total out`）               |
| `current-dir`          | Yes        | 現在の作業ディレクトリ                                             |
| `project-name`         |            | プロジェクト名（作業ディレクトリのベース名）                       |
| `pull-request-number`  |            | 現在のブランチのオープン PR 番号（`gh` CLI が必要）                 |
| `branch-changes`       |            | セッションファイル変更統計（例: `+120 -30`）                       |
| `context-used`         | Yes        | コンテキストウィンドウの使用割合（例: `Context 34.3% used`）        |
| `run-state`            |            | コンパクトなセッション状態（`Ready`、`Working`、または `Confirm`）  |
| `qwen-version`         |            | Qwen Code のバージョン（例: `v0.14.1`）                            |
| `context-window-size`  |            | コンテキストウィンドウの合計サイズ（例: `131.1k window`）          |
| `used-tokens`          |            | 現在のプロンプトトークン数（例: `45.0k used`）                     |
| `session-id`           |            | 現在のセッション識別子                                             |

**デフォルト**とマークされた項目は、`/statusline` ダイアログを初めて開いたときに事前選択されています。

`total-input-tokens` と `total-output-tokens` はセッション合計値です。ターンをまたいでトークン使用量を累積するため、新しいモデルリクエストのたびに現在の会話コンテキストが再度含まれる入力トークンは急速に増加します。現在のプロンプトサイズを確認したい場合は、セッション累計ではなく `used-tokens` を使用してください。

### 出力例

デフォルト項目を使用した場合、ステータスラインは次のようになります：

```
qwen-3-235b high | main | Context 65.7% left | /home/user/project | Context 34.3% used
```

### ダイアログによるカスタマイズ

`/statusline` を実行すると、インタラクティブな複数選択ダイアログが開きます：

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
- Enter を押すと設定が保存されます

---

## コマンドモード

コマンドモードは、stdout がステータスラインに表示されるシェルコマンドを実行します。コマンドは stdin 経由でセッション情報を含む構造化 JSON コンテキストを受け取ります。

### 前提条件

- [`jq`](https://jqlang.github.io/jq/) は JSON 入力のパースに推奨されます（`brew install jq`、`apt install jq` などでインストール）
- JSON データを必要としないシンプルなコマンド（例: `git branch --show-current`）は `jq` なしで動作します

### 設定

`~/.qwen/settings.json` の `ui` キー下に `statusLine` オブジェクトを追加します：

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

| フィールド             | 型          | 必須 | 説明                                                                                                                              |
| ---------------------- | ----------- | ---- | --------------------------------------------------------------------------------------------------------------------------------- |
| `type`                 | `"command"` | Yes  | `"command"` を指定する必要があります                                                                                               |
| `command`              | string      | Yes  | 実行するシェルコマンド。stdin で JSON を受け取り、stdout が表示されます（最大 2 行）。                                             |
| `refreshInterval`      | number      | No   | N 秒ごとにコマンドを再実行します（最小 1）。Agent 状態イベントなしに変化するデータ（時計、クォータ、稼働時間など）に便利です。    |
| `respectUserColors`    | boolean     | No   | 暗いフッタースタイルを適用する代わりに、コマンド出力の ANSI カラーコードを保持します。デフォルトは `false`。                       |
| `hideContextIndicator` | boolean     | No   | フッター右側の組み込みコンテキスト使用量インジケーターを非表示にします。デフォルトは `false`。                                   |

### JSON 入力

コマンドは stdin 経由で次のフィールドを含む JSON オブジェクトを受け取ります：

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

| フィールド                            | 型               | 説明                                                                               |
| ------------------------------------- | ---------------- | ---------------------------------------------------------------------------------- |
| `session_id`                          | string           | 一意のセッション識別子                                                             |
| `version`                             | string           | Qwen Code のバージョン                                                             |
| `model.display_name`                  | string           | 現在のモデル名                                                                     |
| `context_window.context_window_size`  | number           | コンテキストウィンドウの合計サイズ（トークン単位）                                 |
| `context_window.used_percentage`      | number           | コンテキストウィンドウの使用割合（0〜100）                                          |
| `context_window.remaining_percentage` | number           | コンテキストウィンドウの残存割合（0〜100）                                          |
| `context_window.current_usage`        | number           | 最後の API 呼び出し時のトークン数（現在のコンテキストサイズ）                      |
| `context_window.total_input_tokens`   | number           | このセッションで消費した入力トークンの合計                                         |
| `context_window.total_output_tokens`  | number           | このセッションで消費した出力トークンの合計                                         |
| `workspace.current_dir`               | string           | 現在の作業ディレクトリ                                                             |
| `git`                                 | object \| absent | git リポジトリ内でのみ存在します。                                                 |
| `git.branch`                          | string           | 現在のブランチ名                                                                   |
| `worktree`                            | object \| absent | アクティブなワークツリー内（`enter_worktree` で作成）でのみ存在します。            |
| `worktree.name`                       | string           | ワークツリーのスラッグ名                                                           |
| `worktree.path`                       | string           | ワークツリーディレクトリへの絶対パス                                               |
| `worktree.branch`                     | string           | ワークツリーでチェックアウトされているブランチ                                     |
| `worktree.original_cwd`               | string           | ワークツリーに入る前の作業ディレクトリ                                             |
| `worktree.original_branch`            | string           | ワークツリーに入る前にアクティブだったブランチ                                     |
| `metrics.models.<id>.api`             | object           | モデルごとの API 統計: `total_requests`、`total_errors`、`total_latency_ms`        |
| `metrics.models.<id>.tokens`          | object           | モデルごとのトークン使用量: `prompt`、`completion`、`total`、`cached`、`thoughts`  |
| `metrics.files`                       | object           | ファイル変更統計: `total_lines_added`、`total_lines_removed`                       |
| `vim`                                 | object \| absent | vim モードが有効な場合のみ存在します。`mode`（`"INSERT"` または `"NORMAL"`）を含みます。 |

> **Important:** stdin は一度しか読み取れません。必ず最初に変数に保存してください: `input=$(cat)`。

### 使用例

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

#### Git ブランチ + ディレクトリ

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

> Note: `git.branch` フィールドは JSON 入力に直接含まれているため、`git` をシェルから呼び出す必要はありません。

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

#### ライブクロックと git ブランチ

Agent イベントなしに変化するデータ（時計、稼働時間、レート制限カウンターなど）をステータスラインに表示する場合は `refreshInterval` を使用します：

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

#### 複雑なコマンド用スクリプトファイル

長いコマンドには、`~/.qwen/statusline-command.sh` にスクリプトファイルを保存します：

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

次に設定でそれを参照します：

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

- **更新トリガー**: モデルの変更、新しいメッセージの送信（トークン数の変化）、vim モードの切り替え、git ブランチの変更、ツール呼び出しの完了、またはファイル変更が発生したときにステータスラインが更新されます。更新はデバウンスされます（300ms）。
- **出力**: 最大 2 行。各行はフッター左側の別の行としてレンダリングされます。利用可能な幅を超える行は切り詰められます。
- **ホットリロード**: 設定の `ui.statusLine` への変更は即座に反映されます — 再起動は不要です。
- **削除**: 設定から `ui.statusLine` キーを削除すると無効化されます。「? for shortcuts」ヒントが元に戻ります。

**コマンドモードのみ:**

- **タイムアウト**: 5 秒以上かかるコマンドは強制終了されます。失敗するとステータスラインはクリアされます。
- **リフレッシュ**: `refreshInterval`（秒）を設定すると、タイマーでコマンドを追加で再実行できます — Agent イベントなしに変化するデータ（時計、レート制限、ビルド状態）に便利です。
- **シェル**: macOS/Linux では `/bin/sh` でコマンドが実行されます。Windows ではデフォルトで `cmd.exe` が使用されます — POSIX コマンドは `bash -c "..."` でラップするか、bash スクリプト（例: `bash ~/.qwen/statusline-command.sh`）を指定してください。

**プリセットモードのみ:**

- **外部依存なし**: プリセット項目は内部で計算されます — シェルコマンド、`jq`、タイムアウトは不要です。
- **テーマ統合**: `useThemeColors` が `true`（デフォルト）の場合、ステータスラインテキストはアクティブな `/theme` のカラーを使用します。`false` の場合、暗いフッタースタイルが適用されます。
- **PR 検索**: `pull-request-number` 項目はバックグラウンドで `gh pr view` を実行します（2 秒タイムアウト）。ブランチが変更されたときのみトリガーされ、毎回の更新ではありません。

## トラブルシューティング

| 問題                              | 原因                           | 対処方法                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ステータスラインが表示されない     | 設定パスが間違っている         | `ui.statusLine` 下に配置する必要があります。ルートレベルの `statusLine` ではありません                                                                                                                                                                                                                                                                                                                 |
| 空の出力（コマンドモード）         | コマンドがサイレントに失敗     | 手動でテスト: `echo '{"session_id":"test","version":"0.14.1","model":{"display_name":"test"},"context_window":{"context_window_size":0,"used_percentage":0,"remaining_percentage":100,"current_usage":0,"total_input_tokens":0,"total_output_tokens":0},"workspace":{"current_dir":"/tmp"},"metrics":{"models":{},"files":{"total_lines_added":0,"total_lines_removed":0}}}' \| sh -c 'your_command'` |
| データが古い（コマンドモード）     | トリガーが発生していない       | メッセージを送信するかモデルを切り替えて更新をトリガーします — またはタイマーでコマンドを再実行するために `refreshInterval` を設定します                                                                                                                                                                                                                                                               |
| コマンドが遅すぎる                | 複雑なスクリプト               | スクリプトを最適化するか、重い処理をバックグラウンドキャッシュに移動します                                                                                                                                                                                                                                                                                                                             |
| プリセット項目が表示されない       | 条件付き項目にデータがない     | `git-branch` は git リポジトリ外では非表示；`context-used` は使用量が 0 のときは非表示；`branch-changes` はファイル変更がない場合は非表示。これは正常な動作です — データが利用可能になると項目が表示されます                                                                                                                                                                                           |
| PR 番号が表示されない             | `gh` CLI がインストールされていない | [GitHub CLI](https://cli.github.com/) をインストールして `gh auth login` で認証してください。検索は 2 秒タイムアウトで実行されます                                                                                                                                                                                                                                                                    |
