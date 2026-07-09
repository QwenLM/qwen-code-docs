# Gestaffelte Aufteilung von serve server.ts

## Ziel

Teile `packages/cli/src/serve/server.ts` in mehreren Stufen auf, ohne das Verhalten des Daemons zu ändern. Die erste Stufe extrahiert gemeinsame Helper und Route-Gruppen, deren Grenzen bereits klar definiert sind, während `createServeApp()` weiterhin für das Verdrahten von Middleware, zustandsbehafteten Abhängigkeiten, Transport-Mounts und der abschließenden Fehlerbehandlung verantwortlich bleibt.

## Middleware- und Route-Reihenfolge

Die Reihenfolge der App-Zusammenstellung ist Teil des öffentlichen Verhaltens und muss stabil bleiben:

1. Same-Origin `Origin`-Stripping
2. CORS und Host-Allowlist
3. Pre-Auth `/health` und `/demo` bei erlaubten Loopback-Setups
4. Access Logging
5. Statische Assets der Web Shell
6. Bearer Auth
7. Rate Limit
8. JSON-Body-Parser und JSON-Parser-Error-Mapper
9. Post-Auth `/health` und `/demo`, wenn erforderlich
10. Daemon-Telemetrie
11. REST-Route-Gruppen
12. ACP-HTTP- und WebSocket-Routen
13. Web-Shell-Fallback
14. Abschließender Error Handler

## Extrahierte Grenzen

`server/request-helpers.ts` ist verantwortlich für die Request-Body-Bereinigung, das Client-ID-Parsing, die Loopback-Erkennung, die Path/Query-Validatoren und das Permission-Vote-Body-Parsing. Route-Module hängen von dieser Datei ab, anstatt aus `server.ts` zu importieren.

`server/error-response.ts` ist verantwortlich für die Bridge-Error-Taxonomie und das HTTP-Response-Mapping. Die exportierten Wrapper akzeptieren einen optionalen Daemon-Logger, damit die Route-Module das bestehende stderr- und Daemon-Log-Verhalten beibehalten können.

`server/session-list.ts` ist verantwortlich für das Zusammenführen der persistierten und Live-Session-Liste, das sowohl von REST- als auch von ACP-HTTP-Callern verwendet wird.

`server/fs-factory.ts` ist verantwortlich für die Konstruktion der Standard-Workspace-Filesystem-Factory und die Ausgabe von FS-Audit-Warnungen.

`server/telemetry.ts` ist verantwortlich für die Route-Klassifizierung und die Daemon-HTTP-Telemetrie-Middleware.

`server/prompt-deadline.ts` ist verantwortlich für die Auflösung der Prompt-Deadline und ihre Abort-Sentinel-Klasse.

Route-Module folgen dem bestehenden `registerXRoutes(app, deps)`-Stil. Sie erhalten nur die Abhängigkeiten, die sie benötigen, und keinen einzigen God-Context.

## Nicht-Ziele

Diese Stufe ändert nichts an Response-Bodies, Statuscodes, Headern, dem SSE-Frame-Format, der Authentifizierungsreihenfolge oder der Error-Taxonomie. Sie löscht keine Kompatibilitäts-Re-Export-Shims wie `status.ts`, `event-bus.ts` oder `in-memory-channel.ts`. Sie benennt keine historischen Docs um und bereinigt keine unabhängigen CamelCase-Pfade.

`server.ts` kann nach dieser Stufe weiterhin über 200 Zeilen lang sein. Das Abnahmekriterium sind stabile Grenzen, sodass die spätere Extraktion von Sessions und SSE rein mechanisch erfolgen kann.

## Audit-Notizen

Runde 1 überprüfte die Architekturgrenzen und lehnte eine neue Router-Abstraktion ab, da die bestehenden Route-Module bereits direkte `registerXRoutes(app, deps)`-Funktionen verwenden.

Runde 2 überprüfte die Fehlerpfade und beließ die Error-Taxonomie in einem einzigen Helper, damit die Route-Extraktion nicht stillschweigend zu abweichenden HTTP-Statuscodes führen kann.

Runde 3 überprüfte die Kompatibilität und behält die öffentlichen Exports bei, die von `run-qwen-serve.ts`, dem ACP-HTTP-Dispatch und den Tests konsumiert werden.

Runde 4 überprüfte die Teststrategie und verlässt sich auf fokussierte `server.test.ts`-, ACP-HTTP- und Route-Tests, da es sich um ein strukturelles Refactoring ohne für Benutzer sichtbare Verhaltensänderungen handelt.