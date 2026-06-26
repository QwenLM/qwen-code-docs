# DingTalk (Dingtalk)

Diese Anleitung beschreibt die Einrichtung eines Qwen Code Kanals auf DingTalk (钉钉).

## Voraussetzungen

- Ein DingTalk-Organisationskonto
- Eine DingTalk-Bot-Anwendung mit AppKey und AppSecret (siehe unten)

## Bot erstellen

1. Rufe das [DingTalk Developer Portal](https://open-dev.dingtalk.com) auf
2. Erstelle eine neue Anwendung (oder verwende eine vorhandene)
3. Aktiviere unter der Anwendung die **Robot**-Fähigkeit
4. Aktiviere in den Robot-Einstellungen den **Stream Mode** (机器人协议 → Stream 模式)
5. Notiere den **AppKey** (Client ID) und das **AppSecret** (Client Secret) von der Seite mit den Anwendungsanmeldedaten

### Stream Mode

Der DingTalk Stream Mode verwendet eine ausgehende WebSocket-Verbindung – es wird keine öffentliche URL oder kein Server benötigt. Der Bot verbindet sich mit DingTalks Servern, die Nachrichten über das WebSocket pushen. Dies ist das einfachste Bereitstellungsmodell.

## Konfiguration

Füge den Kanal zu `~/.qwen/settings.json` hinzu:

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

Setze die Anmeldedaten als Umgebungsvariablen:

```bash
export DINGTALK_CLIENT_ID=<your-app-key>
export DINGTALK_CLIENT_SECRET=<your-app-secret>
```

Oder definiere sie im `env`-Abschnitt der `settings.json`:

```json
{
  "env": {
    "DINGTALK_CLIENT_ID": "your-app-key",
    "DINGTALK_CLIENT_SECRET": "your-app-secret"
  }
}
```

## Ausführen

```bash
# Nur den DingTalk-Kanal starten
qwen channel start my-dingtalk

# Oder alle konfigurierten Kanäle zusammen starten
qwen channel start
```

Öffne DingTalk und sende eine Nachricht an den Bot. Du solltest eine 👀 Emoji-Reaktion sehen, während der Agent verarbeitet, gefolgt von der Antwort.

## Gruppenchats

DingTalk-Bots funktionieren sowohl in Direktnachrichten als auch in Gruppenunterhaltungen. Um die Gruppenunterstützung zu aktivieren:

1. Setze `groupPolicy` in deiner Kanalkonfiguration auf `"allowlist"` oder `"open"`
2. Füge den Bot zu einer DingTalk-Gruppe hinzu
3. Erwähne den Bot in der Gruppe mit @, um eine Antwort auszulösen

Standardmäßig erfordert der Bot eine @-Erwähnung in Gruppenchats (`requireMention: true`). Setze `"requireMention": false` für eine bestimmte Gruppe, damit der Bot auf alle Nachrichten antwortet. Vollständige Details findest du unter [Gruppenchats](./overview#group-chats).

### Conversation-ID einer Gruppe finden

DingTalk verwendet `conversationId`, um Gruppen zu identifizieren. Du findest sie in den Kanal-Service-Logs, wenn jemand eine Nachricht in der Gruppe sendet – suche im Log-Output nach dem Feld `conversationId`.

## Bilder und Dateien

Du kannst Fotos und Dokumente an den Bot senden, nicht nur Text.

**Fotos:** Sende ein Bild (Screenshot, Diagramm usw.) und der Agent wird es mit seinen visuellen Fähigkeiten analysieren. Dies erfordert ein multimodales Modell – füge `"model": "qwen3.5-plus"` (oder ein anderes vision-fähiges Modell) zu deiner Kanalkonfiguration hinzu. DingTalk unterstützt das Senden von Bildern direkt oder als Teil von Rich-Text-Nachrichten (gemischt Text + Bilder).

**Dateien:** Sende eine PDF-, Code-Datei oder ein beliebiges Dokument. Der Bot lädt sie von DingTalks Servern herunter und speichert sie lokal, damit der Agent sie mit seinen Dateiwerkzeugen lesen kann. Audio- und Videodateien werden ebenfalls unterstützt. Dies funktioniert mit jedem Modell.

## Hauptunterschiede zu Telegram

- **Authentifizierung:** AppKey + AppSecret anstelle eines statischen Bot-Tokens. Das SDK verwaltet die Aktualisierung des Zugriffstokens automatisch.
- **Verbindung:** WebSocket-Stream anstelle von Polling – keine öffentliche IP oder Webhook-URL erforderlich.
- **Formatierung:** Antworten verwenden DingTalks Markdown-Dialekt (eine eingeschränkte Teilmenge). Tabellen werden automatisch in Klartext umgewandelt, da DingTalk sie nicht rendert. Lange Nachrichten werden bei ~3800 Zeichen aufgeteilt.
- **Verarbeitungsanzeige:** Eine 👀 Emoji-Reaktion wird zur Nachricht des Benutzers hinzugefügt, während die Verarbeitung läuft, und dann entfernt, wenn die Antwort gesendet wird.
- **Medien-Download:** Zweistufiger Prozess – ein `downloadCode` aus der Nachricht wird über DingTalks API gegen eine temporäre Download-URL eingetauscht.
- **Gruppen:** DingTalk verwendet `isInAtList` zur Erkennung von @-Erwähnungen anstatt der Analyse von Nachrichten-Entities.

## Tipps

- **Verwende DingTalk-Markdown-bewusste Anweisungen** – DingTalk unterstützt eine eingeschränkte Markdown-Teilmenge (Überschriften, Fett, Links, Codeblöcke, aber keine Tabellen). Das Hinzufügen von Anweisungen wie „Verwende DingTalk-Markdown. Vermeide Tabellen.“ hilft dem Agenten, Antworten korrekt zu formatieren.
- **Zugriff einschränken** – In einem Organisationskontext kann `senderPolicy: "open"` akzeptabel sein. Für strengere Kontrolle verwende `"allowlist"` oder `"pairing"`. Details findest du unter [DM Pairing](./overview#dm-pairing).
- **Referenzierte Nachrichten** – Das Zitieren (Antworten auf) einer Benutzernachricht fügt den zitierten Text als Kontext für den Agenten hinzu. Das Zitieren von Bot-Antworten wird noch nicht unterstützt.

## Fehlerbehebung

### Bot verbindet sich nicht

- Überprüfe, ob dein AppKey und AppSecret korrekt sind
- Stelle sicher, dass die Umgebungsvariablen gesetzt sind, bevor du `qwen channel start` ausführst
- Stelle sicher, dass **Stream Mode** in den Bot-Einstellungen im DingTalk Developer Portal aktiviert ist
- Überprüfe die Terminalausgabe auf Verbindungsfehler

### Bot antwortet nicht in Gruppen

- Überprüfe, ob `groupPolicy` auf `"allowlist"` oder `"open"` gesetzt ist (Standard ist `"disabled"`)
- Stelle sicher, dass du den Bot in der Gruppennachricht mit @ erwähnst
- Überprüfe, ob der Bot zur Gruppe hinzugefügt wurde

### „No sessionWebhook in message“

Dies bedeutet, dass DingTalk keinen Antwort-Endpunkt im Nachrichten-Callback enthalten hat. Dies kann passieren, wenn die Berechtigungen des Bots falsch konfiguriert sind. Überprüfe die Bot-Einstellungen im Developer Portal.

### „Sorry, something went wrong processing your message“

Dies bedeutet normalerweise, dass der Agent auf einen Fehler gestoßen ist. Überprüfe die Terminalausgabe auf Details.