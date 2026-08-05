# Persistent daemon workspace registration

## Ziel

Workspaces, die über die Web Shell hinzugefügt werden, überleben einen Neustart des `qwen serve`-Prozesses, wenn der Daemon mit demselben primären Workspace und demselben `QWEN_HOME` neu gestartet wird.

## State-Verantwortung

Die dynamische Workspace-Registrierung ist eine private Daemon-Konfiguration des Benutzers, weder Projektkonfiguration noch vergänglicher Runtime-Output. Registrierungen werden gespeichert unter:

```text
${QWEN_HOME:-~/.qwen}/daemon/workspaces/<primary-scope-sha256>.json
```

Der Scope-Hash ist der vollständige SHA-256 des kanonischen Pfads des primären Workspaces (unter Windows in Kleinbuchstaben). Die Datei wiederholt den primären Pfad, damit ein abweichender oder korrupter Scope abgelehnt statt stillschweigend angewendet wird.

```json
{
  "schemaVersion": 1,
  "primaryWorkspace": "/repo/main",
  "workspaces": ["/repo/service-a"]
}
```

Es werden nur kanonische sekundäre Pfade gespeichert. Trust, Umgebung, Workspace-Ids, Sessions und Runtime-Fehler werden bei jedem Daemon-Start neu abgeleitet.

## Lifecycle

Der Produktions-Daemon liest die kleine Registrierungsdatei, nachdem der primäre Workspace aufgelöst und kanonisiert wurde. Gültige gespeicherte Pfade werden nach den expliziten `--workspace`-Eingaben zusammengeführt. Explizite Eingaben sind maßgeblich: Ein fehlerhafter oder nicht verfügbarer expliziter Pfad bleibt ein Boot-Fehler, während ein nicht verfügbarer gespeicherter Pfad mit einer Warnung übersprungen und für einen späteren Neustart auf der Festplatte behalten wird.

Wiederhergestellte Pfade durchlaufen die normale Konstruktions-Schleife für sekundäre Runtimes, bevor `WorkspaceRegistry` und die Express-/ACP-Oberflächen zusammengesetzt werden. So bleiben Capabilities, workspace-qualifizierte ACP-Mounts, Statusaggregation und das Standard-Limit für die Gesamtzahl der Sessions konsistent mit dem wiederhergestellten Runtime-Set.

Für prozesslokale Ergänzungen nach der App-Assembly bleiben workspace-qualifizierte ACP-Routen gemountet, solange eine Registry existiert, und erzeugen bei erster Nutzung lazy einen vertrauenswürdigen sekundären Mount. Das verhindert, dass ein Startup-Snapshot mit einem einzigen Workspace eine spätere Web-Shell-Registrierung bis zum Neustart unbrauchbar macht.

`POST /workspaces` akzeptiert `persist: true`. Eine erfolgreiche persistente Anfrage wird erst bestätigt, wenn die Aktualisierung der Registrierungsdatei erfolgreich abgeschlossen ist. Eine wiederholte persistente Anfrage für einen bereits aktiven Workspace befördert oder bestätigt dessen gespeicherte Registrierung und gelingt idempotent. Bestehende Aufrufer, die `persist` weglassen, behalten das aktuelle prozesslokale Verhalten.

`GET /workspace-registrations` legt das gewünschte gespeicherte Set für die Verwaltung offen. `DELETE /workspace-registrations/:id` vergisst eine gespeicherte Registrierung; eine aktive Runtime bleibt bis zum Neustart live. Der primäre Workspace kann über diese Oberfläche niemals gespeichert oder vergessen werden.

## Sicherheits- und Fehlverhalten

- Der Store ist auf 24 sekundäre Pfade begrenzt, jeder nicht länger als das Daemon-Workspace-Pfad-Limit.
- Lesezugriffe lehnen Symlinks, nicht-reguläre Dateien, zu große Dateien, fehlerhaftes JSON, unbekannte Schema-Versionen und Abweichungen im primären Scope ab.
- Schreibzugriffe verwenden einen In-Prozess-Mutex, einen prozessübergreifenden Lock und den geteilten atomaren Dateischreib-Helper mit Modus `0600` und ohne Symlink-Following.
- Korrupte Stores werden von Mutationspfaden niemals als leer behandelt, damit ein späteres Hinzufügen wiederherstellbare Daten nicht überschreibt.
- Persistierter Trust fehlt bewusst; wiederhergestellte Workspaces durchlaufen die aktuelle Trusted-Folder-Berechnung.
- Gespeicherte Einträge, die fehlen, nicht erreichbar sind, verschachtelt sind oder über dem aktiven Limit liegen, werden übersprungen, ohne den gewünschten Eintrag zu löschen. Doppelte Einträge machen den Store ungültig und werden niemals implizit umgeschrieben.

## Kompatibilität

Das additive Capability `persistent_workspace_registration` bewirbt den neuen Vertrag. Die SDK-Request-Option und das Antwortfeld `persisted` sind additiv. `runQwenServe` verantwortet die automatische Wiederherstellung beim Start. Direkte Einbettungen von `createServeApp` erhalten die Persistence-Verwaltungsrouten nur, wenn ein Registrierungs-Store explizit übergeben wird, und bleiben dafür verantwortlich, ihre injizierte Workspace-Registry vor der App-Erstellung wiederherzustellen.

## Abgrenzung für Follow-ups

Hot Removal bleibt separat: Das Vergessen einer Registrierung betrifft den nächsten Neustart, beendet aber keine Sessions und entsorgt keine aktive Workspace-Bridge.
