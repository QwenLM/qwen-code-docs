# Statuszeile

> Zeige benutzerdefinierte Informationen in der Fußzeile an.

Die Statuszeile zeigt sitzungsbezogene Informationen – Modellname, Token-Nutzung, Git-Branch und mehr – im linken Bereich der Fußzeile an. Es gibt zwei Konfigurationsmodi:

- **Preset-Modus** – Wähle aus vorgefertigten Daten-Elementen über einen interaktiven Dialog oder eine JSON-Konfiguration. Keine Skripterstellung erforderlich.
- **Befehlsmodus** – Führe einen Shell-Befehl aus, der über stdin strukturierten JSON-Kontext erhält. Volle Flexibilität für benutzerdefinierte Formatierung.

```
Einzeilige Statuszeile (Standard-Bestätigungsmodus – 1 Zeile):
┌─────────────────────────────────────────────────────────────────┐
│  user@host ~/project (main) ctx:34%   🔒 docker | Debug | 67%  │  ← Statuszeile
└─────────────────────────────────────────────────────────────────┘

Mehrzeilige Statuszeile (bis zu 2 Zeilen – 2 Zeilen):
┌─────────────────────────────────────────────────────────────────┐
│  user@host ~/project (main) ctx:34%   🔒 docker | Debug | 67%  │  ← Statuszeile 1
│  ████████░░░░░░░░░░ 34% Kontext                                │  ← Statuszeile 2
└─────────────────────────────────────────────────────────────────┘

Mehrzeilige Statuszeile + nicht standardmäßiger Modus (maximal 3 Zeilen):
┌─────────────────────────────────────────────────────────────────┐
│  user@host ~/project (main) ctx:34%   🔒 docker | Debug | 67%  │  ← Statuszeile 1
│  ████████░░░░░░░░░░ 34% Kontext                                │  ← Statuszeile 2
│  Autom. Bearbeitungen akzeptieren (Umschalt + Tab zum Wechseln) │  ← Modus-Anzeige
└─────────────────────────────────────────────────────────────────┘
```

Bei Konfiguration ersetzt die Statuszeile den standardmäßigen Hinweis "? für Tastenkombinationen". Nachrichten mit hoher Priorität (Strg+C/D-Abbruch-Aufforderungen, Esc, vim INSERT-Modus) überschreiben die Statuszeile vorübergehend. Der Text der Statuszeile wird gekürzt, um in die verfügbare Breite zu passen.

## Schnellkonfiguration

Der einfachste Weg, eine Statuszeile zu konfigurieren, ist der Befehl `/statusline`. Er öffnet einen interaktiven Dialog, in dem du Preset-Elemente auswählen, Themenfarben umschalten und eine Live-Vorschau sehen kannst:

```
/statusline
```

Dies öffnet den Konfigurator für den Preset-Modus. Verwende die Pfeiltasten zum Navigieren, die Leertaste zum Umschalten der Elemente und Enter zum Bestätigen. Deine Auswahl wird automatisch in den Einstellungen gespeichert.

Du kannst `/statusline` auch spezifische Anweisungen geben, um eine Konfiguration für den Befehlsmodus erstellen zu lassen:

```
/statusline zeigen Sie Modellname und Kontextnutzungsprozentsatz an
```

---

## Preset-Modus

Der Preset-Modus bietet eine Reihe vorgefertigter Daten-Elemente, die du auswählen und kombinieren kannst – kein Shell-Befehl, kein `jq`, keine Skripterstellung erforderlich. Elemente werden als `element1 | element2 | element3` in einer Zeile dargestellt.

### Konfiguration

Füge unter dem Schlüssel `ui` in `~/.qwen/settings.json` ein `statusLine`-Objekt hinzu:

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

| Feld                  | Typ        | Erforderlich | Beschreibung                                                                                                                          |
| --------------------- | ---------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `type`                | `"preset"` | Ja           | Muss `"preset"` sein                                                                                                                  |
| `items`               | string[]   | Ja           | Geordnete Liste der Preset-Element-IDs zur Anzeige (siehe Tabelle unten). Elemente werden mit `\|` als Trennzeichen verbunden.        |
| `useThemeColors`      | boolean    | Nein         | Wendet die Farbe des aktiven `/theme` auf den Text der Statuszeile an. Standardwert: `true`.                                          |
| `hideContextIndicator` | boolean    | Nein         | Blendet den integrierten Kontextnutzungs-Indikator im rechten Bereich der Fußzeile aus. Standardwert: `false`.                        |

### Verfügbare Preset-Elemente

| Element-ID             | Standard | Beschreibung                                                             |
| ---------------------- | -------- | ------------------------------------------------------------------------ |
| `model-with-reasoning` | Ja       | Aktueller Modellname mit Reasoning-Stufe (z.B. `qwen-3-235b high`)       |
| `model`                |          | Aktueller Modellname ohne Reasoning-Stufe                                |
| `git-branch`           | Ja       | Aktueller Git-Branch-Name (ausgeblendet, wenn kein Git-Repository)       |
| `context-remaining`    | Ja       | Prozent des verbleibenden Kontextfensters (z.B. `Kontext 65,7% übrig`)   |
| `total-input-tokens`   |          | Kumulative Eingabe-Tokens der Sitzung (z.B. `30,0k gesamt in`)           |
| `total-output-tokens`  |          | Kumulative Ausgabe-Tokens der Sitzung (z.B. `5,0k gesamt out`)           |
| `current-dir`          | Ja       | Aktuelles Arbeitsverzeichnis                                             |
| `project-name`         |          | Projektname (Basisname des Arbeitsverzeichnisses)                        |
| `pull-request-number`  |          | Offene PR-Nummer für den aktuellen Branch (erfordert `gh` CLI)           |
| `branch-changes`       |          | Statistiken zu Dateiänderungen der Sitzung (z.B. `+120 -30`)             |
| `context-used`         | Ja       | Prozent des genutzten Kontextfensters (z.B. `Kontext 34,3% genutzt`)     |
| `run-state`            |          | Kompakter Sitzungsstatus (`Bereit`, `Arbeite` oder `Bestätigen`)         |
| `qwen-version`         |          | Qwen Code Version (z.B. `v0.14.1`)                                      |
| `context-window-size`  |          | Gesamtgröße des Kontextfensters (z.B. `131,1k Fenster`)                   |
| `used-tokens`          |          | Aktuelle Anzahl der Prompt-Tokens (z.B. `45,0k genutzt`)                 |
| `session-id`           |          | Aktuelle Sitzungskennung                                                 |

Elemente, die als **Standard** markiert sind, sind vorausgewählt, wenn du den `/statusline`-Dialog zum ersten Mal öffnest.

`total-input-tokens` und `total-output-tokens` sind Sitzungssummen. Sie addieren die Token-Nutzung über mehrere Runden hinweg, sodass die Eingabe-Tokens schnell anwachsen können, da jede neue Modellanfrage den aktuellen Gesprächskontext erneut enthält. Verwende `used-tokens`, wenn du die aktuelle Prompt-Größe anstelle der kumulativen Sitzungsausgaben haben möchtest.

### Beispielausgabe

Mit den Standardelementen sieht die Statuszeile wie folgt aus:

```
qwen-3-235b high | main | Kontext 65,7% übrig | /home/user/project | Kontext 34,3% genutzt
```

### Anpassung über den Dialog

Die Ausführung von `/statusline` öffnet einen interaktiven Multi-Auswahl-Dialog:

```
┌ Statuszeile konfigurieren ─────────────────────────────────────┐
│ Wähle aus, welche Elemente in der Statuszeile angezeigt werden.│
│                                                               │
│ Tippe zum Suchen                                               │
│ >                                                             │
│                                                               │
│ [x] Themenfarben verwenden     Farben des aktiven /theme anw.  │
│ ───────────────────────                                       │
│ [x] model-with-reasoning    Aktueller Modellname mit Reasoning │
│ [ ] model-only              Aktueller Modellname ohne Reason. │
│ [x] git-branch              Aktueller Git-Branch, falls vorh. │
│ [x] context-remaining       Prozent des verbleibenden Kontexts │
│ ...                                                           │
│                                                               │
│ Vorschau                                                       │
│ qwen-3-235b high | main | Kontext 65,7% übrig                │
│                                                               │
│ Pfeil hoch/runter zum Navigieren, Leertaste zum Auswählen,    │
│ Enter zum Bestätigen                                          │
└───────────────────────────────────────────────────────────────┘
```

- Tippe, um Elemente nach Name oder Beschreibung zu filtern
- Eine Live-Vorschau aktualisiert sich beim Umschalten der Elemente
- Drücke Enter, um die Konfiguration zu speichern

---

## Befehlsmodus

Der Befehlsmodus führt einen Shell-Befehl aus, dessen stdout in der Statuszeile angezeigt wird. Der Befehl erhält über stdin einen strukturierten JSON-Kontext für eine sitzungsbewusste Ausgabe.

### Voraussetzungen

- [`jq`](https://jqlang.github.io/jq/) wird zum Parsen der JSON-Eingabe empfohlen (Installation mit `brew install jq`, `apt install jq` usw.)
- Einfache Befehle, die keine JSON-Daten benötigen (z.B. `git branch --show-current`), funktionieren auch ohne `jq`

### Konfiguration

Füge unter dem Schlüssel `ui` in `~/.qwen/settings.json` ein `statusLine`-Objekt hinzu:

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

| Feld                  | Typ         | Erforderlich | Beschreibung                                                                                                                          |
| --------------------- | ----------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `type`                | `"command"` | Ja           | Muss `"command"` sein                                                                                                                 |
| `command`             | string      | Ja           | Shell-Befehl, der ausgeführt wird. Erhält JSON über stdin, stdout wird angezeigt (bis zu 2 Zeilen).                                   |
| `refreshInterval`      | number      | Nein         | Führe den Befehl alle N Sekunden erneut aus (mindestens 1). Nützlich für Daten, die sich ohne Agent-Statusereignis ändern (Uhr, Kontingent, Laufzeit). |
| `respectUserColors`    | boolean     | Nein         | Behalte ANSI-Farbcodes in der Befehlsausgabe bei, anstatt abgedunkelten Fußzeilenstil anzuwenden. Standardwert: `false`.                |
| `hideContextIndicator` | boolean     | Nein         | Blendet den integrierten Kontextnutzungs-Indikator im rechten Bereich der Fußzeile aus. Standardwert: `false`.                        |

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

| Feld                                 | Typ             | Beschreibung                                                                                     |
| ------------------------------------ | --------------- | ------------------------------------------------------------------------------------------------ |
| `session_id`                         | string          | Eindeutige Sitzungskennung                                                                       |
| `version`                            | string          | Qwen Code Version                                                                                |
| `model.display_name`                 | string          | Aktueller Modellname                                                                             |
| `context_window.context_window_size`  | number          | Gesamtgröße des Kontextfensters in Tokens                                                        |
| `context_window.used_percentage`     | number          | Kontextfensternutzung als Prozentsatz (0–100)                                                     |
| `context_window.remaining_percentage`| number          | Verbleibender Kontextfenster als Prozentsatz (0–100)                                             |
| `context_window.current_usage`       | number          | Token-Anzahl des letzten API-Aufrufs (aktuelle Kontextgröße)                                     |
| `context_window.total_input_tokens`  | number          | Gesamtzahl der in dieser Sitzung verbrauchten Eingabe-Tokens                                     |
| `context_window.total_output_tokens` | number          | Gesamtzahl der in dieser Sitzung verbrauchten Ausgabe-Tokens                                     |
| `workspace.current_dir`              | string          | Aktuelles Arbeitsverzeichnis                                                                     |
| `git`                                | object \| absent | Nur vorhanden, wenn ein Git-Repository aktiv ist.                                                |
| `git.branch`                         | string          | Aktueller Branch-Name                                                                            |
| `worktree`                           | object \| absent | Nur vorhanden, wenn ein aktiver Worktree (erstellt durch `enter_worktree`) verwendet wird.        |
| `worktree.name`                      | string          | Worktree-Slug-Name                                                                               |
| `worktree.path`                      | string          | Absoluter Pfad zum Worktree-Verzeichnis                                                          |
| `worktree.branch`                    | string          | Branch, der im Worktree ausgecheckt ist                                                          |
| `worktree.original_cwd`              | string          | Arbeitsverzeichnis vor dem Betreten des Worktrees                                                |
| `worktree.original_branch`           | string          | Branch, der vor dem Betreten des Worktrees aktiv war                                             |
| `metrics.models.<id>.api`            | object          | Pro-Modell-API-Statistiken: `total_requests`, `total_errors`, `total_latency_ms`                   |
| `metrics.models.<id>.tokens`         | object          | Pro-Modell-Token-Nutzung: `prompt`, `completion`, `total`, `cached`, `thoughts`                  |
| `metrics.files`                      | object          | Dateiänderungsstatistiken: `total_lines_added`, `total_lines_removed`                             |
| `vim`                                | object \| absent | Nur vorhanden, wenn der vim-Modus aktiviert ist. Enthält `mode` (`"INSERT"` oder `"NORMAL"`).  |

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

> Hinweis: Das Feld `git.branch` wird direkt in der JSON-Eingabe bereitgestellt – es ist nicht nötig, `git` separat aufzurufen.

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

Verwende `refreshInterval`, wenn die Statuszeile Daten anzeigt, die sich ohne Agent-Ereignis ändern (z.B. Uhr, Laufzeit oder Ratenbegrenzungszähler):

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

Referenziere es dann in den Einstellungen:

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

- **Aktualisierungsauslöser**: Die Statuszeile aktualisiert sich, wenn das Modell wechselt, eine neue Nachricht gesendet wird (Token-Anzahl ändert sich), der vim-Modus umgeschaltet wird, der Git-Branch wechselt, Tool-Aufrufe abgeschlossen werden oder Dateiänderungen auftreten. Aktualisierungen werden entprellt (300 ms).
- **Ausgabe**: Bis zu 2 Zeilen. Jede Zeile wird als separate Zeile im linken Bereich der Fußzeile dargestellt. Zeilen, die die verfügbare Breite überschreiten, werden gekürzt.
- **Hot-Reload**: Änderungen an `ui.statusLine` in den Einstellungen werden sofort übernommen – kein Neustart erforderlich.
- **Entfernung**: Lösche den Schlüssel `ui.statusLine` aus den Einstellungen, um die Statuszeile zu deaktivieren. Der Hinweis "? für Tastenkombinationen" wird wieder angezeigt.

**Nur Befehlsmodus:**

- **Timeout**: Befehle, die länger als 5 Sekunden dauern, werden beendet. Die Statuszeile wird bei Fehlern geleert.
- **Aktualisierung**: Setze `refreshInterval` (Sekunden), um den Befehl zusätzlich auf einem Timer erneut auszuführen – nützlich für Daten, die sich ohne Agent-Ereignis ändern (Uhr, Ratenbegrenzungen, Build-Status).
- **Shell**: Die Befehle werden unter macOS/Linux mit `/bin/sh` ausgeführt. Unter Windows wird standardmäßig `cmd.exe` verwendet – umgebe POSIX-Befehle mit `bash -c "..."` oder verweise auf ein Bash-Skript (z.B. `bash ~/.qwen/statusline-command.sh`).

**Nur Preset-Modus:**

- **Keine externen Abhängigkeiten**: Preset-Elemente werden intern berechnet – keine Shell-Befehle, kein `jq`, keine Timeouts.
- **Themenintegration**: Wenn `useThemeColors` auf `true` (Standard) gesetzt ist, verwendet der Text der Statuszeile die Farbe des aktiven `/theme`. Bei `false` wird abgedunkelter Fußzeilenstil angewendet.
- **PR-Suche**: Das Element `pull-request-number` führt im Hintergrund `gh pr view` aus (2s Timeout). Es wird nur ausgelöst, wenn sich der Branch ändert, nicht bei jeder Aktualisierung.

## Fehlerbehebung

| Problem                     | Ursache                         | Lösung                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Statuszeile wird nicht angezeigt | Konfiguration am falschen Pfad  | Muss unter `ui.statusLine` liegen, nicht auf oberster Ebene `statusLine`                                                                                                                                                                                                                                                                                                                   |
| Leere Ausgabe (Befehlsmodus) | Befehl schlägt still fehl        | Manuell testen: `echo '{"session_id":"test","version":"0.14.1","model":{"display_name":"test"},"context_window":{"context_window_size":0,"used_percentage":0,"remaining_percentage":100,"current_usage":0,"total_input_tokens":0,"total_output_tokens":0},"workspace":{"current_dir":"/tmp"},"metrics":{"models":{},"files":{"total_lines_added":0,"total_lines_removed":0}}}' \| sh -c 'dein_befehl'` |
| Veraltete Daten (Befehlsmodus) | Kein Auslöser ausgelöst         | Sende eine Nachricht oder wechsle das Modell, um eine Aktualisierung auszulösen – oder setze `refreshInterval`, um den Befehl auf einem Timer erneut auszuführen                                                                                                                                                                                                                          |
| Befehl zu langsam            | Komplexes Skript                | Optimiere das Skript oder verlagere schwere Arbeit in einen Hintergrund-Cache                                                                                                                                                                                                                                                                                                             |
| Preset-Elemente fehlen       | Bedingte Elemente haben keine Daten | `git-branch` wird außerhalb von Git-Repos ausgeblendet; `context-used` wird bei einer Nutzung von 0 ausgeblendet; `branch-changes` wird ausgeblendet, wenn keine Dateien geändert wurden. Das ist erwartet – Elemente erscheinen, sobald ihre Daten verfügbar sind                                                                                                                    |
| PR-Nummer wird nicht angezeigt | `gh` CLI nicht installiert      | Installiere [GitHub CLI](https://cli.github.com/) und authentifiziere dich mit `gh auth login`. Die Suche läuft mit einem 2s Timeout.                                                                                                                                                                                                                                                     |