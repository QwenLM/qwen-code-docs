# Shell Tool (`run_shell_command`)

Dieses Dokument beschreibt das `run_shell_command` Tool für Qwen Code.

## Beschreibung

Verwende `run_shell_command`, um mit dem zugrunde liegenden System zu interagieren, Skripte auszuführen oder command-line Operationen durchzuführen. `run_shell_command` führt einen gegebenen Shell-Befehl aus. Unter Windows wird der Befehl mit `cmd.exe /c` ausgeführt. Auf anderen Plattformen wird der Befehl mit `bash -c` ausgeführt.

### Argumente

`run_shell_command` akzeptiert die folgenden Argumente:

- `command` (string, erforderlich): Der exakte Shell-Befehl, der ausgeführt werden soll.
- `description` (string, optional): Eine kurze Beschreibung des Zwecks des Befehls, die dem Benutzer angezeigt wird.
- `directory` (string, optional): Das Verzeichnis (relativ zum Projektstamm), in dem der Befehl ausgeführt werden soll. Wenn nicht angegeben, wird der Befehl im Projektstamm ausgeführt.
- `is_background` (boolean, erforderlich): Ob der Befehl im Hintergrund ausgeführt werden soll. Dieser Parameter ist erforderlich, um eine explizite Entscheidung über den Ausführungsmodus des Befehls zu gewährleisten. Auf `true` setzen für langlaufende Prozesse wie Entwicklungsserver, Watcher oder Daemons, die weiterlaufen sollen, ohne weitere Befehle zu blockieren. Auf `false` setzen für einmalige Befehle, die abgeschlossen werden müssen, bevor fortgefahren wird.

## Verwendung von `run_shell_command` mit Qwen Code

Bei der Verwendung von `run_shell_command` wird der Befehl als Subprozess ausgeführt. Du kannst steuern, ob Befehle im Hintergrund oder Vordergrund laufen, indem du den Parameter `is_background` verwendest oder explizit ein `&` an die Befehle anhängst. Das Tool gibt detaillierte Informationen über die Ausführung zurück, darunter:

### Erforderlicher Background-Parameter

Der Parameter `is_background` ist **erforderlich** für alle Befehlsausführungen. Dieses Design stellt sicher, dass das LLM (und die Benutzer) explizit entscheiden müssen, ob jeder Befehl im Hintergrund oder Vordergrund ausgeführt werden soll. Dadurch wird ein bewusstes und vorhersehbares Verhalten bei der Befehlsausführung gefördert. Durch die obligatorische Angabe dieses Parameters wird vermieden, dass unbeabsichtigt auf die Vordergrundausführung zurückgegriffen wird, was bei lang laufenden Prozessen nachfolgende Operationen blockieren könnte.

### Background vs Foreground Execution

Das Tool behandelt Background- und Foreground-Ausführung intelligent basierend auf deiner expliziten Auswahl:

**Verwende Background-Ausführung (`is_background: true`) für:**

- Langlaufende Development-Server: `npm run start`, `npm run dev`, `yarn dev`
- Build-Watcher: `npm run watch`, `webpack --watch`
- Datenbank-Server: `mongod`, `mysql`, `redis-server`
- Web-Server: `python -m http.server`, `php -S localhost:8000`
- Jeder Befehl, der unbestimmt lange läuft, bis er manuell gestoppt wird

**Verwende Foreground-Ausführung (`is_background: false`) für:**

- Einmalige Befehle: `ls`, `cat`, `grep`
- Build-Befehle: `npm run build`, `make`
- Installationsbefehle: `npm install`, `pip install`
- Git-Operationen: `git commit`, `git push`
- Testläufe: `npm test`, `pytest`

### Ausführungs-Informationen

Das Tool gibt detaillierte Informationen über die Ausführung zurück, darunter:

- `Command`: Der Befehl, der ausgeführt wurde.
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

Einen Development-Server im Hintergrund starten (empfohlener Ansatz):

```bash
run_shell_command(command="npm run dev", description="Start development server in background", is_background=true)
```

Einen Server im Hintergrund starten (Alternative mit explizitem &):

```bash
run_shell_command(command="npm run dev &", description="Start development server in background", is_background=false)
```

Einen Build-Befehl im Vordergrund ausführen:

```bash
run_shell_command(command="npm run build", description="Build the project", is_background=false)
```

Mehrere Services im Hintergrund starten:

```bash
run_shell_command(command="docker-compose up", description="Start all services", is_background=true)
```

## Wichtige Hinweise

- **Sicherheit:** Sei vorsichtig beim Ausführen von Befehlen, besonders solchen, die aus Benutzereingaben zusammengesetzt werden, um Sicherheitslücken zu vermeiden.
- **Interaktive Befehle:** Vermeide Befehle, die eine interaktive Benutzereingabe erfordern, da dies dazu führen kann, dass das Tool hängen bleibt. Verwende nach Möglichkeit nicht-interaktive Flags (z. B. `npm init -y`).
- **Fehlerbehandlung:** Prüfe die Felder `Stderr`, `Error` und `Exit Code`, um festzustellen, ob ein Befehl erfolgreich ausgeführt wurde.
- **Hintergrundprozesse:** Wenn `is_background=true` ist oder wenn ein Befehl `&` enthält, kehrt das Tool sofort zurück und der Prozess läuft im Hintergrund weiter. Das Feld `Background PIDs` enthält die Prozess-ID des Hintergrundprozesses.
- **Auswahl der Hintergrundausführung:** Der Parameter `is_background` ist erforderlich und bietet explizite Kontrolle über den Ausführungsmodus. Du kannst auch `&` zum Befehl hinzufügen, um die manuelle Hintergrundausführung zu erzwingen, aber der Parameter `is_background` muss dennoch angegeben werden. Der Parameter macht die Absicht klarer und übernimmt automatisch das Setup für die Hintergrundausführung.
- **Befehlsbeschreibungen:** Bei Verwendung von `is_background=true` enthält die Befehlsbeschreibung einen `[background]`-Hinweis, um den Ausführungsmodus klar zu kennzeichnen.

## Umgebungsvariablen

Wenn `run_shell_command` einen Befehl ausführt, setzt es die Umgebungsvariable `QWEN_CODE=1` in der Umgebung des Subprozesses. Dies ermöglicht es Skripten oder Tools zu erkennen, ob sie aus der CLI heraus ausgeführt werden.

## Command Restrictions

Du kannst die Befehle, die vom `run_shell_command` Tool ausgeführt werden dürfen, mithilfe der Einstellungen `coreTools` und `excludeTools` in deiner Konfigurationsdatei einschränken.

- `coreTools`: Um `run_shell_command` auf eine bestimmte Menge an Befehlen zu beschränken, füge Einträge im Format `run_shell_command(<command>)` zur `coreTools` Liste hinzu. Beispiel: `"coreTools": ["run_shell_command(git)"]` erlaubt ausschließlich `git` Befehle. Der generische Eintrag `run_shell_command` ohne Angabe eines konkreten Befehls wirkt wie ein Wildcard und erlaubt alle Befehle, die nicht explizit blockiert sind.
- `excludeTools`: Um bestimmte Befehle zu blockieren, füge Einträge im Format `run_shell_command(<command>)` zur `excludeTools` Liste hinzu. Beispiel: `"excludeTools": ["run_shell_command(rm)"]` blockiert jegliche `rm` Befehle.

Die Validierungslogik ist sicher und flexibel gestaltet:

1.  **Command Chaining deaktiviert**: Das Tool trennt automatisch verkettete Befehle, die mit `&&`, `||` oder `;` verbunden sind, und validiert jeden Teil separat. Wenn ein Teil der Kette nicht erlaubt ist, wird der gesamte Befehl blockiert.
2.  **Präfix-basiertes Matching**: Das Tool verwendet Präfix-Vergleiche. Wenn du beispielsweise `git` erlaubst, kannst du auch `git status` oder `git log` ausführen.
3.  **Blocklist hat Vorrang**: Die `excludeTools` Liste wird immer zuerst überprüft. Wenn ein Befehl einem blockierten Präfix entspricht, wird er abgelehnt – selbst dann, wenn er gleichzeitig einem erlaubten Präfix aus `coreTools` entspricht.

### Beispiele für Befehlseinschränkungen

**Nur bestimmte Befehlspräfixe erlauben**

Um nur `git`- und `npm`-Befehle zu erlauben und alle anderen zu blockieren:

```json
{
  "coreTools": ["run_shell_command(git)", "run_shell_command(npm)"]
}
```

- `git status`: Erlaubt
- `npm install`: Erlaubt
- `ls -l`: Blockiert

**Bestimmte Befehlspräfixe blockieren**

Um `rm` zu blockieren und alle anderen Befehle zu erlauben:

```json
{
  "coreTools": ["run_shell_command"],
  "excludeTools": ["run_shell_command(rm)"]
}
```

- `rm -rf /`: Blockiert
- `git status`: Erlaubt
- `npm install`: Erlaubt

**Blocklist hat Vorrang**

Wenn ein Befehlspräfix sowohl in `coreTools` als auch in `excludeTools` enthalten ist, wird es blockiert.

```json
{
  "coreTools": ["run_shell_command(git)"],
  "excludeTools": ["run_shell_command(git push)"]
}
```

- `git push origin main`: Blockiert
- `git status`: Erlaubt

**Alle Shell-Befehle blockieren**

Um alle Shell-Befehle zu blockieren, füge den `run_shell_command` Wildcard zu `excludeTools` hinzu:

```json
{
  "excludeTools": ["run_shell_command"]
}
```

- `ls -l`: Blockiert
- `any other command`: Blockiert

## Sicherheitshinweis für `excludeTools`

Befehlsspezifische Einschränkungen in `excludeTools` für `run_shell_command` basieren auf einfacher String-Matching und können leicht umgangen werden. Diese Funktion ist **kein Sicherheitsmechanismus** und sollte nicht darauf verlassen werden, um nicht vertrauenswürdigen Code sicher auszuführen. Es wird empfohlen, `coreTools` zu verwenden, um explizit die Befehle auszuwählen, die ausgeführt werden dürfen.