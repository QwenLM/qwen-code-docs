# Agent-Tool (`agent`)

Dieses Dokument beschreibt das `agent`-Tool für Qwen Code.

## Beschreibung

Verwenden Sie `agent`, um einen spezialisierten Subagenten zu starten, der komplexe, mehrschrittige Aufgaben autonom erledigt. Das Agent-Tool delegiert Arbeiten an spezialisierte Agenten, die unabhängig arbeiten und Zugriff auf ihre eigenen Werkzeuge haben. Dadurch sind parallele Aufgabenausführung und spezialisiertes Fachwissen möglich.

### Argumente

`agent` akzeptiert die folgenden Argumente:

- `description` (Zeichenkette, erforderlich): Eine kurze (3–5 Wörter) Beschreibung der Aufgabe für Sichtbarkeit und Nachverfolgung durch den Benutzer.
- `prompt` (Zeichenkette, erforderlich): Die detaillierte Aufgabenanweisung für den Subagenten. Sollte umfassende Anweisungen für die autonome Ausführung enthalten.
- `subagent_type` (Zeichenkette, optional): Der Typ des zu verwendenden spezialisierten Agenten. Standardmäßig wird `general-purpose` verwendet, wenn nicht angegeben.
- `run_in_background` (boolesch, optional): Setzen Sie dies auf `true`, um den Agenten im Hintergrund auszuführen. Sie werden benachrichtigt, wenn er abgeschlossen ist.
- `isolation` (Zeichenkette, optional): Setzen Sie dies auf `"worktree"`, um den Agenten in einem isolierten Git-Worktree auszuführen.

## Verwendung von `agent` mit Qwen Code

Das Agent-Tool lädt dynamisch verfügbare Subagenten aus Ihrer Konfiguration und delegiert Aufgaben an sie. Jeder Subagent läuft unabhängig und kann seine eigenen Werkzeuge verwenden, was spezialisiertes Fachwissen und parallele Ausführung ermöglicht.

Wenn Sie das Agent-Tool verwenden, führt der Subagent folgende Schritte aus:

1. Erhält die Aufgabenanweisung mit vollständiger Autonomie
2. Führt die Aufgabe mit seinen verfügbaren Werkzeugen aus
3. Gibt eine abschließende Ergebnismeldung zurück
4. Beendet sich (Subagenten sind zustandslos und werden nur einmal verwendet)

Verwendung:

```
agent(description="Kurze Aufgabenbeschreibung", prompt="Detaillierte Aufgabenanweisungen für den Subagenten", subagent_type="agenten_name")
```

## Verfügbare Subagenten

Die verfügbaren Subagenten hängen von Ihrer Konfiguration ab. Häufige Subagententypen sind z. B.:

- **general-purpose**: Für komplexe mehrschrittige Aufgaben, die verschiedene Werkzeuge erfordern
- **code-reviewer**: Zum Überprüfen und Analysieren der Codequalität
- **test-runner**: Zum Ausführen von Tests und Analysieren der Ergebnisse
- **documentation-writer**: Zum Erstellen und Aktualisieren von Dokumentation

Sie können verfügbare Subagenten mit dem Befehl `/agents` in Qwen Code anzeigen.

## Agent-Tool-Funktionen

### Echtzeit-Fortschrittsaktualisierungen

Das Agent-Tool bietet Live-Updates mit:

- Status der Subagenten-Ausführung
- Einzelne Tool-Aufrufe des Subagenten
- Ergebnisse der Tool-Aufrufe und etwaige Fehler
- Gesamtfortschritt und Abschlussstatus der Aufgabe

### Parallele Ausführung

Sie können mehrere Subagenten gleichzeitig starten, indem Sie das Agent-Tool mehrmals in einer einzigen Nachricht aufrufen. Dadurch wird die parallele Aufgabenausführung und eine verbesserte Effizienz ermöglicht.

### Spezialisiertes Fachwissen

Jeder Subagent kann konfiguriert werden mit:

- Spezifischen Tool-Zugriffsberechtigungen
- Spezialisierten System-Prompts und Anweisungen
- Benutzerdefinierten Modellkonfigurationen
- Domänenspezifischem Wissen und Fähigkeiten

## `agent`-Beispiele

### Delegieren an einen Allzweck-Agenten

```
agent(
  description="Code-Refactoring",
  prompt="Bitte refaktorieren Sie das Authentifizierungsmodul in src/auth/ mit modernen async/await-Mustern anstelle von Callbacks. Stellen Sie sicher, dass alle Tests weiterhin bestehen, und aktualisieren Sie die zugehörige Dokumentation.",
  subagent_type="general-purpose"
)
```

### Parallele Aufgaben ausführen

```
# Code-Review und Testausführung parallel starten
agent(
  description="Code-Review",
  prompt="Überprüfen Sie die letzten Änderungen im Benutzerverwaltungsmodul auf Codequalität, Sicherheitsprobleme und Einhaltung von Best Practices.",
  subagent_type="general-purpose"
)

agent(
  description="Tests ausführen",
  prompt="Führen Sie die gesamte Testsuite aus und analysieren Sie alle Fehler. Geben Sie eine Zusammenfassung der Testabdeckung und Empfehlungen zur Verbesserung.",
  subagent_type="test-engineer"
)
```

### Dokumentation generieren

```
agent(
  description="Dokumentation aktualisieren",
  prompt="Erstellen Sie eine umfassende API-Dokumentation für die neu implementierten REST-Endpunkte im Modul orders. Fügen Sie Request-/Response-Beispiele und Fehlercodes hinzu.",
  subagent_type="general-purpose"
)
```

## Wann Sie das Agent-Tool verwenden sollten

Verwenden Sie das Agent-Tool, wenn:

1. **Komplexe mehrschrittige Aufgaben** – Aufgaben, die mehrere Operationen erfordern und autonom erledigt werden können
2. **Spezialisiertes Fachwissen** – Aufgaben, die von domänenspezifischem Wissen oder Werkzeugen profitieren
3. **Parallele Ausführung** – Wenn Sie mehrere unabhängige Aufgaben haben, die gleichzeitig ausgeführt werden können
4. **Delegationsbedarf** – Wenn Sie eine vollständige Aufgabe abgeben möchten, anstatt jeden Schritt zu kontrollieren
5. **Ressourcenintensive Operationen** – Aufgaben, die viel Zeit oder Rechenressourcen beanspruchen können

## Wann Sie das Agent-Tool NICHT verwenden sollten

Verwenden Sie das Agent-Tool nicht für:

- **Einfache, einteilige Operationen** – Verwenden Sie direkte Werkzeuge wie Read, Edit usw.
- **Interaktive Aufgaben** – Aufgaben, die eine wechselseitige Kommunikation erfordern
- **Bestimmte Dateilesevorgänge** – Verwenden Sie das Read-Tool direkt für eine bessere Leistung
- **Einfache Suchvorgänge** – Verwenden Sie die Werkzeuge Grep oder Glob direkt

## Wichtige Hinweise

- **Zustandslose Ausführung**: Jeder Subagentenaufruf ist unabhängig und hat keine Erinnerung an vorherige Ausführungen
- **Einmalige Kommunikation**: Subagenten liefern eine abschließende Ergebnismeldung – keine fortlaufende Kommunikation
- **Umfassende Prompts**: Ihr Prompt sollte alle notwendigen Kontext- und Ausführungsanweisungen für die autonome Bearbeitung enthalten
- **Werkzeugzugriff**: Subagenten haben nur Zugriff auf Werkzeuge, die in ihrer spezifischen Konfiguration festgelegt sind
- **Parallelfähigkeit**: Mehrere Subagenten können gleichzeitig ausgeführt werden, um die Effizienz zu steigern
- **Konfigurationsabhängig**: Verfügbare Subagententypen hängen von Ihrer Systemkonfiguration ab
## Konfiguration

Subagents werden über das Agentenkonfigurationssystem von Qwen Code konfiguriert. Verwenden Sie den Befehl `/agents`, um:

- Verfügbare Subagents anzeigen
- Neue Subagent-Konfigurationen erstellen
- Bestehende Subagent-Einstellungen ändern
- Tool-Berechtigungen und -Funktionen festlegen

Weitere Informationen zur Konfiguration von Subagents finden Sie in der Subagent-Dokumentation.
