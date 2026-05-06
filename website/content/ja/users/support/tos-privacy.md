# Qwen Code: 利用規約およびプライバシー通知

Qwen Codeは、Qwen CodeチームがメンテナンスしているオープンソースのAIコーディングアシスタントツールです。本ドキュメントでは、Qwen Codeの認証方法およびAIモデルサービスを利用する際に適用される利用規約とプライバシーポリシーについて説明します。

## 認証方法の確認方法

Qwen Codeは、AIモデルにアクセスするための3つの認証方法をサポートしています。適用される利用規約およびプライバシーポリシーは、選択した認証方法によって異なります。

1. **Qwen OAuth** — qwen.aiアカウントでログイン（無料枠は2026年4月15日に終了）
2. **Alibaba Cloud Coding Plan** — Alibaba CloudのAPIキーを使用
3. **API Key** — 独自のAPIキーを使用

各認証方法において、基盤となるサービスプロバイダーに応じて異なる利用規約およびプライバシー通知が適用される場合があります。

| 認証方法 | プロバイダー | 利用規約 | プライバシー通知 |
| :------------------------ | :---------------- | :----------------------------------------------------------------- | :----------------------------------------------------------------- |
| Qwen OAuth                | Qwen AI           | [Qwen Terms of Service](https://qwen.ai/termsservice)              | [Qwen Privacy Policy](https://qwen.ai/privacypolicy)               |
| Alibaba Cloud Coding Plan | Alibaba Cloud     | [詳細は以下を参照](#2-if-you-are-using-alibaba-cloud-coding-plan) | [詳細は以下を参照](#2-if-you-are-using-alibaba-cloud-coding-plan) |
| API Key                   | 各種プロバイダー | 選択したAPIプロバイダー（OpenAI、Anthropicなど）に依存      | 選択したAPIプロバイダーに依存                                |

## 1. Qwen OAuth認証を使用している場合

qwen.aiアカウントを使用して認証する場合、以下の利用規約およびプライバシー通知ドキュメントが適用されます。

- **利用規約:** 利用は[Qwen Terms of Service](https://qwen.ai/termsservice)に準拠します。
- **プライバシー通知:** データの収集および利用については、[Qwen Privacy Policy](https://qwen.ai/privacypolicy)に記載されています。

認証の設定方法、クォータ、サポートされる機能の詳細については、[Authentication Setup](../configuration/settings)を参照してください。

## 2. Alibaba Cloud Coding Planを使用している場合

Alibaba CloudのAPIキーを使用して認証する場合、Alibaba Cloudの利用規約およびプライバシー通知が適用されます。

Alibaba Cloud Coding Planは、以下の2つのリージョンで利用可能です。

- **阿里云百炼 (aliyun.com)** — [bailian.console.aliyun.com](https://bailian.console.aliyun.com)
- **Alibaba Cloud (alibabacloud.com)** — [bailian.console.alibabacloud.com](https://bailian.console.alibabacloud.com)

> [!important]
>
> Alibaba Cloud Coding Planを使用する場合、Alibaba Cloudの利用規約およびプライバシーポリシーに従う必要があります。データの使用方法、保持期間、プライバシーに関する具体的な詳細については、Alibaba Cloudのドキュメントをご確認ください。

## 3. 独自のAPIキーを使用している場合

他のプロバイダーのAPIキーを使用して認証する場合、適用される利用規約およびプライバシー通知は、選択したプロバイダーによって異なります。

> [!important]
>
> 独自のAPIキーを使用する場合、Qwen Codeの利用規約ではなく、選択したAPIプロバイダーの利用規約およびプライバシーポリシーに従う必要があります。データの使用方法、保持期間、プライバシーに関する具体的な詳細については、ご利用のプロバイダーのドキュメントをご確認ください。

Qwen Codeは、OpenAI互換の各種プロバイダーをサポートしています。詳細については、ご利用のプロバイダーの利用規約およびプライバシーポリシーを参照してください。

## 利用統計とテレメトリ

Qwen Codeは、ユーザーエクスペリエンスと製品品質の向上を目的として、匿名化された利用統計および[テレメトリ](../../developers/development/telemetry)データを収集する場合があります。このデータ収集は任意であり、設定を通じて制御できます。

### 収集されるデータ

有効化されている場合、Qwen Codeは以下のデータを収集する場合があります。

- 匿名化された利用統計（実行されたコマンド、パフォーマンス指標）
- エラーレポートおよびクラッシュデータ
- 機能の利用パターン

### 認証方法別のデータ収集

- **Qwen OAuth:** 利用統計はQwenのプライバシーポリシーに準拠します。Qwen Codeの設定からオプトアウト（無効化）できます。
- **Alibaba Cloud Coding Plan:** 利用統計はAlibaba Cloudのプライバシーポリシーに準拠します。Qwen Codeの設定からオプトアウト（無効化）できます。
- **API Key:** 選択したAPIプロバイダーが収集するデータ以外に、Qwen Codeが追加でデータを収集することはありません。

## よくある質問（FAQ）

### 1. プロンプトや回答を含む私のコードは、AIモデルの学習に使用されますか？

プロンプトや回答を含むコードがAIモデルの学習に使用されるかどうかは、認証方法およびご利用のAIサービスプロバイダーによって異なります。

- **Qwen OAuth**: データの利用は[Qwen's Privacy Policy](https://qwen.ai/privacy)に準拠します。データの収集およびモデル学習に関する具体的な詳細については、同ポリシーをご参照ください。

- **Alibaba Cloud Coding Plan**: データの利用はAlibaba Cloudのプライバシーポリシーに準拠します。データの収集およびモデル学習に関する具体的な詳細については、同ポリシーをご参照ください。

- **API Key**: データの利用は、選択したAPIプロバイダーに完全に依存します。各プロバイダーには独自のデータ利用ポリシーがあります。ご利用のプロバイダーのプライバシーポリシーおよび利用規約をご確認ください。

**重要**: Qwen Code自体は、モデル学習のためにプロンプト、コード、または回答を使用しません。学習目的でのデータ利用は、認証に使用したAIサービスプロバイダーのポリシーに準拠します。

### 2. 利用統計とは何か、またオプトアウト設定は何を制御しますか？

**利用統計**設定は、ユーザーエクスペリエンスと製品品質の向上を目的としたQwen Codeによる任意のデータ収集を制御します。

有効化されている場合、Qwen Codeは以下のデータを収集する場合があります。

- 匿名化されたテレメトリ（実行されたコマンド、パフォーマンス指標、機能の利用状況）
- エラーレポートおよびクラッシュデータ
- 一般的な利用パターン

**Qwen Codeが収集しないデータ:**

- コードの内容
- AIモデルに送信されたプロンプト
- AIモデルからの回答
- 個人情報

利用統計設定は、Qwen Code自体によるデータ収集のみを制御します。選択したAIサービスプロバイダー（Qwen、OpenAIなど）が独自のプライバシーポリシーに基づいて収集するデータには影響しません。

### 3. 認証方法を切り替えるにはどうすればよいですか？

Qwen OAuth、Alibaba Cloud Coding Plan、独自のAPIキーはいつでも切り替え可能です。

1. **起動時**: プロンプトが表示された際に、希望する認証方法を選択
2. **CLI内**: `/auth`コマンドを使用して認証方法を再設定
3. **環境変数**: `.env`ファイルを設定してAPIキー認証を自動化

詳細な手順については、[Authentication Setup](../configuration/settings#environment-variables-for-api-access)ドキュメントを参照してください。