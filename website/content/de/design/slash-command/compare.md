# Qwen Code Command-Modul: Umstrukturierungsplan

## 1. Zieldefinition

Dieser Plan basiert auf dem folgenden einzigen Grundsatz:

- **Die Code-Architektur muss nicht Claude Code kopieren**
- **Aber die Kernfunktionen, das Nutzungserlebnis und die Interaktionserfahrung des Befehlssystems müssen zu 95 % mit Claude Code übereinstimmen**

„Übereinstimmung“ bezieht sich hier auf die vom Benutzer direkt wahrnehmbaren Fähigkeiten, darunter:

1. Abdeckung der Befehlsquellen
2. Befehls-Hilfe und Auffindbarkeit
3. Befehlsautovervollständigung und Mid-Input-Slash-Command-Erlebnis
4. ACP / Non-Interactive-Verfügbarkeit
5. Prompt-Command / Skill-Modellaufruffähigkeit

Diese Umstrukturierung ist keine kleine Korrektur einiger Felder oder eine Minimodifikation des bestehenden `SlashCommand`, sondern die Aufwertung des Command-Moduls von einer „interaktiven UI-Hilfsfunktion“ zu einer „einheitlichen Befehlsplattform, die Interactive / ACP / Non-Interactive / Model umfasst“.

---

## 2. Fazit nach der Neugestaltung

Das Problem des bestehenden Qwen-Command-Systems ist nicht, dass es völlig unfähig ist, sondern:

1. Es ist nur auf dem interaktiven Hauptpfad relativ vollständig
2. Das Typmodell ist zu dünn, um die Claude-Produktebene zu tragen
3. ACP / Non-Interactive sind auf eine Whitelist angewiesen, was die Erweiterbarkeit stark einschränkt
4. Befehlsquellen existieren zwar, bilden aber keine für den Benutzer sichtbare einheitliche Denkweise
5. Prompt-Command und Modell-Skill-Expositionssystem sind getrennt

Daher muss der neue Plan vier Dinge gleichzeitig lösen:

1. **Die Claude Code-Funktionsebene ergänzen**
2. **Die technischen Vorteile des einheitlichen Outcome-Modells von Qwen bewahren**
3. **Eine einheitliche Registry / Resolver / Executor / Adapter-Architektur aufbauen**
4. **Hilfe, Autovervollständigung, verfügbare ACP-Befehle und Dokumentation dieselben Metadaten verwenden lassen**

---

## 3. Umstrukturierungsprinzipien

### 3.1 Funktionale Übereinstimmung vor Implementierungsübereinstimmung

Erlaubt sind Unterschiede in:

- Internen Klassennamen
- Modulaufteilungsweise
- Executor-Implementierung
- Effect / Outcome-Struktur

Nicht erlaubt sind Unterschiede in:

- Deutlich geringerer Abdeckung der Befehlsquellen
- Deutlich geringerem Erlebnis bei Befehls-Hilfe und Autovervollständigung
- Deutlich geringerer ACP / Non-Interactive-Verfügbarkeit
- Deutlich geringerer Integration von Prompt-Command und Modellfähigkeiten

Bei Abwägungen sollte die Priorität wie folgt sein:

1. Benutzererfahrungs-Übereinstimmung
2. Befehlsfunktionsabdeckungs-Übereinstimmung
3. Moduskonsistenz-Übereinstimmung
4. Einfachheit der internen Implementierung

### 3.2 Einheitliches Outcome-Modell von Qwen beibehalten

Es wird nicht empfohlen, die Claude-Ausführungsimplementierung mechanisch zu kopieren.

Das aktuelle einheitliche Ergebnis-Modell von Qwen bleibt erhaltenswert, da es sich natürlich eignet für:

- UI-Übernahme
- Genehmigung/Bestätigung
- Tool-Dispatch
- Prompt-Einreichung
- Modusübergreifende Anpassung

Es muss jedoch aufgerüstet werden, um Claude-ähnliche Command-Fähigkeiten zu tragen, anstatt weiterhin als vereinfachtes UI-Command-Framework zu existieren.

### 3.3 Typ, Quelle, Modus, Sichtbarkeit müssen vollständig entkoppelt sein

Das neue Command-Modell muss mindestens die folgenden Dimensionen trennen:

1. **Typ**: Wie der Befehl ausgeführt wird
2. **Quelle**: Woher der Befehl kommt
3. **Modus-Fähigkeit**: In welchen Laufzeitumgebungen er verfügbar ist
4. **Sichtbarkeit**: Für den Benutzer sichtbar oder für das Modell sichtbar

---

## 4. Claude Code-Funktionsebene, die angeglichen werden muss

### 4.1 Befehlstypen

Qwen muss explizit drei Befehlstypen unterstützen:

1. `prompt`
2. `local`
3. `local-jsx`

### 4.2 Befehlsquellen

Das Qwen-Command-Schema muss von der ersten Phase an die folgenden Quellen abdecken:

1. Built-in-Befehle
2. Gebündelte Skills
3. Skill-Verzeichnis-Befehle
4. Workflow-Befehle
5. Plugin-Befehle
6. Plugin-Skills
7. Dynamische Skills
8. MCP-Prompts
9. MCP-Skills

Es darf nicht sein, dass man zu „erstmal nur die aktuell vorhandenen Typen unterstützen“ zurückkehrt.

### 4.3 Befehlsmetadaten

Mindestens die folgenden Felder müssen ergänzt werden:

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

### 4.4 Erlebnis-Fähigkeiten

Mindestens die folgenden Erlebnisse müssen ergänzt werden:

1. Alias-Treffer in der Autovervollständigung
2. Quellen-Badge
3. Parameterhinweise
4. Sortierung nach zuletzt verwendet
5. Mid-Input-Slash-Command-Erkennung und -Vervollständigung
6. Befehlsverzeichnis-ähnliche Hilfe
7. Vollständige Darstellung der verfügbaren ACP-Befehle

---

## 5. Neues Command-Modell

## 5.1 Kernstruktur

Es wird empfohlen, einen einheitlichen `CommandDescriptor` als Registrierungsformat für alle Befehle einzuführen.

Er besteht aus mindestens vier Teilen:

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

## 5.2 Aufgaben der drei Befehlstypen

### `prompt`

Verwendung für:

- Skills
- File-Befehle
- Workflow-Prompt-Befehle
- Plugin-Skills
- MCP-Prompt / Skill

Eigenschaften:

- Erzeugt Prompt- / Skill-Assets
- Standardmäßig unterstützt in Interactive / ACP / Non-Interactive
- Kann vom Benutzer oder vom Modell aufgerufen werden

### `local`

Verwendung für:

- Abfragebefehle
- Konfigurationsbefehle
- Headless ausführbare Statusbefehle
- Den Haupteinstiegspunkt der meisten Built-in-Befehle

Eigenschaften:

- Nicht auf UI angewiesen
- Sollte der Hauptträgertyp für ACP / Non-Interactive sein

### `local-jsx`

Verwendung für:

- Picker
- Panels
- Wizard
- Interaktive UI-Shell

Eigenschaften:

- Verarbeitet nur interaktive UI
- Darf nicht mehr der einzige Einstiegspunkt sein
- Muss einen Fallback oder einen entsprechenden Local-Unterbefehl bereitstellen

---

## 6. Befehlsquellen-Modell

## 6.1 Externes Quellenmodell

Dies ist das für Benutzer sichtbare Quellenmodell und muss so weit wie möglich mit der Claude Code-Denkweise übereinstimmen:

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

Diese Feldgruppe wird direkt verwendet für:

- Hilfe-Gruppierung
- Quellen-Badge in der Autovervollständigung
- Verfügbare ACP-Befehle
- Dokumentationsexport

## 6.2 Internes Normalisierungsmodell

Um nicht durch externe Namen eingeschränkt zu sein, wird intern eine weitere Implementierungsebene hinzugefügt:

- `providerType`
- `artifactType`
- `activationMode`
- `builtinProvided`
- `originPath`
- `namespace`

So kann Folgendes erreicht werden:

- Externes Erlebnis nach Claude ausgerichtet
- Interne Implementierung bleibt Qwen wartbar

## 6.3 Konfliktstrategie

Einheitlich über eine stabile `id` verwalten, Anzeigenamen und Eingabenamen trennen:

1. `id`: Stabile eindeutige Kennung
2. `name`: Primärer Eingabename
3. `userFacingName`: Anzeigename in Hilfe/Autovervollständigung

Vorgeschlagene Konfliktpriorität:

1. Built-in
2. Bundled / Skill-Dir / Workflow
3. Plugin / Builtin-Plugin
4. Dynamic
5. MCP mit eigenem Namespace

---

## 7. Einheitliche Ausführungsarchitektur

## 7.1 `CommandRegistry`

Aufgaben:

1. Aggregiert alle Loader/Provider
2. Baut mehrdimensionale Indizes auf
3. Gibt Ansichten für Hilfe, Autovervollständigung, ACP und Dokumentation aus
4. Bietet getrennte Ansichten für benutzersichtbare und modellsichtbare Befehle

Unterstützte Provider (obligatorisch):

1. `BuiltinCommandLoader`
2. `BundledSkillLoader`
3. `FileCommandLoader`
4. `McpPromptLoader`
5. `WorkflowCommandLoader`
6. `PluginCommandLoader`
7. `PluginSkillLoader`
8. `DynamicSkillProvider`
9. `BuiltinPluginSkillLoader`

Selbst wenn einige Provider in der ersten Phase noch nicht vollständig umgesetzt sind, müssen Schema und API bereits unterstützt werden.

## 7.2 `CommandResolver`

Aufgaben:

1. Analysiert Slash-Commands
2. Analysiert Aliasse
3. Analysiert Subcommand-Pfade
4. Erkennt Mid-Input-Slash-Tokens
5. Gibt kanonische aufgelöste Befehle aus

## 7.3 `CommandExecutor`

Aufgaben:

1. Führt Capability-Prüfungen durch
2. Führt `prompt | local | local-jsx` aus
3. Erzeugt einheitliche Outcomes
4. Behandelt Fallbacks / nicht unterstützte Fälle

## 7.4 `ModeAdapter`

Es müssen drei Adapter ausgegliedert werden:

1. `InteractiveModeAdapter`
2. `AcpModeAdapter`
3. `NonInteractiveModeAdapter`

So können alle drei Modi dieselbe Command-Registry und denselben Executor gemeinsam nutzen, anstatt jeweils eigene Hardcodierungen zu haben.

---

## 8. UI-Befehlsumstrukturierungsprinzip: Kernbefehle von der Interaktionshülle trennen

Dies ist der Schlüssel zur tatsächlichen Nutzbarkeit von ACP und Non-Interactive.

Alle Befehle, die derzeit im Wesentlichen „einen Dialog öffnen“, müssen umgestaltet werden zu:

1. Einer interaktiven Shell
2. Einer Gruppe von Local-Unterbefehlen

### Erste Befehle, die aufgeteilt werden müssen

1. `/model`
2. `/permissions`
3. `/mcp`
4. `/resume`
5. `/hooks`
6. `/extensions`
7. `/agents`
8. `/approval-mode`

### Beispiel für die Zielform

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

## 9. Prompt-Command / Skill-einheitliches Design

Dies ist P0 in der Umstrukturierung, keine nachträglich hinzugefügte Fähigkeit.

## 9.1 Ziel

Aufbau einer einheitlichen **Model-Invocable Prompt Command Registry**, die die folgenden Assets in einer für das Modell aufrufbaren Ansicht zusammenführt:

1. Gebündelte Skills
2. File-Commands
3. Workflow-Prompt-Commands
4. Plugin-Skills
5. MCP-Prompts / MCP-Skills

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

Nach der Umstrukturierung sollte `SkillTool` nicht mehr nur eng definierte Skills konsumieren.

Stattdessen:

1. `CommandRegistry.getModelInvocablePromptCommands()` erzeugt eine einheitliche Ansicht
2. `SkillTool` oder ein zukünftiges einheitliches Command-Tool konsumiert diese Ansicht
3. Benutzer-Slash-Commands und Modell-Skill-Aufrufe nutzen denselben Pool an Prompt-Command-Assets

So kann Qwen in der Benutzererfahrung an die Behandlung von Fähigkeiten wie `/review`, `/commit`, `/openspec-apply` durch Claude herankommen.

---

## 10. Hilfe / Autovervollständigung / Auffindbarkeit neu gemacht

## 10.1 Autovervollständigung

Vervollständigungsvorschläge müssen mindestens Folgendes anzeigen:

1. `label`
2. `description`
3. `argumentHint`
4. `sourceBadge`
5. `modeBadges`
6. `aliasHit`
7. `recentlyUsedScore`

Die Sortierung berücksichtigt mindestens:

1. Exakter Treffer
2. Alias-Treffer
3. Zuletzt verwendet
4. Prefix-Treffer
5. Fuzzy-Treffer

## 10.2 Mid-Input-Slash-Command

Muss ergänzt werden:

1. Erkennung von Slash-Tokens in der Nähe des Cursors
2. Ghost-Text-Hinweise
3. Tab-Vervollständigung
4. Hervorhebung gültiger Command-Tokens

Erste Phase: Zuerst das Eingabeerlebnis angleichen; ob stärkere „eingebettete Befehlsausführungssemantik“ eingeführt wird, kann in späteren Iterationen entschieden werden.

## 10.3 Hilfe

Hilfe ist keine flache Liste mehr, sondern ein vollständiges Befehlsverzeichnis.

Mindestens gruppieren in:

1. Built-in-Befehle
2. Gebündelte Skills
3. Skill-Verzeichnis-Befehle
4. Workflow-Befehle
5. Plugin-Befehle
6. Plugin-Skills
7. Dynamische Skills
8. Builtin-Plugin-Skills
9. MCP-Befehle / MCP-Skills

Jeder Befehl zeigt mindestens:

1. Name
2. Parameterhinweis
3. Beschreibung
4. Quelle
5. Unterstützter Modus
6. Ob modellaufrufbar
7. Zusammenfassung der Unterbefehle

---

## 11. ACP / Non-Interactive-Umstrukturierung

## 11.1 Whitelist-Ansatz vollständig aufgeben

Altes Schema:

- Built-in-Allowlist
- FILE / SKILL-Sonderbehandlung
- Andere Ergebnistypen: nicht unterstützt

Neues Schema:

- Jeder Befehl deklariert seine eigene Capability
- Registry filtert
- Adapter führt aus und behandelt Fallbacks

## 11.2 Outcome-Unterstützungsziele

### Interactive

- `submit_prompt`
- `message`
- `stream_messages`
- `tool`
- `dialog`
- `load_history`
- `confirm_action`
- `confirm_shell_commands`

### ACP

- `submit_prompt`
- `message`
- `stream_messages`
- `tool`
- `confirm_action`
- `confirm_shell_commands`
- `dialog fallback`

### Non-Interactive

- `submit_prompt`
- `message`
- `stream_messages`
- `tool`
- `confirm_action`
- `confirm_shell_commands`
- `dialog fallback / structured failure`

## 11.3 Ausgabe verfügbarer ACP-Befehle

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

## 12. Dokumentation, Hilfe, Autovervollständigung teilen sich dieselben Metadaten

Nach der Umstrukturierung müssen die folgenden Inhalte von derselben Registry-Ansicht exportiert werden:

1. Hilfe
2. Autovervollständigung
3. Verfügbare ACP-Befehle
4. Dokumentationsexport

Dies löst das aktuelle Problem der Inkonsistenz zwischen „Implementierung, Hilfe und Dokumentation als drei verschiedenen Befehlsebenen“.

---

## 13. Implementierungsphasen

## Phase 1: Basis-Neubau

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

## Phase 2: Migration der Kernbefehle

Lieferumfang:

1. `/model`
2. `/permissions`
3. `/mcp`
4. `/resume`
5. `/hooks`
6. `/extensions`
7. `/agents`
8. `/approval-mode`

Alle diese Befehle müssen die Umstrukturierung „Interaktive Shell + Local-Unterbefehle“ abgeschlossen haben.

## Phase 3: Modellfähigkeiten durchgängig machen

Lieferumfang:

1. `SkillTool` an die einheitliche Registry-Ansicht anbinden
2. File-Command / Gebündelter Skill / MCP-Prompt / Plugin-Skill in die einheitliche modellaufrufbare Sammlung aufnehmen
3. Prompt-Command und Skill-Assets vollständig vereinheitlichen

## Phase 4: Erlebnisebene an Claude angleichen

Lieferumfang:

1. Sortierung nach zuletzt verwendet
2. Quellen-Badge
3. Parameterhinweis
4. Modus-Badge
5. Vollständiges Hilfe-Verzeichnis
6. Mid-Input-Slash-Command-Erlebnis
7. Automatischer Dokumentationsexport oder -validierung

---

## 14. Abnahmekriterien

Nach Abschluss muss mindestens Folgendes erfüllt sein:

1. Hilfe, Autovervollständigung, ACP und Dokumentation können das vollständige Quellenmodell ausdrücken
2. Mit Ausnahme von reinen UI-Hüllenbefehlen können die meisten Built-in-Befehle in ACP / Non-Interactive verwendet werden
3. Prompt-Command und Modell-Skill-Aufruf verwenden denselben Asset-Pool
4. Das Befehlserlebnis erreicht bei Hilfe, Autovervollständigung, Quellenausdruck, Parameterhinweisen und Mid-Input-Erlebnis das Niveau von Claude Code zu 95 %
5. Es wird nicht mehr auf eine Built-in-Allowlist angewiesen, um die ACP / Non-Interactive-Befehlsfähigkeit aufrechtzuerhalten

---

## 15. Abschließende Beurteilung

Das Wesen dieser Umstrukturierung ist nicht, „dem bestehenden SlashCommand ein paar Felder hinzuzufügen“, sondern:

- **Mit dem internen Architekturstil von Qwen eine Command-Plattform zu liefern, die im externen Erlebnis zu 95 % mit Claude Code übereinstimmt**

Wenn eine Wahl zwischen zwei Optionen getroffen werden muss:

- Interne Implementierung ähnlicher wie Claude
- Externes Erlebnis ähnlicher wie Claude

Dieser Plan entscheidet sich klar für Letzteres.