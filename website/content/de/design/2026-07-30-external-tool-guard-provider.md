# External Tool Guard Provider für Managed ACP

Status: Implementierungsdesign
Tracking-Issue: https://github.com/QwenLM/qwen-code/issues/8102
Abhängig von: https://github.com/QwenLM/qwen-code/pull/8032

## Problem und Scope

Qwen Code unterstützt bereits Berechtigungsregeln und Hooks, aber diese
Mechanismen geben einem verwalteten `qwen serve`-Deployment keine
verbindliche, externe, maschinenverifizierbare Entscheidung unmittelbar vor
jedem Tool-Executor. PR #8032 fügt diesen Executor-Grenzen-Callback hinzu.
Diese Änderung verbindet den Callback mit einem kleinen externen Provider für
verwaltete ACP-Deployments.

Der Scope ist bewusst eine einzige Entscheidung:

> Gegeben die Runtime-eigene Session- und Prompt-Identität, das von der
> Runtime akzeptierte Tool-Call-Korrelationslabel, den kanonischen Tool-Namen
> und die finalen Argumente — darf diese Aufruf jetzt ausgeführt werden?

Diese Änderung fügt kein Task-Protokoll, keinen Ergebnis-Callback, keinen
Observer-/Replay-Service, keinen generellen Hook-Ersatz und keine
Autorisierungsschicht für explizite Daemon-Steuer-/Verwaltungs-APIs hinzu.
Sie macht eine erlaubte Tool-Implementierung auch nicht deterministisch und
sandboxed nicht das Verhalten eines Befehls, den der Provider zu erlauben
wählte.

## Sicherheitsvertrag

- Aktivierung nur beim Prozessstart: `off` (Default) oder `required`.
- In `off` wird kein Provider konstruiert, kein Provider-RPC durchgeführt und
  keine Capability beworben. Da keiner der neuen Inputs vorhanden ist, bleibt
  das Verhalten von Standalone-CLI / normalem ACP unverändert. Die reservierte
  Token-Umgebungsvariable wird weiterhin aus den Ausführungsumgebungen von
  Nachfolgeprozessen gescrubbt, falls gesetzt.
- In `required` führt der Daemon-Start einen authentifizierten, versionierten
  Handshake durch. Fehlende oder ungültige Konfiguration sowie ein nicht
  verfügbarer oder inkompatibler Provider lassen den Daemon-Start
  fehlschlagen.
- Jeder unterstützte Top-Level-Aufruf, der die bestehenden Berechtigungs- und
  `PreToolUse`-Gates passiert und die finale Ausführungsgrenze erreicht, führt
  genau einen begrenzten `prepare`-Request aus. Eine frühere
  Berechtigungs-/Hook-Ablehnung führt keinen Provider-Request aus. Es gibt
  keinen Retry. Timeout, Abbruch, Transportfehler, fehlerhafte Response,
  Identitäts-Mismatch oder explizite Ablehnung verhindern, dass der Executor
  läuft.
- Die von PR #8032 geerbte Reihenfolge ist Berechtigungsbehandlung,
  `PreToolUse`-Hooks, dann dieser Guard, dann der Ziel-Executor. Der Guard
  autorisiert nur den Ziel-Tool-Executor; er autorisiert oder sandboxed kein
  Hook-Verhalten. Verwaltete Deployments, die eine All-Effects-Grenze
  benötigen, müssen Hooks deaktivieren oder ihnen unabhängig vertrauen und sie
  unabhängig regieren.
- Slash-Befehl-Aktionen werden vor dem Modell-/Tool-Scheduling aufgelöst und
  sind keine Tool-Guard-Aufrufe. Einige Built-ins können Dateien oder
  Einstellungen direkt mutieren. Mit Ausnahme der unten explizit abgelehnten
  Nested-Agent-Einstiegspunkte klassifiziert diese Änderung keine
  Slash-Befehle; verwaltete Hosts müssen Slash-Befehl-Input ablehnen oder
  nicht genehmigte Befehle mit `slashCommands.disabled` /
  `--disabled-slash-commands` deaktivieren.
- Die Provider-Zugangsdaten bleiben im `qwen serve`-Prozess. Sie werden nie in
  die Umgebung von ACP-Kind, Channel-Worker, Tool-Subprozess, MCP-Server,
  Hook oder Subagent kopiert. Die CLI erfasst den umgebenden Token und löscht
  ihn, bevor die Runtime-Umgebungs-Snapshots eingefroren werden.
- Die Kind-zu-Parent-Guard-Anfrage nutzt den bestehenden privaten ACP-Channel.
  Die Bridge akzeptiert sie nur für eine Session, die diesem Channel gehört,
  und nur dann, wenn ihre Prompt-Id der aktiven Prompt-Id der Bridge
  entspricht.
- Jeder ACP-Channel muss in seiner Initialize-Antwort `required-v1`
  bestätigen und damit nachweisen, dass das Kind den privaten Marker
  konsumiert und den Executor-Callback installiert hat. Eine fehlende oder
  abweichende Bestätigung lehnt den Channel ab, bevor eine Session erstellt
  werden kann.
- Verwaltetes ACP startet die interaktive
  Suggestion-Speculation-Runtime nicht. Erreicht eine Einbettung unabhängig
  den Spekulationspfad von PR #8032, ist derselbe Callback weiterhin vor dem
  Apply erforderlich.
- V1 unterstützt nur Top-Level-Tool-Aufrufe, die während eines aktiven
  Vordergrund-Managed-Prompts erfolgen. `agent`, `workflow`,
  `create_sub_session`, `send_message`, der direkte `/fork`-Einstiegspunkt
  und die agentenbasierten Workspace-Memory-Remember-/Dream-Steuerungen werden
  abgelehnt, bevor sie ein unabhängiges AgentCore/Session starten, resumieren
  oder an es delegieren können. Automatische/Cron-Turns und wiederhergestellte
  Hintergrund-Agenten tragen keinen aktiven Managed-Prompt-Kontext, daher
  schlagen ihre geguardeten Tools fail-closed fehl.
- Ein Top-Level-Shell-Aufruf mit `is_background=true` oder ein
  `monitor`-Aufruf ist weiterhin ein geguardeter Aufruf: der Provider sieht
  seine finalen Argumente und darf ihn ablehnen. Der Guard autorisiert den
  gestarteten Prozess nicht fortlaufend und fügt kein neues
  Prozess-Abschluss-Audit-Protokoll hinzu. Verwaltete Policies, die
  Vordergrund-Abschluss erfordern, müssen diese Argument-/Tool-Formen
  ablehnen.
- Ein geguardeter MCP-Transportfehler wird als mehrdeutiges Ergebnis behandelt
  und nicht automatisch wieder verbunden/replayed. Die frühere Erlaubnis kann
  keinen zweiten Ausführungsversuch autorisieren.
- Die bestehenden ACP-`session/update`-Tool-Lifecycle-Events bleiben die
  Quelle der Ausführungsbeobachtung. Der Provider-Request und diese Events
  korrelieren über `sessionId`, `promptId` und `toolCallId`.

Die Identitätsstärke ist bewusst explizit:

- `sessionId` wird vom Daemon/von der ACP-Session erzeugt und owned;
- `promptId` wird vom Daemon erzeugt und neu gebunden, nachdem Caller-Metadaten
  entfernt wurden;
- `toolCallId` ist ein von der Runtime akzeptiertes Korrelationslabel. Es kann
  aus dem Modell-Tool-Call stammen, daher ist es weder ein
  Authentifizierungssubjekt noch ein eigenständiger Idempotenz-Key;
- `requestId` wird von `qwen serve` für den einen Provider-RPC erzeugt. Es ist
  der Provider-Entscheidungs-Operations-Identifier, aber bestehende
  Lifecycle-Events korrelieren über das vollständige
  `(sessionId, promptId, toolCallId)`-Tupel.

## Konfiguration

```bash
export QWEN_CODE_EXTERNAL_TOOL_GUARD_TOKEN='replace-with-local-secret'

qwen serve \
  --external-tool-guard-mode=required \
  --external-tool-guard-endpoint=http://127.0.0.1:8787 \
  --external-tool-guard-timeout-ms=3000
```

Regeln:

- `--external-tool-guard-mode` akzeptiert `off|required` und defaultet auf
  `off`.
- `required` erfordert einen Origin-only-Loopback-HTTP(S)-Endpoint und einen
  nicht leeren Token von höchstens 8192 UTF-16-Code-Units ohne Steuerzeichen
  aus `QWEN_CODE_EXTERNAL_TOOL_GUARD_TOKEN`.
- Endpoint-Userinfo, Query, Fragment und Nicht-Root-Pfade werden abgelehnt.
- `localhost` wird vom Client auf `127.0.0.1` gepinnt (mit `localhost`-SNI
  für HTTPS); es wird nie über umgebende DNS- oder Proxy-Konfiguration
  aufgelöst.
- Der Timeout ist eine Ganzzahl von 100 bis 30000 ms. Default ist 3000 ms.
- Endpoint und Token ohne `mode=required` aktivieren keinen Provider. Der
  reservierte Token wird weiterhin konsumiert und gescrubbt, statt Tools
  ausgesetzt zu werden.

## Runtime-Datenfluss

```mermaid
sequenceDiagram
    participant Host as "DataAgent / operator"
    participant Serve as "qwen serve"
    participant Guard as "External Guard"
    participant ACP as "private qwen --acp"
    participant Exec as "Tool executor"

    Host->>Serve: "start with mode=required"
    Serve->>Guard: "POST /v1/handshake (Bearer token)"
    Guard-->>Serve: "version + nonce + prepare capability"
    Serve->>ACP: "spawn; private ACP capability + required marker"
    ACP-->>Serve: "initialize acknowledgement: required-v1"
    Host->>Serve: "prompt"
    Serve->>ACP: "prompt + runtime-owned sessionId/promptId"
    ACP->>ACP: "permission + PreToolUse gates"
    ACP->>Serve: "private extMethod prepare(sessionId,promptId,toolCallId,name,args)"
    Serve->>Serve: "verify owned session + active prompt"
    Serve->>Guard: "POST /v1/prepare (exactly once)"
    Guard-->>Serve: "allow or deny"
    Serve-->>ACP: "decision"
    alt "allow"
        ACP->>Exec: "execute final invocation"
        ACP-->>Serve: "existing tool_call_update terminal event"
    else "deny / unknown / timeout / cancel"
        ACP-->>Serve: "existing EXECUTION_DENIED/cancelled terminal event"
    end
```

## Wire-Vertrag

Alle Bodys verwenden UTF-8-JSON und `Content-Type: application/json`. Requests
verwenden `Authorization: Bearer <token>`. Redirects werden nicht verfolgt.
Response-Bodys werden vor dem JSON-Parsen begrenzt. Ein serialisierter Request
darf 1 MiB nicht überschreiten, eine Response darf 64 KiB nicht überschreiten,
und ein Ablehnungsgrund darf 500 UTF-16-Code-Units nicht überschreiten oder
Steuerzeichen enthalten.

Finale Tool-Argumente sind Anwendungsdaten und können Quellcode, Pfade,
Queries oder einem Tool übergebene Zugangsdaten enthalten. Der Provider muss
sie als sensibel behandeln und darf sie nicht wahllos persistieren, nur weil
der Transport Loopback ist.

Handshake-Request:

```json
{
  "protocolVersion": 1,
  "nonce": "runtime-random-value",
  "client": "qwen-code"
}
```

Handshake-Response:

```json
{
  "protocolVersion": 1,
  "nonce": "same-runtime-random-value",
  "capabilities": { "prepare": true }
}
```

Prepare-Request:

```json
{
  "protocolVersion": 1,
  "requestId": "runtime-random-value",
  "sessionId": "runtime-owned-session-id",
  "promptId": "runtime-owned-prompt-id",
  "toolCallId": "runtime-accepted-tool-call-correlation-id",
  "toolName": "canonical_tool_name",
  "arguments": { "final": "tool arguments" }
}
```

Allow-Response:

```json
{
  "protocolVersion": 1,
  "requestId": "same-runtime-random-value",
  "allowed": true
}
```

Deny-Response:

```json
{
  "protocolVersion": 1,
  "requestId": "same-runtime-random-value",
  "allowed": false,
  "reason": "Safe user-visible policy reason"
}
```

Unbekannte Felder, falsche Versionen/Nonces/Request-Ids, ungültige Booleans,
übergroße Bodys und unsichere Ablehnungsgründe sind Protokollfehler und damit
eine Ablehnung.

## Quell-Implementierungs-Map

| Anliegen                                                                       | Implementierungspunkt                                                             |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| CLI-Flags, Token-Erfassung und Non-Serve-Bootstrap-Scrubbing                   | `packages/cli/src/commands/serve.ts`, `packages/cli/src/cli.ts`                  |
| Öffentliche eingebettete Optionen                                              | `packages/cli/src/serve/types.ts`                                                 |
| Konfigurationsvalidierung, Loopback-HTTP-Client, Handshake, Response-Parsing   | `packages/cli/src/serve/external-tool-guard-provider.ts`                          |
| Provider-Konstruktion, Boot-Handshake, Capability- und Bridge-Verdrahtung      | `packages/cli/src/serve/run-qwen-serve.ts`                                        |
| Gemeinsame private Ext-Method- und Handler-Typen                               | `packages/acp-bridge/src/status.ts`, `bridgeOptions.ts`                           |
| Owned-Session- / Active-Prompt-Validierung                                     | `packages/acp-bridge/src/bridgeClient.ts`                                         |
| Bridge-Injektion                                                               | `packages/acp-bridge/src/bridge.ts`                                               |
| Erfassung des privaten Required-Markers, Token-Scrubbing und Relaunch-Erhalt   | `packages/cli/src/gemini.tsx`                                                     |
| Pro-Session-Config-Injektion und Kind-Callback                                 | `packages/cli/src/acp-integration/acpAgent.ts`, `packages/cli/src/config/config.ts` |
| Erforderliche Kind-Bestätigung und Parent-seitige Zulassung                    | `packages/cli/src/acp-integration/acpAgent.ts`, `packages/acp-bridge/src/bridge.ts` |
| Runtime-Kontext an der Executor-Grenze                                         | `packages/core/src/core/tool-invocation-guard.ts` und die drei PR-#8032-Aufrufstellen |
| Bedingte Feature-Bewerbung                                                     | `packages/cli/src/serve/capabilities.ts`                                          |

## Kompatibilität und Fehlerverhalten

| Deployment                                              | Erwartetes Verhalten                                              |
| ------------------------------------------------------- | ----------------------------------------------------------------- |
| `qwen` interaktiv/headless                              | Bestehendes Ausführungsverhalten unverändert, wenn neue Inputs fehlen |
| `qwen --acp` gestartet von einer IDE                    | Kein Provider; privater Marker fehlt                              |
| `qwen serve` ohne neue Flags                            | Kein Provider, keine Capability, aktuelles Preheat-/Retry-Verhalten |
| `qwen serve`, Endpoint/Token vorhanden, Mode weggelassen/off | Kein Provider/keine Capability; reservierter Token wird von Kindern gescrubbt |
| `qwen serve`, required, gültiger Provider               | Capability beworben; jedes unterstützte Top-Level-Tool wird geguardet |
| `qwen serve`, required, ungültige Konfiguration/Handshake | Listener startet nicht                                           |
| Required, Kind bestätigt den installierten Guard nicht  | ACP-Channel wird vor der Session-Erstellung abgelehnt             |
| Required-Provider schlägt während eines Turns fehl      | Aufruf wird abgelehnt; Executor-Zähler bleibt null                |
| Required, nicht unterstützter Nested-/Hidden-AgentCore-Einstieg | Lokal abgelehnt, bevor die Nested-Ausführung startet       |
| Required, MCP-Response geht verloren/Verbindung schließt | Erster Versuch schlägt fehl; kein automatischer Reconnect oder Replay |

Die Capability ist `external_tool_guard` und wird nur beworben, wenn der
Required-Mode seinen Startup-Handshake abgeschlossen hat.

## Verifizierungsplan

Unit- und Vertragstests müssen beweisen:

1. strikte Endpoint-/Konfigurationsvalidierung;
2. authentifizierter Handshake, Nonce-/Versions-/Schema-Validierung und
   Body-Limits;
3. Allow, explizites Deny, Timeout, Abbruch, Verbindungsfehler und fehlerhafte
   Response, ohne Retry;
4. BridgeClient lehnt unbekannte Session und veraltete Prompt-Identität ab,
   bevor der Provider angerufen wird;
5. Default-off erzeugt keinen Provider und bewirbt keine Capability;
6. der Token gelangt nie in die effektive Umgebung des ACP-Kinds;
7. der Required-Marker überlebt den bestehenden Relaunch-Pfad, wird aber
   gelöscht, bevor Tools die ACP-Prozessumgebung erben können;
8. der Required-Mode injiziert den Callback in jede Live-ACP-Session-Config;
9. jeder Required-ACP-Channel muss den installierten Callback vor der
   Session-Erstellung bestätigen;
10. verwaltetes ACP startet keine Suggestion-Speculation, und ein separat
    aufgerufener Spekulationspfad erfordert weiterhin den Callback vor dem
    Apply;
11. delegierende/nested `agent`, `workflow`, `create_sub_session`,
    `send_message`, direktes `/fork` und agentenbasierte
    Workspace-Memory-Steuerungen werden abgelehnt, während
    automatische/Hintergrund-Turns ohne den aktiven Prompt-Kontext
    fail-closed fehlschlagen;
12. ein geguardeter MCP-Verbindungsfehler führt einen Aufruf aus und keinen
    Reconnect/Replay;
13. ein verwalteter ACP-End-to-End-Fall matcht
    `sessionId/promptId/toolCallId` des Providers auf bestehende
    Start-/Terminal-Events und beweist, dass der Executor-Zähler bei Allow
    eins und bei Deny/Fehler null ist.

Fokussierte Paket-Tests, Repository-Build/Typecheck/Lint und die
Daemon-E2E-Suite ausführen. Der PR-Report dokumentiert Befehle und exakte
Ergebnisse.

## Non-Goals und Follow-ups

- Unix-Domain-Socket-Transport; v1 nutzt einen Origin-only-Loopback-HTTP(S)-
  Endpoint.
- Provider-seitiger Entscheidungs-Replay oder idempotente Wiedereinreichung;
  Qwen Code sendet keine Retries.
- Nested-/delegierte Ausführungs-Herkunft (`agent`, `workflow`,
  `create_sub_session`, `send_message`, `/fork`), agentenbasierte
  Workspace-Memory-Steuerungen und ein zukünftiges Attempt-aware-
  Guard-Protokoll. V1 lehnt diese Nested-/Hidden-Agent-Einstiegspunkte ab,
  statt eine nicht unterstützte Korrelation zu behaupten.
- Ergebnismeldung oder Audit-Speicherung in Qwen Code. Der Provider und
  DataAgent besitzen ihre Audit-Datensätze; Qwen Code liefert stabile
  Korrelationsschlüssel und bestehende Lifecycle-Events.
- Fortlaufende Autorisierung oder ein neuer Terminal-Ergebnis-Vertrag für
  einen Hintergrund-Shell-/Monitor-Prozess nach dessen geguardetem Start.
  Provider dürfen diese Aufrufe anhand ihres finalen Tool-Namens und ihrer
  Argumente ablehnen.
- Eine Business-Task-API, Plan-Genehmigung, Grants oder DataAgent-spezifische
  Policy.
- Autorisierung oder Sandboxing von Hook-Implementierungen. `PreToolUse` läuft
  vor diesem Executor-Guard gemäß dem PR-#8032-Vertrag.
- Autorisierung von Slash-Befehl-Aktionen. Sie laufen vor dem Tool-Scheduler;
  verwaltete Hosts, die eine All-Effects-Grenze brauchen, müssen
  Slash-Befehl-Input ablehnen oder eine strikte Deployment-Denylist außerhalb
  dieses Features pflegen.
- Semantische Inspektion oder Sandboxing einer erlaubten Tool-Implementierung
  oder eines Shell-Befehls. Der Provider entscheidet über den kanonischen
  Namen und die finalen Argumente; ein verwaltetes Deployment muss diese
  Entscheidung mit seiner bestehenden Tool-Policy und Isolationsgrenze
  kombinieren.
- Autorisierung für explizite Daemon-REST-/ACP-Steueroperationen; diese bleiben
  durch die bestehende Authentifizierung und die API-Verträge des Daemons
  geregelt.
