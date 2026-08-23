# モデルプロバイダー

Qwen Code では、`settings.json` の `modelProviders` 設定を通じて複数のモデルプロバイダーを構成できます。これにより、`/model` コマンドを使用して異なる AI モデルやプロバイダーを切り替えることができます。

## 概要

`modelProviders` を使用して、`/model` ピッカーで切り替え可能なモデルをプロバイダー ID ごとに宣言します。各キーはプロバイダー ID で、その値は**モデル定義の配列**（`ModelConfig[]`）です。組み込みプロバイダーの場合、キーは有効な認証タイプ（`openai`、`anthropic`、`gemini`、`vertex-ai`）である必要があります。カスタムプロバイダー ID（例: `idealab`）も、トップレベルの [`providerProtocol`](#カスタムプロバイダー-idproviderprotocol) 設定でプロトコルにマッピングされていれば使用できます。各モデルエントリには `id` が必要です。`envKey` は**任意ですが推奨されます**（省略した場合、認証タイプのデフォルトの環境変数キー、例えば `openai` の場合は `OPENAI_API_KEY` にフォールバックします）。その他、`name`、`description`、`baseUrl`、`generationConfig` は任意です。認証情報は設定に永続化されることはなく、ランタイムは `process.env[envKey]` から読み取ります。Qwen OAuth モデルはハードコードされたままとなり、上書きすることはできません。

> [!note]
>
> 以前のプレビューでは、各プロバイダーのモデルを `{ "protocol": ..., "models": [...] }` オブジェクトでラップしていましたが、この形式は廃止されました。現在の値は、このページ全体で示されている裸の `ModelConfig[]` 配列です。すでに移行済みの（`$version: 4`）設定ファイル内のラップされたエントリはサイレントにスキップされるため、古い設定は配列形式に更新してください。

> [!note]
>
> デフォルト以外の認証タイプを公開するのは `/model` コマンドのみです。Anthropic や Gemini などは `modelProviders` 経由で定義する必要があります。`/auth` コマンドには、**Alibaba ModelStudio**（サブメニューに Coding Plan、Token Plan、Standard API Key を含む）、**Third-party Providers**、**Custom Provider** の3つのトップレベルオプションが表示されます。（Qwen OAuth は選択可能なダイアログエントリではなくなりました。無料枠は 2026-04-15 に廃止されました。）

> [!note]
>
> **モデルの一意性:** 同じ `authType` 内のモデルは、`id` と `baseUrl` の組み合わせによって一意に識別されます。つまり、各エントリが異なる `baseUrl` を持っている限り（例えば、1つは OpenAI に直接、もう1つはプロキシエンドポイントを指すなど）、同じモデル ID（例: `"gpt-4o"`）を単一の `authType` 内で複数回定義できます。2つのエントリが同じ `id` と同じ `baseUrl` を共有する場合（または両方とも `baseUrl` を省略している場合）、最初に出現したものが優先され、その後の重複は警告とともにスキップされます。

### 画像生成ルート

組み込みの `image_gen` ツールでルートを使用できる場合、`supportsImageGeneration: true` を設定します。この機能は、`capabilities.vision` や `generationConfig.modalities.image` などの画像入力サポートとは独立しています。

ルートが画像生成専用で、通常のモデルセレクターに表示しない場合は、`imageOnly: true` を使用します。後方互換性のため、`imageOnly: true` は画像生成機能も暗黙に持つため、既存の設定を移行する必要はありません。

二重の役割を持つルートは、メインモデルとして、また `/model --image` 経由の両方で選択できます。

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "omni-model",
        "envKey": "MODEL_API_KEY",
        "baseUrl": "https://gateway.example.com/model-api",
        "supportsImageGeneration": true
      }
    ]
  }
}
```

専用画像ルートは両方のフィールドを設定します。`imageOnly: true` のみのレガシー形式も引き続き有効です。

```json
{
  "id": "image-model",
  "envKey": "MODEL_API_KEY",
  "baseUrl": "https://images.example.com/api/v1",
  "supportsImageGeneration": true,
  "imageOnly": true
}
```

選択されたルートは、明示的な HTTPS `baseUrl` と空でない `envKey` を宣言する必要があります。画像生成はルートと同じエンドポイントと認証情報を使用します。チャットと画像生成で異なるエンドポイントや認証情報が必要な場合は、代わりに2つのルートを構成してください。

## 認証タイプ別の設定例

以下は、利用可能なパラメータとその組み合わせを示す、さまざまな認証タイプの包括的な設定例です。

### サポートされている認証タイプ

`modelProviders` オブジェクトのキーは、有効な `authType` 値である必要があります。現在サポートされている認証タイプは次のとおりです。

| Auth Type    | Description                                                                                                                                     |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `openai`     | OpenAI 互換 API（OpenAI、Azure OpenAI、vLLM/Ollama などのローカル推論サーバー）                                                                 |
| `anthropic`  | Anthropic Claude API                                                                                                                            |
| `gemini`     | Google Gemini API                                                                                                                               |
| `qwen-oauth` | Qwen OAuth（ハードコードされており、`modelProviders` で上書きできません）                                                                       |
| `vertex-ai`  | Google Vertex AI（Vertex AI モードで `gemini` プロトコルと `@google/genai` SDK を使用します。選択すると `GOOGLE_GENAI_USE_VERTEXAI=true` が設定されます） |

> [!note]
> Vertex AI エントリは**Application Default Credentials** で認証できます。`GOOGLE_CLOUD_PROJECT`（およびオプションで `GOOGLE_CLOUD_LOCATION`、デフォルトは `global`）を設定し、`envKey` を未設定のままにします。リゾルバーが読み取る他のすべてのキーソース（`GOOGLE_API_KEY`、`settings.security.auth.apiKey`、CLI のキーフラグ）も未設定にしてください。Vertex エントリに到達した API キー値は、Google SDK を Vertex Express モードに切り替えます。このモードでは、プロジェクト、ロケーション、ADC 認証情報は無視されます。`envKey` を宣言するエントリは ADC にルーティングされないため、注入に失敗したキーは、別のプリンシパルとしてサイレントに認証される代わりに、その変数で失敗し続けます。

> [!warning]
> 組み込みプロトコルでも `providerProtocol` 経由でマッピングされていないプロバイダー ID（例: `"openai-custom"` のようなタイプミス）はルーティングできないため、エントリ全体が警告とともに**スキップ**されます。モデルは `/model` ピッカーに表示されません。組み込みプロバイダーには上記のサポートされている認証タイプ値のいずれかを使用するか、カスタム ID には [`providerProtocol`](#カスタムプロバイダー-idproviderprotocol) マッピングを追加してください。

### カスタムプロバイダー ID（`providerProtocol`）

組み込みのプロバイダー ID（`openai`、`gemini`、`anthropic`、`vertex-ai`、`qwen-oauth`）は自動的に SDK プロトコルにルーティングされます。より分かりやすい名前で複数の OpenAI 互換エンドポイントをグループ化するなど、**カスタム**プロバイダー ID を使用するには、`modelProviders` 配下に宣言し、トップレベルの `providerProtocol` 設定で組み込みプロトコルにマッピングします。

```json
{
  "modelProviders": {
    "idealab": [
      {
        "id": "my-model",
        "envKey": "IDEALAB_API_KEY",
        "baseUrl": "https://idealab.example.com/v1"
      }
    ]
  },
  "providerProtocol": {
    "idealab": "openai"
  }
}
```

一致する `providerProtocol` エントリがない場合、カスタムプロバイダー ID はスキップされます（上記の警告を参照）。

### API リクエストに使用される SDK

Qwen Code は、各プロバイダーへのリクエスト送信に以下の公式 SDK を使用します。

| Auth Type    | SDK Package                                                                                     |
| ------------ | ----------------------------------------------------------------------------------------------- |
| `openai`     | [`openai`](https://www.npmjs.com/package/openai) - 公式 OpenAI Node.js SDK                      |
| `anthropic`  | [`@anthropic-ai/sdk`](https://www.npmjs.com/package/@anthropic-ai/sdk) - 公式 Anthropic SDK     |
| `gemini`     | [`@google/genai`](https://www.npmjs.com/package/@google/genai) - 公式 Google GenAI SDK          |
| `qwen-oauth` | カスタムプロバイダー（DashScope 互換）を伴う [`openai`](https://www.npmjs.com/package/openai)   |

これは、設定する `baseUrl` が対応する SDK が期待する API 形式と互換性を持っている必要があることを意味します。例えば、`openai` 認証タイプを使用する場合、エンドポイントは OpenAI API 形式のリクエストを受け付ける必要があります。

### OpenAI 互換プロバイダー（`openai`）

この認証タイプは、OpenAI の公式 API だけでなく、OpenRouter や Requesty などの集約モデルプロバイダーを含む、OpenAI 互換のエンドポイントであればサポートします。

```json
{
  "env": {
    "OPENAI_API_KEY": "sk-your-actual-openai-key-here",
    "OPENROUTER_API_KEY": "sk-or-your-actual-openrouter-key-here",
    "REQUESTY_API_KEY": "sk-your-actual-requesty-key-here"
  },
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
          "retryInitialDelayMs": 3000,
          "retryMaxDelayMs": 30000,
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
```

### Anthropic（`anthropic`）

```json
{
  "env": {
    "ANTHROPIC_API_KEY": "sk-ant-your-actual-anthropic-key-here"
  },
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

### Google Gemini（`gemini`）

```json
{
  "env": {
    "GEMINI_API_KEY": "AIza-your-actual-gemini-key-here"
  },
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

通常の Qwen Code エージェントポリシーに従い、ツールも使用できるビジョンモデルの場合、両方の機能を指定してフルターンの画像ルーティングにオプトインします。

```json
"capabilities": {
  "vision": true,
  "agent": true
}
```

テキストのみのプライマリモデルがそのモデルをビジョンフォールバックとして使用している場合、画像付きの完全なターンは、ツール呼び出しとリトライを通じて、その正確なプロバイダー、モデル、エンドポイント上に保持されます。次の独立したターンはプライマリに戻り、各モデルリクエストはそのターゲットでサポートされるメディアモダリティのみを受け取ります。`agent` を省略する（または `false` に設定する）と、より安全な Vision Bridge トランスクリプションフローが維持されます。

### ローカルセルフホストモデル（OpenAI 互換 API 経由）

ほとんどのローカル推論サーバー（vLLM、Ollama、LM Studio など）は、OpenAI 互換の API エンドポイントを提供しています。ローカルの `baseUrl` を使用して `openai` 認証タイプでそれらを構成します。

```json
{
  "env": {
    "OLLAMA_API_KEY": "ollama",
    "VLLM_API_KEY": "not-needed",
    "LMSTUDIO_API_KEY": "lm-studio"
  },
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

認証を必要としないローカルサーバーの場合、API キーには任意のプレースホルダー値を使用できます。

```bash
# For Ollama (no auth required)
export OLLAMA_API_KEY="ollama"

# For vLLM (if no auth is configured)
export VLLM_API_KEY="not-needed"
```

> [!note]
>
> `extra_body` パラメータは **OpenAI 互換プロバイダー（`openai`、`qwen-oauth`）でのみサポート**されます。Anthropic および Gemini プロバイダーでは無視されます。

> [!note]
>
> **`envKey` について**: `envKey` フィールドは、実際の API キーの値ではなく、**環境変数の名前**を指定します。設定を機能させるには、対応する環境変数に実際の API キーが設定されていることを確認する必要があります。これには 2 つの方法があります。
>
> - **オプション 1: `.env` ファイルを使用する**（セキュリティ上の理由から推奨）:
>   ```bash
>   # ~/.qwen/.env (またはプロジェクトルート)
>   OPENAI_API_KEY=sk-your-actual-key-here
>   ```
>   シークレットが誤ってコミットされないように、必ず `.env` を `.gitignore` に追加してください。
> - **オプション 2: `settings.json` の `env` フィールドを使用する**（上記の例で示されている通り）:
>   ```json
>   {
>     "env": {
>       "OPENAI_API_KEY": "sk-your-actual-key-here"
>     }
>   }
>   ```
>
> 各プロバイダーの例には、API キーをどのように構成すべきかを示すために `env` フィールドが含まれています。
## Alibaba Cloud Coding Plan

Alibaba Cloud Coding Plan は、コーディングタスクに最適化された Qwen モデルの事前構成セットを提供します。この機能は Alibaba Cloud Coding Plan API アクセス権を持つユーザーが利用でき、モデル構成の自動更新により簡略化されたセットアップ体験を提供します。

### 概要

`/auth` コマンドを使用して Alibaba Cloud Coding Plan API キーで認証すると、Qwen Code は以下のモデルを自動的に構成します。

| Model ID               | Name                 | Description                                               |
| ---------------------- | -------------------- | --------------------------------------------------------- |
| `qwen3.5-plus`         | qwen3.5-plus         | 思考機能が有効なアドバンスドモデル                        |
| `qwen3.6-plus`         | qwen3.6-plus         | 思考機能が有効な最新モデル（Pro サブスクライバー限定）    |
| `qwen3.7-plus`         | qwen3.7-plus         | 思考機能が有効なアドバンスドモデル                        |
| `qwen3-coder-plus`     | qwen3-coder-plus     | コーディングタスクに最適化されたモデル                    |
| `qwen3-coder-next`     | qwen3-coder-next     | 実験的なコーディングモデル                                |
| `qwen3-max-2026-01-23` | qwen3-max-2026-01-23 | 思考機能が有効な最新の max モデル                         |
| `glm-5`                | glm-5                | 思考機能が有効な GLM モデル                               |
| `glm-4.7`              | glm-4.7              | 思考機能が有効な GLM モデル                               |
| `kimi-k2.5`            | kimi-k2.5            | 思考機能およびビジョン/ビデオサポート付き Kimi モデル     |
| `MiniMax-M2.5`         | MiniMax-M2.5         | 思考機能が有効な MiniMax モデル                           |

### セットアップ

1. Alibaba Cloud Coding Plan API キーを取得します。
   - **中国**: <https://bailian.console.aliyun.com/?tab=model#/efm/coding_plan>
   - **インターナショナル**: <https://modelstudio.console.alibabacloud.com/?tab=dashboard#/efm/coding_plan>
2. Qwen Code で `/auth` コマンドを実行します
3. **Alibaba ModelStudio** を選択し、サブメニューから **Coding Plan** を選択します
4. リージョンを選択します
5. プロンプトに従って API キーを入力します

モデルは自動的に構成され、`/model` ピッカーに追加されます。

### リージョン

Alibaba Cloud Coding Plan は 2 つのリージョンをサポートしています。

| Region               | Endpoint                                        | Description             |
| -------------------- | ----------------------------------------------- | ----------------------- |
| China                | `https://coding.dashscope.aliyuncs.com/v1`      | 中国本土エンドポイント  |
| Global/International | `https://coding-intl.dashscope.aliyuncs.com/v1` | 国際エンドポイント      |

リージョンは認証時に選択され、`settings.json` 内の `modelProviders` 構成に保存されます。リージョンを切り替えるには、`/auth` コマンドを再実行して別のリージョンを選択してください。

### API キーの保存

`/auth` コマンドを通じて Coding Plan を構成すると、API キーは予約済みの環境変数名 `BAILIAN_CODING_PLAN_API_KEY` を使用して保存されます。デフォルトでは、`settings.json` ファイルの `env` フィールドに保存されます。

> [!warning]
>
> **セキュリティに関する推奨事項**: セキュリティを強化するため、API キーを `settings.json` から別の `.env` ファイルに移動し、環境変数として読み込むことを推奨します。例:
>
> ```bash
> # ~/.qwen/.env
> BAILIAN_CODING_PLAN_API_KEY=your-api-key-here
> ```
>
> プロジェクトレベルの設定を使用している場合は、このファイルが `.gitignore` に追加されていることを確認してください。

### 自動更新

Coding Plan のモデル構成はバージョン管理されています。Qwen Code がモデルテンプレートの新しいバージョンを検出すると、更新を促すプロンプトが表示されます。更新を受け入れると、以下の処理が行われます。

- 既存の Coding Plan モデル構成を最新バージョンに置き換えます
- 手動で追加したカスタムモデル構成は保持されます
- 更新された構成の最初のモデルに自動的に切り替わります

この更新プロセスにより、手動で操作することなく、常に最新のモデル構成と機能にアクセスできるようになります。

### 手動構成（上級者向け）

Coding Plan モデルを手動で構成したい場合は、他の OpenAI 互換プロバイダーと同様に `settings.json` に追加できます。

```json
{
  "modelProviders": {
    "openai": [
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
```

> [!note]
>
> 手動構成を使用する場合:
>
> - `envKey` には任意の環境変数名を使用できます
> - `codingPlan.*` を構成する必要はありません
> - 手動で構成された Coding Plan モデルには**自動更新は適用されません**

> [!warning]
>
> 自動 Coding Plan 構成も使用している場合、手動構成が自動構成と同じ `envKey` と `baseUrl` を使用していると、自動更新によって手動構成が上書きされる可能性があります。これを避けるため、可能であれば手動構成で異なる `envKey` を使用するようにしてください。

## 解決レイヤーとアトミック性

有効な auth/model/credential の値は、以下の優先順位に従ってフィールドごとに選択されます（最初に存在するものが優先されます）。`--auth-type` と `--model` を組み合わせて、プロバイダーエントリを直接指定できます。これらの CLI フラグは他のレイヤーよりも先に実行されます。

| Layer (highest → lowest)   | authType                            | model                                           | apiKey                                                | baseUrl                                                | apiKeyEnvKey           | proxy                             |
| -------------------------- | ----------------------------------- | ----------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------ | ---------------------- | --------------------------------- |
| プログラムによるオーバーライド | `/auth`                             | `/auth` 入力                                    | `/auth` 入力                                          | `/auth` 入力                                           | —                      | —                                 |
| モデルプロバイダーの選択   | —                                   | `modelProvider.id`                              | `env[modelProvider.envKey]`                           | `modelProvider.baseUrl`                                | `modelProvider.envKey` | —                                 |
| CLI 引数                   | `--auth-type`                       | `--model`                                       | `--openai-api-key`                                    | `--openai-base-url`                                    | —                      | —                                 |
| 環境変数                   | —                                   | プロバイダー固有のマッピング（例: `OPENAI_MODEL`） | プロバイダー固有のマッピング（例: `OPENAI_API_KEY`）  | プロバイダー固有のマッピング（例: `OPENAI_BASE_URL`）  | —                      | —                                 |
| 設定（`settings.json`）    | `security.auth.selectedType`        | `model.name`                                    | `security.auth.apiKey`                                | `security.auth.baseUrl`                                | —                      | —                                 |
| デフォルト / 計算値        | `AuthType.QWEN_OAUTH` にフォールバック | 組み込みのデフォルト（OpenAI ⇒ `qwen3.5-plus`） | —                                                     | —                                                      | —                      | 設定されている場合 `Config.getProxy()` |

\*CLI の認証フラグが存在する場合、設定をオーバーライドします。それ以外の場合、`security.auth.selectedType` または暗黙のデフォルトによって認証タイプが決定されます。追加の構成なしに公開される認証タイプは、Qwen OAuth と OpenAI のみです。

> [!note]
>
> `--openai-api-key` と `--openai-base-url` が唯一の認証情報 CLI フラグです。これらは、名前に関係なくアクティブな OpenAI 互換プロバイダーに適用されます。`--anthropic-*` や `--gemini-*` の認証情報フラグは存在しません。CLI で渡されないプロバイダー固有の認証情報は、環境変数から解決されます（下の行を参照）。

> [!warning]
>
> **`security.auth.apiKey` と `security.auth.baseUrl` の非推奨化:** `settings.json` 内の `security.auth.apiKey` と `security.auth.baseUrl` を介して API 認証情報を直接構成することは非推奨となりました。これらの設定は過去のバージョンで UI から入力された認証情報に使用されていましたが、認証情報の入力フローはバージョン 0.10.1 で削除されました。これらのフィールドは将来のリリースで完全に削除される予定です。**すべてのモデルおよび認証情報の構成については、`modelProviders` への移行を強く推奨します**。設定ファイルに認証情報をハードコーディングするのではなく、`modelProviders` 内の `envKey` を使用して環境変数を参照し、安全な認証情報管理を行ってください。

## 生成構成のレイヤリング: 不透過なプロバイダーレイヤー

構成の解決は厳密なレイヤリングモデルに従いますが、1 つの重要なルールがあります。**modelProvider レイヤーは不透過である**ということです。

### 仕組み

1. **modelProvider のモデルが選択されている場合**（例: `/model` コマンドでプロバイダー構成済みのモデルを選択した場合）:
   - プロバイダーからの `generationConfig` 全体が**アトミックに**適用されます
   - **プロバイダーレイヤーは完全に不透過です** — 下位のレイヤー（CLI、env、settings）は generationConfig の解決に一切関与しません
   - `modelProviders[].generationConfig` で定義されているすべてのフィールドは、プロバイダーの値を使用します
   - プロバイダーによって定義されて**いない**すべてのフィールドは `undefined` に設定されます（設定から継承されません）
   - これにより、プロバイダー構成は完全で自己完結した「密封されたパッケージ」として機能します

   モデルが `modelProviders` にリストされている場合、そのモデル固有の生成設定はすべて、一致するプロバイダーエントリに記述してください。`contextWindowSize`、`modalities`、`customHeaders`、`extra_body` を含むトップレベルの `model.generationConfig` の値は、プロバイダーモデルでは無視されます。これらのフィールドを適用するには、`modelProviders[authType][].generationConfig` 配下で構成してください。

2. **modelProvider のモデルが選択されていない場合**（例: 生のモデル ID で `--model` を使用する場合、または CLI/env/settings を直接使用する場合）:
   - 解決は下位のレイヤーにフォールスルーします
   - フィールドは CLI → env → settings → デフォルトの順で設定されます
   - これにより**ランタイムモデル**が作成されます（次のセクションを参照）

### generationConfig のフィールドごとの優先順位

| Priority | Source                                        | Behavior                                                                                                 |
| -------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1        | プログラムによるオーバーライド                | ランタイムの `/model`、`/auth` の変更                                                                    |
| 2        | `modelProviders[authType][].generationConfig` | **不透過レイヤー** - すべての generationConfig フィールドを完全に置き換えます。下位レイヤーは関与しません |
| 3        | `settings.model.generationConfig`             | **ランタイムモデル**（プロバイダーモデルが選択されていない場合）にのみ使用されます                       |
| 4        | コンテンツジェネレーターのデフォルト          | プロバイダー固有のデフォルト（例: OpenAI と Gemini）- ランタイムモデルにのみ適用                         |

### アトミックなフィールドの扱い

以下のフィールドはアトミックなオブジェクトとして扱われます。プロバイダーの値がオブジェクト全体を完全に置き換え、マージは行われません。

- `samplingParams` - Temperature、top_p、max_tokens など
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

// modelProviders の設定
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

`modelProviders` から `gpt-4o` を選択した場合:

- `timeout` = 60000（プロバイダーから、設定を上書き）
- `samplingParams.temperature` = 0.2（プロバイダーから、設定オブジェクトを完全に置換）
- `samplingParams.max_tokens` = **undefined**（プロバイダーで定義されておらず、プロバイダー層は設定から継承しないため、指定されていないフィールドは明示的に undefined に設定される）

`--model gpt-4` を使用してローモデルを使用する場合（`modelProviders` からのものではなく、Runtime Model が作成される）:

- `timeout` = 30000（設定から）
- `samplingParams.temperature` = 0.5（設定から）
- `samplingParams.max_tokens` = 1000（設定から）

`modelProviders` 自体のマージ戦略は REPLACE（置換）です。プロジェクト設定の `modelProviders` 全体が、ユーザー設定の対応するセクションをマージするのではなく上書きします。

## Reasoning / thinking の設定

`generationConfig` 下のオプションの `reasoning` フィールドは、モデルが応答前にどの程度積極的に推論を行うかを制御します。Anthropic と Gemini のコンバータは常にこれを尊重します。OpenAI 互換パイプラインは、`generationConfig.samplingParams` が設定されて**いない限り**これを尊重します。以下の「`samplingParams` との相互作用」に関する注意事項を参照してください。

```jsonc
{
  "modelProviders": {
    "openai": [
      {
        "id": "deepseek-v4-pro",
        "name": "DeepSeek V4 Pro",
        "baseUrl": "https://api.deepseek.com/v1",
        "envKey": "DEEPSEEK_API_KEY",
        "generationConfig": {
          // 4段階のスケール:
          //   'low'    | 'medium' — DeepSeek ではサーバー側で 'high' にマッピングされる
          //   'high'   — デフォルトの推論強度
          //   'max'    — DeepSeek 固有の超強力なティア
          // または、推論を完全に無効にするには `false` を設定する。
          "reasoning": { "effort": "max" },
        },
      },
    ],
  },
}
```

### プロバイダーごとの動作

| プロトコル / プロバイダー | 通信時の形状 | 備考 |
| --- | --- | --- |
| **OpenAI / DashScope**（`qwen3.8-max` ファミリー） | フラットな `reasoning_effort: <effort>` ボディパラメータ | 5 つの `/effort` ティア（`low`、`medium`、`high`、`xhigh`、`max`）は、`qwen3.8-max` で始まるモデル ID（日付付きスナップショットや `-latest` エイリアスを含む）に対してそのまま透過的に渡されます。DashScope がモデル固有のマッピングを適用します。`reasoning_effort` と `thinking_budget` が競合する場合、通常の `extra_body` > `samplingParams` > `reasoning` の優先順位により、より高優先度のフィールドのみが保持されます。明示的な同一レイヤーのペアは `reasoning_effort` を保持し、クロスレイヤー解決前のプロバイダーの動作と一致します。静的フィールドが優先された場合、`/effort` はリクエストされたティアが有効であることを示唆する代わりにそのフィールドを報告します。effort ティアが優先された場合、競合する `enable_thinking` も削除されます。`extra_body` 内の明示的な `enable_thinking: false` は、削除されるのではなく尊重されます。設定されたティアを `reasoning_effort: 'none'` としてオーバーライドし、`extra_body` がそのまま勝つ数少ない場所の 1 つです。他の Qwen モデルは、選択された effort を `enable_thinking: true` にマッピングし続けます。`reasoning_effort` のオーバーライドは、`thinking_budget` と競合しない限りそのまま渡されます（DashScope が拒否するペアであり、その場合、不活性な `reasoning_effort` が削除され、`enable_thinking` と `thinking_budget` の両方が保持されます）。 |
| **OpenAI / DeepSeek** (`api.deepseek.com`) | フラットな `reasoning_effort: <effort>` ボディパラメータ | ネストされた設定形状で `reasoning.effort` が設定されている場合、フラットな `reasoning_effort` に書き換えられ、`'low'`/`'medium'` は `'high'` に、`'xhigh'` は `'max'` に正規化されます。これは DeepSeek の[サーバー側の後方互換性](https://api-docs.deepseek.com/zh-cn/api/create-chat-completion)を反映しています。トップレベルの `samplingParams.reasoning_effort` または `extra_body.reasoning_effort` のオーバーライドは、この正規化をスキップしてそのまま送信されます。 |
| **OpenAI**（その他の互換サーバー） | `reasoning: { effort, ... }` がそのまま渡される | プロバイダーが異なる形状を期待している場合、`samplingParams` 経由で設定します（例: GPT-5/o シリーズの場合は `samplingParams.reasoning_effort`）。 |
| **Anthropic**（実際の `api.anthropic.com`） | `output_config: { effort }` と `effort-2025-11-24` ベータヘッダー | 実際の Anthropic は `'low'`/`'medium'`/`'high'` のみを受け付けます。`'max'` は `debugLogger.warn` のログ（ジェネレーターごとに1回）と共に **`'high'` にクランプ**されます。最大限の effort を得たい場合は、baseURL をそれをサポートする DeepSeek 互換エンドポイントに切り替えてください。 |
| **Anthropic** (`api.deepseek.com/anthropic`) | 同じく `output_config: { effort }` + ベータヘッダー | `'max'` は変更せずにそのまま渡されます。 |
| **Gemini** (`@google/genai`) | `thinkingConfig: { includeThoughts: true, thinkingLevel }` | `'low'` → `LOW`、`'high'`/`'max'` → `HIGH`、その他 → `THINKING_LEVEL_UNSPECIFIED`（Gemini には `MAX` ティアがありません）。 |

### `reasoning: false`

`reasoning: false`（リテラルのブール値）を設定すると、すべてのプロバイダーで明示的に思考が無効になります。これは、推論の恩恵を受けない安価なサイドクエリに便利です。これはリクエストレベルでも尊重され、ワンオフの呼び出し（例: 提案の生成）では `request.config.thinkingConfig.includeThoughts: false` 経由で有効になります。

`api.deepseek.com` の baseURL では、OpenAI パイプラインは DeepSeek V4+ が要求する明示的な `thinking: { type: 'disabled' }` フィールドを出力します。サーバー側のデフォルトは `'enabled'` であるため、単に `reasoning_effort` を省略するだけでは思考のレイテンシ/コストが発生してしまいます。セルフホストの DeepSeek バックエンド（sglang/vllm）やその他の OpenAI 互換サーバーは、このフィールドを受け取り**ません**。それらで思考を無効にする必要がある場合は、`samplingParams`/`extra_body` 経由で `thinking: { type: 'disabled' }`（または推論フレームワークが公開している任意の設定値）を注入してください。

### `samplingParams` との相互作用（OpenAI 互換のみ）

> [!warning]
>
> OpenAI 互換プロバイダーで `generationConfig.samplingParams` が設定されている場合、パイプラインはそれらのキーを**そのまま**通信時に送信し、個別の `reasoning` の注入を完全にスキップします。したがって、`{ samplingParams: { temperature: 0.5 }, reasoning: { effort: 'max' } }` のような設定では、OpenAI/DeepSeek リクエストにおいて reasoning フィールドが暗黙に破棄されます。
>
> DashScope Qwen モデルは例外です。プロバイダーは `reasoning` を直接読み取り、`reasoning_effort` または `enable_thinking` にマッピングします。qwen3.8-max ファミリーでは、ワイヤーパラメータが競合する場合、プロバイダー固有の `samplingParams` フィールドが引き続き優先されます。古い qwen ハイブリッドでは、設定された effort ティアは `enable_thinking: true` に折りたたまれ、`samplingParams.enable_thinking` の値をオーバーライドします。
>
> `samplingParams` を設定する場合は、その中に直接 reasoning の設定を含めてください。DeepSeek の場合は `samplingParams.reasoning_effort`、GPT-5/o シリーズの場合は `samplingParams.reasoning_effort`（フラットなフィールド）または `samplingParams.reasoning`（ネストされたオブジェクト）です。OpenRouter やその他のプロバイダーではフィールド名が異なる場合があります。プロバイダーのドキュメントを参照してください。
>
> Anthropic と Gemini のコンバータは影響を受けません。`samplingParams` に関わらず、常に `reasoning.effort` を直接読み取ります。

### `budget_tokens`

`effort` と併せて `budget_tokens` を含めることで、正確な思考トークン予算を固定できます。

```jsonc
"reasoning": { "effort": "high", "budget_tokens": 50000 }
```

Anthropic の場合、これは `thinking.budget_tokens` になります。OpenAI/DeepSeek の場合、フィールドは保持されますが、現在はサーバー側で無視されます。`reasoning_effort` が実際に機能する設定となります。

## Provider Models と Runtime Models

Qwen Code は、2種類のモデル設定を区別しています。

### Provider Model

- `modelProviders` 設定で定義される
- 完全でアトミックな設定パッケージを持つ
- 選択されると、その設定は透過性のないレイヤーとして適用される
- 完全なメタデータ（名前、説明、機能）と共に `/model` コマンドリストに表示される
- 複数モデルのワークフローやチーム間の一貫性維持に推奨

### Runtime Model

- CLI（`--model`）、環境変数、または設定経由でローモデル ID を使用する場合に動的に作成される
- `modelProviders` では定義されない
- 解決レイヤー（CLI → env → settings → defaults）を「投影」することで設定が構築される
- 完全な設定が検出されると、自動的に **RuntimeModelSnapshot** としてキャプチャされる
- 資格情報を再入力せずに再利用できる

### RuntimeModelSnapshot のライフサイクル

`modelProviders` を使用せずにモデルを設定すると、Qwen Code は自動的に RuntimeModelSnapshot を作成して設定を保持します。

```bash
# これにより、ID: $runtime|openai|my-custom-model の RuntimeModelSnapshot が作成される
qwen --auth-type openai --model my-custom-model --openai-api-key $KEY --openai-base-url https://api.example.com/v1
```

スナップショットは以下の情報を保持します:

- モデル ID、API キー、base URL、および生成設定をキャプチャする
- セッションをまたいで保持される（実行中はメモリに保存）
- `/model` コマンドリストにランタイムオプションとして表示される
- `/model $runtime|openai|my-custom-model` を使用して切り替えることができる

### 主な違い

| 項目 | Provider Model | Runtime Model |
| --- | --- | --- |
| 設定のソース | 設定内の `modelProviders` | CLI、env、settings の各レイヤー |
| 設定のアトミック性 | 完全で透過性のないパッケージ | レイヤー化され、各フィールドは独立して解決される |
| 再利用性 | `/model` リストで常に利用可能 | スナップショットとしてキャプチャされ、完全な場合にのみ表示される |
| チームでの共有 | あり（コミットされた設定経由） | なし（ユーザーローカル） |
| 資格情報の保存 | `envKey` 経由での参照のみ | スナップショットに実際のキーがキャプチャされる場合がある |

### 使い分け

- **Provider Models を使用する場合**: チームで共有する標準モデルがあり、一貫した設定が必要、または意図しない上書きを防ぎたい場合
- **Runtime Models を使用する場合**: 新しいモデルを素早くテストする場合、一時的な資格情報を使用する場合、またはアドホックなエンドポイントで作業する場合

## 選択の永続化と推奨事項

> [!important]
>
> 可能な限りユーザー範囲の `~/.qwen/settings.json` で `modelProviders` を定義し、どの範囲でも資格情報のオーバーライドを永続化しないようにしてください。プロバイダーカタログをユーザー設定に保持することで、プロジェクト範囲とユーザー範囲間のマージ/オーバーライドの競合を防ぎ、`/auth` と `/model` の更新が常に一貫した範囲に書き戻されるようにします。

- `/model` と `/auth` は、`modelProviders` をすでに定義している最も近い書き込み可能な範囲に `model.name`（該当する場合）と `security.auth.selectedType` を永続化します。それ以外の場合はユーザー範囲にフォールバックします。これにより、ワークスペース/ユーザーファイルがアクティブなプロバイダーカタログと同期されます。
- `modelProviders` がない場合、リゾルバーは CLI/env/settings の各レイヤーを混在させて Runtime Models を作成します。これは単一プロバイダーのセットアップでは問題ありませんが、頻繁に切り替える場合は煩雑です。複数モデルのワークフローが一般的である場合は、常にプロバイダーカタログを定義し、切り替えがアトミックで、ソースが追跡可能かつデバッグ可能になるようにしてください。
