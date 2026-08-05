# Daemon-globaler Deep Health

## Problem

`GET /health?deep=1` wurde eingeführt, als ein Daemon eine Workspace-Runtime
besaß. Die Route war auch nach der Multi-Workspace-Unterstützung noch an die
primäre Bridge angebunden, sodass ihre Zähler den Daemon als idle melden
konnten, während ein sekundärer Workspace Sessions, Prompts oder ausstehende
Permissions hatte.

Der Shallow-Endpunkt ist bewusst anders: `GET /health` beweist nur, dass der
Listener antworten kann. Er muss günstig bleiben und darf nicht auf
Runtime-Zustand zugreifen.

## Entscheidung

Deep Health ist ein daemonweiter informativer Snapshot. Er aggregiert jede
Runtime, die von `WorkspaceRegistry.listManaged()` zurückgegeben wird,
einschließlich Workspaces, die drainen, aber ihr Bridge-Cleanup noch nicht
abgeschlossen haben.

| Feld                 | Aggregation                                                            |
| -------------------- | ---------------------------------------------------------------------- |
| `workspaceCount`     | Anzahl der verwalteten Runtimes im Snapshot                            |
| `sessions`           | Summe                                                                  |
| `pendingPermissions` | Summe                                                                  |
| `activePrompts`      | Summe                                                                  |
| `connectedClients`   | bestehende daemonweite REST-SSE-Zählung                                |
| `channelAlive`       | wahr, wenn irgendein verwalteter Runtime-Channel live ist              |
| `lastActivityAt`     | späteste nicht-leere Bridge-Aktivitätszeit                             |
| `idleSinceMs`        | ein `Date.now()`-Snapshot minus der spätesten Aktivitätszeit           |
| `rateLimitHits`      | bestehende optionale daemonweite Rate-Limit-Zählungen                  |

Die Route liest die erforderlichen Getter jeder Runtime, bevor sie die Werte
kombiniert. Sie short-circuited keine Channel-Reads. Wenn die Registry oder
ein Getter wirft, scheitert die gesamte Deep-Untersuchung mit
`503 {"status":"degraded","reason":"aggregation_failed"}`, statt einen
teilweisen Snapshot zurückzugeben. Getter-Fehler identifizieren die
Workspace-Runtime im Daemon-Stderr-Log, ohne diesen Bezeichner in der
HTTP-Antwort offenzulegen.

Solange der Bootstrap-Listener oben ist, die Runtime-Registry aber nicht
bereit ist, gibt ein Deep-Request einen degradierten Body mit
`reason: "bootstrap"` und `Retry-After: 1` zurück. Im Health-first-Startmodus
löst das Vervollständigen dieser Antwort weiterhin den Runtime-Start aus. Die
Shallow-Bootstrap-Antwort bleibt `200 {"status":"ok"}`.

## Kompatibilität und Grenzen

- `deep=1`, `deep=true` und bloßes `deep` aktivieren den Snapshot; alle
  anderen Werte verwenden Shallow-Health.
- Single-Workspace-Deep-Antworten behalten ihre bestehenden Werte und fügen
  `workspaceCount: 1` hinzu.
- Authentifizierung, Host-Allowlist, CORS und Rate-Limit-Verhalten ändern
  sich nicht.
- Die Antwort exponiert keine Workspace-IDs, Pfade, Trust-Zustände oder
  Pro-Workspace-Details.
- Keine Capability- oder SDK-Änderung ist erforderlich. `workspaceCount`
  lässt Konsumenten den daemon-globalen Vertrag erkennen.

Deep Health ist kein All-Workspace-Readiness-Check und kein atomarer
Reclaim-Lease. Counter-Accessors pingen keine Kindprozesse an, und
`connectedClients` repräsentiert nur REST-SSE. Ein Reclaimer sollte
wiederholte Idle-Samples und ein geordnetes Herunterfahren voraussetzen;
Betreiber, die Transport- oder Pro-Workspace-Diagnosen benötigen, sollten den
authentifizierten `/daemon/status`-Endpunkt verwenden.

## Abgelehnte Alternativen

- Nur `WorkspaceRegistry.list()` zu aggregieren würde drainende Runtimes
  verstecken, bevor ihr Bridge-Cleanup abgeschlossen ist, und könnte idle zu
  früh melden.
- `/daemon/status` wiederzuverwenden würde Health von einem schwereren
  Snapshot mit anderem aktiver-Workspace-Umfang und anderem Fehlervertrag
  abhängig machen.
- Einen Workspace-Selector hinzuzufügen würde ein Caller-seitiges
  Fan-out-Problem bewahren und würde Daemon-Level-Idle-Erkennung nicht
  erfüllen.
- `channelAlive` als „alle Channels live" zu definieren würde seine
  bestehende Daemon-Status-kompatible Bedeutung stillschweigend ändern.
  Pro-Workspace-Fehler gehören in `/daemon/status`.
