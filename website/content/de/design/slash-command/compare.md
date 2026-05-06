# Refactoring-Plan für das Qwen Code Command-Modul

## 1. Zieldefinition

Dieser Plan basiert ausschließlich auf folgenden Prinzipien:

- **Die Code-Architektur muss nicht 1:1 von Claude Code übernommen werden**
- **Die Kernfunktionen, die Benutzererfahrung und die Interaktion des Command-Systems müssen jedoch zu 95 % mit Claude Code übereinstimmen**

„Übereinstimmung“ bezieht sich hier auf direkt vom Nutzer wahrnehmbare Fähigkeiten, darunter:

1. Abdeckung der Command-Quellen
2. Command-Hilfe und Discoverability
3. Command-Vervollständigung und Mid-Input-Slash-Command-Erfahrung
4. Verfügbarkeit in ACP / non-interactive
5. Modell-Aufruffähigkeit für Prompt-Commands / Skills

Dieses Refactoring ist kein bloßes Hinzufügen einiger Felder und auch keine kleine Anpassung des bestehenden `SlashCommand`. Stattdessen wird das Command-Modul von einer „begleitenden Fähigkeit der interaktiven UI“ zu einer „einheitlichen Command-Plattform für interactive / ACP / non-interactive / model“ aufgewertet.

---

## 2. Fazit nach der Neukonzeption

Das Problem des bestehenden Qwen Command-Systems ist nicht ein völliges Fehlen von Fähigkeiten, sondern:

1. Es ist nur im interaktiven Hauptpfad weitgehend vollständig
2. Das Typenmodell ist zu dünn, um ein Produkt auf Claude-Niveau zu tragen
3. ACP / non-interactive hängt von einer Allowlist ab und ist extrem schlecht erweiterbar
4. Command-Quellen existieren zwar, bilden aber kein einheitliches, für den Nutzer sichtbares Konzept
5. Die Offenlegung von Prompt-Commands und Modell-Skills ist fragmentiert

Daher muss der neue Ansatz gleichzeitig vier Dinge lösen:

1. **Die Fähigkeiten von Claude Code nachrüsten**
2. **Die Engineering-Vorteile des einheitlichen Outcome-Modells von Qwen bewahren**
3. **Eine einheitliche Registry / Resolver / Executor / Adapter-Architektur etablieren**
4. **Hilfe, Vervollständigung, ACP available commands und Dokumentation dieselben Metadaten nutzen lassen**

---

## 3. Refactoring-Prinzipien

### 3.1 Funktionsübereinstimmung vor Implementierungsübereinstimmung

Unterschiede sind erlaubt bei:

- Internen Klassennamen
- Modul-Aufteilung
- Executor-Implementierung
- Effect / Outcome-Struktur

Unterschiede sind nicht erlaubt bei:

- Deutlich reduzierter Abdeckung der Command-Quellen
- Deutlich reduzierter Command-Hilfe und Vervollständigungserfahrung
- Deutlich reduzierter Verfügbarkeit in ACP / non-interactive
- Deutlich reduzierter Integration von Prompt-Commands und Modellfähigkeiten

Bei Zielkonflikten gilt folgende Priorität:

1. Übereinstimmung der Benutzererfahrung
2. Übereinstimmung der Command-Fähigkeitsabdeckung
3. Übereinstimmung der Moduskonsistenz
4. Einfachheit der internen Implementierung

### 3.2 Bewahrung des einheitlichen Outcome-Modells von Qwen

Eine mechanische Kopie der Claude-Implementierung wird nicht empfohlen.

Das aktuelle einheitliche Ergebnismodell von Qwen sollte beibehalten werden, da es sich natürlich eignet für:

- UI-Übernahme
- Genehmigung/Bestätigung
- Tool-Dispatching
- Prompt-Übermittlung
- Modusübergreifende Anpassung

Es muss jedoch so erweitert werden, dass es Command-Fähigkeiten auf Claude-Niveau tragen kann, anstatt weiterhin als vereinfachtes UI-Command-Framework zu existieren.

### 3.3 Typ, Quelle, Modus und Sichtbarkeit müssen vollständig entkoppelt werden

Das neue Command-Modell muss mindestens folgende Dimensionen trennen:

1. **Typ**: Wie der Command ausgeführt wird
2. **Quelle**: Woher der Command stammt
3. **Modus-Fähigkeiten**: In welchen Laufzeitumgebungen er verfügbar ist
4. **Sichtbarkeit**: Ob er für den Nutzer oder für das Modell sichtbar ist

---

## 4. Claude Code-Fähigkeiten, die angeglichen werden müssen

### 4.1 Command-Typen

Qwen muss explizit drei Command-Typen unterstützen:

1. `prompt`
2. `local`
3. `local-jsx`

### 4.2 Command-Quellen

Das Qwen Command-Schema muss ab Phase 1 folgende Quellen abdecken:

1. built-in commands
2. bundled skills
3. skill dir commands
4. workflow commands
5. plugin commands
6. plugin skills
7. dynamic skills
8. mcp prompts
9. mcp skills

Hier darf kein Rückfall auf „erstmal nur die aktuell vorhandenen Typen unterstützen“ erfolgen.

### 4.3 Command-Metadaten

Mindestens folgende Felder müssen ergänzt werden:

1. `argumentHint`
2. `whenToUse`
3. `examples`
4. `sourceLabel`
5. `userFacingName`
6. `alias`
7. `immediate`
8. `isSensitive`
9. `userInvocable`
10. `modelInvocable`
11. `supportedModes`
12. `requiresUi`

### 4.4 Experience-Fähigkeiten

Mindestens folgende Erfahrungen müssen ergänzt werden:

1. Vervollständigung bei Alias-Treffern
2. Source-Badge
3. Parameter-Hinweise
4. Sortierung nach „recently used“
5. Erkennung und Vervollständigung von Mid-Input-Slash-Commands
6. Verzeichnisartige Help
7. Vollständige Darstellung von ACP available commands

---

## 5. Neues Command-Modell

## 5.1 Kernstruktur

Es wird empfohlen, einen einheitlichen `CommandDescriptor` als Registrierungsformat für alle Commands einzuführen.

Er umfasst mindestens vier Teile:

1. `identity`
2. `metadata`
3. `capabilities`
4. `handler`

### `identity`

- `id`
- `name`
- `altNames`
- `canonicalPath`

### `metadata`

- `description`
- `argumentHint`
- `whenToUse`
- `examples`
- `group`
- `source`
- `sourceLabel`
- `userFacingName`
- `hidden`

### `capabilities`

- `type`: `prompt | local | local-jsx`
- `supportedModes`: `interactive | acp | non_interactive`
- `requiresUi`
- `supportsDialog`
- `supportsStreaming`
- `supportsToolInvocation`
- `supportsConfirmation`
- `remoteSafe`
- `readOnly`
- `immediate`
- `isSensitive`
- `userInvocable`
- `modelInvocable`

### `handler`

- `resolveArgs()`
- `execute()`
- `completion()`
- `fallback()`

---

## 5.2 Verantwortlichkeiten der drei Command-Typen

### `prompt`

Verwendet für:

- skills
- file commands
- workflow prompt commands
- plugin skills
- mcp prompt / skill

Merkmale:

- Erzeugt prompt / skill-Assets
- Standardmäßig unterstützt: interactive / ACP / non-interactive
- Kann vom Nutzer oder vom Modell aufgerufen werden

### `local`

Verwendet für:

- Abfrage-Commands
- Konfigurations-Commands
- Headless ausführbare Status-Commands
- Kernausführungseinstieg für die meisten built-in commands

Merkmale:

- UI-unabhängig
- Soll der primäre Trägertyp für ACP / non-interactive werden

### `local-jsx`

Verwendet für:

- picker
- Panels
- wizard
- interactive UI shell

Merkmale:

- Verarbeitet ausschließlich interactive UI
- Darf nicht mehr der einzige Ausführungseinstieg sein
- Muss einen Fallback oder entsprechende local-Subcommands bereitstellen

---

## 6. Command-Quellenmodell

## 6.1 Externes Quellenmodell

Dies ist das für den Nutzer sichtbare Quellenmodell und muss sich möglichst am mentalen Modell von Claude Code orientieren:

- `builtin-command`
- `bundled-skill`
- `skill-dir-command`
- `workflow-command`
- `plugin-command`
- `plugin-skill`
- `dynamic-skill`
- `builtin-plugin-skill`
- `mcp-prompt`
- `mcp-skill`

Diese Felder werden direkt verwendet für:

- Help-Gruppierung
- Completion-Source-Badge
- ACP available commands
- Dokumentationsexport

## 6.2 Internes Normalisierungsmodell

Um nicht an externe Namen gebunden zu sein, wird intern eine zusätzliche Implementierungsebene hinzugefügt:

- `providerType`
- `artifactType`
- `activationMode`
- `builtinProvided`
- `originPath`
- `namespace`

Dadurch wird Folgendes erreicht:

- Die externe Erfahrung wird an Claude angeglichen
- Die interne Implementierung bleibt wartbar im Qwen-Stil

## 6.3 Konfliktstrategie

Einheitliche Verwaltung über stabile `id`, Trennung von Anzeigenamen und Eingabenamen:

1. `id`: Stabiler, eindeutiger Bezeichner
2. `name`: Primärer Eingabename
3. `userFacingName`: Anzeigename für Hilfe/Vervollständigung

Empfohlene Priorität bei Konflikten:

1. built-in
2. bundled / skill-dir / workflow
3. plugin / builtin-plugin
4. dynamic
5. mcp-eigener Namespace

---

## 7. Einheitliche Ausführungsarchitektur

## 7.1 `CommandRegistry`

Verantwortlichkeiten:

1. Aggregation aller Loader/Provider
2. Aufbau multidimensionaler Indizes
3. Ausgabe von Hilfe-, Vervollständigungs-, ACP- und Dokumentationsansichten
4. Bereitstellung separater Ansichten für nutzer- und modellsichtbare Commands

Zu unterstützende Provider:

1. `BuiltinCommandLoader`
2. `BundledSkillLoader`
3. `FileCommandLoader`
4. `McpPromptLoader`
5. `WorkflowCommandLoader`
6. `PluginCommandLoader`
7. `PluginSkillLoader`
8. `DynamicSkillProvider`
9. `BuiltinPluginSkillLoader`

Auch wenn einige Provider in der ersten Phase nicht vollständig implementiert sind, müssen Schema und API sie bereits unterstützen.

## 7.2 `CommandResolver`

Verantwortlichkeiten:

1. Parsen von Slash-Commands
2. Parsen von Aliases
3. Parsen von Subcommand-Pfaden
4. Erkennung von Mid-Input-Slash-Tokens
5. Ausgabe des canonical resolved command

## 7.3 `CommandExecutor`

Verantwortlichkeiten:

1. Durchführung von Capability-Checks
2. Ausführung von `prompt | local | local-jsx`
3. Einheitliche Generierung von Outcomes
4. Behandlung von Fallback / unsupported

## 7.4 `ModeAdapter`

Es müssen drei Adapter extrahiert werden:

1. `InteractiveModeAdapter`
2. `AcpModeAdapter`
3. `NonInteractiveModeAdapter`

Nur so können alle drei Modi dieselbe Command-Registry und denselben Executor nutzen, anstatt jeweils hartkodiert zu sein.

---

## 8. Refactoring-Prinzipien für UI-Commands: Trennung von Kern-Command und Interaktions-Shell

Dies ist der Schlüssel zur tatsächlichen Nutzbarkeit in ACP und non-interactive.

Jeder Command, der im Wesentlichen ein „Dialog öffnen“ ist, muss umgebaut werden zu:

1. Einer interactive shell
2. Einer Gruppe von local-Subcommands

### Erste Charge der Commands, die aufgeteilt werden müssen

1. `/model`
2. `/permissions`
3. `/mcp`
4. `/resume`
5. `/hooks`
6. `/extensions`
7. `/agents`
8. `/approval-mode`

### Beispiel für die Zielstruktur

#### `/model`

- `/model`
- `/model show`
- `/model list`
- `/model set <id>`

#### `/permissions`

- `/permissions`
- `/permissions show`
- `/permissions set <mode>`
- `/permissions allow <tool>`
- `/permissions deny <tool>`

#### `/mcp`

- `/mcp`
- `/mcp list`
- `/mcp show <server>`
- `/mcp enable <server>`
- `/mcp disable <server>`

---

## 9. Einheitliches Design für Prompt Command / Skill

Dies ist P0 im Refactoring und keine nachträgliche Ergänzung.

## 9.1 Ziel

Aufbau einer einheitlichen **Model-Invocable Prompt Command Registry**, die folgende Assets in einer für das Modell aufrufbaren Ansicht zusammenführt:

1. bundled skills
2. file commands
3. workflow prompt commands
4. plugin skills
5. mcp prompts / mcp skills

## 9.2 Schlüsselfelder

Müssen neu hinzugefügt werden:

1. `userInvocable`
2. `modelInvocable`
3. `allowedTools`
4. `whenToUse`
5. `argSchema` oder minimale Parameterbeschreibung
6. `contextMode: inline | fork`
7. `agent`
8. `effort`

## 9.3 Beziehung zu `SkillTool`

Nach dem Refactoring sollte `SkillTool` nicht mehr ausschließlich eng gefasste Skills konsumieren.

Stattdessen sollte Folgendes gelten:

1. `CommandRegistry.getModelInvocablePromptCommands()` liefert eine einheitliche Ansicht
2. `SkillTool` oder ein zukünftiges einheitliches Command-Tool konsumiert diese Ansicht
3. Nutzer-Slash-Commands und Modell-Skill-Invocations nutzen denselben Prompt-Command-Asset-Pool

Nur so kann Qwen in der Benutzererfahrung an die Art und Weise von Claude herankommen, wie Fähigkeiten wie `/review`, `/commit` oder `/openspec-apply` behandelt werden.

---

## 10. Neugestaltung von Help / Completion / Discoverability

## 10.1 Completion

Vervollständigungseinträge müssen mindestens anzeigen:

1. `label`
2. `description`
3. `argumentHint`
4. `sourceBadge`
5. `modeBadges`
6. `aliasHit`
7. `recentlyUsedScore`

Die Sortierung muss mindestens berücksichtigen:

1. Exakte Treffer
2. Alias-Treffer
3. Zuletzt verwendet
4. Prefix-Treffer
5. Fuzzy-Treffer

## 10.2 Mid-input slash command

Muss ergänzt werden:

1. Erkennung von Slash-Tokens in der Nähe des Cursors
2. Ghost-Text-Hinweise
3. Tab-Vervollständigung
4. Hervorhebung gültiger Command-Tokens

In Phase 1 wird zunächst die Eingabeerfahrung angeglichen; die Einführung einer stärkeren „Inline-Command-Ausführungssemantik“ kann in späteren Iterationen erfolgen.

## 10.3 Help

Help ist keine flache Liste mehr, sondern ein vollständiges Command-Verzeichnis.

Mindestens gruppiert in:

1. Built-in Commands
2. Bundled Skills
3. Skill Dir Commands
4. Workflow Commands
5. Plugin Commands
6. Plugin Skills
7. Dynamic Skills
8. Builtin Plugin Skills
9. MCP Commands / MCP Skills

Jeder Command zeigt mindestens:

1. Name
2. Parameter-Hinweis
3. Beschreibung
4. Quelle
5. Unterstützte Modi
6. Ob modell-aufrufbar
7. Subcommand-Zusammenfassung

---

## 11. Refactoring für ACP / Non-Interactive

## 11.1 Vollständige Abschaffung des Allowlist-Ansatzes

Alter Ansatz:

- built-in allowlist
- Sonderbehandlung für FILE / SKILL
- Andere Ergebnistypen: unsupported

Neuer Ansatz:

- Jeder Command deklariert seine eigenen Capabilities
- Die Registry ist für das Filtern zuständig
- Der Adapter ist für Ausführung und Fallback zuständig

## 11.2 Unterstützte Outcome-Ziele

### interactive

- `submit_prompt`
- `message`
- `stream_messages`
- `tool`
- `dialog`
- `load_history`
- `confirm_action`
- `confirm_shell_commands`

### acp

- `submit_prompt`
- `message`
- `stream_messages`
- `tool`
- `confirm_action`
- `confirm_shell_commands`
- `dialog fallback`

### non_interactive

- `submit_prompt`
- `message`
- `stream_messages`
- `tool`
- `confirm_action`
- `confirm_shell_commands`
- `dialog fallback / structured failure`

## 11.3 Ausgabe von ACP available commands

Muss mindestens enthalten:

1. `name`
2. `description`
3. `argumentHint`
4. `source`
5. `examples`
6. `supportedModes`
7. `interactiveOnly`
8. `subcommands`
9. `modelInvocable`

---

## 12. Dokumentation, Hilfe und Vervollständigung nutzen dieselben Metadaten

Nach dem Refactoring müssen folgende Inhalte aus derselben Registry-Ansicht exportiert werden:

1. Help
2. Completion
3. ACP available commands
4. Dokumentationsexport

Dies dient dazu, das aktuelle Problem der „inkonsistenten Command-Oberflächen in Implementierung, Hilfe und Dokumentation“ zu lösen.

---

## 13. Implementierungsphasen

## Phase 1: Fundament-Neubau

Lieferumfang:

1. Neuer `CommandDescriptor`
2. Vollständiges Quellen-Schema
3. Capability-Modell
4. `userInvocable / modelInvocable`
5. `CommandRegistry`
6. `CommandResolver`
7. `CommandExecutor`
8. Drei `ModeAdapter`
9. `getModelInvocablePromptCommands()`

## Phase 2: Migration der Kern-Commands

Lieferumfang:

1. `/model`
2. `/permissions`
3. `/mcp`
4. `/resume`
5. `/hooks`
6. `/extensions`
7. `/agents`
8. `/approval-mode`

Alle diese Commands müssen das „interactive shell + local-Subcommand“-Refactoring abschließen.

## Phase 3: Integration der Modellfähigkeiten

Lieferumfang:

1. `SkillTool` an die einheitliche Registry-Ansicht anbinden
2. File-Command / Bundled-Skill / MCP-Prompt / Plugin-Skill in die einheitliche model-invocable-Menge aufnehmen
3. Prompt-Command- und Skill-Assets vollständig vereinheitlichen

## Phase 4: Angleichung der Experience-Schicht an Claude

Lieferumfang:

1. Sortierung nach „recently used“
2. Source-Badge
3. Argument-Hinweis
4. Mode-Badge
5. Vollständiges Help-Verzeichnis
6. Mid-Input-Slash-Command-Erfahrung
7. Automatischer Dokumentationsexport oder Validierung

---

## 14. Abnahmekriterien

Nach Abschluss müssen mindestens folgende Kriterien erfüllt sein:

1. Hilfe, Vervollständigung, ACP und Dokumentation können das vollständige Quellenmodell abbilden
2. Die meisten built-in commands sind in ACP / non-interactive nutzbar (außer reine UI-Shell-Commands)
3. Prompt-Commands und Modell-Skill-Aufrufe nutzen denselben Asset-Pool
4. Die Command-Erfahrung erreicht in Hilfe, Vervollständigung, Quellendarstellung, Parameter-Hinweisen und Mid-Input-Erfahrung 95 % des Niveaus von Claude Code
5. Keine Abhängigkeit mehr von einer built-in allowlist zur Aufrechterhaltung der ACP / non-interactive Command-Fähigkeiten

---

## 15. Fazit

Der Kern dieses Refactorings ist nicht „ein paar Felder zum bestehenden SlashCommand hinzuzufügen“, sondern:

- **Mit dem internen Architekturstil von Qwen eine Command-Plattform zu liefern, die in der externen Erfahrung zu 95 % mit Claude Code übereinstimmt**

Falls eine Wahl getroffen werden muss:

- Die interne Implementierung ähnelt Claude
- Die externe Erfahrung ähnelt Claude

Dieser Plan wählt explizit Letzteres.