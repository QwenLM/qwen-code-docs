# Github Actions：qwen-code-action

## 概要

`qwen-code-action` は、[Qwen Code CLI] を介して [Qwen Code] を開発ワークフローに統合する GitHub Action です。日常的なコーディングタスクのための自律エージェントとして動作するとともに、必要なときに作業を迅速に委任できるオンデマンドのコラボレーターとしても機能します。

これを使用して、GitHub リポジトリ内で [Qwen Code] と会話形式で（例：`@qwencoder fix this issue`）プルリクエストレビュー、Issue のトリアージ、コード分析や修正などを行うことができます。

## 機能

- **自動化**: イベント（例：Issue のオープン）やスケジュール（例：毎晩）に基づいてワークフローをトリガーします。
- **オンデマンドコラボレーション**: Issue やプルリクエストのコメントで [Qwen Code CLI](./features/commands) をメンション（例：`@qwencoder /review`）することでワークフローをトリガーします。
- **ツールで拡張可能**: [Qwen Code](../developers/tools/introduction.md) モデルのツール呼び出し機能を活用して、[GitHub CLI] (`gh`) などの他の CLI と連携できます。
- **カスタマイズ可能**: リポジトリ内の `QWEN.md` ファイルを使用して、[Qwen Code CLI](./features/commands) にプロジェクト固有の指示やコンテキストを提供できます。

## クイックスタート

わずか数分でリポジトリに Qwen Code CLI を導入できます。

### 1. Qwen API キーを取得する

[DashScope](https://help.aliyun.com/zh/model-studio/qwen-code)（Alibaba Cloud の AI プラットフォーム）から API キーを取得します。

### 2. GitHub Secrets に追加する

API キーを `QWEN_API_KEY` という名前の Secret としてリポジトリに保存します。

- リポジトリの **Settings > Secrets and variables > Actions** に移動します。
- **New repository secret** をクリックします。
- Name: `QWEN_API_KEY`、Value: ご自身の API キーを入力します。

### 3. .gitignore を更新する

`.gitignore` ファイルに以下のエントリを追加します。

```gitignore
# qwen-code-cli settings
.qwen/

# GitHub App credentials
gha-creds-*.json
```

### 4. ワークフローを選択する

ワークフローをセットアップするには、2つのオプションがあります。

**オプション A: セットアップコマンドを使用 (推奨)**

1. ターミナルで Qwen Code CLI を起動します。

   ```shell
   qwen
   ```

2. ターミナルの Qwen Code CLI で、次のように入力します。

   ```
   /setup-github
   ```

**オプション B: 手動でワークフローをコピーする**

1. [`examples/workflows`](./common-workflow) ディレクトリから、リポジトリの `.github/workflows` ディレクトリにビルド済みワークフローをコピーします。 注: `qwen-dispatch.yml` ワークフローも必ずコピーしてください。これがワークフローを実行するトリガーとなります。

### 5. 試してみる

**プルリクエストレビュー:**

- リポジトリでプルリクエストを開き、自動レビューを待ちます。
- 既存のプルリクエストに `@qwencoder /review` とコメントして、手動でレビューをトリガーします。

**Issue のトリアージ:**

- Issue を開き、自動トリアージを待ちます。
- 既存の Issue に `@qwencoder /triage` とコメントして、手動でトリアージをトリガーします。

**一般的な AI アシスタンス:**

- Issue またはプルリクエストで、`@qwencoder` に続けてリクエストを入力します。
- 例:
  - `@qwencoder explain this code change`
  - `@qwencoder suggest improvements for this function`
  - `@qwencoder help me debug this error`
  - `@qwencoder write unit tests for this component`

## ワークフロー

このアクションは、さまざまなユースケースに対応するビルド済みワークフローを提供します。各ワークフローは、リポジトリの `.github/workflows` ディレクトリにコピーし、必要に応じてカスタマイズできるように設計されています。

### Qwen Code Dispatch

このワークフローは Qwen Code CLI の中央ディスパッチャーとして機能し、トリガーイベントとコメントで指定されたコマンドに基づいて、適切なワークフローにリクエストをルーティングします。ディスパッチワークフローのセットアップ方法の詳細なガイドについては、[Qwen Code Dispatch ワークフロードキュメント](./common-workflow) を参照してください。

### Issue トリアージ

このアクションは、GitHub Issues を自動的、またはスケジュールに従ってトリアージするために使用できます。動作する Issue トリアージのセットアップ例については、[自動 Issue トリアージワークフロー](https://github.com/QwenLM/qwen-code/blob/main/.github/workflows/qwen-automated-issue-triage.yml) を参照してください。

### プルリクエストレビュー

このアクションは、プルリクエストがオープンされたときに自動的にレビューするために使用できます。プルリクエストレビューシステムのセットアップ方法の詳細なガイドについては、[GitHub PR レビューワークフロードキュメント](./common-workflow) を参照してください。

### Qwen Code CLI アシスタント

このタイプのアクションは、プルリクエストや Issue 内で汎用的な会話型の Qwen Code AI アシスタントを呼び出し、さまざまなタスクを実行するために使用できます。汎用 Qwen Code CLI ワークフローのセットアップ方法の詳細なガイドについては、[Qwen Code アシスタントワークフロードキュメント](./common-workflow) を参照してください。

## 設定

### 入力

<!-- BEGIN_AUTOGEN_INPUTS -->

- <a name="__input_qwen_api_key"></a><a href="#user-content-__input_qwen_api_key"><code>qwen*api_key</code></a>: *(任意)\_ Qwen API の API キー。

- <a name="__input_qwen_cli_version"></a><a href="#user-content-__input_qwen_cli_version"><code>qwen*cli_version</code></a>: *(任意、デフォルト: `latest`)\_ インストールする Qwen Code CLI のバージョン。"latest"、"preview"、"nightly"、特定のバージョン番号、または git ブランチ、タグ、コミットを指定できます。詳細については、[Qwen Code CLI リリース](https://github.com/QwenLM/qwen-code-action/blob/main/docs/releases.md) を参照してください。

- <a name="__input_qwen_debug"></a><a href="#user-content-__input_qwen_debug"><code>qwen*debug</code></a>: *(任意)\_ デバッグログと出力ストリーミングを有効にします。

- <a name="__input_qwen_model"></a><a href="#user-content-__input_qwen_model"><code>qwen*model</code></a>: *(任意)\_ Qwen Code で使用するモデル。

- <a name="__input_prompt"></a><a href="#user-content-__input_prompt"><code>prompt</code></a>: _(任意、デフォルト: `You are a helpful assistant.`)_ Qwen Code CLI の [`--prompt` 引数](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#command-line-arguments) に渡される文字列。

- <a name="__input_settings"></a><a href="#user-content-__input_settings"><code>settings</code></a>: _(任意)_ CLI の*プロジェクト*設定を構成するために `.qwen/settings.json` に書き込まれる JSON 文字列。
  詳細については、[設定ファイルに関するドキュメント](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#settings-files) を参照してください。

- <a name="__input_use_qwen_code_assist"></a><a href="#user-content-__input_use_qwen_code_assist"><code>use*qwen_code_assist</code></a>: *(任意、デフォルト: `false`)\_ デフォルトの Qwen Code API キーの代わりに Code Assist を使用して Qwen Code モデルにアクセスするかどうか。
  詳細については、[Qwen Code CLI ドキュメント](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/authentication.md) を参照してください。

- <a name="__input_use_vertex_ai"></a><a href="#user-content-__input_use_vertex_ai"><code>use*vertex_ai</code></a>: *(任意、デフォルト: `false`)\_ デフォルトの Qwen Code API キーの代わりに Vertex AI を使用して Qwen Code モデルにアクセスするかどうか。
  詳細については、[Qwen Code CLI ドキュメント](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/authentication.md) を参照してください。

- <a name="__input_extensions"></a><a href="#user-content-__input_extensions"><code>extensions</code></a>: _(任意)_ インストールする Qwen Code CLI 拡張機能のリスト。

- <a name="__input_upload_artifacts"></a><a href="#user-content-__input_upload_artifacts"><code>upload*artifacts</code></a>: *(任意、デフォルト: `false`)\_ アーティファクトを GitHub Action にアップロードするかどうか。

- <a name="__input_use_pnpm"></a><a href="#user-content-__input_use_pnpm"><code>use*pnpm</code></a>: *(任意、デフォルト: `false`)\_ qwen-code-cli のインストールに npm の代わりに pnpm を使用するかどうか。

- <a name="__input_workflow_name"></a><a href="#user-content-__input_workflow_name"><code>workflow*name</code></a>: *(任意、デフォルト: `${{ github.workflow }}`)\_ テレメトリー目的で使用される GitHub ワークフロー名。

<!-- END_AUTOGEN_INPUTS -->

### 出力

<!-- BEGIN_AUTOGEN_OUTPUTS -->

- <a name="__output_summary"></a><a href="#user-content-__output_summary"><code>summary</code></a>: Qwen Code CLI 実行からの要約出力。

- <a name="__output_error"></a><a href="#user-content-__output_error"><code>error</code></a>: Qwen Code CLI 実行からのエラー出力（存在する場合）。

<!-- END_AUTOGEN_OUTPUTS -->

### リポジトリ変数

以下の値はリポジトリ変数として設定し、すべてのワークフローで再利用することを推奨します。または、個々のワークフローでアクション入力としてインラインで設定したり、リポジトリレベルの値を上書きすることもできます。

| 名前               | 説明                                              | タイプ   | 必須 | 必要な場合               |
| ------------------ | ------------------------------------------------- | -------- | ---- | ------------------------ |
| `DEBUG`            | Qwen Code CLI のデバッグログを有効にします。        | 変数     | いいえ | なし                     |
| `QWEN_CLI_VERSION` | インストールする Qwen Code CLI のバージョンを制御します。 | 変数     | いいえ | CLI バージョンを固定する場合 |
| `APP_ID`           | カスタム認証用の GitHub App ID。                     | 変数     | いいえ | カスタム GitHub App を使用する場合 |

リポジトリ変数を追加するには：

1. リポジトリの **Settings > Secrets and variables > Actions > New variable** に移動します。
2. 変数名と値を入力します。
3. 保存します。

リポジトリ変数の詳細については、[GitHub の変数に関するドキュメント][variables] を参照してください。

### Secrets

以下の Secrets をリポジトリに設定できます。

| 名前              | 説明                                          | 必須   | 必要な場合                                |
| ----------------- | --------------------------------------------- | ------ | ----------------------------------------- |
| `QWEN_API_KEY`    | DashScope からの Qwen API キー。               | はい    | Qwen を呼び出すすべてのワークフローで必須。 |
| `APP_PRIVATE_KEY` | GitHub App の秘密鍵（PEM 形式）。               | いいえ | カスタム GitHub App を使用する場合。        |

Secret を追加するには：

1. リポジトリの **Settings > Secrets and variables > Actions > New repository secret** に移動します。
2. Secret 名と値を入力します。
3. 保存します。

詳細については、[暗号化された Secrets の作成と使用に関する公式 GitHub ドキュメント][secrets] を参照してください。

## 認証

このアクションは、GitHub API と、オプションで Qwen Code サービスへの認証を必要とします。

### GitHub 認証

GitHub への認証方法は 2 つあります。

1. **デフォルトの `GITHUB_TOKEN`:** よりシンプルなユースケースでは、ワークフローが提供するデフォルトの `GITHUB_TOKEN` を使用できます。
2. **カスタム GitHub App (推奨):** 最も安全で柔軟な認証のために、カスタム GitHub App を作成することを推奨します。

Qwen 認証と GitHub 認証の両方の詳細なセットアップ手順については、[**認証ドキュメント**](./configuration/auth) を参照してください。

## 拡張機能

Qwen Code CLI は、拡張機能を通じて追加機能で拡張できます。これらの拡張機能は、それぞれの GitHub リポジトリからソースコードとしてインストールされます。

拡張機能のセットアップと設定方法の詳細については、[拡張機能ドキュメント](./extension/introduction.md) を参照してください。

## ベストプラクティス

自動ワークフローのセキュリティ、信頼性、効率性を確保するために、ベストプラクティスに従うことを強く推奨します。これらのガイドラインは、リポジトリのセキュリティ、ワークフロー構成、監視などの主要な領域をカバーしています。

主な推奨事項：

- **リポジトリの保護:** ブランチ保護とタグ保護の実装、プルリクエスト承認者の制限。
- **監視と監査:** アクションログの定期的な確認、OpenTelemetry の有効化によるパフォーマンスと動作の詳細な分析。

リポジトリとワークフローを保護するための包括的なガイドについては、[**ベストプラクティスドキュメント**](./common-workflow) を参照してください。

## カスタマイズ

リポジトリのルートに `QWEN.md` ファイルを作成して、[Qwen Code CLI](./common-workflow) にプロジェクト固有のコンテキストと指示を提供します。これは、特定のリポジトリに対してモデルが従うべきコーディング規約、アーキテクチャパターン、その他のガイドラインを定義するのに便利です。

## コントリビューション

コントリビューションを歓迎します！ 始め方の詳細については、Qwen Code CLI の **コントリビューションガイド** を参照してください。

[secrets]: https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions
[Qwen Code]: https://github.com/QwenLM/qwen-code
[DashScope]: https://dashscope.console.aliyun.com/apiKey
[Qwen Code CLI]: https://github.com/QwenLM/qwen-code-action/
[variables]: https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-variables#creating-configuration-variables-for-a-repository
[GitHub CLI]: https://docs.github.com/en/github-cli/github-cli
[QWEN.md]: https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#context-files-hierarchical-instructional-context