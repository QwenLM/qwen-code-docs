---
description: "Qwen Code modelProviders を設定し、OpenAI、Anthropic、Gemini などのモデル、API Key、切り替え、チーム運用ルールを管理します。"
---

# モデルプロバイダー

Qwen Code では、`settings.json` の `modelProviders` 設定を使用して複数のモデルプロバイダーを構成できます。これにより、`/model` コマンドを使用して異なる AI モデルやプロバイダーを切り替えることができます。

## 概要

`modelProviders` を使用して、`/model` ピッカーが切り替え可能な認証タイプごとのキュレーション済みモデルリストを宣言します。キーは有効な認証タイプ（`openai`、`anthropic`、`gemini` など）である必要があります。各エントリには `id` が必要で、**`envKey` を必ず含める**必要があります。`name`、`description`、`baseUrl`、`generationConfig` はオプションです。認証情報は設定ファイルに永続化されません。ランタイムは `process.env[envKey]` から読み取ります。Qwen OAuth モデルはハードコードされており、上書きできません。

> [!note]
>
> `/model` コマンドのみがデフォルト以外の認証タイプを公開します。Anthropic、Gemini などは `modelProviders` を介して定義する必要があります。`/auth` コマンドには、組み込みの認証オプションとして Qwen OAuth、Alibaba Cloud Coding Plan、および API Key がリストされます。

> [!warning]
>
> **同じ authType 内のモデル ID の重複:** 単一の `authType` 内で同じ `id` を持つ複数のモデルを定義すること（例：`openai` 内に `"id": "gpt-4o"` が 2 つある場合）は、現在サポートされていません。重複が存在する場合、**最初に出現したものが優先**され、後続の重複は警告とともにスキップされます。`id` フィールドは構成識別子として使用されるだけでなく、API に送信される実際のモデル名としても使用されるため、一意の ID（例：`gpt-4o-creative`、`gpt-4o-balanced`）を使用しても回避策にはなりません。これは既知の制限事項であり、将来のリリースで対応する予定です。

## 認証タイプ別の構成例

以下に、使用可能なパラメーターとその組み合わせを示す、異なる認証タイプ向けの包括的な構成例を示します。

### サポートされている認証タイプ

`modelProviders` オブジェクトのキーは有効な `authType` 値である必要があります。現在サポートされている認証タイプは次のとおりです。

| Auth Type    | 説明                                                                                     |
| ------------ | --------------------------------------------------------------------------------------- |
| `openai`     | OpenAI 互換 API（OpenAI、Azure OpenAI、vLLM/Ollama などのローカル推論サーバー） |
| `anthropic`  | Anthropic Claude API                                                                    |
| `gemini`     | Google Gemini API                                                                       |
| `qwen-oauth` | Qwen OAuth（ハードコード済み。`modelProviders` で上書き不可）                       |

> [!warning]
> 無効な認証タイプキー（例：`"openai-custom"` のようなタイプミス）を使用した場合、構成は**サイレントにスキップ**され、モデルは `/model` ピッカーに表示されません。必ず上記のサポートされている認証タイプ値のいずれかを使用してください。

### API リクエストに使用される SDK

Qwen Code は、各プロバイダーへのリクエスト送信に以下の公式 SDK を使用します。

| Auth Type    | SDK パッケージ                                                                                     |
| ------------ | ----------------------------------------------------------------------------------------------- |
| `openai`     | [`openai`](https://www.npmjs.com/package/openai) - 公式 OpenAI Node.js SDK                  |
| `anthropic`  | [`@anthropic-ai/sdk`](https://www.npmjs.com/package/@anthropic-ai/sdk) - 公式 Anthropic SDK |
| `gemini`     | [`@google/genai`](https://www.npmjs.com/package/@google/genai) - 公式 Google GenAI SDK      |
| `qwen-oauth` | [`openai`](https://www.npmjs.com/package/openai) with custom provider (DashScope-compatible)    |

つまり、構成する `baseUrl` は、対応する SDK が期待する API 形式と互換性がある必要があります。例えば、`openai` 認証タイプを使用する場合、エンドポイントは OpenAI API 形式のリクエストを受け入れる必要があります。

### OpenAI 互換プロバイダー（`openai`）

この認証タイプは、OpenAI の公式 API だけでなく、OpenRouter などの集約型モデルプロバイダーを含む、OpenAI 互換のエンドポイントもサポートしています。

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

ほとんどのローカル推論サーバー（vLLM、Ollama、LM Studio など）は OpenAI 互換の API エンドポイントを提供しています。ローカルの `baseUrl` を指定して `openai` 認証タイプを使用して構成します。

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
> **`envKey` について**: `envKey` フィールドは実際の API キーの値ではなく、**環境変数の名前**を指定します。構成を機能させるには、対応する環境変数に実際の API キーが設定されていることを確認する必要があります。これを行うには 2 つの方法があります。
>
> - **オプション 1: `.env` ファイルの使用**（セキュリティ推奨）:
>   ```bash
>   # ~/.qwen/.env (or project root)
>   OPENAI_API_KEY=sk-your-actual-key-here
>   ```
>   秘密情報が誤ってコミットされないよう、`.env` を `.gitignore` に追加してください。
> - **オプション 2: `settings.json` の `env` フィールドの使用**（上記の例で示した通り）:
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

| Model ID               | Name                 | 説明                            |
| ---------------------- | -------------------- | -------------------------------------- |
| `qwen3.5-plus`         | qwen3.5-plus         | 推論（thinking）が有効な高度なモデル   |
| `qwen3-coder-plus`     | qwen3-coder-plus     | コーディングタスクに最適化             |
| `qwen3-max-2026-01-23` | qwen3-max-2026-01-23 | 推論が有効な最新の max モデル |

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

| Region               | Endpoint                                        | 説明             |
| -------------------- | ----------------------------------------------- | ----------------------- |
| China                | `https://coding.dashscope.aliyuncs.com/v1`      | 中国本土エンドポイント |
| Global/International | `https://coding-intl.dashscope.aliyuncs.com/v1` | 国際版エンドポイント  |

リージョンは認証時に選択され、`settings.json` の `codingPlan.region` に保存されます。リージョンを切り替えるには、`/auth` コマンドを再実行して別のリージョンを選択してください。

### API キーの保存

`/auth` コマンドを介して Coding Plan を構成すると、API キーは予約済みの環境変数名 `BAILIAN_CODING_PLAN_API_KEY` を使用して保存されます。デフォルトでは、`settings.json` ファイルの `env` フィールドに保存されます。

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

Coding Plan のモデル構成はバージョン管理されています。Qwen Code がモデルテンプレートの新しいバージョンを検出すると、更新を促すプロンプトが表示されます。更新を受け入れると:

- 既存の Coding Plan モデル構成が最新バージョンに置き換えられます
- 手動で追加したカスタムモデル構成は保持されます
- 更新された構成の最初のモデルに自動的に切り替わります

この更新プロセスにより、手動での介入なしに常に最新のモデル構成と機能にアクセスできます。

### 手動構成（上級者向け）

Coding Plan モデルを手動で構成する場合は、他の OpenAI 互換プロバイダーと同様に `settings.json` に追加できます。

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

有効な auth/model/credential の値は、以下の優先順位に従ってフィールドごとに選択されます（最初に存在するものが優先されます）。`--auth-type` と `--model` を組み合わせて特定のプロバイダーエントリを直接指定できます。これらの CLI フラグは他のレイヤーより前に実行されます。

| レイヤー（高 → 低）   | authType                            | model                                           | apiKey                                              | baseUrl                                              | apiKeyEnvKey           | proxy                             |
| -------------------------- | ----------------------------------- | ----------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------- | ---------------------- | --------------------------------- |
| プログラムによる上書き     | `/auth`                             | `/auth` 入力                                   | `/auth` 入力                                       | `/auth` 入力                                        | —                      | —                                 |
| モデルプロバイダーの選択   | —                                   | `modelProvider.id`                              | `env[modelProvider.envKey]`                         | `modelProvider.baseUrl`                              | `modelProvider.envKey` | —                                 |
| CLI 引数              | `--auth-type`                       | `--model`                                       | `--openaiApiKey`（またはプロバイダー固有の同等物） | `--openaiBaseUrl`（またはプロバイダー固有の同等物） | —                      | —                                 |
| 環境変数      | —                                   | プロバイダー固有のマッピング（例: `OPENAI_MODEL`） | プロバイダー固有のマッピング（例: `OPENAI_API_KEY`）   | プロバイダー固有のマッピング（例: `OPENAI_BASE_URL`）   | —                      | —                                 |
| 設定（`settings.json`） | `security.auth.selectedType`        | `model.name`                                    | `security.auth.apiKey`                              | `security.auth.baseUrl`                              | —                      | —                                 |
| デフォルト / 計算値         | `AuthType.QWEN_OAUTH` にフォールバック | 組み込みデフォルト（OpenAI ⇒ `qwen3-coder-plus`）  | —                                                   | —                                                    | —                      | 構成されている場合は `Config.getProxy()` |

\*存在する場合、CLI 認証フラグは設定を上書きします。それ以外の場合、`security.auth.selectedType` または暗黙のデフォルトが認証タイプを決定します。追加の構成なしで公開される認証タイプは、Qwen OAuth と OpenAI のみです。

> [!warning]
>
> **`security.auth.apiKey` および `security.auth.baseUrl` の非推奨化:** `settings.json` 内の `security.auth.apiKey` および `security.auth.baseUrl` を介して API 認証情報を直接構成することは非推奨です。これらの設定は、UI を介して入力された認証情報に歴史的なバージョンで使用されていましたが、認証情報入力フローはバージョン 0.10.1 で削除されました。これらのフィールドは将来のリリースで完全に削除されます。**すべてのモデルおよび認証情報構成に `modelProviders` への移行を強く推奨します**。設定ファイルに認証情報をハードコーディングする代わりに、`modelProviders` の `envKey` を使用して環境変数を参照し、安全な認証情報管理を行ってください。

## 生成構成のレイヤリング: 透過しないプロバイダーレイヤー

構成の解決は厳密なレイヤリングモデルに従いますが、重要なルールが 1 つあります。**modelProvider レイヤーは透過しません（impermeable）**。

### 動作原理

1. **modelProvider モデルが選択された場合**（例: `/model` コマンドでプロバイダー構成モデルを選択）:
   - プロバイダーからの `generationConfig` 全体が**アトミックに**適用されます
   - **プロバイダーレイヤーは完全に透過しません** — 下位レイヤー（CLI、env、設定）は generationConfig の解決に一切関与しません
   - `modelProviders[].generationConfig` で定義されたすべてのフィールドはプロバイダーの値を使用します
   - プロバイダーによって**定義されていない**すべてのフィールドは `undefined` に設定されます（設定から継承されません）
   - これにより、プロバイダー構成が完全で自己完結型の「シールドされたパッケージ」として機能することが保証されます

2. **modelProvider モデルが選択されていない場合**（例: 生のモデル ID で `--model` を使用、または CLI/env/設定を直接使用）:
   - 解決は下位レイヤーにフォールスルーします
   - フィールドは CLI → env → 設定 → デフォルトの順に設定されます
   - これにより、**ランタイムモデル**が作成されます（次のセクションを参照）

### `generationConfig` のフィールドごとの優先順位

| 優先度 | ソース                                        | 動作                                                                                                 |
| -------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1        | プログラムによる上書き                        | ランタイムの `/model`、`/auth` による変更                                                                        |
| 2        | `modelProviders[authType][].generationConfig` | **透過しないレイヤー** - すべての generationConfig フィールドを完全に置き換えます。下位レイヤーは関与しません |
| 3        | `settings.model.generationConfig`             | **ランタイムモデル**（プロバイダーモデルが選択されていない場合）にのみ使用されます                                    |
| 4        | コンテンツジェネレーターのデフォルト                    | プロバイダー固有のデフォルト（例: OpenAI vs Gemini）- ランタイムモデルにのみ適用されます                            |

### アトミックなフィールドの扱い

以下のフィールドはアトミックなオブジェクトとして扱われます。プロバイダーの値がオブジェクト全体を完全に置き換え、マージは行われません。

- `samplingParams` - 温度（temperature）、top_p、max_tokens など
- `customHeaders` - カスタム HTTP ヘッダー
- `extra_body` - 追加のリクエストボディパラメーター

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

`modelProviders` から `gpt-4o` が選択された場合:

- `timeout` = 60000（プロバイダーから。設定を上書き）
- `samplingParams.temperature` = 0.2（プロバイダーから。設定オブジェクトを完全に置き換え）
- `samplingParams.max_tokens` = **undefined**（プロバイダーで定義されておらず、プロバイダーレイヤーは設定から継承しないため、提供されていないフィールドは明示的に undefined に設定されます）

`--model gpt-4` を使用して生のモデルを使用する場合（modelProviders からではなく、ランタイムモデルを作成）:

- `timeout` = 30000（設定から）
- `samplingParams.temperature` = 0.5（設定から）
- `samplingParams.max_tokens` = 1000（設定から）

`modelProviders` 自体のマージ戦略は REPLACE です。プロジェクト設定の `modelProviders` 全体がユーザー設定の対応するセクションを上書きし、2 つをマージすることはありません。

## 推論（Reasoning）/ 思考（Thinking）構成

`generationConfig` 下のオプションの `reasoning` フィールドは、モデルが応答前に推論を行う積極度を制御します。Anthropic および Gemini コンバーターは常にこれを尊重します。OpenAI 互換パイプラインは、`generationConfig.samplingParams` が設定されていない限りこれを尊重します。詳細は以下の「`samplingParams` との相互作用」の注意事項を参照してください。

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
          // The four-tier scale:
          //   'low'    | 'medium' — server-mapped to 'high' on DeepSeek
          //   'high'   — default reasoning intensity
          //   'max'    — DeepSeek-specific extra-strong tier
          // Or set `false` to disable reasoning entirely.
          "reasoning": { "effort": "max" },
        },
      },
    ],
  },
}
```

### プロバイダーごとの動作

| プロトコル / プロバイダー                          | 送信形式（Wire shape）                                                           | 備考                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **OpenAI / DeepSeek** (`api.deepseek.com`)   | フラットな `reasoning_effort: <effort>` ボディパラメーター                     | ネストされた構成形状で `reasoning.effort` が設定されている場合、フラットな `reasoning_effort` に書き換えられ、`'low'`/`'medium'` は `'high'` に、`'xhigh'` は `'max'` に正規化されます。これは DeepSeek の[サーバー側後方互換性](https://api-docs.deepseek.com/zh-cn/api/create-chat-completion)を反映しています。トップレベルの `samplingParams.reasoning_effort` または `extra_body.reasoning_effort` の上書きはこの正規化をスキップし、そのまま送信されます。 |
| **OpenAI** (other compatible servers)        | `reasoning: { effort, ... }` がそのまま渡されます                 | プロバイダーが異なる形状を期待する場合、`samplingParams`（例: GPT-5/o シリーズ用の `samplingParams.reasoning_effort`）を介して設定します。                                                                                                                                                                                                                                                                                                |
| **Anthropic** (real `api.anthropic.com`)     | `output_config: { effort }` および `effort-2025-11-24` ベータヘッダー | 実際の Anthropic は `'low'`/`'medium'`/`'high'` のみを受け入れます。`'max'` は `debugLogger.warn` 行（ジェネレーターごとに 1 回）とともに **`'high'` にクランプ**されます。最大限の推論強度が必要な場合は、baseURL をこれをサポートする DeepSeek 互換エンドポイントに切り替えてください。                                                                                                                                                                                  |
| **Anthropic** (`api.deepseek.com/anthropic`) | 同じ `output_config: { effort }` + ベータヘッダー                       | `'max'` は変更なしでそのまま渡されます。                                                                                                                                                                                                                                                                                                                                                                                             |
| **Gemini** (`@google/genai`)                 | `thinkingConfig: { includeThoughts: true, thinkingLevel }`           | `'low'` → `LOW`、`'high'`/`'max'` → `HIGH`、その他 → `THINKING_LEVEL_UNSPECIFIED`（Gemini には `MAX` ティアがありません）。                                                                                                                                                                                                                                                                                                                    |

### `reasoning: false`

`reasoning: false`（リテラルのブール値）を設定すると、すべてのプロバイダーで思考（thinking）が明示的に無効になります。推論の恩恵を受けない安価なサイドクエリに役立ちます。これはリクエストレベルでも `request.config.thinkingConfig.includeThoughts: false` を介して 1 回限りの呼び出し（例: 提案の生成）で尊重されます。

`api.deepseek.com` baseURL では、OpenAI パイプラインは DeepSeek V4+ が要求する明示的な `thinking: { type: 'disabled' }` フィールドを出力します。サーバー側のデフォルトは `'enabled'` であるため、単に `reasoning_effort` を省略しても思考のレイテンシ/コストが発生します。セルフホストされた DeepSeek バックエンド（sglang/vllm）およびその他の OpenAI 互換サーバーにはこのフィールドは**送信されません**。それらで思考を無効にする必要がある場合は、`samplingParams`/`extra_body` を介して `thinking: { type: 'disabled' }`（または推論フレームワークが公開する任意のノブ）を注入してください。

### `samplingParams` との相互作用（OpenAI 互換のみ）

> [!warning]
>
> OpenAI 互換プロバイダーで `generationConfig.samplingParams` が設定されている場合、パイプラインはそれらのキーを**そのまま**ワイヤーに送信し、個別の `reasoning` 注入を完全にスキップします。したがって、`{ samplingParams: { temperature: 0.5 }, reasoning: { effort: 'max' } }` のような構成は、OpenAI/DeepSeek リクエストで reasoning フィールドをサイレントにドロップします。
>
> `samplingParams` を設定する場合は、reasoning ノブをその中に直接含めてください。DeepSeek の場合は `samplingParams.reasoning_effort`、GPT-5/o シリーズの場合は `samplingParams.reasoning_effort`（フラットフィールド）または `samplingParams.reasoning`（ネストオブジェクト）です。OpenRouter やその他のプロバイダーではフィールド名が異なります。プロバイダーのドキュメントを参照してください。
>
> Anthropic および Gemini コンバーターは影響を受けません。`samplingParams` の有無にかかわらず、常に `reasoning.effort` を直接読み取ります。

### `budget_tokens`

`effort` とともに `budget_tokens` を含めることで、正確な思考トークンバジェットを固定できます。

```jsonc
"reasoning": { "effort": "high", "budget_tokens": 50000 }
```

Anthropic では `thinking.budget_tokens` になります。OpenAI/DeepSeek ではフィールドは保持されますが、現在サーバーによって無視されます。`reasoning_effort` が実際に機能するノブです。

## プロバイダーモデル vs ランタイムモデル

Qwen Code は、2 種類のモデル構成を区別します。

### プロバイダーモデル

- `modelProviders` 構成で定義されます
- 完全でアトミックな構成パッケージを持ちます
- 選択されると、その構成は透過しないレイヤーとして適用されます
- 完全なメタデータ（名前、説明、機能）付きで `/model` コマンドリストに表示されます
- マルチモデルワークフローとチームの一貫性に推奨されます

### ランタイムモデル

- CLI（`--model`）、環境変数、または設定を介して生のモデル ID を使用したときに動的に作成されます
- `modelProviders` では定義されません
- 構成は解決レイヤー（CLI → env → 設定 → デフォルト）を「投影」して構築されます
- 完全な構成が検出されると、**RuntimeModelSnapshot** として自動的にキャプチャされます
- 認証情報を再入力せずに再利用できます

### RuntimeModelSnapshot のライフサイクル

`modelProviders` を使用せずにモデルを構成すると、Qwen Code は構成を保持するために RuntimeModelSnapshot を自動的に作成します。

```bash
# This creates a RuntimeModelSnapshot with ID: $runtime|openai|my-custom-model
qwen --auth-type openai --model my-custom-model --openaiApiKey $KEY --openaiBaseUrl https://api.example.com/v1
```

スナップショット:

- モデル ID、API キー、ベース URL、生成構成をキャプチャします
- セッション間で保持されます（ランタイム中はメモリに保存）
- ランタイムオプションとして `/model` コマンドリストに表示されます
- `/model $runtime|openai|my-custom-model` を使用して切り替えることができます

### 主な違い

| 側面                  | プロバイダーモデル                    | ランタイムモデル                              |
| ----------------------- | --------------------------------- | ------------------------------------------ |
| 構成ソース    | `settings` 内の `modelProviders`      | CLI、env、設定レイヤー                  |
| 構成のアトミック性 | 完全で透過しないパッケージ     | レイヤー化され、各フィールドが独立して解決 |
| 再利用性             | `/model` リストで常に利用可能 | スナップショットとしてキャプチャされ、完全な場合に表示  |
| チーム共有            | はい（コミットされた設定経由）      | いいえ（ユーザーローカル）                            |
| 認証情報の保存      | `envKey` のみで参照       | スナップショットに実際のキーがキャプチャされる場合あり         |

### 使い分け

- **プロバイダーモデルを使用する場合**: チーム間で標準モデルを共有する場合、一貫した構成が必要な場合、または誤った上書きを防ぎたい場合
- **ランタイムモデルを使用する場合**: 新しいモデルをすばやくテストする場合、一時的な認証情報を使用する場合、またはアドホックなエンドポイントで作業する場合

## 選択の永続化と推奨事項

> [!important]
>
> 可能な限り、ユーザー範囲の `~/.qwen/settings.json` で `modelProviders` を定義し、認証情報の上書きをどの範囲でも永続化しないようにしてください。プロバイダーカタログをユーザー設定に保持することで、プロジェクト範囲とユーザー範囲間のマージ/上書きの競合を防ぎ、`/auth` および `/model` の更新が常に一貫した範囲に書き戻されるようにします。

- `/model` および `/auth` は、該当する場合 `model.name` および `security.auth.selectedType` を、`modelProviders` をすでに定義している最も近い書き込み可能な範囲に永続化します。それ以外の場合はユーザー範囲にフォールバックします。これにより、ワークスペース/ユーザーファイルがアクティブなプロバイダーカタログと同期されます。
- `modelProviders` がない場合、リゾルバーは CLI/env/設定レイヤーを混合し、ランタイムモデルを作成します。これは単一プロバイダーのセットアップでは問題ありませんが、頻繁に切り替える場合は煩雑です。マルチモデルワークフローが一般的である場合は、切り替えがアトミックで、ソースが帰属可能かつデバッグ可能になるように、プロバイダーカタログを定義してください。