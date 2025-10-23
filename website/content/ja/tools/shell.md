# Shell ツール (`run_shell_command`)

このドキュメントでは、Qwen Code 用の `run_shell_command` ツールについて説明します。

## 概要

`run_shell_command` を使用して、下位システムとやり取りしたり、スクリプトを実行したり、コマンドライン操作を行ったりできます。`run_shell_command` は指定された shell コマンドを実行します。また、`tools.shell.enableInteractiveShell` 設定が `true` に設定されている場合、ユーザー入力が必要なインタラクティブなコマンド（例: `vim`、`git rebase -i`）も実行可能です。

Windows では、コマンドは `cmd.exe /c` で実行されます。他のプラットフォームでは、`bash -c` で実行されます。

### 引数

`run_shell_command` は以下の引数を取ります：

- `command` (string, 必須): 実行する正確な shell コマンド。
- `description` (string, 任意): コマンドの目的についての簡単な説明。ユーザーに表示されます。
- `directory` (string, 任意): コマンドを実行するディレクトリ（プロジェクトルートからの相対パス）。指定しない場合、コマンドはプロジェクトルートで実行されます。
- `is_background` (boolean, 必須): コマンドをバックグラウンドで実行するかどうか。このパラメータは、コマンド実行モードについて明示的な判断を行うために必須です。開発サーバーやウォッチャー、デーモンなど、継続的に動作させる必要があり、他のコマンドの実行をブロックすべきではない長時間実行されるプロセスに対しては `true` を設定します。完了まで待機してから次に進む一時的なコマンドに対しては `false` を設定します。

## Qwen Code での `run_shell_command` の使い方

`run_shell_command` を使用する際、コマンドはサブプロセスとして実行されます。`is_background` パラメータを使用するか、コマンドに明示的に `&` を追加することで、コマンドをバックグラウンドで実行するかフォアグラウンドで実行するかを制御できます。このツールは、以下を含む実行に関する詳細情報を返します：

### 必須の Background パラメータ

`is_background` パラメータは、すべてのコマンド実行において **必須** です。この設計により、LLM（およびユーザー）は各コマンドをバックグラウンドで実行するべきか、フォアグラウンドで実行するべきかを明示的に判断することが求められ、意図的かつ予測可能なコマンド実行動作が促進されます。このパラメータを必須とすることで、長時間実行されるプロセスを扱う際に後続の操作をブロックしてしまうような、意図しないフォアグラウンド実行へのフォールバックを防ぎます。

### バックグラウンド実行 vs フォアグラウンド実行

このツールは、明示的な選択に基づいてバックグラウンドとフォアグラウンドの実行を賢く処理します：

**バックグラウンド実行（`is_background: true`）を使用するケース：**

- 長時間実行される開発サーバー：`npm run start`、`npm run dev`、`yarn dev`
- ビルドウォッチャー：`npm run watch`、`webpack --watch`
- データベースサーバー：`mongod`、`mysql`、`redis-server`
- Webサーバー：`python -m http.server`、`php -S localhost:8000`
- 手動で停止するまで無期限に実行し続けることが期待されるすべてのコマンド

**フォアグラウンド実行（`is_background: false`）を使用するケース：**

- 一度限りのコマンド：`ls`、`cat`、`grep`
- ビルドコマンド：`npm run build`、`make`
- インストールコマンド：`npm install`、`pip install`
- Git操作：`git commit`、`git push`
- テスト実行：`npm test`、`pytest`

### 実行情報

このツールは、実行に関する詳細情報を返します。含まれる情報は以下の通りです：

- `Command`: 実行されたコマンド。
- `Directory`: コマンドが実行されたディレクトリ。
- `Stdout`: 標準出力ストリームからの出力。
- `Stderr`: 標準エラー ストリームからの出力。
- `Error`: サブプロセスによって報告されたエラー メッセージ。
- `Exit Code`: コマンドの終了コード。
- `Signal`: コマンドがシグナルによって終了された場合のシグナル番号。
- `Background PIDs`: 起動されたバックグラウンド プロセスの PID のリスト。

使用方法：

```bash
run_shell_command(command="Your commands.", description="Your description of the command.", directory="Your execution directory.", is_background=false)
```

**注意：** `is_background` パラメータは必須であり、すべてのコマンド実行で明示的に指定する必要があります。

## `run_shell_command` の例

カレントディレクトリのファイルを一覧表示:

```bash
run_shell_command(command="ls -la", is_background=false)
```

特定のディレクトリでスクリプトを実行:

```bash
run_shell_command(command="./my_script.sh", directory="scripts", description="Run my custom script", is_background=false)
```

バックグラウンドで開発サーバーを起動 (推奨アプローチ):

```bash
run_shell_command(command="npm run dev", description="Start development server in background", is_background=true)
```

バックグラウンドでサーバーを起動 (明示的に & を使用する代替方法):

```bash
run_shell_command(command="npm run dev &", description="Start development server in background", is_background=false)
```

フォアグラウンドでビルドコマンドを実行:

```bash
run_shell_command(command="npm run build", description="Build the project", is_background=false)
```

複数のバックグラウンドサービスを起動:

```bash
run_shell_command(command="docker-compose up", description="Start all services", is_background=true)
```

## 設定

`run_shell_command` ツールの動作は、`settings.json` ファイルを編集するか、Qwen Code で `/settings` コマンドを使用することで設定できます。

### インタラクティブコマンドの有効化

インタラクティブコマンドを有効にするには、`tools.shell.enableInteractiveShell` の設定を `true` にします。これにより、シェルコマンドの実行に `node-pty` が使用され、インタラクティブなセッションが可能になります。`node-pty` が利用できない場合は、`child_process` 実装にフォールバックされますが、この場合インタラクティブコマンドはサポートされません。

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

### 出力にカラー表示させる

シェル出力にカラー表示させるには、`tools.shell.showColor` の設定を `true` にします。**注意: この設定は `tools.shell.enableInteractiveShell` が有効になっているときのみ適用されます。**

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

### Pager の設定

`tools.shell.pager` 設定を変更することで、シェル出力用のカスタム pager を指定できます。デフォルトの pager は `cat` です。**注意: この設定は `tools.shell.enableInteractiveShell` が有効な場合にのみ適用されます。**

**設定例 `settings.json`:**

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

`run_shell_command` ツールは、擬似端末（pty）を統合することで、インタラクティブコマンドに対応しました。これにより、テキストエディタ（`vim`、`nano`）、ターミナルベースの UI（`htop`）、インタラクティブなバージョン管理操作（`git rebase -i`）など、リアルタイムでのユーザー入力が必要なコマンドを実行できるようになりました。

インタラクティブコマンドが実行中の場合、Qwen Code からそのコマンドに対して入力を行うことができます。インタラクティブシェルにフォーカスを当てるには、`ctrl+f` を押してください。複雑な TUI を含むターミナル出力も正しく描画されます。

## 重要な注意事項

- **セキュリティ:** 特にユーザー入力から構築されたコマンドを実行する際は、セキュリティ脆弱性を防ぐために注意が必要です。
- **エラーハンドリング:** コマンドが正常に実行されたかどうかを判断するには、`Stderr`、`Error`、`Exit Code` フィールドを確認してください。
- **バックグラウンドプロセス:** `is_background=true` の場合、またはコマンドに `&` が含まれる場合は、ツールは即座に戻り値を返し、プロセスはバックグラウンドで継続して実行されます。`Background PIDs` フィールドにはバックグラウンドプロセスのプロセスIDが格納されます。
- **バックグラウンド実行の選択肢:** `is_background` パラメータは必須であり、実行モードを明示的に制御できます。手動でバックグラウンド実行するためにコマンドに `&` を追加することも可能ですが、それでも `is_background` パラメータを指定する必要があります。このパラメータにより意図が明確になり、バックグラウンド実行のセットアップが自動的に処理されます。
- **コマンドの説明:** `is_background=true` を使用する場合、コマンドの説明には実行モードを明確に示すための `[background]` インジケータが含まれます。

## 環境変数

`run_shell_command` がコマンドを実行する際、サブプロセスの環境に `QWEN_CODE=1` という環境変数を設定します。これにより、スクリプトやツールが CLI 内から実行されているかどうかを検出できます。

## コマンド制限

`run_shell_command` ツールで実行可能なコマンドを制限するには、設定ファイルの `tools.core` および `tools.exclude` 設定を使用します。

- `tools.core`: `run_shell_command` を特定のコマンド群に制限するには、`tools` カテゴリ配下の `core` リストに `run_shell_command(<command>)` の形式でエントリを追加してください。例えば、`"tools": {"core": ["run_shell_command(git)"]}` とすると、`git` コマンドのみが許可されます。一般的な `run_shell_command` を含めるとワイルドカードとして機能し、明示的にブロックされていないすべてのコマンドが許可されます。
- `tools.exclude`: 特定のコマンドをブロックするには、`tools` カテゴリ配下の `exclude` リストに `run_shell_command(<command>)` の形式でエントリを追加してください。例えば、`"tools": {"exclude": ["run_shell_command(rm)"]}` とすると、`rm` コマンドがブロックされます。

検証ロジックはセキュアかつ柔軟性を持つように設計されています：

1.  **コマンドチェーンの無効化**: ツールは自動的に `&&`、`||`、または `;` で連結されたコマンドを分割し、各部分を個別に検証します。チェーン内のいずれかの部分が許可されていない場合、コマンド全体がブロックされます。
2.  **プレフィックスマッチング**: ツールはプレフィックスマッチングを使用します。例えば、`git` を許可すると、`git status` や `git log` を実行できます。
3.  **ブロックリストの優先順位**: `tools.exclude` リストは常に最初にチェックされます。コマンドがブロックされたプレフィックスに一致する場合、`tools.core` の許可されたプレフィックスにも一致していたとしても拒否されます。

### コマンド制限の例

**特定のコマンドプレフィックスのみを許可**

`git` と `npm` コマンドのみを許可し、それ以外をすべてブロックする場合：

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

**特定のコマンドプレフィックスをブロック**

`rm` をブロックし、他のすべてのコマンドを許可する場合：

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

コマンドプレフィックスが `tools.core` と `tools.exclude` の両方に含まれている場合、そのコマンドはブロックされます。

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

**すべてのシェルコマンドをブロック**

すべてのシェルコマンドをブロックするには、`run_shell_command` ワイルドカードを `tools.exclude` に追加します：

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

`run_shell_command` における `excludeTools` のコマンド固有の制限は、単純な文字列マッチングに基づいているため、簡単にバイパスされる可能性があります。この機能は**セキュリティメカニズムではない**ため、信頼できないコードを安全に実行するために依存すべきではありません。実行可能なコマンドを明示的に選択するには、`coreTools` を使用することを推奨します。