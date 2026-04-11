# Telegram

Diese Anleitung beschreibt die Einrichtung eines Qwen Code Channels auf Telegram.

## Voraussetzungen

- Ein Telegram-Konto
- Ein Telegram-Bot-Token (siehe unten)

## Erstellen eines Bots

1. Öffne Telegram und suche nach [@BotFather](https://t.me/BotFather)
2. Sende `/newbot` und folge den Anweisungen, um einen Namen und Benutzernamen auszuwählen
3. BotFather gibt dir ein Bot-Token aus – speichere es sicher

## Herausfinden deiner User-ID

Um `senderPolicy: "allowlist"` oder `"pairing"` zu verwenden, benötigst du deine Telegram-User-ID (eine numerische ID, nicht deinen Benutzernamen).

Der einfachste Weg, sie herauszufinden:

1. Suche auf Telegram nach [@userinfobot](https://t.me/userinfobot)
2. Sende eine beliebige Nachricht – der Bot antwortet mit deiner User-ID

## Konfiguration

Füge den Channel zu `~/.qwen/settings.json` hinzu:

```json
{
  "channels": {
    "my-telegram": {
      "type": "telegram",
      "token": "$TELEGRAM_BOT_TOKEN",
      "senderPolicy": "allowlist",
      "allowedUsers": ["YOUR_USER_ID"],
      "sessionScope": "user",
      "cwd": "/path/to/your/project",
      "instructions": "You are a concise coding assistant responding via Telegram. Keep responses short.",
      "groupPolicy": "disabled",
      "groups": {
        "*": { "requireMention": true }
      }
    }
  }
}
```

Lege das Bot-Token als Umgebungsvariable fest:

```bash
export TELEGRAM_BOT_TOKEN=<your-token-from-botfather>
```

Oder füge es zu einer `.env`-Datei hinzu, die vor dem Start geladen wird.

## Starten

```bash
# Start only the Telegram channel
qwen channel start my-telegram

# Or start all configured channels together
qwen channel start
```

Öffne dann deinen Bot in Telegram und sende eine Nachricht. Du solltest sofort „Working...“ sehen, gefolgt von der Antwort des Agents.

## Gruppenchats

So verwendest du den Bot in Telegram-Gruppen:

1. Setze `groupPolicy` in deiner Channel-Konfiguration auf `"allowlist"` oder `"open"`
2. **Deaktiviere den Privacy-Modus** in BotFather: `/mybots` → wähle deinen Bot → Bot Settings → Group Privacy → Turn Off
3. Füge den Bot zu einer Gruppe hinzu. Falls er bereits in der Gruppe war, **entferne und füge ihn erneut hinzu** (Telegram cached die Privacy-Einstellungen vom Zeitpunkt des Beitritts)
4. Wenn du `groupPolicy: "allowlist"` verwendest, füge die Chat-ID der Gruppe zu `groups` in deiner Konfiguration hinzu

Standardmäßig benötigt der Bot in Gruppen eine @-Erwähnung oder eine Antwort, um zu reagieren. Setze `"requireMention": false` für eine bestimmte Gruppe, damit er auf alle Nachrichten antwortet (nützlich für dedizierte Task-Gruppen). Weitere Details findest du unter [Group Chats](./overview#group-chats).

## Bilder und Dateien

Du kannst dem Bot nicht nur Text, sondern auch Fotos und Dokumente senden.

**Fotos:** Sende ein Foto und der Agent analysiert es mithilfe seiner Vision-Funktionen. Dies erfordert ein multimodales Modell – füge `"model": "qwen3.5-plus"` (oder ein anderes vision-fähiges Modell) zu deiner Channel-Konfiguration hinzu. Bildunterschriften werden als Nachrichtentext übergeben.

**Dokumente:** Sende ein PDF, eine Codedatei oder ein beliebiges Dokument. Der Bot lädt es herunter und speichert es lokal, damit der Agent es mit seinen Datei-Tools lesen kann. Dies funktioniert mit jedem Modell. Das Dateigrößenlimit von Telegram beträgt 20 MB.

## Tipps

- **Halte die Instruktionen knapp** – Telegram hat ein Nachrichtenlimit von 4096 Zeichen. Zusätzliche Hinweise wie „keep responses short“ helfen dem Agenten, innerhalb dieses Limits zu bleiben.
- **Verwende `sessionScope: "user"`** – Dadurch erhält jeder Nutzer seinen eigenen Chatverlauf. Verwende `/clear`, um neu zu starten.
- **Zugriff beschränken** – Verwende `senderPolicy: "allowlist"` für einen festen Nutzerkreis oder `"pairing"`, damit neue Nutzer Zugriff mit einem Code anfordern können, den du über die CLI freigibst. Details findest du unter [DM Pairing](./overview#dm-pairing).

## Nachrichtenformatierung

Die Markdown-Antworten des Agents werden automatisch in Telegram-kompatibles HTML konvertiert. Codeblöcke, Fettdruck, Kursivschrift, Links und Listen werden alle unterstützt.

## Fehlerbehebung

### Bot antwortet nicht

- Prüfe, ob das Bot-Token korrekt ist und die Umgebungsvariable gesetzt ist
- Stelle sicher, dass deine User-ID in `allowedUsers` steht, wenn du `senderPolicy: "allowlist"` verwendest, oder dass du freigegeben wurdest, wenn du `"pairing"` nutzt
- Prüfe die Terminal-Ausgabe auf Fehler

### Bot antwortet nicht in Gruppen

- Prüfe, ob `groupPolicy` auf `"allowlist"` oder `"open"` gesetzt ist (Standard ist `"disabled"`)
- Wenn du `"allowlist"` verwendest, stelle sicher, dass die Chat-ID der Gruppe in der `groups`-Konfiguration steht
- Stelle sicher, dass **Group Privacy in BotFather deaktiviert ist** – ohne diese Einstellung kann der Bot keine Nicht-Befehls-Nachrichten in Gruppen sehen
- Falls du den Privacy-Modus geändert hast, nachdem der Bot zur Gruppe hinzugefügt wurde, **entferne und füge den Bot erneut zur Gruppe hinzu**
- Standardmäßig benötigt der Bot eine @-Erwähnung oder eine Antwort. Sende `@deinbotname hello` zum Testen

### „Sorry, something went wrong processing your message“

Das bedeutet in der Regel, dass der Agent auf einen Fehler gestoßen ist. Prüfe die Terminal-Ausgabe für Details.

### Bot benötigt lange zum Antworten

Der Agent führt möglicherweise mehrere Tool-Calls aus (Dateien lesen, suchen usw.). Die „Working...“-Anzeige erscheint, während der Agent verarbeitet. Komplexe Aufgaben können eine Minute oder länger dauern.