# Daemon-Modus (`qwen serve`)

Führe Qwen Code als lokalen HTTP-Daemon aus, damit mehrere Clients (IDE-Plugins, Web-UIs, CI-Skripte, benutzerdefinierte CLIs) eine einzige Agent-Sitzung über HTTP + Server-Sent Events teilen können, anstatt dass jeder Client seinen eigenen Subprozess startet.

> **🚧 v0.16-alpha**: `qwen serve` wird in v0.16-alpha erstmals auf npm als **reiner Text-Chat / Coding** mit **lokalem Deployment** veröffentlicht. Bild-/Dateianhänge im Prompt-Pfad, containerisiertes Deployment (Docker / k8s / nginx Reverse-Proxy) sowie Remote-/Multi-Daemon-Härtung folgen in einem späteren Patch, sobald ein Enterprise-Pilot fest zugesagt ist. Die vollständige Liste der zurückgestellten Features findest du unter [v0.16-alpha known limits](#v016-alpha-known-limits).

> **Status:** Stage 1 (experimentell). Die Protokoll-Oberfläche ist in der §04-Routen-Tabelle aus Issue [#3803](https://github.com/QwenLM/qwen-code/issues/3803) festgeschrieben. Stage 1.5 (`qwen --serve` Flag — TUI hostet denselben HTTP-Server) und Stage 2 (In-Process-Refactoring + `mDNS`/OpenAPI/WebSocket/Prometheus-Polish) sind die unmittelbaren nächsten Schritte.
>
> **Scope-Transparenz:** Stage 1 ist auf **Entwickler ausgelegt, die Clients gegen die Protokoll-Oberfläche prototypen**, sowie auf **lokale Single-User- / Small-Team-Kollaboration**. Produktionsreife Multi-Client- / Langzeit- / Netzwerk-instabile Workloads (Mobile Companions, IM-Bots mit 1000+ Chats) benötigen die Garantien von Stage 1.5+, die in diesem Release noch nicht enthalten sind. Siehe [Stage 1.5+ runtime guarantees](#stage-15-runtime-guarantees) für die vollständige Liste der Lücken und #3803 für die Convergence-Roadmap.

## Was es dir bietet

- **Integrierte Web-Shell-UI** — `qwen serve` stellt die browserbasierte Web-Shell standardmäßig unter seiner Root-URL (`http://127.0.0.1:4170/`) bereit; starte `qwen serve --open`, um sie automatisch im Browser zu öffnen. Sie wird auf derselben Origin wie die API ausgeliefert, sodass kein zweiter Port oder Reverse-Proxy benötigt wird. Übergib `--no-web` für einen reinen API-Daemon.
- **Ein Agent-Prozess, viele Clients** — unter dem Standard-`sessionScope: 'single'` teilt sich jeder Client, der sich mit dem Daemon verbindet, eine einzige ACP-Sitzung. Live-Cross-Client-Kollaboration an derselben Konversation, denselben Datei-Diffs und denselben Permission-Prompts.
- **Reconnect-sicheres Streaming** — SSE mit `Last-Event-ID` Reconnect ermöglicht es einem Client, die Verbindung zu trennen und exakt dort wieder aufzunehmen, wo er aufgehört hat (innerhalb des Replay-Fensters des Rings).
- **First-Responder-Permissions** — wenn der Agent die Erlaubnis anfordert, ein Tool auszuführen, sieht jeder verbundene Client die Anfrage; der Client, der zuerst antwortet, erhält den Zuschlag.
- **Ein Daemon, ein Workspace** — jeder `qwen serve`-Prozess bindet sich beim Start an genau einen Workspace (gemäß [#3803](https://github.com/QwenLM/qwen-code/issues/3803) §02). Multi-Workspace-Deployments starten einen Daemon pro Workspace auf separaten Ports (oder hinter einem Orchestrator).
- **Experimentelle, daemon-verwaltete Channels** — `qwen serve --channel <name>` startet einen Channel-Worker, der vom Daemon-Lifecycle gesteuert wird. Der Worker ist ein separater Prozess, verbindet sich über das SDK zurück mit dem Daemon und meldet seinen Status in `GET /daemon/status`.
- **Remote-Runtime-Steuerung** ([#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 17) — ändere den Approval-Modus einer Sitzung (`POST /session/:id/approval-mode`), schalte ein Tool pro Workspace um (`POST /workspace/tools/:name/enable`), erstelle eine leere `QWEN.md` (`POST /workspace/init`, nur mechanisch — ruft NICHT das Modell auf; für KI-Befüllung folge mit `POST /session/:id/prompt`), starte einen einzelnen MCP-Server mit einer Budget-Vorabprüfung neu (`POST /workspace/mcp/:server/restart`) oder füge MCP-Server zur Laufzeit hinzu/entferne sie ohne Daemon-Neustart (`POST /workspace/mcp/servers`, `DELETE /workspace/mcp/servers/:name`). Alles streng limitiert — konfiguriere zuerst `--token`.
- **Session-Recap** ([#4175](https://github.com/QwenLM/qwen-code/issues/4175) Follow-up) — rufe eine einzeilige "Wo habe ich aufgehört"-Zusammenfassung einer aktiven Sitzung ab (`POST /session/:id/recap`). Wrapper für `generateSessionRecap` aus dem Core als Side-Query gegen das schnelle Modell; verunreinigt weder den Haupt-Chat-Verlauf noch den SSE-Stream. Non-strict Gate (gleiche Haltung wie `/prompt`); SDK-Helper `client.recapSession(sessionId)`.
  - **Bekannte Einschränkung — Token-Kosten-Verstärkung:** Die Route ist ein reiner Kosten-Endpunkt (jeder Aufruf ist eine LLM-Side-Query, kein State-Nutzen) und der Daemon hat in v1 kein Rate-Limit pro Route. Auf einem No-Token-Loopback-Default kann ein fehlerhafter oder bösartiger lokaler Client sie spammen, um Token zu verbrennen. Konfiguriere `--token` (und optional `--require-auth`) auf gemeinsamen Dev-Hosts, bevor du den Daemon freigibst.
  - **Sicherheit bei gleichzeitigen Recaps:** Zwei gleichzeitige `/recap`-Aufrufe auf derselben Sitzung führen zwei unabhängige Side-Queries aus. `generateSessionRecap` liest einen Snapshot des Chat-Verlaufs über `GeminiClient.getChat().getHistory()` und füttert ihn an einen separaten `BaseLlmClient.generateText`-Aufruf (via `runSideQuery`); es hängt nichts an oder mutiert das `GeminiChat` der Sitzung. Kann sicher von mehreren Clients ohne Koordination aufgerufen werden.

## Bekannte Einschränkungen in v0.16-alpha

Die erste npm-Veröffentlichung von `qwen serve` (v0.16-alpha) ist absichtlich eng gefasst — reiner Text-Chat / Coding für Entwickler, die den Daemon auf ihrem eigenen Rechner ausführen. Die folgende Liste macht die zurückgestellte Oberfläche explizit, damit Adopters darum herum planen können; alles hier steht auf der v0.16.x-Patch-Roadmap oder einem kurzfristigen Follow-up-Release.

**Produkt-Oberfläche — nur Text:**

- ✅ Text-Prompts und Text-Antworten (Chat, Coding, Tool-Calls, MCP-Integration)
- ❌ **Bild-/Dateianhänge im Prompt-Pfad** — `MessageEmitter` rendert derzeit nur Text; multimodales Echo kommt, wenn ein Alpha-Ziel mit Bildbedarf fest zugesagt ist (#4175 chiga0 #27 P0 item)
- ❌ **Streaming-Uploads** — gleiche Abhängigkeit wie bei Multimodal

**Deployment-Oberfläche — nur lokal:**

- ✅ Loopback (`127.0.0.1`, Standard) — keine Auth erforderlich, geeignet für Dev-Workstations
- ✅ Lokaler Start via `systemd` / `launchd` / `nohup &` / `tmux` — siehe [Local launch templates](./qwen-serve-deploy-local.md)
- ✅ Bring-Your-Own-Bearer-Token via `QWEN_SERVER_TOKEN` Umgebungsvariable ([Authentication](#authentication) für das Setup)
- ❌ **Containerisiertes Deployment** — Docker / Compose / Kubernetes / nginx Reverse-Proxy mit TLS-Terminierung NICHT in v0.16-alpha. Wird auf v0.16.x verschoben, sobald ein Enterprise-Pilot fest zugesagt ist (würde sonst verrotten, weil niemand es validiert).
- ❌ **Multi-Daemon-Koordination auf einem Host** — `1 Daemon = 1 Workspace × N Sitzungen` wird erzwungen. Cross-Host-Föderation, Instance-Path-Token-Keying und Stale-Token-Bereinigung werden auf v0.16.x verschoben.
- ❌ **Automatisch generierte Daemon-Tokens** — Alpha ist BYO-Token (nur ein `openssl rand -hex 32` entfernt). Auto-Gen- + Token-Store-Infrastruktur wird auf v0.16.x verschoben.

**Härtung — minimal überlebensfähig für lokalen Single-User:**

- ✅ Security-Gate beim Boot (lehnt Non-Loopback-Bind ohne Token ab, [PR 15 / #4236](https://github.com/QwenLM/qwen-code/pull/4236))
- ✅ Auth-Gate für Mutations-Routen, sitzungsbezogenes Permission-Routing (Wave 4 PRs)
- ✅ MCP-Guardrails + Multi-Client-Permission-Koordination (F2 / F3)
- ✅ **Prompt Absolute Deadline + SSE-Writer-Idle-Timeout** — Opt-in via `--prompt-deadline-ms` und `--writer-idle-timeout-ms`; wird bei Aktivierung über `prompt_absolute_deadline` und `writer_idle_timeout` bekannt gegeben.
- ✅ **HTTP-Rate-Limiting** — Opt-in via `--rate-limit` und schwellenwertbasierte Limits pro Stufe; wird bei Aktivierung über `rate_limit` bekannt gegeben.
- ⏸️ **Prometheus-Metriken + Load-Test-Harness** — wird auf v0.17 F4 Phase-1 Scale-Instrumentation verschoben, wenn 30-50 aktive Sitzungen ein echtes Ziel werden.
- ⏸️ **`--max-body-size` CLI-Flag** — Daemon erzwingt standardmäßig `express.json({ limit: '10mb' })`, was für reine Text-Prompts bequem ausreicht (Modell-Kontextfenster liegen weit unter 10 MiB an Zeichen). In v0.16.x über Flag anpassbar.

Für die tiefere Aufzählung von "was wir in Stage 1 nicht beheben" (Single-Host-Session-State-Mutationsmodell + N-parallele-Sitzungen, die sich ein ACP-Child teilen), siehe [Stage 1 scope boundaries](#stage-1-scope-boundaries--what-we-wont-fix-in-stage-15) weiter unten.

## Quickstart

### 1. Daemon starten (Loopback, keine Auth)

```bash
cd your-project/
qwen serve
# → qwen serve listening on http://127.0.0.1:4170 (mode=http-bridge, workspace=/path/to/your-project)
# → qwen serve: bearer auth disabled (loopback default). Set QWEN_SERVER_TOKEN to enable.
```

Der Standard-Bind ist `127.0.0.1:4170`. Bearer-Auth ist bei Loopback **ausgeschaltet**, damit die lokale Entwicklung "einfach funktioniert". Der Daemon bindet sich an das aktuelle Arbeitsverzeichnis; verwende `--workspace /path/to/dir`, um dies zu überschreiben.

**Web-Shell-UI öffnen.** Navigiere zu `http://127.0.0.1:4170/` (oder starte den Daemon mit `qwen serve --open`, um sie automatisch zu öffnen) für das vollständige Browser-Terminal — Chat, Diffs, Tool-Calls und Permission-Prompts. Die UI wird am Daemon-Root auf derselben Origin wie die API ausgeliefert. Der Rest dieses Guides verwendet rohes HTTP, damit du direkt gegen die API skripten kannst.

### 2. Sanity-Check

```bash
curl http://127.0.0.1:4170/health
# → {"status":"ok"}

curl http://127.0.0.1:4170/capabilities
# → {"v":1,"mode":"http-bridge","features":["health","daemon_status","capabilities","session_create",...],"workspaceCwd":"/path/to/your-project"}

curl http://127.0.0.1:4170/daemon/status
# → {"v":1,"detail":"summary","status":"ok","runtime":{...}}
```

Das Feld `workspaceCwd` macht den gebundenen Workspace sichtbar, sodass Clients einen Pre-Flight-Check durchführen und `cwd` bei `POST /session` weglassen können.
Das Feld `limits.maxPendingPromptsPerSession` gibt das aktive Prompt-Zulassungslimit pro Sitzung an; `null` bedeutet, dass das Limit deaktiviert ist.

### Channels vom Daemon aus ausführen

```bash
# Start one configured channel under qwen serve
qwen serve --channel telegram

# Start several configured channels under one daemon-owned worker
qwen serve --channel telegram --channel feishu

# Start all configured channels
qwen serve --channel all
```

Dieser Modus ist experimentell und daemon-verwaltet. Er ersetzt nicht den eigenständigen Befehl `qwen channel start`: Standalone-Channels nutzen weiterhin den ACP-gestützten `AcpBridge`-Service. Mit `qwen serve --channel` startet der Daemon einen Channel-Worker-Prozess, nachdem die HTTP-Runtime bereit ist. Wenn der Worker nach dem Start beendet wird, läuft der Daemon weiter und `GET /daemon/status` meldet eine `channel_worker_exited`-Warnung. Der automatische Worker-Neustart ist zurückgestellt.

Der Daemon ist an einen Workspace gebunden, daher muss das `cwd` jedes ausgewählten Channels auf den Daemon-Workspace auflösen. `--channel all` kann nicht mit benannten Channels kombiniert werden.

Der Daemon stellt auch schreibgeschützte Runtime-Snapshots für Client-UIs und Operatoren bereit: `GET /daemon/status`, `GET /workspace/mcp`,
`GET /workspace/skills`, `GET /workspace/providers`, `GET /workspace/env`,
`GET /workspace/preflight`,
`GET /session/:id/status`, `GET /session/:id/context`,
`GET /session/:id/supported-commands`, und `GET /session/:id/tasks`, und `GET /session/:id/lsp`.

`GET /session/:id/status` gibt die Live-Bridge-Zusammenfassung für eine einzelne Sitzung zurück:
`sessionId`, `workspaceCwd`, `createdAt`, optionales `displayName`, `clientCount`,
und `hasActivePrompt`. Es antwortet mit `200` und der Zusammenfassung, wenn der Daemon eine Live-Sitzung mit dieser ID hält, und andernfalls mit `404` (Body `{ "error": …, "sessionId": … }`). Nutze es, um zu pollen, ob eine bekannte Sitzung noch läuft
(`hasActivePrompt`) oder wie viele Clients verbunden sind (`clientCount`), ohne die gesamte paginierte Sitzungsliste abrufen und durchsuchen zu müssen:

```bash
curl http://127.0.0.1:4170/session/$SESSION_ID/status
# → {"sessionId":"…","workspaceCwd":"…","createdAt":"…","clientCount":1,"hasActivePrompt":false}
```

Dies ist die rohe Live-Sitzungsansicht, sodass `clientCount` und `hasActivePrompt` mit dem entsprechenden Eintrag in `GET /workspace/:id/sessions` übereinstimmen — aber die beiden Routen sind nicht byte-identisch. Der Listen-Endpunkt reichert jedes Element mit persistierten Session-Store-Daten an: sein `createdAt` ist die persistierte First-Prompt-Zeit, und es fügt `updatedAt` sowie ein `displayName` hinzu, das vom gespeicherten Titel oder ersten Prompt abgeleitet wird. `/status` hingegen meldet das eigene `createdAt` der Live-Sitzung, lässt `updatedAt` weg und gibt `displayName` nur zurück, wenn eines auf der Live-Sitzung gesetzt ist.

`GET /session/:id/lsp` gibt den strukturierten LSP-Status pro Sitzung zurück. Starte den Daemon mit `--experimental-lsp`, um LSP in erzeugten Agent-Sitzungen zu aktivieren; andernfalls gibt die Route `enabled: false` ohne Server zurück.

`GET /daemon/status` ist das konsolidierte Troubleshooting-Snapshot. Der Standard `detail=summary` liest nur den In-Memory-Daemon-State (Sitzungen, Permissions, SSE/ACP-Transport-Counts, Rate-Limit-Ablehnungen, Prozess-Speicher, aufgelöste Limits) und startet nicht das ACP-Child. Verwende `GET /daemon/status?detail=full` für Diagnose-Daten pro Sitzung, ACP-Verbindungsdetails, Auth-Device-Flow-Counts und Workspace-Status-Abschnitte, wenn du aktiv ein Problem untersuchst.

`GET /workspace/mcp`, `GET /workspace/skills` und `GET /workspace/providers` melden die Live-ACP-Runtime und starten das ACP-Child nicht, wenn es im Leerlauf ist; ein inaktiver Daemon gibt `initialized: false` mit einem leeren Snapshot zurück. Sobald eine Sitzung aktiv ist, wechseln sie zu `initialized: true` und zeigen den tatsächlichen State an.

`GET /workspace/env` und `GET /workspace/preflight` antworten immer mit `initialized: true`, unabhängig vom ACP-State. `env` konsultiert niemals ACP (nur Daemon-Prozess-Infos); `preflight` antwortet mit Daemon-Level-Zellen aus `process.*` und gibt `status: 'not_started'`-Platzhalter für ACP-Level-Zellen aus, wenn das Child im Leerlauf ist.

`GET /workspace/env` meldet die Runtime, Plattform, Sandbox, Proxy und das **Vorhandensein** (niemals den Wert) von gewhitelisteten Secret-Umgebungsvariablen wie `OPENAI_API_KEY` des Daemon-Prozesses. Proxy-URLs werden vor dem Versand um Credentials bereinigt und auf `host:port` reduziert. Die Route antwortet immer direkt aus dem Daemon-Prozess und erzeugt niemals ein ACP-Child.

`GET /workspace/preflight` gibt eine Liste von Readiness-Checks zurück. **Daemon-Level-Zellen** (Node-Version, CLI-Entry, Workspace-Verzeichnis, ripgrep, git, npm) werden immer gerendert. **ACP-Level-Zellen** (Auth, MCP-Discovery, Skills, Providers, Tool-Registry, Egress) erfordern ein aktives ACP-Child — wenn der Daemon im Leerlauf ist, geben sie `status: 'not_started'`-Platzhalter aus, anstatt ACP nur zu ihrer Befüllung zu starten. Fehler werden auf eine geschlossene `errorKind`-Enum abgebildet (`missing_binary`, `auth_env_error`, `init_timeout`, `protocol_error`, `missing_file`, `parse_error`, `blocked_egress`), damit Client-UIs strukturierte Abhilfen rendern können.

Der Daemon stellt auch Workspace-Datei-Helper bereit:

- `GET /file` liest Textdateien und gibt einen Raw-Byte-`sha256:<hex>`-Hash zurück.
- `GET /file/bytes` liest begrenzte Raw-Byte-Fenster und gibt Base64-Content zurück.
- `POST /file/write` erstellt oder ersetzt Textdateien.
- `POST /file/edit` wendet genau eine Textersetzung an.

Write/Edit sind **strikte Mutations-Routen**: Auch bei Loopback erfordern sie einen konfigurierten Bearer-Token, andernfalls geben sie `token_required` zurück. Ersetzungen und Edits erfordern den neuesten `expectedHash` von `GET /file` (oder ein Full-Window `GET /file/bytes`). `create` überschreibt niemals. Explizite Writes auf ignorierte Pfade sind erlaubt, werden aber auditiert. Binary-Writes, Delete/Move/Mkdir und rekursive Parent-Erstellung sind nicht Teil dieser Oberfläche.

### 3. Sitzung öffnen

```bash
curl -X POST http://127.0.0.1:4170/session \
  -H 'Content-Type: application/json' \
  -d '{}'
# → {"sessionId":"<uuid>","workspaceCwd":"…","attached":false}
```

`cwd` kann weggelassen werden — die Route fällt auf den gebundenen Workspace des Daemons zurück. Das Posten eines `cwd`, das nicht mit dem gebundenen Workspace übereinstimmt, gibt `400 workspace_mismatch` zurück (der Daemon ist an genau einen Workspace gebunden; starte einen separaten Daemon für einen anderen).

Ein zweiter Client, der an `/session` postet (beliebiges passendes `cwd` oder keines), erhält `"attached": true` — er teilt sich nun den Agent.

### 4. Event-Stream abonnieren (zuerst in einem anderen Terminal)

```bash
SESSION_ID="<from step 3>"
curl -N http://127.0.0.1:4170/session/$SESSION_ID/events
# → id: 1
#   event: session_update
#   data: {"id":1,"v":1,"type":"session_update","data":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"…"}}}
```

Die `data:`-Zeile ist das **vollständige Event-Envelope** — `{id?, v, type, data, originatorClientId?}` — als JSON-String in einer einzigen Zeile. Die ACP-Payload (der `sessionUpdate`-Block in diesem Beispiel) befindet sich innerhalb dieses Envelopes unter `data`. Die SSE-Level-`id:`- / `event:`-Zeilen sind eine Erleichterung für EventSource-Clients; dieselben Werte erscheinen auch im JSON-Envelope, sodass auch Raw-`fetch`-Consumer sie erhalten.

Öffne dies **bevor** du den Prompt sendest — der SSE-Replay-Buffer hält die letzten 8000 Events vor, sodass ein später Subscriber über `Last-Event-ID` aufholen kann, aber für den einfachen Fall "einen einzelnen Prompt beobachten" ist es am einfachsten, zuerst zu abonnieren und es live streamen zu lassen.

Der Stream emittiert `session_update` (LLM-Chunks, Tool-Calls, Usage), `permission_request` (Tool benötigt Approval), `permission_resolved` (jemand hat abgestimmt), `model_switched`, `model_switch_failed` und die Terminal-Frames `session_died` (Agent-Child abgestürzt — SSE schließt dann) und `client_evicted` (deine Queue ist übergelaufen — SSE schließt dann).

### 5. Prompt senden (zurück im ursprünglichen Terminal)

```bash
curl -X POST http://127.0.0.1:4170/session/$SESSION_ID/prompt \
  -H 'Content-Type: application/json' \
  -d '{"prompt":[{"type":"text","text":"What does src/main.ts do?"}]}'
# → {"stopReason":"end_turn"}
```

Das `curl -N` aus Schritt 4 gibt die Frames aus, sobald sie eintreffen.

## Authentication

Für alles, was über Loopback hinausgeht, **musst** du einen Bearer-Token übergeben:

```bash
export QWEN_SERVER_TOKEN="$(openssl rand -hex 32)"
qwen serve --hostname 0.0.0.0 --port 4170
# → boot refuses without QWEN_SERVER_TOKEN
```

Clients senden dann bei jeder Anfrage `Authorization: Bearer $QWEN_SERVER_TOKEN`. `/health` ist **nur bei Loopback-Binds** ausgenommen, damit k8s/Compose-Liveness-Probes innerhalb des Pods (wo der Daemon auf `127.0.0.1` lauscht) keine Credentials benötigen. Bei Non-Loopback-Binds (`--hostname 0.0.0.0` usw.) erfordert `/health` wie jede andere Route den Token — andernfalls kann ein Angreifer beliebige Adressen abfragen, um die Existenz des Daemons zu bestätigen. Verwende `/capabilities`, um zu überprüfen, ob dein Token End-to-End korrekt ist (er erfordert immer Auth):

> **Gehärtetes Loopback (`--require-auth`).** Das Standard-Loopback-Verhalten ohne Token ist für einen Single-User-Laptop in Ordnung, aber unsicher auf gemeinsamen Dev-Hosts, CI-Runnern oder Multi-Tenant-Workstations, wo jeder lokale Benutzer `curl 127.0.0.1:4170` ausführen kann. Übergib `--require-auth`, um den Bearer-Token auf jeder Route zwingend erforderlich zu machen — einschließlich `/health` und `/capabilities` — auch wenn er an `127.0.0.1` gebunden ist. Der Boot schlägt ohne Token fehl. Mit diesem Flag kann ein **nicht authentifizierter** Client `/capabilities` nicht lesen, um herauszufinden, dass Auth erforderlich ist; die Discovery-Oberfläche ist der 401-Response-Body selbst. Nach der Authentifizierung ist der Tag `caps.features.require_auth` eine Post-Auth-Bestätigung, dass das Deployment gehärtet ist (nützlich für Audit-/Compliance-UIs):
>
> ```bash
> qwen serve --require-auth --token "$(openssl rand -hex 32)"
> # → /health, /capabilities, /session, … all require Authorization: Bearer …
> curl http://127.0.0.1:4170/health
> # → 401
> curl -H "Authorization: Bearer $TOKEN" http://127.0.0.1:4170/capabilities | jq '.features | index("require_auth")'
> # → 13   (or whatever index — non-null after authenticating means the tag is present)
> ```

```bash
curl -H "Authorization: Bearer $QWEN_SERVER_TOKEN" http://your-host:4170/capabilities
# → {"v":1,"mode":"http-bridge","features":[...],"modelServices":[],"workspaceCwd":"/path/to/your-project"}
# Wrong token → 401
```

Der Token-Vergleich ist Constant-Time (SHA-256 + `crypto.timingSafeEqual`); 401-Responses sind einheitlich für "fehlender Header", "falsches Schema" und "falscher Token", sodass ein Side-Channel sie nicht unterscheiden kann.

## HTTPS / TLS (für mobilen / geräteübergreifenden Zugriff)

Standardmäßig liefert der Daemon reines HTTP aus. Das ist auf `localhost` in Ordnung, aber ein Handy oder Tablet, das eine LAN-IP (`https://192.168.x.x:4170`) ansteuert, ist über `http://` **kein** [Secure Context](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts) — daher blockieren Browser `getUserMedia` (Spracheingabe), WebRTC und andere APIs, die nur im Secure Context verfügbar sind. Übergib `--tls-cert` + `--tls-key`, um die Web-Shell über HTTPS auszuliefern und sie freizuschalten:
```bash
# 1. Installiere eine lokale CA und vertraue ihr (einmalig). Das mobile Gerät muss
#    dieser CA ebenfalls vertrauen – mkcert gibt aus, wo sich das Root-Zertifikat befindet.
mkcert -install

# 2. Generiere ein Zertifikat für die LAN-IP deines Rechners. Füge localhost / 127.0.0.1
#    ebenfalls zu den SANs hinzu: Bei `--open` schreibt der Daemon die Browser-URL auf
#    127.0.0.1 um, sodass ein Zertifikat, das nur auf die LAN-IP ausgestellt ist, mit
#    ERR_CERT_COMMON_NAME_INVALID abgelehnt würde. (mkcert benennt die Ausgabe nach allen Hosts.)
mkcert 192.168.1.100 localhost 127.0.0.1

# 3. Starte den Daemon über HTTPS. Non-Loopback-Binds erfordern weiterhin ein Token,
#    und der Browser-Origin muss über CORS erlaubt sein.
qwen serve \
  --hostname 0.0.0.0 \
  --token "$(openssl rand -hex 32)" \
  --tls-cert "./192.168.1.100+2.pem" \
  --tls-key "./192.168.1.100+2-key.pem" \
  --allow-origin "https://192.168.1.100:4170"
# → qwen serve listening on https://0.0.0.0:4170
```

Hinweise:

- **Beide Flags oder keines** – der Start schlägt fehl, wenn nur eines angegeben wird (ein Zertifikat ohne Key kann keinen HTTPS-Listener starten).
- **TLS ist orthogonal zur Authentifizierung** – HTTPS verschlüsselt den Transport; das Bearer-Token schützt weiterhin jede API-Route. Non-Loopback-Binds erfordern ein Token, mit oder ohne TLS.
- **Gilt nur für TLS-Terminierung** – keine automatische Generierung, kein ACME / Let's Encrypt. Dies ist eine Erleichterung für LAN/Entwicklung; für internetzugängliche Deployments sollte TLS an einem Reverse Proxy terminiert werden (siehe das Threat Model unten).

## CLI-Flags

| Flag                                    | Default         | Zweck                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--port <n>`                            | `4170`          | TCP-Port. `0` = vom Betriebssystem zugewiesener ephemeraler Port.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--hostname <addr>`                     | `127.0.0.1`     | Bind-Interface. Alles über Loopback hinaus erfordert ein Token.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `--token <str>`                         | —               | Bearer-Token. Fällt auf die Umgebungsvariable `QWEN_SERVER_TOKEN` zurück (mit entfernten führenden/anhängenden Leerzeichen – praktisch für `$(cat token.txt)`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `--require-auth`                        | `false`         | Verweigert den Start ohne Bearer-Token, auch auf Loopback. Härtet den `127.0.0.1`-Entwickler-Standard für gemeinsam genutzte Dev-Hosts / CI-Runner / Multi-Tenant-Workstations ab, bei denen jeder lokale Benutzer den Listener erreichen kann. Startet nur, wenn `--token` oder `QWEN_SERVER_TOKEN` gesetzt ist; schützt auch `/health` hinter dem Bearer-Token.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `--tls-cert <path>`                     | —               | Pfad zu einer PEM-Zertifikatsdatei. Bedient über **HTTPS** statt HTTP. Muss mit `--tls-key` gekoppelt werden (Start schlägt fehl, wenn nur eines angegeben wird). Entsperrt Secure-Context-Browser-APIs – Spracheingabe (`getUserMedia`), WebRTC – über eine LAN-IP, was Browser bei normalem `http://` sonst blockieren. Nur TLS-Terminierung; keine automatische Generierung / ACME. Siehe [HTTPS / TLS](#https--tls-for-mobile--cross-device-access) unten.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `--tls-key <path>`                      | —               | Pfad zu einer PEM-Private-Key-Datei. Muss mit `--tls-cert` gekoppelt werden.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `--max-sessions <n>`                    | `20`            | Obergrenze für gleichzeitige Live-Sessions. Neue `POST /session`-Anfragen, die ein neues Kind erzeugen würden, geben `503` (mit `Retry-After: 5`) zurück, wenn die Obergrenze erreicht ist; Anhängen an bestehende Sessions wird NICHT gezählt. Setze auf `0`, um es zu deaktivieren. Ausgelegt für Single-User / Small-Team-Nutzung; erhöhe den Wert, wenn dein Deployment über genügend RAM/FD-Reserven verfügt (~30–50 MB pro Session).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `--max-pending-prompts-per-session <n>` | `5`             | Session-spezifische Obergrenze für Prompts, die von `POST /session/:id/prompt` akzeptiert, aber noch nicht abgeschlossen wurden, einschließlich wartender Prompts und des aktiven Prompts. Die Bridge lehnt Überläufe synchron mit `503`, `Retry-After: 5` und `code: "prompt_queue_full"` ab, bevor eine `promptId` zurückgegeben wird. Setze auf `0`, um es zu deaktivieren. `branchSession` serialisiert auf derselben FIFO, zählt aber nicht gegen diese Prompt-Obergrenze.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `--workspace <path>`                    | `process.cwd()` | Absoluter Workspace-Pfad, an den dieser Daemon gebunden wird (gemäß [#3803](https://github.com/QwenLM/qwen-code/issues/3803) §02 – 1 Daemon = 1 Workspace). `POST /session`-Anfragen mit einem nicht übereinstimmenden `cwd` geben `400 workspace_mismatch` zurück. Für Multi-Workspace-Deployments führe ein `qwen serve` pro Workspace auf separaten Ports aus.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `--channel <name\|all>`                 | —               | Experimenteller, vom Daemon verwalteter Channel-Worker. Wiederhole das Flag, um mehrere konfigurierte Channels auszuwählen, oder übergebe `all`, um jeden konfigurierten Channel zu starten. `all` kann nicht mit benannten Channels kombiniert werden. Ausgewählte `cwd`-Werte für Channels müssen auf den Daemon-Workspace auflösen. Der Worker gehört `qwen serve`; stoppe den Daemon, um die von serve verwalteten Channels zu stoppen.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--max-connections <n>`                 | `256`           | TCP-Verbindungsobergrenze auf Listener-Ebene (`server.maxConnections`). Begrenzt die Anzahl der Raw-Sockets unabhängig von der Session-Anzahl – langsame / Phantom-SSE-Clients werden beim Akzeptieren abgelehnt, sobald das Limit erreicht ist. Erhöhe diesen Wert zusammen mit `--max-sessions`, wenn dein Deployment viele SSE-Abonnenten pro Session erwartet.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `--event-ring-size <n>`                 | `8000`          | Pro-Session SSE-Replay-Ring-Tiefe (Ziel gemäß #3803 §02). Setzt den Backlog, der `GET /session/:id/events` mit `Last-Event-ID: N` zur Verfügung steht. Größer = mehr Spielraum für Reconnects auf Kosten von einigen hundert KB zusätzlichem RAM pro Session. SDK-Clients können zusätzlich über `?maxQueued=N` eine größere Backlog-Obergrenze pro Abonnent für ein bestimmtes Abonnement anfordern (Bereich `[16, 2048]`, Standard 256). Daemons senden außerdem einen nicht-terminalen `slow_client_warning`-SSE-Frame bei 75 % Queue-Füllung, damit Clients drainen / reconnecten können, bevor sie aus der Queue entfernt werden. Pre-flight `caps.features.slow_client_warning`.                                                                                                                                                                                                                                                                                                                                                        |
| `--mcp-client-budget <n>`               | —               | Obergrenze als positive Ganzzahl für Live-MCP-Clients **pro ACP-Session** (Issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14 v1; PR 23 stuft dies auf pro Workspace über den gemeinsamen MCP-Pool hoch). Kombiniere mit `--mcp-budget-mode`. Wenn nicht gesetzt, keine accounting-basierte Durchsetzung (aber `GET /workspace/mcp` meldet weiterhin `clientCount`). Unterscheide sich von claude-codes `MCP_SERVER_CONNECTION_BATCH_SIZE`, welches die Startparallelität begrenzt, nicht die Gesamtzahl der Clients. Pre-flight `caps.features.mcp_guardrails`.                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `--mcp-budget-mode <m>`                 | `warn` / `off`  | Wie `--mcp-client-budget` durchgesetzt wird. `warn` (Standard, wenn Budget gesetzt): keine Ablehnung, `budgets[0].status` des Snapshots springt bei ≥75 % des Budgets auf `warning`. `enforce`: Verbindungen über der Obergrenze werden abgelehnt, die Pro-Server-Zelle zeigt `disabledReason: 'budget'`, deterministisch nach der Deklarationsreihenfolge von `mcpServers`. `off` (Standard, wenn Budget nicht gesetzt): reine Beobachtbarkeit. Der Start lehnt `enforce` ohne Budget ab.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `--http-bridge`                         | `true`          | Stage-1-Modus: ein `qwen --acp`-Kind pro Daemon (beim Start an einen Workspace gebunden, gemäß [#3803](https://github.com/QwenLM/qwen-code/issues/3803) §02); N Sessions werden über ACP `newSession()` auf dieses Kind gemultiplext. Stage 2 nativ im Prozess wird später verfügbar.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `--allow-origin <pat>`                  | —               | T2.4 ([#4514](https://github.com/QwenLM/qwen-code/issues/4514)). Cross-Origin-Allowlist für Browser-WebUI-Clients. Wiederholbar. Jeder Wert ist `*` (beliebiger Origin – Start wird verweigert, wenn kein Bearer-Token konfiguriert ist; `--require-auth` auf Loopback wird empfohlen, damit `/health` und `/demo` ebenfalls durch Bearer geschützt sind, da beide auf Loopback standardmäßig pre-auth sind) oder ein kanonischer URL-Origin (`<scheme>://<host>[:<port>]`, kein abschließender Schrägstrich / Pfad / Userinfo / Query). **Subdomain-Wildcards (`https://*.example.com`) werden absichtlich nicht unterstützt** – liste jede Subdomain explizit auf oder verwende `*` mit einem konfigurierten Token (und `--require-auth` für vollständige Härtung). Übereinstimmende Origins erhalten CORS-Antwortheader (`Access-Control-Allow-Origin`, `Vary: Origin`, Methods, Headers, Max-Age und exponiertes `Retry-After`); nicht übereinstimmende Origins erhalten weiterhin einen 403 mit demselben Envelope wie die heutige Wall. `Origin: null` (sandboxed iframes, file:// docs) wird immer abgelehnt, auch unter `*`. Pre-flight über `caps.features.allow_origin`. Loopback-Self-Origin-Hits sind nicht betroffen. |
| `--web` / `--no-web`                    | `true`          | Bedient die gebaute Web-Shell-SPA am Daemon-Root (`GET /`, `/assets/*` und SPA-Deep-Link-Fallback). Die statische Shell wird **vor** dem Bearer-Auth-Gate registriert – ein Browser kann kein Token an eine `<script>`-Subressource oder eine Adressleisten-Navigation anhängen, die Shell enthält keine Secrets, und jede API-Route bleibt unabhängig davon Token-geschützt. Bei Non-Loopback-Binds weist eine einzeilige Stderr-Warnung darauf hin, dass die UI ohne Auth erreichbar ist. Verwende `--no-web` für einen reinen API-Daemon. Keine Auswirkung, wenn der Build die Web-Shell-Assets weglässt (der Daemon loggt einen Breadcrumb und läuft nur als API).                                                                                                                                                                                                                                                                                                                                                         |
| `--open`                                | `false`         | Nachdem der Listener gestartet ist, öffne die Web-Shell in deinem Standardbrowser unter der Daemon-URL (mit `#token=` als URL-Fragment angehängt, wenn ein Token konfiguriert ist – ein Fragment wird niemals an den Server gesendet, wodurch das Token aus den Zugriffslogs und Referer-Headern ferngehalten wird). No-op mit `--no-web` oder in Headless-/CI-/SSH-Umgebungen, in denen kein Browser verfügbar ist.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
> **Größenanpassung der Lastregler.** `--max-sessions` ist die Obergrenze für **neue Child-Prozesse**.
> Drei weitere Ebenen begrenzen ebenfalls die Last – stimme sie bei der Dimensionierung für ein High-Concurrency-Deployment aufeinander ab:
>
> - **Listener-Ebene**: `--max-connections` / `server.maxConnections=256` begrenzt reine TCP-Verbindungen (Back-Pressure bei langsamen Clients).
> - **Abonnenten pro Session**: Der EventBus begrenzt SSE-Abonnenten standardmäßig auf 64 pro Session; der 65. Client erhält einen terminalen `stream_error` und wird getrennt.
> - **Prompt-Zulassungen pro Session**: `--max-pending-prompts-per-session=5` begrenzt die wartenden + aktiven Prompts, die für eine Session akzeptiert werden. Bei Überlauf wird `503` mit `Retry-After: 5` zurückgegeben.
> - **Backlog pro Abonnent**: Eine 256-Frames-Warteschlange pro SSE-Client; ein Client mit Überkapazität erhält ein terminales `client_evicted`-Frame und wird getrennt (ein langsamer Consumer kann den Daemon nicht blockieren).
>
> Diese Limits interagieren miteinander: `--max-sessions × 64 Abonnenten × 256 Frames` ist der Worst-Case-Speicherbedarf für In-Flight-Daten auf der EventBus-Ebene, während `--max-sessions × --max-pending-prompts-per-session` die akzeptierte Prompt-Arbeit auf der Zulassungsebene begrenzt. Die Standarddimensionierung geht von Single-User- / Klein-Team-Last aus; erhöhe die Werte progressiv (und beobachte den RSS) für Multi-Tenant-Deployments.

> **MCP-Client-Schutzmechanismen (Issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14).** Ein Workspace, der 30 MCP-Server in `mcpServers` deklariert, startet 30 Clients ohne Obergrenze, sofern du keine festlegst. `--mcp-client-budget=N` begrenzt die Anzahl der aktiven MCP-Clients; `--mcp-budget-mode={enforce,warn,off}` wählt das Verhalten. Der Standard ist `warn`, wenn ein Budget festgelegt ist (der Snapshot zeigt die Warnung an, aber kein Client wird abgelehnt – nützlich, um das reale Fanout zu messen, bevor die Durchsetzung aktiviert wird). Abgewiesene Server im `enforce`-Modus erhalten `disabledReason: 'budget'` in ihrer serverbezogenen Zelle, und die `budgets[0]`-Zelle zeigt `status: 'error'` + `errorKind: 'budget_exhausted'`. Die Slot-Reservierung erfolgt nach Servername und übersteht Reconnects / Discovery-Timeouts – ein abgelehnter Server kann einem gesunden Server keinen Slot wegnehmen.
>
> ⚠️ **v1-Scope: pro Session, nicht pro Workspace.** Jede ACP-Session innerhalb des Daemons hat ihre eigene `Config`/`McpClientManager` (erstellt über `newSessionConfig` pro Session). Das Budget begrenzt aktive MCP-Clients **pro Session**, nicht aggregiert über alle Sessions im Workspace. Der Snapshot unter `GET /workspace/mcp` spiegelt die Sicht der Bootstrap-Session wider (die Zelle trägt `scope: 'session'` der Ehrlichkeit halber). Wenn du 5 gleichzeitige ACP-Sessions mit `--mcp-client-budget=10` ausführst, kannst du bis zu 50 aktive MCP-Clients über den Daemon verteilt haben – das Limit gilt pro Session. **Wave 5 PR 23 (Shared MCP Pool)** führt einen Workspace-weiten Manager ein und stuft dies zu einer echten pro-Workspace-Durchsetzung hoch.
>
> ```sh
> qwen serve --mcp-client-budget=10 --mcp-budget-mode=warn
> # later, after telemetry shows your real-world distribution:
> qwen serve --mcp-client-budget=10 --mcp-budget-mode=enforce
> ```
>
> Dies ist **nicht** dasselbe wie `MCP_SERVER_CONNECTION_BATCH_SIZE` in claude-code (welches die Startup-Concurrency steuert); sie sind orthogonal. PR 23 wird einen echten Shared MCP Pool hinzufügen (eine `scope: 'workspace'`-Zelle in `budgets[]` neben der pro-Session-Zelle); PR 14 v1 ist der In-Process-Counter + Soft-Enforcement für den bestehenden pro-Session-Manager.
>
> **Push-Events (Issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14b).** SDK-Clients, die `GET /session/:id/events` abonniert haben, erhalten typisierte Frames, wenn Budget-Schwellenwerte überschritten werden – `mcp_budget_warning` (synthetisch, wird einmal pro Überschreitung nach oben auf 75 % ausgelöst, mit Hysterese-Re-Arm bei 37,5 %, beworben über `mcp_guardrail_events`) und `mcp_child_refused_batch` (zusammengefasst einmal pro Discovery-Durchlauf im `enforce`-Modus; Länge 1 bei `readResource`-Lazy-Spawn-Ablehnung). Der Snapshot unter `GET /workspace/mcp` ist weiterhin die Single Source of Truth für den Zustand nach einem Reconnect; Events sind Change-Edges. Nützlich für Echtzeit-Dashboards ohne Polling.

## Standard-Bedrohungsmodell für Deployments

- **Nur 127.0.0.1** – Loopback-Bind, keine Authentifizierung erforderlich.
- **`--hostname 0.0.0.0` erfordert ein Token** – der Start wird ohne Token verweigert.
- **`LOOPBACK_BINDS` umfasst IPv6** – `::1` und `[::1]` gelten für die Keine-Token-Regel als Loopback.
- **Host-Header-Allowlist** – Bei **Loopback**-Binds prüft der Daemon, ob `Host:` mit `localhost:port` / `127.0.0.1:port` / `[::1]:port` / `host.docker.internal:port` übereinstimmt (Groß-/Kleinschreibung ignorierend gemäß RFC 7230 §5.4), um sich gegen DNS-Rebinding zu verteidigen. **Non-Loopback-Binds (`--hostname 0.0.0.0`) umgehen absichtlich die Host-Allowlist** – der Operator hat die Angriffsfläche gewählt, daher ist das Bearer-Token-Gate die einzige Authentifizierungsebene; Reverse Proxies / SNI / Client-Cert-Pinning liegen in der Verantwortung des Operators, nicht des Daemons. Wenn du Host-basierte Isolierung bei einem Non-Loopback-Bind benötigst, terminiere TLS + prüfe den Host an einem Front-Proxy.
- **CORS verweigert standardmäßig jeden Browser-Origin** – gibt `403` JSON zurück. Übergebe **`--allow-origin <pattern>`** (wiederholbar, T2.4 #4514), um bestimmte Browser-Origin zuzulassen. Jeder Wert ist entweder das Literal `*` (beliebiger Origin – der Start wird verweigert, wenn kein Bearer-Token konfiguriert ist; `--require-auth` auf Loopback wird für vollständige Härtung empfohlen, da `/health` und `/demo` auf Loopback standardmäßig vor der Authentifizierung bleiben) oder ein kanonischer URL-Origin (`<scheme>://<host>[:<port>]`, kein abschließender Schrägstrich / Pfad / Userinfo). Übereinstimmende Origins erhalten korrekte CORS-Antwortheader (`Access-Control-Allow-Origin: <echoed>`, `Vary: Origin`, sowie Standard-Methods / -Headers / -Max-Age und offengelegtes `Retry-After`); nicht übereinstimmende Origins erhalten weiterhin ein 403 mit demselben Envelope wie die Standard-Barriere. `caps.features.allow_origin` wird bedingt beworben, damit SDK- / Web-UI-Clients vor dem Absenden von Cross-Origin-Requests per Pre-Flight prüfen können, ob der Daemon diese akzeptiert. Beispiel: `qwen serve --allow-origin http://localhost:3000 --allow-origin http://localhost:5173`. Loopback-Self-Origin-Requests (z. B. die `/demo`-Seite) sind davon unberührt – ein separater Origin-Strip-Shim behandelt sie unabhängig von `--allow-origin`. **Browser-Web-UIs ohne konfiguriertes `--allow-origin`** fallen weiterhin auf die gleichen Stage-1-Optionen wie zuvor zurück: Pakete sie als native Shell (Electron/Tauri), damit kein `Origin`-Header gesendet wird, oder stelle dem Daemon einen Same-Origin-Reverse-Proxy voran.
- **Gestarteter `qwen --acp`-Child-Prozess erbt die Umgebung des Daemons** mit einer ausdrücklichen Bereinigung: `QWEN_SERVER_TOKEN` wird entfernt, bevor der Child-Prozess startet (das eigene Bearer-Token des Daemons; der Agent benötigt es nicht). Alles andere – `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `QWEN_*` / `DASHSCOPE_API_KEY` / deine benutzerdefinierten `modelProviders[].envKey` / usw. – wird durchgereicht, da der Agent diese legitimerweise zur Authentifizierung beim LLM benötigt. **Dies ist beabsichtigt, keine Sandbox.** Der Agent läuft unter derselben UID mit Shell-Tool-Zugriff, sodass unabhängig davon alles in `~/.bashrc` / `~/.aws/credentials` / `~/.npmrc` durch Prompt-Injection erreichbar ist. Die Umgebungsdurchreichung ist nicht die Sicherheitsgrenze; der Benutzer als Trust-Root ist es. Führe `qwen serve` nicht unter einer Identität aus, die über Umgebungsvariablen gespeicherte Credentials enthält, die du dem Agenten nicht anvertrauen würdest.
- **Begrenzte SSE-Warteschlangen pro Abonnent** – ein langsamer Client, der seine Warteschlange überläuft, erhält ein terminales `client_evicted`-Frame und wird getrennt; ein festsitzender Consumer kann den Daemon nicht blockieren.
- **Limit für die Prompt-Zulassung pro Session** – standardmäßig 5 akzeptierte, aber noch nicht abgeschlossene Prompts pro Session. Ein fehlerhafter Client kann keine unbegrenzten Prompt-Promises oder temporäre SSE-Wartezeiten für eine Session in die Warteschlange stellen.
- **Graceful Shutdown** – SIGINT/SIGTERM fahren die Agent-Child-Prozesse herunter, bevor der Listener geschlossen wird (10s-Frist pro Child-Prozess).

> ⚠️ **Bekannte Lücke in Stage 1 – Berechtigungen sind daemon-global, nicht pro Session (BUy4H).** `pendingPermissions` lebt im Daemon-Scope; jeder Client, der das Bearer-Token besitzt, kann über jede `requestId` für jede Session abstimmen, die er sehen kann (und SSE-`permission_request`-Events tragen die `requestId` in ihrem Payload). Dies ist unter dem Single-User- / Klein-Team-Trust-Modell akzeptabel, bei dem jeder authentifizierte Client dieselbe Person oder vertrauenswürdige Mitarbeiter sind. Stage 1.5 wird auf `POST /session/:id/permission/:requestId` + session-scoped Pending-Map + pro-Client-Identität umstellen (Must-have #3 aus dem Downstream-Review); führe `qwen serve` bis dahin nicht hinter einem Bearer aus, das mit nicht vertrauenswürdigen Parteien geteilt wird.
>
> ⚠️ **Bekannte Lücke in Stage 1 – `POST /session/:id/prompt`-Body auf 10 MB begrenzt (BUy4L).** Multimodale Prompts, die Bilder / PDFs / Audio enthalten und 10 MB überschreiten, schlagen beim Body-Parsing fehl, bevor die Routenlogik ausgeführt wird (kein Streaming, kein Abbruch mitten im Upload). Workaround: Verkleinere den Inhalt clientseitig oder übergebe eine Pfadreferenz und lass den Agenten die Datei über `readTextFile` lesen. Stage 1.5 wird `multipart/form-data` oder Chunked-Encoding auf `/prompt` akzeptieren, damit große Prompts nicht abrupt abbrechen.
>
> ⚠️ **Bekannte Lücke in Stage 1 – Phantom-SSE-Verbindungen hinter NAT.** Der
> Daemon erkennt tote Clients über TCP-Back-Pressure bei Heartbeats
> (15s-Intervall). Ein Client, der OHNE ein TCP-RST verschwindet (z. B. eine
> NAT-Box, die Idle-Flows still verwirft), hält den Socket auf Kernel-Ebene
> "am Leben", bis die Keepalive-Probes von Node timeouten – standardmäßig typischerweise ~2 Stunden
> unter Linux. Bei Deployments mit `--hostname 0.0.0.0` hinter solchen
> NATs können sich Phantom-SSE-Verbindungen ansammeln und irgendwann die
> 256 `server.maxConnections`-Obergrenze erreichen.
>
> Setze [`--writer-idle-timeout-ms <n>`](#deadlines-and-writer-idle-timeout)
> (Issue [#4514](https://github.com/QwenLM/qwen-code/issues/4514) T2.9),
> um die Lücke mit einer expliziten Idle-Frist auf Anwendungsebene zu schließen:
> wenn für `n` ms kein Write erfolgreich geflusht wurde, gibt der Daemon
> ein terminales `client_evicted`-Frame mit
> `reason: 'writer_idle_timeout'` aus und schließt den Stream. Das Flag ist
> standardmäßig deaktiviert, um den Legacy-Vertrag zu erhalten – Operatoren in
> Netzwerken, die RSTs verschlucken, sollten einen Wert deutlich über dem 15s-Heartbeat-Intervall
> wählen (z. B. `60000`–`300000`), damit legitime Idle-Verbindungen nicht getrennt werden, während wirklich festsitzende Writer promptly bereinigt werden. Führe `caps.features.includes('writer_idle_timeout')`
> per Pre-Flight in deinem SDK aus, um zu bestätigen, dass der Daemon dies unterstützt.

### Deadlines und Writer-Idle-Timeout

Issue [#4514](https://github.com/QwenLM/qwen-code/issues/4514) T2.9 liefert zwei Opt-in-Flags, die die Lücken bei langlaufenden / Remote-Deployments schließen, die der 15s-Heartbeat + AbortSignal nicht abdecken. Beide sind standardmäßig deaktiviert – Single-User-Loopback-Workflows bleiben Bit für Bit unverändert.

| Flag                           | Env var                             | Default | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------ | ----------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--prompt-deadline-ms <n>`     | `QWEN_SERVE_PROMPT_DEADLINE_MS`     | nicht gesetzt | Serverseitige Wallclock-Obergrenze für ein einzelnes `POST /session/:id/prompt`. Bei Ablauf bricht der Daemon den AbortController des Prompts ab und gibt HTTP `504` mit `{code:"prompt_deadline_exceeded", errorKind:"prompt_deadline_exceeded", deadlineMs:n}` zurück. Ein `deadlineMs`-Feld im Request-Body pro Prompt kann die effektive Frist unterhalb des Flags verkürzen, aber niemals verlängern. Capability-Tag (bedingt): `prompt_absolute_deadline`.                                                                                                                                                                                                |
| `--writer-idle-timeout-ms <n>` | `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` | nicht gesetzt | Idle-Frist pro SSE-Verbindung. Wenn für `n` ms kein Write ERFOLGREICH geflusht wurde – weder ein echtes Event noch der 15s-Heartbeat – gibt der Daemon ein terminales `client_evicted`-Frame mit `data.reason = 'writer_idle_timeout'` (gespiegelt in `data.errorKind`) aus und schließt den Stream. **Wähle einen Wert komfortabel über dem 15s-Heartbeat** (z. B. `30000`–`300000`), damit legitime Idle-Streams nicht getrennt werden; Werte `< 15000` TRENNEN ansonsten gesunde Idle-Verbindungen, bevor der erste Heartbeat feuert (nur beabsichtigt für Tests / kurzlebige Dev-Sessions). Capability-Tag (bedingt): `writer_idle_timeout`. |

Beide Flags akzeptieren eine positive Ganzzahl in Millisekunden; `0`, `NaN`, nicht-ganzzahlige oder negative Werte werden beim Start mit einer klaren Fehlermeldung abgelehnt. Das CLI-Flag hat Vorrang vor der Umgebungsvariable; das explizite `ServeOptions`-Feld (eingebettete Aufrufer) hat Vorrang vor der Umgebungsvariable. SDK-Nutzer sollten den passenden Capability-Tag per Pre-Flight prüfen, bevor sie sich auf eines der Verhaltensweisen verlassen – Daemons vor diesem PR lassen beide Tags weg und das `deadlineMs`-Feld im Request wird stillschweigend verworfen.

## Multi-Session- & Multi-Workspace-Deployment

Gemäß [#3803](https://github.com/QwenLM/qwen-code/issues/3803) §02 bindet jeder `qwen serve`-Prozess beim Start an **einen Workspace**. Innerhalb dieses Workspaces multiplexed er N Sessions auf einen einzigen `qwen --acp`-Child-Prozess über die native Session-Map des Agents – Sessions teilen sich den Prozess des Childs / OAuth-Status / File-Read-Cache / Hierarchy-Memory-Parse.

Um **mehrere Workspaces** zu hosten (ein Benutzer, mehrere Repos; oder mehrere Benutzer auf demselben Host), führe **mehrere Daemon-Prozesse** aus – einen pro Workspace, jeden auf seinem eigenen Port, überwacht von systemd / docker-compose / k8s / einem `qwen-coordinator` Referenz-Orchestrator. Der Kompromiss ist beabsichtigt: Ein Workspace pro Child bedeutet, dass `loadSettings(cwd)` / OAuth / MCP-Server-Scope am gebundenen Verzeichnis ausgerichtet bleiben und nicht über Requests hinweg driften.

> **Abonniere BEVOR du `modelServiceId` beim Attach postest.** Wenn ein Client `POST /session` mit einer `modelServiceId` aufruft und der Workspace bereits eine Session hat, die ein anderes Modell ausführt, gibt der Daemon einen internen `setSessionModel`-Aufruf aus – Fehler werden NICHT als HTTP-Fehler propagiert (die Session bleibt auf ihrem aktuellen Modell betriebsbereit). Das sichtbare Fehlersignal ist ein `model_switch_failed`-Event im SSE-Stream der Session. Wenn du `POST /session` aufrufst und erst DANN `GET /session/:id/events` öffnest, verpasst du das Fehler-Event und sprichst stillschweigend weiter mit dem falschen Modell. Öffne zuerst den SSE-Stream oder übergebe `Last-Event-ID: 0` beim Abonnieren, um das älteste verfügbare Event des Rings erneut abzuspielen.

Um mehrere **Benutzer** zu verwalten (jeder mit eigener Quota, Audit-Log, Sandbox) oder um über die Reichweite eines einzelnen Prozesses hinaus zu skalieren (Cold-Start-Budget, FD-Anzahl, RSS), starte einen Daemon pro Workspace pro Benutzer hinter einem externen Orchestrator. Dieser Orchestrator (Multi-Tenancy / OIDC / Quota / Audit / k8s) liegt **außerhalb des Scopes** des qwen-code-Projekts – siehe Issue [#3803](https://github.com/QwenLM/qwen-code/issues/3803) "External Reference Architecture" für die Design-Hinweise.

## Laden und Fortsetzen einer persistierten Session

Der Daemon macht den `session/load`- und Resume-Flow von ACP über HTTP über zwei Routen verfügbar:

| Route                      | Use when                                                                                                                                                                                                                                                                                      |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /session/:id/load`   | Der Client hat **keine** Historie gerendert (Cold-Reconnect, Picker-then-Open). Der Daemon spielt jeden persistierten Turn über SSE erneut ab, sodass Abonnenten das vollständige Transkript sehen. Capability-Tag: `session_load`.                                                                                        |
| `POST /session/:id/resume` | Der Client hat die Turns bereits auf dem Bildschirm und benötigt nur das daemon-seitige Handle zurück. Der Modellkontext wird auf Agent-Seite ohne UI-Replay wiederhergestellt – der SSE-Stream bleibt sauber. Capability-Tag: `session_resume` (`unstable_session_resume` bleibt ein deprecated Alias für ältere Clients). |

Das TypeScript-SDK macht beide als statische Factories auf `DaemonSessionClient` verfügbar:

```ts
import { DaemonClient, DaemonSessionClient } from '@qwen-code/sdk';

const client = new DaemonClient({ baseUrl: 'http://127.0.0.1:4170' });

// Cold reconnect — daemon will replay history through SSE.
const session = await DaemonSessionClient.load(client, 'persisted-id');

// Or, if your UI already has the history, skip the replay:
// const session = await DaemonSessionClient.resume(client, 'persisted-id');

for await (const event of session.events()) {
  // First the replayed `session_update` frames (load only),
  // then live events.
}
```

Führe `caps.features.session_load` / `caps.features.session_resume` vor dem Aufruf per Pre-Flight aus – ältere Daemons geben `404` zurück. `unstable_session_resume` wird weiterhin als deprecated Kompatibilitäts-Alias beworben. Gleichzeitige Same-Action-Requests für dieselbe ID werden zusammengeführt; Cross-Action-Races (ein `load`, der mit einem `resume` wetteifert) erhalten `409 restore_in_progress` mit `Retry-After: 5`. Siehe die [Protokollreferenz](../developers/qwen-serve-protocol.md) für das vollständige Fehler-Envelope.

Hinweis: Das erneute Abspielen der Historie wird durch den SSE-Ring begrenzt (standardmäßig 8000 Frames). Lange Historien mit gesprächigen Turns können diesen Wert überschreiten – die frühesten Frames werden stillschweigend verworfen. Bevorzuge für sehr lange Sessions `resume` und verlasse dich auf die lokal persistierte UI des Clients.

## Durability-Modell

**Sessions sind in Stage 1 über Daemon-Neustarts hinweg weiterhin ephemer**, aber persistierte Sessions auf der Festplatte können neu geladen werden:

- Ein Child-Prozess-Crash veröffentlicht `session_died` und entfernt die Live-Session aus den Maps des Daemons. Die persistierte Session auf der Festplatte **kann** über `POST /session/:id/load` neu geladen werden, wenn ein frischer Agent-Child-Prozess gestartet werden kann.
- Ein Daemon-Neustart verliert jede In-Flight-Live-Session. Die persistierten Sessions bleiben auf der Festplatte und können gegen einen neuen Daemon-Prozess geladen werden, vorbehaltlich derselben Workspace-Binding-Regeln.
- Lange Client-Disconnects (>5 Min. bei einem gesprächigen Turn) können den SSE-Replay-Ring überholen (standardmäßig 8000 Frames) – der `Last-Event-ID`-Reconnect succeeds, aber der Zustand kann inkohärent sein. Für Mobile- / instabile Netzwerk-Clients, plane das erneute Öffnen von SSE bei langen Ausfällen oder rufe `POST /session/:id/load` auf, um von der Festplatte neu abzuspielen.
- Dateioperationen (`writeTextFile`) sind über Crashes hinweg atomar (Write-then-Rename); sie sind über Daemon-Neustarts hinweg nicht im Sinne eines Replays atomar – der Datei-Write ist entweder angekommen oder nicht.

Wenn deine Integration serverseitige Cross-Restart-Durability benötigt, die über das hinausgeht, was `session/load` abdeckt (z. B. serververwaltete Retry-Queues), benötigst du weiterhin eine State-Recovery auf Anwendungsebene. Halte keinen langlaufenden, Neustart-sensitiven Zustand innerhalb der Session des Daemons.

## Stage 1.5+ Runtime-Garantien

Der Vertrag von Stage 1 ist auf Prototyping ausgelegt. Gemäß [#3889 chiga0 downstream-consumer review](https://github.com/QwenLM/qwen-code/pull/3889#issuecomment-4427875644) sind die folgenden Punkte **nicht** in Stage 1 enthalten – produktionsreife Integrationen benötigen Stage 1.5+, bevor sie sich darauf verlassen:
**Blocker für den ernsthaften Einsatz in nachgelagerten Systemen:**

1. **`loadSession` / `unstable_resumeSession` über HTTP** — ohne dies kann keine Integration einen Child-Crash oder Daemon-Neustart überstehen, und auch ein Orchestrator, der den Daemon koordiniert, kann den Zustand nicht wiederherstellen.
2. **Persistente Client-Identität (Pair-Tokens + client-spezifische Sperrung)** — Stufe 1 verwendet einen gemeinsamen Bearer; ein geleakter Token sperrt alle, und `originatorClientId` wird vom Client selbst deklariert, anstatt vom Daemon basierend auf der authentifizierten Identität gestempelt zu werden.

**Zuverlässigkeits-Baseline:**

3. ~~**Vom Client initiierter Heartbeat-Pfad**~~ — ausgeliefert über [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 9. `POST /session/:id/heartbeat` zeichnet zuletzt gesehene Zeitstempel auf dem Daemon auf (Capability-Tag `client_heartbeat`); SDK-Helper sind `DaemonClient.heartbeat()` / `DaemonSessionClient.heartbeat()`.
4. **`permission_already_resolved`-Event**, wenn ein Vote das First-Responder-Rennen verliert — derzeit müssen UIs den Zustand aus einem `404` ableiten.
5. ~~**Größerer Replay-Ring**~~ — auf 8000 erhöht. **Pro Sitzung konfigurierbarer Ring** noch offen — Mobile- / Chatty-Turn-Workloads benötigen möglicherweise session-spezifische Overrides.
6. **`slow_client_warning`-Event vor `client_evicted`** — sanfter Backpressure, damit sich gutmütige, langsame Clients selbst drosseln können (Render-Tiefe reduzieren, Chunks verwerfen), bevor sie beendet werden.

**Ergonomie der Integration:**

7. **`POST /session/:id/_meta` für IM-artigen Kontext** — Pro-Sitzung Key-Value, das nachfolgenden Prompts angehängt wird (Chat-ID, Absender, Thread-ID), ersetzt die Improvisation pro Kanal.
8. **Tatsächliche Feature-Verhandlung über `/capabilities`** — `protocol_versions: { acp: '0.14.x', daemon_envelope: 1 }`, damit Clients Drift erkennen können, anstatt auf "unknown frame, ignore" zurückzufallen.
9. **Erstklassige Durability-Dokumentation** (dieser Abschnitt) — bereits weiter oben ausgeliefert.

Die vollständige Convergence-Roadmap wird in [#3803](https://github.com/QwenLM/qwen-code/issues/3803) verfolgt.

## Grenzen des Stage-1-Scopes — was wir in Stage 1.5 nicht beheben werden

Zwei strukturelle Entscheidungen sind explizite Non-Goals für die Stage 1 / 1.5 / 2 Mainline-Roadmap. Wenn dein Use-Case von einem davon abhängt, plane drumherum, anstatt auf uns zu warten.

### Session-State ist nur lokale Mutation (gemäß [LaZzyMan Review #4270256721](https://github.com/QwenLM/qwen-code/pull/3889#pullrequestreview-4270256721))

Der Stage-1.5-Plan beschreibt die TUI als In-Process-EventBus-Subscriber. In der Praxis **ist die TUI-UI strikt größer als das Wire-Protokoll**:

- **Nur lokale UI** — die ~15 Ink-Dialogkomponenten (`ModelDialog`, `MemoryDialog`, `PermissionsDialog`, `SessionPicker`, `WelcomeBackDialog`, `FolderTrustDialog`, …) und die `local-jsx`-Slash-Commands (`/ide`, `/auth`, `/init`, `/resume`, `/rename`, `/delete`, `/language`, `/arena`, …) rendern terminalspezifisches Ink-JSX. Remote-Clients über HTTP/SSE können Ink nicht äquivalent rendern, und diese Flows emittieren kein Wire-Event.
- **Session-State-Mutationen ohne Wire-Events** — `/approval-mode`, `/memory add`, `/mcp add-server`, `/agents`, `/tools enable/disable`, `/auth`, `/init` (Schreiben von `CLAUDE.md`) ändern alle das Agent-Verhalten, aber nur `/model` publiziert derzeit ein Event (`model_switched`).

**Stage-1-Entscheidung — Option (A) aus dem Review**: Diese Mutationen nicht zu Wire-Events befördern. Die beiden Deployment-Modi haben unterschiedliche Konsequenzen.

#### Modus 1 — Headless `qwen serve` (dieser PR)

Keine TUI-Shell läuft innerhalb des Daemons. Die oben aufgeführten Slash-Commands **existieren nicht** in diesem Modus — es gibt keine Terminal-UI, von der aus sie aufgerufen werden könnten. Der Session-State ist daher:

- **Beim Booten eingefroren** für `approval-mode` / `memory` / `agents` / `tools`-Allowlist / `auth` — alles wird aus den Settings + Festplatte geladen, wenn der `qwen --acp`-Child des Daemons startet; unveränderlich für die Lebensdauer der Session. Über Settings definierte MCP-Server sind ebenfalls beim Booten eingefroren, aber **zur Laufzeit hinzugefügte Server** (über `POST /workspace/mcp/servers`) können ohne Neustart hinzugefügt oder entfernt werden.
- **Über HTTP veränderbar** via `POST /session/:id/model` (publiziert `model_switched`), `POST /workspace/mcp/servers` / `DELETE /workspace/mcp/servers/:name` (publiziert `mcp_server_added` / `mcp_server_removed`) und Permission-Votes (`POST /permission/:requestId`).

**Konsequenz:** Remote-Clients im Headless-Modus sehen den **vollständigen Session-State**. Keine TUI verbirgt zusätzlichen Zustand; Drift ist nicht möglich. Wenn du `approval-mode` ändern möchtest, starte den Daemon mit neuen Settings neu. MCP-Server können jetzt zur Laufzeit über die Mutations-Routen hinzugefügt/entfernt werden (`POST /workspace/mcp/servers`, `DELETE /workspace/mcp/servers/:name`) — siehe [Runtime MCP server management](#runtime-mcp-server-management-issue-4514).

#### Modus 2 — Stage 1.5 `qwen --serve` co-gehostete TUI (nicht in diesem PR)

Wenn Stage 1.5 `qwen --serve` ausliefert (der TUI-Prozess hostet denselben HTTP-Server mit), **existiert** die TUI neben den Remote-Clients. Ein lokaler Operator, der `/approval-mode yolo` oder `/mcp add-server` eingibt, mutiert den Session-State, und Remote-Clients über HTTP haben kein Event, um die Änderung zu beobachten.

In diesem Modus ist die TUI ein **"Super-Client"** — sie beobachtet dieselbe Agent-Konversation wie die Remote-Clients UND kann den Session-State mutieren, was Remote-Clients nicht können. Die Asymmetrie ist:

- ✅ Sowohl TUI als auch Remote-Clients sehen dieselben Agent-Nachrichten, Tool-Calls, File-Diffs und Permission-Prompts.
- ❌ Nur die TUI sieht / mutiert Approval-Mode / Memory / MCP-Server-Liste / Agents / Tools-Allowlist / Auth-State.

**Konsequenz in Modus 2:** Wenn eine Remote-Client-UI versucht, die Session-Settings zu spiegeln, kann sie nach jedem TUI-Slash-Command driften. Remote-Clients sollten **bei Attach / Reconnect den Zustand neu abrufen** (verwende `Last-Event-ID: 0`, um das älteste Event des Rings für Dinge wie `model_switched` abzuspielen); sie sollten sich NICHT auf inkrementelle Events für TUI-seitige Mutationen verlassen.

#### Warum (A) und nicht (B) (Mutationen in die `session_state_changed`-Event-Familie befördern)

(B) ist die ambitioniertere Antwort, bindet Stage 1.5 aber an eine wesentlich größere Wire-Surface, die auch sauber durch das geplante In-Process-Refactoring laufen muss. Wir gehen lieber ehrlich den kleineren Scope. Die Arbeit an der Session-State-Event-Taxonomie — die Aufzählung, welche TUI-Flows by Design nur lokal sind gegenüber denen, die plausibel unter einer zukünftigen Opt-in-(B)-artigen Erweiterung zum Wire befördert werden könnten — wandert nach [#3803](https://github.com/QwenLM/qwen-code/issues/3803), nicht in den Stage-1.5-Code.

### N parallele Sessions teilen sich ein `qwen --acp`-Child

Mehrere Sessions auf demselben Workspace **teilen sich einen `qwen --acp`-Child-Prozess** über die native Multi-Session-Unterstützung des Agents (`packages/cli/src/acp-integration/acpAgent.ts:194: private sessions: Map<string, Session>`). Die Bridge ruft `connection.newSession({cwd, mcpServers})` für jede Session auf — der Agent speichert sie in seiner Sessions-Map und demultiplext die sessionId pro Aufruf.

Konkreter Aufwand bei N=5 Sessions auf demselben Workspace:

| Ressource                            | Pro Session | Bei N=5                      |
| ------------------------------------ | ----------- | ---------------------------- |
| Daemon-Node-Prozess                  | einer       | **30–50 MB** (ein Daemon)    |
| `qwen --acp`-Child                   | geteilt     | **60–100 MB** (ein Child)    |
| MCP-Server-Children                  | pro Session | 3×N wenn Configs abweichen   |
| `FileReadCache` (im-Child-Heap)      | geteilt     | einmal geparst               |
| `CLAUDE.md` / Hierarchie-Memory-Parse| geteilt     | einmal geparst               |
| OAuth-Refresh-Token-State            | geteilt     | **ein Refresh-Pfad**         |
| Auto-Memory gelernte Fakten          | geteilt     | eine Knowledge-Base pro Child|
| Cold Start                           | nur der erste| <200 ms nach der ersten Session|

Die Bridge hält **einen Kanal pro Daemon** offen (ein Daemon pro Workspace, gemäß §02). Der Kanal bleibt am Leben, solange mindestens eine Session aktiv ist; das letzte `killSession` (oder ein Crash auf Kanal-Ebene) beendet das Child.

**MCP-Server-Children** sind heute noch pro Session — die Config jeder Session kann unterschiedliche Server angeben, daher werden sie unabhängig voneinander gespawnt. Stage-1.5-Follow-up: MCP-Server-Children per `(workspace, config-hash)` refcounten, damit identische Configs geteilt werden. Nicht im Scope für diesen PR.

**Peer-Agents (Cursor / Continue / Claude Code / OpenCode / Gemini CLI) setzen alle auf Single-Process-Multi-Session.** qwen-code zieht auf Agent-Ebene gleich; die Stage-1-Bridge in diesem PR macht dieselbe Architektur über HTTP sichtbar.

## Einloggen in einen Remote-Daemon (Issue #4175 PR 21)

Wenn der Daemon auf einem Remote-Pod läuft (keine gemeinsame Anzeige mit dir), kann ein Client einen OAuth-Device-Flow über HTTP auslösen. Der Daemon pollt den IdP selbst; deine Aufgabe ist es nur, eine URL auf einem beliebigen Gerät mit einem Browser zu öffnen.

> [!note]
>
> Die Qwen OAuth Free Tier wurde am 15.04.2026 eingestellt. Die folgenden `qwen-oauth`
> Beispiele dokumentieren die Form des Device-Flow-Protokolls und den Legacy-Provider-Identifier;
> neue Setups sollten einen derzeit unterstützten Auth-Provider verwenden.

```bash
# 1. Starte einen Flow. Der Daemon kontaktiert den IdP und gibt einen Code + eine URL zurück.
curl -X POST http://127.0.0.1:4170/workspace/auth/device-flow \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"providerId":"qwen-oauth"}'
# → 201 {
#     "deviceFlowId": "fa07c61b-…",
#     "userCode": "USER-1",
#     "verificationUri": "https://chat.qwen.ai/api/v1/oauth2/device",
#     "verificationUriComplete": "https://chat.qwen.ai/...?user_code=USER-1",
#     "expiresAt": 1700000600000,
#     "intervalMs": 5000,
#     "attached": false
#   }

# 2. Öffne die URL auf deinem Handy / Laptop und gib den User-Code ein.
# 3. Pollen auf Abschluss (oder SSE für das auth_device_flow_authorized-Event abonnieren):
curl http://127.0.0.1:4170/workspace/auth/device-flow/fa07c61b-… \
  -H "Authorization: Bearer $TOKEN"
# → Status-Übergänge: pending → authorized
```

Das TypeScript-SDK kapselt beide Schritte in einem einzigen Helper:

```ts
import { DaemonClient } from '@qwen-code/sdk';

const client = new DaemonClient({ baseUrl, token });
const flow = await client.auth.start({ providerId: 'qwen-oauth' });
console.log(`Open ${flow.verificationUri}\nCode: ${flow.userCode}`);
const result = await flow.awaitCompletion({ signal: abortCtrl.signal });
// result.status === 'authorized'
```

**Der Daemon öffnet niemals einen Browser in deinem Namen.** Auch bei lokaler Ausführung bleibt der Daemon passiv — er gibt die URL zurück und überlässt es dem SDK / Benutzer, zu entscheiden, wo sie geöffnet wird. Das ist Absicht: Ein Daemon auf einem Headless-Pod, der `xdg-open` aufrufen würde, würde stillschweigend fehlschlagen und die eigentliche Auth-Surface verschleiern. Spiegle die UX von `gh auth login` ("Press Enter to open browser") in deinem Client nach.

**`--require-auth` und Entwickler-Komfort.** Die Device-Flow-Routen verwenden das strikte Mutations-Gate (PR 15), was bedeutet, dass ein Loopback-Default ohne Token `401 token_required` zurückgibt. Lokal ist der einfachste Weg, dies während der Entwicklung zu umgehen, `qwen serve --token=dev-token`; du brauchst `--require-auth` nur, wenn du den Loopback-Default absicherst.

**Daemon-übergreifende Einschränkung.** `oauth_creds.json` wird Daemon-übergreifend geteilt (`~/.qwen/oauth_creds.json`), sodass ein erfolgreicher Login in Daemon A automatisch beim nächsten Token-Refresh von Daemon B übernommen wird — aber die SDK-Clients von Daemon B erhalten nicht das `auth_device_flow_authorized`-Event (Events sind pro Daemon).

**Client-übergreifende Übernahme.** Zwei SDK-Clients auf demselben Daemon, die beide `POST /workspace/auth/device-flow` für denselben Provider aufrufen, erhalten das Pro-Provider-Singleton: Der erste Aufruf startet eine frische IdP-Anfrage und gibt `attached: false` zurück; der zweite Aufruf gibt den BESTEHENDEN In-Flight-Eintrag mit `attached: true` zurück. Die Übernahme wird im Audit-Trail protokolliert (unter der `X-Qwen-Client-Id` des zweiten Clients), emittiert aber KEIN separates Event — beide Clients beobachten schließlich dasselbe `auth_device_flow_authorized`, sobald der Benutzer die IdP-Seite abgeschlossen hat. Wenn deine UI zwischen "Ich habe das gestartet" und "Ich bin dem Flow eines anderen beigetreten" unterscheidet, verzweige basierend auf dem von `start()` zurückgegebenen `attached`-Feld.

## Daemon-Logdatei

`qwen serve` schreibt eine prozessspezifische Diagnose-Logdatei nach:

```
${QWEN_RUNTIME_DIR or ~/.qwen}/debug/daemon/serve-<pid>-<workspaceHash>.log
```

Ein `latest`-Symlink im selben Verzeichnis zeigt immer auf die Logdatei des aktuellen Prozesses, sodass `tail -f ~/.qwen/debug/daemon/latest` dem jeweils laufenden Daemon folgt.

Das Log erfasst Lifecycle-Nachrichten, Route-Fehler (mit `route=`- und `sessionId=`-Kontext), ACP-Child-Stderr und — wenn `QWEN_SERVE_DEBUG=1` gesetzt ist — zusätzliche Bridge-Breadcrumbs. Zeilen, die heute nach Stderr gehen, gehen weiterhin nach Stderr; das Datei-Log ist **additiv**, kein Ersatz.

### Deaktivieren

Setze `QWEN_DAEMON_LOG_FILE=0` (oder `false`/`off`/`no`), um das Datei-Logging vollständig zu überspringen. Die Stderr-Ausgabe bleibt unberührt.

### Beziehung zu Session-Debug-Logs

Session-spezifische Debug-Logs (`~/.qwen/debug/<sessionId>.txt` und der `~/.qwen/debug/latest`-Symlink) sind unabhängig. Das Daemon-Log liegt in einem Geschwister-Unterverzeichnis `daemon/`; die Debug-Semantik pro Session wird durch dieses Feature nicht geändert.

### Keine Rotation

Das Daemon-Log wird unbegrenzt angehängt. Rotiere manuell, wenn es zu groß wird. Eine zukünftige Erweiterung könnte eine automatische Rotation hinzufügen; verfolge dies über die Follow-ups in [#4548](https://github.com/QwenLM/qwen-code/issues/4548).

## Runtime-MCP-Server-Verwaltung (Issue [#4514](https://github.com/QwenLM/qwen-code/issues/4514))

Füge MCP-Server zur Laufzeit hinzu oder entferne sie, ohne den Daemon neu zu starten. Runtime-Einträge leben in einem ephemeren Overlay, das gleichnamige, über Settings definierte Server **beschattet**; die zugrundeliegende `settings.json` / `mcpServers`-Config wird niemals beschrieben.

**Pre-Flight:** Prüfe `caps.features` auf `mcp_server_runtime_mutation`, bevor du eine der beiden Routen aufrufst. Ältere Daemons ohne diesen Tag geben `404` zurück.

### `POST /workspace/mcp/servers` — einen Runtime-MCP-Server hinzufügen

Strikt gegatet (Bearer-Token erforderlich). Verbindet den Server sofort über den aktiven `McpClientManager` und entdeckt dessen Tools.

Request:

```json
{
  "name": "my-server",
  "config": {
    "command": "npx",
    "args": ["-y", "@my-org/mcp-server"]
  }
}
```

`name` muss alphanumerisch sein, plus `_` und `-` (max. 256 Zeichen). `config` ist dasselbe MCP-Server-Konfigurationsobjekt, das in `settings.json` `mcpServers`-Einträgen verwendet wird (transportabhängige Felder: `command`/`args` für stdio, `url` für SSE/HTTP). Sicherheitssensible Felder (`trust`, `env`, `cwd`, `oauth`, `headers`, `authProviderType`, `includeTools`, `excludeTools`, `type`) werden vom Daemon entfernt und ignoriert.

Response (200) — Erfolg:

```json
{
  "name": "my-server",
  "transport": "stdio",
  "replaced": false,
  "shadowedSettings": false,
  "toolCount": 3,
  "originatorClientId": "client-1"
}
```

- `replaced: true` — ein Runtime-Eintrag mit demselben Namen existierte bereits und der Config-Fingerprint weicht ab; alte Verbindung abgebaut, neue aufgebaut. Wenn der Fingerprint übereinstimmt (idempotentes erneutes Hinzufügen), ist `replaced` `false`.
- `shadowedSettings: true` — ein über Settings definierter Server mit demselben Namen existiert; der Runtime-Eintrag beschattet ihn jetzt. Der Settings-Eintrag bleibt unberührt und taucht wieder auf, wenn der Runtime-Eintrag später entfernt wird.
- `toolCount` — Anzahl der auf dem neu verbundenen Server entdeckten Tools.

Response (200) — Soft-Refuse (Budget-Warning-Modus):

```json
{
  "name": "my-server",
  "skipped": true,
  "reason": "budget_warning_only"
}
```

Wird zurückgegeben, wenn `--mcp-budget-mode=warn` gesetzt ist und das Hinzufügen des Servers das konfigurierte `--mcp-client-budget` überschreiten würde. Der Server wird NICHT verbunden. Caller sollten den Budget-Druck dem Benutzer anzeigen.

Fehler:

| Status | Code                      | Wann                                                                                               |
| ------ | ------------------------- | -------------------------------------------------------------------------------------------------- |
| `400`  | `invalid_server_name`     | Name leer, überschreitet 256 Zeichen oder enthält Zeichen außerhalb von `[A-Za-z0-9_-]`            |
| `400`  | `missing_required_field`  | `config` fehlt oder ist kein Nicht-Null-Objekt                                                     |
| `400`  | `invalid_client_id`       | `X-Qwen-Client-Id`-Header vorhanden, aber nicht für diesen Workspace registriert                   |
| `400`  | `invalid_config`          | Config-Form vom MCP-Transport-Validator abgelehnt                                                  |
| `401`  | `token_required`          | Kein Bearer-Token konfiguriert (striktes Gate)                                                     |
| `409`  | `mcp_budget_would_exceed` | `--mcp-budget-mode=enforce` und Budget ist voll                                                    |
| `502`  | `mcp_server_spawn_failed` | Server-Prozess beendet oder Timeout beim Verbinden; Body enthält `serverName`, `exitCode`, `stderr`|
| `503`  | `acp_channel_unavailable` | Kein aktives ACP-Child (es wurde noch keine Session erstellt)                                      |

### `DELETE /workspace/mcp/servers/:name` — einen Runtime-MCP-Server entfernen

Strikt gegatet. Trennt die Verbindung zum Server und entfernt ihn aus dem Runtime-Overlay. Idempotent — das Entfernen eines Namens, der nie hinzugefügt wurde, gibt eine Skip-Response zurück (keinen Fehler).

Der `:name`-Pfadparameter ist der URL-kodierte Servername.

Response (200) — Erfolg:

```json
{
  "name": "my-server",
  "removed": true,
  "wasShadowingSettings": false,
  "originatorClientId": "client-1"
}
```

- `wasShadowingSettings: true` — der entfernte Runtime-Eintrag hatte einen über Settings definierten Server mit demselben Namen beschattet. Dieser Settings-Eintrag ist jetzt nicht mehr beschattet und wird bei der nächsten Discovery / beim nächsten Neustart verwendet.

Response (200) — idempotenter Skip:

```json
{
  "name": "ghost",
  "skipped": true,
  "reason": "not_present"
}
```

Wird zurückgegeben, wenn der Name nicht im Runtime-Overlay war (er kann noch in den Settings existieren — Settings-Einträge können nicht über diese Route entfernt werden).

Fehler:

| Status | Code                      | Wann                                                                          |
| ------ | ------------------------- | ----------------------------------------------------------------------------- |
| `400`  | `invalid_server_name`     | Name leer, überschreitet 256 Zeichen oder enthält Zeichen außerhalb von `[A-Za-z0-9_-]` |
| `400`  | `invalid_client_id`       | `X-Qwen-Client-Id`-Header vorhanden, aber nicht für diesen Workspace registriert        |
| `401`  | `token_required`          | Kein Bearer-Token konfiguriert (striktes Gate)                                      |
| `503`  | `acp_channel_unavailable` | Kein aktives ACP-Child                                                              |

### Shadow-Semantik

Runtime-Einträge bilden ein ephemeres Overlay über den über Settings definierten MCP-Servern:

- **Hinzufügen** eines Runtime-Servers mit demselben Namen wie ein Settings-Eintrag **beschattet** diesen — die Runtime-Config hat Vorrang. Der ursprüngliche Settings-Eintrag wird nicht verändert.
- **Entfernen** eines Runtime-Servers, der einen Settings-Eintrag beschattet hatte, **hebt die Beschattung auf** — die über Settings definierte Config wird bei der nächsten Verbindung wieder aktiv.
- **Daemon-Neustart** verwirft alle Runtime-Einträge. Nur über Settings definierte Server überstehen Neustarts. Runtime-Server sind auf die Lebensdauer der Session beschränkt.
- **`GET /workspace/mcp`** meldet die zusammengeführte Ansicht — sowohl über Settings definierte als auch Runtime-Server erscheinen im `servers[]`-Array. Im Snapshot gibt es heute keine Unterscheidung auf Wire-Ebene zwischen den beiden Ursprüngen.

### Events

Beide Routen emittieren **Workspace-weite** SSE-Events (alle aktiven Session-Busse empfangen sie):

| Event                | Emittiert wenn                | Payload-Felder                                                                         |
| -------------------- | ----------------------------- | -------------------------------------------------------------------------------------- |
| `mcp_server_added`   | `POST` erfolgreich (nicht übersprungen) | `name`, `transport`, `replaced`, `shadowedSettings`, `toolCount`, `originatorClientId` |
| `mcp_server_removed` | `DELETE` erfolgreich (nicht übersprungen) | `name`, `wasShadowingSettings`, `originatorClientId`                                   |
Übersprungene Antworten (`budget_warning_only`, `not_present`) lösen KEINE Events aus.

Budgetbezogene Events aus der bestehenden `mcp_guardrail_events`-Surface (`mcp_budget_warning`, `mcp_child_refused_batch`) werden auch dann ausgelöst, wenn zur Laufzeit hinzugefügte Elemente die Budget-Schwelle überschreiten.

## Nächste Schritte

- **Einen langlaufenden Daemon einrichten?** [Lokale Startvorlagen (systemd / launchd / nohup / tmux)](./qwen-serve-deploy-local.md) für v0.16-alpha (nur lokal).
- **Einen Client entwickeln?** Siehe den [DaemonClient TypeScript Quickstart](../developers/examples/daemon-client-quickstart.md) und die [HTTP-Protokollreferenz](../developers/qwen-serve-protocol.md).
- **Den Quellcode lesen?** Der Bridge-Code befindet sich unter `packages/cli/src/serve/`; der SDK-Client unter `packages/sdk-typescript/src/daemon/`.
- **Die Roadmap verfolgen?** Der Fortschritt von Stage 1.5 / Stage 2 wird in Issue [#3803](https://github.com/QwenLM/qwen-code/issues/3803) verfolgt.