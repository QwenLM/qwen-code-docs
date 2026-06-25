# Integration Tests

このドキュメントでは、本プロジェクトで使用されているインテグレーションテストフレームワークについて説明します。

## 概要

インテグレーションテストは、Qwen Code のエンドツーエンドの機能を検証するために設計されています。ビルド済みバイナリを制御された環境で実行し、ファイルシステムとのやり取りが期待通りに動作することを確認します。

これらのテストは `integration-tests` ディレクトリに配置されており、カスタムテストランナーを使用して実行されます。

## テストの実行

インテグレーションテストは、デフォルトの `npm run test` コマンドでは実行されません。`npm run test:integration:all` スクリプトを使用して明示的に実行する必要があります。

インテグレーションテストは、次のショートカットでも実行できます：

```bash
npm run test:e2e
```

## 特定のテストセットの実行

テストファイルのサブセットを実行するには、`npm run <integration test command> <file_name1> ....` を使用します。ここで &lt;integration test command&gt; は `test:e2e` または `test:integration*` のいずれかで、`<file_name>` は `integration-tests/` ディレクトリ内の `.test.ts` ファイルのいずれかです。たとえば、次のコマンドは `list_directory.test.ts` と `write_file.test.ts` を実行します：

```bash
npm run test:e2e list_directory write_file
```

### テスト名による単一テストの実行

テスト名を指定して単一のテストを実行するには、`--test-name-pattern` フラグを使用します：

```bash
npm run test:e2e -- --test-name-pattern "reads a file"
```

### 全テストの実行

インテグレーションテストのスイート全体を実行するには、次のコマンドを使用します：

```bash
npm run test:integration:all
```

### サンドボックスマトリックス

`all` コマンドは、`no sandboxing`、`docker`、`podman` のテストを実行します。
個別の種類は次のコマンドで実行できます：

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

インテグレーションテストランナーは、テスト失敗の原因を追跡するためのいくつかの診断オプションを提供しています。

### テスト出力の保持

テスト実行中に作成された一時ファイルを検査用に保持できます。これはファイルシステム操作の問題をデバッグする際に便利です。

テスト出力を保持するには、`KEEP_OUTPUT` 環境変数を `true` に設定します。

```bash
KEEP_OUTPUT=true npm run test:integration:sandbox:none
```

出力が保持されると、テストランナーはそのテスト実行のユニークなディレクトリパスを表示します。

### 詳細出力

より詳細なデバッグのために、`VERBOSE` 環境変数を `true` に設定します。

```bash
VERBOSE=true npm run test:integration:sandbox:none
```

`VERBOSE=true` と `KEEP_OUTPUT=true` を同じコマンドで使用すると、出力はコンソールにストリーミングされると同時に、テストの一時ディレクトリ内のログファイルにも保存されます。

詳細出力は、ログのソースを明確に識別できるようにフォーマットされています：

```
--- TEST: <log dir>:<test-name> ---
... output from the qwen command ...
--- END TEST: <log dir>:<test-name> ---
```

## リンティングとフォーマット

コード品質と一貫性を確保するため、インテグレーションテストファイルはメインビルドプロセスの一部としてリントされます。リンターと自動修正ツールを手動で実行することもできます。

### リンターの実行

リンティングエラーを確認するには、次のコマンドを実行します：

```bash
npm run lint
```

修正可能なリンティングエラーを自動的に修正するには、コマンドに `:fix` フラグを含めます：

```bash
npm run lint:fix
```

## ディレクトリ構造

インテグレーションテストは、`.integration-tests` ディレクトリ内にテスト実行ごとのユニークなディレクトリを作成します。そのディレクトリ内に各テストファイルのサブディレクトリが作成され、さらにその中に各テストケースのサブディレクトリが作成されます。

この構造により、特定のテスト実行、ファイル、またはケースのアーティファクトを簡単に見つけることができます。

```
.integration-tests/
└── <run-id>/
    └── <test-file-name>.test.ts/
        └── <test-case-name>/
            ├── output.log
            └── ...other test artifacts...
```

## 継続的インテグレーション

インテグレーションテストが常に実行されるよう、`.github/workflows/e2e.yml` に GitHub Actions ワークフローが定義されています。このワークフローは、`main` ブランチへのプルリクエスト、またはプルリクエストがマージキューに追加された際に自動的にインテグレーションテストを実行します。

ワークフローは異なるサンドボックス環境でテストを実行し、Qwen Code が各環境でテストされることを確認します：

- `sandbox:none`: サンドボックスなしでテストを実行します。
- `sandbox:docker`: Docker コンテナでテストを実行します。
- `sandbox:podman`: Podman コンテナでテストを実行します。
