# カスタムAPIキー認証ウィザードPRD

## 概要

`/auth -> API Key -> Custom API Key` のエクスペリエンスを改善し、現在のドキュメントのみの画面を、カスタムAPIプロバイダ向けのターミナル内セットアップウィザードに置き換えます。

Qwen Codeは `authType` / `modelProviders` キーを通じて、`openai`、`anthropic`、`gemini` など複数のAPIプロトコルをサポートしています。そのため、カスタムセットアップウィザードでは、まずユーザーにプロトコルを選択させ、その後エンドポイント、キー、モデル情報を収集します。

ウィザードは以下の手順でユーザーを導きます：

```text
プロトコル選択 -> ベースURL入力 -> APIキー入力 -> モデルID入力 -> JSON確認 -> 保存 + 認証
```

これにより、カスタムAPIキーのセットアップをQwen Code内で完結させ、`settings.json` を手動で編集する必要性を減らし、保存前に生成されたJSONを表示することで最終的な設定を透明にします。

## 背景

現在、`/auth` で `Custom API Key` を選択すると、静的な情報画面が表示されます：

```text
カスタム設定

settings.json で APIキーとモデルを設定できます

セットアップ手順についてはドキュメントを参照してください
https://qwenlm.github.io/qwen-code-docs/en/users/configuration/model-providers/

Esc で戻る
```

このフローでは、ユーザーはCLIを離れ、ドキュメントを読み、`settings.json` を理解し、`modelProviders` を手動で設定し、`envKey` を選び、APIキーを追加し、その後Qwen Codeに戻る必要があります。ユーザーからは、このフローが難しく、他の `/auth` エクスペリエンスと断絶していると報告されています。

現在のModelStudio Standard APIキーパスは、以下のようなガイド付きセットアップフローを提供しています：

```text
Alibaba Cloud ModelStudio Standard API Key
└─ リージョン選択
   └─ APIキー入力
      └─ モデルID入力
         └─ 保存 + 認証
```

カスタムAPIキーのセットアップも同様のガイド付きエクスペリエンスを提供するべきであり、同時にQwen Codeが複数のプロバイダプロトコルをサポートしていることを考慮する必要があります。

## 問題提起

カスタムAPIキーパスは、現在 `/auth` 内で行き止まりになっています：

```text
/auth
└─ 認証方式の選択
   ├─ Alibaba Cloud Coding Plan
   ├─ API Key
   │  └─ APIキータイプの選択
   │     ├─ Alibaba Cloud ModelStudio Standard API Key
   │     │  ├─ リージョン選択
   │     │  ├─ APIキー入力
   │     │  ├─ モデルID入力
   │     │  └─ 保存 + 認証
   │     │
   │     └─ Custom API Key
   │        └─ ドキュメントのみの画面
   │
   └─ Qwen OAuth
```

これにより、以下のようなユーザビリティの問題が発生します：

- ユーザーが `/auth` からカスタムプロバイダのセットアップを完了できない。
- ユーザーが認証前に低レベルの設定概念を理解する必要がある。
- ユーザーが `authType`、`baseUrl`、`envKey`、`modelProviders`、`model.name`、`security.auth.selectedType` などの必須項目を認識できない可能性がある。
- ユーザーが既存の環境変数と誤って競合したり、既存のプロバイダ設定を上書きする可能性がある。
- 設定を手動で編集した後、すぐに認証フィードバックが得られない。

## 目標

1. ユーザーが `/auth` 内でカスタムAPIプロバイダを完全に設定できるようにする。
2. Qwen Codeが `modelProviders` でサポートする主要プロトコル（`openai`、`anthropic`、`gemini`）に対応する。
3. フローを既存のModelStudio Standardフローに近づける。
4. `baseUrl` をカスタムプロバイダにおけるリージョン選択と同等に扱う。
5. 選択したプロトコルと入力された `baseUrl` から、Qwen管理のプライベート `envKey` を自動生成する。
6. APIキーを `settings.json.env` に保存し、現在のQwen管理の認証情報パターンと一貫性を持たせる。
7. Qwen固有の生成キー名を使用することで、ユーザーのシェル環境変数との競合を避ける。
8. 保存前に生成されたJSONを表示し、ユーザーが正確な設定変更を確認できるようにする。
9. 既存の無関係な `modelProviders` エントリは保持する。
10. 保存後すぐに認証し、成功または失敗のフィードバックを表示する。

## 非目標

1. ユーザーに手動での `envKey` 入力を要求しない。
2. プロバイダ名を独立した概念として導入しない。
3. ウィザードに高度な `generationConfig`、`capabilities`、モデルごとの上書き設定を追加しない。
4. ドキュメントへのリンクを完全に削除しない。高度な設定のために引き続き利用可能にする。
5. 既存のCoding PlanやModelStudio Standard APIキーフローは変更しない。
6. 最初のバージョンでは `baseUrl` からプロトコルを自動検出しようとしない。ユーザーが明示的にプロトコルを選択する。

## 対象ユーザー

- 独自のカスタムAPIエンドポイントを使用するユーザー。
- OpenAI互換API、Anthropic互換API、Gemini互換API、vLLM、Ollama、LM Studio、内部ゲートウェイなどのプロバイダを設定するユーザー。
- CLIから認証を設定することを好み、手動で `settings.json` を編集したくないユーザー。

## サポートするプロトコル

ウィザードでは、初期状態で以下のプロトコルオプションを提供します：

```text
openai
anthropic
gemini
```

各プロトコルは、直接 `modelProviders` キーおよび `security.auth.selectedType` 値にマッピングされます。

| プロトコルオプション      | 認証タイプ / modelProvidersキー | 備考                                                                               |
| ------------------------ | ------------------------------ | ---------------------------------------------------------------------------------- |
| OpenAI互換               | `openai`                       | OpenAI、OpenRouter、Fireworks、ローカルのOpenAI互換サーバー、内部ゲートウェイ           |
| Anthropic互換            | `anthropic`                    | Anthropic互換エンドポイント                                                           |
| Gemini互換               | `gemini`                       | Gemini互換エンドポイント                                                             |

## ユーザーエクスペリエンス概要

### 更新された `/auth` ツリー

```text
/auth
└─ 認証方式の選択
   ├─ Alibaba Cloud Coding Plan
   │  └─ リージョン選択
   │     └─ APIキー入力
   │        └─ 保存 + 認証
   │
   ├─ API Key
   │  └─ APIキータイプの選択
   │     ├─ Alibaba Cloud ModelStudio Standard API Key
   │     │  ├─ リージョン選択
   │     │  ├─ APIキー入力
   │     │  ├─ モデルID入力
   │     │  └─ 保存 + 認証
   │     │
   │     └─ Custom API Key
   │        ├─ プロトコル選択
   │        ├─ ベースURL入力
   │        ├─ APIキー入力
   │        ├─ モデルID入力
   │        ├─ 生成されたJSONの確認
   │        └─ 保存 + 認証
   │
   └─ Qwen OAuth
```

### カスタムAPIキーのステートマシン

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
      │ プロトコル + baseUrl から envKey を生成
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
設定を保存 + refreshAuth(selectedProtocol)
```

### エスケープ動作

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

## 詳細なインタラクションデザイン

### ステップ1: プロトコル選択

```text
┌──────────────────────────────────────────────────────────────┐
│ Custom API Key · プロトコル選択                              │
│                                                              │
│  ◉ OpenAI互換                                               │
│    OpenAI、OpenRouter、Fireworks、vLLM、Ollama、LM Studio     │
│                                                              │
│  ○ Anthropic互換                                            │
│    Anthropic互換エンドポイント                               │
│                                                              │
│  ○ Gemini互換                                               │
│    Gemini互換エンドポイント                                  │
│                                                              │
│ Enterで選択、↑↓で移動、Escで戻る                           │
└──────────────────────────────────────────────────────────────┘
```

選択されたプロトコルは以下を決定します：

- 更新する `modelProviders` キー。
- 永続化する `security.auth.selectedType` 値。
- 以降の画面で表示されるプロトコルラベル。
- 保存後に使用される `refreshAuth()` の認証タイプ。

### ステップ2: ベースURL入力

`baseUrl` はカスタムプロバイダにおけるリージョン選択と同等です。APIキー入力の前に配置されるのは、APIキーがどのエンドポイントに属するかを決定するためです。

OpenAI互換の場合：

```text
┌──────────────────────────────────────────────────────────────┐
│ Custom API Key · ベースURL                                   │
│                                                              │
│ プロトコル: OpenAI互換                                       │
│                                                              │
│ OpenAI互換のAPIエンドポイントを入力してください。             │
│                                                              │
│ ベースURL: https://openrouter.ai/api/v1_                    │
│                                                              │
│ 例:                                                          │
│   OpenAI:      https://api.openai.com/v1                     │
│   OpenRouter: https://openrouter.ai/api/v1                   │
│   Fireworks:  https://api.fireworks.ai/inference/v1          │
│   Ollama:     http://localhost:11434/v1                      │
│   LM Studio:  http://localhost:1234/v1                       │
│                                                              │
│ Enterで続行、Escで戻る                                       │
└──────────────────────────────────────────────────────────────┘
```

Anthropic互換の場合：

```text
┌──────────────────────────────────────────────────────────────┐
│ Custom API Key · ベースURL                                   │
│                                                              │
│ プロトコル: Anthropic互換                                    │
│                                                              │
│ Anthropic互換のAPIエンドポイントを入力してください。          │
│                                                              │
│ ベースURL: https://api.anthropic.com/v1_                    │
│                                                              │
│ Enterで続行、Escで戻る                                       │
└──────────────────────────────────────────────────────────────┘
```

Gemini互換の場合：

```text
┌──────────────────────────────────────────────────────────────┐
│ Custom API Key · ベースURL                                   │
│                                                              │
│ プロトコル: Gemini互換                                       │
│                                                              │
│ Gemini互換のAPIエンドポイントを入力してください。             │
│                                                              │
│ ベースURL: https://generativelanguage.googleapis.com_        │
│                                                              │
│ Enterで続行、Escで戻る                                       │
└──────────────────────────────────────────────────────────────┘
```

バリデーション：

- 必須。
- `http://` または `https://` で始まっている必要がある。
- 先頭と末尾の空白をトリム。
- トリム後の正規化された文字列をそのまま保持。

有効な場合の処理：

- 選択したプロトコルと`baseUrl`からQwen管理の`envKey`を生成。
- APIキー入力画面に進む。

### ステップ3: APIキー入力

```text
┌──────────────────────────────────────────────────────────────┐
│ Custom API Key · APIキー                                     │
│                                                              │
│ プロトコル: OpenAI互換                                       │
│ エンドポイント: https://openrouter.ai/api/v1                │
│                                                              │
│ このエンドポイントのAPIキーを入力してください。               │
│                                                              │
│ APIキー: sk-or-v1-••••••••••••••••_                        │
│                                                              │
│ Enterで続行、Escで戻る                                       │
└──────────────────────────────────────────────────────────────┘
```

バリデーション：

- 必須。
- 先頭と末尾の空白をトリム。

備考：

- 入力は、近隣のフローとの一貫性を保つため、初期状態では既存のテキスト入力動作を使用する可能性があります。
- 確認画面ではAPIキーをマスク表示します。

### ステップ4: モデルID入力

```text
┌──────────────────────────────────────────────────────────────┐
│ Custom API Key · モデルID                                    │
│                                                              │
│ プロトコル: OpenAI互換                                       │
│ エンドポイント: https://openrouter.ai/api/v1                │
│                                                              │
│ 1つ以上のモデルIDをカンマ区切りで入力してください。          │
│                                                              │
│ モデルID: qwen/qwen3-coder,openai/gpt-4.1_                 │
│                                                              │
│ Enterで続行、Escで戻る                                       │
└──────────────────────────────────────────────────────────────┘
```

バリデーション：

- 必須。
- カンマで分割。
- 各モデルIDをトリム。
- 空エントリを削除。
- 重複を削除（順序は保持）。
- 少なくとも1つのモデルIDが残っている必要がある。

モデル命名：

- `id` と `name` は同じにする。
- ユーザーに別途プロバイダ名を要求しない。

例：

```text
入力:
qwen/qwen3-coder, openai/gpt-4.1, qwen/qwen3-coder

正規化後:
qwen/qwen3-coder, openai/gpt-4.1
```

### ステップ5: JSON確認

保存前に、`settings.json` に書き込まれる（またはマージされる）生成JSONスニペットを表示します。

OpenAI互換の例：

```text
┌──────────────────────────────────────────────────────────────┐
│ Custom API Key · 確認                                        │
│                                                              │
│ 以下のJSONがsettings.jsonに保存されます：                    │
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
│ Enterで保存、Escで戻る                                       │
└──────────────────────────────────────────────────────────────┘
```

Anthropic互換の例：

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

表示されるJSONは以下の条件を満たす必要があります：

- 選択したプロトコルを `modelProviders` キーとして使用。
- 選択したプロトコルを `security.auth.selectedType` として使用。
- 実際に生成された `envKey` を使用。
- APIキーはマスク表示。
- ユーザーが入力した `baseUrl` を使用。
- 各モデルの `id` と `name` は同じ。
- `model.name` は最初の正規化されたモデルIDに設定。

JSONが現在の端末幅に対して広すぎる場合は、折り返しを許容します。目的は透明性であり、コピペできる完璧なフォーマットではありません。

### ステップ6: 保存と認証

確認画面でEnterを押した場合：

```text
保存:
  env[generatedEnvKey] = apiKey
  modelProviders[selectedProtocol] = [
    ...新しいカスタム設定（generatedEnvKeyを使用）,
    ...既存の設定（envKey !== generatedEnvKeyのもの）
  ]
  security.auth.selectedType = selectedProtocol
  model.name = firstModelId
  reloadModelProvidersConfig()
  refreshAuth(selectedProtocol)
```

成功メッセージ：

```text
カスタムAPIキーの認証に成功しました。生成されたenvキーとモデルプロバイダ設定で設定を更新しました。
ヒント: /model を使用して設定済みモデルを切り替えられます。
```

失敗メッセージは既存の認証失敗パターンを維持し、可能であれば追加のユーザー向けヒントを表示します：

```text
認証に失敗しました。メッセージ: <error>

以下を確認してください：
- ベースURLが選択したプロトコルと互換性があること
- APIキーがこのエンドポイントに対して有効であること
- モデルIDがこのプロバイダに存在すること
```

## Envキーの生成

ウィザードはユーザーに `envKey` の入力を要求してはいけません。

Qwen管理のAPIキーは `settings.json.env` に保存されるため、envキーはQwen固有の名前空間の下で自動生成する必要があります。これにより、ユーザー管理のシェル環境変数との競合を回避し、複数のカスタムエンドポイントが互いに上書きするのを防ぎます。

### フォーマット

```text
QWEN_CUSTOM_API_KEY_${PROTOCOL}_${NORMALIZED_BASE_URL}
```

プロトコルを含めることで、異なるプロトコルアダプターで同じエンドポイントが使用された場合の衝突を回避します。

### 例

```text
プロトコル: openai
ベースURL: https://api.openai.com/v1
-> QWEN_CUSTOM_API_KEY_OPENAI_HTTPS_API_OPENAI_COM_V1

プロトコル: openai
ベースURL: https://openrouter.ai/api/v1
-> QWEN_CUSTOM_API_KEY_OPENAI_HTTPS_OPENROUTER_AI_API_V1

プロトコル: anthropic
ベースURL: https://api.anthropic.com/v1
-> QWEN_CUSTOM_API_KEY_ANTHROPIC_HTTPS_API_ANTHROPIC_COM_V1

プロトコル: gemini
ベースURL: https://generativelanguage.googleapis.com
-> QWEN_CUSTOM_API_KEY_GEMINI_HTTPS_GENERATIVELANGUAGE_GOOGLEAPIS_COM

プロトコル: openai
ベースURL: http://localhost:11434/v1
-> QWEN_CUSTOM_API_KEY_OPENAI_HTTP_LOCALHOST_11434_V1
```

### 正規化ルール

```text
protocol
  -> トリム
  -> 大文字
  -> A-Z / 0-9 以外の文字をすべて _ に置換

baseUrl
  -> トリム
  -> 大文字
  -> A-Z / 0-9 以外の文字をすべて _ に置換
  -> 連続する _ を1つにまとめる
  -> 先頭/末尾の _ を削除

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
## 設定書き込み設計

与えられたユーザー入力:

```text
Protocol: openai
Base URL: https://openrouter.ai/api/v1
API key: sk-or-v1-xxx
Model IDs: qwen/qwen3-coder,openai/gpt-4.1
```

ウィザードは以下を生成するべきです:

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

`anthropic` の場合も同じ構造を使用しますが、以下が異なります:

```text
modelProviders.anthropic
security.auth.selectedType = anthropic
refreshAuth(anthropic)
```

`gemini` の場合も同じ構造を使用しますが、以下が異なります:

```text
modelProviders.gemini
security.auth.selectedType = gemini
refreshAuth(gemini)
```

### 永続化スコープ

モデル選択や既存の API キーフローと同じ永続化スコープ戦略を使用します:

```text
getPersistScopeForModelSelection(settings)
```

これにより、既存の `modelProviders` 所有ルールと一貫した動作が維持されます。

### バックアップ

書き込み前に、既存の Coding Plan や ModelStudio Standard フローと同様に、対象の設定ファイルをバックアップします。

### プロセス環境変数の同期

`settings.json.env[generatedEnvKey]` に書き込んだ後、直ちに同期します:

```text
process.env[generatedEnvKey] = apiKey
```

これにより、`refreshAuth(selectedProtocol)` が同じセッション内で新しく入力されたキーを使用できるようになります。

### モデルプロバイダマージルール

生成された env キーについて:

```text
generatedEnvKey = QWEN_CUSTOM_API_KEY_${PROTOCOL}_${NORMALIZED_BASE_URL}
```

`modelProviders[selectedProtocol]` を次のように更新します:

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

根拠:

- 同じプロトコル + `baseUrl` を再設定すると、そのエンドポイントの古いモデルが置き換えられます。
- 異なるプロトコルまたは `baseUrl` を設定すると、異なる env キーが使用され、以前のカスタムエンドポイントは上書きされません。
- Coding Plan、ModelStudio Standard、その他のユーザー設定は、同じ生成 env キーを同じプロトコルで使用しない限り保持されます。
- 新しい設定を先頭に配置することで、新しく設定されたモデルがすぐに表示され、デフォルトで選択されるようにします。

## エラーハンドリング

### プロトコルバリデーションエラー

プロトコルは次のいずれかである必要があります:

```text
openai
anthropic
gemini
```

### Base URL バリデーションエラー

```text
Base URL cannot be empty.
```

```text
Base URL must start with http:// or https://.
```

### API キーバリデーションエラー

```text
API key cannot be empty.
```

### モデル ID バリデーションエラー

```text
Model IDs cannot be empty.
```

### 認証失敗

可能な限り既存の失敗メカニズムを使用しますが、ユーザー向けエラーメッセージはユーザーが回復できるように支援する必要があります:

```text
Failed to authenticate. Message: <message>

Please check:
- Base URL is compatible with the selected protocol
- API key is valid for this endpoint
- Model ID exists for this provider
```

## ドキュメントリンク

ウィザードは、上級ユーザー向けに既存のモデルプロバイダドキュメントを公開する必要があります。

推奨配置場所:

- 確認画面のフッター、または
- Base URL 画面の補足テキストとして。

推奨コピー:

```text
Need advanced generationConfig or capabilities? See:
https://qwenlm.github.io/qwen-code-docs/en/users/configuration/model-providers/
```

## 実装ノート

`AuthDialog` の想定ビューレベル:

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

想定されるカスタムプロトコル型:

```ts
type CustomApiProtocol =
  | AuthType.USE_OPENAI
  | AuthType.USE_ANTHROPIC
  | AuthType.USE_GEMINI;
```

`AuthDialog` での新しい state の想定:

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

想定される新しい UI アクション:

```ts
handleCustomApiKeySubmit: (
  protocol: CustomApiProtocol,
  baseUrl: string,
  apiKey: string,
  modelIdsInput: string,
) => Promise<void>;
```

想定されるヘルパー関数:

```ts
generateCustomApiKeyEnvKey(protocol: string, baseUrl: string): string
normalizeCustomModelIds(modelIdsInput: string): string[]
maskApiKey(apiKey: string): string
```

## 受け入れ基準

### UX

- `/auth -> API Key -> Custom API Key` を選択すると、ドキュメントのみのページではなく、カスタムウィザードが開くこと。
- 最初のカスタムウィザードステップでプロトコルを問い合わせること。
- 2 番目のステップで Base URL を問い合わせ、選択されたプロトコルを表示すること。
- 3 番目のステップで API キーを問い合わせ、選択されたプロトコルとエンドポイントを表示すること。
- 4 番目のステップでモデル ID を問い合わせ、選択されたプロトコルとエンドポイントを表示すること。
- 確認ステップで生成された JSON（マスクされた API キー、選択されたプロトコル、生成された env キーを含む）を表示すること。
- 確認ステップで Enter を押すと設定が保存され、認証が試行されること。
- Esc を押すと 1 ステップずつ戻ること。

### 設定

- API キーが `settings.json.env[generatedEnvKey]` に書き込まれること。
- `generatedEnvKey` が Qwen プライベート名前空間を使用して、選択されたプロトコルと `baseUrl` から導出されること。
- `modelProviders[selectedProtocol]` に正規化されたモデル ID ごとに 1 つのエントリが追加されること。
- 各カスタムモデルエントリで `id === name` となること。
- `security.auth.selectedType` が選択されたプロトコルに設定されること。
- `model.name` が最初の正規化されたモデル ID に設定されること。
- 異なる `envKey` を持つ `modelProviders[selectedProtocol]` の既存エントリは保持されること。
- 同じ生成 `envKey` を持つ `modelProviders[selectedProtocol]` の既存エントリは置き換えられること。
- 他の `modelProviders` プロトコルキーのエントリは保持されること。

### 認証

- 認証リフレッシュ前に、生成された env キーが `process.env` に同期されること。
- アプリが `refreshAuth(selectedProtocol)` の前にモデルプロバイダ設定を再読み込みすること。
- 認証成功により認証ダイアログが閉じられ、成功メッセージが表示されること。
- 認証失敗によりユーザーは認証フローに留まり、実行可能なエラーが表示されること。

### テスト

- `AuthDialog` のテストを追加または更新し、カスタムウィザードパスをカバーすること。
- プロトコル選択のテストを追加すること。
- プロトコルと Base URL からの env キー生成のテストを追加すること。
- モデル ID の正規化と重複排除のテストを追加すること。
- 設定マージ動作のテストを追加すること:
  - 同じ生成 env キーが同じプロトコル下の古いカスタムエントリを置き換えること。
  - 異なる env キーは保持されること。
  - 他のプロトコルキーは保持されること。
  - Coding Plan や ModelStudio Standard のエントリは保持されること。
- 実用的な範囲で、生成された JSON プレビュー内容のテストを追加すること。

## 未解決の質問

1. API キー入力は入力中にマスクすべきか、それとも確認画面でのみマスクすべきか？
2. `http://localhost:11434/v1` のようなローカルエンドポイントでは、認証を必要としないサーバーのために空の API キーやプレースホルダー API キーを許可すべきか？
3. 生成された JSON プレビューは、適用されるパッチのみを表示すべきか、それともマージ後の結果の全関連設定サブツリーを表示すべきか？
4. Vertex AI はこのカスタム API キーウィザードに含めるべきか、それとも認証設定が単純な API キープロバイダと異なるため除外すべきか？

最初のバージョンでは、以下のデフォルトを推奨します:

- `openai`、`anthropic`、`gemini` をサポートする。
- 入力中の動作は既存のものを使用する。
- API キー認証フローとの一貫性のために空でない API キーを必須とする。
- 保存または更新されるパッチ形式の JSON を表示する。
- Vertex AI は、別の製品判断が下されるまでカスタム API キーウィザードから除外する。