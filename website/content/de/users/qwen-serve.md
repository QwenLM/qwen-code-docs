# Daemon-Modus (`qwen serve`)

Führe Qwen Code als lokalen HTTP-Daemon aus, sodass mehrere Clients (IDE-Plugins, Web-UIs, CI-Skripte, benutzerdefinierte CLIs) eine einzige Agentensitzung über HTTP + Server-Sent Events teilen, anstatt dass jeder seinen eigenen Unterprozess startet.

> **🚧 v0.16-alpha**: `qwen serve` wird erstmals in v0.16-alpha auf npm ausgeliefert als **reiner Text-Chat / Coding** mit **lokalem Deployment**. Bild-/Dateianhänge auf dem Prompt-Pfad, containerisiertes Deployment (Docker / k8s / nginx-Reverse-Proxy) sowie Remote-/Multi-Daemon-Härtung folgen in einem nachgelagerten Patch, sobald ein Enterprise-Pilot zugesagt ist. Siehe [v0.16-alpha bekannte Grenzen](#v016-alpha-bekannte-grenzen) für die vollständige Liste der zurückgestellten Funktionen.

> **Status:** Stufe 1 (experimentell). Die Protokolloberfläche ist auf der Routentabelle §04 aus Issue [#3803](https://github.com/QwenLM/qwen-code/issues/3803) festgelegt. Stufe 1.5 (`qwen --serve`-Flag – TUI hostet denselben HTTP-Server) und Stufe 2 (Refactoring in-Prozess + `mDNS`/OpenAPI/WebSocket/Prometheus-Verfeinerung) folgen unmittelbar.
>
> **Ehrlichkeit beim Umfang:** Stufe 1 ist ausgelegt für **Entwickler, die Clients gegen die Protokolloberfläche prototypen** und für **lokale Einzelbenutzer-/Kleinteam-Kollaboration**. Produktionstaugliche Multi-Client-/Langzeit-/Netzwerk-Flaky-Workloads (Mobile Companions, IM-Bots mit 1000+ Chats) benötigen Garantien ab Stufe 1.5+, die in diesem Release nicht enthalten sind. Siehe [Stufe-1.5+-Laufzeitgarantien](#stufe-15-laufzeitgarantien) für die vollständige Lückenliste und #3803 für den Konvergenz-Fahrplan.

## Was es dir bietet

- **Integrierte Web-Shell-UI** — `qwen serve` stellt die browserbasierte Web-Shell an ihrem Root (`http://127.0.0.1:4170/`) standardmäßig aus; starte `qwen serve --open`, um sie automatisch im Browser zu öffnen. Sie wird auf der gleichen Origin wie die API ausgeliefert, daher ist kein zweiter Port oder Reverse-Proxy nötig. Übergib `--no-web` für einen API-only-Daemon.
- **Ein Agentenprozess, viele Clients** — unter dem standardmäßigen `sessionScope: 'single'` teilen sich alle Clients, die mit dem Daemon verbinden, eine ACP-Sitzung. Live-Client-übergreifende Zusammenarbeit an derselben Konversation, denselben Datei-Diffs, denselben Berechtigungsanfragen.
- **Wiederverbindungssicheres Streaming** — SSE mit `Last-Event-ID`-Wiederverbindung ermöglicht einem Client, genau dort weiterzumachen, wo er aufgehört hat (innerhalb des Ring-Wiederholungsfensters).
- **First-Responder-Berechtigungen** — wenn der Agent um Erlaubnis zur Ausführung eines Tools bittet, sehen alle verbundenen Clients die Anfrage; der Client, der zuerst antwortet, gewinnt.
- **Ein Daemon, ein Workspace** — jeder `qwen serve`-Prozess bindet sich beim Start an genau einen Workspace (gemäß [#3803](https://github.com/QwenLM/qwen-code/issues/3803) §02). Multi-Workspace-Deployments führen einen Daemon pro Workspace auf separaten Ports (oder hinter einem Orchestrator) aus.
- **Remote-Laufzeitsteuerung** ([#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 17) — Ändere den Genehmigungsmodus einer Sitzung (`POST /session/:id/approval-mode`), schalte ein Tool pro Workspace um (`POST /workspace/tools/:name/enable`), erstelle ein leeres `QWEN.md` (`POST /workspace/init`, nur mechanisch – ruft das Modell NICHT auf; für KI-Befüllung folge mit `POST /session/:id/prompt`), starte einen einzelnen MCP-Server mit Budget-Vorprüfung neu (`POST /workspace/mcp/:server/restart`) oder füge/entferne MCP-Server zur Laufzeit ohne Neustart des Daemons (`POST /workspace/mcp/servers`, `DELETE /workspace/mcp/servers/:name`). Alle streng geschützt – konfiguriere zuerst `--token`.
- **Sitzungs-Zusammenfassung** ([#4175](https://github.com/QwenLM/qwen-code/issues/4175) Folgearbeit) — Rufe eine einzeilige „Wo habe ich aufgehört"-Zusammenfassung einer aktiven Sitzung ab (`POST /session/:id/recap`). Kapselt das `generateSessionRecap` des Kerns als Nebenabfrage gegen das schnelle Modell; verunreinigt weder den Haupt-Chat-Verlauf noch den SSE-Stream. Nicht-strikte Schranke (gleiche Haltung wie `/prompt`); SDK-Hilfsfunktion `client.recapSession(sessionId)`.
  - **Bekannte Grenze – Token-Kostenverstärkung:** Die Route ist ein reiner Kosten-Endpunkt (jeder Aufruf ist eine LLM-Nebenabfrage, kein Zustandsnutzen) und der Daemon hat in v1 keine Pro-Route-Ratenbegrenzung. Bei einem standardmäßigen No-Token-Loopback kann ein fehlerhafter oder bösartiger lokaler Client es spammern, um Token zu verbrauchen. Konfiguriere `--token` (und optional `--require-auth`) auf gemeinsam genutzten Entwicklungs-Hosts, bevor du den Daemon freigibst.
  - **Gleichzeitige Recap-Sicherheit:** Zwei gleichzeitige `/recap`-Aufrufe auf derselben Sitzung führen zwei unabhängige Nebenabfragen durch. `generateSessionRecap` liest einen Snapshot des Chat-Verlaufs über `GeminiClient.getChat().getHistory()` und übergibt ihn an einen separaten `BaseLlmClient.generateText`-Aufruf (über `runSideQuery`); es hängt niemals etwas an die `GeminiChat`-Sitzung an oder mutiert sie. Sicher von mehreren Clients ohne Koordination aufzurufen.

## v0.16-alpha bekannte Grenzen

Die erste npm-Release von `qwen serve` (v0.16-alpha) ist bewusst schmal gehalten – text-only Chat / Coding für Entwickler, die den Daemon auf ihrer eigenen Maschine ausführen. Die Liste unten macht die zurückgestellte Oberfläche explizit, damit Adoptoren entsprechend planen können; alles hier ist auf dem v0.16.x-Patch-Fahrplan oder in einer baldigen Folgeveröffentlichung.

**Produktoberfläche – text-only:**

- ✅ Text-Prompts und Text-Antworten (Chat, Coding, Tool-Aufrufe, MCP-Integration)
- ❌ **Bild-/Dateianhänge auf dem Prompt-Pfad** — `MessageEmitter` rendert derzeit nur Text; multimodales Echo erscheint, wenn ein Alpha-Ziel mit Bildbedarf zugesagt ist (#4175 chiga0 #27 P0-Element)
- ❌ **Streaming-Uploads** — gleiche Einschränkung wie multimodal

**Deployment-Oberfläche – nur lokal:**

- ✅ Loopback (`127.0.0.1`, Standard) — keine Authentifizierung erforderlich, geeignet für Entwicklungs-Workstations
- ✅ Lokaler Start via `systemd` / `launchd` / `nohup &` / `tmux` — siehe [Lokale Startvorlagen](./qwen-serve-deploy-local.md)
- ✅ Bereitstellung eines eigenen Bearer-Tokens über die Umgebungsvariable `QWEN_SERVER_TOKEN` ([Authentifizierung](#authentifizierung) für Einrichtung)
- ❌ **Containerisiertes Deployment** — Docker / Compose / Kubernetes / nginx-Reverse-Proxy mit TLS-Terminierung NICHT in v0.16-alpha. Verschoben auf v0.16.x, sobald ein Enterprise-Pilot zugesagt ist (würde sonst verrotten, da niemand validiert).
- ❌ **Multi-Daemon-Koordination auf einem Host** — `1 Daemon = 1 Workspace × N Sitzungen` wird erzwungen. Host-übergreifende Föderation, Instanzpfad-Token-Schlüsselvergabe und Bereinigung abgelaufener Tokens werden auf v0.16.x verschoben.
- ❌ **Automatisch generierte Daemon-Tokens** — Alpha ist BYO-Token (ein `openssl rand -hex 32` entfernt). Auto-Gen + Token-Speicher-Infrastruktur werden auf v0.16.x verschoben.

**Härtung – minimal lebensfähig für lokalen Einzelbenutzer:**

- ✅ Boot-Zeit-Sicherheitsschranke (verweigert Non-Loopback-Bindung ohne Token, [PR 15 / #4236](https://github.com/QwenLM/qwen-code/pull/4236))
- ✅ Mutations-Routen-Auth-Schranke, sitzungsspezifische Berechtigungsweiterleitung (Wave 4 PRs)
- ✅ MCP-Schutzmaßnahmen + Multi-Client-Berechtigungskoordination (F2 / F3)
- ✅ **Absolute Prompt-Deadline + SSE-Writer-Idle-Timeout** — opt-in via `--prompt-deadline-ms` und `--writer-idle-timeout-ms`; beworben durch `prompt_absolute_deadline` und `writer_idle_timeout`, wenn aktiviert.
- ✅ **HTTP-Ratenbegrenzung** — opt-in via `--rate-limit` und pro-Stufe-Schwellenwerte; beworben durch `rate_limit`, wenn aktiviert.
- ⏸️ **Prometheus-Metriken + Lasttest-Harness** — verschoben auf v0.17 F4 Phase-1-Skalierungsinstrumentierung, wenn 30–50 aktive Sitzungen ein reales Ziel werden.
- ⏸️ **`--max-body-size`-CLI-Flag** — der Daemon erzwingt standardmäßig `express.json({ limit: '10mb' })`, was Text-Only-Prompts bequem abdeckt (Modell-Kontextfenster sind weit unter 10 MiB Zeichen). Über Flag in v0.16.x einstellbar.

Für die tiefere „Was wir in Stufe 1 nicht beheben werden"-Aufzählung (Single-Host-Sitzungszustands-Mutationsmodell + N-Parallel-Sitzungen, die sich ein ACP-Kind teilen), siehe [Stufe 1 Umfangsgrenzen](#stufe-1-umfangsgrenzen--was-wir-in-stufe-15-nicht-beheben-werden) unten.

## Kurzanleitung

### 1. Daemon starten (Loopback, ohne Auth)

```bash
cd your-project/
qwen serve
# → qwen serve listening on http://127.0.0.1:4170 (mode=http-bridge, workspace=/path/to/your-project)
# → qwen serve: bearer auth disabled (loopback default). Set QWEN_SERVER_TOKEN to enable.
```

Die Standardbindung ist `127.0.0.1:4170`. Bearer-Auth ist **aus** auf Loopback, damit lokale Entwicklung „einfach funktioniert". Der Daemon bindet sich an das aktuelle Arbeitsverzeichnis; verwende `--workspace /path/to/dir`, um es zu überschreiben.

**Öffne die Web-Shell-UI.** Rufe `http://127.0.0.1:4170/` auf (oder starte den Daemon mit `qwen serve --open`, um ihn automatisch zu öffnen) für das vollständige Browser-Terminal — Chat, Diffs, Tool-Aufrufe und Berechtigungsanfragen. Die UI wird auf der Daemon-Root auf der gleichen Origin wie die API ausgeliefert. Der Rest dieser Anleitung verwendet rohes HTTP, damit du direkt gegen die API skripten kannst.

### 2. Auf Funktion prüfen

```bash
curl http://127.0.0.1:4170/health
# → {"status":"ok"}

curl http://127.0.0.1:4170/capabilities
# → {"v":1,"mode":"http-bridge","features":["health","daemon_status","capabilities","session_create",...],"workspaceCwd":"/path/to/your-project"}

curl http://127.0.0.1:4170/daemon/status
# → {"v":1,"detail":"summary","status":"ok","runtime":{...}}
```

Das Feld `workspaceCwd` zeigt den gebundenen Workspace an, sodass Clients einen Vorab-Check durchführen und `cwd` bei `POST /session` weglassen können.
Das Feld `limits.maxPendingPromptsPerSession` gibt das aktive Pro-Sitzungs-Prompt-Aufnahme-Limit an; `null` bedeutet, dass die Begrenzung deaktiviert ist.

Der Daemon bietet auch schreibgeschützte Laufzeit-Snapshots für Client-UIs und Betreiber: `GET /daemon/status`, `GET /workspace/mcp`,
`GET /workspace/skills`, `GET /workspace/providers`, `GET /workspace/env`,
`GET /workspace/preflight`,
`GET /session/:id/status`, `GET /session/:id/context`,
`GET /session/:id/supported-commands` und
`GET /session/:id/tasks`, sowie `GET /session/:id/lsp`.

`GET /session/:id/status` gibt die Live-Bridge-Zusammenfassung für eine einzelne Sitzung zurück:
`sessionId`, `workspaceCwd`, `createdAt`, optional `displayName`, `clientCount`
und `hasActivePrompt`. Es antwortet mit `200` und der Zusammenfassung, wenn der Daemon eine Live-Sitzung mit dieser ID hält,
und mit `404` (Body `{ "error": …, "sessionId": … }`) sonst. Verwende es, um abzufragen, ob eine bekannte Sitzung noch läuft
(`hasActivePrompt`) oder wie viele Clients verbunden sind (`clientCount`), ohne die gesamte paginierte Sitzungsliste abzurufen und zu durchsuchen:

```bash
curl http://127.0.0.1:4170/session/$SESSION_ID/status
# → {"sessionId":"…","workspaceCwd":"…","createdAt":"…","clientCount":1,"hasActivePrompt":false}
```

Dies ist die rohe Live-Sitzungsansicht, daher stimmen `clientCount` und `hasActivePrompt`
mit dem entsprechenden Eintrag in `GET /workspace/:id/sessions` überein – aber die beiden Routen sind nicht byte-identisch.
Der Listen-Endpunkt reichert jedes Element mit persistenten Sitzungs-Speicherdaten an: sein `createdAt` ist die persistierte Zeit des ersten Prompts,
und er fügt `updatedAt` sowie einen `displayName` hinzu, der aus dem gespeicherten Titel oder dem ersten Prompt abgeleitet wird.
`/status` hingegen meldet das eigene `createdAt` der Live-Sitzung, lässt `updatedAt` weg und gibt `displayName` nur zurück,
wenn einer auf der Live-Sitzung gesetzt ist.

`GET /session/:id/lsp` gibt strukturierten Pro-Sitzung-LSP-Status zurück. Starte den Daemon mit `--experimental-lsp`,
um LSP in gestarteten Agentensitzungen zu aktivieren; andernfalls gibt die Route `enabled: false` ohne Server zurück.

`GET /daemon/status` ist der konsolidierte Fehlerbehebungs-Snapshot. Der Standard `detail=summary` liest nur den In-Memory-Daemon-Status
(Sitzungen, Berechtigungen, SSE/ACP-Transportzahlen, Ratenbegrenzungs-Ablehnungen, Prozessspeicher, aufgelöste Limits)
und startet das ACP-Kind nicht. Verwende `GET /daemon/status?detail=full` für
Pro-Sitzung-Diagnosen, ACP-Verbindungsdetails, Auth-Device-Flow-Zahlen und Workspace-Statusabschnitte,
wenn du aktiv ein Problem untersuchst.

`GET /workspace/mcp`, `GET /workspace/skills` und `GET /workspace/providers`
melden die Live-ACP-Laufzeit und starten das ACP-Kind nicht im Leerlauf;
ein untätiger Daemon gibt `initialized: false` mit einem leeren Snapshot zurück. Sobald eine Sitzung aktiv ist,
wechseln sie zu `initialized: true` und zeigen den echten Zustand an.

`GET /workspace/env` und `GET /workspace/preflight` antworten immer mit
`initialized: true`, unabhängig vom ACP-Zustand. `env` konsultiert nie ACP
(nur Daemon-Prozessinformationen); `preflight` antwortet mit Daemon-Ebene-Zellen aus
`process.*` und gibt für ACP-Ebene-Zellen `status: 'not_started'`-Platzhalter aus, wenn das Kind untätig ist.

`GET /workspace/env` meldet die Laufzeit, Plattform, Sandbox, Proxy des Daemon-Prozesses und
das **Vorhandensein** (niemals den Wert) von zugelassenen geheimen Umgebungsvariablen
wie `OPENAI_API_KEY`. Proxy-URLs werden von Anmeldeinformationen befreit und auf
`host:port` reduziert, bevor sie auf die Leitung kommen. Die Route antwortet immer direkt vom Daemon-Prozess
und startet niemals ein ACP-Kind.

`GET /workspace/preflight` gibt eine Liste von Bereitschaftsprüfungen zurück. **Daemon-Ebene-Zellen**
(Node-Version, CLI-Einstieg, Workspace-Verzeichnis, ripgrep, git, npm)
werden immer gerendert. **ACP-Ebene-Zellen** (Auth, MCP-Erkennung, Skills, Provider,
Tool-Registry, Egress) erfordern ein Live-ACP-Kind — wenn der Daemon untätig ist, geben sie
`status: 'not_started'`-Platzhalter aus, anstatt ACP nur zur Befüllung zu starten. Fehler werden einem geschlossenen
`errorKind`-Enum zugeordnet (`missing_binary`, `auth_env_error`, `init_timeout`, `protocol_error`, `missing_file`,
`parse_error`, `blocked_egress`), damit Client-UIs strukturierte Behebungsvorschläge rendern können.

Der Daemon bietet auch Workspace-Datei-Hilfsfunktionen:

- `GET /file` liest Textdateien und gibt einen Raw-Byte-`sha256:<hex>`-Hash zurück.
- `GET /file/bytes` liest begrenzte Raw-Byte-Fenster und gibt Base64-Inhalt zurück.
- `POST /file/write` erstellt oder ersetzt Textdateien.
- `POST /file/edit` wendet eine exakte Textersetzung an.

Write/Edit sind **strenge Mutationsrouten**: Auch auf Loopback erfordern sie ein konfiguriertes Bearer-Token,
andernfalls geben sie `token_required` zurück. Ersetzungen und Bearbeitungen erfordern den neuesten `expectedHash` von `GET /file`
(oder ein vollständiges Fenster von `GET /file/bytes`). `create` überschreibt niemals.
Explizite Schreibvorgänge in ignorierte Pfade sind erlaubt, werden aber protokolliert.
Binäre Schreibvorgänge, Löschen/Verschieben/mkdir und rekursive Eltern-Erstellung sind nicht Teil dieser Oberfläche.

### 3. Eine Sitzung öffnen

```bash
curl -X POST http://127.0.0.1:4170/session \
  -H 'Content-Type: application/json' \
  -d '{}'
# → {"sessionId":"<uuid>","workspaceCwd":"…","attached":false}
```

`cwd` kann weggelassen werden – die Route fällt auf den gebundenen Workspace des Daemons zurück. Das Senden eines `cwd`, das nicht mit dem gebundenen Workspace übereinstimmt, gibt `400 workspace_mismatch` zurück (der Daemon ist an genau einen Workspace gebunden; starte einen separaten Daemon für einen anderen).

Ein zweiter Client, der an `/session` postet (mit übereinstimmendem `cwd` oder ohne), erhält `"attached": true` – sie teilen sich jetzt den Agenten.

### 4. Den Ereignis-Stream abonnieren (zuerst in einem anderen Terminal)

```bash
SESSION_ID="<aus Schritt 3>"
curl -N http://127.0.0.1:4170/session/$SESSION_ID/events
# → id: 1
#   event: session_update
#   data: {"id":1,"v":1,"type":"session_update","data":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"…"}}}
```

Die `data:`-Zeile ist der **vollständige Ereignis-Envelope** — `{id?, v, type, data, originatorClientId?}` — als JSON-String auf einer einzelnen Zeile. Die ACP-Nutzlast (der `sessionUpdate`-Block in diesem Beispiel) liegt innerhalb dieses Envelopes unter `data`. Die SSE-Level-Zeilen `id:` / `event:` sind eine Bequemlichkeit für EventSource-Clients; die gleichen Werte erscheinen im JSON-Envelope, damit auch Raw-`fetch`-Consumer sie erhalten.

Öffne dies **bevor** du den Prompt sendest — der SSE-Wiederholungspuffer hält die letzten 8000 Ereignisse, sodass ein später Abonnent über `Last-Event-ID` aufholen kann, aber für den einfachen „Einzel-Prompt beobachten"-Fall ist es am einfachsten, zuerst zu abonnieren und dann live streamen zu lassen.

Der Stream sendet `session_update` (LLM-Chunks, Tool-Aufrufe, Nutzung),
`permission_request` (Tool benötigt Genehmigung), `permission_resolved`
(jemand hat abgestimmt), `model_switched`, `model_switch_failed` sowie die terminalen Frames
`session_died` (Agent-Kind abgestürzt — SSE schließt dann) und
`client_evicted` (deine Warteschlange ist übergelaufen — SSE schließt dann).

### 5. Einen Prompt senden (zurück im ursprünglichen Terminal)

```bash
curl -X POST http://127.0.0.1:4170/session/$SESSION_ID/prompt \
  -H 'Content-Type: application/json' \
  -d '{"prompt":[{"type":"text","text":"What does src/main.ts do?"}]}'
# → {"stopReason":"end_turn"}
```

Das `curl -N` aus Schritt 4 wird die Frames ausgeben, sobald sie eintreffen.

## Authentifizierung

Für alles, was über Loopback hinausgeht, **musst** du ein Bearer-Token übergeben:

```bash
export QWEN_SERVER_TOKEN="$(openssl rand -hex 32)"
qwen serve --hostname 0.0.0.0 --port 4170
# → Start verweigert ohne QWEN_SERVER_TOKEN
```

Clients senden dann `Authorization: Bearer $QWEN_SERVER_TOKEN` bei jeder Anfrage. `/health` ist **nur auf Loopback-Bindungen** ausgenommen, damit k8s/Compose-Health-Checks innerhalb des Pods (wo der Daemon auf `127.0.0.1` hört) keine Anmeldeinformationen benötigen. Auf Non-Loopback-Bindungen (`--hostname 0.0.0.0` usw.) erfordert `/health` das Token wie jede andere Route — andernfalls könnte ein Angreifer beliebige Adressen abfragen, um die Existenz des Daemons zu bestätigen. Verwende `/capabilities`, um dein Token Ende-zu-Ende zu verifizieren (es erfordert immer Auth):

> **Gehärteter Loopback (`--require-auth`).** Das standardmäßige Loopback-Ohne-Token-Verhalten ist für einen Einzelbenutzer-Laptop in Ordnung, aber unsicher auf gemeinsam genutzten Entwicklungs-Hosts, CI-Runnern oder Multi-Tenant-Workstations, wo jeder lokale Benutzer `curl 127.0.0.1:4170` ausführen kann. Übergib `--require-auth`, um das Bearer-Token auf jeder Route obligatorisch zu machen – einschließlich `/health` und `/capabilities` – selbst wenn es an `127.0.0.1` gebunden ist. Der Start schlägt fehl ohne Token. Mit eingeschaltetem Flag kann ein **nicht authentifizierter** Client nicht `/capabilities` lesen, um zu entdecken, dass Auth erforderlich ist; die Entdeckungsoberfläche ist der 401-Antworttext selbst. Einmal authentifiziert, ist der `caps.features.require_auth`-Tag eine Post-Auth-Bestätigung, dass das Deployment gehärtet ist (nützlich für Audit-/Compliance-UIs):
>
> ```bash
> qwen serve --require-auth --token "$(openssl rand -hex 32)"
> # → /health, /capabilities, /session, … alle erfordern Authorization: Bearer …
> curl http://127.0.0.1:4170/health
> # → 401
> curl -H "Authorization: Bearer $TOKEN" http://127.0.0.1:4170/capabilities | jq '.features | index("require_auth")'
> # → 13   (oder ein anderer Index – nicht-null nach Authentifizierung bedeutet, dass das Tag vorhanden ist)
> ```

```bash
curl -H "Authorization: Bearer $QWEN_SERVER_TOKEN" http://your-host:4170/capabilities
# → {"v":1,"mode":"http-bridge","features":[...],"modelServices":[],"workspaceCwd":"/path/to/your-project"}
# Falsches Token → 401
```

Der Token-Vergleich erfolgt in konstanter Zeit (SHA-256 + `crypto.timingSafeEqual`); 401-Antworten sind einheitlich für „fehlender Header", „falsches Schema" und „falsches Token", sodass ein Seitenkanal nicht unterscheiden kann.

## CLI-Flags

| Flag                                    | Standard        | Zweck                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--port <n>`                            | `4170`          | TCP-Port. `0` = vom Betriebssystem zugewiesener temporärer Port.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `--hostname <addr>`                     | `127.0.0.1`     | Binde-Interface. Alles, was über Loopback hinausgeht, erfordert ein Token.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `--token <str>`                         | —               | Bearer-Token. Fallback auf die Umgebungsvariable `QWEN_SERVER_TOKEN` (mit führenden/abschließenden Leerzeichen entfernt – praktisch für `$(cat token.txt)`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `--require-auth`                        | `false`         | Weigere dich, ohne ein Bearer-Token zu starten, selbst auf Loopback. Härtet den `127.0.0.1`-Entwicklerstandard für gemeinsam genutzte Dev-Hosts / CI-Runner / Multi-Tenant-Workstations, wo jeder lokale Benutzer den Listener erreichen kann. Startet nur mit `--token` oder gesetztem `QWEN_SERVER_TOKEN`; schützt `/health` ebenfalls hinter dem Bearer.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `--max-sessions <n>`                    | `20`            | Obergrenze für gleichzeitige Live-Sitzungen. Neue `POST /session`-Anfragen, die ein neues Kind erzeugen würden, geben `503` zurück (mit `Retry-After: 5`), wenn die Grenze erreicht ist; Anhängen an bestehende Sitzungen wird NICHT gezählt. Auf `0` setzen, um zu deaktivieren. Ausgelegt für Einzelbenutzer-/Kleinteam-Nutzung; erhöhe es, wenn dein Deployment den RAM/FD-Spielraum hat (~30–50 MB pro Sitzung).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `--max-pending-prompts-per-session <n>` | `5`             | Pro-Sitzung-Obergrenze für Prompts, die von `POST /session/:id/prompt` akzeptiert, aber noch nicht abgeschlossen wurden, einschließlich in der Warteschlange und des aktiven Prompts. Die Bridge lehnt Überlauf synchron mit `503`, `Retry-After: 5` und `code: "prompt_queue_full"` ab, bevor sie eine `promptId` zurückgibt. Auf `0` setzen, um zu deaktivieren. `branchSession` serialisiert auf demselben FIFO, zählt aber nicht gegen diese Prompt-Obergrenze.                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `--workspace <path>`                    | `process.cwd()` | Absoluter Workspace-Pfad, an den dieser Daemon bindet (gemäß [#3803](https://github.com/QwenLM/qwen-code/issues/3803) §02 — 1 Daemon = 1 Workspace). `POST /session`-Anfragen mit einem abweichenden `cwd` geben `400 workspace_mismatch` zurück. Für Multi-Workspace-Deployments führe einen `qwen serve` pro Workspace auf separaten Ports aus.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `--max-connections <n>`                 | `256`           | Listener-Ebene-TCP-Verbindungslimit (`server.maxConnections`). Begrenzt die rohe Socket-Anzahl unabhängig von der Sitzungsanzahl – langsame / Phantom-SSE-Clients werden bei voller Auslastung zur Akzeptanzzeit abgelehnt. Erhöhe es zusammen mit `--max-sessions`, wenn dein Deployment viele SSE-Abonnenten pro Sitzung erwartet.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `--event-ring-size <n>`                 | `8000`          | Pro-Sitzung-SSE-Wiederholungsring-Tiefe (#3803 §02-Ziel). Legt den Rückstand fest, der für `GET /session/:id/events` mit `Last-Event-ID: N` verfügbar ist. Größer = mehr Wiederverbindungsspielraum auf Kosten von ein paar hundert KB zusätzlichem RAM pro Sitzung. SDK-Clients können zusätzlich eine größere Pro-Abonnent-Rückstands-Obergrenze für ein bestimmtes Abonnement über `?maxQueued=N` anfordern (Bereich `[16, 2048]`, Standard 256). Daemons senden auch einen nicht-terminalen `slow_client_warning`-SSE-Frame bei 75 % Warteschlangenfüllung, damit Clients entladen / neu verbinden können, bevor sie vertrieben werden. Vorab-Prüfung `caps.features.slow_client_warning`.                                                                                                                                                                                                           |
| `--mcp-client-budget <n>`               | —               | Positive ganze Zahl als Obergrenze für Live-MCP-Clients **pro ACP-Sitzung** (Issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14 v1; PR 23 stuft dies auf Pro-Workspace um über den gemeinsamen MCP-Pool). Kombiniere mit `--mcp-budget-mode`. Wenn nicht gesetzt, keine Abrechnungs-basierte Durchsetzung (aber `GET /workspace/mcp` meldet weiterhin `clientCount`). Unterscheidet sich von claude-code's `MCP_SERVER_CONNECTION_BATCH_SIZE`, das die Startkonkurrenz begrenzt, nicht die Gesamt-Client-Anzahl. Vorab-Prüfung `caps.features.mcp_guardrails`.                                                                                                                                                                                                                                                                                                                                                     |
| `--mcp-budget-mode <m>`                 | `warn` / `off`  | Wie `--mcp-client-budget` durchgesetzt wird. `warn` (Standard, wenn Budget gesetzt): keine Verweigerung, das `budgets[0].status` des Snapshots wechselt bei ≥75 % des Budgets zu `warning`. `enforce`: Verbindungen über der Grenze werden verweigert, pro-Server-Zelle zeigt `disabledReason: 'budget'`, deterministisch durch die `mcpServers`-Deklarationsreihenfolge. `off` (Standard, wenn Budget nicht gesetzt): reine Beobachtbarkeit. Boot lehnt `enforce` ohne Budget ab.                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `--http-bridge`                         | `true`          | Stufe 1 Modus: ein `qwen --acp`-Kind pro Daemon (an einen Workspace beim Start gebunden, gemäß [#3803](https://github.com/QwenLM/qwen-code/issues/3803) §02); N Sitzungen multiplexen auf dieses Kind über ACP `newSession()`. Stufe 2 nativer In-Prozess wird später verfügbar.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `--allow-origin <pat>`                  | —               | T2.4 ([#4514](https://github.com/QwenLM/qwen-code/issues/4514)). Cross-Origin-Whitelist für Browser-Webui-Clients. Wiederholbar. Jeder Wert ist `*` (beliebige Origin – Boot verweigert, wenn kein Bearer-Token konfiguriert ist; `--require-auth` auf Loopback wird empfohlen, damit auch `/health` und `/demo` Bearer-geschützt sind, da beide standardmäßig vor Auth auf Loopback liegen) oder eine kanonische URL-Origin (`<scheme>://<host>[:<port>]`, ohne abschließenden Schrägstrich / Pfad / Userinfo / Query). **Subdomain-Wildcards (`https://*.example.com`) werden absichtlich nicht unterstützt** – liste jede Subdomain explizit auf oder verwende `*` mit einem konfigurierten Token (und `--require-auth` für vollständige Härtung). Übereinstimmende Origins erhalten CORS-Antwort-Header (`Access-Control-Allow-Origin`, `Vary: Origin`, Methoden, Header, Max-Age und exponierte `Retry-After`); nicht übereinstimmende Origins erhalten weiterhin einen 403 mit dem gleichen Envelope wie die heutige Mauer. `Origin: null` (Sandboxed-Iframes, file://-Dokumente) wird immer abgelehnt, selbst unter `*`. Vorab-Prüfung via `caps.features.allow_origin`. Loopback-Self-Origin-Treffer sind nicht betroffen. |
| `--web` / `--no-web`                    | `true`          | Stelle die gebaute Web-Shell-SPA auf der Daemon-Root bereit (`GET /`, `/assets/*`, und SPA-Deep-Link-Fallback). Die statische Shell wird **vor** der Bearer-Auth-Schranke registriert – ein Browser kann kein Token an eine `<script>`-Subresource oder eine Adressleisten-Navigation anhängen, die Shell trägt keine Geheimnisse, und jede API-Route bleibt unabhängig davon Token-geschützt. Bei Non-Loopback-Bindungen weist eine einzeilige stderr-Warnung darauf hin, dass die UI ohne Auth erreichbar ist. Verwende `--no-web` für einen API-only-Daemon. Keine Wirkung, wenn der Build die Web-Shell-Assets auslässt (der Daemon protokolliert einen Breadcrumb und läuft als API-only).                                                                                                                                                                                                                                    |
| `--open`                                | `false`         | Nachdem der Listener bereit ist, öffne die Web-Shell im Standardbrowser unter der Daemon-URL (mit `#token=` als URL-Fragment angehängt, wenn ein Token konfiguriert ist – ein Fragment wird niemals an den Server gesendet, sodass das Token aus Zugriffsprotokollen und Referer-Headern herausgehalten wird). Keine Wirkung bei `--no-web` oder in Headless-/CI-/SSH-Umgebungen, in denen kein Browser verfügbar ist.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
> **Dimensionierung der Lastregler.** `--max-sessions` ist die **neue-Child**-Obergrenze.
> Drei weitere Ebenen begrenzen ebenfalls die Last – bei der Auslegung für eine
> hochparallele Bereitstellung sollten alle gemeinsam abgestimmt werden:
>
> - **Listener-Ebene**: `--max-connections` / `server.maxConnections=256`
>   begrenzt rohe TCP-Verbindungen (Backpressure durch langsame Clients).
> - **Abonnenten pro Session**: der EventBus begrenzt SSE-Abonnenten standardmäßig auf
>   64 pro Session; der 65. Client erhält einen terminalen
>   `stream_error` und wird geschlossen.
> - **Prompt-Zulassungen pro Session**:
>   `--max-pending-prompts-per-session=5` begrenzt die Warteschlange + aktive Prompts,
>   die für eine Session angenommen werden. Überlauf erhält `503` mit `Retry-After: 5`.
> - **Backlog pro Abonnent**: eine Warteschlange mit 256 Frames pro SSE-Client; ein
>   Client, der die Kapazität überschreitet, erhält einen terminalen `client_evicted`-Frame
>   und wird geschlossen (ein langsamer Consumer kann den Daemon nicht blockieren).
>
> Diese Obergrenzen interagieren: `--max-sessions × 64 Abonnenten × 256 Frames`
> ist der worst-case In-Memory-Speicher auf der EventBus-Ebene, während
> `--max-sessions × --max-pending-prompts-per-session` die akzeptierte
> Prompt-Arbeit auf der Zulassungsebene begrenzt. Die Standard-Dimensionierung geht von
> Einzelbenutzer-/Kleinteam-Last aus; bei Multi-Tenant-Bereitstellungen schrittweise
> erhöhen (und RSS beobachten).

> **MCP-Client-Schutzmechanismen (Issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14).** Ein Workspace, der 30 MCP-Server in `mcpServers` deklariert, startet 30 Clients ohne upstream-Obergrenze, sofern keine gesetzt wird. `--mcp-client-budget=N` begrenzt die Anzahl aktiver MCP-Clients; `--mcp-budget-mode={enforce,warn,off}` wählt das Verhalten. Standard ist `warn`, wenn ein Budget gesetzt ist (der Snapshot zeigt die Warnung, aber kein Client wird abgewiesen – nützlich, um den tatsächlichen Fanout zu messen, bevor auf `enforce` umgeschaltet wird). Abgewiesene Server im `enforce`-Modus erhalten `disabledReason: 'budget'` in ihrer Server-Zelle, und die `budgets[0]`-Zelle zeigt `status: 'error'` + `errorKind: 'budget_exhausted'`. Die Slot-Reservierung erfolgt pro Server-Name und überlebt Wiederverbindungen / Discovery-Timeouts – ein abgewiesener Server kann keinem gesunden Server den Slot wegnehmen.
>
> ⚠️ **v1-Geltungsbereich: pro Session, nicht pro Workspace.** Jede ACP-Session innerhalb des Daemons besitzt ihre eigene `Config`/`McpClientManager` (erstellt über `newSessionConfig` pro Session). Das Budget begrenzt aktive MCP-Clients **pro Session**, nicht aggregiert über alle Sessions des Workspace. Der Snapshot unter `GET /workspace/mcp` spiegelt die Sicht der Bootstrap-Session wider (die Zelle trägt zur Transparenz `scope: 'session'`). Wenn Sie 5 gleichzeitige ACP-Sessions mit `--mcp-client-budget=10` betreiben, können bis zu 50 aktive MCP-Clients über den Daemon verteilt sein – die Grenze gilt pro Session. **Wave 5 PR 23 (Shared MCP-Pool)** führt einen Workspace-weiten Manager ein und macht dies zu einer echten Workspace-weiten Durchsetzung.
>
> ```sh
> qwen serve --mcp-client-budget=10 --mcp-budget-mode=warn
> # später, nachdem Telemetrie die reale Verteilung zeigt:
> qwen serve --mcp-client-budget=10 --mcp-budget-mode=enforce
> ```
>
> Dies ist **nicht** dasselbe wie claude-code's `MCP_SERVER_CONNECTION_BATCH_SIZE` (das die Start-Konkurrenz steuert); sie sind orthogonal. PR 23 wird einen echten gemeinsamen MCP-Pool hinzufügen (eine `scope: 'workspace'`-Zelle in `budgets[]` neben der Session-Zelle); PR 14 v1 ist der In-Process-Zähler + weiche Durchsetzung auf dem bestehenden Session-Manager.
>
> **Push-Ereignisse (Issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14b).** SDK-Clients, die `GET /session/:id/events` abonniert haben, erhalten typisierte Frames, wenn Budgetschwellen überschritten werden – `mcp_budget_warning` (synthetisch, feuert einmal pro Überschreitung von 75% mit Hystereseschärfung bei 37,5%, angekündigt über `mcp_guardrail_events`) und `mcp_child_refused_batch` (zusammengefasst einmal pro Discovery-Durchlauf im `enforce`-Modus; Länge 1 bei Ablehnung eines `readResource`-Lazy-Spawns). Der Snapshot unter `GET /workspace/mcp` ist immer noch die Quelle der Wahrheit für den Zustand nach einer Wiederverbindung; Ereignisse sind Änderungskanten. Nützlich für Echtzeit-Dashboards ohne Polling.

## Standard-Bedrohungsmodell für die Bereitstellung

- **Nur 127.0.0.1** – Loopback-Bindung, keine Authentifizierung erforderlich.
- **`--hostname 0.0.0.0` erfordert einen Token** – Start verweigert ohne einen.
- **`LOOPBACK_BINDS` enthält IPv6** – `::1` und `[::1]` gelten als Loopback für die Regel ohne Token.
- **Host-Header-Allowlist** – Bei **Loopback**-Bindungen prüft der Daemon, ob `Host:` mit `localhost:port` / `127.0.0.1:port` / `[::1]:port` / `host.docker.internal:port` übereinstimmt (case-insensitive gemäß RFC 7230 §5.4), um sich gegen DNS-Rebinding zu schützen. **Nicht-Loopback-Bindungen (`--hostname 0.0.0.0`) umgehen absichtlich die Host-Allowlist** – der Betreiber hat die Angriffsfläche gewählt, daher ist das Bearer-Token-Tor die einzige Authentifizierungsschicht; Reverse-Proxies / SNI / Client-Zertifikats-Pinning liegen in der Verantwortung des Betreibers, nicht des Daemons. Wenn Sie Host-basierte Isolation auf einer Nicht-Loopback-Bindung benötigen, beenden Sie TLS und prüfen Sie den Host an einem Front-Proxy.
- **CORS verweigert standardmäßig jeden Browser-Ursprung** – gibt `403` JSON zurück. Übergeben Sie **`--allow-origin <Muster>`** (wiederholbar, T2.4 #4514), um bestimmte Browser-Ursprünge durchzulassen. Jeder Wert ist entweder das Literal `*` (beliebiger Ursprung – der Start verweigert, wenn kein Bearer-Token konfiguriert ist; `--require-auth` auf Loopback wird für vollständige Härtung empfohlen, da `/health` und `/demo` standardmäßig auf Loopback vor der Authentifizierung bleiben) oder eine kanonische URL-Origin (`<schema>://<host>[:<port>]`, ohne abschließenden Schrägstrich / Pfad / Userinfo). Übereinstimmende Ursprünge erhalten korrekte CORS-Antwort-Header (`Access-Control-Allow-Origin: <echoed>`, `Vary: Origin`, plus Standard-Methoden / -Header / -Max-Age und exponiertes `Retry-After`); nicht übereinstimmende Ursprünge erhalten weiterhin einen 403 mit demselben Envelope wie die Standardwand. `caps.features.allow_origin` wird bedingt angekündigt, damit SDK-/WebUI-Clients vorab prüfen können, ob der Daemon Cross-Origin-Aufrufe akzeptiert, bevor sie gesendet werden. Beispiel: `qwen serve --allow-origin http://localhost:3000 --allow-origin http://localhost:5173`. Loopback-Self-Origin-Aufrufe (z. B. die `/demo`-Seite) sind nicht betroffen – ein separater Origin-Strip-Shim behandelt sie unabhängig von `--allow-origin`. **Browser-WebUIs ohne konfiguriertes `--allow-origin`** fallen auf dieselben Stage-1-Optionen zurück wie zuvor: als native Shell (Electron/Tauri) paketieren, sodass kein `Origin`-Header gesendet wird, oder den Daemon hinter einem Same-Origin-Reverse-Proxy betreiben.
- **Gespawntes `qwen --acp`-Kind erbt die Umgebung des Daemons** mit einer expliziten Bereinigung: `QWEN_SERVER_TOKEN` wird vor dem Start des Kindes entfernt (der eigene Bearer-Token des Daemons; der Agent benötigt ihn nicht). Alles andere – `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `QWEN_*` / `DASHSCOPE_API_KEY` / Ihre benutzerdefinierten `modelProviders[].envKey` / etc. – wird durchgereicht, da der Agent diese legitimerweise zur Authentifizierung beim LLM benötigt. **Dies ist beabsichtigt, keine Sandbox.** Der Agent läuft mit derselben UID und hat Shell-Tool-Zugriff, daher ist alles in `~/.bashrc` / `~/.aws/credentials` / `~/.npmrc` durch Prompt-Injection erreichbar. Die Umgebungsdurchleitung ist nicht die Sicherheitsgrenze; der Benutzer als Vertrauensanker ist es. Führen Sie `qwen serve` nicht unter einer Identität aus, die in der Umgebung gespeicherte Zugangsdaten enthält, die Sie dem Agenten nicht anvertrauen würden.
- **Pro-Abonnent begrenzte SSE-Warteschlangen** – Ein langsamer Client, der seine Warteschlange überläuft, erhält einen terminalen `client_evicted`-Frame und wird geschlossen; ein hängender Consumer kann den Daemon nicht blockieren.
- **Pro-Session Prompt-Zulassungsgrenze** – Standardmäßig 5 akzeptierte, aber nicht abgeschlossene Prompts pro Session. Ein fehlerhafter Client kann keine unbegrenzten Prompt-Promises oder temporären SSE-Wartezeiten für eine Session anstellen.
- **Graceful Shutdown** – SIGINT/SIGTERM leeren die Agent-Kinder, bevor der Listener geschlossen wird (10s Deadline pro Kind).

> ⚠️ **Stage 1 bekannte Lücke – Berechtigungen sind daemon-global, nicht pro Session (BUy4H).** `pendingPermissions` lebt auf Daemon-Ebene; jeder Client mit dem Bearer-Token kann über jede `requestId` für jede Session abstimmen, die er sehen kann (und SSE `permission_request`-Ereignisse tragen die requestId in ihrer Nutzlast). Dies ist unter dem Einzelbenutzer-/Kleinteam-Vertrauensmodell akzeptabel, bei dem jeder authentifizierte Client derselbe Mensch oder vertrauenswürdige Mitarbeiter ist. Stage 1.5 wird auf `POST /session/:id/permission/:requestId` + Session-weite ausstehende Map + Client-Identität (Must-have #3 aus dem Downstream-Review) umstellen; bis dahin führen Sie `qwen serve` nicht hinter einem Bearer-Token aus, der mit nicht vertrauenswürdigen Parteien geteilt wird.
>
> ⚠️ **Stage 1 bekannte Lücke – `POST /session/:id/prompt`-Body auf 10 MB begrenzt (BUy4L).** Multimodale Prompts mit Bildern / PDFs / Audiodateien, die 10 MB überschreiten, schlagen zum Zeitpunkt der Body-Parsing fehl, bevor die Routenlogik ausgeführt wird (kein Streaming, kein Abbruch während des Uploads). Workaround: Verkleinern Sie den Inhalt clientseitig oder übergeben Sie eine Pfadreferenz und lassen Sie den Agenten die Datei über `readTextFile` lesen. Stage 1.5 wird `multipart/form-data` oder Chunked-Encoding auf `/prompt` akzeptieren, sodass große Prompts nicht an eine Grenze stoßen.
>
> ⚠️ **Stage 1 bekannte Lücke – Phantom-SSE-Verbindungen hinter NAT.** Der
> Daemon erkennt tote Clients über TCP-Backpressure bei Heartbeats
> (15s Intervall). Ein Client, der OHNE TCP-RST verschwindet (z. B. eine
> NAT-Box, die inaktive Flows stillschweigend verwirft), hält den Kernel-Socket
> "lebendig", bis Node-Keepalive-Proben ein Timeout erhalten – typischerweise ~2 Stunden
> auf Linux-Standardeinstellungen. Bei `--hostname 0.0.0.0`-Bereitstellungen hinter solchen
> NATs können sich Phantom-SSE-Verbindungen ansammeln und schließlich die
> 256 `server.maxConnections`-Grenze erreichen.
>
> Setzen Sie [`--writer-idle-timeout-ms <n>`](#deadlines-and-writer-idle-timeout)
> (Issue [#4514](https://github.com/QwenLM/qwen-code/issues/4514) T2.9)
> ein, um die Lücke mit einer expliziten Anwendungs-Leerlauf-Deadline zu schließen:
> Wenn für `n` ms kein Schreibvorgang erfolgreich geflusht wurde, sendet der Daemon
> einen terminalen `client_evicted`-Frame mit
> `reason: 'writer_idle_timeout'` und schließt den Stream. Das Flag ist
> standardmäßig deaktiviert, um den Legacy-Vertrag zu wahren – Betreiber in
> Netzwerken, die RSTs verschlucken, sollten einen Wert deutlich über dem 15s
> Heartbeat-Intervall wählen (z. B. `60000`–`300000`), sodass legitime Leerlaufverbindungen
> nicht verdrängt werden, während echte hängende Schreiber schnell entfernt werden.
> Pre-flight `caps.features.includes('writer_idle_timeout')` von Ihrem
> SDK, um zu bestätigen, dass der Daemon dies unterstützt.

### Deadlines und Writer-Idle-Timeout

Issue [#4514](https://github.com/QwenLM/qwen-code/issues/4514) T2.9 liefert zwei optionale Flags, die die Lücken für lang laufende / Remote-Bereitstellungen schließen, die der 15s-Heartbeat + AbortSignal nicht abdecken. Beide sind standardmäßig deaktiviert – Single-User-Loopback-Workflows bleiben bit-identisch.

| Flag                           | Umgebungsvariable                     | Standard | Was es tut                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------ | ------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--prompt-deadline-ms <n>`     | `QWEN_SERVE_PROMPT_DEADLINE_MS`       | nicht gesetzt | Serverseitige Wanduhr-Obergrenze für einen einzelnen `POST /session/:id/prompt`. Bei Ablauf bricht der Daemon den AbortController des Prompts ab und gibt HTTP `504` mit `{code:"prompt_deadline_exceeded", errorKind:"prompt_deadline_exceeded", deadlineMs:n}` zurück. Ein Body-Feld `deadlineMs` pro Prompt kann die effektive Deadline UNTER das Flag VERKÜRZEN, aber nie verlängern. Capability-Tag (bedingt): `prompt_absolute_deadline`.                                                                                                                                                                      |
| `--writer-idle-timeout-ms <n>` | `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS`   | nicht gesetzt | Pro-SSE-Verbindung Leerlauf-Deadline. Wenn für `n` ms kein Schreibvorgang ERFOLGREICH geflusht wurde – weder ein echtes Ereignis noch der 15s-Heartbeat – sendet der Daemon einen terminalen `client_evicted`-Frame mit `data.reason = 'writer_idle_timeout'` (gespiegelt in `data.errorKind`) und schließt den Stream. **Wählen Sie einen Wert deutlich über dem 15s-Heartbeat** (z. B. `30000`–`300000`), damit legitime Leerlauf-Streams nicht verdrängt werden; Werte `< 15000` WERDEN ansonsten gesunde Leerlaufverbindungen verdrängen, bevor der erste Heartbeat feuert (nur für Tests / kurzlebige Entwickler-Sessions beabsichtigt). Capability-Tag (bedingt): `writer_idle_timeout`. |

Beide Flags akzeptieren eine positive Ganzzahl in Millisekunden; `0`, `NaN`, nicht-ganzzahlige oder negative Werte werden beim Start mit einer klaren Fehlermeldung abgelehnt. CLI-Flag gewinnt gegen Umgebungsvariable; explizites `ServeOptions`-Feld (eingebettete Aufrufer) gewinnt gegen Umgebungsvariable. SDK-Konsumenten sollten vorab das passende Capability-Tag prüfen, bevor sie sich auf eines der Verhalten verlassen – Daemons vor diesem PR lassen beide Tags weg und das `deadlineMs`-Feld in der Anfrage wird stillschweigend ignoriert.

## Multi-Session und Multi-Workspace-Bereitstellung

Gemäß [#3803](https://github.com/QwenLM/qwen-code/issues/3803) §02 bindet sich jeder `qwen serve`-Prozess beim Start an **einen Workspace**. Innerhalb dieses Workspace multiplext er N Sessions auf einen einzelnen `qwen --acp`-Kindprozess über die native Session-Map des Agenten – Sessions teilen sich den Child-Prozess / OAuth-Status / Datei-Lese-Cache / Hierarchie-Speicher-Parse.

Um **mehrere Workspaces** zu hosten (ein Benutzer, mehrere Repos; oder mehrere Benutzer auf demselben Host), führen Sie **mehrere Daemon-Prozesse** aus – einen pro Workspace, jeder auf seinem eigenen Port, überwacht durch systemd / docker-compose / k8s / einen referenzierten `qwen-coordinator`-Orchestrator. Der Kompromiss ist beabsichtigt: Ein Workspace pro Child bedeutet, dass `loadSettings(cwd)` / OAuth / MCP-Server-Bereich mit dem gebundenen Verzeichnis ausgerichtet bleiben und nicht über Anfragen hinweg abweichen.

> **Abonnieren Sie VOR dem Posten von `modelServiceId` beim Anhängen.** Wenn ein Client `POST /session` mit einem `modelServiceId` aufruft und der Workspace bereits eine Session mit einem anderen Modell ausführt, gibt der Daemon einen internen `setSessionModel`-Aufruf aus – Fehler werden NICHT als HTTP-Fehler weitergegeben (die Session bleibt auf ihrem aktuellen Modell betriebsbereit). Das sichtbare Fehlersignal ist ein `model_switch_failed`-Ereignis auf dem SSE-Stream der Session. Wenn Sie `POST /session` aufrufen und erst DANN `GET /session/:id/events` öffnen, verpassen Sie das Fehlerereignis und sprechen stillschweigend mit dem falschen Modell weiter. Öffnen Sie zuerst den SSE-Stream, oder übergeben Sie beim Abonnieren `Last-Event-ID: 0`, um das älteste verfügbare Ereignis des Rings wiederzugeben.

Um mehrere **Benutzer** zu handhaben (jeder mit eigenem Kontingent, Audit-Log, Sandbox) oder um die Reichweite eines einzelnen Prozesses zu skalieren (Cold-Start-Budget, Dateideskriptoren, RSS), starten Sie einen Daemon pro Workspace pro Benutzer hinter einem externen Orchestrator. Dieser Orchestrator (Multi-Tenancy / OIDC / Quota / Audit / k8s) liegt **außerhalb des Geltungsbereichs** des qwen-code-Projekts – siehe Issue [#3803](https://github.com/QwenLM/qwen-code/issues/3803) "External Reference Architecture" für die Design-Hinweise.

## Laden und Wiederaufnehmen einer persistierten Session

Der Daemon stellt den ACP `session/load`- und Resume-Ablauf über HTTP unter zwei Routen bereit:

| Route                      | Verwendung                                                                                                                                                                                                                                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /session/:id/load`   | Der Client hat **keine** History gerendert (kalte Wiederverbindung, Auswählen und dann Öffnen). Der Daemon spielt jeden persistierten Turn über SSE ab, sodass Abonnenten das vollständige Transkript sehen. Capability-Tag: `session_load`.                                                                  |
| `POST /session/:id/resume` | Der Client hat die Turns bereits auf dem Bildschirm und benötigt nur den daemonseitigen Handle zurück. Der Modellkontext wird auf der Agentenseite ohne UI-Wiedergabe wiederhergestellt – der SSE-Stream bleibt sauber. Capability-Tag: `session_resume` (`unstable_session_resume` bleibt ein veralteter Alias für ältere Clients). |

Das TypeScript-SDK stellt beide als statische Factorys auf `DaemonSessionClient` bereit:

```ts
import { DaemonClient, DaemonSessionClient } from '@qwen-code/sdk';

const client = new DaemonClient({ baseUrl: 'http://127.0.0.1:4170' });

// Kalte Wiederverbindung – Daemon spielt History über SSE ab.
const session = await DaemonSessionClient.load(client, 'persisted-id');

// Oder, wenn Ihre UI die History bereits hat, überspringen Sie die Wiedergabe:
// const session = await DaemonSessionClient.resume(client, 'persisted-id');

for await (const event of session.events()) {
  // Zuerst die wiedergegebenen `session_update`-Frames (nur load),
  // dann Live-Ereignisse.
}
```

Pre-flight `caps.features.session_load` / `caps.features.session_resume` vor dem Aufruf – ältere Daemons geben `404` zurück. `unstable_session_resume` wird weiterhin als veralteter Kompatibilitätsalias angekündigt. Gleichzeitige Aktionen desselben Typs für dieselbe ID werden zusammengefasst; überlappende Aktionen (ein `load` mit einem `resume`) erhalten `409 restore_in_progress` mit `Retry-After: 5`. Siehe die [Protokollreferenz](../developers/qwen-serve-protocol.md) für den vollständigen Fehler-Envelope.

Hinweis: Die History-Wiedergabe ist durch den SSE-Ring (standardmäßig 8000 Frames) begrenzt. Lange Historien mit gesprächigen Turns können diese Grenze überschreiten – die frühesten Frames werden stillschweigend verworfen. Bei sehr langen Sessions bevorzugen Sie `resume` und verlassen Sie sich auf die lokal persistierte UI des Clients.

## Haltbarkeitsmodell

**Sessions sind in Stage 1 immer noch flüchtig bei Daemon-Neustarts**, aber persistierte Sessions auf der Festplatte können neu geladen werden:

- Ein Absturz des Kindprozesses veröffentlicht `session_died` und entfernt die Live-Session aus den Maps des Daemons. Die persistierte Session auf der Festplatte **kann** über `POST /session/:id/load` neu geladen werden, wenn ein frischer Agent-Kindprozess spawnbar ist.
- Ein Neustart des Daemons verliert alle laufenden Live-Sessions. Die persistierten Sessions bleiben auf der Festplatte und können gegen einen neuen Daemon-Prozess geladen werden, vorbehaltlich derselben Workspace-Bindungsregeln.
- Lange Client-Trennungen (>5 Minuten bei einem gesprächigen Turn) können den SSE-Wiedergabering (Standard 8000 Frames) überholen – `Last-Event-ID`-Wiederverbindung gelingt, aber der Zustand kann inkohärent sein. Für mobile / unzuverlässige Netzwerk-Clients planen Sie, SSE bei langen Abbrüchen neu zu öffnen oder `POST /session/:id/load` aufzurufen, um von der Festplatte abzuspielen.
- Dateioperationen (`writeTextFile`) sind atomar über Abstürze hinweg (write-then-rename); sie sind nicht atomar über Daemon-Neustarts im Sinne der Wiedergabe – der Dateischreibvorgang war entweder erfolgreich oder nicht.

Wenn Ihre Integration eine serverseitige cross-restart-Haltbarkeit über das hinaus benötigt, was `session/load` abdeckt (z. B. serververwaltete Wiederholungswarteschlangen), benötigen Sie dennoch eine anwendungseitige Zustandswiederherstellung. Halten Sie keine lang laufenden, neustartempfindlichen Zustände innerhalb der Daemon-Session.

## Stage-1.5+-Laufzeitgarantien

Der Vertrag von Stage 1 ist für das Prototyping ausgelegt. Gemäß [#3889 chiga0 downstream-consumer review](https://github.com/QwenLM/qwen-code/pull/3889#issuecomment-4427875644) sind die folgenden **nicht** in Stage 1 – produktionsreife Integrationen benötigen Stage 1.5+, bevor sie sich darauf verlassen können:
**Blockers für ernsthafte Downstream-Nutzung:**

1. **`loadSession` / `unstable_resumeSession` über HTTP** — ohne dies kann keine Integration einen Child-Absturz oder Daemon-Neustart überleben, und ein Orchestrator, der den Daemon koordiniert, kann den Zustand ebenfalls nicht wiederherstellen.
2. **Persistente Client-Identität (Pair-Tokens + clientseitige Sperrung)** — Stufe 1 verwendet einen gemeinsamen Bearer; ein durchgesickertes Token sperrt alle, und `originatorClientId` wird vom Client selbst deklariert, nicht vom Daemon aus authentifizierter Identität gestempelt.

**Zuverlässigkeits-Baseline:**

3. ~~**Client-initiierten Heartbeat-Pfad**~~ — ausgeliefert via [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 9. `POST /session/:id/heartbeat` zeichnet Last-Seen-Timestamps auf dem Daemon auf (Capability-Tag `client_heartbeat`); SDK-Helper sind `DaemonClient.heartbeat()` / `DaemonSessionClient.heartbeat()`.
4. **`permission_already_resolved`-Ereignis** wenn eine Abstimmung den Erstempfänger-Wettlauf verliert — aktuell müssen UIs den Zustand aus einem `404` ableiten.
5. ~~**Größerer Replay-Ring**~~ — auf 8000 erhöht. **Pro-Session konfigurierbarer Ring** noch offen — mobile / Chatty-Turn-Workloads benötigen möglicherweise prozessspezifische Überschreibungen.
6. **`slow_client_warning`-Ereignis vor `client_evicted`** — sanfter Backpressure, damit wohlverhaltene langsame Clients sich selbst drosseln können (Render-Tiefe trimmen, Chunks verwerfen), bevor sie terminiert werden.

**Integrations-Ergonomie:**

7. **`POST /session/:id/_meta` für IM-ähnlichen Kontext** — prozessspezifische Key-Values, die an nachfolgende Prompts angehängt werden (Chat-ID, Sender, Thread-ID) ersetzt die pro-Kanal-Improvisation.
8. **`/capabilities` tatsächliche Feature-Aushandlung** — `protocol_versions: { acp: '0.14.x', daemon_envelope: 1 }` so dass Clients Drift erkennen können, anstatt auf „Unbekannter Frame, ignorieren“ zurückzufallen.
9. **Dokumentation zur Haltbarkeit erster Klasse** (dieser Abschnitt) — bereits oben ausgeliefert.

Die vollständige Konvergenz-Roadmap wird unter [#3803](https://github.com/QwenLM/qwen-code/issues/3803) verfolgt.

## Abgrenzung des Umfangs von Stufe 1 – was wir in Stufe 1.5 nicht beheben werden

Zwei strukturelle Entscheidungen sind explizite Nicht-Ziele für die Haupt-Roadmap von Stufe 1 / 1.5 / 2. Wenn Ihr Anwendungsfall auf einer davon basiert, planen Sie entsprechend, anstatt auf uns zu warten.

### Session-Zustand ist nur lokale Mutation (laut [LaZzyMan-Review #4270256721](https://github.com/QwenLM/qwen-code/pull/3889#pullrequestreview-4270256721))

Der Stufe-1.5-Plan beschreibt TUI als einen In-Prozess-EventBus-Abonnenten. In der Praxis ist **TUI UI strikt größer als das Wire-Protokoll**:

- **Nur-lokales UI** — die ~15 Ink-Dialogkomponenten (`ModelDialog`, `MemoryDialog`, `PermissionsDialog`, `SessionPicker`, `WelcomeBackDialog`, `FolderTrustDialog`, …) und die `local-jsx`-Slash-Befehle (`/ide`, `/auth`, `/init`, `/resume`, `/rename`, `/delete`, `/language`, `/arena`, …) rendern terminal-spezifisches Ink JSX. Remote-Clients über HTTP/SSE können Ink nicht äquivalent rendern, und diese Abläufe erzeugen kein Wire-Ereignis.
- **Session-Zustands-Mutationen ohne Wire-Ereignisse** — `/approval-mode`, `/memory add`, `/mcp add-server`, `/agents`, `/tools enable/disable`, `/auth`, `/init` (schreibt `CLAUDE.md`) ändern alle das Agentenverhalten, aber nur `/model` veröffentlicht derzeit ein Ereignis (`model_switched`).

**Stufe-1-Entscheidung – Option (A) aus dem Review**: Diese Mutationen nicht zu Wire-Ereignissen befördern. Die beiden Bereitstellungsmodi haben unterschiedliche Konsequenzen.

#### Modus 1 – Headless `qwen serve` (dieser PR)

Im Daemon läuft keine TUI-Shell. Die oben aufgeführten Slash-Befehle **existieren nicht** in diesem Modus – es gibt keine Terminal-UI, um sie auszugeben. Der Session-Zustand ist daher:

- **Boot-time-gefroren** für `approval-mode` / `memory` / `agents` / `tools`-Allowlist / `auth` – alle werden beim Start des `qwen --acp`-Childs aus Einstellungen + Festplatte geladen; für die Lebensdauer der Session unveränderlich. Einstellungsdefinierte MCP-Server sind ebenfalls beim Boot eingefroren, aber **zur Laufzeit hinzugefügte Server** (via `POST /workspace/mcp/servers`) können ohne Neustart hinzugefügt oder entfernt werden.
- **Über HTTP veränderbar** via `POST /session/:id/model` (veröffentlicht `model_switched`), `POST /workspace/mcp/servers` / `DELETE /workspace/mcp/servers/:name` (veröffentlicht `mcp_server_added` / `mcp_server_removed`) und Berechtigungsabstimmungen (`POST /permission/:requestId`).

**Konsequenz:** Remote-Clients im Headless-Modus sehen den **vollständigen Session-Zustand**. Kein TUI verbirgt zusätzlichen Zustand; kein Drift ist möglich. Wenn Sie `approval-mode` ändern möchten, starten Sie den Daemon mit neuen Einstellungen neu. MCP-Server können jetzt zur Laufzeit über die Mutationsrouten hinzugefügt/entfernt werden (`POST /workspace/mcp/servers`, `DELETE /workspace/mcp/servers/:name`) – siehe [Laufzeit-MCP-Serververwaltung](#runtime-mcp-server-management-issue-4514).

#### Modus 2 – Stufe 1.5 `qwen --serve` Co-Hosted TUI (nicht in diesem PR)

Wenn Stufe 1.5 `qwen --serve` (TUI-Prozess co-hostet denselben HTTP-Server) landet, existiert die TUI **neben** Remote-Clients. Ein lokaler Operator, der `/approval-mode yolo` oder `/mcp add-server` eingibt, mutiert den Session-Zustand, und Remote-Clients über HTTP haben kein Ereignis, um die Änderung zu beobachten.

In diesem Modus ist die TUI ein **„Super-Client“** – sie beobachtet dieselbe Agentenkonversation, die Remote-Clients sehen, UND kann Session-Zustand mutieren, den Remote-Clients nicht sehen können. Die Asymmetrie ist:

- ✅ Sowohl TUI als auch Remote-Clients sehen dieselben Agentennachrichten, Tool-Aufrufe, Datei-Diffs, Berechtigungsaufforderungen.
- ❌ Nur TUI sieht/mutiert Approval-Mode / Memory / MCP-Serverliste / Agents / Tools-Allowlist / Auth-Zustand.

**Konsequenz in Modus 2:** Wenn ein Remote-Client-UI versucht, Session-Einstellungen zu spiegeln, kann es nach jedem TUI-Slash-Befehl abdriften. Remote-Clients sollten **bei Verbindung/Wiederherstellung den Zustand neu abrufen** (`Last-Event-ID: 0` verwenden, um das älteste Ereignis des Rings wiederzugeben, z. B. für `model_switched`); sie sollten sich NICHT auf inkrementelle Ereignisse für TUI-seitige Mutationen verlassen.

#### Warum (A) und nicht (B) (Mutationen zur `session_state_changed`-Ereignisfamilie befördern)

(B) ist die ambitioniertere Antwort, verriegelt aber Stufe 1.5 in eine wesentlich größere Wire-Oberfläche, die auch sauber durch die geplante In-Prozess-Umstrukturierung gehen muss. Wir gehen lieber den kleineren Umfang ehrlich an. Die Arbeit zur Taxonomie der Session-Zustandsereignisse – Aufzählung, welche TUI-Abläufe designbedingt nur lokal sind vs. plausibel unter einer zukünftigen optionalen (B)-artigen Erweiterung zu Wire-Ereignissen aufsteigen könnten – wandert nach [#3803](https://github.com/QwenLM/qwen-code/issues/3803), nicht in den Stufe-1.5-Code.

### N parallele Sessions teilen sich ein `qwen --acp`-Child

Mehrere Sessions im selben Workspace **teilen sich einen `qwen --acp`-Child-Prozess** über die native Multi-Session-Unterstützung des Agenten (`packages/cli/src/acp-integration/acpAgent.ts:194: private sessions: Map<string, Session>`). Die Bridge ruft `connection.newSession({cwd, mcpServers})` für jede Session auf – der Agent speichert sie in seiner Sessions-Map und demultiplext pro Aufruf die sessionId.

Konkrete Kosten bei N=5 Sessions im selben Workspace:

| Ressource                           | Pro Session | Bei N=5                       |
| ----------------------------------- | ----------- | ----------------------------- |
| Daemon-Node-Prozess                 | einer       | **30–50 MB** (ein Daemon)     |
| `qwen --acp`-Child                  | gemeinsam   | **60–100 MB** (ein Child)     |
| MCP-Server-Childs                   | pro Session | 3×N, wenn Konfigurationen abweichen |
| `FileReadCache` (im Child-Heap)     | gemeinsam   | einmal geparst                |
| `CLAUDE.md` / Hierarchie-Memory-Parse | gemeinsam | einmal geparst                |
| OAuth-Refresh-Token-Zustand         | gemeinsam   | **ein Refresh-Pfad**          |
| Auto-Memory gelernte Fakten         | gemeinsam   | eine Wissensbasis pro Child   |
| Kaltstart                           | nur erster  | <200 ms nach erster Session   |

Die Bridge hält **einen Kanal pro Daemon** (ein Daemon pro Workspace, gemäß §02). Der Kanal bleibt aktiv, solange mindestens eine Session lebt; der letzte `killSession` (oder ein Absturz auf Kanalebene) tötet das Child.

**MCP-Server-Childs** sind heute noch pro Session – jede Session-Konfiguration kann andere Server angeben, daher werden sie unabhängig gestartet. Stufe 1.5 Nachverfolgung: Refcount MCP-Server-Childs nach `(workspace, config-hash)`, damit identische Konfigurationen geteilt werden. In diesem PR nicht im Umfang.

**Peer-Agenten (Cursor / Continue / Claude Code / OpenCode / Gemini CLI) machen alle Single-Process Multi-Session.** qwen-code entspricht ihnen auf der Agentenebene; die Stufe-1-Bridge in diesem PR macht dieselbe Architektur über HTTP sichtbar.

## Anmelden an einem Remote-Daemon (Issue #4175 PR 21)

Wenn der Daemon auf einem Remote-Pod läuft (kein gemeinsames Display mit Ihnen), kann ein Client einen OAuth-Gerätefluss über HTTP auslösen. Der Daemon pollt selbst beim IdP; Ihre Aufgabe ist es lediglich, eine URL auf einem beliebigen Gerät mit Browser zu öffnen.

> [!note]
>
> Das kostenlose Qwen OAuth-Tier wurde am 15.04.2026 eingestellt. Die `qwen-oauth`-Beispiele unten dokumentieren die Form des Gerätefluss-Protokolls und die Legacy-Provider-ID; neue Einrichtungen sollten einen derzeit unterstützten Auth-Provider verwenden.

```bash
# 1. Einen Fluss starten. Der Daemon kontaktiert den IdP, gibt einen Code + URL zurück.
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

# 2. Besuchen Sie die URL auf Ihrem Telefon/Laptop, geben Sie den Benutzercode ein.
# 3. Auf Abschluss warten (oder SSE auf das auth_device_flow_authorized-Ereignis abonnieren):
curl http://127.0.0.1:4170/workspace/auth/device-flow/fa07c61b-… \
  -H "Authorization: Bearer $TOKEN"
# → Statusübergänge: pending → authorized
```

Das TypeScript SDK fasst beide Schritte in einem einzigen Helfer zusammen:

```ts
import { DaemonClient } from '@qwen-code/sdk';

const client = new DaemonClient({ baseUrl, token });
const flow = await client.auth.start({ providerId: 'qwen-oauth' });
console.log(`Open ${flow.verificationUri}\nCode: ${flow.userCode}`);
const result = await flow.awaitCompletion({ signal: abortCtrl.signal });
// result.status === 'authorized'
```

**Der Daemon öffnet niemals einen Browser in Ihrem Namen.** Selbst wenn er lokal läuft, bleibt der Daemon passiv – er gibt die URL zurück und überlässt es dem SDK / Benutzer, zu entscheiden, wo sie geöffnet wird. Dies ist beabsichtigt: Ein Daemon auf einem Headless-Pod, der `xdg-open` aufruft, würde stillschweigend fehlschlagen und die tatsächliche Auth-Oberfläche verschleiern. Spiegeln Sie die UX von `gh auth login` „Drücken Sie die Eingabetaste, um den Browser zu öffnen“ in Ihrem Client wider.

**`--require-auth` und Entwicklerkomfort.** Die Device-Flow-Routen verwenden das strikte Mutationstor (PR 15), was bedeutet, dass eine token-lose Loopback-Standardeinstellung `401 token_required` zurückgibt. Lokal ist der einfachste Weg, dies während der Entwicklung zu umgehen, `qwen serve --token=dev-token`; Sie benötigen `--require-auth` nur, wenn Sie die Loopback-Standardeinstellung härten möchten.

**Einschränkung über Daemons hinweg.** `oauth_creds.json` wird Daemon-übergreifend geteilt (`~/.qwen/oauth_creds.json`), daher wird ein erfolgreicher Login in Daemon A automatisch vom nächsten Token-Refresh von Daemon B übernommen – aber die SDK-Clients von Daemon B erhalten das `auth_device_flow_authorized`-Ereignis nicht (Ereignisse sind pro Daemon).

**Übernahme durch andere Clients.** Zwei SDK-Clients auf demselben Daemon, die beide `POST /workspace/auth/device-flow` für denselben Provider aufrufen, erhalten das pro-Provider-Singleton: Der erste Aufruf startet eine frische IdP-Anfrage und gibt `attached: false` zurück; der zweite Aufruf gibt den BEREITS VORHANDENEN in-flight-Eintrag mit `attached: true` zurück. Die Übernahme wird im Audit-Trail (unter der `X-Qwen-Client-Id` des zweiten Clients) protokolliert, erzeugt aber KEIN separates Ereignis – beide Clients beobachten schließlich das GLEICHE `auth_device_flow_authorized`, sobald der Benutzer die IdP-Seite abgeschlossen hat. Wenn Ihr UI unterscheidet „Ich habe dies gestartet“ von „jemand anderes Fluss, dem ich beigetreten bin“, verzweigen Sie auf das von `start()` zurückgegebene `attached`-Feld.

## Daemon-Logdatei

`qwen serve` schreibt ein prozessbezogenes Diagnoselog nach:

```
${QWEN_RUNTIME_DIR or ~/.qwen}/debug/daemon/serve-<pid>-<workspaceHash>.log
```

Ein `latest`-Symlink im selben Verzeichnis zeigt immer auf das Log des aktuellen Prozesses, so dass `tail -f ~/.qwen/debug/daemon/latest` dem gerade laufenden Daemon folgt.

Das Log erfasst Lebenszyklusmeldungen, Routenfehler (mit `route=`- und `sessionId=`-Kontext), ACP-Child-stderr und – wenn `QWEN_SERVE_DEBUG=1` gesetzt ist – zusätzliche Bridge-Breadcrumbs. Zeilen, die heute nach stderr gehen, gehen weiterhin nach stderr; das Datei-Log ist **additiv**, kein Ersatz.

### Deaktivieren

Setzen Sie `QWEN_DAEMON_LOG_FILE=0` (oder `false`/`off`/`no`), um die Dateiprotokollierung vollständig zu überspringen. Die Stderr-Ausgabe bleibt unberührt.

### Beziehung zu Session-Debug-Logs

Session-bezogene Debug-Logs (`~/.qwen/debug/<sessionId>.txt` und der `~/.qwen/debug/latest`-Symlink) sind unabhängig. Das Daemon-Log befindet sich in einem benachbarten `daemon/`-Unterverzeichnis; die per-Session-Debug-Semantik bleibt durch diese Funktion unverändert.

### Keine Rotation

Das Daemon-Log hängt unbegrenzt an. Rotieren Sie manuell, wenn es groß wird. Eine zukünftige Verbesserung könnte automatische Rotation hinzufügen; verfolgen Sie dies über [#4548](https://github.com/QwenLM/qwen-code/issues/4548).

## Laufzeit-MCP-Serververwaltung (Issue [#4514](https://github.com/QwenLM/qwen-code/issues/4514))

MCP-Server zur Laufzeit hinzufügen oder entfernen, ohne den Daemon neu zu starten. Laufzeiteinträge leben in einer ephemären Überlagerung, die **einstellungsdefinierte Server mit demselben Namen überdeckt**; die zugrunde liegende `settings.json` / `mcpServers`-Konfiguration wird nie beschrieben.

**Vorab:** Überprüfen Sie `caps.features` auf `mcp_server_runtime_mutation`, bevor Sie eine der Routen aufrufen. Ältere Daemons ohne dieses Tag geben `404` zurück.

### `POST /workspace/mcp/servers` – einen Laufzeit-MCP-Server hinzufügen

Streng getorrt (Bearer-Token erforderlich). Verbindet den Server sofort über den aktiven `McpClientManager` und entdeckt dessen Tools.

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

`name` muss alphanumerisch plus `_` und `-` sein (max. 256 Zeichen). `config` ist dasselbe MCP-Server-Konfigurationsobjekt, das in `settings.json`-`mcpServers`-Einträgen verwendet wird (transportabhängige Felder: `command`/`args` für stdio, `url` für SSE/HTTP). Sicherheitsrelevante Felder (`trust`, `env`, `cwd`, `oauth`, `headers`, `authProviderType`, `includeTools`, `excludeTools`, `type`) werden vom Daemon entfernt und ignoriert.

Antwort (200) – Erfolg:

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

- `replaced: true` – ein Laufzeiteintrag mit demselben Namen existierte bereits und der Konfigurationsfingerabdruck unterscheidet sich; alte Verbindung abgebaut, neue hergestellt. Wenn der Fingerabdruck übereinstimmt (idempotentes erneutes Hinzufügen), ist `replaced` `false`.
- `shadowedSettings: true` – ein einstellungsdefinierter Server mit demselben Namen existiert; der Laufzeiteintrag überdeckt ihn nun. Der Einstellungseintrag bleibt unberührt und taucht wieder auf, wenn der Laufzeiteintrag später entfernt wird.
- `toolCount` – Anzahl der auf dem neu verbundenen Server entdeckten Tools.

Antwort (200) – sanfte Ablehnung (Budget-Warnmodus):

```json
{
  "name": "my-server",
  "skipped": true,
  "reason": "budget_warning_only"
}
```

Wird zurückgegeben, wenn `--mcp-budget-mode=warn` und das Hinzufügen des Servers das konfigurierte `--mcp-client-budget` überschreiten würde. Der Server wird NICHT verbunden. Aufrufer sollten den Budgetdruck dem Benutzer anzeigen.

Fehler:

| Status | Code                      | Wann                                                                                                  |
| ------ | ------------------------- | ------------------------------------------------------------------------------------------------------ |
| `400`  | `invalid_server_name`     | Name leer, länger als 256 Zeichen oder enthält Zeichen außerhalb von `[A-Za-z0-9_-]`                   |
| `400`  | `missing_required_field`  | `config` fehlt oder ist kein nicht-null Objekt                                                         |
| `400`  | `invalid_client_id`       | `X-Qwen-Client-Id`-Header vorhanden, aber nicht für diesen Workspace registriert                       |
| `400`  | `invalid_config`          | Konfigurationsform vom MCP-Transport-Validator abgelehnt                                               |
| `401`  | `token_required`          | Kein Bearer-Token konfiguriert (strenges Tor)                                                          |
| `409`  | `mcp_budget_would_exceed` | `--mcp-budget-mode=enforce` und Budget voll                                                            |
| `502`  | `mcp_server_spawn_failed` | Serverprozess während der Verbindung beendet oder timeout; Body enthält `serverName`, `exitCode`, `stderr` |
| `503`  | `acp_channel_unavailable` | Kein lebendes ACP-Child (noch keine Session erstellt)                                                  |

### `DELETE /workspace/mcp/servers/:name` – einen Laufzeit-MCP-Server entfernen

Streng getorrt. Trennt den Server und entfernt ihn aus der Laufzeitüberlagerung. Idempotent – das Entfernen eines Namens, der nie hinzugefügt wurde, gibt eine Skip-Antwort zurück (kein Fehler).

Der `:name`-Pfadparameter ist der URL-kodierte Servername.

Antwort (200) – Erfolg:

```json
{
  "name": "my-server",
  "removed": true,
  "wasShadowingSettings": false,
  "originatorClientId": "client-1"
}
```

- `wasShadowingSettings: true` – der entfernte Laufzeiteintrag überdeckte einen einstellungsdefinierten Server mit demselben Namen. Dieser Einstellungseintrag ist nun nicht mehr überdeckt und wird beim nächsten Discovery/Neustart verwendet.

Antwort (200) – idempotenter Skip:

```json
{
  "name": "ghost",
  "skipped": true,
  "reason": "not_present"
}
```

Wird zurückgegeben, wenn der Name nicht in der Laufzeitüberlagerung vorhanden war (er kann dennoch in den Einstellungen existieren – Einstellungseinträge können nicht über diese Route entfernt werden).

Fehler:

| Status | Code                      | Wann                                                                                    |
| ------ | ------------------------- | --------------------------------------------------------------------------------------- |
| `400`  | `invalid_server_name`     | Name leer, länger als 256 Zeichen oder enthält Zeichen außerhalb von `[A-Za-z0-9_-]`    |
| `400`  | `invalid_client_id`       | `X-Qwen-Client-Id`-Header vorhanden, aber nicht für diesen Workspace registriert        |
| `401`  | `token_required`          | Kein Bearer-Token konfiguriert (strenges Tor)                                           |
| `503`  | `acp_channel_unavailable` | Kein lebendes ACP-Child                                                                 |

### Überlagerungssemantik

Laufzeiteinträge bilden eine ephemäre Überlagerung über einstellungsdefinierten MCP-Servern:

- **Hinzufügen** eines Laufzeitservers mit demselben Namen wie ein Einstellungseintrag **überdeckt** ihn – die Laufzeitkonfiguration hat Vorrang. Der ursprüngliche Einstellungseintrag wird nicht geändert.
- **Entfernen** eines Laufzeitservers, der einen Einstellungseintrag überdeckte, **hebt die Überdeckung auf** – die einstellungsdefinierte Konfiguration wird bei der nächsten Verbindung wieder aktiv.
- **Daemon-Neustart** entfernt alle Laufzeiteinträge. Nur einstellungsdefinierte Server überleben Neustarts. Laufzeitserver sind auf die Lebensdauer der Session beschränkt.
- **`GET /workspace/mcp`** meldet die zusammengeführte Ansicht – sowohl einstellungsdefinierte als auch Laufzeitserver erscheinen im `servers[]`-Array. Es gibt heute keine Wire-Ebene-Unterscheidung zwischen den beiden Ursprüngen im Snapshot.

### Ereignisse

Beide Routen emittieren **Workspace-weite** SSE-Ereignisse (alle aktiven Session-Busse empfangen sie):

| Ereignis            | Ausgelöst bei                          | Payload-Felder                                                                    |
| ------------------- | -------------------------------------- | --------------------------------------------------------------------------------- |
| `mcp_server_added`   | `POST` erfolgreich (nicht übersprungen) | `name`, `transport`, `replaced`, `shadowedSettings`, `toolCount`, `originatorClientId` |
| `mcp_server_removed` | `DELETE` erfolgreich (nicht übersprungen)| `name`, `wasShadowingSettings`, `originatorClientId`                              |
Übersprungene Antworten (`budget_warning_only`, `not_present`) emittieren KEINE Ereignisse.

Budgetbezogene Ereignisse von der vorhandenen `mcp_guardrail_events`-Oberfläche (`mcp_budget_warning`, `mcp_child_refused_batch`) werden ebenfalls ausgelöst, wenn Laufzeithinzufügungen die Budgetschwelle überschreiten.

## Weiter geht es

- **Einen langlebigen Daemon einrichten?** [Lokale Startvorlagen (systemd / launchd / nohup / tmux)](./qwen-serve-deploy-local.md) für v0.16-alpha (nur lokal).
- **Einen Client erstellen?** Siehe den [DaemonClient TypeScript quickstart](../developers/examples/daemon-client-quickstart.md) und die [HTTP-Protokollreferenz](../developers/qwen-serve-protocol.md).
- **Den Quellcode lesen?** Bridge-Code befindet sich unter `packages/cli/src/serve/`; SDK-Client unter `packages/sdk-typescript/src/daemon/`.
- **Die Roadmap verfolgen?** Der Fortschritt von Stage 1.5 / Stage 2 wird im Issue [#3803](https://github.com/QwenLM/qwen-code/issues/3803) verfolgt.