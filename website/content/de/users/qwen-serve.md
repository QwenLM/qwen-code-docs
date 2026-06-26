# Daemon mode (`qwen serve`)

Run Qwen Code as a local HTTP daemon so multiple clients (IDE plugins, web UIs, CI scripts, custom CLIs) share one agent session over HTTP + Server-Sent Events instead of each spawning their own subprocess.

> **🚧 v0.16-alpha**: `qwen serve` first ships to npm in v0.16-alpha as **text-only chat / coding** with **local-only deployment**. Image / file attachments on the prompt path, containerized deployment (Docker / k8s / nginx reverse-proxy), and remote / multi-daemon hardening land in a follow-up patch when an enterprise pilot is committed. See [v0.16-alpha known limits](#v016-alpha-known-limits) for the full deferred list.

> **Status:** Stage 1 (experimental). The protocol surface is locked at the §04 routes table from issue [#3803](https://github.com/QwenLM/qwen-code/issues/3803). Stage 1.5 (`qwen --serve` flag — TUI co-hosts the same HTTP server) and Stage 2 (in-process refactor + `mDNS`/OpenAPI/WebSocket/Prometheus polish) are immediately downstream.
>
> **Scope honesty:** Stage 1 is sized for **developers prototyping clients against the protocol surface** and for **local single-user / small-team collaboration**. Production-grade multi-client / long-running / network-flaky workloads (mobile companions, IM bots reaching 1000+ chats) need Stage 1.5+ guarantees that aren't in this release. See [Stage 1.5+ runtime guarantees](#stage-15-runtime-guarantees) for the full gap list and #3803 for the convergence roadmap.

## What it gives you

- **Built-in Web Shell UI** — `qwen serve` serves the browser-based Web Shell at its root (`http://127.0.0.1:4170/`) out of the box; run `qwen serve --open` to launch it in your browser automatically. It is served on the same origin as the API, so no second port or reverse proxy is needed. Pass `--no-web` for an API-only daemon.
- **One agent process, many clients** — under the default `sessionScope: 'single'`, every client connecting to the daemon shares one ACP session. Live cross-client collaboration on the same conversation, the same file diffs, the same permission prompts.
- **Reconnect-safe streaming** — SSE with `Last-Event-ID` reconnect lets a client drop and pick up exactly where it left off (within the ring's replay window).
- **First-responder permissions** — when the agent asks for permission to run a tool, every connected client sees the request; whichever client answers first wins.
- **One daemon, one workspace** — each `qwen serve` process binds to exactly one workspace at boot (per [#3803](https://github.com/QwenLM/qwen-code/issues/3803) §02). Multi-workspace deployments run one daemon per workspace on separate ports (or behind an orchestrator).
- **Remote runtime control** ([#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 17) — change a session's approval mode (`POST /session/:id/approval-mode`), toggle a tool per workspace (`POST /workspace/tools/:name/enable`), scaffold an empty `QWEN.md` (`POST /workspace/init`, mechanical only — does NOT call the model; for AI-fill, follow up with `POST /session/:id/prompt`), restart a single MCP server with a budget pre-check (`POST /workspace/mcp/:server/restart`), or add/remove MCP servers at runtime without a daemon restart (`POST /workspace/mcp/servers`, `DELETE /workspace/mcp/servers/:name`). All strict-gated — configure `--token` first.
- **Session recap** ([#4175](https://github.com/QwenLM/qwen-code/issues/4175) follow-up) — fetch a one-sentence "where did I leave off" summary of an active session (`POST /session/:id/recap`). Wraps core's `generateSessionRecap` as a side-query against the fast model; pollutes neither the main chat history nor the SSE stream. Non-strict gate (same posture as `/prompt`); SDK helper `client.recapSession(sessionId)`.
  - **Known limit — token-cost amplification:** the route is a pure-cost endpoint (each call is an LLM side-query, no state benefit) and the daemon has no per-route rate limit in v1. On a no-token loopback default a buggy or malicious local client can spam it to burn tokens. Configure `--token` (and optionally `--require-auth`) on shared dev hosts before exposing the daemon.
  - **Concurrent recap safety:** two simultaneous `/recap` calls on the same session run two independent side-queries. `generateSessionRecap` reads a snapshot of the chat history via `GeminiClient.getChat().getHistory()` and feeds it to a separate `BaseLlmClient.generateText` call (via `runSideQuery`); it never appends to or mutates the session's `GeminiChat`. Safe to call from multiple clients without coordination.

## v0.16-alpha known limits

The first npm release of `qwen serve` (v0.16-alpha) is intentionally narrow — text-only chat / coding for developers running the daemon on their own machine. The list below makes the deferred surface explicit so adopters can plan around it; everything here is on the v0.16.x patch roadmap or a near-term follow-up release.

**Product surface — text-only:**

- ✅ Text prompts and text responses (chat, coding, tool calls, MCP integration)
- ❌ **Image / file attachments on the prompt path** — `MessageEmitter` currently only renders text; multimodal echo lands when an alpha target with image needs is committed (#4175 chiga0 #27 P0 item)
- ❌ **Streaming uploads** — same gating as multimodal
**Bereitstellungsoberfläche — nur lokal:**

- ✅ Loopback (`127.0.0.1`, Standard) — keine Authentifizierung erforderlich, geeignet für Entwicklungsarbeitsplätze
- ✅ Lokaler Start über `systemd` / `launchd` / `nohup &` / `tmux` — siehe [Lokale Startvorlagen](./qwen-serve-deploy-local.md)
- ✅ Eigenes Bearer-Token über die Umgebungsvariable `QWEN_SERVER_TOKEN` ([Authentifizierung](#authentication) zur Einrichtung)
- ❌ **Containerisierte Bereitstellung** — Docker / Compose / Kubernetes / nginx-Reverse-Proxy mit TLS-Terminierung NICHT in v0.16-alpha. Wird auf v0.16.x verschoben, sobald ein Enterprise-Pilotprojekt zugesagt ist (würde sonst verrotten, da niemand validiert).
- ❌ **Multi-Daemon-Koordination auf einem Host** — `1 Daemon = 1 Arbeitsbereich × N Sitzungen` wird erzwungen. Hostübergreifende Föderation, token-basierte Instanzpfadschlüssel und Bereinigung veralteter Token werden auf v0.16.x verschoben.
- ❌ **Automatisch generierte Daemon-Tokens** — Alpha verwendet selbst mitgebrachte Tokens (ein `openssl rand -hex 32` entfernt). Auto-Gen + Token-Speicher-Infrastruktur wird auf v0.16.x verschoben.

**Härtung — minimal lebensfähig für lokalen Einzelbenutzer:**

- ✅ Sicherheitstor beim Start (verweigert Bindung außerhalb von Loopback ohne Token, [PR 15 / #4236](https://github.com/QwenLM/qwen-code/pull/4236))
- ✅ Authentifizierungstor für Mutationsrouten, sitzungsspezifische Berechtigungsweiterleitung (Wave-4-PRs)
- ✅ MCP-Schutzmaßnahmen + Koordination von Berechtigungen mehrerer Clients (F2 / F3)
- ✅ **Absolute Prompt-Frist + SSE-Writer-Leerlaufzeitüberschreitung** — optional über `--prompt-deadline-ms` und `--writer-idle-timeout-ms`; angekündigt über `prompt_absolute_deadline` und `writer_idle_timeout`, wenn aktiviert.
- ✅ **HTTP-Ratenbegrenzung** — optional über `--rate-limit` und stufenweise Schwellenwerte; angekündigt über `rate_limit`, wenn aktiviert.
- ⏸️ **Prometheus-Metriken + Lasttest-Framework** — wird auf v0.17 F4 Phase-1 Skaleninstrumentierung verschoben, wenn 30-50 aktive Sitzungen ein ernsthaftes Ziel werden.
- ⏸️ **`--max-body-size` CLI-Flag** — Daemon erzwingt standardmäßig `express.json({ limit: '10mb' })`, was textbasierte Prompts bequem abdeckt (Modell-Kontextfenster liegen deutlich unter 10 MiB Zeichen). Über Flag in v0.16.x einstellbar.

Für die tiefere Aufzählung „Was wir in Phase 1 nicht beheben" (Single-Host-Sitzungszustandsänderungsmodell + N parallele Sitzungen teilen sich ein ACP-Kind), siehe [Phasen-1-Grenzen](#stage-1-scope-boundaries--what-we-wont-fix-in-stage-15) weiter unten.

## Schnellstart

### 1. Daemon starten (Loopback, keine Authentifizierung)

```bash
cd your-project/
qwen serve
# → qwen serve listening on http://127.0.0.1:4170 (mode=http-bridge, workspace=/path/to/your-project)
# → qwen serve: bearer auth disabled (loopback default). Set QWEN_SERVER_TOKEN to enable.
```

Die Standardbindung ist `127.0.0.1:4170`. Die Bearer-Authentifizierung ist auf Loopback **deaktiviert**, damit die lokale Entwicklung „einfach funktioniert". Der Daemon bindet an das aktuelle Arbeitsverzeichnis; verwenden Sie `--workspace /path/to/dir` zum Überschreiben.

**Öffnen Sie die Web-Shell-Benutzeroberfläche.** Rufen Sie `http://127.0.0.1:4170/` auf (oder starten Sie den Daemon mit `qwen serve --open`, um ihn automatisch zu öffnen) für das vollständige Browser-Terminal — Chat, Diffs, Tool-Aufrufe und Berechtigungsabfragen. Die Benutzeroberfläche wird am Daemon-Stammverzeichnis unter derselben Herkunft wie die API bereitgestellt. Der Rest dieser Anleitung verwendet rohes HTTP, damit Sie direkt gegen die API skripten können.

### 2. Auf Richtigkeit prüfen

```bash
curl http://127.0.0.1:4170/health
# → {"status":"ok"}

curl http://127.0.0.1:4170/capabilities
# → {"v":1,"mode":"http-bridge","features":["health","daemon_status","capabilities","session_create",...],"workspaceCwd":"/path/to/your-project"}

curl http://127.0.0.1:4170/daemon/status
# → {"v":1,"detail":"summary","status":"ok","runtime":{...}}
```

Das Feld `workspaceCwd` zeigt den gebundenen Arbeitsbereich an, sodass Clients eine Vorabprüfung durchführen und `cwd` bei `POST /session` weglassen können. Das Feld `limits.maxPendingPromptsPerSession` gibt die aktive Obergrenze für die Prompt-Zulassung pro Sitzung an; `null` bedeutet, dass die Obergrenze deaktiviert ist.

Der Daemon stellt außerdem schreibgeschützte Laufzeitschnappschüsse für Client-Benutzeroberflächen und Betreiber bereit: `GET /daemon/status`, `GET /workspace/mcp`, `GET /workspace/skills`, `GET /workspace/providers`, `GET /workspace/env`, `GET /workspace/preflight`, `GET /session/:id/context`, `GET /session/:id/supported-commands`, `GET /session/:id/tasks` und `GET /session/:id/lsp`.

`GET /session/:id/lsp` gibt einen strukturierten LSP-Status pro Sitzung zurück. Starten Sie den Daemon mit `--experimental-lsp`, um LSP in gestarteten Agentensitzungen zu aktivieren; andernfalls gibt die Route `enabled: false` ohne Server zurück.

`GET /daemon/status` ist der konsolidierte Fehlerbehebungsschnappschuss. Der Standard `detail=summary` liest nur den Daemon-Zustand im Arbeitsspeicher (Sitzungen, Berechtigungen, SSE/ACP-Transportanzahlen, Ratenbegrenzungsablehnungen, Prozessspeicher, aufgelöste Grenzen) und startet das ACP-Kind nicht. Verwenden Sie `GET /daemon/status?detail=full` für sitzungsspezifische Diagnosen, ACP-Verbindungsdetails, Auth-Device-Flow-Zählungen und Arbeitsbereichsstatusabschnitte, wenn Sie aktiv ein Problem untersuchen.

`GET /workspace/mcp`, `GET /workspace/skills` und `GET /workspace/providers` melden die Live-ACP-Laufzeit und starten das ACP-Kind nicht im Leerlauf; ein im Leerlauf befindlicher Daemon gibt `initialized: false` mit einem leeren Schnappschuss zurück. Sobald eine Sitzung aktiv ist, wechseln sie zu `initialized: true` und zeigen den tatsächlichen Zustand an.
`GET /workspace/env` und `GET /workspace/preflight` antworten immer mit
`initialized: true`, unabhängig vom ACP-Status. `env` konsultiert nie den ACP
(nur Daemon-Prozess-Info); `preflight` antwortet mit Daemon-Level-Zellen aus
`process.*` und sendet `status: 'not_started'` Platzhalter für ACP-Level-Zellen,
wenn der Child-Prozess im Leerlauf ist.

`GET /workspace/env` meldet die Laufzeit, Plattform, Sandbox, Proxy des
Daemon-Prozesses und die **Anwesenheit** (niemals den Wert) von whitelisted
geheimen Umgebungsvariablen wie `OPENAI_API_KEY`. Proxy-URLs werden von
Anmeldedaten befreit und auf `host:port` reduziert, bevor sie über die Leitung
gehen. Die Route antwortet immer direkt vom Daemon-Prozess und erzeugt niemals
einen ACP-Child-Prozess.

`GET /workspace/preflight` gibt eine Liste von Bereitschaftsprüfungen zurück.
**Daemon-Level-Zellen** (Node-Version, CLI-Einstieg, Arbeitsverzeichnis,
ripgrep, git, npm) werden immer gerendert. **ACP-Level-Zellen** (Authentifizierung,
MCP-Erkennung, Fähigkeiten, Anbieter, Tool-Registrierung, Egress) erfordern
einen aktiven ACP-Child — wenn der Daemon im Leerlauf ist, senden sie
`status: 'not_started'` Platzhalter, anstatt ACP nur zur Befüllung zu starten.
Fehler werden einem geschlossenen `errorKind`-Enum zugeordnet (`missing_binary`,
`auth_env_error`, `init_timeout`, `protocol_error`, `missing_file`,
`parse_error`, `blocked_egress`), damit Client-Oberflächen strukturierte
Abhilfe rendern können.

Der Daemon stellt auch Arbeitsbereichsdatei-Hilfsfunktionen zur Verfügung:

- `GET /file` liest Textdateien und gibt einen Raw-Byte-`sha256:<hex>`-Hash zurück.
- `GET /file/bytes` liest begrenzte Raw-Byte-Fenster und gibt Base64-Inhalt zurück.
- `POST /file/write` erstellt oder ersetzt Textdateien.
- `POST /file/edit` wendet eine exakte Textersetzung an.

Write/Edit sind **strikte Mutationsrouten**: selbst auf Loopback erfordern sie ein
konfiguriertes Bearer-Token, sonst geben sie `token_required` zurück. Ersetzungen
und Bearbeitungen erfordern den neuesten `expectedHash` von `GET /file` (oder ein
vollständiges Fenster von `GET /file/bytes`). `create` überschreibt niemals.
Explizite Schreibvorgänge auf ignorierte Pfade sind erlaubt, aber protokolliert.
Binäre Schreibvorgänge, delete/move/mkdir und rekursive Elternverzeichniserstellung
sind nicht Teil dieser Oberfläche.

### 3. Open a session

```bash
curl -X POST http://127.0.0.1:4170/session \
  -H 'Content-Type: application/json' \
  -d '{}'
# → {"sessionId":"<uuid>","workspaceCwd":"…","attached":false}
```

`cwd` kann weggelassen werden — die Route greift auf den gebundenen Arbeitsbereich des
Daemons zurück. Wenn ein `cwd` gesendet wird, das nicht mit dem gebundenen
Arbeitsbereich übereinstimmt, wird `400 workspace_mismatch` zurückgegeben (der Daemon
ist an genau einen Arbeitsbereich gebunden; starten Sie einen separaten Daemon für
einen anderen).

Ein zweiter Client, der eine Anfrage an `/session` sendet (mit übereinstimmendem `cwd`
oder ohne), erhält `"attached": true` — sie teilen sich nun den Agenten.

### 4. Subscribe to the event stream (in another terminal first)

```bash
SESSION_ID="<from step 3>"
curl -N http://127.0.0.1:4170/session/$SESSION_ID/events
# → id: 1
#   event: session_update
#   data: {"id":1,"v":1,"type":"session_update","data":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"…"}}}
```

Die `data:`-Zeile ist der **vollständige Event-Envelope** — `{id?, v, type, data, originatorClientId?}` als JSON-String auf einer einzigen Zeile. Die ACP-Nutzlast (der `sessionUpdate`-Block in diesem Beispiel) liegt unter `data` innerhalb dieses Envelopes. Die SSE-Level-`id:`-/`event:`-Zeilen dienen als Komfort für EventSource-Clients; dieselben Werte erscheinen im JSON-Envelope, sodass sie auch von rohen `fetch`-Consumern empfangen werden.

Öffnen Sie dies **bevor** Sie den Prompt senden — der SSE-Replay-Puffer speichert die letzten 8000 Ereignisse, sodass ein später Abonnent via `Last-Event-ID` aufholen kann, aber für den einfachen Fall 'Einen einzelnen Prompt beobachten' ist es am einfachsten, zuerst zu abonnieren und live zu streamen.

Der Stream sendet `session_update` (LLM-Chunks, Tool-Aufrufe, Nutzung), `permission_request` (Tool benötigt Genehmigung), `permission_resolved` (jemand hat abgestimmt), `model_switched`, `model_switch_failed` und die terminalen Frames `session_died` (Agent-Child abgestürzt — SSE wird dann geschlossen) und `client_evicted` (Ihre Warteschlange ist übergelaufen — SSE wird dann geschlossen).

### 5. Send a prompt (back in the original terminal)

```bash
curl -X POST http://127.0.0.1:4170/session/$SESSION_ID/prompt \
  -H 'Content-Type: application/json' \
  -d '{"prompt":[{"type":"text","text":"What does src/main.ts do?"}]}'
# → {"stopReason":"end_turn"}
```

Das `curl -N` aus Schritt 4 gibt die Frames aus, sobald sie eintreffen.

## Authentication

Für alles außer Loopback **müssen** Sie ein Bearer-Token übergeben:

```bash
export QWEN_SERVER_TOKEN="$(openssl rand -hex 32)"
qwen serve --hostname 0.0.0.0 --port 4170
# → boot refuses without QWEN_SERVER_TOKEN
```

Clients senden dann bei jeder Anfrage `Authorization: Bearer $QWEN_SERVER_TOKEN`.
`/health` ist **nur bei Loopback-Bindungen** ausgenommen, damit k8s/Compose-Liveness-Probes
innerhalb des Pods (wo der Daemon auf `127.0.0.1` horcht) keine Anmeldeinformationen
benötigen. Bei Nicht-Loopback-Bindungen (`--hostname 0.0.0.0` usw.) erfordert `/health`
das Token wie jede andere Route — sonst könnte ein Angreifer beliebige Adressen abfragen,
um die Existenz des Daemons zu bestätigen. Verwenden Sie `/capabilities`, um Ihr Token
Ende-zu-Ende zu überprüfen (es erfordert immer Authentifizierung):
> **Abgesicherter Loopback (`--require-auth`).** Das Standardverhalten des Loopbacks ohne Token ist für einen Einzelbenutzer-Laptop in Ordnung, aber unsicher auf gemeinsam genutzten Entwicklungsrechnern, CI-Runnern oder Multi-Tenant-Workstations, wo jeder lokale Benutzer `curl 127.0.0.1:4170` ausführen kann. Verwenden Sie `--require-auth`, um das Bearer-Token für jede Route verpflichtend zu machen – inklusive `/health` und `/capabilities` – selbst wenn nur an `127.0.0.1` gebunden wird. Der Start schlägt ohne Token fehl. Mit gesetztem Flag kann ein **nicht authentifizierter** Client `/capabilities` nicht lesen, um festzustellen, dass Authentifizierung erforderlich ist; die Entdeckungsoberfläche ist der 401-Antwortkörper selbst. Nach der Authentifizierung ist das Tag `caps.features.require_auth` eine Bestätigung nach der Authentifizierung, dass die Bereitstellung gehärtet ist (nützlich für Audit-/Compliance-UIs):

```bash
qwen serve --require-auth --token "$(openssl rand -hex 32)"
# → /health, /capabilities, /session, … alle benötigen Authorization: Bearer …
curl http://127.0.0.1:4170/health
# → 401
curl -H "Authorization: Bearer $TOKEN" http://127.0.0.1:4170/capabilities | jq '.features | index("require_auth")'
# → 13   (oder ein anderer Index – nicht-null nach der Authentifizierung bedeutet, dass das Tag vorhanden ist)
```

```bash
curl -H "Authorization: Bearer $QWEN_SERVER_TOKEN" http://your-host:4170/capabilities
# → {"v":1,"mode":"http-bridge","features":[...],"modelServices":[],"workspaceCwd":"/path/to/your-project"}
# Falscher Token → 401
```

Der Token-Vergleich ist zeitkonstant (SHA-256 + `crypto.timingSafeEqual`); 401-Antworten sind einheitlich bei „fehlendem Header“, „falschem Schema“ und „falschem Token“, sodass ein Seitenkanal sie nicht unterscheiden kann.

## CLI-Flags

| Flag                                    | Standard        | Zweck                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--port <n>`                            | `4170`          | TCP-Port. `0` = vom Betriebssystem zugewiesener temporärer Port.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `--hostname <addr>`                     | `127.0.0.1`     | Binde-Interface. Alles jenseits des Loopbacks erfordert einen Token.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `--token <str>`                         | —               | Bearer-Token. Fallback auf die Umgebungsvariable `QWEN_SERVER_TOKEN` (führende/nachfolgende Leerzeichen werden entfernt – praktisch für `$(cat token.txt)`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `--require-auth`                        | `false`         | Verweigert den Start ohne Bearer-Token, selbst auf Loopback. Härtet den `127.0.0.1`-Standard für gemeinsam genutzte Entwicklungsrechner / CI-Runner / Multi-Tenant-Workstations, auf denen jeder lokale Benutzer auf den Listener zugreifen kann. Startet nur mit gesetztem `--token` oder `QWEN_SERVER_TOKEN`; sperrt auch `/health` hinter dem Bearer.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `--max-sessions <n>`                    | `20`            | Obergrenze für gleichzeitige Live-Sitzungen. Neue `POST /session`-Anfragen, die eine frische Child-Sitzung erzeugen würden, geben `503` (mit `Retry-After: 5`) zurück, wenn die Grenze erreicht ist; Beitritte zu bestehenden Sitzungen werden NICHT gezählt. Setzen Sie `0` zum Deaktivieren. Ausgelegt für Einzelbenutzer-/Kleinteam-Nutzung; erhöhen Sie den Wert, wenn Ihre Bereitstellung ausreichend RAM/FD-Reserven hat (~30–50 MB pro Sitzung).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `--max-pending-prompts-per-session <n>` | `5`             | Sitzungsinterne Obergrenze für Prompts, die von `POST /session/:id/prompt` angenommen, aber noch nicht abgeschlossen sind, einschließlich wartender Prompts und des aktiven Prompts. Die Bridge lehnt Überlauf synchron mit `503`, `Retry-After: 5` und `code: "prompt_queue_full"` ab, bevor sie eine `promptId` zurückgibt. Setzen Sie `0` zum Deaktivieren. `branchSession` serialisiert auf demselben FIFO, zählt aber nicht gegen diese Prompt-Obergrenze.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `--workspace <path>`                    | `process.cwd()` | Absoluter Arbeitsbereichspfad, an den dieser Daemon gebunden ist (gemäß [#3803](https://github.com/QwenLM/qwen-code/issues/3803) §02 – 1 Daemon = 1 Arbeitsbereich). `POST /session`-Anfragen mit einem abweichenden `cwd` geben `400 workspace_mismatch` zurück. Für Multi-Workspace-Bereitstellungen führen Sie einen `qwen serve` pro Arbeitsbereich auf separaten Ports aus.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `--max-connections <n>`                 | `256`           | TCP-Verbindungsbegrenzung auf Listener-Ebene (`server.maxConnections`). Begrenzt die rohe Socket-Anzahl unabhängig von der Sitzungsanzahl – langsame / phantom SSE-Clients werden bei Erreichen der Grenze bereits beim Accept abgewiesen. Erhöhen Sie den Wert zusammen mit `--max-sessions`, wenn Ihre Bereitstellung viele SSE-Abonnenten pro Sitzung erwartet.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `--event-ring-size <n>`                 | `8000`          | SSE-Wiedergabe-Ringtiefe pro Sitzung (#3803 §02 Ziel). Legt den Rückstand fest, der für `GET /session/:id/events` mit `Last-Event-ID: N` verfügbar ist. Größer = mehr Wiederverbindungsspielraum, kostet aber ein paar hundert KB zusätzlichen RAM pro Sitzung. SDK-Clients können zusätzlich eine größere Obergrenze für den Warteschlangenrückstand pro Abonnent für ein bestimmtes Abonnement über `?maxQueued=N` anfordern (Bereich `[16, 2048]`, Standard 256). Daemons senden außerdem einen nicht-terminalen SSE-Frame `slow_client_warning` bei 75 % Warteschlangenfüllung, sodass Clients vor einer Räumung abfließen/neu verbinden können. Pre-Flight `caps.features.slow_client_warning`.                                                                                                                                                                                                                                                                                                                                                                             |
| `--mcp-client-budget <n>`               | —               | Positive Ganzzahl-Obergrenze für live MCP-Clients **pro ACP-Sitzung** (Issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14 v1; PR 23 stuft dies auf pro-Arbeitsbereich um, über den gemeinsamen MCP-Pool). Kombinieren Sie mit `--mcp-budget-mode`. Wenn nicht gesetzt, keine buchhalterische Durchsetzung (aber `GET /workspace/mcp` meldet weiterhin `clientCount`). Unterscheidet sich von claude-code's `MCP_SERVER_CONNECTION_BATCH_SIZE`, das die Startparallelität begrenzt, nicht die Gesamtzahl der Clients. Pre-Flight `caps.features.mcp_guardrails`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `--mcp-budget-mode <m>`                 | `warn` / `off`  | Wie `--mcp-client-budget` durchgesetzt wird. `warn` (Standard, wenn Budget gesetzt): keine Ablehnung, der `budgets[0].status` des Snapshots wechselt bei ≥75 % des Budgets auf `warning`. `enforce`: Verbindungen über der Grenze hinaus werden abgelehnt, die Serverzelle zeigt `disabledReason: 'budget'`, deterministisch nach Deklarationsreihenfolge von `mcpServers`. `off` (Standard, wenn Budget nicht gesetzt): reine Beobachtbarkeit. Der Start lehnt `enforce` ohne Budget ab.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `--http-bridge`                         | `true`          | Stufe 1 Modus: ein `qwen --acp`-Kindprozess pro Daemon (beim Start an einen Arbeitsbereich gebunden, gemäß [#3803](https://github.com/QwenLM/qwen-code/issues/3803) §02); N Sitzungen werden über ACP `newSession()` auf diesen Kindprozess gemultiplext. Stufe 2 native In-Process wird später verfügbar.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `--allow-origin <pat>`                  | —               | T2.4 ([#4514](https://github.com/QwenLM/qwen-code/issues/4514)). Cross-Origin-Zulassungsliste für Browser-WebUI-Clients. Wiederholbar. Jeder Wert ist `*` (beliebiger Ursprung – Start wird verweigert, wenn kein Bearer-Token konfiguriert ist; `--require-auth` auf Loopback wird empfohlen, damit auch `/health` und `/demo` Bearer-geschützt sind, da beide auf Loopback standardmäßig vor der Authentifizierung zugänglich sind) oder eine kanonische URL-Origin (`<scheme>://<host>[:<port>]`, ohne nachgestellten Schrägstrich/Pfad/Userinfo/Query). **Subdomain-Wildcards (`https://*.example.com`) werden bewusst nicht unterstützt** – listen Sie jede Subdomain explizit auf, oder verwenden Sie `*` mit einem konfigurierten Token (und `--require-auth` für vollständige Härtung). Abgeglichene Ursprünge erhalten CORS-Antwortheader (`Access-Control-Allow-Origin`, `Vary: Origin`, Methoden, Header, max-age und exponierte `Retry-After`); nicht abgeglichene Ursprünge erhalten weiterhin einen 403 mit dem gleichen Umschlag wie heute. `Origin: null` (Sandbox-Iframes, file://-Dokumente) wird immer abgelehnt, selbst unter `*`. Pre-Flight via `caps.features.allow_origin`. Loopback-Selbstursprünge sind nicht betroffen. |
| `--web` / `--no-web`                    | `true`          | Bedient die gebaute Web Shell SPA im Stammverzeichnis des Daemons (`GET /`, `/assets/*` und SPA-Deep-Link-Fallback). Die statische Shell wird **vor** der Bearer-Authentifizierung registriert – ein Browser kann keinen Token an eine `<script>`-Subresource oder eine Adressleisten-Navigation anhängen, die Shell trägt keine Geheimnisse, und jede API-Route bleibt unabhängig davon Token-geschützt. Bei Nicht-Loopback-Bindungen gibt eine einzeilige Stderr-Warnung einen Hinweis, dass die UI ohne Authentifizierung erreichbar ist. Verwenden Sie `--no-web` für einen API-only-Daemon. Keine Wirkung, wenn der Build die Web-Shell-Assets auslässt (der Daemon protokolliert einen Breadcrumb und läuft als API-only).                                                                                                                                                                                                                                                                                                                                                 |
| `--open`                                | `false`         | Nachdem der Listener gestartet ist, öffnen Sie die Web Shell im Standardbrowser unter der Daemon-URL (mit angehängtem `#token=` als URL-Fragment, wenn ein Token konfiguriert ist – ein Fragment wird niemals an den Server gesendet, sodass der Token nicht in Zugriffsprotokollen oder Referer-Headern auftaucht). Keine Wirkung bei `--no-web` oder in headless-/CI-/SSH-Umgebungen, in denen kein Browser verfügbar ist.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
> **Dimensionierung der Lastregler.** `--max-sessions` ist das **Kind-Prozess-Limit**.
> Drei weitere Ebenen begrenzen ebenfalls die Last – bei der Dimensionierung für ein
> Deployment mit hoher Parallelität sollten alle zusammen abgestimmt werden:
>
> - **Listener-Ebene**: `--max-connections` / `server.maxConnections=256`
>   begrenzt die rohen TCP-Verbindungen (Backpressure durch langsame Clients).
> - **Abonnenten pro Sitzung**: Der EventBus begrenzt SSE-Abonnenten standardmäßig auf
>   64 pro Sitzung; der 65. Client erhält einen terminalen
>   `stream_error` und wird geschlossen.
> - **Prompt-Zulassungen pro Sitzung**:
>   `--max-pending-prompts-per-session=5` begrenzt die für eine Sitzung angenommenen
>   wartenden + aktiven Prompts. Bei Überlauf wird `503` mit `Retry-After: 5` zurückgegeben.
> - **Rückstand pro Abonnent**: Eine Warteschlange mit 256 Frames pro SSE-Client; ein
>   überlasteter Client erhält einen terminalen `client_evicted`-Frame und wird
>   geschlossen (ein langsamer Verbraucher kann den Daemon nicht blockieren).
>
> Diese Begrenzungen interagieren: `--max-sessions × 64 Abonnenten × 256 Frames`
> ist der worst-case Arbeitsspeicher auf der EventBus-Ebene, während
> `--max-sessions × --max-pending-prompts-per-session` die angenommene
> Prompt-Arbeit auf der Zulassungsebene begrenzt. Die Standarddimensionierung geht von
> Einzelbenutzer-/Kleinteam-Last aus; für Multi-Tenant-Deployments schrittweise erhöhen
> (und RSS beobachten).

> **MCP-Client-Schutzmaßnahmen (Issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14).** Ein Arbeitsbereich, der 30 MCP-Server in `mcpServers` deklariert, startet 30 Clients ohne upstream-Limit, es sei denn, eines wird gesetzt. `--mcp-client-budget=N` begrenzt die Anzahl der aktiven MCP-Clients; `--mcp-budget-mode={enforce,warn,off}` wählt das Verhalten. Standard ist `warn`, wenn ein Budget gesetzt ist (der Snapshot zeigt eine Warnung, aber kein Client wird abgelehnt – nützlich, um den tatsächlichen Fan-out zu messen, bevor die Durchsetzung aktiviert wird). Im Modus `enforce` abgelehnte Server erhalten `disabledReason: 'budget'` in ihrer Server-Zelle, und die Zelle `budgets[0]` zeigt `status: 'error'` + `errorKind: 'budget_exhausted'`. Die Slot-Reservierung erfolgt nach Server-Name und überlebt Wiederverbindungen / Discovery-Timeout – ein abgelehnter Server kann einem gesunden Server keinen Slot wegnehmen.
>
> ⚠️ **v1-Bereich: pro Sitzung, nicht pro Arbeitsbereich.** Jede ACP-Sitzung innerhalb des Daemons hat ihre eigene `Config`/`McpClientManager` (erstellt via `newSessionConfig` pro Sitzung). Das Budget begrenzt aktive MCP-Clients **pro Sitzung**, nicht zusammengefasst über alle Sitzungen im Arbeitsbereich. Der Snapshot unter `GET /workspace/mcp` spiegelt die Ansicht der Bootstrap-Sitzung wider (die Zelle trägt `scope: 'session'` der Transparenz halber). Wenn Sie 5 gleichzeitige ACP-Sitzungen mit `--mcp-client-budget=10` betreiben, können bis zu 50 aktive MCP-Clients im Daemon vorhanden sein – das Limit gilt pro Sitzung. **Wave 5 PR 23 (Shared-MCP-Pool)** führt einen arbeitsbereichsbezogenen Manager ein und erhebt dies zur echten pro-Arbeitsbereich-Durchsetzung.
>
> ```sh
> qwen serve --mcp-client-budget=10 --mcp-budget-mode=warn
> # später, nachdem die Telemetrie Ihre tatsächliche Verteilung gezeigt hat:
> qwen serve --mcp-client-budget=10 --mcp-budget-mode=enforce
> ```
>
> Dies ist **nicht** dasselbe wie claude-code's `MCP_SERVER_CONNECTION_BATCH_SIZE` (das die Start-Parallelität steuert); sie sind orthogonal. PR 23 wird einen echten gemeinsamen MCP-Pool hinzufügen (eine Zelle `scope: 'workspace'` in `budgets[]` zusammen mit der pro-Sitzung-Zelle); PR 14 v1 ist der In-Process-Zähler + sanfte Durchsetzung auf dem bestehenden pro-Sitzung-Manager.
>
> **Push-Ereignisse (Issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14b).** SDK-Clients, die `GET /session/:id/events` abonniert haben, erhalten typisierte Frames, wenn Budgetschwellen überschritten werden – `mcp_budget_warning` (synthetisch, feuert einmal pro Aufwärts-75%-Überschreitung mit Hysterese-Reaktivierung bei 37,5%, beworben via `mcp_guardrail_events`) und `mcp_child_refused_batch` (einmal pro Discovery-Durchlauf im Modus `enforce` zusammengefasst; Länge 1 bei Verweigerung eines lazy-Spawns von `readResource`). Der Snapshot unter `GET /workspace/mcp` bleibt die Quelle der Wahrheit für den Zustand nach Wiederverbindung; Ereignisse sind Änderungskanten. Nützlich für Echtzeit-Dashboards ohne Polling.

## Standard-Bedrohungsmodell für Deployments

- **Nur 127.0.0.1** – Loopback-Bindung, keine Authentifizierung erforderlich.
- **`--hostname 0.0.0.0` erfordert einen Token** – der Start verweigert ohne einen solchen.
- **`LOOPBACK_BINDS` umfasst IPv6** – `::1` und `[::1]` gelten für die No-Token-Regel als Loopback.
- **Host-Header-Whitelist** – bei **Loopback**-Bindungen prüft der Daemon, ob `Host:` mit `localhost:port` / `127.0.0.1:port` / `[::1]:port` / `host.docker.internal:port` übereinstimmt (case-insensitive gemäß RFC 7230 §5.4), um sich gegen DNS-Rebinding zu schützen. **Nicht-Loopback-Bindungen (`--hostname 0.0.0.0`) umgehen absichtlich die Host-Whitelist** – der Betreiber hat die Angriffsfläche gewählt, daher ist das Bearer-Token-Gate die einzige Authentifizierungsschicht; Reverse-Proxies / SNI / Client-Zertifikats-Pinning liegen in der Verantwortung des Betreibers, nicht des Daemons. Wenn Sie Host-basierte Isolierung bei einer Nicht-Loopback-Bindung benötigen, terminieren Sie TLS und prüfen Sie den Host in einem Front-Proxy.
- **CORS verweigert standardmäßig jede Browser-Herkunft** – gibt `403` JSON zurück. Übergeben Sie **`--allow-origin <Muster>`** (wiederholbar, T2.4 #4514), um bestimmte Browser-Herkünfte durchzulassen. Jeder Wert ist entweder das Literal `*` (beliebige Herkunft – der Start verweigert, wenn kein Bearer-Token konfiguriert ist; `--require-auth` auf Loopback wird zur vollständigen Härtung empfohlen, da `/health` und `/demo` standardmäßig auf Loopback vor der Authentifizierung bleiben) oder eine kanonische URL-Herkunft (`<schema>://<host>[:<port>]`, ohne abschließenden Schrägstrich / Pfad / Userinfo). Übereinstimmende Herkünfte erhalten ordnungsgemäße CORS-Antwort-Header (`Access-Control-Allow-Origin: <echoed>`, `Vary: Origin`, plus Standard-Methoden / Header / max-age und exponierte `Retry-After`); nicht übereinstimmende Herkünfte erhalten weiterhin einen 403 mit dem gleichen Envelope wie die Standard-Sperre. `caps.features.allow_origin` wird bedingt angekündigt, damit SDK-/WebUI-Clients vorab prüfen können, ob der Daemon Cross-Origin-Aufrufe akzeptiert, bevor sie diese ausgeben. Beispiel: `qwen serve --allow-origin http://localhost:3000 --allow-origin http://localhost:5173`. Loopback-Selbstherkunftsaufrufe (z. B. die `/demo`-Seite) sind nicht betroffen – ein separater Origin-Strip-Shim behandelt sie unabhängig von `--allow-origin`. **Browser-WebUIs ohne konfiguriertes `--allow-origin`** fallen weiterhin auf die gleichen Stufe-1-Optionen wie zuvor zurück: Paketierung als native Shell (Electron/Tauri) damit kein `Origin`-Header gesendet wird, oder den Daemon mit einem Same-Origin-Reverse-Proxy voranstellen.
- **Gestarteter `qwen --acp`-Kindprozess erbt die Umgebung des Daemons** mit einer expliziten Bereinigung: `QWEN_SERVER_TOKEN` wird vor dem Start des Kindprozesses entfernt (der eigene Bearer des Daemons; der Agent benötigt ihn nicht). Alles andere – `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `QWEN_*` / `DASHSCOPE_API_KEY` / Ihre benutzerdefinierten `modelProviders[].envKey` / usw. – wird durchgereicht, da der Agent diese legitimerweise zur Authentifizierung beim LLM benötigt. **Dies ist beabsichtigt, keine Sandbox.** Der Agent läuft mit der gleichen UID und hat Shell-Tool-Zugriff, sodass alles in `~/.bashrc` / `~/.aws/credentials` / `~/.npmrc` durch Prompt-Injection erreichbar ist. Die Umgebungsweitergabe ist nicht die Sicherheitsgrenze; der Benutzer als Vertrauensanker ist es. Führen Sie `qwen serve` nicht unter einer Identität aus, die Umgebungs-Anmeldeinformationen enthält, die Sie dem Agenten nicht anvertrauen würden.
- **Begrenzte SSE-Warteschlangen pro Abonnent** – ein langsamer Client, der seine Warteschlange überfüllt, erhält einen terminalen `client_evicted`-Frame und wird geschlossen; ein hängender Verbraucher kann den Daemon nicht blockieren.
- **Prompt-Zulassungslimit pro Sitzung** – standardmäßig 5 angenommene, aber nicht abgeschlossene Prompts pro Sitzung. Ein fehlerhafter Client kann keine unbegrenzten Prompt-Promises oder temporären SSE-Wartezeiten für eine Sitzung einreihen.
- **Graceful Shutdown** – SIGINT/SIGTERM entladen die Agent-Kindprozesse, bevor der Listener geschlossen wird (10s Deadline pro Kindprozess).
> ⚠️ **Bekannte Lücke von Stage 1 – Berechtigungen sind daemon-weit, nicht pro Sitzung (BUy4H).** `pendingPermissions` lebt im Daemon-Bereich; jeder Client, der das Bearer-Token besitzt, kann über jede `requestId` für jede ihm sichtbare Sitzung abstimmen (und SSE-`permission_request`-Ereignisse tragen die requestId in ihrer Nutzlast). Dies ist unter dem Single-User-/Klein-Team-Vertrauensmodell akzeptabel, bei dem jeder authentifizierte Client derselbe Mensch oder vertrauenswürdige Mitarbeiter ist. Stage 1.5 wird zu `POST /session/:id/permission/:requestId` + sitzungsbezogener Pending-Map + client-spezifischer Identität wechseln (Must-have #3 aus dem Downstream-Review); bis dahin führen Sie `qwen serve` nicht hinter einem Bearer aus, der mit nicht vertrauenswürdigen Parteien geteilt wird.

> ⚠️ **Bekannte Lücke von Stage 1 – Der Body von `POST /session/:id/prompt` ist auf 10 MB begrenzt (BUy4L).** Multimodale Prompts, die Bilder/PDFs/Audio enthalten und 10 MB überschreiten, schlagen beim Parsen des Bodys fehl, bevor die Routenlogik ausgeführt wird (kein Streaming, kein Abbruch während des Uploads). Workaround: Verkleinern Sie den Inhalt clientseitig oder übergeben Sie einen Pfadverweis und lassen Sie den Agenten die Datei über `readTextFile` lesen. Stage 1.5 wird `multipart/form-data` oder Chunked-Encoding auf `/prompt` akzeptieren, sodass große Prompts nicht an eine Grenze stoßen.

> ⚠️ **Bekannte Lücke von Stage 1 – Phantom-SSE-Verbindungen hinter NAT.** Der Daemon erkennt tote Clients durch TCP-Gegendruck bei Heartbeats (15-Sekunden-Intervall). Ein Client, der OHNE einen TCP-RST verschwindet (z. B. eine NAT-Box, die idlende Flüsse stillschweigend verwirft), hält den Socket auf Kernel-Ebene „am Leben“, bis Node.js' Keepalive-Probes auslaufen – typischerweise ~2 Stunden unter Linux-Standardeinstellungen. Bei `--hostname 0.0.0.0`-Bereitstellungen hinter solchen NATs können sich Phantom-SSE-Verbindungen ansammeln und schließlich die Obergrenze von 256 `server.maxConnections` erreichen.
>
> Setzen Sie [`--writer-idle-timeout-ms <n>`](#deadlines-and-writer-idle-timeout) (Issue [#4514](https://github.com/QwenLM/qwen-code/issues/4514) T2.9), um die Lücke mit einer expliziten Anwendungs-Leerlauffrist zu schließen: Wenn für `n` ms kein Schreibvorgang erfolgreich geflusht wurde, sendet der Daemon einen terminalen `client_evicted`-Frame mit `reason: 'writer_idle_timeout'` und schließt den Stream. Das Flag ist standardmäßig deaktiviert, um den Legacy-Vertrag zu bewahren – Betreiber in Netzwerken, die RSTs verschlucken, sollten einen Wert deutlich über dem 15-Sekunden-Heartbeat-Intervall wählen (z. B. `60000`–`300000`), damit legitime Leerlaufverbindungen nicht entfernt werden, während wirklich hängende Schreiber zeitnah beseitigt werden. Überprüfen Sie vorab mit `caps.features.includes('writer_idle_timeout')` von Ihrem SDK, ob der Daemon dies unterstützt.

### Deadlines und Writer-Idle-Timeout

Issue [#4514](https://github.com/QwenLM/qwen-code/issues/4514) T2.9 bringt zwei opt-in Flags, die die Lücken bei Langzeit-/Remote-Bereitstellungen schließen, die der 15s Heartbeat + AbortSignal nicht abdecken. Beide sind standardmäßig deaktiviert – Single-User-Loopback-Workflows bleiben bitgenau unverändert.

| Flag                           | Env var                             | Default      | Beschreibung                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------ | ----------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--prompt-deadline-ms <n>`     | `QWEN_SERVE_PROMPT_DEADLINE_MS`     | nicht gesetzt | Serverseitige Echtzeit-Obergrenze für einen einzelnen `POST /session/:id/prompt`. Bei Ablauf bricht der Daemon den AbortController des Prompts ab und gibt HTTP `504` mit `{code:"prompt_deadline_exceeded", errorKind:"prompt_deadline_exceeded", deadlineMs:n}` zurück. Ein pro-Prompt-Request-Body-Feld `deadlineMs` kann die effektive Frist VERKÜRZEN, aber niemals verlängern. Capability-Tag (bedingt): `prompt_absolute_deadline`.                                                                                                                                                                                        |
| `--writer-idle-timeout-ms <n>` | `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` | nicht gesetzt | Pro-SSE-Verbindung-Leerlauffrist. Wenn für `n` ms kein Schreibvorgang ERFOLGREICH geflusht wurde – weder ein echtes Ereignis noch der 15s Heartbeat – sendet der Daemon einen terminalen `client_evicted`-Frame mit `data.reason = 'writer_idle_timeout'` (gespiegelt in `data.errorKind`) und schließt den Stream. **Wählen Sie einen Wert deutlich über dem 15s Heartbeat** (z. B. `30000`–`300000`), damit legitime Leerlauf-Streams nicht entfernt werden; Werte `< 15000` WERDEN ansonsten gesunde Leerlaufverbindungen entfernen, bevor der erste Heartbeat ausgelöst wird (nur beabsichtigt für Tests/kurzlebige Entwicklungs-Sessions). Capability-Tag (bedingt): `writer_idle_timeout`. |
Beide Flags akzeptieren eine positive Ganzzahl in Millisekunden; `0`, `NaN`, nicht-ganzzahlige oder negative Werte werden beim Start mit einer klaren Fehlermeldung abgewiesen. Das CLI-Flag hat Vorrang vor der Umgebungsvariable; das explizite `ServeOptions`-Feld (eingebettete Aufrufer) hat Vorrang vor der Umgebungsvariable. SDK-Nutzer sollten vor der Nutzung des jeweiligen Verhaltens das entsprechende Capability-Tag vorab prüfen – Daemons, die älter als dieser PR sind, lassen beide Tags weg und das Feld `deadlineMs` der Anfrage wird stillschweigend ignoriert.

## Multi-Session- & Multi-Workspace-Bereitstellung

Gemäß [#3803](https://github.com/QwenLM/qwen-code/issues/3803) §02 bindet sich jeder `qwen serve`-Prozess beim Start an **einen Workspace**. Innerhalb dieses Workspace multiplext er N Sessions auf einen einzigen `qwen --acp`-Kindprozess über die native Session-Map des Agents – Sessions teilen sich den Kindprozess / den OAuth-Status / den Datei-Lese-Cache / die Hierarchie-Speicher-Parsing.

Um **mehrere Workspaces** zu hosten (ein Benutzer, mehrere Repos; oder mehrere Benutzer auf demselben Host), starten Sie **mehrere Daemon-Prozesse** – einen pro Workspace, jeder auf einem eigenen Port, überwacht von systemd / docker-compose / k8s / einem `qwen-coordinator`-Referenzorchestrator. Der Trade-off ist beabsichtigt: ein Workspace pro Kindprozess bedeutet, dass `loadSettings(cwd)` / OAuth / MCP-Server-Scope an das gebundene Verzeichnis gebunden bleiben und nicht über Anfragen hinweg abdriften.

> **Abonnieren Sie VOR dem Senden von `modelServiceId` beim `attach`.** Wenn ein Client `POST /session` mit einer `modelServiceId` sendet und der Workspace bereits eine Session mit einem anderen Modell ausführt, löst der Daemon einen internen `setSessionModel`-Aufruf aus – Fehler werden NICHT als HTTP-Fehler weitergegeben (die Session bleibt auf ihrem aktuellen Modell betriebsbereit). Das sichtbare Fehlersignal ist ein `model_switch_failed`-Ereignis auf dem SSE-Stream der Session. Wenn Sie `POST /session` aufrufen und erst DANN `GET /session/:id/events` öffnen, verpassen Sie das Fehlerereignis und sprechen stillschweigend mit dem falschen Modell weiter. Öffnen Sie zuerst den SSE-Stream oder übergeben Sie `Last-Event-ID: 0` beim Abonnieren, um das älteste verfügbare Ereignis des Rings abzuspielen.

Um mehrere **Benutzer** zu handhaben (jeder mit eigenem Kontingent, Audit-Log, Sandbox) oder um über die Reichweite eines Prozesses hinaus zu skalieren (Cold-Start-Budget, Dateideskriptor-Anzahl, RSS), starten Sie einen Daemon pro Workspace pro Benutzer hinter einem externen Orchestrator. Dieser Orchestrator (Multi-Tenancy / OIDC / Quota / Audit / k8s) liegt **außerhalb des Rahmens** des qwen-code-Projekts – siehe Issue [#3803](https://github.com/QwenLM/qwen-code/issues/3803) "External Reference Architecture" für die Design-Hinweise.

## Laden und Wiederaufnehmen einer persistierten Session

Der Daemon stellt ACPs `session/load`- und Wiederaufnahme-Fluss über HTTP auf zwei Routen bereit:

| Route                      | Verwendung                                                                                                                                                                                                                                                                                      |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /session/:id/load`   | Der Client hat **keinerlei** Verlauf gerendert (kalte Wiederverbindung, Auswählen-dann-Öffnen). Der Daemon spielt jeden persistierten Durchlauf über SSE ab, sodass Abonnenten das vollständige Transkript sehen. Capability-Tag: `session_load`.                                                                                        |
| `POST /session/:id/resume` | Der Client hat die Durchläufe bereits auf dem Bildschirm und benötigt nur noch das daemon-seitige Handle zurück. Der Modellkontext wird auf der Agentenseite ohne UI-Wiederholung wiederhergestellt – der SSE-Stream bleibt sauber. Capability-Tag: `session_resume` (`unstable_session_resume` bleibt ein veraltetes Alias für ältere Clients). |

Das TypeScript-SDK stellt beide als statische Factory-Methoden auf `DaemonSessionClient` bereit:

```ts
import { DaemonClient, DaemonSessionClient } from '@qwen-code/sdk';

const client = new DaemonClient({ baseUrl: 'http://127.0.0.1:4170' });

// Kalte Wiederverbindung — der Daemon spielt den Verlauf über SSE ab.
const session = await DaemonSessionClient.load(client, 'persisted-id');

// Oder, wenn Ihre UI den Verlauf bereits hat, überspringen Sie die Wiedergabe:
// const session = await DaemonSessionClient.resume(client, 'persisted-id');

for await (const event of session.events()) {
  // Zuerst die abgespielten `session_update`-Frames (nur bei load),
  // dann Live-Ereignisse.
}
```

Überprüfen Sie vor dem Aufruf `caps.features.session_load` / `caps.features.session_resume` – ältere Daemons geben `404` zurück. `unstable_session_resume` wird weiterhin als veraltetes Kompatibilitätsalias angekündigt. Gleichzeitige Anfragen derselben Aktion für dieselbe ID werden zusammengefasst; Cross-Action-Race-Bedingungen (ein `load` und ein `resume` gleichzeitig) führen zu `409 restore_in_progress` mit `Retry-After: 5`. Siehe die [Protokollreferenz](../developers/qwen-serve-protocol.md) für das vollständige Fehler-Envelope.

Hinweis: Die Verlaufswiedergabe ist durch den SSE-Ring begrenzt (standardmäßig 8000 Frames). Lange Verläufe mit gesprächigen Durchläufen können diesen überschreiten – die frühesten Frames werden stillschweigend verworfen. Für sehr lange Sessions bevorzugen Sie `resume` und verlassen Sie sich auf die lokal persistierte UI des Clients.
## Dauerhaftigkeitsmodell

**Sessions sind in Stage 1 bei Daemon-Neustarts weiterhin flüchtig**, aber persistierte Sessions auf der Festplatte können neu geladen werden:

- Ein Absturz eines Kindprozesses veröffentlicht `session_died` und entfernt die Live-Session aus den Maps des Daemons. Die auf der Festplatte persistierte Session **kann** über `POST /session/:id/load` neu geladen werden, wenn ein neuer Agent-Kindprozess startbar ist.
- Ein Neustart des Daemons verliert alle laufenden Live-Sessions. Die persistierten Sessions bleiben auf der Festplatte und können gegen einen neuen Daemon-Prozess geladen werden, vorbehaltlich der gleichen Arbeitsbereich-Bindungsregeln.
- Lange Client-Trennungen (>5 Min. bei einer gesprächigen Runde) können den SSE-Wiedergabering (Standard 8000 Frames) überschreiten — die `Last-Event-ID`-Wiederverbindung gelingt, aber der Zustand kann inkohärent sein. Für mobile Clients / Clients mit unzuverlässigem Netzwerk planen Sie, die SSE bei langen Unterbrechungen neu zu öffnen oder `POST /session/:id/load` aufzurufen, um von der Festplatte wiederzugeben.
- Dateioperationen (`writeTextFile`) sind bei Abstürzen atomar (schreiben-dann-umbenennen); sie sind im Sinne der Wiedergabe nicht bei Daemon-Neustarts atomar — der Dateischreibvorgang wurde entweder ausgeführt oder nicht.

Wenn Ihre Integration eine server-seitige, neustartübergreifende Dauerhaftigkeit benötigt, die über das hinausgeht, was `session/load` abdeckt (z. B. serververwaltete Wiederholungswarteschlangen), benötigen Sie dennoch eine anwendungsbezogene Zustandswiederherstellung. Halten Sie keine langlebigen, neustartempfindlichen Zustände innerhalb der Session des Daemons.

## Stage 1.5+ Laufzeitgarantien

Der Vertrag von Stage 1 ist für das Prototyping dimensioniert. Laut [Überprüfung #3889 chiga0 downstream-consumer](https://github.com/QwenLM/qwen-code/pull/3889#issuecomment-4427875644) sind die folgenden Punkte **nicht** in Stage 1 — produktionsreife Integrationen benötigen Stage 1.5+, bevor sie sich darauf verlassen können:

**Hindernisse für ernsthafte Downstream-Nutzung:**

1. **`loadSession` / `unstable_resumeSession` über HTTP** — ohne dies kann keine Integration einen Absturz eines Kindprozesses oder einen Neustart des Daemons überleben, und auch kein Orchestrator, der den Daemon koordiniert, kann den Zustand wiederherstellen.
2. **Dauerhafte Client-Identität (Pair-Tokens + client-spezifische Widerrufung)** — Stage 1 verwendet einen gemeinsamen Bearer; ein durchgesickertes Token widerruft alle, und `originatorClientId` ist client-selbstdeklariert und nicht vom Daemon aus der authentifizierten Identität gestempelt.

**Zuverlässigkeits-Basislinie:**

3. ~~**Client-initiated Heartbeat-Pfad**~~ — ausgeliefert über [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 9. `POST /session/:id/heartbeat` zeichnet Zeitstempel des zuletzt gesehenen Clients auf dem Daemon auf (Fähigkeits-Tag `client_heartbeat`); SDK-Hilfsfunktionen sind `DaemonClient.heartbeat()` / `DaemonSessionClient.heartbeat()`.
4. **Ereignis `permission_already_resolved`, wenn eine Abstimmung den Erst-Antwort-Wettlauf verliert** — derzeit müssen Benutzeroberflächen den Zustand aus einem `404` ableiten.
5. ~~**Größerer Wiedergabering**~~ — auf 8000 erhöht. **Pro-Session konfigurierbarer Ring** noch offen — mobile / gesprächige Arbeitslasten benötigen möglicherweise pro-Session-Überschreibungen.
6. **Ereignis `slow_client_warning` vor `client_evicted`** — sanfter Gegendruck, damit gutmütige langsame Clients sich selbst drosseln können (Render-Tiefe reduzieren, Chunks verwerfen), bevor sie beendet werden.

**Integrationsergonomie:**

7. **`POST /session/:id/_meta` für IM-ähnlichen Kontext** — pro-Session-Schlüssel-Wert, der an nachfolgende Prompts angehängt wird (Chat-ID, Absender, Thread-ID), ersetzt die pro-Kanal-Improvisation.
8. **Tatsächliche Feature-Aushandlung über `/capabilities`** — `protocol_versions: { acp: '0.14.x', daemon_envelope: 1 }`, damit Clients Abweichungen erkennen können, anstatt auf "unbekannter Frame, ignorieren" zurückzufallen.
9. **Erstklassige Dauerhaftigkeitsdokumentation** (dieser Abschnitt) — bereits oben ausgeliefert.

Die vollständige Konvergenz-Roadmap wird unter [#3803](https://github.com/QwenLM/qwen-code/issues/3803) verfolgt.

## Stage 1-Umfang-Grenzen — was wir in Stage 1.5 nicht beheben werden

Zwei strukturelle Entscheidungen sind explizite Nicht-Ziele für den Haupt-Roadmap von Stage 1 / 1.5 / 2. Wenn Ihr Anwendungsfall von einer der beiden abhängt, planen Sie entsprechend, anstatt auf uns zu warten.

### Session-Zustand ist nur lokale Mutation (laut [LaZzyMan Überprüfung #4270256721](https://github.com/QwenLM/qwen-code/pull/3889#pullrequestreview-4270256721))

Der Stage-1.5-Plan beschreibt die TUI als einen In-Process-EventBus-Abonnenten. In der Praxis **ist die TUI-Benutzeroberfläche strikt größer als das Drahtprotokoll**:

- **Nur lokale Benutzeroberfläche** — die ~15 Ink-Dialogkomponenten (`ModelDialog`, `MemoryDialog`, `PermissionsDialog`, `SessionPicker`, `WelcomeBackDialog`, `FolderTrustDialog`, …) und die `local-jsx`-Schrägstrich-Befehle (`/ide`, `/auth`, `/init`, `/resume`, `/rename`, `/delete`, `/language`, `/arena`, …) rendern terminal-spezifisches Ink-JSX. Remote-Clients über HTTP/SSE können Ink nicht äquivalent rendern, und diese Abläufe erzeugen kein Wire-Event.
- **Session-Zustandsänderungen ohne Wire-Events** — `/approval-mode`, `/memory add`, `/mcp add-server`, `/agents`, `/tools enable/disable`, `/auth`, `/init` (Schreiben von `CLAUDE.md`) ändern alle das Agentenverhalten, aber nur `/model` veröffentlicht derzeit ein Ereignis (`model_switched`).

**Stage-1-Entscheidung — Option (A) aus der Überprüfung**: Erhebe diese Mutationen nicht zu Wire-Events. Die beiden Einsatzmodi haben unterschiedliche Konsequenzen.

#### Modus 1 — headless `qwen serve` (dieser PR)

Im Daemon läuft keine TUI-Shell. Die oben aufgeführten Schrägstrich-Befehle existieren in diesem Modus **nicht** — es gibt keine Terminal-Benutzeroberfläche, von der aus sie ausgegeben werden könnten. Der Session-Zustand ist daher:
- **Boot-time-frozen** für `approval-mode` / `memory` / `agents` / `tools`-Whitelist / `auth` – alle werden aus den Einstellungen + von der Platte geladen, wenn der `qwen --acp`-Kindprozess des Daemons startet; für die Lebensdauer der Sitzung unveränderlich. Per Einstellung definierte MCP-Server sind ebenfalls beim Start eingefroren, aber **zur Laufzeit hinzugefügte Server** (über `POST /workspace/mcp/servers`) können ohne Neustart hinzugefügt oder entfernt werden.
- **Änderbar über HTTP** via `POST /session/:id/model` (veröffentlicht `model_switched`), `POST /workspace/mcp/servers` / `DELETE /workspace/mcp/servers/:name` (veröffentlicht `mcp_server_added` / `mcp_server_removed`) und Berechtigungsabstimmungen (`POST /permission/:requestId`).

**Konsequenz:** Remote-Clients im Headless-Modus sehen den **vollständigen Sitzungszustand**. Kein TUI verbirgt zusätzlichen Zustand; es kann keine Abweichung geben. Wenn Sie `approval-mode` ändern möchten, starten Sie den Daemon mit neuen Einstellungen neu. MCP-Server können jetzt zur Laufzeit über die Mutationsrouten (`POST /workspace/mcp/servers`, `DELETE /workspace/mcp/servers/:name`) hinzugefügt/entfernt werden – siehe [Runtime MCP server management](#runtime-mcp-server-management-issue-4514).

#### Modus 2 — Stufe 1.5 `qwen --serve` gemeinsam gehostetes TUI (nicht in diesem PR)

Wenn Stufe 1.5 `qwen --serve` bereitstellt (TUI-Prozess hostet denselben HTTP-Server mit), **existiert** das TUI neben Remote-Clients. Ein lokaler Bediener, der `/approval-mode yolo` oder `/mcp add-server` eingibt, mutiert den Sitzungszustand, und Remote-Clients auf HTTP haben kein Ereignis, um die Änderung zu beobachten.

In diesem Modus ist das TUI ein **"Super-Client"** – es beobachtet dieselbe Agentenkonversation, die Remote-Clients sehen, UND kann Sitzungszustand mutieren, den Remote-Clients nicht ändern können. Die Asymmetrie ist:

- ✅ Sowohl TUI als auch Remote-Clients sehen dieselben Agentennachrichten, Tool-Aufrufe, Datei-Diffs und Berechtigungsaufforderungen.
- ❌ Nur das TUI sieht/mutiert `approval-mode` / memory / MCP-Serverliste / agents / tools-Whitelist / auth-Zustand.

**Konsequenz in Modus 2:** Wenn ein Remote-Client-UI versucht, Sitzungseinstellungen zu spiegeln, kann es nach jedem TUI-Slash-Befehl abweichen. Remote-Clients sollten **den Zustand beim Verbinden/Wiederverbinden neu abrufen** (verwenden Sie `Last-Event-ID: 0`, um das älteste Ereignis des Rings für Dinge wie `model_switched` wiederzugeben); sie sollten sich NICHT auf inkrementelle Ereignisse für TUI-seitige Mutationen verlassen.

#### Warum (A) und nicht (B) (Mutationen zur Ereignisfamilie `session_state_changed` heraufstufen)

(B) ist die ambitioniertere Antwort, sperrt Stufe 1.5 jedoch in eine erheblich größere Wire-Oberfläche ein, die auch sauber durch die geplante In-Process-Umgestaltung passen muss. Wir gehen lieber ehrlich den kleineren Umfang. Die Taxonomiearbeit für Sitzungszustandsereignisse – Auflistung, welche TUI-Abläufe bewusst nur lokal sind vs. möglicherweise unter einer zukünftigen Opt-in-(B)-Erweiterung auf Wire gebracht werden könnten – wandert zu [#3803](https://github.com/QwenLM/qwen-code/issues/3803), nicht in den Stufe-1.5-Code.

### N parallele Sitzungen teilen sich einen `qwen --acp`-Kindprozess

Mehrere Sitzungen im selben Arbeitsbereich **teilen sich einen `qwen --acp`-Kindprozess** über die native Multi-Sitzungs-Unterstützung des Agenten (`packages/cli/src/acp-integration/acpAgent.ts:194: private sessions: Map<string, Session>`). Die Brücke ruft für jede Sitzung `connection.newSession({cwd, mcpServers})` auf – der Agent speichert sie in seiner Sitzungskarte und demultiplext die Sitzungs-ID pro Aufruf.

Konkrete Kosten bei N=5 Sitzungen im selben Arbeitsbereich:

| Ressource                          | Pro Sitzung | Bei N=5                        |
| ---------------------------------- | ----------- | ------------------------------ |
| Daemon-Node-Prozess                | einer       | **30–50 MB** (ein Daemon)      |
| `qwen --acp`-Kindprozess            | geteilt     | **60–100 MB** (ein Kindprozess)|
| MCP-Server-Kindprozesse            | pro Sitzung | 3×N, wenn Konfigurationen abweichen |
| `FileReadCache` (im Kind-Heap)     | geteilt     | einmal geparst                 |
| `CLAUDE.md` / Hierarchie-Speicher-Parse | geteilt | einmal geparst                 |
| OAuth-Refresh-Token-Zustand        | geteilt     | **ein Refresh-Pfad**           |
| Automatisch gelernte Fakten        | geteilt     | eine Wissensbasis pro Kindprozess |
| Kaltstart                          | nur erster  | <200 ms nach erster Sitzung    |

Die Brücke hält **einen Kanal pro Daemon** (ein Daemon pro Arbeitsbereich, gemäß §02). Der Kanal bleibt aktiv, solange mindestens eine Sitzung läuft; das letzte `killSession` (oder ein Kanalabsturz) beendet den Kindprozess.

**MCP-Server-Kindprozesse** sind heute noch pro Sitzung – die Konfiguration jeder Sitzung kann verschiedene Server angeben, daher werden sie unabhängig gestartet. Stufe-1.5-Nachbereitung: Referenzzählung für MCP-Server-Kindprozesse nach `(Arbeitsbereich, Konfigurations-Hash)`, sodass identische Konfigurationen geteilt werden. Nicht im Umfang dieses PRs.

**Peer-Agenten (Cursor / Continue / Claude Code / OpenCode / Gemini CLI) machen alle Einzelprozess-Mehrfachsitzungen.** qwen-code gleicht ihnen auf der Agentenschicht; die Stufe-1-Brücke in diesem PR macht dieselbe Architektur über HTTP sichtbar.

## Anmelden an einem entfernten Daemon (Issue #4175 PR 21)

Wenn der Daemon auf einem entfernten Pod läuft (kein gemeinsamer Bildschirm mit Ihnen), kann ein Client
einen OAuth-Geräteablauf über HTTP auslösen. Der Daemon fragt den IdP selbst ab; Ihre Aufgabe
ist es lediglich, eine URL auf dem Gerät mit Browser zu öffnen.
> [!note]
>
> Der Qwen OAuth Free-Tier wurde am 15.04.2026 eingestellt. Die `qwen-oauth`-Beispiele unten dokumentieren das Device-Flow-Protokoll und die Legacy-Providerkennung; neue Setups sollten einen derzeit unterstützten Authentifizierungsanbieter verwenden.

```bash
# 1. Starte einen Flow. Der Daemon kontaktiert den IdP, gibt einen Code und eine URL zurück.
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

# 2. Rufe die URL auf deinem Telefon / Laptop auf und gib den Benutzercode ein.
# 3. Frage auf Abschluss ab (oder abonniere SSE auf das Ereignis auth_device_flow_authorized):
curl http://127.0.0.1:4170/workspace/auth/device-flow/fa07c61b-… \
  -H "Authorization: Bearer $TOKEN"
# → Statusübergänge: pending → authorized
```

Das TypeScript SDK fasst beide Schritte in einem einzigen Helfer zusammen:

```ts
import { DaemonClient } from '@qwen-code/sdk';

const client = new DaemonClient({ baseUrl, token });
const flow = await client.auth.start({ providerId: 'qwen-oauth' });
console.log(`Öffne ${flow.verificationUri}\nCode: ${flow.userCode}`);
const result = await flow.awaitCompletion({ signal: abortCtrl.signal });
// result.status === 'authorized'
```

**Der Daemon öffnet niemals einen Browser in deinem Namen.** Selbst bei lokalem Betrieb bleibt der Daemon passiv – er gibt die URL zurück und überlässt es dem SDK/Benutzer, wo sie geöffnet wird. Dies ist bewusst so gewählt: Ein Daemon auf einem headless Pod, der `xdg-open` aufruft, würde stillschweigend fehlschlagen und die eigentliche Authentifizierungsoberfläche verbergen. Spiegele das UX von `gh auth login` („Drücke Enter, um den Browser zu öffnen") in deinem Client.

**`--require-auth` und Entwicklerkomfort.** Die Device-Flow-Routen verwenden das strikte Mutations-Gate (PR 15), was bedeutet, dass ein tokenloser Loopback-Standardfall `401 token_required` zurückgibt. Lokal ist der einfachste Weg während der Entwicklung `qwen serve --token=dev-token`; du brauchst `--require-auth` nicht, es sei denn, du sicherst den Loopback-Standardfall ab.

**Einschränkung zwischen Daemons.** `oauth_creds.json` wird daemonübergreifend geteilt (`~/.qwen/oauth_creds.json`), daher wird ein erfolgreicher Login in Daemon A automatisch von der nächsten Token-Aktualisierung von Daemon B übernommen – aber die SDK-Clients von Daemon B erhalten nicht das Ereignis `auth_device_flow_authorized` (Ereignisse sind pro Daemon).

**Übernahme zwischen Clients.** Zwei SDK-Clients auf demselben Daemon, die beide `POST /workspace/auth/device-flow` für denselben Provider aufrufen, erhalten den pro-Provider-Singleton: Der erste Aufruf startet eine neue IdP-Anfrage und gibt `attached: false` zurück; der zweite Aufruf gibt den BESTEHENDEN laufenden Eintrag mit `attached: true` zurück. Die Übernahme wird im Audit-Log (unter der zweiten Client-ID `X-Qwen-Client-Id`) festgehalten, löst aber KEIN separates Ereignis aus – beide Clients sehen schließlich das GLEICHE Ereignis `auth_device_flow_authorized`, sobald der Benutzer die IdP-Seite abschließt. Wenn deine UI zwischen „Ich habe das gestartet" und „ein Flow, den jemand anderes beigetreten ist" unterscheidet, verzweige anhand des Feldes `attached`, das von `start()` zurückgegeben wird.

## Daemon-Protokolldatei

`qwen serve` schreibt ein prozessspezifisches Diagnoseprotokoll nach:

```
${QWEN_RUNTIME_DIR or ~/.qwen}/debug/daemon/serve-<pid>-<workspaceHash>.log
```

Ein `latest`-Symlink im selben Verzeichnis zeigt immer auf das Protokoll des aktuellen Prozesses, sodass `tail -f ~/.qwen/debug/daemon/latest` den jeweils laufenden Daemon verfolgt.

Das Protokoll erfasst Lebenszyklusmeldungen, Routenfehler (mit `route=`- und `sessionId=`-Kontext), ACP-Child-stderr und – wenn `QWEN_SERVE_DEBUG=1` gesetzt ist – zusätzliche Bridge-Breadcrumbs. Zeilen, die heute nach stderr gehen, gehen weiterhin nach stderr; die Dateiprotokollierung ist **additiv**, kein Ersatz.

### Deaktivieren

Setze `QWEN_DAEMON_LOG_FILE=0` (oder `false`/`off`/`no`), um die Dateiprotokollierung vollständig zu überspringen. Die stderr-Ausgabe ist nicht betroffen.

### Beziehung zu Sitzungs-Debug-Protokollen

Sitzungsbezogene Debug-Protokolle (`~/.qwen/debug/<sessionId>.txt` und der `~/.qwen/debug/latest`-Symlink) sind unabhängig. Das Daemon-Protokoll befindet sich in einem benachbarten `daemon/`-Unterverzeichnis; die prozessspezifischen Debug-Semantiken werden durch diese Funktion nicht geändert.

### Keine Rotation

Das Daemon-Protokoll hängt unbegrenzt an. Rotiere manuell, wenn es groß wird. Eine zukünftige Verbesserung könnte eine automatische Rotation hinzufügen; verfolge den Fortschritt über [#4548](https://github.com/QwenLM/qwen-code/issues/4548).

## Laufzeitverwaltung von MCP-Servern (Issue [#4514](https://github.com/QwenLM/qwen-code/issues/4514))

MCP-Server zur Laufzeit hinzufügen oder entfernen, ohne den Daemon neu zu starten. Laufzeiteinträge leben in einem flüchtigen Overlay, das **gleichnamige**, in den Einstellungen definierte Server überschattet; die zugrunde liegende `settings.json`/`mcpServers`-Konfiguration wird nie geschrieben.

**Vorabprüfung:** Prüfe `caps.features` auf `mcp_server_runtime_mutation`, bevor du eine der Routen aufrufst. Ältere Daemons ohne dieses Tag geben `404` zurück.

### `POST /workspace/mcp/servers` – einen MCP-Server zur Laufzeit hinzufügen
Streng abgeschirmt (Bearer-Token erforderlich). Verbindet den Server sofort über den live `McpClientManager` und entdeckt dessen Tools.

Anfrage:

```json
{
  "name": "my-server",
  "config": {
    "command": "npx",
    "args": ["-y", "@my-org/mcp-server"]
  }
}
```

`name` muss alphanumerisch sein, plus `_` und `-` (maximal 256 Zeichen). `config` ist das gleiche MCP-Server-Konfigurationsobjekt, das in `settings.json` unter `mcpServers`-Einträgen verwendet wird (transportabhängige Felder: `command`/`args` für stdio, `url` für SSE/HTTP). Sicherheitsrelevante Felder (`trust`, `env`, `cwd`, `oauth`, `headers`, `authProviderType`, `includeTools`, `excludeTools`, `type`) werden vom Daemon entfernt und ignoriert.

Antwort (200) — Erfolg:

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

- `replaced: true` — ein Laufzeiteintrag mit demselben Namen existierte bereits und der Konfigurations-Fingerabdruck unterscheidet sich; alte Verbindung abgebaut, neue hergestellt. Wenn der Fingerabdruck übereinstimmt (idempotentes erneutes Hinzufügen), ist `replaced` `false`.
- `shadowedSettings: true` — ein über Einstellungen definierter Server mit demselben Namen existiert; der Laufzeiteintrag überschattet ihn nun. Der Einstellungen-Eintrag bleibt unverändert und taucht wieder auf, wenn der Laufzeiteintrag später entfernt wird.
- `toolCount` — Anzahl der Tools, die auf dem neu verbundenen Server entdeckt wurden.

Antwort (200) — sanfte Ablehnung (Budget-Warnmodus):

```json
{
  "name": "my-server",
  "skipped": true,
  "reason": "budget_warning_only"
}
```

Wird zurückgegeben, wenn `--mcp-budget-mode=warn` gesetzt ist und das Hinzufügen des Servers das konfigurierte `--mcp-client-budget` überschreiten würde. Der Server wird NICHT verbunden. Aufrufer sollten den Budgetdruck dem Benutzer anzeigen.

Fehler:

| Status | Code                      | Wann                                                                                               |
| ------ | ------------------------- | -------------------------------------------------------------------------------------------------- |
| `400`  | `invalid_server_name`     | Name leer, länger als 256 Zeichen oder enthält Zeichen außerhalb von `[A-Za-z0-9_-]`               |
| `400`  | `missing_required_field`  | `config` fehlt oder ist kein nicht-null Objekt                                                     |
| `400`  | `invalid_client_id`       | `X-Qwen-Client-Id`-Header vorhanden, aber nicht für diesen Arbeitsbereich registriert              |
| `400`  | `invalid_config`          | Konfigurationsstruktur vom MCP-Transport-Validator abgelehnt                                       |
| `401`  | `token_required`          | Kein Bearer-Token konfiguriert (streng abgeschirmt)                                                |
| `409`  | `mcp_budget_would_exceed` | `--mcp-budget-mode=enforce` und Budget ist voll                                                    |
| `502`  | `mcp_server_spawn_failed` | Serverprozess während der Verbindung beendet oder Zeitüberschreitung; Body enthält `serverName`, `exitCode`, `stderr` |
| `503`  | `acp_channel_unavailable` | Kein Live-ACP-Kind (es wurde noch keine Sitzung erstellt)                                          |

### `DELETE /workspace/mcp/servers/:name` — Entfernen eines MCP-Servers zur Laufzeit

Streng abgeschirmt. Trennt die Verbindung zum Server und entfernt ihn aus der Laufzeit-Overlay. Idempotent — das Entfernen eines Namens, der nie hinzugefügt wurde, gibt eine Überspring-Antwort (kein Fehler) zurück.

Der `:name`-Pfadparameter ist der URL-kodierte Servername.

Antwort (200) — Erfolg:

```json
{
  "name": "my-server",
  "removed": true,
  "wasShadowingSettings": false,
  "originatorClientId": "client-1"
}
```

- `wasShadowingSettings: true` — der entfernte Laufzeiteintrag überschattete einen über Einstellungen definierten Server mit demselben Namen. Dieser Einstellungen-Eintrag wird nun nicht mehr überschattet und bei der nächsten Erkennung/Neustart verwendet.

Antwort (200) — idempotentes Überspringen:

```json
{
  "name": "ghost",
  "skipped": true,
  "reason": "not_present"
}
```

Wird zurückgegeben, wenn der Name nicht im Laufzeit-Overlay vorhanden war (er kann dennoch in den Einstellungen existieren — Einstellungen-Einträge können nicht über diese Route entfernt werden).

Fehler:

| Status | Code                      | Wann                                                                          |
| ------ | ------------------------- | ----------------------------------------------------------------------------- |
| `400`  | `invalid_server_name`     | Name leer, länger als 256 Zeichen oder enthält Zeichen außerhalb von `[A-Za-z0-9_-]` |
| `400`  | `invalid_client_id`       | `X-Qwen-Client-Id`-Header vorhanden, aber nicht für diesen Arbeitsbereich registriert |
| `401`  | `token_required`          | Kein Bearer-Token konfiguriert (streng abgeschirmt)                                      |
| `503`  | `acp_channel_unavailable` | Kein Live-ACP-Kind                                                             |

### Schatten-Semantik

Laufzeiteinträge bilden ein flüchtiges Overlay über den in den Einstellungen definierten MCP-Servern:

- **Hinzufügen** eines Laufzeitservers mit demselben Namen wie ein Einstellungen-Eintrag **überschattet** diesen – die Laufzeitkonfiguration hat Vorrang. Der ursprüngliche Einstellungen-Eintrag wird nicht geändert.
- **Entfernen** eines Laufzeitservers, der einen Einstellungen-Eintrag überschattete, **hebt die Überschattung auf** – die in den Einstellungen definierte Konfiguration wird bei der nächsten Verbindung wieder aktiv.
- **Daemon-Neustart** entfernt alle Laufzeiteinträge. Nur über Einstellungen definierte Server überleben Neustarts. Laufzeitserver sind an die Sitzungslebensdauer gebunden.
- **`GET /workspace/mcp`** meldet die zusammengeführte Ansicht – sowohl über Einstellungen definierte als auch Laufzeitserver erscheinen im `servers[]`-Array. Es gibt derzeit keine drahtgebundene Unterscheidung zwischen den beiden Ursprüngen im Snapshot.
### Events

Beide Routen emittieren **arbeitsbereichsbezogene** SSE-Ereignisse (alle aktiven Sitzungs-Busse empfangen sie):

| Ereignis               | Ausgelöst wenn                          | Payload-Felder                                                                       |
| ---------------------- | --------------------------------------- | ------------------------------------------------------------------------------------ |
| `mcp_server_added`     | `POST` erfolgreich (nicht übersprungen) | `name`, `transport`, `replaced`, `shadowedSettings`, `toolCount`, `originatorClientId` |
| `mcp_server_removed`   | `DELETE` erfolgreich (nicht übersprungen) | `name`, `wasShadowingSettings`, `originatorClientId`                                   |

Übersprungene Antworten (`budget_warning_only`, `not_present`) lösen KEINE Ereignisse aus.

Budgetbezogene Ereignisse von der bestehenden `mcp_guardrail_events`-Oberfläche (`mcp_budget_warning`, `mcp_child_refused_batch`) werden ebenfalls ausgelöst, wenn Laufzeithinzufügungen die Budgetschwelle überschreiten.

## Nächste Schritte

- **Einen langlebigen Daemon einrichten?** [Lokale Startvorlagen (systemd / launchd / nohup / tmux)](./qwen-serve-deploy-local.md) für v0.16-alpha (nur lokal).
- **Einen Client bauen?** Siehe den [DaemonClient TypeScript-Schnellstart](../developers/examples/daemon-client-quickstart.md) und die [HTTP-Protokollreferenz](../developers/qwen-serve-protocol.md).
- **Den Quellcode lesen?** Der Bridge-Code befindet sich unter `packages/cli/src/serve/`; der SDK-Client unter `packages/sdk-typescript/src/daemon/`.
- **Die Roadmap verfolgen?** Der Fortschritt von Stage 1.5 / Stage 2 wird im Issue [#3803](https://github.com/QwenLM/qwen-code/issues/3803) verfolgt.
