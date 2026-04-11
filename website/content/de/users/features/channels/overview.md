# Channels

Mit Channels kannst du mit einem Qwen Code-Agenten über Messaging-Plattformen wie Telegram, WeChat oder DingTalk interagieren, anstatt das Terminal zu verwenden. Du sendest Nachrichten von deinem Smartphone oder Desktop-Chat-Client, und der Agent antwortet genauso wie in der CLI.

## Funktionsweise

Wenn du `qwen channel start` ausführst, führt Qwen Code Folgendes aus:

1. Liest die Channel-Konfigurationen aus deiner `settings.json`
2. Startet einen einzelnen Agent-Prozess über das [Agent Client Protocol (ACP)](../../developers/architecture)
3. Stellt eine Verbindung zu jeder Messaging-Plattform her und lauscht auf eingehende Nachrichten
4. Leitet eingehende Nachrichten an den Agenten weiter und sendet Antworten an den jeweiligen Chat zurück

Alle Channels teilen sich einen Agent-Prozess, wobei die Sessions pro Benutzer isoliert sind. Jeder Channel kann ein eigenes Arbeitsverzeichnis, Modell und eigene Instructions haben.

## Schnellstart

1. Richte einen Bot auf deiner Messaging-Plattform ein (siehe plattformspezifische Anleitungen: [Telegram](./telegram), [WeChat](./weixin), [DingTalk](./dingtalk))
2. Füge die Channel-Konfiguration zu `~/.qwen/settings.json` hinzu
3. Führe `qwen channel start` aus, um alle Channels zu starten, oder `qwen channel start <name>` für einen einzelnen Channel

Möchtest du eine Plattform anbinden, die nicht standardmäßig unterstützt wird? Siehe [Plugins](./plugins), um einen eigenen Adapter als Erweiterung hinzuzufügen.

## Konfiguration

Channels werden unter dem Schlüssel `channels` in der `settings.json` konfiguriert. Jeder Channel hat einen Namen und eine Reihe von Optionen:

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
      "instructions": "Optional system instructions for the agent.",
      "groupPolicy": "disabled",
      "groups": {
        "*": { "requireMention": true }
      }
    }
  }
}
```

### Optionen

| Option                   | Erforderlich | Beschreibung                                                                                                                                    |
| ------------------------ | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`                   | Ja           | Channel-Typ: `telegram`, `weixin`, `dingtalk` oder ein benutzerdefinierter Typ aus einer Erweiterung (siehe [Plugins](./plugins))                                  |
| `token`                  | Telegram     | Bot-Token. Unterstützt `$ENV_VAR`-Syntax zum Auslesen aus Umgebungsvariablen. Nicht erforderlich für WeChat oder DingTalk                                    |
| `clientId`               | DingTalk     | DingTalk AppKey. Unterstützt `$ENV_VAR`-Syntax                                                                                                    |
| `clientSecret`           | DingTalk     | DingTalk AppSecret. Unterstützt `$ENV_VAR`-Syntax                                                                                                 |
| `model`                  | Nein         | Modell, das für diesen Channel verwendet werden soll (z. B. `qwen3.5-plus`). Überschreibt das Standardmodell. Nützlich für multimodale Modelle, die Bildeingaben unterstützen       |
| `senderPolicy`           | Nein         | Wer mit dem Bot kommunizieren darf: `allowlist` (Standard), `open` oder `pairing`                                                                           |
| `allowedUsers`           | Nein         | Liste der Benutzer-IDs, die den Bot verwenden dürfen (wird von den Richtlinien `allowlist` und `pairing` verwendet)                                                           |
| `sessionScope`           | Nein         | Legt fest, wie Sessions verwaltet werden: `user` (Standard), `thread` oder `single`                                                                               |
| `cwd`                    | Nein         | Arbeitsverzeichnis für den Agenten. Standardmäßig das aktuelle Verzeichnis                                                                             |
| `instructions`           | Nein         | Benutzerdefinierte Instructions, die der ersten Nachricht jeder Session vorangestellt werden                                                                             |
| `groupPolicy`            | Nein         | Zugriff auf Gruppenchats: `disabled` (Standard), `allowlist` oder `open`. Siehe [Gruppenchats](#group-chats)                                               |
| `groups`                 | Nein         | Einstellungen pro Gruppe. Schlüssel sind Gruppen-Chat-IDs oder `"*"` für Standardwerte. Siehe [Gruppenchats](#group-chats)                                             |
| `dispatchMode`           | Nein         | Verhalten beim Senden einer Nachricht, während der Bot beschäftigt ist: `steer` (Standard), `collect` oder `followup`. Siehe [Dispatch-Modi](#dispatch-modes) |
| `blockStreaming`         | Nein         | Progressive Antwortausgabe: `on` oder `off` (Standard). Siehe [Block Streaming](#block-streaming)                                                |
| `blockStreamingChunk`    | Nein         | Chunk-Größenbeschränkungen: `{ "minChars": 400, "maxChars": 1000 }`. Siehe [Block Streaming](#block-streaming)                                            |
| `blockStreamingCoalesce` | Nein         | Idle-Flush: `{ "idleMs": 1500 }`. Siehe [Block Streaming](#block-streaming)                                                                      |

### Sender Policy

Steuert, wer mit dem Bot interagieren darf:

- **`allowlist`** (Standard) — Nur Benutzer, die in `allowedUsers` aufgeführt sind, können Nachrichten senden. Andere werden stillschweigend ignoriert.
- **`pairing`** — Unbekannte Absender erhalten einen Pairing-Code. Der Bot-Betreiber genehmigt sie über die CLI, und sie werden einer persistenten Allowlist hinzugefügt. Benutzer in `allowedUsers` überspringen den Pairing-Prozess vollständig. Siehe [DM Pairing](#dm-pairing) unten.
- **`open`** — Jeder kann Nachrichten senden. Mit Vorsicht verwenden.

### Session Scope

Steuert, wie Konversations-Sessions verwaltet werden:

- **`user`** (Standard) — Eine Session pro Benutzer. Alle Nachrichten desselben Benutzers teilen sich eine Konversation.
- **`thread`** — Eine Session pro Thread/Thema. Nützlich für Gruppenchats mit Threads.
- **`single`** — Eine gemeinsame Session für alle Benutzer. Jeder teilt sich dieselbe Konversation.

### Token-Sicherheit

Bot-Tokens sollten nicht direkt in der `settings.json` gespeichert werden. Verwende stattdessen Referenzen auf Umgebungsvariablen:

```json
{
  "token": "$TELEGRAM_BOT_TOKEN"
}
```

Lege das eigentliche Token in deiner Shell-Umgebung oder in einer `.env`-Datei ab, die vor dem Start des Channels geladen wird.

## DM Pairing

Wenn `senderPolicy` auf `"pairing"` gesetzt ist, durchlaufen unbekannte Absender einen Genehmigungsprozess:

1. Ein unbekannter Benutzer sendet eine Nachricht an den Bot
2. Der Bot antwortet mit einem 8-stelligen Pairing-Code (z. B. `VEQDDWXJ`)
3. Der Benutzer teilt dir (dem Bot-Betreiber) den Code mit
4. Du genehmigst ihn über die CLI:

```bash
qwen channel pairing approve my-channel VEQDDWXJ
```

Nach der Genehmigung wird die Benutzer-ID in `~/.qwen/channels/<name>-allowlist.json` gespeichert und alle zukünftigen Nachrichten werden normal verarbeitet.

### Pairing-CLI-Befehle

```bash
# Ausstehende Pairing-Anfragen auflisten
qwen channel pairing list my-channel

# Anfrage per Code genehmigen
qwen channel pairing approve my-channel <CODE>
```

### Pairing-Regeln

- Codes bestehen aus 8 Großbuchstaben und verwenden ein eindeutiges Alphabet (keine `0`/`O`/`1`/`I`)
- Codes laufen nach 1 Stunde ab
- Maximal 3 ausstehende Anfragen pro Channel gleichzeitig — weitere Anfragen werden ignoriert, bis eine abläuft oder genehmigt wird
- Benutzer, die in `allowedUsers` in der `settings.json` aufgeführt sind, überspringen das Pairing immer
- Genehmigte Benutzer werden in `~/.qwen/channels/<name>-allowlist.json` gespeichert — behandle diese Datei als vertraulich

## Gruppenchats

Standardmäßig funktioniert der Bot nur in Direktnachrichten. Um die Unterstützung für Gruppenchats zu aktivieren, setze `groupPolicy` auf `"allowlist"` oder `"open"`.

### Group Policy

Steuert, ob der Bot überhaupt an Gruppenchats teilnimmt:

- **`disabled`** (Standard) — Der Bot ignoriert alle Gruppennachrichten. Sicherste Option.
- **`allowlist`** — Der Bot antwortet nur in Gruppen, die explizit in `groups` nach Chat-ID aufgeführt sind. Der Schlüssel `"*"` liefert Standardeinstellungen, fungiert aber **nicht** als Wildcard-Freigabe.
- **`open`** — Der Bot antwortet in allen Gruppen, zu denen er hinzugefügt wurde. Mit Vorsicht verwenden.

### Mention Gating

In Gruppen erfordert der Bot standardmäßig ein `@mention` oder eine Antwort auf eine seiner Nachrichten. Dies verhindert, dass der Bot auf jede Nachricht in einem Gruppenchat antwortet.

Konfiguriere dies pro Gruppe mit der `groups`-Einstellung:

```json
{
  "groups": {
    "*": { "requireMention": true },
    "-100123456": { "requireMention": false }
  }
}
```

- **`"*"`** — Standardeinstellungen für alle Gruppen. Legt nur Konfigurationsstandards fest, kein Allowlist-Eintrag.
- **Gruppen-Chat-ID** — Überschreibt Einstellungen für eine bestimmte Gruppe. Überschreibt die `"*"`-Standards.
- **`requireMention`** (Standard: `true`) — Wenn `true`, antwortet der Bot nur auf Nachrichten, die ihn @erwähnen oder auf eine seiner Nachrichten antworten. Wenn `false`, antwortet der Bot auf alle Nachrichten (nützlich für dedizierte Task-Gruppen).

### Auswertung von Gruppennachrichten

```
1. groupPolicy — ist diese Gruppe erlaubt?           (nein → ignorieren)
2. requireMention — wurde der Bot erwähnt/angeantwortet? (nein → ignorieren)
3. senderPolicy — ist dieser Absender genehmigt?         (nein → Pairing-Prozess)
4. Route to session
```

### Telegram-Einrichtung für Gruppen

1. Füge den Bot zu einer Gruppe hinzu
2. **Deaktiviere den Privacy-Modus** in BotFather (`/mybots` → Bot Settings → Group Privacy → Turn Off) — andernfalls sieht der Bot keine Nachrichten ohne Befehle
3. **Entferne und füge den Bot erneut** zur Gruppe hinzu, nachdem du den Privacy-Modus geändert hast (Telegram cached diese Einstellung)

### Gruppen-Chat-ID ermitteln

So findest du die Chat-ID einer Gruppe für die `groups`-Allowlist:

1. Stoppe den Bot, falls er läuft
2. Sende eine Nachricht in der Gruppe, die den Bot erwähnt
3. Verwende die Telegram Bot API, um ausstehende Updates zu prüfen:

```bash
curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates" | python3 -m json.tool
```

Suche nach `message.chat.id` in der Antwort — Gruppen-IDs sind negative Zahlen (z. B. `-5170296765`).

## Medienunterstützung

Channels unterstützen das Senden von Bildern und Dateien an den Agenten, nicht nur Text.

### Bilder

Sende ein Foto an den Bot und der Agent kann es sehen – nützlich zum Teilen von Screenshots, Fehlermeldungen oder Diagrammen. Das Bild wird direkt als Vision-Input an das Modell gesendet.

Um die Bildunterstützung zu nutzen, konfiguriere ein multimodales Modell für den Channel:

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
```

### Dateien

Sende ein Dokument (PDF, Code-Datei, Textdatei usw.) an den Bot. Die Datei wird heruntergeladen und in einem temporären Verzeichnis gespeichert. Der Agent erhält den Dateipfad, sodass er den Inhalt mit seinen Datei-Lese-Tools lesen kann.

Dateien funktionieren mit jedem Modell – keine multimodale Unterstützung erforderlich.

### Plattformunterschiede

| Feature  | Telegram                                     | WeChat                           | DingTalk                                      |
| -------- | -------------------------------------------- | -------------------------------- | --------------------------------------------- |
| Bilder   | Direkter Download über Bot API                  | CDN-Download mit AES-Entschlüsselung | downloadCode API (zweistufig)                   |
| Dateien  | Direkter Download über Bot API (20-MB-Limit)     | CDN-Download mit AES-Entschlüsselung | downloadCode API (zweistufig)                   |
| Beschriftungen | Foto-/Datei-Beschriftungen als Nachrichtentext enthalten | Nicht zutreffend                   | Rich Text: gemischter Text + Bilder in einer Nachricht |

## Dispatch Modes

Steuert, was passiert, wenn du eine neue Nachricht sendest, während der Bot noch eine vorherige verarbeitet.

- **`steer`** (Standard) — Der Bot bricht die aktuelle Anfrage ab und beginnt mit der Verarbeitung deiner neuen Nachricht. Ideal für normale Chats, bei denen eine Folgeanfrage meist bedeutet, dass du den Bot korrigieren oder umlenken möchtest.
- **`collect`** — Deine neuen Nachrichten werden gepuffert. Wenn die aktuelle Anfrage abgeschlossen ist, werden alle gepufferten Nachrichten zu einem einzigen Follow-up-Prompt kombiniert. Gut für asynchrone Workflows, bei denen du Gedanken sammeln möchtest.
- **`followup`** — Jede Nachricht wird in die Warteschlange gestellt und der Reihe nach als eigener, separater Turn verarbeitet. Nützlich für Batch-Workflows, bei denen jede Nachricht unabhängig ist.

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

Du kannst den Dispatch-Modus auch pro Gruppe festlegen und damit den Channel-Standard überschreiben:

```json
{
  "groups": {
    "*": { "requireMention": true, "dispatchMode": "steer" },
    "-100123456": { "dispatchMode": "collect" }
  }
}
```

## Block Streaming

Standardmäßig arbeitet der Agent eine Weile und sendet dann eine einzige große Antwort. Mit aktiviertem Block Streaming trifft die Antwort als mehrere kürzere Nachrichten ein, während der Agent noch arbeitet – ähnlich wie ChatGPT oder Claude progressive Ausgaben anzeigen.

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

### Funktionsweise

- Die Antwort des Agenten wird an Absatzgrenzen in Blöcke aufgeteilt und als separate Nachrichten gesendet
- `minChars` (Standard 400) — Ein Block wird erst gesendet, wenn er mindestens diese Länge erreicht, um das Senden winziger Nachrichten zu vermeiden
- `maxChars` (Standard 1000) — Wenn ein Block diese Länge ohne natürlichen Umbruch erreicht, wird er trotzdem gesendet
- `idleMs` (Standard 1500) — Wenn der Agent pausiert (z. B. beim Ausführen eines Tools), wird der bisherige Puffer gesendet
- Wenn der Agent fertig ist, wird verbleibender Text sofort gesendet

Nur `blockStreaming` ist erforderlich. Die Chunk- und Coalesce-Einstellungen sind optional und haben sinnvolle Standardwerte.

## Slash Commands

Channels unterstützen Slash Commands. Diese werden lokal verarbeitet (kein Roundtrip zum Agenten):

- `/help` — Verfügbare Befehle auflisten
- `/clear` — Deine Session löschen und neu beginnen (Aliase: `/reset`, `/new`)
- `/status` — Session-Info und Zugriffsrichtlinie anzeigen

Alle anderen Slash Commands (z. B. `/compress`, `/summary`) werden an den Agenten weitergeleitet.

Diese Befehle funktionieren bei allen Channel-Typen (Telegram, WeChat, DingTalk).

## Ausführung

```bash
# Alle konfigurierten Channels starten (gemeinsamer Agent-Prozess)
qwen channel start

# Einen einzelnen Channel starten
qwen channel start my-channel

# Prüfen, ob der Dienst läuft
qwen channel status

# Den laufenden Dienst stoppen
qwen channel stop
```

Der Bot läuft im Vordergrund. Drücke `Strg+C` zum Stoppen oder verwende `qwen channel stop` in einem anderen Terminal.

### Multi-Channel-Modus

Wenn du `qwen channel start` ohne Namen ausführst, starten alle in der `settings.json` definierten Channels gemeinsam und teilen sich einen einzigen Agent-Prozess. Jeder Channel verwaltet seine eigenen Sessions – ein Telegram-Benutzer und ein WeChat-Benutzer erhalten separate Konversationen, auch wenn sie denselben Agenten nutzen.

Jeder Channel verwendet sein eigenes `cwd` aus der Konfiguration, sodass verschiedene Channels gleichzeitig an unterschiedlichen Projekten arbeiten können.

### Dienstverwaltung

Der Channel-Dienst verwendet eine PID-Datei (`~/.qwen/channels/service.pid`), um die laufende Instanz zu verfolgen:

- **Vermeidung von Duplikaten**: Wenn du `qwen channel start` ausführst, während ein Dienst bereits läuft, wird ein Fehler angezeigt, anstatt eine zweite Instanz zu starten
- **`qwen channel stop`**: Stoppt den laufenden Dienst ordnungsgemäß von einem anderen Terminal aus
- **`qwen channel status`**: Zeigt an, ob der Dienst läuft, seine Laufzeit und die Anzahl der Sessions pro Channel

### Crash Recovery

Wenn der Agent-Prozess unerwartet abstürzt, startet der Channel-Dienst ihn automatisch neu und versucht, alle aktiven Sessions wiederherzustellen. Benutzer können ihre Konversationen fortsetzen, ohne von vorne beginnen zu müssen.

- Sessions werden während der Laufzeit des Dienstes in `~/.qwen/channels/sessions.json` persistiert
- Bei einem Absturz: Der Agent startet innerhalb von 3 Sekunden neu und lädt die gespeicherten Sessions
- Nach 3 aufeinanderfolgenden Abstürzen beendet sich der Dienst mit einem Fehler
- Bei einem sauberen Herunterfahren (Strg+C oder `qwen channel stop`): Session-Daten werden gelöscht – der nächste Start ist immer frisch