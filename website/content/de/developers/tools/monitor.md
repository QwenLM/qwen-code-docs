# Monitor Tool (`monitor`)

Dieses Dokument beschreibt das `monitor`-Tool für Qwen Code.

## Beschreibung

Verwende `monitor`, um ein langlebiges Shell-Kommando zu starten, das stdout-
und stderr-Zeilen als Hintergrund-Task-Benachrichtigungen zurück an den Agenten
streamt. Es ist für watch-ähnliche Befehle gedacht, bei denen neue Ausgabe mit
der Zeit wichtig ist, wie das Verfolgen von Logs, das Beobachten von Build-
Ausgaben, das Pollen eines Health-Endpunkts oder das Überwachen von Dateiänderungen.

Der Monitor läuft im Hintergrund, sodass der Agent weiterarbeiten kann, während
Ereignisse eintreffen. Jede nicht-leere Ausgabezeile wird zu einem Benachrichtigungs-
Ereignis, unterliegt dabei aber einer Drosselung.

### Argumente

`monitor` akzeptiert die folgenden Argumente:

- `command` (Zeichenkette, erforderlich): Das Shell-Kommando, das ausgeführt und überwacht werden soll.
- `description` (Zeichenkette, optional): Eine kurze Beschreibung, was der Monitor überwacht. Der Anzeigetext wird auf 80 Zeichen gekürzt.
- `max_events` (Zahl, optional): Stoppe nach dieser Anzahl von Benachrichtigungs-Ereignissen. Muss eine positive Ganzzahl sein. Standardwert: `1000`; Maximum `10000` (Werte außerhalb dieses Bereichs werden abgelehnt, nicht stillschweigend begrenzt).
- `idle_timeout_ms` (Zahl, optional): Stoppe, wenn das Kommando für diese Anzahl Millisekunden keine Ausgabe produziert. Muss eine positive Ganzzahl sein. Standardwert: `300000` (5 Minuten); Maximum `600000` (10 Minuten), Werte außerhalb dieses Bereichs werden abgelehnt.
- `directory` (Zeichenkette, optional): Ein absoluter Pfad, in dem das Kommando ausgeführt werden soll. Muss (nach Symlink-Kanonisierung) innerhalb eines registrierten Arbeitsbereichsverzeichnisses aufgelöst werden und darf nicht innerhalb des Benutzer-Skills-Verzeichnisses liegen. Wenn nicht angegeben, verwendet Qwen Code das Projektverzeichnis.

## Wie man `monitor` mit Qwen Code verwendet

Das Modell wählt das `monitor`-Tool aus, wenn es einen Prozess über einen längeren Zeitraum beobachten muss, anstatt nur ein einzelnes Kommandoergebnis zu sammeln. Ein erfolgreicher Aufruf gibt eine Monitor-ID, das Kommando, das Ereignislimit und den Leerlauf-Timeout zurück.

Verwendung:

```
monitor(command="tail -f logs/app.log", description="App-Log-Stream")
```

Die Monitorausgabe ist im Gespräch als Task-Benachrichtigungen sichtbar. Du kannst laufende und abgeschlossene Monitore auch mit `/tasks` oder dem interaktiven Dialog „Hintergrundtasks“ einsehen.

Um einen laufenden Monitor zu stoppen, verwende das `task_stop`-Tool mit der Monitor-ID:

```
task_stop(task_id="mon_abc123def4567890")
```

## `monitor`-Beispiele

Überwache ein Anwendungslog:

```
monitor(
  command="tail -f logs/app.log",
  description="Anwendungs-Log-Stream",
  max_events=200
)
```

Überwache einen Dev-Server oder Build-Watcher:

```
monitor(
  command="npm run build -- --watch",
  description="Build-Ausgabe überwachen",
  idle_timeout_ms=600000
)
```

Rufe wiederholt einen lokalen Health-Endpunkt ab:

```
monitor(
  command="while true; do curl -s http://localhost:8080/health; sleep 5; done",
  description="Lokaler Health-Check",
  max_events=120
)
```

Aus einem bestimmten Arbeitsbereichsverzeichnis ausführen:

```
monitor(
  command="npm run dev",
  description="Frontend-Dev-Server",
  directory="/absolute/path/to/workspace/packages/web"
)
```

## Monitor vs. Hintergrund-Shell-Befehle

Verwende `monitor`, wenn der Agent auf Streaming-Ausgabe reagieren muss, während das Kommando weiterläuft. Verwende stattdessen `run_shell_command`, wenn du ein einmaliges Ergebnis oder die vollständige Befehlausgabe benötigst.

| Anforderung                                               | Verwendung                               |
| :-------------------------------------------------------- | :--------------------------------------- |
| Logs, Build-Ausgabe oder regelmäßige Statusaktualisierungen überwachen | `monitor`                                |
| Einmaligen Befehl ausführen und vollständige Ausgabe lesen | `run_shell_command(is_background=false)` |
| Einen Daemon starten, der keine sinnvolle Ausgabe erzeugt  | `run_shell_command(is_background=true)`  |

Füge bei Monitor-Befehlen kein `&` hinzu. Ein nachgestelltes `&`, wie bei
`tail -f log &`, wird entfernt, weil der Monitor das Backgrounding selbst verwaltet.
Ein nicht-finales `&`, wie bei `cmd1 & cmd2`, wird umgehend abgelehnt; strukturiere
solche Befehle ohne Backgrounding um.

## Wichtige Hinweise

- **Automatisches Stoppen:** Monitore stoppen automatisch, wenn sie `max_events`
  erreichen, wenn `idle_timeout_ms` ohne Ausgabe vergeht oder wenn der zugrunde
  liegende Befehl von selbst beendet wird. Der Status eines Monitors spiegelt das
  Ergebnis des Befehls wider, nicht einen Tool-Fehler: Eine saubere Beendigung
  (Code 0) wird zu `completed`, ein Exit-Code ungleich 0 wird zu `failed` mit
  der Meldung `Exit code N`, und eine terminierte durch ein Signal wird zu
  `failed` mit der Meldung `Killed by signal SIG`. Befehle können nicht
  interaktiv sein, da stdin geschlossen ist. Wenn ein Monitor stoppt, sendet
  Qwen Code `SIGTERM` an die Prozessgruppe des Befehls und eskaliert nach etwa
  200 ms zu `SIGKILL`. Unter Windows wird `taskkill /f /t` verwendet. Wenn der
  Qwen Code-Prozess selbst hart beendet wird, abstürzt oder nicht mehr genügend
  Arbeitsspeicher hat, wird die abgekoppelte Prozessgruppe nicht automatisch
  bereinigt; behebe dies, indem du den Monitor vor dem Beenden mit `task_stop`
  stoppst oder die Prozessgruppe manuell beendest.
- **Parallelitätslimit:** Qwen Code erlaubt bis zu 16 laufende Monitore pro CLI-
  Sitzung als einen gemeinsamen Pool. Von Subagenten gestartete Monitore zählen
  gegen dasselbe Limit wie vom Hauptagenten gestartete. Stoppe einen vorhandenen
  Monitor, bevor du einen neuen startest, falls das Limit erreicht ist.
- **Ausgabeverarbeitung:** Stdout und stderr werden zu einem einzigen
  Benachrichtigungsstream ohne Stream-Präfix zusammengeführt. Leere Zeilen werden
  ignoriert, ANSI-Farben und Steuerzeichen werden entfernt, und einzelne Zeilen
  länger als 2000 Zeichen werden abgeschnitten. Ausgabe mit hohem Volumen wird
  ratenbegrenzt mit einem Burst von 5 Ereignissen und danach etwa 1 Ereignis pro
  Sekunde; Zeilen über die Ratenbegrenzung hinaus werden verworfen, nicht
  gepuffert. Die Monitorausgabe fließt in den Agentenkontext als
  `<task-notification>`-Inhalt. Strukturelle Benachrichtigungs-Tags werden
  entschärft, aber das Modell liest dennoch den Text jeder Zeile. Vermeide daher
  die Überwachung von Streams, in die externe Parteien schreiben können, es sei
  denn, du vertraust darauf, dass das Modell eingebettete Anweisungen ignoriert.
- **Berechtigungen:** `monitor` hat seine eigene Berechtigungsgrenze und
  Berechtigungsregeln, z. B. `Monitor(git status)`. Schreibgeschützte Befehle
  werden automatisch erlaubt; Befehle, die den Zustand ändern, erfordern die
  Zustimmung des Benutzers; Befehle, die Befehlssubstitution enthalten
  (`$(...)`, Backticks, `<(...)` oder `>(...)`) werden sofort abgelehnt. Die
  Einstellungen `tools.core` und `tools.exclude` für `run_shell_command` gelten
  nicht für `monitor`.
- **Arbeitsbereichseinschränkung:** Das optionale `directory` muss ein absoluter
  Pfad sein, der innerhalb eines registrierten Arbeitsbereichsverzeichnisses und
  außerhalb des Benutzer-Skills-Verzeichnisses aufgelöst wird. Symlinks, die aus
  dem Arbeitsbereich herausführen, werden abgelehnt.
