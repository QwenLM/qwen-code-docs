# DingTalk Webhook の 1対1チャット配信設計

## ステータス

実装済みで、1対1チャットの実リンク検証を完了。対応する Issue:
[QwenLM/qwen-code#6883](https://github.com/QwenLM/qwen-code/issues/6883)。

## 背景

デーモンがホストするチャネルは、認証済みの外部 Webhook イベントを受信し、エージェントを無人タスクとして実行し、最終結果を事前に設定されたチャット対象にプロアクティブに配信できます。現在、DingTalk はグループチャットへの配信のみをサポートしています: 対象は `isGroup: true` を設定する必要があり、adapter はグループメッセージ API を介して Markdown を送信します。

これにより、CI システムや監視アラートなどの Webhook ソースは、担当の DingTalk ユーザーに直接通知できず、グループチャットへの配信しかできません。

## ゴール

- デーモンの Webhook タスク結果を DingTalk の 1対1チャット対象に配信する。
- 既存の DingTalk グループチャット Webhook 配信の動作を変更しない。
- 通常のプロアクティブ配信とチャネルループは引き続き DingTalk のグループチャット対象のみを受け付け、インバウンドの 1対1チャットのセッション ID をユーザー ID として扱わない。
- 既存の対象設定構造、トークンキャッシュ、Markdown フォーマット、メッセージ分割、リトライ、配信エラー処理を再利用する。
- 既存の DingTalk チャネルを踏襲し、新しいチャネルや設定フィールドは追加しない。

## ノンゴール

- DingTalk ネイティブの Card または Card コールバック。
- Card のストリーミング更新、ボタン、フィードバック、または DingTalk からのタスクキャンセル。
- 単一対象への複数受信者の設定。
- DingTalk のトピック配信。
- 新しいチャネルタイプの追加やデーモンの Webhook プロトコルの変更。

## 対象設定

新しい設定フィールドは不要です。既存の Webhook 対象フィールドの DingTalk チャネルにおける意味は以下のとおりです:

| `isGroup` | `chatId` の意味                 | 配信 API                      |
| --------- | ----------------------------- | ----------------------------- |
| `true`    | DingTalk グループチャットの `openConversationId` | `robot/groupMessages/send`    |
| `false`   | DingTalk ユーザー ID                   | `robot/oToMessages/batchSend` |

`senderId` は引き続き、Webhook タスクをエージェントセッションにルーティングするために使用する仮想的な identity であり、DingTalk の受信者 ID ではありません。

設定例:

```json
{
  "webhooks": {
    "sources": {
      "github-ci": {
        "secretEnv": "QWEN_CHANNEL_GITHUB_CI_SECRET",
        "targets": {
          "operator": {
            "chatId": "DINGTALK_USER_ID",
            "senderId": "webhook:github-ci",
            "isGroup": false
          },
          "team": {
            "chatId": "OPEN_CONVERSATION_ID",
            "senderId": "webhook:github-ci",
            "isGroup": true
          }
        }
      }
    }
  }
}
```

対象は `isGroup` を明示的に設定する必要があります。以下の対象は引き続き adapter に拒否されます: `chatId` が空、`threadId` が設定されている、`isGroup` が欠落している、または安定した対象 ID の代わりに Webhook URL を使用している場合。

## 配信チェーン

デーモンのルーティングとワーカーの IPC は不変です。共用のチャネルランタイムは、Webhook 専用の対象チェックを追加するのみです:

```text
POST /channels/:channelName/webhooks/:source
  -> デーモンがイベントの認証と検証を行う
  -> チャネルワーカーが無人エージェントタスクを実行する
  -> ChannelBase が DingtalkChannel.pushProactive() を呼び出す
  -> adapter が target.isGroup に基づき DingTalk API を選択する
  -> DingTalk が Markdown を受信する
```

共用のチャネルランタイムは、独立した Webhook 対象のケーパビリティチェックを使用します。デフォルト実装は引き続き、通常のプロアクティブ配信の対象ルールを踏襲します。DingTalk は Webhook タスクの解決時に `isGroup: false` を追加で受け入れるのみです。したがって、通常のチャネルループは引き続き 1対1チャット対象を拒否し、インバウンドの 1対1チャットの `conversationId` を、1対1メッセージ API に必要なユーザー ID と誤認することを回避します。

グループチャット対象は引き続き既存のリクエストボディを使用します:

```json
{
  "robotCode": "CLIENT_ID",
  "openConversationId": "OPEN_CONVERSATION_ID",
  "msgKey": "sampleMarkdown",
  "msgParam": "{...}"
}
```

1対1チャット対象は、1対1メッセージ API を介して同じ Markdown テンプレートを送信します:

```json
{
  "robotCode": "CLIENT_ID",
  "userIds": ["DINGTALK_USER_ID"],
  "msgKey": "sampleMarkdown",
  "msgParam": "{...}"
}
```

2 つのパスは既存のアクセストークンキャッシュを共用し、トークンの有効期限 1 分前にリフレッシュします。HTTP 401 に遭遇した場合は 1 回リトライします。同時に、同じ Markdown の正規化と分割の制限を使用します。複数分割の配信は、最初の分割が失敗した時点で停止します。

## エラー処理

- 無効な対象は、エージェントの実行前に Webhook タスクの検証を通過できない。
- トークン取得の失敗は引き続き配信失敗として扱い、認証情報を公開せずにログに記録する。
- HTTP 401 はキャッシュされたトークンをクリアし、現在の分割に対して 1 回リトライする。
- その他の非成功 HTTP レスポンスは配信を中断し、チャネルワーカーのログにマスク済みの API エラー詳細を出力する。
- デーモンが返す `202 {"accepted": true}` は、引き続きワーカーがタスクを受け取ったことのみを示し、DingTalk への配信成功を意味しない。

今期の範囲では Markdown のみをサポートするため、Markdown のフォールバック戦略を設計する必要はありません。

## テスト

### ユニットテスト

- Webhook は明示的に設定されたグループチャットと 1対1チャットの対象を受け付け、通常のプロアクティブ配信は引き続きグループチャット対象のみを受け付ける。
- `isGroup` の欠落、ID が空、Webhook URL の使用、`threadId` の設定がある対象を拒否する。
- 既存のグループチャットのエンドポイントと、`openConversationId` を含むリクエストボディは不変を維持する。
- 1対1チャットは 1対1メッセージのエンドポイントと、`userIds` を含むリクエストボディを使用する。
- グループチャットと 1対1チャットの送信はキャッシュされたトークンを共用する。
- HTTP 401 の後にトークンをリフレッシュし、1 回のみリトライする。
- 1対1チャットの配信も同様に、メッセージ分割と最初の失敗で中断するルールに従う。

### ローカルエンドツーエンド検証

`.qwen/e2e-tests/` 配下にテスト計画を作成し、まずグローバルインストールされた `qwen` CLI を使用して、現在の 1対1チャット Webhook 対象が拒否されるベースラインの動作を記録します。実装完了後:

1. 1対1チャット対象とグループチャット対象をそれぞれ 1 つずつ設定する。
2. DingTalk チャネルを有効化し、`qwen serve` を起動する。
3. `curl` を使用して、2 つの `targetRef` にそれぞれ 1 件のイベントを送信する。
4. 両方のリクエストが `202` を返すことを確認する。
5. チャネルワーカーが 2 つのタスクを完了したことを確認する。
6. 対象の DingTalk ユーザーとグループチャットの両方が、期待どおりの Markdown メッセージを受信したことを確認する。

ローカルに利用可能な DingTalk の認証情報や受信対象がない場合は、ユニットテストを自動化された配信検証とし、欠落しているオンライン検証の手順を明示します。

## ドキュメント

チャネル Webhook のドキュメントを更新し、DingTalk の 1対1チャットとグループチャットの 2 種類の対象設定を示し、1対1チャット対象の `chatId` には DingTalk ユーザー ID を記入することを説明します。

## 互換性

今回は増分の変更です。既存のグループチャット対象の設定、検証、エンドポイント、リクエストボディ、フォーマット、リトライの動作はすべて不変で、設定の移行は不要です。共用ランタイムに追加された Webhook 対象チェックは、デフォルトで元のプロアクティブ配信の対象チェックに委譲するため、他のチャネルの動作は不変です。
