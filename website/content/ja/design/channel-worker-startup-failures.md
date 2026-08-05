# Channel worker の起動失敗レポート

## 背景

[Issue #6909](https://github.com/QwenLM/qwen-code/issues/6909) は、デーモン管理のチャネルにおける診断上のギャップを指摘している。アダプターの `connect()` の拒否は worker によってログに記録されるが、worker はその後 ready を報告するか、`No channels connected.` で終了するだけである。そのため、supervisor、動的制御 API、SDK、CLI は、対処可能なプロバイダーのエラーを失ってしまう。

この変更は、有界でサニタイズされた `connect()` の失敗を、worker の起動境界を通じて伝搬させる。設定の解析、extension の読み込み、アダプターの構築、デーモン起動時の fail-fast 挙動、起動後の失敗履歴は変更しない。

## 挙動

- 選択されたアダプターが少なくとも 1 つ接続できれば、worker は ready になる。その現在のスナップショットには、失敗したチャネル名と理由が含まれ、動的な有効化は引き続き `partial: true` を伴う成功を返す。
- 動的な有効化、置き換え、リロード中にすべてのアダプターが失敗した場合、リクエストは試行された失敗を含めて `502 channel_worker_start_failed` を返す。`state` はロールバック後の現在の状態を記述し、試行された失敗はその状態には永続化されない。
- デーモン起動時にすべてのアダプターが失敗した場合、起動は引き続き fail-fast である。デーモンのリスナーは利用可能なままではないため、後続の GET は約束されない。
- 新しい worker 世代は、前の世代の起動失敗をクリアする。

これらのレコードを生成するのは `connect()` の拒否のみである。`phase` は現在 `connect` である。SDK は意図的にこれを `string` に広げており、将来の追加的なフェーズが破壊的な型変更を必要としないようにしている。アダプターの `code` の値は診断用であり、アダプター間で安定した分類体系ではない。

## 契約

現在の worker スナップショットには、次が含まれる場合がある:

```ts
interface ChannelStartupFailure {
  channel: string;
  phase: 'connect';
  code?: string;
  message: string;
}

interface ChannelWorkerSnapshot {
  startupFailures?: ChannelStartupFailure[];
  startupFailuresTruncated?: boolean;
}
```

動的な起動の失敗には、信頼された supervisor のワークスペースを注記した失敗を追加で含めることができる:

```ts
interface ChannelStartupAttemptFailure extends ChannelStartupFailure {
  workspaceCwd: string;
}
```

既存のトップレベルのエラー文字列、ロールバックフィールド、state は引き続き互換性がある。新しいフィールドはすべて任意である。

## IPC とライフサイクル

子プロセスは、各 `connect()` の catch から 1 つの `channel_startup_failure` メッセージを送信し、次のアダプターを試す前に `channel_startup_report_ack` を待機する。親は検証、サニタイズ、保存を行い、その後でのみその項目を確認応答する。送信コールバックは耐久性の境界ではない: それは Node がメッセージを受け入れたことを証明するだけであり、worker が同期的に終了する前に supervisor がそれを処理したことを証明するのは ACK の方である。

転送される失敗は最大 64 件である。65 件目の失敗は 1 つの `channel_startup_failures_truncated` マーカーを生成し、これも確認応答される。それ以降の失敗は stderr のみとなる。未処理のレポートは常に 1 つだけであるため、ACK にリクエスト識別子は不要である。

不正形式、長すぎる、順序が異なる、または確認応答不能な起動プロトコルメッセージは、有界の起動を失敗させ、子プロセスを終了させる。無関係な未知の IPC メッセージは、既存の挙動を維持する。既存の ready スキーマと検証は、意図的に変更しない。

ready 前のすべての終端パスは、すでに受け入れた失敗を `ChannelWorkerStartupError` にラップする。Reconcile とマネージャーのエラーは、クリーンアップやリストアの問題を `rollbackError` として別途保持しつつ、それらの詳細を複製する。ワークスペースは supervisor の設定から追加され、子プロセスの IPC から追加されることは決してない。

## セキュリティと上限

worker と supervisor はどちらも、制御文字と不可視文字を正規化し、デーモントークンと機密な環境変数の値を正確にマスク（redact）し、汎用の認証情報ルールを適用し、Unicode コードポイント単位で切り詰める。動的失敗の HTTP レスポンスと CLI 表示の境界は、再度検証し、汎用のマスキングを適用し、出力に上限を設け、不正形式のエントリを無視する。

上限は、失敗 64 件、channel 128 コードポイント、code 64、message 512 である。失敗オブジェクトとスナップショットは、所有権の境界で複製され、呼び出し元が supervisor の状態を変更できないようにする。

## 却下された代替案

- supervisor で stderr を読み取る方法は曖昧で、挙動をログの文章に結合してしまい、信頼できるチャネルの帰属を提供できない。
- `process.send()` のコールバックのみを待機する方法は、依然として worker の同期的な終了と競合する。
- 最後に失敗した試行を永続化すると、ライフサイクルのセマンティクスが変わり、別の last-error/history の作業と重複する。動的な失敗は、失敗したレスポンス内にのみ存在する。
- auth/network/config のカテゴリを考案すると、アダプター間で不安定な分類体系が生まれる。実装は、アダプターが提供する文字列または有限の数値コードのみを保持する。

## 検証

ユニットカバレッジは、ACK の順序付け、全失敗／一部失敗、中断とタイムアウトのパス、不正形式のプロトコル入力、ACK の失敗、安全な例外アクセス、正確なマスキングと汎用のマスキング、ディープコピー、世代のリセット、64/65 の切り詰め、ロールバックの伝播、HTTP の検証、SDK のエクスポート、CLI のフォーマットを検証する。実際の plugin-example 統合テストは、ローカルで割り当ててからクローズしたポートを使用し、外部の認証情報やネットワーク依存なしに決定論的な `ECONNREFUSED` を生成する。
