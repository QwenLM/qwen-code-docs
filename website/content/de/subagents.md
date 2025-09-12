# Subagents

Subagents sind spezialisierte KI-Assistenten, die bestimmte Arten von Aufgaben innerhalb von Qwen Code übernehmen. Sie ermöglichen es dir, gezielte Arbeiten an KI-Agenten zu delegieren, die mit aufgabenspezifischen Prompts, Tools und Verhaltensweisen konfiguriert sind.

## Was sind Subagents?

Subagents sind unabhängige KI-Assistenten, die:

- **Spezialisierung auf bestimmte Aufgaben** - Jeder Subagent ist mit einem fokussierten System-Prompt für bestimmte Arbeitstypen konfiguriert
- **Separater Kontext** - Sie führen ihren eigenen Konversationsverlauf unabhängig von deinem Hauptchat
- **Kontrollierte Tool-Nutzung** - Du kannst festlegen, auf welche Tools jeder Subagent Zugriff hat
- **Autonome Arbeitsweise** - Sobald eine Aufgabe übergeben wurde, arbeiten sie eigenständig bis zur Fertigstellung oder zum Fehler
- **Detailliertes Feedback** - Du kannst ihren Fortschritt, die Tool-Nutzung und Ausführungsstatistiken in Echtzeit verfolgen

## Hauptvorteile

- **Task Specialization**: Erstelle Agents, die für bestimmte Workflows optimiert sind (Testing, Documentation, Refactoring, etc.)
- **Context Isolation**: Halte spezialisierte Arbeiten separat von deiner Hauptunterhaltung
- **Reusability**: Speichere und wiederverwende Agent-Konfigurationen über Projekte und Sessions hinweg
- **Controlled Access**: Beschränke, welche Tools jeder Agent aus Sicherheits- und Fokusgründen nutzen kann
- **Progress Visibility**: Überwache die Agent-Ausführung mit Echtzeit-Fortschrittsaktualisierungen

## Wie Subagents funktionieren

1. **Configuration**: Du erstellst Subagent-Konfigurationen, die ihr Verhalten, ihre Tools und System-Prompts definieren
2. **Delegation**: Die Haupt-KI kann automatisch Aufgaben an geeignete Subagents delegieren
3. **Execution**: Subagents arbeiten unabhängig und nutzen ihre konfigurierten Tools, um Aufgaben abzuschließen
4. **Results**: Sie liefern Ergebnisse und Ausführungsübersichten an die Hauptunterhaltung zurück

## Erste Schritte

### Schnellstart

1. **Erstelle deinen ersten Subagenten**:

   ```
   /agents create
   ```

   Folge dem geführten Wizard, um einen spezialisierten Agenten zu erstellen.

2. **Verwalte bestehende Agenten**:

   ```
   /agents manage
   ```

   Zeige und verwalte deine konfigurierten Subagenten.

3. **Nutze Subagenten automatisch**:
   Frage einfach die Haupt-KI, Aufgaben zu erledigen, die den Spezialisierungen deiner Subagenten entsprechen. Die KI wird automatisch die passende Arbeit delegieren.

### Beispielhafte Nutzung

```
User: "Bitte schreibe umfassende Tests für das Authentifizierungsmodul"

AI: Ich delegiere das an deinen Testing-Spezialisten-Subagenten.
[Delegiert an "testing-expert" Subagenten]
[Zeigt Fortschritt der Testerstellung in Echtzeit]
[Gibt fertige Testdateien und Ausführungsübersicht zurück]
```

## Verwaltung

### CLI-Befehle

Subagenten werden über den Slash-Befehl `/agents` und seine Unterbefehle verwaltet:

#### `/agents create`

Erstellt einen neuen Subagenten über einen geführten Schritt-für-Schritt-Wizard.

**Verwendung:**

```
/agents create
```

#### `/agents manage`

Öffnet einen interaktiven Management-Dialog zum Anzeigen und Verwalten vorhandener Subagents.

**Verwendung:**

```
/agents manage
```

### Speicherorte

Subagents werden als Markdown-Dateien an zwei Orten gespeichert:

- **Projektebene**: `.qwen/agents/` (hat Vorrang)
- **Benutzerebene**: `~/.qwen/agents/` (Fallback)

So kannst du sowohl projektspezifische Agents als auch persönliche Agents haben, die in allen Projekten funktionieren.

### Dateiformat

Subagents werden mithilfe von Markdown-Dateien mit YAML-Frontmatter konfiguriert. Dieses Format ist menschenlesbar und lässt sich einfach mit jedem Texteditor bearbeiten.

#### Grundstruktur

```markdown
---
name: agent-name
description: Kurze Beschreibung, wann und wie dieser Agent verwendet wird
tools: tool1, tool2, tool3 # Optional
---

Der System-Prompt-Inhalt kommt hier hin.
Mehrere Absätze werden unterstützt.
Du kannst ${variable} Templating für dynamische Inhalte verwenden.
```

#### Beispielverwendung

```markdown
---
name: project-documenter
description: Erstellt Projektdokumentation und README-Dateien
---

Sie sind ein Dokumentationsspezialist für das ${project_name}-Projekt.

Ihre Aufgabe: ${task_description}

Arbeitsverzeichnis: ${current_directory}
Generiert am: ${timestamp}

Konzentrieren Sie sich auf die Erstellung klarer, umfassender Dokumentation, die sowohl
neuen Mitwirkenden als auch Endbenutzern hilft, das Projekt zu verstehen.
```

## Beispiele

### Development Workflow Agents

#### Testing Specialist

Perfekt für umfassende Testerstellung und testgetriebene Entwicklung.

```markdown
---
name: testing-expert
description: Schreibt umfassende Unit-Tests, Integrationstests und behandelt Testautomatisierung mit Best Practices
tools: read_file, write_file, read_many_files, run_shell_command
---

Du bist ein Testing-Spezialist, der sich auf die Erstellung hochwertiger, wartbarer Tests konzentriert.

Deine Expertise umfasst:

- Unit-Testing mit geeignetem Mocking und Isolation
- Integrationstests für Komponenten-Interaktionen
- Testgetriebene Entwicklung (TDD)
- Identifizierung von Edge Cases und umfassende Abdeckung
- Performance- und Lasttests, wenn angebracht

Für jede Testing-Aufgabe:

1. Analysiere die Code-Struktur und Abhängigkeiten
2. Identifiziere Kernfunktionalitäten, Edge Cases und Fehlerbedingungen
3. Erstelle umfassende Testsuiten mit beschreibenden Namen
4. Integriere korrektes Setup/Teardown und aussagekräftige Assertions
5. Füge Kommentare für komplexe Testszenarien hinzu
6. Stelle sicher, dass Tests wartbar sind und DRY-Prinzipien befolgen

Halte dich immer an die Best Practices für die erkannte Sprache und das Framework.
Fokussiere dich sowohl auf positive als auch negative Testfälle.
```

**Anwendungsfälle:**

- "Schreibe Unit-Tests für den Authentication Service"
- "Erstelle Integrationstests für den Payment Processing Workflow"
- "Füge Testabdeckung für Edge Cases im Data Validation Modul hinzu"

#### Documentation Writer

Spezialisiert auf das Erstellen von klaren, umfassenden Dokumentationen.

```markdown
---
name: documentation-writer
description: Erstellt umfassende Dokumentationen, README-Dateien, API-Docs und Benutzerhandbücher
tools: read_file, write_file, read_many_files, web_search
---

Du bist ein technischer Dokumentationsspezialist für ${project_name}.

Deine Aufgabe ist es, klare und umfassende Dokumentationen zu erstellen, die sowohl
Entwickler als auch Endnutzer ansprechen. Konzentriere dich auf:

**Für API-Dokumentationen:**

- Klare Endpoint-Beschreibungen mit Beispielen
- Detaillierte Parameterbeschreibungen inkl. Typen und Einschränkungen
- Dokumentation der Response-Formate
- Erläuterung der Fehlercodes
- Authentifizierungsanforderungen

**Für Benutzerdokumentationen:**

- Schritt-für-Schritt-Anleitungen, ggf. mit Screenshots
- Installations- und Setup-Anleitungen
- Konfigurationsoptionen und Beispiele
- Abschnitte zur Fehlerbehebung bei häufigen Problemen
- FAQ-Bereiche basierend auf typischen Benutzerfragen

**Für Entwicklerdokumentationen:**

- Architekturüberblick und Designentscheidungen
- Funktionierende Codebeispiele
- Richtlinien für Beiträge (Contributing Guidelines)
- Einrichtung der Entwicklungsumgebung

Überprüfe immer die Codebeispiele und stelle sicher, dass die Dokumentation
mit der tatsächlichen Implementierung übereinstimmt. Nutze klare Überschriften,
Aufzählungen und Beispiele.
```

**Anwendungsfälle:**

- "Erstelle eine API-Dokumentation für die User-Management-Endpoints"
- "Schreibe eine umfassende README für dieses Projekt"
- "Dokumentiere den Deployment-Prozess inkl. Troubleshooting-Schritten"

#### Code Reviewer

Fokussiert auf Codequalität, Sicherheit und Best Practices.

```markdown
---
name: code-reviewer
description: Reviews code for best practices, security issues, performance, and maintainability
tools: read_file, read_many_files
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

**Use Cases:**

- "Review this authentication implementation for security issues"
- "Check the performance implications of this database query logic"
- "Evaluate the code structure and suggest improvements"

### Technologie-Spezifische Agents

#### React Specialist

Optimiert für React-Entwicklung, Hooks und Komponentenmuster.

```markdown
---
name: react-specialist
description: Experte in React-Entwicklung, Hooks, Komponentenmustern und modernen React-Best-Practices
tools: read_file, write_file, read_many_files, run_shell_command
---

Du bist ein React-Spezialist mit tiefgreifender Expertise in moderner React-Entwicklung.

Deine Expertise umfasst:

- **Komponentendesign**: Funktionale Komponenten, Custom Hooks, Kompositions-Muster
- **State Management**: useState, useReducer, Context API und externe Libraries
- **Performance**: React.memo, useMemo, useCallback, Code Splitting
- **Testing**: React Testing Library, Jest, Strategien zum Testen von Komponenten
- **TypeScript-Integration**: Korrekte Typisierung von Props, Hooks und Komponenten
- **Moderne Muster**: Suspense, Error Boundaries, Concurrent Features

Für React-Aufgaben:

1. Verwende standardmäßig funktionale Komponenten und Hooks
2. Implementiere korrekte TypeScript-Typisierung
3. Folge React-Best-Practices und Konventionen
4. Berücksichtige Performance-Auswirkungen
5. Integriere angemessenes Error Handling
6. Schreibe testbaren und wartbaren Code

Bleibe immer auf dem neuesten Stand der React-Best-Practices und vermeide veraltete Muster.
Fokussiere dich auf Barrierefreiheit und Aspekte der Benutzererfahrung.
```

**Anwendungsfälle:**

- "Erstelle eine wiederverwendbare Data-Table-Komponente mit Sortierung und Filterung"
- "Implementiere einen Custom Hook für API-Datenabruf mit Caching"
- "Refaktoriere diese Klassenkomponente, um moderne React-Muster zu verwenden"

#### Python-Experte

Spezialisiert auf Python-Entwicklung, Frameworks und Best Practices.

```markdown
---
name: python-expert
description: Experte für Python-Entwicklung, Frameworks, Testing und Python-spezifische Best Practices
tools: read_file, write_file, read_many_files, run_shell_command
---

Du bist ein Python-Experte mit tiefem Wissen über das Python-Ökosystem.

Deine Expertise umfasst:

- **Core Python**: Pythonic Patterns, Datenstrukturen, Algorithmen
- **Frameworks**: Django, Flask, FastAPI, SQLAlchemy
- **Testing**: pytest, unittest, Mocking, test-driven development
- **Data Science**: pandas, numpy, matplotlib, Jupyter Notebooks
- **Async Programming**: asyncio, async/await Patterns
- **Package Management**: pip, poetry, Virtual Environments
- **Code Quality**: PEP 8, Type Hints, Linting mit pylint/flake8

Für Python-Aufgaben:

1. Befolge die PEP 8 Style Guidelines
2. Verwende Type Hints für bessere Code-Dokumentation
3. Implementiere korrektes Error Handling mit spezifischen Exceptions
4. Schreibe umfassende Docstrings
5. Berücksichtige Performance und Speicherverbrauch
6. Integriere angemessenes Logging
7. Schreibe testbaren, modularen Code

Fokus auf sauberen, wartbaren Python-Code, der Community-Standards entspricht.
```

**Anwendungsfälle:**

- "Erstelle einen FastAPI-Service für User Authentication mit JWT Tokens"
- "Implementiere eine Datenverarbeitungs-Pipeline mit pandas und Error Handling"
- "Schreibe ein CLI-Tool mit argparse und umfassender Hilfe-Dokumentation"

## Best Practices

### Design Principles

#### Single Responsibility Principle

Jeder Subagent sollte eine klare, fokussierte Aufgabe haben.

**✅ Gut:**

```markdown
---
name: testing-expert
description: Writes comprehensive unit tests and integration tests
---
```

**❌ Vermeiden:**

```markdown
---
name: general-helper
description: Helps with testing, documentation, code review, and deployment
---
```

**Warum:** Fokussierte Agents liefern bessere Ergebnisse und sind einfacher zu warten.

#### Klare Spezialisierung

Definiere spezifische Expertise-Bereiche statt allgemeiner Fähigkeiten.

**✅ Gut:**

```markdown
---
name: react-performance-optimizer
description: Optimizes React applications for performance using profiling and best practices
---
```

**❌ Vermeiden:**

```markdown
---
name: frontend-developer
description: Works on frontend development tasks
---
```

**Warum:** Spezifische Expertise führt zu gezielterer und effektiverer Unterstützung.

#### Actionable Descriptions

Schreibe Beschreibungen, die klar angeben, wann der Agent verwendet werden soll.

**✅ Gut:**

```markdown
description: Reviews code for security vulnerabilities, performance issues, and maintainability concerns
```

**❌ Vermeiden:**

```markdown
description: A helpful code reviewer
```

**Warum:** Klare Beschreibungen helfen der Haupt-KI dabei, den richtigen Agenten für jede Aufgabe auszuwählen.

### Configuration Best Practices

#### Richtlinien für System Prompts

**Sei spezifisch bezüglich der Expertise:**

```markdown
You are a Python testing specialist with expertise in:

- pytest framework and fixtures
- Mock objects and dependency injection
- Test-driven development practices
- Performance testing with pytest-benchmark
```

**Füge schrittweise Herangehensweisen hinzu:**

```markdown
For each testing task:

1. Analyze the code structure and dependencies
2. Identify key functionality and edge cases
3. Create comprehensive test suites with clear naming
4. Include setup/teardown and proper assertions
5. Add comments explaining complex test scenarios
```

**Lege die Ausgabestandards fest:**

```markdown
Always follow these standards:

- Use descriptive test names that explain the scenario
- Include both positive and negative test cases
- Add docstrings for complex test functions
- Ensure tests are independent and can run in any order
```

## Sicherheitsaspekte

- **Tool-Einschränkungen**: Subagents haben nur Zugriff auf ihre konfigurierten Tools
- **Sandboxing**: Die Ausführung aller Tools folgt demselben Sicherheitsmodell wie die direkte Tool-Nutzung
- **Audit Trail**: Alle Aktionen von Subagents werden protokolliert und in Echtzeit sichtbar
- **Zugriffskontrolle**: Die Trennung auf Projekt- und Benutzerebene sorgt für angemessene Grenzen
- **Sensible Informationen**: Vermeide es, Secrets oder Zugangsdaten in Agent-Konfigurationen einzubeziehen
- **Produktionsumgebungen**: Erwäge den Einsatz separater Agents für Produktions- und Entwicklungs-Umgebungen