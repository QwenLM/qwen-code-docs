# Github Actions：qwen-code-action

## 概要

`qwen-code-action` は、[Qwen Code CLI] を介して開発ワークフローに [Qwen Code] を統合する GitHub Action です。これは、重要な日常的なコーディングタスクの自律エージェントとして機能するだけでなく、迅速に作業を委任できるオンデマンドのコラボレーターとしても機能します。

GitHub リポジトリ内で直接、[Qwen Code] を使用して会話形式（例：`@qwencoder fix this issue`）で GitHub プルリクエストのレビュー、問題のトリアージ、コード分析と修正などを実行するために使用します。

## 機能

- **自動化**: イベント（例：Issueの作成）やスケジュール（例：夜間実行）に基づいてワークフローをトリガーします。
- **オンデマンドコラボレーション**: Issueやプルリクエストのコメントで [Qwen Code CLI](./features/commands) をメンションしてワークフローをトリガーします（例：`@qwencoder /review`）。
- **ツールで拡張可能**: [Qwen Code](../developers/tools/introduction.md) モデルのツール呼び出し機能を活用し、[GitHub CLI]（`gh`）などの他のCLIとやり取りできます。
- **カスタマイズ可能**: リポジトリに `QWEN.md` ファイルを配置することで、プロジェクト固有の指示やコンテキストを [Qwen Code CLI](./features/commands) に提供できます。

## クイックスタート

数分でリポジトリ内で Qwen Code CLI を使い始めることができます：

### 1. Qwen APIキーの取得

[DashScope](https://help.aliyun.com/zh/model-studio/qwen-code)（アリババクラウドのAIプラットフォーム）からAPIキーを取得してください。

### 2. GitHubシークレットとして追加する

APIキーを `QWEN_API_KEY` という名前のシークレットとしてリポジトリに保存します：

- リポジトリの **Settings > Secrets and variables > Actions** に移動します
- **New repository secret** をクリックします
- Name: `QWEN_API_KEY`、Value: あなたのAPIキー

### 3. .gitignoreを更新する

以下のエントリを `.gitignore` ファイルに追加してください：

```gitignore

# qwen-code-cli 設定
.qwen/

# GitHub App 認証情報
gha-creds-*.json
```

### 4. ワークフローを選択する

ワークフローを設定するには2つのオプションがあります：

**オプションA: セットアップコマンドを使用する（推奨）**

1. ターミナルでQwen Code CLIを起動します：

   ```shell
   qwen
   ```

2. ターミナルのQwen Code CLIで以下を入力します：

   ```
   /setup-github
   ```

**オプションB: ワークフローを手動でコピーする**

1. 事前にビルドされたワークフローを [`examples/workflows`](./common-workflow) ディレクトリからリポジトリの `.github/workflows` ディレクトリにコピーします。注意：ワークフローを実行するトリガーとなる `qwen-dispatch.yml` ワークフローもコピーする必要があります。

### 5. 試してみる

**プルリクエストレビュー:**

- リポジトリでプルリクエストを開き、自動レビューを待つ
- 既存のプルリクエストにコメント `@qwencoder /review` を追加して、手動でレビューをトリガーする

**イシューのトリアージ:**

- イシューを開き、自動トリアージを待つ
- 既存のイシューにコメント `@qwencoder /triage` を追加して、手動でトリアージをトリガーする

**一般的なAIアシスタント機能:**

- 任意のイシューまたはプルリクエストで、`@qwencoder` をメンションし、続けてリクエスト内容を記述する
- 例:
  - `@qwencoder explain this code change`
  - `@qwencoder suggest improvements for this function`
  - `@qwencoder help me debug this error`
  - `@qwencoder write unit tests for this component`

## ワークフロー

このアクションは、さまざまなユースケースに対応した複数の事前構築済みワークフローを提供します。各ワークフローは、リポジトリの `.github/workflows` ディレクトリにコピーし、必要に応じてカスタマイズできるように設計されています。

### Qwen Code ディスパッチ

このワークフローは、Qwen Code CLI の中央ディスパッチャーとして機能し、トリガーイベントとコメント内のコマンドに基づいて適切なワークフローにリクエストをルーティングします。ディスパッチワークフローの設定方法に関する詳細ガイドについては、[Qwen Code ディスパッチワークフローのドキュメント](./common-workflow) を参照してください。

### Issue トリアージ

このアクションは、GitHub Issues を自動的にまたはスケジュールに従ってトリアージするために使用できます。Issue トリアージシステムの設定方法に関する詳細ガイドについては、[GitHub Issue トリアージワークフローのドキュメント](./examples/workflows/issue-triage) を参照してください。

### Pull Request レビュー

このアクションは、プルリクエストがオープンされた際に自動的にレビューを行うために使用できます。プルリクエストレビューシステムの設定方法に関する詳細ガイドについては、[GitHub PR レビュー ワークフローのドキュメント](./common-workflow) を参照してください。

### Qwen Code CLI アシスタント

このタイプのアクションは、プルリクエストやイシュー内で汎用的な会話型 Qwen Code AI アシスタントを呼び出すために使用でき、幅広いタスクを実行できます。汎用的な Qwen Code CLI ワークフローの設定方法について詳しくは、[Qwen Code アシスタント ワークフローのドキュメント](./common-workflow) を参照してください。

## 設定

### 入力

<!-- BEGIN_AUTOGEN_INPUTS -->

- <a name="__input_qwen_api_key"></a><a href="#user-content-__input_qwen_api_key"><code>qwen*api_key</code></a>: *(任意)\_ Qwen API の API キー。

- <a name="__input_qwen_cli_version"></a><a href="#user-content-__input_qwen_cli_version"><code>qwen*cli_version</code></a>: *(任意、デフォルト: `latest`)\_ インストールする Qwen Code CLI のバージョン。"latest"、"preview"、"nightly"、特定のバージョン番号、または Git のブランチ、タグ、コミットを指定できます。詳細については、[Qwen Code CLI リリース](https://github.com/QwenLM/qwen-code-action/blob/main/docs/releases.md) を参照してください。

- <a name="__input_qwen_debug"></a><a href="#user-content-__input_qwen_debug"><code>qwen*debug</code></a>: *(任意)\_ デバッグログと出力ストリーミングを有効にします。

- <a name="__input_qwen_model"></a><a href="#user-content-__input_qwen_model"><code>qwen*model</code></a>: *(任意)\_ Qwen Code で使用するモデル。

- <a name="__input_prompt"></a><a href="#user-content-__input_prompt"><code>prompt</code></a>: _(任意、デフォルト: `You are a helpful assistant.`)_ Qwen Code CLI の [`--prompt` 引数](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#command-line-arguments) に渡される文字列。

- <a name="__input_settings"></a><a href="#user-content-__input_settings"><code>settings</code></a>: _(任意)_ CLI の _プロジェクト_ 設定を構成するために `.qwen/settings.json` に書き込まれる JSON 文字列。
  詳細については、[設定ファイル](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#settings-files) のドキュメントを参照してください。

- <a name="__input_use_qwen_code_assist"></a><a href="#user-content-__input_use_qwen_code_assist"><code>use*qwen_code_assist</code></a>: *(任意、デフォルト: `false`)\_ デフォルトの Qwen Code API キーの代わりに Code Assist を使用して Qwen Code モデルにアクセスするかどうか。
  詳細については、[Qwen Code CLI ドキュメント](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/authentication.md) を参照してください。

- <a name="__input_use_vertex_ai"></a><a href="#user-content-__input_use_vertex_ai"><code>use*vertex_ai</code></a>: *(任意、デフォルト: `false`)\_ デフォルトの Qwen Code API キーの代わりに Vertex AI を使用して Qwen Code モデルにアクセスするかどうか。
  詳細については、[Qwen Code CLI ドキュメント](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/authentication.md) を参照してください。

- <a name="__input_extensions"></a><a href="#user-content-__input_extensions"><code>extensions</code></a>: _(任意)_ インストールする Qwen Code CLI 拡張機能のリスト。

- <a name="__input_upload_artifacts"></a><a href="#user-content-__input_upload_artifacts"><code>upload*artifacts</code></a>: *(任意、デフォルト: `false`)\_ 成果物を GitHub Actions にアップロードするかどうか。

- <a name="__input_use_pnpm"></a><a href="#user-content-__input_use_pnpm"><code>use*pnpm</code></a>: *(任意、デフォルト: `false`)\_ qwen-code-cli をインストールする際に npm の代わりに pnpm を使用するかどうか。

- <a name="__input_workflow_name"></a><a href="#user-content-__input_workflow_name"><code>workflow*name</code></a>: *(任意、デフォルト: `${{ github.workflow }}`)\_ テレメトリ目的で使用される GitHub ワークフロー名。

<!-- END_AUTOGEN_INPUTS -->

### 出力

<!-- BEGIN_AUTOGEN_OUTPUTS -->

- <a name="__output_summary"></a><a href="#user-content-__output_summary"><code>summary</code></a>: Qwen Code CLI 実行からの要約出力。

- <a name="__output_error"></a><a href="#user-content-__output_error"><code>error</code></a>: Qwen Code CLI 実行からのエラー出力（ある場合）。

<!-- END_AUTOGEN_OUTPUTS -->

### リポジトリ変数

以下の値をリポジトリ変数として設定することを推奨します。これにより、すべてのワークフローで再利用できます。または、個々のワークフロー内でアクションの入力としてインラインで設定するか、リポジトリレベルの値を上書きするために使用することもできます。

| 名前               | 説明                                                       | タイプ   | 必須 | 必須となる条件             |
| ------------------ | ---------------------------------------------------------- | -------- | ---- | -------------------------- |
| `DEBUG`            | Qwen Code CLI のデバッグログを有効にします。                | 変数     | いいえ | 常に不要                   |
| `QWEN_CLI_VERSION` | インストールされる Qwen Code CLI のバージョンを制御します。 | 変数     | いいえ | CLI バージョンの固定時     |
| `APP_ID`           | カスタム認証用の GitHub App ID。                           | 変数     | いいえ | カスタム GitHub App 使用時 |

リポジトリ変数を追加するには：

1. リポジトリの **Settings > Secrets and variables > Actions > New variable** に移動します。
2. 変数名と値を入力します。
3. 保存します。

リポジトリ変数の詳細については、[変数に関する GitHub ドキュメント][variables] を参照してください。

[variables]: https://docs.github.com/en/actions/learn-github-actions/variables

### シークレット

リポジトリに以下のシークレットを設定できます：

| 名前              | 説明                                         | 必須 | 必須となるタイミング                          |
| ----------------- | -------------------------------------------- | ---- | -------------------------------------------- |
| `QWEN_API_KEY`    | DashScope から取得した Qwen API キー。        | はい | Qwen を呼び出すすべてのワークフローで必要。 |
| `APP_PRIVATE_KEY` | GitHub App の秘密鍵（PEM 形式）。            | いいえ | カスタム GitHub App を使用する場合。         |

シークレットを追加するには：

1. リポジトリの **Settings > Secrets and variables > Actions > New repository secret** に移動します。
2. シークレット名と値を入力します。
3. 保存します。

詳しくは、[暗号化されたシークレットの作成と利用に関する公式 GitHub ドキュメント][secrets]をご参照ください。

## 認証

このアクションでは、GitHub API への認証、およびオプションで Qwen Code サービスへの認証が必要です。

### GitHub 認証

GitHub への認証には以下の 2 つの方法があります。

1. **デフォルトの `GITHUB_TOKEN`:** よりシンプルなユースケースでは、ワークフローによって提供されるデフォルトの `GITHUB_TOKEN` を使用できます。
2. **カスタム GitHub App（推奨）:** 最も安全で柔軟な認証を行うために、カスタム GitHub App の作成を推奨します。

Qwen および GitHub 認証の詳細なセットアップ手順については、  
[**認証ドキュメント**](./configuration/auth) を参照してください。

## 拡張機能

Qwen Code CLI は、拡張機能を通じて追加の機能で拡張できます。  
これらの拡張機能は、GitHub リポジトリからソースコードをインストールして利用します。

拡張機能のセットアップと設定方法の詳細については、  
[拡張機能ドキュメント](../developers/extensions/extension) を参照してください。

## ベストプラクティス

自動化ワークフローのセキュリティ、信頼性、効率を確保するために、ベストプラクティスに従うことを強く推奨します。これらのガイドラインは、リポジトリのセキュリティ、ワークフロー設定、モニタリングなどの主要分野をカバーしています。

主な推奨事項：

- **リポジトリの保護：** ブランチとタグの保護を実装し、プルリクエストの承認者を制限する。
- **モニタリングと監査：** アクションログを定期的に確認し、パフォーマンスと動作の詳細なインサイトを得るためにOpenTelemetryを有効にする。

リポジトリとワークフローを保護する包括的なガイドについては、[**ベストプラクティスドキュメント**](./common-workflow)をご参照ください。

## カスタマイズ

プロジェクト固有のコンテキストと指示を[Qwen Code CLI](./common-workflow)に提供するために、リポジトリのルートにQWEN.mdファイルを作成してください。これは、コーディング規約、アーキテクチャパターン、または特定のリポジトリでモデルが従うべきその他のガイドラインを定義するのに役立ちます。

## コントリビューションについて

コントリビューションを歓迎します！詳しくは Qwen Code CLI の「**コントリビューションガイド**」をご確認ください。スタート方法についてはこちらをご覧ください。

[secrets]: https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions
[Qwen Code]: https://github.com/QwenLM/qwen-code
[DashScope]: https://dashscope.console.aliyun.com/apiKey
[Qwen Code CLI]: https://github.com/QwenLM/qwen-code-action/
[variables]: https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-variables#creating-configuration-variables-for-a-repository
[GitHub CLI]: https://docs.github.com/en/github-cli/github-cli
[QWEN.md]: https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#context-files-hierarchical-instructional-context