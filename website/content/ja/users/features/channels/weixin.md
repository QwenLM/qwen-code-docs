# WeChat（Weixin）

このガイドでは、公式のiLink Bot APIを使用してWeChat上にQwen Codeチャンネルを設定する方法について説明します。

## 前提条件

- QRコードをスキャンできるWeChatアカウント（モバイルアプリ）
- iLink Botプラットフォーム（WeChatの公式ボットAPI）へのアクセス

## セットアップ

### 1. QRコードでログイン

WeChatは静的ボットトークンの代わりにQRコード認証を使用します。次のログインコマンドを実行してください：

```bash
qwen channel configure-weixin
```

これによりQRコードのURLが表示されます。WeChatモバイルアプリでスキャンして認証します。認証情報は`~/.qwen/channels/weixin/account.json`に保存されます。

### 2. チャンネルを設定

チャンネルを`~/.qwen/settings.json`に追加します：

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

注意：WeChatチャンネルは`token`フィールドを使用しません。認証情報はQRコードログイン手順から取得されます。

### 3. チャンネルを起動

```bash
# WeChatチャンネルのみを起動
qwen channel start my-weixin

# または、設定済みのすべてのチャンネルを一緒に起動
qwen channel start
```

WeChatを開き、ボットにメッセージを送信します。エージェントが処理中は入力インジケータ（"..."）が表示され、その後に応答が返ってきます。

## 画像とファイル

テキストだけでなく、写真やドキュメントもボットに送信できます。

**写真：** 画像（スクリーンショット、写真など）を送信すると、エージェントがそのビジョン機能を使用して分析します。これにはマルチモーダルモデルが必要です。チャンネル設定に`"model": "qwen3.5-plus"`（または他のビジョン対応モデル）を追加してください。画像のダウンロードと処理中は入力インジケータが表示されます。

**ファイル：** PDF、コードファイル、その他のドキュメントを送信します。ボットはWeChatのCDNからファイルをダウンロードして復号化し、ローカルに保存します。エージェントはファイルツールを使用して読み取ります。これは任意のモデルで動作します。

## 設定オプション

WeChatチャンネルはすべての標準チャンネルオプション ([Channel Overview](./overview#options) 参照) に加えて、以下をサポートしています：

| Option    | Description                                                                        |
| --------- | ---------------------------------------------------------------------------------- |
| `baseUrl` | iLink Bot APIのベースURLを上書きします（デフォルト: `https://ilinkai.weixin.qq.com`） |

## Telegramとの主な違い

- **認証：** 静的ボットトークンの代わりにQRコードログインを使用します。セッションは期限切れになる可能性があり、その場合はチャンネルが一時停止し、メッセージがログに記録されます。
- **フォーマット：** WeChatはプレーンテキストのみをサポートします。エージェント応答内のMarkdownは自動的に削除されます。
- **入力インジケータ：** WeChatには "Working..." というテキストメッセージの代わりに、ネイティブの "..." 入力インジケータがあります。
- **グループ：** WeChat iLink BotはDMのみで、グループチャットはサポートされていません。
- **メディア暗号化：** 画像とファイルはWeChatのCDN上でAES-128-ECBで暗号化されています。チャンネルは透過的に復号化を処理します。

## ヒント

- **プレーンテキスト指示を使用する** — WeChatはすべてのMarkdownを削除するため、"Use plain text only" のような指示を追加して、エージェントが整形された応答を生成して乱雑に見えるのを防ぎます。
- **応答は短く** — WeChatのメッセージバブルは簡潔なテキストが最適です。指示に文字数制限を追加すると役立ちます（例："Keep responses under 500 characters"）。
- **セッションの期限切れ** — ログに "Session expired (errcode -14)" と表示された場合、WeChatログインが期限切れです。チャンネルを停止し、`qwen channel configure-weixin` を再実行して再度ログインしてください。
- **アクセス制限** — `senderPolicy: "pairing"` または `"allowlist"` を使用して、ボットと通信できるユーザーを制御します。詳細は [DM Pairing](./overview#dm-pairing) を参照してください。

## トラブルシューティング

### "WeChat account not configured"

最初に `qwen channel configure-weixin` を実行してQRコードでログインしてください。

### "Session expired (errcode -14)"

WeChatログインセッションが期限切れです。チャンネルを停止し、`qwen channel configure-weixin` を再度実行してください。

### ボットが応答しない

- ターミナル出力でエラーを確認する
- チャンネルが動作していることを確認する (`qwen channel start my-weixin`)
- `senderPolicy: "allowlist"` を使用している場合、自分のWeChatユーザーIDが `allowedUsers` に含まれていることを確認する

### 画像が機能しない

- チャンネル設定にビジョン対応の `model` が含まれていることを確認してください（例：`qwen3.5-plus`）
- ターミナルでCDNダウンロードエラーを確認してください。ネットワークの問題を示している可能性があります。