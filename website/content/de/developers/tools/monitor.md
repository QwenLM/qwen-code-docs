# Monitor-Tool (`monitor`)

Dieses Dokument beschreibt das `monitor`-Tool für Qwen Code.

## Beschreibung

Verwenden Sie `monitor`, um ein langlebiges Shell-Kommando zu starten, das stdout- und stderr-Zeilen als Hintergrundaufgaben-Benachrichtigungen an den Agenten streamt. Es ist für Watch-artige Kommandos gedacht, bei denen im Laufe der Zeit neue Ausgaben wichtig sind, wie das Tailing von Logs, das Beobachten von Build-Ausgaben, das Abfragen eines Health-Endpunkts oder das Beobachten von Dateiänderungen.

Der Monitor läuft im Hintergrund, sodass der Agent weiterarbeiten kann, während Ereignisse eintreffen. Jede nicht-leere Ausgabezeile wird zu einem Benachrichtigungsereignis, unterliegt jedoch einer Drosselung (Throttling).

### Argumente

`monitor` akzeptiert die folgenden Argumente:

- `command` (string, erforderlich): Das Shell-Kommando, das ausgeführt und überwacht werden soll.
- `description` (string, optional): Eine kurze Beschreibung, was der Monitor überwacht. Der Anzeigetext wird auf 80 Zeichen gekürzt.
- `max_events` (number, optional): Stoppt nach dieser Anzahl von Benachrichtigungsereignissen. Muss eine positive Ganzzahl sein. Standardwert: `1000`; Maximum: `10000` (Werte außerhalb dieses Bereichs werden abgelehnt, nicht stillschweigend begrenzt).
- `idle_timeout_ms` (number, optional): Stoppt, wenn das Kommando für diese Anzahl Millisekunden keine Ausgabe erzeugt. Muss eine positive Ganzzahl sein. Standardwert: `300000` (5 Minuten); Maximum: `600000` (10 Minuten); Werte außerhalb dieses Bereichs werden abgelehnt.
- `directory` (string, optional): Ein absoluter Pfad, in dem das Kommando ausgeführt werden soll. Muss (nach Symlink-Kanonisierung) innerhalb eines der registrierten Workspace-Verzeichnisse aufgelöst werden und darf nicht im user-skills-Verzeichnis liegen. Wenn nicht angegeben, verwendet Qwen Code das Projektverzeichnis.

## So verwenden Sie `monitor` mit Qwen Code

Das Modell wählt das `monitor`-Tool, wenn es einen Prozess über die Zeit beobachten muss, anstatt ein einzelnes Kommandoergebnis zu sammeln. Ein erfolgreicher Aufruf gibt eine Monitor-ID, das Kommando, das Ereignislimit und den Leerlauf-Timeout zurück.

Verwendung:

```
monitor(command="tail -f logs/app.log", description="app log stream")
```

Die Monitorausgabe ist im Gespräch als Aufgabenbenachrichtigungen sichtbar. Sie können auch laufende und abgeschlossene Monitore mit `/tasks` oder dem interaktiven Dialog für Hintergrundaufgaben einsehen.

Um einen laufenden Monitor zu stoppen, verwenden Sie das `task_stop`-Tool mit der Monitor-ID:

```
task_stop(task_id="mon_abc123def4567890")
```

## `monitor`-Beispiele

Anwendungslog überwachen:

```
monitor(
  command="tail -f logs/app.log",
  description="application log stream",
  max_events=200
)
```

Einen Entwicklungsserver oder Build-Watcher überwachen:

```
monitor(
  command="npm run build -- --watch",
  description="watch build output",
  idle_timeout_ms=600000
)
```

Lokalen Health-Endpunkt abfragen:

```
monitor(
  command="while true; do curl -s http://localhost:8080/health; sleep 5; done",
  description="local health check",
  max_events=120
)
```

Von einem bestimmten Workspace-Verzeichnis aus ausführen:

```
monitor(
  command="npm run dev",
  description="frontend dev server",
  directory="/absolute/path/to/workspace/packages/web"
)
```

## Monitor vs. Hintergrund-Shell-Kommandos

Verwenden Sie `monitor`, wenn der Agent auf Streaming-Ausgaben reagieren muss, während das Kommando weiterläuft. Verwenden Sie stattdessen `run_shell_command`, wenn Sie ein einmaliges Ergebnis oder die vollständige Kommandoausgabe benötigen.

| Anforderung                                           | Verwendung                               |
| :----------------------------------------------------- | :--------------------------------------- |
| Logs, Build-Ausgaben oder periodische Status-Updates überwachen | `monitor`                                |
| Ein einmaliges Kommando ausführen und die vollständige Ausgabe lesen | `run_shell_command(is_background=false)` |
| Einen Daemon starten, der keine sinnvolle Ausgabe erzeugt | `run_shell_command(is_background=true)`  |

Fügen Sie `monitor`-Kommandos kein `&` hinzu. Ein abschließendes `&`, wie `tail -f log &`, wird entfernt, da der Monitor die Hintergrundausführung selbst verwaltet. Ein nicht-finales `&`, wie `cmd1 & cmd2`, wird direkt abgelehnt; strukturieren Sie solche Kommandos stattdessen ohne Hintergrundausführung um.

## Wichtige Hinweise

- **Auto-Stopp-Verhalten:** Monitore stoppen automatisch, wenn sie `max_events` erreichen, wenn `idle_timeout_ms` ohne Ausgabe vergeht oder wenn das zugrunde liegende Kommando von selbst beendet wird. Der Status eines Monitors spiegelt das Ergebnis des Kommandos wider, nicht einen Tool-Fehler: Eine saubere Beendigung (`Code 0`) wird zu `completed`, ein Exit-Code ungleich 0 wird zu `failed` mit der Meldung `Exit code N`, und eine Beendigung durch ein Signal wird zu `failed` mit der Meldung `Killed by signal SIG`. Kommandos können nicht interaktiv sein, da stdin geschlossen ist. Wenn ein Monitor stoppt, sendet Qwen Code `SIGTERM` an die Prozessgruppe des Kommandos und eskaliert nach etwa 200 ms zu `SIGKILL`. Unter Windows wird `taskkill /f /t` verwendet. Wenn der Qwen Code-Prozess selbst hart beendet wird, abstürzt oder nicht mehr genügend Arbeitsspeicher hat, wird die abgetrennte Prozessgruppe nicht automatisch bereinigt; stellen Sie den Zustand wieder her, indem Sie den Monitor vor dem Beenden mit `task_stop` stoppen oder die Prozessgruppe manuell beenden.
- **Gleichzeitigkeitslimit:** Qwen Code erlaubt bis zu 16 laufende Monitore pro CLI-Sitzung als einen einzigen gemeinsam genutzten Pool. Von Unteragenten gestartete Monitore werden auf dasselbe Limit angerechnet wie vom Hauptagenten gestartete Monitore. Stoppen Sie einen vorhandenen Monitor, bevor Sie einen weiteren starten, wenn das Limit erreicht ist.
- **Ausgabenbehandlung:** Stdout und stderr werden in einen einzigen Benachrichtigungsstrom ohne Stream-Präfix zusammengeführt. Leere Zeilen werden ignoriert, ANSI-Farb- und Steuerzeichen werden entfernt und einzelne Zeilen, die länger als 2000 Zeichen sind, werden abgeschnitten. Ausgaben mit hohem Volumen werden mit einem Burst von 5 Ereignissen und danach etwa einem Ereignis pro Sekunde ratenbegrenzt; Zeilen über der Ratenbegrenzung werden verworfen, nicht gepuffert. Die Monitorausgabe fließt als `<task-notification>`-Inhalt in den Agentenkontext. Strukturelle Benachrichtigungs-Tags werden entschärft, aber das Modell liest dennoch den Text jeder Zeile. Vermeiden Sie daher die Überwachung von Streams, in die externe Parteien schreiben können, es sei denn, Sie vertrauen darauf, dass das Modell eingebettete Anweisungen ignoriert.
- **Berechtigungen:** `monitor` hat seine eigene Berechtigungsgrenze und Berechtigungsregeln, wie z. B. `Monitor(git status)`. Schreibgeschützte Kommandos werden automatisch erlaubt; Kommandos, die den Zustand ändern, erfordern die Zustimmung des Benutzers; Kommandos, die Befehlssubstitutionen enthalten (`$(...)`, Backticks, `<(...)` oder `>(...)`), werden direkt abgelehnt. Die Einstellungen `tools.core` und `tools.exclude` für `run_shell_command` gelten nicht für `monitor`.
- **Workspace-Einschränkung:** Das optionale `directory` muss ein absoluter Pfad sein, der innerhalb eines registrierten Workspace-Verzeichnisses und außerhalb des user-skills-Verzeichnisses aufgelöst wird. Symlinks, die aus dem Workspace herauszeigen, werden abgelehnt.