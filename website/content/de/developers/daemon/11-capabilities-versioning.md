# Fähigkeiten & Protokollversionierung

## Übersicht

`GET /capabilities` ist der Preflight-Endpunkt des Daemons. Jeder SDK-Client sollte ihn vor dem Aufruf einer anderen Route lesen, damit er erfährt, welche Protokollversion der Daemon spricht, welche Feature-Tags aktiviert sind und an welchen Workspace der Daemon gebunden ist. Der Vertrag:

- **Es gibt eine Protokollversion: `v1`.** `SERVE_PROTOCOL_VERSION = 'v1'` und `SUPPORTED_SERVE_PROTOCOL_VERSIONS = ['v1']`. v1 ist intern additiv; Änderungen, die das Rahmenformat brechen, sind für v2 reserviert.
- **Jeder Tag hat eine `since`-Version.** Zukünftige v2-Daemons können sowohl v1- als auch v2-Tags ankündigen.
- **Manche Tags sind bedingt.** Zehn Tags (`require_auth`, `mcp_workspace_pool`, `mcp_pool_restart`, `allow_origin`, `prompt_absolute_deadline`, `writer_idle_timeout`, `workspace_settings`, `session_shell_command`, `rate_limit`, `workspace_reload`) werden nur dann angekündigt, wenn der entsprechende Deployment-Toggle aktiviert ist. Die Anwesenheit eines Tags bedeutet, dass das Verhalten existiert.
- **Capability-Tag = Verhaltensvertrag.** Das Hinzufügen neuen Verhaltens unter einem bestehenden Tag kann Clients still brechen, die den alten Tag preflightet haben. Neues Verhalten benötigt einen neuen Tag.

Das vollständige Register befindet sich in `packages/cli/src/serve/capabilities.ts`.

## Verantwortlichkeiten

- Jede Funktion deklarieren, die der Daemon ankündigen kann.
- Angekündigte Funktionen nach Protokollversion und Deployment-Toggles filtern.
- `getRegisteredServeFeatures()` (alle Schlüssel, ungefiltert), `getAdvertisedServeFeatures(version, toggles)` (gefiltert) und `getServeProtocolVersions()` (Hülle `{ current, supported }`) bereitstellen.
- Die Invariante wahren: „Tag vorhanden bedeutet Verhalten vorhanden". `server.test.ts` enthält einen Test, dass jeder bedingte Tag ankündigt, wenn sein Toggle eingeschaltet ist; das Hinzufügen eines bedingten Tags ohne Prädikat führt zu einem Fehler in diesem Test.

## Architektur

### Capability-Hülle

`/capabilities` gibt zurück:

```ts
{
  v: 1,                    // CAPABILITIES_SCHEMA_VERSION
  mode: 'http-bridge',
  features: ServeFeature[],
  workspaceCwd: string,
  protocol?: { current: 'v1', supported: ['v1'] },
  policy?: { permission: PermissionPolicy },
}
```

`workspaceCwd` ist der kanonische Workspace, der beim Daemon-Start gebunden wurde (siehe [`02-serve-runtime.md`](./02-serve-runtime.md)). `policy.permission` ist die aktive Mediator-Richtlinie.

### `ServeCapabilityDescriptor`

```ts
interface ServeCapabilityDescriptor {
  since: ServeProtocolVersion; // current = 'v1'
  modes?: readonly string[]; // listet Betriebsmodi auf, wenn eine Funktion Modi hat
}
```

Zwei v1-Tags verwenden `modes`:

- `mcp_guardrails: { since: 'v1', modes: ['warn', 'enforce'] }` – Clients sollten `'enforce'` preflighten, bevor sie sich auf das Ablehnungsverhalten verlassen.
- `permission_mediation: { since: 'v1', modes: ['first-responder', 'designated', 'consensus', 'local-only'] }` – dies ist die zur Build-Zeit unterstützte Menge; die aktive Richtlinie befindet sich in `policy.permission`.

### Bedingte Tags

```ts
export const CONDITIONAL_SERVE_FEATURES: ReadonlyMap<
  ServeFeature,
  (toggles: AdvertiseFeatureToggles) => boolean
> = new Map([
  ['require_auth', (t) => t.requireAuth === true],
  ['mcp_workspace_pool', (t) => t.mcpPoolActive === true],
  ['mcp_pool_restart', (t) => t.mcpPoolActive === true],
  ['allow_origin', (t) => t.allowOriginActive === true],
  [
    'prompt_absolute_deadline',
    (t) => typeof t.promptDeadlineMs === 'number' && t.promptDeadlineMs > 0,
  ],
  [
    'writer_idle_timeout',
    (t) =>
      typeof t.writerIdleTimeoutMs === 'number' && t.writerIdleTimeoutMs > 0,
  ],
  ['workspace_settings', (t) => t.persistSettingAvailable === true],
  ['session_shell_command', (t) => t.sessionShellCommandEnabled === true],
  ['rate_limit', (t) => t.rateLimit === true],
  ['workspace_reload', (t) => t.reloadAvailable === true],
]);
```

Die `Map` speichert Zugehörigkeit und Prädikat zusammen. Das Hinzufügen eines neuen bedingten Tags erfordert zwei koordinierte Änderungen:

1. Den Tag und seine `since`-Version in `SERVE_CAPABILITY_REGISTRY` registrieren.
2. Sein Prädikat zu `CONDITIONAL_SERVE_FEATURES` hinzufügen.

Basis-Tags sind nicht in der `Map` enthalten und werden bedingungslos angekündigt. Dies wird bewusst durch Abwesenheit und nicht durch eine separate Menge dargestellt.

### 67 Tags (v1, nach Domänen gruppiert)

Foundation: `health`, `capabilities`.

Sessions: `session_create`, `session_scope_override`, `session_load`, `session_resume`, `unstable_session_resume`, `session_list`, `session_prompt`, `session_cancel`, `session_events`, `session_set_model`, `session_close`, `session_metadata`, `session_context`, `session_context_usage`, `session_supported_commands`, `session_tasks`, `session_stats`, `session_lsp`, `session_approval_mode_control`, `session_recap`, `session_btw`, **`session_shell_command`** (bedingt), `session_language`, `session_rewind`, `session_hooks`, `session_branch`.

Streaming: `slow_client_warning`, `typed_event_schema`.

Identität und Heartbeat: `client_identity`, `client_heartbeat`.

Berechtigungen: `session_permission_vote`, `permission_vote`, **`permission_mediation`** (`modes: ['first-responder', 'designated', 'consensus', 'local-only']`).
Workspace-Snapshots (schreibgeschützt): `workspace_mcp`, `workspace_skills`, `workspace_providers`, `workspace_env`, `workspace_preflight`, `workspace_hooks`, `workspace_extensions`.

Workspace-Mutation (Wave 4+): `workspace_memory`, `workspace_agents`, `workspace_agent_generate`, `workspace_tool_toggle`, **`workspace_settings`** (conditional), `workspace_init`, `workspace_mcp_restart`, `workspace_mcp_manage`, `workspace_file_read`, `workspace_file_bytes`, `workspace_file_write`, **`workspace_reload`** (conditional).

MCP-Guardrails: **`mcp_guardrails`** (`modes: ['warn', 'enforce']`), `mcp_guardrail_events`, `mcp_server_runtime_mutation`, **`mcp_workspace_pool`** (conditional), **`mcp_pool_restart`** (conditional).

Prompt-Steuerung: **`prompt_absolute_deadline`** (conditional), **`writer_idle_timeout`** (conditional), `non_blocking_prompt`.

Auth: `auth_provider_install`, `auth_device_flow`, **`require_auth`** (conditional), **`allow_origin`** (conditional).

Ratenbegrenzung: **`rate_limit`** (conditional).

Fett markierte Tags haben `modes` oder sind conditional.

## Ablauf

### Daemon-Seite: Envelope zusammenbauen

```mermaid
flowchart LR
    A["GET /capabilities"] --> B["getAdvertisedServeFeatures(version, toggles)"]
    B --> C["filter by isFeatureAvailableInProtocol"]
    C --> D["for each feature, check CONDITIONAL_SERVE_FEATURES"]
    D --> E["yes: predicate(toggles) ? include : drop"]
    D --> F["no: include unconditionally"]
    E --> G["return ServeFeature[]"]
    F --> G
    G --> H["wrap in envelope:<br/>{ v: 1, mode, features, workspaceCwd, protocol, policy }"]
```

### Client-Seite: Feature-Preflight

```mermaid
sequenceDiagram
    autonumber
    participant C as Client
    participant D as GET /capabilities
    participant R as Route

    C->>D: GET /capabilities
    D-->>C: { v, mode, features, workspaceCwd, protocol, policy }
    C->>C: features.includes('mcp_workspace_pool')?
    alt yes
        C->>R: rely on pool-aware response shapes<br/>(for example entries[] from /workspace/mcp/:server/restart)
    else no
        C->>R: legacy single-entry response shape
    end
```

## Zustand und Lebenszyklus

- `CAPABILITIES_SCHEMA_VERSION` ist die Versionsnummer der Envelope-Struktur, aktuell `1`. Nur bei einem Bruch der Envelope hochzählen.
- `SERVE_PROTOCOL_VERSION = 'v1'` ist die Version des Protokoll-Features. Das Hinzufügen von Features innerhalb von v1 ist additiv; alte Clients sehen neues Verhalten nur, wenn sie den neuen Tag preflighen. Das Entfernen eines Features ist ein v2-Bruch.
- `EVENT_SCHEMA_VERSION = 1` ist das `v`-Feld des SSE-Frames (siehe [`09-event-schema.md`](./09-event-schema.md)). Es ist eine unabhängige Versionsachse; eine Änderung des Event-Schemas bedeutet nicht zwangsläufig eine Änderung der Protokollversion und umgekehrt.
- `session_resume` ist die stabile Daemon-Fähigkeit für `POST /session/:id/resume`. `unstable_session_resume` bleibt als veralteter Alias bekanntgegeben, da die zugrunde liegende ACP-Methode immer noch `connection.unstable_resumeSession` heißt; neue Clients sollten `session_resume` per Feature-Erkennung nutzen.

## Abhängigkeiten

- Gelesen von `packages/cli/src/serve/server.ts` beim Erstellen der `/capabilities`-Antworten.
- Toggle-Eingaben kommen von `runQwenServe` / `createServeApp`: `{ requireAuth, mcpPoolActive, allowOriginActive, promptDeadlineMs, writerIdleTimeoutMs, persistSettingAvailable, sessionShellCommandEnabled, rateLimit, reloadAvailable }`.
- Die aktive `permission`-Policy im Envelope stammt von `BridgeOptions.permissionPolicy`, welche selbst `settings.json` `policy.permissionStrategy` liest.

## Konfiguration

| Quelle                    | Parameter                                                       | Auswirkung auf Capabilities                                                                                                  |
| ------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| CLI-Flag                  | `--require-auth`                                                | Meldet `require_auth` an.                                                                                                    |
| Umgebungsvariable         | `QWEN_SERVE_NO_MCP_POOL=1`                                      | Unterdrückt die Bekanntgabe von `mcp_workspace_pool` und `mcp_pool_restart`; MCP-Events erhalten keinen `scope: 'workspace'`-Stempel. |
| CLI-Flag                  | `--mcp-client-budget=N`, `--mcp-budget-mode={off,warn,enforce}` | Ändert nicht das Tag-Set (`mcp_guardrails` wird immer bekannt gegeben), aber das Verhalten bei Server-Reservierung und -Ablehnung. |
| CLI-Flag / Umgebungsvar.  | `--rate-limit` / `QWEN_SERVE_RATE_LIMIT=1`                      | Meldet `rate_limit` an.                                                                                                      |
| Eingebettete Option       | `persistSettingAvailable`                                       | Meldet `workspace_settings` an.                                                                                              |
| CLI-Flag / eingebettet    | `--enable-session-shell` / `sessionShellCommandEnabled`         | Meldet `session_shell_command` an.                                                                                           |
| Eingebettete Option       | `reloadAvailable`                                               | Meldet `workspace_reload` an.                                                                                                |
| `settings.json`           | `policy.permissionStrategy`                                     | Setzt das Envelope-Feld `policy.permission`.                                                                                 |
## Einschränkungen und bekannte Grenzen

- **`--require-auth` versteckt Preflight.** Mit `--require-auth` erfordern alle Routen, einschließlich `/capabilities`, eine Bearer-Authentifizierung. Ein nicht authentifizierter Client kann keinen Preflight für `caps.features.require_auth` durchführen; der 401-Antworttext ist die Entdeckungsoberfläche. Das Tag `require_auth` ist eine authentifizierte Bestätigung für Audit-Oberflächen gehärteter Bereitstellungen.
- **Das Vorhandensein eines Tags bedeutet, dass das Verhalten existiert.** Falls ein zukünftiger Mitwirkender Verhalten unter einem bestehenden Tag hinzufügt, ohne `since` zu erhöhen, können Clients, die den alten Tag per Preflight abgefragt haben, unmerklich neues Verhalten erhalten. Die Konvention ist: Neues Verhalten bekommt ein neues Tag.
- **`unstable_*`-Tags können zwischen Versionen ihre Form ändern**, ohne dass ein Protokoll-Bump erfolgt. Fixieren Sie die SDK-Version, wenn Sie von ihnen abhängen.
- Der Routenkatalog befindet sich in [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md); diese Seite verzichtet absichtlich auf eine Duplizierung.

## Referenzen

- `packages/cli/src/serve/capabilities.ts`
- `packages/cli/src/serve/types.ts` (`ServeOptions`, `CapabilitiesEnvelope`)
- `packages/cli/src/serve/server.ts` (Envelope-Zusammenbau)
- `packages/acp-bridge/src/eventBus.ts` (`EVENT_SCHEMA_VERSION`)
- Drahtreferenz: [`../qwen-serve-protocol.md`](../qwen-serve-protocol.md)
- Authentifizierung und Bereitstellungsabsicherung: [`12-auth-security.md`](./12-auth-security.md)
