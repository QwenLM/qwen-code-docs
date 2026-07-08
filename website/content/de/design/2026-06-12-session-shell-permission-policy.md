# Session-Shell-Berechtigungsrichtlinie

## Problem

`POST /session/:id/shell` führt einen Shell-Befehl direkt über den Daemon aus, ohne einen LLM-Tool-Aufruf oder den normalen Agent-Berechtigungs-Mediationsfluss. Vor dieser Änderung war der Endpunkt eine nicht-strikte Mutation und konnte mit einem Daemon-Token plus einer Session-ID oder auf dem tokenlosen Loopback-Entwickler-Standard erreicht werden.

Das ist zu viel Autorität für eine direkte Shell-Oberfläche. Ein Caller sollte nicht in der Lage sein, Shell-Befehle auszuführen, es sei denn, der Daemon-Operator aktiviert die Oberfläche explizit und der Caller weist nach, dass er mit der Ziel-Session verbunden ist.

## Goals

- Die direkte Session-Shell standardmäßig deaktivieren.
- Explizites Opt-in des Operators mit `qwen serve --enable-session-shell` erfordern.
- Bearer-Token-Konfiguration erfordern, bevor das Opt-in wirksam wird.
- Eine Client-ID erfordern, die auf der adressierten Session registriert ist.
- Dieselbe Richtlinie auf die REST-Route, den ACP-HTTP-Dispatcher und den Bridge-Ausführungs-Sink anwenden.
- Normale Agent-Shell-Tool-Genehmigungen und Berechtigungsmediation unverändert lassen.

## Non-Goals

- Direkte Shell nicht über `PermissionMediator` routen.
- Prompt-Submission, Prompt-Queueing oder das SDK-Verhalten für ausstehende Prompts nicht ändern.
- Keinen Shell-spezifischen Rate-Limiter hinzufügen.
- Kein Umgebungsvariablen-Alias für das Opt-in-Flag hinzufügen.

## Design

`runQwenServe` löst das Bearer-Token einmal auf und trimmt es. Danach berechnet es einen effektiven Booleschen Wert:

```ts
sessionShellCommandEnabled =
  opts.enableSessionShell === true && token !== undefined;
```

Dieser Wert wird in die Bridge, die REST-App und den ACP-Dispatcher eingefädelt. Eingebettete Caller, die `createServeApp` direkt aufrufen, berechnen das Vorhandensein des Tokens mithilfe einer Nicht-Leer-String-Prüfung, sodass sich `token: ''` sowohl für das strikte Mutations-Gating als auch für die Shell-Capability-Anzeige wie kein Token verhält.

Die REST-Route verwendet `mutate({ strict: true })`. Bei einem tokenlosen Loopback-Daemon gibt das strikte Gate `401 token_required` zurück, bevor der Handler ausgeführt wird. Wenn ein Token konfiguriert ist, lehnt der Handler eine deaktivierte Shell mit `session_shell_disabled` ab, fordert dann `X-Qwen-Client-Id` an, validiert dann den Befehls-Body und delegiert schließlich an die Bridge.

Der ACP-Dispatcher hält `_qwen/session/shell` für ältere Clients dispatchbar, bewirbt es aber nicht in der `_qwen.methods`-Liste der Initialisierung, es sei denn, die effektive Richtlinie ist aktiviert. Deaktivierte ACP-Aufrufe geben einen stabilen `session_shell_disabled` JSON-RPC-Fehler zurück, ohne den Befehl zu loggen oder die Bridge aufzurufen. Aktivierte Aufrufe erfordern weiterhin, dass die Verbindung Eigentümer der Session ist, und müssen die von der Bridge gestempelte Session-Binding-Client-ID verwenden.

Die Bridge erzwingt die finale Defense-in-Depth-Prüfung bei `executeShellCommand()`: deaktiviert, fehlende Client-ID, unbekannte Session, dann ungebundene Client-ID. Erst nachdem diese Prüfungen bestanden sind, veröffentlicht sie Shell-Events, führt den Befehl aus oder schreibt die Shell-History.

## Error Contract

REST:

- kein Token: `401`, `code: token_required`
- deaktiviert: `403`, `code/errorKind: session_shell_disabled`
- fehlende Client-ID: `403`, `code/errorKind: client_id_required`
- fehlerhafte oder ungebundene Client-ID: bestehendes `400 invalid_client_id`
- unbekannte Session: bestehendes `404 SessionNotFoundError`-Mapping

ACP:

- deaktiviert: `RPC.INVALID_REQUEST`, `data.errorKind: session_shell_disabled`
- fehlende Session-Binding-Client-ID: `RPC.INVALID_REQUEST`,
  `data.errorKind: client_id_required`
- Session ohne Eigentümer und ungültige Client-ID behalten die bestehenden JSON-RPC-Mappings

## Compatibility

`DaemonSessionClient.shellCommand()` funktioniert weiterhin, wenn der Daemon explizit aktiviert und authentifiziert ist, da der Session-Client die Session-gebundene Client-ID mitführt. Das bloße `DaemonClient.shellCommand(sessionId, command)` muss `opts.clientId` übergeben, andernfalls erhält es `client_id_required`.

## Test Coverage

Die Implementierung wird durch gezielte Bridge-, REST-, ACP-Transport-, Serve-Boot- und Command-Parser-Tests abgedeckt. Die wertvollsten Prüfungen sind das standardmäßig deaktivierte Verhalten, das tokenlose strikte Gating, die Capability-Anzeige, das Filtern der ACP-Initialisierungsmethoden, die Durchsetzung des Bridge-Sinks und die Weitergabe der Session-gebundenen Client-ID.