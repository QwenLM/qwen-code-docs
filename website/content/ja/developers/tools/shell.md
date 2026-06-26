# シェルツール (`run_shell_command`)

このドキュメントでは、Qwen Code の `run_shell_command` ツールについて説明します。

## 説明

`run_shell_command` を使用して、基盤システムとの対話、スクリプトの実行、コマンドライン操作を行います。`run_shell_command` は指定されたシェルコマンドを実行します。`tools.shell.enableInteractiveShell` 設定が `true` に設定されている場合、ユーザー入力が必要な対話型コマンド（例：`vim`、`git rebase -i`）も含まれます。

Windows では、コマンドは `cmd.exe /c` で実行されます。その他のプラットフォームでは、`bash -c` で実行されます。

### 引数

`run_shell_command` は以下の引数を受け取ります：

- `command`（文字列、必須）：実行する正確なシェルコマンド。
- `description`（文字列、オプション）：コマンドの目的の簡単な説明。ユーザーに表示されます。
- `directory`（文字列、オプション）：コマンドを実行するディレクトリ（プロジェクトルートからの相対パス）。指定しない場合、コマンドはプロジェクトルートで実行されます。
- `is_background`（ブール値、必須）：コマンドをバックグラウンドで実行するかどうか。このパラメーターは、コマンド実行モードについて明示的に決定するために必須です。開発サーバー、ウォッチャー、デーモンなど、後続のコマンドをブロックせずに実行を継続する長時間実行プロセスでは `true` に設定します。完了してから次の処理に進む一度限りのコマンドでは `false` に設定します。

## Qwen Code で `run_shell_command` を使用する方法

`run_shell_command` を使用すると、コマンドはサブプロセスとして実行されます。`is_background` パラメーターを使用するか、コマンドに明示的に `&` を追加することで、コマンドをバックグラウンドまたはフォアグラウンドで実行するかを制御できます。このツールは、実行に関する詳細情報を返します。これには以下が含まれます：

### 必須のバックグラウンドパラメーター

`is_background` パラメーターは、すべてのコマンド実行で **必須** です。この設計により、LLM（およびユーザー）が各コマンドをバックグラウンドとフォアグラウンドのどちらで実行するかを明示的に決定しなければならなくなり、意図的で予測可能なコマンド実行動作が促進されます。このパラメーターを必須にすることで、意図しないフォアグラウンド実行へのフォールバックを回避できます。フォアグラウンド実行にフォールバックすると、長時間実行プロセスの場合に後続の操作をブロックする可能性があります。

### バックグラウンド実行とフォアグラウンド実行

ツールは、明示的な選択に基づいてバックグラウンド実行とフォアグラウンド実行をインテリジェントに処理します：

**バックグラウンド実行 (`is_background: true`) を使用するケース：**

- 長時間実行する開発サーバー：`npm run start`、`npm run dev`、`yarn dev`
- ビルドウォッチャー：`npm run watch`、`webpack --watch`
- データベースサーバー：`mongod`、`mysql`、`redis-server`
- Webサーバー：`python -m http.server`、`php -S localhost:8000`
- 手動で停止するまで無期限に実行されることが想定されるコマンド

**フォアグラウンド実行 (`is_background: false`) を使用するケース：**

- 一度限りのコマンド：`ls`、`cat`、`grep`
- ビルドコマンド：`npm run build`、`make`
- インストールコマンド：`npm install`、`pip install`
- Git操作：`git commit`、`git push`
- テスト実行：`npm test`、`pytest`

### 実行情報

ツールは、実行に関する以下の詳細情報を返します：

- `Command`：実行されたコマンド。
- `Directory`：コマンドが実行されたディレクトリ。
- `Stdout`：標準出力ストリームからの出力。
- `Stderr`：標準エラーストリームからの出力。
- `Error`：サブプロセスによって報告されたエラーメッセージ。
- `Exit Code`：コマンドの終了コード。
- `Signal`：コマンドがシグナルによって終了された場合のシグナル番号。
- `Background PIDs`：開始されたバックグラウンドプロセスのPIDのリスト。

使用法：

```bash
run_shell_command(command="Your commands.", description="Your description of the command.", directory="Your execution directory.", is_background=false)
```

**注意：** `is_background` パラメーターは必須であり、すべてのコマンド実行で明示的に指定する必要があります。

## `run_shell_command` の例

カレントディレクトリのファイル一覧を表示：

```bash
run_shell_command(command="ls -la", is_background=false)
```

特定のディレクトリでスクリプトを実行：

```bash
run_shell_command(command="./my_script.sh", directory="scripts", description="Run my custom script", is_background=false)
```

バックグラウンドで開発サーバーを起動（推奨方法）：

```bash
run_shell_command(command="npm run dev", description="Start development server in background", is_background=true)
```

明示的に `&` を使用してバックグラウンドサーバーを起動（代替方法）：

```bash
run_shell_command(command="npm run dev &", description="Start development server in background", is_background=false)
```

フォアグラウンドでビルドコマンドを実行：

```bash
run_shell_command(command="npm run build", description="Build the project", is_background=false)
```

複数のバックグラウンドサービスを開始：

```bash
run_shell_command(command="docker-compose up", description="Start all services", is_background=true)
```

## 設定

`tools.shell.enableInteractiveShell` の動作は、`settings.json` ファイルを変更するか、Qwen Code で `/settings` コマンドを使用して設定できます。

### 対話型コマンドの有効化

`tools.shell.enableInteractiveShell` 設定は、シェルコマンドを `node-pty`（対話型PTY）経由で実行するか、プレーンな `child_process` バックエンドで実行するかを制御します。この設定を有効にすると、`vim`、`git rebase -i`、TUIプログラムなどの対話型セッションが正しく動作します。

この設定は、ほとんどのプラットフォームでデフォルトで `true` です。Windows ビルド **<= 19041**（Windows 10 バージョン 2004 より前）では、デフォルトで `false` になります。これは、古い ConPTY 実装に既知の信頼性の問題（出力の欠落、ハング）があるためです。これは VS Code で使用されているものと同じ基準です（[microsoft/vscode#123725](https://github.com/microsoft/vscode/issues/123725)）。実行時に `node-pty` が利用できない場合、この設定に関わらずツールは `child_process` にフォールバックします。

デフォルトを明示的に上書きするには、`settings.json` で値を設定します：

**`settings.json` の例：**

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

シェル出力に色を表示するには、`tools.shell.showColor` 設定を `true` に設定する必要があります。**注意：この設定は `tools.shell.enableInteractiveShell` が有効な場合にのみ適用されます。**

**`settings.json` の例：**

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

`tools.shell.pager` 設定を設定することで、シェル出力のカスタムページャーを設定できます。デフォルトのページャーは `cat` です。**注意：この設定は `tools.shell.enableInteractiveShell` が有効な場合にのみ適用されます。**

**`settings.json` の例：**

```json
{
  "tools": {
    "shell": {
      "pager": "less"
    }
  }
}
```

## 対話型コマンド

`run_shell_command` ツールは、疑似端末（pty）を統合することで、対話型コマンドをサポートするようになりました。これにより、テキストエディター（`vim`、`nano`）、ターミナルベースのUI（`htop`）、対話型バージョン管理操作（`git rebase -i`）など、リアルタイムのユーザー入力を必要とするコマンドを実行できます。

対話型コマンドの実行中は、Qwen Code からそのコマンドに入力を送信できます。対話型シェルにフォーカスするには、`ctrl+f` を押します。複雑なTUIを含むターミナル出力が正しくレンダリングされます。

## 重要な注意事項

- **セキュリティ：** 特にユーザー入力から構築されたコマンドを実行する際は、セキュリティの脆弱性を防ぐために注意してください。
- **エラーハンドリング：** `Stderr`、`Error`、`Exit Code` フィールドを確認して、コマンドが正常に実行されたかどうかを判断してください。
- **バックグラウンドプロセス：** `is_background=true` の場合、またはコマンドに `&` が含まれている場合、ツールはすぐに戻り、プロセスはバックグラウンドで実行され続けます。`Background PIDs` フィールドには、バックグラウンドプロセスのプロセスIDが含まれます。
- **バックグラウンド実行の選択：** `is_background` パラメーターは必須であり、実行モードを明示的に制御します。手動でバックグラウンド実行するためにコマンドに `&` を追加することもできますが、`is_background` パラメーターは依然として指定する必要があります。このパラメーターは意図を明確にし、バックグラウンド実行のセットアップを自動的に処理します。
- **コマンドの説明：** `is_background=true` を使用する場合、コマンドの説明には `[background]` インジケーターが含まれ、実行モードが明確に示されます。

## 環境変数

`run_shell_command` がコマンドを実行すると、サブプロセスの環境に `QWEN_CODE=1` 環境変数が設定されます。これにより、スクリプトやツールがCLI内から実行されているかどうかを検出できます。

## コマンド制限

設定ファイルの `tools.core` および `tools.exclude` 設定を使用して、`run_shell_command` ツールで実行できるコマンドを制限できます。

- `tools.core`：`run_shell_command` を特定のコマンドセットに制限するには、`tools` カテゴリの `core` リストに `run_shell_command(<コマンド>)` の形式でエントリを追加します。たとえば、`"tools": {"core": ["run_shell_command(git)"]}` とすると、`git` コマンドのみが許可されます。汎用の `run_shell_command` を含めると、ワイルドカードとして機能し、明示的にブロックされていないコマンドをすべて許可します。
- `tools.exclude`：特定のコマンドをブロックするには、`tools` カテゴリの `exclude` リストに `run_shell_command(<コマンド>)` の形式でエントリを追加します。たとえば、`"tools": {"exclude": ["run_shell_command(rm)"]}` とすると、`rm` コマンドがブロックされます。

検証ロジックは、安全で柔軟になるように設計されています：

1.  **コマンドチェインの無効化**：ツールは自動的に `&&`、`||`、`;` で連結されたコマンドを分割し、各部分を個別に検証します。チェインのいずれかの部分が許可されていない場合、コマンド全体がブロックされます。
2.  **プレフィックスマッチング**：ツールはプレフィックスマッチングを使用します。たとえば、`git` を許可すると、`git status` や `git log` を実行できます。
3.  **ブロックリストの優先順位**：`tools.exclude` リストは常に最初にチェックされます。コマンドがブロックされたプレフィックスに一致する場合、`tools.core` の許可されたプレフィックスにも一致する場合でも、そのコマンドは拒否されます。

### コマンド制限の例

**特定のコマンドプレフィックスのみを許可する**

`git` コマンドと `npm` コマンドのみを許可し、それ以外はすべてブロックする場合：

```json
{
  "tools": {
    "core": ["run_shell_command(git)", "run_shell_command(npm)"]
  }
}
```

- `git status`：許可
- `npm install`：許可
- `ls -l`：ブロック

**特定のコマンドプレフィックスをブロックする**

`rm` をブロックし、その他のコマンドはすべて許可する場合：

```json
{
  "tools": {
    "core": ["run_shell_command"],
    "exclude": ["run_shell_command(rm)"]
  }
}
```

- `rm -rf /`：ブロック
- `git status`：許可
- `npm install`：許可

**ブロックリストが優先される**

コマンドプレフィックスが `tools.core` と `tools.exclude` の両方にある場合、ブロックされます。

```json
{
  "tools": {
    "core": ["run_shell_command(git)"],
    "exclude": ["run_shell_command(git push)"]
  }
}
```

- `git push origin main`：ブロック
- `git status`：許可

**すべてのシェルコマンドをブロックする**

すべてのシェルコマンドをブロックするには、`tools.exclude` に `run_shell_command` ワイルドカードを追加します：

```json
{
  "tools": {
    "exclude": ["run_shell_command"]
  }
}
```

- `ls -l`：ブロック
- `その他のコマンド`：ブロック

## `excludeTools` に関するセキュリティ注意事項

`run_shell_command` の `excludeTools` におけるコマンド固有の制限は、単純な文字列マッチングに基づいており、簡単に回避できます。この機能は **セキュリティメカニズムではありません**。信頼できないコードを安全に実行するためにこれに依存すべきではありません。実行できるコマンドを明示的に選択するには、`coreTools` を使用することをお勧めします。