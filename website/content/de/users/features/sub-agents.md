# Subagenten

Subagenten sind spezialisierte KI-Assistenten, die bestimmte Arten von Aufgaben innerhalb von Qwen Code bearbeiten. Sie ermöglichen es Ihnen, gezielte Arbeit an KI-Agenten zu delegieren, die mit aufgabenbezogenen Prompts, Tools und Verhaltensweisen konfiguriert sind.

## Was sind Subagenten?

Subagenten sind eigenständige KI-Assistenten, die:

- **Auf bestimmte Aufgaben spezialisiert sind** - Jeder Subagent ist mit einem fokussierten System-Prompt für spezielle Arten von Arbeit konfiguriert
- **Separaten Kontext haben** - Sie verwalten ihren eigenen Gesprächsverlauf, getrennt von Ihrem Hauptchat
- **Kontrollierte Tools verwenden** - Sie können konfigurieren, auf welche Tools jeder Subagent Zugriff hat
- **Autonom arbeiten** - Sobald eine Aufgabe übergeben wurde, arbeiten sie unabhängig bis zur Fertigstellung oder zum Scheitern
- **Detailliertes Feedback liefern** - Sie können deren Fortschritt, Tool-Nutzung und Ausführungsstatistiken in Echtzeit einsehen

## Wichtige Vorteile

- **Aufgabenspezialisierung**: Erstellen Sie Agenten, die für spezifische Workflows optimiert sind (Testing, Dokumentation, Refactoring usw.)
- **Kontextisolation**: Halten Sie spezialisierte Arbeit getrennt von Ihrem Hauptgespräch
- **Wiederverwendbarkeit**: Speichern und verwenden Sie Agentenkonfigurationen in Projekten und Sitzungen wieder
- **Kontrollierter Zugriff**: Beschränken Sie, welche Tools jeder Agent aus Sicherheits- und Fokusgründen nutzen kann
- **Sichtbarkeit des Fortschritts**: Überwachen Sie die Ausführung des Agents mit Echtzeit-Fortschrittsaktualisierungen

## So funktionieren Subagenten

1. **Konfiguration**: Sie erstellen Subagenten-Konfigurationen, die deren Verhalten, Tools und Systemaufforderungen definieren
2. **Delegierung**: Die Haupt-KI kann Aufgaben automatisch an geeignete Subagenten delegieren
3. **Ausführung**: Subagenten arbeiten unabhängig und nutzen ihre konfigurierten Tools, um Aufgaben abzuschließen
4. **Ergebnisse**: Sie geben Ergebnisse und Ausführungszusammenfassungen zurück ins Hauptgespräch

## Erste Schritte

### Schnellstart

1. **Erstellen Sie Ihren ersten Subagenten**:

   `/agents create`

   Folgen Sie dem geführten Assistenten, um einen spezialisierten Agenten zu erstellen.

2. **Vorhandene Agenten verwalten**:

   `/agents manage`

   Zeigen und verwalten Sie Ihre konfigurierten Subagenten.

3. **Subagenten automatisch verwenden**: Fragen Sie einfach die Haupt-KI, Aufgaben auszuführen, die den Spezialisierungen Ihrer Subagenten entsprechen. Die KI delegiert dann automatisch geeignete Arbeiten.

### Beispielverwendung

```
Benutzer: "Bitte schreiben Sie umfassende Tests für das Authentifizierungsmodul"
KI: Ich werde dies an Ihre Testing-Spezialisten-Subagenten weiterleiten.
[Leitet an "testing-expert" Subagenten weiter]
[Zeigt Echtzeit-Fortschritt der Test-Erstellung]
[Liefert fertige Testdateien und Ausführungszusammenfassung zurück]
```

## Verwaltung

### CLI-Befehle

Subagenten werden über den Slash-Befehl `/agents` und seine Unterbefehle verwaltet:

**Verwendung:** `/agents create`. Erstellt einen neuen Subagenten über einen interaktiven Schritt-für-Schritt-Assistenten.

**Verwendung:** `/agents manage`. Öffnet einen interaktiven Verwaltungsdialog zum Anzeigen und Verwalten vorhandener Subagenten.

### Speicherorte

Subagenten werden als Markdown-Dateien an mehreren Orten gespeichert:

- **Projektebene**: `.qwen/agents/` (höchste Priorität)
- **Benutzerebene**: `~/.qwen/agents/` (Fallback)
- **Erweiterungsebene**: Wird von installierten Erweiterungen bereitgestellt

Dies ermöglicht es Ihnen, projektspezifische Agenten, persönliche Agenten zu verwenden, die in allen Projekten funktionieren, sowie erweiterungsspezifische Agenten, die spezialisierte Funktionen hinzufügen.

### Erweiterungs-Subagenten

Erweiterungen können benutzerdefinierte Subagenten bereitstellen, die verfügbar werden, wenn die Erweiterung aktiviert ist. Diese Agenten werden im `agents/`-Verzeichnis der Erweiterung gespeichert und folgen dem gleichen Format wie persönliche und Projekt-Agenten.

Erweiterungs-Subagenten:

- Werden automatisch erkannt, wenn die Erweiterung aktiviert wird
- Erscheinen im `/agents manage`-Dialog unter dem Abschnitt "Erweiterungs-Agenten"
- Können nicht direkt bearbeitet werden (stattdessen den Erweiterungsquelltext bearbeiten)
- Folgen dem gleichen Konfigurationsformat wie benutzerdefinierte Agenten

Um zu sehen, welche Erweiterungen Subagenten bereitstellen, überprüfen Sie die `qwen-extension.json`-Datei der Erweiterung auf ein `agents`-Feld.

### Dateiformat

Subagenten werden über Markdown-Dateien mit YAML-Frontmatter konfiguriert. Dieses Format ist menschenlesbar und kann einfach mit jedem Texteditor bearbeitet werden.

#### Grundstruktur

```
---
name: agenten-name
description: Kurze Beschreibung, wann und wie dieser Agent verwendet werden soll
tools:
	- werkzeug1
	- werkzeug2
	- werkzeug3 # Optional
---

Der Inhalt des System-Prompts kommt hier hin.
Mehrere Absätze werden unterstützt.
Sie können ${variable} für dynamische Inhalte verwenden.
```

#### Beispielverwendung

```
---
name: projekt-dokumentierer
description: Erstellt Projektdokumentationen und README-Dateien
---

Sie sind ein Dokumentationsspezialist für das Projekt ${project_name}.

Ihre Aufgabe: ${task_description}

Arbeitsverzeichnis: ${current_directory}
Erstellt am: ${timestamp}

Konzentrieren Sie sich darauf, klare, umfassende Dokumentationen zu erstellen,
die sowohl neuen Mitwirkenden als auch Endbenutzern helfen,
das Projekt zu verstehen.
```

## Effektive Verwendung von Subagenten

### Automatische Delegierung

Qwen Code delegiert proaktiv Aufgaben basierend auf:

- Der Aufgabenbeschreibung in Ihrer Anfrage
- Dem Beschreibungsfeld in den Subagenten-Konfigurationen
- Aktuellem Kontext und verfügbaren Tools

Um proaktivere Nutzung von Subagenten zu fördern, fügen Sie Begriffe wie „PROAKTIV VERWENDEN“ oder „MUSS VERWENDET WERDEN“ in Ihr Beschreibungsfeld ein.

### Explizite Aufrufung

Fordern Sie einen bestimmten Subagenten an, indem Sie ihn in Ihrem Befehl erwähnen:

```
Lassen Sie die Testing-Experten-Subagenten Unittests für das Zahlungsmodul erstellen
Lassen Sie die Dokumentations-Autoren-Subagenten die API-Referenz aktualisieren
Lassen Sie die React-Spezialisten-Subagenten die Leistung dieser Komponente optimieren
```

## Beispiele

### Entwicklungsworkflow-Agenten

#### Testing-Spezialist

Ideal für umfassende Test-Erstellung und testgetriebene Entwicklung.

```
---
name: testing-expert
description: Schreibt umfassende Unit-Tests, Integrationstests und kümmert sich um Testautomatisierung nach Best Practices
tools:
  - read_file
  - write_file
  - read_many_files
  - run_shell_command
---

Sie sind ein Testing-Spezialist mit Fokus auf die Erstellung hochwertiger, wartbarer Tests.

Ihre Expertise umfasst:

- Unit-Testing mit geeignetem Mocking und Isolation
- Integrationstesting für Komponenteninteraktionen
- Praktiken der testgetriebenen Entwicklung
- Identifizierung von Randfällen und umfassende Abdeckung
- Performance- und Lasttests, wenn angebracht

Für jede Testaufgabe:

1. Analysieren Sie die Code-Struktur und Abhängigkeiten
2. Identifizieren Sie wichtige Funktionalitäten, Randfälle und Fehlerbedingungen
3. Erstellen Sie umfassende Test-Suiten mit aussagekräftigen Namen
4. Fügen Sie ordnungsgemäßes Setup/Teardown und sinnvolle Assertions hinzu
5. Ergänzen Sie Kommentare zur Erklärung komplexer Test-Szenarien
6. Stellen Sie sicher, dass Tests wartbar sind und den DRY-Prinzipien folgen

Folgen Sie immer den Testing-Best-Practices für die erkannte Sprache und das Framework.
Achten Sie sowohl auf positive als auch auf negative Testfälle.
```

**Anwendungsfälle:**

- „Schreibe Unit-Tests für den Authentifizierungsservice“
- „Erstelle Integrationstests für den Zahlungsverarbeitungs-Workflow“
- „Füge Testabdeckung für Randfälle im Datenvalidierungsmodul hinzu“

#### Dokumentationsautor

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

Ihre Aufgabe ist es, klare und umfassende Dokumentation zu erstellen, 
die sowohl Entwickler als auch Endbenutzer anspricht. Konzentrieren Sie sich auf:

**Für API-Dokumentation:**

- Klare Beschreibungen der Endpunkte mit Beispielen
- Details zu Parametern mit Typen und Einschränkungen
- Dokumentation des Antwortformates
- Erläuterungen zu Fehlercodes
- Authentifizierungsanforderungen

**Für Benutzerdokumentation:**

- Schritt-für-Schritt-Anleitungen mit Screenshots, wenn hilfreich
- Installations- und Einrichtungsanleitungen
- Konfigurationsoptionen und Beispiele
- Problembehebungsbereiche für häufige Probleme
- FAQ-Bereiche basierend auf häufig gestellten Benutzerfragen

**Für Entwicklerdokumentation:**

- Architekturübersichten und Designentscheidungen
- Funktionierende Codebeispiele
- Richtlinien zum Mitwirken
- Einrichtung der Entwicklungsumgebung

Überprüfen Sie stets Codebeispiele und stellen Sie sicher, dass die Dokumentation 
mit der tatsächlichen Implementierung aktuell bleibt. Verwenden Sie klare Überschriften, 
Aufzählungspunkte und Beispiele.
```

**Anwendungsfälle:**

- „Erstellen Sie API-Dokumentation für die Benutzerverwaltungsendpunkte“
- „Schreiben Sie eine umfassende README-Datei für dieses Projekt“
- „Dokumentieren Sie den Bereitstellungsprozess mit Schritten zur Problembehebung“

#### Code Reviewer

Ausgerichtet auf Code-Qualität, Sicherheit und Best Practices.

```
---
name: code-reviewer
description: Überprüft Code hinsichtlich Best Practices, Sicherheitsproblemen, Performance und Wartbarkeit
tools:
  - read_file
  - read_many_files
---

Sie sind ein erfahrener Code-Reviewer mit Fokus auf Qualität, Sicherheit und Wartbarkeit.

Überprüfungs-Kriterien:

- **Code-Struktur**: Organisation, Modularität und Trennung von Verantwortlichkeiten
- **Performance**: Algorithmische Effizienz und Ressourcennutzung
- **Sicherheit**: Schwachstellenbewertung und sichere Codierungspraktiken
- **Best Practices**: Sprach-/Framework-spezifische Konventionen
- **Fehlerbehandlung**: Richtige Exception-Handling und Abdeckung von Randfällen
- **Lesbarkeit**: Klare Benennung, Kommentare und Code-Organisation
- **Tests**: Testabdeckung und Testbarkeitsaspekte

Geben Sie konstruktives Feedback mit:

1. **Kritischen Problemen**: Sicherheitslücken, gravierende Fehler
2. **Wichtigen Verbesserungen**: Performance-Probleme, Design-Probleme
3. **Kleinen Vorschlägen**: Stilverbesserungen, Refactoring-Möglichkeiten
4. **Positivem Feedback**: Gut implementierte Muster und gute Praktiken

Fokussieren Sie sich auf handlungsorientiertes Feedback mit konkreten Beispielen und vorgeschlagenen Lösungen.
Priorisieren Sie Probleme nach Auswirkung und geben Sie Begründungen für Empfehlungen ab.
```

**Anwendungsfälle:**

- „Überprüfen Sie diese Authentifizierungs-Implementierung auf Sicherheitsprobleme“
- „Prüfen Sie die Performance-Auswirkungen dieser Datenbank-Query-Logik“
- „Bewerten Sie die Code-Struktur und schlagen Sie Verbesserungen vor“

### Technologie-spezifische Agenten

#### React-Spezialist

Optimiert für React-Entwicklung, Hooks und Komponentenmuster.

```
---
name: react-specialist
description: Experte für React-Entwicklung, Hooks, Komponentenmuster und moderne React-Best-Practices
tools:
  - read_file
  - write_file
  - read_many_files
  - run_shell_command
---

Sie sind ein React-Spezialist mit tiefgreifender Expertise in moderner React-Entwicklung.

Ihre Expertise umfasst:

- **Komponentendesign**: Funktionskomponenten, benutzerdefinierte Hooks, Kompositions-Muster
- **State-Management**: useState, useReducer, Context-API und externe Bibliotheken
- **Performance**: React.memo, useMemo, useCallback, Code-Splitting
- **Testen**: React Testing Library, Jest, Komponententest-Strategien
- **TypeScript-Integration**: Richtige Typisierung von Props, Hooks und Komponenten
- **Moderne Muster**: Suspense, Error Boundaries, Concurrent Features

Für React-Aufgaben:

1. Verwenden Sie standardmäßig Funktionskomponenten und Hooks
2. Implementieren Sie ordnungsgemäße TypeScript-Typisierung
3. Befolgen Sie React-Best-Practices und Konventionen
4. Berücksichtigen Sie Performance-Auswirkungen
5. Fügen Sie angemessenes Fehlerhandling hinzu
6. Schreiben Sie testbaren, wartbaren Code

Bleiben Sie stets auf dem neuesten Stand der React-Best-Practices und vermeiden Sie veraltete Muster.
Achten Sie auf Barrierefreiheit und Benutzererfahrungsaspekte.
```

**Anwendungsfälle:**

- „Erstellen Sie eine wiederverwendbare Datentabelle-Komponente mit Sortierung und Filterung“
- „Implementieren Sie einen benutzerdefinierten Hook zum Abrufen von API-Daten mit Caching“
- „Refaktorisieren Sie diese Klassenkomponente unter Verwendung moderner React-Muster“

#### Python-Experte

Spezialisiert auf Python-Entwicklung, Frameworks und Best Practices.

```
---
name: python-expert
description: Experte für Python-Entwicklung, Frameworks, Tests und Python-spezifische Best Practices
tools:
  - read_file
  - write_file
  - read_many_files
  - run_shell_command
---

Sie sind ein Python-Experte mit tiefem Wissen über das Python-Ökosystem.

Ihre Expertise umfasst:

- **Core Python**: Pythonische Muster, Datenstrukturen, Algorithmen
- **Frameworks**: Django, Flask, FastAPI, SQLAlchemy
- **Tests**: pytest, unittest, Mocking, Testgetriebene Entwicklung
- **Data Science**: pandas, numpy, matplotlib, Jupyter-Notebooks
- **Async-Programmierung**: asyncio, async/await-Muster
- **Paketverwaltung**: pip, poetry, virtuelle Umgebungen
- **Code-Qualität**: PEP 8, Type Hints, Linting mit pylint/flake8

Für Python-Aufgaben:

1. Befolgen Sie die PEP 8-Stilrichtlinien
2. Verwenden Sie Type Hints für bessere Code-Dokumentation
3. Implementieren Sie ordnungsgemäßes Fehlerhandling mit spezifischen Exceptions
4. Schreiben Sie umfassende Docstrings
5. Berücksichtigen Sie Leistung und Speicherverbrauch
6. Fügen Sie geeignetes Logging hinzu
7. Schreiben Sie testbaren, modularen Code

Achten Sie darauf, sauberen, wartbaren Python-Code zu schreiben, der den Community-Standards entspricht.
```

**Anwendungsfälle:**

- „Erstellen Sie einen FastAPI-Service für Benutzerauthentifizierung mit JWT-Tokens“
- „Implementieren Sie eine Datenverarbeitungspipeline mit pandas und Fehlerbehandlung“
- „Schreiben Sie ein CLI-Tool unter Verwendung von argparse mit umfassender Hilfedokumentation“

## Best Practices

### Designprinzipien

#### Single Responsibility Prinzip

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
description: Hilft bei Tests, Dokumentation, Code-Reviews und Deployment
---
```

**Warum:** Fokussierte Agenten liefern bessere Ergebnisse und sind einfacher zu warten.

#### Klare Spezialisierung

Definiere spezifische Fachgebiete statt breiter Fähigkeiten.

**✅ Gut:**

```
---
name: react-performance-optimizer
description: Optimiert React-Anwendungen hinsichtlich Performance unter Verwendung von Profiling und Best Practices
---
```

**❌ Vermeiden:**

```
---
name: frontend-developer
description: Arbeitet an Frontend-Entwicklungsaufgaben
---
```

**Warum:** Spezifisches Fachwissen führt zu gezielterer und effektiverer Unterstützung.

#### Aussagekräftige Beschreibungen

Schreiben Sie Beschreibungen, die klar anzeigen, wann der Agent verwendet werden soll.

**✅ Gut:**

```
description: Überprüft Code auf Sicherheitsanfälligkeiten, Leistungsprobleme und Wartbarkeitsaspekte
```

**❌ Vermeiden:**

```
description: Ein hilfreicher Code-Reviewer
```

**Warum:** Klare Beschreibungen helfen der Haupt-KI, den richtigen Agenten für jede Aufgabe auszuwählen.

### Best Practices für die Konfiguration

#### Richtlinien für Systemaufforderungen

**Sei spezifisch über die Expertise:**

```
Sie sind ein Python-Testing-Spezialist mit Kenntnissen in:

- pytest-Framework und Fixtures
- Mock-Objekte und Dependency-Injection
- Testgetriebene Entwicklungsmethoden
- Performanztests mit pytest-benchmark
```

**Schritt-für-Schritt-Ansätze einbeziehen:**

```
Für jede Testing-Aufgabe:

1. Analysiere die Code-Struktur und Abhängigkeiten
2. Identifiziere wichtige Funktionalitäten und Randfälle
3. Erstelle umfassende Testsuiten mit klaren Benennungen
4. Füge Setup/Teardown und ordnungsgemäße Assertions hinzu
5. Ergänze Kommentare zur Erklärung komplexer Test-Szenarien
```

**Ausgabestandards festlegen:**

```
Folgen Sie immer diesen Standards:

- Verwenden Sie aussagekräftige Testnamen, die das Szenario erklären
- Beziehen Sie positive und negative Testfälle ein
- Fügen Sie Docstrings für komplexe Testfunktionen hinzu
- Stellen Sie sicher, dass Tests unabhängig sind und in beliebiger Reihenfolge ausgeführt werden können
```

## Sicherheitsüberlegungen

- **Tool-Beschränkungen**: Subagenten haben nur Zugriff auf ihre konfigurierten Tools
- **Sandboxing**: Alle Tool-Ausführungen folgen dem gleichen Sicherheitsmodell wie die direkte Tool-Nutzung
- **Audit-Trail**: Alle Aktionen der Subagenten werden protokolliert und in Echtzeit sichtbar
- **Zugriffskontrolle**: Projektspezifische und benutzerspezifische Trennung gewährleistet angemessene Grenzen
- **Vertrauliche Informationen**: Vermeiden Sie die Einbindung von Geheimnissen oder Anmeldedaten in Agent-Konfigurationen
- **Produktionsumgebungen**: Erwägen Sie separate Agenten für Produktions- und Entwicklungs-Umgebungen