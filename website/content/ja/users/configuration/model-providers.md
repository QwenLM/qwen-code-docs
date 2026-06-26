# モデルプロバイダー

Qwen Code では、`settings.json` の `modelProviders` 設定を使用して複数のモデルプロバイダーを構成できます。これにより、`/model` コマンドを使用して異なる AI モデルやプロバイダーを切り替えることができます。

## 概要

`modelProviders` を使用して、`/model` ピッカーで切り替え可能な、認証タイプごとのモデルを宣言します。キーは有効な認証タイプ（`openai`、`anthropic`、`gemini` など）である必要があります。各認証タイプは、`protocol` フィールドと `models` フィールド（モデル定義の配列）を持つ `ProviderConfig` オブジェクトにマッピングされます。`models` の各エントリには `id` が必要です。`envKey` は **オプションですが推奨** です（省略した場合、認証タイプのデフォルトの環境変数キー（例：`openai` の場合は `OPENAI_API_KEY`）にフォールバックします）。オプションで `name`、`description`、`baseUrl`、`generationConfig` を指定できます。認証情報は設定に永続化されず、ランタイムが `process.env[envKey]` から読み取ります。Qwen OAuth のモデルはハードコードされており、上書きできません。

> [!note]
>
> `/model` コマンドのみがデフォルト以外の認証タイプを公開します。Anthropic、Gemini などは `modelProviders` を介して定義する必要があります。`/auth` コマンドは 3 つのトップレベルのオプションを表示します: **Alibaba ModelStudio**（サブメニューに Coding Plan、Token Plan、Standard API Key を含む）、**Third-party Providers**、**Custom Provider**。（Qwen OAuth はダイアログエントリとして選択できなくなりました。その無料ティアは 2026-04-15 に廃止されました。）

> [!note]
>
> **モデルの一意性**: 同じ `authType` 内のモデルは、`id` + `baseUrl` の組み合わせで一意に識別されます。つまり、同じモデル ID（例：`"gpt-4o"`）を、それぞれ異なる `baseUrl` を持つ限り、単一の `authType` の下に複数回定義できます。たとえば、1 つは OpenAI を直接指し、もう 1 つはプロキシエンドポイントを指す場合です。2 つのエントリが同じ `id` と `baseUrl` を共有する（または両方とも `baseUrl` を省略する）場合、最初の出現が優先され、後続の重複は警告とともにスキップされます。

## 認証タイプ別の構成例

以下は、さまざまな認証タイプの包括的な構成例であり、使用可能なパラメータとその組み合わせを示しています。

### サポートされている認証タイプ

`modelProviders` オブジェクトのキーは、有効な `authType` 値である必要があります。現在サポートされている認証タイプは次のとおりです。

| Auth Type    | 説明                                                                                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `openai`     | OpenAI 互換の API（OpenAI、Azure OpenAI、vLLM/Ollama などのローカル推論サーバー）                                                                              |
| `anthropic`  | Anthropic Claude API                                                                                                                                          |
| `gemini`     | Google Gemini API                                                                                                                                             |
| `qwen-oauth` | Qwen OAuth（ハードコードされており、`modelProviders` で上書き不可）                                                                                            |
| `vertex-ai`  | Google Vertex AI（`gemini` プロトコルと Vertex AI モードの `@google/genai` SDK を使用。選択すると `GOOGLE_GENAI_USE_VERTEXAI=true` が設定されます）              |

> [!warning]
> 未知の認証タイプキーが使用された場合（例：タイプミスの `"openai-custom"`）、空でないキーはそのまま独自の認証タイプグループとして受け入れられますが、既知のプロトコルにマッピングされないため、そのモデルは意図したとおりに機能せず、`/model` ピッカーで正しく動作しません。空（空白のみ）のキーのみがスキップされます。常に上記のサポートされている認証タイプ値のいずれかを使用してください。

### API リクエストに使用される SDK

Qwen Code は、各プロバイダーにリクエストを送信するために、次の公式 SDK を使用します。

| Auth Type    | SDK パッケージ                                                                                         |
| ------------ | ------------------------------------------------------------------------------------------------------ |
| `openai`     | [`openai`](https://www.npmjs.com/package/openai) - 公式 OpenAI Node.js SDK                              |
| `anthropic`  | [`@anthropic-ai/sdk`](https://www.npmjs.com/package/@anthropic-ai/sdk) - 公式 Anthropic SDK              |
| `gemini`     | [`@google/genai`](https://www.npmjs.com/package/@google/genai) - 公式 Google GenAI SDK                   |
| `qwen-oauth` | [`openai`](https://www.npmjs.com/package/openai)（カスタムプロバイダー、DashScope 互換）                 |

これは、設定する `baseUrl` が、対応する SDK の期待する API 形式と互換性がある必要があることを意味します。たとえば、`openai` 認証タイプを使用する場合、エンドポイントは OpenAI API 形式のリクエストを受け入れる必要があります。

### OpenAI 互換プロバイダー (`openai`)

この認証タイプは、OpenAI の公式 API だけでなく、OpenRouter や Requesty などの集約モデルプロバイダーを含む、OpenAI 互換のエンドポイントもサポートしています。

```json
{
  "env": {
    "OPENAI_API_KEY": "sk-your-actual-openai-key-here",
    "OPENROUTER_API_KEY": "sk-or-your-actual-openrouter-key-here",
    "REQUESTY_API_KEY": "sk-your-actual-requesty-key-here"
  },
  "modelProviders": {
    "openai": {
      "protocol": "openai",
      "models": [
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
            "modalities": {
              "image": true
            },
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
        },
        {
          "id": "openai/gpt-4o-mini",
          "name": "GPT-4o Mini (via Requesty)",
          "envKey": "REQUESTY_API_KEY",
          "baseUrl": "https://router.requesty.ai/v1",
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
}
```

### Anthropic (`anthropic`)

```json
{
  "env": {
    "ANTHROPIC_API_KEY": "sk-ant-your-actual-anthropic-key-here"
  },
  "modelProviders": {
    "anthropic": {
      "protocol": "anthropic",
      "models": [
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
}
```

### Google Gemini (`gemini`)

```json
{
  "env": {
    "GEMINI_API_KEY": "AIza-your-actual-gemini-key-here"
  },
  "modelProviders": {
    "gemini": {
      "protocol": "gemini",
      "models": [
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
}
```

### ローカルセルフホストモデル（OpenAI 互換 API 経由）

ほとんどのローカル推論サーバー（vLLM、Ollama、LM Studio など）は、OpenAI 互換の API エンドポイントを提供しています。これらは `openai` 認証タイプとローカルの `baseUrl` を使用して構成します。

```json
{
  "env": {
    "OLLAMA_API_KEY": "ollama",
    "VLLM_API_KEY": "not-needed",
    "LMSTUDIO_API_KEY": "lm-studio"
  },
  "modelProviders": {
    "openai": {
      "protocol": "openai",
      "models": [
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
}
```

認証が不要なローカルサーバーの場合、API キーには任意のプレースホルダー値を使用できます。

```bash
# For Ollama (no auth required)
export OLLAMA_API_KEY="ollama"

# For vLLM (if no auth is configured)
export VLLM_API_KEY="not-needed"
```

> [!note]
>
> `extra_body` パラメータは **OpenAI 互換プロバイダー（`openai`、`qwen-oauth`）でのみサポートされています**。Anthropic および Gemini プロバイダーでは無視されます。

> [!note]
>
> **`envKey` について**: `envKey` フィールドは API キーの値そのものではなく、**環境変数の名前** を指定します。この構成を機能させるには、対応する環境変数に実際の API キーが設定されていることを確認する必要があります。これには 2 つの方法があります。
>
> - **方法 1: `.env` ファイルを使用する（セキュリティ推奨）**:
>   ```bash
>   # ~/.qwen/.env (またはプロジェクトルート)
>   OPENAI_API_KEY=sk-your-actual-key-here
>   ```
>   `.gitignore` に `.env` を追加して、誤って機密情報をコミットしないようにしてください。
> - **方法 2: `settings.json` の `env` フィールドを使用する（上記の例のように）**:
>   ```json
>   {
>     "env": {
>       "OPENAI_API_KEY": "sk-your-actual-key-here"
>     }
>   }
>   ```
>
> 各プロバイダーの例には、API キーを構成する方法を示すために `env` フィールドが含まれています。

## Alibaba Cloud Coding Plan

Alibaba Cloud Coding Plan は、コーディングタスクに最適化された、事前構成済みの Qwen モデルセットを提供します。この機能は、Alibaba Cloud Coding Plan API アクセス権を持つユーザーが利用でき、自動モデル構成更新による簡素化された設定エクスペリエンスを提供します。

### 概要

`/auth` コマンドを使用して Alibaba Cloud Coding Plan API キーで認証すると、Qwen Code は自動的に以下のモデルを構成します。

| モデル ID              | 名前                  | 説明                                                |
| ---------------------- | --------------------- | --------------------------------------------------- |
| `qwen3.5-plus`         | qwen3.5-plus          | 思考機能を有効にした高度なモデル                        |
| `qwen3.6-plus`         | qwen3.6-plus          | 思考機能を有効にした最新モデル（Pro サブスクリプションのみ） |
| `qwen3.7-plus`         | qwen3.7-plus          | 思考機能を有効にした高度なモデル                        |
| `qwen3-coder-plus`     | qwen3-coder-plus      | コーディングタスクに最適化                               |
| `qwen3-coder-next`     | qwen3-coder-next      | 実験的なコーディングモデル                               |
| `qwen3-max-2026-01-23` | qwen3-max-2026-01-23  | 思考機能を有効にした最新の max モデル                    |
| `glm-5`                | glm-5                 | 思考機能を有効にした GLM モデル                           |
| `glm-4.7`              | glm-4.7               | 思考機能を有効にした GLM モデル                           |
| `kimi-k2.5`            | kimi-k2.5             | 思考機能とビジョン/ビデオサポートを備えた Kimi モデル       |
| `MiniMax-M2.5`         | MiniMax-M2.5          | 思考機能を有効にした MiniMax モデル                       |

### セットアップ

1. Alibaba Cloud Coding Plan API キーを取得します。
   - **中国**: <https://bailian.console.aliyun.com/?tab=model#/efm/coding_plan>
   - **国際**: <https://modelstudio.console.alibabacloud.com/?tab=dashboard#/efm/coding_plan>
2. Qwen Code で `/auth` コマンドを実行します。
3. **Alibaba ModelStudio** を選択し、サブメニューから **Coding Plan** を選択します。
4. リージョンを選択します。
5. プロンプトに従って API キーを入力します。

モデルは自動的に構成され、`/model` ピッカーに追加されます。

### リージョン

Alibaba Cloud Coding Plan は 2 つのリージョンをサポートしています。

| リージョン   | エンドポイント                                         | 説明                  |
| ------------ | ------------------------------------------------------ | --------------------- |
| 中国         | `https://coding.dashscope.aliyuncs.com/v1`             | 中国本土のエンドポイント |
| グローバル/国際 | `https://coding-intl.dashscope.aliyuncs.com/v1`      | 国際エンドポイント      |

リージョンは認証時に選択され、`settings.json` の `modelProviders` 構成に保存されます。リージョンを切り替えるには、`/auth` コマンドを再実行し、別のリージョンを選択します。

### API キーの保存

`/auth` コマンドを使用して Coding Plan を構成すると、API キーは予約された環境変数名 `BAILIAN_CODING_PLAN_API_KEY` を使用して保存されます。デフォルトでは、`settings.json` の `env` フィールドに保存されます。

> [!warning]
>
> **セキュリティ推奨事項**: セキュリティを強化するには、API キーを `settings.json` から別の `.env` ファイルに移動し、環境変数として読み込むことをお勧めします。例:
>
> ```bash
> # ~/.qwen/.env
> BAILIAN_CODING_PLAN_API_KEY=your-api-key-here
> ```
>
> プロジェクトレベルの設定を使用している場合は、このファイルが `.gitignore` に追加されていることを確認してください。

### 自動更新

Coding Plan のモデル構成はバージョン管理されています。Qwen Code がモデルテンプレートの新しいバージョンを検出すると、更新を促すプロンプトが表示されます。更新を受け入れると、以下の処理が行われます。

- 既存の Coding Plan モデル構成を最新バージョンに置き換えます。
- 手動で追加したカスタムモデル構成は保持されます。
- 更新後の構成の最初のモデルに自動的に切り替わります。

この更新プロセスにより、手動での操作なしに、常に最新のモデル構成と機能にアクセスできるようになります。

### 手動構成（上級者向け）

Coding Plan モデルを手動で構成したい場合は、他の OpenAI 互換プロバイダーと同様に `settings.json` に追加できます。

```json
{
  "modelProviders": {
    "openai": {
      "protocol": "openai",
      "models": [
        {
          "id": "qwen3-coder-plus",
          "name": "qwen3-coder-plus",
          "description": "Qwen3-Coder via Alibaba Cloud Coding Plan",
          "envKey": "YOUR_CUSTOM_ENV_KEY",
          "baseUrl": "https://coding.dashscope.aliyuncs.com/v1"
        }
      ]
    }
  }
}
```

> [!note]
>
> 手動構成を使用する場合:
>
> - `envKey` には任意の環境変数名を使用できます。
> - `codingPlan.*` を構成する必要はありません。
> - 手動で構成した Coding Plan モデルには **自動更新は適用されません**。

> [!warning]
>
> 自動 Coding Plan 構成も使用している場合、手動構成が自動構成と同じ `envKey` と `baseUrl` を使用していると、自動更新によって手動構成が上書きされる可能性があります。これを回避するには、可能であれば手動構成で異なる `envKey` を使用してください。

## 解決レイヤーとアトミック性

有効な認証タイプ/モデル/認証情報の値は、以下の優先順位に従ってフィールドごとに選択されます（最初に見つかったものが優先されます）。`--auth-type` を `--model` と組み合わせてプロバイダーエントリを直接指定できます。これらの CLI フラグは他のレイヤーより先に実行されます。

| レイヤー（高い → 低い） | authType                            | model                                           | apiKey                                                | baseUrl                                                | apiKeyEnvKey           | proxy                             |
| ----------------------- | ----------------------------------- | ----------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------ | ---------------------- | --------------------------------- |
| プログラムによるオーバーライド | `/auth`                             | `/auth` input                                   | `/auth` input                                         | `/auth` input                                          | —                      | —                                 |
| モデルプロバイダー選択   | —                                   | `modelProvider.id`                              | `env[modelProvider.envKey]`                           | `modelProvider.baseUrl`                                | `modelProvider.envKey` | —                                 |
| CLI 引数                | `--auth-type`                       | `--model`                                       | `--openai-api-key`（またはプロバイダー固有の同等物）   | `--openai-base-url`（またはプロバイダー固有の同等物）   | —                      | —                                 |
| 環境変数                | —                                   | プロバイダー固有のマッピング（例：`OPENAI_MODEL`） | プロバイダー固有のマッピング（例：`OPENAI_API_KEY`）     | プロバイダー固有のマッピング（例：`OPENAI_BASE_URL`）     | —                      | —                                 |
| 設定（`settings.json`） | `security.auth.selectedType`        | `model.name`                                    | `security.auth.apiKey`                                | `security.auth.baseUrl`                                | —                      | —                                 |
| デフォルト / 計算値     | `AuthType.QWEN_OAUTH` にフォールバック | 組み込みデフォルト（OpenAI ⇒ `qwen3.5-plus`）     | —                                                     | —                                                      | —                      | `Config.getProxy()`（設定されていれば） |
\*CLI 認証フラグが存在する場合、設定よりも優先されます。それ以外の場合は、`security.auth.selectedType` または暗黙のデフォルトによって認証タイプが決定されます。Qwen OAuth と OpenAI は、追加設定なしで利用できる唯一の認証タイプです。

> [!warning]
>
> **`security.auth.apiKey` と `security.auth.baseUrl` の非推奨化:** `settings.json` で `security.auth.apiKey` と `security.auth.baseUrl` を直接設定して API 資格情報を構成することは非推奨となりました。これらの設定は、UI から入力された資格情報に使用されていた過去のバージョンで使用されていましたが、バージョン 0.10.1 で資格情報入力フローは削除されました。これらのフィールドは将来のリリースで完全に削除される予定です。**すべてのモデルと資格情報の設定には `modelProviders` への移行を強く推奨します。** 設定ファイルに資格情報をハードコーディングする代わりに、`modelProviders` で `envKey` を使用して環境変数を参照し、安全に資格情報を管理してください。

## 生成設定のレイヤリング：不透過なプロバイダーレイヤー

設定の解決は、厳格なレイヤリングモデルに従い、1つの重要なルールがあります：**modelProvider レイヤーは不透過です**。

### 仕組み

1. **modelProvider モデルが選択された場合**（例：`/model` コマンドでプロバイダー設定済みモデルを選択）：
   - プロバイダーからの `generationConfig` 全体が **アトミックに** 適用されます
   - **プロバイダーレイヤーは完全に不透過です** — 下位レイヤー（CLI、env、settings）は generationConfig の解決にまったく関与しません
   - `modelProviders[].generationConfig` で定義されたすべてのフィールドはプロバイダーの値を使用します
   - プロバイダーによって **定義されていない** すべてのフィールドは `undefined` に設定されます（settings から継承されません）
   - これにより、プロバイダー設定が完全で自己完結型の「密閉パッケージ」として機能することが保証されます

   モデルが `modelProviders` にリストされている場合、そのモデルに固有の生成設定はすべて、対応するプロバイダーエントリに配置してください。トップレベルの `model.generationConfig` の値（`contextWindowSize`、`modalities`、`customHeaders`、`extra_body` を含む）は、プロバイダーモデルでは無視されます。それらを適用するには、`modelProviders[authType][].generationConfig` の下で設定してください。

2. **modelProvider モデルが選択されていない場合**（例：`--model` に raw モデル ID を使用する、または CLI/env/settings を直接使用する）：
   - 解決は下位レイヤーにフォールスルーします
   - フィールドは CLI → env → settings → defaults から取り込まれます
   - これにより **ランタイムモデル** が作成されます（次のセクションを参照）

### `generationConfig` のフィールドごとの優先順位

| 優先順位 | ソース                                      | 動作                                                                                         |
| -------- | ------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 1        | プログラムによるオーバーライド              | ランタイムの `/model`、`/auth` の変更                                                       |
| 2        | `modelProviders[authType][].generationConfig` | **不透過レイヤー** - generationConfig のすべてのフィールドを完全に置き換えます。下位レイヤーは関与しません |
| 3        | `settings.model.generationConfig`           | **ランタイムモデル**（プロバイダーモデルが選択されていない場合）でのみ使用されます              |
| 4        | コンテンツジェネレーターのデフォルト        | プロバイダー固有のデフォルト（例：OpenAI vs Gemini） - ランタイムモデルのみ                  |

### アトミックフィールドの扱い

以下のフィールドはアトミックオブジェクトとして扱われます。プロバイダーの値がオブジェクト全体を完全に置き換え、マージは行われません。

- `samplingParams` - Temperature, top_p, max_tokens など
- `customHeaders` - カスタム HTTP ヘッダー
- `extra_body` - 追加のリクエストボディパラメータ

### 例

```jsonc
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
    "openai": {
      "protocol": "openai",
      "models": [{
        "id": "gpt-4o",
        "envKey": "OPENAI_API_KEY",
        "generationConfig": {
          "timeout": 60000,
          "samplingParams": { "temperature": 0.2 }
        }
      }]
    }
  }
}
```

`gpt-4o` が modelProviders から選択された場合：

- `timeout` = 60000（プロバイダーからの値、settings を上書き）
- `samplingParams.temperature` = 0.2（プロバイダーからの値、settings のオブジェクトを完全に置き換え）
- `samplingParams.max_tokens` = **undefined**（プロバイダーで定義されておらず、プロバイダーレイヤーは settings から継承しません — 提供されていない場合、フィールドは明示的に undefined に設定されます）

raw モデルを `--model gpt-4` で使用する場合（modelProviders からのものではなく、ランタイムモデルを作成）：

- `timeout` = 30000（settings から）
- `samplingParams.temperature` = 0.5（settings から）
- `samplingParams.max_tokens` = 1000（settings から）

`modelProviders` 自体のマージ戦略は REPLACE（置換）です。プロジェクト設定からの `modelProviders` 全体が、ユーザー設定の対応するセクションを、マージではなく上書きします。

## 推論 / 思考設定

`generationConfig` のオプションフィールド `reasoning` は、モデルが応答する前にどれだけ積極的に推論するかを制御します。Anthropic コンバーターと Gemini コンバーターは常にこれを尊重します。OpenAI 互換パイプラインは、**`generationConfig.samplingParams` が設定されている場合を除いて**、これを尊重します。下記の「`samplingParams` との相互作用」に関する注記を参照してください。

```jsonc
{
  "modelProviders": {
    "openai": {
      "protocol": "openai",
      "models": [
        {
          "id": "deepseek-v4-pro",
          "name": "DeepSeek V4 Pro",
          "baseUrl": "https://api.deepseek.com/v1",
          "envKey": "DEEPSEEK_API_KEY",
          "generationConfig": {
            // 4段階のスケール：
            //   'low' | 'medium' — DeepSeek ではサーバー側で 'high' にマッピング
            //   'high'   — デフォルトの推論強度
            //   'max'    — DeepSeek 固有の超強力段階
            // または `false` に設定して推論を完全に無効化
            "reasoning": { "effort": "max" },
          },
        },
      ],
    },
  },
}
```

### プロバイダーごとの動作

| プロトコル / プロバイダー                 | ワイヤー形状                                                      | 備考                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **OpenAI / DeepSeek** (`api.deepseek.com`) | 平坦な `reasoning_effort: <effort>` ボディパラメータ              | ネストされた設定形状で `reasoning.effort` が設定されている場合、平坦な `reasoning_effort` に書き換えられ、`'low'`/`'medium'` は `'high'` に、`'xhigh'` は `'max'` に正規化されます。これは DeepSeek の[サーバー側の後方互換性](https://api-docs.deepseek.com/zh-cn/api/create-chat-completion)を反映しています。トップレベルの `samplingParams.reasoning_effort` または `extra_body.reasoning_effort` によるオーバーライドは、この正規化をスキップしてそのまま送信されます。 |
| **OpenAI**（その他の互換サーバー）         | `reasoning: { effort, ... }` をそのまま通過                       | プロバイダーが異なる形状を期待する場合、`samplingParams` を介して設定します（例：GPT-5/oシリーズの場合は `samplingParams.reasoning_effort`）。                                                                                                                                                                                                                   |
| **Anthropic**（実際の `api.anthropic.com`） | `output_config: { effort }` に加えて `effort-2025-11-24` ベータヘッダー | 実際の Anthropic は `'low'`/`'medium'`/`'high'` のみを受け入れます。`'max'` は **`'high'` に丸められ**、`debugLogger.warn` 行が出力されます（ジェネレーターごとに1回）。最大 effort が必要な場合は、それをサポートする DeepSeek 互換エンドポイントに baseURL を切り替えてください。                                                                                |
| **Anthropic**（`api.deepseek.com/anthropic`） | 同じ `output_config: { effort }` + ベータヘッダー                  | `'max'` は変更されずにそのまま渡されます。                                                                                                                                                                                                                                                                                                                        |
| **Gemini**（`@google/genai`）              | `thinkingConfig: { includeThoughts: true, thinkingLevel }`        | `'low'` → `LOW`、`'high'`/`'max'` → `HIGH`、それ以外 → `THINKING_LEVEL_UNSPECIFIED`（Gemini に `MAX` 段階はありません）。                                                                                                                                                                                                                                        |

### `reasoning: false`

`reasoning: false`（リテラルのブール値）を設定すると、すべてのプロバイダーで明示的に思考が無効になります。これは、推論の恩恵を受けない安価なサイドクエリに便利です。これはリクエストレベルでも、`request.config.thinkingConfig.includeThoughts: false` を介して、1回限りの呼び出し（例：提案生成）で尊重されます。

`api.deepseek.com` の baseURL の場合、OpenAI パイプラインは、DeepSeek V4+ が必要とする明示的な `thinking: { type: 'disabled' }` フィールドを出力します。サーバー側のデフォルトは `'enabled'` であるため、単に `reasoning_effort` を省略しても、思考のレイテンシとコストが依然として発生します。セルフホストの DeepSeek バックエンド（sglang/vllm）やその他の OpenAI 互換サーバーは、このフィールドを**受け取りません**。それらで思考を無効にする必要がある場合は、`samplingParams`/`extra_body` を介して `thinking: { type: 'disabled' }`（または推論フレームワークが公開する任意の設定項目）を注入してください。

### `samplingParams` との相互作用（OpenAI 互換のみ）

> [!warning]
>
> OpenAI 互換プロバイダーで `generationConfig.samplingParams` が設定されている場合、パイプラインはそれらのキーをそのままワイヤーに送信し、個別の `reasoning` 注入を完全にスキップします。そのため、`{ samplingParams: { temperature: 0.5 }, reasoning: { effort: 'max' } }` のような設定は、OpenAI/DeepSeek リクエストで reasoning フィールドを黙ってドロップします。
>
> `samplingParams` を設定する場合は、その中に推論設定ノブを直接含めてください。DeepSeek の場合は `samplingParams.reasoning_effort`、GPT-5/oシリーズの場合は `samplingParams.reasoning_effort`（それらの平坦なフィールド）または `samplingParams.reasoning`（ネストされたオブジェクト）です。OpenRouter やその他のプロバイダーではフィールド名が異なります。プロバイダーのドキュメントを参照してください。
>
> Anthropic コンバーターと Gemini コンバーターは影響を受けません。これらは `samplingParams` に関係なく、常に `reasoning.effort` を直接読み取ります。

### `budget_tokens`

`effort` と一緒に `budget_tokens` を含めることで、思考トークンの正確な予算を固定できます。

```jsonc
"reasoning": { "effort": "high", "budget_tokens": 50000 }
```

Anthropic の場合、これは `thinking.budget_tokens` になります。OpenAI/DeepSeek の場合、このフィールドは保持されますが、現在サーバー側では無視されます。主要な制御は `reasoning_effort` です。

## プロバイダーモデル vs ランタイムモデル

Qwen Code は、2 種類のモデル設定を区別します。

### プロバイダーモデル

- `modelProviders` 設定で定義
- 完全でアトミックな設定パッケージを持つ
- 選択されると、その設定は不透過レイヤーとして適用される
- 完全なメタデータ（名前、説明、機能）とともに `/model` コマンドリストに表示される
- マルチモデルワークフローとチームの一貫性に推奨

### ランタイムモデル

- CLI（`--model`）、環境変数、または settings を介して raw モデル ID を使用する際に動的に作成される
- `modelProviders` では定義されない
- 解決レイヤー（CLI → env → settings → defaults）を「投影」して設定が構築される
- 完全な設定が検出されると、**RuntimeModelSnapshot** として自動的にキャプチャされる
- 資格情報を再入力せずに再利用可能

### RuntimeModelSnapshot のライフサイクル

`modelProviders` を使用せずにモデルを設定すると、Qwen Code は自動的に RuntimeModelSnapshot を作成して設定を保存します。

```bash
# ID: $runtime|openai|my-custom-model の RuntimeModelSnapshot を作成
qwen --auth-type openai --model my-custom-model --openai-api-key $KEY --openai-base-url https://api.example.com/v1
```

スナップショットは：

- モデル ID、API キー、ベース URL、生成設定をキャプチャ
- セッション間で永続化（ランタイム中はメモリに保存）
- `/model` コマンドリストにランタイムオプションとして表示
- `/model $runtime|openai|my-custom-model` を使用して切り替え可能

### 主な違い

| 側面               | プロバイダーモデル                    | ランタイムモデル                              |
| ------------------ | ------------------------------------- | --------------------------------------------- |
| 設定ソース         | settings 内の `modelProviders`        | CLI、env、settings レイヤー                     |
| 設定の原子性       | 完全で不透過なパッケージ              | 階層化され、各フィールドが独立して解決される    |
| 再利用性           | `/model` リストで常に利用可能          | スナップショットとしてキャプチャ、完全なら表示 |
| チーム共有         | 可能（コミットされた settings 経由）  | 不可（ユーザーローカル）                      |
| 資格情報の保存     | `envKey` 参照のみ                     | スナップショットに実際のキーをキャプチャする可能性 |

### それぞれをいつ使用するか

- **プロバイダーモデルを使用する場合**: チームで共有する標準モデルがある場合、一貫した設定が必要な場合、または誤ったオーバーライドを防ぎたい場合
- **ランタイムモデルを使用する場合**: 新しいモデルをすばやくテストする場合、一時的な資格情報を使用する場合、またはアドホックなエンドポイントを扱う場合

## 選択の永続化と推奨事項

> [!important]
>
> `modelProviders` は、可能な限りユーザースコープの `~/.qwen/settings.json` で定義し、どのスコープでも資格情報のオーバーライドを永続化しないようにしてください。プロバイダーカタログをユーザー設定に保持することで、プロジェクトスコープとユーザースコープ間のマージ/オーバーライドの競合を防ぎ、`/auth` と `/model` の更新が常に一貫したスコープに書き戻されることが保証されます。

- `/model` と `/auth` は、`model.name`（該当する場合）と `security.auth.selectedType` を、すでに `modelProviders` を定義している最も近い書き込み可能なスコープに永続化します。それ以外の場合はユーザースコープにフォールバックします。これにより、ワークスペース/ユーザーファイルがアクティブなプロバイダーカタログと同期されます。
- `modelProviders` がない場合、リゾルバーは CLI/env/settings レイヤーを混在させ、ランタイムモデルを作成します。これは単一プロバイダー設定では問題ありませんが、頻繁に切り替える場合には不便です。マルチモデルワークフローが一般的な場合は、切り替えがアトミックで、ソースに帰属し、デバッグ可能な状態を保つために、プロバイダーカタログを定義してください。