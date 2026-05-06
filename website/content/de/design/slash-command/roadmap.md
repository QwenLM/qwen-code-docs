# Roadmap für die Refaktorierung von Slash Commands

## Gesamtziel

Bereitstellung einer Command-Plattform, die sich intern am Qwen-Architekturstil orientiert und extern zu 95 % mit der User Experience von Claude Code übereinstimmt. Gleichzeitig werden drei Kernprobleme behoben: die Aufspaltung in drei Modi, die einseitige Herkunft der Commands und die Tatsache, dass Prompt-Commands nicht vom Modell aufgerufen werden können.

---

## Kernprinzipien des Designs

1. **Jede Phase kann unabhängig ausgeliefert werden**: Nach Abschluss ist das Verhalten in sich geschlossen und nicht von zukünftigen Phasen abhängig
2. **Phase 1 ist reine Infrastruktur**: Abgesehen von der Behebung der fehlerhaften Abfangung von `MCP_PROMPT` wird kein bestehender Command-Satz verändert
3. **Verhaltens- und Architekturänderungen werden getrennt**: Phase 1 kümmert sich um die Architektur, Phase 2 um die Funktionserweiterung
4. **Keine 1:1-Übernahme der internen Claude-Code-Architektur**: Stattdessen wird die aus Nutzersicht wahrnehmbare Funktionalität angeglichen

---

## Phase 1: Wiederaufbau der Infrastruktur (reine Architektur, keine Verhaltensänderungen)

### Ziel

Aufbau eines einheitlichen Command-Metadatenmodells und eines modusübergreifenden Managementsystems als Grundlage für alle folgenden Phasen.

### Funktionsumfang

#### 1.1 Erweiterung des `SlashCommand`-Metadatenmodells

Folgende Felder werden zum bestehenden `SlashCommand`-Interface hinzugefügt:

**Herkunftsfelder**

- `source: CommandSource`: Enum für die Command-Herkunft (`builtin-command` / `bundled-skill` / `skill-dir-command` / `plugin-command` / `mcp-prompt` usw.)
- `sourceLabel?: string`: Anzeigelabel für die Herkunft (z. B. `"Built-in"` / `"MCP: github-server"`)

**Modus-Fähigkeitsfelder**

- `supportedModes: ExecutionMode[]`: Deklariert, in welchen Ausführungsmodi der Command verfügbar ist (`interactive` / `non_interactive` / `acp`)

**Ausführungstyp-Felder**

- `commandType: CommandType`: Deklariert den Ausführungstyp (`prompt` / `local` / `local-jsx`)

**Sichtbarkeitsfelder**

- `userInvocable: boolean`: Gibt an, ob der Command vom Nutzer per Slash-Command aufgerufen werden kann (Standard: `true`)
- `modelInvocable: boolean`: Gibt an, ob der Command vom Modell per Tool Call aufgerufen werden kann (Standard: `false`)

**Hilfs-Metadatenfelder** (für Phase 3 reserviert, in Phase 1 nur definiert, aber nicht verwendet)

- `argumentHint?: string`: Parameterhinweis, z. B. `"<model-id>"` / `"show|list|set"`
- `whenToUse?: string`: Beschreibung, wann der Command aufgerufen werden soll (für das Modell)
- `examples?: string[]`: Anwendungsbeispiele

#### 1.2 Befüllen der `source`/`commandType`-Felder durch Loader

Jeder Loader muss beim Erstellen eines `SlashCommand` die Felder `source` und `commandType` befüllen:

| Loader                           | source              | commandType                           |
| -------------------------------- | ------------------- | ------------------------------------- |
| `BuiltinCommandLoader`           | `builtin-command`   | Wird vom jeweiligen Command deklariert (`local` / `local-jsx`) |
| `BundledSkillLoader`             | `bundled-skill`     | `prompt`                              |
| `FileCommandLoader` (Nutzer/Projekt) | `skill-dir-command` | `prompt`                              |
| `FileCommandLoader` (Plugin)      | `plugin-command`    | `prompt`                              |
| `McpPromptLoader`                | `mcp-prompt`        | `prompt`                              |

#### 1.3 Deklaration von `supportedModes` und `commandType` für Built-in Commands

Explizite Deklaration für alle Built-in Commands:

- `commandType`: `local` (keine UI-Abhängigkeit) oder `local-jsx` (abhängig von Dialog/React)
- `supportedModes`: Commands vom Typ `local` deklarieren `['interactive', 'non_interactive', 'acp']`; Commands vom Typ `local-jsx` deklarieren `['interactive']`

#### 1.4 Ersetzung der hartkodierten Whitelist durch capability-basiertes Filtering

- Entfernen der Konstante `ALLOWED_BUILTIN_COMMANDS_NON_INTERACTIVE`
- Entfernen der Funktion `filterCommandsForNonInteractive`
- Hinzufügen der Funktion `filterCommandsForMode(commands, mode)`, die basierend auf dem `supportedModes`-Feld filtert
- Hinzufügen der Utility-Funktion `getEffectiveSupportedModes(cmd)` (berücksichtigt Standardstrategien von `CommandKind`)
- Anpassung der Funktionssignaturen von `handleSlashCommand` / `getAvailableCommands`, Entfernung des `allowedBuiltinCommandNames`-Parameters

#### 1.5 Upgrade von `CommandService` zu einer einheitlichen Registry

- Hinzufügen der Methode `getCommandsForMode(mode: ExecutionMode)`
- Hinzufügen der Methode `getModelInvocableCommands()` (wird in Phase 2/3 verwendet, Interface wird in Phase 1 bereitgestellt)
- Bestehende `getCommands()`-Methode bleibt unverändert (für `interactive` verwendet)

### Akzeptanzkriterien

- [ ] Das `SlashCommand`-Interface enthält alle neuen Felder, TypeScript-Kompilierung erfolgreich
- [ ] Alle Loader befüllen die Felder `source` und `commandType`
- [ ] Alle Built-in Commands deklarieren `commandType` und `supportedModes`
- [ ] `ALLOWED_BUILTIN_COMMANDS_NON_INTERACTIVE` wurde entfernt und durch den Capability-Filter ersetzt
- [ ] **Der verfügbare Command-Satz in `non-interactive` ist identisch mit dem Stand vor der Refaktorierung** (bestehende Tests brechen nicht)
- [ ] MCP-Prompt-Commands können in `non-interactive`/`acp` normal ausgeführt werden (Behebung der bisherigen fehlerhaften Einschränkung)
- [ ] `CommandService.getCommandsForMode('non_interactive')` gibt den korrekten Command-Satz zurück
- [ ] Alle bestehenden Tests sind erfolgreich

---

## Phase 2: Funktionserweiterung (Command-Bereinigung und Modellaufruf für Prompt-Commands)

### Ziel

Erweiterung des verfügbaren Command-Umfangs in allen drei Modi auf Basis der Metadaten aus Phase 1 sowie Freischaltung des Modellaufrufs für Prompt-Commands.

### Funktionsumfang

#### 2.1 Erweiterung des verfügbaren Command-Satzes für `non-interactive` / `acp`

**Semantische Designprinzipien für ACP**

Vor der Erweiterung von Commands auf ACP/`non-interactive`-Modi müssen folgende Designprinzipien beachtet werden:

1. **Anderer Empfänger**: Im ACP-Modus ist der Empfänger der Nachrichten die IDE (Zed/VS Code Plugin) und nicht der Endnutzer. Nachrichten sollten als Plain Text oder Markdown formatiert sein und keine terminal-spezifischen ANSI-Styles enthalten.
2. **Implementierungsstrategie: Modus-Branching statt Ersetzung**: Der korrekte Ansatz ist das Hinzufügen einer Modus-Abfrage innerhalb der `action` des Commands. Der `interactive`-Pfad behält die bestehende UI-Rendering-Logik bei, während der `non_interactive`/`acp`-Pfad eine maschinenlesbare `message` oder `submit_prompt` zurückgibt. Beide Pfade koexistieren in derselben `action`-Funktion.
3. **Semantik zustandsbehafteter Operationen**: Bei einem einzelnen nicht-interaktiven Aufruf (z. B. CLI-Parameter `-p`) gelten Änderungen durch zustandsbehaftete Commands wie `/model set` oder `/language set` nur für die aktuelle Session. Dies muss im Antworttext des Commands vermerkt werden.
4. **Read-only vs. Side-Effects**: Read-only Commands (z. B. `/about`, `/stats`) geben direkt den aktuellen Status als Text zurück. Commands mit Side-Effects (z. B. `/model set`, `/language set`) müssen das Operationsergebnis in der Antwort bestätigen.
5. **Vermeidung umgebungsabhängiger Side-Effects**: Operationen, die eine grafische Umgebung voraussetzen, wie das Öffnen eines Browsers (`/docs`, `/insight`) oder das Bearbeiten der Zwischenablage (`/copy`), sollten im `non_interactive`/`acp`-Pfad übersprungen werden. Stattdessen wird die relevante URL oder der Inhalt direkt im Antworttext zurückgegeben.

**Übersicht der zu erweiternden Commands**

> Hinweis: `btw`, `bug`, `compress`, `context`, `init` und `summary` wurden bereits in Phase 1 auf alle Modi erweitert und sind nicht in dieser Liste enthalten.

Folgende 13 Commands werden in Phase 2 auf die Modi `non_interactive` und `acp` erweitert:

**Kategorie A: `action` gibt bereits `message` oder `submit_prompt` zurück; nur `supportedModes` erweitern und ACP-Nachrichteninhalt definieren**

| Command       | Rückgabetyp     | Verarbeitungshinweise für ACP/non-interactive      |
| ------------- | --------------- | -------------------------------------------------- |
| `/copy`       | `message`       | Keine Zwischenablage in ACP; Inhalt oder Hinweis direkt im Antworttext zurückgeben |
| `/export`     | `message`       | Vollständigen Pfad der exportierten Datei zurückgeben |
| `/plan`       | `submit_prompt` | Keine Änderungen nötig, Modus direkt erweitern |
| `/restore`    | `message`       | Beschreibung des Wiederherstellungsergebnisses zurückgeben |
| `/language`   | `message`       | Aktuelle Spracheinstellung oder Bestätigungstext für Änderung zurückgeben |
| `/statusline` | `submit_prompt` | Keine Änderungen nötig, Modus direkt erweitern |

**Kategorie A': Normale Ausführung mit Parametern, Dialog-Trigger ohne Parameter (non-interactive-Handling für den parameterlosen Pfad erforderlich)**

| Command            | Verhalten in `interactive` ohne Parameter | Verhalten in `non_interactive`/`acp` ohne Parameter |
| ------------------ | ----------------------------------------- | --------------------------------------------------- |
| `/model`           | Öffnet Model-Auswahl-Dialog               | Gibt aktuellen Modellnamen und Beschreibungstext zurück |
| `/approval-mode`   | Öffnet Approval-Mode-Dialog               | Gibt aktuellen Approval-Mode und Beschreibungstext zurück |

**Kategorie B: `action` verwendet intern `context.ui.addItem()` zum Rendern von React-Komponenten; Modus-Branching für Plain-Text-Rückgabe erforderlich**

| Command    | Verhalten in `interactive`          | Rückgabeinhalt für `non_interactive`/`acp`                                                        |
| ---------- | ----------------------------------- | ------------------------------------------------------------------------------------------------- |
| `/about`   | Rendert Version/Config-React-Komponente | Plain-Text-Zusammenfassung von Version, aktuellem Modell und Key-Configs |
| `/stats`   | Rendert Token/Cost-Statistik-Komponente | Plain-Text-Format der Session-Statistiken |
| `/insight` | Rendert Analyse-Komponente + öffnet Browser | `non_interactive`: Synchron generieren und Dateipfad zurückgeben; `acp`: Fortschritt und Ergebnisse via `stream_messages` pushen |
| `/docs`    | Rendert Doc-Einstieg + öffnet Browser | Dokumenten-URL zurückgeben, Browser nicht öffnen |

**Kategorie C: Spezielle Behandlung**

| Command  | Verhalten in `interactive`                       | Verhalten in `non_interactive`/`acp`                                                                            |
| -------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `/clear` | Ruft `context.ui.clear()` zum Leeren der Terminal-Anzeige auf | Gibt eine Context-Boundary-Markierung zurück mit dem Inhalt `"Context cleared. Previous messages are no longer in context."` |

#### 2.2 Freischaltung des Modellaufrufs für Prompt-Commands

- Implementierung von `getModelInvocableCommands()` in `CommandService` (oder `CommandRegistry`), Rückgabe aller Commands mit `modelInvocable: true`
- Markierung der von `BundledSkillLoader` und `FileCommandLoader` (Nutzer/Projekt-Commands) geladenen Commands mit `modelInvocable: true`
- **MCP-Prompts werden nicht als `modelInvocable` markiert**: MCP-Prompts werden vom Modell über einen separaten MCP-Tool-Call-Mechanismus aufgerufen, ohne dass `SkillTool` als Vermittler benötigt wird
- Anpassung von `SkillTool`: Statt nur `SkillManager.listSkills()` zu konsumieren, wird nun zusätzlich `CommandService.getModelInvocableCommands()` konsumiert
- Erstellung einer einheitlichen Beschreibung für modellaufrufbare Commands, Injektion in die `description` von `SkillTool`

#### 2.3 Erkennung von Mid-Input-Slash-Commands (Basic-Version)

- Erkennung von Slash-Tokens in der Nähe des Cursors in `InputPrompt` (nicht nur am Zeilenanfang)
- Nach Erkennung eines Slash-Tokens wird der bestpassende Command-Name via Inline-Ghost-Text vorgeschlagen (Annahme per Tab)
- **Kein** Dropdown-Autovervollständigungsmenü, Argument-Hints, Source-Badges usw. (wird in Phase 3 umgesetzt)
- Der Ghost-Text-Kandidatensatz beschränkt sich auf Commands mit `modelInvocable: true` (Skills / File-Commands)

### Akzeptanzkriterien

**2.1 Command-Erweiterung**

- [ ] Kategorie A: `/copy`, `/export`, `/plan`, `/restore`, `/language`, `/statusline` können in `non-interactive`- und `acp`-Modi normal ausgeführt werden und geben sinnvolle Textausgaben zurück
- [ ] Kategorie A': `/model`, `/approval-mode` geben ohne Parameter in `non_interactive`/`acp` den aktuellen Status als Text zurück (kein Dialog-Trigger); mit Parametern wird die Änderung ausgeführt und ein Bestätigungstext zurückgegeben
- [ ] Kategorie B: `/about`, `/stats`, `/docs` geben in `non_interactive`/`acp` Plain Text zurück, `/docs` öffnet keinen Browser; `/insight` generiert in `non_interactive` synchron und gibt eine Dateipfad-Message zurück, in `acp` wird der Fortschritt via `stream_messages` gepusht
- [ ] Kategorie C: `/clear` gibt in `non_interactive`/`acp` eine Context-Boundary-Markierung-Message zurück, ohne `context.ui.clear()` aufzurufen
- [ ] Das Verhalten aller erweiterten Commands im `interactive`-Modus ist identisch mit dem Stand vor der Refaktorierung (keine Regression)

**2.2 Modellaufruf**

- [ ] Das Modell kann im Dialogverlauf Bundled Skills und File Commands (Nutzer/Projekt) via `SkillTool` aufrufen
- [ ] MCP-Prompts werden nicht über `SkillTool` geleitet, sondern nativ vom Modell via MCP-Tool-Call-Mechanismus aufgerufen
- [ ] Das Modell darf keine Built-in Commands aufrufen (`userInvocable: true`, `modelInvocable: false`)
- [ ] Die `description` von `SkillTool` enthält die Beschreibungen aller `modelInvocable` Commands

**2.3 Mid-Input-Slash**

- [ ] Mid-Input-Slash: Nach Eingabe von `/` im Textkörper wird der bestpassende Command via Inline-Ghost-Text vorgeschlagen (Annahme per Tab)

---

## Phase 3: Angleichung der User Experience (Verbesserung der Autovervollständigung + Ergänzung fehlender Claude-Code-Commands)

### Ziel

Auf Basis der Metadaten und Command-Fähigkeiten aus Phase 1/2 wird die Autovervollständigung vervollständigt und fehlende Commands ergänzt, die in Claude Code vorhanden, in Qwen Code jedoch nicht implementiert sind.

### Funktionsumfang

#### 3.1 Verbesserung der Autovervollständigung

**Source-Badge**

- Anzeige des Command-Herkunftslabels im Autovervollständigungsmenü (`[MCP]` existiert bereits, Erweiterung um `[Skill]`, `[Custom]` usw.)
- Rendering basierend auf den Feldern `source` / `sourceLabel`

**Argument-Hint**

- Anzeige von `argumentHint` hinter dem Command-Namen im Autovervollständigungsmenü (z. B. `set <model-id>`)
- `argumentHint` wird durch das Metadatenfeld aus Phase 1 bereitgestellt

**Sortierung nach „Recently Used“**

- Protokollierung der zuletzt vom Nutzer verwendeten Commands (Session-Level, keine Persistenz erforderlich)
- Gewichtung kürzlich verwendeter Commands in der Autovervollständigungs-Sortierung

**Hervorhebung bei Alias-Treffern**

- Wenn die Autovervollständigung `altNames` statt des Hauptnamens trifft, wird dies in der Anzeige vermerkt (z. B. `help (alias: ?)`)

**Angleichung der Konfliktstrategie**

- Klare Priorisierung: built-in > bundled/skill-dir > plugin > mcp
- Bei Konflikten werden Commands mit niedrigerer Priorität umbenannt (z. B. `pluginName.commandName`)

#### 3.2 Mid-Input-Slash-Command (Vollversion)

- Erweiterung der Basic-Version aus Phase 2 um Argument-Hints und Source-Badge-Anzeige
- Ghost-Text-Vorschlag (bei Eingabe von `/he` wird `/help` in abgedunkelter Schrift angezeigt)
- Hervorhebung gültiger Command-Tokens (abgeschlossene Slash-Command-Matches werden farblich unterschiedlich dargestellt)

#### 3.3 Refaktorierung des `/help`-Verzeichnisses

Umstellung von `/help` von einer flachen Liste auf ein gruppiertes Verzeichnis:

- **Built-in Commands** (local + local-jsx, mit Modus-Angabe)
- **Bundled Skills**
- **Custom Commands** (Nutzer/Projekt-File-Commands)
- **Plugin Commands**
- **MCP Commands**

Pro Command werden angezeigt: Name, `argumentHint`, `description`, `source`, `supportedModes`-Markierung

#### 3.4 Erweiterung der Metadaten für ACP Available Commands

Bereitstellung zusätzlicher Metadaten für den ACP-Client in `sendAvailableCommandsUpdate()`:

- `argumentHint`
- `source`
- `supportedModes`
- `subcommands` (Liste der Namen)
- `modelInvocable`

#### 3.5 Ergänzung fehlender Claude-Code-Commands

Ergänzung häufig genutzter Commands, die in Claude Code vorhanden, in Qwen Code jedoch aktuell fehlen:

| Command            | Typ     | Beschreibung                             |
| ------------------ | ------- | ---------------------------------------- |
| `/doctor`          | `local` | Umgebungsselbsttest, Ausgabe von Diagnoseinformationen zu Config/Verbindung/Tool-Status |
| `/release-notes`   | `local` | Anzeige des Changelogs der aktuellen Version |
| `/cost`            | `local` | Anzeige des Token-Verbrauchs und der Kostenschätzung der aktuellen Session |

> Hinweis: Task-Commands wie `/review` oder `/commit` werden als Bundled Skills bereitgestellt und sind nicht in dieser Liste enthalten.

### Akzeptanzkriterien

- [ ] Das Autovervollständigungsmenü zeigt Source-Badges an (`[MCP]`, `[Skill]`, `[Custom]`)
- [ ] Das Autovervollständigungsmenü zeigt `argumentHint` an (z. B. `set <model-id>`)
- [ ] Kürzlich verwendete Commands erscheinen priorisiert in der Autovervollständigungsliste
- [ ] Bei Alias-Treffern wird der Originalname im Autovervollständigungseintrag vermerkt
- [ ] Mid-Input-Slash: Ghost-Text-Vorschlag wird korrekt gerendert
- [ ] Die `/help`-Ausgabe ist nach Herkunft gruppiert, jeder Command zeigt unterstützte Modus-Markierungen
- [ ] ACP Available Commands enthalten die Felder `argumentHint`, `source`, `subcommands`
- [ ] Die drei Commands `/doctor`, `/release-notes`, `/cost` sind verfügbar
- [ ] `/doctor` ist im `non-interactive`-Modus ausführbar (gibt `message` zurück)

---

## Abhängigkeiten zwischen den Phasen

```
Phase 1（元数据 + 统一过滤）
    │
    ├──► Phase 2（能力扩展）
    │        │
    │        ├──► slash command 子命令拆分
    │        └──► prompt command 模型调用（需要 getModelInvocableCommands()）
    │
    └──► Phase 3（体验对齐）
             │
             ├──► source badge（需要 Phase 1 source 字段）
             ├──► argument hint（需要 Phase 1 argumentHint 字段）
             └──► Help 分组（需要 Phase 1 source 字段）
```

Phase 2 und Phase 3 sind voneinander unabhängig und können parallel vorangetrieben werden (oder Teilaspekte können je nach Priorität verschoben werden).