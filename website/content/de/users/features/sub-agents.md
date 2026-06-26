# Subagents (Unteragenten)

Subagents sind spezialisierte KI-Assistenten, die bestimmte Arten von Aufgaben innerhalb von Qwen Code übernehmen. Sie ermöglichen es Ihnen, fokussierte Arbeit an KI-Agenten zu delegieren, die mit aufgabenspezifischen Prompts, Werkzeugen und Verhaltensweisen konfiguriert sind.

## Was sind Subagents?

Subagents sind unabhängige KI-Assistenten, die:

- **Sich auf bestimmte Aufgaben spezialisieren** – Jeder Subagent ist mit einem fokussierten System-Prompt für bestimmte Arten von Arbeiten konfiguriert
- **Einen eigenen Kontext haben** – Sie führen eine eigene Gesprächshistorie, getrennt von Ihrem Hauptchat
- **Gesteuerte Werkzeuge verwenden** – Sie können konfigurieren, auf welche Werkzeuge jeder Subagent Zugriff hat
- **Autonom arbeiten** – Einmal mit einer Aufgabe betraut, arbeiten sie unabhängig bis zur Fertigstellung oder bis zum Scheitern
- **Detailliertes Feedback geben** – Sie können ihren Fortschritt, ihre Werkzeugnutzung und Ausführungsstatistiken in Echtzeit sehen

## Fork-Subagent

Zusätzlich zu benannten Subagents unterstützt Qwen Code **Forking** – explizit ausgewählt mit `subagent_type: "fork"` (verfügbar in interaktiven Sitzungen). Ein Fork erbt den vollständigen Gesprächskontext des übergeordneten Agents und läuft abgekoppelt im Hintergrund. Wird `subagent_type` weggelassen, wird **nicht** geforkt; es wird der Allzweck-Subagent gestartet, der vollständig ausgeführt wird und sein Ergebnis inline zurückgibt.

### Wie sich Fork von benannten Subagents unterscheidet

|               | Benannter Subagent                    | Fork-Subagent                                         |
| ------------- | ------------------------------------- | ----------------------------------------------------- |
| Kontext       | Startet frisch, keine Eltern-Historie | Erbt die vollständige Gesprächshistorie des Eltern-Agents |
| System-Prompt | Verwendet eigenen konfigurierten Prompt | Verwendet den exakten System-Prompt des Eltern-Agents (für Cache-Sharing) |
| Ausführung    | Blockiert den Eltern-Agent bis zur Fertigstellung | Läuft im Hintergrund, Eltern-Agent fährt sofort fort |
| Anwendungsfall | Spezialisierte Aufgaben (Tests, Doku) | Parallele Aufgaben, die den aktuellen Kontext benötigen |

### Wann Fork verwendet wird

Die KI verwendet Fork automatisch, wenn sie:

- Mehrere Rechercheaufgaben parallel ausführen muss (z. B. „Modul A, B und C untersuchen“)
- Hintergrundarbeit erledigen muss, während das Hauptgespräch fortgesetzt wird
- Aufgaben delegieren muss, die Verständnis des aktuellen Gesprächskontexts erfordern

### Prompt-Cache-Sharing

Alle Forks teilen sich das exakte API-Request-Präfix des Eltern-Agents (System-Prompt, Werkzeuge, Gesprächshistorie), was DashScope-Prompt-Cache-Treffer ermöglicht. Wenn 3 Forks parallel laufen, wird das gemeinsame Präfix einmal zwischengespeichert und wiederverwendet – das spart über 80 % Token-Kosten im Vergleich zu unabhängigen Subagents.

### Rekursive Fork-Prävention

Fork-Kinder können keine weiteren Forks erstellen. Dies wird zur Laufzeit erzwungen – wenn ein Fork versucht, einen weiteren Fork zu starten, erhält er einen Fehler, der ihn anweist, Aufgaben direkt auszuführen.

### Aktuelle Einschränkungen

- **Keine Rückmeldung der Ergebnisse**: Fork-Ergebnisse werden in der UI-Fortschrittsanzeige reflektiert, aber nicht automatisch in das Hauptgespräch zurückgespeist. Die Eltern-KI sieht eine Platzhalternachricht und kann nicht auf die Ausgabe des Forks reagieren.
- **Keine Worktree-Isolation**: Forks teilen sich das Arbeitsverzeichnis des Eltern-Agents. Gleichzeitige Dateiänderungen durch mehrere Forks können sich gegenseitig beeinflussen.

## Hauptvorteile

- **Aufgabenspezialisierung**: Erstellen Sie Agenten, die für bestimmte Arbeitsabläufe optimiert sind (Tests, Dokumentation, Refactoring usw.)
- **Kontextisolierung**: Halten Sie spezialisierte Arbeiten getrennt von Ihrem Hauptgespräch
- **Kontextvererbung**: Fork-Subagents erben das vollständige Gespräch für kontextintensive parallele Aufgaben
- **Prompt-Cache-Sharing**: Fork-Subagents teilen sich das Cache-Präfix des Eltern-Agents, wodurch Token-Kosten reduziert werden
- **Wiederverwendbarkeit**: Speichern und verwenden Sie Agentenkonfigurationen projekt- und sitzungsübergreifend
- **Kontrollierter Zugriff**: Beschränken Sie, welche Werkzeuge jeder Agent aus Sicherheits- und Fokusgründen verwenden kann
- **Fortschrittstransparenz**: Überwachen Sie die Agentenausführung mit Echtzeit-Fortschrittsaktualisierungen

## Wie Subagents funktionieren

1. **Konfiguration**: Sie erstellen Subagent-Konfigurationen, die deren Verhalten, Werkzeuge und System-Prompts definieren
2. **Delegation**: Die Haupt-KI kann Aufgaben automatisch an geeignete Subagents delegieren – oder sich selbst forken (`subagent_type: "fork"`), wenn sie den vollständigen Gesprächskontext erben und die Zwischenausgabe verwerfen möchte
3. **Ausführung**: Subagents arbeiten unabhängig und verwenden ihre konfigurierten Werkzeuge, um Aufgaben zu erledigen
4. **Ergebnisse**: Sie geben Ergebnisse und Ausführungszusammenfassungen an das Hauptgespräch zurück

## Erste Schritte

### Schnellstart

1. **Erstellen Sie Ihren ersten Subagent**:

   `/agents create`

   Folgen Sie dem geführten Assistenten, um einen spezialisierten Agenten zu erstellen.

2. **Bestehende Agenten verwalten**:

   `/agents manage`

   Zeigen Sie Ihre konfigurierten Subagents an und verwalten Sie sie.

3. **Subagents automatisch nutzen**: Bitten Sie die Haupt-KI einfach, Aufgaben auszuführen, die zu den Spezialisierungen Ihrer Subagents passen. Die KI delegiert dann automatisch die passende Arbeit.

### Beispielverwendung

```
Benutzer: "Bitte schreibe umfassende Tests für das Authentifizierungsmodul"
KI: Ich werde das an Ihren Test-Spezialisten-Subagent delegieren.
[Delegiert an Subagent "testing-expert"]
[Zeigt Echtzeit-Fortschritt der Testerstellung]
[Gibt fertige Testdateien und eine Ausführungszusammenfassung zurück]
```

## Verwaltung

### CLI-Befehle

Subagents werden über den Slash-Befehl `/agents` und seine Unterbefehle verwaltet:

**Verwendung:** `/agents create`. Erstellt einen neuen Subagenten durch einen geführten Schritt-Assistenten.

**Verwendung:** `/agents manage`. Öffnet einen interaktiven Verwaltungsdialog zum Anzeigen und Verwalten vorhandener Subagents.

### Speicherorte

Subagents werden als Markdown-Dateien an mehreren Orten gespeichert:

- **Projektebene**: `.qwen/agents/` (höchste Priorität)
- **Benutzerebene**: `~/.qwen/agents/` (Fallback)
- **Erweiterungsebene**: Bereitgestellt durch installierte Erweiterungen

Dies ermöglicht projektspezifische Agenten, persönliche Agenten, die projektübergreifend funktionieren, und durch Erweiterungen bereitgestellte Agenten, die spezialisierte Fähigkeiten hinzufügen.

### Erweiterungs-Subagents

Erweiterungen können benutzerdefinierte Subagents bereitstellen, die verfügbar werden, wenn die Erweiterung aktiviert ist. Diese Agenten werden im `agents/`-Verzeichnis der Erweiterung gespeichert und folgen dem gleichen Format wie persönliche und Projekt-Agenten.

Erweiterungs-Subagents:

- Werden automatisch erkannt, wenn die Erweiterung aktiviert ist
- Erscheinen im `/agents manage`-Dialog im Abschnitt „Erweiterungs-Agenten"
- Können nicht direkt bearbeitet werden (bearbeiten Sie stattdessen den Erweiterungsquellcode)
- Folgen dem gleichen Konfigurationsformat wie benutzerdefinierte Agenten

Um zu sehen, welche Erweiterungen Subagents bereitstellen, überprüfen Sie die Datei `qwen-extension.json` der Erweiterung auf ein Feld `agents`.

### Dateiformat

Subagents werden mit Markdown-Dateien mit YAML-Frontmatter konfiguriert. Dieses Format ist menschenlesbar und kann mit jedem Texteditor bearbeitet werden.

#### Grundstruktur

```
---
name: agent-name
description: Kurze Beschreibung, wann und wie dieser Agent verwendet wird
model: inherit # Optional: inherit, fast, modelId oder authType:modelId
approvalMode: auto-edit # Optional: default, plan, auto-edit, yolo, bubble
tools:         # Optional: Allowlist von Werkzeugen
  - tool1
  - tool2
disallowedTools: # Optional: Blocklist von Werkzeugen
  - tool3
---

System-Prompt-Inhalt hier.
Mehrere Absätze werden unterstützt.
```

#### Modellauswahl

Verwenden Sie das optionale `model`-Frontmatter-Feld, um zu steuern, welches Modell ein Subagent verwendet:

- `inherit`: Verwenden Sie dasselbe Modell wie das Hauptgespräch.
- Feld weglassen: Gleichbedeutend mit `inherit`.
- `fast`: Verwenden Sie das konfigurierte `fastModel`. Wenn kein gültiges schnelles Modell konfiguriert ist, fällt der Subagent auf `inherit` zurück.
- `glm-5`: Verwenden Sie diese Modell-ID. Qwen Code prüft zuerst den Authentifizierungstyp des Hauptgesprächs; falls das Modell dort nicht verfügbar ist, kann es das Modell von einem anderen konfigurierten Anbieter auflösen.
- `openai:gpt-4o`: Verwenden Sie einen expliziten Anbieter und eine Modell-ID. Dies ist nützlich, wenn ein Subagent auf einem Modell laufen soll, das unter einem anderen Authentifizierungstyp registriert ist als das Hauptgespräch.

Zum Beispiel:

```
---
name: fast-reviewer
description: Überprüft kleine Diffs mit dem konfigurierten schnellen Modell
model: fast
tools:
  - read_file
  - grep_search
---
```

```
---
name: openai-researcher
description: Verwendet einen OpenAI-kompatiblen Anbieter für Rechercheaufgaben
model: openai:gpt-4o
tools:
  - read_file
  - grep_search
  - glob
---
```

Der Selektor `fast` verwendet dieselbe `fastModel`-Einstellung, die in `settings.json` oder mit `/model --fast` konfiguriert ist. Diese Einstellung kann selbst auf ein Modell unter einem anderen konfigurierten Authentifizierungstyp verweisen, wie z. B. `openai:deepseek-v4-flash`. Wenn der Selektor zu einem anderen Authentifizierungstyp auflöst, erstellt Qwen Code einen dedizierten Laufzeit-Provider für diese Subagent-Anfrage und sendet dem Provider nur die nackte Modell-ID.

#### Berechtigungsmodus

Verwenden Sie das optionale `approvalMode`-Frontmatter-Feld, um zu steuern, wie die Werkzeugaufrufe eines Subagents genehmigt werden. Gültige Werte:

- `default`: Werkzeuge erfordern interaktive Genehmigung (genau wie der Standard des Hauptsitzung)
- `plan`: Nur-Analyse-Modus – der Agent plant, führt aber keine Änderungen aus
- `auto-edit`: Werkzeuge werden automatisch ohne Rückfrage genehmigt (empfohlen für die meisten Agenten)
- `yolo`: Alle Werkzeuge werden automatisch genehmigt, einschließlich potenziell destruktiver
- `bubble`: Werkzeug-Genehmigungen von Hintergrundagenten werden in der übergeordneten Sitzung angezeigt

Wenn Sie dieses Feld weglassen, wird der Berechtigungsmodus des Subagents automatisch bestimmt:

- Wenn die übergeordnete Sitzung im **yolo**- oder **auto-edit**-Modus ist, erbt der Subagent diesen Modus. Ein permissiver Elternteil bleibt permissiv.
- Wenn die übergeordnete Sitzung im **plan**-Modus ist, bleibt der Subagent im plan-Modus. Eine reine Analyse-Sitzung kann keine Dateien durch einen delegierten Agenten ändern.
- Wenn die übergeordnete Sitzung im **default**-Modus ist (in einem vertrauenswürdigen Ordner), erhält der Subagent **auto-edit**, damit er autonom arbeiten kann.

Wenn Sie `approvalMode` explizit setzen, haben die permissiven Modi des Elternteils immer noch Vorrang. Wenn der Elternteil beispielsweise im yolo-Modus ist, wird ein Subagent mit `approvalMode: plan` trotzdem im yolo-Modus ausgeführt.

```
---
name: cautious-reviewer
description: Überprüft Code, ohne Änderungen vorzunehmen
approvalMode: plan
tools:
  - read_file
  - grep_search
  - glob
---

Sie sind ein Code-Reviewer. Analysieren Sie den Code und berichten Sie die Ergebnisse.
Nehmen Sie keine Änderungen an Dateien vor.
```

#### Werkzeugkonfiguration

Verwenden Sie `tools` und `disallowedTools`, um zu steuern, auf welche Werkzeuge ein Subagent zugreifen kann.

**`tools` (Allowlist):** Wenn angegeben, kann der Subagent nur die aufgeführten Werkzeuge verwenden. Wenn weggelassen, erbt der Subagent alle verfügbaren Werkzeuge von der übergeordneten Sitzung.

```
---
name: reader
description: Nur-Lese-Agent für Code-Erkundung
tools:
  - read_file
  - grep_search
  - glob
  - list_directory
---
```

**`disallowedTools` (Blocklist):** Wenn angegeben, werden die aufgeführten Werkzeuge aus dem Werkzeugpool des Subagents entfernt. Dies ist nützlich, wenn Sie „alles außer X“ möchten, ohne jedes erlaubte Werkzeug aufzulisten.

```
---
name: safe-worker
description: Agent, der keine Dateien ändern kann
disallowedTools:
  - write_file
  - edit
  - run_shell_command
---
```

Wenn sowohl `tools` als auch `disallowedTools` gesetzt sind, wird zuerst die Allowlist angewendet, dann entfernt die Blocklist aus dieser Menge.

**MCP-Werkzeuge** folgen den gleichen Regeln. Wenn ein Subagent keine `tools`-Liste hat, erbt er alle MCP-Werkzeuge von der übergeordneten Sitzung. Wenn ein Subagent eine explizite `tools`-Liste hat, erhält er nur MCP-Werkzeuge, die explizit in dieser Liste genannt werden.

Das Feld `disallowedTools` unterstützt MCP-Server-Level-Muster:

- `mcp__server__tool_name` – blockiert ein bestimmtes MCP-Werkzeug
- `mcp__server` – blockiert alle Werkzeuge von diesem MCP-Server

```
---
name: no-slack
description: Agent ohne Slack-Zugriff
disallowedTools:
  - mcp__slack
---
```

#### Claude Code-Kompatibilitätsfelder

Qwen Code akzeptiert die unten aufgeführten Frontmatter-Felder aus Claude Code 2.1.168, sodass Sie eine CC-Agent-Datei in `.qwen/agents/` ablegen können und die unterstützten Felder identisch parsen. Optionale Felder mit ungültigen Werten werden beim Parsen stillschweigend ignoriert und nicht abgelehnt – die gleiche nachsichtige Haltung wie bei CC.

| Feld              | Typ              | Hinweise                                                                                                                                                                                                                                                                                                                  |
| ----------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `permissionMode`  | Enum-String      | `acceptEdits`, `auto`, `bypassPermissions`, `default`, `dontAsk`, `plan`. Wird beim Parsen auf `approvalMode` abgebildet; wenn beide gesetzt sind, gewinnt das explizite `approvalMode`.                                                                                                                                 |
| `maxTurns`        | positive Ganzzahl | Begrenzt das Turn-Budget des Agenten. Wird zur Laufzeit in `runConfig.max_turns` eingebunden; wenn beide gesetzt sind, gewinnt das Feld der obersten Ebene. Der veraltete verschachtelte Wert wird beim Speichern aus der Datei entfernt, um zwei Wahrheitsquellen zu vermeiden.                                            |
| `color`           | Enum-String      | Anzeigefarbe. Erlaubte Werte: `red`, `blue`, `green`, `yellow`, `purple`, `orange`, `pink`, `cyan` (entspricht CCs `_Y`). Der veraltete qwen-Sentinel `auto` bleibt aus Gründen der Rückwärtskompatibilität erhalten. Andere Werte werden beim Parsen stillschweigend ignoriert.                                         |
| `mcpServers`      | Record von Specs  | Pro-Agent überschreibbare MCP-Server. Werden mit der MCP-Server-Menge der Sitzung zusammengeführt, wenn der Agent startet; bei Schlüsselkollision gewinnt die Agent-Spezifikation (entspricht CCs `scope: 'agent'`-Semantik). Fehlerhafte Einträge werden pro Schlüssel mit einer Warnung verworfen, nicht der gesamte Agent. |
| `hooks`           | Record von Arrays | Pro-Agent Hooks. Schlüssel sind CC-Hook-Ereignisnamen (`PreToolUse`, `PostToolUse`, `UserPromptSubmit`, …); Werte sind Arrays von `{ matcher?, hooks: [...] }`-Definitionen in der gleichen Form wie das `hooks`-Feld in `settings.json`. Werden registriert, während der Agent läuft, und entfernt, wenn er stoppt.   |

Beispiel mit allen oben genannten:

```
---
name: rigorous-reviewer
description: Tiefgehende Code-Überprüfung mit einer Turn-Begrenzung
permissionMode: plan
maxTurns: 50
color: cyan
tools:
  - read_file
  - grep_search
  - glob
mcpServers:
  filesystem:
    type: stdio
    command: node
    args: [/usr/local/lib/mcp-fs/server.js]
hooks:
  PreToolUse:
    - matcher: Bash
      hooks:
        - type: command
          command: echo "review-agent about to run a shell command"
---

Sie sind ein Code-Reviewer. Analysieren Sie den Code gründlich und berichten Sie die Ergebnisse geordnet nach Schweregrad.
```

Die verbleibenden CC-Frontmatter-Felder – `effort`, `skills`, `initialPrompt`, `memory`, `isolation` – sind im Design-Dokument für deklarative Agenten dokumentiert und werden in nachfolgenden PRs implementiert, sobald die erforderliche Infrastruktur existiert (`effort` benötigt einen Modell-Schicht-Parameter; `memory` benötigt ein scoped Memory-Subsystem; das CLI-Flag `--agent` ermöglicht `initialPrompt`; usw.).

> **`hooks` v1-Einschränkung.** Während ein Subagent mit deklarierten `hooks` läuft, werden seine Hook-Einträge für jedes passende Ereignis in der Sitzung ausgelöst, nicht nur für die Werkzeugaufrufe dieses Subagents. Wenn zwei Subagents mit unterschiedlichen pro-Agent-Hook-Sets gleichzeitig laufen, werden beide Sets für beide Agenten ausgelöst. Die pro-Agent-Bereichsfilterung zum Zeitpunkt der Hook-Auslösung bleibt einem späteren Update vorbehalten; für v1 bevorzugen Sie pro-Agent-Hooks, die sicher global für die Dauer des Agentenlaufs ausgelöst werden können (z. B. Logging), gegenüber Hooks, die das Verhalten ändern.

#### Beispielverwendung

```
---
name: project-documenter
description: Erstellt Projektdokumentation und README-Dateien
---

Sie sind ein Dokumentationsspezialist.

Konzentrieren Sie sich darauf, klare, umfassende Dokumentation zu erstellen, die sowohl neuen Mitwirkenden als auch Endbenutzern hilft, das Projekt zu verstehen.
```

## Subagents effektiv einsetzen

### Automatische Delegation

Qwen Code delegiert Aufgaben proaktiv basierend auf:

- Der Aufgabenbeschreibung in Ihrer Anfrage
- Dem Beschreibungsfeld in den Subagent-Konfigurationen
- Dem aktuellen Kontext und den verfügbaren Werkzeugen

Um eine proaktivere Nutzung von Subagents zu fördern, fügen Sie Formulierungen wie „PROAKTIV NUTZEN" oder „MUSS VERWENDET WERDEN" in Ihr Beschreibungsfeld ein.

### Explizite Ausführung

Fordern Sie einen bestimmten Subagent an, indem Sie ihn in Ihrem Befehl erwähnen:

```
Lass den Subagent "testing-expert" Komponententests für das Zahlungsmodul erstellen
Lass den Subagent "documentation-writer" die API-Referenz aktualisieren
Lass den Subagent "react-specialist" die Leistung dieser Komponente optimieren
```

## Beispiele

### Agenten für Entwicklungs-Workflows

#### Test-Spezialist

Perfekt für umfassende Test-Erstellung und testgetriebene Entwicklung.

```
---
name: testing-expert
description: Schreibt umfassende Komponententests, Integrationstests und übernimmt Testautomatisierung mit Best Practices
tools:
  - read_file
  - write_file
  - read_many_files
  - run_shell_command
---

Sie sind ein Test-Spezialist, der sich auf die Erstellung qualitativ hochwertiger, wartbarer Tests konzentriert.

Ihre Fachgebiete umfassen:

- Komponententests mit geeignetem Mocking und Isolation
- Integrationstests für Komponenteninteraktionen
- Testgetriebene Entwicklungspraktiken
- Identifizierung von Grenzfällen und umfassende Abdeckung
- Leistungs- und Lasttests, wenn geeignet

Gehen Sie bei jeder Testaufgabe wie folgt vor:

1. Analysieren Sie die Codestruktur und Abhängigkeiten
2. Identifizieren Sie die wichtigsten Funktionen, Grenzfälle und Fehlerbedingungen
3. Erstellen Sie umfassende Test-Suiten mit aussagekräftigen Namen
4. Fügen Sie geeignetes Setup/Teardown und sinnvolle Assertions hinzu
5. Kommentieren Sie komplexe Testszenarien
6. Stellen Sie sicher, dass die Tests wartbar sind und den DRY-Prinzipien folgen

Befolgen Sie stets die Test-Best-Practices für die erkannte Sprache und das Framework.
Konzentrieren Sie sich sowohl auf positive als auch auf negative Testfälle.
```

**Anwendungsfälle:**

- „Schreibe Komponententests für den Authentifizierungsdienst"
- „Erstelle Integrationstests für den Zahlungsabwicklungsworkflow"
- „Füge Testabdeckung für Grenzfälle im Datenvalidierungsmodul hinzu"

#### Dokumentationsautor

Spezialisiert auf die Erstellung klarer, umfassender Dokumentation.

```
---
name: documentation-writer
description: Erstellt umfassende Dokumentation, README-Dateien, API-Dokumente und Benutzerhandbücher
tools:
  - read_file
  - write_file
  - read_many_files
---

Sie sind ein Spezialist für technische Dokumentation.

Ihre Aufgabe ist es, klare, umfassende Dokumentation zu erstellen, die sowohl Entwickler als auch Endbenutzer bedient. Konzentrieren Sie sich auf:

**Für API-Dokumentation:**

- Klare Endpunktbeschreibungen mit Beispielen
- Parameterdetails mit Typen und Einschränkungen
- Dokumentation des Antwortformats
- Erklärungen zu Fehlercodes
- Authentifizierungsanforderungen

**Für Benutzerdokumentation:**

- Schritt-für-Schritt-Anleitungen mit hilfreichen Screenshots
- Installations- und Einrichtungsanleitungen
- Konfigurationsoptionen und Beispiele
- Fehlerbehebungsabschnitte für häufige Probleme
- FAQ-Abschnitte basierend auf häufigen Benutzerfragen

**Für Entwicklerdokumentation:**

- Architekturüberblicke und Designentscheidungen
- Codebeispiele, die tatsächlich funktionieren
- Richtlinien für Mitwirkende
- Einrichtung der Entwicklungsumgebung

Überprüfen Sie immer Codebeispiele und stellen Sie sicher, dass die Dokumentation mit der tatsächlichen Implementierung aktuell bleibt. Verwenden Sie klare Überschriften, Aufzählungspunkte und Beispiele.
```

**Anwendungsfälle:**

- „Erstelle API-Dokumentation für die Benutzerverwaltungs-Endpunkte"
- „Schreibe eine umfassende README für dieses Projekt"
- „Dokumentiere den Bereitstellungsprozess mit Fehlerbehebungsschritten"

#### Code-Reviewer

Fokussiert auf Codequalität, Sicherheit und Best Practices.

```
---
name: code-reviewer
description: Überprüft Code auf Best Practices, Sicherheitsprobleme, Leistung und Wartbarkeit
tools:
  - read_file
  - read_many_files
---

Sie sind ein erfahrener Code-Reviewer mit Fokus auf Qualität, Sicherheit und Wartbarkeit.

Bewertungskriterien:

- **Codestruktur**: Organisation, Modularität und Trennung der Belange
- **Leistung**: Algorithmische Effizienz und Ressourcennutzung
- **Sicherheit**: Bewertung von Schwachstellen und sichere Codierungspraktiken
- **Best Practices**: Sprach-/Framework-spezifische Konventionen
- **Fehlerbehandlung**: Ordnungsgemäße Ausnahmebehandlung und Abdeckung von Grenzfällen
- **Lesbarkeit**: Klare Benennung, Kommentare und Codeorganisation
- **Tests**: Testabdeckung und Überlegungen zur Testbarkeit

Geben Sie konstruktives Feedback mit:

1. **Kritische Probleme**: Sicherheitslücken, schwerwiegende Fehler
2. **Wichtige Verbesserungen**: Leistungsprobleme, Designprobleme
3. **Kleinere Vorschläge**: Stilverbesserungen, Refactoring-Möglichkeiten
4. **Positives Feedback**: Gut implementierte Muster und gute Praktiken

Konzentrieren Sie sich auf umsetzbares Feedback mit konkreten Beispielen und Lösungsvorschlägen.
Priorisieren Sie Probleme nach Auswirkung und liefern Sie eine Begründung für die Empfehlungen.
```
**Anwendungsfälle:**

- „Überprüfen Sie diese Authentifizierungsimplementierung auf Sicherheitsprobleme“
- „Prüfen Sie die Leistungsauswirkungen dieser Datenbankabfragelogik“
- „Bewerten Sie die Codestruktur und schlagen Sie Verbesserungen vor“

### Technologiespezifische Agenten

#### React-Spezialist

Optimiert für die React-Entwicklung, Hooks und Komponentenmuster.

```
---
name: react-specialist
description: Experte für React-Entwicklung, Hooks, Komponentenmuster und moderne React-Best Practices
tools:
  - read_file
  - write_file
  - read_many_files
  - run_shell_command
---

Sie sind ein React-Spezialist mit umfassender Erfahrung in der modernen React-Entwicklung.

Ihr Fachwissen umfasst:

- **Komponentendesign**: Funktionale Komponenten, benutzerdefinierte Hooks, Kompositionsmuster
- **State-Management**: useState, useReducer, Context API und externe Bibliotheken
- **Performance**: React.memo, useMemo, useCallback, Code-Splitting
- **Testing**: React Testing Library, Jest, Komponententeststrategien
- **TypeScript-Integration**: Korrekte Typisierung für Props, Hooks und Komponenten
- **Moderne Patterns**: Suspense, Error Boundaries, Concurrent Features

Für React-Aufgaben:

1. Verwenden Sie standardmäßig funktionale Komponenten und Hooks
2. Implementieren Sie korrekte TypeScript-Typisierung
3. Befolgen Sie React-Best-Practices und -Konventionen
4. Berücksichtigen Sie Leistungsauswirkungen
5. Fügen Sie eine angemessene Fehlerbehandlung hinzu
6. Schreiben Sie testbaren, wartbaren Code

Bleiben Sie stets auf dem neuesten Stand der React-Best-Practices und vermeiden Sie veraltete Muster.
Konzentrieren Sie sich auf Barrierefreiheit und Benutzererfahrung.
```

**Anwendungsfälle:**

- „Erstellen Sie eine wiederverwendbare Datentabellenkomponente mit Sortier- und Filterfunktionen“
- „Implementieren Sie einen benutzerdefinierten Hook für API-Datenabruf mit Caching“
- „Refaktorieren Sie diese Klassenkomponente, um moderne React-Muster zu verwenden“

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

Sie sind ein Python-Experte mit umfassenden Kenntnissen des Python-Ökosystems.

Ihr Fachwissen umfasst:

- **Kern-Python**: Pythonische Muster, Datenstrukturen, Algorithmen
- **Frameworks**: Django, Flask, FastAPI, SQLAlchemy
- **Testing**: pytest, unittest, Mocking, testgetriebene Entwicklung
- **Data Science**: pandas, numpy, matplotlib, jupyter notebooks
- **Async Programming**: asyncio, async/await-Muster
- **Paketverwaltung**: pip, poetry, virtuelle Umgebungen
- **Codequalität**: PEP 8, Type Hints, Linting mit pylint/flake8

Für Python-Aufgaben:

1. Befolgen Sie die PEP 8-Stilrichtlinien
2. Verwenden Sie Type Hints für eine bessere Codedokumentation
3. Implementieren Sie eine ordnungsgemäße Fehlerbehandlung mit spezifischen Ausnahmen
4. Schreiben Sie umfassende Docstrings
5. Berücksichtigen Sie Leistung und Speichernutzung
6. Fügen Sie eine angemessene Protokollierung hinzu
7. Schreiben Sie testbaren, modularen Code

Konzentrieren Sie sich auf das Schreiben von sauberem, wartbarem Python-Code, der den Community-Standards folgt.
```

**Anwendungsfälle:**

- „Erstellen Sie einen FastAPI-Dienst für die Benutzerauthentifizierung mit JWT-Tokens“
- „Implementieren Sie eine Datenverarbeitungspipeline mit pandas und Fehlerbehandlung“
- „Schreiben Sie ein CLI-Tool mit argparse und umfassender Hilfedokumentation“

## Best Practices

### Design-Prinzipien

#### Single-Responsibility-Prinzip

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
description: Hilft bei Testing, Dokumentation, Code-Review und Deployment
---
```

**Warum:** Fokussierte Agenten erzielen bessere Ergebnisse und sind einfacher zu warten.

#### Klare Spezialisierung

Definieren Sie spezifische Fachgebiete anstelle von breiten Fähigkeiten.

**✅ Gut:**

```
---
name: react-performance-optimizer
description: Optimiert React-Anwendungen für die Leistung mittels Profiling und Best Practices
---
```

**❌ Vermeiden:**

```
---
name: frontend-developer
description: Arbeitet an Frontend-Entwicklungsaufgaben
---
```

**Warum:** Spezifisches Fachwissen führt zu zielgerichteterer und effektiverer Unterstützung.

#### Handlungsorientierte Beschreibungen

Schreiben Sie Beschreibungen, die klar anzeigen, wann der Agent verwendet werden soll.

**✅ Gut:**

```
description: Überprüft Code auf Sicherheitslücken, Leistungsprobleme und Wartbarkeitsbedenken
```

**❌ Vermeiden:**

```
description: Ein hilfreicher Code-Reviewer
```

**Warum:** Klare Beschreibungen helfen der Haupt-KI, den richtigen Agenten für jede Aufgabe auszuwählen.

### Konfigurations-Best-Practices

#### Richtlinien für System-Prompts

**Seien Sie spezifisch in Bezug auf Fachwissen:**

```
You are a Python testing specialist with expertise in:

- pytest framework and fixtures
- Mock objects and dependency injection
- Test-driven development practices
- Performance testing with pytest-benchmark
```

**Fügen Sie schrittweise Ansätze hinzu:**

```
For each testing task:

1. Analyze the code structure and dependencies
2. Identify key functionality and edge cases
3. Create comprehensive test suites with clear naming
4. Include setup/teardown and proper assertions
5. Add comments explaining complex test scenarios
```

**Geben Sie Ausgabestandards an:**

```
Always follow these standards:

- Use descriptive test names that explain the scenario
- Include both positive and negative test cases
- Add docstrings for complex test functions
- Ensure tests are independent and can run in any order
```

## Sicherheitsaspekte

- **Tool-Einschränkungen**: Verwenden Sie `tools`, um einzuschränken, auf welche Tools ein Subagent zugreifen kann, oder `disallowedTools`, um bestimmte Tools zu blockieren, während alles andere vererbt wird
- **Berechtigungsmodus**: Subagenten erben standardmäßig den Berechtigungsmodus ihres übergeordneten Agenten. Plan-Modus-Sitzungen können nicht über delegierte Agenten auf Auto-Edit eskalieren. Privilegierte Modi (Auto-Edit, Yolo) sind in nicht vertrauenswürdigen Ordnern blockiert.
- **Provider-Auswahl**: Ein Subagent mit `model: authType:modelId` oder `model: fast`, wobei `fastModel` zu einem anderen Authentifizierungstyp aufgelöst wird, sendet die Modellanfragen dieses Subagenten an den ausgewählten Provider. Stellen Sie sicher, dass dieser Provider für die Aufgabe und die Daten des Subagenten geeignet ist.
- **Sandboxing**: Die gesamte Tool-Ausführung folgt demselben Sicherheitsmodell wie die direkte Tool-Nutzung
- **Audit-Trail**: Alle Aktionen der Subagenten werden protokolliert und sind in Echtzeit sichtbar
- **Zugriffskontrolle**: Die Trennung auf Projekt- und Benutzerebene bietet angemessene Grenzen
- **Sensible Informationen**: Vermeiden Sie die Aufnahme von Geheimnissen oder Anmeldeinformationen in Agentenkonfigurationen
- **Produktionsumgebungen**: Erwägen Sie separate Agenten für Produktions- vs. Entwicklungsumgebungen

## Grenzen

Die folgenden Soft-Warnungen gelten für Subagent-Konfigurationen (es werden keine harten Grenzen durchgesetzt):

- **Beschreibungsfeld**: Eine Warnung wird angezeigt für Beschreibungen, die 1.000 Zeichen überschreiten
- **System-Prompt**: Eine Warnung wird angezeigt für System-Prompts, die 10.000 Zeichen überschreiten