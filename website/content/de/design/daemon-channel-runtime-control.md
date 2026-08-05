# Daemon-Channel-Runtime-Steuerung

## Zusammenfassung

Fügt eine Desired-State-Runtime-Steuerung für Daemon-verwaltete Channel-Worker
hinzu. Ein Daemon kann ohne `--channel` starten und dann seine Channel-Auswahl
aktivieren, ersetzen, inspizieren, reloaden und stoppen, ohne den Daemon neu zu
starten. Runtime-Änderungen werden nicht persistiert; der nächste Daemon-Boot
folgt weiterhin `--channel`.

Die Steuerungsschicht sitzt über der nach Workspaces gruppierten
Worker-Implementierung. Sie besitzt die committed Auswahl, serialisiert
Lifecycle-Mutationen, bewahrt den serve-eigenen Channel-Service-Lease und
reconciled nur Workspace-Gruppen, deren geordnete Auswahl sich geändert hat.

## Öffentlicher Vertrag

`GET /workspace/channel` gibt die committed Auswahl, eine optionale pending
Auswahl, den aktuellen Übergang und mit Workspace annotierte Worker-Snapshots
zurück.

`PUT /workspace/channel` akzeptiert:

```json
{ "selection": { "mode": "names", "names": ["telegram", "feishu"] } }
```

oder `{ "selection": { "mode": "all" } }`. Benannte Auswahlen werden getrimmt
und dedupliziert, ohne sortiert zu werden. Eine leere Auswahl ist ungültig.
`all` bleibt im Multi-Workspace-Modus auf den Primary-Workspace beschränkt.

`DELETE /workspace/channel` deaktiviert die Runtime-Auswahl idempotent.
`POST /workspace/channel/reload` bleibt verfügbar und liest die Settings für
die committed Auswahl neu. Mutationen verwenden das strikte Bearer-Token-Gate.

Die `channel_control`-Capability bewirbt die Ressource. `channel_reload`
wird weiterhin nur beworben, solange der Manager eine committed reloadbare
Auswahl hat.

## Lebenszyklus

Der Manager exponiert unveränderliche Snapshots und schickt alle Mutationen
durch eine FIFO-Lane. Ein Auswahl-Update prüft Workspace-Ownership und Trust
vorab, bevor Worker gestoppt werden. Unveränderte Workspace-Einträge bleiben
erhalten. Geänderte und entfernte Einträge werden gestoppt, bevor Ersatz
startet, während der Daemon den globalen Channel-Service-Lease hält.

Schlägt ein Ersatz fehl, versucht der Manager, neu gestartete Einträge zu
stoppen und die vorherigen Einträge neu zu starten. Clients inspizieren
`rolledBack`, `rollbackError` und `state`, weil auch Cleanup oder
Wiederherstellung fehlschlagen können. Ein Versagen beim Beobachten des
Kind-Exits nach SIGKILL ist ein harter Stoppfehler: Der Supervisor behält die
Kind-Referenz, der Manager behält den Service-Lease und es wird kein Ersatz
gespawnt.

Worker-Callbacks tragen eine Generation. Callbacks von ersetzten Einträgen
dürfen loggen, aber keinen aktuellen Pidfile- oder Routing-Zustand
aktualisieren. Ein erfolgreicher Commit tauscht Auswahl,
Webhook-Konfiguration und Worker-Map gemeinsam aus und schreibt dann den
vollständigen Pidfile-Snapshot neu.

Teilweise Adapter-Verbindung bewahrt bestehendes Verhalten: Ein Worker ist
ready, wenn mindestens ein angeforderter Channel verbindet.
Steuerungs-Ergebnisse melden `partial`, und der Daemon-Status gibt weiterhin
`channel_worker_partial_connect` aus.

## Kompatibilität

`--channel` beim Boot verwendet denselben Manager und behält dabei die
Pre-Listen-Lease-Reservierung und das Ready-vor-Erfolg-Verhalten bei. Ohne
`--channel` reserviert der Daemon den Channel-Service nicht und lädt die
schwergewichtige Channel-Runtime erst bei der ersten Runtime-Mutation.

Legacy `runtime.channelWorker`, gruppierte `runtime.channelWorkers`,
Pidfile-Felder, eigenständiges `qwen channel start` und `qwen channel reload`
bleiben kompatibel. Die neue CLI-Steuerung wird über `qwen channel set`
exponiert, plus Remote-Varianten von Channel-Stopp und -Status.
