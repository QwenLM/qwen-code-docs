# GitHub Actions：qwen-code-action

## 概要

`qwen-code-action` は、[Qwen Code CLI] を通じて [Qwen Code] を開発ワークフローに統合する GitHub アクションです。これは、重要な日常的なコーディングタスクを自律的に実行するエージェントとしても機能し、また必要に応じて素早く作業を委任できるコラボレーターとしても機能します。

GitHub のプルリクエストレビュー、課題のトリアージ、コード解析および修正などの作業を、[Qwen Code] を会話形式で（例：`@qwencoder この課題を修正してください`）直接 GitHub リポジトリ内で実行するためにご利用ください。

## 機能

- **自動化**: イベント（例：イシューの作成）やスケジュール（例：毎晩実行）に基づいてワークフローを起動します。
- **オンデマンドなコラボレーション**: イシューおよびプルリクエストのコメント内で [Qwen Code CLI](./features/commands) をメンションすることでワークフローを起動します（例：`@qwencoder /review`）。
- **ツールによる拡張性**: [Qwen Code](../developers/tools/introduction.md) モデルのツール呼び出し機能を活用し、[GitHub CLI] (`gh`) などの他の CLI と連携できます。
- **カスタマイズ可能**: リポジトリ内に `QWEN.md` ファイルを作成して、プロジェクト固有の指示やコンテキストを [Qwen Code CLI](./features/commands) に提供できます。

## クイックスタート

数分で、お使いのリポジトリにて Qwen Code CLI を始められます。

### 1. Qwen API キーを取得する

API キーは Alibaba Cloud の AI プラットフォームである [DashScope](https://help.aliyun.com/zh/model-studio/qwen-code) から取得してください。

### 2. GitHub シークレットとして追加

API キーを `QWEN_API_KEY` という名前のシークレットとしてリポジトリに保存します。

- リポジトリの **Settings > Secrets and variables > Actions** に移動
- **New repository secret** をクリック
- Name（名前）: `QWEN_API_KEY`、Value（値）: ご自分の API キー

### 3. `.gitignore` を更新

`.gitignore` ファイルに以下のエントリを追加します。

```gitignore

# qwen-code-cli の設定
.qwen/

# GitHub App の認証情報
gha-creds-*.json
```

### 4. ワークフローを選択

ワークフローをセットアップするには、以下の 2 つのオプションがあります。

**オプション A: setup コマンドを使用（推奨）**

1. ターミナルで Qwen Code CLI を起動します。

   ```shell
   qwen
   ```

2. ターミナル内の Qwen Code CLI で以下を入力します。

   ```
   /setup-github
   ```

**オプション B: ワークフローを手動でコピー**

1. [`examples/workflows`](./common-workflow) ディレクトリから事前に作成済みのワークフローを、リポジトリの `.github/workflows` ディレクトリにコピーします。  
   ※ `qwen-dispatch.yml` ワークフローも必ずコピーしてください。これは他のワークフローを実行するためのトリガーとなります。

### 5. 動作確認

**プルリクエストのレビュー:**

- リポジトリでプルリクエストを開き、自動レビューを待つ
- 既存のプルリクエストに `@qwencoder /review` とコメントして、手動でレビューを実行する

**イシュートリアージ:**

- イシューを開き、自動トリアージを待つ
- 既存のイシューに `@qwencoder /triage` とコメントして、手動でトリアージを実行する

**一般的な AI アシスタンス:**

- 任意のイシューまたはプルリクエスト内で、`@qwencoder` をメンションし、その後にリクエストを記述する
- 例:
  - `@qwencoder このコード変更を説明してください`
  - `@qwencoder この関数の改善案を提案してください`
  - `@qwencoder このエラーのデバッグを手伝ってください`
  - `@qwencoder このコンポーネントのユニットテストを書いてください`

## ワークフロー

このアクションでは、さまざまなユースケース向けに事前に構築された複数のワークフローが提供されています。各ワークフローは、リポジトリの `.github/workflows` ディレクトリにコピーし、必要に応じてカスタマイズできるよう設計されています。

### Qwen Code Dispatch

このワークフローは、Qwen Code CLI の中央ディスパッチャーとして機能し、トリガーイベントおよびコメント内のコマンドに応じて、適切なワークフローへリクエストをルーティングします。Dispatch ワークフローのセットアップ方法については、[Qwen Code Dispatch ワークフローのドキュメント](./common-workflow) を参照してください。

### Issue トリアージ

このアクションは、GitHub Issue を自動的または定期的にトリアージするために使用できます。Issue トリアージシステムのセットアップ方法については、[GitHub Issue トリアージ ワークフローのドキュメント](./examples/workflows/issue-triage) を参照してください。

### プルリクエストのレビュー

このアクションは、プルリクエストが作成された際に自動でレビューを行うために使用できます。プルリクエストレビュー機能のセットアップ方法については、[GitHub PR レビュー ワークフローのドキュメント](./common-workflow) を参照してください。

### Qwen Code CLI アシスタント

このタイプのアクションは、プルリクエストおよびイシューコンテキスト内で汎用的な対話型 Qwen Code AI アシスタントを呼び出し、幅広いタスクを実行するために使用できます。汎用 Qwen Code CLI ワークフローのセットアップ方法については、[Qwen Code アシスタント ワークフローのドキュメント](./common-workflow) を参照してください。

## 設定

### 入力

<!-- BEGIN_AUTOGEN_INPUTS -->

- <a name="__input_qwen_api_key"></a><a href="#user-content-__input_qwen_api_key"><code>qwen*api_key</code></a>: （任意）Qwen API 用の API キー。

- <a name="__input_qwen_cli_version"></a><a href="#user-content-__input_qwen_cli_version"><code>qwen*cli_version</code></a>: （任意、デフォルト: `latest`）インストールする Qwen Code CLI のバージョン。`latest`、`preview`、`nightly`、特定のバージョン番号、または Git ブランチ／タグ／コミットを指定できます。詳細については、[Qwen Code CLI のリリース情報](https://github.com/QwenLM/qwen-code-action/blob/main/docs/releases.md) を参照してください。

- <a name="__input_qwen_debug"></a><a href="#user-content-__input_qwen_debug"><code>qwen*debug</code></a>: （任意）デバッグログと出力ストリーミングを有効化します。

- <a name="__input_qwen_model"></a><a href="#user-content-__input_qwen_model"><code>qwen*model</code></a>: （任意）Qwen Code で使用するモデル。

- <a name="__input_prompt"></a><a href="#user-content-__input_prompt"><code>prompt</code></a>: （任意、デフォルト: `You are a helpful assistant.`）Qwen Code CLI の [`--prompt` 引数](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#command-line-arguments) に渡される文字列。

- <a name="__input_settings"></a><a href="#user-content-__input_settings"><code>settings</code></a>: （任意）CLI の _プロジェクト_ 設定を構成するために `.qwen/settings.json` に書き込まれる JSON 文字列。  
  詳細については、[設定ファイルに関するドキュメント](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#settings-files) を参照してください。

- <a name="__input_use_qwen_code_assist"></a><a href="#user-content-__input_use_qwen_code_assist"><code>use*qwen_code_assist</code></a>: （任意、デフォルト: `false`）Qwen Code モデルへのアクセスに、デフォルトの Qwen Code API キーではなく Code Assist を使用するかどうか。  
  詳細については、[Qwen Code CLI のドキュメント](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/authentication.md) を参照してください。

- <a name="__input_use_vertex_ai"></a><a href="#user-content-__input_use_vertex_ai"><code>use*vertex_ai</code></a>: （任意、デフォルト: `false`）Qwen Code モデルへのアクセスに、デフォルトの Qwen Code API キーではなく Vertex AI を使用するかどうか。  
  詳細については、[Qwen Code CLI のドキュメント](https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/authentication.md) を参照してください。

- <a name="__input_extensions"></a><a href="#user-content-__input_extensions"><code>extensions</code></a>: （任意）インストールする Qwen Code CLI 拡張機能のリスト。

- <a name="__input_upload_artifacts"></a><a href="#user-content-__input_upload_artifacts"><code>upload*artifacts</code></a>: （任意、デフォルト: `false`）アーティファクトを GitHub アクションにアップロードするかどうか。

- <a name="__input_use_pnpm"></a><a href="#user-content-__input_use_pnpm"><code>use*pnpm</code></a>: （任意、デフォルト: `false`）`qwen-code-cli` のインストールに npm の代わりに pnpm を使用するかどうか。

- <a name="__input_workflow_name"></a><a href="#user-content-__input_workflow_name"><code>workflow*name</code></a>: （任意、デフォルト: `${{ github.workflow }}`）テレメトリ目的で使用される GitHub ワークフロー名。

<!-- END_AUTOGEN_INPUTS -->

### 出力

<!-- BEGIN_AUTOGEN_OUTPUTS -->

- <a name="__output_summary"></a><a href="#user-content-__output_summary"><code>summary</code></a>: Qwen Code CLI 実行による要約出力。

- <a name="__output_error"></a><a href="#user-content-__output_error"><code>error</code></a>: Qwen Code CLI 実行によるエラー出力（存在する場合）。

<!-- END_AUTOGEN_OUTPUTS -->

### リポジトリ変数

以下の値をリポジトリ変数として設定することを推奨します。これにより、すべてのワークフローで再利用可能になります。また、個別のワークフロー内でアクションの入力として直接設定したり、リポジトリレベルの値を上書きするために使用することもできます。

| 名前               | 説明                                                       | タイプ     | 必須   | 必須となる条件             |
| ------------------ | ---------------------------------------------------------- | -------- | ------ | -------------------------- |
| `DEBUG`            | Qwen Code CLI のデバッグログを有効化します。                | 変数     | いいえ | いつでも不要               |
| `QWEN_CLI_VERSION` | インストールする Qwen Code CLI のバージョンを制御します。    | 変数     | いいえ | CLI のバージョンを固定する場合 |
| `APP_ID`           | カスタム認証用の GitHub App ID です。                        | 変数     | いいえ | カスタム GitHub App を使用する場合 |

リポジトリ変数を追加するには：

1. リポジトリの **[Settings] > [Secrets and variables] > [Actions] > [New variable]** に移動します。
2. 変数名と値を入力します。
3. 保存します。

リポジトリ変数の詳細については、[GitHub の変数に関するドキュメント][variables] を参照してください。

### シークレット

以下のシークレットをリポジトリに設定できます。

| 名前              | 説明                                           | 必須   | 必須となる条件                             |
| ----------------- | ---------------------------------------------- | ------ | ------------------------------------------ |
| `QWEN_API_KEY`    | DashScope から取得した Qwen の API キーです。 | はい   | Qwen を呼び出すすべてのワークフローで必須。 |
| `APP_PRIVATE_KEY` | GitHub App の秘密鍵 (PEM 形式)。               | いいえ | カスタムの GitHub App を使用する場合。      |

シークレットを追加するには：

1. リポジトリの **Settings > Secrets and variables > Actions > New repository secret** に移動します。
2. シークレットの名前と値を入力します。
3. 保存します。

詳細については、[暗号化されたシークレットの作成と使用に関する公式 GitHub ドキュメント][secrets] を参照してください。

## 認証

このアクションでは、GitHub API への認証が必要であり、オプションで Qwen Code サービスへの認証も必要です。

### GitHub 認証

GitHub への認証は、以下の 2 つの方法で行えます。

1. **デフォルトの `GITHUB_TOKEN`:** よりシンプルな利用ケースでは、ワークフローが提供するデフォルトの `GITHUB_TOKEN` をアクションで使用できます。
2. **カスタム GitHub App（推奨）:** 最も安全かつ柔軟な認証を行うには、カスタムの GitHub App を作成することを推奨します。

Qwen および GitHub の両方の認証に関する詳細なセットアップ手順については、[**認証ドキュメント**](./configuration/auth) を参照してください。

## 拡張機能

Qwen Code CLI は、拡張機能を用いて追加の機能を実装できます。これらの拡張機能は、GitHub リポジトリからソースコードを直接インストールして使用します。

拡張機能のセットアップおよび設定に関する詳細な手順については、[拡張機能ドキュメント](../developers/extensions/extension) を参照してください。

## 最適な実践方法

自動化されたワークフローのセキュリティ、信頼性、および効率性を確保するため、当社が推奨する最適な実践方法に従うことを強くお勧めします。これらのガイドラインは、リポジトリのセキュリティ、ワークフローの設定、モニタリングといった主要な領域をカバーしています。

主な推奨事項は以下のとおりです：

- **リポジトリのセキュリティ強化**：ブランチおよびタグの保護を実装し、プルリクエストの承認者を制限する。
- **モニタリングと監査**：アクションログを定期的に確認し、OpenTelemetry を有効化してパフォーマンスや動作に関する詳細なインサイトを得る。

リポジトリおよびワークフローのセキュリティ強化について包括的なガイドが必要な場合は、[**最適な実践方法のドキュメント**](./common-workflow) を参照してください。

## カスタマイズ

プロジェクト固有のコンテキストおよび指示を [Qwen Code CLI](./common-workflow) に提供するには、リポジトリのルートディレクトリに `QWEN.md` ファイルを作成してください。これにより、コーディング規約、アーキテクチャパターン、またはそのリポジトリでモデルが従うべきその他のガイドラインを定義できます。

## コントリビューション

コントリビューションを歓迎します！始め方の詳細については、Qwen Code CLI の **[コントリビューションガイド](https://github.com/QwenLM/qwen-code-action/blob/main/CONTRIBUTING.md)** をご覧ください。

[secrets]: https://docs.github.com/ja/actions/security-guides/using-secrets-in-github-actions  
[Qwen Code]: https://github.com/QwenLM/qwen-code  
[DashScope]: https://dashscope.console.aliyun.com/apiKey  
[Qwen Code CLI]: https://github.com/QwenLM/qwen-code-action/  
[variables]: https://docs.github.com/ja/actions/how-tos/write-workflows/choose-what-workflows-do/use-variables#creating-configuration-variables-for-a-repository  
[GitHub CLI]: https://docs.github.com/ja/github-cli/github-cli  
[QWEN.md]: https://github.com/QwenLM/qwen-code-action/blob/main/docs/cli/configuration.md#context-files-hierarchical-instructional-context