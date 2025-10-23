# Headless Mode

Der Headless Mode ermöglicht es dir, Qwen Code programmatisch über Command Line Scripts und Automation Tools ohne interaktive UI auszuführen. Das ist ideal für Scripting, Automatisierung, CI/CD Pipelines und den Aufbau von KI-gestützten Tools.

- [Headless Mode](#headless-mode)
  - [Überblick](#überblick)
  - [Grundlegende Verwendung](#grundlegende-verwendung)
    - [Direkte Prompts](#direkte-prompts)
    - [Stdin-Eingabe](#stdin-eingabe)
    - [Kombination mit Dateieingabe](#kombination-mit-dateieingabe)
  - [Ausgabeformate](#ausgabeformate)
    - [Text-Ausgabe (Standard)](#text-ausgabe-standard)
    - [JSON-Ausgabe](#json-ausgabe)
      - [Response-Schema](#response-schema)
      - [Beispielverwendung](#beispielverwendung)
    - [Dateiumleitung](#dateiumleitung)
  - [Konfigurationsoptionen](#konfigurationsoptionen)
  - [Beispiele](#beispiele)
    - [Code Review](#code-review)
    - [Commit Messages generieren](#generate-commit-messages)
    - [API-Dokumentation](#api-documentation)
    - [Batch Code-Analyse](#batch-code-analysis)
    - [Code Review](#code-review-1)
    - [Log-Analyse](#log-analysis)
    - [Release Notes Generierung](#release-notes-generation)
    - [Tracking von Modell- und Tool-Nutzung](#model-and-tool-usage-tracking)
  - [Ressourcen](#ressourcen)

## Übersicht

Der Headless-Modus bietet eine Headless-Schnittstelle für Qwen Code, die folgende Funktionen bereitstellt:

- Akzeptiert Prompts über Kommandozeilenargumente oder stdin
- Gibt strukturierte Ausgaben zurück (Text oder JSON)
- Unterstützt File Redirection und Piping
- Ermöglicht Automatisierung und Scripting-Workflows
- Stellt konsistente Exit-Codes zur Fehlerbehandlung bereit

## Grundlegende Verwendung

### Direkte Prompts

Verwende das Flag `--prompt` (oder `-p`), um im Headless-Modus zu starten:

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

Gibt strukturierte Daten zurück, einschließlich Response, Statistiken und Metadaten. Dieses Format ist ideal für die programmatische Verarbeitung und Automatisierungsskripte.

#### Response Schema

Die JSON-Ausgabe folgt dieser High-Level-Struktur:

```json
{
  "response": "string", // Der Hauptinhalt, der von der KI generiert wurde und deine Anfrage beantwortet
  "stats": {
    // Nutzungsstatistiken und Leistungsdaten
    "models": {
      // Pro-Modell API- und Token-Nutzungsstatistiken
      "[model-name]": {
        "api": {
          /* Anzahl der Requests, Fehler, Latenz */
        },
        "tokens": {
          /* Anzahl der Prompt-, Response-, Cached- und Gesamt-Tokens */
        }
      }
    },
    "tools": {
      // Statistiken zur Tool-Ausführung
      "totalCalls": "number",
      "totalSuccess": "number",
      "totalFail": "number",
      "totalDurationMs": "number",
      "totalDecisions": {
        /* Anzahl von accept, reject, modify, auto_accept */
      },
      "byName": {
        /* Detaillierte Statistiken pro Tool */
      }
    },
    "files": {
      // Statistiken zu Dateiänderungen
      "totalLinesAdded": "number",
      "totalLinesRemoved": "number"
    }
  },
  "error": {
    // Nur vorhanden, wenn ein Fehler aufgetreten ist
    "type": "string", // Fehlertyp (z. B. "ApiError", "AuthError")
    "message": "string", // Menschlich lesbare Fehlerbeschreibung
    "code": "number" // Optionaler Fehlercode
  }
}
```

#### Beispielverwendung

```bash
qwen -p "What is the capital of France?" --output-format json
```

Antwort:

```json
{
  "response": "The capital of France is Paris.",
  "stats": {
    "models": {
      "qwen3-coder-plus": {
        "api": {
          "totalRequests": 2,
          "totalErrors": 0,
          "totalLatencyMs": 5053
        },
        "tokens": {
          "prompt": 24939,
          "candidates": 20,
          "total": 25113,
          "cached": 21263,
          "thoughts": 154,
          "tool": 0
        }
      }
    },
    "tools": {
      "totalCalls": 1,
      "totalSuccess": 1,
      "totalFail": 0,
      "totalDurationMs": 1881,
      "totalDecisions": {
        "accept": 0,
        "reject": 0,
        "modify": 0,
        "auto_accept": 1
      },
      "byName": {
        "google_web_search": {
          "count": 1,
          "success": 1,
          "fail": 0,
          "durationMs": 1881,
          "decisions": {
            "accept": 0,
            "reject": 0,
            "modify": 0,
            "auto_accept": 1
          }
        }
      }
    },
    "files": {
      "totalLinesAdded": 0,
      "totalLinesRemoved": 0
    }
  }
}
```

### File Redirection

Speichere die Ausgabe in Dateien oder leite sie an andere Befehle weiter:

```bash

# In Datei speichern
qwen -p "Explain Docker" > docker-explanation.txt
qwen -p "Explain Docker" --output-format json > docker-explanation.json

# An Datei anhängen
qwen -p "Add more details" >> docker-explanation.txt

# An andere Tools weiterleiten (pipe)
qwen -p "What is Kubernetes?" --output-format json | jq '.response'
qwen -p "Explain microservices" | wc -w
qwen -p "List programming languages" | grep -i "python"
```

## Konfigurationsoptionen

Wichtige Kommandozeilenoptionen für die headless-Nutzung:

| Option                  | Beschreibung                          | Beispiel                                         |
| ----------------------- | ------------------------------------- | ------------------------------------------------ |
| `--prompt`, `-p`        | Im headless-Modus ausführen           | `qwen -p "query"`                                |
| `--output-format`       | Ausgabeformat festlegen (text, json)  | `qwen -p "query" --output-format json`           |
| `--model`, `-m`         | Qwen-Modell angeben                   | `qwen -p "query" -m qwen3-coder-plus`            |
| `--debug`, `-d`         | Debug-Modus aktivieren                | `qwen -p "query" --debug`                        |
| `--all-files`, `-a`     | Alle Dateien im Kontext einbeziehen   | `qwen -p "query" --all-files`                    |
| `--include-directories` | Zusätzliche Verzeichnisse einbinden   | `qwen -p "query" --include-directories src,docs` |
| `--yolo`, `-y`          | Alle Aktionen automatisch genehmigen  | `qwen -p "query" --yolo`                         |
| `--approval-mode`       | Genehmigungsmodus festlegen           | `qwen -p "query" --approval-mode auto_edit`      |

Für vollständige Details zu allen verfügbaren Konfigurationsoptionen, Einstellungsdateien und Umgebungsvariablen, siehe [Konfigurationsanleitung](./cli/configuration.md).

## Beispiele

#### Code Review

```bash
cat src/auth.py | qwen -p "Review this authentication code for security issues" > security-review.txt
```

#### Commit-Nachrichten generieren

```bash
result=$(git diff --cached | qwen -p "Write a concise commit message for these changes" --output-format json)
echo "$result" | jq -r '.response'
```

#### API-Dokumentation

```bash
result=$(cat api/routes.js | qwen -p "Generate OpenAPI spec for these routes" --output-format json)
echo "$result" | jq -r '.response' > openapi.json
```

#### Batch-Code-Analyse

```bash
for file in src/*.py; do
    echo "Analyzing $file..."
    result=$(cat "$file" | qwen -p "Find potential bugs and suggest improvements" --output-format json)
    echo "$result" | jq -r '.response' > "reports/$(basename "$file").analysis"
    echo "Completed analysis for $(basename "$file")" >> reports/progress.log
done
```

#### Code Review

```bash
result=$(git diff origin/main...HEAD | qwen -p "Review these changes for bugs, security issues, and code quality" --output-format json)
echo "$result" | jq -r '.response' > pr-review.json
```

#### Log-Analyse

```bash
grep "ERROR" /var/log/app.log | tail -20 | qwen -p "Analyze these errors and suggest root cause and fixes" > error-analysis.txt
```

#### Generierung von Release Notes

```bash
result=$(git log --oneline v1.0.0..HEAD | qwen -p "Generate release notes from these commits" --output-format json)
response=$(echo "$result" | jq -r '.response')
echo "$response"
echo "$response" >> CHANGELOG.md
```

#### Tracking der Modell- und Tool-Nutzung

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

## Ressourcen

- [CLI Configuration](./cli/configuration.md) - Vollständiger Konfigurationsleitfaden
- [Authentication](./cli/authentication.md) - Authentifizierung einrichten
- [Commands](./cli/commands.md) - Interaktive Commands-Referenz
- [Tutorials](./cli/tutorials.md) - Schritt-für-Schritt-Anleitungen zur Automatisierung