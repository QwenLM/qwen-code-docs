# Slash-Befehl-Roadmap für die Umstrukturierung

## Gesamtziel

Mit der internen Architektur von Qwen soll eine Befehlsplattform bereitgestellt werden, die zu 95 % an die externe Benutzererfahrung von Claude Code angepasst ist. Gleichzeitig werden drei Kernprobleme behoben: die Aufspaltung in drei Modi, die einheitliche Quelle von Befehlen und die fehlende Modellaufrufbarkeit von Prompt-Befehlen.

---

## Kernentwurfsprinzipien

1. **Jede Phase kann unabhängig ausgeliefert werden**: Das Verhalten nach Abschluss ist in sich konsistent und benötigt keine nachfolgenden Phasen, um zu funktionieren.
2. **Phase 1 ist reine Infrastruktur**: Mit Ausnahme der Reparatur des fälschlicherweise blockierten MCP_PROMPT werden keine Änderungen an den derzeit verfügbaren Befehlssätzen vorgenommen.
3. **Verhaltensänderungen und Architekturänderungen werden getrennt**: Phase 1 befasst sich mit der Architektur, Phase 2 mit der Erweiterung der Fähigkeiten.
4. **Keine direkte Nachbildung der internen Architektur von Claude Code**: Jedoch Anpassung an die vom Benutzer wahrnehmbare Fähigkeitsoberfläche.

---

## Phase 1: Infrastrukturaufbau (reine Architektur, Null Verhaltensänderung)

### Ziel

Einheitliches Befehlsmetadatenmodell und mechanismusübergreifende Verwaltung etablieren, um die Grundlage für alle nachfolgenden Phasen zu schaffen.

### Funktionspunkte

#### 1.1 Erweiterung des `SlashCommand`-Metadatenmodells

Hinzufügen der folgenden Felder zur bestehenden `SlashCommand`-Schnittstelle:

**Quellenfelder**

- `source: CommandSource`: Aufzählung der Befehlsquelle (`builtin-command` / `bundled-skill` / `skill-dir-command` / `plugin-command` / `mcp-prompt` usw.)
- `sourceLabel?: string`: Anzeigelabel für die Quelle (z. B. `"Built-in"` / `"MCP: github-server"`)

**Modusfähigkeitsfelder**

- `supportedModes: ExecutionMode[]`: Gibt an, in welchen Ausführungsmodi der Befehl verfügbar ist (`interactive` / `non_interactive` / `acp`)

**Ausführungstypfeld**

- `commandType: CommandType`: Gibt den Ausführungstyp an (`prompt` / `local` / `local-jsx`)

**Sichtbarkeitsfelder**

- `userInvocable: boolean`: Ob der Befehl vom Benutzer über den Slash-Befehl aufgerufen werden kann (Standard `true`)
- `modelInvocable: boolean`: Ob der Befehl vom Modell über einen Tool-Aufruf aufgerufen werden kann (Standard `false`)

**Hilfsmetadatenfelder** (für Phase 3 reserviert, Phase 1 definiert nur, verwendet nicht)

- `argumentHint?: string`: Hinweis zu Argumenten, z. B. `"<model-id>"` / `"show|list|set"`
- `whenToUse?: string`: Erläuterung, wann der Befehl verwendet werden soll (für das Modell)
- `examples?: string[]`: Verwendungsbeispiele

#### 1.2 Loader füllen source/commandType-Felder

Jeder Loader muss beim Erstellen von `SlashCommand` die Felder `source` und `commandType` ausfüllen:

| Loader                           | source              | commandType                           |
| -------------------------------- | ------------------- | ------------------------------------- |
| `BuiltinCommandLoader`           | `builtin-command`   | Von den jeweiligen Befehlen deklariert (`local` / `local-jsx`) |
| `BundledSkillLoader`             | `bundled-skill`     | `prompt`                              |
| `FileCommandLoader` (Benutzer/Projekt) | `skill-dir-command` | `prompt`                              |
| `FileCommandLoader` (Plugin)      | `plugin-command`    | `prompt`                              |
| `McpPromptLoader`                | `mcp-prompt`        | `prompt`                              |

#### 1.3 Built-in-Befehle deklarieren `supportedModes` und `commandType`

Für alle Built-in-Befehle explizit deklarieren:

- `commandType`: `local` (keine UI-Abhängigkeit) oder `local-jsx` (abhängig von Dialog/React)
- `supportedModes`: `local`-Befehle deklarieren `['interactive', 'non_interactive', 'acp']`; `local-jsx`-Befehle deklarieren `['interactive']`

#### 1.4 Ersetzen der hartcodierten Whitelist durch capability-basierte Filterung

- Löschen der Konstanten `ALLOWED_BUILTIN_COMMANDS_NON_INTERACTIVE`
- Löschen der Funktion `filterCommandsForNonInteractive`
- Neue Funktion `filterCommandsForMode(commands, mode)` hinzufügen, die auf Basis des Feldes `supportedModes` filtert
- Neue Hilfsfunktion `getEffectiveSupportedModes(cmd)` hinzufügen (unter Berücksichtigung der Standardstrategie von CommandKind)
- Ändern der Funktionssignaturen von `handleSlashCommand` / `getAvailableCommands`, Parameter `allowedBuiltinCommandNames` entfernen

#### 1.5 CommandService zu einer einheitlichen Registry aufwerten

- Neue Methode `getCommandsForMode(mode: ExecutionMode)` hinzufügen
- Neue Methode `getModelInvocableCommands()` hinzufügen (von Phase 2/3 verwendet, Phase 1 stellt Schnittstelle bereit)
- Bestehende Methode `getCommands()` bleibt unverändert (von interactive verwendet)

### Abnahmekriterien

- [ ] `SlashCommand`-Schnittstelle enthält alle neuen Felder, TypeScript-Kompilierung erfolgreich
- [ ] Alle Loader füllen die Felder `source` und `commandType` aus
- [ ] Alle Built-in-Befehle deklarieren `commandType` und `supportedModes`
- [ ] `ALLOWED_BUILTIN_COMMANDS_NON_INTERACTIVE` gelöscht, durch capability-Filter ersetzt
- [ ] **Der Satz verfügbarer Befehle im nicht-interaktiven Modus ist mit dem vor der Umstrukturierung identisch** (bestehende Tests brechen nicht)
- [ ] MCP-Prompt-Befehle können im nicht-interaktiven/acp-Modus normal ausgeführt werden (Reparatur der ursprünglichen fehlerhaften Einschränkung)
- [ ] `CommandService.getCommandsForMode('non_interactive')` gibt den korrekten Befehlssatz zurück
- [ ] Alle bestehenden Tests bestehen

---

## Phase 2: Fähigkeitserweiterung (Befehlsbereinigung und Modellaufruf von Prompt-Befehlen)

### Ziel

Auf der Metadatenbasis von Phase 1 den verfügbaren Befehlsumfang in den drei Modi erweitern und den Modellaufrufpfad für Prompt-Befehle öffnen.

### Funktionspunkte

#### 2.1 Erweiterung des verfügbaren Befehlssatzes für non_interactive / acp

**Designprinzipien für ACP-Semantik**

Bevor Befehle auf den ACP/non-interactive-Modus erweitert werden, müssen die folgenden Designprinzipien beachtet werden:

1. **Anderer Empfänger**: Im ACP-Modus ist der Empfänger der Nachricht die IDE (Zed/VS Code-Plugin), nicht der Endbenutzer. Der Nachrichteninhalt sollte im Klartext- oder Markdown-Format vorliegen und keine terminal-spezifischen ANSI-Stile enthalten.
2. **Implementierungsstrategie ist das Hinzufügen eines Moduszweigs, nicht das Ersetzen**: Die richtige Vorgehensweise besteht darin, innerhalb der `action` eines Befehls eine Modusprüfung hinzuzufügen – der interaktive Pfad behält die bestehende UI-Rendering-Logik bei, der non_interactive/acp-Pfad gibt eine für den Maschinenkonsum geeignete `message` oder `submit_prompt` zurück. Beide Pfade koexistieren in derselben `action`-Funktion.
3. **Zustandsbehaftete Operationen müssen semantisch erläutert werden**: Bei einem einmaligen nicht-interaktiven Aufruf (z. B. CLI `-p`-Parameter) sind Änderungen zustandsbehafteter Befehle wie `/model set`, `/language set` nur innerhalb dieser Sitzung gültig. Dies sollte im Antworttext des Befehls vermerkt werden.
4. **Schreibgeschützt vs. mit Nebenwirkungen**: Schreibgeschützte Befehle (z. B. `/about`, `/stats`) geben direkt den aktuellen Zustandstext zurück; Befehle mit Nebenwirkungen (z. B. `/model set`, `/language set`) müssen das Ergebnis der Operation im Antworttext bestätigen.
5. **Umgebungsabhängige Nebenwirkungen vermeiden**: Operationen, die auf eine grafische Umgebung angewiesen sind, wie das Öffnen eines Browsers (`/docs`, `/insight`) oder das Bearbeiten der Zwischenablage (`/copy`), sollten im non_interactive/acp-Pfad übersprungen werden. Stattdessen sollten die zugehörige URL oder der Inhalt selbst im Antworttext zurückgegeben werden.

**Übersicht der zu erweiternden Befehle**

> Hinweis: `btw`, `bug`, `compress`, `context`, `init`, `summary` wurden bereits in Phase 1 auf alle Modi erweitert und sind nicht in dieser Liste.

Die folgenden 13 Befehle werden in Phase 2 auf die Modi `non_interactive` und `acp` erweitert:

**Kategorie A: action gibt bereits `message` oder `submit_prompt` zurück, es müssen nur `supportedModes` erweitert und ACP-Nachrichteninhalt gestaltet werden**

| Befehl        | Rückgabetyp       | ACP/non-interactive-Behandlungspunkte                       |
| ------------- | ----------------- | -------------------------------------------------- |
| `/copy`       | `message`         | Keine Zwischenablage im ACP; stattdessen Inhalt selbst oder Hinweis im Antworttext zurückgeben |
| `/export`     | `message`         | Vollständigen Pfad der exportierten Datei zurückgeben                             |
| `/plan`       | `submit_prompt`   | Keine Änderung nötig, Modus direkt erweitern                             |
| `/restore`    | `message`         | Ergebnisbeschreibung der Wiederherstellungsoperation zurückgeben                             |
| `/language`   | `message`         | Aktuelle Spracheinstellung oder Bestätigungstext der Änderung zurückgeben                     |
| `/statusline` | `submit_prompt`   | Keine Änderung nötig, Modus direkt erweitern                             |

**Kategorie A': Mit Argumenten normal ausführen, ohne Argumente Dialog auslösen (non-interactive-Behandlung für den Pfad ohne Argumente muss hinzugefügt werden)**
| Befehl           | Interaktives Verhalten (keine Argumente) | Nicht-interaktives / ACP-Verhalten (keine Argumente) |
| ---------------- | ---------------------------------------- | ----------------------------------------------------- |
| `/model`         | Öffnet den Modellauswahl-Dialog          | Gibt den aktuellen Modellnamen und erklärenden Text zurück |
| `/approval-mode` | Öffnet den Genehmigungsmodus-Dialog      | Gibt den aktuellen Genehmigungsmodus und erklärenden Text zurück |

**Klasse B: Aktionen, die intern `context.ui.addItem()` zum Rendern von React-Komponenten verwenden, benötigen einen Modus-Zweig zur Rückgabe von reinem Text**

| Befehl     | Interaktives Verhalten                         | Nicht-interaktives / ACP-Rückgabeinhalt                                                           |
| ---------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `/about`   | Rendert eine React-Komponente mit Version/Konfiguration | Reine Textzusammenfassung von Version, aktuellem Modell und wichtigen Konfigurationen            |
| `/stats`   | Rendert eine Token-/Kostenstatistik-Komponente | Reine Textdarstellung der Session-Statistiken                                                     |
| `/insight` | Rendert Analysekomponente + öffnet Browser     | `non_interactive`: generiert synchron und gibt Dateipfad zurück; `acp`: pusht Fortschritt und Ergebnis via `stream_messages` |
| `/docs`    | Rendert Dokumentationseinstieg + öffnet Browser | Gibt Dokumentations-URL zurück, öffnet keinen Browser                                             |

**Klasse C: Sonderbehandlung**

| Befehl    | Interaktives Verhalten                       | Nicht-interaktives / ACP-Verhalten                                                                                              |
| --------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `/clear`  | Ruft `context.ui.clear()` auf, leert die Terminal-Anzeige | Gibt eine Context-Boundary-Markierungsnachricht mit dem Inhalt `"Context cleared. Previous messages are no longer in context."` zurück |

#### 2.2 Prompt-Command-Modellaufruf-Integration

- Implementiere `getModelInvocableCommands()` in `CommandService` (oder `CommandRegistry`), die alle Befehle mit `modelInvocable: true` zurückgibt.
- Markiere Befehle, die von `BundledSkillLoader` und `FileCommandLoader` (Benutzer-/Projektbefehle) geladen werden, als `modelInvocable: true`.
- **MCP-Prompt nicht als `modelInvocable` markieren**: MCP-Prompt wird über den unabhängigen MCP-Tool-Call-Mechanismus vom Modell aufgerufen und benötigt keine Vermittlung durch `SkillTool`.
- Überarbeite `SkillTool`: Statt nur `SkillManager.listSkills()` zu konsumieren, konsumiere nun auch `CommandService.getModelInvocableCommands()`.
- Erstelle eine einheitliche Beschreibung der modellaufrufbaren Befehle und füge sie in die `description` von `SkillTool` ein.

#### 2.3 Mid-Input-Slash-Command-Erkennung (Basisversion)

- Erkenne in `InputPrompt` einen Slash-Token in der Nähe des Cursors (nicht auf Zeilenanfang beschränkt).
- Zeige nach Erkennung eines Slash-Tokens den bestpassenden Befehlsnamen als Inline-Geistertext an (Tab zum Akzeptieren).
- **Nicht** enthalten: Dropdown-Vervollständigungsmenü, Argument-Hinweise, Quell-Badge usw. (Phase 3).
- Der Geistertext-Kandidatensatz beschränkt sich auf Befehle mit `modelInvocable: true` (Skill/Datei-Befehle).

### Abnahmekriterien

**2.1 Befehlserweiterung**

- [ ] Klasse A: `/copy`, `/export`, `/plan`, `/restore`, `/language`, `/statusline` können im nicht-interaktiven und ACP-Modus normal ausgeführt werden und sinnvollen Text ausgeben.
- [ ] Klasse A': `/model`, `/approval-mode` geben ohne Argumente im nicht-interaktiven/ACP-Modus den aktuellen Status als Text zurück (kein Dialog); mit Argumenten führen sie die Änderung durch und geben Bestätigungstext zurück.
- [ ] Klasse B: `/about`, `/stats`, `/docs` geben im nicht-interaktiven/ACP-Modus reinen Text zurück; `/docs` öffnet keinen Browser; `/insight` generiert im `non_interactive`-Modus synchron eine Dateipfad-Nachricht, im `acp`-Modus pusht es den Fortschritt via `stream_messages`.
- [ ] Klasse C: `/clear` gibt im nicht-interaktiven/ACP-Modus eine Context-Boundary-Markierungsnachricht zurück, ohne `context.ui.clear()` aufzurufen.
- [ ] Das Verhalten aller erweiterten Befehle im interaktiven Modus ist identisch mit dem vor der Umstrukturierung (keine Regression).

**2.2 Modellaufruf**

- [ ] Das Modell kann über `SkillTool` im Dialog gebündelte Skills und Datei-Befehle (Benutzer/Projekt) aufrufen.
- [ ] MCP-Prompt wird nicht über `SkillTool` geleitet, sondern nativ über den MCP-Tool-Call-Mechanismus vom Modell aufgerufen.
- [ ] Das Modell kann keine Built-in-Befehle aufrufen (`userInvocable: true`, `modelInvocable: false`).
- [ ] Die `description` von `SkillTool` enthält die Beschreibungen aller `modelInvocable`-Befehle.

**2.3 Mid-Input-Slash**

- [ ] Mid-Input-Slash: Nach Eingabe von `/` im Text wird der bestpassende Befehl als Inline-Geistertext angezeigt (Tab akzeptiert).

---

## Phase 3: Erlebnisangleichung (Vervollständigungsverbesserung + Claude-Code-Befehlsergänzung)

### Ziel

Basierend auf den Metadaten und Befehlskapazitäten von Phase 1/2 die Vervollständigungserfahrung verbessern und die in Claude Code vorhandenen, aber in Qwen Code fehlenden Befehle ergänzen.

### Funktionspunkte

#### 3.1 Verbesserung der Vervollständigungserfahrung

**Quellen-Badge**

- Zeige im Vervollständigungsmenü die Befehlsquelle als Badge an (`[MCP]` bereits vorhanden, erweitern auf `[Skill]`, `[Custom]` usw.).
- Verwende die Felder `source` / `sourceLabel` zum Rendern.

**Argument-Hinweis**

- Zeige im Vervollständigungsmenü nach dem Befehlsnamen den `argumentHint` an (z.B. `set <model-id>`).
- `argumentHint` wird durch die Metadaten aus Phase 1 bereitgestellt.

**Sortierung nach kürzlich verwendet**

- Zeichne die zuletzt vom Benutzer verwendeten Befehle auf (Session-Ebene, keine Persistenz erforderlich).
- Gewichte kürzlich verwendete Befehle in der Vervollständigungssortierung höher.

**Alias-Treffer-Hervorhebung**

- Wenn ein Vervollständigungstreffer über `altNames` statt über den Hauptnamen erfolgt, wird dies in der Anzeige vermerkt (z.B. `help (alias: ?)`).

**Konfliktstrategie-Angleichung**

- Klare Priorität: Built-in > Bundled/Skill-Dir > Plugin > MCP.
- Bei Konflikten wird der niederpriore Befehl umbenannt (z.B. `pluginName.commandName`).

#### 3.2 Mid-Input-Slash-Command (Vollversion)

- Ergänze die Basisversion aus Phase 2 um Argument-Hinweise und Quellen-Badge-Anzeige.
- Geistertext-Hinweis (bei Eingabe von `/he` wird `/help` in blasser Schrift angezeigt).
- Hervorhebung von gültigen Befehls-Token (bereits abgeschlossene Slash-Befehle werden in einer anderen Farbe dargestellt).

#### 3.3 Hilfe-Neuordnung

Die `/help`-Ansicht von einer flachen Liste in eine gruppierte Struktur umwandeln:

- **Built-in Commands** (local + local-jsx, Modusangabe)
- **Bundled Skills**
- **Custom Commands** (Benutzer-/Projekt-Datei-Befehle)
- **Plugin Commands**
- **MCP Commands**

Jeder Befehl zeigt: Name, argumentHint, description, source, supportedModes-Markierungen.

#### 3.4 ACP-Verfügbare-Befehle-Metadaten-Erweiterung

Erweitere die in `sendAvailableCommandsUpdate()` bereitgestellten Metadaten für ACP-Clients um:

- `argumentHint`
- `source`
- `supportedModes`
- `subcommands` (Liste der Namen)
- `modelInvocable`

#### 3.5 Vervollständigung fehlender Claude-Code-Befehle

Bestätige und integriere den bereits in Qwen Code vorhandenen Befehl `/doctor`; `/release-notes` wird in dieser Phase nicht aufgenommen, um keine Built-in-Befehle ohne klare Produktanforderung einzuführen.

| Befehl     | Typ     | Beschreibung                                   |
| ---------- | ------- | ---------------------------------------------- |
| `/doctor`  | `local` | Umgebungsdiagnose, gibt Konfiguration/Verbindung/Tool-Status aus |

> Hinweis: Aufgabenorientierte Befehle wie `/review`, `/commit` werden als Bundled Skills bereitgestellt und sind hier nicht aufgeführt.

### Abnahmekriterien

- [ ] Das Vervollständigungsmenü zeigt Quellen-Badges (`[MCP]`, `[Skill]`, `[Custom]`).
- [ ] Das Vervollständigungsmenü zeigt Argument-Hinweise an (z.B. `set <model-id>`).
- [ ] Kürzlich verwendete Befehle erscheinen bevorzugt in der Vervollständigungsliste.
- [ ] Bei Aliastreffern wird der ursprüngliche Name in der Vervollständigung vermerkt.
- [ ] Mid-Input-Slash: Geistertext-Hinweise werden korrekt gerendert.
- [ ] `/help` wird im Claude-Code-Stil in Tabs gruppiert, um eine Überfrachtung zu vermeiden, und zeigt auf der Befehlsseite unterstützte Modus-Markierungen an.
- [ ] ACP-Verfügbare-Befehle enthalten die Felder `argumentHint`, `source`, `subcommands`.
- [ ] Der Befehl `/doctor` ist verfügbar.
- [ ] `/doctor` ist im nicht-interaktiven Modus ausführbar (gibt `message` zurück).
- [ ] Kein neuer Befehl `/release-notes`.
---

## Abhängigkeiten der Phasen

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

Phase 2 und Phase 3 sind voneinander unabhängig und können parallel vorangetrieben werden (oder einzelne Unterpunkte nach Priorität getauscht werden).
