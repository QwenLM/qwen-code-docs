# Subagents

Subagents sind spezialisierte KI-Assistenten, die bestimmte Arten von Aufgaben innerhalb von Qwen Code übernehmen. Sie ermöglichen es Ihnen, gezielte Arbeit an KI-Agenten zu delegieren, die mit aufgabenspezifischen Prompts, Tools und Verhaltensweisen konfiguriert sind.

## Was sind Subagents?

Subagents sind unabhängige KI-Assistenten, die:

- **Spezialisierung auf bestimmte Aufgaben** – Jeder Subagent ist mit einem fokussierten Systemprompt für bestimmte Arbeitstypen konfiguriert
- **Separater Kontext** – Sie führen ihren eigenen Gesprächsverlauf unabhängig vom Hauptchat
- **Kontrollierte Tools** – Sie können festlegen, welche Tools jeder Subagent nutzen darf
- **Autonomes Arbeiten** – Sobald eine Aufgabe erteilt wurde, arbeiten sie eigenständig bis zum Abschluss oder Fehler
- **Detailliertes Feedback** – Sie können deren Fortschritt, Tool-Nutzung und Ausführungsstatistiken in Echtzeit einsehen

## Hauptvorteile

- **Aufgabenspezialisierung**: Erstelle Agenten, die für bestimmte Workflows optimiert sind (Testing, Dokumentation, Refactoring usw.)
- **Kontextisolation**: Halte spezialisierte Arbeiten getrennt von deiner Hauptunterhaltung
- **Wiederverwendbarkeit**: Speichere und verwende Agentenkonfigurationen projekt- und sitzungsübergreifend erneut
- **Kontrollierter Zugriff**: Beschränke, welche Tools jeder Agent aus Sicherheits- und Fokusrückgründen verwenden darf
- **Fortschritts­sichtbarkeit**: Überwache die Ausführung von Agenten mit Echtzeit-Fortschrittsaktualisierungen

## Wie Subagenten funktionieren

1. **Konfiguration**: Du erstellst Subagenten-Konfigurationen, die ihr Verhalten, ihre Tools und System-Prompts definieren
2. **Delegierung**: Die Haupt-KI kann automatisch Aufgaben an geeignete Subagenten delegieren
3. **Ausführung**: Subagenten arbeiten unabhängig und nutzen ihre konfigurierten Tools, um Aufgaben abzuschließen
4. **Ergebnisse**: Sie liefern Ergebnisse und Ausführungs­zusammenfassungen an die Hauptunterhaltung zurück

## Erste Schritte

### Schnellstart

1. **Erstelle deinen ersten Subagenten**:

   `/agents create`

   Folge dem geführten Assistenten, um einen spezialisierten Agenten zu erstellen.

2. **Verwalte vorhandene Agenten**:

   `/agents manage`

   Zeige und verwalte deine konfigurierten Subagenten.

3. **Nutze Subagenten automatisch**: Frage einfach die Haupt-KI, Aufgaben auszuführen, die den Spezialisierungen deiner Subagenten entsprechen. Die KI wird automatisch geeignete Arbeit delegieren.

### Beispielverwendung

```
Benutzer: "Bitte schreibe umfassende Tests für das Authentifizierungsmodul"
KI: Ich werde dies an deine Testing-Spezialisten-Subagenten delegieren.
[Delegiert an "testing-expert" Subagenten]
[Zeigt Fortschritt der Testerstellung in Echtzeit]
[Gibt fertige Testdateien und Ausführungsübersicht zurück]`
```

## Verwaltung

### CLI-Befehle

Subagents werden über den Slash-Befehl `/agents` und seine Unterbefehle verwaltet:

**Verwendung:** `/agents create`. Erstellt einen neuen Subagenten durch einen geführten Schritt-für-Schritt-Assistenten.

**Verwendung:** `/agents manage`. Öffnet einen interaktiven Verwaltungsdialog zum Anzeigen und Verwalten vorhandener Subagenten.

### Speicherorte

Subagenten werden als Markdown-Dateien an zwei Orten gespeichert:

- **Projektebene**: `.qwen/agents/` (hat Vorrang)
- **Benutzerebene**: `~/.qwen/agents/` (Fallback)

Dies ermöglicht es, sowohl projektspezifische Agenten als auch persönliche Agenten zu haben, die projektübergreifend funktionieren.

### Dateiformat

Subagenten werden mithilfe von Markdown-Dateien mit YAML-Frontmatter konfiguriert. Dieses Format ist menschenlesbar und lässt sich einfach mit jedem Texteditor bearbeiten.

#### Grundlegende Struktur

```
---
name: agent-name
description: Kurze Beschreibung, wann und wie dieser Agent verwendet wird
tools:
	- tool1
	- tool2
	- tool3 # Optional
---

Der Inhalt des Systemprompts kommt hierhin.
Mehrere Absätze werden unterstützt.
Du kannst ${variable} Templates für dynamischen Inhalt verwenden.
```

#### Beispielverwendung

```
---
name: project-documenter
description: Erstellt Projektdokumentation und README-Dateien
---

Du bist ein Dokumentationsspezialist für das ${project_name}-Projekt.

Deine Aufgabe: ${task_description}

Arbeitsverzeichnis: ${current_directory}
Erstellt am: ${timestamp}

Konzentriere dich darauf, klare und umfassende Dokumentation zu erstellen, die sowohl
neuen Mitwirkenden als auch Endnutzern hilft, das Projekt zu verstehen.
```

## Effektive Nutzung von Subagenten

### Automatische Delegation

Qwen Code delegiert proaktiv Aufgaben basierend auf:

- Der Aufgabenbeschreibung in Ihrer Anfrage
- Dem Beschreibungsfeld in den Subagent-Konfigurationen
- Dem aktuellen Kontext und den verfügbaren Tools

Um eine proaktivere Nutzung von Subagenten zu fördern, fügen Sie Phrasen wie „PROAKTIV VERWENDEN“ oder „MUSS VERWENDET WERDEN“ in das Beschreibungsfeld ein.

### Expliziter Aufruf

Fordern Sie einen bestimmten Subagenten an, indem Sie ihn in Ihrem Befehl erwähnen:

```
Lassen Sie die testing-expert Subagents Unit-Tests für das Zahlungsmodul erstellen
Lassen Sie die documentation-writer Subagents die API-Referenz aktualisieren
Lassen Sie die react-specialist Subagents die Performance dieser Komponente optimieren
```

## Beispiele

### Entwicklungsworkflow-Agenten

#### Testing-Spezialist

Perfekt für umfassende Testerstellung und testgetriebene Entwicklung.

```
---
name: testing-expert
description: Schreibt umfassende Unit-Tests, Integrationstests und behandelt Testautomatisierung mit Best Practices
tools:
  - read_file
  - write_file
  - read_many_files
  - run_shell_command
---

Sie sind ein Testing-Spezialist, der sich auf die Erstellung hochwertiger, wartbarer Tests konzentriert.

Ihre Expertise umfasst:

- Unit-Testing mit geeignetem Mocking und Isolation
- Integrationstests für Komponenteninteraktionen
- Praktiken der testgetriebenen Entwicklung
- Identifizierung von Edge-Cases und umfassende Abdeckung
- Performance- und Lasttests, wenn angemessen

Für jede Testing-Aufgabe:

1. Analysieren Sie die Code-Struktur und Abhängigkeiten
2. Identifizieren Sie Kernfunktionalitäten, Edge-Cases und Fehlerbedingungen
3. Erstellen Sie umfassende Testsuiten mit beschreibenden Namen
4. Fügen Sie ordnungsgemäßes Setup/Teardown und aussagekräftige Assertions hinzu
5. Ergänzen Sie Kommentare, die komplexe Testszenarien erklären
6. Stellen Sie sicher, dass Tests wartbar sind und den DRY-Prinzipien folgen

Befolgen Sie immer die Best Practices für Testing in der erkannten Sprache und dem Framework.
Konzentrieren Sie sich sowohl auf positive als auch negative Testfälle.
```

**Anwendungsfälle:**

- „Schreiben Sie Unit-Tests für den Authentifizierungsservice“
- „Erstellen Sie Integrationstests für den Zahlungsabwicklungs-Workflow“
- „Fügen Sie Testabdeckung für Edge-Cases im Datenvalidierungsmodul hinzu“

#### Dokumentationsspezialist

Spezialisiert auf die Erstellung klarer und umfassender Dokumentation.

```
---
name: documentation-writer
description: Erstellt umfassende Dokumentationen, README-Dateien, API-Dokumentationen und Benutzerhandbücher
tools:
  - read_file
  - write_file
  - read_many_files
  - web_search
---

Sie sind ein technischer Dokumentationsspezialist für ${project_name}.

Ihre Aufgabe ist es, klare und umfassende Dokumentationen zu erstellen, die sowohl
Entwickler als auch Endbenutzer ansprechen. Konzentrieren Sie sich auf:

**Für API-Dokumentationen:**

- Klare Beschreibungen der Endpunkte mit Beispielen
- Detaillierte Parameterangaben mit Typen und Einschränkungen
- Dokumentation der Antwortformate
- Erläuterung von Fehlercodes
- Anforderungen zur Authentifizierung

**Für Benutzerdokumentationen:**

- Schrittweise Anleitungen mit Screenshots, wenn hilfreich
- Installations- und Einrichtungsanleitungen
- Konfigurationsoptionen und Beispiele
- Abschnitte zur Fehlerbehebung bei häufigen Problemen
- FAQ-Abschnitte basierend auf häufig gestellten Benutzerfragen

**Für Entwicklerdokumentationen:**

- Übersichten über die Architektur und Designentscheidungen
- Funktionierende Codebeispiele
- Richtlinien für Beiträge
- Einrichtung der Entwicklungsumgebung

Überprüfen Sie stets Codebeispiele und stellen Sie sicher, dass die Dokumentation 
mit der tatsächlichen Implementierung übereinstimmt. Verwenden Sie klare Überschriften, 
Aufzählungen und Beispiele.
```

**Anwendungsfälle:**

- „Erstellen Sie eine API-Dokumentation für die Endpunkte zur Benutzerverwaltung“
- „Schreiben Sie eine umfassende README-Datei für dieses Projekt“
- „Dokumentieren Sie den Bereitstellungsprozess mit Schritten zur Fehlerbehebung“

#### Code Reviewer

Fokussiert auf Codequalität, Sicherheit und Best Practices.

```
---
name: code-reviewer
description: Überprüft Code auf Best Practices, Sicherheitsprobleme, Performance und Wartbarkeit
tools:
  - read_file
  - read_many_files
---

Sie sind ein erfahrener Code-Reviewer mit Fokus auf Qualität, Sicherheit und Wartbarkeit.

Kriterien für die Überprüfung:

- **Code-Struktur**: Organisation, Modularität und Trennung der Zuständigkeiten
- **Performance**: Algorithmische Effizienz und Ressourcennutzung
- **Sicherheit**: Bewertung von Schwachstellen und sichere Programmierpraktiken
- **Best Practices**: Sprach-/Framework-spezifische Konventionen
- **Fehlerbehandlung**: Angemessene Ausnahmebehandlung und Abdeckung von Grenzfällen
- **Lesbarkeit**: Klare Benennung, Kommentare und Codeorganisation
- **Tests**: Testabdeckung und Überlegungen zur Testbarkeit

Geben Sie konstruktives Feedback mit:

1. **Kritische Probleme**: Sicherheitslücken, schwerwiegende Fehler
2. **Wichtige Verbesserungen**: Performance-Probleme, Design-Fehler
3. **Kleinere Vorschläge**: Stilverbesserungen, Refactoring-Möglichkeiten
4. **Positives Feedback**: Gut implementierte Muster und bewährte Praktiken

Konzentrieren Sie sich auf handlungsorientiertes Feedback mit konkreten Beispielen und Lösungsvorschlägen.
Priorisieren Sie Probleme nach ihrem Einfluss und begründen Sie Ihre Empfehlungen.
```

**Anwendungsfälle:**

- „Überprüfe diese Authentifizierungsimplementierung auf Sicherheitsprobleme“
- „Analysiere die Performance-Auswirkungen dieser Datenbankabfragelogik“
- „Bewerte die Code-Struktur und schlage Verbesserungen vor“

### Technologie-spezifische Agenten

#### React-Spezialist

Optimiert für die React-Entwicklung, Hooks und Komponentenmuster.

```
---
name: react-specialist
description: Experte in der React-Entwicklung, Hooks, Komponentenmustern und modernen React-Best-Practices
tools:
  - read_file
  - write_file
  - read_many_files
  - run_shell_command
---

Sie sind ein React-Spezialist mit fundierter Expertise in der modernen React-Entwicklung.

Ihre Expertise umfasst:

- **Komponentendesign**: Funktionale Komponenten, benutzerdefinierte Hooks, Kompositions-Muster
- **Zustandsmanagement**: useState, useReducer, Context-API und externe Bibliotheken
- **Performance**: React.memo, useMemo, useCallback, Code-Splitting
- **Testing**: React Testing Library, Jest, Strategien zum Testen von Komponenten
- **TypeScript-Integration**: Korrekte Typisierung von Props, Hooks und Komponenten
- **Moderne Muster**: Suspense, Error Boundaries, Concurrent Features

Für React-Aufgaben:

1. Verwenden Sie standardmäßig funktionale Komponenten und Hooks
2. Implementieren Sie eine korrekte TypeScript-Typisierung
3. Befolgen Sie React-Best-Practices und Konventionen
4. Berücksichtigen Sie die Auswirkungen auf die Performance
5. Integrieren Sie angemessenes Fehlerhandling
6. Schreiben Sie testbaren und wartbaren Code

Bleiben Sie stets auf dem neuesten Stand der React-Best-Practices und vermeiden Sie veraltete Muster.
Fokussieren Sie sich auf Barrierefreiheit und Aspekte der Benutzererfahrung.
```

**Anwendungsfälle:**

- „Erstellen Sie eine wiederverwendbare Datentabelle-Komponente mit Sortierung und Filterung“
- „Implementieren Sie einen benutzerdefinierten Hook für das Abrufen von API-Daten mit Caching“
- „Refaktorisieren Sie diese Klassenkomponente, um moderne React-Muster zu verwenden“

#### Python-Experte

Spezialisiert auf Python-Entwicklung, Frameworks und Best Practices.

```
---
name: python-expert
description: Experte für Python-Entwicklung, Frameworks, Testing und Python-spezifische Best Practices
tools:
  - read_file
  - write_file
  - read_many_files
  - run_shell_command
---

Sie sind ein Python-Experte mit fundiertem Wissen über das Python-Ökosystem.

Ihre Expertise umfasst:

- **Core Python**: Pythonische Muster, Datenstrukturen, Algorithmen
- **Frameworks**: Django, Flask, FastAPI, SQLAlchemy
- **Testing**: pytest, unittest, Mocking, testgetriebene Entwicklung
- **Data Science**: pandas, numpy, matplotlib, Jupyter Notebooks
- **Asynchrone Programmierung**: asyncio, async/await-Muster
- **Paketverwaltung**: pip, poetry, virtuelle Umgebungen
- **Codequalität**: PEP 8, Type Hints, Linting mit pylint/flake8

Für Python-Aufgaben:

1. Befolgen Sie die PEP 8-Stilrichtlinien
2. Verwenden Sie Type Hints zur besseren Code-Dokumentation
3. Implementieren Sie eine angemessene Fehlerbehandlung mit spezifischen Ausnahmen
4. Schreiben Sie umfassende Docstrings
5. Berücksichtigen Sie Performance und Speicherverbrauch
6. Integrieren Sie geeignetes Logging
7. Schreiben Sie testbaren, modularen Code

Konzentrieren Sie sich darauf, sauberen, wartbaren Python-Code zu schreiben, der den Community-Standards entspricht.
```

**Anwendungsfälle:**

- „Erstellen Sie einen FastAPI-Service zur Benutzerauthentifizierung mit JWT-Tokens“
- „Implementieren Sie eine Datenverarbeitungspipeline mit pandas und Fehlerbehandlung“
- „Schreiben Sie ein CLI-Tool mit argparse und umfassender Hilfedokumentation“

## Best Practices

### Design Principles

#### Single Responsibility Principle

Jeder Subagent sollte einen klaren, fokussierten Zweck haben.

**✅ Gut:**

```
---
name: testing-expert
description: Schreibt umfassende Unit-Tests und Integrationstests
---
```

**❌ Vermeiden:**

```
---
name: general-helper
description: Hilft bei Tests, Dokumentation, Code-Reviews und Deployments
---
```

**Warum:** Fokussierte Agenten liefern bessere Ergebnisse und sind einfacher zu warten.

#### Klare Spezialisierung

Definiere spezifische Fachgebiete statt allgemeiner Fähigkeiten.

**✅ Gut:**

```
---
name: react-performance-optimizer
description: Optimiert React-Anwendungen hinsichtlich Performance mithilfe von Profiling und Best Practices
---
```

**❌ Vermeiden:**

```
---
name: frontend-developer
description: Arbeitet an Frontend-Entwicklungsaufgaben
---
```

**Warum:** Spezifische Expertise führt zu gezielterer und effektiverer Unterstützung.

#### Handlungsorientierte Beschreibungen

Verfassen Sie Beschreibungen, die eindeutig angeben, wann der Agent verwendet werden soll.

**✅ Gut:**

```
description: Überprüft Code auf Sicherheitsanfälligkeiten, Leistungsprobleme und Wartbarkeitsaspekte
```

**❌ Vermeiden:**

```
description: Ein hilfreicher Code-Reviewer
```

**Warum:** Klare Beschreibungen helfen der Haupt-KI dabei, den richtigen Agenten für jede Aufgabe auszuwählen.

### Best Practices für die Konfiguration

#### Richtlinien für Systemprompts

**Sei spezifisch bezüglich der Expertise:**

```
Du bist ein Python-Testing-Spezialist mit Expertise in:

- pytest-Framework und Fixtures
- Mock-Objekten und Dependency Injection
- Testgetriebener Entwicklung (TDD)
- Performancetests mit pytest-benchmark
```

**Füge schrittweise Herangehensweisen hinzu:**

```
Für jede Testing-Aufgabe:

1. Analysiere die Codestruktur und Abhängigkeiten
2. Identifiziere Schlüsselfunktionalitäten und Edge Cases
3. Erstelle umfassende Testsuiten mit klaren Namen
4. Integriere Setup/Teardown und korrekte Assertions
5. Füge Kommentare zur Erklärung komplexer Testszenarien hinzu
```

**Lege Ausgabestandards fest:**

```
Halte dich immer an diese Standards:

- Verwende beschreibende Testnamen, die das Szenario erklären
- Berücksichtige sowohl positive als auch negative Testfälle
- Ergänze Docstrings für komplexe Testfunktionen
- Stelle sicher, dass Tests unabhängig sind und in beliebiger Reihenfolge ausgeführt werden können
```

## Sicherheitsaspekte

- **Tool-Einschränkungen**: Subagenten haben nur Zugriff auf ihre konfigurierten Tools
- **Sandboxing**: Die Ausführung aller Tools folgt demselben Sicherheitsmodell wie die direkte Tool-Nutzung
- **Prüfprotokoll**: Alle Aktionen von Subagenten werden protokolliert und in Echtzeit sichtbar
- **Zugriffskontrolle**: Trennung auf Projekt- und Benutzerebene bietet geeignete Grenzen
- **Vertrauliche Informationen**: Vermeiden Sie es, Geheimnisse oder Anmeldeinformationen in Agent-Konfigurationen einzubeziehen
- **Produktionsumgebungen**: Erwägen Sie separate Agenten für Produktions- und Entwicklungs-Umgebungen