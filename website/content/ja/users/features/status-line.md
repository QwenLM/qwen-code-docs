# ステータスライン

> シェルコマンドを使用して、フッターにカスタム情報を表示します。

ステータスラインを使用すると、シェルコマンドを実行し、その出力をフッターの左側に表示できます。コマンドは stdin 経由で構造化された JSON コンテキストを受け取るため、現在のモデル、トークン使用量、git ブランチなど、セッションに応じた情報や、スクリプトで取得可能な任意の情報を表示できます。

```
With status line (default approval mode — 1 row):
┌─────────────────────────────────────────────────────────────────┐
│  user@host ~/project (main) ctx:34%   🔒 docker | Debug | 67%  │  ← status line
└─────────────────────────────────────────────────────────────────┘

With status line + non-default mode (2 rows):
┌─────────────────────────────────────────────────────────────────┐
│  user@host ~/project (main) ctx:34%   🔒 docker | Debug | 67%  │  ← status line
│  auto-accept edits (shift + tab to cycle)                       │  ← mode indicator
└─────────────────────────────────────────────────────────────────┘
```

設定すると、ステータスラインはデフォルトの「? for shortcuts」ヒントに代わって表示されます。高優先度のメッセージ（Ctrl+C/D による終了プロンプト、Esc、vim の INSERT モードなど）は一時的にステータスラインを上書きします。ステータスラインのテキストは、利用可能な幅に収まるように切り詰められます。

## 前提条件

- JSON 入力の解析には [`jq`](https://jqlang.github.io/jq/) の使用を推奨します（`brew install jq` や `apt install jq` などでインストール）。
- JSON データを必要としない単純なコマンド（例: `git branch --show-current`）は、`jq` なしでも動作します。

## クイックセットアップ

ステータスラインを設定する最も簡単な方法は、`/statusline` コマンドを使用することです。これにより、シェルの PS1 設定を読み取り、一致するステータスラインを生成するセットアップエージェントが起動します。

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
| --------- | ----------- | -------- | ------------------------------------------------------------------------------------- |
| `type`    | `"command"` | はい      | `"command"` である必要があります                                                                   |
| `command` | string      | はい      | 実行するシェルコマンド。stdin 経由で JSON を受け取り、stdout の最初の行が表示されます。 |

## JSON 入力

コマンドは、以下のフィールドを持つ JSON オブジェクトを stdin 経由で受け取ります。

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

| フィールド | 型 | 説明 |
| ------------------------------------- | ---------------- | ---------------------------------------------------------------------------------- |
| `session_id`                          | string           | 一意のセッション識別子 |
| `version`                             | string           | Qwen Code のバージョン |
| `model.display_name`                  | string           | 現在のモデル名 |
| `context_window.context_window_size`  | number           | トークン単位のコンテキストウィンドウの合計サイズ |
| `context_window.used_percentage`      | number           | コンテキストウィンドウの使用率（0〜100） |
| `context_window.remaining_percentage` | number           | コンテキストウィンドウの残量率（0〜100） |
| `context_window.current_usage`        | number           | 最後の API 呼び出しからのトークン数（現在のコンテキストサイズ） |
| `context_window.total_input_tokens`   | number           | このセッションで消費された合計入力トークン数 |
| `context_window.total_output_tokens`  | number           | このセッションで消費された合計出力トークン数 |
| `workspace.current_dir`               | string           | 現在の作業ディレクトリ |
| `git`                                 | object \| absent | git リポジトリ内でのみ存在します。 |
| `git.branch`                          | string           | 現在のブランチ名 |
| `metrics.models.<id>.api`             | object           | モデル別の API 統計情報：`total_requests`、`total_errors`、`total_latency_ms` |
| `metrics.models.<id>.tokens`          | object           | モデル別のトークン使用量：`prompt`、`completion`、`total`、`cached`、`thoughts` |
| `metrics.files`                       | object           | ファイル変更統計情報：`total_lines_added`、`total_lines_removed` |
| `vim`                                 | object \| absent | vim モードが有効な場合のみ存在します。`mode`（`"INSERT"` または `"NORMAL"`）を含みます。 |

> **重要:** stdin は一度しか読み取れません。必ず最初に `input=$(cat)` で変数に格納してください。

## 使用例

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

> 注: `git.branch` フィールドは JSON 入力に直接含まれているため、外部コマンドとして `git` を呼び出す必要はありません。

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

### 複雑なコマンド用のスクリプトファイル

コマンドが長くなる場合は、`~/.qwen/statusline-command.sh` にスクリプトファイルとして保存します。

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

設定でこのファイルを参照します。

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

- **更新トリガー**: モデルの変更、メッセージの送信（トークン数の変化）、vim モードの切り替え、git ブランチの変更、ツール呼び出しの完了、ファイルの変更が発生するとステータスラインが更新されます。更新には 300ms のデバウンス処理が適用されます。
- **タイムアウト**: 5秒以上かかるコマンドは強制終了されます。失敗した場合、ステータスラインはクリアされます。
- **出力**: stdout の最初の行のみが使用されます。テキストはフッターの左側に薄めの色でレンダリングされ、利用可能な幅を超えた場合は切り詰められます。
- **ホットリロード**: 設定の `ui.statusLine` への変更は即時反映されます。再起動は不要です。
- **シェル**: macOS/Linux では `/bin/sh` 経由でコマンドが実行されます。Windows ではデフォルトで `cmd.exe` が使用されるため、POSIX コマンドは `bash -c "..."` でラップするか、bash スクリプトを直接指定してください（例: `bash ~/.qwen/statusline-command.sh`）。
- **無効化**: 設定から `ui.statusLine` キーを削除すると無効になります。デフォルトの「? for shortcuts」ヒントが再度表示されます。

## トラブルシューティング

| 問題 | 原因 | 解決策 |
| ----------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ステータスラインが表示されない | 設定パスが誤っている | `statusLine` はルートレベルではなく、`ui.statusLine` 配下に配置する必要があります |
| 出力が空になる | コマンドがサイレントに失敗している | 手動でテスト: `echo '{"session_id":"test","version":"0.14.1","model":{"display_name":"test"},"context_window":{"context_window_size":0,"used_percentage":0,"remaining_percentage":100,"current_usage":0,"total_input_tokens":0,"total_output_tokens":0},"workspace":{"current_dir":"/tmp"},"metrics":{"models":{},"files":{"total_lines_added":0,"total_lines_removed":0}}}' \| sh -c 'your_command'` |
| データが古いまま | トリガーが発火していない | メッセージを送信するかモデルを切り替えて更新をトリガーしてください |
| コマンドが遅すぎる | スクリプトが複雑すぎる | スクリプトを最適化するか、重い処理をバックグラウンドキャッシュに移行してください |