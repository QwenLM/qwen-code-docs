# Härtung der cua-driver-MCP-Zuverlässigkeit

## Problem

Der MCP-Proxy wartet bis zu 120 Sekunden auf eine Daemon-Antwort. Mehrere macOS-Tool-Pfade
können in synchronen OS-Aufrufen länger als das blockieren. Der Proxy gibt dann ein
generisches JSON-RPC `-32603` aus, während die verlassene Operation und der Kindprozess
weiterlaufen. Unabhängig davon wird der Capture-Scope sowohl aus dem Speicher als auch von
der Platte gelesen, sodass eine MCP-Session nach einer Erfolgsmeldung von `set_config`
widersprüchliche Werte beobachten kann.

## Design

### Eine effektive Konfiguration pro Session

Behandle `capture_scope` wie den bestehenden Image-Size-Override mit Session-Scope.
MCP-Aufrufe lösen ihn über die `_session_id` des Callers auf; anonyme CLI-Aufrufe nutzen den
global persistierten Default. `set_config`, `get_config` und `get_desktop_state`
müssen alle über denselben `ToolState` auflösen. Die anonyme Persistierung erfolgt, bevor der
In-Memory-Wert übernommen wird, und ein Schreibfehler wird an den Caller zurückgegeben.

### Subprozesse aus der App-Enumeration entfernen

Verwende `NSWorkspace.runningApplications` für laufende Apps und Core-Foundation-Bundle-Metadaten
für installierte Apps. Damit werden `osascript` und `plutil` aus den Discovery-Pfaden von
`list_apps`, `get_accessibility_tree` und `launch_app` entfernt,
anstatt zu versuchen, für jedes installierte Bundle ein sicheres Timeout zu erraten.

### Screenshot-Capture begrenzen und terminieren

Behalte das bestehende `screencapture`-Backend bei, spawne es aber über einen einzigen
begrenzten Helper. Bei Deadline-Ablauf wird der Prozess gekillt und eingesammelt, bevor ein
Tool-Fehler zurückgegeben wird. Verwende pro Capture einen eindeutigen temporären Pfadnamen und
einen RAII-Cleanup-Guard, damit parallele Aufrufe nicht kollidieren können und Fehler keine
Dateien hinterlassen.

### AX- und Daemon-Arbeit unterhalb der Proxy-Deadline begrenzen

Setze den nativen AX-Messaging-Timeout vor Tree-Walks und Element-Aktionen. Füge als letzten
Backstop eine Daemon-seitige Tool-Deadline hinzu, die kürzer ist als die
120-Sekunden-Transport-Deadline des Proxys. Interne Grenzen sollten normalerweise greifen; die
Daemon-Deadline stellt sicher, dass ein unvorhergesehener Tool-Stillstand zu einem
Tool-Level-Fehler statt `-32603` wird.

### Daemon-Endpoint des Forks isolieren

Verwende einen Qwen-spezifischen Default-Unix-Socket und ein Qwen-spezifisches PID-Verzeichnis.
Ein alter Upstream-Daemon kann auf dem Upstream-Default weiterlaufen, aber der Qwen-Proxy nutzt
ihn nicht mehr stillschweigend weiter und führt damit eine andere Implementierung/Version aus
als das Binary, das der Nutzer gestartet hat. Explizite `--socket`-Overrides bleiben
unverändert.

### Lifecycle-Diagnose bewahren

Speichere, warum eine Session tombstoned wurde (explizites Ende, Idle-Ablauf oder
Verbindungsende), und nenne diesen Grund im Ablehnungstext. Behalte das explizite
`start_session`-Revival bei. Erhöhe den Default-Idle-TTL, damit ein normaler langer Agent-Turn
seine Session nicht schon nach fünf Minuten verliert; der Environment-Override bleibt für Tests
und Deployments verfügbar.

### E2E-Tests dazu bringen, das Fork-Binary auszuführen

Löse `qwen-cua-driver` im geteilten Testkit auf. Ein fehlendes Binary darf eine vorgesehene
E2E-Assertion nicht mehr in einen null-Sekunden dauernden bestandenen Skip verwandeln, wenn das
Binary des Forks unter seinem tatsächlichen Namen vorhanden ist.

## Nicht-Ziele

- Das MCP-JSON-RPC-Protokoll ändern oder destruktive Aktionen erneut versuchen.
- Tokio in die Lage versetzen, beliebige fremde blockierende Aufrufe abzubrechen; OS-Subprozesse
  werden direkt gekillt und AX erhält seinen nativen Messaging-Timeout.
- Das Verhalten der Koordinatennormalisierung ändern.

## Verifikation

Führe dieselben isolierten Proxy-/Daemon-Black-Box-Fälle aus, die für die Vor-Fix-Reproduktion
verwendet wurden: fehlgeschlagene Konfigurationspersistierung, hängender App-Enumeration-Shim,
hängender Screenshot-Shim und kurze Session-TTL/Revival. Die beiden Hänge-Fälle müssen vor der
120-Sekunden-Proxy-Deadline zurückkehren, keinen Kindprozess hinterlassen und einen
unmittelbaren Folgeaufruf erlauben.
