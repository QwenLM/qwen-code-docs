# カスタム API Key 認証ウィザード PRD

## 概要

`/auth -> API Key -> Custom API Key` のエクスペリエンスを改善するため、現在のドキュメント表示のみの画面を、カスタム API プロバイダー向けのターミナル内セットアップウィザードに置き換えます。

Qwen Code は `authType` / `modelProviders` キーを通じて `openai`、`anthropic`、`gemini` を含む複数の API プロトコルをサポートしています。そのため、カスタムセットアップウィザードはまずユーザーにプロトコルの選択を促し、そのプロトコルに対応するエンドポイント・キー・モデル情報を収集する必要があります。

ウィザードは以下の流れでユーザーを案内します：

```text
Select Protocol -> Enter Base URL -> Enter API Key -> Enter Model IDs -> Review JSON -> Save + authenticate
```

これにより、カスタム API キーのセットアップを Qwen Code 内で完結させ、`settings.json` の手動編集の手間を削減し、保存前に生成された JSON を表示することで最終的な設定を透明化します。

## 背景

現在、`/auth` で `Custom API Key` を選択すると、静的な情報画面が表示されます：

```text
Custom Configuration

You can configure your API key and models in settings.json

Refer to the documentation for setup instructions
https://qwenlm.github.io/qwen-code-docs/en/users/configuration/model-providers/

Esc to go back
```

この方式では、ユーザーが CLI を離れてドキュメントを読み、`settings.json` を理解し、`modelProviders` を手動で設定し、`envKey` を選択し、API キーを追加してから Qwen Code に戻る必要があります。このフローは難しく、`/auth` の他の体験から切り離されているというフィードバックが多く寄せられています。

現在の ModelStudio 標準 API キーパスはすでにガイド付きセットアップフローを提供しています：

```text
Alibaba Cloud ModelStudio Standard API Key
└─ Select Region
   └─ Enter API Key
      └─ Enter Model IDs
         └─ Save + authenticate
```

カスタム API キーのセットアップも同様のガイド付き体験を提供しながら、Qwen Code が複数のプロバイダープロトコルをサポートしていることを考慮する必要があります。

## 問題の定義

カスタム API キーパスは現在 `/auth` 内の行き止まりになっています：

```text
/auth
└─ Select Authentication Method
   ├─ Alibaba Cloud Coding Plan
   ├─ API Key
   │  └─ Select API Key Type
   │     ├─ Alibaba Cloud ModelStudio Standard API Key
   │     │  ├─ Select Region
   │     │  ├─ Enter API Key
   │     │  ├─ Enter Model IDs
   │     │  └─ Save + authenticate
   │     │
   │     └─ Custom API Key
   │        └─ Documentation-only screen
   │
   └─ Qwen OAuth
```

これにより、いくつかのユーザビリティの問題が生じています：

- `/auth` からカスタムプロバイダーのセットアップを完了できない。
- 認証を行う前に、低レベルの設定概念を理解する必要がある。
- 必須フィールド（`authType`、`baseUrl`、`envKey`、`modelProviders`、`model.name`、`security.auth.selectedType`）を把握していない場合がある。
- 既存の環境変数と競合したり、既存のプロバイダー設定を上書きしてしまう可能性がある。
- 設定を手動編集した後、認証の即時フィードバックが得られない。

## 目標

1. `/auth` 内でカスタム API プロバイダーを完全に設定できるようにする。
2. `modelProviders` で Qwen Code がサポートする主要プロトコル（`openai`、`anthropic`、`gemini`）をサポートする。
3. 既存の ModelStudio 標準フローに近い形を維持する。
4. `baseUrl` をカスタムプロバイダーにおける `region` 相当として扱う。
5. 選択されたプロトコルと入力された `baseUrl` から Qwen 管理のプライベート `envKey` を自動生成する。
6. 既存の Qwen 管理認証情報パターンに合わせ、API キーを `settings.json.env` に保存する。
7. Qwen 固有の生成キー名を使用することで、ユーザーのシェル環境変数との競合を回避する。
8. 保存前に生成された JSON を表示し、ユーザーが設定変更内容を確認できるようにする。
9. 既存の関係ない `modelProviders` エントリを保持する。
10. 保存直後に認証を行い、成功または失敗のフィードバックを表示する。

## 対象外

1. ユーザーに `envKey` を手動入力させない。
2. プロバイダー名を別概念として導入しない。
3. ウィザードに高度な `generationConfig`、`capabilities`、またはモデルごとのオーバーライドを追加しない。
4. ドキュメントリンクを完全に削除しない（高度な設定向けに引き続き提供する）。
5. 既存の Coding Plan や ModelStudio 標準 API キーフローを変更しない。
6. 初回バージョンでは `baseUrl` からプロトコルを自動検出しない（ユーザーがプロトコルを明示的に選択する）。

## 対象ユーザー

- 独自のカスタム API エンドポイントを利用するユーザー。
- OpenAI 互換 API、Anthropic 互換 API、Gemini 互換 API、vLLM、Ollama、LM Studio、または内部ゲートウェイなどのプロバイダーを設定するユーザー。
- `settings.json` を手動編集するよりも CLI から認証を設定したいユーザー。

## サポートするプロトコル

ウィザードは最初に以下のプロトコルオプションを提供します：

```text
openai
anthropic
gemini
```

各プロトコルは `modelProviders` キーおよび `security.auth.selectedType` の値に直接対応します。

| プロトコルオプション | Auth type / modelProviders キー | 備考 |
| -------------------- | ------------------------------ | --------------------------------------------------------------------------------- |
| OpenAI-compatible    | `openai`                       | OpenAI、OpenRouter、Fireworks、ローカル OpenAI 互換サーバー、内部ゲートウェイ |
| Anthropic-compatible | `anthropic`                    | Anthropic 互換エンドポイント |
| Gemini-compatible    | `gemini`                       | Gemini 互換エンドポイント |

## ユーザーエクスペリエンス概要

### 更新後の `/auth` ツリー

```text
/auth
└─ Select Authentication Method
   ├─ Alibaba Cloud Coding Plan
   │  └─ Select Region
   │     └─ Enter API Key
   │        └─ Save + authenticate
   │
   ├─ API Key
   │  └─ Select API Key Type
   │     ├─ Alibaba Cloud ModelStudio Standard API Key
   │     │  ├─ Select Region
   │     │  ├─ Enter API Key
   │     │  ├─ Enter Model IDs
   │     │  └─ Save + authenticate
   │     │
   │     └─ Custom API Key
   │        ├─ Select Protocol
   │        ├─ Enter Base URL
   │        ├─ Enter API Key
   │        ├─ Enter Model IDs
   │        ├─ Review generated JSON
   │        └─ Save + authenticate
   │
   └─ Qwen OAuth
```

### カスタム API Key ステートマシン

```text
api-key-type-select
  │
  └─ CUSTOM_API_KEY
      │
      ▼
custom-protocol-select
      │ Enter
      ▼
custom-base-url-input
      │ Enter
      │ generate envKey from protocol + baseUrl
      ▼
custom-api-key-input
      │ Enter
      ▼
custom-model-id-input
      │ Enter
      ▼
custom-review-json
      │ Enter
      ▼
save settings + refreshAuth(selectedProtocol)
```

### Esc の動作

```text
custom-review-json
  Esc -> custom-model-id-input

custom-model-id-input
  Esc -> custom-api-key-input

custom-api-key-input
  Esc -> custom-base-url-input

custom-base-url-input
  Esc -> custom-protocol-select

custom-protocol-select
  Esc -> api-key-type-select
```

## 詳細インタラクションデザイン

### ステップ 1: プロトコルの選択

```text
┌──────────────────────────────────────────────────────────────┐
│ Custom API Key · Select Protocol                             │
│                                                              │
│  ◉ OpenAI-compatible                                         │
│    OpenAI, OpenRouter, Fireworks, vLLM, Ollama, LM Studio    │
│                                                              │
│  ○ Anthropic-compatible                                      │
│    Anthropic-compatible endpoints                            │
│                                                              │
│  ○ Gemini-compatible                                         │
│    Gemini-compatible endpoints                               │
│                                                              │
│ Enter to select, ↑↓ to navigate, Esc to go back              │
└──────────────────────────────────────────────────────────────┘
```

選択されたプロトコルによって以下が決まります：

- 更新する `modelProviders` キー。
- 永続化する `security.auth.selectedType` の値。
- 後続の画面に表示されるプロトコルラベル。
- 保存後に使用する `refreshAuth()` の認証タイプ。

### ステップ 2: Base URL の入力

`baseUrl` はカスタムプロバイダーにおけるリージョン選択の相当物です。どのエンドポイントに API キーが属するかを決定するため、API キー入力より前に来る必要があります。

OpenAI 互換の場合：

```text
┌──────────────────────────────────────────────────────────────┐
│ Custom API Key · Base URL                                    │
│                                                              │
│ Protocol: OpenAI-compatible                                  │
│                                                              │
│ Enter the OpenAI-compatible API endpoint.                    │
│                                                              │
│ Base URL: https://openrouter.ai/api/v1_                      │
│                                                              │
│ Examples:                                                    │
│   OpenAI:      https://api.openai.com/v1                     │
│   OpenRouter: https://openrouter.ai/api/v1                   │
│   Fireworks:  https://api.fireworks.ai/inference/v1          │
│   Ollama:     http://localhost:11434/v1                      │
│   LM Studio:  http://localhost:1234/v1                       │
│                                                              │
│ Enter to continue, Esc to go back                            │
└──────────────────────────────────────────────────────────────┘
```

Anthropic 互換の場合：

```text
┌──────────────────────────────────────────────────────────────┐
│ Custom API Key · Base URL                                    │
│                                                              │
│ Protocol: Anthropic-compatible                               │
│                                                              │
│ Enter the Anthropic-compatible API endpoint.                 │
│                                                              │
│ Base URL: https://api.anthropic.com/v1_                      │
│                                                              │
│ Enter to continue, Esc to go back                            │
└──────────────────────────────────────────────────────────────┘
```

Gemini 互換の場合：

```text
┌──────────────────────────────────────────────────────────────┐
│ Custom API Key · Base URL                                    │
│                                                              │
│ Protocol: Gemini-compatible                                  │
│                                                              │
│ Enter the Gemini-compatible API endpoint.                    │
│                                                              │
│ Base URL: https://generativelanguage.googleapis.com_         │
│                                                              │
│ Enter to continue, Esc to go back                            │
└──────────────────────────────────────────────────────────────┘
```

バリデーション：

- 必須項目。
- `http://` または `https://` で始まる必要がある。
- 先頭と末尾の空白をトリムする。
- トリム以外は入力された文字列をそのまま保持する。

有効な送信時：

- 選択されたプロトコルと `baseUrl` から Qwen 管理の `envKey` を生成する。
- API キー入力に移動する。

### ステップ 3: API Key の入力

```text
┌──────────────────────────────────────────────────────────────┐
│ Custom API Key · API Key                                     │
│                                                              │
│ Protocol: OpenAI-compatible                                  │
│ Endpoint: https://openrouter.ai/api/v1                       │
│                                                              │
│ Enter the API key for this endpoint.                         │
│                                                              │
│ API key: sk-or-v1-••••••••••••••••_                          │
│                                                              │
│ Enter to continue, Esc to go back                            │
└──────────────────────────────────────────────────────────────┘
```

バリデーション：

- 必須項目。
- 先頭と末尾の空白をトリムする。

注意事項：

- 入力は近接するフローとの一貫性のため、既存のテキスト入力動作を使用する場合があります。
- レビュー画面では API キーをマスクする必要があります。

### ステップ 4: モデル ID の入力

```text
┌──────────────────────────────────────────────────────────────┐
│ Custom API Key · Model IDs                                   │
│                                                              │
│ Protocol: OpenAI-compatible                                  │
│ Endpoint: https://openrouter.ai/api/v1                       │
│                                                              │
│ Enter one or more model IDs, separated by commas.            │
│                                                              │
│ Model IDs: qwen/qwen3-coder,openai/gpt-4.1_                  │
│                                                              │
│ Enter to continue, Esc to go back                            │
└──────────────────────────────────────────────────────────────┘
```

バリデーション：

- 必須項目。
- カンマで分割する。
- 各モデル ID をトリムする。
- 空のエントリを除外する。
- 順序を保持しながら重複を排除する。
- 少なくとも 1 つのモデル ID が残る必要がある。

モデルの命名：

- `id` と `name` は同一にする。
- ユーザーにプロバイダー名は要求しない。

例：

```text
Input:
qwen/qwen3-coder, openai/gpt-4.1, qwen/qwen3-coder

Normalized:
qwen/qwen3-coder, openai/gpt-4.1
```

### ステップ 5: JSON のレビュー

保存前に、`settings.json` に書き込まれる（またはマージされる）生成された JSON スニペットを表示します。

OpenAI 互換の例：

```text
┌──────────────────────────────────────────────────────────────┐
│ Custom API Key · Review                                      │
│                                                              │
│ The following JSON will be saved to settings.json:           │
│                                                              │
│ {                                                            │
│   "env": {                                                   │
│     "QWEN_CUSTOM_API_KEY_OPENAI_HTTPS_OPENROUTER_AI_API_V1":│
│       "sk-••••••••••••••••"                                  │
│   },                                                         │
│   "modelProviders": {                                        │
│     "openai": [                                              │
│       {                                                      │
│         "id": "qwen/qwen3-coder",                           │
│         "name": "qwen/qwen3-coder",                         │
│         "baseUrl": "https://openrouter.ai/api/v1",          │
│         "envKey": "QWEN_CUSTOM_API_KEY_OPENAI_HTTPS_OPENROUTER_AI_API_V1"│
│       }                                                      │
│     ]                                                        │
│   },                                                         │
│   "security": {                                              │
│     "auth": {                                                │
│       "selectedType": "openai"                              │
│     }                                                        │
│   },                                                         │
│   "model": {                                                 │
│     "name": "qwen/qwen3-coder"                              │
│   }                                                          │
│ }                                                            │
│                                                              │
│ Enter to save, Esc to go back                                │
└──────────────────────────────────────────────────────────────┘
```

Anthropic 互換の例：

```json
{
  "env": {
    "QWEN_CUSTOM_API_KEY_ANTHROPIC_HTTPS_API_ANTHROPIC_COM_V1": "sk-••••"
  },
  "modelProviders": {
    "anthropic": [
      {
        "id": "claude-sonnet-4-5",
        "name": "claude-sonnet-4-5",
        "baseUrl": "https://api.anthropic.com/v1",
        "envKey": "QWEN_CUSTOM_API_KEY_ANTHROPIC_HTTPS_API_ANTHROPIC_COM_V1"
      }
    ]
  },
  "security": {
    "auth": {
      "selectedType": "anthropic"
    }
  },
  "model": {
    "name": "claude-sonnet-4-5"
  }
}
```

表示される JSON は以下の条件を満たす必要があります：

- 選択されたプロトコルを `modelProviders` キーとして使用する。
- 選択されたプロトコルを `security.auth.selectedType` として使用する。
- 実際に生成された `envKey` を使用する。
- API キーをマスクする。
- ユーザーが入力した `baseUrl` を使用する。
- 各モデルに `id === name` を使用する。
- `model.name` を最初の正規化されたモデル ID に設定して表示する。

JSON が現在のターミナルの幅に収まらない場合、折り返しは許容されます。目的は透明性の確保であり、コピー＆ペースト用の完璧なフォーマットではありません。

### ステップ 6: 保存と認証

レビュー画面で Enter を押した場合：

```text
save:
  env[generatedEnvKey] = apiKey
  modelProviders[selectedProtocol] = [
    ...new custom configs using generatedEnvKey,
    ...existing configs whose envKey !== generatedEnvKey
  ]
  security.auth.selectedType = selectedProtocol
  model.name = firstModelId
  reloadModelProvidersConfig()
  refreshAuth(selectedProtocol)
```

成功メッセージ：

```text
Custom API Key authenticated successfully. Settings updated with generated env key and model provider config.
Tip: Use /model to switch between configured models.
```

失敗メッセージは既存の認証失敗パターンを踏襲しつつ、可能であればユーザー向けのヒントを追加します：

```text
Failed to authenticate. Message: <error>

Please check:
- Base URL is compatible with the selected protocol
- API key is valid for this endpoint
- Model ID exists for this provider
```

## Env Key の生成

ウィザードではユーザーに `envKey` を入力させません。

Qwen 管理の API キーは `settings.json.env` に保存されるため、env キーは Qwen 固有の名前空間のもとで自動生成する必要があります。これにより、ユーザーが管理するシェル環境変数との競合を回避し、複数のカスタムエンドポイントが互いを上書きしないようにします。

### フォーマット

```text
QWEN_CUSTOM_API_KEY_${PROTOCOL}_${NORMALIZED_BASE_URL}
```

プロトコルを含めることで、同じエンドポイントを異なるプロトコルアダプターで使用した場合の競合を防ぎます。

### 例

```text
Protocol: openai
Base URL: https://api.openai.com/v1
-> QWEN_CUSTOM_API_KEY_OPENAI_HTTPS_API_OPENAI_COM_V1

Protocol: openai
Base URL: https://openrouter.ai/api/v1
-> QWEN_CUSTOM_API_KEY_OPENAI_HTTPS_OPENROUTER_AI_API_V1

Protocol: anthropic
Base URL: https://api.anthropic.com/v1
-> QWEN_CUSTOM_API_KEY_ANTHROPIC_HTTPS_API_ANTHROPIC_COM_V1

Protocol: gemini
Base URL: https://generativelanguage.googleapis.com
-> QWEN_CUSTOM_API_KEY_GEMINI_HTTPS_GENERATIVELANGUAGE_GOOGLEAPIS_COM

Protocol: openai
Base URL: http://localhost:11434/v1
-> QWEN_CUSTOM_API_KEY_OPENAI_HTTP_LOCALHOST_11434_V1
```

### 正規化ルール

```text
protocol
  -> trim
  -> uppercase
  -> replace every non A-Z / 0-9 character with _

baseUrl
  -> trim
  -> uppercase
  -> replace every non A-Z / 0-9 character with _
  -> collapse consecutive _ characters
  -> remove leading/trailing _

return QWEN_CUSTOM_API_KEY_${NORMALIZED_PROTOCOL}_${NORMALIZED_BASE_URL}
```

擬似コード：

```ts
function generateCustomApiKeyEnvKey(protocol: string, baseUrl: string): string {
  const normalize = (value: string) =>
    value
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');

  return `QWEN_CUSTOM_API_KEY_${normalize(protocol)}_${normalize(baseUrl)}`;
}
```

## 設定書き込みの設計

ユーザーが以下を入力した場合：

```text
Protocol: openai
Base URL: https://openrouter.ai/api/v1
API key: sk-or-v1-xxx
Model IDs: qwen/qwen3-coder,openai/gpt-4.1
```

ウィザードは以下を生成します：

```json
{
  "env": {
    "QWEN_CUSTOM_API_KEY_OPENAI_HTTPS_OPENROUTER_AI_API_V1": "sk-or-v1-xxx"
  },
  "modelProviders": {
    "openai": [
      {
        "id": "qwen/qwen3-coder",
        "name": "qwen/qwen3-coder",
        "baseUrl": "https://openrouter.ai/api/v1",
        "envKey": "QWEN_CUSTOM_API_KEY_OPENAI_HTTPS_OPENROUTER_AI_API_V1"
      },
      {
        "id": "openai/gpt-4.1",
        "name": "openai/gpt-4.1",
        "baseUrl": "https://openrouter.ai/api/v1",
        "envKey": "QWEN_CUSTOM_API_KEY_OPENAI_HTTPS_OPENROUTER_AI_API_V1"
      }
    ]
  },
  "security": {
    "auth": {
      "selectedType": "openai"
    }
  },
  "model": {
    "name": "qwen/qwen3-coder"
  }
}
```

`anthropic` の場合、同じ構造で以下が異なります：

```text
modelProviders.anthropic
security.auth.selectedType = anthropic
refreshAuth(anthropic)
```

`gemini` の場合、同じ構造で以下が異なります：

```text
modelProviders.gemini
security.auth.selectedType = gemini
refreshAuth(gemini)
```

### 永続化スコープ

モデル選択および既存の API キーフローと同じ永続化スコープ戦略を使用します：

```text
getPersistScopeForModelSelection(settings)
```

これにより、既存の `modelProviders` の所有ルールと一貫した動作を維持します。

### バックアップ

書き込み前に、既存の Coding Plan および ModelStudio 標準フローと同様に対象の設定ファイルをバックアップします。

### プロセス env の同期

`settings.json.env[generatedEnvKey]` への書き込み後、即座に同期します：

```text
process.env[generatedEnvKey] = apiKey
```

これにより、同じセッション内で `refreshAuth(selectedProtocol)` が新しく入力されたキーを使用できるようになります。

### モデルプロバイダーのマージルール

生成された env キー：

```text
generatedEnvKey = QWEN_CUSTOM_API_KEY_${PROTOCOL}_${NORMALIZED_BASE_URL}
```

`modelProviders[selectedProtocol]` を以下のように更新します：

```text
newConfigs = normalizedModelIds.map(modelId => ({
  id: modelId,
  name: modelId,
  baseUrl,
  envKey: generatedEnvKey,
}))

existingConfigs = settings.merged.modelProviders?.[selectedProtocol] ?? []

preservedConfigs = existingConfigs.filter(config =>
  config.envKey !== generatedEnvKey
)

updatedConfigs = [
  ...newConfigs,
  ...preservedConfigs,
]
```

設計の理由：

- 同じプロトコル + `baseUrl` を再設定した場合、そのエンドポイントの古いモデルが置き換えられます。
- 異なるプロトコルまたは `baseUrl` を設定した場合、異なる env キーが使用され、既存のカスタムエンドポイントは上書きされません。
- Coding Plan、ModelStudio 標準、およびその他のユーザー設定は、同じプロトコル配下で同じ生成 env キーを使用しない限り保持されます。
- 新しい設定が先頭に配置されるため、新たに設定されたモデルがすぐに表示され、デフォルトで選択されます。

## エラーハンドリング

### プロトコルのバリデーションエラー

プロトコルは以下のいずれかである必要があります：

```text
openai
anthropic
gemini
```

### Base URL のバリデーションエラー

```text
Base URL cannot be empty.
```

```text
Base URL must start with http:// or https://.
```

### API キーのバリデーションエラー

```text
API key cannot be empty.
```

### モデル ID のバリデーションエラー

```text
Model IDs cannot be empty.
```

### 認証失敗

可能な限り既存の失敗メカニズムを使用しますが、ユーザー向けのエラーメッセージで復旧を支援します：

```text
Failed to authenticate. Message: <message>

Please check:
- Base URL is compatible with the selected protocol
- API key is valid for this endpoint
- Model ID exists for this provider
```

## ドキュメントリンク

ウィザードは高度なユーザー向けに既存のモデルプロバイダードキュメントへのリンクを引き続き提供します。

推奨配置：

- レビュー画面のフッター、または
- Base URL 画面のサブテキスト。

推奨テキスト：

```text
Need advanced generationConfig or capabilities? See:
https://qwenlm.github.io/qwen-code-docs/en/users/configuration/model-providers/
```

## 実装メモ

`AuthDialog` で想定される view levels：

```ts
type ViewLevel =
  | 'main'
  | 'region-select'
  | 'api-key-input'
  | 'api-key-type-select'
  | 'alibaba-standard-region-select'
  | 'alibaba-standard-api-key-input'
  | 'alibaba-standard-model-id-input'
  | 'custom-protocol-select'
  | 'custom-base-url-input'
  | 'custom-api-key-input'
  | 'custom-model-id-input'
  | 'custom-review-json';
```

想定されるカスタムプロトコル型：

```ts
type CustomApiProtocol =
  | AuthType.USE_OPENAI
  | AuthType.USE_ANTHROPIC
  | AuthType.USE_GEMINI;
```

`AuthDialog` で想定される新しい state：

```ts
const [customProtocol, setCustomProtocol] = useState<CustomApiProtocol>(
  AuthType.USE_OPENAI,
);
const [customProtocolIndex, setCustomProtocolIndex] = useState<number>(0);
const [customBaseUrl, setCustomBaseUrl] = useState('');
const [customBaseUrlError, setCustomBaseUrlError] = useState<string | null>(
  null,
);
const [customApiKey, setCustomApiKey] = useState('');
const [customApiKeyError, setCustomApiKeyError] = useState<string | null>(null);
const [customModelIds, setCustomModelIds] = useState('');
const [customModelIdsError, setCustomModelIdsError] = useState<string | null>(
  null,
);
```

想定される新しい UI アクション：

```ts
handleCustomApiKeySubmit: (
  protocol: CustomApiProtocol,
  baseUrl: string,
  apiKey: string,
  modelIdsInput: string,
) => Promise<void>;
```

想定されるヘルパー関数：

```ts
generateCustomApiKeyEnvKey(protocol: string, baseUrl: string): string
normalizeCustomModelIds(modelIdsInput: string): string[]
maskApiKey(apiKey: string): string
```

## 受け入れ基準

### UX

- `/auth -> API Key -> Custom API Key` を選択すると、ドキュメント表示のみのページではなくカスタムウィザードが開く。
- カスタムウィザードの最初のステップでプロトコルを尋ねる。
- 2 番目のステップで Base URL を尋ね、選択されたプロトコルを表示する。
- 3 番目のステップで API キーを尋ね、選択されたプロトコルとエンドポイントを表示する。
- 4 番目のステップでモデル ID を尋ね、選択されたプロトコルとエンドポイントを表示する。
- レビューステップでマスクされた API キー、選択されたプロトコル、生成された env キーを含む生成 JSON を表示する。
- レビューステップで Enter を押すと設定が保存され、認証が試みられる。
- Esc を押すと 1 ステップずつ前に戻る。

### 設定

- API キーが `settings.json.env[generatedEnvKey]` に書き込まれる。
- `generatedEnvKey` が Qwen プライベート名前空間を使用して選択されたプロトコルと `baseUrl` から導出される。
- `modelProviders[selectedProtocol]` が正規化された各モデル ID に対して 1 つのエントリを受け取る。
- 各カスタムモデルエントリが `id === name` を使用する。
- `security.auth.selectedType` が選択されたプロトコルに設定される。
- `model.name` が最初の正規化されたモデル ID に設定される。
- `modelProviders[selectedProtocol]` 配下の異なる `envKey` を持つ既存エントリが保持される。
- `modelProviders[selectedProtocol]` 配下の同じ生成 `envKey` を持つ既存エントリが置き換えられる。
- 他の `modelProviders` プロトコルキー配下のエントリが保持される。

### 認証

- 生成された env キーが認証リフレッシュ前に `process.env` に同期される。
- `refreshAuth(selectedProtocol)` の前にアプリがモデルプロバイダー設定を再読み込みする。
- 認証成功時に認証ダイアログが閉じ、成功メッセージが表示される。
- 認証失敗時にユーザーが認証フローに留まり、実行可能なエラーが表示される。

### テスト

- カスタムウィザードパスをカバーするよう `AuthDialog` テストを追加または更新する。
- プロトコル選択のテストを追加する。
- プロトコルと Base URL からの env キー生成のテストを追加する。
- モデル ID の正規化と重複排除のテストを追加する。
- 設定マージ動作のテストを追加する：
  - 同じ生成 env キーが同じプロトコル配下の古いカスタムエントリを置き換える；
  - 異なる env キーが保持される；
  - 他のプロトコルキーが保持される；
  - Coding Plan および ModelStudio 標準エントリが保持される。
- 実用的な範囲で生成 JSON プレビューの内容のテストを追加する。

## 未解決の問題

1. API キー入力は入力中にマスクすべきか、それともレビュー画面でのみマスクすべきか？
2. `http://localhost:11434/v1` のようなローカルエンドポイントについて、認証を必要としないサーバー向けに空またはプレースホルダーの API キーを許可すべきか？
3. 生成 JSON プレビューは適用されるパッチのみを表示すべきか、それともマージ後の関連する設定サブツリー全体を表示すべきか？
4. Vertex AI はこのカスタム API キーウィザードに含めるべきか、それとも単純な API キープロバイダーとは異なる認証セットアップを持つため除外すべきか？

初回バージョンの推奨デフォルト：

- `openai`、`anthropic`、`gemini` をサポートする。
- 入力中は既存の入力動作を使用する。
- API キー認証フローとの一貫性のため、空でない API キーを要求する。
- 保存または更新されるパッチスタイルの JSON を表示する。
- 別途製品判断が行われるまで Vertex AI はカスタム API キーウィザードから除外する。
