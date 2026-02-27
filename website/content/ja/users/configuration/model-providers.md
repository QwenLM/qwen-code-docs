# モデルプロバイダー

Qwen Code では、`settings.json` 内の `modelProviders` 設定を通じて複数のモデルプロバイダーを構成できます。これにより、`/model` コマンドを使用して異なる AI モデルやプロバイダー間を切り替えることができます。

## 概要

`modelProviders` を使用して、認証タイプごとのキュレーションされたモデルリストを宣言し、`/model` ピッカーで切り替えられるようにします。キーは有効な認証タイプ（`openai`、`anthropic`、`gemini`、`vertex-ai` など）である必要があります。各エントリには `id` が必要であり、**必ず `envKey` を含める必要があります**。また、オプションとして `name`、`description`、`baseUrl`、`generationConfig` を指定できます。認証情報は設定に永続化されることはありません。実行時に `process.env[envKey]` から読み込まれます。Qwen OAuth モデルはハードコードされており、上書きすることはできません。

> [!note]
>
> `/model` コマンドのみがデフォルト以外の認証タイプを公開します。Anthropic、Gemini、Vertex AI などは `modelProviders` 経由で定義する必要があります。`/auth` コマンドは意図的に組み込みの Qwen OAuth および OpenAI フローのみを表示します。

> [!warning]
>
> **同一 authType 内での重複したモデル ID:** 単一の `authType` 内で同じ `id` を持つ複数のモデルを定義する（例：`openai` 内に `"id": "gpt-4o"` のエントリが2つある）場合、現在サポートされていません。重複が存在する場合、**最初の出現が優先され**、その後の重複は警告とともにスキップされます。`id` フィールドは設定識別子としても、実際に API に送信されるモデル名としても使用されるため、一意な ID（例：`gpt-4o-creative`、`gpt-4o-balanced`）を使用するという回避策は有効ではありません。これは既知の制限事項であり、将来のリリースで対応予定です。

## 認証タイプ別の設定例

以下は、異なる認証タイプに対する包括的な設定例であり、利用可能なパラメータとその組み合わせを示しています。

### サポートされている認証タイプ

`modelProviders` オブジェクトのキーは、有効な `authType` 値でなければなりません。現在サポートされている認証タイプは以下の通りです：

| 認証タイプ     | 説明                                                                                     |
| -------------- | ---------------------------------------------------------------------------------------- |
| `openai`       | OpenAI 互換 API (OpenAI、Azure OpenAI、vLLM/Ollama のようなローカル推論サーバーなど)     |
| `anthropic`    | Anthropic Claude API                                                                     |
| `gemini`       | Google Gemini API                                                                        |
| `vertex-ai`    | Google Vertex AI                                                                         |
| `qwen-oauth`   | Qwen OAuth (ハードコードされており、`modelProviders` で上書きすることはできません)        |

> [!warning]
> 無効な認証タイプのキーが使用された場合 (例: `"openai-custom"` のようなタイポ)、設定は**サイレントにスキップ**され、モデルは `/model` ピッカーに表示されません。常に上記にリストされているサポートされている認証タイプの値を使用してください。

### APIリクエストに使用されるSDK

Qwen Codeは、各プロバイダーへのリクエスト送信に以下の公式SDKを使用します：

| 認証タイプ             | SDKパッケージ                                                                                 |
| ---------------------- | --------------------------------------------------------------------------------------------- |
| `openai`               | [`openai`](https://www.npmjs.com/package/openai) - 公式OpenAI Node.js SDK                     |
| `anthropic`            | [`@anthropic-ai/sdk`](https://www.npmjs.com/package/@anthropic-ai/sdk) - 公式Anthropic SDK     |
| `gemini` / `vertex-ai` | [`@google/genai`](https://www.npmjs.com/package/@google/genai) - 公式Google GenAI SDK         |
| `qwen-oauth`           | カスタムプロバイダー（DashScope互換）を使用した[`openai`](https://www.npmjs.com/package/openai) |

これは、設定する`baseUrl`が対応するSDKの期待するAPI形式と互換性を持つ必要があることを意味します。たとえば、`openai`認証タイプを使用する場合、エンドポイントはOpenAI API形式のリクエストを受け入れる必要があります。

### OpenAI互換プロバイダー (`openai`)

この認証タイプは、OpenAIの公式APIだけでなく、OpenRouterのような集約モデルプロバイダーを含む、任意のOpenAI互換エンドポイントもサポートします。

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "gpt-4o",
        "name": "GPT-4o",
        "envKey": "OPENAI_API_KEY",
        "baseUrl": "https://api.openai.com/v1",
        "generationConfig": {
          "timeout": 60000,
          "maxRetries": 3,
          "enableCacheControl": true,
          "contextWindowSize": 128000,
          "customHeaders": {
            "X-Client-Request-ID": "req-123"
          },
          "extra_body": {
            "enable_thinking": true,
            "service_tier": "priority"
          },
          "samplingParams": {
            "temperature": 0.2,
            "top_p": 0.8,
            "max_tokens": 4096,
            "presence_penalty": 0.1,
            "frequency_penalty": 0.1
          }
        }
      },
      {
        "id": "gpt-4o-mini",
        "name": "GPT-4o Mini",
        "envKey": "OPENAI_API_KEY",
        "baseUrl": "https://api.openai.com/v1",
        "generationConfig": {
          "timeout": 30000,
          "samplingParams": {
            "temperature": 0.5,
            "max_tokens": 2048
          }
        }
      },
      {
        "id": "openai/gpt-4o",
        "name": "GPT-4o (via OpenRouter)",
        "envKey": "OPENROUTER_API_KEY",
        "baseUrl": "https://openrouter.ai/api/v1",
        "generationConfig": {
          "timeout": 120000,
          "maxRetries": 3,
          "samplingParams": {
            "temperature": 0.7
          }
        }
      }
    ]
  }
}
```

### Anthropic (`anthropic`)

```json
{
  "modelProviders": {
    "anthropic": [
      {
        "id": "claude-3-5-sonnet",
        "name": "Claude 3.5 Sonnet",
        "envKey": "ANTHROPIC_API_KEY",
        "baseUrl": "https://api.anthropic.com/v1",
        "generationConfig": {
          "timeout": 120000,
          "maxRetries": 3,
          "contextWindowSize": 200000,
          "samplingParams": {
            "temperature": 0.7,
            "max_tokens": 8192,
            "top_p": 0.9
          }
        }
      },
      {
        "id": "claude-3-opus",
        "name": "Claude 3 Opus",
        "envKey": "ANTHROPIC_API_KEY",
        "baseUrl": "https://api.anthropic.com/v1",
        "generationConfig": {
          "timeout": 180000,
          "samplingParams": {
            "temperature": 0.3,
            "max_tokens": 4096
          }
        }
      }
    ]
  }
}
```

### Google Gemini (`gemini`)

```json
{
  "modelProviders": {
    "gemini": [
      {
        "id": "gemini-2.0-flash",
        "name": "Gemini 2.0 Flash",
        "envKey": "GEMINI_API_KEY",
        "baseUrl": "https://generativelanguage.googleapis.com",
        "capabilities": {
          "vision": true
        },
        "generationConfig": {
          "timeout": 60000,
          "maxRetries": 2,
          "contextWindowSize": 1000000,
          "schemaCompliance": "auto",
          "samplingParams": {
            "temperature": 0.4,
            "top_p": 0.95,
            "max_tokens": 8192,
            "top_k": 40
          }
        }
      }
    ]
  }
}
```

### Google Vertex AI (`vertex-ai`)

```json
{
  "modelProviders": {
    "vertex-ai": [
      {
        "id": "gemini-1.5-pro-vertex",
        "name": "Gemini 1.5 Pro (Vertex AI)",
        "envKey": "GOOGLE_API_KEY",
        "baseUrl": "https://generativelanguage.googleapis.com",
        "generationConfig": {
          "timeout": 90000,
          "contextWindowSize": 2000000,
          "samplingParams": {
            "temperature": 0.2,
            "max_tokens": 8192
          }
        }
      }
    ]
  }
}
```

### ローカルセルフホスト型モデル（OpenAI互換API経由）

ほとんどのローカル推論サーバー（vLLM、Ollama、LM Studioなど）は、OpenAI互換のAPIエンドポイントを提供しています。これらは`openai`認証タイプを使用し、ローカルの`baseUrl`で設定してください：

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "qwen2.5-7b",
        "name": "Qwen2.5 7B (Ollama)",
        "envKey": "OLLAMA_API_KEY",
        "baseUrl": "http://localhost:11434/v1",
        "generationConfig": {
          "timeout": 300000,
          "maxRetries": 1,
          "contextWindowSize": 32768,
          "samplingParams": {
            "temperature": 0.7,
            "top_p": 0.9,
            "max_tokens": 4096
          }
        }
      },
      {
        "id": "llama-3.1-8b",
        "name": "Llama 3.1 8B (vLLM)",
        "envKey": "VLLM_API_KEY",
        "baseUrl": "http://localhost:8000/v1",
        "generationConfig": {
          "timeout": 120000,
          "maxRetries": 2,
          "contextWindowSize": 128000,
          "samplingParams": {
            "temperature": 0.6,
            "max_tokens": 8192
          }
        }
      },
      {
        "id": "local-model",
        "name": "Local Model (LM Studio)",
        "envKey": "LMSTUDIO_API_KEY",
        "baseUrl": "http://localhost:1234/v1",
        "generationConfig": {
          "timeout": 60000,
          "samplingParams": {
            "temperature": 0.5
          }
        }
      }
    ]
  }
}
```

認証を必要としないローカルサーバーについては、APIキーに任意のプレースホルダー値を使用できます：

```bash

```bash
# Ollama用 (認証不要)
export OLLAMA_API_KEY="ollama"

# vLLM用 (認証が設定されていない場合)
export VLLM_API_KEY="not-needed"
```

> [!note]
> 
> `extra_body` パラメータは **OpenAI互換プロバイダ** (`openai`, `qwen-oauth`) のみでサポートされています。Anthropic、Gemini、Vertex AIプロバイダでは無視されます。

## Bailianコーディングプラン

Bailianコーディングプランは、コーディングタスクに最適化された事前構成済みのQwenモデルセットを提供します。この機能はBailian APIアクセス権を持つユーザー向けに利用可能で、自動的なモデル構成の更新とともに簡略化されたセットアップ体験を提供します。

### 概要

BailianコーディングプランのAPIキーを使用して `/auth` コマンドで認証すると、Qwen Codeは自動的に以下のモデルを設定します。

| モデルID               | 名前                 | 説明                                   |
| ---------------------- | -------------------- | -------------------------------------- |
| `qwen3.5-plus`         | qwen3.5-plus         | 思考機能を有効にした高度なモデル       |
| `qwen3-coder-plus`     | qwen3-coder-plus     | コーディングタスク向けに最適化されたモデル |
| `qwen3-max-2026-01-23` | qwen3-max-2026-01-23 | 思考機能を有効にした最新のmaxモデル    |

### セットアップ

1. BailianコーディングプランのAPIキーを取得します：
   - **中国**：<https://bailian.console.aliyun.com/?tab=model#/efm/coding_plan>
   - **国際版**：<https://modelstudio.console.alibabacloud.com/?tab=dashboard#/efm/coding_plan>
2. Qwen Codeで`/auth`コマンドを実行します
3. API-KEY認証方式を選択します
4. 地域（中国またはグローバル/国際版）を選択します
5. プロンプトが表示されたら、APIキーを入力します

モデルは自動的に設定され、`/model`ピッカーに追加されます。

### リージョン

Bailian コーディングプランは2つのリージョンをサポートしています：

| リージョン             | エンドポイント                                    | 説明                     |
| ---------------------- | ------------------------------------------------- | ------------------------ |
| 中国                   | `https://coding.dashscope.aliyuncs.com/v1`        | 中国本土のエンドポイント |
| グローバル/国際        | `https://coding-intl.dashscope.aliyuncs.com/v1`   | 国際エンドポイント       |

リージョンは認証時に選択され、`settings.json` の `codingPlan.region` に保存されます。リージョンを切り替えるには、`/auth` コマンドを再実行して別のリージョンを選択してください。

### API キーの保存

`/auth` コマンドで Coding Plan を設定する際、API キーは予約済みの環境変数名 `BAILIAN_CODING_PLAN_API_KEY` を使用して保存されます。デフォルトでは、`settings.json` ファイルの `settings.env` フィールドに保存されます。

> [!warning]
>
> **セキュリティ推奨事項**: セキュリティをより強固にするため、API キーを `settings.json` から別の `.env` ファイルへ移動し、環境変数として読み込むことを推奨します。例：
>
> ```bash
> # ~/.qwen/.env
> BAILIAN_CODING_PLAN_API_KEY=your-api-key-here
> ```
>
> そして、プロジェクトレベルの設定を使用している場合は、このファイルが `.gitignore` に追加されていることを確認してください。

### 自動更新

コーディングプランのモデル構成はバージョン管理されています。Qwen Codeがモデルテンプレートの新しいバージョンを検出すると、更新を促すプロンプトが表示されます。更新を受け入れると、以下のような処理が実行されます。

- 既存のコーディングプランモデル構成を最新バージョンに置き換えます
- 手動で追加したカスタムモデル構成は保持されます
- 更新された構成の最初のモデルに自動的に切り替わります

この更新プロセスにより、手動での操作なしに常に最新のモデル構成と機能を利用できるようになります。

### 手動設定（上級者向け）

Coding Plan モデルを手動で設定することも可能です。OpenAI 互換プロバイダーと同様に、`settings.json` に以下のように追加してください。

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3-coder-plus",
        "name": "qwen3-coder-plus",
        "description": "Bailian Coding Plan 経由の Qwen3-Coder",
        "envKey": "YOUR_CUSTOM_ENV_KEY",
        "baseUrl": "https://coding.dashscope.aliyuncs.com/v1"
      }
    ]
  }
}
```

> [!note]
>
> 手動設定を使用する場合：
>
> - `envKey` には任意の環境変数名を使用できます
> - `codingPlan.*` の設定は不要です
> - **手動で設定した Coding Plan モデルには自動更新が適用されません**

> [!warning]
>
> 自動 Coding Plan 設定も使用している場合、手動設定と自動設定で同じ `envKey` および `baseUrl` を使用していると、自動更新によって手動設定が上書きされる可能性があります。これを回避するため、可能であれば手動設定では異なる `envKey` を使用するようにしてください。

## レゾリューションレイヤーとアトミック性

有効な auth/model/credential の値は、以下の優先順位（最初に存在するものが優先）に従ってフィールドごとに選択されます。`--auth-type` と `--model` を組み合わせて使用することで、プロバイダー項目を直接指定できます。これらの CLI フラグは他のレイヤーよりも先に実行されます。

| レイヤー（最高 → 最低） | authType | model | apiKey | baseUrl | apiKeyEnvKey | proxy |
| ----------------------- | -------- | ----- | ------ | ------- | ------------ | ----- |
| プログラムによるオーバーライド | `/auth` | `/auth` 入力 | `/auth` 入力 | `/auth` 入力 | — | — |
| モデルプロバイダー選択 | — | `modelProvider.id` | `env[modelProvider.envKey]` | `modelProvider.baseUrl` | `modelProvider.envKey` | — |
| CLI 引数 | `--auth-type` | `--model` | `--openaiApiKey`（またはプロバイダー固有の同等のもの） | `--openaiBaseUrl`（またはプロバイダー固有の同等のもの） | — | — |
| 環境変数 | — | プロバイダー固有のマッピング（例: `OPENAI_MODEL`） | プロバイダー固有のマッピング（例: `OPENAI_API_KEY`） | プロバイダー固有のマッピング（例: `OPENAI_BASE_URL`） | — | — |
| 設定（`settings.json`） | `security.auth.selectedType` | `model.name` | `security.auth.apiKey` | `security.auth.baseUrl` | — | — |
| デフォルト / 計算値 | `AuthType.QWEN_OAUTH` にフォールバック | 組み込みデフォルト（OpenAI ⇒ `qwen3-coder-plus`） | — | — | — | 設定されている場合 `Config.getProxy()` |

\*CLI の認証フラグが存在する場合、設定より優先されます。それ以外の場合、`security.auth.selectedType` または暗黙的なデフォルトが認証タイプを決定します。Qwen OAuth および OpenAI は追加設定なしで利用可能な唯一の認証タイプです。

> [!warning]
>
> **`security.auth.apiKey` および `security.auth.baseUrl` の非推奨化:** `settings.json` 内の `security.auth.apiKey` および `security.auth.baseUrl` を介して API 認証情報を直接設定することは非推奨になりました。これらの設定は過去のバージョンで UI 経由で入力された認証情報のために使用されていましたが、認証情報入力フローはバージョン 0.10.1 で削除されました。これらのフィールドは将来のリリースで完全に削除される予定です。**すべてのモデルおよび認証情報の設定については `modelProviders` への移行を強く推奨します。** 安全な認証情報管理のために、`modelProviders` 内の `envKey` を使用して環境変数を参照してください。設定ファイルに認証情報をハードコードしないでください。

## 生成設定のレイヤリング: 透過不可能なプロバイダーレイヤー

設定解決は厳格なレイヤリングモデルに従い、1つの重要なルールがあります：**modelProvider レイヤーは透過不可能です**。

### 動作方法

1. **modelProvider モデルが選択されている場合** (例: `/model` コマンドでプロバイダー構成済みモデルを選択した場合):
   - プロバイダーからの `generationConfig` 全体が**アトミックに**適用される
   - **プロバイダーレイヤーは完全に透過不可** — 下位レイヤー (CLI、env、settings) は generationConfig 解決に一切関与しない
   - `modelProviders[].generationConfig` で定義されたすべてのフィールドはプロバイダーの値を使用する
   - プロバイダーによって**定義されていない**すべてのフィールドは `undefined` に設定される (settings から継承されない)
   - これにより、プロバイダー構成が完全かつ自己完結した「シールドパッケージ」として機能することを保証する

2. **modelProvider モデルが選択されていない場合** (例: `--model` を使用して生のモデル ID を指定した場合、または CLI/env/settings を直接使用した場合):
   - 解決は下位レイヤーにフォールスルーする
   - フィールドは CLI → env → settings → デフォルト の順に設定される
   - これにより**ランタイムモデル**が作成される (次のセクション参照)

### `generationConfig` のフィールドごとの優先順位

| 優先度 | ソース                                          | 動作                                                                                                     |
| ------ | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1      | プログラムによるオーバーライド                  | ランタイムの `/model`、`/auth` 変更                                                                      |
| 2      | `modelProviders[authType][].generationConfig`   | **透過的でない層** - すべての generationConfig フィールドを完全に置き換え、下位層は参加しない           |
| 3      | `settings.model.generationConfig`               | **ランタイムモデル**のみで使用（プロバイダーモデルが選択されていない場合）                             |
| 4      | コンテンツ生成機のデフォルト                    | プロバイダー固有のデフォルト（例：OpenAI 対 Gemini）- ランタイムモデルでのみ使用                       |

### アトミックフィールドの扱い

以下のフィールドはアトミックオブジェクトとして扱われます。プロバイダーの値がオブジェクト全体を完全に置き換え、マージは行われません。

- `samplingParams` - Temperature、top_p、max_tokens など
- `customHeaders` - カスタムHTTPヘッダー
- `extra_body` - 追加のリクエストボディパラメータ

### 例

```json
// ユーザー設定 (~/.qwen/settings.json)
{
  "model": {
    "generationConfig": {
      "timeout": 30000,
      "samplingParams": { "temperature": 0.5, "max_tokens": 1000 }
    }
  }
}

// modelProviders 設定
{
  "modelProviders": {
    "openai": [{
      "id": "gpt-4o",
      "envKey": "OPENAI_API_KEY",
      "generationConfig": {
        "timeout": 60000,
        "samplingParams": { "temperature": 0.2 }
      }
    }]
  }
}
```

`modelProviders` から `gpt-4o` が選択された場合：

- `timeout` = 60000（プロバイダー由来、設定を上書き）
- `samplingParams.temperature` = 0.2（プロバイダー由来、設定オブジェクト全体を置換）
- `samplingParams.max_tokens` = **undefined**（プロバイダーで定義されておらず、プロバイダーレイヤーは設定から継承しない — 指定されていないフィールドは明示的に undefined に設定される）

`--model gpt-4` を使用して（modelProviders 経由ではなく）ランタイムモデルを作成する場合：

- `timeout` = 30000（設定から）
- `samplingParams.temperature` = 0.5（設定から）
- `samplingParams.max_tokens` = 1000（設定から）

`modelProviders` 自体のマージ戦略は REPLACE です：プロジェクト設定の `modelProviders` 全体が、ユーザー設定の対応セクションを上書きし、2つをマージすることはありません。

## プロバイダーモデルとランタイムモデル

Qwen Code は2つのタイプのモデル構成を区別します。

### プロバイダーモデル

- `modelProviders` 設定で定義される
- 完全かつアトミックな構成パッケージを持つ
- 選択された場合、その構成は透過的ではないレイヤーとして適用される
- `/model` コマンドリストに完全なメタデータ（名前、説明、機能）とともに表示される
- マルチモデルワークフローおよびチームでの一貫性のために推奨される

### ランタイムモデル

- CLI（`--model`）、環境変数、または設定経由で生のモデルIDを使用する際に動的に作成される
- `modelProviders` では定義されない
- 構成は解決レイヤー（CLI → 環境 → 設定 → デフォルト）を通じて「投影」することで構築される
- 完全な構成が検出された際に自動的に **RuntimeModelSnapshot** としてキャプチャされる
- 認証情報を再入力せずに再利用可能にする

### RuntimeModelSnapshot のライフサイクル

`modelProviders` を使用せずにモデルを設定すると、Qwen Code は自動的に RuntimeModelSnapshot を作成して構成を保持します。

```bash
# これにより、ID: $runtime|openai|my-custom-model の RuntimeModelSnapshot が作成されます
qwen --auth-type openai --model my-custom-model --openaiApiKey $KEY --openaiBaseUrl https://api.example.com/v1
```

このスナップショットは：

- モデル ID、API キー、ベース URL、および生成設定をキャプチャする
- セッション間で永続化される（実行時メモリに保存される）
- `/model` コマンドのリストにランタイムオプションとして表示される
- `/model $runtime|openai|my-custom-model` を使用して切り替えることができる

### 主な違い

| アスペクト              | プロバイダーモデル                | ランタイムモデル                           |
| ----------------------- | --------------------------------- | ------------------------------------------ |
| 設定ソース              | 設定内の `modelProviders`         | CLI、環境変数、設定レイヤー                |
| 設定のアトミック性      | 完全で透過的にパッケージ化        | レイヤー化され、各フィールドが個別に解決   |
| 再利用性                | 常に `/model` リストで利用可能    | スナップショットとして保存、完全時に表示   |
| チーム共有              | 可（コミットされた設定経由）      | 不可（ユーザー固有）                       |
| 認証情報の保存          | `envKey` 経由でのみ参照           | スナップショット内に実際のキーを保持可能   |

### それぞれの使用タイミング

- **プロバイダーモデルを使用する場合**: チーム全体で共有される標準モデルがある場合、一貫した構成が必要な場合、または誤った上書きを防ぎたい場合
- **ランタイムモデルを使用する場合**: 新しいモデルをすぐにテストする場合、一時的な認証情報を使用する場合、またはアドホックなエンドポイントを使用する場合

## 選択の永続性と推奨事項

> [!important]
> 
> 可能な限り、ユーザー範囲の `~/.qwen/settings.json` で `modelProviders` を定義し、任意のスコープに認証情報の上書きを永続化しないようにしてください。プロバイダーカタログをユーザ設定に保持することで、プロジェクトとユーザーのスコープ間でのマージ/上書きの競合を防ぎ、`/auth` および `/model` の更新が常に一貫したスコープに書き戻されるようにします。

- `/model` および `/auth` は、`model.name`（該当する場合）および `security.auth.selectedType` を、既に `modelProviders` を定義している最も近い書き込み可能なスコープに永続化します。それ以外の場合は、ユーザー スコープにフォールバックします。これにより、ワークスペース/ユーザー ファイルがアクティブなプロバイダーカタログと同期されます。
- `modelProviders` がない場合、リゾルバーは CLI/env/設定レイヤーを混在させ、ランタイムモデルを作成します。これはシングルプロバイダー構成では問題ありませんが、頻繁に切り替える場合には煩雑になります。マルチモデルワークフローが一般的な場合は、常にプロバイダーカタログを定義して、切り替えがアトミックでソース属性付きかつデバッグ可能になるようにしてください。