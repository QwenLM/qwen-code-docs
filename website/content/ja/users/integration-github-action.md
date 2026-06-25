# Github Actions：qwen-code-action

## 概要

`qwen-code-action` は、[Qwen Code CLI] を介して [Qwen Code] を開発ワークフローに統合する GitHub Action です。重要な日常的なコーディングタスクを自律的に処理するエージェントとして機能するほか、必要に応じて作業を委任できるコラボレーターとしても機能します。

GitHub リポジトリ内で直接、[Qwen Code] を対話形式（例：`@qwencoder fix this issue`）で使用し、GitHub プルリクエストのレビュー、イシューのトリアージ、コードの分析と修正などを実行できます。

## 機能

- **自動化**: イベント（例：イシューのオープン）やスケジュール（例：毎晩）に基づいてワークフローをトリガーします。
- **オンデマンドコラボレーション**: イシューやプルリクエストのコメントで [Qwen Code CLI](./features/commands) をメンション（例：`@qwencoder /review`）することで、ワークフローをトリガーします。
- **ツールによる拡張性**: [Qwen Code](../developers/tools/introduction.md) モデルのツール呼び出し機能を活用し、[GitHub CLI] (`gh`) などの他の CLI と連携できます。
- **カスタマイズ可能**: リポジトリ内の `QWEN.md` ファイルを使用して、プロジェクト固有の指示やコンテキストを [Qwen Code CLI](./features/commands) に提供できます。

## クイックスタート

わずか数分で、リポジトリで Qwen Code CLI の使用を開始できます：

### 1. Qwen API キーの取得

[DashScope](https://help.aliyun.com/zh/model-studio/qwen-code)（Alibaba Cloud の AI プラットフォーム）から API キーを取得します。

### 2. GitHub シークレットとしての追加

API キーをリポジトリの `QWEN_API_KEY` という名前のシークレットとして保存します：

- リポジトリの **Settings > Secrets and variables > Actions** に移動します
- **New repository secret** をクリックします
- 名前: `QWEN_API_KEY`, 値: API キー

### 3. .gitignore の更新

以下のエントリを `.gitignore` ファイルに追加します：

```gitignore
# qwen-code-cli settings
.qwen/

# GitHub App credentials
gha-creds-*.json
```

### 4. ワークフローの選択

ワークフローを設定するには、次の 2 つのオプションがあります：

**オプション A: セットアップコマンドを使用する（推奨）**

1. ターミナルで Qwen Code CLI を起動します：

   ```shell
   qwen
   ```

2. ターミナルの Qwen Code CLI で、以下を入力します：

   ```
   /setup-github
   ```

**オプション B: ワークフローを手動でコピーする**

1. 事前構築済みのワークフローを [`examples/workflows`](./common-workflow) ディレクトリから、リポジトリの `.github/workflows` ディレクトリにコピーします。注: ワークフローの実行をトリガーする `qwen-dispatch.yml` ワークフローもコピーする必要があります。

### 5. 動作確認

**プルリクエストレビュー:**

- リポジトリでプルリクエストを開き、自動レビューを待ちます
- 既存のプルリクエストに `@qwencoder /review` とコメントして、手動でレビューをトリガーします

**イシューのトリアージ:**

- イシューを開き、自動トリアージを待ちます
- 既存のイシューに `@qwencoder /triage` とコメントして、手動でトリアージをトリガーします

**一般的な AI アシスタンス:**

- 任意のイシューまたはプルリクエストで、`@qwencoder` に続けてリクエストをメンションします
- 例:
  - `@qwencoder explain this code change`
  - `@qwencoder suggest improvements for this function`
  - `@qwencoder help me debug this error`
  - `@qwencoder write unit tests for this component`

## ワークフロー

このアクションは、さまざまなユースケースに対応する事前構築済みのワークフローをいくつか提供します。各ワークフローは、リポジトリの `.github/workflows` ディレクトリにコピーし、必要に応じてカスタマイズすることを前提に設計されています。

### Qwen Code Dispatch

このワークフローは Qwen Code CLI の中央ディスパッチャーとして機能し、トリガーイベントとコメントで提供されたコマンドに基づいて、リクエストを適切なワークフローにルーティングします。ディスパッチワークフローの設定方法に関する詳細なガイドについては、[Qwen Code Dispatch ワークフローのドキュメント](./common-workflow) を参照してください。

### Issue Triage

このアクションは、GitHub イシューを自動的またはスケジュールに基づいてトリアージするために使用できます。動作するイシュートリアージの設定例については、[自動 Issue トリアージワークフロー](https://github.com/QwenLM/qwen-code/blob/main/.github/workflows/qwen-automated-issue-triage.yml)を参照してください。

### Pull Request Review

このアクションは、プルリクエストがオープンされたときに自動的にレビューするために使用できます。プルリクエストレビューシステムの設定方法に関する詳細なガイドについては、[GitHub PR Review ワークフローのドキュメント](./common-workflow) を参照してください。

### Qwen Code CLI Assistant

このタイプのアクションは、プルリクエストやイシュー内で汎用的な対話型 Qwen Code AI アシスタントを呼び出し、幅広いタスクを実行するために使用できます。汎用 Qwen Code CLI ワークフローの設定方法に関する詳細なガイドについては、[Qwen Code Assistant ワークフローのドキュメント](./common-workflow) を参照してください。

## 設定

### 入力

<!-- BEGIN_AUTOGEN_INPUTS -->

- <a name="__input_qwen_api_key"></a><a href="#user-content-__input_qwen_api_key"><code>qwen*api_key</code></a>: *(Optional)\_ Qwen API の API キー。

- <a name="__input_qwen_cli_version"></a><a href="#user-content-__input_qwen_cli_version"><code>qwen*cli_version</code></a>: *(Optional, default: `latest`)\_ インストールする Qwen Code CLI のバージョン。"latest"、"preview"、"nightly"、特定のバージョン番号、または git ブランチ、タグ、コミットを指定できます。詳細は [Qwen Code CLI releases](https://github.com/QwenLM/qwen-code-action/blob/main/docs/releases.md) を参照してください。

- <a name="__input_qwen_debug"></a><a href="#user-content-__input_qwen_debug"><code>qwen*debug</code></a>: *(Optional)\_ デバッグログと出力ストリーミングを有効にします。

- <a name="__input_qwen_model"></a><a href="#user-content-__input_qwen_model"><code>qwen*model</code></a>: *(Optional)\_ Qwen Code で使用するモデル。

- <a name="__input_prompt"></a><a href="#user-content-__input_prompt"><code>prompt</code></a>: _(Optional, default: `You are a helpful assistant.`)_ Qwen Code CLI の [`--prompt` 引数](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#command-line-arguments) に渡す文字列。

- <a name="__input_settings"></a><a href="#user-content-__input_settings"><code>settings</code></a>: _(Optional)_ CLI の _プロジェクト_ 設定を構成するために `.qwen/settings.json` に書き込まれる JSON 文字列。
  詳細は [settings files](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#settings-files) のドキュメントを参照してください。

- <a name="__input_use_qwen_code_assist"></a><a href="#user-content-__input_use_qwen_code_assist"><code>use*qwen_code_assist</code></a>: *(Optional, default: `false`)\_ デフォルトの Qwen Code API キーの代わりに、Code Assist を使用して Qwen Code モデルにアクセスするかどうか。
  詳細は [Qwen Code CLI documentation](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/authentication.md) を参照してください。

- <a name="__input_use_vertex_ai"></a><a href="#user-content-__input_use_vertex_ai"><code>use*vertex_ai</code></a>: *(Optional, default: `false`)\_ デフォルトの Qwen Code API キーの代わりに、Vertex AI を使用して Qwen Code モデルにアクセスするかどうか。
  詳細は [Qwen Code CLI documentation](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/authentication.md) を参照してください。

- <a name="__input_extensions"></a><a href="#user-content-__input_extensions"><code>extensions</code></a>: _(Optional)_ インストールする Qwen Code CLI 拡張機能のリスト。

- <a name="__input_upload_artifacts"></a><a href="#user-content-__input_upload_artifacts"><code>upload*artifacts</code></a>: *(Optional, default: `false`)\_ アーティファクトを GitHub Action にアップロードするかどうか。

- <a name="__input_use_pnpm"></a><a href="#user-content-__input_use_pnpm"><code>use*pnpm</code></a>: *(Optional, default: `false`)\_ qwen-code-cli のインストールに npm の代わりに pnpm を使用するかどうか。

- <a name="__input_workflow_name"></a><a href="#user-content-__input_workflow_name"><code>workflow*name</code></a>: *(Optional, default: `${{ github.workflow }}`)\_ テレメトリ目的で使用される GitHub ワークフロー名。

<!-- END_AUTOGEN_INPUTS -->

### 出力

<!-- BEGIN_AUTOGEN_OUTPUTS -->

- <a name="__output_summary"></a><a href="#user-content-__output_summary"><code>summary</code></a>: Qwen Code CLI 実行からの要約出力。

- <a name="__output_error"></a><a href="#user-content-__output_error"><code>error</code></a>: Qwen Code CLI 実行からのエラー出力（存在する場合）。

<!-- END_AUTOGEN_OUTPUTS -->

### リポジトリ変数

以下の値はリポジトリ変数として設定することを推奨します。これにより、すべてのワークフローで再利用できます。あるいは、個々のワークフローでアクション入力としてインラインで設定したり、リポジトリレベルの値を上書きしたりすることもできます。

| 名前               | 説明                                               | 型     | 必須 | 必須となる条件             |
| ------------------ | --------------------------------------------------------- | -------- | -------- | ------------------------- |
| `DEBUG`            | Qwen Code CLI のデバッグログを有効にします。              | 変数 | いいえ       | なし                     |
| `QWEN_CLI_VERSION` | インストールする Qwen Code CLI のバージョンを制御します。 | 変数 | いいえ       | CLI バージョンを固定する場合   |
| `APP_ID`           | カスタム認証用の GitHub App ID。                  | 変数 | いいえ       | カスタム GitHub App を使用する場合 |

リポジトリ変数を追加するには：

1. リポジトリの **Settings > Secrets and variables > Actions > New variable** に移動します。
2. 変数名と値を入力します。
3. 保存します。

リポジトリ変数の詳細については、[GitHub の変数に関するドキュメント][variables] を参照してください。

### シークレット

リポジトリで以下のシークレットを設定できます：

| 名前              | 説明                                   | 必須 | 必須となる条件                              |
| ----------------- | --------------------------------------------- | -------- | ------------------------------------------ |
| `QWEN_API_KEY`    | DashScope から取得した Qwen API キー。             | はい      | Qwen を呼び出すすべてのワークフローで必須。 |
| `APP_PRIVATE_KEY` | GitHub App の秘密鍵（PEM 形式）。 | いいえ       | カスタム GitHub App を使用する場合。                 |

シークレットを追加するには：

1. リポジトリの **Settings > Secrets and variables > Actions > New repository secret** に移動します。
2. シークレット名と値を入力します。
3. 保存します。

詳細については、[暗号化されたシークレットの作成と使用に関する公式 GitHub ドキュメント][secrets] を参照してください。

## 認証

このアクションでは、GitHub API への認証と、オプションで Qwen Code サービスへの認証が必要です。

### GitHub 認証

GitHub への認証には、次の 2 つの方法があります：

1. **デフォルトの `GITHUB_TOKEN`:** よりシンプルなユースケースの場合、アクションはワークフローが提供するデフォルトの `GITHUB_TOKEN` を使用できます。
2. **カスタム GitHub App（推奨）:** 最も安全で柔軟な認証を行うには、カスタム GitHub App の作成を推奨します。

Qwen と GitHub の両方の認証に関する詳細な設定手順については、[**認証ドキュメント**](./configuration/auth) を参照してください。

## 拡張機能

Qwen Code CLI は、拡張機能を通じて追加機能を拡張できます。
これらの拡張機能は、GitHub リポジトリからソースとしてインストールされます。

拡張機能のセットアップと設定方法の詳細については、[拡張機能ドキュメント](./extension/introduction.md) を参照してください。

## ベストプラクティス

自動化されたワークフローのセキュリティ、信頼性、効率性を確保するために、ベストプラクティスに従うことを強く推奨します。これらのガイドラインは、リポジトリのセキュリティ、ワークフローの設定、モニタリングなどの主要な領域をカバーしています。

主な推奨事項は次のとおりです：

- **リポジトリのセキュリティ保護:** ブランチとタグの保護の実装、およびプルリクエストの承認者の制限。
- **モニタリングと監査:** アクションログの定期的なレビュー、およびパフォーマンスと動作をより深く把握するための OpenTelemetry の有効化。

リポジトリとワークフローのセキュリティ保護に関する包括的なガイドについては、[**ベストプラクティスドキュメント**](./common-workflow) を参照してください。

## カスタマイズ

リポジトリのルートに `QWEN.md` ファイルを作成し、[Qwen Code CLI](./common-workflow) にプロジェクト固有のコンテキストと指示を提供します。これは、特定のモデルが特定のリポジトリで従うべきコーディング規約、アーキテクチャパターン、その他のガイドラインを定義するのに役立ちます。

## コントリビューション

コントリビューションを歓迎します！開始方法の詳細については、Qwen Code CLI の **Contributing Guide** を確認してください。

[secrets]: https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions
[Qwen Code]: https://github.com/QwenLM/qwen-code
[DashScope]: https://dashscope.console.aliyun.com/apiKey
[Qwen Code CLI]: https://github.com/QwenLM/qwen-code-action/
[variables]: https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-variables#creating-configuration-variables-for-a-repository
[GitHub CLI]: https://docs.github.com/en/github-cli/github-cli
[QWEN.md]: https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#context-files-hierarchical-instructional-context