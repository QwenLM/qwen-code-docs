# Statuszeile

> Zeige benutzerdefinierte Informationen im Footer an.

Die Statuszeile zeigt sitzungsbezogene Informationen – Modellname, Token-Nutzung, Git-Branch und mehr – im linken Bereich des Footers an. Es gibt zwei Konfigurationsmodi:

- **Preset-Modus** – Wähle aus integrierten Datenelementen über einen interaktiven Dialog oder eine JSON-Konfiguration. Kein Scripting erforderlich.
- **Command-Modus** – Führe einen Shell-Befehl aus, der strukturierten JSON-Kontext über stdin erhält. Volle Flexibilität für benutzerdefinierte Formatierung.

```
Single-line status (default approval mode — 1 row):
┌─────────────────────────────────────────────────────────────────┐
│  user@host ~/project (main) ctx:34%   docker | Debug | 67%     │  ← status line
└─────────────────────────────────────────────────────────────────┘

Multi-line status (up to 2 lines — 2 rows):
┌─────────────────────────────────────────────────────────────────┐
│  user@host ~/project (main) ctx:34%   docker | Debug | 67%     │  ← status line 1
│  ████████░░░░░░░░░░ 34% context                                │  ← status line 2
└─────────────────────────────────────────────────────────────────┘

Multi-line status + non-default mode (3 rows max):
┌─────────────────────────────────────────────────────────────────┐
│  user@host ~/project (main) ctx:34%   docker | Debug | 67%     │  ← status line 1
│  ████████░░░░░░░░░░ 34% context                                │  ← status line 2
│  auto-accept edits (shift + tab to cycle)                       │  ← mode indicator
└─────────────────────────────────────────────────────────────────┘
```

Wenn konfiguriert, ersetzt die Statuszeile den Standard-Hinweis "? for shortcuts". Hochprioritäre Nachrichten (Ctrl+C/D-Exit-Prompts, Esc, vim-INSERT-Modus) überlagern die Statuszeile temporär. Der Text der Statuszeile wird gekürzt, um in die verfügbare Breite zu passen.

## Schnelleinrichtung

Der einfachste Weg, eine Statuszeile zu konfigurieren, ist der Befehl `/statusline`. Er öffnet einen interaktiven Dialog, in dem du Preset-Elemente auswählen, Theme-Farben umschalten und eine Live-Vorschau sehen kannst:

```
/statusline
```

Dies öffnet den Preset-Modus-Konfigurator. Verwende die Pfeiltasten zur Navigation, die Leertaste zum Umschalten der Elemente und Enter zum Bestätigen. Deine Auswahl wird automatisch in den Einstellungen gespeichert.

Du kannst `/statusline` auch spezifische Anweisungen geben, damit es eine Command-Modus-Konfiguration generiert:

```
/statusline show model name and context usage percentage
```

---

## Preset-Modus

Der Preset-Modus bietet eine Reihe integrierter Datenelemente, die du auswählen und kombinieren kannst – keine Shell-Befehle, kein `jq`, kein Scripting. Elemente werden als `item1 | item2 | item3` in einer einzigen Zeile gerendert.

### Konfiguration

Füge ein `statusLine`-Objekt unter dem `ui`-Schlüssel in `~/.qwen/settings.json` hinzu:

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

| Field                  | Type       | Required | Description                                                                                                |
| ---------------------- | ---------- | -------- | ---------------------------------------------------------------------------------------------------------- |
| `type`                 | `"preset"` | Yes      | Muss `"preset"` sein                                                                                       |
| `items`                | string[]   | Yes      | Geordnete Liste der anzuzeigenden Preset-Element-IDs (siehe Tabelle unten). Elemente werden mit `\|` als Trennzeichen verbunden. |
| `useThemeColors`       | boolean    | No       | Wendet die Farbe des aktiven `/theme` auf den Text der Statuszeile an. Standardmäßig `true`.               |
| `hideContextIndicator` | boolean    | No       | Verbirgt den integrierten Kontextnutzungs-Indikator im rechten Bereich des Footers. Standardmäßig `false`. |

### Verfügbare Preset-Elemente

| Item ID                | Default | Description                                                        |
| ---------------------- | ------- | ------------------------------------------------------------------ |
| `model-with-reasoning` | Yes     | Aktueller Modellname mit Reasoning-Level (z. B. `qwen-3-235b high`)  |
| `model`                |         | Aktueller Modellname ohne Reasoning-Level                         |
| `git-branch`           | Yes     | Aktueller Git-Branch-Name (ausgeblendet, wenn nicht in einem Git-Repo)            |
| `context-remaining`    | Yes     | Prozentsatz des verbleibenden Kontextfensters (z. B. `Context 65.7% left`) |
| `total-input-tokens`   |         | Kumulierte Input-Tokens, die in der Sitzung verwendet wurden (z. B. `30.0k total in`)    |
| `total-output-tokens`  |         | Kumulierte Output-Tokens, die in der Sitzung verwendet wurden (z. B. `5.0k total out`)   |
| `current-dir`          | Yes     | Aktuelles Arbeitsverzeichnis                                          |
| `project-name`         |         | Projektname (Basisname des Arbeitsverzeichnisses)                       |
| `pull-request-number`  |         | Offene PR-Nummer für den aktuellen Branch (erfordert `gh` CLI)          |
| `branch-changes`       |         | Sitzungs-Dateiänderungsstatistiken (z. B. `+120 -30`)                        |
| `context-used`         | Yes     | Prozentsatz des genutzten Kontextfensters (z. B. `Context 34.3% used`)      |
| `run-state`            |         | Kompakter Sitzungsstatus (`Ready`, `Working` oder `Confirm`)           |
| `qwen-version`         |         | Qwen Code-Version (z. B. `v0.14.1`)                                 |
| `context-window-size`  |         | Gesamtgröße des Kontextfensters (z. B. `131.1k window`)                   |
| `used-tokens`          |         | Aktuelle Prompt-Token-Anzahl (z. B. `45.0k used`)                     |
| `session-id`           |         | Aktuelle Sitzungs-ID                                         |

Mit **Default** markierte Elemente sind vorausgewählt, wenn du den `/statusline`-Dialog zum ersten Mal öffnest.

`total-input-tokens` und `total-output-tokens` sind Sitzungsgesamtwerte. Sie summieren die Token-Nutzung über alle Turns, sodass Input-Tokens schnell wachsen können, da jede neue Modellanfrage den aktuellen Konversationskontext erneut enthält. Verwende `used-tokens`, wenn du die aktuelle Prompt-Größe anstelle der kumulativen Sitzungs-Auslastung wissen möchtest.

### Beispielausgabe

Mit den Standard-Elementen sieht die Statuszeile so aus:

```
qwen-3-235b high | main | Context 65.7% left | /home/user/project | Context 34.3% used
```

### Anpassung über den Dialog

Das Ausführen von `/statusline` öffnet einen interaktiven Multi-Select-Dialog:

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

- Tippe, um Elemente nach Name oder Beschreibung zu filtern
- Eine Live-Vorschau aktualisiert sich, wenn du Elemente umschaltest
- Drücke Enter, um die Konfiguration zu speichern

---

## Command-Modus

Der Command-Modus führt einen Shell-Befehl aus, dessen stdout in der Statuszeile angezeigt wird. Der Befehl erhält strukturierten JSON-Kontext über stdin für sitzungsbezogene Ausgaben.

### Voraussetzungen

- [`jq`](https://jqlang.github.io/jq/) wird zum Parsen der JSON-Eingabe empfohlen (Installation via `brew install jq`, `apt install jq`, etc.)
- Einfache Befehle, die keine JSON-Daten benötigen (z. B. `git branch --show-current`), funktionieren ohne `jq`

### Konfiguration

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

| Field                  | Type        | Required | Description                                                                                                                       |
| ---------------------- | ----------- | -------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `type`                 | `"command"` | Yes      | Muss `"command"` sein                                                                                                               |
| `command`              | string      | Yes      | Auszuführender Shell-Befehl. Empfängt JSON über stdin, stdout wird angezeigt (bis zu 2 Zeilen).                                           |
| `refreshInterval`      | number      | No       | Führt den Befehl alle N Sekunden erneut aus (Minimum 1). Nützlich für Daten, die sich ohne ein Agent-State-Event ändern (Uhr, Quota, Uptime). |
| `respectUserColors`    | boolean     | No       | Behält ANSI-Farbcodes in der Befehlsausgabe bei, anstatt gedimmtes Footer-Styling anzuwenden. Standardmäßig `false`.                       |
| `hideContextIndicator` | boolean     | No       | Verbirgt den integrierten Kontextnutzungs-Indikator im rechten Bereich des Footers. Standardmäßig `false`.                                       |

### JSON-Eingabe

Der Befehl empfängt ein JSON-Objekt über stdin mit den folgenden Feldern:

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

| Field                                 | Type             | Description                                                                        |
| ------------------------------------- | ---------------- | ---------------------------------------------------------------------------------- |
| `session_id`                          | string           | Eindeutige Sitzungs-ID                                                          |
| `version`                             | string           | Qwen Code-Version                                                                  |
| `model.display_name`                  | string           | Aktueller Modellname                                                                 |
| `context_window.context_window_size`  | number           | Gesamtgröße des Kontextfensters in Tokens                                                |
| `context_window.used_percentage`      | number           | Kontextfensternutzung in Prozent (0–100)                                         |
| `context_window.remaining_percentage` | number           | Verbleibendes Kontextfenster in Prozent (0–100)                                     |
| `context_window.current_usage`        | number           | Token-Anzahl des letzten API-Calls (aktuelle Kontextgröße)                          |
| `context_window.total_input_tokens`   | number           | Gesamtzahl der in dieser Sitzung verbrauchten Input-Tokens                                           |
| `context_window.total_output_tokens`  | number           | Gesamtzahl der in dieser Sitzung verbrauchten Output-Tokens                                          |
| `workspace.current_dir`               | string           | Aktuelles Arbeitsverzeichnis                                                          |
| `git`                                 | object \| absent | Nur innerhalb eines Git-Repositories vorhanden.                                              |
| `git.branch`                          | string           | Aktueller Branch-Name                                                                |
| `worktree`                            | object \| absent | Nur vorhanden, wenn innerhalb eines aktiven Worktrees (erstellt durch `enter_worktree`).         |
| `worktree.name`                       | string           | Worktree-Slug-Name                                                                 |
| `worktree.path`                       | string           | Absoluter Pfad zum Worktree-Verzeichnis                                            |
| `worktree.branch`                     | string           | Im Worktree ausgecheckter Branch                                                 |
| `worktree.original_cwd`               | string           | Arbeitsverzeichnis vor dem Betreten des Worktrees                                     |
| `worktree.original_branch`            | string           | Branch, der vor dem Betreten des Worktrees aktiv war                                |
| `metrics.models.<id>.api`             | object           | API-Statistiken pro Modell: `total_requests`, `total_errors`, `total_latency_ms`          |
| `metrics.models.<id>.tokens`          | object           | Token-Nutzung pro Modell: `prompt`, `completion`, `total`, `cached`, `thoughts`       |
| `metrics.files`                       | object           | Dateiänderungsstatistiken: `total_lines_added`, `total_lines_removed`                      |
| `vim`                                 | object \| absent | Nur vorhanden, wenn der Vim-Modus aktiviert ist. Enthält `mode` (`"INSERT"` oder `"NORMAL"`). |

> **Wichtig:** stdin kann nur einmal gelesen werden. Speichere es immer zuerst in einer Variable: `input=$(cat)`.

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

> Hinweis: Das Feld `git.branch` wird direkt in der JSON-Eingabe bereitgestellt – es ist nicht nötig, `git` über die Shell aufzurufen.

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

Verwende `refreshInterval`, wenn die Statuszeile Daten anzeigt, die sich ohne ein Agent-Event ändern (z. B. die Uhr, Uptime oder Rate-Limit-Zähler):

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

Ausgabe (jede Sekunde aktualisiert): `14:32:07  (main)`

#### Skriptdatei für komplexe Befehle

Für längere Befehle speichere eine Skriptdatei unter `~/.qwen/statusline-command.sh`:

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

Dann referenziere sie in den Einstellungen:

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

- **Update-Trigger**: Die Statuszeile aktualisiert sich, wenn das Modell wechselt, eine neue Nachricht gesendet wird (Token-Anzahl ändert sich), der Vim-Modus umgeschaltet wird, der Git-Branch wechselt, Tool-Calls abgeschlossen sind oder Dateiänderungen auftreten. Updates werden entprellt (300 ms).
- **Ausgabe**: Bis zu 2 Zeilen. Jede Zeile wird als separate Zeile im linken Bereich des Footers gerendert. Zeilen, die die verfügbare Breite überschreiten, werden abgeschnitten.
- **Hot Reload**: Änderungen an `ui.statusLine` in den Einstellungen werden sofort wirksam – kein Neustart erforderlich.
- **Entfernung**: Lösche den Schlüssel `ui.statusLine` aus den Einstellungen, um die Funktion zu deaktivieren. Der Hinweis "? for shortcuts" wird wieder angezeigt.

**Nur Command-Modus:**

- **Timeout**: Befehle, die länger als 5 Sekunden dauern, werden abgebrochen. Die Statuszeile wird bei einem Fehler geleert.
- **Refresh**: Setze `refreshInterval` (Sekunden), um den Befehl zusätzlich über einen Timer erneut auszuführen – nützlich für Daten, die sich ohne ein Agent-Event ändern (Uhr, Rate Limits, Build-Status).
- **Shell**: Befehle werden unter macOS/Linux über `/bin/sh` ausgeführt. Unter Windows wird standardmäßig `cmd.exe` verwendet – umschließe POSIX-Befehle mit `bash -c "..."` oder verweise auf ein Bash-Skript (z. B. `bash ~/.qwen/statusline-command.sh`).

**Nur Preset-Modus:**

- **Keine externen Abhängigkeiten**: Preset-Elemente werden intern berechnet – keine Shell-Befehle, kein `jq`, keine Timeouts.
- **Theme-Integration**: Wenn `useThemeColors` auf `true` (Standard) gesetzt ist, verwendet der Text der Statuszeile die Farbe des aktiven `/theme`. Wenn `false`, wird ein gedimmtes Footer-Styling angewendet.
- **PR-Lookup**: Das Element `pull-request-number` führt `gh pr view` im Hintergrund aus (2s Timeout). Es wird nur ausgelöst, wenn der Branch wechselt, nicht bei jedem Update.

## Fehlerbehebung

| Problem                     | Ursache                          | Lösung                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Statuszeile wird nicht angezeigt     | Konfiguration im falschen Pfad           | Muss unter `ui.statusLine` stehen, nicht auf Root-Ebene `statusLine`                                                                                                                                                                                                                                                                                                                                             |
| Leere Ausgabe (Command-Modus) | Befehl schlägt still fehl         | Manuell testen: `echo '{"session_id":"test","version":"0.14.1","model":{"display_name":"test"},"context_window":{"context_window_size":0,"used_percentage":0,"remaining_percentage":100,"current_usage":0,"total_input_tokens":0,"total_output_tokens":0},"workspace":{"current_dir":"/tmp"},"metrics":{"models":{},"files":{"total_lines_added":0,"total_lines_removed":0}}}' \| sh -c 'your_command'` |
| Veraltete Daten (Command-Modus)   | Kein Trigger ausgelöst               | Sende eine Nachricht oder wechsle das Modell, um ein Update auszulösen – oder setze `refreshInterval`, um den Befehl über einen Timer erneut auszuführen                                                                                                                                                                                                                                                                                       |
| Befehl zu langsam            | Komplexes Skript                 | Optimiere das Skript oder verlagere aufwendige Arbeiten in einen Hintergrund-Cache                                                                                                                                                                                                                                                                                                                                           |
| Preset-Elemente fehlen        | Bedingte Elemente haben keine Daten | `git-branch` wird außerhalb von Git-Repos ausgeblendet; `context-used` wird ausgeblendet, wenn die Nutzung 0 ist; `branch-changes` wird ausgeblendet, wenn keine Dateien geändert wurden. Dies ist erwartetes Verhalten – Elemente erscheinen, sobald ihre Daten verfügbar sind                                                                                                                                                                                                     |
| PR-Nummer wird nicht angezeigt       | `gh` CLI nicht installiert         | Installiere [GitHub CLI](https://cli.github.com/) und authentifiziere dich mit `gh auth login`. Der Lookup läuft mit einem 2s Timeout                                                                                                                                                                                                                                                                                 |