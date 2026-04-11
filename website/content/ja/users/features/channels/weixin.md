# WeChat (Weixin)

本ガイドでは、公式 iLink Bot API を使用して WeChat 上に Qwen Code チャネルを設定する方法について説明します。

## 前提条件

- QR コードをスキャンできる WeChat アカウント（モバイルアプリ）
- iLink Bot プラットフォームへのアクセス権（WeChat 公式ボット API）

## 設定手順

### 1. QR コードでログイン

WeChat では静的なボットトークンの代わりに QR コード認証を使用します。ログインコマンドを実行してください：

```bash
qwen channel configure-weixin
```

QR コードの URL が表示されます。WeChat モバイルアプリでスキャンして認証してください。認証情報は ~/.qwen/channels/weixin/account.json に保存されます。

### 2. チャネルの設定

チャネルを ~/.qwen/settings.json に追加します：

```json
{
  "channels": {
    "my-weixin": {
      "type": "weixin",
      "senderPolicy": "pairing",
      "allowedUsers": [],
      "sessionScope": "user",
      "cwd": "/path/to/your/project",
      "model": "qwen3.5-plus",
      "instructions": "You are a concise coding assistant responding via WeChat. Keep responses under 500 characters. Use plain text only."
    }
  }
}
```

注：WeChat チャネルでは `token` フィールドは使用しません。認証情報は QR コードログイン手順から取得されます。

### 3. チャネルの起動

```bash
# Start only the WeChat channel
qwen channel start my-weixin

# Or start all configured channels together
qwen channel start
```

WeChat を開き、ボットにメッセージを送信してください。エージェントが処理中は入力中インジケーター（「...」）が表示され、その後レスポンスが届きます。

## 画像とファイル

テキストだけでなく、写真やドキュメントもボットに送信できます。

**写真：** 画像（スクリーンショット、写真など）を送信すると、エージェントがビジョン機能を使用して解析します。これにはマルチモーダルモデルが必要です。チャネル設定に `"model": "qwen3.5-plus"`（または他のビジョン対応モデル）を追加してください。画像のダウンロードと処理中は入力中インジケーターが表示されます。

**ファイル：** PDF、コードファイル、その他のドキュメントを送信できます。ボットは WeChat の CDN からファイルをダウンロードして復号し、ローカルに保存します。その後、エージェントがファイルツールを使用して読み取ります。これはどのモデルでも動作します。

## 設定オプション

WeChat チャネルは標準のチャネルオプション（[チャネルの概要](./overview#options) を参照）をすべてサポートしており、さらに以下のオプションが追加されます：

| オプション    | 説明                                                                    |
| --------- | ------------------------------------------------------------------------------ |
| `baseUrl` | iLink Bot API のベース URL を上書きします（デフォルト：`https://ilinkai.weixin.qq.com`） |

## Telegram との主な違い

- **認証：** 静的なボットトークンの代わりに QR コードログインを使用します。セッションは期限切れになる可能性があります。期限切れになると、チャネルは一時停止しログにメッセージを出力します。
- **フォーマット：** WeChat はプレーンテキストのみをサポートします。エージェントのレスポンスに含まれる Markdown は自動的に削除されます。
- **入力中インジケーター：** WeChat には「Working...」というテキストメッセージの代わりに、ネイティブの「...」入力中インジケーターがあります。
- **グループ：** WeChat iLink Bot は DM（ダイレクトメッセージ）のみ対応しており、グループチャットはサポートされていません。
- **メディアの暗号化：** 画像とファイルは WeChat の CDN 上で AES-128-ECB により暗号化されています。チャネルは透過的に復号処理を行います。

## ヒント

- **プレーンテキストの指示を使用する** — WeChat はすべての Markdown を削除するため、エージェントがフォーマットされた見栄えの悪いレスポンスを生成しないよう、「Use plain text only」などの指示を追加してください。
- **レスポンスを短く保つ** — WeChat のメッセージバブルは簡潔なテキストに最適です。指示に文字数制限を追加すると効果的です（例：「Keep responses under 500 characters」）。
- **セッションの期限切れ** — ログに「Session expired (errcode -14)」が表示された場合、WeChat ログインが期限切れになっています。チャネルを停止し、qwen channel configure-weixin を再実行して再度ログインしてください。
- **アクセス制限** — `senderPolicy: "pairing"` または `"allowlist"` を使用して、ボットと対話できるユーザーを制御します。詳細は [DM ペアリング](./overview#dm-pairing) を参照してください。

## トラブルシューティング

### "WeChat account not configured"

まず qwen channel configure-weixin を実行して QR コードでログインしてください。

### "Session expired (errcode -14)"

WeChat ログインセッションが期限切れになっています。チャネルを停止し、qwen channel configure-weixin を再度実行してください。

### ボットが応答しない

- ターミナルの出力にエラーがないか確認する
- チャネルが実行中であることを確認する（qwen channel start my-weixin）
- `senderPolicy: "allowlist"` を使用している場合、WeChat ユーザー ID が `allowedUsers` に含まれていることを確認する

### 画像が機能しない

- チャネル設定にビジョンをサポートする `model`（例：`qwen3.5-plus`）が指定されていることを確認する
- ターミナルで CDN ダウンロードエラーを確認する。ネットワークの問題を示している可能性があります。