# QQ Bot (QQ-Roboter)

Diese Anleitung erklärt, wie du einen Qwen Code-Channel auf QQ über die offizielle QQ Bot Open Platform API einrichtest.

## Voraussetzungen

- Ein QQ-Konto (mobile App zum Scannen des QR-Codes)

## Einrichtung

### QR-Code-Anmeldung

Starte den Channel – beim ersten Mal wird ein QR-Code angezeigt. Scanne ihn mit deiner QQ-App, um den Channel zu aktivieren. Es ist kein Entwicklerkonto oder manuelle Registrierung nötig. Die Anmeldedaten werden automatisch gespeichert und wiederverwendet.

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
# Scanne den QR-Code im Terminal mit deiner QQ-App
```

### Manuelle Konfiguration (Entwicklerportal)

Du kannst auch Anmeldedaten vom [QQ Bot Open Platform](https://q.qq.com/)-Entwicklerportal verwenden, falls dort bereits eine App registriert ist:

```json
{
  "channels": {
    "my-qq": {
      "type": "qq",
      "appID": "YOUR_APP_ID",
      "appSecret": "$QQ_APP_SECRET"
    }
  }
}
```

Setze das Geheimnis als Umgebungsvariable:

```bash
export QQ_APP_SECRET=<dein-app-secret>
```

## Konfiguration

```json
{
  "channels": {
    "my-qq": {
      "type": "qq",
      "appID": "YOUR_APP_ID",
      "appSecret": "$QQ_APP_SECRET",
      "sandbox": false,
      "senderPolicy": "open",
      "sessionScope": "user",
      "cwd": "/path/to/your/project",
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

| Option      | Standard | Beschreibung                                                                               |
| ----------- | -------- | ------------------------------------------------------------------------------------------ |
| `appID`     | —        | QQ Bot AppID aus dem Entwicklerportal. Wenn weggelassen, wird die QR-Code-Anmeldung genutzt. |
| `appSecret` | —        | QQ Bot AppSecret. Unterstützt die `$ENV_VAR`-Syntax. Wenn weggelassen, wird die QR-Code-Anmeldung genutzt. |
| `sandbox`   | `false`  | Setze auf `true`, um die QQ-Sandbox-API-Umgebung zu verwenden (`sandbox.api.sgroup.qq.com`) |

Alle standardmäßigen Channel-Optionen (siehe [Channel Übersicht](./overview#options)) werden ebenfalls unterstützt:
`senderPolicy`, `allowedUsers`, `sessionScope`, `cwd`, `instructions`, `groupPolicy`, `groups`, `dispatchMode`, `blockStreaming`, `blockStreamingChunk`, `blockStreamingCoalesce`.

## Ausführung

```bash
# Starte nur den QQ-Channel
qwen channel start my-qq

# Oder starte alle konfigurierten Channels zusammen
qwen channel start
```

Öffne QQ und sende eine Nachricht an deinen Bot. Du solltest die Antwort in deinem Chat sehen.

## Gruppenchats

Um den Bot in QQ-Gruppen zu nutzen:

1. Setze `groupPolicy` auf `"allowlist"` oder `"open"` in deiner Channel-Konfiguration
2. Füge den Bot über das QQ Bot Open Platform Dashboard oder durch Einladung eines Gruppenadministrators zu einer QQ-Gruppe hinzu
3. Gruppenmitglieder müssen den Bot **@erwähnen**, um eine Antwort auszulösen

Die QQ Bot API V2 liefert nur Gruppennachrichten, die den Bot @erwähnen – der Bot sieht nicht alle Gruppennachrichten. Standardmäßig ist `requireMention` auf `true` gesetzt; für QQ sollte dieser Wert auch so bleiben.

Siehe [Gruppenchats](./overview#group-chats) für vollständige Details zu Gruppenrichtlinien und Erwähnungsbeschränkungen.

## Markdown-Unterstützung

Der QQ Bot-Channel unterstützt Markdown-Formatierung (`msg_type=2`). Die Markdown-Antworten des Agents werden unverändert gesendet, und QQ rendert sie mit umfangreicher Formatierung (fett, kursiv, Codeblöcke, Links, Listen).

Falls der QQ-Server eine Markdown-Nachricht aus irgendeinem Grund ablehnt, sendet der Channel sie automatisch als Klartext erneut – deine Nachrichten kommen also immer durch, selbst wenn die Markdown-Fähigkeit des Bots serverseitig eingeschränkt ist.

Dies ist das Gegenteil des WeChat-Channels, der alle Markdown-Formatierung entfernt. Du kannst dem Agent im QQ-Channel die vollständige Markdown-Nutzung gestatten.

## Token-Verwaltung

Access-Token laufen nach etwa 2 Stunden ab. Der Channel erneuert sie automatisch bei 80 % ihrer TTL (normalerweise ~1,6 Stunden). Wenn eine Erneuerung fehlschlägt, wird sie nach 60 Sekunden wiederholt.

Die Token-Erneuerung läuft über WebSocket-Wiederverbindungen hinweg weiter – der Channel geht nie aufgrund eines abgelaufenen Tokens offline, solange AppID und AppSecret gültig bleiben.

## Verbindungsresilienz

- **Automatische Wiederverbindung:** Bei einer WebSocket-Unterbrechung wiederholt der Channel die Verbindung mit exponentiellem Backoff (bis zu 20 Versuche, max. 30 Sekunden zwischen den Versuchen)
- **Sitzungswiederaufnahme:** Falls die WebSocket-Verbindung kurzzeitig unterbrochen wird, nutzt der Channel den `RESUME`-Opcode von QQ, um die Sitzung ohne Verlust laufender Nachrichten wiederherzustellen
- **Serverübergreifende Kontextfortsetzung:** Chat-Sitzungen und Routing-Zustand werden auf der Festplatte gespeichert. Wenn der Daemon neu startet, werden Gespräche an der Stelle fortgesetzt, an der sie unterbrochen wurden
- **Heartbeat-Überwachung:** Timeouts bei HEARTBEAT_ACK werden erkannt und erzwingen eine Wiederverbindung, um Zombie-Verbindungen zu vermeiden
- **Nachrichten-Deduplizierung:** Nach einer Wiederverbindung erneut zugestellte Nachrichten werden erkannt und übersprungen

## Tipps

- **Nutze Markdown frei** – Anders als WeChat rendert QQ Markdown nativ. Fettschrift, Codeblöcke, Listen und Links funktionieren alle.
- **Halte Antworten unter 2000 Zeichen** – Längere Antworten werden automatisch aufgeteilt. Ein Hinweis zur Zeichenbegrenzung in deinen Anweisungen hilft dem Agent, präzise zu bleiben.
- **Sandbox zum Testen** – Setze `"sandbox": true`, um während der Entwicklung die Sandbox-API zu verwenden. Produktionsnachrichten werden nicht beeinträchtigt.
- **Zugriff einschränken** – Verwende `senderPolicy: "allowlist"` für einen festen Benutzerkreis oder `"pairing"`, um neue Benutzer über die CLI zu genehmigen. Siehe [DM-Pairing](./overview#dm-pairing) für Details.

## Hauptunterschiede zu Telegram

| Bereich           | QQ Bot                                      | Telegram                                      |
| ----------------- | ------------------------------------------- | --------------------------------------------- |
| Authentifizierung | QR-Code-Anmeldung oder AppID/AppSecret      | Statischer Bot-Token von BotFather            |
| Markdown          | Nativer QQ-Markdown mit Klartext-Fallback   | HTML-Formatierung aus Agent-Markdown          |
| Token-Lebensdauer | 2h TTL, automatische Erneuerung bei 80 %    | Dauerhafter Bot-Token                         |
| Gruppennachrichten| Nur @Erwähnungen werden an den Bot geliefert| Bot sieht alle Nachrichten (Privacy-Mode aus) |
| Schreibanzeige    | Nicht verfügbar (QQ-API-Einschränkung)      | „Working…“-Nachricht                          |
| Sandbox-Modus     | Wird zum Testen unterstützt                 | Nicht verfügbar                               |

## Fehlerbehebung

### Bot antwortet nicht

- Überprüfe die Terminalausgabe auf Fehler
- Stelle sicher, dass der Channel läuft (`qwen channel status`)
- Wenn `senderPolicy: "allowlist"` verwendet wird, stelle sicher, dass deine QQ-Benutzer-ID in `allowedUsers` enthalten ist
- Beim ersten Start erscheint ein QR-Code im Terminal – scanne ihn mit deiner QQ-App

### Bot antwortet nicht in Gruppen

- Überprüfe, dass `groupPolicy` auf `"allowlist"` oder `"open"` gesetzt ist (Standard ist `"disabled"`)
- **Du musst den Bot @erwähnen** – QQ liefert nur Nachrichten, die den Bot markieren
- Stelle sicher, dass der Bot zur Gruppe hinzugefügt wurde

### QR-Code-Anmeldung hängt fest

- Der QR-Code wird im Terminal angezeigt. Scanne ihn mit deiner QQ-Mobil-App (Ich → Scannen)
- Wenn der QR-Code abläuft (normalerweise nach einigen Minuten), starte den Channel neu, um einen neuen zu erhalten

### Markdown-Nachrichten werden als Klartext angezeigt

- Möglicherweise wurde die Markdown-Nachricht vom QQ-Server abgelehnt und der Channel ist stillschweigend auf Klartext zurückgefallen. Überprüfe das Terminal auf `"Markdown rejected"`-Logmeldungen
- Dies ist auf der QQ Bot Open Platform ungewöhnlich, kann aber vorkommen, wenn die Markdown-Fähigkeit des Bots serverseitig eingeschränkt ist

### Token nach längerer Ausfallzeit abgelaufen

- Wenn der Channel länger als 2 Stunden offline war, ist das Access-Token abgelaufen. Der Channel holt bei der Wiederverbindung ein neues Token – kein Handlungsbedarf
- Wenn das AppSecret selbst ungültig ist (z. B. im Entwicklerportal rotiert), aktualisiere das `appSecret`-Feld oder lösche `~/.qwen/channels/<name>-credentials.json`, um die QR-Code-Anmeldung erneut auszulösen