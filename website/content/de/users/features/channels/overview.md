# Channels

Channels ermöglichen es dir, über Messaging-Plattformen wie Telegram, WeChat, QQ, DingTalk oder Feishu mit einem Qwen Code Agenten zu interagieren, anstatt über das Terminal. Du sendest Nachrichten von deinem Smartphone oder deiner Desktop-Chat-App, und der Agent antwortet genauso wie in der CLI.

## Funktionsweise

Wenn du `qwen channel start` ausführst, macht Qwen Code Folgendes:

1. Liest die Channel-Konfigurationen aus deiner `settings.json`
2. Startet einen einzigen Agenten-Prozess über das [Agent Client Protocol (ACP)](../../../developers/architecture.md)
3. Verbindet sich mit jeder Messaging-Plattform und beginnt, auf Nachrichten zu lauschen
4. Leitet eingehende Nachrichten an den Agenten weiter und sendet Antworten zurück an den richtigen Chat

Alle Channels teilen sich einen Agenten-Prozess mit isolierten Sessions pro Benutzer. Jeder Channel kann sein eigenes Arbeitsverzeichnis, Modell und eigene Instruktionen haben.

## Schnellstart

1. Richte einen Bot auf deiner Messaging-Plattform ein (siehe channel-spezifische Anleitungen: [Telegram](./telegram), [WeChat](./weixin), [QQ Bot](./qqbot), [DingTalk](./dingtalk), [Feishu](./feishu))
2. Füge die Channel-Konfiguration zu `~/.qwen/settings.json` hinzu
3. Führe `qwen channel start` aus, um alle Channels zu starten, oder `qwen channel start <name>` für einen einzelnen Channel

Möchtest du eine Plattform anbinden, die nicht nativ unterstützt wird? Siehe [Plugins](./plugins), um einen eigenen Adapter als Erweiterung hinzuzufügen.

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

| Option                   | Required         | Description                                                                                                                                                            |
| ------------------------ | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`                   | Yes              | Channel-Typ: `telegram`, `weixin`, `qq`, `dingtalk`, `feishu` oder ein benutzerdefinierter Typ aus einer Erweiterung (siehe [Plugins](./plugins))                                          |
| `token`                  | Telegram         | Bot-Token. Unterstützt die `$ENV_VAR`-Syntax zum Lesen aus Umgebungsvariablen. Nicht erforderlich für WeChat, DingTalk oder Feishu                                                   |
| `clientId`               | DingTalk, Feishu | DingTalk AppKey oder Feishu App ID. Unterstützt die `$ENV_VAR`-Syntax                                                                                                           |
| `clientSecret`           | DingTalk, Feishu | DingTalk AppSecret oder Feishu App Secret. Unterstützt die `$ENV_VAR`-Syntax                                                                                                    |
| `model`                  | No               | Modell, das für diesen Channel verwendet werden soll (z. B. `qwen3.5-plus`). Überschreibt das Standardmodell. Nützlich für multimodale Modelle, die Bildeingaben unterstützen                               |
| `senderPolicy`           | No               | Wer mit dem Bot kommunizieren kann: `allowlist` (Standard), `open` oder `pairing`                                                                                                   |
| `allowedUsers`           | No               | Liste der Benutzer-IDs, die den Bot verwenden dürfen (wird von den Richtlinien `allowlist` und `pairing` verwendet)                                                                                   |
| `sessionScope`           | No               | Wie Sessions abgegrenzt werden: `user` (Standard), `thread` oder `single`                                                                                                       |
| `cwd`                    | No               | Arbeitsverzeichnis für den Agenten. Standardmäßig das aktuelle Verzeichnis                                                                                                     |
| `instructions`           | No               | Benutzerdefinierte Instruktionen, die der ersten Nachricht jeder Session vorangestellt werden                                                                                                     |
| `groupPolicy`            | No               | Gruppenchat-Zugriff: `disabled` (Standard), `allowlist` oder `open`. Siehe [Group Chats](#group-chats)                                                                       |
| `groupHistoryLimit`      | No               | Optionales Nachladen der Gruppenhistorie. `0` oder weggelassen deaktiviert es. Eine positive Zahl speichert so viele autorisierte, nicht erwähnte Gruppennachrichten für die nächste Bot-Erwähnung/Antwort. |
| `groups`                 | No               | Einstellungen pro Gruppe. Schlüssel sind Gruppenchat-IDs oder `"*"` für Standardwerte. Siehe [Group Chats](#group-chats)                                                                     |
| `dispatchMode`           | No               | Was passiert, wenn du eine Nachricht sendest, während der Bot beschäftigt ist: `steer` (Standard), `collect` oder `followup`. Siehe [Dispatch Modes](#dispatch-modes)                         |
| `blockStreaming`         | No               | Progressive Antwortauslieferung: `on` oder `off` (Standard). Siehe [Block Streaming](#block-streaming)                                                                        |
| `blockStreamingChunk`    | No               | Chunk-Größen-Grenzen: `{ "minChars": 400, "maxChars": 1000 }`. Siehe [Block Streaming](#block-streaming)                                                                    |
| `blockStreamingCoalesce` | No               | Idle-Flush: `{ "idleMs": 1500 }`. Siehe [Block Streaming](#block-streaming)                                                                                              |

### Sender Policy

Steuert, wer mit dem Bot interagieren kann:

- **`allowlist`** (Standard) — Nur Benutzer, die in `allowedUsers` aufgeführt sind, können Nachrichten senden. Andere werden stillschweigend ignoriert.
- **`pairing`** — Unbekannte Absender erhalten einen Pairing-Code. Der Bot-Betreiber genehmigt sie über die CLI, und sie werden zu einer persistenten Allowlist hinzugefügt. Benutzer in `allowedUsers` überspringen das Pairing vollständig. Siehe [DM Pairing](#dm-pairing) unten.
- **`open`** — Jeder kann Nachrichten senden. Mit Vorsicht zu verwenden.

### Session Scope

Steuert, wie Konversations-Sessions verwaltet werden:

- **`user`** (Standard) — Eine Session pro Benutzer. Alle Nachrichten desselben Benutzers teilen sich eine Konversation.
- **`thread`** — Eine Session pro Thread/Thema. Nützlich für Gruppenchats mit Threads.
- **`single`** — Eine gemeinsame Session für alle Benutzer. Alle teilen sich dieselbe Konversation.

### Channel Memory

Channel Memory ermöglicht es einem autorisierten Channel-Mitglied, stabilen Kontext für einen Chat oder Thread zu speichern. Qwen Code injiziert diesen Speicher, wenn eine neue Channel-Session startet, auch nach `/clear`.

Befehle:

- `/remember-channel <text>` speichert eine Memory-Zeile für den aktuellen Chat oder Thread.
- `/channel-memory` zeigt den gespeicherten Speicher für den aktuellen Chat oder Thread an.
- `/forget-channel confirm` löscht den gespeicherten Speicher für den aktuellen Chat oder Thread.

Nur Benutzer, die in `allowedUsers` aufgeführt sind, können Channel Memory lesen, schreiben oder löschen. Wenn `allowedUsers` leer ist, sind Channel-Memory-Befehle für alle deaktiviert.

### Token-Sicherheit

Bot-Tokens sollten nicht direkt in der `settings.json` gespeichert werden. Verwende stattdessen Referenzen auf Umgebungsvariablen:

```json
{
  "token": "$TELEGRAM_BOT_TOKEN"
}
```

Setze das eigentliche Token in deiner Shell-Umgebung oder in einer `.env`-Datei, die vor dem Starten des Channels geladen wird.

## DM Pairing

Wenn `senderPolicy` auf `"pairing"` gesetzt ist, durchlaufen unbekannte Absender einen Genehmigungs-Flow:

1. Ein unbekannter Benutzer sendet eine Nachricht an den Bot
2. Der Bot antwortet mit einem 8-stelligen Pairing-Code (z. B. `VEQDDWXJ`)
3. Der Benutzer teilt den Code mit dir (dem Bot-Betreiber)
4. Du genehmigst ihn über die CLI:

```bash
qwen channel pairing approve my-channel VEQDDWXJ
```

Nach der Genehmigung wird die Benutzer-ID in `~/.qwen/channels/<name>-allowlist.json` gespeichert und alle zukünftigen Nachrichten werden normal durchgelassen.

### Pairing-CLI-Befehle

```bash
# Ausstehende Pairing-Anfragen auflisten
qwen channel pairing list my-channel

# Eine Anfrage per Code genehmigen
qwen channel pairing approve my-channel <CODE>
```

### Pairing-Regeln

- Codes sind 8 Zeichen lang, großgeschrieben und verwenden ein eindeutiges Alphabet (keine `0`/`O`/`1`/`I`)
- Codes laufen nach 1 Stunde ab
- Maximal 3 ausstehende Anfragen pro Channel gleichzeitig — zusätzliche Anfragen werden ignoriert, bis eine abläuft oder genehmigt wird
- Benutzer, die in `allowedUsers` in der `settings.json` aufgeführt sind, überspringen das Pairing immer
- Genehmigte Benutzer werden in `~/.qwen/channels/<name>-allowlist.json` gespeichert — behandle diese Datei als vertraulich

## Gruppenchats

Standardmäßig funktioniert der Bot nur in Direktnachrichten. Um Gruppenchat-Support zu aktivieren, setze `groupPolicy` auf `"allowlist"` oder `"open"`.

### Group Policy

Steuert, ob der Bot überhaupt an Gruppenchats teilnimmt:

- **`disabled`** (Standard) — Der Bot ignoriert alle Gruppennachrichten. Sicherste Option.
- **`allowlist`** — Der Bot antwortet nur in Gruppen, die explizit in `groups` nach Chat-ID aufgeführt sind. Der Schlüssel `"*"` liefert Standardeinstellungen, fungiert aber **nicht** als Wildcard-Erlaubnis.
- **`open`** — Der Bot antwortet in allen Gruppen, zu denen er hinzugefügt wird. Mit Vorsicht zu verwenden.

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

- **`"*"`** — Standardeinstellungen für alle Gruppen. Setzt nur Konfigurations-Standardwerte, keinen Allowlist-Eintrag.
- **Gruppenchat-ID** — Überschreibt Einstellungen für eine bestimmte Gruppe. Überschreibt die `"*"`-Standardwerte.
- **`requireMention`** (Standard: `true`) — Wenn `true`, antwortet der Bot nur auf Nachrichten, die ihn @mentionen oder auf eine seiner Nachrichten antworten. Wenn `false`, antwortet der Bot auf alle Nachrichten (nützlich für dedizierte Aufgaben-Gruppen).

### Group History Backfill

Standardmäßig ignoriert Qwen nicht erwähnte Gruppennachrichten und speichert sie nicht als Session-Turns. Um das nächste `@mention` mit aktuellem Gruppenkontext zu versehen, setze `groupHistoryLimit` auf eine positive Zahl.

```json
{
  "channels": {
    "my-dingtalk": {
      "type": "dingtalk",
      "clientId": "$DINGTALK_CLIENT_ID",
      "clientSecret": "$DINGTALK_CLIENT_SECRET",
      "groupPolicy": "open",
      "groupHistoryLimit": 50,
      "groups": {
        "*": { "requireMention": true },
        "sensitive-group-id": {
          "requireMention": true,
          "groupHistoryLimit": 0
        }
      }
    }
  }
}
```

- Weggelassen oder `0` deaktiviert das Backfill.
- `groupHistoryLimit` auf Gruppenebene überschreibt den Wert auf Channel-Ebene.
- Nur Nachrichten von autorisierten Absendern werden persistiert.
- Nachrichten, die von `groupPolicy` oder der Gruppen-Allowlist abgelehnt werden, werden nicht persistiert.
- Ausstehende Gruppenhistorie wird als lokales JSONL unter `~/.qwen/channels/<channel-name>-group-history.jsonl` oder `$QWEN_HOME/channels/<channel-name>-group-history.jsonl` gespeichert.
- Zwischengespeicherte Nachrichten werden beim nächsten echten Trigger als nicht vertrauenswürdiger Kontext injiziert und nicht als eigenständige Session-Turns geschrieben.

### Auswertung von Gruppennachrichten

```
1. groupPolicy — ist diese Gruppe erlaubt?           (nein → ignorieren)
2. requireMention — wurde der Bot erwähnt/auf ihn geantwortet? (nein → ignorieren)
3. senderPolicy — ist dieser Absender autorisiert?   (nein → Pairing-Flow)
4. An Session weiterleiten
```

### Telegram-Einrichtung für Gruppen

1. Füge den Bot zu einer Gruppe hinzu
2. **Deaktiviere den Privacy Mode** im BotFather (`/mybots` → Bot Settings → Group Privacy → Turn Off) – andernfalls sieht der Bot keine Nicht-Befehls-Nachrichten
3. **Entferne den Bot und füge ihn wieder hinzu**, nachdem du den Privacy Mode geändert hast (Telegram cacht diese Einstellung)

### Gruppenchat-ID finden

So findest du die Chat-ID einer Gruppe für die `groups`-Allowlist:

1. Stoppe den Bot, falls er läuft
2. Sende eine Nachricht, die den Bot in der Gruppe erwähnt
3. Verwende die Telegram Bot API, um ausstehende Updates zu überprüfen:
```bash
curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates" | python3 -m json.tool
```

Suche in der Antwort nach `message.chat.id` — Gruppen-IDs sind negative Zahlen (z. B. `-5170296765`).

## Media-Support

Channels unterstützen das Senden von Bildern und Dateien an den Agenten, nicht nur von Text.

### Bilder

Sende ein Foto an den Bot und der Agent wird es sehen – nützlich zum Teilen von Screenshots, Fehlermeldungen oder Diagrammen. Das Bild wird direkt als Vision-Input an das Modell gesendet.

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

Sende ein Dokument (PDF, Code-Datei, Textdatei usw.) an den Bot. Die Datei wird heruntergeladen und in einem temporären Verzeichnis gespeichert, und der Agent erhält den Dateipfad, sodass er den Inhalt mit seinen File-Reading-Tools lesen kann.

Dateien funktionieren mit jedem Modell – keine multimodale Unterstützung erforderlich.

### Plattformunterschiede

| Feature  | Telegram                                     | WeChat                           | DingTalk                                      | Feishu                                                      |
| -------- | -------------------------------------------- | -------------------------------- | --------------------------------------------- | ----------------------------------------------------------- |
| Bilder   | Direkter Download über die Bot API           | CDN-Download mit AES-Entschlüsselung | downloadCode API (zweistufig)                   | Open API Resources Endpoint (authentifizierter GET, 50-MB-Limit) |
| Dateien  | Direkter Download über die Bot API (20-MB-Limit) | CDN-Download mit AES-Entschlüsselung | downloadCode API (zweistufig)                   | Open API Resources Endpoint (50-MB-Limit)                    |
| Bildunterschriften | Foto-/Datei-Bildunterschriften werden als Nachrichtentext eingefügt | Nicht zutreffend                   | Rich Text: gemischter Text + Bilder in einer Nachricht | Rich Text (`post`): Text wird extrahiert; eingebettete Bilder werden ignoriert |

> Der QQ Bot verarbeitet keine eingehenden Medien – Bild- und Sticker-Nachrichten werden ignoriert, daher gibt es oben keine Zeile für die Medienverarbeitung.

## Dispatch-Modi

Steuert, was passiert, wenn du eine neue Nachricht sendest, während der Bot noch eine vorherige verarbeitet.

- **`steer`** (Standard) – Der Bot bricht die aktuelle Anfrage ab und beginnt mit der Verarbeitung deiner neuen Nachricht. Am besten für normale Chats, wo eine Folge-Nachricht normalerweise bedeutet, dass du den Bot korrigieren oder umleiten möchtest.
- **`collect`** – Deine neuen Nachrichten werden gepuffert. Wenn die aktuelle Anfrage abgeschlossen ist, werden alle gepufferten Nachrichten zu einem einzigen Follow-up-Prompt zusammengefasst. Gut für asynchrone Workflows, bei denen du Gedanken sammeln möchtest.
- **`followup`** – Jede Nachricht wird in die Warteschlange gestellt und der Reihe nach als eigener, separater Turn verarbeitet. Nützlich für Batch-Workflows, bei denen jede Nachricht unabhängig ist.

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

Standardmäßig arbeitet der Agent eine Weile und sendet dann eine einzige große Antwort. Wenn Block Streaming aktiviert ist, trifft die Antwort in mehreren kürzeren Nachrichten ein, während der Agent noch arbeitet – ähnlich wie ChatGPT oder Claude progressive Ausgaben anzeigen.

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
- `minChars` (Standard 400) – Sende einen Block erst, wenn er mindestens diese Länge hat, um Spam durch winzige Nachrichten zu vermeiden
- `maxChars` (Standard 1000) – Wenn ein Block diese Länge ohne natürliche Pause erreicht, wird er trotzdem gesendet
- `idleMs` (Standard 1500) – Wenn der Agent pausiert (z. B. bei der Ausführung eines Tools), sende den bisher gepufferten Inhalt
- Wenn der Agent fertig ist, wird jeglicher verbleibende Text sofort gesendet

Nur `blockStreaming` ist erforderlich. Die Chunk- und Coalesce-Einstellungen sind optional und haben sinnvolle Standardwerte.

## Slash-Befehle

Channels unterstützen Slash-Befehle. Diese werden lokal verarbeitet (kein Agent-Roundtrip):

- `/help` – Verfügbare Befehle auflisten
- `/clear` – Deine Session löschen und neu starten (Aliase: `/reset`, `/new`)
- `/status` – Session-Infos und Zugriffsrichtlinie anzeigen

Alle anderen Slash-Befehle (z. B. `/compress`, `/summary`) werden an den Agenten weitergeleitet.

Diese Befehle funktionieren bei allen Channel-Typen (Telegram, WeChat, QQ, DingTalk, Feishu).

## Ausführen

```bash
# Alle konfigurierten Channels starten (gemeinsamer Agent-Prozess)
qwen channel start

# Einen einzelnen Channel starten
qwen channel start my-channel

# Prüfen, ob der Service läuft
qwen channel status

# Den laufenden Service stoppen
qwen channel stop
```

Der Bot läuft im Vordergrund. Drücke `Strg+C` zum Stoppen oder verwende `qwen channel stop` in einem anderen Terminal.

### Experimenteller Daemon-verwalteter Modus

Du kannst konfigurierte Channels auch unter `qwen serve` ausführen:

```bash
# Einen Channel unter dem Daemon-Lifecycle starten
qwen serve --channel my-channel

# Alle konfigurierten Channels starten
qwen serve --channel all
```

Dieser Modus startet einen Channel-Worker-Prozess, der `qwen serve` gehört. Der Worker verbindet sich über das SDK zurück mit dem Daemon und verwendet dieselben Channel-Adapter. Er ist vom Daemon-Prozess getrennt, sodass ein Absturz eines Channel-Adapters nicht den Daemon zum Absturz bringt.

`qwen serve --channel` ist nicht derselbe Service wie `qwen channel start`. Das eigenständige `qwen channel start` verwendet weiterhin den ACP-gestützten Channel-Service und kann Channel-Konfigurationen mit unterschiedlichen `cwd`-Werten ausführen. Daemon-verwaltete Channels erfordern, dass das `cwd` jedes ausgewählten Channels in den Daemon-Workspace aufgelöst wird.

Wenn Channels über `serve` verwaltet werden, zeigt `qwen channel status` als Owner `qwen serve` an, und `qwen channel stop` weist dich an, den Daemon zu stoppen, anstatt den Worker direkt zu signalisieren. Wenn ein bereiter Worker unerwartet beendet wird, läuft der Daemon weiter und meldet eine Channel-Worker-Warnung in `/daemon/status`.

### Multi-Channel-Modus

Wenn du `qwen channel start` ohne Namen ausführst, starten alle in `settings.json` definierten Channels gemeinsam und teilen sich einen einzigen Agent-Prozess. Jeder Channel verwaltet seine eigenen Sessions – ein Telegram-Nutzer und ein WeChat-Nutzer erhalten separate Unterhaltungen, auch wenn sie sich denselben Agenten teilen.

Jeder Channel verwendet sein eigenes `cwd` aus seiner Konfiguration, sodass verschiedene Channels gleichzeitig an unterschiedlichen Projekten arbeiten können.

### Service-Management

Der Channel-Service verwendet eine PID-Datei (`~/.qwen/channels/service.pid`), um die laufende Instanz zu verfolgen:

- **Duplikatvermeidung**: Das Ausführen von `qwen channel start`, während ein Service bereits läuft, zeigt einen Fehler an, anstatt eine zweite Instanz zu starten
- **`qwen channel stop`**: Stoppt den laufenden Service ordnungsgemäß aus einem anderen Terminal
- **`qwen channel status`**: Zeigt an, ob der Service läuft, seine Uptime und die Session-Anzahlen pro Channel

### Crash-Recovery

Wenn der Agent-Prozess unerwartet abstürzt, startet der Channel-Service ihn automatisch neu und versucht, alle aktiven Sessions wiederherzustellen. Nutzer können ihre Unterhaltungen fortsetzen, ohne von vorne beginnen zu müssen.

- Sessions werden während der Laufzeit des Service in `~/.qwen/channels/sessions.json` persistiert
- Bei einem Absturz: Der Agent startet innerhalb von 3 Sekunden neu und lädt die gespeicherten Sessions
- Nach 3 aufeinanderfolgenden Abstürzen beendet sich der Service mit einem Fehler
- Bei einem sauberen Shutdown (Strg+C oder `qwen channel stop`): Session-Daten werden gelöscht – der nächste Start ist immer frisch