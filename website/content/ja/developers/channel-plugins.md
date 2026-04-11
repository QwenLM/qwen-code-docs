# チャネルプラグイン開発者ガイド

チャネルプラグインは、Qwen Code をメッセージングプラットフォームに接続します。[拡張機能](../users/extension/introduction) としてパッケージ化され、起動時に読み込まれます。プラグインのインストールと設定に関するユーザー向けドキュメントは、[プラグイン](../users/features/channels/plugins) を参照してください。

## 連携の仕組み

プラグインは Platform Adapter 層に配置されます。プラットフォーム固有の処理（接続、メッセージの受信、レスポンスの送信）はプラグイン側で実装します。それ以外の処理（アクセス制御、セッションルーティング、プロンプトのキューイング、スラッシュコマンド、クラッシュリカバリ）は `ChannelBase` が担当します。

```
Your Plugin  →  builds Envelope  →  handleInbound()
ChannelBase  →  gates → commands → routing → AcpBridge.prompt()
ChannelBase  →  calls your sendMessage() with the agent's response
```

## プラグインオブジェクト

拡張機能のエントリポイントでは、`ChannelPlugin` に準拠した `plugin` をエクスポートします：

```typescript
import type { ChannelPlugin } from '@qwen-code/channel-base';
import { MyChannel } from './MyChannel.js';

export const plugin: ChannelPlugin = {
  channelType: 'my-platform', // Unique ID, used in settings.json "type" field
  displayName: 'My Platform', // Shown in CLI output
  requiredConfigFields: ['apiKey'], // Validated at startup (beyond standard ChannelConfig)
  createChannel: (name, config, bridge, options) =>
    new MyChannel(name, config, bridge, options),
};
```

## チャネルアダプター

`ChannelBase` を継承し、以下の 3 つのメソッドを実装します：

```typescript
import { ChannelBase } from '@qwen-code/channel-base';
import type { Envelope } from '@qwen-code/channel-base';

export class MyChannel extends ChannelBase {
  async connect(): Promise<void> {
    // Connect to your platform, register message handlers
    // When a message arrives:
    const envelope: Envelope = {
      channelName: this.name,
      senderId: '...', // Stable, unique platform user ID
      senderName: '...', // Display name
      chatId: '...', // Chat/conversation ID (distinct for DMs vs groups)
      text: '...', // Message text (strip @mentions)
      isGroup: false, // Accurate — used by GroupGate
      isMentioned: false, // Accurate — used by GroupGate
      isReplyToBot: false, // Accurate — used by GroupGate
    };
    this.handleInbound(envelope);
  }

  async sendMessage(chatId: string, text: string): Promise<void> {
    // Format markdown → platform format, chunk if needed, deliver
  }

  disconnect(): void {
    // Clean up connections
  }
}
```

## Envelope オブジェクト

プラットフォームのデータから構築する、正規化されたメッセージオブジェクトです。ブール値のフラグはゲートロジックの制御に使用されるため、正確に設定する必要があります。

| Field            | Type         | Required | Notes                                                                      |
| ---------------- | ------------ | -------- | -------------------------------------------------------------------------- |
| `channelName`    | string       | Yes      | `this.name` を使用                                                         |
| `senderId`       | string       | Yes      | メッセージ間で安定している必要があります（セッションルーティングおよびアクセス制御に使用） |
| `senderName`     | string       | Yes      | 表示名                                                                     |
| `chatId`         | string       | Yes      | DM とグループを区別する必要があります                                      |
| `text`           | string       | Yes      | ボットへの @メンションは削除してください                                   |
| `threadId`       | string       | No       | `sessionScope: "thread"` 用                                                |
| `messageId`      | string       | No       | プラットフォームのメッセージ ID（レスポンスの相関付けに有用）              |
| `isGroup`        | boolean      | Yes      | GroupGate がこの値に依存します                                             |
| `isMentioned`    | boolean      | Yes      | GroupGate がこの値に依存します                                             |
| `isReplyToBot`   | boolean      | Yes      | GroupGate がこの値に依存します                                             |
| `referencedText` | string       | No       | 引用メッセージ（コンテキストとして先頭に追加されます）                     |
| `imageBase64`    | string       | No       | Base64 エンコードされた画像（レガシー。`attachments` の使用を推奨）        |
| `imageMimeType`  | string       | No       | 例：`image/jpeg`（レガシー。`attachments` の使用を推奨）                   |
| `attachments`    | Attachment[] | No       | 構造化されたメディア添付ファイル（下記参照）                               |

### 添付ファイル (Attachments)

画像、ファイル、音声、動画には `attachments` 配列を使用します。`handleInbound()` はこれらを自動的に解決します。base64 `data` を持つ画像はビジョン入力としてモデルに送信され、`filePath` を持つファイルはプロンプトにパスが追加され、エージェントが読み取れるようになります。

```typescript
interface Attachment {
  type: 'image' | 'file' | 'audio' | 'video';
  data?: string; // base64-encoded data (images, small files)
  filePath?: string; // absolute path to local file (large files saved to disk)
  mimeType: string; // e.g. 'application/pdf', 'image/jpeg'
  fileName?: string; // original file name from the platform
}
```

例：アダプターでのファイルアップロードの処理

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

レガシーな `imageBase64` / `imageMimeType` フィールドは後方互換性のために引き続き機能しますが、新規コードでは `attachments` の使用を推奨します。

## 拡張機能マニフェスト

`qwen-extension.json` でチャネルタイプを宣言します。キーはプラグインオブジェクトの `channelType` と一致している必要があります：

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

**カスタムスラッシュコマンド** — コンストラクタ内で登録します：

```typescript
this.registerCommand('mycommand', async (envelope, args) => {
  await this.sendMessage(envelope.chatId, 'Response');
  return true; // handled, don't forward to agent
});
```

**処理中表示 (Working indicators)** — プラットフォーム固有のタイピングインジケーターを表示するには、`onPromptStart()` と `onPromptEnd()` をオーバーライドします。これらのフックは、プロンプトの処理が実際に開始された場合にのみ発火します（バッファリングされたメッセージ（collect モード）や、ゲート/ブロックされたメッセージでは発火しません）：

```typescript
protected override onPromptStart(chatId: string, sessionId: string, messageId?: string): void {
  this.platformClient.sendTyping(chatId); // your platform API
}

protected override onPromptEnd(chatId: string, sessionId: string, messageId?: string): void {
  this.platformClient.stopTyping(chatId);
}
```

**ツール呼び出しフック** — エージェントのアクティビティ（例：「シェルコマンドを実行中...」）を表示するには、`onToolCall()` をオーバーライドします。

**ストリーミングフック** — チャンクごとのプログレッシブ表示（例：メッセージのインプレース編集）を行うには、`onResponseChunk(chatId, chunk, sessionId)` をオーバーライドします。最終的な配信をカスタマイズするには、`onResponseComplete(chatId, fullText, sessionId)` をオーバーライドします。

**ブロックストリーミング** — チャネル設定で `blockStreaming: "on"` を設定します。ベースクラスは、段落の境界でレスポンスを自動的に複数のメッセージに分割します。プラグイン側のコードは不要で、`onResponseChunk` と併用して動作します。

**メディア** — `envelope.attachments` に画像やファイルを設定します。上記の [添付ファイル (Attachments)](#attachments) を参照してください。

## 参考実装

- **プラグインの例** (`packages/channels/plugin-example/`) — 最小限の WebSocket ベースアダプター。開発の起点として最適
- **Telegram** (`packages/channels/telegram/`) — フル機能版：画像、ファイル、フォーマット、タイピングインジケーターに対応
- **DingTalk** (`packages/channels/dingtalk/`) — ストリームベースでリッチテキスト処理に対応