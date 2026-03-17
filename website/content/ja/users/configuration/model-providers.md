# モデルプロバイダー

Qwen Code では、`settings.json` の `modelProviders` 設定を通じて複数のモデルプロバイダーを設定できます。これにより、`/model` コマンドを使って異なる AI モデルおよびプロバイダー間を切り替えることができます。

## 概要

`modelProviders` を使用して、`/model` ピッカーが切り替えることができる、認証タイプごとの厳選されたモデル一覧を宣言します。キーは有効な認証タイプ（例：`openai`、`anthropic`、`gemini` など）である必要があります。各エントリには `id` が必要であり、**必ず `envKey` を含める必要があります**。また、任意で `name`、`description`、`baseUrl`、`generationConfig` を指定できます。資格情報は設定に保存されることはありません。実行時環境では、`process.env[envKey]` から読み込まれます。Qwen の OAuth モデルはハードコードされており、上書きできません。

> [!note]
>
> 非デフォルトの認証タイプを公開しているのは `/model` コマンドのみです。Anthropic や Gemini などのモデルは、`modelProviders` を通じて定義する必要があります。一方、`/auth` コマンドでは、Qwen OAuth、Alibaba Cloud Coding Plan、および API Key の 3 つが組み込みの認証オプションとして表示されます。

> [!warning]
>
> **同一 authType 内での重複するモデル ID：** 同一の `authType`（例：`openai` 内で `"id": "gpt-4o"` のエントリを 2 つ定義）に、同じ `id` を持つ複数のモデルを定義することは、現時点ではサポートされていません。重複が存在する場合、**最初に出現したエントリが優先され**、その後の重複エントリは警告とともに無視されます。なお、`id` フィールドは設定識別子としてだけでなく、API に送信される実際のモデル名としても使用されるため、`gpt-4o-creative` や `gpt-4o-balanced` のように一意な ID を用いるという対応策は有効ではありません。これは既知の制限事項であり、今後のリリースで対応する予定です。

## 認証タイプ別の設定例

以下に、さまざまな認証タイプに対する包括的な設定例を示します。利用可能なパラメーターとその組み合わせも併記しています。

### サポートされる認証タイプ

`modelProviders` オブジェクトのキーは、有効な `authType` 値である必要があります。現在サポートされている認証タイプは以下のとおりです。

| 認証タイプ   | 説明                                                                                     |
| ------------ | ---------------------------------------------------------------------------------------- |
| `openai`     | OpenAI 互換 API（OpenAI、Azure OpenAI、vLLM/Ollama などのローカル推論サーバー）         |
| `anthropic`  | Anthropic Claude API                                                                     |
| `gemini`     | Google Gemini API                                                                        |
| `qwen-oauth` | Qwen OAuth（ハードコードされており、`modelProviders` 内では上書きできません）           |

> [!warning]
> 無効な認証タイプのキー（例：`"openai-custom"` のようなタイプミス）を使用した場合、設定は**警告なしに無視され**、モデルは `/model` ピッカーに表示されません。常に上記で示されたサポート対象の認証タイプのいずれかを使用してください。

### API リクエストに使用される SDK

Qwen Code では、各プロバイダーへのリクエスト送信に以下の公式 SDK を使用します。

| 認証タイプ   | SDK パッケージ                                                                                     |
| ------------ | --------------------------------------------------------------------------------------------------- |
| `openai`     | [`openai`](https://www.npmjs.com/package/openai) — 公式 OpenAI Node.js SDK                        |
| `anthropic`  | [`@anthropic-ai/sdk`](https://www.npmjs.com/package/@anthropic-ai/sdk) — 公式 Anthropic SDK       |
| `gemini`     | [`@google/genai`](https://www.npmjs.com/package/@google/genai) — 公式 Google GenAI SDK            |
| `qwen-oauth` | [`openai`](https://www.npmjs.com/package/openai)（カスタムプロバイダー：DashScope 互換）           |

つまり、設定する `baseUrl` は、対応する SDK が期待する API 形式と互換性を持つ必要があります。たとえば、`openai` 認証タイプを使用する場合、エンドポイントは OpenAI API 形式のリクエストを受け付ける必要があります。

### OpenAI 互換プロバイダー (`openai`)

この認証タイプは、OpenAI の公式 API だけでなく、OpenRouter などの集約型モデルプロバイダーを含む、すべての OpenAI 互換エンドポイントをサポートします。

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
        "name": "GPT-4o (OpenRouter 経由)",
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

### ローカルで自己ホストされるモデル（OpenAI 互換 API 経由）

ほとんどのローカル推論サーバー（vLLM、Ollama、LM Studio など）は、OpenAI 互換の API エンドポイントを提供しています。これらは、`openai` 認証タイプとローカルの `baseUrl` を指定して設定します。

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

認証を必要としないローカルサーバーの場合は、API キーとして任意のプレースホルダー値を使用できます。

```bash

# Ollama の場合（認証不要）
export OLLAMA_API_KEY="ollama"

# vLLM の場合（認証が設定されていない場合）
export VLLM_API_KEY="not-needed"
```

> [!note]
>
> `extra_body` パラメーターは、**OpenAI 互換プロバイダー**（`openai`、`qwen-oauth`）でのみサポートされています。Anthropic や Gemini プロバイダーでは無視されます。

## Alibaba Cloud Coding Plan

Alibaba Cloud Coding Plan は、コーディングタスクに最適化された Qwen モデルの事前設定済みセットを提供します。この機能は、Alibaba Cloud Coding Plan の API アクセス権を持つユーザー向けであり、自動的なモデル構成更新により、シンプルなセットアップ体験を実現します。

### 概要

`/auth` コマンドで Alibaba Cloud Coding Plan の API キーを用いて認証すると、Qwen Code は自動的に以下のモデルを設定します。

| モデル ID               | 名前                 | 説明                                   |
| ---------------------- | -------------------- | -------------------------------------- |
| `qwen3.5-plus`         | qwen3.5-plus         | 思考機能が有効化された高度なモデル     |
| `qwen3-coder-plus`     | qwen3-coder-plus     | コーディングタスクに最適化されたモデル |
| `qwen3-max-2026-01-23` | qwen3-max-2026-01-23 | 思考機能が有効化された最新の max モデル |

### セットアップ

1. Alibaba Cloud Coding Plan の API キーを取得します：
   - **中国**: <https://bailian.console.aliyun.com/?tab=model#/efm/coding_plan>
   - **国際版**: <https://modelstudio.console.alibabacloud.com/?tab=dashboard#/efm/coding_plan>
2. Qwen Code で `/auth` コマンドを実行します
3. **Alibaba Cloud Coding Plan** を選択します
4. リージョンを選択します
5. プロンプトに従って API キーを入力します

モデルは自動的に設定され、`/model` ピッカーに追加されます。

### リージョン

Alibaba Cloud Coding Plan は、以下の 2 つのリージョンをサポートしています。

| リージョン         | エンドポイント                                          | 説明                     |
| ------------------ | ------------------------------------------------------- | ------------------------ |
| 中国               | `https://coding.dashscope.aliyuncs.com/v1`              | 中国本土向けエンドポイント |
| グローバル／国際版 | `https://coding-intl.dashscope.aliyuncs.com/v1`          | 国際向けエンドポイント     |

リージョンは認証時に選択され、`settings.json` の `codingPlan.region` に保存されます。リージョンを切り替えるには、`/auth` コマンドを再実行して、別のリージョンを選択してください。

### API キーの保存

`/auth` コマンドでコーディングプランを設定すると、API キーは予約済みの環境変数名 `BAILIAN_CODING_PLAN_API_KEY` を使用して保存されます。デフォルトでは、`settings.json` ファイルの `env` フィールドに保存されます。

> [!warning]
>
> **セキュリティに関する推奨事項**: セキュリティを高めるために、API キーを `settings.json` から個別の `.env` ファイルに移動し、環境変数として読み込むことを推奨します。例：
>
> ```bash
> # ~/.qwen/.env
> BAILIAN_CODING_PLAN_API_KEY=your-api-key-here
> ```
>
> プロジェクトレベルの設定を使用している場合は、このファイルを `.gitignore` に追加することを忘れないでください。

### 自動更新

コーディングプランのモデル設定はバージョン管理されています。Qwen Code がモデルテンプレートの新しいバージョンを検出した場合、更新を促すメッセージが表示されます。更新を承諾すると、以下の処理が実行されます。

- 既存のコーディングプランモデル設定が最新バージョンに置き換えられます
- 手動で追加したカスタムモデル設定はすべて保持されます
- 更新後の設定に含まれる最初のモデルに自動的に切り替わります

この更新プロセスにより、手動での介入なしに、常に最新のモデル設定および機能を利用できます。

### 手動設定（上級者向け）

Coding Plan モデルを手動で設定したい場合は、OpenAI 互換プロバイダーと同様に、`settings.json` に以下のように追加できます。

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3-coder-plus",
        "name": "qwen3-coder-plus",
        "description": "Alibaba Cloud Coding Plan 経由の Qwen3-Coder",
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
> - **手動で設定した Coding Plan モデルには、自動更新が適用されません**

> [!warning]
>
> 自動 Coding Plan 設定も併用している場合、自動更新によって手動設定が上書きされる可能性があります（自動設定と手動設定で `envKey` および `baseUrl` が一致する場合）。これを回避するには、可能であれば手動設定で異なる `envKey` を使用してください。

## 解決階層と原子性

有効な認証（auth）／モデル／資格情報（credential）の値は、以下の優先順位（最初に存在するものが採用される）に従って各フィールドごとに選択されます。`--auth-type` と `--model` を組み合わせることで、プロバイダーのエントリを直接指定できます。これらの CLI フラグは、他の階層よりも先に実行されます。

| 階層（最も優先度が高い → 最も優先度が低い） | authType                            | model                                           | apiKey                                              | baseUrl                                              | apiKeyEnvKey           | proxy                             |
| ------------------------------------------ | ----------------------------------- | ----------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------- | ---------------------- | --------------------------------- |
| プログラムによる上書き                     | `/auth`                             | `/auth` 入力                                    | `/auth` 入力                                        | `/auth` 入力                                         | —                      | —                                 |
| モデルプロバイダーの選択                   | —                                   | `modelProvider.id`                              | `env[modelProvider.envKey]`                         | `modelProvider.baseUrl`                              | `modelProvider.envKey` | —                                 |
| CLI 引数                                   | `--auth-type`                       | `--model`                                       | `--openaiApiKey`（またはプロバイダー固有の同等のオプション） | `--openaiBaseUrl`（またはプロバイダー固有の同等のオプション） | —                      | —                                 |
| 環境変数                                   | —                                   | プロバイダー固有のマッピング（例：`OPENAI_MODEL`） | プロバイダー固有のマッピング（例：`OPENAI_API_KEY`）   | プロバイダー固有のマッピング（例：`OPENAI_BASE_URL`）   | —                      | —                                 |
| 設定（`settings.json`）                    | `security.auth.selectedType`        | `model.name`                                    | `security.auth.apiKey`                              | `security.auth.baseUrl`                              | —                      | —                                 |
| デフォルト／計算値                           | `AuthType.QWEN_OAUTH` へフォールバック | 組み込みデフォルト（OpenAI ⇒ `qwen3-coder-plus`） | —                                                   | —                                                    | —                      | 構成済みの場合 `Config.getProxy()` |

\*CLI の認証フラグが存在する場合、設定ファイルの値は無視されます。それ以外の場合、認証タイプは `security.auth.selectedType` または暗黙のデフォルト値によって決定されます。追加の設定なしで利用可能な認証タイプは、Qwen OAuth と OpenAI のみです。

> [!warning]
>
> **`security.auth.apiKey` および `security.auth.baseUrl` の非推奨化**: `settings.json` 内で `security.auth.apiKey` や `security.auth.baseUrl` を通じて API 資格情報を直接設定する方法は非推奨です。これらの設定は、過去のバージョンで UI 経由で入力された資格情報の保存に使用されていましたが、資格情報入力フロー自体はバージョン 0.10.1 で削除されました。これらのフィールドは今後のリリースで完全に削除される予定です。**すべてのモデルおよび資格情報設定については、`modelProviders` への移行を強く推奨します**。安全な資格情報管理のため、設定ファイル内に資格情報をハードコードする代わりに、`modelProviders` の `envKey` を使用して環境変数を参照してください。

## 生成設定のレイヤリング：透過不可能なプロバイダー・レイヤー

設定の解決は、厳密なレイヤリングモデルに従います。その中で最も重要なルールは、**`modelProvider` レイヤーが透過不可能である**という点です。

### 動作の仕組み

1. **モデルプロバイダーのモデルが選択されている場合**（例：`/model` コマンドでプロバイダー設定済みのモデルを選択したとき）：
   - プロバイダーから定義された `generationConfig` 全体が**アトミックに適用**される
   - **プロバイダーレイヤーは完全に透過不可**である — 下位レイヤー（CLI、環境変数、設定）は `generationConfig` の解決プロセスに一切関与しない
   - `modelProviders[].generationConfig` で定義されたすべてのフィールドは、プロバイダーの値が使用される
   - プロバイダーによって**定義されていないすべてのフィールド**は `undefined` に設定される（設定からの継承は発生しない）
   - これにより、プロバイダーの設定は完全かつ自己完結型の「シールドパッケージ」として機能する

2. **モデルプロバイダーのモデルが選択されていない場合**（例：`--model` オプションで生のモデル ID を指定したとき、または CLI／環境変数／設定を直接使用したとき）：
   - 解決処理は下位レイヤーへフォールスルーする
   - フィールドは CLI → 環境変数 → 設定 → デフォルト の順に埋められる
   - これにより **ランタイムモデル**（次のセクション参照）が生成される

### `generationConfig` のフィールド単位の優先順位

| 優先順位 | ソース                                                | 動作                                                                                                                               |
| -------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1        | プログラムによる上書き                                  | 実行時 `/model`、`/auth` の変更                                                                                                    |
| 2        | `modelProviders[authType][].generationConfig`         | **透過不可なレイヤー** — `generationConfig` のすべてのフィールドを完全に置き換えます。下位のレイヤーは適用されません。               |
| 3        | `settings.model.generationConfig`                     | **実行時モデル**（プロバイダーモデルが選択されていない場合）でのみ使用されます。                                                  |
| 4        | コンテンツジェネレーターのデフォルト値                | プロバイダー固有のデフォルト値（例：OpenAI vs Gemini）— 実行時モデルでのみ使用されます。                                           |

### アトミックなフィールド処理

以下のフィールドはアトミックなオブジェクトとして扱われます。プロバイダーの値は、対象オブジェクト全体を完全に置き換え、マージは行われません。

- `samplingParams` — 温度（temperature）、top_p、max_tokens など
- `customHeaders` — カスタム HTTP ヘッダー
- `extra_body` — 追加のリクエストボディパラメーター

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

`gpt-4o` が `modelProviders` から選択された場合：

- `timeout` = 60000（プロバイダー由来。ユーザー設定を上書き）
- `samplingParams.temperature` = 0.2（プロバイダー由来。ユーザー設定のオブジェクト全体を完全に置き換え）
- `samplingParams.max_tokens` = **undefined**（プロバイダーで定義されておらず、またプロバイダーレイヤーはユーザー設定を継承しないため。未指定のフィールドは明示的に `undefined` に設定される）

`--model gpt-4` を使用して生のモデル（`modelProviders` 経由ではなく、ランタイムモデルとして作成）を利用する場合：

- `timeout` = 30000（ユーザー設定より）
- `samplingParams.temperature` = 0.5（ユーザー設定より）
- `samplingParams.max_tokens` = 1000（ユーザー設定より）

`modelProviders` 自体のマージ戦略は **REPLACE**（置換）です：プロジェクト設定の `modelProviders` 全体が、ユーザー設定内の対応するセクションを上書きします。2つの設定をマージすることはありません。

## プロバイダーモデルとランタイムモデル

Qwen Code では、モデル設定を以下の 2 種類に区別します。

### プロバイダーモデル

- `modelProviders` 設定で定義されます。
- 完全かつアトミックな設定パッケージを持ちます。
- 選択されると、その設定が透過不能なレイヤーとして適用されます。
- `/model` コマンドのリストに、完全なメタデータ（名前、説明、機能）とともに表示されます。
- 複数モデルを用いるワークフローおよびチーム内の一貫性確保に推奨されます。

### ランタイムモデル

- CLI（`--model` オプション）、環境変数、または設定ファイルを通じて生のモデル ID を使用した際に動的に作成されます。
- `modelProviders` には定義されません。
- 設定は「解決レイヤー」（CLI → 環境変数 → 設定 → デフォルト）を順に適用することで構築されます。
- 完全な設定が検出されると、自動的に **RuntimeModelSnapshot** として保存されます。
- 認証情報の再入力なしで再利用できます。

### RuntimeModelSnapshot のライフサイクル

`modelProviders` を使用せずにモデルを設定すると、Qwen Code は自動的に RuntimeModelSnapshot を作成して設定を保持します。

```bash
# これにより、ID: $runtime|openai|my-custom-model の RuntimeModelSnapshot が作成されます
qwen --auth-type openai --model my-custom-model --openaiApiKey $KEY --openaiBaseUrl https://api.example.com/v1
```

このスナップショットは以下の特徴を持ちます：

- モデル ID、API キー、ベース URL、および生成設定を保存します
- セッション間で永続化されます（実行時メモリ内に保持されます）
- `/model` コマンドのリストにランタイムオプションとして表示されます
- `/model $runtime|openai|my-custom-model` を使用して切り替えることができます

### 主な違い

| 項目                    | プロバイダーモデル                | ランタイムモデル                            |
| ----------------------- | --------------------------------- | ------------------------------------------ |
| 設定のソース            | 設定ファイル内の `modelProviders` | CLI、環境変数、設定のレイヤー              |
| 設定の原子性            | 完全かつ透過不能なパッケージ      | レイヤー化されており、各フィールドは独立して解決される |
| 再利用性                | 常に `/model` リストで利用可能    | スナップショットとして保存され、完全な場合にのみ表示される |
| チームでの共有          | 可能（コミット済みの設定経由）    | 不可（ユーザーごとのローカル設定）         |
| 認証情報の保存          | `envKey` による参照のみ          | スナップショット内に実際のキーを保存する可能性あり |

### それぞれの使用タイミング

- **プロバイダーモデル**は、以下の場合に使用します：チーム全体で標準的なモデルを共有している場合、一貫した設定が必要な場合、または誤って上書きされるのを防ぎたい場合
- **ランタイムモデル**は、以下の場合に使用します：新しいモデルを迅速にテストする場合、一時的な認証情報を使用する場合、またはアドホックなエンドポイントで作業する場合

## 選択の永続化と推奨事項

> [!important]
>
> 可能な限り、`modelProviders` はユーザー範囲の `~/.qwen/settings.json` に定義してください。また、いかなる範囲においても認証情報の上書きを永続化しないでください。プロバイダー・カタログをユーザー設定に保持することで、プロジェクト範囲とユーザー範囲間のマージ／上書き競合を防ぎ、`/auth` および `/model` の更新が常に一貫した範囲（ユーザー範囲）へ書き戻されるよう保証します。

- `/model` および `/auth` は、既に `modelProviders` を定義している最も近い書き込み可能な範囲に `model.name`（該当する場合）および `security.auth.selectedType` を永続化します。該当する範囲が存在しない場合は、ユーザー範囲へフォールバックします。これにより、ワークスペース／ユーザー設定ファイルがアクティブなプロバイダー・カタログと同期された状態を保ちます。
- `modelProviders` が定義されていない場合、リゾルバーは CLI／環境変数／設定の各レイヤーを混在させ、ランタイム・モデルを生成します。これは単一プロバイダー構成では問題ありませんが、頻繁にプロバイダーを切り替える場合には煩雑です。複数モデルを扱うワークフローが一般的な場合は、必ずプロバイダー・カタログを定義してください。これにより、プロバイダーの切り替えがアトミックかつソース属性付き・デバッグ可能になります。