# Shell Tool (`run_shell_command`)

Dieses Dokument beschreibt das `run_shell_command` Tool für Qwen Code.

## Beschreibung

Verwende `run_shell_command`, um mit dem zugrunde liegenden System zu interagieren, Skripte auszuführen oder command-line Operationen durchzuführen. `run_shell_command` führt einen gegebenen Shell-Befehl aus. Unter Windows wird der Befehl mit `cmd.exe /c` ausgeführt. Auf anderen Plattformen wird der Befehl mit `bash -c` ausgeführt.

### Argumente

`run_shell_command` akzeptiert die folgenden Argumente:

- `command` (string, required): Der exakte Shell-Befehl, der ausgeführt werden soll.
- `description` (string, optional): Eine kurze Beschreibung des Zwecks des Befehls, die dem Benutzer angezeigt wird.
- `directory` (string, optional): Das Verzeichnis (relativ zum Projektstamm), in dem der Befehl ausgeführt werden soll. Wenn nicht angegeben, wird der Befehl im Projektstamm ausgeführt.

## Verwendung von `run_shell_command` mit Qwen Code

Bei der Verwendung von `run_shell_command` wird der Befehl als Subprozess ausgeführt. `run_shell_command` kann Hintergrundprozesse mit `&` starten. Das Tool gibt detaillierte Informationen über die Ausführung zurück, darunter:

- `Command`: Der ausgeführte Befehl.
- `Directory`: Das Verzeichnis, in dem der Befehl ausgeführt wurde.
- `Stdout`: Ausgabe des Standardausgabestreams.
- `Stderr`: Ausgabe des Standardfehlerstreams.
- `Error`: Fehlermeldung, die vom Subprozess gemeldet wurde.
- `Exit Code`: Der Exit-Code des Befehls.
- `Signal`: Die Signalnummer, falls der Befehl durch ein Signal beendet wurde.
- `Background PIDs`: Eine Liste der PIDs für gestartete Hintergrundprozesse.

Verwendung:

```
run_shell_command(command="Your commands.", description="Your description of the command.", directory="Your execution directory.")
```

## `run_shell_command` Beispiele

Dateien im aktuellen Verzeichnis auflisten:

```
run_shell_command(command="ls -la")
```

Ein Skript in einem bestimmten Verzeichnis ausführen:

```
run_shell_command(command="./my_script.sh", directory="scripts", description="Run my custom script")
```

Einen Server im Hintergrund starten:

```
run_shell_command(command="npm run dev &", description="Start development server in background")
```

## Wichtige Hinweise

- **Sicherheit:** Sei vorsichtig beim Ausführen von Befehlen, besonders solchen, die aus Benutzereingaben zusammengesetzt werden, um Sicherheitslücken zu vermeiden.
- **Interaktive Befehle:** Vermeide Befehle, die eine interaktive Eingabe des Benutzers erfordern, da dies dazu führen kann, dass das Tool hängen bleibt. Verwende nach Möglichkeit nicht-interaktive Flags (z. B. `npm init -y`).
- **Fehlerbehandlung:** Prüfe die Felder `Stderr`, `Error` und `Exit Code`, um festzustellen, ob ein Befehl erfolgreich ausgeführt wurde.
- **Hintergrundprozesse:** Wenn ein Befehl mit `&` im Hintergrund ausgeführt wird, kehrt das Tool sofort zurück und der Prozess läuft weiterhin im Hintergrund. Das Feld `Background PIDs` enthält die Prozess-ID des Hintergrundprozesses.

## Umgebungsvariablen

Wenn `run_shell_command` einen Befehl ausführt, setzt es die Umgebungsvariable `QWEN_CODE=1` in der Umgebung des Subprozesses. Dadurch können Skripte oder Tools erkennen, ob sie aus der CLI heraus ausgeführt werden.

## Command Restrictions

Du kannst die Befehle, die vom `run_shell_command` Tool ausgeführt werden dürfen, mithilfe der Einstellungen `coreTools` und `excludeTools` in deiner Konfigurationsdatei einschränken.

- `coreTools`: Um `run_shell_command` auf eine bestimmte Menge an Befehlen zu beschränken, füge Einträge im Format `run_shell_command(<command>)` zur `coreTools` Liste hinzu. Beispiel: `"coreTools": ["run_shell_command(git)"]` erlaubt ausschließlich `git` Befehle. Der generische Eintrag `run_shell_command` ohne Angabe eines konkreten Befehls wirkt wie ein Wildcard und erlaubt alle Befehle, die nicht explizit blockiert sind.
- `excludeTools`: Um bestimmte Befehle zu blockieren, füge Einträge im Format `run_shell_command(<command>)` zur `excludeTools` Liste hinzu. Beispiel: `"excludeTools": ["run_shell_command(rm)"]` blockiert jegliche `rm` Befehle.

Die Validierungslogik ist sicher und flexibel gestaltet:

1.  **Command Chaining deaktiviert**: Das Tool trennt automatisch verkettete Befehle, die mit `&&`, `||` oder `;` verbunden sind, und validiert jeden Teil separat. Wenn ein Teil der Kette nicht erlaubt ist, wird der gesamte Befehl blockiert.
2.  **Präfix-Matching**: Das Tool verwendet Präfix-Matching. Wenn du beispielsweise `git` erlaubst, kannst du auch `git status` oder `git log` ausführen.
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