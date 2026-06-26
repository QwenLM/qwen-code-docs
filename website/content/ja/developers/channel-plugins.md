# チャネルプラグイン開発者ガイド

チャネルプラグインは、Qwen Code をメッセージングプラットフォームに接続します。これは[拡張機能](../users/extension/introduction)としてパッケージ化され、起動時に読み込まれます。プラグインのインストールと設定に関するユーザー向けドキュメントは、[プラグイン](../users/features/channels/plugins) を参照してください。

## 全体の構成

あなたのプラグインは Platform Adapter 層に位置します。プラグインはプラットフォーム固有の処理（接続、メッセージ受信、応答送信）を担当します。`ChannelBase` はその他の処理（アクセス制御、セッションルーティング、プロンプトキューイング、スラッシュコマンド、クラッシュリカバリ）をすべて処理します。

```
あなたのプラグイン →  Envelope を構築 →  handleInbound()
ChannelBase  →  ゲート → コマンド → ルーティング → AcpBridge.prompt()
ChannelBase  →  エージェントの応答であなたの sendMessage() を呼び出す
```

## プラグインオブジェクト

あなたの拡張機能のエントリポイントは、`ChannelPlugin` に準拠した `plugin` をエクスポートします。

```typescript
import type { ChannelPlugin } from '@qwen-code/channel-base';
import { MyChannel } from './MyChannel.js';

export const plugin: ChannelPlugin = {
  channelType: 'my-platform', // 一意のID。settings.jsonの"type"フィールドで使用
  displayName: 'My Platform', // CLI出力に表示される名前
  requiredConfigFields: ['apiKey'], // 起動時に検証（標準のChannelConfigに加えて）
  createChannel: (name, config, bridge, options) =>
    new MyChannel(name, config, bridge, options),
};
```

## チャネルアダプター

`ChannelBase` を継承し、3つのメソッドを実装します。

```typescript
import { ChannelBase } from '@qwen-code/channel-base';
import type { Envelope } from '@qwen-code/channel-base';

export class MyChannel extends ChannelBase {
  async connect(): Promise<void> {
    // プラットフォームに接続し、メッセージハンドラを登録
    // メッセージが受信されたら：
    const envelope: Envelope = {
      channelName: this.name,
      senderId: '...', // 安定した一意のプラットフォームユーザーID
      senderName: '...', // 表示名
      chatId: '...', // チャット/会話ID（DMとグループで異なる）
      text: '...', // メッセージテキスト（@メンションは除去）
      isGroup: false, // 正確であること — GroupGate で使用
      isMentioned: false, // 正確であること — GroupGate で使用
      isReplyToBot: false, // 正確であること — GroupGate で使用
    };
    this.handleInbound(envelope);
  }

  async sendMessage(chatId: string, text: string): Promise<void> {
    // マークダウン → プラットフォーム形式に変換、必要に応じて分割、配信
  }

  disconnect(): void {
    // 接続をクリーンアップ
  }
}
```

## エンベロープ

プラットフォームデータから構築する、正規化されたメッセージオブジェクトです。ブール値フラグはゲートロジックを駆動するため、正確でなければなりません。

| フィールド         | 型           | 必須    | 備考                                                         |
| ----------------- | ------------ | ------- | ------------------------------------------------------------ |
| `channelName`     | string       | はい    | `this.name` を使用                                           |
| `senderId`        | string       | はい    | メッセージ間で安定している必要あり（セッションルーティング + アクセス制御に使用） |
| `senderName`      | string       | はい    | 表示名                                                       |
| `chatId`          | string       | はい    | DMとグループを区別する必要あり                                |
| `text`            | string       | はい    | ボットへの@メンションは除去                                   |
| `threadId`        | string       | いいえ | `sessionScope: "thread"` 用                                   |
| `messageId`       | string       | いいえ | プラットフォームのメッセージID — 応答の関連付けに有用          |
| `isGroup`         | boolean      | はい    | GroupGate がこれに依存                                       |
| `isMentioned`     | boolean      | はい    | GroupGate がこれに依存                                       |
| `isReplyToBot`    | boolean      | はい    | GroupGate がこれに依存                                       |
| `referencedText`  | string       | いいえ | 引用メッセージ — コンテキストとして先頭に付加                   |
| `imageBase64`     | string       | いいえ | Base64エンコードされた画像（レガシー — 代わりに `attachments` を推奨） |
| `imageMimeType`   | string       | いいえ | 例: `image/jpeg`（レガシー — 代わりに `attachments` を推奨）   |
| `attachments`     | Attachment[] | いいえ | 構造化されたメディア添付ファイル（下記参照）                   |

### 添付ファイル

画像、ファイル、音声、動画には `attachments` 配列を使用します。`handleInbound()` が自動的に解決します。base64 `data` を持つ画像はビジョン入力としてモデルに送信され、`filePath` を持つファイルは、エージェントが読み取れるようにプロンプトにパスが追加されます。

```typescript
interface Attachment {
  type: 'image' | 'file' | 'audio' | 'video';
  data?: string; // base64エンコードされたデータ（画像、小さいファイル）
  filePath?: string; // ローカルファイルの絶対パス（大きなファイルはディスクに保存）
  mimeType: string; // 例: 'application/pdf', 'image/jpeg'
  fileName?: string; // プラットフォーム上の元のファイル名
}
```

例 — アダプター内でファイルアップロードを処理する場合：

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

従来の `imageBase64` / `imageMimeType` フィールドは後方互換性のために引き続き使用できますが、新しいコードでは `attachments` を推奨します。

## 拡張機能マニフェスト

`qwen-extension.json` でチャネルタイプを宣言します。キーはプラグインオブジェクトの `channelType` と一致している必要があります。

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

**入力中インジケータ** — `onPromptStart()` と `onPromptEnd()` をオーバーライドして、プラットフォーム固有の入力中インジケータを表示します。これらのフックは、プロンプトが実際に処理を開始したときにのみ起動します。バッファリングされたメッセージ（収集モード）やゲート/ブロックされたメッセージでは起動しません。

```typescript
protected override onPromptStart(chatId: string, sessionId: string, messageId?: string): void {
  this.platformClient.sendTyping(chatId); // あなたのプラットフォームAPI
}

protected override onPromptEnd(chatId: string, sessionId: string, messageId?: string): void {
  this.platformClient.stopTyping(chatId);
}
```

**ツール呼び出しフック** — `onToolCall()` をオーバーライドして、エージェントのアクティビティ（例：「シェルコマンドを実行中...」）を表示します。

**ストリーミングフック** — `onResponseChunk(chatId, chunk, sessionId)` をオーバーライドして、チャンク単位のプログレッシブ表示（例：メッセージをその場で編集）を行います。`onResponseComplete(chatId, fullText, sessionId)` をオーバーライドして、最終配信をカスタマイズします。

**ブロックストリーミング** — チャネル設定で `blockStreaming: "on"` を設定します。基底クラスが自動的に応答を段落境界で複数のメッセージに分割します。プラグインコードは不要です。`onResponseChunk` と一緒に動作します。

**メディア** — `envelope.attachments` に画像やファイルを設定します。上記の [添付ファイル](#attachments) を参照してください。

## リファレンス実装

- **プラグイン例**（`packages/channels/plugin-example/`）— 最小限のWebSocketベースアダプター。出発点として最適です。
- **Telegram**（`packages/channels/telegram/`）— フル機能：画像、ファイル、書式設定、入力中インジケータ。
- **DingTalk**（`packages/channels/dingtalk/`）— ストリームベースでリッチテキストを処理。