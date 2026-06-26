# 統合テスト

このドキュメントでは、このプロジェクトで使用される統合テストフレームワークについて説明します。

## 概要

統合テストは、Qwen Code のエンドツーエンドの機能を検証するために設計されています。ビルドされたバイナリを制御された環境で実行し、ファイルシステムとのやり取りが期待通りに動作することを確認します。

これらのテストは `integration-tests` ディレクトリにあり、カスタムテストランナーを使用して実行されます。

## テストの実行

統合テストはデフォルトの `npm run test` コマンドの一部としては実行されません。`npm run test:integration:all` スクリプトを使用して明示的に実行する必要があります。

統合テストは以下のショートカットでも実行できます：

```bash
npm run test:e2e
```

## 特定のテストセットの実行

テストファイルのサブセットを実行するには、`npm run &lt;統合テストコマンド&gt; &lt;ファイル名1&gt; ....` を使用します。ここで `&lt;統合テストコマンド&gt;` は `test:e2e` または `test:integration*` のいずれか、`&lt;ファイル名&gt;` は `integration-tests/` ディレクトリ内の任意の `.test.ts` ファイルです。例えば、以下のコマンドは `list_directory.test.ts` と `write_file.test.ts` を実行します：

```bash
npm run test:e2e list_directory write_file
```

### 名前を指定して単一テストを実行

名前を指定して単一テストを実行するには、`--test-name-pattern` フラグを使用します：

```bash
npm run test:e2e -- --test-name-pattern "reads a file"
```

### すべてのテストを実行

統合テストの全スイートを実行するには、以下のコマンドを使用します：

```bash
npm run test:integration:all
```

### サンドボックスマトリックス

`all` コマンドは、`no sandboxing`、`docker`、`podman` のテストを実行します。
各タイプは以下のコマンドで個別に実行できます：

```bash
npm run test:integration:sandbox:none
```

```bash
npm run test:integration:sandbox:docker
```

```bash
npm run test:integration:sandbox:podman
```

## 診断

統合テストランナーには、テストの失敗を追跡するための診断オプションがいくつか用意されています。

### テスト出力の保持

テスト実行中に作成された一時ファイルを保持して検査できます。これはファイルシステム操作に関する問題のデバッグに役立ちます。

テスト出力を保持するには、`KEEP_OUTPUT` 環境変数を `true` に設定します。

```bash
KEEP_OUTPUT=true npm run test:integration:sandbox:none
```

出力が保持されると、テストランナーはそのテスト実行の一意のディレクトリへのパスを表示します。

### 詳細出力

より詳細なデバッグを行うには、`VERBOSE` 環境変数を `true` に設定します。

```bash
VERBOSE=true npm run test:integration:sandbox:none
```

同じコマンドで `VERBOSE=true` と `KEEP_OUTPUT=true` を同時に使用すると、出力はコンソールにストリーミングされるとともに、テストの一時ディレクトリ内のログファイルにも保存されます。

詳細出力は、ログの発生源を明確に識別できるようにフォーマットされています：

```
--- TEST: <log dir>:<test-name> ---
... output from the qwen command ...
--- END TEST: <log dir>:<test-name> ---
```

## リンターとフォーマッター

コードの品質と一貫性を確保するため、統合テストファイルはメインビルドプロセスの一部としてリンターが実行されます。手動でリンターや自動修正を実行することもできます。

### リンターの実行

リンターエラーをチェックするには、以下のコマンドを実行します：

```bash
npm run lint
```

コマンドに `:fix` フラグを含めることで、修正可能なリンターエラーを自動修正できます：

```bash
npm run lint:fix
```

## ディレクトリ構造

統合テストは、`.integration-tests` ディレクトリ内にテスト実行ごとに一意のディレクトリを作成します。このディレクトリ内には、テストファイルごとにサブディレクトリが作成され、さらにその中に個々のテストケースごとのサブディレクトリが作成されます。

この構造により、特定のテスト実行、ファイル、ケースのアーティファクトを簡単に見つけられます。

```
.integration-tests/
└── <run-id>/
    └── <test-file-name>.test.ts/
        └── <test-case-name>/
            ├── output.log
            └── ...other test artifacts...
```

## 継続的インテグレーション

統合テストが常に実行されるように、`.github/workflows/e2e.yml` に GitHub Actions ワークフローが定義されています。このワークフローは、`main` ブランチへのプルリクエスト、またはプルリクエストがマージキューに追加されたときに自動的に統合テストを実行します。

ワークフローは、さまざまなサンドボックス環境でテストを実行し、Qwen Code がそれぞれの環境でテストされるようにします：

- `sandbox:none`: サンドボックスなしでテストを実行します。
- `sandbox:docker`: Docker コンテナ内でテストを実行します。
- `sandbox:podman`: Podman コンテナ内でテストを実行します。