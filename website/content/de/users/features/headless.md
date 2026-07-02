# Headless-Modus

Der Headless-Modus ermöglicht es dir, Qwen Code programmatisch über Befehlszeilenskripte und Automatisierungstools ohne jegliche interaktive UI auszuführen. Dies ist ideal für Skripting, Automatisierung, CI/CD-Pipelines und die Entwicklung KI-gestützter Tools.

## Übersicht

Der Headless-Modus bietet eine Headless-Schnittstelle zu Qwen Code, die:

- Prompts über Befehlszeilenargumente oder stdin akzeptiert
- Strukturierte Ausgaben (Text oder JSON) zurückgibt
- Dateiumleitung und Piping unterstützt
- Automatisierungs- und Skripting-Workflows ermöglicht
- Konsistente Exit-Codes für die Fehlerbehandlung bereitstellt
- Vorherige Sitzungen, die auf das aktuelle Projekt beschränkt sind, für die mehrstufige Automatisierung fortsetzen kann

## Grundlegende Verwendung

### Direkte Prompts

Verwende das Flag `--prompt` (oder `-p`), um im Headless-Modus zu starten:

```bash
qwen --prompt "What is machine learning?"
```

### Stdin-Eingabe

Leite Eingaben aus deinem Terminal an Qwen Code weiter:

```bash
echo "Explain this code" | qwen
```

### Kombination mit Dateieingaben

Lese aus Dateien und verarbeite sie mit Qwen Code:

```bash
cat README.md | qwen --prompt "Summarize this documentation"
```

### Vorherige Sitzungen fortsetzen (Headless)

Nutze den Konversationskontext des aktuellen Projekts in Headless-Skripten erneut:

```bash
# Continue the most recent session for this project and run a new prompt
qwen --continue -p "Run the tests again and summarize failures"

# Resume a specific session ID directly (no UI)
qwen --resume 123e4567-e89b-12d3-a456-426614174000 -p "Apply the follow-up refactor"
```

> [!note]
>
> - Sitzungsdaten sind projektbezogene JSONL-Dateien unter `~/.qwen/projects/<sanitized-cwd>/chats`.
> - Stellt den Konversationsverlauf, Tool-Ausgaben und Chat-Komprimierungs-Checkpoints wieder her, bevor der neue Prompt gesendet wird.

## Den Haupt-Sitzungs-Prompt anpassen

Du kannst den System-Prompt der Hauptsitzung für einen einzelnen CLI-Lauf ändern, ohne gemeinsam genutzte Speicherdateien zu bearbeiten.

### Den integrierten System-Prompt überschreiben

Verwende `--system-prompt`, um den integrierten Hauptsitzungs-Prompt von Qwen Code für den aktuellen Lauf zu ersetzen:

```bash
qwen -p "Review this patch" --system-prompt "You are a terse release reviewer. Report only blocking issues."
```

### Zusätzliche Anweisungen anhängen

Verwende `--append-system-prompt`, um den integrierten Prompt beizubehalten und zusätzliche Anweisungen für diesen Lauf hinzuzufügen:

```bash
qwen -p "Review this patch" --append-system-prompt "Be terse and focus on concrete findings."
```

Du kannst beide Flags kombinieren, wenn du einen benutzerdefinierten Basis-Prompt zusammen mit einer zusätzlichen laufspezifischen Anweisung verwenden möchtest:

```bash
qwen -p "Summarize this repository" \
  --system-prompt "You are a migration planner." \
  --append-system-prompt "Return exactly three bullets."
```

> [!note]
>
> - `--system-prompt` gilt nur für die Hauptsitzung des aktuellen Laufs.
> - Geladene Speicher- und Kontextdateien wie `QWEN.md` werden weiterhin nach `--system-prompt` angehängt.
> - `--append-system-prompt` wird nach dem integrierten Prompt und dem geladenen Speicher angewendet und kann zusammen mit `--system-prompt` verwendet werden.

## Ausgabeformate

Qwen Code unterstützt mehrere Ausgabeformate für verschiedene Anwendungsfälle:

### Textausgabe (Standard)

Standardmäßige, für Menschen lesbare Ausgabe:

```bash
qwen -p "What is the capital of France?"
```

Antwortformat:

```
The capital of France is Paris.
```

### JSON-Ausgabe

Gibt strukturierte Daten als JSON-Array zurück. Alle Nachrichten werden gepuffert und bei Abschluss der Sitzung gemeinsam ausgegeben. Dieses Format ist ideal für die programmatische Verarbeitung und Automatisierungsskripte.

Die JSON-Ausgabe ist ein Array von Nachrichtenobjekten. Die Ausgabe umfasst mehrere Nachrichtentypen: Systemnachrichten (Sitzungsinitialisierung), Assistant-Nachrichten (KI-Antworten) und Ergebnisnachrichten (Ausführungszusammenfassung).

#### Beispielverwendung

```bash
qwen -p "What is the capital of France?" --output-format json
```

Ausgabe (am Ende der Ausführung):

```json
[
  {
    "type": "system",
    "subtype": "session_start",
    "uuid": "...",
    "session_id": "...",
    "model": "qwen3-coder-plus",
    ...
  },
  {
    "type": "assistant",
    "uuid": "...",
    "session_id": "...",
    "message": {
      "id": "...",
      "type": "message",
      "role": "assistant",
      "model": "qwen3-coder-plus",
      "content": [
        {
          "type": "text",
          "text": "The capital of France is Paris."
        }
      ],
      "usage": {...}
    },
    "parent_tool_use_id": null
  },
  {
    "type": "result",
    "subtype": "success",
    "uuid": "...",
    "session_id": "...",
    "is_error": false,
    "duration_ms": 1234,
    "result": "The capital of France is Paris.",
    "usage": {...}
  }
]
```

### Stream-JSON-Ausgabe

Das Stream-JSON-Format gibt JSON-Nachrichten sofort aus, wenn sie während der Ausführung auftreten, und ermöglicht so das Monitoring in Echtzeit. Dieses Format verwendet zeilenbegrenztes JSON (line-delimited JSON), wobei jede Nachricht ein vollständiges JSON-Objekt in einer einzigen Zeile ist.

```bash
qwen -p "Explain TypeScript" --output-format stream-json
```

Ausgabe (Streaming beim Auftreten von Events):

```json
{"type":"system","subtype":"session_start","uuid":"...","session_id":"..."}
{"type":"assistant","uuid":"...","session_id":"...","message":{...}}
{"type":"result","subtype":"success","uuid":"...","session_id":"..."}
```

In Kombination mit `--include-partial-messages` werden zusätzliche Stream-Events in Echtzeit (message_start, content_block_delta, etc.) für UI-Updates in Echtzeit ausgegeben.

```bash
qwen -p "Write a Python script" --output-format stream-json --include-partial-messages
```

### Eingabeformat

Der Parameter `--input-format` steuert, wie Qwen Code Eingaben von der Standardeingabe verarbeitet:

- **`text`** (Standard): Standard-Texteingabe von stdin oder Befehlszeilenargumenten
- **`stream-json`**: JSON-Nachrichtenprotokoll über stdin für bidirektionale Kommunikation

> **Hinweis:** Der Stream-JSON-Eingabemodus befindet sich derzeit in der Entwicklung und ist für die SDK-Integration vorgesehen. Er erfordert, dass `--output-format stream-json` gesetzt ist.

### Dateiumleitung

Speichere die Ausgabe in Dateien oder leite sie an andere Befehle weiter:

```bash
# Save to file
qwen -p "Explain Docker" > docker-explanation.txt
qwen -p "Explain Docker" --output-format json > docker-explanation.json

# Append to file
qwen -p "Add more details" >> docker-explanation.txt

# Pipe to other tools
qwen -p "What is Kubernetes?" --output-format json | jq '.response'
qwen -p "Explain microservices" | wc -w
qwen -p "List programming languages" | grep -i "python"

# Stream-JSON output for real-time processing
qwen -p "Explain Docker" --output-format stream-json | jq '.type'
qwen -p "Write code" --output-format stream-json --include-partial-messages | jq '.event.type'
```

## Konfigurationsoptionen

Wichtige Befehlszeilenoptionen für die Headless-Nutzung:

| Option                       | Beschreibung                                                                                                                                                                                                                                                                                                                                                                                                                    | Beispiel                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `--prompt`, `-p`             | Ausführung im Headless-Modus                                                                                                                                                                                                                                                                                                                                                                                                   | `qwen -p "query"`                                                        |
| `--output-format`, `-o`      | Ausgabeformat festlegen (text, json, stream-json)                                                                                                                                                                                                                                                                                                                                                                                | `qwen -p "query" --output-format json`                                   |
| `--input-format`             | Eingabeformat festlegen (text, stream-json)                                                                                                                                                                                                                                                                                                                                                                                       | `qwen --input-format text --output-format stream-json`                   |
| `--include-partial-messages` | Teilnachrichten in der Stream-JSON-Ausgabe einschließen                                                                                                                                                                                                                                                                                                                                                                                 | `qwen -p "query" --output-format stream-json --include-partial-messages` |
| `--system-prompt`            | System-Prompt der Hauptsitzung für diesen Lauf überschreiben                                                                                                                                                                                                                                                                                                                                                                           | `qwen -p "query" --system-prompt "You are a terse reviewer."`            |
| `--append-system-prompt`     | Zusätzliche Anweisungen an den System-Prompt der Hauptsitzung für diesen Lauf anhängen                                                                                                                                                                                                                                                                                                                                                       | `qwen -p "query" --append-system-prompt "Focus on concrete findings."`   |
| `--debug`, `-d`              | Debug-Modus aktivieren                                                                                                                                                                                                                                                                                                                                                                                                              | `qwen -p "query" --debug`                                                |
| `--safe-mode`                | Deaktiviert alle Anpassungen – Kontextdateien, Hooks, Erweiterungen, Skills, MCP-Server, benutzerdefinierte Subagenten (nur integrierte Subagenten werden geladen), Berechtigungsregeln, aus Einstellungen stammende Approval-Mode-Überschreibungen, Speicherfunktionen und Sandbox-Einstellungen –, um Probleme zu isolieren; die CLI-Flags `--yolo` und `--approval-mode` bleiben wirksam. Siehe [Troubleshooting](../support/troubleshooting). Kann auch über `QWEN_CODE_SAFE_MODE=true` gesetzt werden. | `qwen -p "query" --safe-mode`                                            |
| `--all-files`, `-a`          | Alle Dateien in den Kontext einbeziehen                                                                                                                                                                                                                                                                                                                                                                                                   | `qwen -p "query" --all-files`                                            |
| `--include-directories`      | Zusätzliche Verzeichnisse einbeziehen                                                                                                                                                                                                                                                                                                                                                                                                 | `qwen -p "query" --include-directories src,docs`                         |
| `--yolo`, `-y`               | Alle Aktionen automatisch genehmigen                                                                                                                                                                                                                                                                                                                                                                                                       | `qwen -p "query" --yolo`                                                 |
| `--approval-mode`            | Approval-Modus festlegen                                                                                                                                                                                                                                                                                                                                                                                                              | `qwen -p "query" --approval-mode auto_edit`                              |
| `--continue`                 | Die neueste Sitzung für dieses Projekt fortsetzen                                                                                                                                                                                                                                                                                                                                                                                | `qwen --continue -p "Pick up where we left off"`                         |
| `--resume [sessionId]`       | Eine bestimmte Sitzung fortsetzen (oder interaktiv auswählen)                                                                                                                                                                                                                                                                                                                                                                            | `qwen --resume 123e... -p "Finish the refactor"`                         |
| `--max-session-turns`        | Begrenzt die Anzahl der User/Model/Tool-Turns im Lauf                                                                                                                                                                                                                                                                                                                                                                             | `qwen -p "..." --max-session-turns 30`                                   |
| `--max-wall-time`            | Wall-Clock-Budget; akzeptiert `90` (s), `30s`, `5m`, `1h`, `1.5h`                                                                                                                                                                                                                                                                                                                                                                 | `qwen -p "..." --max-wall-time 10m`                                      |
| `--max-tool-calls`           | Kumulatives Tool-Call-Budget für den Lauf                                                                                                                                                                                                                                                                                                                                                                                        | `qwen -p "..." --max-tool-calls 50`                                      |

Ausführliche Details zu allen verfügbaren Konfigurationsoptionen, Einstellungsdateien und Umgebungsvariablen findest du im [Konfigurationsleitfaden](../configuration/settings).

## Sicherheit bei unbeaufsichtigten Ausführungen

Headless-/CI-Ausführungen in Kombination mit `--yolo` (oder `--approval-mode=yolo`) genehmigen jeden Tool-Aufruf automatisch, einschließlich `shell`, `write` und `edit`. **`--yolo` aktiviert keine Sandbox** – diese Tools werden mit den Berechtigungen des Host-Prozesses ausgeführt. Wenn Qwen Code diese Kombination ohne konfigurierte Sandbox erkennt, gibt es beim Start eine einzeilige Warnung auf stderr aus. Unterdrücke die Warnung mit `QWEN_CODE_SUPPRESS_YOLO_WARNING=1`, sobald du die Kompromisse abgewogen hast.

### Budgets auf Laufebene

Qwen Code kann eine unbeaufsichtigte Ausführung abbrechen, wenn einer der folgenden Schwellenwerte überschritten wird. Jeder ist standardmäßig auf `-1` (unbegrenzt) gesetzt; das Setzen eines einzigen Wertes reicht aus, um Durchbrennen zu verhindern. Sie werden kooperativ gegen denselben `AbortController` durchgesetzt, der bereits SIGINT trägt, sodass ein Budget-Abbruch einen strukturierten `FatalBudgetExceededError` (Exit-Code **55**) ausgibt – unterscheidbar vom Turn-Cap-Exit-Code 53 und dem SIGINT-Code 130, damit CI-Skripte je nach Grund verzweigen können.

| Flag                  | Settings key               | Was es begrenzt                                                                                                                                                                                                |
| --------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--max-wall-time`     | `model.maxWallTimeSeconds` | Wall-Clock-Dauer des gesamten Laufs. Flag akzeptiert `90` (s), `30s`, `5m`, `1h`, `1.5h` (fraktionale Einheiten unterstützt). Minimum 1s – sub-sekundäre Werte werden als Tippfehler abgelehnt. Einstellung ist in Sekunden.               |
| `--max-tool-calls`    | `model.maxToolCalls`       | Kumulative Top-Level-Tool-Calls, die von der Haupt-Laufschleife dispatched werden (zählt Erfolge _und_ Fehler – das Modell verbraucht auch bei Fehlern Tokens). Siehe "Geltungsbereich" unten für Ausnahmen bei Subagenten / strukturierter Ausgabe. |
| `--max-session-turns` | `model.maxSessionTurns`    | Anzahl der User/Model/Tool-Turns; bereits vorhanden. Beendet sich bei Überschreitung mit Code 53 (unterscheidbar vom Budget-Exit 55).                                                                                                  |

#### Geltungsbereich

- **`--max-tool-calls` zählt nur Top-Level-Dispatches.** Wenn das Modell das `agent`-Tool aufruft, zählt der Dispatch als **1**; innere Tool-Calls, die vom erzeugten Subagenten ausgeführt werden, werden **nicht** gezählt. Ein Modell, das Arbeit durch Subagenten leitet, kann unbegrenzte innere Arbeit mit einem kleinen Top-Level-Budget verrichten. Kombiniere es mit `--exclude-tools agent`, wenn du eine strengere Begrenzung benötigst.
- **`structured_output` ist von `--max-tool-calls` ausgenommen.** Unter `--json-schema` ist der terminale `structured_output`-Call des Modells der "Ich bin fertig"-Vertrag, keine echte Arbeit – er wird nicht auf `--max-tool-calls` angerechnet, sodass ein Abschluss am Budget-Rand nicht als False Positive abgebrochen wird. Die Ausnahme ist bedingungslos (einschließlich fehlgeschlagener Ajv-Validierungen), sodass ein Modell, das in einer Retry-Schleife für fehlerhafte Ausgaben steckt, **nicht** durch `--max-tool-calls` begrenzt wird; kombiniere es mit `--max-session-turns` oder `--max-wall-time`, um Retries zu begrenzen.
- **`structured_output` ist NICHT von `--max-session-turns` ausgenommen.** Dieser Zähler ist bereits vorhanden und wird für jeden Turn erhöht, einschließlich des terminalen Vertrags. Setze `--max-session-turns` auf `N+1`, wenn du `N` echte Arbeits-Turns unter `--json-schema` zulassen möchtest.
- **Single-Shot vs. `--input-format stream-json`:** Im Stream-JSON-Eingabemodus setzt der Daemon die Budget-Zähler zu Beginn jeder User-Nachricht zurück; das Budget gilt pro Nachricht, nicht pro Prozess.
- **`qwen serve` / ACP-Sitzungen:** Der Daemon-ACP-Sitzungspfad berücksichtigt derzeit NICHT `--max-wall-time` / `--max-tool-calls` aus der settings.json. Diese Budgets gelten nur für Single-Shot-`qwen -p`-Ausführungen und `--input-format stream-json`-Sitzungen. (`qwen serve` gibt beim Booten die YOLO-ohne-Sandbox-Warnung aus, wenn `tools.approvalMode: 'yolo'` in den Einstellungen gesetzt ist.)
### Empfohlene Kombinationen

- **Vertrauenswürdige, isolierte Umgebung (kurzlebiger CI-Runner, Container):** `qwen -p "..." --yolo --max-session-turns N --max-wall-time 10m --output-format json`. Lege ein Turn-Budget und ein Zeitbudget fest, damit ein hängengebliebener Agent nicht deine CI-Minuten verbraucht, und nutze `--output-format json` für die Post-Run-Nutzung und das Tool-Call-Auditing.
- **Lokaler Rechner oder Shared Infrastructure:** Übergib zusätzlich `--sandbox` (oder setze `QWEN_SANDBOX=1`), damit Shell-/Write-/Edit-Tools innerhalb des Sandbox-Images ausgeführt werden.
- **Langlaufende CI mit Retry-on-Rate-Limit:** Kombiniere `QWEN_CODE_UNATTENDED_RETRY=1` mit `--max-wall-time`. Die Retry-Umgebung hält den Run bei vorübergehenden 429 / 529 Responses am Leben; das Zeitbudget stellt sicher, dass ein dauerhaft fehlschlagender Provider den Job nicht unbegrenzt verlängern kann.
- **Begrenztes Auditing / Exploration:** Für Read-Only-Tasks begrenzt `--max-tool-calls 25`, wie aggressiv das Modell grep / read nutzen kann. Kombiniere dies mit `--exclude-tools shell,write,edit`, um die Begrenzung wirksam zu machen.

## Beispiele

### Code Review

```bash
cat src/auth.py | qwen -p "Review this authentication code for security issues" > security-review.txt
```

### Commit-Messages generieren

```bash
result=$(git diff --cached | qwen -p "Write a concise commit message for these changes" --output-format json)
echo "$result" | jq -r '.response'
```

### API-Dokumentation

```bash
result=$(cat api/routes.js | qwen -p "Generate OpenAPI spec for these routes" --output-format json)
echo "$result" | jq -r '.response' > openapi.json
```

### Batch-Code-Analyse

```bash
for file in src/*.py; do
    echo "Analyzing $file..."
    result=$(cat "$file" | qwen -p "Find potential bugs and suggest improvements" --output-format json)
    echo "$result" | jq -r '.response' > "reports/$(basename "$file").analysis"
    echo "Completed analysis for $(basename "$file")" >> reports/progress.log
done
```

### PR Code Review

```bash
result=$(git diff origin/main...HEAD | qwen -p "Review these changes for bugs, security issues, and code quality" --output-format json)
echo "$result" | jq -r '.response' > pr-review.json
```

### Log-Analyse

```bash
grep "ERROR" /var/log/app.log | tail -20 | qwen -p "Analyze these errors and suggest root cause and fixes" > error-analysis.txt
```

### Generierung von Release Notes

```bash
result=$(git log --oneline v1.0.0..HEAD | qwen -p "Generate release notes from these commits" --output-format json)
response=$(echo "$result" | jq -r '.response')
echo "$response"
echo "$response" >> CHANGELOG.md
```

### Tracking der Model- und Tool-Nutzung

```bash
result=$(qwen -p "Explain this database schema" --include-directories db --output-format json)
total_tokens=$(echo "$result" | jq -r '.stats.models // {} | to_entries | map(.value.tokens.total) | add // 0')
models_used=$(echo "$result" | jq -r '.stats.models // {} | keys | join(", ") | if . == "" then "none" else . end')
tool_calls=$(echo "$result" | jq -r '.stats.tools.totalCalls // 0')
tools_used=$(echo "$result" | jq -r '.stats.tools.byName // {} | keys | join(", ") | if . == "" then "none" else . end')
echo "$(date): $total_tokens tokens, $tool_calls tool calls ($tools_used) used with models: $models_used" >> usage.log
echo "$result" | jq -r '.response' > schema-docs.md
echo "Recent usage trends:"
tail -5 usage.log
```

## Persistenter Retry-Modus

Wenn Qwen Code in CI/CD-Pipelines oder als Hintergrund-Daemon läuft, sollte ein kurzer API-Ausfall (Rate Limiting oder Überlastung) keine mehrstündige Aufgabe abbrechen. **Persistenter Retry-Modus** sorgt dafür, dass Qwen Code vorübergehende API-Fehler unbegrenzt wiederholt, bis der Dienst wiederhergestellt ist.

### Funktionsweise

- **Nur vorübergehende Fehler**: HTTP 429 (Rate Limit) und 529 (Overloaded) werden unbegrenzt wiederholt. Andere Fehler (400, 500 usw.) schlagen weiterhin normal fehl.
- **Exponentielles Backoff mit Obergrenze**: Die Retry-Verzögerungen wachsen exponentiell, sind aber auf **5 Minuten** pro Retry begrenzt.
- **Heartbeat-Keepalive**: Während langer Wartezeiten wird alle **30 Sekunden** eine Statuszeile auf stderr ausgegeben, um zu verhindern, dass CI-Runner den Prozess wegen Inaktivität beenden.
- **Graceful Degradation**: Nicht-vorübergehende Fehler und der interaktive Modus bleiben völlig unberührt.

### Aktivierung

Setze die Umgebungsvariable `QWEN_CODE_UNATTENDED_RETRY` auf `true` oder `1` (strikte Übereinstimmung, case-sensitive):

```bash
export QWEN_CODE_UNATTENDED_RETRY=1
```

> [!important]
> Persistenter Retry erfordert ein **explizites Opt-in**. `CI=true` allein aktiviert es **nicht** – einen schnell fehlschlagenden CI-Job stillschweigend in einen unbegrenzt wartenden Job zu verwandeln, wäre gefährlich. Setze `QWEN_CODE_UNATTENDED_RETRY` in deiner Pipeline-Konfiguration immer explizit.

### Beispiele

#### GitHub Actions

```yaml
- name: Automated code review
  env:
    QWEN_CODE_UNATTENDED_RETRY: '1'
  run: |
    qwen -p "Review all files in src/ for security issues" \
      --output-format json \
      --yolo > review.json
```

#### Nächtliche Batch-Verarbeitung

```bash
export QWEN_CODE_UNATTENDED_RETRY=1
qwen -p "Migrate all callback-style functions to async/await in src/" --yolo
```

#### Hintergrund-Daemon

```bash
QWEN_CODE_UNATTENDED_RETRY=1 nohup qwen -p "Audit all dependencies for known CVEs" \
  --output-format json > audit.json 2> audit.log &
```

### Monitoring

Während des persistenten Retrys werden Heartbeat-Nachrichten auf **stderr** ausgegeben:

```
[qwen-code] Waiting for API capacity... attempt 3, retry in 45s
[qwen-code] Waiting for API capacity... attempt 3, retry in 15s
```

Diese Nachrichten halten CI-Runner am Leben und ermöglichen dir die Überwachung des Fortschritts. Sie erscheinen nicht in stdout, sodass die an andere Tools weitergeleitete JSON-Ausgabe sauber bleibt.

## Ressourcen

- [CLI Configuration](../configuration/settings#command-line-arguments) - Vollständiger Konfigurationsleitfaden
- [Authentication](../configuration/auth.md) - Authentifizierung einrichten
- [Commands](../features/commands) - Referenz für interaktive Befehle
- [Tutorials](../quickstart) - Schritt-für-Schritt-Anleitungen zur Automatisierung