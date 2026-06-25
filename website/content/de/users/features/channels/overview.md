# Kanäle

Kanäle ermöglichen es dir, mit einem Qwen Code Agenten über Messaging-Plattformen wie Telegram, WeChat, QQ oder DingTalk zu interagieren – statt über das Terminal. Du sendest Nachrichten von deinem Handy oder Desktop-Chat und der Agent antwortet genau wie in der CLI.

## Funktionsweise

Wenn du `qwen channel start` ausführst, macht Qwen Code Folgendes:

1. Liest die Kanalkonfigurationen aus deiner `settings.json`
2. Startet einen einzelnen Agentenprozess mithilfe des [Agent Client Protocol (ACP)](../../../developers/architecture.md)
3. Verbindet sich mit jeder Messaging-Plattform und beginnt, auf Nachrichten zu lauschen
4. Leitet eingehende Nachrichten an den Agenten weiter und sendet Antworten zurück an den richtigen Chat

Alle Kanäle teilen sich einen Agentenprozess mit isolierten Sitzungen pro Benutzer. Jeder Kanal kann ein eigenes Arbeitsverzeichnis, Modell und eigene Anweisungen haben.

## Schnellstart

1. Richte einen Bot auf deiner Messaging-Plattform ein (siehe kanalspezifische Anleitungen: [Telegram](./telegram), [WeChat](./weixin), [QQ Bot](./qqbot), [DingTalk](./dingtalk))
2. Füge die Kanalkonfiguration zu `~/.qwen/settings.json` hinzu
3. Führe `qwen channel start` aus, um alle Kanäle zu starten, oder `qwen channel start <name>` für einen einzelnen Kanal

Möchtest du eine Plattform anbinden, die nicht integriert ist? Siehe [Plugins](./plugins), um einen benutzerdefinierten Adapter als Erweiterung hinzuzufügen.

## Konfiguration

Kanäle werden unter dem Schlüssel `channels` in der `settings.json` konfiguriert. Jeder Kanal hat einen Namen und eine Reihe von Optionen:

```json
{
  "channels": {
    "my-channel": {
      "type": "telegram",
      "token": "$MY_BOT_TOKEN",
      "senderPolicy": "allowlist",
      "allowedUsers": ["123456789"],
      "sessionScope": "user",
      "cwd": "/path/to/working/directory",
      "instructions": "Optionale Systemanweisungen für den Agenten.",
      "groupPolicy": "disabled",
      "groups": {
        "*": { "requireMention": true }
      }
    }
  }
}
```

### Optionen

| Option                   | Erforderlich | Beschreibung                                                                                                                                                |
| ------------------------ | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`                   | Ja           | Kanaltyp: `telegram`, `weixin`, `qq`, `dingtalk`, `feishu` oder ein benutzerdefinierter Typ aus einer Erweiterung (siehe [Plugins](./plugins))               |
| `token`                  | Telegram     | Bot-Token. Unterstützt die `$ENV_VAR`-Syntax zum Auslesen aus Umgebungsvariablen. Nicht benötigt für WeChat oder DingTalk                                    |
| `clientId`               | DingTalk     | DingTalk AppKey. Unterstützt die `$ENV_VAR`-Syntax                                                                                                          |
| `clientSecret`           | DingTalk     | DingTalk AppSecret. Unterstützt die `$ENV_VAR`-Syntax                                                                                                       |
| `model`                  | Nein         | Für diesen Kanal zu verwendendes Modell (z. B. `qwen3.5-plus`). Überschreibt das Standardmodell. Nützlich für multimodale Modelle, die Bildeingabe unterstützen |
| `senderPolicy`           | Nein         | Wer mit dem Bot sprechen darf: `allowlist` (Standard), `open` oder `pairing`                                                                                |
| `allowedUsers`           | Nein         | Liste der Benutzer-IDs, die den Bot verwenden dürfen (wird von den Richtlinien `allowlist` und `pairing` verwendet)                                          |
| `sessionScope`           | Nein         | Wie Sitzungen abgegrenzt werden: `user` (Standard), `thread` oder `single`                                                                                  |
| `cwd`                    | Nein         | Arbeitsverzeichnis für den Agenten. Standardmäßig das aktuelle Verzeichnis                                                                                  |
| `instructions`           | Nein         | Benutzerdefinierte Anweisungen, die der ersten Nachricht jeder Sitzung vorangestellt werden                                                                 |
| `groupPolicy`            | Nein         | Zugriff auf Gruppenchats: `disabled` (Standard), `allowlist` oder `open`. Siehe [Gruppenchats](#group-chats)                                                |
| `groups`                 | Nein         | Gruppenspezifische Einstellungen. Schlüssel sind Gruppen-Chat-IDs oder `"*"` für Standardwerte. Siehe [Gruppenchats](#group-chats)                           |
| `dispatchMode`           | Nein         | Was passiert, wenn du eine Nachricht sendest, während der Bot beschäftigt ist: `steer` (Standard), `collect` oder `followup`. Siehe [Dispatch-Modi](#dispatch-modes) |
| `blockStreaming`         | Nein         | Progressive Antwortauslieferung: `on` oder `off` (Standard). Siehe [Block-Streaming](#block-streaming)                                                      |
| `blockStreamingChunk`    | Nein         | Grenzen für die Blockgröße: `{ "minChars": 400, "maxChars": 1000 }`. Siehe [Block-Streaming](#block-streaming)                                              |
| `blockStreamingCoalesce` | Nein         | Leerlauf-Leerung: `{ "idleMs": 1500 }`. Siehe [Block-Streaming](#block-streaming)                                                                           |
### Sender-Richtlinie

Legt fest, wer mit dem Bot interagieren kann:

- **`allowlist`** (Standard) — Nur Benutzer, die in `allowedUsers` aufgeführt sind, können Nachrichten senden. Andere werden still ignoriert.
- **`pairing`** — Unbekannte Absender erhalten einen Pairing-Code. Der Bot-Betreiber genehmigt sie über die CLI, und sie werden zu einer dauerhaften Zulassungsliste hinzugefügt. Benutzer in `allowedUsers` überspringen das Pairing vollständig. Siehe [DM-Pairing](#dm-pairing) weiter unten.
- **`open`** — Jeder kann Nachrichten senden. Mit Vorsicht verwenden.

### Sitzungsumfang

Legt fest, wie Konversationssitzungen verwaltet werden:

- **`user`** (Standard) — Eine Sitzung pro Benutzer. Alle Nachrichten desselben Benutzers teilen sich eine Unterhaltung.
- **`thread`** — Eine Sitzung pro Thread/Thema. Nützlich für Gruppenchats mit Threads.
- **`single`** — Eine gemeinsame Sitzung für alle Benutzer. Alle teilen sich dieselbe Unterhaltung.

### Token-Sicherheit

Bot-Token sollten nicht direkt in `settings.json` gespeichert werden. Verwenden Sie stattdessen Umgebungsvariablen-Referenzen:

```json
{
  "token": "$TELEGRAM_BOT_TOKEN"
}
```

Setzen Sie das tatsächliche Token in Ihrer Shell-Umgebung oder in einer `.env`-Datei, die vor dem Starten des Kanals geladen wird.

## DM-Pairing

Wenn `senderPolicy` auf `"pairing"` gesetzt ist, durchlaufen unbekannte Absender einen Genehmigungsablauf:

1. Ein unbekannter Benutzer sendet eine Nachricht an den Bot
2. Der Bot antwortet mit einem 8-stelligen Pairing-Code (z. B. `VEQDDWXJ`)
3. Der Benutzer teilt den Code mit Ihnen (dem Bot-Betreiber)
4. Sie genehmigen ihn über die CLI:

```bash
qwen channel pairing approve my-channel VEQDDWXJ
```

Nach der Genehmigung wird die Benutzer-ID in `~/.qwen/channels/<name>-allowlist.json` gespeichert, und alle zukünftigen Nachrichten werden normal verarbeitet.

### Pairing-CLI-Befehle

```bash
# List pending pairing requests
qwen channel pairing list my-channel

# Approve a request by code
qwen channel pairing approve my-channel <CODE>
```

### Pairing-Regeln

- Codes bestehen aus 8 Zeichen, Großbuchstaben, mit einem eindeutigen Alphabet (kein `0`/`O`/`1`/`I`)
- Codes verfallen nach 1 Stunde
- Maximal 3 ausstehende Anfragen pro Kanal gleichzeitig – weitere Anfragen werden ignoriert, bis eine verfällt oder genehmigt wird
- Benutzer, die in `allowedUsers` in `settings.json` aufgeführt sind, überspringen das Pairing immer
- Genehmigte Benutzer werden in `~/.qwen/channels/<name>-allowlist.json` gespeichert – behandeln Sie diese Datei als vertraulich

## Gruppenchats

Standardmäßig funktioniert der Bot nur in Direktnachrichten. Um Gruppenchat-Unterstützung zu aktivieren, setzen Sie `groupPolicy` auf `"allowlist"` oder `"open"`.

### Gruppenrichtlinie

Legt fest, ob der Bot überhaupt an Gruppenchats teilnimmt:

- **`disabled`** (Standard) — Der Bot ignoriert alle Gruppennachrichten. Sicherste Option.
- **`allowlist`** — Der Bot antwortet nur in Gruppen, die explizit in `groups` nach Chat-ID aufgeführt sind. Der Schlüssel `"*"` bietet Standardeinstellungen, fungiert jedoch **nicht** als Wildcard-Zulassung.
- **`open`** — Der Bot antwortet in allen Gruppen, zu denen er hinzugefügt wurde. Mit Vorsicht verwenden.

### Erwähnungssteuerung

In Gruppen erfordert der Bot standardmäßig eine `@Erwähnung` oder eine Antwort auf eine seiner Nachrichten. Dies verhindert, dass der Bot auf jede Nachricht in einem Gruppenchat antwortet.

Konfigurieren Sie pro Gruppe mit der `groups`-Einstellung:

```json
{
  "groups": {
    "*": { "requireMention": true },
    "-100123456": { "requireMention": false }
  }
}
```

- **`"*"`** — Standardeinstellungen für alle Gruppen. Legt nur Konfigurationsstandards fest, keinen Zulassungslisteneintrag.
- **Gruppen-Chat-ID** — Überschreibt Einstellungen für eine bestimmte Gruppe. Überschreibt `"*"`-Standards.
- **`requireMention`** (Standard: `true`) — Bei `true` antwortet der Bot nur auf Nachrichten, die ihn @erwähnen oder auf eine seiner Nachrichten antworten. Bei `false` antwortet der Bot auf alle Nachrichten (nützlich für dedizierte Aufgabengruppen).

### Wie Gruppennachrichten ausgewertet werden

```
1. groupPolicy — ist diese Gruppe erlaubt?           (nein → ignorieren)
2. requireMention — wurde der Bot erwähnt/beantwortet? (nein → ignorieren)
3. senderPolicy — ist dieser Absender genehmigt?         (nein → Pairing-Ablauf)
4. Weiterleitung zur Sitzung
```

### Telegram-Einrichtung für Gruppen

1. Fügen Sie den Bot zu einer Gruppe hinzu
2. **Deaktivieren Sie den Privatsphäre-Modus** in BotFather (`/mybots` → Bot Settings → Group Privacy → Turn Off) – andernfalls sieht der Bot keine Nicht-Befehlsnachrichten
3. **Entfernen Sie den Bot und fügen Sie ihn erneut** zur Gruppe hinzu, nachdem Sie den Privatsphäre-Modus geändert haben (Telegram speichert diese Einstellung zwischen)

### Finden einer Gruppen-Chat-ID

Um die Chat-ID einer Gruppe für die `groups`-Zulassungsliste zu finden:

1. Stoppen Sie den Bot, falls er läuft
2. Senden Sie eine Nachricht, die den Bot in der Gruppe erwähnt
3. Verwenden Sie die Telegram Bot API, um ausstehende Updates zu prüfen:

```bash
curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates" | python3 -m json.tool
```

Suchen Sie nach `message.chat.id` in der Antwort – Gruppen-IDs sind negative Zahlen (z. B. `-5170296765`).

## Medienunterstützung

Kanäle unterstützen das Senden von Bildern und Dateien an den Agenten, nicht nur Text.

### Bilder

Senden Sie ein Foto an den Bot, und der Agent sieht es – nützlich zum Teilen von Screenshots, Fehlermeldungen oder Diagrammen. Das Bild wird direkt als Vision-Input an das Modell gesendet.

Um die Bildunterstützung zu nutzen, konfigurieren Sie ein multimodales Modell für den Kanal:

```json
{
  "channels": {
    "my-channel": {
      "type": "telegram",
      "model": "qwen3.5-plus",
      ...
    }
  }
}
### Dateien

Senden Sie ein Dokument (PDF, Codedatei, Textdatei usw.) an den Bot. Die Datei wird heruntergeladen und in einem temporären Verzeichnis gespeichert. Dem Agenten wird der Dateipfad mitgeteilt, sodass er die Inhalte mit seinen Dateilesewerkzeugen lesen kann.

Dateien funktionieren mit jedem Modell – es ist keine multimodale Unterstützung erforderlich.

### Plattformunterschiede

| Feature   | Telegram                                    | WeChat                           | DingTalk                                      |
| --------- | ------------------------------------------- | -------------------------------- | --------------------------------------------- |
| Bilder    | Direkter Download über Bot API              | CDN-Download mit AES-Entschlüsselung | downloadCode-API (zweistufig)                 |
| Dateien   | Direkter Download über Bot API (20 MB-Grenze) | CDN-Download mit AES-Entschlüsselung | downloadCode-API (zweistufig)                 |
| Bildunterschriften | Foto-/Dateiunterschriften als Nachrichtentext enthalten | Nicht zutreffend           | Rich Text: gemischter Text und Bilder in einer Nachricht |

## Dispatch-Modi

Steuert, was passiert, wenn Sie eine neue Nachricht senden, während der Bot noch eine vorherige verarbeitet.

- **`steer`** (Standard) – Der Bot bricht die aktuelle Anfrage ab und beginnt mit Ihrer neuen Nachricht. Am besten für normales Chatten geeignet, wo eine Folgenachricht normalerweise bedeutet, dass Sie den Bot korrigieren oder umleiten möchten.
- **`collect`** – Ihre neuen Nachrichten werden gepuffert. Wenn die aktuelle Anfrage abgeschlossen ist, werden alle gepufferten Nachrichten zu einer einzigen Folgenachricht (Follow-up) kombiniert. Gut für asynchrone Arbeitsabläufe, bei denen Sie Gedanken in eine Warteschlange stellen möchten.
- **`followup`** – Jede Nachricht wird in die Warteschlange gestellt und als eigener separater Durchlauf in der Reihenfolge verarbeitet. Nützlich für Batch-Workflows, bei denen jede Nachricht unabhängig ist.

```json
{
  "channels": {
    "my-channel": {
      "type": "telegram",
      "dispatchMode": "steer",
      ...
    }
  }
}
```

Sie können den Dispatch-Modus auch pro Gruppe festlegen und damit den Kanalstandard überschreiben:

```json
{
  "groups": {
    "*": { "requireMention": true, "dispatchMode": "steer" },
    "-100123456": { "dispatchMode": "collect" }
  }
}
```

## Block-Streaming

Standardmäßig arbeitet der Agent eine Weile und sendet dann eine große Antwort. Mit aktiviertem Block-Streaming kommt die Antwort in mehreren kürzeren Nachrichten, während der Agent noch arbeitet – ähnlich wie ChatGPT oder Claude progressive Ausgaben zeigen.

```json
{
  "channels": {
    "my-channel": {
      "type": "telegram",
      "blockStreaming": "on",
      "blockStreamingChunk": { "minChars": 400, "maxChars": 1000 },
      "blockStreamingCoalesce": { "idleMs": 1500 },
      ...
    }
  }
}
```

### So funktioniert es

- Die Antwort des Agenten wird an Absatzgrenzen in Blöcke aufgeteilt und als separate Nachrichten gesendet
- `minChars` (Standard 400) – Senden Sie einen Block erst, wenn er mindestens diese Länge hat, um das Versenden winziger Nachrichten zu vermeiden
- `maxChars` (Standard 1000) – Wenn ein Block diese Länge ohne natürliche Unterbrechung erreicht, senden Sie ihn trotzdem
- `idleMs` (Standard 1500) – Wenn der Agent eine Pause einlegt (z.B. beim Ausführen eines Tools), senden Sie den bisher gepufferten Inhalt
- Wenn der Agent fertig ist, wird der verbleibende Text sofort gesendet

Nur `blockStreaming` ist erforderlich. Die Einstellungen für Chunk und Coalesce sind optional und haben sinnvolle Standardwerte.

## Slash-Befehle

Kanäle unterstützen Schrägstrich-Befehle. Diese werden lokal verarbeitet (kein Agent-Roundtrip):

- `/help` – Verfügbare Befehle auflisten
- `/clear` – Ihre Sitzung löschen und neu beginnen (Aliase: `/reset`, `/new`)
- `/status` – Sitzungsinformationen und Zugriffsrichtlinie anzeigen

Alle anderen Schrägstrich-Befehle (z.B. `/compress`, `/summary`) werden an den Agenten weitergeleitet.

Diese Befehle funktionieren auf allen Kanaltypen (Telegram, WeChat, QQ, DingTalk).

## Ausführen

```bash
# Start all configured channels (shared agent process)
qwen channel start

# Start a single channel
qwen channel start my-channel

# Check if the service is running
qwen channel status

# Stop the running service
qwen channel stop
```

Der Bot läuft im Vordergrund. Drücken Sie `Strg+C` zum Beenden, oder verwenden Sie `qwen channel stop` von einem anderen Terminal.

### Multi-Kanal-Modus

Wenn Sie `qwen channel start` ohne Namen ausführen, starten alle in `settings.json` definierten Kanäle zusammen und teilen sich einen einzigen Agentenprozess. Jeder Kanal verwaltet seine eigenen Sitzungen – ein Telegram-Benutzer und ein WeChat-Benutzer erhalten separate Unterhaltungen, auch wenn sie denselben Agenten teilen.

Jeder Kanal verwendet sein eigenes `cwd` aus seiner Konfiguration, sodass verschiedene Kanäle gleichzeitig an verschiedenen Projekten arbeiten können.

### Diensteverwaltung

Der Kanal-Dienst verwendet eine PID-Datei (`~/.qwen/channels/service.pid`), um die laufende Instanz zu verfolgen:

- **Duplikatsvermeidung**: Wenn Sie `qwen channel start` ausführen, während bereits ein Dienst läuft, wird ein Fehler angezeigt, anstatt eine zweite Instanz zu starten
- **`qwen channel stop`**: Beendet den laufenden Dienst ordnungsgemäß von einem anderen Terminal aus
- **`qwen channel status`**: Zeigt an, ob der Dienst läuft, seine Laufzeit und die Sitzungsanzahl pro Kanal

### Absturzwiederherstellung

Wenn der Agentenprozess unerwartet abstürzt, startet der Kanal-Dienst ihn automatisch neu und versucht, alle aktiven Sitzungen wiederherzustellen. Benutzer können ihre Unterhaltungen fortsetzen, ohne neu beginnen zu müssen.
- Sitzungen werden unter `~/.qwen/channels/sessions.json` gespeichert, während der Dienst läuft
- Bei einem Absturz: Der Agent startet innerhalb von 3 Sekunden neu und lädt die gespeicherten Sitzungen erneut
- Nach 3 aufeinanderfolgenden Abstürzen beendet sich der Dienst mit einem Fehler
- Bei sauberem Herunterfahren (Strg+C oder `qwen channel stop`): Die Sitzungsdaten werden gelöscht – der nächste Start erfolgt immer frisch
