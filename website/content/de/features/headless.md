```markdown
# Headless Mode

Der Headless Mode ermöglicht es dir, Qwen Code programmatisch über Command Line
Scripts und Automation Tools ohne interaktive UI auszuführen. Das ist ideal für
Scripting, Automatisierung, CI/CD Pipelines und den Aufbau KI-gestützter Tools.

- [Headless Mode](#headless-mode)
  - [Überblick](#überblick)
  - [Grundlegende Verwendung](#grundlegende-verwendung)
    - [Direkte Prompts](#direkte-prompts)
    - [Stdin Eingabe](#stdin-eingabe)
    - [Kombination mit Dateieingabe](#kombination-mit-dateieingabe)
  - [Ausgabeformate](#ausgabeformate)
    - [Text Ausgabe (Standard)](#text-ausgabe-standard)
    - [JSON Ausgabe](#json-ausgabe)
      - [Beispielverwendung](#beispielverwendung)
    - [Stream-JSON Ausgabe](#stream-json-ausgabe)
    - [Eingabeformat](#eingabeformat)
    - [Dateiumleitung](#dateiumleitung)
  - [Konfigurationsoptionen](#konfigurationsoptionen)
  - [Beispiele](#beispiele)
    - [Code Review](#code-review)
    - [Commit Messages generieren](#commit-messages-generieren)
    - [API Dokumentation](#api-dokumentation)
    - [Batch Code Analyse](#batch-code-analyse)
    - [PR Code Review](#pr-code-review)
    - [Log Analyse](#log-analyse)
    - [Release Notes Generierung](#release-notes-generierung)
    - [Modell- und Tool-Nutzungsverfolgung](#modell--und-tool-nutzungsverfolgung)
  - [Ressourcen](#ressourcen)
```

## Übersicht

Der Headless-Modus bietet eine Headless-Schnittstelle für Qwen Code, die folgende Funktionen bereitstellt:

- Akzeptiert Prompts über Kommandozeilenargumente oder stdin
- Gibt strukturierte Ausgaben zurück (Text oder JSON)
- Unterstützt File Redirection und Piping
- Ermöglicht Automatisierung und Scripting-Workflows
- Stellt konsistente Exit-Codes für die Fehlerbehandlung bereit

## Grundlegende Verwendung

### Direkte Prompts

Verwende das Flag `--prompt` (oder `-p`), um den Headless-Modus zu starten:

```bash
qwen --prompt "Was ist Machine Learning?"
```

### Stdin-Eingabe

Übergib Eingaben von deinem Terminal an Qwen Code:

```bash
echo "Erkläre diesen Code" | qwen
```

### Kombination mit Dateieingabe

Lese aus Dateien und verarbeite sie mit Qwen Code:

```bash
cat README.md | qwen --prompt "Fasse diese Dokumentation zusammen"
```

## Ausgabeformate

Qwen Code unterstützt mehrere Ausgabeformate für verschiedene Anwendungsfälle:

### Textausgabe (Standard)

Standardmäßige menschenlesbare Ausgabe:

```bash
qwen -p "Was ist die Hauptstadt von Frankreich?"
```

Antwortformat:

```
Die Hauptstadt von Frankreich ist Paris.
```

### JSON Output

Gibt strukturierte Daten als JSON-Array zurück. Alle Nachrichten werden zwischengespeichert und gemeinsam ausgegeben, wenn die Sitzung abgeschlossen ist. Dieses Format eignet sich ideal für die programmatische Verarbeitung und Automatisierungsskripte.

Die JSON-Ausgabe ist ein Array von Nachrichtenobjekten. Die Ausgabe umfasst mehrere Nachrichtentypen: Systemnachrichten (Initialisierung der Sitzung), Assistant-Nachrichten (KI-Antworten) und Ergebnisnachrichten (Ausführungsübersicht).

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

### Stream-JSON Output

Das Stream-JSON-Format gibt JSON-Nachrichten sofort aus, sobald sie während der Ausführung auftreten, und ermöglicht so eine Echtzeitüberwachung. Dieses Format verwendet zeilenbasiertes JSON, bei dem jede Nachricht ein vollständiges JSON-Objekt in einer einzelnen Zeile darstellt.

```bash
qwen -p "Explain TypeScript" --output-format stream-json
```

Ausgabe (Streaming bei Auftreten der Ereignisse):

```json
{"type":"system","subtype":"session_start","uuid":"...","session_id":"..."}
{"type":"assistant","uuid":"...","session_id":"...","message":{...}}
{"type":"result","subtype":"success","uuid":"...","session_id":"..."}
```

In Kombination mit `--include-partial-messages` werden zusätzliche Stream-Ereignisse in Echtzeit ausgegeben (message_start, content_block_delta, etc.), um Echtzeit-UI-Updates zu ermöglichen.

```bash
qwen -p "Write a Python script" --output-format stream-json --include-partial-messages
```

### Eingabeformat

Der Parameter `--input-format` steuert, wie Qwen Code die Eingabe über Standard Input verarbeitet:

- **`text`** (Standard): Normale Texteingabe über stdin oder Kommandozeilenargumente
- **`stream-json`**: JSON-Nachrichtenprotokoll über stdin für bidirektionale Kommunikation

> **Hinweis:** Der Modus `stream-json` ist derzeit noch in Entwicklung und für die Integration mit SDKs gedacht. Er erfordert die Angabe von `--output-format stream-json`.

### Dateiumleitung

Ausgabe in Dateien speichern oder an andere Befehle weiterleiten:

```bash

# In Datei speichern
qwen -p "Erkläre Docker" > docker-explanation.txt
qwen -p "Erkläre Docker" --output-format json > docker-explanation.json

# An Datei anhängen
qwen -p "Füge mehr Details hinzu" >> docker-explanation.txt

# An andere Tools weiterleiten (Piping)
qwen -p "Was ist Kubernetes?" --output-format json | jq '.response'
qwen -p "Erkläre Microservices" | wc -w
qwen -p "Liste Programmiersprachen auf" | grep -i "python"
```

# Stream-JSON-Ausgabe für Echtzeitverarbeitung
qwen -p "Erkläre Docker" --output-format stream-json | jq '.type'
qwen -p "Schreibe Code" --output-format stream-json --include-partial-messages | jq '.event.type'
```

## Konfigurationsoptionen

Wichtige Kommandozeilenoptionen für die headless-Nutzung:

| Option                       | Beschreibung                                      | Beispiel                                                                 |
| ---------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------ |
| `--prompt`, `-p`             | Im Headless-Modus ausführen                       | `qwen -p "query"`                                                        |
| `--output-format`, `-o`      | Ausgabeformat festlegen (text, json, stream-json) | `qwen -p "query" --output-format json`                                   |
| `--input-format`             | Eingabeformat festlegen (text, stream-json)       | `qwen --input-format text --output-format stream-json`                   |
| `--include-partial-messages` | Teilnachrichten in stream-json-Ausgabe einbeziehen| `qwen -p "query" --output-format stream-json --include-partial-messages` |
| `--debug`, `-d`              | Debug-Modus aktivieren                            | `qwen -p "query" --debug`                                                |
| `--all-files`, `-a`          | Alle Dateien im Kontext berücksichtigen          | `qwen -p "query" --all-files`                                            |
| `--include-directories`      | Zusätzliche Verzeichnisse einbinden               | `qwen -p "query" --include-directories src,docs`                         |
| `--yolo`, `-y`               | Alle Aktionen automatisch genehmigen              | `qwen -p "query" --yolo`                                                 |
| `--approval-mode`            | Genehmigungsmodus festlegen                       | `qwen -p "query" --approval-mode auto_edit`                              |

Für vollständige Details zu allen verfügbaren Konfigurationsoptionen, Einstellungsdateien und Umgebungsvariablen, siehe [Konfigurationsanleitung](./cli/configuration.md).

## Beispiele

### Code Review

```bash
cat src/auth.py | qwen -p "Review this authentication code for security issues" > security-review.txt
```

### Commit-Nachrichten generieren

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

### Tracking der Modell- und Tool-Nutzung

```bash
result=$(qwen -p "Erkläre dieses Datenbankschema" --include-directories db --output-format json)
total_tokens=$(echo "$result" | jq -r '.stats.models // {} | to_entries | map(.value.tokens.total) | add // 0')
models_used=$(echo "$result" | jq -r '.stats.models // {} | keys | join(", ") | if . == "" then "none" else . end')
tool_calls=$(echo "$result" | jq -r '.stats.tools.totalCalls // 0')
tools_used=$(echo "$result" | jq -r '.stats.tools.byName // {} | keys | join(", ") | if . == "" then "none" else . end')
echo "$(date): $total_tokens Tokens, $tool_calls Tool-Aufrufe ($tools_used) verwendet mit Modellen: $models_used" >> usage.log
echo "$result" | jq -r '.response' > schema-docs.md
echo "Aktuelle Nutzungstrends:"
tail -5 usage.log
```

## Ressourcen

- [CLI Configuration](./cli/configuration.md) - Vollständiger Konfigurationsleitfaden
- [Authentication](./cli/authentication.md) - Authentifizierung einrichten
- [Commands](./cli/commands.md) - Interaktive Befehlsreferenz
- [Tutorials](./cli/tutorials.md) - Schritt-für-Schritt-Anleitungen zur Automatisierung