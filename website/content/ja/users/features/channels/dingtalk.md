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

## 実行

```bash
# DingTalk チャンネルのみを起動
qwen channel start my-dingtalk

# 設定済みの全チャンネルを一括起動
qwen channel start
```

DingTalk を開き、ボットにメッセージを送信します。エージェントが処理中は 👀 の絵文字リアクションが表示され、その後応答が返ってきます。

## グループチャット

DingTalk ボットは DM とグループ会話の両方で動作します。グループ対応を有効にするには:

1. チャンネル設定で `groupPolicy` を `"allowlist"` または `"open"` に設定します。
2. ボットを DingTalk グループに追加します。
3. グループ内でボットを @メンションすると応答がトリガーされます。

デフォルトでは、グループチャットでは @メンションが必要です（`requireMention: true`）。特定のグループで全メッセージに応答させるには、`"requireMention": false` に設定します。詳細は [グループチャット](./overview#group-chats) を参照してください。

### グループの会話 ID を確認する

DingTalk ではグループを識別するために `conversationId` が使用されます。グループにメッセージが送信されたときにチャンネルサービスのログで確認できます。ログ出力内の `conversationId` フィールドを探してください。

## 画像とファイル

テキストだけでなく、写真やドキュメントをボットに送信することもできます。

**写真:** 画像（スクリーンショット、図など）を送信すると、エージェントがそのビジョン機能を使用して解析します。これにはマルチモーダルモデルが必要です。チャンネル設定に `"model": "qwen3.5-plus"`（または他のビジョン対応モデル）を追加してください。DingTalk では画像を直接送信するか、リッチテキストメッセージ（テキスト＋画像の混合）の一部として送信できます。

**ファイル:** PDF、コードファイル、その他のドキュメントを送信します。ボットは DingTalk のサーバーからファイルをダウンロードし、ローカルに保存してエージェントがファイルツールで読み取れるようにします。音声ファイルや動画ファイルもサポートされています。これは任意のモデルで動作します。

## Telegram との主な違い

- **認証:** 静的なボットトークンの代わりに AppKey + AppSecret を使用します。SDK がアクセストークンのリフレッシュを自動的に管理します。
- **接続:** ポーリングではなく WebSocket ストリームを使用するため、パブリック IP や Webhook URL は不要です。
- **フォーマット:** 応答は DingTalk の Markdown 方言（限られたサブセット）を使用します。テーブルは DingTalk でレンダリングされないため、自動的にプレーンテキストに変換されます。長いメッセージは約 3800 文字で分割されます。
- **動作中のインジケーター:** 処理中はユーザーのメッセージに 👀 の絵文字リアクションが追加され、応答送信時に削除されます。
- **メディアのダウンロード:** 2 段階のプロセスです。メッセージ内の `downloadCode` を DingTalk の API を介して一時的なダウンロード URL と交換します。
- **グループ:** DingTalk では、メッセージエンティティの解析ではなく `isInAtList` を使用して @メンションを検出します。

## ヒント

- **DingTalk Markdown に対応した指示を設定する** — DingTalk は限られた Markdown サブセット（見出し、太字、リンク、コードブロック。ただしテーブルは不可）をサポートします。「DingTalk markdown を使用し、テーブルは避けてください」などの指示を追加すると、エージェントが適切にフォーマットするのに役立ちます。
- **アクセスを制限する** — 組織のコンテキストでは `senderPolicy: "open"` が許容される場合があります。より厳密に制御するには `"allowlist"` または `"pairing"` を使用してください。詳細は [DM ペアリング](./overview#dm-pairing) を参照してください。
- **参照メッセージ** — ユーザーのメッセージに引用（返信）すると、その引用テキストがエージェントのコンテキストとして含まれます。ボットの応答の引用はまだサポートされていません。

## トラブルシューティング

### ボットが接続しない

- AppKey と AppSecret が正しいことを確認してください。
- `qwen channel start` を実行する前に環境変数が設定されていることを確認してください。
- DingTalk デベロッパーポータルのボット設定で **Stream モード** が有効になっていることを確認してください。
- ターミナル出力で接続エラーを確認してください。

### グループ内でボットが応答しない

- `groupPolicy` が `"allowlist"` または `"open"` に設定されていることを確認してください（デフォルトは `"disabled"` です）。
- グループメッセージでボットを @メンションしていることを確認してください。
- ボットがグループに追加されていることを確認してください。

### "No sessionWebhook in message"

これは、DingTalk がメッセージコールバックに応答エンドポイントを含めていないことを意味します。ボットの権限設定が誤っている可能性があります。デベロッパーポータルでボットの設定を確認してください。

### "Sorry, something went wrong processing your message"

これは通常、エージェントでエラーが発生したことを意味します。詳細についてはターミナル出力を確認してください。