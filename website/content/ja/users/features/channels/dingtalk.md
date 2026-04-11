# DingTalk (Dingtalk)

このガイドでは、DingTalk（钉钉）に Qwen Code チャネルを設定する方法について説明します。

## 前提条件

- DingTalk の組織アカウント
- AppKey と AppSecret を持つ DingTalk ボットアプリケーション（下記参照）

## ボットの作成

1. [DingTalk Developer Portal](https://open-dev.dingtalk.com) にアクセスします
2. 新しいアプリケーションを作成します（既存のものを使用しても構いません）
3. アプリケーション配下で **Robot** 機能を有効にします
4. Robot 設定で **Stream Mode** を有効にします（机器人协议 → Stream 模式）
5. アプリケーションの認証情報ページから **AppKey**（Client ID）と **AppSecret**（Client Secret）を控えておきます

### Stream Mode

DingTalk の Stream Mode は外向きの WebSocket 接続を使用するため、公開 URL やサーバーは不要です。ボットが DingTalk のサーバーに接続し、メッセージが WebSocket 経由でプッシュされます。これは最もシンプルなデプロイモデルです。

## 設定

チャネルを `~/.qwen/settings.json` に追加します：

```json
{
  "channels": {
    "my-dingtalk": {
      "type": "dingtalk",
      "clientId": "$DINGTALK_CLIENT_ID",
      "clientSecret": "$DINGTALK_CLIENT_SECRET",
      "senderPolicy": "open",
      "sessionScope": "user",
      "cwd": "/path/to/your/project",
      "instructions": "You are a concise coding assistant responding via DingTalk.",
      "groupPolicy": "open",
      "groups": {
        "*": { "requireMention": true }
      }
    }
  }
}
```

認証情報を環境変数として設定します：

```bash
export DINGTALK_CLIENT_ID=<your-app-key>
export DINGTALK_CLIENT_SECRET=<your-app-secret>
```

または、`settings.json` の `env` セクションで定義します：

```json
{
  "env": {
    "DINGTALK_CLIENT_ID": "your-app-key",
    "DINGTALK_CLIENT_SECRET": "your-app-secret"
  }
}
```

## 実行

```bash
# Start only the DingTalk channel
qwen channel start my-dingtalk

# Or start all configured channels together
qwen channel start
```

DingTalk を開き、ボットにメッセージを送信します。エージェントが処理中に 👀 の絵文字リアクションが表示され、その後レスポンスが届くはずです。

## グループチャット

DingTalk ボットは DM（ダイレクトメッセージ）とグループチャットの両方で動作します。グループチャットを有効にするには：

1. チャネル設定で `groupPolicy` を `"allowlist"` または `"open"` に設定します
2. ボットを DingTalk のグループに追加します
3. グループ内でボットを @mention してレスポンスをトリガーします

デフォルトでは、グループチャットでボットが応答するには @mention が必要です（`requireMention: true`）。特定のグループで `"requireMention": false` を設定すると、すべてのメッセージに応答するようになります。詳細は [Group Chats](./overview#group-chats) を参照してください。

### グループの Conversation ID の確認方法

DingTalk はグループの識別に `conversationId` を使用します。グループ内でメッセージが送信された際のチャネルサービスログで、ログ出力内の `conversationId` フィールドを確認できます。

## 画像とファイル

テキストだけでなく、写真やドキュメントもボットに送信できます。

**画像:** 画像（スクリーンショット、図など）を送信すると、エージェントがビジョン機能を使用して解析します。これにはマルチモーダルモデルが必要です。チャネル設定に `"model": "qwen3.5-plus"`（または他のビジョン対応モデル）を追加してください。DingTalk では、画像を直接送信するか、リッチテキストメッセージ（テキストと画像の混合）の一部として送信できます。

**ファイル:** PDF、コードファイル、その他のドキュメントを送信できます。ボットは DingTalk のサーバーからファイルをダウンロードしてローカルに保存し、エージェントがファイルツールで読み取れるようにします。音声ファイルや動画ファイルもサポートされています。これはどのモデルでも動作します。

## Telegram との主な違い

- **認証:** 静的なボットトークンの代わりに AppKey + AppSecret を使用します。SDK がアクセストークンの更新を自動的に管理します。
- **接続:** ポーリングの代わりに WebSocket ストリームを使用するため、公開 IP や Webhook URL は不要です。
- **フォーマット:** レスポンスには DingTalk の Markdown 構文（制限されたサブセット）が使用されます。DingTalk はテーブルをレンダリングしないため、自動的にプレーンテキストに変換されます。長いメッセージは約 3800 文字で分割されます。
- **処理中表示:** 処理中にユーザーのメッセージに 👀 の絵文字リアクションが追加され、レスポンス送信時に削除されます。
- **メディアダウンロード:** 2段階のプロセスです。メッセージ内の `downloadCode` を DingTalk の API 経由で一時的なダウンロード URL と交換します。
- **グループ:** メッセージエンティティの解析ではなく、`isInAtList` を使用して @mention を検出します。

## ヒント

- **DingTalk の Markdown を意識した指示を使用する** — DingTalk は制限された Markdown サブセット（見出し、太字、リンク、コードブロックはサポートされるが、テーブルはサポートされない）をサポートしています。「DingTalk の Markdown を使用してください。テーブルは避けてください。」などの指示を追加すると、エージェントがレスポンスを正しくフォーマットするのに役立ちます。
- **アクセスを制限する** — 組織内での利用であれば `senderPolicy: "open"` で問題ない場合があります。より厳密な制御が必要な場合は `"allowlist"` または `"pairing"` を使用してください。詳細は [DM Pairing](./overview#dm-pairing) を参照してください。
- **引用メッセージ** — ユーザーメッセージを引用（返信）すると、引用されたテキストがエージェントのコンテキストとして含まれます。ボットのレスポンスを引用する機能はまだサポートされていません。

## トラブルシューティング

### ボットが接続されない

- AppKey と AppSecret が正しいことを確認します
- `qwen channel start` を実行する前に環境変数が設定されていることを確認します
- DingTalk Developer Portal のボット設定で **Stream Mode** が有効になっていることを確認します
- ターミナルの出力に接続エラーがないか確認します

### ボットがグループで応答しない

- `groupPolicy` が `"allowlist"` または `"open"` に設定されていることを確認します（デフォルトは `"disabled"`）
- グループメッセージでボットを @mention していることを確認します
- ボットがグループに追加されていることを確認します

### "No sessionWebhook in message"

これは、DingTalk がメッセージコールバックに返信エンドポイントを含めていないことを意味します。ボットの権限設定が誤っている場合に発生することがあります。Developer Portal でボットの設定を確認してください。

### "Sorry, something went wrong processing your message"

これは通常、エージェントでエラーが発生したことを意味します。詳細はターミナルの出力を確認してください。