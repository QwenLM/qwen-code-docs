# Daemon-Entwicklerdokumentation

Dies ist die entwicklerorientierte technische Dokumentation für den **Qwen Code Daemon-Modus**: der `qwen serve`-HTTP-Daemon, das `@qwen-code/acp-bridge`-Paket, der Arbeitsbereichs-bezogene MCP-Transportpool, die Multi-Client-Berechtigungsvermittlung, das typisierte Daemon-Ereignisschema v1, der TypeScript-SDK-Daemon-Client und die Adapter, die mit dem Daemon verbinden.

Sie ergänzt – ersetzt aber nicht – die folgenden bestehenden Dokumente:

| Bestehendes Dokument                                                                     | Zielgruppe              | Wahrheitsquelle für                                           |
| ---------------------------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------- |
| [`../../users/qwen-serve.md`](../../users/qwen-serve.md)                                 | Betreiber               | Benutzer-Schnellstart, Flags, Bedrohungsmodell               |
| [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md)                                 | Protokoll-Implementierer | HTTP-Routen-Katalog, Anfrage/Antwort-Formate, Fehlercodes     |
| [`../examples/daemon-client-quickstart.md`](../examples/daemon-client-quickstart.md)     | SDK-Benutzer            | TypeScript-Komplettdurchlauf                                 |
| [`../daemon-client-adapters/`](../daemon-client-adapters/)                               | Adapter-Autoren         | Legacy-Client-Adapter-Design-Dokumente                       |
| [`14-cli-tui-adapter.md`](./14-cli-tui-adapter.md)                                       | Adapter-Autoren         | Client-Adapter-Design-Notizen                                |
| [`../../design/f2-mcp-transport-pool.md`](../../design/f2-mcp-transport-pool.md)         | F2-Maintainer           | Arbeitsbereichs-MCP-Transportpool-Design v2.2                |

Wenn Sie **einen Daemon starten und verwenden** möchten, lesen Sie zuerst `qwen-serve.md`. Wenn Sie **einen Client für das Drahtformat erstellen** möchten, lesen Sie `qwen-serve-protocol.md`. Wenn Sie **die Daemon-Interna verstehen, erweitern oder debuggen** möchten, lesen Sie diesen Satz.

## Lesereihenfolge

Wählen Sie den Pfad, der zu Ihrem Ziel passt:

- **Daemon zuerst starten und verifizieren**: `20 -> 17 -> 19`.
- **Neuer Mitwirkender**: `01 -> 02 -> 03 -> 08 -> 09 -> 10 -> 11 -> 12`.
- **Hinzufügen eines neuen Client-Adapters**: `01 -> 09 -> 10 -> 13 -> (14 / 15 / 16)`.
- **Arbeiten am MCP-Pool oder Budget**: `01 -> 03 -> 05 -> 06`.
- **Arbeiten an Berechtigungen**: `01 -> 03 -> 04 -> 12`.
- **Debuggen eines Produktions-Daemons**: `19 -> 18 -> 17 -> 20`.

## Dokumentsatz

### Grundlagen

- [`01-architecture.md`](./01-architecture.md) – Systemarchitektur, Prozess-Topologie, Paketübersicht und alle sieben Top-Level-Sequenzdiagramme.

### Server-Kern

- [`02-serve-runtime.md`](./02-serve-runtime.md) – `runQwenServe`- Bootstrap, Express-App, Middleware-Kette, Graceful Shutdown.
- [`03-acp-bridge.md`](./03-acp-bridge.md) – `@qwen-code/acp-bridge`-Paket-Interna, Session-Multiplexing, Channel-Factory, ACP-Child-Spawn.
- [`04-permission-mediation.md`](./04-permission-mediation.md) – `MultiClientPermissionMediator`, vier Policys, N1-Timeout-Invariante, Cancel-Sentinel.
- [`05-mcp-transport-pool.md`](./05-mcp-transport-pool.md) – `McpTransportPool` (F2), Pool-Einträge, Reverse-Index, Neustart, Drain.
- [`06-mcp-budget-guardrails.md`](./06-mcp-budget-guardrails.md) – `WorkspaceMcpBudget`, Modi (`off`/`warn`/`enforce`), Hysterese, verweigerte Batch-Koaleszenz.
- [`07-workspace-filesystem.md`](./07-workspace-filesystem.md) – `WorkspaceFileSystem`-Sandbox, Pfad-Richtlinie, Audit, `BridgeFileSystem`-Vertrag.
- [`08-session-lifecycle.md`](./08-session-lifecycle.md) – Erstellen / Anhängen / Laden / Fortsetzen, `X-Qwen-Client-Id`, Heartbeat, Eviction, Metadaten.
- [`09-event-schema.md`](./09-event-schema.md) – Typisiertes Ereignisschema v1: alle 43 bekannten Ereignistypen mit Payloads, Reducern, Vorwärtskompatibilität.
- [`10-event-bus.md`](./10-event-bus.md) – `EventBus`, monotone IDs, Ring-Wiedergabe, `Last-Event-ID`, Slow-Client-Backpressure, `client_evicted`.
- [`11-capabilities-versioning.md`](./11-capabilities-versioning.md) – Capability-Registry, Protokollversion, Schema-Version, bedingte Anzeige.
- [`12-auth-security.md`](./12-auth-security.md) – Bearer-Middleware, Host-Allowlist, CORS-Deny, Mutation-Gate, `--require-auth`, `/health`-Ausnahme, Device-Flow.

### Clients

- [`13-sdk-daemon-client.md`](./13-sdk-daemon-client.md) – TypeScript SDK: `DaemonClient`, `DaemonSessionClient`, `DaemonAuthFlow`, SSE-Parser, Event-Reducer, `ui/*`-Transkript-Schicht.
- [`14-cli-tui-adapter.md`](./14-cli-tui-adapter.md) – Gemeinsame UI-Transkript-Schicht und die Beziehung des Legacy-CLI-TUI-Daemon-Adapters.
- [`15-channel-adapters.md`](./15-channel-adapters.md) – `DaemonChannelBridge`-gemeinsame Basis plus DingTalk-, WeChat-(Weixin-), Telegram-, Feishu-per-Kanal-Adapter.
- [`16-vscode-ide-adapter.md`](./16-vscode-ide-adapter.md) – `DaemonIdeConnection`, Loopback-only-Erzwingung, Webview-Brücke.

### Referenz-Anhänge

- [`17-configuration.md`](./17-configuration.md) – Umgebungsvariablen, CLI-Flags, `settings.json`-Schlüssel, die den Daemon beeinflussen.
- [`18-error-taxonomy.md`](./18-error-taxonomy.md) – Typisierte Fehler pro Schicht mit Behebung.
- [`19-observability.md`](./19-observability.md) – `QWEN_SERVE_DEBUG`, Debugging-Rezepte, Telemetrie-Lücken.
- [`20-quickstart-operations.md`](./20-quickstart-operations.md) – Kürzester Startpfad, curl-Prüfungen, Routenübersicht und eingebettete Aufrufrezepte.

## Glossar

- **ACP** – Agent Client Protocol. JSON-RPC über stdio, gesprochen zwischen der Daemon-Bridge und dem ACP-Child-Prozess. Dies ist nicht das HTTP-Protokoll, das Clients gegen den Daemon verwenden.
- **ACP-Child** – der Child-Prozess, den der Daemon spawnet (`qwen --acp`), um die eigentliche Agentenlaufzeit zu hosten. Die Bridge multiplexiert einen ACP-Child über viele verbundene Clients.
- **acp-bridge** – das `@qwen-code/acp-bridge`-Paket (`packages/acp-bridge/`). Besitzt Session-Multiplexing, den Permission-Mediator, den Event-Bus und die Channel-Factory.
- **BridgeClient** – `packages/acp-bridge/src/bridgeClient.ts`. Kapselt eine ACP `ClientSideConnection` und behandelt `requestPermission`, `sendPrompt` und `cancelSession`.
- **Channel-Factory** – steckbare Strategie zum Spawnen oder Anhängen an einen ACP-Child. Der Standard `spawnChannel` führt `qwen --acp` als Subprozess aus; `inMemoryChannel` führt es für Tests prozessintern aus.
- **DaemonClient** – `packages/sdk-typescript/src/daemon/DaemonClient.ts`. Die TypeScript-SDK-HTTP-Fassade über dem Daemon.
- **DaemonSessionClient** – `packages/sdk-typescript/src/daemon/DaemonSessionClient.ts`. Session-bezogener Wrapper, der `lastSeenEventId` für SSE-Wiedergabe verfolgt.
- **EventBus** – `packages/acp-bridge/src/eventBus.ts`. Pro-Session-In-Memory-Pub/Sub mit monotonen IDs, einem begrenzten Ring und Backpressure pro Subscriber.
- **F1 / F2 / F3 / F4** – interne Meilensteine, verfolgt in [#4175](https://github.com/QwenLM/qwen-code/issues/4175). F1: Bridge-Extraktion und `BridgeFileSystem`. F2: Arbeitsbereichs-bezogener MCP-Transportpool. F3: Multi-Client-Berechtigungsvermittlung. F4: Protokollabschluss und Daemon-Client-Oberflächen.
- **MCP** – Model Context Protocol. Server stellen Werkzeuge, Ressourcen und Prompts bereit; der Daemon-ACP-Child verbindet sich mit ihnen.
- **McpTransportPool** – `packages/core/src/tools/mcp-transport-pool.ts`. F2-Arbeitsbereichs-Pool, der einen MCP-Transport pro Servername und Konfigurations-Fingerprint teilt.
- **Mediator-Policy** – eine von `first-responder`, `designated`, `consensus` oder `local-only`. Entscheidet, wie Multi-Client-Berechtigungsabstimmungen aufgelöst werden.
- **Originator-Client-ID** – die `X-Qwen-Client-Id` des Clients, der den Prompt initiiert hat, der gerade eine Berechtigung anfordert. Die `designated`-Policy akzeptiert nur Stimmen von dieser ID.
- **PoolEntry** – `packages/core/src/tools/mcp-pool-entry.ts`. Ein Eintrag in `McpTransportPool`: ein MCP-Transport, ein Referenzzähler der angehängten Sessions und ein Idle-Drain-Timer.
- **Session-Scope** – `single` (eine ACP-Session, die von allen Clients gemeinsam genutzt wird) oder `thread` (eine Session pro Konversationsthread). Der Standard ist `single`.
- **SSE** – Server-Sent Events. Der ausgehende Ereigniskanal des Daemons (`GET /session/:id/events`).
- **Workspace** – das Verzeichnis, an das der Daemon beim Booten gebunden wurde (`--workspace` oder `cwd`). Ein Daemon-Prozess gleich ein Workspace.

## Implementierungs-Quellanbindungen

Verwenden Sie diese Anbindungen, wenn Sie von der Dokumentation zum aktuellen `main`-Code wechseln:

| Oberfläche                            | Implementierungs-Anbindungen                                                                                                                                                                                                                                                       | Primäre Dokumente                                                                                                      |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Bootstrap und HTTP-Assembly           | `packages/cli/src/serve/run-qwen-serve.ts`, `server.ts`, `/demo`                                                                                                                                                                                                                   | [`02`](./02-serve-runtime.md), [`20`](./20-quickstart-operations.md)                                                   |
| ACP-Bridge und Session-Multiplexing   | `packages/acp-bridge/src/bridge.ts`, `packages/acp-bridge/src/bridgeTypes.ts`, `@qwen-code/acp-bridge`                                                                                                                                                                             | [`03`](./03-acp-bridge.md), [`08`](./08-session-lifecycle.md)                                                          |
| Berechtigungsvermittlung              | `packages/acp-bridge/src/permissionMediator.ts`, `fromLoopback: boolean`, `policy.*`                                                                                                                                                                                               | [`04`](./04-permission-mediation.md), [`12`](./12-auth-security.md)                                                    |
| MCP-Transportpool                     | `packages/core/src/tools/mcp-transport-pool.ts`, `mcp-pool-key.ts`, `pid-descendants.ts`, `session-mcp-view.ts`, `/mcp refresh`, `MCPCallInterruptedError`                                                                                                                         | [`05`](./05-mcp-transport-pool.md), [`06`](./06-mcp-budget-guardrails.md)                                              |
| MCP-Budget-Guardrails                 | `packages/core/src/tools/mcp-workspace-budget.ts`, `ServeMcpBudgetStatusCell.scope`, `budgets[]`                                                                                                                                                                                   | [`06`](./06-mcp-budget-guardrails.md)                                                                                  |
| Workspace-Dateisystem                 | `packages/cli/src/serve/fs/`, `assertTrustedForIntent(trusted, intent)`, `meta.matchedIgnore`, `includeIgnored`                                                                                                                                                                    | [`07`](./07-workspace-filesystem.md)                                                                                   |
| Ereignisschema und SSE-Writer         | `packages/sdk-typescript/src/daemon/events.ts`, `packages/cli/src/serve/server.ts`, `formatSseFrame`, `packages/cli/src/acp-integration/session/emitters/ToolCallEmitter.ts`, `ToolCallEmitter.resolveToolProvenance`, `tool_call.provenance`, `serverId`                            | [`09`](./09-event-schema.md), [`10`](./10-event-bus.md)                                                                |
| Ereignis-Neusynchronisation           | `state_resync_required`, `awaitingResync`, `RESYNC_PASSTHROUGH_TYPES`, `asKnownDaemonEvent`, `unrecognizedKnownEventCount`                                                                                                                                                         | [`09`](./09-event-schema.md), [`10`](./10-event-bus.md)                                                                |
| Capabilities                          | `packages/cli/src/serve/capabilities.ts`, `mcp_server_restart_refused.reason`, `MCP_RESTART_REFUSED_REASONS.has`                                                                                                                                                                   | [`11`](./11-capabilities-versioning.md)                                                                                |
| Authentifizierung und Device-Flow     | `packages/cli/src/serve/auth.ts`, `packages/cli/src/serve/auth/device-flow.ts`                                                                                                                                                                                                     | [`12`](./12-auth-security.md)                                                                                          |
| TypeScript-SDK-Daemon-Client          | `packages/sdk-typescript/src/daemon/{DaemonClient,DaemonSessionClient,DaemonAuthFlow,sse,events,types}.ts`, `MCP_RESTART_DEFAULT_TIMEOUT_MS`                                                                                                                                       | [`13`](./13-sdk-daemon-client.md)                                                                                      |
| Gemeinsame UI-Transkript-Schicht      | `DaemonUiEventType`, `DaemonSessionProvider`, `packages/webui/src/daemon/`                                                                                                                                                                                                         | [`13`](./13-sdk-daemon-client.md), [`14`](./14-cli-tui-adapter.md), [`../daemon-ui/README.md`](../daemon-ui/README.md) |
| Kanal- und IDE-Adapter                | `packages/channels/`, `packages/vscode-ide-companion/src/services/daemonIdeConnection.ts`                                                                                                                                                                                          | [`15`](./15-channel-adapters.md), [`16`](./16-vscode-ide-adapter.md)                                                   |

## Was bewusst nicht abgedeckt wird

- **Java / Python SDK-Daemon-Clients** – nur das TypeScript SDK liefert heute einen Daemon-Client. Dokument 13 ist TypeScript-only.
- **Web-UI-Produktdetails** – die gemeinsame Transkript-Schicht und die Web-UI-Daemon-Einstiegspunkte werden hier behandelt, aber das Produkt-UI-Layout wird in `docs/developers/daemon-ui/` und in den Adapter-Design-Notizen verfolgt.
- **Zed-Erweiterung (`packages/zed-extension/`)** – sie startet `qwen --acp` direkt über stdio und umgeht den Daemon.
- **Experimentelles prozessinternes Hosting** – `--no-http-bridge` fällt heute immer noch auf http-bridge zurück; ein stabiler prozessinterner Serve-Modus würde neue Dokumente benötigen, wenn er verfügbar ist.

## Aktuelle Abdeckung des Daemon-Modus

### Server-Kern-Abdeckung

| Bereich                       | Aktueller Zustand                                                                                                                                                                             | Primäre Dokumente                                                                                         |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Bootstrap / Listen-Pfad       | `qwen serve` lädt `runQwenServe` lazy, validiert Authentifizierung/Workspace/Budget/Einstellungen, erstellt eine Express-App, ruft dann `app.listen` auf und blockiert bis zum Signal.        | [`02`](./02-serve-runtime.md), [`20`](./20-quickstart-operations.md)                                      |
| Authentifizierung / Netzwerk  | Loopback standardmäßig ohne Bearer; Nicht-Loopback erfordert Bearer; `--require-auth` erweitert Bearer auf Loopback und `/health`; Host-Allowlist und Standard-CORS-Deny sind aktiv.           | [`12`](./12-auth-security.md), [`17`](./17-configuration.md)                                              |
| Session-Lebenszyklus          | `POST /session`, `load`, `resume`, Metadaten-Patch, Heartbeat, Eviction, Idle-Reaping, Prompt-Pending-Grenzen und Graceful-Shutdown sind dokumentiert.                                        | [`08`](./08-session-lifecycle.md), [`10`](./10-event-bus.md)                                              |
| ACP-Bridge                    | Standardmäßig gemultiplexter Single-ACP-Child; `sessionScope` unterstützt `single` und `thread`; `BridgeFileSystem`, Kontext-Dateiname, Umgebungsüberschreibungen und Channel-Idle-Timeout sind verdrahtet. | [`03`](./03-acp-bridge.md), [`07`](./07-workspace-filesystem.md)                                          |
| MCP-Pool / Budget             | Workspace-MCP-Pool ist standardmäßig aktiviert, es sei denn, `QWEN_SERVE_NO_MCP_POOL=1`; Guardrail-Ereignisse und Neustart-Semantik sind dokumentiert.                                        | [`05`](./05-mcp-transport-pool.md), [`06`](./06-mcp-budget-guardrails.md)                                 |
| Berechtigungen                | F3-Mediator unterstützt `first-responder`, `designated`, `consensus` und `local-only`; ungültige Einstellungen schlagen explizit fehl.                                                         | [`04`](./04-permission-mediation.md), [`12`](./12-auth-security.md)                                       |

### Drahtprotokoll

| Bereich           | Aktueller Zustand                                                                                                                                            | Primäre Dokumente                                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| HTTP-Routen       | Der Routenkatalog befindet sich in `qwen-serve-protocol.md`; dieser Daemon-Satz referenziert ihn nur und erklärt die Implementierungsverantwortung.           | [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md), [`20`](./20-quickstart-operations.md)                      |
| Ereignisschema    | `EVENT_SCHEMA_VERSION = 1`; 43 bekannte Ereignistypen; id-lose Subscriber-Synthese-Frames; `_meta.serverTimestamp` an der SSE-Schreibgrenze gestempelt.      | [`09`](./09-event-schema.md), [`10`](./10-event-bus.md)                                                              |
| Capabilities      | `SERVE_PROTOCOL_VERSION = 'v1'`; 67 registrierte Tags; 10 bedingte Tags.                                                                                     | [`11`](./11-capabilities-versioning.md)                                                                              |
| Session-Shell     | `POST /session/:id/shell` existiert hinter `--enable-session-shell`, Bearer-Auth und session-gebundener `X-Qwen-Client-Id`; Capability-Tag ist bedingt.      | [`11`](./11-capabilities-versioning.md), [`17`](./17-configuration.md), [`20`](./20-quickstart-operations.md)        |
| Ratenbegrenzung   | Optionales pro-Stufe-HTTP-Ratenlimit wird durch CLI-Flags/Umgebung und bedingtes Capability-Tag bereitgestellt.                                               | [`11`](./11-capabilities-versioning.md), [`17`](./17-configuration.md)                                               |

### Clients / SDK

| Bereich                          | Aktueller Zustand                                                                                                                                                     | Primäre Dokumente                                                                                                                                       |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript-SDK-Daemon-Client     | `DaemonClient`, `DaemonSessionClient`, `DaemonAuthFlow`, SSE-Parser, Event-Reducer, Feature-Preflight und UI-Transkript-Exporte sind dokumentiert.                    | [`13`](./13-sdk-daemon-client.md)                                                                                                                        |
| Gemeinsame UI-Transkript-Schicht | SDK `daemon/ui/*` normalisiert Daemon-Ereignisse in 37 UI-semantische Ereignistypen, reduziert sie zu Transkript-Blöcken und bietet Renderer/Konformitätshelfer.      | [`14`](./14-cli-tui-adapter.md), [`../daemon-ui/README.md`](../daemon-ui/README.md), [`../daemon-ui/MIGRATION.md`](../daemon-ui/MIGRATION.md)            |
| Web-UI-Daemon-Consumer           | `packages/webui/src/daemon/` konsumiert den SDK-Transkript-Store über React-Provider und Adapter.                                                                     | [`14`](./14-cli-tui-adapter.md), [`../daemon-client-adapters/web-ui.md`](../daemon-client-adapters/web-ui.md)                                            |
| CLI-TUI / Kanäle / VS Code       | Legacy-Pfade existieren noch; Migration zu gemeinsamen Transkript-Primitiven ist als Folgearbeit dokumentiert, nicht als abgeschlossenes Verhalten.                   | [`14`](./14-cli-tui-adapter.md), [`15`](./15-channel-adapters.md), [`16`](./16-vscode-ide-adapter.md)                                                    |
### Referenz und Betrieb

| Bereich                     | Aktueller Zustand                                                                                                                                                                     | Primäre Dokumente                 |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| Konfiguration               | Die vollständigen `qwen serve`-Flags, Umgebungsvariablen, `settings.json`, `ServeOptions`, `BridgeOptions` und wichtige Konstanten sind auf einer Seite zusammengefasst.              | [`17`](./17-configuration.md)     |
| Quickstart / Betrieb        | Der kürzeste Startpfad, Startrezepte, curl-Prüfungen, Authentifizierungsverhalten der Demoseite, Routenaufteilung, Herunterfahren und eingebettete Aufrufrezepte werden behandelt.     | [`20`](./20-quickstart-operations.md) |
| Fehler                      | Explizite Fehler beim Start, Routenfehler, Bridge-Fehler, EventBus-Fehler, Dateisystemfehler und Vermittlungsfehler werden mit Abhilfemaßnahmen zusammengefasst.                     | [`18`](./18-error-taxonomy.md)    |
| Beobachtbarkeit             | `QWEN_SERVE_DEBUG`, curl-Rezepte, nützliche Ereignisse, Telemetrielücken und Untersuchungs-Checklisten sind dokumentiert.                                                            | [`19`](./19-observability.md)     |

### Historische oder veraltete Oberflächen

| Oberfläche                                         | Status                                                                                                                             |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `docs/developers/daemon-client-adapters/tui.md`    | Historischer Entwurf für den alten `DaemonTuiAdapter`-Spike; die aktuelle gemeinsame UI-Transkript-Architektur befindet sich in Dokument 14. |
| `packages/cli/src/ui/daemon/daemon-tui-adapter.ts` | Legacy experimenteller Adapter noch im Codebaum. Neue gemeinsame UI-Arbeit sollte das SDK `daemon/ui/*` bevorzugen.                 |
| `--no-http-bridge`                                 | Aus Kompatibilitätsgründen akzeptiert, fällt aber auf http-bridge zurück und gibt stderr aus.                                      |

### Vorwärtskompatibilität

- Das Ereignisschema v1 ist additiv. Neue bekannte Ereignistypen müssen an `DAEMON_KNOWN_EVENT_TYPE_VALUES` angehängt werden; alte SDKs müssen unbekannte Typen als vorwärtskompatibel behandeln.
- Fähigkeits-Tags sind Verhaltensverträge. Neues Verhalten benötigt ein neues Tag, insbesondere wenn Clients es vor dem Aufruf einer Route vorab prüfen könnten.
- `sessionScope: 'thread'` ist der aktuelle Split pro Gesprächsthread; vermeide die Wiedereinführung älterer client-spezifischer Formulierungen.
- Envelope `_meta` und ACP-Payload `data._meta` sind unterschiedlich. Die Herkunft von Tool-Aufrufen liegt unter dem ACP-Payload; Server-Sendezeitstempel liegen auf dem SSE-Envelope.

## Versionsherkunft

Dieses Dokumenten-Set spiegelt die aktuell in `main` zusammengeführte Oberfläche des Daemon-Modus wider, einschließlich der Folgearbeiten aus [#4412](https://github.com/QwenLM/qwen-code/pull/4412). Es beschreibt bewusst das aktuelle Verhalten anstelle früherer F-Series-Planungsschnappschüsse.