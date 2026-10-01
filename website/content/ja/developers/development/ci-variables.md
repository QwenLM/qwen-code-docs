# CIとリリースの変数

CIおよびリリースパイプラインのいくつかの設定は、GitHub Actionsのリポジトリ変数（`vars.*`コンテキスト）として公開されているため、オペレーターはプルリクエストを開かずにそれらを再調整できます。このページでは、`.github/workflows/ci.yml`と`.github/workflows/release.yml`でのテスト実行に影響する変数とそのデフォルト値、および各変数が適用される場所を一覧にまとめています。

## 変数の設定

リポジトリのメンテナーは、**Settings → Secrets and variables → Actions → Variables** でこれらを設定します。未設定（または空）の変数は、ワークフロー式のフォールバックを使用します。ワーカーキャップは、変数が設定されている場合でも、予約済みランナー上でのみ適用されます。

ワークフローファイルがこれらの設定の唯一の信頼できる情報源であり、テストスイートはワークフロー式をバイト単位で正確に固定しています。`scripts/tests/package-scripts.test.js`は`release.yml`の共有ワーカーキャップ式（`ecs-qwen-`ガード付きの`QWEN_CI_VITEST_MAX_WORKERS`）を固定し、`scripts/tests/no-ak-integration-ci.test.js`は`ci.yml`のワーカーキャップ式を固定し、`scripts/tests/release-workflow.test.js`は`release.yml`のリトライおよびワークスペーステストのタイムアウト式を固定しています。`scripts/tests/package-scripts.test.js`は、ドキュメント化されたデフォルト値とワークフローの場所を両方のワークフローに対してチェックします。このガードはドキュメントのみのチェックではなくフルプロファイルCIレーン（`test:scripts`）で実行されるため、このページのみに限定された編集は、プルリクエストを開く前に`npm run test:scripts`（または`npx vitest run --config ./scripts/tests/vitest.config.ts scripts/tests/package-scripts.test.js`）でローカルに検証してください。ドキュメントとワークフローに矛盾がある場合は、ワークフローを信頼し、同じ変更でこのページを更新してください。

## 変数

| 変数                                       | デフォルト | 使用場所                | 制御内容                                                                                          |
| ------------------------------------------ | ---------- | ----------------------- | ------------------------------------------------------------------------------------------------- |
| `QWEN_CI_VITEST_RETRY`                     | `2`        | `ci.yml`                | メインCIワークスペースおよびスクリプトテストステップのリトライ回数                                |
| `QWEN_RELEASE_VITEST_RETRY`                | `2`        | `release.yml`           | リリースワークスペーステストシャードのリトライ回数                                                |
| `QWEN_RELEASE_WORKSPACE_TIMEOUT_MINUTES`   | `45`       | `release.yml`           | 各リリースワークスペーステストシャードのジョブタイムアウト                                        |
| `QWEN_CI_VITEST_MAX_WORKERS`               | `4`        | `ci.yml`、`release.yml` | 予約済みランナー上でのメインCI単体テストおよびリリースワークスペース/品質テストのワーカーキャップ |

### リトライ回数

`QWEN_CI_VITEST_RETRY`および`QWEN_RELEASE_VITEST_RETRY`は、それぞれメインCIテストステップ（`npm run test:ci:workspaces`および`npm run test:scripts`）とリリースレーン（`npm run test:release:workspaces`）で`--retry=<n>`としてVitestに渡されます。2つのレーンは独立して調整できるように、別々の変数を持っています。

Vitestは失敗したテストを同じ実行内で再実行します。これは断続的な競合に役立つことがありますが、リトライバジェット内で回復した失敗はチェックをグリーンにし、フレーキー再実行トラッカーには失敗として記録されません。フレーキーなスイートをリトライで覆い隠すのではなく、バジェットを控えめに保ってください。どちらの変数もリテラル値`off`を受け付けます。この場合、`--retry=0`を渡すのではなく`--retry`フラグ自体が省略されます（コマンドラインの`--retry=0`はワークスペース独自のVitest設定よりも優先され、意図的なリトライポリシーを無効にしてしまうためです）。

### ワークスペーステストのタイムアウト

`QWEN_RELEASE_WORKSPACE_TIMEOUT_MINUTES`は、リリースパイプラインの3つの`workspace_tests`シャードそれぞれのジョブレベルの`timeout-minutes`を設定します。タイムアウトはスイート自体ではなく予約済みホストの混雑度によってサイズが決められるため、テストの退行を想定するのではなく、ホストが競合している場合はこれを上げてください。

### セルフホストランナーでのVitestワーカーキャップ

`QWEN_CI_VITEST_MAX_WORKERS`は、以下にリストされたステップ（`VITEST_MAX_THREADS` / `VITEST_MAX_FORKS`、対応する最小値は`1`に強制）におけるVitestプロセスを、名前が`ecs-qwen-`で始まる予約済みセルフホストランナー上でキャップします。この変数はメインCIワークスペーステストステップとリリースの`workspace_tests`および`quality_scripts`ステップでのみエクスポートされます。CIおよびリリースワークフローで同じ予約済みプールに到達するVitestを実行する他の統合テストはこれを消費せず、独自のVitest制限を使用します。WebシェルE2Eスモークは`ubuntu-latest`に固定されているため、このキャップは適用されません。GitHubホストランナーではこの変数は無視され、Vitestは独自のデフォルトを使用します。

### テスト実行以外の関連変数

`release.yml`は`QWEN_RELEASE_STATIC_TIMEOUT_MINUTES`（デフォルト`60`、`quality_static` lintレーンを制御）と`QWEN_RELEASE_BUILD_TIMEOUT_MINUTES`（デフォルト`45`、`quality_build`パッケージングレーンを制御）も公開しています。これらはテスト実行ではなく静的リンティングとアーティファクトビルドを制御するため、このページのテスト実行スコープの外にあります。