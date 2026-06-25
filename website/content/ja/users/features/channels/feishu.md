# Feishu (Lark)

このガイドでは、Feishu（飞书）/ Lark 上で Qwen Code チャンネルを設定する方法を説明します。

## 前提条件

- Feishu の組織アカウント
- App ID と App Secret を持つ Feishu アプリケーション（以下を参照）

## アプリケーションの作成

1. [Feishu オープンプラットフォーム](https://open.feishu.cn) にアクセスします
2. 新しいアプリケーションを作成します（または既存のものを使用します）

![](https://gw.alicdn.com/imgextra/i4/O1CN01ORb10i1JM0MQfhnsV_!!6000000001013-2-tps-2219-931.png)

3. アプリケーション内で **Bot** 機能を有効にします（添加应用能力 → 机器人）

![](https://gw.alicdn.com/imgextra/i4/O1CN01bClpxu1FZxyH4kNjJ_!!6000000000502-2-tps-2219-931.png)

4. **イベントサブスクリプション**（事件与回调）で **Long Connection**（使用长连接接收事件）を選択します

![](https://gw.alicdn.com/imgextra/i1/O1CN01uIwzbl1ph8Kwq7hTI_!!6000000005391-2-tps-2219-1166.png)

5. イベント `im.message.receive_v1`（接收消息）を追加します

![](https://gw.alicdn.com/imgextra/i2/O1CN01n7sZmV28s6WX0aDhw_!!6000000007987-2-tps-2219-1090.png)

6. アプリケーション認証情報ページから **App ID**（Client ID）と **App Secret**（Client Secret）を確認します

![](https://gw.alicdn.com/imgextra/i2/O1CN01ag1yBh1DxfEUb4xmE_!!6000000000283-2-tps-2219-1166.png)

### 必要な権限

**権限管理**（Permissions & Scopes）で以下の権限を有効にします：

- `im:message` — メッセージの読み取りと送信
- `im:message:send_as_bot` — ボットとしてメッセージを送信
- `im:resource` — メッセージリソース（画像、ファイル）へのアクセス

### アプリケーションの公開

権限とイベントの設定後、バージョンを作成して公開します。アプリケーションが公開・承認されるまでボットは動作しません。

![](https://gw.alicdn.com/imgextra/i1/O1CN01GbNRcj1lVuACnkV6M_!!6000000004825-2-tps-2219-1090.png)

## 設定

`~/.qwen/settings.json` にチャンネルを追加します：

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

| オプション             | 説明                                                                |
| ---------------------- | ------------------------------------------------------------------- |
| `clientId`             | Feishu App ID                                                       |
| `clientSecret`         | Feishu App Secret                                                   |
| `collapsible`          | 長いレスポンスを折りたたみ可能なセクションにまとめる（デフォルト: `false`） |
| `collapsibleThreshold` | 折りたたみの文字数しきい値（デフォルト: `500`）                     |
| `webhookPort`          | 設定した場合、WebSocket の代わりに HTTP webhook モードを使用        |
| `verificationToken`    | webhook モード用の検証トークン                                      |
| `encryptKey`           | webhook モード用の暗号化キー                                        |

## 起動

```bash
# Feishu チャンネルのみ起動
qwen channel start my-feishu

# または設定済みのすべてのチャンネルをまとめて起動
qwen channel start
```

Feishu を開いてボットにメッセージを送信します。レスポンスがストリーミングのインタラクティブカードとして表示されます。

## 接続モード

### WebSocket（デフォルト）

WebSocket モードはアウトバウンドの長期接続を使用します。パブリック URL やサーバーは不要です。ほとんどのデプロイ環境で推奨されるモードです。

### Webhook

webhook モードが必要な場合（共有アプリケーションなど）、設定に `webhookPort` を指定します：

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

次に、Feishu オープンプラットフォームのリクエスト URL を `http://<your-server>:9321` に設定します。

## グループチャット

Feishu ボットは DM とグループ会話の両方で動作します。グループのサポートを有効にするには：

1. チャンネル設定の `groupPolicy` を `"allowlist"` または `"open"` に設定する
2. Feishu グループにボットを追加する
3. グループでボットを @メンション してレスポンスをトリガーする

デフォルトでは、グループチャットでは @メンション が必要です（`requireMention: true`）。特定のグループで `"requireMention": false` を設定すると、すべてのメッセージに応答するようになります。

## 機能

### インタラクティブカードのストリーミング

レスポンスはリアルタイムのストリーミング更新を伴う Feishu インタラクティブカードとして表示されます。カードにはレスポンス生成中に「生成中」インジケーターが表示され、生成をキャンセルする **Stop** ボタンも表示されます。

### 引用／返信のコンテキスト

メッセージに返信（引用）すると、引用された内容がエージェントのコンテキストとして自動的に含まれます。以下に対応しています：

- テキストおよびリッチテキストメッセージ
- インタラクティブカード（ボットの過去のレスポンス）

### 画像とファイル

ボットに写真やドキュメントを送信できます：

- **画像:** マルチモーダルビジョン機能を使用して解析
- **ファイル:** ダウンロードしてローカルに保存し、エージェントが読み取り可能

### 同時メッセージ

同じグループチャットで複数のユーザーが同時にメッセージを送信できます。各メッセージはそれぞれ独立したカードとレスポンスを持ち、互いに干渉しません。

## DingTalk との主な違い

- **レスポンス形式:** テーブルを含むネイティブ markdown レンダリングを備えた Feishu インタラクティブカード（v2 スキーマ）を使用
- **ストリーミング:** スロットルされた PATCH リクエスト（1.5 秒間隔）でカードコンテンツをインプレース更新
- **接続:** `@larksuiteoapi/node-sdk` 経由の WebSocket — アウトバウンドのみのモデルで、パブリック URL 不要
- **処理中インジケーター:** 処理中は「OnIt」絵文字リアクションが追加される
- **引用コンテキスト:** テキストメッセージとインタラクティブカードの両方の引用をサポート

## トラブルシューティング

### ボットが接続しない

- App ID と App Secret が正しいか確認する
- イベントサブスクリプションで **Long Connection** が選択されているか確認する
- `im.message.receive_v1` イベントがサブスクライブされているか確認する
- 接続エラーについてターミナルの出力を確認する

### グループでボットが応答しない

- `groupPolicy` が `"allowlist"` または `"open"` に設定されているか確認する（デフォルトは `"disabled"`）
- グループメッセージでボットを @メンション しているか確認する
- ボットがグループに追加されているか確認する

### カードが「生成中」状態のまま

- レスポンスは完了したが最終カードの更新に失敗した場合に発生することが多い
- API エラー（レート制限、カードサイズ制限）についてターミナルログを確認する
- 多数のテーブルを含む非常に長いレスポンスは Feishu のカード要素数の制限に達する場合がある

### 引用にカードの内容が含まれない

- ボットは `card_msg_content_type=user_card_content` API パラメーターを使用してカードの内容を読み取る
- ボットがメッセージを読み取るための `im:message` 権限を持っているか確認する
