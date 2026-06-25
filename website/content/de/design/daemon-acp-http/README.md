# Daemon ACP-over-HTTP → Offizieller ACP Streamable HTTP Transport

> Ziele: `daemon_mode_b_main`. Branch: `feat/daemon-acp-http-streamable`.
> Autor: arnoo.gao. Datum: 2026-05-24. Status: **Design v1 → Implementation**.
> Design-First gemäß Repo-Workflow: Dieses Dokument landet vor/mit dem Implementierungs-PR, sodass der Wire-Contract überprüfbar ist.

---

## 0. TL;DR

Der Daemon (`qwen serve`) spricht derzeit einen **maßgeschneiderten REST+SSE-Dialekt** mit Web-/SDK-Clients, während er **echtes ACP JSON-RPC über stdio** mit dem gestarteten `qwen --acp`-Kindprozess spricht. Dieser Vorschlag fügt einen **zweiten nordwärtigen Transport** hinzu, der den **offiziellen ACP Streamable HTTP Transport** (RFD #721) an einem einzigen `/acp`-Endpunkt implementiert, sodass jeder ACP-native Client (Zed, Goose, zukünftige SDKs) den Daemon direkt über das Standardprotokoll steuern kann – ohne qwen-spezifische REST-Kenntnisse.

**Entscheidung: Dual-Transport, additiv.** Der neue `/acp`-Endpunkt wird neben der bestehenden REST-Oberfläche bereitgestellt und verwendet dieselbe `HttpAcpBridge` + `EventBus` im Hintergrund. Die REST-API wird _nicht_ entfernt. Begründung in §6.

**Entscheidung: Erweiterungs-Namespace = `_qwen/…`** (Single-Underscore-Präfix, die von der ACP-Spezifikation reservierte Form für benutzerdefinierte Methoden) für Daemon-Funktionen, die keine standardmäßige ACP-Methode haben (Modellwechsel, Workspace-Inspektion, Heartbeat, Multi-Client-Berechtigungsrichtlinie, SSE-Backpressure-Tuning). Begründung in §5.

Eine vollständige, lokal ausführbare Referenzimplementierung wird in diesem PR mitgeliefert (`packages/cli/src/serve/acp-http/`) plus ein Verifikations-Harness (`scripts/acp-http-smoke.mjs`).

---

## 1. Hintergrund – was „ACP über HTTP“ heute bedeutet

Drei Ebenen (verifiziert bei Commit `0c0430939`):

```
┌──────────────┐  bespoke REST + SSE (HTTP/1.1)   ┌────────────┐  ACP JSON-RPC   ┌──────────────┐
│ web / SDK    │ ───────────────────────────────► │  qwen      │  (stdio NDJSON) │ qwen --acp   │
│ client       │ ◄─── GET /session/:id/events ──── │  serve     │ ◄─────────────► │ child (Agent)│
│ (ACP client) │       (text/event-stream)        │  (daemon)  │  ndJsonStream   │              │
└──────────────┘                                   └────────────┘                 └──────────────┘
        northbound: NOT ACP wire                       bridge          southbound: real ACP
```

### 1.1 Nordwärts (Client ↔ Daemon) – maßgeschneidert, heute

- Express 5 App in `packages/cli/src/serve/server.ts` (~30 Routen).
- Diskrete REST-Verben, **nicht** JSON-RPC:
  - `POST /session` (erstellen), `POST /session/:id/prompt`, `POST /session/:id/cancel`,
    `POST /session/:id/load|resume`, `POST /session/:id/model`,
    `POST /session/:id/permission/:requestId`, `POST /session/:id/heartbeat`,
    `DELETE /session/:id`, plus `/workspace/*`, `/capabilities`, `/health`.
- Server→Client-Streaming: `GET /session/:id/events` → `text/event-stream`.
  - Frames: `id: <n>\nevent: <type>\ndata: <json>\n\n` (`server.ts:formatSseFrame`, ~2626).
  - Pro-Sitzung **monoton steigende `id`** + `Last-Event-ID`-Wiederaufnahme, gestützt durch einen
    Ringpuffer `EventBus` (`acp-bridge/src/eventBus.ts`).
  - Ereignis-`type`s: `session_update`, `client_evicted`, `slow_client_warning`,
    `state_resync_required`, `stream_error`, …
- Auth: `Authorization: Bearer <token>` (`serve/auth.ts`), CORS deny + Host-Allowlist.
- Backpressure: pro-Verbindung serialisierte Schreibkette + 15 s Heartbeat-Kommentare.

### 1.2 Südwärts (Daemon ↔ Kind) – bereits ACP

- `acp-bridge/src/spawnChannel.ts` startet `qwen --acp`, umschließt stdin/stdout mit
  `ndJsonStream` von `@agentclientprotocol/sdk` (`^0.14.1`).
- `acp-bridge/src/bridge.ts:729` `new ClientSideConnection(() => client, channel.stream)`
  — der Daemon ist der ACP **Client**, das Kind ist der ACP **Agent**.
- Erweiterungsmethoden bereits in Verwendung auf dieser Verbindung: `unstable_setSessionModel`,
  `unstable_resumeSession`, `unstable_listSessions` (`acp-integration/acpAgent.ts`).

### 1.3 Warum die Nordwärts-Verbindung migrieren

- Jeder Client (webui, TS SDK, Java SDK, Python SDK, VSCode companion) implementiert
  das maßgeschneiderte REST-Mapping neu. Ein ACP-Standardendpunkt erlaubt ACP-nativen Editoren
  den Anschluss ohne qwen-spezifische Klebearbeit.
- Richtet die entfernte Oberfläche des Daemons an dem Protokoll aus, das er bereits intern spricht.

---

## 2. Ziel: ACP Streamable HTTP (RFD #721)

Gemergter **Entwurf** RFD (`agentclientprotocol/agent-client-protocol#721`, gemergt 2026-04-22).
Noch nicht normativ; noch in keinem SDK. Wir implementieren gegen das Wire-Design des RFD.

### 2.1 Endpunkt & Verben (einzelner `/acp`)

| Verb          | Verhalten                                                                                                                                                                                                                                        |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /acp`   | JSON-RPC senden. `initialize` → **`200`** + JSON-Text (Fähigkeiten) und setzt `Acp-Connection-Id`. Alle anderen Anfragen/Benachrichtigungen → **`202 Accepted`**, leerer Textkörper; die _Antwort_ (falls vorhanden) wird über den zugehörigen langlebigen SSE-Stream zugestellt. |
| `GET /acp`    | Einen langlebigen **SSE**-Stream öffnen. (`Upgrade: websocket` → WebSocket; **verschoben**, siehe §7.)                                                                                                                                                     |
| `DELETE /acp` | Verbindung beenden → `202`.                                                                                                                                                                                                               |
### 2.2 Zweistufige langlebige Streams

- **Verbindungsbezogener Stream**: `GET /acp` mit Header `Acp-Connection-Id`, kein Session-Header. Überträgt verbindungsbezogene Antworten (`session/new`, `session/load`, `authenticate`) und Benachrichtigungen.
- **Sitzungsbezogener Stream**: `GET /acp` mit `Acp-Connection-Id` **und** `Acp-Session-Id`. Überträgt `session/update`-Benachrichtigungen, **Agent→Client-Anfragen** (`session/request_permission`, `fs/read_text_file`, …) und Antworten auf Session-POSTs (`session/prompt`, `session/cancel`).

### 2.3 Identität (3 Ebenen)

- `Acp-Connection-Id` (HTTP-Header) – Transportbindung, wird bei `initialize` erstellt.
- `Acp-Session-Id` (HTTP-Header) – erforderlich für sitzungsbezogene GET + Session-POSTs.
- `sessionId` (JSON-RPC-Parameter) – innerhalb der Methodenparameter (muss mit dem Header übereinstimmen).

### 2.4 Abweichungen von MCP StreamableHTTP

ACP verwendet **langlebige** Streams (kein pro-Request-SSE), **zwei** ID-Header (Verbindung vs. Session), `202` für Nicht-`initialize`, HTTP/2-Pflicht, WebSocket-Pflicht-Client. Wir übernehmen das Single-Endpoint + POST/GET-SSE + Session-Header-Skelett, passen es aber an das langlebige Zwei-ID-Modell an. Wir **verwenden nicht** `@modelcontextprotocol/sdk`'s `StreamableHTTPServerTransport` (sein pro-Request-Stream-Modell und einzelnes `Mcp-Session-Id` passen nicht).

### 2.5 Standardmethoden (aus aktuellem Schema bestätigt)

- Client→Agent-Anfragen: `initialize`, `authenticate`, `session/new`, `session/load`, `session/prompt`, `session/resume`, `session/close`, `session/list`, `session/set_mode`, `session/set_config_option`, `logout`.
- Client→Agent-Benachrichtigung: `session/cancel`.
- Agent→Client-Anfragen: `fs/read_text_file`, `fs/write_text_file`, `session/request_permission`, `terminal/create|output|wait_for_exit|kill|release`.
- Agent→Client-Benachrichtigung: `session/update`.

---

## 3. Architektur des neuen Transports

Der Daemon muss nordwärts eine **ACP-Agent-Oberfläche über HTTP** bereitstellen, während er südwärts ein ACP-**Client** zum Kind-Prozess bleibt. Die `/acp`-Schicht ist daher ein **JSON-RPC-Router**, der den HTTP-Transport terminiert und in die bestehende `HttpAcpBridge` einbindet.

```
            POST /acp (JSON-RPC requests/responses/notifs)
client  ──────────────────────────────────────────────►  ┌───────────────────────────┐
(editor)                                                  │  AcpHttpTransport         │
        ◄── GET /acp  (verbindungsbezogenes SSE) ───────  │  - Verbindungsregister   │
        ◄── GET /acp  (sitzungsbezogenes SSE) ──────────  │  - JSON-RPC id-Korrelation│
                                                          │  - Methoden-Dispatch      │
                                                          └────────────┬──────────────┘
                                                                       │ verwendet wieder
                                                          ┌────────────▼──────────────┐
                                                          │  HttpAcpBridge + EventBus  │  (unverändert)
                                                          └────────────┬──────────────┘
                                                                       │ ACP stdio (unverändert)
                                                                 qwen --acp child
```

### 3.1 Neues Modul-Layout (`packages/cli/src/serve/acp-http/`)

| Datei                     | Verantwortung                                                                                                                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `index.ts`                | `mountAcpHttp(app, bridge, opts)` – registriert `/acp`-Routen auf der bestehenden Express-App.                                                                                             |
| `connection-registry.ts`  | `Acp-Connection-Id` → `AcpConnection` (Verbindungs-SSE-Writer, `Map<sessionId, SessionStream>`, ausstehende Agent→Client-Anfragen nach JSON-RPC-Id, monotone Id-Vergabe). TTL + DELETE-Bereinigung. |
| `json-rpc.ts`             | Hilfsfunktionen zum Parsen/Validieren/Serialisieren von JSON-RPC 2.0; Fehlercodes (`-32600` etc.); `_qwen/`-Namespace-Guard.                                                              |
| `dispatch.ts`             | Bildet eingehende JSON-RPC-Methoden → `HttpAcpBridge`-Aufrufe ab. Bildet `BridgeEvent`s → ausgehende JSON-RPC-Frames ab. Die Übersetzungstabelle (§4).                                      |
| `sse-stream.ts`           | Langlebiger SSE-Writer (verwendet das Gegendruck-/Heartbeat-Muster aus `server.ts`). Unterscheidet sich von REST `/events` (anderes Framing: vollständige JSON-RPC-Objekte, keine qwen-Ereignis-Envelopes). |

Keine Änderung an `bridge.ts` / `eventBus.ts` (nur hinzugefügte Konsumenten).

### 3.2 Verbindungs- und Sitzungslebenszyklus

1. `POST /acp {initialize}` → erstellt `connectionId`, legt `AcpConnection` an, antwortet `200` mit `{protocolVersion, agentCapabilities, _meta:{qwen:{…}}}` + `Acp-Connection-Id`-Header.
2. Client öffnet `GET /acp` (verbindungsbezogen) mit `Acp-Connection-Id`.
3. `POST /acp {session/new}` → `202`; Daemon ruft `bridge.createSession(...)` auf; sendet die JSON-RPC-Antwort (mit `sessionId`) über den **Verbindungs**-Stream.
4. Client öffnet `GET /acp` (sitzungsbezogen) mit `Acp-Connection-Id`+`Acp-Session-Id`; Daemon `bridge.subscribeEvents(sessionId)` und leitet übersetzte Frames weiter.
5. `POST /acp {session/prompt}` → `202`; `bridge.sendPrompt(...)`; `session/update`-Benachrichtigungen werden live auf dem Sitzungs-Stream gesendet; die endgültige prompt-**Antwort** (`{id, result:{stopReason}}`) wird auf dem Sitzungs-Stream gesendet, sobald sie feststeht.
6. Agent→Client-Anfrage (z. B. `session/request_permission`) wird als JSON-RPC-**Anfrage** auf dem Sitzungs-Stream mit einer vom Daemon vergebenen Id gesendet; der Client antwortet per `POST /acp {id, result}`; `dispatch` löst sie über die Berechtigungs-API der Bridge auf.
7. `DELETE /acp` (oder Verbindungs-Stream-Schließen + TTL) baut Sitzungen/Abonnements ab.
---

## 4. Übersetzungstabelle (Brücke ⇄ ACP/HTTP)

### 4.1 Eingehend (Client POST → Brücke)

| ACP-Methode                                 | Brückenaufruf                                           | Antwort weitergeleitet an               |
| ------------------------------------------- | ------------------------------------------------------- | --------------------------------------- | ----------------- |
| `initialize`                                | (keine; Fähigkeiten aus `capabilities.ts`)              | inline `200`                            |
| `authenticate`                              | existierender Auth-Provider (`serve/auth/*`)            | Verbindungsstream                       |
| `session/new`                               | `bridge.createSession`                                  | Verbindungsstream                       |
| `session/load` / `session/resume`           | `bridge.restoreSession('load'                           | 'resume')`                              | Verbindungsstream |
| `session/prompt`                            | `bridge.sendPrompt`                                     | Sitzungsstream (zurückgestellt bis Abschluss) |
| `session/cancel` (Benachrichtigung)         | `bridge.cancel`                                         | —                                       |
| `session/list`                              | `bridge.listSessions` (`unstable_listSessions`)         | Verbindungsstream                       |
| `session/set_mode`                          | Approval-Mode-Routenlogik                               | Sitzungsstream                          |
| JSON-RPC **Antwort** (auf Agent→Client-Anfrage) | ausstehende auflösen (§4.3)                           | —                                       |
| `_qwen/session/set_model`                   | `bridge.setSessionModel` (`unstable_setSessionModel`)   | Sitzungsstream                          |
| `_qwen/workspace/list` etc.                 | Arbeitsbereich-Instrospektionsrouten                    | Verbindungsstream                       |
| `_qwen/session/heartbeat`                   | `bridge.heartbeat`                                      | Verbindungsstream                       |

### 4.2 Ausgehend (BridgeEvent → JSON-RPC auf Sitzungsstream)

| BridgeEvent.type                                                    | Gesendet als                                                       |
| ------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `session_update`                                                    | `{method:"session/update", params:<data>}` Benachrichtigung        |
| Berechtigungsanfrage                                                | `{id:<n>, method:"session/request_permission", params}` Anfrage    |
| `client_evicted` / `slow_client_warning` / `state_resync_required`  | `{method:"_qwen/notify", params:{kind,…}}` Benachrichtigung        |
| `stream_error`                                                      | JSON-RPC-Fehlerantwort auf der aktiven Prompt-ID (oder `_qwen/notify`) |
| Prompt-Abschluss                                                    | `{id:<promptId>, result:{stopReason}}`                              |

### 4.3 Ausstehende Agent→Client-Anfragen

`AcpConnection` verwaltet `Map<jsonRpcId, {sessionId, kind, bridgeRequestId, resolve}>`.
Wenn der Client ein JSON-RPC-Antwortobjekt per POST sendet, gleicht `dispatch` die `id` ab und ruft dann den Brückenauflösungspfad auf (z. B. internes Äquivalent von `POST /session/:id/permission/:requestId`).

> **v1-Status:** nur der `session/request_permission`-Agent→Client-Rundlauf ist implementiert. `fs/*`- und `terminal/*`-Agent→Client-Weiterleitung sind **zurückgestellt** (§7) – der Daemon gibt noch keine `fs`/`terminal`-Client-Fähigkeitsaushandlung auf `/acp` bekannt, daher sollten ACP-Clients in v1 keine Dateisystem-/Terminal-Semantik über diesen Transport erwarten. Der angestrebte Endzustand (Weiterleitung von `fs/*` an den Client; Rückfall auf das Arbeitsbereichs-Dateisystem des Daemons, wenn der Client nicht über die `fs`-Fähigkeit verfügt) ist das in §7 beschriebene Follow-up.

---

## 5. Erweiterungsstrategie (Anforderung #2)

ACP reserviert alle Methoden, die mit `_` beginnen, für benutzerdefinierte Erweiterungen und stellt `_meta` auf jedem Typ bereit. Der südliche Teil der Codebasis verwendet bereits `unstable_*`-Methodennamen.

**Nordseite-Wahl:** anbieternamensräumliche **`_qwen/<Bereich>/<Verb>`**-Methodennamen (konformer `_`-Präfix). Fähigkeiten werden unter `agentCapabilities._meta.qwen` bei `initialize` angekündigt, sodass Clients die Funktionen vor der Nutzung erkennen können.

| Bedarf                                                | Keine standardmäßige ACP-Methode? | Erweiterung                                               |
| ---------------------------------------------------- | -------------------------------- | --------------------------------------------------------- |
| Modellwechsel                                        | ja                               | `_qwen/session/set_model`                                 |
| Arbeitsbereich MCP/Fertigkeiten/Anbieter/Umgebungs-Introspection | ja                               | `_qwen/workspace/list`, `_qwen/workspace/<Bereich>`       |
| Heartbeat / letzte Aktivität                         | ja                               | `_qwen/session/heartbeat`                                 |
| Multi-Client-Berechtigungsrichtlinie (Konsens/Designiert) | teilweise                        | `session/request_permission` + `_meta.qwen.policy`        |
| SSE-Gegendruckabstimmung (`maxQueued`)                | ja                               | `Acp-Qwen-Max-Queued`-Header auf Session-GET              |
| Resume-Cursor (Ring `Last-Event-ID`)                  | RFD Phase 4                      | `Last-Event-ID`-Header + `_meta.qwen.eventId` auf Frames  |
Standardmethoden werden **niemals** umbenannt; Erweiterungen sind streng additiv und ignorierbar.

---

## 6. Dual-Transport vs. Ersetzung (Anforderung #4)

**Entscheidung: Dual-Transport (additiv).**

- Der offizielle Transport ist ein **Entwurfs**-RFD, nicht normativ und in keinem SDK vorhanden – eine harte Ersetzung würde uns an ein nicht ratifiziertes Design koppeln und gleichzeitig WebUI + 3 SDKs + VSCode Companion brechen.
- Die REST-Oberfläche enthält Funktionen, die noch keine saubere ACP-Abbildung haben (Workspace-Introspection, Multi-Client-Berechtigungsvermittlung, Ringbuffer-Resume, Capability-Registry). Diese werden auf `/acp` zu `_qwen/*`-Erweiterungen degradiert, aber die REST-Oberfläche bleibt maßgeblich, bis der RFD ratifiziert ist.
- Beide Transporte teilen sich eine **einzige** `HttpAcpBridge`- + `EventBus`-Instanz, sodass es keine Zustandsverdopplung gibt – `/acp` und `/session/*` können sogar gleichzeitig dieselbe Live-Sitzung steuern (Multi-Client wird von der Bridge bereits unterstützt).
- Toggle (v1, ausgeliefert): standardmäßig aktiviert; **`QWEN_SERVE_ACP_HTTP=0`** deaktiviert den Mount. Ein `--no-acp-http`-CLI-Flag und ein `acp_http`-Tag in `/capabilities` zur Client-Feature-Erkennung sind auf einen Folge-PR **verschoben** (nicht in v1) – bis dahin erkennen Clients den Transport durch Abfragen von `POST /acp {initialize}`.

Migrationspfad: Sobald der RFD ratifiziert ist und SDKs ausgeliefert werden, können REST-Routen als dünner Kompatibilitäts-Shim über `/acp` umformuliert werden (separater, späterer PR).

---

## 7. Umfang des Implementierungs-PRs

**Im Umfang (lauffähig + lokal verifiziert):**

- `POST /acp`-Dispatch für `initialize`, `session/new`, `session/prompt`, `session/cancel`, `session/load`, JSON-RPC-Antwortverarbeitung.
- Verbindungsbezogene + sitzungsbezogene `GET /acp`-SSE-Streams mit JSON-RPC-Framing.
- `session/update`-Streaming + finale Prompt-Antwort-Korrelation.
- `session/request_permission`-Agent→Client-Rundlauf.
- `_qwen/session/set_model`-Erweiterung als ausgearbeitetes Beispiel für #2.
- Wiederverwendung von Bearer-Auth + Host-Allowlist (gleiche Middleware wie REST).
- Unit-Tests (`acp-http/*.test.ts`) + ein Black-Box-Smoke-Skript, das einen echten Daemon steuert.

**Verschoben (dokumentiert, jetzt nicht gebaut):**

- WebSocket-Upgrade-Pfad (RFD-erforderliche Client-Fähigkeit; SSE reicht für lokale Verifizierung).
- HTTP/2-Multiplexing (wir verwenden HTTP/1.1; POST und langlebige GET verwenden separate Sockets, was für CLI/Node-Clients und Browser mit ≤6 Verbindungen funktioniert). Dokumentierte Abweichung.
- Vollständige `fs/*`- + `terminal/*`-Agent→Client-Weiterleitung (der Berechtigungspfad beweist den Mechanismus; der Rest ist mechanische Nacharbeit).
- SSE-Resumability-Härtung in Parität mit dem Ringpuffer (Phase 4 im RFD).

---

## 8. Lokaler Verifizierungsplan

1. `npm run build` (oder Workspace-Build von `cli` + `acp-bridge`).
2. Daemon starten: `qwen serve --listen 127.0.0.1:0 --token <t>` (oder Token aus Umgebungsvariable).
3. `node scripts/acp-http-smoke.mjs` ausführen:
   - `POST /acp {initialize}` → `200` + `Acp-Connection-Id` erwarten.
   - Verbindungs-SSE öffnen; `POST {session/new}` → Antwort im Stream erwarten.
   - Sitzungs-SSE öffnen; `POST {session/prompt:"say hi"}` → mindestens ein `session/update` gefolgt von einem finalen `{result:{stopReason}}` erwarten.
   - Ein Tool auslösen, das eine Berechtigung benötigt → `session/request_permission`-Anfrage erwarten, eine Genehmigungsantwort POSTen → Prompt-Vervollständigung erwarten.
   - `POST {_qwen/session/set_model}` → Modellwechsel + `session/update` erwarten.
4. Vitest: `acp-http/*.test.ts` grün.

---

## 9. Risiken

| Risiko                                 | Minderung                                                                |
| -------------------------------------- | ------------------------------------------------------------------------ |
| RFD-Änderungen vor Ratifizierung       | Hinter Capability-Tag + `_qwen`-Namespace; isoliertes Modul; einfach zu überarbeiten. |
| HTTP/1.1 vs. erforderliches HTTP/2     | Localhost-/CLI-Clients nicht betroffen; dokumentiert; h2 ist später ein Transporttausch. |
| Zwei Transporte auf einer Bridge Race  | Bridge unterstützt bereits Multi-Client; Wiederverwendung ihrer Sperrmechanismen.       |
| `fs/*`-Weiterleitung vs. daemon-lokales FS | Capability-gesteuert: weiterleiten, wenn Client `fs` deklariert, sonst lokal.         |

---

## 10. Implementierungs- & Verifizierungsprotokoll (v1)

Implementiert in `packages/cli/src/serve/acp-http/` (`json-rpc.ts`, `sse-stream.ts`, `connection-registry.ts`, `dispatch.ts`, `index.ts`), eingebunden von `server.ts` über `mountAcpHttp(app, bridge, { boundWorkspace })`.

### Automatisiert (`packages/cli/src/serve/acp-http/*.test.ts`)

`transport.test.ts` startet einen echten Express-Server + den echten `mountAcpHttp` über eine steuerbare Fake-Bridge und treibt ihn mit `fetch` + manuellem SSE-Parsing an. 15 Tests grün, abdeckend: `initialize` 200 + `Acp-Connection-Id`; unbekannte Verbindung 400; `session/new`-Antwort im Verbindungsstream; Prompt → `session/update`-Stream + finales Ergebnis korreliert; `session/request_permission`-Agent→Client→Agent-Rundlauf; `_qwen/session/set_model`; Methode nicht gefunden; `DELETE`-Abbau.

### Live-Daemon (echtes Modell)

Gestartet: `qwen serve --port 8767 --token … --workspace …` (Bundle-Einstieg, sodass der gestartete `qwen --acp`-Kindprozess in sich abgeschlossen ist) und `scripts/acp-http-smoke.mjs` ausgeführt:

```
✓ initialize: connectionId=… protocolVersion=1
✓ session/new: sessionId=…
→ prompt: "Reply with the single word: pong"
pong
✓ prompt complete: 10 session/update frames, stopReason=end_turn
✓ DELETE /acp — connection closed
ALL CHECKS PASSED ✅
```
Der Fehlerpfad wurde auch live bestätigt: Als der Child-Prozess nicht starten konnte, erschien das Bridge-Timeout beim Client als JSON-RPC-Fehlerframe auf dem Verbindungsstream (`{"id":2,"error":{"code":-32603,…}}`), was die ID-Korrelation und die 202/SSE-Aufteilung unter Fehlerbedingungen belegte.

### Review-Einklappung — Bridge-vergebene clientId (in Live-Verifikation gefunden)

Der erste Live-Lauf schlug bei `session/prompt` mit _"client id … ist nicht für die Sitzung registriert"_ fehl. Ursache: `spawnOrAttach`/`loadSession` **ignorieren** eine vom Aufrufer bereitgestellte clientId, die die Bridge nie vergeben hat, und vergeben eine frische (zurückgegeben in `BridgeSession.clientId`); der Dispatcher wiederholte die eigene (nicht registrierte) id des Verbindung auf `sendPrompt`. Behebung: Die von der Bridge vergebene id auf dem `SessionBinding` persistieren und bei jedem sitzungsbezogenen Aufruf (`sessionCtx`) wiederholen. Erneute Verifikation oben grün.

---

## 11. Review-Runde 2 — Einklappungen

Zwei unabhängige Reviews (Korrektheit/Nebenläufigkeit + Protokollkonformität/Sicherheit) plus eine Selbstlektüre.
Alle Korrekturen durch die erweiterte Vitest-Suite (**18 Tests**) + einen frischen Live-Smoke-Run verifiziert
(21 `session/update`-Frames → `stopReason=end_turn`).

| #   | Schweregrad | Befund                                                                                                                                                                                                                                                         | Behebung                                                                                                                                                                                           |
| --- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | **P0**      | Sitzungsstream-Wiederverbindung war dauerhaft tot: `SessionBinding.abort` wurde einmal erstellt und wiederverwendet; beim Schließen des Streams wurde es für immer abgebrochen, sodass ein Wiederverbindungsversuch `subscribeEvents(signal)` ein bereits abgebrochenes Signal bekam und null Ereignisse erhielt. | `attachSessionStream` installiert nun einen **frischen** `AbortController` pro Stream (und schließt vorherige Streams); `index.ts` pumpt auf diesem frischen Signal.                                 |
| R2  | **P0**      | `await dispatcher.handle()` lief **nach** `res.end(202)`; ein werfender Bridge-Aufruf (insbesondere der un-try/caught `isResponse`-Pfad) würde zurückweisen und als unbehandelte Zurückweisung auftauchen → möglicher Daemon-Crash.                              | Den `isResponse`-Pfad in try/catch eingewickelt; `.catch()` auf dem awaited `handle(...)` und auf `pumpSessionEvents(...)`.                                                                        |
| R3  | **P1**      | **Keine Verbindungs→Sitzungsbesitz**: jede authentifizierte Verbindung konnte den Sitzungs-SSE für _jede_ sessionId im Arbeitsbereich öffnen oder auffordern (Mithören; Aufforderung wurde nur zufällig durch den Fehler 'nicht registrierte clientId' blockiert). | `AcpConnection.ownedSessions` wird von `session/new`/`load`/`resume` befüllt; der Sitzungsstream gibt `403` zurück und sitzungsbezogene POSTs geben `INVALID_PARAMS` für nicht besessene IDs (`requireOwned`). |
| R4  | **P1**      | `mountAcpHttp`-Handle wurde verworfen → TTL-Sweep-Timer + Live-SSE-Streams verloren beim Herunterfahren.                                                                                                                                                      | Handle auf `app.locals` abgelegt; `runQwenServe`-Close-Hook ruft `dispose()` vor `bridge.shutdown()` auf (spiegelt die Device-Flow-Registrierung).                                                  |
| R5  | **P1**      | **Ausstehende Berechtigungsleck**: Das Schließen einer Sitzung/Verbindung mit ausstehender Berechtigung ließ die Bridge blockiert auf eine Abstimmung warten.                                                                                                    | `closeSessionStream`/`destroy` stornieren passende ausstehende Anfragen über eine injizierte `onAbandonPending` → `cancelAbandonedPermission`.                                                      |
| R6  | **P1**      | Vor-Anhänge-Frame-Puffer (`connBuffer`/`binding.buffer`) waren unbegrenzt.                                                                                                                                                                                     | Auf 256 Frames begrenzt (älteste verwerfen), entsprechend dem EventBus `maxQueued`.                                                                                                                |
| R7  | **P2**      | `initialize` ignorierte die vom Client angeforderte `protocolVersion`.                                                                                                                                                                                        | Verhandelt `min(requested, 1)`.                                                                                                                                                                    |
| R8  | **P2**      | Keine Kreuzprüfung von `Acp-Session-Id` ↔ `params.sessionId` (RFD §2.3).                                                                                                                                                                                     | POST stellt sicher, dass sie übereinstimmen; Nichtübereinstimmung → `INVALID_PARAMS`.                                                                                                             |
| R9  | **P2**      | `session/cancel`-Anforderungsformular (mit id) wurde nie beantwortet; doppeltes top-level `_meta.qwen`.                                                                                                                                                        | Antworten, wenn eine id vorhanden ist; einzelnes `agentCapabilities._meta.qwen`.                                                                                                                   |
### Akzeptiert / dokumentiert (nicht behoben in v1)

- **Prompt-Resultat vs. nachlaufendes `session/update`-Ordering** (P2): `handlePrompt` erwartet `sendPrompt` und
  schreibt dann den Result-Frame, während Updates gleichzeitig streamen. In der Praxis veröffentlicht die Bridge alle
  `session/update`s auf den Bus, bevor `sendPrompt` aufgelöst wird, und beide teilen sich eine geordnete SSE-Schreibkette,
  daher landet das Resultat zuletzt (bestätigt: 21 Updates, dann Resultat). Eine strikte Barriere ist eine mögliche spätere
  Härtung, falls sich ein Client-Reducer als empfindlich erweist.
- **Browser `EventSource` kann kein `Authorization` setzen** — `/acp` GET-Streams erfordern den Bearer-Header,
  daher benötigen Browser den deferred WebSocket-Pfad (§7); CLI/Node-Clients sind nicht betroffen.
- Die eigentliche Vertrauensgrenze des Daemons bleibt der **Bearer-Token + Single-Workspace-Bind** (wie bei der
  REST-Oberfläche); die Besitzprüfung von R3 ist Defense-in-Depth + Vertragskorrektheit, keine Mandantengrenze.

---

## 12. Review-Runde 3 — PR-Bot-Einarbeitungen (#4472)

Zwei automatisierte PR-Reviewer plus der Zusammenfassungs-Bot.
Alle Korrekturen durch die Suite (jetzt **22 Tests**) + einen frischen Live-Durchlauf (16 `session/update` → `end_turn`) verifiziert.

| #   | Schweregrad | Feststellung                                                                                                                                                                                                                                                                                                               | Behebung                                                                                                                                                             |
| --- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | **P0**      | `handlePrompt`s `AbortController` wurde nie abgebrochen — ein sich trennender/abbrechender Client ließ den Agenten weiterlaufen (verbrauchte Modellkontingent, blockierte das Session-FIFO). Von beiden Bots + 5 Sub-Agenten gemeldet.                                                                                    | `promptAbort` auf `SessionBinding` abgelegt; abgebrochen durch `session/cancel` und durch Session/Connection-Teardown (`closeSessionStream`/`destroy`).                |
| B2  | **P0**      | `sessionCtx` fehlt `fromLoopback` → jede ACP-Berechtigungsabstimmung als Remote behandelt; `local-only`-Richtlinie würde Loopback-Clients ablehnen.                                                                                                                                                                        | Loopback bei `initialize` erfassen (Kernel `remoteAddress`, nicht fälschbare Header) → `AcpConnection.fromLoopback` → durch `sessionCtx` gefädelt.                   |
| B3  | **P0**      | SSE-Schreibfehler still geschluckt → Zombie-Streams (Heartbeats feuern, null Events ausgeliefert, keine Logs).                                                                                                                                                                                                             | Erster Schreibfehler loggt und schließt den Stream.                                                                                                                  |
| B4  | **P0**      | Idle-Sweep zerstörte Verbindungen ohne Log + ohne Verbindungslimit (Initialize-Überflutung).                                                                                                                                                                                                                              | Sweep loggt jedes Ausräumen; `pumpSessionEvents` ruft `touch()` auf (lange stille Prompts werden nicht ausgeräumt); `maxConnections`-Limit (64) → `503`.              |
| B5  | **P1**      | `sessionCtx` fiel stillschweigend auf die unregistrierte clientId der Verbindung zurück, wenn das Binding keine hatte (ungtest, immer in `FakeBridge` gefeuert).                                                                                                                                                          | Werfen bei fehlender gestempelter clientId (Invariantenverletzung); `FakeBridge` stempelt jetzt eine.                                                                |
| B6  | **P1**      | `session/new                                                                                                                                                                                                                                                                                                               | load                                                                                                                                                                 | resume`accepted`cwd` nicht validiert (REST validiert String/Länge/Absolutheit — Verstärkungs-DoS). | Gemeinsame `parseOptionalWorkspaceCwd` (String, ≤4096, absolut). |
| B7  | **P1**      | `session/prompt` leitete ein nicht validiertes `prompt` an die Bridge weiter.                                                                                                                                                                                                                                             | `validatePrompt` (nicht-leeres Array von Objekten), spiegelnd REST.                                                                                                  |
| B8  | **P1**      | Rohe Bridge-Fehlermeldungen an den Client zurückgegeben.                                                                                                                                                                                                                                                                  | `toRpcError` bildet bekannte Bridge-Fehler auf codierte, client-sichere Formen ab; unbekannt → generischer `Internal error` (vollständiges Detail weiterhin auf stderr). |
| B9  | **P1**      | `nextId` verwendete sequentielle negative Zahlen — ein Client, der legal negative Ids verwendet, könnte in `pending` kollidieren.                                                                                                                                                                                         | Daemon-stammende Ids sind jetzt Strings (`_qwen_perm_N`), disjunkt von jeder Client-Id.                                                                              |
| B10 | **P2**      | `resolveClientResponse`-Parametertyp schloss `JsonRpcError` aus; Conn-bezogener SSE-Stream hatte kein `onClose`; `DELETE` ohne Header war ein stiller 202; `SseStream.close` führte `onClose` außerhalb von try/catch aus; `session/load`·`resume`·`close` ungetestet.                                                     | Parametertyp zu `JsonRpcResponse` erweitert; Conn-Stream loggt bei Schließen; `DELETE` fehlender Header → `400`; `onClose` in try/catch eingewickelt; load/resume/close + DELETE-400-Tests hinzugefügt. |
**Außerhalb des Gültigkeitsbereichs (Basis-Branch `daemon_mode_b_main`, nicht dieser Diff)** – der zweite Reviewer hat Typfehler in `acpAgent.ts` (`entryCount`/`entrySummary`/`sessionClose`) und andere bereits existierende Punkte angemerkt, die explizit dem Basis-Branch zugeordnet wurden (eingeführt durch #4353). Wird separat verfolgt; hier nicht bearbeitet.

**Noch zurückgestellt** (dokumentiert): Pro-Verbindungs-Geheimnis für `DELETE`/Verbindungsbesitz (Token bleibt die Grenze); WebSocket + HTTP/2 (§7); strikte Prompt-Ergebnis- vs. nachlaufende-Update-Barriere (§11).

---

## 13. Review-Runde 4 — PR-Fold-Ins (rebased auf #4469)

Branch rebased auf `daemon_mode_b_main` (#4353 + #4469) — **sauber, keine Konflikte**. Zwei PR-Reviewer (GPT-5 + qwen3.7-max). Suite jetzt **25 Tests**; live erneut verifiziert (125 `session/update` → `end_turn`).

| #   | Schweregrad | Befund                                                                                                                                                                                          | Fix                                                                                                                                                                                                                                      |
| --- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | **P0**      | Runde-3 „SSE-Write-Fehlerbehandlung" wurde dokumentiert, aber NICHT implementiert – `SseStream` überließ es immer noch den verwerfenden Aufrufern (Zombie-Streams).                                | `writeRaw` übernimmt jetzt die Kontrolle: erste Write-Ablehnung loggt einmal + `close()`; `doWrite` lauscht auch auf `'error'` (lehnt sofort ab, statt auf `'close'` zu warten); `onClose` in try/catch umschlossen.                     |
| C2  | **P1**      | `fromLoopback` wurde nur bei `initialize` erfasst + Helper enger als REST → `local-only`-Stimmen von einem späteren POST wurden falsch bewertet.                                                   | Loopback pro Anfrage durch `handle`→`sessionCtx`/`resolveClientResponse` geleitet; `isLoopbackReq` auf `127.0.0.0/8` + `::ffff:127.*` + `::1` erweitert (entspricht REST).                                                               |
| C3  | **P1**      | Fehler-Routing leitete Stream aus `params.sessionId` ab → Methodenfehler auf Verbindungsebene (`session/load`/`resume`/`close`/`heartbeat`) wurden an einen nicht existierenden Session-Stream weitergeleitet (stiller Verlust). | `CONN_ROUTED_METHODS`-Set; Fehler werden auf demselben Weg wie der Erfolgspfad geroutet.                                                                                                                                                 |
| C4  | **P1**      | `bridge.detachClient` wurde beim Abbau nie aufgerufen → veraltete Bridge-gestempelte Client-IDs verbleiben in `knownClientIds()`/Voter-Sets.                                                    | Registry nimmt eine `DetachSessionFn` entgegen; `closeSessionStream`/`destroy` trennen jede gehaltene Session (Best-Effort).                                                                                                             |
| C5  | **P1**      | `session/close` übersprang lokale Bereinigung, wenn `bridge.closeSession` einen Fehler warf.                                                                                                    | `closeSessionStream` in einen `finally`-Block verschoben.                                                                                                                                                                                |
| C6  | **P2**      | Windows `cwd` (`C:\…`) wurde von `startsWith('/')` abgewiesen.                                                                                                                                  | `path.isAbsolute` (plattformbewusst) entspricht REST.                                                                                                                                                                                    |
| C7  | **P2**      | `protocolVersion` konnte `0`/negativ aushandeln.                                                                                                                                                | Clamp `Math.max(1, Math.min(requested, 1))`; Tests für 0/neg/riesig/ungültig.                                                                                                                                                            |
| C8  | **P2**      | `session/load`/`resume` akzeptierten leere `sessionId`.                                                                                                                                         | Ablehnung mit `INVALID_PARAMS`.                                                                                                                                                                                                           |
| C9  | **P2**      | Fehler von Notification-Form `session/prompt` verschwanden still.                                                                                                                               | Logging auf dem Pfad ohne ID.                                                                                                                                                                                                             |
| C10 | **P2**      | Session-SSE spülte gepufferte Frames vor Headern/`retry:`.                                                                                                                                      | `open()` vor `attachSessionStream`.                                                                                                                                                                                                       |
| C11 | **P2**      | Doppeltes lokales `logStderr`.                                                                                                                                                                  | Gemeinsame `writeStderrLine` aus `utils/stdioHelpers`.                                                                                                                                                                                    |
| C12 | **P2**      | Dokumentation bewarb `--no-acp-http`-Flag, `acp_http`-Fähigkeit-Tag und `fs/*`-Weiterleitung, die nicht in v1 enthalten sind.                                                               | Dokumentation auf die ausgelieferte Oberfläche abgestimmt (nur Umgebungsvariablen-Toggle; `fs/*`+`terminal/*`+Flag+Tag als zurückgestellt markiert).                                                                                     |
Noch zurückgestellt (unverändert): WebSocket + HTTP/2; ein geheimes Element pro Verbindung für `DELETE`/Eigentum (Token + einzelner Workspace bleibt die Grenze); strikte Reihenfolgebeschränkung für Prompt-Ergebnisse; die `as never` Bridge-Grenzen-Casts (gezielt, für ein späteres Adapter-Types-Folge-Update notiert).

---

## 14. Review-Durchlauf 5 — PR-Fold-Ins

Ein weiterer Prüferdurchlauf (qwen3.7-max). Suite **26 Tests**, live erneut verifiziert.

| #   | Schweregrad | Befund                                                                                                                                                                                                                                                                                                                                                                                       | Fix                                                                                                                                                             |
| --- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **P0**      | `resolveClientResponse` löschte den ausstehenden Eintrag, BEVOR `respondToSessionPermission` aufgerufen wurde. Eine fehlerhafte Stimme (`result: {}`) führt dazu, dass der Bridge-Mediator einen Fehler auslöst — und da der ausstehende Eintrag bereits entfernt ist, kann `abandonPendingForSession` beim Abbau ihn nicht abbrechen, sodass der Prompt des Agenten auf einer Stimme hängt, die nie aufgelöst wird (ein Token-Inhaber könnte eine Sitzung mit einem einzigen ungültigen POST blockieren). | Wickle die Stimme in try/catch; bei jedem Fehler falle auf `cancelAbandonedPermission` zurück, sodass der Mediator immer freigegeben wird. Neuer Test deckt den Pfad mit fehlerhafter Stimme ab. |
| D2  | **P1**      | `onClose` des Sitzungsstreams brach nur die Ereignispumpe ab, nicht `binding.promptAbort` — eine Client-Trennung (Tab schließen / Netzwerkabbruch) ließ den laufenden Prompt weiterlaufen (Kontingent + FIFO) bis zur Leerlauf-TTL.                                                                                                                                                               | `onClose` bricht jetzt auch `promptAbort` der Sitzung ab.                                                                                                        |
| D3  | **P1**      | Wenn `pumpSessionEvents` abgelehnt wurde, protokollierte `.catch` nur — der SSE-Stream blieb offen, sendete Heartbeats, aber lieferte nichts (Zombie, kein Wiederverbindungssignal).                                                                                                                                                                                                            | `.catch` ruft jetzt auch `closeSessionStream(sessionId)` auf.                                                                                                    |

---

## 15. Review-Durchlauf 6 — PR-Fold-Ins

Ein weiterer Prüferdurchlauf (qwen3.7-max). Suite **28 Tests**, live erneut verifiziert.

| #   | Schweregrad | Befund                                                                                                                                                                                                                                                                                                    | Fix                                                                                                                                                                                                                                                                                                                                    |
| --- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | **P0**      | `handlePrompt` überschrieb `binding.promptAbort`, ohne den vorherigen Controller abzubrechen — zwei gleichzeitige `session/prompt` für eine Sitzung verwaisten den ersten (läuft bis zum Ende in der Bridge-FIFO, kann nicht von `session/cancel` abgebrochen werden).                                           | Breche den vorherigen `promptAbort` ab, bevor der neue installiert wird. Test hinzugefügt.                                                                                                                                                                                                                                               |
| E2  | **P0**      | Der `subscribeEvents`-wirft-Pfad sendete eine `stream_error`-Benachrichtigung und gab dann `return` (aufgelöst) — das `.catch` des Aufrufers wurde nie ausgelöst, sodass ein Zombie-SSE-Stream zurückblieb (Heartbeats, keine Ereignisse, kein Wiederverbindungssignal).                                         | Wirf nach der Benachrichtigung erneut, sodass das `.catch` des Aufrufers den Stream schließt. Test stellt die Schließung des Prompts sicher.                                                                                                                                                                                          |
| E3  | **P1**      | Der SSE-Heartbeat markierte die Verbindung nicht als aktiv — ein langer Prompt ohne Zwischenereignisse für >30 Minuten wurde wegen Leerlaufes abgeräumt (Streams + Prompts getötet).                                                                                                                            | `SseStream` akzeptiert einen `onHeartbeat`-Hook; beide GET-Handler übergeben `() => conn.touch()`.                                                                                                                                                                                                                                      |
| E4  | **P2**      | `pumpSessionEvents` `.catch` schloss nach sessionId — eine erneute Verbindung zwischen dem Wurf und der Mikrotask könnte den NEUEN Stream töten.                                                                                                                                                              | Identitätssicherung: schließe nur, wenn `binding.stream` noch dieser Stream ist.                                                                                                                                                                                                                                                         |
| E6  | **P2**      | `sendSession` erstellte automatisch eine Bindung — ein späterer Pump-/Antwort-Frame nach `closeSessionStream` erweckte eine Geisterbindung, die bis zu 256 Frames für immer pufferte.                                                                                                                           | `sendSession` ist jetzt nur noch nachschlagend: verwirft Frames, wenn die Sitzung keine aktive Bindung hat.                                                                                                                                                                                                                              |
| E5  | akzeptiert  | `session/load`/`resume` lehnen nicht ab, wenn eine andere Live-Verbindung die Sitzung besitzt ("Hijack").                                                                                                                                                                                                  | **Akzeptiert, nicht geändert:** Die Vertrauensgrenze des Daemons ist der Inhaber des Bearer-Tokens + die Bindung an einen einzelnen Workspace, und die Mehrfach-Client-Anbindung ist beabsichtigt (die Bridge ist von Haus aus multi-client-fähig; REST hat die gleiche Eigenschaft). Ein Token-Inhaber erlangt keine Fähigkeit, die ihm über REST fehlt. Verfolgt mit den anderen Token-Grenzposten (DELETE-Eigentum, §13). |
---

## 16. Review-Runde 7 — PR-Einarbeitungen

Ein weiterer Prüfdurchlauf (qwen3.7-max). Suite mit **30 Tests**, live erneut verifiziert.

| #   | Schweregrad | Befund                                                                                                                                                                                                                         | Korrektur                                                                                                                                                                                                               |
| --- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | **P0**      | Gleichzeitiges `session/close` TOCTOU: `ownedSessions.delete` lief nur im `finally` (nach dem await), daher bestanden zwei gleichzeitige Schließvorgänge beide `requireOwned` → irreführender Fehler für den zweiten + redundantes Bridge-Schließen. | Lösche den Ownership-Gate SYNCHRON vor dem await; Bridge-Schließen läuft einmal. Test hinzugefügt.                                                                                                                      |
| F2  | **P1**      | Pump-Lebenszyklus: Ein sauberes Iterator-Ende (Subprozess beendet, `done`) aufgelöst → der `.catch` wurde nie ausgelöst → Zombie-Stream; und ein Iterator-Fehler mitten im Stream sendete kein `stream_error`.                     | `pumpSessionEvents` kapselt die gesamte Schleife (synchrone + Mid-Stream-Fehler senden `stream_error` und werfen dann erneut); der Konsument `.then(onDone, onErr)` schließt den Stream auf BEIDEN Pfaden (identitätsgeschützt). Tests hinzugefügt. |
| F3  | **P2**      | 503-Verbindungsbeschränkungs-Ablehnung hatte kein stderr-Log.                                                                                                                                                                    | `writeStderrLine` mit dem Kapazitätswert.                                                                                                                                                                               |
| F4  | **P2**      | Spread von `_qwen/notify stream_error` ließ `event.data.kind` den Diskriminator überschatten.                                                                                                                                   | Spread zuerst, dann `kind: 'stream_error'`.                                                                                                                                                                           |
| F5  | **P2**      | `MAX_WORKSPACE_PATH_LENGTH` neu deklariert (`= 4096`) vs. die kanonische `fs/paths.js`.                                                                                                                                        | Import aus `../fs/paths.js` (keine Abweichung).                                                                                                                                                                         |
| F6  | **P2**      | `isObjectParams` dupliziert `json-rpc.isObject`.                                                                                                                                                                                | `isObject` importieren.                                                                                                                                                                                                 |
| F7  | **P2**      | Rohes `process.stderr.write` in `index.ts`/`sse-stream.ts` vs. `writeStderrLine` anderswo.                                                                                                                                      | Vereinheitlicht auf `writeStderrLine` im gesamten Modul.                                                                                                                                                                |

---

## 17. REST-Äquivalenzangleich + Audit-Umsetzung des Erweiterungsschemas (Runde 8)

Ziel: `/acp` als **äquivalenten Ersatz** für REST+SSE etablieren.

Diese Charge basiert auf den Audit-Ergebnissen und restrukturiert das Erweiterungsschema, und ergänzt die **von Bridge bereits exponierten** Fähigkeiten; Fähigkeiten, die Bridge noch nicht besitzt (Datei-I/O, Gerätestreams, Agents/Memory CRUD) werden gemäß den Architektur-Korrektheitsanforderungen **zuerst durch acp-bridge ergänzt** (siehe §17.3).

### 17.1 Audit des Erweiterungsschemas → Umsetzung (Ersetzt das alte Schema aus §5)

Basierend auf dem **tatsächlich im Repository implementierten SDK `@agentclientprotocol/sdk@0.14.1`** (nicht nur die Website):

- `session/set_config_option` ist eine **erstklassige (nicht `unstable_`) Methode**, Request `{sessionId, configId, value}`, `category` enthält `model`/`mode`/`thought_level`; während `set_model` weiterhin über `unstable_setSessionModel` läuft.
- Die Spezifikation behält das `_`-Präfix für Erweiterungen vor, Beispiele sind domain-basiert wie `_zed.dev/…`; Herstellerdaten werden in `_meta` nach Domain-Schlüssel abgelegt.

Umsetzung:

- **Namespace `_qwen/` → Reverse-Domain `_qwen/`**; `_meta` einheitlich `_meta:{ "qwen": … }` (enthält `initialize`-Fähigkeitsanzeige und `requestId` von `session/request_permission`).
- **Modell + Genehmigungsmodus → Standard `session/set_config_option`** (`configId:"model"|"mode"`), routing zu vorhandenen `bridge.setSessionModel`/`setSessionApprovalMode`; `session/new`-Ergebnis **wirbt `configOptions` an** (entnommen aus dem Subprozess-Sitzungsstatus `getSessionContextStatus().state.configOptions`, bereits in ACP-Form). **Löschen** des herstellerspezifischen `_qwen/session/set_model`.
- REST (http+sse) **erfordert keine synchronen Änderungen**: Beide Transports teilen sich dieselbe Bridge, der Zustand ist von Natur aus konsistent.
### 17.2 Neu in dieser Charge hinzugefügte `/acp`-Methoden (bridge bereits unterstützt, 1:1-Entsprechung zu REST)

| REST                                                  | `/acp`                                             | bridge                                   |
| ----------------------------------------------------- | -------------------------------------------------- | ---------------------------------------- |
| `POST /session/:id/model` / `approval-mode`           | **Standard** `session/set_config_option` (model/mode) | setSessionModel / setSessionApprovalMode |
| `GET /session/:id/context`                            | `_qwen/session/context`                            | getSessionContextStatus                   |
| `GET /session/:id/supported-commands`                 | `_qwen/session/supported_commands`                 | getSessionSupportedCommandsStatus         |
| `PATCH /session/:id/metadata`                         | `_qwen/session/update_metadata`                    | updateSessionMetadata                     |
| `GET /workspace/{mcp,skills,providers,env,preflight}` | `_qwen/workspace/{…}`                             | getWorkspace\*Status                      |
| `POST /workspace/init`                                | `_qwen/workspace/init`                             | initWorkspace                             |
| `POST /workspace/tools/:name/enable`                  | `_qwen/workspace/set_tool_enabled`                 | setWorkspaceToolEnabled                   |
| `POST /workspace/mcp/:server/restart`                 | `_qwen/workspace/restart_mcp_server`               | restartMcpServer                          |

(Bereits vorhanden: session/new·load·resume·close·list·prompt·cancel, heartbeat, permission, events sind abgeglichen.)

### 17.3 Noch bestehende Lücken → acp-bridge muss zuerst ergänzt werden (Architekturkorrektheit)

RESTs **Datei-I/O** (`/file /glob /list /stat /file/write /file/edit`), **Geräte-Flow-Anmeldung** (`/workspace/auth/*`), **Agents CRUD** (`/workspace/agents`), **Memory CRUD** (`/workspace/memory`) befinden sich derzeit **nicht auf `HttpAcpBridge`** – die REST-Routen rufen direkt die Routen-Dienste auf (`WorkspaceFileSystemFactory`, `DeviceFlowRegistry`, `SubagentManager`, `writeWorkspaceContextFile`), und umgehen dabei die Bridge.

**Entscheidung (Review-/Owner-Meinung berücksichtigt)**: Der `/acp`-Transport soll diese Routen-Dienste nicht direkt ansprechen (das würde die Architekturabweichung von REST kopieren und die Transport-Kopplung verdoppeln). **Richtig ist es, zuerst in `@qwen-code/acp-bridge`'s `HttpAcpBridge` diese Fähigkeiten zu ergänzen** (z.B. `readWorkspaceFile`/`writeWorkspaceFile`/`globWorkspace`, `startDeviceFlow`/`pollDeviceFlow`, `listAgents`/`upsertAgent`/`deleteAgent`, `readMemory`/`writeMemory`), sodass sowohl REST als auch `/acp` über die Bridge gehen. Dann können bei `/acp` noch `_qwen/fs/*`, `_qwen/auth/*`, `_qwen/workspace/agent*`, `_qwen/workspace/memory*` hinzugefügt werden (Datei-Lesen ist ein legitimer Herstellererweiterung, da es keine Standard-ACP-Client→Agent-Methode gibt).

**Vollständige Äquivalenz = diese Charge (bereits in der Bridge vorhandene Fähigkeiten) + spätere Charge nach Ergänzung der Lücken in acp-bridge**.

---

## 18. Review Round 9 — PR-Fold-ins

| #   | Schweregrad       | Befund                                                                                                                                                                                                                                                                                          | Korrektur                                                                                                                                                                                |
| --- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | **P1 (Regression)** | Session-Stream-Wiederverbindung hat die laufende Prompt abgebrochen: `attachSessionStream` schloss den ALTEN Stream, bevor der neue installiert wurde, und `onClose` des alten Streams hat bedingungslos `promptAbort` ausgelöst – so ging einem sich wieder verbindenden Client (Netzwerkstörung/Roaming) die laufende Prompt verloren. | Installiere den NEUEN Stream VOR dem Schließen des alten; schütze das Prompt-Abort in `onClose` durch eine Identitätsprüfung (nur abbrechen, wenn DIESER noch der Live-Stream der Session ist). Test hinzugefügt (Prompt überlebt Wiederverbindung). |
| G2  | **P2**               | `session/cancel` hat `undefined` als `CancelNotification`-Body übergeben und damit die vom Client gelieferten Cancel-Felder (Grund/Kontext) verworfen, die REST weiterleitet.                                                                                                                       | Leite `{ ...params, sessionId }` weiter (entspricht REST).                                                                                                                                |

Rebased auf den neuesten `daemon_mode_b_main` (#4473/#4483/#4484/#4500), keine Konflikte. Suite **33 Tests**, live erneut verifiziert.

---

## 19. Roadmap / Nachfolge-PRs (zur Erinnerung)

Dieser PR (#4472) = ACP Streamable HTTP Transport + **alle bridge-gestützten Fähigkeiten abgeglichen** + offizielle Erweiterungslösung. Jetzt auf **ready** gesetzt. Für die vollständige Äquivalenz von `/acp` mit REST+SSE sind noch nötig:

1. **Follow-up PR 1 — acp-bridge Fähigkeiten ergänzen (Vorbedingung / bridge-first)**: `HttpAcpBridge` erhält neue Methoden für Datei-I/O, Geräte-Flow, Agents CRUD, Memory CRUD; REST-Routen werden über die Bridge geführt (Beseitigung der direkten Verbindung zu den Routen-Diensten).
2. **Follow-up PR 2 — Rest-Abgleich von `/acp` (abhängig von PR 1)**: `_qwen/fs/*`, `_qwen/auth/*`, `_qwen/workspace/agent*`, `_qwen/workspace/memory*` → vollständige Äquivalenz zu REST.
Verfolgung: #3803 (open decisions), #4175 (Mode B roadmap) wurden beide kommentiert.
Die deferred-Elemente sind in der PR-Beschreibung unter „Known deferred“ aufgeführt.

---

## 20. Extension-Namespace-Umbenennung + SDK-Transport-Analyse (Runde 11)

- **Namespace `_qwen.ai/` → `_qwen/`**: Die einzige harte Regel des ACP ist der führende Unterstrich `_`; das Segment `_zed.dev/` ist eine Konvention à la Beispiel, kein Muss. Da `qwen` unverwechselbar ist, verwenden wir die kürzere, reine Form. Der `_meta`-Schlüssel lautet ebenfalls `"qwen"`. (Überblick über reale Agents: Zed/gemini-cli verwenden meist `_meta` bei Standardmethoden + ACPs eigene `unstable_*`-Methoden; reine benutzerdefinierte `_`-Methoden sind selten – unsere `_qwen/*`-Operationen sind wirklich neuartige Workspace/Session-Vorgänge ohne Standardäquivalent, daher ist eine `_`-Methode das richtige Mittel.)
- **Warum handgefertigter Transport (nicht SDK-basiert)**: Das TS-SDK liefert nur `ndJsonStream` (Stdio); RFD #721 HTTP ist SDK Phase 3 (nicht implementiert). Die SDK-`Connection` ist ein Einzel-Duplex-Stream; unser Transport ist Multi-Stream (POSTs + Verbindungs-SSE + Pro-Session-SSE) und benötigt ausgehende Demultiplexierung nach `sessionId` – was unser Dispatcher zur Routing-Zeit bereits kennt. Eine vollständige SDK-Neuschreibung bekämpft dieses Modell und würde die Hauptlast (Brückenübersetzung, SSE-Lebenszyklus, Eigentumsverhältnisse, EventBus→JSON-RPC) nicht entfernen. **Pragmatische Verbesserung (mögliches Follow-up): Übernahme der Zod-Schema-Validatoren und -Typen des SDK für die Parametervalidierung bei gleichzeitiger Beibehaltung des handgefertigten Transports.** SDK-Clients, die `extMethod('_qwen/…')` verwenden, sind mit unseren Handlern kompatibel (identisches Drahtformat).
