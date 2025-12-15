# 結合テスト

このドキュメントでは、本プロジェクトで使用されている結合テストフレームワークについて説明します。

## 概要

結合テストは、Qwen Code のエンドツーエンドの機能を検証するように設計されています。これらは制御された環境でビルドされたバイナリを実行し、ファイルシステムとやり取りする際の動作が期待通りであることを確認します。

これらのテストは `integration-tests` ディレクトリに配置されており、カスタムテストランナーを使用して実行されます。

## テストの実行方法

結合テストは、デフォルトの `npm run test` コマンドでは実行されません。明示的に `npm run test:integration:all` スクリプトを使用して実行する必要があります。

結合テストは以下のショートカットでも実行できます：

```bash
npm run test:e2e
```

## 特定のテストセットを実行する

テストファイルのサブセットを実行するには、`npm run <integration test command> <file_name1> ....` を使用できます。ここで &lt;integration test command&gt; は `test:e2e` または `test:integration*` のいずれかであり、`<file_name>` は `integration-tests/` ディレクトリ内の任意の `.test.js` ファイルです。例えば、以下のコマンドは `list_directory.test.js` と `write_file.test.js` を実行します：

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

### サンドボックスマトリクス

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

統合テストランナーは、テスト失敗の追跡を支援するためにいくつかの診断オプションを提供します。

### テスト出力の保持

テスト実行中に作成された一時ファイルを検査用に保持できます。これはファイルシステム操作に関する問題をデバッグするのに役立ちます。

テスト出力を保持するには、`KEEP_OUTPUT` 環境変数を `true` に設定してください。

```bash
KEEP_OUTPUT=true npm run test:integration:sandbox:none
```

出力が保持される場合、テストランナーはテスト実行用の一意のディレクトリへのパスを表示します。

### 詳細出力

より詳細なデバッグを行うには、`VERBOSE` 環境変数を `true` に設定してください。

```bash
VERBOSE=true npm run test:integration:sandbox:none
```

同じコマンド内で `VERBOSE=true` と `KEEP_OUTPUT=true` を使用すると、出力はコンソールにストリームされると同時に、テストの一時ディレクトリ内のログファイルにも保存されます。

詳細出力は、ログの出所を明確に識別できるようにフォーマットされています：

```
--- TEST: <log dir>:<test-name> ---
... qwen コマンドからの出力 ...
--- END TEST: <log dir>:<test-name> ---
```

## リンティングとフォーマット

コードの品質と一貫性を確保するため、統合テストファイルはメインのビルドプロセスの一環としてリンティングが実行されます。手動でリンターと自動修正を実行することも可能です。

### リンターの実行

リンティングエラーを確認するには、以下のコマンドを実行してください：

```bash
npm run lint
```

コマンドに `:fix` フラグを含めることで、修正可能なリンティングエラーを自動的に修正できます：

```bash
npm run lint:fix
```

## ディレクトリ構造

統合テストは、`.integration-tests`ディレクトリ内に各テスト実行ごとに一意のディレクトリを作成します。このディレクトリ内には、各テストファイルごとにサブディレクトリが作成され、さらにその中に各個別のテストケースごとにサブディレクトリが作成されます。

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

統合テストが常に実行されるようにするため、`.github/workflows/e2e.yml` に GitHub Actions のワークフローが定義されています。このワークフローは、`main` ブランチに対するプルリクエストや、プルリクエストがマージキューに追加された際に自動で統合テストを実行します。

ワークフローは異なるサンドボックス環境でテストを実行し、Qwen Code がそれぞれの環境で正しく動作することを確認します：

- `sandbox:none`: サンドボックスなしでテストを実行します。
- `sandbox:docker`: Docker コンテナ内でテストを実行します。
- `sandbox:podman`: Podman コンテナ内でテストを実行します。