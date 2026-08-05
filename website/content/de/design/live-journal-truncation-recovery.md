# Live-Journal-Trunkierungs-Recovery

## Kontext

Der Daemon hält ein begrenztes In-Memory-Live-Journal für einen
unabgeschlossenen Turn. Wenn das Journal 10.000 Events oder 8 MiB
überschreitet, verwirft es die ältesten Replay-Events und stellt einen
`history_truncated`-Marker voran. Das persistierte Transkript und die
Turn-Grenzen-Compaction bleiben maßgeblich, sodass der vollständige Turn nach
einem formalen Terminal-Event wieder verfügbar wird.

Der Marker hatte zuvor keine Prompt-Ownership, das SDK renderte eine
generische Nachricht, und die WebUI versteckte den Marker entweder hinter der
History-Pagination oder ließ den behaltenen Tail dauerhaft sichtbar. Dieses
Design behält die bestehenden Ressourcen-Limits und die Eviction-Policy bei,
macht den Verlust aber präzise und repariert den sichtbaren Tail ohne eine
weitere Modell-Anfrage.

## Protokoll und SDK

Für einen Live-Journal-Marker, den `session/load` zurückgibt, kopiert die
Bridge die maßgebliche `activePromptId` der Session als optionales `promptId`
in die Marker-Hülle. Das persistierte Event und die Event-Schema-Version
ändern sich nicht. Ein älterer Daemon ohne dieses Feld ist nur reparierbar,
wenn die behaltenen Live-Events exakt eine Prompt-ID haben.

`DaemonHistoryTruncatedData` exponiert die bestehenden optionalen Felder
`scope` und `maxEvents`. Die Validierung lehnt missgebildete optionale Werte
ab. Normalisierte Statusdaten behalten die vollständige Daemon-Payload. Der
Text unterscheidet Replay-History-Trunkierung von Live-Turn-Trunkierung,
stellt fest, dass die neuesten Events behalten und ältere Replay-Events
verworfen wurden, und verspricht Post-Terminal-Recovery nur, wenn
`fullTranscriptAvailable` wahr ist.

## WebUI-Recovery-Episode

Während des Snapshot-Replays erzeugt ein reparierbarer Live-Marker einen
Episode-Checkpoint unmittelbar vor dem Marker. Der Checkpoint nutzt
unveränderliche Transkript-Blöcke erneut und behält die Session-ID, die
Ziel-Prompt-ID, das Snapshot-Event-Watermark, die Marker-Block-ID und eine
deterministische Episoden-Signatur. Ältere History-Seiten und
Provider-lokale Statusblöcke werden in den Checkpoint gespiegelt, solange der
Marker aktiv ist.

Nur ein passendes `turn_complete` oder `turn_error` schaltet die Recovery
scharf. Cancellation wird durch ein formales Terminal-Event mit gecanceltem
Stop-Reason dargestellt und folgt demselben Pfad. Gepufferte
Transkript-Events werden geflusht und der Prompt-Zustand wird settled, bevor
die Recovery versucht wird. Ein laufender Session-Load, eine
History-Seiten-Anfrage, Navigation oder ein lokaler Prompt verzögern den
Versuch bis zum nächsten Idle-Punkt.

Die Recovery führt einen Same-Session-`session/load` mit In-Memory-Replay
ohne konfigurierte History-Seitengröße aus. Das aktuelle Transkript bleibt
angehängt und sichtbar, bis die Validierung erfolgreich ist. Der frische
Snapshot darf nicht degradiert sein und muss sowohl den Nutzer-Input des
Ziel-Prompts als auch ein passendes formales Terminal enthalten. Ein
Validierungs- oder retrybarer Transport-Fehlschlag lehnt die Ersetzung ab,
setzt den vorherigen Session-Handle von seinem SSE-Cursor fort, bewahrt das
Transkript und emittiert genau eine recoverable
`daemon.live_journal_repair.failed`-Nachricht. Authentifizierungsfehler und
eine fehlende Session bewahren ebenfalls das Transkript und emittieren die
Nachricht, behalten aber den bestehenden Disconnected- oder
Reauthentifizierungs-Zustand des Providers, da dieser SSE-Stream nicht sicher
fortgesetzt werden kann.

Bei Erfolg baut die WebUI den Ziel-Suffix vom frühesten passenden Nutzer-
Input bis zum frischen Snapshot-Tail neu auf. Sie startet vom Checkpoint,
wenn der Marker-Block noch behalten wird; andernfalls baut sie einen
begrenzten vollständigen Snapshot neu. Nachgespielte Events bauen den
Transkript-Zustand neu auf, einschließlich `assistant.done`, aber Events auf
oder unter dem Episoden-Watermark wiederholen keine Notices, Workspace-
Signale, Pending-Prompt-Publikationen, Follow-up-Publikationen oder andere
Seiteneffekte. Neuere Event-IDs behalten ihre normalen Effekte.

Der resultierende Zustand wird mit einem Store-Reset committed. Wenn der
vollständige Suffix in die `maxBlocks` des Checkpoints passt, bleiben
behaltene History-Block-IDs, Paginations-Cursor, geladene Tiefe und
Kapazitätszustand stabil. Wenn er diese Grenze überschreitet, darf die
bestehende Store-Policy die ältesten geladenen Blöcke trimmen, statt eine
unbegrenzte Reparatur-Ausnahme zu erzeugen. Ein frischer Suffix, der mit
einem weiteren recoverable Live-Marker endet, erzeugt eine separate Episode
für diesen Prompt.

## Parallelität und Lebenszyklus

Eine Episode wird automatisch höchstens einmal versucht. Ein konfigurierter
Reload, Session-Wechsel, Page-Unmount oder explizites Session-Clear bricht
sie ab und entfernt sie. Ein Reparatur-Reload behält sie bis Erfolg oder
Fehlschlag. Der Reload pausiert das alte SSE-Abonnement, ohne seine
Session-Registrierung zu lösen. Ein abgelehnter Kandidat wird gelöst und der
vorherige Handle setzt von seinem bestehenden Cursor fort; ein validierter
Kandidat wird der neue Abonnement-Owner.

Der Checkpoint erbt die effektiven `maxBlocks` des aktuellen
Transkript-Stores, während der Marker-getrimmte Fallback die konfigurierten
`maxBlocks` verwendet. Dies bewahrt das bestehende
Zu-großes-erstes-Replay-Verhalten, ohne eine neue Ausnahme für die Reparatur
zu schaffen. Blöcke werden geteilt statt Text-Payloads zu kopieren, und es
wird kein unbegrenztes Journal oder zweiter Transkript-Cache eingeführt.

## Kompatibilität

- Die Marker-Felder `promptId`, `scope` und `maxEvents` sind optional.
- Alte Clients ignorieren die Marker-Hüllen-Erweiterung.
- Neue Clients akzeptieren alte Payloads und lehnen mehrdeutige automatische
  Reparatur sicher ab.
- Das Standard-`reloadSession`-Verhalten bleibt konfigurierter Replay; nur
  der interne Reparaturpfad fordert Memory-Replay an.
- Daemon-Persistierung, Transkript-APIs, Journal-Limits und
  Älteste-zuerst-Eviction sind unverändert.

## Verifikation

Die Unit-Abdeckung übt Marker-Ownership, Post-Terminal-Compaction,
Payload-Validierung, präzisen Status-Text, Prompt-Matching,
Replay-Validierung, atomare Suffix-Ersetzung,
Doppelte-Seiteneffekte-Unterdrückung, History-Bewahrung, Fehler-Fallback und
Reload-Source-Propagation. Daemon-Integrationstests verwenden einen
deterministischen Mock-ACP-Agenten und ein Drei-Event-Journal, um den
Live-Marker von einem zweiten Client aus zu beobachten, den vollständigen
kompaktierten Turn nach dem Terminal zu verifizieren und den echten
WebUI-Provider zu mounten, um zu beweisen, dass die Recovery genau einen Load
und keine Modell-Anfrage hinzufügt.
