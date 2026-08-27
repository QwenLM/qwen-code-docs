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
- `is_background` (boolean, 必須): コマンドをバックグラウンドで実行するかどうか。このパラメータは、コマンドの実行モードについて明示的な決定を行うために必須です。開発サーバー、ウォッチャー、またはデーモンなど、後続のコマンドをブロックせずに実行し続ける必要がある長時間実行されるプロセスの場合は `true` を設定します。続行する前に完了する必要がある一度限りのコマンドの場合は `false` を設定します。

## Qwen Code で `run_shell_command` を使用する方法

`run_shell_command` を使用すると、コマンドはサブプロセスとして実行されます。`is_background` パラメータを使用するか、コマンドに明示的に `&` を追加することで、コマンドをバックグラウンドで実行するかフォアグラウンドで実行するかを制御できます。このツールは、実行に関する詳細情報を返します。これには以下が含まれます。

### 必須のバックグラウンドパラメータ

すべてのコマンド実行において、`is_background` パラメータは**必須**です。この設計により、LLM（およびユーザー）は各コマンドをバックグラウンドで実行するかフォアグラウンドで実行するかを明示的に決定する必要があり、意図的かつ予測可能なコマンド実行動作が促進されます。このパラメータを必須にすることで、長時間実行されるプロセスを扱う際に後続の操作をブロックする可能性のある、フォアグラウンド実行への意図しないフォールバックを回避します。

### バックグラウンド実行とフォアグラウンド実行

このツールは、明示的な選択に基づいてバックグラウンド実行とフォアグラウンド実行をインテリジェントに処理します。

**バックグラウンド実行（`is_background: true`）を使用する場合:**

- 長時間実行される開発サーバー: `npm run start`、`npm run dev`、`yarn dev`
- ビルドウォッチャー: `npm run watch`、`webpack --watch`
- データベースサーバー: `mongod`、`mysql`、`redis-server`
- Web サーバー: `python -m http.server`、`php -S localhost:8000`
- 手動で停止されるまで無期限に実行されると予想される任意のコマンド

**フォアグラウンド実行（`is_background: false`）を使用する場合:**

- 一度限りのコマンド: `ls`、`cat`、`grep`
- ビルドコマンド: `npm run build`、`make`
- インストールコマンド: `npm install`、`pip install`
- Git 操作: `git commit`、`git push`
- テスト実行: `npm test`、`pytest`

### 実行情報

このツールは、実行に関する詳細情報を返します。これには以下が含まれます。

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

**注:** `is_background` パラメータは必須であり、すべてのコマンド実行で明示的に指定する必要があります。

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

バックグラウンドでサーバーを起動する（明示的な `&` を使用した代替方法）:

```bash
run_shell_command(command="npm run dev &", description="Start development server in background", is_background=false)
```

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

この設定は、ほとんどのプラットフォームでデフォルトで `true` になっています。Windows ビルド **<= 19041**（Windows 10 バージョン 2004 より前）では、古い ConPTY 実装には既知の信頼性の問題（出力の欠落、ハング）があるため、デフォルトで `false` になります。これは、VS Code で使用されているのと同じカットオフと一致します（[microsoft/vscode#123725](https://github.com/microsoft/vscode/issues/123725)）。実行時に `node-pty` が利用できない場合、この設定に関係なくツールは `child_process` にフォールバックします。

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
- **バックグラウンドプロセス:** `is_background=true` の場合、またはコマンドに `&` が含まれている場合、ツールはすぐに戻り、プロセスはバックグラウンドで実行され続けます。`Background PIDs` フィールドには、バックグラウンドプロセスのプロセス ID が含まれます。
- **バックグラウンド実行の選択:** `is_background` パラメータは必須であり、実行モードを明示的に制御します。手動でバックグラウンド実行するためにコマンドに `&` を追加することもできますが、`is_background` パラメータは引き続き指定する必要があります。このパラメータはより明確な意図を提供し、バックグラウンド実行のセットアップを自動的に処理します。
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
- その他すべてのコマンド: ブロック

## `excludeTools` のセキュリティに関する注意

`run_shell_command` の `excludeTools` におけるコマンド固有の制限は、単純な文字列マッチングに基づいており、簡単に回避される可能性があります。この機能は**セキュリティメカニズムではなく**、信頼できないコードを安全に実行するために依存すべきではありません。実行できるコマンドを明示的に選択するには、`coreTools` を使用することをお勧めします。