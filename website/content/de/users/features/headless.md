# Headless-Modus

Der Headless-Modus ermöglicht es Ihnen, Qwen Code programmgesteuert über Befehlszeilenskripte und Automatisierungstools auszuführen, ohne eine interaktive Benutzeroberfläche. Dies ist ideal für Skripterstellung, Automatisierung, CI/CD-Pipelines und den Aufbau KI-gestützter Tools.

## Übersicht

Der Headless-Modus bietet eine grafiklose Schnittstelle zu Qwen Code, die:

- Eingabeaufforderungen über Befehlszeilenargumente oder stdin akzeptiert
- Strukturierte Ausgabe (Text oder JSON) zurückgibt
- Dateiumleitung und Pipes unterstützt
- Automatisierungs- und Skript-Workflows ermöglicht
- Konsistente Exit-Codes für Fehlerbehandlung bereitstellt
- Die Fortsetzung vorheriger Sitzungen im Kontext des aktuellen Projekts für mehrstufige Automatisierung erlaubt

## Grundlegende Verwendung

### Direkte Eingabeaufforderungen

Verwenden Sie das Flag `--prompt` (oder `-p`), um den Headless-Modus zu aktivieren:

```bash
qwen --prompt "Was ist maschinelles Lernen?"
```

### Eingabe über stdin

Leiten Sie Eingaben über die Pipe-Funktion Ihres Terminals an Qwen Code weiter:

```bash
echo "Erkläre diesen Code" | qwen
```

### Kombination mit Dateieingabe

Lesen Sie aus Dateien und verarbeiten Sie sie mit Qwen Code:

```bash
cat README.md | qwen --prompt "Fassen Sie diese Dokumentation zusammen"
```

### Fortsetzen vorheriger Sitzungen (ohne Benutzeroberfläche)

Wiederverwenden Sie den Konversationskontext des aktuellen Projekts in Skripten ohne Benutzeroberfläche:

```bash

# Setzen Sie die neueste Sitzung für dieses Projekt fort und führen Sie eine neue Aufforderung aus
qwen --continue -p "Führen Sie die Tests erneut aus und fassen Sie die Fehler zusammen"

# Setzen Sie direkt eine bestimmte Sitzungs-ID fort (ohne Benutzeroberfläche)
qwen --resume 123e4567-e89b-12d3-a456-426614174000 -p "Führen Sie die nachfolgende Refaktorisierung durch"
```

> [!note]
>
> - Die Sitzungsdaten befinden sich im JSONL-Format pro Projekt unter `~/.qwen/projects/<bereinigtes-cwd>/chats`.
> - Der gesamte Konversationsverlauf, Tool-Ausgaben sowie Checkpoints zur Chat-Komprimierung werden wiederhergestellt, bevor die neue Aufforderung gesendet wird.

## Ausgabeformate

Qwen Code unterstützt mehrere Ausgabeformate für unterschiedliche Anwendungsfälle:

### Textausgabe (Standard)

Standardmäßige, für Menschen lesbare Ausgabe:

```bash
qwen -p "Was ist die Hauptstadt Frankreichs?"
```

Antwortformat:

```
Die Hauptstadt Frankreichs ist Paris.
```

### JSON-Ausgabe

Gibt strukturierte Daten als JSON-Array zurück. Alle Nachrichten werden zwischengespeichert und gemeinsam ausgegeben, sobald die Sitzung abgeschlossen ist. Dieses Format eignet sich ideal für programmgesteuerte Verarbeitung und Automatisierungsskripte.

Die JSON-Ausgabe ist ein Array von Nachrichtenobjekten. Die Ausgabe umfasst mehrere Nachrichtentypen: Systemnachrichten (Sitzungsinitialisierung), Assistentennachrichten (KI-Antworten) und Ergebnisnachrichten (Zusammenfassung der Ausführung).

#### Beispiel für die Verwendung

```bash
qwen -p "Was ist die Hauptstadt Frankreichs?" --output-format json
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
          "text": "Die Hauptstadt Frankreichs ist Paris."
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
    "result": "Die Hauptstadt Frankreichs ist Paris.",
    "usage": {...}
  }
]
```

### Stream-JSON-Ausgabe

Das Stream-JSON-Format gibt JSON-Nachrichten unmittelbar aus, sobald sie während der Ausführung auftreten, und ermöglicht so eine Echtzeitüberwachung. Dieses Format verwendet zeilengetrenntes JSON, wobei jede Nachricht ein vollständiges JSON-Objekt in einer einzelnen Zeile darstellt.

```bash
qwen -p "Erkläre TypeScript" --output-format stream-json
```

Ausgabe (Streaming bei Auftreten der Ereignisse):

```json
{"type":"system","subtype":"session_start","uuid":"...","session_id":"..."}
{"type":"assistant","uuid":"...","session_id":"...","message":{...}}
{"type":"result","subtype":"success","uuid":"...","session_id":"..."}
```

In Kombination mit `--include-partial-messages` werden zusätzliche Streaming-Ereignisse in Echtzeit ausgegeben (z. B. `message_start`, `content_block_delta`), um Benutzeroberflächen in Echtzeit zu aktualisieren.

```bash
qwen -p "Schreibe ein Python-Skript" --output-format stream-json --include-partial-messages
```

### Eingabeformat

Der Parameter `--input-format` steuert, wie Qwen Code Eingaben über die Standardeingabe verarbeitet:

- **`text`** (Standard): Normale Texteingabe über stdin oder Befehlszeilenargumente  
- **`stream-json`**: JSON-Nachrichtenprotokoll über stdin für bidirektionale Kommunikation  

> **Hinweis:** Der Stream-JSON-Eingabemodus befindet sich derzeit in der Entwicklung und ist für die Integration in SDKs vorgesehen. Er erfordert die gleichzeitige Angabe von `--output-format stream-json`.

### Datei-Umleitung

Speichern Sie die Ausgabe in Dateien oder leiten Sie sie an andere Befehle weiter:

```bash

# In einer Datei speichern
qwen -p "Erkläre Docker" > docker-erklaerung.txt
qwen -p "Erkläre Docker" --output-format json > docker-erklaerung.json

# An eine Datei anhängen
qwen -p "Füge weitere Details hinzu" >> docker-erklaerung.txt

# An andere Tools weiterleiten
qwen -p "Was ist Kubernetes?" --output-format json | jq '.response'
qwen -p "Erkläre Microservices" | wc -w
qwen -p "Liste Programmiersprachen auf" | grep -i "python"

# Stream-JSON-Ausgabe für die Echtzeitverarbeitung  
qwen -p "Erkläre Docker" --output-format stream-json | jq '.type'  
qwen -p "Schreibe Code" --output-format stream-json --include-partial-messages | jq '.event.type'

## Konfigurationsoptionen

Wichtige Befehlszeilenoptionen für die Headless-Nutzung:

| Option                       | Beschreibung                                         | Beispiel                                                                 |
| ---------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------ |
| `--prompt`, `-p`             | Ausführung im Headless-Modus                         | `qwen -p "Abfrage"`                                                      |
| `--output-format`, `-o`      | Ausgabeformat festlegen (text, json, stream-json)    | `qwen -p "Abfrage" --output-format json`                                  |
| `--input-format`             | Eingabeformat festlegen (text, stream-json)          | `qwen --input-format text --output-format stream-json`                   |
| `--include-partial-messages` | Teilnachrichten in der stream-json-Ausgabe einbeziehen | `qwen -p "Abfrage" --output-format stream-json --include-partial-messages` |
| `--debug`, `-d`              | Debug-Modus aktivieren                               | `qwen -p "Abfrage" --debug`                                              |
| `--all-files`, `-a`          | Alle Dateien in den Kontext einbeziehen              | `qwen -p "Abfrage" --all-files`                                          |
| `--include-directories`      | Zusätzliche Verzeichnisse einbeziehen                | `qwen -p "Abfrage" --include-directories src,docs`                       |
| `--yolo`, `-y`               | Automatische Genehmigung aller Aktionen              | `qwen -p "Abfrage" --yolo`                                               |
| `--approval-mode`            | Genehmigungsmodus festlegen                          | `qwen -p "Abfrage" --approval-mode auto_edit`                            |
| `--continue`                 | Fortsetzung der zuletzt verwendeten Sitzung für dieses Projekt | `qwen --continue -p "Dort weitermachen, wo wir aufgehört haben"`         |
| `--resume [sessionId]`       | Fortsetzung einer bestimmten Sitzung (oder interaktive Auswahl) | `qwen --resume 123e... -p "Refaktorierung abschließen"`                  |

Für vollständige Informationen zu allen verfügbaren Konfigurationsoptionen, Konfigurationsdateien und Umgebungsvariablen siehe die [Konfigurationsanleitung](../configuration/settings).

## Beispiele

### Code-Review

```bash
cat src/auth.py | qwen -p "Überprüfe diesen Authentifizierungscode auf Sicherheitslücken" > security-review.txt
```

### Generieren von Commit-Nachrichten

```bash
result=$(git diff --cached | qwen -p "Schreibe eine prägnante Commit-Nachricht für diese Änderungen" --output-format json)
echo "$result" | jq -r '.response'
```

### API-Dokumentation

```bash
result=$(cat api/routes.js | qwen -p "Generiere eine OpenAPI-Spezifikation für diese Routen" --output-format json)
echo "$result" | jq -r '.response' > openapi.json
```

### Batch-Code-Analyse

```bash
for file in src/*.py; do
    echo "Analysiere $file..."
    result=$(cat "$file" | qwen -p "Finde potenzielle Fehler und schlage Verbesserungen vor" --output-format json)
    echo "$result" | jq -r '.response' > "reports/$(basename "$file").analysis"
    echo "Analyse abgeschlossen für $(basename "$file")" >> reports/progress.log
done
```

### PR-Codeüberprüfung

```bash
result=$(git diff origin/main...HEAD | qwen -p "Überprüfe diese Änderungen auf Fehler, Sicherheitsprobleme und Codequalität" --output-format json)
echo "$result" | jq -r '.response' > pr-review.json
```

### Protokollanalyse

```bash
grep "ERROR" /var/log/app.log | tail -20 | qwen -p "Analysiere diese Fehler und schlage Ursachen sowie Lösungen vor" > error-analysis.txt
```

### Erstellung von Versionshinweisen

```bash
result=$(git log --oneline v1.0.0..HEAD | qwen -p "Erstelle Versionshinweise aus diesen Commits" --output-format json)
response=$(echo "$result" | jq -r '.response')
echo "$response"
echo "$response" >> CHANGELOG.md
```

### Nachverfolgung der Modell- und Tool-Nutzung

```bash
result=$(qwen -p "Erkläre dieses Datenbankschema" --include-directories db --output-format json)
total_tokens=$(echo "$result" | jq -r '.stats.models // {} | to_entries | map(.value.tokens.total) | add // 0')
models_used=$(echo "$result" | jq -r '.stats.models // {} | keys | join(", ") | if . == "" then "none" else . end')
tool_calls=$(echo "$result" | jq -r '.stats.tools.totalCalls // 0')
tools_used=$(echo "$result" | jq -r '.stats.tools.byName // {} | keys | join(", ") | if . == "" then "none" else . end')
echo "$(date): $total_tokens Token, $tool_calls Tool-Aufrufe ($tools_used) mit folgenden Modellen: $models_used" >> usage.log
echo "$result" | jq -r '.response' > schema-docs.md
echo "Aktuelle Nutzungstrends:"
tail -5 usage.log
```

## Ressourcen

- [CLI-Konfiguration](../configuration/settings#command-line-arguments) – Vollständige Konfigurationsanleitung
- [Authentifizierung](../configuration/settings#environment-variables-for-api-access) – Einrichtung der Authentifizierung
- [Befehle](../features/commands) – Referenz zu interaktiven Befehlen
- [Tutorials](../quickstart) – Schritt-für-Schritt-Anleitungen zur Automatisierung