# 統合テスト

本ドキュメントでは、本プロジェクトで使用する統合テストフレームワークについて説明します。

## 概要

統合テストは、Qwen Code のエンドツーエンドの機能を検証することを目的としています。ビルド済みバイナリを制御された環境で実行し、ファイルシステムとの連携時に期待通りに動作するかを確認します。

これらのテストは `integration-tests` ディレクトリに配置されており、カスタムテストランナーを使用して実行されます。

## テストの実行

統合テストは、デフォルトの `npm run test` コマンドでは実行されません。`npm run test:integration:all` スクリプトを使用して明示的に実行する必要があります。

統合テストは、以下のショートカットコマンドでも実行できます。

```bash
npm run test:e2e
```

## 特定のテストセットの実行

テストファイルの一部のみを実行するには、`npm run <integration test command> <file_name1> ...` を使用します。ここで、`<integration test command>` は `test:e2e` または `test:integration*` のいずれかであり、`<file_name>` は `integration-tests/` ディレクトリ内の任意の `.test.js` ファイルです。例えば、以下のコマンドは `list_directory.test.js` と `write_file.test.js` を実行します。

```bash
npm run test:e2e list_directory write_file
```

### テスト名を指定して単一テストを実行する

テスト名を指定して単一のテストを実行するには、`--test-name-pattern` フラグを使用します。

```bash
npm run test:e2e -- --test-name-pattern "reads a file"
```

### 全テストの実行

統合テストのスイート全体を実行するには、以下のコマンドを使用します。

```bash
npm run test:integration:all
```

### サンドボックスマトリクス

`all` コマンドは、`no sandboxing`、`docker`、`podman` の各環境でテストを実行します。
各タイプは、以下のコマンドを使用して個別に実行できます。

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

統合テストランナーには、テスト失敗の原因を特定するのに役立つ診断オプションがいくつか用意されています。

### テスト出力の保持

テスト実行中に作成された一時ファイルを保持して検査できます。これは、ファイルシステム操作に関する問題のデバッグに役立ちます。

テスト出力を保持するには、`KEEP_OUTPUT` 環境変数を `true` に設定します。

```bash
KEEP_OUTPUT=true npm run test:integration:sandbox:none
```

出力が保持される場合、テストランナーはテスト実行用の一意のディレクトリへのパスを出力します。

### 詳細出力

より詳細なデバッグを行うには、`VERBOSE` 環境変数を `true` に設定します。

```bash
VERBOSE=true npm run test:integration:sandbox:none
```

同じコマンドで `VERBOSE=true` と `KEEP_OUTPUT=true` を併用すると、出力はコンソールにストリーミングされると同時に、テストの一時ディレクトリ内のログファイルにも保存されます。

詳細出力は、ログの送信元を明確に識別できるよう以下の形式で出力されます。

```
--- TEST: <log dir>:<test-name> ---
... output from the qwen command ...
--- END TEST: <log dir>:<test-name> ---
```

## リンティングとフォーマット

コードの品質と一貫性を確保するため、統合テストファイルはメインのビルドプロセスの一部としてリンティングされます。リンターと自動修正ツールは手動で実行することもできます。

### リンターの実行

リンティングエラーを確認するには、以下のコマンドを実行します。

```bash
npm run lint
```

コマンドに `:fix` フラグを追加すると、修正可能なリンティングエラーを自動的に修正できます。

```bash
npm run lint:fix
```

## ディレクトリ構造

統合テストは、`.integration-tests` ディレクトリ内に、各テスト実行ごとに一意のディレクトリを作成します。このディレクトリ内にはテストファイルごとのサブディレクトリが作成され、さらにその中に個々のテストケースごとのサブディレクトリが作成されます。

この構造により、特定のテスト実行、ファイル、またはケースの成果物を簡単に見つけることができます。

```
.integration-tests/
└── <run-id>/
    └── <test-file-name>.test.js/
        └── <test-case-name>/
            ├── output.log
            └── ...other test artifacts...
```

## 継続的インテグレーション

統合テストが常に実行されることを保証するため、`.github/workflows/e2e.yml` に GitHub Actions ワークフローが定義されています。このワークフローは、`main` ブランチへのプルリクエスト時、またはプルリクエストがマージキューに追加された際に、統合テストを自動的に実行します。

このワークフローは、Qwen Code が各環境でテストされるよう、異なるサンドボックス環境でテストを実行します。

- `sandbox:none`: サンドボックスなしでテストを実行します。
- `sandbox:docker`: Docker コンテナ内でテストを実行します。
- `sandbox:podman`: Podman コンテナ内でテストを実行します。