# WeCom (Enterprise WeChat)

本ガイドでは、WeCom インテリジェントロボット（企業微信智能机器人）と Qwen Code を連携させる設定方法について説明します。

## 前提条件

- WeCom の組織アカウント
- API モードで作成された WeCom インテリジェントロボット
- ロボットの Bot ID と Secret

## ロボットの作成

1. WeCom 管理コンソールを開き、インテリジェントロボットを作成します。
2. API モードを選択します。
3. Bot ID と Secret をコピーします。
4. ロボットを利用させたいダイレクトチャットまたはグループに追加します。

インテリジェントロボットは、Qwen Code から WeCom への WebSocket 接続を使用します。公開コールバック URL、Token、EncodingAESKey、Corp ID、Agent ID は必要ありません。

## 設定

チャネルを `~/.qwen/settings.json` に追加します。

```json
{
  "channels": {
    "my-wecom": {
      "type": "wecom",
      "botId": "$WECOM_BOT_ID",
      "secret": "$WECOM_SECRET",
      "senderPolicy": "allowlist",
      "allowedUsers": ["zhangsan"],
      "sessionScope": "user",
      "cwd": "/path/to/your/project",
      "instructions": "You are a concise coding assistant responding via WeCom.",
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
export WECOM_BOT_ID=<your-bot-id>
export WECOM_SECRET=<your-secret>
```

または、`settings.json` の `env` セクションで定義します。

```json
{
  "env": {
    "WECOM_BOT_ID": "your-bot-id",
    "WECOM_SECRET": "your-secret"
  }
}
```

## 実行

```bash
qwen channel start my-wecom
```

WeCom を開き、インテリジェントロボットにメッセージを送信します。

## アクセス制御

`senderPolicy` は他の IM チャネルと同じように機能します。

- `allowlist`: `allowedUsers` に含まれるユーザーのみがボットを使用できます。これは推奨される企業のデフォルト設定です。
- `pairing`: ボットを使用する前に、ユーザーはペアリングを行う必要があります。
- `open`: ロボットにメッセージを送信できる誰でも使用できます。

グループの場合、`groupPolicy` を `"allowlist"` または `"open"` に設定します。デフォルトでは、グループメッセージは `"requireMention": true` によりメンションを必要とします。

WeCom SDK に明示的なメンションメタデータが含まれている場合、Qwen Code はこのゲートにそれを使用します。メンションメタデータが存在しない場合、チャネルは配信されたグループメッセージをメンションなしとして扱います。WeCom 側の配信スコープに依存したい場合にのみ、`"requireMention": false` を設定してください。

## 画像とファイル

ユーザーはテキスト、文字起こし付き音声メッセージ、画像、テキストと画像の混合、ファイル、動画を送信できます。画像は画像添付ファイルとしてエージェントに渡されます。ファイルと動画は一時ローカルパスにダウンロードされるため、エージェントはファイルツールを使用してそれらを読み取ることができます。

アシスタントの応答は WeCom の Markdown として送信されます。エージェントによって生成されたローカル画像を送信するには、コードブロックの外にマーカーを 1 つ含めます。

```text
[IMAGE: /absolute/path/to/image.png]
```

セキュリティのため、ローカル画像のパスは、Linux の `/tmp/channel-files/...` などのシステム一時ディレクトリ下にあるチャネルファイルディレクトリ内にある必要があります。モデルが生成するファイルパスによって任意のワークスペースファイルがアップロードされるのを防ぐため、汎用ファイル、動画、音声のアップロードマーカーは無視されます。

## トラブルシューティング

### ボットが接続されない

- Bot ID と Secret を確認します。
- ロボットが API モードで作成されていることを確認します。
- `qwen channel start` を実行しているシェルで環境変数が利用可能であることを確認します。

### ボットがグループで応答しない

- `groupPolicy` を確認します。
- グループ設定で `"requireMention": false` が設定されていない限り、ボットにメンションを付けます。
- ロボットがグループに追加されていることを確認します。

### 自作アプリケーションの認証情報が機能しない

このチャネルは WeCom インテリジェントロボット用のものです。Corp ID、Agent ID、Token、EncodingAESKey などの自作アプリケーションのコールバック認証情報は、このチャネルでは使用されません。