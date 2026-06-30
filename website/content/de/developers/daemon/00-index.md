# Daemon-Entwicklerdokumentation

Dies ist die technische Dokumentation für Entwickler des **qwen-code Daemon-Modus**: der `qwen serve` HTTP-Daemon, das `@qwen-code/acp-bridge`-Paket, der Workspace-gebundene MCP-Transport-Pool, die Multi-Client-Berechtigungsvermittlung, das typisierte Daemon-Event-Schema v1, der TypeScript-SDK-Daemon-Client und die Adapter, die sich mit dem Daemon verbinden.

Sie ergänzt die folgenden bestehenden Dokumentationen, ersetzt sie aber nicht:

| Bestehende Dokumentation                                                                 | Zielgruppe            | Maßgebliche Quelle für                                 |
| ---------------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------ |
| [`../../users/qwen-serve.md`](../../users/qwen-serve.md)                                 | Betreiber             | Benutzer-Schnellstart, Flags, Bedrohungsmodell         |
| [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md)                                 | Protokoll-Implementierer | HTTP-Route-Katalog, Request/Response-Strukturen, Fehlercodes |
| [`../examples/daemon-client-quickstart.md`](../examples/daemon-client-quickstart.md)     | SDK-Nutzer            | End-to-End-TypeScript-Anleitung                        |
| [`../daemon-client-adapters/`](../daemon-client-adapters/)                               | Adapter-Entwickler    | Design-Dokumentation für Legacy-Client-Adapter         |
| [`14-cli-tui-adapter.md`](./14-cli-tui-adapter.md)                                       | Adapter-Entwickler    | Design-Notizen für Client-Adapter                      |
| [`../../design/f2-mcp-transport-pool.md`](../../design/f2-mcp-transport-pool.md)         | F2-Maintainer         | Workspace-MCP-Transport-Pool-Design v2.2               |

Wenn du einen **Daemon starten und nutzen** möchtest, lies zuerst `qwen-serve.md`. Wenn du einen **Client für das Wire-Format entwickeln** möchtest, lies `qwen-serve-protocol.md`. Wenn du die **Daemon-Interna verstehen, erweitern oder debuggen** möchtest, lies diese Dokumentationsreihe.

## Lesereihenfolge

Wähle den Pfad, der deinem Ziel entspricht:

- **Zuerst einen Daemon starten und verifizieren**: `20 -> 17 -> 19`.
- **Neuer Contributor**: `01 -> 02 -> 03 -> 08 -> 09 -> 10 -> 11 -> 12`.
- **Hinzufügen eines neuen Client-Adapters**: `01 -> 09 -> 10 -> 13 -> (14 / 15 / 16)`.
- **Arbeit am MCP-Pool oder Budget**: `01 -> 03 -> 05 -> 06`.
- **Arbeit an Berechtigungen**: `01 -> 03 -> 04 -> 12`.
- **Debugging eines Produktions-Daemons**: `19 -> 18 -> 17 -> 20`.

## Dokumentenübersicht

### Grundlagen

- [`01-architecture.md`](./01-architecture.md) - Systemarchitektur, Prozess-Topologie, Paketübersicht und alle sieben Top-Level-Sequenzdiagramme.

### Server-Kern

- [`02-serve-runtime.md`](./02-serve-runtime.md) - `runQwenServe`-Bootstrap, Express-App, Middleware-Chain, Graceful Shutdown.
- [`03-acp-bridge.md`](./03-acp-bridge.md) - Interna des `@qwen-code/acp-bridge`-Pakets, Session-Multiplexing, Channel-Factory, ACP-Child-Spawn.
- [`04-permission-mediation.md`](./04-permission-mediation.md) - `MultiClientPermissionMediator`, vier Policies, N1-Timeout-Invariante, Cancel-Sentinel.
- [`05-mcp-transport-pool.md`](./05-mcp-transport-pool.md) - `McpTransportPool` (F2), Pool-Einträge, Reverse-Index, Restart, Drain.
- [`06-mcp-budget-guardrails.md`](./06-mcp-budget-guardrails.md) - `WorkspaceMcpBudget`, Modi (`off`/`warn`/`enforce`), Hysterese, Refused-Batch-Coalescing.
- [`07-workspace-filesystem.md`](./07-workspace-filesystem.md) - `WorkspaceFileSystem`-Sandbox, Path-Policy, Audit, `BridgeFileSystem`-Kontrakt.
- [`08-session-lifecycle.md`](./08-session-lifecycle.md) - Create / Attach / Load / Resume, `X-Qwen-Client-Id`, Heartbeat, Eviction, Metadaten.
- [`09-event-schema.md`](./09-event-schema.md) - Typisiertes Event-Schema v1: alle 47 bekannten Event-Typen mit Payloads, Reducern, Forward-Kompatibilität.
- [`10-event-bus.md`](./10-event-bus.md) - `EventBus`, monotone IDs, Ring-Replay, `Last-Event-ID`, Slow-Client-Backpressure, `client_evicted`.
- [`11-capabilities-versioning.md`](./11-capabilities-versioning.md) - Capability-Registry, Protokollversion, Schema-Version, Conditional Advertisement.
- [`12-auth-security.md`](./12-auth-security.md) - Bearer-Middleware, Host-Allowlist, CORS-Deny, Mutation-Gate, `--require-auth`, `/health`-Ausnahme, Device-Flow.

### Clients

- [`13-sdk-daemon-client.md`](./13-sdk-daemon-client.md) - TypeScript SDK: `DaemonClient`, `DaemonSessionClient`, `DaemonAuthFlow`, SSE-Parser, Event-Reducer, `ui/*`-Transcript-Layer.
- [`14-cli-tui-adapter.md`](./14-cli-tui-adapter.md) - Gemeinsamer UI-Transcript-Layer und die Beziehung zum Legacy-CLI-TUI-Daemon-Adapter.
- [`15-channel-adapters.md`](./15-channel-adapters.md) - Gemeinsame `DaemonChannelBridge`-Basis sowie DingTalk-, WeChat (Weixin)-, Telegram- und Feishu-Channel-Adapter.
- [`16-vscode-ide-adapter.md`](./16-vscode-ide-adapter.md) - `DaemonIdeConnection`, Loopback-Only-Erzwingung, Webview-Bridging.

### Referenzanhänge

- [`17-configuration.md`](./17-configuration.md) - Umgebungsvariablen, CLI-Flags, `settings.json`-Keys, die den Daemon beeinflussen.
- [`18-error-taxonomy.md`](./18-error-taxonomy.md) - Typisierte Fehler pro Schicht mit Behebungslösungen.
- [`19-observability.md`](./19-observability.md) - `QWEN_SERVE_DEBUG`, Debugging-Rezepte, Telemetrie-Lücken.
- [`20-quickstart-operations.md`](./20-quickstart-operations.md) - Kürzester Startpfad, Curl-Checks, Route-Map und eingebettete Aufruf-Rezepte.

## Glossar

- **ACP** - Agent Client Protocol. JSON-RPC über stdio, das zwischen der Daemon-Bridge und dem ACP-Child-Prozess gesprochen wird. Dies ist nicht das HTTP-Protokoll, das Clients für den Daemon verwenden.
- **ACP child** - Der Child-Prozess, den der Daemon (`qwen --acp`) startet, um die eigentliche Agent-Runtime zu hosten. Die Bridge multiplext einen ACP-Child über viele verbundene Clients.
- **acp-bridge** - Das `@qwen-code/acp-bridge`-Paket (`packages/acp-bridge/`). Verantwortlich für Session-Multiplexing, den Permission-Mediator, den Event-Bus und die Channel-Factory.
- **BridgeClient** - `packages/acp-bridge/src/bridgeClient.ts`. Wrapper für eine ACP-`ClientSideConnection` und verarbeitet `requestPermission`, `sendPrompt` und `cancelSession`.
- **Channel factory** - Plugbare Strategie zum Spawnen oder Anhängen an einen ACP-Child. Der Standard `spawnChannel` führt `qwen --acp` als Subprozess aus; `inMemoryChannel` führt ihn für Tests im Prozess aus.
- **DaemonClient** - `packages/sdk-typescript/src/daemon/DaemonClient.ts`. Die TypeScript-SDK-HTTP-Fassade über dem Daemon.
- **DaemonSessionClient** - `packages/sdk-typescript/src/daemon/DaemonSessionClient.ts`. Session-gebundener Wrapper, der `lastSeenEventId` für das SSE-Replay trackt.
- **EventBus** - `packages/acp-bridge/src/eventBus.ts`. Pro-Session In-Memory-Pub/Sub mit monotonen IDs, einem begrenzten Ring und Backpressure pro Subscriber.
- **F1 / F2 / F3 / F4** - Interne Meilensteine, getrackt in [#4175](https://github.com/QwenLM/qwen-code/issues/4175). F1: Bridge-Extraktion und `BridgeFileSystem`. F2: Workspace-gebundener MCP-Transport-Pool. F3: Multi-Client-Berechtigungsvermittlung. F4: Protokoll-Abschluss und Daemon-Client-Oberflächen.
- **MCP** - Model Context Protocol. Server stellen Tools, Ressourcen und Prompts bereit; der Daemon-ACP-Child verbindet sich mit ihnen.
- **McpTransportPool** - `packages/core/src/tools/mcp-transport-pool.ts`. F2-Workspace-gebundener Pool, der einen MCP-Transport pro Servername und Config-Fingerprint teilt.
- **Mediator policy** - Eine von `first-responder`, `designated`, `consensus` oder `local-only`. Legt fest, wie Multi-Client-Berechtigungs-Votes aufgelöst werden.
- **Originator client id** - Die `X-Qwen-Client-Id` des Clients, der den Prompt initiiert hat, der derzeit um Berechtigung bittet. Die `designated`-Policy akzeptiert nur Votes von dieser ID.
- **PoolEntry** - `packages/core/src/tools/mcp-pool-entry.ts`. Ein Eintrag in `McpTransportPool`: ein MCP-Transport, ein Refcount der angehängten Sessions und ein Idle-Drain-Timer.
- **Session scope** - `single` (eine von allen Clients geteilte ACP-Session) oder `thread` (eine Session pro Konversations-Thread). Der Standard ist `single`.
- **SSE** - Server-Sent Events. Der ausgehende Event-Channel des Daemons (`GET /session/:id/events`).
- **Workspace** - Das Verzeichnis, an das der Daemon beim Start gebunden wurde (`--workspace` oder `cwd`). Ein Daemon-Prozess entspricht einem Workspace.

## Implementierungs-Quellanker

Verwende diese Anker, wenn du von der Dokumentation in den neuesten `main`-Code wechselst:

| Oberfläche                          | Implementierungsanker                                                                                                                                                                                                                                                | Primäre Dokumentation                                                                                              |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Bootstrap und HTTP-Assembly         | `packages/cli/src/serve/run-qwen-serve.ts`, `packages/cli/src/serve/server.ts`, `packages/cli/src/serve/routes/health-demo.ts`, `/demo`                                                                                                                              | [`02`](./02-serve-runtime.md), [`20`](./20-quickstart-operations.md)                                               |
| ACP-Bridge und Session-Multiplexing | `packages/acp-bridge/src/bridge.ts`, `packages/acp-bridge/src/bridgeTypes.ts`, `@qwen-code/acp-bridge`                                                                                                                                                               | [`03`](./03-acp-bridge.md), [`08`](./08-session-lifecycle.md)                                                      |
| Berechtigungsvermittlung            | `packages/acp-bridge/src/permissionMediator.ts`, `fromLoopback: boolean`, `policy.*`                                                                                                                                                                                 | [`04`](./04-permission-mediation.md), [`12`](./12-auth-security.md)                                                |
| MCP-Transport-Pool                  | `packages/core/src/tools/mcp-transport-pool.ts`, `mcp-pool-key.ts`, `pid-descendants.ts`, `session-mcp-view.ts`, `/mcp refresh`, `MCPCallInterruptedError`                                                                                                           | [`05`](./05-mcp-transport-pool.md), [`06`](./06-mcp-budget-guardrails.md)                                          |
| MCP-Budget-Guardrails               | `packages/core/src/tools/mcp-workspace-budget.ts`, `ServeMcpBudgetStatusCell.scope`, `budgets[]`                                                                                                                                                                     | [`06`](./06-mcp-budget-guardrails.md)                                                                              |
| Workspace-Dateisystem               | `packages/cli/src/serve/fs/`, `assertTrustedForIntent(trusted, intent)`, `meta.matchedIgnore`, `includeIgnored`                                                                                                                                                      | [`07`](./07-workspace-filesystem.md)                                                                               |
| Event-Schema und SSE-Writer         | `packages/sdk-typescript/src/daemon/events.ts`, `packages/cli/src/serve/routes/sse-events.ts`, `formatSseFrame`, `packages/cli/src/acp-integration/session/emitters/ToolCallEmitter.ts`, `ToolCallEmitter.resolveToolProvenance`, `tool_call.provenance`, `serverId` | [`09`](./09-event-schema.md), [`10`](./10-event-bus.md)                                                            |
| Event-Resync                        | `state_resync_required`, `awaitingResync`, `RESYNC_PASSTHROUGH_TYPES`, `asKnownDaemonEvent`, `unrecognizedKnownEventCount`                                                                                                                                           | [`09`](./09-event-schema.md), [`10`](./10-event-bus.md)                                                            |
| Capabilities                        | `packages/cli/src/serve/capabilities.ts`, `mcp_server_restart_refused.reason`, `MCP_RESTART_REFUSED_REASONS.has`                                                                                                                                                     | [`11`](./11-capabilities-versioning.md)                                                                            |
| Auth und Device-Flow                | `packages/cli/src/serve/auth.ts`, `packages/cli/src/serve/auth/device-flow.ts`                                                                                                                                                                                       | [`12`](./12-auth-security.md)                                                                                      |
| TypeScript-SDK-Daemon-Client        | `packages/sdk-typescript/src/daemon/{DaemonClient,DaemonSessionClient,DaemonAuthFlow,sse,events,types}.ts`, `MCP_RESTART_DEFAULT_TIMEOUT_MS`                                                                                                                         | [`13`](./13-sdk-daemon-client.md)                                                                                  |
| Gemeinsamer UI-Transcript-Layer     | `DaemonUiEventType`, `DaemonSessionProvider`, `packages/webui/src/daemon/`                                                                                                                                                                                           | [`13`](./13-sdk-daemon-client.md), [`14`](./14-cli-tui-adapter.md), [`../daemon-ui/README.md`](../daemon-ui/README.md) |
| Channels und IDE-Adapter            | `packages/channels/`, `packages/vscode-ide-companion/src/services/daemonIdeConnection.ts`                                                                                                                                                                            | [`15`](./15-channel-adapters.md), [`16`](./16-vscode-ide-adapter.md)                                               |

## Was bewusst nicht im Scope ist

- **Java / Python SDK Daemon-Clients** - Heute liefert nur das TypeScript SDK einen Daemon-Client aus. Doc 13 ist rein auf TypeScript ausgerichtet.
- **Web-UI-Produktdetails** - Der gemeinsame Transcript-Layer und die Web-UI-Daemon-Entry-Points werden hier behandelt, aber das Produkt-UI-Layout wird in `docs/developers/daemon-ui/` und den Adapter-Design-Notizen verfolgt.
- **Zed-Erweiterung (`packages/zed-extension/`)** - Sie startet `qwen --acp` direkt über stdio und umgeht den Daemon.
- **Experimentelles In-Process-Hosting** - `--no-http-bridge` fällt heute noch auf die HTTP-Bridge zurück; ein stabiler In-Process-Serve-Modus würde neue Docs erfordern, sobald er verfügbar ist.

## Aktuelle Abdeckung des Daemon-Modus

### Abdeckung des Server-Kerns

| Bereich                   | Aktueller Status                                                                                                                                                                 | Primäre Dokumentation                                                     |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Bootstrap / Listen-Pfad   | `qwen serve` lädt `runQwenServe` lazy, validiert Auth/Workspace/Budget/Settings, baut eine Express-App auf, ruft dann `app.listen` auf und blockiert für immer bis zum Signal.   | [`02`](./02-serve-runtime.md), [`20`](./20-quickstart-operations.md)      |
| Auth / Netzwerk-Guardrails| Loopback ist standardmäßig ohne Bearer; Non-Loopback erfordert Bearer; `--require-auth` erweitert Bearer auf Loopback und `/health`; Host-Allowlist und Standard-CORS-Deny sind aktiv. | [`12`](./12-auth-security.md), [`17`](./17-configuration.md)              |
| Session-Lifecycle         | `POST /session`, `load`, `resume`, Metadata-Patch, Heartbeat, Eviction, Idle-Reaping, Prompt-Pending-Limits und Graceful-Close sind dokumentiert.                                 | [`08`](./08-session-lifecycle.md), [`10`](./10-event-bus.md)              |
| ACP-Bridge                | Standardmäßig wird ein einzelner ACP-Child gemultiplext; `sessionScope` unterstützt `single` und `thread`; `BridgeFileSystem`, Context-Filename, Env-Overrides und Channel-Idle-Timeout sind verdrahtet. | [`03`](./03-acp-bridge.md), [`07`](./07-workspace-filesystem.md)          |
| MCP-Pool / Budget         | Der Workspace-MCP-Pool ist standardmäßig aktiviert, außer `QWEN_SERVE_NO_MCP_POOL=1` ist gesetzt; Guardrail-Events und Restart-Semantik sind dokumentiert.                       | [`05`](./05-mcp-transport-pool.md), [`06`](./06-mcp-budget-guardrails.md) |
| Berechtigungen            | Der F3-Mediator unterstützt `first-responder`, `designated`, `consensus` und `local-only`; ungültige Einstellungen schlagen explizit fehl.                                       | [`04`](./04-permission-mediation.md), [`12`](./12-auth-security.md)       |

### Wire-Protokoll

| Bereich         | Aktueller Status                                                                                                                                                                                        | Primäre Dokumentation                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| HTTP-Routen     | Der Routen-Katalog befindet sich in `qwen-serve-protocol.md`; dieses Daemon-Set referenziert ihn nur und erklärt die Implementierungs-Zuständigkeit.                                                    | [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md), [`20`](./20-quickstart-operations.md)                   |
| Event-Schema    | `EVENT_SCHEMA_VERSION = 1`; 47 bekannte Event-Typen; ID-lose Subscriber-Synthetic-Frames; `_meta.serverTimestamp` gestempelt durch `EventBus.publish()` (mit `formatSseFrame()`-Fallback für Synthetic-Frames). | [`09`](./09-event-schema.md), [`10`](./10-event-bus.md)                                                           |
| Capabilities    | `SERVE_PROTOCOL_VERSION = 'v1'`; 75 registrierte Tags; 13 Conditional-Tags.                                                                                                                             | [`11`](./11-capabilities-versioning.md)                                                                           |
| Session-Shell   | `POST /session/:id/shell` existiert hinter `--enable-session-shell`, Bearer-Auth und session-gebundener `X-Qwen-Client-Id`; Capability-Tag ist conditional.                                               | [`11`](./11-capabilities-versioning.md), [`17`](./17-configuration.md), [`20`](./20-quickstart-operations.md)     |
| Rate-Limiting   | Optionales HTTP-Rate-Limit pro Tier wird durch CLI-Flags/Env und Conditional-Capability-Tag bereitgestellt.                                                                                               | [`11`](./11-capabilities-versioning.md), [`17`](./17-configuration.md)                                            |
### Clients / SDK

| Bereich | Aktueller Stand | Primäre Dokumentation |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript SDK Daemon-Client | `DaemonClient`, `DaemonSessionClient`, `DaemonAuthFlow`, SSE-Parser, Event-Reducer, Feature-Preflight und UI-Transkript-Exporte sind dokumentiert.            | [`13`](./13-sdk-daemon-client.md)                                                                                                             |
| Gemeinsame UI-Transkript-Schicht   | SDK `daemon/ui/*` normalisiert Daemon-Events in 42 semantische UI-Event-Typen, reduziert sie zu Transkript-Blöcken und stellt Renderer und Conformance-Helper bereit. | [`14`](./14-cli-tui-adapter.md), [`../daemon-ui/README.md`](../daemon-ui/README.md), [`../daemon-ui/MIGRATION.md`](../daemon-ui/MIGRATION.md) |
| Web-UI-Daemon-Consumer       | `packages/webui/src/daemon/` konsumiert den SDK-Transkript-Store über React-Provider und Adapter.                                                         | [`14`](./14-cli-tui-adapter.md), [`../daemon-client-adapters/web-ui.md`](../daemon-client-adapters/web-ui.md)                                 |
| CLI TUI / Channels / VS Code | Legacy-Pfade sind noch vorhanden; die Migration auf gemeinsame Transkript-Primitiven ist als Folgeaufgabe dokumentiert, aber noch nicht abgeschlossen.                                 | [`14`](./14-cli-tui-adapter.md), [`15`](./15-channel-adapters.md), [`16`](./16-vscode-ide-adapter.md)                                         |

### Referenz und Betrieb

| Bereich | Aktueller Stand | Primäre Dokumentation |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Konfiguration           | Vollständige `qwen serve`-Flags, Umgebungsvariablen, `settings.json`, `ServeOptions`, `BridgeOptions` und wichtige Konstanten sind auf einer Seite zusammengefasst.                   | [`17`](./17-configuration.md)         |
| Quickstart / Betrieb | Schnellster Startpfad, Start-Rezepte, curl-Prüfungen, Authentifizierungsverhalten der Demo-Seite, Route-Aufteilung, Shutdown-Verhalten und Rezepte für eingebettete Aufrufe werden behandelt. | [`20`](./20-quickstart-operations.md) |
| Fehler                  | Explizite Startfehler, Route-Fehler, Bridge-Fehler, EventBus-Fehler, Dateisystemfehler und Mediator-Fehler werden mitsamt Behebungsmaßnahmen zusammengefasst.        | [`18`](./18-error-taxonomy.md)        |
| Observability           | `QWEN_SERVE_DEBUG`, curl-Rezepte, nützliche Events, Telemetrie-Lücken und Checklisten zur Fehleruntersuchung sind dokumentiert.                                             | [`19`](./19-observability.md)         |

### Historische oder veraltete Oberflächen

| Oberfläche | Status |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `docs/developers/daemon-client-adapters/tui.md`    | Historischer Entwurf für den alten `DaemonTuiAdapter`-Spike; die aktuelle gemeinsame UI-Transkript-Architektur befindet sich in Doc 14. |
| `packages/cli/src/ui/daemon/daemon-tui-adapter.ts` | Experimenteller Legacy-Adapter ist noch im Tree vorhanden. Neue Arbeiten am gemeinsamen UI sollten SDK `daemon/ui/*` bevorzugen.                 |
| `--no-http-bridge`                                 | Wird aus Kompatibilitätsgründen akzeptiert, fällt aber auf http-bridge zurück und gibt eine Meldung auf stderr aus.                                    |

### Forward-Kompatibilität

- Event-Schema v1 ist additiv. Neue bekannte Event-Typen müssen an `DAEMON_KNOWN_EVENT_TYPE_VALUES` angehängt werden; alte SDKs müssen unbekannte Typen als vorwärtskompatibel behandeln.
- Capability-Tags sind Verhaltenskontrakte. Neues Verhalten benötigt ein neues Tag, insbesondere wenn Clients es vor dem Aufruf einer Route per Preflight prüfen könnten.
- `sessionScope: 'thread'` ist die aktuelle Aufteilung pro Konversations-Thread; vermeide es, ältere client-scoped Formulierungen wieder einzuführen.
- Envelope-`_meta` und ACP-Payload-`data._meta` sind voneinander zu unterscheiden. Die Provenienz von Tool-Calls liegt in der ACP-Payload; Zeitstempel der Server-Ausgabe liegen in der SSE-Envelope.

## Versionsherkunft

Diese Dokumentation spiegelt die Daemon-Mode-Oberfläche wider, die derzeit in `main` gemerged ist, einschließlich der Folgeaufgaben aus [#4412](https://github.com/QwenLM/qwen-code/pull/4412). Sie beschreibt bewusst das aktuelle Verhalten und nicht frühere Planungs-Snapshots der F-Serie.