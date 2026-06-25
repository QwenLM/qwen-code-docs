# QQ Bot (QQ机器人)

Diese Anleitung beschreibt die Einrichtung eines Qwen-Code-Kanals auf QQ über die offizielle QQ-Bot-Open-Plattform-API.

## Voraussetzungen

- Ein QQ-Konto (mobile App zum Scannen des QR-Codes)

## Einrichtung

### QR-Code-Anmeldung

Starten Sie den Kanal – beim ersten Mal wird ein QR-Code angezeigt. Scannen Sie diesen mit Ihrer QQ-App, um den Kanal zu aktivieren. Weder ein Entwicklerkonto noch eine manuelle Registrierung sind erforderlich. Die Anmeldedaten werden gespeichert und automatisch wiederverwendet.

```json
{
  "channels": {
    "my-qq": {
      "type": "qq"
    }
  }
}
```

```bash
qwen channel start my-qq
# Scannen Sie den QR-Code im Terminal mit Ihrer QQ-App
```

### Manuelle Konfiguration (Entwicklerportal)

Sie können auch Anmeldedaten vom Entwicklerportal der [QQ-Bot-Open-Plattform](https://q.qq.com/) verwenden, falls dort bereits eine App registriert ist:

```json
{
  "channels": {
    "my-qq": {
      "type": "qq",
      "appID": "IHRE_APP_ID",
      "appSecret": "$QQ_APP_SECRET"
    }
  }
}
```

Setzen Sie das Secret als Umgebungsvariable:

```bash
export QQ_APP_SECRET=<ihr-app-secret>
```

## Konfiguration

```json
{
  "channels": {
    "my-qq": {
      "type": "qq",
      "appID": "IHRE_APP_ID",
      "appSecret": "$QQ_APP_SECRET",
      "sandbox": false,
      "senderPolicy": "open",
      "sessionScope": "user",
      "cwd": "/pfad/zu/ihrem/projekt",
      "instructions": "你是一个通过 QQ Bot 对话的 AI 助手。回复控制在 2000 字符以内。",
      "blockStreaming": "on",
      "groupPolicy": "disabled",
      "groups": {
        "*": { "requireMention": true }
      }
    }
  }
}
```

### QQ-spezifische Optionen

| Option      | Standard | Beschreibung                                                                       |
| ----------- | -------- | ---------------------------------------------------------------------------------- |
| `appID`     | —        | QQ-Bot-AppID aus dem Entwicklerportal. Wenn nicht angegeben, wird QR-Code-Login verwendet. |
| `appSecret` | —        | QQ-Bot-AppSecret. Unterstützt die Syntax `$ENV_VAR`. Wenn nicht angegeben, wird QR-Code-Login verwendet. |
| `sandbox`   | `false`  | Auf `true` setzen, um die QQ-Sandbox-API-Umgebung zu nutzen (`sandbox.api.sgroup.qq.com`) |

Alle standardmäßigen Kanaloptionen (siehe [Kanalübersicht](./overview#options)) werden ebenfalls unterstützt:
`senderPolicy`, `allowedUsers`, `sessionScope`, `cwd`, `instructions`, `groupPolicy`, `groups`, `dispatchMode`, `blockStreaming`, `blockStreamingChunk`, `blockStreamingCoalesce`.

## Ausführung

```bash
# Nur den QQ-Kanal starten
qwen channel start my-qq

# Oder alle konfigurierten Kanäle gleichzeitig starten
qwen channel start
```

Öffnen Sie QQ und senden Sie eine Nachricht an Ihren Bot. Die Antwort sollte in Ihrem Chat erscheinen.

## Gruppenchats

Um den Bot in QQ-Gruppen zu nutzen:

1. Setzen Sie `groupPolicy` in Ihrer Kanalkonfiguration auf `"allowlist"` oder `"open"`.
2. Fügen Sie den Bot über das QQ-Bot-Open-Plattform-Dashboard einer QQ-Gruppe hinzu, oder lassen Sie ihn von einem Gruppenadministrator einladen.
3. Gruppenmitglieder müssen den Bot **@erwähnen**, um eine Antwort auszulösen.

Die QQ-Bot-API V2 liefert nur Gruppenmitteilungen, die den Bot @erwähnen – der Bot sieht nicht alle Gruppenmitteilungen. Standardmäßig ist `requireMention` auf `true` gesetzt und sollte für QQ auch so bleiben.

Vollständige Details zu Gruppenrichtlinien und Erwähnungsfilterung finden Sie unter [Gruppenchats](./overview#group-chats).

## Markdown-Unterstützung

Der QQ-Bot-Kanal unterstützt Markdown-Formatierung (`msg_type=2`). Die Markdown-Antworten des Agenten werden unverändert gesendet, und QQ rendert sie mit umfangreicher Formatierung (fett, kursiv, Codeblöcke, Links, Listen).

Sollte der QQ-Server eine Markdown-Nachricht aus irgendeinem Grund ablehnen, wiederholt der Kanal sie automatisch als Klartext – Ihre Nachrichten kommen also immer an, auch wenn die Markdown-Fähigkeit des Bots serverseitig eingeschränkt ist.

Dies ist das Gegenteil des WeChat-Kanals, der sämtliche Markdown-Formatierung entfernt. Sie können den Agenten im QQ-Kanal durchgängig Markdown verwenden lassen.

## Token-Verwaltung

Zugriffstokens laufen nach etwa 2 Stunden ab. Der Kanal erneuert sie automatisch bei 80 % ihrer Lebensdauer (normalerweise ~1,6 Stunden). Falls eine Erneuerung fehlschlägt, wird sie nach 60 Sekunden wiederholt.

Die Token-Aktualisierung läuft auch bei WebSocket-Wiederverbindungen weiter – der Kanal wird niemals aufgrund eines abgelaufenen Tokens offline gehen, solange AppID und AppSecret gültig bleiben.

## Verbindungsstabilität

- **Automatische Wiederverbindung:** Bei WebSocket-Trennung wiederholt der Kanal die Verbindung mit exponentiellem Backoff (bis zu 20 Versuche, maximal 30 Sekunden zwischen den Versuchen).
- **Sitzungswiederaufnahme:** Wenn die WebSocket-Verbindung kurzzeitig unterbrochen wird, verwendet der Kanal den QQ-Befehl `RESUME`, um die Sitzung wiederherzustellen, ohne dass laufende Nachrichten verloren gehen.
- **Serverübergreifende Kontextfortsetzung:** Chat-Sitzungen und Routing-Status werden auf der Festplatte gespeichert. Wenn der Daemon neu startet, werden Unterhaltungen nahtlos fortgesetzt.
- **Heartbeat-Überwachung:** Timeouts bei HEARTBEAT_ACK werden erkannt und erzwingen eine Wiederverbindung, um Zombie-Verbindungen zu vermeiden.
- **Nachrichtendeduplizierung:** Nach einer Wiederverbindung erneut gesendete Nachrichten werden erkannt und übersprungen.

## Tipps

- **Nutzen Sie Markdown frei** – Anders als bei WeChat rendert QQ Markdown nativ. Fett, Codeblöcke, Listen und Links funktionieren alle.
- **Halten Sie Antworten unter 2000 Zeichen** – Längere Antworten werden automatisch in Blöcke aufgeteilt. Ein Hinweis zur Länge in Ihren Anweisungen hilft dem Agenten, prägnant zu bleiben.
- **Sandbox zum Testen** – Setzen Sie `"sandbox": true`, um während der Entwicklung die Sandbox-API zu verwenden. Davon sind keine Produktionsnachrichten betroffen.
- **Zugriff beschränken** – Verwenden Sie `senderPolicy: "allowlist"` für einen festen QQ-Benutzerkreis oder `"pairing"`, um neue Benutzer über die CLI zu genehmigen. Details finden Sie unter [DM-Pairing](./overview#dm-pairing).
## Hauptunterschiede zu Telegram

| Bereich             | QQ Bot                                      | Telegram                                      |
| ------------------- | ------------------------------------------- | --------------------------------------------- |
| Authentifizierung   | QR-Code-Login oder AppID/AppSecret          | Statischer Bot-Token von BotFather            |
| Markdown            | Natives QQ-Markdown mit Fallback auf Klartext | HTML-formatiert aus Agent-Markdown            |
| Token-Lebenszyklus  | 2h TTL, automatische Aktualisierung bei 80% | Permanenter Bot-Token                         |
| Gruppennachrichten  | Nur @Erwähnungen werden an den Bot gesendet | Bot sieht alle Nachrichten (bei deaktiviertem Privatsphäre-Modus) |
| Tipp-Anzeige        | Nicht verfügbar (QQ-API-Einschränkung)      | „Arbeite…“-Nachricht                          |
| Sandbox-Modus       | Zum Testen unterstützt                      | Nicht verfügbar                               |

## Fehlerbehebung

### Bot antwortet nicht

- Überprüfen Sie die Terminalausgabe auf Fehler
- Stellen Sie sicher, dass der Kanal läuft (`qwen channel status`)
- Wenn Sie `senderPolicy: "allowlist"` verwenden, stellen Sie sicher, dass Ihre QQ-Benutzer-ID in `allowedUsers` enthalten ist
- Beim ersten Start erscheint ein QR-Code im Terminal – scannen Sie ihn mit Ihrer QQ-App

### Bot antwortet nicht in Gruppen

- Überprüfen Sie, dass `groupPolicy` auf `"allowlist"` oder `"open"` gesetzt ist (Standard ist `"disabled"`)
- **Sie müssen den Bot @erwähnen** – QQ liefert nur Nachrichten, die den Bot taggen
- Stellen Sie sicher, dass der Bot der Gruppe hinzugefügt wurde

### QR-Code-Login hängt

- Der QR-Code wird im Terminal angezeigt. Scannen Sie ihn mit Ihrer QQ-Mobil-App (Ich → Scannen)
- Wenn der QR-Code abläuft (normalerweise nach einigen Minuten), starten Sie den Kanal neu, um einen neuen zu erhalten

### Markdown-Nachrichten erscheinen als Klartext

- Der QQ-Server hat die Markdown-Nachricht möglicherweise abgelehnt, und der Kanal ist stillschweigend auf Klartext zurückgefallen. Überprüfen Sie das Terminal auf Logmeldungen wie `"Markdown rejected"`
- Dies ist auf der QQ Bot Open Platform ungewöhnlich, kann aber vorkommen, wenn die Markdown-Fähigkeit des Bots serverseitig eingeschränkt ist

### Token nach langer Ausfallzeit abgelaufen

- Wenn der Kanal länger als 2 Stunden offline ist, ist der Zugriffstoken abgelaufen. Der Kanal holt sich beim erneuten Verbinden einen neuen Token – kein Handlungsbedarf
- Wenn das AppSecret selbst ungültig ist (z. B. im Entwicklerportal gedreht), aktualisieren Sie das Feld `appSecret` oder löschen Sie `~/.qwen/channels/<name>-credentials.json`, um den QR-Code-Login erneut auszulösen
