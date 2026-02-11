# 認証

Qwen Code は2つの認証方法をサポートしています。CLI の実行方法に合わせて適切なものを選択してください。

- **Qwen OAuth (推奨)**: ブラウザで `qwen.ai` アカウントを使用してサインインします。
- **API キー**: API キーを使用して、サポートされているプロバイダーに接続します。より柔軟性があり、OpenAI、Anthropic、Google GenAI、Alibaba Cloud Bailian、およびその他の互換性のあるエンドポイントをサポートしています。

![](https://gw.alicdn.com/imgextra/i4/O1CN01yXSXc91uYxJxhJXBF_!!6000000006050-2-tps-2372-916.png)

## 👍 オプション 1: Qwen OAuth (推奨 & 無料)

Qwen モデルを使用しており、最もシンプルなセットアップを行いたい場合に使用してください。

- **仕組み**: 最初の起動時に、Qwen Code がブラウザのログインページを開きます。ログインが完了すると、認証情報はローカルにキャッシュされるため、通常は次回以降のログインは不要です。
- **必要条件**: `qwen.ai` アカウント + インターネット接続（初回ログイン時のみ）
- **利点**: API キー管理不要、認証情報の自動更新
- **料金と割当**: 無料で、**1分間に60リクエスト**、**1日あたり1,000リクエスト**の割当があります。

CLI を起動し、ブラウザのフローに従ってください：

```bash
qwen
```

> [!note]
>
> 非対話型またはヘッドレス環境（例：CI、SSH、コンテナ）では、通常 **OAuth ブラウザログインフローを完了できません**。  
> このような場合は、API キー認証方式を使用してください。

## 🚀 オプション 2: API キー (柔軟性あり)

どのプロバイダーおよびモデルを使用するかをより柔軟に制御したい場合に使用します。OpenAI、Anthropic、Google GenAI、アリババクラウド・百煉 (Bailian)、Azure OpenAI、OpenRouter、ModelScope、またはセルフホスト可能な互換エンドポイントなど、複数のプロトコルおよびプロバイダーをサポートしています。

### オプション1: コーディングプラン（アリババクラウド バイリアン）

qwen3-coder-plus モデルでより高い利用割当と予測可能なコストを求める場合に使用します。

- **仕組み**: 固定の月額料金でコーディングプランに登録し、Qwen Code を専用エンドポイントと登録済み API キーを使用するように設定します。
- **要件**: [アリババクラウド バイリアン](https://bailian.console.aliyun.com/cn-beijing/?tab=globalset#/efm/coding_plan) から有効なコーディングプランサブスクリプションを取得してください。
- **メリット**: 利用割当が増加し、毎月の費用が予測可能になり、最新の qwen3-coder-plus モデルにアクセスできます。
- **料金と割当**: [アリババクラウド バイリアン コーディングプランのドキュメント](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3005961) を参照してください。

ターミナルで `qwen` と入力して Qwen Code を起動し、`/auth` コマンドを入力して `API-KEY` を選択します。

![](https://gw.alicdn.com/imgextra/i4/O1CN01yXSXc91uYxJxhJXBF_!!6000000006050-2-tps-2372-916.png)

入力後、`Coding Plan` を選択します。

![](https://gw.alicdn.com/imgextra/i4/O1CN01Irk0AD1ebfop69o0r_!!6000000003890-2-tps-2308-830.png)

`sk-sp-xxxxxxxxx` のキーを入力し、`/model` コマンドを使用してすべてのバイリアン `Coding Plan` がサポートするモデル間を切り替えます。

![](https://gw.alicdn.com/imgextra/i4/O1CN01fWArmf1kaCEgSmPln_!!6000000004699-2-tps-2304-1374.png)

### オプション2: サードパーティのAPIキー

OpenAI、Anthropic、Google、Azure OpenAI、OpenRouter、ModelScope、またはセルフホスト型エンドポイントなどのサードパーティプロバイダに接続したい場合に使用してください。

キーポイントは **モデルプロバイダ** (`modelProviders`) です。Qwen CodeはOpenAIだけでなく、複数のAPIプロトコルをサポートしています。`~/.qwen/settings.json` を編集して利用可能なプロバイダとモデルを設定し、実行時に `/model` コマンドでそれらを切り替えることができます。

#### サポートされているプロトコル

| プロトコル            | `modelProviders` キー | 環境変数                                                     | プロバイダー                                                                                        |
| --------------------- | --------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| OpenAI 互換           | `openai`              | `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`          | OpenAI、Azure OpenAI、OpenRouter、ModelScope、Alibaba Cloud Bailian、任意の OpenAI 互換エンドポイント |
| Anthropic             | `anthropic`           | `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_MODEL` | Anthropic Claude                                                                                    |
| Google GenAI          | `gemini`              | `GEMINI_API_KEY`, `GEMINI_MODEL`                             | Google Gemini                                                                                       |
| Google Vertex AI      | `vertex-ai`           | `GOOGLE_API_KEY`, `GOOGLE_MODEL`                             | Google Vertex AI                                                                                    |

#### ステップ 1: `~/.qwen/settings.json` で `modelProviders` を設定する

各プロトコルで利用可能なモデルを定義します。各モデルエントリには、最低限 `id` と `envKey`（API キーを保持する環境変数名）が必要です。

> [!important]
>
> プロジェクト設定とユーザー設定の間でマージコンフリクトが発生しないように、ユーザー範囲の `~/.qwen/settings.json` に `modelProviders` を定義することをお勧めします。

`~/.qwen/settings.json` を編集します（存在しない場合は作成してください）：

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

1つの設定で複数のプロトコルとモデルを混在させることができます。`ModelConfig` のフィールドは以下の通りです：

| フィールド           | 必須   | 説明                                                                 |
| -------------------- | ------ | -------------------------------------------------------------------- |
| `id`                 | はい   | API に送信されるモデル ID（例: `gpt-4o`, `claude-sonnet-4-20250514`） |
| `name`               | いいえ | `/model` ピッカーでの表示名（デフォルトは `id`）                     |
| `envKey`             | はい   | API キーの環境変数名（例: `OPENAI_API_KEY`）                         |
| `baseUrl`            | いいえ | API エンドポイントのオーバーライド（プロキシやカスタムエンドポイント用） |
| `generationConfig`   | いいえ | `timeout`、`maxRetries`、`samplingParams` などの微調整              |

> [!note]
>
> 認証情報は決して `settings.json` に保存されません。実行時に `envKey` で指定された環境変数から読み込まれます。

`generationConfig`、`customHeaders`、`extra_body` などの高度なオプションを含む完全な `modelProviders` スキーマについては、[設定リファレンス → modelProviders](settings.md#modelproviders) を参照してください。

#### ステップ 2: 環境変数の設定

Qwen Code は、環境変数（モデル設定の `envKey` で指定）から API キーを読み取ります。以下に提供方法を示します（**優先度が高い順**）：

**1. シェル環境 / `export` （最優先）**

シェルプロファイル（`~/.zshrc`、`~/.bashrc` など）で直接設定するか、起動前にインラインで設定してください：

```bash

# Alibaba Dashscope
export DASHSCOPE_API_KEY="sk-..."

# OpenAI / OpenAI 互換
export OPENAI_API_KEY="sk-..."

# Anthropic
export ANTHROPIC_API_KEY="sk-ant-..."
```

# Google GenAI
```bash
export GEMINI_API_KEY="AIza..."
```

**2. `.env` ファイル**

Qwen Code は見つかった**最初の**`.env` ファイルを自動的に読み込みます（変数は複数のファイル間で**マージされません**）。`process.env` に既に存在しない変数のみが読み込まれます。

検索順序（現在のディレクトリから `/` に向かって上方向へ探索）：

1. `.qwen/.env` （推奨 — Qwen Code の変数を他のツールから分離できます）
2. `.env`

何も見つからない場合、**ホームディレクトリ**に戻ります：

3. `~/.qwen/.env`
4. `~/.env`

> [!tip]
>
> 他のツールとの競合を避けるために、`.env` よりも `.qwen/.env` を使用することをお勧めします。一部の変数（`DEBUG` や `DEBUG_MODE` など）は、Qwen Code の動作に干渉しないようにプロジェクトレベルの `.env` ファイルから除外されます。

**3. `settings.json` → `env` フィールド（最低優先度）**

`~/.qwen/settings.json` 内の `env` キー以下で直接環境変数を定義することもできます。これらは**最低優先度のフォールバック**として読み込まれます — 変数がシステム環境または `.env` ファイルによって既に設定されていない場合にのみ適用されます。

```json
{
  "env": {
    "DASHSCOPE_API_KEY":"sk-...",
    "OPENAI_API_KEY": "sk-...",
    "ANTHROPIC_API_KEY": "sk-ant-...",
    "GEMINI_API_KEY": "AIza..."
  },
  "modelProviders": {
    ...
  }
}
```

> [!note]
>
> これは、すべての設定（プロバイダ + 認証情報）を単一ファイルに保持したい場合に便利です。ただし、`settings.json` は共有または同期される可能性があるため、機密的なシークレットには `.env` ファイルを使用してください。

**優先度のまとめ：**

| 優先度      | ソース                           | 上書き動作                                 |
| ----------- | -------------------------------- | ------------------------------------------ |
| 1（最高）   | CLI フラグ（`--openai-api-key`） | 常に勝ちます                               |
| 2           | システム環境（`export`、インライン） | `.env` および `settings.env` を上書き      |
| 3           | `.env` ファイル                  | システム環境にない場合にのみ設定           |
| 4（最低）   | `settings.json` → `env`          | システム環境や `.env` にない場合にのみ設定 |

#### ステップ 3: `/model` でモデルを切り替える

Qwen Code を起動した後、`/model` コマンドを使用して、設定されたすべてのモデル間を切り替えることができます。モデルはプロトコルごとにグループ化されます。

```
/model
```

ピッカーには、`modelProviders` 設定から取得したすべてのモデルが、そのプロトコル（例: `openai`、`anthropic`、`gemini`）ごとにグループ化されて表示されます。選択内容はセッション間で保持されます。

また、コマンドライン引数を使用してモデルを直接切り替えることもでき、複数のターミナルで作業する場合に便利です。

```bash

# 1つのターミナルでは

qwen --model "qwen3-coder-plus"

# 別のターミナルでは

qwen --model "qwen3-coder-next"
```

## セキュリティに関する注意点

- API キーをバージョン管理にコミットしないでください。
- プロジェクトローカルなシークレットには `.qwen/.env` を使用してください（そしてそれを git に含めないでください）。
- 認証情報を表示して検証する場合、ターミナル出力を機密情報として扱ってください。