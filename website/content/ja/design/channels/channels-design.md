# Channels 設計

> Qwen Code の外部メッセージング統合 — Telegram、WeChat などからエージェントと対話できます。
>
> ユーザー向けドキュメント: [Channels 概要](../../users/features/channels/overview.md)

## 概要

**Channel** は、外部メッセージングプラットフォームを Qwen Code エージェントに接続します。`settings.json` で設定し、`qwen channel` サブコマンドで管理します。マルチユーザー対応（各ユーザーに独立した ACP セッションが割り当てられます）。

## アーキテクチャ

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

**Platform Adapter** — 外部 API に接続し、メッセージを Envelope に/から変換します。**ACP Bridge** — `qwen-code --acp` を起動し、セッションを管理し、`textChunk` / `toolCall` / `disconnected` イベントを発行します。**Session Router** — 名前空間付きキー（`<channel>:<sender>`）を使用して送信者を ACP セッションにマッピングします。**Sender Gate** / **Group Gate** — アクセス制御（allowlist / pairing / open）とメンションゲートを担当します。**Channel Base** — Template Method パターンを採用した抽象基底クラス。プラグインは `connect`、`sendMessage`、`disconnect` をオーバーライドします。**Channel Registry** — 衝突検出機能付きの `Map<string, ChannelPlugin>`。

### Envelope

すべてのプラットフォームが変換する正規化されたメッセージ形式:

- **Identity**: `senderId`、`senderName`、`chatId`、`channelName`
- **Content**: `text`、オプションで `imageBase64` / `imageMimeType`、オプションで `referencedText`
- **Context**: `isGroup`、`isMentioned`、`isReplyToBot`、オプションで `threadId`

プラグインの責務: `senderId` は安定かつ一意であること。`chatId` は DM とグループを区別できること。ブール値フラグはゲートロジックのために正確であること。`text` から @メンションは除去されること。

### メッセージフロー

```
受信: ユーザーメッセージ → Adapter → GroupGate → SenderGate → スラッシュコマンド → SessionRouter → AcpBridge → エージェント
送信: エージェント応答 → AcpBridge → SessionRouter → Adapter → ユーザー
```

スラッシュコマンド（`/clear`、`/help`、`/status`）は、エージェントに到達する前に ChannelBase で処理されます。

### セッション

単一の `qwen-code --acp` プロセス内で複数の ACP セッションを実行します。チャネルごとのスコープ: **`user`** (デフォルト)、**`thread`**、または **`single`**。ルーティングキーは `<channelName>:<key>` で名前空間化されます。

### エラーハンドリング

- **接続失敗** — ログに記録。少なくとも1つのチャネルが接続できればサービスは継続。
- **Bridge のクラッシュ** — 指数バックオフ（最大3回リトライ）、すべてのチャネルで `setBridge()` を実行し、セッションを復元。
- **セッションの直列化** — セッションごとのプロミスチェーンにより、同時プロンプトの衝突を防止。

## プラグインシステム

アーキテクチャは拡張可能です — コアを変更せずに新しいアダプター（サードパーティ製を含む）を追加できます。組み込みチャネルも同じプラグインインターフェースを使用しています（ドッグフーディング）。

### プラグインコントラクト

`ChannelPlugin` は `channelType`、`displayName`、`requiredConfigFields`、および `createChannel()` ファクトリを宣言します。プラグインは以下の3つのメソッドを実装します:

| メソッド                    | 責務                                               |
| --------------------------- | -------------------------------------------------- |
| `connect()`                 | プラットフォームに接続し、メッセージハンドラを登録 |
| `sendMessage(chatId, text)` | エージェント応答を整形して配信                     |
| `disconnect()`              | シャットダウン時のクリーンアップ                   |

受信メッセージに対して、プラグインは `Envelope` を構築し、`this.handleInbound(envelope)` を呼び出します。基底クラスが残りの処理（アクセス制御、グループゲート、ペアリング、セッションルーティング、プロンプトの直列化、スラッシュコマンド、指示の注入、返信コンテキスト、クラッシュリカバリ）を担当します。

### 拡張ポイント

- カスタムスラッシュコマンド: `registerCommand()` 経由
- 作業中インジケーター: `handleInbound()` を入力中表示やリアクション表示でラップ
- ツールコールフック: `onToolCall()` 経由
- メディア処理: `handleInbound()` の前に Envelope に添付

### 検出と読み込み

外部プラグインは **拡張機能** であり、`ExtensionManager` で管理され、`qwen-extension.json` で宣言します:

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

`qwen channel start` の読み込み順序: 設定の読み込み → 組み込みチャネルの登録 → 拡張機能のスキャン → 動的インポート + 検証 → 登録（衝突は拒否）→ 設定の検証 → `createChannel()` → `connect()`。

プラグインはインプロセスで動作し（サンドボックスなし）、npm 依存関係と同じ信頼モデルに従います。

## 設定

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

認証はプラグイン固有です: 静的トークン（Telegram）、アプリケーション認証情報（DingTalk）、QR コードログイン（WeChat）、プロキシトークン（TMCP）。

## CLI コマンド

```bash
# Channels
qwen channel start [name]                     # すべてまたは指定のチャネルを起動
qwen channel stop                             # 実行中のサービスを停止
qwen channel status                           # チャネル、セッション、稼働時間を表示
qwen channel pairing list <ch>                # 保留中のペアリングリクエスト
qwen channel pairing approve <ch> <code>      # リクエストを承認

# Extensions
qwen extensions install <path-or-package>     # インストール
qwen extensions link <local-path>             # 開発用にシンボリックリンク
qwen extensions list                          # インストール済みを表示
qwen extensions remove <name>                 # アンインストール
```

## パッケージ構造

```
packages/channels/
├── base/                    # @qwen-code/channel-base
│   └── src/
│       ├── AcpBridge.ts     # ACP プロセスのライフサイクル、セッション管理
│       ├── SessionRouter.ts # sender ↔ session マッピング、永続化
│       ├── SenderGate.ts    # allowlist / pairing / open
│       ├── GroupGate.ts     # グループチャットポリシー + メンションゲート
│       ├── PairingStore.ts  # ペアリングコード生成 + 承認
│       ├── ChannelBase.ts   # 抽象基底: ルーティング、スラッシュコマンド
│       └── types.ts         # Envelope、ChannelConfig など
├── telegram/                # @qwen-code/channel-telegram
├── weixin/                  # @qwen-code/channel-weixin
└── dingtalk/                # @qwen-code/channel-dingtalk
```

## 将来の作業

### 安全性とグループチャット

- **グループごとのツール制限** — グループごとの `tools` / `toolsBySender` 拒否/許可リスト
- **グループコンテキスト履歴** — 最近スキップされたメッセージのリングバッファ、@メンション時に先頭に追加
- **正規表現メンションパターン** — @メンションのメタデータが信頼できない場合の代替 `mentionPatterns`
- **グループごとの指示** — `GroupConfig` の `instructions` フィールドでグループごとのペルソナ設定
- **`/activation` コマンド** — 実行時に `requireMention` を切り替え、ディスクに永続化

### 運用ツール

- **`qwen channel doctor`** — 設定の検証、環境変数、Bot トークン、ネットワークチェック
- **`qwen channel status --probe`** — チャネルごとの実際の接続確認

### プラットフォーム拡張

- **Discord** — Bot API + Gateway、サーバー/チャンネル/DM/スレッド
- **Slack** — Bolt SDK、Socket Mode、ワークスペース/チャンネル/DM/スレッド

### マルチエージェント

- **マルチエージェントルーティング** — チャネル/グループ/ユーザーごとに複数のエージェントをバインド
- **ブロードキャストグループ** — 複数のエージェントが同じメッセージに応答

### プラグインエコシステム

- **コミュニティプラグインテンプレート** — `create-qwen-channel` スキャフォールディングツール
- **プラグインレジストリ/検出** — `qwen extensions search`、バージョン互換性