# Chat-Aufzeichnungsfehler-Observability

## Kontext

`ChatRecordingService` akzeptiert nach dem ersten asynchronen JSONL-Schreibfehler dauerhaft keine Writes mehr. Das Transkript bleibt ein gültiger Präfix, aber ohne separates Signal können Nutzer und Remote-Clients fälschlich annehmen, dass spätere Nachrichten weiterhin aufgezeichnet werden.

## Core-Lebenszyklus

`Config.onChatRecordingFailure()` ist die prozesslokale Abonnement-Grenze. Jeder Recorder, der von einer `Config` erzeugt wird, leitet seinen ersten asynchronen Schreibfehler an einen Snapshot der registrierten Listener weiter. Das Event trägt die Session-ID des fehlgeschlagenen Records und einen normalisierten `Error`; Listener-Fehler sind vom Writer-Promise isoliert. Abonnements überleben einen Recorder-Austausch und werden von ihren Disposern unabhängig entfernt. `Config.shutdown()` hält die Listener durch Recorder-Finalisierung und Flushing am Leben und löscht sie danach.

Synchrone Konversationsdatei-Erstellungsfehler emittieren das Event nicht, weil der Recorder nicht in seinen permanenten Fehlerzustand übergegangen ist und ein späterer Aufruf erneut versuchen kann. Ein fehlgeschlagener Recorder emittet einmal; übersprungene Nachkommen, spätere Appends und wiederholte Flushes emittieren nicht erneut.

## Lokale CLI-Flächen

TUI und Text-Output rendern eine generische umsetzbare Warnung ohne Dateisystempfade, errno-Werte oder den zugrundeliegenden Fehler. JSON, stream-json und Dual-Output emittieren eine `system/session_recording_degraded`-Nachricht, deren Top-Level- und Payload-Session-IDs beide vom Fehler-Event stammen und nicht von der aktuellen `Config`-Session.

One-Shot-Structured-Output finalisiert den Recorder und wartet bis zu zwei Sekunden auf seinen Flush, bevor das terminale Ergebnis ausgegeben wird. Langlebige Stream-json-Sessions abonnieren einmal, flushen zwischen Turns ohne zu finalisieren und finalisieren nur beim Session-Shutdown. Ein Timeout erhält die Reaktionsfähigkeit und cancelt nicht den zugrundeliegenden Write.

## Daemon-Protokoll und dauerhafter Live-Zustand

Das ACP-Kind sendet `qwen/notify/session/recording-degraded` mit Protokollversion 1, der betroffenen Session-ID und `reason: "write_failed"`. Die Bridge validiert das Payload, publiziert `session_recording_degraded` und markiert den Live-Session-Eintrag als degraded. Benachrichtigungen, die vor der Eintragsregistrierung eintreffen, nutzen den bestehenden begrenzten Early-Event-Puffer; das Drainen des Puffers aktualisiert sowohl den Replay-Ring als auch den Eintragszustand.

`session_snapshot.recordingDegraded` erhält den Zustand, nachdem das Live-Event den Replay-Ring verlassen hat. Es ist nur Daemon-Speicher-Zustand: Ein Daemon-Neustart erzeugt einen neuen Recorder und beginnt healthy. Das Event ist additiv unter `EVENT_SCHEMA_VERSION = 1`; keine Capability-Änderung ist erforderlich.

## SDK und WebUI

Das SDK validiert das Live-Event und das optionale Snapshot-Feld. Der Session-Reducer behandelt das Live-Event als Resync-sicheres Sticky-Update. Ein vorhandenes Snapshot-Feld ist maßgeblich, während ein abwesendes Feld den Zustand aus Kompatibilität mit älteren Daemons erhält.

Der UI-Normalizer mappt beide Degraded-Repräsentationen auf denselbe behebbare Aufzeichnungsfehler. Das WebUI nutzt die explizite Notice-ID `daemon.session_recording_degraded:<sessionId>`, sodass ein replaysiertes Event, dem ein Snapshot folgt, idempotent ist. Das Schließen einer Notice entfernt die aktuelle Instanz; ein späterer Snapshot kann das weiterhin aktive Risiko erneut anzeigen.

## Close-Grenze

Strikte Close-Pfade, die einen erfolgreichen Flush erfordern, halten den Daemon-Eintrag am Leben, wenn der Flush fehlschlägt, damit das Event zustellbar bleibt. Die bestehende Best-Effort-Close-Reihenfolge ist unverändert: Wenn ihr EventBus bereits geschlossen ist, wenn ein später Fehler entdeckt wird, behält nur das Debug-Log diesen Fehler.

## Nicht-Ziele

Dieses Design versucht Writes nicht erneut, stellt keinen degraded Recorder wieder her, ändert keine JSONL-Inhalte oder Parent-Links, fügt kein fsync hinzu, legt keine rohen Dateisystemfehler offen und koordiniert keine konkurrierenden Writer über Prozesse hinweg.
