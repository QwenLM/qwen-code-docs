# FileChanged-Hooks


Verwende `FileChanged`, um Dateien zu beobachten, die von Qwen Code, Shell-Befehlen, Editoren
oder anderen Prozessen geändert wurden. Er läuft in lokalen, nicht-verwalteten Sessions. Siehe den
[Hooks guide](./hooks.md) für Hook-Konfiguration, Executors und Trust-Regeln.

## Event-Input

Der Input umfasst die [common hook fields](./hooks.md#hook-input-structure) und:

```json
{
  "file_path": "/home/me/work/demo/.envrc",
  "event": "change"
}
```

`file_path` ist absolut. `event` ist `add`, `change` oder `unlink` für eine beobachtete
Datei-Hinzufügung, -Änderung oder -Löschung. Die üblichen `session_id` und `cwd`
gehören zur lauschenden Session; sie identifizieren nicht den Schreiber. Mehrere
Sessions, die ein gemeinsames Verzeichnis beobachten, können jeweils seine Änderungen empfangen. Dateiinhalte
werden nicht mitgeliefert.

Es werden nur Datei-Events ausgeliefert. Verzeichnis-eigene `addDir`- und `unlinkDir`-Events
werden nicht ausgeliefert. Integrationen, die den Lebenszyklus eines überwachten Roots verfolgen, müssen
den Dateisystemzustand prüfen (zum Beispiel mit `stat`) und unabhängig abgleichen;
das `unlink` eines Kinds beweist nicht, dass der Root entfernt wurde.

## Dateinamen im Arbeitsverzeichnis überwachen

Füge einen `FileChanged`-Hook mit literalen Dateinamen hinzu, getrennt durch `|`:

```json
{
  "hooks": {
    "FileChanged": [
      {
        "matcher": ".envrc|.env",
        "hooks": [
          {
            "type": "command",
            "name": "configuration-changed",
            "command": "node \"$QWEN_PROJECT_DIR/.qwen/hooks/on-file-changed.mjs\""
          }
        ]
      }
    ]
  }
}
```

Dies registriert `.envrc` und `.env` im cwd der Session. Statische Registrierung expandiert
keine Globs und durchsucht keine Verzeichnisse rekursiv. Weggelassene oder leere Matcher,
`*` und `.*` registrieren keine statischen Pfade; diese Hooks empfangen Events von den
überwachten Pfaden der Session, einschließlich dynamischer Pfade. Events werden gegen den Dateinamen (Basename) gefiltert unter Verwendung der
[bestehenden Matcher-Regeln](./hooks.md#matcher-patterns).

Regex-Pattern filtern bereits überwachte Pfade; registriere ihre Dateien oder Verzeichnisse
explizit über `watchPaths`.

Statische Roots akzeptieren nur bloße literale Dateinamen, einschließlich Dotfiles. Regex/Glob-
Metazeichen und Pfadtrennzeichen erzeugen keine statischen Roots. Vorhandene
Verzeichnisse und Pfade, die nicht inspiziert werden können, werden ausgeschlossen; fehlende Dateien können auf Erstellung überwacht
werden. Die statische Dateierkennung beobachtet ihr Elternverzeichnis und schließt nicht zugehörige Einträge vor dem Durchlaufen aus. Verwende explizite `watchPaths` für rekursive Verzeichnisse. Das Ändern
des Arbeitsverzeichnisses der Session verschiebt statische Roots, bevor die Verschiebung abgeschlossen ist;
explizite absolute dynamische Roots bleiben unverändert.

## Verzeichnisse und Pfade außerhalb von cwd überwachen

Ein erfolgreicher synchroner `SessionStart`-Hook kann absolute Dateien oder Verzeichnisse
über `hookSpecificOutput.watchPaths` registrieren. Verzeichnisse werden rekursiv überwacht,
einschließlich später erstellter Kinder. Die rekursive Erkennung überspringt `.git`- und
`node_modules`-Unterbäume. Um einen Pfad darin zu beobachten, registriere diese Datei oder
dieses Verzeichnis explizit. Spezielle Dateitypen werden ignoriert, und gewöhnliche Verzeichnisse
haben keine Tiefenbegrenzung. Die anfängliche Registrierung wartet auf die Bereitschaft des Watchers
bevor `SessionStart` zurückkehrt.

Die rekursive Erkennung ignoriert temporäre Dateien für atomare Schreibvorgänge mit dem Namen
`<target>.<12 lowercase hex characters>.tmp`, einschließlich verzögerter Umbenennungen und
Waisen. Die explizite Registrierung einer solchen Datei beobachtet sie dennoch. Verzeichnisse mit
diesem Suffix bleiben durchsuchbar, und andere `.tmp`-Dateien werden normal beobachtet.

Zum Beispiel registriere Memory-Ordner:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "name": "watch-memory-folders",
            "command": "node \"$QWEN_PROJECT_DIR/.qwen/hooks/watch-memory.mjs\""
          }
        ]
      }
    ],
    "FileChanged": [
      {
        "hooks": [
          {
            "type": "command",
            "name": "memory-file-changed",
            "command": "node \"$QWEN_PROJECT_DIR/.qwen/hooks/on-file-changed.mjs\""
          }
        ]
      }
    ]
  }
}
```

Lass `watch-memory.mjs` dieses JSON auf stdout ausgeben. Ersetze die Beispielpfade durch
die tatsächlichen absoluten Ordner, die von `/memory` angezeigt werden:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "watchPaths": [
      "/home/me/.qwen/projects/demo/memory",
      "/home/me/.qwen/memories"
    ]
  }
}
```

Der `FileChanged`-Hook hat keinen Matcher, daher empfängt er Änderungen in allen registrierten
Verzeichnissen. Sein Handler liest das Event-JSON von stdin. Wähle ein Log- oder Synchronisierungsziel
außerhalb der überwachten Pfade, um zu vermeiden, dass der Handler durch eigene Schreibvorgänge ausgelöst wird.

## Dynamische Pfade aktualisieren

Für mehrere Workspaces im selben Dateisystem registriere alle tatsächlichen Memory-
Verzeichnisse in einer Liste. Route Benachrichtigungen über `file_path` und dein eigenes
Verzeichnis-zu-Workspace-Mapping, statt über das `cwd` der lauschenden Session.
Unabhängige Sessions können dieselbe gemeinsame Wurzel beobachten, daher dedupliziere die Arbeit
im Business-Handler. Roots in einem anderen Container oder einer Remote-Instanz benötigen einen
Watcher in diesem Dateisystem-Besitzer; das Registrieren ihrer Pfade auf dem Host beobachtet sie nicht.

Erfolgreiche synchrone `SessionStart`- und `FileChanged`-Outputs können `watchPaths` setzen. Füge den
passenden `hookEventName` in `hookSpecificOutput` ein.

| Output                                  | Auswirkung auf dynamische Pfade      |
| --------------------------------------- | ------------------------------------ |
| Eine Liste absoluter Dateien oder Verzeichnisse | Ersetzt die vorherige dynamische Liste |
| `[]`                                    | Löscht die dynamische Liste          |
| Weggelassene oder ungültige `watchPaths`        | Behält die vorherige dynamische Liste  |
| Output eines asynchronen Hooks               | Registriert oder ändert keine Pfade    |

Wenn mehrere Hooks Listen zurückgeben, gewinnt die letzte gültige, explizit gelieferte Liste in
der Hook-Ausführungsreihenfolge. Alle Einträge müssen absolute Pfade sein; ein ungültiger Eintrag
macht die Liste ungültig. Statische Dateinamen-Registrierungen bleiben nach einem dynamischen Ersatz oder Löschen aktiv.

Um dynamische Pfade aus einem `FileChanged`-Handler zu löschen, gib zurück:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "FileChanged",
    "watchPaths": []
  }
}
```

## Beobachtungsgrenzen

Der anfängliche Verzeichnis-Scan wird nicht wiederholt. Native Dateisystem-Events von einer
kürzlichen Schreiboperation können nach der Registrierung eintreffen. Explizit registrierte Symbolic-Link-
Dateien und Verzeichnis-Roots beobachten ihre Ziele, einschließlich Links in Vorgängerpfaden.
Benachrichtigungen verwenden den konfigurierten Alias; das Registrieren mehrerer Aliase auf ein Ziel
erzeugt eine Benachrichtigung für jeden Alias. Aktualisiere die Registrierung nach dem Neuausrichten eines
Links. Symbolic Links, die innerhalb eines rekursiven Roots entdeckt werden, werden nicht durchlaufen.
Events werden gemeldet, nachdem Schreibvorgänge abgeschlossen sind.
Die Überwachung erfolgt nach bestem Bemühen: Dateisystem-Zusammenlegungen, unzugängliche Pfade, Prozess-
Ausfallzeiten und Pfad-Neukonfigurationen können Lücken hinterlassen. Integrationen, die eine
vollständige synchronisierte Kopie erfordern, müssen anfängliche Scans, Abgleich und Wiederholung handhaben.
Watcher- oder Hook-Fehler werden protokolliert und lassen die ursprüngliche Dateioperation
unverändert.

`FileChanged` kann eine Schreiboperation nicht ablehnen oder rückgängig machen oder Modell-Kontext hinzufügen. Nur explizit
registrierte Pfade werden überwacht: Memory-Ordner werden nicht automatisch registriert,
und es gibt kein dediziertes Auto-Memory-Aktivierungs-/Deaktivierungs-Event. Ein Hook, der eine
überwachte Datei schreibt, kann sich selbst auslösen; vermeide diese Schreibvorgänge oder dedupliziere die Arbeit.

SSH-Ausführungsumgebungen, Shell-Sandbox-Worker und verwaltete Dispatcher starten
keinen lokalen Dateisystem-Watcher. Normale Hook-Aktivierung und Trust-Regeln
gelten weiterhin. Die Überwachung stoppt, wenn die besitzende Session heruntergefahren wird.
