# ステータスライン

> シェルコマンドを使用して、フッターにカスタム情報を表示します。

ステータスラインを使用すると、シェルコマンドを実行し、その出力をフッターの左側に表示できます。コマンドは stdin を介して構造化された JSON コンテキストを受け取るため、現在のモデル、トークン使用量、git ブランチなど、セッション状態を反映した情報や、スクリプトで取得可能な任意の情報を表示できます。

```
Single-line status (default approval mode — 1 row):
┌─────────────────────────────────────────────────────────────────┐
│  user@host ~/project (main) ctx:34%   🔒 docker | Debug | 67%  │  ← status line
└─────────────────────────────────────────────────────────────────┘

Multi-line status (up to 2 lines — 2 rows):
┌─────────────────────────────────────────────────────────────────┐
│  user@host ~/project (main) ctx:34%   🔒 docker | Debug | 67%  │  ← status line 1
│  ████████░░░░░░░░░░ 34% context                                │  ← status line 2
└─────────────────────────────────────────────────────────────────┘

Multi-line status + non-default mode (3 rows max):
┌─────────────────────────────────────────────────────────────────┐
│  user@host ~/project (main) ctx:34%   🔒 docker | Debug | 67%  │  ← status line 1
│  ████████░░░░░░░░░░ 34% context                                │  ← status line 2
│  auto-accept edits (shift + tab to cycle)                       │  ← mode indicator
└─────────────────────────────────────────────────────────────────┘
```

設定すると、ステータスラインはデフォルトの「? for shortcuts」ヒントに代わって表示されます。高優先度のメッセージ（Ctrl+C/D の終了プロンプト、Esc、vim の INSERT モードなど）は一時的にステータスラインを上書きします。ステータスラインのテキストは、利用可能な幅に収まるように切り詰められます。

## 前提条件

- JSON 入力の解析には [`jq`](https://jqlang.github.io/jq/) の使用を推奨します（`brew install jq` や `apt install jq` などでインストールしてください）
- JSON データを必要としない単純なコマンド（例: `git branch --show-current`）は、`jq` なしでも動作します

## クイックセットアップ

ステータスラインを設定する最も簡単な方法は、`/statusline` コマンドを使用することです。これにより、シェルの PS1 設定を読み取り、それに一致するステータスラインを生成するセットアップエージェントが起動します。

```
/statusline
```

具体的な指示を渡すこともできます。

```
/statusline show model name and context usage percentage
```

## 手動設定

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

| フィールド | 型 | 必須 | 説明 |
| ----------------- | ----------- | -------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `type`            | `"command"` | はい      | `"command"` である必要があります                                                                                                               |
| `command`         | string      | はい      | 実行するシェルコマンド。stdin を介して JSON を受け取り、stdout が表示されます（最大 2 行）。                                           |
| `refreshInterval` | number      | いいえ       | N 秒ごとにコマンドを再実行します（最小 1）。Agent の状態イベントなしで変化するデータ（時計、クォータ、稼働時間など）に便利です。 |

## JSON 入力

コマンドは、以下のフィールドを含む JSON オブジェクトを stdin を介して受け取ります。

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

| フィールド                                 | 型             | 説明                                                                        |
| ------------------------------------- | ---------------- | ---------------------------------------------------------------------------------- |
| `session_id`                          | string           | ユニークなセッション識別子                                                          |
| `version`                             | string           | Qwen Code のバージョン                                                                  |
| `model.display_name`                  | string           | 現在のモデル名                                                                 |
| `context_window.context_window_size`  | number           | コンテキストウィンドウの合計サイズ（トークン数）                                                |
| `context_window.used_percentage`      | number           | コンテキストウィンドウの使用率（0～100）                                         |
| `context_window.remaining_percentage` | number           | コンテキストウィンドウの残存率（0～100）                                     |
| `context_window.current_usage`        | number           | 最後の API コールからのトークン数（現在のコンテキストサイズ）                          |
| `context_window.total_input_tokens`   | number           | このセッションで消費された合計入力トークン数                                           |
| `context_window.total_output_tokens`  | number           | このセッションで消費された合計出力トークン数                                          |
| `workspace.current_dir`               | string           | 現在の作業ディレクトリ                                                          |
| `git`                                 | object \| absent | git リポジトリ内でのみ存在します。                                              |
| `git.branch`                          | string           | 現在のブランチ名                                                                |
| `metrics.models.<id>.api`             | object           | モデル別の API 統計情報: `total_requests`、`total_errors`、`total_latency_ms`          |
| `metrics.models.<id>.tokens`          | object           | モデル別のトークン使用量: `prompt`、`completion`、`total`、`cached`、`thoughts`       |
| `metrics.files`                       | object           | ファイル変更統計情報: `total_lines_added`、`total_lines_removed`                      |
| `vim`                                 | object \| absent | vim モードが有効な場合のみ存在します。`mode`（`"INSERT"` または `"NORMAL"`）を含みます。 |

> **重要:** stdin は 1 回しか読み取れません。必ず最初に `input=$(cat)` で変数に格納してください。

## 例

### モデルとトークン使用量

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

### Git ブランチ + ディレクトリ

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

> 注: `git.branch` フィールドは JSON 入力に直接提供されるため、`git` コマンドを外部実行する必要はありません。

### ファイル変更統計情報

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

### リアルタイム時計と Git ブランチ

Agent イベントなしで変化するデータ（時計、稼働時間、レートリミットカウンターなど）をステータスラインに表示する場合は、`refreshInterval` を使用します。

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

出力（1 秒ごとに更新）: `14:32:07  (main)`

### 複雑なコマンド用のスクリプトファイル

コマンドが長くなる場合は、スクリプトファイルを `~/.qwen/statusline-command.sh` に保存します。

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

設定でこれを参照します。

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

## 動作仕様

- **更新トリガー**: モデルの変更、新メッセージの送信（トークン数の変化）、vim モードの切り替え、git ブランチの変更、ツール呼び出しの完了、またはファイルの変更が発生すると、ステータスラインが更新されます。更新はデバウンス処理されます（300ms）。`refreshInterval`（秒）を設定すると、タイマーによるコマンドの再実行も追加されます。Agent イベントなしで変化するデータ（時計、レートリミット、ビルドステータスなど）に便利です。
- **タイムアウト**: 5 秒以上かかるコマンドは強制終了されます。失敗するとステータスラインはクリアされます。
- **出力**: 複数行の出力に対応しています（最大 2 行。余分な行は破棄されます）。各行はフッターの左側に別々の行として、薄めの色でレンダリングされます。利用可能な幅を超える行は切り詰められます。
- **ホットリロード**: 設定の `ui.statusLine` への変更は即時反映されます。再起動は不要です。
- **シェル**: macOS/Linux では `/bin/sh` 経由でコマンドが実行されます。Windows ではデフォルトで `cmd.exe` が使用されます。POSIX コマンドは `bash -c "..."` でラップするか、bash スクリプトを指定してください（例: `bash ~/.qwen/statusline-command.sh`）。
- **削除**: 設定から `ui.statusLine` キーを削除すると無効になります。「? for shortcuts」ヒントが再度表示されます。

## トラブルシューティング

| 問題                 | 原因                  | 解決方法                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ステータスラインが表示されない | 設定パスが誤っている   | ルートレベルの `statusLine` ではなく、`ui.statusLine` 配下に配置する必要があります                                                                                                                                                                                                                                                                                                                                             |
| 出力が空になる            | コマンドがサイレントに失敗している | 手動でテストしてください: `echo '{"session_id":"test","version":"0.14.1","model":{"display_name":"test"},"context_window":{"context_window_size":0,"used_percentage":0,"remaining_percentage":100,"current_usage":0,"total_input_tokens":0,"total_output_tokens":0},"workspace":{"current_dir":"/tmp"},"metrics":{"models":{},"files":{"total_lines_added":0,"total_lines_removed":0}}}' \| sh -c 'your_command'` |
| データが古いまま              | トリガーが発火していない       | メッセージを送信するかモデルを切り替えて更新をトリガーするか、`refreshInterval` を設定してタイマーでコマンドを再実行してください                                                                                                                                                                                                                                                                                       |
| コマンドが遅すぎる        | スクリプトが複雑すぎる         | スクリプトを最適化するか、重い処理をバックグラウンドキャッシュに移行してください                                                                                                                                                                                                                                                                                                                                           |