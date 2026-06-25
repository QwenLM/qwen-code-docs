# 認証

Qwen Code の初回起動時の `/auth` メニューには、3 つのトップレベルオプションがあります。CLI の使い方に合わせて選択してください：

- **Alibaba ModelStudio**: 公式推奨のセットアップ。サブメニューで **Coding Plan**（個人開発者向け · 週次クォータ付き）、**Token Plan**（チーム・企業向け · 従量課金制・専用エンドポイント）、または **Standard API Key**（既存の ModelStudio API キーで接続）を選べます。
- **Third-party Providers**: 組み込みプロバイダーを選択し API キーで接続します（DeepSeek、MiniMax、Z.AI、Idealab、ModelScope、OpenRouter、Requesty）。
- **Custom Provider**: ローカルサーバー、プロキシ、または未サポートのプロバイダーに手動で接続します — OpenAI、Anthropic、Gemini、その他互換エンドポイントに対応。

> [!note]
>
> **Qwen OAuth** は選択可能なダイアログエントリではなくなりました — 無料ティアは 2026-04-15 に廃止されました。以下のドキュメントはハードコードされた廃止済みプロバイダーとしてのみ残しています。

## オプション 1: Qwen OAuth（廃止済み）

> [!warning]
>
> Qwen OAuth の無料ティアは 2026-04-15 に廃止されました。既存のキャッシュ済みトークンはしばらく動作し続ける場合がありますが、新しいリクエストは拒否されます。Alibaba Cloud Coding Plan、[OpenRouter](https://openrouter.ai)、[Fireworks AI](https://app.fireworks.ai)、または他のプロバイダーに切り替えてください。`qwen` を実行し `/auth` で設定してください。

- **仕組み**: 初回起動時、Qwen Code がブラウザのログインページを開きます。完了後、認証情報はローカルにキャッシュされるため、通常は再ログインは不要です。
- **要件**: `qwen.ai` アカウント + インターネット接続（初回ログイン時は必須）。
- **メリット**: API キー管理不要、自動的な認証情報の更新。
- **コスト・クォータ**: 無料ティアは 2026-04-15 に廃止されました。

CLI を起動してブラウザのフローに従ってください：

```bash
qwen
```

Qwen OAuth は `/auth` ダイアログの選択可能なエントリとして提供されなくなりました。`/auth` を実行して現在のオプション（Alibaba ModelStudio、Third-party Providers、または Custom Provider）を選択してください。

> [!note]
>
> 非インタラクティブ環境やヘッドレス環境（例: CI、SSH、コンテナ）では、通常 OAuth ブラウザログインフローを**完了できません**。
> この場合は、Alibaba Cloud Coding Plan または API Key 認証方式を使用してください。

## 💳 オプション 2: Alibaba Cloud Coding Plan

多様なモデルオプションと高いクォータで予測可能なコストを求める場合に使用してください。

- **仕組み**: 固定月額料金で Coding Plan に登録し、専用エンドポイントとサブスクリプション API キーを使用するよう Qwen Code を設定します。
- **要件**: アカウントのリージョンに応じて、[Alibaba Cloud ModelStudio（北京）](https://bailian.console.aliyun.com/cn-beijing?tab=coding-plan#/efm/coding-plan-index) または [Alibaba Cloud ModelStudio（国際版）](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index) からアクティブな Coding Plan サブスクリプションを取得してください。
- **メリット**: 多様なモデルオプション、高いクォータ、予測可能な月額コスト、幅広いモデルへのアクセス（Qwen、GLM、Kimi、Minimax など）。
- **コスト・クォータ**: Aliyun ModelStudio Coding Plan ドキュメントを参照してください [北京](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3005961) [国際版](https://modelstudio.console.alibabacloud.com/?tab=doc#/doc/?type=model&url=2840914)。

Alibaba Cloud Coding Plan は 2 つのリージョンで利用可能です：

| リージョン                      | コンソール URL                                                               |
| ------------------------------- | ---------------------------------------------------------------------------- |
| Aliyun ModelStudio（北京）      | [bailian.console.aliyun.com](https://bailian.console.aliyun.com)             |
| Alibaba Cloud（国際版）         | [bailian.console.alibabacloud.com](https://bailian.console.alibabacloud.com) |

### インタラクティブセットアップ

ターミナルで `qwen` を入力して Qwen Code を起動し、`/auth` コマンドを実行して **Alibaba ModelStudio** を選択、サブメニューから **Coding Plan** を選択します。リージョンを選択し、`sk-sp-xxxxxxxxx` キーを入力してください。

認証後、`/model` コマンドを使用して Alibaba Cloud Coding Plan でサポートされているすべてのモデル（qwen3.5-plus、qwen3.6-plus、qwen3.7-plus、qwen3-coder-plus、qwen3-coder-next、qwen3-max-2026-01-23、glm-5、glm-4.7、kimi-k2.5、MiniMax-M2.5 を含む）を切り替えられます。

### ヘッドレスまたはスクリプトによるセットアップ

CI、コンテナ、またはスクリプトの場合は、削除された `qwen auth coding-plan` コマンドの代わりに、環境変数または `settings.json` で Coding Plan を設定してください。

```bash
export BAILIAN_CODING_PLAN_API_KEY="sk-sp-xxxxxxxxx"
export OPENAI_BASE_URL="https://coding.dashscope.aliyuncs.com/v1"
export OPENAI_MODEL="qwen3-coder-plus"
```

中国（北京）エンドポイントには `https://coding.dashscope.aliyuncs.com/v1`、国際エンドポイントには `https://coding-intl.dashscope.aliyuncs.com/v1` を使用してください。

### 代替手段: `settings.json` による設定

インタラクティブな `/auth` フローをスキップしたい場合は、`~/.qwen/settings.json` に以下を追加してください：

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

## 🚀 オプション 3: API Key（柔軟）

OpenAI、Anthropic、Google、Azure OpenAI、OpenRouter、Requesty、ModelScope、またはセルフホストエンドポイントなどのサードパーティプロバイダーに接続したい場合に使用してください。複数のプロトコルとプロバイダーに対応しています。

### 推奨: `settings.json` による 1 ファイルセットアップ

API Key 認証を始める最もシンプルな方法は、すべてを 1 つの `~/.qwen/settings.json` ファイルにまとめることです。すぐに使える完全な例を以下に示します：

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

各フィールドの説明：

| フィールド                   | 説明                                                                                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `modelProviders`             | 利用可能なモデルと接続方法を宣言します。キー（`openai`、`anthropic`、`gemini`）は API プロトコルを表します。                                            |
| `env`                        | API キーを `settings.json` に直接保存するフォールバック（最低優先度 — シェルの `export` と `.env` ファイルが優先されます）。                             |
| `security.auth.selectedType` | 起動時に使用するプロトコルを Qwen Code に伝えます（例: `openai`、`anthropic`、`gemini`）。これがないと `/auth` をインタラクティブに実行する必要があります。 |
| `model.name`                 | Qwen Code 起動時にアクティブにするデフォルトモデル。`modelProviders` 内の `id` 値のいずれかと一致する必要があります。                                   |

ファイルを保存したら `qwen` を実行するだけです — インタラクティブな `/auth` セットアップは不要です。

> [!tip]
>
> 以下のセクションでは各部分を詳しく説明しています。上記のクイック例で問題なければ、[セキュリティに関する注意事項](#security-notes)まで読み飛ばしてください。

重要なコンセプトは **Model Providers**（`modelProviders`）です: Qwen Code は OpenAI だけでなく複数の API プロトコルをサポートしています。`~/.qwen/settings.json` を編集して利用可能なプロバイダーとモデルを設定し、実行時に `/model` コマンドで切り替えられます。

#### サポートされているプロトコル

| プロトコル        | `modelProviders` キー | 環境変数                                                                                             | プロバイダー                                                                                          |
| ----------------- | --------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| OpenAI 互換       | `openai`              | `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`                                                  | OpenAI、Azure OpenAI、OpenRouter、Requesty、ModelScope、Alibaba Cloud、任意の OpenAI 互換エンドポイント |
| Anthropic         | `anthropic`           | `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_MODEL`                                         | Anthropic Claude                                                                                      |
| Google GenAI      | `gemini`              | `GEMINI_API_KEY`, `GEMINI_MODEL`                                                                     | Google Gemini                                                                                         |
| Vertex AI         | `vertex-ai`           | `GOOGLE_API_KEY`, `GOOGLE_MODEL`（`GOOGLE_GENAI_USE_VERTEXAI=true` を設定; `gemini` プロトコルを使用） | Google Vertex AI                                                                                      |

#### ステップ 1: `~/.qwen/settings.json` でモデルとプロバイダーを設定する

各プロトコルで利用可能なモデルを定義します。各モデルエントリには最低限 `id` が必要です。`envKey`（API キーを保持する環境変数名）はオプションですが推奨されます — 省略した場合は認証タイプのデフォルト環境変数（例: `openai` の場合は `OPENAI_API_KEY`）にフォールバックします。

> [!important]
>
> プロジェクトとユーザーの設定間のマージ競合を避けるため、`modelProviders` はユーザースコープの `~/.qwen/settings.json` に定義することを推奨します。

`~/.qwen/settings.json` を編集してください（存在しない場合は作成）。1 つのファイルに複数のプロトコルを混在させることができます — 以下は `modelProviders` セクションのみを示すマルチプロバイダーの例です：

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
> `modelProviders` と合わせて `env`、`security.auth.selectedType`、`model.name` も設定することを忘れずに — 参考として[上記の完全な例](#recommended-one-file-setup-via-settingsjson)を参照してください。

**`ModelConfig` フィールド（`modelProviders` 内の各エントリ）:**

| フィールド         | 必須 | 説明                                                                                                                                             |
| ------------------ | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`               | Yes  | API に送信するモデル ID（例: `gpt-4o`、`claude-sonnet-4-20250514`）                                                                              |
| `name`             | No   | `/model` ピッカーでの表示名（デフォルトは `id`）                                                                                                 |
| `envKey`           | No   | API キー用の環境変数名（例: `OPENAI_API_KEY`）; オプション・推奨 — 省略時は認証タイプのデフォルト環境変数にフォールバック                         |
| `baseUrl`          | No   | API エンドポイントのオーバーライド（プロキシやカスタムエンドポイントに有用）                                                                     |
| `generationConfig` | No   | `timeout`、`maxRetries`、`samplingParams` などの細かい調整                                                                                       |

> [!note]
>
> `settings.json` の `env` フィールドを使用する場合、認証情報は平文で保存されます。セキュリティ向上のため、`.env` ファイルまたはシェルの `export` を使用してください — [ステップ 2](#step-2-set-environment-variables) を参照。

完全な `modelProviders` スキーマと `generationConfig`、`customHeaders`、`extra_body` などの高度なオプションについては、[Model Providers リファレンス](model-providers.md)を参照してください。

#### ステップ 2: 環境変数を設定する

Qwen Code はモデル設定の `envKey` で指定された環境変数から API キーを読み込みます。提供方法は複数あり、**高優先度から低優先度**の順に以下に示します：

**1. シェル環境 / `export`（最高優先度）**

シェルプロファイル（`~/.zshrc`、`~/.bashrc` など）に直接設定するか、起動前にインラインで設定します：

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

Qwen Code は最初に見つかった `.env` ファイルを自動的に読み込みます（複数ファイルにわたる変数の**マージは行われません**）。`process.env` にまだ存在しない変数のみが読み込まれます。

検索順序（カレントディレクトリから `/` に向かって上位に遡る）：

1. `.qwen/.env`（推奨 — Qwen Code の変数を他のツールから分離）
2. `.env`

何も見つからない場合は、**ホームディレクトリ**にフォールバックします：

3. `~/.qwen/.env`
4. `~/.env`

> [!tip]
>
> 他のツールとの競合を避けるため、`.env` より `.qwen/.env` が推奨されます。一部の変数（`DEBUG` や `DEBUG_MODE` など）はプロジェクトレベルの `.env` ファイルから除外され、Qwen Code の動作への干渉を防ぎます。

**3. `settings.json` → `env` フィールド（最低優先度）**

`~/.qwen/settings.json` の `env` キーの下に API キーを直接定義することもできます。これらは**最低優先度のフォールバック**として読み込まれ、システム環境や `.env` ファイルで変数がまだ設定されていない場合にのみ適用されます。

```json
{
  "env": {
    "DASHSCOPE_API_KEY": "sk-...",
    "OPENAI_API_KEY": "sk-...",
    "ANTHROPIC_API_KEY": "sk-ant-..."
  }
}
```

これは上記の[1 ファイルセットアップの例](#recommended-one-file-setup-via-settingsjson)で使用しているアプローチです。すべてを 1 か所にまとめるのに便利ですが、`settings.json` は共有または同期される可能性があることに注意してください — 機密情報には `.env` ファイルを使用してください。

**優先度のまとめ:**

| 優先度      | ソース                         | 上書き動作                                      |
| ----------- | ------------------------------ | ----------------------------------------------- |
| 1（最高）   | CLI フラグ（`--openai-api-key`） | 常に優先                                        |
| 2           | システム環境（`export`、インライン） | `.env` と `settings.json` → `env` を上書き     |
| 3           | `.env` ファイル                 | システム環境にない場合のみ設定                  |
| 4（最低）   | `settings.json` → `env`        | システム環境にも `.env` にもない場合のみ設定    |

#### ステップ 3: `/model` でモデルを切り替える

Qwen Code を起動後、`/model` コマンドを使用して設定済みのすべてのモデルを切り替えられます。モデルはプロトコルでグループ化されています：

```
/model
```

ピッカーには `modelProviders` 設定のすべてのモデルがプロトコル（例: `openai`、`anthropic`、`gemini`）でグループ化されて表示されます。選択はセッションをまたいで保持されます。

コマンドライン引数でモデルを直接切り替えることもでき、複数のターミナルで作業する際に便利です。

```bash
# 1 つ目のターミナルで

qwen --model "qwen3-coder-plus"

# 別のターミナルで

qwen --model "qwen3.5-plus"
```

## 削除された `qwen auth` CLI コマンド

スタンドアロンの `qwen auth` CLI コマンドは削除されました。代わりに以下の方法を使用してください：

| 以前のユースケース               | 代替手段                                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------------------- |
| インタラクティブな認証セットアップ | `qwen` を実行し、`/auth` を使用                                                             |
| Coding Plan のセットアップ       | `/auth` を使用、または Coding Plan のベース URL と共に `BAILIAN_CODING_PLAN_API_KEY` を設定 |
| OpenRouter のセットアップ        | `/auth` を使用、または `OPENROUTER_API_KEY` と `OPENAI_BASE_URL=https://openrouter.ai/api/v1` を設定 |
| Requesty のセットアップ          | `/auth` を使用、または `REQUESTY_API_KEY` と `OPENAI_BASE_URL=https://router.requesty.ai/v1` を設定 |
| API キーまたはカスタムプロバイダーのセットアップ | `~/.qwen/settings.json`、`.env`、またはプロバイダー固有の環境変数を設定 |
| 現在の認証状態の確認             | Qwen Code 内で `/doctor` を実行                                                             |
| OAuth ブラウザフロー             | `qwen` をインタラクティブに実行し `/auth` を使用; OAuth は環境変数のみでは設定不可          |

`qwen auth status` などのレガシーな呼び出しは、これらの移行パスと共に削除通知を表示します。

## セキュリティに関する注意事項 {#security-notes}

- API キーをバージョン管理にコミットしないでください。
- プロジェクトローカルの機密情報には `.qwen/.env` を使用してください（git から除外することを忘れずに）。
- 検証のために認証情報を出力する場合は、ターミナルの出力を機密情報として扱ってください。
