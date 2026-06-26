# Daemon ACP-over-HTTP → Offizieller ACP Streamable HTTP Transport

> Ziel: `daemon_mode_b_main`. Branch: `feat/daemon-acp-http-streamable`.
> Autor: arnoo.gao. Datum: 2026-05-24. Status: **Design v1 → Implementierung**.
> Workflow „Design-first pro Repo”: Dieses Dokument landet vor/mit dem Implementierungs-PR, damit der Drahtvertrag überprüfbar ist.

---

## 0. Kurzfassung

Der Daemon (`qwen serve`) spricht heute einen **eigenen REST + SSE**-Dialekt mit Web-/SDK-Clients, während er **echtes ACP JSON-RPC über stdio** mit dem gestarteten `qwen --acp`-Kindprozess spricht. Dieser Vorschlag fügt einen **zweiten Nordtransport** hinzu, der den **offiziellen ACP Streamable HTTP Transport** (RFD #721) an einem einzigen `/acp`-Endpunkt implementiert, damit jeder ACP-native Client (Zed, Goose, zukünftige SDKs) den Daemon direkt über das Standardprotokoll ansteuern kann – ohne qwen-spezifisches REST-Wissen.

**Entscheidung: Dual-Transport, additiv.** Der neue `/acp`-Endpunkt wird parallel zur bestehenden REST-Oberfläche montiert und verwendet dieselben `HttpAcpBridge` + `EventBus` darunter. Die REST-API wird _nicht_ entfernt. Begründung in §6.

**Entscheidung: Erweiterungs-Namespace = `_qwen/…`** (einzelner Unterstrich-Präfix, die von der ACP-Spezifikation reservierte Form für benutzerdefinierte Methoden) für Daemon-Features, die keine standardmäßige ACP-Methode haben (Modellwechsel, Workspace-Introspection, Heartbeat, Multi-Client-Berechtigungsrichtlinie, SSE-Backpressure-Tuning). Begründung in §5.

Eine vollständige, lokal ausführbare Referenzimplementierung wird in diesem PR ausgeliefert (`packages/cli/src/serve/acp-http/`) plus ein Verifikations-Harness (`scripts/acp-http-smoke.mjs`).

---

## 1. Hintergrund – was „ACP über HTTP” heute bedeutet

Drei Ebenen (verifiziert bei Commit `0c0430939`):

```
┌──────────────┐  eigener REST + SSE (HTTP/1.1)   ┌────────────┐  ACP JSON-RPC   ┌──────────────┐
│ Web / SDK   │ ────────────────────────────────► │  qwen      │  (stdio NDJSON) │ qwen --acp   │
│ Client      │ ◄─── GET /session/:id/events ────  │  serve     │ ◄─────────────► │ Kind (Agent) │
│ (ACP-Client)│       (text/event-stream)          │  (Daemon)  │  ndJsonStream   │              │
└──────────────┘                                   └────────────┘                 └──────────────┘
        Nord: KEIN ACP-Draht                          Brücke          Süd: echtes ACP
```

### 1.1 Nord (Client ↔ Daemon) – eigener, heute

- Express 5-App in `packages/cli/src/serve/server.ts` (~30 Routen).
- Einzelne REST-Verben, **kein** JSON-RPC:
  - `POST /session` (erstellen), `POST /session/:id/prompt`, `POST /session/:id/cancel`,
    `POST /session/:id/load|resume`, `POST /session/:id/model`,
    `POST /session/:id/permission/:requestId`, `POST /session/:id/heartbeat`,
    `DELETE /session/:id`, plus `/workspace/*`, `/capabilities`, `/health`.
- Server→Client-Streaming: `GET /session/:id/events` → `text/event-stream`.
  - Frames: `id: <n>\nevent: <type>\ndata: <json>\n\n` (`server.ts:formatSseFrame`, ~2626).
  - Pro-Sitzung **monoton steigende `id`** + `Last-Event-ID`-Resume, unterstützt von einem
    Ringpuffer-`EventBus` (`acp-bridge/src/eventBus.ts`).
  - Ereignis-`type`s: `session_update`, `client_evicted`, `slow_client_warning`,
    `state_resync_required`, `stream_error`, …
- Auth: `Authorization: Bearer <token>` (`serve/auth.ts`), CORS-Verweigerung + Host-Allowlist.
- Backpressure: per-Verbindung serialisierte Write-Kette + 15 s Heartbeat-Kommentare.

### 1.2 Süd (Daemon ↔ Kind) – bereits ACP

- `acp-bridge/src/spawnChannel.ts` startet `qwen --acp`, umschließt stdin/stdout mit
  `ndJsonStream` von `@agentclientprotocol/sdk` (`^0.14.1`).
- `acp-bridge/src/bridge.ts:729` `new ClientSideConnection(() => client, channel.stream)`
  – der Daemon ist der ACP **Client**, das Kind ist der ACP **Agent**.
- Erweiterungsmethoden werden auf diesem Abschnitt bereits verwendet: `unstable_setSessionModel`,
  `unstable_resumeSession`, `unstable_listSessions` (`acp-integration/acpAgent.ts`).

### 1.3 Warum den Nord migrieren

- Jeder Client (WebUI, TS SDK, Java SDK, Python SDK, VSCode-Erweiterung) implementiert
  das eigene REST-Mapping neu. Ein ACP-Standard-Endpunkt erlaubt ACP-nativen Editoren,
  sich mit null qwen-spezifischem Klebstoff anzubinden.
- Bringt die Remote-Oberfläche des Daemons mit dem Protokoll in Einklang, das er intern bereits spricht.

---

## 2. Ziel: ACP Streamable HTTP (RFD #721)

Zusammengeführter **Entwurfs**-RFD (`agentclientprotocol/agent-client-protocol#721`, zusammengeführt am 22.04.2026).
Noch nicht normativ; noch nicht in einem SDK. Wir implementieren gegen das RFD-Drahtdesign.

### 2.1 Endpunkt & Verben (einzelnes `/acp`)

| Verb          | Verhalten                                                                                                                                                                                                                                               |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /acp`   | JSON-RPC senden. `initialize` → **`200`** + JSON-Body (Fähigkeiten) und setzt `Acp-Connection-Id`. Alle anderen Requests/Notifications → **`202 Accepted`**, leerer Body; die _Antwort_ (falls vorhanden) wird auf dem passenden langlebigen SSE-Stream zugestellt. |
| `GET /acp`    | Öffnet einen langlebigen **SSE**-Stream. (`Upgrade: websocket` → WebSocket; **verschoben**, siehe §7.)                                                                                                                                                      |
| `DELETE /acp` | Beendet die Verbindung → `202`.                                                                                                                                                                                                                         |

### 2.2 Zweistufige langlebige Streams

- **Verbindungsbezogener Stream**: `GET /acp` mit Header `Acp-Connection-Id`, kein Sitzungs-
  Header. Überträgt verbindungsbezogene Antworten (`session/new`, `session/load`,
  `authenticate`) und verbindungsbezogene Notifications.
- **Sitzungsbezogener Stream**: `GET /acp` mit `Acp-Connection-Id` **und** `Acp-Session-Id`.
  Überträgt `session/update`-Notifications, **Agent→Client-Requests**
  (`session/request_permission`, `fs/read_text_file`, …) und Antworten auf Sitzungs-
  POSTs (`session/prompt`, `session/cancel`).

### 2.3 Identität (3 Ebenen)

- `Acp-Connection-Id` (HTTP-Header) — Transportbindung, bei `initialize` erstellt.
- `Acp-Session-Id` (HTTP-Header) — erforderlich bei sitzungsbezogenem GET + Sitzungs-POSTs.
- `sessionId` (JSON-RPC-Parameter) — innerhalb von Methodenparametern (muss mit dem Header übereinstimmen).

### 2.4 Abweichungen von MCP StreamableHTTP

ACP verwendet **langlebige** Streams (nicht per-Request SSE), **zwei** ID-Header (Verbindung
vs. Sitzung), `202`-für-nicht-initialize, HTTP/2-erforderlich, WebSocket-erforderlich-Client. Wir
übernehmen das Single-Endpoint + POST/GET-SSE + Session-Header-Grundgerüst, passen es aber an
das langlebige Dual-ID-Modell an. Wir verwenden **nicht** `@modelcontextprotocol/sdk`'s
`StreamableHTTPServerTransport` (sein per-Request-Stream-Modell und einzelnes
`Mcp-Session-Id` passen nicht).

### 2.5 Standardmethoden (laut aktuellem Schema bestätigt)

- Client→Agent-Requests: `initialize`, `authenticate`, `session/new`, `session/load`,
  `session/prompt`, `session/resume`, `session/close`, `session/list`,
  `session/set_mode`, `session/set_config_option`, `logout`.
- Client→Agent-Notification: `session/cancel`.
- Agent→Client-Requests: `fs/read_text_file`, `fs/write_text_file`,
  `session/request_permission`, `terminal/create|output|wait_for_exit|kill|release`.
- Agent→Client-Notification: `session/update`.

---

## 3. Architektur des neuen Transports

Der Daemon muss nach Norden eine **ACP-Agent-Oberfläche über HTTP** präsentieren, während er
nach Süden ein ACP **Client** zum Kind bleibt. Die `/acp`-Schicht ist daher ein
**JSON-RPC-Router**, der den HTTP-Transport terminiert und in die bestehende `HttpAcpBridge` einbindet.

```
            POST /acp (JSON-RPC-Requests/Antworten/Notifications)
client  ──────────────────────────────────────────────►  ┌───────────────────────────┐
(Editor)                                                  │  AcpHttpTransport         │
        ◄── GET /acp  (verbindungsbezogenes SSE) ──────  │  - Verbindungsregister    │
        ◄── GET /acp  (sitzungsbezogenes SSE) ─────────  │  - JSON-RPC id-Korrelation│
                                                          │  - Methoden-Dispatch      │
                                                          └────────────┬──────────────┘
                                                                       │ verwendet wieder
                                                          ┌────────────▼──────────────┐
                                                          │  HttpAcpBridge + EventBus  │  (unverändert)
                                                          └────────────┬──────────────┘
                                                                       │ ACP stdio (unverändert)
                                                                 qwen --acp Kind
```

### 3.1 Neues Modul-Layout (`packages/cli/src/serve/acp-http/`)

| Datei                     | Verantwortung                                                                                                                                                                                 |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts`                | `mountAcpHttp(app, bridge, opts)` — registriert `/acp`-Routen auf der bestehenden Express-App.                                                                                                |
| `connection-registry.ts`  | `Acp-Connection-Id` → `AcpConnection` (Verbindungs-SSE-Writer, `Map<sessionId, SessionStream>`, ausstehende Agent→Client-Requests nach JSON-RPC-ID, monotoner ID-Allokator). TTL + DELETE-Bereinigung. |
| `json-rpc.ts`             | JSON-RPC 2.0 Parse/Validate/Serialize-Helfer; Fehlercodes (`-32600` usw.); `_qwen/`-Namespace-Guard.                                                                                             |
| `dispatch.ts`             | Bildet eingehende JSON-RPC-Methoden → `HttpAcpBridge`-Aufrufe ab. Bildet `BridgeEvent`s → ausgehende JSON-RPC-Frames ab. Die Übersetzungstabelle (§4).                                           |
| `sse-stream.ts`           | Langlebiger SSE-Writer (verwendet das Backpressure/Heartbeat-Muster aus `server.ts` wieder). Abgrenzung zu REST `/events` (anderes Framing: vollständige JSON-RPC-Objekte, nicht qwen-Ereignis-Envelopes). |

Keine Änderung an `bridge.ts` / `eventBus.ts` (nur additiver Konsument).

### 3.2 Verbindungs- & Sitzungslebenszyklus

1. `POST /acp {initialize}` → `connectionId` ausstellen, `AcpConnection` erstellen, `200` antworten
   mit `{protocolVersion, agentCapabilities, _meta:{qwen:{…}}}` + `Acp-Connection-Id`-Header.
2. Client öffnet `GET /acp` (verbindungsbezogen) mit `Acp-Connection-Id`.
3. `POST /acp {session/new}` → `202`; Daemon ruft `bridge.createSession(...)` auf; schiebt
   die JSON-RPC-Antwort (mit `sessionId`) über den **Verbindungs**-Stream.
4. Client öffnet `GET /acp` (sitzungsbezogen) mit `Acp-Connection-Id`+`Acp-Session-Id`;
   Daemon `bridge.subscribeEvents(sessionId)` und leitet übersetzte Frames weiter.
5. `POST /acp {session/prompt}` → `202`; `bridge.sendPrompt(...)`; `session/update`-
   Notifications werden live auf dem Sitzungs-Stream gestreamt; die endgültige Prompt-
   **Antwort** (`{id, result:{stopReason}}`) wird auf dem Sitzungs-Stream abgesetzt, sobald sie fertig ist.
6. Agent→Client-Request (z. B. `session/request_permission`) wird als JSON-RPC
   **Request** auf dem Sitzungs-Stream mit einer vom Daemon vergebenen ID ausgegeben; der Client antwortet via
   `POST /acp {id, result}`; `dispatch` löst es über die Permission-API der Bridge auf.
7. `DELETE /acp` (oder Verbindungs-Stream-Schließen + TTL) baut Sitzungen/Abonnements ab.

---

## 4. Übersetzungstabelle (Bridge ⇄ ACP/HTTP)

### 4.1 Eingehend (Client POST → Bridge)

| ACP-Methode                                 | Bridge-Aufruf                                           | Antwort weitergeleitet an               |
| ------------------------------------------- | ------------------------------------------------------- | --------------------------------------- |
| `initialize`                                | (keine; Fähigkeiten aus `capabilities.ts`)              | inline `200`                            |
| `authenticate`                              | bestehender Auth-Provider (`serve/auth/*`)              | Verbindungs-Stream                      |
| `session/new`                               | `bridge.createSession`                                  | Verbindungs-Stream                      |
| `session/load` / `session/resume`           | `bridge.restoreSession('load'                           | 'resume')`                              | Verbindungs-Stream |
| `session/prompt`                            | `bridge.sendPrompt`                                     | Sitzungs-Stream (verzögert bis Festlegung) |
| `session/cancel` (Notif)                    | `bridge.cancel`                                         | —                                       |
| `session/list`                              | `bridge.listSessions` (`unstable_listSessions`)         | Verbindungs-Stream                      |
| `session/set_mode`                          | Approval-Mode-Routenlogik                               | Sitzungs-Stream                         |
| JSON-RPC **Antwort** (auf Agent→Client-Request) | ausstehende auflösen (`§4.3`)                             | —                                       |
| `_qwen/session/set_model`                   | `bridge.setSessionModel` (`unstable_setSessionModel`)   | Sitzungs-Stream                         |
| `_qwen/workspace/list` usw.                 | Workspace-Introspection-Routen                          | Verbindungs-Stream                      |
| `_qwen/session/heartbeat`                   | `bridge.heartbeat`                                      | Verbindungs-Stream                      |

### 4.2 Ausgehend (BridgeEvent → JSON-RPC auf Sitzungs-Stream)

| BridgeEvent.type                                                       | Ausgegeben als                                                       |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `session_update`                                                       | `{method:"session/update", params:<data>}` Notification              |
| Permission-Request                                                     | `{id:<n>, method:"session/request_permission", params}` Request      |
| `client_evicted` / `slow_client_warning` / `state_resync_required`     | `{method:"_qwen/notify", params:{kind,…}}` Notification              |
| `stream_error`                                                         | JSON-RPC-Fehlerantwort auf der aktiven Prompt-ID (oder `_qwen/notify`) |
| Prompt-Festlegung                                                      | `{id:<promptId>, result:{stopReason}}`                               |

### 4.3 Ausstehende Agent→Client-Requests

`AcpConnection` führt `Map<jsonRpcId, {sessionId, kind, bridgeRequestId, resolve}>`.
Wenn der Client ein JSON-RPC-Antwortobjekt per POST sendet, findet `dispatch` die `id` und ruft den
Bridge-Auflösungspfad auf (z. B. Permission `POST /session/:id/permission/:requestId` internes Äquivalent).

> **v1-Status:** Nur der `session/request_permission` Agent→Client-Roundtrip ist
> implementiert. `fs/*` und `terminal/*` Agent→Client-Weiterleitung ist **verschoben** (§7) – der
> Daemon wirbt noch keine `fs`/`terminal`-Client-Fähigkeitsaushandlung auf `/acp` an,
> daher sollten ACP-Clients in v1 keine Dateisystem-/Terminal-Semantik über diesen Transport erwarten.
> Der angestrebte Endzustand (Weiterleitung `fs/*` an den Client; Rückfall auf das Workspace-Dateisystem
> des Daemons, wenn dem Client die `fs`-Fähigkeit fehlt) ist der in §7 beschriebene Nachfolger.

---

## 5. Erweiterungsstrategie (Anforderung #2)

ACP reserviert alle Methoden, die mit `_` beginnen, für benutzerdefinierte Erweiterungen und stellt
`_meta` bei jedem Typ bereit. Der südliche Abschnitt der Codebasis verwendet bereits `unstable_*`-Methodennamen.

**Nord-Entscheidung:** Anbieternamensraum **`_qwen/<bereich>/<verb>`**-Methodennamen
(spezkonformer `_`-Präfix). Fähigkeiten werden unter
`agentCapabilities._meta.qwen` bei `initialize` beworben, damit Clients vor der Nutzung Feature-Detection durchführen können.

| Bedarf                                                 | Keine Standard-ACP-Methode? | Erweiterung                                               |
| ------------------------------------------------------ | --------------------------- | --------------------------------------------------------- |
| Modellwechsel                                          | ja                          | `_qwen/session/set_model`                                 |
| Workspace MCP/Skills/Provider/Umgebungs-Introspection  | ja                          | `_qwen/workspace/list`, `_qwen/workspace/<bereich>`       |
| Heartbeat / letzte Aktivität                           | ja                          | `_qwen/session/heartbeat`                                 |
| Multi-Client-Berechtigungsrichtlinie (Konsens/benannt) | teilweise                   | `session/request_permission` + `_meta.qwen.policy`        |
| SSE-Backpressure-Tuning (`maxQueued`)                  | ja                          | `Acp-Qwen-Max-Queued`-Header bei Sitzungs-GET             |
| Resume-Cursor (Ring `Last-Event-ID`)                   | RFD Phase 4                 | `Last-Event-ID`-Header + `_meta.qwen.eventId` auf Frames  |

Standardmethoden werden **niemals** umbenannt; Erweiterungen sind streng additiv und ignorierbar.

---

## 6. Dual-Transport vs. Ersatz (Anforderung #4)

**Entscheidung: Dual-Transport (additiv).**

- Der offizielle Transport ist ein **Entwurfs**-RFD, nicht normativ und in keinem SDK vorhanden –
  ein harter Ersatz würde uns an ein nicht ratifiziertes Design binden und gleichzeitig WebUI + 3 SDKs +
  VSCode-Erweiterung brechen.
- Die REST-Oberfläche enthält Funktionen, die noch keine saubere ACP-Abbildung haben (Workspace-
  Introspection, Multi-Client-Berechtigungsvermittlung, Ringpuffer-Resume, Fähigkeitsregister).
  Diese verkommen zu `_qwen/*`-Erweiterungen auf `/acp`, aber die REST-Oberfläche bleibt maßgeblich,
  bis der RFD ratifiziert ist.
- Beide Transporte teilen sich **eine** `HttpAcpBridge` + `EventBus`-Instanz, sodass es keine
  Zustandsverdopplung gibt – `/acp` und `/session/*` können sogar dieselbe Live-Sitzung gleichzeitig
  steuern (Multi-Client wird von der Bridge bereits unterstützt).
- Kippschalter (v1, ausgeliefert): standardmäßig aktiviert; **`QWEN_SERVE_ACP_HTTP=0`** deaktiviert die Montage. Ein
  `--no-acp-http`-CLI-Flag und ein `acp_http`-Tag in `/capabilities` für Client-Feature-
  Detection sind **verschoben** auf einen Nachfolge-PR (nicht in v1) – bis dahin erkennen Clients den
  Transport durch Abfragen von `POST /acp {initialize}`.

Migrationspfad: Sobald der RFD ratifiziert ist und SDKs ausgeliefert werden, können REST-Routen als
dünner Kompatibilitäts-Shim über `/acp` umgestaltet werden (separater, späterer PR).

---

## 7. Umfang des Implementierungs-PRs

**Im Umfang (ausführbar + lokal verifiziert):**

- `POST /acp`-Dispatch für `initialize`, `session/new`, `session/prompt`,
  `session/cancel`, `session/load`, JSON-RPC-Antwortbehandlung.
- Verbindungsbezogene + sitzungsbezogene `GET /acp`-SSE-Streams mit JSON-RPC-Framing.
- `session/update`-Streaming + finale Prompt-Antwortkorrelation.
- `session/request_permission` Agent→Client-Roundtrip.
- `_qwen/session/set_model`-Erweiterung als funktionierendes Beispiel für #2.
- Wiederverwendung von Bearer-Auth + Host-Allowlist (gleiche Middleware wie REST).
- Unit-Tests (`acp-http/*.test.ts`) + ein Black-Box-Smoke-Skript, das einen echten Daemon steuert.

**Verschoben (dokumentiert, jetzt nicht gebaut):**

- WebSocket-Upgrade-Pfad (vom RFD geforderte Client-Fähigkeit; SSE reicht für lokale Verifizierung).
- HTTP/2-Multiplexing (wir laufen mit HTTP/1.1; POST und langlebige GET verwenden separate Sockets,
  was für CLI/Node-Clients und ≤6-Verbindungs-Browser funktioniert). Dokumentierte Abweichung.
- Vollständige `fs/*` + `terminal/*` Agent→Client-Weiterleitung (Permission-Pfad beweist den
  Mechanismus; Rest ist mechanischer Nachfolger).
- SSE-Resumability-Härtung auf Parität mit dem Ringpuffer (Phase 4 in RFD).
---

## 8. Lokaler Verifizierungsplan

1. `npm run build` (oder Workspace-Build von `cli` + `acp-bridge`).
2. Daemon starten: `qwen serve --listen 127.0.0.1:0 --token <t>` (oder Token aus Umgebungsvariable).
3. `node scripts/acp-http-smoke.mjs` ausführen:
   - `POST /acp {initialize}` → erwarte `200` + `Acp-Connection-Id`.
   - Verbindungs-SSE öffnen; `POST {session/new}` → erwarte Antwort auf dem Stream.
   - Sitzungs-SSE öffnen; `POST {session/prompt:"say hi"}` → erwarte ≥1 `session/update`,
     dann ein finales `{result:{stopReason}}`.
   - Ein Tool auslösen, das Berechtigung benötigt → erwarte `session/request_permission`-Anfrage,
     sende eine Genehmigungsantwort (POST) → erwarte, dass das Prompt abgeschlossen wird.
   - `POST {_qwen/session/set_model}` → erwarte Modellwechsel + `session/update`.
4. Vitest: `acp-http/*.test.ts` grün.

---

## 9. Risiken

| Risiko                                      | Abschwächung                                                                                              |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Änderungen an RFD vor der Ratifizierung     | Hinter Capability-Tag + `_qwen`-Namespace; isoliertes Modul; einfach zu überarbeiten.                     |
| HTTP/1.1 vs. erforderliches HTTP/2          | Localhost/CLI-Clients nicht betroffen; dokumentiert; h2 ist später ein reiner Transporttausch.            |
| Wettlauf zweier Transports auf einer Bridge | Bridge unterstützt bereits mehrere Clients; Wiederverwendung ihrer Sperrmechanismen.                      |
| `fs/*`-Weiterleitung vs. daemon-lokales FS  | Capability-gesteuert: weiterleiten, wenn Client `fs` deklariert, sonst lokal.                             |

---

## 10. Implementierungs- und Verifizierungsprotokoll (v1)

Implementiert in `packages/cli/src/serve/acp-http/` (`json-rpc.ts`, `sse-stream.ts`,
`connection-registry.ts`, `dispatch.ts`, `index.ts`), eingebunden in `server.ts`
über `mountAcpHttp(app, bridge, { boundWorkspace })`.

### Automatisiert (`packages/cli/src/serve/acp-http/*.test.ts`)

`transport.test.ts` startet einen echten Express-Server + die echte `mountAcpHttp` über
eine steuerbare Fake-Bridge und treibt sie mit `fetch` + manueller SSE-Parsing an.
15 Tests grün, die folgendes abdecken: `initialize` 200 + `Acp-Connection-Id`; unbekannte Verbindung 400;
`session/new`-Antwort auf dem Verbindungsstream; Prompt → `session/update`-Stream + finale Ergebniskorrelation;
`session/request_permission` Agent→Client→Agent-Roundtrip; `_qwen/session/set_model`;
Method-not-found; `DELETE`-Teardown.

### Live-Daemon (echtes Modell)

Gestartet mit `qwen serve --port 8767 --token … --workspace …` (Bundle-Eintrag, sodass
der gestartete `qwen --acp`-Kindprozess in sich abgeschlossen ist) und `scripts/acp-http-smoke.mjs` ausgeführt:

```
✓ initialize: connectionId=… protocolVersion=1
✓ session/new: sessionId=…
→ prompt: "Reply with the single word: pong"
pong
✓ prompt complete: 10 session/update frames, stopReason=end_turn
✓ DELETE /acp — connection closed
ALL CHECKS PASSED ✅
```

Fehlerpfad wurde ebenfalls live bestätigt: wenn der Kindprozess nicht starten konnte,
wurde das Bridge-Timeout dem Client als JSON-RPC-Fehlerframe auf dem Verbindungsstream
angezeigt (`{"id":2,"error":{"code":-32603,…}}`), was die ID-Korrelation und die
202/SSE-Aufteilung im Fehlerfall beweist.

### Review-Nachbesserung – Bridge-ausgestellte clientId (beim Live-Test entdeckt)

Erster Live-Durchlauf schlug bei `session/prompt` fehl mit _"client id … is not registered for
session"_. Ursache: `spawnOrAttach`/`loadSession` **ignorieren** eine vom Aufrufer übergebene
clientId, die die Bridge nie ausgestellt hat, und vergeben eine neue (zurückgegeben in
`BridgeSession.clientId`); der Dispatcher hat die eigene (nicht registrierte) Id der Verbindung
bei `sendPrompt` verwendet. Korrektur: die von der Bridge gestempelte Id auf dem
`SessionBinding` speichern und bei jedem sitzungsbezogenen Aufruf (`sessionCtx`) verwenden.
Erneute Verifizierung erfolgreich (siehe oben).

---

## 11. Review Runde 2 – Nachbesserungen

Zwei unabhängige Reviews (Korrektheit/Nebenläufigkeit + Protokollkonformität/Sicherheit) plus ein Selbst-Review.
Alle Korrekturen durch die erweiterte Vitest-Suite (**18 Tests**) + einen neuen Live-Smoke-Test
(21 `session/update`-Frames → `stopReason=end_turn`) verifiziert.

| #   | Schweregrad | Feststellung                                                                                                                                                                                                                                       | Korrektur                                                                                                                                                                                     |
| --- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | **P0**      | Sitzungs-Stream **Wiederverbindung war dauerhaft tot**: `SessionBinding.abort` wurde einmal erstellt und wiederverwendet; beim Stream-Schließen wurde es für immer abgebrochen, sodass ein `subscribeEvents(signal)` bei Wiederverbindung ein bereits abgebrochenes Signal erhielt und null Ereignisse empfing. | `attachSessionStream` installiert nun einen **frischen** `AbortController` pro Stream (und schließt vorherige Streams); `index.ts` pumpt auf diesem frischen Signal.                           |
| R2  | **P0**      | `await dispatcher.handle()` lief **nach** `res.end(202)`; ein werfender Bridge-Aufruf (insbesondere der nicht mit try/catch umfasste `isResponse`-Pfad) würde ablehnen und als unbehandelte Zurückweisung auftauchen → möglicher Daemon-Absturz. | Den `isResponse`-Pfad in try/catch eingewickelt; `.catch()` auf das erwartete `handle(...)` und auf `pumpSessionEvents(...)`.                                                                 |
| R3  | **P1**      | **Keine Verbindung→Sitzungsbesitz**: jede authentifizierte Verbindung konnte den Sitzungs-SSE für, oder ein Prompt an, _jede_ sessionId im Workspace öffnen (Mithören; Prompt wurde nur zufällig durch den Fehler der nicht registrierten clientId blockiert). | `AcpConnection.ownedSessions` wird durch `session/new`/`load`/`resume` befüllt; der Sitzungs-Stream gibt `403` zurück und sitzungsbezogene POSTs geben `INVALID_PARAMS` für nicht besessene Ids (`requireOwned`). |
| R4  | **P1**      | Handle von `mountAcpHttp` wurde verworfen → TTL-Aufräum-Timer + aktive SSE-Streams wurden beim Herunterfahren nicht freigegeben.                                                                                                                     | Handle auf `app.locals` abgelegt; `runQwenServe`-Close-Hook ruft `dispose()` vor `bridge.shutdown()` auf (spiegelt das Device-Flow-Registry).                                                  |
| R5  | **P1**      | **Ausstehende Berechtigung läuft aus**: Schließen einer Sitzung/Verbindung mit einer ausstehenden Berechtigung ließ die Bridge blockiert auf eine Abstimmung warten.                                                                               | `closeSessionStream`/`destroy` brechen passende ausstehende Anfragen über einen injizierten `onAbandonPending` → `cancelAbandonedPermission` ab.                                                |
| R6  | **P1**      | Puffer für Frames vor dem Anhängen (`connBuffer`/`binding.buffer`) waren unbegrenzt.                                                                                                                                                               | Auf 256 Frames begrenzt (älteste verwerfen), entsprechend dem EventBus `maxQueued`.                                                                                                           |
| R7  | **P2**      | `initialize` ignorierte die vom Client angeforderte `protocolVersion`.                                                                                                                                                                             | Verhandelt `min(angefordert, 1)`.                                                                                                                                                              |
| R8  | **P2**      | Keine `Acp-Session-Id` ↔ `params.sessionId`-Querprüfung (RFD §2.3).                                                                                                                                                                               | POST stellt Übereinstimmung sicher; Abweichung → `INVALID_PARAMS`.                                                                                                                            |
| R9  | **P2**      | `session/cancel`-Anfrageformular (mit id) wurde nie beantwortet; doppeltes `_meta.qwen` auf oberster Ebene.                                                                                                                                        | Antwort, wenn eine id vorhanden ist; einzelnes `agentCapabilities._meta.qwen`.                                                                                                                |

### Akzeptiert / dokumentiert (nicht in v1 behoben)

- **Reihenfolge Prompt-Ergebnis vs. nachfolgendes `session/update`** (P2): `handlePrompt` wartet auf `sendPrompt` und schreibt
  dann den Ergebnis-Frame, während Updates parallel eintreffen. In der Praxis veröffentlicht die Bridge alle
  `session/update`s vor der Auflösung von `sendPrompt` an den Bus, und beide teilen eine geordnete SSE-Schreibkette,
  sodass das Ergebnis zuletzt landet (bestätigt: 21 Updates dann Ergebnis). Eine strikte Barriere ist eine mögliche
  spätere Härtung, falls ein Client-Reducer empfindlich reagiert.
- **Browser `EventSource` kann keinen `Authorization`-Header setzen** – `/acp` GET-Streams benötigen den Bearer-Header,
  daher benötigen Browser den aufgeschobenen WebSocket-Pfad (§7); CLI/Node-Clients sind nicht betroffen.
- Die tatsächliche Vertrauensgrenze des Daemons bleibt der **Bearer-Token + Ein-Workspace-Bindung** (wie bei der
  REST-Oberfläche); die Besitzprüfung von R3 ist eine Verteidigung in der Tiefe + Vertragskorrektheit, keine
  Mandantengrenze.

---

## 12. Review Runde 3 – PR-Bot-Nachbesserungen (#4472)

Zwei automatisierte PR-Reviewer plus der Zusammenfassungs-Bot.
Alle Korrekturen durch die Suite (jetzt **22 Tests**) + einen frischen Live-Lauf (16 `session/update` → `end_turn`) verifiziert.

| #   | Schweregrad | Feststellung                                                                                                                                                                                                                                   | Korrektur                                                                                                                                                                        |
| --- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | **P0**      | Der `AbortController` von `handlePrompt` wurde nie abgebrochen – ein trennender/abbrechender Client ließ den Agenten weiterlaufen (verbrauchte Modellkontingent, blockierte das Sitzungs-FIFO). Von beiden Bots + 5 Unteragenten gemeldet.      | `promptAbort` auf `SessionBinding` abgelegt; abgebrochen durch `session/cancel` und durch Sitzungs-/Verbindungsabbau (`closeSessionStream`/`destroy`).                            |
| B2  | **P0**      | In `sessionCtx` fehlte `fromLoopback` → jede ACP-Berechtigungsabstimmung wurde als entfernt behandelt; `local-only`-Richtlinie würde Loopback-Clients ablehnen.                                                                                | Loopback bei `initialize` erfassen (Kernel `remoteAddress`, nicht fälschbare Header) → `AcpConnection.fromLoopback` → durch `sessionCtx` gereicht.                                |
| B3  | **P0**      | SSE-Schreibfehler wurden stillschweigend geschluckt → Zombie-Streams (Heartbeats feuern, keine Ereignisse geliefert, keine Logs).                                                                                                              | Erster Schreibfehler protokolliert + schließt den Stream.                                                                                                                        |
| B4  | **P0**      | Leerlauf-Aufräumung zerstörte Verbindungen ohne Log + keine Verbindungsobergrenze (Initialize-Überflutung).                                                                                                                                     | Aufräumung protokolliert jede Entfernung; `pumpSessionEvents` ruft `touch()` auf (lange stille Prompts werden nicht entfernt); `maxConnections`-Obergrenze (64) → `503`.          |
| B5  | **P1**      | `sessionCtx` fiel stillschweigend auf die nicht registrierte clientId der Verbindung zurück, wenn die Bindung keine hatte (ungtestet, in `FakeBridge` immer gefeuert).                                                                         | Ausnahme werfen bei fehlender gestempelter clientId (Invariante verletzt); `FakeBridge` stempelt jetzt eine.                                                                     |
| B6  | **P1**      | `session/new                                                                                                                                                                                                                                   | load                                                                                                                                                                              | resume`accepted`cwd` ungeprüft (REST prüft String/Länge/Absolute – Verstärkungs-DoS). | Gemeinsame `parseOptionalWorkspaceCwd` (String, ≤4096, absolut). |
| B7  | **P1**      | `session/prompt` leitete ein ungeprüftes `prompt` an die Bridge weiter.                                                                                                                                                                        | `validatePrompt` (nicht-leeres Array von Objekten), spiegelnd zu REST.                                                                                                           |
| B8  | **P1**      | Rohe Bridge-Fehlermeldungen wurden an den Client weitergegeben.                                                                                                                                                                                | `toRpcError` bildet bekannte Bridge-Fehler auf codierte, client-sichere Formen ab; Unbekanntes → generischer `Internal error` (volle Details immer noch auf stderr).             |
| B9  | **P1**      | `nextId` verwendete fortlaufende negative Zahlen – ein Client, der legal negative Ids nutzt, könnte in `pending` kollidieren.                                                                                                                  | Vom Daemon stammende Ids sind jetzt Zeichenketten (`_qwen_perm_N`), disjunkt von jeder Client-Id.                                                                                |
| B10 | **P2**      | `resolveClientResponse`-Parametertyp schloss `JsonRpcError` aus; verbindungsspezifischer SSE-Stream hatte kein `onClose`; `DELETE` ohne Header war ein stilles 202; `SseStream.close` führte `onClose` außerhalb von try/catch aus; `session/load`·`resume`·`close` ungetestet. | Parametertyp auf `JsonRpcResponse` erweitert; Verbindungs-Stream protokolliert bei Schließen; `DELETE` fehlender Header → `400`; `onClose` in try/catch eingewickelt; Tests für load/resume/close + DELETE-400 hinzugefügt. |

**Außerhalb des Gültigkeitsbereichs (Base-Branch `daemon_mode_b_main`, nicht dieses Diff)** – der zweite Reviewer
meldete Typfehler in `acpAgent.ts` (`entryCount`/`entrySummary`/`sessionClose`) und andere bereits bestehende
Punkte, die er explizit dem Base-Branch zuschrieb (durch #4353 eingeführt). Werden separat verfolgt; hier nicht behandelt.

**Noch zurückgestellt** (dokumentiert): verbindungsspezifisches Geheimnis für `DELETE`/Verbindungsbesitz (Token bleibt die
Grenze); WebSocket + HTTP/2 (§7); strenge Barrieren zwischen Prompt-Ergebnis und nachfolgendem Update (§11).

---

## 13. Review Runde 4 – PR-Nachbesserungen (rebased auf #4469)

Branch auf `daemon_mode_b_main` (#4353 + #4469) rebased – **sauber, keine Konflikte**. Zwei PR-
Reviewer (GPT-5 + qwen3.7-max). Suite jetzt **25 Tests**; Live erneut verifiziert (125 `session/update`
→ `end_turn`).

| #   | Schweregrad | Feststellung                                                                                                                                                                                   | Korrektur                                                                                                                                                                                           |
| --- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | **P0**      | Die "SSE-Schreibfehlerbehandlung" aus Runde 3 war dokumentiert, aber NICHT implementiert – `SseStream` überließ es immer noch den verwerfenden Aufrufern (Zombie-Streams).                     | `writeRaw` übernimmt jetzt die Verantwortung: erste Schreibablehnung loggt einmal + führt `close()` aus; `doWrite` hört auch auf `'error'` (lehnt sofort ab statt auf `'close'` zu warten); `onClose` in try/catch eingewickelt. |
| C2  | **P1**      | `fromLoopback` wurde nur bei `initialize` erfasst + der Helfer war enger als REST → `local-only`-Abstimmungen von einem späteren POST wurden falsch beurteilt.                                 | Loopback pro Anfrage durch `handle`→`sessionCtx`/`resolveClientResponse` gereicht; `isLoopbackReq` erweitert auf `127.0.0.0/8` + `::ffff:127.*` + `::1` (entspricht REST).                         |
| C3  | **P1**      | Fehlerweiterleitung leitete vom `params.sessionId` auf einen Stream → verbindungsspezifische Methodenfehler (`session/load`/`resume`/`close`/`heartbeat`) wurden an einen nicht existierenden Sitzungs-Stream umgeleitet (still verloren). | `CONN_ROUTED_METHODS`-Set; Fehler werden auf demselben Weg wie der Erfolgspfad weitergeleitet. |
| C4  | **P1**      | `bridge.detachClient` wurde beim Abbau nie aufgerufen → veraltete von der Bridge gestempelte Client-Ids verbleiben in `knownClientIds()`/Voter-Sets.                                           | Registry nimmt eine `DetachSessionFn` entgegen; `closeSessionStream`/`destroy` lösen jede besessene Sitzung (best-effort). |
| C5  | **P1**      | `session/close` übersprang lokale Bereinigung, wenn `bridge.closeSession` einen Fehler warf.                                                                                                   | `closeSessionStream` in ein `finally` verschoben. |
| C6  | **P2**      | Windows `cwd` (`C:\…`) wurde von `startsWith('/')` abgewiesen.                                                                                                                                 | `path.isAbsolute` (plattformbewusst), passend zu REST. |
| C7  | **P2**      | `protocolVersion` könnte auf `0`/negativ verhandeln.                                                                                                                                           | Clamp `Math.max(1, Math.min(requested, 1))`; Tests für 0/neg/riesig/ungültig. |
| C8  | **P2**      | `session/load`/`resume` akzeptierten leere `sessionId`.                                                                                                                                        | Leere mit `INVALID_PARAMS` ablehnen. |
| C9  | **P2**      | Fehler bei `session/prompt` im Notification-Format verschwanden still.                                                                                                                         | Protokollieren auf dem Pfad ohne Id. |
| C10 | **P2**      | Sitzungs-SSE spülte gepufferte Frames vor Headers/`retry:` aus.                                                                                                                                | `open()` vor `attachSessionStream`.                                                                                                                                                         |
| C11 | **P2**      | Doppeltes lokales `logStderr`.                                                                                                                                                                 | Gemeinsame `writeStderrLine` aus `utils/stdioHelpers`. |
| C12 | **P2**      | Dokumentation bewarb `--no-acp-http`-Flag, `acp_http`-Capability-Tag und `fs/*`-Weiterleitung, die nicht in v1 enthalten sind.                                                                 | Dokumentation an die ausgelieferte Oberfläche angepasst (nur Umgebungsvariablen-Umschalter; `fs/*`+`terminal/*` + Flag + Tag als zurückgestellt markiert). |
Weiterhin zurückgestellt (unverändert): WebSocket + HTTP/2; per-Connection-Secret für `DELETE`/Ownership (Token + Single-Workspace bleibt die Grenze); strikte Prompt-Ergebnis-Reihenfolgenbarriere; die `as never` Bridge-Boundary-Casts (gezielt, vermerkt für ein Adapter-Types-Follow-up).

---

## 14. Review-Runde 5 — PR-Einarbeitungen

Ein weiterer Prüfdurchlauf (qwen3.7-max). Suite **26 Tests**, live erneut verifiziert.

| #   | Schweregrad | Befund                                                                                                                                                                                                                                                                                                                                                                                | Behebung                                                                                                                                                          |
| --- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **P0**      | `resolveClientResponse` löschte den ausstehenden Eintrag, BEVOR `respondToSessionPermission` aufgerufen wurde. Eine fehlerhafte Abstimmung (`result: {}`) führt dazu, dass der Bridge-Mediator einen Fehler wirft — und da der ausstehende Eintrag bereits verschwunden ist, kann `abandonPendingForSession` von der Bereinigung ihn nicht abbrechen, sodass der Prompt des Agenten auf einer Abstimmung hängt, die nie aufgelöst wird (ein Token-Inhaber könnte eine Session mit einem einzigen fehlerhaften POST blockieren). | Die Abstimmung in try/catch wrappen; bei jedem Fehler auf `cancelAbandonedPermission` zurückfallen, damit der Mediator immer freigegeben wird. Neuer Test deckt den Pfad der fehlerhaften Abstimmung ab. |
| D2  | **P1**      | Session-Stream `onClose` hat nur die Ereignisschleife abgebrochen, nicht `binding.promptAbort` — eine Client-Trennung (Tab schließen / Netzwerkabbruch) ließ den laufenden Prompt weiterlaufen (Quota + FIFO) bis zur Leerlauf-TTL.                                                                                                                                                  | `onClose` bricht jetzt auch `promptAbort` der Session ab.                                                                                                         |
| D3  | **P1**      | Wenn `pumpSessionEvents` zurückgewiesen wurde, protokollierte `.catch` nur — der SSE-Stream blieb offen und sendete Heartbeats, aber lieferte nichts (Zombie, kein Wiederverbindungssignal).                                                                                                                                                                                          | `.catch` ruft jetzt auch `closeSessionStream(sessionId)` auf.                                                                                                     |

---

## 15. Review-Runde 6 — PR-Einarbeitungen

Ein weiterer Prüfdurchlauf (qwen3.7-max). Suite **28 Tests**, live erneut verifiziert.

| #   | Schweregrad | Befund                                                                                                                                                                                                                                  | Behebung                                                                                                                                                                                                                                                          |
| --- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | **P0**      | `handlePrompt` überschrieb `binding.promptAbort`, ohne den vorherigen Controller abzubrechen — zwei gleichzeitige `session/prompt`s für eine Session ließen den ersten verwaist (läuft im Bridge-FIFO bis zum Ende, durch `session/cancel` nicht abbrechbar). | Vor dem Installieren des neuen `promptAbort` den vorherigen abbrechen. Test hinzugefügt.                                                                                                                                                                           |
| E2  | **P0**      | Der `subscribeEvents`-wirft-Pfad sendete eine `stream_error`-Benachrichtigung und dann `return` (aufgelöst) — der `.catch` des Aufrufers wurde nie ausgelöst, was einen Zombie-SSE-Stream hinterließ (Heartbeats, keine Ereignisse, kein Wiederverbindungssignal).                              | Nach der Benachrichtigung erneut werfen, damit der `.catch` des Aufrufers den Stream schließt. Test bestätigt Prompt-Schließung.                                                                                                                                  |
| E3  | **P1**      | SSE-Heartbeat markierte die Verbindung nicht als aktiv — ein langer Prompt ohne Zwischenereignisse für >30 Minuten wurde durch Leerlauf-Bereinigung entfernt (Streams + Prompts beendet).                                                | `SseStream` nimmt einen `onHeartbeat`-Hook entgegen; beide GET-Handler übergeben `() => conn.touch()`.                                                                                                                                                            |
| E4  | **P2**      | `pumpSessionEvents` `.catch` schloss nach sessionId — eine Wiederverbindung zwischen dem Wurf und der Mikrotask könnte den NEUEN Stream töten.                                                                                         | Identitätswächter: Nur schließen, wenn `binding.stream` noch dieser Stream ist.                                                                                                                                                                                   |
| E6  | **P2**      | `sendSession` erstellte automatisch ein Binding — ein später Pump/Reply-Frame nach `closeSessionStream` erweckte ein Geister-Binding, das bis zu 256 Frames für immer pufferte.                                                          | `sendSession` ist jetzt Nur-Nachschlagen: Verworfene Frames, wenn die Session kein Live-Binding hat.                                                                                                                                                             |
| E5  | akzeptiert  | `session/load`/`resume` lehnen nicht ab, wenn eine andere Live-Verbindung die Session besitzt („Hijack“).                                                                                                                                | **Akzeptiert, nicht geändert:** Die Vertrauensgrenze des Daemons ist das Bearer-Token + Single-Workspace-Binding, und Multi-Client-Attachment ist beabsichtigt (die Bridge ist von Natur aus Multi-Client; REST hat dieselbe Eigenschaft). Ein Token-Inhaber gewinnt keine Fähigkeit, die ihm über REST fehlt. Zusammen mit den anderen Token-Grenz-Items nachverfolgt (DELETE-Ownership, §13). |

---

## 16. Review-Runde 7 — PR-Einarbeitungen

Ein weiterer Prüfdurchlauf (qwen3.7-max). Suite **30 Tests**, live erneut verifiziert.

| #   | Schweregrad | Befund                                                                                                                                                                                                                        | Behebung                                                                                                                                                                                                                   |
| --- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | **P0**      | Gleichzeitige `session/close` TOCTOU: `ownedSessions.delete` lief nur in `finally` (nach dem await), sodass zwei gleichzeitige Closes beide `requireOwned` bestanden → irreführender Fehler für den 2. + redundanter Bridge-Close. | Den Ownership-Gate SYNCHRON vor dem await löschen; Bridge-Close läuft einmal. Test hinzugefügt.                                                                                                                             |
| F2  | **P1**      | Pump-Lebenszyklus: Ein sauberes Iterator-Ende (Subprozess beendet, `done`) löste sich auf → der `.catch` wurde nie ausgelöst → Zombie-Stream; und ein Iterator-Fehler mitten im Stream sendete kein `stream_error`.            | `pumpSessionEvents` umschließt die gesamte Schleife (synchrone und mid-stream-Fehler senden `stream_error` und werfen dann erneut); der Consumer `.then(onDone, onErr)` schließt den Stream auf BEIDEN Pfaden (identitätsgeschützt). Tests hinzugefügt. |
| F3  | **P2**      | 503-Verbindungsgrenzen-Ablehnung hatte keine stderr-Ausgabe.                                                                                                                                                                  | `writeStderrLine` mit dem Grenzwert.                                                                                                                                                                                       |
| F4  | **P2**      | `_qwen/notify stream_error`-Spread ließ `event.data.kind` den Diskriminator überschatten.                                                                                                                                     | Zuerst spreaden, dann `kind: 'stream_error'`.                                                                                                                                                                              |
| F5  | **P2**      | `MAX_WORKSPACE_PATH_LENGTH` erneut deklariert (`= 4096`) vs. das kanonische `fs/paths.js`.                                                                                                                                    | Aus `../fs/paths.js` importieren (keine Abweichung).                                                                                                                                                                         |
| F6  | **P2**      | `isObjectParams` dupliziert `json-rpc.isObject`.                                                                                                                                                                              | `isObject` importieren.                                                                                                                                                                                                    |
| F7  | **P2**      | Rohes `process.stderr.write` in `index.ts`/`sse-stream.ts` vs. `writeStderrLine` anderswo.                                                                                                                                    | Auf `writeStderrLine` im gesamten Modul vereinheitlicht.                                                                                                                                                                   |

---

## 17. REST-Äquivalenzangleichung + Prüfung und Umsetzung des Erweiterungsschemas (Runde 8)

Ziel: `/acp` zu einem **äquivalenten Ersatz** für REST+SSE machen. Diese Charge basiert auf Prüfungsergebnissen, um das Erweiterungsschema umzustrukturieren und **alle bereits von der Bridge exponierten Fähigkeiten** zu ergänzen; Fähigkeiten, die die Bridge noch nicht besitzt (Datei-I/O, Gerätestreams, Agents/Memory-CRUD), werden aus Gründen der architektonischen Korrektheit **zuerst von acp-bridge ergänzt** (siehe §17.3).

### 17.1 Prüfung des Erweiterungsschemas → Umsetzung (ersetzt das alte Schema aus §5)

Abgleich basierend auf dem **repository-eigenen SDK `@agentclientprotocol/sdk@0.14.1`** (nicht nur Website):

- `session/set_config_option` ist eine **erstklassige (nicht `unstable_`) Methode**, Anfrage `{sessionId, configId, value}`, `category` umfasst `model`/`mode`/`thought_level`; während `set_model` weiterhin `unstable_setSessionModel` verwendet.
- Die Spezifikation behält das `_`-Präfix für Erweiterungen bei, Beispiel ist der Domain-Stil `_zed.dev/…`; Herstellerdaten werden in `_meta` nach Domain-Schlüssel abgelegt.

Umsetzung:

- **Namespace `_qwen/` → umgekehrter Domainname `_qwen/`**; `_meta` vereinheitlicht auf `_meta:{ "qwen": … }` (enthält `initialize`-Fähigkeitsanzeige und `requestId` von `session/request_permission`).
- **Modell + Genehmigungsmodus → Standard `session/set_config_option`** (`configId:"model"|"mode"`), routed zu bestehenden `bridge.setSessionModel`/`setSessionApprovalMode`; `session/new`-Ergebnis **wirbt `configOptions`** (aus dem Subprozess-Session-Status `getSessionContextStatus().state.configOptions`, bereits in ACP-Form). **Löschen** des herstellerspezifischen `_qwen/session/set_model`.
- REST(http+sse) **benötigt keine synchrone Änderung**: Beide Transporte teilen sich dieselbe Bridge, der Status ist von Natur aus konsistent.

### 17.2 In dieser Charge neu hinzugefügte `/acp`-Methoden (Bridge bereits unterstützt, 1:1-Angleichung an REST)

| REST                                                  | `/acp`                                             | Bridge                                   |
| ----------------------------------------------------- | -------------------------------------------------- | ---------------------------------------- |
| `POST /session/:id/model` / `approval-mode`           | **Standard** `session/set_config_option` (model/mode) | setSessionModel / setSessionApprovalMode |
| `GET /session/:id/context`                            | `_qwen/session/context`                            | getSessionContextStatus                  |
| `GET /session/:id/supported-commands`                 | `_qwen/session/supported_commands`                 | getSessionSupportedCommandsStatus        |
| `PATCH /session/:id/metadata`                         | `_qwen/session/update_metadata`                    | updateSessionMetadata                    |
| `GET /workspace/{mcp,skills,providers,env,preflight}` | `_qwen/workspace/{…}`                              | getWorkspace\*Status                     |
| `POST /workspace/init`                                | `_qwen/workspace/init`                             | initWorkspace                            |
| `POST /workspace/tools/:name/enable`                  | `_qwen/workspace/set_tool_enabled`                 | setWorkspaceToolEnabled                  |
| `POST /workspace/mcp/:server/restart`                 | `_qwen/workspace/restart_mcp_server`               | restartMcpServer                         |

(Bereits vorhanden: session/new·load·resume·close·list·prompt·cancel, heartbeat, permission, events bereits angeglichen.)

### 17.3 Noch Lücken → erfordert, dass acp-bridge zuerst ergänzt (architektonische Korrektheit)

Die **Datei-I/O** (`/file /glob /list /stat /file/write /file/edit`), **Gerätefluss-Anmeldung** (`/workspace/auth/*`), **Agents CRUD** (`/workspace/agents`), **Memory CRUD** (`/workspace/memory`) von REST befinden sich derzeit **nicht auf `HttpAcpBridge`** — REST-Routen rufen direkt Route-Level-Dienste auf (`WorkspaceFileSystemFactory`, `DeviceFlowRegistry`, `SubagentManager`, `writeWorkspaceContextFile`), und umgehen die Bridge.

**Entscheidung (in Übereinstimmung mit Review/Owner-Meinung)**: Den `/acp`-Transport nicht direkt mit diesen Route-Level-Diensten verbinden lassen (das würde die architektonische Drift von REST kopieren und die Transportkopplung verdoppeln). **Richtiger Ansatz ist, diese Fähigkeiten zuerst auf `HttpAcpBridge` von `@qwen-code/acp-bridge` zu ergänzen** (z.B. `readWorkspaceFile`/`writeWorkspaceFile`/`globWorkspace`, `startDeviceFlow`/`pollDeviceFlow`, `listAgents`/`upsertAgent`/`deleteAgent`, `readMemory`/`writeMemory`), sodass sowohl REST als auch `/acp` über die Bridge gehen. Dann erhält `/acp` zusätzlich `_qwen/fs/*`, `_qwen/auth/*`, `_qwen/workspace/agent*`, `_qwen/workspace/memory*` (Dateilesen ist mangels standardmäßiger ACP-Client→Agent-Methode eine legitime Herstellererweiterung).

**Vollständige Äquivalenz = diese Charge (Bridge bereits vorhandene Fähigkeiten) + nachfolgende Charge, nachdem acp-bridge die Lücken gefüllt hat**.

---

## 18. Review-Runde 9 — PR-Einarbeitungen

| #   | Schweregrad          | Befund                                                                                                                                                                                                                                                                               | Behebung                                                                                                                                                                                   |
| --- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| G1  | **P1 (Regression)** | Session-Stream-Wiederverbindung brach den laufenden Prompt ab: `attachSessionStream` schloss den ALTEN Stream, bevor der neue installiert wurde, und der `onClose` des alten Streams brach bedingungslos `promptAbort` ab — so verlor ein sich wieder verbindender Client (Netzwerkstörung/Roaming) seinen laufenden Prompt. | Den neuen Stream installieren, BEVOR der alte geschlossen wird; den Prompt-Abbruch von `onClose` identitätsgeschützt machen (nur abbrechen, wenn DIES noch der Live-Stream der Session ist). Test hinzugefügt (Prompt überlebt Wiederverbindung). |
| G2  | **P2**               | `session/cancel` übergab `undefined` als `CancelNotification`-Body und verwarf die client-seitigen Abbruchfelder (reason/context), die REST weiterleitet.                                                                                                                            | `{ ...params, sessionId }` weiterleiten (spiegelt REST).                                                                                                                                  |

Rebased auf neuesten `daemon_mode_b_main` (#4473/#4483/#4484/#4500), keine Konflikte. Suite **33 Tests**, live erneut verifiziert.

---

## 19. Fahrplan / Nachfolgende PRs (gegen Vergessen)

Dieser PR (#4472) = ACP Streamable HTTP Transport + **vollständige Angleichung der bridge-gestützten Fähigkeiten** + offizielles Erweiterungsschema. Auf **ready** gesetzt.

Um «`/acp` vollständige Äquivalenz zu REST+SSE» zu erreichen, sind noch erforderlich:

1. **Follow-up PR 1 — acp-bridge Fähigkeiten ergänzen (Voraussetzung / Bridge-first)**: `HttpAcpBridge` um Datei-I/O, Gerätefluss, Agents-CRUD, Memory-CRUD-Methoden erweitern; REST-Routen über Bridge leiten (direkte Verbindung zu Route-Level-Diensten beseitigen).
2. **Follow-up PR 2 — `/acp` restliche Angleichung (abhängig von PR 1)**: `_qwen/fs/*`, `_qwen/auth/*`, `_qwen/workspace/agent*`, `_qwen/workspace/memory*` → vollständige Äquivalenz zu REST.

Nachverfolgung: #3803 (offene Entscheidungen), #4175 (Mode B Fahrplan) wurden bereits kommentiert.
Härtung zurückgestellter Punkte siehe PR-Beschreibung „bekannt zurückgestellt".

---

## 20. Extension-Namespace-Umbenennung + SDK-Transport-Analyse (Runde 11)

- **Namespace `_qwen.ai/` → `_qwen/`**: ACPs einzige harte Regel ist der führende `_`; der `_zed.dev/`-Domain-Abschnitt ist Konvention-by-Example, kein MUSS. Da `qwen` unverwechselbar ist, verwenden wir die kürzere nackte Form. Der `_meta`-Schlüssel ebenfalls `"qwen"`. (Überblick über echte Agenten: Zed/gemini-cli verwenden meist `_meta`-auf-Standardmethoden + ACPs eigene `unstable_*`; nackte benutzerdefinierte `_`-Methoden sind selten — unsere `_qwen/*`-Methoden sind echte neue Workspace-/Session-Operationen ohne standardmäßiges Äquivalent, daher ist eine `_`-Methode das richtige Werkzeug.)
- **Warum handgefertigter Transport (nicht SDK-basiert)**: Das TS-SDK liefert nur `ndJsonStream` (stdio); RFD #721 HTTP ist SDK Phase-3 (nicht implementiert). Die SDK-`Connection` ist ein Einzel-Duplex-Stream; unser Transport ist Multi-Stream (POSTs + connection-SSE + per-session-SSE) und benötigt ausgehenden Demux nach sessionId — den unser Dispatcher bereits zur Routing-Zeit kennt. Ein vollständiger SDK-Umbau bekämpft dieses Modell und würde die Masse nicht entfernen (Bridge-Übersetzung, SSE-Lebenszyklus, Ownership, EventBus→JSON-RPC). **Pragmatische Verbesserung (Kandidat für Follow-up): Übernahme der Zod-Schema-Validierer + Typen des SDKs für die Parametervalidierung, während der handgebaute Transport beibehalten wird.** SDK-Clients, die `extMethod('_qwen/…')` verwenden, arbeiten mit unseren Handlern zusammen (identische Drahtform).