# Agent-Tool (`agent`)

In diesem Dokument wird das `agent`-Tool für Qwen Code beschrieben.

## Beschreibung

Verwenden Sie `agent`, um einen spezialisierten Subagenten zu starten, der komplexe, mehrstufige Aufgaben autonom erledigt. Das Agent-Tool delegiert Arbeiten an spezialisierte Agenten, die unabhängig arbeiten können und Zugriff auf ihre eigenen Tools haben. Dies ermöglicht parallele Aufgabenausführung und spezialisierte Expertise.

### Argumente

`agent` akzeptiert die folgenden Argumente:

- `description` (string, erforderlich): Eine kurze (3–5 Wörter) Beschreibung der Aufgabe für die Sichtbarkeit und Nachverfolgung durch den Benutzer.
- `prompt` (string, erforderlich): Der detaillierte Aufgaben-Prompt für den auszuführenden Subagenten. Soll umfassende Anweisungen für die autonome Ausführung enthalten.
- `subagent_type` (string, optional): Der Typ des zu verwendenden spezialisierten Agenten. Standardmäßig `general-purpose`, falls nicht angegeben.
- `fork_turns` (string, optional): Nur gültig mit `subagent_type="fork"`. Weglassen oder `all` für die vollständige Eltern-Konversation verwenden, oder einen positiven Integer-String wie `"3"` für die letzten drei echten Benutzer-Turns. Tool-Antworten und reine System-Reminder zählen nicht als Turns.
- `fork_tools` (Array von Strings, optional): Nur gültig mit `subagent_type="fork"`. Beschränkt die Ausführung auf exakte kanonische Toolnamen oder MCP-Server-Muster, während die aktuellen modellsichtbaren Tool-Deklarationen des Forks für die Prompt-Cache-Freigabe unverändert bleiben. Einträge dürfen keine umgebenden Leerzeichen haben; Wildcards sind auf `mcp__*` oder ein nachgestelltes MCP-Tool-Präfixmuster wie `mcp__github__read_*` beschränkt. Forks führen niemals `ask_user_question` aus; lassen Sie `fork_tools` weg, um jedes andere geerbte Tool zuzulassen, oder verwenden Sie ein leeres Array, um jeden Tool-Aufruf abzulehnen.
- `fork_profile` (string, optional): Nur gültig mit `subagent_type="fork"`. Lädt eine Frontmatter-only reguläre `.qwen/fork-profiles/<name>.md` mit höchstens 64 KiB aus dem aktiven Projekt-Root und wendet deren erforderliches `tools`-Array sowie einen optionalen `promptHint` von höchstens 200 Zeichen an. Die Datei kann nicht außerhalb des Projekt-Profilverzeichnisses aufgelöst werden. `fork_profile` kann nicht mit `fork_tools` oder einem benannten Teammate kombiniert werden und ist im Safe-Modus oder Bare-Modus nicht verfügbar.
- `run_in_background` (boolean, optional): Standardmäßig `true` für Top-Level-reguläre Agenten. Auf `false` setzen, um auf das Ergebnis eines regulären Agenten inline zu warten. Headless-Forks laufen immer im Hintergrund. Verschachtelte Agenten laufen im Vordergrund, es sei denn, `run_in_background` ist explizit `true`, was abgelehnt wird, da verschachtelte Agenten keine Hintergrund-Abschlussbenachrichtigungen erhalten können. Unbenannte `working_dir`-Launches des Aufrufers laufen im Vordergrund: eine explizite `run_in_background: true`-Anfrage wird abgelehnt, während ein konfigurierter Hintergrund-Standard (`background: true` in einer Subagent-Definition) auf Top-Level-Ebene abgelehnt und bei Verschachtelung auf den Vordergrund herabgestuft wird.
- `isolation` (string, optional): Auf `"worktree"` setzen, um einen explizit benannten, Nicht-Fork-Agenten in einem isolierten Git-Worktree auszuführen, den Qwen Code erstellt und verwaltet.
- `working_dir` (string, optional): Einen explizit benannten, Nicht-Fork-Agenten an einen vorhandenen registrierten Git-Worktree im aktuellen Repository anheften. Unbenannte Launches laufen im Vordergrund, da der Aufrufer den Worktree-Lifecycle besitzt (siehe `run_in_background`); ein benannter Teammate, der auf einen solchen angeheftet ist, läuft nebenbei und muss heruntergefahren werden, bevor der Worktree entfernt wird. Wenn sowohl `working_dir` als auch `isolation` angegeben sind, hat `working_dir` Vorrang.

## Verwendung von `agent` mit Qwen Code

Das Agent-Tool lädt dynamisch verfügbare Subagenten aus Ihrer Konfiguration und delegiert Aufgaben an sie. Jeder Subagent läuft unabhängig und kann seine eigenen Tools verwenden, was spezialisierte Expertise und parallele Ausführung ermöglicht.

Wenn Sie das Agent-Tool verwenden, führt der Subagent folgende Schritte aus:

1. Er erhält den Aufgaben-Prompt und bei einem Fork den ausgewählten Eltern-Konversationskontext.
2. Er führt die Aufgabe mit seinen verfügbaren Tools aus.
3. Er meldet standardmäßig eine Abschlussbenachrichtigung oder gibt eine abschließende Ergebnismeldung zurück, wenn ein regulärer Agent im Vordergrund läuft.
4. Er bleibt nach einem Hintergrundlauf adressierbar, wenn sein zurückbehaltener Zustand die Fortsetzung unterstützt.

Verwendung:

```
agent(description="Kurze Aufgabenbeschreibung", prompt="Detaillierte Aufgabenanweisungen für den Subagenten", subagent_type="agenten_name")
agent(description="Kurze Aufgabenbeschreibung", prompt="Detaillierte Aufgabenanweisungen für den Fork", subagent_type="fork", fork_turns="3")
agent(description="Nur-Lese-Untersuchung", prompt="Implementierung prüfen", subagent_type="fork", fork_tools=["read_file", "grep_search", "mcp__github"])
agent(description="Profilgesteuerte Untersuchung", prompt="Implementierung prüfen", subagent_type="fork", fork_profile="ro-research")
```

Setzen Sie `run_in_background=false`, wenn der aktuelle Turn das Ergebnis des Subagenten vor der Fortsetzung verwenden muss.

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

### Fortsetzung von Hintergrund-Agenten

Hintergrund-Agenten können nach ihrer ursprünglichen Abschlussarbeit Folgeaufträge empfangen:

1. Rufen Sie `list_agents` auf, um die adressierbaren Hintergrund-Agenten der aktuellen Session und deren `task_id`-Werte zu ermitteln. Dies umfasst kompatible Agenten, die nach der Wiederaufnahme der Eltern-Session wiederhergestellt wurden.
2. Rufen Sie `send_message` mit einer `task_id` und einer Folgeanweisung auf. Laufende Agenten erhalten die Nachricht an der nächsten Tool-Runden-Grenze, pausierte Agenten setzen damit fort, und abgeschlossene Agenten fahren auf einer vorhandenen Runtime fort, wenn verfügbar, oder werden aus ihrem zurückbehaltenen Transkript wiederbelebt.
3. Warten Sie auf die nächste Abschlussbenachrichtigung, bevor Sie das Folgeergebnis verwenden.

Wenn ein Agent nicht fortgesetzt werden kann, gibt `list_agents` einen `resume_blocked_reason` zurück. Behandeln Sie die Ausgabe von wiederhergestellten oder fortgesetzten Agenten als Evidenz und überprüfen Sie sie, bevor Sie Änderungen integrieren.

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

- **Unabhängiger Kontext**: Reguläre Subagenten starten ohne Eltern-Konversationsverlauf. Forks erben standardmäßig die vollständige Konversation und akzeptieren `fork_turns`, wenn ein begrenztes jüngeres Fenster ausreicht.
- **Subagenten-Interaktion**: Reguläre Subagenten erhalten kein `ask_user_question`. Forks behalten die Deklarationsliste des Elterns für die Cache-Freigabe, lehnen dieses Tool jedoch vor der Planung oder Genehmigung ab; wenn fehlende Benutzereingaben die Arbeit blockiert, meldet der Subagent die Blockierung an seinen Eltern.
- **Fork-Ausführungsbeschränkungen**: `fork_tools` grenzt weiter ein, welche bereits deklarierten Tools ein Fork ausführen darf. Unzulässige Aufrufe geben einen Fehler vor der Planung oder Genehmigung zurück; dieselbe Deklarationsliste bleibt für die Cache-Freigabe modellsichtbar. Dies ist eine vom Aufrufer gewählte pro-Aufruf-Beschränkung, keine von einem Administrator erzwungene Sandbox.
- **Fork-Profile**: Ein Projektprofil unter `.qwen/fork-profiles/` verwendet dasselbe Ausführungstor wie `fork_tools`. Es wird einmal vor dem Start aufgelöst; die aufgelöste Liste wird für die Wiederbelebung beibehalten, und ein optionaler `promptHint` wird nur zur Aufgaben-Direktive hinzugefügt.
- **Zustellung von Ergebnissen**: Hintergrundergebnisse kommen über Abschlussbenachrichtigungen in einem späteren Turn an. Nehmen Sie kein Ergebnis an, bevor die Benachrichtigung eintrifft.
- **Fortsetzung**: Verwenden Sie `list_agents` und `send_message` für verwandte Folgeaufgaben, anstatt einen doppelten Agenten zu starten. Die Fortsetzung hängt von kompatibel zurückbehaltenem Zustand ab und ist möglicherweise nicht verfügbar.
- **Umfassende Prompts**: Ihr anfänglicher Prompt sollte alle notwendigen Kontext- und Anweisungen für die autonome Ausführung enthalten. Ein regulärer Subagent sieht die Eltern-Konversation nicht.
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
