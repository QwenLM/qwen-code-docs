# モデルプロバイダー

Qwen Code では、`settings.json` の `modelProviders` 設定を使用して複数のモデルプロバイダーを構成できます。これにより、`/model` コマンドを使用して異なる AI モデルやプロバイダーを切り替えることができます。

## 概要

`modelProviders` を使用して、認証タイプごとに `/model` ピッカーで切り替え可能なモデルリストを宣言します。キーは有効な認証タイプ（`openai`、`anthropic`、`gemini` など）である必要があります。各エントリには `id` が必要で、**`envKey` を必ず含める**必要があります。`name`、`description`、`baseUrl`、`generationConfig` はオプションです。認証情報は設定ファイルに永続化されません。ランタイムは `process.env[envKey]` から読み取ります。Qwen OAuth モデルはハードコードされており、上書きできません。

> [!note]
>
> `/model` コマンドのみがデフォルト以外の認証タイプを公開します。Anthropic や Gemini などは `modelProviders` 経由で定義する必要があります。`/auth` コマンドには、組み込みの認証オプションとして Qwen OAuth、Alibaba Cloud Coding Plan、および API Key がリストされます。

> [!warning]
>
> **同じ authType 内のモデル ID の重複:** 単一の `authType` 内で同じ `id` を持つ複数のモデルを定義すること（例：`openai` 内に `"id": "gpt-4o"` が 2 つある場合）は、現在サポートされていません。重複が存在する場合、**最初に出現したものが優先**され、後続の重複は警告とともにスキップされます。`id` フィールドは構成識別子として使用されると同時に、API に送信される実際のモデル名としても使用されるため、一意の ID（例：`gpt-4o-creative`、`gpt-4o-balanced`）を使用しても回避策にはなりません。これは既知の制限事項であり、今後のリリースで対応する予定です。

## 認証タイプ別の構成例

以下は、利用可能なパラメーターとその組み合わせを示す、異なる認証タイプ向けの包括的な構成例です。

### サポートされている認証タイプ

`modelProviders` オブジェクトのキーは、有効な `authType` 値である必要があります。現在サポートされている認証タイプは次のとおりです。

| Auth Type    | Description                                                                             |
| ------------ | --------------------------------------------------------------------------------------- |
| `openai`     | OpenAI 互換 API（OpenAI、Azure OpenAI、vLLM/Ollama などのローカル推論サーバー） |
| `anthropic`  | Anthropic Claude API                                                                    |
| `gemini`     | Google Gemini API                                                                       |
| `qwen-oauth` | Qwen OAuth（ハードコード済み。`modelProviders` で上書き不可）                       |

> [!warning]
> 無効な認証タイプキー（例：`"openai-custom"` のようなタイプミス）を使用した場合、構成は**サイレントにスキップ**され、モデルは `/model` ピッカーに表示されません。必ず上記のサポートされている認証タイプ値のいずれかを使用してください。

### API リクエストに使用される SDK

Qwen Code は、各プロバイダーへのリクエスト送信に以下の公式 SDK を使用します。

| Auth Type    | SDK Package                                                                                     |
| ------------ | ----------------------------------------------------------------------------------------------- |
| `openai`     | [`openai`](https://www.npmjs.com/package/openai) - 公式 OpenAI Node.js SDK                  |
| `anthropic`  | [`@anthropic-ai/sdk`](https://www.npmjs.com/package/@anthropic-ai/sdk) - 公式 Anthropic SDK |
| `gemini`     | [`@google/genai`](https://www.npmjs.com/package/@google/genai) - 公式 Google GenAI SDK      |
| `qwen-oauth` | [`openai`](https://www.npmjs.com/package/openai)（カスタムプロバイダー経由、DashScope 互換）    |

つまり、構成する `baseUrl` は、対応する SDK が期待する API 形式と互換性がある必要があります。例えば、`openai` 認証タイプを使用する場合、エンドポイントは OpenAI API 形式のリクエストを受け入れる必要があります。

### OpenAI 互換プロバイダー（`openai`）

この認証タイプは OpenAI の公式 API だけでなく、OpenRouter などの集約型モデルプロバイダーを含む、OpenAI 互換のエンドポイントもサポートしています。

```json
{
  "env": {
    "OPENAI_API_KEY": "sk-your-actual-openai-key-here",
    "OPENROUTER_API_KEY": "sk-or-your-actual-openrouter-key-here"
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

### ローカルセルフホストモデル（OpenAI 互換 API 経由）

vLLM、Ollama、LM Studio などのほとんどのローカル推論サーバーは、OpenAI 互換の API エンドポイントを提供しています。ローカルの `baseUrl` を指定して `openai` 認証タイプで構成します。

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

認証を必要としないローカルサーバーの場合、API キーに任意のプレースホルダー値を使用できます。

```bash
# For Ollama (no auth required)
export OLLAMA_API_KEY="ollama"

# For vLLM (if no auth is configured)
export VLLM_API_KEY="not-needed"
```

> [!note]
>
> `extra_body` パラメーターは **OpenAI 互換プロバイダー（`openai`、`qwen-oauth`）のみでサポート**されています。Anthropic および Gemini プロバイダーでは無視されます。

> [!note]
>
> **`envKey` について**: `envKey` フィールドは実際の API キーの値ではなく、**環境変数の名前**を指定します。構成を機能させるには、対応する環境変数に実際の API キーが設定されていることを確認する必要があります。これを行う方法は 2 つあります。
>
> - **オプション 1: `.env` ファイルを使用する**（セキュリティ推奨）:
>   ```bash
>   # ~/.qwen/.env (or project root)
>   OPENAI_API_KEY=sk-your-actual-key-here
>   ```
>   機密情報を誤ってコミットしないよう、`.env` を `.gitignore` に追加してください。
> - **オプション 2: `settings.json` の `env` フィールドを使用する**（上記の例で示した通り）:
>   ```json
>   {
>     "env": {
>       "OPENAI_API_KEY": "sk-your-actual-key-here"
>     }
>   }
>   ```
>
> 各プロバイダーの例には、API キーの構成方法を示すために `env` フィールドが含まれています。

## Alibaba Cloud Coding Plan

Alibaba Cloud Coding Plan は、コーディングタスクに最適化された Qwen モデルの事前構成セットを提供します。この機能は Alibaba Cloud Coding Plan API アクセス権を持つユーザーが利用でき、モデル構成の自動更新による簡素化されたセットアップ体験を提供します。

### 概要

`/auth` コマンドを使用して Alibaba Cloud Coding Plan API キーで認証すると、Qwen Code は以下のモデルを自動的に構成します。

| Model ID               | Name                 | Description                            |
| ---------------------- | -------------------- | -------------------------------------- |
| `qwen3.5-plus`         | qwen3.5-plus         | 思考機能が有効な高度なモデル   |
| `qwen3-coder-plus`     | qwen3-coder-plus     | コーディングタスクに最適化             |
| `qwen3-max-2026-01-23` | qwen3-max-2026-01-23 | 思考機能が有効な最新の最大モデル |

### セットアップ

1. Alibaba Cloud Coding Plan API キーを取得します:
   - **中国**: <https://bailian.console.aliyun.com/?tab=model#/efm/coding_plan>
   - **国際版**: <https://modelstudio.console.alibabacloud.com/?tab=dashboard#/efm/coding_plan>
2. Qwen Code で `/auth` コマンドを実行します
3. **Alibaba Cloud Coding Plan** を選択します
4. リージョンを選択します
5. プロンプトに従って API キーを入力します

モデルは自動的に構成され、`/model` ピッカーに追加されます。

### リージョン

Alibaba Cloud Coding Plan は 2 つのリージョンをサポートしています。

| Region               | Endpoint                                        | Description             |
| -------------------- | ----------------------------------------------- | ----------------------- |
| China                | `https://coding.dashscope.aliyuncs.com/v1`      | 中国本土エンドポイント |
| Global/International | `https://coding-intl.dashscope.aliyuncs.com/v1` | 国際版エンドポイント  |

リージョンは認証時に選択され、`settings.json` の `codingPlan.region` に保存されます。リージョンを切り替えるには、`/auth` コマンドを再実行して別のリージョンを選択してください。

### API キーの保存

`/auth` コマンドを通じて Coding Plan を構成すると、API キーは予約済みの環境変数名 `BAILIAN_CODING_PLAN_API_KEY` を使用して保存されます。デフォルトでは、`settings.json` ファイルの `env` フィールドに保存されます。

> [!warning]
>
> **セキュリティ推奨事項**: セキュリティを強化するため、API キーを `settings.json` から個別の `.env` ファイルに移動し、環境変数として読み込むことを推奨します。例:
>
> ```bash
> # ~/.qwen/.env
> BAILIAN_CODING_PLAN_API_KEY=your-api-key-here
> ```
>
> プロジェクトレベルの設定を使用している場合は、このファイルが `.gitignore` に追加されていることを確認してください。

### 自動更新

Coding Plan のモデル構成はバージョン管理されています。Qwen Code がモデルテンプレートの新しいバージョンを検出すると、更新を促すプロンプトが表示されます。更新を受け入れると、次の処理が行われます。

- 既存の Coding Plan モデル構成が最新バージョンに置き換えられます
- 手動で追加したカスタムモデル構成は保持されます
- 更新された構成の最初のモデルに自動的に切り替わります

この更新プロセスにより、手動での介入なしに常に最新のモデル構成と機能にアクセスできます。

### 手動構成（上級者向け）

Coding Plan モデルを手動で構成する場合は、OpenAI 互換プロバイダーと同様に `settings.json` に追加できます。

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
> - **自動更新は手動構成された Coding Plan モデルには適用されません**

> [!warning]
>
> 自動 Coding Plan 構成も使用している場合、手動構成が自動構成と同じ `envKey` と `baseUrl` を使用していると、自動更新によって手動構成が上書きされる可能性があります。これを回避するには、可能であれば手動構成で異なる `envKey` を使用してください。

## 解決レイヤーとアトミック性

有効な認証/モデル/認証情報の値は、フィールドごとに以下の優先順位（最初に存在するものが優先）で選択されます。`--auth-type` と `--model` を組み合わせてプロバイダーエントリを直接指定できます。これらの CLI フラグは他のレイヤーより先に実行されます。

| Layer (highest → lowest)   | authType                            | model                                           | apiKey                                              | baseUrl                                              | apiKeyEnvKey           | proxy                             |
| -------------------------- | ----------------------------------- | ----------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------- | ---------------------- | --------------------------------- |
| Programmatic overrides     | `/auth`                             | `/auth` 入力                                   | `/auth` 入力                                       | `/auth` 入力                                        | —                      | —                                 |
| Model provider selection   | —                                   | `modelProvider.id`                              | `env[modelProvider.envKey]`                         | `modelProvider.baseUrl`                              | `modelProvider.envKey` | —                                 |
| CLI arguments              | `--auth-type`                       | `--model`                                       | `--openaiApiKey`（またはプロバイダー固有の同等オプション） | `--openaiBaseUrl`（またはプロバイダー固有の同等オプション） | —                      | —                                 |
| Environment variables      | —                                   | プロバイダー固有のマッピング（例：`OPENAI_MODEL`） | プロバイダー固有のマッピング（例：`OPENAI_API_KEY`）   | プロバイダー固有のマッピング（例：`OPENAI_BASE_URL`）   | —                      | —                                 |
| Settings (`settings.json`) | `security.auth.selectedType`        | `model.name`                                    | `security.auth.apiKey`                              | `security.auth.baseUrl`                              | —                      | —                                 |
| Default / computed         | `AuthType.QWEN_OAUTH` にフォールバック | 組み込みデフォルト（OpenAI ⇒ `qwen3-coder-plus`）  | —                                                   | —                                                    | —                      | 構成されている場合は `Config.getProxy()` |

\*存在する場合、CLI 認証フラグは設定を上書きします。それ以外の場合、`security.auth.selectedType` または暗黙のデフォルトが認証タイプを決定します。追加構成なしで公開される認証タイプは Qwen OAuth と OpenAI のみです。

> [!warning]
>
> **`security.auth.apiKey` および `security.auth.baseUrl` の非推奨化:** `settings.json` 内の `security.auth.apiKey` と `security.auth.baseUrl` を介して API 認証情報を直接構成することは非推奨です。これらの設定は、UI を通じて入力された認証情報に歴史的なバージョンで使用されていましたが、認証情報入力フローはバージョン 0.10.1 で削除されました。これらのフィールドは将来のリリースで完全に削除されます。**すべてのモデルおよび認証情報構成を `modelProviders` への移行を強く推奨します**。設定ファイルに認証情報をハードコーディングする代わりに、`modelProviders` の `envKey` を使用して環境変数を参照し、安全な認証情報管理を行ってください。

## 生成構成のレイヤリング：透過不可能なプロバイダーレイヤー

構成の解決は厳密なレイヤリングモデルに従いますが、重要なルールが 1 つあります。**modelProvider レイヤーは透過不可能（impermeable）です**。

### 動作原理

1. **modelProvider モデルが選択されている場合**（例：`/model` コマンドでプロバイダー構成モデルを選択）:
   - プロバイダーからの `generationConfig` 全体が**アトミックに**適用されます
   - **プロバイダーレイヤーは完全に透過不可能です** — 下位レイヤー（CLI、env、設定）は generationConfig の解決に一切関与しません
   - `modelProviders[].generationConfig` で定義されたすべてのフィールドはプロバイダーの値を使用します
   - プロバイダーで定義されていないフィールドはすべて `undefined` に設定されます（設定から継承されません）
   - これにより、プロバイダー構成が完全で自己完結型の「シールドされたパッケージ」として機能することが保証されます

2. **modelProvider モデルが選択されていない場合**（例：生のモデル ID を `--model` で使用、または CLI/env/設定を直接使用）:
   - 解決は下位レイヤーにフォールスルーします
   - フィールドは CLI → env → 設定 → デフォルトの順で設定されます
   - これにより、**ランタイムモデル**（次のセクション参照）が作成されます

### `generationConfig` のフィールドごとの優先順位

| Priority | Source                                        | Behavior                                                                                                 |
| -------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1        | Programmatic overrides                        | ランタイムの `/model`、`/auth` による変更                                                                        |
| 2        | `modelProviders[authType][].generationConfig` | **透過不可能なレイヤー** - generationConfig の全フィールドを完全に置き換えます。下位レイヤーは関与しません |
| 3        | `settings.model.generationConfig`             | **ランタイムモデル**（プロバイダーモデルが選択されていない場合）のみで使用されます                                    |
| 4        | Content-generator defaults                    | プロバイダー固有のデフォルト（例：OpenAI vs Gemini）- ランタイムモデルのみ                            |

### アトミックなフィールドの扱い

以下のフィールドはアトミックなオブジェクトとして扱われます。プロバイダーの値がオブジェクト全体を完全に置き換え、マージは行われません。

- `samplingParams` - temperature、top_p、max_tokens など
- `customHeaders` - カスタム HTTP ヘッダー
- `extra_body` - 追加リクエストボディパラメーター

### 例

```json
// User settings (~/.qwen/settings.json)
{
  "model": {
    "generationConfig": {
      "timeout": 30000,
      "samplingParams": { "temperature": 0.5, "max_tokens": 1000 }
    }
  }
}

// modelProviders configuration
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

modelProviders から `gpt-4o` が選択された場合:

- `timeout` = 60000（プロバイダーから。設定を上書き）
- `samplingParams.temperature` = 0.2（プロバイダーから。設定オブジェクトを完全に置き換え）
- `samplingParams.max_tokens` = **undefined**（プロバイダーで定義されておらず、プロバイダーレイヤーは設定から継承しないため、提供されていないフィールドは明示的に undefined に設定されます）

`--model gpt-4` を介して生のモデルを使用する場合（modelProviders からではなく、ランタイムモデルを作成）:

- `timeout` = 30000（設定から）
- `samplingParams.temperature` = 0.5（設定から）
- `samplingParams.max_tokens` = 1000（設定から）

`modelProviders` 自体のマージ戦略は REPLACE です。プロジェクト設定の `modelProviders` 全体がユーザー設定の対応するセクションを上書きし、2 つをマージすることはありません。

## プロバイダーモデル vs ランタイムモデル

Qwen Code は、2 種類のモデル構成を区別します。

### プロバイダーモデル

- `modelProviders` 構成で定義
- 完全でアトミックな構成パッケージを持つ
- 選択されると、その構成は透過不可能なレイヤーとして適用される
- `/model` コマンドリストに完全なメタデータ（名前、説明、機能）付きで表示される
- マルチモデルワークフローやチーム間の一貫性に推奨

### ランタイムモデル

- CLI（`--model`）、環境変数、または設定を介して生のモデル ID を使用した際に動的に作成される
- `modelProviders` では定義されない
- 構成は解決レイヤー（CLI → env → 設定 → デフォルト）を「投影」して構築される
- 完全な構成が検出されると、自動的に **RuntimeModelSnapshot** としてキャプチャされる
- 認証情報を再入力せずに再利用可能

### RuntimeModelSnapshot のライフサイクル

`modelProviders` を使用せずにモデルを構成すると、Qwen Code は構成を保持するために自動的に RuntimeModelSnapshot を作成します。

```bash
# This creates a RuntimeModelSnapshot with ID: $runtime|openai|my-custom-model
qwen --auth-type openai --model my-custom-model --openaiApiKey $KEY --openaiBaseUrl https://api.example.com/v1
```

スナップショットは次のことを行います。

- モデル ID、API キー、ベース URL、生成構成をキャプチャ
- セッション間で保持（ランタイム中はメモリに保存）
- `/model` コマンドリストにランタイムオプションとして表示
- `/model $runtime|openai|my-custom-model` を使用して切り替え可能

### 主な違い

| Aspect                  | Provider Model                    | Runtime Model                              |
| ----------------------- | --------------------------------- | ------------------------------------------ |
| Configuration source    | 設定内の `modelProviders`      | CLI、env、設定レイヤー                  |
| Configuration atomicity | 完全な透過不可能パッケージ     | レイヤー構造。各フィールドは独立して解決 |
| Reusability             | `/model` リストで常に利用可能 | スナップショットとしてキャプチャ。完全な場合に表示  |
| Team sharing            | はい（コミットされた設定経由）      | いいえ（ユーザーローカル）                            |
| Credential storage      | `envKey` 経由での参照のみ       | スナップショットに実際のキーがキャプチャされる可能性あり         |

### 使い分け

- **プロバイダーモデルを使用する場合**: チーム間で共有する標準モデルがある場合、一貫した構成が必要な場合、または誤った上書きを防ぎたい場合
- **ランタイムモデルを使用する場合**: 新しいモデルを迅速にテストする場合、一時的な認証情報を使用する場合、またはアドホックなエンドポイントで作業する場合

## 選択の永続化と推奨事項

> [!important]
>
> 可能な限り、ユーザーレベルの `~/.qwen/settings.json` で `modelProviders` を定義し、認証情報の上書きをどのスコープでも永続化しないようにしてください。プロバイダーカタログをユーザー設定に保持することで、プロジェクトスコープとユーザースコープ間のマージ/上書きの競合を防ぎ、`/auth` および `/model` の更新が常に一貫したスコープに書き戻されるようにします。

- `/model` および `/auth` は、該当する場合 `model.name` と `security.auth.selectedType` を、`modelProviders` を既に定義している最も近い書き込み可能スコープに永続化します。定義されていない場合はユーザースコープにフォールバックします。これにより、ワークスペース/ユーザーファイルがアクティブなプロバイダーカタログと同期されます。
- `modelProviders` がない場合、リゾルバーは CLI/env/設定レイヤーを混合してランタイムモデルを作成します。これは単一プロバイダーのセットアップでは問題ありませんが、頻繁に切り替える場合は煩雑になります。マルチモデルワークフローが一般的である場合は、プロバイダーカタログを定義してください。これにより、切り替えがアトミックになり、ソースが帰属され、デバッグ可能になります。