# チャンネル

チャンネルを使用すると、ターミナルではなく、Telegram、WeChat、QQ、DingTalk、WeCom、Feishu などのメッセージングプラットフォームから Qwen Code エージェントと対話できます。スマートフォンやデスクトップのチャットアプリからメッセージを送信すると、エージェントは CLI の場合と同じように応答します。

コードホスティングプラットフォーム（[GitHub](./github) から開始）および認証済みワークスペースアカウント（[DingTalk Workspace](./dws) から開始）もチャンネル経由でサポートされています。

## 仕組み

`qwen channel start` を実行すると、Qwen Code は次のように動作します。

1. `settings.json` からチャンネル設定を読み取ります
2. [Agent Client Protocol (ACP)](../../../developers/architecture.md) を使用して単一のエージェントプロセスを生成します
3. 各メッセージングプラットフォームに接続し、メッセージの受信を開始します
4. 受信したメッセージをエージェントにルーティングし、応答を正しいチャットに送信します

すべてのチャンネルは、ユーザーごとに分離されたセッションを持つ単一のエージェントプロセスを共有します。各チャンネルは、独自の作業ディレクトリ、モデル、および指示を持つことができます。

## クイックスタート

1. ボットまたは認証済みワークスペースアカウントをセットアップします（チャンネル固有のガイドを参照してください：[Telegram](./telegram)、[WeChat](./weixin)、[QQ Bot](./qqbot)、[DingTalk](./dingtalk)、[DingTalk Workspace](./dws)、[WeCom](./wecom)、[Feishu](./feishu)、[GitHub](./github)）
2. チャンネル設定を `~/.qwen/settings.json` に追加します
3. `qwen channel start` を実行してすべてのチャンネルを開始するか、`qwen channel start <name>` で単一のチャンネルを開始します

組み込みでないプラットフォームを接続したいですか？[Plugins](./plugins) を参照して、カスタムアダプタを拡張機能として追加してください。

## 設定

チャンネルは `settings.json` の `channels` キー配下で設定します。各チャンネルには名前と一連のオプションがあります。

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
      "dmPolicy": "open",
      "groups": {
        "*": { "requireMention": true }
      }
    }
  }
}
```

### オプション

| オプション               | 必須             | 説明                                                                                                                                                             |
| ------------------------ | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`                   | はい             | チャンネルタイプ：`telegram`、`weixin`、`qq`、`dingtalk`、`dws`、`wecom`、`feishu`、`github`、`gitlab`、または拡張機能のカスタムタイプ（[Plugins](./plugins) を参照）              |
| `token`                  | Telegram         | ボットトークン。環境変数から読み取るための `$ENV_VAR` 構文をサポートします。WeChat、DingTalk、WeCom、Feishu では不要です                                          |
| `clientId`               | DingTalk, Feishu | DingTalk AppKey または Feishu App ID。`$ENV_VAR` 構文をサポートします                                                                                             |
| `clientSecret`           | DingTalk, Feishu | DingTalk AppSecret または Feishu App Secret。`$ENV_VAR` 構文をサポートします                                                                                      |
| `botId`                  | WeCom            | WeCom インテリジェントロボットの Bot ID。`$ENV_VAR` 構文をサポートします。[WeCom](./wecom) を参照                                                                 |
| `secret`                 | WeCom            | WeCom インテリジェントロボットの Secret。`$ENV_VAR` 構文をサポートします。[WeCom](./wecom) を参照                                                                 |
| `model`                  | いいえ           | このチャンネルで使用するモデル（例：`qwen3.5-plus`）。デフォルトモデルを上書きします。画像入力をサポートするマルチモーダルモデルに便利です                         |
| `senderPolicy`           | いいえ           | ボットと対話できるユーザー：`allowlist`（デフォルト）、`open`、または `pairing`                                                                                    |
| `allowedUsers`           | いいえ           | ボットの使用を許可するユーザー ID のリスト（`allowlist` および `pairing` ポリシーで使用）                                                                          |
| `sessionScope`           | いいえ           | セッションのスコープ方法：`user`（デフォルト）、`chat_thread`、または `single`。レガシーの `thread` はすでに設定されている場合は互換性が保たれますが、新しい Web Shell の設定では提供されません                                   |
| `cwd`                    | いいえ           | エージェントの作業ディレクトリ。デフォルトは現在のディレクトリです                                                                                                 |
| `approvalMode`           | いいえ           | チャンネルセッションのツール承認モード。無人の Webhook タスクには `yolo` が必要です。この設定はチャンネル上のすべてのセッションに適用されます                       |
| `instructions`           | いいえ           | 各セッションの最初のメッセージの前に追加されるカスタム指示                                                                                                         |
| `webhooks`               | いいえ           | デーモン管理チャンネルの Webhook ソースと配信ターゲット。[Webhook トリガータスク](#webhook-triggered-tasks) を参照                                                 |
| `groupPolicy`            | いいえ           | グループチャットへのアクセス：`disabled`（デフォルト）、`allowlist`、`pairing`、または `open`。[Group Chats](#group-chats) を参照                                  |
| `dmPolicy`               | いいえ           | プライベート/DM へのアクセス：`open`（デフォルト）または `disabled`（すべての DM を暗黙に破棄）。グループ専用ボットに便利です                                     |
| `groupHistoryLimit`      | いいえ           | グループ履歴のバックフィルをオプトインします。`0` または省略すると無効になります。正の数を指定すると、許可された送信者または承認済みペアリンググループのメンバーからのメンションなしグループメッセージが、次のボットのメンション/返信用にその数だけ永続化されます。 |
| `groups`                 | いいえ           | グループごとの設定。キーはグループチャット ID またはデフォルト値の `"*"` です。[Group Chats](#group-chats) を参照                                                  |
| `dispatchMode`           | いいえ           | ボットがビジーのときにメッセージを送信したときの動作：`steer`（デフォルト）、`collect`、または `followup`。[Dispatch Modes](#dispatch-modes) を参照                |
| `blockStreaming`         | いいえ           | プログレッシブなレスポンス配信：`on` または `off`（デフォルト）。[Block Streaming](#block-streaming) を参照                                                        |
| `blockStreamingChunk`    | いいえ           | チャンクサイズの境界：`{ "minChars": 400, "maxChars": 1000 }`。[Block Streaming](#block-streaming) を参照                                                          |
| `blockStreamingCoalesce` | いいえ           | アイドル時のフラッシュ：`{ "idleMs": 1500 }`。[Block Streaming](#block-streaming) を参照                                                                           |

### 送信者ポリシー

ボットと対話できるユーザーを制御します。

- **`allowlist`**（デフォルト）— `allowedUsers` にリストされているユーザーのみがメッセージを送信できます。その他のユーザーは暗黙に無視されます。
- **`pairing`** — 不明な送信者にはペアリングコードが送信されます。ボットオペレーターが CLI 経由で承認し、永続的な許可リストに追加されます。`allowedUsers` にいるユーザーはペアリングを完全にスキップします。以下の [DM Pairing](#dm-pairing) を参照してください。
- **`open`** — 誰でもメッセージを送信できます。使用には注意が必要です。

### セッションスコープ

会話セッションの管理方法を制御します。

- **`user`**（デフォルト）— ユーザーごとに 1 つのセッション。同じユーザーからのすべてのメッセージは 1 つの会話を共有します。
- **`chat_thread`** — チャットスレッドまたはトピックごとに 1 つのセッション。そのスレッドの参加者で共有されます。
- **`thread`** — スレッドまたはトピックごとに 1 つのセッション。スレッド付きのグループチャットに便利です。
- **`single`** — すべてのユーザーで共有される 1 つのセッション。全員が同じ会話を共有します。

#### 名前付きタスク

デーモン管理のチャンネルは、1 つのチャット内で同じユーザーの複数の名前付き会話を保持できます。

```json
{
  "channels": {
    "my-channel": {
      "type": "telegram",
      "sessionScope": "user",
      "multiSession": true
    }
  }
}
```

カタログは、正確なチャンネル、チャット、および送信者に対してプライベートです。タスク名は 1〜32 文字の ASCII 文字（英数字、アンダースコア、ハイフン）を使用し、大文字小文字を区別せずに一意です。最大 8 つのタスクを開いた状態にできます。タスクを閉じると、トランスクリプトを削除せずにデタッチされるため、後で選択すると正確な会話が再開されます。セッション ID がチャットコマンドで受け付けられたり表示されたりすることはありません。

Part 2 では、一度に 1 つの選択されたタスクと共有ワークスペースを使用します。選択されたタスクが実行中または許可待ちの間、タスクの作成や選択解除は拒否され、ビジーなタスクは閉じられません。並行する実行中タスクの切り替え、名前付きキャンセル、およびタスクラベルは Part 3 で予定されています。タスクごとのワークツリーは Part 4 で予定されています。チャンネルメモリは名前付きタスクではなくチャットにスコープされたままです。

このモードは、スタンドアロンの `qwen channel start`、Webhook、0 でないチャンネルまたはグループの `groupHistoryLimit`、またはチャンネルループでは利用できません。そのチャンネルに対して有効なループがすでに存在する場合、デーモンワーカーはループが無効になるまで起動を拒否します。

## チャンネルメモリ

チャンネルメモリは、1 つのチャットまたはスレッドの永続的なコンテキストを保存します。エントリは安定した ID を持つため、リスト応答を決定論的なフォローアップ操作に使用できます。

- `记住：默认使用 staging 环境` は決定論的な形式であり、現在のチャットまたはスレッドに exactly 1 つのスカラーエントリを保存します。
- 1 つのリクエストで複数の個別の事実を保存するには、クラシファイア経由でルーティングされる自然なフレーズを使用します。例：
  `请记住这三条约定：使用 staging；发布前测试；优先中文回复` は独立して管理できるエントリを作成します。正確な重複ファクトはスキップされ、別のエントリを作成せずに報告されます。認証情報に似たテキストを含むリクエストは拒否されます。秘密情報を削除し、機密でない事実を別途保存してください。
- `查看记忆` はエントリとその安定した ID を一覧表示します。`查看第 2 页记忆` で次のページを表示、`查看记忆 <id>` で 1 つのエントリを表示、または `只看中文偏好` のような自然なフィルタリクエストで一致するエントリを一覧表示します。
- `查看刚才那条记忆`、`把关于 staging 的记忆改成默认使用 production`、`忘掉刚才那条` は、自然な参照が exactly 1 つのエントリに解決される場合に機能します。自然な更新と削除は、まず提案された変更を表示します。更新は `确认更新记忆` または `confirm memory update` で、削除は `确认删除记忆` または `confirm memory removal` で 60 秒以内に確認してください。正確な ID による更新と削除は引き続き即座に実行され、確認は不要です。
- `清空记忆` は全クリア確認フローを開始し、`确认清空记忆` で完了します。

自然な検査、更新、または削除のリクエストが複数のエントリに一致する場合、ボットは候補 ID とプレビューを返し、メモリは変更しません。曖昧な結果に対する保留中の選択はありません。`忘掉 m-a31f0d82c7e4` のように、正確な ID 1 つでリクエストを再試行してください。正確な ID の操作が決定論的な高速パスです。一致がない自然なリクエストは、一致するエントリがなかったことを報告します。

保留中の更新、削除、およびクリアの確認は、それらを作成した送信者とチャットまたはスレッドにのみ適用されます。新しいクリア、自然な更新、または自然な削除の提案は、同じ送信者とターゲットの古い保留中のものを置き換えます。保留中の確認は、チャンネルプロセスが再起動したときに破棄されます。

レガシーなスラッシュエイリアス `/remember-channel`、`/channel-memory`、および `/forget-channel` は削除されました。これらはチャンネルメモリコマンドではなくなりました。

チャンネルメモリはチャンネルのアクセスゲートに従います。`senderPolicy`、`dmPolicy`、`groupPolicy`、グループ設定、ペアリング、およびメンション要件によって受け入れられた任意のメッセージは、そのチャットまたはスレッドのメモリを読み取り、書き込み、更新、またはクリアできます。同じグループの許可されたメンバーは、そのグループのターゲットストアを共有します。グループメモリを信頼された送信者に制限するには、`allowlist` または `pairing` ポリシーを使用してください。

既存のレガシー `CHANNEL.md` メモリは、最初の変更時に構造化された `CHANNEL.json` ストレージに自動的に移行されます。構造化メモリは、スタンドアロンチャンネルおよびデーモン管理チャンネルの再起動をまたいで永続化され、`/clear` の後を含む、新しいターゲットスコープのセッションが開始されるときに注入されます。

初期注入後、許可された各メッセージは最大 3 つの関連エントリをそのメッセージに対してリコールします。これにより、保存されたすべてのエントリをすべてのターンに追加することなく、長時間実行されるセッション中に永続的な事実を利用可能な状態に保ちます。リコールは現在のメッセージに基づいており、保存されたメモリを変更しません。

メモリは現在のチャットまたはスレッドにキー付けされたままです。`sessionScope: single` セッションでは注入もリコールもされません。そのセッションは 1 つのターゲットにスコープされるのではなく、チャンネル全体で共有されるためです。

チャンネルメモリは、通常の会話から自動的にファクトを学習したり、曖昧な自然な参照の確認として `第一个` を受け入れたりしません。自然な参照が曖昧な場合は、明確な remember リクエストと正確なエントリ ID を使用してください。

### トークンのセキュリティ

ボットトークンは `settings.json` に直接保存すべきではありません。代わりに、環境変数参照を使用してください。

```json
{
  "token": "$TELEGRAM_BOT_TOKEN"
}
```

実際のトークンは、シェル環境またはチャンネルの実行前に読み込まれる `.env` ファイルに設定してください。

## DM ペアリング

`senderPolicy` が `"pairing"` に設定されている場合、不明な送信者は承認フローを経由します。

1. 不明なユーザーがボットにメッセージを送信します
2. ボットが 8 文字のペアリングコード（例：`VEQDDWXJ`）で応答します
3. ユーザーがコードをあなた（ボットオペレーター）に共有します
4. CLI 経由で承認します。

```bash
qwen channel pairing approve my-channel VEQDDWXJ
```

承認されると、ユーザーの ID がチャンネルのワークスペーススコープの許可リスト（`~/.qwen/channels/<workspace-scope>/<name>-allowlist.json`）に保存され、以降のすべてのメッセージは通常通り処理されます。ペアリング状態はワークスペースごとにスコープされるため、同じチャンネル名を使用する 2 つのワークスペースは別々の承認を保持します。

### ペアリング CLI コマンド

```bash
# List pending pairing requests
qwen channel pairing list my-channel

# Approve a request by code
qwen channel pairing approve my-channel <CODE>
```

これらはチャンネルのワークスペースディレクトリから実行します（または `--cwd <dir>` を渡します）。ペアリング状態はワークスペースごとに保存されます。

### ペアリングルール

- コードは 8 文字の大文字で、曖昧さのないアルファベットを使用します（`0`/`O`/`1`/`I` は除く）。
- コードは 1 時間後に期限切れになります。
- チャンネルごとに同時に保留中のリクエストは最大 3 つまで、送信者ごとに最大 1 つまでです。追加のリクエストは、いずれかが期限切れになるか承認されるまで拒否されます。
- `settings.json` の `allowedUsers` にリストされているユーザーはユーザーペアリングをスキップします。`groupPolicy: "pairing"` では、グループ自体の承認が必要です。
- 承認されたユーザーはワークスペースごとに `~/.qwen/channels/<workspace-scope>/<name>-allowlist.json` に保存されます。このファイルは機密として扱ってください。

## グループチャット

デフォルトでは、ボットはダイレクトメッセージでのみ動作します。グループチャットのサポートを有効にするには、`groupPolicy` を `"allowlist"`、`"pairing"`、または `"open"` に設定します。

### グループポリシー

ボットがグループチャットに参加するかどうかを制御します。

- **`disabled`**（デフォルト）— ボットはすべてのグループメッセージを無視します。最も安全なオプションです。
- **`allowlist`** — ボットは `groups` にチャット ID で明示的にリストされているグループでのみ応答します。`"*"` キーはデフォルト設定を提供しますが、ワイルドカード許可としては機能**しません**。
- **`pairing`** — 不明なグループからの意図的なメンションまたは返信により、グループ用のペアリングリクエストが 1 つ作成されます。承認されると、すべてのメンバーがそのグループでボットを使用できます。`senderPolicy` はダイレクトメッセージを引き続き制御します。
- **`open`** — ボットは追加されたすべてのグループで応答します。使用には注意が必要です。

ユーザーペアリングと同じ CLI コマンドでグループを承認します。保留中の
リクエストにはグループとそれを開始したメンバーが識別されます。

```bash
qwen channel pairing approve my-channel <CODE>
```

グループ承認は、グループのチャット ID をキーとしてチャンネルのワークスペーススコープに保存されます。GitHub と GitLab ではチャット ID はリポジトリ/プロジェクトパスであるため、リネームまたは移転時に保存された承認が切り離されます。リネーム後にグループを再承認してください。同じパスで再作成されたリポジトリやプロジェクトは古い承認を継承します。リネーム、移転、削除後はグループ承認を取り消してください。
メンションのないメッセージは、グループが `requireMention` を `false` に設定している場合でも、グループペアリングリクエストを作成することはありません。承認後は、設定されたメンションポリシーが通常通り適用されます。

グループペアリングリクエストは DM ペアリングリクエストと同じ保留キューを共有します。チャンネルは最大 3 つの保留中リクエストを保持し、送信者はユーザーとグループのリクエストを合わせて最大 1 つの保留中リクエストを持ちます（[ペアリングルール](#ペアリングルール)を参照）。

### メンションゲーティング

グループ内では、デフォルトでボットは `@mention` または自身のメッセージへの返信を要求します。これにより、ボットがグループチャットのすべてのメッセージに応答するのを防ぎます。

`groups` 設定を使用してグループごとに設定します。

```json
{
  "groups": {
    "*": { "requireMention": true },
    "-100123456": { "requireMention": false }
  }
}
```

- **`"*"`** — すべてのグループのデフォルト設定。設定のデフォルト値を設定するだけで、許可リストのエントリではありません。
- **グループチャット ID** — 特定のグループの設定を上書きします。`"*"` のデフォルト値を上書きします。
- **`requireMention`**（デフォルト：`true`）— `true` の場合、ボットは自身を `@mention` するメッセージまたは自身のメッセージへの返信にのみ応答します。`false` の場合、ボットはすべてのメッセージに応答します（専用タスクグループに便利です）。

### グループ履歴のバックフィル

デフォルトでは、Qwen はメンションのないグループメッセージを無視し、セッションのターンとして保存しません。次の `@mention` に最近のグループコンテキストを含めるには、`groupHistoryLimit` を正の数に設定します。

```json
{
  "channels": {
    "my-dingtalk": {
      "type": "dingtalk",
      "clientId": "$DINGTALK_CLIENT_ID",
      "clientSecret": "$DINGTALK_CLIENT_SECRET",
      "groupPolicy": "open",
      "groupHistoryLimit": 50,
      "groups": {
        "*": { "requireMention": true },
        "sensitive-group-id": {
          "requireMention": true,
          "groupHistoryLimit": 0
        }
      }
    }
  }
}
```

- 省略または `0` はバックフィルを無効にします。
- グループレベルの `groupHistoryLimit` はチャンネルレベルの値を上書きします。
- 許可された送信者、または承認済みペアリンググループのメンバーからのメッセージのみが永続化されます。
- `groupPolicy` またはグループ許可リストによって拒否されたメッセージは永続化されません。
- 保留中のグループ履歴は、`~/.qwen/channels/<channel-name>-group-history.jsonl` または `$QWEN_HOME/channels/<channel-name>-group-history.jsonl` 配下のローカル JSONL として保存されます。
- キャッシュされたメッセージは、次の実際のトリガーで信頼できないコンテキストとして注入され、独立したセッションのターンとして書き込まれません。

### グループメッセージの評価方法

```
1. groupPolicy — is this group disabled, listed, paired, or open? (no → ignore/pairing flow)
2. dmPolicy — is this DM allowed?                      (disabled → ignore)
3. requireMention — was the bot mentioned/replied to? (no → ignore)
4. senderPolicy — is this sender approved?             (skipped for a paired group; otherwise no → user pairing flow)
5. Route to session
```

### グループ向け Telegram のセットアップ

1. ボットをグループに追加します
2. BotFather で **プライバシーモードを無効にします**（`/mybots` → Bot Settings → Group Privacy → Turn Off）。無効にしないと、ボットはコマンド以外のメッセージを見ることができません。
3. プライバシーモードを変更した後、グループからボットを**削除して再度追加します**（Telegram はこの設定をキャッシュするため）。

### グループチャット ID の確認

`groups` 許可リスト用のグループチャット ID を確認するには:

1. ボットが実行中の場合は停止する
2. グループ内でボットにメンション付きのメッセージを送信する
3. Telegram Bot API を使用してキューに入れられた更新を確認する:

```bash
curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates" | python3 -m json.tool
```

レスポンス内の `message.chat.id` を確認します。グループ ID は負の数値です（例: `-5170296765`）。

## メディアサポート

チャネルでは、テキストだけでなく、エージェントへの画像やファイルの送信もサポートされています。

### 画像

ボットに写真を送信すると、エージェントがそれを認識します。スクリーンショット、エラーメッセージ、図の共有に便利です。画像は vision input としてモデルに直接送信されます。

画像サポートを使用するには、チャネルにマルチモーダルモデルを設定します:

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

ボットにドキュメント（PDF、コードファイル、テキストファイルなど）を送信します。ファイルはダウンロードされて一時ディレクトリに保存され、エージェントにファイルパスが通知されるため、ファイル読み取りツールを使用して内容を読み取ることができます。

ファイルはどのモデルでも機能します。マルチモーダルサポートは不要です。

### プラットフォームによる違い

| 機能 | Telegram | WeChat | DingTalk | Feishu |
| --- | --- | --- | --- | --- |
| 画像 | Bot API 経由で直接ダウンロード | AES 復号化付き CDN ダウンロード | downloadCode API（2ステップ） | Open API リソースエンドポイント（認証付き GET、50MB 制限） |
| ファイル | Bot API 経由で直接ダウンロード（20MB 制限） | AES 復号化付き CDN ダウンロード | downloadCode API（2ステップ） | Open API リソースエンドポイント（50MB 制限） |
| キャプション | 写真/ファイルのキャプションがメッセージテキストとして含まれる | 対象外 | リッチテキスト: 1つのメッセージにテキストと画像が混在 | リッチテキスト（`post`）: テキストが抽出され、埋め込み画像は無視される |

> QQ Bot は受信メディアを処理しません。画像やスタンプのメッセージは無視されるため、上記のメディア処理に関する行はありません。
>
> WeCom はテキスト、画像、テキストと画像の混合、ファイル、動画、および音声メッセージ（文字起こり済み）を受け付けます。画像は添付ファイルとしてエージェントに渡されます。ファイルと動画は一時的なローカルパスにダウンロードされます。詳細は [WeCom](./wecom#images-and-files) を参照してください。

## ディスパッチモード

ボットが前のメッセージを処理している間に新しいメッセージを送信した際の動作を制御します。

- **`steer`**（デフォルト） — ボットは現在のリクエストをキャンセルし、新しいメッセージの処理を開始します。フォローアップが通常ボットの修正や方向転換を意味する通常のチャットに最適です。
- **`collect`** — 新しいメッセージはバッファリングされます。現在のリクエストが完了すると、バッファリングされたすべてのメッセージが1つのフォローアッププロンプトに結合されます。考えをキューに入れたい非同期ワークフローに適しています。
- **`followup`** — 各メッセージはキューに入れられ、順番に独立したターンとして処理されます。各メッセージが独立しているバッチワークフローに便利です。

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

チャネルのデフォルト設定を上書きして、グループごとにディスパッチモードを設定することもできます:

```json
{
  "groups": {
    "*": { "requireMention": true, "dispatchMode": "steer" },
    "-100123456": { "dispatchMode": "collect" }
  }
}
```

## ブロックストリーミング

デフォルトでは、エージェントはしばらく処理を行った後、1つの大きなレスポンスを送信します。ブロックストリーミングを有効にすると、エージェントが処理を続けている間、レスポンスが複数の短いメッセージとして届きます。これは、ChatGPT や Claude が進行中の出力を表示する仕組みと似ています。

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

### 仕組み

- エージェントのレスポンスは段落の境界でブロックに分割され、個別のメッセージとして送信されます
- `minChars`（デフォルト 400） — 小さなメッセージのスパムを避けるため、少なくともこの文字数に達するまでブロックを送信しません
- `maxChars`（デフォルト 1000） — 自然な区切りがないままブロックがこの文字数に達した場合、とにかく送信します
- `idleMs`（デフォルト 1500） — エージェントが一時停止した場合（例: ツールの実行中）、それまでにバッファリングされた内容を送信します
- エージェントが完了すると、残りのテキストはすぐに送信されます

必須なのは `blockStreaming` だけです。chunk と coalesce の設定はオプションであり、適切なデフォルト値が設定されています。

## スケジュールチャンネルループ

チャンネルには、後で実行して結果を同じチャットにプッシュバックするプロンプトのための永続スケジューラがあります。エージェントに自然に依頼できます。たとえば `Every 15 minutes, check the deployment and report any change` のように、またはローカルコマンドを直接使用できます。

```text
/loop add "*/15 * * * *" check the deployment and report any change
/loop list
/loop inspect <id>
/loop cancel <id>
```

エージェントがこれらのジョブを管理する際に `channel_loop_create`、`channel_loop_list`、`channel_loop_cancel` ツールを使用します。スケジュールはマシンのローカル時間で標準的な 5 フィールドの cron 式を使用します。ジョブは無人で実行され、最終応答は自動的に作成元のチャットに配信されます。

チャンネルループは [Run Prompts on a Schedule](../scheduled-tasks) で説明されているセッションスコープのタスクとは異なります。

- `$QWEN_HOME/channels/` 配下に保存されます。スタンドアロンチャンネルは `cron.json` を直接使用し、デーモン管理チャンネルは `daemon/` 配下のワークスペースごとのファイルを使用します。どちらもチャンネルの再起動をまたいで生存します。
- 現在のチャンネルチャットまたはスレッドにスコープされます。各ターゲットは最大 10 個の有効なループを持つことができ、各プロンプトは 4,000 文字に制限されます。
- プロアクティブ配信をサポートするアダプタとターゲットが必要です。Telegram、DingTalk、Feishu、WeCom がオプトインし、プラットフォーム固有のターゲット制限に従います。
- `sessionScope: "single"` では利用できません。そのスコープは 1 つのチャットターゲットに紐づかないためです。
- 保存されたループは、実行時刻になった時点でターゲットがもはや認可されていない場合、無効になります。

## バックグラウンドエージェントの結果

エージェントがバックグラウンドのサブエージェントまたはフォークに作業を委任すると、完了結果はセッションを所有するチャンネルチャットに配信されます。配信は元のターンが終了した後に発生する可能性があるため、バックグラウンドの作業がアクティブな間はチャンネルサービスまたはデーモンを実行し続けてください。

## スラッシュコマンド

チャネルはスラッシュコマンドをサポートしています。これらはローカルで処理されます（エージェントとの往復は発生しません）:

- `/help` — 利用可能なコマンドの一覧を表示
- `/clear` — セッションをクリアして新規開始（エイリアス: `/reset`, `/new`）
- `/status` — セッション情報とアクセスポリシーを表示
- `/sessions [all]` — 開いている名前付きタスクを一覧表示、または閉じたタスクを含む。`multiSession: true` の場合のみ利用可能
- `/session current` — 選択中の名前付きタスクを表示
- `/session new <name>` — 共有ワークスペースのタスクを作成して選択
- `/session new <name> --worktree` — 認識されるが Part 4 まで延期
- `/session use <name>` — 開いているタスクを選択、または閉じたタスクを再開
- `/session cancel [<name>]` — 認識されるが Part 3 まで延期。切り替え前に選択中のタスクが完了するのを待ってください。Telegram ユーザーは選択中のタスクに `/cancel` を使用できます
- `/session close <name>` — トランスクリプトを削除せずにタスクを閉じる
- `/loop add "<cron>" <prompt>` — 永続的なスケジュールチャンネルループを作成
- `/loop list` — 現在のチャットのループを一覧表示
- `/loop inspect <id>` — ループのステータスと実行の詳細を表示
- `/loop cancel <id>` — ループを無効化

その他のすべてのスラッシュコマンド（例: `/compress`, `/summary`）はエージェントに転送されます。

これらのコマンドは、すべてのチャネルタイプ（Telegram, WeChat, QQ, DingTalk, WeCom, Feishu, GitHub）で機能します。ただし、ループの作成には現在のアダプタとターゲットのプロアクティブ配信サポートも必要です。

## 実行

```bash
# 設定されたすべてのチャネルを起動（エージェントプロセスを共有）
qwen channel start

# 単一のチャネルを起動
qwen channel start my-channel

# サービスが実行中かどうかを確認
qwen channel status

# 実行中のサービスを停止
qwen channel stop
```

ボットはフォアグラウンドで実行されます。停止するには `Ctrl+C` を押すか、別のターミナルから `qwen channel stop` を使用します。

### 実験的デーモン管理モード

設定したチャネルを `qwen serve` 配下で実行することもできます:

```bash
# デーモンのライフサイクル配下で1つのチャネルを起動
qwen serve --channel my-channel

# 設定されたすべてのチャネルを起動
qwen serve --channel all

# または、トークン保護されたデーモンでチャンネルを後から有効にする
QWEN_SERVER_TOKEN=secret qwen serve
qwen channel set my-channel --token secret

# デーモン管理の選択をクエリまたは停止
qwen channel status --daemon-url http://127.0.0.1:4170 --token secret
qwen channel stop --daemon-url http://127.0.0.1:4170 --token secret
```

このモードでは、`qwen serve` が所有するワークスペースグループ化されたチャネルワーカープロセスが起動します。ワーカーは SDK を介してデーモンに接続し、同じチャネルアダプタを使用します。デーモンプロセスとは分離されているため、チャネルアダプタがクラッシュしてもデーモンはクラッシュしません。`--channel` なしで起動したデーモンは、最初の `qwen channel set` までチャネルアダプタをロードせず、チャネルサービスの PID リースを予約しません。

`qwen serve --channel` は `qwen channel start` とは異なるサービスです。単独の `qwen channel start` は引き続き ACP ベースのチャネルサービスを使用し、異なる `cwd` 値を持つチャネル設定を実行できます。デーモン管理チャネルでは、選択した各チャネルの `cwd` がデーモンに登録されたワークスペースに解決される必要があります。マルチワークスペースモードでは、選択の置換時に順序付きチャネルリストが変更されていないワークスペースのワーカーは保持されます。`all` は引き続きプライマリワークスペース専用です。

`--daemon-url` なしでは、`qwen channel status` と `qwen channel stop` はスタンドアロンの pidfile 動作を維持します。`--daemon-url`  variants はデーモンマネージャーをクエリまたは停止します。ランタイムの選択は設定に書き込まれず、デーモンの再起動をまたいで生存しません。準備ができたワーカーが予期せず終了した場合、デーモンは実行を継続し、`/daemon/status` にチャネルワーカーの警告を報告します。

## Webhook トリガータスク

デーモン管理チャンネルは認証済み Webhook イベントを受け付けることもできます。Qwen はイベントをコンテキストとして受け取り、重要な内容を要約して判断し、最終応答を設定されたチャットターゲットに配信します。これは生のお知らせの中継ではありません。
Webhook タスクは `approvalMode: "yolo"` を必要とします。対話型の承認なしに実行されるためです。この設定は Webhook ターンだけでなくチャンネル全体に適用されるため、専用の Webhook チャンネルを使用するか、そのチャンネルの通常のチャット送信者を厳しく制限してください。

チャンネル設定例:

```json
{
  "channels": {
    "dingtalk-main": {
      "type": "dingtalk",
      "clientId": "$DINGTALK_CLIENT_ID",
      "clientSecret": "$DINGTALK_CLIENT_SECRET",
      "cwd": "/repo",
      "senderPolicy": "allowlist",
      "allowedUsers": ["12345"],
      "approvalMode": "yolo",
      "sessionScope": "user",
      "webhooks": {
        "sources": {
          "github-ci": {
            "secretEnv": "QWEN_CHANNEL_GITHUB_CI_SECRET",
            "targets": {
              "operator": {
                "chatId": "DINGTALK_USER_ID",
                "senderId": "webhook:github-ci",
                "isGroup": false
              },
              "team": {
                "chatId": "OPEN_CONVERSATION_ID",
                "senderId": "webhook:github-ci",
                "isGroup": true
              }
            }
          }
        }
      }
    }
  }
}
```

DingTalk の場合、各ターゲットに `isGroup` を明示的に設定します。ダイレクトメッセージのターゲットは `chatId` に DingTalk ユーザー ID を、`isGroup: false` を使用します。グループターゲットはグループの `openConversationId` に `isGroup: true` を使用します。他のアダプタは独自のプロアクティブターゲット形状を要求する場合があります。

デーモン管理の DingTalk、Feishu、Telegram、WeCom チャンネルは、許可された受信メッセージからコンタクトを動的に監視します。デフォルトの 7 日間の鮮度ウィンドウ内にプライマリワークスペースで観測されたコンタクトを一覧表示します。

```bash
curl -H "Authorization: Bearer $QWEN_SERVER_TOKEN" \
  http://127.0.0.1:4170/workspace/channel/observed-contacts
```

別の登録済みの信頼されたワークスペースを選択するには `GET /workspaces/:workspace/channel/observed-contacts` を使用します。1 秒から 365 日までのウィンドウを選択するには `?freshWithinSeconds=N` を追加します。デーモンはこの API を `workspace_channel_observed_contacts` ケイパビリティで公開します。

レスポンスは完全なプラットフォーム ID とラベルを返します。グループラベルは、利用可能な場合、受け入れられた受信メッセージにすでに存在する名前を使用します。DingTalk は `conversationTitle` を提供し、Telegram は `chat.title` を提供します。Feishu と WeCom のグループラベルは現在完全な ID にフォールバックします。プラットフォームディレクトリやグループ詳細 API はクエリされません。トピクラベルも完全な ID にフォールバックします。各 `lastObservedAt` はミリ秒精度の正規化された ISO 8601 UTC タイムスタンプです。クライアントはこれをユーザーのローカルタイムゾーンに変換して表示できます。トップレベルの `users` にはダイレクトメッセージで観測されたユーザーが含まれます。`groups` には観測されたグループ会話が含まれ、`groups[].users` には各グループで観測されたユーザーが含まれ、`groups[].topics[].users` には Feishu または Telegram のトピックで観測されたユーザーが含まれます。

```json
{
  "users": [
    {
      "channelName": "feishu-main",
      "label": "Example User",
      "id": "ou_complete_user_id",
      "lastObservedAt": "2026-07-17T08:00:00.000Z"
    }
  ],
  "groups": [
    {
      "channelName": "feishu-main",
      "label": "oc_complete_chat_id",
      "id": "oc_complete_chat_id",
      "lastObservedAt": "2026-07-17T08:05:00.000Z",
      "users": [
        {
          "label": "Example User",
          "id": "ou_complete_user_id",
          "lastObservedAt": "2026-07-17T08:05:00.000Z"
        }
      ],
      "topics": []
    }
  ]
}
```

これらのネストされたユーザーは観測された参加者であり、権威あるグループメンバーシップではありません。ダイレクト/グループ、メンション、送信者、およびペアリングのゲートを通過したメッセージのみが記録されます。繰り返し観測されるとラベルとタイムスタンプが更新されます。受動的な観測では、関係が古くなるまで退出や削除を検出できません。メッセージ内容は保存されません。バウンドされたレジストリは `$QWEN_HOME/channels/daemon/<workspaceHash>/observed-contacts.json` 配下に存在し、ワークスペースのチェックアウトの外にあり、ワークスペースごとに分割されます。500 観測の上限は、そのワークスペースのすべてのチャンネルと会話で共有され、365 日より古い観測は次の受け入れられた書き込み時に削除されます。レジストリが不正な形式またはサポートされていないバージョンになった場合、そのファイルを削除してリセットしてください。受け入れられたトラフィックが再作成します。Webhook の設定と配信は変更されません。

チャンネルワーカーを有効にして `qwen serve` を起動します。

```bash
QWEN_SERVER_TOKEN="$QWEN_SERVER_TOKEN" qwen serve --require-auth --channel dingtalk-main
```

リクエスト例:

```bash
curl -X POST "http://127.0.0.1:4170/channels/dingtalk-main/webhooks/github-ci" \
  -H "x-qwen-webhook-secret: $QWEN_CHANNEL_GITHUB_CI_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "push",
    "targetRef": "operator",
    "title": "CI pipeline finished",
    "payload": {
      "targetRef": "refs/heads/main",
      "repository": "qwen-code",
      "status": "success"
    }
  }'
```

Webhook ルートは、`qwen serve` が Bearer 認証を有効にして実行されている場合でも、Webhook シークレットヘッダーで認証されます。デーモンの Bearer トークンを Webhook プロバイダーと共有しないでください。Webhook 設定と `secretEnv` の値はデーモンが起動するときにロードされます。Webhook ソースを変更した後やシークレットをローテーションした後は `qwen serve` を再起動してください。`202 {"accepted": true}` レスポンスは、チャンネルワーカーがタスクの所有権を受け入れたことを意味し、最終応答がすでにチャットに配信されたことではありません。配信の失敗をトラブルシューティングする際は、デーモンとチャンネルワーカーのログと `/daemon/status` を確認してください。

### マルチチャネルモード

名前を指定せずに `qwen channel start` を実行すると、`settings.json` で定義されたすべてのチャネルが、単一のエージェントプロセスを共有して同時に起動します。各チャネルは独自のセッションを維持します。同じエージェントを共有していても、Telegram ユーザーと WeChat ユーザーは別々の会話を取得します。

各チャネルは設定から独自の `cwd` を使用するため、異なるチャネルが同時に異なるプロジェクトで作業できます。

### サービス管理

チャネルサービスは PID ファイル（`~/.qwen/channels/service.pid`）を使用して、実行中のインスタンスを追跡します:

- **重複防止**: サービスがすでに実行中に `qwen channel start` を実行すると、2つ目のインスタンスを起動する代わりにエラーが表示されます
- **`qwen channel stop`**: 別のターミナルから実行中のサービスを正常に停止します
- **`qwen channel status`**: サービスが実行中かどうか、稼働時間、およびチャネルごとのセッション数を表示します

### クラッシュからの復旧

エージェントプロセスが予期せずクラッシュした場合、チャネルサービスは自動的にそれを再起動し、すべてのアクティブなセッションの復元を試みます。ユーザーはやり直すことなく会話を継続できます。

- セッションは、サービスの実行中に `~/.qwen/channels/sessions.json` に永続化されます
- クラッシュ時: エージェントは3秒以内に再起動し、保存されたセッションをリロードします
- 3回連続でクラッシュした後、サービスはエラーで終了します
- 正常なシャットダウン時（`Ctrl+C` または `qwen channel stop`）: セッションデータはクリアされ、次回の起動は常に新規状態になります
