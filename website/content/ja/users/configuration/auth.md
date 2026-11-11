# 認証

Qwen Code の初回実行時の `/auth` メニューには、5 つのトップレベルオプションがあります。CLI の実行方法に合ったものを選択してください:

- [**サブスクリプション付き Qwen アカウント**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli): **Qwen OAuth** を通じて Qwen アカウントでサインインし、[**chat.qwen.ai**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli) の **Plus または Pro サブスクリプション**を使用して **Qwen Code and Agent** にアクセスします。まだサブスクリプションがない場合は、[**chat.qwen.ai**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli) にアクセスして Plus または Pro に登録し、その後 Qwen Code に戻って [**サブスクリプション付き Qwen アカウント**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli) を選択してください。
- **QwenCloud**: 公式推奨セットアップ。**Token Plan** (専用エンドポイントでの月額クレジットクォータ付きサブスクリプション · Personal および Team エディション) または **Standard API Key** (従量課金) のサブメニューを開きます。その後、プラットフォームを明示的に選択します — **中国 — 千问AI平台** または **国際 — QwenCloud** — これにより、UI 言語がエンドポイントを決定することはありません。両方のアクセス方法では、追加のセットアップなしで組み込みの [`web_search` ツール](https://qwenlm.github.io/qwen-code-docs/en/developers/tools/web-search/) も有効になります。
- **Alibaba ModelStudio**: **Coding Plan** (個人開発者向け · 週次クォータ含む)、**Token Plan** (チームおよび企業向け · 専用エンドポイントでの使用量ベース課金)、または **Standard API Key** (既存の ModelStudio API キーで接続) のサブメニューを開きます。Token Plan と Standard API Key では、追加のセットアップなしで組み込みの [`web_search` ツール](https://qwenlm.github.io/qwen-code-docs/en/developers/tools/web-search/) も有効になります。保存された ModelStudio の認証情報、エンドポイント、モデルは変更なく動作し続けます。
- **Third-party Providers**: 組み込みプロバイダーを選択し、API キーで接続します（DeepSeek、Grok、MiniMax、Z.AI、Kimi、Idealab、ModelScope、OpenRouter、Requesty）。
- **Custom Provider**: ローカルサーバー、プロキシ、またはサポートされていないプロバイダーに手動で接続します。OpenAI、Anthropic、Gemini、およびその他の互換エンドポイントをサポートします。

## **オプション 1: Qwen OAuth —** [**サブスクリプション付き Qwen アカウント**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli)

Qwen OAuth を使用すると、Qwen アカウントでサインインし、[**chat.qwen.ai**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli) の **Plus または Pro サブスクリプション**を利用して **Qwen Code and Agent** にアクセスできます。初回実行メニューまたは `/auth` ダイアログで [**サブスクリプション付き Qwen アカウント**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli) を選択して開始してください。

- **仕組み**: [**サブスクリプション付き Qwen アカウント**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli) を選択し、ブラウザのサインインフローに従って、Qwen アカウントで Qwen Code を認可します。
- **要件**: [**chat.qwen.ai**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli) のアクティブな **Plus または Pro サブスクリプション**を持つ Qwen アカウントとインターネット接続。
- **利点**: API キーを手動で設定せずに、Qwen サブスクリプションを通じて **Qwen Code and Agent** にアクセスできます。
- **コストとクォータ**: 使用量はサブスクリプションプランの対象となります。Plus および Pro プランの詳細については [**chat.qwen.ai**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli) をご覧ください。

### **インタラクティブセットアップ**

1. まだサブスクリプションがない場合は、[**chat.qwen.ai**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli) にアクセスして **Plus または Pro** に登録してください。すでにアクティブなサブスクリプションがある場合は、次のステップに進んでください。
2. ターミナルで Qwen Code を起動します:

   ```bash
   qwen
   ```

3. 初回実行メニューで [**サブスクリプション付き Qwen アカウント**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli) を選択します。Qwen Code が既に実行中の場合は、`/auth` を入力して認証メニューを開き、同じオプションを選択してください。
4. [**chat.qwen.ai**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli) で**サブスクリプションに登録した際に使用したのと同じ Qwen アカウント**を使用して、ブラウザのサインインと認可フローを完了します。
5. Qwen Code に戻り、サブスクリプションを使って作業を開始します。

CI や無人コンテナなど、ブラウザのサインインフローを完了できない非インタラクティブ環境では、代わりに API キーベースの認証方法を使用してください。

## ☁️ オプション 2: QwenCloud

公式プラットフォームエントリー。API キーが 千问AI平台 (中国) または QwenCloud (国際) から提供される場合、これを選択します。

- **仕組み**: アクセス方法を選択し、次にプラットフォームを明示的に選択します — UI 言語がエンドポイントを決定することはありません。そのプラットフォームが発行したキーを入力すると、Qwen Code は対応するエンドポイントを設定します。
- **アクセス方法**: **Token Plan** (専用エンドポイントでの月額クレジットクォータ付きサブスクリプション; Personal および Team エディション) または **Standard API Key** (従量課金)。Coding Plan はここでは提供され _ません_ — これは Alibaba ModelStudio の製品です。オプション 3 を参照してください。
- **要件**: Token Plan コンソールから生成された Token Plan キー (接頭辞 `sk-sp-`)、またはプラットフォームの API キーページからの従量課金キー (接頭辞 `sk-` または `sk-ws-`)。
- **利点**: 両方のアクセス方法では、追加のセットアップなしで組み込みの [`web_search` ツール](../../developers/tools/web-search.md) が有効になります。

| プラットフォーム                  | アクセス方法    | エンドポイント                                                      | API キー                                                                                  |
| ------------------------- | ---------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 中国 — 千问AIプラットフォーム | 標準APIキー | `https://maas.qianwenaiapi.com/compatible-mode/v1` | [APIキー](https://platform.qianwenai.com/docs/developer-guides/administration/api-keys) |
| 中国 — 千问AIプラットフォーム | トークンプラン | `https://token-plan.maas.qianwenaiapi.com/compatible-mode/v1` | [トークンプラン](https://platform.qianwenai.com/docs/token-plan/overview) |
| 国際版 — QwenCloud | 標準APIキー | `https://maas.qwencloudapi.com/compatible-mode/v1` | [APIキー](https://docs.qwencloud.com/developer-guides/administration/api-keys) |
| 国際版 — QwenCloud | トークンプラン | `https://token-plan.maas.qwencloudapi.com/compatible-mode/v1` | [トークンプラン](https://docs.qwencloud.com/token-plan/overview) |

### インタラクティブセットアップ

ターミナルで`qwen`を入力してQwen Codeを起動し、`/auth`コマンドを実行して**QwenCloud**を選択し、サブメニューから**トークンプラン**または**標準APIキー**を選択します。プラットフォーム（**中国 — 千问AIプラットフォーム**または**国際版 — QwenCloud**）を選択してから、APIキーを入力してください。

Qwen Codeは起動時に保存されたキーを使用してエンドポイントのモデルリストを確認します。詳細は[組み込みプロバイダーの更新](#built-in-provider-updates)を参照してください。

### ヘッドレスまたはスクリプトによるセットアップ

CI、コンテナ、スクリプトでは、対話型の`/auth`フローの代わりに環境変数を使用してプラットフォームを設定してください。

```bash
# Pay-as-you-go (Standard API Key), International
export QWENCLOUD_API_KEY="sk-your-api-key"
export OPENAI_BASE_URL="https://maas.qwencloudapi.com/compatible-mode/v1"
export OPENAI_MODEL="qwen3.8-max"
```

```bash
# Token Plan, China
export QWENCLOUD_TOKEN_PLAN_API_KEY="sk-sp-your-api-key"
export OPENAI_BASE_URL="https://token-plan.maas.qianwenaiapi.com/compatible-mode/v1"
export OPENAI_MODEL="qwen3.8-max"
```

### 代替案: `settings.json` による設定

インタラクティブな `/auth` フローをスキップしたい場合は、以下を `~/.qwen/settings.json` に追加します。

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3.8-max",
        "name": "qwen3.8-max (QwenCloud)",
        "baseUrl": "https://maas.qwencloudapi.com/compatible-mode/v1",
        "description": "qwen3.8-max from QwenCloud Standard API Key",
        "envKey": "QWENCLOUD_API_KEY"
      }
    ]
  },
  "env": {
    "QWENCLOUD_API_KEY": "sk-your-api-key"
  },
  "security": {
    "auth": {
      "selectedType": "openai"
    }
  },
  "model": {
    "name": "qwen3.8-max"
  }
}
```

> [!note]
>
> `capabilities`はモデル名から推論されない唯一のプロバイダースタンプであるため、手動で記述したエントリは推論宣言なしで解決され、`/effort`はQwenCloudのカレーテッドな`low` / `medium` / `xhigh`ではなく汎用ティアリストを提供します。カレーテッドセットを使用する場合は、`/auth`を使用してプロバイダーをインストールしてください。

他のプロバイダー固有のキーと同様に、`QWENCLOUD_API_KEY`と`QWENCLOUD_TOKEN_PLAN_API_KEY`は`settings.json`プロバイダーエントリがそれらを`envKey`として宣言した場合にのみ有効になります。環境変数のみでOpenAI互換認証を選択する場合は、代わりに`OPENAI_API_KEY`をエクスポートしてください。

> [!note]
>
> QwenCloudとAlibaba ModelStudioは、個別の環境変数キーとエンドポイントを持つ別々のエントリです。QwenCloudを選択しても、保存されたModelStudioの認証情報、エンドポイント、モデル選択が書き換えられたり削除されたりすることはありません。

## 💳 オプション3: Alibaba Cloud Coding Plan [#-option-3-alibaba-cloud-coding-plan]

多様なモデルオプションと高い利用クォータで、予測可能なコストにしたい場合はこれを使用します。

- **仕組み**: 固定月額料金で Coding Plan を契約し、専用エンドポイントと契約 API キーを使用するように Qwen Code を設定します。
- **要件**: アカウントのリージョンに応じて、[Alibaba Cloud ModelStudio(Beijing)](https://bailian.console.aliyun.com/cn-beijing?tab=coding-plan#/efm/coding-plan-index) または [Alibaba Cloud ModelStudio(intl)](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index) から有効な Coding Plan サブスクリプションを取得します。
- **メリット**: 多様なモデルオプション、高い利用クォータ、予測可能な月額コスト、幅広いモデル（Qwen、GLM、Kimi、Minimax など）へのアクセス。
- **コストとクォータ**: Aliyun ModelStudio Coding Plan のドキュメント[Beijing](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3005961)[intl](https://modelstudio.console.alibabacloud.com/?tab=doc#/doc/?type=model&url=2840914)を参照してください。

Alibaba Cloud Coding Plan は 2 つのリージョンで利用可能です。

| リージョン                       | コンソール URL                                                                  |
| ---------------------------- | ---------------------------------------------------------------------------- |
| Aliyun ModelStudio (北京) | [bailian.console.aliyun.com](https://bailian.console.aliyun.com) |
| Alibaba Cloud (国際版) | [bailian.console.alibabacloud.com](https://bailian.console.alibabacloud.com) |

### インタラクティブセットアップ

ターミナルに `qwen` と入力して Qwen Code を起動し、`/auth` コマンドを実行して **Alibaba ModelStudio** を選択し、サブメニューから **Coding Plan** を選択します。リージョンを選択し、`sk-sp-xxxxxxxxx` キーを入力します。

Qwen Codeは起動時に保存されたキーを使用してエンドポイントのモデルリストを確認します。詳細は[組み込みプロバイダーの更新](#built-in-provider-updates)を参照してください。

認証後、`/model` コマンドを使用して、Alibaba Cloud Coding Plan でサポートされているすべてのモデル（qwen3.5-plus、qwen3.6-plus、qwen3.7-plus、qwen3-coder-plus、qwen3-coder-next、qwen3-max-2026-01-23、glm-5、glm-4.7、kimi-k2.5、MiniMax-M2.5 など）を切り替えます。

### ヘッドレスまたはスクリプトによるセットアップ

CI、コンテナ、スクリプトでは、削除された`qwen auth coding-plan`コマンドの代わりに環境変数または`settings.json`を使用してCoding Planを設定してください。

```bash
export BAILIAN_CODING_PLAN_API_KEY="sk-sp-xxxxxxxxx"
export OPENAI_BASE_URL="https://coding.dashscope.aliyuncs.com/v1"
export OPENAI_MODEL="qwen3-coder-plus"
```

中国（北京）エンドポイントには `https://coding.dashscope.aliyuncs.com/v1` を、国際エンドポイントには `https://coding-intl.dashscope.aliyuncs.com/v1` を使用します。

### 代替案: `settings.json` による設定

インタラクティブな `/auth` フローをスキップしたい場合は、以下を `~/.qwen/settings.json` に追加します。

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3-coder-plus",
        "name": "qwen3-coder-plus (Coding Plan)",
        "baseUrl": "https://coding.dashscope.aliyuncs.com/v1",
        "description": "qwen3-coder-plus from Alibaba Cloud Coding Plan",
        "envKey": "BAILIAN_CODING_PLAN_API_KEY"
      }
    ]
  },
  "env": {
    "BAILIAN_CODING_PLAN_API_KEY": "sk-sp-xxxxxxxxx"
  },
  "security": {
    "auth": {
      "selectedType": "openai"
    }
  },
  "model": {
    "name": "qwen3-coder-plus"
  }
}
```

> [!note]
>
> Coding Plan は、標準の Dashscope エンドポイントとは異なる専用エンドポイント（`https://coding.dashscope.aliyuncs.com/v1`）を使用します。必ず正しい `baseUrl` を使用してください。

## 🪙 オプション4: Alibaba Cloud Token Plan

チームや企業が専用 ModelStudio エンドポイントでの従量課金を希望する場合はこれを使用します。

- **仕組み**: Alibaba Cloud ModelStudio で Token Plan を契約し、リージョン固有の Token Plan エンドポイントと API キーを使用するように Qwen Code を設定します。固定月額料金ではなく、実際のトークン使用量に対して課金されます。
- **要件**: アカウントのリージョンに応じて、[Alibaba Cloud ModelStudio(Beijing)](https://bailian.console.aliyun.com/cn-beijing?tab=doc#/doc/?type=model&url=3028856) または [Alibaba Cloud ModelStudio(intl)](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model) から Token Plan API キーを取得します。
- **メリット**: チーム・企業向けの従量課金、リージョン固有の専用エンドポイント、幅広いモデル（Qwen、DeepSeek、GLM、Kimi、Minimax など）へのアクセス。
- **コストとクォータ**: Alibaba Cloud ModelStudio Token Plan のドキュメント [Beijing](https://bailian.console.aliyun.com/cn-beijing?tab=doc#/doc/?type=model&url=3028856) [intl](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model) を参照してください。

Token Plan は 2 つのリージョンで利用可能で、それぞれに専用エンドポイントがあります。

| リージョン                    | エンドポイント                                                                 | コンソール URL                                                                                         |
| ------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| 中国（北京）           | `https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`     | [bailian.console.aliyun.com](https://bailian.console.aliyun.com/cn-beijing)                         |
| シンガポール（国際） | `https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1` | [modelstudio.console.alibabacloud.com](https://modelstudio.console.alibabacloud.com/ap-southeast-1) |

### インタラクティブセットアップ

ターミナルで`qwen`を入力してQwen Codeを起動し、`/auth`コマンドを実行して**Alibaba ModelStudio**を選択し、サブメニューから**トークンプラン**を選択します。地域（**中国 (北京)**または**シンガポール (国際版)**）を選択してから、APIキーを入力します。その後、ウィザードの最終ステップ（Step 3/3 · モデルID）が表示され、設定するモデルIDを選択できます。ここで、エンドポイントが提供するモデルが提示され、明示的に選択した場合のみ適用されます。ModelStudioトークンプランのAPIキーには接頭辞要件がありませんが、Coding Planのキーは`sk-sp-`で始まり、オプション2の別のQwenCloudトークンプランのキーも`sk-sp-`で始まります。

認証後、`/model` コマンドを使用して、Token Plan 用に設定されたモデルを閲覧・切り替えできます。モデルラインアップは時間とともに進化するため、ここでは意図的に一覧にしていません。エンドポイントからのモデル検出は上記の `/auth` 設定ステップで行われます（エンドポイント自身のリストがそこで提示され、明示的に選択する必要があります）。`/model` はプラン用に設定されたモデルを表示します。

Qwen Codeはまた、[組み込みプロバイダーの更新](#built-in-provider-updates)に記載されているように、起動時に保存されたAPIキーを使用してエンドポイントのモデルリストを確認します。

### ヘッドレスまたはスクリプトによるセットアップ

CI、コンテナ、スクリプトでは、対話型の`/auth`フローの代わりに環境変数または`settings.json`を使用してトークンプランを設定してください。

```bash
export BAILIAN_TOKEN_PLAN_API_KEY="your-api-key"
export OPENAI_BASE_URL="https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1"
export OPENAI_MODEL="qwen3.7-plus"
```

中国（北京）エンドポイントには `https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1` を、国際（シンガポール）エンドポイントには `https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1` を使用します。`qwen3.7-plus` はプランに含まれる任意のモデルに置き換えてください。

`BAILIAN_TOKEN_PLAN_API_KEY` はプロバイダー固有のキーです。次のセクションの `settings.json` プロバイダーエントリが存在すると有効になります。そのエントリが `envKey` として宣言するためです。環境変数だけで OpenAI 互換認証を選択するには、代わりに `OPENAI_API_KEY` をエクスポートしてください。プロバイダー固有のキーだけでは認証タイプを選択できません。

### 代替案: `settings.json` による設定

インタラクティブな `/auth` フローをスキップしたい場合は、以下を `~/.qwen/settings.json` に追加します。

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3.7-plus",
        "name": "qwen3.7-plus (Token Plan)",
        "baseUrl": "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
        "description": "qwen3.7-plus from Alibaba Cloud Token Plan",
        "envKey": "BAILIAN_TOKEN_PLAN_API_KEY"
      }
    ]
  },
  "env": {
    "BAILIAN_TOKEN_PLAN_API_KEY": "your-api-key"
  },
  "security": {
    "auth": {
      "selectedType": "openai"
    }
  },
  "model": {
    "name": "qwen3.7-plus"
  }
}
```

> [!note]
>
> Token Plan は、標準の DashScope エンドポイントとは異なるリージョン固有の専用エンドポイント（`*.maas.aliyuncs.com`）を使用します。`baseUrl` がサブスクリプションのリージョンと一致していることを確認してください。

## 🚀 オプション5: APIキー（柔軟）

OpenAI、Anthropic、Google、Azure OpenAI、OpenRouter、Requesty、ModelScope、またはセルフホスト型エンドポイントなどのサードパーティプロバイダーに接続したい場合はこれを使用します。複数のプロトコルとプロバイダーをサポートします。

### 推奨: `settings.json` による 1 ファイルセットアップ [#recommended-one-file-setup-via-settingsjson]

API キー認証を開始する最も簡単な方法は、すべてを単一の `~/.qwen/settings.json` ファイルに記述することです。以下は、すぐに使用できる完全な例です。

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3-coder-plus",
        "name": "qwen3-coder-plus",
        "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "description": "Qwen3-Coder via Dashscope",
        "envKey": "DASHSCOPE_API_KEY"
      }
    ]
  },
  "env": {
    "DASHSCOPE_API_KEY": "sk-xxxxxxxxxxxxx"
  },
  "security": {
    "auth": {
      "selectedType": "openai"
    }
  },
  "model": {
    "name": "qwen3-coder-plus"
  }
}
```

各フィールドの役割:

| フィールド                        | 説明                                                                                                                                     |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `modelProviders`             | 利用可能なモデルと、それらへの接続方法を宣言します。キー（`openai`、`anthropic`、`gemini`）は API プロトコルを表します。              |
| `env`                        | フォールバックとして API キーを `settings.json` に直接保存します（最低優先度 — シェルの `export` や `.env` ファイルが優先されます）。                  |
| `security.auth.selectedType` | 起動時に Qwen Code が使用するプロトコル（`openai`、`anthropic`、`gemini` など）を指定します。これがない場合、インタラクティブに `/auth` を実行する必要があります。 |
| `model.name` | Qwen Code起動時にアクティブ化するデフォルトモデル。`modelProviders`内の`id`値のいずれかと一致する必要があります。 |

ファイルを保存したら、`qwen` を実行するだけです。インタラクティブな `/auth` 設定は必要ありません。

> [!tip]
>
> 以下のセクションでは、各部分について詳しく説明します。上記のクイック例で問題ない場合は、[セキュリティに関する注意事項](#security-notes) まで読み飛ばしても構いません。

重要な概念は **Model Providers**（`modelProviders`）です: Qwen Code は OpenAI だけでなく、複数の API プロトコルをサポートしています。`~/.qwen/settings.json` を編集して利用可能なプロバイダーとモデルを設定し、実行時に `/model` コマンドで切り替えます。

#### サポートされているプロトコル

| プロトコル          | `modelProviders` キー | 環境変数                                                                                                                        | プロバイダー                                                                                             |
| ----------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| OpenAI 互換 | `openai`             | `OPENAI_API_KEY`、`OPENAI_BASE_URL`、`OPENAI_MODEL`（エイリアス: `QWEN_MODEL`）                                                    | OpenAI、Azure OpenAI、OpenRouter、Requesty、ModelScope、Alibaba Cloud、その他の OpenAI 互換エンドポイント |
| Anthropic         | `anthropic`          | `ANTHROPIC_API_KEY`、`ANTHROPIC_BASE_URL`、`ANTHROPIC_MODEL`                                                                 | Anthropic Claude                                                                                      |
| Google GenAI      | `gemini`             | `GEMINI_API_KEY`、`GEMINI_MODEL`                                                                                             | Google Gemini                                                                                         |
| Vertex AI         | `vertex-ai`          | `GOOGLE_API_KEY` + `GOOGLE_MODEL`（`GOOGLE_GENAI_USE_VERTEXAI=true` を設定）または `GOOGLE_CLOUD_PROJECT` + `GOOGLE_MODEL`（キーレス ADC）。`gemini` プロトコルを使用 | Google Vertex AI                                                                                      |

#### ステップ 1: `~/.qwen/settings.json` でモデルとプロバイダーを設定する

各プロトコルで利用可能なモデルを定義します。各モデルエントリには少なくとも`id`が必要であり、`envKey`（APIキーを保持する環境変数名）は任意ですが推奨されます。省略した場合は、認証タイプのデフォルト環境変数キー（例：`openai`の場合は`OPENAI_API_KEY`）にフォールバックします。

> [!important]
>
> プロジェクト設定とユーザー設定間のマージ競合を避けるため、`modelProviders` はユーザースコープの `~/.qwen/settings.json` で定義することをお勧めします。

`~/.qwen/settings.json` を編集します（存在しない場合は作成します）。1 つのファイルで複数のプロトコルを混在させることができます。以下は `modelProviders` セクションのみを示すマルチプロバイダーの例です。

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "gpt-4o",
        "name": "GPT-4o",
        "envKey": "OPENAI_API_KEY",
        "baseUrl": "https://api.openai.com/v1"
      }
    ],
    "anthropic": [
      {
        "id": "claude-sonnet-4-20250514",
        "name": "Claude Sonnet 4",
        "envKey": "ANTHROPIC_API_KEY"
      }
    ],
    "gemini": [
      {
        "id": "gemini-2.5-pro",
        "name": "Gemini 2.5 Pro",
        "envKey": "GEMINI_API_KEY"
      }
    ]
  }
}
```

> [!tip]
>
> `modelProviders`に加えて`env`、`security.auth.selectedType`、`model.name`も設定することを忘れないでください。参考のために[上記の完全な例](#recommended-one-file-setup-via-settingsjson)を参照してください。

**`ModelConfig` フィールド（`modelProviders` 内の各エントリ）:**

| フィールド              | 必須 | 説明                                                                                                                                        |
| ------------------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`               | はい      | API に送信されるモデル ID（例: `gpt-4o`、`claude-sonnet-4-20250514`）                                                                               |
| `wireApi`          | いいえ       | OpenAI 互換リクエスト形式: `chat-completions` または `responses`。省略するとプロバイダープロトコルを継承します。                                        |
| `name`             | いいえ       | `/model` ピッカーでの表示名（デフォルトは `id`）                                                                                             |
| `envKey`           | いいえ       | API キーの環境変数名（例: `OPENAI_API_KEY`）。任意/推奨。省略時は認証タイプのデフォルトの環境変数キーになります。 |
| `baseUrl`          | いいえ       | API エンドポイントのオーバーライド（プロキシやカスタムエンドポイントに有用）                                                                                     |
| `generationConfig` | いいえ       | `timeout`、`maxRetries`、`samplingParams` などを微調整します。                                                                                          |

> [!note]
>
> `settings.json`内の`env`フィールドを使用する場合、認証情報は平文で保存されます。セキュリティ向上のため、`.env`ファイルまたはシェル`export`の使用をお勧めします。詳細は[ステップ2](#step-2-set-environment-variables)を参照してください。

完全な `modelProviders` スキーマや `generationConfig`、`customHeaders`、`extra_body` などの高度なオプションについては、[Model Providers Reference](./model-providers.md) を参照してください。

#### ステップ 2: 環境変数を設定する [#step-2-set-environment-variables]

Qwen Code は環境変数（モデル設定の `envKey` で指定）から API キーを読み取ります。提供方法には複数の方法があり、以下に**優先度の高い順**に示します。

**1. シェル環境 / `export`（最高優先度）**

シェルプロファイル（`~/.zshrc`、`~/.bashrc` など）に直接設定するか、起動前にインラインで設定します。

```bash

# Alibaba Dashscope
export DASHSCOPE_API_KEY="sk-..."

# OpenAI / OpenAI-compatible
export OPENAI_API_KEY="sk-..."

# Anthropic
export ANTHROPIC_API_KEY="sk-ant-..."

# Google GenAI
export GEMINI_API_KEY="AIza..."
```

**2. `.env` ファイル**

Qwen Code は、見つかった**最初の** `.env` ファイルを自動的に読み込みます（変数は複数のファイル間で**マージされません**）。`process.env` にまだ存在しない変数のみが読み込まれます。

検索順序（現在のディレクトリから `/` に向かって上位へ）:

1. `.qwen/.env`（推奨 — Qwen Code の変数を他のツールから分離します）
2. `.env`

見つからない場合、**ホームディレクトリ**にフォールバックします。

3. `~/.qwen/.env`
4. `~/.env`

> [!tip]
>
> 他のツールとの競合を避けるため、`.env`よりも`.qwen/.env`の使用が推奨されます。一部の環境変数（`DEBUG`や`DEBUG_MODE`など）は、Qwen Codeの動作に干渉しないようプロジェクトレベルの`.env`ファイルから除外されています。

**3. `settings.json` → `env` フィールド（最低優先度）**

API キーは `~/.qwen/settings.json` の `env` キーの下に直接定義することもできます。これらは**最低優先度のフォールバック**として読み込まれ、変数がシステム環境または `.env` ファイルによってまだ設定されていない場合にのみ適用されます。

```json
{
  "env": {
    "DASHSCOPE_API_KEY": "sk-...",
    "OPENAI_API_KEY": "sk-...",
    "ANTHROPIC_API_KEY": "sk-ant-..."
  }
}
```

これは上記の [1 ファイルセットアップ例](#recommended-one-file-setup-via-settingsjson) で使用されているアプローチです。すべてを 1 か所にまとめておくのに便利ですが、`settings.json` が共有または同期される可能性があることに注意してください。機密性の高いシークレットには `.env` ファイルを優先してください。

**優先度の概要:**

| 優先度    | ソース                         | オーバーライド動作                            |
| ----------- | ------------------------------ | -------------------------------------------- |
| 1（最高） | CLI フラグ（`--openai-api-key`） | 常に優先                                  |
| 2           | システム環境（`export`、インライン）  | `.env` および `settings.json` → `env` をオーバーライド |
| 3           | `.env` ファイル                    | システム環境にない場合のみ設定               |
| 4（最低）  | `settings.json` → `env`        | システム環境または `.env` にない場合のみ設定     |

#### ステップ 3: `/model` でモデルを切り替える

Qwen Code を起動したら、`/model` コマンドを使用して設定されたすべてのモデルを切り替えます。モデルはプロトコルごとにグループ化されます。

```
/model
```

ピッカーには `modelProviders` 設定のすべてのモデルが表示され、プロトコル（`openai`、`anthropic`、`gemini` など）ごとにグループ化されます。選択内容はセッションをまたいで保持されます。

コマンドライン引数でモデルを直接切り替えることもできます。これは複数のターミナル間で作業する場合に便利です。

```bash
# In one terminal

qwen --model "qwen3-coder-plus"

# In another terminal

qwen --model "qwen3.5-plus"
```

## 組み込みプロバイダーの更新 [#built-in-provider-updates]

組み込みモデルリストを持つインストール済みプロバイダーでは、新しいプリセットがリリースされた際に**Built-in Provider Update**（組み込みプロバイダーの更新）が提供されることがあります。

QwenCloud（Token PlanおよびStandard API Key）とAlibaba ModelStudio（Coding Plan、Token PlanおよびStandard API Key）も起動時に`/models`を確認します。この確認には、`/auth`によって保存されたプロバイダー固有のAPIキー環境変数（例えば`BAILIAN_TOKEN_PLAN_API_KEY`）を使用し、`settings.env`からの値も含めます。CLIフラグ、`OPENAI_API_KEY`、または汎用認証設定を通じてのみ提供されたキーはこの確認を有効にしません。汎用キーは他のプロバイダーのエンドポイントに転送されません。

検出が成功すると、あなたのキーで提供されている組み込みモデルに更新が限定され、ユーザーが追加したモデルは保持されます。また、プラン切り替え後など、プリセットのリリースなしに提供されるセットが変更された場合にも更新が提供されることがあります。検出のみでは選択中のモデルが維持されますが、一度他へ切り替えると、後の起動時チェックでその削除が提案されることがあります。フィルタリングによりインストールすべき組み込みモデルが残らない場合、既存のプロバイダー設定がプロンプトなしで保持されます。提供されるセットのみが変更された場合、更新は新たに提供されるモデルのみを追加するため、`/auth`中に除外したモデルは再び追加されません。何も変更されない場合、プロンプトなしでチェック結果が記録されます。

検出が利用不可、失敗、またはどの組み込みモデルとも一致しない場合、プリセット更新は完全な組み込みリストを使用します。すでに最新の状態にあるインストールは変更されません。検出機能のないプロバイダーは引き続き組み込みリストを使用します。

**Later**（後で）を選択すると、同じバージョンまたは提供セットについて24時間後に再確認が行われます。異なる変更であれば引き続きプロンプトが表示されます。更新、スキップ、またはより新しい決定のサイレント記録により、以前の保留状態がクリアされます。**Skip**（スキップ）を選択すると、保持されているモデルを含む設定が維持されます。スキップされたプリセットバージョンは、より新しいものがリリースされるまで再度提供されず、スキップされた提供セットは、変更されるまで再度提供されません。

## 削除された `qwen auth` CLI コマンド

スタンドアロンの `qwen auth` CLI コマンドは削除されました。代わりに以下の代替手段を使用してください。

| 以前のユースケース                | 代替手段                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------------- |
| インタラクティブな認証設定 | `qwen` を実行し、`/auth` を使用                                                                |
| Coding Plan の設定                | `/auth` を使用、または Coding Plan ベース URL で `BAILIAN_CODING_PLAN_API_KEY` を設定             |
| Token Plan の設定                 | `/auth` を使用、またはリージョンの Token Plan ベース URL で `BAILIAN_TOKEN_PLAN_API_KEY` を設定    |
| OpenRouter の設定                 | `/auth` を使用、または `OPENROUTER_API_KEY` と `OPENAI_BASE_URL=https://openrouter.ai/api/v1` を設定 |
| Requesty の設定                   | `/auth` を使用、または `REQUESTY_API_KEY` と `OPENAI_BASE_URL=https://router.requesty.ai/v1` を設定  |
| API キーまたはカスタムプロバイダーの設定 | `~/.qwen/settings.json`、`.env`、またはプロバイダー固有の環境変数を設定       |
| 現在の認証を確認     | Qwen Code 内で `/doctor` を実行                                                              |
| OAuth ブラウザフロー               | `qwen` をインタラクティブに実行し、`/auth` を使用。OAuth は環境変数だけでは設定できません    |

`qwen auth status` などのレガシーな呼び出しは、これらの移行パスをまとめた削除通知を出力するようになりました。Token Plan のエントリには両リージョンのベース URL が含まれます。

## セキュリティに関する注意事項 [#security-notes]

- API キーをバージョン管理にコミットしないでください。
- プロジェクトローカルのシークレットには `.qwen/.env` を優先してください（また、Git の管理外に置いてください）。
- 認証情報を表示して検証する場合は、ターミナルの出力を機密として扱ってください。
