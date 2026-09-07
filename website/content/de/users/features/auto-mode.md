# Auto Mode

Auto Mode verwendet einen LLM-Klassifizierer, um jeden Tool-Aufruf zu bewerten und zu entscheiden, ob er automatisch genehmigt werden soll. Er liegt zwischen Auto-Edit (das nur Dateiänderungen automatisch genehmigt) und YOLO (das alles automatisch genehmigt).

Diese Seite ist die Referenz für die Konfiguration und Fehlerbehebung von Auto Mode. Eine Einführung findest du in der
[Approval Mode overview](./approval-mode.md#4-auto-mode---classifier-driven-approval).

## Funktionsweise

Wenn du dich im Auto Mode befindest und der Agent versucht, ein Tool auszuführen, durchläuft Qwen Code drei Ebenen in folgender Reihenfolge:

1. **acceptEdits Fast-Path** — Edit / Write, deren Zielpfad sich im Workspace befindet, werden automatisch genehmigt, ohne den Klassifizierer aufzurufen.
   **Ausnahme:** Schreibvorgänge auf Qwen Codes eigene Selbstmodifikations-Oberflächen
   (`.qwen/settings*.json`, `QWEN.md`, `AGENTS.md`, `QWEN.local.md`,
   konfigurierte Kontext-Dateinamen, `.qwen/rules/`, `.qwen/commands/`,
   `.qwen/agents/`, `.qwen/skills/`, `.qwen/hooks/`, `.mcp.json`) und
   Persistenz-Oberflächen (`.git/`, `.husky/`, `package.json`, `.npmrc`,
   `Makefile`, `.github/workflows/`, usw.) werden auch dann durch den Klassifizierer geleitet, wenn sie sich im Workspace befinden. Symlinks, die auf geschützte Pfade zeigen, werden ebenfalls aufgelöst und abgelehnt. Shell-Befehle, die diese Pfade über `cd && bash -lc '...'` oder andere Wrapper erreichen, durchlaufen ebenfalls den Klassifizierer.
2. **Safe-Tool-Allowlist** — Nur lesende und nur Metadaten verändernde integrierte Tools
   (Read, Grep, Glob, LS, LSP, TodoWrite, AskUserQuestion usw.) werden
   automatisch genehmigt, ohne den Klassifizierer aufzurufen.
3. **LLM-Klassifizierer** — Alles andere (Shell-Befehle, Web-Fetches,
   Sub-Agent-Spawns, Edits außerhalb des Workspaces, MCP-Tools) wird an
   einen zweistufigen Klassifizierer gesendet:
   - **Stufe 1 (schnell)** — gibt nur `{ shouldBlock }` aus. Dauert ca. ~300 ms.
     Wenn `shouldBlock` `false` ist, wird die Aktion erlaubt und der Aufruf
     fortgesetzt.
   - **Stufe 2 (Thinking)** — läuft nur, wenn Stufe 1 blockiert hat. Verwendet
     Chain-of-Thought-Review, um False Positives von Stufe 1 zu reduzieren. Kann
     die Blockierung von Stufe 1 in eine Erlaubnis umwandeln. Gibt bei einer Blockierung den für den Benutzer sichtbaren
     `reason` aus.

Der Klassifizierer verwendet dein konfiguriertes Fast Model
(`/model --fast`). Wenn kein Fast Model konfiguriert ist, wird stattdessen das Haupt-Sitzungsmodell verwendet.

> [!tip]
>
> Shell-Befehle, die das Berechtigungssystem als nur lesend erkennt (z. B.
> `ls`, `cat`, `git log`), werden automatisch genehmigt, bevor sie den
> Klassifizierer erreichen. Setze `permissions.autoMode.classifyAllShell: true`, um
> dies zu überschreiben und alle Shell-Befehle durch den Klassifizierer zu leiten –
> siehe [Classify all shell commands](#classify-all-shell-commands) weiter unten.

## Harte Regeln haben immer Vorrang

Auto Mode ersetzt **keine** harten Berechtigungsregeln. Bevor der Klassifizierer läuft:

- `permissions.deny`-Regeln blockieren die Aktion mit dem Grund der Regel. Der
  Klassifizierer bekommt sie nie zu sehen.
- `permissions.allow`-Regeln mit spezifischen Spezifiern (z. B.
  `Bash(git status)`, `Read(./docs/**)`) erlauben weiterhin automatisch ohne den
  Klassifizierer – **außer** wenn der Aufruf auf einen Schreibvorgang an einem
  geschützten Selbstmodifikations- oder Persistenzpfad aufgelöst wird (siehe die Liste unter
  "Funktionsweise"). In diesem Fall prüft Auto Mode den Aufruf erneut über
  den Klassifizierer, damit eine Allow-Regel für `Bash(*)` nicht stillschweigend zur Erlaubnis wird, Qwen Code-Einstellungen, Commands, Hooks,
  Skills oder MCP-Server umzuschreiben.
- `permissions.ask`-Regeln erzwingen eine manuelle Bestätigung, auch im Auto Mode.

## Zu weit gefasste Allow-Regeln werden im Auto Mode entfernt

Regeln wie die folgenden würden es dem Agenten ermöglichen, beliebigen Code
ohne Überprüfung durch den Klassifizierer auszuführen:

- `Bash` / `Bash(*)` / `Bash()` — erlaubt jeden Shell-Befehl automatisch
- `Bash(python:*)`, `Bash(node*)`, `Bash(bash*)` — Interpreter-Wildcards
- `Agent` / `Agent(coder)` — jede Erlaubnis für das Agent-Tool
- `Skill` / `Skill(pdf)` — jede Erlaubnis für das Skill-Tool

Wenn du in den Auto Mode wechselst, entfernt Qwen Code diese Regeln vorübergehend aus
dem aktiven Berechtigungssatz und gibt eine Benachrichtigung aus, die sie auflistet. Die Regeln
werden sofort wiederhergestellt, sobald du den Auto Mode verlässt. `settings.json` wird dabei niemals verändert.

Wenn du diese weit gefassten Regeln wirklich benötigst, verwende stattdessen den YOLO-Modus.

## Hints konfigurieren

Auto Mode liest `permissions.autoMode` aus deiner `settings.json`. Die
Einträge sind Beschreibungen in natürlicher Sprache, keine Regelmuster – sie werden additiv in den System-Prompt des Klassifizierers neben den integrierten Standardwerten injiziert.

Es gibt drei Hint-Kategorien sowie eine Umgebungsliste:

- **`allow`** — Aktionen, die der Klassifizierer automatisch genehmigen soll.
- **`softDeny`** — destruktive oder irreversible Aktionen, die der Klassifizierer
  blockieren soll, **außer die letzte ausdrückliche Anfrage des Benutzers hat
  genau diese Aktion und diesen Umfang gefordert**. Soft Denies können durch die Absicht des Benutzers aufgehoben werden; ein generelles "Ja, mach was du willst" zählt nicht.
- **`hardDeny`** — sicherheitsgrenzüberschreitende Aktionen, die der Klassifizierer im Auto Mode unabhängig von `autoMode.hints.allow` oder der jüngsten Benutzerabsicht blockieren muss. Dies ist eine Klassifizierer-Richtlinie, keine deterministische Berechtigungsregel: Sie überschreibt nicht `permissions.allow`. Verwende `permissions.deny`
  für Aktionen, die vom Berechtigungsmanager niemals erlaubt werden dürfen.

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

`hints.deny` wird aus Gründen der Abwärtskompatibilität weiterhin akzeptiert und wie `softDeny` behandelt. Das Mischen beider ist in Ordnung – die Einträge werden verkettet, wobei `softDeny` zuerst kommt.

### Längen- und Anzahlbeschränkungen

Um den System-Prompt des Klassifizierers klein zu halten:

- Jeder Eintrag ist auf 200 Zeichen begrenzt (längere Einträge werden mit einer Warnung abgeschnitten).
- `hints.allow`, `hints.softDeny` und `hints.hardDeny` akzeptieren jeweils bis zu 50 Einträge.
- `environment` akzeptiert bis zu 20 Einträge.

### Layering über Einstellungsdateien hinweg

`autoMode` wird über System-/Benutzer-/Workspace-Einstellungen hinweg auf dieselbe Weise zusammengeführt wie andere Berechtigungseinstellungen: Arrays werden verkettet und dedupliziert.

### Alle Shell-Befehle klassifizieren

Standardmäßig werden nur lesende Shell-Befehle (`ls`, `cat`, `git status`, …) automatisch genehmigt, ohne den Klassifizierer aufzurufen – das Berechtigungssystem erkennt sie auf Ebene 3 als sicher und überspringt den Klassifizierer vollständig. Setze `classifyAllShell` auf `true`, um **jeden** Shell-Befehl durch den Klassifizierer zu zwingen, auch nur lesende:

```json
{
  "permissions": {
    "autoMode": {
      "classifyAllShell": true
    }
  }
}
```

Dies ist nützlich für Produktions- oder Hochsicherheitsumgebungen, in denen du Defense-in-Depth wünschst: Selbst scheinbar harmlose Befehle werden vor der Ausführung vom Klassifizierer überprüft. Der Kompromiss ist eine zusätzliche Latenz (~300 ms pro nur lesendem Shell-Aufruf) und die Abhängigkeit von der Verfügbarkeit des Klassifizierers – wenn die Klassifizierer-API nicht erreichbar ist, erfordern auch nur lesende Shell-Befehle eine manuelle Genehmigung.

> [!note]
>
> `classifyAllShell` betrifft nur Shell-Befehle (`run_shell_command` und
> `monitor`). Integrierte nur lesende Tools (`read_file`, `grep_search`,
> `glob`, `list_directory` usw.) sind davon unberührt und verwenden weiterhin die
> Fast-Path-Allowlist.

## Auswerten der Entscheidung

Wenn der Klassifizierer eine Aktion blockiert, schlägt der Tool-Aufruf fehl mit:

- **`Blocked by auto mode policy: <reason>`** —
  der Klassifizierer hat die Aktion als unsicher eingestuft. Der Grund stammt aus Stufe 2 des Klassifizierers.

Diese Meldung wird von einer nachgestellten Anweisungszeile gefolgt, die dem Agenten mitteilt, dass die **spezifisch abgelehnte Aktion** nicht durch ein anderes Tool, Shell-Indirektion, generiertes Skript, Alias, Symlink, Config-Change, Hook, Command-File, MCP-Konfiguration, kodierten Payload oder einen gleichwertigen Pfad abgeschlossen werden darf. **Unabhängige sichere Arbeit und tatsächlich sicherere Alternativen sind weiterhin erlaubt** — nur Versuche, dieselbe abgelehnte Absicht über eine andere Oberfläche zu erreichen, werden blockiert.

Wenn die abgelehnte Aktion tatsächlich erforderlich ist, sollte der Agent stoppen und dich um ausdrückliche Genehmigung bitten, anstatt die Ablehnung zu umgehen.

### Sprache der Klassifizierer-Begründungen

Begründungen des Klassifizierers werden vom LLM erstellt und nicht übersetzt. Wenn du nicht-englische Begründungen möchtest, füge einen Hint wie
`Respond reasons in Chinese` zu `permissions.autoMode.environment` hinzu.

## Fallback auf manuelle Genehmigung

Auto Mode schützt dich davor, stecken zu bleiben:

- Wenn die Classifier-API nicht erreichbar ist, ein Timeout auftritt, das Kontextfenster überschritten wird oder eine ungültige Antwort zurückgegeben wird, fällt die aktuelle Aktion sofort auf die manuelle Genehmigung zurück. Die Bestätigung empfiehlt den Default Mode und bietet **Switch to Default Mode and allow once** neben Allow once und Reject an. Der Wechsel betrifft nur die aktuelle Runtime-Session; er ändert nicht deine gespeicherten Einstellungen.

- Nach **3 aufeinanderfolgenden Policy-Blockierungen** fällt der nächste Tool-Aufruf auf den Standard-Prompt für manuelle Genehmigung zurück. Dies fängt den Fall ab, dass der Agent immer wieder kleine Varianten eines verbotenen Befehls ausprobiert.
- Nach **2 aufeinanderfolgenden "unavailable"**-Ergebnissen (Classifier-API-Fehler) überspringen spätere Aufrufe den bekanntermaßen defekten Classifier und gehen direkt zur manuellen Genehmigung. Das erste "unavailable"-Ergebnis fragt bereits nach; die Schwelle verhindert wiederholtes Warten auf Classifier-Retries.

Die Sitzung bleibt im Auto Mode, es sei denn, du wählst explizit die Wechsel-Option. Nur der Fallback-Aufruf durchläuft die manuelle Genehmigung. Die Zähler werden zurückgesetzt, wenn du den Fallback-Aufruf genehmigst oder den Modus wechselst.

Wenn du ständig auf den Fallback triffst, sind die wahrscheinlichsten Ursachen ein Ausfall der Klassifizierer-API oder Hints, die angepasst werden müssen. Wechsle zum Default Mode, während du das untersuchst.

## Fehlerbehebung

**"Auto Mode blockiert meine Befehle ständig"**

Schau dir den Grund in der Fehlermeldung an. Wenn der Klassifizierer für deinen Kontext zu konservativ ist, füge einen Eintrag zu
`permissions.autoMode.hints.allow` hinzu, der das Muster in natürlicher Sprache beschreibt. Beispiele:

- `"Docker-Images für dieses Projekt bauen (docker build ...)"`
- `"Datenbankmigrationen gegen die lokale Test-DB ausführen"`

**"Auto Mode Klassifizierer nicht verfügbar"**

Die Klassifizierer-API hat nicht geantwortet. Mögliche Ursachen:

- Netzwerkproblem zwischen dir und dem Modell-Endpunkt.
- Das konfigurierte Fast Model ist nicht mehr verfügbar – überprüfe `/model --fast`.
- Das Transkript ist zu lang und überschreitet das Kontextfenster des Fast Models.

Während der Diagnose, wechsle zurück zum Default Mode: `/approval-mode default`.

**"Fallback auf manuelle Genehmigung"**

Du hast entweder die 3-aufeinanderfolgende-Blockierung- oder die 2-aufeinanderfolgende-nicht-verfügbar-Schwelle erreicht. Genehmige oder lehne den Prompt wie gewohnt ab. Nach einer genehmigten Fallback-Abfrage wird der Zähler für aufeinanderfolgende Ereignisse zurückgesetzt.

**Der Klassifizierer sieht sensible Daten in meinen Prompts**

Tool-Inputs werden durch die `toAutoClassifierInput`-Methode jedes Tools projiziert, bevor sie den Klassifizierer erreichen. Lange Edit-Inhalte, Web-Fetch-Prompts und Sub-Agent-Prompts werden gekürzt. Tool-Ergebnisse (Dateiinhalte, Webseiten) werden niemals an den Klassifizierer gesendet – nur der Text des Benutzers und die Tool-Use-Aufrufe des Assistenten werden durchgereicht.

Wenn ein bestimmtes Tool Felder offenlegt, die du lieber schwärzen möchtest, erstelle ein Issue mit dem Tool-Namen; die Projektion erfolgt pro Tool und soll im Laufe der Zeit weiter verschärft werden.

## Einschränkungen

- **Nicht offline-fähig.** Der Klassifizierer erfordert einen LLM-Aufruf.
- **Fügt Latenz auf dem langsamen Pfad hinzu.** Allowlist + acceptEdits decken die meisten Aufrufe ohne Latenz ab, aber ein `run_shell_command` fügt typischerweise ~300 ms (schneller Klassifizierer-Pfad) oder ~3-5 s (langsamer Pfad mit Thinking-Review) hinzu.
- **Kein Ersatz für `deny`-Regeln.** Der Klassifizierer arbeitet nach dem Best-Effort-Prinzip. Für Befehle, von denen du sicher bist, dass sie niemals ausgeführt werden sollten, packe sie in `permissions.deny`.
- **MCP-Tools werden anhand ihrer Argumente beurteilt, nicht anhand verifizierten Verhaltens.** MCP-Tools von Drittanbietern (`mcp__*`) stehen niemals auf der Fast-Path-Allowlist; jeder Aufruf von einem Server, der nicht mit `trust: true` markiert ist, geht mit dem Servernamen, dem Tool-Namen, den vom Server selbst gemeldeten Annotationen (`readOnlyHint` / `destructiveHint` / `idempotentHint` / `openWorldHint`) und einer begrenzten Kopie der Argumente an den Klassifizierer. Dem Klassifizierer wird mitgeteilt, dass die Annotationen nicht verifiziert sind. Er kann nicht sehen, was der Server tatsächlich mit dem Aufruf macht, daher kann ein irreführender Tool-Name plus harmlose Argumente trotzdem durchgehen. Wenn du einem bestimmten MCP-Tool vertraust, füge `permissions.allow: ["mcp__server__tool"]` hinzu, damit es den Klassifizierer vollständig umgeht; wenn der Klassifizierer nur den Tool-Namen sehen soll (z. B. wenn er gegen einen anderen Provider läuft als das Hauptmodell), setze `permissions.autoMode.mcp.forwardArguments: false` – die meisten MCP-Aufrufe werden dann konservativ blockiert.

## FAQ

**Sendet Auto Mode meinen Code an einen Drittanbieter?**

Auto Mode verwendet deine bestehende Modellkonfiguration weiter – derselbe Endpunkt wie der Haupt-Agent. Wenn du Qwen Code so konfiguriert hast, dass es ein selbst gehostetes Modell verwendet, läuft der Klassifizierer auch gegen diesen Endpunkt.

**Erreichen meine Secrets / `.env`-Inhalte den Klassifizierer?**

Der Klassifizierer sieht nur das, was die `toAutoClassifierInput`-Projektion jedes Tools offenlegt:

- `read_file` und andere nur lesende Tools: werden nicht aufgerufen (sie sind auf der Fast-Path-Allowlist).
- `edit` / `write_file`: file_path plus eine 300-Zeichen-Vorschau des alten/neuen Inhalts. Der vollständige Inhalt wird nicht weitergeleitet.
- `run_shell_command`: der vollständige Befehl (das muss er – das ist es, was der Klassifizierer bewertet).
- `web_fetch`: nur die URL. Das Prompt-Feld wird nicht weitergeleitet.
- `agent`: Subagent-Typ plus der vollständige Prompt. Der Prompt ist die Anweisung, der der Sub-Agent folgen wird, daher benötigt der Klassifizierer ihn vollständig, um Angriffe zu erkennen, die den Sub-Agenten zu destruktiven Aktionen lenken würden – aus demselben Grund leitet `run_shell_command` den vollständigen Befehl weiter.

Tool-Ergebnisse (der tatsächliche von Tools zurückgegebene Inhalt) werden vollständig aus dem Klassifizierer-Transkript entfernt.

MCP-Tools (`mcp__*`): Der Servername, der Tool-Name, die Annotationen des Servers und die Aufrufargumente werden weitergeleitet. Jeder String (Wert oder Schlüssel) wird bei 2.000 Zeichen abgeschnitten, Namen bei 200, die gesamte Payload teilt sich ein Budget von 16.000 Zeichen, gemessen an der vom Klassifizierer empfangenen Pretty-Print-Form, und Verschachtelung / Eintragsanzahlen sind begrenzt; jeder Schnitt wird an Ort und Stelle markiert (`…[truncated N chars]` oder `[omitted: …]`) und mit `arguments_truncated: true` / `name_truncated: true` gekennzeichnet, damit der Klassifizierer eine Auslassung niemals als Abwesenheit missversteht. Historische Aktionen im Transkript sind auf jeweils 4.000 Zeichen und insgesamt 40.000 Zeichen begrenzt (neueste zuerst; ältere behalten nur ihren Tool-Namen). Die Argumente sind das, was der Agent gleich an diesen Server senden wird – die Data-Exfiltration- und External-Write-Regeln des Klassifizierers können nur auf sie angewendet werden, und sie wurden bereits vom Hauptmodell erzeugt, daher offenbart die Weiterleitung an einen Klassifizierer mit derselben Modellkonfiguration nichts Neues. Wenn dein Klassifizierer gegen einen anderen Provider läuft, setze `permissions.autoMode.mcp.forwardArguments: false`, um zur Name-only-Projektion zurückzukehren (erwarte, dass die meisten MCP-Aufrufe blockiert werden).

**Kann ich die Informationsmeldung beim ersten Mal deaktivieren?**

Sie wird nur einmal pro Benutzer-Einstellungsdatei angezeigt. Nach dem Schließen wird `ui.autoModeAcknowledged: true` in deinen Benutzereinstellungen gesetzt.

**Wie unterscheidet sich das von Auto-Edit?**

Auto-Edit genehmigt Dateiänderungen automatisch und sonst nichts – Shell-Befehle fragen weiterhin nach. Auto Mode verwendet einen Klassifizierer, um auch sichere Shell-Befehle und andere Tool-Aufrufe automatisch zu genehmigen, während riskante weiterhin blockiert werden.

**Wie unterscheidet sich das von YOLO?**

YOLO genehmigt alles automatisch ohne jegliche Überprüfung. Auto Mode hat den Klassifizierer im Loop und blockiert riskante Aktionen.