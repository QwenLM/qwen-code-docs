# 認証

Qwen Code の初回実行時 `/auth` メニューには、3つのトップレベルオプションがあります。CLI の実行方法に合わせて選択してください。

- **Alibaba ModelStudio**: 公式推奨のセットアップです。サブメニューから **Coding Plan**（個人開発者向け・週間クォータ込み）、**Token Plan**（チーム・企業向け・専用エンドポイントでの従量課金）、または **Standard API Key**（既存の ModelStudio API キーと接続）を選択できます。
- **Third-party Providers**: 内蔵プロバイダーを選択し、API キーで接続します（DeepSeek、MiniMax、Z.AI、Idealab、ModelScope、OpenRouter、Requesty）。
- **Custom Provider**: ローカルサーバー、プロキシ、未サポートのプロバイダーに手動で接続します。OpenAI、Anthropic、Gemini およびその他の互換エンドポイントをサポートします。

> [!note]
>
> **Qwen OAuth** は選択可能なダイアログエントリではなくなりました。その無料ティアは 2026-04-15 に廃止されました。以下では、ハードコードされた廃止済みプロバイダーとしてのみドキュメント化されています。

## オプション 1: Qwen OAuth（廃止済み）

> [!warning]
>
> Qwen OAuth の無料ティアは 2026-04-15 に廃止されました。既存のキャッシュされたトークンは一時的に動作し続ける可能性がありますが、新しいリクエストは拒否されます。Alibaba Cloud Coding Plan、[OpenRouter](https://openrouter.ai)、[Fireworks AI](https://app.fireworks.ai)、または他のプロバイダーに切り替えてください。`qwen` を実行し、`/auth` を使用して設定してください。

- **仕組み**: 初回起動時に、Qwen Code がブラウザのログインページを開きます。認証が完了すると、認証情報がローカルにキャッシュされ、通常は再度ログインする必要はありません。
- **必要条件**: `qwen.ai` アカウント + インターネットアクセス（少なくとも初回ログイン時）。
- **利点**: API キーの管理が不要、自動的に認証情報がリフレッシュされる。
- **費用とクォータ**: 無料ティアは 2026-04-15 をもって廃止されました。

CLI を起動し、ブラウザのフローに従ってください:

```bash
qwen
```

Qwen OAuth は `/auth` ダイアログで選択可能なエントリとしては提供されなくなりました。`/auth` を実行し、現在のオプション（Alibaba ModelStudio、Third-party Providers、または Custom Provider）のいずれかを選択してください。

> [!note]
>
> 非対話型またはヘッドレス環境（CI、SSH、コンテナなど）では、通常 OAuth のブラウザログインフローを完了**できません**。その場合は、Alibaba Cloud Coding Plan または API Key 認証方式を使用してください。

## 💳 オプション 2: Alibaba Cloud Coding Plan

多様なモデルオプションとより高い利用クォータを予測可能なコストで利用したい場合に使用します。

- **仕組み**: Coding Plan に月額固定料金でサブスクライブし、専用エンドポイントとサブスクリプション API キーを使用するように Qwen Code を設定します。
- **必要条件**: アカウントのリージョンに応じて、[Alibaba Cloud ModelStudio（北京）](https://bailian.console.aliyun.com/cn-beijing?tab=coding-plan#/efm/coding-plan-index) または [Alibaba Cloud ModelStudio（国際）](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index) から有効な Coding Plan サブスクリプションを取得してください。
- **利点**: 多様なモデルオプション、より高い利用クォータ、予測可能な月額コスト、幅広いモデル（Qwen、GLM、Kimi、Minimax など）へのアクセス。
- **費用とクォータ**: Aliyun ModelStudio Coding Plan のドキュメントを参照してください [北京](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3005961) [国際](https://modelstudio.console.alibabacloud.com/?tab=doc#/doc/?type=model&url=2840914)。

Alibaba Cloud Coding Plan は2つのリージョンで利用可能です:

| リージョン                    | コンソール URL                                                               |
| ----------------------------- | ---------------------------------------------------------------------------- |
| Aliyun ModelStudio（北京）    | [bailian.console.aliyun.com](https://bailian.console.aliyun.com)             |
| Alibaba Cloud（国際）         | [bailian.console.alibabacloud.com](https://bailian.console.alibabacloud.com) |

### インタラクティブセットアップ

ターミナルで `qwen` を入力して Qwen Code を起動し、`/auth` コマンドを実行して **Alibaba ModelStudio** を選択し、サブメニューから **Coding Plan** を選択します。リージョンを選択し、`sk-sp-xxxxxxxxx` キーを入力します。

認証後、`/model` コマンドを使用して、Alibaba Cloud Coding Plan でサポートされているすべてのモデル（qwen3.5-plus、qwen3.6-plus、qwen3.7-plus、qwen3-coder-plus、qwen3-coder-next、qwen3-max-2026-01-23、glm-5、glm-4.7、kimi-k2.5、MiniMax-M2.5 を含む）を切り替えることができます。

### ヘッドレスまたはスクリプトでのセットアップ

CI、コンテナ、スクリプトの場合は、削除された `qwen auth coding-plan` コマンドの代わりに、環境変数または `settings.json` で Coding Plan を設定します。

```bash
export BAILIAN_CODING_PLAN_API_KEY="sk-sp-xxxxxxxxx"
export OPENAI_BASE_URL="https://coding.dashscope.aliyuncs.com/v1"
export OPENAI_MODEL="qwen3-coder-plus"
```

中国（北京）エンドポイントには `https://coding.dashscope.aliyuncs.com/v1` を、国際エンドポイントには `https://coding-intl.dashscope.aliyuncs.com/v1` を使用してください。

### 代替方法: `settings.json` による設定

インタラクティブな `/auth` フローをスキップしたい場合は、`~/.qwen/settings.json` に以下を追加します:

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
> Coding Plan は標準の Dashscope エンドポイントとは異なる専用エンドポイント（`https://coding.dashscope.aliyuncs.com/v1`）を使用します。正しい `baseUrl` を使用していることを確認してください。

## 🚀 オプション 3: API Key（柔軟性重視）

OpenAI、Anthropic、Google、Azure OpenAI、OpenRouter、Requesty、ModelScope、またはセルフホストエンドポイントなどのサードパーティプロバイダーに接続したい場合に使用します。複数のプロトコルとプロバイダーをサポートします。

### 推奨: `settings.json` による一元ファイル設定

API Key 認証を始める最も簡単な方法は、すべてを単一の `~/.qwen/settings.json` ファイルにまとめることです。以下に、すぐに使える完全な例を示します:

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

各フィールドの説明:

| フィールド                      | 説明                                                                                                                                                        |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `modelProviders`                | 利用可能なモデルとその接続方法を宣言します。キー（`openai`、`anthropic`、`gemini`）は API プロトコルを表します。                                              |
| `env`                           | フォールバックとして `settings.json` に直接 API キーを保存します（最下位優先度 — シェルの `export` や `.env` ファイルが優先されます）。                     |
| `security.auth.selectedType`    | Qwen Code に起動時に使用するプロトコルを指定します（例: `openai`、`anthropic`、`gemini`）。これがない場合、インタラクティブに `/auth` を実行する必要があります。 |
| `model.name`                    | Qwen Code 起動時にアクティブにするデフォルトモデル。`modelProviders` 内の `id` 値のいずれかと一致する必要があります。                                       |

ファイルを保存したら、`qwen` を実行するだけです。インタラクティブな `/auth` セットアップは必要ありません。

> [!tip]
>
> 以下のセクションでは、各部分をより詳細に説明しています。上記のクイック例で問題なければ、[セキュリティノート](#security-notes) に進んでください。

重要な概念は**モデルプロバイダー**（`modelProviders`）です。Qwen Code は OpenAI だけでなく、複数の API プロトコルをサポートしています。`~/.qwen/settings.json` を編集して利用可能なプロバイダーとモデルを設定し、`/model` コマンドで実行時に切り替えます。

#### サポートされているプロトコル

| プロトコル          | `modelProviders` のキー | 環境変数                                                                                         | プロバイダー                                                                                          |
| ------------------- | ----------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| OpenAI 互換         | `openai`                | `OPENAI_API_KEY`、`OPENAI_BASE_URL`、`OPENAI_MODEL`                                              | OpenAI、Azure OpenAI、OpenRouter、Requesty、ModelScope、Alibaba Cloud、その他 OpenAI 互換エンドポイント |
| Anthropic           | `anthropic`             | `ANTHROPIC_API_KEY`、`ANTHROPIC_BASE_URL`、`ANTHROPIC_MODEL`                                     | Anthropic Claude                                                                                      |
| Google GenAI        | `gemini`                | `GEMINI_API_KEY`、`GEMINI_MODEL`                                                                 | Google Gemini                                                                                         |
| Vertex AI           | `vertex-ai`             | `GOOGLE_API_KEY`、`GOOGLE_MODEL`（`GOOGLE_GENAI_USE_VERTEXAI=true` を設定し、`gemini` プロトコルを使用） | Google Vertex AI                                                                                      |

#### ステップ 1: `~/.qwen/settings.json` でモデルとプロバイダーを設定する

各プロトコルで利用可能なモデルを定義します。各モデルエントリには最低限 `id` が必要です。`envKey`（API キーを保持する環境変数名）はオプションですが推奨されます。省略すると、認証タイプのデフォルト環境変数キー（例: `openai` の場合は `OPENAI_API_KEY`）にフォールバックします。

> [!important]
>
> `modelProviders` は、プロジェクト設定とユーザー設定の間のマージ競合を避けるため、ユーザースコープの `~/.qwen/settings.json` に定義することを推奨します。

`~/.qwen/settings.json` を編集します（存在しない場合は作成します）。単一ファイル内で複数のプロトコルを混在させることができます — 以下は、`modelProviders` セクションのみを示すマルチプロバイダーの例です:

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
> `modelProviders` と一緒に `env`、`security.auth.selectedType`、`model.name` も設定することを忘れないでください。詳細は[上の完全な例](#recommended-one-file-setup-via-settingsjson)を参照してください。

**`ModelConfig` フィールド（`modelProviders` 内の各エントリ）:**

| フィールド             | 必須 | 説明                                                                                                                               |
| ---------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `id`                   | はい | API に送信されるモデル ID（例: `gpt-4o`、`claude-sonnet-4-20250514`）                                                               |
| `name`                 | いいえ | `/model` ピッカーに表示される名前（デフォルトは `id`）                                                                              |
| `envKey`               | いいえ | API キーの環境変数名（例: `OPENAI_API_KEY`）。省略可能 / 推奨 — 省略時は認証タイプのデフォルト環境変数キーにフォールバックします      |
| `baseUrl`              | いいえ | API エンドポイントのオーバーライド（プロキシやカスタムエンドポイントに便利）                                                         |
| `generationConfig`     | いいえ | `timeout`、`maxRetries`、`samplingParams` などを微調整                                                                             |

> [!note]
>
> `settings.json` の `env` フィールドを使用する場合、認証情報は平文で保存されます。セキュリティを高めるには、`.env` ファイルまたはシェルの `export` を推奨します。詳細は[ステップ 2](#step-2-set-environment-variables) を参照してください。

完全な `modelProviders` スキーマと `generationConfig`、`customHeaders`、`extra_body` などの高度なオプションについては、[モデルプロバイダーリファレンス](model-providers.md) を参照してください。

#### ステップ 2: 環境変数を設定する

Qwen Code は環境変数（モデル設定の `envKey` で指定）から API キーを読み取ります。以下に、**優先度が高い順** に複数の設定方法を示します:

**1. シェル環境 / `export`（最優先）**

シェルプロファイル（`~/.zshrc`、`~/.bashrc` など）に直接設定するか、起動前にインラインで設定します:

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

Qwen Code は最初に見つかった `.env` ファイルを自動的に読み込みます（変数は**複数ファイル間でマージされません**）。`process.env` にまだ存在しない変数のみが読み込まれます。

検索順序（カレントディレクトリから上位に向かって探索）:

1. `.qwen/.env`（推奨 — Qwen Code の変数を他のツールから分離）
2. `.env`

見つからない場合は、**ホームディレクトリ**にフォールバックします:

3. `~/.qwen/.env`
4. `~/.env`

> [!tip]
>
> `.qwen/.env` は、他のツールとの競合を避けるために `.env` よりも推奨されます。`DEBUG` や `DEBUG_MODE` などの一部の変数は、Qwen Code の動作に干渉しないよう、プロジェクトレベルの `.env` ファイルから除外されています。

**3. `settings.json` → `env` フィールド（最下位優先度）**

`~/.qwen/settings.json` の `env` キーの下に直接 API キーを定義することもできます。これらは**最下位優先度のフォールバック**として読み込まれ、システム環境または `.env` ファイルでまだ設定されていない変数にのみ適用されます。

```json
{
  "env": {
    "DASHSCOPE_API_KEY": "sk-...",
    "OPENAI_API_KEY": "sk-...",
    "ANTHROPIC_API_KEY": "sk-ant-..."
  }
}
```

これは上記の[一元ファイル設定例](#recommended-one-file-setup-via-settingsjson)で使用されているアプローチです。すべてを1か所にまとめられる便利さがありますが、`settings.json` は共有または同期される可能性があることに注意してください。機密情報には `.env` ファイルを推奨します。

**優先度のまとめ:**

| 優先度    | ソース                              | 上書き動作                                       |
| --------- | ----------------------------------- | ------------------------------------------------ |
| 1（最優先） | CLI フラグ（`--openai-api-key`）     | 常に最優先                                       |
| 2         | システム環境変数（`export`、インライン） | `.env` および `settings.json` → `env` を上書き   |
| 3         | `.env` ファイル                      | システム環境変数にない場合のみ設定                |
| 4（最下位） | `settings.json` → `env`             | システム環境変数または `.env` にない場合のみ設定  |

#### ステップ 3: `/model` でモデルを切り替える

Qwen Code 起動後、`/model` コマンドを使用して、設定されたすべてのモデル間で切り替えます。モデルはプロトコルごとにグループ化されます:

```
/model
```

ピッカーには、`modelProviders` 設定からのすべてのモデルがプロトコル（例: `openai`、`anthropic`、`gemini`）ごとにグループ化されて表示されます。選択内容はセッション間で保持されます。

コマンドライン引数を使用してモデルを直接切り替えることもできます。これは複数のターミナルで作業する場合に便利です。

```bash
# 1つのターミナルで
qwen --model "qwen3-coder-plus"

# 別のターミナルで
qwen --model "qwen3.5-plus"
```

## 削除された `qwen auth` CLI コマンド

スタンドアロンの `qwen auth` CLI コマンドは削除されました。代わりに以下の方法を使用してください:

| 以前のユースケース                | 代替方法                                                                                         |
| -------------------------------- | ------------------------------------------------------------------------------------------------ |
| インタラクティブな認証設定        | `qwen` を実行し、`/auth` を使用                                                                   |
| Coding Plan の設定                | `/auth` を使用するか、Coding Plan のベース URL と共に `BAILIAN_CODING_PLAN_API_KEY` を設定        |
| OpenRouter の設定                 | `/auth` を使用するか、`OPENROUTER_API_KEY` と `OPENAI_BASE_URL=https://openrouter.ai/api/v1` を設定 |
| Requesty の設定                   | `/auth` を使用するか、`REQUESTY_API_KEY` と `OPENAI_BASE_URL=https://router.requesty.ai/v1` を設定  |
| API キーまたはカスタムプロバイダーの設定 | `~/.qwen/settings.json`、`.env`、またはプロバイダー固有の環境変数を設定                         |
| 現在の認証状態の確認               | Qwen Code 内で `/doctor` を実行                                                                  |
| OAuth ブラウザフロー              | `qwen` をインタラクティブに実行し、`/auth` を使用。OAuth は環境変数のみでは設定できません       |

`qwen auth status` などのレガシー呼び出しは、移行パスを示す削除通知を表示するようになりました。

## セキュリティノート

- API キーをバージョン管理にコミットしないでください。
- プロジェクトローカルのシークレットには `.qwen/.env` を推奨します（git から除外してください）。
- 認証情報を確認するためにターミナル出力に表示される場合は、その出力を機密情報として扱ってください。