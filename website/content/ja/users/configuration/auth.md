# 認証

Qwen Code は2つの認証方法をサポートしています。CLI の実行方法に合わせて、どちらかを選択してください。

- **Qwen OAuth (推奨)**: ブラウザで `qwen.ai` アカウントを使用してサインインします。
- **API キー**: API キーを使用して、サポートされているプロバイダに接続します。より柔軟性があり、OpenAI、Anthropic、Google GenAI、Alibaba Cloud Bailian、およびその他の互換性のあるエンドポイントをサポートしています。

![](https://gw.alicdn.com/imgextra/i4/O1CN01yXSXc91uYxJxhJXBF_!!6000000006050-2-tps-2372-916.png)

## 👍 オプション 1: Qwen OAuth (推奨 & 無料)

Qwen モデルを使用しており、最もシンプルなセットアップを行いたい場合に使用してください。

- **仕組み**: 最初の起動時に、Qwen Code がブラウザのログインページを開きます。完了後、認証情報はローカルにキャッシュされるため、通常は再度ログインする必要はありません。
- **要件**: `qwen.ai` アカウント + インターネットアクセス（最初のログイン時のみ）
- **利点**: API キー管理不要、認証情報の自動更新
- **料金と割当**: 無料で、**1分あたり60リクエスト**、**1日あたり1,000リクエスト**の割当があります。

CLI を起動し、ブラウザのフローに従ってください：

```bash
qwen
```

> [!note]
>
> 非対話型またはヘッドレス環境（例：CI、SSH、コンテナ）では、通常 OAuth ブラウザログインフローを完了**できません**。  
> このような場合は、API キー認証方式を使用してください。

## 🚀 オプション 2: API キー (柔軟性あり)

どのプロバイダーおよびモデルを使用するかをより柔軟に制御したい場合に使用します。OpenAI、Anthropic、Google GenAI、アリババクラウド百炼、Azure OpenAI、OpenRouter、ModelScope、またはセルフホスト互換エンドポイントなど、複数のプロトコルおよびプロバイダーをサポートしています。

### 推奨: `settings.json` による単一ファイル設定

APIキー認証を始める最も簡単な方法は、すべてを1つの `~/.qwen/settings.json` ファイルにまとめることです。以下は完全で即座に使用可能な例です：

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3-coder-plus",
        "name": "qwen3-coder-plus",
        "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "description": "Dashscope 経由の Qwen3-Coder",
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

各フィールドの説明:

| フィールド                     | 説明                                                                                                                                              |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `modelProviders`               | 利用可能なモデルとそれらへの接続方法を宣言します。キー（`openai`、`anthropic`、`gemini`、`vertex-ai`）はAPIプロトコルを表します。                |
| `env`                          | APIキーを `settings.json` 内に直接格納します（フォールバックとして使用されます。優先度は最低で、シェルの `export` や `.env` ファイルが優先されます）。 |
| `security.auth.selectedType`   | Qwen Code起動時に使用するプロトコルを指定します（例: `openai`、`anthropic`、`gemini`）。この設定がない場合、対話的な `/auth` 実行が必要になります。 |
| `model.name`                   | Qwen Code起動時にアクティブになるデフォルトモデルです。`modelProviders` 内のいずれかの `id` 値と一致している必要があります。                      |

ファイルを保存後、`qwen` を実行するだけで、対話的な `/auth` 設定は不要です。

> [!tip]
>
> 以下のセクションでは各部分について詳しく説明しています。上記の簡易例が動作する場合は、[セキュリティに関する注意点](#security-notes) までスキップしてください。

### オプション1: コーディングプラン（アリババクラウド バイリアン）

qwen3-coder-plus モデルに対して、より高い利用割当枠と予測可能なコストを求める場合にご利用ください。

- **仕組み**: 固定月額料金でコーディングプランに登録し、Qwen Code を設定して専用エンドポイントとサブスクリプションの API キーを使用します。
- **要件**: [アリババクラウド バイリアン](https://bailian.console.aliyun.com/cn-beijing/?tab=globalset#/efm/coding_plan) から有効なコーディングプランのサブスクリプションを取得してください。
- **メリット**: 利用割当枠が増加し、毎月の費用が予測可能になり、最新の qwen3-coder-plus モデルにアクセスできます。
- **料金と割当枠**: [アリババクラウド バイリアン コーディングプランのドキュメント](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3005961) をご確認ください。

ターミナルで `qwen` と入力して Qwen Code を起動し、`/auth` コマンドを入力して `API-KEY` を選択します。

![](https://gw.alicdn.com/imgextra/i4/O1CN01yXSXc91uYxJxhJXBF_!!6000000006050-2-tps-2372-916.png)

入力後、`Coding Plan` を選択します。

![](https://gw.alicdn.com/imgextra/i4/O1CN01Irk0AD1ebfop69o0r_!!6000000003890-2-tps-2308-830.png)

`sk-sp-xxxxxxxxx` キーを入力し、`/model` コマンドを使用して、バイリアンの `Coding Plan` がサポートするすべてのモデル（qwen3.5-plus、qwen3-coder-plus、qwen3-coder-next、qwen3-max、glm-4.7、kimi-k2.5 など）を切り替えて使用できます。

![](https://gw.alicdn.com/imgextra/i4/O1CN01fWArmf1kaCEgSmPln_!!6000000004699-2-tps-2304-1374.png)

**代替手段: `settings.json` によるコーディングプランの設定**

対話形式の `/auth` フローをスキップしたい場合は、`~/.qwen/settings.json` に以下を追加してください。

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3-coder-plus",
        "name": "qwen3-coder-plus (Coding Plan)",
        "baseUrl": "https://coding.dashscope.aliyuncs.com/v1",
        "description": "qwen3-coder-plus from Bailian Coding Plan",
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
> コーディングプランでは、標準の Dashscope エンドポイントとは異なる専用エンドポイント (`https://coding.dashscope.aliyuncs.com/v1`) を使用します。正しい `baseUrl` を使用していることを確認してください。

### オプション2: サードパーティのAPIキー

OpenAI、Anthropic、Google、Azure OpenAI、OpenRouter、ModelScope、またはセルフホスト型エンドポイントなどのサードパーティプロバイダに接続したい場合に使用します。

キーポイントは**モデルプロバイダ**（`modelProviders`）です。Qwen CodeはOpenAIだけでなく、複数のAPIプロトコルをサポートしています。`~/.qwen/settings.json` を編集して利用可能なプロバイダとモデルを設定し、実行時に `/model` コマンドでそれらを切り替えることができます。

#### サポートされているプロトコル

| プロトコル            | `modelProviders` キー | 環境変数                                                     | プロバイダー                                                                                        |
| --------------------- | --------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| OpenAI 互換           | `openai`              | `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`          | OpenAI、Azure OpenAI、OpenRouter、ModelScope、Alibaba Cloud Bailian、任意の OpenAI 互換エンドポイント |
| Anthropic             | `anthropic`           | `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_MODEL` | Anthropic Claude                                                                                    |
| Google GenAI          | `gemini`              | `GEMINI_API_KEY`, `GEMINI_MODEL`                             | Google Gemini                                                                                       |
| Google Vertex AI      | `vertex-ai`           | `GOOGLE_API_KEY`, `GOOGLE_MODEL`                             | Google Vertex AI                                                                                    |

#### ステップ 1: `~/.qwen/settings.json` でモデルとプロバイダを設定する

各プロトコルで利用可能なモデルを定義します。各モデルエントリには、最低限 `id` と `envKey`（APIキーを保持する環境変数名）が必要です。

> [!important]
>
> プロジェクト設定とユーザー設定のマージコンフリクトを避けるため、ユーザー範囲の `~/.qwen/settings.json` に `modelProviders` を定義することをお勧めします。

`~/.qwen/settings.json` を編集します（存在しない場合は作成してください）。1つのファイルに複数のプロトコルを混在させることができます — 以下は `modelProviders` セクションのみを示したマルチプロバイダの例です：

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
> `modelProviders` に加えて、`env`、`security.auth.selectedType`、`model.name` も忘れずに設定してください — 参照用に[上記の完全な例](#recommended-one-file-setup-via-settingsjson)を確認してください。

**`ModelConfig` フィールド（`modelProviders` 内の各エントリ）：**

| フィールド           | 必須     | 説明                                                                 |
| -------------------- | -------- | -------------------------------------------------------------------- |
| `id`                 | はい     | APIに送信されるモデルID（例: `gpt-4o`、`claude-sonnet-4-20250514`）  |
| `name`               | いいえ   | `/model` ピッカーでの表示名（デフォルトは `id`）                     |
| `envKey`             | はい     | APIキーの環境変数名（例: `OPENAI_API_KEY`）                          |
| `baseUrl`            | いいえ   | APIエンドポイントのオーバーライド（プロキシやカスタムエンドポイント用）|
| `generationConfig`   | いいえ   | `timeout`、`maxRetries`、`samplingParams` などの微調整               |

> [!note]
>
> `settings.json` の `env` フィールドを使用する場合、認証情報はプレーンテキストで保存されます。より良いセキュリティのために、`.env` ファイルまたはシェルの `export` を使用してください — [ステップ2](#step-2-set-environment-variables) を参照してください。

`generationConfig`、`customHeaders`、`extra_body` などの高度なオプションを含む完全な `modelProviders` スキーマについては、[モデルプロバイダリファレンス](model-providers.md)を参照してください。

#### ステップ 2: 環境変数を設定する

Qwen Code は、環境変数（モデル設定の `envKey` で指定）から API キーを読み取ります。以下に提供方法を示します（**優先度が高い順から低い順**）：

**1. シェル環境 / `export` （最優先）**

シェルプロファイル（`~/.zshrc`、`~/.bashrc` など）で直接設定するか、起動前にインラインで設定してください：

```bash

# Alibaba Dashscope
export DASHSCOPE_API_KEY="sk-..."

# OpenAI / OpenAI 互換
export OPENAI_API_KEY="sk-..."

# Anthropic
export ANTHROPIC_API_KEY="sk-ant-..."
```

# Google GenAI
```bash
export GEMINI_API_KEY="AIza..."
```

**2. `.env` ファイル**

Qwen Code は見つかった**最初の** `.env` ファイルを自動的に読み込みます（変数は複数のファイル間で**マージされません**）。`process.env` に既に存在しない変数のみが読み込まれます。

検索順序（現在ディレクトリから `/` 方向へ上方向に移動）：

1. `.qwen/.env` （推奨 — Qwen Code の変数を他のツールから分離できます）
2. `.env`

何も見つからない場合、**ホームディレクトリ**に戻ります：

3. `~/.qwen/.env`
4. `~/.env`

> [!tip]
>
> 他ツールとの競合を避けるため、`.env` よりも `.qwen/.env` を使用することを推奨します。一部の変数（`DEBUG` や `DEBUG_MODE` など）は、Qwen Code の動作に干渉しないようにプロジェクトレベルの `.env` ファイルから除外されます。

**3. `settings.json` → `env` フィールド（最低優先度）**

`~/.qwen/settings.json` 内の `env` キー配下に直接 API キーを定義することも可能です。これらは**最低優先度のフォールバック**として読み込まれます — 変数がシステム環境または `.env` ファイルによって既に設定されていない場合にのみ適用されます。

```json
{
  "env": {
    "DASHSCOPE_API_KEY": "sk-...",
    "OPENAI_API_KEY": "sk-...",
    "ANTHROPIC_API_KEY": "sk-ant-..."
  }
}
```

これは上記の[単一ファイルセットアップ例](#recommended-one-file-setup-via-settingsjson)で使用されている方法です。すべてを一つの場所にまとめておくには便利ですが、`settings.json` は共有または同期される可能性があることに注意してください — 機密なシークレットについては `.env` ファイルを優先してください。

**優先度のまとめ：**

| 優先度      | ソース                           | 上書き動作                                 |
| ----------- | -------------------------------- | ------------------------------------------ |
| 1（最高）   | CLI フラグ（`--openai-api-key`） | 常に勝ちます                               |
| 2           | システム環境（`export`、インライン） | `.env` および `settings.env` を上書き      |
| 3           | `.env` ファイル                  | システム環境にない場合のみ設定             |
| 4（最低）   | `settings.json` → `env`          | システム環境や `.env` にない場合のみ設定   |

#### ステップ 3: `/model` でモデルを切り替える

Qwen Code を起動した後、`/model` コマンドを使用して設定されたすべてのモデル間で切り替えることができます。モデルはプロトコルごとにグループ化されます。

```
/model
```

ピッカーには `modelProviders` 設定からすべてのモデルが表示され、プロトコル (例: `openai`、`anthropic`、`gemini`) ごとにグループ化されます。選択内容はセッション間で保持されます。

コマンドライン引数を使用してモデルを直接切り替えることもでき、複数のターミナルで作業する場合に便利です。

```bash

# あるターミナルでは

qwen --model "qwen3-coder-plus"

# 別のターミナルでは

qwen --model "qwen3-coder-next"
```

## セキュリティに関する注意点

- API キーをバージョン管理にコミットしないでください。
- プロジェクトローカルなシークレットには `.qwen/.env` を使用することを推奨します (そしてそれを git に含めないようにしてください)。
- 認証情報を確認のために出力する場合は、ターミナルの出力を機密情報として扱ってください。