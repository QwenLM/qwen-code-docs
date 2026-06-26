# Agent-Tool (`agent`)

In diesem Dokument wird das `agent`-Tool für Qwen Code beschrieben.

## Beschreibung

Verwenden Sie `agent`, um einen spezialisierten Subagenten zu starten, der komplexe, mehrstufige Aufgaben autonom erledigt. Das Agent-Tool delegiert Arbeiten an spezialisierte Agenten, die unabhängig arbeiten können und Zugriff auf ihre eigenen Tools haben. Dies ermöglicht parallele Aufgabenausführung und spezialisierte Expertise.

### Argumente

`agent` akzeptiert die folgenden Argumente:

- `description` (string, erforderlich): Eine kurze (3–5 Wörter) Beschreibung der Aufgabe für die Sichtbarkeit und Nachverfolgung durch den Benutzer.
- `prompt` (string, erforderlich): Der detaillierte Aufgaben-Prompt für den auszuführenden Subagenten. Soll umfassende Anweisungen für die autonome Ausführung enthalten.
- `subagent_type` (string, optional): Der Typ des zu verwendenden spezialisierten Agenten. Standardmäßig `general-purpose`, falls nicht angegeben.
- `run_in_background` (boolean, optional): Setzen Sie auf `true`, um den Agenten im Hintergrund auszuführen. Sie werden benachrichtigt, wenn er fertig ist.
- `isolation` (string, optional): Setzen Sie auf `"worktree"`, um den Agenten in einem isolierten Git-Worktree auszuführen.

## Verwendung von `agent` mit Qwen Code

Das Agent-Tool lädt dynamisch verfügbare Subagenten aus Ihrer Konfiguration und delegiert Aufgaben an sie. Jeder Subagent läuft unabhängig und kann seine eigenen Tools verwenden, was spezialisierte Expertise und parallele Ausführung ermöglicht.

Wenn Sie das Agent-Tool verwenden, führt der Subagent folgende Schritte aus:

1. Er erhält den Aufgaben-Prompt mit voller Autonomie.
2. Er führt die Aufgabe mit seinen verfügbaren Tools aus.
3. Er gibt eine abschließende Ergebnismeldung zurück.
4. Er wird beendet (Subagenten sind zustandslos und nur einmalig verwendbar).

Verwendung:

```
agent(description="Kurze Aufgabenbeschreibung", prompt="Detaillierte Aufgabenanweisungen für den Subagenten", subagent_type="agenten_name")
```

## Verfügbare Subagenten

Die verfügbaren Subagenten hängen von Ihrer Konfiguration ab. Häufige Subagententypen sind:

- **general-purpose**: Für komplexe mehrstufige Aufgaben, die verschiedene Tools erfordern.
- **code-reviewer**: Zum Überprüfen und Analysieren der Codequalität.
- **test-runner**: Zum Ausführen von Tests und Analysieren der Ergebnisse.
- **documentation-writer**: Zum Erstellen und Aktualisieren der Dokumentation.

Sie können verfügbare Subagenten mit dem Befehl `/agents` in Qwen Code anzeigen lassen.

## Features des Agent-Tools

### Echtzeit-Fortschrittsaktualisierungen

Das Agent-Tool liefert Live-Updates zu folgenden Punkten:

- Ausführungsstatus des Subagenten
- Einzelne Tool-Aufrufe des Subagenten
- Ergebnisse und eventuelle Fehler bei Tool-Aufrufen
- Gesamtfortschritt und Abschlussstatus der Aufgabe

### Parallele Ausführung

Sie können mehrere Subagenten gleichzeitig starten, indem Sie das Agent-Tool mehrfach in einer einzigen Nachricht aufrufen. So erreichen Sie eine parallele Aufgabenausführung und eine höhere Effizienz.

### Spezialisierte Expertise

Jeder Subagent kann konfiguriert werden mit:

- Spezifischen Tool-Zugriffsberechtigungen
- Spezialisierten System-Prompts und Anweisungen
- Benutzerdefinierten Modellkonfigurationen
- Domänenspezifischem Wissen und Fähigkeiten

## `agent`-Beispiele

### Delegieren an einen Allzweckagenten

```
agent(
  description="Code-Refactoring",
  prompt="Bitte refaktorieren Sie das Authentifizierungsmodul in src/auth/ so, dass moderne async/await-Muster anstelle von Callbacks verwendet werden. Stellen Sie sicher, dass alle Tests weiterhin bestanden werden, und aktualisieren Sie die zugehörige Dokumentation.",
  subagent_type="general-purpose"
)
```

### Parallele Aufgaben ausführen

```
# Code-Review und Testausführung parallel starten
agent(
  description="Code-Review",
  prompt="Überprüfen Sie die letzten Änderungen im Benutzerverwaltungsmodul auf Codequalität, Sicherheitsprobleme und Einhaltung der Best Practices.",
  subagent_type="general-purpose"
)

agent(
  description="Tests ausführen",
  prompt="Führen Sie die vollständige Testsuite aus und analysieren Sie etwaige Fehler. Geben Sie eine Zusammenfassung der Testabdeckung und Empfehlungen zur Verbesserung.",
  subagent_type="test-engineer"
)
```

### Dokumentation erstellen

```
agent(
  description="Dokumentation aktualisieren",
  prompt="Erstellen Sie eine umfassende API-Dokumentation für die neu implementierten REST-Endpunkte im Bestellmodul. Fügen Sie Request-/Response-Beispiele und Fehlercodes hinzu.",
  subagent_type="general-purpose"
)
```

## Wann das Agent-Tool verwendet werden sollte

Verwenden Sie das Agent-Tool, wenn:

1. **Komplexe mehrstufige Aufgaben** – Aufgaben, die mehrere Operationen erfordern und autonom erledigt werden können.
2. **Spezialisierte Expertise** – Aufgaben, die von domänenspezifischem Wissen oder Tools profitieren.
3. **Parallele Ausführung** – Wenn Sie mehrere unabhängige Aufgaben haben, die gleichzeitig ausgeführt werden können.
4. **Delegationsbedarf** – Wenn Sie eine vollständige Aufgabe abgeben möchten, anstatt jeden Schritt im Detail zu steuern.
5. **Ressourcenintensive Operationen** – Aufgaben, die viel Zeit oder Rechenressourcen beanspruchen können.

## Wann das Agent-Tool NICHT verwendet werden sollte

Verwenden Sie das Agent-Tool nicht für:

- **Einfache, einstufige Operationen** – Verwenden Sie direkte Tools wie Read, Edit usw.
- **Interaktive Aufgaben** – Aufgaben, die einen Hin-und-Her-Austausch erfordern.
- **Bestimmte Dateilesevorgänge** – Verwenden Sie das Read-Tool direkt für eine bessere Leistung.
- **Einfache Suchvorgänge** – Verwenden Sie Grep- oder Glob-Tools direkt.

## Wichtige Hinweise

- **Zustandslose Ausführung**: Jeder Subagentenaufruf ist unabhängig und hat kein Gedächtnis an vorherige Ausführungen.
- **Einmalige Kommunikation**: Subagenten liefern eine abschließende Ergebnismeldung – es findet keine fortlaufende Kommunikation statt.
- **Umfassende Prompts**: Ihr Prompt sollte alle notwendigen Kontext- und Anweisungen für die autonome Ausführung enthalten.
- **Tool-Zugriff**: Subagenten haben nur Zugriff auf die Tools, die in ihrer spezifischen Konfiguration festgelegt sind.
- **Parallele Fähigkeit**: Mehrere Subagenten können gleichzeitig ausgeführt werden, um die Effizienz zu steigern.
- **Konfigurationsabhängig**: Die verfügbaren Subagententypen hängen von Ihrer Systemkonfiguration ab.

## Konfiguration

Subagenten werden über das Agentenkonfigurationssystem von Qwen Code konfiguriert. Verwenden Sie den Befehl `/agents`, um:

- Verfügbare Subagenten anzuzeigen
- Neue Subagentenkonfigurationen zu erstellen
- Vorhandene Subagenteneinstellungen zu ändern
- Tool-Berechtigungen und -Fähigkeiten festzulegen

Weitere Informationen zur Konfiguration von Subagenten finden Sie in der Subagenten-Dokumentation.