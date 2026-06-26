# Telegram

このガイドでは、Telegram 上で Qwen Code チャンネルをセットアップする方法について説明します。

## 前提条件

- Telegram アカウント
- Telegram ボットトークン（下記参照）

## ボットの作成

1. Telegram を開き、[@BotFather](https://t.me/BotFather) を検索します
2. `/newbot` を送信し、画面の指示に従って名前とユーザー名を選択します
3. BotFather からボットトークンが発行されます。安全に保管してください

## ユーザー ID の確認

`senderPolicy: "allowlist"` または `"pairing"` を使用するには、Telegram ユーザー ID（数値のID、ユーザー名ではありません）が必要です。

最も簡単な確認方法:

1. Telegram で [@userinfobot](https://t.me/userinfobot) を検索します
2. 任意のメッセージを送信すると、ユーザー ID が返信されます

## 設定

`~/.qwen/settings.json` にチャンネルを追加します:

```json
{
  "channels": {
    "my-telegram": {
      "type": "telegram",
      "token": "$TELEGRAM_BOT_TOKEN",
      "senderPolicy": "allowlist",
      "allowedUsers": ["YOUR_USER_ID"],
      "sessionScope": "user",
      "cwd": "/path/to/your/project",
      "instructions": "You are a concise coding assistant responding via Telegram. Keep responses short.",
      "groupPolicy": "disabled",
      "groups": {
        "*": { "requireMention": true }
      }
    }
  }
}
```

ボットトークンを環境変数として設定します:

```bash
export TELEGRAM_BOT_TOKEN=<your-token-from-botfather>
```

または、実行前に読み込まれる `.env` ファイルに追加します。

## 実行

```bash
# Telegram チャンネルのみ起動
qwen channel start my-telegram

# 設定されたすべてのチャンネルをまとめて起動
qwen channel start
```

その後、Telegram でボットを開き、メッセージを送信します。すぐに "Working..." と表示され、続いてエージェントの応答が返ってきます。

## グループチャット

Telegram グループでボットを使用する場合:

1. チャンネル設定で `groupPolicy` を `"allowlist"` または `"open"` に設定します
2. **BotFather でプライバシーモードを無効**にします: `/mybots` → ボットを選択 → Bot Settings → Group Privacy → Turn Off
3. ボットをグループに追加します。すでにグループにいる場合は、**一度削除してから再追加**してください（Telegram は参加時のプライバシー設定をキャッシュします）
4. `groupPolicy: "allowlist"` を使用する場合は、設定の `groups` にグループのチャット ID を追加します

デフォルトでは、ボットはグループ内で @メンションまたは返信があった場合のみ応答します。特定のグループで `"requireMention": false` を設定すると、すべてのメッセージに応答するようになります（専用タスクグループに便利です）。詳細は[グループチャット](./overview#group-chats)を参照してください。

## 画像とファイル

テキストだけでなく、写真やドキュメントをボットに送信できます。

**写真:** 写真を送信すると、エージェントはビジョン機能を使用して分析します。これにはマルチモーダルモデルが必要です。チャンネル設定に `"model": "qwen3.5-plus"`（または他のビジョン対応モデル）を追加してください。写真のキャプションはメッセージテキストとして渡されます。

**ドキュメント:** PDF、コードファイル、その他のドキュメントを送信します。ボットはファイルをダウンロードしてローカルに保存し、エージェントがファイルツールで読み取れるようにします。これは任意のモデルで動作します。Telegram のファイルサイズ制限は20MBです。

## ヒント

- **インストラクションは簡潔に** — Telegram のメッセージ文字数制限は4096文字です。「応答は短く」などの指示を追加すると、エージェントが制限内に収まりやすくなります。
- **`sessionScope: "user"` を使用** — これにより、ユーザーごとに個別の会話が割り当てられます。`/clear` で会話をリセットできます。
- **アクセスを制限** — 固定ユーザーには `senderPolicy: "allowlist"` を、新しいユーザーが CLI で承認するコードを使ってアクセスをリクエストできるようにするには `"pairing"` を使用します。詳細は[DMペアリング](./overview#dm-pairing)を参照してください。

## メッセージフォーマット

エージェントのマークダウン応答は自動的に Telegram 互換の HTML に変換されます。コードブロック、太字、斜体、リンク、リストがすべてサポートされています。

## トラブルシューティング

### ボットが応答しない

- ボットトークンが正しく、環境変数が設定されているか確認してください
- `senderPolicy: "allowlist"` を使用している場合、ユーザー ID が `allowedUsers` に含まれているか、`"pairing"` を使用している場合は承認されているか確認してください
- ターミナルの出力でエラーを確認してください

### グループでボットが応答しない

- `groupPolicy` が `"allowlist"` または `"open"` に設定されているか確認してください（デフォルトは `"disabled"`）
- `"allowlist"` を使用している場合、グループのチャット ID が `groups` 設定に含まれているか確認してください
- **BotFather で Group Privacy がオフになっている**ことを確認してください。これがないと、ボットはグループ内の非コマンドメッセージを認識できません
- プライバシーモードを変更した後、すでにグループにいるボットは**一度削除してから再追加**してください
- デフォルトではボットは @メンションまたは返信が必要です。`@yourbotname hello` でテストしてください

### 「メッセージの処理中に問題が発生しました」

通常、エージェントでエラーが発生したことを意味します。ターミナルの出力で詳細を確認してください。

### ボットの応答に時間がかかる

エージェントが複数のツール呼び出し（ファイル読み取り、検索など）を実行している可能性があります。"Working..." インジケータはエージェントが処理中であることを示します。複雑なタスクには1分以上かかることがあります。