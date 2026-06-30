# Leitfaden für Channel-Plugin-Entwickler

Ein Channel-Plugin verbindet Qwen Code mit einer Messaging-Plattform. Es wird als [Extension](../users/extension/introduction) gepackt und beim Start geladen. Benutzerdokumentation zur Installation und Konfiguration von Plugins findest du unter [Plugins](../users/features/channels/plugins).

## Wie alles zusammenhängt

Dein Plugin befindet sich in der Platform-Adapter-Schicht. Du kümmerst dich um plattformspezifische Belange (Verbindung herstellen, Nachrichten empfangen, Antworten senden). `ChannelBase` übernimmt alles andere (Zugriffskontrolle, Session-Routing, Prompt-Queuing, Slash-Befehle, Crash-Recovery).

```
Your Plugin  →  builds Envelope  →  handleInbound()
ChannelBase  →  gates → commands → routing → ChannelAgentBridge.prompt()
ChannelBase  →  calls your sendMessage() with the agent's response
```

`ChannelAgentBridge` ist der Adapter-seitige Bridge-Vertrag. Der aktuelle eigenständige `qwen channel start`-Pfad stellt einen `AcpBridge` bereit, aber Plugin-Code sollte Konstruktorparameter als `ChannelAgentBridge` typisieren, damit derselbe Adapter später auch hinter anderen Bridge-Implementierungen laufen kann.

Migrationshinweis für bestehende TypeScript-Plugins: Wenn dein Adapter-Konstruktor oder deine Factory `bridge` explizit als `AcpBridge` typisiert, ändere diese Annotation in `ChannelAgentBridge` und verwende weiterhin nur die Methoden, die von diesem Vertrag offengelegt werden. JavaScript-Plugins sind zur Laufzeit nicht betroffen, und der eigenständige `qwen channel start` übergibt weiterhin die aktuelle `AcpBridge`-Implementierung.

## Das Plugin-Objekt

Der Einstiegspunkt deiner Extension exportiert ein `plugin`, das `ChannelPlugin` entspricht:

```typescript
import type { ChannelPlugin } from '@qwen-code/channel-base';
import { MyChannel } from './MyChannel.js';

export const plugin: ChannelPlugin = {
  channelType: 'my-platform', // Eindeutige ID, wird im "type"-Feld in settings.json verwendet
  displayName: 'My Platform', // Wird in der CLI-Ausgabe angezeigt
  requiredConfigFields: ['apiKey'], // Wird beim Start validiert (über die Standard-ChannelConfig hinaus)
  createChannel: (name, config, bridge, options) =>
    new MyChannel(name, config, bridge, options),
};
```

## Der Channel-Adapter

Erweitere `ChannelBase` und implementiere drei Methoden:

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
    // Verbinde dich mit deiner Plattform, registriere Message-Handler
    // Wenn eine Nachricht eintrifft:
    const envelope: Envelope = {
      channelName: this.name,
      senderId: '...', // Stabile, eindeutige Plattform-Benutzer-ID
      senderName: '...', // Anzeigename
      chatId: '...', // Chat-/Konversations-ID (unterscheidet zwischen DMs und Gruppen)
      text: '...', // Nachrichtentext (@mentions entfernen)
      isGroup: false, // Muss korrekt sein — wird von GroupGate verwendet
      isMentioned: false, // Muss korrekt sein — wird von GroupGate verwendet
      isReplyToBot: false, // Muss korrekt sein — wird von GroupGate verwendet
    };
    this.handleInbound(envelope);
  }

  async sendMessage(chatId: string, text: string): Promise<void> {
    // Markdown in Plattformformat umwandeln, bei Bedarf in Chunks aufteilen, zustellen
  }

  disconnect(): void {
    // Verbindungen aufräumen
  }
}
```

Die meisten Adapter sollten `options` unverändert weiterreichen. Wenn ein Adapter seinen eigenen `SessionRouter` erstellt und diesen Router an `super()` übergibt, setze `registerBridgeEvents: true` in `ChannelBaseOptions`, damit `ChannelBase` die Ereignisse `toolCall` und `sessionDied` weiterhin direkt empfängt. Lasse es für Router, die vom Channel-Gateway bereitgestellt werden, nicht gesetzt.

## Das Envelope

Das normalisierte Nachrichtenobjekt, das du aus den Plattformdaten erstellst. Die booleschen Flags steuern die Gate-Logik, sie müssen also korrekt sein.

| Feld             | Typ          | Erforderlich | Hinweise                                                                   |
| ---------------- | ------------ | ------------ | -------------------------------------------------------------------------- |
| `channelName`    | string       | Ja           | `this.name` verwenden                                                      |
| `senderId`       | string       | Ja           | Muss über Nachrichten hinweg stabil sein (wird für Session-Routing + Zugriffskontrolle verwendet) |
| `senderName`     | string       | Ja           | Anzeigename                                                                |
| `chatId`         | string       | Ja           | Muss zwischen DMs und Gruppen unterscheiden                                |
| `text`           | string       | Ja           | Bot-@mentions entfernen                                                    |
| `threadId`       | string       | Nein         | Für `sessionScope: "thread"`                                               |
| `messageId`      | string       | Nein         | Plattform-Nachrichten-ID – nützlich für die Antwortkorrelation             |
| `isGroup`        | boolean      | Ja           | GroupGate verlässt sich darauf                                             |
| `isMentioned`    | boolean      | Ja           | GroupGate verlässt sich darauf                                             |
| `isReplyToBot`   | boolean      | Ja           | GroupGate verlässt sich darauf                                             |
| `referencedText` | string       | Nein         | Zitierte Nachricht – wird als Kontext vorangestellt                        |
| `imageBase64`    | string       | Nein         | Base64-kodiertes Bild (Legacy – bevorzuge `attachments`)                   |
| `imageMimeType`  | string       | Nein         | z. B. `image/jpeg` (Legacy – bevorzuge `attachments`)                      |
| `attachments`    | Attachment[] | Nein         | Strukturierte Medien-Attachments (siehe unten)                             |

### Attachments

Verwende das `attachments`-Array für Bilder, Dateien, Audio und Video. `handleInbound()` löst diese automatisch auf: Bilder mit Base64-`data` werden als Vision-Input an das Modell gesendet, Dateien mit einem `filePath` bekommen ihren Pfad an den Prompt angehängt, damit der Agent sie lesen kann.

```typescript
interface Attachment {
  type: 'image' | 'file' | 'audio' | 'video';
  data?: string; // Base64-kodierte Daten (Bilder, kleine Dateien)
  filePath?: string; // Absoluter Pfad zur lokalen Datei (große Dateien auf Festplatte gespeichert)
  mimeType: string; // z. B. 'application/pdf', 'image/jpeg'
  fileName?: string; // Originaler Dateiname von der Plattform
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

Die Legacy-Felder `imageBase64`/`imageMimeType` funktionieren aus Gründen der Abwärtskompatibilität weiterhin, aber `attachments` wird für neuen Code bevorzugt.

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

## Optionale Extension-Points

**Benutzerdefinierte Slash-Befehle** – in deinem Konstruktor registrieren:

```typescript
this.registerCommand('mycommand', async (envelope, args) => {
  await this.sendMessage(envelope.chatId, 'Response');
  return true; // verarbeitet, nicht an den Agent weiterleiten
});
```

**Verarbeitungsindikatoren** – überschreibe `onPromptStart()` und `onPromptEnd()`, um plattformspezifische Tipp-Indikatoren anzuzeigen. Diese Hooks feuern nur, wenn ein Prompt tatsächlich mit der Verarbeitung beginnt – nicht für gepufferte Nachrichten (Collect-Modus) oder geblockte Nachrichten:

```typescript
protected override onPromptStart(chatId: string, sessionId: string, messageId?: string): void {
  this.platformClient.sendTyping(chatId); // deine Plattform-API
}

protected override onPromptEnd(chatId: string, sessionId: string, messageId?: string): void {
  this.platformClient.stopTyping(chatId);
}
```

**Tool-Call-Hooks** – überschreibe `onToolCall()`, um Agent-Aktivitäten anzuzeigen (z. B. "Shell-Befehl wird ausgeführt...").

**Streaming-Hooks** – überschreibe `onResponseChunk(chatId, chunk, sessionId)` für die progressive Anzeige pro Chunk (z. B. direktes Bearbeiten einer Nachricht). Überschreibe `onResponseComplete(chatId, fullText, sessionId)`, um die finale Zustellung anzupassen.

**Block-Streaming** – setze `blockStreaming: "on"` in der Channel-Konfiguration. Die Basisklasse teilt Antworten automatisch an Absatzgrenzen in mehrere Nachrichten auf. Kein Plugin-Code erforderlich – es funktioniert parallel zu `onResponseChunk`.

**Medien** – fülle `envelope.attachments` mit Bildern/Dateien. Siehe [Attachments](#attachments) oben.

## Referenzimplementierungen

- **Plugin-Beispiel** (`packages/channels/plugin-example/`) – minimaler WebSocket-basierter Adapter, guter Startpunkt
- **Telegram** (`packages/channels/telegram/`) – voll ausgestattet: Bilder, Dateien, Formatierung, Tipp-Indikatoren
- **DingTalk** (`packages/channels/dingtalk/`) – streambasiert mit Rich-Text-Verarbeitung