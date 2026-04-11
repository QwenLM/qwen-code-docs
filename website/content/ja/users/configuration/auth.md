# 認証

Qwen Code は 3 つの認証方法をサポートしています。CLI の実行方法に合わせて選択してください：

- **Qwen OAuth**: ブラウザで `qwen.ai` アカウントにサインインします。無料（日次クォータあり）。
- **Alibaba Cloud Coding Plan**: Alibaba Cloud の API キーを使用します。有料サブスクリプションで、多様なモデルオプションと高いクォータを提供します。
- **API Key**: 独自の API キーを持ち込みます。ニーズに合わせて柔軟に設定可能 — OpenAI、Anthropic、Gemini、およびその他の互換エンドポイントをサポートします。

## オプション 1: Qwen OAuth（無料）

最も簡単なセットアップを希望し、Qwen モデルを使用する場合に選択してください。

- **動作原理**: 初回起動時に Qwen Code がブラウザのログインページを開きます。認証完了後、認証情報はローカルにキャッシュされるため、通常は再度ログインする必要はありません。
- **要件**: `qwen.ai` アカウント + インターネット接続（初回ログイン時に必要）。
- **メリット**: API キーの管理が不要で、認証情報が自動的に更新されます。
- **コストとクォータ**: 無料。クォータは **60 リクエスト/分** および **1,000 リクエスト/日**。

CLI を起動し、ブラウザのフローに従ってください：

```bash
qwen
```

または、セッションを開始せずに直接認証することもできます：

```bash
qwen auth qwen-oauth
```

> [!note]
>
> 非対話型またはヘッドレス環境（CI、SSH、コンテナなど）では、通常 OAuth のブラウザログインフローを**完了できません**。  
> このような場合は、Alibaba Cloud Coding Plan または API Key 認証方法を使用してください。

## 💳 オプション 2: Alibaba Cloud Coding Plan

コストを予測可能にし、多様なモデルオプションと高い利用クォータを希望する場合に選択してください。

- **動作原理**: 固定月額料金で Coding Plan にサブスクライブし、Qwen Code が専用エンドポイントとサブスクリプションの API キーを使用するように設定します。
- **要件**: アカウントのリージョンに応じて、[Alibaba Cloud ModelStudio（北京）](https://bailian.console.aliyun.com/cn-beijing?tab=coding-plan#/efm/coding-plan-index) または [Alibaba Cloud ModelStudio（国際）](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index) から有効な Coding Plan サブスクリプションを取得します。
- **メリット**: 多様なモデルオプション、高い利用クォータ、予測可能な月額コスト、幅広いモデル（Qwen、GLM、Kimi、Minimax など）へのアクセス。
- **コストとクォータ**: Aliyun ModelStudio Coding Plan のドキュメントを参照してください：[北京](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3005961)、[国際](https://modelstudio.console.alibabacloud.com/?tab=doc#/doc/?type=model&url=2840914)。

Alibaba Cloud Coding Plan は 2 つのリージョンで利用可能です：

| リージョン                       | コンソール URL                                                                  |
| ---------------------------- | ---------------------------------------------------------------------------- |
| Aliyun ModelStudio（北京） | [bailian.console.aliyun.com](https://bailian.console.aliyun.com)             |
| Alibaba Cloud（国際）         | [bailian.console.alibabacloud.com](https://bailian.console.alibabacloud.com) |

### 対話型セットアップ

Coding Plan 認証は以下の 2 つの方法で設定できます：

**オプション A: ターミナルから（初回セットアップに推奨）**

```bash
# Interactive — prompts for region and API key
qwen auth coding-plan

# Or non-interactive — pass region and key directly
qwen auth coding-plan --region china --key sk-sp-xxxxxxxxx
```

**オプション B: Qwen Code セッション内**

ターミナルで `qwen` を実行して Qwen Code を起動し、`/auth` コマンドを実行して **Alibaba Cloud Coding Plan** を選択します。リージョンを選択し、`sk-sp-xxxxxxxxx` キーを入力します。

認証完了後、`/model` コマンドを使用して、Alibaba Cloud Coding Plan がサポートするすべてのモデル（qwen3.5-plus、qwen3-coder-plus、qwen3-coder-next、qwen3-max、glm-4.7、kimi-k2.5 など）を切り替えることができます。

### 代替方法: `settings.json` による設定

対話型の `/auth` フローをスキップしたい場合は、`~/.qwen/settings.json` に以下を追加してください：

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3-coder-plus",
        "name": "qwen3-coder-plus (Coding Plan)",
        "baseUrl": "https://coding.dashscope.aliyuncs.com/v1",
        "description": "qwen3-coder-plus from Alibaba Cloud Coding Plan",
        "envKey": "BAILIAN_CODING_PLAN_API_KEY"
      }
    ]
  },
  "env": {
    "BAILIAN_CODING_PLAN_API_KEY": "sk-sp-xxxxxxxxx"
  },
  "security": {
    "auth": {
      "selectedType": "openai"
    }
  },
  "model": {
    "name": "qwen3-coder-plus"
  }
}
```

> [!note]
>
> Coding Plan は標準の Dashscope エンドポイントとは異なる専用エンドポイント（`https://coding.dashscope.aliyuncs.com/v1`）を使用します。正しい `baseUrl` を使用していることを確認してください。

## 🚀 オプション 3: API Key（柔軟）

OpenAI、Anthropic、Google、Azure OpenAI、OpenRouter、ModelScope、またはセルフホスト型エンドポイントなどのサードパーティプロバイダーに接続する場合に選択してください。複数のプロトコルとプロバイダーをサポートします。

### 推奨: `settings.json` による単一ファイルセットアップ

API Key 認証を始める最も簡単な方法は、すべての設定を単一の `~/.qwen/settings.json` ファイルに記述することです。以下は、すぐに使用できる完全な例です：

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3-coder-plus",
        "name": "qwen3-coder-plus",
        "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "description": "Qwen3-Coder via Dashscope",
        "envKey": "DASHSCOPE_API_KEY"
      }
    ]
  },
  "env": {
    "DASHSCOPE_API_KEY": "sk-xxxxxxxxxxxxx"
  },
  "security": {
    "auth": {
      "selectedType": "openai"
    }
  },
  "model": {
    "name": "qwen3-coder-plus"
  }
}
```

各フィールドの役割：

| フィールド                        | 説明                                                                                                                                     |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `modelProviders`             | 利用可能なモデルと接続方法を宣言します。キー（`openai`、`anthropic`、`gemini`）は API プロトコルを表します。              |
| `env`                        | API キーを `settings.json` に直接保存します（フォールバック用。最優先度は低く、シェルの `export` や `.env` ファイルが優先されます）。                  |
| `security.auth.selectedType` | Qwen Code の起動時に使用するプロトコル（例：`openai`、`anthropic`、`gemini`）を指定します。これを設定しない場合、対話的に `/auth` を実行する必要があります。 |
| `model.name`                 | Qwen Code 起動時に有効化するデフォルトのモデル。`modelProviders` 内のいずれかの `id` と一致している必要があります。                                |

ファイルを保存したら、`qwen` を実行するだけです。対話型の `/auth` セットアップは不要です。

> [!tip]
>
> 以下のセクションでは各部分を詳しく説明します。上記のクイック例で問題なく動作する場合は、[セキュリティに関する注意事項](#security-notes) までスキップして構いません。

重要な概念は **Model Providers**（`modelProviders`）です。Qwen Code は OpenAI だけでなく複数の API プロトコルをサポートしています。`~/.qwen/settings.json` を編集して利用可能なプロバイダーとモデルを設定し、実行時に `/model` コマンドで切り替えます。

#### サポートされているプロトコル

| プロトコル          | `modelProviders` キー | 環境変数                                        | プロバイダー                                                                                   |
| ----------------- | -------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| OpenAI 互換 | `openai`             | `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`          | OpenAI、Azure OpenAI、OpenRouter、ModelScope、Alibaba Cloud、その他の OpenAI 互換エンドポイント |
| Anthropic         | `anthropic`          | `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_MODEL` | Anthropic Claude                                                                            |
| Google GenAI      | `gemini`             | `GEMINI_API_KEY`, `GEMINI_MODEL`                             | Google Gemini                                                                               |

#### ステップ 1: `~/.qwen/settings.json` でモデルとプロバイダーを設定する

各プロトコルで利用可能なモデルを定義します。各モデルエントリには、最低限 `id` と `envKey`（API キーを格納する環境変数名）が必要です。

> [!important]
>
> プロジェクト設定とユーザー設定のマージ競合を避けるため、`modelProviders` はユーザーレベルの `~/.qwen/settings.json` で定義することを推奨します。

`~/.qwen/settings.json` を編集します（存在しない場合は作成してください）。単一ファイル内で複数のプロトコルを混在させることができます。以下は `modelProviders` セクションのみを示すマルチプロバイダーの例です：

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "gpt-4o",
        "name": "GPT-4o",
        "envKey": "OPENAI_API_KEY",
        "baseUrl": "https://api.openai.com/v1"
      }
    ],
    "anthropic": [
      {
        "id": "claude-sonnet-4-20250514",
        "name": "Claude Sonnet 4",
        "envKey": "ANTHROPIC_API_KEY"
      }
    ],
    "gemini": [
      {
        "id": "gemini-2.5-pro",
        "name": "Gemini 2.5 Pro",
        "envKey": "GEMINI_API_KEY"
      }
    ]
  }
}
```

> [!tip]
>
> `modelProviders` と併せて `env`、`security.auth.selectedType`、`model.name` も設定することを忘れないでください。参考として[上記の完全な例](#recommended-one-file-setup-via-settingsjson)を参照してください。

**`ModelConfig` フィールド（`modelProviders` 内の各エントリ）：**

| フィールド              | 必須 | 説明                                                          |
| ------------------ | -------- | -------------------------------------------------------------------- |
| `id`               | はい      | API に送信するモデル ID（例：`gpt-4o`、`claude-sonnet-4-20250514`） |
| `name`             | いいえ       | `/model` ピッカーでの表示名（デフォルトは `id`）               |
| `envKey`           | はい      | API キー用の環境変数名（例：`OPENAI_API_KEY`）    |
| `baseUrl`          | いいえ       | API エンドポイントの上書き（プロキシやカスタムエンドポイントに有用）       |
| `generationConfig` | いいえ       | `timeout`、`maxRetries`、`samplingParams` などを微調整            |

> [!note]
>
> `settings.json` の `env` フィールドを使用する場合、認証情報はプレーンテキストで保存されます。セキュリティを強化するには、`.env` ファイルまたはシェルの `export` を優先して使用してください。詳細は[ステップ 2](#step-2-set-environment-variables)を参照してください。

完全な `modelProviders` スキーマや `generationConfig`、`customHeaders`、`extra_body` などの高度なオプションについては、[Model Providers リファレンス](model-providers.md)を参照してください。

#### ステップ 2: 環境変数を設定する

Qwen Code は環境変数（モデル設定の `envKey` で指定）から API キーを読み取ります。提供方法は複数あり、以下に**優先度が高い順**に示します：

**1. シェル環境 / `export`（最優先）**

シェルのプロファイル（`~/.zshrc`、`~/.bashrc` など）に直接設定するか、起動前にインラインで指定します：

```bash

# Alibaba Dashscope
export DASHSCOPE_API_KEY="sk-..."

# OpenAI / OpenAI-compatible
export OPENAI_API_KEY="sk-..."

# Anthropic
export ANTHROPIC_API_KEY="sk-ant-..."

# Google GenAI
export GEMINI_API_KEY="AIza..."
```

**2. `.env` ファイル**

Qwen Code は最初に見つかった `.env` ファイルを**自動で読み込みます**（複数のファイル間で変数は**マージされません**）。`process.env` にまだ存在しない変数のみが読み込まれます。

検索順序（カレントディレクトリから `/` に向かって上位へ）：

1. `.qwen/.env`（推奨 — Qwen Code の変数を他のツールから分離）
2. `.env`

見つからない場合は、**ホームディレクトリ**にフォールバックします：

3. `~/.qwen/.env`
4. `~/.env`

> [!tip]
>
> 他のツールとの競合を避けるため、`.env` よりも `.qwen/.env` を推奨します。Qwen Code の動作に干渉しないよう、一部の環境変数（`DEBUG` や `DEBUG_MODE` など）はプロジェクトレベルの `.env` ファイルから除外されます。

**3. `settings.json` → `env` フィールド（最下位優先度）**

API キーを `~/.qwen/settings.json` の `env` キーに直接定義することもできます。これらは**最下位優先度のフォールバック**として読み込まれ、システム環境や `.env` ファイルで変数が既に設定されていない場合にのみ適用されます。

```json
{
  "env": {
    "DASHSCOPE_API_KEY": "sk-...",
    "OPENAI_API_KEY": "sk-...",
    "ANTHROPIC_API_KEY": "sk-ant-..."
  }
}
```

これは上記の[単一ファイルセットアップ例](#recommended-one-file-setup-via-settingsjson)で使用されているアプローチです。すべてを 1 か所にまとめて管理できるため便利ですが、`settings.json` が共有または同期される可能性がある点に注意してください。機密性の高いシークレットには `.env` ファイルを優先してください。

**優先度のまとめ：**

| 優先度    | ソース                         | 上書き動作                            |
| ----------- | ------------------------------ | -------------------------------------------- |
| 1（最高） | CLI フラグ（`--openai-api-key`） | 常に優先                                  |
| 2           | システム環境（`export`、インライン）  | `.env` および `settings.json` → `env` を上書き |
| 3           | `.env` ファイル                    | システム環境に設定されていない場合のみ適用               |
| 4（最低）  | `settings.json` → `env`        | システム環境または `.env` に設定されていない場合のみ適用     |

#### ステップ 3: `/model` でモデルを切り替える

Qwen Code 起動後、`/model` コマンドを使用して設定済みのすべてのモデルを切り替えます。モデルはプロトコルごとにグループ化されます：

```
/model
```

ピッカーには `modelProviders` 設定のすべてのモデルがプロトコル（例：`openai`、`anthropic`、`gemini`）ごとにグループ化されて表示されます。選択内容はセッションをまたいで保持されます。

コマンドライン引数で直接モデルを切り替えることもでき、複数のターミナルで作業する際に便利です。

```bash
# In one terminal

qwen --model "qwen3-coder-plus"

# In another terminal

qwen --model "qwen3.5-plus"
```

## `qwen auth` CLI コマンド

セッション内の `/auth` スラッシュコマンドに加えて、Qwen Code は対話型セッションを起動せずにターミナルから直接認証を管理できるスタンドアロンの `qwen auth` CLI コマンドを提供します。

### 対話型モード

引数なしで `qwen auth` を実行すると、対話型メニューが表示されます：

```bash
qwen auth
```

You'll see a selector with arrow-key navigation:

```
Select authentication method:

> Qwen OAuth - Free · Up to 1,000 requests/day · Qwen latest models
  Alibaba Cloud Coding Plan - Paid · Up to 6,000 requests/5 hrs · All Alibaba Cloud Coding Plan Models

(Use ↑ ↓ arrows to navigate, Enter to select, Ctrl+C to exit)
```

### サブコマンド

| コマンド                                              | 説明                                       |
| ---------------------------------------------------- | ------------------------------------------------- |
| `qwen auth`                                          | 対話型認証セットアップ                  |
| `qwen auth qwen-oauth`                               | Qwen OAuth による認証                      |
| `qwen auth coding-plan`                              | Alibaba Cloud Coding Plan による認証       |
| `qwen auth coding-plan --region china --key sk-sp-…` | 非対話型 Coding Plan セットアップ（スクリプト用） |
| `qwen auth status`                                   | 現在の認証ステータスを表示                |

**例：**

```bash
# Authenticate with Qwen OAuth directly
qwen auth qwen-oauth

# Set up Coding Plan interactively (prompts for region and key)
qwen auth coding-plan

# Set up Coding Plan non-interactively (useful for CI/scripting)
qwen auth coding-plan --region china --key sk-sp-xxxxxxxxx

# Check your current auth configuration
qwen auth status
```

## セキュリティに関する注意事項

- API キーをバージョン管理システムにコミットしないでください。
- プロジェクトローカルのシークレットには `.qwen/.env` を優先して使用し（git 管理から除外してください）。
- 認証情報の確認のためにターミナル出力に資格情報が表示される場合は、機密情報として扱ってください。