# REST-API-Integrationsleitfaden

Für Teams, die Qwen Code über HTTP in ihr eigenes Produkt einbinden: `qwen serve`
als Backend ausführen und vom eigenen Frontend aus ansteuern.

Diese Seite ist der Einstiegspunkt. Die kuratierte
[Daemon-REST-API-Referenz](./daemon-rest-api-reference.md) deckt die stabile
Integrationsfläche ab und verlinkt auf den OpenAPI-3.1-Kontrakt. Das vollständige Protokoll steht in
[`qwen-serve-protocol.md`](./qwen-serve-protocol.md); die Interna im
[Daemon-Deep-Dive](./daemon/00-index.md); ein ausführbarer TypeScript-Walkthrough ist
[`examples/daemon-client-quickstart.md`](./examples/daemon-client-quickstart.md).

## Welche Pfade es gibt

Sechs Wege, auf dem Daemon aufzubauen, getrennt durch eine Frage — **wie viel des
Frontends gehört euch?**

| Pfad                                 | Ihr besitzt                           | Status                                                                                                                                                                                                                         |
| ------------------------------------ | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Daemon + mitgelieferte WebShell           | nichts — Nutzung wie ausgeliefert       | verfügbar heute ([Benutzerhandbuch](../users/qwen-serve.md))                                                                                                                                                                             |
| Daemon `--no-web` + eigene UI      | das gesamte Frontend              | verfügbar heute — **diese Seite**                                                                                                                                                                                                    |
| Daemon + gebrandete WebShell           | Branding, kein Code                | nicht gebaut ([#11357](https://github.com/QwenLM/qwen-code/issues/11357))                                                                                                                                                         |
| Daemon + selbst gehosteter WebShell-Build | den Frontend-Build               | nicht gebaut ([#11358](https://github.com/QwenLM/qwen-code/issues/11358))                                                                                                                                                         |
| Daemon über SDK `DaemonClient`        | Client-Code, niemals rohes HTTP       | verfügbar heute ([TS](./sdk-typescript.md), [Java](./sdk-java.md)) — das [Python SDK](./sdk-python.md) unterstützt nur Prozess-Transport und hat keinen Daemon-Client; eine Python-Integration nutzt Pfad 2 über rohes HTTP                     |
| Daemon über MCP-Bridge                | nichts — ein anderer Agent steuert ihn | verfügbar als `qwen-serve-mcp` in ` @qwen-code/sdk` — siehe die [Bridge-README](https://github.com/QwenLM/qwen-code/blob/main/packages/sdk-typescript/src/daemon-mcp/serve-bridge/README.md); `QWEN_BRIDGE_ALLOW_GLOBAL_SCOPE` erlaubt optional globale Schreibmutationen |

Headless `qwen -p` und ACP über stdio für Editoren sind separate Integrations-
pfade. Channels und Extensions können ebenfalls über den Daemon laufen; siehe den
[Channel-Leitfaden](../users/features/channels/overview.md) und die
[Extension-Referenz](./qwen-serve-protocol.md#extension-management-v2-wire-contract).

## Zwei Dinge, die man vor dem Design wissen muss

**Der Daemon führt keine Inferenz im eigenen Prozess aus.** Er startet `qwen --acp`-Kindprozesse
und vermittelt zwischen ihnen und HTTP. Er führt das CLI-Entry-Skript unter
demselben Node-Binary aus, wobei `QWEN_CLI_ENTRY` oder andernfalls `process.argv[1]` verwendet wird.
Ein einbettendes Node-Backend muss `QWEN_CLI_ENTRY` auf das installierte Qwen-CLI-
Entry-Skript verweisen; es gibt keine `qwen`-Suche über `PATH`. Ein fehlender Einstiegspunkt
zeigt sich als `MissingCliEntryError`.

Im Gleichgewichtszustand gibt es **einen Kindprozess pro aktivem Workspace-Runtime**, nicht einen pro
Session. Jede Session in einem Workspace multiplext auf diesen Kindprozess und teilt sich seinen
Prozess, den OAuth-Status, den Datei-Cache und den Hierarchie-Speicher-Parse. Die Fehlerdomäne
ist also der Workspace: Wenn der Kindprozess endet, wird jede darauf multiplexte Session
gemeinsam abgebaut. Dimensioniere den Container für den Daemon plus einen Kindprozess pro
registriertem Workspace, mit Reserve für einen zusätzlichen Kindprozess pro Runtime während eines Channel-Swaps.
Wenn Sessions unabhängig fehlschlagen müssen, betreibe separate Daemons —
`--max-sessions` begrenzt die Parallelität, nicht den Auswirkungsradius.

**Authentifizierung ist Single-Operator.** Das Runtime-Bearer-Token gewährt Zugriff auf
die gesamte Bearer-geschützte API, und ein vertrauenswürdiger Loopback-Caller hat volle Autorität,
einschließlich Code-Ausführung als der Daemon-Benutzer. Es gibt kein Principal-Modell pro Endbenutzer.
Wenn du dies
hinter einem Multi-User-Produkt betreibst, verwaltet dein Backend die Benutzeridentität und darf
das Daemon-Token nicht an Browser weitergeben. Containerisierte und Multi-Tenant-Deployment
sind ausdrücklich zurückgestellt — siehe „v0.16-alpha known limits" im
[Benutzerhandbuch](../users/qwen-serve.md).

Konfigurierter Channel-Webhook-Eingang (`POST /channels/:channelName/webhooks/:source`)
verwendet eine eigene `x-qwen-webhook-secret`-Authentifizierung vor der Bearer-
Authentifizierung; er ist inaktiv, bis eine Channel-Webhook-Quelle konfiguriert ist.

## Den Daemon starten

Generiere das Token einmal in Terminal 1. Das Shell-Builtin gibt es aus, damit du
denselben Wert in das versteckte Prompt einfügen kannst, das unten in jedem anderen Terminal angezeigt wird:

```bash
export QWEN_SERVER_TOKEN="$(openssl rand -hex 32)"
printf 'Copy this token to the other terminals: %s\n' "$QWEN_SERVER_TOKEN"
export DAEMON_URL=http://127.0.0.1:4170
```

Terminal 1 — dieser Befehl blockiert, also lass ihn laufen:

```bash
qwen serve --no-web --require-auth \
  --hostname 0.0.0.0 --port 4170 \
  --workspace /srv/project
```

In jedem anderen Terminal füge das von Terminal 1 ausgegebene Token ein, wenn `read`
danach fragt. Das hält das Token aus der Shell-History und Kindprozess-Argumenten
heraus:

```bash
read -rsp 'QWEN_SERVER_TOKEN: ' QWEN_SERVER_TOKEN; printf '\n'
export QWEN_SERVER_TOKEN
export DAEMON_URL=http://127.0.0.1:4170
```

`DAEMON_URL` ist die Loopback-Basis-URL, die jeder Client-Befehl unten verwendet —
exportiere sie in jedem Terminal, in dem du sie ausführst, mit demselben Wert — und
sie entspricht `servers[0].url` im [OpenAPI-Artefakt](./daemon-rest-api-reference.md).
Der Daemon bindet weiterhin `0.0.0.0`, damit ein entfernter Host ihn erreichen kann,
aber verweise nicht im Klartext mit `DAEMON_URL` auf diesen Host: Ein Bearer-Token,
das eine Shell steuern kann, ist von jedem auf dem Pfad lesbar. Erreiche einen
Nicht-Loopback-Host über TLS (siehe unten).

`--no-web` erhält die unten aufgeführten Routen, deaktiviert aber die WebShell-Assets und
abhängige Oberflächen: unter macOS die `/live/*`-Routen und den `/live/host`-Socket, und auf
jeder Plattform `GET /mcp-app-sandbox`. Übergib das Token über die Umgebungsvariable statt über
`--token`, das von jedem lokalen Benutzer über `/proc/<pid>/cmdline` lesbar ist.

Die Bash-Beispiele unten übergeben den Authorization-Header über einen Datei-Deskriptor
mittels des Shell-`printf`-Builtins, wodurch das Token aus den curl-Argumenten herausgehalten wird.
Sie erfordern Bash, curl und jq. Für geräteübergreifenden Zugriff terminiere TLS wie
in [HTTPS / TLS for mobile and cross-device access](../users/qwen-serve.md#https--tls-for-mobile--cross-device-access)
beschrieben; der Daemon serviert dann `https://` auf demselben Port, also re-exportiere
`DAEMON_URL` mit dem `https://`-Schema, bevor du die folgenden Befehle ausführst.

## Die Routen, die eine Integration tatsächlich nutzt

Das meiste, was der Daemon registriert, dient dem Betrieb der WebShell — Git-
Operationen, Extension-Installation, Workspace-Vertrauen, Voice, geplante Aufgaben — und
ändert sich mit dieser UI. Die untenstehende Teilmenge ist eine Größenordnung kleiner.

Das sind die Routen, die eine REST-Integration benötigt. Den Rest als intern betrachten.

### Discovery

| Route                                                            | Zweck                                                                      |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| [`GET /health`](./qwen-serve-protocol.md#get-health)             | Liveness-Probe                                                               |
| [`GET /capabilities`](./qwen-serve-protocol.md#get-capabilities) | Preflight — `workspaceCwd` und `policy.permission` vor allem anderem lesen |

### Session-Lifecycle

| Route                                                                                                                                | Zweck                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| [`POST /session`](./qwen-serve-protocol.md#post-session)                                                                             | Erstellen. `sessionScope: "thread"` für eine unabhängige Konversation senden |
| [`DELETE /session/:id`](./qwen-serve-protocol.md#delete-sessionid)                                                                   | Schließen. Die persistierte Session überlebt und kann neu geladen werden             |
| [`POST /session/:id/load`](./qwen-serve-protocol.md#post-sessionidload) · [`POST /session/:id/resume`](./qwen-serve-protocol.md#post-sessionidresume) | Eine persistierte Session wiederherstellen                                           |
| [`POST /session/:id/heartbeat`](./qwen-serve-protocol.md#post-sessionidheartbeat)                                                    | Den Idle-Reaper aufschieben                                                 |
| [`PATCH /session/:id/metadata`](./qwen-serve-protocol.md#patch-sessionidmetadata)                                                    | Session-Metadaten                                                      |
| [`POST /session/:id/model`](./qwen-serve-protocol.md#post-sessionidmodel)                                                            | Modell innerhalb des gebundenen Service wechseln                                 |
| [`GET /session/:id/status`](./qwen-serve-protocol.md#get-sessionidstatus)                                                                             | Runtime-Status                                                        |

### Prompting und Streaming

| Route                                                                             | Zweck                                                |
| --------------------------------------------------------------------------------- | ------------------------------------------------------ |
| [`POST /session/:id/prompt`](./qwen-serve-protocol.md#post-sessionidprompt)       | Einreichen. Gibt `202` bei **Admission** zurück, nicht bei Abschluss |
| [`POST /session/:id/cancel`](./qwen-serve-protocol.md#post-sessionidcancel)       | Nur den aktiven Prompt abbrechen                          |
| [`GET /session/:id/events`](./qwen-serve-protocol.md#get-sessionidevents-sse)     | SSE-Stream. **Vor** dem Prompting abonnieren             |
| [`GET /session/:id/transcript`](./qwen-serve-protocol.md#get-sessionidtranscript) | Konversationsverlauf                                   |
| [`GET /session/:id/context`](./qwen-serve-protocol.md#get-sessionidcontext)                                                                                             | Top-Level-Modell, -Modus und Konfigurationsoptions-Status; virtuelle Subagenten geben ein leeres `state` zurück |
| [`GET /session/:id/export`](./qwen-serve-protocol.md#get-sessionidexport) · [`GET /session/:id/pending-prompts`](./qwen-serve-protocol.md#get-sessionidpending-prompts) | Das persistierte Transkript exportieren · wartende Prompten auflisten                                     |

Token-Usage ist nicht Teil dieser Oberfläche: Für eine Top-Level-Session
gibt `GET /session/:id/context` das aktive Modell, den Modus und den
Konfigurationsoptions-Status zurück. Eine virtuelle Session-ID mit `subagent.`-Präfix
löst sich gegen ihre Parent-Runtime auf und gibt ein leeres `state`-Objekt zurück.
Usage-Counter stehen auf `GET /session/:id/context-usage`, einer Route, die dieser
Kontrakt nicht spezifiziert — sie trägt den `session_context_usage`-Capability-Tag
und ist nur in den internen [Session-Lifecycle-Notizen](./daemon/08-session-lifecycle.md#context-usage-session_context_usage-capability-tag) beschrieben.

### Berechtigungen

| Route                                                                              | Zweck                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`POST /session/:id/permission/:requestId`](./qwen-serve-protocol.md#post-sessionidpermissionrequestid) | Eine `permission_request` beantworten. Wird an die Runtime geleitet, der die Session gehört, und fällt niemals auf die primäre Bridge zurück; ein nicht vertrauenswürdiger Nicht-Primär-Owner wird abgelehnt, während ein nicht vertrauenswürdiger Primär-Owner mit der aktiven Permission-Policy fortfährt                                                |
| [`POST /permission/:requestId`](./qwen-serve-protocol.md#post-permissionrequestid) | Prozessglobales Formular, nur mit der Bridge des **primären** Workspaces verbunden: gibt `404` für eine Session, die einer anderen registrierten Runtime gehört, mit demselben Body wie eine verlorene Stimme unter der Standard-`first-responder`-Policy — eine `404` hier bedeutet also nicht unbedingt, dass die Anfrage bereits beantwortet wurde |

### Nur-lesender Workspace-Kontext

| Route                                                                                                      | Zweck                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`GET /file`](./qwen-serve-protocol.md#get-file) · [`GET /file/bytes`](./qwen-serve-protocol.md#get-filebytes) | Eine Datei oder einen Byte-Bereich lesen                                                                                                                                     |
| [`GET /stat`](./qwen-serve-protocol.md#get-stat) · [`GET /list`](./qwen-serve-protocol.md#get-list) · [`GET /glob`](./qwen-serve-protocol.md#get-glob) | Pfad-Metadaten, Verzeichnis-Listing, Glob                                                                                              |
| [`GET /workspace/tools`](./qwen-serve-protocol.md#get-workspacetools)                                                                                  | Vom aktiven ACP-Kindprozess gemeldete Tools; ohne einen hat die Response `acpChannelLive: false`, `tools: []` und einen `not_started`-Fehler |

## Minimaler Ablauf

**1. Preflight.** `workspaceCwd` lesen (damit `cwd` beim Erstellen weggelassen werden kann) und
`policy.permission` lesen (damit bekannt ist, wer Permission-Anfragen beantworten darf).

```bash
curl -sH @<(printf 'Authorization: Bearer %s\n' "$QWEN_SERVER_TOKEN") "$DAEMON_URL/capabilities"
```

**2. Session erstellen.** `sessionScope: "thread"` verwenden, es sei denn, Caller sollen
sich eine Konversation teilen — das Standard-`"single"` lässt ein zweites
Create im selben Workspace die bestehende Session _wiederverwenden_ und serialisiert unabhängige
Caller durch eine einzige Warteschlange.

```bash
SESSION_JSON="$(curl -sX POST "$DAEMON_URL/session" \
  -H @<(printf 'Authorization: Bearer %s\n' "$QWEN_SERVER_TOKEN") -H 'Content-Type: application/json' \
  -d '{"sessionScope":"thread"}')" || echo "create failed (curl exit $?)" >&2
printf '%s\n' "$SESSION_JSON"
SID="$(printf '%s' "$SESSION_JSON" | jq -er '.sessionId // empty')"
export SID
: "${SID:?no sessionId in the create response}"
# → {"sessionId":"…","workspaceCwd":"/srv/project","attached":false}
```

**3. Vor dem Prompting abonnieren.** Führe dies in einem zweiten Terminal mit demselben
`QWEN_SERVER_TOKEN` und `DAEMON_URL` aus, wobei `SID` auf die `sessionId` gesetzt ist,
die Schritt 2 ausgegeben hat: Exports wechseln nicht zwischen Terminals, also re-exportiere
das Token und `DAEMON_URL` dort und setze `SID` selbst auf diese `sessionId`. Füge den
Block nicht zurück in Terminal 1 ein — seine `SID=`-Zuweisung würde den Wert überschreiben,
den Schritte 4-6 verwenden. `Last-Event-ID: 0` replayt vom ältesten
zurückgehaltenen Event, wodurch Events erfasst werden, die zwischen Create und
Subscribe gefeuert wurden — insbesondere `model_switch_failed`. Bei einem **Attach**
(das Standard-`sessionScope: "single"` wiederverwendet eine bestehende Session) ist dieses Event das einzige
Signal, dass eine fehlerhafte `modelServiceId` abgelehnt wurde, da der Fehler
absichtlich nicht als HTTP-Fehler weitergegeben wird. Bei einem **frischen Create** mit
`modelServiceId` — was der Body in Schritt 2 nicht enthält — enthält der `200`-Body auch
`modelApplied`, `false` wenn der Wechsel abgelehnt wurde, und das ist das
deterministische Signal, auf das gehandelt werden sollte, statt auf ein Event auf einem begrenzten Ring. Ein Create
ohne `modelServiceId` hat überhaupt keinen `modelApplied`-Schlüssel.

```bash
# terminal 2 — re-exportiere was du brauchst; Shell-Variablen wechseln nicht zwischen Terminals
# export QWEN_SERVER_TOKEN='<das Token aus Schritt 1>'
# export DAEMON_URL=http://127.0.0.1:4170
SID='<sessionId aus Schritt 2>'
curl -N "$DAEMON_URL/session/$SID/events" \
  -H @<(printf 'Authorization: Bearer %s\n' "$QWEN_SERVER_TOKEN") \
  -H 'Accept: text/event-stream' -H 'Last-Event-ID: 0'
```

Jede `data:`-Zeile ist eine vollständige Envelope in einer Zeile; der `type` der Envelope entspricht
der `event:`-Zeile.

Replay ist durch `--event-ring-size` und ein festes 8-MiB-Byte-Budget pro Subscription begrenzt.
Wenn der Stream `state_resync_required` mit
`reason: "replay_budget_exceeded"` ausgibt, über `POST /session/:id/load` wiederherstellen,
statt das Replay als vollständig zu behandeln.

**4. Prompten.** `202` bedeutet admitted, nicht abgeschlossen. `turn_complete` /
`turn_error` auf dem Stream per `promptId` korrelieren. `stopReason` bei `turn_complete` lesen;
bei `turn_error` `message` und optionale `code` / `errorKind` lesen — siehe
[`POST /session/:id/prompt`](./qwen-serve-protocol.md#post-sessionidprompt).

```bash
curl -sX POST "$DAEMON_URL/session/$SID/prompt" \
  -H @<(printf 'Authorization: Bearer %s\n' "$QWEN_SERVER_TOKEN") -H 'Content-Type: application/json' \
  -d '{"prompt":[{"type":"text","text":"What does src/main.ts do?"}]}'
# → 202 {"promptId":"…","lastEventId":42}
```

**5. Permission-Anfragen beantworten.** Wenn der Agent ein Tool ausführen will _und sein
Genehmigungsmodus eine Bestätigung verlangt_, gibt er `permission_request` aus und der Turn
blockiert, bis jemand antwortet oder du abbrichst — **standardmäßig gibt es kein Timeout**
(`--permission-response-timeout-ms` ist standardmäßig `0` = unbegrenzt warten), also hält
eine unbeantwortete Anfrage einen Slot in der Prompt-Warteschlange der Session, bis du
abbrichst oder die Session schließt. Eigene Deadline setzen, wenn der Ablauf eine benötigt.

Der Modus ist die eigene Qwen-Einstellung `tools.approvalMode` des Kindprozesses, aufgelöst aus
den Einstellungen des Daemon-Hosts und des `--workspace`-Verzeichnisses; der Daemon pinnt
nichts beim Spawn. Der Standard ist `auto`, der eine Klasse von Tool-Aufrufen
genehmigt, ohne zu fragen — diese veröffentlichen überhaupt keine `permission_request` — und für
den Rest weiterhin nachfragt. Ein nicht vertrauenswürdiges Workspace-Verzeichnis wird auf `default` (fragen) herabgestuft,
was erklärt, warum eine Deployment-Instanz diese Events sieht und eine andere nicht, und
`GET /capabilities` meldet die Vote-Mediation-Policy statt des Genehmigungs-
modus, also sagt der Preflight nicht, welche Haltung aktiv ist. Wenn deine
Integration vom Approval-Gating abhängt, pinne `tools.approvalMode` explizit und
entscheide vorab, wie er antwortet: Auto-Approval kann bereits aktiv sein, ohne
dass jemand es gewählt hat.

Antworte auf der Session-scoped Route: Sie erreicht den owning Workspace, wann immer
genau eine aktive Runtime die Session besitzt, und fällt niemals auf die primäre
Bridge zurück. Ein nicht vertrauenswürdiger Nicht-Primär-Owner gibt `403 untrusted_workspace` zurück;
die primäre Runtime ist von diesem Trust-Check ausgenommen, ein nicht vertrauenswürdiger Primär-Owner
kann also die Stimme akzeptieren. Ein nicht aufgelöster Owner geht fail-closed statt auf
der falschen Runtime abzustimmen — `404 session_not_found`, `500 ambiguous_session_owner` oder
`503 workspace_runtime_unavailable` mit `Retry-After: 1` (retry; die Stimme wurde
nicht aufgezeichnet). Kopiere `data.requestId` aus dem `permission_request`-Event und
setze sie vor der Abstimmung:

```bash
export REQUEST_ID='<data.requestId>'
curl -sX POST "$DAEMON_URL/session/$SID/permission/$REQUEST_ID" \
  -H @<(printf 'Authorization: Bearer %s\n' "$QWEN_SERVER_TOKEN") -H 'Content-Type: application/json' \
  -d '{"outcome":{"outcome":"selected","optionId":"proceed_once"}}'
```

**6. Schließen.** `DELETE /session/$SID` → `204`. Die Session auf der Festplatte wird aufbewahrt.

## Betrieb

| Belang          | Wo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Parallelitäts-Grenzen | `--max-sessions`, `--max-total-sessions`; Create über dem Limit geben `503` mit `Retry-After` zurück                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Rate Limiting    | `--rate-limit` plus die klassenspezifischen `--rate-limit-*`-Flags                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Idle-Bereinigung     | `--session-idle-timeout-ms`; mit `POST /session/:id/heartbeat` am Leben halten                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Speicher           | `--child-heap-mode` ist nur beobachtend. `--memory-budget-mb` steuert den adaptiven Live-Journal-Wachstumspool für `POST /session/:id/load`, nicht das SSE-Replay; das Festlegen von entweder `--max-journal-bytes` oder `--max-journal-events` deaktiviert das Wachstum. Keines der Flags dimensioniert Kindprozesse oder verweigert Spawns, noch regelt es deren tatsächliches Heap-Limit (`--max-old-space-size`, abgeleitet vom Host-Speicher). Siehe [Konfiguration](./daemon/17-configuration.md) für die Budget-Berechnung. SSE-Replay ist separat durch `--event-ring-size` und ein festes 8-MiB-Budget pro Subscription begrenzt; ein fehlendes Ende erzeugt `state_resync_required` mit `reason: "replay_budget_exceeded"` |
| Prompt-Deadlines | `--prompt-deadline-ms`; Ablauf erzeugt `turn_error`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Fehler           | [Fehler-Taxonomie](./daemon/18-error-taxonomy.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Observability    | [Observability](./daemon/19-observability.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Vollständige Flag-Liste   | [Konfiguration](./daemon/17-configuration.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
