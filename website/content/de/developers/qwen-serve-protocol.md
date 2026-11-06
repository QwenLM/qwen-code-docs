# `qwen serve` HTTP-Protokollreferenz

Stufe 1 des [qwen-code Daemon-Designs](https://github.com/QwenLM/qwen-code/issues/3803). Alle Routen befinden sich unter der Basis-URL des Daemons (Standard `http://127.0.0.1:4170`).

Diese Referenz beschreibt HTTP-Routen und SSE-Framing. Lesen Sie sie zusammen mit dem [typisierten Ereignisschema](./daemon/09-event-schema.md) für Payload-Verträge, Resync-Gründe und History-Anker, dem [Event-Bus- und Replay-Leitfaden](./daemon/10-event-bus.md) für Zustellung und Backpressure sowie [Fähigkeiten und Versionierung](./daemon/11-capabilities-versioning.md) für das bestehende `v1`-Protokoll und Kompatibilitätsregeln. Der [Daemon-Dokumentationsindex](./daemon/00-index.md) verlinkt den vollständigen Vertragssatz.

## Authentifizierung [#authentication]

Wenn der Daemon mit `--token` oder `QWEN_SERVER_TOKEN` gestartet wurde – oder nicht-loopback gebunden ist ohne beide, was ein ephemeres Bearer-Token generiert und es einmalig beim Start ausdruckt –, müssen **alle normalen API-Routen außer `/health` bei gewöhnlichen Loopback-Bindungen** Folgendes enthalten:

```
Authorization: Bearer <token>
```

Ohne konfiguriertes Token auf dem Loopback-Standard ist der Header optional, und Anfragen, die über den primären Listener eintreffen, haben volle Betreiber-API-Autorität. Workspace-Vertrauen, Sitzungsbesitz, `X-Qwen-Client-Id`, Berechtigungen, Funktionen, Validierung und Ressourcenprüfungen gelten weiterhin. Der Token-Vergleich erfolgt in konstanter Zeit. 401-Antworten sind einheitlich über `missing header` / `wrong scheme` / `wrong token` hinweg.

**`--open-with-auth`.** Dieser standardmäßig deaktivierte CLI-Modus erfordert eine Loopback-Bindung und ein verfügbares Web Shell. Er nutzt die normale `--token`-über-`QWEN_SERVER_TOKEN`-Auswahl oder generiert 32 zufällige Bytes, kodiert als base64url, vor dem Daemon-Start, wenn diese Auswahl leer ist. Der Browser erhält das ausgewählte Bearer-Token über `#token=` und speichert es pro Tab; das Protokoll und die Middleware sehen ein normales konfiguriertes Token. Die Fragmentzustellung basiert auf dem aufgelösten Token, nicht auf diesem Flag: Jeder `--open`-Start hängt das aufgelöste Bearer-Token – konfiguriert oder generiert – an das `#token=`-Fragment der gestarteten URL an (sichtbar für lokale Benutzer via `ps` / `/proc`, wie der Launcher warnt), sodass eine Nicht-Loopback-Bindung mit bloßem `--open` sein generiertes Bearer-Token auf dieselbe Weise an den Browser übergibt; die spezifischen Beiträge dieses Flags sind die Token-_Generierung_ auf Loopback und der manuelle URL-Fallback für browserunfähige Umgebungen. Nur direkte eingebettete Aufrufer, die `RunHandle.resolvedToken` ignorieren, und Clients, die nie einen Browser starten, erhalten keine automatischen Zugangsdaten. In browserunfähigen Umgebungen wird die URL mit dem Geheimnis-Fragment zum manuellen Öffnen ausgegeben. Loopback `/health` und statische Web Shell-Assets behalten die unten beschriebenen Ausnahmen bei; `--require-auth` steuert weiterhin `/health`.

Der Kanal-Webhook-Eingang (`POST /channels/:channelName/webhooks/:source`) ist in jedem Modus getrennt von diesem Bearer-Vertrag. Wenn er gemountet ist, wird er vor `bearerAuth` registriert und authentifiziert sich mit seinem konfigurierten `x-qwen-webhook-secret`; das Rotieren des Daemon-Bearer-Tokens rotiert keine Webhook-Quellgeheimnisse.

**`/health`-Ausnahme** (Bctum): Bei Loopback-Bindungen (`127.0.0.0/8` / `localhost` / `::1` / `[::1]`) wird `/health` VOR der Bearer-Middleware registriert, sodass Liveness-Probes im Pod das Token nicht tragen müssen, selbst wenn der Daemon mit `--token` gestartet wurde. Nicht-Loopback-Bindungen (`--hostname 0.0.0.0` usw.) steuern `/health` zusammen mit den anderen normalen API-Routen – siehe den Abschnitt [`GET /health`](#get-health) für die Begründung.

**`--require-auth` (#4175 PR 15).** Übergeben Sie dieses Flag beim Booten, um die Regel "Token erforderlich" auch auf Loopback auszudehnen. Das Booten schlägt fehl, wenn keine Token-Quelle aufgelöst werden kann – auf Loopback bedeutet das `--token`, `QWEN_SERVER_TOKEN` oder `--open-with-auth` (was sein eigenes generiertes Token vor dem Booten installiert, sodass `--require-auth --open-with-auth` startet). Das Fail-Fast gilt nur für Loopback: Eine Nicht-Loopback-Bindung löst das ephemere Bearer-Token auf, das sie generiert, wenn keine der konfigurierten Quellen vorhanden ist, und dies erfüllt das Flag. Die `/health`-Ausnahme wird in beiden Fällen aufgehoben, sodass `/health` ebenfalls `Authorization: Bearer …` erfordert.

Wenn das Flag aktiv ist, steuert die globale `bearerAuth`-Middleware **jede normale API-Route** – einschließlich `/health` und `/capabilities`. Der Kanal-Webhook-Eingang bleibt unabhängig durch gemeinsames Geheimnis authentifiziert, und Web Shell-Dokument- und Asset-Routen bleiben vor der Authentifizierung verfügbar. Ein **nicht authentifizierter** Client kann daher `caps.features` nicht vorab testen, um festzustellen, dass Authentifizierung erforderlich ist: Die Entdeckungsfläche für diesen Fall ist der **401-Antworttext** selbst (einheitlich über bearer-gesteuerte Routen gemäß dem Abschnitt [Authentifizierung](#authentication)). Das `require_auth`-Fähigkeitstag ist eine **Bestätigung nach der Authentifizierung** – sobald ein Client erfolgreich authentifiziert ist und `/capabilities` liest, bestätigt die Anwesenheit des Tags, dass der Daemon mit `--require-auth` gestartet wurde (nützlich für Audit-/Compliance-UIs und für SDK-Clients, um "diese Bereitstellung ist gehärtet" in einem Einstellungsfenster anzuzeigen). Strenge Mutationsrouten akzeptieren vertrauenswürdige Loopback-Anfragen vom primären Listener, bearer-authentifizierte Anfragen oder gepaarte Local Control-Anfragen. Nicht vertrauenswürdige tokenlose Einbettungen erhalten weiterhin `401 { code: "token_required", error: "…" }`; mit `--require-auth` lehnt die globale Bearer-Middleware zuerst mit dem Legacy-`Unauthorized`-Text ab.

**`--allow-origin <pattern>` (T2.4 [#4514](https://github.com/QwenLM/qwen-code/issues/4514)).** Browser-Clients, die den Daemon cross-origin ansprechen, werden standardmäßig blockiert – eine Anfrage mit einem `Origin`-Header gibt `403 {"error":"Request denied by CORS policy"}` zurück, da CLI/SDK-Clients nie `Origin` senden und der Daemon dessen Vorhandensein als Zeichen dafür wertet, dass die Anfrage aus einem Browser-Kontext stammt, in den der Betreiber nicht eingewilligt hat. Eine Ausnahme geht der Blockade bei einer Nicht-Loopback-Bindung mit Token voraus: Eine Same-Origin-Anfrage (`Origin` gleich dem direkten Socket-Schema plus der normalisierten `Host`-Autorität) wird bearer-authentifiziert und ihr `Origin` entfernt **auf dem primären Listener** – mit einem gültigen Bearer folgt der Status der Route selbst, mit einem fehlenden oder ungültigen Bearer ein `401`, **außer den vor-authentifizierten Web Shell-Dokument-, `/assets/*`-, `/manifest.webmanifest`-, `/sw.js`- und `/mcp-app-sandbox`-Routen, die ohne Zugangsdaten bereitgestellt werden wie in allen anderen Modi** – und nur Cross-Origin- oder nicht übereinstimmende `Origin`-Werte behalten den `403`-Umschlag bei. Übergeben Sie `--allow-origin <pattern>` (wiederholbar) beim Booten, um eine Allowlist anstelle der Blockade zu installieren. Jedes Muster ist entweder:

- Das Literal `*` — akzeptiert jeden Ursprung. **Risiko**: Der Start wird verweigert, wenn `*` konfiguriert ist, aber kein Bearer-Token aufgelöst werden kann. Die Prüfung liest das _aufgelöste_ Token — `--token`, `QWEN_SERVER_TOKEN`, das generierte Loopback-Token von `--open-with-auth` oder das ephemere Bearer-Token, das bei einer Nicht-Loopback-Bindung generiert wird, wenn keine der konfigurierten Quellen vorhanden ist — daher ist diese Verweigerung nur auf Loopback beschränkt. Die Boot-Nachricht gibt eine stderr-Warnung aus, wenn `*` in der Liste enthalten ist. **Empfehlung**: Kombinieren Sie dies mit `--require-auth` bei Loopback-Bindungen, damit auch `/health` durch das Bearer-Token geschützt wird — es ist standardmäßig vor der Bearer-Middleware auf Loopback registriert (damit k8s/Compose-Probes es ohne Token erreichen können), und eine `*`-Allowlist macht es für jeden Cross-Origin-Browser erreichbar. `--require-auth` lässt die Web Shell-Statische Assets (`/`, `/assets/*`, `/manifest.webmanifest`, `/sw.js` sowie `/session/:id`, `/plugins`, `/channels`, `/live`, `/scheduled-tasks`, `/goals` und `/settings` Dokumentnavigationen) weiterhin vor der Authentifizierung auf Loopback verfügbar — sie werden vor der Bearer-Middleware gemountet — daher bleiben sie unter einer `*`-Allowlist für jeden Cross-Origin-Browser lesbar; `--no-web` entfernt diese Oberfläche. Bei Nicht-Loopback-Bindungen ist das Bearer-Token bereits beim Start obligatorisch und `/health` ist dahinter registriert. Normale API-Routen sind durch Bearer-Tokens geschützt, der Channel-Webhook-Eingang behält sein eigenes Shared-Secret-Gate, und Web Shell-Statische Assets (`/`, `/assets/*`, `/manifest.webmanifest`, `/sw.js` sowie `/session/:id`, `/plugins`, `/channels`, `/live`, `/scheduled-tasks`, `/goals` und `/settings` Dokumentnavigationen) bleiben vor der Authentifizierung verfügbar, es sei denn, `--no-web` entfernt sie.
- Eine kanonische URL-Origin — `<scheme>://<host>[:<port>]`. **Kein abschließender Schrägstrich, kein Pfad, keine Userinfo, keine Query.** Der Start wird mit `InvalidAllowOriginPatternError` verweigert, wenn der Eintrag den Round-Trip `new URL(pattern).origin === pattern` nicht besteht; die Fehlermeldung nennt das ungültige Muster und die kanonische Form. Streng nach Absicht: Stille Normalisierung (z. B. das Trimmen eines abschließenden `/`) würde Tippfehler durchlassen und mehrdeutige Eingaben akzeptieren. Ohne ein aufgelöstes Token — was nach der Generierung eine Loopback-Bindung bedeutet — sind HTTP(S)-Einträge auf Loopback-Hosts beschränkt; eine Nicht-Loopback-Browser-Origin erfordert ein Token, da sie andernfalls die gesamte Operator-API einschließlich Codeausführung als Daemon-Benutzer steuern könnte. Explizite Browser-Erweiterungs-Origin behalten ihren bestehenden tokenlosen lokalen Automatisierungspfad. Beim Start wird die Autorität protokolliert, die jeder tokenlosen erlaubten Browser-Origin gewährt wird.

Übereinstimmende Origins erhalten die Standard-CORS-Antwortheader bei jeder Anfrage:

```
Access-Control-Allow-Origin: <echoed origin>
Vary: Origin
Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS
Access-Control-Allow-Headers: Authorization, Content-Type, X-Qwen-Client-Id, Last-Event-ID, X-Qwen-Event-Epoch
Access-Control-Max-Age: 86400
Access-Control-Expose-Headers: Retry-After, X-Qwen-Event-Epoch, X-Qwen-SSE-Stream-Id
```

`Access-Control-Allow-Origin` spiegelt die Origin der Anfrage wörtlich wider (Groß-/Kleinschreibung wie vom Browser gesendet) anstelle des Literals `*`, selbst unter dem Muster `*` — Browser-Caches speichern Antworten darauf gepaart mit `Vary: Origin`, und das Spiegeln lässt Raum, um in einer späteren Version `Access-Control-Allow-Credentials` hinzuzufügen, ohne das Schema zu ändern. Die exponierten Header ermöglichen es Browser-Clients, Retry-Hinweise zu beachten, die SSE-Epoche beizubehalten und akzeptierte physische Streams zu korrelieren. `Access-Control-Allow-Credentials` wird heute **NICHT** gesendet: Konfigurierte Daemon-Anmeldeinformationen verwenden Bearer-in-`Authorization`, was über Origin hinweg ohne `credentials: 'include'` funktioniert; vertrauenswürdige Loopback-Autorität benötigt keine Browser-Anmeldeinformationen.

OPTIONS-Preflight-Anfragen (OPTIONS mit `Access-Control-Request-Method` oder `Access-Control-Request-Headers`) werden kurzgeschlossen mit `204 No Content` plus den oben genannten Headern. Dies ist das konventionelle CORS-Muster und ist sicher — der Preflight bestätigt nur, welche Methoden/Header der Daemon akzeptiert; die tatsächliche nachfolgende Anfrage führt weiterhin das Host-Gate aus und dann entweder das Bearer-/Listener-Autoritäts-Gate oder das Channel-Webhook-Shared-Secret-Gate, bevor Zustände gelesen oder geändert werden. Einfache OPTIONS-Anfragen von übereinstimmenden Origins fließen weiterhin downstream mit angehängten CORS-Headern.

Origins, die nicht zur Allowlist passen, erhalten weiterhin `403 {"error":"Request denied by CORS policy"}` — dieselbe Hülle wie die Standardwand, sodass Clients, die die Antwort der Wand bereits geparst haben, keine Sonderbehandlung für Daemon-Bereitstellungen mit Allowlist benötigen. Der Ablehnungspfad sendet **keine** `Access-Control-*`-Header (der Browser würde sie ignorieren, und das Senden würde indirekt die Größe der Allowlist über die Anwesenheit von Headern bekannt geben).

Die konfigurierte Musterliste wird absichtlich NICHT in `/capabilities` wiedergegeben — ein Browser-Client kennt seine eigene Origin bereits (er hat schließlich den Daemon aufgerufen), und das Offenlegen der Liste würde einem unauthentifizierten Leser von `/capabilities` ermöglichen, jede vertrauenswürdige Origin aufzulisten (nützliche Reconnaissance für eine falsch konfigurierte Bereitstellung). SDK-Clients prüfen auf das `caps.features.allow_origin`-Tag für "dieser Daemon respektiert Cross-Origin-Browser-Anfragen", ohne die spezifischen Origins kennen zu müssen.

Loopback-Self-Origin-Anfragen (z. B. wenn die Web Shell den Daemon auf derselben `127.0.0.1:port` aufruft) werden von einem **separaten** Origin-Strip-Shim behandelt, der VOR der CORS-Middleware läuft und den Header `Origin` für `127.0.0.1:port` / `localhost:port` / `[::1]:port` / `host.docker.internal:port` oder die exakte gebundene Loopback-Adresse und den Port entfernt. Er akzeptiert auch die schemabasierten portlosen Formen, die Browser für Standardports senden: `http://host` auf Port 80 und `https://host` auf Port 443. Diese Anfragen passieren unabhängig von der `--allow-origin`-Konfiguration — Operatoren müssen den eigenen Port des Daemons nicht auflisten, damit die Web Shell funktioniert.

## Gängiges Fehlerformat

5xx-Antworten tragen die ursprünglichen Fehlerfelder `code` und `data`, wenn vorhanden (JSON-RPC-Stil — das ACP-SDK leitet `{code, message, data}` vom Agenten weiter):

```json
{
  "error": "Internal error",
  "code": -32000,
  "data": { "reason": "model quota exceeded" }
}
```

Ungültiges JSON im Anfragekörper gibt zurück:

```json
{ "error": "Invalid JSON in request body" }
```

mit Status `400`.

`SessionNotFoundError` für eine unbekannte Session-ID gibt zurück:

```json
{
  "error": "No session with id \"<sid>\"",
  "sessionId": "<sid>",
  "code": "session_not_found"
}
```

mit Status `404`. Ein gleichzeitiger Schließvorgang verwendet `code: "session_closing"`.

`WorkspaceMismatchError` für eine `POST /session`, deren `cwd` nicht zu einer registrierten Workspace normalisiert wird, gibt `400` zurück mit:

```json
{
  "error": "Workspace mismatch: daemon is bound to \"…\"",
  "code": "workspace_mismatch",
  "boundWorkspace": "/path/the/daemon/uses/as-primary",
  "requestedWorkspace": "/path/in/the/request"
}
```

Verwenden Sie dies, um Abweichungen vorab zu erkennen: Lesen Sie `workspaceCwd` aus `/capabilities` und lassen Sie `cwd` in `POST /session` weg (es fällt auf die primäre Workspace zurück), oder wählen Sie eine aus `workspaces[].cwd`, wenn `multi_workspace_sessions` beworben wird.

`POST /session` über der konfigurierten Obergrenze `--max-sessions` des Daemons gibt `503` zurück mit einem `Retry-After: 5`-Header und:

```json
{
  "error": "Session limit reached (20)",
  "code": "session_limit_exceeded",
  "limit": 20,
  "scope": "workspace"
}
```

Wenn die effektive daemonweite Gesamt-Obergrenze eine neue Session ablehnt — `--max-total-sessions` oder die unter `limits.maxTotalSessions` beschriebene Standardeinstellung — wird dasselbe Antwortformat mit `"scope": "total"` zurückgegeben.

Anhängende Verbindungen zu bestehenden Sessions werden NICHT auf die Obergrenze angerechnet, sodass Reconnects eines inaktiven Daemons auch bei Erreichen der Kapazität weiterhin funktionieren.

Wenn das Initialisierungsbudget des ACP-Kanals abläuft, bevor `newSession` dispatcht wird, gibt `POST /session` `504` zurück mit `Retry-After: 5` und:

```json
{
  "error": "AcpSessionBridge initialize timed out after 10000ms",
  "code": "init_timeout",
  "errorKind": "init_timeout",
  "retryable": true,
  "sideEffectPossible": false,
  "phase": "channel.initialize",
  "timeoutMs": 10000
}
```

`timeoutMs` — und die numerische Endung von `error` — spiegeln das konfigurierte `--initialize-timeout-ms`-Budget des Daemons wider (die obigen Werte sind die Standardeinstellungen). Das vollständige sichere Wiederholungsformat oben wird nur für die einfache Session-Erstellung ausgegeben, wo die Kanalinitialisierung streng jeder dauerhaften Mutation vorausgeht: Auf diesem Pfad ist das Feld `sideEffectPossible: false` maßgeblich, weil die Initialisierung der ACP-Anfrage `newSession` vorausgeht, und ein Client, der diesen strukturierten Vertrag versteht, kann nach der angegebenen Verzögerung wiederholen, ohne das Risiko einer doppelten Session einzugehen.

Anfragen, die `branch` oder `worktree` enthalten, sowie Initialisierungs-Timeouts, die von mutierenden Routen außer der einfachen Erstellung zurückgegeben werden (z. B. `POST /session/:id/branch` und `POST /session/:id/side-task`, bei denen ein committeter Fork den fehlgeschlagenen Handshake überleben kann), geben dasselbe `504` mit `code: "init_timeout"`, `phase` und `timeoutMs` zurück — aber OHNE `Retry-After`, `retryable` oder `sideEffectPossible`. Für diese ist das Ergebnis der Mutation unbekannt: Die Vorbereitung von Branch und Worktree verändert Git vor der Initialisierung des Kanals, und der bei einem Fehler versuchte Rollback ist best-effort (ein fehlgeschlagener Checkout-Rollback belässt den Workspace auf dem neuen Branch, und ein erneuter Versuch kann einen Konflikt wegen eines bereits existierenden Branches auslösen). Clients, die alle 5xx-Mutationsantworten als mehrdeutig klassifizieren, bleiben konservativ fail-closed und sollten dieselbe Richtlinie auf die reduzierte Form anwenden. `POST /session/:id/load` und `POST /session/:id/resume` zeigen dieselbe reduzierte `init_timeout` `504` an, wenn die Kanalinitialisierung timeoutet, bevor die Restore-Anfrage gesendet wird (die `ensureChannel`-Phase); im Gegensatz zu den in ihren Errors-Listen dokumentierten `session_restore_timeout` `504` enthält diese Form kein `Retry-After`, kein `retryable` und installiert keinen Fence, da der Restore nie gesendet wurde. Der Dispatch-Timeout für `newSession` bei `POST /session` ist eine Ausnahme: Er gibt `504` mit `code: "init_timeout"`, `retryable: true` und einem budgetbasierten `Retry-After` zurück, aber ohne `phase` oder `sideEffectPossible`, da das Ergebnis der Erstellung mehrdeutig ist. Alle anderen Timeout-Bezeichnungen behalten das generische Mapping bei.

`RestoreInProgressError` — ausgegeben von `POST /session/:id/load`, `POST /session/:id/resume` oder einer caller-supplied-id `POST /session`, wenn eine andere Registrierung bereits diese ID besitzt — gibt `409` zurück und:

```json
{
  "error": "Session \"<sid>\" is already being restored via session/<resume|load>; retry session/<load|resume> after it completes",
  "code": "restore_in_progress",
  "reason": "restore_in_progress",
  "retryable": true,
  "sessionId": "<sid>",
  "activeAction": "load",
  "requestedAction": "resume"
}
```

Wird ausgelöst, wenn ein `session/load` für eine ID herausgegeben wird, für die bereits ein `session/resume` läuft (oder umgekehrt), oder wenn ein Spawn mit caller-supplied-id gegen eine der beiden Restore-Richtungen rennt. Warten Sie mindestens `Retry-After` Sekunden und versuchen Sie es erneut. Races bei gleicher Aktion (`load` vs. `load`, `resume` vs. `resume`) werden zusammengeführt, statt einen Fehler zu werfen, während der Restore aktiv ist.

`reason` unterscheidet zwei Fences, die diesen Code teilen, und der `Retry-After`-Header verfolgt dies:

| `reason` | Bedeutung | `Retry-After` |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `restore_in_progress` | Ein gewöhnlicher Restore läuft. | `5` (passend zu `session_limit_exceeded`) |
| `awaiting_abandoned_cleanup` | Der öffentliche Caller hat bereits einen Timeout erhalten (`504` für Restore oder `init_timeout` für Session-Initialisierung), und die nicht abbrechbare ACP-Anfrage samt ihrer Bereinigung haben sich noch nicht beruhigt. | Das Budget des timeouteten Vorgangs in Sekunden — Restore oder Initialisierung für einen Spawn mit caller-supplied-id — begrenzt auf `5`–`120` |

Die öffentliche Restore-Anfrage wird durch `limits.sessionRestoreTimeoutMs` gesteuert (Standardwert 60 s). Nach einem `504` bleibt die ID gefencet, bis die späte ACP-Anfrage und die Bereinigung abgeschlossen sind. Ein Client, der weiterhin im üblichen 5-Sekunden-Takt wiederholt, würde gegen einen 409-Fehler laufen, den er nicht klären kann — beachten Sie den budgetbasierten Hinweis, der mit `awaiting_abandoned_cleanup` einhergeht.

`SessionWorkspaceConflictError` — ausgegeben von `POST /session/:id/load` und `POST /session/:id/resume`, wenn die angeforderte `cwd` auf einen registrierten Workspace abzielt, dieselbe Session-ID jedoch bereits live ist oder von einer anderen Runtime wiederhergestellt wird — gibt `409` zurück mit:

```json
{
  "error": "Session \"<sid>\" is already live or restoring in another workspace runtime.",
  "code": "session_workspace_conflict",
  "sessionId": "<sid>",
  "workspaceCwd": "/requested/workspace",
  "workspaceId": "requested-workspace-id",
  "liveWorkspaceCwd": "/live/owner/workspace",
  "liveWorkspaceId": "live-owner-workspace-id"
}
```

Clients sollten mit dem besitzenden Workspace erneut versuchen oder warten, bis der laufende Restore abgeschlossen ist, bevor sie die ID in einen anderen Workspace wiederherstellen. Races beim Restore innerhalb desselben Workspaces nutzen weiterhin das `restore_in_progress`-/Coalescing-Verhalten der Bridge.

`SessionArchivedError` wird ausgegeben, wenn ein Caller versucht, eine Session zu laden oder fortzusetzen, deren JSONL unter `chats/archive/` liegt:

```json
{
  "error": "Session \"<sid>\" is archived. Unarchive it before loading.",
  "code": "session_archived",
  "sessionId": "<sid>"
}
```

mit Status `409`.

`SessionArchivingError` wird ausgegeben, wenn für dieselbe ID bereits ein Übergang zum Archivieren oder Entarchivieren einer Session läuft:

```json
{
  "error": "Session \"<sid>\" is being archived or unarchived; retry later.",
  "code": "session_archiving",
  "sessionId": "<sid>"
}
```

mit Status `409` und `Retry-After: 5`.

## Fähigkeiten [#capabilities]

Der Daemon bewirbt seine unterstützten Feature-Tags aus der Serve-Capability-Registry. Clients **müssen** die UI über `features` steuern, nicht über `mode` (gemäß Design §10).

```
['health', 'capabilities', 'session_create', 'session_startup_config', 'session_id_override', 'session_scope_override',
 'session_load', 'session_resume', 'session_transcript',
 'unstable_session_resume',
 'session_list', 'session_catalog_batch', 'session_info', 'session_prompt', 'session_mid_turn_message_mutation',
 'session_mid_turn_send_now',
 'session_cancel', 'session_events',
 'slow_client_warning', 'typed_event_schema',
 'session_set_model', 'client_identity', 'client_heartbeat',
 'session_permission_vote', 'permission_vote', 'workspace_mcp', 'workspace_skills',
 'workspace_skills_config_runtime',
 'workspace_providers', 'workspace_acp_preheat', 'workspace_acp_status',
 'auth_provider_install', 'workspace_memory',
 'workspace_agents', 'workspace_agent_generate', 'workspace_env',
 'workspace_preflight', 'session_context', 'session_context_usage',
 'session_supported_commands', 'session_tasks', 'scheduled_task_gate', 'autofix_pr_watches', 'session_monitor_tool_correlation', 'session_stats',
 'session_lsp', 'session_resources', 'session_status',
 'session_close', 'session_metadata', 'session_organization',
 'session_archive', 'mcp_guardrails',
 'workspace_mcp_manage', 'mcp_guardrail_events',
 'mcp_server_runtime_mutation',
 'workspace_file_read', 'workspace_file_bytes', 'workspace_file_write',
 'workspace_file_upload', 'workspace_file_delete', 'workspace_directory_create', 'workspace_directory_delete',
 'session_approval_mode_control', 'workspace_tool_toggle',
 'workspace_skill_settings_toggle', 'workspace_skill_settings_batch_toggle',
 'workspace_session_refresh',
 'extension_batch_activation_v2', 'extension_activation_explicit_refresh',
 'extension_state',
 'workspace_settings', 'workspace_init', 'workspace_mcp_restart',
 'session_recap', 'session_generation', 'session_btw', 'session_btw_stream', 'session_shell_command',
 'standalone_sessions_v1', 'standalone_session_options_v1',
 'mcp_workspace_pool', 'mcp_pool_restart',
 'require_auth', 'allow_origin', 'auth_device_flow',
 'permission_mediation', 'prompt_absolute_deadline', 'writer_idle_timeout',
 'non_blocking_prompt', 'session_language', 'user_language_sync', 'session_message_deletion', 'session_rewind',
 'workspace_hooks', 'session_hooks', 'workspace_extensions',
 'session_branch', 'rate_limit', 'workspace_reload', 'workspace_model_reload', 'channel_delivery',
 'multi_workspace_sessions', 'multi_workspace_session_rewind',
 'multi_workspace_session_shell', 'persistent_workspace_registration',
 'workspace_display_name', 'workspace_runtime_removal', 'workspace_runtime',
 'workspace_qualified_rest_core', 'workspace_qualified_voice',
 'workspace_qualified_memory', 'extension_management_v2', 'extension_git_credentials',
 'extension_local_path_install',
 'workspace_persisted_transcript',
 'workspace_session_export', 'workspace_archived_session_export',
 'workspace_session_live_state', 'workspace_session_live_state_batch',
 'client_mcp_over_ws', 'cdp_tunnel_over_ws', 'browser_automation_mcp']
```

> Bedingte Tags erscheinen nur, wenn ihre Deployment- oder Laufzeitverfügbarkeitsbedingung erfüllt ist (siehe Tabelle unten). Der `permission_mediation`-Tag von F3 ist immer aktiv und trägt `modes: ['first-responder', 'designated', 'consensus', 'local-only']`, damit SDK-Clients den vom Build unterstützten Satz introspektieren können; die zur Laufzeit aktive Strategie befindet sich unter `body.policy.permission`.

`session_startup_config` bewirbt optionale `startupConfig: { modelServiceId, reasoningEffort? }` bei gewöhnlicher und eigenständiger Erstellung. Prüfen Sie dieses Tag stets vorab: Ältere Routen für die gewöhnliche Erstellung ignorieren das Objekt möglicherweise stillschweigend. `modelServiceId` ist erforderlich (1–256 Zeichen); `reasoningEffort` akzeptiert `none`, `default`, `low`, `medium`, `high`, `xhigh` oder `max`, sofern vom ausgewählten Modell unterstützt. Das Weglassen wendet nur das Modell an, ohne Reasoning-Setter oder implizites `default`. Das Objekt kann nicht mit dem Legacy-top-level-`modelServiceId` oder explizitem einzelnen Scope kombiniert werden und impliziert einen neuen Thread. Beim Start werden keine gemeinsamen Standardwerte gespeichert; das spätere Session-Verhalten bleibt unverändert.

Erfolg umfasst `modelApplied: true` und `startupConfigApplied: { modelServiceId, reasoningEffort?, effectiveReasoning? }`. Der Modellauswahlmechanismus ist kanonisch. Nur explizite Reasoning-Anforderungen enthalten die beiden Reasoning-Felder; der effektive Zustand ist `{ state: 'disabled' }`, `{ state: 'provider-default' }` oder `{ state: 'enabled', effort? }` (Reasoning per Toggle allein hat keinen Aufwand). Ungültige Struktur führt zu `400 invalid_startup_config`; eine abgelehnte oder unbestätigte Auswahl führt zu `422 startup_config_rejected`. Eine definitive Ablehnung im eigenständigen Modus rollt ihre eigene Aufzeichnung zurück und versucht, das leere Ausgabeverzeichnis zu verwerfen, bevor sie zurückgibt; ein Aufzeichnungs-Rollback, dessen Entfernung nicht bestätigt werden kann, und transiente Startfehler behalten `standalone_creation_outcome_unknown` bei, während ein fehlgeschlagenes Verzeichnis-Verwerfen nur protokolliert wird und die definitive Ablehnung dennoch zurückgegeben wird. Ein Bestätigungsfehler im Erfolgsbody im SDK ist ein Protokollfehler, keine Anweisung, eine wiederhergestellte Session zu übernehmen.

`session_scope_override` ist der Verhandlungsgriff für das feldbezogene `sessionScope`-Feld bei `POST /session` (siehe unten). Ältere Daemons ignorieren das Feld stillschweigend, daher sollten SDK-Clients `caps.features` für dieses Tag vorab prüfen, bevor sie es senden.

`session_id_override` ist der Verhandlungsgriff für das optionale caller-supplied `sessionId` bei `POST /session` und ACP `session/new`-Metadaten. Clients müssen bestätigen, dass `caps.features` dieses Tag enthält, bevor sie das Feld senden, da ältere Daemons es möglicherweise stillschweigend ignorieren.

`persistent_workspace_registration` bewirbt dauerhafte Registrierung für Workspaces, die zur Laufzeit hinzugefügt wurden. `POST /workspaces` akzeptiert `{ "cwd": "/absolute/path", "persist": true }`; Erfolg umfasst `persisted: true`. Registrierungen sind auf den kanonischen primären Workspace des Daemons unter dem Qwen-Home-Verzeichnis des Benutzers beschränkt und werden beim nächsten Daemon-Start wiederhergestellt. Das Weglassen von `persist` behält die prozesslokale Registrierung bei. `GET /workspace-registrations` listet den gespeicherten gewünschten Satz auf, und `DELETE /workspace-registrations/:id` vergisst einen Eintrag für den nächsten Neustart, ohne eine aktive Runtime hot zu entfernen.

`workspace_display_name` bewirbt optionale `displayName`-Eingaben bei `POST /workspaces`, Workspace-Metadaten-Aktualisierungen über `PATCH /workspaces/:workspace` und optionale Anzeigename-Felder in Workspace-Projektionen. Namen nehmen nicht an Suche oder Routing teil: `id` und kanonisches `cwd` bleiben die einzigen Selektoren, und doppelte Namen sind erlaubt.

`workspace_runtime_removal` bewirbt die synchrone Hot-Entfernung über `DELETE /workspaces/:workspace`. Capability-Workspace-Einträge fügen optionale `removable` hinzu; nur Zeilen mit `removable: true` können entfernt werden. Die Entfernung vergisst auch jeden persistenten Registrierungsalias für die Laufzeitumgebung, löscht aber niemals Dateien, Einstellungen, Transkripte oder Archive.

`workspace_runtime` bewirbt `GET /workspace/runtime/status`, `POST /workspace/runtime/ensure` und deren `/workspaces/:workspace/runtime/...`-Äquivalente. `ensure` akzeptiert keine Capability-Auswahl: Es startet oder wiederverwendet die ACP-Laufzeitumgebung des ausgewählten vertrauenswürdigen Workspaces und gibt deren Lebenszyklusstatus und monotone Laufzeit-Epoche zurück. Die primären Routen gehören nur der primären Laufzeitumgebung; qualifizierte Routen lösen nur die ausgewählte registrierte Laufzeitumgebung auf und fallen niemals zurück. Ein erfolgreiches Ensure erneuert das zehnminütige Keepalive-Fenster der Laufzeitumgebung. Status ist schreibgeschützt und startet das Kind niemals. Gleichzeitige Ensures teilen sich einen physischen Start. Ein laufender Start oder ein Fehler gibt wiederholbare `503 runtime_still_starting` oder `503 runtime_initialization_failed` zurück. Die Vorbereitung der Capability kann fortgesetzt werden, nachdem das Beobachtungsbudget für Ensure abgelaufen ist; in diesem Fall gibt Ensure weiterhin die aktive Laufzeitumgebung mit einem Nicht-Bereit-Capability-Zustand für die Statusabfrage zurück. Die Capability wird nur beworben, wenn alle aktiven Laufzeitbrücken den maßgeblichen Lebenszyklus-Snapshot bereitstellen; eine ausgewählte Legacy-Injektionsbrücke gibt `501 workspace_runtime_not_supported` anstelle eines geschätzten Zustands oder einer Epoche zurück.

`workspace_runtime_stop` bewirbt unabhängig davon das benutzergestützte Stoppen der Laufzeitumgebung. `GET /workspaces/runtime-stop-options` ist eine schreibgeschützte, prozessglobale Vorschau: Sie umfasst die Anzahl der committeten Kinder, die modellierten Kinder-Obergrenzen sowie Sitzungen, blockierte Gründe, Kanal-ID, Epoche, aktuelles Stop-Token und letzte Quittung jedes sichtbaren Workspaces. Gewöhnliche geladene Sitzungen können explizit gestoppt werden; unabhängige ACP-Clients, aktivierte Zeitpläne, ausstehende Scheduler-/Management-/Start-Arbeit, Speicheraufgaben, Worker, Voice- und Spezial-Laufzeitumgebungen sind blockiert. `POST /workspaces/:workspace/runtime/stop` verwendet das strenge Mutations-Gate und nur die ausgewählte vertrauenswürdige Laufzeitumgebung. Senden Sie `confirmInterruptions: true`, `expectedChannelId`, `expectedRuntimeEpoch`, `expectedStopToken` und das exakte `expectedSessionIds` aus der Vorschau. Fallen Sie niemals auf die primäre Laufzeitumgebung zurück. Die Vorschau und jede Quittung listen die aktiven ACP-Kanäle der Laufzeitumgebung als `channels` (`channelId`, `runtimeEpoch`, optional `executionEngine`) auf; eine Laufzeitumgebung kann einen Kanal pro Ausführungs-Engine haben, und ein Stopp deckt alle ab. `channelId` benennt den ersten aufgelisteten Kanal und `runtimeEpoch` ist die neueste aufgelistete Epoche, sodass ein nach der Vorschau gestarteter Kanal die Bestätigung veraltet macht.

Eine erfolgreiche Antwort hat `state: "stopped"`, `stopped: true` und `released: true`, nach bestätigtem Schließen von Sitzungen und Freigabe des Prozess-Registrierungseintrags für jedes aufgelistete Kind. Registrierung, Dateien und gespeicherter Verlauf bleiben erhalten. Antworten enthalten betroffene, unterbrochene, geschlossene und verbleibende Sitzungs-IDs. Veraltete oder blockierte Bestätigungen sind HTTP 409 (`workspace_runtime_stop_stale` / `workspace_runtime_stop_blocked`); teilweises Schließen ist 409 `workspace_runtime_stop_incomplete`; laufender oder fehlgeschlagener Teardown ohne nachgewiesene Freigabe ist 503 `workspace_runtime_stop_in_progress` / `workspace_runtime_stop_failed`; nicht unterstütztes Management ist 501 `workspace_runtime_stop_not_supported`. Ein unsauberer Teardown, der später die Registrierungsfreigabe nachweist, kann 200 mit einer Fehlerwarnung zurückgeben; unbestätigtes Session-Flush gibt weiterhin ein Teilfehler-/Fehlerergebnis zurück. Das gesamte Beobachtungs-/Schließbudget beträgt 60 Sekunden. Wenn es abläuft, während das Schließen einer Sitzung noch läuft, wird die Antwort mit `state: "failed"` und `503 workspace_runtime_stop_failed` abgeschlossen; die Bereinigung wird separat fortgesetzt. Der ausgewählte Workspace bleibt isoliert und sein Kind wird bis zum tatsächlichen Abschluss der Bereinigung weitergezählt, obwohl der Aufrufer einen Fehler empfangen hat. Schreibgeschützte Optionen können später `stopped` nach bestätigten Schließungen und nachgewiesener Freigabe oder `incomplete` melden, wenn die Persistenz nicht bestätigt wurde; das bereits zurückgegebene Fehler-Snapshot ändert sich nicht. Wenn das Budget stattdessen zwischen Sitzungs-Schließungen erschöpft ist, wird die Antwort mit `state: "incomplete"` und `409 workspace_runtime_stop_incomplete` abgeschlossen: Es wird kein weiteres Schließen oder erzwungenes Beenden gestartet, die Zulassungssperre des Stopps wird freigegeben (das überlebende Kind wird wie üblich weitergezählt), und das Stoppen der verbleibenden Sitzungen erfordert eine neue Vorschau und Bestätigung. Eine Ablehnung des Flushes wird nicht durch erzwungenes Beenden der verbleibenden Sitzungen umgangen. Der Exit des Root-Prozesses oder ein Rückgang der globalen Prozessanzahl allein begründet keine Freigabe des ausgewählten Kindes. Unter Windows, wo die Registrierung keine Nachkommen-Prozessgruppen verfolgt, ist der abgeschlossene Exit des Roots der Freigabenachweis, daher beweist `released: true` dort nicht, dass der Prozessbaum verschwunden ist.

Wiederholte Bestätigung des zuletzt konsumierten Tokens beobachtet denselben Vorgang. Eine neue Bestätigung kann einen unvollständigen Stopp erneut versuchen, wobei das Token rotiert; ältere konsumierte Tokens werden dann veraltet. Wenn eine Antwort verloren geht, lesen Sie Optionen und stimmen Sie die neueste Quittung anhand von Workspace und Stop-Token ab, anstatt ein anderes Ziel zu stoppen. Quittungen können nach Entfernung, Vertrauensänderungen oder Neugestaltung des Daemons/der Brücke nicht verfügbar sein; Abwesenheit lässt das Ergebnis unbekannt und autorisiert niemals die Fortsetzung. SDK `runtimeStopOptions()` und `workspaceById(id).stopRuntime(confirmation)` verwenden REST auch bei einem ACP-Transport und wiederholen POST niemals automatisch. Sitzungsteilnehmer erhalten `session_closed` mit `reason: "client_close"` und `cause: "workspace_runtime_stop"`; fatale stoppbezogene Exits markieren zusätzlich `persistenceUnconfirmed: true`. Aktualisierte Web Shell-Clients behalten die gespeicherte Auswahl/das Transkript und warten auf ein explizites Fortsetzen. Dies ist ein einmaliger Stopp, keine persistente Aussetzung; ein Client, der das Ereignis verpasst hat, kann erneut um Kapazität konkurrieren.

Status- und Ensure-Antworten der Laufzeitumgebung verwenden dieses Format:

```json
{
  "v": 1,
  "workspaceCwd": "/work/project",
  "state": "active",
  "runtimeLive": true,
  "runtimeEpoch": 4,
  "capabilities": {
    "skills": {
      "state": "ready",
      "revision": 2,
      "runtimeEpoch": 4
    }
  }
}
```

Wenn eine Workspace-Laufzeitumgebung mehr als eine Ausführungs-Engine hat, beschreiben `runtimeLive` und `runtimeEpoch` den Kanal, der die Workspace-Steuerung bedient (MCP und Skills): Solange dieser Kanal aktiv ist, ändern sie sich nicht, wenn eine andere Engine startet oder beendet wird. `state` meldet diesen Kanal als `cold`, `starting` oder `stopping`, solange er nicht aktiv ist; `active` und `idle` zählen Arbeit auf jeder Engine.

`capabilities.skills.state` ist `not_started`, `starting`, `ready`, `stale` oder `error`; Fehler enthalten `{code, message}` in `capabilities.skills.error`. Ein Skills-Katalog ist nur dann aktuell, wenn die Top-Level- und Capability-`runtimeEpoch`-Werte übereinstimmen. `revision` ordnet die Skills-Vorbereitung innerhalb einer Laufzeit-Epoche und darf nicht über Epochen hinweg verglichen werden.

`workspace_skills_config_runtime` bewirbt die geteilten Skills-Lesevorgänge und Konfigurationsmutationen unter `/workspace/{config,runtime}/skills` und `/workspaces/:workspace/{config,runtime}/skills`. Die Web Shell verwendet diese Routen für das Skills-Management und beim Komponieren einer neuen Sitzung, um Slash-Befehle aus der Konfiguration unmittelbar vor dem Ersetzen durch einen Laufzeitkatalog mit passender Epoche zu füllen. Wenn die Funktion fehlt, müssen Clients weiterhin die Legacy-Skills-Routen verwenden und dürfen Ensure der Laufzeitumgebung nicht ausschließlich für Skills aufrufen.

`session_load` und `session_resume` bewerben die expliziten Wiederherstellungsrouten (`POST /session/:id/load` und `POST /session/:id/resume`). Ältere Daemons geben für diese Pfade `404` zurück, daher sollten SDK-Clients `caps.features` vor dem Aufruf prüfen. `unstable_session_resume` wird weiterhin als veralteter Alias beworben, um Kompatibilität mit SDKs zu gewährleisten, die ausgeliefert wurden, während die zugrunde liegende ACP-Methode `connection.unstable_resumeSession` hieß; neue Clients sollten auf `session_resume` prüfen.

`limits.sessionRestoreTimeoutMs` ist, wenn vorhanden, das Wanduhr-Budget des Daemons für die zugrunde liegende ACP `loadSession` / `unstable_resumeSession`-Anfrage. Es ist ein additives v1-Feld. Das TypeScript SDK gibt dem Daemon 10 Sekunden Client-Spielraum, und der Web Shell Watchdog gibt ihm 15 Sekunden; Clients, die mit einem älteren Daemon kommunizieren, sollten jeweils 70 Sekunden und 75 Sekunden verwenden.

`session_transcript` bewirbt `GET /session/:id/transcript`, eine schreibgeschützte, seitenweise Replay-Ansicht über die persistierte JSONL der aktiven Sitzung. Sie ist getrennt von `/load`: Sie hängt keinen Client an, speist den Live EventBus nicht, erstellt keine Live-Sitzung und ändert nicht das Live-Replay-Fenster. Clients sollten sie verwenden, wenn sie das vollständige On-Disk-Transkript einer langen Sitzung benötigen, und `/load` nur für begrenztes Live-Replay während der kalten UI-Wiederherstellung verwenden.

`workspace_persisted_transcript` bewirbt `GET /workspaces/:workspace/session/:id/transcript`, einen daemon-lokalen, nur-persistierten Pager, der ACP nicht startet, keinen Live-Bridge-Zustand abfragt, keine Einstellungen lädt, keine Projektfähigkeiten entdeckt und nicht den Legacy-Persistenz-Cursor-Schlüssel erstellt. Das Tag ist bedingungslos, da vertrauenswürdige Einzel-Workspace-Primaries die Plural-Route nutzen können; die Workspace-spezifische Vertrauensautorisierung wird weiterhin bei jeder Anfrage geprüft. Registrierte nicht vertrauenswürdige sekundäre Workspaces dürfen lesen, während ein nicht vertrauenswürdiger Primär-Workspace weiterhin abgelehnt wird.

`workspace_session_export` bewirbt `GET /workspaces/:workspace/session/:id/export`, einen nur-vertrauenswürdigen Vollexport der aktiven persistierten Sitzung des ausgewählten Workspaces. Er ist unabhängig von `session_export` und `workspace_qualified_rest_core`: Veröffentlichte Daemons können beide älteren Tags bewerben, ohne die Plural-Route zu implementieren, daher müssen Clients dieses Tag direkt vorab prüfen (Pre-flight). Das Tag ist bedingungslos, da ein vertrauenswürdiger Einzel-Workspace-Primär-Client die Route nach ID oder CWD nutzen kann. Der Export löst keinen Live-Eigentümer auf, startet kein ACP, hängt keinen Client an und fällt nicht auf einen anderen Workspace zurück.

`workspace_archived_session_export` bewirbt `GET /workspaces/:workspace/session/:id/archive/export`, einen nur-vertrauenswürdigen Vollexport aus dem archivierten persistierten Speicher des ausgewählten Workspaces. Er ist unabhängig von `workspace_session_export` und `workspace_qualified_rest_core`; Clients müssen dieses Tag direkt vorab prüfen. Eine separate Route verhindert, dass ein älterer Daemon die Archivierungsabsicht ignoriert und ein aktives Transkript mit derselben ID zurückgibt.

`workspace_session_live_state` bewirbt `GET /workspaces/:workspace/sessions/live-state`, einen nur-vertrauenswürdigen, speicherbasierten Snapshot der Live-Sitzungen der Laufzeitumgebung des ausgewählten Workspaces sowie eine In-Memory-Katalogversion, die Clients signalisiert, wann ein vollständiger Neuladen des persistierten Katalogs gerechtfertigt ist. Er ist unabhängig von `workspace_qualified_rest_core`: Veröffentlichte Daemons können die breitere Workspace-REST-Fähigkeit bewerben, ohne diese Route zu implementieren, daher müssen Clients dieses Tag direkt vorab prüfen. Das Tag ist bedingungslos, da ein vertrauenswürdiger Einzel-Workspace-Primär-Client die Route nach ID oder CWD nutzen kann; die Workspace-spezifischen Vertrauensprüfungen gelten weiterhin bei jeder Anfrage, und die Route erweitert die permissive Lese-Richtlinie für den persistierten Katalog nicht-vertrauenswürdiger Sekundär-Workspaces nicht auf den Live-Bridge-Zustand. Das Tag bedeutet, dass der Endpunkt existiert; es verspricht nicht, dass jedes Live-Element den optionalen `updatedAt` Aktivitäts-Wasserzeichen trägt, welches lebenszyklusabhängig ist.

`workspace_session_live_state_batch` bewirbt `POST /sessions/live-state`. Clients prüfen dies einmal vorab vor dem Batching von Abfragen und behalten die Einzel-Workspace-Route für ältere Daemons bei. Der Batch verwendet dieselben nur-vertrauenswürdigen, speicherbasierten Snapshot- und Katalogversions-Semantiken wie die Einzel-Workspace-Route.

Das optionale Top-Level-Feld `/capabilities` `sessionLiveStatePollIntervalMs` bewirbt das Daemon-weite Polling-Intervall für den Live-Zustand in Millisekunden. Es wird einmal aus der Start-Umgebungsvariable `QWEN_SESSION_LIVE_STATE_POLL_INTERVAL_MS` aufgelöst, unabhängig von Workspace-Umgebungs-Overlays. Ganzzahlwerte von `1000` bis `2147483647` werden akzeptiert; fehlende oder ungültige Werte verwenden `5000`. Die Web Shell nutzt diesen Hinweis für alle Workspace-Live-Zustands-Abfragen und greift auch auf `5000` zurück, wenn das Feld bei einem älteren oder inkompatiblen Daemon fehlt oder ungültig ist. Dieses Feld ändert nicht die Snapshot-Semantik der Route, sofortige lokale/Sichtbarkeits-Aktualisierungen oder das vollständige Katalog-Polling. SDK-Clients sind weiterhin für ihre eigenen Timer verantwortlich.

`slow_client_warning` deckt das SSE-Backpressure-Verhalten ab: (a) Der Daemon sendet ein `slow_client_warning` synthetisches Event-Stream-Frame, wenn der Live-Frame-Rückstand eines Abonnenten oder der live serialisierte Byte-Rückstand 75 % voll überschreitet, einmal pro Überlauf-Episode (nach dem Abfließen beider Messungen unter 37,5 % wieder scharf geschaltet); (b) `GET /session/:id/events` akzeptiert einen `?maxQueued=N` Query-Parameter (Bereich `[16, 2048]`), um den Frame-Rückstand pro Abonnent für kalte Reconnects gegen einen großen Replay-Ring vorzubelegen. Die Obergrenze für serialisierte Bytes wird vom Daemon verwaltet (Standard **2 MiB** pro Abonnent), ist nur live relevant und hat absichtlich keinen Query-Parameter. Die Daemon-weite Ringgröße wird durch `--event-ring-size` gesteuert (Standard **8000**, gemäß #3803 §02). Ältere Daemons fehlen stillschweigend die Warn-/Query-Funktionen — prüfen Sie dieses Tag vorab, bevor Sie sich dafür entscheiden.

`typed_event_schema` bewirbt Daemon-Ereignis-Nutzlasten, die dem `KnownDaemonEvent` Schema des SDK entsprechen. Ältere Daemons streamen möglicherweise weiterhin kompatible Frames, aber SDK-Clients sollten dieses Tag vorab prüfen, bevor sie typisierte Ereignisabdeckung voraussetzen.

`client_heartbeat` bewirbt `POST /session/:id/heartbeat`. Ältere Daemons geben `404` zurück; prüfen Sie dieses Tag vorab, bevor Sie periodische Heartbeats senden.

`session_close` und `session_metadata` bewerben `DELETE /session/:id` und `PATCH /session/:id/metadata`. Ältere Daemons geben `404` zurück; prüfen Sie diese Tags vorab, bevor Sie Schließen- oder Umbenennen-Funktionen bereitstellen.

`session_organization` bewirbt benutzerdefinierte Sitzungsgruppen und Pinnen. Es fügt `GET/POST/PATCH/DELETE /workspace/:id/session-groups`, `PATCH /session/:id/organization` und die opt-in organisierte Listenansicht `GET /workspace/:id/sessions?view=organized` hinzu. Wenn sowohl `session_organization` als auch `workspace_qualified_rest_core` beworben werden, ist auch die workspace-qualifizierte Organisations-Mutation `PATCH /workspaces/:workspace/session/:id/organization` verfügbar. Die Legacy-Mutation bleibt primär-workspace-spezifisch. Ältere Daemons geben `404` für die Mutations-/Gruppen-Routen zurück und ignorieren den Vertrag für die organisierte Ansicht, daher müssen WebShell/SDK-Clients diese Tags vorab prüfen, bevor sie die entsprechende Gruppierungs- oder Pinning-UI anzeigen.

`session_archive` bewirbt die v1 Directory-State-Archiv-API: `POST /sessions/archive`, `POST /sessions/unarchive` und `GET /workspace/:id/sessions?archiveState=active|archived`. Archivierte Sitzungen können nicht geladen oder fortgesetzt werden, bis sie dearchiviert sind. `session_archive_idle_guard` bewirbt die additive `requireIdle` Archiv-Option: Die besitzende Laufzeit prüft, ob aktive Arbeit unmittelbar vor Beginn des Schließens als idle bestätigt ist, und belässt andernfalls das aktive Transkript an Ort und Stelle. `session_storage_conflict_repair` bewirbt die additive `resolveConflicts` Anfrage-Option und den unten beschriebenen `resolvedConflicts` Antwort-Bucket.

`workspace_qualified_rest_core` bewirbt mehrere Kern-REST-Routen unter `/workspaces/:workspace/...`. Der Selektor wird zuerst als exakte Workspace-ID aufgelöst, dann als URL-kodierter absoluter Pfad (cwd) nach der Kanonisierung. Neuere Single-Workspace-Daemons beinhalten die primäre Laufzeitumgebung in `workspaces[]`, auch wenn `multi_workspace_sessions` fehlt, sodass Clients die für workspace-qualifizierte Routen erforderliche ID ermitteln können; Clients sollten auf ältere Daemons, die das Array weglassen, zu `capabilities.workspaceCwd` zurückfallen. Vertrauensstatus- und Vertrauensanforderungs-Routen sind für registrierte nicht vertrauenswürdige Workspaces verfügbar; der qualifizierte Hooks-Status-Lesevorgang (`GET /workspaces/:workspace/hooks`) wird ebenfalls für registrierte nicht vertrauenswürdige Workspaces bereitgestellt, da er die ausstehende Projekt-Hooks-Vertrauensentscheidung meldet, was zur qualifizierten Genehmigungs-Mutation passt; Datei-Lese-Routen folgen der bestehenden Dateisystem-Lese-Richtlinie. Registrierte nicht vertrauenswürdige sekundäre Workspaces bieten zudem nur persistierte Session- und Session-Group-Kataloge an: Diese Lesevorgänge binden keine Session an, starten kein ACP und führen keinen Live-Bridge-Status zusammen. Dateischreibvorgänge, Katalog-Mutationen und andere mehrere Kern-Routen erfordern einen vertrauenswürdigen Workspace, es sei denn, eine separate Fähigkeit dokumentiert eine engere Richtlinie: `workspace_persisted_transcript` (nur lesend) oder die Vertrauensgewährungs-Mutation, die für einen registrierten nicht vertrauenswürdigen Workspace akzeptiert wird, unabhängig davon, ob `workspace_trust_grant` beworben wird — dieses Tag meldet nur, ob der Hot-Reload des Vertrauens verdrahtet ist, sodass eine aufgezeichnete Entscheidung die laufende Laufzeitumgebung ohne Daemon-Neustart erreichen kann; es meldet nie, ob die Route bedient wird. Ein nicht vertrauenswürdiger Primär-Workspace erhält weiterhin `403 { code: "untrusted_workspace" }` von den mehreren Katalog- und Transkript-Routen; Legacy-Single-Primär-Routen behalten ihr bestehendes Kompatibilitätsverhalten bei. Dieses Tag deckt die Kernflächen für Dateien, Status, Einstellungen, Berechtigungen, Vertrauen, Lebenszyklus, MCP-Steuerung, Tool- und Skill-Toggles, Speicher, Workspace-Agent-CRUD und Session-Speicherung ab. Es deckt nicht Authentifizierung, Sprache, Erweiterungen, ACP/WebSocket-Transport, Kanal-Worker-Routing oder workspace-qualifizierte Session-Exporte ab; prüfen Sie vorab `workspace_session_export` oder `workspace_archived_session_export` separat. Workspace-Vertrauen ist keine ACL: Ein Client mit dem Daemon-Token kann jede registrierte Workspace-Fläche lesen, die durch diese Richtlinie erlaubt ist.

`workspace_qualified_voice` bewirbt Voice-Routen, die von einer vertrauenswürdigen Workspace-Laufzeitumgebung ausgewählt werden: `GET` und `POST /workspaces/:workspace/voice`, `POST /workspaces/:workspace/voice/transcribe` und `WS /workspaces/:workspace/voice/stream`. Es wird nur beworben, wenn sowohl Multi-Workspace-Laufzeitumgebungen als auch der gemeinsame ACP/Voice-WebSocket-Listener aktiviert sind. Der Selektor folgt denselben Regeln für ID oder kodierten absoluten Pfad wie andere mehrere Routen. Bei REST gibt ein unbekannter Selektor `400 { code: "workspace_mismatch" }` zurück und ein nicht vertrauenswürdiger Selektor gibt `403 { code: "untrusted_workspace" }` zurück; die WebSocket-Upgrade-Ablehnung legt den entsprechenden HTTP-400/403-Status ohne strukturiertes JSON-Envelope offen. Keiner der Transports fällt auf primär zurück. Legacy `/workspace/voice`, `/workspace/voice/transcribe` und `/voice/stream` bleiben primär-only. Clients verwenden `workspace_qualified_voice` für alle qualifizierten Voice-Modalitäten und lassen die ausgewählte Laufzeitumgebung konfigurationsspezifische Fehler melden. Die Legacy-Tags `workspace_voice`, `workspace_voice_transcription` und `voice_transcribe` beschreiben nur die primärgebundenen Routen und dürfen eine qualifizierte sekundäre Konfiguration nicht verbergen.

`workspace_qualified_memory` bewirbt die workspace-qualifizierten Managed-Memory-Routen: `POST /workspaces/:workspace/memory/{remember,forget,dream}` stellt Aufgaben in die Warteschlange und `GET /workspaces/:workspace/memory/{remember,forget,dream}/:taskId` liest sie zurück. Es wird nur beworben, wenn sowohl ACP HTTP als auch Multi-Workspace-Laufzeitumgebungen aktiviert sind. Der Selektor folgt denselben Regeln für ID oder kodierten absoluten Pfad wie andere mehrere Routen. Jeder registrierte Workspace erhält seine eigene Aufgabenspur; die qualifizierte Spur des Primären ist dieselbe Instanz wie die Single-Fläche `/workspace/memory`, sodass eine Aufgabe, die in eine eingestellt wurde, in der anderen lesbar ist. Die Auflösung erfolgt streng pro ausgewählter Laufzeitumgebung ohne Primär-Fallback: Ein unbekannter Selektor gibt `400 { code: "workspace_mismatch" }` zurück, ein nicht vertrauenswürdiger Selektor gibt `403 { code: "untrusted_workspace" }` zurück und eine inaktive oder drainende Laufzeitumgebung gibt `503 { code: "workspace_runtime_unavailable" }` zurück. Lesevorgänge weisen niemals eine Spur zu, daher gibt das Abfragen eines Workspaces ohne Aufgaben `404 { code: "<kind>_task_not_found" }` zurück. Task-IDs sind auf ihre Spur beschränkt und überleben weder eine Workspace-Rekonfiguration noch einen Laufzeitumgebungs-Ersatz; eine veraltete ID gibt `404` zurück, keinen Datenverlust-Zustand. Wenn ACP HTTP deaktiviert ist, wird das Tag nicht beworben und eine nicht-primäre qualifizierte Anfrage gibt einen nicht wiederholbaren `501 { code: "workspace_memory_unavailable" }` zurück, während die qualifizierte Primär-Route über die lokal verwaltete Spur weiter funktioniert.

`session_lsp` bewirbt `GET /session/:id/lsp`, den nur lesenden strukturierten LSP-Status-Snapshot für Daemon-Clients. Ältere Daemons geben `404` zurück; prüfen Sie dieses Tag vorab, bevor Sie den Remote-LSP-Status anzeigen.

`session_resources` bewirbt `GET /session/:id/resources`, ein nur lesendes Paar bereinigter Skill- und MCP-Snapshots, erstellt aus der Config der ausgewählten Live-Session. Die Route ist auf den Besitzer der Live-Session beschränkt: Sie fällt niemals auf die primäre Laufzeitumgebung zurück und leitet die Ressourcen der Session nicht aus dem Workspace-Status ab. Die verschachtelten Objekte `skills` und `mcp` wiederverwenden die entsprechenden Workspace-Status-Payloads, lassen jedoch MCP-Authentifizierung, Pool-, Workspace-Budget- und Workspace-Discovery-Fehler-Anreicherungen weg. Status, Discovery und Buchhaltung, die vom MCP-Manager der ausgewählten Session gemeldet werden, bleiben vorhanden. Ältere Daemons geben `404` zurück; prüfen Sie dieses Tag vorab, bevor Sie einen Session-Ressourcen-Katalog anzeigen.

`session_status` bewirbt `GET /session/:id/status`, die Live-Bridge-Zusammenfassung für eine einzelne Session per ID. Zusätzlich zu `clientCount` und `hasActivePrompt` bieten Live-Sessions `isWaitingForPermission`, `isWaitingForUserQuestion`, `pendingInteractionCount` und ein beibehaltenes `turnError` nach einem fehlgeschlagenen Turn an. Der Fehler wird gelöscht, wenn der nächste Prompt tatsächlich startet. Eine Live-Session, die einen laufenden Turn in der aktuellen Bridge abgeschlossen hat, trägt auch `updatedAt`, denselben Aktivitäts-Wasserzeichen, der unter der Live-State-Route dokumentiert ist; da diese Route die Bridge-Zusammenfassung direkt zurückgibt, wird der Wert nicht mit der mtime des persistierten Transkripts zusammengeführt und kann früher sein als derjenige, den eine Session-Liste meldet. Sowohl die Einzel-Session-Statusantwort als auch die Workspace-Session-Listen enthalten `turnError` und `pendingInteractions`: renderbereite Berechtigungsaktionen oder `ask_user_question` Fragen plus die `requestId` und auswählbaren Optionen, die von den bestehenden Berechtigungs-Voting-Routen benötigt werden. Jede Benutzerfrage hat ein `answerKey`; stimmen Sie mit `answers` ab, zum Beispiel `{ "0": "Polling" }`, indiziert nach diesem Wert. Nur-persistierte Sessions lassen den Runtime-Status weg, weil keine Laufzeitumgebung existiert. Ältere Daemons geben `404` zurück; prüfen Sie dieses Tag vorab, bevor Sie den Status einer einzelnen Session abfragen, anstatt die gesamte Session-Liste zu scannen.

`session_info` bewirbt `GET /workspace/:id/session-info` und seinen Zwilling `/workspaces/:workspace/session-info`. Die Antwort aggregiert persistierte aktive und archivierte Session-Anzahlen, ohne Listen-Metadaten zu hydratisieren. Es handelt sich um einen expliziten O(n)-Disk-Scan, der nicht abgefragt werden darf; Clients sollten `truncated: true` als Untergrenzen-Ergebnis behandeln.

`session_approval_mode_control`, `workspace_tool_toggle`, `workspace_skill_settings_toggle`, `workspace_skill_settings_batch_toggle`, `extension_batch_activation_v2`, `workspace_init` und `workspace_mcp_restart` geben die unten dokumentierten Mutationssteuerungsrouten an. Die Steuerung des Genehmigungsmodus behält ihr Nicht-Strict-Kompatibilitätsgate bei. Die anderen Steuerungen sind durch Operator-Autorität streng geregelt: Vertrauenswürdige Loopback-Primär-, Bearer-authentifizierte oder gepaarte Local-Control-Anfragen bestehen. Eine tokenlose Primäranfrage, die das strenge Gate ohne vertrauenswürdige Loopback-Autorität erreicht, gibt 401 `token_required` zurück; fehlende oder ungültige konfigurierte Anmeldeinformationen und ungepaarte Local-Control-Anmeldeinformationen werden früher von der Bearer-Middleware mit einfachem `401 Unauthorized` abgelehnt. Daemons, denen eine dieser Routen fehlt, geben `404` zurück. Die einstellungsspezifischen Skill-Tags unterscheiden sich: Daemons aus der Generation der eingestellten Tags werben `workspace_skill_toggle` und `workspace_skill_batch_toggle` an und bedienen ihren katalogvalidierten Vertrag unter denselben Pfaden. Die eingestellte Einzelspezifikationsroute kann HTTP `404 skill_not_found` oder `409 skill_not_toggleable` zurückgeben; die eingestellte Batch-Route gibt HTTP 200 zurück und platziert katalogabgeleitete Fehler in `errors[]`. Führen Sie vor dem Exponieren einer affordance einen Pre-Flight für jedes Tag durch und leiten Sie den einstellungsspezifischen Skill-Vertrag nicht durch das Testen der Routenerreichbarkeit ab. Die Routenpfade und Anfragebodies haben sich nicht geändert.

`mcp_guardrails` (Issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14) deckt die MCP-Budget-Oberfläche ab: die Felder `clientCount` / `clientBudget` / `budgetMode` / `budgets[]` auf `GET /workspace/mcp`, das Feld `disabledReason` auf Serverzellen sowie die CLI-Flags `--mcp-client-budget` / `--mcp-budget-mode`. Ältere Daemons lassen die neuen Felder vollständig weg; SDK-Clients führen einen Pre-Flight dieses Tags durch, bevor sie sich auf `budgets[]`-Semantik verlassen. Der Registry-Deskriptor enthält auch `modes: ['warn', 'enforce']` für zukünftige Feature-Mode-Exposure – derzeit leiten Clients den Modus aus dem Feld `budgetMode` des Snapshots ab. Die Serververweigerung im `enforce`-Modus ist deterministisch nach der Deklarationsreihenfolge von `Object.entries(mcpServers)`; eine zukünftige Scope-Präzedenzschicht (falls qwen-code eine übernimmt) würde dies zu "niedrigste Präzedenz zuerst" verschieben, um die Konvention `plugin < user < project < local` von claude-code widerzuspiegeln.

> **Der Umfang ist fähigkeitsgesteuert.** Mit `mcp_workspace_pool` teilen sich Sitzungen innerhalb einer Workspace-Runtime einen Transportpool und `WorkspaceMcpBudget`, und der Snapshot emittiert `budgets[0].scope: 'workspace'`. Unterschiedliche Workspace-Runtimes besitzen unabhängige Pools. Ohne das Tag verwendet jede ACP-Sitzung ihre Legacy-`McpClientManager`, der Snapshot emittiert `scope: 'session'`, und N Sitzungen können jeweils die konfigurierte Obergrenze verbrauchen.

`workspace_file_read` deckt die Workspace-Datei-Routen für Text/Liste/Stat/Glob ab (`GET /file`, `GET /list`, `GET /glob`, `GET /stat`). `workspace_file_bytes` deckt `GET /file/bytes` ab, das später hinzugefügt wurde, damit Clients die Unterstützung für Raw-Byte-Fenster gegen PR19-era Daemons vorab prüfen können. `workspace_file_write` deckt die hash-bewussten Text-Mutationsrouten ab (`POST /file/write`, `POST /file/edit`). Das Write-Tag bedeutet, dass der Routenvertrag existiert; es bedeutet nicht, dass die aktuelle Bereitstellung für anonyme Mutationen offen ist. Schreiben/Bearbeiten sind strikte Mutationsrouten und erfordern Betreiber-Autorität; tokenloser vertrauenswürdiger Loopback qualifiziert sich. `workspace_file_upload` deckt `POST /file/upload` ab, die Binär-Ingress-Route: Ein `application/octet-stream`-Body, begrenzt auf `MAX_UPLOAD_BYTES` (50 MiB), wird in den Workspace geschrieben, ohne jemals zu überschreiben – ein belegter Name wird automatisch nummeriert (`name (1).ext`, `name (2).ext`, ...). Es ist auch eine strikte Mutationsroute.

`workspace_file_delete` deckt nur `POST /workspaces/:workspace/file/delete` ab; es existiert keine Legacy-Primary-`/file/delete`-Route. Der JSON-Body ist `{ "path": "relative/file.txt" }`, und Erfolg gibt `{ "kind": "file_delete", "path": "relative/file.txt" }` zurück. Diese strenge Mutationsroute entfernt dauerhaft eine reguläre Datei aus dem ausgewählten vertrauenswürdigen lokalen Workspace. Verzeichnisse und Symlinks werden abgelehnt; nicht unterstützte Fabriken (einschließlich SSH) geben 422 zurück. Die Fähigkeit beschreibt Protokollunterstützung, nicht die Erlaubnis zum Löschen in jedem Workspace. Clients müssen auch `workspace_qualified_rest_core` preflighen.

Wenn `workspace_qualified_rest_core` beworben wird, ist dieselbe Dateioberfläche auch unter `/workspaces/:workspace/file`, `/workspaces/:workspace/file/bytes`, `/workspaces/:workspace/stat`, `/workspaces/:workspace/list`, `/workspaces/:workspace/glob`, `/workspaces/:workspace/file/write`, `/workspaces/:workspace/file/edit`, `/workspaces/:workspace/file/upload` und `/workspaces/:workspace/file/delete` verfügbar (die letzte Route erfordert zusätzlich `workspace_file_delete`).

`workspace_directory_create` und `workspace_directory_delete` bewerben unabhängig voneinander `POST /workspaces/:workspace/directory/create` und `POST /workspaces/:workspace/directory/delete`. Preflight das Tag der Operation zusammen mit `workspace_qualified_rest_core`; ältere qualifizierte Daemons könnten diese Routen fehlen. Beide sind strenge Mutationen, die dem vertrauenswürdigen aktiven ausgewählten lokalen Runtime gehören, ohne Primary-Fallback oder Legacy-Primary-Gegenstück. Erstellung ist exklusiv unter einem vorhandenen Elternelement; Löschung ist permanent und rekursiv.

Dasselbe Tag exponiert auch workspace-qualifiziertes Projekt-Agent-CRUD unter `/workspaces/:workspace/agents` und `/workspaces/:workspace/agents/:agentType`. Diese Plural-Routen lesen oder mutieren nur Projekt-Level-Agenten für den ausgewählten Workspace; `global`- und `user`-Scope-Anfragen geben `400 { code: "global_scope_not_supported_for_workspace_route" }` zurück. Workspace-lose `/workspace/agents`-Routen behalten ihr bestehendes Primary-Workspace-Verhalten bei und bleiben die einzige REST-Oberfläche für den User-Level-Agent-Scope.

`extension_management_v2` bewirbt einen User-Level-Erweiterungskatalog und eine Mutationsoberfläche unter `/extensions/*`, plus Workspace-Aktivierungsprojektionen unter `/workspaces/:workspace/extensions/*`. Artefakte sind global; Workspace-Routen exponieren nur Lesevorgänge von Projektionen, exakte Aktivierungsüberschreibungen und Runtime-Aktualisierungen. Lesevorgänge können auf einen nicht vertrauenswürdigen registrierten Workspace zielen, während Aktivierung, Aktualisierung und Workspace-gestützte Installation ein vertrauenswürdiges Ziel erfordern. Langsame Mutationen verwenden Daemon-lokale Operationen unter `/extensions/operations/:operationId`; Store-Generation, nicht Operationsverlauf, ist über Neustarts hinweg und über Daemons hinweg maßgeblich. Die veröffentlichte `workspace_extensions`-Fähigkeit und die `/workspace/extensions/*`-Routen bleiben ein Kompatibilitätsadapter für den Primary-Workspace. Clients müssen `extension_management_v2` preflighen und dürfen es nicht aus dem Daemon-Modus oder `workspace_qualified_rest_core` ableiten.

`extension_git_credentials` bewirbt authentifizierte HTTPS-Git-Installationen sowohl auf `POST /workspace/extensions/install` als auch auf `POST /extensions/install`. Clients müssen dieses Tag preflighen, bevor sie URL-Userinfo oder `credentialPersistence` senden; ältere Daemons lehnen URL-Anmeldeinformationen ab. Das Tag beschreibt Backend-Protokollunterstützung, nicht die Verfügbarkeit eines Schlüsselbunds: Der gespeicherte Modus meldet das ausgewählte Backend im Terminal-Operationsergebnis.

`extension_local_path_install` bewirbt Daemon-lokale Erweiterungsquellen sowohl auf `POST /workspace/extensions/install` als auch auf `POST /extensions/install`. Der Pfad `source` muss ein absoluter Pfad sein, der auf dem Daemon-Host existiert. Relative Pfade bleiben nicht unterstützt, damit das cwd des Daemon-Prozesses nicht die Quellenidentität ändern oder eine GitHub-`owner/repo`-Kurzform verdecken kann. Die bestehende Installationsoperation kopiert die Erweiterung in den verwalteten Speicher; sie verknüpft die Quelle nicht. Clients müssen dieses Tag preflighen, da ältere Daemons lokale Quellen ablehnen.

`extension_batch_activation_v2` fügt `PUT /extensions/activation` und `PUT /workspaces/:workspace/extensions/activation` hinzu. Beide akzeptieren 1–100 Namen in `extensionNames`, deduplizieren sie unter Berücksichtigung der Groß-/Kleinschreibung, wobei die Reihenfolge des ersten Auftretens beibehalten wird, speichern geänderte Ziele in einer Generation und geben einen einzelnen `202`-Operationshandle zurück. Ein Ziel muss nicht installiert sein, wenn `enabled` oder `disabled` festgelegt werden: Sein Name erstellt eine Sollzustandsdeklaration, die erhalten bleibt, wenn eine Extension mit diesem Namen installiert wird. Die globale Route akzeptiert `state: "enabled" | "disabled"` und schreibt V2 `defaultActivation`; die Workspace-Route akzeptiert auch `"inherit"` und wendet exakte Überschreibungen für die ausgewählte vertrauenswürdige Laufzeitumgebung an oder löscht sie. `inherit` deklariert keinen unbekannten Namen, und ein Löschen aller unbekannten Namen meldet `updated: false`.

`extension_activation_explicit_refresh` bedeutet, dass einzelne und Batch-Aktivierungsoperationen nach dem dauerhaften Policy-Commit abgeschlossen sind, ohne aktive Sitzungen direkt zu aktualisieren. Aufrufer, die eine sofortige Anwendung benötigen, sollten auf den Erfolg der Aktivierung warten und dann entweder die synchrone Haupt-Workspace-`POST /workspace/extensions/refresh` übermitteln, die Aktualisierungszählungen direkt zurückgibt, oder die asynchrone `POST /workspaces/:workspace/extensions/refresh` des ausgewählten Workspaces, die einen separaten Operationshandle zurückgibt. Die beiden Formen sind nicht austauschbar: Die asynchrone Operation zeichnet die angewendete Generation auf, wenn ihre vollständige Laufzeitabstimmung abgeschlossen ist, während die synchrone Route nichts aufzeichnet, sodass der Generations-Reconciler diesen Workspace weiterhin als ausstehend behandelt und seine Sitzungen beim nächsten Durchlauf erneut aktualisiert. Aufrufer, die einen bestimmten Workspace adressieren können, sollten die asynchrone Form bevorzugen. Ein Fehler bei der Aktualisierung rollt das Aktivierungsergebnis nicht zurück und degradiert es nicht. Daemons ohne diese Fähigkeit beinhalten bereits die Laufzeitaktualisierung in der Aktivierung, daher dürfen Kompatibilitätsclients keine zweite Aktualisierung übermitteln. Der unabhängige 30-Sekunden-Generations-Reconciler bleibt aktiviert und wendet die committete Policy normalerweise beim nächsten Durchlauf an; fehlgeschlagene Abstimmungen werden durch spätere Durchläufe wiederholt.

### Extension Management V2 Wire-Vertrag [#extension-management-v2-wire-contract]

Alle Routen verwenden die oben genannten Daemon-Bearer-Authentifizierungsregeln. `X-Qwen-Client-Id` ist für die V2-Mutationsrouten optional; wenn angegeben, muss es einen Client identifizieren, der bei einer der Ziel-Laufzeitumgebungen der Mutation registriert ist. `:extensionId` ist die Kleinbuchstaben-64-Hex-Extension-Identität. `:workspace` wird zuerst als exakte Workspace-ID aufgelöst und andernfalls als URL-kodierter absoluter cwd nach der Kanonisierung.

| Methode und Pfad | Erfolg |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `GET /extensions` | `200` globaler Artefaktkatalog |
| `PUT /extensions/activation` | `202` globale Standardaktivierungs-Batch-Operation |
| `PUT /extensions/:extensionId/activation` | `202` globale Standardaktivierungs-Operation |
| `POST /extensions/install` | `202` Installationsoperation |
| `POST /extensions/check-updates` | `202` Update-Prüfungsoperation |
| `POST /extensions/:extensionId/update` | `202` Update-Operation |
| `DELETE /extensions/:extensionId` | `202` Deinstallationsoperation oder idempotentes `204`, wenn die Extension fehlt |
| `GET /extensions/operations/:operationId` | `200` Operations-Snapshot |
| `GET /workspaces/:workspace/extensions` | `200` Workspace-Aktivierungsprojektion |
| `GET /workspaces/:workspace/extensions/:extensionId/state` | `200` Workspace-Ressourcenzustand (`extension_state`) |
| `PUT /workspaces/:workspace/extensions/:extensionId/state` | `202` Workspace-Ressourcenzustands-Operation (`extension_state`) |
| `PUT /workspaces/:workspace/extensions/activation` | `202` exakte Workspace-Aktivierungs-Batch-Operation |
| `PUT /workspaces/:workspace/extensions/:extensionId/activation` | `202` exakte Workspace-Aktivierungs-Operation |
| `DELETE /workspaces/:workspace/extensions/:extensionId/activation` | `202` Überschreibungs-Löschoperation |
| `POST /workspaces/:workspace/extensions/refresh` | `202` Laufzeit-Aktualisierungsoperation |

#### Explizite Extension-Aktualisierung

Fähigkeitskennung: `workspace_session_refresh` für die optionale Sitzungsauswahl. Sowohl `POST /workspace/extensions/refresh` (Haupt-Laufzeitumgebung) als auch `POST /workspaces/:workspace/extensions/refresh` (ausgewählte Laufzeitumgebung) akzeptieren:

```json
{ "sessionIds": ["session-1", "session-2"] }
```

Das Weglassen von `sessionIds` bewahrt die vollständige Laufzeitaktualisierung. Ein übergebenes Array wird in Anfragereihenfolge dedupliziert, und `[]` aktualisiert keine Sitzungen oder Bootstrap-Caches. IDs müssen nicht leere Zeichenketten sein. Ungültige Anfrageformate geben HTTP 400 zurück; unbekannte IDs, einschließlich Sitzungen, die einem anderen Workspace gehören, geben HTTP 404 zurück, bevor die Arbeit beginnt. Das Eigentum an der Sitzung wird nur innerhalb der aufgelösten Laufzeitumgebung überprüft, ohne Fallback auf die Haupt-Laufzeitumgebung. Bestehende Authentifizierungs-, strenge Mutations-, Workspace-Vertrauens- und Client-Identitäts-Gates gelten.

Die Hauptroute gibt weiterhin HTTP 200 mit `{ refreshed, failed }` zurück; die qualifizierte Route gibt weiterhin HTTP 202 mit einem Operationshandle zurück. Zählungen beschreiben die ausgewählten Sitzungen. Eine Aktualisierung mit `sessionIds` erhöht die workspace-weit angewendete Generation nicht, selbst wenn die Auswahl alle aktuellen Sitzungen abdeckt. Die automatische vollständige Abstimmung bleibt unverändert und kann andere Sitzungen später aktualisieren. Die Auswahl erstellt keine sitzungsspezifische Aktivierungsrichtlinie: Gemeinsame Laufzeit-Caches können sich ändern, und Workspace-Ereignisse bleiben workspace-weit.

Clients müssen `workspace_session_refresh` vor der Übergabe des Felds prüfen, einschließlich eines leeren Arrays; ältere Daemons können es stillschweigend ignorieren. Bestehende Aufrufe ohne das Feld erfordern keine neue Fähigkeitsprüfung.

#### Workspace-Ressourcenzustand

Prüfen Sie `extension_state` unabhängig. Es unterstützt nur Skills; es impliziert kein MCP-Ressourcenmanagement. Beide Routen wählen die registrierte Workspace-Laufzeitumgebung aus und fallen niemals auf die Haupt-Laufzeitumgebung zurück. GET folgt den bestehenden schreibgeschützten Vertrauensregeln; PUT erfordert einen vertrauenswürdigen Workspace.

```json
{
  "skills": [
    { "name": "review", "state": "enabled" },
    { "name": "deploy", "state": "disabled" }
  ]
}
```

PUT akzeptiert 1–100 Einträge, einschließlich eines Einzel-Element-Batches. Es lehnt fehlerhafte Einträge, duplizierte Namen (unter Berücksichtigung der Groß-/Kleinschreibung) und nicht unterstützte Gruppen ab, bevor sie in die Warteschlange gestellt werden. Alle Namen müssen zur installierten Ziel-Extension gehören, einschließlich derzeit deaktivierter Skills; ein ungültiges Ziel lässt die Operation fehlschlagen, ohne teilweise Schreibvorgänge. Ein gesperrter Store-Commit führt die aufgelisteten Überschreibungen für den exakten kanonischen Workspace zusammen. Nicht aufgelistete Skills und andere Workspaces bleiben erhalten. Es gibt keinen Einstellungen-Schreibvorgang, keine Zukunftsnamensdeklaration oder keine implizite Aktivierung der übergeordneten Extension.

GET gibt `v: 1`, `workspaceId`, `workspaceCwd`, `extensionId`, `name` und `skills` zurück. Jeder Skill hat `name`, `defaultEnabled`, nullable `workspaceEnabled`, `effectiveEnabled` und optionales `disabledReason`/`lockedScope`. Das optionale `skillStates` des Manifests liefert Standardwerte; fehlende Werte standardmäßig auf aktiviert. Für eine aktive übergeordnete Extension ist die Priorität: hartes Deaktivieren in den Einstellungen, explizites Aktivieren in den Einstellungen, Standardmäßiges Deaktivieren in den Einstellungen, interne Workspace-Überschreibung, Manifest-Standardwert. Internes Deaktivieren verwendet `disabledReason: "default"` und sperrt die Einstellungen nie. Eine deaktivierte oder entfernte übergeordnete Extension kann nicht durch eine Skill-Überschreibung wiederbelebt werden.

Die `set_extension_state`-Operation gibt `status: "updated"` mit sortierten `result.resourceStates.skills` zurück; `result.states` behält seine Bedeutung für die Update-Prüfung bei. Persistierter Zustand ist kein Beweis dafür, dass jede Sitzung aktualisiert wurde. Der Daemon aktualisiert nur Skills und deren Befehls-/Modellkontext für die Ziel-Laufzeitumgebung, einschließlich Bootstrap- und Live-Sitzungen, ohne unrelated MCP/LSP/Hooks neu zu starten. Fehler beim Aktualisieren nach dem Commit erzeugen Warnungen, ohne den Zustand zurückzusetzen. Überschreibungen überleben Neustarts und Extension-Aktualisierungen und werden bei der Deinstallation entfernt. Clients dürfen nicht auf die Skill-Einstellungs-API zurückgreifen, da diese eine Einstellung mit höherer Priorität schreibt.

#### Globaler Katalog

Die Antwort des globalen Katalogs lautet:

```json
{
  "v": 1,
  "generation": 12,
  "extensions": [
    {
      "id": "<64 lowercase hex characters>",
      "name": "demo",
      "version": "1.2.3",
      "installType": "npm",
      "defaultActivation": "enabled",
      "workspaceOverrideCount": 1
    }
  ]
}
```

`installType` wird weggelassen, wenn keine Installationsmetadaten verfügbar sind. `defaultActivation` ist `enabled` oder `disabled`. `workspaceOverrideCount` schließt gespeicherte `inherit`-Einträge aus.

Die Antwort der Workspace-Projektion lautet:

```json
{
  "v": 1,
  "workspaceId": "workspace-id",
  "workspaceCwd": "/absolute/workspace",
  "trusted": true,
  "desiredGeneration": 12,
  "appliedGeneration": 11,
  "extensions": [
    {
      "extensionId": "<64 lowercase hex characters>",
      "name": "demo",
      "version": "1.2.3",
      "defaultActivation": "enabled",
      "workspaceActivation": "disabled",
      "effectiveActivation": "disabled",
      "activationSource": "workspace_override"
    }
  ]
}
```

`workspaceActivation` ist `enabled`, `disabled` oder `null` für Vererbung. `activationSource` ist `default`, `workspace_override`, `legacy_path_rule` oder `cli_override`. `desiredGeneration` ist die dauerhafte Store-Generation; `appliedGeneration` ist die neueste Generation, die der Controller als auf diese Workspace-Laufzeitumgebung angewendet aufgezeichnet hat, und kann vorübergehend hinterherhinken.

Installation erfordert ausdrückliche Zustimmung und eine initiale Aktivierung:

```json
{
  "source": "@scope/demo",
  "consent": true,
  "activation": { "scope": "user" },
  "ref": "optional-git-ref",
  "autoUpdate": true,
  "allowPreRelease": false,
  "registry": "https://registry.npmjs.org"
}
```

Verwenden Sie für die initiale Aktivierung nur im Workspace `{ "scope": "workspace", "workspaceId": "target-workspace-id" }`; das Ziel muss existieren und vertrauenswürdig sein. Daemon-Installationen akzeptieren GitHub-, Git- und npm-Quellen. Wenn `extension_local_path_install` beworben wird, akzeptieren sie auch einen absoluten Pfad, der auf dem Daemon-Host existiert. `ref` gilt nicht für npm, `ref` und `autoUpdate` gelten nicht für lokale Quellen, und `registry` gilt nur für npm. `ref`, `autoUpdate`, `allowPreRelease` und `registry` sind optional.

Wenn `extension_git_credentials` beworben wird, kann eine HTTPS-Git-Quelle Benutzerinformationen enthalten, zum Beispiel `https://username:token@git.example.com/org/repository.git`. `credentialPersistence` ist nur mit einer solchen Quelle gültig. Es ist `stored` oder `one_time` und standardmäßig `one_time`, wenn es weggelassen wird. Im gespeicherten Modus speichert die daemon's hybrid secret storage die Zugangsdaten und behält nur die saubere Repository-URL in den Installationsmetadaten, sodass die Extension aktualisierbar bleibt. Im einmaligen Modus werden weder die Repository-URL noch die Zugangsdaten gespeichert, und es wird eine nicht aktualisierbare `snapshot` erstellt; `autoUpdate: true` wird für diesen Modus abgelehnt. Die Angabe des Feldes ohne URL-Zugangsdaten, die Angabe ungültiger Zugangsdaten oder die Verwendung von Zugangsdaten mit npm-, Archiv-, lokalen, SSH- oder Nicht-Git-Quellen gibt `400` zurück.

Installationsantworten und -operationen mit Zugangsdaten geben `credentialPersistence` frei und können `credentialStorage` als `keychain` oder `encrypted_file` freigeben. Einmalige Operationen lassen `source` weg; gespeicherte Operationen können die saubere Quelle zurückgeben. Snapshot-Katalog-/Status-Einträge lassen die Quelle weg, setzen `credentialPersistence` auf `one_time` und melden `not updatable`. Das Update schlägt mit `extension_not_updatable` fehl; ein nicht verfügbares gespeichertes Geheimnis schlägt vor dem Netzwerkzugriff mit `extension_credential_unavailable` fehl.

Globale und Workspace-Aktivierungs-`PUT`-Anfragen verwenden denselben Body:

```json
{ "state": "enabled" }
```

`state` ist `enabled` oder `disabled`. Anfragen für Update, Deinstallation, Update-Prüfung, Aktivierung löschen und Aktualisierung haben keinen erforderlichen Body.

Batch-Aktivierungsanfragen verwenden Extension-Namen:

```json
{
  "extensionNames": ["formatter", "review-tools"],
  "state": "disabled"
}
```

Der Workspace-Batch akzeptiert auch `"state": "inherit"`. Terminale globale Ergebnisse enthalten `name` und `defaultActivation`; Workspace-Ergebnisse enthalten `name`, `workspaceActivation` (`null` für Vererbung) und `effectiveActivation`. Ungültige Namen lehnen die Anfrage ab; Konflikte mit bestehenden Store-Identitäten schlagen atomar fehl, ohne teilweisen Commit. Ein unbekanntes `inherit`-Ziel wird nicht persistiert, da das Löschen einer Überschreibung keine Standardaktivierungsdeklaration erzeugen oder eine spätere Installationszustimmung ersetzen darf.

Jede akzeptierte asynchrone Mutation gibt Folgendes zurück:

```http
HTTP/1.1 202 Accepted
Location: /extensions/operations/<operation-id>
Retry-After: 1
Content-Type: application/json

{"accepted":true,"operationId":"<operation-id>"}
```

Workspace-qualifizierte Mutationen verwenden denselben globalen `/extensions/operations/:operationId`-Polling-Pfad. Die Operationshistorie ist prozesslokal, behält nur eine begrenzte Anzahl terminaler Einträge und geht bei einem Daemon-Neustart verloren; Clients müssen den Katalog oder die Workspace-Projektion erneut lesen und Generationen vergleichen, wenn eine Operations-ID verschwindet.

Eine Operations-Snapshot hat diese Form:

```json
{
  "v": 1,
  "operationId": "<operation-id>",
  "operation": "install",
  "status": "running",
  "phase": "preparing",
  "createdAt": 1750000000000,
  "updatedAt": 1750000000100,
  "source": "owner/repository",
  "name": "demo"
}
```

`status` wechselt von `queued` zu `running`, dann zu `succeeded`, `succeeded_with_warnings` oder `failed`. Während der Ausführung ist `phase` `preparing`, `committing` oder `reconciling`. Terminaler Erfolg kann `result` enthalten, wobei `status` gleich `installed`, `enabled`, `disabled`, `updated`, `uninstalled`, `checked` oder `refreshed` ist; Reconciliation-Ergebnisse können zusätzlich `refreshed`, `failed` und `error` enthalten, während Batch-Aktivierungsergebnisse sortierte `results` enthalten. Update-Prüfungen geben `result.states` zurück, indiziert nach Extensionsnamen, mit Werten wie `checking for updates`, `update available`, `up to date`, `not updatable` oder `error`. Zugangsdaten und Autorisierungsheader sind niemals Operationsfelder.

Ein dauerhafter Commit gefolgt von unvollständiger Bereinigung oder Runtime-Reconciliation wird nicht als fehlgeschlagene Mutation gemeldet. Er gibt `succeeded_with_warnings` zurück und bewahrt das committete Ergebnis:

```json
{
  "v": 1,
  "operationId": "<operation-id>",
  "operation": "uninstall",
  "status": "succeeded_with_warnings",
  "createdAt": 1750000000000,
  "updatedAt": 1750000000200,
  "result": {
    "status": "uninstalled",
    "name": "demo",
    "refreshed": 2,
    "failed": 0
  },
  "warnings": [
    {
      "workspaceId": "workspace-id",
      "workspaceCwd": "/absolute/workspace",
      "code": "reconcile_slow",
      "error": "Runtime reconciliation took 31000ms."
    }
  ]
}
```

Warnung `workspaceId` und `code` sind optional; `workspaceCwd` und `error` sind immer vorhanden. Clients sollten Warnungen anzeigen, ihren Katalog/projection aktualisieren und dürfen die dauerhafte Mutation nicht blind wiederholen.

Validierungs- und Autorisierungsfehler sind synchrone HTTP-Fehler unter Verwendung von `{ "error": "...", "code": "..." }`, wenn ein stabiler Code existiert. Wichtige Fälle sind `400 invalid_extension_id`, `400 invalid_extension_names`, `400 invalid_extension_name`, `400 invalid_extension_activation`, `400 workspace_mismatch`, `403 untrusted_workspace`, `404 extension_operation_not_found` und `429 extension_queue_full`. Die Installationsvalidierung gibt auch `400` für ungültige source/ref/registry-Optionen, fehlende Zustimmung oder fehlende/ungültige initiale Aktivierung zurück. Eine Mutation, die nach `202` fehlschlägt, wird dargestellt, während sie in der Operationshistorie behalten wird, mit `status: "failed"`, `error` und einem optionalen stabilen `code`; häufige Codes umfassen `extension_prepare_timeout` und `extension_conflict`. HTTP `404` für eine Operation impliziert keinen Rollback, da die Operationshistorie nicht dauerhaft ist.

`daemon_status` bewirbt `GET /daemon/status`, den konsolidierten schreibgeschützten Diagnose-Snapshot des Betreibers, der unten dokumentiert ist.

`daemon_update` bewirbt die prozessglobalen `GET /daemon/update`-, `POST /daemon/update/prepare`- und `POST /daemon/update/restart`-Oberflächen.

`scheduled_task_gate` bewirbt das optionale `gate` auf `POST` und `PATCH /scheduled-tasks` sowie `gate` und `gateStatus` auf Task-Ansichten. Eine Gate ist ein Shell-Befehl, den die besitzende Sitzung bei jedem Auslösen außerhalb des Modells ausführt: Exit 0 mit Ausgabe liefert das Auslösen mit dieser angehängten Ausgabe, Exit 0 ohne stdout-Eintrag überspringt es, und ein Non-Zero-Exit wird gemeldet, wenn das Gate anfängt zu fehlschlagen, nicht bei jedem Auslösen. `gateStatus.lastOutcome` ist `quiet`, `delivered`, `failed` oder `blocked`.

- Ein Gate benötigt eine wiederkehrende Aufgabe: `POST` mit `recurring: false` oder ein `PATCH`, das ein Gate auf einer One-Shot setzt oder eine gated Aufgabe in One-Shot umwandelt, antwortet mit 400 `gate_requires_recurring`; eine bereits in diesem Zustand befindliche Aufgabe behält ihre anderen Änderungen bei. Ein fehlerhaftes Gate (leer bei `POST`, nur ein Kommentar, über 2048 Zeichen, ein NUL-Zeichen oder ein unpaariges UTF-16-Surrogat, ein Shell-Wrapper wie `bash -c '…'` oder jeder Teil, der mit `&` im Hintergrund ausgeführt wird) antwortet mit 400 `invalid_gate`. Die `&`-Prüfung ist lexikalisch und best-effort; im Zweifel lehnt sie ab (ein `&` in einem Kommentar, ein Heredoc-Body oder `(( … ))`), und ein Gate, das diese Prüfung passiert, wird als `failed` gemeldet, wenn es mit nichts auf stdout beendet wird, während ein Hintergrundteil noch seinen stdout hält (außerhalb der bwrap-Shell-Sandbox, deren PID-Namespace diesen Teil mit dem Befehl beendet). Bei `PATCH`, `gate: null` oder `gate: ""` wird das Gate und sein `condition` gelöscht.
- Eine Legacy-Aufgabe, geschützt durch ein `condition`, verweigert jeden `gate`-Schlüssel in einem `PATCH` mit 409 `task_legacy_unsupported`, sodass ein Client `gate` nur sendet, wenn er ihn ändert.
- Ein Gate, das über diese Routen geschrieben wird, trägt keine Bestätigung von der Sitzung. Es läuft unbeaufsichtigt nur dort, wo ein `monitor`-Aufruf desselben Befehls ohne Rückfrage laufen würde: unter einer gespeicherten `Monitor(...)`- oder `Bash(...)`-Allow-Regel, als schreibgeschützter Befehl oder in einer Auto- oder Yolo-Sitzung. Eine Deny-Regel blockiert es in jedem Modus und Plan-Modus blockiert es; ein blockiertes Auslösen endet mit `blocked`.
- Clients dürfen `gate` nicht an einen Daemon ohne dieses Tag senden: Ein solcher Daemon verwirft es auf `POST` und antwortet auf ein Gate-only `PATCH` mit 400 `empty_patch`.

`autofix_pr_watches` bewirbt `GET /autofix-pr/watches` (der primäre Workspace) und `GET /workspaces/:workspace/autofix-pr/watches` (ein registrierter, vertrauenswürdiger). Jeder beantwortet die `/autofix-pr`-Watches des Workspace-Klons so, wie `qwen autofix-pr status` sie auflistet, gelesen aus den Watch-Dateien unter dem Main-Worktree des Klons (`.qwen/tmp`), jede geöffnet ohne Link-Following und ohne Blockieren. Kein Lock wird genommen, GitHub wird nicht gefragt, und kein Git-Befehl läuft außer `git worktree list`, der den Klon findet. Die Antwort ist `{ v: 1, available, root?, now?, watches, unreadable? }`: `available` ist false, ohne Watches, wenn kein Git-Repository für den Workspace gefunden wird (oder Git dort nicht laufen kann), und `root` ist der Main-Worktree des Klons, derselbe für zwei Workspaces eines Klons. Eine Watch trägt die Felder von `status` (Abschnitt 6.10 des `/autofix-pr`-Designs) aber `thisSession`, `worktreePath`, `pushTarget`, `gitTrusted` und `worktreeWork`; ihr `session` ist die Sitzung, die sie besitzt, was keine Sitzung dieses Daemons sein kann. Das Stoppen einer Watch ist Sache des Skills (`/autofix-pr stop <n>` in der besitzenden Sitzung); diese Routen ändern nichts.

**Bedingte Tags.** Diese Feature-Tags werden nur beworben, wenn ihr Deployment-Toggle, Runtime-Wiring oder Verfügbarkeitszustand aktiv ist. Die Anwesenheit des Tags bedeutet, dass das dokumentierte Verhalten verfügbar ist; die Abwesenheit bedeutet entweder einen älteren Daemon vor Einführung des Tags oder einen aktuellen Daemon, bei dem dieser Zustand falsch ist. Derzeit:

<!-- conditional-serve-features:start -->

| Tag | Beworben, wenn … |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agent_collaboration_v1` | mindestens ein registrierter Workspace hat sich für persistente Workspace-Agent-Kollaboration via `experimental.agentCollaboration` (jeder Scope, Workspace eingeschlossen) oder `QWEN_CODE_ENABLE_AGENT_COLLABORATION=1` entschieden. Vorhandensein bedeutet, dass `/workspaces/:workspace/agent/*` und die Agent-Host-Transport-Routen montiert sind; `workspaces[].agentCollaborationEnabled` identifiziert den Opt-In-Zustand jedes Workspaces, und Clients müssen die Kollaborations-Oberfläche nur für aktivierte Einträge anzeigen oder aufrufen. Ältere Daemons lassen dieses Workspace-Feld weg, sodass Clients zur Kompatibilität auf dieses Top-Level-Tag zurückgreifen können. Nicht vorhanden bedeutet, dass Kollaboration auf dieser Antwort nicht bedient wird — das Tag wird pro Anfrage neu berechnet, nicht beim Boot gesnapshottet — daher muss ein Client den Einstiegspunkt entfernen, statt ihn zu rendern und die Aufrufe 404 laufen zu lassen. Die erste Aktivierung erfordert einen Neustart; das Umschalten für einen Workspace, während ein anderer bereits aktiv ist, tritt mit der nächsten Anfrage in Kraft. Unterscheidet sich vom unbedingten `workspace_agents`-Tag, welches Subagent-Definition-CRUD ist. |
| `session_message_deletion` | das private Hosted-Harness-Profil ist nicht aktiv. Listet und löscht Nachrichtengruppen über Live-Sitzungsbesitzer-Routen; gewöhnliche lokale Daemon-Sitzungen unterstützen physisches Löschen, während Managed Authoritative Storage und SSH-Workspaces es ablehnen. |
| `hosted_harness_private_v1` | das private Hosted-Harness-Profil ist aktiv; nur seine authentifizierte Sitzungs-API ist verfügbar. |
| `managed_session_journal_delta_v1` | das private Hosted-Harness-Profil ist aktiv (gleicher Zustand wie `hosted_harness_private_v1`) und dieser Build kann Managed Session Journals öffnen, die `message.delta`-Datensätze enthalten. Eine Control Plane erfordert das Tag bei der Capability-Verhandlung, sodass ein zurückgerolltes Harness, das diese Datensätze nicht kennt, dort einmalig abgelehnt wird, statt jedes Session-Open fehlschlagen zu lassen (`managed_session_open_failed`). |
| `require_auth` | der Daemon wurde mit `--require-auth` gestartet (oder `requireAuth: true` über die eingebettete API). Bearer-Token ist auf jeder normalen API-Route obligatorisch, einschließlich `/health` bei Loopback-Binds; Channel-Webhook-Ingress behält seine unabhängige Shared-Secret-Authentifizierung, und Web Shell Dokument- und Asset-Routen bleiben pre-auth. |
| `mcp_workspace_pool` | der gemeinsame MCP-Transport-Pool ist aktiv. Entfällt, wenn `QWEN_SERVE_NO_MCP_POOL=1` den Pool deaktiviert. |
| `mcp_pool_restart` | der gemeinsame MCP-Transport-Pool ist aktiv; Neustart-Antworten können pool-bewusste Multi-Entry-Formate enthalten. |
| `external_tool_guard` | `qwen serve` hat den Startup-Handshake für `--external-tool-guard-mode=required` abgeschlossen; jeder gestartete ACP-Channel muss die installierte Callback bestätigen, bevor eine Sitzung erstellt wird, und jeder unterstützte Top-Level Managed-ACP-Tool-Aufruf, der die finale Ausführungsgrenze erreicht, muss eine externe Pre-Execution-Allow erhalten. Frühere Permission/Hook-Denials lösen keine Provider-Anfrage aus. Verschachtelte AgentCore-Ausführung ist außerhalb von v1 und wird abgelehnt, solange dieser externe Provider-Modus aktiv ist. Das Tag spiegelt nur den externen Provider wider: unabhängig davon wendet jeder Daemon den eingebauten Git-Relocation-Guard auf verwaltete Tools an, die eine Shell-Befehlszeile tragen (`run_shell_command` und `monitor`), sodass die Abwesenheit dieses Tags nicht bedeutet, dass keine Pre-Execution-Denials erfolgen. |
| `allow_origin` | T2.4 ([#4514](https://github.com/QwenLM/qwen-code/issues/4514)). Der Daemon wurde mit mindestens einem `--allow-origin <pattern>` (oder `allowOrigins: [...]` über die eingebettete API) gestartet. Cross-Origin-Anfragen von übereinstimmenden Origins erhalten ordnungsgemäße CORS-Antwortheader; nicht übereinstimmende Origins erhalten weiterhin den Standardwert 403. Die konfigurierte Musterliste wird absichtlich NICHT in `/capabilities` ausgegeben, um zu vermeiden, dass die Liste vertrauenswürdiger Origins an nicht authentifizierte Leser durchsickert – ein Browser-Client kennt seinen eigenen Origin bereits. |
| `prompt_absolute_deadline` | `--prompt-deadline-ms` / `QWEN_SERVE_PROMPT_DEADLINE_MS` / `ServeOptions.promptDeadlineMs` ist auf eine positive Ganzzahl gesetzt. |
| `writer_idle_timeout` | `--writer-idle-timeout-ms` / `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` / `ServeOptions.writerIdleTimeoutMs` ist auf eine positive Ganzzahl gesetzt. |
| `workspace_settings` | der Daemon wurde mit verfügbarer Einstellungen-Persistenz erstellt. |
| `user_language_sync` | der Daemon wurde mit verfügbarer Einstellungen-Persistenz erstellt (gleiche Bedingung wie `workspace_settings`), sodass die sessionlose `POST /language`-Route registriert ist. |
| `workspace_voice` | Einstellungen-Persistenz ist verfügbar, sodass die Voice-Einstellungs-Routen des primären Workspace aus Legacy-Zeiten aktiv sind. |
| `workspace_voice_transcription` | der primäre Workspace hat ein konfiguriertes Voice-Transkriptionsmodell. |
| `session_shell_command` | Session-Shell-Ausführung ist explizit aktiviert und wirksam unter Bearer-Authentifizierung oder vertrauenswürdiger Loopback-Berechtigung; Aufrufe erfordern weiterhin eine client-id gebunden an die Session. |
| `standalone_sessions_v1` | der Daemon hat die vollständige Standalone-Session-Laufzeitumgebung, den Lifecycle-Koordinator, das dauerhafte Löschjournal, die verwaltete Verzeichnisimplementierung und die `/standalone/sessions`-Routenfamilie installiert. Direkte Einbettungen ohne den vollständigen Abhängigkeitsgraph lassen sowohl die Routen als auch dieses Tag weg. |
| `standalone_session_options_v1` | die vollständige Standalone-Session-Laufzeitumgebung ist installiert (gleiche Bedingung wie `standalone_sessions_v1`), sodass die schreibgeschützte, sessionlose `GET /standalone/session-options`-Route auf der internen Conversations-Laufzeitumgebung registriert ist. |
| `session_artifacts_persistence` | Session-Artefakt-Persistenz ist für die Laufzeitumgebung verdrahtet. |
| `session_artifact_library` | Session-Artefakt-Persistenz ist verdrahtet; unterstützt Lese-/Entfernungsoperationen durch vertrauenswürdige Workspace-Besitzer für aktive, kalte und archivierte Registrierungen via `/workspaces/:workspace/session/:id/artifact-library`. |
| `workspace_artifact_library` | Persistierte workspace-weite Artefaktabfragen, Batch-Sessionabfragen und explizite Paar-Entfernung via `/workspaces/:workspace/artifact-library`. |
| `workspace_artifact_library_stream` | Session-Metadaten bei allen Artefaktbibliothek-Lesevorgängen und opt-in endliches SSE für vollständige und ausgewählte Sessionabfragen; erfordert Artefakt-Persistenz. |
| `session_sources` | Session-Quellen-Persistenz ist für die Laufzeitumgebung verdrahtet. Registriert Metadaten-only Workspace-Dateien, hochgeladene Anhänge und HTTP(S)-Links über den aktiven Sessionbesitzer. |
| `session_generation` | Session-Generierungs-Helfer sind verfügbar. |
| `session_btw_stream` | Jede registrierte Runtime-Bridge unterstützt fortsetzbare BTW-Streaming-Vorgänge. Clients müssen dieses Flag prüfen, bevor sie `/session/:id/btw/stream` aufrufen; andernfalls verwenden Sie die bestehende JSON-BTW-Schnittstelle. |
| `scheduled_task_session_reuse` | Dauerhaftes geplantes Task-Session-Management ist aktiv und jede verwaltete Daemon-Laufzeitumgebung hat den Callback installiert, der es einer Aufgabe ermöglicht, sich explizit an ihre aktuelle vorhandene Session zu binden. |
| `workspace_generation` | Workspace-bezogene Generierungs-Helfer sind verfügbar. |
| `rate_limit` | `--rate-limit` / `QWEN_SERVE_RATE_LIMIT=1` / `ServeOptions.rateLimit` ist aktiviert. |
| `workspace_reload` | Workspace-Neuladen-Unterstützung ist in der eingebetteten Routenkonfiguration verfügbar. |
| `workspace_trust_grant` | Trust-Hot-Reload ist verdrahtet (gleiche Bedingung wie `workspace_trust_hot_reload`). Beide Grant-Routen vertrauen nur dem gebundenen Ordner und behalten eine bestehende `TRUST_FOLDER`- oder `TRUST_PARENT`-Regel bei. Nach der Persistenz gibt `200` v1-Status nur zurück, wenn Host-Richtlinie und gemeldeter Status vertrauenswürdig sind; andernfalls benennt `409 { error, code: "trust_grant_ineffective" }` den geprüften Zustand/die Quelle in `error`, einschließlich Richtlinien-Lade- oder IDE/Datei-Verweigerung. Fehler beim Speichern der Vertrauensdatei geben `500 trusted_folders_invalid` für `FatalConfigError` zurück, andernfalls `500 internal_error`. Lesevorgänge der Vertrauensdatei akzeptieren Kommentare und nachfolgende Kommas des JSONC-Schreibers. Routen werden auch ohne Hot Reload bereitgestellt: Das eigene API-Grant des Daemons aktualisiert den gecachten v1-Status sofort, aber startup-gebundene Gates erfordern einen Neustart (`requiresDaemonRestartForChanges: true`). Externe Terminal-/Dateibearbeitungen erfordern einen Daemon-Neustart, um diesen gecachten Status zu aktualisieren. |
| `workspace_trust_hot_reload` | Überwachung der Workspace-Trust-Richtlinie und Abstimmung der Laufzeitgenerierung sind verdrahtet, sodass Trust-Änderungen ohne Neustart des Daemons wirksam werden und v2-Trust-Status Konvergenz meldet. |
| `channel_reload` | Ein vom Daemon verwalteter Kanal-Worker-Manager ist aktiviert und kann seine aktuelle Auswahl neu laden. |
| `channel_control` | Steuerung der vom Daemon verwalteten Kanal-Worker-Laufzeitumgebung ist verdrahtet. |
| `channel_management` | Workspace-bezogene Kanal-Einstellungen, Lifecycle und Pairing-Management sind verdrahtet. |
| `channel_delete_config_loss_convergence` | Workspace-Kanal-Management ist verdrahtet (gleiche Bedingung wie `channel_management`). `DELETE /workspaces/:workspace/channels/:name` konvergiert einen Kanal, dessen Konfiguration aus der zusammengeführten Einstellungsansicht verschwunden ist, die der Worker auflöst (System + Benutzer + Workspace-Scope): Die Laufzeitumgebung muss still über den Kanal sein oder genau einen festgelegten Worker-Besitzer in diesem Workspace bestätigen, der gestoppt wird, bevor die persistierte Startauswahl in diesem Scope entfernt wird, anstatt `channel_instance_not_found` zu melden. Ein Kanal, dessen Konfiguration die zusammengeführte Ansicht noch enthält, aber der aufgelöste Kanal-Einstellungsscope des Workspaces nicht besitzt – einer, der nur im Benutzer- oder Systemscope konfiguriert ist, während der Workspace ein Projektverzeichnis ist – meldet `channel_instance_not_found` mit unberührter Laufzeitumgebung; ein Kanal, den der aufgelöste Scope konfiguriert, wird normal gelöscht, und ein Workspace, dessen Verzeichnis das Home-Verzeichnis des Benutzers ist, löst diesen Scope zur gemeinsamen Benutzerdatei auf, sodass ein Benutzer-Scope-Kanal dort konfiguriert – und gelöscht – wird. |
| `multi_workspace_sessions` | Mehr als eine Workspace-Laufzeitumgebung ist registriert, sodass die Session-Erstellung eine vertrauenswürdige Laufzeitumgebung anhand des cwd auswählen kann. |
| `multi_workspace_session_rewind` | Mehr als eine Workspace-Laufzeitumgebung ist registriert; singuläre Live-Session-Rückspul-Routen lösen die besitzende Laufzeitumgebung auf. |
| `multi_workspace_session_shell` | Mehr als eine Workspace-Laufzeitumgebung ist registriert und Session-Shell-Ausführung ist explizit aktiviert unter Bearer-Authentifizierung oder vertrauenswürdiger Loopback-Berechtigung; singuläre REST-Shell-Routen lösen die besitzende Laufzeitumgebung auf. |
| `dynamic_workspace_registration` | Eine Workspace-Laufzeitumgebung-Fabrik ist in den Daemon verdrahtet, sodass ein bestehendes vertrauenswürdiges Verzeichnis zur Laufzeit als sekundäre Laufzeitumgebung registriert werden kann. |
| `persistent_workspace_registration` | Ein Workspace-Registrierungsspeicher ist in den Daemon verdrahtet. Produktions-`runQwenServe` liefert den benutzerbezogenen Speicher automatisch; direkte `createServeApp`-Einbettungen müssen einen explizit injizieren und die Wiederherstellung ihres Workspace-Registers beim Start selbst übernehmen. |
| `scratch_workspace_registration` | Die Erstellung verwalteter Scratch-Workspaces ist verfügbar — eine Runtime-Fabrik, ein validiertes verwaltetes Scratch-Root-Verzeichnis und die Entsorgung der Runtime sind implementiert, und jede verwaltete Runtime hält sich an die Scratch-Root-Grenze. |
| `git_workspace_clone` | Der Daemon-Host verfügt über eine `git`-Binärdatei; `POST /workspaces` mit `{ kind: "git", url, target }` startet einen asynchronen Klon-Job, dessen Routen Fortschritt, Abbruch und das kanonische cwd melden. Hosts ohne `git` lassen das Tag aus. |
| `workspace_runtime_removal` | Entfernbare dynamische oder durch Persistenz wiederhergestellte sekundäre Runtimes können über die Verwaltungsroute entleert und entfernt werden. |
| `workspace_directories` | Der Daemon speichert Workspace-Einstellungen persistent, und jeder vertrauenswürdige lokale Runtime kann zusätzliche Verzeichnisse auf seine Live-Sitzungen anwenden: `/workspaces/:workspace/directories` listet, fügt hinzu und entfernt Einträge, die im Workspace-Bereich persistiert sind (`context.includeDirectories`). SSH-, verwaltete und eigenständige Workspaces werden abgelehnt, selbst wenn das Tag vorhanden ist, und experimentelle gepaarte Engine-Daemons lassen das Tag und die Route weg, da eine Mutation im Workspace-Bereich den verwalteten Child nicht erreichen kann. |
| `native_directory_picker` | Der Daemon-Host kann einen nativen OS-Verzeichnisauswahl-Dialog öffnen (`osascript` auf macOS, PowerShell auf Windows, `zenity` auf einem Linux-Host mit Anzeige). Headless-Hosts lassen das Tag aus, sodass Clients den daemon-nativen Auswahldialog zurückhalten, anstatt einen garantierten Fehler zu präsentieren. Web Shell blendet „Durchsuchen“ aus, wenn kein Auswahldialog verfügbar ist; ein [Einbettungs-Host-Verzeichnisauswahl](../design/web-shell-host-directory-picker.md#public-api-and-precedence) kann diesen bereitstellen, ohne dass dieses Tag erforderlich ist. |
| `workspace_runtime_stop` | Der Daemon übernimmt die ACP-Prozessbuchhaltung, vollständige Beobachtungen unabhängiger Aktivitäten und geplanter Aufgaben sowie eine Runtime-Brücke, die bestätigte Stopps und Empfangssnapshots unterstützt. Nicht unterstützte einzelne Runtimes sind in der Vorschau deaktiviert. |
| `workspace_runtime` | Jede aktive Workspace-Brücke stellt einen maßgeblichen Snapshot des Runtime-Lebenszyklus bereit; gemischte oder Legacy-injizierte Brücken lassen das Tag aus. |
| `workspace_skills_config_runtime` | Jeder aktive Workspace unterstützt maßgebliche Runtime-Lebenszyklen und die getrennten Config-/Runtime-Skills-Routen, die vom Skills-Management und dem Composer für neue Sitzungen verwendet werden. |
| `skill_archive_install` | Maßgeblicher Workspace-Lebenszyklus, Rohinstallation von Skill-Archiven und eigentümerbezogene Versuchsbelege sind verfügbar. |
| `skill_zip_file_source` | Maßgeblicher Workspace-Lebenszyklus, daemon-lokales Kopieren von ZIP-Archiven und eigentümerbezogene Versuchsbelege sind verfügbar. |
| `workspace_local_open` | Der Daemon-Host kann ein Workspace-Verzeichnis im Datei-Manager des Host-OS öffnen (`open` auf macOS, `explorer.exe` auf Windows, `xdg-open` auf einem Linux-Host mit Anzeige). Headless-Hosts lassen das Tag aus, sodass Clients die Funktion „Lokal öffnen“ ausblenden, anstatt einen garantierten Startfehler zu präsentieren. Der geöffnete Pfad ist immer das aufgelöste registrierte Workspace-cwd, via `POST /workspaces/:workspace/open`; die Route akzeptiert einen optionalen JSON-Body `{ "target": "terminal" }` (fehlend/andere = Ordner) und antwortet mit `{ kind: 'workspace-local-open', opened: true, target }`, wobei `target` auf `folder` oder `terminal` gesetzt ist. |
| `workspace_local_terminal` | Der Daemon-Host kann ein Terminalfenster in einem Workspace-Verzeichnis öffnen (`open -a Terminal` auf macOS, `wt.exe` mit `cmd.exe`-Fallback auf Windows, `gnome-terminal`/`konsole`/`xterm` auf einem Linux-Host mit Anzeige). Headless-Hosts lassen das Tag aus, sodass Clients die Funktion „Im Terminal öffnen“ ausblenden, anstatt einen garantierten Startfehler zu präsentieren. Bereitgestellt durch `POST /workspaces/:workspace/open` mit Body `{ "target": "terminal" }`. |
| `workspace_qualified_acp` | ACP HTTP und Multi-Workspace-Runtimes sind aktiv, sodass der Plural-ACP-Endpunkt eine sekundäre Runtime auswählen kann. |
| `workspace_qualified_voice` | Multi-Workspace-Runtimes und der gemeinsame ACP/Voice-WebSocket-Listener sind aktiv, sodass jede workspace-qualifizierte Voice-Modalität für eine sekundäre Runtime erreichbar ist. |
| `workspace_qualified_memory` | ACP HTTP und Multi-Workspace-Runtimes sind aktiv, sodass workspace-qualifizierte Managed-Memory-Routen eine pro-Workspace-Aufgabenspur für Remember-, Forget- und Dream-Operationen auswählen können. |
| `client_mcp_over_ws` | Der Daemon akzeptiert client-hosted MCP-Server über den ACP-WebSocket. Dies ist ein explizites Opt-In und nicht für den CDP-Tunnel-Pfad erforderlich. |
| `cdp_tunnel_over_ws` | Der Daemon stellt den umgekehrten `/cdp`-WebSocket-Tunnel bereit, entweder durch explizites Opt-In oder weil eine Chrome-Erweiterungs-Origin erlaubt ist. Dies bedeutet nur, dass der Tunnel existiert; es bedeutet nicht, dass Chrome DevTools MCP-Tools registriert sind. |
| `browser_automation_mcp` | ACP HTTP ist aktiviert, `cdp_tunnel_over_ws` ist aktiv, kein Bearer-Token blockiert `/cdp`, und `QWEN_CDP_MCP_COMMAND` benennt einen externen stdio-MCP-Adapter. Das Haupt-CLI-Paket bündelt keinen Browser-Automatisierungsadapter; ohne dieses Tag kann der Side-Panel-Chat der Chrome-Erweiterung weiterhin funktionieren, aber Console-/Netzwerk-/Screenshot-/Klick-Tools werden standardmäßig nicht registriert. |
| `voice_transcribe` | Der Voice-WebSocket-Endpunkt ist gemountet; für eine erfolgreiche Transkription ist weiterhin ein konfiguriertes Voice-Modell erforderlich. |
| `realtime_voice` | Der macOS-WebShell-Daemon hat Live-Voice aktiviert, und der native Host hat sich mit `QWEN_SERVE_LIVE_NATIVE_HOST=1` angemeldet (standardmäßig aus; siehe unten). `/live/status` meldet Bereitschaft, aber die Fähigkeit wird zurückgezogen, bis das Feature aktiviert ist. |
| `realtime_voice_web` | Live-Voice ist aktiviert, und die Web-Shell-Seite kann selbst der Audio-Endpunkt über WS `/live/web` sein, auf jeder Plattform, und der Standard-Endpunkt (der native Host ist nur für macOS und opt-in). Die Route authentifiziert wie `/voice/stream` (Bearer-Subprotokoll), erfordert einen vertrauenswürdigen primären Workspace und spricht das Live-Host-Protokoll mit reduziertem Hello: Mikrofonberechtigung plus Selbstprüfungen für Audioeingabe/-ausgabe. Eine einzelne Host-Lease bleibt bestehen: Ein nativer Host ersetzt einen Browser (`4010`), ein Browser verdrängt niemals einen nativen Host (`4009`), und ein zweiter Tab übernimmt nur mit `?takeover=1`. `/live/status` meldet `host.kind: "browser"`; Bildschirmaufnahme erfordert einen geteilten Bildschirm (unten), und eine Shortcut-Änderung wird für den nächsten nativen Host gespeichert, statt registriert zu werden. |
| `web_terminal` | ACP HTTP ist aktiviert, sodass der authentifizierte Web-Terminal-Endpunkt verfügbar ist. |
| `user_skill_activation` | Persistente Benutzereinstellungen sind verfügbar. `PUT /skills/activation` speichert exakte Namen von Benutzerpräferenzen und stellt asynchrone Propagierung in die Warteschlange. |

<!-- conditional-serve-features:end -->

Live-Voice verwendet standardmäßig auf jeder Plattform den Web-Shell-Endpunkt (`realtime_voice_web`, WS `/live/web`). Der native macOS-Host ist opt-in: Nur ein macOS-Daemon, der mit `QWEN_SERVE_LIVE_NATIVE_HOST=1` gestartet wurde, bewirbt `realtime_voice`, registriert WS `/live/host` und installiert den Host, wenn Live aktiviert ist. Ohne dies meldet `/live/setup` `nativeHost: false` mit einem nicht wiederholbaren `install`-Fehler, und `POST /live/setup/install` und `POST /live/setup/launch` antworten mit `409 live_native_host_unavailable`.

Ein Browser-Host beantwortet `host.capture_visual` nur, solange der Benutzer einen Bildschirm mit der Seite teilt, was die Seite in ihrem Hello als `selfChecks.screenShare` meldet. Teilen ist eine separate, explizite Handlung – das Modell fragt mitten im Turn, und `getDisplayMedia` erfordert eine Benutzer-Geste –, daher hält die Seite den Stream und nimmt pro Anfrage ein Frame. Wenn nichts geteilt wird, antwortet sie sofort mit `success: false`, statt die Anfrage timeouten zu lassen.

Da eine Seite nicht auf das Dateisystem des Daemons schreiben kann, sendet sie nur das JPEG. Der Daemon ignoriert jedes `screenshotPath`, das ein Browser-Lease meldet, und speichert das Bild selbst unter einem von ihm gewählten Namen im selben privaten Capture-Verzeichnis, in das ein nativer Host schreibt. Ein nativer Host persistiert weiterhin sein eigenes PNG und übergibt den Pfad wie zuvor.

`mcp_guardrails` ist **nicht** in dieser bedingten Tabelle enthalten – es ist ein immer aktives Tag, das beworben wird, wenn die Binärdatei die neuen `/workspace/mcp`-Budget-Felder unterstützt, unabhängig davon, ob der Operator ein Budget konfiguriert hat. Operatoren, die `--mcp-client-budget` nicht festgelegt haben, erhalten dennoch die neuen Felder (mit `budgetMode: 'off'`, `budgets: []`).

`mcp_guardrail_events` (Issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14b) bewirbt die typisierten SSE-Push-Ereignisse, die Überschreitungen des MCP-Budgets ohne Polling-Schleife sichtbar machen. Zwei Frame-Typen treffen auf `GET /session/:id/events` ein:

- `mcp_budget_warning` – feuert einmal beim Überschreiten der 75%-Schwelle von `reservedSlots.size / clientBudget` nach oben. Wird erst wieder aktiviert, nachdem das Verhältnis unter 37,5 % fällt (`MCP_BUDGET_REARM_FRACTION`). Spiegelt die Hysterese von `slow_client_warning` aus PR 10, jedoch auf Manager-Ebene statt auf Ebene des Backlogs pro Abonnent. Payload: `{ liveCount, reservedCount, budget, thresholdRatio: 0.75, mode: 'warn' | 'enforce' }`. Tritt sowohl im `warn`- als auch im `enforce`-Modus auf; niemals im `off`-Modus.
- `mcp_child_refused_batch` – feuert am Ende jedes `discoverAllMcpTools*`-Durchlaufs, wenn ein oder mehrere Server abgelehnt wurden, UND als Batch der Länge 1 beim `readResource`-Lazy-Spawn-Ablehnungspfad. Payload: `{ refusedServers: [{ name, transport, reason: 'budget_exhausted' }, ...], budget, liveCount, reservedCount, mode: 'enforce' }`. `mode` ist das wörtliche `'enforce'`, da der `warn`-Modus niemals ablehnt.

Beide Ereignisse befinden sich im SSE-Replay-Ring pro Sitzung (sie tragen ein `id`), sodass ein Client, der sich mit `Last-Event-ID` neu verbindet, über sie hinweg fortsetzt; der Snapshot bei `GET /workspace/mcp` bleibt die maßgebliche Quelle für den Zustand nach einer verlängerten Trennung. Immer aktiv, sobald beworben – es gibt keinen bedingten Schalter. Der SDK-Reducer-Zustand (`DaemonSessionViewState`) stellt `mcpBudgetWarningCount`, `lastMcpBudgetWarning`, `mcpChildRefusedBatchCount`, `lastMcpChildRefusedBatch` für Adapter bereit, die eine einfache Lag-basierte UI wünschen.

## Routen

Clients können `session_turn_status` per Feature-Detection ermitteln und `GET /session/:id/turns/current` oder `GET /session/:id/turns/:promptId` abfragen. Diese Routen erfordern die aktive besitzende Session und laden oder scannen niemals einen anderen Workspace. Abgeschlossene Ergebnisse sind best-effon Transcript-Aufzeichnungen, die aus dem aktiven Zweig mit einem begrenzten Scan gelesen werden; `prompt_not_found` bedeutet, dass kein Ergebnis in der Live-Warteschlange, im Terminal-Overlay mit 64 Einträgen oder im begrenzten aktiven Fenster gefunden wurde. `resultText` ist die rohe finale Antwort des Elternmodells nach der letzten Tool-Grenze, vor optionaler Nachrichtenumschreibung, und kann fehlen. Ergebnisse mit mehr als 32.768 UTF-16-Codeeinheiten enthalten `resultTruncated: true` und `resultCode: "RESULT_TEXT_TRUNCATED"`.

### `GET /health`

Liveness-Probe. Die Standardform gibt `200 {"status":"ok"}` zurück, wenn der Listener läuft – günstig, ohne Bridge-Zugriff, geeignet für hochfrequente Liveness-Probes in k8s/Compose.

Übergeben Sie `?deep=1` (akzeptiert auch `?deep=true` oder bloßes `?deep`) für eine Daemon-weite Probe, die Bridge-**Zähler** über jede verwaltete Workspace-Laufzeitumgebung aggregiert, einschließlich eines Workspaces, der noch entleert wird (nur informativ, keine echte Liveness-Prüfung):

```json
{
  "status": "ok",
  "workspaceCount": 2,
  "sessions": 3,
  "pendingPermissions": 1,
  "activePrompts": 1,
  "activeWork": true,
  "activeWorkReporting": "full",
  "activeWorkStaleMs": 4200,
  "connectedClients": 2,
  "channelAlive": true,
  "lastActivityAt": "2026-07-15T08:30:00.000Z",
  "idleSinceMs": 120000
}
```

`sessions`, `pendingPermissions` und `activePrompts` sind Summen. `activeWork` ist wahr, wenn irgendeine Laufzeitumgebung eine akzeptierte, aber nicht abgeschlossene Prompt hat (einschließlich einer FIFO-wartenden Prompt), einen laufenden Hintergrund-Agenten, eine wartende/in Bearbeitung befindliche Agent-Terminal-Benachrichtigung, Session-verwaltete Hintergrund-Shell- oder Workflow-Arbeit oder eine kind-owned Session-Runde. Die aggregierten `session`-Halte umfassen Ziel- und Cron-Verarbeitung, Historienänderungen sowie wartende oder laufende Monitor-Fortsetzungen; Vordergrund-Prompts bleiben Daemon-eigen. Laufende Monitore, Follow-up-Vorschläge und externe Prozesse, die die Shell-Registrierung nicht mehr verfolgen kann, bleiben außerhalb des Feldes. Es ist sessionbezogen: Kanalarbeit ohne zugeordnete Session – ein Spawn in Arbeit, eine ausstehende Wiederherstellung, MCP-Erkennung oder Authentifizierung – wird nicht gezählt, sodass `activeWork` falsch lesen kann, während der Daemon sich weigert, diesen Kanal freizugeben. Lesen Sie dieses Feld nicht als "der Daemon ist freigebbar"; es beschreibt nur session-eigene Arbeit. `activeWorkReporting` gibt an, wie viel dieser Booleschen tatsächlich gedeckt ist: `full`, wenn jede Live-Session durch einen frischen Bericht eines Kindes abgedeckt ist, das alle erforderlichen Kategorien meldet, `none`, wenn keine Session das Melden ausgehandelt hat, und `partial` für alles dazwischen – einschließlich eines veralteten Snapshots oder eines ausgehandelten Kindes, das eine erforderliche Kategorie auslässt. Ein Snapshot, der älter als drei Berichtsintervalle ist, zählt nicht mehr als Abdeckung: Er ist kein Bericht darüber, dass die Session im Leerlauf ist, daher liest sich die Session wieder als gehalten, genau so, als hätte das Kind nie berichtet. Gewöhnliche automatische Bereinigung ist auch für ein ausgehandeltes, aber unvollständiges Kind deaktiviert; ein Kind, das `shell` oder `session` nicht versteht, kann das bedingte Schließen gemäß dem vollständigen aktuellen Prädikat nicht sicher autorisieren. Komplett nicht unterstützte historische Kinder behalten das Legacy-Bereinigungs-Verhalten bei, und explizites Schließen, Beenden, Herunterfahren und Kanal-Exit bleiben Zwangsoperationen. `activeWorkStaleMs` ist das Alter des ältesten Snapshots, auf dem der Boolesche Wert beruht **unter den abgedeckten Sessions**, und ist `0`, wenn keine Session abgedeckt ist; es ist diagnostisch, da die Frische bereits vom Daemon in `activeWorkReporting` eingestuft wird (nur der Daemon kennt die ausgehandelte Kadenz jedes Kanals). Die Einstufung wird einmal über jede verwaltete Laufzeitumgebung berechnet, nicht pro Laufzeitumgebung und dann kombiniert – eine Laufzeitumgebung ohne Sessions ist vakuös vollständig, und dies als Beweis zu betrachten, würde es einem leeren Workspace erlauben, für nicht gemeldete Sessions eines anderen Workspaces einzustehen. `lastActivityAt` ist die letzte Nicht-Null-Workspace-Aktivitätszeit und `idleSinceMs` wird aus diesemselben Snapshot abgeleitet. `channelAlive` bedeutet, dass mindestens ein verwalteter Workspace-Kanal live ist; es bedeutet nicht, dass jeder Workspace gesund ist. `connectedClients` und das optionale `rateLimitHits` bleiben Daemon-weite Zähler statt Summen pro Workspace.

Neustart-Controller sollten den Daemon als beschäftigt betrachten, wenn:

```ts
const busy =
  health.activePrompts > 0 ||
  health.activeWork ||
  health.activeWorkReporting !== 'full';
```

Das Weglassen des dritten Terms macht `activeWork === false` ununterscheidbar von "kein Kind hat mir etwas gesagt", was der einzige Fall ist, in dem Handeln darauf unsicher ist. Unbekannte Antworten und fehlgeschlagene Probes müssen ebenfalls einen Neustart verhindern. `activePrompts` bleibt ein unabhängiges Kompatibilitätssignal.

Diese Felder sind ein Beobachtungs-Cache, kein Neustart-Lease: Selbst eine frische, vollständig eingestufte, leere Antwort beschreibt den Moment, in dem sie erfasst wurde, und Arbeit kann unmittelbar danach beginnen. Die obige Regel senkt das Risiko eines falschen Neustarts erheblich, eliminiert es aber nicht – strenge Sicherheit erfordert einen Prepare-Restart-Zaun, der die Zulassung neuer Arbeit stoppt, die Entleerung bestätigt und erst dann herunterfährt.

> ⚠️ Die Tiefenprüfung ist **informativ**, keine echte Liveness-Verifizierung oder ein atomarer Reclaim-Lease. Ausgehandelte ACP-Kinder veröffentlichen kanalweite Active-Work-Snapshots in einer ausgehandelten Kadenz, und der Daemon bewertet ihre Aktualität als `activeWorkReporting` — aber er beendet niemals einen Kanal aufgrund eines fehlenden Berichts, da die Stille einer Sitzung kein Beweis dafür ist, dass der Prozess gestorben ist. Transport-Liveness und Erkennung blockierter Agenten sind separate Mechanismen. `connectedClients` zählt REST-SSE-Verbindungen, nicht jeden ACP-Transport. Verwenden Sie wiederholte Stichproben und sauberes Herunterfahren für Idle-Reclamation; verwenden Sie authentifizierte `/daemon/status` für Transport- und Workspace-Diagnosen. Wenn ein Getter des verwalteten Runtimes eine Ausnahme auslöst, schlägt der Deep Health Check mit `503 {"status":"degraded","reason":"aggregation_failed"}` fehl (fail-closed), anstatt teilweise Summen zurückzugeben, und das Daemon-Log identifiziert den fehlerhaften Workspace-Runtime. Während des Bootstraps, bevor die Runtime-Registry bereit ist, gibt es `503 {"status":"degraded","reason":"bootstrap"}` mit `Retry-After: 1` zurück. Für Listener-Liveness verwenden Sie das Standard-`/health` ohne `?deep`.

**Auth:** Erforderlich bei Non-Loopback-Binds und wenn Loopback mit `--require-auth` gehärtet ist. Bei einem gewöhnlichen Loopback-Bind (`127.0.0.0/8`, `localhost`, `::1`, `[::1]`) wird `/health` vor dem Bearer-Middleware registriert, damit k8s/Compose-Probes innerhalb des Pods das Token nicht übertragen müssen. Bei Non-Loopback (`--hostname 0.0.0.0` usw.) oder gehärtetem Loopback wird die Route nach der Bearer-Middleware registriert und gibt 401 ohne gültiges Token zurück — andernfalls könnte ein nicht authentifizierter Aufrufer beliebige Adressen abtasten, um zu bestätigen, dass ein `qwen serve` existiert, ein Info-Leak mit geringer Schweregrad, der sich schlecht mit Port-Scanning kombinieren lässt. CORS-Deny + Host-Allowlist gelten weiterhin für die gewöhnliche Loopback-Ausnahme.

### `GET /daemon/update`, `POST /daemon/update/prepare`, and `POST /daemon/update/restart`

Diese authentifizierten Routen verwalten die Qwen Code-Installation des Daemons, unabhängig vom ausgewählten Workspace. Sie verwenden immer REST, auch von SDK-Clients mit einem ACP-Sitzungstransport. Die `daemon_update`-Funktion bewirbt das Protokoll; die Verfügbarkeit wird durch den zurückgegebenen Zustand bestimmt.

GET prüft auf Releases, ohne sie herunterzuladen oder zu aktivieren. Erfolgreiche Prüfungen werden 15 Minuten lang gecacht, Fehler eine Minute lang; `?refresh=true` fordert eine neue Prüfung an. Gleichzeitige Prüfungen teilen sich eine Suche. Die Antwort enthält `state` (`available`, `up-to-date`, `installing`, `ready`, `restarting`, `unavailable` oder `error`), `canInstall`, optionale `currentVersion` und `latestVersion` sowie optionale `instructions` und `message`. `currentVersion` identifiziert den laufenden Daemon, auch nachdem ein Update vorbereitet wurde. Nicht unterstützte Installationsmethoden können `available` mit `canInstall: false` und manuellen Anweisungen melden.

Automatische Updates erfordern einen echten CLI-Lebenszyklus mit POSIX `process.execve`, eine Standalone-Installation oder eine globale npm/pnpm/yarn/bun-Installation, die den veröffentlichten Launcher ausführt (ein root-besitzener npm-Prefix ist enthalten, da das Staging niemals in den globalen Prefix schreibt), und Betreiber-Einstellungen, die `general.enableAutoUpdate` erlauben. Eingebettete Server, Windows, nicht unterstützte Node-Runtimes und der Entwicklungsmodus melden `unavailable`. Nur globale/Systemeinstellungen gelten; Workspace-Einstellungen können die Installation nicht aktivieren. Die Verbindung muss den primären Listener und sein Daemon-Laufzeit-Token verwenden oder die explizit vertrauenswürdige Loopback-Bereitstellung ohne Token. Gekoppelte Browser und Local-Control-Verbindungen melden `unavailable`, da ihre Anmeldedaten oder ihr Listener einen Neustart nicht überleben würden; ihre Update-Mutationen geben `403 update_connection_unsupported` zurück.

Beide POST-Routen erfordern die Betreiber-Autorität des strengen Mutations-Gates für den Daemon und akzeptieren keine Parameter. Der Server wählt Release, Ziel und Launcher aus; Clients können keine Version oder keinen Befehl angeben.

- `POST /daemon/update/prepare` startet einen Hintergrund-Download und gibt `202` mit `state: "installing"` zurück. Es ändert die aktive Installation nicht. Poll GET, bis der Zustand `ready` ist; wiederholte Vorbereitungen teilen sich denselben Vorgang, und ein vorbereitetes Update gibt `200` zurück. Wenn kein automatisches Update verfügbar ist, gibt es `409 update_unavailable` zurück.
- `POST /daemon/update/restart` erfordert ein vorbereitetes Update, andernfalls gibt es `409 update_not_ready` zurück. Es antwortet mit `202` und `state: "restarting"` vor der Aktivierung des Updates, schließt den Daemon ordnungsgemäß und ersetzt den Prozess durch den aktualisierten Launcher. Wiederholte Klicks teilen sich einen Neustart. Nach der Antwort löst der Daemon das aktuelle Release einmal neu auf: Wenn es neuer als das vorbereitete ist und One-Click es abdeckt, wird das neuere Release gestaged und die vorbereitete Nutzlast verworfen, sodass ein langlebiger Daemon beim aktuellen neuesten Stand landet und nicht bei dem, was zum Zeitpunkt der ersten Vorbereitung aktuell war. Die neuere Nutzlast wird committet, bevor die ersetzte verworfen wird, und dieses Verwerfen erfolgt best-effort: Ein fehlgeschlagenes Verwerfen leckt Festplattenspeicher, hinterlässt aber nie die neuere Nutzlast als Waise oder fällt auf eine zurück, die möglicherweise halb entfernt ist. `latestVersion` meldet dann das neuere Ziel, während `state` auf `restarting` bleibt. Eine fehlgeschlagene Neuauswertung oder das Staging wendet stattdessen das vorbereitete Release an; der Klick wird durch einen Registry-Fehler nie auf der laufenden Version festgehalten. Der Ersatz behält PID, Arbeitsverzeichnis, CLI-Optionen, gebundenen Port und effektives Daemon-Token bei, löscht alte Versions-Pins und öffnet keinen Browser erneut. Der Client pollt GET, bis sich `currentVersion` ändert, und lädt dann das Dokument unter der URL neu, die bei der Anforderung des Updates erfasst wurde. Da das Staging nach dem `202` läuft und Minuten dauern kann, misst der Client seine Neustart-Frist anhand kontinuierlicher Unerreichbarkeit, nicht anhand des Klicks: Ein Daemon, der weiterhin antwortet, arbeitet noch. Eine großzügige absolute Obergrenze (20 Minuten) fängt einen Daemon ab, der erreichbar bleibt, aber `restarting` nie verlässt. Sie liegt über der gesamten Staging-Kette, nicht über einer einzelnen Timeout-Konstante: Ein Standalone-Archiv-Download versucht OSS und dann GitHub sequenziell mit einem Budget von jeweils fünf Minuten, und die Abrufe der Prüfsumme und Signatur addieren zwei weitere Minuten, sodass ein Restaging etwa zwölf Minuten für Download und Überprüfung vor der Aktivierung verbrauchen kann; das verwaltete npm-Kindprozess ist auf zehn Minuten begrenzt. Jeder Aufgabepfad hält einen wiederholbaren Eintrag auf dem Bildschirm, weil ein blockierter Daemon weiterhin `restarting` meldet, was die Steuerung sonst nicht anzeigt. Sobald der Neustart bestätigt ist, bleibt `restarting` haften, bis der Prozess ersetzt ist, sodass ein erreichbarer Daemon, der einen anderen Zustand mit unverändertem `currentVersion` meldet, bedeutet, dass der Ersatz nicht auf dem neuen Build gelandet ist; der Client stoppt das Warten, veröffentlicht diesen festen Zustand und meldet einen Fehler, anstatt ewig auf eine Versionsänderung zu warten. Diese Prüfung gilt nur für ein _initiiertes_ Polling nach der Bestätigung: Status- und Neustart-Anfragen sind unabhängig, sodass ein früher gestartetes Polling danach einen Snapshot vor dem Neustart liefern kann, und das Lesen als fester Daemon würde einen falschen Fehler melden und das Neuladen unterdrücken, das ein erfolgreiches Update dem Benutzer noch schuldet. Die Validierung des Standalone-Launchers läuft vor dem Schließen der Dienste; eine fehlgeschlagene Prüfung lässt den Daemon laufen. Fehler nach Beginn des Herunterfahrens oder während des Prozessersatzes sind nicht garantiert wiederherstellbar.

Web Shell prüft und bereitet verfügbare unterstützte Updates automatisch im Hintergrund vor und zeigt seine versionsnahe Update-Schaltfläche an, wenn ein vorbereitetes Update bereit ist oder wenn ein verfügbares Update manuelle Anweisungen enthält. Im Zustand der manuellen Anweisungen öffnet die Schaltfläche ein Popover mit den Anweisungen aus der Prüfung und bereitet oder startet niemals neu. Vorbereitung und Bereitschaft überstehen Neuladungen der Workspace-Laufzeitumgebung. Ein vorbereitetes Update legt sein Ziel fest: Das Polling-GET, einschließlich `?refresh=true`, meldet weiterhin das vorbereitete `latestVersion` und lädt niemals erneut herunter, sodass ein Daemon, der über mehrere Releases hinweg aktiv bleibt, keine Downloads im Hintergrund verschlingt. Nur der Neustart löst das Ziel erneut auf. Ein normales Herunterfahren des Daemons verwirft den vorbereiteten Download. Aktivierungsfehler halten den Daemon am Laufen und melden `error`; die nächste Prüfung nach Ablauf der einminütigen Fehler-Cache kann einen neuen Download für den Wiederholungsversuch vorbereiten. Das Deaktivieren automatischer Updates entfernt die Bereitschaft und räumt den Download auf, bevor ein Neustart beginnen kann. Sobald ein Neustart läuft, wird er nicht gestört: Während sich der Status in `restarting` befindet, geben Status-, Prepare- und Restart-Routen zurück, ohne die Operator-Einstellung zu konsultieren, und die Aufräumaktion beim Herunterfahren ist eine No-Op-Aktion, sodass ein Restaging, das Minuten dauert, nicht seinen Payload entzogen bekommen kann. Das Klicken auf die Schaltfläche im Ready-Zustand startet den gesamten Daemon explizit neu und unterbricht dessen aktive Sitzungen.

### `GET /daemon/status`

Schreibgeschützte Operator-Diagnose. Im Gegensatz zu `/health` ist dies eine normale Daemon-API: Sie wird nach Bearer-Authentifizierung und Ratenbegrenzung registriert, auch bei Loopback-Binds. Abfrageparameter:

- `detail=summary` (Standard) liest nur den In-Memory-Daemon-Status.
- `detail=full` enthält außerdem Live-Sitzungsdiagnosen, ACP-Verbindungsdiagnosen, Auth-Gerätefluss-Zählungen und Workspace-Statusabschnitte.
- Jedes andere `detail` gibt `400 { "code": "invalid_detail" }` zurück.

`summary` fragt absichtlich keine Workspace-Statusmethoden ab, startet kein ACP-Kind und erzeugt keine Sitzung. `full` fragt jeden Workspace-Abschnitt unabhängig voneinander ab; ein Timeout oder eine Ausnahme markiert nur diesen Abschnitt als `unavailable` und fügt ein `workspace_status_unavailable`-Problem hinzu.

Antwortformat:

```json
{
  "v": 1,
  "detail": "summary",
  "generatedAt": "2026-06-16T00:00:00.000Z",
  "status": "ok",
  "issues": [],
  "daemon": {
    "pid": 12345,
    "uptimeMs": 3600000,
    "mode": "http-bridge",
    "workspaceCwd": "/repo",
    "qwenCodeVersion": "0.18.1",
    "daemonId": "serve-..."
  },
  "security": {
    "tokenConfigured": true,
    "requireAuth": false,
    "loopbackBind": true,
    "allowOriginConfigured": false,
    "allowOriginMode": "none",
    "sessionShellCommandEnabled": false
  },
  "limits": {
    "maxRegisteredWorkspaces": 256,
    "maxChannelControlWorkspaces": 25,
    "maxSessions": 32,
    "maxTotalSessions": 800,
    "maxPendingPromptsPerSession": 5,
    "listenerMaxConnections": 256,
    "eventRingSize": 8000,
    "compactedReplayMaxBytes": 4194304,
    "promptDeadlineMs": null,
    "writerIdleTimeoutMs": null,
    "channelIdleTimeoutMs": 0,
    "sessionIdleTimeoutMs": 1800000,
    "acpConnectionCap": 64
  },
  "runtime": {
    "sessions": { "active": 0 },
    "permissions": { "pending": 0, "policy": "first-responder" },
    "channel": { "live": false },
    "channelWorker": {
      "enabled": false,
      "state": "disabled",
      "channels": []
    },
    "transport": {
      "restSseActive": 0,
      "acp": {
        "enabled": true,
        "connections": 0,
        "connectionStreams": 0,
        "sessionStreams": 0,
        "sseStreams": 0,
        "wsStreams": 0,
        "pendingClientRequests": 0
      }
    },
    "perf": {
      "eventLoop": { "meanMs": 0, "p50Ms": 0, "p99Ms": 0, "maxMs": 0 },
      "promptQueueWait": {
        "count": 0,
        "meanMs": 0,
        "maxMs": 0,
        "lastMs": null
      },
      "pipe": {
        "inbound": { "count": 0, "totalBytes": 0, "maxBytes": 0 },
        "outbound": { "count": 0, "totalBytes": 0, "maxBytes": 0 }
      }
    },
    "activity": {
      "activePrompts": 0,
      "pendingPrompts": 0,
      "queuedPrompts": 0,
      "lastActivityAt": null,
      "idleSinceMs": null
    }
  }
}
```

Multi-Workspace-Antworten enthalten auch oberste `workspaces[]`-Zeilen mit `{ id, cwd, displayName?, primary, trusted }`. Der optionale Anzeigename wird weggelassen, wenn er nicht gesetzt ist, und bleibt rein presentationsbezogen; Statusverbraucher müssen weiterhin `id` oder `cwd` verwenden, um Laufzeitumgebungen zu korrelieren.

`runtime.perf` ist optional. Wenn vorhanden, meldet es nur Event-Loop-Lag des Daemon-Prozesses, Prompt-FIFO-Warteschlangen-Wartezeit-Stichproben und Daemon-Kind-Pipe-Byte-Zähler; ACP-Kind-Event-Loop-Lag ist in `/daemon/status` nicht enthalten.

`status` ist `error`, wenn irgendein Problem eine Fehler-Schwere hat, `warning`, wenn irgendein Problem eine Warnungs-Schwere hat, andernfalls `ok`. Problemcodes sind stabil und umfassen `session_capacity_high`, `connection_capacity_high`, `pending_permissions`, `acp_channel_down`, `preflight_error`, `mcp_budget_warning`, `mcp_budget_exhausted`, `rate_limit_hits`, `channel_worker_exited`, `channel_worker_partial_connect`, `channel_restore_failed` und `workspace_status_unavailable`. Im kurzen Zeitfenster, nachdem der Listener bereit ist, aber bevor die vollständige Laufzeitumgebung gemountet wurde, kann `/daemon/status` `daemon_runtime_starting` melden; wenn das asynchrone Mounten der Laufzeitumgebung fehlschlägt, meldet es `daemon_runtime_failed`, während Nicht-Status-Laufzeitumgebungs-Routen `503` zurückgeben.

`runtime.activity` meldet die Prompt-Aktivität auf Daemon-Ebene. `activePrompts` zählt Sitzungen mit einem laufenden Prompt. `pendingPrompts` zählt alle akzeptierten Prompts, die noch nicht abgeschlossen sind, einschließlich des laufenden Prompts und der im FIFO-Modus wartenden Prompts. `queuedPrompts` zählt die im FIFO-Modus wartenden Prompts, die akzeptiert, aber noch nicht dispatcht wurden. `lastActivityAt` ist der ISO 8601-Zeitstempel des letzten Prompt-Starts/-Endes oder der letzten Sitzungserstellung; `null`, wenn der Daemon seit dem Start keine Aktivität verarbeitet hat. `idleSinceMs` wird zum Zeitpunkt der Antwortgenerierung aus `lastActivityAt` berechnet.

`limits.memory` ist additiv und meldet die aufgelösten Speicherwerte des Daemons: ein erforderliches `enforced: false`, ein `childHeap`-Objekt (`mode`: `off`, `observe` oder `admit`; `admissionEnforced`, wahr nur für verwaltete `admit`; `maxConcurrentChildren` und `perChildCeilingMb`, beide `null` unter `mode: 'off'`, was nichts modelliert — und `perChildCeilingMb` zusätzlich `null`, wo innerhalb von `modeled.minChildHeapMb` keine Partition modelliert werden kann — entweder kann der Pool ein Kind auf dieser Untergrenze nicht abdecken, oder die Obergrenze würde darunter fallen, wenn sie bei `modeled.legacyChildCeilingMb` gedeckelt wird, was `floor(available / 2)` ist und daher auf einem Host unter 1024 MB unter die Untergrenze fällt. Es ist niemals 0, und `maxConcurrentChildren` ist in diesen Fällen `0`, da ein Host, der keine Partition modelliert, eine berechnete Antwort ist und kein fehlendes Modell; und `refusals`, die Starts, die das modellierte Limit überschritten hätten), `configuredBudgetMb`, `effectiveBudgetMb` (der konfigurierte Wert, gedeckelt durch den aufgelösten cgroup/Host-Speicher), `budgetSource` (`flag` / `derived`), `availableMemoryMb`, `availableMemorySource` (`constrained` / `host`), `insufficientMemory` und ein `modeled`-Objekt mit `rootReserveMb`, `childPoolMb`, `minChildHeapMb`, `maxChildHeapMb` und `legacyChildCeilingMb` (ein konservatives Modell der Obergrenze, die ein ACP-Kind heute erhält, die unter dem tatsächlichen Wert liegen kann). `runtime.memory` meldet zusätzlich `registeredWorkspaces` (die Registrierungsanzahl — nicht entfernte Workspace-Einträge, einschließlich drainender, übergehender oder blockierter Einträge; keine Live-Kind-Anzahl), `activeAcpChildren` (Daemon-verwaltete ACP-Kinder mit einem aktiven, nicht sterbenden Kanal — schließt Übergangs- oder Blockierteinträge ein, aber schließt einen Workspace aus, dessen Kill gestartet wurde, auch wenn das Kind noch nicht beendet ist; keine Kanal-Worker, MCP-Nachfahren oder nicht zugeordnete Reservierungen), `childRssCoverage` (`active_children` — jedes ACP-Kind mit einem aktiven Kanal, was die Menge ist, die `activeAcpChildren` zählt; ältere Daemons senden `primary_only`), ein unten beschriebenes `children`-Objekt und ein `modeled`-Objekt mit `recommendedShareAtRegisteredMb` (`null`, wenn kein Workspace registriert ist) und `recommendedShareAtActiveMb` (`null`, wenn kein Kind aktiv ist). Jeder Anteil ist auf die Legacy-Kind-Obergrenze gedeckelt und nur dann auf die minimale Kind-Heap-Untergrenze festgelegt, wenn die Obergrenze dies zulässt — auf einem kleinen Host liegt die Obergrenze unter der Untergrenze, sodass Anteil × Anzahl den Kind-Pool überschreiten kann. Lesen Sie einen Anteil als Empfehlung, nicht als Partition des Pools. Die Größe des Kind-Heaps bleibt empfehlend: Kein Argument beim Kind-Start leitet sich aus diesen Werten ab. Opt-in `admit` erzwingt die modellierte Anzahl gleichzeitiger Kinder, während das Standardverhalten `observe` nur hypothetische Ablehnungen protokolliert. `runtime.memory.committedAcpChildren` zählt verwaltete ACP-Reservierungen und angehängte Kinder, einschließlich beendender Kinder bis zur Registrierungsfreigabe; es ist `null`, wenn die verwaltete Registrierung nicht verfügbar ist. `childHeap` modelliert eine feste Partition von `modeled.childPoolMb` — jedes Kind würde denselben `perChildCeilingMb` erhalten, sodass die modellierte Gesamtmenge innerhalb des Pools bleibt, anstatt sich wie ein pro-Start-Anteil anzusammeln. Lesen Sie `refusals` nur als Zulassungsdruck: Eine Anzahl von 0 bedeutet **nicht**, dass die Partition sicher angewendet werden kann, da Kinder auf der viel größeren hostabgeleiteten Obergrenze laufen, sodass eine Arbeitslast, die mehr alten Speicherplatz benötigt als `perChildCeilingMb`, hier gesund ist und erst fehlschlagen würde, wenn die Partition angewendet würde. Zwei weitere Gründe, warum eine ungleich Null Anzahl nicht unbedingt Kapazitätsdruck bedeutet: Die Zulassungsentscheidung zählt ein beendendes Kind, bis es beendet ist, sodass bei einem Daemon, der bereits `maxConcurrentChildren` erreicht hat, jeder Kanalersatz während des Überlappungsfensters eine Ablehnung bucht; und auf einem Host, der zu klein ist, um eine Partition zu modellieren, ist `maxConcurrentChildren` `0`, sodass `refusals` der gesamten ACP-Startanzahl entspricht, wobei `insufficientMemory` das Feld ist, das dies erklärt. In `admit` schlägt ein Modell mit null Slots den Start fehl. Ein vollständig verwalteter Daemon, der vor einer Erschöpfung der Kapazität steht, kann ein am längsten nicht verwendetes leeres ACP ohne aktive Sitzungen oder ausstehende Arbeiten zurückfordern, auf die verfolgte Freigabe warten und dann die Zulassung einmal erneut versuchen, bevor er startet. Geladene Sitzungen bleiben geschützt; Workspace-Registrierung und gespeicherter Verlauf bleiben erhalten. Der Zähler `refusals` zählt abgelehnte Zulassungsversuche, einschließlich einer anfänglichen Ablehnung, gefolgt von einer erfolgreichen Rückforderung, nicht endgültige benutzersichtbare Fehler. Erschöpfte Kapazität gibt REST HTTP 503 mit `code: "acp_child_capacity_exhausted"`, `maxConcurrentChildren` und `committedAcpChildren` zurück (ohne die abgelehnte Reservierung), ohne `Retry-After`. ACP JSON-RPC verwendet `-32603` mit `data.errorKind`, der diesen Code trägt, `data.httpStatus: 503` und dieselben Zähler. Ein verifizierter Standalone-Erstellungs-Rollback vor dem Dispatch behält `standalone_creation_rolled_back`, seine Sitzungs-ID und Wiederholbarkeit bei und verschachtelt den Kapazitätscode und die Zähler unter `capacity`; unsichere Erstellungsergebnisse behalten ihre bestehenden Wiederherstellungssemantiken bei. Clients sollten automatische Kapazitätswiederholungen stoppen und den Entwurf oder die ausgewählte Sitzung für manuelle Wiederholungen beibehalten. Auf dem normalen Pfad `runQwenServe` wird das Budget aufgelöst, bevor die Bootstrap-App erstellt wird, sodass `limits.memory` während des Bootstrap-Fensters bereits gefüllt ist. Es ist nur auf Pfaden `null`, die kein Budget auflösen (wie Direct-Embed, das `runQwenServeImpl` umgeht). Der SDK-Typ erlaubt `null`, sodass korrekte Clients damit umgehen können.

`runtime.memory.children` ist innerhalb dieses Blocks additiv und meldet die aggregierte RSS über die Kinder, die `childRssCoverage` nennt: `rssBytes` (deren summierte selbst gemeldete RSS), `sampled` (wie viele einen Messwert geliefert haben) und `oldestReadingAgeMs` (das Alter der ältesten Messung in der Summe, damit ein Aufrufer erkennen kann, wie weit auseinander ihre Teile aufgenommen wurden). Der Nenner für `sampled` ist das Geschwisterfeld `activeAcpChildren`, nicht wiederholt im Block; wenn `sampled` niedriger ist, ist `rssBytes` eine Untergrenze statt einer Gesamtsumme. Das Sampling ist an einen aktiven SSE/WS-Watcher gebunden, sodass eine Statusanfrage an einen Daemon, von dem niemand streamt, `sampled: 0` meldet, selbst wenn lebende Kinder vorhanden sind — `activeAcpChildren` daneben macht diese Lücke sichtbar, und `rssBytes: 0` mit `sampled: 0` bedeutet nie einen gemessenen Wert von null. `oldestReadingAgeMs` ist `null`, wenn nichts gesampelt wurde und auch, wenn jeder Beitragende eine Bridge ist, die vor diesem Feld existierte, sodass es nie "aktuell" bedeutet. Lesen Sie die Summe gleichzeitig als Überzählung und Unterzählung: Die Summierung der prozessweisen RSS doppelt gezählt Seiten, die sich die Kinder teilen, während jedes Kind nur seinen eigenen Prozess meldet, sodass seine MCP-Nachfahren und jeder Kanal-Worker fehlen. Es ist nicht der Speicher des Daemon-Baums. Das Feld ist im SDK-Mirror optional, da Daemons, die `primary_only` melden, es nie senden.

`runtime.memory.children.heap` ist innerhalb dieses Blocks additiv und meldet die lebenszeitbezogenen Höchststände der V8-Alten-Generation jedes ACP-Kindes, aggregiert als **Maximum, nicht als Summe**: `peakOldGenerationBytes`, `peakLiveSetBytes`, `peakTotalHeapBytes`, `majorGcCount`, `majorGcMs`, `unclassifiedSpaceNames` und `reported`. Eine Heap-Obergrenze gilt pro Kind, und die Spitzen wurden zu unterschiedlichen Zeiten erreicht, daher würde eine Gesamtsumme keine Frage beantworten; jedes Feld ist ein unabhängiges Maximum über die meldenden Kinder hinweg, kein Porträt eines einzelnen Kindes, und eine Obergrenze pro Kind wird gegen jede Achse für sich beurteilt. `reported` zählt, wie viele von `sampled` beigetragen haben, und ist niedriger, wenn einige Kinder vor den Feldern existierten. Jede Byteangabe deckt die **Alte Generation** ab — was `--max-old-space-size` tatsächlich begrenzt — und nicht nur `old_space`, da ein Kind seine Obergrenze erschöpfen kann, während `old_space` bei wenigen Megabytes liegt und `large_object_space` alles enthält. `peakOldGenerationBytes` sind committete Bytes und steigen mit der dem Kind zugewiesenen Obergrenze, lesen Sie es daher als obere Grenze dessen, was die Workload benötigt, nicht als deren Anforderung; `peakLiveSetBytes` ist das, was einen Major-GC überlebt und sich nicht mit der Obergrenze bewegt, was es zur Zahl macht, die aussagen kann, dass ein Kind nicht hineinpasst; lesen Sie es als obere Grenze statt als exakten Live-Satz, da GC-Einträge asynchron eintreffen und alles, was zwischen der Bereinigung und dem Lesen allokiert wurde, gezählt wird. `peakLiveSetBytes` ist `0` bis ein Major-GC beobachtet wird, was eine Abwesenheit ist, keine Messung. `unclassifiedSpaceNames` ist die Vereinigungsmenge der Heap-Räume, die kein meldendes Kind klassifizieren konnte; V8 benennt Räume zwischen Versionen um und fügt neue hinzu, ein unbekannter Raum wird aus den Summen entfernt, und das Entfernen führt zu einer Unterzählung — ein nicht-leeres Array bedeutet also, dass die Byteangaben unvollständig sind und nicht als vollständige Messung gelesen werden dürfen. Das gesamte Objekt ist `null`, niemals ein auf Null gesetztes Objekt, wenn kein stichprobenartig erfasstes Kind eines gemeldet hat; ohne angehängten SSE/WS-Watcher wird gar nichts stichprobenartig erfasst, dies ist also ein Routinezustand, kein Randfall. Alles davon ist beobachtend: Hier wird nichts dimensioniert, keine Spawn-Aktion verweigert oder `limits.memory.enforced` von `false` verschoben.

`runtime.memory.pressure` ist innerhalb dieses Blocks additiv und meldet den eigenen Speicherdruck des Daemon-Roots: `mode` (`off` / `observe`), `level` (`normal` / `soft` / `hard` / `critical`), `source` (`rss` / `heap` / `unknown`), `ratio` sowie die sechs Rohwerte, aus denen die Verhältnisse stammen — `rssBytes`, `rssRatio`, `availableBytes`, `heapUsedBytes`, `heapRatio`, `heapLimitBytes`. `ratio` ist der größere Wert von `rssRatio` und `heapRatio`, und `source` gibt an, welcher es war; Gleichstände werden als `rss` gemeldet. `availableBytes` ist `limits.memory.availableMemoryMb` in Bytes — absichtlich der erkannte cgroup-/Host-Wert statt `effectiveBudgetMb`, denn was den Prozess beendet, ist das reale Limit, nicht die Policy-Zahl des Operators. `source: "unknown"` bedeutet, dass weder Nenner messbar war, und darf nicht als gesund interpretiert werden; `level` ist in diesem Fall nur deshalb `normal`, weil es nichts zu klassifizieren gibt. Die Werte decken **nur den Daemon-Root-Prozess** ab: Es sind die eigenen `memoryUsage()` dieses Prozesses, sodass wachsende Kinder sie nicht verschieben. `runtime.memory.children` meldet diese separat, und keiner der Werte ist Prozessbaum-Speicher. Beide Modi melden den gesamten Block; nur `observe` hebt zusätzlich die pfadfreie `daemon_memory_pressure`-Warnung in das Status-Rollup, sodass `off` das oberste `status` unverändert lässt. In keinem Modus wird remediiert. Das Feld ist im SDK-Mirror optional, da Daemons, die `runtime.memory` vor seiner Existenz ausgeliefert haben, den Block ohne es senden.

`limits.maxRegisteredWorkspaces` ist additiv und meldet das aufgelöste Cap für Benutzerregistrierungen (Standard 256, konfigurierbar von 1 bis 256). `limits.maxChannelControlWorkspaces` meldet das unabhängige Cap für Control-/Recovery-Owner von 25 beim Standard-Daemon, auch wenn Kanäle deaktiviert sind. Custom-Controller werben dieses Feld nur an, wenn sie es durchsetzen. Diese Felder sind sowohl in Bootstrap- als auch in Ready-Antworten vorhanden; ältere Daemons können sie weglassen. Der Kanal-Controller lehnt Übergangs-Owner-Vereinigungsmengen über seinem Cap mit `409 channel_control_workspace_limit_reached` ab, bevor Kandidaten-Worker konstruiert werden; eine anfängliche Boot-Zeit-Vereinigungsmenge über dem Cap lässt den Start fehlschlagen, bevor der Listener veröffentlicht wird, hat also keine HTTP-Oberfläche. Die Registrierungskapazität bestimmt nicht den SDK-Kanal-Timeout.

`limits.maxTotalSessions` ist additiv. `null` bedeutet, dass das effektive daemonweite Cap für frische Sitzungen deaktiviert ist. Wenn die aufgelöste Registrierungskapazität (Standard 256, konfigurierbar über `QWEN_SERVE_MAX_WORKSPACES` oder eingebettetes `maxRegisteredWorkspaces`) 25 überschreitet und `--max-total-sessions` weggelassen wird, verwendet der Standard-Daemon eine feste Gesamtzahl von 800, selbst bei einem Startup-Workspace. Bei Registrierungskapazitäten von 25 oder weniger leiten mehrere Startup-/Wiederherstellungs-Workspaces mit endlichem `maxSessionsPerWorkspace` die effektive Gesamtzahl einmalig als `maxSessionsPerWorkspace * workspaceCount` über derselben Anzahl aus Startup plus Wiederherstellung ab; ein einzelner Startup- oder Wiederherstellungs-Workspace behält ein unbegrenztes Standardverhalten. Explizite Gesamtlimits, einschließlich deaktivierter Werte, haben Vorrang. Spätere dynamische Registrierungen berechnen die Gesamtzahl nicht neu. Direkte `createServeApp`-Einbettungen müssen ihre eigene gemeinsame Zulassungsrichtlinie bereitstellen. Wenn gesetzt, begrenzt es die Erstellung frischer Sitzungen daemonweit und meldet Fehler aufgrund von Gesamtlimits mit dem bestehenden `session_limit_exceeded`-Fehlerformat plus `scope: "total"`.

`runtime.channel.live` meldet den ACP-Bridge-Kanal innerhalb des Daemons. Es ist nicht der Kanal-Adapter-Worker. Daemon-verwaltete Kanäle nutzen `runtime.channelWorker`, dessen `state` eines von `disabled`, `starting`, `running`, `exited`, `failed` oder `stopped` ist. Wenn ein Worker `running` erreicht und dann beendet wird, hält `/daemon/status` den Daemon online und meldet den Warnungs-Problemcode `channel_worker_exited`.

Der Start von Daemon-verwalteten Kanal-Workern durch eine explizite `qwen serve --channel ...` bleibt Fail-Fast und hat Vorrang vor persistierten Starteinstellungen. Ein Boot ohne Flag stellt `serve.channels` aus jedem vertrauenswürdigen registrierten Workspace wieder her, wobei jeder die Liste in seinen eigenen Workspace-scope-Einstellungen beisteuert. Die wiederhergestellten Namen bilden eine Auswahl, deren Besitzer wie üblich aufgelöst werden, wobei der Workspace, der einen Namen aufgelistet hat, einen sonst mehrdeutigen Besitzerkonflikt bricht. Diese Boot-Zuordnung besteht so lange, wie der Daemon läuft: Ein `PUT /workspace/channel`, das einen solchen Namen wieder aktiviert, löst ihn so auf, wie es beim Boot geschah, selbst nachdem die Auswahl dazwischen gestoppt wurde. Ein Name, den ein Nicht-Primär-Workspace beigesteuert hat, wird verworfen, mit einem Log, der ihn identifiziert, wenn er nicht aufgelöst werden kann, damit ein veralteter Eintrag eines Workspaces die anderen nicht blockiert; ein Name, den der Primär-Workspace aufgelistet hat, lässt die gesamte Wiederherstellung scheitern, unabhängig davon, ob ein anderer Workspace ihn ebenfalls auflistet. `all` bleibt primär-only: Es wird ignoriert und anderswo gemeldet.

Ein vertrauenswürdiger Nicht-Primär-Workspace, der nach dem Boot registriert wird, stellt auch sein eigenes `serve.channels` wieder her, indem er die Kanal-Laufzeitumgebung lädt und das Kanal-Service-Lease reserviert, falls nichts anderes dies getan hat. Diese Wiederherstellung:

- geschieht **einmal pro Daemon-Lauf** — aufgezeichnet, sobald der Workspace irgendetwas anfordert — sodass eine spätere Entfernung und erneute Registrierung oder eine Neu-Materialisierung des Vertrauens nicht rückgängig macht, was ein Operator getan hat, der einen dieser Kanäle dazwischen gestoppt hat;
- geschieht nicht unter einer expliziten `--channel`-Auswahl, die kein später registrierter Workspace erweitert;
- geschieht nicht, nachdem `DELETE /workspace/channel` das Hosting eingestellt hat, bis ein `PUT /workspace/channel` eine Auswahl erneut bestätigt oder der Daemon neu gestartet wird;
- lässt eine bestätigte `all`-Auswahl unverändert;
- fügt die Namen dieses Workspaces in einer Änderung der bestätigten Auswahl hinzu, wobei jeweils nur eine späte Wiederherstellung durchgeführt wird. Im Gegensatz zum Startvorgang, bei dem ein nicht hostbarer Name verworfen und der Rest beibehalten wird, führt ein nicht zuordenbarer Name dazu, dass die gesamte Liste des Workspaces nicht wiederhergestellt wird, wobei der Fehler protokolliert und wie unten beschrieben gemeldet wird.

Die Registrierung wartet überhaupt nicht auf die Kanalsteuerung. Die Wiederherstellung wird in der Spur für die Kanalsteuerung eingereiht und die Antwort geschrieben, ohne darauf zu warten; dasselbe gilt für den Abgleich, der durch eine Registrierung oder Vertrauensänderung für Kanäle ausgelöst wird, die der Daemon bereits hostet. Ein Worker, der nie bereit wird, verzögert daher nur die dahinter eingereihte Kanalarbeit, niemals eine andere Registrierung oder einen Vertrauensabgleich. Die Kehrseite ist, dass ein `201` von `POST /workspaces` nicht bedeutet, dass die Kanäle dieses Workspaces aktiv sind oder dass ein bereits gehosteter Kanal, der ihm gehört, seinen Neustart abgeschlossen hat; lesen Sie `GET /workspace/channel` für weitere Informationen.

Ohne explizite Auswahl, eine `serve.channels`-Wiederherstellung beim Start oder eine Registrierung wie oben bleibt das Laden der Kanal-Laufzeit lazy (verzögert).

Gespeicherte Startnamen dürfen nicht leer sein, keinen führenden oder abschließenden Leerzeichen enthalten und keine unsicheren Steuer- oder unsichtbaren Zeichen enthalten. Ungültige Einträge werden einzeln übersprungen und anhand des Array-Index protokolliert; der Startvorgang trimmt sie nicht in andere Instanzennamen um und schreibt Einstellungen nicht neu. Worker-Argumente verwenden `--channel=<value>`, wobei ein führendes Minuszeichen als Teil des Namens erhalten bleibt.

Ein ungültiges Startfeld oder ein Validierungs- oder Lease-Fehler vor dem Start der Worker überspringt die automatische Wiederherstellung, mit einem Log-Eintrag, der `serve.channels` identifiziert, während unrelated Einstellungen wirksam bleiben. Ein fehlgeschlagener Worker-Start erlaubt dem Daemon fortzufahren, nachdem die Bereinigung erfolgreich war. Globale Laufzeit-Start-Timeouts und unbestätigte Worker-Stops folgen dem bestehenden Pfad für Startfehler; der Lease bleibt gehalten, solange die Worker-Beendigung unbestätigt ist. Das Kanalmanagement meldet persistierte Starteinstellungen und tatsächlichen Laufzeitstatus.

Einige `serve.channels`-Namen, die der Daemon nicht hochgefahren hat, werden gemeldet statt nur protokolliert. Solch ein Name tritt nie der bestätigten Auswahl bei, sodass kein Worker-Snapshot ihn enthält. Drei Fälle werden gemeldet:

- eine konfigurierte Startauswahl, deren Worker nicht starten konnte, auf dem Startpfad, der den Daemon ohne seine Kanäle am Laufen hält;
- ein Name, den der Boot-Besitzauflöser während der Zuordnung zu einem Workspace verworfen hat, gemeldet gegen jeden Workspace, der ihn auflistete;
- jeder Name, der nach einer fehlgeschlagenen späten Registrierungswiederherstellung noch immer nicht gehostet wird.

Sie erscheinen an zwei Stellen:

- `/daemon/status` meldet eine `channel_restore_failed`-Warnung pro Workspace, wobei jeder Kanal mit seinem Fehler benannt wird. Dies ist die vollständige Oberfläche und ist auch in der Bootstrap-Antwort vorhanden, die die einzige ist, die existiert, während Boot-Aufzeichnungen geschrieben werden. Maximal 64 Kanäle werden pro Workspace benannt, jeder Name auf 128 Zeichen begrenzt, mit `and <n> more` wenn die Liste länger ist;
- die `GET /workspaces/:workspace/channels` dieses Workspaces listet den Kanal mit `runtime: { state: "error", lastError }` anstelle von `stopped` auf, wobei `lastError` der eigene Startfehler des Adapters ist, wenn der Worker einen für diesen Kanal gemeldet hat, andernfalls der Fehler des Versuchs. Diese Oberfläche wird aus dem eigenen Kanal-Einstellungsbereich des Workspaces aufgebaut, kann also nur einen Namen tragen, den dieser Bereich definiert – ein Name, den kein registrierter Workspace konfiguriert, oder einer, dessen Konfiguration in einem anderen Workspace liegt, hat hier keine Zeile und wird nur auf `/daemon/status` gemeldet.

Alles andere, was einen `serve.channels`-Namen ungehostet lässt, wird nur im Daemon-Log diagnostiziert: ein Name, der verloren ging, weil die gesamte Liste unlesbar oder ungültig war, eine Liste eines Nicht-Primär-Workspaces, die verworfen wurde, weil der Primäre `all` auswählte, eine späte Wiederherstellung, die übersprungen wurde, weil die bestätigte Auswahl `all` ist, und die Liste eines Remote-(SSH)-Workspaces. Prüfen Sie Daemon-Logs dafür.

Ein Bericht bleibt bestehen, bis der Kanal gehostet wird – von diesem Workspace oder durch eine spätere Wiederherstellung von einem anderen –, bis sein Workspace nicht mehr registriert ist oder bis ein Operator handelt: `POST` Start, Stop oder Neustart auf dem Kanal, `PUT`/`DELETE /workspace/channels/:name` oder ein `PUT`/`DELETE /workspace/channel`, der die Auswahl ändert. `PUT /workspace/channels/:name/startup` löscht ihn nicht: Es überschreibt `serve.channels`, ohne etwas über den fehlgeschlagenen Versuch zu sagen. Der Bericht wird im Speicher gehalten: Ein neu gestarteter Daemon stellt erneut wieder und meldet, was dieser Versuch getan hat. Der Fehlertext ist credential-redacted (Anmeldedaten entfernt) und begrenzt, so wie das Daemon-Log ihn rendert.

Nachdem ein Worker bereit erreicht hat, werden unerwartete Beendigungen vom Serve-Supervisor innerhalb einer begrenzten Richtlinie neu gestartet: bis zu 3 Neustartversuche in einem 5-Minuten-Fenster, mit Backoff von 1s, dann 5s, dann 15s. Der Worker sendet IPC-Heartbeats alle 15s; wenn kein Heartbeat für 45s beobachtet wird, behandelt der Supervisor den Worker als stale (veraltet), tötet ihn, protokolliert `staleHeartbeatAt` und nutzt denselben Neustartpfad.

`runtime.channelWorker` kann additive operative Felder enthalten: `requestedChannels`, `pid`, `startedAt`, `exitCode`, `signal`, `error`, `restartCount`, `lastExitAt`, `lastRestartAt`, `nextRestartAt`, `lastHeartbeatAt`, `staleHeartbeatAt`, `startupFailures` und `startupFailuresTruncated`. Jeder Startfehler weist `channel`, `phase` (derzeit `connect`), ein optionales vom Adapter bereitgestelltes `code` sowie eine durch Zugangsdaten geschützte `message` auf. Für die aktuelle Worker-Generation werden maximal 64 Fehler gespeichert; das Kürzungsflag zeigt an, dass weitere Fehler beobachtet wurden. `code` ist diagnostischer Natur und keine stabile adapterübergreifende Klassifizierung. `restartCount` ist die Anzahl der Neustartversuche, die dieser Serve-Prozess im gesamten Lebenszyklus unternommen hat; ein laufender Worker mit `restartCount > 0` ist gesund, sofern kein anderes Problem vorliegt. Ein laufender Worker, dessen `requestedChannels` Namen enthält, die in `channels` fehlen, meldet `channel_worker_partial_connect`.

Bei einem Daemon mit mehreren Arbeitsbereichen (wiederholtes `--workspace`) enthält `runtime` zusätzlich `channelWorkers[]` – einen Eintrag pro besitzendem Arbeitsbereich, jeweils ein `channelWorker`-Snapshot, annotiert mit `workspaceId`, `workspaceCwd` und `primary`. `channelWorker` bleibt als Snapshot des primären Arbeitsbereichs zur Kompatibilität gefüllt. Daemons mit einem einzelnen Arbeitsbereich lassen `channelWorkers[]` weg.

### Daemon-gesteuerte Kanalsteuerung

Die `channel_control`-Funktion bewirbt die Ressource für die Laufzeitauswahl. Die Ressource ist daemonweit gültig, obwohl ihr Kompatibilitätspfad das Singularpräfix `/workspace` verwendet. Laufzeitauswahlen werden nicht persistiert und ändern die Option `--channel` des Daemons beim Start nicht.

`GET /workspace/channel` gibt einen unveränderlichen Manager-Snapshot zurück:

```json
{
  "enabled": true,
  "selection": { "mode": "names", "names": ["telegram", "feishu"] },
  "pendingSelection": { "mode": "names", "names": ["telegram"] },
  "transition": "reconciling",
  "workers": [
    {
      "workspaceId": "primary-id",
      "workspaceCwd": "/work/primary",
      "primary": true,
      "enabled": true,
      "state": "running",
      "channels": ["telegram"],
      "pid": 1234
    }
  ]
}
```

`selection` ist `null`, wenn deaktiviert. `pendingSelection` ist nur während einer Mutation vorhanden. `transition` ist eines von `idle`, `starting`, `reconciling`, `stopping` oder `rolling_back`.

`PUT /workspace/channel` ist streng getornt und akzeptiert genau eine Auswahl:

```json
{ "selection": { "mode": "all" } }
```

```json
{ "selection": { "mode": "names", "names": ["telegram", "feishu"] } }
```

Namen werden gekürzt und dedupliziert, ohne Sortierung; ein leeres Namensarray ist ungültig. `all` bleibt auf den primären Arbeitsbereich beschränkt. Eine Änderung von deaktiviert zu aktiviert gibt `201` zurück; ein idempotenter PUT oder eine Ersetzung gibt `200` zurück. Die Antwort ist `{ changed, replaced, partial, state }`. Eine gleiche Auswahl hält gesunde Worker am Platz, stellt aber eine gleiche Auswahl wieder her, deren Worker gestoppt oder fehlgeschlagen ist.

`DELETE /workspace/channel` ist streng geregelt und idempotent. Es gibt `{ changed, state }` zurück; ein erfolgreicher Zustand ist deaktiviert. `POST /workspace/channel/reload` ist ebenfalls streng geregelt, liest Einstellungen neu, löst Arbeitsbereichsgruppen erneut auf und erzwingt die Abstimmung der festgelegten Auswahl. Es gibt `409 channel_worker_not_enabled` zurück, wenn deaktiviert. Die `channel_reload`-Funktion wird dynamisch nur dann beworben, wenn der Manager eine festgelegte, nachladbare Auswahl hat.

Jedes Aktivieren, Ersetzen, Nachladen, Stoppen und Herunterfahren des Daemons tritt in eine FIFO-Lifecycle-Spur ein. GET wartet nicht auf diese Spur. Arbeitsbereichsgruppen, deren geordnete Auswahl sich nicht geändert hat, bleiben online. Ersetzungsfehler versuchen, neu gestartete Worker zu stoppen und die vorherige festgelegte Auswahl wiederherzustellen. Clients müssen `rolledBack`, `rollbackError` und `state` prüfen, da auch Bereinigung oder Wiederherstellung fehlschlagen können. Der Daemon hält die PID-Lease des Kanal-Dienstes während einer Transaktion und gibt sie erst frei, wenn jeder relevante Kindprozess-Exit bestätigt wurde.

Stabile Steuerungsfehler sind:

- `400 invalid_channel_selection`, `channel_workspace_mismatch` oder `ambiguous_channel_workspace`
- `403 untrusted_workspace`
- `409 channel_service_conflict`, `channel_worker_not_enabled` oder `channel_control_workspace_limit_reached`
- `500 channel_worker_stop_failed`
- `502 channel_worker_start_failed` mit `rolledBack` und einem optionalen zugangsdatenbereinigten `rollbackError`
- `503 daemon_draining`

Strenge Schreibvorgänge von einer tokenlosen primären Anfrage, die das Gate ohne vertrauenswürdige Loopback-Autorität erreicht, geben `401 token_required` zurück, bevor Steuerungscode ausgeführt wird. Fehlende oder ungültige konfigurierte Zugangsdaten und ungepaarte Local-Control-Zugangsdaten werden früher mit einfachem `401 Unauthorized` abgelehnt. Vertrauenswürdige Loopback-primäre Anfragen werden normal ausgeführt. Sobald eine Anfrage beginnt, bricht das Trennen des HTTP-Clients die Lifecycle-Transaktion nicht ab; Clients können denselben PUT sicher wiederholen.

Für `502 channel_worker_start_failed` kann die Antwort auch `startupFailures[]` und `startupFailuresTruncated` enthalten. Jeder Fehler fügt die vertrauenswürdige `workspaceCwd` des versuchten Workers hinzu. Diese Felder beschreiben die fehlgeschlagene Transaktion, während `state` den aktuellen Zustand nach dem Rollback beschreibt; ein späteres GET behält den fehlgeschlagenen Versuch nicht bei. Ein teilweise verbundener Worker gibt stattdessen Erfolg zurück und legt seine Fehler im Worker-Snapshot offen. Ein expliziter `--channel`-Start ohne verbundenen Adapter lässt den Start fehlschlagen. Ein aus Einstellungen abgeleiteter Startfehler wird protokolliert und erlaubt dem Daemon fortzufahren, nachdem die Bereinigung erfolgreich war, unterliegt jedoch dem globalen Timeout für den Laufzeitstart. Wenn die Bestätigung der Bereinigung fehlschlägt, bleibt das normale Verhalten bei Startfehlern und die Service-Lease erhalten.

`qwen channel status` ohne `--daemon-url` liest weiterhin Metadaten der Pidfile; mit `--daemon-url` liest es `GET /workspace/channel`. Während eines Neustartfensters bleibt die serve-eigene Pidfile reserviert, aber `workerPid` wird weggelassen, damit Clients keinen veralteten Worker-Prozess anzeigen. Bei einem Daemon mit mehreren Arbeitsbereichen trägt die Pidfile auch ein additives `workers[]`-Array (pro Arbeitsbereich `workspaceId` / `workspaceCwd` / `channels` / live `workerPid`), während das oberste Level `channels` (Vereinigungsmenge) und `workerPid` (primär) für ältere Leser gefüllt bleiben; Daemons mit einem einzelnen Arbeitsbereich behalten die ursprüngliche Form mit einem einzigen Worker bei. Stdout/Stderr des Workers werden in das Daemon-Log weitergeleitet, wobei Bearer-Tokens, sensible Worker-Umgebungswerte und Proxy-URL-Zugangsdaten geschwärzt werden.

### Verwaltung von Workspace-Kanälen

Die `channel_management`-Funktion bewirbt arbeitsbereichsbezogene Kanal-Konfiguration und Laufzeitverwaltung. Die Singular-Routen `/workspace` zielen auf die primäre Laufzeit. `/workspaces/:workspace` löst die exakte registrierte, vertrauenswürdige Laufzeit auf und fällt niemals auf die primäre Laufzeit zurück.

Die schreibgeschützte Erkennung verwendet:

- `GET /workspace/channel-types`
- `GET /workspace/channels`
- `GET /workspace/channels/events`
- `GET /workspaces/:workspace/channel-types`
- `GET /workspaces/:workspace/channels`
- `GET /workspaces/:workspace/channels/events`

`GET .../channels/events` gibt das Event-Journal des aufgelösten Workspace-Kanals als `{ "events": [...], "truncated": boolean }` mit `Cache-Control: no-store` zurück, plus ein optionales `channelLinkMeta`-Mitglied: eine Zuordnung vom Kanalinstanznamen zu nicht-geheimen Link-Metadaten (`type` und `baseUrl`, jeweils nur vorhanden, wenn als String konfiguriert, und für GitHub-Kanäle ein aufgelöstes `webOrigin` — der Web-UI-Ursprung, den Clients direkt konkatenieren sollten, anstatt ihn aus dem API-Stamm neu abzuleiten). Die Metadaten werden aus den zusammengeführten System-, Benutzer- und Workspace-Einstellungen aufgelöst, mit denen die Kanal-Worker laufen — die verwaltungsseitige Auflistung auf Scope-Ebene enthält keine Kanäle, die in einem anderen Scope konfiguriert sind — und gefiltert auf Kanäle, deren aufgelöstes `cwd` zum abgefragten Workspace gehört, sodass ein Workspace niemals die Kanal-Metadaten eines anderen Workspaces erhält. Es ermöglicht Clients, Journalzeilen zu verknüpfen (z. B. einen GitHub-PR- oder Issue-Verweis), auch für Kanäle, die von Benutzer- oder Systemeinstellungen geerbt wurden. Das Mitglied wird vollständig weggelassen, wenn kein Kanal aufgelöst wird, und ältere Daemons senden es nie; ein Fehler beim Lesen der Einstellungen führt dazu, dass es fehlt, statt das Lesen des Journals fehlschlagen zu lassen. Jedes Ereignis protokolliert, was ein Kanal getan hat — eine eingehende Nachricht, die er akzeptiert oder übersprungen hat (mit der maschinellen Begründung: `reason_filter`, `mention_required`, `duplicate`, eine Absender-Gate-Ablehnung, `github_api_error`), einen GitHub-Thread, dessen Verarbeitung fehlgeschlagen ist und den er erneut lesen wird (`failed` mit `github_api_error`: ein GitHub-Fehler oder ein lokaler Fehler, während der Kanal seinen eigenen Zustand nicht lesen oder schreiben kann oder eine der Thread-Aufgaben unvollständig ist), ein Veröffentlichungsergebnis, eine Übergangsaufgabe bei Eingang oder ein Polling-Ergebnis — und trägt niemals Nachrichtentext. Ein GitHub-Polling, das mehr als 20 Benachrichtigungen filtert, protokolliert die ersten 20 einzeln und eine weitere `reason_filter`-Zeile, deren `detail.filtered` den Rest zählt, damit ein angehefteter Polling-Cursor das Journal nicht mit Wiederholungen desselben Stapels überflutet. Während der Cursor gehalten wird, wird ein Kommentar, den das Polling erneut liest, einmal pro Fenster als `duplicate` oder `mention_required` protokolliert, und ein fehlschlagender Thread als `github_api_error` bei seinem ersten fehlgeschlagenen Polling im Fenster und bei jedem zehnten fehlgeschlagenen Polling (ein Ratenlimit- oder Anmeldeinformationsfehler: sein erstes und jedes zehnte Polling), sowie einmal, wenn er übersprungen wird. Die Zeilen, die einmal pro Fenster protokolliert werden, werden unter bis zu 8.192 Schlüsseln verfolgt; eine Zeile, deren Schlüssel nicht mehr passt, wird bei jedem Polling protokolliert. Abfrageparameter: `limit` (1-500, Standard 100), `type` (durch Komma getrennte `inbound`, `outbound`, `task`, `poll`), `channel` (den Parameter einmal pro Instanzname wiederholen) und `since` (ISO 8601). Die Route benötigt keine Betreiberberechtigung. Journal-Lesevorgänge sind asynchron und begrenzt: das aktuelle Journal plus eine rotierte Datei pro Kanal, 256 KiB pro Datei, 4 MiB pro Anfrage, 32 Dateien pro Anfrage, neueste zuerst. Link-Metadaten lesen zusätzlich synchron einen nebenwirkungsfreien Snapshot der zusammengeführten Einstellungen (ein paar kleine JSON-Dateien, aufgelöst gegen die effektive Umgebung der Laufzeitumgebung); es ist eine Best-Effort-Dekoration, daher lässt jeder Fehler das Mitglied weg, statt das Lesen des Journals fehlschlagen zu lassen. `truncated` ist wahr, wenn das Datensatzlimit oder eine Lesebegrenzung das Ergebnis beschnitten hat, einschließlich eines Journals, das höher ist als das Endfenster pro Datei. Ein Workspace ohne Journal gibt eine leere Liste zurück; ein Verzeichnis auf Scope-Ebene, das nicht gelesen werden kann, antwortet mit 5xx statt einer leeren Liste.

Der Katalog markiert die Typen, die von dieser Verwaltungs-API unterstützt werden, mit `manageable: true`. Instanz-Snapshots enthalten eine Revision, redigierte Geheimnis-Vorhandenseins-Metadaten, Startzustand und Laufzeitstatus; buchstäbliche Geheimnisse werden niemals zurückgegeben. Kanal-Snapshots verwenden `Cache-Control: no-store`.

Feldbeschreiber können verschachtelte Objekt-Metadaten über `properties` offenlegen. Numerische Beschreiber können `exclusiveMinimum` für eine offene Untergrenze und `maximum` für eine inklusive Obergrenze verwenden. Eine gespeicherte Zahl außerhalb einer neu deklarierten Grenze wird weiterhin akzeptiert, wenn der Client sie unverändert erneut sendet, sodass das Deklarieren einer Grenze keine unbeteiligten Bearbeitungen eines vorhandenen Kanals blockiert; ein Wert, den der Client tatsächlich geändert hat, muss beide Grenzen erfüllen. String- und Geheimnis-Beschreiber können `multiline` verwenden, um Clients nach einem mehrzeiligen Textbereich zu fragen; die Beschreibertypen erlauben dies nur bei Feldern auf oberster Ebene. Clients, die einen beworbenen Feldtyp nicht rendern, müssen seinen vorhandenen Konfigurationswert beibehalten, anstatt ihn zu erzwingen oder zu löschen, und ein Client, der ein `multiline`-Feld in einer einzeiligen Steuerung rendert, muss den gespeicherten Wert wortwörtlich beibehalten, anstatt seinen eingegebenen Wert ohne Zeilenumbrüche zurückzuschreiben. Objekt-Felder können nicht erforderlich sein, und verschachtelte Eigenschaften können keine Geheimnisse oder per Umgebungsvariablen auflösbare Felder sein; diese Verwaltungsprotokolle bleiben nur auf oberster Ebene. Eine verschachtelte `required`-Eigenschaft wird nur durchgesetzt, solange ihr Elternobjekt im Schreibvorgang vorhanden ist; das Weglassen des Elternobjekts lässt seine verschachtelten Anforderungen ungeprüft. Schreibvorgänge ersetzen den gespeicherten Wert jedes Felds vollständig, daher bedeutet das Beibehalten eines Objekts, das gespeicherte Objekt erneut zu senden; der Daemon führt keine Teilobjekte zusammen.

Konfigurationsschreibvorgänge verwenden optimistische Nebenläufigkeit und das strenge Gate für Betreiberberechtigungen:

- `PUT /workspace/channels/:name`
- `DELETE /workspace/channels/:name`
- `PUT /workspace/channels/:name/startup`
- die entsprechenden `/workspaces/:workspace/...`-Routen

Jede Einstellungsänderung enthält `expectedRevision`. Upsert-Anfragen enthalten ein `config`-Objekt und können explizite Geheimnisoperationen enthalten: `preserve`, `replace` oder `clear`. Eine Kanal-Konfiguration kann kein Arbeitsverzeichnis außerhalb des aufgelösten Workspaces auswählen.

Laufzeitaktionen sind streng geregelt `POST`-Anfragen an `.../channels/:name/start`, `stop` oder `restart`. Sie wirken nur auf den Worker, der dem aufgelösten Workspace gehört.

Das Pairing-Management ist nur für Instanzen verfügbar, die mit der `pairing`-Sender-Richtlinie oder Gruppen-Richtlinie konfiguriert sind:

- `GET .../channels/:name/pairing-requests`
- `POST .../channels/:name/pairing-requests/approve` mit `{ "code": "..." }`
- `GET .../channels/:name/pairing-approvals`
- `DELETE .../channels/:name/pairing-approvals` mit entweder `{ "senderId": "..." }` oder `{ "groupId": "..." }`

Alle Pairing-Routen erfordern strenge Operator-Autorität und verwenden `Cache-Control: no-store`. Anfragen, Genehmigungen und Widerrufe sind auf die ausgewählte Channel-Instanz und den Workspace beschränkt. Ausstehende Anfragen enthalten einen typisierten Benutzer- oder Gruppen-Subjekt; Gruppenanfragen behalten auch den Absender bei, der die Anfrage initiiert hat. Genehmigungssnapshots enthalten `senderIds` und `groupIds`, da Allowlists keine Anzeigenamen speichern. Das Widerrufen eines unbekannten Benutzers oder einer Gruppe gibt `404 channel_pairing_approval_not_found` zurück.

### Kanal-Zustellung und Notify zurück

`channel_delivery` bewirbt sofortige, best-effort Zustellungsunterstützung. Es ist eine Protokollfähigkeit, kein Signal für die Worker-Gesundheit. Die Zustellung startet niemals einen fehlenden Worker, fällt nicht auf einen anderen Workspace zurück, wiederholt sich nicht, speichert keine Outbox und spielt keine historischen Benachrichtigungen nach.

Direktes Notify umgeht Agent und Session und wartet auf einen Sendeversuch:

```http
POST /workspace/notify
POST /workspaces/:workspace/notify
Authorization: Bearer <token>
Content-Type: application/json

{
  "text": "service unavailable",
  "delivery": {
    "kind": "channel",
    "target": {
      "channelName": "dingtalk",
      "type": "user",
      "id": "platform-user-id"
    }
  }
}
```

Beide Routen verwenden das strenge Mutations-Gate. Die qualifizierte Route löst nur einen registrierten, vertrauenswürdigen Workspace auf. Erfolg ist `200 {delivered:true,deliveryId}`. `delivered:true` bedeutet, dass das Channel-Send-Promise aufgelöst wurde; es beweist weder die Akzeptanz durch den Anbieter noch den Empfang durch den Benutzer oder eine Lesebestätigung. Anbieterspezifische Antwortvalidierung und konsistente Fehlergrund-Semantik über IM-Adapter hinweg liegen außerhalb dieses V1-Vertrags. Fehler sind `400 channel_delivery_invalid`, `503 channel_worker_unavailable` oder `channel_delivery_queue_full`, `504 channel_delivery_timeout` sowie `502 channel_delivery_rejected` oder `channel_delivery_failed`. Ein Timeout hat ein unbekanntes Ergebnis und wird nicht wiederholt. Es gibt absichtlich keinen separaten Konnektivitätstest-Endpunkt: Ein normaler Notify-Aufruf ist der End-to-End-Test.

Das wiedergebbare Ergebnis-Ereignis enthält nur Korrelation und bereinigten Status:

```json
{
  "type": "channel_delivery_result",
  "promptId": "prompt-1",
  "data": {
    "sessionId": "session-1",
    "deliveryId": "prompt-1",
    "source": "prompt",
    "status": "failed",
    "promptId": "prompt-1",
    "code": "channel_worker_unavailable",
    "error": "Channel worker is not running."
  }
}
```

Ein leerer erfolgreicher Prompt-Final lässt Fehlerfelder aus:

```json
{
  "type": "channel_delivery_result",
  "promptId": "prompt-1",
  "data": {
    "sessionId": "session-1",
    "deliveryId": "prompt-1",
    "source": "prompt",
    "status": "skipped",
    "promptId": "prompt-1"
  }
}
```

`source` ist `prompt` oder `scheduled`; `status` ist `delivered`, `failed` oder `skipped`. `skipped` bedeutet, dass der berechtigte Turn erfolgreich abgeschlossen wurde, aber sein letzter Tool-freier Assistent-Antwortblock leer oder nur aus Leerzeichen bestand. Der Daemon verbraucht die Zustellungsautorisierung und veröffentlicht das Ereignis, ohne einen Channel-Worker aufzulösen. Die geplante Korrelation verwendet `taskId` und `firedAt`. Das Ereignis enthält niemals Ziel-IDs, Nachrichtentexte, Anmeldedaten oder Webhook-Geheimnisse.

Sicherheit: Die Antwort enthält niemals Bearer-Tokens, Client-IDs, vollständige ACP-Verbindungs-IDs, Device-Flow-Benutzer-Codes oder Verifizierungs-URLs. Beide Detailstufen können additive `daemon.runId`, `daemon.logMode` und `daemon.logHealth` enthalten. `summary` lässt den Daemon-Logpfad und Verlustdetails weg; `full` kann `logPath`, `logIssues`, `logDroppedRecords` und `logDroppedBytes` für authentifizierte Operatoren enthalten. Degradiertes Datei-Logging fügt dem normalen Status-Rollup die pfadfreie `daemon_log_degraded`-Warnung hinzu.

### `GET /capabilities`

```json
{
  "v": 1,
  "protocolVersions": {
    "current": "v1",
    "supported": ["v1"]
  },
  "mode": "http-bridge",
  "features": [
    "health",
    "daemon_status",
    "capabilities",
    "multi_workspace_sessions",
    "..."
  ],
  "limits": {
    "maxRegisteredWorkspaces": 256,
    "maxChannelControlWorkspaces": 25,
    "maxPendingPromptsPerSession": 5,
    "maxSessionsPerWorkspace": 32,
    "maxTotalSessions": 800,
    "sessionRestoreTimeoutMs": 60000
  },
  "modelServices": [],
  "workspaceCwd": "/canonical/path/to/primary-workspace",
  "workspaces": [
    {
      "id": "stable-workspace-id",
      "cwd": "/canonical/path/to/primary-workspace",
      "primary": true,
      "trusted": true
    },
    {
      "id": "stable-secondary-workspace-id",
      "cwd": "/canonical/path/to/secondary-workspace",
      "displayName": "Payments Production",
      "primary": false,
      "trusted": true
    }
  ]
}
```

Stabiler Vertrag: Wenn `v` erhöht wird, hat sich das Frame-Layout auf eine rückwärtsinkompatible Weise geändert.

> **`protocolVersions`** beschreibt die Serve-Protokollversionen, die der Daemon sprechen kann. `current` ist die bevorzugte Protokollversion des Daemons und `supported` ist die kompatible Menge. Clients, die ein spezifisches Protokoll erfordern, sollten `supported` prüfen; funktionsspezifische UI sollte weiterhin auf `features` zugreifen. Additiv zu v=1: Ältere v=1-Daemons lassen dieses Feld weg, daher sollten SDK-Clients, die auf ältere Builds abzielen, es als optional behandeln.

> **`modelServices` ist in Stage 1 immer `[]`.** Der Agent nutzt seinen einzelnen Standard-Modellservice und enumeriert ihn nicht über das Netzwerk. Stage 2 wird dies aus registrierten Modelladaptern befüllen, damit SDK-Clients Service-Auswahlmenüs erstellen können; bis dahin verlassen Sie sich NICHT darauf, dass dieses Feld nicht leer ist.

> **`workspaceCwd`** ist der kanonische absolute Pfad für den primären Workspace des Daemons. Verwenden Sie ihn, um `cwd` bei `POST /session` wegzulassen (die Route fällt auf diesen primären Pfad zurück) und alte Einzel-Workspace-Clients kompatibel zu halten. Additiv zu v=1: Pre-§02 v=1-Daemons lassen das Feld weg — Clients, die auf ältere Builds abzielen, sollten vor der Verwendung null-checken.

> **`workspaces[]`** listet jede registrierte Laufzeitumgebung auf. Neuere Einzel-Workspace-Daemons schließen die primäre Laufzeitumgebung ein, selbst wenn `multi_workspace_sessions` fehlt, damit Clients die stabile ID entdecken können, die von workspace-qualifizierten Routen benötigt wird; ältere Daemons können das Array weglassen. Jeder Eintrag ist `{ id, cwd, displayName?, primary, trusted, removable? }`. `displayName` ist nur zur Darstellung gedacht und wird weggelassen, wenn nicht gesetzt. Der erste/primäre Workspace bleibt durch `workspaceCwd` gespiegelt; neue Clients wählen eine nicht-primäre Laufzeitumgebung, indem sie die `cwd` dieses Eintrags an `POST /session` übergeben. Nicht vertrauenswürdige Workspaces werden zur Diagnose angezeigt, lehnen aber die Erstellung neuer Sitzungen mit `403 untrusted_workspace` ab, bis sich das Vertrauen ändert. `removable` ist bei Daemons vorhanden, die die Entfernung von Laufzeitumgebungen unterstützen, und ist nur für prozessdynamische oder wiederhergestellte sekundäre Laufzeitumgebungen wahr.

> **`session_worktree_persistence_v1`** bedeutet, dass der Daemon die Eigentümerschaft von Part 4A Worktrees persistieren und verifizieren kann. Erfolgreiche Antworten auf die Erstellung von Worktrees sowie Wiederherstellungsantworten, deren Kind entweder im Leerlauf verschoben wurde oder bereits den verifizierten Worktree-cwd meldet, tragen `worktree` Metadaten plus `worktreeState: "persisted-v1"`. Eine Legacy-Best-Effort-Wiederherstellung oder eine Kaltwiederherstellung, deren Wiederherstellungsaufforderung ausgelöst statt geparkt wurde (`suppressWorktreeContextRestore` aus, sodass die Route die Bridge nach keiner Verschiebung fragte) und die daher eine aktive Aufforderung ohne aktuellen cwd meldet, kann immer noch `worktree` ohne diese Bescheinigung zurückgeben. Clients, die Isolation anfordern, müssen dieses Tag vorab prüfen und jede Antwort verifizieren; das `worktree` Objekt allein ist kein Nachweis für dauerhafte Eigentümerschaft.

> **`session_worktree_reset_v1`** bedeutet, dass der Daemon die Übertragung der Worktree-Eigentümerschaft unterstützt: `POST /session/:id/worktree-reset` verschiebt die Checkout-Eigentümerschaft einer persistierten Worktree-Sitzung auf eine frische Ersatzsitzung. Wiederherstellungsantworten erhalten drei typisierte 409-Klassifikationen neben diesem: `worktree_session_superseded` (die Sidecar der Sitzung trägt einen `supersededBy` Link — die Klassifikation wird allein aus diesem Link entschieden, bevor irgendein Marker gelesen wird, und der Link wird geschrieben, bevor der Marker kippt, daher ist der `replacementSessionId` im Body eine Weiterleitung zur Überprüfung, kein Beweis für Eigentümerschaft: In einem unterbrochenen Zustand vor dem Commit benennt er eine Sitzung, die nicht der Markerbesitzer ist, nicht selbst wiederhergestellt werden kann und vom wiederholten Reset eingesammelt wird), `worktree_marker_missing` (der Checkout-Marker fehlt; setzen Sie die Aufgabe zurück, um ihn neu zu erstellen — ein Wiederherstellungsversuch kann dies nicht, da kein Wiederherstellungspfad einen Marker schreibt), und `worktree_reset_interrupted` (eine vorherige Übertragung stürzte mitten im Flug ab, wobei ihre Sidecar-Links übereinstimmten; wiederholen Sie den Reset). Die unterbrochene Klassifikation wird zuerst geprüft: Ein fehlender Marker, dessen `supersedes`/`supersededBy` Links übereinstimmen, erscheint als `worktree_reset_interrupted`, niemals als `worktree_marker_missing`. Siehe unten den Abschnitt zur Route für das Übertragungsprotokoll und die Fehler-Taxonomie.

Die Workspace-Funktions-Tags und `workspaces[]` sind dynamisch. Clients, die einen Workspace hinzufügen, müssen `/capabilities` erneut abrufen, nachdem die Mutation abgeschlossen ist; der Daemon sendet keine Fähigkeitsänderungen an Clients, die eine frühere Antwort gecacht haben. Das Vergessen der Persistenz entlädt keine aktive Laufzeitumgebung, sodass diese Laufzeitumgebung bis zum Neustart weiterhin angezeigt wird.

### `GET /brand`

Das Produkt-Branding der Web Shell für Hosts, die die Shell white-labeling möchten. Aufgelöst aus `ui.brand` in den Operator-Einstellungsbereichen. Gated durch das `web_shell_brand` Funktions-Tag; ein Daemon ohne die Route antwortet mit 404.

```json
{
  "name": "QiuQiu Code",
  "logoDataUri": "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%2F%3E"
}
```

> **Beide Felder sind optional, und `{}` ist eine normale Antwort.** Ein fehlendes Feld bedeutet "verwenden Sie die eingebaute Marke des Clients" — die Web Shell rendert ihren eigenen Namen und ihr eigenes Inline-Logo. Clients dürfen einen leeren Body nicht als Fehler behandeln.

> **Der Handler antwortet immer mit 200, auch wenn das konfigurierte Logo abgelehnt wurde.** Eine fehlende Datei, ein Symlink, eine hardverlinkte Datei, ein Verzeichnis, ein Nicht-SVG-Dokument oder Inhalte über 32 KiB führen zu einem Body ohne `logoDataUri`, und der Grund wird in den stderr des Daemons als `qwen serve: GET /brand: ui.brand.logoPath …` geschrieben. Ein Client kann daher nicht zwischen "kein Brand konfiguriert" und "das Logo des Operators wurde abgelehnt" unterscheiden; der Kanal für den Operator ist das Daemon-Log. Eine Warnung ist weniger streng als eine Ablehnung, und es gibt zwei davon: ein Root-`<svg>` ohne nutzbaren `viewBox` und ohne positive, nicht-prozentuale `width`/`height` (ein fehlerhaftes oder nullflächiges viewBox zählt als unbrauchbar), das der Browser bei fester Seitenleistenbreite möglicherweise leer rendert; und ein Präfix-gebundener Root, dessen unprefixed Elemente keine Default-Namespace-Bindung haben, was sie unsichtbar macht. Middleware vor dem Handler antwortet, bevor er überhaupt ausgeführt wird — `401`, wenn Bearer-Auth erforderlich aber nicht vorhanden ist, `429`, wenn der optionale Rate Limiter aktiviert ist. Ein drainender Daemon lehnt diese Route nicht ab: Der Rate Limiter ist während des Drains permissiv, sodass der Handler weiterhin 200 antwortet, bis der Listener schließt und der Client einen Verbindungsfehler sieht. Der Start ist auf dieser Route kein 503: Auf dem Standard-Pfad für verzögerte Laufzeitumgebung wird die Anfrage _gehalten_, bis die Laufzeitumgebung bereit ist, und dann mit 200 beantwortet, sodass ein kurzer Client-Timeout frühzeitig feuern kann. Ein 503 mit `code: "daemon_runtime_starting"` erreicht diese Route nur bei Konfigurationen, die antworten, bevor die Laufzeitumgebung bereit ist (z. B. `--open`) und ist wiederholbar; ein 503 mit `code: "daemon_runtime_failed"` ist endgültig, bis der Daemon neu startet, und enthält kein `Retry-After` — versuchen Sie es nicht erneut.

> **Workspace-Einstellungen tragen niemals dazu bei.** Die Route lädt Einstellungen mit `skipWorkspaceSettings`, sodass die `.qwen/settings.json` eines Repositorys weder den Produktnamen ändern noch eine Datei benennen kann, die der Daemon liest und in jeden verbundenen Browser inline einfügt. Nur System Defaults, User und System werden gelesen, in dieser Reihenfolge der Vorrangigkeit. Aus demselben Grund wird ein Brand-Wert mit einer Warnung im stderr des Daemons abgelehnt, wann immer die Platzhalterersetzung ihn ändern würde: Die Ersetzung bezieht sich auf die prozessweite Umgebung, die durch die `.qwen/.env` oder `env`-Blöcke eines Workspace beim Booten zuerst gefüllt wird. Ein nicht auflösbarer Platzhalter (die Variable ist nicht gesetzt) wird wörtlich beibehalten, sodass ein Tippfehler in einer Variablen als literal Text erscheint, anstatt stillschweigend zurückzufallen.

> **`logoDataUri` muss als Bild gerendert werden, niemals als Markup injiziert.** Der Daemon bereinigt das gelesene SVG nicht. SVG, das über ein `img` src oder einen favicon href geladen wird, kann Skript ausführen; SVG, das in das Dokument injiziert wird, kann das. Die Web Shell weist es nur einem Bildkontext zu, und diese Invariante macht die Abwesenheit eines Sanitizers sicher.

> **Prozess-global.** Die Route nimmt keinen Workspace-Selektor und keine Session-ID entgegen: Der Wert leitet sich von der benutzerglobalen Konfiguration ab, ist also für jeden Workspace, den der Daemon bedient, gleich. Er wird nach `bearerAuth` und dem Rate Limiter registriert und vor dem Web Shell SPA-Fallback, sodass er JSON für jeden `Accept` Header beantwortet.

### `POST /workspaces`

Registrieren Sie eine zusätzliche Workspace-Laufzeitumgebung. Der Pfad muss ein vorhandenes, zugängliches, absolutes Verzeichnis sein, das keinen anderen registrierten Workspace dupliziert oder verschachtelt. Die Registrierung ist prozesslokal, es sei denn, der Client sendet `persist: true`; Clients müssen `persistent_workspace_registration` vor der Anforderung der Persistenz prüfen. Wenn `workspace_display_name` beworben wird, kann die Anfrage auch ein optionales `displayName` enthalten.

Wenn `git_workspace_clone` beworben wird, akzeptiert dieselbe Route auch `{ "kind": "git", "url": "...", "target": "/absolute/new/path" }`. Dieses Formular erfordert ein absolutes `target`, das noch nicht existiert, startet einen asynchronen Clone, registriert nichts und gibt `202 { "kind": "git-workspace-clone", "jobId": "..." }` zurück. Die Antworten `201` und `200` unten beschreiben die synchronen `cwd` und `scratch` Formulare; das git-Formular registriert nichts, und der Fortschritt und Abbruch des Clones verwenden `GET`/`DELETE /workspace-git-clone-jobs/:jobId`.

```json
{
  "cwd": "/canonical/path/to/secondary-workspace",
  "persist": true,
  "displayName": "Payments Production"
}
```

Eine neu erstellte Laufzeitumgebung gibt `201` zurück; die Hochstufung eines bereits aktiven sekundären Workspaces auf persistent gibt `200` zurück. Erfolg bei Persistenz umfasst `persisted: true`:

```json
{
  "id": "stable-workspace-id",
  "cwd": "/canonical/path/to/secondary-workspace",
  "displayName": "Payments Production",
  "primary": false,
  "trusted": true,
  "persisted": true
}
```

`displayName` muss eine Zeichenkette sein, die nach dem Trimmen umliegender Leerzeichen nicht länger als 256 Zeichen ist. Ein leeres Ergebnis wird als kein Name behandelt, und interne C0 (`U+0000`–`U+001F`)- oder DEL (`U+007F`)-Steuerzeichen werden abgelehnt. JSON `null` ist kein Erstellungswert und gibt `400 invalid_display_name` zurück; lassen Sie das Feld weg, um keinen initialen Namen anzugeben. Duplizierte Anzeigenamen sind erlaubt. Ein Name, der mit einer prozesslokalen Registrierung angegeben wird, gilt nur für diesen Daemon-Prozess; `persist: true` speichert ihn zusammen mit der persistenten Registrierung, damit er nach einem Neustart wiederhergestellt werden kann. Das Wiederholen der Anfrage für einen bereits persistenten Workspace ist idempotent und benennt ihn nicht um.

Fehler umfassen `400 invalid_path` / `invalid_persist_flag` / `invalid_persist_target` / `invalid_display_name`, `409 workspace_exists` / `workspace_nested` / `workspace_limit_reached` / `workspace_registration_store_too_large`, `500 workspace_registration_store_error` / `runtime_creation_failed` und `501 persistence_not_available` / `not_implemented`.

### `PATCH /workspaces/:workspace`

Aktualisieren Sie eine aktive Workspace-Ressource, ausgewählt nach Workspace-ID oder URL-kodiertem absoluten cwd. Der Endpunkt unterstützt derzeit nur Metadaten für Anzeigenamen:

```json
{ "displayName": "Payments Production" }
```

Senden Sie `{ "displayName": null }`, um den Namen zu löschen. Hier ist `null` ein Löschsentinel nur für Aktualisierungen; Nicht-Null-Werte folgen denselben String-Normalisierungsregeln wie `POST /workspaces`. Die Antwort ist die aktualisierte `{ id, cwd, displayName?, primary, trusted, removable? }` Workspace-Projektion. Laufzeitmetadaten werden immer aktualisiert. Wenn die Laufzeitumgebung passende persistente Registrierungsidentitäten hat, wird jeder Alias atomar über den bestehenden Schema-v1-Registrierungsspeicher aktualisiert; der Endpunkt erstellt oder fördert niemals eine persistente Registrierung.

Nicht unterstützte Felder schlagen fehl, anstatt stillschweigend ignoriert zu werden. Fehler umfassen `400 empty_patch` / `invalid_display_name` / `unsupported_field` / `workspace_mismatch`, `409 workspace_registration_in_progress`, `500 workspace_registration_store_error` und `503 daemon_shutting_down`.

### `DELETE /workspaces/:workspace`

Entfernen Sie eine entfernbare sekundäre Laufzeitumgebung. Der Selektor folgt den Routing-Regeln für mehrere Workspaces und akzeptiert entweder eine Workspace-ID oder ein URL-kodiertes absolutes cwd. Der optionale JSON-Body ist `{ "force": boolean }`; das Weglassen fordert eine Nicht-Force-Entfernung an.

Die Nicht-Force-Entfernung gibt `409 workspace_busy` mit einer `activity` Momentaufnahme zurück, wenn die eingefrorene Laufzeitumgebung Sitzungen, Prompts, ausstehende Starts, ACP-Verbindungen, Speicheraufgaben oder Workspace-Kanal-Worker hat. Das Senden von `{ "force": true }` fordert die Beendigung dieser Ressourcen an. Die Entfernung der Persistenz ist der Commit-Punkt: Die anschließende Bereinigung ist begrenzt und best-effort, Bereinigungsfehler werden protokolliert, und die logische Entfernung konvergiert dennoch, anstatt die Laufzeitumgebung wiederherzustellen. Eine erfolgreiche Antwort ist:

```json
{
  "removed": true,
  "workspaceId": "stable-workspace-id",
  "workspaceCwd": "/canonical/path/to/secondary-workspace",
  "forced": true,
  "persistedRegistrationRemoved": true,
  "activity": {
    "sessions": 2,
    "activePrompts": 1,
    "pendingSessionStarts": 0,
    "acpConnections": 1,
    "memoryTasks": 0,
    "channelWorkers": 0,
    "voiceSessions": 0
  }
}
```

Eine sofort belegte Nicht-Force-Anfrage gibt eine schnelle Pre-Drain-Aktivitätsmomentaufnahme zurück. Sobald der Drain beginnt, enthält die Antwort bei Belegung oder Erfolg die finale Momentaufnahme, die nach dem Schließen der Zulassungs- und ACP-Drain-Gates und vor Beginn der Bereinigung aufgenommen wurde. Fehler umfassen `400 invalid_force_flag` / `workspace_mismatch`, `409 workspace_busy` / `primary_workspace_removal_forbidden` / `static_workspace_removal_forbidden` / `workspace_removal_in_progress` / `workspace_registration_in_progress`, `500 workspace_persist_failed` / `workspace_runtime_removal_failed`, `501 workspace_runtime_removal_unsupported` und `503 daemon_shutting_down`.

### `GET /workspace-registrations`

Listen Sie den persistierten gewünschten Workspace-Satz für diesen primären Workspace auf. Einträge bleiben sichtbar mit `active: false`, wenn ein gespeicherter Verzeichnis während des aktuellen Starts nicht wiederhergestellt werden konnte. Ein Eintrag bleibt `active: true`, solange seine Laufzeit entleert wird, da die Laufzeit weiterhin Live-Ressourcen besitzt, bis die Entfernung abgeschlossen ist. Einträge enthalten optionales `displayName`, wenn die persistente Registrierung eines hat.

```json
{
  "schemaVersion": 1,
  "primaryWorkspace": "/canonical/path/to/primary-workspace",
  "entries": [
    {
      "id": "stable-registration-id",
      "cwd": "/canonical/path/to/secondary-workspace",
      "displayName": "Payments Production",
      "active": true,
      "persisted": true
    }
  ]
}
```

Gibt `501 persistence_not_available` zurück, wenn kein Registrierungsspeicher konfiguriert ist, und `500 workspace_registration_store_error`, wenn der Speicher nicht gelesen werden kann.

### `DELETE /workspace-registrations/:id`

Vergisst eine persistierte Registrierung. Dies entlädt keine aktive Laufzeit und beendet keine ihrer Sitzungen; `restartRequired: true` bedeutet, dass die aktive Laufzeit beim nächsten Daemon-Neustart verschwindet.

```json
{ "removed": true, "active": true, "restartRequired": true }
```

Gibt `404 workspace_registration_not_found`, `500 workspace_registration_store_error` oder `501 persistence_not_available` zurück. Wie bei anderen Mutations-Routen erfordert dieser Endpunkt Mutations-Authentifizierung, wenn die Daemon-Authentifizierung aktiviert ist.

### Nur-Lese-Laufzeitstatus-Routen

Diese Routen melden Daemon-seitige Laufzeit-Snapshots. Sie sind additive v1-Routen, ändern keinen Zustand und ändern nicht die Serve-Protokollversion. Workspace-Status-Routen starten **nicht** absichtlich den ACP-Kindprozess nur, weil ein Client eine GET-Route abfragt. `GET /workspace/mcp` gibt `initialized: false` mit einem leeren Snapshot zurück, wenn der Daemon im Leerlauf ist und keine aufbewahrte MCP-Beobachtung hält; wenn ein lebendes Kind früher geantwortet hat, spielt die Leerlauf-Lesung diese Beobachtung mit `source: "cache"` und ihrem ursprünglichen `initialized`-Wert nach. `GET /workspace/skills` liefert stattdessen eine aufbewahrte Daemon-Beobachtung oder Daemon-lokale Aufzählung und meldet `initialized: false` **mit einem `errors`-Eintrag** (wiederholbare Nichtverfügbarkeit, kein leerer Katalog), nur wenn keine aufbewahrte Beobachtung existiert und beide Quellen nicht verfügbar sind (oder eine kalte Lesung gedrosselt wird) – siehe [`GET /workspace/skills`](#get-workspaceskills). `GET /workspace/providers` wird Daemon-lokal aus Workspace-Einstellungen und Umgebung beantwortet, hängt also nicht von einem lebenden ACP-Kind ab, und `acpChannelLive` meldet die Lebendigkeit. Sein `initialized` ist `true` auf dem Erfolgspfad und `false` mit einem `errors`-Eintrag, wenn Workspace-Einstellungen oder Modellkonfiguration nicht aufgelöst werden können; Daemons, die ohne einen Daemon-lokalen Provider-Builder konstruiert wurden, fallen auf den lebenden ACP-Snapshot zurück, und die Daemon-lokale Antwort lässt runtime-registrierte Modelle weg. Session-Status-Routen erfordern eine lebende Session und geben `404 { code: "session_not_found", ... }` für unbekannte IDs zurück.

Fähigkeits-Tags:

- `workspace_mcp` → `GET /workspace/mcp`
- `workspace_skills` → `GET /workspace/skills`
- `workspace_providers` → `GET /workspace/providers`
- `workspace_acp_status` → `GET /workspace/acp/status`
- `workspace_env` → `GET /workspace/env`
- `workspace_preflight` → `GET /workspace/preflight`
- `session_context` → `GET /session/:id/context`
- `session_supported_commands` → `GET /session/:id/supported-commands`
- `session_tasks` → `GET /session/:id/tasks`
- `session_resources` → `GET /session/:id/resources`
- `session_monitor_tool_correlation` → Monitor-Einträge aus `GET /session/:id/tasks` enthalten `toolUseId` zur Transkript-zu-Aufgabe-Korrelation
- `session_status` → `GET /session/:id/status`
- `session_info` → `GET /workspace/:id/session-info` und `GET /workspaces/:workspace/session-info`
- `session_transcript` → `GET /session/:id/transcript`
- `workspace_persisted_transcript` → `GET /workspaces/:workspace/session/:id/transcript`
- `workspace_session_export` → `GET /workspaces/:workspace/session/:id/export`
- `workspace_archived_session_export` → `GET /workspaces/:workspace/session/:id/archive/export`
- `workspace_session_live_state` → `GET /workspaces/:workspace/sessions/live-state`
- `workspace_qualified_memory` → `POST /workspaces/:workspace/memory/{remember,forget,dream}` und `GET /workspaces/:workspace/memory/{remember,forget,dream}/:taskId`

`workspace_acp_status` meldet die punktuelle Lebendigkeit des ACP-Kanals des primären Workspaces als `{ channelLive: boolean }`. Der Handler erstellt keinen Kanal, aber das Erreichen einer Runtime-Route kann zuerst eine verzögerte Daemon-Laufzeit starten, deren konfigurierte Start-Richtlinie möglicherweise unabhängig ACP vorwärmt. Der Snapshot ist kein Lease: Clients müssen die Session-Erstellung zulassen, um den Kanal zu revalidieren oder zu starten.

### ACP-Vorwärmen

Fähigkeits-Tag: `workspace_acp_preheat`.

`POST /workspace/acp/preheat?timeoutMs=N` initialisiert den ACP-Kanal des primären Workspaces best-effort. `timeoutMs` beträgt standardmäßig 5000 und muss eine positive Ganzzahl sein, die nicht größer als 60000 ist. Gleichzeitige Aufrufer und die Session-Erstellung teilen dieselbe Bridge-Initialisierung. Ein Anfrage-Timeout beendet nur diese HTTP-Wartezeit; er bricht die gemeinsame Initialisierung nicht ab.

```ts
interface WorkspaceAcpPreheatResult {
  ready: boolean;
  channelLive: boolean;
  durationMs: number;
  reason?: 'timeout' | 'error';
  error?: string;
}
```

`ready` ist immer gleich `channelLive`. Eine Live-Antwort lässt `reason` und `error` aus; andernfalls ist `reason` entweder `timeout` oder `error`. `durationMs` misst den aktuellen HTTP-Aufruf, nicht die gesamte Lebensdauer einer Initialisierung, an der der Aufruf teilgenommen hat. Ein operatives Timeout oder ein Fehler gibt HTTP 200 zurück. Ungültiges `timeoutMs` gibt 400 zurück, während Authentifizierungs-, Ratenbegrenzungs- und Fehler im verzögerten Runtime ihre normalen Antworten beibehalten.

Beide ACP-Arbeitsbereichsrouten sind singulär und nur für den primären Arbeitsbereich bestimmt. Clients dürfen sie nicht für einen sekundären Arbeitsbereich verwenden und weder Antwort als dauerhafte Bereitschaftszusage interpretieren.

Gemeinsame Statuszelle:

```ts
type DaemonStatus =
  | 'ok'
  | 'warning'
  | 'error'
  | 'disabled'
  | 'not_started'
  | 'unknown';

type DaemonErrorKind =
  | 'missing_binary'
  | 'blocked_egress'
  | 'auth_env_error'
  | 'init_timeout'
  | 'restore_timeout'
  | 'protocol_error'
  | 'missing_file'
  | 'parse_error';

interface DaemonStatusCell {
  kind: string;
  status: DaemonStatus;
  error?: string;
  errorKind?: DaemonErrorKind;
  hint?: string;
}
```

`errorKind` ist eine geschlossene Enumeration, die von `/workspace/preflight`, `/workspace/env` und (eventuell) MCP-Schutzmaßnahmen geteilt wird, damit SDK-Clients Maßnahmen pro Kategorie anzeigen können, anstatt frei formatierte Nachrichten zu parsen. Die ursprünglichen sieben Statusliterale stammten aus #4175; `restore_timeout` wurde separat für Sitzungs-Wiederherstellungsanfragen hinzugefügt. `blocked_egress` bleibt reserviert, bis die Egress-Probe implementiert ist.

Status-Nutzdaten geben niemals MCP-Umgebungswerte, Header, OAuth-/Service-Konto-Details, API-Schlüssel des Anbieters, Anbieter-`baseUrl` / `envKey`, Skill-Inhalt, Dateisystempfade des Skills, Hook-Definitionen oder Werte geheimer Umgebungsvariablen preis. `/workspace/env` meldet nur die **Existenz** von auf der Whitelist geführten Umgebungsvariablen; Proxy-URLs werden um Anmeldedaten bereinigt und vor der Übertragung auf `host:port` reduziert.

### `GET /workspace/mcp`

```json
{
  "v": 1,
  "workspaceCwd": "/canonical/path",
  "initialized": true,
  "discoveryState": "completed",
  "servers": [
    {
      "kind": "mcp_server",
      "status": "ok",
      "name": "docs",
      "mcpStatus": "connected",
      "transport": "stdio",
      "disabled": false,
      "description": "Documentation server",
      "extensionName": "docs-ext"
    }
  ]
}
```

`discoveryState` ist eines von `not_started`, `in_progress` oder `completed`. `transport` ist eines von `stdio`, `sse`, `http`, `websocket`, `sdk` oder `unknown`. `errors` wird weggelassen, wenn die Entdeckung erfolgreich ist.

`source` ist `"live"`, solange das Kind, das die Beobachtung erzeugt hat, aktiv ist. Wenn der Daemon im Leerlauf ist und ein aktives Kind früher geantwortet hat, repliziert die Antwort diese Beobachtung mit `source: "cache"` und den ursprünglichen Werten des Kindes, einschließlich `initialized: true` und seiner Serverliste. Die zwischengespeicherte Beobachtung wird nur gelöscht, wenn eine neue MCP-Entdeckung beginnt; das Einziehen des Kindes verwirft sie nicht, sodass ein inaktiver `GET /workspace/mcp` einen Katalog melden kann, der derzeit von keinem aktiven Kind bereitgestellt wird.

**MCP-Client-Schutzplanken (Issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175)).** Aktuelle Daemons erweitern die Nutzdaten um vier additive Felder und eine budgetbezogene Zelle mit Gültigkeitsbereich:

```jsonc
{
  "v": 1,
  "workspaceCwd": "/canonical/path",
  "initialized": true,
  "discoveryState": "completed",
  "clientCount": 3,
  "clientBudget": 2,
  "budgetMode": "enforce",
  "budgets": [
    {
      "kind": "mcp_budget",
      "scope": "workspace",
      "status": "error",
      "errorKind": "budget_exhausted",
      "hint": "Raise --mcp-client-budget or remove servers from mcpServers config.",
      "liveCount": 2,
      "budget": 2,
      "mode": "enforce",
      "refusedCount": 1,
    },
  ],
  "servers": [
    {
      "kind": "mcp_server",
      "status": "ok",
      "name": "a",
      "mcpStatus": "connected",
      "transport": "stdio",
      "disabled": false,
    },
    {
      "kind": "mcp_server",
      "status": "ok",
      "name": "b",
      "mcpStatus": "connected",
      "transport": "stdio",
      "disabled": false,
    },
    {
      "kind": "mcp_server",
      "status": "error",
      "name": "c",
      "mcpStatus": "disconnected",
      "transport": "stdio",
      "disabled": false,
      "disabledReason": "budget",
      "errorKind": "budget_exhausted",
      "hint": "...",
    },
  ],
}
```

`budgetMode` ist eines von `enforce`, `warn` oder `off`. `clientBudget` fehlt, wenn kein Budget festgelegt wurde. `budgets[]` ist **immer ein Array** bei Daemons, die `mcp_guardrails` anzeigen (möglicherweise leer, wenn `budgetMode === 'off'`); ältere Daemons lassen das Feld vollständig weg. Wenn `mcp_workspace_pool` angezeigt wird, hat die Zelle `scope: 'workspace'` und deckt den gemeinsamen Pool der ausgewählten Workspace-Laufzeitumgebung ab. Wenn dieses Tag fehlt, einschließlich unter `QWEN_SERVE_NO_MCP_POOL=1`, gibt der Legacy-Manager `scope: 'session'` aus. Verbraucher MÜSSEN zusätzliche unbekannte Scope-Werte tolerieren.

`disabledReason` auf serverbezogenen Zellen unterscheidet zwischen vom Betreiber deaktiviert (`'config'` — `disabledMcpServers` Konfigurationsliste) und durch Budget verweigert (`'budget'` — erkannt, aber aufgrund des `enforce`-Modus nie verbunden). Verweigerungen sind deterministisch nach der Deklarationsreihenfolge von `Object.entries(mcpServers)`. Das serverbezogene `status: 'error', errorKind: 'budget_exhausted'` überlagert den rohen Wert `mcpStatus: 'disconnected'` (der wahr ist, aber nicht die für den Betreiber sichtbare Schweregradstufe darstellt).

Die Durchsetzung des Budgets ist fähigkeitsgesteuert. Mit `mcp_workspace_pool` teilen sich Sitzungen innerhalb einer Workspace-Laufzeitumgebung Transporte und ein `WorkspaceMcpBudget`; verschiedene Workspace-Laufzeitumgebungen teilen niemals einen Pool oder ein Budget. Ohne das Tag erzwingt jedes `McpClientManager` einer ACP-Sitzung seine eigene Kopie der Obergrenze, und der Snapshot stellt diese Legacy-Sitzungsansicht dar.

**Erkennung von Budgetdruck.** Zwei Oberflächen, beide nach PR-14b befüllt:

- **Push-Ereignisse** (angezeigt über `mcp_guardrail_events`): Abonnieren Sie `GET /session/:id/events` und filtern Sie `mcp_budget_warning` / `mcp_child_refused_batch` Frames über `KnownDaemonEvent`. Der Zustandsautomat feuert einmal pro Überschreiten der 75%-Schwelle nach oben (wird unterhalb von 37,5% neu scharf gestellt); Verweigerungen werden einmal pro Erkennungsdurchlauf im `enforce`-Modus zusammengefasst.
- **Snapshot-Abfrage** (angezeigt über `mcp_guardrails`): `GET /workspace/mcp` und überprüfen Sie die Budget-Zelle (`budgets[0]`) zusammen mit `mcp_workspace_pool`, um ihren Gültigkeitsbereich zu bestimmen:

- `budgets[0].status === 'warning'` ⇔ `liveCount >= 0.75 * clientBudget` (entspricht der Hysterese-Schwelle, die das Push-Ereignis von PR 14b verwenden wird).
- `budgets[0].status === 'error'` ⇔ `refusedCount > 0` (ein oder mehrere Server wurden in diesem Erkennungsdurchlauf verweigert).
- `budgets[0].status === 'ok'` ⇔ unterhalb der 75%-Schwelle UND keine Verweigerungen.

Empfohlene Abfragefrequenz: abgestimmt auf alles, was bereits `/workspace/mcp` abfragt; der Snapshot ist günstig, und die Budget-Zelle verursacht keine zusätzlichen Erkennungskosten. SDK-Clients, die Push-Ereignisse abonnieren, profitieren dennoch vom Snapshot für den Zustand nach einer verlängerten Trennung (die Tiefe des SSE-Replay-Rings ist begrenzt — `--event-ring-size`, Standardwert 8000 — daher fällt ein Client, der länger als die Ringabdeckung offline ist, auf die Snapshot-Neusynchronisierung zurück).

### `GET /workspace/skills`

Die primären und arbeitsbereichsqualifizierten Inventarrouten geben sofort eine beibehaltene Momentaufnahme zurück, während sie im Hintergrund revalidieren. Starts sind auf einmal pro Sekunde begrenzt, gemessen vom Task-Start, und parallele Leser teilen sich einen Task. Warme Hintergrund-Revalidierung gibt ihren Slot nach fünf Sekunden frei; ein Timeout erlaubt einen erneuten Versuch, bricht aber weder die Beobachtung noch die ACP-Arbeit ab. Kalte Lesevorgänge respektieren den konfigurierten Anfrage-Timeout von ACP (standardmäßig zehn Sekunden), danach folgt die daemon-lokale Aufzählung, falls ACP nicht verfügbar ist. Sie erzwingen weder die Hintergrund-Frist für eine Quelle. Ein kalter Lesevorgang, der innerhalb einer Sekunde nach seinem Start fehlschlägt, führt dazu, dass der Rest dieses Fensters sofort einen nicht verfügbaren Status zurückgibt; langsamere Fehler hinterlassen kein Drosselfenster, sodass Clients ihr eigenes Retry-Backoff benötigen. Eine späte erfolgreiche Hintergrundbeobachtung kann veröffentlichen, während ein erneuter Versuch aussteht, kann aber keine Beobachtung ersetzen, die später gestartet wurde und bereits veröffentlicht hat. Invalidierte Tasks können nicht veröffentlichen; eine erfolgreiche invalidierte Beobachtung kann weiterhin ihren ursprünglichen Aufrufer beantworten. Explizite Invalidierung verwirft bekanntermaßen ungültiges Inventar und löscht die Drosselung. Ein erfolgreicher ACP-Vorheizvorgang, der vor seinem Timeout abgeschlossen wird, invalidiert auch das beibehaltene Inventar, einschließlich wenn das Kind bereits aktiv war, sodass der folgende Lesevorgang das Kind sieht. Ein Vorheizvorgang, der ein Timeout erreicht und dann den Kanal aktiv findet, meldet ebenfalls `ready: true` — bereit ist immer gleich `channelLive` — behält aber das beibehaltene Inventar bei, da der Start möglicherweise noch unvollständig ist; der nächste Lesevorgang gibt diese beibehaltenen Daten zurück, und die Hintergrund-Revalidierung ersetzt sie, sobald die eine-Sekunden-Start-Drosselung es erlaubt. Das Löschen eines Skills umgeht die Momentaufnahme und die Drosselung, erfordert jedoch einen frisch aufgezählten Katalog: Es verwendet den lokalen Fallback und antwortet niemals aus einer beibehaltenen Momentaufnahme. Identitäts-Lesevorgänge zur Aktivierung umgehen die Momentaufnahme und die Drosselung, warten auf eine neue Beobachtung mit lokalem Fallback und dann auf die beibehaltene Momentaufnahme, wenn beide Quellen fehlschlagen.

Inventarantworten, die eine beibehaltene Daemon-Beobachtung enthalten, umfassen zusätzlich optionale Metadaten der Momentaufnahme. Direkte Konfigurations-/Runtime-Status-Lesevorgänge, Ressourceninventare der Sitzung und ältere Daemons lassen sie weg. Ein überholter erfolgreicher kalter Lesevorgang gibt eine neuere beibehaltene Momentaufnahme zurück, wenn verfügbar; andernfalls gibt er seine eigene ungecachte Beobachtung ohne diese Metadaten zurück. Nur initialisierte Beobachtungen ohne Fehler können die beibehaltene Momentaufnahme ersetzen:

```json
{
  "snapshot": {
    "observedAt": 1792486800000,
    "ageMs": 1500,
    "stale": true,
    "refreshing": true
  }
}
```

`observedAt` ist die Unix-Millisekunden-Startzeit der erfolgreichen Beobachtung; `ageMs` wird pro Antwort neu berechnet und schließt konservativ die Sammelzeit ein. `stale` bedeutet, dass die Beobachtung mindestens eine Sekunde alt ist. `refreshing` gibt an, ob eine Revalidierung den gemeinsamen Slot belegt; abgelaufene Beobachtungen können noch nach Freigabe des Slots abgeschlossen werden. Fehlgeschlagene Lesevorgänge, Slot-Timeouts und Wiederholungen nach dem Stoppen der Laufzeit erneuern den Zeitstempel nicht; eine spätere erfolgreiche Veröffentlichung verzeichnet ihre eigene Beobachtungsstartzeit. Clients dürfen dieses Alter anzeigen, aber es handelt sich weder um eine Dateisystemrevision noch um einen Nachweis, dass jede Sitzung aktuell ist. Wenn kein initialisierter Snapshot existiert und beide Quellen nicht verfügbar sind (oder der Kaltstart-Lesevorgang gedrosselt wird), enthält die Antwort `initialized: false`, einen Eintrag `errors` und keine Metadaten `snapshot`. Dies ist ein wiederholbarer Nichtverfügbarkeitszustand, kein leerer Katalog; ein gültiger leerer Katalog hat `initialized: true`. Statusabfragen rufen keine sitzungsbetreffenden Skill-Aktualisierungsbefehle auf. Geschlossene oder entleerende Workspace-Laufzeiten lehnen Lesevorgänge ab; gespeicherte Daten überleben das Bereinigen von Kind-Kanälen, nicht die Stilllegung der Laufzeit.

```json
{
  "v": 1,
  "workspaceCwd": "/canonical/path",
  "initialized": true,
  "skills": [
    {
      "kind": "skill",
      "status": "ok",
      "name": "review",
      "description": "Review code",
      "level": "project",
      "modelInvocable": true,
      "userInvocable": false,
      "installedPath": "/home/alice/project/.qwen/skills/review/SKILL.md",
      "argumentHint": "[path]"
    },
    {
      "kind": "skill",
      "status": "ok",
      "name": "database-review",
      "description": "Review database changes",
      "level": "extension",
      "modelInvocable": true,
      "installedPath": "/home/alice/.qwen/extensions/alibabacloud-database-suite/skills/database-review/SKILL.md",
      "extensionName": "alibabacloud-database-suite",
      "extensionDisplayName": "Alibaba Cloud Database Suite"
    }
  ]
}
```

`level` ist einer von `project`, `user`, `extension` oder `bundled`. `userInvocable` (boolean, optional) wird für normale Skills weggelassen (was `true` bedeutet) und ist nur als `false` vorhanden, wenn der Skill nicht manuell aufgerufen werden kann. Es steuert nicht die unten beschriebenen reinen Einstellungs-Skill-Toggle-Routen. `modelInvocable` ist unabhängig: `false` bedeutet, dass der Skill weiterhin manuell verfügbar bleibt, aber vor Modellaufrufen verborgen ist. `installedPath` ist der bestehende absolute Pfad zum `SKILL.md` des Skills; der Daemon gibt ihn wie gespeichert zurück, ohne Symlinks separat aufzulösen oder zu kanonisieren. Aktuelle Daemons geben ihn für jeden Skill aus, während Clients seine Abwesenheit bei älteren v1-Daemons tolerieren müssen. Skill-Inhalte, Hooks, `skillRoot` und andere Skill-Konfigurationen bleiben ausgeschlossen. `errors` wird weggelassen, wenn die Erkennung erfolgreich ist.

Für Skills im Besitz einer Erweiterung ist `extensionName` der kanonische Manifestname und kann sicher als Besitzeridentität verwendet werden. `extensionDisplayName` ist ein optionaler, lokalisierter Anzeigewert und kann nicht eindeutig sein. Neue Clients sollten `extensionDisplayName ?? extensionName` anzeigen; ältere Daemons lassen das Anzeigefeld weg.

Wiederholte Lesevorgänge werden aus dem zuletzt committeten Workspace-Snapshot bedient und periodisch gegen den In-Memory-Cache des Kind-Prozesses revalidiert. Lesevorgänge im stabilen Zustand durchsuchen keine Skill-Verzeichnisse und parsen keine `SKILL.md`-Dateien erneut; der lokale Kaltstart-Fallback des Daemons kann vom Datenträger enumerieren. Das Kind überprüft, dass seine Erweiterungsquellen unverändert sind — ein `readdir` des Erweiterungsverzeichnisses plus ein `stat` pro Eintrag, die Aktivierungsdatei und der Aktivierungszustand des Speichers — und aktualisiert nur, wenn sie sich geändert haben, sodass eine außerhalb des Daemons installierte oder umgeschaltete Erweiterung durch die Revalidierung erfasst wird und bei einem nachfolgenden Lesevorgang erscheint, nachdem diese Revalidierung veröffentlicht wurde. Ein warmer Lesevorgang gibt immer die gespeicherte Beobachtung zurück, auch wenn er Hintergrundarbeit startet. Der sichere Modus und der reine Modus überspringen die Überprüfung, was ihrem Ausschluss von Erweiterungen entspricht.

### `GET /workspace/providers`

```json
{
  "v": 1,
  "workspaceCwd": "/canonical/path",
  "initialized": true,
  "current": { "authType": "qwen", "modelId": "qwen3(qwen)" },
  "providers": [
    {
      "kind": "model_provider",
      "status": "ok",
      "authType": "qwen",
      "current": true,
      "models": [
        {
          "modelId": "qwen3(qwen)",
          "baseModelId": "qwen3",
          "name": "Qwen 3",
          "description": null,
          "contextLimit": 4096,
          "isCurrent": true,
          "isRuntime": false
        }
      ]
    }
  ]
}
```

Modelle sind nach Authentifizierungstyp gruppiert. Diagnostics zur Provider-Verbindung befinden sich in der Zelle `providers` von `/workspace/preflight`; die Umgebungsvorprüfung befindet sich in `/workspace/preflight` und `/workspace/env` (unten). `errors` wird weggelassen, wenn die Snapshot-Erstellung erfolgreich ist.

### `GET /workspace/env`

Berichtet die Laufzeitumgebung, Plattform, Sandbox, Proxy und die **Existenz** von auf der Whitelist stehenden geheimen Umgebungsvariablen des Daemon-Prozesses. Beantwortet immer aus dem `process.*`-Zustand — der Daemon startet niemals einen ACP-Kind-Prozess, um diese Route zu bedienen, und die Antwort ist identisch, ob ACP aktiv oder im Leerlauf ist. Das Feld `acpChannelLive` ist nur informativ.

```json
{
  "v": 1,
  "workspaceCwd": "/canonical/path",
  "initialized": true,
  "acpChannelLive": false,
  "cells": [
    { "kind": "runtime", "name": "node", "status": "ok", "value": "22.4.0" },
    { "kind": "platform", "name": "darwin", "status": "ok", "value": "arm64" },
    {
      "kind": "sandbox",
      "name": "SANDBOX",
      "status": "disabled",
      "present": false
    },
    {
      "kind": "proxy",
      "name": "HTTPS_PROXY",
      "status": "ok",
      "present": true,
      "value": "proxy.internal:1080"
    },
    {
      "kind": "proxy",
      "name": "NO_PROXY",
      "status": "disabled",
      "present": false
    },
    {
      "kind": "env_var",
      "name": "OPENAI_API_KEY",
      "status": "ok",
      "present": true
    },
    {
      "kind": "env_var",
      "name": "ANTHROPIC_BASE_URL",
      "status": "disabled",
      "present": false
    }
  ]
}
```

Zellform:

```ts
type DaemonEnvKind =
  | 'runtime' // name: 'node' | 'bun' | 'unknown'; value: process.versions.node
  | 'platform' // name: process.platform; value: process.arch
  | 'sandbox' // name: 'SANDBOX' | 'SEATBELT_PROFILE'; value optional
  | 'proxy' // name: HTTP_PROXY | HTTPS_PROXY | NO_PROXY | ALL_PROXY; value: redacted host
  | 'env_var'; // presence-only; value field is ALWAYS omitted

interface DaemonEnvCell extends DaemonStatusCell {
  kind: DaemonEnvKind;
  name: string;
  present?: boolean;
  value?: string;
}
```

**Redaktionsrichtlinie.** Zellen `kind: 'env_var'` enthalten niemals ein Feld `value`; Clients sehen nur `present: boolean`. Zellen `kind: 'proxy'` leiten den rohen Umgebungsvariablenwert durch die Credential-Redaktion (`redactProxyCredentials`) und dann durch die Analyse von `URL`, sodass die Leitung nur `host:port` überträgt. `NO_PROXY` wird wortwörtlich durch die Redaktion geleitet, da es sich um eine Hostliste handelt und nicht um eine URL. Die Whitelist der enumerierten geheimen Umgebungsvariablen umfasst derzeit `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_API_KEY`, `DASHSCOPE_API_KEY`, `OPENROUTER_API_KEY` und `QWEN_SERVER_TOKEN`. Andere Umgebungsvariablen werden nicht enumeriert, sodass versehentlich gesetzte Geheimnisse unsichtbar bleiben.

### `GET /workspace/preflight`

Berichtet Bereitschaftsprüfungen des Daemons. **Daemon-Ebene-Zellen** (`node_version`, `cli_entry`, `workspace_dir`, `ripgrep`, `git`, `npm`) werden immer aus `process.*` und `node:fs` gefüllt. **ACP-Ebene-Zellen** (`auth`, `mcp_discovery`, `skills`, `providers`, `tool_registry`, `egress`) erfordern einen aktiven ACP-Kind-Prozess — wenn der Daemon im Leerlauf ist, geben sie Platzhalter `status: 'not_started'` aus. Die Route startet niemals ACP allein, um Zellen zu füllen; die entsprechenden Zellen fallen auf `not_started` zurück.

Leerlaufantwort (kein ACP-Kind):

```json
{
  "v": 1,
  "workspaceCwd": "/canonical/path",
  "initialized": true,
  "acpChannelLive": false,
  "cells": [
    {
      "kind": "node_version",
      "status": "ok",
      "locality": "daemon",
      "detail": { "version": "22.4.0", "required": ">=22" }
    },
    {
      "kind": "cli_entry",
      "status": "ok",
      "locality": "daemon",
      "detail": { "path": "/usr/local/bin/qwen", "source": "process.argv[1]" }
    },
    {
      "kind": "workspace_dir",
      "status": "ok",
      "locality": "daemon",
      "detail": { "path": "/canonical/path" }
    },
    { "kind": "ripgrep", "status": "ok", "locality": "daemon" },
    {
      "kind": "git",
      "status": "ok",
      "locality": "daemon",
      "detail": { "version": "2.45.0" }
    },
    {
      "kind": "npm",
      "status": "ok",
      "locality": "daemon",
      "detail": { "version": "10.7.0" }
    },
    {
      "kind": "auth",
      "status": "not_started",
      "locality": "acp",
      "hint": "spawn a session to populate"
    },
    {
      "kind": "mcp_discovery",
      "status": "not_started",
      "locality": "acp",
      "hint": "spawn a session to populate"
    },
    {
      "kind": "skills",
      "status": "not_started",
      "locality": "acp",
      "hint": "spawn a session to populate"
    },
    {
      "kind": "providers",
      "status": "not_started",
      "locality": "acp",
      "hint": "spawn a session to populate"
    },
    {
      "kind": "tool_registry",
      "status": "not_started",
      "locality": "acp",
      "hint": "spawn a session to populate"
    },
    {
      "kind": "egress",
      "status": "not_started",
      "locality": "acp",
      "hint": "egress probing lands in PR 14 (#4175)"
    }
  ]
}
```

Zellform:

```ts
type DaemonPreflightKind =
  | 'node_version'
  | 'cli_entry'
  | 'workspace_dir'
  | 'ripgrep'
  | 'git'
  | 'npm'
  | 'auth'
  | 'mcp_discovery'
  | 'skills'
  | 'providers'
  | 'tool_registry'
  | 'egress';

interface DaemonPreflightCell extends DaemonStatusCell {
  kind: DaemonPreflightKind;
  locality: 'daemon' | 'acp';
  detail?: Record<string, unknown>;
}
```

`errorKind`-Semantik:

- `missing_binary` — Node-Version unterhalb der erforderlichen Version, fehlendes `QWEN_CLI_ENTRY`, ripgrep / git / npm nicht im PATH (Warnungen statt Fehler für optionale Binärdateien).
- `missing_file` — `boundWorkspace` existiert nicht oder ist kein Verzeichnis; Skill-Parse-Fehler, der auf eine fehlende oder unlesbare Datei hinweist.
- `parse_error` — `SKILL.md` Parse-Fehler, fehlerhaftes Konfigurations-JSON.
- `auth_env_error` — `validateAuthMethod` gab eine nicht-null Fehlerzeichenkette zurück, oder eine Unterklasse von `ModelConfigError` wurde aus der Provider-Auflösung propagiert.
- `init_timeout` — `withTimeout` Ablehnung in der Brücke (ein tatsächlicher Timeout beim Warten auf einen ACP-Roundtrip). Erkannt über die typisierte Klasse `BridgeTimeoutError`. Hinweis: Eine transiente Zelle `mcp_discovery` `warning` mit `connecting > 0` trägt NICHT diese Art — das ist ein normaler Handshake-in-progress-Zustand, unterschiedlich von einem echten Timeout.
- `restore_timeout` — Das Laden oder Fortsetzen einer Sitzung hat das dedizierte Wiederherstellungsbudget überschritten. Die REST-Antwort ist `504` und kann wiederholt werden; sie unterscheidet sich von der Initialisierung des untergeordneten Prozesses und von den begrenzten Grenzen für das Replay-Fenster.
- `protocol_error` — ACP `extMethod` wurde abgelehnt, da der Kanal mitten in der Anfrage geschlossen wurde oder die Tool-Registry unerwartet fehlte.
- `blocked_egress` — Reserviert für PR 14 (#4175). PR 13 lässt die Zelle `egress` als `status: 'not_started'`.

Wenn die Brücke während der Bearbeitung einer Preflight-Anfrage (z. B. Schließung des Kanals mitten in der Anfrage) den ACP-Kind-Prozess nicht erreichen kann, enthält das Array `errors` im Umschlag eine einzelne Beschreibung `ServeStatusCell` des Fehlers, und die Zellen fallen auf ACP-Platzhalter `not_started` zurück. Daemon-Ebene-Zellen werden weiterhin zurückgegeben.

### `GET /workspace/tools`

Gibt den vom ACP-Kind-Prozess des primären Arbeitsbereichs gemeldeten Tool-Katalog zurück. Dies ist eine Legacy-Route für den primären Arbeitsbereich: Sie verfügt über keinen Arbeitsbereichs-Selektor und darf nicht verwendet werden, um Tools einer Nicht-Primär-Laufzeitumgebung abzuleiten.

```json
{
  "v": 1,
  "workspaceCwd": "/canonical/path",
  "initialized": true,
  "acpChannelLive": true,
  "tools": [
    {
      "name": "ReadFile",
      "displayName": "Read",
      "description": "Read a file",
      "enabled": true
    }
  ]
}
```

Wenn kein ACP-Kind-Prozess aktiv ist, gibt die Route weiterhin `200` mit `acpChannelLive: false`, einem leeren Array `tools` und einem Eintrag `not_started` im optionalen Array `errors` zurück. Unerwartete Brückenfehler verwenden die Standard-Brückenfehlerantwort `500`. Die TypeScript-SDK-Methode ist `workspaceTools()`; es gibt kein dediziertes Capability-Tag, daher sollten Clients, die ältere Daemons unterstützen, `404` als nicht unterstützt behandeln.

### Arbeitsbereich-Datei-Routen

Legacy-Dateirouten lösen Pfade über den primären Arbeitsbereich auf; Routen `/workspaces/:workspace/...` lösen Pfade über den Arbeitsbereich der ausgewählten Laufzeitumgebung auf. Antworten verwenden arbeitsbereichsrelative Pfade und geben bei normalem Erfolg niemals absolute Dateisystempfade zurück. Erfolgreiche Dateiantworten enthalten:

```http
Cache-Control: no-store
X-Content-Type-Options: nosniff
```

Dateisystemfehler verwenden dieses JSON-Format:

```json
{
  "errorKind": "hash_mismatch",
  "error": "expected sha256:..., found sha256:...",
  "hint": "re-read the file and retry with the latest hash",
  "status": 409
}
```

Die Werte von `errorKind` umfassen `path_outside_workspace`, `symlink_escape`, `path_not_found`, `binary_file`, `file_too_large`, `untrusted_workspace`, `permission_denied`, `parse_error`, `hash_mismatch`, `file_already_exists`, `text_not_found` und `ambiguous_text_match`.

#### `GET /file`

Liest eine Textdatei. Abfrageparameter: `path` (erforderlich), `maxBytes`, `line`, `limit` und `cursor`. Der Daemon lehnt Binärdateien ab. Dateien, die die Obergrenze für Vollständige-Snapshots von 256 KiB überschreiten, erfordern mindestens ein explizites Fensterargument (`line`, `limit` oder `maxBytes`); eine Anfrage ohne eines dieser Argumente bleibt `file_too_large`. Ein solches Fenster wird gestreamt, und sein zurückgegebener UTF-8-Inhalt bleibt auf 256 KiB begrenzt. `maxBytes` gilt immer für die UTF-8-Antwortbytes nach dem Decodieren, auch wenn die Quelle eine andere unterstützte Kodierung innerhalb der Obergrenze für Vollständige-Snapshots verwendet.

Zeilenverschiebungen werden durch Scannen vom Anfang der Datei aufgelöst, daher wird ein Fenster auch mit `file_too_large` abgelehnt, wenn das Erreichen mehr als 8 MiB lesen würde (`MAX_TEXT_SCAN_BYTES`). Verwenden Sie `GET /file/bytes`, um eine tiefere Verschiebung direkt zu erreichen. Großer Text in einer Kodierung, die die Route nicht decodieren kann, gibt `binary_file` zurück, nicht `file_too_large` — ein erneuter Versuch mit einem kleineren Fenster hilft nicht, und `readBytes` ist dasselbe Mittel, das bereits für Binärdateien gilt.

Für Dateien innerhalb der Obergrenze für Vollständige-Snapshots enthält die Antwort `hash`, einen SHA-256-Digest über die Rohbytes auf der Festplatte für die gesamte Datei, auch wenn `line`, `limit` oder `maxBytes` einen Ausschnitt zurückgegeben haben. Große partielle Fenster lassen `hash` weg, behalten den vollständigen `sizeBytes` bei, setzen `truncated: true` und geben `originalLineCount: null` zurück, wenn der Stream vor EOF stoppt.

##### Paging mit `cursor`

Erfordert die Capability `workspace_file_read_cursor`. Eine Antwort, die noch mehr Inhalt hat, gibt `hasMore: true` zurück und, wenn ein Datei-Byte-Offset ableitbar ist, ein Token `nextCursor`. Wenn dieses als `cursor` zurückgegeben wird, wird in O(1) fortgesetzt, wobei eine tiefe Verschiebung `line` ein Scannen von Byte 0 erfordert und über 8 MiB hinaus abgelehnt wird.

```
GET /file?path=big.log&limit=500          → { content, nextCursor, hasMore: true }
GET /file?path=big.log&limit=500&cursor=… → next page
```

`cursor` und `line` sind gegenseitig ausschließend (`parse_error`) — beide benennen einen Startpunkt. Ein fehlerhafter oder zu langer Cursor führt zu `parse_error`; ein Cursor, dessen Datei ersetzt oder gekürzt wurde, führt zu `hash_mismatch` (409). Anhängen macht **keinen** ausstehenden Cursor ungültig, was der Fall ist, für den diese Funktion existiert.

`content` lässt den abschließenden Zeilenumbruch seiner letzten Zeile weg, wie jede andere Leseoperation, sodass ein Client, der Seiten zusammensetzt, sie mit `\n` verbindet. `hasMore` ist keine Neuformulierung von `nextCursor`: Eine kleine Nicht-UTF-8-Datei, die mit einem `limit` gelesen wird, hat mehr Inhalt, aber keinen ableitbaren Byte-Offset, daher meldet sie `hasMore: true` mit `nextCursor: null`. Der Cursor ist auch null, wenn die Byte-Obergrenze die aktuelle Zeile schneidet, da das Fortsetzen von diesem Offset eine teilweise Zeile zurückgeben würde. Für viele kurze Zeilen senken Sie `limit`, bis die Seite endet, bevor die Byte-Obergrenze erreicht wird und einen Cursor zurückgibt. Für eine einzelne übergroße Zeile fordern Sie die folgende Zeile explizit an (zum Beispiel `line=2` beim Start bei Zeile 1), fahren dann mit Cursoren fort; verwenden Sie `GET /file/bytes`, wenn die vollständige übergroße Zeile erforderlich ist.

```json
{
  "kind": "file",
  "path": "src/index.ts",
  "content": "export {};\n",
  "encoding": "utf-8",
  "bom": false,
  "lineEnding": "lf",
  "sizeBytes": 11,
  "returnedBytes": 11,
  "truncated": false,
  "hash": "sha256:...",
  "matchedIgnore": null,
  "originalLineCount": null
}
```

#### `GET /file/bytes`

Liest Rohbytes aus einer Datei ohne Decodierung. Abfrageparameter: `path` (erforderlich), `offset` (Standardwert `0`) und `maxBytes` (Standardwert `65536`, Maximum `262144`). Diese Route unterstützt begrenzte Fenster auf großen Binärdateien, ohne die gesamte Datei einzulesen. Die Antwort enthält `hash` nur, wenn das zurückgegebene Fenster die gesamte Datei abdeckt.

```json
{
  "kind": "file_bytes",
  "path": "assets/logo.png",
  "offset": 0,
  "sizeBytes": 3912,
  "returnedBytes": 3912,
  "truncated": false,
  "contentBase64": "...",
  "hash": "sha256:..."
}
```

#### `GET /stat`

Gibt Metadaten für einen Pfad im primären Arbeitsbereich zurück. Der Abfrageparameter `path` ist erforderlich.

```json
{
  "kind": "stat",
  "path": "src/index.ts",
  "type": "file",
  "sizeBytes": 128,
  "modifiedMs": 1700000000123
}
```

`type` ist `file`, `directory`, `symlink` oder `other`. Die Route verwendet die Arbeitsbereichs-Dateigrenze und den oben beschriebenen gemeinsamen Dateisystem-Fehlerumschlag. Die TypeScript-SDK-Methode ist `fileStat()`.

#### `GET /list`

Listet ein Verzeichnis des primären Arbeitsbereichs auf. Der Abfrageparameter `path` ist erforderlich; `includeIgnored=1` (oder `true`) schließt Einträge ein, die mit Ignorierregeln übereinstimmen. Die Antwort ist auf 2.000 Einträge begrenzt und setzt `truncated: true`, wenn weitere existieren.

```json
{
  "kind": "list",
  "path": ".",
  "entries": [{ "name": "src", "kind": "directory", "ignored": false }],
  "truncated": false,
  "matchedIgnore": null
}
```

Das `kind` jedes Eintrags ist `file`, `directory`, `symlink` oder `other`. Die TypeScript-SDK-Methode ist `dirList()`.

#### `GET /glob`

Sucht nach Pfaden im primären Arbeitsbereich. Der Abfrageparameter `pattern` ist erforderlich. Optional verfeinert `cwd` die Suche, `includeIgnored=1` (oder `true`) schließt ignorierte Pfade ein, und `maxResults` ist eine Ganzzahl von 1 bis 50.000 (Standardwert 5.000).

```json
{
  "kind": "glob",
  "pattern": "**/*.ts",
  "cwd": "",
  "matches": ["src/index.ts"],
  "count": 1,
  "truncated": false,
  "durationMs": 4
}
```

Übereinstimmungen sind relativ zum Arbeitsbereich. Ungültige Abfragewerte geben `400` zurück; Vertrauenswürdigkeit des Arbeitsbereichs, Enthaltensein, fehlender Pfad und unerwartete Fehler verwenden den gemeinsamen Dateisystem-Fehlerumschlag. Die TypeScript-SDK-Methode ist `glob()`.

#### `POST /file/write`

Erstellt oder ersetzt eine Textdatei. Dies ist eine strikte Mutationsroute: Eine vertrauenswürdige Loopback-Anfrage ohne Token für den primären Bereich wird autorisiert. Eine primäre Anfrage ohne Token, die das Gate ohne vertrauenswürdige Loopback-Autorisierung erreicht, gibt `401 { "code": "token_required" }` zurück. Konfigurierte Token- und Local Control-Credential-Fehler werden früher mit einfachem `401 Unauthorized` abgelehnt; mit `--require-auth` lehnt das globale Bearer-Middleware nicht authentifizierte Anfragen ab, bevor die Route ausgeführt wird.

Body:

```json
{
  "path": "src/new.ts",
  "content": "export const value = 1;\n",
  "mode": "create"
}
```

```json
{
  "path": "src/existing.ts",
  "content": "export const value = 2;\n",
  "mode": "replace",
  "expectedHash": "sha256:..."
}
```

`mode` muss `create` oder `replace` sein. `create` überschreibt niemals eine vorhandene Datei (`409 file_already_exists`). `replace` erfordert `expectedHash`; fehlende oder fehlerhafte Hashes sind `400 parse_error`, und veraltete Hashes sind `409 hash_mismatch`. `expectedHash` ist `sha256:` plus 64 kleine Hexadezimalzeichen, berechnet über die rohen Bytes auf der Festplatte.

`bom`, `encoding` und `lineEnding` können angegeben werden. Ersetzungen bewahren standardmäßig das Kodierungsprofil der vorhandenen Datei bei; explizite Felder setzen dies außer Kraft. Binäre Schreibvorgänge sind nicht Teil des Anwendungsbereichs.

Der Daemon schreibt in eine zufällige temporäre Datei im Zielverzeichnis, ruft fsync auf, wo unterstützt, prüft den aktuellen Hash unmittelbar vor `rename()` erneut und benennt sie dann an Ort und Stelle um. Dies verhindert die Beobachtung unvollständiger Dateien und serialisiert Daemon-originierte Schreibvorgänge auf dieselbe Datei, ist aber kein prozessübergreifender Kernel-Vergleich-und-Austausch: Ein externer Editor kann immer noch im kleinen Zeitfenster zwischen letzter Hash-Prüfung und Umbenennung eingreifen.

```json
{
  "kind": "file_write",
  "path": "src/existing.ts",
  "mode": "replace",
  "created": false,
  "sizeBytes": 24,
  "hash": "sha256:...",
  "encoding": "utf-8",
  "bom": false,
  "lineEnding": "lf",
  "matchedIgnore": null
}
```

#### `POST /file/edit`

Wendet eine exakte Textersetzung auf eine vorhandene Textdatei an. Dies ist ebenfalls eine strikte Mutationsroute und erfordert `expectedHash`.

```json
{
  "path": "src/config.ts",
  "oldText": "timeout: 30000",
  "newText": "timeout: 60000",
  "expectedHash": "sha256:..."
}
```

`oldText` darf nicht leer sein und muss genau einmal vorkommen. Keine Übereinstimmung gibt `422 text_not_found` zurück; mehrere Übereinstimmungen geben `422 ambiguous_text_match` zurück. Die Route bewahrt Kodierung, BOM und Zeilenenden bei und prüft `expectedHash` unmittelbar vor der atomaren Umbenennung erneut.

Explizite Schreib-/Bearbeitungsvorgänge auf ignorierten Pfaden sind erlaubt, da der authentifizierte Aufrufer den Pfad benannt hat. Erfolgsantworten und Audit-Ereignisse enthalten `matchedIgnore: "file" | "directory" | null`.

```json
{
  "kind": "file_edit",
  "path": "src/config.ts",
  "replacements": 1,
  "sizeBytes": 128,
  "hash": "sha256:...",
  "encoding": "utf-8",
  "bom": false,
  "lineEnding": "lf",
  "matchedIgnore": null
}
```

#### `POST /workspaces/:workspace/directory/create`

Erfordert `workspace_qualified_rest_core` und `workspace_directory_create`, strikte Mutationsautorität und einen vertrauenswürdigen aktiven lokalen Arbeitsbereich. Body:

```json
{ "path": "src/new-folder" }
```

Das Elternverzeichnis muss existieren. Die Erstellung ist exklusiv: Eine vorhandene Datei oder ein vorhandenes Verzeichnis gibt `409 file_already_exists` zurück; ein abschließender Symlink gibt `400 symlink_escape` zurück. Erfolg ist `201 { "kind": "directory_create", "path": "src/new-folder" }`. Die SDK-Methode ist `WorkspaceDaemonClient.createWorkspaceDirectory(path, clientId?)`.

#### `POST /workspaces/:workspace/directory/delete`

Erfordert `workspace_qualified_rest_core` und `workspace_directory_delete` unter derselben Richtlinie für strikte Mutation und vertrauenswürdige lokale Laufzeitumgebung. Body:

```json
{ "path": "src/old-folder" }
```

Löscht ein leeres oder nicht leeres Verzeichnis rekursiv. Arbeitsbereichswurzeln, reguläre Dateien und abschließende Symlinks werden abgelehnt; verschachtelte Symlink-Einträge werden entfernt, ohne ihren Zielen zu folgen. Ein fehlendes Ziel gibt `404 path_not_found` zurück. Erfolg ist `200 { "kind": "directory_delete", "path": "src/old-folder" }`. Die SDK-Methode ist `WorkspaceDaemonClient.deleteWorkspaceDirectory(path, clientId?)`.

Beide Verzeichnisrouten bewahren den lexikalischen finalen Namen, während sie dessen Eltern innerhalb des ausgewählten Arbeitsbereichs auflösen. Pfade dürfen nicht auf einem Trennzeichen enden; verdächtige Pfadmuster geben `400 path_outside_workspace` zurück, während fehlerhafte Blattformen `400 parse_error` zurückgeben. Nicht unterstützte benutzerdefinierte Fabriken geben `422` zurück; SSH-Arbeitsbereiche werden durch die SSH-Grenze mit `501` abgelehnt. Unbekannte, nicht verfügbare, entfernte oder nicht vertrauenswürdige Besitzer fallen niemals auf den primären Bereich zurück.

Löschungen sind permanent und Fehler können teilweise Entfernung hinterlassen. Ein gleichzeitiger Schreiber kann `ENOTEMPTY` verursachen, zurückgegeben als `503 io_error`; wiederholen Sie denselben Vorgang, nachdem der Schreiber gestoppt hat. Sperren pro Pfad serialisieren ein Verzeichnis nicht gegen jeden Kind-Schreibvorgang, und ein externer Verzeichnisaustausch kann durch portable pfadbasierte Prüfungen nicht atomar gemacht werden. Explizite Mutationen ignorierter Verzeichnisse sind erlaubt, und Audit-Ereignisse annotieren `matchedIgnore`, wenn zutreffend; Erstellungsaufzeichnungen `sizeBytes: 0`.

### `GET /session/:id/context`

```json
{
  "v": 1,
  "sessionId": "<sid>",
  "workspaceCwd": "/canonical/path",
  "state": {
    "models": {},
    "modes": {},
    "configOptions": []
  }
}
```

Für eine Top-Level-Sitzung spiegelt `state` dieselben ACP-Modell-/Modus-/Konfigurationsoptionsformen wider, die von `POST /session`, `POST /session/:id/load` und `POST /session/:id/resume` verwendet werden. Eine virtuelle Sitzungs-ID mit Präfix `subagent.` löst sich gegen ihre Eltern-Laufzeit auf und gibt ein leeres `state`-Objekt zurück.

### `GET /session/:id/supported-commands`

```json
{
  "v": 1,
  "sessionId": "<sid>",
  "availableCommands": [
    {
      "name": "init",
      "description": "Initialize the project",
      "input": null,
      "_meta": { "source": "builtin" }
    }
  ],
  "availableSkills": ["review"]
}
```

`availableCommands` ist derselbe Befehlsschnappschuss, der von der `available_commands_update` SSE-Benachrichtigung verwendet wird. `availableSkills` listet nur Skill-Namen auf; Clients dürfen keine Skill-Inhalte oder Pfade über diese Route erwarten.

### `GET /session/:id/tasks`

```json
{
  "v": 1,
  "sessionId": "<sid>",
  "now": 1700000000000,
  "tasks": [
    {
      "kind": "agent",
      "id": "agent-1",
      "label": "reviewer: check failure",
      "description": "check failure",
      "status": "running",
      "startTime": 1699999999000,
      "runtimeMs": 1000,
      "outputFile": "/tmp/agent-1.jsonl",
      "isBackgrounded": true,
      "subagentType": "reviewer"
    },
    {
      "kind": "agent",
      "id": "agent-2",
      "label": "general-purpose: run the failing test",
      "description": "run the failing test",
      "status": "running",
      "startTime": 1699999999500,
      "runtimeMs": 500,
      "outputFile": "/tmp/agent-2.jsonl",
      "isBackgrounded": false,
      "subagentType": "general-purpose",
      "parentAgentId": "agent-1",
      "parentName": "reviewer",
      "depth": 1
    }
  ]
}
```

Diese Route ist ein schreibgeschützter Out-of-Band-Schnappschuss. Sie ist absichtlich kein Prompt und kann abgefragt werden, während die Sitzung streamt. Die Antwort enthält nur whitelisted Metadaten aus den Agent-, Shell- und Monitor-Task-Registrierungen; Controller, Timer, Offsets, ausstehende Nachrichten und Roh-Registrierungsobjekte werden niemals offengelegt.

Agent-Tasks, die von einem anderen Sub-Agenten erzeugt wurden (verschachtelte Sub-Agenten, begrenzt durch `maxSubagentDepth`), enthalten drei optionale Lineage-Felder: `parentAgentId` (die `id` des erzeugenden Agent-Tasks), `parentName` (die `subagentType` des erzeugenden Agenten, erfasst bei der Registrierung, damit sie den Ausschluss des Elternprozesses aus dem Registry überlebt) und `depth` (0-basierte Starttiefe; 0 = vom Top-Level-Session erzeugt). Agenten, die von der Top-Level-Session gestartet werden, lassen `parentAgentId` und `parentName` weg; Clients sollten alle drei Felder als optional behandeln und auf eine flache Liste zurückgreifen, wenn sie fehlen.

### `GET /session/:id/tasks/:taskId/runtime`

Detailinformationen bei Bedarf für einen Shell-Task. `GET /session/:id/tasks` enthält nur Lifecycle-Fakten; diese Route liest die erfasste Ausgabedatei und prüft den Prozessbaum, sodass ein geöffnetes Detailfenster separat danach fragt.

Die ACP-Methode ist `_qwen/session/task_runtime` mit den Parametern `sessionId` und `taskId`. Beide Transports lösen den Besitzer der aktiven Session auf; ACP erfordert zusätzlich, dass die Verbindung die Session besitzt.

Das `taskId` des Pfads wird gegen das eigene Shell-Registry der Session aufgelöst; Aufrufer geben niemals einen Dateipfad an.

```json
{
  "v": 1,
  "sessionId": "<sid>",
  "taskId": "bg_0123abcd",
  "runtime": {
    "memoryBytes": 104857600,
    "outputBytes": 65536,
    "outputModifiedAt": 1700000000000,
    "outputTail": "ready in 120ms\n",
    "outputTailTruncated": true
  }
}
```

`runtime` ist `null`, wenn der Task unbekannt ist, ausgeschlossen wurde oder kein Shell-Task ist. `memoryBytes` ist der Resident Set des Prozessbaums der Shell, der nur während der Ausführung des Tasks abgetastet wird; geteilte Seiten werden einmal pro Prozess gezählt, und ein Container-Sandbox kann möglicherweise nur den Wrapper-Prozess offenlegen. `outputTail` ist auf dieselbe 8 KiB-Grenze beschränkt wie bei der Abschlussbenachrichtigung, und `outputTailTruncated` markiert ein Ende, das mitten in der Datei beginnt. `outputError` wird gesetzt, wenn die Datei nicht gelesen werden kann; Felder aus einem Teil, der erfolgreich war, können weiterhin vorhanden sein.

### `POST /session/:id/tasks/:taskId/workflow-action`

Steuert einen Workflow-Lauf oder startet einen neuen. Die ACP-Methode ist `_qwen/session/tasks/workflow_action`.

```json
{
  "action": "run-script",
  "script": "export const meta = { name: 'daily-audit', description: 'Audits yesterday' }\nreturn await agent(args.question)",
  "args": { "question": "which tables grew?" },
  "sourceRef": { "id": "definition-7", "revision": "rev-3" }
}
```

Was `taskId` benennt, hängt von der Aktion ab:

| `action` | `taskId` | Startet einen Lauf |
| ----------------------------------- | ------------------------------------------------------------------ | ---------------------- |
| `pause`, `resume`, `retry`, `rerun` | die Lauf-ID | `retry` und `rerun` tun dies |
| `delete-history` | die Lauf-ID | nein |
| `run-saved` | der Name des gespeicherten Workflows, `<extension>:<name>` für eine Erweiterung | ja |
| `run-script` | ein Startschlüssel, den der Aufrufer wählt | ja |

`args`, `sourceRef` und `script` werden nur von `run-saved` und `run-script` gelesen. `args` ist an das globale `args` des Skripts gebunden und kann jeder JSON-Wert sein; `sourceRef` ist das eigene `{id, revision}` des Aufrufers, aufgezeichnet im Lauf, seinem Journal und seinem Snapshot; `script` ist die Quelle, die `run-script` ausführt, und wird davon benötigt. Ein Retry oder Rerun spielt das eigene `args` und `sourceRef` des ursprünglichen Laufs erneut ab – das macht es zum selben Lauf –, daher werden diese Felder zusammen mit den Steueraktionen ignoriert.

Ein gestarteter Lauf gehört zur Session: Er läuft im Hintergrund ohne Genehmigungsaufforderung, und seine Abschlussmeldung erreicht den Abschlusskanal der Session. Danach ist er ein `retry`/`rerun`-Ziel wie jeder andere Lauf.

`retry` und `rerun` akzeptieren auch einen aus dem Verlauf wiederhergestellten Lauf (`isHistorical` in `GET /session/:id/tasks`), wie z. B. einen, der durch einen Daemon-Neustart unterbrochen wurde: Der Lauf wird erneut aus dem Skript, `args` und `sourceRef` seines Snapshots gestartet, registriert sich bei der Session, die die Aktion gesendet hat, und meldet seinen Abschluss dorthin. Ein `retry` setzt das Journal des Laufs unter derselben Lauf-ID fort und gilt für einen `failed`-Lauf, bei dem kein Prozess mehr läuft; ein `rerun` startet eine neue Lauf-ID von einem beliebigen abgeschlossenen Lauf. Ein Verlaufeintrag mit `argsOmitted` wurde mit einem zu großen `args` gestartet, um ihn zu behalten, daher gilt keine der beiden Aktionen dafür. Auch nicht für einen Snapshot, der geschrieben wurde, bevor `args` behalten wurden, da dieser weder `argsOmitted` noch `argsRecorded` enthält: Das Journal eines Laufs ist über einen Hash seiner `args` indiziert, sodass das Neustarten eines Laufs, dessen `args` sein Verlauf nicht benennen kann, nichts wiedergeben würde und jeden Agenten neu dispatchen würde. Beide Ablehnungen sind `workflow_args_unavailable`, und `GET /session/:id/tasks` meldet beide als `argsUnavailable` am Eintrag, sodass ein Client die beiden Aktionen zurückhalten kann, statt die Ablehnung durch den Aufruf zu entdecken. `argsOmitted` bleibt daneben als Grund stehen, für einen Client, der angeben möchte, welcher. Die `args` selbst werden niemals über die Leitung geschickt.

`run-script` übergibt keinen Definitionsnamen, daher wird der Lauf durch das eigene `export const meta` des Skripts bezeichnet – ein kompiliertes Skript sollte einen deklarieren, sonst zeigt der Lauf nur seine ID.

Die Antwort ist `{"changed": true, "status": "running", "taskId": "<runId>"}` für einen gestarteten Lauf, `{"changed": true, "status": "<status>"}` für eine wirksame Steueraktion und `{"changed": false}`, wenn nichts passiert ist: Workflow ist für die Session nicht verfügbar (deaktiviert, Bare-Mode, nicht vertrauenswürdiger Ordner), der Workspace ist nicht vertrauenswürdig, der gespeicherte Workflow-Name ist unbekannt, die Lauf-ID ist unbekannt oder ein anderer Start ist bereits unter demselben `taskId` im Gange. Nur überlappende Starts werden dedupliziert: Zwei gleichzeitige `run-script`-Aufrufe unter einer `taskId` starten einen Lauf. Sobald dieser Start zurückkehrt, wird der Schlüssel freigegeben; erneutes Absenden kann einen weiteren Lauf starten, auch wenn der erste Lauf noch aktiv ist. Der Schlüssel bietet keine Retry-Idempotenz nach einem verlorenen Antwortpaket.

Ein abgelehnter Parameter ist ein `400` (`-32602` über ACP), kein gestarteter Lauf: eine unbekannte `action`, eine `run-script` ohne `script`, eine `sourceRef`, die nicht `{id, revision}` aus nicht-leeren Strings ist, oder ein Skript, das vor dem Start wegen ungültiger Syntax oder Determinismusverletzung abgelehnt wurde. Eingabefehler beim Workflow-Start tragen `workflow_invalid_params` und behalten die Ablehnungsmeldung.

Vier Ablehnungen stammen aus dem gespeicherten Zustand des Laufs, nicht aus der Anfrage. Jede ist `-32602` über ACP, trägt ihre `errorKind` und ihre `data.httpStatus`. Drei sind ein `409`; die vierte, `workflow_not_recorded`, ist ein `503`, weil nichts gestartet wurde und derselbe Aufruf einfach wiederholt werden kann: Ein `retry` vermerkt, dass der Lauf erneut läuft, bevor er startet – dieser Vermerk verhindert, dass ein anderer Prozess ihn ein zweites Mal startet – und der Vermerk konnte nicht geschrieben werden.

| `code` / `errorKind` | HTTP | Wann | Was zu tun ist |
| ------------------------------ | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `workflow_journal_unavailable` | `409` | ein `retry`, dessen Lauf kein Journal auf der Platte hat, oder eines, das nicht gelesen werden kann | `rerun` Sie es, was es von Anfang an startet |
| `workflow_args_unavailable` | `409` | ein `retry` oder `rerun` eines Verlaufeintrags, der mit `argsUnavailable` markiert ist: Seine `args` waren zu groß zum Aufbewahren, oder sein Snapshot stammt aus einer Zeit davor | starten Sie ihn erneut mit `run-saved` oder `run-script` und seinem `args` |
| `workflow_run_live_elsewhere` | `409` | ein `retry` eines Laufs, dessen Checkpoint einen Prozess verzeichnet, der nicht als beendet gesehen wurde — einer, der noch läuft, einer auf einem anderen Rechner oder einer, dessen PID wiederverwendet wurde | `rerun` Sie es, was eine neue Lauf-ID nimmt |
| `workflow_not_recorded` | `503` | ein `retry`, dessen Aufzeichnung, dass der Lauf erneut läuft, nicht geschrieben werden konnte, sodass er nicht startete | machen Sie denselben Aufruf erneut; der Lauf ist unberührt |

`workflowToolFeatures` in `GET /session/:id/supported-commands` bewirbt `runSavedArgs` und `runScript`; ein Daemon ohne diese akzeptiert weder die Starteingabe noch die `run-script`-Aktion. Er enthält auch `nameOnly`, wahr, wenn das Modell der Sitzung nur benannte Workflows ausführen darf (`tools.workflowNameOnly`): Die eigenen `script`- und `scriptPath`-Aufrufe des Modells werden abgelehnt, während jede oben genannte Aktion, einschließlich `run-script`, weiterhin Läufe startet. `retryHistorical` ist wahr, wenn `retry` und `rerun` einen aus dem Verlauf wiederhergestellten Lauf akzeptieren; ein älterer Daemon antwortet darauf mit `{"changed": false}`, daher sollte ein Client diese Steuerelemente für einen Verlaufsdatensatz nur anbieten, wenn dies gemeldet wird.

### `GET /session/:id/lsp`

```json
{
  "v": 1,
  "sessionId": "<sid>",
  "workspaceCwd": "/canonical/path",
  "enabled": true,
  "configuredServers": 1,
  "readyServers": 1,
  "failedServers": 0,
  "inProgressServers": 0,
  "notStartedServers": 0,
  "servers": [
    {
      "name": "typescript",
      "status": "READY",
      "languages": ["typescript", "javascript"],
      "transport": "stdio",
      "command": "typescript-language-server"
    }
  ]
}
```

`status` ist eines von `NOT_STARTED`, `IN_PROGRESS`, `READY` oder `FAILED`. Das optionale `error` ist bei fehlgeschlagenen Servern vorhanden, sofern verfügbar. Deaktiviertes LSP (einschließlich Bare-Modus) gibt HTTP 200 mit `enabled: false`, null Zählungen und `servers: []` zurück. Aktiviertes LSP ohne konfigurierte Server gibt `enabled: true`, `configuredServers: 0` und `servers: []` zurück. Wenn die Initialisierung fehlschlägt, bevor der Client existiert, kann die Antwort `initializationError` enthalten; wenn ein Live-Client keinen Snapshot bereitstellen kann, enthält die Antwort `statusUnavailable: true`.

Diese Route legt nur stabile clientseitige Felder offen. Sie lässt absichtlich Debug-Interna wie Prozess-IDs, Spawn-Argumente, stderr-Abschnitte, Root-URIs und Workspace-Ordnerpfade aus.

### `GET /session/:id/resources`

```json
{
  "v": 1,
  "sessionId": "<sid>",
  "workspaceCwd": "/canonical/session/path",
  "skills": {
    "v": 1,
    "workspaceCwd": "/canonical/session/path",
    "initialized": true,
    "skills": []
  },
  "mcp": {
    "v": 1,
    "workspaceCwd": "/canonical/session/path",
    "initialized": true,
    "discoveryState": "completed",
    "servers": []
  }
}
```

Diese Route für den Besitzer einer Live-Sitzung liest die Config der ausgewählten Sitzung über ihre eigene ACP-Verbindung. Sie kombiniert nicht die prozessglobalen oder workspace-weiten Statusrouten, initialisiert keine kalte Laufzeitumgebung, hängt keinen Client an und fällt nicht auf den primären Workspace zurück. Unbekannte und nur persistierte Sitzungen geben die bestehende `session_not_found`-Antwort zurück.

Die verschachtelten Objekte verwenden die exakten `GET /workspace/skills`- und `GET /workspace/mcp`-Statusverträge. Deren `workspaceCwd`-Felder identifizieren die Config, die den Snapshot erzeugt hat, und entsprechen dem Top-Level-Wert. Bestehende Redaktionsregeln gelten weiterhin: MCP-Anmeldedaten und Header, Umgebungsvariablen, Skill-Inhalte und rohe Einstellungen erscheinen nie in der Antwort. MCP-Authentifizierung, Pool-, Workspace-Budget- und Workspace-Discovery-Fehler-Erweiterungen fehlen, da ihr zugrunde liegender Zustand workspace-eigen ist oder nur nach Servername statt nach Sitzung indiziert wird. Status, Discovery und Abrechnung vom eigenen MCP-Manager der ausgewählten Sitzung bleiben verfügbar.

### Eigenständiger Sitzungslifecycle (`standalone_sessions_v1`)

Wenn `/capabilities.features` `standalone_sessions_v1` enthält, stellt der Daemon eine prozessglobale Routenfamilie für eigenständige Top-Level-Sitzungen bereit, die seiner dedizierten Conversations-Laufzeitumgebung gehören. Diese Routen akzeptieren niemals einen Workspace-Selektor und fallen niemals auf die primäre Arbeitsfläche zurück. Direkte Einbettungen, die den vollständigen Conversations-Eigentümer-, Laufzeit-, Verzeichnis-, Lifecycle- und Löschjournal-Abhängigkeitsgraphen nicht konstruieren können, lassen sowohl das Feature als auch alle untenstehenden Routen aus.

| Route | Anfrage | Erfolg |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /standalone/sessions` | `{ "sessionId": "<UUID>", "modelServiceId"?: string, "startupConfig"?: { "modelServiceId": string, "reasoningEffort"?: ReasoningSelection }, "approvalMode"?: ApprovalMode }` | `200` mit der eigenständigen Sitzung, `context: { "kind": "standalone" }` und ihrem verwalteten projektlosen Ausgabeverzeichnis. Erstellung erfolgt ohne Prompt. |
| `GET /standalone/session-options` | keine; jedes Query-Feld wird mit 400 abgelehnt | `200` mit `{ v, initialized, current?, approvalMode?, providers, errors? }`; der interne Workspace-Pfad und der ACP-Kanalzustand werden ausgelassen |
| `GET /standalone/sessions` | Query: `cursor?`, `size?` (1-100), `archiveState?` (`active` oder `archived`) | `200 { sessions, nextCursor?, liveMergeFailed?, truncated? }` |
| `GET /standalone/sessions/:id` | keine | `202 { sessionId, state: "creating" }` während lokale Erstellung läuft, andernfalls `200` mit der exakten Zusammenfassung. |
| `POST /standalone/sessions/:id/load` | Nur bestehende Wiederherstellungsoptionen: `historyPageSize?`, `liveReplayMode?`, `compactedReplayMode?`, `hideInheritedHistory?`, `approvalMode?`; Clientidentität bleibt in `X-Qwen-Client-Id`. | `200` wiederhergestellte eigenständige Sitzung. |
| `POST /standalone/sessions/:id/resume` | Gleiche Wiederherstellungsoptionen wie `load`. | `200` wiederhergestellte eigenständige Sitzung ohne Wiedergabe des Verlaufsprotokolls. |
| `POST /standalone/sessions/:id/repair-directory` | Leerer Body oder `{}` | `200` mit dem verifizierten oder neu erstellten verwalteten Verzeichnis. |
| `PATCH /standalone/sessions/:id/metadata`        | `{ "displayName": string }`                                                                                                                                                          | `200 { sessionId, displayName }`                                                                                                               |
| `GET /standalone/sessions/:id/export` | Query: `format=html`, `format=md`, `format=json` oder `format=jsonl` (Standardwert `html`). | Vorhandener Exportinhaltstyp, Dateiname und Body. |
| `POST /standalone/sessions/archive`              | `{ "sessionIds": ["<UUID>", ...] }`                                                                                                                                                  | `200 { archived, alreadyArchived, notFound, errors }`                                                                                          |
| `POST /standalone/sessions/unarchive`            | `{ "sessionIds": ["<UUID>", ...] }`                                                                                                                                                  | `200 { unarchived, alreadyActive, notFound, errors }`                                                                                          |
| `POST /standalone/sessions/delete`               | `{ "sessionIds": ["<UUID>", ...] }`                                                                                                                                                  | `200 { removed, notFound, errors, fileCleanupPending }`                                                                                        |

Wenn `POST /standalone/sessions` das Legacy-`modelServiceId` trägt, enthält die Antwort `modelApplied`: `false` bedeutet, dass der Modellwechsel beim Start fehlgeschlagen ist (auch über das `model_switch_failed`-Sitzungsereignis sichtbar gemacht) und die Sitzung auf dem Agent-Standardmodell läuft — die Erstellung selbst gelingt weiterhin, sodass der Aufrufer explizit warnen, freigeben oder erneut versuchen kann.

Bodies müssen JSON-Objekte ohne unbekannte Felder sein. IDs sind RFC-UUID-v1-v5-Werte; der Daemon normalisiert sie zu Kleinbuchstaben. Batch-Anfragen enthalten 1-100 Strings und werden vor der Mutation validiert und dedupliziert. Ein Batch-Fehler wird als `{ sessionId, code, message }` gemeldet und rollt erfolgreiche Operationen bei anderen IDs nicht zurück. `fileCleanupPending` bedeutet, dass die Transkriptlöschung committet wurde, aber die journal-autorisierte Sidecar- oder verwaltete Verzeichnisbereinigung durch Reconciliation erneut versucht werden muss; die Sitzung ist bereits logisch entfernt.

Nur explizite eigenständige Transkripte und das dokumentierte Top-Level-Legacy-Kompatibilitätsformat sind sichtbar. Kind-, Live-, Projekt-, Worktree-, mehrdeutige, unlesbare oder löschjournalisierte Datensätze schlagen fehl (fail closed). Die Erstellung setzt fort, wenn ihre HTTP-Antwort getrennt wird; eine committete Sitzung wird nicht gelöscht und der Antwortclient wird abgetrennt. Erholen Sie sich durch exakte GET-Gefolgt-von-Load/Resume anstatt die Erstellung als Attach erneut zu versuchen.

Archivierung, Dearchivierung, Reparatur, Umbenennung und Löschung teilen dieselbe sitzungsspezifische Lifecycle-Zulassung wie Load/Resume und Prompts. Löschung verwendet Transkript-Unlinking als ihren dauerhaften Commit-Punkt sowie ein privates Journal plus atomare verwaltete Verzeichnis-Staging für die Crash-Wiederherstellung. Die Wiederherstellung stellt das Verzeichnis wieder her, wenn das Transkript intakt bleibt, und schließt die Bereinigung ab, wenn das Transkript verschwunden ist; jede identitätsmismatch, konfliktreicher Pfad, fremder Eigentümer oder mehrdeutiges Transkript gibt einen strukturierten Fail-Closed-Fehler zurück.

### `POST /session`

Der optionale `startupConfig`-Vertrag wird unter [Capabilities](#capabilities) beschrieben. Im Gegensatz zur Legacy-Best-Effort-Modellauswahl schlägt eine abgelehnte Startauswahl die Erstellung fehl.

Starten eines neuen Agents oder Anhängen an einen bestehenden (unter `sessionScope: 'single'`, standardmäßig).

Anfrage:

```json
{
  "cwd": "/absolute/path/to/workspace",
  "modelServiceId": "qwen-prod",
  "sessionId": "550e8400-e29b-41d4-a716-446655440000",
  "sessionScope": "thread",
  "worktree": { "slug": "feature-a" }
}
```

| Feld | Erforderlich | Hinweise |
| ---------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cwd` | nein | Absoluter Pfad, der einer registrierten Arbeitsfläche entspricht. Wenn weggelassen, fällt die Route auf die primäre Arbeitsfläche zurück (lesen Sie ihn von `/capabilities.workspaceCwd` ab). Ein nicht leerer, nicht übereinstimmender `cwd` gibt `400 workspace_mismatch` zurück. Wenn `features` `multi_workspace_sessions` enthält, können Clients jedes vertrauenswürdige `workspaces[].cwd` übergeben; andernfalls wird nur die primäre Arbeitsfläche akzeptiert. Workspace-Pfade werden über `realpathSync.native` kanonisiert (mit einem Resolve-only-Fallback für nicht existierende Pfade), damit case-insensitive Dateisysteme Sitzungen nicht aufgrund der Schreibweise ablehnen. |
| `modelServiceId` | nein | Wählt aus, welchen konfigurierten _Modelldienst_ der Agent durchleiten wird (den Backend-Provider — Alibaba ModelStudio, OpenRouter usw.). Wenn weggelassen, verwendet der Agent seinen Standard. Wenn die Arbeitsfläche bereits eine Sitzung hat, ruft dies `setSessionModel` auf der bestehenden auf und sendet `model_switched` broadcast. Unterscheidet sich von `modelId` auf `POST /session/:id/model`, welches das Modell **innerhalb** eines bereits gebundenen Dienstes auswählt. Das `modelServices`-Array auf `/capabilities` ist reserviert für die Werbung konfigurierter Dienste; in Stage 1 ist es immer `[]` (der Standarddienst des Agents wird verwendet und nicht über HTTP enumeriert). |
| `startupConfig` | nein | `{ modelServiceId: string, reasoningEffort?: ReasoningSelection }`; erfordert `session_startup_config`, erstellt einen neuen Thread und bestätigt die angeforderte Auswahl ohne Schreiben gemeinsamer Standards. Kann nicht mit top-level `modelServiceId` oder explizitem einzelnen Scope gemischt werden. |
| `sessionId` | nein | RFC-Variant UUID v1-v5, gewählt vom Aufrufer. Der Daemon normalisiert sie zu Kleinbuchstaben und erstellt immer eine frische Thread-Sitzung; er behandelt dieses Feld niemals als idempotenten Attach. Stellen Sie sicher, dass `caps.features` `session_id_override` enthält, bevor Sie es senden, da ältere Daemons unbekannte Felder ignorieren könnten. `null` ist äquivalent zum Weglassen. |
| `sessionScope` | no | Überschreibung pro Anfrage für die Sitzungsfreigabe. `'single'` (der Daemon-weite Standardwert) bewirkt, dass eine zweite `POST /session` im selben Workspace die bestehende Sitzung wiederverwendet (`attached: true`); `'thread'` erzwingt bei jedem Aufruf eine neue, separate Sitzung. Weglassen, um den Daemon-weiten Standardwert zu übernehmen. Werte außerhalb des Enums geben `400 { code: 'invalid_session_scope' }` zurück. Ältere Daemons (vor #4175 PR 5) ignorieren das Feld stillschweigend – führen Sie vorab `caps.features.session_scope_override` aus, bevor Sie senden. Der Daemon-weite Standardwert ist in der Produktion heute auf `'single'` festgeschrieben; #4175 könnte in einem Folge-Update einen `--sessionScope` CLI-Schalter hinzufügen. |
| `worktree` | no | Erstellt eine neue Thread-Sitzung in einem Git-Worktree mit benutzerdefiniertem Namen. Das optionale `slug` verwendet die Worktree-Namensvalidierung des Daemons. Vorabprüfung `session_worktree_persistence_v1`; Clients dürfen nicht von dauerhafter Isolation aus älteren worktree-förmigen Antworten ausgehen. Die Erstellung eines Worktrees ist kein Attach-Vorgang und kann nicht mit der Erstellung eines Branches kombiniert werden. Die Route gibt Erfolg erst nach der Verschiebung, der Erstellung des exklusiven Ownership-Markers, der Sidecar-Persistenz und einer abschließenden Prüfung der Laufzeitgeneration zurück. |

Antwort:

```json
{
  "sessionId": "<uuid>",
  "workspaceCwd": "/canonical/path",
  "attached": false,
  "worktree": {
    "slug": "feature-a",
    "path": "/canonical/path/.qwen/worktrees/feature-a",
    "branch": "worktree-feature-a"
  },
  "worktreeState": "persisted-v1"
}
```

`attached: true` bedeutet, dass bereits eine Sitzung für diesen Workspace existierte und Sie diese nun teilen.

`worktreeState` ist nur für eine attestierte Worktree-Sitzung vorhanden. Legacy-Best-Effort-Wiederherstellung kann `worktree` ohne `worktreeState` zurückgeben. Eine kalte Part-4A-Wiederherstellung, deren Wiederherstellungs-Prompt ausgelöst statt geparkt wurde (`suppressWorktreeContextRestore` aus, sodass die Route die Bridge gebeten hat, keine Verzögerung vorzunehmen), gibt ebenfalls unverifizierte `worktree`-Metadaten zurück, bis der Prompt abgeschlossen ist: Das Kind liest aktiv ohne gemeldetes cwd, eine Verschiebung ist unter einem aktiven Prompt nicht möglich, und die Route behält die Sitzung bei, anstatt diejenige zu beenden, die der Aufrufer gerade wiederhergestellt hat. Keine dieser Antworten ist ein Nachweis für eine dauerhafte Ausführungswurzel. Ein Client, der Worktree-Isolation angefordert hat, muss `worktreeState: "persisted-v1"` und den erwarteten kanonischen Pfad verlangen, bevor er einen Prompt weiterleitet; eine anfängliche Ladung kann erneut versucht werden, nachdem der aktive Prompt abgeschlossen ist. Bei einer SDK-Reattach hängt das Ergebnis davon ab, ob die Antwort noch `worktree`-Metadaten enthält: Eine Antwort, die diese mit fehlender Attestation oder geändertem Pfad enthält, ist für diesen Client terminal – die neue Anbindung wird getrennt und der Prompt wird nicht erneut versucht –, während eine Antwort ohne `worktree`-Objekt heilt: Der Client verwirft seinen gecachten Worktree-Anspruch, behält die neue Anbindung bei und versucht den Prompt im selben Aufruf erneut. Die Heilung steuert diesen erneuten Versuch nicht, sodass ein Turn weiterhin in einem Verzeichnis ausgeführt werden kann, das der Client nicht mehr attestieren kann (ein `exit_worktree`, den der Client nie gesehen hat, ist die übliche Ursache, und der Client kann es nicht von einer gelöschten In-Memory-Zuordnung unterscheiden). Ein isolationsbewusster Aufrufer muss daher die Worktree-Attestation selbst erneut überprüfen, bevor er einen Prompt sendet; der verworfene Anspruch führt dazu, dass dieser Aufrufer an seinem eigenen Identitätsgate beim nächsten Laden oder Auswählen fail-closed scheitert.

Vom Aufrufer bereitgestellte IDs sind eindeutig über alle derzeit registrierten Workspace-Runtimes und jede noch lebende Bridge-Generation hinweg, einschließlich drainender Ersetzungen. Eine lebende, ausstehende, aktive, archivierte oder worktree-gestützte Duplikat-ID gibt `409 session_id_conflict` zurück. Ungültige Werte geben `400 invalid_session_id` zurück; eine nicht verfügbare Prüfung des lebenden Eigentümers oder des persistierten Zustands gibt wiederholbares `503 session_id_admission_unavailable` zurück. Wiederholen Sie mit begrenztem Backoff nach Änderungen an der Bridge- oder Speicherintegrität; `retryable` bedeutet, dass ein weiterer Versuch sicher ist, nicht dass ein sofortiger Wiederholungsversuch erfolgreich sein wird. Wenn der nachgelagerte Agent eine andere ID zurückgibt, entfernt der Daemon diese Waise und gibt `500 session_id_not_honored` zurück. Nach einer mehrdeutigen Antwort laden oder setzen Sie die bekannte ID fort, anstatt create als attach erneut zu versuchen.

Multi-Client-Integrationen, die unabhängige Konversationen wünschen, sollten `sessionScope: "thread"` bei jedem `POST /session` senden. Verwenden Sie den Standard-`single`-Scope nur, wenn Clients absichtlich eine kollaborative Sitzung teilen; geteilte Sitzungen serialisieren Prompts über eine FIFO, sichtbar durch `/daemon/status` als `runtime.activity.pendingPrompts` und `runtime.activity.queuedPrompts`.

Gleichzeitige `POST /session`-Aufrufe für denselben Workspace werden **koalesziert** zu einem Spawn – beide Aufrufer erhalten dieselbe `sessionId`, genau einer meldet `attached: false`. Wenn der zugrunde liegende Spawn fehlschlägt (Init-Timeout, fehlerhafte Agent-Ausgabe, OOM), **erhalten alle koaleszierten Aufrufer denselben Fehler** – der In-Flight-Slot wird geleert, sodass ein Folgeaufruf von Grund auf neu wiederholen kann.

> ⚠️ **`modelServiceId`-Ablehnung bei einer neuen Sitzung ist im HTTP-Antwortcode stumm.** Ein ungültiges `modelServiceId` (Tippfehler, nicht konfigurierter Dienst) führt NICHT zu einem 500-Fehler beim Erstellen — die Sitzung bleibt auf dem Standardmodell des Agenten funktionsfähig, sodass der Aufrufer immer noch ein `sessionId` erhält, gegen das er den Modellwechsel erneut versuchen kann (über `POST /session/:id/model`). Das sichtbare Fehlersignal ist ein `model_switch_failed`-Ereignis im SSE-Stream der Sitzung, ausgelöst zwischen dem Spawn-Handshake und Ihrem ersten Subscribe. **Abonnenten, die dieses Ereignis beobachten müssen, sollten `Last-Event-ID: 0` bei ihrem ersten `GET /session/:id/events` übergeben**, um vom ältesten verfügbaren Ereignis im Ring neu zu spielen (deckt das Spawn-Zeit-`model_switch_failed` ab, selbst wenn das Subscribe einige ms nach der Create-Antwort landet).

### `GET /session/:id/status`

Geben Sie die Live-Zusammenfassung aus der Laufzeitumgebung zurück, die die Sitzung besitzt. Diese Route lädt keine nur persistierte Sitzung und fällt niemals auf die primäre Laufzeitumgebung zurück. Pre-flight `caps.features.session_status`.

```json
{
  "sessionId": "<sid>",
  "workspaceCwd": "/canonical/path",
  "createdAt": "2026-09-10T08:00:00.000Z",
  "clientCount": 1,
  "hasActivePrompt": true,
  "isWaitingForPermission": false,
  "isWaitingForUserQuestion": false,
  "pendingInteractionCount": 0,
  "pendingInteractions": []
}
```

Die Antwort ist das `DaemonSessionSummary`-Wire-Format. Optionale Felder umfassen Anzeige- und Quellmetadaten, `activeWorkState`, `updatedAt`, `turnError`, Worktree- oder Branch-Metadaten und PR-Bindings. `404` bedeutet, dass kein Live-Besitzer existiert; ein bootstrappender, drainender oder nicht verfügbarer Besitzer gibt stattdessen `503` zurück, ohne Fallback. Ein nicht vertrauenswürdiger Nicht-Primär-Besitzer gibt `403 untrusted_workspace` zurück, und eine ID, die in mehr als einem Workspace live ist, gibt `500 ambiguous_session_owner` zurück. Die TypeScript-SDK-Methode ist `sessionStatus()`.

### ACP `session/new` vom Aufrufer bereitgestellte ID

ACP-Clients fordern dasselbe Verhalten über das Extension-Metadatenfeld an:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "session/new",
  "params": {
    "cwd": "/absolute/path/to/workspace",
    "_meta": {
      "qwen-code/sessionId": "550E8400-E29B-41D4-A716-446655440000"
    }
  }
}
```

Die Antwort enthält die normalisierte Kleinbuchstaben-ID. Primäre und workspace-qualifizierte ACP-Mounts teilen sich die Zulassung mit REST, einschließlich `session/load` und `session/resume`. Ungültige IDs verwenden ACP `INVALID_PARAMS` mit `data.httpStatus=400` und `data.errorKind="invalid_session_id"`; Konflikte verwenden `data.httpStatus=409`; nicht verfügbare Prüfungen des lebenden Eigentümers oder des persistierten Zustands verwenden `data.httpStatus=503` und `data.retryable=true`.

Eine von ACP erstellte Sitzung, die nie eine Eingabeaufforderung erhält, hinterlässt keine persistierten Spuren, und der Daemon entfernt sie, wenn ihre besitzende Verbindung mit null angehängten Sitzungen schließt. Nach dieser Entfernung kann dieselbe ID erneut erstellt werden – das ist Verbindungslebenszyklus, keine ID-Wiederverwendung: Solange die Verbindung (oder jede Anhängung) aktiv ist, lehnt die Zulassung Duplikate ab.

### `POST /session/:id/load`

`liveReplayMode` und `compactedReplayMode` akzeptieren `full` (Standard) oder `summary`. Sie projizieren jeweils `liveJournal` und `compactedReplay`, ohne den gespeicherten Verlauf zu ändern. Seitenwahl erfolgt vor Filterung, daher können sichtbare Elemente weniger als `historyPageSize` sein. Ungültige Werte geben `400 invalid_live_replay_mode` oder `400 invalid_compacted_replay_mode` zurück. Standalone-Load akzeptiert beide Optionen, meldet aber ungültige Werte als `400 invalid_request`.

Stellen Sie eine persistierte ACP-Sitzung anhand ihrer ID wieder her und spielen Sie ihre Historie über SSE ab. Der Pfad-ID ist maßgeblich; jedes `sessionId`-Feld im Textkörper wird ignoriert. Vorabprüfung `caps.features.session_load` – ältere Daemons geben für diese Route `404` zurück.

Anfrage:

```json
{
  "cwd": "/absolute/path/to/workspace"
}
```

| Feld | Erforderlich | Hinweise |
| ----- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cwd` | nein | Dieselbe Kanonisierung wie bei `POST /session`, mit einer strengeren Abwesenheitsvereinbarung für die Wiederherstellung: Ein explizites `cwd` ohne Registry-Eintrag (entfernt oder nie registriert) gibt `404 workspace_not_found` zurück – eine dauerhafte Abwesenheit, die Aufrufer als „gone“ klassifizieren können –, während ein Workspace, dessen Eintrag sich in einem reversiblen Zustand befindet (draining, transitioning, blocked), weiterhin `400 workspace_mismatch` zurückgibt. Weglassen, um `/capabilities.workspaceCwd` zu erben. Wenn `features` `multi_workspace_sessions` enthält, können Aufrufer jedes vertrauenswürdige registrierte `workspaces[].cwd` übergeben; nicht vertrauenswürdige Nicht-Primär-Workspaces geben `403 untrusted_workspace` zurück. `mcpServers` wird hier absichtlich NICHT akzeptiert – daemonweites MCP ist einstellungsgetrieben (entspricht `POST /session`). |

Antwort:

```json
{
  "sessionId": "persisted-1",
  "workspaceCwd": "/canonical/path",
  "attached": false,
  "state": {
    "models": { ... },
    "modes": { ... },
    "configOptions": [ ... ]
  }
}
```

`state` spiegelt ACPs `LoadSessionResponse` wider – `models` ist ein `SessionModelState`, `modes` ein `SessionModeState`, `configOptions` ein Array aus `SessionConfigOption`. Fehlende Felder werden vom Agenten entschieden. Späte Anhänger (die `attached: true`-Pfade unten) erhalten denselben `state`-Snapshot, den der ursprüngliche Lade-Aufrufer sah – der Daemon speichert ihn im Eintrag; Laufzeitänderungen (z. B. `model_switched`) werden über den SSE-Stream zugestellt, nicht über nachfolgende Attach-Antworten.

`attached: true` bedeutet, dass die Sitzung bereits aktiv war (entweder durch eine vorherige `session/load`/`session/resume` oder weil ein zusammengeführter gleichzeitiger Aufrufer knapp voraus war).

Wenn die persistierte Sitzung einen Part 4A Worktree besitzt, validiert load/resume seinen Sidecar, die kanonische Enthaltensein-Bedingung und den exakten Checkout-Marker. Eine inaktive Kind-Sitzung wird vor der Antwort verlegt; eine aktive Kind-Sitzung wird nur dann attestiert, wenn ihr gemeldetes cwd bereits dem Worktree entspricht, und eine aktive Kind-Sitzung, deren gemeldetes cwd fehlt oder anderswo liegt, schlägt fehl, anstatt unter ihre Eingabeaufforderung verschoben zu werden – außer bei einer kalten Wiederherstellung, die ihre restore-prompt nicht aufschieben konnte (`suppressWorktreeContextRestore` aus – jede Wiederherstellung, deren effektive Quelle nicht Channel-owned ist – oder eine Brücke ohne die Aufschub-API): Diese Form gibt weiterhin `worktree` ohne `worktreeState` zurück, unverlegt, und die Sitzung bleibt bestehen. Die verlegten und attestierten Antworten geben `worktree` plus `worktreeState: "persisted-v1"` zurück. Typisierte 409-Klassifikationen auf Wiederherstellungsseite (beworben durch `session_worktree_reset_v1`): `worktree_session_superseded`, wenn der Sidecar der Sitzung einen `supersededBy`-Link trägt – die Klassifikation liest nur diesen Link, unter der pro-Checkout-Besitzsperre und vor jedem Marker-Lesen, sodass ein Transfer, der während des Wartens des Ladens zurückrollt, den Aufrufer nicht auf eine Sitzung umleiten kann, die derselbe Daemon gerade löscht; der Link wird geschrieben, bevor der Marker wechselt, daher ist das `replacementSessionId` im Textkörper ein Redirect zur Überprüfung, kein Beweis dafür, dass der Besitz gewechselt hat: Nach einem committeten Transfer sollten Aufrufer stattdessen diese ID laden und ihre Buchführung aktualisieren, aber in einem unterbrochenen Pre-Commit-Zustand benennt sie einen Ersatz, der nicht der Marker-Besitzer ist, dessen eigene Wiederherstellung `worktree_reset_interrupted` zurückgibt und den der wiederholte Reset dann entfernt – daher darf `replacementSessionId` nicht als Sitzungs-ID der Aufgabe persistiert werden, bis ein Laden davon erfolgreich ist; `worktree_reset_interrupted`, wenn der `supersedes`-Link der wiederhergestellten Sitzung und der `supersededBy`-Link der benannten Sitzung übereinstimmen, aber der Marker nie bewegt wurde oder fehlt – ein vorheriger Reset stürzte mitten im Transfer ab und ein wiederholter Reset ist die Reparatur; und `worktree_marker_missing`, wenn der Checkout-Marker ohne dieses übereinstimmende Link-Paar fehlt – das Zurücksetzen der Aufgabe ist die Reparatur, da kein Wiederherstellungspfad einen Marker neu erstellt und ein Wiederherstellungsversuch denselben 409 zurückgibt. Die unterbrochene Klassifikation wird zuerst geprüft, sodass ein übereinstimmendes Link-Paar nie als `worktree_marker_missing` auftaucht. Immer wenn die effektive Wiederherstellungsquelle Channel-owned ist, unterdrückt die Route die Best-Effort-Bereinigung des Agenten für Part 4A oder unklassifizierbaren Sidecar-Zustand, sodass veralteter, fremder, mehrdeutiger oder besitzinkongruenter persistierter Zustand erhalten bleibt und die Anfrage fehlschlägt. Persistierte Quellmetadaten haben Vorrang; wenn sie fehlen, liefert die load/resume-Anfrage die effektive Quelle. Ein strukturell gültiger Legacy-Sidecar ohne das Part 4A `workspaceCwd`-Feld behält die bestehende Best-Effort-Agenten-Wiederherstellung bei, kann von diesem Pfad bereinigt werden und kann `worktree` ohne `worktreeState` zurückgeben; Clients dürfen aus diesen Kompatibilitätsmetadaten keine Isolation ableiten. Abgesehen von diesem expliziten Legacy-Kompatibilitätsfall behalten nur Sitzungen, deren effektive Wiederherstellungsquelle nicht Channel-owned ist, die bestehende Best-Effort-Bereinigung vor der Routenvalidierung bei. Ein fehlender Sidecar gibt keine Worktree-Attestation zurück; isolationsbewusste Clients müssen diese Antwort ablehnen, anstatt die Sitzung an den gemeinsamen Workspace neu zu binden.

**Verlaufswiederholung über SSE.** Während `loadSession` auf der Agentenseite in Bearbeitung ist, kann der Agent `session_update`-Benachrichtigungen für persistierte Runden senden oder umfangreiche Wiederholungsaktualisierungen in den Antwort-Metadaten zurückgeben. Der Daemon speist diese Ereignisse in das begrenzte Wiederholungs-Snapshot-Fenster der Sitzung ein, bevor die Routenantwort zurückkehrt. Für Live-Sitzungen verspricht `POST /session/:id/load` nur dieses begrenzte Fenster (`compactedReplay`, `liveJournal`, optional `lifecycleReplay`, `lastEventId`), nicht das vollständige Transkript. Wenn eine inaktive Live-Sitzung aus einer begrenzten persistierten Seite aktualisiert wird, ergänzt `lifecycleReplay` diese Seite mit bis zu 1024 reinen Metadaten-`session_update`-Frames, die `_meta.executionLifecycle` oder `_meta.toolLifecycle` aus dem In-Memory-Fenster tragen. Die Ergänzung kann mit persistierten Lifecycle-Datensätzen überlappen; Clients müssen sie idempotent reduzieren und dürfen nicht davon ausgehen, dass wiederholte Starts noch laufen. `lifecycleReplayIncomplete: true` meldet nicht verfügbare, degradierte oder abgeschnittene In-Memory-Abdeckung; `false` verspricht kein vollständiges Transkript. Diese optionalen Felder sind kein separat persistierter Speicher, und ältere Daemons können sie weglassen. Das Fenster ist durch `--compacted-replay-max-bytes` byte-begrenzt (Standard 4 MiB, Maximum 256 MiB); wenn ältere Wiederholungseinträge verworfen wurden, ist `compactedReplay[0]` ein Marker ohne ID vom Typ `history_truncated`. Das laufende `liveJournal` ist separat durch `--max-journal-events` (Standard 10.000 Wiederholungseinträge) und `--max-journal-bytes` (Standard 8 MiB serialisierte Quellereignisse) begrenzt. Dies sind **Grundlinien**-Begrenzungen pro Sitzung. Wenn eine laufende Runde diese überschreitet, versucht der Daemon zuerst adaptives Wachstum: Er erhöht die Begrenzungen dieser Sitzung in Richtung Verdopplung (bis zu einer harten Begrenzung von 256 MiB pro Sitzung, Einträge proportional skaliert, begrenzt durch den verbleibenden Pool-Spielraum), solange das über alle Live-Sitzungen gewährte Wachstum in einen Daemon-weiten Wachstums-Pool passt, der mit 5 % des effektiven Speicherbudgets des Daemons dimensioniert ist — der Wert von `--memory-budget-mb`, wenn übergeben, begrenzt auf aufgelösten verfügbaren Speicher, andernfalls 50 % des automatisch erkannten Speichers — begrenzt auf `1024` MB. Die Abrechnung erfolgt Daemon-weit — ein Multi-Workspace-Daemon führt eine Bridge pro Workspace aus, und alle teilen sich den einzelnen Pool. Wachstum erfolgt bei Bedarf und nur soweit der Pool es erlaubt; ein vom Operator festgelegtes `--max-journal-events` oder `--max-journal-bytes` deaktiviert dies, ebenso wie ein Host, dessen effektives Budget unter das Minimum von 1024 MB fällt (`insufficientMemory`): Der Pool ist dann 0 und adaptives Wachstum ist vollständig deaktiviert. Aufeinanderfolgende kompatible `agent_message_chunk`- oder `agent_thought_chunk`-Quellereignisse teilen sich einen Wiederholungseintrag, bis zu 256 Quellereignisse pro Eintrag, während Tool-, Attributions-, Provenienz- und diskrete Nachrichten-Grenzen intakt bleiben. Wenn das Journal seine (möglicherweise gewachsenen) Begrenzungen nach dem vom Pool erlaubten Wachstum immer noch überschreitet — einschließlich wenn kein Spielraum gewährt wird oder eine Gewährung nur einen Teil der Überschreitung abdeckt — werden die ältesten Einträge ganz verworfen (so dass der beibehaltene Schwanz viel kleiner als die Byte-Begrenzung sein kann) und ein `history_truncated`-Marker mit `scope: 'live_journal'` wird vorangestellt; seine `truncatedEvents`- und `retainedEvents`-Felder zählen Quellereignisse, keine Wiederholungseinträge, und seine `maxBytes`-/`maxEvents`-Felder spiegeln die geltenden Begrenzungen wider (die bereits gewachsen sein können). Clients sollten diesen Marker als Status anzeigen und weiterhin die beibehaltenen Ereignisse anwenden. Vollständiger Zugriff auf persistierte Transkripte wird separat über `GET /session/:id/transcript` bereitgestellt.

Die Byte-Begrenzungen des Wiederholungsfensters gelten, nachdem das Kind das persistierte Transkript rekonstruiert hat; sie begrenzen nicht die JSONL-Lesung auf der Festplatte. Eine Wiederherstellung, die das Daemon-Budget überschreitet, gibt `504` mit einem aus dem Wiederherstellungsbudget abgeleiteten `Retry-After` (begrenzt auf 5–120 s) und `{code: "session_restore_timeout", errorKind: "restore_timeout", retryable: true, sessionId, action, timeoutMs}` zurück. Der Daemon riegelt die noch laufende ACP-Anfrage und bereinigt jede verspätete Sitzung, anstatt sie zu registrieren. Ein erneuter Versuch für dieselbe ID gibt `409 restore_in_progress` mit `reason: "awaiting_abandoned_cleanup"` und einem `Retry-After` des Wiederherstellungsbudgets (begrenzt auf 5–120 s) zurück, bis diese Bereinigung abgeschlossen ist. Wenn die verspätete Wiederherstellungsbereinigung unsicher ist oder die aufgegebene Wiederherstellung auch nach Ablauf ihrer Frist das volle Wiederherstellungsbudget nicht abgerechnet hat, geben neue Sitzungen in diesem Workspace `503 acp_channel_unavailable` mit `reason: "restore_cleanup_failed"` oder `"restore_settlement_overdue"` zurück. Eine zeitüberschrittene Sitzungsinitialisierung folgt derselben Fail-Closed-Zulassungsrichtlinie für ein älteres ACP-Kind, das sich verspätet abwickelt: Unsichere Bereinigung gibt `reason: "new_session_cleanup_failed"` zurück, während eine Anfrage, die für ein weiteres Initialisierungsbudget ungelöst bleibt, `reason: "new_session_settlement_overdue"` zurückgibt. Ein Zustand mit überfälliger Abwicklung klärt sich sofort, nachdem eine verspätete Fehlschlag abgewickelt wurde, oder nachdem ein verspäteter Erfolg seine exakte-ID-Bereinigung abschließt; unsichere Bereinigung geht stattdessen in den entsprechenden Bereinigungsfehler-Zustand über. Bereinigungsfehler-Zustände bestehen fort, bis der Workspace-Kanal geleert und recycelt ist. Bereits aktive Sitzungen bleiben in beiden Fällen nutzbar.

**Fehler:**

- `404` — Persistierte Sitzungs-ID existiert nicht (`SessionNotFoundError`).
- `404` — `workspace_not_found`, wenn ein explizites `cwd` überhaupt keinen Registry-Eintrag hat (entfernt oder nie registriert): eine DAUERHAFTE Abwesenheit, unterschieden von den unten stehenden reversiblen Zuständen. Body: `{ error, code: "workspace_not_found", boundWorkspace, requestedWorkspace }` — kein `workspaceCount`. Ein Client, der den alten Vertrag "404 bedeutet, die Sitzung ist weg" gelesen hat, sollte diesen Code als Routing-Fehler betrachten, den er umleiten kann (z. B. Workspace neu registrieren), nicht als Beweis dafür, dass die Sitzung gelöscht wurde.
- `400` — `workspace_mismatch` (gleiche Form wie `POST /session`), einschließlich der reversiblen Lifecycle-Zustände: ein Workspace, dessen Registry-Eintrag existiert, aber entleert, übergeht oder blockiert ist. Versuchen Sie es erneut, sobald der Workspace stabilisiert ist; klassifizieren Sie ihn nicht als verschwunden.
- `403` — `untrusted_workspace`, wenn `cwd` auf einen nicht vertrauenswürdigen Nicht-Primär-Workspace abzielt.
- `503` — `session_limit_exceeded` (zählt gegen `--max-sessions`; laufende Wiederherstellungen werden ebenfalls berücksichtigt).
- `504` — `session_restore_timeout`; wiederholbar, mit einem aus dem Wiederherstellungsbudget abgeleiteten `Retry-After` (begrenzt auf 5–120 s), da dieselbe Sitzungs-ID bis zur Abschlussbereinigung geriegelt bleibt.
- `504` — `init_timeout`; NICHT wiederholbar, kein `Retry-After`, kein `sideEffectPossible`, kein Riegel installiert. Wird emittiert, wenn die Kanalinitialisierung zeitlich überschreitet, bevor die Wiederherstellungsanfrage gesendet wird (die `ensureChannel`-Phase); die Wiederherstellung wurde nie versucht, daher ist keine Sitzungs-ID geriegelt und keine Bereinigung ausstehend.
- `503` — `acp_channel_unavailable` wenn der Workspace-Kanal für neue Sitzungsarbeiten geschlossen ist. `reason` erklärt den Grund: `restore_cleanup_failed` wenn eine abgebrochene Wiederherstellung nicht abschließend bereinigt werden konnte; `restore_settlement_overdue` wenn eine abgebrochene Wiederherstellung auch nach Ablauf der Frist noch nicht innerhalb eines vollen Wiederherstellungs-Budgets abgeschlossen wurde; `new_session_cleanup_failed` wenn eine Sitzung, die nach dem öffentlichen Initialisierungs-Timeout erstellt wurde, nicht abschließend geschlossen werden konnte; oder `new_session_settlement_overdue` wenn die initialisierte Sitzung mit Timeout auch nach Ablauf der Frist noch nicht innerhalb eines weiteren Initialisierungs-Budgets abgeschlossen wurde. Bestehende Sitzungen bleiben verfügbar. Auf einer Workspace-Laufzeitumgebung mit mehr als einer Ausführungs-Engine isoliert jeder dieser Zustände den Kanal dieser Engine stattdessen: Dessen Sitzungen nehmen ebenfalls keine neuen Arbeiten an (Prompts, Fortsetzungen, Nebenanfragen, Shell-Befehle, Nachrichten während des Turniers sowie Start von Zielen oder Workflows geben dasselbe `503` zurück), abgeschlossene Sitzungen werden geschlossen und neue Sitzungen dieser Engine werden weiterhin abgelehnt, bis der Prozessbaum des Kanals verschwunden ist, wobei `channel_exit_unverified` gilt, solange dies nicht bestätigt werden kann. Dort bedeutet `workspace_change_unacknowledged`, dass der Kanal eine sitzungsbetroffene Workspace-Änderung (Berechtigungsregeln, Einstellungen-Neuladen, das Session-Workflow-Gate, Modell-Anbieter oder Skills) nicht bestätigt hat; eine verspätete Bestätigung aller fehlenden Änderungen beendet diese Isolierung vorzeitig. Ein Zustand „Settlement-overdue“ wird gelöscht, nachdem ein verspäteter Fehler sich gesetzt hat oder ein verspäteter Erfolg seine exakte-ID-Bereinigung abgeschlossen hat; eine unabschließbare Bereinigung geht in den entsprechenden cleanup-failed-Zustand über, der erfordert, dass der Workspace-Kanal entleert und recycelt wird. Der Body enthält `retryAfterSeconds` und der Header einen passenden budget-abgeleiteten `Retry-After`, damit Clients einen Backoff im Maßstab des Operations-Budgets verwenden, statt im üblichen 5-Sekunden-Takt zu pollen.
- `409` — `restore_in_progress` (ein `session/resume` für dieselbe ID ist bereits in Bearbeitung, oder ein neuer Spawn lieferte eine ID, die eine Wiederherstellung besitzt). `Retry-After: 5` während die Wiederherstellung aktiv ist; ein budget-abgeleiteter Hinweis, sobald sie als `awaiting_abandoned_cleanup` gesperrt ist. Rennen um dieselbe Aktion (zwei gleichzeitige `session/load` für dieselbe ID) werden zusammengeführt — genau einer gibt `attached: false` zurück, die anderen geben `attached: true` mit derselben `state` zurück.
- `409` — `session_workspace_conflict` wenn dieselbe Sitzungs-ID bereits live ist oder von einer anderen Workspace-Laufzeitumgebung wiederhergestellt wird.
- `409` — `session_archived` wenn die ID nur unter `chats/archive/` existiert; rufen Sie `POST /sessions/unarchive` vor `load` oder `resume` auf.
- `409` — `session_archiving` wenn Archivieren oder Entarchivieren für dieselbe ID in Bearbeitung ist. `Retry-After: 5`.
- `409` — `session_conflict` wenn die ID sowohl in `chats/` als auch in `chats/archive/` existiert; löschen Sie die Sitzung mit `POST /sessions/delete` vor dem Laden.

### `GET /session/:id/transcript`

Geben Sie eine Seite von idlosen `session_update` Replay-Frames zurück, die aus dem aktiven persistierten JSONL-Transkript rekonstruiert wurden. Pre-flight `caps.features.session_transcript` — ältere Daemons geben `404` für diese Route zurück.

Abfrageparameter:

| Feld | Erforderlich | Hinweise |
| --------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cursor` | nein | Undurchsichtiger base64url-Cursor, der von der vorherigen Seite zurückgegeben wurde. Weglassen für die erste Seite. Der Cursor wird vom Daemon ausgegeben und ist manipulationssicher geprüft; eine Änderung ergibt `400 invalid_transcript_cursor`. Er ist an die Identität der Transkriptdatei und die eingefrorene Bytegröße der ersten Seite gebunden; Löschen, Kürzen, Ersetzen oder Archivieren der Datei invalidiert ihn und ergibt `409`. |
| `limit` | nein | Zielanzahl aktiver `ChatRecord`s pro Seite. Standardwert `100`, Maximum `500`. Eine rückwärts gerichtete Seite kann auf maximal `3 * limit` Datensätze expandiert werden, um Turnier- und Tool-Aufruf/Ergebnis-Grenzen zu erhalten. Ein Datensatz kann mehrere Replay-Frames erzeugen, daher kann `events.length` noch größer sein. Ungültige Werte ergeben `400 invalid_transcript_limit`. |
| `direction` | nein | Der einzige akzeptierte Wert ist `backward`, was eine Seite bei den neuesten Datensätzen startet. Lassen Sie den Parameter weg, um auf der ersten Seite vorwärts zu blättern oder die in `cursor` eingefrorene Richtung fortzusetzen. Kann nicht mit `cursor`, `beforeRecordId`, `atRecordId` oder `snapshot` kombiniert werden. |
| `beforeRecordId` | nein | Startet eine rückwärts gerichtete Seite vor dieser Datensatz-ID. Impliziert rückwärts, senden Sie also nicht zusätzlich `direction`. Kann nicht mit `cursor` oder `atRecordId` kombiniert werden; kann mit `snapshot` gepaart werden. |
| `compactedReplayMode` | nein | `full` (Standard) oder `summary`. Projiziert `events` nach der Seitenauswahl, sodass die sichtbare Anzahl kleiner als `limit` sein kann. Ändert weder gespeicherte Historie noch Cursorauswahl. Wird auch von der workspace-qualifizierten Transkript-Route akzeptiert. Ungültige Werte ergeben `400 invalid_compacted_replay_mode`. |

Antwort:

```json
{
  "v": 1,
  "sessionId": "persisted-1",
  "events": [
    {
      "v": 1,
      "type": "session_update",
      "data": {
        "sessionUpdate": "user_message_chunk",
        "content": { "type": "text", "text": "..." }
      }
    }
  ],
  "nextCursor": "opaque",
  "hasMore": true,
  "startTime": "2026-07-08T00:00:00.000Z",
  "lastUpdated": "2026-07-08T00:01:00.000Z"
}
```

`events` sind nur Replay-Frames: `{ v: 1, type: "session_update", data: SessionUpdate }`. Sie tragen keine EventBus-IDs, und die Antwort enthält niemals `lastEventId`. Das Aufrufen dieser Route ruft nicht `/load` auf, hängt keinen Client an, säht den Live-EventBus nicht, erstellt keine Live-Sitzung und ändert nicht das aktuelle Live-Replay-Fenster. Aktive Live- und inaktive aktive Sitzungen werden beide durch die kindseitige schreibgeschützte Statusmethode rekonstruiert, sodass das Replay dieselben Workspace-Einstellungen, Ausgabeverzeichnisse der Laufzeitumgebung, Emitters und `/load`-Historien-Semantik verwendet, ohne den Daemon-Sitzungsstatus zu verändern.

Die erste Seite friert die aktuelle JSONL-Snapshot-Größe ein. Spätere Seiten lesen nur dieses Byte-Präfix, sodass Anhänge nach Seite 1 das Ergebnisset nicht ändern. Wenn die Datei verschwindet, unter die eingefrorene Größe gekürzt wird, durch eine andere Inode ersetzt wird oder ins Archiv verschoben wird, gibt die nächste Seite `409` zurück und der Client sollte bei Seite 1 neu starten oder den Benutzer bitten, das Transkript erneut zu öffnen.

Zum Schutz des Daemon-Speichers und der Latenz schlagen Snapshots über der Obergrenze für die Transkript-Indizierung fehl, bevor der Daemon die JSONL scannt. Clients erhalten `413 transcript_too_large` und sollten auf Export-/Offline-Verarbeitung zurückgreifen oder den Benutzer bitten, ältere Historie zu kürzen/archivieren.

`partial: true` und `replayError` können auftreten, wenn die Replay-Konvertierung fehlschlägt, nachdem einige Frames erzeugt wurden. Teilweise Antworten enthalten niemals `nextCursor`, sodass Clients nicht stillschweigend über Datensätze hinwegblättern können, die nicht konvertiert wurden.

**Fehler:**

- `400` — ungültige `limit`, `cursor`, `direction`, `beforeRecordId` oder Sitzungs-ID-Form. Die Paging-Parameter sind gegenseitig ausschließend: `cursor` kann nicht mit `beforeRecordId`, `atRecordId` oder `snapshot` kombiniert werden; `snapshot` erfordert `atRecordId` oder `beforeRecordId`; `atRecordId` erfordert `snapshot`; und `backward` kann nicht mit einem Cursor oder einem beliebigen Datensatz-Anker kombiniert werden.
- `404` — die aktive persistierte Sitzungs-ID existiert bei der Anfrage zur ersten Seite nicht.
- `409` — `session_archived`, `session_archiving` oder `session_conflict` aus denselben Loadability-Checks wie `/load`.
- `409` — der Transkript-Snapshot ist nicht verfügbar, weil die Datei gelöscht, gekürzt, ersetzt oder archiviert wurde, nachdem der Cursor ausgegeben wurde; dies gilt auch, wenn Preflight die aktive Datei für eine Cursor-Anfrage nicht mehr finden kann.
- `413` — `transcript_too_large` wenn der eingefrorene Transkript-Snapshot die Indizierungs-Obergrenze des Daemons überschreitet.
- `413` — `transcript_page_too_large` wenn ein aggregierter Datensatz das workspace-qualifizierte Seitenbudget überschreitet oder die serialisierte Seite ihr Antwortbudget überschreitet.

### `GET /session/:id/export`

Laden Sie das aktive persistierte Sitzungstranskript des primären Workspaces herunter. Die optionale `format`-Abfrage ist `html` (Standard), `md`, `json` oder `jsonl`. Pre-flight `caps.features.session_export`.

Erfolgreiche Antworten sind Anhänge mit einem bereinigten Dateinamen, `Cache-Control: no-store` und `X-Content-Type-Options: nosniff`. Der Content-Type ist `text/html`, `text/markdown`, `application/json` oder `application/jsonl` gemäß dem gewählten Format. Die Route liest nur persistierten Speicher: sie löst keinen Live-Besitzer auf, startet kein ACP und hängt keinen Client an. Verwenden Sie die unten angegebene workspace-qualifizierte Route, wenn sich das Ziel in einem Nicht-Primär-Workspace befinden könnte. Ungültige Formate geben `400 invalid_export_format` zurück; fehlende aktive Sitzungen geben `404` zurück; archivierter, übergehender oder konfliktbehafteter Speicher gibt `409` zurück. Die TypeScript-SDK-Methode ist `exportSession()`.

### `GET /workspaces/:workspace/session/:id/transcript`

Geben Sie dieselbe `DaemonSessionTranscriptPage`-Projektion wie bei der singulären Route aus dem aktiven persistierten JSONL des ausgewählten registrierten Arbeitsbereichs zurück. Vorabprüfung von `workspace_persisted_transcript`; diese Fähigkeit ist unabhängig von `multi_workspace_sessions` und funktioniert für einen vertrauenswürdigen Einzel-Arbeitsbereich-Primärprozess, der nach ID oder cwd ausgewählt wurde.

Die Selektor- und Abfrageparameter folgen den bestehenden Regeln für mehrere Arbeitsbereiche und Transkripte. Vertrauenswürdige Primär- und Sekundär-Runtimes sowie unvertrauenswürdige Sekundär-Runtimes dürfen lesen. Ein unvertrauenswürdiger Primärprozess gibt `403 untrusted_workspace` zurück. Archivierter Inhalt wird nicht zurückgegeben.

Für diese arbeitsbereichsqualifizierte Route ist `limit` die maximale Anzahl an Datensätzen für vorwärtsgerichtete Seiten. Eine rückwärtsgerichtete Seite kann auf höchstens `3 * limit` Datensätze erweitert werden, damit Dialoge und Tool-Aufruf/Ergebnis-Paare intakt bleiben. Eine Seite kann früher am 4 MiB persistenten Quellbudget stoppen und einen Fortsetzungscursor zurückgeben. Serialisierte Antworten sind auf 32 MiB begrenzt und Cursoren auf 64 KiB. Wenn der Replay-Zustand das Cursor-Limit überschreiten würde, gibt die Seite ihre erfolgreich konvertierten Ereignisse mit `partial: true`, `hasMore: false` und ohne `nextCursor` zurück.

Vorwärtsseiten und Cursor-Seiten werden vollständig innerhalb des Daemon-Prozesses implementiert. Eine rückwärtsgerichtete erste Seite für eine Live-Sitzung überschreitet zuerst eine Workspace-Bridge-Flush-Barriere mit einem Datensatz, damit das persistente Ende aktuell ist; diese Barriere kann ACP starten und Workspace-Einstellungen laden. Das Lesen der persistierten Seite selbst parst keine projektdefinierten Agenten oder Skills und erstellt/repariert keine `session-transcript-cursor-key`. Tool-Frames verwenden persistente Tool-Namen und -Beschreibungen, ohne die Runtime-Tool-Registry zu konsultieren. Ihr HMAC-Cursor-Schlüssel existiert nur im Daemon-Speicher, ist pro Arbeitsbereich isoliert und rotiert beim Neustart; ein Cursor aus einem vorherigen Daemon-Prozess gibt `400 invalid_transcript_cursor` zurück.

### `GET /workspaces/:workspace/session/:id/export`

Exportieren Sie die aktive persistierte Sitzung des ausgewählten registrierten Arbeitsbereichs als Anhang. Vorabprüfung von `workspace_session_export`; leiten Sie die Unterstützung nicht aus `session_export` oder `workspace_qualified_rest_core` ab. Der Selektor wird zuerst als exakte Workspace-ID aufgelöst, dann als URL-kodierter absoluter Pfad (cwd) nach der Kanonisierung. Sowohl Primär- als auch Sekundär-Runtimes müssen vertrauenswürdig sein. Eine unvertrauenswürdige Runtime gibt `403 untrusted_workspace` zurück, bevor die Sitzungs- oder Formatvalidierung erfolgt.

Das optionale `format`-Abfrageargument ist `html` (Standard), `md`, `json` oder `jsonl`. Der Body, MIME-Typ, die Dateinamenbereinigung, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff` und die Anhang-Disposition entsprechen `GET /session/:id/export`. Die Legacy-Route bleibt an den primären Speicher gebunden.

Die Plural-Route liest nur das aktive persistierte JSONL des ausgewählten Arbeitsbereichs unter dem bestehenden gemeinsamen Archiv-Koordinator. Sie scannt keine anderen Workspace-Stores, fällt nicht auf den Primärprozess zurück, löst keinen Live-Besitzer auf, ruft die Workspace-Bridge nicht auf, startet kein ACP, hängt keinen Client an und lädt keine Einstellungen. Eine Sitzungs-ID, die nur in einem anderen Arbeitsbereich existiert, gibt `404 { code: "session_not_found" }` zurück; archivierte Sitzungen geben `409 session_archived` zurück. Ungültige Formate geben `400 invalid_export_format` zurück, und Speicher-Races behalten die bestehenden `session_archiving`- und `session_conflict`-Fehler bei.

### `GET /workspaces/:workspace/session/:id/archive/export`

Exportieren Sie die archivierte persistierte Sitzung des ausgewählten registrierten Arbeitsbereichs als Anhang. Vorabprüfung von `workspace_archived_session_export`; die Unterstützung kann nicht aus aktiven Export- oder Plural-Core-Fähigkeiten abgeleitet werden. Die Auflösung des Workspace-Selektors und die Vertrauensprüfungen laufen vor der Validierung von Sitzungs-ID und Format.

TypeScript-SDK-Aufrufer verwenden `WorkspaceDaemonClient.exportArchivedSession(sessionId, options)`. Die Methode verwendet immer natives REST und gibt die bestehende `DaemonSessionExportResult`-Anhang-Projektion zurück.

Das optionale `format`-Abfrageargument, der Antwort-Body, der MIME-Typ, der bereinigte Dateiname, die Cache-Richtlinie, der Sicherheitsheader und die Anhang-Disposition sind identisch mit dem aktiven Workspace-Export. Die Quelle des archivierten JSONL ist vor der Rekonstruktion auf 256 MiB begrenzt; eine größere Datei gibt `413 transcript_too_large` mit `sessionId`, `snapshotSize` und `maxBytes` zurück. Der aktive Export behält sein bestehendes Größenverhalten bei.

Die Route liest nur `chats/archive/<id>.jsonl` im ausgewählten vertrauenswürdigen Arbeitsbereich unter einer Lease des gemeinsamen Archiv-Koordinators. Sie prüft keine aktiven Inhalte auf Fallback, scannt keinen anderen Arbeitsbereich, löst keinen Live-Besitzer auf, ruft keine Bridge auf, startet kein ACP, hängt keinen Client an und lädt keine Einstellungen. Eine nur-aktive ID gibt `409 { code: "session_not_archived" }` zurück; eine fehlende ID gibt `404 { code: "session_not_found" }` zurück; gleichzeitige aktive und archivierte Dateien geben `409 session_conflict` zurück; und ein Archivübergang gibt `409 session_archiving` mit `Retry-After: 5` zurück.

### `POST /session/:id/resume`

Stellen Sie eine persistierte ACP-Sitzung anhand der ID wieder her, OHNE den Verlauf über SSE erneut abzuspielen. Der Modellkontext wird intern auf der Agentenseite wiederhergestellt (durch `geminiClient.initialize`, das `config.getResumedSessionData` liest); der SSE-Stream bleibt sauber für Clients, die den Verlauf bereits gerendert haben. Vorabprüfung von `caps.features.session_resume`; `unstable_session_resume` bleibt ein veralteter Kompatibilitätsalias für ältere Clients.

Akzeptiert dieselben `cwd`-, `approvalMode`-, `sourceType`- und `sourceId`-Felder wie `/load`. Die Load-only-Replay-Felder `historyPageSize`, `liveReplayMode` und `compactedReplayMode` werden hier nicht geparst, validiert oder weitergeleitet – sie werden stillschweigend ignoriert, was dem veröffentlichten Resume-Request-Schema entspricht. Gleiche Antwortstruktur – `state` spiegelt ACPs `ResumeSessionResponse` wider. Gleiche Fehlerhülle, einschließlich `409 restore_in_progress` (welches ausgelöst wird, wenn ein `session/load` in Bearbeitung ist; ein `session/resume`, der hinter einem anderen `session/resume` herläuft, wird zusammengeführt).

Verwenden Sie `/load`, wenn der Client keinen Verlauf gerendert hat (Kalt-Reconnect, Picker → Öffnen). Verwenden Sie `/resume`, wenn der Client die Dialoge bereits auf dem Bildschirm hat und nur den Daemon-seitigen Handle zurück benötigt.

> ⚠️ **Warum wird `unstable_session_resume` weiterhin beworben?** Die HTTP-Route des Daemons und die `session_resume`-Fähigkeit sind für v1 stabil, aber die Bridge ruft weiterhin ACP's `connection.unstable_resumeSession` auf. Das alte Tag bleibt nur bestehen, damit SDKs, die vor `session_resume` veröffentlicht wurden, weiterhin funktionieren.

### `POST /session/:id/worktree-reset`

Überträgt das Checkout-Eigentum einer persistierten Part-4A-Worktree-Sitzung auf eine neue Ersatzsitzung. Pre-flight `session_worktree_reset_v1` — ältere Daemons geben für diese Route `404` zurück. Die Route ermöglicht es Channel named-task `/clear`, eine Worktree-Aufgabe zurückzusetzen, ohne ihre Dateien zu verwerfen: Die Ersetzung erhält eine brandneue Konversation, und die ersetzte Sitzung behält ihr Transkript im Katalog, kann aber nie wiederhergestellt werden.

Anfragetext (alle Felder optional):

```json
{
  "cwd": "/canonical/path",
  "modelServiceId": "service-id",
  "approvalMode": "plan",
  "sourceType": "channel",
  "sourceId": "dingtalk-main"
}
```

`cwd` folgt derselben Auflösung wie `POST /session/:id/load` und kann für den primären Arbeitsbereich des Daemons weggelassen werden. Die Metadatenfelder stempeln die Ersatzsitzung mit denselben Thread-Scope- und Quellkonventionen wie bei einer Worktree-Erstellung.

Bei Erfolg gibt die Route `200` mit der Create-Shape-Antwort der Ersatzsitzung zurück — die neue `sessionId`, `workspaceCwd`, `currentCwd` gleich dem verifizierten kanonischen Worktree-Pfad, `worktree` Metadaten und `worktreeState: "persisted-v1"`. Aufrufer verwerfen ihren Handle auf die alte ID und verwenden ab dann die Ersatz-ID; die spätere Wiederherstellung der alten ID gibt `worktree_session_superseded` mit `replacementSessionId` zurück, was Clients auch zur Selbstheilung veralteter Buchführung nutzen können — aber nur, wenn ein Laden dieser ID erfolgreich war. Die Klassifizierung wird allein aus dem Sidecar-Link entschieden, und dieser Link wird geschrieben, bevor der Marker umschaltet, sodass eine unterbrochene Übertragung vor dem Commit eine Ersetzung zurückgibt, die nicht der Marker-Besitzer ist, deren eigene Wiederherstellung `worktree_reset_interrupted` zurückgibt und die dann vom erneut versuchten Reset abgeräumt wird.

Diese Route liest niemals `X-Qwen-Client-Id`, daher startet die Ersetzung unangehängt — aber die Erfolgsantwort ist nicht registrierungsfrei. Eine frische Übertragung prägt einen Owner-Style-`clientId` für diesen Start, registriert ihn auf der Ersetzung und meldet ihn im Body; eine idempotente Fortsetzung einer committeten Übertragung meldet keinen. Die geprägte ID ist keine Anhängung (die Attach-Zählung der Ersetzung bleibt unverändert, sodass `killSession` mit `requireZeroAttaches` sie weiterhin als unangehängt sieht), aber eine lebende Client-Registrierung verhindert genau die Idle-Cleanup des Daemons: Hängen Sie eine ID ab, die Sie nicht weiterverwenden, oder die Ersetzung bleibt indefinitely live — und eine Ersetzung, die noch live ist ohne Marker, ist die Form, die ein späterer Reset nicht abbauen kann. Behandeln Sie die Antwort als die Identität der Ersetzung und hängen Sie sie über die normale `POST /session/:id/load`- oder `/resume`-Oberfläche an, wenn ein registrierter Client erforderlich ist.

Die Übertragung ist pro Checkout serialisiert gegenüber Worktree-Wiederherstellungen und anderen Resets, verweigert die Ausführung, während entweder Sitzung busy ist (Prompt in flight oder ausstehende Interaktion), und rüstet eine Admission-Barriere auf der ersetzten Sitzung: Während sie aktiv ist, werden neun Writer mit `worktree_reset_active` bei Admission verweigert — `POST /session/:id/prompt`, `/rewind`, `/cd`, `/branch`, `/fork`, `/shell`, `/goal`, `/tasks/:taskId/workflow-action` und `/messages/delete`. Die anderen acht sind eingezäunt, weil jeder das cwd der Sitzung bewegt oder Arbeit darin beginnt, ohne die Prompt-Admission zu passieren: Ein Shell-Befehl läuft im effektiven cwd der Sitzung, welches für eine verlegte Worktree-Sitzung der Checkout selbst ist; ein Fork-Agent führt seine Tools in diesem cwd aus; ein Rewind stellt Dateien relativ dazu wieder her; ein cd bewegt es, einschließlich in ein Unterverzeichnis des Checkouts; ein Branch mutiert die persistierte Historie der ersetzten Sitzung und erzeugt eine derivative Sitzung, während das Eigentum im Fluss ist; ein Goal `resume` befördert eine gewartete Turn und wartet eine Fortsetzung; Nachrichtenlöschung schreibt die persistierte Historie neu; und eine Workflow-Aktion führt einen gespeicherten Workflow oder ein caller-supplied Script aus oder startet einen live Run über die Tool-Registry der Sitzung selbst neu. `POST /session/:id/continue` ist kein zehntes Gate: Es treibt eine akzeptierte Fortsetzung durch die eingezäunte Prompt-Admission und wird dort verweigert. Diese Liste ist der gesamte Zaun, und der Zaun ist nicht alles, was das Kind erreicht — die Release- und Stop-Pfade bleiben mitten in der Übertragung nutzbar by design (Abbrechen einer Aufgabe, Löschen eines Goals, Abhängen eines Clients, Töten der Sitzung), und das Daemon-interne Background-Notification-Enqueue — die Completion-Acknowledgement einer Sub-Sitzung an ihre Parent, die von keiner HTTP-Route aufgerufen wird — ist ebenfalls unfenced, da es eine Notification enqueued statt einen Turn zu starten. Der letzte Schritt der Übertragung trennt die Client-Registrierungen der ersetzten Sitzung, löscht ihre In-Memory-Worktree-Assoziation und meldet, ob die ersetzte Sitzung tatsächlich weg ist. Ein Survivor — ein Kind, das noch Hintergrundarbeit hält, sodass der Idle-Close, den das letzte Detach auslöst, verweigert und aufgeschoben wird — wird offengelegt statt übertüncht: Der Daemon loggt es, die Barriere bleibt auf diesem Entry aktiv als einziger verbleibender Zaun, und der `200`-Body trägt `supersededSessionLive: true`, damit der Caller weiß, dass die ersetzte ID noch live und re-attachable innerhalb des Checkouts ist, dessen Eigentum gerade verschoben wurde. Crash-Safety ist pro Fenster, und die Schreibreihenfolge definiert die Fenster: Der `supersededBy`-Link des alten Sidecars wird zuerst geschrieben, dann der Sidecar der Ersetzung mit `supersedes`, und der Marker schaltet zuletzt um. Ein Crash vor dem Umschalten lässt daher die alte Sitzung in einer von drei Formen autoritativ, die ein Retry unterscheidet — keine Links überhaupt (die Ersetzung ist ein gewöhnliches Orphan und ein Retry startet einfach eine frische Übertragung), der Rückwärts-Link allein mit fehlendem Sidecar der Ersetzung (ein Retry scheitert closed mit `worktree_reset_invalid_state` und lässt den unterbrochenen Zustand unberührt für Operator-Reparatur), oder beide Links vorhanden (ein Retry rollt die teilweise Übertragung zurück und vollendet eine frische — es sei denn, die unterbrochene Ersetzung kann nicht entfernt werden, weil ein Client noch angehängt ist, in welchem Fall das Rollback closed mit `worktree_reset_invalid_state` scheitert und beide Links behält, sodass ein späterer Retry konvergiert, sobald dieser Client weg ist). Ein Crash nach dem Umschalten lässt die Ersetzung autoritativ und ein Retry setzt als No-op fort. Die alte Sitzung wird niemals gelöscht und der Worktree-Checkout wird niemals durch Reset entfernt.

**Fehler:**

- `404` — `session_not_found`, wenn der Sitzungsdatensatz nicht existiert.
- `409` — `worktree_reset_unsupported`, wenn die Sitzung keinen gültigen Part-4A-Sidecar hat (keine Worktree-Sitzung).
- `409` — `worktree_reset_active`, wenn eine an der Übertragung beteiligte Sitzung busy ist; versuchen Sie es erneut, sobald sie sich beruhigt hat. Admission jedes Writers, den die Barriere abdeckt — ein Prompt, Rewind, cwd-Änderung, Branch, Fork, Shell-Befehl, Goal-Control oder Workflow-Task-Aktion — auf einer Sitzung mitten in der Übertragung schlägt mit demselben Code fehl.
- `409` — `worktree_reset_invalid_state` für eine beschädigte Sidecar-Datei, einen ungültigen Marker, einen Containment-Fehler oder ein inkonsistentes Supersede-Link-Paar. Nicht destruktiv für das, was diese Anfrage gestartet hat: Jeder von dieser Anfrage begonnene teilweise Transfer wird zurückgerollt, bevor der Aufrufer ihn sieht, während die fail-closed Resume-Zweige — ein ungültiger Marker, ein Supersede-Link-Paar, das nicht übereinstimmt (einschließlich eines Rückwärtslinks, dessen Ersatz-Sidecar fehlt), ein mehrdeutiger Marker-Besitzer und ein Ersatz, der auf diesem Daemon noch aktiv ist, während der Marker fehlt — den vorbestehenden unterbrochenen Zustand für die Reparatur durch den Operator unberührt lassen, sodass diese Form für einen späteren Reset oder Restore sichtbar bleibt. Ein erneuter Versuch gegen einen dieser Zustände liest ihn erneut und gibt denselben 409 zurück: Er konvergiert nicht, daher benötigt der Zustand eine Reparatur durch den Operator anstelle einer Wiederholungsschleife. Der spezifische Grund wird in das Daemon-Log geschrieben, nicht über die Leitung.
- `500` — Fail-Closed-interne Fehler (zum Beispiel ein Bridge ohne Reset-Unterstützung oder eine Relocation-Ablehnung nach dem Rollback); nicht wie vorhanden wiederholbar. Ein `500` unterscheidet sich in der Art: Ein Marker-Transfer, dessen eigener Post-Commit-Tail _nach_ dem dauerhaft committeten Flip fehlgeschlagen ist, meldet, dass das Eigentum verschoben wurde, führt den destruktiven Rollback nie aus und wird repariert, indem der Reset erneut versucht wird, was den committeten Transfer idempotent fortsetzt.

### `GET /workspace/:id/session-info` and `GET /workspaces/:workspace/session-info`

Geben Sie aggregierte persistierte Session-Anzahlen für den ausgewählten Workspace zurück, ohne den paginierten Session-Listenpfad zu ändern:

```json
{
  "active": 450,
  "archived": 30,
  "total": 480,
  "live": 2,
  "expensive": true,
  "cost": "disk_scan"
}
```

`active`, `archived` und `total` zählen benutzersichtbare lokale JSONL-Sessions; interne Daemon-Host-Sessions und Workspace-Agent-Task-Sessions (`sourceType` `agent-host` und `agent`) sind von diesen Zählungen und von jeder Session-Auflistung ausgeschlossen; eine Person öffnet eine Agent-Session weiterhin per ID. `live` ist die entsprechende benutzersichtbare In-Memory-Bridge-Anzahl und wird für einen registrierten untrusted Secondary-Workspace weggelassen, da dieser nur-persistierte Lesevorgang keinen Live-State abfragen darf. `expensive` ist immer `true` und `cost` ist immer `"disk_scan"`; Clients müssen diesen Endpunkt selten aufrufen, anstatt ihn abzufragen. Wenn der Scan sein Sicherheitslimit erreicht oder jede Kandidatendatei klassifizieren kann, fügt die Antwort `"truncated": true` hinzu und die persistierten Zählungen sind Untergrenzen. Fehlender Speicher liefert null persistierte Zählungen. Die Plural-Route verwendet denselben Workspace-Selektor und dieselbe Trust-Richtlinie wie der Plural-Session-Katalog; ein untrusted Primary gibt weiterhin `403 untrusted_workspace` zurück.

Das TypeScript-Daemon-SDK stellt die Plural-Route über `workspaceById(...)` oder `workspaceByCwd(...)` bereit, gefolgt von `getWorkspaceSessionInfo()`.

### Workspace-Session-Artefakt-Bibliothek

`workspace_artifact_library` bewirbt zusätzlich Workspace-weite Abfragen und Batch-Operationen:

| Methode | Route | Eingabe |
| ------ | ------------------------------------------------ | ------------------------------------------------------------------------------- |
| GET | `/workspaces/:workspace/artifact-library` | Alle aktiven, entladenen und archivierten Sessions im Workspace |
| POST | `/workspaces/:workspace/artifact-library/query` | `{ "sessionIds": ["session-id"] }` |
| POST | `/workspaces/:workspace/artifact-library/delete` | `{ "artifacts": [{ "sessionId": "session-id", "artifactId": "artifact-id" }] }` |

Beide POST-Bodies sind strenge Objekte mit 1–100 Einträgen. Doppelte IDs oder Paare werden nur einmal verarbeitet. Query-Antworten sind `{ "v": 1, "sessions": [<session artifact envelope>], "errors": [<member error>] }`. Jeder Mitgliederfehler enthält `sessionId`, `status`, `code` und `message`. Vollständige Discovery lässt fehlende/fremde Sessions aus; eine explizite Abfrage meldet diese. Andere Mitgliederfehler bleiben explizit, während erfolgreiche Sessions zurückgegeben werden.

Mit `workspace_artifact_library_stream` enthält jede Session-Hülle der Artifact-Bibliothek (einschließlich des bestehenden Single-Session-GET) zusätzlich:

```json
{
  "session": {
    "displayName": "Task title",
    "createdAt": "2026-10-26T00:00:00.000Z",
    "archiveState": "archived",
    "sourceType": "scheduled_task",
    "sourceId": "task-id"
  }
}
```

`displayName` und `sourceId` sind optional. `createdAt` ist die ursprüngliche Session-Erstellungszeit, auch nach einem Resume; es ist kein Artifact-Zeitstempel. `archiveState` ist `active` oder `archived`. Quellentypen sind offene Strings und fehlende Attributierung wird zu `default`. Quellen wie `resource_inspection` werden beibehalten, damit Clients diese explizit ausschließen können. Eine Quell-ID wird mit ihrem ursprünglichen Quellentyp gepaart. Namen folgen dem aktuellen Live-Titel oder persistierten Custom-Titel/First-Prompt. Die generische `/session/:id/artifacts`-Antwort bleibt unverändert.

Das vollständige GET und das ausgewählte Session-POST akzeptieren ebenfalls `Accept: text/event-stream`. Ohne diese Verhandlung geben sie die oben genannte JSON-Antwort zurück. Verwenden Sie fetch-basiertes Streaming für POST; prüfen Sie die Capability und den Response-Content-Type bei älteren Daemons. Die endliche SSE-Sequenz ist:

| Ereignis | Daten |
| --------------- | -------------------------------------------------------------------------------- |
| `start`         | `{ "v": 1, "total": <candidate sessions> }`                                      |
| `session` | Eine vollständige Artefakt-Bibliotheks-Envelope einschließlich `session` |
| `session_error` | `{ "v": 1, "sessionId": "...", "status": 404, "code": "...", "message": "..." }` |
| `complete`      | `{ "v": 1, "total": 10, "succeeded": 8, "failed": 1, "skipped": 1 }`             |
| `error` | Fataler `{ "v": 1, "status": 503, "code": "...", "message": "..." }` |

Ergebnisse treffen in Abschlussreihenfolge ein, mit bis zu vier gleichzeitigen Session-Lesevorgängen; eine langsame Session blockiert keine anderen Worker. JSON behält die Auswahlreihenfolge bei. Fehlende/fremde Sessions bei Full-Query zählen als `skipped`; Fehler bei Explicit-Query lösen `session_error` aus. `total` zählt Kandidaten, nicht Artifacts. Nur `complete` markiert einen abgeschlossenen Scan. Fataler `error` oder Verbindungsabbruch ohne `complete` bedeutet teilweise Ergebnisse; es gibt keinen Replay-Cursor, keine automatische Reconnect-Funktion und kein Subscription-Modell. Heartbeat-Kommentare können beim Warten auftreten. Initiale Fehler verwenden normale HTTP-Statuscodes; nach SSE-Headers sind fatale Fehler Stream-Events. Eine unterbrochene Anfrage stoppt das Dispatching neuer Lesevorgänge; bereits laufende Shared-Cache-Ladevorgänge können fertiggestellt werden. Backpressure begrenzt ausstehende Ergebnis-Frames und hält Archiv-Barriers nicht fest, während auf den Client gewartet wird.

Batch-Entfernung gibt `{ "v": 1, "results": [...] }` zurück. Jedes Ergebnis enthält `sessionId` und `artifactId`, plus entweder die bestehende Mutation-Hülle (`v`, `changes`, optionale `warnings`/`warningDetails`) oder `error: { status, code, message }`. Fehlende Artifacts sind idempotente leere Änderungen. Clients müssen jedes Ergebnis und jede Persistenz-Warnung prüfen; eine 200-Batch-Antwort bedeutet nicht, dass jedes Mitglied erfolgreich war. Die Entfernung ist nach Session gruppiert, nicht transaktional über Sessions hinweg, bewahrt tatsächliche Dateien und erfordert dieselbe strenge Operator-Autorität wie die Einzel-Artifact-Entfernung. Ungültige Eingaben geben 400 `invalid_artifact_library_request` zurück; Workspace-Level-Fehler behalten normale HTTP-Statuscodes bei.

Live-Artifacts und Titel stammen von der Bridge; begrenztes persistiertes Identitäts-Metadaten bewahren die ursprüngliche Erstellungszeit und Quellen-Attributierung. Nicht geladene Metadaten, einschließlich leerer Ergebnisse, werden pro Runtime mit einem Budget von 32 MiB serialisierter Größe gecacht. Unveränderte Dateien werden bei wiederholten Abfragen oder nach TTL nicht erneut abgespielt. Transkript- und Ownership-Metadaten-Identitäten werden bei jedem Lesevorgang geprüft; geänderte Einträge werden neu aufgebaut. Kandidaten-Discovery wird nach Verzeichnis-Identität gecacht und bei der ersten Abfrage mindestens zwei Sekunden nach einem abgeschlossenen Scan aktualisiert, auch wenn sich Verzeichnis-Zeitstempel nicht ändern. Diese reine Dateinamen-Aktualisierung bewahrt unveränderte Artifact-Caches. Gleichzeitige Cold-Reads teilen sich einen Ladevorgang; jede Anfrage verarbeitet bis zu vier Sessions gleichzeitig. Zugelassene unveränderte Einträge werden beibehalten; neue Ergebnisse, die das Budget überschreiten, werden ungecacht zurückgegeben, damit wiederholte Full-Scans nicht den gesamten Cache verdrängen. Diese ungecachten Sessions oder ein Daemon-Neustart erfordern eine Rekonstruktion. Dies vermeidet wiederholtes JSONL-Parsing für gecachte Einträge, aber Dateisystemprüfungen und Antwortgröße skalieren weiterhin mit dem Workspace. Cold-File-Verfügbarkeit behält die bestehenden Metadata-only-Semantiken bei.

Das bestehende Single-Session-Artifact-Bibliothek-GET teilt denselben Cache mit Full- und Batch-Abfragen, fügt seiner Antwort nur die `session`-Zusammenfassung hinzu und behält bestehende Fehlerformen bei. Das Vorwärmen einer Route kommt den anderen zugute; Einzel- und Batch-Entfernung invalidieren den gemeinsamen Eintrag. Nur-Titel-Transkript-Anhängungen und Archiv-Verschiebungen aktualisieren ebenfalls die Metadaten; Live-Titel werden bei jeder Anfrage gelesen, ohne auf die Disk-Persistierung zu warten. Live-persistierte Metadaten und Cold-Hüllen teilen sich dasselbe 32-MiB-Budget, und Live/Cold-Übergänge bauen den Eintrag neu auf. Die `generatedAt` einer gecachten Hülle ist ihre Projektions-Erstellungszeit.

`session_artifact_library` bietet diese Endpunkte im Kontext persistierter Workspaces an:

| Methode | Route | Ergebnis |
| ------ | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| GET | `/workspaces/:workspace/session/:id/artifact-library` | Der Sitzungs-Artefaktumschlag, einschließlich persistierter Registrierungen für nicht geladene und archivierte Sitzungen. |
| DELETE | `/workspaces/:workspace/session/:id/artifact-library/:artifactId` | Das Ergebnis der Artefakt-Mutation. Eine bereits fehlende Registrierung gibt `changes: []` zurück. |

Der Workspace-Selektor löst sich in eine vertrauenswürdige Laufzeit auf. Beide Routen lehnen mehrdeutige Live-Besitzer und einen Live-Besitzer in einer anderen Laufzeit ab, bevor sie auf Artefakte zugreifen. Sie nehmen am internen Laufzeit-Aktivitätsbarrier teil; Lesevorgänge halten das gemeinsame Sitzungsarchiv-Barrier und Entfernungen halten es exklusiv. Keine der beiden Routen lädt einen Agenten oder dearchiviert die Sitzung. Löschung erfordert Daemon-Operator-Autorität durch das strenge Mutations-Gate; sie erfordert kein `X-Qwen-Client-Id`. Die bestehenden client-eigenen Artefakt-Endpunkte behalten ihre Autorisierungsregeln bei.

Kalt-Lesevorgänge spielen persistierte Artefaktdatensätze ab und geben Metadaten und Lokalisatoren wie workspace-relative `workspacePath`, `managedId` oder `url` zurück. Sie bewahren aufgezeichnete Zeitstempel und melden kompatible Warnungen pro Artefakt, ohne erfolgreiche Persistenz als nicht verfügbar zu markieren. `limits.maxArtifacts` beschreibt das Registrierungslimit des Live-Speichers; eine Kalt-Projektion verdrängt keine historischen Registrierungen, um dieses Limit durchzusetzen.

Kalt-Löschung hängt einen dauerhaften expliziten Grabstein an. Sie bewahrt Workspace-Dateien und gibt nicht referenzierte Daemon-verwaltete Web-Vorschau-Snapshot-Referenzen unter Verwendung der bestehenden Best-Effort-Bereinigung frei. Live-Löschung kann HTTP 200 mit `changes: []`, `warnings` und `warningDetails` zurückgeben, wenn die Persistenz fehlschlägt; Aufrufer müssen das Ergebnis prüfen und die Registrierung beibehalten. Kalt-Schreibfehler werden als Fehler zurückgegeben.

Beide Routen geben `409 artifact_library_unavailable` zurück, wenn die Artefakt-Persistenz deaktiviert ist. Unbekannte Sitzungen geben `404 session_not_found` zurück; Speicher aus fremden Projekten wird als nicht gefunden behandelt, und mehrdeutiger oder nicht-regulärer Speicher gibt `409 session_storage_conflict` zurück. Unvollständige Konversationsdatensätze oder ein nicht maßgebliches Mutationsjournal geben `409 session_transcript_corrupt` zurück, unterschiedlich von einem gleichzeitigen Schreibzugriff mit `session_transcript_changed`. Lesevorgänge über 64 MiB geben 413 zurück. Kalt verwaltete Ausführungs-Mutation gibt `409 artifact_mutation_requires_managed_authority` zurück. Bestehende Workspace-Eigentümer- und Lebenszyklus-Fehlerantworten gelten ebenfalls.

### `GET /workspace/:id/sessions` and `GET /workspaces/:workspace/sessions`

Listet Sitzungen auf, deren kanonischer Workspace mit `:id` oder `:workspace` übereinstimmt. Der Pfad-Parameter wird zuerst als exakte Workspace-ID und dann als URL-kodierter absoluter cwd aufgelöst. Primäre Workspaces umfassen die bestehende persistierte/live-Zusammenführung: Die Standardliste enthält aktive Sitzungen aus `chats/`; übergeben Sie `archiveState=archived`, um archivierte Sitzungen aus `chats/archive/` aufzulisten. Vertrauenswürdige nicht-primäre Workspaces umfassen aktive persistierte Sitzungen aus ihrem eigenen `chats/`-Store und führen passende Live-Zusammenfassungen ohne Duplikate zusammen; wenn keine aktiven persistierten Sitzungen vorhanden sind, bewahrt die Route das vorherige reine Live-Cursor-Verhalten. Vertrauenswürdige nicht-primäre Workspaces unterstützen auch `archiveState=archived`, die organisierte `view=organized`-Liste und `group`-Filter, lesen aus ihren eigenen `chats/`-, `chats/archive/`- und Session-Organisations-Stores; eine kombinierte `view=organized&archiveState=archived`-Abfrage gibt nur archivierte Sitzungen ohne Live-Zusammenführung zurück. Registrierte untrusted nicht-primäre Workspaces unterstützen dieselben Listen-, Filter- und Paginierungsformate, geben aber nur persistierte Einträge zurück: Der Daemon fragt die Live-Bridge nicht ab und füllt keine ausstehenden Interaktionen, Turn-Fehler oder Client-State aus der Runtime. Persistierte Defaults wie `clientCount: 0` und `hasActivePrompt: false` bleiben aus Gründen der Wire-Kompatibilität erhalten. Fehlender Speicherplatz führt zu einer leeren Liste. Die Plural-Route gibt weiterhin `403 { code: "untrusted_workspace" }` für einen untrusted primären Workspace zurück; Legacy-Primär-Routen behalten ihr bestehendes Kompatibilitätsverhalten. `archiveState=all` wird in v1 nicht unterstützt. Primäre und persistiert-gestützte Listen behalten die bestehenden numerischen `cursor`-Semantiken bei; der Live-Fallback für vertrauenswürdige nicht-primäre Workspaces ohne Persistierung behält seinen bestehenden opaken Live-Cursor.

```bash
curl http://127.0.0.1:4170/workspace/$(jq -rn --arg c "$PWD" '$c|@uri')/sessions
curl http://127.0.0.1:4170/workspace/$(jq -rn --arg c "$PWD" '$c|@uri')/sessions?archiveState=archived
curl http://127.0.0.1:4170/workspaces/<workspace-id>/sessions
```

Wenn `workspace_qualified_rest_core` advertised ist, stehen workspace-scoped Session-Batch-Operationen, Gruppen-CRUD und Session-Organisations-Mutationen unter `/workspaces/:workspace/sessions/{delete,archive,unarchive}`, `/workspaces/:workspace/session-groups` und `/workspaces/:workspace/session/:id/organization` zur Verfügung. Für einen untrusted sekundären Workspace bleibt GET auf Gruppen verfügbar; jede Mutation an Gruppen, Sessions und Organisation bleibt trust-gated. Batch- und Organisations-Mutationsrouten ohne Workspace bleiben aus Kompatibilitätsgründen nur für den primären Workspace verfügbar.

Query-Parameter:

| Feld | Erforderlich | Hinweise |
| -------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `archiveState` | nein | `active` (Standard) oder `archived`. Jeder andere Wert gibt `400 { code: "invalid_archive_state" }` zurück. |
| `cursor` | nein | Paginierungs-Cursor aus der vorherigen Antwort. |
| `size` | nein | Seitengröße. Ungültige Werte geben `400 { code: "invalid_cursor" }` oder die bestehende Seitengrößen-Validierung zurück. |
| `view` | nein | Weglassen für die Legacy-Rezentliste. `organized` aktiviert serverseitiges Pinned/Group-Ordering und fügt optionale Organisationsfelder hinzu. Jeder andere Wert gibt `400 { code: "invalid_session_view" }` zurück. |
| `group` | nein | Nur sinnvoll mit `view=organized`. `all` (Standard), `pinned`, `ungrouped` oder eine benutzerdefinierte Gruppen-ID. Unbekannte Gruppen-IDs geben `404 { code: "group_not_found" }` zurück. |

Antwort:

```json
{
  "sessions": [
    {
      "sessionId": "<uuid>",
      "workspaceCwd": "/canonical/path",
      "createdAt": "2026-05-17T08:30:00.000Z",
      "displayName": "My Session",
      "clientCount": 2,
      "hasActivePrompt": false,
      "isArchived": false
    }
  ],
  "nextCursor": 1772251200000
}
```

Mit `view=organized` liest der Daemon `<Storage.getProjectDir(cwd)>/session-organization.v1.json`, gibt gepinnte Sitzungen zuerst zurück, dann nach Aktivitätszeit absteigend sortiert, und dann `sessionId` für stabile Gleichstände. Der organisierte Cursor ist opaques base64url JSON und darf nicht mit der Legacy-Rezentliste wiederverwendet werden. `pinned` ist ein virtueller Filter, keine Gruppe. `groupId: null` bedeutet „nicht gruppiert“. Archivierte Sitzungen behalten ihre Organisationsmetadaten, aber `archiveState=archived&view=organized` gibt weiterhin nur archivierte Sitzungen zurück.

Aktivitätsorientierte Cursors – die organisierte Ansicht und die `parentSessionId` / `sourceType` gefilterten Listen – sind nicht snapshot-isoliert, und eine vertrauenswürdige aktive Liste sortiert Zeilen nach dem späteren Zeitpunkt von Transcript-Mtime und Live-Aktivitäts-Watermark. Ein Live-Watermark ist nur im Speicher vorhanden, sodass der Schlüssel einer Sitzung auf ihre Mtime zurückfallen kann, wenn der Live-Eintrag zwischen zwei Seitenabrufen entfernt wird. Der Cursor kompensiert dies: Er trägt die Identitäten, die bereits mit einem live-abgeleiteten Schlüssel ausgegeben wurden – behält sie bei, solange die Zeile in der Sammlung einer Seite fehlt und solange ein Pin-Wechsel sie wieder zulassen könnte – und schließt sie für den Rest des Durchlaufs aus, sodass Bewegung des live-abgeleiteten Schlüssels eine Sitzung höchstens einmal pro Durchlauf zurückgibt. Die Garantie ist auf das Tragen beschränkt: Sie ist auf 64 Identitäten begrenzt (überschüssige Identitäten in einem Durchlauf degradieren zu höchstens einem Duplikat statt eines Fehlers), und eine nur-persistierte Zeile, die vor Änderung ihres Pin-Status ausgegeben wurde, wird nie getragen, sodass ein Entpinning zwischen Abrufen diese Zeile genau so ein zweites Mal zurückgeben kann, wie es vor Existenz dieses Feldes der Fall war. Aufrufer, die Seiten akkumulieren, sollten daher Zeilen immer anhand von `sessionId` identifizieren, nicht nur im Über-64-Fall. Zeilen können sich unter gleichzeitiger Aktivität weiterhin bewegen oder übersprungen werden, genau wie zuvor; ein Aufrufer, der eine kohärente Ansicht benötigt, lädt nach einer Aktivitätsänderung von der ersten Seite neu.

Zusätzliche Felder können bei jeder Sitzung erscheinen, wenn `view=organized`:

```json
{
  "isPinned": true,
  "pinnedAt": "2026-07-04T12:00:00.000Z",
  "groupId": "018f..."
}
```

Vertrauenswürdige aktive Listen enthalten Live-Daemon-Overlay-Felder wie `clientCount`, `hasActivePrompt` und `activeWorkState`. Listen für untrusted-sekundäre und archivierte Sitzungen sind speicherbasiert: Live-Overlay-Felder fehlen oder sind false, und archivierte Einträge setzen `isArchived` auf `true`. Leeres Array (nicht 404), wenn keine Sitzungen existieren – eine Session-Picker-UI sollte keinen Fehler werfen, nur weil der Workspace idle ist.

### `POST /sessions/catalog`

Liest unabhängig paginierte Session-Kataloge für mehrere registrierte Workspaces in einer Anfrage. Pre-flight `session_catalog_batch` einmal; ältere Daemons behalten die workspace-qualifizierten Session-Listen- und Gruppen-Endpoints bei. Jedes Batch-Mitglied hat persistierte Workspace-Eigentümerschaft: Authentifizierung und Request-Zulassung sind process-global, während jeder Eintrag nur seinen eigenen Workspace auflöst und liest. Es registriert niemals einen Workspace, erstellt keine Sitzung, startet kein ACP und fällt nicht auf die primäre Runtime zurück.

```json
{
  "workspaces": [
    { "workspace": "workspace-a", "cursor": "previous-a-cursor" },
    { "workspace": "/canonical/workspace-b" }
  ],
  "options": {
    "size": 20,
    "archiveState": "active",
    "view": "organized",
    "group": "all"
  },
  "includeGroups": true
}
```

`workspaces` ist ein geordnetes Array von 1–20 `{ workspace, cursor? }`-Einträgen oder `"all"`, um alle öffentlichen registrierten Workspaces auszuwählen. Selektoren werden erst als exakte IDs und dann als kanonische absolute Pfade aufgelöst. `all` schließt interne Conversations und entfernte Einträge aus, schließt temporär nicht verfügbare Einträge ein und schlägt fehl, wenn mehr als 20 Einträge ausgewählt würden; Aufrufer müssen explizite Auswahlen dann aufteilen. Eine leere öffentliche Registry gibt ein leeres Ergebnis zurück. Explizite interne Selektoren geben einen Eintragsfehler zurück, ohne die interne Runtime zu booten.

Gemeinsame `options` akzeptieren `size` (Integer 1–100, Standard 20), `archiveState`, `view`, `group`, `parentSessionId`, `sourceType` und `sourceId` mit den bestehenden Listenfiltern und Kombinationen. `group` und `parentSessionId` sind auf 256 Zeichen begrenzt. `includeGroups` ist standardmäßig false. Jeder Workspace hat seinen eigenen Cursor. Batch-Standardseiten verwenden Aktivitätsordering und opaque Cursors, einschließlich für nur-live-Sitzungen; diese Cursors sind nicht mit Legacy-numerischen Listen-Cursors austauschbar. Fortfahren mit dem zurückgegebenen `cwd` und `nextCursor` des Eintrags, wobei die Filter beibehalten werden. Es gibt kein globales Sortieren oder globalen Paginierungs-Cursor.

```json
{
  "workspaces": [
    {
      "workspace": "workspace-a",
      "workspaceId": "workspace-a",
      "cwd": "/canonical/workspace-a",
      "sessions": [],
      "groups": {
        "groups": [],
        "colorOptions": ["red", "orange", "yellow", "green", "blue", "purple"]
      }
    },
    {
      "workspace": "/canonical/workspace-b",
      "error": {
        "code": "workspace_not_found",
        "message": "Workspace is not registered with this daemon.",
        "status": 404
      }
    }
  ]
}
```

Das Ergebnis bewahrt die Auswahlreihenfolge und den ursprünglichen Selektor als `workspace`. Erfolgreiche Einträge enthalten kanonische `cwd`, `workspaceId` und die vorhandenen Seitenfelder (`sessions`, optional `nextCursor`, `truncated` und `liveMergeFailed`). Die `workspaceCwd` jeder zurückgegebenen Sitzung wird auf das kanonische `cwd` des umgebenden Eintrags normalisiert. Wenn angefordert, enthält `groups` den vollständigen Gruppenkatalog; Gruppenidentitäten sind auf ihren umgebenden Workspace beschränkt. Lesevorgänge für Gruppen behalten die vorhandene Normalisierung und die Warn-und-leer-Fallback-Strategie für fehlerhafte oder unlesbare Organisations-Speicher bei. Fehlgeschlagene Einträge enthalten `error: { code, message, status }` und aufgelöste Identität, wenn verfügbar, ohne eine erfolgreiche leere `sessions` Liste. Gültige Batches geben HTTP 200 zurück, auch wenn einige Einträge fehlschlagen. Fehlerhafte Anfrage-Hüllen geben HTTP 400 zurück, bevor Speicher-Lesevorgänge stattfinden.

Unbekannte, interne und entfernte Workspaces erzeugen `404 workspace_not_found`; nicht verfügbare oder geänderte Laufzeit-Generationen erzeugen `503 workspace_runtime_unavailable`; ein nicht vertrauenswürdiger primärer Workspace erzeugt `403 untrusted_workspace`. Nicht vertrauenswürdige sekundäre Workspaces behalten die vorhandene nur-persistierte Katalog-Richtlinie bei, ohne Live-Bridge-Lesevorgänge, Reparatur-Schreibvorgänge oder Debug-Sitzungs-Protokollierung. Ausgelöste Cursor- und Gruppenfehler behalten ihre vorhandenen Codes bei; andere ausgelöste Lesefehler werden zu `500 session_catalog_failed`. Vertrauenswürdige aktive Einträge können den vorhandenen Live-Bridge-Zustand zusammenführen; archivierte Einträge bleiben speicherbasiert.

Der Daemon führt pro Batch maximal vier Workspace-Lesevorgänge gleichzeitig aus, begrenzt Selektoren auf 4096 Zeichen und Cursor auf 16384 Zeichen und begrenzt jeden serialisierten erfolgreichen Eintrag auf 512 KiB. Ein überdimensionierter Eintrag gibt `413 catalog_response_too_large` zurück; reduzieren Sie `size` oder lassen Sie Gruppen vor dem erneuten Versuch weg. Dies begrenzt die Batch-Antwort auf ungefähr 10 MiB plus Hülle/Fehler-Overhead. Eine Trennung der Client-Verbindung bricht ausstehende Lesevorgänge ab und verhindert, dass zusätzliche Workspace-Lesevorgänge gestartet werden. Die vorhandene JSON-Körpergrenze des Daemons und die Grenzen für persistierte Scans gelten ebenfalls. Kataloganfragen verwenden die Rate-Limit-Stufe für Lesevorgänge.

### `POST /sessions/live-state`

Lesen Sie Live-State-Snapshots für 1–20 explizit ausgewählte registrierte Workspaces in einer Anfrage. Der strenge Body ist `{ "workspaces": ["workspace-id", "/absolute/workspace/path"] }`; Selektoren werden als exakte Workspace-IDs vor kanonischen absoluten Pfaden aufgelöst. Die Antwort ist `{ "workspaces": [...] }` in Anfragereihenfolge. Jeder erfolgreiche Eintrag enthält seinen ursprünglichen `workspace` Selektor, kanonisches `workspaceId` und `cwd` sowie denselben `v: 1`, `catalogVersion` und vollständigen `sessions` Snapshot wie die untenstehende Einzel-Workspace-Route. Die Snapshots sind unabhängig; es gibt keine Cross-Workspace-Atomarität oder zusammengeführten Sitzungs-Feed. Beide Routen teilen sich die Exposition der Katalogversion und die Cache-Invaliderung, sodass das Wechseln zwischen ihnen den Vertrag zur Abstimmung des Einzel-Workspace-Katalogs beibehält. Ein gültiger Batch gibt HTTP 200 und `Cache-Control: no-store` zurück, auch wenn einige Einträge fehlschlagen.

Jeder fehlgeschlagene Eintrag enthält `workspace`, optionale aufgelöste `workspaceId` und `cwd` sowie `error: { code, message, status }` ohne eine erfolgreiche leere `sessions` Liste. Unbekannte, interne oder entfernte Selektoren geben `404 workspace_not_found` zurück; nicht verfügbare oder ersetzte Laufzeit-Generationen geben `503 workspace_runtime_unavailable` zurück; nicht vertrauenswürdige primäre oder sekundäre Workspaces geben `403 untrusted_workspace` zurück; unerwartete Bridge-Fehler geben `500 session_live_state_failed` zurück. Ein erfolgreicher Eintrag, der 512 KiB überschreitet, gibt `413 live_state_response_too_large` zurück. Ungültige Hüllen, zusätzliche Schlüssel, leere Arrays, mehr als 20 Selektoren und Selektoren mit mehr als 4096 Zeichen geben HTTP 400 `invalid_session_live_state_batch_request` zurück, bevor Bridge-Lesevorgänge stattfinden. Die Route liest nur den In-Memory-Bridge jedes ausgewählten aktiven Runtimes, niemals persistierte Kataloge oder ACP-Kinder; Mitglieder-Lesevorgänge laufen sequenziell, und der POST wird der Rate-Limit-Stufe für Lesevorgänge des Daemons belastet.

### `GET /workspaces/:workspace/sessions/live-state`

Geben Sie den nur-im-Speicher befindlichen Live-Sitzungs-Snapshot des ausgewählten Workspace-Runtimes plus eine In-Memory-Katalogversion zurück, damit Clients das Polling des persistierten Katalogs unter `GET /workspaces/:workspace/sessions` für flüchtige Zustände wie `hasActivePrompt`, Warteflags und `clientCount` stoppen können. Pre-flight `workspace_session_live_state`; das Tag ist unabhängig von `workspace_qualified_rest_core`, sodass ältere Daemons, die die breitere Workspace-REST-Fähigkeit anzeigen, diese Route nicht implementieren. Der Selektor wird zuerst als exakte Workspace-ID aufgelöst, dann als URL-kodierter absoluter cwd nach Kanonisierung, passend zu den anderen Plural-Sitzungs-Routen. Die Route ist nur für vertrauenswürdige primäre und sekundäre Runtimes: sie fällt nie auf das primäre Runtime zurück und verwendet nicht die permissive persistierte Katalog-Richtlinie, die einem nicht vertrauenswürdigen sekundären Runtime begrenzte Katalog-Lesevorgänge gewährt. Der Endpunkt hat keine Abfrageparameter und führt keine Sitzungs-Speicher-, Einstellungen-, externen Befehl- oder ACP-Round-Trips durch, sodass seine Kosten unabhängig von der Anzahl persistierter Sitzungen und der JSONL-Größe sind; die Standardgrenze für Live-Sitzungen hält die Antwort begrenzt, und wenn die Grenze deaktiviert ist, bleiben die Kosten proportional nur zur Anzahl der Live-Sitzungen.

Antwort:

```json
{
  "v": 1,
  "catalogVersion": {
    "generation": "7eca3164-bce1-4f50-94d8-c842c480f213",
    "revision": 17
  },
  "sessions": [
    {
      "sessionId": "session-123",
      "clientCount": 1,
      "hasActivePrompt": true,
      "activeWorkState": "active",
      "isWaitingForPermission": false,
      "isWaitingForUserQuestion": false,
      "updatedAt": "2026-08-18T08:12:30.123Z"
    }
  ]
}
```

`v` ist die Schema-Version der Antwort. Jede erfolgreiche Antwort enthält `Cache-Control: no-store`. `sessions` ist die vollständige, unpagierte, ungeordnete Menge der Sitzungen, die derzeit im ausgewählten Runtime live sind; ein leerer Live-Runtime gibt `200` mit `sessions: []` zurück. `clientCount`, `hasActivePrompt`, `isWaitingForPermission` und `isWaitingForUserQuestion` sind erforderliche Wire-Felder, und fehlende optionale Bridge-Werte projizieren auf `0` oder `false`. `activeWorkState` ist wire-additiv und fehlt bei älteren Daemons: `active` bedeutet, dass der Daemon unbearbeitete Arbeit besitzt oder das Kind einen frischen nicht-leeren Hold-Snapshot gesendet hat; `idle` wird nur für einen frischen leeren Snapshot ausgegeben, der jede erforderliche Kategorie abdeckt; `unknown` bedeutet, dass die ausgehandelte Berichterstattung veraltet oder unvollständig ist; und `unsupported` bedeutet, dass das Kind die Berichterstattung nicht ausgehandelt hat. Es ändert nicht `hasActivePrompt`: eine Hintergrund-Shell, ein Cron-Turn oder eine ausstehende Terminal-Benachrichtigung ist aktive Arbeit, ohne eine Vordergrund-Prompt zu werden. Statische Katalogfelder wie Anzeigename, Erstellungszeit, Organisation und Quellmetadaten werden absichtlich ausgeschlossen und bleiben beim vollständigen Katalog. Eine fehlende Live-State-Zeile löscht nur die flüchtigen Felder einer bekannten Katalogzeile; sie löscht niemals eine persistierte Katalogzeile.

`updatedAt` ist ein optionaler, vom Daemon beobachteter Aktivitäts-Wasserzeichenwert, der vorhanden ist, wenn eine Eingabeaufforderung, die den Status „running“ erreicht hat, in der aktuellen Brücke ein formales Terminal veröffentlicht hat. Er wird genau einmal pro solchem Terminal erhöht — unabhängig davon, ob es sich um Erfolg, Fehler, Abbruch oder Fristablauf handelt — und zwar geschrieben, bevor das Terminal-Ereignis veröffentlicht wird; er steigt streng monoton pro aktiver Sitzung an, selbst wenn zwei Terminals innerhalb einer Wanduhr-Millisekunde landen oder die Wanduhr rückwärts läuft; ein Vorwärtssprung der Uhr bleibt daher bestehen, bis die Wandzeit aufgeholt hat. Er liegt nie vor dem `createdAt` der Sitzung: Die erste Erhöhung wird auf den Erstellungszeitpunkt begrenzt, sodass eine Rückstellung der Wanduhr zwischen Erstellung und erstem Terminal keine Zeile hinter dem `createdAt` einordnen kann, bei dem sie bereits aufgelistet war. Zulassung von Eingabeaufforderungen, Warteschlangen-Wartezeiten, gestreamte Updates, reine Warteschlangen-Abbrüche, Heartbeats und Interaktions-Wartezeiten erhöhen ihn nie. Clients verwenden ihn, um die Aktualität einer Katalogzeile zu aktualisieren, die sie bereits halten, anstatt den vollständigen Katalog nach einer abgeschlossenen Runde neu zu laden. Es ist keine Bestätigung der Persistierung: Der Recorder schreibt Turn-Ergebnisse asynchron, daher beweist der Wert nur, dass der Daemon eine laufende Ausführung als abgeschlossen beobachtet hat. Er fehlt vor dem ersten laufenden Terminal in einer Brückengeneration — einschließlich für eine von der Platte wiederhergestellte Sitzung — daher ist das Fehlen kein Unterstützungs-Test, und er verschwindet, wenn ein Daemon-Neustart oder ein Ersatz der Workspace-Laufzeitumgebung eine neue Brücke installiert. Wenn sowohl eine Live- als auch eine persistierte Zusammenfassung für eine Sitzung existieren, melden vollständige Katalogantworten den späteren gültigen Zeitstempel, sodass `GET /session/:id/status`, das die Brückenzusammenfassung direkt ohne diese Zusammenführung zurückgibt, einen früheren Wert als eine Listenantwort melden kann.

`catalogVersion` ist ein Gleichheitstoken für vom Daemon beobachtete Katalogänderungen. `generation` ist eine zufällige UUID, die mit jeder Brückeninstanz erstellt wird und sich bei einem Daemon-Neustart oder einem Ersatz der Workspace-Laufzeitumgebung ändert; `revision` beginnt bei Null und steigt innerhalb einer Generation monoton an. Die einzige unterstützte Operation ist die Gleichheitsprüfung über das gesamte Paar: Gleiche Generation und Revision bedeuten keine vom Daemon beobachtete Katalogänderung, und jede Differenz bedeutet, den vollständigen Katalog neu zu laden. Clients dürfen keine Revisionsarithmetik durchführen oder Revisionen über Generationen hinweg vergleichen, und konservative zusätzliche Erhöhungen sind zulässig. Die Version deckt Änderungen an der Katalogmitgliedschaft und statischen Metadaten ab, die vom Daemon beobachtet werden; gewöhnliche Turn-Aktivitäten, Prompt-Lebenszyklen, Anhängen/Trennen und Übergänge im Wartezustand erhöhen sie nicht, da die Live-Snapshot bereits die entsprechenden flüchtigen Felder enthält. Ein geändertes `updatedAt` unter einer unveränderten Version ist daher gültig und erwartet, und es invalidiert nicht die persistierten Listen-Caches des Daemons. Zwei flüchtige Overlay-Werte sind bewusst außerhalb beider Signale: Der Turn-Fehlerzustand (`hasTurnError`/`turnError`) und die Anzahl/die Inhalte ausstehender Interaktionen (`pendingInteractionCount`/`pendingInteractions`) erhöhen weder die Version noch erscheinen sie im Snapshot, sodass ein Client, der sie benötigt, weiterhin den Ereignisstrom pro Sitzung oder den vollständigen Katalog lesen muss, anstatt sich auf diesen Pfad zu verlassen; jedes dieser Felder kann drahtseitig additiv hinzugefügt werden, wenn ein konkreter Verbraucher dies erfordert. Mutationen, die direkt von einem anderen Daemon, einer TUI oder einem externen Prozess geschrieben werden, werden nicht beobachtet, sodass, sobald ein Client die periodische Abfrage des vollständigen Katalogs stoppt, diese Schreibvorgänge keine begrenzte Entdeckungszeit haben und erst nach einem expliziten vollständigen Neuladen, einer anderen beobachteten Katalogmutation, einer Wiederverbindung oder einem Daemon-/Laufzeitumgebungsersatz sichtbar werden.

Clients gleichen ein Katalogbündel mit einem Zwei-Lese-Handshake ab: Lesen des Live-Zustands A, Laden der vollständigen Sitzungsliste (plus `GET /workspaces/:workspace/session-groups`, wenn der Client `session_organization` konsumiert), dann Lesen des Live-Zustands B. Gleiche Versionen von A und B akzeptieren das Bündel; unterschiedliche Versionen markieren den Katalog als veraltet und fassen höchstens ein nachfolgendes Neuladen zusammen, anstatt in eine enge Wiederholungsschleife zu geraten. Jede akzeptierte Kataloganfrage muss nach A initiiert worden sein — eine Anfrage oder ein dedupliziertes Versprechen, das vor A begann, kann die Abstimmung nicht erfüllen. Versionsgesteuerte Neuladungen erfolgen Single-Flight pro Workspace und beachten ein nicht-null Hintergrund-Minimalintervall, sodass anhaltende Katalog-Churn nicht dazu führen kann, dass pro Live-Zustands-Abfrage ein vollständiger Katalogscan durchgeführt wird; explizite lokale Mutationen können weiterhin eine sofortige Aktualisierung über dieselbe Single-Flight-Operation anfordern.

**Fehler:**

- `400` — bestehendes Verhalten zur Selektorvalidierung oder `workspace_mismatch` für einen unbekannten, fehlerhaften, verschachtelten oder nicht registrierten Selektor; die Route löst niemals einen unbekannten Selektor auf die primäre Laufzeitumgebung auf.
- `403` — `untrusted_workspace` für jede nicht vertrauenswürdige Laufzeitumgebung, einschließlich einer nicht vertrauenswürdigen Primär-Laufzeitumgebung.
- `503` — `workspace_runtime_unavailable` mit `Retry-After` für eine bootstrappende, übergehende, entleerende, blockierte oder entfernte Laufzeitumgebung oder eine Laufzeitumgebungs-Generation, die mitten in der Anfrage schließt.
- `500` — unerwartete lokale Fehler verwenden das bestehende Bridge-Fehler-Mapping.

### `GET /workspace/:id/session-groups`

Listet benutzerdefinierte Sitzungsgruppen für einen Workspace auf. Der singular GET-Selektor akzeptiert jede registrierte Workspace-ID oder URL-kodierte kanonische cwd. Das plural GET-Alias ist auch für eine nicht vertrauenswürdige Sekundär-Laufzeitumgebung verfügbar und liest nur das Organisations-Sidecar. Plurale Gruppenmutationen bleiben vertrauensgesteuert, während singuläre Gruppenmutationen ihr kompatibles Verhalten nur für die Primär-Laufzeitumgebung beibehalten. Pre-flight `caps.features.includes('session_organization')`.

Antwort:

```json
{
  "groups": [
    {
      "id": "018f...",
      "name": "Frontend",
      "color": "blue",
      "order": 0,
      "createdAt": "2026-07-04T12:00:00.000Z",
      "updatedAt": "2026-07-04T12:00:00.000Z"
    }
  ],
  "colorOptions": ["red", "orange", "yellow", "green", "blue", "purple"]
}
```

Farben sind nur Protokoll-Tokens; Clients lokalisieren Anzeigenamen. Es werden keine Standardgruppen mit Farbnamen erstellt.

### `POST /workspace/:id/session-groups`

Erstellt eine benutzerdefinierte Sitzungsgruppe. Striktes Mutations-Gate. Pre-flight `caps.features.includes('session_organization')`.

Anfrage:

```json
{ "name": "Frontend", "color": "blue" }
```

`name` wird getrimmt, muss 1–64 Zeichen lang sein, darf keine Steuerzeichen enthalten und ist innerhalb des Workspaces durch fallunsensitive getrimmte Vergleichbarkeit eindeutig. Duplizierte Namen geben `409 { code: "group_name_conflict" }` zurück. `color` muss eine der zurückgegebenen `colorOptions` sein.

Antwort:

```json
{
  "group": {
    "id": "018f...",
    "name": "Frontend",
    "color": "blue",
    "order": 0,
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

### `PATCH /workspace/:id/session-groups/:groupId`

Aktualisiert eine benutzerdefinierte Sitzungsgruppe. Striktes Mutations-Gate. Pre-flight `caps.features.includes('session_organization')`. Body-Felder sind optional: `{ "name"?: string, "color"?: string, "order"?: number }`. Unbekannte Gruppen-IDs geben `404 { code: "group_not_found" }` zurück; duplizierte/ungültige Namen und Farben verwenden dieselben Fehler wie beim Erstellen.

### `DELETE /workspace/:id/session-groups/:groupId`

Löscht eine benutzerdefinierte Sitzungsgruppe. Striktes Mutations-Gate. Pre-flight `caps.features.includes('session_organization')`. Sitzungen, die auf die Gruppe verweisen, werden auf `groupId: null` gesetzt; der angepinnte Zustand bleibt erhalten. Die Antwort ist `{ "deleted": true }`, wenn eine Gruppe entfernt wurde, und `{ "deleted": false }`, wenn die ID nicht existierte.

### `POST /sessions/delete`

Hartes Löschen einer oder mehrerer persistierter Session-JSONL-Dateien. Der Daemon schließt zuerst best-effort aktive Sitzungen, entfernt dann die aktive oder archivierte JSONL. Wenn sowohl aktive als auch archivierte Kopien für dieselbe ID existieren, werden beide entfernt. Worktree-Sidecars auf beiden Seiten werden bereinigt; Dateiverlauf, Subagent-Transkripte und Runtime-Sidecars werden absichtlich beibehalten.

Anfrage:

```json
{ "sessionIds": ["<uuid>"] }
```

Antwort:

```json
{
  "removed": ["<uuid>"],
  "notFound": [],
  "errors": []
}
```

### `POST /sessions/archive`

Archivieren Sie eine oder mehrere Sitzungen. Das Archivieren ist ein Zustandsübergang, keine Löschung: Die JSONL-Datei wird von `chats/<id>.jsonl` nach `chats/archive/<id>.jsonl` verschoben. Dateiverlauf, Subagenten-Transkripte und Laufzeit-Sidecars bleiben erhalten. Wenn eine Sitzung aktiv ist, führt der Daemon zunächst einen strikten Abschluss durch und verlangt vom ACP-Agenten, dass sein Abschluss-Handler die Chat-Aufzeichnung leert; schlägt der Abschluss oder das Leeren fehl, wird die JSONL-Datei nicht verschoben. Vorabprüfung `caps.features.session_archive`.

Anfrage:

```json
{ "sessionIds": ["<uuid>"], "resolveConflicts": true, "requireIdle": true }
```

`sessionIds` muss ein nicht leerer String-Array mit maximal 100 IDs sein. Duplikate werden zusammengeführt.

Antwort:

```json
{
  "archived": ["<uuid>"],
  "alreadyArchived": [],
  "resolvedConflicts": ["<uuid>"],
  "notFound": [],
  "errors": []
}
```

`resolveConflicts` ist optional und standardmäßig auf `false` gesetzt. Standardmäßig werden aktive und archivierte Dateien mit derselben ID in `errors` gemeldet, und keine Kopie wird verschoben, entfernt oder überschrieben. Das Archivieren einer aktiven Sitzung führt den oben beschriebenen strikten Abschluss weiterhin vor der Klassifizierung des Konflikts durch, sodass beim Abschluss möglicherweise aufgezeichnete Datensätze in das aktive Transkript geschrieben werden. Mit `resolveConflicts: true` behebt das Archivieren den Konflikt nur, wenn beide Kopien reguläre Transkriptdateien sind, die der ausgewählte Workspace verwalten darf, einschließlich besessener leerer oder beschädigter Transkripte. Es behält die archivierte Kopie bei, entfernt die aktive Kopie und meldet die ID sowohl in `archived` als auch in `resolvedConflicts`. Diese Option umgeht keine Eigentumsprüfungen; gemischtes lokales/fremdes oder anderweitig mehrdeutiges Eigentum wird in `errors` gemeldet, und keine Kopie wird verschoben. Einträge in `errors` haben `{ "sessionId": "<uuid>", "error": "message" }`.

`requireIdle` ist optional und standardmäßig auf `false` gesetzt. Clients müssen `session_archive_idle_guard` vor dem Senden vorab prüfen. Mit `requireIdle: true` gibt ein aktiver Besitzer, dessen Arbeitsstatus im aktiven Workspace aktiv, unbekannt oder nicht unterstützt ist, diese Sitzung in `errors` zurück; der Daemon schließt sie nicht ab und verschiebt ihr Transkript nicht. Die Prüfung und der Übergang in den Schließzustand erfolgen in einem einzigen Control-Plane-Turn des owning-Runtimes, sodass zwischen ihnen keine neue Arbeit eintreten kann. Eine persistierte Sitzung, deren aktives Kind bereits eingesammelt wurde, bleibt für das Archivieren qualifiziert.

Eine nur archivierte Sitzung wird in `alreadyArchived` zurückgegeben, nachdem der Daemon einen Writer- oder Wartungs-Lease erworben hat, um ausstehende Sidecar-Bereinigungen abzugleichen. Wenn ein anderer Prozess den Writer-Lease noch hält, wird die nur archivierte ID so lange in `errors` gemeldet, bis der Lease verfügbar wird.

Das Verschieben des Transkripts oder die Behebung des Konflikts wird nicht rückgängig gemacht, wenn eine spätere Prüfung der Bereinigungseigentümerschaft fehlschlägt. In diesem Fall kann die ID nur in `errors` erscheinen, obwohl sich der Archivierungszustand bereits geändert hat, und kann aus `archived` und `resolvedConflicts` weggelassen werden. Wiederholen Sie dieselbe Lifecycle-Anfrage für denselben Workspace, bevor Sie den Fehler als Beweis dafür werten, dass die aktive Kopie oder der Konflikt noch vorhanden ist. Wenn der Dienst die gespeicherte Transkriptidentität überprüfen und den erforderlichen Writer- oder Wartungs-Lease erwerben kann, meldet der Versuch den maßgeblichen `alreadyArchived`-Zustand, selbst für leere oder beschädigte Transkripte, die die Sitzungsauflistung auslässt, und setzt die ausstehende Sidecar-Bereinigung fort. Transkripte, deren gespeicherte Identität nicht überprüft werden kann, melden bei einem erneuten Versuch weiterhin `errors` und erfordern eine manuelle Überprüfung; Versuche, die den erforderlichen Lease nicht erwerben können, verbleiben in `errors`, bis dieser verfügbar wird.

Lifecycle-Konflikte sind Ergebnisse einzelner Batch-Elemente: Routen ohne Workspace und mit Workspace-Qualifikation geben HTTP `200` mit dem Konflikt in `errors` zurück. Dies ersetzt das frühere HTTP-`409 session_conflict`-Envelope für Routen mit Workspace-Qualifikation; Clients, die diese Route aufgerufen haben, müssen die Batch-Antwort untersuchen. Interne Runtime-REST-Batches bewahren die sichere Konfliktmeldung bei, während andere Details zu einzelnen Sitzungsfehlern weiterhin geschwärzt werden.

### `POST /sessions/unarchive`

Stellen Sie archivierte Sitzungen im aktiven Verzeichnis wieder her. Dies setzt die Sitzung nicht automatisch fort; es verschiebt lediglich `chats/archive/<id>.jsonl` zurück nach `chats/<id>.jsonl`. Nach erfolgreichem Entarchivieren können Clients `POST /session/:id/load` oder `POST /session/:id/resume` aufrufen.

Anfrage:

```json
{ "sessionIds": ["<uuid>"], "resolveConflicts": true }
```

Antwort:

```json
{
  "unarchived": ["<uuid>"],
  "alreadyActive": [],
  "resolvedConflicts": ["<uuid>"],
  "notFound": [],
  "errors": []
}
```

`resolveConflicts` ist optional und standardmäßig auf `false` gesetzt. Standardmäßig erzeugen gleichzeitige aktive und archivierte JSONL-Dateien einen Konflikt in `errors`, und keine Kopie wird verschoben, entfernt oder überschrieben; eine nur aktive Sitzung wird in `alreadyActive` zurückgegeben, nachdem der Daemon einen Writer- oder Wartungs-Lease erworben hat, um ausstehende Sidecar-Bereinigungen abzugleichen. Wenn eine aktive Sitzung den Writer-Lease noch hält, wird die nur aktive ID so lange in `errors` gemeldet, bis diese Sitzung geschlossen ist. Mit `resolveConflicts: true` behebt das Entarchivieren den Konflikt nur, wenn beide Kopien reguläre Transkriptdateien sind, die der ausgewählte Workspace verwalten darf, einschließlich besessener leerer oder beschädigter Transkripte. Es behält die aktive Kopie bei, entfernt die archivierte Kopie und meldet die ID sowohl in `unarchived` als auch in `resolvedConflicts`. Diese Option umgeht keine Eigentumsprüfungen; gemischtes lokales/fremdes oder anderweitig mehrdeutiges Eigentum wird in `errors` gemeldet, und keine Kopie wird verschoben. Ein laufendes Archivieren oder Entarchivieren derselben ID gibt `409 session_archiving` zurück, bevor der Batch gestartet wird.

Das Verschieben des Transkripts oder die Behebung des Konflikts wird nicht rückgängig gemacht, wenn eine spätere Prüfung der Bereinigungseigentümerschaft fehlschlägt. In diesem Fall kann die ID nur in `errors` erscheinen, obwohl sich der Archivierungszustand bereits geändert hat, und kann aus `unarchived` und `resolvedConflicts` weggelassen werden. Wiederholen Sie dieselbe Lifecycle-Anfrage für denselben Workspace, bevor Sie den Fehler als Beweis dafür werten, dass die archivierte Kopie oder der Konflikt noch vorhanden ist. Wenn der Dienst die gespeicherte Transkriptidentität überprüfen und den erforderlichen Writer- oder Wartungs-Lease erwerben kann, meldet der Versuch den maßgeblichen `alreadyActive`-Zustand, selbst für leere oder beschädigte Transkripte, die die Sitzungsauflistung auslässt, und setzt die ausstehende Sidecar-Bereinigung fort. Transkripte, deren gespeicherte Identität nicht überprüft werden kann, melden bei einem erneuten Versuch weiterhin `errors` und erfordern eine manuelle Überprüfung; Versuche, die den erforderlichen Lease nicht erwerben können, einschließlich solcher, bei denen eine aktive Sitzung ihn noch hält, verbleiben in `errors`, bis der Lease verfügbar wird.

ACP über HTTP verwendet dieselben Anfrage- und Antwortkörper über Vendor-Methoden `_qwen/sessions/archive` und `_qwen/sessions/unarchive`. Die REST-Routentabelle ordnet `POST /sessions/archive` und `POST /sessions/unarchive` diesen Methoden für ACP-Transporte zu.

### Routing von Live-Sitzungen über mehrere Workspaces

Wenn `multi_workspace_sessions` advertised wird, identifizieren Live-Sitzungsoperationen ihren Workspace aus `sessionId`; Clients fügen der URL keinen Workspace-Selektor hinzu. Zusätzlich zu den bestehenden lifecycle-Operationen, die an den Besitzer geroutet werden, gilt dies für `PATCH /session/:id/metadata`, `POST /session/:id/recap`, `POST /session/:id/generate`, `POST /session/:id/btw`, `POST /session/:id/btw/stream`, `DELETE /session/:id/btw/stream/:requestId`, `POST /session/:id/mid-turn-message`, `GET /session/:id/mid-turn-messages`, `POST /session/:id/mid-turn-messages/send-now`, `DELETE /session/:id/mid-turn-messages/:messageId`, `POST /session/:id/tasks/:taskId/cancel`, `POST /session/:id/goal/clear`, `POST /session/:id/continue`, `POST /session/:id/language`, `POST /session/:id/artifacts`, `DELETE /session/:id/artifacts/:artifactId`, `GET /session/:id/sources`, `POST /session/:id/sources` und `DELETE /session/:id/sources/:sourceId`. Der Daemon routet jede Anfrage an das vertrauenswürdige Runtime, dem die Live-Sitzung gehört. Ein nicht vertrauenswürdiger Nicht-Primärbesitzer gibt `403 untrusted_workspace` zurück, ein fehlender Live-Besitzer gibt `404 session_not_found` zurück, und ein mehrdeutiger Besitzer scheitert sicherheitshalber mit `500 ambiguous_session_owner`.

Diese Regel gilt nur für Live-Sitzungen und macht nicht jede Sitzung ohne Workspace mehrworkspace-fähig. Persistierte oder archivierte Operationen verwenden ihre dokumentierten workspace-qualifizierten Routen. `POST /session/:id/branch`, `POST /session/:id/fork` und `POST /session/:id/cd` bleiben absichtlich primär-only und geben für Nicht-Primär-Besitzer `non_primary_session_route_not_supported` zurück.

### Nachrichten während der Ausführung

`POST /session/:id/mid-turn-message` akzeptiert `{ "message": "...", "messageId": "<optional-message-id>" }`. Eine erfolgreiche Zulassung gibt `{ "accepted": true, "messageId": "<id>" }` zurück und überträgt die Eigentümerschaft an den Daemon: Die Nachricht wird in die aktive Runde aufgenommen oder in die normale Prompt-FIFO befördert, wenn die Sitzung leerläuft. Clients, die `session_mid_turn_message_query` verwenden, senden eine stabile `messageId`; das Wiederholen ist idempotent, solange sie sich im Warteschlangen-, Ausstehungs- oder begrenzten Abgleichsring befindet. Eine Ablehnung einer vom Daemon validierten Anfrage gibt `{ "accepted": false }` zurück und überträgt niemals die Eigentümerschaft: Eine offene Sitzung ohne zugelassenen Prompt in ihrer Prompt-FIFO und ohne aktive Goal-Runde meldet `{ "accepted": false, "reason": "session_idle" }`, damit der Client die Nachricht als gewöhnlichen Prompt erneut einreichen kann, statt einen Fehler zu melden. Für eine wirklich neue Zulassung wird ein `content`-Block, der auf einen Anhang verweist, den die Sitzung nicht mehr besitzt — oder eine ungültige Referenz — vor der Leerlauf- und Warteschlangen-Entscheidung abgelehnt: Die Anfrage wird mit `410 session_attachment_gone` (oder `400 invalid_session_attachment_reference`) beantwortet, mit einem `{ "error", "code" }`-Body, der kein `reason` enthält, selbst wenn die Sitzung leerläuft. Zwei frühere Tore kommen ihm zuvor: Ein wiederholtes `messageId`, dessen Payload noch übereinstimmt, wird idempotent mit `{ "accepted": true, "messageId" }` abgeschlossen, auch wenn der Anhang seitdem entfernt wurde, und eine Sitzung, die schließt oder eine Schließung autorisiert, wird mit einer grundlosen `{ "accepted": false }` abgelehnt. Die Entscheidung beschreibt nur, was eine Nachricht während der Ausführung drainen kann, nicht alles, was die Sitzung halten kann — ein Sitzungs-Snapshot kann immer noch `hasActivePrompt: true` dafür melden, zum Beispiel während eines geparkten verzögerten Wiederherstellungs-Prompts. Eine grundlose Ablehnung hat eine andere Ursache — die Warteschlange ist voll, die Sitzung schließt oder autorisiert eine Schließung, das Budget für inline Anhänge in der Warteschlange ist erschöpft, oder ein wiederholtes `messageId` stimmt nicht mehr mit dem Payload überein, den der Daemon hält. Der Daemon behält den bereits zugelassenen Payload bei, statt ihn zu ersetzen, aber das ist kein Liefer-Versprechen: Eine beförderte Nachricht, die der Client entfernt hat, verschwindet sofort aus den Snapshots der ausstehenden Prompts — eine, die noch nicht gestartet war, wird dort fallen gelassen, wo sie steht, eine, die bereits läuft, wird versteckt, bis ihre abgebrochene Runde abgeschlossen ist — so dass die Antwort auf die Entfernung das einzige `removed = true` ist, das ein Client jemals beobachtet. Eine schließende Sitzung befördert niemals, was in der Warteschlange verbleibt, und eine Runde, die abgeschlossen wird, während eine Schließung noch autorisiert wird, übergibt die Warteschlange an das Zulassungstor, das sie ablehnt, so dass diese Nachrichten fallen gelassen werden, statt befördert zu werden, und in keinen Ring landen. Eine Schließung, die das Kind dann ablehnt, lässt die Sitzung live mit allem, was in der Warteschlange verblieb, weiterhin aufgelistet und nichts geplant zur Beförderung, bis eine spätere Runde endet. Diese Nachrichten gehören weiterhin dem Daemon, daher ist die Standard-Wiederherstellung das Warten: Das Abschluss-Ereignis der nächsten Runde befördert den Rückstand, nichts geht verloren und nichts wird doppelt geliefert. Ein Client, der nicht warten kann — keine weitere Runde kommt und der Benutzer sieht eine Warteschlange, die nicht drainen wird — kann stattdessen den Drain erzwingen, und der einzige unterstützte Weg ist, jeden Payload freizugeben, bevor er erneut gesendet wird. Beide Pfade starten von derselben Menge: Erstellen Sie sie aus der eigenen Aufzeichnung des Clients darüber, was er in diesem Fenster eingereiht hat, minus alles, wofür er positive Liefer-Nachweise hat, nicht aus dem Schweigen der Auflistung. Die Abfrage ist kein Inventar dessen, was der Daemon hält — sie lässt einen bereits als entfernt markierten Prompt aus, beide Ringe sind begrenzt, und ein ohne Client-ID gesendeter Enqueue wird auf dieser Oberfläche überhaupt nicht verfolgt — so dass eine nirgends gemeldete ID nach der Lieferung gealtert sein kann, ungeliefert fallen gelassen wurde oder nie aufgelistet wurde. Positive Liefer-Nachweise sind ein `mid_turn_message_injected`-Echo, ein `pending_prompt_started` für diese ID oder die Mitgliedschaft in einem der Ringe.

Die POST-Anfrage mitten im Turn akzeptiert auch optionale `eventDetailMode`: `full` (Standard) oder `summary`; ungültige Werte geben `400 invalid_event_detail_mode` zurück. Der Daemon behält diesen Modus zusammen mit der Nachricht bei und verwendet ihn, falls eine nicht abgerufene Nachricht zu einer neuen Eingabeaufforderung wird. Das Abrufen in einen bestehenden Turn ändert den Modus dieses Turns nicht. Während die Nachricht in der Warteschlange steht oder hochgestuft und ausstehend ist, muss ein erneuter Versuch unter derselben `messageId` Text, Medien und effektiven Modus übereinstimmen (weggelassen entspricht vollständig). Web Shell sendet seinen aktuellen Provider-Modus. Die REST-Route lehnt weiterhin neue Aufnahmen im Leerlaufzustand mit `reason: "session_idle"` ab; Aufrufer senden dann eine gewöhnliche Eingabeaufforderung.

Um den Drain zu erzwingen, `DELETE /session/:id/mid-turn-messages/:messageId` jede ID in dieser Menge, die die Abfrage noch als in der Warteschlange meldet, und posten Sie erst danach den Text erneut unter einer neuen `messageId`, da eine wiederholte ID idempotent bestätigt wird und nichts neu bewaffnet. Die Reihenfolge ist wichtig und gilt für die gesamte Menge, statt eins nach dem anderen: Ein Payload, der noch in der Warteschlange ist und dem Daemon gehört, wird durch den nächsten Abschluss befördert, so dass das erneute Posten einer ID, deren Payload nie freigegeben wurde, diese Nachricht zweimal liefert — einmal durch diese Beförderung und einmal durch das erneute Senden. Wo `session_mid_turn_message_mutation` nicht advertised wird, gibt es keine Möglichkeit, einen Payload freizugeben, so dass Warten die einzige sichere Option ist. Kein DELETE-Urteil stellt allein die Lieferung fest. `{ "removed": false }` deckt eine ID ab, die bereits injiziert oder abgeschlossen ist — geliefert, also darf sie nicht erneut gepostet werden — und, gemäß der unten stehenden DELETE-Route, zwei weitere Fälle. Einer ist eine ID, die ein Drain noch hält, die ebenfalls nicht erneut gepostet werden darf. Eine spätere Abfrage listet sie in `settledMessageIds` auf, aber das ist nicht endgültig: Wenn der Drain fehlschlägt, verlässt die ID den Ring und kehrt ohne Ereignis in die Warteschlange zurück. Der Absatz „Sofort senden“ unten beschreibt, wann die Nachrichten eines zeitüberschrittenen Drains verloren gehen. Der andere Fall ist eine nicht gefundene ID, was für eine, die die Abfrage gerade als in der Warteschlange gelistet hatte, bedeutet, dass sie zwischen den beiden Aufrufen die Warteschlange verlassen hat und möglicherweise vom Pfad zur Autorisierung der Schließung oben ungeliefert fallen gelassen wurde; entscheiden Sie diesen Fall anhand der eigenen Nachweise des Clients. `{ "removed": true }` gibt den Payload frei, aber für eine ID, die ein Abschluss in diesem Fenster befördert hat, deckt es sowohl einen FIFO-Eintrag ab, der vor seiner je erfolgten Dispatching herausgeschnitten wurde, was sicher erneut gepostet werden kann, als auch einen Abbruch eines beförderten Prompts, der bereits gestartet war, was bei einem erneuten Posten ein zweites Mal sendet. Eine beförderte ID bleibt auch über dieselbe Route löschbar, bis sie abgeschlossen ist, obwohl die Auflistung sie nicht mehr als in der Warteschlange meldet. Das erneute Posten selbst ist eine Zulassung während der Ausführung und kann mit `{ "accepted": false, "reason": "session_idle" }` abgelehnt werden; das ist kein Fehler, sondern das oben beschriebene Signal, dass die Sitzung jetzt einen gewöhnlichen Prompt annimmt, und das Einreichen über die gewöhnliche Route startet eine Runde, deren Abschluss alles noch in der Warteschlange befindliche befördert — was derselbe Grund ist, warum jede ID in der Menge zuerst freigegeben werden muss.

Ein fehlendes `reason` ist daher kein Nachweis für eine aktive Sitzung. Daemons, die vor `reason` existierten, lassen es in jedem Fall aus, sodass Clients ihre eigene Leerlauf-Erkennung parallel dazu beibehalten. Neue Clients, die sich mit einem älteren Daemon verbinden, erkennen die fehlende Funktion und behalten ihren Legacy-Local-Fallback bei.

`GET /session/:id/mid-turn-messages` gibt die daemonseitige Queue der gesamten Sitzung sowie begrenzte `settledMessageIds`- und `promotedMessageIds`-Ringe zurück. Abgeschlossene IDs wurden injiziert oder explizit gelöscht; beförderte IDs sind in den normalen Prompt-FIFO eingetreten. Eine ID in einem der Ringe darf nicht erneut gesendet werden.

Wenn eine warteschlangenbasierte Nachricht in die aktive Runde abfließt, veröffentlicht der Daemon `mid_turn_message_injected` mit ausgerichteten `messages`- und `messageIds`-Arrays (und `promptId` der laufenden Runde, falls bekannt). Es handelt sich um ein transientes Dedupe-Signal, nicht um einen Transkript-Eintrag: Clients schließen Abschluss-Callbacks ab, die unter diesen Nachrichten-IDs registriert sind, und verwerfen alle lokalen ausstehenden Zeilen für diese. Ältere Daemons enthalten zusätzlich `originatorClientId` im Payload. Ein verpasstes Echo wird über die obige Abfrage aus dem abgeschlossenen Ring wiederhergestellt.

Der Agent leert die Queue immer dann, wenn ein Tool-Batch abgeschlossen ist, sodass eine Nachricht, die während des Streamens einer Modellantwort angenommen wurde, auf diese Antwort und ihren Tool-Batch wartet. Wenn `session_mid_turn_send_now` beworben wird, kann ein angehängter Sitzungsclient `POST /session/:id/mid-turn-messages/send-now` aufrufen, damit die Nachrichten in der Queue sofort zugestellt werden: Wenn eine Vordergrund-Runde, einschließlich einer Ziel-Fortsetzung, eine Modellantwort streamt, leert der Agent die Queue sofort, bricht diese Antwort ab, behält den bereits gestreamten Teil im Gespräch bei und setzt die gleiche Runde mit den Nachrichten fort. Eine Antwort, die einen vom Anbieter angekündigten Tool-Aufruf gestartet hat, auch wenn dessen Argumente noch streamen, wird nicht abgebrochen, und laufende Tools werden niemals unterbrochen: Die Nachrichten bleiben in der Queue und werden zusammen mit den Tool-Ergebnissen zugestellt oder zum nächsten Prompt befördert, wenn ein Tool die Runde beendet. Einige Anbieter kündigen einen Tool-Aufruf erst an, wenn seine Argumente vollständig sind, und ein solcher Aufruf kann dennoch abgebrochen werden. In einigen Fällen haben die Nachrichten die Queue bereits verlassen, erhalten aber in dieser Runde keine Antwort. Wenn das Send-now-Leeren bereits ausgelöst wurde, als der Anbieter einen Tool-Aufruf ankündigt, der dann die Runde beendet, oder wenn die Runde gestoppt wird, bleiben die Nachrichten im Gespräch und im Transkript erhalten, werden aber nicht befördert. Wenn das Send-now-Leeren selbst ein Timeout erreicht (der Agent wartet 2 s, und der Daemon liest möglicherweise noch Anhänge), brechen Nachrichten, die der Daemon danach übergibt, die Antwort ab, wenn sie ohne Tool-Aufruf noch streamt, und werden andernfalls mit einem späteren Leeren zugestellt, möglicherweise in einer späteren Runde; wie bei jedem gezeiteten Leeren gehen sie verloren, wenn der Daemon mehr als 30 s nach dem Timeout antwortet oder wenn die Runde gestoppt wird, während dieses spätere Leeren ihre Anhänge auflöst. In allen Fällen werden ihre IDs wie bei jeder geleerten Nachricht abgeschlossen: Das erneute Senden einer wird bestätigt, ohne sie erneut in die Queue zu stellen, und ein Client, der eine Antwort auf Nachrichten wünscht, die im Gespräch gehalten werden, sendet einen neuen Prompt. Internes Steering nur aus der Queue löst niemals einen Abbruch aus und wird vom Send-now-Leeren nicht übernommen; es geht mit der nächsten Anfrage an das Modell hinaus oder durch den Abschlusspfad, den sein Aufrufer steuert, wenn die Runde zuerst endet. Kanal-, Cron- und Hintergrund-Runden behalten die Zustellung an Tool-Grenzen bei. Die Antwort ist `{ "requested": true }`, wenn Benutzernachrichten gewartet haben und der Agent gebeten wurde, sie zuzustellen, und `{ "requested": false }`, wenn keine gewartet haben (sie waren bereits zugestellt, entfernt oder befördert). Ein Agent, der vor der Anfrage existierte, beantwortet sie mit `-32601` und behält die Zustellung an Tool-Grenzen bei.

Wenn `session_mid_turn_message_mutation` beworben wird, kann ein angehängter Sitzungsclient `DELETE /session/:id/mid-turn-messages/:messageId` aufrufen. Es entfernt die Nachricht entweder aus der Mid-Turn-Queue oder ihrem beförderten ausstehenden Prompt-Zustand; das Entfernen einer beförderten Nachricht, die bereits läuft, bricht diese Runde ab, was dem üblichen Entfernen eines ausstehenden Prompts entspricht. Daemonseitige Hinzufügungen und Entfernungen zur Queue veröffentlichen die bestehenden `pending_prompt_added`- und `pending_prompt_completed`-Sitzungsereignisse, sodass angehängte Clients beide maßgeblichen Queue-Snapshots aktualisieren. `{ "removed": false }` bedeutet, dass die Nachricht bereits injiziert, abgeschlossen oder nicht gefunden wurde. Eine Nachricht, die ein Leeren übernommen, aber noch nicht an den Agenten übergeben hat, antwortet ebenfalls mit `{ "removed": false }`. Wenn dieses Leeren fehlschlägt, kehrt die Nachricht ohne Queue-Ereignis in die Queue zurück, und ihre ID verlässt den abgeschlossenen Ring. Ein späteres Leeren oder der Abschluss der Runde übernimmt sie dann, aber wenn das Leeren fehlschlägt, nachdem seine Runde abgeschlossen wurde, bleibt die Nachricht bis zur nächsten Runde in der Queue.

### `GET /session/:id/pending-prompts`

Geben Sie die aktuell laufende Eingabeaufforderung und die Eingabeaufforderungen zurück, die in der FIFO-Warteschlange der Live-Sitzung warten. Die Anfrage kann `X-Qwen-Client-Id` enthalten; wenn vorhanden, muss sie einen angehängten Client identifizieren.

```json
{
  "pendingPrompts": [
    {
      "promptId": "<prompt-id>",
      "text": "Explain the failure",
      "queuedAt": 1700000000123,
      "state": "running",
      "originatorClientId": "<client-id>"
    }
  ]
}
```

`state` ist `running` für die gerade übermittelte Eingabeaufforderung und `queued` für wartende Eingabeaufforderungen. `content` erscheint, wenn die Eingabeaufforderung strukturierte Inhalte wie Bilder enthält. Dies ist eine Route für den Besitzer der Live-Sitzung: `404` bedeutet keinen Live-Besitzer und `503` bedeutet, dass der Besitzer vorübergehend nicht verfügbar ist. Ein nicht vertrauenswürdiger Nicht-Hauptbesitzer gibt `403 untrusted_workspace` zurück, und eine ID, die in mehr als einem Workspace live ist, gibt `500 ambiguous_session_owner` zurück. Es gibt kein dediziertes Fähigkeitskennzeichen; ältere Daemons geben `404` zurück. Die TypeScript-SDK-Methode ist `getPendingPrompts()`.

### `POST /session/:id/prompt`

`eventDetailMode` akzeptiert `full` (Standard) oder `summary`; ungültige Werte geben `400 invalid_event_detail_mode` zurück. Die Zusammenfassung filtert verschachtelte Subagent-Details vor der Ring-Aufbewahrung und SSE-Zustellung und entfernt Agent-Eingabeaufforderungen, eingebettete Tools und laufende Token-Zähler, während Wurzelinhalte und Hauptmodell-Nutzung beibehalten werden. Abgeschlossene Agent-Ergebnisse behalten `tokenCount` und `executionSummary` Token-Gesamtwerte (einschließlich Fehler/Abbruch) für Turn-Metriken bei; verschachtelte Nutzungs-Frames bleiben gefiltert. Dieselbe Regel gilt für Antworten zur Zusammenfassungs-Ladung/Transkript. Der Modus wird bei der Aufnahme erfasst, nur bei der Übermittlung angewendet und auf „vollständig“ zurückgesetzt, wenn der Turn abgeschlossen ist. Späte Subagent-Ereignisse verwenden den Modus zum Zeitpunkt der Veröffentlichung: „vollständig“ im Leerlauf oder der Modus der aktiven Eingabeaufforderung, wenn eine nachfolgende Eingabeaufforderung läuft. Sie erben nicht den Modus der Eingabeaufforderung, die den Subagent ursprünglich gestartet hat. Er gilt für alle Abonnenten der Sitzung; gefilterte Details können später nicht aus dem Ring abgerufen werden. Die `/acp` `session/prompt` des Daemons akzeptiert dieselbe optionale Top-Level-Erweiterung mit demselben Geltungsbereich (ungültige Werte sind JSON-RPC `-32602`); es ist kein Standard-ACP-Feld und wird nicht an das Kind weitergeleitet.

Leiten Sie eine Eingabeaufforderung an den Agenten weiter. Aufrufer mit mehreren Eingabeaufforderungen verwenden pro Sitzung eine FIFO-Warteschlange (ACP garantiert eine aktive Eingabeaufforderung pro Sitzung).

Anfrage:

```json
{
  "prompt": [{ "type": "text", "text": "What does src/main.ts do?" }],
  "delivery": {
    "kind": "channel",
    "target": {
      "channelName": "dingtalk",
      "type": "user",
      "id": "platform-user-id"
    }
  }
}
```

`delivery` ist optional und erfordert die `channel_delivery`-Fähigkeit. Der Daemon gibt weiterhin `202 {promptId,lastEventId}` zurück, wenn die Eingabeaufforderung aufgenommen wird. Nach einem erfolgreichen `end_turn` sendet die Sitzung den sichtbaren finalen Text an den bereits laufenden Channel Worker des exakten Workspaces. Die Nutzlast ist nur der letzte Tool-freie Assistent-Antwortblock; Tool-Aufruf-Einleitungen, Erzählungen zwischen Tools, ersetzte Wiederholungen und frühere automatische Fortsetzungsblöcke sind ausgeschlossen. Eine leere oder nur aus Leerzeichen bestehende finale Antwort erzeugt immer noch ein korreliertes `channel_delivery_result` mit `status: "skipped"` nachdem die Autorisierung verbraucht wurde, kontaktiert aber keinen Worker. Erfolg oder Misserfolg der Zustellung trifft später über dasselbe wiederspielbare Ereignis ein und ändert `turn_complete` nie in `turn_error`. Abbruch, Agent-Fehler und Beendigung aufgrund des Token-Limits senden oder veröffentlichen kein Zustellergebnis.

Validierung: `prompt` muss ein nicht-leeres Array von Objekten sein. Andere Fehler geben `400` zurück, bevor die Brücke erreicht wird.

`idempotencyKey` ist eine optionale nicht-leere Zeichenkette mit maximal 200 Zeichen (ungültige Werte geben `400 invalid_idempotency_key` zurück). Es identifiziert das EVENT des Aufrufers, nicht die HTTP-Anfrage: Die erste Aufnahme merkt sich den Schlüssel pro Sitzung, und eine wiederholte POST-Anfrage mit demselben Schlüssel gibt die ursprüngliche Aufnahme zurück — `202 { promptId, lastEventId, eventEpoch, deduplicated: true }` mit der `promptId` der ERSTEN Eingabeaufforderung und einem frischen Cursor/Epoch — ohne einen zweiten Turn in die Warteschlange einzureihen. Dies ermöglicht es einem Relay, das die Annahme dauerhaft nach dem `202` markiert (oder die Antwort verliert), sicher erneut zu versuchen. Dedupe ist best-effort innerhalb der Lebensdauer eines Daemons: Der Ring ist speicherresident und begrenzt (128 Schlüssel pro Sitzung, 1024 Sitzungen, FIFO-Verdrängung auf beiden Ebenen). Jede Obergrenze kann einen Schlüssel verdrängen, während sein Ereignis-Queue-Eintrag noch aktiv ist — die pro-Sitzungs-Obergrenze im normalen Fall einer langlebigen Sitzung, die mehr als 128 verschiedene Ereignisse aufnimmt, die Sitzungs-Obergrenze, wenn mehr als 1024 Sitzungen Schlüssel halten — und ein erneuter Versuch nach einer solchen Verdrängung re-injiziert. Der Ring stirbt auch mit der speicherresidenten Eingabeaufforderungs-Warteschlange, die er schützt, sodass ein Daemon-Neustart beide zusammen verliert und Re-Injektion die korrekte Wiederherstellung wird. Schlüssel sind pro Sitzung gültig; das Feld ist Aufnahme-Metadaten und wird niemals an den Agenten weitergeleitet.

Kanal-Relais nutzen drei `_meta`-Schlüssel, die die Route vor der Weiterleitung entfernt: `qwen.channel.prompt` (Kanal-Turn-Klassifizierung), `qwen.daemon.channelBoundRelay: true` (arbeitsbereichübergreifende gebundene Zustellabsicht) und `qwen.daemon.channelPromptAuthorization` (das Autorisierungstoken des Kanal-Workers; der Referenz-Worker sendet es nur, wenn er ein Credential besitzt). `qwen.channel.prompt` erfordert ein registriertes Autorisierungstoken für den Kanal-Worker — die Registrierung pro Arbeitsbereich für den Ziel-Arbeitsbereich oder, bei einer CROSS-Arbeitsbereichs-Zustellung, ein beliebiges registriertes Worker-Token plus das explizite `qwen.daemon.channelBoundRelay: true`-Marker und einen primären/vertrauenswürdigen Ziel. Ein Relais, das nur die beiden Marker ohne Credential sendet, erhält keine Kanal-Klassifizierung: Es wird als gewöhnliche interaktive Eingabeaufforderung zugelassen (Ablehnung wegen Schleifenerkennung, Live-PR-Bindungsauffüllung auf dem weitergeleiteten Text). Eine einfache Eingabeaufforderung mit einem fremden Worker-Token erhält ebenfalls keine Kanal-Klassifizierung und keine vom Aufrufer bereitgestellte Anzeigeprojektion.

Antwort:

```json
{ "promptId": "session-id########1", "lastEventId": 42 }
```

Die `202`-Antwort bestätigt die Zulassung, nicht die Agenten-Fertigstellung. Beobachten Sie den Session-SSE-Stream nach `lastEventId` und korrelieren Sie `turn_complete` oder `turn_error` über `promptId`. Jede erreichbare Vor-Enqueue-Zulassungsprüfung — einschließlich der reservierten Standalone-Arbeitsverzeichnis-Schutzprüfung — wirft synchron, sodass die Route eine Nicht-202-Fehlermeldung ANTWORTET, BEVOR irgendeine Akzeptanz erfolgt: Die Schutzprüfung antwortet mit `409 working_directory_missing` (`retryable: true`, `Retry-After: 5`), während die verwaltete Konversationsbindung der Session noch nicht freigegeben ist, und ein Kanal-Relais verschiebt das Ereignis stattdessen, anstatt eine Phantom-Akzeptanz zu verbrauchen. Falls eine Brücke dennoch verzögert vor der Zulassung ablehnt, verwirft die Route das `idempotencyKey` der Anfrage, sodass ein anschließender Versuch frisch zugelassen wird, statt in eine Phantom-Zulassung dedupliziert zu werden — eine Defense-in-Depth-Maßnahme für diesen Fall, dessen AKTUELLE Zustellung bereits vom Aufrufer verbraucht wurde.

`turn_complete.data.stopReason` enthält den ACP-`StopReason`, den der Agent zurückgegeben hat — `end_turn`, `max_tokens`, `max_turn_requests`, `refusal` oder `cancelled`. Der Daemon kann auch `cancelled` ausgeben für eine abgebrochene Eingabeaufforderung, ohne dass der Agent sie ausgeführt hat, einschließlich Entfernung aus der Warteschlange, Trennung des Aufrufers oder Drain/Teardown; dieser Wert beweist nicht, dass der Agent die Eingabeaufforderung ausgeführt hat. **Behandeln Sie das Feld als offenen String**: Es ist auf dem Draht als `string` typisiert, die ACP-Menge kann wachsen, und ein Client, der erschöpfend darauf switcht, wird beim nächsten Hinzufügen fehlschlagen.

Zwei Daemon-seitige Ergebnisse treffen **nicht** auf diesem Feld ein. Ein Turn, der innerhalb des Daemons fehlschlägt — Ablauf der Frist, Teardown-Flush, Absturz des Kindprozesses — wird als `turn_error`-Ereignis veröffentlicht, niemals als `turn_complete` stopReason. Sein `data` trägt immer `message`; `code` ist nur vorhanden, wenn der Daemon den Fehler klassifiziert hat (Fristablauf → `prompt_deadline_exceeded`, Teardown-Flush → `channel_closed`, `session_closed`, `session_killed` oder `daemon_shutdown`), und der Frame für eine Eingabeaufforderung, die abgelehnt wurde, weil der ACP-Kindprozess mitten in der Anfrage starb, trägt weder `code` noch `errorKind`. Behandeln Sie beide als optional und verzweigen Sie basierend auf `message`.

Ein Turn, der nach einem Neustart aus persistierter Historie wiederhergestellt wurde, wird überhaupt nicht im Stream neu veröffentlicht; er taucht in `promptTerminals[]` im `POST /session/:id/load`-Antwortkörper auf — als `{ terminal: "completed", stopReason: "reconstructed_from_transcript" }`, wenn der persistierte Schwanz zeigt, dass der Turn abgeschlossen ist, oder als `{ terminal: "interrupted", code: "daemon_lost" }` mit **keinem** `stopReason`, wenn der Daemon mitten im Turn starb. Ordnen Sie den Eintrag über `promptId` zu und verzweigen Sie basierend auf `terminal`; `promptTerminals` wird aus der Antwort vollständig weggelassen, wenn das Ledger keine Hinweise für die Session enthält.

Wenn der HTTP-Client mitten in einer Prompt-Anfrage die Verbindung trennt, sendet der Daemon eine ACP-`cancel`-Benachrichtigung an den Agenten, welche die Prompt-Anfrage mit `stopReason: "cancelled"` herunterfährt.

Wenn `prompt_absolute_deadline` beworben wird, kann `deadlineMs` die konfigurierte Server-Frist verkürzen. Der Ablauf emittiert ein korreliertes `turn_error` mit `code: "prompt_deadline_exceeded"`. Die Frist gibt den Aufrufer frei, ohne den Agenten zu töten; falls der Agent später abschließt, geben Turn-Status-Abfragen für dieses `promptId` das abgeschlossene Transkript-Ergebnis zurück, statt des Fristfehlers.

### `POST /session/:id/cancel`

Brechen Sie die **aktuell aktive** Prompt-Anfrage auf der Sitzung ab. Auf der ACP-Seite ist dies eine Benachrichtigung, keine Anfrage — der Agent bestätigt durch Auflösung der aktiven `prompt()` mit `cancelled`.

```bash
curl -X POST http://127.0.0.1:4170/session/$SID/cancel
# → 204 No Content
```

> **Multi-Prompt-Vertrag:** Abbruch betrifft nur die aktive Prompt-Anfrage. Alle Prompt-Anfragen, die derselbe Client zuvor gepostet hat und die hinter der aktiven weiterhin in der Warteschlange stehen, werden weiterhin ausgeführt. Multi-Prompt-Warteschlangen sind ein vom Daemon eingeführtes Verhalten (nicht in der ACP-Spezifikation); der Vertrag für wartende Prompt-Anfragen lautet: "Sie laufen weiter, es sei denn, Sie brechen jede einzelne ab oder beenden die Sitzung durch Kanal-Ausgang".

Wenn Eingabeaufforderungen in der Warteschlange in einer Multi-Client-Bereitstellung unerwartet sind, bestätigen Sie zunächst, ob Aufrufer eine Standard-`sessionScope: "single"`-Session teilen. Für unabhängige Gespräche pro Thread erstellen Sie Sessions mit `sessionScope: "thread"`, damit sich Eingabeaufforderungen nur innerhalb dieses Threads serialisieren.

### `DELETE /session/:id`

Schließen Sie eine aktive Sitzung explizit. Erzwingt das Schließen auch dann, wenn andere Clients verbunden sind — bricht alle aktiven Prompt-Anfragen ab, löst ausstehende Berechtigungen als abgebrochen auf, veröffentlicht ein `session_closed`-Ereignis, schließt den EventBus und entfernt die Sitzung aus den Daemon-Karten. Auf der Festplatte persistierte Sitzungen werden NICHT gelöscht — sie können über `POST /session/:id/load` neu geladen werden. Vorabprüfung `caps.features.session_close`.

```bash
curl -X DELETE http://127.0.0.1:4170/session/$SID
# → 204 No Content
```

Idempotent: Gibt `404` für unbekannte Sitzungen zurück. Das Fehler-Envelope verwendet `code: "session_not_found"`; ein gleichzeitiger Schließvorgang kann `code: "session_closing"` zurückgeben, was Clients als denselben erfolgreichen Endzustand für diese Route behandeln können.

> **`session_closed`-Ereignis.** SSE-Abonnenten empfangen ein terminales `session_closed`-Ereignis mit `{ sessionId, reason: 'client_close', closedBy?: '<clientId>' }` vor dem Ende des Streams. SDK-Reducer behandeln dies identisch mit `session_died` (setzen `alive: false`, löschen `pendingPermissions`).

### `PATCH /session/:id/metadata`

Aktualisieren von veränderbaren Session-Metadaten. Pre-flight `caps.features.session_metadata`. Gruppierung und Pinnen sind bewusst nicht Teil dieser Route; verwenden Sie `PATCH /session/:id/organization` unter `session_organization`.

Anfrage:

```json
{
  "displayName": "My Investigation Session",
  "pr": {
    "number": 123,
    "url": "https://github.com/QwenLM/qwen-code/pull/123",
    "state": "open"
  }
}
```

| Feld | Erforderlich | Hinweise |
| ------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `displayName` | nein | String. Werte, die länger als 256 UTF-16-Codeeinheiten sind, werden gekürzt, und der Schnitt berücksichtigt keine Surrogatpaare, sodass ein Name, der mit einem Nicht-BMP-Zeichen endet, ein einzelnes Surrogat-Halbzeichen verlieren kann. Ein leerer oder nur aus Leerzeichen bestehender Wert wird mit `400 invalid_metadata` abgelehnt; lassen Sie das Feld weg, um den Namen unverändert zu lassen. |
| `pr` | nein | Binden Sie einen Pull Request. Erfordert eine positive Ganzzahl `number`, eine HTTP(S)-`url` mit maximal 2.048 Zeichen ohne Steuerzeichen und optionale `state`: `open`, `merged` oder `closed`. |

Antwort:

```json
{
  "sessionId": "<uuid>",
  "displayName": "My Investigation Session",
  "prs": [
    {
      "number": 123,
      "url": "https://github.com/QwenLM/qwen-code/pull/123",
      "state": "open"
    }
  ]
}
```

`prs` ist die effektive begrenzte Bindungshistorie und kann aktualisierte Issue-Links enthalten. Veröffentlicht ein `session_metadata_updated`-Ereignis im SSE-Stream der Session, das nur die geänderte Feldgruppe trägt: Eine Umbenennung emittiert `displayName` (plus `titleSource`, wenn der Name gesetzt ist) und lässt `prs` absent, während eine Änderung der PR-Bindung `prs` emittiert und das aktuelle `displayName` widerhallt, wenn eines gesetzt ist. Behandeln Sie ein im Ereignis fehlendes Feld als unverändert, nicht als gelöscht, und lesen Sie den `200`-Body oder die Session-Liste erneut, wenn Sie die vollständigen Metadaten benötigen.

### `PATCH /session/:id/organization` and `PATCH /workspaces/:workspace/session/:id/organization`

Aktualisieren Sie den lokalen Organisationsstatus der Sitzung über das vorhandene Mutations-Gate. Vorabprüfung `caps.features.includes('session_organization')`; die Plural-Route erfordert zusätzlich `workspace_qualified_rest_core`. Auf der Plural-Route wird `:workspace` zuerst als exakte registrierte Workspace-ID aufgelöst und dann als URL-kodierte kanonische absolute cwd. Die ausgewählte Laufzeitumgebung muss vertrauenswürdig sein. Die Prüfung auf Existenz der Sitzung und Nicht-Null-Wert von `groupId` ist auf den aktiven persistierten, archivierten persistierten und Live-Sitzungsstatus sowie den Gruppenspeicher dieser Laufzeit beschränkt, ohne Fallback auf den primären oder einen anderen Workspace. Die Legacy-Route bleibt auf den primären Workspace beschränkt.

Anfrage:

```json
{ "isPinned": true, "groupId": "018f..." }
```

| Feld | Erforderlich | Hinweise |
| ---------- | -------- | ---------------------------------------------------------------------------------------------------- |
| `isPinned` | nein | Boolean. `true` setzt `pinnedAt`, wenn es nicht bereits angeheftet war; `false` löscht `pinnedAt`. |
| `groupId` | nein | Benutzerdefinierte Gruppen-ID oder `null` für ungruppiert. Unbekannte Gruppen-IDs geben `404 { code: "group_not_found" }` zurück. |
| `color` | nein | Ein unterstütztes Sitzungs-Farbtoken oder `null` zum Löschen der Sitzungsfarbe. |

Antwort:

```json
{
  "sessionId": "<uuid>",
  "groupId": "018f...",
  "color": "blue",
  "isPinned": true,
  "pinnedAt": "2026-07-04T12:00:00.000Z",
  "updatedAt": "2026-07-04T12:00:00.000Z"
}
```

Dieser Zustand wird im projektseitigen Session-Organisations-Sidecar unter dem Daemon-Runtime-Speicherpfad gespeichert. Er ist kein Transkriptinhalt, aktualisiert nicht das Transkript `mtime`, wird nicht mit Transkripten exportiert und bleibt bei Archivierung/Dearchivierung erhalten.

### `POST /session/:id/heartbeat`

Aktualisiert die Last-Seen-Buchführung des Daemons für diese Session. Langlebige Adapter (TUI/IDE/Web) senden in Intervallen Pings, damit zukünftige Widerrufsrichtlinien (Wave 5 PR 24) tote Clients von ruhenden unterscheiden können.

Header:

| Header | Erforderlich | Hinweise |
| ------------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `X-Qwen-Client-Id` | nein | Gibt die vom Daemon ausgegebene ID aus `POST /session` zurück. Identifizierte Clients aktualisieren auch ihren client-spezifischen Zeitstempel; anonyme Heartbeats aktualisieren nur den session-spezifischen Wasserstand. Muss dieselbe `[A-Za-z0-9._:-]{1,128}`-Struktur wie an anderer Stelle erfüllen. |

Der Request-Body ist leer (`{}` ist zulässig – heute werden keine Felder gelesen).

Antwort:

```json
{
  "sessionId": "<sid>",
  "clientId": "<cid>",
  "lastSeenAt": 1700000000123
}
```

`clientId` wird nur zurückgegeben, wenn ein vertrauenswürdiger `X-Qwen-Client-Id` bereitgestellt wurde. `lastSeenAt` ist die Daemon-seitige `Date.now()`-Epoch (ms), die der Bridge gespeichert hat.

Fehler:

- `400` — `{ code: 'invalid_client_id' }`, wenn der Header fehlerhaft ist (Header-Struktur-Regel) oder wenn er eine `clientId` enthält, die für diese Session nicht registriert ist (die Bridge wirft `InvalidClientIdError`, bevor sie einen Zeitstempel aktualisiert).
- `404` — unbekannte Session.

Fähigkeitsprüfung: Vorab-Check auf `caps.features.client_heartbeat`. Ältere Daemons geben für diesen Pfad `404` zurück.

### `POST /session/:id/model`

Wechselt das aktive Modell **innerhalb** des aktuell gebundenen Modellservices der Session. Serialisiert über die session-spezifische Modellwechsel-Warteschlange.

(Um den _Service_ selbst zu wechseln – Alibaba ModelStudio vs. OpenRouter usw. – übergeben Sie `modelServiceId` bei `POST /session` für eine neue Session. Stage 1 bietet keinen Live-Service-Wechsel-Pfad.)

Request:

```json
{ "modelId": "qwen-staging" }
```

Antwort: Das Modellwechsel-Ergebnis des ACP-Agenten, wortwörtlich weitergeleitet — der Daemon formt es nicht um, daher trägt die oberste Ebene kein `modelId`. Lesen Sie die Wechsel-Details aus `_meta.qwenModelSwitch`.

Bei Erfolg wird `model_switched` im SSE-Stream veröffentlicht. Bei Fehler wird `model_switch_failed` veröffentlicht (damit passive Abonnenten den Fehler sehen, nicht nur den Aufrufer). Es besteht ein Wettlauf gegen den Agent-Kanal-Exit, damit ein blockierter Child-Prozess den HTTP-Handler nicht blockieren kann. Ein erfolgreicher Wechsel speichert das Session-Modell auch best-effort im Session-JSONL; wenn der Datensatz geschrieben wird, versucht der Daemon beim Laden/Fortsetzen, dieses Session-Modell vor der Authentifizierung wiederherzustellen. Wenn das aufgezeichnete Modell nicht mehr angewendet werden kann (Modell entfernt, Credentials nicht verfügbar), verwendet die Wiederherstellung eine Registry-Route mit gleicher ID, falls vorhanden – für einen Runtime-Snapshot-Datensatz kann dies ein anderer Endpoint als die aufgezeichnete Bindung sein – und fährt nur dann mit dem `settings.model.name`-Standard fort, wenn keine Route auflöst. `settings.model.name` wird weiterhin als Standard für **neue** Sessions aktualisiert.

### `GET /session/:id/message-groups`

Fähigkeitstag: `session_message_deletion`. Bridge → ACP extMethod `qwen/status/session/message_groups`. Dies ist ein lesender Zugriff auf den Live-Session-Besitzer: Er löst die owning Runtime der Session auf und fällt nie auf den primären Workspace zurück. Die Daemon-weite Fähigkeit impliziert nicht Unterstützung für jede Session; SSH-Workspaces und Managed authoritative storage verweigern das Löschen.

Listet sicher zuordenbare Prompt-/Reply- oder Command-Display-Gruppen in aktiver Verlaufsreihenfolge. Es erwirbt keinen Writer-Lease für einen gewöhnlichen Legacy-Recorder. Der Lesevorgang wartet auf frühere Verlaufsänderungen; ein zurückgegebenes Snapshot kann veraltet werden, während sich die Session ändert. Das Löschen selbst erfordert eine idle Session.

Antwort (200):

```json
{
  "snapshot": "<opaque selection token>",
  "groups": [
    {
      "id": "<group-id>",
      "promptId": "<prompt-id>",
      "recordIds": ["<user-record-id>", "<reply-record-id>"]
    }
  ]
}
```

`promptId` und `promptIds` sind optionale Prompt-Identitäten; `recordIds` identifiziert die gespeicherten Datensätze der Gruppe. Ein leerer Verlauf gibt `groups: []` zurück. Behandeln Sie Gruppen-IDs und das Snapshot als opak; übergeben Sie das zurückgegebene Snapshot unverändert beim Löschen.

Fehler umfassen `404` für eine unbekannte Session, `400 unsupported_operation` für einen SSH-Workspace und `422 session_message_deletion_unsupported` für nicht unterstützten Speicher oder nicht verfügbare Aufzeichnung. Bestehende Writer-Integritätsfehler können auch `409 session_writer_conflict`, `409 session_writer_lost`, `409 session_transcript_changed` oder `503 session_writer_unavailable` zurückgeben.

### `POST /session/:id/messages/delete`

Fähigkeitstag: `session_message_deletion`. Bridge → ACP extMethod `qwen/control/session/messages_delete`. Strenges Mutations-Gate; scoped auf den Live-Session-Besitzer ohne Rückfall auf den primären Workspace. Akzeptiert optionales `X-Qwen-Client-Id` zur Event-Zuordnung.

Request:

```json
{ "snapshot": "<token from message-groups>", "groupIds": ["<group-id>"] }
```

Beide Felder sind erforderlich. `snapshot` muss nicht leer sein; `groupIds` muss unterschiedliche nicht-leere Strings enthalten. Die ausgewählten Gruppen müssen in diesem Snapshot noch existieren. Der Server lehnt busy Sessions ab, anstatt das Löschen hinter einer Modell-Turn zu queueing.

Antwort (200):

```json
{
  "deletedGroupIds": ["<group-id>"],
  "deletedPromptIds": ["<daemon-prompt-id>"]
}
```

Ausgewählte Originaldatensätze und ihr owned raw compression context werden physisch aus dem JSONL entfernt. Bestehender Summary-Text, Command-Effekte und Projektdateien bleiben erhalten. Das Löschen aller Gruppen lässt die Session für spätere Prompts verfügbar.

Fehler:

- `400 invalid_message_groups` — fehlerhafte, unbekannte oder doppelte Gruppenauswahl.
- `400 invalid_client_id` — fehlerhafter Attribution-Header.
- `404` — Session unbekannt.
- `409 session_busy` — Prompt- oder Verlaufs-Mutation aktiv; versuchen Sie es erneut, nachdem sie abgeschlossen ist.
- `409 worktree_reset_active` — diese Session wird durch einen Worktree-Reset ersetzt; verbinden Sie sich mit der Ersatz-Session neu.
- `409 message_groups_conflict` — Auswahl-Snapshot ist veraltet; holen Sie die Gruppen erneut ab und erzwingen Sie eine neue Auswahl vor dem erneuten Versuch.
- `409 message_history_invalid` — Verlauf kann nicht sicher zugeordnet werden; das bloße Ändern des Selection-Tokens kann dies nicht reparieren.
- `400 unsupported_operation` / `422 session_message_deletion_unsupported` — Session-/Workspace-Speicher unterstützt diese Operation nicht; Aktualisieren und Wiederholen der Anfrage wird sie nicht aktivieren.
- `409 session_writer_conflict`, `409 session_writer_lost`, `409 session_transcript_changed` oder `503 session_writer_unavailable` — exklusives Transkript-Eigentum konnte nicht etabliert oder beibehalten werden.
- `503 message_deletion_context_unavailable` — Löschung **wurde persistiert**, aber der Live-Kontext konnte nicht installiert werden. Der JSON-Body enthält `persisted: true`, `deletedGroupIds` und `deletedPromptIds`. Gleichen Sie die UI aus dem autoritativen Verlauf ab und öffnen Sie die Session neu, bevor Sie einen weiteren Prompt senden. Versuchen Sie nicht, die Löschung so zu wiederholen, als wäre nichts entfernt worden; spätere Prompts bleiben verweigert, bis die Kontext-Wiederherstellung erfolgreich ist.

Nachfolgende kontextabhängige Mutationen und Modell-Anfragen, während die Kontextwiederherstellung aussteht, geben 503 `session_history_context_unavailable` ohne `persisted` oder Lösch-Identitäten zurück. Das Laden oder Fortsetzen der Sitzung versucht erneut, den maßgeblichen JSONL-Kontext zu installieren; nur eine erfolgreiche Installation öffnet die Modellzulassung wieder. Der Lifecycle-Close bleibt verfügbar.

Nach der Persistenz veröffentlicht die Sitzung `session_messages_deleted` mit Daten `{sessionId, deletedGroupIds, deletedPromptIds}` und optional `originatorClientId` im **Event-Umschlag**. Interne API-Verlauf-Identitäten werden nicht auf dieser Leitung veröffentlicht. Dieses Ereignis tritt auch beim persistierten 503-Pfad auf. Peers müssen zwischengespeicherte Transkripte, Navigations-, Such- und Auswahlzustände ungültig machen und den maßgeblichen Verlauf neu laden. Der Initiator muss sowohl erfolgreiche HTTP-Antworten als auch `persisted: true`-Fehler abgleichen; er darf sich nicht darauf verlassen, sein eigenes SSE-Echo zu verarbeiten.

### `POST /session/:id/recap`

Fähigkeits-Marker: `session_recap`. Bridge → ACP extMethod `qwen/control/session/recap`.

Erzeugen Sie eine einzeilige Zusammenfassung „Wo war ich geblieben“ der Sitzung. Umschließt den Kern von `generateSessionRecap` (`packages/core/src/services/sessionRecap.ts`), der eine Nebenabfrage gegen das schnelle Modell mit deaktivierten Tools, `maxOutputTokens: 300` und einem strikten `<recap>...</recap>`-Ausgabeformat ausführt. Die Nebenabfrage liest den vorhandenen GeminiClient-Chatverlauf der Sitzung und fügt ihm **nichts** hinzu.

Der Anfragekörper wird ignoriert (senden Sie `{}` oder leer). Nicht-striktes Mutations-Gate — Haltung spiegelt `/session/:id/prompt` wider (der Aufruf kostet Tokens, mutiert aber keinen Zustand). Es wird kein SSE-Ereignis veröffentlicht.

Antwort (200):

```json
{
  "sessionId": "sess:42",
  "recap": "Debugging the auth retry race. Next: add deterministic timing to the integration test."
}
```

`recap` ist `null` (ein normales 200, kein Fehler), wenn:

- die Sitzung noch weniger als zwei Dialogrunden hat,
- die Nebenabfrage keine extrahierbare `<recap>...</recap>`-Nutzlast zurückgab,
- oder ein zugrunde liegender Modellfehler auftrat (der Kern-Helfer ist best-effort und wirft nie).

Fehler:

- `400 {code: 'invalid_client_id'}` — fehlerhafter `X-Qwen-Client-Id`-Header.
- `404` — unbekannte Sitzung.

Abbruch: **keiner in v1**. Die Route lauscht nicht auf HTTP-Client-Trennungen, es wird kein `AbortSignal` in die Bridge geleitet, und der ACP-Kindprozess führt die Nebenabfrage unabhängig davon zu Ende, ob der Anrufer getrennt hat. Die einzigen Obergrenzen sind die 60-Sekunden-Rückfallzeitüberschreitung der Bridge (`SESSION_RECAP_TIMEOUT_MS`) und das Transport-Closed-Rennen gegen den Tod des ACP-Kanals. Dies ist akzeptabel, da die Zusammenfassung kurz ist (Einzelversuch, `maxOutputTokens: 300`, typischerweise ~1–5 s); eine abbruchbasierte extMethod mit Request-ID kann in einer zukünftigen Version vollständige End-to-End-Abbrüche leiten, falls die Bandbreitenkosten dies jemals rechtfertigen.

### `POST /session/:id/generate`

Fähigkeits-Marker: `session_generation`.

Führen Sie Textgenerierung im Anfragekontext aus einer vom Aufrufer bereitgestellten Eingabeaufforderung heraus. Die Anfrage liest oder verändert keine Gesprächshistorie und stellt keine Tools zur Verfügung. Sie bevorzugt das konfigurierte schnelle Modell und fällt auf das Hauptmodell der Session zurück, wenn das schnelle Modell fehlt oder nicht aufgelöst werden kann. Der Endpunkt ist aufgabenagnostisch; Übersetzung ist nur eine mögliche aufruferdefinierte Eingabeaufforderung.

Anfrage:

```json
{ "prompt": "Translate into Chinese: Hello" }
```

Die Antwort ist `text/event-stream`. Der Server schreibt sofort einen anfänglichen SSE-Kommentar, gefolgt von `started`, einem optionalen `thinking`-Fortschrittsereignis, null oder mehr `delta`-Ereignissen und `done`. Das `thinking`-Ereignis enthält keine Begründungsinhalte. Ein Modellfehler nach Beginn des Streamings erzeugt ein `error`-Ereignis; es wird nicht mit einem anderen Modell wiederholt. Prompts sind auf 32 KiB UTF-8-Text begrenzt. Das Trennen des HTTP-Clients bricht die Generierungsanfrage ab.

### `POST /session/:id/btw/stream`

Fähigkeits-Marker: `session_btw_stream`. Umfang: Live-Sitzungsbesitzer.

Stellen Sie eine Nebenfrage ohne Tools unter Verwendung des Gesprächskontexts der aktiven Sitzung, ohne deren Transkript anzuhängen oder ihre Hauptaufgabe zu unterbrechen. Die bestehende JSON-`POST /session/:id/btw`-API bleibt mit ihrem ursprünglichen Verhalten verfügbar.

Anfrage:

```json
{ "question": "Why?", "requestId": "unique-request-id", "resume": false }
```

`question` ist ein nicht leerer, getrimmter String, begrenzt auf 4096 Zeichen vor dem Trimmen. `requestId` enthält 1–64 ASCII-Buchstaben, Ziffern, Unterstriche oder Bindestriche. `resume` ist optional und standardmäßig `false`. `X-Qwen-Client-Id` muss, wenn angegeben, einen Client benennen, der bei der aktiven Sitzung registriert ist. Jeder Start und Wiederaufnahme verwendet die aufgelöste Owner-Runtime und deren Vertrauens- und Mutations-Gates.

Die Antwort ist `text/event-stream`, mit `v: 1` bei jedem Ereignis:

| Ereignis | Nutzlast |
| -------- | --------------------------------------------------------------------------- |
| `answer` | `{ "type": "answer", "requestId": "...", "answer": "accumulated text" }`    |
| `done`   | `{ "type": "done", "requestId": "...", "answer": "trimmed complete text" }` |
| `error`  | `{ "type": "error", "requestId": "...", "code": "...", "message": "..." }`  |

Jedes `answer` ersetzt den vorherigen Text; es ist kein Delta zum Anhängen. Teil-Snapshots bewahren Leerzeichen; `done` trimmt führende und abschließende Leerzeichen, passend zum bestehenden JSON-BTW-Ergebnis. Der anfängliche Snapshot kann leer sein. `done` und `error` beenden den Stream. Heartbeat-Kommentare werden alle 15 Sekunden gesendet. Eine Antwort ist auf 1 MiB UTF-8-Text begrenzt; Überschreiten erzeugt `btw_failed`. Der Daemon beendet die Generierung nach fünf Minuten mit `btw_timeout`; Aufräumfristen für Kindprozesse und Bridge erlauben jeweils weitere fünf bzw. zehn Sekunden. Explizite Abbruchvorgänge erzeugen `btw_cancelled`; andere Upstream-Fehler erzeugen `btw_failed`.

HTTP-Trennung löst nur den Subscriber ab. Verbinden Sie sich mit derselben `requestId`, Frage und Client-Identität und `resume: true` neu, um den neuesten Snapshot zu erhalten, ohne einen weiteren Modellaufruf zu starten. Wiederholte anfängliche Übermittlungen mit derselben Identität nutzen auch gespeicherte Arbeit. Kein Ereignis-Cursor oder `Last-Event-ID` ist erforderlich. Eine `resume: true`-Anfrage, deren gespeicherter Eintrag fehlt, gibt 410 zurück und startet niemals neue Arbeit. Anfragen sind durch Bridge-Identität, Sitzung, Client und Anfrage-ID eingeschränkt; sie können nicht über einen Daemon-Neustart oder eine ersetzte Owner-Runtime hinweg fortgesetzt werden.

Es gibt maximal 32 gespeicherte Anfragen pro Owner-Runtime. Quittungen für Endzustände und Abbruchmarkierungen verfallen nach 60 Sekunden und können früher entfernt werden, älteste zuerst, um eine neue Anfrage zuzulassen. Aktive Anfragen werden nicht entfernt. Die Generierung hält während des Wartens auf das Modell oder den Subscriber keine gemeinsame Archiv-Zulassungssperre der Sitzung; Bridge-Aktivität schützt sie weiterhin gegen Idle-Cleanup. Explizites Schließen der Sitzung und Herunterfahren des Daemons behalten ihr normales Abbruchverhalten bei.

Fehler vor dem Start von SSE:

- `400 invalid_btw_request` — ungültige Frage, Anfrage-ID oder Fortsetzungs-Flag.
- `400 invalid_client_id` — fehlerhafte oder nicht registrierte Client-Identität.
- `403 untrusted_workspace` — der aufgelöste Nicht-Primär-Besitzer ist nicht vertrauenswürdig.
- `404 session_not_found` — kein aktiver Besitzer vorhanden.
- `409 btw_request_conflict` — die beibehaltene ID gehört zu einer anderen Frage.
- `410 btw_expired` — eine Fortsetzung hat keine beibehaltene Anfrage.
- `429 btw_limit` — alle 32 beibehaltenen Anfragen sind aktiv.
- `501 btw_stream_not_supported` — die Bridge des Besitzers kann BTW nicht streamen.

### `DELETE /session/:id/btw/stream/:requestId`

Fähigkeitskennzeichnung: `session_btw_stream`. Geltungsbereich: live-session-owner.

Brechen Sie die passende BTW-Anfrage mit derselben Sitzungs- und Client-Identität ab, die zum Starten verwendet wurde. Gibt leeres `204` zurück; Abbruch ist idempotent für eine gespeicherte Anfrage. Die exakte gecachte Identität kann abbrechen, nachdem ihr Client getrennt hat, während unbekannte IDs einen noch registrierten Client erfordern. Das Abbrechen einer unbekannten ID zeichnet eine kurzlebige Abbruchmarkierung auf, damit ein verzögerter initialer POST keine Arbeit starten kann.

Die Route verwendet dieselbe Owner-Auflösung, Vertrauens- und Mutations-Gates wie Streaming-POST. Ungültige IDs geben `400 invalid_btw_request` zurück; ungültige Client-Identitäten geben `400 invalid_client_id` zurück. Ein unbekannter Abbruch gibt `429 btw_limit` zurück, wenn alle 32 gespeicherten Anfragen aktiv sind. Eine bekannte aktive Anfrage kann immer abgebrochen werden, auch wenn die Runtime an ihrer Kapazitätsgrenze ist. Abbruch bricht weder den Haupt-Prompt noch das BTW einer anderen Sitzung ab.

### Mutation: Genehmigung, Tools, Skills, Init, MCP-Neustart

Der Daemon stellt fünf Mutations-Kontrollrouten bereit, die es Remote-Clients ermöglichen, die Haltung der Laufzeitumgebung zu ändern, ohne die CLI des Daemon-Hosts zu berühren. Die Steuerung des Genehmigungsmodus behält ihr nicht-striktes Kompatibilitäts-Gate bei. Tool-Umschaltung, Skill-Umschaltung, Workspace-Initialisierung und MCP-Neustart verwenden das strikte Mutations-Gate: vertrauenswürdige Loopback-Primär-, Bearer-authentifizierte und gepaarte Local-Control-Anfragen bestehen. Eine tokenlose Primäranfrage, die das Gate ohne vertrauenswürdige Loopback-Autorität erreicht, erhält `401 {code: 'token_required'}`; fehlende oder ungültige konfigurierte Anmeldeinformationen und ungepaarte Local-Control-Anmeldeinformationen werden früher mit einfachem `401 Unauthorized` abgelehnt. Alle fünf:

- Akzeptieren und stempeln Sie den `X-Qwen-Client-Id`-Header (PR 7 Audit-Kette). Wenn der Header eine vertrauenswürdige ID enthält, sendet der Daemon `originatorClientId` auf dem entsprechenden SSE-Ereignis, damit clientübergreifende UIs Echos ihrer eigenen Mutationen unterdrücken können.
- Prüfen Sie jede fähigkeitsspezifische Fähigkeit vor der Bereitstellung der Funktion im Voraus. Ein Daemon, dem eine Route fehlt, gibt `404` zurück. Für die Skill-Einstellungs-Routen kann das Fehlen der Kennzeichnung stattdessen bedeuten, dass dieselben Pfade den eingestellten katalogvalidierten Vertrag bedienen: die Einzelziel-Route kann HTTP `404 skill_not_found` oder `409 skill_not_toggleable` zurückgeben, während die Batch-Route HTTP 200 mit katalogabgeleiteten Fehlern in `errors[]` zurückgibt. Verwenden Sie das Routen-Probing nicht als Versionsprüfung.

Die Routen für Tool-Umschaltung, Skill-Umschaltung, Init und MCP-Neustart senden **workspace-bezogene** Ereignisse: Jeder aktive Sitzungs-SSE-Bus empfängt das Ereignis, unabhängig davon, welche Sitzung angehängt war, als die Mutation ausgelöst wurde. `approval-mode` sendet ein **sitzungsbezogenes** Ereignis, da die Änderung lokal auf die `Config` einer Sitzung beschränkt ist.

#### `POST /session/:id/approval-mode`

Fähigkeitskennzeichnung: `session_approval_mode_control`. Bridge → ACP extMethod `qwen/control/session/approval_mode`.

Ändern Sie den Genehmigungsmodus einer aktiven Sitzung. Der neue Modus wird sofort innerhalb des pro-Sitzungs-`Config` des ACP-Kindprozesses übernommen und aus dem Transkript dieser Sitzung wiederhergestellt, wenn die Chat-Aufzeichnung verfügbar ist. Der ausgewählte Ausführungsmodus des Plans wird damit wiederhergestellt. Workspace-Einstellungen werden standardmäßig NICHT geschrieben — übergeben Sie `persist: true`, um `tools.approvalMode` auch in die Workspace-Einstellungen zu schreiben. Wenn die Aufzeichnung deaktiviert oder degradiert ist, bleibt der Modus nur für die aktive Sitzung gültig.

Anfrage:

```json
{ "mode": "auto-edit", "persist": false }
```

`mode` muss eines von `'plan' | 'default' | 'auto-edit' | 'auto' | 'yolo'` sein (Spiegelung des `ApprovalMode`-Enums des Kerns; das SDK exportiert `DAEMON_APPROVAL_MODES` zur Laufzeitvalidierung). `persist` standardmäßig auf `false` gesetzt.

Antwort (200):

```json
{
  "sessionId": "sess:42",
  "mode": "auto-edit",
  "previous": "default",
  "persisted": false
}
```

Fehler:

- `400 {code: 'invalid_approval_mode', allowed: [...]}` — unbekanntes Modus-Literal.
- `400 {code: 'invalid_persist_flag'}` — `persist` ist nicht boolesch.
- `403 {code: 'trust_gate', errorKind: 'auth_env_error'}` — der angeforderte Modus erfordert einen vertrauenswürdigen Ordner (privilegierte Modi in nicht vertrauenswürdigen Workspaces werden vom `Config.setApprovalMode` des Kerns abgelehnt).
- `404` — Sitzung unbekannt.

SSE-Ereignis (sitzungsbezogen): `approval_mode_changed` mit `{sessionId, previous, next, persisted, originatorClientId?}`.

#### `POST /workspace/tools/:name/enable`

Fähigkeitskennzeichnung: `workspace_tool_toggle`. Reine Datei-E/A — kein ACP-Roundtrip.

Schalten Sie einen Tool-Namen in der `tools.disabled`-Einstellungenliste des Workspaces um. Dort aufgeführte Tools werden überhaupt **nicht registriert** (unterschiedlich zu `permissions.deny`, das das Tool registriert lässt und den Aufruf ablehnt). Sowohl integrierte Tools als auch MCP-entdeckte Tools durchlaufen `ToolRegistry.registerTool`, das die deaktivierte Menge konsultiert.

> ⚠️ **Namen müssen exakt mit der exponierten Kennung der Registry übereinstimmen.** Es findet keine Alias-Auflösung statt — die Route speichert den String aus dem Pfadparameter in `tools.disabled`, und der nächste ACP-Kindprozess vergleicht dies beim Registrieren mit `tool.name`. Integrierte Tools verwenden ihren kanonischen Registry-Namen (snake_case Verbform): `run_shell_command`, `read_file`, `write_file`, `list_directory`, `glob`, `grep_search`, `web_fetch` usw. — NICHT die Anzeigelabels (`Shell`, `Read`, `Write`), die die CLI anzeigt. MCP-entdeckte Tools verwenden die qualifizierte `mcp__<server>__<name>`-Form (was auch die Form ist, die `tool_toggled`-Ereignisse senden und was `GET /workspace/mcp` auflistet). Das Deaktivieren von `Bash` verhindert NICHT, dass `run_shell_command` in der nächsten Sitzung registriert wird.

Aktive ACP-Kindprozesse behalten bereits registrierte Tools bei — die Umschaltung wirkt sich auf den **nächsten** ACP-Kindprozessstart aus. Kombinieren Sie dies mit `POST /workspace/mcp/:server/restart` (für MCP-quellbasierte Tools) oder der Erstellung einer neuen Sitzung, um die Änderung in der aktuellen Daemon-Umgebung wirksam zu machen.

Unbekannte Tool-Namen werden akzeptiert: Das Vorab-Deaktivieren eines noch nicht installierten MCP-Tools ist ein legitimer Anwendungsfall.

Anfrage:

```json
{ "enabled": false }
```

Antwort (200):

```json
{ "toolName": "run_shell_command", "enabled": false }
```

Fehler:

- `400 {code: 'invalid_tool_name'}` — Leerer Pfadparameter oder Pfadparameter überschreitet die Obergrenze von 256 Zeichen.
- `400 {code: 'invalid_enabled_flag'}` — `enabled` fehlt oder ist kein Boolescher Wert.

SSE-Ereignis (arbeitsbereichbezogen): `tool_toggled` mit `{toolName, enabled, originatorClientId?}`.

#### Aufteilung der Skills-Konfigurations- und Runtime-Routen

Fähigkeitskennzeichnung: `workspace_skills_config_runtime`.

`GET /workspace/config/skills` liest den daemon-lokalen globalen Konfigurationsbesitzer. `GET /workspaces/:workspace/config/skills` liest die exakt registrierte Arbeitsbereichskonfiguration und erfordert keine aktive oder vertrauenswürdige Laufzeitumgebung. Beide geben das normale Skills-Statusformat ohne erforderliches `runtimeEpoch` zurück:

```json
{
  "v": 1,
  "workspaceCwd": "/work/project",
  "initialized": true,
  "skills": []
}
```

`GET /workspace/runtime/skills` und `GET /workspaces/:workspace/runtime/skills` lesen die ausgewählte vertrauenswürdige Laufzeitumgebung, ohne sie zu starten. Ein Live-Katalog enthält die Laufzeitgeneration, die ihn erzeugt hat:

```json
{
  "v": 1,
  "workspaceCwd": "/work/project",
  "initialized": true,
  "runtimeEpoch": 4,
  "skills": []
}
```

Globale Installation und Löschung verwenden `POST /workspace/config/skills/install` und `DELETE /workspace/config/skills/:name?scope=global`. Arbeitsbereichsinstallation, -löschung und -aktivierung verwenden `POST /workspaces/:workspace/config/skills/install`, `DELETE /workspaces/:workspace/config/skills/:name?scope=workspace` und `POST /workspaces/:workspace/config/skills/:name/enable`. Konfigurationsänderungen committen dauerhaften Zustand, bevor die Laufzeitabgleichung geplant wird. Ihr `activation` ist `deferred`, wenn keine aktuelle Laufzeitumgebung aktualisiert werden kann, und `reconciling`, wenn eine Aktualisierung in die Warteschlange gestellt wurde; ein No-Op-Toggle bewahrt die Aktivierung der Fassade, anstatt zu behaupten, dass eine Laufzeitaktualisierung stattgefunden hat.

Die Konfigurationslöschung gibt `503 skills_config_unavailable` zurück, anstatt einer definitiven Not-found-Antwort, wenn das daemon-lokale Skill-Inventar nicht enumerierbar ist. Die Laufzeitlöschung (`DELETE /workspace/skills/:name` und ihre arbeitsbereichqualifizierte Form) erfordert einen frisch enumerierten Katalog: Sie gibt dasselbe `503 skills_config_unavailable` zurück, wenn weder der Laufzeitkatalog noch die daemon-lokale Enumeration einen initialisierten Katalog liefert, selbst wenn eine beibehaltene Beobachtung existiert. `404 skill_not_found` bedeutet, dass der Katalog enumeriert wurde und der Name nicht darin enthalten ist.

Der einzelne Mutationsbesitzer lehnt den Arbeitsbereichsumfang mit `400 workspace_scope_requires_qualified_workspace` ab; qualifizierte Mutationen lehnen den globalen Umfang mit `400 global_scope_requires_singular_owner` ab. Qualifizierte Schreibvorgänge erfordern einen vertrauenswürdigen Arbeitsbereich. Eine Legacy injizierte Brücke gibt `501 workspace_runtime_not_supported` für qualifizierte Konfigurationsschreibvorgänge zurück, die eine Laufzeitkoordination erfordern. Unbekannte, entfernte, übergehende und entleerende Arbeitsbereiche folgen den Standardfehlern für qualifizierte Arbeitsbereiche und fallen niemals auf primär zurück.

#### Native Skill-Archivinstallation und Quittungen

`skill_archive_install` und `skill_zip_file_source` bewerben native ZIP-Eingaben und die entsprechenden besitzerbezogenen Quittungsabfragen. Beide sind auf die moderne Konfigurationsoberfläche beschränkt. Ihre `limits.maxSkillArchiveBytes`, `maxSkillArchiveExpandedBytes`, `maxSkillArchiveEntries` und `maxSkillArchiveManifestBytes` gelten nur für diese zwei Quellen: 50 MiB komprimiert, 200 MiB expandiert, 4096 ZIP-Datensätze und 32 MiB für die effektive Wurzel `SKILL.md`. Explizite Verzeichnisse und ignorierte Metadaten zählen als Datensätze vor dem Filtern; implizite Eltern tun dies nicht. Ignorierte Metadaten werden nicht aufgebläht. Legacy Base64-, Verzeichnis- und GitHub-Limits, einschließlich des 10 MiB JSON-Parsers, bleiben unverändert.

- `POST /workspace/config/skills/install-archive?name=...&attemptId=...` installiert global; `/workspaces/:workspace/config/skills/install-archive` installiert in den ausgewählten Arbeitsbereich. Senden Sie `application/octet-stream` ohne HTTP-Inhaltskodierung. Die Route legt den Umfang fest.
- Die bestehenden modernen JSON-Installationsrouten akzeptieren auch `{ "name": "example", "scope": "global", "attemptId": "<UUID>", "source": { "type": "zip-file", "path": "/absolute/daemon/path.zip", "sha256": "<optional 64 hex digits>" } }`. Qualifizierte Routen erfordern `scope: "workspace"`. Der Daemon kopiert die geöffnete reguläre Datei in privaten Speicher und entfernt oder benennt die Datei des Aufrufers niemals um. Halten Sie die Quelle während des Kopierens stabil; Metadatenprüfungen allein sind kein atomarer Snapshot.
- `GET /workspace/config/skills/install-attempts/:attemptId` und `GET /workspaces/:workspace/config/skills/install-attempts/:attemptId` fragen den ursprünglichen Besitzer ab. Antworten tragen `running` (mit Phase), `committed`, `not_committed` oder `recovery_required`. Fehlende oder unzugängliche Quittungen bedeuten, dass das Ergebnis nicht bestätigt werden kann. Abfragen starten weder eine Laufzeitumgebung noch erwerben sie den Mutationskoordinator.

Der Client stellt eine UUID bereit, bevor er sendet; das SDK kann sie generieren. Eine doppelte ID unter demselben Besitzer gibt 409 zurück, ohne die Installation zu wiederholen. Pro Daemon können zwei Operationen aktiv sein, einschließlich Sperrenwartungen und Bereinigung; weitere Zulassungen geben 429 mit `Retry-After` zurück. Es gibt ein Budget von 120 Sekunden, das die Quittungsaufnahme bis zur Publikationszulassung abdeckt. Stornierung vor der Publikation stoppt die Operation; nach der Zulassung wird Commit oder Rollback abgeschlossen, auch wenn die HTTP-Verbindung verschwindet.

Erfolg behält das Mutationsresultat und die Aktivierung bei und fügt `attemptId` und `archiveSha256` hinzu. Ein Post-Commit-Aktivierungsfehler ist ein `activationWarning`, kein fehlgeschlagener Commit. Quittungen sind prozesslokale historische Ergebnisse, die zehn Minuten lang nach Abschluss der Arbeit aufbewahrt werden, mit einer Kapazität von 256 und keiner frühen Vertreibung. Sie beweisen nicht, dass eine spätere Operation den installierten Inhalt nicht ersetzt hat. Neustart, Ablauf oder Verlust des Besitzerzugriffs machen das Ergebnis unbekannt. Clients müssen nach mehrdeutigen Fehlern abfragen und dürfen nicht automatisch erneut senden.

#### `POST /workspace/skills/refresh`

Fähigkeitskennzeichnung: `workspace_session_refresh`. Die arbeitsbereichqualifizierte Form ist `POST /workspaces/:workspace/skills/refresh`. Die einzelne Route besitzt die primäre Laufzeitumgebung; die qualifizierte Route löst die exakt ausgewählte vertrauenswürdige Laufzeitumgebung auf und fällt niemals auf primär zurück. Beide verwenden das strenge Mutationsgate und die bestehenden Client-Identitätsprüfungen.

Laden Sie Skill-Einstellungen und -Inhalte explizit für alle aktiven Sitzungen neu oder nur für die angegebenen Sitzungs-IDs:

```json
{ "sessionIds": ["session-1", "session-2"] }
```

Das Weglassen von `sessionIds` aktualisiert alle aktiven Sitzungen. IDs müssen nicht-leere Strings sein und werden in Anfrage-Reihenfolge dedupliziert; `[]` gibt Null-Zählungen zurück, ohne Sitzungen oder Caches zu aktualisieren. Ungültige Anfrageformen geben HTTP 400 zurück. Unbekannte IDs und IDs, die einem anderen Arbeitsbereich gehören, geben HTTP 404 zurück, bevor irgendeine Aktualisierung beginnt. Ausgewählte Sitzungen werden nur an ihre besitzenden Execution-Engine-Kanäle weitergeleitet; unrelated Kanäle erhalten keinen Aktualisierungsbefehl.

Antwort (200):

```json
{
  "sessionsRefreshed": 2,
  "sessionsFailed": 0,
  "configsRefreshed": 3,
  "configsFailed": 0,
  "reason": "all"
}
```

Zählungen beschreiben die ausgewählten Sitzungen und die geteilten/Sitzungskonfigurationen, die für ihre Besitzerkanäle aktualisiert wurden. Die Auswahl steuert die sofortige Sitzungsauffrischung und Befehlsbenachrichtigungen; geteilte Kanal-Caches können sich ändern, und Arbeitsbereichsereignisse bleiben arbeitsbereichweit. Die explizite Anfrage aktualisiert nicht die Revision oder Bereitschaft des Skill-Koordinators. Skill-Aktivierung/Deaktivierung, Installation/Löschung und automatische Abgleichung behalten ihr bestehendes Voll-Auffrischungsverhalten bei. Diese Route fügt Skill-Toggle-Bodies weder `refreshRuntime` noch `sessionIds` hinzu.

#### `POST /workspace/skills/:name/enable`

Fähigkeitskennzeichnung: `workspace_skill_settings_toggle`. Die arbeitsbereichqualifizierte Form ist `POST /workspaces/:workspace/skills/:name/enable`.

Aktualisieren der Workspace-Skill-Einstellungen für einen Namen. Bei Aktivierung löst der Daemon zuerst von Erweiterungen erstellte Namen anhand einer frischen Katalogbeobachtung auf, umgeht gespeicherte Daten und Lesedrosselung und wartet bei Bedarf auf ACP sowie den Daemon-lokalen Fallback; wenn beide frischen Quellen fehlschlagen, wird vor der Legacy-Namen-Heuristik eine gespeicherte Beobachtung verwendet. Namen werden nicht gegen den Katalog validiert. Deaktivierung liest den Katalog nicht. Der gekürzte Anfragename wird an die Persistenz übergeben und in der Antwort zurückgegeben. Das Aktivieren eines Namens protokolliert ein Workspace-`skills.enabled`-Opt-in, noch vor der Installation; das Deaktivieren entfernt dieses Opt-in und fügt einen Workspace-`skills.disabled`-Eintrag hinzu. Bestehende Einträge für Skills, die nicht mehr geladen sind, bleiben erhalten, und doppelte/groß-klein-Varianten des Ziels werden zusammengeführt. Ein hartes `skills.disabled`-Eintrag, geerbt aus einem höheren Scope, bleibt maßgeblich für die effektive Verfügbarkeit, verhindert aber nicht, dass der Workspace-Scope seine eigene Erklärung speichert oder entfernt. Workspace-Erklärungen nehmen ansonsten an der üblichen `skills.disabled > skills.enabled > skills.defaultDisabled`-Auflösung teil und können höher-scopeige `skills.defaultDisabled`- oder `skills.enabled`-Einträge überschreiben.

Dies unterscheidet sich vom ACP-`qwen/skills/setEnabled`-Managed-Skill-Vorgang und dem `disable-model-invocation`-Frontmatter-Feld. Für eine aktive Extension-Elternkomponente folgt die effektive Skill-Verfügbarkeit `skills.disabled` > `skills.enabled` > `skills.defaultDisabled` > Workspace-interner Override > Manifest `skillStates` > aktiviert. Sowohl harte als auch Standard-Deaktivierungen entfernen den Skill aus der Slash-Befehl-/Modellverfügbarkeit und lehnen spätere Skill-Ausführungen ab. `disable-model-invocation: true` hält die direkte Benutzerausführung verfügbar und verbirgt den Skill nur vor der Modellausführung.

Anfrage:

```json
{ "enabled": false }
```

Antwort (200):

```json
{
  "skillName": "review",
  "enabled": false,
  "changed": true,
  "activation": "applied",
  "sessionsRefreshed": 2,
  "sessionsFailed": 0
}
```

`activation` spiegelt die Kind-Lebendigkeit und jede erforderliche Aktualisierung unabhängig von `changed` wider. Es ist `applied`, wenn ein ACP-Kind lebt und jede erforderliche Aktualisierung erfolgreich ist, `deferred`, wenn beim Lebendigkeitscheck kein Kind lebte oder eine geänderte Anfrage ihr Kind/Session während der erforderlichen Aktualisierung verliert, und `partial`, wenn mindestens eine andere erforderliche Aktualisierung fehlschlägt. Eine No-Op kann daher `applied` oder `deferred` mit `changed: false` sein; wenn `changed` wahr ist und die Aktivierung `deferred` ist, wird die persistierte Erklärung verwendet, wenn ein Kind startet. Beschäftigte Sessions sind in eine erforderliche Aktualisierung einbezogen. Der Daemon lädt die Workspace-Einstellungen für das ACP-Kind und jede aktive Session neu, benachrichtigt SkillManager-Konsumenten und sendet `available_commands_update`. Eine bereits an das Modell gesendete Anfrage wird nicht umgeschrieben; nachfolgende Validierungen, Befehlssnapshots und Modellkontexte verwenden den neuen Zustand. Wenn die Persistenz fehlschlägt, wird keine Aktualisierung oder Ereignis ausgelöst. Wenn eine Session-Aktualisierung fehlschlägt, wird die committete Einstellung beibehalten. Wenn das Kind pro-Session-Ergebnisse zurückgibt, sind die Session-Zählungen exakt. Wenn die Aktualisierungssteuerung selbst fehlschlägt, bevor diese Ergebnisse zurückgegeben werden, ist `sessionsFailed: 1` eine konservative Untergrenze, die angibt, dass die Aktualisierungsanfrage fehlgeschlagen ist.

Fehler:

- `400 {code: 'invalid_skill_name'}` — leerer Pfadparameter oder mehr als 256 Zeichen.
- `400 {code: 'invalid_enabled_flag'}` — `enabled` fehlt oder ist nicht boolesch.
- `403 {code: 'untrusted_workspace'}` — der ausgewählte Workspace ist nicht vertrauenswürdig.

Die Mutation nutzt das Workspace-scopeige `settings_changed`-Ereignis für jeden geänderten Schlüssel (`skills.disabled` und/oder `skills.enabled`) wieder; sie fügt keinen neuen Ereignistyp hinzu. Jedes dieser Ereignisse enthält dasselbe `mutation`-Objekt: `{ id, kind: 'skill_toggle', skills: [{ name, enabled }], activation, sessionsRefreshed, sessionsFailed }`. `id` korreliert jedes Einstellungsereignis, das durch eine Toggle-Anfrage erzeugt wurde. `skills` listet die angeforderten Namen und angeforderten aktivierten Werte auf, deren Workspace-Einstellungserklärungen tatsächlich geändert wurden; eine höher-scopeige Einstellung kann die effektive Verfügbarkeit unverändert lassen. Workspace-Skill-Statuszellen enthalten optionale `disabledReason: 'hard' | 'default' | 'inactive_extension'`- und `lockedScope: 'system' | 'user' | 'systemDefaults'`-Felder.

#### `POST /workspace/skills/enable`

Capability-Tag: `workspace_skill_settings_batch_toggle`. Die workspace-qualifizierte Form ist `POST /workspaces/:workspace/skills/enable`.

Aktualisieren der Workspace-Skill-Einstellungen für bis zu 100 Namen in einer Anfrage; die Obergrenze zählt die rohen `skillNames`-Einträge vor der Deduplizierung. Namen werden getrimmt und case-insensitiv dedupliziert, wobei die Reihenfolge des ersten Auftretens und die Groß-/Kleinschreibung beibehalten werden. Bei Aktivierung löst der Daemon zuerst von Erweiterungen erstellte Namen anhand einer frischen Katalogbeobachtung auf, umgeht gespeicherte Daten und Lesedrosselung und wartet bei Bedarf auf ACP sowie den Daemon-lokalen Fallback; wenn beide frischen Quellen fehlschlagen, wird vor der Legacy-Namen-Heuristik eine gespeicherte Beobachtung verwendet. Namen werden nicht gegen den Katalog validiert. Deaktivierung liest den Katalog nicht. Es wendet alle resultierenden Erklärungänderungen in höchstens einem gesperrten Einstellungs-Schreibvorgang an und aktualisiert bei Änderungen aktive Sessions einmal. Aktivierung protokolliert immer ein explizites Workspace-`skills.enabled`-Opt-in, einschließlich noch nicht installierter Namen, sodass es eine interne Deaktivierung einer Extension überschreiben kann. Wiederholung einer identischen Erklärung bleibt eine No-Op. Unerwartete Persistenz- oder Runtime-Generierungsfehler lassen die gesamte Anfrage fehlschlagen.

Anfrage:

```json
{
  "skillNames": ["review", "deploy", "missing"],
  "enabled": false
}
```

Antwort (200):

```json
{
  "enabled": false,
  "activation": "applied",
  "sessionsRefreshed": 2,
  "sessionsFailed": 0,
  "results": [
    {
      "skillName": "review",
      "enabled": false,
      "changed": true
    },
    {
      "skillName": "deploy",
      "enabled": false,
      "changed": true
    },
    {
      "skillName": "missing",
      "enabled": false,
      "changed": true
    }
  ],
  "errors": []
}
```

Fehlerhafte Anfragen geben HTTP 400 mit `invalid_skill_names`, `invalid_skill_name` oder `invalid_enabled_flag` zurück. Authentifizierung, Workspace-Vertrauen, Client-Identität, unerwartete Persistenzfehler und Runtime-Generierungsfehler lassen die gesamte Anfrage über die standardmäßigen Route-Gates fehlschlagen. `errors` bleibt aus Drahtkompatibilitätsgründen in der Antwort und ist für strukturell gültige Namen leer. Batch-Level-`activation`, `sessionsRefreshed` und `sessionsFailed` beschreiben die Kind-Lebendigkeit und die einzelne Live-Session-Aktualisierung, die von allen geänderten Ergebnissen geteilt wird. Ein Batch, in dem sich kein Ziel geändert hat, kann dennoch `applied` antworten, wenn ein Kind lebt, oder `deferred`, wenn keines existiert, passend zur Single-Skill-No-Op-Antwort, sodass abgeleitet werden muss, was sich tatsächlich geändert hat, aus dem `changed`-Flag jedes Ergebnisses. Wenn sich mindestens ein Ziel ändert, sendet der Daemon dieselben `settings_changed`-Mutationsmetadaten wie die Single-Skill-Route; jedes `skills.disabled` / `skills.enabled`-Ereignis aus dieser Anfrage teilt sich ein `mutation.id`.

#### `PUT /skills/activation`

Capability: `user_skill_activation` (angekündigt, wenn User-Einstellungspersistenz verfügbar ist). Diese prozessglobale Mutation speichert User-Skill-Präferenzen ohne Anforderung eines vertrauenswürdigen Workspaces oder Scannens installierter Skills. Sie nutzt die üblichen authentifizierten Mutations-Gates; ein optionales `X-Qwen-Client-Id` muss zu einer weiterhin verwalteten Runtime gehören, einschließlich einer, die entleert wird.

```json
{
  "skillNames": ["rust:pdf", "go:review"],
  "state": "enabled"
}
```

Geben Sie 1–100 Namen an (jeder maximal 256 Zeichen). Namen werden getrimmt und case-insensitiv dedupliziert. `state` ist `enabled` oder `disabled`. Nur `disabled` akzeptiert `mode`: `hard` (Standard) oder `default`. Namen müssen noch nicht installiert sein. Ungültige Batches werden vor jedem Schreibvorgang abgelehnt.

Qwen liest die neuesten Benutzereinstellungen unter seiner Schreibsperre für Einstellungen, fügt jeden expliziten Namen zu `skills.enabled`, `skills.disabled` oder `skills.defaultDisabled` hinzu und entfernt denselben Namen in einem einzigen Speichervorgang aus den anderen beiden Listen. Andere Namen, Schreibweisen, Gültigkeitsbereiche und Einstellungen bleiben erhalten. Insbesondere entfernt das Aktivieren von `rust:pdf` keine `pdf`-Einschränkung. Explizite einfache Namen behalten die bestehenden Übereinstimmungsregeln bei. Systembeschränkungen gelten weiterhin.

```json
{
  "scope": "user",
  "state": "enabled",
  "results": [
    { "skillName": "rust:pdf", "changed": true },
    { "skillName": "go:review", "changed": true }
  ],
  "propagation": "queued"
}
```

Deaktivierte Antworten enthalten auch das normalisierte `mode`. `propagation` beschreibt die Planung, nicht die gemessene Verfügbarkeit: `queued` bedeutet, dass mindestens eine aktive Laufzeitumgebung eine Aktualisierung in die Warteschlange gestellt hat; `deferred` bedeutet, dass gespeicherte Einstellungen auf Arbeiten im Lebenszyklus der Laufzeitumgebung warten; `not_required` bedeutet, dass diese Anfrage nichts geändert hat. Eine No-Op-Aktion schreibt weder Daten noch sendet sie Ereignisse und bestätigt nicht die Abschluss früherer Aktualisierungen. Lesen Sie die Endpunkte für die bestehende Workspace-Konfiguration und den Status der Skill-Laufzeitumgebung, um den effektiven Zustand zu ermitteln.

Erfolgreiche Änderungen invalidieren Konfigurations-Caches und senden reguläre `settings_changed`-Ereignisse mit `scope: "user"`. Aktualisierungen lesen Benutzer- und Workspace-Einstellungen atomar neu; fehlgeschlagene Konfigurations- oder Sitzungsaktualisierungen bewahren ausstehende Arbeiten für die Wiederherstellung des Lebenszyklus und begrenzte Wiederholungsversuche auf. Das bestehende Verhalten nur für Workspace-Aktualisierungen bleibt unverändert.

Ungültige Eingaben geben HTTP 400 zurück (`invalid_skill_names`, `invalid_skill_name`, `invalid_skill_activation_state` oder `invalid_skill_activation_mode`). Eine primäre Laufzeitgeneration, die vor dem Commit geschlossen wurde, gibt HTTP 503 mit `Retry-After: 1` zurück, wie bei Einstellungs-Routen. Das SDK stellt `setUserSkillsActivation(skillNames, activation, { clientId? })` bereit und sendet ein PUT ohne vorheriges Einlesen der Konfiguration.

#### `POST /workspace/init`

Fähigkeitskennung: `workspace_init`. Reine Datei-E/A — kein ACP-Roundtrip, **kein LLM-Aufruf**.

Erstellen eines leeren `QWEN.md` (oder der Workspace-`context.fileName`-Einstellungsoverride) im primären Workspace-Stammverzeichnis des Daemons. Nur mechanisch — für KI-gesteuertes Ausfüllen von Inhalten folgen Sie `POST /session/:id/prompt`.

Standardmäßig wird das Überschreiben verweigert, wenn die Zieldatei existiert und Nicht-Leerzeichen-Inhalte enthält. Dateien, die nur Leerzeichen enthalten, werden als nicht vorhanden behandelt (entspricht dem lokalen `/init`-Slash-Befehl).

Anfrage:

```json
{ "force": false }
```

Antwort (200):

```json
{ "path": "/work/bound/QWEN.md", "action": "created" }
```

`action` ist `'created'` bei neuen Erstellungen, `'noop'`, wenn eine vorhandene Datei mit nur Leerzeichen unangetastet gelassen wurde (kein Schreibvorgang durchgeführt), und `'overwrote'`, wenn `force: true` nicht-leere Inhalte ersetzt hat. Das `workspace_initialized`-SSE-Ereignis spiegelt die Antwortaktion wider — Beobachter können nach `action !== 'noop'` filtern, um nur auf tatsächliche Änderungen auf der Festplatte zu reagieren.

Fehler:

- `400 {code: 'invalid_force_flag'}` — `force` ist nicht boolesch.
- `409 {code: 'workspace_init_conflict', path, existingSize}` — Die Datei existiert mit Nicht-Leerzeichen-Inhalten und `force` fehlt oder ist falsch. Der Textkörper enthält den absoluten Pfad und die Größe (Bytes), damit SDK-Clients eine "N Bytes überschreiben?"-Eingabeaufforderung anzeigen können, ohne die Datei erneut abzufragen.

SSE-Ereignis (Workspace-bezogen): `workspace_initialized` mit `{path, action, originatorClientId?}`.

#### `POST /workspace/mcp/reload`

Laden Sie persistierte MCP-Einstellungen in die Workspace-Discovery-Konfiguration und jede aktive Sitzung neu. Die workspace-qualifizierte Form ist `POST /workspaces/:workspace/mcp/reload`.

Anfragetextkörper:

```json
{ "forceReconnectAll": true }
```

`forceReconnectAll` ist optional und standardmäßig `false`, was inkrementelle Abstimmung bewahrt. Wenn wahr, verbindet der Daemon jeden qualifizierten konfigurierten MCP-Server nach der Einstellungsabstimmung neu. Alternativ übergeben Sie `forceReconnectWhich: ["server-a", "server-b"]`, um nur benannte Server neu zu verbinden. Die Optionen schließen sich gegenseitig aus. Ein erzwungene Neuverbindung führt dazu, dass jeder Transport Zugangsdaten liest, die ein anderer lokaler Qwen Code-Prozess möglicherweise im Token-Speicher geschrieben hat; sie startet keinen OAuth-Autorisierungsfluss.

Die Route gibt `202 { "accepted": true }` zurück; fragen Sie `GET /workspace/mcp` für den endgültigen Verbindungsstatus ab. Ungültige Optionswerte geben 400 zurück.

#### `POST /workspace/mcp/:server/restart`

Fähigkeitskennung: `workspace_mcp_restart`. Bridge → ACP extMethod `qwen/control/workspace/mcp/restart`.

Startet einen konfigurierten MCP-Server über die `McpClientManager.discoverMcpToolsForServer` des ACP-Kindprozesses (Trennen + erneutes Verbinden + erneutes Erkunden). Prüft vorab den Live-Budget-Snapshot aus der Buchhaltung von PR 14 v1, sodass ein Neustart in einem Workspace mit ausgeschöpftem Budget eine weiche Ablehnung zurückgibt, anstatt eine `BudgetExhaustedError`-Kaskade auszulösen.

Der Anfragetextkörper ist leer (`{}`). Der Pfadparameter ist der URL-kodierte Servername, wie er in der `mcpServers`-Konfiguration erscheint.

Antwort (200) — diskriminierte Vereinigung auf `restarted`:

```json
{ "serverName": "docs", "restarted": true, "durationMs": 1234 }
```

```json
{
  "serverName": "docs",
  "restarted": false,
  "skipped": true,
  "reason": "budget_would_exceed"
}
```

Gründe für weiches Überspringen (alle geben 200 zurück):

| `reason` | Bedeutung |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `'in_flight'` | Eine andere Erkennung / ein anderer Neustart für diesen Server ist bereits im Gange. Die Route kehrt sofort zurück, anstatt auf das ursprüngliche Versprechen zu warten. Der Aufrufer sollte nach einer kurzen Verzögerung erneut versuchen. |
| `'disabled'` | Der Server ist konfiguriert, aber in `excludedMcpServers` aufgelistet. Aktivieren Sie ihn vor dem Neustart. |
| `'budget_would_exceed'` | Der Daemon ist `--mcp-budget-mode=enforce`, der Zielserver ist derzeit nicht in `reservedSlots` enthalten und die Live-Gesamtzahl hat `clientBudget` erreicht. Der Aufrufer sollte zuerst einen Platz freigeben. |

Fehler (nicht 2xx):

- `400 {code: 'invalid_server_name'}` — Leerer Pfadparameter.
- `404` — Servername nicht in der `mcpServers`-Konfiguration oder es existiert kein aktiver ACP-Kanal (ein Neustart erfordert inhärent eine aktive `McpClientManager`-Instanz).
- `500` — Interner Fehler (z. B. `ToolRegistry` nicht initialisiert).

SSE-Ereignisse (Workspace-bezogen): `mcp_server_restarted` mit `{serverName, durationMs, originatorClientId?}` bei Erfolg; `mcp_server_restart_refused` mit `{serverName, reason, originatorClientId?}` bei weichem Überspringen.

#### `POST /workspaces/:workspace/language`

Sitzungslose Workspace-UI-Sprachsynchrone, registriert, wenn die Persistenz von Einstellungen verfügbar ist. Zuständigkeit: ausgewählte Laufzeitumgebung. Löst die Workspace-ID oder den kodierten absoluten aktuellen Arbeitspfad auf, erfordert eine aktive vertrauenswürdige Laufzeitumgebung und validiert die Client-Zugehörigkeit gegen diese Laufzeitumgebung. Inaktive Generationen geben `503 workspace_runtime_unavailable` zurück; ungelöste Selektoren fallen niemals auf den primären Workspace zurück.

Anfrage: `{ "language": "zh" }`. Die Sprache verwendet dieselben unterstützten Codes wie `POST /language`. Persistiert nur die `general.language` des ausgewählten Workspaces, liest dann seine effektive zusammengeführte Einstellung und synchronisiert bereits aktive Kanäle über `qwen/control/user/language` mit `scope: "workspace"`. Kalte Kanäle werden übersprungen, ohne einen Prozess zu starten oder ein Gespräch zu erstellen. Ausgabesprache und Modelleinstellungen bleiben unverändert; `syncOutputLanguage: true` wird abgelehnt.

Die Antwort hat dieselbe Struktur wie `POST /language`, mit `outputLanguage: null`; `language` ist die effektiv konfigurierte Locale (einschließlich `auto`) und `refresh` zählt nur die ausgewählte Laufzeitumgebung. Ein Workspace-`language_changed`-Ereignis wird bei Erfolg gesendet. Das SDK stellt `client.workspaceByCwd(cwd).setUiLanguage(language)` über REST bereit, unabhängig vom Sitzungs-Transport.

#### `POST /language`

Fähigkeitskennung: `user_language_sync` (bedingt – wird nur beworben, wenn die Einstellungen-Persistenz verfügbar ist, gleiche Bedingung wie bei `workspace_settings`). Bridge → ACP extMethod `qwen/control/user/language` pro vertrauenswürdiger Laufzeitumgebung mit einem aktiven Kanal.

Sitzungslose **Benutzer-Ebenen**-Sprachsynchro­nisierung (Issue #10234), für Hosts, die die Sprache wechseln müssen, bevor eine Sitzung existiert (z. B. eine Willkommensseite). Eigentums-Klassifizierung: Prozess-global – sie verändert nur den benutzer-globalen Zustand (`~/.qwen/settings.json`, das globale `~/.qwen/output-language.md`) plus best-effort Aktualisierung der Laufzeitumgebung, daher benötigt sie weder einen Workspace-Selektor noch eine Sitzungs-ID. Registriert hinter dem nicht-strikten `mutate()`-Gate, passend zur Geschwister-Methode `POST /session/:id/language`.

Der Daemon-Prozess ist der einzige Schreiber: Er persistiert `general.language` (und, wenn `syncOutputLanguage` wahr ist, `general.outputLanguage` sowie das globale `output-language.md`), bevor er die Verteilung auslöst. Jede vertrauenswürdige Laufzeitumgebung wechselt dann ihre eigene Prozess-UI-Sprache und lädt die Einstellungen im Benutzerbereich von der Festplatte neu; wenn `syncOutputLanguage` wahr ist, aktualisiert sie auch die Systemanweisung jeder lokalen Sitzung. Unterschiede zum sitzungsbegrenzten Pfad:

- Projektgebundene Ausgabesprachen-Dateien werden NICHT umgeschrieben – eine Sitzung, deren Workspace eine eigene `.qwen/output-language.md` hat, behält diese Überschreibung bei (Projektbereich gewinnt beim Neuladen).
- Null Sitzungen und null aktive Laufzeitkanäle sind ein **Erfolg**, kein Fehler; eine Laufzeitumgebung ohne aktiven Kanal wird übersprungen (nicht als fehlgeschlagen markiert) und liest die persistierten Dateien, wenn ihr Kanal als Nächstes gestartet wird.
- Nicht vertrauenswürdige Workspace-Laufzeitumgebungen werden übersprungen, passend zur `403 untrusted_workspace`-Haltung des Sitzungs-Pfads.

Anfrage:

```json
{ "language": "zh", "syncOutputLanguage": true }
```

`language` muss einer der in `/capabilities` `supportedLanguages` aufgelisteten Codes sein (plus `'auto'`); `syncOutputLanguage` standardmäßig auf `false` gesetzt.

Antwort (200):

```json
{
  "language": "zh",
  "outputLanguage": "Chinese",
  "refresh": { "runtimes": 1, "sessions": 2, "failed": 0 }
}
```

`language` ist die vom Daemon aufgelöste UI-Locale, sodass eine `'auto'`-Anfrage eine konkrete Sprache zurückgeben kann; Hosts sollten die persistierte `general.language`-Einstellung für den Selektor-Zustand lesen. `outputLanguage` ist `null`, wenn `syncOutputLanguage` falsch war. `refresh.runtimes` zählt die Laufzeitumgebungen, die den Wechsel über einen aktiven Kanal angewendet haben; `refresh.sessions` summiert die Aktualisierungen der Systemanweisungen pro Sitzung; `refresh.failed` aggregiert die Aktualisierungsfehler pro Sitzung und fehlgeschlagene Laufzeitumgebungen (die Verteilung erfolgt best-effort und lässt die Anfrage nach erfolgreicher Persistenz niemals fehlschlagen).

Fehler:

- `400 {code: 'invalid_language', allowed: [...]}` – unbekannter Sprachcode.
- `400 {code: 'invalid_sync_flag'}` – `syncOutputLanguage` ist nicht boolesch.
- `400 {code: 'invalid_client_id'}` – `X-Qwen-Client-Id` ist kein Client, der irgendeiner Laufzeitumgebung bekannt ist (Header ist optional; weglassen, wenn keine Sitzung existiert).
- `500 {code: 'persist_error'}` – Schreiben der Benutzer-Einstellungen oder der Ausgabesprachen-Datei fehlgeschlagen; der fehlgeschlagene Schritt und alles danach wurden nicht ausgeführt (früher angewendete Schritte, wie das Schreiben von `general.language`, werden nicht zurückgerollt).
- `404` – Daemon stammt aus einer Zeit vor dieser Route oder wurde ohne Einstellungen-Persistenz erstellt (prüfen Sie die Fähigkeitskennung).

SSE-Ereignis (workspace-begrenzt, auf den Sitzungs-Buses jeder Laufzeitumgebung): `language_changed` mit `{language, outputLanguage, userLevel: true, originatorClientId?}`. Der `userLevel: true`-Marker unterscheidet diese Verteilung vom Ereignis pro Sitzung des Sitzungs-Pfads, der stattdessen `sessionId` trägt.

### `GET /session/:id/events` (SSE)

Abonnieren des Ereignisstroms der Sitzung.

Header:

```
Accept: text/event-stream
Last-Event-ID: 42        ← optional, replays from after id 42
X-Qwen-Event-Epoch: ...  ← optional, pairs the cursor with its bus epoch
X-Qwen-Client-Id: ...    ← optional client identity and diagnostic correlation
```

Query-Parameter:

| Parameter | Erforderlich | Hinweise |
| ------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `maxQueued` | nein | Obergrenze für den **aktiven Frame-Rückstau** pro Abonnent. Bereich `[16, 2048]`, Standard 256. Replay-Frames, die beim Abonnieren erzwungen eingefügt werden, sind von der Frame- und Byte-Obergrenze ausgenommen; was sie tatsächlich verbraucht, sind Live-Ereignisse, die eintreffen, während der Abonnent noch ein großes `Last-Event-ID: 0`-Replay abarbeitet. Erhöhen Sie den Wert für kalte Reconnects, damit der Live-Schwanz nicht die Warnung / Vertreibung langsamer Clients auslöst, bevor der Consumer aufgeholt hat. Die Obergrenze für serialisierte Live-Bytes ist daemon-seitig festgelegt (Standard 2 MiB) und hat keinen Query-Parameter. Werte außerhalb des Bereichs / nicht dezimal / vorhanden aber leer geben `400 invalid_max_queued` zurück, bevor der SSE-Handshake geöffnet wird. Pre-flight `caps.features.slow_client_warning` – alte Daemons ignorieren den Parameter stillschweigend. |
| `connectReason` | nein | Vom Client gemeldeter diagnostischer Hinweis: `initial`, `resume`, `prompt_restart`, `stream_end`, `transport_error`, `state_resync` oder `unknown`. Ungültige Werte normalisieren sich auf `unknown` und lehnen den Handshake niemals ab. Der Daemon verwendet dieses Feld nicht für Authentifizierung, Replay, Vertreibung, Deduplizierung oder Stream-Ersetzung. |
| `previousStreamId` | nein | UUID des vorherigen akzeptierten REST/SSE-Streams, wie vom Client berichtet. Ungültige Werte werden ignoriert. Dies ist nur eine best-effort Linienführung und ändert niemals das Stream-Verhalten. |

Ein erfolgreicher Handshake enthält `X-Qwen-SSE-Stream-Id: <uuid>`. Browser-Gateways müssen diesen Antwort-Header beibehalten und ihn über `Access-Control-Expose-Headers` offenlegen. Alte Daemons oder Zwischenstationen können ihn weglassen; Clients müssen normal fortfahren und die Linienführung als nicht verfügbar behandeln. Die ID identifiziert diese physische REST/SSE-Verbindung und korreliert ihre Daemon-Lebenszyklus-, Queue-Diagnose- und Anfrage-Trace-Daten.

Frame-Format. Die `data:`-Zeile ist der **vollständige Ereignis-Umschlag**, JSON-stringifiziert auf einer einzelnen Zeile – `{id?, v, type, data, originatorClientId?}`. Die ACP-spezifische Nutzlast (`sessionUpdate`, `requestPermission` Argumente usw.) befindet sich unter dem `data`-Feld des Umschlags; das eigene `type` des Umschlags entspricht der SSE `event:`-Zeile.

```
id: 7
event: session_update
data: {"id":7,"v":1,"type":"session_update","data":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"…"}}}

id: 8
event: permission_request
data: {"id":8,"v":1,"type":"permission_request","data":{"requestId":"<uuid>","sessionId":"<sid>","toolCall":{...},"options":[...]}}

: heartbeat              ← every 15s, no payload

event: client_evicted    ← terminal frame, no id (synthetic)
data: {"v":1,"type":"client_evicted","data":{"reason":"queue_overflow","droppedAfter":42,"queueSize":256,"maxQueued":256,"queuedBytes":1800000,"maxQueuedBytes":2097152}}

event: client_evicted    ← terminal frame for byte overflow, no id (synthetic)
data: {"v":1,"type":"client_evicted","data":{"reason":"queue_bytes_overflow","droppedAfter":43,"queueSize":1,"maxQueued":256,"queuedBytes":1900000,"maxQueuedBytes":2097152,"eventBytes":300000}}
```

Die SSE-Ebene `id:` / `event:`-Zeilen duplizieren `envelope.id` / `envelope.type` für EventSource-Kompatibilität. Raw-`fetch`-Consumer (das `parseSseStream` des SDKs) lesen alles aus dem JSON-Umschlag und ignorieren die SSE-Präambel-Zeilen.

| Ereignistyp | Auslöser |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `session_update` | Jede ACP `sessionUpdate`-Benachrichtigung (LLM-Chunks, Tool-Aufrufe, Nutzung) |
| `permission_request` | Agent bat um Tool-Genehmigung |
| `permission_resolved` | Ein Client stimmte über `POST /permission/:requestId` zu einer Berechtigung ab |
| `permission_partial_vote` | (nur Konsens) Eine Stimme wurde aufgezeichnet, aber Quorum noch nicht erreicht. Trägt `{requestId, sessionId, votesReceived, votesNeeded, quorum, optionTallies}`. Pre-flight `caps.features.permission_mediation`. |
| `permission_forbidden` | Eine Stimme wurde durch die aktive Richtlinie abgelehnt (`designated`-Übereinstimmung, `local-only` Nicht-Loopback oder `consensus` Wähler nicht im Snapshot). Trägt `{requestId, sessionId, clientId?, reason}`. Pre-flight `caps.features.permission_mediation`. |
| `model_switched` | `POST /session/:id/model` erfolgreich |
| `model_switch_failed` | `POST /session/:id/model` abgelehnt |
| `session_died` | Agent-Kind-Prozess unerwartet abgestürzt. **Terminal: SSE-Stream schließt nach diesem Frame; die Sitzung ist aus `byId` verschwunden.** Abonnenten sollten sich über `POST /session` neu verbinden, um eine neue zu starten. |
| `slow_client_warning` | Abonnentenlokal: Live-Frame-Rückstau oder live serialisierter Byte-Rückstau ≥ 75 % voll. **Nicht-terminal** — der Stream wird fortgesetzt; die Warnung ist eine Vorwarnung vor der Verdrängung. Trägt `{queueSize, maxQueued, lastEventId, queuedBytes?, maxQueuedBytes?, threshold?}`, wenn `threshold` gleich `frames`, `bytes` oder `frames_and_bytes` ist. Wird EINMAL pro Überlauf-Episode ausgelöst; reaktiviert sich, nachdem beide Messwerte unter 37,5 % fallen. Kein `id` (synthetisch). Vorabprüfung `caps.features.slow_client_warning`. |
| `client_evicted` | Abonnentenlokal: Queue-Überlauf. `reason` ist `queue_overflow` für das Live-Frame-Limit und `queue_bytes_overflow` für das Limit für live serialisierte Bytes. **Terminal: Der SSE-Stream schließt nach diesem Frame** (kein `id` — synthetisch). Andere Abonnenten in derselben Sitzung fahren fort. |
| `stream_error` | Daemon-seitiger Fehler während des Fan-Outs. **Terminal: Der SSE-Stream schließt nach diesem Frame** (kein `id` — synthetisch). |

Reconnect-Semantik:

- Senden Sie `Last-Event-ID: <n>`, um Ereignisse mit `id > n` aus dem sitzungsspezifischen Ring (Standardtiefe **8000**, konfigurierbar über `qwen serve --event-ring-size <n>`) erneut abzuspielen.
- **Lücken-Erkennung:** Innerhalb derselben Epoche, wenn die erste behaltene Ring-ID größer als `<n> + 1` ist, sendet der Daemon einen idlosen `state_resync_required`-Frame mit `reason: 'ring_evicted'`, bevor er die überlebende Suffix-Sequenz erneut abspielt. Die anderen Gründe sind `epoch_reset`, `seeded_replay_not_in_ring` und `replay_budget_exceeded`; das Budgetsignal folgt dem gelieferten Replay-Präfix. Siehe [Resync-Gründe und Reihenfolge](./daemon/09-event-schema.md#resync-reasons-and-ordering) für ihre Auslöser, Cursor-Felder und Wiederherstellungsregeln.
- Das SDK verriegelt `awaitingResync`; Clients sollten `POST /session/:id/load` aufrufen und aus dem aktuellen begrenzten Replay-Snapshot-Fenster neu aufbauen. Dieser Snapshot kann selbst mit `history_truncated` beginnen, wenn ältere In-Memory-Replay-Einträge verworfen wurden; dieser Marker ist informativ und darf keinen weiteren Resync-Durchlauf starten. Sein optionaler Paginierungs-Anker ist [bei Replay-Fenster-Verdrängung eingefroren](./daemon/09-event-schema.md#history-truncation-anchor).
- IDs sind innerhalb der Event-Bus-Epoche einer Sitzung monoton, beginnend bei 1. Eine abgelehnte Veröffentlichung darf keine ID verbrauchen; siehe [Event-Sequenz-Invarianten](./daemon/09-event-schema.md#state-and-forward-compatibility).
- Synthetische Frames (`client_evicted`, `slow_client_warning`, `stream_error`, `state_resync_required`, `replay_complete`) lassen `id` absichtlich weg, damit sie keinen Sequenzplatz für andere Abonnenten verbrauchen. `replay_complete` markiert das Ende des Replays, einschließlich leerer oder unvollständiger Replays; es bedeutet nicht, dass der Resync abgeschlossen ist.

Backpressure:

- Die Queue pro Abonnent umfasst standardmäßig `maxQueued: 256` Live-Elemente plus ein daemon-eigenes Limit von 2 MiB für live serialisierte Bytes. Replay-Frames während des Reconnects, `slow_client_warning` und `client_evicted` umgehen beide Limits.
- Überschreiben Sie nur das Frame-Limit über `?maxQueued=N` (Bereich `[16, 2048]`) in der SSE-Anfrage. Es gibt bewusst kein `?maxQueuedBytes`; Clients können das Speicherbudget des Daemons nicht erhöhen.
- Wenn der Live-Frame-Rückstau oder der Live-Byte-Rückstau eines Abonnenten 75 % Füllung überschreitet, erzwingt der Bus einen `slow_client_warning`-synthetischen Frame an diesen Abonnenten (einmal pro Überlauf-Episode; reaktiviert, nachdem beide Messwerte unter 37,5 % fallen). Der Stream bleibt offen — die Warnung ist eine Vorwarnung, damit der Client schneller leeren oder sauber trennen + reconnecten kann.
- Wenn das Live-Frame-Limit überläuft, sendet der Bus `client_evicted` mit `reason: "queue_overflow"`. Eine leere Live-Queue lässt ein übergroßes Ereignis unverändert zu. Bevor ein Byte-Überlauf in einer nicht-leeren Queue abgelehnt wird, kann der Bus den gesamten `rawOutput.html` einer MCP App durch `''` ersetzen, wenn deren `fallbackText` nicht leer ist. Wenn diese Kopie passt, fährt die Zustellung ohne Verdrängung oder Resync-Signal fort. Andernfalls sendet er `reason: "queue_bytes_overflow"`. Bei jeder Verdrängung wird der terminale Frame erzwungen zugestellt und das Abonnement geschlossen.
- Diese optionale App-Degradation betrifft nur die Queue-Zustellung. Direkte Zustellung und der Replay-Ring behalten das Original bei; das kompakte Replay-Fenster wendet sein eigenes Budget an. Die degradierte Kopie trägt dieselbe Event-ID wie der ursprüngliche Ring-Eintrag. Daher muss eine gelieferte Nutzlast mit ID nicht der Nutzlast des Rings entsprechen, und das Fortsetzen nach dieser ID stellt ihr HTML nicht wieder her. Clients, die das Dokument benötigen, müssen das persistierte Transkript explizit neu seitenweise abrufen, was ebenfalls Seitenlimiten unterliegt.

### `POST /session/:id/permission/:requestId`

Geben Sie dieselbe Stimme ab, die unten dokumentiert ist, aber leiten Sie sie über die Runtime weiter, die die benannte aktive Sitzung besitzt. Neue Multi-Workspace-Integrationen sollten diese Form anstelle der Legacy-prozessglobalen Route verwenden. Pre-flight `caps.features.session_permission_vote`.

Der Anfragekörper, Vermittlungsrichtlinien, Ergebnisse und die Erfolgsantwort sind identisch mit `POST /permission/:requestId`. Der optionale `X-Qwen-Client-Id`-Header nimmt an designated und consensus policy teil. Fehler verwenden stabile `code`-Werte, wo angemerkt; fehlerhafte Eingabe und ein verlorenes Pending-Request-Race können `code` weglassen:

- `400` — ein fehlerhafter Stimmkörper (kein `code`) oder eine ungültige Client-Identität (`invalid_client_id`), oder `invalid_option_id`, wenn die ausgewählte Option nicht angeboten wurde. Lesen Sie die angebotenen Optionen erneut, statt dieselbe Stimme zu wiederholen.
- `403` — `permission_forbidden`, wenn die aktive Richtlinie den Wähler ablehnt, oder `untrusted_workspace`, wenn ein nicht primärer Besitzer-Arbeitsbereich nicht vertrauenswürdig ist. Ein nicht vertrauenswürdiger primärer Besitzer ist von dieser Vertrauensprüfung ausgenommen und die Stimme kann akzeptiert werden.
- `404` — `session_not_found`, wenn kein aktiver Besitzer existiert, oder `code`, wenn die Anfrage nicht ausstehend ist.
- `500` — `cancel_sentinel_collision`, wenn der `allowedOptionIds` des Agenten das reservierte `__cancelled__`-Sentinel enthält, oder `ambiguous_session_owner`, wenn mehr als ein Arbeitsbereich die Sitzung beansprucht.
- `501` — `permission_policy_not_implemented` für eine Richtlinie, die dieser Build nicht implementiert.
- `503` — `workspace_runtime_unavailable`, wenn die besitzende Laufzeitumgebung nicht verfügbar ist, oder `daemon_draining`, wenn der Daemon keine Arbeit mehr annimmt.

Es wird nie gegen die primäre Brücke erneut versucht. Die TypeScript SDK-Methode ist `respondToSessionPermission()`.

### `POST /permission/:requestId`

Stimmen Sie über ein ausstehendes `permission_request` ab. Die aktive **Vermittlungsrichtlinie** entscheidet, wer gewinnt:

| Richtlinie | Verhalten |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `first-responder` (Standard) | Jeder validierte Wähler gewinnt; spätere Wähler erhalten `404`. Pre-F3-Baseline. |
| `designated` | Nur der Prompt-Ursprung (`originatorClientId`) entscheidet; Nicht-Ursprünge erhalten `403 permission_forbidden / designated_mismatch`. Fällt für anonyme Prompts auf first-responder zurück. |
| `consensus` | N-von-M-Wähler müssen zustimmen (Standardwert `N = floor(M/2) + 1`, Überschreibung über `policy.consensusQuorum` möglich). Die erste Option, die `N` erreicht, gewinnt. Nicht auflösende Abstimmungen erhalten `200` + `permission_partial_vote` SSE-Frames. |
| `local-only` | Nur Loopback-Wähler entscheiden; Remote-Aufrufer erhalten `403 permission_forbidden / remote_not_allowed`. |

Die aktive Richtlinie wird in `settings.json` unter `policy.permissionStrategy` konfiguriert und auf `/capabilities` bei `body.policy.permission` angezeigt. Führen Sie eine Vorabprüfung von `caps.features.permission_mediation` durch (mit `modes: [...]`) für die vom Build unterstützte Menge.

> **F3 (#4175): Multi-Client-Berechtigungs-Koordination.** F3 fügte die vier oben genannten Richtlinien hinzu. Daemonen vor F3 hatten First-Responder hartcodiert; das Wire-Format bleibt bitgenau unverändert, wenn die konfigurierte Richtlinie `first-responder` ist. Neue Ereignisse (`permission_partial_vote`, `permission_forbidden`) sind additiv – alte SDKs sehen sie als `unrecognized_known_event` und ignorieren sie problemlos.

> **Berechtigungstimeout (standardmäßig deaktiviert).** Ein `permission_request` bleibt so lange ausstehend, bis: (a) hier ein Client abstimmt, (b) `POST /session/:id/cancel` ausgelöst wird, (c) der HTTP-Client, der die Eingabeaufforderung steuert, die Verbindung trennt (Abbruch mitten in der Eingabeaufforderung löst ausstehende Berechtigungen als `cancelled` auf), (d) die Sitzung beendet wird, (e) der Daemon herunterfährt, **oder (f) sein konfigurierter Timeout ausgelöst wird**. Bei Auslösung des Timeouts wird der `requestPermission` des Agenten als `{outcome: 'cancelled'}` aufgelöst, der Audit-Ring zeichnet einen `permission.timeout`-Eintrag auf, der Daemon-stderr gibt eine einzeilige Breadcrumb-Nachricht aus, und der SSE-Bus verteilt den standardmäßigen `permission_resolved`-Abbruchrahmen, damit sich Abonnenten bereinigen können. Der gemeinsame Timeout ist über `BridgeOptions.permissionResponseTimeoutMs` oder `qwen serve --permission-response-timeout-ms` konfigurierbar. Sein Standardwert ist `0`, sodass sowohl gewöhnliche Berechtigungen als auch `ask_user_question` unbegrenzt auf eine menschliche Entscheidung warten. Abbruch durch Wähler, Sitzungsabbruch, Bereinigung bei Verbindungsabbruch und Herunterfahren des Daemons lösen ausstehende Interaktionen weiterhin als abgebrochen auf.

Anfrage:

```json
{
  "outcome": {
    "outcome": "selected",
    "optionId": "proceed_once"
  }
}
```

Ergebnisse:

- `{ "outcome": "selected", "optionId": "<one-of-the-options>" }` — Akzeptieren / Ablehnen / Einmal fortsetzen usw., gemäß den angebotenen Optionen des Agenten
- `{ "outcome": "cancelled" }` — Anfrage verwerfen (entspricht dem internen Verhalten von `cancelSession` / `shutdown`)

Antwort:

- `200 {}` — Ihre Stimme wurde akzeptiert (aufgelöst ODER aufgezeichnet unter Konsensquorum)
- `400` — ein fehlerhafter Abstimmungskörper (kein `code`), `invalid_client_id` oder `invalid_option_id`, wenn die ausgewählte Option nicht angeboten wurde; lesen Sie stattdessen die angebotenen Optionen erneut, anstatt dieselbe Abstimmung zu wiederholen
- `403 { "code": "permission_forbidden", "reason": "designated_mismatch" | "remote_not_allowed", "requestId", "sessionId" }` — F3: Die aktive Richtlinie hat Ihre Stimme abgelehnt
- `404 { "error": "..." }` — die requestId ist unbekannt (bereits aufgelöst, existierte nie oder Sitzung wurde abgebaut)
- `500 { "code": "cancel_sentinel_collision", ... }` — F3: Das `allowedOptionIds` des Agenten enthält das reservierte Sentinel `'__cancelled__'`; Vertragsverletzung zwischen Agent/Daemon
- `501 { "code": "permission_policy_not_implemented", "policy": "<name>" }` — F3 Vorwärtskompatibilität: Ein Richtlinien-Literal landete im Schema, aber sein Mediator-Zweig ist noch nicht gebaut (derzeit unerreichbar; reserviert für zukünftige Richtlinien)

Nach einer erfolgreichen Abstimmung sehen alle verbundenen Clients `permission_resolved` mit derselben `requestId` und der gewählten `outcome`. Unter `consensus` verteilen Zwischenstimmen zusätzlich `permission_partial_vote`, bis das Quorum erreicht ist.

### Auth-Gerätefluss-Routen (Issue #4175 PR 21)

Der Daemon vermittelt einen OAuth 2.0 Device Authorization Grant (RFC 8628), sodass ein entferntes SDK-Client einen Login auslösen kann, dessen Tokens auf dem Dateisystem des **Daemons** landen – nicht beim Client. Der Daemon pollt selbst beim IdP; die einzige Aufgabe des Clients besteht darin, die Verifizierungs-URL + Benutzercode anzuzeigen und (optional) SSE-Ereignisse zum Abschluss zu abonnieren.

Fähigkeitskennzeichnung: `auth_device_flow` (immer beworben). Unterstützte Anbieter in v1: `qwen-oauth`.

> [!note]
>
> Das kostenlose Qwen-OAuth-Kontingent wurde am 2026-04-15 eingestellt. Behandeln Sie `qwen-oauth` als Legacy-v1-Anbieterkennung in diesem Protokoll; neue Clients sollten einen derzeit unterstützten Authentifizierungsanbieter bevorzugen, wenn einer verfügbar ist.

**Runtime-Lokalität.** Der Daemon startet niemals einen Browser – auch wenn er könnte. Der Client entscheidet, ob er `open(verificationUri)` lokal aufruft; auf einem Headless-Pod (die kanonische Mode-B-Bereitstellung) öffnet der Benutzer die URL auf dem Gerät, auf dem er einen Browser hat. Siehe `docs/users/qwen-serve.md` für die empfohlene UX.

**Kein Token-Leakage in Ereignissen.** `auth_device_flow_started` trägt nur `{deviceFlowId, providerId, expiresAt}`. Der Benutzercode und die Verifizierungs-URL werden punkt-zu-punkt im POST-201-Body und über `GET /workspace/auth/device-flow/:id` zurückgegeben; sie werden niemals über SSE broadcastet.

**Singleton pro Anbieter.** Eine zweite `POST` für denselben Anbieter, während ein Fluss aussteht, ist eine idempotente Übernahme – sie gibt den bestehenden Eintrag mit `attached: true` zurück, anstatt eine neue IdP-Anfrage zu starten.

#### `POST /workspace/auth/device-flow`

Strenge Mutations-Gate: tokenlose vertrauenswürdige Loopback-Hauptanfragen passieren. Eine tokenlose Hauptanfrage, die das Gate ohne vertrauenswürdige Loopback-Autorität erreicht, erhält `401 token_required`; fehlende oder ungültige konfigurierte Anmeldedaten und ungepaarte Local-Control-Anmeldedaten werden früher mit einfachem `401 Unauthorized` abgelehnt.

Anfrage:

```json
{ "providerId": "qwen-oauth" }
```

Antwort (`201` neuer Start, `200` idempotente Übernahme):

```json
{
  "deviceFlowId": "fa07c61b-…",
  "providerId": "qwen-oauth",
  "status": "pending",
  "userCode": "USER-1",
  "verificationUri": "https://chat.qwen.ai/api/v1/oauth2/device",
  "verificationUriComplete": "https://chat.qwen.ai/api/v1/oauth2/device?user_code=USER-1",
  "expiresAt": 1700000600000,
  "intervalMs": 5000,
  "attached": false
}
```

Fehler:

- `400 unsupported_provider` — unbekannter `providerId` (Antwort enthält `supportedProviders`)
- `409 too_many_active_flows` — Workspace-Limit (4) erreicht; brechen Sie einen mit `DELETE` ab
- `401 token_required` — striktes Gate lehnte eine tokenlose Hauptanfrage ohne vertrauenswürdige Loopback-Autorität ab
- `502 upstream_error` — IdP gab einen unerwarteten Fehler zurück

#### `GET /workspace/auth/device-flow/:id`

Lesen Sie den aktuellen Zustand. Ausstehende Einträge geben `userCode/verificationUri/expiresAt/intervalMs` zurück; terminale Einträge (5-Minuten-Schonfrist) entfernen diese und zeigen `status` + optional `errorKind/hint` an.

Gibt `404 device_flow_not_found` für unbekannte IDs und nach Ablauf der Schonfrist entfernte Einträge zurück.

#### `DELETE /workspace/auth/device-flow/:id`

Idempotenter Abbruch:

- ausstehender Eintrag → `204` + Emit `auth_device_flow_cancelled`
- terminaler Eintrag → `204` No-op (keine erneute Ereignisausgabe)
- unbekannte ID → `404`

#### `GET /workspace/auth/status`

Snapshot ausstehender Flüsse + unterstützter Anbieter:

```json
{
  "v": 1,
  "workspaceCwd": "/work/bound",
  "providers": [],
  "pendingDeviceFlows": [
    {
      "deviceFlowId": "fa07c61b-…",
      "providerId": "qwen-oauth",
      "expiresAt": 1700000600000
    }
  ],
  "supportedDeviceFlowProviders": ["qwen-oauth"]
}
```

#### Device-Flow-SSE-Ereignisse

Fünf typisierte Ereignisse (workspace-scoped, verteilt an jeden aktiven Session-Bus):

- `auth_device_flow_started` `{deviceFlowId, providerId, expiresAt}` — POST erfolgreich; SDK sollte sich abonnieren (kein userCode hier, bei Bedarf über GET abrufen)
- `auth_device_flow_throttled` `{deviceFlowId, intervalMs}` — Daemon hat Upstream-`slow_down` berücksichtigt; Clients, die GET abfragen, sollten ihr Intervall entsprechend anpassen
- `auth_device_flow_authorized` `{deviceFlowId, providerId, expiresAt?, accountAlias?}` — Anmeldedaten gespeichert; `accountAlias` ist ein Nicht-PII-Label (niemals E-Mail/Telefonnummer)
- `auth_device_flow_failed` `{deviceFlowId, errorKind, hint?}` — Endzustand; `errorKind` ist einer von `expired_token | access_denied | invalid_grant | upstream_error | persist_failed`. `persist_failed` ist daemon-intern: Der IdP-Austausch war erfolgreich, aber der Daemon konnte die Anmeldedaten nicht dauerhaft speichern (EACCES / EROFS / ENOSPC). Der Benutzer sollte es erneut versuchen, sobald das zugrunde liegende Diskproblem behoben ist.
- `auth_device_flow_cancelled` `{deviceFlowId}` — DELETE erfolgreich für einen ausstehenden Eintrag

> **Nicht MCP-kompatibel.** Die MCP-Autorisierungsspezifikation (2025-06-18) schreibt OAuth 2.1 + PKCE mit Autorisierungscode und Redirect-Callback vor, was für Headless-Pod-Daemons nicht funktioniert. Die Device-Flow-Oberfläche von Modus B ist daemon-privat – Clients, die auf MCP-konforme Server abzielen, sollten einen anderen Authentifizierungspfad verwenden.

### Hochladen von Anhängen zur Sitzungsanheftung

Funktion: `session_attachment_chunk_upload`. Alle vier untenstehenden Routen sind Mutationen, die vom Runtime der aktiven Sitzung verwaltet werden. Sie verwenden den vorhandenen Bearer-Token und optionale `X-Qwen-Client-Id`-Header. Ein Upload gehört zu seinem erstellenden Sitzungsspeicher und der exakten Client-Identität; eine weggelassene Identität unterscheidet sich von einem benannten Client.

Sei `U = /session/:id/attachment-uploads`:

| Anfrage | Body | Antwort |
| ---------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------- |
| `POST U` | JSON `{ name, mimeType, size }`, maximal 4 KiB | 201 `{ uploadId }` |
| `POST U/:uploadId/chunks?offset=N` | Rohdaten `application/octet-stream`, maximal 512 KiB | 200 `{ offset }`, nächster Byte-Offset |
| `POST U/:uploadId/complete` | Kein Body erforderlich; ein JSON-Body wird geparst und ignoriert | 200 vorhandener Anhang-Referenz `{ type, attachmentId, mimeType, size }` |
| `DELETE U/:uploadId` | Leer | 204 für empfangene, fehlgeschlagene oder fehlende Uploads; 409 während des Abschlusses oder abgeschlossen |

Die maximale Größe eines Anhangs beträgt weiterhin 8 MiB. Metadaten folgen den bestehenden Regeln für Dateinamen/MIME-Typ; leere Bilddateien sind ungültig. Senden Sie sequenzielle 512-KiB-Chunks, wobei der letzte Chunk den exakten Rest enthält. Nur der unmittelbar vorherige Chunk darf mit identischem Offset, Länge und Bytes wiederholt werden. Lücken, Überlappungen, geänderte Wiederholungen oder verfrühter Abschluss führen zu 409; fehlerhafte Eingaben führen zu 400, übergroße Eingaben zu 413 und nicht unterstützte Chunk-Medientypen oder JSON-Zeichensätze zu 415 `invalid_attachment_upload_content_type`. Nicht unterstützte Anfragekodierungen bei Create- und Chunk-Anfragen führen zu 415 `invalid_attachment_upload_encoding`. Unbekannte, abgelaufene oder unterschiedlich besessene Upload-IDs führen zu 404 bei den drei POST-Routen; DELETE führt zu 204 für fehlende Uploads und 409 während oder nach dem Abschluss. Create- und Chunk-Anfragen akzeptieren keine komprimierten Bodies. Die Complete-Route verwendet den globalen JSON-Parser, sodass ein gültiger komprimierter JSON-Body möglicherweise ignoriert wird, während fehlerhaftes JSON vor dem Abschluss abgelehnt wird.

Der Abschluss validiert die Sitzung-/Client-/Runtime-Eigentümerschaft vor und nach der Speicherung. Gleichzeitiger oder wiederholter Abschluss gibt dasselbe Ergebnis zurück ohne weiteren Schreibvorgang. Eine gleichzeitige Kopie der Sitzung gibt vorübergehend `503 attachment_upload_store_busy` mit `retryable: true` zurück; die zwischengespeicherten Bytes bleiben für den Abschluss mit derselben Upload-ID verfügbar, nachdem die Kopie beendet ist. Tatsächliche Speicherfehler bleiben für diese Upload-ID endgültig. Empfangene Uploads verfallen fünf Minuten nach der Erstellung. Erfolgs-/Fehlerquittungen verfallen nach fünf Minuten und sind auf 1024 pro Daemon-Prozess begrenzt. Schließen/Löschen der Sitzung und finale Client-Abmeldung machen unvollständige Uploads ungültig. Nur abgeschlossene Anhänge können gelesen, referenziert oder kopiert werden. Ein DELETE kann einen bereits finalisierenden oder abgeschlossenen Anhang nicht zurückrollen; eine abgeschlossene Datei kann nach einer verlorenen Antwort bestehen bleiben.

Das Zwischenspeichern ist auf 128 MiB und 32 aktive Uploads über alle Runtimes in einem Prozess begrenzt, mit maximal acht aktiven Uploads pro Sitzungsspeicher. Erschöpfung führt zu `429 attachment_upload_capacity_exceeded`; bestehende Ratenlimits für Anfragen gelten ebenfalls. Dies ist eine Grenze für den Zwischenspeicher, nicht der gesamte Prozessspeicher. Temporäre IDs überleben keinen Daemon-Neustart.

Das TypeScript SDK verwendet dieses Protokoll automatisch für Anhänge, die größer als 512 KiB sind, wenn dies beworben wird, mit zwei gleichzeitigen Dateien pro Client und sequenziellen Chunks. Es verwendet authentifizierte REST auch bei ACP-Transporten, cacht gültige Discovery für 60 Sekunden und behält den bestehenden Raw-Endpoint für kleinere Dateien und ältere Daemons bei. Append-/Abschluss-Wiederholungen erfolgen höchstens zweimal nach Netzwerkfehlern, Anfrage-Timeouts oder 502/503/504; Ratenlimit-Wiederholungen beachten `Retry-After` innerhalb einer Fünf-Minuten-Betriebsfrist. Mehrdeutige Erstellungs- und Kapazitätsfehler werden nicht wiederholt. Fehlgeschlagene Uploads erhalten einen unabhängigen Zwei-Sekunden-Cleanup-Versuch. `DaemonAttachmentUploadError` bewahrt die Ursache und `httpStatus`; sein `status` lässt upload-interne 404 aus, damit Verbraucher es nicht mit nicht unterstütztem Legacy-Anhang-Routing verwechseln.

Siehe das [vollständige Design](../design/session-attachment-chunk-upload.md) für Lifecycle- und Kompatibilitätsdetails.

### Neuladen des Modellkatalogs

Die `workspace_model_reload`-Funktion bewirbt `POST /workspaces/:workspace/models/reload`. Diese authentifizierte, vertrauenswürdige, ausgewählte Runtime-Mutation liest Benutzer- und Workspace-Scope-Einstellungen neu, aktualisiert die Overlay-Umgebung der ausgewählten Runtime und wendet die Umgebung in ihrem ACP-Kind an, bevor die Modellanbieterkonfiguration neu aufgebaut wird. Umgebungsänderungen unterstützen Anbieteranmeldedaten und können andere Umgebungsschlüssel enthalten; sie werden weder in der Antwort noch in einem Einstellungsereignis gemeldet. Die Daemon-Prozessumgebung und Workflow-Aktivierung bleiben unverändert. Es gibt `{ "status": "applied" | "deferred" | "failed" }` zurück; `deferred` bedeutet, dass kein aktives ACP-Kind den Katalog angewendet hat. Es ruft keinen Plattformkatalog ab, schreibt keine Einstellungen, wechselt nicht das aktive Konversationsmodell und sendet kein Einstellungsereignis broadcast. Lesen Sie anschließend `/session/:id/context` einer bestehenden Sitzung für ihre aktuell auswählbaren Modelle; vor der Sitzungserstellung lesen Sie die Anbieter des ausgewählten Workspaces. Unbekannte, nicht vertrauenswürdige, entleerende oder geschlossene Runtimes fallen nicht auf primär zurück.

## Streaming-Wire-Format

Ereignisse werden als Standard-EventSource-Frames ausgegeben. Der Daemon schreibt eine `data:`-Zeile pro Frame (das JSON enthält keine eingebetteten Zeilenumbrüche nach `JSON.stringify`); der SDK-Parser unter `packages/sdk-typescript/src/daemon/sse.ts` behandelt sowohl diese als auch die spezifikationszulässige Multi-`data:`-Form auf der Empfangsseite.

## Fehlerframes während des Streamings

Wenn der Bridge-Iterator beim Bedienen eines SSE-Subscribers eine Ausnahme wirft, gibt der Daemon einen terminalen `stream_error`-Frame aus (kein `id`). Die `data:`-Zeile ist der vollständige Umschlag (gleiche Form wie jeder andere SSE-Frame in diesem Dokument); die tatsächliche Fehlermeldung befindet sich unter `envelope.data.error`:

```
event: stream_error
data: {"v":1,"type":"stream_error","data":{"error":"<message>"}}
```

Die Verbindung wird dann geschlossen.

## Umgebungsvariablen

| Variable | Zweck |
| ------------------- | -------------------------------------------------------------- |
| `QWEN_SERVER_TOKEN` | Bearer-Token. Beim Start werden führende/abschließende Leerzeichen entfernt. |

## Quellcode-Layout

| Pfad | Zweck |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `packages/cli/src/commands/serve.ts` | yargs-Befehl + Flag-Schema |
| `packages/cli/src/serve/run-qwen-serve.ts` | Listener-Lebenszyklus + Signalbehandlung |
| `packages/cli/src/serve/server.ts` | Express-App-Zusammenstellung, Middleware-Reihenfolge und verbleibende direkte Routen |
| `packages/cli/src/serve/routes/*.ts` | Fokussierte Express-Routengruppen, einschließlich Sitzungs-, SSE-, Workspace-Authentifizierungs-, Workspace-Status- und Datei-Routen |
| `packages/cli/src/serve/auth.ts` | Bearer + Host-Allowlist + CORS-Ablehnung |
| `packages/cli/src/serve/acp-session-bridge.ts` | CLI-lokale Bridge-Kompatibilitäts-Fassade für Spawn-or-Attach, FIFO pro Sitzung und Berechtigungsregistrierung |
| `packages/acp-bridge/src/status.ts` | Nur-Lese-Daemon-Status-Wire-Typen + `ServeErrorKind` + `BridgeTimeoutError` + `mapDomainErrorToErrorKind` |
| `packages/cli/src/serve/env-snapshot.ts` | Reine Hilfsfunktion, die `/workspace/env`-Nutzlasten aus `process.*`-Zustand erstellt, einschließlich Redaktion von Anmeldedaten |
| `packages/acp-bridge/src/eventBus.ts` | Begrenzte asynchrone Warteschlange + Replay-Ring |
| `packages/sdk-typescript/src/daemon/DaemonClient.ts` | TS-Client |
| `packages/sdk-typescript/src/daemon/sse.ts` | EventSource-Framework-Parser |
| `integration-tests/cli/qwen-serve-routes.test.ts` | 18 Fälle, kein LLM |
| `integration-tests/cli/qwen-serve-streaming.test.ts` | 3 Fälle, echtes `qwen --acp`-Kindprozess backed by the local fake OpenAI server (nur POSIX; wird unter Windows übersprungen) |
