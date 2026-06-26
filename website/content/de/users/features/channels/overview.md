# Kanäle

Kanäle ermöglichen dir die Interaktion mit einem Qwen Code Agenten über Messaging-Plattformen wie Telegram, WeChat, QQ oder DingTalk – statt über das Terminal. Du sendest Nachrichten von deiner Telefon- oder Desktop-Chat-App, und der Agent antwortet genauso wie in der CLI.

## Funktionsweise

Wenn du `qwen channel start` ausführst, macht Qwen Code Folgendes:

1. Liest die Kanalkonfigurationen aus deiner `settings.json`
2. Startet einen einzelnen Agentenprozess über das [Agent Client Protocol (ACP)](../../../developers/architecture.md)
3. Verbindet sich mit jeder Messaging-Plattform und beginnt, auf Nachrichten zu lauschen
4. Leitet eingehende Nachrichten an den Agenten weiter und sendet Antworten zurück an den richtigen Chat

Alle Kanäle teilen sich einen Agentenprozess mit isolierten Sitzungen pro Benutzer. Jeder Kanal kann sein eigenes Arbeitsverzeichnis, Modell und eigene Anweisungen haben.

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

| Option                   | Erforderlich | Beschreibung                                                                                                                                                        |
| ------------------------ | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`                   | Ja           | Kanaltyp: `telegram`, `weixin`, `qq`, `dingtalk`, `feishu` oder ein benutzerdefinierter Typ aus einer Erweiterung (siehe [Plugins](./plugins))                       |
| `token`                  | Telegram     | Bot-Token. Unterstützt die `$ENV_VAR`-Syntax zum Lesen aus Umgebungsvariablen. Nicht benötigt für WeChat oder DingTalk                                                |
| `clientId`               | DingTalk     | DingTalk AppKey. Unterstützt die `$ENV_VAR`-Syntax                                                                                                                  |
| `clientSecret`           | DingTalk     | DingTalk AppSecret. Unterstützt die `$ENV_VAR`-Syntax                                                                                                               |
| `model`                  | Nein         | Zu verwendendes Modell für diesen Kanal (z. B. `qwen3.5-plus`). Überschreibt das Standardmodell. Nützlich für multimodale Modelle, die Bildeingabe unterstützen        |
| `senderPolicy`           | Nein         | Wer mit dem Bot sprechen darf: `allowlist` (Standard), `open` oder `pairing`                                                                                       |
| `allowedUsers`           | Nein         | Liste der Benutzer-IDs, die den Bot verwenden dürfen (wird von `allowlist`- und `pairing`-Richtlinien verwendet)                                                     |
| `sessionScope`           | Nein         | Bereich der Sitzungen: `user` (Standard), `thread` oder `single`                                                                                                   |
| `cwd`                    | Nein         | Arbeitsverzeichnis für den Agenten. Standardmäßig das aktuelle Verzeichnis                                                                                         |
| `instructions`           | Nein         | Benutzerdefinierte Anweisungen, die jeder ersten Nachricht einer Sitzung vorangestellt werden                                                                      |
| `groupPolicy`            | Nein         | Gruppenchat-Zugriff: `disabled` (Standard), `allowlist` oder `open`. Siehe [Gruppenchats](#gruppenchats)                                                             |
| `groups`                 | Nein         | Pro-Gruppe-Einstellungen. Schlüssel sind Gruppenchat-IDs oder `"*"` für Standardeinstellungen. Siehe [Gruppenchats](#gruppenchats)                                     |
| `dispatchMode`           | Nein         | Was passiert, wenn du eine Nachricht sendest, während der Bot beschäftigt ist: `steer` (Standard), `collect` oder `followup`. Siehe [Dispatch-Modi](#dispatch-modi) |
| `blockStreaming`         | Nein         | Schrittweise Antwortauslieferung: `on` oder `off` (Standard). Siehe [Block-Streaming](#block-streaming)                                                              |
| `blockStreamingChunk`    | Nein         | Grenzen für Blockgrößen: `{ "minChars": 400, "maxChars": 1000 }`. Siehe [Block-Streaming](#block-streaming)                                                          |
| `blockStreamingCoalesce` | Nein         | Leerlauf-Flush: `{ "idleMs": 1500 }`. Siehe [Block-Streaming](#block-streaming)                                                                                     |

### Sender-Richtlinie

Steuert, wer mit dem Bot interagieren kann:

- **`allowlist`** (Standard) – Nur in `allowedUsers` aufgeführte Benutzer können Nachrichten senden. Andere werden still ignoriert.
- **`pairing`** – Unbekannte Absender erhalten einen Pairing-Code. Der Bot-Betreiber genehmigt sie über die CLI und sie werden einer dauerhaften Whitelist hinzugefügt. In `allowedUsers` aufgeführte Benutzer überspringen das Pairing vollständig. Siehe [DM-Pairing](#dm-pairing) unten.
- **`open`** – Jeder kann Nachrichten senden. Mit Vorsicht verwenden.

### Sitzungsbereich

Steuert, wie Gesprächssitzungen verwaltet werden:

- **`user`** (Standard) – Eine Sitzung pro Benutzer. Alle Nachrichten desselben Benutzers teilen eine Unterhaltung.
- **`thread`** – Eine Sitzung pro Thread/Thema. Nützlich für Gruppenchats mit Threads.
- **`single`** – Eine gemeinsame Sitzung für alle Benutzer. Alle teilen sich dieselbe Unterhaltung.

### Token-Sicherheit

Bot-Token sollten nicht direkt in der `settings.json` gespeichert werden. Verwende stattdessen Umgebungsvariablen-Referenzen:

```json
{
  "token": "$TELEGRAM_BOT_TOKEN"
}
```

Setze das eigentliche Token in deiner Shell-Umgebung oder in einer `.env`-Datei, die vor dem Start des Kanals geladen wird.

## DM-Pairing

Wenn `senderPolicy` auf `"pairing"` gesetzt ist, durchlaufen unbekannte Absender einen Genehmigungsprozess:

1. Ein unbekannter Benutzer sendet eine Nachricht an den Bot
2. Der Bot antwortet mit einem 8-stelligen Pairing-Code (z. B. `VEQDDWXJ`)
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

# Eine Anfrage per Code genehmigen
qwen channel pairing approve my-channel <CODE>
```

### Pairing-Regeln

- Codes sind 8 Zeichen lang, Großbuchstaben, mit einem eindeutigen Alphabet (keine `0`/`O`/`1`/`I`)
- Codes verfallen nach 1 Stunde
- Maximal 3 ausstehende Anfragen pro Kanal gleichzeitig – weitere Anfragen werden ignoriert, bis eine verfällt oder genehmigt wird
- In `settings.json` unter `allowedUsers` aufgeführte Benutzer überspringen das Pairing immer
- Genehmigte Benutzer werden in `~/.qwen/channels/<name>-allowlist.json` gespeichert – behandle diese Datei als sensibel

## Gruppenchats

Standardmäßig funktioniert der Bot nur in Direktnachrichten. Um Gruppenchat-Unterstützung zu aktivieren, setze `groupPolicy` auf `"allowlist"` oder `"open"`.

### Gruppenrichtlinie

Steuert, ob der Bot überhaupt an Gruppenchats teilnimmt:

- **`disabled`** (Standard) – Der Bot ignoriert alle Gruppennachrichten. Sicherste Option.
- **`allowlist`** – Der Bot antwortet nur in Gruppen, die explizit unter `groups` mit Chat-ID aufgeführt sind. Der Schlüssel `"*"` legt Standardeinstellungen fest, fungiert aber **nicht** als Wildcard-Erlaubnis.
- **`open`** – Der Bot antwortet in allen Gruppen, denen er hinzugefügt wurde. Mit Vorsicht verwenden.

### Erwähnungsregelung

In Gruppen erfordert der Bot standardmäßig eine `@-Erwähnung` oder eine Antwort auf eine seiner Nachrichten. Dies verhindert, dass der Bot auf jede Nachricht in einem Gruppenchat antwortet.

Konfiguriere pro Gruppe mit der `groups`-Einstellung:

```json
{
  "groups": {
    "*": { "requireMention": true },
    "-100123456": { "requireMention": false }
  }
}
```

- **`"*"`** – Standardeinstellungen für alle Gruppen. Legt nur Konfigurationsstandards fest, kein Eintrag in der Whitelist.
- **Gruppenchat-ID** – Überschreibt Einstellungen für eine bestimmte Gruppe. Überschreibt die `"*"`-Standards.
- **`requireMention`** (Standard: `true`) – Wenn `true`, antwortet der Bot nur auf Nachrichten, die den Bot @-erwähnen oder auf eine seiner Nachrichten antworten. Wenn `false`, antwortet der Bot auf alle Nachrichten (nützlich für dedizierte Aufgabengruppen).

### Wie Gruppennachrichten ausgewertet werden

```
1. groupPolicy – ist diese Gruppe erlaubt?           (nein → ignorieren)
2. requireMention – wurde der Bot erwähnt/beantwortet? (nein → ignorieren)
3. senderPolicy – ist dieser Absender genehmigt?     (nein → Pairing-Vorgang)
4. An Sitzung weiterleiten
```

### Telegram-Einrichtung für Gruppen

1. Füge den Bot einer Gruppe hinzu
2. **Deaktiviere den Privatsphärenmodus** in BotFather (`/mybots` → Bot Settings → Group Privacy → Turn Off) – sonst sieht der Bot keine Nicht-Befehls-Nachrichten
3. **Entferne den Bot und füge ihn erneut** hinzu, nachdem du den Privatsphärenmodus geändert hast (Telegram speichert diese Einstellung zwischen)

### Finden einer Gruppen-Chat-ID

So findest du die Chat-ID einer Gruppe für die `groups`-Whitelist:

1. Stoppe den Bot, falls er läuft
2. Sende eine Nachricht mit Erwähnung des Bots in der Gruppe
3. Verwende die Telegram Bot API, um ausstehende Updates zu prüfen:

```bash
curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates" | python3 -m json.tool
```

Suche im Antworttext nach `message.chat.id` – Gruppen-IDs sind negative Zahlen (z. B. `-5170296765`).

## Medienunterstützung

Kanäle unterstützen das Senden von Bildern und Dateien an den Agenten, nicht nur Text.

### Bilder

Sende ein Foto an den Bot, und der Agent sieht es – nützlich zum Teilen von Screenshots, Fehlermeldungen oder Diagrammen. Das Bild wird direkt als Vision-Eingabe an das Modell gesendet.

Um die Bildunterstützung zu nutzen, konfiguriere ein multimodales Modell für den Kanal:

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

Sende ein Dokument (PDF, Codedatei, Textdatei usw.) an den Bot. Die Datei wird heruntergeladen und in einem temporären Verzeichnis gespeichert. Der Agent erhält den Dateipfad, sodass er den Inhalt mit seinen Dateilesewerkzeugen lesen kann.

Dateien funktionieren mit jedem Modell – keine multimodale Unterstützung erforderlich.

### Plattformunterschiede

| Funktion | Telegram                                     | WeChat                           | DingTalk                                      |
| -------- | -------------------------------------------- | -------------------------------- | --------------------------------------------- |
| Bilder   | Direkter Download über Bot API               | CDN-Download mit AES-Entschlüsselung | downloadCode API (zweistufig)                 |
| Dateien  | Direkter Download über Bot API (20 MB-Limit) | CDN-Download mit AES-Entschlüsselung | downloadCode API (zweistufig)                 |
| Bildunterschriften | Bild-/Dateiunterschriften als Nachrichtentext enthalten | Nicht zutreffend               | Rich Text: gemischter Text + Bilder in einer Nachricht |

## Dispatch-Modi

Steuert, was passiert, wenn du eine neue Nachricht sendest, während der Bot noch eine vorherige verarbeitet.

- **`steer`** (Standard) – Der Bot bricht die aktuelle Anfrage ab und beginnt mit der Bearbeitung deiner neuen Nachricht. Am besten für normale Chats, bei denen eine Folgenachricht normalerweise bedeutet, dass du den Bot korrigieren oder umleiten möchtest.
- **`collect`** – Deine neuen Nachrichten werden gepuffert. Wenn die aktuelle Anfrage abgeschlossen ist, werden alle gepufferten Nachrichten zu einer einzigen Folgeaufforderung kombiniert. Gut für asynchrone Arbeitsabläufe, bei denen du Gedanken in eine Warteschlange stellen möchtest.
- **`followup`** – Jede Nachricht wird in der Reihenfolge als eigener separater Durchgang in die Warteschlange gestellt und verarbeitet. Nützlich für Batch-Workflows, bei denen jede Nachricht unabhängig ist.

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

Du kannst den Dispatch-Modus auch pro Gruppe festlegen, wobei der Kanalstandard überschrieben wird:

```json
{
  "groups": {
    "*": { "requireMention": true, "dispatchMode": "steer" },
    "-100123456": { "dispatchMode": "collect" }
  }
}
```

## Block-Streaming

Standardmäßig arbeitet der Agent eine Weile und sendet dann eine große Antwort. Mit aktiviertem Block-Streaming wird die Antwort in mehreren kürzeren Nachrichten gesendet, während der Agent noch arbeitet – ähnlich wie ChatGPT oder Claude progressive Ausgaben zeigen.

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
- `minChars` (Standard 400) – sende einen Block erst, wenn er mindestens diese Länge hat, um das Spammen kleiner Nachrichten zu vermeiden
- `maxChars` (Standard 1000) – wenn ein Block diese Länge ohne natürliche Unterbrechung erreicht, sende ihn trotzdem
- `idleMs` (Standard 1500) – wenn der Agent eine Pause macht (z. B. ein Werkzeug ausführt), sende den bisher gepufferten Text
- Wenn der Agent fertig ist, wird der verbleibende Text sofort gesendet

Nur `blockStreaming` ist erforderlich. Die Chunk- und Coalesce-Einstellungen sind optional und haben sinnvolle Standardwerte.

## Slash-Befehle

Kanäle unterstützen Slash-Befehle. Diese werden lokal verarbeitet (kein Agenten-Roundtrip):

- `/help` – Verfügbare Befehle auflisten
- `/clear` – Deine Sitzung löschen und neu beginnen (Aliase: `/reset`, `/new`)
- `/status` – Sitzungsinfo und Zugriffsrichtlinie anzeigen

Alle anderen Slash-Befehle (z. B. `/compress`, `/summary`) werden an den Agenten weitergeleitet.

Diese Befehle funktionieren auf allen Kanaltypen (Telegram, WeChat, QQ, DingTalk).

## Ausführen

```bash
# Alle konfigurierten Kanäle starten (gemeinsamer Agentenprozess)
qwen channel start

# Einen einzelnen Kanal starten
qwen channel start my-channel

# Prüfen, ob der Dienst läuft
qwen channel status

# Den laufenden Dienst stoppen
qwen channel stop
```

Der Bot läuft im Vordergrund. Drücke `Ctrl+C` zum Stoppen oder verwende `qwen channel stop` von einem anderen Terminal aus.

### Mehrkanal-Modus

Wenn du `qwen channel start` ohne Namen ausführst, werden alle in der `settings.json` definierten Kanäle gemeinsam gestartet und teilen sich einen einzelnen Agentenprozess. Jeder Kanal behält seine eigenen Sitzungen – ein Telegram-Benutzer und ein WeChat-Benutzer erhalten separate Unterhaltungen, auch wenn sie denselben Agenten gemeinsam nutzen.

Jeder Kanal verwendet sein eigenes `cwd` aus seiner Konfiguration, sodass verschiedene Kanäle gleichzeitig an verschiedenen Projekten arbeiten können.

### Dienstverwaltung

Der Kanaldienst verwendet eine PID-Datei (`~/.qwen/channels/service.pid`), um die ausgeführte Instanz zu verfolgen:

- **Doppelerkennung**: Das Ausführen von `qwen channel start`, während bereits ein Dienst läuft, zeigt einen Fehler an, anstatt eine zweite Instanz zu starten
- **`qwen channel stop`**: Beendet den laufenden Dienst ordnungsgemäß von einem anderen Terminal aus
- **`qwen channel status`**: Zeigt an, ob der Dienst läuft, seine Betriebszeit und die Anzahl der Sitzungen pro Kanal

### Absturzwiederherstellung

Wenn der Agentenprozess unerwartet abstürzt, startet der Kanaldienst ihn automatisch neu und versucht, alle aktiven Sitzungen wiederherzustellen. Benutzer können ihre Unterhaltungen fortsetzen, ohne neu beginnen zu müssen.

- Sitzungen werden während des Dienstbetriebs in `~/.qwen/channels/sessions.json` gespeichert
- Bei Absturz: Der Agent startet innerhalb von 3 Sekunden neu und lädt die gespeicherten Sitzungen neu
- Nach 3 aufeinanderfolgenden Abstürzen beendet sich der Dienst mit einem Fehler
- Bei sauberem Herunterfahren (Strg+C oder `qwen channel stop`): Sitzungsdaten werden gelöscht – der nächste Start erfolgt immer frisch