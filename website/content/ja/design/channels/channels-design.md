# チャンネル設計

> Qwen Code の外部メッセージング統合 — Telegram、WeChat などからエージェントと対話できます。
>
> ユーザー向けドキュメント: [Channels Overview](../../users/features/channels/overview.md)。

## Overview

**チャンネル**は、外部メッセージングプラットフォームと Qwen Code エージェントを接続します。`settings.json` で設定し、`qwen channel` サブコマンドで管理します。マルチユーザーに対応しており、各ユーザーに独立した ACP セッションが割り当てられます。

## Architecture

```
┌──────────┐                        ┌─────────────────────────────────────┐
│ Telegram │    Platform API        │        Channel Service              │
│ User A   │◄──────────────────────►│                                     │
├──────────┤  (WebSocket/polling)   │  ┌───────────┐    ┌──────────────┐  │
│ WeChat   │◄──────────────────────►│  │ Platform   │    │  ACP Bridge  │  │
│ User B   │                        │  │ Adapter    │    │  (shared)    │  │
└──────────┘                        │  │            │    │              │  │
                                    │  │ - connect  │    │  - spawns    │  │
                                    │  │ - receive  │    │    qwen-code │  │
                                    │  │ - send     │    │  - manages   │  │
                                    │  │            │    │    sessions  │  │
                                    │  └─────┬──────┘    └──────┬───────┘  │
                                    │        │                  │          │
                                    │        ▼                  ▼          │
                                    │  ┌─────────────────────────────────┐ │
                                    │  │  SenderGate · GroupGate         │ │
                                    │  │  SessionRouter · ChannelBase    │ │
                                    │  └─────────────────────────────────┘ │
                                    └─────────────────────────────────────┘
                                                     │
                                                     │ stdio (ACP ndjson)
                                                     ▼
                                    ┌─────────────────────────────────────┐
                                    │        qwen-code --acp              │
                                    │   Session A (user alice, id: "abc") │
                                    │   Session B (user bob,   id: "def") │
                                    └─────────────────────────────────────┘
```

**Platform Adapter** — 外部 API に接続し、メッセージと Envelope の相互変換を行います。**ACP Bridge** — `qwen-code --acp` を起動し、セッションを管理して `textChunk`/`toolCall`/`disconnected` イベントを発行します。**Session Router** — 名前空間付きキー（`<channel>:<sender>`）を使用して、送信者を ACP セッションにマッピングします。**Sender Gate** / **Group Gate** — アクセス制御（allowlist / pairing / open）およびメンションのゲート処理。**Channel Base** — Template Method パターンを採用した抽象基底クラス。プラグインは `connect`、`sendMessage`、`disconnect` をオーバーライドします。**Channel Registry** — 衝突検出機能を備えた `Map<string, ChannelPlugin>`。

### Envelope

すべてのプラットフォームが変換する正規化されたメッセージ形式:

- **Identity**: `senderId`, `senderName`, `chatId`, `channelName`
- **Content**: `text`, 任意の `imageBase64`/`imageMimeType`, 任意の `referencedText`
- **Context**: `isGroup`, `isMentioned`, `isReplyToBot`, 任意の `threadId`

プラグインの責務: `senderId` は安定かつ一意である必要があります。`chatId` は DM とグループを区別する必要があります。ブール値フラグはゲートロジックのために正確である必要があります。`text` から @メンションは削除されます。

### Message Flow

```
Inbound:  User message → Adapter → GroupGate → SenderGate → Slash commands → SessionRouter → AcpBridge → Agent
Outbound: Agent response → AcpBridge → SessionRouter → Adapter → User
```

スラッシュコマンド（`/clear`、`/help`、`/status`）は、エージェントに到達する前に ChannelBase で処理されます。

### Sessions

1 つの `qwen-code --acp` プロセスで複数の ACP セッションを管理します。チャンネルごとのスコープ: **`user`**（デフォルト）、**`thread`**、または **`single`**。ルーティングキーは `<channelName>:<key>` の形式で名前空間化されます。

### Error Handling

- **接続失敗** — ログに記録されます。少なくとも 1 つのチャンネルが接続されていればサービスは継続します。
- **Bridge のクラッシュ** — 指数バックオフ（最大 3 回リトライ）、全チャンネルで `setBridge()` を実行、セッションの復元。
- **セッションのシリアライズ** — セッションごとの Promise チェーンにより、プロンプトの同時実行衝突を防止します。

## Plugin System

このアーキテクチャは拡張可能です。コアを変更することなく、新しいアダプター（サードパーティ製を含む）を追加できます。組み込みチャンネルも同じプラグインインターフェースを使用しています（ドッグフーディング）。

### Plugin Contract

`ChannelPlugin` は `channelType`、`displayName`、`requiredConfigFields`、および `createChannel()` ファクトリを宣言します。プラグインは以下の 3 つのメソッドを実装します:

| Method                      | Responsibility                                    |
| --------------------------- | ------------------------------------------------- |
| `connect()`                 | プラットフォームに接続し、メッセージハンドラーを登録する |
| `sendMessage(chatId, text)` | エージェントの応答をフォーマットして配信する         |
| `disconnect()`              | シャットダウン時のクリーンアップ                   |

受信メッセージの場合、プラグインは `Envelope` を構築して `this.handleInbound(envelope)` を呼び出します。残りの処理（アクセス制御、グループゲート、ペアリング、セッションルーティング、プロンプトのシリアライズ、スラッシュコマンド、指示の注入、返信コンテキスト、クラッシュリカバリ）は基底クラスが担当します。

### Extension Points

- `registerCommand()` によるカスタムスラッシュコマンド
- `handleInbound()` をラップしてタイピング/リアクション表示を行う作業中インジケーター
- `onToolCall()` によるツール呼び出しフック
- `handleInbound()` の前に Envelope に添付するメディア処理

### Discovery & Loading

外部プラグインは `ExtensionManager` によって管理される **拡張機能** であり、`qwen-extension.json` で宣言されます:

```json
{
  "name": "my-channel-extension",
  "version": "1.0.0",
  "channels": {
    "my-platform": {
      "entry": "dist/index.js",
      "displayName": "My Platform Channel"
    }
  }
}
```

`qwen channel start` 時の読み込みシーケンス: 設定の読み込み → 組み込みの登録 → 拡張機能のスキャン → 動的インポート + 検証 → 登録（衝突を拒否） → 設定の検証 → `createChannel()` → `connect()`。

プラグインはプロセス内で実行されます（サンドボックスなし）。npm 依存関係と同じ信頼モデルを採用しています。

## Configuration

```jsonc
{
  "channels": {
    "my-telegram": {
      "type": "telegram",
      "token": "$TELEGRAM_BOT_TOKEN", // 環境変数参照
      "senderPolicy": "allowlist", // allowlist | pairing | open
      "allowedUsers": ["123456"],
      "sessionScope": "user", // user | thread | single
      "cwd": "/path/to/project",
      "model": "qwen3.5-plus",
      "instructions": "Keep responses short.",
      "groupPolicy": "disabled", // disabled | allowlist | open
      "groups": { "*": { "requireMention": true } },
    },
  },
}
```

認証はプラグイン固有です: 静的トークン（Telegram）、アプリ認証情報（DingTalk）、QR コードログイン（WeChat）、プロキシトークン（TMCP）。

## CLI Commands

```bash
# チャンネル
qwen channel start [name]                     # 全チャンネルまたは指定チャンネルを起動
qwen channel stop                             # 実行中のサービスを停止
qwen channel status                           # チャンネル、セッション、稼働時間を表示
qwen channel pairing list <ch>                # 保留中のペアリングリクエスト
qwen channel pairing approve <ch> <code>      # リクエストを承認

# 拡張機能
qwen extensions install <path-or-package>     # インストール
qwen extensions link <local-path>             # 開発用のシンボリックリンク
qwen extensions list                          # インストール済みを表示
qwen extensions remove <name>                 # アンインストール
```

## Package Structure

```
packages/channels/
├── base/                    # @qwen-code/channel-base
│   └── src/
│       ├── AcpBridge.ts     # ACP プロセスのライフサイクル、セッション管理
│       ├── SessionRouter.ts # 送信者 ↔ セッションのマッピング、永続化
│       ├── SenderGate.ts    # allowlist / pairing / open
│       ├── GroupGate.ts     # グループチャットポリシー + メンションゲート
│       ├── PairingStore.ts  # ペアリングコードの生成 + 承認
│       ├── ChannelBase.ts   # 抽象基底クラス: ルーティング、スラッシュコマンド
│       └── types.ts         # Envelope、ChannelConfig など
├── telegram/                # @qwen-code/channel-telegram
├── weixin/                  # @qwen-code/channel-weixin
└── dingtalk/                # @qwen-code/channel-dingtalk
```

## Future Work

### セキュリティとグループチャット

- **グループごとのツール制限** — グループごとに `tools`/`toolsBySender` の拒否/許可リスト
- **グループコンテキスト履歴** — 最近スキップされたメッセージのリングバッファ。@メンション時に先頭に追加
- **正規表現メンションパターン** — @メンションのメタデータが信頼できない場合のフォールバック `mentionPatterns`
- **グループごとの指示** — グループごとのペルソナを設定する `GroupConfig` の `instructions` フィールド
- **`/activation` コマンド** — `requireMention` のランタイム切り替え。ディスクに永続化

### 運用ツール

- **`qwen channel doctor`** — 設定の検証、環境変数、ボットトークン、ネットワークチェック
- **`qwen channel status --probe`** — チャンネルごとの実際の接続チェック

### プラットフォームの拡張

- **Discord** — Bot API + Gateway、サーバー/チャンネル/DM/スレッド
- **Slack** — Bolt SDK、Socket Mode、ワークスペース/チャンネル/DM/スレッド

### マルチエージェント

- **マルチエージェントルーティング** — チャンネル/グループ/ユーザーごとにバインドされた複数のエージェント
- **ブロードキャストグループ** — 複数のエージェントが同じメッセージに応答

### プラグインエコシステム

- **コミュニティプラグインテンプレート** — `create-qwen-channel` スキャフォールディングツール
- **プラグインレジストリ/ディスカバリー** — `qwen extensions search`、バージョン互換性