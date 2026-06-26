# Entwicklerleitfaden für Channel-Plugins

Ein Channel-Plugin verbindet Qwen Code mit einer Messaging-Plattform. Es wird als Extension verpackt und beim Start geladen. Informationen aus Benutzersicht zur Installation und Konfiguration von Plugins finden Sie unter [Plugins](../users/features/channels/plugins).

## Wie es zusammenarbeitet

Ihr Plugin befindet sich in der Plattform-Adapter-Ebene. Sie kümmern sich um plattformspezifische Aspekte (Verbindung, Nachrichten empfangen, Antworten senden). `ChannelBase` übernimmt alles andere (Zugriffskontrolle, Session-Routing, Prompt-Warteschlange, Slash-Befehle, Absturzwiederherstellung).

```
Your Plugin  →  builds Envelope  →  handleInbound()
ChannelBase  →  gates → commands → routing → AcpBridge.prompt()
ChannelBase  →  calls your sendMessage() with the agent's response
```

## Das Plugin-Objekt

Der Einstiegspunkt Ihrer Extension exportiert ein `plugin`, das dem Interface `ChannelPlugin` entspricht:

```typescript
import type { ChannelPlugin } from '@qwen-code/channel-base';
import { MyChannel } from './MyChannel.js';

export const plugin: ChannelPlugin = {
  channelType: 'my-platform', // Eindeutige ID, verwendet im Feld "type" von settings.json
  displayName: 'My Platform', // Wird in der CLI-Ausgabe angezeigt
  requiredConfigFields: ['apiKey'], // Wird beim Start validiert (zusätzlich zur Standard-ChannelConfig)
  createChannel: (name, config, bridge, options) =>
    new MyChannel(name, config, bridge, options),
};
```

## Der Channel-Adapter

Erweitern Sie `ChannelBase` und implementieren Sie drei Methoden:

```typescript
import { ChannelBase } from '@qwen-code/channel-base';
import type { Envelope } from '@qwen-code/channel-base';

export class MyChannel extends ChannelBase {
  async connect(): Promise<void> {
    // Verbindung zu Ihrer Plattform herstellen, Nachrichten-Handler registrieren
    // Wenn eine Nachricht eintrifft:
    const envelope: Envelope = {
      channelName: this.name,
      senderId: '...', // Stabile, eindeutige Plattform-Benutzer-ID
      senderName: '...', // Anzeigename
      chatId: '...', // Chat-/Konversations-ID (unterschiedlich für DMs und Gruppen)
      text: '...', // Nachrichtentext (ohne @-Erwähnungen)
      isGroup: false, // Korrekt – wird von GroupGate verwendet
      isMentioned: false, // Korrekt – wird von GroupGate verwendet
      isReplyToBot: false, // Korrekt – wird von GroupGate verwendet
    };
    this.handleInbound(envelope);
  }

  async sendMessage(chatId: string, text: string): Promise<void> {
    // Markdown in Plattformformat konvertieren, ggf. aufteilen, ausliefern
  }

  disconnect(): void {
    // Verbindungen bereinigen
  }
}
```

## Der Envelope

Das normalisierte Nachrichtenobjekt, das Sie aus Plattformdaten erstellen. Die booleschen Flags steuern die Gate-Logik, daher müssen sie korrekt sein.

| Feld            | Typ           | Erforderlich | Anmerkungen                                                              |
| --------------- | ------------- | ------------ | ------------------------------------------------------------------------ |
| `channelName`   | string        | Ja           | Verwenden Sie `this.name`                                                |
| `senderId`      | string        | Ja           | Muss über Nachrichten hinweg stabil sein (für Session-Routing + Zugriffskontrolle) |
| `senderName`    | string        | Ja           | Anzeigename                                                              |
| `chatId`        | string        | Ja           | Muss DMs von Gruppen unterscheiden                                       |
| `text`          | string        | Ja           | Bot-@-Erwähnungen entfernen                                              |
| `threadId`      | string        | Nein         | Für `sessionScope: "thread"`                                             |
| `messageId`     | string        | Nein         | Plattform-Nachrichten-ID – nützlich für Antwortkorrelation               |
| `isGroup`       | boolean       | Ja           | GroupGate verlässt sich darauf                                           |
| `isMentioned`   | boolean       | Ja           | GroupGate verlässt sich darauf                                           |
| `isReplyToBot`  | boolean       | Ja           | GroupGate verlässt sich darauf                                           |
| `referencedText`| string        | Nein         | Zitierte Nachricht – wird als Kontext vorangestellt                      |
| `imageBase64`   | string        | Nein         | Base64-kodiertes Bild (Legacy – bevorzugen Sie `attachments`)            |
| `imageMimeType` | string        | Nein         | z. B. `image/jpeg` (Legacy – bevorzugen Sie `attachments`)               |
| `attachments`   | Attachment[]  | Nein         | Strukturierte Medienanhänge (siehe unten)                                 |

### Anhänge

Verwenden Sie das `attachments`-Array für Bilder, Dateien, Audio und Video. `handleInbound()` löst sie automatisch auf: Bilder mit base64-`data` werden als Vision-Eingabe an das Modell gesendet, Dateien mit einem `filePath` erhalten ihren Pfad im Prompt, damit der Agent sie lesen kann.

```typescript
interface Attachment {
  type: 'image' | 'file' | 'audio' | 'video';
  data?: string; // Base64-kodierte Daten (Bilder, kleine Dateien)
  filePath?: string; // Absoluter Pfad zur lokalen Datei (große Dateien auf Festplatte gespeichert)
  mimeType: string; // z. B. 'application/pdf', 'image/jpeg'
  fileName?: string; // Originaler Dateiname von der Plattform
}
```

Beispiel – Verarbeitung eines Datei-Uploads in Ihrem Adapter:

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

Die Legacy-Felder `imageBase64`/`imageMimeType` funktionieren aus Gründen der Abwärtskompatibilität weiterhin, aber für neuen Code wird `attachments` bevorzugt.

## Extension-Manifest

Ihr `qwen-extension.json` deklariert den Channel-Typ. Der Schlüssel muss mit `channelType` in Ihrem Plugin-Objekt übereinstimmen:

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

**Benutzerdefinierte Slash-Befehle** – registrieren Sie in Ihrem Konstruktor:

```typescript
this.registerCommand('mycommand', async (envelope, args) => {
  await this.sendMessage(envelope.chatId, 'Response');
  return true; // behandelt, nicht an den Agenten weiterleiten
});
```

**Aktivitätsanzeigen** – Überschreiben Sie `onPromptStart()` und `onPromptEnd()`, um plattformspezifische Tipp-Indikatoren anzuzeigen. Diese Hooks werden nur ausgelöst, wenn ein Prompt tatsächlich mit der Verarbeitung beginnt – nicht bei gepufferten Nachrichten (Sammelmodus) oder abgewiesenen/blockierten Nachrichten:

```typescript
protected override onPromptStart(chatId: string, sessionId: string, messageId?: string): void {
  this.platformClient.sendTyping(chatId); // Ihre Plattform-API
}

protected override onPromptEnd(chatId: string, sessionId: string, messageId?: string): void {
  this.platformClient.stopTyping(chatId);
}
```

**Tool-Aufruf-Hooks** – Überschreiben Sie `onToolCall()`, um die Aktivität des Agenten anzuzeigen (z. B. „Shell-Befehl wird ausgeführt…“).

**Streaming-Hooks** – Überschreiben Sie `onResponseChunk(chatId, chunk, sessionId)` für eine stückweise progressive Anzeige (z. B. Bearbeiten einer Nachricht an Ort und Stelle). Überschreiben Sie `onResponseComplete(chatId, fullText, sessionId)`, um die endgültige Zustellung anzupassen.

**Block-Streaming** – Setzen Sie `blockStreaming: "on"` in der Channel-Konfiguration. Die Basisklasse teilt Antworten automatisch an Absatzgrenzen in mehrere Nachrichten auf. Kein Plugin-Code erforderlich – es funktioniert zusammen mit `onResponseChunk`.

**Medien** – Befüllen Sie `envelope.attachments` mit Bildern/Dateien. Siehe [Anhänge](#anhänge) oben.

## Referenzimplementierungen

- **Plugin-Beispiel** (`packages/channels/plugin-example/`) – Minimaler WebSocket-basierter Adapter, guter Ausgangspunkt
- **Telegram** (`packages/channels/telegram/`) – Voll ausgestattet: Bilder, Dateien, Formatierung, Tipp-Indikatoren
- **DingTalk** (`packages/channels/dingtalk/`) – Stream-basiert mit Rich-Text-Verarbeitung