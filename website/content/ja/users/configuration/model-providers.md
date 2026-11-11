# モデルプロバイダー

Qwen Code では、`settings.json` の `modelProviders` 設定を通じて複数のモデルプロバイダーを構成できます。これにより、`/model` コマンドを使用して異なる AI モデルやプロバイダー間を切り替えることができます。

## 概要

`/model` ピッカーで切り替え可能なプロバイダー ID ごとのモデルを宣言するために `modelProviders` を使用します。各キーはプロバイダー ID であり、その値は **モデル定義の配列** (`ModelConfig[]`) です。組み込みプロバイダーの場合、キーは有効な認証タイプ (`openai`, `anthropic`, `gemini`, `vertex-ai`) でなければなりません。カスタムプロバイダー ID (例: `idealab`) は、トップレベルの [`providerProtocol`](#custom-provider-ids-providerprotocol) 設定を通じてプロトコルにマップされている限り許可されます。各モデルエントリには `id` が必要であり、`envKey` は **省略可能ですが推奨されます** (省略した場合は、認証タイプのデフォルト環境変数キーにフォールバックします。例えば `openai` の場合 `OPENAI_API_KEY` など)。任意の項目として `name`, `description`, `baseUrl`, および `generationConfig` があります。認証情報は設定ファイルには永続化されません。ランタイムは `process.env[envKey]` から読み取ります。レガシーな無料 Qwen OAuth モデルはハードコードされており、上書きできません。

> [!note]
>
> 以前のプレビューでは、各プロバイダーのモデルを `{ "protocol": ..., "models": [...] }` オブジェクトでラップしていましたが、この形式は廃止されました。現在の値は、このページ全体で示されている裸の `ModelConfig[]` 配列です。すでに移行済みの（`$version: 4`）設定ファイル内のラップされたエントリはサイレントにスキップされるため、古い設定は配列形式に更新してください。

> [!note]
>
> API キープロバイダーを `modelProviders` を通じて構成し、`/model` で選択します。Qwen アカウントへのサインインの場合は、[**Qwen Account with Subscription**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli) を `/auth` で選択してください。API キーや手動での `modelProviders` 構成は不要です。サブスクリプションで利用可能なモデルから選択するために `/model` を使用します。サインイン手順については [Authentication](./auth.md) を参照してください。

> [!note]
>
> **モデルの一意性:** モデルは、実効的な API プロトコル、`id`、および構成された `baseUrl` によって識別されます。同じモデルと URL を `wireApi: "chat-completions"` と `wireApi: "responses"` の両方で定義したり、同じモデルと API に対して異なる URL を使用したりできます。エントリがこれら 3 つの値すべてを共有する場合、最初の出現箇所が優先され、後続の重複は警告とともにスキップされます。

> [!note]
>
> **ホットリロード vs. 再起動:** `settings.json` 内の `modelProviders` の編集は、実行中のインタラクティブセッションによって再起動なしで反映されます (ファイルウォッチャーは約 300ms のデバウンスを行います。新しいエントリを確認するには `/model` を再度開いてください。現在の選択は保持されます)。アクティブなモデルの `wireApi` を変更すると異なるルートが作成されます。それを使用するには、そのルートを明示的に選択するか、再起動してください。無効な API の編集でも、既存のレジストリは引き続き使用可能です。`providerProtocol` は起動時に一度だけ読み込まれ、**再起動が必要です**。

### 画像生成ルート

組み込みの `image_gen` ツールで使用可能なルートの場合に `supportsImageGeneration: true` を設定します。この機能は、`capabilities.vision` や `generationConfig.modalities.image` などの画像入力サポートとは独立しています。

画像生成専用で、通常のモデルセレクターに表示されないルートの場合は `imageOnly: true` を使用します。後方互換性のため、`imageOnly: true` は画像生成機能を暗黙的に示すため、既存の設定を移行する必要はありません。

デュアルロールのルートは、メインモデルとしても `/model --image` 経由でも選択できます:

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

専用の画像ルートは両方のフィールドを設定します。`imageOnly: true` のみのレガシー形式も有効です:

```json
{
  "id": "image-model",
  "envKey": "MODEL_API_KEY",
  "baseUrl": "https://images.example.com/api/v1",
  "supportsImageGeneration": true,
  "imageOnly": true
}
```

選択されたルートは、明示的な HTTPS `baseUrl` と空でない `envKey` を宣言する必要があります。画像生成はルートと同じエンドポイントと認証情報を使用します。チャットと画像生成で異なるエンドポイントや認証情報が必要な場合は、代わりに2つのルートを設定してください。

### Live Voice ルート

DashScope Realtime (音声から音声への) プロトコルに対応するルートに `realtimeOnly: true` を設定します。このようなルートは、チャット、高速、ビジョン、音声、または画像モデルとして提供されることはなく、Live Voice モデルとしてのみ `experimental.liveVoice.model` (複数のプロバイダー下に同じ ID が存在する場合は `modelId` または `provider:modelId`) 経由で選択できます。

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3.5-omni-plus-realtime",
        "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "envKey": "DASHSCOPE_API_KEY",
        "realtimeOnly": true
      }
    ]
  },
  "experimental": {
    "liveVoice": {
      "enabled": true,
      "model": "qwen3.5-omni-plus-realtime",
      "voice": "Tina"
    }
  }
}
```

選択されたモデルが `realtimeOnly` ルートを指定する場合、Live Voice はルートの `envKey` (まずプロセス環境変数、次に `settings.json` の `env` ブロック) を介して API キーを読み取り、その `baseUrl` から WebSocket エンドポイントを導出します (`https://<host>/compatible-mode/v1` は `wss://<host>/api-ws/v1/realtime` になります)。ルートは `baseUrl` と `envKey` の両方を宣言する必要があり、ホストは DashScope エンドポイントである必要があります。

2 つのルールは意図的です:

- ワークスペース設定は参照されず、ユーザーレベルおよびシステムレベルの設定のみが参照されます。プロジェクトの `.qwen/settings.json` は Live Voice ルートを追加したりリダイレクトしたりできません。
- どの `realtimeOnly` ルートにも一致しない **裸の** `modelId` は、以前と同様にスタンドアロンの `experimental.liveVoice.endpoint` および `experimental.liveVoice.apiKey` フィールドを使用するため、既存の設定は変更なしで動作し続けます。プロバイダーが存在するが該当するルートがない `provider:modelId` セレクターはエラーとなります: 削除されたルートやタイプミスのあるルートが保存されたキーに静かにフォールバックすることはありません。
- ルートが選択されている間、`experimental.liveVoice.apiKey` と `experimental.liveVoice.endpoint` は使用されず、セットアップ API は新しいものを保存することを拒否します。

スタンドアロンパスでは、Web Shell の Qwen Live 設定がエンドポイントとモデルを直接設定します。キーが属する地域または専用ドメインの OpenAI 互換ベース URL (例: `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`) を入力します。空欄の場合、Live は北京 (`https://dashscope.aliyuncs.com/compatible-mode/v1`) を使用し、他の場所からのキーは `401` で拒否されます。ベース URL は入力されたまま保存され、呼び出し開始時に `wss://<host>/api-ws/v1/realtime` に変換されます。ホストは DashScope または `*.maas.aliyuncs.com` エンドポイントである必要があります。Live Voice がオンの間、新しいエンドポイントは保存前に Realtime ハンドシェイクでチェックされます。

## 推論機能の上書き [#override-reasoning-capabilities]

モデルエントリに `capabilities.reasoning` を設定して、推論フォーマット、提供される努力レベルティア、デフォルトを上書きします。既知のモデルは、選択されたエンドポイントのプロバイダーカタログから省略されたフィールドを継承します。例えば、`"capabilities": { "reasoning": { "defaultEffort": "medium" } }` は明示的な努力レベルが選択されていない場合、DashScope `qwen3.8-max` ルートが medium を使用するようにします。不明なエイリアスの場合は、3つのフィールドすべてを宣言してください:

```json
{
  "id": "company-model-v2",
  "baseUrl": "https://gateway.example.com/v1",
  "envKey": "COMPANY_MODEL_API_KEY",
  "capabilities": {
    "reasoning": {
      "profile": "openai-effort",
      "efforts": ["low", "medium", "high"],
      "defaultEffort": "medium"
    }
  }
}
```

`efforts` は `low/medium/high/xhigh/max` のサポートされるサブセットを置き換えます。明示的なデフォルトはそのサブセットに含まれている必要があります。プロファイルは既存のフォーマットを再利用します: Chat は `openai-effort`, `openai-reasoning`, `deepseek-openai`, `dashscope-effort`, `dashscope-thinking`, `qwen-chat-template` を受け入れます; Responses は `openai-reasoning` を受け入れます; Anthropic は `anthropic-manual`, `anthropic-adaptive`, `deepseek-anthropic` を受け入れます; Gemini/Vertex は `gemini` を使用します。2つのトグルのみプロファイルは `efforts` と `defaultEffort` を省略します。Gemini は low/medium/high を使用します。適応型プロファイルは、レガシーの手動予算が設定されていても適応型思考を選択します。既存の完全な機能宣言は引き続き動作します。

推論の変更は次のユーザープロンプトの前に適用されます。そのリクエスト、再試行、子エージェントはキャプチャされた推論設定を共有します。無効な更新は以前の設定を保持し、モデル/フィールドのエラーをログに記録します。新規セッションでの無効な宣言は、安全に既存のモデル動作にフォールバックします。`reasoning`, `samplingParams`, `extra_body` 内の明示的なユーザー選択とプロバイダーネイティブの上書きは、既存の優先順位を保持します。モデルデフォルトはユーザー選択として保存されません。このメカニズムは、エンドポイント、認証情報、画像モデルのライフサイクルを変更しません。

## 認証タイプ別設定例

以下は、異なる認証タイプの包括的な設定例であり、利用可能なパラメータとその組み合わせを示しています。

### サポートされる認証タイプ

以下の組み込みプロバイダーIDのいずれかを使用するか、`providerProtocol`でカスタムIDをマッピングしてください：

| 実効プロトコル | 説明                                                                                                                                     |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `openai`           | OpenAI互換API。デフォルトはChat Completions；Responses APIの場合はモデルの`wireApi`を`responses`に設定します。                             |
| `anthropic`        | Anthropic Claude API                                                                                                                            |
| `gemini`           | Google Gemini API                                                                                                                               |
| `vertex-ai`        | Google Vertex AI (Vertex AI モードで `gemini` プロトコルと `@google/genai` SDK を使用。選択すると `GOOGLE_GENAI_USE_VERTEXAI=true` が設定されます) |

> [!note]
> Vertex AI エントリは**Application Default Credentials** で認証できます。`GOOGLE_CLOUD_PROJECT`（およびオプションで `GOOGLE_CLOUD_LOCATION`、デフォルトは `global`）を設定し、`envKey` を未設定のままにします。リゾルバーが読み取る他のすべてのキーソース（`GOOGLE_API_KEY`、`settings.security.auth.apiKey`、CLI のキーフラグ）も未設定にしてください。Vertex エントリに到達した API キー値は、Google SDK を Vertex Express モードに切り替えます。このモードでは、プロジェクト、ロケーション、ADC 認証情報は無視されます。`envKey` を宣言するエントリは ADC にルーティングされないため、注入に失敗したキーは、別のプリンシパルとしてサイレントに認証される代わりに、その変数で失敗し続けます。

> [!warning]
> 組み込みプロトコルでもなく、`providerProtocol` 経由でマッピングされていないプロバイダー ID（例：`"openai-custom"` のような入力ミス）はルーティングできないため、そのエントリ全体が警告付きで **スキップ** され、モデルは `/model` ピッカーに表示されません。組み込みプロバイダーには上記のサポートされている認証タイプ値のいずれかを使用するか、カスタム ID に対して [`providerProtocol`](#custom-provider-ids-providerprotocol) マッピングを追加してください。

### カスタムプロバイダー ID（`providerProtocol`） [#custom-provider-ids-providerprotocol]

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

### OpenAI API の選択

OpenAI 互換モデルにおいて `id`、`envKey`、`baseUrl` と並べて `wireApi` を設定します:

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "my-model",
        "wireApi": "responses",
        "envKey": "OPENAI_API_KEY",
        "baseUrl": "https://api.openai.com/v1"
      }
    ]
  },
  "security": { "auth": { "selectedType": "openai" } },
  "model": { "name": "my-model" }
}
```

サポートされている値は `chat-completions` と `responses` です。`wireApi` を省略すると、`openai` にマッピングされたカスタムプロバイダーを含め、`openai` に対して Chat Completions が使用されます。他の値や、Anthropic、Gemini、Vertex AI、Qwen OAuth モデルでの `wireApi` は設定エラーです。

新しい構成では、モデルごとの `wireApi` とともに `openai` を使用してください。v0.23.3 でリリースされた `modelProviders.openai-responses` 形式および `openai-responses` への `providerProtocol` マッピングは引き続き読み取り可能です。明示的なプロバイダーマッピングはバケット名より優先され、明示的な `wireApi` はいずれかの OpenAI プロトコルより優先されます。読み込み時に設定が書き換えられたり、資格情報参照が変更されたりすることはありません。再構成時には、新しい形式で選択されたルートが書き込まれ、書き込み可能なスコープ内で一致する古いエントリのみが削除されます。ドットを含むプロバイダー ID 配下のエントリはそのまま残され、無関係なモデル、エンドポイント、API、スコープは変更されません。`api` は `wireApi` のエイリアスではありません。

`wireApi` はローカルルーティングメタデータであり、`generationConfig` や `extra_body` に属さず、リクエストボディにも送信されません。新しいカスタムセットアップでは、同じ OpenAI エンドポイントに対して両方の API で 1 つの資格情報スロットを共有するため、そのキーをローテーションすると両方のルートが更新されます。手動で構成されたモデルは、独立した資格情報が必要な場合に異なる明示的な `envKey` 参照を使用できます。`/auth` → カスタムプロバイダー では、OpenAI 互換を選択してから API 形式を選択します。

起動時、選択された構成済みエンドポイントに一致する Chat ルートがない場合、`selectedType: "openai"` は `wireApi: "responses"` で明示的に構成されたモデルを解決できます。モデルピッカーと記録されたセッションは有効なプロトコル（`openai` または `openai-responses`）を保持するため、両方のルートを個別に選択して再開できます。API リクエストが失敗した場合、エンドポイント検出や自動フォールバックは発生しません。

### API リクエストで使用されるトランスポート

有効なモデルプロトコルがトランスポートを決定します。両方の OpenAI API は `openai` プロバイダーグループを使用し、`wireApi` で Chat Completions または Responses を選択します:

| 有効なプロトコル | トランスポート                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `openai`           | [`openai`](https://www.npmjs.com/package/openai) - 公式 OpenAI Node.js SDK                                     |
| `openai-responses` | `/v1/responses` への直接 HTTP/SSE 呼び出し（SDK なし）。埋め込みは [`openai`](https://www.npmjs.com/package/openai) を使用 |
| `anthropic`        | [`@anthropic-ai/sdk`](https://www.npmjs.com/package/@anthropic-ai/sdk) - 公式 Anthropic SDK                    |
| `gemini`           | [`@google/genai`](https://www.npmjs.com/package/@google/genai) - 公式 Google GenAI SDK                         |
| `qwen-oauth`       | カスタムプロバイダー（DashScope 互換）による [`openai`](https://www.npmjs.com/package/openai)                       |

つまり、構成する `baseUrl` は対応するトランスポートの期待する API 形式と互換性がある必要があります。例えば、`wireApi: "responses"` は Responses 互換のエンドポイントを必要とします。

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

ホストされた OpenAI 互換ゲートウェイにエントリを向ける場合、完全な `/v1/chat/completions` パスではなく、API の `/v1` ルート（例：`https://gateway.example.com/v1`）に `baseUrl` を設定してください。SDK がリクエストパス自体を追加します。

### OpenAI Responses API (`openai-responses`)

OpenAI の `/v1/responses` エンドポイントをターゲットにするために `wireApi: "responses"` とともに `openai` を使用します。エンドポイントが可視思考テキスト付きの暗号化推論を返す場合、ターン間で以前のターンの推論を再生し、`reasoning.encrypted_content` を介して `--resume` を行います。`response.reasoning_text.delta` をストリーム配信する互換エンドポイントも推論を表示しますが、`encrypted_content` を含まないエンドポイントでは不透明な推論状態を再生できません。推論強度を制御するには `reasoning.effort`（Chat Completions ワイヤが使用する `extra_body.enable_thinking` ではない）を使用してください。

```json
{
  "env": {
    "OPENAI_API_KEY": "sk-your-actual-openai-key-here"
  },
  "modelProviders": {
    "openai": [
      {
        "id": "gpt-5.1",
        "wireApi": "responses",
        "name": "GPT-5.1 (Responses API)",
        "envKey": "OPENAI_API_KEY",
        "baseUrl": "https://api.openai.com/v1",
        "generationConfig": {
          "timeout": 60000,
          "reasoning": {
            "effort": "high"
          },
          "samplingParams": {
            "temperature": 0.7,
            "max_tokens": 4096
          }
        }
      }
    ]
  }
}
```

> [!note]
> このワイヤー上の`extra_body`は「fill-only」です。つまり、キーは生成されたリクエストに値がない場合にのみリクエストボディに書き込まれるため、パイプラインがすでに設定したフィールド（`model`、`input`、`reasoning`、`temperature`、`max_output_tokens`など）を上書きすることはできません。レガシーの`enable_thinking`キーだけが唯一の例外であり、転送される代わりに削除されます（Responses APIのフィールドではないため）。明示的な`reasoning`が設定されていない場合は`reasoning.effort: "medium"`に変換されます。このプロバイダーでは`extra_body.enable_thinking`ではなく`reasoning.effort`を直接設定してください。

### Anthropic（`anthropic`）

Claude Opus 5.5, Sonnet 5.5, Fable 5.1, Mythos 5.1 は強制ツール選択を拒否します。構造化されたサイドクエリーの場合、Qwen Code はこれらのモデルで明示的なスキーマレスポンス指示付きの自動ツール選択を使用します。強制選択をサポートするモデルはそれを保持します。自動選択はツール呼び出しを保証しません。JSON サイドクエリーは、Markdown フェンスや surrounding prose なしで、レスポンステキストから生の JSON オブジェクトを読むこともできます。[Anthropic のツール選択制限](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools#forcing-tool-use) を参照してください。

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

ほとんどのローカル推論サーバー（vLLM、Ollama、LM Studio など）は OpenAI 互換 API エンドポイントを提供しています。ローカルの`baseUrl`を使用して`openai`認証タイプで設定してください：

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
          "streamIdleTimeoutMs": 600000,
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

キューに入っている、または遅いローカル OpenAI 互換サーバーの場合、`streamIdleTimeoutMs` はこのモデルがストリーミングチャンクの間に沈黙を維持できる時間を制御します。これは選択されたプロバイダーエントリのグローバルな `QWEN_STREAM_IDLE_TIMEOUT_MS` 値を上書きします。アイドルガードを無効にするには `0` に設定します。別の 15 分のストリーム寿命上限は、`QWEN_STREAM_MAX_LIFETIME_MS` が引き上げられたり無効化されたりしない限り、依然として適用されます。

認証が必要ないローカルサーバーの場合は、API キーに任意のプレースホルダー値を使用できます：

```bash
# For Ollama (no auth required)
export OLLAMA_API_KEY="ollama"

# For vLLM (if no auth is configured)
export VLLM_API_KEY="not-needed"
```

> [!note]
>
> `extra_body`パラメータは**OpenAI 互換プロバイダーでのみサポートされています**（`openai`、`qwen-oauth`）。Anthropic および Gemini プロバイダーでは無視されます。`openai-responses`では、`enable_thinking`キーは転送されるのではなく変換されます—[OpenAI Responses API](#openai-responses-api-openai-responses)の注記を参照してください。

> [!note]
>
> **`envKey` について**: `envKey` フィールドは、実際の API キーの値ではなく、**環境変数の名前**を指定します。設定を機能させるには、対応する環境変数に実際の API キーが設定されていることを確認する必要があります。これには 2 つの方法があります。
>
> - **オプション 1: `.env` ファイルを使用する**（セキュリティ上の理由から推奨）:
>   ```bash
>   # ~/.qwen/.env (or project root)
>   OPENAI_API_KEY=sk-your-actual-key-here
>   ```
>   シークレットが誤ってコミットされないように、必ず `.env` を `.gitignore` に追加してください。
> - **オプション 2: `settings.json`内の`env`フィールドを使用する**（上記の例のように）：
>   ```json
>   {
>     "env": {
>       "OPENAI_API_KEY": "sk-your-actual-key-here"
>     }
>   }
>   ```
>
> 各プロバイダーの例には、API キーをどのように構成すべきかを示すために `env` フィールドが含まれています。

#### カスタムモデル名で提供される Qwen3.x

思考制御とコンテキストウィンドウはモデル ID から推測されます。vLLM または SGLang サーバーが `qwen` で始まらない ID（例：`--served-model-name chat`）で Qwen3.x モデルを公開している場合、どちらも適用されません。自動モードの権限分類器などのサイドリクエストでは思考がオンのままになり、コンテキストウィンドウは 200K のデフォルト値にフォールバックします。両方ともモデルエントリで宣言してください。詳細は [推論機能のオーバーライド](#override-reasoning-capabilities) を参照してください。

```json
{
  "id": "chat",
  "name": "Qwen3.6 35B A3B (vLLM)",
  "envKey": "VLLM_API_KEY",
  "baseUrl": "http://localhost:8000/v1",
  "capabilities": { "reasoning": { "profile": "qwen-chat-template" } },
  "generationConfig": { "contextWindowSize": 262144 }
}
```

`qwen-chat-template` は `chat_template_kwargs.enable_thinking` を送信し、これらのサーバーはそれを Qwen チャットテンプレートに渡します。トップレベルの `enable_thinking` フィールドは読み取られません。`contextWindowSize` をサーバーの最大モデル長に設定してください（vLLM では `/v1/models` の `max_model_len` として報告されます）。Qwen Code はすべてのリクエストでツール定義を送信するため、サーバー側でもツール呼び出しと推論パーサーの有効化が必要です。vLLM の場合は `--enable-auto-tool-choice`、モデル用の `--tool-call-parser`（例：`qwen3_xml`）、および `--reasoning-parser qwen3` を指定します。パーサー名はサーバーリリース間での変更があるため、サーバーのドキュメントを確認してください。

## Alibaba Cloud Coding Plan

Alibaba Cloud Coding Plan は、コーディングタスク用に最適化された Qwen モデルの事前設定済みセットを提供します。この機能は Alibaba Cloud Coding Plan API アクセスを持つユーザー向けに利用可能で、自動モデル設定更新による簡素化されたセットアップ体験を提供します。

### 概要

`/auth` コマンドを使用して Alibaba Cloud Coding Plan API キーで認証すると、Qwen Code は以下のモデルを自動的に構成します。

| モデル ID               | 名前                 | 説明                                               |
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

| リージョン | エンドポイント | 説明 |
| -------------------- | ----------------------------------------------- | ----------------------- |
| China                | `https://coding.dashscope.aliyuncs.com/v1`      | 中国本土エンドポイント  |
| Global/International | `https://coding-intl.dashscope.aliyuncs.com/v1` | 国際エンドポイント      |

リージョンは認証時に選択され、`settings.json` 内の `modelProviders` 構成に保存されます。リージョンを切り替えるには、`/auth` コマンドを再実行して別のリージョンを選択してください。

### API キーの保存

`/auth` コマンドを通じて Coding Plan を設定する場合、API キーは予約済みの環境変数名 `BAILIAN_CODING_PLAN_API_KEY` を使用して保存されます。デフォルトでは、`settings.json` ファイルの `env` フィールドに保存されます。

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

### 自動アップデート

Coding Plan のモデル設定にはバージョン管理が適用されます。Qwen Code がモデルテンプレートの新しいバージョンを検出した場合、更新を促すプロンプトが表示されます。更新を受け入れると、以下の操作が行われます:

- 既存の Coding Plan モデル設定を最新バージョンに置き換えます
- 手動で追加したカスタムモデル設定は保持されます
- 選択中のモデルを変更しないでください。更新後の構成に存在しない場合は、`/model` を使用して新しいモデルを選択してください

更新プロセスは、選択中のモデルを変更せずに、モデル構成と機能を更新します。

### 手動設定（上級者向け）

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

\* CLI 認証フラグが存在する場合は、設定よりも優先されます。それ以外の場合は、`security.auth.selectedType` または暗黙的なデフォルトによって認証タイプが決まります。サインインオプションについては [Authentication](./auth.md) を参照してください。レガシーな無料の Qwen OAuth プロバイダーは、[Qwen Account with Subscription](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli) とは別物です。

> [!note]
>
> `--openai-api-key` と `--openai-base-url` が唯一の認証情報 CLI フラグです。これらは、名前に関係なくアクティブな OpenAI 互換プロバイダーに適用されます。`--anthropic-*` や `--gemini-*` の認証情報フラグは存在しません。CLI で渡されないプロバイダー固有の認証情報は、環境変数から解決されます（下の行を参照）。

> [!warning]
>
> **`security.auth.apiKey` および `security.auth.baseUrl` の廃止:** `settings.json` 内の `security.auth.apiKey` および `security.auth.baseUrl` を介して API 認証情報を直接設定する方法は非推奨となりました。これらの設定は、UI から認証情報を入力していた過去のバージョンで使用されていましたが、バージョン 0.10.1 で認証情報入力フローが削除されました。これらのフィールドは将来のリリースで完全に削除される予定です。**すべてのモデルおよび認証情報の設定について、`modelProviders` への移行を強く推奨します。** 設定ファイルに認証情報をハードコードする代わりに、`modelProviders` 内で `envKey` を使用して環境変数を参照し、安全な認証情報管理を行ってください。

## 生成構成のレイヤリング: 不透過なプロバイダーレイヤー

構成の解決は厳密なレイヤリングモデルに従いますが、1 つの重要なルールがあります。**modelProvider レイヤーは不透過である**ということです。

### 仕組み

1. **modelProvider のモデルが選択されている場合**（例: `/model` コマンドでプロバイダー構成済みのモデルを選択した場合）:
   - プロバイダーからの `generationConfig` 全体が**アトミックに**適用されます
   - **プロバイダーレイヤーは完全に不透過です** — 下位のレイヤー（CLI、env、settings）は generationConfig の解決に一切関与しません
   - `modelProviders[].generationConfig` で定義されているすべてのフィールドは、プロバイダーの値を使用します
   - プロバイダーによって定義されて**いない**すべてのフィールドは `undefined` に設定されます（設定から継承されません）
   - これにより、プロバイダー設定は完全で自己完結型の「シールドパッケージ」として機能します

   モデルが `modelProviders` にリストされている場合、そのモデル固有の生成設定はすべて対応するプロバイダーエントリに配置してください。トップレベルの `model.generationConfig` の値（`contextWindowSize`、`modalities`、`customHeaders`、`extra_body` などを含む）は、プロバイダーモデルに対しては無視されます。これらのフィールドを有効にするには、`modelProviders[authType][].generationConfig` の下で設定してください。

2. **modelProvider のモデルが選択されていない場合**（例: 生のモデル ID で `--model` を使用する場合、または CLI/env/settings を直接使用する場合）:
   - 解決は下位のレイヤーにフォールスルーします
   - フィールドは CLI → env → settings → デフォルトの順で設定されます
   - これにより**ランタイムモデル**が作成されます（次のセクションを参照）

### `generationConfig` のフィールドごとの優先順位

| 優先度 | ソース                                        | 挙動                                                                                                 |
| -------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1        | プログラムによるオーバーライド                | ランタイムの `/model`、`/auth` の変更                                                                    |
| 2        | `modelProviders[authType][].generationConfig` | **不透過レイヤー** - すべての generationConfig フィールドを完全に置き換えます。下位レイヤーは関与しません |
| 3        | `settings.model.generationConfig`             | **ランタイムモデル**（プロバイダーモデルが選択されていない場合）にのみ使用されます                       |
| 4        | コンテンツジェネレーターのデフォルト          | プロバイダー固有のデフォルト（例: OpenAI と Gemini）- ランタイムモデルにのみ適用                         |

### `customHeaders` の動的値 [#dynamic-values-in-customheaders]

`customHeaders` の値にはプレースホルダー `${session_id}` を含めることができます。これは現在の Qwen Code セッション ID でリクエストごとに展開されます。安定した会話ごとの識別子を必要とするゲートウェイで使用してください。例えば、OpenCode Go は `x-opencode-session` なしのリクエストを拒否します。

```json
{
  "generationConfig": {
    "customHeaders": {
      "x-opencode-session": "${session_id}"
    }
  }
}
```

値は SDK クライアントに焼き付けられるのではなくリクエストごとに解決されるため、`/new` と `/resume` は再起動なしでローテーションできます。

⚠️ **2 つの手順が必要です。** 上記のプロバイダーエントリだけでは不十分です — プレースホルダーは、[`outboundCorrelation.allowDynamicHeaderValues`](./settings.md#outboundcorrelation) も有効にするまで機能しません。

```json
{
  "outboundCorrelation": {
    "allowDynamicHeaderValues": true
  }
}
```

有効にするまで、プレースホルダーを含む値は送信される代わりに**破棄**され、Qwen Code は起動時にヘッダー名とこの設定を記載した警告を表示します。リテラルな `${session_id}` を含むヘッダーは決して送信されません。

**1 つのヘッダーは予約されています。** QwenCloud MaaS エンドポイント — `/auth` エントリの `China — 千问AI平台` と `International — QwenCloud` — では、Qwen Code が `X-DashScope-Source-Config` を所有し、ファーストパーティの帰属値を書き込みます。その名前（大文字小文字を問わず）の下にあるエントリは、リクエスト構築前に削除されるため、其中的な `${session_id}` プレースホルダーは生き残りませんし、`allowDynamicHeaderValues` もそれを変更しません。ヘッダー自体は引き続き送信されますが、あなたの値のみが置き換えられます。同じルールが設定側から述べられているものについては [`customHeaders`](./settings.md#model) を参照してください。

スイッチは同意決定であり、値が _どこへ_ 行くかとは別物であるためグローバルです。展開された値はライブセッション状態を受信者全員に運びますが、スイッチは `${session_id}` を展開できるかどうかだけを制御します。どの設定ソースがヘッダーを提供したかを識別するものではありません。

**プライバシーに関する注意:** セッション ID は会話の存続期間中安定した識別子であるため、送信先のホストはその会話のすべてのリクエストをグループ化できます。どのホストになるかは、ヘッダーを持つプロバイダーエントリによって決まります — あなたの `baseUrl` と同期させるための個別のホストリストはありません。

### アトミック フィールドの扱い

以下のフィールドはアトミック オブジェクトとして扱われます。プロバイダーの値はオブジェクト全体を完全に置き換え、マージは行われません:

- `samplingParams` - Temperature、top_p、max_tokens など
- `customHeaders` - カスタム HTTP ヘッダー (`${session_id}` を含む場合があります。[動的な値](#dynamic-values-in-customheaders)を参照してください)
- `extra_body` - 追加のリクエストボディパラメータ

### 例

```jsonc
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

- `timeout` = 60000 (プロバイダー由来、設定を上書き)
- `samplingParams.temperature` = 0.2 (プロバイダー由来、設定オブジェクトを完全に置き換え)
- `samplingParams.max_tokens` = **undefined** (プロバイダーで定義されておらず、プロバイダー レイヤーは設定から継承しないため、指定されていない場合は明示的に undefined に設定されます)

`--model gpt-4` を介して生のモデルを使用する場合 (modelProviders 由来ではなく、Runtime Model を作成):

- `timeout` = 30000 (設定由来)
- `samplingParams.temperature` = 0.5 (設定由来)
- `samplingParams.max_tokens` = 1000 (設定由来)

`modelProviders` 自体のマージ戦略は REPLACE（置換）です。プロジェクト設定の `modelProviders` 全体が、ユーザー設定の対応するセクションをマージするのではなく上書きします。

## 推論 / thinking 構成

`generationConfig` 配下のオプション フィールド `reasoning` は、応答前にモデルがどの程度積極的に推論するかを制御します。Anthropic および Gemini コンバーターは常にこれを尊重します。OpenAI 互換パイプラインは `generationConfig.samplingParams` が設定されている場合を除き、これを尊重します。**ただし**、既知の GPT-5 モデルと GPT-6 Astra は例外です。無関係なサンプリング キーは、設定された effort を抑制しません。以下の「`samplingParams` との相互作用」を参照してください。

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
          // The effort tiers:
          //   'low'    — lightest reasoning
          //   'medium' | 'xhigh' — mapped to 'high' on DeepSeek
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

| プロトコル / プロバイダー                           | ワイヤーシェイプ                                                                               | 注釈                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **OpenAI / DashScope** (`qwen3.8-max` ファミリー) | フラットな `reasoning_effort: <effort>` ボディパラメータ | `/effort` 階層は、`qwen3.8-max` で始まるモデル ID（日付付きスナップショットや `-latest` エイリアスを含む）、招待制の `qwen-latest-series-invite-*` プレビュー、および `qwen4*` ファミリー（すべて大文字小文字を区別しない）に対して透過的に渡されます。DashScope はモデル固有のマッピングを適用します。このファミリーの段階は `xhigh` で停止するため、設定された `max` は送信されて拒否されるのではなく、`xhigh` にクランプされます（一度だけログに記録）。`samplingParams` または `extra_body` 内の明示的な `reasoning_effort` は逐語的なオーバーライドであり、クランプされません。`reasoning_effort` と `thinking_budget` が競合する場合、通常の `extra_body` > `samplingParams` > `reasoning` の優先順位により、より高い優先度のフィールドのみが保持されます。同じレイヤー内の明示的なペアの場合、プロバイダーのクロスレイヤー解決前の動作と一致するように `reasoning_effort` が保持されます。静的フィールドが勝つ場合、`/effort` は要求された階層が有効であることを示唆する代わりにそのフィールドを報告します。effort 階層が勝つ場合、競合する `enable_thinking` も破棄されます。`extra_body` 内の明示的な `enable_thinking: false` は破棄されるのではなく尊重されます。これは設定された階層を `reasoning_effort: 'none'` として上書きし、`extra_body` が逐語的に勝たない数少ない場所の一つです。他の Qwen モデルでは、選択された effort が `enable_thinking: true` にマッピングされ続けます。`reasoning_effort` オーバーライドは、`thinking_budget` と競合しない限りそこで透過的に渡されます（DashScope が拒否するペアの場合）、その場合、無効な `reasoning_effort` は破棄され、`enable_thinking` と `thinking_budget` の両方が残ります。 |
| **OpenAI / DeepSeek** (`api.deepseek.com`)    | フラットな `reasoning_effort: <effort>` ボディパラメータ | ネストされた設定形式で `reasoning.effort` が設定されている場合、フラットな `reasoning_effort` に書き換えられます。組み込みの DeepSeek モデルでは、`'low'`、`'high'` および `'max'` は透過的に渡され、`'medium'`/`'xhigh'` は `'high'` に正規化されます — DeepSeek の [effort マッピング](https://api-docs.deepseek.com/guides/thinking_mode) を反映しています。この透過性と正規化は公式エンドポイントを記述しています：MaaS およびサードパーティホストでは、正確な `deepseek-v4-pro` / `deepseek-v4-flash` ID は `high`/`max` のみを提供し（設定された `low` は `high` に引き上げられ、`xhigh` は `max` に正規化されます）、一方、新しい Flash エイリアス（`deepseek-v4.1-flash*`）は `xhigh → high` を伴って `low`/`high`/`max` を維持します。トップレベルの `samplingParams.reasoning_effort` または `extra_body.reasoning_effort` オーバーライドはこの正規化をスキップし、逐語的に送信されます。`max` は実際の DeepSeek ホスト名および任意の `deepseek-v4*` モデル ID（大文字小文字を区別せず、日付付きスナップショットを含む）で受け入れられ、これは任意の OpenAI 互換ホストで認識されます（サードパーティゲートウェイは MaaS スタイルの `enable_thinking` 契約を取得します）。別のホスト上の他の `deepseek` 名前を持つモデルは、リシェイプ自体のホスト名ゲートと一致する汎用的な `xhigh` 上限を維持します。 |
| **OpenAI / Z.ai** (`z.ai`, `bigmodel.cn`)     | フラットな `reasoning_effort: <effort>` ボディパラメータ                                         | Z.ai ホスト上の GLM-5.2+ は、`max` を含む完全な階層を受け入れ、ネストされた `reasoning.effort` はフラットフィールドに書き換えられます。古い GLM ID や、他のホストでアクセスされる `glm-*` モデルは、汎用的な `xhigh` 上限を維持します: モデル名だけでは、そのエンドポイントが何を受け入れるかは判断できません。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **OpenAI** (その他の互換サーバー)         | 既知の GPT-5 / GPT-6 Astra: フラットな `reasoning_effort`; その他のモデル: ネストされた `reasoning`     | 既知のモデルに対してサポートされているサブセットに両方向で GPT effort がクランプされます。GPT-5.6 と GPT-6 Astra は `max` を許可しますが、以前のモデルは上限が低くなります。モデルの下限以下のティアは引き上げられます: GPT-5 Pro は `high` のみを受け入れます; GPT-5.2 Pro, GPT-5.4 Pro および GPT-5.5 Pro は `low` を `medium` に引き上げます。OpenRouter はネストされた `reasoning` を保持します。不明なモデル名は汎用の `xhigh` 上限とネストされた形状を維持します。`samplingParams` / `extra_body` 内の明示的な reasoning 値は設定されたティアのクランプをバイパスします。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **OpenAI Responses** (`openai-responses`)     | `reasoning: { effort, summary: "auto" }` に加えて `include: ["reasoning.encrypted_content"]` | すべてのティアがクランプなしでそのまま通過します。明示的な `reasoning` が設定されていない場合、`extra_body.enable_thinking: true` は `reasoning: { effort: "medium" }` に変換されます（このワイヤーでは意味を持たないため、それ自体は転送されません）; `reasoning.effort` を直接設定することを推奨します。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **Anthropic**（実際の `api.anthropic.com`）      | `output_config: { effort }` に加えて `effort-2025-11-24` ベータヘッダー                     | 実際の Anthropic は `'low'`/`'medium'`/`'high'` のみを受け入れます。 `'max'` は、`debugLogger.warn` 行で **`'high'` にクランプされます**（ジェネレーターごとに一度）。最大のエフォートを希望する場合は、baseURL を対応する DeepSeek 互換エンドポイントに切り替えてください。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Anthropic** (`api.deepseek.com/anthropic`)  | 同じ `output_config: { effort }` + ベータヘッダー                                           | `'low'`、`'high'` および `'max'` は変更なしでパススルーされます。`'medium'`/`'xhigh'` は `'high'` にマッピングされ、DeepSeek のサーバー側マッピングと一致します。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **Gemini** (`@google/genai`)                  | `thinkingConfig: { includeThoughts: true, thinkingLevel }`                               | `'low'` → `LOW`、`'high'`/`'max'` → `HIGH`、その他 → `THINKING_LEVEL_UNSPECIFIED`（Gemini には `MAX` ティアがありません）。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

### `reasoning: false`

`reasoning: false`（リテラルなブール値）を設定すると、無効化をサポートするモデルでの思考（thinking）が明示的に無効になります。これは推論の恩恵を受けない安価なサイドクエリに有用です。これは一時的な呼び出し（例：提案生成）において、`request.config.thinkingConfig.includeThoughts: false` を介してリクエストレベルでも尊重されます。

`api.deepseek.com` baseURL では、OpenAI パイプラインは DeepSeek V4+ が必要とする明示的な `thinking: { type: 'disabled' }` フィールドを出力します。サーバー側のデフォルトは `'enabled'` であるため、単に `reasoning_effort` を省略しても思考レイテンシやコストが発生します。セルフホストされた DeepSeek バックエンド（sglang/vllm）やその他の OpenAI 互換サーバーはこのフィールドを**受信しません**。それらで思考を無効にする必要がある場合は、`samplingParams`/`extra_body` を介して `thinking: { type: 'disabled' }`（または推論フレームワークが公開する任意のノブ）を注入してください。任意の `deepseek-v4*` モデル ID（大文字小文字を区別しない）は例外です。サードパーティ製の OpenAI 互換ホスト上では MaaS 契約に従い、思考が無効化されている場合に `enable_thinking: false` を受信します。新たに認識されたルート（サードパーティ製ホスト、または確立されたホスト上の新しいエイリアス）では、推論プロファイルのないレガシーな `capabilities.reasoning` 宣言は独自のワイヤセマンティクスを維持します。組み込みの正規化器は動作せず、宣言されたまたは静的な努力レベルを平坦化したり再階層化したりしません。宣言では、モデルが `disableField` で読み取るノブ（`thinking`、`enable_thinking`、または `reasoning_effort`）を指定する必要があります。これを省略した宣言は機能を一切解決しないため、無効化フィールドは出力されず、サーバーのデフォルト（思考オン）が適用されます。

無効化が許可されている既知のGPTモデルの場合、OpenRouter以外のエンドポイントでは `reasoning_effort: 'none'` が渡され、OpenRouterでは代わりにネストされた `reasoning: { enabled: false }` が渡されます。必須思考（mandatory-thinking）モデルはモデルコントロールで off を拒否し、サポートされていない無効化値をリクエストから省略するため、`reasoning: false` ではそれらの思考をオフにできません。明示的なモデル推論機能は組み込みのティアリストより優先され、ネイティブの無効化フィールドを選択します。OpenRouterはプロバイダーレベルの無効化動作を維持します。組み込みの必須セットは `gpt-5`、`gpt-5-mini`、`gpt-5-nano`、`gpt-5-pro`、`gpt-5.1-codex`、`gpt-5.1-codex-max`、`gpt-5.2-codex`、`gpt-5.3-codex`、`gpt-5.2-pro`、`gpt-5.4-pro`、`gpt-5.5-pro`、および `gpt-6-astra` です。

`openrouter.ai` baseURL において、推論が無効化されている場合、OpenAIパイプラインは OpenRouter のプロバイダーレベルフィールド `reasoning: { enabled: false }` を出力します。必須思考モデルにはこの無効化フィールドは送信されません。他のOpenAI互換サーバーでは、このOpenRouter固有のフィールドは自動的に送信されないため、それぞれのネイティブな無効化設定を使用してください。

### `samplingParams` との相互作用（OpenAI 互換のみ）

> [!warning]
>
> 既知のGPTモデルと明示的な推論機能を持つモデルを除き、OpenAI互換プロバイダーで `generationConfig.samplingParams` が設定されている場合、パイプラインはこれらのキーを **そのまま** ワイヤに送信し、個別の `reasoning` インジェクションを完全にスキップします。したがって、`{ samplingParams: { temperature: 0.5 }, reasoning: { effort: 'max' } }` のような設定では、OpenAI/DeepSeekリクエストで推論フィールドが黙って破棄されます。`samplingParams` 内に配置された `reasoning` オブジェクトはユーザー自身の値であり、推論が有効な間は変更されずに送信されます。上記のeffort上限は、パイプラインが `/effort` から注入するティアにのみ適用されます。
>
> 既知のGPT-5モデルとGPT-6 Astraは、関連のないサンプリングキーとともに設定されたeffortを保持します。例えば、`{ samplingParams: { temperature: 0.5 }, reasoning: { effort: 'max' } }` は GPT-5.4 で `temperature: 0.5` とフラットな `reasoning_effort: 'xhigh'` を送信するか、GPT-5.6 / GPT-6 Astra で `'max'` を送信します。`openrouter.ai` baseURL では、同じクランプされたティアが代わりにネストされた `reasoning: { effort }` として送信されます。OpenRouter以外のエンドポイントでは、明示的なフラットな推論オーバーライドが優先されます。nullishまたは空文字列のフラットプレースホルダーは、設定されたティアを許可します。OpenRouterでは、サンプリングのフラットオーバーライドは、明示的なモデル機能によって注入されない限り、設定されたネストされたeffortを抑制します。extra-bodyのみのフラットオーバーライドは、設定されたネストされたeffortを置き換えません。
>
> DashScope Qwenモデルも別の例外です。これらのプロバイダーは `reasoning` を直接読み取り、`reasoning_effort` または `enable_thinking` にマッピングします。ティア付きeffortファミリー（`qwen3.8-max`、`qwen-latest-series-invite-*`、`qwen4*`）では、ワイヤパラメータが競合する場合、プロバイダー固有の `samplingParams` フィールドが依然として優先されます。古いqwenハイブリッドでは、設定されたeffortティアは `enable_thinking: true` に縮退し、これは `samplingParams.enable_thinking` の値を上書きします。
>
> 他のモデルでは、`samplingParams` を使用する際にプロバイダーの推論設定を直接含めてください。DeepSeekの場合は `samplingParams.reasoning_effort` です。既知のGPTモデルは設定されたeffortを自動的にマッピングするため、そのマッピングを意図的にバイパスする場合のみ生のオーバーライドを追加してください。推論が有効な間、`null` を含む生のネストされた `reasoning` はオブジェクト全体のオーバーライドとして残ります。`reasoning: false` またはリクエストレベルの `includeThoughts: false` による無効化は、どちらのレイヤーにある生のオーバーライドも含め、ネストされた値を削除します。その後、OpenRouter以外のGPTリクエストでは、無効化が許可されている場合に `reasoning_effort: 'none'` を送信します。OpenRouterは代わりにネストされた無効化フィールドを使用します。必須思考モデルにはいずれの代替も送信されません。OpenRouter以外ではその意味はゲートウェイに依存するため、モデルコントロールはモデルのデフォルトを表示します。設定されたティアをブロックする生のオーバーライドが存在する場合、明示的なティア変更は設定を保存せずに失敗します。思考スイッチは、無効化後に思考を許可する場合にのみ、設定された生のデフォルトを復元します。生の状態または設定された推論デフォルトがoffの場合、思考スイッチはオンにできず、保存された設定は保持されます。これは、明示的な機能がデフォルトティアを省略する場合や、思考トグルのみを公開する場合にも適用されます。明示的なデフォルトコマンドは依然として設定をリセットします。異なるティアを選択するには、ブロックしている生のオーバーライドを削除してください。
>
> AnthropicおよびGeminiコンバーターは影響を受けません。これらは常に `samplingParams` に関係なく `reasoning.effort` を直接読み取ります。

### `budget_tokens`

`effort` とともに `budget_tokens` を含めることで、正確な思考トークン予算を固定できます:

```jsonc
"reasoning": { "effort": "high", "budget_tokens": 50000 }
```

Anthropic の場合、これは `thinking.budget_tokens` になります。OpenAI/DeepSeek の場合、フィールドは保持されますが、現在はサーバー側で無視されます。`reasoning_effort` が実際に機能する設定となります。

## Provider Models と Runtime Models

Qwen Code は、2種類のモデル設定を区別しています。

### プロバイダーモデル

- `modelProviders` 設定で定義される
- 完全でアトミックな設定パッケージを持つ
- 選択されると、その設定は透過性のないレイヤーとして適用される
- 完全なメタデータ（名前、説明、機能）と共に `/model` コマンドリストに表示される
- 複数モデルのワークフローやチーム間の一貫性維持に推奨

### ランタイムモデル

- CLI（`--model`）、環境変数、または設定経由でローモデル ID を使用する場合に動的に作成される
- `modelProviders` で定義されていません
- 設定は解決レイヤー（CLI → env → settings → defaults）を通じた「投影」によって構築されます
- 完全な設定が検出されると、**RuntimeModelSnapshot** として自動的にキャプチャされます
- 認証情報を再入力せずに再利用できます

### RuntimeModelSnapshotのライフサイクル

`modelProviders` を使用せずにモデルを設定すると、Qwen Codeは設定を保持するために RuntimeModelSnapshot を自動的に作成します:

```bash
# This creates a RuntimeModelSnapshot with ID: $runtime|openai|my-custom-model
qwen --auth-type openai --model my-custom-model --openai-api-key $KEY --openai-base-url https://api.example.com/v1
```

スナップショット:

- モデル ID、API キー、ベース URL、および生成設定をキャプチャします
- セッション間で永続化されます（実行中はメモリに保存されます）
- `/model` コマンドリストにランタイムオプションとして表示されます
- `/model $runtime|openai|my-custom-model` を使用して切り替えることができる

### 主な違い

| 項目 | Provider Model | Runtime Model |
| ----------------------- | --------------------------------- | ------------------------------------------ |
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
> 可能な限りユーザースコープの `~/.qwen/settings.json` に `modelProviders` を定義し、あらゆるスコープで認証情報のオーバーライドを永続化しないでください。プロバイダーカタログをユーザー設定に保持することで、プロジェクトスコープとユーザースコープ間のマージ/オーバーライド競合を防ぎ、`/auth` および `/model` の更新が一貫したスコープに書き戻されることを保証します。

- `/model` と `/auth` は、`modelProviders` が既に定義されている最も近い書き込み可能なスコープに `model.name`（該当する場合）と `security.auth.selectedType` を永続化します。それ以外の場合はユーザースコープにフォールバックします。これにより、ワークスペース/ユーザーファイルがアクティブなプロバイダーカタログと同期された状態に保たれます。
- `modelProviders` がない場合、リゾルバーは CLI/env/settings の各レイヤーを混在させて Runtime Models を作成します。これは単一プロバイダーのセットアップでは問題ありませんが、頻繁に切り替える場合は煩雑です。複数モデルのワークフローが一般的である場合は、常にプロバイダーカタログを定義し、切り替えがアトミックで、ソースが追跡可能かつデバッグ可能になるようにしてください。
