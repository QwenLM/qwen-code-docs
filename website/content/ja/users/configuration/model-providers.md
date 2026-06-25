# モデルプロバイダー

Qwen Code では、`settings.json` の `modelProviders` 設定を通じて複数のモデルプロバイダーを構成できます。これにより、`/model` コマンドを使用してさまざまな AI モデルやプロバイダーを切り替えられます。

## 概要

`modelProviders` を使用して、`/model` ピッカーで切り替え可能なモデルを認証タイプごとに定義します。キーは有効な認証タイプ（`openai`、`anthropic`、`gemini` など）である必要があります。各認証タイプは、`protocol` フィールドと `models` フィールド（モデル定義の配列）を持つ `ProviderConfig` オブジェクトにマッピングされます。`models` の各エントリには `id` が必須です。`envKey` は**省略可能ですが推奨**です（省略した場合、認証タイプのデフォルト環境変数キー、例えば `openai` の場合は `OPENAI_API_KEY` にフォールバックします）。オプションとして `name`、`description`、`baseUrl`、`generationConfig` も指定できます。認証情報は設定に保存されず、ランタイムが `process.env[envKey]` から読み取ります。Qwen OAuth モデルはハードコードされており、上書きできません。

> [!note]
>
> `/model` コマンドのみがデフォルト以外の認証タイプを公開します。Anthropic、Gemini などは `modelProviders` で定義する必要があります。`/auth` コマンドには 3 つのトップレベルオプションがあります：**Alibaba ModelStudio**（サブメニューに Coding Plan、Token Plan、Standard API Key）、**Third-party Providers**、**Custom Provider**。（Qwen OAuth は選択可能なダイアログエントリではなくなりました。無料ティアは 2026-04-15 に終了しました。）

> [!note]
>
> **モデルの一意性：** 同一 `authType` 内のモデルは、`id` と `baseUrl` の組み合わせで一意に識別されます。つまり、各エントリに異なる `baseUrl` がある限り、単一の `authType` 内で同じモデル ID（例：`"gpt-4o"`）を複数回定義できます。例えば、一方は OpenAI に直接、もう一方はプロキシエンドポイントに向けるといった使い方が可能です。2 つのエントリが同じ `id` と同じ `baseUrl`（または両方とも `baseUrl` を省略）を共有する場合、最初のエントリが優先され、後続の重複はスキップされて警告が表示されます。

## 認証タイプ別の設定例

以下に、さまざまな認証タイプの包括的な設定例を示します。利用可能なパラメーターとその組み合わせを確認できます。

### サポートされている認証タイプ

`modelProviders` オブジェクトのキーは有効な `authType` 値である必要があります。現在サポートされている認証タイプは以下の通りです：

| 認証タイプ   | 説明                                                                                                                                               |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `openai`     | OpenAI 互換 API（OpenAI、Azure OpenAI、vLLM/Ollama などのローカル推論サーバー）                                                                    |
| `anthropic`  | Anthropic Claude API                                                                                                                               |
| `gemini`     | Google Gemini API                                                                                                                                  |
| `qwen-oauth` | Qwen OAuth（ハードコード済み、`modelProviders` での上書き不可）                                                                                    |
| `vertex-ai`  | Google Vertex AI（`gemini` プロトコルと Vertex AI モードの `@google/genai` SDK を使用。選択すると `GOOGLE_GENAI_USE_VERTEXAI=true` が設定されます） |

> [!warning]
> 不明な認証タイプキー（例：`"openai-custom"` のようなタイポ）を使用した場合、空でないキーはそのまま独自の認証タイプグループとして受け入れられますが、既知のプロトコルにマッピングされません。そのため、モデルは意図通りに動作せず、`/model` ピッカーでも正しく機能しません。空白のみのキーのみがスキップされます。上記の一覧にある有効な認証タイプの値を常に使用してください。

### API リクエストに使用される SDK

Qwen Code は各プロバイダーへのリクエスト送信に以下の公式 SDK を使用します：

| 認証タイプ   | SDK パッケージ                                                                                      |
| ------------ | --------------------------------------------------------------------------------------------------- |
| `openai`     | [`openai`](https://www.npmjs.com/package/openai) - 公式 OpenAI Node.js SDK                         |
| `anthropic`  | [`@anthropic-ai/sdk`](https://www.npmjs.com/package/@anthropic-ai/sdk) - 公式 Anthropic SDK        |
| `gemini`     | [`@google/genai`](https://www.npmjs.com/package/@google/genai) - 公式 Google GenAI SDK             |
| `qwen-oauth` | [`openai`](https://www.npmjs.com/package/openai)（カスタムプロバイダー、DashScope 互換）            |

そのため、設定する `baseUrl` は対応する SDK が期待する API フォーマットと互換性がある必要があります。例えば、`openai` 認証タイプを使用する場合、エンドポイントは OpenAI API フォーマットのリクエストを受け付ける必要があります。

### OpenAI 互換プロバイダー（`openai`）

この認証タイプは OpenAI の公式 API だけでなく、OpenRouter や Requesty などのアグリゲート型モデルプロバイダーを含む、OpenAI 互換エンドポイントもサポートします。

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

### Anthropic（`anthropic`）

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

### Google Gemini（`gemini`）

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

ほとんどのローカル推論サーバー（vLLM、Ollama、LM Studio など）は OpenAI 互換の API エンドポイントを提供します。ローカルの `baseUrl` を指定して `openai` 認証タイプを使用して設定します：

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

認証を必要としないローカルサーバーの場合、API キーには任意のプレースホルダー値を使用できます：

```bash
# Ollama（認証不要）の場合
export OLLAMA_API_KEY="ollama"

# vLLM（認証が設定されていない場合）
export VLLM_API_KEY="not-needed"
```

> [!note]
>
> `extra_body` パラメーターは **OpenAI 互換プロバイダー**（`openai`、`qwen-oauth`）のみでサポートされています。Anthropic および Gemini プロバイダーでは無視されます。

> [!note]
>
> **`envKey` について**：`envKey` フィールドには実際の API キーの値ではなく、**環境変数の名前**を指定します。設定を機能させるには、対応する環境変数に実際の API キーが設定されていることを確認する必要があります。2 つの方法があります：
>
> - **方法 1：`.env` ファイルを使用する**（セキュリティ上推奨）：
>   ```bash
>   # ~/.qwen/.env（またはプロジェクトルート）
>   OPENAI_API_KEY=sk-your-actual-key-here
>   ```
>   シークレットを誤ってコミットしないように、`.env` を `.gitignore` に追加してください。
> - **方法 2：`settings.json` の `env` フィールドを使用する**（上記の例のとおり）：
>   ```json
>   {
>     "env": {
>       "OPENAI_API_KEY": "sk-your-actual-key-here"
>     }
>   }
>   ```
>
> 各プロバイダーの例には、API キーの設定方法を示す `env` フィールドが含まれています。

## Alibaba Cloud Coding Plan

Alibaba Cloud Coding Plan は、コーディングタスク向けに最適化された Qwen モデルのプリセットを提供します。この機能は Alibaba Cloud Coding Plan API アクセス権を持つユーザーが利用でき、自動的なモデル設定の更新によりシンプルなセットアップ体験を提供します。

### 概要

`/auth` コマンドで Alibaba Cloud Coding Plan API キーを使用して認証すると、Qwen Code は以下のモデルを自動的に設定します：

| モデル ID              | 名前                 | 説明                                                      |
| ---------------------- | -------------------- | --------------------------------------------------------- |
| `qwen3.5-plus`         | qwen3.5-plus         | thinking 有効の高度なモデル                               |
| `qwen3.6-plus`         | qwen3.6-plus         | thinking 有効の最新モデル（Pro サブスクライバーのみ）     |
| `qwen3.7-plus`         | qwen3.7-plus         | thinking 有効の高度なモデル                               |
| `qwen3-coder-plus`     | qwen3-coder-plus     | コーディングタスク向けに最適化                            |
| `qwen3-coder-next`     | qwen3-coder-next     | 実験的なコーディングモデル                                |
| `qwen3-max-2026-01-23` | qwen3-max-2026-01-23 | thinking 有効の最新 max モデル                            |
| `glm-5`                | glm-5                | thinking 有効の GLM モデル                                |
| `glm-4.7`              | glm-4.7              | thinking 有効の GLM モデル                                |
| `kimi-k2.5`            | kimi-k2.5            | thinking とビジョン/動画サポート付きの Kimi モデル        |
| `MiniMax-M2.5`         | MiniMax-M2.5         | thinking 有効の MiniMax モデル                            |

### セットアップ

1. Alibaba Cloud Coding Plan API キーを取得します：
   - **中国**：<https://bailian.console.aliyun.com/?tab=model#/efm/coding_plan>
   - **インターナショナル**：<https://modelstudio.console.alibabacloud.com/?tab=dashboard#/efm/coding_plan>
2. Qwen Code で `/auth` コマンドを実行します
3. **Alibaba ModelStudio** を選択し、サブメニューから **Coding Plan** を選択します
4. リージョンを選択します
5. プロンプトが表示されたら API キーを入力します

モデルが自動的に設定され、`/model` ピッカーに追加されます。

### リージョン

Alibaba Cloud Coding Plan は 2 つのリージョンをサポートします：

| リージョン      | エンドポイント                                  | 説明                             |
| --------------- | ----------------------------------------------- | -------------------------------- |
| 中国            | `https://coding.dashscope.aliyuncs.com/v1`      | 中国本土エンドポイント           |
| グローバル/海外 | `https://coding-intl.dashscope.aliyuncs.com/v1` | インターナショナルエンドポイント |

リージョンは認証時に選択され、`modelProviders` 設定の下の `settings.json` に保存されます。リージョンを切り替えるには、`/auth` コマンドを再実行して別のリージョンを選択してください。

### API キーの保存

`/auth` コマンドで Coding Plan を設定すると、API キーは予約済み環境変数名 `BAILIAN_CODING_PLAN_API_KEY` を使用して保存されます。デフォルトでは、`settings.json` ファイルの `env` フィールドに保存されます。

> [!warning]
>
> **セキュリティに関する推奨事項**：セキュリティを高めるために、API キーを `settings.json` から別の `.env` ファイルに移動し、環境変数として読み込むことを推奨します。例：
>
> ```bash
> # ~/.qwen/.env
> BAILIAN_CODING_PLAN_API_KEY=your-api-key-here
> ```
>
> プロジェクトレベルの設定を使用している場合は、このファイルを `.gitignore` に追加してください。

### 自動更新

Coding Plan のモデル設定はバージョン管理されています。Qwen Code がより新しいバージョンのモデルテンプレートを検出すると、更新を促すプロンプトが表示されます。更新を承認すると、以下が実行されます：

- 既存の Coding Plan モデル設定を最新バージョンに置き換える
- 手動で追加したカスタムモデル設定を保持する
- 更新された設定の最初のモデルに自動的に切り替える

この更新プロセスにより、手動操作なしで常に最新のモデル設定と機能にアクセスできます。

### 手動設定（上級者向け）

Coding Plan モデルを手動で設定したい場合は、OpenAI 互換プロバイダーと同様に `settings.json` に追加できます：

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
> 手動設定を使用する場合：
>
> - `envKey` には任意の環境変数名を使用できます
> - `codingPlan.*` を設定する必要はありません
> - 手動設定した Coding Plan モデルには**自動更新が適用されません**

> [!warning]
>
> 自動 Coding Plan 設定も使用している場合、手動設定が自動設定と同じ `envKey` および `baseUrl` を使用していると、自動更新によって手動設定が上書きされる可能性があります。これを避けるため、可能であれば手動設定では異なる `envKey` を使用してください。

## 解決レイヤーとアトミック性

有効な認証/モデル/認証情報の値は、以下の優先順位（最初に存在するものが優先）を使用してフィールドごとに選択されます。`--auth-type` と `--model` を組み合わせてプロバイダーエントリを直接指定できます。これらの CLI フラグは他のレイヤーよりも先に処理されます。

| レイヤー（高 → 低）          | authType                              | model                                              | apiKey                                                    | baseUrl                                                     | apiKeyEnvKey           | proxy                                  |
| ---------------------------- | ------------------------------------- | -------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------- | ---------------------- | -------------------------------------- |
| プログラム的なオーバーライド | `/auth`                               | `/auth` 入力                                       | `/auth` 入力                                              | `/auth` 入力                                                | —                      | —                                      |
| モデルプロバイダー選択       | —                                     | `modelProvider.id`                                 | `env[modelProvider.envKey]`                               | `modelProvider.baseUrl`                                     | `modelProvider.envKey` | —                                      |
| CLI 引数                     | `--auth-type`                         | `--model`                                          | `--openai-api-key`（またはプロバイダー固有の同等オプション） | `--openai-base-url`（またはプロバイダー固有の同等オプション） | —                      | —                                      |
| 環境変数                     | —                                     | プロバイダー固有のマッピング（例：`OPENAI_MODEL`）  | プロバイダー固有のマッピング（例：`OPENAI_API_KEY`）       | プロバイダー固有のマッピング（例：`OPENAI_BASE_URL`）        | —                      | —                                      |
| 設定（`settings.json`）      | `security.auth.selectedType`          | `model.name`                                       | `security.auth.apiKey`                                    | `security.auth.baseUrl`                                     | —                      | —                                      |
| デフォルト / 計算済み        | `AuthType.QWEN_OAUTH` にフォールバック | 組み込みデフォルト（OpenAI ⇒ `qwen3.5-plus`）      | —                                                         | —                                                           | —                      | 設定されている場合は `Config.getProxy()` |

\*CLI 認証フラグが存在する場合、設定を上書きします。それ以外の場合、`security.auth.selectedType` または暗黙のデフォルトが認証タイプを決定します。Qwen OAuth と OpenAI は、追加設定なしで公開される唯一の認証タイプです。

> [!warning]
>
> **`security.auth.apiKey` および `security.auth.baseUrl` の非推奨化：** `settings.json` で `security.auth.apiKey` および `security.auth.baseUrl` を通じて API 認証情報を直接設定することは非推奨です。これらの設定は過去のバージョンで UI から入力された認証情報に使用されていましたが、認証情報の入力フローはバージョン 0.10.1 で削除されました。これらのフィールドは将来のリリースで完全に削除されます。すべてのモデルおよび認証情報の設定には **`modelProviders` への移行を強く推奨します**。設定ファイルに認証情報をハードコードする代わりに、`modelProviders` の `envKey` を使用して環境変数を参照することで、安全な認証情報管理を実現してください。

## 生成設定のレイヤリング：不透過プロバイダーレイヤー

設定の解決は、1 つの重要なルールを持つ厳格なレイヤリングモデルに従います：**modelProvider レイヤーは不透過です**。

### 仕組み

1. **modelProvider モデルが選択されている場合**（例：`/model` コマンドでプロバイダー設定済みモデルを選択）：
   - プロバイダーの `generationConfig` 全体が**アトミックに**適用されます
   - **プロバイダーレイヤーは完全に不透過**です。下位レイヤー（CLI、env、settings）は `generationConfig` の解決に参加しません
   - `modelProviders[].generationConfig` で定義されたすべてのフィールドはプロバイダーの値を使用します
   - プロバイダーで**定義されていない**すべてのフィールドは `undefined` に設定されます（設定から継承されません）
   - これにより、プロバイダー設定が完全な自己完結型の「密閉パッケージ」として機能することが保証されます

   モデルが `modelProviders` に登録されている場合、そのモデルのすべての生成設定を
   対応するプロバイダーエントリに記述してください。`contextWindowSize`、
   `modalities`、`customHeaders`、`extra_body` を含む
   トップレベルの `model.generationConfig` の値は、プロバイダーモデルでは無視されます。
   これらのフィールドは `modelProviders[authType][].generationConfig` の下に設定してください。

2. **modelProvider モデルが選択されていない場合**（例：CLI で `--model` に生のモデル ID を指定、または CLI/env/settings を直接使用）：
   - 解決が下位レイヤーに通過します
   - フィールドは CLI → env → settings → デフォルトの順に設定されます
   - これにより**ランタイムモデル**が作成されます（次のセクションを参照）

### `generationConfig` のフィールドごとの優先順位

| 優先度 | ソース                                        | 動作                                                                                                  |
| ------ | --------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 1      | プログラム的なオーバーライド                  | ランタイムの `/model`、`/auth` による変更                                                             |
| 2      | `modelProviders[authType][].generationConfig` | **不透過レイヤー** - すべての `generationConfig` フィールドを完全に置き換え、下位レイヤーは参加しない |
| 3      | `settings.model.generationConfig`             | **ランタイムモデル**のみで使用（プロバイダーモデルが選択されていない場合）                           |
| 4      | コンテンツジェネレーターのデフォルト          | プロバイダー固有のデフォルト（例：OpenAI vs Gemini）- ランタイムモデルのみ                           |

### アトミックなフィールドの扱い

以下のフィールドはアトミックなオブジェクトとして扱われます。プロバイダーの値がオブジェクト全体を完全に置き換え、マージは行われません：

- `samplingParams` - temperature、top_p、max_tokens など
- `customHeaders` - カスタム HTTP ヘッダー
- `extra_body` - 追加のリクエストボディパラメーター

### 例

```jsonc
// ユーザー設定（~/.qwen/settings.json）
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

modelProviders から `gpt-4o` を選択した場合：

- `timeout` = 60000（プロバイダーの値、設定を上書き）
- `samplingParams.temperature` = 0.2（プロバイダーの値、設定のオブジェクトを完全に置き換え）
- `samplingParams.max_tokens` = **undefined**（プロバイダーで定義されておらず、プロバイダーレイヤーは設定から継承しない。未指定のフィールドは明示的に undefined に設定される）

`--model gpt-4` で生のモデルを使用した場合（modelProviders からではない、ランタイムモデルを作成）：

- `timeout` = 30000（設定から）
- `samplingParams.temperature` = 0.5（設定から）
- `samplingParams.max_tokens` = 1000（設定から）

`modelProviders` 自体のマージ戦略は REPLACE です：プロジェクト設定の `modelProviders` 全体が、ユーザー設定の対応するセクションをマージするのではなく、上書きします。

## 推論（Reasoning/Thinking）の設定

`generationConfig` 下のオプションの `reasoning` フィールドは、モデルが応答前にどの程度積極的に推論するかを制御します。Anthropic と Gemini のコンバーターは常にこれを適用します。OpenAI 互換パイプラインでは、`generationConfig.samplingParams` が設定されていない限り適用されます。詳細は下記の「`samplingParams` との相互作用」の注意事項を参照してください。

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
            //   'low'    | 'medium' — サーバー側で DeepSeek の 'high' にマッピング
            //   'high'   — デフォルトの推論強度
            //   'max'    — DeepSeek 固有の最強ティア
            // または `false` を設定して推論を完全に無効化
            "reasoning": { "effort": "max" },
          },
        },
      ],
    },
  },
}
```

### プロバイダーごとの動作

| プロトコル / プロバイダー                        | ワイヤーシェイプ                                                        | 備考                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------ | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **OpenAI / DeepSeek**（`api.deepseek.com`）      | フラットな `reasoning_effort: <effort>` ボディパラメーター              | ネストされた設定シェイプで `reasoning.effort` が設定されると、フラットな `reasoning_effort` に書き換えられ、`'low'`/`'medium'` は `'high'` に、`'xhigh'` は `'max'` に正規化されます。これは DeepSeek の[サーバー側の後方互換性](https://api-docs.deepseek.com/zh-cn/api/create-chat-completion)を踏まえたものです。トップレベルの `samplingParams.reasoning_effort` または `extra_body.reasoning_effort` によるオーバーライドはこの正規化をスキップし、そのまま送信されます。 |
| **OpenAI**（その他の互換サーバー）               | `reasoning: { effort, ... }` をそのまま渡す                             | プロバイダーが異なるシェイプを期待する場合は `samplingParams` 経由で設定します（例：GPT-5/o シリーズには `samplingParams.reasoning_effort`）。                                                                                                                                                                                                                         |
| **Anthropic**（実際の `api.anthropic.com`）      | `output_config: { effort }` および `effort-2025-11-24` ベータヘッダー  | 実際の Anthropic は `'low'`/`'medium'`/`'high'` のみ受け付けます。`'max'` は `'high'` に**クランプされ**、`debugLogger.warn` が出力されます（ジェネレーターごとに 1 回）。最大 effort が必要な場合は、それをサポートする DeepSeek 互換エンドポイントに baseURL を切り替えてください。                                                                                |
| **Anthropic**（`api.deepseek.com/anthropic`）    | 同じ `output_config: { effort }` + ベータヘッダー                      | `'max'` はそのまま渡されます。                                                                                                                                                                                                                                                                                                                                         |
| **Gemini**（`@google/genai`）                    | `thinkingConfig: { includeThoughts: true, thinkingLevel }`              | `'low'` → `LOW`、`'high'`/`'max'` → `HIGH`、その他 → `THINKING_LEVEL_UNSPECIFIED`（Gemini には `MAX` ティアがありません）。                                                                                                                                                                                                                                           |

### `reasoning: false`

`reasoning: false`（リテラルのブール値）を設定すると、すべてのプロバイダーで thinking が明示的に無効化されます。推論の恩恵を受けない軽量なサイドクエリに便利です。これはリクエストレベルでも適用されます（例：サジェスト生成などの一回限りの呼び出しでは `request.config.thinkingConfig.includeThoughts: false`）。

`api.deepseek.com` の baseURL では、OpenAI パイプラインが DeepSeek V4 以降で必要な明示的な `thinking: { type: 'disabled' }` フィールドを送信します。サーバー側のデフォルトは `'enabled'` であるため、単に `reasoning_effort` を省略するだけでも thinking のレイテンシ/コストが発生します。セルフホストの DeepSeek バックエンド（sglang/vllm）やその他の OpenAI 互換サーバーにはこのフィールドは送信されません。それらで thinking を無効化する必要がある場合は、`samplingParams`/`extra_body` を通じて `thinking: { type: 'disabled' }`（または推論フレームワークが公開しているパラメーター）を注入してください。

### `samplingParams` との相互作用（OpenAI 互換のみ）

> [!warning]
>
> OpenAI 互換プロバイダーで `generationConfig.samplingParams` が設定されている場合、パイプラインはそれらのキーをそのままワイヤーに送信し、`reasoning` の注入を完全にスキップします。つまり、`{ samplingParams: { temperature: 0.5 }, reasoning: { effort: 'max' } }` のような設定では、OpenAI/DeepSeek リクエストで reasoning フィールドが無視されます。
>
> `samplingParams` を設定する場合は、推論のパラメーターをその中に直接含めてください。DeepSeek では `samplingParams.reasoning_effort`、GPT-5/o シリーズではフラットフィールドの `samplingParams.reasoning_effort` またはネストオブジェクトの `samplingParams.reasoning` です。OpenRouter やその他のプロバイダーではフィールド名が異なります。プロバイダーのドキュメントを参照してください。
>
> Anthropic と Gemini のコンバーターは影響を受けません。`samplingParams` に関係なく、常に `reasoning.effort` を直接読み取ります。

### `budget_tokens`

`effort` と共に `budget_tokens` を含めることで、thinking トークン予算を正確に固定できます：

```jsonc
"reasoning": { "effort": "high", "budget_tokens": 50000 }
```

Anthropic ではこれは `thinking.budget_tokens` になります。OpenAI/DeepSeek ではフィールドは保持されますが、現時点ではサーバーによって無視されます。`reasoning_effort` が有効なパラメーターです。

## プロバイダーモデルとランタイムモデル

Qwen Code は 2 種類のモデル設定を区別します：

### プロバイダーモデル

- `modelProviders` 設定で定義
- 完全でアトミックな設定パッケージを持つ
- 選択時、設定が不透過レイヤーとして適用される
- `/model` コマンドのリストにメタデータ（名前、説明、機能）付きで表示される
- マルチモデルワークフローとチームの一貫性のために推奨

### ランタイムモデル

- CLI（`--model`）、環境変数、または設定で生のモデル ID を使用する際に動的に作成される
- `modelProviders` に定義されていない
- 設定は解決レイヤー（CLI → env → settings → デフォルト）を「プロジェクション」することで構築される
- 完全な設定が検出されると、自動的に **RuntimeModelSnapshot** としてキャプチャされる
- 認証情報を再入力せずに再利用可能

### RuntimeModelSnapshot のライフサイクル

`modelProviders` を使用せずにモデルを設定すると、Qwen Code は自動的に RuntimeModelSnapshot を作成して設定を保持します：

```bash
# ID: $runtime|openai|my-custom-model の RuntimeModelSnapshot を作成
qwen --auth-type openai --model my-custom-model --openai-api-key $KEY --openai-base-url https://api.example.com/v1
```

スナップショットの特徴：

- モデル ID、API キー、base URL、生成設定をキャプチャ
- セッション間で持続（ランタイム中はメモリに保存）
- `/model` コマンドのリストにランタイムオプションとして表示
- `/model $runtime|openai|my-custom-model` を使用して切り替え可能

### 主な違い

| 側面               | プロバイダーモデル                    | ランタイムモデル                             |
| ------------------ | ------------------------------------- | -------------------------------------------- |
| 設定ソース         | 設定の `modelProviders`               | CLI、env、settings レイヤー                  |
| 設定のアトミック性 | 完全で不透過なパッケージ              | レイヤード、各フィールドが個別に解決         |
| 再利用性           | `/model` リストで常に利用可能         | スナップショットとしてキャプチャ、完全な場合に表示 |
| チーム共有         | 可能（コミット済み設定経由）          | 不可（ユーザーローカル）                     |
| 認証情報の保存     | `envKey` 経由の参照のみ               | スナップショットに実際のキーをキャプチャする可能性 |

### どちらを使うべきか

- **プロバイダーモデルを使う場合**：チーム全体で共有する標準モデルがある、一貫した設定が必要、または偶発的な上書きを防ぎたい場合
- **ランタイムモデルを使う場合**：新しいモデルを素早くテストする、一時的な認証情報を使用する、またはアドホックなエンドポイントで作業する場合

## 選択の永続化と推奨事項

> [!important]
>
> 可能な限り、ユーザースコープの `~/.qwen/settings.json` に `modelProviders` を定義し、どのスコープにも認証情報のオーバーライドを保存しないようにしてください。プロバイダーカタログをユーザー設定に保持することで、プロジェクトとユーザースコープ間のマージ/上書きの競合を防ぎ、`/auth` と `/model` の更新が常に一貫したスコープに書き戻されることを保証します。

- `/model` と `/auth` は `model.name`（該当する場合）と `security.auth.selectedType` を、既に `modelProviders` を定義している最も近い書き込み可能なスコープに保存します。それ以外の場合はユーザースコープにフォールバックします。これにより、ワークスペース/ユーザーファイルがアクティブなプロバイダーカタログと同期された状態が保たれます。
- `modelProviders` がない場合、リゾルバーは CLI/env/settings レイヤーを混在させてランタイムモデルを作成します。単一プロバイダーのセットアップでは問題ありませんが、頻繁に切り替える場合は煩雑になります。マルチモデルワークフローが一般的な場合は、プロバイダーカタログを定義して、切り替えがアトミックで、ソースが明確で、デバッグしやすい状態を保ちましょう。
