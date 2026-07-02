# 認証

Qwen Code の初回起動時に表示される `/auth` メニューには、3つのトップレベルオプションがあります。CLI の実行方法に合わせて選択してください。

- **Alibaba ModelStudio**: 公式推奨セットアップ。**Coding Plan**（個人開発者向け・週間クォータ含む）、**Token Plan**（チーム・企業向け・専用エンドポイントでの従量課金）、または **Standard API Key**（既存の ModelStudio API キーで接続）のサブメニューを開きます。
- **Third-party Providers**: 組み込みプロバイダーを選択し、API キーで接続します（DeepSeek、MiniMax、Z.AI、Idealab、ModelScope、OpenRouter、Requesty）。
- **Custom Provider**: ローカルサーバー、プロキシ、またはサポートされていないプロバイダーに手動で接続します。OpenAI、Anthropic、Gemini、およびその他の互換エンドポイントをサポートします。

> [!note]
>
> **Qwen OAuth** は選択可能なダイアログエントリではなくなりました。無料枠は 2026-04-15 に廃止されました。以下には、ハードコードされた廃止プロバイダーとしてのみドキュメント化されています。

## オプション 1: Qwen OAuth（廃止）

> [!warning]
>
> Qwen OAuth の無料枠は 2026-04-15 に廃止されました。既存のキャッシュされたトークンは短時間動作し続ける場合がありますが、新しいリクエストは拒否されます。Alibaba Cloud Coding Plan、[OpenRouter](https://openrouter.ai)、[Fireworks AI](https://app.fireworks.ai)、または別のプロバイダーに切り替えてください。`qwen` を実行し、`/auth` を使用して設定してください。

- **仕組み**: 初回起動時、Qwen Code はブラウザのログインページを開きます。ログインが完了すると、認証情報がローカルにキャッシュされるため、通常は再度ログインする必要はありません。
- **要件**: `qwen.ai` アカウントとインターネットアクセス（少なくとも初回ログイン時）。
- **メリット**: API キーの管理が不要で、認証情報が自動的に更新されます。
- **コストとクォータ**: 無料枠は 2026-04-15 時点で廃止されました。

CLI を起動し、ブラウザのフローに従います。

```bash
qwen
```

Qwen OAuth は `/auth` ダイアログの選択可能なエントリとして提供されなくなりました。代わりに `/auth` を実行し、現在のオプション（Alibaba ModelStudio、Third-party Providers、または Custom Provider）のいずれかを選択してください。

> [!note]
>
> 非対話型またはヘッドレス環境（CI、SSH、コンテナなど）では、通常、OAuth ブラウザログインフローを完了**できません**。
> このような場合は、Alibaba Cloud Coding Plan または API キー認証方法を使用してください。

## 💳 オプション 2: Alibaba Cloud Coding Plan

多様なモデルオプションと高い利用クォータで、予測可能なコストにしたい場合はこれを使用します。

- **仕組み**: 固定月額料金で Coding Plan を契約し、専用エンドポイントと契約 API キーを使用するように Qwen Code を設定します。
- **要件**: アカウントのリージョンに応じて、[Alibaba Cloud ModelStudio(Beijing)](https://bailian.console.aliyun.com/cn-beijing?tab=coding-plan#/efm/coding-plan-index) または [Alibaba Cloud ModelStudio(intl)](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index) から有効な Coding Plan サブスクリプションを取得します。
- **メリット**: 多様なモデルオプション、高い利用クォータ、予測可能な月額コスト、幅広いモデル（Qwen、GLM、Kimi、Minimax など）へのアクセス。
- **コストとクォータ**: Aliyun ModelStudio Coding Plan のドキュメント[Beijing](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3005961)[intl](https://modelstudio.console.alibabacloud.com/?tab=doc#/doc/?type=model&url=2840914)を参照してください。

Alibaba Cloud Coding Plan は 2 つのリージョンで利用可能です。

| リージョン                       | コンソール URL                                                                  |
| ---------------------------- | ---------------------------------------------------------------------------- |
| Aliyun ModelStudio (Beijing) | [bailian.console.aliyun.com](https://bailian.console.aliyun.com)             |
| Alibaba Cloud (intl)         | [bailian.console.alibabacloud.com](https://bailian.console.alibabacloud.com) |

### インタラクティブセットアップ

ターミナルに `qwen` と入力して Qwen Code を起動し、`/auth` コマンドを実行して **Alibaba ModelStudio** を選択し、サブメニューから **Coding Plan** を選択します。リージョンを選択し、`sk-sp-xxxxxxxxx` キーを入力します。

認証後、`/model` コマンドを使用して、Alibaba Cloud Coding Plan でサポートされているすべてのモデル（qwen3.5-plus、qwen3.6-plus、qwen3.7-plus、qwen3-coder-plus、qwen3-coder-next、qwen3-max-2026-01-23、glm-5、glm-4.7、kimi-k2.5、MiniMax-M2.5 など）を切り替えます。

### ヘッドレスまたはスクリプトによるセットアップ

CI、コンテナ、またはスクリプトの場合は、削除された `qwen auth coding-plan` コマンドの代わりに、環境変数または `settings.json` を使用して Coding Plan を設定します。

```bash
export BAILIAN_CODING_PLAN_API_KEY="sk-sp-xxxxxxxxx"
export OPENAI_BASE_URL="https://coding.dashscope.aliyuncs.com/v1"
export OPENAI_MODEL="qwen3-coder-plus"
```

中国（北京）エンドポイントには `https://coding.dashscope.aliyuncs.com/v1` を、国際エンドポイントには `https://coding-intl.dashscope.aliyuncs.com/v1` を使用します。

### 代替案: `settings.json` による設定

インタラクティブな `/auth` フローをスキップしたい場合は、以下を `~/.qwen/settings.json` に追加します。

```json
{
  "modelProviders": {
    "openai": {
      "protocol": "openai",
      "models": [
        {
          "id": "qwen3-coder-plus",
          "name": "qwen3-coder-plus (Coding Plan)",
          "baseUrl": "https://coding.dashscope.aliyuncs.com/v1",
          "description": "qwen3-coder-plus from Alibaba Cloud Coding Plan",
          "envKey": "BAILIAN_CODING_PLAN_API_KEY"
        }
      ]
    }
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
> Coding Plan は、標準の Dashscope エンドポイントとは異なる専用エンドポイント（`https://coding.dashscope.aliyuncs.com/v1`）を使用します。必ず正しい `baseUrl` を使用してください。

## 🚀 オプション 3: API キー（柔軟）

OpenAI、Anthropic、Google、Azure OpenAI、OpenRouter、Requesty、ModelScope、またはセルフホスト型エンドポイントなどのサードパーティプロバイダーに接続したい場合はこれを使用します。複数のプロトコルとプロバイダーをサポートします。

### 推奨: `settings.json` による 1 ファイルセットアップ

API キー認証を開始する最も簡単な方法は、すべてを単一の `~/.qwen/settings.json` ファイルに記述することです。以下は、すぐに使用できる完全な例です。

```json
{
  "modelProviders": {
    "openai": {
      "protocol": "openai",
      "models": [
        {
          "id": "qwen3-coder-plus",
          "name": "qwen3-coder-plus",
          "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1",
          "description": "Qwen3-Coder via Dashscope",
          "envKey": "DASHSCOPE_API_KEY"
        }
      ]
    }
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

各フィールドの役割:

| フィールド                        | 説明                                                                                                                                     |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `modelProviders`             | 利用可能なモデルと、それらへの接続方法を宣言します。キー（`openai`、`anthropic`、`gemini`）は API プロトコルを表します。              |
| `env`                        | フォールバックとして API キーを `settings.json` に直接保存します（最低優先度 — シェルの `export` や `.env` ファイルが優先されます）。                  |
| `security.auth.selectedType` | 起動時に Qwen Code が使用するプロトコル（`openai`、`anthropic`、`gemini` など）を指定します。これがない場合、インタラクティブに `/auth` を実行する必要があります。 |
| `model.name`                 | Qwen Code の起動時にアクティブ化するデフォルトモデル。`modelProviders` の `id` 値のいずれかと一致する必要があります。                                |

ファイルを保存したら、`qwen` を実行するだけです。インタラクティブな `/auth` 設定は必要ありません。

> [!tip]
>
> 以下のセクションでは、各部分について詳しく説明します。上記のクイック例で問題ない場合は、[セキュリティに関する注意事項](#security-notes) まで読み飛ばしても構いません。

重要な概念は **Model Providers**（`modelProviders`）です。Qwen Code は OpenAI だけでなく、複数の API プロトコルをサポートしています。`~/.qwen/settings.json` を編集して利用可能なプロバイダーとモデルを設定し、実行時に `/model` コマンドで切り替えます。

#### サポートされているプロトコル

| プロトコル          | `modelProviders` キー | 環境変数                                                                                | プロバイダー                                                                                             |
| ----------------- | -------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| OpenAI 互換 | `openai`             | `OPENAI_API_KEY`、`OPENAI_BASE_URL`、`OPENAI_MODEL`（エイリアス: `QWEN_MODEL`）                            | OpenAI、Azure OpenAI、OpenRouter、Requesty、ModelScope、Alibaba Cloud、その他の OpenAI 互換エンドポイント |
| Anthropic         | `anthropic`          | `ANTHROPIC_API_KEY`、`ANTHROPIC_BASE_URL`、`ANTHROPIC_MODEL`                                         | Anthropic Claude                                                                                      |
| Google GenAI      | `gemini`             | `GEMINI_API_KEY`、`GEMINI_MODEL`                                                                     | Google Gemini                                                                                         |
| Vertex AI         | `vertex-ai`          | `GOOGLE_API_KEY`、`GOOGLE_MODEL`（`GOOGLE_GENAI_USE_VERTEXAI=true` を設定し、`gemini` プロトコルを使用） | Google Vertex AI                                                                                      |

#### ステップ 1: `~/.qwen/settings.json` でモデルとプロバイダーを設定する

各プロトコルで利用可能なモデルを定義します。各モデルエントリには少なくとも `id` が必要です。`envKey`（API キーを保持する環境変数名）は任意ですが推奨されます。省略した場合、認証タイプのデフォルトの環境変数キー（例: `openai` の場合は `OPENAI_API_KEY`）にフォールバックします。

> [!important]
>
> プロジェクト設定とユーザー設定間のマージ競合を避けるため、`modelProviders` はユーザースコープの `~/.qwen/settings.json` で定義することをお勧めします。

`~/.qwen/settings.json` を編集します（存在しない場合は作成します）。1 つのファイルで複数のプロトコルを混在させることができます。以下は `modelProviders` セクションのみを示すマルチプロバイダーの例です。

```json
{
  "modelProviders": {
    "openai": {
      "protocol": "openai",
      "models": [
        {
          "id": "gpt-4o",
          "name": "GPT-4o",
          "envKey": "OPENAI_API_KEY",
          "baseUrl": "https://api.openai.com/v1"
        }
      ]
    },
    "anthropic": {
      "protocol": "anthropic",
      "models": [
        {
          "id": "claude-sonnet-4-20250514",
          "name": "Claude Sonnet 4",
          "envKey": "ANTHROPIC_API_KEY"
        }
      ]
    },
    "gemini": {
      "protocol": "gemini",
      "models": [
        {
          "id": "gemini-2.5-pro",
          "name": "Gemini 2.5 Pro",
          "envKey": "GEMINI_API_KEY"
        }
      ]
    }
  }
}
```

> [!tip]
>
> `modelProviders` と一緒に `env`、`security.auth.selectedType`、`model.name` も設定することを忘れないでください。参考例は[上記の完全な例](#recommended-one-file-setup-via-settingsjson)を参照してください。

**`ModelConfig` フィールド（`modelProviders` 内の各エントリ）:**

| フィールド              | 必須 | 説明                                                                                                                                        |
| ------------------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`               | はい      | API に送信されるモデル ID（例: `gpt-4o`、`claude-sonnet-4-20250514`）                                                                               |
| `name`             | いいえ       | `/model` ピッカーでの表示名（デフォルトは `id`）                                                                                             |
| `envKey`           | いいえ       | API キーの環境変数名（例: `OPENAI_API_KEY`）。任意/推奨。省略時は認証タイプのデフォルトの環境変数キーになります。 |
| `baseUrl`          | いいえ       | API エンドポイントのオーバーライド（プロキシやカスタムエンドポイントに有用）                                                                                     |
| `generationConfig` | いいえ       | `timeout`、`maxRetries`、`samplingParams` などを微調整します。                                                                                          |

> [!note]
>
> `settings.json` の `env` フィールドを使用する場合、認証情報は平文で保存されます。セキュリティを高めるには、`.env` ファイルまたはシェルの `export` を優先してください。[ステップ 2](#step-2-set-environment-variables) を参照してください。

完全な `modelProviders` スキーマや `generationConfig`、`customHeaders`、`extra_body` などの高度なオプションについては、[Model Providers Reference](model-providers.md) を参照してください。

#### ステップ 2: 環境変数を設定する

Qwen Code は環境変数（モデル設定の `envKey` で指定）から API キーを読み取ります。提供方法には複数の方法があり、以下に**優先度の高い順**に示します。

**1. シェル環境 / `export`（最高優先度）**

シェルプロファイル（`~/.zshrc`、`~/.bashrc` など）に直接設定するか、起動前にインラインで設定します。

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

Qwen Code は、見つかった**最初の** `.env` ファイルを自動的に読み込みます（変数は複数のファイル間で**マージされません**）。`process.env` にまだ存在しない変数のみが読み込まれます。

検索順序（現在のディレクトリから `/` に向かって上位へ）:

1. `.qwen/.env`（推奨 — Qwen Code の変数を他のツールから分離します）
2. `.env`

見つからない場合、**ホームディレクトリ**にフォールバックします。

3. `~/.qwen/.env`
4. `~/.env`

> [!tip]
>
> 他のツールとの競合を避けるため、`.env` よりも `.qwen/.env` をお勧めします。Qwen Code の動作に干渉しないように、一部の変数（`DEBUG` や `DEBUG_MODE` など）はプロジェクトレベルの `.env` ファイルから除外されています。

**3. `settings.json` → `env` フィールド（最低優先度）**

API キーは `~/.qwen/settings.json` の `env` キーの下に直接定義することもできます。これらは**最低優先度のフォールバック**として読み込まれ、変数がシステム環境または `.env` ファイルによってまだ設定されていない場合にのみ適用されます。

```json
{
  "env": {
    "DASHSCOPE_API_KEY": "sk-...",
    "OPENAI_API_KEY": "sk-...",
    "ANTHROPIC_API_KEY": "sk-ant-..."
  }
}
```

これは上記の [1 ファイルセットアップ例](#recommended-one-file-setup-via-settingsjson) で使用されているアプローチです。すべてを 1 か所にまとめておくのに便利ですが、`settings.json` が共有または同期される可能性があることに注意してください。機密性の高いシークレットには `.env` ファイルを優先してください。

**優先度の概要:**

| 優先度    | ソース                         | オーバーライド動作                            |
| ----------- | ------------------------------ | -------------------------------------------- |
| 1（最高） | CLI フラグ（`--openai-api-key`） | 常に優先                                  |
| 2           | システム環境（`export`、インライン）  | `.env` および `settings.json` → `env` をオーバーライド |
| 3           | `.env` ファイル                    | システム環境にない場合のみ設定               |
| 4（最低）  | `settings.json` → `env`        | システム環境または `.env` にない場合のみ設定     |

#### ステップ 3: `/model` でモデルを切り替える

Qwen Code を起動したら、`/model` コマンドを使用して設定されたすべてのモデルを切り替えます。モデルはプロトコルごとにグループ化されます。

```
/model
```

ピッカーには `modelProviders` 設定のすべてのモデルが表示され、プロトコル（`openai`、`anthropic`、`gemini` など）ごとにグループ化されます。選択内容はセッションをまたいで保持されます。

コマンドライン引数で直接モデルを切り替えることもできます。これは複数のターミナルで作業する際に便利です。

```bash
# In one terminal

qwen --model "qwen3-coder-plus"

# In another terminal

qwen --model "qwen3.5-plus"
```

## 削除された `qwen auth` CLI コマンド

スタンドアロンの `qwen auth` CLI コマンドは削除されました。代わりに以下の代替手段を使用してください。

| 以前のユースケース                | 代替手段                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------------- |
| インタラクティブな認証設定 | `qwen` を実行し、`/auth` を使用                                                                |
| Coding Plan の設定                | `/auth` を使用、または Coding Plan ベース URL で `BAILIAN_CODING_PLAN_API_KEY` を設定             |
| OpenRouter の設定                 | `/auth` を使用、または `OPENROUTER_API_KEY` と `OPENAI_BASE_URL=https://openrouter.ai/api/v1` を設定 |
| Requesty の設定                   | `/auth` を使用、または `REQUESTY_API_KEY` と `OPENAI_BASE_URL=https://router.requesty.ai/v1` を設定  |
| API キーまたはカスタムプロバイダーの設定 | `~/.qwen/settings.json`、`.env`、またはプロバイダー固有の環境変数を設定       |
| 現在の認証を確認     | Qwen Code 内で `/doctor` を実行                                                              |
| OAuth ブラウザフロー               | `qwen` をインタラクティブに実行し、`/auth` を使用。OAuth は環境変数だけでは設定できません    |

`qwen auth status` などのレガシーな呼び出しは、これらの移行パスを含む削除通知を出力するようになりました。

## セキュリティに関する注意事項

- API キーをバージョン管理にコミットしないでください。
- プロジェクトローカルのシークレットには `.qwen/.env` を優先してください（また、Git の管理外に置いてください）。
- 認証情報を表示して検証する場合は、ターミナルの出力を機密として扱ってください。