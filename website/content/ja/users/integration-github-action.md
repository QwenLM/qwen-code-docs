# GitHub Actions：qwen-code-action

## 概要

`qwen-code-action` は、[Qwen Code CLI] を介して [Qwen Code] を開発ワークフローに統合する GitHub Action です。これは、重要な日常的なコーディングタスクのための自律型エージェントとして機能するだけでなく、すばやく作業を委任できるオンデマンドのコラボレーターとしても機能します。

GitHub リポジトリ内で直接 [Qwen Code] を対話的に使用して（例：`@qwencoder fix this issue`）、GitHub プルリクエストのレビュー、イシューのトリアージ、コードの分析と変更などを実行するために使用します。

## 機能

- **自動化**: イベント（イシューのオープンなど）やスケジュール（毎夜など）に基づいてワークフローをトリガーします。
- **オンデマンドコラボレーション**: [Qwen Code CLI](./features/commands) をメンションして（例：`@qwencoder /review`）、イシューやプルリクエストのコメントでワークフローをトリガーします。
- **ツールによる拡張性**: [Qwen Code](../developers/tools/introduction.md) モデルのツール呼び出し機能を活用して、[GitHub CLI] (`gh`) などの他の CLI と対話します。
- **カスタマイズ可能**: リポジトリ内の `QWEN.md` ファイルを使用して、[Qwen Code CLI](./features/commands) にプロジェクト固有の指示とコンテキストを提供します。

## クイックスタート

わずか数分で、リポジトリで Qwen Code CLI を使い始めましょう。

### 1. Qwen API キーの取得

[DashScope](https://help.aliyun.com/zh/model-studio/qwen-code)（Alibaba Cloud の AI プラットフォーム）から API キーを取得します。

### 2. GitHub Secret としての追加

API キーをリポジトリに `QWEN_API_KEY` という名前のシークレットとして保存します。

- リポジトリの **Settings > Secrets and variables > Actions** に移動します。
- **New repository secret** をクリックします。
- Name: `QWEN_API_KEY`、Value: あなたの API キー

### 3. .gitignore の更新

以下のエントリを `.gitignore` ファイルに追加します。

```gitignore
# qwen-code-cli settings
.qwen/

# GitHub App credentials
gha-creds-*.json
```

### 4. ワークフローの選択

ワークフローを設定するには、2 つのオプションがあります。

**オプション A: setup コマンドの使用（推奨）**

1. ターミナルで Qwen Code CLI を起動します。

   ```shell
   qwen
   ```

2. ターミナルの Qwen Code CLI で、以下のように入力します。

   ```
   /setup-github
   ```

**オプション B: ワークフローの手動コピー**

1. [`examples/workflows`](./common-workflow) ディレクトリからビルド済みのワークフローを、リポジトリの `.github/workflows` ディレクトリにコピーします。注意: ワークフローの実行をトリガーする `qwen-dispatch.yml` ワークフローもコピーする必要があります。

### 5. 動作確認

**プルリクエストのレビュー:**

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

この Action は、さまざまなユースケースに合わせていくつかのビルド済みワークフローを提供します。各ワークフローは、リポジトリの `.github/workflows` ディレクトリにコピーし、必要に応じてカスタマイズするように設計されています。

### Qwen Code Dispatch

このワークフローは Qwen Code CLI の中央ディスパッチャーとして機能し、トリガーイベントとコメントで提供されたコマンドに基づいて、リクエストを適切なワークフローにルーティングします。ディスパッチワークフローの設定方法に関する詳細なガイドについては、[Qwen Code Dispatch ワークフローのドキュメント](./common-workflow)を参照してください。

### イシューのトリアージ

この Action は、GitHub Issues を自動またはスケジュールに従ってトリアージするために使用できます。動作するイシューのトリアージ設定については、[自動イシューのトリアージワークフロー](https://github.com/QwenLM/qwen-code/blob/main/.github/workflows/qwen-automated-issue-triage.yml)を参照してください。

### プルリクエストのレビュー

この Action は、プルリクエストがオープンされたときに自動的にレビューするために使用できます。プルリクエストレビューシステムのセットアップ方法に関する詳細なガイドについては、[GitHub PR Review ワークフローのドキュメント](./common-workflow)を参照してください。

### Qwen Code CLI Assistant

このタイプの Action は、プルリクエストやイシュー内で汎用的な対話型 Qwen Code AI アシスタントを呼び出し、幅広いタスクを実行するために使用できます。汎用 Qwen Code CLI ワークフローの設定方法に関する詳細なガイドについては、[Qwen Code Assistant ワークフローのドキュメント](./common-workflow)を参照してください。

## 構成

### 入力

<!-- BEGIN_AUTOGEN_INPUTS -->

- <a name="__input_qwen_api_key"></a><a href="#user-content-__input_qwen_api_key"><code>qwen*api_key</code></a>: *(オプション)\_ Qwen API の API キー。

- <a name="__input_qwen_cli_version"></a><a href="#user-content-__input_qwen_cli_version"><code>qwen*cli_version</code></a>: *(オプション、デフォルト: `latest`)\_ インストールする Qwen Code CLI のバージョン。"latest"、"preview"、"nightly"、特定のバージョン番号、または git ブランチ、タグ、コミットを指定できます。詳細については、[Qwen Code CLI releases](https://github.com/QwenLM/qwen-code-action/blob/main/docs/releases.md) を参照してください。

- <a name="__input_qwen_debug"></a><a href="#user-content-__input_qwen_debug"><code>qwen*debug</code></a>: *(オプション)\_ デバッグログと出力ストリーミングを有効にします。

- <a name="__input_qwen_model"></a><a href="#user-content-__input_qwen_model"><code>qwen*model</code></a>: *(オプション)\_ Qwen Code で使用するモデル。

- <a name="__input_prompt"></a><a href="#user-content-__input_prompt"><code>prompt</code></a>: _(オプション、デフォルト: `You are a helpful assistant.`)_ Qwen Code CLI の [`--prompt` 引数](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#command-line-arguments) に渡される文字列。

- <a name="__input_settings"></a><a href="#user-content-__input_settings"><code>settings</code></a>: _(オプション)_ CLI の _プロジェクト_ 設定を構成するために `.qwen/settings.json` に書き込まれる JSON 文字列。
  詳細については、[設定ファイル](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#settings-files) のドキュメントを参照してください。

- <a name="__input_use_qwen_code_assist"></a><a href="#user-content-__input_use_qwen_code_assist"><code>use*qwen_code_assist</code></a>: *(オプション、デフォルト: `false`)\_ デフォルトの Qwen Code API キーの代わりに、Qwen Code モデルアクセスに Code Assist を使用するかどうか。
  詳細については、[Qwen Code CLI のドキュメント](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/authentication.md) を参照してください。

- <a name="__input_use_vertex_ai"></a><a href="#user-content-__input_use_vertex_ai"><code>use*vertex_ai</code></a>: *(オプション、デフォルト: `false`)\_ デフォルトの Qwen Code API キーの代わりに、Qwen Code モデルアクセスに Vertex AI を使用するかどうか。
  詳細については、[Qwen Code CLI のドキュメント](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/authentication.md) を参照してください。

- <a name="__input_extensions"></a><a href="#user-content-__input_extensions"><code>extensions</code></a>: _(オプション)_ インストールする Qwen Code CLI 拡張機能のリスト。

- <a name="__input_upload_artifacts"></a><a href="#user-content-__input_upload_artifacts"><code>upload*artifacts</code></a>: *(オプション、デフォルト: `false`)\_ アーティファクトを GitHub Action にアップロードするかどうか。

- <a name="__input_use_pnpm"></a><a href="#user-content-__input_use_pnpm"><code>use*pnpm</code></a>: *(オプション、デフォルト: `false`)\_ qwen-code-cli のインストールに npm の代わりに pnpm を使用するかどうか。

- <a name="__input_workflow_name"></a><a href="#user-content-__input_workflow_name"><code>workflow*name</code></a>: *(オプション、デフォルト: `${{ github.workflow }}`)\_ テレメトリ目的で使用される GitHub ワークフロー名。

<!-- END_AUTOGEN_INPUTS -->

### 出力

<!-- BEGIN_AUTOGEN_OUTPUTS -->

- <a name="__output_summary"></a><a href="#user-content-__output_summary"><code>summary</code></a>: Qwen Code CLI 実行からの要約された出力。

- <a name="__output_error"></a><a href="#user-content-__output_error"><code>error</code></a>: Qwen Code CLI 実行からのエラー出力（存在する場合）。

<!-- END_AUTOGEN_OUTPUTS -->

### リポジトリ変数

すべてのワークフローで再利用できるように、以下の値をリポジトリ変数として設定することをお勧めします。あるいは、個別のワークフローで Action の入力としてインラインで設定したり、リポジトリレベルの値をオーバーライドしたりすることもできます。

| Name               | Description                                               | Type     | Required | When Required             |
| ------------------ | --------------------------------------------------------- | -------- | -------- | ------------------------- |
| `DEBUG`            | Qwen Code CLI のデバッグログを有効にします。              | 変数     | いいえ   | なし                      |
| `QWEN_CLI_VERSION` | インストールされる Qwen Code CLI のバージョンを制御します。 | 変数     | いいえ   | CLI バージョンの固定      |
| `APP_ID`           | カスタム認証用の GitHub App ID。                          | 変数     | いいえ   | カスタム GitHub App の使用 |

リポジトリ変数を追加するには:

1. リポジトリの **Settings > Secrets and variables > Actions > New variable** に移動します。
2. 変数名と値を入力します。
3. 保存します。

リポジトリ変数の詳細については、[変数に関する GitHub ドキュメント][variables] を参照してください。

### シークレット

リポジトリに以下のシークレットを設定できます。

| Name              | Description                                   | Required | When Required                              |
| ----------------- | --------------------------------------------- | -------- | ------------------------------------------ |
| `QWEN_API_KEY`    | DashScope からの Qwen API キー。              | はい     | Qwen を呼び出すすべてのワークフローに必要。 |
| `APP_PRIVATE_KEY` | GitHub App の秘密鍵（PEM 形式）。             | いいえ   | カスタム GitHub App の使用。               |

シークレットを追加するには:

1. リポジトリの **Settings > Secrets and variables > Actions > New repository secret** に移動します。
2. シークレット名と値を入力します。
3. 保存します。

詳細については、[暗号化されたシークレットの作成と使用に関する公式 GitHub ドキュメント][secrets] を参照してください。

## 認証

この Action には GitHub API への認証が必要であり、オプションで Qwen Code サービスへの認証も必要です。

### GitHub 認証

GitHub への認証には 2 つの方法があります。

1. **デフォルトの `GITHUB_TOKEN`:** よりシンプルなユースケースでは、この Action はワークフローによって提供されるデフォルトの `GITHUB_TOKEN` を使用できます。
2. **カスタム GitHub App（推奨）:** 最も安全で柔軟な認証については、カスタム GitHub App の作成をお勧めします。

Qwen と GitHub の両方の認証の詳細な設定手順については、[**認証のドキュメント**](./configuration/auth) を参照してください。

## 拡張機能

Qwen Code CLI は、拡張機能を通じて追加の機能で拡張できます。
これらの拡張機能は、GitHub リポジトリからソースコードとしてインストールされます。

拡張機能の設定と構成方法の詳細な手順については、[拡張機能のドキュメント](./extension/introduction.md) を参照してください。

## ベストプラクティス

自動化されたワークフローのセキュリティ、信頼性、および効率を確保するために、ベストプラクティスに従うことを強くお勧めします。これらのガイドラインでは、リポジトリのセキュリティ、ワークフローの構成、モニタリングなどの重要な領域について説明しています。

主な推奨事項は次のとおりです。

- **リポジトリのセキュリティ:** ブランチとタグの保護を実装し、プルリクエストの承認者を制限します。
- **モニタリングと監査:** Action のログを定期的に確認し、OpenTelemetry を有効にして、パフォーマンスと動作に関するより深い洞察を得ます。

リポジトリとワークフローをセキュリティで保護するための包括的なガイドについては、[**ベストプラクティスのドキュメント**](./common-workflow) を参照してください。

## カスタマイズ

リポジトリのルートに `QWEN.md` ファイルを作成し、[Qwen Code CLI](./common-workflow) にプロジェクト固有のコンテキストと指示を提供します。これは、特定のコード規約、アーキテクチャパターン、またはモデルが特定のリポジトリで従うべきその他のガイドラインを定義するのに役立ちます。
## コントリビューション

コントリビューションを歓迎します！始め方について詳しくは、Qwen Code CLI の**コントリビューションガイド**をご覧ください。

[secrets]: https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions
[Qwen Code]: https://github.com/QwenLM/qwen-code
[DashScope]: https://dashscope.console.aliyun.com/apiKey
[Qwen Code CLI]: https://github.com/QwenLM/qwen-code-action/
[variables]: https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-variables#creating-configuration-variables-for-a-repository
[GitHub CLI]: https://docs.github.com/en/github-cli/github-cli
[QWEN.md]: https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#context-files-hierarchical-instructional-context