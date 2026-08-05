# Session Start Profiler

## Zusammenfassung

Diese Änderung fügt einen internen, optional aktivierbaren Profiler für `GeminiClient.startChat()` hinzu, damit die Folgearbeiten zu #6312 die verbleibenden Hotspots der sitzungsbezogenen Initialisierung identifizieren können, bevor eine Optimierung ausgewählt wird.

Es ändert nichts am Sitzungsverhalten, an öffentlichen Protokollfeldern, am SDK-Verhalten, an CLI-Flags, am Konfigurationsschema, am Telemetrie-Schema oder an der Semantik des Startup-Profilers.

## Messaufbau

Der Profiler wird nur aktiviert, wenn `QWEN_CODE_PROFILE_SESSION_START=1` gesetzt ist.

Wenn er aktiviert ist, schreibt der Core JSONL-Datensätze unter `Storage.getRuntimeBaseDir()/session-start-perf/`. Die täglichen JSONL-Dateinamen verwenden das UTC-Datum aus dem Zeitstempel des Datensatzes. Jeder Datensatz enthält einen Zeitstempel, `SessionStartSource`, ein Erfolgs-Flag, die Gesamtdauer, begrenzte Stufendauern und kleine Aggregatzahlen wie die Verlaufslänge und die Anzahl der gerenderten Snapshots. Die Follow-up-Arbeit zum Daemon-Profiling aus #4748 fügt eine optionale opaque Session-ID hinzu, wenn der Aufrufer eine angibt, sodass dieser Detaildatensatz mit dem prozessübergreifenden Trace zusammengeführt werden kann.

Die gemessenen Stufen folgen der bestehenden `startChat()`-Sequenz: Aufwärmen der Tool-Registry, Scan zur Aufdeckung fortgesetzter Deferred-Tools, Setup für Deferred-Reminders, Erstellen der initialen Chat-History, Seeding für Skill-Reminder-Dedup, Seeding für Agent-Reminder-Dedup, Erstellen der System-Instruction, Konstruktion von `GeminiChat`, Reparatur von verwaisten Tool-Uses, SessionStart-Hook, optionale Anwendung des SessionStart-Kontexts und `setTools()`.

## Sicherheitsgrenzen

Die Ausgabe schließt absichtlich Prompts, Modellantworten, Hook-Ausgaben, Tool-Namen, Dateipfade und Arbeitsverzeichnisse aus. Ihr einziger optionaler Identifier ist die opaque Session-ID, die dazu dient, einen opt-in erfassten Datensatz mit der Daemon-Telemetrie zu korrelieren; sie fügt keine Benutzer-, Mandanten- oder Workspace-Identität hinzu. Stufennamen sind statische, im Code definierte Strings.

Alle Profiler-Schreibvorgänge erfolgen nach dem Best-Effort-Prinzip. Dateisystemfehler werden verschluckt, sodass das Profiling eine Session durch Fehlerbehandlung weder unterbrechen noch verlangsamen kann.

Der JSONL-Writer verwendet restriktive Berechtigungen und `O_NOFOLLOW` für die Profil-Datei. Der Ersatz des übergeordneten Verzeichnisses bleibt ebenfalls Best-Effort, da Node hier keinen portablen, fd-relativen Append-Pfad bereitstellt; das Runtime-Verzeichnis wird als diagnostischer Speicher für denselben Benutzer behandelt, nicht als Grenze gegen einen lokalen Angreifer mit denselben Benutzerrechten.

Wenn er deaktiviert ist, führt der Helper keine Dateischreibvorgänge durch und liest auch nicht die High-Resolution-Clock.

`failedStage` zeichnet nur Stufen auf, die durch den Profiler-Wrapper einen Fehler werfen. Stufen, deren zugrunde liegende Helper ihre eigenen Fehler abfangen und unterdrücken, wie z. B. das Agent-Reminder-Dedup-Seeding und der SessionStart-Hook, bleiben aus Sicht des Profilers erfolgreich.

## Nicht-Ziele

Diese Änderung optimiert weder `GeminiClient.initialize()` noch `startChat()`.

Sie implementiert kein Part-B-Extension-Caching, kein Part-C-Skill-Body-Lazy-Loading, kein Command-Snapshot-Caching und keine Änderungen am Daemon-Protokoll.

Die nächste Optimierung sollte erst ausgewählt werden, nachdem Stufenaufschlüsselungen von diesem Profiler gesammelt und diese gegebenenfalls mit Extensions-lastigen oder Skill-lastigen Fixtures verglichen wurden.