# Shell Tool (`run_shell_command`)

Dieses Dokument beschreibt das `run_shell_command` Tool für Qwen Code.

## Beschreibung

Verwende `run_shell_command`, um mit dem zugrunde liegenden System zu interagieren, Skripte auszuführen oder command-line Operationen durchzuführen. `run_shell_command` führt einen gegebenen Shell-Befehl aus, einschließlich interaktiver Befehle, die eine Benutzereingabe erfordern (z. B. `vim`, `git rebase -i`), wenn die Einstellung `tools.shell.enableInteractiveShell` auf `true` gesetzt ist.

Unter Windows werden Befehle mit `cmd.exe /c` ausgeführt. Auf anderen Plattformen werden sie mit `bash -c` ausgeführt.

### Argumente

`run_shell_command` akzeptiert die folgenden Argumente:

- `command` (string, erforderlich): Der exakte Shell-Befehl, der ausgeführt werden soll.
- `description` (string, optional): Eine kurze Beschreibung des Zwecks des Befehls, die dem Benutzer angezeigt wird.
- `directory` (string, optional): Das Verzeichnis (relativ zum Projektstamm), in dem der Befehl ausgeführt werden soll. Wenn nicht angegeben, wird der Befehl im Projektstamm ausgeführt.
- `is_background` (boolean, erforderlich): Ob der Befehl im Hintergrund ausgeführt werden soll. Dieser Parameter ist erforderlich, um eine explizite Entscheidung über den Ausführungsmodus des Befehls zu gewährleisten. Auf `true` setzen für langlaufende Prozesse wie Entwicklungsserver, Watcher oder Daemons, die weiterlaufen sollen, ohne weitere Befehle zu blockieren. Auf `false` setzen für einmalige Befehle, die abgeschlossen sein müssen, bevor fortgefahren wird.

## Verwendung von `run_shell_command` mit Qwen Code

Bei der Verwendung von `run_shell_command` wird der Befehl als Subprozess ausgeführt. Du kannst steuern, ob Befehle im Hintergrund oder Vordergrund laufen, indem du den Parameter `is_background` verwendest oder explizit `&` zu den Befehlen hinzufügst. Das Tool gibt detaillierte Informationen über die Ausführung zurück, darunter:

### Erforderlicher Background-Parameter

Der Parameter `is_background` ist **erforderlich** für alle Befehlsausführungen. Dieses Design stellt sicher, dass das LLM (und die Benutzer) explizit entscheiden müssen, ob jeder Befehl im Hintergrund oder Vordergrund ausgeführt werden soll. Dadurch wird ein bewusstes und vorhersehbares Verhalten bei der Befehlsausführung gefördert. Durch die Verpflichtung zur Angabe dieses Parameters wird vermieden, dass unbeabsichtigt auf die Vordergrundausführung zurückgegriffen wird, was bei langlaufenden Prozessen nachfolgende Operationen blockieren könnte.

### Hintergrund- vs Vordergrundausführung

Das Tool behandelt intelligent Hintergrund- und Vordergrundausführung basierend auf deiner expliziten Auswahl:

**Verwende die Hintergrundausführung (`is_background: true`) für:**

- Langlaufende Entwicklungsserver: `npm run start`, `npm run dev`, `yarn dev`
- Build-Watcher: `npm run watch`, `webpack --watch`
- Datenbankserver: `mongod`, `mysql`, `redis-server`
- Webserver: `python -m http.server`, `php -S localhost:8000`
- Jeder Befehl, der unbestimmt lange läuft, bis er manuell gestoppt wird

**Verwende die Vordergrundausführung (`is_background: false`) für:**

- Einmalige Befehle: `ls`, `cat`, `grep`
- Build-Befehle: `npm run build`, `make`
- Installationsbefehle: `npm install`, `pip install`
- Git-Operationen: `git commit`, `git push`
- Testläufe: `npm test`, `pytest`

### Ausführungs-Informationen

Das Tool gibt detaillierte Informationen über die Ausführung zurück, darunter:

- `Command`: Der ausgeführte Befehl.
- `Directory`: Das Verzeichnis, in dem der Befehl ausgeführt wurde.
- `Stdout`: Ausgabe des Standard-Ausgabestreams.
- `Stderr`: Ausgabe des Standard-Fehlerstreams.
- `Error`: Jegliche Fehlermeldung, die vom Subprozess gemeldet wurde.
- `Exit Code`: Der Exit-Code des Befehls.
- `Signal`: Die Signalnummer, falls der Befehl durch ein Signal beendet wurde.
- `Background PIDs`: Eine Liste der PIDs für alle gestarteten Hintergrundprozesse.

Verwendung:

```bash
run_shell_command(command="Your commands.", description="Your description of the command.", directory="Your execution directory.", is_background=false)
```

**Hinweis:** Der Parameter `is_background` ist erforderlich und muss für jede Befehlsausführung explizit angegeben werden.

## `run_shell_command` Beispiele

Dateien im aktuellen Verzeichnis auflisten:

```bash
run_shell_command(command="ls -la", is_background=false)
```

Ein Skript in einem bestimmten Verzeichnis ausführen:

```bash
run_shell_command(command="./my_script.sh", directory="scripts", description="Run my custom script", is_background=false)
```

Einen Background-Entwicklungsserver starten (empfohlener Ansatz):

```bash
run_shell_command(command="npm run dev", description="Start development server in background", is_background=true)
```

Einen Background-Server starten (Alternative mit explizitem &):

```bash
run_shell_command(command="npm run dev &", description="Start development server in background", is_background=false)
```

Einen Build-Befehl im Vordergrund ausführen:

```bash
run_shell_command(command="npm run build", description="Build the project", is_background=false)
```

Mehrere Background-Services starten:

```bash
run_shell_command(command="docker-compose up", description="Start all services", is_background=true)
```

## Konfiguration

Du kannst das Verhalten des `run_shell_command`-Tools konfigurieren, indem du deine `settings.json`-Datei bearbeitest oder den `/settings`-Befehl im Qwen Code verwendest.

### Interaktive Befehle aktivieren

Um interaktive Befehle zu aktivieren, musst du die Einstellung `tools.shell.enableInteractiveShell` auf `true` setzen. Dadurch wird `node-pty` für die Ausführung von Shell-Befehlen verwendet, was interaktive Sessions ermöglicht. Falls `node-pty` nicht verfügbar ist, greift das System auf die `child_process`-Implementierung zurück, die keine interaktiven Befehle unterstützt.

**Beispiel `settings.json`:**

```json
{
  "tools": {
    "shell": {
      "enableInteractiveShell": true
    }
  }
}
```

### Farbige Ausgabe aktivieren

Um Farben in der Shell-Ausgabe anzuzeigen, musst du die Einstellung `tools.shell.showColor` auf `true` setzen. **Hinweis: Diese Einstellung gilt nur, wenn `tools.shell.enableInteractiveShell` aktiviert ist.**

**Beispiel `settings.json`:**

```json
{
  "tools": {
    "shell": {
      "showColor": true
    }
  }
}
```

### Pager konfigurieren

Du kannst einen benutzerdefinierten Pager für die Shell-Ausgabe festlegen, indem du die Einstellung `tools.shell.pager` anpasst. Der Standard-Pager ist `cat`. **Hinweis: Diese Einstellung gilt nur, wenn `tools.shell.enableInteractiveShell` aktiviert ist.**

**Beispiel `settings.json`:**

```json
{
  "tools": {
    "shell": {
      "pager": "less"
    }
  }
}
```

## Interaktive Befehle

Das `run_shell_command`-Tool unterstützt jetzt interaktive Befehle durch die Integration eines Pseudo-Terminals (pty). Dadurch kannst du Befehle ausführen, die eine Echtzeiteingabe benötigen, wie Texteditoren (`vim`, `nano`), Terminal-basierte UIs (`htop`) oder interaktive Versionskontroll-Operationen (`git rebase -i`).

Während ein interaktiver Befehl läuft, kannst du Eingaben direkt aus Qwen Code senden. Um den Fokus auf die interaktive Shell zu setzen, drücke `Strg+F`. Die Terminalausgabe, inklusive komplexer TUIs, wird korrekt dargestellt.

## Wichtige Hinweise

- **Sicherheit:** Sei vorsichtig beim Ausführen von Commands, besonders solchen, die aus Benutzereingaben konstruiert werden, um Sicherheitslücken zu vermeiden.
- **Fehlerbehandlung:** Prüfe die Felder `Stderr`, `Error` und `Exit Code`, um festzustellen, ob ein Command erfolgreich ausgeführt wurde.
- **Hintergrundprozesse:** Wenn `is_background=true` ist oder wenn ein Command ein `&` enthält, kehrt das Tool sofort zurück und der Prozess läuft im Hintergrund weiter. Das Feld `Background PIDs` enthält dann die Prozess-ID des Hintergrundprozesses.
- **Optionen für die Hintergrundausführung:** Der Parameter `is_background` ist erforderlich und ermöglicht eine explizite Kontrolle über den Ausführungsmodus. Du kannst auch manuell `&` zum Command hinzufügen, um es im Hintergrund laufen zu lassen, aber der Parameter `is_background` muss trotzdem angegeben werden. Dieser Parameter macht die Absicht klarer und übernimmt automatisch das Setup für die Hintergrundausführung.
- **Command-Beschreibungen:** Bei Verwendung von `is_background=true` wird in der Command-Beschreibung ein `[background]`-Hinweis eingefügt, um den Ausführungsmodus deutlich zu kennzeichnen.

## Umgebungsvariablen

Wenn `run_shell_command` einen Befehl ausführt, setzt es die Umgebungsvariable `QWEN_CODE=1` in der Umgebung des Subprozesses. Dies ermöglicht es Skripten oder Tools zu erkennen, ob sie aus der CLI heraus ausgeführt werden.

## Command Restrictions

Du kannst die Befehle einschränken, die vom `run_shell_command` Tool ausgeführt werden dürfen, indem du die Einstellungen `tools.core` und `tools.exclude` in deiner Konfigurationsdatei verwendest.

- `tools.core`: Um `run_shell_command` auf eine bestimmte Menge von Befehlen zu beschränken, füge Einträge im Format `run_shell_command(<command>)` zur `core` Liste unter der Kategorie `tools` hinzu. Beispiel: `"tools": {"core": ["run_shell_command(git)"]}` erlaubt nur `git` Befehle. Der generische Eintrag `run_shell_command` wirkt wie ein Wildcard und erlaubt jeden Befehl, der nicht explizit blockiert ist.
- `tools.exclude`: Um spezifische Befehle zu blockieren, füge Einträge im Format `run_shell_command(<command>)` zur `exclude` Liste unter der Kategorie `tools` hinzu. Beispiel: `"tools": {"exclude": ["run_shell_command(rm)"]}` blockiert `rm` Befehle.

Die Validierungslogik ist sicher und flexibel gestaltet:

1.  **Command Chaining deaktiviert**: Das Tool teilt automatisch Befehlsketten, die mit `&&`, `||` oder `;` verbunden sind, in einzelne Teile auf und validiert jeden Teil separat. Wenn ein Teil der Kette nicht erlaubt ist, wird der gesamte Befehl blockiert.
2.  **Prefix Matching**: Das Tool verwendet Prefix-Matching. Wenn du zum Beispiel `git` erlaubst, kannst du `git status` oder `git log` ausführen.
3.  **Blocklist hat Vorrang**: Die `tools.exclude` Liste wird immer zuerst überprüft. Wenn ein Befehl einem blockierten Präfix entspricht, wird er abgelehnt – selbst dann, wenn er auch einem erlaubten Präfix in `tools.core` entspricht.

### Beispiele für Befehlseinschränkungen

**Nur bestimmte Befehlspräfixe erlauben**

Um nur `git`- und `npm`-Befehle zu erlauben und alle anderen zu blockieren:

```json
{
  "tools": {
    "core": ["run_shell_command(git)", "run_shell_command(npm)"]
  }
}
```

- `git status`: Erlaubt
- `npm install`: Erlaubt
- `ls -l`: Blockiert

**Bestimmte Befehlspräfixe blockieren**

Um `rm` zu blockieren und alle anderen Befehle zu erlauben:

```json
{
  "tools": {
    "core": ["run_shell_command"],
    "exclude": ["run_shell_command(rm)"]
  }
}
```

- `rm -rf /`: Blockiert
- `git status`: Erlaubt
- `npm install`: Erlaubt

**Blocklist hat Vorrang**

Wenn ein Befehlspräfix sowohl in `tools.core` als auch in `tools.exclude` steht, wird es blockiert.

```json
{
  "tools": {
    "core": ["run_shell_command(git)"],
    "exclude": ["run_shell_command(git push)"]
  }
}
```

- `git push origin main`: Blockiert
- `git status`: Erlaubt

**Alle Shell-Befehle blockieren**

Um alle Shell-Befehle zu blockieren, füge den `run_shell_command` Wildcard zu `tools.exclude` hinzu:

```json
{
  "tools": {
    "exclude": ["run_shell_command"]
  }
}
```

- `ls -l`: Blockiert
- `irgendein anderer Befehl`: Blockiert

## Sicherheitshinweis für `excludeTools`

Befehlsspezifische Einschränkungen in `excludeTools` für `run_shell_command` basieren auf einfacher String-Matching und können leicht umgangen werden. Dieses Feature ist **kein Sicherheitsmechanismus** und sollte nicht darauf verlassen werden, um nicht vertrauenswürdigen Code sicher auszuführen. Es wird empfohlen, `coreTools` zu verwenden, um explizit die Befehle auszuwählen, die ausgeführt werden dürfen.