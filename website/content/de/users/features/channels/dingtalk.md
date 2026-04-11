# DingTalk (Dingtalk)

Diese Anleitung beschreibt die Einrichtung eines Qwen Code Channels auf DingTalk (钉钉).

## Voraussetzungen

- Ein DingTalk-Organisationskonto
- Eine DingTalk-Bot-Anwendung mit AppKey und AppSecret (siehe unten)

## Erstellen eines Bots

1. Gehe zum [DingTalk Developer Portal](https://open-dev.dingtalk.com)
2. Erstelle eine neue Anwendung (oder verwende eine bestehende)
3. Aktiviere unter der Anwendung die **Robot**-Funktion
4. Aktiviere in den Robot-Einstellungen den **Stream Mode** (机器人协议 → Stream 模式)
5. Notiere dir den **AppKey** (Client ID) und das **AppSecret** (Client Secret) von der Anmeldedaten-Seite der Anwendung

### Stream Mode

Der DingTalk Stream Mode verwendet eine ausgehende WebSocket-Verbindung – es wird keine öffentliche URL oder kein Server benötigt. Der Bot verbindet sich mit den DingTalk-Servern, die Nachrichten über das WebSocket pushen. Dies ist das einfachste Bereitstellungsmodell.

## Konfiguration

Füge den Channel zu `~/.qwen/settings.json` hinzu:

```json
{
  "channels": {
    "my-dingtalk": {
      "type": "dingtalk",
      "clientId": "$DINGTALK_CLIENT_ID",
      "clientSecret": "$DINGTALK_CLIENT_SECRET",
      "senderPolicy": "open",
      "sessionScope": "user",
      "cwd": "/path/to/your/project",
      "instructions": "You are a concise coding assistant responding via DingTalk.",
      "groupPolicy": "open",
      "groups": {
        "*": { "requireMention": true }
      }
    }
  }
}
```

Lege die Anmeldedaten als Umgebungsvariablen fest:

```bash
export DINGTALK_CLIENT_ID=<your-app-key>
export DINGTALK_CLIENT_SECRET=<your-app-secret>
```

Oder definiere sie im `env`-Abschnitt von `settings.json`:

```json
{
  "env": {
    "DINGTALK_CLIENT_ID": "your-app-key",
    "DINGTALK_CLIENT_SECRET": "your-app-secret"
  }
}
```

## Starten

```bash
# Start only the DingTalk channel
qwen channel start my-dingtalk

# Or start all configured channels together
qwen channel start
```

Öffne DingTalk und sende eine Nachricht an den Bot. Während der Agent die Anfrage verarbeitet, sollte eine 👀-Emoji-Reaktion erscheinen, gefolgt von der Antwort.

## Gruppenchats

DingTalk-Bots funktionieren sowohl in Direktnachrichten (DM) als auch in Gruppenchats. So aktivierst du die Gruppenunterstützung:

1. Setze `groupPolicy` in deiner Channel-Konfiguration auf `"allowlist"` oder `"open"`
2. Füge den Bot einer DingTalk-Gruppe hinzu
3. Erwähne (@mention) den Bot in der Gruppe, um eine Antwort auszulösen

Standardmäßig erfordert der Bot in Gruppenchats eine @-Erwähnung (`requireMention: true`). Setze `"requireMention": false` für eine bestimmte Gruppe, damit er auf alle Nachrichten antwortet. Weitere Details findest du unter [Group Chats](./overview#group-chats).

### Conversation ID einer Gruppe finden

DingTalk verwendet `conversationId` zur Identifizierung von Gruppen. Du findest sie in den Logs des Channel-Services, wenn jemand eine Nachricht in der Gruppe sendet – achte auf das `conversationId`-Feld in der Log-Ausgabe.

## Bilder und Dateien

Du kannst dem Bot nicht nur Text, sondern auch Fotos und Dokumente senden.

**Fotos:** Sende ein Bild (Screenshot, Diagramm usw.) und der Agent analysiert es mithilfe seiner Vision-Funktionen. Dies erfordert ein multimodales Modell – füge `"model": "qwen3.5-plus"` (oder ein anderes vision-fähiges Modell) zu deiner Channel-Konfiguration hinzu. DingTalk unterstützt das direkte Senden von Bildern oder als Teil von Rich-Text-Nachrichten (gemischter Text + Bilder).

**Dateien:** Sende ein PDF, eine Codedatei oder ein beliebiges Dokument. Der Bot lädt es von den DingTalk-Servern herunter und speichert es lokal, damit der Agent es mit seinen Datei-Tools lesen kann. Audio- und Videodateien werden ebenfalls unterstützt. Dies funktioniert mit jedem Modell.

## Wichtige Unterschiede zu Telegram

- **Authentifizierung:** AppKey + AppSecret anstelle eines statischen Bot-Tokens. Das SDK verwaltet die Aktualisierung des Access Tokens automatisch.
- **Verbindung:** WebSocket-Stream anstelle von Polling – keine öffentliche IP oder Webhook-URL erforderlich.
- **Formatierung:** Antworten verwenden den Markdown-Dialekt von DingTalk (eine eingeschränkte Teilmenge). Tabellen werden automatisch in Klartext konvertiert, da DingTalk sie nicht rendert. Lange Nachrichten werden bei ~3800 Zeichen in Blöcke aufgeteilt.
- **Verarbeitungsindikator:** Während der Verarbeitung wird eine 👀-Emoji-Reaktion zur Nachricht des Nutzers hinzugefügt und nach dem Senden der Antwort wieder entfernt.
- **Medien-Download:** Zweistufiger Prozess – ein `downloadCode` aus der Nachricht wird über die DingTalk-API gegen eine temporäre Download-URL getauscht.
- **Gruppen:** DingTalk verwendet `isInAtList` zur Erkennung von @-Erwähnungen, anstatt Nachrichten-Entities zu parsen.

## Tipps

- **Verwende DingTalk-Markdown-bewusste Anweisungen** – DingTalk unterstützt eine eingeschränkte Markdown-Teilmenge (Überschriften, fett, Links, Codeblöcke, aber keine Tabellen). Anweisungen wie „Verwende DingTalk-Markdown. Vermeide Tabellen.“ helfen dem Agenten, Antworten korrekt zu formatieren.
- **Zugriff einschränken** – In einem Unternehmenskontext ist `senderPolicy: "open"` oft akzeptabel. Für strengere Kontrolle verwende `"allowlist"` oder `"pairing"`. Details findest du unter [DM Pairing](./overview#dm-pairing).
- **Zitierte Nachrichten** – Das Zitieren (Antworten auf) einer Nutzernachricht fügt den zitierten Text als Kontext für den Agenten hinzu. Das Zitieren von Bot-Antworten wird noch nicht unterstützt.

## Fehlerbehebung

### Bot stellt keine Verbindung her

- Überprüfe, ob AppKey und AppSecret korrekt sind
- Stelle sicher, dass die Umgebungsvariablen vor dem Ausführen von `qwen channel start` gesetzt sind
- Stelle sicher, dass **Stream Mode** in den Bot-Einstellungen im DingTalk Developer Portal aktiviert ist
- Prüfe die Terminalausgabe auf Verbindungsfehler

### Bot antwortet nicht in Gruppen

- Überprüfe, ob `groupPolicy` auf `"allowlist"` oder `"open"` gesetzt ist (Standard ist `"disabled"`)
- Stelle sicher, dass du den Bot in der Gruppennachricht @-erwähnst
- Überprüfe, ob der Bot zur Gruppe hinzugefügt wurde

### "No sessionWebhook in message"

Das bedeutet, dass DingTalk keinen Reply-Endpoint im Message-Callback enthalten hat. Dies kann passieren, wenn die Berechtigungen des Bots falsch konfiguriert sind. Überprüfe die Bot-Einstellungen im Developer Portal.

### "Sorry, something went wrong processing your message"

Dies bedeutet in der Regel, dass der Agent auf einen Fehler gestoßen ist. Prüfe die Terminalausgabe für Details.