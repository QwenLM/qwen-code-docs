# Unteragenten

Unteragenten sind spezialisierte KI-Assistenten, die bestimmte Arten von Aufgaben innerhalb von Qwen Code bearbeiten. Sie ermöglichen es Ihnen, fokussierte Arbeit an KI-Agenten zu delegieren, die mit aufgabenspezifischen Prompts, Werkzeugen und Verhaltensweisen konfiguriert sind.

## Was sind Unteragenten?

Unteragenten sind unabhängige KI-Assistenten, die:

- **Auf bestimmte Aufgaben spezialisiert** – Jeder Unteragent ist mit einem fokussierten System-Prompt für bestimmte Arten von Arbeit konfiguriert
- **Eigenen Kontext haben** – Sie unterhalten eine eigene Gesprächshistorie, getrennt von Ihrem Hauptchat
- **Kontrollierte Werkzeuge verwenden** – Sie können konfigurieren, auf welche Werkzeuge jeder Unteragent Zugriff hat
- **Autonom arbeiten** – Sobald sie eine Aufgabe erhalten, arbeiten sie unabhängig, bis zur Fertigstellung oder bis zum Scheitern
- **Detailliertes Feedback geben** – Sie sehen den Fortschritt, die Werkzeugnutzung und Ausführungsstatistiken in Echtzeit

## Fork-Unteragent

Zusätzlich zu benannten Unteragenten unterstützt Qwen Code das **Forken** – explizit ausgewählt mit `subagent_type: "fork"` (verfügbar in interaktiven Sitzungen). Ein Fork erbt den vollständigen Gesprächskontext des übergeordneten Agents und läuft im Hintergrund getrennt. Das Weglassen von `subagent_type` führt **keinen** Fork aus; stattdessen wird der allgemeine Unteragent gestartet, der bis zum Ende läuft und sein Ergebnis inline zurückgibt.

### Wie sich Fork von benannten Unteragenten unterscheidet

|               | Benannter Unteragent               | Fork-Unteragent                                       |
| ------------- | ---------------------------------- | ----------------------------------------------------- |
| Kontext       | Beginnt neu, keine übergeordnete Historie | Erbt vollständige Gesprächshistorie des übergeordneten Agents |
| System-Prompt | Verwendet eigenen konfigurierten Prompt | Verwendet exakten System-Prompt des übergeordneten Agents (für Cache-Sharing) |
| Ausführung    | Blockiert den übergeordneten Agent bis zur Fertigstellung | Läuft im Hintergrund, übergeordneter Agent fährt sofort fort |
| Anwendungsfall | Spezialisierte Aufgaben (Tests, Dokumentation) | Parallele Aufgaben, die den aktuellen Kontext benötigen |

### Wann Fork verwendet wird

Die KI verwendet automatisch Fork, wenn sie:

- Mehrere Recherche-Aufgaben parallel ausführen muss (z. B. „Modul A, B und C untersuchen“)
- Hintergrundarbeit ausführen muss, während das Hauptgespräch fortgesetzt wird
- Aufgaben delegieren muss, die ein Verständnis des aktuellen Gesprächskontexts erfordern

### Prompt-Cache-Sharing

Alle Forks teilen sich das exakte API-Anforderungspräfix des übergeordneten Agents (System-Prompt, Werkzeuge, Gesprächshistorie), was DashScope-Prompt-Cache-Treffer ermöglicht. Wenn 3 Forks parallel laufen, wird das gemeinsame Präfix einmal zwischengespeichert und wiederverwendet – was im Vergleich zu unabhängigen Unteragenten 80 %+ Tokenkosten spart.

### Rekursive Fork-Verhinderung

Fork-Kinder können keine weiteren Forks erstellen. Dies wird zur Laufzeit durchgesetzt – wenn ein Fork versucht, einen weiteren Fork zu erstellen, erhält er einen Fehler, der ihn anweist, Aufgaben direkt auszuführen.

### Aktuelle Einschränkungen

- **Keine Ergebnisrückmeldung**: Fork-Ergebnisse werden in der UI-Fortschrittsanzeige dargestellt, aber nicht automatisch in das Hauptgespräch zurückgespeist. Der übergeordnete KI-Agent sieht eine Platzhalternachricht und kann nicht auf die Ausgabe des Forks reagieren.
- **Keine Worktree-Isolation**: Forks teilen sich das Arbeitsverzeichnis des übergeordneten Agents. Gleichzeitige Dateiänderungen durch mehrere Forks können zu Konflikten führen.

## Hauptvorteile

- **Aufgabenspezialisierung**: Erstellen Sie Agenten, die für spezifische Arbeitsabläufe optimiert sind (Testen, Dokumentation, Refactoring usw.)
- **Kontextisolierung**: Halten Sie spezialisierte Arbeiten getrennt von Ihrem Hauptgespräch
- **Kontextvererbung**: Fork-Unteragenten erben den vollständigen Gesprächskontext für kontextintensive parallele Aufgaben
- **Prompt-Cache-Sharing**: Fork-Unteragenten teilen sich das Cache-Präfix des übergeordneten Agents, was Tokenkosten reduziert
- **Wiederverwendbarkeit**: Speichern und wiederverwenden Sie Agentenkonfigurationen projekt- und sitzungsübergreifend
- **Kontrollierter Zugriff**: Beschränken Sie, welche Werkzeuge jeder Agent aus Sicherheits- und Fokussierungsgründen verwenden kann
- **Fortschrittssichtbarkeit**: Überwachen Sie die Agentenausführung mit Echtzeit-Fortschrittsaktualisierungen

## Wie Unteragenten funktionieren

1. **Konfiguration**: Sie erstellen Konfigurationen für Unteragenten, die deren Verhalten, Werkzeuge und System-Prompts definieren
2. **Delegation**: Die Haupt-KI kann automatisch Aufgaben an geeignete Unteragenten delegieren – oder sich selbst forken (`subagent_type: "fork"`), wenn sie den vollständigen Gesprächskontext erben und die Zwischenausgabe verwerfen möchte
3. **Ausführung**: Unteragenten arbeiten unabhängig und verwenden ihre konfigurierten Werkzeuge, um Aufgaben zu erledigen
4. **Ergebnisse**: Sie geben Ergebnisse und Ausführungszusammenfassungen an das Hauptgespräch zurück

## Erste Schritte

### Schnellstart

1. **Erstellen Sie Ihren ersten Unteragenten**:

   `/agents create`

   Folgen Sie dem geführten Assistenten, um einen spezialisierten Agenten zu erstellen.

2. **Vorhandene Agenten verwalten**:

   `/agents manage`

   Zeigen Sie Ihre konfigurierten Unteragenten an und verwalten Sie sie.

3. **Unteragenten automatisch nutzen**: Bitten Sie die Haupt-KI einfach, Aufgaben auszuführen, die zu den Spezialisierungen Ihrer Unteragenten passen. Die KI wird automatisch geeignete Arbeiten delegieren.

### Beispielnutzung

```
User: "Please write comprehensive tests for the authentication module"
AI: I'll delegate this to your testing specialist Subagents.
[Delegates to "testing-expert" Subagents]
[Shows real-time progress of test creation]
[Returns with completed test files and execution summary]`
```
## Verwaltung

### CLI-Befehle

Subagenten werden über den Slash-Befehl `/agents` und seine Unterbefehle verwaltet:

**Verwendung:** `/agents create`. Erstellt einen neuen Subagenten über einen geführten Schritt-für-Schritt-Assistenten.

**Verwendung:** `/agents manage`. Öffnet einen interaktiven Verwaltungsdialog zum Anzeigen und Verwalten vorhandener Subagenten.

### Speicherorte

Subagenten werden als Markdown-Dateien an mehreren Orten gespeichert:

- **Projektebene**: `.qwen/agents/` (höchste Priorität)
- **Benutzerebene**: `~/.qwen/agents/` (Fallback)
- **Erweiterungsebene**: Von installierten Erweiterungen bereitgestellt

Dies ermöglicht projektspezifische Agenten, persönliche Agenten, die über alle Projekte hinweg funktionieren, und von Erweiterungen bereitgestellte Agenten, die spezielle Fähigkeiten hinzufügen.

### Subagenten von Erweiterungen

Erweiterungen können benutzerdefinierte Subagenten bereitstellen, die verfügbar werden, sobald die Erweiterung aktiviert ist. Diese Agenten werden im `agents/`-Verzeichnis der Erweiterung gespeichert und folgen dem gleichen Format wie persönliche und projektbezogene Agenten.

Subagenten von Erweiterungen:

- Werden automatisch erkannt, wenn die Erweiterung aktiviert ist
- Erscheinen im `/agents manage`-Dialog im Abschnitt „Extension Agents"
- Können nicht direkt bearbeitet werden (bearbeiten Sie stattdessen die Quellen der Erweiterung)
- Folgen dem gleichen Konfigurationsformat wie benutzerdefinierte Agenten

Um zu sehen, welche Erweiterungen Subagenten bereitstellen, überprüfen Sie die Datei `qwen-extension.json` der Erweiterung auf ein Feld `agents`.

### Dateiformat

Subagenten werden mit Markdown-Dateien und YAML-Frontmatter konfiguriert. Dieses Format ist menschenlesbar und kann mit jedem Texteditor einfach bearbeitet werden.

#### Grundstruktur

```
---
name: agent-name
description: Brief description of when and how to use this agent
model: inherit # Optional: inherit, fast, modelId, or authType:modelId
approvalMode: auto-edit # Optional: default, plan, auto-edit, yolo, bubble
tools:         # Optional: allowlist of tools
  - tool1
  - tool2
disallowedTools: # Optional: blocklist of tools
  - tool3
---

System prompt content goes here.
Multiple paragraphs are supported.
```

#### Modellauswahl

Verwenden Sie das optionale Feld `model` im Frontmatter, um zu steuern, welches Modell ein Subagent verwendet:

- `inherit`: Verwende das gleiche Modell wie die Hauptkonversation.
- Weglassen des Felds: entspricht `inherit`.
- `fast`: Verwende das konfigurierte `fastModel`. Wenn kein gültiges schnelles Modell konfiguriert ist, 
  fällt der Subagent auf `inherit` zurück.
- `glm-5`: Verwende diese Modell-ID. Qwen Code prüft zuerst den Authentifizierungstyp 
  der Hauptkonversation; ist das Modell dort nicht verfügbar, kann es das Modell von einem 
  anderen konfigurierten Anbieter auflösen.
- `openai:gpt-4o`: Verwende einen expliziten Anbieter und eine Modell-ID. Dies ist nützlich, wenn 
  ein Subagent auf einem Modell laufen soll, das unter einem anderen Authentifizierungstyp als 
  die Hauptkonversation registriert ist.

Zum Beispiel:

```
---
name: fast-reviewer
description: Reviews small diffs with the configured fast model
model: fast
tools:
  - read_file
  - grep_search
---
```

```
---
name: openai-researcher
description: Uses an OpenAI-compatible provider for research tasks
model: openai:gpt-4o
tools:
  - read_file
  - grep_search
  - glob
---
```

Der Selektor `fast` verwendet die gleiche Einstellung `fastModel`, die in 
`settings.json` oder mit `/model --fast` konfiguriert wurde. Diese Einstellung kann 
selbst auf ein Modell unter einem anderen konfigurierten Authentifizierungstyp verweisen, 
z. B. `openai:deepseek-v4-flash`. Wenn der Selektor auf einen anderen Authentifizierungstyp 
auflöst, erstellt Qwen Code einen dedizierten Laufzeit-Provider für diese Subagenten-Anfrage 
und sendet dem Provider nur die reine Modell-ID.

#### Berechtigungsmodus

Verwenden Sie das optionale Frontmatter-Feld `approvalMode`, um zu steuern, wie Tool-Aufrufe des Subagenten genehmigt werden. Gültige Werte:

- `default`: Tools erfordern interaktive Genehmigung (entspricht dem Standard der Hauptsitzung)
- `plan`: Nur-Analyse-Modus – der Agent plant, führt aber keine Änderungen aus
- `auto-edit`: Tools werden ohne Rückfrage automatisch genehmigt (für die meisten Agenten empfohlen)
- `yolo`: Alle Tools werden automatisch genehmigt, einschließlich potenziell zerstörerischer
- `bubble`: Tool-Genehmigungen von Hintergrundagenten werden in der übergeordneten Sitzung angezeigt

Wenn Sie dieses Feld weglassen, wird der Berechtigungsmodus des Subagenten automatisch bestimmt:

- Wenn die übergeordnete Sitzung im Modus **yolo** oder **auto-edit** ist, übernimmt der Subagent diesen Modus. Eine permissive Elternsitzung bleibt permissiv.
- Wenn die übergeordnete Sitzung im Modus **plan** ist, bleibt der Subagent im Plan-Modus. Eine reine Analyse-Sitzung kann keine Dateien über einen delegierten Agenten mutieren.
- Wenn die übergeordnete Sitzung im Modus **default** ist (in einem vertrauenswürdigen Ordner), erhält der Subagent **auto-edit**, damit er autonom arbeiten kann.

Wenn Sie `approvalMode` explizit setzen, haben die permissiven Modi der Elternsitzung weiterhin Vorrang. Wenn die Elternsitzung z. B. im Yolo-Modus ist, wird ein Subagent mit `approvalMode: plan` trotzdem im Yolo-Modus ausgeführt.

```
---
name: cautious-reviewer
description: Reviews code without making changes
approvalMode: plan
tools:
  - read_file
  - grep_search
  - glob
---

You are a code reviewer. Analyze the code and report findings.
Do not modify any files.
```

#### Werkzeugkonfiguration

Verwenden Sie `tools` und `disallowedTools`, um zu steuern, auf welche Tools ein Subagent zugreifen kann.

**`tools` (Allowlist):** Wenn angegeben, kann der Subagent nur die aufgelisteten Tools verwenden. Wenn nicht angegeben, übernimmt der Subagent alle verfügbaren Tools von der übergeordneten Sitzung.

**`disallowedTools` (Blocklist):** Wenn angegeben, werden diese Tools für den Subagenten blockiert. Wenn Sie sowohl `tools` als auch `disallowedTools` angeben, gilt die Allowlist zuerst; die Blocklist wird auf die Allowlist angewendet.

Weder `tools` noch `disallowedTools` können Tools überschreiben, die in der übergeordneten Konversation blockiert wurden. Wenn zum Beispiel das Tool `terminal` in der übergeordneten Konversation blockiert ist, wird dieses Verbot auf alle Subagenten vererbt, unabhängig von ihrer lokalen Konfiguration. Die Tool-Filterung erfolgt in dieser Reihenfolge:

1. Starte mit den von der Elternsitzung erlaubten Tools (bereits gefiltert durch die `disallowedTools` der Eltern).
2. Wende die `tools`-Allowlist des Subagenten an (falls vorhanden).
3. Wende die `disallowedTools`-Blocklist des Subagenten an (falls vorhanden).
4. Gib die resultierende Liste an den Agenten weiter.
```
---
name: reader
description: Read-only agent for code exploration
tools:
  - read_file
  - grep_search
  - glob
  - list_directory
---
```

**`disallowedTools` (Negativliste):** Wenn angegeben, werden die aufgeführten Tools aus dem Tool-Pool des Unteragenten entfernt. Dies ist nützlich, wenn Sie „alles außer X" möchten, ohne jedes erlaubte Tool auflisten zu müssen.

```
---
name: safe-worker
description: Agent that cannot modify files
disallowedTools:
  - write_file
  - edit
  - run_shell_command
---
```

Wenn sowohl `tools` als auch `disallowedTools` gesetzt sind, wird zuerst die Positivliste angewendet, dann entfernt die Negativliste aus dieser Menge.

**MCP-Tools** folgen denselben Regeln. Wenn ein Unteragent keine `tools`-Liste hat, erbt er alle MCP-Tools von der übergeordneten Sitzung. Wenn ein Unteragent eine explizite `tools`-Liste hat, erhält er nur MCP-Tools, die explizit in dieser Liste genannt sind.

Das Feld `disallowedTools` unterstützt MCP-Server-Ebenen-Muster:

- `mcp__server__tool_name` — blockiert ein bestimmtes MCP-Tool
- `mcp__server` — blockiert alle Tools von diesem MCP-Server

```
---
name: no-slack
description: Agent without Slack access
disallowedTools:
  - mcp__slack
---
```

#### Claude Code-Kompatibilitätsfelder

Qwen Code akzeptiert die folgenden Frontmatter-Felder von Claude Code 2.1.168, sodass Sie eine CC-Agent-Datei in `.qwen/agents/` ablegen können und die unterstützten Felder identisch verarbeitet werden. Optionale Felder mit ungültigen Werten werden beim Parsen stillschweigend verworfen und nicht abgewiesen – die gleiche nachsichtige Haltung, die CC verwendet.

| Feld               | Typ                | Anmerkungen                                                                                                                                                                                                                                                                                                                                                              |
| ------------------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `permissionMode`   | Aufzählungszeichenfolge | `acceptEdits`, `auto`, `bypassPermissions`, `default`, `dontAsk`, `plan`. Wird beim Parsen auf `approvalMode` abgebildet; wenn beide gesetzt sind, gewinnt das explizite `approvalMode`.                                                                                                                                                                                |
| `maxTurns`         | positive Ganzzahl  | Begrenzt das Turn-Budget des Agenten. Wird zur Laufzeit mit `runConfig.max_turns` verbunden; wenn beide gesetzt sind, gewinnt das Feld der obersten Ebene. Der veraltete verschachtelte Wert wird beim Speichern aus der Datei entfernt, um zwei Wahrheitsquellen zu vermeiden.                                                                                       |
| `color`            | Aufzählungszeichenfolge | Anzeigefarbe. Positivliste: `red`, `blue`, `green`, `yellow`, `purple`, `orange`, `pink`, `cyan` (entspricht CCs `_Y`). Der veraltete qwen-Sentinel `auto` wird aus Gründen der Abwärtskompatibilität beibehalten. Andere Werte werden beim Parsen stillschweigend verworfen.                                                                                        |
| `mcpServers`       | Datensatz von Spezifikationen | MCP-Server-Überschreibungen pro Agent. Werden mit dem MCP-Server-Set auf Sitzungsebene zusammengeführt, wenn der Agent gestartet wird; bei Schlüsselkollision gewinnt die Agenten-Spezifikation (entspricht der CC-Semantik von `scope: 'agent'`). Fehlerhafte Einträge werden pro Schlüssel mit einer Warnung verworfen, anstatt den gesamten Agenten fehlschlagen zu lassen. |
| `hooks`            | Datensatz von Arrays | Hooks pro Agent. Schlüssel sind CC-Hook-Ereignisnamen (`PreToolUse`, `PostToolUse`, `UserPromptSubmit`, …); Werte sind Arrays von `{ matcher?, hooks: [...] }`-Definitionen in der gleichen Form wie das `hooks`-Feld von `settings.json`. Werden registriert, während der Agent läuft, und entfernt, wenn er gestoppt wird.                                    |

Beispiel mit all dem oben Genannten:

```
---
name: rigorous-reviewer
description: Deep code review with a turn cap
permissionMode: plan
maxTurns: 50
color: cyan
tools:
  - read_file
  - grep_search
  - glob
mcpServers:
  filesystem:
    type: stdio
    command: node
    args: [/usr/local/lib/mcp-fs/server.js]
hooks:
  PreToolUse:
    - matcher: Bash
      hooks:
        - type: command
          command: echo "review-agent about to run a shell command"
---

Sie sind ein Code-Reviewer. Analysieren Sie den Code gründlich und melden Sie Ergebnisse nach Schweregrad geordnet.
```

Die verbleibenden CC-Frontmatter-Felder — `effort`, `skills`, `initialPrompt`, `memory`, `isolation` — sind im Design-Dokument des deklarativen Agenten dokumentiert und werden in nachfolgenden PRs eingeführt, sobald die erforderliche Infrastruktur vorhanden ist (`effort` benötigt einen Parameter auf Modellebene; `memory` benötigt ein spezifisches Memory-Subsystem; das CLI-Flag `--agent` aktiviert `initialPrompt`; usw.).

> **`hooks` v1 Einschränkung.** Während ein Unteragent, der `hooks` deklariert, läuft, werden seine Hook-Einträge für jedes passende Ereignis in der Sitzung ausgelöst, nicht nur für die eigenen Tool-Aufrufe des Unteragenten. Wenn zwei Unteragenten mit unterschiedlichen pro-Agent-Hook-Sets gleichzeitig laufen, werden beide Sets für beide Agenten ausgelöst. Die pro-Agent-Bereichsfilterung zum Zeitpunkt des Auslösens von Hooks bleibt einer Nachverfolgung überlassen; für v1 bevorzugen Sie pro-Agent-Hooks, die sicher global für die Dauer des Agentenlaufs ausgelöst werden können (z. B. Logging) gegenüber Hooks, die das Verhalten ändern.
#### Beispielverwendung

```
---
name: project-documenter
description: Creates project documentation and README files
---

You are a documentation specialist.

Focus on creating clear, comprehensive documentation that helps both
new contributors and end users understand the project.
```

## Subagenten effektiv nutzen

### Automatische Delegation

Qwen Code delegiert Aufgaben proaktiv basierend auf:

- Der Aufgabenbeschreibung in Ihrer Anfrage
- Dem Beschreibungsfeld in den Subagenten-Konfigurationen
- Aktuellem Kontext und verfügbaren Werkzeugen

Um eine proaktivere Nutzung von Subagenten zu fördern, fügen Sie Formulierungen wie „PROAKTIV NUTZEN" oder „MUSS VERWENDET WERDEN" in Ihr Beschreibungsfeld ein.

### Expliziter Aufruf

Fordern Sie einen bestimmten Subagenten an, indem Sie ihn in Ihrem Befehl erwähnen:

```
Lassen Sie die Subagenten für Testexperten Komponententests für das Zahlungsmodul erstellen
Lassen Sie die Subagenten für Dokumentationsautoren die API-Referenz aktualisieren
Lassen Sie die Subagenten für React-Spezialisten die Leistung dieser Komponente optimieren
```

## Beispiele

### Entwicklungsworkflow-Agenten

#### Testspezialist

Ideal für umfassende Testerstellung und testgetriebene Entwicklung.

```
---
name: testing-expert
description: Writes comprehensive unit tests, integration tests, and handles test automation with best practices
tools:
  - read_file
  - write_file
  - read_many_files
  - run_shell_command
---

You are a testing specialist focused on creating high-quality, maintainable tests.

Your expertise includes:

- Unit testing with appropriate mocking and isolation
- Integration testing for component interactions
- Test-driven development practices
- Edge case identification and comprehensive coverage
- Performance and load testing when appropriate

For each testing task:

1. Analyze the code structure and dependencies
2. Identify key functionality, edge cases, and error conditions
3. Create comprehensive test suites with descriptive names
4. Include proper setup/teardown and meaningful assertions
5. Add comments explaining complex test scenarios
6. Ensure tests are maintainable and follow DRY principles

Always follow testing best practices for the detected language and framework.
Focus on both positive and negative test cases.
```

**Anwendungsfälle:**

- „Schreiben Sie Komponententests für den Authentifizierungsdienst"
- „Erstellen Sie Integrationstests für den Zahlungsabwicklungsworkflow"
- „Fügen Sie Testabdeckung für Randfälle im Datenvalidierungsmodul hinzu"

#### Dokumentationsautor

Spezialisiert auf die Erstellung klarer, umfassender Dokumentationen.

```
---
name: documentation-writer
description: Creates comprehensive documentation, README files, API docs, and user guides
tools:
  - read_file
  - write_file
  - read_many_files
---

You are a technical documentation specialist.

Your role is to create clear, comprehensive documentation that serves both
developers and end users. Focus on:

**For API Documentation:**

- Clear endpoint descriptions with examples
- Parameter details with types and constraints
- Response format documentation
- Error code explanations
- Authentication requirements

**For User Documentation:**

- Step-by-step instructions with screenshots when helpful
- Installation and setup guides
- Configuration options and examples
- Troubleshooting sections for common issues
- FAQ sections based on common user questions

**For Developer Documentation:**

- Architecture overviews and design decisions
- Code examples that actually work
- Contributing guidelines
- Development environment setup

Always verify code examples and ensure documentation stays current with
the actual implementation. Use clear headings, bullet points, and examples.
```

**Anwendungsfälle:**

- „Erstellen Sie eine API-Dokumentation für die Benutzerverwaltungs-Endpunkte"
- „Schreiben Sie eine umfassende README für dieses Projekt"
- „Dokumentieren Sie den Bereitstellungsprozess mit Fehlerbehebungsschritten"

#### Code-Reviewer

Fokussiert auf Codequalität, Sicherheit und Best Practices.

```
---
name: code-reviewer
description: Reviews code for best practices, security issues, performance, and maintainability
tools:
  - read_file
  - read_many_files
---

You are an experienced code reviewer focused on quality, security, and maintainability.

Review criteria:

- **Code Structure**: Organization, modularity, and separation of concerns
- **Performance**: Algorithmic efficiency and resource usage
- **Security**: Vulnerability assessment and secure coding practices
- **Best Practices**: Language/framework-specific conventions
- **Error Handling**: Proper exception handling and edge case coverage
- **Readability**: Clear naming, comments, and code organization
- **Testing**: Test coverage and testability considerations

Provide constructive feedback with:

1. **Critical Issues**: Security vulnerabilities, major bugs
2. **Important Improvements**: Performance issues, design problems
3. **Minor Suggestions**: Style improvements, refactoring opportunities
4. **Positive Feedback**: Well-implemented patterns and good practices

Focus on actionable feedback with specific examples and suggested solutions.
Prioritize issues by impact and provide rationale for recommendations.
```

**Anwendungsfälle:**

- „Überprüfen Sie die Authentifizierungslogik auf Sicherheitslücken"
- „Führen Sie ein Code-Review für den neuen Zahlungs-Gateway-Adapter durch"
- „Bewerten Sie die Leistungsoptimierungen im Datenabrufmodul"
**Anwendungsfälle:**

- „Überprüfe diese Authentifizierungsimplementierung auf Sicherheitsprobleme“
- „Überprüfe die Performance-Auswirkungen dieser Datenbankabfragelogik“
- „Bewerte die Codestruktur und schlage Verbesserungen vor“

### Technologiespezifische Agents

#### React-Spezialist

Optimiert für React-Entwicklung, Hooks und Komponentenmuster.

```
---
name: react-specialist
description: Expert in React development, hooks, component patterns, and modern React best practices
tools:
  - read_file
  - write_file
  - read_many_files
  - run_shell_command
---

You are a React specialist with deep expertise in modern React development.

Your expertise covers:

- **Component Design**: Functional components, custom hooks, composition patterns
- **State Management**: useState, useReducer, Context API, and external libraries
- **Performance**: React.memo, useMemo, useCallback, code splitting
- **Testing**: React Testing Library, Jest, component testing strategies
- **TypeScript Integration**: Proper typing for props, hooks, and components
- **Modern Patterns**: Suspense, Error Boundaries, Concurrent Features

For React tasks:

1. Use functional components and hooks by default
2. Implement proper TypeScript typing
3. Follow React best practices and conventions
4. Consider performance implications
5. Include appropriate error handling
6. Write testable, maintainable code

Always stay current with React best practices and avoid deprecated patterns.
Focus on accessibility and user experience considerations.
```

**Anwendungsfälle:**

- „Erstelle eine wiederverwendbare Datentabellen-Komponente mit Sortier- und Filterfunktion“
- „Implementiere einen benutzerdefinierten Hook zum Abrufen von API-Daten mit Caching“
- „Refaktoriere diese Klassenkomponente, um moderne React-Muster zu verwenden“

#### Python-Experte

Spezialisiert auf Python-Entwicklung, Frameworks und Best Practices.

```
---
name: python-expert
description: Expert in Python development, frameworks, testing, and Python-specific best practices
tools:
  - read_file
  - write_file
  - read_many_files
  - run_shell_command
---

You are a Python expert with deep knowledge of the Python ecosystem.

Your expertise includes:

- **Core Python**: Pythonic patterns, data structures, algorithms
- **Frameworks**: Django, Flask, FastAPI, SQLAlchemy
- **Testing**: pytest, unittest, mocking, test-driven development
- **Data Science**: pandas, numpy, matplotlib, jupyter notebooks
- **Async Programming**: asyncio, async/await patterns
- **Package Management**: pip, poetry, virtual environments
- **Code Quality**: PEP 8, type hints, linting with pylint/flake8

For Python tasks:

1. Follow PEP 8 style guidelines
2. Use type hints for better code documentation
3. Implement proper error handling with specific exceptions
4. Write comprehensive docstrings
5. Consider performance and memory usage
6. Include appropriate logging
7. Write testable, modular code

Focus on writing clean, maintainable Python code that follows community standards.
```

**Anwendungsfälle:**

- „Erstelle einen FastAPI-Service für die Benutzerauthentifizierung mit JWT-Tokens“
- „Implementiere eine Datenverarbeitungspipeline mit pandas und Fehlerbehandlung“
- „Schreibe ein CLI-Tool mit argparse und umfassender Hilfedokumentation“

## Best Practices

### Design-Prinzipien

#### Single-Responsibility-Prinzip

Jeder Subagent sollte einen klaren, fokussierten Zweck haben.

**✅ Gut:**

```
---
name: testing-expert
description: Writes comprehensive unit tests and integration tests
---
```

**❌ Vermeiden:**

```
---
name: general-helper
description: Helps with testing, documentation, code review, and deployment
---
```

**Warum:** Fokussierte Agents liefern bessere Ergebnisse und sind einfacher zu warten.

#### Klare Spezialisierung

Definiere spezifische Expertisebereiche statt breiter Fähigkeiten.

**✅ Gut:**

```
---
name: react-performance-optimizer
description: Optimizes React applications for performance using profiling and best practices
---
```

**❌ Vermeiden:**

```
---
name: frontend-developer
description: Works on frontend development tasks
---
```

**Warum:** Spezifische Expertise führt zu gezielterer und effektiverer Hilfe.

#### Handlungsorientierte Beschreibungen

Schreibe Beschreibungen, die klar angeben, wann der Agent eingesetzt werden sollte.

**✅ Gut:**

```
description: Reviews code for security vulnerabilities, performance issues, and maintainability concerns
```

**❌ Vermeiden:**

```
description: A helpful code reviewer
```

**Warum:** Klare Beschreibungen helfen der Haupt-KI, den richtigen Agenten für jede Aufgabe auszuwählen.

### Best Practices für die Konfiguration

#### Richtlinien für System-Prompts

**Sei spezifisch in Bezug auf die Expertise:**

```
You are a Python testing specialist with expertise in:

- pytest framework and fixtures
- Mock objects and dependency injection
- Test-driven development practices
- Performance testing with pytest-benchmark
```

**Füge schrittweise Ansätze hinzu:**

```
For each testing task:

1. Analyze the code structure and dependencies
2. Identify key functionality and edge cases
3. Create comprehensive test suites with clear naming
4. Include setup/teardown and proper assertions
5. Add comments explaining complex test scenarios
```
```
**Specify Output Standards:**

- Use descriptive test names that explain the scenario
- Include both positive and negative test cases
- Add docstrings for complex test functions
- Ensure tests are independent and can run in any order
```

## Sicherheitsüberlegungen

- **Werkzeugbeschränkungen**: Verwenden Sie `tools`, um einzuschränken, auf welche Werkzeuge ein Subagent zugreifen kann, oder `disallowedTools`, um bestimmte Werkzeuge zu blockieren, während alles andere geerbt wird.
- **Berechtigungsmodus**: Subagents erben standardmäßig den Berechtigungsmodus ihres übergeordneten Objekts. Plan-Modus-Sitzungen können nicht über delegierte Agents auf Auto-Edit eskalieren. Privilegierte Modi (Auto-Edit, YOLO) sind in nicht vertrauenswürdigen Ordnern blockiert.
- **Anbieterauswahl**: Ein Subagent mit `model: authType:modelId` oder `model: fast`, wobei `fastModel` zu einem anderen Authentifizierungstyp aufgelöst wird, sendet die Modellanfragen dieses Subagenten an den ausgewählten Anbieter. Stellen Sie sicher, dass dieser Anbieter für die Aufgabe und die Daten des Subagenten geeignet ist.
- **Sandboxing**: Die gesamte Werkzeugausführung folgt demselben Sicherheitsmodell wie die direkte Werkzeugnutzung.
- **Prüfpfad**: Alle Aktionen von Subagents werden protokolliert und sind in Echtzeit sichtbar.
- **Zugriffskontrolle**: Die Trennung auf Projekt- und Benutzerebene bietet angemessene Grenzen.
- **Sensible Informationen**: Vermeiden Sie es, Geheimnisse oder Anmeldeinformationen in Agent-Konfigurationen aufzunehmen.
- **Produktionsumgebungen**: Erwägen Sie separate Agents für Produktions- und Entwicklungsumgebungen.

## Einschränkungen

Die folgenden Soft-Warnungen gelten für Subagent-Konfigurationen (es werden keine harten Grenzen durchgesetzt):

- **Beschreibungsfeld**: Eine Warnung wird angezeigt, wenn Beschreibungen 1.000 Zeichen überschreiten.
- **System Prompt**: Eine Warnung wird angezeigt, wenn System Prompts 10.000 Zeichen überschreiten.
