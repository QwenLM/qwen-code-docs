# Daemon-Entwicklerdokumentation

Dies ist die entwicklerorientierte technische Dokumentation für den **qwen-code Daemon-Modus**: den `qwen serve` HTTP-Daemon, das `@qwen-code/acp-bridge`-Paket, den Workspace-weiten MCP-Transportpool, die Multi-Client-Berechtigungsmediation, das typisierte Daemon-Ereignisschema v1, den TypeScript SDK Daemon-Client und die Adapter, die mit dem Daemon verbinden.

Es ergänzt, anstatt diese vorhandenen Dokumente zu ersetzen:

| Vorhandenes Dokument                                                                         | Zielgruppe              | Wahrheitsquelle für                                      |
| -------------------------------------------------------------------------------------------- | ----------------------- | -------------------------------------------------------- |
| [`../../users/qwen-serve.md`](../../users/qwen-serve.md)                             | Betreiber               | Benutzer-Schnellstart, Flags, Bedrohungsmodell           |
| [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md)                             | Protokoll-Implementierer | HTTP-Route-Katalog, Anfrage-/Antwort-Formate, Fehlercodes |
| [`../examples/daemon-client-quickstart.md`](../examples/daemon-client-quickstart.md) | SDK-Benutzer             | Ende-zu-Ende-TypeScript-Durchlauf                        |
| [`../daemon-client-adapters/`](../daemon-client-adapters/)                           | Adapter-Autoren          | Legacy-Client-Adapter-Design-Dokumente                   |
| [`14-cli-tui-adapter.md`](./14-cli-tui-adapter.md)                                   | Adapter-Autoren          | Notizen zum Client-Adapter-Design                        |
| [`../../design/f2-mcp-transport-pool.md`](../../design/f2-mcp-transport-pool.md)     | F2-Maintainer            | Workspace-MCP-Transportpool-Design v2.2                  |

Wenn Sie einen **Daemon starten und nutzen** möchten, lesen Sie zuerst `qwen-serve.md`. Wenn Sie einen **Client auf Basis des Drahtformats erstellen** möchten, lesen Sie `qwen-serve-protocol.md`. Wenn Sie die **Interna des Daemons verstehen, erweitern oder debuggen** möchten, lesen Sie diesen Satz von Dokumenten.

## Lesereihenfolge

Wählen Sie den Pfad, der Ihrem Ziel entspricht:

- **Starten und Überprüfen eines Daemons zuerst**: `20 -> 17 -> 19`.
- **Neuer Mitwirkender**: `01 -> 02 -> 03 -> 08 -> 09 -> 10 -> 11 -> 12`.
- **Hinzufügen eines neuen Client-Adapters**: `01 -> 09 -> 10 -> 13 -> (14 / 15 / 16)`.
- **Arbeiten am MCP-Pool oder Budget**: `01 -> 03 -> 05 -> 06`.
- **Arbeiten an Berechtigungen**: `01 -> 03 -> 04 -> 12`.
- **Debuggen eines Produktions-Daemons**: `19 -> 18 -> 17 -> 20`.

## Dokumentenset

### Grundlagen

- [`01-architecture.md`](./01-architecture.md) – Systemarchitektur, Prozess-Topologie, Paketkarte und alle sieben Top-Level-Sequenzdiagramme.

### Server-Kern

- [`02-serve-runtime.md`](./02-serve-runtime.md) – `runQwenServe`-Bootstrap, Express-App, Middleware-Kette, Graceful Shutdown.
- [`03-acp-bridge.md`](./03-acp-bridge.md) – `@qwen-code/acp-bridge`-Paket-Interna, Session-Multiplexing, Channel Factory, ACP-Child-Spawn.
- [`04-permission-mediation.md`](./04-permission-mediation.md) – `MultiClientPermissionMediator`, vier Richtlinien, N1-Timeout-Invariante, Cancel-Sentinel.
- [`05-mcp-transport-pool.md`](./05-mcp-transport-pool.md) – `McpTransportPool` (F2), Pool-Einträge, Reverse-Index, Neustart, Drain.
- [`06-mcp-budget-guardrails.md`](./06-mcp-budget-guardrails.md) – `WorkspaceMcpBudget`, Modi (`off`/`warn`/`enforce`), Hysterese, refused-batch-Koaleszenz.
- [`07-workspace-filesystem.md`](./07-workspace-filesystem.md) – `WorkspaceFileSystem`-Sandbox, Pfadrichtlinie, Audit, `BridgeFileSystem`-Vertrag.
- [`08-session-lifecycle.md`](./08-session-lifecycle.md) – Erstellen/Anhängen/Laden/Fortsetzen, `X-Qwen-Client-Id`, Heartbeat, Verdrängung, Metadaten.
- [`09-event-schema.md`](./09-event-schema.md) – Typisiertes Ereignisschema v1: alle 43 bekannten Ereignistypen mit Payloads, Reduzierer, Vorwärtskompatibilität.
- [`10-event-bus.md`](./10-event-bus.md) – `EventBus`, monotone IDs, Ring-Wiedergabe, `Last-Event-ID`, Slow-Client-Backpressure, `client_evicted`.
- [`11-capabilities-versioning.md`](./11-capabilities-versioning.md) – Fähigkeitsregistrierung, Protokollversion, Schema-Version, bedingte Ankündigung.
- [`12-auth-security.md`](./12-auth-security.md) – Bearer-Middleware, Host-Allowlist, CORS-Deny, Mutation-Gate, `--require-auth`, `/health`-Ausnahme, Device Flow.

### Clients

- [`13-sdk-daemon-client.md`](./13-sdk-daemon-client.md) – TypeScript SDK: `DaemonClient`, `DaemonSessionClient`, `DaemonAuthFlow`, SSE-Parser, Ereignisreduzierer, `ui/*`-Transkriptschicht.
- [`14-cli-tui-adapter.md`](./14-cli-tui-adapter.md) – Gemeinsame UI-Transkriptschicht und die Beziehung zum Legacy-CLI-TUI-Daemon-Adapter.
- [`15-channel-adapters.md`](./15-channel-adapters.md) – `DaemonChannelBridge` gemeinsame Basis plus DingTalk, WeChat (Weixin), Telegram, Feishu pro-Kanal-Adapter.
- [`16-vscode-ide-adapter.md`](./16-vscode-ide-adapter.md) – `DaemonIdeConnection`, Loopback-Only-Erzwingung, Webview-Brückenbau.

### Referenz-Anhänge

- [`17-configuration.md`](./17-configuration.md) – Umgebungsvariablen, CLI-Flags, `settings.json`-Schlüssel, die den Daemon betreffen.
- [`18-error-taxonomy.md`](./18-error-taxonomy.md) – Typisierte Fehler pro Schicht mit Abhilfe.
- [`19-observability.md`](./19-observability.md) – `QWEN_SERVE_DEBUG`, Debugging-Rezepte, Telemetrielücken.
- [`20-quickstart-operations.md`](./20-quickstart-operations.md) – Kürzester Startpfad, curl-Prüfungen, Routenkarte und eingebettete Aufrufrezepte.
## Glossar

- **ACP** – Agent Client Protocol. JSON-RPC über stdio, das zwischen der Daemon-Bridge und dem ACP-Kindprozess gesprochen wird. Dies ist nicht das HTTP-Protokoll, das Clients gegen den Daemon verwenden.
- **ACP-Kind** – Der Kindprozess, den der Daemon startet (`qwen --acp`), um die eigentliche Agentenlaufzeit zu hosten. Die Bridge multiplext einen ACP-Kindprozess über viele verbundene Clients hinweg.
- **acp-bridge** – Das Paket `@qwen-code/acp-bridge` (`packages/acp-bridge/`). Zuständig für Session-Multiplexing, den Permission-Mediator, den Event-Bus und die Channel-Factory.
- **BridgeClient** – `packages/acp-bridge/src/bridgeClient.ts`. Kapselt eine ACP `ClientSideConnection` und behandelt `requestPermission`, `sendPrompt` und `cancelSession`.
- **Channel-Factory** – Steckbare Strategie zum Erstellen oder Anbinden an einen ACP-Kindprozess. Der Standard `spawnChannel` führt `qwen --acp` als Unterprozess aus; `inMemoryChannel` führt ihn prozessintern für Tests aus.
- **DaemonClient** – `packages/sdk-typescript/src/daemon/DaemonClient.ts`. Die HTTP-Fassade des TypeScript SDK auf Daemon-Ebene.
- **DaemonSessionClient** – `packages/sdk-typescript/src/daemon/DaemonSessionClient.ts`. Session-bezogener Wrapper, der `lastSeenEventId` für SSE-Wiederholungen verfolgt.
- **EventBus** – `packages/acp-bridge/src/eventBus.ts`. Pro-Session-In-Memory-Pub/Sub mit monotonen IDs, einem begrenzten Ring und Backpressure pro Abonnent.
- **F1 / F2 / F3 / F4** – Interne Meilensteine, verfolgt in [#4175](https://github.com/QwenLM/qwen-code/issues/4175). F1: Brückenextraktion und `BridgeFileSystem`. F2: Arbeitsbereichsbezogener MCP-Transport-Pool. F3: Multi-Client-Permission-Mediation. F4: Protokollabschluss und Daemon-Client-Oberflächen.
- **MCP** – Model Context Protocol. Server stellen Tools, Ressourcen und Prompts bereit; der Daemon-ACP-Kindprozess verbindet sich mit ihnen.
- **McpTransportPool** – `packages/core/src/tools/mcp-transport-pool.ts`. F2-Arbeitsbereichsbezogener Pool, der einen MCP-Transport pro Servername und Konfigurations-Fingerprint gemeinsam nutzt.
- **Mediator-Richtlinie** – Eine von `first-responder`, `designated`, `consensus` oder `local-only`. Legt fest, wie Multi-Client-Permission-Abstimmungen aufgelöst werden.
- **Originator-Client-ID** – Die `X-Qwen-Client-Id` des Clients, der den Prompt gestartet hat, für den aktuell eine Berechtigung angefordert wird. Die Richtlinie `designated` akzeptiert nur Stimmen von dieser ID.
- **PoolEntry** – `packages/core/src/tools/mcp-pool-entry.ts`. Ein Eintrag in `McpTransportPool`: ein MCP-Transport, ein Referenzzähler der zugeordneten Sessions und ein Timer für das Leerlauf-Entladen.
- **Session-Bereich** – `single` (eine ACP-Session, die von allen Clients gemeinsam genutzt wird) oder `thread` (eine Session pro Gesprächsstrang). Der Standard ist `single`.
- **SSE** – Server-Sent Events. Der ausgehende Ereigniskanal des Daemons (`GET /session/:id/events`).
- **Arbeitsbereich (Workspace)** – Das Verzeichnis, an das der Daemon beim Start gebunden wurde (`--workspace` oder `cwd`). Ein Daemon-Prozess entspricht einem Arbeitsbereich.

## Implementierungs-Quellanker

Verwenden Sie diese Anker, wenn Sie von der Dokumentation zum aktuellen `main`-Code wechseln:

| Oberfläche                            | Implementierungsanker                                                                                                                                                                                                                                    | Primäre Dokumente                                                                                                      |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Bootstrap und HTTP-Assembly           | `packages/cli/src/serve/run-qwen-serve.ts`, `server.ts`, `/demo`                                                                                                                                                                                           | [`02`](./02-serve-runtime.md), [`20`](./20-quickstart-operations.md)                                                   |
| ACP-Bridge und Session-Multiplexing   | `packages/acp-bridge/src/bridge.ts`, `packages/acp-bridge/src/bridgeTypes.ts`, `@qwen-code/acp-bridge`                                                                                                                                                     | [`03`](./03-acp-bridge.md), [`08`](./08-session-lifecycle.md)                                                          |
| Permission-Mediation                  | `packages/acp-bridge/src/permissionMediator.ts`, `fromLoopback: boolean`, `policy.*`                                                                                                                                                                      | [`04`](./04-permission-mediation.md), [`12`](./12-auth-security.md)                                                    |
| MCP-Transport-Pool                    | `packages/core/src/tools/mcp-transport-pool.ts`, `mcp-pool-key.ts`, `pid-descendants.ts`, `session-mcp-view.ts`, `/mcp refresh`, `MCPCallInterruptedError`                                                                                                | [`05`](./05-mcp-transport-pool.md), [`06`](./06-mcp-budget-guardrails.md)                                              |
| MCP-Budget-Schutzmaßnahmen            | `packages/core/src/tools/mcp-workspace-budget.ts`, `ServeMcpBudgetStatusCell.scope`, `budgets[]`                                                                                                                                                          | [`06`](./06-mcp-budget-guardrails.md)                                                                                  |
| Arbeitsbereichs-Dateisystem           | `packages/cli/src/serve/fs/`, `assertTrustedForIntent(trusted, intent)`, `meta.matchedIgnore`, `includeIgnored`                                                                                                                                           | [`07`](./07-workspace-filesystem.md)                                                                                   |
| Ereignisschema und SSE-Writer         | `packages/sdk-typescript/src/daemon/events.ts`, `packages/cli/src/serve/server.ts`, `formatSseFrame`, `packages/cli/src/acp-integration/session/emitters/ToolCallEmitter.ts`, `ToolCallEmitter.resolveToolProvenance`, `tool_call.provenance`, `serverId` | [`09`](./09-event-schema.md), [`10`](./10-event-bus.md)                                                                |
| Ereignis-Neusynchronisation           | `state_resync_required`, `awaitingResync`, `RESYNC_PASSTHROUGH_TYPES`, `asKnownDaemonEvent`, `unrecognizedKnownEventCount`                                                                                                                                | [`09`](./09-event-schema.md), [`10`](./10-event-bus.md)                                                                |
| Fähigkeiten                           | `packages/cli/src/serve/capabilities.ts`, `mcp_server_restart_refused.reason`, `MCP_RESTART_REFUSED_REASONS.has`                                                                                                                                          | [`11`](./11-capabilities-versioning.md)                                                                                |
| Auth und Device Flow                  | `packages/cli/src/serve/auth.ts`, `packages/cli/src/serve/auth/device-flow.ts`                                                                                                                                                                            | [`12`](./12-auth-security.md)                                                                                          |
| TypeScript SDK Daemon-Client          | `packages/sdk-typescript/src/daemon/{DaemonClient,DaemonSessionClient,DaemonAuthFlow,sse,events,types}.ts`, `MCP_RESTART_DEFAULT_TIMEOUT_MS`                                                                                                              | [`13`](./13-sdk-daemon-client.md)                                                                                      |
| Geteilte UI-Transkript-Schicht        | `DaemonUiEventType`, `DaemonSessionProvider`, `packages/webui/src/daemon/`                                                                                                                                                                                | [`13`](./13-sdk-daemon-client.md), [`14`](./14-cli-tui-adapter.md), [`../daemon-ui/README.md`](../daemon-ui/README.md) |
| Kanäle und IDE-Adapter                | `packages/channels/`, `packages/vscode-ide-companion/src/services/daemonIdeConnection.ts`                                                                                                                                                                 | [`15`](./15-channel-adapters.md), [`16`](./16-vscode-ide-adapter.md)                                                   |
## Was bewusst nicht abgedeckt wird

- **Java / Python SDK Daemon-Clients** – nur der TypeScript SDK liefert derzeit einen Daemon-Client aus. Doc 13 ist nur für TypeScript.
- **Web-UI-Produktdetails** – die gemeinsame Transkript-Ebene und die Web-UI-Daemon-Einstiegspunkte werden hier behandelt, aber das Produkt-UI-Layout wird in `docs/developers/daemon-ui/` und den Adapter-Design-Notizen nachverfolgt.
- **Zed-Erweiterung (`packages/zed-extension/`)** – sie startet `qwen --acp` direkt über stdio und umgeht den Daemon.
- **Experimentelles In-Process-Hosting** – `--no-http-bridge` fällt derzeit immer noch auf http-bridge zurück; ein stabiler In-Process-Serve-Modus würde neue Doku benötigen, sobald er verfügbar ist.

## Aktuelle Daemon-Modus-Abdeckung

### Server-Kern-Abdeckung

| Bereich                        | Aktueller Zustand                                                                                                                                                                             | Primäre Dokumente                                                     |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Bootstrap / Listen-Pfad       | `qwen serve` lädt träge `runQwenServe`, validiert Auth/Workspace/Budget/Einstellungen, erstellt eine Express-App, ruft dann `app.listen` auf und blockiert dauerhaft bis zum Signal.           | [`02`](./02-serve-runtime.md), [`20`](./20-quickstart-operations.md)  |
| Auth / Netzwerksicherheit      | Loopback standardmäßig ohne Bearer; Nicht-Loopback erfordert Bearer; `--require-auth` erweitert Bearer auf Loopback und `/health`; Host-Zulassungsliste und standardmäßige CORS-Verweigerung sind aktiv. | [`12`](./12-auth-security.md), [`17`](./17-configuration.md)          |
| Sitzungslebenszyklus           | `POST /session`, `load`, `resume`, Metadaten-Patch, Heartbeat, Räumung, Leerlaufbereinigung, ausstehende Prompt-Limits und ordentliche Schließung sind dokumentiert.                         | [`08`](./08-session-lifecycle.md), [`10`](./10-event-bus.md)          |
| ACP-Brücke                     | Standardmäßig wird ein einzelner ACP-Kindprozess gemultiplext; `sessionScope` unterstützt `single` und `thread`; `BridgeFileSystem`, Kontext-Dateiname, Umgebungsüberschreibungen und Kanal-Leerlauf-Timeout sind verdrahtet. | [`03`](./03-acp-bridge.md), [`07`](./07-workspace-filesystem.md)      |
| MCP-Pool / Budget              | Workspace-MCP-Pool ist standardmäßig aktiv, es sei denn `QWEN_SERVE_NO_MCP_POOL=1`; Sicherheitsereignisse und Neustart-Semantik sind dokumentiert.                                             | [`05`](./05-mcp-transport-pool.md), [`06`](./06-mcp-budget-guardrails.md) |
| Berechtigungen                 | F3-Vermittler unterstützt `first-responder`, `designated`, `consensus` und `local-only`; ungültige Einstellungen schlagen explizit fehl.                                                        | [`04`](./04-permission-mediation.md), [`12`](./12-auth-security.md)   |

### Wire-Protokoll

| Bereich                      | Aktueller Zustand                                                                                                                                                         | Primäre Dokumente                                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| HTTP-Routen                  | Der Routenkatalog befindet sich in `qwen-serve-protocol.md`; dieses Daemon-Set verweist nur darauf und erklärt die Implementierungsverantwortung.                       | [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md), [`20`](./20-quickstart-operations.md)           |
| Ereignisschema               | `EVENT_SCHEMA_VERSION = 1`; 43 bekannte Ereignistypen; synthetische Frames für Abonnenten ohne ID; `_meta.serverTimestamp` wird beim SSE-Schreibvorgang gesetzt.          | [`09`](./09-event-schema.md), [`10`](./10-event-bus.md)                                                   |
| Fähigkeiten                  | `SERVE_PROTOCOL_VERSION = 'v1'`; 67 registrierte Tags; 10 bedingte Tags.                                                                                                    | [`11`](./11-capabilities-versioning.md)                                                                   |
| Sitzungs-Shell               | `POST /session/:id/shell` existiert hinter `--enable-session-shell`, Bearer-Auth und sessiongebundenem `X-Qwen-Client-Id`; das Fähigkeits-Tag ist bedingt.                | [`11`](./11-capabilities-versioning.md), [`17`](./17-configuration.md), [`20`](./20-quickstart-operations.md) |
| Ratenbegrenzung              | Optionale HTTP-Ratenbegrenzung pro Stufe wird über CLI-Flags/Umgebungsvariablen und bedingtes Fähigkeits-Tag bereitgestellt.                                                 | [`11`](./11-capabilities-versioning.md), [`17`](./17-configuration.md)                                    |

### Clients / SDK

| Bereich                         | Aktueller Zustand                                                                                                                                                                | Primäre Dokumente                                                                                                                             |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript SDK Daemon-Client    | `DaemonClient`, `DaemonSessionClient`, `DaemonAuthFlow`, SSE-Parser, Ereignis-Reducer, Feature-Preflight und UI-Transkript-Exporte sind dokumentiert.                              | [`13`](./13-sdk-daemon-client.md)                                                                                                             |
| Gemeinsame UI-Transkript-Ebene  | SDK `daemon/ui/*` normalisiert Daemon-Ereignisse in 37 semantische UI-Ereignistypen, reduziert sie in Transkript-Blöcke und stellt Renderer/Konformitätshelfer bereit.            | [`14`](./14-cli-tui-adapter.md), [`../daemon-ui/README.md`](../daemon-ui/README.md), [`../daemon-ui/MIGRATION.md`](../daemon-ui/MIGRATION.md) |
| Web-UI Daemon-Konsument         | `packages/webui/src/daemon/` konsumiert den SDK-Transkript-Store über React-Provider und Adapter.                                                                                | [`14`](./14-cli-tui-adapter.md), [`../daemon-client-adapters/web-ui.md`](../daemon-client-adapters/web-ui.md)                                 |
| CLI TUI / Kanäle / VS Code      | Legacy-Pfade existieren noch; die Migration zu gemeinsamen Transkript-Primitiven ist als Folgearbeit dokumentiert, nicht als abgeschlossenes Verhalten.                           | [`14`](./14-cli-tui-adapter.md), [`15`](./15-channel-adapters.md), [`16`](./16-vscode-ide-adapter.md)                                         |
### Referenz und Betrieb

| Bereich              | Aktueller Zustand                                                                                                                                           | Primäre Doku                         |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Konfiguration        | Alle `qwen serve`-Flags, Umgebungsvariablen, `settings.json`, `ServeOptions`, `BridgeOptions` und wichtige Konstanten sind auf einer Seite zusammengefasst. | [`17`](./17-configuration.md)        |
| Schnellstart / Betrieb | Kürzester Startpfad, Startrezepte, curl-Prüfungen, Demo-Seiten-Auth-Verhalten, Routenaufteilung, Herunterfahrverhalten und eingebettete Aufrufrezepte sind abgedeckt. | [`20`](./20-quickstart-operations.md) |
| Fehler               | Explizite Start-Fehlschläge, Routenfehler, Bridge-Fehler, EventBus-Fehler, Dateisystemfehler und Mediator-Fehler werden mit Abhilfe zusammengefasst.        | [`18`](./18-error-taxonomy.md)       |
| Beobachtbarkeit      | `QWEN_SERVE_DEBUG`, curl-Rezepte, nützliche Events, Telemetrie-Lücken und Untersuchung-Checklisten sind dokumentiert.                                      | [`19`](./19-observability.md)        |

### Historische oder veraltete Oberflächen

| Oberfläche                                         | Status                                                                                                                      |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `docs/developers/daemon-client-adapters/tui.md`    | Historischer Entwurf für den alten `DaemonTuiAdapter`-Prototyp; die aktuelle gemeinsame UI-Transkript-Architektur befindet sich in Doku 14. |
| `packages/cli/src/ui/daemon/daemon-tui-adapter.ts` | Legacy-experimenteller Adapter, der noch im Baum vorhanden ist. Neue gemeinsame UI-Arbeiten sollten bevorzugt das SDK `daemon/ui/*` nutzen. |
| `--no-http-bridge`                                 | Aus Kompatibilitätsgründen akzeptiert, fällt aber auf http-bridge zurück und gibt stderr aus.                               |

### Vorwärtskompatibilität

- Eventschema v1 ist additiv. Neue bekannte Eventtypen müssen an `DAEMON_KNOWN_EVENT_TYPE_VALUES` angehängt werden; alte SDKs müssen unbekannte Typen als vorwärtskompatibel behandeln.
- Capability-Tags sind Verhaltensverträge. Neues Verhalten benötigt einen neuen Tag, insbesondere wenn Clients dies vor einem Routenaufruf vorab prüfen könnten.
- `sessionScope: 'thread'` ist die aktuelle Aufteilung pro Gesprächs-Thread; vermeiden Sie die Wiedereinführung älterer clientbezogener Formulierungen.
- Envelope `_meta` und ACP-Payload `data._meta` sind unterschiedlich. Der Ursprung von Tool-Aufrufen liegt unter der ACP-Payload; Server-Sende-Zeitstempel liegen auf dem SSE-Envelope.

## Versionsherkunft

Dieses Dokumentationsset spiegelt die aktuell in `main` zusammengeführte Daemon-Mode-Oberfläche wider, einschließlich der Nacharbeiten aus [#4412](https://github.com/QwenLM/qwen-code/pull/4412). Es beschreibt absichtlich das aktuelle Verhalten und nicht frühere F-Serie-Planungsentwürfe.
