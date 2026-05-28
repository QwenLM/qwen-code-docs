---
description: "Konfigurieren Sie Qwen Code Sub Agents für Tests, Dokumentation, Refactoring und Reviews, damit komplexe Aufgaben mit spezialisierten AI-Rollen präziser laufen."
---

# Subagents

Subagents sind spezialisierte KI-Assistenten, die bestimmte Arten von Aufgaben innerhalb von Qwen Code übernehmen. Sie ermöglichen es dir, fokussierte Arbeiten an KI-Agenten zu delegieren, die mit aufgabenbezogenen Prompts, Tools und Verhaltensweisen konfiguriert sind.

## Was sind Subagents?

Subagents sind unabhängige KI-Assistenten, die:

- **Sich auf bestimmte Aufgaben spezialisieren** – Jeder Subagent ist mit einem fokussierten System-Prompt für bestimmte Arbeitsarten konfiguriert
- **Einen separaten Kontext haben** – Sie führen ihren eigenen Gesprächsverlauf, getrennt von deinem Haupt-Chat
- **Kontrollierte Tools verwenden** – Du kannst konfigurieren, auf welche Tools jeder Subagent Zugriff hat
- **Autonom arbeiten** – Sobald sie eine Aufgabe erhalten, arbeiten sie unabhängig bis zur Fertigstellung oder einem Fehler
- **Detailliertes Feedback liefern** – Du kannst ihren Fortschritt, die Tool-Nutzung und Ausführungsstatistiken in Echtzeit verfolgen

## Fork Subagent (Impliziter Fork)

Zusätzlich zu benannten Subagents unterstützt Qwen Code **implizites Forking** – wenn die KI den `subagent_type`-Parameter weglässt, wird ein Fork ausgelöst, der den vollständigen Gesprächskontext des Elternprozesses übernimmt.

### Unterschiede zwischen Fork und benannten Subagents

|               | Benannter Subagent                | Fork Subagent                                         |
| ------------- | --------------------------------- | ----------------------------------------------------- |
| Kontext       | Startet frisch, kein Elternverlauf| Übernimmt den vollständigen Gesprächsverlauf des Elternprozesses |
| System-Prompt | Verwendet eigenen konfigurierten Prompt | Verwendet den exakten System-Prompt des Elternprozesses (für Cache-Sharing) |
| Ausführung    | Blockiert den Elternprozess bis zur Fertigstellung | Läuft im Hintergrund, Elternprozess fährt sofort fort |
| Anwendungsfall| Spezialisierte Aufgaben (Tests, Docs) | Parallele Aufgaben, die den aktuellen Kontext benötigen |

### Wann Forks verwendet werden

Die KI verwendet automatisch einen Fork, wenn sie:

- Mehrere Rechercheaufgaben parallel ausführen muss (z. B. „Untersuche Modul A, B und C")
- Hintergrundaufgaben erledigen muss, während der Haupt-Chat weiterläuft
- Aufgaben delegieren muss, die ein Verständnis des aktuellen Gesprächskontexts erfordern

### Prompt-Cache-Sharing

Alle Forks teilen sich das exakte API-Request-Präfix des Elternprozesses (System-Prompt, Tools, Gesprächsverlauf), was DashScope-Prompt-Cache-Treffer ermöglicht. Wenn 3 Forks parallel laufen, wird das gemeinsame Präfix einmal zwischengespeichert und wiederverwendet – das spart im Vergleich zu unabhängigen Subagents über 80 % der Token-Kosten.

### Verhinderung rekursiver Forks

Fork-Kindprozesse können keine weiteren Forks erstellen. Dies wird zur Laufzeit erzwungen – wenn ein Fork versucht, einen weiteren Fork zu spawnen, erhält er einen Fehler mit der Anweisung, Aufgaben direkt auszuführen.

### Aktuelle Einschränkungen

- **Kein Ergebnis-Feedback**: Fork-Ergebnisse werden im UI-Fortschrittsdisplay angezeigt, aber nicht automatisch in den Haupt-Chat zurückgespielt. Die Eltern-KI sieht eine Platzhalter-Nachricht und kann nicht auf die Ausgabe des Forks reagieren.
- **Keine Worktree-Isolation**: Forks teilen sich das Arbeitsverzeichnis des Elternprozesses. Gleichzeitige Dateimodifikationen durch mehrere Forks können zu Konflikten führen.

## Wichtige Vorteile

- **Aufgabenspezialisierung**: Erstelle Agenten, die für bestimmte Workflows optimiert sind (Tests, Dokumentation, Refactoring usw.)
- **Kontextisolation**: Halte spezialisierte Arbeiten getrennt von deinem Haupt-Chat
- **Kontextvererbung**: Fork-Subagents übernehmen den vollständigen Gesprächsverlauf für kontextintensive parallele Aufgaben
- **Prompt-Cache-Sharing**: Fork-Subagents teilen sich das Cache-Präfix des Elternprozesses, was die Token-Kosten senkt
- **Wiederverwendbarkeit**: Speichere und verwende Agenten-Konfigurationen projekt- und sitzungsübergreifend wieder
- **Kontrollierter Zugriff**: Beschränke, welche Tools jeder Agent verwenden kann, für Sicherheit und Fokus
- **Fortschrittstransparenz**: Überwache die Agentenausführung mit Echtzeit-Fortschrittsupdates

## So funktionieren Subagents

1. **Konfiguration**: Du erstellst Subagent-Konfigurationen, die ihr Verhalten, ihre Tools und System-Prompts definieren
2. **Delegation**: Die Haupt-KI kann Aufgaben automatisch an passende Subagents delegieren – oder implizit forken, wenn kein bestimmter Subagent-Typ benötigt wird
3. **Ausführung**: Subagents arbeiten unabhängig und nutzen ihre konfigurierten Tools, um Aufgaben abzuschließen
4. **Ergebnisse**: Sie liefern Ergebnisse und Ausführungsübersichten zurück an den Haupt-Chat

## Erste Schritte

### Schnellstart

1. **Erstelle deinen ersten Subagent**:

   `/agents create`

   Folge dem geführten Assistenten, um einen spezialisierten Agenten zu erstellen.

2. **Verwalte bestehende Agenten**:

   `/agents manage`

   Zeige und verwalte deine konfigurierten Subagents.

3. **Subagents automatisch nutzen**: Bitte die Haupt-KI einfach, Aufgaben auszuführen, die zu den Spezialisierungen deiner Subagents passen. Die KI delegiert passende Arbeiten automatisch.

### Beispielverwendung

```
User: "Please write comprehensive tests for the authentication module"
AI: I'll delegate this to your testing specialist Subagents.
[Delegates to "testing-expert" Subagents]
[Shows real-time progress of test creation]
[Returns with completed test files and execution summary]`
```

## Verwaltung

### CLI-Befehle

Subagents werden über den Slash-Befehl `/agents` und dessen Unterbefehle verwaltet:

**Verwendung:** `/agents create`. Erstellt einen neuen Subagent über einen geführten Schritt-für-Schritt-Assistenten.

**Verwendung:** `/agents manage`. Öffnet einen interaktiven Verwaltungsdialog zum Anzeigen und Verwalten bestehender Subagents.

### Speicherorte

Subagents werden als Markdown-Dateien an mehreren Orten gespeichert:

- **Projektebene**: `.qwen/agents/` (höchste Priorität)
- **Benutzerebene**: `~/.qwen/agents/` (Fallback)
- **Erweiterungsebene**: Von installierten Erweiterungen bereitgestellt

Dies ermöglicht dir projektspezifische Agenten, persönliche Agenten, die projektübergreifend funktionieren, und von Erweiterungen bereitgestellte Agenten, die spezialisierte Funktionen hinzufügen.

### Erweiterungs-Subagents

Erweiterungen können benutzerdefinierte Subagents bereitstellen, die verfügbar werden, sobald die Erweiterung aktiviert ist. Diese Agenten werden im `agents/`-Verzeichnis der Erweiterung gespeichert und folgen demselben Format wie persönliche und Projekt-Agenten.

Erweiterungs-Subagents:

- Werden automatisch erkannt, wenn die Erweiterung aktiviert ist
- Erscheinen im `/agents manage`-Dialog im Bereich „Extension Agents"
- Können nicht direkt bearbeitet werden (bearbeite stattdessen den Erweiterungs-Quellcode)
- Folgen demselben Konfigurationsformat wie benutzerdefinierte Agenten

Um zu sehen, welche Erweiterungen Subagents bereitstellen, prüfe die `qwen-extension.json`-Datei der Erweiterung auf ein `agents`-Feld.

### Dateiformat

Subagents werden über Markdown-Dateien mit YAML-Frontmatter konfiguriert. Dieses Format ist menschenlesbar und lässt sich einfach mit jedem Texteditor bearbeiten.

#### Grundstruktur

```
---
name: agent-name
description: Brief description of when and how to use this agent
model: inherit # Optional: inherit or model-id
approvalMode: auto-edit # Optional: default, plan, auto-edit, yolo
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

Verwende das optionale `model`-Frontmatter-Feld, um zu steuern, welches Modell ein Subagent verwendet:

- `inherit`: Verwendet dasselbe Modell wie der Haupt-Chat
- Feld weglassen: Gleichbedeutend mit `inherit`
- `glm-5`: Verwendet diese Modell-ID mit dem Authentifizierungstyp des Haupt-Chats
- `openai:gpt-4o`: Verwendet einen anderen Provider (löst Credentials aus Umgebungsvariablen auf)

#### Berechtigungsmodus

Verwende das optionale `approvalMode`-Frontmatter-Feld, um zu steuern, wie Tool-Aufrufe eines Subagents genehmigt werden. Gültige Werte:

- `default`: Tools erfordern interaktive Genehmigung (entspricht dem Standard der Hauptsitzung)
- `plan`: Nur-Analyse-Modus – der Agent plant, führt aber keine Änderungen aus
- `auto-edit`: Tools werden automatisch ohne Nachfrage genehmigt (empfohlen für die meisten Agenten)
- `yolo`: Alle Tools werden automatisch genehmigt, einschließlich potenziell destruktiver

Wenn du dieses Feld weglässt, wird der Berechtigungsmodus des Subagents automatisch bestimmt:

- Wenn die Elternsitzung im Modus **yolo** oder **auto-edit** läuft, übernimmt der Subagent diesen Modus. Ein freizügiger Elternprozess bleibt freizügig.
- Wenn die Elternsitzung im Modus **plan** läuft, bleibt der Subagent im Plan-Modus. Eine Nur-Analyse-Sitzung kann Dateien nicht über einen delegierten Agenten verändern.
- Wenn die Elternsitzung im Modus **default** (in einem vertrauenswürdigen Ordner) läuft, erhält der Subagent **auto-edit**, damit er autonom arbeiten kann.

Wenn du `approvalMode` explizit setzt, haben die freizügigen Modi des Elternprozesses weiterhin Vorrang. Wenn die Elternsitzung beispielsweise im yolo-Modus läuft, wird ein Subagent mit `approvalMode: plan` ebenfalls im yolo-Modus ausgeführt.

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

#### Tool-Konfiguration

Verwende `tools` und `disallowedTools`, um zu steuern, auf welche Tools ein Subagent zugreifen kann.

**`tools` (Allowlist):** Wenn angegeben, kann der Subagent nur die aufgelisteten Tools verwenden. Wenn weggelassen, übernimmt der Subagent alle verfügbaren Tools der Elternsitzung.

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

**`disallowedTools` (Blocklist):** Wenn angegeben, werden die aufgelisteten Tools aus dem Tool-Pool des Subagents entfernt. Dies ist nützlich, wenn du „alles außer X" möchtest, ohne jedes erlaubte Tool aufzulisten.

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

Wenn sowohl `tools` als auch `disallowedTools` gesetzt sind, wird zuerst die Allowlist angewendet, anschließend entfernt die Blocklist Tools aus dieser Menge.

**MCP-Tools** folgen denselben Regeln. Wenn ein Subagent keine `tools`-Liste hat, übernimmt er alle MCP-Tools der Elternsitzung. Wenn ein Subagent eine explizite `tools`-Liste hat, erhält er nur die MCP-Tools, die dort explizit genannt sind.

Das `disallowedTools`-Feld unterstützt MCP-Server-Level-Patterns:

- `mcp__server__tool_name` – blockiert ein bestimmtes MCP-Tool
- `mcp__server` – blockiert alle Tools dieses MCP-Servers

```
---
name: no-slack
description: Agent without Slack access
disallowedTools:
  - mcp__slack
---
```

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

## Subagents effektiv nutzen

### Automatische Delegation

Qwen Code delegiert Aufgaben proaktiv basierend auf:

- Der Aufgabenbeschreibung in deiner Anfrage
- Dem Beschreibungsfeld in den Subagent-Konfigurationen
- Dem aktuellen Kontext und verfügbaren Tools

Um eine proaktivere Nutzung von Subagents zu fördern, füge Formulierungen wie „use PROACTIVELY" oder „MUST BE USED" in dein Beschreibungsfeld ein.

### Expliziter Aufruf

Fordere einen bestimmten Subagent an, indem du ihn in deinem Befehl erwähnst:

```
Let the testing-expert Subagents create unit tests for the payment module
Have the documentation-writer Subagents update the API reference
Get the react-specialist Subagents to optimize this component's performance
```

## Beispiele

### Entwicklungs-Workflow-Agenten

#### Testing Specialist

Ideal für die umfassende Testerstellung und testgetriebene Entwicklung.

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

- „Schreibe Unit-Tests für den Authentifizierungsdienst"
- „Erstelle Integrationstests für den Zahlungsablauf-Workflow"
- „Füge Testabdeckung für Edge Cases im Datenvalidierungsmodul hinzu"

#### Documentation Writer

Spezialisiert auf die Erstellung klarer, umfassender Dokumentation.

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

- „Erstelle API-Dokumentation für die Benutzerverwaltungs-Endpoints"
- „Schreibe ein umfassendes README für dieses Projekt"
- „Dokumentiere den Deployment-Prozess mit Troubleshooting-Schritten"

#### Code Reviewer

Fokussiert auf Code-Qualität, Sicherheit und Best Practices.

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

- „Überprüfe diese Authentifizierungsimplementierung auf Sicherheitslücken"
- „Prüfe die Performance-Auswirkungen dieser Datenbankabfrage-Logik"
- „Bewerte die Code-Struktur und schlage Verbesserungen vor"

### Technologiespezifische Agenten

#### React Specialist

Optimiert für React-Entwicklung, Hooks und Component-Patterns.

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

- „Erstelle eine wiederverwendbare Data-Table-Component mit Sortierung und Filterung"
- „Implementiere einen Custom Hook für API-Datenabruf mit Caching"
- „Refaktorisiere diese Class Component, um moderne React-Patterns zu nutzen"

#### Python Expert

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

- „Erstelle einen FastAPI-Service für die Benutzerauthentifizierung mit JWT-Tokens"
- „Implementiere eine Datenverarbeitungs-Pipeline mit pandas und Fehlerbehandlung"
- „Schreibe ein CLI-Tool mit argparse und umfassender Hilfe-Dokumentation"

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

**Warum:** Fokussierte Agenten liefern bessere Ergebnisse und sind einfacher zu warten.

#### Klare Spezialisierung

Definiere spezifische Expertise-Bereiche statt breiter Fähigkeiten.

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

**Warum:** Spezifische Expertise führt zu gezielterer und effektiverer Unterstützung.

#### Handlungsorientierte Beschreibungen

Schreibe Beschreibungen, die klar angeben, wann der Agent verwendet werden soll.

**✅ Gut:**

```
description: Reviews code for security vulnerabilities, performance issues, and maintainability concerns
```

**❌ Vermeiden:**

```
description: A helpful code reviewer
```

**Warum:** Klare Beschreibungen helfen der Haupt-KI, für jede Aufgabe den richtigen Agenten auszuwählen.

### Konfigurations-Best-Practices

#### System-Prompt-Richtlinien

**Sei spezifisch bei der Expertise:**

```
You are a Python testing specialist with expertise in:

- pytest framework and fixtures
- Mock objects and dependency injection
- Test-driven development practices
- Performance testing with pytest-benchmark
```

**Integriere Schritt-für-Schritt-Ansätze:**

```
For each testing task:

1. Analyze the code structure and dependencies
2. Identify key functionality and edge cases
3. Create comprehensive test suites with clear naming
4. Include setup/teardown and proper assertions
5. Add comments explaining complex test scenarios
```

**Definiere Ausgabe-Standards:**

```
Always follow these standards:

- Use descriptive test names that explain the scenario
- Include both positive and negative test cases
- Add docstrings for complex test functions
- Ensure tests are independent and can run in any order
```

## Sicherheitshinweise

- **Tool-Einschränkungen**: Verwende `tools`, um den Zugriff eines Subagents zu begrenzen, oder `disallowedTools`, um bestimmte Tools zu blockieren, während alles andere übernommen wird
- **Berechtigungsmodus**: Subagents übernehmen standardmäßig den Berechtigungsmodus ihres Elternprozesses. Sitzungen im Plan-Modus können nicht über delegierte Agenten auf auto-edit eskalieren. Privilegierte Modi (auto-edit, yolo) werden in nicht vertrauenswürdigen Ordnern blockiert.
- **Sandboxing**: Die gesamte Tool-Ausführung folgt demselben Sicherheitsmodell wie die direkte Tool-Nutzung
- **Audit-Trail**: Alle Subagent-Aktionen werden protokolliert und sind in Echtzeit sichtbar
- **Zugriffskontrolle**: Die Trennung auf Projekt- und Benutzerebene stellt geeignete Grenzen sicher
- **Sensible Informationen**: Vermeide es, Secrets oder Credentials in Agenten-Konfigurationen aufzunehmen
- **Produktionsumgebungen**: Erwäge separate Agenten für Produktions- und Entwicklungsumgebungen

## Limits

Für Subagent-Konfigurationen gelten folgende Soft-Warnungen (keine harten Limits werden erzwungen):

- **Beschreibungsfeld**: Eine Warnung wird angezeigt, wenn Beschreibungen 1.000 Zeichen überschreiten
- **System-Prompt**: Eine Warnung wird angezeigt, wenn System-Prompts 10.000 Zeichen überschreiten