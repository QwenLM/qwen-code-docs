# 認証

Qwen Code では、以下の 3 種類の認証方法をサポートしています。CLI の実行方法に最も適したものを選択してください。

- **Qwen OAuth**: ブラウザで `qwen.ai` アカウントにサインインします。1 日あたりのクォータ付きで無料です。
- **Alibaba Cloud Coding プラン**: Alibaba Cloud から取得した API キーを使用します。有料サブスクリプションで、多様なモデルオプションとより高いクォータが利用可能です。
- **API キー**: 自分で用意した API キーを使用します。柔軟性が高く、ご自身の要件に合わせて利用できます。OpenAI、Anthropic、Gemini およびその他の互換エンドポイントをサポートしています。

## オプション 1: Qwen OAuth（無料）

最もシンプルなセットアップを希望し、Qwen モデルを使用する場合にこの方法を選択してください。

- **動作原理**: 初回起動時に、Qwen Code がブラウザのログインページを開きます。ログイン完了後、認証情報はローカルにキャッシュされるため、通常は再ログインする必要はありません。
- **前提条件**: `qwen.ai` アカウントとインターネット接続（初回ログイン時のみ必須）。
- **メリット**: API キーの管理が不要、認証情報の自動更新。
- **コストとクォータ**: 無料。クォータは **1 分あたり 60 回のリクエスト**、**1 日あたり 1,000 回のリクエスト**。

CLI を起動し、ブラウザでのフローに従ってください：

```bash
qwen
```

> [!note]
>
> 非対話型またはヘッドレス環境（例：CI、SSH、コンテナなど）では、通常 **OAuth のブラウザログインフローを完了できません**。  
> このような場合は、Alibaba Cloud Coding Plan または API キーによる認証方法をご利用ください。

## 💳 オプション 2：Alibaba Cloud コーディングプラン

多様なモデル選択肢と高い利用クォータを備えた、予測可能なコストで利用したい場合にご利用ください。

- **仕組み**: 固定の月額料金でコーディングプランをサブスクライブし、その後 Qwen Code を専用エンドポイントおよびサブスクリプション用 API キーを使用するよう設定します。
- **前提条件**: アカウントのリージョンに応じて、[Aliyun Bailian](https://bailian.console.aliyun.com/?tab=model#/efm/coding_plan) または [Alibaba Cloud](https://bailian.console.alibabacloud.com/?tab=model#/efm/coding_plan) から有効なコーディングプランのサブスクリプションを取得してください。
- **メリット**: 多様なモデル選択肢、高い利用クォータ、予測可能な月額コスト、幅広いモデル（Qwen、GLM、Kimi、Minimax など）へのアクセスが可能です。
- **料金とクォータ**: [Aliyun Bailian コーディングプランのドキュメント](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3005961)をご確認ください。

Alibaba Cloud コーディングプランは、以下の 2 つのリージョンでご利用いただけます。

| リージョン                           | コンソール URL                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------- |
| Aliyun Bailian（aliyun.com）         | [bailian.console.aliyun.com](https://bailian.console.aliyun.com)               |
| Alibaba Cloud（alibabacloud.com）    | [bailian.console.alibabacloud.com](https://bailian.console.alibabacloud.com) |

### 対話式セットアップ

ターミナルで `qwen` を入力して Qwen Code を起動し、`/auth` コマンドを実行して **Alibaba Cloud Coding Plan** を選択します。次に、地域を選択し、`sk-sp-xxxxxxxxx` 形式のキーを入力します。

認証が完了したら、`/model` コマンドを使用して、Alibaba Cloud Coding Plan でサポートされているすべてのモデル（`qwen3.5-plus`、`qwen3-coder-plus`、`qwen3-coder-next`、`qwen3-max`、`glm-4.7`、`kimi-k2.5`）間を切り替えます。

### 代替方法：`settings.json` を使用した設定

対話型の `/auth` フローをスキップしたい場合は、`~/.qwen/settings.json` に以下の内容を追加してください。

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3-coder-plus",
        "name": "qwen3-coder-plus (Coding Plan)",
        "baseUrl": "https://coding.dashscope.aliyuncs.com/v1",
        "description": "Alibaba Cloud Coding Plan の qwen3-coder-plus",
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
> Coding Plan では、標準の Dashscope エンドポイントとは異なる専用エンドポイント (`https://coding.dashscope.aliyuncs.com/v1`) を使用します。正しい `baseUrl` を指定していることを確認してください。

## 🚀 オプション 3: API キー（柔軟性あり）

OpenAI、Anthropic、Google、Azure OpenAI、OpenRouter、ModelScope、または自己ホスト型のエンドポイントなど、サードパーティ製プロバイダーに接続する場合に使用します。複数のプロトコルおよびプロバイダーに対応しています。

### 推奨：`settings.json` を使った単一ファイル設定

API キー認証を始める最も簡単な方法は、すべての設定を単一の `~/.qwen/settings.json` ファイルに記述することです。以下に、すぐに使える完全な例を示します：

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

| フィールド                        | 説明                                                                                                                                              |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `modelProviders`                  | 利用可能なモデルとその接続方法を宣言します。キー（`openai`、`anthropic`、`gemini`）は、対応する API プロトコルを表します。                         |
| `env`                               | API キーを `settings.json` 内に直接格納するフォールバック設定です（優先度が最も低く、シェルの `export` や `.env` ファイルが優先されます）。         |
| `security.auth.selectedType`        | Qwen Code が起動時に使用するプロトコル（例：`openai`、`anthropic`、`gemini`）を指定します。この設定がない場合、インタラクティブに `/auth` コマンドを実行する必要があります。 |
| `model.name`                        | Qwen Code 起動時にデフォルトで有効化されるモデル名です。`modelProviders` 内のいずれかの `id` 値と一致する必要があります。                              |

ファイルを保存した後は、単に `qwen` を実行するだけで、インタラクティブな `/auth` 設定は不要です。

> [!tip]
>
> 以降のセクションでは、上記の各項目についてさらに詳しく説明します。上記の簡易例がそのまま動作する場合は、[セキュリティに関する注意事項](#security-notes) まで読み飛ばして構いません。

重要な概念は **モデルプロバイダー**（`modelProviders`）です。Qwen Code は OpenAI だけでなく、複数の API プロトコルに対応しています。`~/.qwen/settings.json` を編集することで利用可能なプロバイダーとモデルを設定し、実行時に `/model` コマンドで切り替えることができます。

#### サポートされるプロトコル

| プロトコル             | `modelProviders` キー | 環境変数                                                      | プロバイダー                                                                                   |
| ---------------------- | --------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| OpenAI 互換            | `openai`              | `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`          | OpenAI、Azure OpenAI、OpenRouter、ModelScope、Alibaba Cloud、および任意の OpenAI 互換エンドポイント |
| Anthropic              | `anthropic`           | `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_MODEL` | Anthropic Claude                                                                               |
| Google GenAI           | `gemini`              | `GEMINI_API_KEY`, `GEMINI_MODEL`                             | Google Gemini                                                                                  |

#### ステップ 1: `~/.qwen/settings.json` でモデルとプロバイダーを設定する

各プロトコルで利用可能なモデルを定義します。各モデルエントリには、最低限 `id` と `envKey`（API キーを保持する環境変数名）が必要です。

> [!important]
>
> プロジェクト設定とユーザー設定のマージコンフリクトを回避するため、`modelProviders` はユーザー範囲の `~/.qwen/settings.json` に定義することを推奨します。

`~/.qwen/settings.json` を編集します（存在しない場合は新規作成してください）。単一のファイルに複数のプロトコルを混在させることができます。以下は、`modelProviders` セクションのみを示すマルチプロバイダーの例です：

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
> `modelProviders` に加えて、`env`、`security.auth.selectedType`、`model.name` も設定することをお忘れなく。参考として、[上記の完全な例](#recommended-one-file-setup-via-settingsjson) をご覧ください。

**`ModelConfig` のフィールド（`modelProviders` 内の各エントリ）：**

| フィールド             | 必須 | 説明                                                                 |
| ---------------------- | ---- | -------------------------------------------------------------------- |
| `id`                   | はい | API に送信されるモデル ID（例：`gpt-4o`、`claude-sonnet-4-20250514`） |
| `name`                 | いいえ | `/model` ピッカーに表示される名前（デフォルトは `id`）               |
| `envKey`               | はい | API キーの環境変数名（例：`OPENAI_API_KEY`）                          |
| `baseUrl`              | いいえ | API エンドポイントの上書き（プロキシやカスタムエンドポイントで有用） |
| `generationConfig`     | いいえ | `timeout`、`maxRetries`、`samplingParams` などの微調整                |

> [!note]
>
> `settings.json` 内の `env` フィールドを使用すると、認証情報が平文で保存されます。セキュリティを高めるには、`.env` ファイルまたはシェルの `export` を使用してください。詳細は [ステップ 2](#step-2-set-environment-variables) を参照してください。

`modelProviders` の完全なスキーマおよび `generationConfig`、`customHeaders`、`extra_body` などの高度なオプションについては、[モデルプロバイダーのリファレンス](model-providers.md) をご覧ください。

#### ステップ 2: 環境変数を設定する

Qwen Code は、環境変数（モデル設定の `envKey` で指定）から API キーを読み取ります。これらの環境変数を設定する方法は複数あり、以下に**優先順位の高い順**に示します。

**1. シェル環境 / `export`（最も優先度が高い）**

シェルのプロファイル（`~/.zshrc`、`~/.bashrc` など）に直接設定するか、起動前にコマンドライン上でインラインで設定します。

```bash
# Alibaba Dashscope
export DASHSCOPE_API_KEY="sk-..."

# OpenAI / OpenAI 互換サービス
export OPENAI_API_KEY="sk-..."

# Anthropic
export ANTHROPIC_API_KEY="sk-ant-..."

# Google GenAI
export GEMINI_API_KEY="AIza..."
```

**2. `.env` ファイル**

Qwen Code は、見つかった **最初の** `.env` ファイルを自動的に読み込みます（複数のファイル間で変数は **マージされません**）。`process.env` にすでに存在しない変数のみが読み込まれます。

検索順序（現在のディレクトリから始まり、ルート `/` に向かって上位ディレクトリへと遡ります）：

1. `.qwen/.env`（推奨 — Qwen Code の変数を他のツールから分離できます）
2. `.env`

何も見つからない場合、**ホームディレクトリ**にフォールバックします：

3. `~/.qwen/.env`
4. `~/.env`

> [!tip]
>
> 衝突を避けるため、`.env` よりも `.qwen/.env` を使用することを推奨します。一部の変数（例：`DEBUG` や `DEBUG_MODE`）は、Qwen Code の動作への干渉を防ぐため、プロジェクトレベルの `.env` ファイルでは除外されます。

**3. `settings.json` → `env` フィールド（最優先度が最も低い）**

また、API キーを `~/.qwen/settings.json` の `env` キー直下に直接定義することもできます。これは **最優先度が最も低いフォールバック** として読み込まれます — システム環境変数や `.env` ファイルによって既に設定されていない場合にのみ適用されます。

```json
{
  "env": {
    "DASHSCOPE_API_KEY": "sk-...",
    "OPENAI_API_KEY": "sk-...",
    "ANTHROPIC_API_KEY": "sk-ant-..."
  }
}
```

これは、上記の「[1 ファイルによるセットアップ例](#recommended-one-file-setup-via-settingsjson)」で採用されている方法です。すべてを 1 か所にまとめるには便利ですが、`settings.json` は共有・同期される可能性がある点に注意してください。機密性の高いシークレットについては、`.env` ファイルの使用を推奨します。

**優先度のまとめ：**

| 優先度      | ソース                         | 上書き動作                                               |
| ----------- | ------------------------------ | -------------------------------------------------------- |
| 1（最も高い） | CLI フラグ（`--openai-api-key`） | 常に優先されます                                         |
| 2           | システム環境変数（`export`、コマンドライン内） | `.env` ファイルおよび `settings.json` → `env` を上書きします |
| 3           | `.env` ファイル                  | システム環境変数に存在しない場合のみ設定されます         |
| 4（最も低い） | `settings.json` → `env`          | システム環境変数および `.env` ファイルにも存在しない場合のみ設定されます |

#### ステップ 3: `/model` コマンドでモデルを切り替える

Qwen Code を起動した後、`/model` コマンドを使用して、設定済みのすべてのモデル間を切り替えます。モデルはプロトコルごとにグループ化されます。

```
/model
```

選択ツールには、`modelProviders` 設定で定義されたすべてのモデルが、そのプロトコル（例：`openai`、`anthropic`、`gemini`）ごとにグループ化されて表示されます。選択内容はセッション間で保持されます。

また、コマンドライン引数を直接指定してモデルを切り替えることもできます。これは複数のターミナルで作業する際に便利です。

```bash

# 1 つのターミナルで

qwen --model "qwen3-coder-plus"

# 別のターミナルで

qwen --model "qwen3.5-plus"
```

## セキュリティに関する注意事項

- API キーをバージョン管理システムにコミットしないでください。
- プロジェクト固有のシークレットには `.qwen/.env` を使用することを推奨します（ただし、Git には含めないでください）。
- 認証のための資格情報が表示される場合、ターミナルの出力も機密情報として取り扱ってください。