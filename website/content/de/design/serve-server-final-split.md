# Finales Aufteilen von serve server.ts

## Ziel

Setze die schrittweise Aufteilung von `packages/cli/src/serve/server.ts` fort, ohne das Verhalten des Daemons zu ändern. Dieser Durchlauf verschiebt die verbleibenden Inline-REST-Handler, kleinen Middleware-Helfer, Capability-Konstruktion, Device-Flow-Registry-Einrichtung und Rate-Limiter-Einrichtung in fokussierte interne Module. `createServeApp()` bleibt der Kompositionspunkt für den Daemon-State, die Middleware-Reihenfolge, die Route-Registrierung, das ACP-Transport-Mounting, den Web-Shell-Fallback und die finale Fehlerbehandlung.

## Middleware- und Route-Reihenfolge

Die Zusammenstellungsreihenfolge ist Teil des Daemon-Vertrags und muss in `createServeApp()` visuell überprüfbar bleiben:

1. Same-Origin-`Origin`-Stripping
2. CORS und Host-Allowlist
3. Pre-Auth-`/health` und `/demo` auf erlaubten Loopback-Setups
4. Access Logging
5. Web-Shell-Static-Assets
6. Bearer-Auth
7. Rate Limit
8. JSON-Body-Parser und JSON-Parser-Error-Mapper
9. Post-Auth-`/health` und `/demo` bei Bedarf
10. Daemon-Telemetrie
11. REST-Route-Gruppen
12. ACP-HTTP- und WebSocket-Routen
13. Web-Shell-Fallback
14. Finaler Error Handler

## Extrahierte Grenzen

`server/self-origin.ts`, `server/access-log.ts`, `server/rate-limiter-setup.ts` und `server/error-handlers.ts` besitzen kleine Middleware-/Setup-Blöcke, die sich zuvor inline in `createServeApp()` befanden. Sie sind absichtlich schlank gehalten und behalten die gleiche Registrierungsreihenfolge in `server.ts` bei.

`server/serve-features.ts` besitzt die Language-Code-Liste, den Voice-Transcription-Capability-Cache und die Konstruktion des beworbenen Feature-Envelope-Inputs. Seine Cache-Invalidation-Funktion wird weiterhin von den Workspace-Settings-Reload/Change-Pfaden aufgerufen.

`server/device-flow-registry.ts` besitzt die Standard-Qwen-OAuth-Provider-Registrierung, das Event-Sink-Wiring, die Audit-Stderr-Breadcrumbs und die `app.locals`-Registry-Installation.

`routes/capabilities.ts` besitzt `GET /capabilities`.

`routes/workspace-mcp-control.ts` besitzt die MCP-Restart/Manage/Runtime-Add/Remove-Mutationen.

`routes/workspace-lifecycle.ts` besitzt `/workspace/init` und `/workspace/reload`.

`routes/workspace-tools.ts` besitzt `/workspace/tools/:name/enable`.

Jedes Route-Modul erhält nur die Abhängigkeiten, die es benötigt. Keines der neuen Module importiert `server.ts`, was die Abhängigkeitsrichtung einseitig hält und Zyklen vermeidet.

## Verbleibend in `server.ts`

`server.ts` besitzt weiterhin die App-Erstellung, die Bound-Workspace-Kanonisierung, die Bridge/Filesystem/Workspace-Konstruktion, die Mutation-Gate-Erstellung, die Route-Reihenfolge, das ACP-HTTP/WebSocket-Mounting, die Web-Shell-Static/Fallback-Platzierung und die Kompatibilitäts-Exports, die von bestehenden Aufrufern konsumiert werden.

Es ist nicht erforderlich, dass die Datei in diesem PR unter 200 Zeilen fällt. Das Abnahmekriterium ist, dass sie keine Inline-REST-Endpoint-Handler enthält und als Assembly-Datei lesbar ist, deren Verhaltensreihenfolge an einem einzigen Ort überprüft werden kann.

## Nicht-Ziele

Dieser Durchlauf ändert nichts an Response-Bodies, Status-Codes, Headern, SSE-Frames, ACP-Verhalten, Auth-Gates, Rate-Limit-Tiers, Device-Flow-Semantik oder der Error-Taxonomie. Er entfernt nicht die `status.ts`-, `event-bus.ts`- oder `in-memory-channel.ts`-Kompatibilitäts-Shims. Er benennt keine historischen Docs um und führt weder ein Router-Framework noch einen einzigen God-Context für Routen ein.

## Audit-Notizen

Runde 1 hat die Architekturgrenzen überprüft und das bestehende `registerXRoutes(app, deps)`-Muster beibehalten, anstatt eine Router-Abstraktion hinzuzufügen.

Runde 2 hat die Abhängigkeitsrichtung überprüft und das Device-Flow/Runtime-Setup hinter Helfer verschoben, ohne dass ein Route-Modul `server.ts` importieren muss.

Runde 3 hat die Fehlerpfade überprüft und das Bridge-Error-Mapping, JSON-Body-Parser-Fehler, strikte Mutation-Gates und die Client-ID-Validierungs-Call-Sites verhaltensbewahrend beibehalten.

Runde 4 hat die Kompatibilität überprüft und die öffentlichen Exporte aus `server.ts` für `run-qwen-serve.ts`, ACP-HTTP-Aufrufer und Tests beibehalten.

Runde 5 hat die Teststrategie überprüft und verwendet fokussierte `server.test.ts`, Route-Tests, ACP-HTTP-Tests, Typecheck, Build, Lint, Inline-Endpoint-Grep und `git diff --check`.