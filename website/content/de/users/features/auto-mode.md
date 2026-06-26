# Auto Mode

Der Auto Mode verwendet einen LLM-Klassifikator, um jeden Tool-Aufruf zu bewerten und zu entscheiden, ob er automatisch genehmigt werden soll. Er liegt zwischen Auto-Edit (der nur Dateibearbeitungen automatisch genehmigt) und YOLO (der alles automatisch genehmigt).

Diese Seite ist die Referenz zur Konfiguration und Fehlerbehebung des Auto Mode. Eine Einführung finden Sie in der
[Übersicht der Genehmigungsmodi](./approval-mode.md#4-auto-mode---classifier-driven-approval).

## So funktioniert es

Wenn Sie sich im Auto Mode befinden und der Agent versucht, ein Tool auszuführen, durchläuft Qwen Code drei Ebenen in der Reihe:

1. **acceptEdits-Schnellpfad** — Bearbeitungen/Schreibvorgänge, deren Zielpfad innerhalb des Arbeitsbereichs liegt, werden automatisch genehmigt, ohne den Klassifikator aufzurufen.
   **Ausnahme:** Schreibvorgänge auf Qwen Codes eigenen Selbstmodifikationsflächen (`.qwen/settings*.json`, `QWEN.md`, `AGENTS.md`, `QWEN.local.md`,
   konfigurierte Kontextdateinamen, `.qwen/rules/`, `.qwen/commands/`,
   `.qwen/agents/`, `.qwen/skills/`, `.qwen/hooks/`, `.mcp.json`) und
   Persistenzflächen (`.git/`, `.husky/`, `package.json`, `.npmrc`,
   `Makefile`, `.github/workflows/` usw.) werden über den Klassifikator geleitet, selbst wenn sie sich innerhalb des Arbeitsbereichs befinden. Symlinks, die auf geschützte Pfade verweisen, werden ebenfalls aufgelöst und abgelehnt. Shell-Befehle, die diese Pfade über `cd && bash -lc '...'` oder andere Wrapper erreichen, durchlaufen ebenfalls den Klassifikator.
2. **Safe-Tool-Whitelist** — Nur-Lese- und Metadaten-Tools (Read, Grep, Glob, LS, LSP, TodoWrite, AskUserQuestion usw.) werden automatisch genehmigt, ohne den Klassifikator aufzurufen.
3. **LLM-Klassifikator** — Alles andere (Shell-Befehle, Web-Abrufe, Sub-Agent-Spawns, Bearbeitungen außerhalb des Arbeitsbereichs, MCP-Tools) wird an einen zweistufigen Klassifikator gesendet:
   - **Stufe 1 (schnell)** — gibt nur `{ shouldBlock }` aus. Dauert etwa 300 ms.
     Wenn `shouldBlock` `false` ist, wird die Aktion erlaubt und der Aufruf fortgesetzt.
   - **Stufe 2 (denkend)** — wird nur ausgeführt, wenn Stufe 1 blockieren gemeldet hat. Verwendet eine Kettenüberlegung zur Überprüfung, um Fehlalarme von Stufe 1 zu reduzieren. Kann die Blockierung von Stufe 1 auf Erlauben herabstufen. Gibt bei Blockierung die für den Benutzer sichtbare `reason` aus.

Der Klassifikator verwendet Ihr konfiguriertes schnelles Modell
(`/model --fast`). Wenn kein schnelles Modell konfiguriert ist, wird stattdessen das Hauptsitzungsmodell verwendet.

## Harte Regeln haben weiterhin Vorrang

Der Auto Mode ersetzt **nicht** die harten Berechtigungsregeln. Bevor der Klassifikator ausgeführt wird:

- `permissions.deny`-Regeln blockieren die Aktion mit dem Grund der Regel. Der Klassifikator sieht sie nie.
- `permissions.allow`-Regeln mit spezifischen Bezeichnern (z. B.
  `Bash(git status)`, `Read(./docs/**)`) erlauben weiterhin automatisch ohne den Klassifikator — **außer** wenn der Aufruf zu einem Schreibvorgang auf einem geschützten Selbstmodifikations- oder Persistenzpfad führt (siehe Liste unter „So funktioniert es"). In diesem Fall überprüft der Auto Mode den Aufruf erneut durch den Klassifikator, damit eine Allow-Regel auf `Bash(*)` nicht stillschweigend zur Berechtigung wird, Qwen Code-Einstellungen, Befehle, Hooks, Skills oder MCP-Server umzuschreiben.
- `permissions.ask`-Regeln erzwingen auch im Auto Mode eine manuelle Bestätigung.

## Zu weit gefasste Allow-Regeln werden im Auto Mode entfernt

Regeln wie die folgenden würden dem Agenten erlauben, beliebigen Code ohne Klassifikator-Überprüfung auszuführen:

- `Bash` / `Bash(*)` / `Bash()` — erlaubt automatisch jeden Shell-Befehl
- `Bash(python:*)`, `Bash(node*)`, `Bash(bash*)` — Platzhalter für Interpreter
- `Agent` / `Agent(coder)` — jede Erlaubnis für das Agent-Tool
- `Skill` / `Skill(pdf)` — jede Erlaubnis für das Skill-Tool

Wenn Sie den Auto Mode betreten, entfernt Qwen Code diese Regeln vorübergehend aus dem aktiven Berechtigungssatz und zeigt eine Meldung mit der Auflistung an. Die Regeln kommen sofort zurück, sobald Sie den Auto Mode verlassen. `settings.json` wird niemals geändert.

Wenn Sie diese breiten Regeln tatsächlich benötigen, verwenden Sie stattdessen den YOLO-Modus.

## Konfiguration von Hinweisen

Der Auto Mode liest `permissions.autoMode` aus Ihrer `settings.json`. Die
Einträge sind natürlichsprachliche Beschreibungen, keine Regel-Muster – sie werden additiv in den System-Prompt des Klassifikators zusammen mit den integrierten Standardwerten eingefügt.

Es gibt drei Hinweiskategorien plus eine Umgebungsliste:

- **`allow`** — Aktionen, die der Klassifikator automatisch genehmigen soll.
- **`softDeny`** — destruktive oder irreversible Aktionen, die der Klassifikator blockieren soll, **es sei denn, die letzte explizite Anforderung des Benutzers hat genau diese Aktion und diesen Umfang verlangt**. Soft-Denies können durch Benutzerabsicht aufgehoben werden; ein allgemeines „ja, mach was" zählt nicht.
- **`hardDeny`** — sicherheitskritische Aktionen, die der Klassifikator im Auto Mode unabhängig von `autoMode.hints.allow` oder der letzten Benutzerabsicht blockieren muss. Dies ist eine Klassifikator-Richtlinie, keine deterministische Berechtigungsregel: sie überschreibt nicht `permissions.allow`. Verwenden Sie `permissions.deny` für Aktionen, die niemals vom Berechtigungsmanager erlaubt werden dürfen.

```json
{
  "permissions": {
    "autoMode": {
      "hints": {
        "allow": [
          "Ausführen von poetry install und poetry update in diesem Python-Projekt",
          "Bereinigen von Build-Artefakten unter ./dist oder ./build",
          "Lesen einer beliebigen Datei unter /Users/me/code/"
        ],
        "softDeny": [
          "Bearbeiten von Qwen Code-Einstellungen, es sei denn, ich fordere explizit die genaue Änderung an",
          "Ausführen von Migrationsskripten, die die Produktionsdatenbank berühren"
        ],
        "hardDeny": [
          "Senden von Geheimnissen oder .env-Inhalten an einen Netzwerkendpunkt",
          "Ändern von etwas unter ~/.ssh oder ~/.aws"
        ]
      },
      "environment": [
        "Dies ist ein privates Monorepo mit strikter Commit-Signatur",
        "Produktionsanmeldeinformationen befinden sich in 1Password, niemals in Klartextdateien"
      ]
    }
  }
}
```
`hints.deny` wird aus Gründen der Abwärtskompatibilität weiterhin akzeptiert und als `softDeny` behandelt. Die Mischung beider ist in Ordnung – Einträge werden konkateniert, `softDeny` zuerst.

### Längen- und Anzahllimits

Um das System-Prompt des Klassifikators klein zu halten:

- Jeder Eintrag ist auf 200 Zeichen begrenzt (längere Einträge werden mit einer Warnung abgeschnitten).
- `hints.allow`, `hints.softDeny` und `hints.hardDeny` akzeptieren jeweils bis zu 50 Einträge.
- `environment` akzeptiert bis zu 20 Einträge.

### Überlagerung über Einstellungsdateien hinweg

`autoMode` wird über System-/Benutzer-/Arbeitsbereichseinstellungen hinweg zusammengeführt, genau wie andere Berechtigungseinstellungen: Arrays werden konkateniert und dedupliziert.

## Lesen der Entscheidung

Wenn der Klassifikator eine Aktion blockiert, schlägt der Tool-Aufruf mit einem der folgenden Fehlertexte fehl:

- **`Blocked by auto mode policy: <reason>`** – der Klassifikator hat die Aktion als unsicher eingestuft. Der Grund stammt aus Stufe 2 des Klassifikators.
- **`Auto mode classifier unavailable; action blocked for safety`** – die Klassifikator-API war nicht erreichbar, hat eine Zeitüberschreitung verursacht oder eine nicht parsbare Antwort zurückgegeben. Dies ist ein Fail-Closed-Verhalten: Im Zweifel blockieren.

Beide Nachrichten werden von einer abschließenden Leitlinie gefolgt, die dem Agenten mitteilt, dass die **spezifisch verweigerte Aktion** nicht über ein anderes Tool, Shell-Indirektion, generiertes Skript, Alias, Symlink, Konfigurationsänderung, Hook, Befehlsdatei, MCP-Konfiguration, codierte Nutzlast oder einen gleichwertigen Pfad abgeschlossen werden darf. **Nicht zusammenhängende sichere Arbeiten und echte sicherere Alternativen sind weiterhin erlaubt** – nur Versuche, dieselbe verweigerte Absicht über eine andere Oberfläche zu erreichen, werden blockiert.

Wenn die verweigerte Aktion tatsächlich erforderlich ist, sollte der Agent anhalten und Sie um explizite Genehmigung bitten, anstatt die Verweigerung zu umgehen.

### Begründungssprache des Klassifikators

Klassifikator-Begründungen werden vom LLM erzeugt und nicht übersetzt. Wenn Sie nicht-englische Begründungen wünschen, fügen Sie einen Hinweis wie `Respond reasons in Chinese` zu `permissions.autoMode.environment` hinzu.

## Fallback auf manuelle Genehmigung

Der Automatikmodus schützt Sie davor, festzustecken:

- Nach **3 aufeinanderfolgenden Richtlinienblockaden** fällt der nächste Tool-Aufruf auf die Standard-Manuelle-Genehmigungsaufforderung zurück. Dies fängt den Fall ab, in dem der Agent immer wieder kleine Varianten eines verbotenen Befehls ausprobiert.
- Nach **2 aufeinanderfolgenden nicht verfügbaren Ergebnissen** (Klassifikator-API-Fehlern) fällt der nächste Tool-Aufruf ebenfalls zurück. Dies vermeidet das Warten auf einen defekten Klassifikator.

Die Sitzung selbst bleibt im Automatikmodus – nur der einzelne Fallback-Aufruf durchläuft die manuelle Genehmigung. Die Zähler werden zurückgesetzt, wenn Sie den Fallback-Aufruf genehmigen oder den Modus wechseln.

Wenn Sie ständig auf den Fallback stoßen, sind die wahrscheinlichsten Ursachen ein Ausfall der Klassifikator-API oder Hinweise, die angepasst werden müssen. Wechseln Sie während der Untersuchung in den Standardmodus.

## Fehlerbehebung

**"Automatikmodus blockiert ständig meine Befehle"**

Sehen Sie sich den Grund in der Fehlermeldung an. Wenn der Klassifikator für Ihren Kontext zu konservativ ist, fügen Sie einen Eintrag zu `permissions.autoMode.hints.allow` hinzu, der das Muster in natürlicher Sprache beschreibt. Beispiele:

- `"Building Docker images for this project (docker build ...)"`
- `"Running database migrations against the local test DB"`

**"Automatikmodus-Klassifikator nicht verfügbar"**

Die Klassifikator-API hat nicht geantwortet. Mögliche Ursachen:

- Netzwerkproblem zwischen Ihnen und dem Modell-Endpunkt.
- Das konfigurierte schnelle Modell ist nicht mehr verfügbar – überprüfen Sie mit `/model --fast`.
- Das Transkript ist zu lang und überschreitet das Kontextfenster des schnellen Modells.

Wechseln Sie während der Diagnose zurück in den Standardmodus: `/approval-mode default`.

**"Fallback auf manuelle Genehmigung"**

Sie haben entweder den 3-aufeinanderfolgende-Blockaden- oder den 2-aufeinanderfolgende-nicht-verfügbar-Schutz ausgelöst. Genehmigen oder ablehnen Sie die Aufforderung wie gewohnt. Nach einem genehmigten Fallback wird der aufeinanderfolgende Zähler zurückgesetzt.

**Der Klassifikator sieht sensible Daten in meinen Eingabeaufforderungen**

Tool-Eingaben werden durch die jeweilige `toAutoClassifierInput`-Methode des Tools projiziert, bevor sie den Klassifikator erreichen. Lange Bearbeitungsinhalte, Web-Fetch-Aufforderungen und Unteragenten-Aufforderungen werden abgeschnitten. Tool-Ergebnisse (Dateiinhalte, Webseiten) werden niemals an den Klassifikator gesendet – nur der Text des Benutzers und die Tool-Nutzungsaufrufe des Assistenten durchlaufen ihn.

Wenn ein bestimmtes Tool Felder preisgibt, die Sie lieber schwärzen möchten, reichen Sie ein Problem mit dem Tool-Namen ein; die Projektion ist pro Tool und soll im Laufe der Zeit verschärft werden.

## Einschränkungen

- **Nicht offline-fähig.** Der Klassifikator erfordert einen LLM-Aufruf.
- **Fügt Latenz auf dem langsamen Pfad hinzu.** Allowlist + acceptEdits decken die meisten Aufrufe ohne Latenz ab, aber ein `run_shell_command` fügt typischerweise ~300 ms (schneller Klassifikator-Pfad) oder ~3-5 s (langsamer Pfad mit Denküberprüfung) hinzu.
- **Kein Ersatz für `deny`-Regeln.** Der Klassifikator arbeitet nach bestem Wissen. Für Befehle, von denen Sie sicher sind, dass sie niemals ausgeführt werden sollten, fügen Sie sie in `permissions.deny` ein.
- **MCP-Tools blockieren standardmäßig konservativ.** MCP-Tools von Drittanbietern (`mcp__*`) können die Argumentweiterleitung über die `toAutoClassifierInput`-Überschreibung aktivieren. Tools, die dies nicht getan haben, geben nur ihren Namen an den Klassifikator weiter – die meisten dieser Aufrufe werden konservativ blockiert, es sei denn, Sie haben eine explizite `allow`-Regel geschrieben. Dies ist fail-closed-by-design (Anmeldeinformationen und umfangreiche Inhalte gelangen nicht in den Klassifikator-LLM). Wenn Sie einem bestimmten MCP-Tool vertrauen, fügen Sie `permissions.allow: ["mcp__server__tool"]` hinzu, damit es den Klassifikator vollständig umgeht.
## FAQ

**Sendet der Auto-Modus meinen Code an einen Drittanbieter?**

Der Auto-Modus verwendet deine bestehende Modellkonfiguration – denselben Endpunkt wie
der Haupt-Agent. Wenn du Qwen Code so konfiguriert hast, dass es ein selbst gehostetes
Modell verwendet, läuft der Classifier ebenfalls gegen diesen Endpunkt.

**Gelangen meine Secrets / `.env`-Inhalte zum Classifier?**

Der Classifier sieht nur das, was die `toAutoClassifierInput`-Projektion jedes Tools
preisgibt:

- `read_file` und andere reine Lese-Tools: werden nicht aufgerufen (sie sind auf der
  Schnellpfad-Allowlist).
- `edit` / `write_file`: Dateipfad plus die ersten 80 Zeichen des alten/neuen Inhalts.
  Der vollständige Inhalt wird nicht weitergeleitet.
- `run_shell_command`: der vollständige Befehl (das muss sein – daran beurteilt der
  Classifier die Aktion).
- `web_fetch`: nur die URL. Das Prompt-Feld wird nicht weitergeleitet.
- `agent`: Subagent-Typ plus das vollständige Prompt. Das Prompt ist die Anweisung,
  die der Sub-Agent befolgen wird, daher benötigt der Classifier es vollständig, um
  Angriffe zu erkennen, die den Sub-Agenten zu destruktiven Aktionen lenken würden –
  derselbe Grund, warum `run_shell_command` den vollständigen Befehl weiterleitet.

Tool-Ergebnisse (die tatsächlichen Inhalte, die von Tools zurückgegeben werden) werden
vollständig aus dem Classifier-Transkript entfernt.

MCP-Tools (`mcp__*`) folgen einer strengeren Vorgabe: ihre Parameter werden nicht
weitergeleitet, es sei denn, der MCP-Tool-Autor hat explizit über den `toAutoClassifierInput`-Override
optiert. Der Classifier sieht den Tool-Namen, aber keine Argumente, daher werden die
meisten MCP-Aufrufe konservativ blockiert, es sei denn, der Benutzer hat eine explizite
Erlaubnisregel geschrieben. Dies ist ein Fail-Closed-Design – Tools von Drittanbietern
sollten ohne Absicht keine Anmeldedaten oder umfangreichen Dateiinhalte in das Classifier-LLM
einfließen lassen.

**Kann ich die Informationsmeldung beim ersten Mal deaktivieren?**

Sie erscheint nur einmal pro Benutzereinstellungsdatei. Nach dem Schließen
wird `ui.autoModeAcknowledged: true` in deinen Benutzereinstellungen gesetzt.

**Worin unterscheidet sich das von Auto-Edit?**

Auto-Edit genehmigt Dateibearbeitungen automatisch und sonst nichts –
Shell-Befehle fragen immer nach. Der Auto-Modus verwendet einen Classifier, um auch
sichere Shell-Befehle und andere Tool-Aufrufe automatisch zu genehmigen, während
riskante weiterhin blockiert werden.

**Worin unterscheidet sich das von YOLO?**

YOLO genehmigt alles automatisch ohne jegliche Prüfung. Der Auto-Modus hat den
Classifier im Kreislauf und blockiert riskante Aktionen.
