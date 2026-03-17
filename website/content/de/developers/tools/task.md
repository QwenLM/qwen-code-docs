# Aufgaben-Tool (`task`)

Dieses Dokument beschreibt das `task`-Tool für Qwen Code.

## Beschreibung

Verwenden Sie `task`, um einen spezialisierten Subagenten zu starten, der komplexe, mehrstufige Aufgaben autonom bearbeitet. Das Aufgaben-Tool delegiert die Arbeit an spezialisierte Agenten, die unabhängig voneinander arbeiten können und Zugriff auf ihre eigenen Tools haben. Dadurch wird eine parallele Ausführung von Aufgaben sowie fachspezifische Expertise ermöglicht.

### Argumente

`task` akzeptiert die folgenden Argumente:

- `description` (Zeichenkette, erforderlich): Eine kurze Beschreibung der Aufgabe (3–5 Wörter) zur besseren Sichtbarkeit und Nachverfolgung durch den Benutzer.
- `prompt` (Zeichenkette, erforderlich): Die detaillierte Aufgabenbeschreibung, die der Subagent ausführen soll. Sie muss umfassende Anweisungen für eine autonome Ausführung enthalten.
- `subagent_type` (Zeichenkette, erforderlich): Der Typ des spezialisierten Agents, der für diese Aufgabe verwendet werden soll. Dieser Wert muss mit einem der verfügbaren konfigurierten Subagenten übereinstimmen.

## So verwenden Sie `task` mit Qwen Code

Das Task-Tool lädt dynamisch verfügbare Unterautonome aus Ihrer Konfiguration und delegiert Aufgaben an sie. Jeder Unterautonom wird unabhängig ausgeführt und kann seine eigenen Tools nutzen, was eine fachspezifische Expertise und parallele Ausführung ermöglicht.

Wenn Sie das Task-Tool verwenden, führt der Unterautonom folgende Schritte aus:

1. Er erhält die Aufgabenanweisung mit vollständiger Autonomie.
2. Er führt die Aufgabe mithilfe seiner verfügbaren Tools aus.
3. Er gibt eine abschließende Ergebnisnachricht zurück.
4. Er wird beendet (Unterautonome sind zustandslos und werden nur einmal verwendet).

Verwendung:

```
task(description="Kurze Aufgabenbeschreibung", prompt="Detaillierte Aufgabenanweisungen für den Unterautonomen", subagent_type="agent_name")
```

## Verfügbare Unterautonome

Die verfügbaren Unterautonomen hängen von Ihrer Konfiguration ab. Häufige Typen von Unterautonomen sind beispielsweise:

- **allgemein**: Für komplexe, mehrstufige Aufgaben, die verschiedene Tools erfordern  
- **code-reviewer**: Zur Überprüfung und Analyse der Codequalität  
- **test-runner**: Zum Ausführen von Tests und zur Analyse der Ergebnisse  
- **documentation-writer**: Zum Erstellen und Aktualisieren von Dokumentation  

Sie können die verfügbaren Unterautonomen mit dem Befehl `/agents` in Qwen Code anzeigen.

## Funktionen des Task-Tools

### Echtzeit-Fortschrittsaktualisierungen

Das Task-Tool liefert Live-Aktualisierungen mit folgenden Informationen:

- Ausführungsstatus der Unterautonomen  
- Einzelne Tool-Aufrufe, die von den Unterautonomen ausgeführt werden  
- Ergebnisse der Tool-Aufrufe sowie etwaige Fehler  
- Gesamter Fortschritt der Aufgabe und deren Abschlussstatus  

### Parallelausführung

Sie können mehrere Unterautonome gleichzeitig starten, indem Sie das Task-Tool mehrfach innerhalb einer einzigen Nachricht aufrufen. Dadurch wird eine parallele Aufgabenausführung ermöglicht und die Effizienz gesteigert.

### Spezialisiertes Fachwissen

Jeder Subagent kann wie folgt konfiguriert werden:

- Spezifische Berechtigungen zum Zugriff auf Tools
- Spezialisierte Systemanweisungen und -hinweise
- Benutzerdefinierte Modellkonfigurationen
- Domänenspezifisches Wissen und Fähigkeiten

## `task`-Beispiele

### Delegieren an einen Allzweck-Agenten

```
task(
  description="Code-Refactoring",
  prompt="Bitte refaktoriere das Authentifizierungsmodul in src/auth/ so, dass moderne async/await-Muster statt Callbacks verwendet werden. Stelle sicher, dass alle Tests weiterhin erfolgreich ausgeführt werden, und aktualisiere ggf. die zugehörige Dokumentation.",
  subagent_type="allzweck"
)
```

### Parallel ablaufende Aufgaben ausführen

```

# Code-Review und Testausführung parallel starten
task(
  description="Code-Review",
  prompt="Überprüfen Sie die jüngsten Änderungen im Benutzerverwaltungsmodul hinsichtlich Code-Qualität, Sicherheitsproblemen und Einhaltung bewährter Praktiken.",
  subagent_type="code-reviewer"
)

task(
  description="Tests ausführen",
  prompt="Führen Sie die gesamte Test-Suite aus und analysieren Sie eventuelle Fehler. Geben Sie eine Zusammenfassung der Testabdeckung sowie Empfehlungen zur Verbesserung an.",
  subagent_type="test-runner"
)
```

### Dokumentationserstellung

```
task(
  description="Dokumentation aktualisieren",
  prompt="Erstellen Sie umfassende API-Dokumentation für die neu implementierten REST-Endpunkte im Bestellmodul. Fügen Sie Beispiele für Anfragen und Antworten sowie Fehlercodes hinzu.",
  subagent_type="documentation-writer"
)
```

## Wann das Task-Tool verwenden

Verwenden Sie das Task-Tool, wenn:

1. **Komplexe Mehrschritt-Aufgaben** – Aufgaben, die mehrere Operationen erfordern, die autonom ausgeführt werden können  
2. **Spezialisiertes Fachwissen** – Aufgaben, die von domänenspezifischem Wissen oder speziellen Tools profitieren  
3. **Parallelausführung** – Wenn Sie mehrere unabhängige Aufgaben haben, die gleichzeitig ausgeführt werden können  
4. **Delegationsbedarf** – Wenn Sie eine komplette Aufgabe übergeben möchten, anstatt einzelne Schritte detailliert zu steuern  
5. **Ressourcenintensive Operationen** – Aufgaben, die erhebliche Zeit oder Rechenressourcen in Anspruch nehmen könnten  

## Wann das Task-Tool NICHT verwenden

Verwenden Sie das Task-Tool nicht für:

- **Einfache Einzelschritt-Operationen** – Verwenden Sie stattdessen direkte Tools wie „Read“, „Edit“ usw.  
- **Interaktive Aufgaben** – Aufgaben, die einen Dialog mit Rückfragen und Antworten erfordern  
- **Gezielte Dateilesevorgänge** – Verwenden Sie hierzu direkt das „Read“-Tool für bessere Performance  
- **Einfache Suchvorgänge** – Verwenden Sie stattdessen direkt die Tools „Grep“ oder „Glob“

## Wichtige Hinweise

- **Zustandslose Ausführung**: Jeder Aufruf eines Subagents erfolgt unabhängig – es besteht keine Erinnerung an vorherige Ausführungen.
- **Einzelne Kommunikation**: Subagents liefern genau eine abschließende Ergebnisnachricht – es findet keine fortlaufende Kommunikation statt.
- **Umfassende Prompts**: Ihr Prompt muss sämtlichen erforderlichen Kontext und alle Anweisungen für eine autonome Ausführung enthalten.
- **Zugriff auf Tools**: Subagents haben ausschließlich Zugriff auf die Tools, die in ihrer jeweiligen Konfiguration aktiviert sind.
- **Parallelisierungsfähigkeit**: Mehrere Subagents können gleichzeitig ausgeführt werden, um die Effizienz zu steigern.
- **Konfigurationsabhängig**: Die verfügbaren Subagent-Typen hängen von Ihrer Systemkonfiguration ab.

## Konfiguration

Subagents werden über das Agent-Konfigurationssystem von Qwen Code konfiguriert. Verwenden Sie den Befehl `/agents`, um:

- Verfügbare Subagents anzuzeigen,
- Neue Subagent-Konfigurationen zu erstellen,
- Bestehende Subagent-Einstellungen zu ändern,
- Tool-Berechtigungen und -Funktionen festzulegen.

Weitere Informationen zur Konfiguration von Subagents finden Sie in der Dokumentation zu Subagents.