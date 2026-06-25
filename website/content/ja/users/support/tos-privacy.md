# Qwen Code: 利用規約とプライバシー通知

Qwen Code は、Qwen Code チームがメンテナンスするオープンソースの AI コーディングアシスタントツールです。本ドキュメントでは、Qwen Code の認証方法および AI モデルサービスを使用する際に適用される利用規約とプライバシーポリシーについて説明します。

## 認証方法の確認方法

Qwen Code は AI モデルへのアクセスに 3 つの認証方法をサポートしています。ご利用の認証方法によって、適用される利用規約とプライバシーポリシーが異なります。

1. **Qwen OAuth** — qwen.ai アカウントでログイン（無料プランは 2026-04-15 に廃止）
2. **Alibaba Cloud Coding Plan** — Alibaba Cloud の API キーを使用
3. **API Key** — 独自の API キーを使用

各認証方法において、基盤となるサービスプロバイダーによって異なる利用規約とプライバシー通知が適用される場合があります。

| 認証方法                  | プロバイダー      | 利用規約                                                           | プライバシー通知                                                   |
| :------------------------ | :---------------- | :----------------------------------------------------------------- | :----------------------------------------------------------------- |
| Qwen OAuth                | Qwen AI           | [Qwen Terms of Service](https://qwen.ai/termsservice)              | [Qwen Privacy Policy](https://qwen.ai/privacypolicy)               |
| Alibaba Cloud Coding Plan | Alibaba Cloud     | See [details below](#2-if-you-are-using-alibaba-cloud-coding-plan) | See [details below](#2-if-you-are-using-alibaba-cloud-coding-plan) |
| API Key                   | 各プロバイダー    | ご利用の API プロバイダーに依存（OpenAI、Anthropic など）          | ご利用の API プロバイダーに依存                                    |

## 1. Qwen OAuth 認証をご利用の場合

qwen.ai アカウントで認証する場合、以下の利用規約とプライバシー通知ドキュメントが適用されます。

- **利用規約:** [Qwen Terms of Service](https://qwen.ai/termsservice) に準拠します。
- **プライバシー通知:** データの収集と利用については [Qwen Privacy Policy](https://qwen.ai/privacypolicy) に記載されています。

認証のセットアップ、クォータ、サポートされている機能の詳細については、[Authentication Setup](../configuration/settings) を参照してください。

## 2. Alibaba Cloud Coding Plan をご利用の場合

Alibaba Cloud の API キーで認証する場合、Alibaba Cloud の利用規約とプライバシー通知が適用されます。

Alibaba Cloud Coding Plan は 2 つのリージョンで利用可能です。

- **阿里云百炼 (aliyun.com)** — [bailian.console.aliyun.com](https://bailian.console.aliyun.com)
- **Alibaba Cloud (alibabacloud.com)** — [bailian.console.alibabacloud.com](https://bailian.console.alibabacloud.com)

> [!important]
>
> Alibaba Cloud Coding Plan をご利用の場合、Alibaba Cloud の利用規約およびプライバシーポリシーに従うことになります。データの使用、保存、プライバシーに関する具体的な詳細については、Alibaba Cloud のドキュメントをご確認ください。

## 3. 独自の API Key をご利用の場合

他のプロバイダーの API キーで認証する場合、適用される利用規約とプライバシー通知はご選択のプロバイダーによって異なります。

> [!important]
>
> 独自の API キーを使用する場合、Qwen Code の規約ではなく、ご選択の API プロバイダーの利用規約およびプライバシーポリシーに従うことになります。データの使用、保存、プライバシーに関する具体的な詳細については、プロバイダーのドキュメントをご確認ください。

Qwen Code は OpenAI 互換の各種プロバイダーをサポートしています。詳細な情報については、各プロバイダーの利用規約およびプライバシーポリシーをご参照ください。

## 利用統計とテレメトリー

Qwen Code は、ユーザーエクスペリエンスと製品品質の向上を目的として、匿名の利用統計および [テレメトリー](../../developers/development/telemetry) データを収集する場合があります。このデータ収集はオプションであり、設定から制御できます。

### 収集されるデータ

有効化されている場合、Qwen Code は以下を収集する場合があります。

- 匿名の利用統計（実行コマンド、パフォーマンス指標）
- エラーレポートとクラッシュデータ
- 機能の使用パターン

### 認証方法別のデータ収集

- **Qwen OAuth:** 利用統計は Qwen のプライバシーポリシーに準拠します。Qwen Code の設定からオプトアウトできます。
- **Alibaba Cloud Coding Plan:** 利用統計は Alibaba Cloud のプライバシーポリシーに準拠します。Qwen Code の設定からオプトアウトできます。
- **API Key:** Qwen Code がご選択の API プロバイダーの収集データを超えて追加のデータを収集することはありません。

## よくある質問（FAQ）

### 1. プロンプトや回答を含むコードは AI モデルのトレーニングに使用されますか？

プロンプトや回答を含むコードが AI モデルのトレーニングに使用されるかどうかは、認証方法とご利用の AI サービスプロバイダーによって異なります。

- **Qwen OAuth**: データの使用は [Qwen's Privacy Policy](https://qwen.ai/privacy) に準拠します。データ収集とモデルトレーニングに関する具体的な詳細については、Qwen のポリシーをご参照ください。

- **Alibaba Cloud Coding Plan**: データの使用は Alibaba Cloud のプライバシーポリシーに準拠します。データ収集とモデルトレーニングに関する具体的な詳細については、Alibaba Cloud のポリシーをご参照ください。

- **API Key**: データの使用はご選択の API プロバイダーに完全に依存します。各プロバイダーは独自のデータ使用ポリシーを持っています。ご利用のプロバイダーのプライバシーポリシーと利用規約をご確認ください。

**重要**: Qwen Code 自体は、モデルトレーニングにプロンプト、コード、または回答を使用しません。トレーニング目的でのデータ使用は、認証先の AI サービスプロバイダーのポリシーに準拠します。

### 2. 利用統計とは何ですか？オプトアウトで何が制御されますか？

**利用統計**設定は、ユーザーエクスペリエンスと製品品質の向上を目的とした Qwen Code によるオプションのデータ収集を制御します。

有効化されている場合、Qwen Code は以下を収集する場合があります。

- 匿名のテレメトリー（実行コマンド、パフォーマンス指標、機能の使用状況）
- エラーレポートとクラッシュデータ
- 一般的な使用パターン

**Qwen Code が収集しないもの:**

- コードの内容
- AI モデルに送信されたプロンプト
- AI モデルからの回答
- 個人情報

利用統計設定は Qwen Code 自体によるデータ収集のみを制御します。ご選択の AI サービスプロバイダー（Qwen、OpenAI など）が独自のプライバシーポリシーに基づいて収集するデータには影響しません。

### 3. 認証方法を切り替えるにはどうすればよいですか？

Qwen OAuth、Alibaba Cloud Coding Plan、および独自の API キーはいつでも切り替えられます。

1. **起動時**: プロンプトが表示されたら、希望の認証方法を選択する
2. **CLI 内**: `/auth` コマンドを使用して認証方法を再設定する
3. **環境変数**: API キーの自動認証のために `.env` ファイルを設定する

詳細な手順については、[Authentication Setup](../configuration/auth.md) のドキュメントを参照してください。
