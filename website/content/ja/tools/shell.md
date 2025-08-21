# Shell ツール (`run_shell_command`)

このドキュメントでは、Qwen Code 用の `run_shell_command` ツールについて説明します。

## 概要

`run_shell_command` を使用して、下位のシステムとやり取りしたり、スクリプトを実行したり、コマンドライン操作を実行したりできます。`run_shell_command` は指定された shell コマンドを実行します。Windows では、コマンドは `cmd.exe /c` で実行されます。他のプラットフォームでは、コマンドは `bash -c` で実行されます。

### 引数

`run_shell_command` は以下の引数を取ります：

- `command` (string, 必須): 実行する正確な shell コマンド。
- `description` (string, 任意): コマンドの目的を示す簡単な説明。ユーザーに表示されます。
- `directory` (string, 任意): コマンドを実行するディレクトリ（プロジェクトルートからの相対パス）。指定しない場合、コマンドはプロジェクトルートで実行されます。

## Qwen Code での `run_shell_command` の使い方

`run_shell_command` を使用する際、コマンドはサブプロセスとして実行されます。`run_shell_command` では `&` を使ってバックグラウンドプロセスを起動することも可能です。このツールは以下のような実行に関する詳細情報を返します：

- `Command`: 実行されたコマンド。
- `Directory`: コマンドが実行されたディレクトリ。
- `Stdout`: 標準出力ストリームからの出力。
- `Stderr`: 標準エラー出力ストリームからの出力。
- `Error`: サブプロセスから報告されたエラーメッセージ。
- `Exit Code`: コマンドの終了コード。
- `Signal`: コマンドがシグナルによって終了された場合のシグナル番号。
- `Background PIDs`: 起動されたバックグラウンドプロセスの PID のリスト。

使用方法：

```
run_shell_command(command="Your commands.", description="Your description of the command.", directory="Your execution directory.")
```

## `run_shell_command` の例

カレントディレクトリのファイルを一覧表示:

```
run_shell_command(command="ls -la")
```

特定のディレクトリでスクリプトを実行:

```
run_shell_command(command="./my_script.sh", directory="scripts", description="Run my custom script")
```

バックグラウンドでサーバーを起動:

```
run_shell_command(command="npm run dev &", description="Start development server in background")
```

## 重要な注意点

- **セキュリティ:** 特にユーザー入力から構築されたコマンドを実行する際は、セキュリティ上の脆弱性を防ぐために注意が必要です。
- **インタラクティブなコマンド:** ユーザーの対話入力を必要とするコマンドは避けてください。これによりツールがハングアップする可能性があります。可能であれば、非対話的なフラグを使用してください（例: `npm init -y`）。
- **エラー処理:** コマンドが正常に実行されたかどうかを判断するには、`Stderr`、`Error`、および `Exit Code` フィールドを確認してください。
- **バックグラウンドプロセス:** `&` を使用してバックグラウンドでコマンドを実行すると、ツールは即座に制御を返し、プロセスはバックグラウンドで引き続き実行されます。`Background PIDs` フィールドには、バックグラウンドプロセスのプロセスIDが格納されます。

## 環境変数

`run_shell_command` がコマンドを実行する際、サブプロセスの環境に `QWEN_CODE=1` という環境変数が設定されます。これにより、スクリプトやツールが CLI 内から実行されているかどうかを検出できます。

## コマンド制限

`run_shell_command` ツールで実行可能なコマンドを制限するには、設定ファイルの `coreTools` および `excludeTools` 設定を使用します。

- `coreTools`: `run_shell_command` を特定のコマンド群に制限するには、`coreTools` リストに `run_shell_command(<command>)` 形式のエントリを追加します。例えば、`"coreTools": ["run_shell_command(git)"]` とすると、`git` コマンドのみが許可されます。一般的な `run_shell_command` を含めるとワイルドカードとして機能し、明示的にブロックされていないすべてのコマンドが許可されます。
- `excludeTools`: 特定のコマンドをブロックするには、`excludeTools` リストに `run_shell_command(<command>)` 形式のエントリを追加します。例えば、`"excludeTools": ["run_shell_command(rm)"]` とすると、`rm` コマンドがブロックされます。

検証ロジックは、セキュアかつ柔軟性を保つために設計されています：

1.  **コマンドチェーンの無効化**: ツールは自動的に `&&`、`||`、または `;` で連結されたコマンドを分割し、各部分を個別に検証します。チェーン内のいずれかの部分が許可されていない場合、コマンド全体がブロックされます。
2.  **プレフィックスマッチング**: ツールはプレフィックスマッチングを使用します。例えば、`git` を許可すると、`git status` や `git log` を実行できます。
3.  **ブロックリストの優先順位**: `excludeTools` リストは常に最初にチェックされます。コマンドがブロックされたプレフィックスにマッチする場合、たとえ `coreTools` の許可されたプレフィックスにもマッチしても、拒否されます。

### コマンド制限の例

**特定のコマンドプレフィックスのみを許可**

`git` と `npm` のコマンドのみを許可し、それ以外をすべてブロックする場合：

```json
{
  "coreTools": ["run_shell_command(git)", "run_shell_command(npm)"]
}
```

- `git status`: 許可
- `npm install`: 許可
- `ls -l`: ブロック

**特定のコマンドプレフィックスをブロック**

`rm` をブロックし、他のすべてのコマンドを許可する場合：

```json
{
  "coreTools": ["run_shell_command"],
  "excludeTools": ["run_shell_command(rm)"]
}
```

- `rm -rf /`: ブロック
- `git status`: 許可
- `npm install`: 許可

**ブロックリストが優先される**

コマンドプレフィックスが `coreTools` と `excludeTools` の両方に含まれている場合、そのコマンドはブロックされます。

```json
{
  "coreTools": ["run_shell_command(git)"],
  "excludeTools": ["run_shell_command(git push)"]
}
```

- `git push origin main`: ブロック
- `git status`: 許可

**すべてのシェルコマンドをブロック**

すべてのシェルコマンドをブロックするには、`run_shell_command` のワイルドカードを `excludeTools` に追加します：

```json
{
  "excludeTools": ["run_shell_command"]
}
```

- `ls -l`: ブロック
- `any other command`: ブロック

## `excludeTools` のセキュリティに関する注意

`run_shell_command` の `excludeTools` によるコマンド固有の制限は、単純な文字列マッチングに基づいているため、簡単にバイパスされる可能性があります。この機能は**セキュリティメカニズムではない**ため、信頼できないコードを安全に実行するために依存すべきではありません。実行可能なコマンドを明示的に選択するには、`coreTools` の使用を推奨します。