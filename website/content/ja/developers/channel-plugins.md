# チャネルプラグイン開発者ガイド

チャネルプラグインは、Qwen Code をメッセージングプラットフォームに接続します。これは[拡張機能](../users/extension/introduction)としてパッケージ化され、起動時にロードされます。プラグインのインストールと設定に関するユーザー向けドキュメントについては、[プラグイン](../users/features/channels/plugins)を参照してください。

## 全体構成

プラグインはプラットフォームアダプター層に配置されます。プラットフォーム固有の処理（接続、メッセージの受信、レスポンスの送信）を処理します。`ChannelBase` はその他のすべて（アクセス制御、セッションルーティング、プロンプトのキューイング、スラッシュコマンド、クラッシュリカバリー）を処理します。

```
Your Plugin  →  builds Envelope  →  handleInbound()
ChannelBase  →  gates → commands → routing → ChannelAgentBridge.prompt()
ChannelBase  →  calls your sendMessage() with the agent's response
```

`ChannelAgentBridge` はアダプター向けのブリッジ契約です。現在のスタンドアロン `qwen channel start` パスは `AcpBridge` を提供しますが、同じアダプターが後で他のブリッジ実装の背後で実行できるように、プラグインコードではコンストラクタパラメータを `ChannelAgentBridge` として型指定する必要があります。

既存の TypeScript プラグインの移行に関する注意: アダプターのコンストラクタまたはファクトリで `bridge` を明示的に `AcpBridge` として型指定している場合は、その注釈を `ChannelAgentBridge` に変更し、その契約で公開されているメソッドのみを引き続き使用してください。JavaScript プラグインは実行時に影響を受けず、スタンドアロンの `qwen channel start` は引き続き現在の `AcpBridge` 実装を渡します。

## プラグインオブジェクト

拡張機能のエントリポイントは、`ChannelPlugin` に準拠する `plugin` をエクスポートします。

```typescript
import type { ChannelPlugin } from '@qwen-code/channel-base';
import { MyChannel } from './MyChannel.js';

export const plugin: ChannelPlugin = {
  channelType: 'my-platform', // 一意のID。settings.json の "type" フィールドで使用
  displayName: 'My Platform', // CLI 出力に表示される
  requiredConfigFields: ['apiKey'], // 起動時に検証される（標準の ChannelConfig 以外）
  createChannel: (name, config, bridge, options) =>
    new MyChannel(name, config, bridge, options),
};
```

## チャネルアダプター

`ChannelBase` を継承し、3つのメソッドを実装します。

```typescript
import { ChannelBase } from '@qwen-code/channel-base';
import type {
  ChannelBaseOptions,
  ChannelAgentBridge,
  ChannelConfig,
  Envelope,
} from '@qwen-code/channel-base';

export class MyChannel extends ChannelBase {
  constructor(
    name: string,
    config: ChannelConfig,
    bridge: ChannelAgentBridge,
    options?: ChannelBaseOptions,
  ) {
    super(name, config, bridge, options);
  }

  async connect(): Promise<void> {
    // プラットフォームに接続し、メッセージハンドラを登録
    // メッセージが届いたとき:
    const envelope: Envelope = {
      channelName: this.name,
      senderId: '...', // 安定した、一意のプラットフォームユーザーID
      senderName: '...', // 表示名
      chatId: '...', // チャット/会話ID（DMとグループで区別）
      text: '...', // メッセージテキスト（@メンションを除去）
      isGroup: false, // 正確な値 — GroupGate によって使用
      isMentioned: false, // 正確な値 — GroupGate によって使用
      isReplyToBot: false, // 正確な値 — GroupGate によって使用
    };
    this.handleInbound(envelope);
  }

  async sendMessage(chatId: string, text: string): Promise<void> {
    // Markdown をプラットフォーム形式にフォーマットし、必要に応じて分割して配信
  }

  disconnect(): void {
    // 接続をクリーンアップ
  }
}
```

ほとんどのアダプターは `options` を変更せずにそのまま渡す必要があります。アダプターが独自の `SessionRouter` を作成し、そのルーターを `super()` に渡す場合は、`ChannelBaseOptions` で `registerBridgeEvents: true` を設定し、`ChannelBase` が `toolCall` および `sessionDied` イベントを直接受信できるようにします。チャネルゲートウェイから提供されるルーターの場合は、未設定のままにします。

## エンベロープ

プラットフォームデータから構築する正規化されたメッセージオブジェクト。ブール値フラグはゲートロジックを制御するため、正確である必要があります。

| フィールド | 型 | 必須 | 備考 |
| --- | --- | --- | --- |
| `channelName` | string | はい | `this.name` を使用 |
| `senderId` | string | はい | メッセージ間で安定している必要がある（セッションルーティングとアクセス制御に使用） |
| `senderName` | string | はい | 表示名 |
| `chatId` | string | はい | DM とグループを区別する必要がある |
| `text` | string | はい | ボットの @メンションを除去 |
| `threadId` | string | いいえ | `sessionScope: "thread"` 用 |
| `messageId` | string | いいえ | プラットフォームのメッセージID — レスポンスの相関付けに有用 |
| `isGroup` | boolean | はい | GroupGate がこれに依存 |
| `isMentioned` | boolean | はい | GroupGate がこれに依存 |
| `isReplyToBot` | boolean | はい | GroupGate がこれに依存 |
| `referencedText` | string | いいえ | 引用メッセージ — コンテキストとして先頭に追加 |
| `imageBase64` | string | いいえ | Base64 エンコードされた画像（レガシー — `attachments` を推奨） |
| `imageMimeType` | string | いいえ | 例: `image/jpeg`（レガシー — `attachments` を推奨） |
| `attachments` | Attachment[] | いいえ | 構造化されたメディア添付ファイル（下記参照） |

### 添付ファイル

画像、ファイル、音声、動画には `attachments` 配列を使用します。`handleInbound()` はこれらを自動的に解決します。Base64 の `data` を持つ画像は視覚入力としてモデルに送信され、`filePath` を持つファイルはそのパスがプロンプトに追加され、エージェントが読み取れるようになります。

```typescript
interface Attachment {
  type: 'image' | 'file' | 'audio' | 'video';
  data?: string; // Base64 エンコードされたデータ（画像、小さなファイル）
  filePath?: string; // ローカルファイルへの絶対パス（大きなファイルはディスクに保存）
  mimeType: string; // 例: 'application/pdf', 'image/jpeg'
  fileName?: string; // プラットフォームからの元のファイル名
}
```

例 — アダプターでのファイルアップロードの処理:

```typescript
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const buf = await downloadFromPlatform(fileId);
const dir = join(tmpdir(), 'channel-files');
if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
const filePath = join(dir, fileName);
writeFileSync(filePath, buf);

envelope.attachments = [
  {
    type: 'file',
    filePath,
    mimeType: 'application/pdf',
    fileName,
  },
];
```

レガシーな `imageBase64`/`imageMimeType` フィールドは後方互換性のために引き続き機能しますが、新しいコードでは `attachments` が推奨されます。

## 拡張機能マニフェスト

`qwen-extension.json` でチャネルタイプを宣言します。キーはプラグインオブジェクトの `channelType` と一致する必要があります。

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

## オプションの拡張ポイント

**カスタムスラッシュコマンド** — コンストラクタで登録します。

```typescript
this.registerCommand('mycommand', async (envelope, args) => {
  await this.sendMessage(envelope.chatId, 'Response');
  return true; // 処理済み、エージェントに転送しない
});
```

**処理中インジケーター** — `onPromptStart()` と `onPromptEnd()` をオーバーライドして、プラットフォーム固有の入力中インジケーターを表示します。これらのフックは、プロンプトが実際に処理を開始したときにのみ発火します。バッファリングされたメッセージ（コレクトモード）やゲート/ブロックされたメッセージでは発火しません。

```typescript
protected override onPromptStart(chatId: string, sessionId: string, messageId?: string): void {
  this.platformClient.sendTyping(chatId); // プラットフォームの API
}

protected override onPromptEnd(chatId: string, sessionId: string, messageId?: string): void {
  this.platformClient.stopTyping(chatId);
}
```

**ツール呼び出しフック** — `onToolCall()` をオーバーライドして、エージェントのアクティビティ（例: 「シェルコマンドを実行中...」）を表示します。

**ストリーミングフック** — チャンクごとの段階的な表示（例: メッセージをその場で編集）のために `onResponseChunk(chatId, chunk, sessionId)` をオーバーライドします。最終的な配信をカスタマイズするには `onResponseComplete(chatId, fullText, sessionId)` をオーバーライドします。

**ブロックストリーミング** — チャネル設定で `blockStreaming: "on"` を設定します。ベースクラスは、段落の境界でレスポンスを複数のメッセージに自動的に分割します。プラグインコードは不要で、`onResponseChunk` と併用して機能します。

**メディア** — `envelope.attachments` に画像/ファイルを入力します。上記の[添付ファイル](#attachments)を参照してください。

## 参考実装

- **プラグインの例** (`packages/channels/plugin-example/`) — 最小限の WebSocket ベースのアダプター。良い出発点となります
- **Telegram** (`packages/channels/telegram/`) — 多機能: 画像、ファイル、フォーマット、入力中インジケーター
- **DingTalk** (`packages/channels/dingtalk/`) — リッチテキスト処理を備えたストリームベース