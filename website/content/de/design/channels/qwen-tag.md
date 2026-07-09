# RFC: "qwen tag" — ein persistenter, Multiplayer-fähiger, Channel-resident Agent für qwen-code (DingTalk-first)

**Status:** Draft (v2)
**Datum:** 2026-06-25
**Autor:** (qwen-code)

---

## Changelog (v1 → v2)

Diese Revision schließt alle Open Decisions aus v1 ab (jetzt **Resolved Decisions**, §9) und behebt sieben im Review aufgedeckte Korrektheits- und Konsistenzfehler. Die beiden tragenden Änderungen:

- **OD-1 ist kein Gate mehr – es ist festgeschriebene Architektur.** Phase 0 wird auf dem aktuellen `AcpBridge`-Pfad ausgeliefert; **Phase 1+ migriert das Channel-Hosting in den `qwen serve`-Daemon** (über `DaemonChannelBridge` / einen Daemon-Channel-Runner), um die sitzungsbezogene FIFO-`promptQueue`, den `MultiClientPermissionMediator`, den `eventBus`, `/workspace/memory` und das Rate-Limit wiederzuverwenden. Jeder Abschnitt, der zuvor "OD-1 open / gates everything" lautete, ist nun als entschieden markiert, und die Daemon-Festlegung wird durch §1, §4, §5, §6.1, §6.2, §6.3, §6.4 und §7 propagiert.
- **Der proactive fire-path wurde für den Daemon-Pfad, auf dem er tatsächlich laufen wird, neu gestaltet.** Das `dispatchProactive` aus v1 wurde für `AcpBridge`-Semantiken (Channel-seitige `sessionQueues`) geschrieben. Unter der Daemon-Migration **wirft `DaemonChannelBridge.prompt()` bei Überlappung `Prompt already in flight`** (`DaemonChannelBridge.ts:257-261`), anstatt zu queuen. v2 serialisiert proactive Prompts über `ChannelBase.sessionQueues` für **beide** Varianten, sodass der Throw-Guard niemals ausgelöst wird, und stellt das Never-Cancellable-Invariant explizit klar (§6.2).

Eingearbeitete Resolutions und Fixes:

- **OD-2** entschieden: ein Prozess pro Workspace/Channel.
- **OD-3** entschieden: Phase 1 `first-responder` + einzelne Channel-Ebene `clientId`; Phase 2 `consensus`/`designated` nach Existenz eines `senderId→clientId`-Rosters + Lifecycle; Auto-Deny für Hochrisiko-Tools bei Proactive-Turns.
- **OD-4** entschieden: In einer geteilten (Thread-)Gruppe erfordert `/clear` ein explizites `confirm` und ist auf `config.allowedUsers` beschränkt, wenn diese Liste gesetzt ist; `/status` ist read-only. (Ein mit Bindestrich versehenes `/clear-channel` ist von der Slash-Grammatik nicht parsbar; ein echtes Owner-Gate pro Mitglied wartet auf das Identitätsmodell – OD-3/OD-11.)
- **OD-5** entschieden: Fix für das veraltete `types.ts:42` JSDoc auf `'steer'`; das Tag-Gruppenprofil setzt `dispatchMode: 'followup'` explizit.
- **OD-6** entschieden: Pro-Turn `[senderName]`-Präfix, **nicht** gegated durch `instructedSessions`; **ein neues optionales `Envelope`-Feld `alreadyPrefixed`**, damit der synthetische Re-Entry im `collect`-Modus das erneute Präfixieren überspringt. (Korrigiert die v1-Behauptung "no new envelope field" – Fix #2.)
- **OD-7** gelöst unter Verwendung verifizierter DingTalk-API-Fakten (§6.2/§6.5), Low-Confidence-Items weiterhin gekennzeichnet.
- **OD-8** entschieden: Der Gateway/Daemon-Scheduler ist der **einzige** Cron-Owner; eine Tag-Session startet **nicht** ihren In-Session-`Session`-Cron; die beiden Cron-Stores leben auf disjunkten Pfaden, sodass eine Kollision nur möglich ist, wenn beide Scheduler für dieselben Jobs laufen.
- **OD-9** entschieden: Pro-Prozess "org"-Rollup + Pro-Channel-Windows, Strictest-Wins, festes tägliches Window; v1 schätzt Token Channel-seitig und liest den Daemon-Usage-Pfad, sobald es Daemon-gehostet ist.
- **OD-10** entschieden: Hinzufügen eines `channel`-Scopes (+`channelKey`) zu `writeContextFile.ts`; Channel-Base erhält Write/Read über einen **CLI-Layer-Callback, der über `ChannelBaseOptions` injiziert wird** (keine `channel-base → core`-Abhängigkeit); benutzer-globaler Pfad `~/.qwen/channels/memory/`.
- **OD-11** entschieden: `senderName` nur advisory; `clientId` der einzige Security-Principal; In-Memory-Audit-Ring + eine Append-Only-`~/.qwen`-Follow-up-Datei.
- **OD-12** entschieden: `--require-auth` + Token für jedes Non-Loopback-Daemon-gestützte Deployment erforderlich.

Korrektheits-Fixes über die OD-Resolutions hinaus:

- **Fix #1 – Proactive-Fire-Path-Concurrency** neu gestaltet für den Daemon-Pfad (§6.2), wobei das Never-Cancellable-Invariant sowohl für die Phase-0-`AcpBridge`-Variante als auch für die Phase-1+-Daemon-Variante durchgesetzt wird.
- **Fix #2 – Interner Widerspruch** entfernt: §6.1/G2 behauptet nicht mehr "no new envelope field"; es erkennt das eine `alreadyPrefixed`-Feld an.
- **Fix #3 – Memory-Wiring designed** (§6.3): die genaue `ChannelBaseOptions`-Änderung (`readChannelMemory`/`writeChannelMemory`-Callbacks) und wer sie in `start.ts` konstruiert/injiziert, wobei der einmal-pro-Session-Bootstrap-Read das `instructedSessions`-Gate wiederverwendet.
- **Fix #4 – `canColdSend`-Capability-Flag designed** (§6.2): wo es deklariert wird, wie DingTalk/Feishu es setzen und wie der Scheduler fails loud.
- **Fix #5 – OD-8-Disjoint-Store-Klarstellung** (§6.2): der Gateway-Store und der `Session`-Store sind unterschiedliche Pfade; das einzige Kollisionsrisiko ist eine Tag-Session, die auch In-Session-Cron ausführt – geschlossen durch das OD-8-Gate.
- **Fix #6 – Estimated-Budget-Enforcement** (§6.4): eine Schätzung darf WARNEN/alarmieren, aber darf niemals einen User-Prompt hart ablehnen; HARD-Decline nur bei echten Daemon-Usage-Zahlen.
- **Fix #7 – Audit-Attribution unter `followup`** (§6.4): `senderId` _mit_ dem gequeueten Prompt führen, sodass ein Tool-Call/eine Permission dem tatsächlich ausgeführten Turn zugeordnet wird, nicht dem zuletzt gequeueten Sender.

Die verifizierten Ground-Truth-Fakten aus v1 (AcpBridge-Topologie, AcpBridge-Auto-Approve, abstraktes `sendMessage`, Scopes, Parser-Defaults) bleiben unverändert erhalten.

---

## 1. Zusammenfassung

**"qwen tag"** ist ein gemeinsamer qwen-code-Agent, der in einem Chat-Channel lebt – primär eine DingTalk-Gruppe, sekundär Feishu – und der von jedem Mitglied dieses Channels durch `@`-Erwähnung herbeigerufen wird. Einmal herbeigerufen, führt es die vollständige qwen-code-Agent-Loop (Tools, Datei-Edits, Shell, MCP) gegen einen gebundenen Workspace aus, streamt seine Arbeit fortlaufend zurück in den Channel, **merkt sich den Channel über Turns und Neustarts hinweg** und kann **proaktiv oder nach Zeitplan** handeln, ohne darauf zu warten, gefragt zu werden. Dies spiegelt den Claude-Tag-Formfaktor wider – ein einzelner persistenter Multiplayer-Agent, der _resident_ des Raums ist, anstatt ein 1:1-DM-Bot zu sein – aber er ist vollständig auf dem bestehenden Channel-Adapter-Stack von qwen-code (`qwen channel start`, `packages/channels/*`) und dem `qwen serve`-Daemon aufgebaut, nicht auf einem neuen Hosted Service.

Das bewusste Framing dieses RFCs ist, dass **die reaktive Hälfte des Formfaktors größtenteils bereits ausgeliefert ist, die proaktive/Memory-Hälfte jedoch nicht.** Die Teile, die einen Claude-Tag-artigen _Reply_-Agenten schwierig machen – ein langlaufender Prozess, der Sessions multiplext, ein Agent-Transport, der das One-Prompt-per-Session-Invariant bewahrt, Multiplayer-Session-Routing, Channel-bezogene Zugriffskontrolle, Streaming-Card-Rendering und durable Session-Persistenz – existieren bereits und werden von den aktuellen Channel-Adaptern genutzt. Was _fehlt_, ist ein klar abgegrenztes Set an Capabilities, das einen reaktiven Reply-Bot in einen Resident-Agenten verwandelt: Sender-Attribution in geteilten Sessions, ein proaktiver/geplanter Output-Pfad, Room-bezogenes Memory und Multiplayer-Governance. Dieses RFC fasst diese Lücke in **vier Build Areas** zusammen und spezifiziert sie über Phase 0–2.

> Hinweis zu "80%": Frühere Entwürfe formulierten dies als "~80% ausgeliefert". Diese Zahl ist nicht verifizierbar und überzeichnet den Sachverhalt – die gesamte Proactive-Engine (Build Area 2) und das Room-bezogene Memory (Build Area 3) sind komplett neu, und speziell bei DingTalk gibt es _überhaupt keinen_ Outbound-Initiate-Pfad. Wir formulieren es stattdessen als "der reaktive Pfad ist gebaut; die proaktiven und Memory-Pfade sind es nicht".

### Ein Topologie-Faktum, das das gesamte RFC einschränkt

Es gibt **zwei unterschiedliche Arten, wie ein Channel-Adapter mit einem qwen-Agenten verbunden ist**, in **zwei verschiedenen Prozessen**, und sie zu vermischen ist der häufigste Fehler in früheren Entwürfen:

- **`qwen channel start <name>` (der Shipping-Pfad).** `start.ts` konstruiert **`new AcpBridge(bridgeOpts)`** (`start.ts:213,268,356,435`), und `AcpBridge.start()` **spawnt einen Child-**`node <cliEntryPath> --acp`-Prozess (`AcpBridge.ts:53-70`), der über ACP via NDJSON auf **stdio** kommuniziert. Dieser Child ist ein _Stand-Alone-Agent_, nicht der `qwen serve`-HTTP-Daemon. In dieser Topologie gibt es **keinen HTTP-Daemon, keine `/workspace/memory`-Route, keinen `MultiClientPermissionMediator`, keinen `eventBus`-Replay-Ring und keine Daemon-`promptQueue`** – all diese leben in `packages/acp-bridge` + `packages/cli/src/serve`, was `qwen channel start` nie instanziiert. Die Prompt-Serialisierung erfolgt hier vollständig **Channel-seitig** durch `ChannelBase` (`activePrompts`-Mutex bei `ChannelBase.ts:356-391` + `sessionQueues`-Chain bei `:394-470`) und durch das eigene ACP-One-Prompt-per-Session-Invariant des Childs. `AcpBridge.requestPermission` **genehmigt automatisch jeden Tool-Call** (`AcpBridge.ts:108-118`).
- **`qwen serve` + `DaemonChannelBridge` (Daemon-gehostet).** `DaemonChannelBridge` (`packages/channels/base/src/DaemonChannelBridge.ts`) ist eine In-Process-Bridge, deren `sessionFactory` Daemon-`Session`-Objekte erzeugt. Dieser Pfad führt Channels innerhalb des Daemons aus und erbt dadurch die FIFO-`promptQueue` von `acp-bridge` (`bridge.ts:232,2855,3082`), den `MultiClientPermissionMediator`, den `eventBus` und die HTTP-Routen. **`qwen channel start` instanziiert dies heute nicht** (null Referenzen in `start.ts`). Eine scharfe Kante, die das Proactive-Design prägt: `DaemonChannelBridge.prompt()` **queued nicht – es wirft `Prompt already in flight`** bei Überlappung (`DaemonChannelBridge.ts:257-261`); die FIFO-`promptQueue`, die es schließlich erreicht, liegt Daemon/acp-bridge-seitig, _hinter_ diesem In-Process-Throw-Guard. Die Proactive-Engine muss daher auf der Channel-Ebene serialisieren (§6.2).

**Festgeschriebene Architektur (war OD-1, jetzt entschieden):** Die Multi-Client-Daemon-Maschinerie wird wiederverwendet, indem **das Channel-Hosting ab Phase 1 in den `qwen serve`-Daemon migriert wird**.

- **Phase 0** wird auf dem aktuellen `AcpBridge`-Pfad ausgeliefert (Identity-Injection benötigt weder HTTP-Routen noch den Mediator).
- **Phase 1+** führt Channels unter dem `qwen serve`-Daemon aus (über `DaemonChannelBridge` oder einen Daemon-Channel-Runner), da die Proactive-Engine, die Room-bezogene Memory-Persistenz und die Governance alle die Durability, Routen, `promptQueue`, den Mediator und den Event Bus des Daemons benötigen.

Dies ist nicht mehr "open" oder "gating": Das Phase-0-Wiring fügt den `DaemonChannelBridge`-Attach-Pfad (oder ein `--daemon <url>`-Flag) hinzu, sodass die Migration verfügbar ist, sobald Phase 1 beginnt. Der Gateway-eigene Scheduler (§6.2) ist so gebaut, dass er **migrationsneutral** ist und somit vor und nach dem Cut-over identisch läuft.

### Was "qwen tag" konkret ist

Ein "qwen tag"-Deployment ist ein einzelner Agentenprozess, der an einen Workspace gebunden ist, plus ein `qwen channel start dingtalk`-Adapter, der so konfiguriert ist, dass eine gesamte Gruppe **eine** Agenten-Session teilt. Zwei **unterschiedliche Scope-Konzepte** müssen beide zusammenpassen:

1. **Channel-Routing-Scope** (`ChannelConfig.sessionScope`, verbraucht von `SessionRouter.routingKey()`): entscheidet, wie eingehende Nachrichten auf einen Routing-Key gemappt werden. Für einen Tag muss dies `'thread'` sein, damit die gesamte Gruppe einen Routing-Key teilt (`channel:(threadId||chatId)`, `SessionRouter.ts:53`). **Der Parser-Default ist `'user'`, nicht `'thread'`** (`config-utils.ts:91-92`), daher muss das Tag-Rezept es explizit setzen.
2. **Bridge/ACP-Session-Scope** (`DaemonChannelBridge` / `acp-bridge` `sessionScope`): entscheidet, wie der Daemon eine zugrunde liegende ACP-Session teilt. `DaemonChannelBridge.newSession()` setzt dies standardmäßig auf `'thread'` (`DaemonChannelBridge.ts:229,240`); der In-Process-Pfad von `acp-bridge` setzt standardmäßig auf `'single'` (`bridge.ts:709`). Dies ist eine **separate Einstellmöglichkeit** zum Channel-Routing-Scope und befindet sich _nicht_ auf dem `qwen channel start`-Pfad (`AcpBridge.newSession(cwd)` nimmt nur `cwd`, `AcpBridge.ts:131`).

Mit diesen Voraussetzungen:

- **Ein Agent pro Raum, herbeigerufen durch Erwähnung.** `GroupGate` erzwingt `requireMention` (Default `true`, `GroupGate.ts:49`), sodass der Agent still bleibt, bis er `@`-erwähnt wird oder es sich um eine Antwort an den Bot handelt (`GroupGate.ts:51`). Der Multiplayer-Key ist `sessionScope: 'thread'`, gemappt auf `channel:(threadId||chatId)` (`SessionRouter.ts:50-53`), sodass jedes Mitglied dieselbe `sessionId` wiederverwendet, unabhängig vom Sender.
- **Echte mehrstufige Arbeit mit Tools.** Eingehende Nachrichten werden über `ChannelBase.handleInbound()` zu Prompts, wobei `promptText` aus Nachrichtentext, Reply-Quote-Kontext, Attachment-Dateipfaden und (einmal pro Session) `config.instructions` gebaut wird (`ChannelBase.ts:316-347`), und dann über `bridge.prompt(sessionId, promptText, { imageBase64, imageMimeType })` dispatched wird (`ChannelBase.ts:425` – `promptText` ist ein positionales Argument; das Options-Objekt trägt nur die Bild-Felder).
- **Streamt seine Arbeit zurück in den Raum.** Adapter rendern inkrementelle Outputs als plattformnative Cards (Feishu Create/Update/Finalize, `markdown.ts`; DingTalk-Markdown-Chunking, `DingtalkAdapter.ts:144-169`).
- **Erinnert sich an den Channel.** `SessionRouter.persist()` / `restoreSessions()` speichern `sessionId`, Target und `cwd` dauerhaft und rehydrieren sie über `bridge.loadSession()` über Neustarts hinweg (`SessionRouter.ts:168-244`); Workspace-Memory (`QWEN.md` / `~/.qwen/QWEN.md`) wird über `GET` / `POST /workspace/memory` gelesen/geschrieben (`workspace-memory.ts`). Dieses Memory ist Workspace/global-scoped, nicht pro Raum – siehe Build Area 3.
- **Kann proaktiv / nach Zeitplan handeln.** Dies ist die Hälfte, die _noch nicht_ End-to-End existiert und das Herzstück von Phase 1 ist.
---

## 2. Motivation

Die Infrastruktur, die ein residenter Multiplayer-_Reply_-Agent normalerweise benötigt, ist in diesem Repository bereits implementiert. Die tatsächlich noch ausstehende Arbeit gliedert sich in vier Entwicklungsbereiche.

| Fähigkeit, die der Tag-Formfaktor benötigt             | Bereits vorhanden (Referenz)                                                                                                                                                                                |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Langlebiger, Multi-Session-Prozess                     | `AcpBridge` erzeugt einen langlebigen `--acp`-Kindprozess (`AcpBridge.ts:53-70`); der Daemon-Pfad fügt eine pro-Session FIFO `promptQueue` hinzu (`bridge.ts:232,2855,3082`)                                                                        |
| Multiplayer-Routing "ein Raum, eine Session"           | `SessionRouter` `'thread'`-Scope (`SessionRouter.ts:53`), pro-Channel-Override `setChannelScope()` (`SessionRouter.ts:40`)                                                                                                                          |
| Summon-by-mention-Semantik                             | `GroupGate` `requireMention` Standardwert `true` (`GroupGate.ts:49-52`)                                                                                                                                                                             |
| Zugriffskontrolle + Onboarding                         | `SenderGate`-Allowlist + Pairing-Code-Flow; Gates werden gruppen- dann senderbezogen angewendet (`ChannelBase.ts:240-252`)                                                                                                                            |
| Dauerhaftes Session-Mapping über Neustarts hinweg      | `SessionRouter`-Persistenz (`SessionRouter.ts:168-244`)                                                                                                                                                                                             |
| Workspace-Memory lesen/schreiben                       | `GET` / `POST /workspace/memory` (`workspace-memory.ts`); nur Workspace- und globale Scopes; nur Daemon                                                                                                                                             |
| Multi-Aktor-Berechtigungssteuerung + Audit (nur Daemon)| `MultiClientPermissionMediator` vier Richtlinien inkl. `consensus`-Quorum (`permissionMediator.ts:621-637`); separater Permission-Audit-Ring (`permission-audit.ts`)                                                                                |
| Auth, Rate Limiting, Loopback-Sicherheit (nur Daemon)  | Globaler Bearer-Token (`auth.ts:259-266`) + client-ID-/IP-basiertes abgestuftes Rate Limit (`rate-limit.ts`)                                                                                                                                        |
| In-Session-Push-Primitive (Hintergrundaufgaben)        | `Session`-Benachrichtigungswarteschlange + `setNotificationCallback()` speist Hintergrund-Task-/Monitor-/Shell-Output in die offene Session (`Session.ts:688-689,2638-2668`); `isIdle()` berücksichtigt dies (`Session.ts:777`)                      |
| Plattform-Zustellung (DingTalk + Feishu)               | Funktionsfähige Adapter mit Streaming-Cards, Medien, Reactions (`DingtalkAdapter.ts`, `FeishuAdapter.ts`)                                                                                                                                            |

Da Phase 1+ unter dem Daemon läuft (festgeschriebene Architektur, §1), werden die oben genannten, nur für den Daemon geltenden Zeilen zu verfügbaren Fähigkeiten für die Proactive-Engine, die Memory-Persistenz und die Governance – und nicht nur zu "Zielen, falls wir migrieren".

Die vier Entwicklungsbereiche, die in §6 im Detail ausgearbeitet sind:

1. **Konfiguration + Identität, um einen Tag zu _deklarieren_ (Phase 0).** Ein dokumentiertes Konfigurationsrezept — `sessionScope: 'thread'`, `groupPolicy`, `requireMention`, `instructions`, `dispatchMode` — plus die **Sender-Attribution-Lücke**: `handleInbound()` injiziert absichtlich **nicht** `senderName` in `promptText` (`ChannelBase.ts:316-347`; `senderName` wird nur für die Zugriffskontrolle unter `ChannelBase.ts:246` verwendet). In einer geteilten `'thread'`-Session kann der Agent nicht erkennen, _wer_ spricht. Phase 0 injiziert einen Sender-Marker, so wie der Reply-Quote-Kontext bereits injiziert wird (`ChannelBase.ts:318`).
2. **Eine Proactive- / Outbound-Initiate-Engine (Phase 1).** Heute gibt es **keinen Proactive-Pfad an der Channel-Grenze**: `ChannelBase.sendMessage()` ist abstrakt (`ChannelBase.ts:81`) und wird nur innerhalb einer Response aufgerufen. Unter DingTalk kann `sendMessage()` nur über einen kurzlebigen `sessionWebhook` antworten, der pro `conversationId` bei Inbound gecacht wird (`DingtalkAdapter.ts:134-142`), sodass eine **kalte Gruppe überhaupt nicht benachrichtigt werden kann** (`DingtalkAdapter.ts:137-141` gibt stillschweigend nichts zurück). Phase 1 fügt einen im Daemon residenten Scheduler und einen DingTalk-Proactive-Send-Pfad hinzu.
3. **Channel-resident Memory + Retrieval (Phase 2, Memory-Hälfte).** Workspace-Memory ist **workspace-global, nicht pro Raum**: `POST /workspace/memory` akzeptiert nur `scope: 'workspace' | 'global'` (`workspace-memory.ts:118-125`) und ist eine **Strict-Auth-Mutationsroute** (`deps.mutate({ strict: true })`, `workspace-memory.ts:114`). Ein Tag, der sich an _diesen_ Channel erinnert, benötigt einen Memory-Namespace pro Raum.
4. **Multiplayer-Governance + Sicherheit (Phase 2, Governance-Hälfte).** Gruppengeeignete Permission-Policy, Proactive-Action-Guardrails und Forensic-Audit, aufbauend auf der bestehenden `clientId`-basierten (nicht auf menschlicher Identität basierenden) Infrastruktur.

---

## 3. Ziele & Non-Goals

### Ziele

- **G1 — Die "Tag"-Konfiguration dokumentieren und ausliefern** auf DingTalk: ein kopierbares `channels.dingtalk`-Rezept (explizites `sessionScope: 'thread'`, `groupPolicy: 'allowlist'` mit aufgelisteter Gruppen-ID, `requireMention: true`, `instructions` und ein bewusst gewählter `dispatchMode`), das einen funktionierenden residenten Multiplayer-Agenten ergibt, unter Wiederverwendung von `parseChannelConfig()` und den bestehenden Gates. Das Rezept muss die Unterscheidung zwischen Routing-Scope und ACP-Scope hervorheben und darauf hinweisen, dass der Parser-Standardwert `'user'` überschrieben werden muss.
- **G2 — Sender-Attribution in geteilten Sessions.** Injizieren eines senderspezifischen Markers pro Nachricht in `promptText`, damit der Agent die Sprecher in einer `'thread'`-scopigen Gruppe unterscheiden kann, ohne die einmal-pro-Session-`instructions`-Injektion zu brechen, die von `instructedSessions` nachverfolgt wird (`ChannelBase.ts:344-346`). Der Marker ist **pro Nachricht** (der Sprecher wechselt in jedem Turn) und darf **nicht** von `instructedSessions` abhängig gemacht werden. Dies erfordert **ein neues optionales `Envelope`-Feld, `alreadyPrefixed`** (`types.ts`), damit der synthetische Re-Entry im `collect`-Modus nicht doppelt präfixt – siehe §6.1. (v1 beschrieb dies fälschlicherweise als "nur Format, kein neues Feld".)
- **G3 — Eine Proactive-Engine.** Ein Mechanismus, um (a) Output an einen Channel zu initiieren, der nicht gerade eine Nachricht gesendet hat, und (b) nach einem Zeitplan auszulösen, unabhängig von einer offenen interaktiven Session, wobei die Ausgabe wenn möglich über den bestehenden Pro-Session-Benachrichtigungspfad erfolgt – einschließlich der DingTalk-Proactive-Send-API und eines persistenten `openConversationId`-Speichers mit einem definierten Token-Refresh-Owner. Muss die ACP-One-Prompt-per-Session-Invariante (NG6) respektieren, indem über `ChannelBase.sessionQueues` serialisiert wird (niemals einen Human-Turn mit `steer` abbrechen), unter beiden Topologien.
- **G4 — Channel-resident Memory.** Ein Memory-Namespace pro Raum und ein Retrieval-Pfad, der auf der bestehenden `/workspace/memory`-Infrastruktur und dem `instructions`-Mechanismus aufsetzt. Das Design fügt einen neuen `channel`-Scope (+`channelKey`) zu `writeContextFile.ts` hinzu und erreicht ihn von `channel-base` aus über einen **CLI-Layer-Callback, der durch `ChannelBaseOptions` injiziert wird** (keine `channel-base → core`-Abhängigkeit).
- **G5 — Multiplayer-Governance.** Gruppengeeignete Permission-Policy, Proactive-Action-Guardrails und Audit, aufbauend auf `MultiClientPermissionMediator` und dem Permission-Audit-Ring. Muss berücksichtigen, dass Votes `clientId`-basiert und nicht auf menschlicher Identität basierend zugeordnet werden, und dass in einer einzigen geteilten `'thread'`-Session jedes Gruppenmitglied derselbe Daemon-Client ist.
- **G6 — Feishu-Parität** für alles in G1–G5, als Follow-up behandelt. Feishus stabiler `tenant_access_token` unterstützt bereits Proactive-Sends an jeden Chat mit nur einer `chatId` (`FeishuAdapter.ts:622-651`), sodass Feishu für G3 _keine_ neue Send-API benötigt – nur den Daemon-Level-Wake/Schedule-Mechanismus. Feishu deklariert `canColdSend = true`.
- **G7 — Wiederverwendung statt Neuerfindung.** Jeder Entwicklungsbereich erweitert einen bestehenden Mechanismus (Gates, Router, Bridge, Mediator, Memory-Routen, In-Session-Benachrichtigungspfad, Cron) anstatt ein paralleles Subsystem einzuführen.

### Non-Goals

- **NG1 — Kein gehostetes, Multi-Tenant-SaaS.** Ein "qwen tag" ist ein Agentenprozess, der an **einen** Workspace gebunden ist (`serve.ts:165-171`; Multi-Workspace = ein Daemon pro Workspace auf separaten Ports). Keine zentrale Control Plane.
- **NG2 — Keine pro-menschliche Identität, Abrechnung oder Kostenbudgets in diesem RFC.** Das Identitätsmodell des Daemons ist ein **einzelner globaler Bearer-Token** (`auth.ts:259-266`) und `clientId`-basierte Attribution im gesamten Event-Bus und Permission-Audit. Wir fügen Sender-_Marker in Prompts_ hinzu (G2), führen aber **keine** authentifizierten pro-Benutzer-Prinzipale, pro-Benutzer-Quotas oder Kosten-Tracking ein. Sender-Marker sind advisory Prompt-Text, keine Auth-Grenze – jedes Gruppenmitglied teilt sich die einzelnen Workspace-Credentials des Daemons und ist in einer geteilten `'thread'`-Session derselbe Daemon-`clientId`.
- **NG3 — Das Phase-3-Multi-Identity-Gateway ist hier nicht im Scope**, sondern wird nur als Forward-Pointer erwähnt. Dieses RFC deckt Phase 0–2 ab.
- **NG4 — Feishu ist sekundär, nicht gleichrangig primär.** DingTalk ist die Referenzimplementierung und die Quelle aller durchgerechneten Beispiele.
- **NG5 — Slack und andere westliche Plattformen sind nicht im Scope.** Die registrierten Channel-Typen sind `telegram`, `weixin`, `dingtalk`, `feishu` und `qq` (`channel-registry.ts:10-14`); es existiert kein Slack-Adapter.
- **NG6 — Keine Änderung der ACP-One-Prompt-per-Session-Invariante.** Ein geplanter/proaktiver Prompt ist nur ein weiterer Eintrag in den Channel-`sessionQueues`; er kann nicht parallel zu einem User-Turn in derselben Session laufen und keinen abbrechen.
- **NG7 — Keine neue Chat-scopige Memory-Store-Engine.** Channel-resident Memory (G4) setzt _Namespacing_ auf die bestehenden file-basierten `QWEN.md`/`AGENTS.md`-Dateien; keine Vector-DB oder pro-Raum-Datenbank.

---

## 4. Bestandsaufnahme

Implementiert (B), teilweise (P), fehlend (M). "File" zitiert das maßgebliche Symbol. "Topology" vermerkt, ob die Fähigkeit auf dem `AcpBridge`-Channel-Pfad (A), dem `qwen serve`-Daemon-Pfad (D) oder beiden existiert – und da Phase 1+ fest für die Ausführung unter dem Daemon vorgesehen ist, gibt ein "→D"-Hinweis an, wo die Migration die Fähigkeit erst freischaltet.

| Fähigkeit                                  | qwen-code heute (Datei / Symbol)                                                                       | Topologie                             | Lücke                                                                                                                                                                         | Umfang            |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| One-Room-One-Session-Routing               | `SessionRouter.routingKey()` `'thread'` (`SessionRouter.ts:44-60`)                                     | A+D                                   | Standard-Scope ist `'user'` (`config-utils.ts:91-92`); Operator muss `'thread'` setzen                                                                                        | Config (S)        |
| Summon-by-mention                          | `GroupGate.requireMention` Standardwert `true` (`GroupGate.ts:49-52`)                                  | A+D                                   | Keine – bereits korrekt                                                                                                                                                       | —                 |
| Zugriffskontrolle / Onboarding             | `SenderGate`-Allowlist + Pairing (`ChannelBase.ts:240-252`)                                            | A+D                                   | Keine                                                                                                                                                                         | —                 |
| Dauerhaftes Session-Mapping                | `SessionRouter.persist`/`restoreSessions` (`SessionRouter.ts:168-244`)                                 | A+D                                   | Keine                                                                                                                                                                         | —                 |
| **Sender-Attribution im Prompt**           | `handleInbound()` erstellt promptText ohne `senderName` (`ChannelBase.ts:316-347`)                     | A+D                                   | `senderName` wird nie injiziert; Agent kann nicht erkennen, wer gesprochen hat; benötigt neues `Envelope.alreadyPrefixed`                                                     | Code (S)          |
| Prompt-Serialisierung                      | `ChannelBase.sessionQueues`/`activePrompts` (`:356-470`); Daemon-`promptQueue` (`bridge.ts:2855`)      | A (Channel) / D (Daemon)              | `DaemonChannelBridge.prompt()` THROWS bei Überlappung (`:257-261`) – Proactive-Engine muss channel-seitig serialisieren; `dispatchMode`-Standardwert `'steer'` bricht Peers ab (`:354,371-379`) | Config + Code (S) |
| **Outbound-initiate / Proactive-Send**     | `ChannelBase.sendMessage()` abstrakt (`:81`); DingTalk nur Webhook (`DingtalkAdapter.ts:134-142`)        | A+D                                   | Kein Proactive-Seam; DingTalk kalte Gruppe nicht benachrichtigbar; benötigt `canColdSend`-Fähigkeits-Flag                                                                     | Code (L)          |
| **Daemon-Level-Scheduler**                 | Cron ist session-scoped (`Session.ts:667-668`), stirbt bei `dispose()` (`:790-812`)                    | A+D (Gateway) → D (Audit/Queue-Reuse) | Kein Daemon-Scheduler-Endpunkt in `serve/` oder `channels/`; Gateway-Scheduler ist alleiniger Owner (OD-8)                                                                    | Code (L)          |
| In-Session-Push-Primitive                  | `setNotificationCallback` (`Session.ts:2638-2668`)                                                     | A+D                                   | Zustellung nur in eine _live_ Session; kann eine bereits bereinigte (reaped) nicht wecken                                                                                     | (Reuse)           |
| **Per-Room Memory**                        | `/workspace/memory` Scopes `workspace\|global` (`workspace-memory.ts:118-125`)                         | Nur D                                 | Kein Chat/Channel-Scope; neuer `channel`-Scope + CLI-Layer-Callback (keine Core-Abhängigkeit)                                                                                 | Code (M)          |
| Multi-Aktor-Permission-Voting              | `MultiClientPermissionMediator` 4 Policies (`permissionMediator.ts:621-637`)                           | D (geerbt Phase 1+)                   | `AcpBridge` genehmigt automatisch (`AcpBridge.ts:108-118`); Votes sind pro `clientId`, ein Client pro Channel                                                                  | Code (L)          |
| Audit-Trail                                | `PermissionAuditRing` FIFO 512 (`permission-audit.ts`)                                                 | D + Channel-seitiger Ring             | Keine menschliche `senderId`; im Speicher, bei Neustart verloren; `~/.qwen` Append-Only-Follow-up                                                                             | Code (M)          |
| **Token / Kostenbudget**                   | keine (Rate-Limit ist nur Request-Count, `rate-limit.ts`)                                              | Channel-seitiges Ledger + D-Nutzung   | Kein Spend-Meter; v1-Schätzungen (advisory), echte Abbuchung nur wenn daemon-gehostet                                                                                         | Code (M)          |
| Per-Channel-Tool/MCP-Scope                 | `coreTools`/`allowedTools`/`excludeTools` (`config.ts:727-729`); MCP-Allow-Filter (`:3327-3333`)       | pro `Config`                          | Kein Spawn-Arg-Pfad vom Channel zum `--acp`-Kindprozess (AcpBridge); pro-Daemon-`Config` sobald gehostet                                                                      | Code (M)          |
| DingTalk Proactive-Send                    | nicht implementiert (nur `robot/emotion`, `messageFiles/download`)                                     | A+D                                   | Neuer Endpunkt + persistierte `openConversationId` + Token-Refresh (verifizierter Contract, §6.2)                                                                             | Code (L)          |
| Feishu Proactive-Send                      | `sendMessage()` über `tenant_access_token` (`FeishuAdapter.ts:622-676`)                                | A+D                                   | Keine – `canColdSend = true`                                                                                                                                                  | —                 |
Größen-Schlüssel: S = Konfiguration/kleiner Code, M = ein Modul + Interface-Änderung, L = Multi-Package-Änderung oder neues Subsystem.

---

## 5. Architektur

`qwen tag` ist **keine neue Runtime**. Es besteht aus vier dünnen Schichten, die auf den bestehenden Adapter-Stack aufgepfropft werden. Die Basisschicht bietet bereits einen Multiplayer-fähigen, Tools ausführenden, MCP-ausgestatteten Agenten, der über einen Chat-Kanal erreichbar ist. Die vier neuen Schichten schließen 1:1 die folgenden Lücken: (1) **wer spricht** — die Absenderidentität erreicht nie den Prompt; (2) **unkommandiertes Handeln** — kein Pfad für ausgehende Initiierung, der In-Session-Cron stirbt mit der Session; (3) **Sich-Erinnern an den Kanal** — der Memory ist Workspace-global; (4) **Steuerung eines gemeinsamen Gehirns** — Auth ist ein einzelner globaler Token, kein Budget pro Kanal.

Jede der folgenden Schichten gibt an, welche Topologie sie voraussetzt (siehe §1). Die **festgelegte Aufteilung**: Phase 0 auf `AcpBridge`; Phase 1+ auf dem `qwen serve` Daemon via `DaemonChannelBridge`.

### Basisschicht (vorhanden) — `qwen channel start` Topologie (Phase 0)

```
                              ein Host, ein Workspace
┌──────────────────────────────────────────────────────────────────────────────┐
│  qwen channel start dingtalk                                                   │
│                                                                                │
│  ┌────────────────────┐    Envelope     ┌───────────────────────────────────┐ │
│  │ DingtalkAdapter     │ ──────────────▶ │ ChannelBase.handleInbound()       │ │
│  │ (Stream-Client,     │                 │  1 GroupGate.check (Mention/      │ │
│  │  Webhooks gemappt   │ ◀────────────── │    Policy/Allowlist)             │ │
│  │  nach conversationId)│   text/markdown │  2 SenderGate.check (Pairing)    │ │
│  │  sendMessage()       │                 │  3 Slash- / "!"-Befehle          │ │
│  └────────────────────┘                 │  4 router.resolve(...)           │ │
│        ▲  sessionWebhook (läuft ab,       │  5 dispatchMode (steer als Default)│
│        │  nur pro Inbound-Nachricht)     └───────────────┬───────────────────┘ │
│        │                                                 │ sessionId            │
│        │                                ┌────────────────▼──────────────────┐ │
│        │                                │ SessionRouter                      │ │
│        │                                │  routingKey(): user|thread|single  │ │
│        │                                │  persist() → JSON (Crash-Recovery)  │ │
│        │                                └────────────────┬──────────────────┘ │
│        │   textChunk / toolCall Events  ┌────────────────▼──────────────────┐ │
│        └─────────────────────────────── │ AcpBridge (NICHT der HTTP-Daemon)  │ │
│                                         │  startet Kindprozess `node <cli> --acp`│
│                                         │  ClientSideConnection über stdio    │ │
│                                         │  requestPermission wird auto-genehmigt│
│                                         └────────────────┬──────────────────┘ │
└──────────────────────────────────────────────────────────┼─────────────────────┘
                                                             │ ACP / NDJSON (stdio)
                                          ┌──────────────────▼─────────────────────┐
                                          │ Kind-Agent-Prozess (`--acp`)            │
                                          │  ein aktiver Prompt pro ACP-Session     │
                                          │  In-Session-Cron (Session.ts) — DEAKTIVIERT│
                                          │  für Tag-Sessions (OD-8); MCP, Tools.   │
                                          │  KEINE promptQueue/eventBus/mediator    │
                                          └─────────────────────────────────────────┘
```

### Daemon-gehostete Topologie (Phase 1+) — `qwen serve` + `DaemonChannelBridge`

```
                              ein Host, ein Workspace, EIN Daemon
┌──────────────────────────────────────────────────────────────────────────────┐
│  qwen channel start dingtalk  (Kanäle gehostet IM Daemon)                      │
│  ┌────────────────────┐  Envelope   ┌────────────────────────────────────────┐│
│  │ DingtalkAdapter     │ ──────────▶ │ ChannelBase.handleInbound()            ││
│  │ pushProactive()     │ ◀────────── │  gates → governor.admit → router       ││
│  │ canColdSend = false*│             │  → sessionQueues (FIFO, Serialisierung) ││
│  └────────────────────┘             └───────────────┬────────────────────────┘│
│         ▲ proaktiver Group-Send                      │ bridge.prompt()          │
│         │ (openConversationId)        ┌───────────────▼────────────────────────┐│
│  ┌──────┴────────────┐               │ DaemonChannelBridge                      ││
│  │ ChannelCronSched   │──fire────────▶│  prompt() WIRFT bei Überlappung (:257-261)│
│  │ (gateway-eigen,    │ dispatchProa- │  → daher MÜSSEN alle Prompts serialisiert││
│  │  einziger Cron-    │ ktiv via      │     eintreffen via sessionQueues         ││
│  │  Owner)            │ sessionQueues └───────────────┬────────────────────────┘│
│  └────────────────────┘                               │ In-Process Session       │
│                                       ┌────────────────▼────────────────────────┐│
│                                       │ Daemon: acp-bridge FIFO promptQueue,     ││
│                                       │  MultiClientPermissionMediator, eventBus, ││
│                                       │  /workspace/memory + /channel routes,     ││
│                                       │  Rate-Limit, Bearer-Auth                  ││
│                                       └──────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────────────────┘
* DingTalk canColdSend springt auf true, sobald der Proactive-Send-Pfad ausgeliefert wird (§6.2).
```

Wichtige Invarianten, auf denen wir aufbauen (verifiziert):

- **Thread-Scope ist der Multiplayer-Schlüssel.** `routingKey()` gibt unter `'thread'` `${channelName}:${threadId || chatId}` zurück (`SessionRouter.ts:53`); `resolve()` verwendet den Key wieder (`:79-83`). Der Default-Scope ist `'user'` (`:25`); `qwen channel start` setzt den Scope pro Kanal über `router.setChannelScope(name, config.sessionScope)` (`start.ts:361-362`) im Multi-Channel-Pfad oder über den `ChannelBase`-Konstruktor aus `config.sessionScope` (`ChannelBase.ts:62-64`) im Single-Channel-Pfad. **Multiplayer erfordert, dass der Operator `sessionScope: "thread"` setzt.**
- **Prompt-Serialisierung.** Auf `AcpBridge` akzeptiert `newSession(cwd)` nur `cwd` (`AcpBridge.ts:131`) und `AcpBridge.prompt()` hat keine Concurrency-Guard — die Serialisierung erfolgt über den `ChannelBase` `dispatchMode`: `collect` puffert (`:361-370,445-463`), `steer` bricht den aktiven Prompt ab (`:371-379`), `followup` reiht in `sessionQueues` ein (`:381-383,394-470`). Der **Runtime-Default ist `'steer'`** (`:354`); der `types.ts:42` JSDoc sagt `'collect'` — **veraltet; v2 korrigiert dies auf `'steer'` (OD-5).** Auf dem Daemon-Pfad **wirft** `DaemonChannelBridge.prompt()` bei Überlappung (`:257-261`); die Daemon-FIFO `promptQueue` (`bridge.ts:2855,3082`) liegt _hinter_ dieser Throw-Guard. Konsequenz (tragend für §6.2): Alle Prompts — menschliche und proaktive — müssen `bridge.prompt()` bereits serialisiert durch `ChannelBase.sessionQueues` erreichen.
- **`sendMessage` ist abstrakt.** `ChannelBase.sendMessage()` ist `abstract` (`:81`); `DingtalkAdapter.sendMessage()` (`:134-170`) sendet über einen pro-`conversationId` `sessionWebhook`, der nur bei Inbound gecachtet (`:516-517`) und zeitlich begrenzt ist — eine kalte Gruppe hat keinen gecachten Webhook und der Aufruf **kehrt stillschweigend zurück** (`:137-141`).
- **Von Phase 1+ geerbte Daemon-Invarianten.** `MultiClientPermissionMediator` (`permissionMediator.ts:621-637`), `eventBus` Replay-Ring (`eventBus.ts:92`), pro-`SessionEntry` `promptQueue` FIFO (`bridge.ts:2855-3082`) werden verfügbar, sobald Kanäle unter `qwen serve` gehostet werden (festgelegt, §1).

### Die vier neuen Schichten

```
            ┌───────────── Governance (Layer 4) ─────────────┐
            │  Turn-/Cost-Budget-Gate pro Kanal               │
            │  Proaktive Allowlist, Ruhezeiten, Kill-Switch   │
            └───────────────────────┬─────────────────────────┘
                                     │ umschließt alle Inbound + Outbound
 Inbound  ┌──────────────────────────▼─────────────────────────┐  Outbound
 ───────▶ │  Identity-Injection (Layer 1)                       │ ────────▶
          │  promptText mit Sprecher + Kanal-Kontext präfixieren│
          └──────────────────────────┬─────────────────────────┘
                                     │
          ┌──────────────────────────▼─────────────────────────┐
          │  Kanal-Memory (Layer 3)                             │
          │  Fragment pro Kanal, injiziert bei Session-Start;    │
          │  persistiert via CLI-Layer-Callback (Core-Helper)    │
          └──────────────────────────┬─────────────────────────┘
                                     │
          ┌──────────────────────────▼─────────────────────────┐
          │  Proaktive Engine (Layer 2)                         │
          │  Gateway-Scheduler → sessionQueues → bridge.prompt → │
          │  channel.pushProactive() m. Cold-Group-Fallback      │
          └─────────────────────────────────────────────────────┘
```

**Layer 1 — Identity-Injection.** _Topologie: beide; benötigt keinen Daemon._ `handleInbound()` schreibt `senderName` niemals in `promptText` (`ChannelBase.ts:246` liest es nur für `SenderGate.check()`; `Envelope.senderName` existiert unter `types.ts:69`). Design: ein per Config gegater Injektionspunkt in `handleInbound()`, nach dem `referencedText`-Präfix (`:316-319`), gegatet über `envelope.isGroup`, plus ein neuer `Envelope.alreadyPrefixed`-Flag für den `collect`-Wiedereintritt. Details in §6.1.

**Layer 2 — Proaktive Engine.** _Topologie: Gateway-eigener Scheduler, migrationsneutral; läuft unter dem Daemon Phase 1+._ In-Session-Cron stirbt bei `dispose()` (`Session.ts:790-803`); es gibt keinen Daemon-Scheduler-Endpunkt. `DingtalkAdapter.sendMessage()` kann eine kalte Gruppe nicht erreichen (`:137-141`). Design: ein im Gateway ansässiger Scheduler, der einen Fire über `ChannelBase.sessionQueues` injiziert (niemals `steer`) und die Fertigstellung an `channel.pushProactive()` routet. Details in §6.2.

**Layer 3 — Kanal-Memory.** _Topologie: Persistierungspfad via CLI-Layer-Callback; Injektion kanal-seitig._ Memory ist nur Workspace-global (`workspace-memory.ts:86-303`). Design: ein Memory-Fragment pro Kanal, das bei Session-Start injiziert wird (Wiederverwendung des einmal-pro-Session `instructions`-Gates), plus ein neuer `channel`-Scope auf dem Schreibpfad, erreichbar von `channel-base` durch injizierte Callbacks (keine `channel-base → core`-Abhängigkeit). Details in §6.3.

**Layer 4 — Governance.** _Topologie: Gate-Wrapper kanal-seitig; Rate-Limiter Daemon-seitig Phase 1+._ Der Daemon hat einen globalen Bearer-Token (`auth.ts:259-266`), Rate-Limiting pro `clientId`/IP und kein Budget pro Kanal. Design: ein `ChannelGovernor`/`BudgetLedger`, der `handleInbound()` und den Scheduler umschließt. Details in §6.4.

### Datenfluss 1 — eingehendes `@qwen` in einem Gruppen-Thread

Dieser Fluss ist in beiden Topologien formidentisch; der einzige Unterschied liegt darin, wo Serialisierung und Permission stattfinden. Auf `AcpBridge` (Phase 0) erfolgt die Serialisierung über `ChannelBase.sessionQueues` und die Permission wird vom Kindprozess automatisch genehmigt; auf dem Daemon (Phase 1+) erfolgt die Serialisierung _immer noch_ über `ChannelBase.sessionQueues` (die Daemon-Throw-Guard schlägt nie an, da die Kanal-Schicht bereits serialisiert hat) und die Permission fließt durch den `MultiClientPermissionMediator`.

1. **DingTalk → Adapter.** Ein Mitglied postet "@qwen summarize today's incidents". Der Stream-Client liefert `DingTalkMessageData` mit `conversationId`, `sessionWebhook`, Sender und `isInAtList`. `DingtalkAdapter` cached `webhooks.set(conversationId, sessionWebhook)` (`:516-517`) und emittiert ein `Envelope` mit `isGroup:true`, `isMentioned:true`, `chatId = conversationId`.
2. **Governor (L4).** `ChannelGovernor`/`BudgetLedger.admit()` prüft das Turn-/Cost-Budget des Kanals (beratend, bis echte Nutzung verfügbar ist, §6.4) und den Kill-Switch. Hard-Kill / explizites Limit mit echten Zahlen → Ablehnen-und-Antworten; eine nur geschätzte Überschreitung → WARN, niemals Hard-Decline (Fix #6).
3. **Gates.** `GroupGate.check()` ist erfolgreich (Mention erfüllt das Default-`requireMention:true`); `SenderGate.check()` ist erfolgreich (`:246`).
4. **Routing.** `router.resolve(...)` berechnet `dingtalk:<conversationId>` unter dem `'thread'`-Scope (**erfordert `sessionScope:"thread"`**) und gibt die gemeinsame Gruppen-`sessionId` zurück. `persist()` zeichnet sie auf.
5. **Memory (L3) + Identity (L1).** Beim ersten Turn werden der Kanal-Memory + `config.instructions` einmalig vorangestellt (`instructedSessions`, `:344-347`). Das Identity-Injection stellt `[Alice]` pro Nachricht voran.
6. **Attribution-Erfassung.** Die aufgelösten `senderId`/`senderName` werden **auf dem Queue-Item** aufgezeichnet, das in `sessionQueues` transportiert wird (Fix #7), und nicht später per Zeitstempel zusammengeführt.
7. **Dispatch.** Das Tag-Profil setzt `followup` (niemals `steer`); Bobs gleichzeitige Nachricht reiht sich in `sessionQueues` ein (`:394-470`).
8. **Bridge.** `bridge.prompt(sessionId, promptText, {imageBase64, imageMimeType})` leitet über stdio ACP (`AcpBridge.prompt`, `AcpBridge.ts:147`) oder an die Daemon-Session (`DaemonChannelBridge.prompt`) weiter — dies wird nur erreicht, wenn der vorherige Turn `activePrompts` geleert hat, sodass die Daemon-Throw-Guard (`:257-261`) nie ausgelöst wird.
9. **Stream zurück.** `textChunk` → `onChunk` (`:416-422`); `onResponseComplete → DingtalkAdapter.sendMessage()` verwendet den gecachten `sessionWebhook` (warme Gruppe).
### Datenfluss 2 — geplanter proaktiver Push an eine kalte Gruppe

1. **Schedule feuert.** Der im Gateway residente `ChannelCronScheduler` wacht um 09:00 Uhr für `daily-standup → dingtalk:<convA>` auf. Nicht der In-Session-Cron (deaktiviert für Tag-Sessions, OD-8/§6.2; und ohnehin tot, sobald eine Session bereinigt wird — `dispose()` leert die `cronQueue`, `Session.ts:790-803`).
2. **Governor (L4).** Prüft die proaktive Allowlist und die Ruhezeiten (explizite Zeitzonen-Quelle). Außerhalb des Fensters / nicht auf der Allowlist → überspringen + loggen. Der Scheduler verifiziert `adapter.canColdSend` vor dem Zustellversuch; wenn false, **schlägt er laut fehl** (loggt + zeichnet `lastError` auf), niemals stilles No-Op (Fix #4).
3. **Synthetischer Envelope.** `senderId:'__cron__'`, `chatId: convA`, `isGroup:true`, `isMentioned:true`, keine `messageId`. Der synthetische Prompt trägt seine eigene Zuordnung (`createdBy`) auf dem Queue-Item.
4. **Serialisieren, niemals unterbrechen.** `dispatchProactive` reiht sich in `ChannelBase.sessionQueues` ein und wartet auf jeden laufenden Human-Turn (`activePrompts.get(sessionId)?.done`). Es ruft **niemals** `steer`/`cancelSession` auf und **niemals** `bridge.prompt()`, während `activePrompts` gehalten wird — sodass der `Prompt already in flight`-Throw des Daemons (`:257-261`) nicht feuern kann (§6.2, Fix #1).
5. **Cold-group send.** `pushProactive(convA, text)` findet `webhooks.get(convA)` als undefined und fällt auf den neuen proaktiven Pfad zurück: persistierte `openConversationId`, frischer App-Credentials-Token, POST `https://api.dingtalk.com/v1.0/robot/groupMessages/send` mit `robotCode = config.clientId`, `msgKey:'sampleMarkdown'`, `msgParam` (ein JSON-_String_). (Bei Feishu ist Schritt 5 das bestehende `sendMessage()` über `tenant_access_token`; `canColdSend = true`.)
6. **Budget + Audit.** Der proaktive Turn verbraucht das Budget-Bucket des Channels (beratende Abbuchung, bis daemon-gehostete Nutzung verfügbar ist); aufgezeichnet mit `createdBy` als ursprünglicher Identität und `originatorClientId` auf Transport-Ebene (keine erfundene menschliche Identität, `eventBus.ts:60`).

### Warum diese Form (Wiederverwendung vor Neuerfindung)

Jede neue Schicht dockt an einer bestehenden Nahtstelle an: Identität an der `promptText`-Erzeugungsstelle, proaktiv bei `sessionQueues` + `pushProactive()`, Memory bei der `instructions`/`writeContextFile`-Maschinerie, Governance als Wrapper über die Gate-Chain. Die einzige **strukturelle Voraussetzung** — die Wiederverwendung der Daemon-Maschinerie durch Layer 2–4 — wird durch die zugesagte Daemon-Migration (§1) erfüllt: Phase 0 wird auf `AcpBridge` ausgeliefert; Phase 1+ läuft unter `qwen serve`.

---

## 6. Detailliertes Design

### 6.1 Multiplayer & Identität (Build Area 1)

Ein "qwen tag" lebt in einem Gruppen-Chat. Jedes Mitglied spricht mit dem _selben_ Agenten, der (a) eine gemeinsame Konversation für den gesamten Channel pflegen, (b) wissen muss, _wer_ in jedem Turn spricht, (c) nicht zulassen darf, dass die Nachricht eines Mitglieds die laufende Aufgabe eines anderen zerstört, und (d) idealerweise die _Gruppe_ bei riskanten Tool-Calls um Genehmigung bitten muss. qwen-code verfügt heute über Primitive für (a)–(c); (d) ist daemon-gehostete Phase-1+-Arbeit (zugesagte Migration, §1).

#### Gruppenweit geteilte Session: `sessionScope: 'thread'`

Unter `'thread'` fällt die `senderId` aus dem Routing-Key heraus, sodass jedes Mitglied zu einer einzigen `sessionId` aufgelöst wird (`SessionRouter.ts:53,72-92`) — was den Agenten zu einer gemeinsamen, im Channel residenten Entität macht und nicht zu N privaten Bots.

- **Scope pro Channel, kein globaler Schalter.** Router-Default ist `'user'` (`:25`) und der Channel-Config-Default ist `'user'` (`config-utils.ts:91-92`). DMs und Single-User-Channel bleiben `'user'`. Das Tag-Profil setzt `sessionScope: 'thread'` in `settings.json`, angewendet pro Channel über `setChannelScope()` (Multi-Channel, `start.ts:361-362`) oder den `ChannelBase`-Konstruktor (Single-Channel, `ChannelBase.ts:62-64`).
- **DingTalk `threadId`/`chatId`-Stabilität.** Der DingTalk-Adapter setzt niemals `Envelope.threadId` (`DingtalkAdapter.ts:541-551`), sodass `routingKey()` den `threadId || chatId`-Fallback auf `chatId` nimmt und eine Gruppe auf eine Session pro `chatId` zusammenfasst (gewünscht). **Einschränkung:** `chatId = conversationId || sessionWebhook` (`:534`). Bei echten Gruppennachrichten ist `conversationId` vorhanden und stabil; wenn eine Nachricht jemals ohne sie eintrifft, fällt `chatId` auf die _auslaufende_ `sessionWebhook`-URL zurück und der Thread-Key wird instabil. Das Profil behandelt eine fehlende `conversationId` als Hard Error (Nachricht verwerfen), statt stillschweigend auf den Webhook zu keyen.

Die Persistenz deckt die Crash-Recovery ab (`SessionRouter.ts:168-244`): Ein Daemon-Neustart hängt die Gruppe über `bridge.loadSession()` wieder an dieselbe geteilte Session an.

#### Neue Gefahr: Thread-scoped `/clear` und `/status` sind channel-weit

Der geteilte `/clear`-Handler ruft `router.removeSession(this.name, senderId, chatId)` (`ChannelBase.ts:147-152`) und `/status` ruft `router.hasSession(...)` (`:203-208`) auf; beide routen durch `routingKey()`, was die `senderId` unter `'thread'` **ignoriert**. Ein `/clear` eines einzelnen Mitglieds löscht also die geteilte Session für den gesamten Channel und setzt `instructedSessions` zurück — eine One-Tap-Reset-Everyone-Fußfalle.

**Gelöst (OD-4):** In einer **geteilten (Thread-)Gruppe** erfordert `/clear` (und seine Aliase) einen expliziten `confirm`-Token und ist auf `config.allowedUsers` beschränkt, wenn diese Liste gesetzt ist; andernfalls wird direkt gelöscht (DMs und Pro-User-Gruppen berühren nur die eigene Session des Aufrufers, daher ist kein Gate nötig). Der Befehl behält den Namen `/clear`, da der Slash-Parser nur `[a-zA-Z0-9_]` akzeptiert (ein `/clear-channel` mit Bindestrich würde als `clear` + Arg `-channel` geparst werden); das explizite `confirm` ist das destruktive Signal. Ein echtes Owner-Gate pro Mitglied (das Admins unabhängig von der Chat-Allowlist von Mitgliedern unterscheidet) wartet auf das Identitätsmodell (OD-3/OD-11). **`/status` bleibt read-only** auf der geteilten Session.

#### Die Sender-Attributions-Lücke und die Lösung

`handleInbound()` baut `promptText` aus `envelope.text`, dem `referencedText`-Zitat-Präfix, Attachment-Pfaden und den einmal-pro-Session `config.instructions` (`ChannelBase.ts:315-347`); `envelope.senderName` wird nur für `SenderGate.check()` (`:246`) gelesen. In einer `'thread'`-Gruppe sieht der Agent einen undifferenzierten Stream.

**Fix (OD-6) — Präfix `[senderName]` für Gruppen-Turns, ganz oben bei der Prompt-Konstruktion (`:315-316`), in jedem Turn:**

```ts
let promptText = envelope.text;

// Multiplayer attribution: in a thread-shared session, tag each turn with the
// speaker. Skip 1:1 sessions (sender is invariant). Must fire EVERY turn —
// not gated by instructedSessions (the speaker changes each message). The
// alreadyPrefixed flag lets collect-mode synthetic re-entry skip this step.
if (envelope.isGroup && !envelope.alreadyPrefixed) {
  const who = envelope.senderName || envelope.senderId || 'unknown';
  promptText = `[${who}] ${promptText}`;
}

if (envelope.referencedText) {
  promptText = `[Replying to: "${envelope.referencedText}"]\n\n${promptText}`;
}
```

- **Gate auf `envelope.isGroup`** (`types.ts:75`), nicht auf Scope.
- **Präfix vor `referencedText`**, sodass die Reihenfolge `[Alice] [Replying to: "..."] <text>` ergibt.
- **`senderName` verwenden, nicht `senderId`.** Bei DingTalk ist `senderName = data.senderNick || 'Unknown'` (`DingtalkAdapter.ts:544`), niemals leer; die `senderId → 'unknown'`-Kette ist defensiv.
- **`collect`-Modus Double-Präfix-Gefahr, gelöst durch ein neues Feld.** Der zusammengeführte Re-Entry baut ein `syntheticEnvelope`, dessen `text` der bereits präfixierte zusammengeführte String ist, und tritt erneut in `handleInbound()` (`:449-462`) ein, was das Präfix **erneut** voranstellen würde. **v2 fügt ein neues optionales `Envelope`-Feld hinzu, `alreadyPrefixed?: boolean` (`types.ts`)**; das `collect`-Synthetic-Envelope setzt es auf `true`, und der obige Präfix-Schritt überspringt dies, wenn es gesetzt ist. (Dies korrigiert die Behauptung von v1, dass die Änderung "nur Format, kein neues Envelope-Feld" ist — Fix #2. Es ist das einzige neue Envelope-Feld, das dieser RFC einführt; das Bridge/ACP-Protokoll bleibt unverändert.)

#### Gruppen-Default `dispatchMode`: `steer` → `followup`

`steer` (Runtime-Default, `:354`) bricht den laufenden Prompt über `bridge.cancelSession()` (`:371-379`) ab. In einer geteilten Gruppe, wenn Bob etwas sendet, während der Agent an Alices Anfrage arbeitet, _bricht_ `steer` _Alices Aufgabe ab_ — ein versehentlicher Denial-of-Service. **Das Tag-Profil setzt `dispatchMode: 'followup'`**, sodass Bobs Nachricht hinter Alices Aufgabe in die Warteschlange gestellt wird (`sessionQueues` FIFO, `:381-383,394-470`). Setze dies im Gruppenprofil (`groups["*"].dispatchMode = "followup"`), nicht durch Ändern des globalen Defaults — DMs behalten die Self-Interrupt-UX von `steer`. **Keine Code-Änderung erforderlich** außer einem dokumentierten Profil-Default; v2 **korrigiert das veraltete `types.ts:42` JSDoc auf `'steer'`**, damit Code und Kommentar übereinstimmen (OD-5). `collect` ist für Gruppen mit sehr hohem Traffic akzeptabel (begrenzt die Queue-Tiefe) auf Kosten der Attributions-Unschärfe.

Da das Tag-Profil für Gruppen **immer `followup` (niemals `steer`)** ist, erbt die proaktive Engine eine saubere Invariante: Es gibt keinen Steer-vs-Proactive-Race, weil kein Pfad in einer Tag-Gruppe einen laufenden Prompt abbricht. Diese Invariante wird in §6.2 bekräftigt und durchgesetzt.

#### Handoff — "dort weitermachen, wo die letzte Person aufgehört hat"

Mit `'thread'` + `[senderName]`-Präfixen + `followup` _ist_ Handoff das Standardverhalten: Die Session enthält die vollständige Multi-Speaker-History. Zwei ergonomische Erweiterungen: ein read-only **`/who`**-Befehl (über `protected registerCommand(name, handler)`, `:141-143` — nicht die private `commands`-Map), der die aktive `sessionId`/`cwd`/Task-Zusammenfassung meldet; und idempotentes Re-Attach beim Neustart (bereits abgedeckt durch `restoreSessions()`).

#### Multi-Member-Approvals — Phasing (OD-3, entschieden)

Die Absicht ist richtig: Riskante Tool-Calls sollten von der Gruppe genehmigungsfähig sein, und qwen-code liefert den `MultiClientPermissionMediator` mit vier Policies (`permissionMediator.ts:348,621-637`). **Aber nichts davon ist vom Channel aus auf dem Phase-0-`AcpBridge`-Pfad erreichbar:**

1. **`qwen channel start` verdrahtet `AcpBridge`, dessen `requestPermission` jede Anfrage automatisch genehmigt** (`AcpBridge.ts:108-118`). Gar kein Approval-Prompt.
2. Der Mediator lebt in der HTTP-Serve-Schicht des Daemons. Die einzige permissions-fähige Channel-Bridge ist `DaemonChannelBridge` (`respondToPermission`, `:346-374`) — erreichbar, sobald Phase 1 das Channel-Hosting in den Daemon migriert (zugesagt, §1).
3. `config.approvalMode` ist ein **totes Feld** — geparst (`config-utils.ts:94`) und getypt (`types.ts:36`), aber von keinem Adapter oder Bridge gelesen.

**Entschiedenes Phasing:**

- **Phase 0:** keine Gruppen-Approvals. Risiko mit Sender-Allowlist + `requireMention` + einem konservativen Agenten-Toolset eindämmen. Nicht behaupten, dass `approvalMode` etwas bewirkt.
- **Phase 1:** Channel läuft auf dem Daemon-Bridge-Pfad (zugesagte Migration); `permission_request` als DingTalk-Card anzeigen; **`first-responder` mit einer einzigen Channel-Level-`clientId`** ausliefern (ein Tap eines erlaubten Mitglieds löst es auf; Attribution auf Channel-Granularität). Benötigt keine `senderId → clientId`-Map. **High-Risk-Tools bei proaktiven Turns automatisch ablehnen** (ein von `__cron__` stammender Turn kann einen Permission-Prompt nicht beantworten).
- **Phase 2:** Pro-Mitglied `consensus`/`designated` hinzufügen, sobald das `senderId → clientId`-Mapping und der `clientId`-Lifecycle (Reaping, Refcount-Bounds) existieren. Hinweis: Eine synthetische `clientId` pro `senderId` lässt die `clientIds`-Refcount-Map unbegrenzt wachsen und muss gereapt werden.

#### Zusammenfassung der konkreten Änderungen (Build Area 1)

| Änderung | Wo | Typ |
| ----------------------------------------------------------------------- | -------------------------------------------------------- | ------------- |
| Gruppenprofil setzt `sessionScope: 'thread'`                             | `settings.json` + `setChannelScope` (`start.ts:359-363`) | Config        |
| Fehlende DingTalk-`conversationId` als Fehler behandeln                        | `DingtalkAdapter.ts` ~`:534`                             | Code (S)      |
| `[senderName]`-Präfix für Gruppen-Turns                                   | `ChannelBase.handleInbound` ~`:316`                      | Code (S)      |
| Neues optionales `Envelope.alreadyPrefixed`-Feld                           | `types.ts` (Envelope)                                    | Code (S)      |
| `alreadyPrefixed` bei `collect`-Synthetic-Re-Entry setzen                   | `ChannelBase.ts:449-462`                                 | Code (S)      |
| `/clear confirm` + Allowlist-Gate in geteilten Gruppen; `/status` read-only | shared commands (`:147-217`)                             | Code (S)      |
| Gruppenprofil setzt `dispatchMode: 'followup'`                           | `groups["*"]` in `settings.json`                         | Config        |
| Veraltetes `dispatchMode` JSDoc auf `'steer'` korrigieren                              | `types.ts:42`                                            | Comment fix   |
| `/who`-Handoff-Befehl                                                  | `registerCommand` (`:141`)                               | Code (S)      |
| Daemon-Bridge-Migration ersetzt `AcpBridge`-Auto-Approve               | `DaemonChannelBridge`-Hosting (zugesagt)                | Phase 1 (L)   |
| Pro-Mitglied-Approval-Voting + DingTalk-Card                              | neue Bridge-Plumbing + `respondToPermission`              | Phase 1/2 (L) |
### 6.2 Proactive Engine: Scheduler + Outbound Push (DER KERN)

#### Entscheidung: Ein Gateway-eigener Scheduler, migrationsneutral

**Verwende einen Scheduler, der im Gateway-Prozess von `qwen channel start` läuft.** Das Gateway besitzt den `SessionRouter` (mit `restoreSessions()`-Recovery — `start.ts:275,444`), hält jede Adapter-Instanz und deren Bridge und ist der einzige Ort, an dem `ChannelBase.pushProactive()` (und das zugrunde liegende abstrakte `sendMessage()`, `:81`) aufgerufen werden kann. Der Agent (egal ob das gestartete `--acp`-Kind in Phase 0 oder die Daemon-Session in Phase 1+) bleibt ein reiner Prompt-Executor: Der Scheduler feuert, indem er in `ChannelBase.sessionQueues` einreiht, was `bridge.prompt()` erst dann aufruft, wenn der vorherige Turn abgeschlossen ist — **keine neue Bridge-Methode, kein Reverse Channel, keine Daemon-Push-Route.**

> **Topologie-Hinweis (festgeschriebene Architektur).** Der Scheduler ist **von Haus aus migrationsneutral**: Er serialisiert über `ChannelBase.sessionQueues`, unabhängig davon, welche Bridge darunterliegt. In Phase 0 steuert er `AcpBridge.prompt()` über stdio; in Phase 1+ steuert er `DaemonChannelBridge.prompt()` (daemon-gehostet). Da der `eventBus`-Audit und die FIFO-`promptQueue` des Daemons für die Phase 1+ Governance erforderlich sind, läuft der Channel ab Phase 1 unter `qwen serve` — aber die eigene Logik des Schedulers ändert sich an der Migrationsgrenze nicht.

Warum nicht die Alternativen:

- **In-`Session` Cron:** abgelehnt — `cronQueue`/`cronProcessing` leben in der In-Process-`Session` (`Session.ts:667-668`), feuern nur, während eine Session geöffnet ist, und sterben bei `dispose()` durch das 30-minütige Idle-Reaping (`:790-812`). Genau das ist der Fehler, den der Gateway-Scheduler vermeidet. **Und der Gateway-Scheduler ist der EINZIGE Cron-Owner (OD-8): Eine Tag-Session startet niemals ihren In-Session-Cron** (Gating-Mechanismus unten).
- **Standalone-Prozess:** abgelehnt — ein zweiter langlebiger Prozess, der DingTalk-Credentials dupliziert und den In-Process-`SessionRouter` sowie die bereits angehängte Bridge nicht wiederverwenden kann.

#### Komponenten und Platzierung

| Component                          | File                                                                        | Responsibility                                                                                                                                                                           |
| ---------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ChannelCronStore`                 | `packages/channels/base/src/ChannelCronStore.ts` (new)                      | Persistente Job-Tabelle, JSON-Pendant zu `sessions.json`. `atomicWriteJSON` (`atomicFileWrite.ts:385`) + dateiweise `async-mutex` `Mutex`.                                               |
| `ChannelCronScheduler`             | `packages/channels/base/src/ChannelCronScheduler.ts` (new)                  | Einzelner, jeweils neu gesetzter `setTimeout` (Timer-Wheel-of-One); nächster Fire über `nextFireTime`; Restart-Catch-up; 60s-Reconciler-Tick. Einer pro Gateway; einziger Cron-Owner.    |
| Cron primitives                    | `packages/core/src/utils/cronParser.ts` (reuse)                             | `parseCron`/`matches`/`nextFireTime` (`:104,141,168`). Nicht neu implementieren.                                                                                                         |
| `dispatchProactive`                | `ChannelBase.ts` (extend)                                                   | Fire über `sessionQueues` injizieren; auf `activePrompts.get(sessionId)?.done` eines laufenden Human-Turns warten; niemals `steer`; niemals `bridge.prompt()` aufrufen, während `activePrompts` gehalten wird. |
| `pushProactive`                    | `ChannelBase.ts` (extend; base default = `sendMessage`) + DingTalk override | Outbound-Zustellung; DingTalk-Overrides für Cold Groups. Gefiltert durch die `canColdSend`-Capability.                                                                                   |
| `canColdSend`                      | `ChannelBase` property (default `false`)                                    | Capability-Flag, das der Scheduler vor einem Cold-Send prüft; DingTalk schaltet auf `true`, sobald der Proactive-API-Pfad ausgeliefert wird; Feishu ist `true`.                          |
| DingTalk proactive send            | `packages/channels/dingtalk/src/proactive.ts` (new) + `DingtalkAdapter.ts`  | Proaktive Nachrichten-Broadcasts via `robotCode` + gespeicherte `openConversationId` (Vertrag unten VERIFIZIERT).                                                                        |
| Wiring                             | `start.ts` (extend `startSingle`/`startAll`)                                | Scheduler nach `router.restoreSessions()` (`:275,444`) konstruieren + starten; das `isTagSession`-Flag in die Session-Konstruktion einfädeln (OD-8).                                     |
| `/schedule` + `schedule_task` tool | `ChannelBase.handleInbound()` (extend, after gates `:240-252`)              | Zuerst deterministischer Befehl; danach Model-Tool.                                                                                                                                      |

#### `canColdSend` Capability-Flag (Fix #4)

Das plattformübergreifende MVP-Kriterium ("derselbe Job liefert auf DingTalk und Feishu aus") erfordert ein Capability-Flag, damit der Scheduler über Erreichbarkeit schlussfolgern kann, anstatt sie durch stilles Scheitern zu entdecken.

- **Deklariert als Property auf `ChannelBase`:** `protected readonly canColdSend: boolean = false;`. (In der Basisklasse platziert, nicht in einer separaten `ChannelPlugin`-Registry, da der Scheduler bereits die Adapter-Instanz hält und `pushProactive`/`sendMessage` Instanzmethoden sind — das Flag zusammen mit der Methode, die es schützt, zu platzieren, hält sie in einem Typ.)
- **DingTalk:** `canColdSend = false`, bis der Proactive-Send-Pfad (`proactive.ts`) ausgeliefert und eine nutzbare `openConversationId` persistiert ist; springt auf `true`, sobald `pushProactive` implementiert ist. Solange `false`, kann DingTalk weiterhin Warm- (Webhook-) Turns beantworten — `canColdSend` regelt nur die _Cold-Group_-Zustellung.
- **Feishu:** `canColdSend = true` (nativer Proactive-Send über `tenant_access_token`, `FeishuAdapter.ts:622-676`).
- **Scheduler schlägt laut fehl:** Bevor ein Fire ausgeliefert wird, prüft der Scheduler `adapter.canColdSend`. Wenn `false`, versucht er **nicht** `pushProactive`; er loggt einen für Operatoren sichtbaren Fehler, setzt `job.lastStatus='error'` + `lastError='adapter cannot cold-send'`, zeigt ihn in `/schedule list` an und erhöht (gemäß Richtlinie) `consecutiveFailures`. Er beendet sich niemals stillschweigend mit No-Op.

#### Disjunkte Cron-Stores + das OD-8-Gate (Fix #5)

Es gibt zwei Cron-Persistenzpfade, und **sie liegen auf disjunkten Dateisystempfaden**, sodass sie niemals dieselben Jobs lesen oder schreiben können:

- **Gateway-Store (neu):** `path.join(Storage.getGlobalQwenDir(), 'channels', 'cron.json')` — channel-global, auf derselben Ebene wie `sessionsPath()` (`start.ts:56-58`), im Besitz des Users, außerhalb des Working Trees.
- **Session-Store (bestehend):** Der pro-Session `Session`-Cron verwendet ein **pro-Projekt gehashtes** Verzeichnis `~/.qwen/tmp/<hash>/scheduled_tasks.json` (`cronTasksFile.ts:1-9`).

Da die Pfade disjunkt sind, kann ein persistenter Job nur dann doppelt feuern, wenn eine **Tag-Session zusätzlich zum Gateway-Scheduler auch ihren In-Session-`Session`-Cron ausführt**. **OD-8 verhindert dies:** Der Gateway-Scheduler ist der einzige Cron-Owner; eine channel-gehostete ("Tag") Session startet ihren In-Session-Cron **nicht**.

**Gating-Mechanismus — wie eine Session erfährt, dass sie eine Tag-Session ist.** Eine Tag-Session wird mit einem expliziten Flag konstruiert, das vom Channel-Host eingefädelt wird:

- Auf dem Phase-1+-Daemon-Pfad erhält `DaemonChannelSessionFactory` bereits ein strukturiertes Options-Objekt (`{ workspaceCwd, modelServiceId, sessionScope }`, `DaemonChannelBridge.ts:226-241`). Füge `isTagSession: true` zu diesem Objekt hinzu; die Daemon-`Session` liest es bei der Konstruktion und **überspringt `startCronScheduler()`** (die Aufrufstelle, die andernfalls `cronQueue` bewaffnen würde, `Session.ts:667-668`). Disposal räumt Cron bereits beim Reap auf (`:790-803`), sodass eine Tag-Session es einfach niemals bewaffnet.
- Auf dem Phase-0-`AcpBridge`-Pfad darf der Kind-Agent ebenfalls keinen In-Session-Cron für einen Tag-Workspace bewaffnen; fädele dasselbe Flag durch eine `--acp`-Spawn-Option ein (ein neues `AcpBridgeOptions`-Feld, das als Flag an `Config` weitergeleitet wird). Bis dieses Flag-Plumbing implementiert ist, registriert Phase 0 einfach keine In-Session-Cron-Jobs (der `/schedule`-Befehl zielt auf den Gateway-Store), sodass es nichts gibt, was doppelt feuern könnte.

Dies macht das verbleibende Risiko rein operativ: "Führe nicht beide Scheduler für dieselben Jobs aus" — und das Gate garantiert, dass eine Tag-Session niemals den zweiten startet.

#### Persistentes Store-Schema und Restart-Recovery

Das Schema entspricht `DurableCronTask` (`cronTasksFile.ts:19-26`: `id`/`cron`/`prompt`/`recurring`/`createdAt`/`lastFiredAt` — das Feld heißt `cron`, **nicht** `cronExpr`):

```ts
interface ChannelCronJob {
  id: string; // randomUUID()
  channelName: string;
  target: {
    // mirrors SessionRouter PersistedEntry (SessionRouter.ts:5-9)
    channelName: string;
    senderId: string; // "__cron__" for system jobs
    chatId: string; // DingTalk openConversationId — the DURABLE cold-group id
    threadId?: string;
  };
  cwd: string; // validated == bound workspace on load
  cron: string; // 5-field (parseCron) OR "@once:<epochMs>"
  prompt: string;
  label?: string;
  recurring: boolean;
  enabled: boolean;
  createdBy: string; // senderId; advisory under single-token model; carried into the fire's attribution
  createdAt: number;
  lastFiredAt: number | null;
  lastStatus?: 'ok' | 'error' | 'skipped';
  lastError?: string;
  consecutiveFailures: number; // auto-disable after N (e.g. 5)
}
```

Schreiben via `atomicWriteJSON` unter einer dateiweisen `async-mutex` `Mutex`. **Restart-Recovery** in `start.ts` _nach_ `router.restoreSessions()` (`:275`/`:444`):

1. `bridge.start()` → `restoreSessions()` lädt `sessions.json` und `bridge.loadSession()` pro Eintrag neu.
2. `store.load()`; Einträge verwerfen, deren `cwd !== boundWorkspace`.
3. `scheduler.start()`: Berechne `nextFireTime(job.cron, new Date())` für jeden aktivierten Job. **Missed-Fire-Policy (RFC-Entscheidung): Wiederkehrende Jobs, die während der Ausfallzeit überfällig sind, feuern einmal sofort und setzen dann fort — niemals ein Backlog abspielen** (eine Backlog-Flut in eine Live-Gruppe ist ein Spam-Vorfall). One-Shots in der Vergangenheit feuern einmal und werden dann gelöscht. `cronScheduler.ts` unterscheidet `{ kind: 'catch-up'; ids }` (wiederkehrend) von `{ kind: 'missed'; tasks }` (One-Shots, Confirm-First) bei `:81-89,608-707`; wir übernehmen Coalesce-to-One für wiederkehrende Jobs.
4. Einen einzelnen `setTimeout` auf den nächstgelegenen Job setzen; nach jedem Fire neu setzen. Füge einen 60s-Reconciler-Tick hinzu (Präzedenzfall: `lockProbeTimer`, `cronScheduler.ts:229,507-538`), der ab `Date.now()` neu berechnet, um Suspend/Resume-Clock-Skew zu absorbieren — niemals Intervalle akkumulieren.

#### Fire-Pfad: Injizieren in die SHARED Group-Session (Fix #1 — der große)

Die Invariante "ein aktiver Prompt pro Session" unterscheidet sich je nach Topologie, und v1s `dispatchProactive` hat es für den Daemon-Pfad falsch gemacht:

- **Phase 0 (`AcpBridge`):** `AcpBridge.prompt()` (`:147-180`) hat **keine eigene Concurrency-Guard**; die einzige Serialisierung erfolgt über `ChannelBase.sessionQueues`/`activePrompts` (`:29-35,394,466`) und die eigene ACP-Session des `--acp`-Kindprozesses.
- **Phase 1+ (`DaemonChannelBridge`):** `DaemonChannelBridge.prompt()` **wirft `Prompt already in flight`**, wenn `activePrompts.has(sessionId)` (`:257-261`) — es wird **nicht** gequeuet. Die FIFO-`promptQueue` (`bridge.ts:2855,3082`) liegt aufseiten der Daemon/ACP-Bridge, _hinter_ dieser In-Process-Throw-Guard. Der Aufruf von `DaemonChannelBridge.prompt()`, während ein Human-Turn aktiv ist, **wirft** daher, anstatt zu warten.

**Das Redesign (korrekt unter beiden Topologien): `bridge.prompt()` niemals aufrufen, während ein Turn läuft; auf der Channel-Ebene über `sessionQueues` serialisieren und zuerst auf `activePrompts` warten.** Da `sessionQueues` den Proactive-Lauf _nach_ der Auflösung des vorherigen Laufs anreiht, ist `activePrompts.get(sessionId)` zum Zeitpunkt des Aufrufs von `bridge.prompt()` leer — sodass auf dem Daemon-Pfad die Throw-Guard niemals ausgelöst wird und auf dem `AcpBridge`-Pfad die unbewachte `prompt()` ebenfalls niemals überlappt.
```ts
// ChannelBase.ts — verwendet private sessionQueues/activePrompts erneut (:29-35).
// Funktioniert identisch für AcpBridge (Phase 0) und DaemonChannelBridge (Phase 1+):
// Die Chain stellt sicher, dass bridge.prompt() erst ausgeführt wird, nachdem der vorherige Turn abgeschlossen ist,
// sodass der `Prompt already in flight`-Throw von DaemonChannelBridge (:257-261) nicht ausgelöst werden kann.
async dispatchProactive(sessionId: string, promptText: string): Promise<string> {
  const prev = this.sessionQueues.get(sessionId) ?? Promise.resolve();
  const run = prev.then(async () => {
    const active = this.activePrompts.get(sessionId);
    if (active) await active.done;            // Warte auf Abschluss eines Human-Turns — niemals steer-cancel (:371-379)
    return this.bridge.prompt(sessionId, promptText);   // Erst jetzt ist activePrompts leer
  });
  this.sessionQueues.set(sessionId, run.then(() => {}, () => {}));
  return run;
}
```

**Invariant: Ein Proactive-Turn kann niemals von einem späteren Human-Turn abgebrochen werden und bricht seinerseits niemals einen Human-Turn ab.** Durchsetzung, für beide Varianten dargestellt:

- **Kein Proactive→Human-Abbruch:** `dispatchProactive` ruft niemals `steer`/`cancelSession` auf. Es wartet lediglich per `await` auf `activePrompts.get(sessionId)?.done` und reiht sich dann dahinter ein.
- **Kein Human→Proactive-Abbruch:** Das Tag-Group-Profil ist **`followup` (niemals `steer`)** (§6.1). Da `steer` der einzige `dispatchMode` ist, der `bridge.cancelSession()` aufruft (`:371-379`), und Tag-Groups diesen niemals auswählen, kann ein eingehender Human-Turn nur _hinter_ einem laufenden Proactive-Turn via `sessionQueues` in die Kette eingereiht werden — er kann ihn nicht abbrechen. (Auf dem Daemon-Pfad wird `DaemonChannelBridge.cancelSession` (`:332`) nur aus dem `steer`-Branch erreicht, der für Tag-Groups ausgeschlossen ist.)
- **Throw-Guard wird nie ausgelöst:** Auf beiden Pfaden wird `bridge.prompt()` nur am Ende der `sessionQueues`-Chain aufgerufen, nachdem der vorherige Run aufgelöst wurde und (bei Human-Turns) `activePrompts` abgearbeitet sind — der Overlap-Throw von `DaemonChannelBridge` (`:257-261`) ist für Tag-Traffic daher strukturell unerreichbar.

Beim Auslösen (On fire):

1. **Shared Session auflösen** via `router.resolve(target.channelName, target.senderId, target.chatId, target.threadId, job.cwd)` (`SessionRouter.ts:72`). `'thread'` → eine `sessionId` für die gesamte Gruppe, sodass die Ausführung in dem Kontext landet, den Humans sehen. Falls die wiederhergestellte Session verworfen wurde, erzeugt und persistiert `resolve()` eine neue.
2. **Einreihen, nie unterbrechen** (Followup via `sessionQueues`). Absichtlich nicht `steer`.
3. **Marker + Zuordnung (Fix #7).** Prefix `[Scheduled task "<label>" set by <createdBy>]\n`. Die `createdBy`-Identität wird **im gequeueten Run mitgeführt** und nicht nachträglich per Zeitstempel hinzugefügt, sodass jeder Tool-Call/Permission, der während dieser Ausführung ausgelöst wird, _diesem_ Proactive-Turn zugeordnet wird (§6.4).
4. **Erfassen + Pushen.** `dispatchProactive` gibt den Completion-Text zurück; der Scheduler prüft `adapter.canColdSend` und ruft dann `channel.pushProactive(target.chatId, text)` auf (fail-loud, wenn `false`).

#### Cold-Group-Push auf DingTalk

**Verifizierte Einschränkung:** `DingtalkAdapter.sendMessage()` sendet nur über den pro `conversationId` gecachten `sessionWebhook` (`:84,134-142`), der nur bei Inbound befüllt wird (`:505-517`). Cold Group → Silent Return (`:137-141`).

**Fix — `pushProactive` über die DingTalk 主动消息 群发 API (Vertrag jetzt VERIFIZIERT, OD-7 gelöst).** Das Aufrufmuster ist im Repo ebenfalls bereits etabliert (`emotionApi` postet an `api.dingtalk.com/v1.0/robot/...` mit Header `x-acs-dingtalk-access-token` und Body `{ robotCode, openConversationId, ... }`, `:188-197`).

**Verifizierter Endpoint und Parameter** (siehe §6.5 für vollständige Quellnotizen; Konfidenz pro Punkt angegeben):

- **Endpoint:** `POST https://api.dingtalk.com/v1.0/robot/groupMessages/send` _(high verifiziert; offizielles Send-Doc + aliyun ask/559227)_.
- **`robotCode`** (REQUIRED, string): die Robot-ID aus der Installation des Robots in der Gruppe; derselbe Value-Space wie `appKey` für Enterprise-Internal-Robots → `config.clientId` verwenden (`:184,435`). Keine neuen Credentials. _(high verifiziert)_
- **`openConversationId`** (REQUIRED, string): die mit `cid` präfixierte Open-Conversation-ID der Zielgruppe; Fehlercodes `miss.openConversationId`/`invalid.openConversationId` bestätigen, dass sie erforderlich ist und validiert wird. In `ChannelCronJob.target.chatId` persistieren — stabil über Neustarts hinweg, im Gegensatz zu `sessionWebhook`. _(high verifiziert)_
- **`msgKey`** (REQUIRED, string): Message-Template-Key; **`'sampleMarkdown'`** für Markdown (`'sampleText'` für Plain Text). _(high verifiziert; Message-Type-Doc + aliyun ask/585232)_
- **`msgParam`** (REQUIRED, **ein JSON-kodierter _String_**, kein verschachteltes Objekt): für `sampleMarkdown` ist der String `"{\"title\":\"<preview title>\",\"text\":\"<markdown body, max ~5000 chars>\"}"`. _(high verifiziert; Markdown-Title/Text-Felder aus Message-Type-Doc, Text-Beispiel wortwörtlich aus aliyun ask/585232)_
- **`coolAppCode`** (OPTIONAL): nur wenn der Robot als Group Cool App (群聊酷应用) installiert ist; nicht erforderlich für einen einfachen Enterprise-Internal-App-Robot. _(medium verifiziert)_
- **`conversationId` == `openConversationId`?** Für den Standard-Group-@-Callback: **Behandle die Callback-`conversationId` (cid-präfixiert) als direkt verwendbare `openConversationId`** — bestätigt durch Community-Quellen + passendes `cid`-Format. **Markiert (Konfidenz medium):** Offizielle Docs enthalten keinen wortwörtlichen Satz, der sie für einen Standard-Robot (keine Cool-App) gleichsetzt. Der doc-garantierte Pfad ist die `chatId → openConversationId`-Conversion-API (oder das Erfassen aus der Group-Create-API / `chooseChat` JSAPI / einem Cool-App-Callback, der `openConversationId`+`coolAppCode` direkt liefert). **Fallback-Regel:** Wenn ein Send `invalid.openConversationId` zurückgibt, auf die `chatId → openConversationId`-Conversion-API zurückfallen.

```ts
const GROUP_SEND = 'https://api.dingtalk.com/v1.0/robot/groupMessages/send'; // high verifiziert

async pushProactive(chatId: string, text: string): Promise<void> {        // DingtalkAdapter override
  const token = await this.tokenManager.get();        // unabhängig vom SDK-Connect-Lifecycle refreshed
  const robotCode = this.config.clientId;
  if (!token || !robotCode) { /* einmal refreshen; sonst lastError setzen + return */ return; }
  for (const chunk of normalizeDingTalkMarkdown(text)) {  // Chunker wiederverwenden, WENN das Template-Length-Budget passt
    const msgParam = JSON.stringify({ title: extractTitle(text), text: chunk });  // msgParam ist ein STRING
    await sendGroupMessage({ token, robotCode, openConversationId: chatId,
      msgKey: 'sampleMarkdown', msgParam });            // bei invalid.openConversationId → via chatId-API konvertieren, retry
  }
}
```

`sendMessage()` wird zu: Zuerst den gecachten `sessionWebhook` versuchen (günstig, kein Token-Verbrauch); sonst auf `pushProactive()` zurückfallen. **Base-Default** `pushProactive = (chatId, text) => this.sendMessage(chatId, text)`, daher **benötigt Feishu kein Override** (`FeishuAdapter.sendMessage()` führt bereits Proactive-Sends an jede `chatId` mit einem stabilen `tenant_access_token` aus, `:622-676`; `canColdSend = true`). DingTalk ist der einzige abweichende Adapter — die DingTalk-First-Asymmetrie. Das `canColdSend`-Flag (oben) lässt die Engine bei einem rein reaktiven Adapter **fail loudly** ausführen, anstatt es stillschweigend zu verwerfen.

**Harte Deployment-Constraints (kein Code):** Der Org-Bot muss (a) ein veröffentlichter Enterprise-Internal-Bot sein, (b) die Proactive-Group-Message-Permission erhalten haben, (c) Mitglied der Zielgruppe sein (installiert via Group Cool App / Enterprise-Internal App / Third-Party App, mit seiner `robotCode`) _(high verifiziert, dass eine Permission aktiviert sein muss; high verifiziert, dass Bot-installed + robotCode Voraussetzungen sind)_, (d) seine `openConversationId` muss erfasst sein. Wir persistieren die `conversationId`, wenn der Bot _irgendeinen_ Inbound in einer Gruppe sieht, sodass "cold" = _idle_ bedeutet, nicht _nie-gesehen_; eine wirklich nie-gesehene Gruppe kann nicht gepusht werden, bis ihre `openConversationId` über die Conversion-API beschafft wurde (hartes Limit). **Erforderliche Adapter-Änderung:** Heute wird nur der `sessionWebhook` gecacht (`:516-517`); wir müssen auch die `conversationId` persistieren (empfohlener Store: eine separate `~/.qwen/channels/dingtalk-groups.json`, entkoppelt von der Session-Lebensdauer, sodass Cold Groups und Cron-ohne-Live-Session abbildbar sind).

> **WEITERHIN MARKIERT (low confidence) — gemäß OD-7 sichtbar lassen:** (1) Der **exakte Permission-Point-Code/Display-Name** für "proaktiv Gruppennachricht senden" in der DingTalk-App-权限管理-Konsole ist aus den Docs nicht exakt festgemacht — DingTalk zeigt es in der 权限管理 der App als Robot/Message-Sending-Permission (üblicherweise die Robot-Message-Familie, z. B. `qyapi_robot_sendmsg` / 企业机器人发送消息权限); in der Konsole bestätigen, den Code nicht hart asserten. (2) Der maßgebliche einzelne offizielle Satz, der die Callback-`conversationId` für einen Standard-Robot (keine Cool-App) mit `openConversationId` gleichsetzt, wurde in dieser Session nicht wortwörtlich gefunden — Shortcut mit hoher Wahrscheinlichkeit, aber der doc-garantierte Beschaffungspfad ist die `chatId → openConversationId`-Conversion-API. Die DingTalk-Open-Platform-Seiten sind JS-gerendert und konnten in dieser Session nicht vollständig gescraped werden; Endpoint/Params/Token-Fakten wurden über den Apifox-Doc-Mirror und Aliyun-Developer-Q&A, die die offiziellen Request-Beispiele zitieren, kreuzvalidiert.

#### Auth & Token-Lifecycle (verifiziert; das tragende Machbarkeitsrisiko)

**Auth-Header (high verifiziert).** Alle v1.0-Calls (einschließlich `groupMessages/send`) übergeben das Token im Request-Header `x-acs-dingtalk-access-token: <accessToken>` plus `Content-Type: application/json` — exakt derselbe Header, den `emotionApi()` (`:188-207`) und `downloadMedia()` (`media.ts:36-43`) bereits verwenden.

**Token-Beschaffung (high verifiziert).** Enterprise-Internal-App, v1.0-Style: `POST https://api.dingtalk.com/v1.0/oauth2/accessToken` mit JSON-Body `{"appKey":"<appKey>","appSecret":"<appSecret>"}` → `{ "accessToken": "...", "expireIn": 7200 }`. (Legacy-Äquivalent `GET https://oapi.dingtalk.com/gettoken?appkey=..&appsecret=..` gibt `{access_token, expires_in:7200}` zurück, aber dieses Legacy-Token ist für die alten `oapi`-Endpoints; für `api.dingtalk.com` v1.0-APIs wird das v1.0 `accessToken` im `x-acs-dingtalk-access-token`-Header verwendet.)

**Ablauf & Caching (high verifiziert).** Tokens laufen in **7200 s (~2 h)** ab und MÜSSEN nach Ablauf neu abgerufen werden; innerhalb des Gültigkeitsfensters geben wiederholte Abrufe dasselbe Token zurück und erneuern es. **Pro App cachen; den Token-Endpoint nicht bei jedem Request aufrufen** (häufige Calls werden throttled).

**Warum dies das tragende Risiko ist.** Das Stream SDK holt `access_token` **einmalig zur Connect-Zeit** via `GET .../gettoken` innerhalb von `getEndpoint()` (`client.mjs:85-87`) und **refreshed es nie**; `getAccessToken()` gibt den gecachten Wert zurück (`DingtalkAdapter.ts:172-174`). `autoReconnect` holt es nur bei Socket-_Close_ neu (`client.mjs:157-163`) — ein stabiler, langlebiger Socket hält ein abgelaufenes Token über die ~2-h-TTL hinaus, und jeder Proactive-Send (sowie die bestehenden Emotion/Media-Pfade) schlägt stillschweigend fehl, sobald es abläuft. **Das Proactive-Feature muss das Token-Refresh selbst übernehmen:** ein `tokenManager`, der über einen Timer (vor dem ~2-h-Ablauf) und/oder bei einer 401 via v1.0 `oauth2/accessToken`-Endpoint abruft und pro App unabhängig vom SDK-Connect-Lifecycle cacht (OD-7). Dies ist der wahrscheinlichste "funktioniert in der Demo, stirbt nach 2 Stunden"-Fehler.

**Rate Limits (verifiziert, gemischte Konfidenz — markiert lassen):** (1) Pro-App-Server-API-Concurrency ~20 QPS auf DingTalk Standard, mit einem monatlichen Open-API-Quota ~10.000/Monat (Professional ~500k, Dedicated ~5M) _(medium-high)_. (2) Ein häufig zitiertes Limit von **20 Nachrichten/Minute → ~10-min-Throttle** pro Robot ist für **Custom-Group-Webhook-Robots** dokumentiert; es wird oft als praktischer Leitfaden für den Orgapp-Robot-Send-Pfad angewendet, wurde aber in dieser Session auf der `groupMessages/send`-Seite **nicht** explizit bestätigt — **den exakten 20/min-Wert für `groupMessages/send` als low/medium confidence behandeln.** Außerdem: den Token-Endpoint nicht übermäßig aufrufen (separate Throttle). Der Scheduler muss seine eigenen Sends konservativ rate-limiten und bei Throttle-Responses zurückfallen.

#### Standing Instructions (NL-Recurring-Asks → Store → Consume)

Zwei-Erfassungsstufen in `handleInbound()` nach Bestehen der Gates (`:240-252`): ein expliziter **`/schedule "0 9 * * 1-5" post the open PR list`**-Befehl (geparst mit `parseCron`, kein Model-Roundtrip) und ein Phase-2-Model-Tool `schedule_task(cron, prompt, recurring, label)`. Beide rufen `store.add({...})` auf → persistieren → `scheduler.reschedule(job)`, dann In-Channel antworten. `/schedule list|cancel <id>|disable <id>` liest/schreibt den Store. **Persist fail-closed:** `/schedule`-Ack verweigern, wenn der Write throwt.
#### Fehlermodi

- **Gateway bei der Ausführung nicht verfügbar:** Die Wiederherstellung fasst überfällige wiederkehrende Ausführungen zu einem Nachholvorgang zusammen; vergangene Einmal-Ausführungen werden einmalig ausgeführt und dann gelöscht.
- **Agent-Absturz während der Ausführung:** `bridge.prompt()` wird abgelehnt; `attachDisconnectHandler` (`start.ts:241,403`) erzeugt neu (Phase 0) / der Daemon verbindet sich erneut (Phase 1+). Der Scheduler setzt `lastError`, stempelt bei wiederkehrenden Aufgaben nicht `lastFiredAt` → wird wiederholt. Mindestens einmal; minutengerundeter Ausführungs-Schlüssel + `lastFiredAt` dedupliziert.
- **Session bereinigt / `loadSession` schlägt fehl:** `resolve()` erstellt eine neue (Gruppen-Transkript geht verloren; ständige Anweisungen müssen in sich geschlossen sein). Der Channel-Speicher (§6.3) ist die Basis für die Wiederherstellung.
- **Adapter kann keine Cold-Sends durchführen (`canColdSend=false`):** Der Scheduler protokolliert + zeichnet `lastError` auf, sichtbar in `/schedule list`; niemals stillschweigend.
- **Cold-Group-Push an entfernte Gruppe oder Gruppe mit entzogenen Rechten:** non-2xx → `lastError`; `invalid.openConversationId` → Versuch einer `chatId → openConversationId`-Konvertierung + einmaliger Retry.
- **Token abgelaufen:** `tokenManager` aktualisiert einmalig + Backoff; `consecutiveFailures` ≥ N → automatische Deaktivierung mit einem für den Operator sichtbaren Eintrag.
- **Zwei Gateways in einem Workspace:** `checkDuplicateInstance()` (`start.ts:170-179`) sichert die Single-Instance ab; zusätzlich wird ein Lock-Token in `cron.json` gespeichert.

### 6.3 Channel-spezifischer Speicher & Learning (Build Area 3)

Ein Tag muss sich _über die Zeit an die Gruppe erinnern_, ohne in eine Schwestergruppe durchzusickern. Der Speicher von qwen-code ist heute **workspace-global**: es gibt keine Chat/Channel/Gruppe/Session-Achse.

> **Topologie- / Abhängigkeitsfakten (Fix #3).** Zwei harte Einschränkungen bestimmen die Verkabelung: (1) In der Standard-Topologie von `AcpBridge` gibt es **keinen `qwen serve` Daemon und keine `POST /workspace/memory`-Route** — der `--acp`-Child-Prozess hat keinen HTTP-Client; selbst nach der Phase-1+-Daemon-Migration ist die Memory-Route **nur für den Daemon und strict-auth** (`deps.mutate({ strict: true })`, `workspace-memory.ts:114`). (2) `@qwen-code/channel-base` hängt nur von `@agentclientprotocol/sdk` ab (`packages/channels/base/package.json`), **nicht** von `@qwen-code/qwen-code-core`, daher **kann** `ChannelBase` **nicht** `import { writeWorkspaceContextFile }` nutzen. Das korrigierte Design schreibt/lies daher den Channel-Speicher **in-process über den Core-Helper, der von `channel-base` über Callbacks erreicht wird, die von der CLI-Schicht injiziert werden** (`packages/cli`, das von core abhängen _kann_) — nicht über HTTP und nicht durch Hinzufügen einer Core-Abhängigkeit zu `channel-base`.

#### Aktueller Stand: zwei Scopes, keiner pro Konversation

`POST /workspace/memory` akzeptiert nur `scope: 'workspace' | 'global'` (`workspace-memory.ts:118-125`), aufgelöst über `resolveContextFilePath()` (`writeContextFile.ts:223-240`): `workspace → <root>/QWEN.md`, `global → ~/.qwen/QWEN.md`. Der Append-Modus wird unter `## Qwen Added Memories` gefaltet (`MEMORY_SECTION_HEADER`, `const.ts:29`); eine dateibasierte Mutex mit 30s-Deadline serialisiert die Schreibvorgänge (`writeContextFile.ts:48-57,159-162`); der Writer lehnt beim Anhängen eine vorhandene Datei > 16 MB ab (`MAX_EXISTING_FILE_BYTES`, `:255`). Die Route ist **strict-auth** (`deps.mutate({ strict: true })`, `:114`) — sie lehnt sogar auf Loopback ohne Token ab. Konsequenz: Jede Gruppe in einem Workspace teilt sich eine `QWEN.md`.

#### Design: Ein Channel-Memory-Scope mit dem Key `(channelName, chatId)`

Die Isolierungseinheit ist das **Routing-Ziel**, nicht die Session (Sessions werden bei Inaktivität bereinigt, `DEFAULT_SESSION_IDLE_TIMEOUT_MS` 30 Min., `run-qwen-serve.ts:94`). Der Key existiert bereits: `SessionTarget { channelName, senderId, chatId, threadId }` (`types.ts:88-93`). Für den Gruppen-Speicher wird als Key `(channelName, chatId)` verwendet.

**Speicherlayout** spiegelt den bestehenden `~/.qwen/channels/`-Baum wider:

```
~/.qwen/channels/
  sessions.json
  memory/
    <channelName>/                  # sanitize: reject /, .., NUL
      <hash(chatId)>/               # sha256(chatId).slice(0,16) — path-safe, no collision/escape
        QWEN.md                     # group-scoped "learning over time"
        meta.json                   # { channelName, chatId, displayName?, createdAt, lastWriteAt }
```

Der Dateiname berücksichtigt `getCurrentGeminiMdFilename()` (`const.ts:49`). Dies hält den Channel-Speicher aus dem Working Tree, aus dem gebundenen Workspace und vom hierarchischen `QWEN.md`-Discovery-Pfad fern (sodass er niemals zwischen Gruppen durchsickert).

#### Write-Pfad (den Core-Helper erweitern, nicht forken)

In `packages/core/src/memory/writeContextFile.ts`:

- `WriteContextFileScope` (`:80`) von `'workspace' | 'global'` um `'channel'` erweitern.
- `WriteContextFileOptions` (`:83-97`) um `channelKey?: { channelName: string; chatId: string }` erweitern; validieren, dass es vorhanden ist, wenn `scope === 'channel'` (Spiegelung des `:142-146` Absolute-Path-Guards). `projectRoot` bleibt vom Interface erforderlich — `config.cwd` übergeben, auch wenn es für den Channel-Scope nicht verwendet wird.
- In `resolveContextFilePath()` (`:223-240`) einen `channel`-Branch hinzufügen, der `path.join(Storage.getGlobalQwenDir(), 'channels', 'memory', sanitize(channelName), hash(chatId), getCurrentGeminiMdFilename())` zurückgibt. **Die aktuelle Signatur der Funktion ist `(scope, projectRoot)` — sie muss um einen `channelKey`-Param erweitert werden** (private Funktion, lokale Änderung). Die dateibasierte Mutex keyed auf den aufgelösten Pfad, sodass zwei Gruppen gleichzeitig ohne Konflikte schreiben können.

**Die genaue `ChannelBaseOptions`-Änderung + wer sie injiziert (Fix #3).** `channel-base` kann core nicht importieren, daher stellt die CLI-Schicht Read/Write als Callbacks bereit. Das Options-Bag erweitern (`ChannelBase.ts:9-12` — das heutige echte Interface ist nur `{ router?: SessionRouter; proxy?: string }`; `config` und `bridge` sind **positionale Constructor-Args** bei `:40-46`, keine Bag-Member). Das Bag enthält bereits `router`:

```ts
// packages/channels/base/src/ChannelBase.ts — ChannelBaseOptions (NO new core dependency)
export interface ChannelBaseOptions {
  // ...existing members today: router?: SessionRouter; proxy?: string
  /** Read this channel's distilled memory; null if none yet. Injected by the CLI layer. */
  readChannelMemory?: (target: SessionTarget) => Promise<string | null>;
  /** Append/replace this channel's memory. Injected by the CLI layer. */
  writeChannelMemory?: (
    target: SessionTarget,
    content: string,
    mode: 'append' | 'replace',
  ) => Promise<void>;
}
```

**Wer sie konstruiert und injiziert:** `packages/cli/src/commands/channel/start.ts` (das von core abhängt). Wenn `start.ts` das Options-Bag für jeden Adapter erstellt, schließt es über cores `writeWorkspaceContextFile`/den Read-Helper und löst das server-vertrauenswürdige `(channelName, chatId)` über `router.getTarget(sessionId)` (`SessionRouter.ts:94`) auf — der Adapter liefert `chatId` niemals aus dem Wire:

```ts
// packages/cli/src/commands/channel/start.ts — CLI layer (CAN depend on core)
import {
  writeWorkspaceContextFile,
  readChannelContextFile,
} from '@qwen-code/qwen-code-core';

const baseOpts: ChannelBaseOptions = {
  router, // config & bridge are positional args of createChannel(name, config, bridge, baseOpts) — not bag members
  readChannelMemory: (target) =>
    readChannelContextFile({
      channelKey: { channelName: target.channelName, chatId: target.chatId },
    }),
  writeChannelMemory: (target, content, mode) =>
    writeWorkspaceContextFile({
      scope: 'channel',
      channelKey: { channelName: target.channelName, chatId: target.chatId },
      mode,
      content,
      projectRoot: config.cwd, // projectRoot unused for channel scope but required by the interface
    }),
};
// adapter is created positionally with the bag last: plugin.createChannel(name, config, bridge, baseOpts)
```

Der Adapter fasst niemals das Dateisystem an und `channel-base` erhält keine neue Abhängigkeit. (Phase-2-Daemon-Alternative: eine gescopete `POST /channel/:sessionId/memory`-Route, die `channelKey` serverseitig auflöst; sie kann `POST /workspace/memory` nicht wiederverwenden, da diese `scope ∈ {workspace, global}` hart validiert und ein festes `projectRoot` weiterleitet, `:118-125,185-190`. Verschieben, bis die Proactive-Engine bereits daemon-seitige `sessionId → target`-Lookups benötigt.)

**Event-Fan-out.** `publishWorkspaceEvent` befindet sich auf der **Daemon-seitigen** `AcpSessionBridge` (`bridge.ts:3610`), nicht auf der Channel-Seite. Unter `AcpBridge` (Phase 0) gibt es **kein** `memory_changed`-Event (und es wird auch keines benötigt — ein Prozess besitzt Write und Read). Unter der Daemon-Topologie fächert `publishWorkspaceEvent` wahllos an **jeden** aktiven Session-Bus auf (`bridge.ts:3649-3675`); `BridgeEvent.data` ist frei formatiert (`eventBus.ts:51`), sodass ein `memory_changed`-Event `{ scope:'channel', channelName, chatId }` tragen _kann_, aber **Subscriber-seitige Filterung** ist erforderlich — der Publisher kann die Zustellung nicht scopén.

#### Read-Pfad (Speicher → Prompt) — einmal-pro-Session-Bootstrap unter Wiederverwendung von `instructedSessions`

Den einmal-pro-Session `instructions`-Block erweitern (`ChannelBase.ts:343-347`, gated durch `instructedSessions`): Bei der ersten Nachricht einer Session, deren Ziel `(channelName, chatId)` hat, das injizierte `readChannelMemory(target)` aufrufen und dessen Ergebnis zusammen mit `config.instructions` voranstellen, dann die Session wie bisher in `instructedSessions` markieren. Da der `'thread'`-Scope eine einzige `sessionId` teilt, lädt dies den Speicher **einmal pro Session-Lebensdauer** (dasselbe Gate, das bereits die erneute Injektion von `config.instructions` verhindert). Es wird keine Core-Abhängigkeit hinzugefügt — der Read läuft über den injizierten Callback. Der Channel-Speicher befindet sich **niemals** auf dem hierarchischen Discovery-Pfad; er wird pro Session durch diesen Hook injiziert.

```ts
// ChannelBase.handleInbound() — first-turn bootstrap (reuses instructedSessions)
if (!this.instructedSessions.has(sessionId)) {
  const parts: string[] = [];
  if (this.options.readChannelMemory) {
    const mem = await this.options.readChannelMemory(target); // target from router.getTarget(sessionId)
    if (mem) parts.push(mem);
  }
  if (config.instructions) parts.push(config.instructions);
  if (parts.length) promptText = `${parts.join('\n\n')}\n\n${promptText}`;
  this.instructedSessions.add(sessionId);
}
```

#### Beziehung zu SessionRouter Persist/Restore und dem Transkript

| Schicht | Persistiert | Lebensdauer | Owner |
| ------------------------ | --------------------------------------------------- | ------------------------------------------ | --------------------------------- |
| Session-Transkript | ACP-Konversationsturns | Bis zur Bereinigung / `/clear confirm` / Neustart | `Session` (der Agent) |
| `SessionRouter`-Persist | `key → { sessionId, target, cwd }` (`:5-9,224-244`) | Über Bridge-Neustart hinweg, via `loadSession()` | `SessionRouter` (`sessions.json`) |
| **Channel-Speicher (neu)** | Destillierte dauerhafte Fakten über die Gruppe | Unbegrenzt | `~/.qwen/channels/memory/` |

Wenn `restoreSessions()` beim Neuladen einer Session fehlschlägt (`:196`), geht das Transkript verloren, aber die Gruppen-`QWEN.md` bleibt intakt — der Bootstrap-Read rehydriert das Wissen des Agents bei der nächsten Nachricht. **Der Channel-Speicher ist die Basis für die Wiederherstellung des Transkripts.** "Learning over time" ist eine _Distillations_-Schleife, keine rohe Transkript-Persistenz: Der Agent (oder ein getrigerter Job) fasst regelmäßig wichtige Fakten im Append-Modus in der Gruppen-`QWEN.md` zusammen.

#### Isolierung, Größe und Phasen

Die Isolierung gilt auf Pfad-Ebene (`sales` und `eng` lösen sich in unterschiedliche `hash(chatId)`-Verzeichnisse/Dateien/Mutexes auf), solange der Write-Pfad immer die server-vertrauenswürdige `chatId` mitführt. Dies ist eine **Inhalts**-Isolierung, keine Auth-Grenze (der Prozess hat weiterhin ein einziges globales Token, keine Benutzeridentität). Für eine harte Tenant-Isolierung einen Prozess pro Workspace/Tenant ausführen (OD-2).

Größen-Leitplanken (Wiederverwendung bestehender Mechanismen): Die 16-MB-Begrenzung für bestehende Dateien beim Anhängen wird kostenlos geerbt (`WorkspaceMemoryFileTooLargeError` auf ein für den Benutzer sichtbares "Gruppenspeicher ist voll, Compaction-Durchgang ausführen" mappen); eine Phase-2-Route verwendet die 1-MB-Begrenzung pro Schreibvorgang wieder (`MAX_MEMORY_CONTENT_BYTES`, `workspace-memory.ts:79`); die Replace-Modus-Compaction (`writeContextFile.ts:202-211`) ist die langfristige Antwort auf unbegrenztes Wachstum.

- **Phase 0/1:** Den `channel`-Scope + `channelKey` zu `writeContextFile.ts` hinzufügen; `~/.qwen/channels/memory/` + `meta.json` ausliefern; die CLI-Schicht-`readChannelMemory`/`writeChannelMemory`-Callbacks über `ChannelBaseOptions` und den obigen Bootstrap-Read verdrahten. Keine neue HTTP-Route, keine `channel-base → core`-Abhängigkeit.
- **Phase 2:** Die gescopete `POST /channel/:sessionId/memory`-Route (Daemon-Topologie) und `memory_changed` mit Subscriber-seitiger Filterung hinzufügen; einen Distillations-Trigger und eine `qwen channel memory <name> <chatId>`-CLI hinzufügen. **Distillations-Einschränkung:** Cron ist Session-gescopet und stirbt bei `dispose()` (`Session.ts:791,799-803,1056`); die Distillation muss feuern, während eine Session aktiv ist — bei Turn-Abschluss, bei einem expliziten `/remember` oder bei einer warmgehaltenen Session — niemals von einem unabhängigen Hintergrund-Scheduler.
### 6.4 Governance: Token Budgets & Audit Log (Build Area 4)

Ein Channel-resident Agent, der von jedem Mitglied gesteuert werden kann – und der proaktiv handeln kann –, benötigt Ausgabelimits, einen Audit-Trail, der aufzeichnet, _wer_ _was_ angefragt hat, und eine Isolierung pro Identität. qwen-code liefert drei der vier Primitiven: `rate-limit.ts` (Token Buckets pro Key), den `permission-audit.ts` Ring und `MultiClientPermissionMediator`. Dieser Bereich komponiert sie und schließt die Lücken (kein Kosten-Budget vorhanden; keine Audit-Zeile enthält einen menschlichen Absender). Leitprinzip: **ablehnen, nicht abschneiden** – aber gemäß Fix #6 lehnt ein _geschätztes_ Budget einen User-Prompt niemals hart ab; es gibt nur eine WARNung.

#### Welcher Prozess ist für die Governance zuständig?

| Deployment | Bridge | Welche `serve/`-Mechanik ist verfügbar |
| --- | --- | --- |
| **Phase 0 — `qwen channel start` / `AcpBridge`** | startet einen eigenen `--acp` stdio-Child-Prozess (`start.ts:213,356`) | **Keine.** Kein Express-Server, kein `rate-limit.ts`, keine HTTP-Routen, kein `permission-audit.ts`-Ring. |
| **Phase 1+ — `qwen serve` + `DaemonChannelBridge`** | Channels im Daemon gehostet | Alles aus `serve/`: echte Nutzung, Mediator, Rate-Limit, Audit-Ring, Routen. |

Lösung: **Budget-Zulassung + Ablehnung leben in `@qwen-code/channel-base`** (dem gemeinsamen Engpass `ChannelBase.handleInbound()`), in einer neuen **`packages/channels/base/src/BudgetLedger.ts`** – _nicht_ `serve/budget.ts`, da der Phase-0-Channel-Prozess `serve/` nie lädt und die Channel-Schicht der einzige Ort mit menschlichem Absenderkontext ist. **Audit + Attribution** entstehen ebenfalls in der Channel-Schicht. Auf dem Phase-1+-Daemon-Pfad liest das Ledger die echte Nutzung und wird _zusätzlich_ über eine Route bereitgestellt; auf dem Phase-0-Pfad schätzt es und wird über einen Channel-Befehl (`/audit`) offengelegt.

#### Wo Governance heute ansetzt (und die Lücken)

| Anliegen | Bestehender Mechanismus | Lücke |
| --- | --- | --- |
| Request-Rate-Throttling | Token Buckets pro `(clientId\|ip)`, 3 Stufen (`rate-limit.ts`) | Keine Tokens/Kosten, nur Request-Anzahl; nur `serve/` |
| Nachträgliche Decision-Log | Begrenzter FIFO-Ring, 5 Record-Typen (`permission-audit.ts`) | Keine menschliche `senderId`, nur `clientId`; keine GET-Route; Ring wird in Closure gehalten (`:17-25`) |
| Echte Freigabe pro Aktion | Vier Richtlinien + Konsens-Quorum (`permissionMediator.ts:621-637`) | Votes werden `clientId` zugeordnet, nicht dem Menschen; ein Channel = ein Client |
| Tool-/Daten-Scope pro Channel | `coreTools`/`allowedTools`/`excludeTools` (`config.ts:727-729`); `getPermissionsAllow()` (`:3158`); `getPermissionsDeny()` (`:3182`); MCP-Allow-Filter (`:3327-3333`) | Scope ist pro `Config`/Prozess; kein Spawn-Arg-Pfad in das `--acp`-Child |

Zwei strukturelle Fakten: (1) **Der Daemon hat keine menschliche Identität** (`BridgeEvent.originatorClientId`, jede `PermissionVote.clientId` sind Transport-IDs; `senderName` überlebt nur bis `SenderGate.check()`), daher muss jede Korrelation Mensch↦`clientId`↦`sessionId` an der Channel-Grenze hergestellt werden; (2) **Auth und Rate-Limit sind daemon-global** (einzelner Bearer-Token `auth.ts:259-266`; Rate-Limit keyt `(clientId, ip)`), daher muss die Governance pro Channel im Adapter entstehen.

#### Token- & Kosten-Budgets — ein neues `BudgetLedger`, beratend bis echte Nutzung existiert (Fix #6)

**Woher die Nutzung kommt — Einschränkung (OD-9).** Ein Token-Budget kann nur _echte_ Zahlen abbuchen, sobald das Modell die Nutzung meldet. In-Session speichert `Session.#recordPromptTokenCount()` (`Session.ts:2078-2087`) `usageMetadata.promptTokenCount` in `lastPromptTokenCount`, **bei jedem Turn überschrieben** – _kein_ kumulatives Abrechnungs-Meter. Auf dem Phase-0-`AcpBridge`-Pfad enthält der ACP-`session/update`-Stream keine `usageMetadata`, daher **kann v1 dort keine echten Token-Zahlen abbuchen**. Auf dem Phase-1+-Daemon-Pfad beobachtet der Daemon die Nutzung im Prozess und _kann_ präzise abbuchen.

**Durchsetzungsregel (Fix #6 — tragend):**

- **Geschätzte Budgets sind NUR BERATEND.** Wenn die einzige verfügbare Zahl eine Schätzung auf Channel-Seite ist (Prompt+Response-Zeichenanzahl ÷ eine Zeichen-pro-Token-Konstante), **warnt/alertiert** das Ledger bei Schwellenwerten und kann eine Warnung an die Antwort anhängen – es **lehnt einen User-Prompt niemals hart ab**. Eine falsch-positive Schätzung darf eine echte User-Anfrage nicht unterdrücken.
- **HART-Ablehnung nur bei echten Zahlen.** Ein Budget darf einen Prompt _ablehnen_ (ablehnen-nicht-abschneiden) **nur**, wenn die Abbuchungsquelle der echte Daemon-Nutzungspfad ist (Phase-1+ daemon-gehostet). Bis dahin ist das Budget Observability + Alerting, kein Gate.

Das macht das v1-Budget ehrlich: es warnt überall frühzeitig und setzt harte Limits genau dort durch, wo die Zahlen vertrauenswürdig sind.

**Modul `BudgetLedger.ts`**, modelliert nach `rate-limit.ts` (Factory, Map-of-Buckets mit GC, Overflow Fail-Open):

```ts
export type BudgetUnit = 'tokens' | 'usd'; // 'usd' = tokens × per-model rate
export type UsageSource = 'estimate' | 'daemon'; // 'estimate' => advisory; 'daemon' => may hard-decline
export interface BudgetLedger {
  // allowed=false only when source==='daemon'; estimates return allowed=true + warn flags
  admit(key: string): {
    allowed: boolean;
    spent: number;
    limit: number;
    advisory: boolean;
  };
  debit(
    key: string,
    amount: number,
    unit: BudgetUnit,
    source: UsageSource,
  ): void; // fires threshold alerts
  snapshot(): Record<
    string,
    { spent: number; limit: number; ratio: number; source: UsageSource }
  >;
  reset(): void;
  dispose(): void;
}
```

- **Default-Inherit-Semantik + Strictest-Wins-Org-Rollup (OD-9).** `admit(key)` löst das effektive Fenster mit dem `GroupGate`-artigen `channel → '*' → built-in`-Fallback auf. Ein Prompt muss **sowohl** das pro-Channel-Fenster als auch das **pro-Prozess-"Org"-Rollup** bestehen (strictest-wins, beide abbuchen). "Org" = _das Rollup dieses einzelnen Prozesses_; ein echtes prozessübergreifendes Org-Cap benötigt einen Shared Store (außerhalb des Scope). **Festes tägliches Fenster.**
- **75%/95%-Alerts.** `debit()` feuert `onAlert` einmal pro Schwellenwert pro Fenster, unter Verwendung des Event-Bus-Hysterese-Idioms (`WARN_THRESHOLD_RATIO`/`WARN_RESET_RATIO`, `eventBus.ts:101-103`). **Das Posten des Alerts ist ein proaktiver Send** – eine harte Abhängigkeit von Build Area 2 (DingTalk Cold-Group-Einschränkung; Feishu postet frei). Degradieren zu "Warnung an die nächste Antwort anhängen", wenn kein proaktiver Channel existiert.
- **Decline-not-truncate (nur wenn `source==='daemon'`).** Geprüft bei der Zulassung, _vor_ `bridge.prompt()` (`:425`). Bei echter Nutzung `!allowed` ruft der Adapter `sendMessage(chatId, refusal)` auf und kehrt zurück – er betritt **nicht** den Steer/Cancel-Pfad, sodass ein laufender Prompt abgeschlossen wird und der _nächste_ abgelehnt wird. Bei einer Schätzung ist `allowed` immer true (beratend).
- **Kosten (`usd`)** multiplizieren Tokens mit einer vom Operator bereitgestellten Pro-Modell-Rate-Tabelle (qwen-code ist Multi-Modell; kein einzelner Preis). Fehlender Eintrag → Fallback auf `tokens` + einmalige Warnung.
- **Config.** `ChannelConfig` (`types.ts:27-51`) erhält `budget?: { unit; limit; windowMs; reset? }`, geparst von `parseChannelConfig`. Auf dem Daemon-Pfad erhält `ServeOptions` `--budget-org-daily`/`--budget-unit`, und `daemon-status.ts` (das bereits `rateLimit` meldet, `:295-297`) erhält einen parallelen `budget`-Block.

#### Audit-Log – menschliche `senderId` wird mit dem Turn mitgeführt (Fix #7)

`PermissionAuditRing` (`permission-audit.ts:128-172`, FIFO 512) ist das richtige Substrat, aber jede Zeile ist `clientId`-gekeyt. **Design – eine Sender↦Turn-Bindung auf der Channel-Seite** (`RequestAttributionRing.ts`, gleiche FIFO-Form).

**Der naive Timestamp-Join ist bei `followup` falsch (Fix #7).** v1 schlug vor, eine Permission-Zeile mit "der aktuellsten Attributions-Zeile für diese `sessionId`, deren `recordedAtMs` vor dem `issuedAtMs` der Permission liegt", zu joinen. Bei `followup` reihen sich mehrere Sender über `sessionQueues` in **eine** `sessionId` ein; der zuletzt _eingereihte_ Sender ist häufig **nicht** derjenige, dessen Turn _ausgeführt_ wird, wenn der Tool-Call/die Permission feuert. Der Timestamp-Join attribuiert daher systematisch falsch.

**Fix: `senderId` MIT dem gequeueten Prompt mitführen.** Wenn `handleInbound()` in `sessionQueues` einreiht (und wenn der Scheduler einen proaktiven Fire einreiht), trägt das Queue-Item / der synthetische Turn-Kontext sein eigenes `{ senderId, senderName, requestSeq }`. Die Attribution für jeden Tool-Call/jede Permission, die während eines Turns ausgelöst wird, wird aus **dem aktuell ausgeführten Turn** (dem Kopf des FIFO) gelesen, nicht aus einem Timestamp-Scan. Konkret: Die `sessionQueues`-Chain stempelt ein pro-Turn `currentTurnAttribution.set(sessionId, {senderId, ...})` in dem Moment, in dem der Run den Kopf erreicht (kurz vor `bridge.prompt()`), und löscht es, wenn der Run auflöst; Audit-Zeilen lesen diese Map. Proaktive Fires stempeln `createdBy` auf die gleiche Weise (§6.2 Schritt 3). Dies ist exakt für den ausgeführten Turn und immun gegen die Einreihungsreihenfolge.

Füge bei der Zulassung einen sechsten Zeilentyp **`task.requested { sessionId, senderId, channelName, chatId, promptDigest, requestedAtMs }`** hinzu, damit das Audit die Frage "wer hat diese Aufgabe gestartet" auch für Read-Only-Arbeit beantwortet. Die `PermissionAuditEntry`-Union (`:57-104`) ist **geschlossen** und Consumer switchen auf `kind`, daher berührt eine Erweiterung (oder das Hinzufügen eines Sibling-Rings) jeden Consumer.

**Query-Pfad.** Phase-1+-Daemon: `GET /workspace/audit` hinzufügen (Bearer + `createMutationGate` strict, `auth.ts:356`), wobei der Ring aus der Bridge-Closure bereitgestellt wird (die Header-Doc der Datei sieht dies vor, `:22-25`). Phase-0-`AcpBridge`: ein `/audit`-Channel-Befehl via `sendMessage`. **Haltbarkeit:** Der Ring besteht aus 512 In-Memory-Einträgen, **bei Neustart verloren** – eine bekannte v1-Einschränkung; der Follow-up (OD-11) persistiert ein **Append-Only-Joined-Audit nach `~/.qwen`**.

**Konsens-Wähler sind keine Menschen.** `votersAtIssue` sind vom Daemon gestempelte `clientId`s, und ein Channel = eine `clientId`, daher ist "Konsens" out-of-the-box in einer DingTalk-Gruppe ein Konsens unter _Daemon-Clients_. Voting auf menschlicher Ebene benötigt ein Registered-Approver-Roster, das `senderId` → eine eindeutige Vote mappt – die OD-3-Phase-2-Anforderung, kein gelöstes Feature.

#### Tool- & Daten-Isolierung pro Identität

1. **Tool-Allow/Deny pro Channel.** `Config` unterstützt `coreTools`/`allowedTools`/`excludeTools` (`:727-729`), bereitgestellt über `getPermissionsAllow()`/`getPermissionsDeny()`/`getCoreTools()`. (Es gibt **kein** `getAllowedTools()`/`getBlockedTools()`.) In Phase 0 spawnt der `AcpBridge`-Pfad ein Child pro Channel, aber `AcpBridgeOptions` trägt nur `{ cliEntryPath, cwd, model }` (`:17-21`) und `start()` leitet nur `--acp`+`--model` weiter (`:56-63`). Die Bereitstellung eines Scopes pro Channel erfordert NEUE `AcpBridgeOptions`-Felder, NEUE `--acp`-Flags in `Config` sowie neue `ChannelConfig`-Felder. Auf dem Phase-1+-Daemon-Pfad gibt es eine `Config` pro Daemon, daher ist der Scope pro Daemon (pro Workspace, OD-2) und nicht pro Channel-Child.
2. **MCP-Scoping pro Channel.** `Config.getMcpServers()` filtert nach `allowedMcpServers` (`:3327-3333`), gesetzt bei der Konstruktion. Füge `allowMcpServers?: string[]` zu `ChannelConfig` hinzu, eingefädelt in den gleichen Spawn-Arg-Pfad (oder das `mcpServers`-Array, das `AcpBridge.newSession()` übergibt – hartcodiert `[]` bei `:133`).
3. **`sessionScope` als Daten-Grenze.** `'thread'` lässt eine Gruppe einen Working Tree/Kontext teilen; die Isolierung über _Channel_-Grenzen hinweg wird durch `channelName`-namensgeraumte Routing-Keys erzwungen. Pro Sender innerhalb einer `'thread'`-Gruppe ist by Design _nicht_ isoliert.
**Ehrliche Einschränkung:** Die Authentifizierung verwendet ein einzelnes, daemon-weites Token ohne benutzerspezifische Principal, daher erfolgt die Isolierung pro **Channel** und nicht pro Person. Eine echte Tool-Isolierung pro Person erfordert Phase 3.

#### Admission-Pfad

```
DingTalk-Eingang
  → ChannelBase.handleInbound()
     1. GroupGate.check() + SenderGate.check()                 [bestehend :240-252]
     2. budget.admit('channel:<name>') && budget.admit('org')  [NEU]
            ↳ source==='daemon' && !allowed: sendMessage(refusal); return  (NICHT in steer/cancel)
            ↳ source==='estimate': allowed immer true → nur WARN (Fix #6)
     3. in sessionQueues einreihen MIT {senderId, senderName, requestSeq}  [NEU — Fix #7]
        + task.requested row
     4. am FIFO-Anfang, currentTurnAttribution setzen → bridge.prompt(...)   [bestehend :425]
            ↳ tool call → permission (auto-approved in AcpBridge Phase 0; mediator in daemon Phase 1+)
                ↳ audit row liest currentTurnAttribution[sessionId]  (der AUSFÜHRENDE Turn)
     5. bei Abschluss: Nutzung bekannt (daemon) oder geschätzt (AcpBridge) → budget.debit(..., source)  [NEU]
            ↳ 75%/95% Alert-Post ist proaktiv → abhängig von Build Area 2
```

Wichtige Abhängigkeiten, die erwähnt werden müssen: (1) Echtes Token-Debiting (und damit Hard-Decline) erfordert den Phase-1+ Daemon-Nutzungspfad – bis dahin sind Budgets nur beratend (Fix #6); (2) Proaktive Budget-Alerts benötigen Build Area 2; (3) Konsensabstimmung auf Menschenebene und Audit-Zuordnung auf Menschenebene benötigen das OD-3 Registered-Approver-Roster.

### 6.5 DingTalk-Plattform (primär) + Feishu-Follow-up

> **Wiring-Hinweis (festgelegte Architektur).** Phase 0: `qwen channel start` konstruiert `AcpBridge` (`start.ts:213,350`; `AcpBridge.ts:38`), was `node <cli> --acp` spawnt und `newSession(cwd)`/`loadSession(sessionId, cwd)` (`:131,137`) bereitstellt; das Session-Scoping liegt bei `SessionRouter`, nicht bei der Bridge. Phase 1+: Channels werden unter `qwen serve` über `DaemonChannelBridge` gehostet (seine `'thread'`-Defaults bei `:229,240`; sein Overlap-Throw bei `:257-261`). Die Migration ist fest beschlossen, nicht optional (§1).

#### Das sessionWebhook-Expiry-Problem

Der DingTalk Stream-Modus liefert jeden Inbound mit einem kurzlebigen `sessionWebhook`; der Adapter cached ihn, keyed by `conversationId` (`:84`, befüllt in `onMessage()` `:517`), und `sendMessage()` (`:134-170`) schlägt ihn nach, loggt `No webhook for chatId` und kehrt still zurück, wenn er fehlt (`:137-141`). Zwei fatale Fakten für die proaktive Nutzung: (1) Der Webhook **läuft ab** (der SDK-Typ `RobotMessageBase` enthält `sessionWebhookExpiredTime`, `constants.d.ts:13`, aber das `DingTalkMessageData`-Interface des Adapters lässt es weg und liest es nie – ein gecachter Webhook kann selbst im Hot-Window stale sein); (2) Die Map wird **nur** durch Inbound-Traffic befüllt, eine Cold-Group hat also keinen Eintrag.

#### Cold-Group-Push über die Robot-Proactive-Message (主动消息) API — VERIFIZIERT (OD-7)

Die Lösung ist die Bot-Proactive-Message-API von DingTalk – **`POST https://api.dingtalk.com/v1.0/robot/groupMessages/send`** _(Endpunkt hoch verifiziert)_. Im Gegensatz zum Webhook wird sie über die dauerhafte **`openConversationId`** adressiert _(hoch verifiziert)_, authentifiziert sich mit dem **`x-acs-dingtalk-access-token`**-Header _(hoch verifiziert – bereits verwendet von `emotionApi()` `:188-207` und `downloadMedia()` `media.ts:36-43`)_, und enthält den **`robotCode`** des Bots _(hoch verifiziert; = `config.clientId`, `:184,435`)_. Der Body ist ein `msgKey`/`msgParam`-Paar _(hoch verifiziert)_, wobei **`msgParam` selbst ein JSON-kodierter String** (kein verschachteltes Objekt) ist, z. B. für `msgKey:'sampleMarkdown'`:

```jsonc
{
  "robotCode": "ding...", // = config.clientId
  "openConversationId": "cid6KeBBLov...", // dauerhafte Gruppen-ID (von Inbound conversationId; konvertieren falls ungültig)
  "msgKey": "sampleMarkdown",
  "msgParam": "{\"title\":\"<preview title>\",\"text\":\"# hi\\n...markdown ≤ ~5000 Zeichen\"}",
}
```

Dies ist eine **neue Methode neben `sendMessage()`**, keine Änderung daran (Skizze in §6.2). `ChannelBase.sendMessage()` bleibt abstrakt (`:81`); die Proactive-Engine benötigt die neue `pushProactive?(target, text)` Outbound-Schnittstelle – komplett neu und das zentrale Plattform-Deliverable. **`verifiziert [hoch] gemäß offiziellem Send-Doc + aliyun ask/559227, ask/585232 + Message-Type-Doc`** für Endpunkt/Params/`msgParam`-Form.

**Berechtigungsvoraussetzung:** Eine Robot/Message-Berechtigung zum "Senden von proaktiven Gruppenchat-Nachrichten" muss der unternehmensinternen App erteilt werden, bevor `groupMessages/send` funktioniert (das Send-Doc listet diese Voraussetzung auf) _(hoch verifiziert, dass eine Berechtigung aktiviert sein muss)_. **WEITERHIN MARKIERT (geringe Konfidenz):** Der genaue Anzeigename/Code der Berechtigung wurde in dieser Session nicht aus den Docs fixiert – die DingTalk-Konsole zeigt sie unter 权限管理 der App als Robot/Message-Sende-Berechtigung an (üblicherweise die Robot-Message-Familie, z. B. `qyapi_robot_sendmsg` / 企业机器人发送消息权限); in der Konsole bestätigen, den Code **nicht** hart annehmen. Der Adapter muss `resp.status` + Body bei `!resp.ok`/throw loggen – der aktuelle `emotionApi` Empty-Catch (`:214-216`) ist das Anti-Pattern, das eine Fehlkonfiguration durch fehlende Berechtigung verbergen würde.

#### Abrufen und Persistieren der openConversationId

Zwei Quellen: (1) **Aus Inbound ernten** – jede Nachricht trägt `conversationId` (`:506`), weitergeleitet als `openConversationId` an die Emotion-API (`:197`); persistiere sie in dem Moment, in dem wir sie sehen. **`verifiziert [mittel] gemäß aliyun ask/559227, ask/585233 + passendem 'cid'-Format`**, dass die Callback-`conversationId` (cid-präfixiert) direkt als `openConversationId` für den Standard-Gruppen-@-Callback verwendbar ist. **WEITERHIN MARKIERT:** Kein offizieller Wortlaut setzt sie für einen Non-Cool-App-Robot gleich; der doc-garantierte Beschaffungspfad ist die **`chatId → openConversationId` Conversion-API** (`obtain-group-openconversationid`), oder das Erfassen aus der Group-Create-API / `chooseChat` JSAPI, oder ein Cool-App-Callback (der `openConversationId`+`coolAppCode` direkt liefert). **Fallback:** Bei `invalid.openConversationId` über die `chatId`-API konvertieren und erneut versuchen. (2) **Bot-added-to-group-Events** über `registerAllEventListener` (`client.mjs:58-61`): Events fließen unter dem Standard-`topic:'*'` (`client.mjs:14-19,241-254`) als `onEvent → onEventReceived`, während der Adapter nur den Robot-_Callback_ (`:107`) installiert, sodass Org/Bot-Events derzeit empfangen und in den No-Op-Default geworfen werden (`client.mjs:35-37`). Das Event-Topic und das `openConversationId`-Feld zur Installationszeit sind **unverifiziert** – keinen Event-Namen hart codieren.

**Persistenz.** Verwende einen **separaten `~/.qwen/channels/dingtalk-groups.json`**-Store, nicht das `SessionRouter`-Ziel: Die Gruppen-ID muss jede Session überleben (der Cron-gesteuerte Cold-Group-Push feuert ohne Live-Session), und ein `PersistedEntry` existiert erst, sobald eine Session für den Routing-Key erstellt wurde – die Kopplung der Gruppenidentität an die Session-Lebensdauer lässt Cold-Groups unberücksichtigt.

#### Multiplayer-Scope ist Opt-in, nicht der Default

Der `'thread'`-Scope (`:53`) ist das, was einen gemeinsamen Agenten pro Gruppe bereitstellt, aber `parseChannelConfig()` setzt `sessionScope` standardmäßig auf `'user'` (`config-utils.ts:91-92`), was _pro-Mitglied_-Sessions ergibt. Der Operator muss explizit `sessionScope: 'thread'` setzen. Wenn gesetzt, gelten zwei Multiplayer-Konsequenzen: (a) Der Default-`dispatchMode: 'steer'` **bricht** laufende Arbeit ab, wenn ein beliebiges Mitglied eine Nachricht sendet (`:371-379`) – das Tag-Profil setzt `'followup'` (§6.1); (b) die Sender-Attribution-Lücke (§6.1).

#### Inbound-@-Parsing

Group-Gating funktioniert: `GroupGate` verwendet `envelope.isMentioned`, gesetzt aus `data.isInAtList` (`:520`). Die Textbereinigung entfernt nur das **erste** `@token` (`:527-529`), positionsbasiert, nicht identitätsbasiert – `@qwen @alice` ist korrekt, aber eine Human-First-Erwähnung würde das Human-Token entfernen. Ein härtendes Follow-up entfernt basierend auf der eigenen `chatbotUserId` des Bots. Reply/Quote-Kontext wird extrahiert (`extractQuotedContext()`, `:272-298`), wobei `isReplyToBot` gegen `chatbotUserId` (`:280,292`) berechnet und `referencedText` als `[Replying to: "…"]` (`ChannelBase.ts:317-319`) injiziert wird. **Die Sender-Attribution wird in §6.1** über das `[senderName]`-Präfix geschlossen.

#### Markdown- / Card-Rendering

`markdown.ts` erledigt bereits die Plattform-Normalisierung, die der Proactive-Pfad wiederverwendet: Markdown-Table-Passthrough, Chunking bei 3800 Zeichen mit Fence-Balancing (`splitChunks()`; `CHUNK_LIMIT=3800`) und Title-Extraktion, die auf 20 Zeichen geschnitten wird mit Fallback `'Reply'` (`extractTitle()`). Die Wiederverwendung ist **bedingt** dadurch, dass das `sampleMarkdown`-Template dasselbe Markdown-Subset und einen Body bis zu **~5000 Zeichen** akzeptiert _(hoch verifiziert – Message-Type-Doc)_; halte `CHUNK_LIMIT` ≤ diesem Budget. Streaming Interactive Cards (der `TOPIC_CARD`-Pfad, `constants.d.ts:4`) – das Analogon zur Feishu-Streaming-Card – sind **out of scope** für den primären Meilenstein; v1 Proactive basiert auf Markdown-Messages.

#### Feishu-Follow-up (kurz)

Feishu ist genau auf der Achse voraus, die zählt: **Proaktives Senden ist nativ** (`sendMessage(chatId, text)` an jede `chat_id`, `:622-676` – kein Cold-Group-Problem; `canColdSend = true`), **stabiler `tenant_access_token`** mit Expiry-getracktem Refresh (`refreshToken()`, `:581-620` – die Arbeit, die DingTalk noch bevorsteht), **flexible Event-Subscription** (WebSocket oder HMAC-Webhook, `:146-176`) und **First-Class Streaming Cards** (`markdown.ts`, `:742-792`). **Aber die geteilten `ChannelBase`/`SessionRouter`-Probleme – Opt-in-`'thread'`-Scope, `dispatchMode`-Abbruch, fehlende Sender-Attribution, die neue Outbound-Schnittstelle – gelten identisch für Feishu.** Feishu löst _Erreichbarkeit_, nicht _wer-hat-was-gesagt_ oder _ein-Mitglied-bricht-ein-anderes-ab_. Das Portieren der Proactive-Engine auf Feishu verwendet direkt das bestehende `sendMessage()` wieder (der Base-`pushProactive`-Default); die einzige neue Plattformarbeit besteht darin, die Zielgruppe der Engine auf eine persistierte `chat_id` zu mappen und optional über den Streaming-Card-Pfad zu routen.

---

## 7. Phasenweiser Rollout (Phase 0–2) & MVP

Jede Phase ist unabhängig mergebar, endet demo-fähig und wird durch explizite Akzeptanzkriterien gegated. **Phase 0** bringt den bestehenden Stack dazu, sich wie ein gemeinsamer Resident-Agent zu verhalten – Konfiguration plus ein paar kleine Code-Änderungen auf `AcpBridge`. **Phase 1** migriert das Channel-Hosting in `qwen serve` (festgelegte Architektur) und fügt die Proactive-Engine sowie den einzelnen MVP-Closed-Loop hinzu. **Phase 2** fügt Channel-Memory, Budgets und Audit hinzu.

### Topologie: Festgelegte Daemon-Migration (war OD-1)

Die Entscheidung ist **getroffen**, nicht ausstehend: Phase 0 shipped auf `AcpBridge`; **Phase 1+ betreibt Channels unter `qwen serve`** (über `DaemonChannelBridge` oder einen Daemon-Channel-Runner), weil Per-Room-Memory-Persistenz, der Permission-Mediator, der Event-Bus-Audit, die FIFO-`promptQueue` und die Budget/Audit-Query-Routen alle den Daemon wollen. Der Gateway-eigene Scheduler (§6.2) ist **migrationsneutral** – er serialisiert über `ChannelBase.sessionQueues` unabhängig von der Bridge – daher shipped er in Phase 1 und ist vom Cut-over unberührt. **Das Phase-0-Wiring fügt den `DaemonChannelBridge`-Attach-Pfad (oder ein `--daemon <url>`-Flag) hinzu**, sodass die Migration ein Konfigurationsschritt an der Phase-1-Grenze ist und kein Rewrite. Beachte die scharfe Kante, um die der Scheduler herum designed ist: `DaemonChannelBridge.prompt()` queued **nicht** – es _throwt_ `Prompt already in flight` bei Overlap (`:257-261`); die Daemon-FIFO-`promptQueue` ist auf AcpBridge-Seite (`bridge.ts:2855,3082`); die Channel-seitige Serialisierung ist `ChannelBase.sessionQueues` (`:394`), weshalb die Proactive-Engine `prompt()` nie aufruft, während ein Turn aktiv ist (§6.2, Fix #1).

### Phase 0 — Konfiguration + Identity Injection (auf `AcpBridge`)

**Ziel.** Eine DingTalk-Gruppe, in der jedes Mitglied den Bot `@`-erwähnt, jedes Mitglied eine Session teilt, der Agent weiß, wer spricht, und eine laufende Aufgabe nicht durch das Follow-up eines Teamkollegen zerstört wird.

**0.1 — Das "qwen tag"-Konfigurationsprofil** (hauptsächlich `settings.json`):

```jsonc
// settings.json → channels."team-eng"
{
  "team-eng": {
    "type": "dingtalk",
    "clientId": "$DINGTALK_CLIENT_ID",
    "clientSecret": "$DINGTALK_CLIENT_SECRET",
    "cwd": "/srv/repos/our-service",

    // Multiplayer: GESAMTE Gruppe teilt EINE sessionId. routingKey → `${name}:${threadId||chatId}` (:53).
    // DingTalk setzt KEINE threadId (:541-551) → Key fällt auf chatId = conversationId||sessionWebhook zurück (:534).
    // Eine Nachricht ohne conversationId würde auf den TRANSIENTEN Webhook keyen – als Hard-Error behandeln.
    "sessionScope": "thread",

    // groupPolicy ist standardmäßig "disabled" (GroupGate :13; config-utils :98) – MUSS gesetzt werden, sonst werden alle Gruppen-Nachrichten verworfen.
    // Im Allowlist-Modus ist "*" KEIN Mitgliedschafts-Wildcard (GroupGate :42); jeden chatId auflisten. "*" liefert nur DEFAULTS.
    "groupPolicy": "allowlist",
    "groups": {
      "cidXXXXXXXX": { "requireMention": true, "dispatchMode": "followup" },
      "*": { "requireMention": true, "dispatchMode": "followup" },
    },
    "senderPolicy": "open",
    "instructions": "You are the team's shared engineering agent in this DingTalk group...",
  },
}
```
Anmerkungen zur Ground Truth: `requireMention` ist standardmäßig `true` (`GroupGate.ts:49`); `sessionScope` ist standardmäßig `'user'` (`config-utils.ts:92`) — `'thread'` ist der gesamte Multiplayer-Mechanismus; der Gruppen-Standardwert für `dispatchMode` sollte `'followup'` sein (nicht das Laufzeit-`'steer'`, `:354`).

**0.2 — Sender-Zuordnung (Attribution).** Das `[senderName]`-Präfix beim `promptText`-Seed (`ChannelBase.ts:316`), das über `isGroup` gesteuert wird, **wurde in jedem Turn ausgelöst** (nicht über `instructedSessions` gesteuert), wobei das **neue `Envelope.alreadyPrefixed`**-Flag den Wiedereintritt in `collect` absichert. Siehe §6.1.

**0.3 — `dispatchMode`-Abgleich.** Setze den `dispatchMode` pro Gruppe explizit; korrigiere das veraltete `types.ts:42` JSDoc (`'collect'` → `'steer'`), damit Code und Kommentar übereinstimmen (OD-5).

**Geänderte Dateien (Phase 0).** `start.ts` (optionalen `DaemonChannelBridge`-Attach-Pfad hinzufügen, damit die in Phase 1 festgeschriebene Migration nur ein Flag entfernt ist); `ChannelBase.ts` (`senderName`-Seed + `alreadyPrefixed`-Guard + `/clear` Confirm+Allowlist-Gate + `/who`); `types.ts` (neues `Envelope.alreadyPrefixed`-Feld + JSDoc-Fix); `docs/` (das Rezept + Fallstricke).

**Akzeptanzkriterien.**

- [ ] Zwei Mitglieder erwähnen den Bot mit `@`; beide lösen sich zum **gleichen** `sessionId` auf (Assert über `SessionRouter`-Maps); der Routing-Key ist `team-eng:<conversationId>`, keine Webhook-URL.
- [ ] Der Agent nutzt die Sender-Zuordnung (`[senderName]` vorhanden für Gruppen, nicht vorhanden für 1:1); der Wiedereintritt in `collect` erzeugt kein doppeltes Präfix (assertiert den `alreadyPrefixed`-Pfad).
- [ ] Eine Gruppen-Nachricht ohne Erwähnung wird verworfen (Grund `mention_required`); eine nicht auf der Allowlist stehende Gruppe wird verworfen (`not_allowlisted`).
- [ ] Bei `dispatchMode: 'followup'` bricht eine Nachricht von Mitglied B während der Aufgabe von Mitglied A diese nicht ab; B's Nachricht wird nach A ausgeführt.
- [ ] In einer geteilten (Thread-)Gruppe erfordert `/clear` ein `confirm` und ist, falls gesetzt, auf `config.allowedUsers` beschränkt (kein freier Reset für alle); `/status` bleibt read-only.
- [ ] Unit-Tests auf Hook-Ebene (keine `wait(ms)`-UI-Tests): Routing-Key-Gleichheit über Sender hinweg; Vorhandensein des promptText-Präfixes für `isGroup` true vs. false; `alreadyPrefixed`-Skip.

### Phase 1 — Daemon-Migration + Proactive Engine + der MVP Closed Loop

**MVP-Definition.** Ein **einziger Scheduled-Digest-Closed-Loop**: Ein Operator registriert einen Cron-ähnlichen Job für einen Channel; beim Auslösen löst das Gateway die thread-scoped Session des Channels auf, führt einen Prompt mit Tools aus und **postet das Ergebnis unaufgefordert zurück in den kalten Channel**. Ein Job, ein Channel, ein Auslieferungspfad. Umfangreicheres Verhalten liegt außerhalb des MVP-Scopes.

**Festgeschriebene Migration.** Phase 1 hostet Channels unter `qwen serve` über `DaemonChannelBridge` (die OD-1-Entscheidung) und erbt die FIFO `promptQueue`, den Mediator, den eventBus und die Routen. Die Proactive Engine ist §6.2 (gateway-eigener, migrationsneutraler Scheduler; `dispatchProactive` serialisiert über `sessionQueues`; DingTalk-Cold-Send-Fallback über die verifizierte `groupMessages/send`-API; `tokenManager`-Refresh; `canColdSend`-Capability-Flag). Drei Fakten machen das nicht trivial: Cron ist heute session-scoped und stirbt bei `dispose` (geschlossen durch das OD-8 Sole-Owner-Gate); DingTalk kann keine kalte Gruppe benachrichtigen (geschlossen durch die verifizierte proactive API + persistierte `openConversationId`); und der proactive Prompt muss über `sessionQueues` serialisiert werden und darf **niemals** `bridge.prompt()` aufrufen, während `activePrompts` gehalten wird — andernfalls wirft `DaemonChannelBridge` `Prompt already in flight` (`:257-261`).

**Geänderte Packages.** `ChannelCronStore.ts`/`ChannelCronScheduler.ts` (neu, channel-base); `cronParser.ts` (Wiederverwendung); `ChannelBase.ts` (`dispatchProactive`, `pushProactive`, `canColdSend`-Flag, `/schedule`); `DingtalkAdapter.ts` + `dingtalk/src/proactive.ts` (neuer Cold-Send + persistierte `openConversationId` + `tokenManager`); `FeishuAdapter.ts` (keine Änderung; Referenz für proactive-fähigen Adapter, `canColdSend = true`); `start.ts` (Host unter Daemon; Konstruktion + Start des Schedulers nach `restoreSessions()`; `isTagSession` in die Session-Konstruktion einbinden, damit In-Session-Cron deaktiviert ist — OD-8); Session-Konstruktion (`startCronScheduler()` für Tag-Sessions überspringen, `Session.ts:667-668`).

**Akzeptanzkriterien.**

- [ ] Channels laufen unter `qwen serve` (daemon-gehostet); ein Tool-Aufruf bringt ein `permission_request` zum Vorschein (Mediator erreichbar), was die Migration bestätigt.
- [ ] Ein Operator registriert einen Digest-Job; dieser übersteht einen Gateway-Neustart (wird aus `~/.qwen/channels/cron.json` neu geladen).
- [ ] Wenn der Job **ohne offene Session** auslöst, löst das Gateway die thread-scoped Session auf, führt den Prompt mit Tools aus und liefert über den Cold-Send-Pfad in die inaktive DingTalk-Gruppe — was die Cold-Group-Auslieferung beweist. Die Engine **schlägt laut fehl** (loggt, zeichnet `lastError` auf, macht kein stilles No-Op) bei `canColdSend = false`.
- [ ] Derselbe Job liefert auf Feishu via `tenant_access_token` aus, was die `canColdSend`-Abstraktion beweist.
- [ ] Ein auslösender Job verletzt nicht das One-Prompt-per-Session-Prinzip: Wenn sich ein Mitglied mitten in einer Konversation befindet, reiht sich der proactive Prompt über `sessionQueues` dahinter ein (await `activePrompts.get(sessionId)?.done`), bricht nie per `steer` ab und löst nie den Overlap-Throw von `DaemonChannelBridge` aus.
- [ ] Ein Proactive-Turn kann nicht durch einen späteren menschlichen Turn abgebrochen werden (Tag-Gruppen sind `followup`, nie `steer`).
- [ ] Der `tokenManager` refreshed den v1.0 `accessToken` vor dem Ablauf nach ~2 h und bei 401, sodass ein Send nach > 2 h offenem Socket immer noch erfolgreich ist.
- [ ] Kein Double-Fire eines beliebigen durable Jobs: Der Gateway-Scheduler ist der alleinige Owner; eine Tag-Session aktiviert ihren In-Session-Cron nicht (OD-8); die beiden Stores liegen auf disjunkten Pfaden.
- [ ] Das Löschen des Jobs stoppt zukünftige Auslösungen.
- [ ] Hook/Service-Level-Tests (Scheduler gegen eine Fake-Clock; Cold-Send gegen einen gemockten HTTP-Client) — kein `wait(ms)`.

### Phase 2 — Channel Memory + Token Budgets + Audit Log

**2.1 — Channel-scoped Memory** (§6.3): `'channel'`-Scope + `channelKey` zu `writeContextFile.ts` hinzufügen (`WriteContextFileScope` `:80`, `WriteContextFileOptions` `:83-97`, `resolveContextFilePath` `:223-240`); `~/.qwen/channels/memory/<channelName>/<hash(chatId)>/QWEN.md` ausliefern; die CLI-Layer `readChannelMemory`/`writeChannelMemory`-Callbacks über `ChannelBaseOptions` verdrahten + Bootstrap-Read unter Wiederverwendung von `instructedSessions`. Phase-2-Daemon-Route `POST /channel/:sessionId/memory` nur unter der Daemon-Topologie.

**2.2 — Pro-Channel Token-Budgets** (§6.4): `BudgetLedger.ts` nach Channel gekeyed, **advisory (nur WARN) bei der channel-seitigen Schätzung, Hard-Decline nur bei echter Daemon-Nutzung** (Fix #6/OD-9); pro-process Org-Rollup + pro-Channel-Windows, Strictest-Wins, festes tägliches Window; 75%/95%-Alerts (Proactive-Send-Abhängigkeit).

**2.3 — Audit Log** (§6.4): `RequestAttributionRing` + `task.requested`-Zeile; **Attribution wird mit dem ausführenden Turn mitgeführt (pro-Turn `currentTurnAttribution`), kein Timestamp-Join** (Fix #7); `GET /workspace/audit` (Daemon) oder `/audit`-Channel-Befehl. In-Memory FIFO 512, bei Neustart verloren (bekannte v1-Einschränkung; `~/.qwen` Append-Only-Follow-up, OD-11).

**Geänderte Dateien.** `writeContextFile.ts`, `workspace-memory.ts` (Scope-Validierung + GET-Walker, Daemon-Pfad); `BudgetLedger.ts`, `RequestAttributionRing.ts` (channel-base); `permission-audit.ts` (Pattern-Quelle) / neue `channel-audit.ts` (Daemon); `ChannelBase.ts` (`senderId`/`senderName` bei gequeueten Turns mitführen + `currentTurnAttribution`; Budget-Hooks); `server.ts` (Routen nach `express.json` `:2025` mounten, Mutationen mit `mutate({ strict: true })` gate).

**Akzeptanzkriterien.**

- [ ] `scope: 'channel'` schreibt nach `~/.qwen/channels/memory/<channel>/<hash(chatId)>/QWEN.md`; zwei Gruppen erhalten **unabhängige** Dateien; die geteilte Workspace-`QWEN.md` bleibt unberührt; der Schreibvorgang läuft über den injizierten Callback (keine `channel-base → core`-Abhängigkeit).
- [ ] Das Anhängen an den Channel-Memory ist unter Nebenläufigkeit idempotent (pro-File-Mutex) und emittiert `memory_changed` nur bei echter Mutation (Daemon-Pfad; subscriber-seitiges Filtering).
- [ ] Auf dem **Daemon**-Pfad wird der nächste eingehende Prompt nach Überschreitung des Real-Usage-Window-Caps eines Channels abgelehnt (nicht gekürzt) und proactive Jobs pausieren; Zähler werden beim täglichen Window-Roll-Over zurückgesetzt; Budgets sind pro-Channel unabhängig. Auf einem **nur-schätzenden** Pfad warnt das Budget, lehnt aber nie hart ab (Fix #6).
- [ ] Ein Tool-Aufruf/eine Permission, die hochkommt, während der gequeuete Turn von Sender A ausgeführt wird, wird **A** zugeordnet, selbst wenn B später unter `followup` gequeuet hat (Fix #7).
- [ ] Jeder Proactive-Fire, Channel-Memory-Schreibvorgang und Budget-Event landet mit Best-Effort-`senderId`/`senderName` im Audit-Ring, lesbar über die Audit-Oberfläche, **nicht** auf dem SSE-Bus broadcastet.
- [ ] Ring/Route/Resolver-Unit-Tests (FIFO-Eviction, Scope-Pfad-Auflösung, Budget-Threshold-Mathematik, Attribution-of-Executing-Turn) — keine UI/Timing-Tests.

### Phasen-Grenze & Ausblick

Die Phasen 0→1→2 sind additiv: Multiplayer + Identität (auf `AcpBridge`) → Daemon-Migration + Proactive-MVP → Memory + Budgets + Audit. Das **Phase-3-Multi-Identity-Gateway** (unterschiedliche Bot-Identitäten/Credentials pro Channel, echte Per-User-Principals, Per-Channel-Tokens) ist _out of scope_, der logische nächste Schritt, der die Single-Global-Token-/One-Workspace-per-Daemon-Einschränkungen aufhebt. Selbst innerhalb von Phase 0–2 erfordert "qwen tag" **einen Agent-Process pro Workspace** (OD-2); ein Deployment, das mehrere Repos bedient, führt mehrere Prozesse aus.

---

## 8. qwen tag vs Claude Tag (Trade-offs)

Claude Tag ist ein gehosteter, multi-tenant Agent: Anthropic betreibt die Runtime, Identität und das Per-User-Metering; die Channel-App ist ein Thin Client. `qwen tag` ist das Gegenteil — es läuft auf operator-kontrollierter Infrastruktur auf Basis der Adapter von qwen-code. Diese Umkehrung ist das gesamte Value Proposition und die gesamte Risk Surface.

### Wo qwen gewinnt

- **Open / Self-Hosted, Daten bleiben intern.** Der Agent läuft lokal — über stdio in Phase 0 (`AcpBridge.start()` führt `node <cli> --acp` aus), in-process unter `qwen serve` ab Phase 1 — niemals eine Vendor-API. Repo-Inhalte, Modell-Traffic und Transkripte bleiben auf den Operator-Hosts. Claude Tag kann das nicht von sich behaupten.
- **MCP / Any-Tool.** Strikte Obermenge der Tool-Oberfläche eines geschlossenen gehosteten Agents.
- **Per-Action-Permission-Voting — _eine Phase-1+-Capability, sobald daemon-gehostet_.** qwen-code liefert den `MultiClientPermissionMediator` (vier Policies, Konsens-Quorum `floor(M/2)+1`, separater Audit-Ring). Ein echter Differenzierer — **nicht erreichbar auf dem Phase-0-`AcpBridge`-Pfad** (`requestPermission` auto-approves, `:108-118`), erreichbar, sobald Phase 1 Channels im Daemon hostet; auch dort werden Votes nach `clientId` gekeyed und ein Channel ist ein _einziger_ Client, bis die OD-3-Roster landet. Das tote `ChannelConfig.approvalMode`-Feld (`types.ts:36`) bestätigt "geplant, aber nicht vorhanden".
- **Durable, inspizierbarer State.** `SessionRouter`-Persistenz, einfache `QWEN.md`/`AGENTS.md`-Dateien und (Daemon, Phase 1+) ein Last-Event-ID-Replay-Ring. Nichts Intransparentes.

### Wo es abweicht und kompensieren muss

1. **Single Workspace + Single Global Token + keine menschliche Identität.** Ein Prozess bindet einen Workspace; Multi-Workspace = N Prozesse (OD-2). Das Single Global Token gilt für den _HTTP-Daemon_; der Phase-0-`AcpBridge`-Channel-Pfad hat keine HTTP-Oberfläche und kein Token (seine Grenze ist `SenderGate`/`GroupGate`). Nirgendwo eine menschliche Identität — `senderName` ist nur advisory Prompt-Text (OD-11). _Kompensation:_ ein Prozess pro Workspace/Team; Sender-Attribution auf der Channel-Ebene injizieren; `clientId` als Security-Boundary beibehalten; `--require-auth` + Token auf jedem Non-Loopback-Daemon erfordern (OD-12).
2. **Proactive / Cold-Channel-Messaging nicht einheitlich.** Nur Reactive-Reply auf DingTalk (auslaufender `sessionWebhook`); Feishu sendet frei via `tenant_access_token`. _Kompensation:_ Phase 1's verifizierter Proactive-Group-Send auf persistierter `openConversationId` (DingTalk, `canColdSend` wird true); Feishu braucht nichts.
3. **Scheduler ist session-scoped, nicht daemon-scoped.** Cron stirbt bei `dispose()` durch das 30-Minuten-Idle-Reaping. _Kompensation:_ Gateway-eigener Scheduler (§6.2) — langlebig, überlebt das Reaping, alleiniger Cron-Owner (OD-8).
4. **Memory ist workspace-global, nicht pro-Channel.** _Kompensation:_ One-Process-per-Channel (Zero Code) oder der Phase-2-`channel`-Scope (OD-10).
5. **Multi-Identity / echtes Multi-Tenant out of scope** (Phase 3). In Phase 0–2 als Multi-Process modelliert.
### Risiken & Gegenmaßnahmen

| #   | Risiko                                                                                                                                                   | Schweregrad | Gegenmaßnahme                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Channel-Stack-Tool-Aufrufe werden im Phase-0-`AcpBridge`-Pfad (`AcpBridge.ts:108-118`) **automatisch genehmigt** – ein geleakter Channel führt jedes Tool ohne Gate aus. | Hoch     | Die fest geplante Phase-1-Daemon-Migration bringt den Mediator; bis dahin das Toolset + den Trusted Host einschränken.                                                           |
| R2  | Ein Leak des einzelnen globalen Daemon-Tokens gewährt vollen Workspace-Zugriff (HTTP-Daemon-Pfad; der `AcpBridge`-Pfad hat keinen Token).                                    | Hoch     | Loopback-Default + Bearer-Gate; `--require-auth` bei Non-Loopback (OD-12); Trusted Host; Rotation via Neustart; destruktive Tools hinter `consensus` sperren, sobald angebunden. |
| R3  | `dispatchMode`-Default `'steer'` bricht laufende Arbeiten bei jeder Nachricht eines Mitglieds ab (JSDoc sagte `'collect'`, jetzt auf `'steer'` korrigiert, `types.ts:42`).       | Hoch     | Tag-Gruppen setzen `'followup'`; JSDoc abgeglichen (OD-5).                                                                                                             |
| R4  | Fehlende Absenderzuordnung → Agent verwechselt Sprecher.                                                                                                 | Hoch     | Phase 0 `[senderName]`-Injektion für Gruppen-Turns (+ `alreadyPrefixed`, OD-6).                                                                                     |
| R5  | DingTalk Cold-Group / Expired-Webhook-Proaktivität schlägt still fehl (`:137-141`).                                                                         | Mittel   | Phase 1 verifizierter proaktiver Gruppen-Send auf persistierter `openConversationId`; `canColdSend` fail-loud; Degradierungen anzeigen.                                           |
| R6  | Cron/Notification stirbt beim Session-Reap (30 Min., `run-qwen-serve.ts:94`); benötigt außerdem einen Outbound-Pfad (R5).                                             | Mittel   | Gateway-eigener Scheduler (§6.2); OD-8 Sole-Owner-Gate.                                                                                                             |
| R7  | `requireMention` true → nicht erwähnte Gruppennachrichten werden still verworfen (`GroupGate.ts:51-52`).                                                            | Niedrig/Mittel  | Default beibehalten; dokumentieren; optionaler First-Message-Hinweis.                                                                                                          |
| R8  | Gemeinsamer Workspace-Speicher führt zu Cross-Contamination bei kolozierten Gruppen.                                                                                           | Mittel   | Ein Prozess pro Channel oder Phase-2-`channel`-Scope (OD-10).                                                                                                       |
| R9  | Rate-Limit gilt pro `clientId`/IP, nicht pro User (Daemon-Pfad); der `AcpBridge`-Pfad hat keines.                                                                | Niedrig      | Akzeptabel für Single-Tenant; Per-User-Metering ist Phase 3.                                                                                                       |
| R10 | Consensus-Voter-Set wird zum Anfragezeitpunkt gesnapshottet; Channel-Mitglieder sind heute keine unterschiedlichen `clientId`s.                                                    | Niedrig      | OD-3: `first-responder` Phase 1; `senderId`→Vote-Mapping vor dem Consensus lösen.                                                                                  |
| R11 | DingTalk SDK refreshed das ~2-h-Access-Token nie, außer der Socket schließt – Proactive/Emotion/Media schlagen still fehl.                                   | Hoch     | `tokenManager` im Besitz der Proactive-Feature, Refresh über den v1.0 `oauth2/accessToken`-Endpoint (§6.2, verifiziert).                                            |
| R12 | Proactive-Fire, das `DaemonChannelBridge.prompt()` während eines Human-Turns aufruft, würde **`Prompt already in flight` werfen** (`:257-261`).                     | Hoch     | `dispatchProactive` serialisiert über `sessionQueues` und wartet auf `activePrompts` vor `bridge.prompt()` – Throw-Guard strukturell unerreichbar (Fix #1, §6.2). |
| R13 | False-Positive beim geschätzten Budget könnte einen legitimen User-Prompt ablehnen.                                                                                | Mittel   | Schätzungen nur WARN; Hard-Decline nur bei echter Daemon-Nutzung (Fix #6, §6.4).                                                                                       |
| R14 | `followup`-Queueing ordnet Tool-Calls falsch dem zuletzt eingereihten Sender zu.                                                                    | Mittel   | `senderId` im gequeueten Turn mitführen; Audit liest den ausgeführten Turn (Fix #7, §6.4).                                                                               |

---

## 9. Abgeschlossene Entscheidungen

Alle v1 Open Decisions werden unten mit ihrer gewählten Antwort abgeschlossen. Die **einzigen verbleibenden wirklich offenen Punkte** sind DingTalk-API-Details mit geringer Konfidenz unter OD-7, die in der letzten Zeile aufgeführt sind.

| ID                        | Frage                                                                                       | **Entscheidung**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **OD-1**                  | Channel-Hosting für Phase 1+ in `qwen serve` migrieren oder auf `AcpBridge` bleiben?                | **ABGESCHLOSSEN — Migrieren.** Phase 0 wird auf `AcpBridge` ausgeliefert; **Phase 1+ hostet Channels unter `qwen serve` über `DaemonChannelBridge` / einen Daemon-Channel-Runner**, wobei die FIFO-`promptQueue`, der `MultiClientPermissionMediator`, der `eventBus`, `/workspace/memory` und das Rate-Limit geerbt werden. Phase 0 fügt den Attach-Pfad (oder `--daemon <url>`) hinzu, sodass der Cut-over ein Konfigurationsschritt ist. Der Gateway-Scheduler (§6.2) ist migrationsneutral. Kein Gate mehr – festgelegte Architektur.                                                                                                                                                                                                                                                                                                                |
| **OD-2**                  | Deployment-Unit = ein Prozess pro Workspace/Channel?                                           | **ABGESCHLOSSEN — Ja.** Ein Prozess pro Workspace/Channel: Pro-Channel-Memory + Secret-Isolation, um die Blast-Radius des einzelnen globalen Tokens zu begrenzen. Das Colocating mehrerer Channels ist ein Phase-3-Thema (benötigt den `channel`-Scope + Governor).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **OD-3**                  | Permission-Policy für einen Multiplayer-Tag (ein Channel = eine Daemon-`clientId`)?                 | **ABGESCHLOSSEN — Phase 1: `first-responder` mit einer einzigen Channel-Level-`clientId`** (jedes erlaubte Mitglied löst auf; Channel-granulare Zuordnung; keine `senderId→clientId`-Map). **Phase 2: `consensus`/`designated`**, sobald eine `senderId→clientId`-Roster + Lifecycle (Reaping, Refcount-Bounds) existiert. **High-Risk-Tools bei Proactive-Turns automatisch ablehnen.**                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **OD-4**                  | Thread-scoped `/clear`/`/status` sind channel-weit.                                             | **ABGESCHLOSSEN — in einer gemeinsamen (Thread-)Gruppe erfordert `/clear` ein `confirm` und ist auf `config.allowedUsers` beschränkt, wenn gesetzt** (ein mit Bindestrich versehenes `/clear-channel` ist nicht parsbar; ein Owner-Gate pro Mitglied wird auf das Identitätsmodell verschoben, OD-3/OD-11); `/status` bleibt read-only auf der gemeinsamen Session.                                                                                                                                                                                                                                                                                                                                                                                                               |
| **OD-5**                  | `dispatchMode`-Default-Mismatch (JSDoc `'collect'` vs. Runtime `'steer'`).                      | **ABGESCHLOSSEN — JSDoc bei `types.ts:42` auf `'steer'` korrigieren** (entspricht der Runtime); das Tag-Gruppenprofil setzt `dispatchMode: 'followup'` explizit.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **OD-6**                  | Sender-Marker-Format + `collect`-Double-Prefix.                                                | **ABGESCHLOSSEN — Pro-Turn-`[senderName]`-Prefix, NICHT durch `instructedSessions` gegatet**, plus **EIN neues optionales `Envelope`-Feld `alreadyPrefixed`** (`types.ts`), damit der synthetische Re-Entry im `collect`-Modus das erneute Prefixen überspringt. (Korrigiert die v1-Behauptung "kein neues Feld".)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **OD-7**                  | DingTalk Proactive Send: Endpoint/Permission, `openConversationId`-Äquivalenz, Token-Refresh. | **ABGESCHLOSSEN mit verifizierten Fakten (§6.2/§6.5):** Endpoint `POST https://api.dingtalk.com/v1.0/robot/groupMessages/send` _(hoch)_; Body `{ robotCode=config.clientId, openConversationId, msgKey:'sampleMarkdown', msgParam:<JSON string {title,text}> }` _(hoch)_; Auth-Header `x-acs-dingtalk-access-token` mit einem v1.0 `oauth2/accessToken`-Token, ~7200 s TTL, gecacht und refreshed durch einen Feature-eigenen `tokenManager` _(hoch)_; `openConversationId` in `~/.qwen/channels/dingtalk-groups.json` persistieren; Callback-`conversationId`≈`openConversationId` _(mittel; Fallback auf `chatId→openConversationId`-Conversion-API bei `invalid.openConversationId`)_. **Verbleibend offen (geringe Konfidenz): genauer Permission-Point-Code/Anzeigename; wortgetreuer offizieller Äquivalenzsatz; ob die 20/min-Drosselung für `groupMessages/send` gilt.** |
| **OD-8**                  | Cron-Double-Fire zwischen Gateway- und Session-Schedulern.                                       | **ABGESCHLOSSEN — Der Gateway-Scheduler ist der EINZIGE Cron-Owner.** Eine Channel-gehostete (Tag-)Session startet **nicht** ihren In-Session-`Session`-Cron; sie erfährt über ein `isTagSession`-Flag, das vom Channel-Host bei der Session-Konstruktion durchgereicht wird (`DaemonChannelSessionFactory`-Optionsbag Phase 1+; eine `--acp`-Spawn-Option Phase 0), dass sie eine Tag-Session ist, was `startCronScheduler()` überspringt (`Session.ts:667-668`). Die beiden Cron-Stores befinden sich auf **disjunkten Pfaden** (Gateway `~/.qwen/channels/cron.json` vs. Session `~/.qwen/tmp/<hash>/scheduled_tasks.json`), sodass das einzige Kollisionsrisiko darin besteht, beide Scheduler für dieselben Jobs auszuführen – eliminiert durch das Gate.                                                                                                                                                                                     |
| **OD-9**                  | Token-Budget-Scope, Source-of-Truth, Window.                                                   | **ABGESCHLOSSEN — Pro-Prozess-"Org"-Rollup + Pro-Channel-Windows, Strictest-Wins, festes tägliches Window.** v1 schätzt Token Channel-seitig (advisory, nur WARN – niemals Hard-Declines, Fix #6) und liest den **Daemon-Usage-Pfad** für genaues Debiting (und Hard-Decline), sobald daemon-gehostet.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **OD-10**                 | Pro-Room-Memory-Namespace + Write-Authority.                                                 | **ABGESCHLOSSEN — Einen `channel`-Scope (+`channelKey`) zu `writeContextFile.ts` hinzufügen; Channel-Base erhält Write/Read über einen CLI-Layer-Callback, der durch `ChannelBaseOptions` injiziert wird (`readChannelMemory`/`writeChannelMemory`) – KEINE `channel-base → core`-Dependency.** User-globale Location `~/.qwen/channels/memory/`. Der Agent hängt über eine `save_memory`-Intent an; Bootstrap-Read nutzt das `instructedSessions`-Gate wieder.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **OD-11**                 | Human-Identity-Modell + Audit-Durability.                                                       | **ABGESCHLOSSEN — `senderName` ist nur advisory; `clientId` bleibt das einzige Security-Principal.** Best-Effort-Zuordnung wird mit dem ausgeführten Turn mitgeführt (Fix #7); **In-Memory-FIFO-512-Audit-Ring + eine Append-only-`~/.qwen`-Follow-up-Datei**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **OD-12**                 | Token-Härtung für Non-Loopback-Daemon-gestützte Deployments.                                    | **ABGESCHLOSSEN — `--require-auth` + Token für jedes Non-Loopback-Daemon-gestützte Deployment erforderlich machen.** Loopback-only ist nur für Dev; `--require-auth` ist die dokumentierte Default-Posture (`run-qwen-serve.ts` erzwingt bereits Token-on-Non-Loopback).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **NOCH OFFEN (einziger verbleibender)** | DingTalk-API-Details mit geringer Konfidenz unter OD-7.                                                | **NOCH OFFEN — vor dem Coden in der Konsole / gegen Live-Docs verifizieren:** (1) genauer Permission-Point-Code/Anzeigename für "proactively send group message" (niedrig); (2) maßgeblicher offizieller Satz, der Callback-`conversationId` mit `openConversationId` für einen Standard-Non-Cool-App-Robot gleichsetzt (mittel; doc-garantierter Pfad ist die `chatId→openConversationId`-Conversion-API); (3) ob das Limit "20 Nachrichten/Minute → ~10-Min-Drosselung" wortwörtlich für `groupMessages/send` gilt (niedrig/mittel – für Custom-Webhook-Robots dokumentiert, nicht auf der Orgapp-Send-Seite bestätigt).                                                                                                                                                                                                                                                            |
---

## 10. Risiken & Mitigationen

Siehe die konsolidierte Tabelle in §8. Die kritischsten Risiken in Prioritätsreihenfolge:

1. **R1 — Auto-Approve auf dem Phase-0-Channel-Pfad.** Bis die fest zugesagte Phase-1-Daemon-Migration den mediated transport bereitstellt, führt ein im Channel residenter Agent _jedes_ Tool unbewacht aus. Die mit Abstand wichtigste Sicherheitslücke; mitigieren mit einem konservativen Toolset + Trusted Host bis Phase 1.
2. **R12 — Proaktiver Overlap-Throw.** Der Aufruf von `DaemonChannelBridge.prompt()` während eines Human-Turns wirft `Prompt already in flight` (`:257-261`). Behoben durch Serialisierung über `sessionQueues` (Fix #1) – das Kernstück von §6.2.
3. **R11 — DingTalk-Token-Ablauf.** Der "funktioniert in der Demo, stirbt nach 2 Stunden"-Fehler. Das proaktive Feature besitzt einen `tokenManager` (verifizierter v1.0-Endpunkt, ~7200 s TTL), bevor ein langlebiges Feature ausgeliefert wird.
4. **R5 — DingTalk-Cold-Group-Silent-Failure.** Proaktive Ausgaben an inaktive Gruppen sind ohne den verifizierten Sendepfad unmöglich; `canColdSend` schlägt laut fehl, anstatt sie stillschweigend zu verwerfen.
5. **R3 — `steer`-Abbruch in Gruppen.** Ein versehentlicher Multiplayer-DoS unter der Runtime-Standardkonfiguration; das Tag-Profil setzt `followup`.
6. **R13/R14 — Budget-False-Positives und falsche Zuordnung.** Schätzungen geben nur WARN aus (Fix #6); die Zuordnung wird mit dem ausgeführten Turn mitgeführt (Fix #7).
7. **R8 — Cross-Contamination von Shared Memory.** Ein Prozess pro Channel ist die Zero-Code-Mitigation; der `channel`-Scope ist die colocalisierte Lösung.

Jedes Risiko ist einer Phase zugeordnet: R1/R3/R4 sind Phase 0–1, R5/R6/R11/R12 sind Phase 1, R8/R13/R14 und die Audit/Budget-Risiken sind Phase 2.

---

## 11. Anhang: Datei- & Symbol-Index

### Channel base (`packages/channels/base/src/`)

- `SessionRouter.ts` — `routingKey()` (`:44-60`, thread `:53`, single `:55`, user `:58`), default scope `'user'` (`:25`), `setChannelScope()` (`:40-42`), `resolve()` (`:72-92`), `getTarget()` (`:94`), `persist()`/`restoreSessions()` (`:168-244`), `PersistedEntry` (`:5-9`).
- `ChannelBase.ts` — `handleInbound()` (`:238-471`), prompt construction (`:316-347`), `bridge.prompt()` call (`:425`), gates (`:240-252`), `dispatchMode` resolution (`:353-354`), steer (`:371-379`), collect (`:361-370,445-463`), followup (`:381-383,394-470`), `activePrompts` (`:32-35,356`), `sessionQueues` (`:394,466`), abstract `sendMessage()` (`:81`), `registerCommand()` (`:141-143`), constructor router (`:62-64`), `ChannelBaseOptions` (`:9-22,46`), `/clear`/`/status` (`:147-217`).
- `AcpBridge.ts` — spawn `--acp` (`:53-70`), `newSession(cwd)` (`:131`), `prompt()` (`:147-180`), auto-approve `requestPermission` (`:108-118`), `AcpBridgeOptions` (`:17-21`).
- `DaemonChannelBridge.ts` — `newSession`/`loadSession` sessionScope `'thread'` (`:229,240`), session factory options bag (`:226-241`), `activePrompts` guard / **throw `Prompt already in flight`** (`:257-261`), `cancelSession` (`:332`), `respondToPermission` (`:346-374`), permission events (`:557-633`).
- `GroupGate.ts` — `requireMention` default true (`:49`), membership (`:42`), mention gating (`:51-52`), fallback chain (`:48`), default policy `'disabled'` (`:13`).
- `SenderGate.ts` — `check()` + pairing (`:42`).
- `types.ts` — `GroupConfig` (`:10-13`), `ChannelConfig` (`:27-51`), `approvalMode` (`:36`), `dispatchMode` JSDoc fixed to `'steer'` (`:42`), `senderName` (`:69`), new `alreadyPrefixed` field, `isGroup` (`:75`), `SessionTarget` (`:88-93`).

### DingTalk (`packages/channels/dingtalk/src/`)

- `DingtalkAdapter.ts` — `webhooks` map (`:84`), `sendMessage()` (`:134-170`, no-webhook return `:137-141`), webhook cache (`:516-517`), `getAccessToken()` (`:172-174`), `emotionApi()` (`:188-207`, robotCode `:184`, openConversationId `:197`, empty-catch anti-pattern `:214-216`), media robotCode (`:435`), inbound `conversationId` (`:506`), mention strip (`:527-529`), `isMentioned` (`:520`), `senderName` (`:544`), `extractQuotedContext()` (`:272-298`), `chatId` (`:534`), no `threadId` (`:541-551`).
- `proactive.ts` (new) — `sendGroupMessage()` to `POST /v1.0/robot/groupMessages/send` (`robotCode`+`openConversationId`+`msgKey:'sampleMarkdown'`+`msgParam` JSON-string), `tokenManager` (v1.0 `oauth2/accessToken`, ~7200 s TTL, timer + 401 refresh), `chatId→openConversationId` conversion fallback.
- `markdown.ts` — table passthrough, `splitChunks()`, `CHUNK_LIMIT=3800` (≤ the ~5000-char `sampleMarkdown` budget), `extractTitle()`, `normalizeDingTalkMarkdown()`.
- `media.ts` — `downloadMedia` header (`:39`), body `:42`.
- SDK: `client.mjs` gettoken (`:85-87`), reconnect (`:157-163`), event/callback split (`:14-19,35-37,58-61,241-257`); `constants.d.ts` `sessionWebhookExpiredTime` (`:13`), `robotCode` (`:19`), `TOPIC_CARD` (`:4`).

### Feishu (`packages/channels/feishu/src/`)

- `FeishuAdapter.ts` — `sendMessage()` proactive (`:622-676`, endpoint `:651`; `canColdSend = true`), `refreshToken()` (`:581-620`), `connect()` modes (`:146-176`), `updateCard()` (`:742-792`), ingest dedup (`:1633-1870`).
- `markdown.ts` — schema-v2 card content (`:69-189`), `splitChunks()` (`:198-256`).

### Core (`packages/core/src/`)

- `memory/writeContextFile.ts` — `WriteContextFileScope` (`:80`, +`'channel'`), `WriteContextFileOptions` (`:83-97`, +`channelKey`), `resolveContextFilePath()` (`:223-240`, +`channel` branch + `channelKey` param), per-file mutex (`:48-57,159-162`), absolute-path guard (`:142-146`), `MAX_EXISTING_FILE_BYTES` (`:255`), replace-mode (`:202-211`).
- `utils/cronParser.ts` — `parseCron`/`matches`/`nextFireTime` (`:104,141,168`).
- `utils/cronTasksFile.ts` — `DurableCronTask` (`:19-26`), per-project hashed path (`:1-9`).
- `Session.ts` — `cronQueue`/`cronProcessing` field decls (`:667-668`), `startCronScheduler()` (`:758`, skipped for tag sessions per OD-8), `dispose()` cron clear (`:790-812`), `#recordPromptTokenCount()` (`:2078-2087`), `setNotificationCallback()` (`:2638-2668`), `isIdle()` (`:777`).

### Serve / daemon (`packages/cli/src/serve/`, `packages/acp-bridge/src/`)

- `bridge.ts` — per-`SessionEntry` FIFO `promptQueue` (`:232,2855,3082`), `publishWorkspaceEvent` (`:3610,3649-3675`).
- `eventBus.ts` — `BridgeEvent.data` free-form (`:51`), `originatorClientId` (`:60`), hysteresis thresholds (`:101-103`), replay ring (`:92`).
- `permissionMediator.ts` — four policies + consensus quorum (`:348,621-637`).
- `permission-audit.ts` — `PermissionAuditRing` FIFO 512 (`:128-172`), closed entry union (`:57-104`), header doc anticipating a GET surface (`:22-25`).
- `rate-limit.ts` — per-`(clientId|ip)` token buckets; `X-Qwen-Client-Id` (`:110`).
- `auth.ts` — global bearer token (`:259-266`), `createMutationGate` strict (`:356`).
- `workspace-memory.ts` — scopes `workspace|global` (`:118-125`), strict-auth mutate (`:114`), per-write cap `MAX_MEMORY_CONTENT_BYTES` (`:79`), fixed `projectRoot` forward (`:185-190`).

### CLI channel commands (`packages/cli/src/commands/channel/`)

- `start.ts` — `startCommand` (`:479-499`), `AcpBridge` construction (`:213,268,356,435`), `setChannelScope` (`:361-362`), `restoreSessions` (`:275,444`), `sessionsPath()` (`:56-58`), `checkDuplicateInstance()` (`:170-179`), disconnect handler (`:241,403`); Phase 1+ daemon attach path; CLI-layer injection of `readChannelMemory`/`writeChannelMemory`.
- `config-utils.ts` — `parseChannelConfig()` (`:81-100`, sessionScope default `:91-92`, approvalMode `:94`, groupPolicy `:98`), `resolveEnvVars()` (`:6-18`).
- `channel-registry.ts` — `ensureBuiltins()` (`:6-32`), channel types (`:10-14`).