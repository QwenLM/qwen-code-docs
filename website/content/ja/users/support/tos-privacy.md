# Qwen Code: 利用規約とプライバシー通知

Qwen Code は、Qwen Code チームがメンテナンスするオープンソースの AI コーディングアシスタントツールです。このドキュメントは、Qwen Code の認証方法と AI モデルサービスを使用する際に適用される利用規約とプライバシーポリシーを説明します。

## 認証方法の確認方法

Qwen Code は、AI モデルにアクセスするための4つの認証方法をサポートしています。認証方法によって、利用に適用される利用規約とプライバシーポリシーが異なります。

1. **Qwen OAuth** — qwen.ai アカウントでログイン（無料ティアは2026年4月15日に終了）
2. **Alibaba Cloud Coding Plan** — Alibaba Cloud の API キーを使用
3. **API Key** — 独自の API キーを使用
4. **Vertex AI** — Google Cloud Vertex AI を使用

各認証方法によって、適用される利用規約とプライバシー通知は、基盤となるサービスプロバイダーにより異なる場合があります。

| 認証方法 | プロバイダー | 利用規約 | プライバシー通知 |
| :--- | :--- | :--- | :--- |
| Qwen OAuth | Qwen AI | [Qwen 利用規約](https://qwen.ai/termsservice) | [Qwen プライバシーポリシー](https://qwen.ai/privacypolicy) |
| Alibaba Cloud Coding Plan | Alibaba Cloud | [下記の詳細を参照](#2-if-you-are-using-alibaba-cloud-coding-plan) | [下記の詳細を参照](#2-if-you-are-using-alibaba-cloud-coding-plan) |
| API Key | 各種プロバイダー | 選択した API プロバイダー（OpenAI、Anthropic など）に依存 | 選択した API プロバイダーに依存 |
| Vertex AI | Google Cloud | [Google Cloud 利用規約](https://cloud.google.com/terms) | [Google Cloud プライバシー](https://cloud.google.com/privacy) |

## 1. Qwen OAuth 認証を使用する場合

qwen.ai アカウントを使用して認証する場合、以下の利用規約とプライバシー通知が適用されます。

- **利用規約:** あなたの利用は [Qwen 利用規約](https://qwen.ai/termsservice) に準拠します。
- **プライバシー通知:** あなたのデータの収集と使用については、[Qwen プライバシーポリシー](https://qwen.ai/privacypolicy) に記載されています。

認証設定、割り当て量、サポートされる機能の詳細については、[認証設定](../configuration/settings) を参照してください。

## 2. If you are using Alibaba Cloud Coding Plan

Alibaba Cloud の API キーを使用して認証する場合、Alibaba Cloud の該当する利用規約とプライバシー通知が適用されます。

Alibaba Cloud Coding Plan は2つのリージョンで利用可能です。

- **阿里云百炼 (aliyun.com)** — [bailian.console.aliyun.com](https://bailian.console.aliyun.com)
- **Alibaba Cloud (alibabacloud.com)** — [bailian.console.alibabacloud.com](https://bailian.console.alibabacloud.com)

> [!important]
>
> Alibaba Cloud Coding Plan を使用する場合、Alibaba Cloud の利用規約とプライバシーポリシーが適用されます。データの使用、保持、プライバシー慣行に関する具体的な詳細については、Alibaba Cloud のドキュメントを確認してください。

## 3. 独自の API キーを使用する場合

他のプロバイダーの API キーを使用して認証する場合、該当する利用規約とプライバシー通知は選択したプロバイダーに依存します。

> [!important]
>
> 独自の API キーを使用する場合、Qwen Code の利用規約ではなく、選択した API プロバイダーの利用規約とプライバシーポリシーが適用されます。データの使用、保持、プライバシー慣行に関する具体的な詳細については、プロバイダーのドキュメントを確認してください。

Qwen Code は、OpenAI 互換のさまざまなプロバイダーをサポートしています。詳細については、各プロバイダーの利用規約とプライバシーポリシーを参照してください。

## 4. Vertex AI を使用する場合

Google Cloud Vertex AI で認証する場合、該当する利用規約とプライバシー通知は Google Cloud のものになります。

> [!important]
>
> Vertex AI を使用する場合、Qwen Code の利用規約ではなく、[Google Cloud 利用規約](https://cloud.google.com/terms) と [Google Cloud プライバシー通知](https://cloud.google.com/privacy) が適用されます。データの使用、保持、プライバシー慣行に関する具体的な詳細については、Google Cloud のドキュメントを確認してください。

## 使用統計とテレメトリー

Qwen Code は、ユーザー体験と製品品質を向上させるために、匿名の使用統計と [テレメトリー](../../developers/development/telemetry) データを収集することがあります。このデータ収集はオプションであり、設定を通じて制御できます。

### 収集されるデータ

有効にすると、Qwen Code は以下を収集することがあります。

- 匿名の使用統計（実行されたコマンド、パフォーマンスメトリクス）
- エラーレポートとクラッシュデータ
- 機能の使用パターン

### 認証方法ごとのデータ収集

- **Qwen OAuth:** 使用統計は Qwen のプライバシーポリシーに準拠します。Qwen Code の設定からオプトアウトできます。
- **Alibaba Cloud Coding Plan:** 使用統計は Alibaba Cloud のプライバシーポリシーに準拠します。Qwen Code の設定からオプトアウトできます。
- **API Key:** Qwen Code が追加でデータを収集することはありません。選択した API プロバイダーが収集するデータのみが対象です。
- **Vertex AI:** 使用統計は Google Cloud のプライバシーポリシーに準拠します。Qwen Code が Google Cloud の収集するデータ以外を追加で収集することはありません。

## よくある質問（FAQ）

### 1. プロンプトや回答を含む私のコードは、AI モデルのトレーニングに使用されますか？

プロンプトや回答を含むコードが AI モデルのトレーニングに使用されるかどうかは、認証方法と使用する AI サービスプロバイダーによって異なります。

- **Qwen OAuth**: データ使用は [Qwen のプライバシーポリシー](https://qwen.ai/privacypolicy) に準拠します。データ収集とモデルトレーニングの慣行に関する具体的な詳細については、Qwen のポリシーを参照してください。

- **Alibaba Cloud Coding Plan**: データ使用は Alibaba Cloud のプライバシーポリシーに準拠します。データ収集とモデルトレーニングの慣行に関する具体的な詳細については、Alibaba Cloud のポリシーを参照してください。

- **API Key**: データ使用は選択した API プロバイダーに完全に依存します。各プロバイダーには独自のデータ使用ポリシーがあります。使用するプロバイダーのプライバシーポリシーと利用規約を確認してください。

- **Vertex AI**: データ使用は [Google Cloud 利用規約](https://cloud.google.com/terms) と [プライバシー通知](https://cloud.google.com/privacy) に準拠します。データ収集とモデルトレーニングの慣行に関する具体的な詳細については、Google Cloud のポリシーを参照してください。

**重要**: Qwen Code 自体は、プロンプト、コード、応答をモデルトレーニングに使用することはありません。トレーニング目的でのデータ使用は、認証する AI サービスプロバイダーのポリシーに準拠します。

### 2. 使用統計とは何ですか？オプトアウト設定では何を制御しますか？

**使用統計** 設定は、Qwen Code によるユーザー体験と製品品質向上のためのオプションのデータ収集を制御します。

有効にすると、Qwen Code は以下を収集することがあります。

- 匿名テレメトリー（実行されたコマンド、パフォーマンスメトリクス、機能使用状況）
- エラーレポートとクラッシュデータ
- 一般的な使用パターン

**Qwen Code が収集しないもの:**

- コードの内容
- AI モデルに送信されたプロンプト
- AI モデルからの応答
- 個人情報

使用統計設定は、Qwen Code 自体のデータ収集のみを制御します。選択した AI サービスプロバイダー（Qwen、OpenAI など）が独自のプライバシーポリシーに従って収集するデータには影響しません。

### 3. 認証方法を切り替えるにはどうすればよいですか？

Qwen OAuth、Alibaba Cloud Coding Plan、独自の API キー、Vertex AI の間はいつでも切り替えることができます。

1. **起動時:** プロンプトが表示されたら、希望の認証方法を選択します。
2. **CLI 内:** `/auth` コマンドを使用して認証方法を再設定します。
3. **環境変数:** `.env` ファイルを設定して、API キーによる自動認証を行います。

詳細な手順については、[認証設定](../configuration/auth.md) のドキュメントを参照してください。