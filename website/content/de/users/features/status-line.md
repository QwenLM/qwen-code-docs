# Statuszeile

> Zeige benutzerdefinierte Informationen in der Fußzeile mithilfe eines Shell-Befehls an.

Mit der Statuszeile kannst du einen Shell-Befehl ausführen, dessen Ausgabe im linken Bereich der Fußzeile angezeigt wird. Der Befehl erhält strukturierten JSON-Kontext über stdin und kann so sitzungsbezogene Informationen wie das aktuelle Modell, die Token-Nutzung, den Git-Branch oder beliebige andere skriptbare Daten anzeigen.

```
With status line (default approval mode — 1 row):
┌─────────────────────────────────────────────────────────────────┐
│  user@host ~/project (main) ctx:34%   🔒 docker | Debug | 67%  │  ← status line
└─────────────────────────────────────────────────────────────────┘

With status line + non-default mode (2 rows):
┌─────────────────────────────────────────────────────────────────┐
│  user@host ~/project (main) ctx:34%   🔒 docker | Debug | 67%  │  ← status line
│  auto-accept edits (shift + tab to cycle)                       │  ← mode indicator
└─────────────────────────────────────────────────────────────────┘
```

Sobald konfiguriert, ersetzt die Statuszeile den Standardhinweis „? for shortcuts“. Nachrichten mit hoher Priorität (Beenden-Aufforderungen durch Ctrl+C/D, Esc, vim INSERT-Modus) überlagern die Statuszeile vorübergehend. Der Text der Statuszeile wird abgeschnitten, falls er die verfügbare Breite überschreitet.

## Voraussetzungen

- [`jq`](https://jqlang.github.io/jq/) wird zum Parsen der JSON-Eingabe empfohlen (Installation z. B. über `brew install jq`, `apt install jq` usw.)
- Einfache Befehle, die keine JSON-Daten benötigen (z. B. `git branch --show-current`), funktionieren auch ohne `jq`

## Schnelles Setup

Der einfachste Weg, eine Statuszeile zu konfigurieren, ist der Befehl `/statusline`. Er startet einen Setup-Agenten, der deine Shell-PS1-Konfiguration ausliest und eine passende Statuszeile generiert:

```
/statusline
```

Du kannst ihm auch spezifische Anweisungen geben:

```
/statusline show model name and context usage percentage
```

## Manuelle Konfiguration

Füge ein `statusLine`-Objekt unter dem `ui`-Schlüssel in `~/.qwen/settings.json` hinzu:

```json
{
  "ui": {
    "statusLine": {
      "type": "command",
      "command": "input=$(cat); model=$(echo \"$input\" | jq -r '.model.display_name'); pct=$(echo \"$input\" | jq -r '.context_window.used_percentage'); echo \"$model  ctx:${pct}%\""
    }
  }
}
```

| Feld      | Typ         | Erforderlich | Beschreibung                                                                           |
| --------- | ----------- | ------------ | ------------------------------------------------------------------------------------- |
| `type`    | `"command"` | Ja           | Muss `"command"` sein                                                                   |
| `command` | string      | Ja           | Auszuführender Shell-Befehl. Empfängt JSON über stdin, die erste Zeile von stdout wird angezeigt. |

## JSON-Eingabe

Der Befehl erhält ein JSON-Objekt über stdin mit folgenden Feldern:

```json
{
  "session_id": "abc-123",
  "version": "0.14.1",
  "model": {
    "display_name": "qwen-3-235b"
  },
  "context_window": {
    "context_window_size": 131072,
    "used_percentage": 34.3,
    "remaining_percentage": 65.7,
    "current_usage": 45000,
    "total_input_tokens": 30000,
    "total_output_tokens": 5000
  },
  "workspace": {
    "current_dir": "/home/user/project"
  },
  "git": {
    "branch": "main"
  },
  "metrics": {
    "models": {
      "qwen-3-235b": {
        "api": {
          "total_requests": 10,
          "total_errors": 0,
          "total_latency_ms": 5000
        },
        "tokens": {
          "prompt": 30000,
          "completion": 5000,
          "total": 35000,
          "cached": 10000,
          "thoughts": 2000
        }
      }
    },
    "files": {
      "total_lines_added": 120,
      "total_lines_removed": 30
    }
  },
  "vim": {
    "mode": "INSERT"
  }
}
```

| Feld                                  | Typ              | Beschreibung                                                                        |
| ------------------------------------- | ---------------- | ---------------------------------------------------------------------------------- |
| `session_id`                          | string           | Eindeutige Sitzungs-ID                                                          |
| `version`                             | string           | Qwen Code-Version                                                                  |
| `model.display_name`                  | string           | Name des aktuellen Modells                                                                 |
| `context_window.context_window_size`  | number           | Gesamtgröße des Kontextfensters in Tokens                                                |
| `context_window.used_percentage`      | number           | Nutzung des Kontextfensters in Prozent (0–100)                                         |
| `context_window.remaining_percentage` | number           | Verbleibendes Kontextfenster in Prozent (0–100)                                     |
| `context_window.current_usage`        | number           | Token-Anzahl des letzten API-Aufrufs (aktuelle Kontextgröße)                          |
| `context_window.total_input_tokens`   | number           | Gesamtzahl der in dieser Sitzung verbrauchten Input-Tokens                                           |
| `context_window.total_output_tokens`  | number           | Gesamtzahl der in dieser Sitzung verbrauchten Output-Tokens                                          |
| `workspace.current_dir`               | string           | Aktuelles Arbeitsverzeichnis                                                          |
| `git`                                 | object \| absent | Nur innerhalb eines Git-Repositories vorhanden.                                              |
| `git.branch`                          | string           | Name des aktuellen Branches                                                                |
| `metrics.models.<id>.api`             | object           | API-Statistiken pro Modell: `total_requests`, `total_errors`, `total_latency_ms`          |
| `metrics.models.<id>.tokens`          | object           | Token-Nutzung pro Modell: `prompt`, `completion`, `total`, `cached`, `thoughts`       |
| `metrics.files`                       | object           | Statistiken zu Dateiänderungen: `total_lines_added`, `total_lines_removed`                      |
| `vim`                                 | object \| absent | Nur vorhanden, wenn der Vim-Modus aktiviert ist. Enthält `mode` (`"INSERT"` oder `"NORMAL"`). |

> **Wichtig:** stdin kann nur einmal gelesen werden. Speichere die Eingabe immer zuerst in einer Variable: `input=$(cat)`.

## Beispiele

### Modell und Token-Nutzung

```json
{
  "ui": {
    "statusLine": {
      "type": "command",
      "command": "input=$(cat); model=$(echo \"$input\" | jq -r '.model.display_name'); pct=$(echo \"$input\" | jq -r '.context_window.used_percentage'); echo \"$model  ctx:${pct}%\""
    }
  }
}
```

Ausgabe: `qwen-3-235b  ctx:34%`

### Git-Branch + Verzeichnis

```json
{
  "ui": {
    "statusLine": {
      "type": "command",
      "command": "input=$(cat); branch=$(echo \"$input\" | jq -r '.git.branch // empty'); dir=$(basename \"$(echo \"$input\" | jq -r '.workspace.current_dir')\"); echo \"$dir${branch:+ ($branch)}\""
    }
  }
}
```

Ausgabe: `my-project (main)`

> Hinweis: Das Feld `git.branch` wird direkt in der JSON-Eingabe bereitgestellt – ein Aufruf von `git` über die Shell ist nicht erforderlich.

### Statistiken zu Dateiänderungen

```json
{
  "ui": {
    "statusLine": {
      "type": "command",
      "command": "input=$(cat); added=$(echo \"$input\" | jq -r '.metrics.files.total_lines_added'); removed=$(echo \"$input\" | jq -r '.metrics.files.total_lines_removed'); echo \"+$added/-$removed lines\""
    }
  }
}
```

Ausgabe: `+120/-30 lines`

### Skriptdatei für komplexe Befehle

Für längere Befehle speichere ein Skript unter `~/.qwen/statusline-command.sh`:

```bash
#!/bin/bash
input=$(cat)
model=$(echo "$input" | jq -r '.model.display_name')
pct=$(echo "$input" | jq -r '.context_window.used_percentage')
branch=$(echo "$input" | jq -r '.git.branch // empty')
added=$(echo "$input" | jq -r '.metrics.files.total_lines_added')
removed=$(echo "$input" | jq -r '.metrics.files.total_lines_removed')

parts=()
[ -n "$model" ] && parts+=("$model")
[ -n "$branch" ] && parts+=("($branch)")
[ "$pct" != "0" ] 2>/dev/null && parts+=("ctx:${pct}%")
([ "$added" -gt 0 ] || [ "$removed" -gt 0 ]) 2>/dev/null && parts+=("+${added}/-${removed}")

echo "${parts[*]}"
```

Verweise dann in den Einstellungen darauf:

```json
{
  "ui": {
    "statusLine": {
      "type": "command",
      "command": "bash ~/.qwen/statusline-command.sh"
    }
  }
}
```

## Verhalten

- **Update-Auslöser**: Die Statuszeile wird aktualisiert, wenn sich das Modell ändert, eine neue Nachricht gesendet wird (Token-Anzahl ändert sich), der Vim-Modus umgeschaltet wird, sich der Git-Branch ändert, Tool-Aufrufe abgeschlossen sind oder Dateiänderungen auftreten. Updates werden entprellt (300 ms).
- **Timeout**: Befehle, die länger als 5 Sekunden dauern, werden beendet. Bei einem Fehler wird die Statuszeile geleert.
- **Ausgabe**: Nur die erste Zeile von stdout wird verwendet. Der Text wird im linken Bereich der Fußzeile in abgedunkelten Farben dargestellt und abgeschnitten, falls er die verfügbare Breite überschreitet.
- **Hot Reload**: Änderungen an `ui.statusLine` in den Einstellungen werden sofort wirksam – kein Neustart erforderlich.
- **Shell**: Befehle werden unter macOS/Linux über `/bin/sh` ausgeführt. Unter Windows wird standardmäßig `cmd.exe` verwendet – umschließe POSIX-Befehle mit `bash -c "..."` oder verweise auf ein Bash-Skript (z. B. `bash ~/.qwen/statusline-command.sh`).
- **Entfernen**: Lösche den Schlüssel `ui.statusLine` aus den Einstellungen, um die Funktion zu deaktivieren. Der Hinweis „? for shortcuts“ wird wieder angezeigt.

## Fehlerbehebung

| Problem                 | Ursache                  | Lösung                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Statuszeile wird nicht angezeigt | Konfiguration im falschen Pfad   | Muss unter `ui.statusLine` stehen, nicht auf Root-Ebene als `statusLine`                                                                                                                                                                                                                                                                                                                                             |
| Leere Ausgabe            | Befehl schlägt stillschweigend fehl | Manuell testen: `echo '{"session_id":"test","version":"0.14.1","model":{"display_name":"test"},"context_window":{"context_window_size":0,"used_percentage":0,"remaining_percentage":100,"current_usage":0,"total_input_tokens":0,"total_output_tokens":0},"workspace":{"current_dir":"/tmp"},"metrics":{"models":{},"files":{"total_lines_added":0,"total_lines_removed":0}}}' \| sh -c 'your_command'` |
| Veraltete Daten              | Kein Auslöser wurde gefeuert       | Sende eine Nachricht oder wechsle das Modell, um ein Update auszulösen                                                                                                                                                                                                                                                                                                                                                   |
| Befehl zu langsam        | Komplexes Skript         | Optimiere das Skript oder lagere rechenintensive Aufgaben in einen Hintergrund-Cache aus                                                                                                                                                                                                                                                                                                                                           |