# カスタムチャネルプラグイン

チャネルシステムは、[拡張機能](../../extension/introduction)としてパッケージ化されたカスタムプラットフォームアダプタで拡張できます。これにより、Qwen Code を任意のメッセージングプラットフォーム、ウェブフック、またはカスタムトランスポートに接続できます。

## 動作の仕組み

チャネルプラグインは、アクティブな拡張機能から起動時に読み込まれます。`qwen channel start` を実行すると、次の処理が行われます。

1. 有効なすべての拡張機能の `qwen-extension.json` から `channels` エントリをスキャンします
2. 各チャネルのエントリポイントを動的にインポートします
3. `settings.json` で参照できるようにチャネルタイプを登録します
4. プラグインのファクトリ関数を使用してチャネルインスタンスを作成します

カスタムチャネルは、共有パイプライン全体を自動的に利用できます。送信者ゲーティング、グループポリシー、セッションルーティング、スラッシュコマンド、クラッシュリカバリ、エージェントへの ACP ブリッジなどです。

## カスタムチャネルのインストール

チャネルプラグインを提供する拡張機能をインストールします。

```bash
# From a local path (for development or private plugins)
qwen extensions install /path/to/my-channel-extension

# Or link it for development (changes are reflected immediately)
qwen extensions link /path/to/my-channel-extension
```

## カスタムチャネルの設定

拡張機能が提供するカスタムタイプを使用して、`~/.qwen/settings.json` にチャネルエントリを追加します。

```json
{
  "channels": {
    "my-bot": {
      "type": "my-platform",
      "apiKey": "$MY_PLATFORM_API_KEY",
      "senderPolicy": "open",
      "cwd": "/path/to/project"
    }
  }
}
```

`type` は、インストールした拡張機能によって登録されたチャネルタイプと一致する必要があります。必要なプラグイン固有のフィールド（`apiKey`、`webhookUrl` など）については、拡張機能のドキュメントを確認してください。

すべての標準チャネルオプションはカスタムチャネルでも機能します。

| オプション       | 説明                                          |
| -------------- | ---------------------------------------------- |
| `senderPolicy` | `allowlist`、`pairing`、または `open`             |
| `allowedUsers` | 送信者IDの静的許可リスト                         |
| `sessionScope` | `user`、`thread`、または `single`                  |
| `cwd`          | エージェントの作業ディレクトリ                     |
| `instructions` | 各セッションの最初のメッセージに前置される         |
| `model`        | チャネルのモデルオーバーライド                     |
| `groupPolicy`  | `disabled`、`allowlist`、または `open`             |
| `groups`       | グループごとの設定                               |

各オプションの詳細については、[概要](./overview)を参照してください。

## チャネルの起動

```bash
# Start all channels including custom ones
qwen channel start

# Start just your custom channel
qwen channel start my-bot
```

## 自動的に利用できる機能

カスタムチャネルは、組み込みチャネルが備えるすべての機能を自動的にサポートします。

- **送信者ポリシー** — `allowlist`、`pairing`、`open` によるアクセス制御
- **グループポリシー** — オプションの@メンションゲートを備えたグループごとの設定
- **セッションルーティング** — ユーザーごと、スレッドごと、または単一の共有セッション
- **DMペアリング** — 未知のユーザー向けの完全なペアリングコードフロー
- **スラッシュコマンド** — `/help`、`/clear`、`/status` が標準で使用可能
- **カスタム指示** — 各セッションの最初のメッセージに前置される
- **クラッシュリカバリ** — セッションを保持した自動再起動
- **セッションごとのシリアライゼーション** — 競合状態を防ぐためにメッセージをキューイング

## 独自のチャネルプラグインの構築

新しいプラットフォーム向けのチャネルプラグインを構築したいですか？ `ChannelPlugin` インターフェース、`Envelope` 形式、拡張ポイントについては、[チャネルプラグイン開発者ガイド](../../../developers/channel-plugins.md) を参照してください。