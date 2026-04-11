# Entwicklerhandbuch für Channel-Plugins

Ein Channel-Plugin verbindet Qwen Code mit einer Messaging-Plattform. Es wird als [Extension](../users/extension/introduction) verpackt und beim Start geladen. Für die benutzerorientierte Dokumentation zur Installation und Konfiguration von Plugins siehe [Plugins](../users/features/channels/plugins).

## Zusammenspiel der Komponenten

Dein Plugin befindet sich in der Platform-Adapter-Schicht. Du kümmerst dich um plattformspezifische Aufgaben (Verbindungsaufbau, Empfangen von Nachrichten, Senden von Antworten). `ChannelBase` übernimmt alles Weitere (Zugriffskontrolle, Session-Routing, Prompt-Warteschlange, Slash-Commands, Crash-Recovery).

```
Your Plugin  →  builds Envelope  →  handleInbound()
ChannelBase  →  gates → commands → routing → AcpBridge.prompt()
ChannelBase  →  calls your sendMessage() with the agent's response
```

## Das Plugin-Objekt

Der Einstiegspunkt deiner Extension exportiert ein `plugin`, das `ChannelPlugin` implementiert:

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

## Der Channel-Adapter

Erweitere `ChannelBase` und implementiere drei Methoden:

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

## Das Envelope-Objekt

Das normalisierte Nachrichtenobjekt, das du aus den Plattformdaten erstellst. Die Boolean-Flags steuern die Gate-Logik und müssen daher korrekt sein.

| Feld            | Typ         | Erforderlich | Hinweise                                                                      |
| ---------------- | ------------ | -------- | -------------------------------------------------------------------------- |
| `channelName`    | string       | Ja      | Verwende `this.name`                                                            |
| `senderId`       | string       | Ja      | Muss über Nachrichten hinweg stabil sein (wird für Session-Routing + Zugriffskontrolle verwendet) |
| `senderName`     | string       | Ja      | Anzeigename                                                               |
| `chatId`         | string       | Ja      | Muss zwischen DMs und Gruppen unterscheiden                                           |
| `text`           | string       | Ja      | Entferne Bot-@mentions                                                        |
| `threadId`       | string       | Nein       | Für `sessionScope: "thread"`                                               |
| `messageId`      | string       | Nein       | Plattform-Nachrichten-ID – nützlich für die Antwortkorrelation                      |
| `isGroup`        | boolean      | Ja      | GroupGate verlässt sich darauf                                                   |
| `isMentioned`    | boolean      | Ja      | GroupGate verlässt sich darauf                                                   |
| `isReplyToBot`   | boolean      | Ja      | GroupGate verlässt sich darauf                                                   |
| `referencedText` | string       | Nein       | Zitierte Nachricht – wird als Kontext vorangestellt                                      |
| `imageBase64`    | string       | Nein       | Base64-kodiertes Bild (Legacy – bevorzuge `attachments`)                       |
| `imageMimeType`  | string       | Nein       | z. B. `image/jpeg` (Legacy – bevorzuge `attachments`)                         |
| `attachments`    | Attachment[] | Nein       | Strukturierte Medienanhänge (siehe unten)                                   |

### Attachments

Verwende das `attachments`-Array für Bilder, Dateien, Audio und Video. `handleInbound()` löst sie automatisch auf: Bilder mit Base64-`data` werden als Vision-Input an das Modell gesendet, Dateien mit einem `filePath` wird ihr Pfad an den Prompt angehängt, damit der Agent sie lesen kann.

```typescript
interface Attachment {
  type: 'image' | 'file' | 'audio' | 'video';
  data?: string; // base64-encoded data (images, small files)
  filePath?: string; // absolute path to local file (large files saved to disk)
  mimeType: string; // e.g. 'application/pdf', 'image/jpeg'
  fileName?: string; // original file name from the platform
}
```

Beispiel – Verarbeitung eines Datei-Uploads in deinem Adapter:

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

Die Legacy-Felder `imageBase64`/`imageMimeType` funktionieren weiterhin aus Gründen der Abwärtskompatibilität, für neuen Code wird jedoch `attachments` bevorzugt.

## Extension-Manifest

Deine `qwen-extension.json` deklariert den Channel-Typ. Der Schlüssel muss mit `channelType` in deinem Plugin-Objekt übereinstimmen:

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

## Optionale Erweiterungspunkte

**Eigene Slash-Commands** – registriere sie in deinem Konstruktor:

```typescript
this.registerCommand('mycommand', async (envelope, args) => {
  await this.sendMessage(envelope.chatId, 'Response');
  return true; // handled, don't forward to agent
});
```

**Verarbeitungsindikatoren** – überschreibe `onPromptStart()` und `onPromptEnd()`, um plattformspezifische Tippindikatoren anzuzeigen. Diese Hooks werden nur ausgelöst, wenn ein Prompt tatsächlich verarbeitet wird – nicht für gepufferte Nachrichten (Collect-Mode) oder geblockte/gefilterte Nachrichten:

```typescript
protected override onPromptStart(chatId: string, sessionId: string, messageId?: string): void {
  this.platformClient.sendTyping(chatId); // your platform API
}

protected override onPromptEnd(chatId: string, sessionId: string, messageId?: string): void {
  this.platformClient.stopTyping(chatId);
}
```

**Tool-Call-Hooks** – überschreibe `onToolCall()`, um Agent-Aktivitäten anzuzeigen (z. B. „Shell-Befehl wird ausgeführt…“).

**Streaming-Hooks** – überschreibe `onResponseChunk(chatId, chunk, sessionId)` für eine chunkweise progressive Anzeige (z. B. direktes Bearbeiten einer Nachricht). Überschreibe `onResponseComplete(chatId, fullText, sessionId)`, um die finale Ausgabe anzupassen.

**Block-Streaming** – setze `blockStreaming: "on"` in der Channel-Konfiguration. Die Basisklasse teilt Antworten automatisch an Absatzgrenzen in mehrere Nachrichten auf. Es ist kein Plugin-Code erforderlich – es funktioniert parallel zu `onResponseChunk`.

**Medien** – befülle `envelope.attachments` mit Bildern/Dateien. Siehe [Attachments](#attachments) oben.

## Referenzimplementierungen

- **Plugin-Beispiel** (`packages/channels/plugin-example/`) – minimaler WebSocket-basierter Adapter, guter Einstiegspunkt
- **Telegram** (`packages/channels/telegram/`) – voll funktionsfähig: Bilder, Dateien, Formatierung, Tippindikatoren
- **DingTalk** (`packages/channels/dingtalk/`) – stream-basiert mit Rich-Text-Verarbeitung