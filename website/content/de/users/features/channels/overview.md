---

---

# Channels

Mit Channels kannst du über Messaging-Plattformen wie Telegram, WeChat, QQ, DingTalk, WeCom oder Feishu mit einem Qwen Code Agenten interagieren, anstatt über das Terminal. Du sendest Nachrichten von deinem Smartphone oder einer Desktop-Chat-App, und der Agent antwortet genauso wie in der CLI.

Code-Hosting-Plattformen (beginnend mit [GitHub](./github)) werden ebenfalls über Polling-Adapter unterstützt – der Agent überwacht Benachrichtigungen und reagiert auf @Erwähnungen bei Issues und Pull Requests.

## Funktionsweise

Wenn du `qwen channel start` ausführst, tut Qwen Code Folgendes:

1. Liest die Channel-Konfigurationen aus deiner `settings.json`
2. Startet einen einzigen Agenten-Prozess unter Verwendung des [Agent Client Protocol (ACP)](../../../developers/architecture.md)
3. Stellt eine Verbindung zu jeder Messaging-Plattform her und beginnt, auf Nachrichten zu warten
4. Leitet eingehende Nachrichten an den Agenten weiter und sendet Antworten zurück an den entsprechenden Chat

Alle Channels teilen sich einen Agenten-Prozess mit isolierten Sessions pro Benutzer. Jeder Channel kann sein eigenes Arbeitsverzeichnis, Modell und eigene Anweisungen haben.

## Schnellstart

1. Richte einen Bot auf deiner Messaging-Plattform ein (siehe channel-spezifische Anleitungen: [Telegram](./telegram), [WeChat](./weixin), [QQ Bot](./qqbot), [DingTalk](./dingtalk), [WeCom](./wecom), [Feishu](./feishu), [GitHub](./github))
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
      "dmPolicy": "open",
      "groups": {
        "*": { "requireMention": true }
      }
    }
  }
}
```

### Optionen

| Option                   | Erforderlich     | Beschreibung                                                                                                                                                            |
| ------------------------ | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`                   | Ja               | Channel-Typ: `telegram`, `weixin`, `qq`, `dingtalk`, `wecom`, `feishu`, `github` oder ein benutzerdefinierter Typ aus einer Erweiterung (siehe [Plugins](./plugins))                       |
| `token`                  | Telegram         | Bot-Token. Unterstützt die `$ENV_VAR`-Syntax zum Lesen aus Umgebungsvariablen. Nicht erforderlich für WeChat, DingTalk, WeCom oder Feishu                                            |
| `clientId`               | DingTalk, Feishu | DingTalk AppKey oder Feishu App ID. Unterstützt die `$ENV_VAR`-Syntax                                                                                                           |
| `clientSecret`           | DingTalk, Feishu | DingTalk AppSecret oder Feishu App Secret. Unterstützt die `$ENV_VAR`-Syntax                                                                                                    |
| `botId`                  | WeCom            | WeCom intelligent robot Bot ID. Unterstützt die `$ENV_VAR`-Syntax. Siehe [WeCom](./wecom)                                                                                       |
| `secret`                 | WeCom            | WeCom intelligent robot Secret. Unterstützt die `$ENV_VAR`-Syntax. Siehe [WeCom](./wecom)                                                                                       |
| `model`                  | Nein             | Modell, das für diesen Channel verwendet werden soll (z. B. `qwen3.5-plus`). Überschreibt das Standardmodell. Nützlich für multimodale Modelle, die Bildeingaben unterstützen                               |
| `senderPolicy`           | Nein             | Wer mit dem Bot kommunizieren kann: `allowlist` (Standard), `open` oder `pairing`                                                                                                   |
| `allowedUsers`           | Nein             | Liste der Benutzer-IDs, die den Bot verwenden dürfen (wird von den Richtlinien `allowlist` und `pairing` verwendet)                                                                                   |
| `sessionScope`           | Nein             | Wie Sessions abgegrenzt werden: `user` (Standard), `chat_thread` oder `single`. Legacy `thread` bleibt kompatibel, wenn bereits konfiguriert, wird aber für neue WebShell-Konfigurationen nicht mehr angeboten |
| `cwd`                    | Nein             | Arbeitsverzeichnis für den Agenten. Standardmäßig das aktuelle Verzeichnis                                                                                                     |
| `approvalMode`           | Nein             | Tool-Genehmigungsmodus für Channel-Sessions. Unbeaufsichtigte Webhook-Tasks erfordern `yolo`; die Einstellung gilt für jede Session auf dem Channel                                  |
| `instructions`           | Nein             | Benutzerdefinierte Anweisungen, die der ersten Nachricht jeder Session vorangestellt werden                                                                                                     |
| `webhooks`               | Nein             | Webhook-Quellen und Zustellziele für daemon-verwaltete Channels. Siehe [Webhook-triggered tasks](#webhook-triggered-tasks)                                              |
| `groupPolicy`            | Nein             | Gruppenchat-Zugriff: `disabled` (Standard), `allowlist`, `pairing` oder `open`. Siehe [Group Chats](#group-chats)                                                                       |
| `dmPolicy`               | Nein             | Private/DM-Zugriff: `open` (Standard) oder `disabled` (alle DMs still verwerfen). Nützlich für Bots nur für Gruppen                                                                  |
| `groupHistoryLimit`      | Nein             | Optionales Nachladen der Gruppenhistorie. `0` oder weggelassen deaktiviert es. Eine positive Zahl speichert so viele nicht erwähnte Gruppennachrichten von autorisierten Absendern oder Mitgliedern genehmigter gepaarter Gruppen für die nächste Bot-Erwähnung/Antwort. |
| `groups`                 | Nein             | Einstellungen pro Gruppe. Schlüssel sind Gruppenchat-IDs oder `"*"` für Standardwerte. Siehe [Group Chats](#group-chats)                                                                     |
| `dispatchMode`           | Nein             | Was passiert, wenn du eine Nachricht sendest, während der Bot beschäftigt ist: `steer` (Standard), `collect` oder `followup`. Siehe [Dispatch Modes](#dispatch-modes)                         |
| `blockStreaming`         | Nein             | Progressive Antwortauslieferung: `on` oder `off` (Standard). Siehe [Block Streaming](#block-streaming)                                                                        |
| `blockStreamingChunk`    | Nein             | Chunk-Größenbegrenzungen: `{ "minChars": 400, "maxChars": 1000 }`. Siehe [Block Streaming](#block-streaming)                                                                    |
| `blockStreamingCoalesce` | Nein             | Idle-Flush: `{ "idleMs": 1500 }`. Siehe [Block Streaming](#block-streaming)                                                                                              |

### Sender-Richtlinie

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

Channel Memory speichert dauerhaften Kontext für einen Chat oder Thread. Einträge haben stabile
IDs, sodass eine Listen-Antwort für deterministische Folgeoperationen verwendet werden kann.

- `记住：默认使用 staging 环境` ist die deterministische Form und speichert genau einen
  Skalareintrag für den aktuellen Chat oder Thread.
- Um mehrere separate Fakten in einer Anfrage zu speichern, verwende eine natürliche Phrase, die
  über den Classifier geleitet wird. Zum Beispiel:
  `请记住这三条约定：使用 staging；发布前测试；优先中文回复` erstellt Einträge,
  die du unabhängig verwalten kannst. Exakte Duplikate werden übersprungen und
  gemeldet, ohne einen weiteren Eintrag zu erstellen. Anfragen, die nach
  Anmeldedaten aussehen, werden abgelehnt; entferne Geheimnisse und speichere die
  nicht sensiblen Fakten separat.
- `查看记忆` listet Einträge und ihre stabilen IDs auf. Verwende `查看第 2 页记忆`, um
  eine spätere Seite anzuzeigen, `查看记忆 <id>`, um einen Eintrag anzuzeigen, oder eine
  natürliche gefilterte Anfrage wie `只看中文偏好`, um die passenden Einträge aufzulisten.
- `查看刚才那条记忆`, `把关于 staging 的记忆改成默认使用 production` und
  `忘掉刚才那条` funktionieren, wenn sich die natürliche Referenz auf genau einen
  Eintrag auflösen lässt. Natürliche Updates und Löschungen zeigen zuerst die
  vorgeschlagene Änderung. Bestätige ein Update mit `确认更新记忆` oder
  `confirm memory update`, oder eine Löschung mit `确认删除记忆` oder
  `confirm memory removal`, innerhalb von 60 Sekunden. Exakte-ID-Updates und
  -Löschungen bleiben sofort und benötigen keine Bestätigung.
- `清空记忆` startet den Alles-löschen-Bestätigungsflow; `确认清空记忆` schließt
  ihn ab.

Wenn eine natürliche Inspektions-, Update- oder Löschanfrage mehrere Einträge trifft,
gibt der Bot die Kandidaten-IDs und Vorschauen zurück, ohne den Memory zu ändern. Es
gibt keine ausstehende Auswahl für ein mehrdeutiges Ergebnis: wiederhole die Anfrage
mit einer exakten ID, wie `忘掉 m-a31f0d82c7e4`. Exakte-ID-Operationen bleiben der
deterministische Schnellpfad. Eine natürliche Anfrage ohne Treffer meldet, dass kein
Eintrag gefunden wurde.

Ausstehende Update-, Lösch- und Alles-löschen-Bestätigungen gelten nur für den Absender und
den Chat oder Thread, der sie erstellt hat. Eine neuere Alles-löschen-, natürliche Update-
oder natürliche Löschvorschlage ersetzt eine ältere ausstehende für denselben Absender und
das selbe Ziel. Ausstehende Bestätigungen werden verworfen, wenn der Channel-Prozess
neu startet.

Die Legacy-Slash-Aliase `/remember-channel`, `/channel-memory` und
`/forget-channel` wurden entfernt. Sie sind keine Channel-Memory-
Befehle mehr.

Channel Memory folgt den Channel-Zugangs-Gates. Jede von `senderPolicy`,
`dmPolicy`, `groupPolicy`, Gruppeneinstellungen, Pairing und Erwähnungs-
Anforderungen akzeptierte Nachricht kann Memory für diesen Chat oder Thread lesen,
schreiben, aktualisieren oder löschen. Akzeptierte Mitglieder derselben Gruppe teilen
sich den Ziel-Speicher der Gruppe. Verwende `allowlist`- oder `pairing`-Richtlinien,
wenn der Gruppen-Memory auf vertrauenswürdige Absender beschränkt sein soll.

Bestehender Legacy-`CHANNEL.md`-Memory wird bei der ersten Mutation automatisch in
strukturierten `CHANNEL.json`-Speicher migriert. Strukturierter Memory bleibt über
Neustarts von eigenständigen Channels und daemon-verwalteten Channels erhalten und
wird injiziert, wenn eine neue zielbereichsbezogene Session startet, auch nach `/clear`.

Nach dieser ersten Injektion ruft jede akzeptierte Nachricht auch bis zu drei
relevante Einträge für diese Nachricht ab. Dies hält dauerhafte Fakten während einer
lang laufenden Session verfügbar, ohne jeden gespeicherten Eintrag zu jedem Turn
hinzuzufügen. Der Abruf basiert auf der aktuellen Nachricht und verändert den
gespeicherten Memory nicht.

Memory bleibt auf den aktuellen Chat oder Thread bezogen. Er wird nicht in einer
`sessionScope: single`-Session injiziert oder abgerufen, da diese Session über den
gesamten Channel geteilt wird und nicht auf ein Ziel bezogen ist.

Channel Memory lernt nicht automatisch Fakten aus normalen Gesprächen und
akzeptiert `第一个` nicht als Bestätigung für eine mehrdeutige natürliche Referenz.
Verwende eine klare Remember-Anfrage und eine exakte Eintrags-ID, wenn eine
natürliche Referenz mehrdeutig ist.

### Token-Sicherheit

Bot-Tokens sollten nicht direkt in der `settings.json` gespeichert werden. Verwende stattdessen Umgebungsvariablen-Referenzen:

```json
{
  "token": "$TELEGRAM_BOT_TOKEN"
}
```

Setze das eigentliche Token in deiner Shell-Umgebung oder in einer `.env`-Datei, die vor dem Starten des Channels geladen wird.

## DM Pairing

Wenn `senderPolicy` auf `"pairing"` gesetzt ist, durchlaufen unbekannte Absender einen Genehmigungsprozess:

1. Ein unbekannter Benutzer sendet eine Nachricht an den Bot
2. Der Bot antwortet mit einem 8-stelligen Pairing-Code (z. B. `VEQDDWXJ`)
3. Der Benutzer teilt den Code dir (dem Bot-Betreiber) mit
4. Du genehmigst ihn über die CLI:

```bash
qwen channel pairing approve my-channel VEQDDWXJ
```

Nach der Genehmigung wird die Benutzer-ID in der workspace-bezogenen Allowlist des Channels gespeichert (`~/.qwen/channels/<workspace-scope>/<name>-allowlist.json`) und alle zukünftigen Nachrichten werden normal durchgelassen. Der Pairing-Status ist pro Workspace bereichsbezogen, sodass zwei Workspaces, die denselben Channel-Namen verwenden, separate Genehmigungen behalten.

### Pairing-CLI-Befehle

```bash
# Ausstehende Pairing-Anfragen auflisten
qwen channel pairing list my-channel

# Eine Anfrage per Code genehmigen
qwen channel pairing approve my-channel <CODE>
```

Führe diese im Workspace-Verzeichnis des Channels aus (oder übergib `--cwd <dir>`) — der Pairing-Status wird pro Workspace gespeichert.

### Pairing-Regeln

- Codes sind 8 Zeichen lang, großgeschrieben und verwenden ein eindeutiges Alphabet (keine `0`/`O`/`1`/`I`)
- Codes laufen nach 1 Stunde ab
- Maximal 3 ausstehende Anfragen pro Channel gleichzeitig und höchstens eine pro Absender — zusätzliche Anfragen werden abgelehnt, bis eine abläuft oder genehmigt wird
- Benutzer, die in `allowedUsers` in der `settings.json` aufgeführt sind, überspringen das Benutzer-Pairing; unter `groupPolicy: "pairing"` muss die Gruppe selbst weiterhin genehmigt werden
- Genehmigte Benutzer werden pro Workspace in `~/.qwen/channels/<workspace-scope>/<name>-allowlist.json` gespeichert — behandle diese Datei als vertraulich

## Gruppenchats

Standardmäßig funktioniert der Bot nur in Direktnachrichten. Um die Gruppenchat-Unterstützung zu aktivieren, setze `groupPolicy` auf `"allowlist"`, `"pairing"` oder `"open"`.

### Gruppenrichtlinie

Steuert, ob der Bot überhaupt an Gruppenchats teilnimmt:

- **`disabled`** (Standard) — Der Bot ignoriert alle Gruppennachrichten. Sicherste Option.
- **`allowlist`** — Der Bot antwortet nur in Gruppen, die explizit in `groups` nach Chat-ID aufgeführt sind. Der Schlüssel `"*"` liefert Standardeinstellungen, fungiert aber **nicht** als Wildcard-Erlaubnis.
- **`pairing`** — Eine bewusste Erwähnung oder Antwort aus einer unbekannten Gruppe erstellt eine Pairing-Anfrage für die Gruppe. Nach der Genehmigung kann jedes Mitglied den Bot in dieser Gruppe verwenden; `senderPolicy` steuert weiterhin Direktnachrichten.
- **`open`** — Der Bot antwortet in allen Gruppen, zu denen er hinzugefügt wird. Mit Vorsicht zu verwenden.

Genehmige eine Gruppe mit demselben CLI-Befehl, der für das Benutzer-Pairing verwendet wird. Die ausstehende Anfrage identifiziert die Gruppe und das Mitglied, das sie initiiert hat:

```bash
qwen channel pairing approve my-channel <CODE>
```

Gruppen-Genehmigungen werden nach der Chat-ID der Gruppe im Workspace-Bereich des Channels gespeichert. Auf GitHub und GitLab ist die Chat-ID der Repository-/Projektpfad, sodass eine Umbenennung oder ein Transfer die gespeicherte Genehmigung ablöst — genehmige die Gruppe nach einer Umbenennung erneut. Ein Repo oder Projekt, das unter demselben Pfad neu erstellt wird, erbt jede veraltete Genehmigung — widerrufe Gruppen-Genehmigungen nach jeder Umbenennung, jedem Transfer oder jeder Löschung.
Eine nicht erwähnte Nachricht erstellt niemals eine Gruppen-Pairing-Anfrage, auch wenn eine Gruppe `requireMention` auf `false` setzt; nach der Genehmigung gilt die konfigurierte Erwähnungsrichtlinie normal.

Gruppen-Pairing-Anfragen teilen sich dieselbe Warteschlange wie DM-Pairing-Anfragen:
ein Channel hat insgesamt höchstens 3 ausstehende Anfragen, und ein Absender hat
höchstens eine ausstehende Anfrage über Benutzer- und Gruppen-Anfragen hinweg (siehe
[Pairing-Regeln](#pairing-regeln)).

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

- **`"*"`** — Standardeinstellungen für alle Gruppen. Setzt nur Konfigurationsstandardwerte, keinen Allowlist-Eintrag.
- **Gruppenchat-ID** — Überschreibt Einstellungen für eine bestimmte Gruppe. Überschreibt die `"*"`-Standardwerte.
- **`requireMention`** (Standard: `true`) — Wenn `true`, antwortet der Bot nur auf Nachrichten, die ihn @mentionen oder auf eine seiner Nachrichten antworten. Wenn `false`, antwortet der Bot auf alle Nachrichten (nützlich für dedizierte Aufgabengruppen).

### Nachladen der Gruppenhistorie

Standardmäßig ignoriert Qwen nicht erwähnte Gruppennachrichten und speichert sie nicht als Session-Turns. Damit das nächste `@mention` den aktuellen Gruppenkontext einschließt, setze `groupHistoryLimit` auf eine positive Zahl.

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

- Weggelassen oder `0` deaktiviert das Nachladen.
- `groupHistoryLimit` auf Gruppenebene überschreibt den Wert auf Channel-Ebene.
- Nur Nachrichten von autorisierten Absendern oder Mitgliedern einer genehmigten gepaarten Gruppe werden persistent gespeichert.
- Nachrichten, die von `groupPolicy` oder der Gruppen-Allowlist abgelehnt werden, werden nicht persistent gespeichert.
- Ausstehende Gruppenhistorie wird als lokales JSONL unter `~/.qwen/channels/<channel-name>-group-history.jsonl` oder `$QWEN_HOME/channels/<channel-name>-group-history.jsonl` gespeichert.
- Zwischengespeicherte Nachrichten werden beim nächsten echten Trigger als nicht vertrauenswürdiger Kontext injiziert und nicht als eigenständige Session-Turns geschrieben.

### Wie Gruppennachrichten ausgewertet werden

```
1. groupPolicy — ist diese Gruppe deaktiviert, aufgelistet, gepaart oder offen? (nein → ignorieren/Pairing-Flow)
2. dmPolicy — ist diese DM erlaubt?                      (disabled → ignorieren)
3. requireMention — wurde der Bot erwähnt/auf ihn geantwortet? (nein → ignorieren)
4. senderPolicy — ist dieser Absender genehmigt?             (übersprungen für eine gepaarte Gruppe; sonst nein → Benutzer-Pairing-Flow)
5. An Session weiterleiten
```

### Telegram-Einrichtung für Gruppen

1. Füge den Bot zu einer Gruppe hinzu
2. **Deaktiviere den Privacy-Modus** im BotFather (`/mybots` → Bot Settings → Group Privacy → Turn Off) — andernfalls sieht der Bot keine Nicht-Befehls-Nachrichten
3. **Entferne den Bot und füge ihn wieder hinzu**, nachdem du den Privacy-Modus geändert hast (Telegram cached diese Einstellung)

### Eine Gruppen-Chat-ID finden

Um die Chat-ID einer Gruppe für die `groups`-Allowlist zu finden:

1. Stoppe den Bot, falls er läuft
2. Sende eine Nachricht mit einer Erwähnung des Bots in der Gruppe
3. Nutze die Telegram Bot API, um wartende Updates zu prüfen:

```bash
curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates" | python3 -m json.tool
```

Suche in der Response nach `message.chat.id` — Gruppen-IDs sind negative Zahlen (z. B. `-5170296765`).

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
| Bilder   | Direkter Download über Bot API               | CDN-Download mit AES-Entschlüsselung | downloadCode API (zweistufig)                 | Open-API-Resources-Endpoint (authentifizierter GET, 50-MB-Limit) |
| Dateien  | Direkter Download über Bot API (20-MB-Limit) | CDN-Download mit AES-Entschlüsselung | downloadCode API (zweistufig)                 | Open-API-Resources-Endpoint (50-MB-Limit)                   |
| Captions | Foto-/Datei-Captions als Nachrichtentext enthalten | Nicht zutreffend               | Rich Text: gemischter Text + Bilder in einer Nachricht | Rich Text (`post`): Text extrahiert; eingebettete Bilder ignoriert |

> QQ Bot verarbeitet keine eingehenden Medien – Bild- und Sticker-Nachrichten werden ignoriert, daher gibt es oben keine Zeile für die Medienverarbeitung.
>
> WeCom akzeptiert Text, Bilder, gemischten Text mit Bildern, Dateien, Videos und Sprachnachrichten (transkribiert). Bilder werden als Anhänge an den Agenten übergeben; Dateien und Videos werden in temporäre lokale Pfade heruntergeladen. Siehe [WeCom](./wecom#images-and-files) für Details.

## Dispatch-Modi

Steuert, was passiert, wenn du eine neue Nachricht sendest, während der Bot noch eine vorherige verarbeitet.

- **`steer`** (Standard) – Der Bot bricht die aktuelle Anfrage ab und beginnt mit der Verarbeitung deiner neuen Nachricht. Am besten für normale Chats, wo ein Follow-up normalerweise bedeutet, dass du den Bot korrigieren oder umleiten möchtest.
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

## Block-Streaming

Standardmäßig arbeitet der Agent eine Weile und sendet dann eine einzige große Response. Wenn Block-Streaming aktiviert ist...


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

- Die Response des Agenten wird an Absatzgrenzen in Blöcke aufgeteilt und als separate Nachrichten gesendet
- `minChars` (Standard 400) – Sende einen Block erst, wenn er mindestens diese Länge hat, um Spam durch winzige Nachrichten zu vermeiden
- `maxChars` (Standard 1000) – Wenn ein Block diese Länge ohne natürliche Pause erreicht, wird er trotzdem gesendet
- `idleMs` (Standard 1500) – Wenn der Agent pausiert (z. B. bei der Ausführung eines Tools), sende den bisher gepufferten Inhalt
- Wenn der Agent fertig ist, wird der restliche Text sofort gesendet

Nur `blockStreaming` ist erforderlich. Die Chunk- und Coalesce-Einstellungen sind optional und haben sinnvolle Standardwerte.

## Scheduled Channel Loops

Channels haben einen persistenten Scheduler für Prompts, die später ausgeführt werden sollen und
ihr Ergebnis zurück in denselben Chat pushen. Du kannst den Agenten natürlich fragen, zum
Beispiel `Every 15 minutes, check the deployment and report any change`, oder die lokalen
Befehle direkt verwenden:

```text
/loop add "*/15 * * * *" check the deployment and report any change
/loop list
/loop inspect <id>
/loop cancel <id>
```

Der Agent verwendet die Tools `channel_loop_create`, `channel_loop_list` und
`channel_loop_cancel`, wenn er diese Jobs für dich verwaltet. Zeitpläne verwenden
Standard-Cron-Ausdrücke mit fünf Feldern in der lokalen Zeit des Rechners. Der Job läuft
unbeaufsichtigt und seine finale Antwort wird automatisch an den Chat zugestellt, der
ihn erstellt hat.

Channel Loops unterscheiden sich von den sessionbezogenen Tasks in
[Run Prompts on a Schedule](../scheduled-tasks):

- Sie werden unter `$QWEN_HOME/channels/` gespeichert – eigenständige Channels verwenden
  `cron.json` direkt, während daemon-verwaltete Channels eine pro-Workspace-Datei
  unter `daemon/` verwenden. Beide überstehen Channel-Neustarts.
- Sie sind auf den aktuellen Channel-Chat oder -Thread bezogen. Jedes Ziel kann bis zu
  10 aktivierte Loops haben, und jeder Prompt ist auf 4.000 Zeichen begrenzt.
- Sie erfordern einen Adapter und ein Ziel, die proaktive Zustellung unterstützen. Telegram,
  DingTalk, Feishu und WeCom sind aktiviert, vorbehaltlich plattformspezifischer
  Zielbeschränkungen.
- Sie sind nicht verfügbar mit `sessionScope: "single"`, da dieser Scope nicht an
  ein Chat-Ziel gebunden ist.
- Ein gespeicherter Loop ist deaktiviert, wenn sein Ziel zum fälligen Zeitpunkt nicht mehr
  autorisiert ist.

## Background Agent Results

Wenn der Agent Arbeit an einen Hintergrund-Subagenten oder Fork delegiert, wird das
Ergebnis zurück an den Channel-Chat zugestellt, dem die Session gehört. Die Zustellung
kann nach dem ursprünglichen Turn erfolgen, also halte den Channel-Service oder
Daemon am Laufen, während Hintergrundarbeit aktiv ist.

## Slash Commands

Channels unterstützen Slash Commands. Diese werden lokal verarbeitet (kein Agent-Roundtrip):

- `/help` – Verfügbare Befehle auflisten
- `/clear` – Deine Session löschen und neu starten (Aliase: `/reset`, `/new`)
- `/status` – Session-Infos und Access-Policy anzeigen
- `/loop add "<cron>" <prompt>` – Einen persistenten geplanten Channel-Loop erstellen
- `/loop list` – Loops für den aktuellen Chat auflisten
- `/loop inspect <id>` – Loop-Status und Run-Details anzeigen
- `/loop cancel <id>` – Einen Loop deaktivieren

Alle anderen Slash Commands (z. B. `/compress`, `/summary`) werden an den Agenten weitergeleitet.

Diese Befehle funktionieren bei allen Channel-Typen (Telegram, WeChat, QQ, DingTalk, WeCom, Feishu, GitHub), wobei die Loop-Erstellung auch die proaktive Zustellungsunterstützung für den aktuellen Adapter und das aktuelle Ziel erfordert.

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

### Experimenteller daemon-verwalteter Modus

Du kannst konfigurierte Channels auch unter `qwen serve` ausführen:

```bash
# Einen Channel unter dem Daemon-Lifecycle starten
qwen serve --channel my-channel

# Alle konfigurierten Channels starten
qwen serve --channel all

# Oder Channels später auf einem Token-geschützten Daemon aktivieren
QWEN_SERVER_TOKEN=secret qwen serve
qwen channel set my-channel --token secret

# Die daemon-verwaltete Auswahl abfragen oder stoppen
qwen channel status --daemon-url http://127.0.0.1:4170 --token secret
qwen channel stop --daemon-url http://127.0.0.1:4170 --token secret
```

Dieser Modus startet workspace-gruppierte Channel-Worker-Prozesse, die `qwen serve` gehören. Worker verbinden sich über das SDK zurück mit dem Daemon und verwenden dieselben Channel-Adapter. Sie sind vom Daemon-Prozess getrennt, sodass ein Absturz eines Channel-Adapters nicht den Daemon zum Absturz bringt. Ein Daemon, der ohne `--channel` gestartet wurde, lädt keine Channel-Adapter und reserviert nicht die Channel-Service-PID-Lease bis zum ersten `qwen channel set`.

`qwen serve --channel` ist nicht derselbe Service wie `qwen channel start`. Das eigenständige `qwen channel start` verwendet weiterhin den ACP-gestützten Channel-Service und kann Channel-Konfigurationen mit unterschiedlichen `cwd`-Werten ausführen. Daemon-verwaltete Channels erfordern, dass das `cwd` jedes ausgewählten Channels zu einem vom Daemon registrierten Workspace aufgelöst wird. Im Multi-Workspace-Modus behält eine Auswahl-Ersetzung Worker für Workspaces, deren geordnete Channel-Liste sich nicht geändert hat; `all` bleibt auf den primären Workspace beschränkt.

Ohne `--daemon-url` behalten `qwen channel status` und `qwen channel stop` das eigenständige Pidfile-Verhalten. Deren `--daemon-url`-Varianten fragen den Daemon-Manager ab oder stoppen ihn. Laufzeitauswahlen werden nicht in Settings geschrieben und überleben Daemon-Neustarts nicht. Wenn ein bereiter Worker unerwartet beendet wird, läuft der Daemon weiter und meldet eine Channel-Worker-Warnung in `/daemon/status`.

## Webhook-triggered tasks

Daemon-verwaltete Channels können auch authentifizierte Webhook-Ereignisse akzeptieren. Qwen empfängt das Ereignis als Kontext, fasst zusammen und entscheidet, was relevant ist, und stellt dann die finale Antwort dem konfigurierten Chat-Ziel zu. Dies ist kein roher Benachrichtigungs-Relay.
Webhook-Tasks erfordern `approvalMode: "yolo"`, da sie ohne interaktive Genehmigung laufen. Diese Einstellung gilt für den gesamten Channel, nicht nur für Webhook-Turns, also verwende einen dedizierten Webhook-Channel oder schränke normale Chat-Absender für diesen Channel stark ein.

Beispiel-Channel-Konfiguration:

```json
{
  "channels": {
    "dingtalk-main": {
      "type": "dingtalk",
      "clientId": "$DINGTALK_CLIENT_ID",
      "clientSecret": "$DINGTALK_CLIENT_SECRET",
      "cwd": "/repo",
      "senderPolicy": "allowlist",
      "allowedUsers": ["12345"],
      "approvalMode": "yolo",
      "sessionScope": "user",
      "webhooks": {
        "sources": {
          "github-ci": {
            "secretEnv": "QWEN_CHANNEL_GITHUB_CI_SECRET",
            "targets": {
              "operator": {
                "chatId": "DINGTALK_USER_ID",
                "senderId": "webhook:github-ci",
                "isGroup": false
              },
              "team": {
                "chatId": "OPEN_CONVERSATION_ID",
                "senderId": "webhook:github-ci",
                "isGroup": true
              }
            }
          }
        }
      }
    }
  }
}
```

Für DingTalk setze `isGroup` explizit bei jedem Ziel. Ein Direktnachrichten-Ziel verwendet die DingTalk-Benutzer-ID als `chatId` mit `isGroup: false`; ein Gruppen-Ziel verwendet die Gruppen-`openConversationId` mit `isGroup: true`. Andere Adapter benötigen möglicherweise ihre eigene proaktive Ziel-Form.

Daemon-verwaltete DingTalk-, Feishu-, Telegram- und WeCom-Channels beobachten dynamisch Kontakte aus autorisierten eingehenden Nachrichten. Liste im primären Workspace beobachtete Kontakte innerhalb des Standard-Frischefensters von sieben Tagen auf:

```bash
curl -H "Authorization: Bearer $QWEN_SERVER_TOKEN" \
  http://127.0.0.1:4170/workspace/channel/observed-contacts
```

Verwende `GET /workspaces/:workspace/channel/observed-contacts`, um einen anderen registrierten, vertrauenswürdigen Workspace auszuwählen. Füge `?freshWithinSeconds=N` hinzu, um ein Fenster von einer Sekunde bis 365 Tage zu wählen. Der Daemon bewirbt diese API mit der `workspace_channel_observed_contacts`-Capability.

Die Response gibt vollständige Plattform-IDs und Labels zurück. Gruppen-Labels verwenden Namen, die bereits in akzeptierten eingehenden Nachrichten vorhanden sind, wenn verfügbar: DingTalk liefert `conversationTitle`, und Telegram liefert `chat.title`. Feishu- und WeCom-Gruppen-Labels fallen derzeit auf ihre vollständigen IDs zurück; keine Plattform-Verzeichnis- oder Gruppendetail-API wird abgefragt. Topic-Labels fallen ebenfalls auf vollständige IDs zurück. Jedes `lastObservedAt` ist ein kanonischer ISO 8601 UTC-Timestamp mit Millisekunden-Genauigkeit; Clients können ihn in die lokale Zeitzone des Benutzers umrechnen. Top-Level `users` enthält in Direktnachrichten beobachtete Benutzer. `groups` enthält beobachtete Gruppenunterhaltungen, `groups[].users` enthält in jeder Gruppe beobachtete Benutzer, und `groups[].topics[].users` enthält in Feishu- oder Telegram-Topics beobachtete Benutzer:

```json
{
  "users": [
    {
      "channelName": "feishu-main",
      "label": "Example User",
      "id": "ou_complete_user_id",
      "lastObservedAt": "2026-07-17T08:00:00.000Z"
    }
  ],
  "groups": [
    {
      "channelName": "feishu-main",
      "label": "oc_complete_chat_id",
      "id": "oc_complete_chat_id",
      "lastObservedAt": "2026-07-17T08:05:00.000Z",
      "users": [
        {
          "label": "Example User",
          "id": "ou_complete_user_id",
          "lastObservedAt": "2026-07-17T08:05:00.000Z"
        }
      ],
      "topics": []
    }
  ]
}
```

Diese verschachtelten Benutzer sind beobachtete Teilnehmer, keine autoritative Gruppenmitgliedschaft. Nur Nachrichten, die Direct/Group-, Erwähnungs-, Sender- und Pairing-Gates passieren, werden aufgezeichnet. Wiederholte Beobachtungen aktualisieren Labels und Zeitstempel; passive Beobachtung kann ein Verlassen oder eine Löschung nicht erkennen, bis die Beziehung veraltet ist. Nachrichteninhalt wird niemals gespeichert. Die begrenzte Registry liegt unter `$QWEN_HOME/channels/daemon/<workspaceHash>/observed-contacts.json`, außerhalb des Workspace-Checkouts und pro Workspace partitioniert. Ihr 500-Beobachtungs-Limit wird von allen Channels und Unterhaltungen in diesem Workspace geteilt, und Beobachtungen, die älter als 365 Tage sind, werden beim nächsten akzeptierten Schreibvorgang entfernt. Wenn die Registry fehlerhaft ist oder eine nicht unterstützte Version verwendet, lösche diese Datei, um sie zurückzusetzen; akzeptierter Traffic erstellt sie neu. Webhook-Konfiguration und -Zustellung bleiben unverändert.

Starte `qwen serve` mit dem Channel-Worker aktiviert:

```bash
QWEN_SERVER_TOKEN="$QWEN_SERVER_TOKEN" qwen serve --require-auth --channel dingtalk-main
```

Beispielanfrage:

```bash
curl -X POST "http://127.0.0.1:4170/channels/dingtalk-main/webhooks/github-ci" \
  -H "x-qwen-webhook-secret: $QWEN_CHANNEL_GITHUB_CI_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "push",
    "targetRef": "operator",
    "title": "CI pipeline finished",
    "payload": {
      "targetRef": "refs/heads/main",
      "repository": "qwen-code",
      "status": "success"
    }
  }'
```

Webhook-Routen authentifizieren sich mit dem Webhook-Secret-Header, auch wenn `qwen serve` mit Bearer-Auth läuft. Teile das Daemon-Bearer-Token nicht mit Webhook-Anbietern. Webhook-Konfiguration und `secretEnv`-Werte werden geladen, wenn der Daemon startet; starte `qwen serve` neu, nachdem du Webhook-Quellen geändert oder Secrets rotiert hast. Eine `202 {"accepted": true}`-Response bedeutet, dass der Channel-Worker die Eigentümerschaft des Tasks akzeptiert hat, nicht dass die finale Antwort bereits im Chat zugestellt wurde. Prüfe Daemon- und Channel-Worker-Logs sowie `/daemon/status` bei der Fehlersuche nach Zustellungsfehlern.

### Multi-Channel-Modus

Wenn du `qwen channel start` ohne Namen ausführst, starten alle in `settings.json` definierten Channels gemeinsam und teilen sich einen einzigen Agent-Prozess. Jeder Channel verwaltet seine eigenen Sessions – ein Telegram-Nutzer und ein WeChat-Nutzer erhalten separate Konversationen, auch wenn sie sich denselben Agenten teilen.

Jeder Channel verwendet sein eigenes `cwd` aus seiner Konfiguration, sodass verschiedene Channels gleichzeitig an unterschiedlichen Projekten arbeiten können.

### Service-Management

Der Channel-Service verwendet eine PID-Datei (`~/.qwen/channels/service.pid`), um die laufende Instanz zu verfolgen:

- **Duplikatvermeidung**: Das Ausführen von `qwen channel start`, während ein Service bereits läuft, zeigt einen Fehler an, anstatt eine zweite Instanz zu starten
- **`qwen channel stop`**: Stoppt den laufenden Service ordnungsgemäß aus einem anderen Terminal
- **`qwen channel status`**: Zeigt an, ob der Service läuft, seine Uptime und die Session-Anzahlen pro Channel

### Crash-Recovery

Wenn der Agent-Prozess unerwartet abstürzt, startet der Channel-Service ihn automatisch neu und versucht, alle aktiven Sessions wiederherzustellen. Nutzer können ihre Konversationen fortsetzen, ohne von vorne beginnen zu müssen.

- Sessions werden während der Laufzeit des Service in `~/.qwen/channels/sessions.json` persistiert
- Bei einem Crash: Der Agent startet innerhalb von 3 Sekunden neu und lädt die gespeicherten Sessions
- Nach 3 aufeinanderfolgenden Crashes beendet sich der Service mit einem Fehler
- Bei einem sauberen Shutdown (Strg+C oder `qwen channel stop`): Session-Daten werden gelöscht – der nächste Start ist immer frisch
