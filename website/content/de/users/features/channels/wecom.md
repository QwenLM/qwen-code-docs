# WeCom (Enterprise WeChat)

Dieser Leitfaden behandelt die Einrichtung von Qwen Code mit einem intelligenten WeCom-Roboter (企业微信智能机器人).

## Voraussetzungen

- Ein WeCom-Organisationskonto
- Ein im API-Modus erstellter intelligenter WeCom-Roboter
- Die Bot ID und das Secret des Roboters

## Erstellen des Roboters

1. Öffne die WeCom-Admin-Konsole und erstelle einen intelligenten Roboter.
2. Wähle den API-Modus.
3. Kopiere die Bot ID und das Secret.
4. Füge den Roboter den Direktnachrichten oder Gruppen hinzu, in denen er verfügbar sein soll.

Der intelligente Roboter verwendet eine WebSocket-Verbindung von Qwen Code zu WeCom. Du benötigst keine öffentliche Callback-URL, keinen Token, keinen EncodingAESKey, keine Corp ID und keine Agent ID.

## Konfiguration

Füge den Channel zu `~/.qwen/settings.json` hinzu:

```json
{
  "channels": {
    "my-wecom": {
      "type": "wecom",
      "botId": "$WECOM_BOT_ID",
      "secret": "$WECOM_SECRET",
      "senderPolicy": "allowlist",
      "allowedUsers": ["zhangsan"],
      "sessionScope": "user",
      "cwd": "/path/to/your/project",
      "instructions": "You are a concise coding assistant responding via WeCom.",
      "groupPolicy": "open",
      "groups": {
        "*": { "requireMention": true }
      }
    }
  }
}
```

Setze die Zugangsdaten als Umgebungsvariablen:

```bash
export WECOM_BOT_ID=<your-bot-id>
export WECOM_SECRET=<your-secret>
```

Oder definiere sie im `env`-Abschnitt von `settings.json`:

```json
{
  "env": {
    "WECOM_BOT_ID": "your-bot-id",
    "WECOM_SECRET": "your-secret"
  }
}
```

## Starten

```bash
qwen channel start my-wecom
```

Öffne WeCom und sende eine Nachricht an den intelligenten Roboter.

## Zugriffskontrolle

`senderPolicy` funktioniert genauso wie bei anderen IM-Channels:

- `allowlist`: Nur Benutzer in `allowedUsers` können den Bot verwenden. Dies ist die empfohlene Standardeinstellung für Unternehmen.
- `pairing`: Benutzer müssen sich koppeln, bevor sie den Bot verwenden können.
- `open`: Jeder, der dem Roboter Nachrichten senden kann, kann ihn verwenden.

Für Gruppen setze `groupPolicy` auf `"allowlist"` oder `"open"`. Standardmäßig erfordern Gruppennachrichten eine Erwähnung durch `"requireMention": true`.

Wenn das WeCom SDK explizite Erwähnungs-Metadaten enthält, verwendet Qwen Code diese für diese Prüfung. Wenn keine Erwähnungs-Metadaten vorhanden sind, behandelt der Channel zugestellte Gruppennachrichten als nicht erwähnt. Setze `"requireMention": false` nur, wenn du dich stattdessen auf die WeCom-seitige Zustellungsfilterung verlassen möchtest.

## Bilder und Dateien

Benutzer können Text, Sprachnachrichten mit Transkription, Bilder, gemischte Text- und Bildnachrichten, Dateien und Videos senden. Bilder werden dem Agenten als Bildanhänge übergeben. Dateien und Videos werden in temporäre lokale Pfade heruntergeladen, damit der Agent sie mit Datei-Tools lesen kann.

Antworten des Assistenten werden als WeCom-Markdown gesendet. Um ein vom Agenten generiertes lokales Bild zu senden, füge einen Marker außerhalb von Codeblöcken ein:

```text
[IMAGE: /absolute/path/to/image.png]
```

Aus Sicherheitsgründen müssen lokale Bildpfade innerhalb des Channel-Dateiverzeichnisses unter dem temporären Systemverzeichnis liegen, wie z. B. `/tmp/channel-files/...` unter Linux. Generische Marker für Datei-, Video- und Sprach-Uploads werden ignoriert, da sonst vom Modell erzeugte Dateipfade beliebige Workspace-Dateien hochladen könnten.

## Fehlerbehebung

### Bot stellt keine Verbindung her

- Überprüfe die Bot ID und das Secret.
- Stelle sicher, dass der Roboter im API-Modus erstellt wurde.
- Überprüfe, ob die Umgebungsvariablen in der Shell verfügbar sind, die `qwen channel start` ausführt.

### Bot antwortet nicht in Gruppen

- Überprüfe `groupPolicy`.
- Erwähne den Bot, es sei denn, die Gruppenkonfiguration setzt `"requireMention": false`.
- Stelle sicher, dass der Roboter der Gruppe hinzugefügt wurde.

### Zugangsdaten für selbst erstellte Anwendungen funktionieren nicht

Dieser Channel ist für intelligente WeCom-Roboter gedacht. Callback-Zugangsdaten für selbst erstellte Anwendungen wie Corp ID, Agent ID, Token und EncodingAESKey werden von diesem Channel nicht verwendet.