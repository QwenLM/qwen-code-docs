# Channels

Channels を使用すると、ターミナルではなく Telegram、WeChat、DingTalk などのメッセージングプラットフォームから Qwen Code エージェントとやり取りできます。スマートフォンやデスクトップのチャットアプリからメッセージを送信すると、エージェントは CLI と同様に返信します。

## 仕組み

`qwen channel start` を実行すると、Qwen Code は以下の処理を行います：

1. `settings.json` からチャネル設定を読み込みます
2. [Agent Client Protocol (ACP)](../../developers/architecture) を使用して単一のエージェントプロセスを起動します
3. 各メッセージングプラットフォームに接続し、メッセージの受信待機を開始します
4. 受信メッセージをエージェントにルーティングし、レスポンスを正しいチャットに送信します

すべてのチャネルは 1 つのエージェントプロセスを共有し、ユーザーごとにセッションが分離されます。各チャネルは独自の作業ディレクトリ、モデル、指示（instructions）を持つことができます。

## クイックスタート

1. メッセージングプラットフォームでボットを設定します（チャネル固有のガイドを参照：[Telegram](./telegram)、[WeChat](./weixin)、[DingTalk](./dingtalk)）
2. チャネル設定を `~/.qwen/settings.json` に追加します
3. `qwen channel start` を実行してすべてのチャネルを起動するか、`qwen channel start <name>` で単一のチャネルを起動します

組み込み以外のプラットフォームを接続したい場合は、[Plugins](./plugins) を参照してカスタムアダプターを拡張機能として追加してください。

## 設定

チャネルは `settings.json` の `channels` キー配下で設定します。各チャネルには名前と一連のオプションがあります：

```json
{
  "channels": {
    "my-channel": {
      "type": "telegram",
      "token": "$MY_BOT_TOKEN",
      "senderPolicy": "allowlist",
      "allowedUsers": ["123456789"],
      "sessionScope": "user",
      "cwd": "/path/to/working/directory",
      "instructions": "Optional system instructions for the agent.",
      "groupPolicy": "disabled",
      "groups": {
        "*": { "requireMention": true }
      }
    }
  }
}
```

### オプション

| オプション | 必須 | 説明 |
| ------------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `type` | はい | チャネルタイプ：`telegram`、`weixin`、`dingtalk`、または拡張機能からのカスタムタイプ（[Plugins](./plugins) を参照） |
| `token` | Telegram | ボットトークン。環境変数から読み取る `$ENV_VAR` 構文をサポートします。WeChat や DingTalk では不要です |
| `clientId` | DingTalk | DingTalk AppKey。`$ENV_VAR` 構文をサポートします |
| `clientSecret` | DingTalk | DingTalk AppSecret。`$ENV_VAR` 構文をサポートします |
| `model` | いいえ | このチャネルで使用するモデル（例：`qwen3.5-plus`）。デフォルトモデルを上書きします。画像入力に対応したマルチモーダルモデルに便利です |
| `senderPolicy` | いいえ | ボットとやり取りできるユーザー：`allowlist`（デフォルト）、`open`、または `pairing` |
| `allowedUsers` | いいえ | ボットの使用を許可するユーザー ID のリスト（`allowlist` および `pairing` ポリシーで使用） |
| `sessionScope` | いいえ | セッションのスコープ設定：`user`（デフォルト）、`thread`、または `single` |
| `cwd` | いいえ | エージェントの作業ディレクトリ。デフォルトはカレントディレクトリ |
| `instructions` | いいえ | 各セッションの最初のメッセージの前に追加されるカスタム指示 |
| `groupPolicy` | いいえ | グループチャットへのアクセス：`disabled`（デフォルト）、`allowlist`、または `open`。[Group Chats](#group-chats) を参照 |
| `groups` | いいえ | グループごとの設定。キーはグループチャット ID、またはデフォルト設定用の `"*"`。[Group Chats](#group-chats) を参照 |
| `dispatchMode` | いいえ | ボットが処理中に新しいメッセージを送信した場合の動作：`steer`（デフォルト）、`collect`、または `followup`。[Dispatch Modes](#dispatch-modes) を参照 |
| `blockStreaming` | いいえ | 段階的なレスポンス配信：`on` または `off`（デフォルト）。[Block Streaming](#block-streaming) を参照 |
| `blockStreamingChunk` | いいえ | チャンクサイズの境界：`{ "minChars": 400, "maxChars": 1000 }`。[Block Streaming](#block-streaming) を参照 |
| `blockStreamingCoalesce` | いいえ | アイドル時のフラッシュ：`{ "idleMs": 1500 }`。[Block Streaming](#block-streaming) を参照 |

### Sender Policy

ボットとやり取りできるユーザーを制御します：

- **`allowlist`**（デフォルト）— `allowedUsers` にリストされているユーザーのみがメッセージを送信できます。他のユーザーは無視されます。
- **`pairing`** — 不明な送信者にはペアリングコードが返信されます。ボットオペレーターが CLI 経由で承認すると、永続的な許可リストに追加されます。`allowedUsers` に登録されているユーザーはペアリングを完全にスキップします。以下の [DM Pairing](#dm-pairing) を参照してください。
- **`open`** — 誰でもメッセージを送信できます。使用には注意してください。

### セッションスコープ

会話セッションの管理方法を制御します：

- **`user`**（デフォルト）— ユーザーごとに 1 つのセッション。同じユーザーからのすべてのメッセージが 1 つの会話で共有されます。
- **`thread`** — スレッド/トピックごとに 1 つのセッション。スレッド機能のあるグループチャットに便利です。
- **`single`** — すべてのユーザーで共有される 1 つのセッション。全員が同じ会話を共有します。

### トークンのセキュリティ

ボットトークンは `settings.json` に直接保存しないでください。代わりに環境変数参照を使用します：

```json
{
  "token": "$TELEGRAM_BOT_TOKEN"
}
```

実際のトークンは、シェル環境変数またはチャネル実行前に読み込まれる `.env` ファイルに設定してください。

## DM Pairing

`senderPolicy` が `"pairing"` に設定されている場合、不明な送信者は以下の承認フローを経由します：

1. 不明なユーザーがボットにメッセージを送信します
2. ボットが 8 文字のペアリングコード（例：`VEQDDWXJ`）を返信します
3. ユーザーがコードをあなた（ボットオペレーター）に共有します
4. CLI 経由で承認します：

```bash
qwen channel pairing approve my-channel VEQDDWXJ
```

承認されると、ユーザーの ID は `~/.qwen/channels/<name>-allowlist.json` に保存され、以降のメッセージは通常通り処理されます。

### Pairing CLI コマンド

```bash
# 保留中のペアリングリクエストを一覧表示
qwen channel pairing list my-channel

# コードでリクエストを承認
qwen channel pairing approve my-channel <CODE>
```

### ペアリングのルール

- コードは 8 文字の大文字で、紛らわしい文字（`0`/`O`/`1`/`I`）を除外したアルファベットを使用します
- コードは 1 時間で失効します
- チャネルごとに同時に保留できるリクエストは最大 3 つです。失効または承認されるまで、追加のリクエストは無視されます
- `settings.json` の `allowedUsers` にリストされているユーザーは常にペアリングをスキップします
- 承認されたユーザーは `~/.qwen/channels/<name>-allowlist.json` に保存されます。このファイルは機密情報として扱ってください

## グループチャット

デフォルトでは、ボットはダイレクトメッセージ（DM）でのみ動作します。グループチャットのサポートを有効にするには、`groupPolicy` を `"allowlist"` または `"open"` に設定します。

### Group Policy

ボットがグループチャットに参加するかどうかを制御します：

- **`disabled`**（デフォルト）— ボットはすべてのグループメッセージを無視します。最も安全なオプションです。
- **`allowlist`** — ボットは `groups` でチャット ID によって明示的にリストされているグループでのみ応答します。`"*"` キーはデフォルト設定を提供しますが、ワイルドカードとしての許可機能は**持ちません**。
- **`open`** — ボットは追加されたすべてのグループで応答します。使用には注意してください。

### Mention Gating

グループでは、デフォルトでボットへの `@mention` またはボットのメッセージへの返信が必要です。これにより、ボットがグループチャットのすべてのメッセージに返信するのを防ぎます。

`groups` 設定を使用してグループごとに構成します：

```json
{
  "groups": {
    "*": { "requireMention": true },
    "-100123456": { "requireMention": false }
  }
}
```

- **`"*"`** — すべてのグループのデフォルト設定。許可リストのエントリではなく、設定のデフォルト値のみを設定します。
- **グループチャット ID** — 特定のグループの設定を上書きします。`"*"` のデフォルト設定より優先されます。
- **`requireMention`**（デフォルト：`true`）— `true` の場合、ボットは `@mention` されたメッセージまたは自身のメッセージへの返信にのみ応答します。`false` の場合、ボットはすべてのメッセージに応答します（専用タスクグループに便利です）。

### グループメッセージの評価方法

```
1. groupPolicy — is this group allowed?           (no → ignore)
2. requireMention — was the bot mentioned/replied to? (no → ignore)
3. senderPolicy — is this sender approved?         (no → pairing flow)
4. Route to session
```

### グループ用の Telegram 設定

1. ボットをグループに追加します
2. BotFather で **プライバシーモードを無効化** します（`/mybots` → Bot Settings → Group Privacy → Turn Off）— 無効にしないと、ボットはコマンド以外のメッセージを認識できません
3. プライバシーモードを変更した後、ボットをグループから**一度削除して再追加**します（Telegram はこの設定をキャッシュするため）

### グループチャット ID の確認方法

`groups` 許可リスト用のグループチャット ID を確認するには：

1. ボットが実行中の場合は停止します
2. グループ内でボットをメンションするメッセージを送信します
3. Telegram Bot API を使用してキューに溜まった更新を確認します：

```bash
curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates" | python3 -m json.tool
```

レスポンス内の `message.chat.id` を探してください。グループ ID は負の数です（例：`-5170296765`）。

## メディアサポート

Channels では、テキストだけでなく画像やファイルをエージェントに送信することもサポートしています。

### 画像

ボットに写真を送信すると、エージェントが画像を認識します。スクリーンショット、エラーメッセージ、図の共有に便利です。画像はビジョン入力としてモデルに直接送信されます。

画像サポートを使用するには、チャネルにマルチモーダルモデルを設定します：

```json
{
  "channels": {
    "my-channel": {
      "type": "telegram",
      "model": "qwen3.5-plus",
      ...
    }
  }
}
```

### ファイル

ドキュメント（PDF、コードファイル、テキストファイルなど）をボットに送信します。ファイルはダウンロードされて一時ディレクトリに保存され、エージェントにファイルパスが通知されるため、ファイル読み取りツールを使用して内容を読み取ることができます。

ファイルは任意のモデルで動作します。マルチモーダルサポートは不要です。

### プラットフォーム間の違い

| 機能 | Telegram | WeChat | DingTalk |
| -------- | -------------------------------------------- | -------------------------------- | --------------------------------------------- |
| 画像 | Bot API 経由の直接ダウンロード | AES 復号化付き CDN ダウンロード | downloadCode API（2ステップ） |
| ファイル | Bot API 経由の直接ダウンロード（20MB 制限） | AES 復号化付き CDN ダウンロード | downloadCode API（2ステップ） |
| キャプション | 写真/ファイルのキャプションがメッセージテキストとして含まれます | 該当なし | リッチテキスト：1 つのメッセージにテキストと画像を混在 |

## Dispatch Modes

ボットが前のメッセージを処理中に新しいメッセージを送信した場合の動作を制御します。

- **`steer`**（デフォルト）— ボットは現在のリクエストをキャンセルし、新しいメッセージの処理を開始します。フォローアップがボットの修正やリダイレクトを意味する通常のチャットに最適です。
- **`collect`** — 新しいメッセージはバッファリングされます。現在のリクエストが完了すると、バッファされたすべてのメッセージが 1 つのフォローアッププロンプトに結合されます。考えをキューに溜めておきたい非同期ワークフローに適しています。
- **`followup`** — 各メッセージはキューに追加され、順番に独立したターンとして処理されます。各メッセージが独立しているバッチワークフローに便利です。

```json
{
  "channels": {
    "my-channel": {
      "type": "telegram",
      "dispatchMode": "steer",
      ...
    }
  }
}
```

チャネルのデフォルト設定を上書きして、グループごとに dispatch mode を設定することもできます：

```json
{
  "groups": {
    "*": { "requireMention": true, "dispatchMode": "steer" },
    "-100123456": { "dispatchMode": "collect" }
  }
}
```

## Block Streaming

デフォルトでは、エージェントはしばらく処理を行った後に 1 つの大きなレスポンスを送信します。block streaming を有効にすると、エージェントが処理中に複数の短いメッセージとしてレスポンスが届きます。ChatGPT や Claude が段階的に出力を表示するのと同様です。

```json
{
  "channels": {
    "my-channel": {
      "type": "telegram",
      "blockStreaming": "on",
      "blockStreamingChunk": { "minChars": 400, "maxChars": 1000 },
      "blockStreamingCoalesce": { "idleMs": 1500 },
      ...
    }
  }
}
```

### 動作原理

- エージェントのレスポンスは段落の境界でブロックに分割され、個別のメッセージとして送信されます
- `minChars`（デフォルト 400）— 小さなメッセージのスパムを避けるため、この文字数に達するまでブロックを送信しません
- `maxChars`（デフォルト 1000）— 自然な区切りなしでこの文字数に達した場合、強制的に送信します
- `idleMs`（デフォルト 1500）— エージェントが一時停止した場合（例：ツールの実行）、それまでにバッファされた内容を送信します
- エージェントの処理が完了すると、残りのテキストは直ちに送信されます

必須なのは `blockStreaming` のみです。チャンクと結合（coalesce）の設定はオプションであり、適切なデフォルト値が設定されています。

## スラッシュコマンド

Channels はスラッシュコマンドをサポートしています。これらはローカルで処理されます（エージェントとの往復は不要）：

- `/help` — 利用可能なコマンドの一覧を表示
- `/clear` — セッションをクリアして新しく開始（エイリアス：`/reset`、`/new`）
- `/status` — セッション情報とアクセスポリシーを表示

その他のスラッシュコマンド（例：`/compress`、`/summary`）はエージェントに転送されます。

これらのコマンドはすべてのチャネルタイプ（Telegram、WeChat、DingTalk）で動作します。

## 実行

```bash
# 設定済みのすべてのチャネルを起動（エージェントプロセスを共有）
qwen channel start

# 単一のチャネルを起動
qwen channel start my-channel

# サービスが実行中か確認
qwen channel status

# 実行中のサービスを停止
qwen channel stop
```

ボットはフォアグラウンドで実行されます。停止するには `Ctrl+C` を押すか、別のターミナルから `qwen channel stop` を使用します。

### マルチチャネルモード

名前を指定せずに `qwen channel start` を実行すると、`settings.json` で定義されたすべてのチャネルが 1 つのエージェントプロセスを共有して同時に起動します。各チャネルは独自のセッションを維持します。同じエージェントを共有していても、Telegram ユーザーと WeChat ユーザーは別々の会話になります。

各チャネルは設定から独自の `cwd` を使用するため、異なるチャネルで同時に異なるプロジェクトを操作できます。

### サービス管理

チャネルサービスは PID ファイル（`~/.qwen/channels/service.pid`）を使用して実行中のインスタンスを追跡します：

- **重複防止**: サービスが既に実行中に `qwen channel start` を実行すると、2 つ目のインスタンスを起動する代わりにエラーが表示されます
- **`qwen channel stop`**: 別のターミナルから実行中のサービスを正常に停止します
- **`qwen channel status`**: サービスが実行中かどうか、稼働時間、チャネルごとのセッション数を表示します

### クラッシュリカバリー

エージェントプロセスが予期せずクラッシュした場合、チャネルサービスは自動的に再起動し、すべてのアクティブなセッションの復元を試みます。ユーザーは最初からやり直すことなく会話を継続できます。

- サービス実行中、セッションは `~/.qwen/channels/sessions.json` に永続化されます
- クラッシュ時：エージェントは 3 秒以内に再起動し、保存されたセッションを再読み込みします
- 連続して 3 回クラッシュすると、サービスはエラーで終了します
- 正常終了時（`Ctrl+C` または `qwen channel stop`）：セッションデータはクリアされます。次回起動時は常に新しい状態から開始されます