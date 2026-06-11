# 認証

Qwen Code は 3 つの認証方法をサポートしています。CLI の実行方法に合わせて選択してください：

- **Qwen OAuth**: ブラウザで `qwen.ai` アカウントにサインインします。**無料枠は 2026-04-15 に廃止されました** — 他の方法に切り替えてください。
- **Alibaba Cloud Coding Plan**: Alibaba Cloud の API キーを使用します。多様なモデルオプションと高いクォータを提供する有料サブスクリプションです。
- **API Key**: 独自の API キーを持ち込みます。ニーズに合わせて柔軟に設定可能 — OpenAI、Anthropic、Gemini、およびその他の互換エンドポイントをサポートします。

## オプション 1: Qwen OAuth（廃止済み）

> [!warning]
>
> Qwen OAuth の無料枠は 2026-04-15 に廃止されました。キャッシュされた既存のトークンは一時的に動作する場合がありますが、新しいリクエストは拒否されます。Alibaba Cloud Coding Plan、[OpenRouter](https://openrouter.ai)、[Fireworks AI](https://app.fireworks.ai)、または他のプロバイダーに切り替えてください。設定するには `qwen auth` を実行してください。

- **動作原理**: 初回起動時に Qwen Code がブラウザのログインページを開きます。ログイン完了後、認証情報はローカルにキャッシュされるため、通常は再度ログインする必要はありません。
- **要件**: `qwen.ai` アカウント + インターネット接続（初回ログイン時に必要）。
- **メリット**: API キーの管理が不要で、認証情報の自動更新が行われます。
- **コストとクォータ**: 無料枠は 2026-04-15 時点で廃止されています。

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
> 非インタラクティブまたはヘッドレス環境（CI、SSH、コンテナなど）では、通常 OAuth のブラウザログインフローを**完了できません**。  
> このような場合は、Alibaba Cloud Coding Plan または API Key 認証方法を使用してください。

## 💳 オプション 2: Alibaba Cloud Coding Plan

コストを予測可能にし、多様なモデルオプションと高い使用クォータを利用したい場合に適しています。

- **動作原理**: 固定月額料金で Coding Plan にサブスクライブし、Qwen Code が専用エンドポイントとサブスクリプションの API キーを使用するように設定します。
- **要件**: アカウントのリージョンに応じて、[Alibaba Cloud ModelStudio(Beijing)](https://bailian.console.aliyun.com/cn-beijing?tab=coding-plan#/efm/coding-plan-index) または [Alibaba Cloud ModelStudio(intl)](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index) から有効な Coding Plan サブスクリプションを取得します。
- **メリット**: 多様なモデルオプション、高い使用クォータ、予測可能な月額コスト、幅広いモデル（Qwen、GLM、Kimi、Minimax など）へのアクセス。
- **コストとクォータ**: Aliyun ModelStudio Coding Plan のドキュメントを参照してください。[北京](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3005961) [国際](https://modelstudio.console.alibabacloud.com/?tab=doc#/doc/?type=model&url=2840914)

Alibaba Cloud Coding Plan は 2 つのリージョンで利用可能です：

| リージョン                       | コンソール URL                                                                  |
| ---------------------------- | ---------------------------------------------------------------------------- |
| Aliyun ModelStudio (Beijing) | [bailian.console.aliyun.com](https://bailian.console.aliyun.com)             |
| Alibaba Cloud (intl)         | [bailian.console.alibabacloud.com](https://bailian.console.alibabacloud.com) |

### インタラクティブ設定

Coding Plan の認証は以下の 2 つの方法で設定できます：

**オプション A: ターミナルから（初回設定に推奨）**

```bash
# インタラクティブ — リージョンと API キーの入力を促します
qwen auth coding-plan

# または非インタラクティブ — リージョンとキーを直接渡します
qwen auth coding-plan --region china --key sk-sp-xxxxxxxxx
```

**オプション B: Qwen Code セッション内**

ターミナルで `qwen` を入力して Qwen Code を起動し、`/auth` コマンドを実行して **Alibaba Cloud Coding Plan** を選択します。リージョンを選択した後、`sk-sp-xxxxxxxxx` キーを入力します。

認証完了後、`/model` コマンドを使用して、Alibaba Cloud Coding Plan がサポートするすべてのモデル（qwen3.5-plus、qwen3-coder-plus、qwen3-coder-next、qwen3-max、glm-4.7、kimi-k2.5 など）を切り替えることができます。

### 代替方法: `settings.json` 経由で設定

インタラクティブな `/auth` フローをスキップしたい場合は、`~/.qwen/settings.json` に以下を追加してください：

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

OpenAI、Anthropic、Google、Azure OpenAI、OpenRouter、ModelScope、またはセルフホストエンドポイントなどのサードパーティプロバイダーに接続したい場合に適しています。複数のプロトコルとプロバイダーをサポートします。

### 推奨: `settings.json` による単一ファイル設定

API Key 認証を始める最も簡単な方法は、すべての設定を単一の `~/.qwen/settings.json` ファイルにまとめることです。以下は、すぐに使用できる完全な例です：

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
| `env`                        | フォールバックとして API キーを `settings.json` に直接保存します（最下位優先度 — シェルの `export` や `.env` ファイルが優先されます）。                  |
| `security.auth.selectedType` | Qwen Code の起動時に使用するプロトコル（例: `openai`、`anthropic`、`gemini`）を指定します。これがない場合、インタラクティブに `/auth` を実行する必要があります。 |
| `model.name`                 | Qwen Code 起動時に有効化するデフォルトのモデル。`modelProviders` 内のいずれかの `id` 値と一致している必要があります。                                |

ファイルを保存したら、`qwen` を実行するだけです。インタラクティブな `/auth` 設定は不要です。

> [!tip]
>
> 以下のセクションでは各部分をより詳しく説明しています。上記のクイック例で問題なく動作する場合は、[セキュリティに関する注意事項](#security-notes) までスキップしても構いません。

重要な概念は **Model Providers**（`modelProviders`）です。Qwen Code は OpenAI だけでなく複数の API プロトコルをサポートしています。`~/.qwen/settings.json` を編集して利用可能なプロバイダーとモデルを設定し、実行時に `/model` コマンドで切り替えることができます。

#### サポートされているプロトコル

| プロトコル          | `modelProviders` キー | 環境変数                                        | プロバイダー                                                                                   |
| ----------------- | -------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| OpenAI 互換 | `openai`             | `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`          | OpenAI、Azure OpenAI、OpenRouter、ModelScope、Alibaba Cloud、その他の OpenAI 互換エンドポイント |
| Anthropic         | `anthropic`          | `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_MODEL` | Anthropic Claude                                                                            |
| Google GenAI      | `gemini`             | `GEMINI_API_KEY`, `GEMINI_MODEL`                             | Google Gemini                                                                               |

#### ステップ 1: `~/.qwen/settings.json` でモデルとプロバイダーを設定

各プロトコルで利用可能なモデルを定義します。各モデルエントリには、最低限 `id` と `envKey`（API キーを保持する環境変数名）が必要です。

> [!important]
>
> プロジェクト設定とユーザー設定のマージ競合を避けるため、`modelProviders` はユーザー範囲の `~/.qwen/settings.json` で定義することを推奨します。

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

**`ModelConfig` フィールド（`modelProviders` 内の各エントリ）:**

| フィールド              | 必須 | 説明                                                          |
| ------------------ | -------- | -------------------------------------------------------------------- |
| `id`               | はい      | API に送信するモデル ID（例: `gpt-4o`、`claude-sonnet-4-20250514`） |
| `name`             | いいえ       | `/model` ピッカーでの表示名（デフォルトは `id`）               |
| `envKey`           | はい      | API キー用の環境変数名（例: `OPENAI_API_KEY`）    |
| `baseUrl`          | いいえ       | API エンドポイントの上書き（プロキシやカスタムエンドポイントに有用）       |
| `generationConfig` | いいえ       | `timeout`、`maxRetries`、`samplingParams` などの微調整            |

> [!note]
>
> `settings.json` の `env` フィールドを使用する場合、認証情報は平文で保存されます。セキュリティを向上させるには、`.env` ファイルまたはシェルの `export` を優先してください。[ステップ 2](#step-2-set-environment-variables) を参照してください。

完全な `modelProviders` スキーマや `generationConfig`、`customHeaders`、`extra_body` などの高度なオプションについては、[Model Providers リファレンス](model-providers.md) を参照してください。

#### ステップ 2: 環境変数の設定

Qwen Code は環境変数（モデル設定の `envKey` で指定）から API キーを読み取ります。提供方法は複数あり、以下に**優先度が高い順**に示します：

**1. シェル環境 / `export`（最優先）**

シェルのプロファイル（`~/.zshrc`、`~/.bashrc` など）に直接設定するか、起動前にインラインで設定します：

```bash

# Alibaba Dashscope
export DASHSCOPE_API_KEY="sk-..."

# OpenAI / OpenAI 互換
export OPENAI_API_KEY="sk-..."

# Anthropic
export ANTHROPIC_API_KEY="sk-ant-..."

# Google GenAI
export GEMINI_API_KEY="AIza..."
```

**2. `.env` ファイル**

Qwen Code は最初に見つかった `.env` ファイルを自動で読み込みます（複数のファイル間で変数は**マージされません**）。`process.env` にまだ存在しない変数のみが読み込まれます。

検索順序（カレントディレクトリから `/` に向かって上位へ）：

1. `.qwen/.env`（推奨 — Qwen Code の変数を他のツールから分離）
2. `.env`

何も見つからない場合は、**ホームディレクトリ**にフォールバックします：

3. `~/.qwen/.env`
4. `~/.env`

> [!tip]
>
> 他のツールとの競合を避けるため、`.env` より `.qwen/.env` を推奨します。Qwen Code の動作に干渉しないよう、一部の環境変数（`DEBUG` や `DEBUG_MODE` など）はプロジェクトレベルの `.env` ファイルから除外されます。

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

これは上記の[単一ファイル設定例](#recommended-one-file-setup-via-settingsjson)で使用されているアプローチです。すべてを 1 か所にまとめて管理できるため便利ですが、`settings.json` が共有または同期される可能性がある点に注意してください。機密性の高いシークレットには `.env` ファイルを優先してください。

**優先度の概要：**

| 優先度    | ソース                         | 上書き動作                            |
| ----------- | ------------------------------ | -------------------------------------------- |
| 1（最高） | CLI フラグ（`--openai-api-key`） | 常に優先                                  |
| 2           | システム環境（`export`、インライン）  | `.env` および `settings.json` → `env` を上書き |
| 3           | `.env` ファイル                    | システム環境に設定されていない場合のみ設定               |
| 4（最低）  | `settings.json` → `env`        | システム環境または `.env` に設定されていない場合のみ設定     |

#### ステップ 3: `/model` でモデルを切り替え

Qwen Code を起動した後、`/model` コマンドを使用して設定済みのすべてのモデルを切り替えます。モデルはプロトコルごとにグループ化されます：

```
/model
```

ピッカーには `modelProviders` 設定のすべてのモデルが、プロトコル（例: `openai`、`anthropic`、`gemini`）ごとにグループ化されて表示されます。選択内容はセッション間で保持されます。

コマンドライン引数で直接モデルを切り替えることもでき、複数のターミナルで作業する際に便利です。

```bash
# 1 つ目のターミナルで

qwen --model "qwen3-coder-plus"

# 別のターミナルで

qwen --model "qwen3.5-plus"
```

## `qwen auth` CLI コマンド

セッション内の `/auth` スラッシュコマンドに加えて、Qwen Code はインタラクティブセッションを起動せずにターミナルから直接認証を管理できるスタンドアロンの `qwen auth` CLI コマンドを提供しています。

### インタラクティブモード

引数なしで `qwen auth` を実行すると、インタラクティブメニューが表示されます：

```bash
qwen auth
```

矢印キーで操作できるセレクターが表示されます：

```
認証方法を選択してください:

  Alibaba Cloud Coding Plan - 有料 · 5 時間あたり最大 6,000 リクエスト · Alibaba Cloud Coding Plan の全モデル
  API Key - 独自の API キーを持ち込み
  Qwen OAuth - 廃止済み — Coding Plan または API Key に切り替えてください

(↑ ↓ キーで移動、Enter で選択、Ctrl+C で終了)
```

### サブコマンド

| コマンド                                              | 説明                                       |
| ---------------------------------------------------- | ------------------------------------------------- |
| `qwen auth`                                          | インタラクティブな認証設定                  |
| `qwen auth coding-plan`                              | Alibaba Cloud Coding Plan での認証       |
| `qwen auth coding-plan --region china --key sk-sp-…` | 非インタラクティブな Coding Plan 設定（スクリプト用） |
| `qwen auth api-key`                                  | API キーでの認証                      |
| `qwen auth qwen-oauth`                               | Qwen OAuth での認証（廃止済み）       |
| `qwen auth status`                                   | 現在の認証ステータスを表示                |

**例:**

```bash
# Qwen OAuth で直接認証
qwen auth qwen-oauth

# Coding Plan をインタラクティブに設定（リージョンとキーの入力を促します）
qwen auth coding-plan

# Coding Plan を非インタラクティブに設定（CI/スクリプトに有用）
qwen auth coding-plan --region china --key sk-sp-xxxxxxxxx

# API キーを設定（ModelStudio Standard またはカスタムプロバイダー）
qwen auth api-key

# 現在の認証設定を確認
qwen auth status
```

## セキュリティに関する注意事項

- API キーをバージョン管理システムにコミットしないでください。
- プロジェクトローカルのシークレットには `.qwen/.env` を優先してください（git 管理外に保持）。
- 認証確認のために認証情報がターミナルに出力される場合は、機密情報として扱ってください。