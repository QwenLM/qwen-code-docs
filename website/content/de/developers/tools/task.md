# Task-Tool (`task`)

Dieses Dokument beschreibt das `task`-Tool für Qwen Code.

## Beschreibung

Verwenden Sie `task`, um einen spezialisierten Subagenten zu starten, der komplexe, mehrstufige Aufgaben eigenständig bearbeitet. Das Task-Tool delegiert die Arbeit an spezialisierte Agenten, die unabhängig mit ihrem eigenen Satz an Tools arbeiten können, was eine parallele Aufgabenausführung und spezialisiertes Fachwissen ermöglicht.

### Argumente

`task` akzeptiert die folgenden Argumente:

- `description` (String, erforderlich): Eine kurze (3-5 Wörter) Beschreibung der Aufgabe zu Anzeige- und Tracking-Zwecken.
- `prompt` (String, erforderlich): Der detaillierte Aufgaben-Prompt für den auszuführenden Subagenten. Sollte vollständige Anweisungen zur eigenständigen Ausführung enthalten.
- `subagent_type` (String, erforderlich): Der Typ des spezialisierten Agenten, der für diese Aufgabe verwendet werden soll. Muss einem der verfügbaren konfigurierten Subagenten entsprechen.

## Verwendung von `task` mit Qwen Code

Das Task-Tool lädt dynamisch verfügbare Subagenten aus Ihrer Konfiguration und delegiert Aufgaben an diese. Jeder Subagent wird unabhängig ausgeführt und kann seine eigenen Werkzeuge verwenden, was spezialisiertes Fachwissen und parallele Ausführung ermöglicht.

Wenn Sie das Task-Tool verwenden, führt der Subagent folgende Schritte durch:

1. Empfängt die Aufgabenbeschreibung mit vollständiger Autonomie
2. Führt die Aufgabe mithilfe seiner verfügbaren Werkzeuge aus
3. Gibt eine finale Ergebnisnachricht zurück
4. Beendet sich (Subagenten sind zustandslos und einmalig verwendbar)

Verwendung:

```
task(description="Kurze Aufgabenbeschreibung", prompt="Detaillierte Anweisungen für den Subagenten", subagent_type="agent_name")
```

## Verfügbare Subagenten

Die verfügbaren Subagenten hängen von Ihrer Konfiguration ab. Häufige Subagententypen können Folgende sein:

- **general-purpose**: Für komplexe mehrstufige Aufgaben, die verschiedene Tools erfordern
- **code-reviewer**: Zum Überprüfen und Analysieren der Codequalität
- **test-runner**: Zum Ausführen von Tests und Analysieren der Ergebnisse
- **documentation-writer**: Zum Erstellen und Aktualisieren von Dokumentation

Sie können sich die verfügbaren Subagenten anzeigen lassen, indem Sie den Befehl `/agents` in Qwen Code verwenden.

## Funktionen des Task-Tools

### Echtzeit-Fortschrittsaktualisierungen

Das Task-Tool bietet Live-Aktualisierungen, die Folgendes anzeigen:

- Ausführungsstatus des Subagenten
- Einzelne Tool-Aufrufe, die vom Subagenten durchgeführt werden
- Ergebnisse der Tool-Aufrufe und eventuelle Fehler
- Gesamtfortschritt und Abschlussstatus der Aufgabe

### Parallele Ausführung

Sie können mehrere Subagenten gleichzeitig starten, indem Sie das Task-Tool mehrfach innerhalb einer einzigen Nachricht aufrufen. Dies ermöglicht eine parallele Aufgabenausführung und verbesserte Effizienz.

### Spezialisierte Expertise

Jeder Subagent kann konfiguriert werden mit:

- Spezifischen Zugriffsberechtigungen für Tools
- Spezialisierten Systemprompts und Anweisungen
- Benutzerdefinierten Modellkonfigurationen
- Domänenspezifischem Wissen und Fähigkeiten

## `task` Beispiele

### Delegieren an einen Allzweck-Agenten

```
task(
  description="Code Refactoring",
  prompt="Bitte refactore das Authentifizierungsmodul in src/auth/, um moderne async/await-Muster anstelle von Callbacks zu verwenden. Stelle sicher, dass alle Tests weiterhin erfolgreich sind und aktualisiere ggf. zugehörige Dokumentationen.",
  subagent_type="general-purpose"
)
```

### Parallele Aufgaben ausführen

```

# Code-Review und Testausführung parallel starten
task(
  description="Code-Review",
  prompt="Überprüfe die letzten Änderungen im Benutzerverwaltungsmodul auf Codequalität, Sicherheitsprobleme und Einhaltung bewährter Verfahren.",
  subagent_type="code-reviewer"
)

task(
  description="Tests ausführen",
  prompt="Führe die vollständige Testsuite aus und analysiere alle Fehler. Gib eine Zusammenfassung der Testabdeckung und Empfehlungen zur Verbesserung ab.",
  subagent_type="test-runner"
)
```

### Dokumentationserstellung

```
task(
  description="Dokumentation aktualisieren",
  prompt="Erstelle umfassende API-Dokumentation für die neu implementierten REST-Endpunkte im Bestellmodul. Füge Beispiele für Anfragen/Antworten und Fehlercodes hinzu.",
  subagent_type="documentation-writer"
)
```

## Wann das Task-Tool verwendet werden sollte

Verwenden Sie das Task-Tool, wenn:

1. **Komplexe mehrstufige Aufgaben** - Aufgaben, die mehrere Operationen erfordern, die eigenständig durchgeführt werden können
2. **Spezialisiertes Fachwissen** - Aufgaben, die von domänenspezifischem Wissen oder speziellen Tools profitieren
3. **Parallele Ausführung** - Wenn Sie mehrere unabhängige Aufgaben haben, die gleichzeitig ausgeführt werden können
4. **Delegationsbedarf** - Wenn Sie eine vollständige Aufgabe übergeben möchten, anstatt jeden Schritt einzeln zu steuern
5. **Ressourcenintensive Vorgänge** - Aufgaben, die erhebliche Zeit oder Rechenressourcen benötigen

## Wann das Task-Tool NICHT verwendet werden sollte

Verwenden Sie das Task-Tool nicht für:

- **Einfache, einstufige Operationen** - Verwenden Sie direkte Tools wie Read, Edit usw.
- **Interaktive Aufgaben** - Aufgaben, die eine Hin- und Her-Kommunikation erfordern
- **Spezifische Datei-Lesevorgänge** - Verwenden Sie das Read-Tool direkt für bessere Leistung
- **Einfache Suchvorgänge** - Verwenden Sie die Grep- oder Glob-Tools direkt

## Wichtige Hinweise

- **Zustandslose Ausführung**: Jeder Subagent-Aufruf ist unabhängig und hat keinen Speicher für vorherige Ausführungen
- **Einzelne Kommunikation**: Subagents liefern eine einzige finale Ergebnisnachricht – keine fortlaufende Kommunikation
- **Umfassende Prompts**: Dein Prompt sollte den gesamten notwendigen Kontext und alle Anweisungen für die autonome Ausführung enthalten
- **Tool-Zugriff**: Subagents haben nur Zugriff auf Tools, die in ihrer spezifischen Konfiguration festgelegt sind
- **Parallele Fähigkeit**: Mehrere Subagents können gleichzeitig laufen, um die Effizienz zu steigern
- **Konfigurationsabhängig**: Verfügbare Subagent-Typen hängen von deiner Systemkonfiguration ab

## Konfiguration

Subagents werden über das Agent-Konfigurationssystem von Qwen Code konfiguriert. Verwende den Befehl `/agents`, um:

- Verfügbare Subagents anzuzeigen
- Neue Subagent-Konfigurationen zu erstellen
- Vorhandene Subagent-Einstellungen zu ändern
- Tool-Berechtigungen und Fähigkeiten festzulegen

Weitere Informationen zur Konfiguration von Subagents findest du in der Subagents-Dokumentation.