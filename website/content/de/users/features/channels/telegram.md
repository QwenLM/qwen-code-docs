# Telegram

Diese Anleitung beschreibt die Einrichtung eines Qwen Code-Kanals auf Telegram.

## Voraussetzungen

- Ein Telegram-Konto
- Ein Telegram-Bot-Token (siehe unten)

## Einen Bot erstellen

1. Öffne Telegram und suche nach [@BotFather](https://t.me/BotFather)
2. Sende `/newbot` und folge den Anweisungen, um einen Namen und einen Benutzernamen zu wählen
3. BotFather gibt dir einen Bot-Token — bewahre ihn sicher auf

## Deine Benutzer-ID finden

Um `senderPolicy: "allowlist"` oder `"pairing"` zu verwenden, benötigst du deine Telegram-Benutzer-ID (eine numerische ID, nicht deinen Benutzernamen).

Der einfachste Weg, sie zu finden:

1. Suche auf Telegram nach [@userinfobot](https://t.me/userinfobot)
2. Sende ihm eine beliebige Nachricht — er antwortet mit deiner Benutzer-ID

## Konfiguration

Füge den Kanal zu `~/.qwen/settings.json` hinzu:

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

Setze den Bot-Token als Umgebungsvariable:

```bash
export TELEGRAM_BOT_TOKEN=<your-token-from-botfather>
```

Oder füge ihn einer `.env`-Datei hinzu, die vor dem Ausführen geladen wird.

## Ausführen

```bash
# Starte nur den Telegram-Kanal
qwen channel start my-telegram

# Oder starte alle konfigurierten Kanäle gemeinsam
qwen channel start
```

Öffne dann deinen Bot in Telegram und sende eine Nachricht. Du solltest sofort „Working..." sehen, gefolgt von der Antwort des Agents.

## Gruppenchats

Um den Bot in Telegram-Gruppen zu verwenden:

1. Setze `groupPolicy` in deiner Kanalkonfiguration auf `"allowlist"` oder `"open"`
2. **Deaktiviere den Privatsphäre-Modus** in BotFather: `/mybots` → wähle deinen Bot aus → Bot Settings → Group Privacy → Turn Off
3. Füge den Bot zu einer Gruppe hinzu. Wenn er bereits in der Gruppe war, **entferne ihn und füge ihn erneut hinzu** (Telegram speichert die Datenschutzeinstellungen aus der Zeit, als der Bot der Gruppe beigetreten ist)
4. Wenn du `groupPolicy: "allowlist"` verwendest, füge die Chat-ID der Gruppe zu `groups` in deiner Konfiguration hinzu

Standardmäßig erwartet der Bot eine @Erwähnung oder eine Antwort, um in Gruppen zu antworten. Setze `"requireMention": false` für eine bestimmte Gruppe, damit er auf alle Nachrichten antwortet (nützlich für dedizierte Aufgabengruppen). Siehe [Gruppenchats](./overview#group-chats) für alle Details.

## Bilder und Dateien

Du kannst Fotos und Dokumente an den Bot senden, nicht nur Text.

**Fotos:** Sende ein Foto und der Agent analysiert es mit seinen Bildverarbeitungsfähigkeiten. Dies erfordert ein multimodales Modell — füge `"model": "qwen3.5-plus"` (oder ein anderes visionsfähiges Modell) zu deiner Kanalkonfiguration hinzu. Bildunterschriften werden als Nachrichtentext übermittelt.

**Dokumente:** Sende eine PDF-, Code-Datei oder ein beliebiges Dokument. Der Bot lädt es herunter und speichert es lokal, damit der Agent es mit seinen Datei-Tools lesen kann. Dies funktioniert mit jedem Modell. Das Dateigrößenlimit von Telegram beträgt 20 MB.

## Tipps

- **Halte Anweisungen präzise** — Telegram hat ein Nachrichtenlimit von 4096 Zeichen. Anweisungen wie „Antworten kurz halten" helfen dem Agenten, innerhalb der Grenzen zu bleiben.
- **Verwende `sessionScope: "user"`** — Dadurch erhält jeder Benutzer sein eigenes Gespräch. Verwende `/clear`, um neu zu beginnen.
- **Zugriff beschränken** — Verwende `senderPolicy: "allowlist"` für einen festen Benutzerkreis oder `"pairing"`, damit neue Benutzer Zugriff mit einem Code anfordern können, den du über die CLI genehmigst. Siehe [DM Pairing](./overview#dm-pairing) für Details.

## Nachrichtenformatierung

Die Markdown-Antworten des Agents werden automatisch in Telegram-kompatibles HTML umgewandelt. Codeblöcke, fett, kursiv, Links und Listen werden alle unterstützt.

## Fehlerbehebung

### Bot antwortet nicht

- Überprüfe, ob der Bot-Token korrekt und die Umgebungsvariable gesetzt ist
- Stelle sicher, dass deine Benutzer-ID in `allowedUsers` enthalten ist, wenn du `senderPolicy: "allowlist"` verwendest, oder dass du genehmigt wurdest, wenn du `"pairing"` verwendest
- Überprüfe die Terminalausgabe auf Fehler

### Bot antwortet nicht in Gruppen

- Überprüfe, ob `groupPolicy` auf `"allowlist"` oder `"open"` gesetzt ist (Standard ist `"disabled"`)
- Wenn du `"allowlist"` verwendest, verifiziere, dass die Chat-ID der Gruppe in der `groups`-Konfiguration enthalten ist
- Stelle sicher, dass **Group Privacy in BotFather ausgeschaltet** ist — ohne dies kann der Bot Nicht-Befehlsnachrichten in Gruppen nicht sehen
- Wenn du den Privatsphäre-Modus nach dem Hinzufügen des Bots zu einer Gruppe geändert hast, **entferne den Bot aus der Gruppe und füge ihn erneut hinzu**
- Standardmäßig erwartet der Bot eine @Erwähnung oder eine Antwort. Sende `@deinbotname hallo` zum Testen

### „Sorry, something went wrong processing your message"

Dies bedeutet normalerweise, dass der Agent auf einen Fehler gestoßen ist. Überprüfe die Terminalausgabe auf Details.

### Bot braucht lange zum Antworten

Der Agent führt möglicherweise mehrere Tool-Aufrufe durch (Dateien lesen, suchen usw.). Die Anzeige „Working..." erscheint, während der Agent arbeitet. Komplexe Aufgaben können eine Minute oder länger dauern.