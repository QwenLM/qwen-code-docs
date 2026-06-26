# Slash Command Refactoring-Roadmap

## Gesamtziel

Auslieferung einer Command-Plattform, die im externen Erlebnis zu 95 % mit Claude Code übereinstimmt, unter Verwendung des internen Qwen-Architekturstils. Gleichzeitig werden die drei Kernprobleme behoben: Aufspaltung in drei Modi, einheitliche Befehlsquelle und die fehlende Möglichkeit, prompt commands per Modell aufzurufen.

---

## Kernentwurfsprinzipien

1. **Jede Phase kann unabhängig ausgeliefert werden**: Das Verhalten nach Abschluss ist in sich konsistent und benötigt keine nachfolgenden Phasen, um zu laufen.
2. **Phase 1 ist reine Infrastruktur**: Außer der Behebung des fälschlichen Abfangens von MCP_PROMPT werden keine vorhandenen verfügbaren Befehle geändert.
3. **Verhaltensänderungen von Architekturänderungen trennen**: Phase 1 liefert die Architektur, Phase 2 die Fähigkeitserweiterung.
4. **Keine Eins-zu-eins-Übernahme der Claude Code-Interna**: Aber Angleichung der vom Benutzer wahrnehmbaren Fähigkeiten.

---

## Phase 1: Infrastrukturneubau (reine Architektur, null Verhaltensänderung)

### Ziel

Aufbau eines einheitlichen Befehlsmetadatenmodells und einer modusübergreifenden Verwaltungsmechanik als Grundlage für alle nachfolgenden Phasen.

### Funktionen

#### 1.1 Erweiterung des `SlashCommand`-Metadatenmodells

Dem bestehenden `SlashCommand`-Interface werden die folgenden Felder hinzugefügt:

**Quellfelder**

- `source: CommandSource`: Aufzählung der Befehlsquelle (`builtin-command` / `bundled-skill` / `skill-dir-command` / `plugin-command` / `mcp-prompt` usw.)
- `sourceLabel?: string`: Anzeigelabel für die Quelle (z. B. `"Built-in"` / `"MCP: github-server"`)

**Modus-Fähigkeitsfelder**

- `supportedModes: ExecutionMode[]`: Deklariert, in welchen Ausführungsmodi der Befehl verfügbar ist (`interactive` / `non_interactive` / `acp`)

**Ausführungstybfeld**

- `commandType: CommandType`: Deklariert den Ausführungstyp (`prompt` / `local` / `local-jsx`)

**Sichtbarkeitsfelder**

- `userInvocable: boolean`: Gibt an, ob der Benutzer den Befehl per Slash aufrufen kann (Standard `true`)
- `modelInvocable: boolean`: Gibt an, ob das Modell den Befehl per Tool-Call aufrufen kann (Standard `false`)

**Hilfsmetadatenfelder** (für Phase 3 reserviert, Phase 1 definiert nur, verwendet nicht)

- `argumentHint?: string`: Parameterhinweis, z. B. `"<model-id>"` / `"show|list|set"`
- `whenToUse?: string`: Erläuterung, wann der Befehl aufgerufen werden soll (für das Modell)
- `examples?: string[]`: Verwendungsbeispiele

#### 1.2 Loader füllen source/commandType-Felder

Jeder Loader muss beim Erstellen eines `SlashCommand` die Felder `source` und `commandType` füllen:

| Loader                           | source              | commandType                           |
| -------------------------------- | ------------------- | ------------------------------------- |
| `BuiltinCommandLoader`           | `builtin-command`   | Von den einzelnen Befehlen deklariert (`local` / `local-jsx`) |
| `BundledSkillLoader`             | `bundled-skill`     | `prompt`                              |
| `FileCommandLoader` (Benutzer/Projekt) | `skill-dir-command` | `prompt`                              |
| `FileCommandLoader` (Plugin)      | `plugin-command`    | `prompt`                              |
| `McpPromptLoader`                | `mcp-prompt`        | `prompt`                              |

#### 1.3 Built-in-Befehle deklarieren `supportedModes` und `commandType`

Explizite Deklaration für alle built-in-Befehle:

- `commandType`: `local` (keine UI-Abhängigkeit) oder `local-jsx` (Abhängigkeit von dialog/React)
- `supportedModes`: `local`-Befehle deklarieren `['interactive', 'non_interactive', 'acp']`; `local-jsx`-Befehle deklarieren `['interactive']`

#### 1.4 Ersetzung der hartcodierten Whitelist durch capability-basierte Filterung

- Löschen der Konstanten `ALLOWED_BUILTIN_COMMANDS_NON_INTERACTIVE`
- Löschen der Funktion `filterCommandsForNonInteractive`
- Neue Funktion `filterCommandsForMode(commands, mode)`, die auf Basis des Feldes `supportedModes` filtert
- Neue Hilfsfunktion `getEffectiveSupportedModes(cmd)` (unter Berücksichtigung der Standardstrategie für CommandKind)
- Änderung der Funktionssignaturen von `handleSlashCommand` / `getAvailableCommands`, Entfernung des Parameters `allowedBuiltinCommandNames`

#### 1.5 CommandService wird zu einem einheitlichen Registry aufgewertet

- Neue Methode `getCommandsForMode(mode: ExecutionMode)`
- Neue Methode `getModelInvocableCommands()` (wird in Phase 2/3 verwendet, Phase 1 stellt das Interface bereit)
- Die bestehende `getCommands()` bleibt unverändert (wird im interaktiven Modus verwendet)

### Abnahmekriterien

- [ ] Das `SlashCommand`-Interface enthält alle neuen Felder, TypeScript-Kompilierung erfolgreich
- [ ] Alle Loader füllen die Felder `source` und `commandType`
- [ ] Alle built-in-Befehle deklarieren `commandType` und `supportedModes`
- [ ] `ALLOWED_BUILTIN_COMMANDS_NON_INTERACTIVE` wurde gelöscht und durch einen Capability-Filter ersetzt
- [ ] **Der Satz der im nicht-interaktiven Modus verfügbaren Befehle ist identisch mit dem vor dem Refactoring** (bestehende Tests brechen nicht)
- [ ] MCP-Prompt-Befehle können im nicht-interaktiven/ACP-Modus normal ausgeführt werden (Behebung der ursprünglichen fehlerhaften Einschränkung)
- [ ] `CommandService.getCommandsForMode('non_interactive')` gibt den korrekten Befehlssatz zurück
- [ ] Alle vorhandenen Tests bestehen

---

## Phase 2: Fähigkeitserweiterung (Befehlsbereinigung und Modellaufruf von Prompt-Befehlen)

### Ziel

Basierend auf den Metadaten aus Phase 1 wird der verfügbare Befehlsumfang in den drei Modi erweitert und der Pfad für den Modellaufruf von Prompt-Befehlen erschlossen.

### Funktionen

#### 2.1 Erweiterung des nicht-interaktiven/ACP-Befehlssatzes

**ACP-Entwurfsprinzipien**

Bevor Befehle auf den ACP/nicht-interaktiven Modus ausgeweitet werden, müssen die folgenden Entwurfsprinzipien beachtet werden:

1. **Anderer Empfänger**: Im ACP-Modus ist der Empfänger der Nachricht die IDE (Zed/VS Code-Plugin), nicht der Endbenutzer. Der Nachrichteninhalt sollte vorzugsweise im Klartext- oder Markdown-Format sein und keine terminal-spezifischen ANSI-Stile enthalten.
2. **Implementierungsstrategie ist das Hinzufügen von Modusverzweigungen, nicht das Ersetzen**: Korrekt ist es, innerhalb der `action` eines Befehls eine neue Modusprüfung einzufügen – der interaktive Pfad behält die bestehende UI-Renderlogik bei, der nicht-interaktive/ACP-Pfad gibt eine maschinenlesbare `message` oder `submit_prompt` zurück. Beide Pfade koexistieren in derselben `action`-Funktion.
3. **Zustandsbehaftete Operationen müssen ihre Semantik erläutern**: Bei einem einzelnen nicht-interaktiven Aufruf (z. B. CLI-Parameter `-p`) sind Änderungen zustandsbehafteter Befehle wie `/model set`, `/language set` nur innerhalb dieser Sitzung gültig. Dies sollte im Antworttext des Befehls vermerkt werden.
4. **Schreibgeschützt vs. Nebenwirkungen**: Schreibgeschützte Befehle (wie `/about`, `/stats`) geben direkt den aktuellen Statustext zurück; Befehle mit Nebenwirkungen (wie `/model set`, `/language set`) müssen das Ergebnis der Operation im Antworttext bestätigen.
5. **Umgebungsbezogene Nebenwirkungen vermeiden**: Aktionen, die von einer grafischen Umgebung abhängen (Browser öffnen (`/docs`, `/insight`), Zwischenablage bedienen (`/copy`)) sollten im nicht-interaktiven/ACP-Pfad übersprungen werden; stattdessen sollten die entsprechende URL oder der Inhalt selbst im Antworttext zurückgegeben werden.

**Übersicht der zu erweiternden Befehle**

> Hinweis: `btw`, `bug`, `compress`, `context`, `init`, `summary` wurden bereits in Phase 1 auf alle Modi ausgeweitet und sind nicht Teil dieser Liste.

Die folgenden 13 Befehle werden in Phase 2 auf die Modi `non_interactive` und `acp` ausgeweitet:

**Klasse A: action gibt bereits `message` oder `submit_prompt` zurück, nur `supportedModes` erweitern und ACP-Nachrichteninhalt entwerfen**

| Befehl        | Rückgabetyp      | ACP/nicht-interaktive Verarbeitungshinweise                        |
| ------------- | ---------------- | ------------------------------------------------------------------- |
| `/copy`       | `message`        | Keine Zwischenablage im ACP-Modus, stattdessen den Inhalt selbst oder einen Hinweis im Antworttext zurückgeben |
| `/export`     | `message`        | Vollständigen Pfad der exportierten Datei zurückgeben               |
| `/plan`       | `submit_prompt`  | Keine Änderung erforderlich, Modus direkt erweitern                 |
| `/restore`    | `message`        | Beschreibung des Wiederherstellungsergebnisses zurückgeben          |
| `/language`   | `message`        | Aktuelle Spracheinstellung oder Bestätigungstext der Änderung zurückgeben |
| `/statusline` | `submit_prompt`  | Keine Änderung erforderlich, Modus direkt erweitern                 |

**Klasse A': Bei Parametern normal ausführen, ohne Parameter Dialog auslösen (nicht-interaktiven Pfad ohne Parameter hinzufügen)**

| Befehl           | Verhalten ohne Parameter im interaktiven Modus | Verhalten ohne Parameter im nicht-interaktiven/ACP-Modus |
| ---------------- | ---------------------------------------------- | -------------------------------------------------------- |
| `/model`         | Öffnet Modellauswahldialog                     | Gibt aktuellen Modellnamen und Erläuterungstext zurück   |
| `/approval-mode` | Öffnet Genehmigungsmodus-Dialog                | Gibt aktuellen Genehmigungsmodus und Erläuterungstext zurück |

**Klasse B: action verwendet intern `context.ui.addItem()` zum Rendern von React-Komponenten, es muss ein Moduszweig hinzugefügt werden, der Klartext zurückgibt**

| Befehl     | Interaktives Verhalten                 | Nicht-interaktiver/ACP-Rückgabewert                                                              |
| ---------- | -------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `/about`   | Rendert Versions-/Konfigurations-React-Komponente | Versionsnummer, aktuelles Modell, Klartextzusammenfassung der wichtigsten Konfigurationen        |
| `/stats`   | Rendert Token-/Kostenstatistikkomponente | Klartextformat der Sitzungsstatistiken                                                            |
| `/insight` | Rendert Analysekkomponente + öffnet Browser | `non_interactive`: Synchron generieren und Dateipfad zurückgeben; `acp`: Fortschritt und Ergebnis per `stream_messages` pushen |
| `/docs`    | Rendert Dokumentationseingang + öffnet Browser | Gibt Dokumentations-URL zurück, öffnet keinen Browser                                             |

**Klasse C: Spezielle Behandlung**

| Befehl    | Interaktives Verhalten                               | Nicht-interaktives/ACP-Verhalten                                                                                   |
| --------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `/clear`  | Ruft `context.ui.clear()` auf, um Terminalanzeige zu leeren | Gibt eine Nachricht mit Kontextgrenzmarkierung zurück, Inhalt: `"Context cleared. Previous messages are no longer in context."` |

#### 2.2 Modellaufruf von Prompt-Befehlen ermöglichen

- Implementierung von `getModelInvocableCommands()` im `CommandService` (oder `CommandRegistry`), die alle Befehle mit `modelInvocable: true` zurückgibt
- Als `modelInvocable: true` markieren: Befehle, die von `BundledSkillLoader`, `FileCommandLoader` (Benutzer-/Projektbefehle) geladen werden
- **MCP-Prompt nicht als `modelInvocable` markieren**: MCP-Prompts werden vom Modell über den separaten MCP-Tool-Call-Mechanismus aufgerufen, ohne Umweg über `SkillTool`
- Umbau von `SkillTool`: Statt nur `SkillManager.listSkills()` zu konsumieren, wird auch `CommandService.getModelInvocableCommands()` konsumiert
- Erstellung einer einheitlichen Beschreibung der vom Modell aufrufbaren Befehle, Einfügen in die Description von `SkillTool`

#### 2.3 Mid-Input-Slash-Command-Erkennung (Basisversion)

- Erkennung eines Slash-Tokens in der Nähe des Cursors im `InputPrompt` (nicht nur am Zeilenanfang)
- Nach Erkennung eines Slash-Tokens: Vorschlag des besten passenden Befehlsnamens per Inline-Ghosttext (Tab zum Annehmen)
- **Kein** Dropdown-Vervollständigungsmenü, keine Argumenthinweise, kein Source-Badge usw. (wird in Phase 3 gemacht)
- Die Ghosttext-Kandidatenliste umfasst nur Befehle mit `modelInvocable: true` (Skill-/Dateibefehle)

### Abnahmekriterien

**2.1 Befehlserweiterung**

- [ ] Klasse A: `/copy`, `/export`, `/plan`, `/restore`, `/language`, `/statusline` können im nicht-interaktiven und ACP-Modus normal ausgeführt werden und geben sinnvolle Textausgaben zurück
- [ ] Klasse A': `/model`, `/approval-mode` geben ohne Parameter im nicht-interaktiven/ACP-Modus den aktuellen Statustext zurück (lösen keinen Dialog aus); mit Parameter führen sie die Änderung aus und geben einen Bestätigungstext zurück
- [ ] Klasse B: `/about`, `/stats`, `/docs` geben im nicht-interaktiven/ACP-Modus Klartext zurück, `/docs` öffnet keinen Browser; `/insight` generiert im `non_interactive`-Modus synchron eine Datei und gibt den Pfad als Nachricht zurück, im `acp`-Modus wird der Fortschritt per `stream_messages` gepusht
- [ ] Klasse C: `/clear` gibt im nicht-interaktiven/ACP-Modus eine Nachricht mit Kontextgrenzmarkierung zurück, ruft nicht `context.ui.clear()` auf
- [ ] Alle erweiterten Befehle verhalten sich im interaktiven Modus identisch zu vor dem Refactoring (keine Regression)

**2.2 Modellaufruf**

- [ ] Das Modell kann im Dialog über `SkillTool` bundled Skills und Dateibefehle (Benutzer/Projekt) aufrufen
- [ ] MCP-Prompts durchlaufen nicht `SkillTool`, sondern werden vom Modell nativ über den MCP-Tool-Call-Mechanismus aufgerufen
- [ ] Das Modell kann keine built-in-Befehle aufrufen (`userInvocable: true`, `modelInvocable: false`)
- [ ] Die `description` von `SkillTool` enthält die Beschreibungen aller `modelInvocable`-Befehle

**2.3 Mid-Input-Slash**

- [ ] Mid-Input-Slash: Bei Eingabe von `/` im Text wird der beste passende Befehl per Inline-Ghosttext vorgeschlagen (Tab zum Annehmen)

---

## Phase 3: Erlebnisangleichung (Vervollständigungsverbesserung + Claude Code-Befehlsergänzung)

### Ziel

Aufbauend auf den Metadaten und Befehlfähigkeiten aus Phase 1/2 die Vervollständigungserfahrung abrunden und die in Claude Code vorhandenen, aber in Qwen Code fehlenden Befehle ergänzen.

### Funktionen

#### 3.1 Verbesserung der Vervollständigungserfahrung

**Source-Badge**

- Im Vervollständigungsmenü wird das Label der Befehlsquelle angezeigt (`[MCP]` existiert bereits, erweitert um `[Skill]`, `[Custom]` usw.)
- Verwendung der Felder `source` / `sourceLabel` zum Rendern

**Argumenthinweis**

- Nach dem Befehlsnamen im Vervollständigungsmenü wird `argumentHint` angezeigt (z. B. `set <model-id>`)
- `argumentHint` wird vom Metadatenfeld aus Phase 1 bereitgestellt

**Sortierung nach kürzlicher Verwendung**

- Die zuletzt verwendeten Befehle des Benutzers werden aufgezeichnet (Sitzungsebene, keine Persistierung erforderlich)
- Bei der Sortierung der Vervollständigung werden kürzlich verwendete Befehle höher gewichtet

**Hervorhebung bei Alias-Treffern**

- Wenn die Vervollständigung auf `altNames` statt auf den Hauptnamen trifft, wird dies in der Anzeige vermerkt (z. B. `help (alias: ?)`)

**Konfliktstrategie-Angleichung**

- Klare Priorität: built-in > bundled/skill-dir > plugin > mcp
- Bei Konflikten wird der Befehl mit niedrigerer Priorität umbenannt (z. B. `pluginName.commandName`)

#### 3.2 Mid-Input-Slash-Command (Vollversion)

- Zusätzlich zur Basisversion aus Phase 2: Anzeige von Argumenthinweisen und Source-Badges
- Ghosttext-Vorschlag (bei Eingabe von `/he` wird ein blasser Hinweis auf `/help` eingeblendet)
- Hervorhebung gültiger Befehlstoken (bereits abgeglichene Slash-Commands werden in einer anderen Farbe angezeigt)

#### 3.3 Umstrukturierung des Hilfe-Verzeichnisses

`/help` von einer flachen Liste in ein gruppiertes Verzeichnis umwandeln:

- **Built-in Commands** (local + local-jsx, mit Modusangabe)
- **Bundled Skills**
- **Custom Commands** (Benutzer-/Projekt-Dateibefehle)
- **Plugin Commands**
- **MCP Commands**

Jeder Befehl zeigt: Name, argumentHint, description, source, supportedModes-Markierung

#### 3.4 Erweiterte Metadaten für ACP-verfügbare Befehle

In `sendAvailableCommandsUpdate()` werden weitere Metadaten für ACP-Clients bereitgestellt:

- `argumentHint`
- `source`
- `supportedModes`
- `subcommands` (Namenliste)
- `modelInvocable`

#### 3.5 Ergänzung der in Claude Code fehlenden Befehle

Bestätigung und Rückführung des in Qwen Code bereits vorhandenen Befehls `/doctor`; `/release-notes` wird nicht in diese Phase aufgenommen, um die Einführung eines built-in-Befehls ohne klaren Produktbedarf zu vermeiden.

| Befehl     | Typ     | Beschreibung                                                |
| ---------- | ------- | ----------------------------------------------------------- |
| `/doctor`  | `local` | Umgebungsprüfung, gibt Diagnose zu Konfiguration/Verbindung/Tool-Status aus |

> Hinweis: Aufgabenorientierte Befehle wie `/review`, `/commit` werden als bundled Skills bereitgestellt und sind nicht in dieser Liste.

### Abnahmekriterien

- [ ] Das Vervollständigungsmenü zeigt Source-Badges an (`[MCP]`, `[Skill]`, `[Custom]`)
- [ ] Das Vervollständigungsmenü zeigt argumentHint an (z. B. `set <model-id>`)
- [ ] Kürzlich verwendete Befehle erscheinen bevorzugt in der Vervollständigungsliste
- [ ] Bei Alias-Treffern wird der ursprüngliche Name im Vervollständigungselement vermerkt
- [ ] Mid-Input-Slash: Ghosttext-Hinweise werden korrekt gerendert
- [ ] `/help` wird im Claude Code-Stil mit Tabs angezeigt, um Befehlsüberfrachtung zu vermeiden, und zeigt auf der Befehlsseite Markierungen für unterstützte Modi an
- [ ] ACP-verfügbare Befehle enthalten die Felder `argumentHint`, `source`, `subcommands`
- [ ] Der Befehl `/doctor` ist verfügbar
- [ ] `/doctor` ist im nicht-interaktiven Modus ausführbar (gibt `message` zurück)
- [ ] Kein neuer `/release-notes`-Befehl

---

## Abhängigkeiten der Phasen

```
Phase 1 (Metadaten + einheitlicher Filter)
    │
    ├──► Phase 2 (Fähigkeitserweiterung)
    │        │
    │        ├──► Aufteilung von Slash-Command-Unterbefehlen
    │        └──► Modellaufruf von Prompt-Befehlen (benötigt getModelInvocableCommands())
    │
    └──► Phase 3 (Erlebnisangleichung)
             │
             ├──► Source-Badge (benötigt Phase 1 source-Feld)
             ├──► Argumenthinweis (benötigt Phase 1 argumentHint-Feld)
             └──► Hilfe-Gruppierung (benötigt Phase 1 source-Feld)
```

Phase 2 und Phase 3 sind voneinander unabhängig und können parallel vorangetrieben werden (oder je nach Priorität einige Unterpunkte getauscht werden).