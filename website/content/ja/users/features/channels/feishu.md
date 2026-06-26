# Feishu (Lark)

このガイドでは、Feishu（飛書）/ Lark 上に Qwen Code チャンネルを設定する方法について説明します。

## 前提条件

- Feishu の組織アカウント
- App ID と App Secret を持つ Feishu アプリケーション（下記参照）

## アプリケーションの作成

1. [Feishu Open Platform](https://open.feishu.cn) にアクセスします
2. 新しいアプリケーションを作成するか、既存のものを使用します

![](https://gw.alicdn.com/imgextra/i4/O1CN01ORb10i1JM0MQfhnsV_!!6000000001013-2-tps-2219-931.png)

3. アプリケーションの設定で、**ボット**機能を有効にします（アプリ機能を追加 → ボット）

![](https://gw.alicdn.com/imgextra/i4/O1CN01bClpxu1FZxyH4kNjJ_!!6000000000502-2-tps-2219-931.png)

4. **イベントサブスクリプション**（イベントとコールバック）で、**長接続**（長接続でイベントを受信）を選択します

![](https://gw.alicdn.com/imgextra/i1/O1CN01uIwzbl1ph8Kwq7hTI_!!6000000005391-2-tps-2219-1166.png)

5. イベント `im.message.receive_v1`（メッセージ受信）を追加します

![](https://gw.alicdn.com/imgextra/i2/O1CN01n7sZmV28s6WX0aDhw_!!6000000007987-2-tps-2219-1090.png)

6. アプリケーションの認証情報ページから **App ID**（クライアントID）と **App Secret**（クライアントシークレット）を確認します

![](https://gw.alicdn.com/imgextra/i2/O1CN01ag1yBh1DxfEUb4xmE_!!6000000000283-2-tps-2219-1166.png)

### 必要な権限

**権限管理**で以下の権限を有効にします：

- `im:message` — メッセージの読み取りと送信
- `im:message:send_as_bot` — ボットとしてメッセージを送信
- `im:resource` — メッセージリソース（画像、ファイル）へのアクセス

### アプリケーションの公開

権限とイベントを設定したら、バージョンを作成して公開します。アプリケーションが公開され承認されるまで、ボットは動作しません。

![](https://gw.alicdn.com/imgextra/i1/O1CN01GbNRcj1lVuACnkV6M_!!6000000004825-2-tps-2219-1090.png)

## 設定

チャンネルを `~/.qwen/settings.json` に追加します：

```json
{
  "channels": {
    "my-feishu": {
      "type": "feishu",
      "clientId": "<your-app-id>",
      "clientSecret": "<your-app-secret>",
      "senderPolicy": "open",
      "sessionScope": "user",
      "cwd": "/path/to/your/project",
      "groupPolicy": "open",
      "collapsible": true,
      "groups": {
        "*": { "requireMention": true }
      }
    }
  }
}
```

### 設定オプション

| オプション             | 説明                                                             |
| ---------------------- | ---------------------------------------------------------------- |
| `clientId`             | Feishu App ID                                                    |
| `clientSecret`         | Feishu App Secret                                                |
| `collapsible`          | 長いレスポンスを折りたたみ可能なセクションにまとめる（デフォルト：`false`） |
| `collapsibleThreshold` | 折りたたみを開始する文字数のしきい値（デフォルト：`500`）                 |
| `webhookPort`          | 設定すると、WebSocket の代わりに HTTP Webhook モードを使用する           |
| `verificationToken`    | Webhook モード用の検証トークン                                           |
| `encryptKey`           | Webhook モード用の暗号化キー                                             |

## 実行

```bash
# Feishu チャンネルのみを起動
qwen channel start my-feishu

# または、設定済みの全チャンネルを一括起動
qwen channel start
```

Feishu を開き、ボットにメッセージを送信します。ストリーミング形式のインタラクティブカードが返ってくるはずです。

## 接続モード

### WebSocket（デフォルト）

WebSocket モードでは、アウトバウンドの長接続を使用します。公開 URL やサーバーは不要です。ほとんどのデプロイ環境で推奨されるモードです。

### Webhook

Webhook モードが必要な場合（例：共有アプリケーション）、設定に `webhookPort` を追加します：

```json
{
  "channels": {
    "my-feishu": {
      "type": "feishu",
      "webhookPort": 9321,
      "verificationToken": "<from-feishu-console>",
      "encryptKey": "<from-feishu-console>"
    }
  }
}
```

その後、Feishu Open Platform でリクエスト URL を `http://<your-server>:9321` に設定します。

## グループチャット

Feishu ボットは DM とグループの両方で動作します。グループ対応を有効にするには：

1. チャンネル設定で `groupPolicy` を `"allowlist"` または `"open"` に設定する
2. ボットを Feishu グループに追加する
3. グループ内でボットを @メンションするとレスポンスが返る

デフォルトでは、グループチャットで @メンションが必要です（`requireMention: true`）。特定のグループに対して `"requireMention": false` を設定すると、すべてのメッセージに応答するようになります。

## 機能

### インタラクティブカードのストリーミング

レスポンスは Feishu のインタラクティブカードとして表示され、リアルタイムで更新されます。レスポンス生成中は「生成中」インジケーターが表示され、**停止**ボタンで生成をキャンセルできます。

### 引用/返信コンテキスト

メッセージを引用（返信）すると、引用内容がエージェントのコンテキストとして自動的に追加されます。対応しているメッセージタイプ：

- テキストおよびリッチテキストメッセージ
- インタラクティブカード（ボットの以前の応答）

### 画像とファイル

写真やドキュメントをボットに送信できます：

- **画像**：マルチモーダルビジョン機能で分析
- **ファイル**：ダウンロードしてローカルに保存し、エージェントが読み取り可能

### 同時メッセージ

複数のユーザーが同じグループチャットで同時にメッセージを送信できます。各メッセージは独立したカードとレスポンスを持ち、互いに干渉しません。

## DingTalk との主な違い

- **レスポンス形式**：Feishu インタラクティブカード（v2 スキーマ）を使用。ネイティブの Markdown レンダリング（テーブル対応）
- **ストリーミング**：カードコンテンツは PATCH リクエスト（1.5 秒間隔）でスロットルされ、インプレース更新
- **接続**：`@larksuiteoapi/node-sdk` 経由の WebSocket — アウトバウンド専用モデルで公開 URL 不要
- **処理中インジケーター**：処理中は「OnIt」絵文字リアクションを付与
- **引用コンテキスト**：テキストメッセージとインタラクティブカードの両方を引用可能

## トラブルシューティング

### ボットが接続できない

- App ID と App Secret が正しいことを確認する
- イベントサブスクリプションで**長接続**が選択されているか確認する
- `im.message.receive_v1` イベントが購読されているか確認する
- ターミナル出力で接続エラーを確認する

### グループでボットが応答しない

- `groupPolicy` が `"allowlist"` または `"open"` に設定されているか確認する（デフォルトは `"disabled"`）
- グループメッセージでボットを @メンションしていることを確認する
- ボットがグループに追加されていることを確認する

### カードが「生成中」状態のままになる

- 通常、レスポンスは完了しているが、最後のカード更新に失敗していることを示す
- ターミナルログで API エラー（レート制限、カードサイズ制限）を確認する
- テーブルが多い非常に長いレスポンスは、Feishu のカード要素制限に達する可能性がある

### 引用にカード内容が含まれない

- ボットは `card_msg_content_type=user_card_content` API パラメータでカード内容を読み取る
- ボットに `im:message` 権限（メッセージ読み取り）が付与されていることを確認する