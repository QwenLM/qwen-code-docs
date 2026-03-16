# 統合テスト

このドキュメントでは、本プロジェクトで使用される統合テストフレームワークについて説明します。

## 概要

統合テストは、Qwen Code のエンドツーエンド機能を検証することを目的として設計されています。これらのテストでは、ビルド済みのバイナリを制御された環境で実行し、ファイルシステムとやり取りする際の動作が期待通りであることを確認します。

これらのテストは `integration-tests` ディレクトリに配置されており、カスタムのテストランナーを使用して実行されます。

## テストの実行

統合テストは、デフォルトの `npm run test` コマンドの一部として実行されません。代わりに、明示的に `npm run test:integration:all` スクリプトを実行する必要があります。

また、以下のショートカットコマンドでも統合テストを実行できます：

```bash
npm run test:e2e
```

## 特定のテストセットを実行する

テストファイルのサブセットを実行するには、`npm run <統合テストコマンド> <ファイル名1> ...` を使用します。ここで `<統合テストコマンド>` は `test:e2e` または `test:integration*` のいずれかであり、`<ファイル名>` は `integration-tests/` ディレクトリ内の任意の `.test.js` ファイルです。たとえば、以下のコマンドは `list_directory.test.js` および `write_file.test.js` を実行します。

```bash
npm run test:e2e list_directory write_file
```

### 名前で単一のテストを実行する

名前で単一のテストを実行するには、`--test-name-pattern` フラグを使用します。

```bash
npm run test:e2e -- --test-name-pattern "reads a file"
```

### すべてのテストを実行する

統合テスト全体を実行するには、以下のコマンドを使用します。

```bash
npm run test:integration:all
```

### サンドボックス行列

`all` コマンドは、`no sandboxing`（サンドボックスなし）、`docker`、`podman` の各テストを実行します。  
個別のタイプを実行するには、以下のコマンドを使用します。

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

統合テスト実行ツールには、テスト失敗の原因を特定するための診断機能がいくつか用意されています。

### テスト出力の保存

テスト実行中に作成された一時ファイルを検査用に保存できます。これは、ファイルシステム操作に関する問題のデバッグに役立ちます。

テスト出力を保存するには、環境変数 `KEEP_OUTPUT` を `true` に設定します。

```bash
KEEP_OUTPUT=true npm run test:integration:sandbox:none
```

出力を保存した場合、テスト実行ツールはそのテスト実行に対応する一意のディレクトリのパスを表示します。

### 詳細な出力

より詳細なデバッグを行うには、`VERBOSE` 環境変数を `true` に設定します。

```bash
VERBOSE=true npm run test:integration:sandbox:none
```

`VERBOSE=true` と `KEEP_OUTPUT=true` を同じコマンドで使用すると、出力がコンソールにストリーミングされるだけでなく、テストの一時ディレクトリ内にあるログファイルにも保存されます。

詳細な出力は、ログの発生元を明確に識別できるようフォーマットされています：

```
--- TEST: <log dir>:<test-name> ---
... qwen コマンドからの出力 ...
--- END TEST: <log dir>:<test-name> ---
```

## リンティングおよびフォーマット

コード品質と一貫性を確保するため、統合テストファイルはメインのビルドプロセスの一部としてリンティングされます。また、リンターおよび自動修正ツールを手動で実行することもできます。

### リンターの実行

リンティングエラーを確認するには、以下のコマンドを実行します：

```bash
npm run lint
```

`npm run lint:fix` のように `:fix` フラグを付けて実行すると、修正可能なリンティングエラーを自動的に修正できます：

```bash
npm run lint:fix
```

## ディレクトリ構造

統合テストでは、各テスト実行ごとに `.integration-tests` ディレクトリ内に一意のディレクトリが作成されます。このディレクトリ内には、各テストファイルごとにサブディレクトリが作成され、さらにその中には各個別のテストケースごとにサブディレクトリが作成されます。

この構造により、特定のテスト実行、テストファイル、またはテストケースに対応するアーティファクトを簡単に特定できます。

```
.integration-tests/
└── <run-id>/
    └── <test-file-name>.test.js/
        └── <test-case-name>/
            ├── output.log
            └── ...その他のテストアーティファクト...
```

## 継続的インテグレーション

統合テストが常に実行されるように、`.github/workflows/e2e.yml` に GitHub Actions のワークフローが定義されています。このワークフローは、`main` ブランチに対するプルリクエスト、またはマージキューに追加されたプルリクエストに対して、自動的に統合テストを実行します。

このワークフローでは、異なるサンドボックス環境でテストを実行し、Qwen Code がそれぞれの環境で正しくテストされるようになっています。

- `sandbox:none`: サンドボックス化せずにテストを実行します。
- `sandbox:docker`: Docker コンテナ内でテストを実行します。
- `sandbox:podman`: Podman コンテナ内でテストを実行します。