# Telegram

このガイドでは、Telegram に Qwen Code チャンネルを設定する方法について説明します。

## 前提条件

- Telegram アカウント
- Telegram ボットトークン（下記参照）

## ボットの作成

1. Telegram を開き、[@BotFather](https://t.me/BotFather) を検索します
2. `/newbot` を送信し、プロンプトに従って名前とユーザー名を選択します
3. BotFather がボットトークンを発行するので、安全な場所に保存してください

## ユーザー ID の確認

`senderPolicy: "allowlist"` または `"pairing"` を使用するには、Telegram のユーザー ID（ユーザー名ではなく数値 ID）が必要です。

確認する最も簡単な方法は次のとおりです。

1. Telegram で [@userinfobot](https://t.me/userinfobot) を検索します
2. 任意のメッセージを送信すると、ユーザー ID が返信されます

## 設定

チャネル設定を `~/.qwen/settings.json` に追加します。

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

ボットトークンを環境変数として設定します。

```bash
export TELEGRAM_BOT_TOKEN=<your-token-from-botfather>
```

または、実行前に読み込まれる `.env` ファイルに追加します。

## 実行

```bash
# Start only the Telegram channel
qwen channel start my-telegram

# Or start all configured channels together
qwen channel start
```

その後、Telegram でボットを開いてメッセージを送信します。すぐに「Working...」が表示され、その後にエージェントからの応答が届きます。

## グループチャット

Telegram のグループでボットを使用するには：

1. チャネル設定で `groupPolicy` を `"allowlist"` または `"open"` に設定します
2. BotFather で **プライバシーモードを無効化** します：`/mybots` → ボットを選択 → Bot Settings → Group Privacy → Turn Off
3. ボットをグループに追加します。すでにグループに参加している場合は、**一度削除して再度追加してください**（Telegram はボット参加時のプライバシー設定をキャッシュするため）
4. `groupPolicy: "allowlist"` を使用する場合は、設定の `groups` にグループのチャット ID を追加します

デフォルトでは、グループ内で応答するには @メンションまたは返信が必要です。特定のグループで `"requireMention": false` を設定すると、すべてのメッセージに応答するようになります（専用タスクグループなどに便利です）。詳細は [Group Chats](./overview#group-chats) を参照してください。

## 画像とファイル

テキストだけでなく、写真やドキュメントもボットに送信できます。

**写真：** 写真を送信すると、エージェントがビジョン機能を使用して解析します。これにはマルチモーダルモデルが必要です。チャネル設定に `"model": "qwen3.5-plus"`（または他のビジョン対応モデル）を追加してください。写真のキャプションはメッセージテキストとして渡されます。

**ドキュメント：** PDF、コードファイル、または任意のドキュメントを送信します。ボットがファイルをダウンロードしてローカルに保存するため、エージェントがファイルツールで読み取れます。これはどのモデルでも動作します。Telegram のファイルサイズ制限は 20MB です。

## ヒント

- **指示は簡潔に** — Telegram には 4096 文字のメッセージ制限があります。「応答は短くする」などの指示を追加すると、エージェントが制限内に収まりやすくなります。
- **`sessionScope: "user"` を使用する** — これにより、ユーザーごとに個別の会話セッションが作成されます。`/clear` を使用して会話をリセットできます。
- **アクセスを制限する** — 固定ユーザーには `senderPolicy: "allowlist"` を使用し、新規ユーザーには `"pairing"` を使用して、CLI で承認するコードによるアクセスリクエストを許可します。詳細は [DM Pairing](./overview#dm-pairing) を参照してください。

## メッセージのフォーマット

エージェントの Markdown 応答は、Telegram 互換の HTML に自動的に変換されます。コードブロック、太字、斜体、リンク、リストがすべてサポートされています。

## トラブルシューティング

### ボットが応答しない

- ボットトークンが正しく、環境変数が設定されているか確認します
- `senderPolicy: "allowlist"` を使用している場合は `allowedUsers` にユーザー ID が含まれているか、`"pairing"` を使用している場合は承認済みか確認します
- ターミナルの出力にエラーがないか確認します

### グループ内でボットが応答しない

- `groupPolicy` が `"allowlist"` または `"open"` に設定されているか確認します（デフォルトは `"disabled"`）
- `"allowlist"` を使用している場合は、`groups` 設定にグループのチャット ID が含まれているか確認します
- BotFather で **Group Privacy がオフになっているか確認します** — これが有効なままだと、ボットはグループ内のコマンド以外のメッセージを認識できません
- ボットをグループに追加した後にプライバシーモードを変更した場合は、**ボットを一度削除して再度追加してください**
- デフォルトでは、ボットは @メンションまたは返信を必要とします。テストするには `@yourbotname hello` を送信してください

### "Sorry, something went wrong processing your message"

これは通常、エージェントでエラーが発生したことを意味します。詳細はターミナルの出力を確認してください。

### ボットの応答に時間がかかる

エージェントが複数のツール呼び出し（ファイルの読み取り、検索など）を実行している可能性があります。エージェントが処理中は「Working...」インジケーターが表示されます。複雑なタスクには 1 分以上かかる場合があります。