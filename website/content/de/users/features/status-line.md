# Statuszeile

> Zeigt benutzerdefinierte Informationen in der Fußzeile an.

Die Statuszeile zeigt sitzungsbezogene Informationen – Modellname, Token-Verbrauch, Git-Branch und mehr – im linken Abschnitt der Fußzeile an. Es gibt zwei Konfigurationsmodi:

- **Voreinstellungsmodus** – Wählen Sie aus integrierten Datenelementen über einen interaktiven Dialog oder eine JSON-Konfiguration aus. Keine Skripterstellung erforderlich.
- **Befehlsmodus** – Führen Sie einen Shell-Befehl aus, der strukturierten JSON-Kontext über stdin erhält. Volle Flexibilität für benutzerdefinierte Formatierung.

```
Einzeilige Statuszeile (Standard-Bestätigungsmodus – 1 Zeile):
┌─────────────────────────────────────────────────────────────────┐
│  user@host ~/project (main) ctx:34%   🔒 docker | Debug | 67%  │  ← Statuszeile
└─────────────────────────────────────────────────────────────────┘

Mehrzeilige Statuszeile (bis zu 2 Zeilen – 2 Zeilen):
┌─────────────────────────────────────────────────────────────────┐
│  user@host ~/project (main) ctx:34%   🔒 docker | Debug | 67%  │  ← Statuszeile 1
│  ████████░░░░░░░░░░ 34% context                                │  ← Statuszeile 2
└─────────────────────────────────────────────────────────────────┘

Mehrzeilige Statuszeile + nicht-standardmäßiger Modus (max. 3 Zeilen):
┌─────────────────────────────────────────────────────────────────┐
│  user@host ~/project (main) ctx:34%   🔒 docker | Debug | 67%  │  ← Statuszeile 1
│  ████████░░░░░░░░░░ 34% context                                │  ← Statuszeile 2
│  auto-accept edits (shift + tab to cycle)                       │  ← Modusanzeige
└─────────────────────────────────────────────────────────────────┘
```

Wenn konfiguriert, ersetzt die Statuszeile den standardmäßigen Hinweis "? für Tastenkombinationen". Nachrichten mit hoher Priorität (Strg+C/D-Beenden-Aufforderungen, Esc, vim EINFÜGEModus) überlagern vorübergehend die Statuszeile. Der Text der Statuszeile wird abgeschnitten, um in die verfügbare Breite zu passen.

## Schnelleinrichtung

Der einfachste Weg, eine Statuszeile zu konfigurieren, ist der Befehl `/statusline`. Er öffnet einen interaktiven Dialog, in dem Sie Voreinstellungselemente auswählen, Themenfarben umschalten und eine Live-Vorschau sehen können:

```
/statusline
```

Dies öffnet den Konfigurator für den Voreinstellungsmodus. Verwenden Sie die Pfeiltasten zur Navigation, die Leertaste zum Umschalten von Elementen und die Eingabetaste zum Bestätigen. Ihre Auswahl wird automatisch in den Einstellungen gespeichert.

Sie können `/statusline` auch spezifische Anweisungen geben, um eine Konfiguration für den Befehlsmodus generieren zu lassen:

```
/statusline show model name and context usage percentage
```

---

## Voreinstellungsmodus

Der Voreinstellungsmodus bietet eine Reihe von integrierten Datenelementen, die Sie auswählen und kombinieren können – keine Shell-Befehle, kein `jq`, keine Skripterstellung. Elemente werden als `item1 | item2 | item3` in einer einzigen Zeile dargestellt.

### Konfiguration

Fügen Sie ein Objekt `statusLine` unter dem Schlüssel `ui` in `~/.qwen/settings.json` hinzu:

```json
{
  "ui": {
    "statusLine": {
      "type": "preset",
      "items": [
        "model-with-reasoning",
        "git-branch",
        "context-remaining",
        "current-dir",
        "context-used"
      ],
      "useThemeColors": true
    }
  }
}
```

| Feld                   | Typ         | Erforderlich | Beschreibung                                                                                                 |
| ---------------------- | ----------- | ------------ | ------------------------------------------------------------------------------------------------------------ |
| `type`                 | `"preset"`  | Ja           | Muss `"preset"` sein                                                                                         |
| `items`                | string[]    | Ja           | Geordnete Liste der anzuzeigenden Voreinstellungselement-IDs (siehe Tabelle unten). Elemente werden mit `\|` als Trennzeichen verbunden. |
| `useThemeColors`       | boolean     | Nein         | Wendet die Farbe des aktiven `/theme` auf den Text der Statuszeile an. Standard: `true`.                     |
| `hideContextIndicator` | boolean     | Nein         | Blendet den integrierten Kontextnutzungsindikator im rechten Fußzeilenabschnitt aus. Standard: `false`.      |

### Verfügbare Voreinstellungselemente

| Element-ID               | Standard | Beschreibung                                                         |
| ------------------------ | -------- | -------------------------------------------------------------------- |
| `model-with-reasoning`   | Ja       | Aktueller Modellname mit Reasoning-Stufe (z. B. `qwen-3-235b high`)  |
| `model`                  |          | Aktueller Modellname ohne Reasoning-Stufe                            |
| `git-branch`             | Ja       | Aktueller Git-Branch-Name (ausgeblendet, wenn nicht in einem Git-Repo)|
| `context-remaining`      | Ja       | Prozentsatz des verbleibenden Kontextfensters (z. B. `Context 65.7% left`) |
| `total-input-tokens`     |          | Kumulierte eingegebene Token in der Sitzung (z. B. `30.0k total in`) |
| `total-output-tokens`    |          | Kumulierte ausgegebene Token in der Sitzung (z. B. `5.0k total out`) |
| `current-dir`            | Ja       | Aktuelles Arbeitsverzeichnis                                         |
| `project-name`           |          | Projektname (Basisname des Arbeitsverzeichnisses)                    |
| `pull-request-number`    |          | Offene PR-Nummer für den aktuellen Branch (erfordert `gh`-CLI)       |
| `branch-changes`         |          | Dateiänderungsstatistiken der Sitzung (z. B. `+120 -30`)             |
| `context-used`           | Ja       | Prozentsatz des genutzten Kontextfensters (z. B. `Context 34.3% used`)|
| `run-state`              |          | Kompakter Sitzungsstatus (`Ready`, `Working` oder `Confirm`)         |
| `qwen-version`           |          | Qwen Code-Version (z. B. `v0.14.1`)                                  |
| `context-window-size`    |          | Gesamtgröße des Kontextfensters (z. B. `131.1k window`)              |
| `used-tokens`            |          | Aktuelle Prompt-Token-Anzahl (z. B. `45.0k used`)                    |
| `session-id`             |          | Aktuelle Sitzungskennung                                             |
Elemente, die als **Default** markiert sind, sind vorausgewählt, wenn Sie den `/statusline`-Dialog zum ersten Mal öffnen.

`total-input-tokens` und `total-output-tokens` sind Sitzungssummen. Sie summieren die Token-Nutzung über mehrere Turns hinweg, sodass die Eingabe-Token schnell anwachsen können, da jede neue Modellanfrage den aktuellen Gesprächskontext erneut einschließt. Verwenden Sie `used-tokens`, wenn Sie die aktuelle Prompt-Größe anstelle der kumulativen Sitzungsausgabe benötigen.

### Beispielausgabe

Mit den Standardelementen sieht die Statuszeile wie folgt aus:

```
qwen-3-235b high | main | Context 65.7% left | /home/user/project | Context 34.3% used
```

### Anpassen über den Dialog

Die Ausführung von `/statusline` öffnet einen interaktiven Mehrfachauswahl-Dialog:

```
┌ Configure Status Line ────────────────────────────────────────┐
│ Select which items to display in the status line.             │
│                                                               │
│ Type to search                                                │
│ >                                                             │
│                                                               │
│ [x] Use theme colors        Apply colors from the active /theme│
│ ───────────────────────                                       │
│ [x] model-with-reasoning    Current model name with reasoning │
│ [ ] model-only              Current model name without reason │
│ [x] git-branch              Current Git branch when available │
│ [x] context-remaining       Percentage of context remaining   │
│ ...                                                           │
│                                                               │
│ Preview                                                       │
│ qwen-3-235b high | main | Context 65.7% left                 │
│                                                               │
│ Use up/down to navigate, space to select, enter to confirm    │
└───────────────────────────────────────────────────────────────┘
```

- Geben Sie ein, um Elemente nach Namen oder Beschreibung zu filtern
- Eine Live-Vorschau wird aktualisiert, während Sie Elemente umschalten
- Drücken Sie die Eingabetaste, um die Konfiguration zu speichern

---

## Befehlsmodus

Der Befehlsmodus führt einen Shell-Befehl aus, dessen stdout in der Statuszeile angezeigt wird. Der Befehl erhält strukturierten JSON-Kontext über stdin für sitzungsbewusste Ausgabe.

### Voraussetzungen

- [`jq`](https://jqlang.github.io/jq/) wird empfohlen, um die JSON-Eingabe zu parsen (Installation via `brew install jq`, `apt install jq` usw.)
- Einfache Befehle, die keine JSON-Daten benötigen (z. B. `git branch --show-current`), funktionieren ohne `jq`

### Konfiguration

Fügen Sie ein `statusLine`-Objekt unter dem Schlüssel `ui` in `~/.qwen/settings.json` hinzu:

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

| Feld                  | Typ        | Erforderlich | Beschreibung                                                                                                                       |
| ---------------------- | ----------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `type`                 | `"command"` | Ja           | Muss `"command"` sein                                                                                                             |
| `command`              | string      | Ja           | Shell-Befehl zur Ausführung. Empfängt JSON über stdin, stdout wird angezeigt (maximal 2 Zeilen).                                  |
| `refreshInterval`      | number      | Nein         | Führt den Befehl alle N Sekunden erneut aus (Minimum 1). Nützlich für Daten, die sich ohne Agent-Statusereignis ändern (Uhr, Kontingent, Betriebszeit). |
| `respectUserColors`    | boolean     | Nein         | Behält ANSI-Farbcodes in der Befehlsausgabe bei, anstatt abgedunkelte Fußzeilenformatierung anzuwenden. Standard: `false`.                       |
| `hideContextIndicator` | boolean     | Nein         | Blendet den integrierten Kontextnutzungsindikator im rechten Fußzeilenbereich aus. Standard: `false`.                                       |

### JSON-Eingabe

Der Befehl erhält über stdin ein JSON-Objekt mit den folgenden Feldern:

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
  "worktree": {
    "name": "fix-auth",
    "path": "/home/user/project/.qwen/worktrees/fix-auth",
    "branch": "fix-auth",
    "original_cwd": "/home/user/project",
    "original_branch": "main"
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
| Feld                                | Typ              | Beschreibung                                                                        |
| ----------------------------------- | ---------------- | ----------------------------------------------------------------------------------- |
| `session_id`                        | string           | Eindeutige Sitzungskennung                                                          |
| `version`                           | string           | Qwen-Code-Version                                                                   |
| `model.display_name`                | string           | Aktueller Modellname                                                                |
| `context_window.context_window_size` | number           | Gesamtgröße des Kontextfensters in Tokens                                           |
| `context_window.used_percentage`    | number           | Nutzung des Kontextfensters in Prozent (0–100)                                      |
| `context_window.remaining_percentage` | number           | Verbleibendes Kontextfenster in Prozent (0–100)                                     |
| `context_window.current_usage`      | number           | Tokenanzahl des letzten API-Aufrufs (aktuelle Kontextgröße)                         |
| `context_window.total_input_tokens` | number           | Gesamte eingegebene Token in dieser Sitzung                                         |
| `context_window.total_output_tokens` | number           | Gesamte ausgegebene Token in dieser Sitzung                                         |
| `workspace.current_dir`             | string           | Aktuelles Arbeitsverzeichnis                                                        |
| `git`                               | object \| absent | Nur vorhanden, wenn ein Git-Repository aktiv ist.                                   |
| `git.branch`                        | string           | Name des aktuellen Branches                                                        |
| `worktree`                          | object \| absent | Nur vorhanden, wenn ein aktiver Worktree (via `enter_worktree`) vorliegt.           |
| `worktree.name`                     | string           | Slug-Name des Worktrees                                                            |
| `worktree.path`                     | string           | Absoluter Pfad zum Worktree-Verzeichnis                                             |
| `worktree.branch`                   | string           | Im Worktree ausgecheckter Branch                                                    |
| `worktree.original_cwd`             | string           | Arbeitsverzeichnis vor Betreten des Worktrees                                       |
| `worktree.original_branch`          | string           | Branch, der vor Betreten des Worktrees aktiv war                                    |
| `metrics.models.<id>.api`           | object           | Modellspezifische API-Statistiken: `total_requests`, `total_errors`, `total_latency_ms` |
| `metrics.models.<id>.tokens`        | object           | Modellspezifische Token-Nutzung: `prompt`, `completion`, `total`, `cached`, `thoughts` |
| `metrics.files`                     | object           | Dateiänderungsstatistiken: `total_lines_added`, `total_lines_removed`               |
| `vim`                               | object \| absent | Nur vorhanden, wenn der Vim-Modus aktiviert ist. Enthält `mode` (`"INSERT"` oder `"NORMAL"`). |

> **Important:** stdin kann nur einmal gelesen werden. Speichere es immer zuerst in einer Variable: `input=$(cat)`.

### Beispiele

#### Modell- und Token-Nutzung

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

#### Git-Branch + Verzeichnis

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

> Note: Das Feld `git.branch` wird direkt im JSON-Eingabe bereitgestellt – ein Umweg über das `git`-Kommando ist nicht nötig.

#### Dateiänderungsstatistiken

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

#### Live-Uhr und Git-Branch

Verwende `refreshInterval`, wenn die Statusleiste Daten anzeigt, die sich ohne Agent-Ereignis ändern (z. B. die Uhr, Betriebszeit oder Ratenbegrenzungszähler):

```json
{
  "ui": {
    "statusLine": {
      "type": "command",
      "command": "input=$(cat); branch=$(echo \"$input\" | jq -r '.git.branch // \"no-git\"'); echo \"$(date +%H:%M:%S)  ($branch)\"",
      "refreshInterval": 1
    }
  }
}
```
Ausgabe (aktualisiert jede Sekunde): `14:32:07  (main)`

#### Skriptdatei für komplexe Befehle

Für längere Befehle speichern Sie eine Skriptdatei unter `~/.qwen/statusline-command.sh`:

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

Referenzieren Sie es dann in den Einstellungen:

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

**Beide Modi:**

- **Aktualisierungsauslöser**: Die Statuszeile wird aktualisiert, wenn sich das Modell ändert, eine neue Nachricht gesendet wird (Tokenanzahl ändert sich), der Vim-Modus umgeschaltet wird, der Git-Branch wechselt, Toolaufrufe abgeschlossen werden oder Dateiänderungen auftreten. Aktualisierungen werden entprellt (300 ms).
- **Ausgabe**: Bis zu 2 Zeilen. Jede Zeile wird als separate Reihe im linken Bereich der Fußzeile dargestellt. Zeilen, die die verfügbare Breite überschreiten, werden abgeschnitten.
- **Hot Reload**: Änderungen an `ui.statusLine` in den Einstellungen werden sofort übernommen – kein Neustart erforderlich.
- **Entfernen**: Löschen Sie den Schlüssel `ui.statusLine` aus den Einstellungen, um die Funktion zu deaktivieren. Der Hinweis „? für Tastenkürzel" wird wieder angezeigt.

**Nur Befehlsmodus:**

- **Zeitüberschreitung**: Befehle, die länger als 5 Sekunden dauern, werden abgebrochen. Die Statuszeile wird bei Fehlschlag geleert.
- **Aktualisierung**: Setzen Sie `refreshInterval` (Sekunden), um den Befehl zusätzlich zeitgesteuert erneut auszuführen – nützlich für Daten, die sich ohne Agent-Ereignis ändern (Uhr, Ratenlimits, Build-Status).
- **Shell**: Befehle werden unter macOS/Linux über `/bin/sh` ausgeführt. Unter Windows wird standardmäßig `cmd.exe` verwendet – umgeben Sie POSIX-Befehle mit `bash -c "..."` oder verweisen Sie auf ein Bash-Skript (z.B. `bash ~/.qwen/statusline-command.sh`).

**Nur Preset-Modus:**

- **Keine externen Abhängigkeiten**: Preset-Elemente werden intern berechnet – keine Shell-Befehle, kein `jq`, keine Zeitüberschreitungen.
- **Theme-Integration**: Wenn `useThemeColors` auf `true` gesetzt ist (Standard), verwendet der Text der Statuszeile die aktive Farbe des `/theme`. Bei `false` wird die abgedunkelte Fußzeilenformatierung angewendet.
- **PR-Suche**: Das Element `pull-request-number` führt im Hintergrund `gh pr view` aus (2s Zeitüberschreitung). Es wird nur ausgelöst, wenn sich der Branch ändert, nicht bei jeder Aktualisierung.

## Fehlerbehebung

| Problem                     | Ursache                          | Lösung                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Statuszeile wird nicht angezeigt | Konfiguration am falschen Pfad       | Muss unter `ui.statusLine` liegen, nicht auf oberster Ebene als `statusLine`                                                                                                                                                                                                                                                                                                                                                                                       |
| Leere Ausgabe (Befehlsmodus) | Befehl schlägt stillschweigend fehl | Manuell testen: `echo '{"session_id":"test","version":"0.14.1","model":{"display_name":"test"},"context_window":{"context_window_size":0,"used_percentage":0,"remaining_percentage":100,"current_usage":0,"total_input_tokens":0,"total_output_tokens":0},"workspace":{"current_dir":"/tmp"},"metrics":{"models":{},"files":{"total_lines_added":0,"total_lines_removed":0}}}' | sh -c 'your_command'` |
| Veraltete Daten (Befehlsmodus) | Kein Auslöser ausgelöst               | Senden Sie eine Nachricht oder wechseln Sie das Modell, um eine Aktualisierung auszulösen – oder setzen Sie `refreshInterval`, um den Befehl zeitgesteuert erneut auszuführen                                                                                                                                                                                                                                                                                          |
| Befehl zu langsam            | Komplexes Skript                  | Optimieren Sie das Skript oder verlagern Sie schwere Arbeit in einen Hintergrund-Cache                                                                                                                                                                                                                                                                                                                                                                                   |
| Preset-Elemente fehlen       | Bedingte Elemente haben keine Daten | `git-branch` wird außerhalb von Git-Repos ausgeblendet; `context-used` wird bei Nutzung 0 ausgeblendet; `branch-changes` wird ausgeblendet, wenn keine Dateien geändert wurden. Dies ist erwartet – Elemente erscheinen, sobald ihre Daten verfügbar sind                                                                                                                                                                                                                 |
| PR-Nummer wird nicht angezeigt | `gh` CLI nicht installiert            | Installieren Sie die [GitHub CLI](https://cli.github.com/) und authentifizieren Sie sich mit `gh auth login`. Die Suche läuft mit einer Zeitüberschreitung von 2s                                                                                                                                                                                                                                                                                                    |
