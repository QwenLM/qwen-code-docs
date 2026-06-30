# カスタムチャネルプラグイン

[extensions](../../extension/introduction) としてパッケージ化されたカスタムプラットフォームアダプターを使用して、チャネルシステムを拡張できます。これにより、Qwen Code を任意のメッセージングプラットフォーム、Webhook、またはカスタムトランスポートに接続できます。

## 仕組み

チャネルプラグインは、起動時にアクティブな拡張機能から読み込まれます。`qwen channel start` が実行されると、以下の処理が行われます。

1. 有効化されたすべての拡張機能の `qwen-extension.json` 内にある `channels` エントリをスキャンします
2. 各チャネルのエントリーポイントを動的にインポートします
3. `settings.json` から参照できるようにチャネルタイプを登録します
4. プラグインのファクトリ関数を使用してチャネルインスタンスを作成します

カスタムチャネルは、共有パイプラインの全機能（送信者ゲーティング、グループポリシー、セッションルーティング、スラッシュコマンド、クラッシュリカバリー、エージェントブリッジ）を追加実装なしで利用できます。スタンドアロンの `qwen channel start` は現在 `AcpBridge` を提供していますが、プラグインアダプターコードはアダプター向けインターフェースである `ChannelAgentBridge` 契約に依存する必要があります。明示的な `AcpBridge` ブリッジパラメータを持つ既存の TypeScript プラグインは、そのアノテーションを `ChannelAgentBridge` に移行する必要があります。JavaScript プラグインは実行時に影響を受けません。

## カスタムチャネルのインストール

チャネルプラグインを提供する拡張機能をインストールします。

```bash
# From a local path (for development or private plugins)
qwen extensions install /path/to/my-channel-extension

# Or link it for development (changes are reflected immediately)
qwen extensions link /path/to/my-channel-extension
```

## カスタムチャネルの設定

拡張機能によって提供されるカスタムタイプを使用して、`~/.qwen/settings.json` にチャネルエントリを追加します。

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

`type` は、インストールされた拡張機能によって登録されたチャネルタイプと一致している必要があります。プラグイン固有のどのフィールドが必要か（例: `apiKey`、`webhookUrl`）については、拡張機能のドキュメントを確認してください。

すべての標準チャネルオプションはカスタムチャネルでも機能します。

| Option         | Description                                    |
| -------------- | ---------------------------------------------- |
| `senderPolicy` | `allowlist`、`pairing`、または `open`              |
| `allowedUsers` | 送信者IDの静的な許可リスト                 |
| `sessionScope` | `user`、`thread`、または `single`                  |
| `cwd`          | エージェントの作業ディレクトリ                |
| `instructions` | 各セッションの最初のメッセージに付加される指示 |
| `model`        | チャネルのモデルオーバーライド                 |
| `groupPolicy`  | `disabled`、`allowlist`、または `open`             |
| `groups`       | グループごとの設定                             |

各オプションの詳細については、[Overview](./overview) を参照してください。

## チャネルの起動

```bash
# カスタムチャネルを含むすべてのチャネルを起動
qwen channel start

# カスタムチャネルのみを起動
qwen channel start my-bot
```

## 標準で利用可能な機能

カスタムチャネルは、組み込みチャネルが持つすべての機能を自動的にサポートします。

- **送信者ポリシー** — `allowlist`、`pairing`、`open` のアクセス制御
- **グループポリシー** — オプションの @メンションゲーティングを伴うグループごとの設定
- **セッションルーティング** — ユーザーごと、スレッドごと、または単一の共有セッション
- **DMペアリング** — 不明なユーザー向けの完全なペアリングコードフロー
- **スラッシュコマンド** — `/help`、`/clear`、`/status` がすぐに使用可能
- **カスタム指示** — 各セッションの最初のメッセージに付加
- **クラッシュリカバリー** — セッションを保持したまま自動再起動
- **セッションごとのシリアライズ** — メッセージはキューイングされ、競合状態を防止

## 独自のチャネルプラグインの構築

新しいプラットフォーム用のチャネルプラグインを構築したいですか？ `ChannelPlugin` インターフェース、`Envelope` 形式、および拡張ポイントについては、[Channel Plugin Developer Guide](../../../developers/channel-plugins.md) を参照してください。