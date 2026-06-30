# RFC: "qwen tag" — ein persistenter, Multiplayer, im Channel ansässiger Agent für qwen-code (DingTalk-first)

**Status:** Draft (v2)
**Datum:** 2026-06-25
**Autor:** (qwen-code)

---

## Changelog (v1 → v2)

Diese Revision schließt alle Open Decisions aus v1 ab (jetzt **Resolved Decisions**, §9) und behebt sieben in der Review aufgedeckte Korrektheits- und Konsistenzmängel. Die beiden tragenden Änderungen:

- **OD-1 ist kein Gate mehr – es ist festgeschriebene Architektur.** Phase 0 wird auf dem aktuellen `AcpBridge`-Pfad ausgeliefert; **Phase 1+ migriert das Channel-Hosting in den `qwen serve`-Daemon** (über `DaemonChannelBridge` / einen Daemon-Channel-Runner), um die sitzungsbezogene FIFO-`promptQueue`, den `MultiClientPermissionMediator`, den `eventBus`, `/workspace/memory` und das Rate-Limit wiederzuverwenden. Jeder Abschnitt, der zuvor "OD-1 offen / blockiert alles" lautete, wird nun als entschieden behandelt, und die Daemon-Festlegung wird durch §1, §4, §5, §6.1, §6.2, §6.3, §6.4 und §7 propagiert.
- **Der Proactive-Fire-Path wird für den Daemon-Pfad, auf dem er tatsächlich laufen wird, neu gestaltet.** Das `dispatchProactive` aus v1 wurde für `AcpBridge`-Semantik (Channel-seitige `sessionQueues`) geschrieben. Unter der Daemon-Migration **wirft `DaemonChannelBridge.prompt()` bei Überlappung `Prompt already in flight`** (`DaemonChannelBridge.ts:257-261`), anstatt zu queuen. v2 serialisiert Proactive-Prompts für **beide** Varianten über `ChannelBase.sessionQueues`, sodass der Throw-Guard niemals ausgelöst wird, und stellt die Never-Cancellable-Invariante explizit fest (§6.2).

Eingearbeitete Resolutions und Fixes:

- **OD-2** entschieden: ein Prozess pro Workspace/Channel.
- **OD-3** entschieden: Phase 1 `first-responder` + einzelne Channel-Ebene `clientId`; Phase 2 `consensus`/`designated` nach Existenz eines `senderId→clientId`-Rosters + Lifecycle; Auto-Deny für Hochrisiko-Tools bei Proactive-Turns.
- **OD-4** entschieden: In einer geteilten (Thread-)Gruppe erfordert `/clear` ein explizites `confirm` und ist auf `config.allowedUsers` beschränkt, wenn diese Liste gesetzt ist; `/status` ist read-only. (Ein mit Bindestrich versehenes `/clear-channel` ist von der Slash-Grammatik nicht parsbar; ein echtes Owner-Gate pro Mitglied wartet auf das Identitätsmodell — OD-3/OD-11.)
- **OD-5** entschieden: Fix für das veraltete `types.ts:42` JSDoc auf `'steer'`; das Tag-Gruppenprofil setzt `dispatchMode: 'followup'` explizit.
- **OD-6** entschieden: Pro-Turn `[senderName]`-Präfix, **nicht** gegatet durch `instructedSessions`; **ein neues optionales `Envelope`-Feld `alreadyPrefixed`**, damit der synthetische Re-Entry im `collect`-Modus das erneute Präfixieren überspringt. (Korrigiert die v1-Behauptung "kein neues Envelope-Feld" — Fix #2.)
- **OD-7** gelöst unter Verwendung verifizierter DingTalk-API-Fakten (§6.2/§6.5), Low-Confidence-Items weiterhin gekennzeichnet.
- **OD-8** entschieden: Der Gateway/Daemon-Scheduler ist der **einzige** Cron-Owner; eine Tag-Session startet **nicht** ihren In-Session-`Session`-Cron; die beiden Cron-Stores leben auf disjunkten Pfaden, sodass eine Kollision nur möglich ist, wenn beide Scheduler für dieselben Jobs laufen.
- **OD-9** entschieden: Pro-Prozess "org"-Rollup + Pro-Channel-Windows, Strictest-Wins, festes tägliches Window; v1 schätzt Token Channel-seitig und liest den Daemon-Usage-Pfad, sobald es daemon-gehostet ist.
- **OD-10** entschieden: Hinzufügen eines `channel`-Scope (+`channelKey`) zu `writeContextFile.ts`; Channel-Base erhält Write/Read über einen **CLI-Layer-Callback, der durch `ChannelBaseOptions` injiziert wird** (keine `channel-base → core`-Abhängigkeit); benutzer-globaler Speicherort `~/.qwen/channels/memory/`.
- **OD-11** entschieden: `senderName` nur informativ; `clientId` der einzige Security-Principal; In-Memory-Audit-Ring + eine Append-Only-`~/.qwen`-Follow-up-Datei.
- **OD-12** entschieden: `--require-auth` + Token für jedes Nicht-Loopback-Daemon-gestützte Deployment erforderlich.

Korrektheits-Fixes über die OD-Resolutions hinaus:

- **Fix #1 — Proactive-Fire-Path-Concurrency** neu gestaltet für den Daemon-Pfad (§6.2), wobei die Never-Cancellable-Invariante sowohl für die Phase-0-`AcpBridge`-Variante als auch für die Phase-1+-Daemon-Variante durchgesetzt wird.
- **Fix #2 — interner Widerspruch** entfernt: §6.1/G2 behauptet nicht mehr "kein neues Envelope-Feld"; es erkennt das eine `alreadyPrefixed`-Feld an.
- **Fix #3 — Memory-Wiring entworfen** (§6.3): die genaue `ChannelBaseOptions`-Änderung (`readChannelMemory`/`writeChannelMemory`-Callbacks) und wer sie in `start.ts` konstruiert/injiziert, wobei der einmal-pro-Session-Bootstrap-Read das `instructedSessions`-Gate wiederverwendet.
- **Fix #4 — `canColdSend`-Capability-Flag entworfen** (§6.2): wo es deklariert wird, wie DingTalk/Feishu es setzen und wie der Scheduler laut fehlschlägt.
- **Fix #5 — OD-8 Disjoint-Store-Klarstellung** (§6.2): der Gateway-Store und der `Session`-Store sind unterschiedliche Pfade; das einzige Kollisionsrisiko ist eine Tag-Session, die auch In-Session-Cron ausführt – geschlossen durch das OD-8-Gate.
- **Fix #6 — Estimated-Budget-Enforcement** (§6.4): Eine Schätzung darf WARNEN/alarmieren, aber darf einen Benutzer-Prompt niemals hart ablehnen; HARD-Decline nur bei echten Daemon-Usage-Zahlen.
- **Fix #7 — Audit-Attribution unter `followup`** (§6.4): `senderId` _mit_ dem gequeueten Prompt führen, sodass ein Tool-Call/eine Permission dem tatsächlich ausgeführten Turn zugeordnet wird, nicht dem zuletzt gequeueten Sender.

Die verifizierten Ground-Truth-Fakten aus v1 (AcpBridge-Topologie, AcpBridge-Auto-Approve, abstraktes `sendMessage`, Scopes, Parser-Defaults) bleiben unverändert erhalten.

---

## 1. Zusammenfassung

**"qwen tag"** ist ein geteilter qwen-code-Agent, der in einem Chat-Channel lebt – primär eine DingTalk-Gruppe, sekundär Feishu – und der von jedem Mitglied dieses Channels durch `@`-Erwähnung herbeigerufen wird. Einmal herbeigerufen, führt es die vollständige qwen-code-Agent-Schleife (Tools, Datei-Edits, Shell, MCP) gegen einen gebundenen Workspace aus, streamt seine Arbeit fortlaufend zurück in den Channel, **merkt sich den Channel über Turns und Neustarts hinweg** und kann **proaktiv oder nach Zeitplan** handeln, ohne auf eine Aufforderung zu warten. Dies spiegelt den Claude-Tag-Formfaktor wider – ein einzelner persistenter Multiplayer-Agent, der _Ansässiger_ des Raumes ist, anstatt ein 1:1-DM-Bot zu sein – aber er ist vollständig auf dem bestehenden Channel-Adapter-Stack von qwen-code (`qwen channel start`, `packages/channels/*`) und dem `qwen serve`-Daemon aufgebaut, nicht auf einem neuen gehosteten Service.

Die bewusste Rahmensetzung dieses RFC ist, dass **die reaktive Hälfte des Formfaktors größtenteils bereits ausgeliefert ist, die proaktive/Memory-Hälfte jedoch nicht.** Die Teile, die einen _Reply_-Agenten im Claude-Tag-Stil schwierig machen – ein langlaufender Prozess, der Sitzungen multiplext, ein Agent-Transport, der die One-Prompt-per-Session-Invariante bewahrt, Multiplayer-Session-Routing, Channel-bezogene Zugriffskontrolle, Streaming-Card-Rendering und dauerhafte Session-Persistenz – existieren bereits und werden von den aktuellen Channel-Adaptern genutzt. Was _fehlt_, ist ein klar abgegrenzter Satz von Fähigkeiten, der einen reaktiven Reply-Bot in einen ansässigen Agenten verwandelt: Sender-Attribution in geteilten Sessions, ein proaktiver/geplanter Output-Pfad, Pro-Raum-Memory und Multiplayer-Governance. Dieses RFC fasst diese Lücke in **vier Build-Bereiche** und spezifiziert sie über Phase 0–2.

> Hinweis zu "80 %": Frühere Entwürfe formulierten dies als "~80 % ausgeliefert". Diese Zahl ist nicht verifizierbar und übertrieben – die gesamte Proactive-Engine (Build-Bereich 2) und das Pro-Raum-Memory (Build-Bereich 3) sind komplett neu, und speziell bei DingTalk gibt es _überhaupt keinen_ Outbound-Initiate-Pfad. Wir formulieren es stattdessen als "der reaktive Pfad ist gebaut; die proaktiven und Memory-Pfade sind es nicht".

### Ein Topologie-Faktum, das das gesamte RFC einschränkt

Es gibt **zwei unterschiedliche Arten, wie ein Channel-Adapter mit einem qwen-Agenten verbunden ist**, in **zwei verschiedenen Prozessen**, und deren Vermischung ist der mit Abstand häufigste Fehler in früheren Entwürfen:

- **`qwen channel start <name>` (der Auslieferungspfad).** `start.ts` konstruiert **`new AcpBridge(bridgeOpts)`** (`start.ts:213,268,356,435`), und `AcpBridge.start()` **spawnt einen Child-**`node <cliEntryPath> --acp`-Prozess (`AcpBridge.ts:53-70`), der über ACP via NDJSON auf **stdio** kommuniziert. Dieser Child ist ein _Stand-Alone-Agent_, nicht der `qwen serve`-HTTP-Daemon. In dieser Topologie gibt es **keinen HTTP-Daemon, keine `/workspace/memory`-Route, keinen `MultiClientPermissionMediator`, keinen `eventBus`-Replay-Ring und keine Daemon-`promptQueue`** – all diese leben in `packages/acp-bridge` + `packages/cli/src/serve`, was `qwen channel start` nie instanziiert. Die Prompt-Serialisierung erfolgt hier vollständig **Channel-seitig** durch `ChannelBase` (`activePrompts`-Mutex bei `ChannelBase.ts:356-391` + `sessionQueues`-Chain bei `:394-470`) und durch die eigene ACP-One-Prompt-per-Session-Invariante des Childs. `AcpBridge.requestPermission` **auto-approved jeden Tool-Call** (`AcpBridge.ts:108-118`).
- **`qwen serve` + `DaemonChannelBridge` (daemon-gehostet).** `DaemonChannelBridge` (`packages/channels/base/src/DaemonChannelBridge.ts`) ist eine In-Process-Bridge, deren `sessionFactory` Daemon-`Session`-Objekte erzeugt. Dieser Pfad führt Channels innerhalb des Daemons aus und erbt dadurch die FIFO-`promptQueue` von `acp-bridge` (`bridge.ts:232,2855,3082`), den `MultiClientPermissionMediator`, den `eventBus` und die HTTP-Routen. **`qwen channel start` instanziiert es heute nicht** (null Referenzen in `start.ts`). Eine tückische Eigenheit, die das Proactive-Design prägt: `DaemonChannelBridge.prompt()` **queued nicht – es wirft `Prompt already in flight`** bei Überlappung (`DaemonChannelBridge.ts:257-261`); die FIFO-`promptQueue`, die es schließlich erreicht, liegt Daemon/acp-bridge-seitig, _hinter_ diesem In-Process-Throw-Guard. Die Proactive-Engine muss daher auf der Channel-Ebene serialisieren (§6.2).

**Festgeschriebene Architektur (war OD-1, jetzt entschieden):** Die Multi-Client-Daemon-Maschinerie wird wiederverwendet, indem **das Channel-Hosting ab Phase 1 in den `qwen serve`-Daemon migriert wird**.

- **Phase 0** wird auf dem aktuellen `AcpBridge`-Pfad ausgeliefert (Identity-Injection benötigt weder HTTP-Routen noch den Mediator).
- **Phase 1+** führt Channels unter dem `qwen serve`-Daemon aus (über `DaemonChannelBridge` oder einen Daemon-Channel-Runner), da die Proactive-Engine, die Pro-Raum-Memory-Persistenz und die Governance alle die Langlebigkeit, Routen, `promptQueue`, den Mediator und den Event-Bus des Daemons benötigen.

Dies ist nicht länger "offen" oder "blockierend": Das Phase-0-Wiring fügt den `DaemonChannelBridge`-Attach-Pfad (oder ein `--daemon <url>`-Flag) hinzu, sodass die Migration verfügbar ist, sobald Phase 1 beginnt. Der Gateway-eigene Scheduler (§6.2) ist so gebaut, dass er **migrationsneutral** ist und somit vor und nach der Umstellung identisch läuft.

### Was "qwen tag" konkret ist

Ein "qwen tag"-Deployment ist ein einzelner Agentenprozess, der an einen Workspace gebunden ist, plus ein `qwen channel start dingtalk`-Adapter, der so konfiguriert ist, dass eine gesamte Gruppe **eine** Agenten-Session teilt. Zwei **unterschiedliche Scope-Konzepte** müssen beide zusammenpassen:

1. **Channel-Routing-Scope** (`ChannelConfig.sessionScope`, verbraucht von `SessionRouter.routingKey()`): entscheidet, wie eingehende Nachrichten auf einen Routing-Key gemappt werden. Für ein Tag muss dies `'thread'` sein, damit die gesamte Gruppe einen Routing-Key teilt (`channel:(threadId||chatId)`, `SessionRouter.ts:53`). **Das Parser-Default ist `'user'`, nicht `'thread'`** (`config-utils.ts:91-92`), daher muss das Tag-Rezept es explizit setzen.
2. **Bridge/ACP-Session-Scope** (`DaemonChannelBridge` / `acp-bridge` `sessionScope`): entscheidet, wie der Daemon eine zugrunde liegende ACP-Session teilt. `DaemonChannelBridge.newSession()` setzt dies standardmäßig auf `'thread'` (`DaemonChannelBridge.ts:229,240`); der In-Process-Pfad von `acp-bridge` ist standardmäßig `'single'` (`bridge.ts:709`). Dies ist ein **separater Schalter** zum Channel-Routing-Scope und befindet sich _nicht_ auf dem `qwen channel start`-Pfad (`AcpBridge.newSession(cwd)` nimmt nur `cwd`, `AcpBridge.ts:131`).

Mit diesen Voraussetzungen:

- **Ein Agent pro Raum, herbeigerufen durch Erwähnung.** `GroupGate` erzwingt `requireMention` (Default `true`, `GroupGate.ts:49`), sodass der Agent still bleibt, bis er `@`-erwähnt wird oder es sich um eine Antwort an den Bot handelt (`GroupGate.ts:51`). Der Multiplayer-Key ist `sessionScope: 'thread'`, gemappt auf `channel:(threadId||chatId)` (`SessionRouter.ts:50-53`), sodass jedes Mitglied dieselbe `sessionId` wiederverwendet, unabhängig vom Sender.
- **Echte mehrstufige Arbeit mit Tools.** Eingehende Nachrichten werden über `ChannelBase.handleInbound()` zu Prompts, wobei `promptText` aus Nachrichtentext, Reply-Quote-Kontext, Attachment-Dateipfaden und (einmal pro Session) `config.instructions` (`ChannelBase.ts:316-347`) aufgebaut wird, und dann über `bridge.prompt(sessionId, promptText, { imageBase64, imageMimeType })` (`ChannelBase.ts:425` — `promptText` ist ein positionales Arg; das Options-Objekt trägt nur die Bild-Felder) dispatched wird.
- **Streamt seine Arbeit zurück in den Raum.** Adapter rendern inkrementellen Output als plattformeigene Cards (Feishu create/update/finalize, `markdown.ts`; DingTalk-Markdown-Chunking, `DingtalkAdapter.ts:144-169`).
- **Erinnert sich an den Channel.** `SessionRouter.persist()` / `restoreSessions()` speichern dauerhaft `sessionId`, Target und `cwd` und rehydrieren über `bridge.loadSession()` über Neustarts hinweg (`SessionRouter.ts:168-244`); Workspace-Memory (`QWEN.md` / `~/.qwen/QWEN.md`) wird über `GET` / `POST /workspace/memory` (`workspace-memory.ts`) gelesen/geschrieben. Dieses Memory ist Workspace/global-gescoped, nicht Pro-Raum – siehe Build-Bereich 3.
- **Kann proaktiv / nach Zeitplan handeln.** Dies ist die Hälfte, die _noch nicht_ End-to-End existiert und das Herzstück von Phase 1 ist.

---

## 2. Motivation

Die Infrastruktur, die ein ansässiger Multiplayer-_Reply_-Agent normalerweise benötigt, ist in diesem Repo bereits abbezahlt. Die wirklich fehlende Arbeit umfasst vier Build-Bereiche.

| Capability, die der Tag-Formfaktor benötigt | Bereits vorhanden (Referenz) |
| --- | --- |
| Langlaufender Multi-Session-Prozess | `AcpBridge` spawnt einen langlebigen `--acp`-Child (`AcpBridge.ts:53-70`); Daemon-Pfad fügt Pro-Session-FIFO-`promptQueue` hinzu (`bridge.ts:232,2855,3082`) |
| Multiplayer "ein Raum, eine Session"-Routing | `SessionRouter` `'thread'`-Scope (`SessionRouter.ts:53`), Pro-Channel-Override `setChannelScope()` (`SessionRouter.ts:40`) |
| Summon-by-Mention-Semantik | `GroupGate` `requireMention` Default `true` (`GroupGate.ts:49-52`) |
| Zugriffskontrolle + Onboarding | `SenderGate`-Allowlist + Pairing-Code-Flow; Gates angewendet Gruppe-dann-Sender (`ChannelBase.ts:240-252`) |
| Dauerhaftes Session-Mapping über Neustarts | `SessionRouter`-Persistenz (`SessionRouter.ts:168-244`) |
| Workspace-Memory Read/Write | `GET` / `POST /workspace/memory` (`workspace-memory.ts`); nur Workspace- + Global-Scopes; nur Daemon |
| Multi-Aktor-Permission-Control + Audit (nur Daemon) | `MultiClientPermissionMediator` vier Policies inkl. `consensus`-Quorum (`permissionMediator.ts:621-637`); separater Permission-Audit-Ring (`permission-audit.ts`) |
| Auth, Rate-Limiting, Loopback-Sicherheit (nur Daemon) | Globaler Bearer-Token (`auth.ts:259-266`) + Pro-ClientId/IP-abgestuftes Rate-Limit (`rate-limit.ts`) |
| In-Session-Push-Primitive (Hintergrundtasks) | `Session`-Notification-Queue + `setNotificationCallback()` speist Background-Task/Monitor/Shell-Output in die offene Session (`Session.ts:688-689,2638-2668`); `isIdle()` berücksichtigt dies (`Session.ts:777`) |
| Plattform-Auslieferung (DingTalk + Feishu) | Funktionierende Adapter mit Streaming-Cards, Medien, Reactions (`DingtalkAdapter.ts`, `FeishuAdapter.ts`) |

Da Phase 1+ unter dem Daemon läuft (festgeschriebene Architektur, §1), werden die obigen Nur-Daemon-Zeilen zu verfügbaren Capabilities für die Proactive-Engine, die Memory-Persistenz und die Governance – nicht nur "Ziele, wenn wir migrieren".

Die vier Build-Bereiche, detailliert ausgearbeitet in §6:

1. **Config + Identity, um ein Tag zu _deklarieren_ (Phase 0).** Ein Copy-paste-fähiges `channels.dingtalk`-Rezept – `sessionScope: 'thread'`, `groupPolicy`, `requireMention`, `instructions`, `dispatchMode` – plus die **Sender-Attribution-Lücke**: `handleInbound()` injiziert absichtlich **nicht** `senderName` in `promptText` (`ChannelBase.ts:316-347`; `senderName` wird nur für die Zugriffskontrolle bei `ChannelBase.ts:246` verwendet). In einer geteilten `'thread'`-Session kann der Agent nicht erkennen, _wer_ spricht. Phase 0 injiziert einen Sender-Marker, so wie es bereits beim Reply-Quote-Kontext der Fall ist (`ChannelBase.ts:318`).
2. **Eine Proactive-/Outbound-Initiate-Engine (Phase 1).** Heute gibt es **keinen Proactive-Pfad an der Channel-Grenze**: `ChannelBase.sendMessage()` ist abstrakt (`ChannelBase.ts:81`) und wird nur aus einer Antwort heraus aufgerufen. Bei DingTalk kann `sendMessage()` nur über einen kurzlebigen `sessionWebhook` antworten, der bei Inbound pro `conversationId` gecacht wird (`DingtalkAdapter.ts:134-142`), sodass eine **kalte Gruppe überhaupt nicht benachrichtigt werden kann** (`DingtalkAdapter.ts:137-141` gibt stillschweigend zurück). Phase 1 fügt einen Daemon-ansässigen Scheduler und einen DingTalk-Proactive-Send-Pfad hinzu.
3. **Channel-ansässiges Memory + Retrieval (Phase 2, Memory-Hälfte).** Workspace-Memory ist **Workspace-global, nicht Pro-Raum**: `POST /workspace/memory` akzeptiert nur `scope: 'workspace' | 'global'` (`workspace-memory.ts:118-125`) und ist eine **Strict-Auth-Mutationsroute** (`deps.mutate({ strict: true })`, `workspace-memory.ts:114`). Ein Tag, das sich an _diesen_ Channel erinnert, benötigt einen Pro-Raum-Memory-Namespace.
4. **Multiplayer-Governance + Sicherheit (Phase 2, Governance-Hälfte).** Gruppengeeignete Permission-Policy, Proactive-Action-Guardrails und Forensic-Audit, aufbauend auf der bestehenden `clientId`-Ebene (nicht Human-Identity-Ebene) Maschinerie.

---

## 3. Ziele & Non-Goals

### Ziele

- **G1 — Dokumentation und Auslieferung der "tag"-Konfiguration** auf DingTalk: ein Copy-paste-fähiges `channels.dingtalk`-Rezept (explizites `sessionScope: 'thread'`, `groupPolicy: 'allowlist'` mit aufgeführter Gruppen-ID, `requireMention: true`, `instructions` und einem bewusst gewählten `dispatchMode`), das einen funktionierenden ansässigen Multiplayer-Agenten ergibt, unter Wiederverwendung von `parseChannelConfig()` und den bestehenden Gates. Das Rezept muss den Unterschied zwischen Routing-Scope und ACP-Scope hervorheben und darauf hinweisen, dass das Parser-Default `'user'` überschrieben werden muss.
- **G2 — Sender-Attribution in geteilten Sessions.** Injiziert einen Pro-Nachricht-Sender-Marker in `promptText`, damit der Agent Sprecher in einer `'thread'`-gescopeten Gruppe unterscheiden kann, ohne die einmal-pro-Session-`instructions`-Injektion zu brechen, die von `instructedSessions` verfolgt wird (`ChannelBase.ts:344-346`). Der Marker ist **Pro-Nachricht** (der Sprecher ändert sich jeden Turn) und darf NICHT durch `instructedSessions` gegatet sein. Dies erfordert **ein neues optionales `Envelope`-Feld, `alreadyPrefixed`** (`types.ts`), damit der synthetische Re-Entry im `collect`-Modus nicht doppelt präfixiert – siehe §6.1. (v1 beschrieb dies fälschlicherweise als "nur Format, kein neues Feld".)
- **G3 — Eine Proactive-Engine.** Ein Mechanismus, um (a) Output an einen Channel zu initiieren, der nicht gerade eine Nachricht gesendet hat, und (b) nach einem Zeitplan unabhängig von einer offenen interaktiven Session auszulösen, wobei die Ausgabe wo möglich über den bestehenden Pro-Session-Notification-Pfad erfolgt – einschließlich der DingTalk-Proactive-Send-API und eines persistierten `openConversationId`-Stores mit einem definierten Token-Refresh-Owner. Muss die ACP-One-Prompt-per-Session-Invariante (NG6) respektieren, indem über `ChannelBase.sessionQueues` serialisiert wird (niemals einen menschlichen Turn `steer`-canceln), unter beiden Topologien.
- **G4 — Channel-ansässiges Memory.** Ein Pro-Raum-Memory-Namespace und Retrieval-Pfad, der auf der bestehenden `/workspace/memory`-Maschinerie und dem `instructions`-Mechanismus aufsetzt. Das Design fügt einen neuen `channel`-Scope (+`channelKey`) zu `writeContextFile.ts` hinzu und erreicht ihn von `channel-base` aus über einen **CLI-Layer-Callback, der durch `ChannelBaseOptions` injiziert wird** (keine `channel-base → core`-Abhängigkeit).
- **G5 — Multiplayer-Governance.** Gruppengeeignete Permission-Policy, Proactive-Action-Guardrails und Audit, aufbauend auf `MultiClientPermissionMediator` und dem Permission-Audit-Ring. Muss der Tatsache Rechnung tragen, dass Votes `clientId` und nicht der menschlichen Identität zugeordnet werden und dass in einer einzelnen geteilten `'thread'`-Session jedes Gruppenmitglied derselbe Daemon-Client ist.
- **G6 — Feishu-Parität** für alles in G1–G5, als Follow-up behandelt. Feishus stabiler `tenant_access_token` unterstützt bereits Proactive-Sends an jeden Chat mit nur einer `chatId` (`FeishuAdapter.ts:622-651`), daher benötigt Feishu _keine_ neue Send-API für G3 – nur den Wake/Schedule-Mechanismus auf Daemon-Ebene. Feishu deklariert `canColdSend = true`.
- **G7 — Wiederverwendung statt Neuerfindung.** Jeder Build-Bereich erweitert einen bestehenden Mechanismus (Gates, Router, Bridge, Mediator, Memory-Routen, In-Session-Notification-Pfad, Cron), anstatt ein paralleles Subsystem einzuführen.
### Nicht-Ziele

- **NG1 — Kein gehostetes, Multi-Tenant SaaS.** Ein "qwen tag" ist ein Agent-Prozess, der an **einen** Workspace gebunden ist (`serve.ts:165-171`; Multi-Workspace = ein Daemon pro Workspace auf separaten Ports). Keine zentrale Control Plane.
- **NG2 — Keine personenbezogene Identität, Abrechnung oder Kostenbudgets in diesem RFC.** Das Identitätsmodell des Daemons ist ein **einzelner globaler Bearer-Token** (`auth.ts:259-266`) und die Zuordnung auf `clientId`-Ebene im gesamten Event-Bus und Permission-Audit. Wir fügen Sender-_Marker in Prompts_ hinzu (G2), führen aber **keine** authentifizierten Principal-Identitäten pro Benutzer, benutzerspezifische Quotas oder Kosten-Tracking ein. Sender-Marker sind beratender Prompt-Text, keine Auth-Grenze – jedes Gruppenmitglied teilt sich die einzelnen Workspace-Credentials des Daemons, und in einer geteilten `'thread'`-Session ist es dieselbe Daemon-`clientId`.
- **NG3 — Das Phase-3-Multi-Identity-Gateway ist hier nicht im Scope**, es wird nur als Ausblick erwähnt. Dieses RFC deckt Phase 0–2 ab.
- **NG4 — Feishu ist sekundär, nicht gleichrangig primär.** DingTalk ist die Referenzimplementierung und die Quelle aller durchgerechneten Beispiele.
- **NG5 — Slack und andere westliche Plattformen sind nicht im Scope.** Die registrierten Channel-Typen sind `telegram`, `weixin`, `dingtalk`, `feishu` und `qq` (`channel-registry.ts:10-14`); es existiert kein Slack-Adapter.
- **NG6 — Die ACP-Invariante "ein Prompt pro Session" wird nicht geändert.** Ein geplanter/proaktiver Prompt ist nur ein weiterer Eintrag in den Channel-`sessionQueues`; er kann nicht parallel zu einem User-Turn in derselben Session laufen und keinen solchen abbrechen.
- **NG7 — Keine neue Chat-scoped Memory-Store-Engine.** Channel-lokaler Speicher (G4) schichtet ein _Namespacing_ über die bestehenden dateibasierten `QWEN.md`/`AGENTS.md`-Dateien; keine Vector-DB oder raumspezifische Datenbank.

---

## 4. Bestandsaufnahme

Gebaut (B), teilweise (P), fehlend (M). "File" zitiert das maßgebliche Symbol. "Topology" vermerkt, ob die Capability auf dem `AcpBridge`-Channel-Pfad (A), dem `qwen serve`-Daemon-Pfad (D) oder beiden existiert – und da Phase 1+ fest unter dem Daemon laufen soll, wird ein "→D"-Hinweis ergänzt, wo erst die Migration die Capability freischaltet.

| Capability                             | qwen-code heute (Datei / Symbol)                                                                     | Topologie                             | Lücke                                                                                                                                                                           | Größe             |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| One-Room-One-Session-Routing           | `SessionRouter.routingKey()` `'thread'` (`SessionRouter.ts:44-60`)                                   | A+D                                   | Default-Scope ist `'user'` (`config-utils.ts:91-92`); Operator muss `'thread'` setzen                                                                                           | Config (S)        |
| Summon-by-Mention                      | `GroupGate.requireMention` default `true` (`GroupGate.ts:49-52`)                                     | A+D                                   | Keine – bereits korrekt                                                                                                                                                         | —                 |
| Zugriffskontrolle / Onboarding         | `SenderGate` allowlist + pairing (`ChannelBase.ts:240-252`)                                          | A+D                                   | Keine                                                                                                                                                                           | —                 |
| Persistente Session-Zuordnung          | `SessionRouter.persist`/`restoreSessions` (`SessionRouter.ts:168-244`)                               | A+D                                   | Keine                                                                                                                                                                           | —                 |
| **Sender-Zuordnung im Prompt**         | `handleInbound()` baut promptText ohne `senderName` (`ChannelBase.ts:316-347`)                       | A+D                                   | `senderName` wird nie injiziert; Agent kann nicht erkennen, wer gesprochen hat; benötigt neues `Envelope.alreadyPrefixed`                                                       | Code (S)          |
| Prompt-Serialisierung                  | `ChannelBase.sessionQueues`/`activePrompts` (`:356-470`); Daemon `promptQueue` (`bridge.ts:2855`)    | A (Channel) / D (Daemon)              | `DaemonChannelBridge.prompt()` WIRFT einen Fehler bei Überlappung (`:257-261`) – Proactive-Engine muss channel-seitig serialisieren; `dispatchMode`-Default `'steer'` bricht Peers ab (`:354,371-379`) | Config + Code (S) |
| **Outbound-Initiierung / Proaktives Senden** | `ChannelBase.sendMessage()` abstract (`:81`); DingTalk webhook-only (`DingtalkAdapter.ts:134-142`) | A+D                                   | Keine proaktive Schnittstelle; DingTalk-Cold-Group nicht ansprechbar; benötigt `canColdSend`-Capability-Flag                                                                    | Code (L)          |
| **Daemon-weiter Scheduler**            | Cron ist session-scoped (`Session.ts:667-668`), stirbt bei `dispose()` (`:790-812`)                  | A+D (Gateway) → D (Audit/Queue-Wiederverwendung) | Kein Daemon-Scheduler-Endpunkt in `serve/` oder `channels/`; Gateway-Scheduler ist alleiniger Eigentümer (OD-8)                                                                 | Code (L)          |
| In-Session-Push-Primitive              | `setNotificationCallback` (`Session.ts:2638-2668`)                                                   | A+D                                   | Zustellung nur in eine _live_ Session; kann eine bereits bereinigte (reaped) nicht wecken                                                                                       | (Wiederverwendung)|
| **Raumspezifischer Speicher**          | `/workspace/memory` scopes `workspace\|global` (`workspace-memory.ts:118-125`)                       | Nur D                                 | Kein Chat/Channel-Scope; neuer `channel`-Scope + CLI-Layer-Callback (keine Core-Abhängigkeit)                                                                                   | Code (M)          |
| Multi-Aktor-Permission-Voting          | `MultiClientPermissionMediator` 4 policies (`permissionMediator.ts:621-637`)                         | D (geerbt aus Phase 1+)               | `AcpBridge` genehmigt automatisch (`AcpBridge.ts:108-118`); Votes sind pro `clientId`, ein Client pro Channel                                                                   | Code (L)          |
| Audit-Trail                            | `PermissionAuditRing` FIFO 512 (`permission-audit.ts`)                                               | D + channel-seitiger Ring             | Keine menschliche `senderId`; im Speicher, bei Neustart verloren; `~/.qwen` Append-Only-Follow-up                                                                               | Code (M)          |
| **Token- / Kostenbudget**              | keine (Rate-Limit ist nur Request-Count, `rate-limit.ts`)                                            | channel-seitiges Ledger + D-Nutzung   | Kein Ausgaben-Meter; v1-Schätzungen (beratend), echte Abbuchung nur bei Daemon-Hosting                                                                                          | Code (M)          |
| Channel-spezifischer Tool/MCP-Scope    | `coreTools`/`allowedTools`/`excludeTools` (`config.ts:727-729`); MCP allow-filter (`:3327-3333`)     | pro `Config`                          | Kein Spawn-Arg-Pfad vom Channel zum `--acp`-Child (AcpBridge); Daemon-weite `Config` nach dem Hosting                                                                           | Code (M)          |
| DingTalk Proactive-Senden              | nicht implementiert (nur `robot/emotion`, `messageFiles/download`)                                   | A+D                                   | Neuer Endpunkt + persistierte `openConversationId` + Token-Refresh (verifizierter Contract, §6.2)                                                                               | Code (L)          |
| Feishu Proactive-Senden                | `sendMessage()` über `tenant_access_token` (`FeishuAdapter.ts:622-676`)                              | A+D                                   | Keine – `canColdSend = true`                                                                                                                                                    | —                 |

Größen-Schlüssel: S = Config/kleine Code-Änderung, M = ein Modul + Interface-Änderung, L = Multi-Package-Änderung oder neues Subsystem.

---

## 5. Architektur

`qwen tag` ist **keine neue Runtime**. Es handelt sich um vier dünne Schichten, die auf den bestehenden Adapter-Stack aufgepfropft werden. Die Basisschicht bietet bereits einen Multiplayer-fähigen, Tools ausführenden, MCP-ausgestatteten Agenten, der über einen Chat-Channel erreichbar ist. Die vier neuen Schichten bilden 1:1 die Lücken ab: (1) **wer spricht** – die Sender-Identität erreicht nie den Prompt; (2) **Handeln ohne Aufforderung** – kein Outbound-Initiierungspfad, der In-Session-Cron stirbt mit der Session; (3) **Sich an den Channel erinnern** – der Speicher ist Workspace-global; (4) **Ein gemeinsames Gehirn steuern** – Auth ist ein einzelner globaler Token, kein channel-spezifisches Budget.

Jede der folgenden Schichten gibt an, welche Topologie sie voraussetzt (siehe §1). Die **feste Aufteilung**: Phase 0 auf `AcpBridge`; Phase 1+ auf dem `qwen serve`-Daemon via `DaemonChannelBridge`.

### Basisschicht (bestehend) — `qwen channel start`-Topologie (Phase 0)

```
                              one host, one workspace
┌──────────────────────────────────────────────────────────────────────────────┐
│  qwen channel start dingtalk                                                   │
│                                                                                │
│  ┌────────────────────┐    Envelope     ┌───────────────────────────────────┐ │
│  │ DingtalkAdapter     │ ──────────────▶ │ ChannelBase.handleInbound()       │ │
│  │ (stream client,     │                 │  1 GroupGate.check (mention/      │ │
│  │  webhooks map by     │ ◀────────────── │    policy/allowlist)             │ │
│  │  conversationId)     │   text/markdown │  2 SenderGate.check (pairing)    │ │
│  │  sendMessage()       │                 │  3 slash / "!" commands          │ │
│  └────────────────────┘                 │  4 router.resolve(...)           │ │
│        ▲  sessionWebhook (expires,       │  5 dispatchMode (steer default)  │ │
│        │  per inbound msg only)          └───────────────┬───────────────────┘ │
│        │                                                 │ sessionId            │
│        │                                ┌────────────────▼──────────────────┐ │
│        │                                │ SessionRouter                      │ │
│        │                                │  routingKey(): user|thread|single  │ │
│        │                                │  persist() → JSON (crash recovery)  │ │
│        │                                └────────────────┬──────────────────┘ │
│        │   textChunk / toolCall events  ┌────────────────▼──────────────────┐ │
│        └─────────────────────────────── │ AcpBridge (NOT the HTTP daemon)    │ │
│                                         │  spawns child `node <cli> --acp`   │ │
│                                         │  ClientSideConnection over stdio    │ │
│                                         │  requestPermission AUTO-APPROVES    │ │
│                                         └────────────────┬──────────────────┘ │
└──────────────────────────────────────────────────────────┼─────────────────────┘
                                                             │ ACP / NDJSON (stdio)
                                          ┌──────────────────▼─────────────────────┐
                                          │ child agent process (`--acp`)           │
                                          │  one prompt-in-flight per ACP session   │
                                          │  in-session cron (Session.ts) — DISABLED│
                                          │  for tag sessions (OD-8); MCP, tools.   │
                                          │  NO promptQueue/eventBus/mediator       │
                                          └─────────────────────────────────────────┘
```

### Daemon-gehostete Topologie (Phase 1+) — `qwen serve` + `DaemonChannelBridge`

```
                              one host, one workspace, ONE daemon
┌──────────────────────────────────────────────────────────────────────────────┐
│  qwen channel start dingtalk  (channels hosted IN the daemon)                  │
│  ┌────────────────────┐  Envelope   ┌────────────────────────────────────────┐│
│  │ DingtalkAdapter     │ ──────────▶ │ ChannelBase.handleInbound()            ││
│  │ pushProactive()     │ ◀────────── │  gates → governor.admit → router       ││
│  │ canColdSend = false*│             │  → sessionQueues (FIFO, serialization)  ││
│  └────────────────────┘             └───────────────┬────────────────────────┘│
│         ▲ proactive group-send                       │ bridge.prompt()          │
│         │ (openConversationId)        ┌───────────────▼────────────────────────┐│
│  ┌──────┴────────────┐               │ DaemonChannelBridge                      ││
│  │ ChannelCronSched   │──fire────────▶│  prompt() THROWS on overlap (:257-261)  ││
│  │ (gateway-owned,    │ dispatchProa- │  → so all prompts MUST arrive serialized││
│  │  sole cron owner)  │ ctive via     │     via sessionQueues                   ││
│  └────────────────────┘ sessionQueues └───────────────┬────────────────────────┘│
│                                                        │ in-process Session       │
│                                       ┌────────────────▼────────────────────────┐│
│                                       │ daemon: acp-bridge FIFO promptQueue,     ││
│                                       │  MultiClientPermissionMediator, eventBus, ││
│                                       │  /workspace/memory + /channel routes,     ││
│                                       │  rate-limit, bearer auth                  ││
│                                       └──────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────────────────┘
* DingTalk canColdSend flips true once the proactive-send path ships (§6.2).
```

Wichtige Invarianten, auf denen wir aufbauen (verifiziert):

- **Thread-Scope ist der Multiplayer-Schlüssel.** `routingKey()` gibt unter `'thread'` `${channelName}:${threadId || chatId}` zurück (`SessionRouter.ts:53`); `resolve()` verwendet den Key wieder (`:79-83`). Der Default-Scope ist `'user'` (`:25`); `qwen channel start` setzt den channel-spezifischen Scope via `router.setChannelScope(name, config.sessionScope)` (`start.ts:361-362`) im Multi-Channel-Pfad, oder via dem `ChannelBase`-Konstruktor aus `config.sessionScope` (`ChannelBase.ts:62-64`) im Single-Channel-Pfad. **Multiplayer erfordert, dass der Operator `sessionScope: "thread"` setzt.**
- **Prompt-Serialisierung.** Auf `AcpBridge` akzeptiert `newSession(cwd)` nur `cwd` (`AcpBridge.ts:131`) und `AcpBridge.prompt()` hat keine Concurrency-Guard – die Serialisierung erfolgt über den `ChannelBase`-`dispatchMode`: `collect` puffert (`:361-370,445-463`), `steer` bricht den laufenden Prompt ab (`:371-379`), `followup` reiht in `sessionQueues` ein (`:381-383,394-470`). Der **Runtime-Default ist `'steer'`** (`:354`); das `types.ts:42`-JSDoc sagt `'collect'` – **veraltet; v2 korrigiert dies auf `'steer'` (OD-5).** Auf dem Daemon-Pfad **wirft** `DaemonChannelBridge.prompt()` bei Überlappung einen Fehler (`:257-261`); die Daemon-FIFO-`promptQueue` (`bridge.ts:2855,3082`) liegt _hinter_ dieser Throw-Guard. Konsequenz (tragend für §6.2): Alle Prompts – menschliche und proaktive – müssen `bridge.prompt()` bereits serialisiert durch `ChannelBase.sessionQueues` erreichen.
- **`sendMessage` ist abstrakt.** `ChannelBase.sendMessage()` ist `abstract` (`:81`); `DingtalkAdapter.sendMessage()` (`:134-170`) sendet über einen pro-`conversationId` `sessionWebhook`, der nur bei Inbound gecachtet wird (`:516-517`) und abläuft – eine Cold-Group hat keinen gecachten Webhook und der Aufruf **kehrt stillschweigend zurück** (`:137-141`).
- **Daemon-Invarianten ab Phase 1+ geerbt.** `MultiClientPermissionMediator` (`permissionMediator.ts:621-637`), `eventBus`-Replay-Ring (`eventBus.ts:92`), pro-`SessionEntry` `promptQueue`-FIFO (`bridge.ts:2855-3082`) werden verfügbar, sobald Channel unter `qwen serve` gehostet werden (fest zugesagt, §1).

### Die vier neuen Schichten

```
            ┌───────────── governance (Layer 4) ─────────────┐
            │  per-channel turn/cost budget gate              │
            │  proactive allowlist, quiet hours, kill switch  │
            └───────────────────────┬─────────────────────────┘
                                     │ wraps all inbound + outbound
 inbound  ┌──────────────────────────▼─────────────────────────┐  outbound
 ───────▶ │  identity injection (Layer 1)                       │ ────────▶
          │  prefix promptText with speaker + channel context   │
          └──────────────────────────┬─────────────────────────┘
                                     │
          ┌──────────────────────────▼─────────────────────────┐
          │  channel memory (Layer 3)                           │
          │  per-channel fragment, injected at session start;    │
          │  persisted via CLI-layer callback (core helper)      │
          └──────────────────────────┬─────────────────────────┘
                                     │
          ┌──────────────────────────▼─────────────────────────┐
          │  proactive engine (Layer 2)                         │
          │  gateway scheduler → sessionQueues → bridge.prompt → │
          │  channel.pushProactive() w/ cold-group fallback      │
          └─────────────────────────────────────────────────────┘
```

**Layer 1 — Identity Injection.** _Topologie: beide; benötigt keinen Daemon._ `handleInbound()` fügt `senderName` nie in `promptText` ein (`ChannelBase.ts:246` liest es nur für `SenderGate.check()`; `Envelope.senderName` existiert unter `types.ts:69`). Design: ein config-gesteuerter Injection-Point in `handleInbound()`, nach dem `referencedText`-Präfix (`:316-319`), gesteuert über `envelope.isGroup`, plus ein neues `Envelope.alreadyPrefixed`-Flag für den `collect`-Re-Entry. Details in §6.1.

**Layer 2 — Proactive Engine.** _Topologie: Gateway-eigener Scheduler, migrationsneutral; läuft unter dem Daemon ab Phase 1+._ Der In-Session-Cron stirbt bei `dispose()` (`Session.ts:790-803`); es gibt keinen Daemon-Scheduler-Endpunkt. `DingtalkAdapter.sendMessage()` kann keine Cold-Group erreichen (`:137-141`). Design: ein Gateway-residenter Scheduler, der einen Fire durch `ChannelBase.sessionQueues` injiziert (nie `steer`) und die Fertigstellung an `channel.pushProactive()` routet. Details in §6.2.

**Layer 3 — Channel Memory.** _Topologie: Persistierungspfad via CLI-Layer-Callback; Injection channel-seitig._ Speicher ist nur Workspace-global (`workspace-memory.ts:86-303`). Design: ein channel-spezifisches Speicherfragment, das beim Session-Start injiziert wird (Wiederverwendung des einmal-pro-Session `instructions`-Gates), plus ein neuer `channel`-Scope auf dem Schreibpfad, erreichbar von `channel-base` durch injizierte Callbacks (keine `channel-base → core`-Abhängigkeit). Details in §6.3.

**Layer 4 — Governance.** _Topologie: Gate-Wrapper channel-seitig; Rate-Limiter Daemon-seitig ab Phase 1+._ Der Daemon hat einen einzelnen globalen Bearer-Token (`auth.ts:259-266`), pro-`clientId`/IP-Rate-Limiting und kein channel-spezifisches Budget. Design: ein `ChannelGovernor`/`BudgetLedger`, der `handleInbound()` und den Scheduler umschließt. Details in §6.4.
### Datenfluss 1 — eingehende @qwen in einem Gruppen-Thread

Dieser Fluss hat in beiden Topologien die gleiche Form; der einzige Unterschied liegt darin, wo Serialisierung und Berechtigungen angesiedelt sind. Bei `AcpBridge` (Phase 0) erfolgt die Serialisierung über `ChannelBase.sessionQueues` und die Berechtigung wird vom Kindprozess automatisch genehmigt; beim Daemon (Phase 1+) erfolgt die Serialisierung _immer noch_ über `ChannelBase.sessionQueues` (der Daemon-Throw-Guard schlägt nie an, weil die Channel-Ebene bereits serialisiert hat) und die Berechtigung fließt durch `MultiClientPermissionMediator`.

1. **DingTalk → Adapter.** Ein Mitglied postet "@qwen summarize today's incidents". Der Stream-Client liefert `DingTalkMessageData` mit `conversationId`, `sessionWebhook`, Sender und `isInAtList`. `DingtalkAdapter` cacht `webhooks.set(conversationId, sessionWebhook)` (`:516-517`) und emittiert ein `Envelope` mit `isGroup:true`, `isMentioned:true`, `chatId = conversationId`.
2. **Governor (L4).** `ChannelGovernor`/`BudgetLedger.admit()` prüft das Channel-Turn-/Kostenbudget (beratend, bis echte Nutzungsdaten verfügbar sind, §6.4) und den Kill-Schalter. Hard Kill / explizites Limit mit echten Zahlen → Ablehnen und antworten; eine nur geschätzte Überschreitung des Schwellenwerts → WARN, niemals Hard-Decline (Fix #6).
3. **Gates.** `GroupGate.check()` ist erfolgreich (die Erwähnung erfüllt das Standard-`requireMention:true`); `SenderGate.check()` ist erfolgreich (`:246`).
4. **Routing.** `router.resolve(...)` berechnet `dingtalk:<conversationId>` im `'thread'`-Scope (**erfordert `sessionScope:"thread"`**) und gibt die gemeinsame Gruppen-`sessionId` zurück. `persist()` zeichnet sie auf.
5. **Memory (L3) + Identität (L1).** Beim ersten Turn werden der spezialisierte Channel-Speicher + `config.instructions` einmalig vorangestellt (`instructedSessions`, `:344-347`). Die Identitäts-Injektion stellt jeder Nachricht `[Alice]` voran.
6. **Attributionserfassung.** Die aufgelösten `senderId`/`senderName` werden **im Queue-Item** aufgezeichnet, das in `sessionQueues` übertragen wird (Fix #7), und nicht nachträglich per Zeitstempel zusammengeführt.
7. **Dispatch.** Das Tag-Profil setzt `followup` (niemals `steer`); Bobs gleichzeitige Nachricht wird an `sessionQueues` angehängt (`:394-470`).
8. **Bridge.** `bridge.prompt(sessionId, promptText, {imageBase64, imageMimeType})` leitet über stdio ACP (`AcpBridge.prompt`, `AcpBridge.ts:147`) oder an die Daemon-Session (`DaemonChannelBridge.prompt`) weiter — dies wird nur erreicht, wenn der vorherige Turn `activePrompts` abgearbeitet hat, sodass der Daemon-Throw-Guard (`:257-261`) niemals auslöst.
9. **Stream zurück.** `textChunk` → `onChunk` (`:416-422`); `onResponseComplete → DingtalkAdapter.sendMessage()` verwendet den gecachten `sessionWebhook` (warme Gruppe).

### Datenfluss 2 — geplanter proaktiver Push an eine kalte Gruppe

1. **Schedule feuert.** Der im Gateway ansässige `ChannelCronScheduler` wacht um 09:00 Uhr für `daily-standup → dingtalk:<convA>` auf. Nicht der In-Session-Cron (deaktiviert für Tag-Sessions, OD-8/§6.2; und ohnehin tot, sobald eine Session geerntet wird — `dispose()` leert `cronQueue`, `Session.ts:790-803`).
2. **Governor (L4).** Prüft die proaktive Allowlist und die Ruhezeiten (explizite Zeitzonenquelle). Außerhalb des Fensters / nicht auf der Allowlist → überspringen + loggen. Der Scheduler verifiziert `adapter.canColdSend` vor dem Zustellversuch; wenn false, **schlägt er laut fehl** (loggt + zeichnet `lastError` auf), niemals stiller No-Op (Fix #4).
3. **Synthetisches Envelope.** `senderId:'__cron__'`, `chatId: convA`, `isGroup:true`, `isMentioned:true`, keine `messageId`. Der synthetische Prompt trägt seine eigene Attribution (`createdBy`) im Queue-Item.
4. **Serialisieren, niemals unterbrechen.** `dispatchProactive` reiht sich in `ChannelBase.sessionQueues` ein und wartet auf jeden laufenden menschlichen Turn (`activePrompts.get(sessionId)?.done`). Er ruft **niemals** `steer`/`cancelSession` auf und ruft **niemals** `bridge.prompt()` auf, während `activePrompts` gehalten wird — sodass der `Prompt already in flight`-Throw des Daemons (`:257-261`) nicht feuern kann (§6.2, Fix #1).
5. **Cold-Group-Send.** `pushProactive(convA, text)` stellt fest, dass `webhooks.get(convA)` undefined ist, und fällt auf den neuen proaktiven Pfad zurück: persistierte `openConversationId`, frischer App-Credentials-Token, POST `https://api.dingtalk.com/v1.0/robot/groupMessages/send` mit `robotCode = config.clientId`, `msgKey:'sampleMarkdown'`, `msgParam` (ein JSON-_String_). (Bei Feishu ist Schritt 5 das bestehende `sendMessage()` über `tenant_access_token`; `canColdSend = true`.)
6. **Budget + Audit.** Der proaktive Turn verbraucht den Budget-Bucket des Channels (beratende Belastung, bis daemon-gehostete Nutzung verfügbar ist); aufgezeichnet mit `createdBy` als Ursprungsidentität und `originatorClientId` auf Transportebene (keine erfundene menschliche Identität, `eventBus.ts:60`).

### Warum diese Form (Wiederverwendung vor Neuerfindung)

Jede neue Schicht dockt an einer bestehenden Nahtstelle an: Identität an der `promptText`-Erzeugungsstelle, proaktiv an `sessionQueues` + `pushProactive()`, Memory an der `instructions`/`writeContextFile`-Maschinerie, Governance als Wrapper über die Gate-Chain. Die einzige strukturelle Voraussetzung – die Wiederverwendung der Daemon-Maschinerie durch die Schichten 2–4 – wird durch die zugesagte Daemon-Migration (§1) erfüllt: Phase 0 wird auf `AcpBridge` ausgeliefert; Phase 1+ läuft unter `qwen serve`.

---

## 6. Detailliertes Design

### 6.1 Multiplayer & Identität (Build Area 1)

Ein "Qwen-Tag" lebt in einem Gruppen-Chat. Jedes Mitglied spricht mit _demselben_ Agenten, der (a) eine gemeinsame Konversation für den gesamten Channel pflegen, (b) wissen muss, _wer_ in jedem Turn spricht, (c) nicht zulassen darf, dass die Nachricht eines Mitglieds die laufende Aufgabe eines anderen zerstört, und (d) idealerweise die _Gruppe_ bei riskanten Tool-Calls um Genehmigung bitten muss. Qwen-Code verfügt heute über Primitive für (a)–(c); (d) ist daemon-gehostete Phase-1+-Arbeit (zugesagte Migration, §1).

#### Gruppengeteilte Session: `sessionScope: 'thread'`

Unter `'thread'` fällt die `senderId` aus dem Routing-Key heraus, sodass jedes Mitglied zu einer einzigen `sessionId` aufgelöst wird (`SessionRouter.ts:53,72-92`) – was den Agenten zu einer gemeinsamen, im Channel ansässigen Entität macht und nicht zu N privaten Bots.

- **Scope pro Channel, kein globaler Schalter.** Router-Standard ist `'user'` (`:25`) und der Channel-Config-Standard ist `'user'` (`config-utils.ts:91-92`). DMs und Single-User-Channel bleiben `'user'`. Das Tag-Profil setzt `sessionScope: 'thread'` in `settings.json`, angewendet pro Channel über `setChannelScope()` (Multi-Channel, `start.ts:361-362`) oder den `ChannelBase`-Konstruktor (Single-Channel, `ChannelBase.ts:62-64`).
- **DingTalk `threadId`/`chatId`-Stabilität.** Der DingTalk-Adapter setzt niemals `Envelope.threadId` (`DingtalkAdapter.ts:541-551`), sodass `routingKey()` den `threadId || chatId`-Fallback auf `chatId` nimmt und eine Gruppe auf eine Session pro `chatId` zusammenfasst (gewünscht). **Einschränkung:** `chatId = conversationId || sessionWebhook` (`:534`). Bei echten Gruppennachrichten ist `conversationId` vorhanden und stabil; wenn eine Nachricht jemals ohne sie eintrifft, fällt `chatId` auf die _auslaufende_ `sessionWebhook`-URL zurück und der Thread-Key wird instabil. Das Profil behandelt eine fehlende `conversationId` als Hard Error (Nachricht verwerfen) und keyt nicht stillschweigend auf dem Webhook.

Persistenz deckt die Crash-Wiederherstellung ab (`SessionRouter.ts:168-244`): Ein Daemon-Neustart hängt die Gruppe über `bridge.loadSession()` wieder an dieselbe gemeinsame Session an.

#### Neue Gefahr: Thread-scoped `/clear` und `/status` sind channel-weit

Der gemeinsame `/clear`-Handler ruft `router.removeSession(this.name, senderId, chatId)` auf (`ChannelBase.ts:147-152`) und `/status` ruft `router.hasSession(...)` auf (`:203-208`); beide routen durch `routingKey()`, was die `senderId` unter `'thread'` **ignoriert**. Das `/clear` eines einzelnen Mitglieds löscht also die gemeinsame Session für den gesamten Channel und setzt `instructedSessions` zurück – eine Ein-Tap-Reset-für-alle-Fußfalle.

**Gelöst (OD-4):** In einer gemeinsamen (Thread-)Gruppe erfordern `/clear` (und seine Aliase) ein explizites `confirm`-Token und sind auf `config.allowedUsers` beschränkt, wenn diese Liste gesetzt ist; andernfalls wird direkt gelöscht (DMs und Gruppen pro Benutzer berühren nur die eigene Session des Aufrufers, daher ist kein Gate erforderlich). Der Befehl behält den Namen `/clear`, da der Slash-Parser nur `[a-zA-Z0-9_]` akzeptiert (ein `/clear-channel` mit Bindestrich würde als `clear` + Argument `-channel` geparst werden); das explizite `confirm` ist der destruktive Hinweis. Ein echtes Owner-Gate pro Mitglied (das Admins unabhängig von der Chat-Allowlist von Mitgliedern unterscheidet) wartet auf das Identitätsmodell (OD-3/OD-11). **`/status` bleibt read-only** auf der gemeinsamen Session.

#### Die Sender-Attributionslücke und die Lösung

`handleInbound()` baut `promptText` aus `envelope.text`, dem `referencedText`-Zitatpräfix, Anhangspfaden und den einmal pro Session geltenden `config.instructions` (`ChannelBase.ts:315-347`); `envelope.senderName` wird nur für `SenderGate.check()` gelesen (`:246`). In einer `'thread'`-Gruppe sieht der Agent einen undifferenzierten Stream.

**Fix (OD-6) — Präfix `[senderName]` für Gruppen-Turns, ganz oben bei der Prompt-Konstruktion (`:315-316`), bei jedem Turn:**

```ts
let promptText = envelope.text;

// Multiplayer-Attribution: In einer thread-geteilten Session wird jeder Turn mit dem
// Sprecher getaggt. 1:1-Sessions überspringen (Sender ist invariant). Muss bei JEDEM Turn feuern —
// nicht durch instructedSessions gegated (der Sprecher ändert sich bei jeder Nachricht). Das
// alreadyPrefixed-Flag lässt synthetische collect-mode-Wiedereintritte diesen Schritt überspringen.
if (envelope.isGroup && !envelope.alreadyPrefixed) {
  const who = envelope.senderName || envelope.senderId || 'unknown';
  promptText = `[${who}] ${promptText}`;
}

if (envelope.referencedText) {
  promptText = `[Replying to: "${envelope.referencedText}"]\n\n${promptText}`;
}
```

- **Gate auf `envelope.isGroup`** (`types.ts:75`), nicht auf Scope.
- **Präfix vor `referencedText`**, sodass die Reihenfolge `[Alice] [Replying to: "..."] <text>` lautet.
- **`senderName` verwenden, nicht `senderId`.** Bei DingTalk ist `senderName = data.senderNick || 'Unknown'` (`DingtalkAdapter.ts:544`), niemals leer; die `senderId → 'unknown'`-Kette ist defensiv.
- **`collect`-Mode-Doppelpräfix-Gefahr, gelöst durch ein neues Feld.** Der zusammengeführte Wiedereintritt baut ein `syntheticEnvelope`, dessen `text` der bereits präfixierte zusammengeführte String ist, und tritt erneut in `handleInbound()` ein (`:449-462`), was das Präfix **erneut** voranstellen würde. **v2 fügt ein neues optionales `Envelope`-Feld hinzu, `alreadyPrefixed?: boolean` (`types.ts`)**; das `collect`-synthetische Envelope setzt es auf `true`, und der obige Präfix-Schritt überspringt, wenn es gesetzt ist. (Dies korrigiert die Behauptung von v1, dass die Änderung "nur formatiert, kein neues Envelope-Feld" ist – Fix #2. Es ist das einzige neue Envelope-Feld, das dieser RFC einführt; das Bridge/ACP-Protokoll bleibt unverändert.)

#### Gruppen-Standard `dispatchMode`: `steer` → `followup`

`steer` (Runtime-Standard, `:354`) bricht den laufenden Prompt über `bridge.cancelSession()` ab (`:371-379`). In einer gemeinsamen Gruppe, wenn Bob etwas sendet, während der Agent an Alices Anfrage arbeitet, _bricht `steer` Alices Aufgabe ab_ – ein versehentlicher Denial-of-Service. **Das Tag-Profil setzt `dispatchMode: 'followup'`**, sodass Bobs Nachricht hinter Alices Aufgabe in die Warteschlange gestellt wird (`sessionQueues` FIFO, `:381-383,394-470`). Setze es im Gruppenprofil (`groups["*"].dispatchMode = "followup"`), nicht durch Umschalten des globalen Standards – DMs behalten die Self-Interrupt-UX von `steer`. **Keine Codeänderung erforderlich** außer einem dokumentierten Profil-Standard; v2 **korrigiert das veraltete `types.ts:42` JSDoc auf `'steer'`**, damit Code und Kommentar übereinstimmen (OD-5). `collect` ist für Gruppen mit sehr hohem Traffic akzeptabel (begrenzt die Queue-Tiefe) auf Kosten der Attributionsunschärfe.

Da das Tag-Profil für Gruppen **immer `followup` (niemals `steer`)** ist, erbt die proaktive Engine eine saubere Invariante: Es gibt kein Steer-vs-Proactive-Race, weil kein Pfad in einer Tag-Gruppe einen laufenden Prompt abbricht. Diese Invariante wird in §6.2 bekräftigt und durchgesetzt.

#### Handoff — "dort anknüpfen, wo die letzte Person aufgehört hat"

Mit `'thread'` + `[senderName]`-Präfixen + `followup` _ist_ Handoff das Standardverhalten: Die Session enthält die vollständige Multi-Sprecher-Historie. Zwei ergonomische Erweiterungen: ein read-only **`/who`**-Befehl (über `protected registerCommand(name, handler)`, `:141-143` – nicht die private `commands`-Map), der die aktive `sessionId`/`cwd`/Task-Zusammenfassung meldet; und idempotentes Wiederverbinden beim Neustart (bereits abgedeckt durch `restoreSessions()`).

#### Multi-Member-Genehmigungen — Phasing (OD-3, entschieden)

Die Absicht ist richtig: Riskante Tool-Calls sollten von der Gruppe genehmigungsfähig sein, und Qwen-Code liefert `MultiClientPermissionMediator` mit vier Richtlinien (`permissionMediator.ts:348,621-637`). **Aber nichts davon ist vom Channel aus auf dem Phase-0-`AcpBridge`-Pfad erreichbar:**

1. **`qwen channel start` verdrahtet `AcpBridge`, dessen `requestPermission` jede Anfrage automatisch genehmigt** (`AcpBridge.ts:108-118`). Überhaupt kein Genehmigungs-Prompt.
2. Der Mediator lebt in der HTTP-Serve-Schicht des Daemons. Die einzige genehmigungsfähige Channel-Bridge ist `DaemonChannelBridge` (`respondToPermission`, `:346-374`) – erreicht, sobald Phase 1 das Channel-Hosting in den Daemon migriert (zugesagt, §1).
3. `config.approvalMode` ist ein **totes Feld** – geparst (`config-utils.ts:94`) und getypt (`types.ts:36`), aber von keinem Adapter oder Bridge gelesen.

**Entschiedenes Phasing:**

- **Phase 0:** keine Gruppen-Genehmigungen. Risiko mit Sender-Allowlist + `requireMention` + einem konservativen Agenten-Toolset eindämmen. Nicht behaupten, dass `approvalMode` etwas bewirkt.
- **Phase 1:** Channel läuft auf dem Daemon-Bridge-Pfad (zugesagte Migration); `permission_request` als DingTalk-Card surface; **`first-responder` mit einer einzigen Channel-Ebenen-`clientId`** ausliefern (das Tippen eines erlaubten Mitglieds löst es auf; Attribution auf Channel-Granularität). Benötigt keine `senderId → clientId`-Map. **High-Risk-Tools bei proaktiven Turns automatisch ablehnen** (ein von `__cron__` stammender Turn kann keinen Genehmigungs-Prompt beantworten).
- **Phase 2:** Pro-Mitglied-`consensus`/`designated` hinzufügen, sobald das `senderId → clientId`-Mapping und der `clientId`-Lebenszyklus (Reaping, Refcount-Grenzen) existieren. Hinweis: Eine synthetische `clientId` pro `senderId` lässt die `clientIds`-Refcount-Map unbegrenzt wachsen und muss geerntet (gereaped) werden.

#### Zusammenfassung der konkreten Änderungen (Build Area 1)

| Änderung                                                                  | Wo                                                    | Typ          |
| ----------------------------------------------------------------------- | -------------------------------------------------------- | ------------- |
| Gruppenprofil setzt `sessionScope: 'thread'`                             | `settings.json` + `setChannelScope` (`start.ts:359-363`) | Config        |
| Fehlende DingTalk-`conversationId` als Fehler behandeln                        | `DingtalkAdapter.ts` ~`:534`                             | Code (S)      |
| `[senderName]`-Präfix für Gruppen-Turns                                   | `ChannelBase.handleInbound` ~`:316`                      | Code (S)      |
| Neues optionales `Envelope.alreadyPrefixed`-Feld                           | `types.ts` (Envelope)                                    | Code (S)      |
| `alreadyPrefixed` bei `collect`-synthetischem Wiedereintritt setzen                   | `ChannelBase.ts:449-462`                                 | Code (S)      |
| `/clear confirm` + Allowlist-Gate in gemeinsamen Gruppen; `/status` read-only | gemeinsame Befehle (`:147-217`)                             | Code (S)      |
| Gruppenprofil setzt `dispatchMode: 'followup'`                           | `groups["*"]` in `settings.json`                         | Config        |
| Veraltetes `dispatchMode`-JSDoc auf `'steer'` korrigieren                              | `types.ts:42`                                            | Kommentar-Fix   |
| `/who`-Handoff-Befehl                                                  | `registerCommand` (`:141`)                               | Code (S)      |
| Daemon-Bridge-Migration ersetzt `AcpBridge`-Auto-Approve               | `DaemonChannelBridge`-Hosting (zugesagt)                | Phase 1 (L)   |
| Pro-Mitglied-Genehmigungs-Voting + DingTalk-Card                              | neues Bridge-Plumbing + `respondToPermission`              | Phase 1/2 (L) |

### 6.2 Proactive Engine: Scheduler + Outbound-Push (DER KERN)

#### Entscheidung: Ein Gateway-eigener Scheduler, migrationsneutral

**Einen Scheduler einführen, der im `qwen channel start`-Gateway-Prozess lebt.** Das Gateway besitzt den `SessionRouter` (mit `restoreSessions()`-Wiederherstellung – `start.ts:275,444`), hält jede Adapter-Instanz und ihre Bridge und ist der einzige Ort, an dem `ChannelBase.pushProactive()` (und das zugrunde liegende abstrakte `sendMessage()`, `:81`) aufgerufen werden kann. Der Agent (ob das erzeugte `--acp`-Kind in Phase 0 oder die Daemon-Session in Phase 1+) bleibt ein reiner Prompt-Executor: Der Scheduler feuert durch Einreihen in `ChannelBase.sessionQueues`, was `bridge.prompt()` erst aufruft, wenn der vorherige Turn abgearbeitet ist – **keine neue Bridge-Methode, kein Reverse-Channel, keine Daemon-Push-Route.**

> **Topologie-Hinweis (zugesagte Architektur).** Der Scheduler ist **von Haus aus migrationsneutral**: Er serialisiert über `ChannelBase.sessionQueues`, unabhängig davon, welche Bridge darunter liegt. In Phase 0 treibt er `AcpBridge.prompt()` über stdio an; in Phase 1+ treibt er `DaemonChannelBridge.prompt()` an (daemon-gehostet). Da der `eventBus`-Audit und die FIFO-`promptQueue` des Daemons für die Phase-1+-Governance gewünscht sind, läuft der Channel ab Phase 1 unter `qwen serve` – aber die eigene Logik des Schedulers ändert sich an der Migrationsgrenze nicht.

Warum nicht die Alternativen:

- **In-`Session`-Cron:** abgelehnt – `cronQueue`/`cronProcessing` leben in der In-Process-`Session` (`Session.ts:667-668`), feuern nur, während eine Session offen ist, und sterben bei `dispose()` beim 30-Minuten-Idle-Reap (`:790-812`). Genau der Fehler, den der Gateway-Scheduler vermeidet. **Und der Gateway-Scheduler ist der ALLEINIGE Cron-Besitzer (OD-8): Eine Tag-Session startet niemals ihren In-Session-Cron** (Gating-Mechanismus unten).
- **Standalone-Prozess:** abgelehnt – ein zweiter langlebiger Prozess, der DingTalk-Credentials dupliziert und den In-Process-`SessionRouter` sowie die bereits angehängte Bridge nicht wiederverwenden kann.

#### Komponenten und Platzierung

| Komponente                          | Datei                                                                        | Verantwortung                                                                                                                                                                           |
| ---------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ChannelCronStore`                 | `packages/channels/base/src/ChannelCronStore.ts` (neu)                      | Persistente Job-Tabelle, JSON-Schwester von `sessions.json`. `atomicWriteJSON` (`atomicFileWrite.ts:385`) + pro-Datei `async-mutex` `Mutex`.                                                       |
| `ChannelCronScheduler`             | `packages/channels/base/src/ChannelCronScheduler.ts` (neu)                  | Einzelner neu bewaffneter `setTimeout` (Timer-Wheel-of-one); nächstes Feuern über `nextFireTime`; Restart-Catch-up; 60s-Reconciler-Tick. Einer pro Gateway; alleiniger Cron-Besitzer.                                |
| Cron-Primitive                    | `packages/core/src/utils/cronParser.ts` (Wiederverwendung)                             | `parseCron`/`matches`/`nextFireTime` (`:104,141,168`). Nicht neu implementieren.                                                                                                               |
| `dispatchProactive`                | `ChannelBase.ts` (erweitern)                                                   | Ein Feuern über `sessionQueues` injizieren; auf `activePrompts.get(sessionId)?.done` eines laufenden menschlichen Turns warten; niemals `steer`; niemals `bridge.prompt()` aufrufen, während `activePrompts` gehalten wird. |
| `pushProactive`                    | `ChannelBase.ts` (erweitern; Basis-Standard = `sendMessage`) + DingTalk-Override | Outbound-Zustellung; DingTalk-Overrides für kalte Gruppen. Gegated durch `canColdSend`-Capability.                                                                                                |
| `canColdSend`                      | `ChannelBase`-Property (Standard `false`)                                    | Capability-Flag, das der Scheduler vor einem Cold-Send prüft; DingTalk schaltet auf `true` um, sobald der proaktive API-Pfad ausgeliefert wird; Feishu ist `true`.                                                      |
| DingTalk Proactive Send            | `packages/channels/dingtalk/src/proactive.ts` (neu) + `DingtalkAdapter.ts`  | Proaktive Nachricht Gruppenversand über `robotCode` + gespeicherte `openConversationId` (Vertrag unten VERIFIZIERT).                                                                                                   |
| Wiring                             | `start.ts` (`startSingle`/`startAll` erweitern)                                | Scheduler nach `router.restoreSessions()` konstruieren + starten (`:275,444`); das `isTagSession`-Flag in die Session-Konstruktion einfädeln (OD-8).                                              |
| `/schedule` + `schedule_task`-Tool | `ChannelBase.handleInbound()` (erweitern, nach Gates `:240-252`)              | Deterministischer Befehl zuerst; Modell-Tool zweitens.                                                                                                                                          |
#### `canColdSend` Capability-Flag (Fix #4)

Das plattformübergreifende MVP-Kriterium ("derselbe Job wird auf DingTalk und Feishu ausgeliefert") benötigt ein Capability-Flag, damit der Scheduler die Erreichbarkeit logisch prüfen kann, anstatt sie durch stilles Scheitern zu entdecken.

- **Als Property auf `ChannelBase` deklariert:** `protected readonly canColdSend: boolean = false;`. (In der Basisklasse platziert, nicht in einer separaten `ChannelPlugin`-Registry, da der Scheduler bereits die Adapter-Instanz hält und `pushProactive`/`sendMessage` Instanzmethoden sind – das Flag direkt bei der Methode zu platzieren, die es schützt, hält beides in einem Typ.)
- **DingTalk:** `canColdSend = false`, bis der Proactive-Send-Pfad (`proactive.ts`) ausgeliefert und eine nutzbare `openConversationId` persistiert ist; springt auf `true`, sobald `pushProactive` implementiert ist. Solange `false`, kann DingTalk weiterhin "warme" (Webhook) Turns beantworten – `canColdSend` steuert nur die _Cold-Group_-Zustellung.
- **Feishu:** `canColdSend = true` (nativer Proactive-Send über `tenant_access_token`, `FeishuAdapter.ts:622-676`).
- **Scheduler schlägt laut fehl:** Bevor ein Fire ausgeliefert wird, prüft der Scheduler `adapter.canColdSend`. Wenn `false`, versucht er **nicht** `pushProactive`; er loggt einen für Operatoren sichtbaren Fehler, setzt `job.lastStatus='error'` + `lastError='adapter cannot cold-send'`, zeigt ihn in `/schedule list` an und erhöht (gemäß Richtlinie) `consecutiveFailures`. Er führt niemals stillschweigend ein No-Op aus.

#### Disjunkte Cron-Stores + das OD-8-Gate (Fix #5)

Es gibt zwei Cron-Persistenzpfade, und **sie befinden sich auf disjunkten Dateisystempfaden**, sodass sie niemals dieselben Jobs lesen oder schreiben können:

- **Gateway-Store (neu):** `path.join(Storage.getGlobalQwenDir(), 'channels', 'cron.json')` – channel-global, Geschwister-Pfad zu `sessionsPath()` (`start.ts:56-58`), im Besitz des Users, außerhalb des Working Trees.
- **Session-Store (bestehend):** Der pro-Session `Session`-Cron verwendet ein **pro-Projekt gehashtes** Verzeichnis `~/.qwen/tmp/<hash>/scheduled_tasks.json` (`cronTasksFile.ts:1-9`).

Da die Pfade disjunkt sind, kann ein durabler Job nur dann doppelt feuern, wenn eine **Tag-Session zusätzlich zum Gateway-Scheduler ihren In-Session `Session`-Cron ausführt**. **OD-8 schließt dies:** Der Gateway-Scheduler ist der alleinige Cron-Besitzer; eine channel-gehostete ("Tag") Session startet ihren In-Session-Cron **nicht**.

**Gating-Mechanismus – wie eine Session erfährt, dass sie eine Tag-Session ist.** Eine Tag-Session wird mit einem expliziten Flag konstruiert, das vom Channel-Host durchgereicht wird:

- Auf dem Phase-1+-Daemon-Pfad erhält `DaemonChannelSessionFactory` bereits ein strukturiertes Options-Objekt (`{ workspaceCwd, modelServiceId, sessionScope }`, `DaemonChannelBridge.ts:226-241`). Füge `isTagSession: true` zu diesem Objekt hinzu; die Daemon-`Session` liest es bei der Konstruktion und **überspringt `startCronScheduler()`** (die Aufrufstelle, die andernfalls `cronQueue` scharf schalten würde, `Session.ts:667-668`). Disposal räumt Cron bereits beim Reap auf (`:790-803`), sodass eine Tag-Session es einfach niemals scharf schaltet.
- Auf dem Phase-0-`AcpBridge`-Pfad darf der Child-Agent ebenfalls keinen In-Session-Cron für einen Tag-Workspace scharf schalten; reiche dasselbe Flag über eine `--acp`-Spawn-Option durch (ein neues `AcpBridgeOptions`-Feld, das als Flag an `Config` weitergeleitet wird). Bis dieses Flag-Plumbing implementiert ist, registriert Phase 0 einfach keine In-Session-Cron-Jobs (der `/schedule`-Befehl zielt auf den Gateway-Store), sodass es nichts gibt, was doppelt feuern könnte.

Dies macht das verbleibende Risiko rein operativ: "Führe nicht beide Scheduler für dieselben Jobs aus" – und das Gate garantiert, dass eine Tag-Session niemals den zweiten startet.

#### Durable-Store-Schema und Restart-Recovery

Das Schema entspricht `DurableCronTask` (`cronTasksFile.ts:19-26`: `id`/`cron`/`prompt`/`recurring`/`createdAt`/`lastFiredAt` – das Feld heißt `cron`, **nicht** `cronExpr`):

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
2. `store.load()`; Einträge verwerfen, bei denen `cwd !== boundWorkspace`.
3. `scheduler.start()`: Berechne `nextFireTime(job.cron, new Date())` pro aktiviertem Job. **Missed-Fire-Policy (RFC-Entscheidung): Wiederkehrende Jobs, die während der Ausfallzeit überfällig sind, feuern einmal sofort und setzen dann fort – spielen niemals einen Backlog ab** (eine Backlog-Flut in eine Live-Gruppe ist ein Spam-Vorfall). One-Shots in der Vergangenheit feuern einmal und werden dann gelöscht. `cronScheduler.ts` unterscheidet `{ kind: 'catch-up'; ids }` (wiederkehrend) von `{ kind: 'missed'; tasks }` (One-Shots, Confirm-First) bei `:81-89,608-707`; wir übernehmen Coalesce-to-One für wiederkehrende Jobs.
4. Schalte ein einzelnes `setTimeout` auf den nächsten Job scharf; nach jedem Fire erneut scharf schalten. Füge einen 60s-Reconciler-Tick hinzu (Präzedenzfall: `lockProbeTimer`, `cronScheduler.ts:229,507-538`), der ab `Date.now()` neu berechnet, um Suspend/Resume-Clock-Skew zu absorbieren – akkumuliere niemals Intervalle.

#### Fire-Pfad: Injizieren in die SHARED-Group-Session (Fix #1 – der große)

Die Invariante "ein aktiver Prompt pro Session" unterscheidet sich je nach Topologie, und v1's `dispatchProactive` hat es für den Daemon-Pfad falsch gemacht:

- **Phase 0 (`AcpBridge`):** `AcpBridge.prompt()` (`:147-180`) hat **keine eigene Concurrency-Guard**; die einzige Serialisierung erfolgt über `ChannelBase.sessionQueues`/`activePrompts` (`:29-35,394,466`) und die eigene ACP-Session des `--acp`-Childs.
- **Phase 1+ (`DaemonChannelBridge`):** `DaemonChannelBridge.prompt()` **wirft `Prompt already in flight`**, wenn `activePrompts.has(sessionId)` (`:257-261`) – es wird **nicht** gequeuet. Die FIFO-`promptQueue` (`bridge.ts:2855,3082`) befindet sich aufseiten der Daemon/ACP-Bridge, _hinter_ dieser In-Process-Throw-Guard. Der Aufruf von `DaemonChannelBridge.prompt()`, während ein Human-Turn aktiv ist, **wirft** also einen Fehler, anstatt zu warten.

**Das Redesign (korrekt unter beiden Topologien): Rufe niemals `bridge.prompt()` auf, während ein Turn läuft; serialisiere auf der Channel-Ebene über `sessionQueues` und warte zuerst auf `activePrompts`.** Da `sessionQueues` den Proactive-Run _nach_ der Auflösung des vorherigen Runs anhängt, ist zum Zeitpunkt des Aufrufs von `bridge.prompt()` `activePrompts.get(sessionId)` leer – auf dem Daemon-Pfad wird die Throw-Guard also niemals ausgelöst, und auf dem `AcpBridge`-Pfad überlappt das ungeschützte `prompt()` ebenfalls niemals.

```ts
// ChannelBase.ts — reuses private sessionQueues/activePrompts (:29-35).
// Works identically for AcpBridge (Phase 0) and DaemonChannelBridge (Phase 1+):
// the chain guarantees bridge.prompt() runs only after the prior turn drains,
// so DaemonChannelBridge's `Prompt already in flight` throw (:257-261) cannot fire.
async dispatchProactive(sessionId: string, promptText: string): Promise<string> {
  const prev = this.sessionQueues.get(sessionId) ?? Promise.resolve();
  const run = prev.then(async () => {
    const active = this.activePrompts.get(sessionId);
    if (active) await active.done;            // wait out a human turn — never steer-cancel (:371-379)
    return this.bridge.prompt(sessionId, promptText);   // only now is activePrompts clear
  });
  this.sessionQueues.set(sessionId, run.then(() => {}, () => {}));
  return run;
}
```

**Invariante: Ein Proactive-Turn kann niemals von einem späteren Human-Turn abgebrochen werden, und bricht niemals einen Human-Turn ab.** Durchsetzung, für beide Varianten formuliert:

- **Keine Proactive→Human-Abbruch:** `dispatchProactive` ruft niemals `steer`/`cancelSession` auf. Es wartet nur per `await` auf `activePrompts.get(sessionId)?.done` und reiht sich dann dahinter ein.
- **Keine Human→Proactive-Abbruch:** Das Tag-Group-Profil ist **`followup` (niemals `steer`)** (§6.1). Da `steer` der einzige `dispatchMode` ist, der `bridge.cancelSession()` aufruft (`:371-379`), und Tag-Groups ihn niemals auswählen, kann ein eingehender Human-Turn nur _hinter_ einem laufenden Proactive-Turn via `sessionQueues` angereiht werden – er kann ihn nicht abbrechen. (Auf dem Daemon-Pfad wird `DaemonChannelBridge.cancelSession` (`:332`) nur vom `steer`-Branch erreicht, der für Tag-Groups ausgeschlossen ist.)
- **Throw-Guard niemals ausgelöst:** Auf beiden Pfaden wird `bridge.prompt()` nur am Ende der `sessionQueues`-Kette aufgerufen, nachdem der vorherige Run aufgelöst und (bei Human-Turns) `activePrompts` abgearbeitet wurde – der Überlappungs-Wurf von `DaemonChannelBridge` (`:257-261`) ist für Tag-Traffic also strukturell unerreichbar.

Beim Fire:

1. **Shared Session auflösen** via `router.resolve(target.channelName, target.senderId, target.chatId, target.threadId, job.cwd)` (`SessionRouter.ts:72`). `'thread'` → eine `sessionId` für die gesamte Gruppe, sodass der Fire in dem Kontext landet, den Humans sehen. Wenn die wiederhergestellte Session verworfen wurde, erzeugt + persistiert `resolve()` sie neu.
2. **Enqueuen, niemals preempten** (Followup via `sessionQueues`). Absichtlich nicht `steer`.
3. **Marker + Attribution (Fix #7).** Prefix `[Scheduled task "<label>" set by <createdBy>]\n`. Die `createdBy`-Identität wird **im gequeueten Run mitgeführt**, nicht später per Timestamp zusammengeführt, sodass jeder Tool-Call/Jede Permission, die während dieses Fires ausgelöst wird, _diesem_ Proactive-Turn zugeschrieben wird (§6.4).
4. **Capture + Push.** `dispatchProactive` gibt den Completion-Text zurück; der Scheduler prüft `adapter.canColdSend` und ruft dann `channel.pushProactive(target.chatId, text)` auf (Fail-Loud wenn `false`).

#### Cold-Group-Push auf DingTalk

**Verifizierte Limitierung:** `DingtalkAdapter.sendMessage()` sendet nur über den pro `conversationId` gecachten `sessionWebhook` (`:84,134-142`), der nur bei Inbound befüllt wird (`:505-517`). Cold Group → Silent Return (`:137-141`).

**Fix – `pushProactive` über die DingTalk 主动消息 群发 API (Vertrag jetzt VERIFIZIERT, OD-7 gelöst).** Die Aufrufform ist auch im Repo präzediert (`emotionApi` postet an `api.dingtalk.com/v1.0/robot/...` mit Header `x-acs-dingtalk-access-token` und Body `{ robotCode, openConversationId, ... }`, `:188-197`).

**Verifizierter Endpunkt und Parameter** (siehe §6.5 für vollständige Quellnotizen; Konfidenz pro Punkt notiert):

- **Endpunkt:** `POST https://api.dingtalk.com/v1.0/robot/groupMessages/send` _(Konfidenz hoch; offizielles Send-Doc + aliyun ask/559227)_.
- **`robotCode`** (REQUIRED, string): die Robot-ID aus der Installation des Robots in der Gruppe; derselbe Value-Space wie `appKey` für Enterprise-Internal-Robots → verwende `config.clientId` (`:184,435`). Keine neuen Credentials. _(Konfidenz hoch)_
- **`openConversationId`** (REQUIRED, string): die mit `cid` präfixierte Open-Conversation-ID der Zielgruppe; Fehlercodes `miss.openConversationId`/`invalid.openConversationId` bestätigen, dass sie erforderlich und validiert ist. Persistiere in `ChannelCronJob.target.chatId` – stabil über Restarts hinweg, im Gegensatz zu `sessionWebhook`. _(Konfidenz hoch)_
- **`msgKey`** (REQUIRED, string): Message-Template-Key; **`'sampleMarkdown'`** für Markdown (`'sampleText'` für Plain Text). _(Konfidenz hoch; Message-Type-Doc + aliyun ask/585232)_
- **`msgParam`** (REQUIRED, **ein JSON-kodierter _String_**, kein verschachteltes Objekt): für `sampleMarkdown` ist der String `"{\"title\":\"<preview title>\",\"text\":\"<markdown body, max ~5000 chars>\"}"`. _(Konfidenz hoch; Markdown-Title/Text-Felder aus Message-Type-Doc, Textbeispiel wortwörtlich aus aliyun ask/585232)_
- **`coolAppCode`** (OPTIONAL): nur wenn der Robot als Group Cool App (群聊酷应用) installiert ist; nicht erforderlich für einen einfachen Enterprise-Internal-App-Robot. _(Konfidenz mittel)_
- **`conversationId` == `openConversationId`?** Für den Standard-Group-@-Callback: **Behandle die Callback-`conversationId` (cid-präfixiert) als direkt nutzbar als `openConversationId`** – bestätigt durch Community-Quellen + passendes `cid`-Format. **Markiert (Konfidenz mittel):** Offizielle Docs enthalten keinen wortwörtlichen Satz, der sie für einen Standard-Robot (Non-Cool-App) gleichsetzt. Der Doc-garantierte Pfad ist die `chatId → openConversationId`-Conversion-API (oder das Erfassen aus der Group-Create-API / `chooseChat`-JSAPI / einem Cool-App-Callback, der `openConversationId`+`coolAppCode` direkt liefert). **Fallback-Regel:** Wenn ein Send `invalid.openConversationId` zurückgibt, falle auf die `chatId → openConversationId`-Conversion-API zurück.

```ts
const GROUP_SEND = 'https://api.dingtalk.com/v1.0/robot/groupMessages/send'; // verified high

async pushProactive(chatId: string, text: string): Promise<void> {        // DingtalkAdapter override
  const token = await this.tokenManager.get();        // refreshed independently of SDK connect lifecycle
  const robotCode = this.config.clientId;
  if (!token || !robotCode) { /* refresh once; else set lastError + return */ return; }
  for (const chunk of normalizeDingTalkMarkdown(text)) {  // reuse chunker IF the template length budget matches
    const msgParam = JSON.stringify({ title: extractTitle(text), text: chunk });  // msgParam is a STRING
    await sendGroupMessage({ token, robotCode, openConversationId: chatId,
      msgKey: 'sampleMarkdown', msgParam });            // on invalid.openConversationId → convert via chatId API, retry
  }
}
```

`sendMessage()` wird zu: Versuche zuerst den gecachten `sessionWebhook` (günstig, kein Token-Verbrauch); sonst Fallback auf `pushProactive()`. **Base-Default** `pushProactive = (chatId, text) => this.sendMessage(chatId, text)`, sodass **Feishu kein Override benötigt** (`FeishuAdapter.sendMessage()` führt bereits Proactive-Sends an jede `chatId` mit einem stabilen `tenant_access_token` aus, `:622-676`; `canColdSend = true`). DingTalk ist der einzige abweichende Adapter – die DingTalk-First-Asymmetrie. Das `canColdSend`-Flag (oben) lässt die Engine bei einem rein reaktiven Adapter **laut fehlschlagen**, anstatt stillschweigend zu droppen.

**Harte Deployment-Constraints (kein Code):** Der Org-Bot muss (a) ein veröffentlichter Enterprise-Internal-Bot sein, (b) die Proactive-Group-Message-Permission erhalten haben, (c) Mitglied der Zielgruppe sein (installiert via Group Cool App / Enterprise-Internal App / Third-Party App, mit seiner `robotCode`) _(Konfidenz hoch, dass eine Permission aktiviert sein muss; Konfidenz hoch, dass Bot-installed + robotCode Voraussetzungen sind)_, (d) seine `openConversationId` erfasst haben. Wir persistieren `conversationId`, wenn der Bot _irgendeinen_ Inbound in einer Gruppe sieht, sodass "cold" = _idle_ bedeutet, nicht _nie-gesehen_; eine wirklich nie-gesehene Gruppe kann nicht gepusht werden, bis ihre `openConversationId` über die Conversion-API beschafft wurde (hartes Limit). **Erforderliche Adapter-Änderung:** Heute wird nur `sessionWebhook` gecacht (`:516-517`); wir müssen auch `conversationId` persistieren (empfohlener Store: eine separate `~/.qwen/channels/dingtalk-groups.json`, entkoppelt von der Session-Lebensdauer, sodass Cold Groups und Cron-ohne-Live-Session abbildbar sind).

> **WEITERHIN MARKIERT (niedrige Konfidenz) – gemäß OD-7 sichtbar lassen:** (1) Der **genaue Permission-Point-Code/Anzeigename** für "proactively send group message" in der DingTalk-App-权限管理-Konsole ist nicht aus den Docs fixiert – DingTalk zeigt es unter der 权限管理 der App als Robot/Message-Sending-Permission (üblicherweise die Robot-Message-Familie, z.B. `qyapi_robot_sendmsg` / 企业机器人发送消息权限); in der Konsole bestätigen, den Code nicht hart behaupten. (2) Der maßgebliche einzelne offizielle Satz, der die Callback-`conversationId` mit `openConversationId` für einen Standard-Robot (Non-Cool-App) gleichsetzt, wurde in dieser Session nicht wortwörtlich gefunden – hochwahrscheinlicher Shortcut, aber der Doc-garantierte Beschaffungspfad ist die `chatId → openConversationId`-Conversion-API. Die DingTalk-Open-Platform-Seiten sind JS-gerendert und konnten in dieser Session nicht vollständig gescraped werden; Endpunkt/Params/Token-Fakten wurden über den Apifox-Doc-Mirror und Aliyun-Developer-Q&A, die die offiziellen Request-Beispiele zitieren, kreuzvalidiert.

#### Auth & Token-Lifecycle (verifiziert; das tragende Machbarkeitsrisiko)

**Auth-Header (Konfidenz hoch).** Alle v1.0-Calls (einschließlich `groupMessages/send`) übergeben das Token im Request-Header `x-acs-dingtalk-access-token: <accessToken>` plus `Content-Type: application/json` – exakt denselben Header, den `emotionApi()` (`:188-207`) und `downloadMedia()` (`media.ts:36-43`) bereits verwenden.

**Token-Beschaffung (Konfidenz hoch).** Enterprise-Internal-App, v1.0-Style: `POST https://api.dingtalk.com/v1.0/oauth2/accessToken` mit JSON-Body `{"appKey":"<appKey>","appSecret":"<appSecret>"}` → `{ "accessToken": "...", "expireIn": 7200 }`. (Legacy-Äquivalent `GET https://oapi.dingtalk.com/gettoken?appkey=..&appsecret=..` gibt `{access_token, expires_in:7200}` zurück, aber dieses Legacy-Token ist für die alten `oapi`-Endpunkte; für `api.dingtalk.com` v1.0-APIs verwende das v1.0 `accessToken` im `x-acs-dingtalk-access-token`-Header.)

**Ablauf & Caching (Konfidenz hoch).** Tokens laufen in **7200 s (~2 h)** ab und MÜSSEN nach Ablauf neu abgerufen werden; innerhalb des Gültigkeitsfensters geben wiederholte Abrufe dasselbe Token zurück und erneuern es. **Pro-App cachen; rufe den Token-Endpunkt nicht bei jedem Request auf** (häufige Calls werden gedrosselt).

**Warum dies das tragende Risiko ist.** Das Stream SDK holt `access_token` **einmalig zur Connect-Zeit** via `GET .../gettoken` innerhalb von `getEndpoint()` (`client.mjs:85-87`) und **aktualisiert es niemals**; `getAccessToken()` gibt den gecachten Wert zurück (`DingtalkAdapter.ts:172-174`). `autoReconnect` holt nur bei Socket-_Close_ neu (`client.mjs:157-163`) – ein stabiler langlebiger Socket hält ein abgelaufenes Token nach der ~2-h-TTL, und jeder Proactive-Send (und die bestehenden Emotion/Media-Pfade) schlägt stillschweigend fehl, sobald es abläuft. **Das Proactive-Feature muss den Token-Refresh besitzen:** ein `tokenManager`, der über einen Timer (vor dem ~2-h-Ablauf) und/oder bei einer 401 über den v1.0 `oauth2/accessToken`-Endpunkt abruft und pro-App unabhängig vom SDK-Connect-Lifecycle cached (OD-7). Dies ist der wahrscheinlichste "funktioniert in der Demo, stirbt nach 2 Stunden"-Fehler.

**Rate Limits (verifiziert, gemischte Konfidenz – markiert lassen):** (1) Pro-App Server-seitige API-Parallelität ~20 QPS auf DingTalk Standard, mit einem monatlichen Open-API-Quota ~10.000/Monat (Professional ~500k, Dedicated ~5M) _(mittel-hoch)_. (2) Ein häufig zitiertes Limit von **20 Nachrichten/Minute → ~10-Min-Throttle** pro Robot ist für **Custom-Group-Webhook-Robots** dokumentiert; es wird üblicherweise als praktischer Leitfaden für den Orgapp-Robot-Send-Pfad angewendet, wurde aber in dieser Session auf der `groupMessages/send`-Seite **nicht** explizit bestätigt – **betrachte die exakte 20/Min-Zahl für `groupMessages/send` als niedrige/mittlere Konfidenz.** Außerdem: Rufe den Token-Endpunkt nicht übermäßig auf (separate Drosselung). Der Scheduler muss seine eigenen Sends konservativ rate-limiten und bei Throttle-Antworten zurückweichen.

#### Standing Instructions (NL wiederkehrende Anfragen → Store → Consumen)

Zwei-Ebenen-Erfassung in `handleInbound()` nach Bestehen der Gates (`:240-252`): ein expliziter **`/schedule "0 9 * * 1-5" post the open PR list`**-Befehl (geparst mit `parseCron`, kein Model-Roundtrip) und ein Phase-2-Model-Tool `schedule_task(cron, prompt, recurring, label)`. Beide rufen `store.add({...})` auf → persistieren → `scheduler.reschedule(job)` und antworten dann im Channel. `/schedule list|cancel <id>|disable <id>` lesen/schreiben den Store. **Persist Fail-Closed:** Lehne das Acknowledgen von `/schedule` ab, wenn der Write wirft.

#### Failure Modes

- **Gateway beim Fire-Zeitpunkt down:** Recovery fasst überfällige wiederkehrende Fires zu einem Catch-up zusammen; vergangene One-Shots feuern einmal und werden dann gelöscht.
- **Agent-Crash mitten im Fire:** `bridge.prompt()` rejected; `attachDisconnectHandler` (`start.ts:241,403`) spawnt neu (Phase 0) / der Daemon verbindet sich neu (Phase 1+). Scheduler setzt `lastError`, stempelt `lastFiredAt` für wiederkehrende nicht → wird wiederholt. At-least-once; minuten-gerundeter Fire-Key + `lastFiredAt` dedupliziert.
- **Session bereinigt / `loadSession` schlägt fehl:** `resolve()` erzeugt neu (Group-Transcript verloren; Standing Instructions müssen in sich geschlossen sein). Channel-Memory (§6.3) ist die Recovery-Basis.
- **Adapter kann nicht Cold-Senden (`canColdSend=false`):** Scheduler loggt + zeichnet `lastError` auf, angezeigt in `/schedule list`; niemals still.
- **Cold-Group-Push zu entfernter/Permission-entzogener Gruppe:** Non-2xx → `lastError`; `invalid.openConversationId` → versuche `chatId → openConversationId`-Conversion + einmaliger Retry.
- **Token abgelaufen:** `tokenManager` refreshed einmal + Backoff; `consecutiveFailures` ≥ N → Auto-Disable mit einem für Operatoren sichtbaren Eintrag.
- **Zwei Gateways auf einem Workspace:** `checkDuplicateInstance()` (`start.ts:170-179`) sichert Single-Instance ab; zusätzlich einen Lock-Token in `cron.json` eintragen.
### 6.3 Channel-spezifischer Memory & Learning (Build Area 3)

Ein Tag muss sich _die Gruppe über die Zeit merken_, ohne in eine Geschwister-Gruppe durchzusickern. Heute ist der Speicher von qwen-code **workspace-global**: es gibt keine chat/channel/group/session-Achse.

> **Topologie-/Abhängigkeitsfakten (Fix #3).** Zwei harte Constraints bestimmen die Verkabelung: (1) In der Standard-`AcpBridge`-Topologie gibt es **keinen `qwen serve`-Daemon und keine `POST /workspace/memory`-Route** — das `--acp`-Child hat keinen HTTP-Client; selbst nach der Phase-1+-Daemon-Migration ist die Memory-Route **daemon-only und strict-auth** (`deps.mutate({ strict: true })`, `workspace-memory.ts:114`). (2) `@qwen-code/channel-base` hängt nur von `@agentclientprotocol/sdk` (`packages/channels/base/package.json`) ab, **nicht** von `@qwen-code/qwen-code-core`, daher **kann** `ChannelBase` **nicht** `import { writeWorkspaceContextFile }` aufrufen. Das korrigierte Design schreibt/liest Channel-Memory daher **in-process über den Core-Helper, der von `channel-base` über Callbacks erreicht wird, die von der CLI-Schicht injiziert werden** (`packages/cli`, das von Core abhängen _kann_) — nicht über HTTP und nicht durch Hinzufügen einer Core-Abhängigkeit zu `channel-base`.

#### Aktueller Stand: zwei Scopes, keiner pro Konversation

`POST /workspace/memory` akzeptiert nur `scope: 'workspace' | 'global'` (`workspace-memory.ts:118-125`), aufgelöst über `resolveContextFilePath()` (`writeContextFile.ts:223-240`): `workspace → <root>/QWEN.md`, `global → ~/.qwen/QWEN.md`. Der Append-Modus wird unter `## Qwen Added Memories` gefaltet (`MEMORY_SECTION_HEADER`, `const.ts:29`); eine Pro-File-Mutex mit 30s-Deadline serialisiert die Schreibvorgänge (`writeContextFile.ts:48-57,159-162`); der Writer lehnt eine bestehende Datei > 16 MB beim Anhängen ab (`MAX_EXISTING_FILE_BYTES`, `:255`). Die Route ist **strict-auth** (`deps.mutate({ strict: true })`, `:114`) — sie wird sogar auf Loopback ohne Token abgelehnt. Konsequenz: Jede Gruppe in einem Workspace teilt sich eine `QWEN.md`.

#### Design: ein `channel`-Memory-Scope mit Key `(channelName, chatId)`

Die Isolations-Einheit ist das **Routing-Target**, nicht die Session (Sessions werden im Idle-Zustand bereinigt, `DEFAULT_SESSION_IDLE_TIMEOUT_MS` 30 Min., `run-qwen-serve.ts:94`). Der Key existiert bereits: `SessionTarget { channelName, senderId, chatId, threadId }` (`types.ts:88-93`). Für Gruppen-Memory wird als Key `(channelName, chatId)` verwendet.

**Storage layout** spiegelt den bestehenden `~/.qwen/channels/`-Baum wider:

```
~/.qwen/channels/
  sessions.json
  memory/
    <channelName>/                  # sanitize: reject /, .., NUL
      <hash(chatId)>/               # sha256(chatId).slice(0,16) — path-safe, no collision/escape
        QWEN.md                     # group-scoped "learning over time"
        meta.json                   # { channelName, chatId, displayName?, createdAt, lastWriteAt }
```

Der Dateiname berücksichtigt `getCurrentGeminiMdFilename()` (`const.ts:49`). Dies hält Channel-Memory aus dem Working Tree, aus dem gebundenen Workspace und vom hierarchischen `QWEN.md`-Discovery-Pfad fern (sodass es niemals zwischen Gruppen durchsickert).

#### Write Path (Core-Helper erweitern, nicht forken)

In `packages/core/src/memory/writeContextFile.ts`:

- Erweitere `WriteContextFileScope` (`:80`) von `'workspace' | 'global'` um `'channel'`.
- Erweitere `WriteContextFileOptions` (`:83-97`) um `channelKey?: { channelName: string; chatId: string }`; validiere das Vorhandensein, wenn `scope === 'channel'` (spiegle den Absolute-Path-Guard `:142-146` wider). `projectRoot` bleibt laut Interface erforderlich — übergib `config.cwd`, auch wenn es für den Channel-Scope nicht verwendet wird.
- Füge in `resolveContextFilePath()` (`:223-240`) einen `channel`-Branch hinzu, der `path.join(Storage.getGlobalQwenDir(), 'channels', 'memory', sanitize(channelName), hash(chatId), getCurrentGeminiMdFilename())` zurückgibt. **Die aktuelle Signatur der Funktion ist `(scope, projectRoot)` — sie muss um einen `channelKey`-Parameter erweitert werden** (private Funktion, lokale Änderung). Die Pro-File-Mutex keyed auf den aufgelösten Pfad, sodass zwei Gruppen gleichzeitig ohne Konflikte schreiben können.

**Die genaue `ChannelBaseOptions`-Änderung + wer sie injiziert (Fix #3).** `channel-base` kann Core nicht importieren, daher stellt die CLI-Schicht Lese-/Schreibzugriffe als Callbacks bereit. Erweitere den Options-Bag (`ChannelBase.ts:9-12` — das heutige echte Interface ist nur `{ router?: SessionRouter; proxy?: string }`; `config` und `bridge` sind **positionale Constructor-Args** bei `:40-46`, keine Bag-Member). Der Bag enthält bereits `router`:

```ts
// packages/channels/base/src/ChannelBase.ts — ChannelBaseOptions (KEINE neue Core-Abhängigkeit)
export interface ChannelBaseOptions {
  // ...existing members today: router?: SessionRouter; proxy?: string
  /** Liest den destillierten Speicher dieses Channels; null, wenn noch keiner vorhanden. Injiziert von der CLI-Schicht. */
  readChannelMemory?: (target: SessionTarget) => Promise<string | null>;
  /** Hängt an den Speicher dieses Channels an oder ersetzt ihn. Injiziert von der CLI-Schicht. */
  writeChannelMemory?: (
    target: SessionTarget,
    content: string,
    mode: 'append' | 'replace',
  ) => Promise<void>;
}
```

**Wer sie konstruiert und injiziert:** `packages/cli/src/commands/channel/start.ts` (das von Core abhängt). Wenn `start.ts` den Options-Bag für jeden Adapter erstellt, schließt es über das Core-`writeWorkspaceContextFile`/den Lese-Helper und löst das server-vertrauenswürdige `(channelName, chatId)` aus `router.getTarget(sessionId)` (`SessionRouter.ts:94`) auf — der Adapter liefert niemals `chatId` aus dem Wire:

```ts
// packages/cli/src/commands/channel/start.ts — CLI-Schicht (KANN von Core abhängen)
import {
  writeWorkspaceContextFile,
  readChannelContextFile,
} from '@qwen-code/qwen-code-core';

const baseOpts: ChannelBaseOptions = {
  router, // config & bridge sind positionale Args von createChannel(name, config, bridge, baseOpts) — keine Bag-Member
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
      projectRoot: config.cwd, // projectRoot für Channel-Scope ungenutzt, aber vom Interface gefordert
    }),
};
// Adapter wird positional erstellt, mit dem Bag zuletzt: plugin.createChannel(name, config, bridge, baseOpts)
```

Der Adapter fasst niemals das Dateisystem an und `channel-base` erhält keine neue Abhängigkeit. (Phase-2-Daemon-Alternative: eine gescopete `POST /channel/:sessionId/memory`-Route, die `channelKey` serverseitig auflöst; sie kann `POST /workspace/memory` nicht wiederverwenden, da diese `scope ∈ {workspace, global}` hart validiert und ein festes `projectRoot` weiterleitet, `:118-125,185-190`. Verschieben, bis die Proactive-Engine bereits daemon-seitige `sessionId → target`-Lookups benötigt.)

**Event-Fan-out.** `publishWorkspaceEvent` befindet sich auf der **Daemon-Seite** der `AcpSessionBridge` (`bridge.ts:3610`), nicht auf der Channel-Seite. Unter `AcpBridge` (Phase 0) gibt es **kein** `memory_changed`-Event (und es wird auch keines benötigt — ein Prozess besitzt Schreib- und Lesezugriff). Unter der Daemon-Topologie fächert `publishWorkspaceEvent` wahllos an **jeden** aktiven Session-Bus auf (`bridge.ts:3649-3675`); `BridgeEvent.data` ist frei formatiert (`eventBus.ts:51`), sodass ein `memory_changed`-Event `{ scope:'channel', channelName, chatId }` tragen _kann_, aber **Subscriber-seitiges Filtering** ist erforderlich — der Publisher kann die Zustellung nicht einschränken.

#### Read Path (Memory → Prompt) — einmal-pro-Session-Bootstrap unter Wiederverwendung von `instructedSessions`

Erweitere den einmal-pro-Session `instructions`-Block (`ChannelBase.ts:343-347`, gegated durch `instructedSessions`): Bei der ersten Nachricht einer Session, deren Target `(channelName, chatId)` hat, rufe das injizierte `readChannelMemory(target)` auf und stelle das Ergebnis zusammen mit `config.instructions` voran, markiere die Session dann genau wie heute in `instructedSessions`. Da der `'thread'`-Scope eine `sessionId` teilt, lädt dies Memory **einmal pro Session-Lebensdauer** (derselbe Gate, der bereits das erneute Injizieren von `config.instructions` verhindert). Es wird keine Core-Abhängigkeit hinzugefügt — der Lesevorgang läuft über den injizierten Callback. Channel-Memory befindet sich **niemals** auf dem hierarchischen Discovery-Pfad; es wird pro Session durch diesen Hook injiziert.

```ts
// ChannelBase.handleInbound() — First-Turn-Bootstrap (verwendet instructedSessions wieder)
if (!this.instructedSessions.has(sessionId)) {
  const parts: string[] = [];
  if (this.options.readChannelMemory) {
    const mem = await this.options.readChannelMemory(target); // target von router.getTarget(sessionId)
    if (mem) parts.push(mem);
  }
  if (config.instructions) parts.push(config.instructions);
  if (parts.length) promptText = `${parts.join('\n\n')}\n\n${promptText}`;
  this.instructedSessions.add(sessionId);
}
```

#### Beziehung zu SessionRouter-Persist/Restore und dem Transkript

| Schicht | Persistiert | Lebensdauer | Eigentümer |
| ------------------------ | --------------------------------------------------- | ------------------------------------------ | --------------------------------- |
| Session-Transkript | ACP-Konversations-Turns | Bis zur Bereinigung / `/clear confirm` / Neustart | `Session` (der Agent) |
| `SessionRouter`-Persist | `key → { sessionId, target, cwd }` (`:5-9,224-244`) | Über Bridge-Neustart hinweg, via `loadSession()` | `SessionRouter` (`sessions.json`) |
| **Channel-Memory (neu)** | Destillierte dauerhafte Fakten über die Gruppe | Unbegrenzt | `~/.qwen/channels/memory/` |

Wenn `restoreSessions()` das Neuladen einer Session fehlschlägt (`:196`), geht das Transkript verloren, aber die Gruppen-`QWEN.md` bleibt intakt — der Bootstrap-Read rehydriert das Wissen des Agents bei der nächsten Nachricht. **Channel-Memory ist die Recovery-Basis für das Transkript.** "Learning over time" ist eine _Distillations_-Schleife, keine rohe Transkript-Persistenz: Der Agent (oder ein getrigerter Job) fasst regelmäßig wichtige Fakten im Append-Modus in der Gruppen-`QWEN.md` zusammen.

#### Isolierung, Größe und Phasing

Die Isolierung gilt auf Pfad-Ebene (`sales` und `eng` lösen sich in verschiedene `hash(chatId)`-Verzeichnisse/Dateien/Mutexes auf), solange der Write-Path immer die server-vertrauenswürdige `chatId` trägt. Dies ist eine **Content**-Isolierung, keine Auth-Grenze (der Prozess hat immer noch einen einzigen globalen Token, keine Benutzer-Identität). Für eine harte Tenant-Isolierung führe einen Prozess pro Workspace/Tenant aus (OD-2).

Größen-Leitplanken (Wiederverwendung bestehender Mechanismen): Die 16-MB-Beschränkung für bestehende Dateien beim Anhängen wird kostenlos geerbt (mappe `WorkspaceMemoryFileTooLargeError` auf eine für den Benutzer sichtbare Meldung "Gruppen-Memory ist voll, führe einen Compaction-Durchlauf aus"); eine Phase-2-Route verwendet die 1-MB-Beschränkung pro Schreibvorgang wieder (`MAX_MEMORY_CONTENT_BYTES`, `workspace-memory.ts:79`); Replace-Mode-Compaction (`writeContextFile.ts:202-211`) ist die langfristige Antwort auf unbegrenztes Wachstum.

- **Phase 0/1:** Füge den `channel`-Scope + `channelKey` zu `writeContextFile.ts` hinzu; liefere `~/.qwen/channels/memory/` + `meta.json` aus; verdrahte die CLI-Schicht-`readChannelMemory`/`writeChannelMemory`-Callbacks über `ChannelBaseOptions` und den obigen Bootstrap-Read. Keine neue HTTP-Route, keine `channel-base → core`-Abhängigkeit.
- **Phase 2:** Füge die gescopete `POST /channel/:sessionId/memory`-Route (Daemon-Topologie) und `memory_changed` mit Subscriber-seitigem Filtering hinzu; füge einen Distillations-Trigger und eine `qwen channel memory <name> <chatId>`-CLI hinzu. **Distillations-Constraint:** Cron ist Session-gescoped und stirbt bei `dispose()` (`Session.ts:791,799-803,1056`); die Distillation muss feuern, während eine Session aktiv ist — bei Turn-Complete, bei einem expliziten `/remember` oder bei einer warmgehaltenen Session — niemals von einem unabhängigen Background-Scheduler.

### 6.4 Governance: Token-Budgets & Audit-Log (Build Area 4)

Ein Channel-ansässiger Agent, der von jedem Mitglied gesteuert werden kann – und der proaktiv handeln kann – benötigt Ausgabelimits, einen Audit-Trail, der aufzeichnet, _wer_ _was_ angefragt hat, und eine Isolierung pro Identität. qwen-code liefert drei der vier Primitive: `rate-limit.ts` (Pro-Key-Token-Buckets), den `permission-audit.ts`-Ring und `MultiClientPermissionMediator`. Dieser Bereich komponiert sie und schließt die Lücken (kein Kosten-Budget irgendwo; keine Audit-Zeile enthält einen menschlichen Absender). Leitprinzip: **Ablehnen, nicht abschneiden** — aber gemäß Fix #6 lehnt ein _geschätztes_ Budget einen Benutzer-Prompt niemals hart ab; es warnt nur.

#### Welcher Prozess besitzt die Governance?

| Deployment | Bridge | Welche `serve/`-Mechanismen verfügbar sind |
| --------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **Phase 0 — `qwen channel start` / `AcpBridge`** | spawnt sein eigenes `--acp`-stdio-Child (`start.ts:213,356`) | **Keine.** Kein Express-Server, keine `rate-limit.ts`, keine HTTP-Routen, kein `permission-audit.ts`-Ring. |
| **Phase 1+ — `qwen serve` + `DaemonChannelBridge`** | Channels im Daemon gehostet | Alles aus `serve/`: echte Nutzung, Mediator, Rate-Limit, Audit-Ring, Routen. |

Lösung: **Budget-Zulassung + Ablehnung leben in `@qwen-code/channel-base`** (dem gemeinsamen Engpass `ChannelBase.handleInbound()`), in einer neuen **`packages/channels/base/src/BudgetLedger.ts`** — _nicht_ `serve/budget.ts`, da der Phase-0-Channel-Prozess `serve/` niemals lädt und die Channel-Schicht der einzige Ort mit menschlichem Absender-Kontext ist. **Audit + Attribution** entstehen ebenfalls in der Channel-Schicht. Auf dem Phase-1+-Daemon-Pfad liest das Ledger echte Nutzung und wird _zusätzlich_ über eine Route angezeigt; auf dem Phase-0-Pfad schätzt es und wird über einen Channel-Befehl (`/audit`) offengelegt.

#### Wo Governance heute andockt (und die Lücken)

| Anliegen | Bestehender Mechanismus | Lücke |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Request-Rate-Throttling | Pro-`(clientId\|ip)`-Token-Buckets, 3 Stufen (`rate-limit.ts`) | Keine Tokens/Kosten, nur Request-Anzahl; nur `serve/` |
| Nachträgliche Decision-Log | Begrenzter FIFO-Ring, 5 Record-Typen (`permission-audit.ts`) | Keine menschliche `senderId`, nur `clientId`; keine GET-Route; Ring Closure-gehalten (`:17-25`) |
| Echte Pro-Action-Approval | Vier Policies + Konsens-Quorum (`permissionMediator.ts:621-637`) | Votes werden `clientId` zugeordnet, nicht dem Menschen; ein Channel = ein Client |
| Pro-Channel-Tool/Data-Scope | `coreTools`/`allowedTools`/`excludeTools` (`config.ts:727-729`); `getPermissionsAllow()` (`:3158`); `getPermissionsDeny()` (`:3182`); MCP-Allow-Filter (`:3327-3333`) | Scope ist pro `Config`/Prozess; kein Spawn-Arg-Pfad in das `--acp`-Child |

Zwei strukturelle Fakten: (1) **Der Daemon hat keine menschliche Identität** (`BridgeEvent.originatorClientId`, jedes `PermissionVote.clientId` sind Transport-Identifikatoren; `senderName` überlebt nur bis `SenderGate.check()`), daher muss jede Korrelation Mensch↦`clientId`↦`sessionId` an der Channel-Grenze hergestellt werden; (2) **Auth und Rate-Limit sind Daemon-global** (einzelner Bearer-Token `auth.ts:259-266`; Rate-Limit keyed `(clientId, ip)`), daher muss die Pro-Channel-Governance im Adapter entstehen.

#### Token- & Kosten-Budgets — ein neues `BudgetLedger`, beratend bis echte Nutzung existiert (Fix #6)

**Woher die Nutzung kommt — Einschränkung (OD-9).** Ein Token-Budget kann nur _echte_ Zahlen abbuchen, sobald das Modell die Nutzung meldet. In-Session speichert `Session.#recordPromptTokenCount()` (`Session.ts:2078-2087`) `usageMetadata.promptTokenCount` in `lastPromptTokenCount`, **jeden Turn überschrieben** — _kein_ kumulatives Abrechnungsmeter. Auf dem Phase-0-`AcpBridge`-Pfad transportiert der ACP-`session/update`-Stream keine `usageMetadata`, daher **kann v1 dort keine echten Token-Zahlen abbuchen**. Auf dem Phase-1+-Daemon-Pfad beobachtet der Daemon die Nutzung In-Process und _kann_ präzise abbuchen.

**Durchsetzungsregel (Fix #6 — tragend):**

- **Geschätzte Budgets sind NUR BERATEND.** Wenn die einzige verfügbare Zahl eine Channel-seitige Schätzung ist (Prompt+Response-Zeichenanzahl ÷ eine Zeichen-pro-Token-Konstante), **warnt/alertet** das Ledger bei Schwellenwerten und kann eine Warnung an die Antwort anhängen — es **lehnt einen Benutzer-Prompt niemals hart ab**. Eine falsch-positive Schätzung darf eine echte Benutzeranfrage nicht zum Schweigen bringen.
- **HART-Ablehnung nur bei echten Zahlen.** Ein Budget darf einen Prompt nur dann _ablehnen_ (ablehnen-nicht-abschneiden), **wenn** die Abbuchungsquelle der echte Daemon-Nutzungspfad ist (Phase-1+ daemon-gehostet). Bis dahin ist das Budget Observability + Alerting, kein Gate.

Dies macht das v1-Budget ehrlich: Es warnt überall frühzeitig und setzt harte Limits genau dort durch, wo die Zahlen vertrauenswürdig sind.

**Modul `BudgetLedger.ts`**, modelliert nach `rate-limit.ts` (Factory, Map-of-Buckets mit GC, Overflow-Fail-Open):

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

- **Default-Inherit-Semantik + Strictest-Wins-Org-Rollup (OD-9).** `admit(key)` löst das effektive Fenster mit dem `GroupGate`-artigen `channel → '*' → built-in`-Fallback auf. Ein Prompt muss **sowohl** das Pro-Channel-Fenster als auch das **Pro-Prozess-"Org"-Rollup** bestehen (Strictest-Wins, beide abbuchen). "Org" = _das Rollup dieses einzelnen Prozesses_; eine echte Cross-Process-Org-Beschränkung benötigt einen Shared Store (außerhalb des Scopes). **Festes tägliches Fenster.**
- **75%/95%-Alerts.** `debit()` feuert `onAlert` einmal pro Schwellenwert pro Fenster, unter Verwendung des Event-Bus-Hysterese-Idioms (`WARN_THRESHOLD_RATIO`/`WARN_RESET_RATIO`, `eventBus.ts:101-103`). **Das Posten des Alerts ist ein Proactive-Send** — eine harte Abhängigkeit von Build Area 2 (DingTalk-Cold-Group-Einschränkung; Feishu postet frei). Degradiere zu "Warnung an die nächste Antwort anhängen", wenn kein Proactive-Channel existiert.
- **Decline-not-truncate (nur wenn `source==='daemon'`).** Wird bei der Zulassung geprüft, _vor_ `bridge.prompt()` (`:425`). Bei echter Nutzung `!allowed` ruft der Adapter `sendMessage(chatId, refusal)` auf und kehrt zurück — er betritt **nicht** den Steer/Cancel-Pfad, sodass ein laufender Prompt abgeschlossen wird und der _nächste_ abgelehnt wird. Bei einer Schätzung ist `allowed` immer true (beratend).
- **Kosten (`usd`)** multiplizieren Tokens mit einer vom Operator bereitgestellten Pro-Modell-Ratetabelle (qwen-code ist Multi-Modell; kein einzelner Preis). Fehlender Eintrag → Fallback auf `tokens` + einmalige Warnung.
- **Config.** `ChannelConfig` (`types.ts:27-51`) erhält `budget?: { unit; limit; windowMs; reset? }`, geparst von `parseChannelConfig`. Auf dem Daemon-Pfad erhält `ServeOptions` `--budget-org-daily`/`--budget-unit`, und `daemon-status.ts` (das bereits `rateLimit` meldet, `:295-297`) erhält einen parallelen `budget`-Block.
#### Audit-Log – menschliche `senderId` wird mit dem Turn mitgeführt (Fix #7)

`PermissionAuditRing` (`permission-audit.ts:128-172`, FIFO 512) ist die richtige Grundlage, aber jede Zeile ist auf `clientId` key-basiert. **Design – eine sender↦turn-Bindung auf Channel-Seite** (`RequestAttributionRing.ts`, gleiche FIFO-Struktur).

**Der naive Timestamp-Join ist bei `followup` falsch (Fix #7).** v1 schlug vor, eine Permission-Zeile mit "der aktuellsten Attributions-Zeile für diese `sessionId`, deren `recordedAtMs` vor dem `issuedAtMs` der Permission liegt", zu joinen. Bei `followup` reihen sich mehrere Sender über `sessionQueues` in **eine** `sessionId` ein; der zuletzt _eingereihte_ Sender ist häufig **nicht** derjenige, dessen Turn _ausgeführt_ wird, wenn der Tool-Call/die Permission feuert. Der Timestamp-Join führt daher zu einer systematischen Fehlzuordnung.

**Fix: `senderId` MIT dem gequeueten Prompt mitführen.** Wenn `handleInbound()` in `sessionQueues` einreiht (und wenn der Scheduler einen Proactive-Fire einreiht), trägt das Queue-Item / der synthetische Turn-Kontext sein eigenes `{ senderId, senderName, requestSeq }`. Die Attribution für jeden Tool-Call/jede Permission, die während eines Turns ausgelöst wird, wird aus **dem aktuell ausgeführten Turn** (dem Kopf der FIFO) gelesen, nicht aus einem Timestamp-Scan. Konkret: Die `sessionQueues`-Kette stempelt einen turn-spezifischen `currentTurnAttribution.set(sessionId, {senderId, ...})` in dem Moment, in dem der Run den Kopf erreicht (kurz vor `bridge.prompt()`), und löscht ihn, wenn der Run aufgelöst wird; Audit-Zeilen lesen diese Map. Proactive-Fires stempeln `createdBy` auf die gleiche Weise (§6.2 Schritt 3). Dies ist exakt für den ausgeführten Turn und immun gegen die Einreihungsreihenfolge.

Füge bei der Zulassung (admission) einen sechsten Zeilentyp **`task.requested { sessionId, senderId, channelName, chatId, promptDigest, requestedAtMs }`** hinzu, damit das Audit die Frage "wer hat diese Aufgabe gestartet" auch für Read-Only-Arbeit beantwortet. Die `PermissionAuditEntry`-Union (`:57-104`) ist **geschlossen** und Consumer switchen über `kind`, daher betrifft eine Erweiterung (oder das Hinzufügen eines Sibling-Rings) jeden Consumer.

**Query-Pfad.** Phase-1+-Daemon: Füge `GET /workspace/audit` hinzu (Bearer + `createMutationGate` strict, `auth.ts:356`), wobei der Ring über den Bridge-Closure bereitgestellt wird (die Header-Doku der Datei sieht dies vor, `:22-25`). Phase-0-`AcpBridge`: ein `/audit`-Channel-Befehl via `sendMessage`. **Durability:** Der Ring umfasst 512 In-Memory-Einträge, die **bei einem Neustart verloren gehen** – eine bekannte v1-Einschränkung; der Follow-up (OD-11) persistiert ein **append-only joined audit nach `~/.qwen`**.

**Consensus-Voter sind keine Menschen.** `votersAtIssue` sind vom Daemon gestempelte `clientId`s, und ein Channel = eine `clientId`, daher ist der "Consensus" in einer DingTalk-Gruppe out-of-the-box ein Consensus zwischen _Daemon-Clients_. Voting auf Menschenebene erfordert ein Registered-Approver-Roster, das `senderId` auf eine eindeutige Stimme mappt – die OD-3-Phase-2-Anforderung, kein bereits gelöstes Feature.

#### Identitätsbezogene Tool- & Daten-Isolation

1. **Channel-spezifisches Tool-Allow/Deny.** `Config` unterstützt `coreTools`/`allowedTools`/`excludeTools` (`:727-729`), bereitgestellt über `getPermissionsAllow()`/`getPermissionsDeny()`/`getCoreTools()`. (Es gibt **kein** `getAllowedTools()`/`getBlockedTools()`.) In Phase 0 spawnt der `AcpBridge`-Pfad einen Child-Prozess pro Channel, aber `AcpBridgeOptions` trägt nur `{ cliEntryPath, cwd, model }` (`:17-21`) und `start()` leitet nur `--acp`+`--model` weiter (`:56-63`). Die Umsetzung eines channel-spezifischen Scope erfordert NEUE `AcpBridgeOptions`-Felder, NEUE `--acp`-Flags in `Config` sowie neue `ChannelConfig`-Felder. Auf dem Phase-1+-Daemon-Pfad gibt es eine `Config` pro Daemon, der Scope ist also pro Daemon (pro Workspace, OD-2) und nicht pro Channel-Child.
2. **Channel-spezifisches MCP-Scoping.** `Config.getMcpServers()` filtert nach `allowedMcpServers` (`:3327-3333`), gesetzt bei der Konstruktion. Füge `allowMcpServers?: string[]` zu `ChannelConfig` hinzu, eingefädelt in denselben Spawn-Arg-Pfad (oder das `mcpServers`-Array, das `AcpBridge.newSession()` übergibt – hartcodiert `[]` bei `:133`).
3. **`sessionScope` als Daten-Grenze.** `'thread'` lässt eine Gruppe einen Working Tree/Kontext teilen; die _channelübergreifende_ Isolation wird durch `channelName`-namespaced Routing-Keys erzwungen. Die Isolation pro Sender innerhalb einer `'thread'`-Gruppe ist designbedingt _nicht_ gegeben.

**Ehrliche Einschränkung:** Auth ist ein einzelner daemon-globaler Token ohne benutzerspezifische Principal, daher ist die Isolation pro **Channel**, nicht pro Mensch. Eine echte Tool-Isolation pro Mensch erfordert Phase 3.

#### Admission-Pfad

```
DingTalk eingehend
  → ChannelBase.handleInbound()
     1. GroupGate.check() + SenderGate.check()                 [vorhanden :240-252]
     2. budget.admit('channel:<name>') && budget.admit('org')  [NEU]
            ↳ source==='daemon' && !allowed: sendMessage(refusal); return  (NICHT in steer/cancel)
            ↳ source==='estimate': allowed immer true → nur WARN (Fix #6)
     3. in sessionQueues einreihen MIT {senderId, senderName, requestSeq}  [NEU — Fix #7]
        + task.requested-Zeile
     4. am FIFO-Kopf, currentTurnAttribution stempeln → bridge.prompt(...)   [vorhanden :425]
            ↳ Tool-Call → Permission (auto-approved bei AcpBridge Phase 0; Mediator bei Daemon Phase 1+)
                ↳ Audit-Zeile liest currentTurnAttribution[sessionId]  (der AUSGEFÜHRTE Turn)
     5. bei Abschluss: Usage bekannt (Daemon) oder geschätzt (AcpBridge) → budget.debit(..., source)  [NEU]
            ↳ 75%/95% Alert-Post ist proaktiv → abhängig von Build Area 2
```

Harte Abhängigkeiten, die erwähnt werden müssen: (1) Echtes Token-Debiting (und damit Hard-Decline) erfordert den Phase-1+-Daemon-Usage-Pfad – bis dahin sind Budgets nur beratend (Fix #6); (2) Proaktive Budget-Alerts benötigen Build Area 2; (3) Consensus-Voting auf Menschenebene und Audit-Attribution auf Menschenebene erfordern das OD-3-Registered-Approver-Roster.

### 6.5 DingTalk-Plattform (primär) + Feishu-Follow-up

> **Wiring-Hinweis (festgeschriebene Architektur).** Phase 0: `qwen channel start` konstruiert `AcpBridge` (`start.ts:213,350`; `AcpBridge.ts:38`), was `node <cli> --acp` spawnt und `newSession(cwd)`/`loadSession(sessionId, cwd)` (`:131,137`) bereitstellt; das Session-Scoping liegt bei `SessionRouter`, nicht bei der Bridge. Phase 1+: Channels werden unter `qwen serve` via `DaemonChannelBridge` gehostet (seine `'thread'`-Defaults bei `:229,240`; sein Overlap-Throw bei `:257-261`). Die Migration ist festgeschrieben, nicht optional (§1).

#### Das sessionWebhook-Expiry-Problem

Der DingTalk-Stream-Modus liefert jeden Inbound mit einem kurzlebigen `sessionWebhook` aus; der Adapter cacht ihn, gekeyt nach `conversationId` (`:84`, befüllt in `onMessage()` `:517`), und `sendMessage()` (`:134-170`) schlägt ihn nach, loggt `No webhook for chatId` und kehrt still zurück, wenn er fehlt (`:137-141`). Zwei fatale Fakten für die proaktive Nutzung: (1) Der Webhook **läuft ab** (der SDK-Typ `RobotMessageBase` enthält `sessionWebhookExpiredTime`, `constants.d.ts:13`, aber das `DingTalkMessageData`-Interface des Adapters lässt es weg und liest es nie – ein gecachter Webhook kann selbst innerhalb des Hot-Windows veraltet sein); (2) Die Map wird **nur** durch Inbound-Traffic befüllt, eine kalte Gruppe hat also keinen Eintrag.

#### Cold-Group-Push über die Robot-Proactive-Message (主动消息) API — VERIFIZIERT (OD-7)

Die Lösung ist die Bot-Proactive-Message-API von DingTalk – **`POST https://api.dingtalk.com/v1.0/robot/groupMessages/send`** _(Endpunkt hoch verifiziert)_. Im Gegensatz zum Webhook wird sie über die dauerhafte **`openConversationId`** adressiert _(hoch verifiziert)_, authentifiziert sich mit dem **`x-acs-dingtalk-access-token`**-Header _(hoch verifiziert – bereits verwendet von `emotionApi()` `:188-207` und `downloadMedia()` `media.ts:36-43`)_, und trägt den **`robotCode`** des Bots _(hoch verifiziert; = `config.clientId`, `:184,435`)_. Der Body ist ein `msgKey`/`msgParam`-Paar _(hoch verifiziert)_, wobei **`msgParam` selbst ein JSON-kodierter String** (kein verschachteltes Objekt) ist, z. B. für `msgKey:'sampleMarkdown'`:

```jsonc
{
  "robotCode": "ding...", // = config.clientId
  "openConversationId": "cid6KeBBLov...", // dauerhafte Gruppen-ID (von eingehender conversationId; konvertieren falls ungültig)
  "msgKey": "sampleMarkdown",
  "msgParam": "{\"title\":\"<preview title>\",\"text\":\"# hi\\n...markdown ≤ ~5000 chars\"}",
}
```

Dies ist eine **neue Methode neben `sendMessage()`**, keine Änderung daran (Skizze in §6.2). `ChannelBase.sendMessage()` bleibt abstrakt (`:81`); die Proactive-Engine benötigt die neue `pushProactive?(target, text)` Outbound-Schnittstelle – komplett neu und das zentrale Plattform-Deliverable. **`verifiziert [hoch] lt. offizieller Send-Doku + aliyun ask/559227, ask/585232 + Message-Type-Doku`** für Endpunkt/Params/`msgParam`-Form.

**Permission-Voraussetzung:** Eine "send proactive group chat message" Robot/Message-Permission muss der unternehmensinternen App gewährt werden, bevor `groupMessages/send` funktioniert (die Send-Doku listet diese Voraussetzung auf) _(hoch verifiziert, dass eine Permission aktiviert sein muss)_. **WEITERHIN MARKIERT (geringe Konfidenz):** Der genaue Anzeigename/Code der Permission-Stelle ist aus den Docs dieser Session nicht fixiert – die DingTalk-Konsole zeigt sie unter 权限管理 der App als Robot/Message-Sending-Permission an (üblicherweise die Robot-Message-Familie, z. B. `qyapi_robot_sendmsg` / 企业机器人发送消息权限); in der Konsole bestätigen, den Code **nicht** hart annehmen. Der Adapter muss `resp.status` + Body bei `!resp.ok`/throw loggen – der aktuelle `emotionApi`-Empty-Catch (`:214-216`) ist das Anti-Pattern, das eine Missing-Permission-Fehlkonfiguration verbergen würde.

#### Abrufen und Persistieren der openConversationId

Zwei Quellen: (1) **Aus Inbound ernten** – jede Nachricht trägt `conversationId` (`:506`), weitergeleitet als `openConversationId` an die Emotion-API (`:197`); persistiere sie in dem Moment, in dem wir sie sehen. **`verifiziert [mittel] lt. aliyun ask/559227, ask/585233 + passendem 'cid'-Format`**, dass die Callback-`conversationId` (cid-präfixiert) direkt als `openConversationId` für den Standard-Gruppen-@-Callback verwendbar ist. **WEITERHIN MARKIERT:** Kein offizieller Wortlaut setzt sie für einen Non-Cool-App-Robot gleich; der durch die Doku garantierte Beschaffungspfad ist die **`chatId → openConversationId` Conversion-API** (`obtain-group-openconversationid`), oder das Erfassen über die Group-Create-API / `chooseChat` JSAPI, oder einen Cool-App-Callback (der `openConversationId`+`coolAppCode` direkt liefert). **Fallback:** Bei `invalid.openConversationId` über die `chatId`-API konvertieren und erneut versuchen. (2) **Bot-added-to-group-Events** via `registerAllEventListener` (`client.mjs:58-61`): Events fließen unter dem Default-`topic:'*'` (`client.mjs:14-19,241-254`) als `onEvent → onEventReceived`, während der Adapter nur den Robot-_Callback_ (`:107`) installiert, sodass Org/Bot-Events derzeit empfangen und in den No-Op-Default verworfen werden (`client.mjs:35-37`). Das Event-Topic und das `openConversationId`-Feld zum Installationszeitpunkt sind **unverifiziert** – keinen Event-Namen hartcodieren.

**Persistenz.** Verwende einen **separaten `~/.qwen/channels/dingtalk-groups.json`**-Store, nicht das `SessionRouter`-Target: Die Gruppen-ID muss jede Session überleben (Cron-gesteuerter Cold-Group-Push feuert ohne Live-Session), und ein `PersistedEntry` existiert erst, sobald eine Session für den Routing-Key erstellt wurde – die Kopplung der Gruppenidentität an die Session-Lebensdauer lässt kalte Gruppen unberücksichtigt.

#### Multiplayer-Scope ist Opt-in, nicht der Default

Der `'thread'`-Scope (`:53`) ist es, der einer Gruppe einen gemeinsamen Agenten gibt, aber `parseChannelConfig()` setzt `sessionScope` standardmäßig auf `'user'` (`config-utils.ts:91-92`), was _pro-Mitglied_-Sessions ergibt. Der Operator muss explizit `sessionScope: 'thread'` setzen. Wenn gesetzt, gelten zwei Multiplayer-Konsequenzen: (a) Der Default-`dispatchMode: 'steer'` **bricht** laufende Arbeit ab, wenn ein beliebiges Mitglied eine Nachricht sendet (`:371-379`) – das Tag-Profil setzt `'followup'` (§6.1); (b) die Sender-Attributions-Lücke (§6.1).

#### Inbound-@-Parsing

Group-Gating funktioniert: `GroupGate` verwendet `envelope.isMentioned`, gesetzt aus `data.isInAtList` (`:520`). Die Textbereinigung entfernt nur das **erste** `@token` (`:527-529`), positionsbasiert, nicht identitätsbasiert – `@qwen @alice` ist korrekt, aber eine Human-First-Erwähnung würde die des Humans entfernen. Ein härtender Follow-up entfernt anhand der eigenen `chatbotUserId` des Bots. Reply/Quote-Kontext wird extrahiert (`extractQuotedContext()`, `:272-298`), wobei `isReplyToBot` gegen `chatbotUserId` (`:280,292`) berechnet und `referencedText` als `[Replying to: "…"]` (`ChannelBase.ts:317-319`) injiziert wird. **Die Sender-Attribution wird in §6.1** über das `[senderName]`-Präfix geschlossen.

#### Markdown- / Card-Rendering

`markdown.ts` übernimmt bereits die Plattform-Normalisierung, die der Proactive-Pfad wiederverwendet: Tabellen → Pipe-Text (`convertTables()`, `:44-80`), Chunking bei 3800 Zeichen mit Fence-Balancing (`splitChunks()`, `:84-188`; `CHUNK_LIMIT=3800`, `:10`), Title-Extraktion auf 20 Zeichen geschnitten mit Fallback `'Reply'` (`extractTitle()`, `:190-195`). Die Wiederverwendung ist **bedingt** dadurch, dass das `sampleMarkdown`-Template dieselbe Markdown-Subset und einen Body bis zu **~5000 Zeichen** akzeptiert _(hoch verifiziert – Message-Type-Doku)_; halte `CHUNK_LIMIT` ≤ diesem Budget. Streaming Interactive Cards (der `TOPIC_CARD`-Pfad, `constants.d.ts:4`) – das Analogon zur Feishu-Streaming-Card – sind **out of scope** für das primäre Milestone; v1 Proactive basiert auf Markdown-Messages.

#### Feishu-Follow-up (kurz)

Feishu ist genau auf der Achse voraus, die zählt: **Proaktives Senden ist nativ** (`sendMessage(chatId, text)` an jede `chat_id`, `:622-676` – kein Cold-Group-Problem; `canColdSend = true`), **stabiler `tenant_access_token`** mit Expiry-getracktem Refresh (`refreshToken()`, `:581-620` – die Arbeit, die DingTalk noch bevorsteht), **flexible Event-Subscription** (WebSocket oder HMAC-Webhook, `:146-176`) und **First-Class-Streaming-Cards** (`markdown.ts`, `:742-792`). **Aber die geteilten `ChannelBase`/`SessionRouter`-Probleme – Opt-in-`'thread'`-Scope, `dispatchMode`-Abbruch, fehlende Sender-Attribution, die neue Outbound-Schnittstelle – gelten identisch für Feishu.** Feishu löst _Erreichbarkeit_, nicht _wer-hat-was-gesagt_ oder _ein-Mitglied-bricht-ein-anderes-ab_. Die Portierung der Proactive-Engine auf Feishu verwendet direkt das bestehende `sendMessage()` wieder (der Base-`pushProactive`-Default); die einzige neue Plattformarbeit besteht darin, die Zielgruppe der Engine auf eine persistierte `chat_id` zu mappen und optional über den Streaming-Card-Pfad zu routen.

---

## 7. Phasen-Rollout (Phase 0–2) & MVP

Jede Phase ist unabhängig mergebar, endet demo-fähig und wird durch explizite Akzeptanzkriterien gegatet. **Phase 0** bringt den bestehenden Stack dazu, sich wie ein geteilter Resident-Agent zu verhalten – Konfiguration plus ein paar kleine Code-Änderungen auf `AcpBridge`. **Phase 1** migriert das Channel-Hosting in `qwen serve` (festgeschriebene Architektur) und fügt die Proactive-Engine sowie die einzelne MVP-Closed-Loop hinzu. **Phase 2** fügt Channel-Memory, Budgets und Audit hinzu.

### Topologie: Festgeschriebene Daemon-Migration (war OD-1)

Die Entscheidung ist **getroffen**, nicht ausstehend: Phase 0 shipped auf `AcpBridge`; **Phase 1+ betreibt Channels unter `qwen serve`** (via `DaemonChannelBridge` oder einem Daemon-Channel-Runner), da Per-Room-Memory-Persistenz, der Permission-Mediator, der Event-Bus-Audit, die FIFO-`promptQueue` und die Budget/Audit-Query-Routen alle den Daemon wollen. Der Gateway-eigene Scheduler (§6.2) ist **migrationsneutral** – er serialisiert über `ChannelBase.sessionQueues` unabhängig von der Bridge – daher shipped er in Phase 1 und ist vom Cut-over unberührt. **Das Phase-0-Wiring fügt den `DaemonChannelBridge`-Attach-Pfad (oder ein `--daemon <url>`-Flag) hinzu**, sodass die Migration ein Konfigurationsschritt an der Phase-1-Grenze ist und kein Rewrite. Beachte die scharfe Kante, um die der Scheduler herum designed ist: `DaemonChannelBridge.prompt()` queued **nicht** – es _wirft_ `Prompt already in flight` bei Overlap (`:257-261`); die Daemon-FIFO-`promptQueue` ist auf Acp-Bridge-Seite (`bridge.ts:2855,3082`); die Channel-seitige Serialisierung ist `ChannelBase.sessionQueues` (`:394`), weshalb die Proactive-Engine niemals `prompt()` aufruft, während ein Turn aktiv ist (§6.2, Fix #1).

### Phase 0 — Config + Identity Injection (auf `AcpBridge`)

**Ziel.** Eine DingTalk-Gruppe, in der jedes Mitglied den Bot `@`-erwähnt, jedes Mitglied eine Session teilt, der Agent weiß, wer spricht, und eine laufende Aufgabe nicht durch das Follow-up eines Teamkollegen zerstört wird.

**0.1 — Das "qwen tag" Config-Profil** (hauptsächlich `settings.json`):

```jsonc
// settings.json → channels."team-eng"
{
  "team-eng": {
    "type": "dingtalk",
    "clientId": "$DINGTALK_CLIENT_ID",
    "clientSecret": "$DINGTALK_CLIENT_SECRET",
    "cwd": "/srv/repos/our-service",

    // Multiplayer: GESAMTE Gruppe teilt EINE sessionId. routingKey → ${name}:${threadId||chatId} (:53).
    // DingTalk setzt KEINE threadId (:541-551) → Key fällt auf chatId = conversationId||sessionWebhook zurück (:534).
    // Eine Nachricht ohne conversationId würde auf den TRANSIENTEN Webhook keyen – als Hard Error behandeln.
    "sessionScope": "thread",

    // groupPolicy ist standardmäßig "disabled" (GroupGate :13; config-utils :98) – MUSS gesetzt werden, sonst droppen alle Gruppen-Nachrichten.
    // Im Allowlist-Modus ist "*" KEIN Mitgliedschafts-Wildcard (GroupGate :42); liste jede chatId auf. "*" liefert nur DEFAULTS.
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

Hinweise, die an die Ground Truth gebunden sind: `requireMention` ist standardmäßig `true` (`GroupGate.ts:49`); `sessionScope` ist standardmäßig `'user'` (`config-utils.ts:92`) – `'thread'` ist der gesamte Multiplayer-Mechanismus; der `dispatchMode`-Gruppen-Default sollte `'followup'` sein (nicht der Runtime-`'steer'`, `:354`).

**0.2 — Sender-Attribution.** Das `[senderName]`-Präfix beim `promptText`-Seed (`ChannelBase.ts:316`), gegatet durch `isGroup`, **feuert jeden Turn** (nicht gegatet durch `instructedSessions`), wobei das **neue `Envelope.alreadyPrefixed`**-Flag den `collect`-Re-Entry bewacht. Siehe §6.1.

**0.3 — `dispatchMode`-Abgleich.** Setze den `dispatchMode` pro Gruppe explizit; fixe die veraltete `types.ts:42` JSDoc (`'collect'` → `'steer'`), damit Code und Kommentar übereinstimmen (OD-5).

**Berührte Dateien (Phase 0).** `start.ts` (füge den optionalen `DaemonChannelBridge`-Attach-Pfad hinzu, sodass die festgeschriebene Migration von Phase 1 nur ein Flag entfernt ist); `ChannelBase.ts` (`senderName`-Seed + `alreadyPrefixed`-Guard + `/clear`-Confirm+Allowlist-Gate + `/who`); `types.ts` (neues `Envelope.alreadyPrefixed`-Feld + JSDoc-Fix); `docs/` (das Rezept + Gotchas).

**Akzeptanzkriterien.**

- [ ] Zwei Mitglieder @-erwähnen den Bot; beide lösen sich in dieselbe sessionId auf (assert via SessionRouter-Maps); Routing-Key ist team-eng:<conversationId>, keine Webhook-URL.
- [ ] Der Agent nutzt Sender-Attribution ([senderName] vorhanden für Gruppe, fehlend für 1:1); collect-Re-Entry präfixiert nicht doppelt (asserted alreadyPrefixed-Pfad).
- [ ] Eine Gruppen-Nachricht ohne Erwähnung droppt (Grund mention_required); eine nicht-allowlistete Gruppe droppt (not_allowlisted).
- [ ] Bei dispatchMode: 'followup' bricht eine Nachricht von Mitglied B während der Aufgabe von Mitglied A diese nicht ab; B's Nachricht läuft nach A.
- [ ] In einer geteilten (thread) Gruppe erfordert /clear ein Confirm und ist auf config.allowedUsers beschränkt, wenn gesetzt (kein Free-for-all-Reset); /status bleibt read-only.
- [ ] Hook-Level-Unit-Tests (keine wait(ms)-UI-Tests): Routing-Key-Gleichheit über Sender hinweg; promptText-Präfix-Vorhandensein für isGroup true vs false; alreadyPrefixed-Skip.

### Phase 1 — Daemon-Migration + Proactive-Engine + die MVP-Closed-Loop

**MVP-Definition.** Eine **einzelne Scheduled-Digest-Closed-Loop**: Ein Operator registriert einen Cron-artigen Job für einen Channel; beim Feuern löst das Gateway die Thread-scoped Session des Channels auf, führt einen Prompt mit Tools aus und **postet das Ergebnis ungefragt zurück in den kalten Channel**. Ein Job, ein Channel, ein Delivery-Pfad. Reichhaltigeres Verhalten ist out of scope für das MVP.

**Festgeschriebene Migration.** Phase 1 hostet Channels unter `qwen serve` via `DaemonChannelBridge` (die OD-1-Entscheidung), erbt die FIFO-`promptQueue`, den Mediator, den Eventbus und die Routen. Die Proactive-Engine ist §6.2 (Gateway-eigener, migrationsneutraler Scheduler; `dispatchProactive` serialisiert durch `sessionQueues`; DingTalk-Cold-Send-Fallback über die verifizierte `groupMessages/send`-API; `tokenManager`-Refresh; `canColdSend`-Capability-Flag). Drei Fakten machen es nicht trivial: Cron ist heute Session-scoped und stirbt beim Dispose (geschlossen durch das OD-8-Sole-Owner-Gate); DingTalk kann keine kalte Gruppe benachrichtigen (geschlossen durch die verifizierte Proactive-API + persistierte `openConversationId`); und der Proactive-Prompt muss sich durch `sessionQueues` serialisieren und **niemals** `bridge.prompt()` aufrufen, während `activePrompts` gehalten wird – andernfalls wirft `DaemonChannelBridge` `Prompt already in flight` (`:257-261`).
**Geänderte Packages.** `ChannelCronStore.ts`/`ChannelCronScheduler.ts` (neu, channel-base); `cronParser.ts` (Wiederverwendung); `ChannelBase.ts` (`dispatchProactive`, `pushProactive`, `canColdSend`-Flag, `/schedule`); `DingtalkAdapter.ts` + `dingtalk/src/proactive.ts` (neuer Cold-Send + persistiertes `openConversationId` + `tokenManager`); `FeishuAdapter.ts` (keine Änderung; Referenz für proactive-fähigen Adapter, `canColdSend = true`); `start.ts` (Host unter Daemon; Scheduler nach `restoreSessions()` konstruieren + starten; `isTagSession` in die Session-Konstruktion einschleusen, damit der In-Session-Cron deaktiviert wird — OD-8); Session-Konstruktion (`startCronScheduler()` für Tag-Sessions überspringen, `Session.ts:667-668`).

**Akzeptanzkriterien.**

- [ ] Channels laufen unter `qwen serve` (daemon-gehostet); ein Tool-Call zeigt einen `permission_request` an (Mediator erreichbar), was die Migration bestätigt.
- [ ] Ein Operator registriert einen Digest-Job; dieser übersteht einen Gateway-Neustart (wird aus `~/.qwen/channels/cron.json` neu geladen).
- [ ] Wenn der Job bei **keiner geöffneten Session** feuert, löst das Gateway die Thread-scoped Session auf, führt den Prompt mit Tools aus und liefert über den Cold-Send-Pfad an die inaktive DingTalk-Gruppe — was die Cold-Group-Zustellung beweist. Die Engine **schlägt laut fehl** (loggt, zeichnet `lastError` auf, macht kein stilles No-Op) bei `canColdSend = false`.
- [ ] Derselbe Job liefert auf Feishu via `tenant_access_token` aus, was die `canColdSend`-Abstraktion beweist.
- [ ] Ein feuender Job verletzt nicht das One-Prompt-per-Session-Prinzip: Wenn sich ein Mitglied mitten in einer Konversation befindet, reiht sich der Proactive-Prompt über `sessionQueues` dahinter ein (await `activePrompts.get(sessionId)?.done`), bricht nie per `steer` ab und löst nie den Overlap-Throw von `DaemonChannelBridge` aus.
- [ ] Ein Proactive-Turn kann nicht durch einen späteren Human-Turn abgebrochen werden (Tag-Gruppen sind `followup`, nie `steer`).
- [ ] Der `tokenManager` aktualisiert den v1.0 `accessToken` vor dem Ablauf nach ~2 h und bei 401, sodass ein Send nach > 2 h geöffnetem Socket weiterhin erfolgreich ist.
- [ ] Kein Double-Fire eines beliebigen Durable-Jobs: Der Gateway-Scheduler ist der alleinige Owner; eine Tag-Session aktiviert ihren In-Session-Cron nicht (OD-8); die beiden Stores liegen auf disjunkten Pfaden.
- [ ] Das Löschen des Jobs stoppt zukünftige Fires.
- [ ] Hook/Service-Level-Tests (Scheduler gegen eine Fake-Clock; Cold-Send gegen einen gemockten HTTP-Client) — kein `wait(ms)`.

### Phase 2 — Channel Memory + Token Budgets + Audit Log

**2.1 — Channel-scoped Memory** (§6.3): `'channel'`-Scope + `channelKey` zu `writeContextFile.ts` hinzufügen (`WriteContextFileScope` `:80`, `WriteContextFileOptions` `:83-97`, `resolveContextFilePath` `:223-240`); `~/.qwen/channels/memory/<channelName>/<hash(chatId)>/QWEN.md` ausliefern; die CLI-Layer-Callbacks `readChannelMemory`/`writeChannelMemory` über `ChannelBaseOptions` verdrahten + Bootstrap-Read unter Wiederverwendung von `instructedSessions`. Phase-2-Daemon-Route `POST /channel/:sessionId/memory` nur unter der Daemon-Topologie.

**2.2 — Pro-Channel Token Budgets** (§6.4): `BudgetLedger.ts` nach Channel gekeyed, **advisory (nur WARN) bei der Channel-seitigen Schätzung, Hard-Decline nur bei echter Daemon-Nutzung** (Fix #6/OD-9); pro-Prozess-Org-Rollup + pro-Channel-Windows, Strictest-Wins, festes tägliches Window; 75%/95%-Alerts (Proactive-Send-Dependency).

**2.3 — Audit Log** (§6.4): `RequestAttributionRing` + `task.requested`-Zeile; **Attribution wird mit dem ausgeführten Turn mitgeführt (pro-Turn `currentTurnAttribution`), kein Timestamp-Join** (Fix #7); `GET /workspace/audit` (Daemon) oder `/audit`-Channel-Befehl. In-Memory FIFO 512, geht bei Neustart verloren (bekannte v1-Einschränkung; `~/.qwen` Append-Only-Follow-up, OD-11).

**Geänderte Dateien.** `writeContextFile.ts`, `workspace-memory.ts` (Scope-Validierung + GET-Walker, Daemon-Pfad); `BudgetLedger.ts`, `RequestAttributionRing.ts` (channel-base); `permission-audit.ts` (Pattern-Quelle) / neue `channel-audit.ts` (Daemon); `ChannelBase.ts` (`senderId`/`senderName` bei gequeueten Turns mitführen + `currentTurnAttribution`; Budget-Hooks); `server.ts` (Routen nach `express.json` `:2025` mounten, Mutationen mit `mutate({ strict: true })` absichern).

**Akzeptanzkriterien.**

- [ ] `scope: 'channel'` schreibt nach `~/.qwen/channels/memory/<channel>/<hash(chatId)>/QWEN.md`; zwei Gruppen erhalten **unabhängige** Dateien; die geteilte Workspace-`QWEN.md` bleibt unberührt; der Schreibvorgang läuft über den injizierten Callback (keine `channel-base → core`-Dependency).
- [ ] Das Anhängen an den Channel-Memory ist bei Parallelität idempotent (pro-File-Mutex) und emittiert `memory_changed` nur bei echter Mutation (Daemon-Pfad; subscriber-seitiges Filtering).
- [ ] Auf dem **Daemon**-Pfad wird der nächste eingehende Prompt nach Überschreiten des Real-Usage-Window-Caps eines Channels abgelehnt (nicht gekürzt) und Proactive-Jobs pausieren; Counter werden beim täglichen Window-Roll-over zurückgesetzt; Budgets sind pro-Channel unabhängig. Auf einem **nur-schätzenden** Pfad warnt das Budget, lehnt aber nie hart ab (Fix #6).
- [ ] Ein Tool-Call/eine Permission, der/die während der Ausführung von Sender A's gequeuetem Turn auftritt, wird **A** zugeordnet, selbst wenn B später unter `followup` gequeuet wurde (Fix #7).
- [ ] Jeder Proactive-Fire, Channel-Memory-Schreibvorgang und Budget-Event landet mit Best-Effort-`senderId`/`senderName` im Audit-Ring, lesbar über die Audit-Surface, **nicht** über den SSE-Bus broadcastet.
- [ ] Ring/Route/Resolver-Unit-Tests (FIFO-Eviction, Scope-Pfad-Auflösung, Budget-Threshold-Mathematik, Attribution-of-Executing-Turn) — keine UI/Timing-Tests.

### Phasengrenze & Ausblick

Phasen 0→1→2 sind additiv: Multiplayer + Identität (auf `AcpBridge`) → Daemon-Migration + Proactive-MVP → Memory + Budgets + Audit. Das **Phase-3-Multi-Identity-Gateway** (unterschiedliche Bot-Identitäten/Credentials pro Channel, echte Per-User-Principals, Per-Channel-Tokens) ist _out of scope_ und der natürliche nächste Schritt, der die Single-Global-Token-/One-Workspace-per-Daemon-Einschränkungen aufhebt. Selbst innerhalb von Phase 0–2 erfordert "qwen tag" **einen Agent-Prozess pro Workspace** (OD-2); ein Deployment, das mehrere Repos bedient, führt mehrere Prozesse aus.

---

## 8. qwen tag vs Claude Tag (Trade-offs)

Claude Tag ist ein gehosteter, Multi-Tenant-Agent: Anthropic betreibt Runtime, Identität und Per-User-Metering; die Channel-App ist ein Thin Client. `qwen tag` ist das Gegenteil – es läuft auf operator-kontrollierter Infrastruktur auf Basis der Adapter von qwen-code. Diese Umkehrung ist das gesamte Value Proposition und die gesamte Risk Surface.

### Wo qwen gewinnt

- **Open / Self-Hosted, Daten bleiben intern.** Der Agent läuft lokal – über stdio in Phase 0 (`AcpBridge.start()` führt `node <cli> --acp` aus), In-Process unter `qwen serve` ab Phase 1 – niemals eine Vendor-API. Repo-Inhalte, Modell-Traffic und Transkripte bleiben auf den Operator-Hosts. Claude Tag kann das nicht von sich behaupten.
- **MCP / Any-Tool.** Strikte Obermenge der Tool-Surface eines geschlossenen, gehosteten Agents.
- **Per-Action-Permission-Voting – _eine Phase-1+-Funktion, sobald daemon-gehostet_.** qwen-code liefert den `MultiClientPermissionMediator` mit (vier Policies, Konsens-Quorum `floor(M/2)+1`, separater Audit-Ring). Wirklich ein Differenzierungsmerkmal – **auf dem Phase-0-`AcpBridge`-Pfad nicht erreichbar** (`requestPermission` genehmigt automatisch, `:108-118`), erreichbar, sobald Phase 1 Channels im Daemon hostet; selbst dort werden Votes nach `clientId` gekeyed und ein Channel ist ein _einzelner_ Client, bis das OD-3-Roster landet. Das tote `ChannelConfig.approvalMode`-Feld (`types.ts:36`) bestätigt "geplant, aber nicht vorhanden".
- **Durable, inspizierbarer State.** `SessionRouter`-Persistenz, einfache `QWEN.md`/`AGENTS.md`-Dateien und (Daemon, Phase 1+) ein Last-Event-ID-Replay-Ring. Nichts Intransparentes.

### Wo es abweicht und kompensieren muss

1. **Single Workspace + Single Global Token + keine menschliche Identität.** Ein Prozess bindet einen Workspace; Multi-Workspace = N Prozesse (OD-2). Der Single Global Token gilt für den _HTTP-Daemon_; der Phase-0-`AcpBridge`-Channel-Pfad hat keine HTTP-Surface und keinen Token (seine Grenze ist `SenderGate`/`GroupGate`). Nirgendwo eine menschliche Identität – `senderName` ist nur beratender Prompt-Text (OD-11). _Kompensation:_ ein Prozess pro Workspace/Team; Sender-Attribution auf der Channel-Ebene injizieren; `clientId` als Sicherheitsgrenze beibehalten; `--require-auth` + Token auf jedem Non-Loopback-Daemon voraussetzen (OD-12).
2. **Proactive / Cold-Channel-Messaging nicht einheitlich.** Nur Reactive-Reply auf DingTalk (auslaufender `sessionWebhook`); Feishu sendet frei via `tenant_access_token`. _Kompensation:_ Phase 1's verifizierter Proactive-Group-Send auf persistierter `openConversationId` (DingTalk, `canColdSend` wird true); Feishu braucht nichts.
3. **Scheduler ist Session-scoped, nicht Daemon-scoped.** Cron stirbt bei `dispose()` durch das 30-Minuten-Idle-Reaping. _Kompensation:_ Gateway-eigener Scheduler (§6.2) – langlebig, übersteht Reaping, alleiniger Cron-Owner (OD-8).
4. **Memory ist Workspace-global, nicht Per-Channel.** _Kompensation:_ One-Process-per-Channel (Zero Code) oder der Phase-2-`channel`-Scope (OD-10).
5. **Multi-Identity / echtes Multi-Tenant out of scope** (Phase 3). In Phase 0–2 als Multi-Process modelliert.

### Risiken & Mitigation

| #   | Risiko                                                                                                                                                   | Schwere | Mitigation                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Channel-Stack-Tool-Calls werden auf dem Phase-0-`AcpBridge`-Pfad **automatisch genehmigt** (`AcpBridge.ts:108-118`) – ein geleakter Channel führt jedes Tool ohne Gate aus. | Hoch     | Die fest zugesagte Phase-1-Daemon-Migration bringt den Mediator; bis dahin das Toolset + den vertrauenswürdigen Host einschränken.                                                           |
| R2  | Leak des Single Global Token des Daemon gewährt vollen Workspace-Zugriff (HTTP-Daemon-Pfad; der `AcpBridge`-Pfad hat keinen Token).                                    | Hoch     | Loopback-Default + Bearer-Gate; `--require-auth` bei Non-Loopback (OD-12); vertrauenswürdiger Host; Rotation via Neustart; destruktive Tools hinter `consensus` absichern, sobald verdrahtet. |
| R3  | `dispatchMode`-Default `'steer'` bricht laufende Arbeit bei jeder Nachricht eines Mitglieds ab (JSDoc sagte `'collect'`, jetzt auf `'steer'` korrigiert, `types.ts:42`).       | Hoch     | Tag-Gruppen setzen `'followup'`; JSDoc abgeglichen (OD-5).                                                                                                             |
| R4  | Fehlende Sender-Attribution → Agent verwechselt Sprecher.                                                                                                 | Hoch     | Phase 0 `[senderName]`-Injektion für Gruppen-Turns (+ `alreadyPrefixed`, OD-6).                                                                                     |
| R5  | DingTalk Cold-Group / Proactivity mit abgelaufenem Webhook schlägt still fehl (`:137-141`).                                                                         | Mittel   | Phase 1 verifizierter Proactive-Group-Send auf persistierter `openConversationId`; `canColdSend` Fail-Loud; Degradierungen anzeigen.                                           |
| R6  | Cron/Notification stirbt beim Session-Reaping (30 Min., `run-qwen-serve.ts:94`); braucht zudem einen Outbound-Pfad (R5).                                             | Mittel   | Gateway-eigener Scheduler (§6.2); OD-8 Sole-Owner-Gate.                                                                                                             |
| R7  | `requireMention` true → nicht erwähnte Gruppennachrichten werden still verworfen (`GroupGate.ts:51-52`).                                                            | Niedrig/Mittel  | Default beibehalten; dokumentieren; optionaler First-Message-Hinweis.                                                                                                          |
| R8  | Geteilter Workspace-Memory kontaminiert kolozierte Gruppen kreuzweise.                                                                                           | Mittel   | One-Process-per-Channel oder Phase-2-`channel`-Scope (OD-10).                                                                                                       |
| R9  | Rate-Limit ist pro-`clientId`/IP, nicht pro-User (Daemon-Pfad); `AcpBridge`-Pfad hat keines.                                                                | Niedrig      | Akzeptabel für Single-Tenant; Per-User-Metering ist Phase 3.                                                                                                       |
| R10 | Consensus-Voter-Set wird zum Anfragezeitpunkt gesnapshottet; Channel-Mitglieder sind heute keine unterschiedlichen `clientId`s.                                                    | Niedrig      | OD-3: `first-responder` Phase 1; `senderId`→Vote-Mapping vor dem Konsens lösen.                                                                                  |
| R11 | DingTalk SDK aktualisiert das ~2-h-Access-Token nie, außer der Socket schließt – Proactive/Emotion/Media schlagen still fehl.                                   | Hoch     | `tokenManager` im Besitz der Proactive-Feature, Aktualisierung über den v1.0 `oauth2/accessToken`-Endpunkt (§6.2, verifiziert).                                            |
| R12 | Proactive-Fire, der `DaemonChannelBridge.prompt()` während eines Human-Turns aufruft, würde **throwen** `Prompt already in flight` (`:257-261`).                     | Hoch     | `dispatchProactive` serialisiert über `sessionQueues` und erwartet `activePrompts` vor `bridge.prompt()` – Throw-Guard strukturell unerreichbar (Fix #1, §6.2). |
| R13 | Geschätztes Budget-False-Positive könnte einen legitimen User-Prompt ablehnen.                                                                                | Mittel   | Schätzungen nur WARN; Hard-Decline nur bei echter Daemon-Nutzung (Fix #6, §6.4).                                                                                       |
| R14 | `followup`-Queueing ordnet Tool-Calls falsch dem zuletzt gequeueten Sender zu.                                                                    | Mittel   | `senderId` beim gequeueten Turn mitführen; Audit liest den ausgeführten Turn (Fix #7, §6.4).                                                                               |

---

## 9. Abgeschlossene Entscheidungen

Alle v1 Open Decisions werden unten mit ihrer gewählten Antwort aufgelöst. Die **einzigen verbleibenden wirklich offenen Punkte** sind Low-Confidence-DingTalk-API-Details unter OD-7, die in der letzten Zeile aufgeführt sind.

| ID                        | Frage                                                                                       | **Entscheidung**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **OD-1**                  | Channel-Hosting für Phase 1+ in `qwen serve` migrieren oder auf `AcpBridge` bleiben?                | **ABGESCHLOSSEN – Migrieren.** Phase 0 wird auf `AcpBridge` ausgeliefert; **Phase 1+ hostet Channels unter `qwen serve` über `DaemonChannelBridge` / einen Daemon-Channel-Runner**, erbt die FIFO `promptQueue`, `MultiClientPermissionMediator`, `eventBus`, `/workspace/memory` und das Rate-Limit. Phase 0 fügt den Attach-Pfad (oder `--daemon <url>`) hinzu, sodass der Cut-over ein Konfigurationsschritt ist. Der Gateway-Scheduler (§6.2) ist migrationsneutral. Kein Gate mehr – festgeschriebene Architektur.                                                                                                                                                                                                                                                                                                                                                                                |
| **OD-2**                  | Deployment-Einheit = ein Prozess pro Workspace/Channel?                                           | **ABGESCHLOSSEN – Ja.** Ein Prozess pro Workspace/Channel: Per-Channel-Memory + Secret-Isolation, Begrenzung des Single-Global-Token-Blast-Radius. Das Zusammenlegen mehrerer Channels ist ein Phase-3-Thema (braucht den `channel`-Scope + Governor).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **OD-3**                  | Permission-Policy für einen Multiplayer-Tag (ein Channel = eine Daemon-`clientId`)?                 | **ABGESCHLOSSEN – Phase 1: `first-responder` mit einer einzigen Channel-Level-`clientId`** (jedes erlaubte Mitglied löst auf; Channel-granulare Attribution; keine `senderId→clientId`-Map). **Phase 2: `consensus`/`designated`**, sobald ein `senderId→clientId`-Roster + Lifecycle (Reaping, Refcount-Grenzen) existiert. **High-Risk-Tools bei Proactive-Turns automatisch ablehnen.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **OD-4**                  | Thread-scoped `/clear`/`/status` sind Channel-weit.                                             | **ABGESCHLOSSEN – in einer geteilten (Thread-)Gruppe erfordert `/clear` `confirm` und ist auf `config.allowedUsers` beschränkt, wenn gesetzt** (ein mit Bindestrich versehenes `/clear-channel` ist nicht parsbar; ein Per-Member-Owner-Gate wird auf das Identitätsmodell verschoben, OD-3/OD-11); `/status` bleibt Read-Only auf der geteilten Session.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **OD-5**                  | `dispatchMode`-Default-Mismatch (JSDoc `'collect'` vs. Runtime `'steer'`).                      | **ABGESCHLOSSEN – JSDoc bei `types.ts:42` auf `'steer'` korrigieren** (entspricht Runtime); das Tag-Gruppenprofil setzt `dispatchMode: 'followup'` explizit.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **OD-6**                  | Sender-Marker-Format + `collect`-Double-Prefix.                                                | **ABGESCHLOSSEN – Pro-Turn-`[senderName]`-Prefix, NICHT durch `instructedSessions` gegatet**, plus **EIN neues optionales `Envelope`-Feld `alreadyPrefixed`** (`types.ts`), damit der synthetische Re-Entry im `collect`-Modus das erneute Prefixing überspringt. (Korrigiert die v1-Behauptung "kein neues Feld".)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **OD-7**                  | DingTalk Proactive Send: Endpunkt/Permission, `openConversationId`-Äquivalenz, Token-Refresh. | **ABGESCHLOSSEN mit verifizierten Fakten (§6.2/§6.5):** Endpunkt `POST https://api.dingtalk.com/v1.0/robot/groupMessages/send` _(hoch)_; Body `{ robotCode=config.clientId, openConversationId, msgKey:'sampleMarkdown', msgParam:<JSON string {title,text}> }` _(hoch)_; Auth-Header `x-acs-dingtalk-access-token` mit einem v1.0 `oauth2/accessToken`-Token, ~7200 s TTL, gecacht und aktualisiert durch einen Feature-eigenen `tokenManager` _(hoch)_; `openConversationId` in `~/.qwen/channels/dingtalk-groups.json` persistieren; Callback `conversationId`≈`openConversationId` _(mittel; Fallback auf `chatId→openConversationId`-Konvertierungs-API bei `invalid.openConversationId`)_. **Verbleibend offen (Low Confidence): genauer Permission-Point-Code/Anzeigename; wortgetreuer offizieller Äquivalenzsatz; ob die 20/Min.-Drosselung für `groupMessages/send` gilt.** |
| **OD-8**                  | Cron-Double-Fire zwischen Gateway- und Session-Schedulern.                                       | **ABGESCHLOSSEN – Der Gateway-Scheduler ist der ALLEINIGE Cron-Owner.** Eine Channel-gehostete (Tag-)Session startet **nicht** ihren In-Session-`Session`-Cron; sie erfährt durch ein `isTagSession`-Flag, das bei der Session-Konstruktion vom Channel-Host eingeschleust wird (`DaemonChannelSessionFactory`-Optionsbag Phase 1+; eine `--acp`-Spawn-Option Phase 0), dass sie eine Tag-Session ist, was `startCronScheduler()` überspringt (`Session.ts:667-668`). Die beiden Cron-Stores liegen auf **disjunkten Pfaden** (Gateway `~/.qwen/channels/cron.json` vs. Session `~/.qwen/tmp/<hash>/scheduled_tasks.json`), das einzige Kollisionsrisiko ist das Ausführen beider Scheduler für dieselben Jobs – eliminiert durch das Gate.                                                                                                                                                                                     |
| **OD-9**                  | Token-Budget-Scope, Source-of-Truth, Window.                                                   | **ABGESCHLOSSEN – Pro-Prozess-"Org"-Rollup + Pro-Channel-Windows, Strictest-Wins, festes tägliches Window.** v1 schätzt Token Channel-seitig (advisory, nur WARN – lehnt nie hart ab, Fix #6) und liest den **Daemon-Nutzungspfad** für präzise Abbuchung (und Hard-Decline), sobald daemon-gehostet.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **OD-10**                 | Per-Room-Memory-Namespace + Schreibberechtigung.                                                 | **ABGESCHLOSSEN – Einen `channel`-Scope (+`channelKey`) zu `writeContextFile.ts` hinzufügen; Channel-Base erhält Schreib-/Lesezugriff über einen CLI-Layer-Callback, der über `ChannelBaseOptions` injiziert wird (`readChannelMemory`/`writeChannelMemory`) – KEINE `channel-base → core`-Dependency.** User-globaler Pfad `~/.qwen/channels/memory/`. Der Agent hängt über eine `save_memory`-Intent an; Bootstrap-Read nutzt das `instructedSessions`-Gate wieder.                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **OD-11**                 | Menschliches Identitätsmodell + Audit-Dauerhaftigkeit.                                                       | **ABGESCHLOSSEN – `senderName` ist nur beratend; `clientId` bleibt das einzige Sicherheitsprinzipal.** Best-Effort-Attribution wird mit dem ausgeführten Turn mitgeführt (Fix #7); **In-Memory-FIFO-512-Audit-Ring + eine Append-Only-`~/.qwen`-Follow-up-Datei**.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **OD-12**                 | Token-Härtung für Non-Loopback-Daemon-gestützte Deployments.                                    | **ABGESCHLOSSEN – `--require-auth` + Token für jedes Non-Loopback-Daemon-gestützte Deployment voraussetzen.** Nur-Loopback ist nur für Dev; `--require-auth` ist die dokumentierte Standardhaltung (`run-qwen-serve.ts` erzwingt bereits Token-on-Non-Loopback).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **OFFEN (einziger verbleibender)** | Low-Confidence-DingTalk-API-Details unter OD-7.                                                | **WEITERHIN OFFEN – In-Konsole / gegen Live-Docs vor dem Coden verifizieren:** (1) genauer Permission-Point-Code/Anzeigename für "proactively send group message" (niedrig); (2) maßgeblicher offizieller Satz, der Callback-`conversationId` mit `openConversationId` für einen Standard-Non-Cool-App-Robot gleichsetzt (mittel; doc-garantierter Pfad ist die `chatId→openConversationId`-Konvertierungs-API); (3) ob das Limit "20 Nachrichten/Minute → ~10-Min.-Drosselung" wortwörtlich für `groupMessages/send` gilt (niedrig/mittel – für Custom-Webhook-Robots dokumentiert, nicht auf der Orgapp-Send-Seite bestätigt).                                                                                                                                                                                                                                                            |
---

## 10. Risiken & Mitigationen

Siehe die konsolidierte Tabelle in §8. Die kritischsten Risiken in Prioritätsreihenfolge:

1. **R1 — auto-approve auf dem Phase-0-Channel-Pfad.** Bis die zugesagte Phase-1-Daemon-Migration den mediierten Transport implementiert, führt ein channel-residierender Agent _jedes_ Tool unbewacht aus. Die wichtigste Sicherheitslücke; bis Phase 1 mit einem konservativen Toolset + vertrauenswürdigem Host mitigieren.
2. **R12 — proaktiver Overlap-Throw.** Der Aufruf von `DaemonChannelBridge.prompt()` während eines Human-Turns wirft `Prompt already in flight` (`:257-261`). Behoben durch Serialisierung über `sessionQueues` (Fix #1) – das Kernstück von §6.2.
3. **R11 — DingTalk-Token-Ablauf.** Der "funktioniert in der Demo, stirbt nach 2 Stunden"-Fehler. Das proaktive Feature besitzt einen `tokenManager` (verifizierter v1.0-Endpoint, ~7200 s TTL), bevor ein langlaufendes Feature ausgeliefert wird.
4. **R5 — DingTalk-Cold-Group-Silent-Failure.** Proaktive Ausgaben an inaktive Gruppen sind ohne den verifizierten Sendepfad unmöglich; `canColdSend` schlägt explizit fehl, anstatt zu droppen.
5. **R3 — `steer`-Abbruch in Gruppen.** Ein versehentlicher Multiplayer-DoS unter der Runtime-Default; das Tag-Profil setzt `followup`.
6. **R13/R14 — Budget-False-Positives und falsche Zuordnung.** Schätzungen loggen nur WARN (Fix #6); die Zuordnung wird mit dem ausführenden Turn mitgeführt (Fix #7).
7. **R8 — Cross-Contamination von Shared Memory.** Ein Prozess pro Channel ist die Zero-Code-Mitigation; der `channel`-Scope ist die colocalisierte Lösung.

Jedes Risiko ist einer Phase zugeordnet: R1/R3/R4 sind Phase 0–1, R5/R6/R11/R12 sind Phase 1, R8/R13/R14 und die Audit/Budget-Risiken sind Phase 2.

---

## 11. Anhang: Datei- & Symbol-Index

### Channel-Basis (`packages/channels/base/src/`)

- `SessionRouter.ts` — `routingKey()` (`:44-60`, Thread `:53`, Single `:55`, User `:58`), Standard-Scope `'user'` (`:25`), `setChannelScope()` (`:40-42`), `resolve()` (`:72-92`), `getTarget()` (`:94`), `persist()`/`restoreSessions()` (`:168-244`), `PersistedEntry` (`:5-9`).
- `ChannelBase.ts` — `handleInbound()` (`:238-471`), Prompt-Konstruktion (`:316-347`), `bridge.prompt()`-Aufruf (`:425`), Gates (`:240-252`), `dispatchMode`-Auflösung (`:353-354`), steer (`:371-379`), collect (`:361-370,445-463`), followup (`:381-383,394-470`), `activePrompts` (`:32-35,356`), `sessionQueues` (`:394,466`), abstraktes `sendMessage()` (`:81`), `registerCommand()` (`:141-143`), Konstruktor-Router (`:62-64`), `ChannelBaseOptions` (`:9-22,46`), `/clear`/`/status` (`:147-217`).
- `AcpBridge.ts` — `--acp` spawnen (`:53-70`), `newSession(cwd)` (`:131`), `prompt()` (`:147-180`), auto-approve `requestPermission` (`:108-118`), `AcpBridgeOptions` (`:17-21`).
- `DaemonChannelBridge.ts` — `newSession`/`loadSession` sessionScope `'thread'` (`:229,240`), Session-Factory-Options-Bag (`:226-241`), `activePrompts`-Guard / **wirft `Prompt already in flight`** (`:257-261`), `cancelSession` (`:332`), `respondToPermission` (`:346-374`), Permission-Events (`:557-633`).
- `GroupGate.ts` — `requireMention` Standard true (`:49`), Membership (`:42`), Mention-Gating (`:51-52`), Fallback-Chain (`:48`), Standard-Policy `'disabled'` (`:13`).
- `SenderGate.ts` — `check()` + Pairing (`:42`).
- `types.ts` — `GroupConfig` (`:10-13`), `ChannelConfig` (`:27-51`), `approvalMode` (`:36`), `dispatchMode` JSDoc korrigiert auf `'steer'` (`:42`), `senderName` (`:69`), neues `alreadyPrefixed`-Feld, `isGroup` (`:75`), `SessionTarget` (`:88-93`).

### DingTalk (`packages/channels/dingtalk/src/`)

- `DingtalkAdapter.ts` — `webhooks`-Map (`:84`), `sendMessage()` (`:134-170`, No-Webhook-Return `:137-141`), Webhook-Cache (`:516-517`), `getAccessToken()` (`:172-174`), `emotionApi()` (`:188-207`, robotCode `:184`, openConversationId `:197`, Empty-Catch-Anti-Pattern `:214-216`), Media-robotCode (`:435`), Inbound-`conversationId` (`:506`), Mention-Strip (`:527-529`), `isMentioned` (`:520`), `senderName` (`:544`), `extractQuotedContext()` (`:272-298`), `chatId` (`:534`), keine `threadId` (`:541-551`).
- `proactive.ts` (neu) — `sendGroupMessage()` an `POST /v1.0/robot/groupMessages/send` (`robotCode`+`openConversationId`+`msgKey:'sampleMarkdown'`+`msgParam` JSON-String), `tokenManager` (v1.0 `oauth2/accessToken`, ~7200 s TTL, Timer + 401-Refresh), `chatId→openConversationId`-Konvertierungs-Fallback.
- `markdown.ts` — `convertTables()` (`:44-80`), `splitChunks()` (`:84-188`), `CHUNK_LIMIT=3800` (`:10`; ≤ dem ~5000-Zeichen `sampleMarkdown`-Budget), `extractTitle()` (`:190-195`), `normalizeDingTalkMarkdown()` (`:198-201`).
- `media.ts` — `downloadMedia`-Header (`:39`), Body `:42`.
- SDK: `client.mjs` gettoken (`:85-87`), reconnect (`:157-163`), Event/Callback-Split (`:14-19,35-37,58-61,241-257`); `constants.d.ts` `sessionWebhookExpiredTime` (`:13`), `robotCode` (`:19`), `TOPIC_CARD` (`:4`).

### Feishu (`packages/channels/feishu/src/`)

- `FeishuAdapter.ts` — `sendMessage()` proaktiv (`:622-676`, Endpoint `:651`; `canColdSend = true`), `refreshToken()` (`:581-620`), `connect()`-Modi (`:146-176`), `updateCard()` (`:742-792`), Ingest-Dedup (`:1633-1870`).
- `markdown.ts` — Schema-v2-Card-Content (`:69-189`), `splitChunks()` (`:198-256`).

### Core (`packages/core/src/`)

- `memory/writeContextFile.ts` — `WriteContextFileScope` (`:80`, +`'channel'`), `WriteContextFileOptions` (`:83-97`, +`channelKey`), `resolveContextFilePath()` (`:223-240`, +`channel`-Branch + `channelKey`-Param), Pro-Datei-Mutex (`:48-57,159-162`), Absolute-Path-Guard (`:142-146`), `MAX_EXISTING_FILE_BYTES` (`:255`), Replace-Mode (`:202-211`).
- `utils/cronParser.ts` — `parseCron`/`matches`/`nextFireTime` (`:104,141,168`).
- `utils/cronTasksFile.ts` — `DurableCronTask` (`:19-26`), pro Projekt gehashter Pfad (`:1-9`).
- `Session.ts` — `cronQueue`/`cronProcessing` Feld-Deklarationen (`:667-668`), `startCronScheduler()` (`:758`, für Tag-Sessions gemäß OD-8 übersprungen), `dispose()` Cron-Clear (`:790-812`), `#recordPromptTokenCount()` (`:2078-2087`), `setNotificationCallback()` (`:2638-2668`), `isIdle()` (`:777`).

### Serve / Daemon (`packages/cli/src/serve/`, `packages/acp-bridge/src/`)

- `bridge.ts` — Pro-`SessionEntry` FIFO `promptQueue` (`:232,2855,3082`), `publishWorkspaceEvent` (`:3610,3649-3675`).
- `eventBus.ts` — `BridgeEvent.data` Free-Form (`:51`), `originatorClientId` (`:60`), Hysterese-Schwellenwerte (`:101-103`), Replay-Ring (`:92`).
- `permissionMediator.ts` — vier Policies + Konsens-Quorum (`:348,621-637`).
- `permission-audit.ts` — `PermissionAuditRing` FIFO 512 (`:128-172`), Closed-Entry-Union (`:57-104`), Header-Doc, das eine GET-Surface antizipiert (`:22-25`).
- `rate-limit.ts` — Pro-`(clientId|ip)` Token-Buckets; `X-Qwen-Client-Id` (`:110`).
- `auth.ts` — globaler Bearer-Token (`:259-266`), `createMutationGate` Strict (`:356`).
- `workspace-memory.ts` — Scopes `workspace|global` (`:118-125`), Strict-Auth-Mutate (`:114`), Pro-Write-Cap `MAX_MEMORY_CONTENT_BYTES` (`:79`), feste `projectRoot`-Weiterleitung (`:185-190`).

### CLI-Channel-Befehle (`packages/cli/src/commands/channel/`)

- `start.ts` — `startCommand` (`:479-499`), `AcpBridge`-Konstruktion (`:213,268,356,435`), `setChannelScope` (`:361-362`), `restoreSessions` (`:275,444`), `sessionsPath()` (`:56-58`), `checkDuplicateInstance()` (`:170-179`), Disconnect-Handler (`:241,403`); Phase-1+-Daemon-Attach-Pfad; CLI-Layer-Injektion von `readChannelMemory`/`writeChannelMemory`.
- `config-utils.ts` — `parseChannelConfig()` (`:81-100`, sessionScope-Standard `:91-92`, approvalMode `:94`, groupPolicy `:98`), `resolveEnvVars()` (`:6-18`).
- `channel-registry.ts` — `ensureBuiltins()` (`:6-32`), Channel-Typen (`:10-14`).