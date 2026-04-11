# Task-Tool (`task`)

Dieses Dokument beschreibt das `task`-Tool für Qwen Code.

## Beschreibung

Verwende `task`, um einen spezialisierten Subagenten zu starten, der komplexe, mehrstufige Aufgaben autonom bearbeitet. Das Task-Tool delegiert Arbeit an spezialisierte Agenten, die unabhängig mit Zugriff auf ihren eigenen Satz an Tools arbeiten können. Dies ermöglicht die parallele Ausführung von Aufgaben und den Einsatz von spezialisiertem Fachwissen.

### Argumente

`task` akzeptiert die folgenden Argumente:

- `description` (string, erforderlich): Eine kurze (3–5 Wörter) Beschreibung der Aufgabe zur Sichtbarkeit und Nachverfolgung für den Benutzer.
- `prompt` (string, erforderlich): Der detaillierte Aufgaben-Prompt, den der Subagent ausführen soll. Sollte umfassende Anweisungen für die autonome Ausführung enthalten.
- `subagent_type` (string, erforderlich): Der Typ des spezialisierten Agenten, der für diese Aufgabe verwendet werden soll. Muss mit einem der verfügbaren, konfigurierten Subagenten übereinstimmen.

## So verwendest du `task` mit Qwen Code

Das Task-Tool lädt verfügbare Subagenten dynamisch aus deiner Konfiguration und delegiert Aufgaben an sie. Jeder Subagent läuft unabhängig und kann seinen eigenen Satz an Tools verwenden, was spezialisiertes Fachwissen und parallele Ausführung ermöglicht.

Wenn du das Task-Tool verwendest, führt der Subagent Folgendes aus:

1. Erhält den Aufgaben-Prompt mit voller Autonomie
2. Führt die Aufgabe mit seinen verfügbaren Tools aus
3. Gibt eine finale Ergebnisnachricht zurück
4. Beendet sich (Subagenten sind zustandslos und für die einmalige Verwendung konzipiert)

Verwendung:

```
task(description="Brief task description", prompt="Detailed task instructions for the subagent", subagent_type="agent_name")
```

## Verfügbare Subagenten

Die verfügbaren Subagenten hängen von deiner Konfiguration ab. Häufige Subagenten-Typen sind unter anderem:

- **general-purpose**: Für komplexe, mehrstufige Aufgaben, die verschiedene Tools erfordern
- **code-reviewer**: Zum Überprüfen und Analysieren der Codequalität
- **test-runner**: Zum Ausführen von Tests und Analysieren der Ergebnisse
- **documentation-writer**: Zum Erstellen und Aktualisieren von Dokumentation

Du kannst verfügbare Subagenten mit dem `/agents`-Befehl in Qwen Code anzeigen.

## Funktionen des Task-Tools

### Echtzeit-Fortschrittsupdates

Das Task-Tool bietet Live-Updates, die Folgendes anzeigen:

- Ausführungsstatus des Subagenten
- Einzelne Tool-Aufrufe, die vom Subagenten durchgeführt werden
- Ergebnisse der Tool-Aufrufe sowie eventuelle Fehler
- Gesamter Aufgabenfortschritt und Abschlussstatus

### Parallele Ausführung

Du kannst mehrere Subagenten gleichzeitig starten, indem du das Task-Tool mehrfach in einer einzigen Nachricht aufrufst. Dies ermöglicht die parallele Ausführung von Aufgaben und steigert die Effizienz.

### Spezialisiertes Fachwissen

Jeder Subagent kann mit Folgendem konfiguriert werden:

- Spezifischen Tool-Zugriffsberechtigungen
- Spezialisierten System-Prompts und Anweisungen
- Benutzerdefinierten Modellkonfigurationen
- Domänenspezifischem Wissen und Fähigkeiten

## `task`-Beispiele

### Delegieren an einen general-purpose-Agenten

```
task(
  description="Code refactoring",
  prompt="Please refactor the authentication module in src/auth/ to use modern async/await patterns instead of callbacks. Ensure all tests still pass and update any related documentation.",
  subagent_type="general-purpose"
)
```

### Ausführen paralleler Aufgaben

```
# Launch code review and test execution in parallel
task(
  description="Code review",
  prompt="Review the recent changes in the user management module for code quality, security issues, and best practices compliance.",
  subagent_type="code-reviewer"
)

task(
  description="Run tests",
  prompt="Execute the full test suite and analyze any failures. Provide a summary of test coverage and recommendations for improvement.",
  subagent_type="test-runner"
)
```

### Dokumentationsgenerierung

```
task(
  description="Update docs",
  prompt="Generate comprehensive API documentation for the newly implemented REST endpoints in the orders module. Include request/response examples and error codes.",
  subagent_type="documentation-writer"
)
```

## Wann du das Task-Tool verwenden solltest

Verwende das Task-Tool, wenn:

1. **Komplexe, mehrstufige Aufgaben** – Aufgaben, die mehrere Operationen erfordern, die autonom bearbeitet werden können
2. **Spezialisiertes Fachwissen** – Aufgaben, die von domänenspezifischem Wissen oder Tools profitieren
3. **Parallele Ausführung** – Wenn du mehrere unabhängige Aufgaben hast, die gleichzeitig laufen können
4. **Delegationsbedarf** – Wenn du eine vollständige Aufgabe abgeben möchtest, anstatt einzelne Schritte detailliert zu steuern
5. **Ressourcenintensive Operationen** – Aufgaben, die erhebliche Zeit oder Rechenressourcen beanspruchen könnten

## Wann du das Task-Tool NICHT verwenden solltest

Verwende das Task-Tool nicht für:

- **Einfache, einstufige Operationen** – Verwende direkte Tools wie Read, Edit usw.
- **Interaktive Aufgaben** – Aufgaben, die einen wechselseitigen Austausch erfordern
- **Das Lesen bestimmter Dateien** – Verwende das Read-Tool direkt für eine bessere Performance
- **Einfache Suchen** – Verwende die Grep- oder Glob-Tools direkt

## Wichtige Hinweise

- **Zustandslose Ausführung**: Jeder Subagenten-Aufruf ist unabhängig und verfügt über keinen Speicher vorheriger Ausführungen
- **Einmalige Kommunikation**: Subagenten liefern eine einzige finale Ergebnisnachricht – keine fortlaufende Kommunikation
- **Umfassende Prompts**: Dein Prompt sollte den gesamten notwendigen Kontext und alle Anweisungen für die autonome Ausführung enthalten
- **Tool-Zugriff**: Subagenten haben nur Zugriff auf Tools, die in ihrer spezifischen Konfiguration festgelegt sind
- **Parallele Fähigkeit**: Mehrere Subagenten können gleichzeitig laufen, um die Effizienz zu steigern
- **Konfigurationsabhängig**: Verfügbare Subagenten-Typen hängen von deiner Systemkonfiguration ab

## Konfiguration

Subagenten werden über das Agenten-Konfigurationssystem von Qwen Code konfiguriert. Verwende den `/agents`-Befehl, um:

- verfügbare Subagenten anzuzeigen
- neue Subagenten-Konfigurationen zu erstellen
- bestehende Subagenten-Einstellungen zu ändern
- Tool-Berechtigungen und -Fähigkeiten festzulegen

Weitere Informationen zur Konfiguration von Subagenten findest du in der Subagenten-Dokumentation.