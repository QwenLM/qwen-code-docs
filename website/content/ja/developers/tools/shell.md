# シェルツール (`run_shell_command`)

このドキュメントでは、Qwen Code 用の `run_shell_command` ツールについて説明します。

## 概要

`run_shell_command` を使用して、基盤となるシステムと対話し、スクリプトを実行したり、コマンドライン操作を行ったりできます。`run_shell_command` は指定されたシェルコマンドを実行します。また、`tools.shell.enableInteractiveShell` 設定が `true` に設定されている場合、ユーザー入力を必要とするインタラクティブなコマンド（例：`vim`、`git rebase -i`）も実行可能です。

Windows では、コマンドが `cmd.exe /c` で実行されます。その他のプラットフォームでは、`bash -c` で実行されます。

### 引数

`run_shell_command` は以下の引数を取ります。

- `command`（文字列、必須）：実行するシェルコマンドそのもの。
- `description`（文字列、任意）：コマンドの目的を簡潔に説明した文で、ユーザーに表示されます。
- `directory`（文字列、任意）：コマンドを実行するディレクトリ（プロジェクトルートからの相対パス）。指定しない場合は、プロジェクトルートでコマンドが実行されます。
- `is_background`（ブール値、必須）：コマンドをバックグラウンドで実行するかどうか。このパラメーターは、コマンドの実行モードについて明示的な判断を行うために必須です。開発サーバー、ファイル監視ツール（watcher）、デーモンなど、他のコマンドの実行をブロックせずに継続して実行すべき長時間実行プロセスについては `true` を指定します。一方、次の処理に進む前に完了すべき一回限りのコマンドについては `false` を指定します。

## `run_shell_command` を Qwen Code で使用する方法

`run_shell_command` を使用すると、コマンドはサブプロセスとして実行されます。`is_background` パラメーターを指定するか、コマンドに明示的に `&` を付加することで、コマンドをバックグラウンドまたはフォアグラウンドで実行するかを制御できます。このツールは、実行に関する詳細な情報を返します（以下を含む）：

### 必須のバックグラウンドパラメーター

`is_background` パラメーターは、**すべてのコマンド実行において必須**です。この設計により、LLM（およびユーザー）が各コマンドをバックグラウンドまたはフォアグラウンドで実行するかを明示的に決定する必要があります。これにより、意図的かつ予測可能なコマンド実行動作が促進されます。このパラメーターを必須とすることで、長時間実行されるプロセスを扱う際に後続の操作をブロックしてしまうような、フォアグラウンド実行への意図しないフォールバックを回避します。

### バックグラウンド実行 vs フォアグラウンド実行

このツールは、ユーザーが明示的に選択した実行モードに基づき、バックグラウンド実行とフォアグラウンド実行を賢く処理します。

**バックグラウンド実行（`is_background: true`）を使用するケース：**

- 長時間実行される開発サーバー：`npm run start`、`npm run dev`、`yarn dev`
- ビルド監視プロセス：`npm run watch`、`webpack --watch`
- データベースサーバー：`mongod`、`mysql`、`redis-server`
- ウェブサーバー：`python -m http.server`、`php -S localhost:8000`
- 手動で停止されるまで無期限に実行されることが想定されるコマンド全般

**フォアグラウンド実行（`is_background: false`）を使用するケース：**

- 一回限りのコマンド：`ls`、`cat`、`grep`
- ビルドコマンド：`npm run build`、`make`
- インストールコマンド：`npm install`、`pip install`
- Git 操作：`git commit`、`git push`
- テスト実行：`npm test`、`pytest`

### 実行情報

このツールは、以下の詳細な実行情報を返します。

- `Command`: 実行されたコマンド。
- `Directory`: コマンドが実行されたディレクトリ。
- `Stdout`: 標準出力ストリームからの出力。
- `Stderr`: 標準エラー出力ストリームからの出力。
- `Error`: サブプロセスによって報告されたエラーメッセージ。
- `Exit Code`: コマンドの終了コード。
- `Signal`: コマンドがシグナルによって終了された場合のシグナル番号。
- `Background PIDs`: 開始されたバックグラウンドプロセスの PID のリスト。

使用方法：

```bash
run_shell_command(command="実行するコマンド。", description="コマンドの説明。", directory="実行ディレクトリ。", is_background=false)
```

**注意:** `is_background` パラメーターは必須であり、すべてのコマンド実行で明示的に指定する必要があります。

## `run_shell_command` の使用例

現在のディレクトリ内のファイルを一覧表示します：

```bash
run_shell_command(command="ls -la", is_background=false)
```

特定のディレクトリでスクリプトを実行します：

```bash
run_shell_command(command="./my_script.sh", directory="scripts", description="カスタムスクリプトを実行", is_background=false)
```

バックグラウンドで開発サーバーを起動します（推奨される方法）：

```bash
run_shell_command(command="npm run dev", description="バックグラウンドで開発サーバーを起動", is_background=true)
```

バックグラウンドでサーバーを起動します（`&` を明示的に使用する代替方法）：

```bash
run_shell_command(command="npm run dev &", description="バックグラウンドで開発サーバーを起動", is_background=false)
```

フォアグラウンドでビルドコマンドを実行します：

```bash
run_shell_command(command="npm run build", description="プロジェクトをビルド", is_background=false)
```

複数のバックグラウンドサービスを起動します：

```bash
run_shell_command(command="docker-compose up", description="すべてのサービスを起動", is_background=true)
```

## 設定

`run_shell_command` ツールの動作は、`settings.json` ファイルを編集するか、Qwen Code 内で `/settings` コマンドを使用することで設定できます。

### 対話型コマンドの有効化

`tools.shell.enableInteractiveShell` 設定は、シェルコマンドを `node-pty`（対話型 PTY）経由で実行するか、単純な `child_process` バックエンド経由で実行するかを制御します。この設定を有効にすると、`vim`、`git rebase -i`、および TUI（テキストベースのユーザーインターフェース）プログラムなどの対話型セッションが正しく動作します。

この設定は、ほとんどのプラットフォームでデフォルト値が `true` です。ただし、Windows のビルド **<= 19041**（Windows 10 バージョン 2004 より前）では、古い ConPTY 実装に信頼性に関する既知の問題（出力が欠落する、フリーズするなど）があるため、デフォルト値は `false` です。これは VS Code で採用されている同じ判定基準と一致しています（[microsoft/vscode#123725](https://github.com/microsoft/vscode/issues/123725)）。また、実行時に `node-pty` が利用できない場合、この設定の値に関わらず、ツールは自動的に `child_process` へフォールバックします。

デフォルト値を明示的に上書きするには、`settings.json` で値を設定してください。

**例：`settings.json`**

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

**例: `settings.json`**

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

シェル出力用のカスタムページャーを `tools.shell.pager` 設定で指定できます。デフォルトのページャーは `cat` です。**注: この設定は、`tools.shell.enableInteractiveShell` が有効になっている場合にのみ適用されます。**

**例: `settings.json`**

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

`run_shell_command` ツールは、擬似端末（pty）を統合することで、対話型コマンドをサポートするようになりました。これにより、テキストエディタ（`vim`、`nano`）、ターミナルベースの UI（`htop`）、対話型のバージョン管理操作（`git rebase -i`）など、リアルタイムでのユーザー入力を必要とするコマンドを実行できます。

対話型コマンドが実行中の場合、Qwen Code からそのコマンドに直接入力できます。対話型シェルにフォーカスを当てるには、`ctrl+f` を押してください。複雑な TUI を含むターミナル出力も正しくレンダリングされます。

## 重要な注意事項

- **セキュリティ:** セキュリティ脆弱性を防ぐため、特にユーザー入力から構築されたコマンドを実行する際は十分に注意してください。
- **エラー処理:** コマンドが正常に実行されたかどうかを判断するには、`Stderr`、`Error`、`Exit Code` の各フィールドを確認してください。
- **バックグラウンドプロセス:** `is_background=true` と指定した場合、またはコマンドに `&` が含まれている場合、このツールは即座に返り値を返し、プロセスはバックグラウンドで継続して実行されます。`Background PIDs` フィールドには、バックグラウンドで実行されるプロセスのプロセス ID（PID）が格納されます。
- **バックグラウンド実行の選択肢:** `is_background` パラメーターは必須であり、実行モードを明示的に制御します。また、手動でバックグラウンド実行を行うためにコマンドに `&` を追加することもできますが、その場合でも `is_background` パラメーターの指定は必須です。このパラメーターにより意図が明確になり、バックグラウンド実行のセットアップも自動的に行われます。
- **コマンドの説明:** `is_background=true` を使用する場合、コマンドの説明には実行モードを明確に示すための `[background]` インジケーターが付加されます。

## 環境変数

`run_shell_command` がコマンドを実行する際、サブプロセスの環境に `QWEN_CODE=1` という環境変数を設定します。これにより、スクリプトやツールが CLI 内から実行されているかどうかを検出できるようになります。

## コマンド制限

設定ファイル内の `tools.core` および `tools.exclude` 設定を用いることで、`run_shell_command` ツールが実行できるコマンドを制限できます。

- `tools.core`: `run_shell_command` を特定のコマンドセットに制限するには、`tools` カテゴリ内の `core` リストに `run_shell_command(<command>)` の形式でエントリを追加します。たとえば、`"tools": {"core": ["run_shell_command(git)"]}` とすると、`git` コマンドのみが許可されます。汎用的な `run_shell_command` を含めるとワイルドカードとして機能し、明示的にブロックされていないすべてのコマンドが許可されます。
- `tools.exclude`: 特定のコマンドをブロックするには、`tools` カテゴリ内の `exclude` リストに `run_shell_command(<command>)` の形式でエントリを追加します。たとえば、`"tools": {"exclude": ["run_shell_command(rm)"]}` とすると、`rm` コマンドがブロックされます。

検証ロジックは、セキュアかつ柔軟になるよう設計されています。

1.  **コマンド連鎖の無効化**: このツールは、`&&`、`||`、`;` で連結されたコマンドを自動的に分割し、各部分を個別に検証します。連鎖のいずれかの部分が許可されていない場合、コマンド全体がブロックされます。
2.  **接頭辞マッチング**: このツールは接頭辞マッチングを使用します。たとえば、`git` を許可した場合、`git status` や `git log` の実行も可能です。
3.  **ブロックリストの優先順位**: `tools.exclude` リストは常に最初にチェックされます。コマンドがブロックされた接頭辞と一致した場合、`tools.core` 内の許可された接頭辞と一致していても、そのコマンドは拒否されます。

### コマンド制限の例

**特定のコマンド接頭辞のみを許可**

`git` および `npm` コマンドのみを許可し、それ以外のすべてのコマンドをブロックするには：

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

**特定のコマンド接頭辞をブロック**

`rm` コマンドをブロックし、その他のすべてのコマンドを許可するには：

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

コマンド接頭辞が `tools.core` と `tools.exclude` の両方に含まれている場合、そのコマンドはブロックされます。

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

すべてのシェルコマンドをブロックするには、`tools.exclude` に `run_shell_command` のワイルドカードを追加します：

```json
{
  "tools": {
    "exclude": ["run_shell_command"]
  }
}
```

- `ls -l`: ブロック
- `その他の任意のコマンド`: ブロック

## `excludeTools` のセキュリティに関する注意

`run_shell_command` における `excludeTools` 内のコマンド固有の制限は、単純な文字列一致に基づいており、容易に回避可能です。この機能は **セキュリティ機構ではありません**。信頼できないコードを安全に実行するためにこれに依存してはいけません。代わりに、実行を許可するコマンドを明示的に選択するために `coreTools` を使用することを推奨します。