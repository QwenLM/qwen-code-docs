# Auto Mode

Auto Mode verwendet einen LLM-Klassifikator, um jeden Tool-Aufruf zu bewerten und zu entscheiden, ob er automatisch genehmigt werden soll. Es liegt zwischen Auto-Edit (das nur Dateibearbeitungen automatisch genehmigt) und YOLO (das alles automatisch genehmigt).

Diese Seite ist die Referenz zum Konfigurieren und Troubleshooting von Auto Mode. Eine Einführung findest du in der
[Approval Mode-Übersicht](./approval-mode.md#4-auto-mode---classifikatorgesteuerte-genehmigung).

## Funktionsweise

Wenn du dich im Auto Mode befindest und der Agent versucht, ein Tool auszuführen, durchläuft Qwen Code nacheinander drei Ebenen:

1. **acceptEdits-Schnellpfad** — Bearbeitungen/Schreibvorgänge, deren Zielpfad sich innerhalb des Workspace befindet, werden ohne Aufruf des Klassifikators automatisch genehmigt.
   **Ausnahme:** Schreibvorgänge auf Qwen Codes eigenen Selbstmodifikationsflächen (`.qwen/settings*.json`, `QWEN.md`, `AGENTS.md`, `QWEN.local.md`, konfigurierte Kontext-Dateinamen, `.qwen/rules/`, `.qwen/commands/`, `.qwen/agents/`, `.qwen/skills/`, `.qwen/hooks/`, `.mcp.json`) und Persistenzflächen (`.git/`, `.husky/`, `package.json`, `.npmrc`, `Makefile`, `.github/workflows/` usw.) durchlaufen den Klassifikator, selbst wenn sie sich innerhalb des Workspace befinden. Symlinks, die auf geschützte Pfade verweisen, werden ebenfalls aufgelöst und abgelehnt. Shell-Befehle, die diese Pfade via `cd && bash -lc '...'` oder andere Wrapper erreichen, durchlaufen ebenfalls den Klassifikator.
2. **Safe-Tool-Allowlist** — Schreibgeschützte und reine Metadaten-Built-in-Tools (Read, Grep, Glob, LS, LSP, TodoWrite, AskUserQuestion, usw.) werden ohne Aufruf des Klassifikators automatisch genehmigt.
3. **LLM-Klassifikator** — Alles andere (Shell-Befehle, Web-Abfragen, Sub-Agent-Spawns, Bearbeitungen außerhalb des Workspace, MCP-Tools) wird einem zweistufigen Klassifikator übergeben:
   - **Stufe 1 (schnell)** — gibt nur `{ shouldBlock }` aus. Dauert ca. 300ms.
     Wenn `shouldBlock` `false` ist, wird die Aktion erlaubt und der Aufruf fortgesetzt.
   - **Stufe 2 (denkend)** — wird nur ausgeführt, wenn Stufe 1 blockieren gesagt hat. Verwendet eine Chain-of-Thought-Prüfung, um False Positives von Stufe 1 zu reduzieren. Kann die Blockierung von Stufe 1 auf Erlauben herabstufen. Bei einer Blockierung wird die für den Benutzer sichtbare `reason` ausgegeben.

Der Klassifikator verwendet dein konfiguriertes Fast-Modell
(`/model --fast`). Wenn kein Fast-Modell konfiguriert ist, wird stattdessen das Hauptsitzungsmodell verwendet.

## Harte Regeln gelten weiterhin

Auto Mode ersetzt **nicht** die harten Berechtigungsregeln. Bevor der Klassifikator läuft:

- `permissions.deny`-Regeln blockieren die Aktion mit dem Grund der Regel. Der Klassifikator sieht sie nie.
- `permissions.allow`-Regeln mit spezifischen Spezifizierern (z.B. `Bash(git status)`, `Read(./docs/**)`) erlauben weiterhin automatisch ohne den Klassifikator — **außer** wenn der Aufruf zu einem Schreibvorgang an einem geschützten Selbstmodifikations- oder Persistenzpfad führt (siehe Liste unter „Funktionsweise"). In diesem Fall prüft Auto Mode den Aufruf erneut durch den Klassifikator, sodass eine Allow-Regel für `Bash(*)` nicht stillschweigend zur Berechtigung wird, Qwen Code-Einstellungen, -Befehle, -Hooks, -Skills oder -MCP-Server neu zu schreiben.
- `permissions.ask`-Regeln erzwingen auch im Auto Mode eine manuelle Bestätigung.

## Zu weit gefasste Allow-Regeln werden im Auto Mode entfernt

Regeln wie die folgenden würden es dem Agenten erlauben, beliebigen Code ohne Klassifikatorprüfung auszuführen:

- `Bash` / `Bash(*)` / `Bash()` — automatische Genehmigung jedes Shell-Befehls
- `Bash(python:*)`, `Bash(node*)`, `Bash(bash*)` — Interpreter-Wildcards
- `Agent` / `Agent(coder)` — jede Allow-Regel für das Agent-Tool
- `Skill` / `Skill(pdf)` — jede Allow-Regel für das Skill-Tool

Wenn du den Auto Mode betrittst, entfernt Qwen Code diese Regeln vorübergehend aus dem aktiven Berechtigungssatz und gibt einen Hinweis mit der Auflistung aus. Die Regeln kommen zurück, sobald du den Auto Mode verlässt. `settings.json` wird nie verändert.

Wenn du diese breiten Regeln wirklich benötigst, verwende stattdessen den YOLO-Modus.

## Konfigurieren von Hinweisen

Auto Mode liest `permissions.autoMode` aus deiner `settings.json`. Die Einträge sind natürlichsprachliche Beschreibungen, keine Regelmuster – sie werden dem System-Prompt des Klassifikators zusätzlich zu den integrierten Standardwerten hinzugefügt.

Es gibt drei Hinweis-Kategorien plus eine Umgebungsliste:

- **`allow`** — Aktionen, die der Klassifikator automatisch genehmigen soll.
- **`softDeny`** — destruktive oder irreversible Aktionen, die der Klassifikator blockieren soll, **es sei denn, die letzte explizite Anfrage des Benutzers hat genau diese Aktion und diesen Umfang verlangt**. Soft-Denys können durch Benutzerabsicht aufgehoben werden; ein allgemeines „ja mach was" zählt nicht.
- **`hardDeny`** — sicherheitskritische Aktionen, die der Klassifikator im Auto Mode unabhängig von `autoMode.hints.allow` oder der aktuellen Benutzerabsicht blockieren muss. Dies ist eine Klassifikator-Richtlinie, keine deterministische Berechtigungsregel: Sie überschreibt nicht `permissions.allow`. Verwende `permissions.deny` für Aktionen, die vom Berechtigungsmanager niemals erlaubt werden dürfen.

```json
{
  "permissions": {
    "autoMode": {
      "hints": {
        "allow": [
          "Running poetry install and poetry update in this Python project",
          "Cleaning build artifacts under ./dist or ./build",
          "Reading any file under /Users/me/code/"
        ],
        "softDeny": [
          "Editing Qwen Code settings unless I explicitly ask for the exact change",
          "Running migration scripts that touch the production DB"
        ],
        "hardDeny": [
          "Sending secrets or .env contents to any network endpoint",
          "Modifying anything under ~/.ssh or ~/.aws"
        ]
      },
      "environment": [
        "This is a private monorepo with strict commit signing",
        "Production credentials live in 1Password, never in plain files"
      ]
    }
  }
}
```

`hints.deny` wird aus Gründen der Abwärtskompatibilität weiterhin akzeptiert und wie `softDeny` behandelt. Beides zu mischen ist in Ordnung – Einträge werden konkateniert, `softDeny` zuerst.

### Längen- und Anzahlbegrenzungen

Um den System-Prompt des Klassifikators klein zu halten:

- Jeder Eintrag ist auf 200 Zeichen begrenzt (längere Einträge werden mit einer Warnung abgeschnitten).
- `hints.allow`, `hints.softDeny` und `hints.hardDeny` akzeptieren jeweils bis zu 50 Einträge.
- `environment` akzeptiert bis zu 20 Einträge.

### Überlagerung über Einstellungsdateien hinweg

`autoMode` wird über System-/Benutzer-/Workspace-Einstellungen hinweg auf die gleiche Weise zusammengeführt wie andere Berechtigungseinstellungen: Arrays werden konkateniert und doppelte Einträge entfernt.

## Die Entscheidung verstehen

Wenn der Klassifikator eine Aktion blockiert, schlägt der Tool-Aufruf mit einem der folgenden Fehlertexte fehl:

- **`Blocked by auto mode policy: <reason>`** — der Klassifikator hat die Aktion als unsicher eingestuft. Der Grund stammt aus Stufe 2 des Klassifikators.
- **`Auto mode classifier unavailable; action blocked for safety`** — die Klassifikator-API war nicht erreichbar, hat eine Zeitüberschreitung verursacht oder eine nicht analysierbare Antwort zurückgegeben. Dies ist ein Fail-Closed-Verhalten: Im Zweifel blockieren.

Beiden Meldungen folgt eine abschließende Anweisungszeile, die dem Agenten mitteilt, dass die **spezifisch abgelehnte Aktion** nicht über ein anderes Tool, Shell-Indirektion, generiertes Skript, Alias, Symlink, Konfigurationsänderung, Hook, Befehlsdatei, MCP-Konfiguration, codierte Nutzlast oder einen gleichwertigen Pfad abgeschlossen werden darf. **Unabhängige sichere Arbeiten und echte sicherere Alternativen sind weiterhin erlaubt** – nur Versuche, dieselbe abgelehnte Absicht über eine andere Oberfläche zu erreichen, werden blockiert.

Wenn die abgelehnte Aktion wirklich erforderlich ist, sollte der Agent anhalten und dich um explizite Genehmigung bitten, anstatt die Ablehnung zu umgehen.

### Klassifikator-Grundsprache

Klassifikator-Gründe werden vom LLM erzeugt und nicht übersetzt. Wenn du nicht-englische Gründe wünschst, füge einen Hinweis wie
`Respond reasons in Chinese` zu `permissions.autoMode.environment` hinzu.

## Rückfall auf manuelle Genehmigung

Auto Mode schützt dich davor, hängen zu bleiben:

- Nach **3 aufeinanderfolgenden Policy-Blocks** fällt der nächste Tool-Aufruf auf die standardmäßige manuelle Genehmigungsaufforderung zurück. Dies fängt den Fall ab, dass der Agent immer wieder kleine Varianten eines verbotenen Befehls ausprobiert.
- Nach **2 aufeinanderfolgenden nicht verfügbaren Ergebnissen** (Klassifikator-API-Fehlern) fällt der nächste Tool-Aufruf ebenfalls zurück. Dies vermeidet das Warten auf einen defekten Klassifikator.

Die Sitzung selbst bleibt im Auto Mode – nur der einzelne Rückfall-Aufruf durchläuft die manuelle Genehmigung. Die Zähler werden zurückgesetzt, wenn du den Rückfall-Aufruf genehmigst oder den Modus wechselst.

Wenn du ständig auf Rückfälle stößt, sind die wahrscheinlichsten Ursachen ein Ausfall der Klassifikator-API oder Hinweise, die optimiert werden müssen. Wechsle während der Untersuchung in den Default Mode.

## Troubleshooting

**"Auto mode keeps blocking my commands"**

Sieh dir den Grund in der Fehlermeldung an. Wenn der Klassifikator für deinen Kontext zu konservativ ist, füge einen Eintrag zu `permissions.autoMode.hints.allow` hinzu, der das Muster in natürlicher Sprache beschreibt. Beispiele:

- `"Building Docker images for this project (docker build ...)"`
- `"Running database migrations against the local test DB"`

**"Auto mode classifier unavailable"**

Die Klassifikator-API hat nicht geantwortet. Mögliche Ursachen:

- Netzwerkproblem zwischen dir und dem Modell-Endpunkt.
- Das konfigurierte Fast-Modell ist nicht mehr verfügbar – überprüfe `/model --fast`.
- Das Transkript ist zu lang und überschreitet das Kontextfenster des Fast-Modells.

Wechsle während der Diagnose zurück zum Default Mode: `/approval-mode default`.

**"Falling back to manual approval"**

Du hast entweder die 3-aufeinanderfolgende-Block- oder die 2-aufeinanderfolgende-nicht-verfügbar-Schutzgrenze erreicht. Genehmige oder lehne die Aufforderung wie gewohnt ab. Nach einem genehmigten Rückfall wird der aufeinanderfolgende Zähler zurückgesetzt.

**Der Klassifikator sieht sensible Daten in meinen Prompts**

Tool-Eingaben werden vor dem Erreichen des Klassifikators durch die `toAutoClassifierInput`-Methode jedes Tools projiziert. Lange Bearbeitungsinhalte, Webabruf-Prompts und Sub-Agent-Prompts werden abgeschnitten. Tool-Ergebnisse (Dateiinhalte, Webseiten) werden nie an den Klassifikator gesendet – nur der Text des Benutzers und die Tool-Nutzungsaufrufe des Assistenten werden durchgereicht.

Wenn ein bestimmtes Tool Felder preisgibt, die du lieber schwärzen möchtest, erstelle ein Issue mit dem Toolnamen; die Projektion ist pro Tool und soll im Laufe der Zeit verschärft werden.

## Einschränkungen

- **Nicht offline-fähig.** Der Klassifikator erfordert einen LLM-Aufruf.
- **Erhöht die Latenz auf dem langsamen Pfad.** Allowlist + acceptEdits decken die meisten Aufrufe ohne Latenz ab, aber ein `run_shell_command` fügt typischerweise ~300ms (schneller Klassifikator-Pfad) oder ~3-5s (langsamer Pfad mit Denk-Review) hinzu.
- **Kein Ersatz für `deny`-Regeln.** Der Klassifikator ist ein Best-Effort. Für Befehle, von denen du sicher bist, dass sie niemals ausgeführt werden sollten, setze sie in `permissions.deny`.
- **MCP-Tools standardmäßig konservativ blockiert.** Drittanbieter-MCP-Tools (`mcp__*`) optieren über das `toAutoClassifierInput`-Override in die Argumentweiterleitung ein. Tools, die nicht optiert haben, geben nur ihren Namen an den Klassifikator weiter – die meisten dieser Aufrufe werden konservativ blockiert, es sei denn, du hast eine explizite `allow`-Regel geschrieben. Dies ist ein Fail-Closed-by-Design (Anmeldedaten und umfangreiche Inhalte gelangen nicht in den Klassifikator-LLM). Wenn du einem bestimmten MCP-Tool vertraust, füge `permissions.allow: ["mcp__server__tool"]` hinzu, damit es den Klassifikator vollständig umgeht.

## FAQ

**Sendet Auto Mode meinen Code an einen Dritten?**

Auto Mode verwendet deine vorhandene Modellkonfiguration – denselben Endpunkt wie der Hauptagent. Wenn du Qwen Code so konfiguriert hast, dass ein selbst gehostetes Modell verwendet wird, läuft der Klassifikator ebenfalls gegen diesen Endpunkt.

**Gelangen meine Secrets / `.env`-Inhalte zum Klassifikator?**

Der Klassifikator sieht nur das, was die `toAutoClassifierInput`-Projektion jedes Tools preisgibt:

- `read_file` und andere schreibgeschützte Tools: werden nicht aufgerufen (sie befinden sich in der Schnellpfad-Allowlist).
- `edit` / `write_file`: Dateipfad plus die ersten 80 Zeichen des alten/neuen Inhalts. Der vollständige Inhalt wird nicht weitergeleitet.
- `run_shell_command`: der vollständige Befehl (das muss er – das ist es, was der Klassifikator bewertet).
- `web_fetch`: nur die URL. Das Prompt-Feld wird nicht weitergeleitet.
- `agent`: Sub-Agent-Typ plus das vollständige Prompt. Das Prompt ist die Anweisung, die der Sub-Agent befolgen wird, daher benötigt der Klassifikator es vollständig, um Angriffe zu erkennen, die den Sub-Agenten zu destruktiven Aktionen lenken würden – aus dem gleichen Grund, aus dem `run_shell_command` den vollständigen Befehl weiterleitet.

Tool-Ergebnisse (die tatsächlichen von Tools zurückgegebenen Inhalte) werden vollständig aus dem Klassifikator-Transkript entfernt.

MCP-Tools (`mcp__*`) folgen einem strengeren Standard: Ihre Parameter werden nicht weitergeleitet, es sei denn, der Autor des MCP-Tools hat explizit über das `toAutoClassifierInput`-Override optiert. Der Klassifikator sieht den Tool-Namen, aber keine Argumente, sodass die meisten MCP-Aufrufe konservativ blockiert werden, es sei denn, der Benutzer hat eine explizite Allow-Regel geschrieben. Dies ist ein Fail-Closed-by-Design – Drittanbieter-Tools sollten keine Anmeldedaten oder umfangreichen Dateiinhalte ohne Absicht in den Klassifikator-LLM gelangen lassen.

**Kann ich die erstmalige Informationsmeldung deaktivieren?**

Sie wird nur einmal pro Benutzereinstellungsdatei angezeigt. Nach dem Verwerfen wird `ui.autoModeAcknowledged: true` in deinen Benutzereinstellungen gesetzt.

**Wie unterscheidet sich dies von Auto-Edit?**

Auto-Edit genehmigt automatisch Dateibearbeitungen und nichts weiter – Shell-Befehle fragen weiterhin nach. Auto Mode verwendet einen Klassifikator, um auch sichere Shell-Befehle und andere Tool-Aufrufe automatisch zu genehmigen, während riskante weiterhin blockiert werden.

**Wie unterscheidet sich dies von YOLO?**

YOLO genehmigt automatisch alles ohne jegliche Prüfung. Auto Mode hat den Klassifikator in der Schleife und blockiert riskante Aktionen.