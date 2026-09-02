# DingTalk (Dingtalk)

このガイドでは、DingTalk（钉钉）上に Qwen Code チャンネルを設定する方法について説明します。

## 前提条件

- DingTalk の組織アカウント
- AppKey と AppSecret を持つ DingTalk ボットアプリケーション（下記参照）

## ボットの作成

1. [DingTalk デベロッパーポータル](https://open-dev.dingtalk.com) にアクセスします。
2. 新しいアプリケーションを作成するか、既存のものを使用します。
3. アプリケーションで、**Robot** 機能を有効にします。
4. Robot 設定で、**Stream モード**（机器人协议 → Stream 模式）を有効にします。
5. アプリケーションの認証情報ページから **AppKey**（Client ID）と **AppSecret**（Client Secret）をメモします。

### Stream モード

DingTalk Stream モードはアウトバウンドの WebSocket 接続を使用するため、パブリック URL やサーバーは不要です。ボットが DingTalk のサーバーに接続し、WebSocket を通じてメッセージがプッシュされます。これが最もシンプルなデプロイモデルです。

## 設定

`~/.qwen/settings.json` にチャンネルを追加します。

```json
{
  "channels": {
    "my-dingtalk": {
      "type": "dingtalk",
      "clientId": "$DINGTALK_CLIENT_ID",
      "clientSecret": "$DINGTALK_CLIENT_SECRET",
      "useConnectionManager": true,
      "senderPolicy": "open",
      "sessionScope": "user",
      "cwd": "/path/to/your/project",
      "instructions": "You are a concise coding assistant responding via DingTalk.",
      "groupPolicy": "open",
      "atSender": true,
      "groups": {
        "*": { "requireMention": true }
      }
    }
  }
}
```

認証情報を環境変数として設定します。

```bash
export DINGTALK_CLIENT_ID=<your-app-key>
export DINGTALK_CLIENT_SECRET=<your-app-secret>
```

または、`settings.json` の `env` セクションに定義します。

```json
{
  "env": {
    "DINGTALK_CLIENT_ID": "your-app-key",
    "DINGTALK_CLIENT_SECRET": "your-app-secret"
  }
}
```

### インタラクティブカード

`interactiveCards` オブジェクトを追加すると、DingTalk のステータスカードと質問カードをオプトインできます。このオブジェクトを省略すると、インタラクティブカードは無効になります。オブジェクトが存在する場合、全体のスイッチと両方のカードタイプはデフォルトで有効になり、質問カードは 270,000 ミリ秒（270 秒）後にタイムアウトします。

```json
{
  "channels": {
    "my-dingtalk": {
      "type": "dingtalk",
      "clientId": "$DINGTALK_CLIENT_ID",
      "clientSecret": "$DINGTALK_CLIENT_SECRET",
      "interactiveCards": {
        "enabled": true,
        "statusCard": { "enabled": true },
        "questionCard": {
          "enabled": true,
          "timeoutMs": 270000
        }
      }
    }
  }
}
```

`interactiveCards.enabled` を `false` に設定すると、すべてのインタラクティブカードを無効にします。`statusCard.enabled` または `questionCard.enabled` を使用してカードタイプを 1 つずつ無効にし、`questionCard.timeoutMs` に有限の正の数を設定して、Qwen Code が質問カードの応答を待機する時間を変更できます。2,147,483,647 ミリ秒（約 24.8 日）を超える値はその最大値に切り詰められます。インタラクティブカードは `settings.json` または管理 API を通じて設定されます。Web Shell チャンネルエディターはそれらを描画せず、他のフィールドを編集しても保存されたオブジェクトを保持します。

### 接続リカバリ

`useConnectionManager` のデフォルトは `true` です。接続マネージャーは Stream WebSocket を監視し、接続が応答を停止した際に DingTalk SDK クライアントを置き換えます。通常は有効のままにしておくべきです。

`"useConnectionManager": false` に設定すると、Qwen Code の接続マネージャーを無効にし、SDK のキープアライブと自動再接続の動作にフォールバックします。

## 実行

```bash
# DingTalk チャンネルのみを起動
qwen channel start my-dingtalk

# 設定済みの全チャンネルを一括起動
qwen channel start
```

DingTalk を開き、ボットにメッセージを送信します。エージェントが処理中は 👀 の絵文字リアクションが表示され、その後応答が返ってきます。

## デーモン Webhook 配信

チャンネルが `qwen serve` 配下で動作しているとき、認証済み外部 Webhook イベントは無人のエージェントタスクをトリガーし、最終的な Markdown 応答を DingTalk ユーザーまたはグループに配信できます。既存の Webhook ターゲットフィールドを使用します。別のチャンネルタイプは不要です。

```json
{
  "webhooks": {
    "sources": {
      "manual-test": {
        "secretEnv": "QWEN_CHANNEL_DINGTALK_TEST_SECRET",
        "targets": {
          "operator": {
            "chatId": "DINGTALK_USER_ID",
            "senderId": "webhook:manual-test",
            "isGroup": false
          },
          "team": {
            "chatId": "OPEN_CONVERSATION_ID",
            "senderId": "webhook:manual-test",
            "isGroup": true
          }
        }
      }
    }
  }
}
```

各ターゲットは `isGroup` を明示的に設定する必要があります。1対1チャットの場合、`chatId` は受信者の DingTalk ユーザー ID です。グループメッセージの場合、`chatId` はグループの `openConversationId` です。スレッドターゲットと受信ボット Webhook URL はプロアクティブ配信ではサポートされていません。完全なチャンネル設定とリクエスト形式については [Webhook トリガータスク](./overview#webhook-triggered-tasks) を参照してください。

## グループチャット

DingTalk ボットは DM とグループ会話の両方で動作します。グループ対応を有効にするには:

1. チャンネル設定で `groupPolicy` を `"allowlist"`、`"pairing"`、または `"open"` に設定します。
2. ボットを DingTalk グループに追加します。
3. グループ内でボットを @メンションすると応答がトリガーされます。
4. `groupPolicy: "pairing"` を使用している場合、応答が開始される前にグループのペアリングリクエストを一度承認してください。

デフォルトでは、グループチャットでは @メンションが必要です（`requireMention: true`）。特定のグループで全メッセージに応答させるには、`"requireMention": false` に設定します。詳細は [グループチャット](./overview#group-chats) を参照してください。

`"atSender": true` を設定すると、ボットがグループメッセージのトリガーとなったメンバーを @メンションします。デフォルトではオフで、DingTalk スタッフ ID を持つエージェントの応答にのみ適用されます。応答はメンションの有無に関わらず DingTalk markdown として送信され、メンションプレフィックスは最初のメッセージチャンクに含まれます。

### グループの会話 ID を確認する

DingTalk ではグループを識別するために `conversationId` が使用されます。グループにメッセージが送信されたときにチャンネルサービスのログで確認できます。ログ出力内の `conversationId` フィールドを探してください。

## 画像とファイル

テキストだけでなく、写真やドキュメントをボットに送信することもできます。

**写真:** 画像（スクリーンショット、図など）を送信すると、エージェントがそのビジョン機能を使用して解析します。これにはマルチモーダルモデルが必要です。チャンネル設定に `"model": "qwen3.5-plus"`（または他のビジョン対応モデル）を追加してください。DingTalk では画像を直接送信するか、リッチテキストメッセージ（テキスト＋画像の混合）の一部として送信できます。

**ファイル:** PDF、コードファイル、その他のドキュメントを送信します。ボットは DingTalk のサーバーからファイルをダウンロードし、ローカルに保存してエージェントがファイルツールで読み取れるようにします。音声ファイルや動画ファイルもサポートされています。これは任意のモデルで動作します。

## 転送されたチャットレコード

別のチャットからの連続メッセージをボットにまとめて転送できます（DingTalk の「結合転送」）。独立したメッセージとして、または返信先のメッセージとして転送できます。ボットはレコードをテキストに展開してエージェントに渡します。レコードのタイトルと要約がヘッダー行になり、各転送メッセージは `[Chat record messages]` の下に `Sender: message` として一覧表示されます。本文がテキストでない転送メッセージはプレースホルダーで表示されます — `[image]`、`[file: <name>]`、`[audio]`、`[video]`。

長いレコードは**上限が設定され、上限が告知されます**: 最大 50 メッセージ、合計最大 4000 文字、1 メッセージあたり最大 500 文字です。切り捨てられた部分は同じテキスト内でエージェントに報告されます — 省略されたメッセージには末尾に `[N more message(s) not shown]` の行が、短縮されたメッセージには ` [truncated]` マーカーが付きます。つまりエージェントは部分的なレコードについて回答していることを認識できます。全体が必要な場合は、小さなバッチに分割して転送してください。

**返信先として転送した**レコードは、送信ではなく引用として扱われます。引用テキストはすべてのチャンネルで 500 文字に制限されるため、レコードは 4000 文字ではなく 500 文字の予算でレンダリングされ、同じ告知が適用されます。返信先のレコードにはヘッダーと最初の 1〜2 件のメッセージが含まれると予想されます。全体をエージェントに渡すには、独立したメッセージとして転送してください。

転送されたレコードは自分以外の人が書いたものなので、そこから取り出されたすべて（タイトル、送信者名、メッセージ本文）はエージェントに届く前に中立化されます。そのため、転送されたメッセージがボットへの指示を装うことはできません。

上記の複数行レイアウトは、1対1チャットでエージェントが表示するものです。グループでは、メッセージ全体がエージェントに届く前に再度中立化され、1 行に折りたたまれ、マーカーの角括弧が削除されます。内容と上限の告知はどちらの場合も同じです。

## Telegram との主な違い

- **認証:** 静的なボットトークンの代わりに AppKey + AppSecret を使用します。SDK がアクセストークンのリフレッシュを自動的に管理します。
- **接続:** ポーリングではなく WebSocket ストリームを使用するため、パブリック IP や Webhook URL は不要です。
- **フォーマット:** 応答は DingTalk の Markdown 方言を使用します。Markdown テーブルは DingTalk クライアントにそのまま渡され、長いメッセージは約 3800 文字で分割されます。
- **動作中のインジケーター:** 処理中はユーザーのメッセージに 👀 の絵文字リアクションが追加され、応答送信時に削除されます。
- **メディアのダウンロード:** 2 段階のプロセスです。メッセージ内の `downloadCode` を DingTalk の API を介して一時的なダウンロード URL と交換します。
- **グループ:** DingTalk では、メッセージエンティティの解析ではなく `isInAtList` を使用して @メンションを検出します。

## ヒント

- **DingTalk Markdown に対応した指示を設定する** — DingTalk は見出し、太字、リンク、コードブロック、テーブルをサポートします。狭い画面では横スクロールする可能性があるため、テーブルはコンパクトに保ってください。
- **アクセスを制限する** — 組織のコンテキストでは `senderPolicy: "open"` が許容される場合があります。より厳密に制御するには `"allowlist"` または `"pairing"` を使用してください。詳細は [DM ペアリング](./overview#dm-pairing) を参照してください。
- **参照メッセージ** — ユーザーのメッセージに引用（返信）すると、その引用テキストがエージェントのコンテキストとして含まれます。引用されたメッセージが画像、ファイル、音声、または動画メッセージの場合、ボットは直接送信された場合と同じ方法でそれをダウンロードして添付します。ボットの応答の引用はまだサポートされていません。

## トラブルシューティング

### ボットが接続しない

- AppKey と AppSecret が正しいことを確認してください。
- `qwen channel start` を実行する前に環境変数が設定されていることを確認してください。
- DingTalk デベロッパーポータルのボット設定で **Stream モード** が有効になっていることを確認してください。
- ターミナル出力で接続エラーを確認してください。

### グループ内でボットが応答しない

- `groupPolicy` が `"allowlist"`、`"pairing"`、または `"open"` に設定されていることを確認してください（デフォルトは `"disabled"` です）。
- `"pairing"` を使用している場合、グループのペアリングリクエストが承認されていることを確認してください。
- グループメッセージでボットを @メンションしていることを確認してください。
- ボットがグループに追加されていることを確認してください。

### "No sessionWebhook in message"

これは、DingTalk がメッセージコールバックに応答エンドポイントを含めていないことを意味します。ボットの権限設定が誤っている可能性があります。デベロッパーポータルでボットの設定を確認してください。

### "Unable to process this message"

返信は失敗のカテゴリを特定し、次のステップを提案します。問題が続く場合は、返信に表示されている参照をボット管理者に伝えてください。同じ参照がチャンネルプロセスログの詳細エラーの横に表示されます。
