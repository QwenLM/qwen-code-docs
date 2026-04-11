# Subagents

Subagents sind spezialisierte KI-Assistenten, die bestimmte Arten von Aufgaben innerhalb von Qwen Code übernehmen. Sie ermöglichen es dir, fokussierte Arbeiten an KI-Agenten zu delegieren, die mit aufgabenbezogenen Prompts, Tools und Verhaltensweisen konfiguriert sind.

## Was sind Subagents?

Subagents sind unabhängige KI-Assistenten, die:

- **Sich auf bestimmte Aufgaben spezialisieren** – Jeder Subagent wird mit einem fokussierten System-Prompt für bestimmte Arbeitsarten konfiguriert
- **Einen separaten Kontext besitzen** – Sie führen einen eigenen Gesprächsverlauf, getrennt von deinem Haupt-Chat
- **Kontrollierte Tools verwenden** – Du kannst konfigurieren, auf welche Tools jeder Subagent Zugriff hat
- **Autonom arbeiten** – Sobald sie eine Aufgabe erhalten, arbeiten sie unabhängig bis zur Fertigstellung oder einem Fehler
- **Detailliertes Feedback liefern** – Du kannst ihren Fortschritt, die Tool-Nutzung und Ausführungsstatistiken in Echtzeit verfolgen

## Hauptvorteile

- **Aufgabenspezialisierung**: Erstelle Agenten, die für bestimmte Workflows optimiert sind (Testing, Dokumentation, Refactoring usw.)
- **Kontextisolation**: Halte spezialisierte Arbeiten getrennt von deiner Hauptkonversation
- **Wiederverwendbarkeit**: Speichere und verwende Agenten-Konfigurationen projekt- und sitzungsübergreifend
- **Kontrollierter Zugriff**: Beschränke die Tools, die jeder Agent verwenden darf, für mehr Sicherheit und Fokus
- **Fortschrittstransparenz**: Überwache die Agentenausführung mit Echtzeit-Fortschrittsupdates

## So funktionieren Subagents

1. **Konfiguration**: Du erstellst Subagent-Konfigurationen, die ihr Verhalten, ihre Tools und System-Prompts definieren
2. **Delegation**: Die Haupt-KI kann Aufgaben automatisch an passende Subagents delegieren
3. **Ausführung**: Subagents arbeiten unabhängig und nutzen ihre konfigurierten Tools, um Aufgaben abzuschließen
4. **Ergebnisse**: Sie geben Ergebnisse und Ausführungsberichte zurück an die Hauptkonversation

## Erste Schritte

### Schnellstart

1. **Erstelle deinen ersten Subagent**:

   `/agents create`

   Folge dem geführten Assistenten, um einen spezialisierten Agenten zu erstellen.

2. **Verwalte bestehende Agenten**:

   `/agents manage`

   Zeige und verwalte deine konfigurierten Subagents.

3. **Verwende Subagents automatisch**: Bitte einfach die Haupt-KI, Aufgaben auszuführen, die zu den Spezialisierungen deiner Subagents passen. Die KI delegiert passende Arbeiten automatisch.

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

Subagents werden über den Slash-Befehl `/agents` und seine Unterbefehle verwaltet:

**Verwendung:** `/agents create`. Erstellt einen neuen Subagent über einen geführten Schritt-für-Schritt-Assistenten.

**Verwendung:** `/agents manage`. Öffnet einen interaktiven Verwaltungsdialog zum Anzeigen und Verwalten bestehender Subagents.

### Speicherorte

Subagents werden als Markdown-Dateien an mehreren Orten gespeichert:

- **Projekt-Ebene**: `.qwen/agents/` (höchste Priorität)
- **Benutzer-Ebene**: `~/.qwen/agents/` (Fallback)
- **Erweiterungs-Ebene**: Von installierten Erweiterungen bereitgestellt

Dies ermöglicht dir projektspezifische Agenten, persönliche Agenten, die projektübergreifend funktionieren, und von Erweiterungen bereitgestellte Agenten, die spezialisierte Funktionen hinzufügen.

### Erweiterungs-Subagents

Erweiterungen können benutzerdefinierte Subagents bereitstellen, die verfügbar werden, sobald die Erweiterung aktiviert ist. Diese Agenten werden im `agents/`-Verzeichnis der Erweiterung gespeichert und folgen demselben Format wie persönliche und Projekt-Agenten.

Erweiterungs-Subagents:

- Werden automatisch erkannt, wenn die Erweiterung aktiviert ist
- Erscheinen im `/agents manage`-Dialog im Bereich "Extension Agents"
- Können nicht direkt bearbeitet werden (bearbeite stattdessen die Erweiterungsquelle)
- Folgen demselben Konfigurationsformat wie benutzerdefinierte Agenten

Um zu sehen, welche Erweiterungen Subagents bereitstellen, prüfe die `qwen-extension.json`-Datei der Erweiterung auf ein `agents`-Feld.

### Dateiformat

Subagents werden über Markdown-Dateien mit YAML-Frontmatter konfiguriert. Dieses Format ist menschenlesbar und lässt sich mit jedem Texteditor einfach bearbeiten.

#### Grundstruktur

```
---
name: agent-name
description: Brief description of when and how to use this agent
model: inherit # Optional: inherit or model-id
tools:
	- tool1
	- tool2
	- tool3 # Optional
---

System prompt content goes here.
Multiple paragraphs are supported.
```

#### Modellauswahl

Verwende das optionale `model`-Frontmatter-Feld, um zu steuern, welches Modell ein Subagent verwendet:

- `inherit`: Verwende dasselbe Modell wie die Hauptkonversation
- Feld weglassen: Entspricht `inherit`
- `glm-5`: Verwende diese Modell-ID mit dem Authentifizierungstyp der Hauptkonversation
- `openai:gpt-4o`: Verwende einen anderen Provider (Credentials werden aus Umgebungsvariablen aufgelöst)

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

Um eine proaktivere Nutzung von Subagents zu fördern, füge Formulierungen wie "use PROACTIVELY" oder "MUST BE USED" in dein Beschreibungsfeld ein.

### Expliziter Aufruf

Fordere einen bestimmten Subagent an, indem du ihn in deinem Befehl erwähnst:

```
Let the testing-expert Subagents create unit tests for the payment module
Have the documentation-writer Subagents update the API reference
Get the react-specialist Subagents to optimize this component's performance
```

## Beispiele

### Development-Workflow-Agenten

#### Testing-Spezialist

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

- „Schreibe Unit-Tests für den Authentifizierungsdienst“
- „Erstelle Integrationstests für den Zahlungsablauf“
- „Füge Testabdeckung für Edge Cases im Datenvalidierungsmodul hinzu“

#### Dokumentationsschreiber

Spezialisiert auf das Erstellen klarer, umfassender Dokumentation.

```
---
name: documentation-writer
description: Creates comprehensive documentation, README files, API docs, and user guides
tools:
  - read_file
  - write_file
  - read_many_files
  - web_search
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

- „Erstelle API-Dokumentation für die Benutzerverwaltungs-Endpoints“
- „Schreibe ein umfassendes README für dieses Projekt“
- „Dokumentiere den Deployment-Prozess mit Troubleshooting-Schritten“

#### Code-Reviewer

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

- „Überprüfe diese Authentifizierungsimplementierung auf Sicherheitslücken“
- „Prüfe die Performance-Auswirkungen dieser Datenbankabfrage-Logik“
- „Bewerte die Code-Struktur und schlage Verbesserungen vor“

### Technologie-spezifische Agenten

#### React-Spezialist

Optimiert für React-Entwicklung, Hooks und Komponenten-Patterns.

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

- „Erstelle eine wiederverwendbare Data-Table-Komponente mit Sortierung und Filterung“
- „Implementiere einen Custom Hook für das Abrufen von API-Daten mit Caching“
- „Refaktorisiere diese Klassenkomponente zu modernen React-Patterns“

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
- „Schreibe ein CLI-Tool mit argparse und umfassender Hilfe-Dokumentation“

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

**Warum:** Klare Beschreibungen helfen der Haupt-KI, den richtigen Agenten für jede Aufgabe auszuwählen.

### Konfigurations-Best-Practices

#### Richtlinien für System-Prompts

**Sei spezifisch bezüglich der Expertise:**

```
You are a Python testing specialist with expertise in:

- pytest framework and fixtures
- Mock objects and dependency injection
- Test-driven development practices
- Performance testing with pytest-benchmark
```

**Beziehe Schritt-für-Schritt-Ansätze ein:**

```
For each testing task:

1. Analyze the code structure and dependencies
2. Identify key functionality and edge cases
3. Create comprehensive test suites with clear naming
4. Include setup/teardown and proper assertions
5. Add comments explaining complex test scenarios
```

**Lege Ausgabe-Standards fest:**

```
Always follow these standards:

- Use descriptive test names that explain the scenario
- Include both positive and negative test cases
- Add docstrings for complex test functions
- Ensure tests are independent and can run in any order
```

## Sicherheitshinweise

- **Tool-Einschränkungen**: Subagents haben nur Zugriff auf ihre konfigurierten Tools
- **Sandboxing**: Die gesamte Tool-Ausführung folgt demselben Sicherheitsmodell wie die direkte Tool-Nutzung
- **Audit-Trail**: Alle Subagent-Aktionen werden protokolliert und sind in Echtzeit sichtbar
- **Zugriffskontrolle**: Die Trennung auf Projekt- und Benutzerebene stellt angemessene Grenzen sicher
- **Sensible Informationen**: Vermeide es, Secrets oder Credentials in Agenten-Konfigurationen aufzunehmen
- **Produktionsumgebungen**: Erwäge separate Agenten für Produktions- vs. Entwicklungsumgebungen

## Limits

Für Subagent-Konfigurationen gelten folgende Soft-Warnungen (es werden keine Hard-Limits erzwungen):

- **Beschreibungsfeld**: Eine Warnung wird angezeigt, wenn Beschreibungen 1.000 Zeichen überschreiten
- **System-Prompt**: Eine Warnung wird angezeigt, wenn System-Prompts 10.000 Zeichen überschreiten