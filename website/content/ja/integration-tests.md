# 統合テスト

このドキュメントでは、本プロジェクトで使用されている統合テストフレームワークについて説明します。

## 概要

統合テストは、Qwen Code のエンドツーエンドの機能を検証するために設計されています。これらは制御された環境でビルドされたバイナリを実行し、ファイルシステムとやり取りする際に期待通りに動作するかを確認します。

テストは `integration-tests` ディレクトリに配置されており、カスタムの test runner を使用して実行されます。

## テストの実行方法

統合テストは、デフォルトの `npm run test` コマンドでは実行されません。明示的に `npm run test:integration:all` スクリプトを使用して実行する必要があります。

統合テストは以下のショートカットでも実行できます：

```bash
npm run test:e2e
```

## 特定のテストセットを実行する

テストファイルのサブセットを実行するには、`npm run <integration test command> <file_name1> ....` を使用できます。ここで `<integration test command>` は `test:e2e` または `test:integration*` のいずれかであり、`<file_name>` は `integration-tests/` ディレクトリ内の任意の `.test.js` ファイルです。例えば、以下のコマンドは `list_directory.test.js` と `write_file.test.js` を実行します：

```bash
npm run test:e2e list_directory write_file
```

### 名前で単一のテストを実行する

名前で単一のテストを実行するには、`--test-name-pattern` フラグを使用します：

```bash
npm run test:e2e -- --test-name-pattern "reads a file"
```

### すべてのテストを実行する

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

インテグレーションテストランナーは、テスト失敗の追跡を支援するための診断オプションをいくつか提供しています。

### テスト出力の保持

テスト実行中に作成された一時ファイルを検査用に保持できます。これはファイルシステム操作に関する問題をデバッグするのに役立ちます。

テスト出力を保持するには、`--keep-output` フラグを使用するか、`KEEP_OUTPUT` 環境変数を `true` に設定します。

```bash

# フラグを使用
npm run test:integration:sandbox:none -- --keep-output

# 環境変数の使用

```bash
KEEP_OUTPUT=true npm run test:integration:sandbox:none
```

出力を保持する場合、テストランナーはテスト実行用の一意のディレクトリパスを表示します。

### 詳細出力 (Verbose output)

より詳細なデバッグのために、`--verbose` フラグを使用すると、`qwen` コマンドのリアルタイム出力がコンソールにストリームされます。

```bash
npm run test:integration:sandbox:none -- --verbose
```

同じコマンド内で `--verbose` と `--keep-output` を同時に使用した場合、出力はコンソールにストリームされると同時に、テストの一時ディレクトリ内のログファイルにも保存されます。

詳細出力は、ログの出力元を明確に識別できるようにフォーマットされています：

```
--- TEST: <file-name-without-js>:<test-name> ---
... output from the qwen command ...
--- END TEST: <file-name-without-js>:<test-name> ---
```

## Linting とフォーマット

コードの品質と一貫性を確保するため、インテグレーションテストファイルはメインのビルドプロセスの一環として lint されます。手動で linter と自動修正を実行することも可能です。

### linter の実行

linting エラーをチェックするには、以下のコマンドを実行してください：

```bash
npm run lint
```

自動で修正可能な linting エラーを自動修正するには、コマンドに `:fix` フラグを追加してください：

```bash
npm run lint:fix
```

## ディレクトリ構造

統合テストでは、`.integration-tests` ディレクトリ内に各テスト実行用のユニークなディレクトリが作成されます。このディレクトリ内には各テストファイル用のサブディレクトリが作成され、さらにその中に各テストケース用のサブディレクトリが作成されます。

この構造により、特定のテスト実行、ファイル、またはケースのアーティファクトを簡単に見つけることができます。

```
.integration-tests/
└── <run-id>/
    └── <test-file-name>.test.js/
        └── <test-case-name>/
            ├── output.log
            └── ...other test artifacts...
```

## 継続的インテグレーション

インテグレーションテストが常に実行されるようにするため、`.github/workflows/e2e.yml` に GitHub Actions のワークフローが定義されています。このワークフローは、`main` ブランチに対するプルリクエストや、プルリクエストがマージキューに追加された際に、自動でインテグレーションテストを実行します。

ワークフローは異なるサンドボックス環境でテストを実行し、Qwen Code がそれぞれの環境で正しく動作することを確認します：

- `sandbox:none`: サンドボックスなしでテストを実行します。
- `sandbox:docker`: Docker コンテナ内でテストを実行します。
- `sandbox:podman`: Podman コンテナ内でテストを実行します。