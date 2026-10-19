# シェルツール (`run_shell_command`)

本文書では、Qwen Code の `run_shell_command` ツールについて説明します。

## 説明

基盤となるシステムとの対話、スクリプトの実行、またはコマンドライン操作を行うには、`run_shell_command` を使用します。`run_shell_command` は、指定されたシェルコマンドを実行します。`tools.shell.enableInteractiveShell` 設定が `true` に設定されている場合、ユーザー入力を必要とするインタラクティブコマンド（`vim`、`git rebase -i` など）も実行できます。

Windows では、コマンドは `cmd.exe /c` で実行されます。その他のプラットフォームでは、`bash -c` で実行されます。

### 引数

`run_shell_command` は以下の引数を取ります。

- `command` (string, 必須): 実行する正確なシェルコマンド。
- `description` (string, オプション): コマンドの目的の簡単な説明。ユーザーに表示されます。
- `directory` (string, オプション): コマンドを実行するディレクトリ（プロジェクトルートからの相対パス）。指定しない場合、コマンドはプロジェクトルートで実行されます。
- `is_background` (boolean, オプション): コマンドをバックグラウンドで実行するかどうか。指定しない場合、デフォルトは `false`（フォアグラウンド実行）です。開発サーバー、ウォッチャー、デーモンなど、後続のコマンドをブロックせずに実行し続ける必要がある長時間実行されるプロセスには `true` を設定します。

## Qwen Code で `run_shell_command` を使用する方法

`run_shell_command` を使用すると、コマンドはサブプロセスとして実行されます。バックグラウンドで実行するかフォアグラウンドで実行するかは `is_background` パラメータで制御されます。`is_background: true` のときに末尾の `&` を追加しないでください。managed background パス自体がバックグラウンド化の仕組みであり、ツールは呼び出しを拒否します。このツールは実行に関する詳細情報を返します。これには以下が含まれます。

### `is_background` パラメータ

`is_background` はオプションです — ツールのスキーマでは `command` のみが必須です — 省略した場合、コマンドはフォアグラウンドで実行されます。したがって明示的な決定が必要なのは反対のケースです。自行停止しないコマンドには `is_background: true` を設定する必要があります。フォアグラウンドのままではタイムアウトまでターンがブロックされるからです。

### バックグラウンド実行とフォアグラウンド実行

このツールはそのパラメータに基づいてバックグラウンド実行とフォアグラウンド実行を処理します。

**バックグラウンド実行（`is_background: true`）を使用する場合:**

- 長時間実行される開発サーバー: `npm run start`、`npm run dev`、`yarn dev`
- ビルドウォッチャー: `npm run watch`、`webpack --watch`
- データベースサーバー: `mongod`、`mysql`、`redis-server`
- Web サーバー: `python -m http.server`、`php -S localhost:8000`
- 手動で停止されるまで無期限に実行されると予想される任意のコマンド

自行停止するコマンドには**フォアグラウンド実行（デフォルト）**を使用します。ビルド、インストール、git 操作、テスト実行などです。

### 実行情報

このツールは実行に関する詳細情報を返します。これには以下が含まれます。

- `Command`: 実行されたコマンド。
- `Directory`: コマンドが実行されたディレクトリ。
- `Stdout`: 標準出力ストリームからの出力。
- `Stderr`: 標準エラーストリームからの出力。
- `Error`: サブプロセスによって報告されたエラーメッセージ。
- `Exit Code`: コマンドの終了コード。
- `Signal`: コマンドがシグナルによって終了された場合のシグナル番号。
- `Background PIDs`: 開始されたバックグラウンドプロセスの PID のリスト。

使用法:

```bash
run_shell_command(command="Your commands.", description="Your description of the command.", directory="Your execution directory.", is_background=false)
```

**注:** `is_background` はオプションです。省略するとコマンドはフォアグラウンドで実行されるため、明示的な `true` が必要なのは自行停止しないコマンドの場合です。

## `run_shell_command` の例

現在のディレクトリ内のファイルを一覧表示する:

```bash
run_shell_command(command="ls -la", is_background=false)
```

特定のディレクトリでスクリプトを実行する:

```bash
run_shell_command(command="./my_script.sh", directory="scripts", description="Run my custom script", is_background=false)
```

バックグラウンドで開発サーバーを起動する（推奨される方法）:

```bash
run_shell_command(command="npm run dev", description="Start development server in background", is_background=true)
```

注: 明示的な `&` は managed background の仕組みではありません。`is_background: true` では、ツールはコマンド実行前に末尾の `&` を拒否します。`is_background=false` では、シェルがプロセスをデタッチするため、プロセスが追跡されないまま呼び出しが戻ります — バックグラウンドタスクのエントリがなく、`task_stop` でも到達できません。バックグラウンドで実行すべきコマンドには常に `is_background=true` を使用してください。

フォアグラウンドでビルドコマンドを実行する:

```bash
run_shell_command(command="npm run build", description="Build the project", is_background=false)
```

複数のバックグラウンドサービスを起動する:

```bash
run_shell_command(command="docker-compose up", description="Start all services", is_background=true)
```

## 設定

`settings.json` ファイルを変更するか、Qwen Code で `/settings` コマンドを使用することで、`run_shell_command` ツールの動作を設定できます。

### インタラクティブコマンドの有効化

`tools.shell.enableInteractiveShell` 設定は、シェルコマンドを `node-pty`（インタラクティブ PTY）経由で実行するか、プレーンな `child_process` バックエンドで実行するかを制御します。有効にすると、`vim`、`git rebase -i`、TUI プログラムなどのインタラクティブセッションが正しく動作します。

設定が省略された場合、明示的なワンショットプロンプトは `child_process` を使用し、インタラクティブ TUI、ACP、stream-json 入力、stdin のみ、およびファイル入力セッションは PTY を使用します。Windows ビルド **<= 19041**（Windows 10 バージョン 2004 より前）では、古い ConPTY 実装には既知の信頼性の問題（出力の欠落、ハング）があるため、PTY モードは `child_process` にフォールバックします。これは、VS Code で使用されているのと同じカットオフと一致します（[microsoft/vscode#123725](https://github.com/microsoft/vscode/issues/123725)）。実行時に `node-pty` が利用できない場合、ツールは `child_process` にフォールバックします。

デフォルトを明示的にオーバーライドするには、`settings.json` で値を設定します。

**`settings.json` の例:**

```json
{
  "tools": {
    "shell": {
      "enableInteractiveShell": true
    }
  }
}
```

### 出力に色を表示する

シェル出力に色を表示するには、`tools.shell.showColor` 設定を `true` に設定する必要があります。**注: この設定は、`tools.shell.enableInteractiveShell` が有効になっている場合にのみ適用されます。**

**`settings.json` の例:**

```json
{
  "tools": {
    "shell": {
      "showColor": true
    }
  }
}
```

### ページャーの設定

`tools.shell.pager` 設定を設定することで、シェル出力のカスタムページャーを設定できます。デフォルトのページャーは、Windows 以外のプラットフォームでは `cat` です。Windows ではデフォルトは設定されていません。ページャー環境変数を無効にするには、`tools.shell.pager` を空の文字列に設定します。**注: この設定は、`tools.shell.enableInteractiveShell` が有効になっている場合にのみ適用されます。**

**`settings.json` の例:**

```json
{
  "tools": {
    "shell": {
      "pager": "less"
    }
  }
}
```

## インタラクティブコマンド

`run_shell_command` ツールは、疑似端末（pty）を統合することで、インタラクティブコマンドをサポートするようになりました。これにより、テキストエディタ（`vim`、`nano`）、ターミナルベースの UI（`htop`）、インタラクティブなバージョン管理操作（`git rebase -i`）など、リアルタイムのユーザー入力を必要とするコマンドを実行できます。

インタラクティブコマンドが実行されている間、Qwen Code からそれに入力を送信できます。インタラクティブシェルにフォーカスするには、`ctrl+f` を押します。複雑な TUI を含むターミナル出力が正しくレンダリングされます。

## 重要な注意事項

- **セキュリティ:** セキュリティの脆弱性を防ぐために、特にユーザー入力から構築されたコマンドを実行する際は注意してください。
- **エラー処理:** コマンドが正常に実行されたかどうかを確認するには、`Stderr`、`Error`、および `Exit Code` フィールドを確認します。
- **バックグラウンドプロセス:** `is_background=true` のみが追跡対象のバックグラウンドプロセスを起動します。ツールは shell id と PID を即座に返し、プロセスは実行を続けます。シェルレベルの `&` では追跡対象のプロセスは作成されません — `is_background: true` ではツールは末尾の `&` を拒否し、`is_background=false` ではツールが追跡せずにシェルがコマンドをデタッチします。
- **バックグラウンド実行の選択:** `is_background` パラメータはオプションです（スキーマでは `command` のみが必須）。自行停止しないコマンドには `is_background: true` を設定してください。フォアグラウンドのままではタイムアウトまでターンがブロックされるからです。シェルレベルの `&` ではなく `is_background` を使用してください。意図がより明確で、ツールがバックグラウンド実行のセットアップを管理します。
- **コマンドの説明:** `is_background=true` を使用する場合、コマンドの説明には実行モードを明確に示す `[background]` インジケーターが含まれます。

## 環境変数

`run_shell_command` がコマンドを実行すると、サブプロセスの環境に `QWEN_CODE=1` 環境変数が設定されます。これにより、スクリプトやツールは、CLI 内から実行されているかどうかを検出できます。

## コマンドの制限

設定ファイルで `tools.core` および `tools.exclude` 設定を使用することで、`run_shell_command` ツールで実行できるコマンドを制限できます。

- `tools.core`: `run_shell_command` を特定のコマンドセットに制限するには、`tools` カテゴリの下の `core` リストに `run_shell_command(<command>)` 形式でエントリを追加します。たとえば、`"tools": {"core": ["run_shell_command(git)"]}` は `git` コマンドのみを許可します。汎用の `run_shell_command` を含めるとワイルドカードとして機能し、明示的にブロックされていない任意のコマンドを許可します。
- `tools.exclude`: 特定のコマンドをブロックするには、`tools` カテゴリの下の `exclude` リストに `run_shell_command(<command>)` 形式でエントリを追加します。たとえば、`"tools": {"exclude": ["run_shell_command(rm)"]}` は `rm` コマンドをブロックします。

検証ロジックは、安全かつ柔軟になるように設計されています。

1.  **コマンドチェーンの無効化**: ツールは `&&`、`||`、または `;` でチェーンされたコマンドを自動的に分割し、各部分を個別に検証します。チェーンのいずれかの部分が許可されていない場合、コマンド全体がブロックされます。
2.  **プレフィックスマッチング**: ツールはプレフィックスマッチングを使用します。たとえば、`git` を許可すると、`git status` や `git log` を実行できます。
3.  **ブロックリストの優先**: `tools.exclude` リストが常に最初にチェックされます。コマンドがブロックされたプレフィックスに一致する場合、`tools.core` の許可されたプレフィックスにも一致していても拒否されます。

### コマンド制限の例

**特定のコマンドプレフィックスのみを許可する**

`git` と `npm` コマンドのみを許可し、他のすべてをブロックする場合:

```json
{
  "tools": {
    "core": ["run_shell_command(git)", "run_shell_command(npm)"]
  }
}
```

- `git status`: 許可
- `npm install`: 許可
- `ls -l`: ブロック

**特定のコマンドプレフィックスをブロックする**

`rm` をブロックし、他のすべてのコマンドを許可する場合:

```json
{
  "tools": {
    "core": ["run_shell_command"],
    "exclude": ["run_shell_command(rm)"]
  }
}
```

- `rm -rf /`: ブロック
- `git status`: 許可
- `npm install`: 許可

**ブロックリストが優先される**

コマンドプレフィックスが `tools.core` と `tools.exclude` の両方にある場合、それはブロックされます。

```json
{
  "tools": {
    "core": ["run_shell_command(git)"],
    "exclude": ["run_shell_command(git push)"]
  }
}
```

- `git push origin main`: ブロック
- `git status`: 許可

**すべてのシェルコマンドをブロックする**

すべてのシェルコマンドをブロックするには、`run_shell_command` ワイルドカードを `tools.exclude` に追加します。

```json
{
  "tools": {
    "exclude": ["run_shell_command"]
  }
}
```

- `ls -l`: ブロック
- `any other command`: ブロック

## `excludeTools` のセキュリティに関する注意

`run_shell_command` の `excludeTools` におけるコマンド固有の制限は、単純な文字列マッチングに基づいており、簡単に回避される可能性があります。この機能は**セキュリティメカニズムではなく**、信頼できないコードを安全に実行するために依存すべきではありません。実行できるコマンドを明示的に選択するには、`coreTools` を使用することをお勧めします。