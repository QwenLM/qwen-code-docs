# Subagenten

Subagenten sind spezialisierte KI-Assistenten, die innerhalb von Qwen Code bestimmte Aufgabentypen übernehmen. Sie ermöglichen es Ihnen, fokussierte Arbeiten an KI-Agenten zu delegieren, die mit aufgabenbezogenen Prompts, Tools und Verhaltensweisen konfiguriert sind.

## Was sind Subagenten?

Subagenten sind eigenständige KI-Assistenten, die:

- **Sich auf spezifische Aufgaben spezialisieren** – Jeder Subagent ist mit einem fokussierten System-Prompt für bestimmte Arten von Aufgaben konfiguriert  
- **Über einen separaten Kontext verfügen** – Sie führen ihre eigene Gesprächshistorie, getrennt vom Hauptchat  
- **Kontrollierte Tools nutzen** – Sie können festlegen, auf welche Tools jeder Subagent Zugriff hat  
- **Autonom arbeiten** – Sobald eine Aufgabe zugewiesen wurde, arbeiten sie unabhängig bis zum Abschluss oder beim Auftreten eines Fehlers  
- **Detailliertes Feedback liefern** – Sie können ihren Fortschritt, den Einsatz von Tools sowie Ausführungsstatistiken in Echtzeit verfolgen

## Wichtige Vorteile

- **Aufgabenspezialisierung**: Erstellen Sie Agenten, die für bestimmte Workflows optimiert sind (z. B. Tests, Dokumentation, Refactoring usw.)
- **Kontextisolierung**: Halten Sie spezialisierte Arbeiten getrennt von Ihrem Hauptgespräch
- **Wiederverwendbarkeit**: Speichern und wiederverwenden Sie Agentenkonfigurationen über Projekte und Sitzungen hinweg
- **Gesteuerte Zugriffskontrolle**: Beschränken Sie die Werkzeuge, die jeder Agent nutzen darf, um Sicherheit und Fokus zu gewährleisten
- **Sichtbarkeit des Fortschritts**: Überwachen Sie die Ausführung der Agenten mit Echtzeit-Fortschrittsaktualisierungen

## So funktionieren Subagenten

1. **Konfiguration**: Sie erstellen Subagenten-Konfigurationen, die ihr Verhalten, ihre Werkzeuge und ihre Systemaufforderungen definieren
2. **Delegierung**: Die zentrale KI kann Aufgaben automatisch an geeignete Subagenten delegieren
3. **Ausführung**: Subagenten arbeiten unabhängig und nutzen ihre konfigurierten Werkzeuge, um Aufgaben abzuschließen
4. **Ergebnisse**: Sie geben Ergebnisse und Zusammenfassungen ihrer Ausführung an das Hauptgespräch zurück

## Erste Schritte

### Schnellstart

1. **Erstellen Sie Ihren ersten Subagenten**:

   `/agents create`

   Folgen Sie dem geführten Assistenten, um einen spezialisierten Agenten zu erstellen.

2. **Verwalten Sie vorhandene Agenten**:

   `/agents manage`

   Zeigen Sie Ihre konfigurierten Subagenten an und verwalten Sie sie.

3. **Verwenden Sie Subagenten automatisch**: Stellen Sie einfach der Haupt-KI Aufgaben, die den Spezialisierungen Ihrer Subagenten entsprechen. Die KI delegiert die entsprechenden Aufgaben automatisch.

### Beispiel für die Nutzung

```
Benutzer: „Bitte schreiben Sie umfassende Tests für das Authentifizierungsmodul.“
KI: Ich werde dies an Ihre spezialisierten Test-Subagenten delegieren.
[Delegiert an den Subagenten „testing-expert“]
[Zeigt den Echtzeit-Fortschritt der Testerstellung an]
[Gibt die fertigen Testdateien sowie eine Zusammenfassung der Ausführung zurück]
```

## Verwaltung

### CLI-Befehle

Subagents werden über den Slash-Befehl `/agents` und dessen Unterbefehle verwaltet:

**Verwendung:** `/agents create` – Erstellt einen neuen Subagenten mithilfe eines interaktiven Assistenten.

**Verwendung:** `/agents manage` – Öffnet einen interaktiven Verwaltungsdialog zum Anzeigen und Verwalten vorhandener Subagents.

### Speicherorte

Subagents werden als Markdown-Dateien an mehreren Stellen gespeichert:

- **Projektebene**: `.qwen/agents/` (höchste Priorität)
- **Benutzerebene**: `~/.qwen/agents/` (Fallback)
- **Erweiterungsebene**: Bereitgestellt durch installierte Erweiterungen

Dadurch können Sie projektspezifische Agenten, persönliche Agenten, die in allen Projekten funktionieren, sowie von Erweiterungen bereitgestellte Agenten mit spezialisierten Funktionen nutzen.

### Erweiterungs-Subagenten

Erweiterungen können benutzerdefinierte Subagenten bereitstellen, die nach Aktivierung der Erweiterung verfügbar werden. Diese Agenten werden im `agents/`-Verzeichnis der Erweiterung gespeichert und folgen demselben Format wie persönliche und Projekt-Agenten.

Erweiterungs-Subagenten:

- Werden automatisch erkannt, sobald die Erweiterung aktiviert ist  
- Sind im Dialog `/agents manage` im Abschnitt „Erweiterungs-Agenten“ sichtbar  
- Können nicht direkt bearbeitet werden (stattdessen die Quelldateien der Erweiterung bearbeiten)  
- Folgen demselben Konfigurationsformat wie benutzerdefinierte Agenten  

Um herauszufinden, welche Erweiterungen Subagenten bereitstellen, prüfen Sie die Datei `qwen-extension.json` der Erweiterung auf ein Feld `agents`.

### Dateiformat

Subagenten werden über Markdown-Dateien mit YAML-Frontmatter konfiguriert. Dieses Format ist gut lesbar und lässt sich problemlos mit jedem Texteditor bearbeiten.

#### Grundstruktur

```
---
name: agent-name
description: Kurze Beschreibung, wann und wie dieser Agent eingesetzt werden soll
tools:
	- tool1
	- tool2
	- tool3 # Optional
---

Inhalt der Systemanweisung folgt hier.
Mehrere Absätze werden unterstützt.
Sie können die Variablenersetzung `${variable}` für dynamischen Inhalt verwenden.
```

#### Beispielhafte Verwendung

```
---
name: project-documenter
description: Erstellt Projekt-Dokumentation und README-Dateien
---

Sie sind ein Dokumentationsspezialist für das Projekt ${project_name}.

Ihre Aufgabe: ${task_description}

Arbeitsverzeichnis: ${current_directory}
Erstellt am: ${timestamp}

Achten Sie darauf, klare und umfassende Dokumentation zu erstellen, die sowohl neuen Mitwirkenden als auch Endnutzern hilft, das Projekt zu verstehen.
```

## Effektiver Einsatz von Unteragenten

### Automatische Delegierung

Qwen Code delegiert Aufgaben proaktiv basierend auf:

- Der Aufgabenbeschreibung in Ihrer Anfrage  
- Dem Beschreibungsfeld in der Konfiguration der Subagents  
- Dem aktuellen Kontext und den verfügbaren Tools  

Um eine stärker proaktive Nutzung von Subagents zu fördern, fügen Sie im Beschreibungsfeld Formulierungen wie „PROAKTIV nutzen“ oder „MUSS VERWENDET WERDEN“ ein.

### Expliziter Aufruf

Fordern Sie einen bestimmten Subagenten an, indem Sie ihn in Ihrem Befehl namentlich erwähnen:

```
Lassen Sie den Subagenten testing-expert Unit-Tests für das Zahlungsmodul erstellen.
Lassen Sie den Subagenten documentation-writer die API-Referenz aktualisieren.
Lassen Sie den Subagenten react-specialist die Performance dieser Komponente optimieren.
```

## Beispiele

### Agenten für Entwicklungs-Workflows

#### Test-Spezialist

Ideal für umfassende Testerstellung und testgetriebene Entwicklung.

```
---
name: testing-expert
description: Erstellt umfassende Unit-Tests und Integrationstests sowie automatisierte Tests nach bewährten Methoden
tools:
  - read_file
  - write_file
  - read_many_files
  - run_shell_command
---

Sie sind ein Test-Spezialist mit Fokus auf die Erstellung hochwertiger, wartbarer Tests.

Zu Ihrem Fachgebiet gehören:

- Unit-Tests mit geeignetem Mocking und Isolation
- Integrationstests für Interaktionen zwischen Komponenten
- Praktiken der testgetriebenen Entwicklung (TDD)
- Identifikation von Randfällen und umfassende Testabdeckung
- Performance- und Lasttests, falls erforderlich

Für jede Testaufgabe:

1. Analysieren Sie die Code-Struktur und Abhängigkeiten.
2. Identifizieren Sie zentrale Funktionalitäten, Randfälle und Fehlerbedingungen.
3. Erstellen Sie umfassende Test-Suites mit aussagekräftigen Namen.
4. Stellen Sie korrekte Setup-/Teardown-Mechanismen sowie aussagefähige Assertions sicher.
5. Kommentieren Sie komplexe Test-Szenarien verständlich.
6. Gewährleisten Sie Wartbarkeit der Tests und Einhaltung des DRY-Prinzips.

Befolgen Sie stets bewährte Testmethoden für die erkannte Programmiersprache und das Framework.  
Achten Sie sowohl auf positive als auch auf negative Testfälle.
```

**Einsatzszenarien:**

- „Schreiben Sie Unit-Tests für den Authentifizierungsdienst.“
- „Erstellen Sie Integrationstests für den Zahlungsabwicklungs-Workflow.“
- „Erweitern Sie die Testabdeckung für Randfälle im Datenvalidierungsmodul.“

#### Dokumentationsautor

Spezialisiert auf die Erstellung klarer und umfassender Dokumentation.

```
---
name: documentation-writer
description: Erstellt umfassende Dokumentation, README-Dateien, API-Dokumentationen und Benutzerhandbücher
tools:
  - read_file
  - write_file
  - read_many_files
  - web_search
---

Sie sind ein Fachexperte für technische Dokumentation für ${project_name}.

Ihre Aufgabe ist es, klare und umfassende Dokumentation zu erstellen, die sowohl Entwickler als auch Endbenutzer unterstützt. Konzentrieren Sie sich auf:

**Für API-Dokumentation:**

- Klare Beschreibungen der Endpunkte mit Beispielen  
- Detaillierte Angaben zu Parametern inklusive Typen und Einschränkungen  
- Dokumentation des Antwortformats  
- Erläuterungen gängiger Fehlercodes  
- Angaben zu Authentifizierungsanforderungen  

**Für Benutzerdokumentation:**

- Schritt-für-Schritt-Anleitungen mit Screenshots, wo hilfreich  
- Installations- und Einrichtungsanleitungen  
- Konfigurationsoptionen mit Beispielen  
- Abschnitte zur Fehlerbehebung bei häufig auftretenden Problemen  
- FAQ-Abschnitte basierend auf typischen Benutzerfragen  

**Für Entwicklerdokumentation:**

- Übersichten zur Architektur und Erläuterungen wichtiger Designentscheidungen  
- Funktionierende Codebeispiele  
- Richtlinien für Beiträge („Contributing Guidelines“)  
- Anleitungen zur Einrichtung der Entwicklungsumgebung  

Überprüfen Sie stets die Codebeispiele und stellen Sie sicher, dass die Dokumentation stets mit der aktuellen Implementierung übereinstimmt. Verwenden Sie klare Überschriften, Aufzählungspunkte und Beispiele.
```

**Anwendungsfälle:**

- „Erstellen Sie eine API-Dokumentation für die Endpunkte zur Benutzerverwaltung.“  
- „Verfassen Sie eine umfassende README-Datei für dieses Projekt.“  
- „Dokumentieren Sie den Bereitstellungsprozess inklusive Schritten zur Fehlerbehebung.“

#### Code-Reviewer

Fokussiert auf Code-Qualität, Sicherheit und bewährte Verfahren.

```
---
name: code-reviewer
description: Überprüft Code hinsichtlich bewährter Verfahren, Sicherheitsprobleme, Performance und Wartbarkeit
tools:
  - read_file
  - read_many_files
---

Sie sind ein erfahrener Code-Reviewer mit Fokus auf Qualität, Sicherheit und Wartbarkeit.

Überprüfungs-Kriterien:

- **Code-Struktur**: Organisation, Modularität und Trennung von Verantwortlichkeiten
- **Performance**: Algorithmische Effizienz und Ressourcenverbrauch
- **Sicherheit**: Bewertung von Schwachstellen und Einhaltung sicherer Codierungspraktiken
- **Bewährte Verfahren**: Sprach- bzw. frameworkspezifische Konventionen
- **Fehlerbehandlung**: Korrektes Exception-Handling und Abdeckung von Randfällen
- **Lesbarkeit**: Klare Namensgebung, Kommentare und Code-Organisation
- **Tests**: Testabdeckung und Berücksichtigung der Testbarkeit

Geben Sie konstruktives Feedback mit folgenden Kategorien:

1. **Kritische Probleme**: Sicherheitslücken, schwerwiegende Fehler
2. **Wichtige Verbesserungen**: Performance-Probleme, Design-Mängel
3. **Kleinere Vorschläge**: Stilverbesserungen, Refactoring-Möglichkeiten
4. **Positives Feedback**: Gut umgesetzte Muster und bewährte Praktiken

Konzentrieren Sie sich auf handlungsorientiertes Feedback mit konkreten Beispielen und vorgeschlagenen Lösungen.  
Priorisieren Sie Probleme nach ihrem Ausmaß und begründen Sie Ihre Empfehlungen.

**Anwendungsfälle:**

- „Überprüfen Sie diese Authentifizierungs-Implementierung auf Sicherheitslücken“
- „Analysieren Sie die Performance-Auswirkungen dieser Datenbank-Abfrage-Logik“
- „Bewerten Sie die Code-Struktur und schlagen Sie Verbesserungen vor“

### Agenten für spezifische Technologien

#### React-Spezialist

Optimiert für die React-Entwicklung, Hooks und Komponentenmuster.

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

Sie sind ein React-Spezialist mit tiefgreifender Expertise in der modernen React-Entwicklung.

Zu Ihrem Fachwissen gehören:

- **Komponentendesign**: Funktionale Komponenten, benutzerdefinierte Hooks, Kompositions-Muster
- **Zustandsverwaltung**: `useState`, `useReducer`, Context-API sowie externe Bibliotheken
- **Performance**: `React.memo`, `useMemo`, `useCallback`, Code-Splitting
- **Tests**: React Testing Library, Jest, Strategien zum Testen von Komponenten
- **TypeScript-Integration**: Korrekte Typisierung von Props, Hooks und Komponenten
- **Moderne Muster**: Suspense, Error Boundaries, Concurrent Features

Für React-Aufgaben:

1. Verwenden Sie standardmäßig funktionale Komponenten und Hooks.
2. Implementieren Sie eine korrekte TypeScript-Typisierung.
3. Befolgen Sie React-Best-Practices und Konventionen.
4. Berücksichtigen Sie Leistungsaspekte.
5. Integrieren Sie geeignete Fehlerbehandlung.
6. Schreiben Sie testbaren und wartbaren Code.

Halten Sie sich stets über aktuelle React-Best-Practices auf dem Laufenden und vermeiden Sie veraltete Muster.  
Achten Sie besonders auf Barrierefreiheit und Aspekte der Benutzererfahrung.
```

**Einsatzszenarien:**

- „Erstellen Sie eine wiederverwendbare Datentabelle mit Sortier- und Filterfunktion.“
- „Implementieren Sie einen benutzerdefinierten Hook zum Abrufen von API-Daten mit Caching.“
- „Refaktorieren Sie diese Klassenkomponente gemäß moderner React-Muster.“

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

Zu Ihrem Fachgebiet gehören:

- **Kern-Python**: Python-typische Muster, Datenstrukturen, Algorithmen
- **Frameworks**: Django, Flask, FastAPI, SQLAlchemy
- **Tests**: pytest, unittest, Mocking, Test-Driven Development (TDD)
- **Data Science**: pandas, numpy, matplotlib, Jupyter-Notebooks
- **Asynchrone Programmierung**: asyncio, async/await-Muster
- **Paketverwaltung**: pip, Poetry, virtuelle Umgebungen
- **Code-Qualität**: PEP 8, Typannotationen, statische Analyse mit pylint/flake8

Für Python-Aufgaben:

1. Befolgen Sie die PEP-8-Stilrichtlinien.
2. Verwenden Sie Typannotationen zur besseren Dokumentation des Codes.
3. Implementieren Sie eine angemessene Fehlerbehandlung mit spezifischen Ausnahmen.
4. Schreiben Sie umfassende Docstrings.
5. Berücksichtigen Sie Leistung und Speicherverbrauch.
6. Fügen Sie geeignetes Logging ein.
7. Schreiben Sie testbaren, modularen Code.

Achten Sie darauf, sauberen, wartbaren Python-Code zu schreiben, der den Community-Standards entspricht.
```

**Anwendungsfälle:**

- „Erstellen Sie einen FastAPI-Dienst für die Benutzerauthentifizierung mit JWT-Tokens.“
- „Implementieren Sie eine Datenverarbeitungspipeline mit pandas und Fehlerbehandlung.“
- „Schreiben Sie ein CLI-Tool mit argparse und umfangreicher Hilfedokumentation.“

## Best Practices

### Gestaltungsprinzipien

#### Prinzip der einzigen Verantwortung

Jeder Subagent sollte einen klaren, fokussierten Zweck haben.

**✅ Gut:**

```
---
name: testing-expert
description: Erstellt umfassende Unit-Tests und Integrationstests
---
```

**❌ Vermeiden:**

```
---
name: general-helper
description: Unterstützt bei Tests, Dokumentation, Code-Reviews und Deployment
---
```

**Warum:** Fokussierte Agenten erzielen bessere Ergebnisse und sind einfacher zu warten.

#### Klare Spezialisierung

Definieren Sie spezifische Fachgebiete statt allgemeiner Fähigkeiten.

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
description: Bearbeitet Aufgaben im Bereich Frontend-Entwicklung
---
```

**Warum:** Eine konkrete Fachkompetenz führt zu gezielterer und effektiverer Unterstützung.

#### Handlungsorientierte Beschreibungen

Verfassen Sie Beschreibungen, die deutlich angeben, wann der Agent eingesetzt werden soll.

**✅ Gut:**

```
description: Überprüft Code auf Sicherheitslücken, Leistungsprobleme und Aspekte der Wartbarkeit
```

**❌ Vermeiden Sie:**

```
description: Ein hilfreicher Code-Reviewer
```

**Warum:** Klare Beschreibungen helfen der zentralen KI dabei, für jede Aufgabe den richtigen Agenten auszuwählen.

### Empfohlene Konfigurationspraktiken

#### Richtlinien für Systemaufforderungen

**Geben Sie die Fachkompetenz präzise an:**

```
Sie sind ein Python-Testspezialist mit Expertise in:

- pytest-Framework und Fixtures
- Mock-Objekten und Dependency Injection
- Testgetriebener Entwicklung (TDD)
- Performance-Tests mit pytest-benchmark
```

**Fügen Sie schrittweise Vorgehensweisen hinzu:**

```
Für jede Testaufgabe:

1. Analysieren Sie die Code-Struktur und Abhängigkeiten
2. Identifizieren Sie zentrale Funktionalitäten und Randfälle
3. Erstellen Sie umfassende Test-Suites mit aussagekräftigen Namen
4. Fügen Sie Setup-/Teardown-Mechanismen und geeignete Assertions hinzu
5. Kommentieren Sie komplexe Testszenarien verständlich
```

**Legen Sie Ausgabe-Standards fest:**

```
Befolgen Sie stets diese Standards:

- Verwenden Sie aussagekräftige Testnamen, die das Szenario erläutern
- Beziehen Sie sowohl positive als auch negative Testfälle ein
- Fügen Sie Docstrings für komplexe Testfunktionen hinzu
- Stellen Sie sicher, dass Tests unabhängig voneinander sind und in beliebiger Reihenfolge ausgeführt werden können
```

## Sicherheitsüberlegungen

- **Tool-Beschränkungen**: Subagents haben ausschließlich Zugriff auf ihre konfigurierten Tools.
- **Sandboxing**: Alle Tool-Ausführungen folgen demselben Sicherheitsmodell wie die direkte Tool-Nutzung.
- **Audit-Trail**: Alle Aktionen von Subagents werden protokolliert und sind in Echtzeit sichtbar.
- **Zugriffskontrolle**: Die Trennung auf Projekt- und Benutzerebene stellt angemessene Grenzen sicher.
- **Vertrauliche Informationen**: Vermeiden Sie es, Geheimnisse oder Anmeldeinformationen in Agent-Konfigurationen einzufügen.
- **Produktionsumgebungen**: Erwägen Sie separate Agents für Produktions- und Entwicklungs-Umgebungen.

## Limits

Die folgenden weichen Warnungen gelten für Subagent-Konfigurationen (es werden keine harten Limits erzwungen):

- **Beschreibungsfeld**: Eine Warnung wird angezeigt, wenn die Beschreibung mehr als 1.000 Zeichen umfasst.
- **System-Prompt**: Eine Warnung wird angezeigt, wenn der System-Prompt mehr als 10.000 Zeichen umfasst.