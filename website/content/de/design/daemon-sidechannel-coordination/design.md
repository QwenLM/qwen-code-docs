# Daemon-Side-Channel-Koordination — Design (A1 / A2 / A4 / A5)

> Zielt auf `daemon_mode_b_main` (gemäß #4175 Branching-Strategie). Autor: 秦奇. Datum: 2026-05-25. Überarbeitet: 2026-05-27 (v13 — zombie-gap-Dokumentation, `reconciliation_failed`-Vertrag, `availableCommands`-Spezifikation, §7 atomic-coupling, §8 bounded-call-count).
> **Nur Dokumentation / Design-first.** A4 implementiert + genehmigt (#4539); A1 implementiert (#4546).
>
> Quelle: Cross-Client-Echtzeit-Sync-Audit (2026-05-24) + PR #4484 Post-Merge-Review (die Follow-ups der **A-Serie**). Die Bugfix/Cleanup-Follow-ups aus demselben Review werden separat ausgeliefert (PR #4510) und sind **hier nicht im Scope**.

## Changelog

### v12 (2026-05-27) — neunte Review-Runde (Helper-Signatur + strukturelle Absicherung)

- **`publishModelSwitched`-Helper akzeptiert jetzt `originatorClientId` (Kritisch).** Sowohl der Bridge-Roundtrip (`bridge.ts:1172`, `:2883`) als auch `applyModelServiceId` übergeben `originatorClientId` in jedes `model_switched`-Event. Die Signatur `publishModelSwitched(entry, modelId)` aus v11 hat dies weggelassen – was Implementierer dazu zwang, entweder die Zuordnung stillschweigend zu verwerfen oder den Helper zu umgehen. Behoben: Die Signatur lautet jetzt `publishModelSwitched(entry, modelId, opts?: { originatorClientId?: string })`. Bridge-Roundtrip und `applyModelServiceId` übergeben die aufgelöste `originatorClientId`; Demux-Promotion und Reconciliation-Corrective übergeben nichts.
- **Nicht-Rekursions-Regel wird jetzt strukturell erzwungen.** v11 verließ sich auf die Call-Graph-Disziplin (vertraglich — "nicht durch den `.finally`-Hook fließen lassen"). v12 fügt ein sitzungsweites `reconciliationInFlight: boolean`-Flag hinzu, das vor dem asynchronen Read auf `true` und danach wieder gelöscht wird. Wenn der Roundtrip-Settle-`.finally` feuert, während das Flag bereits `true` ist, wird dies geloggt und übersprungen. Dies macht Nicht-Rekursion zu einer Invariante, unabhängig von zukünftigem Refactoring.
- **Observability-Log-Format um Generation-Counter erweitert.** Das Format lautet jetzt `[reconcile] session=<id> trigger=… baseline=<modelId> actual=<modelId> gen_before=<N> gen_after=<M> action=…`. `published` wurde in `baseline` umbenannt (auf dem Failure-Path wurde kein `model_switched` veröffentlicht, daher war "published" irreführend). Der Satz zur Nicht-Rekursion wurde aus der Observability-Zeile entfernt (wird durch den obigen eigenen Absatz abgedeckt – eine einzige Wartungsstelle).
- **Fehlermodi der Fresh-Read-Invariante korrigiert.** Das "stale-but-equal"-Szenario war widersprüchlich; es wurde durch präzise duale Fehlermodi ersetzt: (1) Stale Response passt zu `entry.currentModelId` → falsches "converged" (reale Divergenz übersehen); (2) Stale Response weicht von `entry.currentModelId` ab → falsches "corrective", das einen neueren Wert überschreibt.
- **Failure-Path Consumer-Event-Reihenfolge dokumentiert.** Auf dem Failure-Path können Consumer `model_switch_failed` → `model_switched(A)` sehen (das abgelaufene Modell wurde tatsächlich angewendet). §2.2 weist auf diese Reihenfolge hin und empfiehlt, `model_switched` unabhängig von vorangegangenen Failure-Events immer als maßgeblich zu behandeln.
- **§8 Testplan erweitert:** (1) Nicht-Rekursions-Regel: Assert, dass `getSessionContextStatus` pro Reconciliation genau einmal aufgerufen wird, kein zweiter `.finally` nach Corrective geplant; (2) Failure-Path Converged-Fall (Agent hat das abgelaufene Modell NICHT angewendet → `action=converged`); (3) Generation-Skip-Korrektheits-Assert auf `gen_before`/`gen_after`-Werte.
- **§2.2 Reconciliation-Ergebnisse: Terminologie angeglichen** — Der `_converged_`-Punkt verwendet `entry.currentModelId` (das aktuelle Modell des Bus), konsistent mit der Vertragssprache von v11.

### v11 (2026-05-27) — achte Review-Runde (Härtung des Reconciliation-Vertrags)

- **Failure-Path Reconciliation-Baseline geklärt (Kritisch).** Auf dem Failure-Path (`model_switch_failed`) wurde kein `model_switched` veröffentlicht – der Bus und `entry.currentModelId` behalten beide den Wert vor dem Roundtrip. Die Reconciliation vergleicht den Authoritative Read mit `entry.currentModelId` (nicht allgemein "das veröffentlichte Modell"). Explizite Formulierung + eine §8 `_failure-path trigger_` Sub-Szenario-Erweiterung hinzugefügt.
- **`publishModelSwitched`-Helper — Durchsetzungsmechanismus für die Generation-Invariante (Kritisch).** Ein einzelner `publishModelSwitched(entry, modelId)`-Helper aktualisiert atomar (in einem synchronen Turn): (1) `entry.currentModelId`, (2) erhöht `entry.modelPublishGeneration`, (3) veröffentlicht `model_switched` auf dem Bus. **Alle vier Publish-Sites** (Bridge-Roundtrip, `applyModelServiceId`, Demux-Promotion, Reconciliation-Corrective) laufen darüber. Kein anderer Code-Pfad darf `model_switched` direkt veröffentlichen. Test-Invariante: Nach jedem Code-Pfad Assert, dass die Generation um genau 1 fortgeschritten ist.
- **Fresh-Read-Invariante dokumentiert (Kritisch).** Der von der Reconciliation verwendete `getSessionContextStatus`-Read MUSS einen frischen Point-in-Time-Wert zurückgeben – er MUSS jeden Response-Cache, Request-Deduplication oder In-Flight-Coalescing umgehen. Zum §2.2-Vertrag hinzugefügt. (In der Praxis: `extMethod` ist bei jedem Aufruf ein frischer JSON-RPC-Call – heute existiert kein Middleware-Caching – aber der Vertrag ist jetzt explizit.)
- **Corrective darf Reconciliation NICHT erneut auslösen (Kritisch).** Das Reconciliation-Corrective ist ein lokales `publishModelSwitched` und plant keine nachfolgende Reconciliation. Die Implementierung muss sicherstellen, dass der Corrective-Pfad nicht durch den Roundtrip-Settle-`.finally`-Hook fließt. Zur §2.2-Observability + explizite Nicht-Rekursions-Regel hinzugefügt.
- **§8 Test-Bullet für Generation-Assert erweitert:** Jede `model_switched`-Publish-Site (einschließlich Reconciliation-Corrective) aktualisiert `entry.currentModelId` UND erhöht `entry.modelPublishGeneration`; Assert, dass die Generation nach jedem um genau 1 fortgeschritten ist.

### v10 (2026-05-27) — siebte Review-Runde (Reconciliation TOCTOU + Retry + Tests)

- **Reconciliation TOCTOU (Kritisch) → Publish-Generation-Guard.** Selbst der Authoritative Read aus v9 hat ein Zeitfenster: Nach dem Settle kann ein gleichzeitiges In-Session `/model C` ein `model_switched(C)` promoten, während der Async-Read unterwegs ist; der Read (früher ausgestellt) gibt den Wert B vor C zurück; die Reconciliation emittiert dann `model_switched(B)` und überschreibt C. **Fix:** Hinzufügen einer sitzungsweisen `modelPublishGeneration`, die bei jedem `model_switched`-Publish erhöht wird (Bridge / Demux-Promotion / Reconciliation-Corrective). Die Reconciliation erfasst die Generation **vor** dem Async-Read und **überspringt das Corrective, wenn die Generation während des Reads fortgeschritten ist** (ein neuerer Authoritative Publish ist bereits gelandet). Die Reconciliation feuert auch auf **sowohl** Success- als auch Failure-Pfaden (`.finally` auf dem Roundtrip), da der Timeout/Failure-Fall genau der ist, in dem sie am dringendsten benötigt wird.
- **Read-Error ist nicht still terminal → Bounded Retry + Event.** Ein vorübergehender `getSessionContextStatus`-Fehler würde den Bus sonst permanent divergieren lassen. 1–2 Bounded Retries hinzufügen (kurzer Backoff); wenn alle fehlschlagen, ein `reconciliation_failed`-Bus-Event emittieren, damit Clients warnen / pullen können, und `action=read-error` loggen.
- **§2.3 Publish-Site-Aufzählung enthält jetzt das Reconciliation-Corrective** (es muss `entry.currentModelId` aktualisieren + die Generation erhöhen, sonst divergiert der Cache nach einer Korrektur vom Bus).
- **§8 Staleness-Test korrigiert** — er widersprach v9 (er erwartete ein wertbasiertes Droppen von A, wenn Cache=B, aber das Dedup aus v9 droppt nur den _gleichwertigen_ Dup). Ersetzt durch: (1) Redundant-Dup-Drop (`current_model_update(A)`, wenn Cache bereits A), (2) Timeout-Race wird durch Reconciliation behandelt (A≠B promotet, Reconciliation convergiert). Plus ein Reconciliation-Skips-On-Newer-Promotion-Test.
- **§10 Q3 hochgestuft:** Das Routen von In-Session `/model` durch die `modelChangeQueue` (Serialisierung an der Quelle) ist das race-freie Langzeit-Design; der Suppress/Dedup/Reconcile-Stack ist die Übergangslösung bis dahin.

### v9 (2026-05-27) — Fix des Reconciliation/Staleness-Mechanismus (gefunden bei der Planung der A1-Härtung)

- **v8s "Reconciliation liest den §2.3-Cache" war unzureichend.** Der Cache wird nur an Publish-Sites aktualisiert, aber eine gleichzeitige In-Session-Änderung, die der Demux droppt (Suppress-Window), wird nie veröffentlicht – der Cache kann sie also nicht beobachten. Eine Reconciliation, die den Cache liest, würde den gerade veröffentlichten Wert der Bridge sehen, "keine Divergenz" urteilen und nicht korrigieren → genau der permanente Divergenz-Bug, den sie verhindern soll.
- **Fix (§2.2): Reconciliation führt einen Authoritative Post-Settle-Read durch.** Nachdem ein Bridge-Modell-Roundtrip settled, liest die Bridge das **wahre** aktuelle Modell des Agents über `getSessionContextStatus` (`bridge.ts:2784`, asynchrone `extMethod`) und emittiert ein korrigierendes `model_switched`, wenn es von dem abweicht, was sie veröffentlicht hat. Dies ist der Agent-als-Source-of-Truth-Backstop. Er ist asynchron, läuft aber **post-settle (nicht im Demux)**, sodass der §5 Synchronous-Block-Vertrag nicht gilt – diese Einschränkung gilt nur für die Snapshot/Staleness-Read-Pfade.
- **Staleness-Check (§2 Punkt 4) als Best-Effort + Reconciliation als Authoritative Backstop neu formuliert.** Ein reiner Wertvergleich kann eine stale Late Notification nicht von einem neuen Switch auf dieselbe ID unterscheiden (ein Distributed-Ordering-Problem). Daher droppt der Demux nur den eindeutigen Fall (ein `current_model_update`, dessen `currentModelId` bereits `entry.currentModelId` entspricht – ein redundanter Dup); die Timeout-Race (eine abgelaufene frühere Änderung entspricht immer einem gesettelten Bridge-Roundtrip) wird autoritativ durch die §2.2-Reconciliation abgefangen. Kein agentseitiger Sequence-Counter nötig.
- **§2.3 Cache-Rolle eingegrenzt:** Synchrone Quelle für **A5s Snapshot** und Best-Effort-Demux-Dedup – NICHT die Source of Truth für die Reconciliation (das ist der Authoritative Read). Der Cache bleibt für A5 korrekt, da nach der Reconciliation der zuletzt veröffentlichte Wert die Wahrheit des Agents IST.

### v8 (2026-05-26) — sechste Review-Runde (1×Kritisch auf A5 + Vorschläge)

- **Bridge-State-Cache (§2.3, neu) — der vereinheitlichende Mechanismus.** Der Staleness-Check (§2 Punkt 4), die §2.2-Reconciliation UND A5s Synchronous-Snapshot-Vertrag brauchten alle "das aktuelle Modell/den aktuellen Modus des Agents", aber die Bridge hatte keinen synchronen Accessor (nur einen asynchronen `extMethod`-Status-Read, der die Race wieder öffnet). Hinzufügen von `currentModelId` / `currentApprovalMode` / `availableCommands` zu `SessionEntry`, aktualisiert **synchron an jeder Publish-Site** (`model_switched` bei `bridge.ts:2883`/`:1172`, `approval_mode_changed` bei `:2979`, die Demux-Promotions) und geseedet aus der `createSession`/`loadSession`-ACP-Response. Alle drei Mechanismen lesen jetzt diese Sync-Felder – was den §5 Single-Synchronous-Block-Vertrag konstruktiv erfüllt.
- **Dies beseitigt auch das A2 `previousModeId`-ACP-Schema-Problem:** ACPs `CurrentModeUpdate` hat nur `currentModeId` (kein `previousModeId`-Feld – dieselbe External-Union-Einschränkung, auf die v7 für A1 gestoßen ist). Die Bridge muss den Agent nicht mehr `previous` senden lassen: Sie leitet es aus dem gecachten `entry.currentApprovalMode` ab (dem Wert _vor_ dieser Änderung). Dasselbe gilt für A1. Somit trägt keine der Benachrichtigungen ein `previous*`-Feld.
- **§1.1 Punkt 2 entstaled** — aufgeteilt in 2a (A1 `extNotification`) / 2b (A2 `sessionUpdate`); v7 hatte §2/§2.1/§6/§7 korrigiert, aber §1.1 übersehen.
- **§2.1: `scope` in den promoteten `approval_mode_changed`-Payload gefaltet** (`{sessionId, previous, next, persisted, scope}`); dessen Beziehung zu `persisted` klargestellt.
- **§2.2 Reconciliation-Observability** — `[reconcile] session=… published=… actual=… action=corrected|converged|read-error` + explizite Read-Error-Behandlung.
- **`extNotification`-Methodenname festgelegt** auf `qwen/notify/session/model-update` (passt zu #4546) + Hinweis, dass der Early-Return-Guard zu einem Dispatch werden muss.
- **Durchsetzung der Dual-Emit-Entfernung** — `TODO(dual-emit-removal)` an der Stelle + ein Tracking-Issue in §7.
- §0 ("zwei Demux-Insertion-Points"), den §3.4→§3-Punkt-4-Querverweis korrigiert und §8 um Staleness-Drop / Reconciliation-Corrective / Cross-Axis-Non-Suppression / Dual-Emit / `extNotification`-Transport-Szenarien erweitert.

### v7 (2026-05-26) — Machbarkeitskorrektur zum Implementierungsstart (A1-Transport)

- **A1 kann kein `current_model_update`-SessionUpdate verwenden – dieser Typ existiert nicht in ACP.** Zum Implementierungsstart verifiziert: `SessionUpdate` ist der externe `@agentclientprotocol/sdk`-Typ; `acp.d.ts` definiert `current_mode_update` (2 Treffer), aber **`current_model_update` (0 Treffer)**. Man kann keine Variante zur extern spezifizierten Union hinzufügen. v1–v6s "ein `current_model_update`-SessionUpdate hinzufügen" (und die §2 "Alternative", die `extNotification` aus Symmetriegründen ablehnte) war falsch.
- **Korrigierter A1-Transport: Der Agent emittiert die In-Session-Modelländerung über `BridgeClient.extNotification()`** (`bridgeClient.ts:491`, der existierende Agent→Bridge-Side-Channel, der heute für MCP-Guardrails verwendet wird) – KEIN SessionUpdate. Der A1-Demux lebt daher in **`extNotification()`**, während A2s `current_mode_update` (ein echtes ACP-SessionUpdate) in **`sessionUpdate()`** gedemuxt wird. A1 und A2 verwenden unterschiedliche Transporte + Insertion-Points – eine neue Asymmetrie, die jetzt dokumentiert ist.
- Netto-Effekt auf den Rest des Designs: Die Demux-Regeln (Payload-Mapping, Suppress pro Typ, Staleness-Check, Drop-when-suppressed, Observability) bleiben im Kern unverändert; nur A1s Insertion-Point verschiebt sich von `sessionUpdate()` nach `extNotification()`, und A1 benötigt keine ACP-Spec-Änderung.
- **Deshalb ist Design-first wichtig:** Der Blocker trat in der ersten Zeile der A1-Implementierung auf; den Transport im Doc umzustellen ist billig, ein Cast auf die externe `SessionUpdate`-Union wäre ein latenter Type-Lie gewesen.
### v6 (2026-05-26) — fünfte Review-Runde (wenshao 2×Critical + 4×Suggestion)

- **Timeout-Race + dazwischenkommende Änderung (Critical):** "later event is authoritative" war falsch, wenn eine Änderung B dazwischenkommt – ein veraltetes, spätes `current_model_update(A)` würde nach `model_switched(B)` promoted werden. Ersetzt durch einen **Staleness-Check**: Der Demux promoted ein `current_model_update` nur, wenn seine `currentModelId` zum Zeitpunkt der Promotion dem tatsächlichen aktuellen Modell des Agents entspricht; veraltete Benachrichtigungen werden verworfen. §2 Punkt 4 / §2.1.
- **`previousModeId` jetzt PFLICHT (Critical):** Der SDK-Normalizer `normalizeApprovalModeChanged` (`normalizer.ts:754`) erfordert `previous`, andernfalls wird das Event per `fallbackDebug` verworfen. Ein optionales `previousModeId` würde In-Session-Approval-Mode-Änderungen stillschweigend verschlucken. §3.
- **Suppress jetzt pro Änderungstyp, nicht pro Session:** Ein Model-Roundtrip darf ein `current_mode_update` innerhalb der Session nicht unterdrücken (und umgekehrt). §2.1.
- **`current_model_update` Payload:** Das undefinierte `authType?` wurde entfernt (tote Daten – `model_switched` ist `{sessionId,modelId}`); `previousModelId` bleibt optional (der `model_switched`-Normalizer benötigt nur `modelId`). §2.
- Zwei Text-/Cross-Ref-Fehler behoben, bei denen `current_mode_update` (A2) statt `current_model_update` (A1) stand. §2 Wire/Compat, §6.

### v5 (2026-05-26) — vierte Review-Runde (wenshao 2×Critical + 8×Suggestion)

- **Concurrent-in-session-`/model`-Drift (Critical) → Reconciliation-Regel.** "Drop-when-suppressed" kann ein In-Session-`/model B` verwerfen, das während eines Bridge-`setSessionModel(A)`-Roundtrips feuert (In-Session-`/model` umgeht `modelChangeQueue`), wodurch der Bus auf A bleibt, während die Session B ausführt. §2.2 hinzugefügt: Beim Abschluss des Roundtrips führt die Bridge eine Reconciliation durch – sie liest das aktuelle Modell des Agents erneut ein und emittiert ein korrigierendes `model_switched`, wenn es von dem veröffentlichten abweicht.
- **IDE-Companion-Lockstep (Critical) → Dual-Emit-Übergang für ein Release.** Promotion kann nicht atomar umschalten (Daemon- vs. Marketplace-Ship-Channels), und der Upstream-Dispatch (`daemonIdeConnection.ts`, `DaemonChannelBridge.ts`) verwirft unbekannte Event-Typen, bevor sie den Handler erreichen. Ein **Dual-Emit-Übergangsfenster** wurde hinzugefügt (für ein Release werden SOWOHL das generische `session_update` als auch das promootete benannte Event veröffentlicht) und die betroffenen Upstream-Dispatch-Standorte aufgeführt (§2.1, §6).
- **`model_switched` Payload-Mapping spezifiziert** – `currentModelId → modelId`, Envelope `sessionId → data.sessionId`; ohne dies verwirft der SDK-Validator (`events.ts:1910`, erfordert nicht-leere `modelId`) jedes promootete Event (A1 nicht funktionsfähig). §2.1.
- **Demux-Observability erforderlich** – strukturierter Log an jedem Entscheidungspunkt (promoted / dropped / suppressed / generic). §2.1.
- **`replay_complete`-Korrektur** – es existiert (**`eventBus.ts:444`**, ausgeliefert durch gemergtes #4484); die "null Treffer" des Reviewers bezogen sich auf einen veralteten Tree. A5 Phase 2 hängt vom neuen `session_snapshot`-Frame ab, nicht von der Einführung von `replay_complete`. §5/§7.
- **First-Attach synthetisiert kein `replay_complete{0}` mehr** (würde den Contract dieses Events für bestehende "replaying→live"-Consumer erweitern) – der Snapshot ist bei First-Attach selbstbegrenzend. §5.
- **Capture-at-Emission verschärft** – Snapshot-Feld-Lesevorgänge + Publish MÜSSEN ein synchroner Block sein (kein `await` dazwischen), sonst öffnet sich das Stale-Overwrite-Fenster wieder. §5.
- **Helper-Migrationsmodell + Q3 gelöst** (ExtMethod-Bypass beibehalten – §1.1 bleibt bestehen); A4-Unterscheidungstest hinzugefügt (erledigt in #4539). §3, §8, §9.

### v4 (2026-05-26) — dritte Review-Runde (wenshao 2×Critical + 9×Suggestion, Copilot 5×)

- **Demux-Insertion-Point korrigiert** – das generische `sessionUpdate → session_update`-Forwarding befindet sich in `packages/acp-bridge/src/bridgeClient.ts:397` (`BridgeClient.sessionUpdate()`), **nicht** in `bridge.ts:352` (das ist der Prompt-Echo). Der §2.1-Demux-Hook lebt in `bridgeClient.ts`. Eine **dritte Demux-Regel** hinzugefügt: Eine Promotion, die durch einen laufenden Roundtrip blockiert ist, wird **verworfen**, nicht als generisches `session_update` veröffentlicht (sonst Double-Signal durch das autoritative Event der Bridge + den generischen Wrapper).
- **`approvalModeQueue` existiert noch nicht** – sie wird in PR #4510 ausgeliefert. Das Suppress-Fenster von A2 hängt von einem In-Flight-Tracker pro Session ab, daher ist A2 jetzt als **harte Voraussetzung für #4510** markiert (§3, §7), nicht als weiches "koordinieren".
- **A2-HTTP-Pfad emittiert keine Agent-Benachrichtigung** (er umgeht `Session.setMode` über die ExtMethod) → die Bridge ist dort der **einzige** Emitter; "suppress-during-roundtrip" gilt nur für den **Model**-Pfad. §1.1 / §9 korrigiert.
- **Step-2-Demux deckt nur `current_model_update` ab.** Die Promotion von `current_mode_update` wird auf Step 3 verschoben (benötigt `previousModeId`); bis dahin fließt es weiterhin als generisches `session_update` (kein Regression).
- **A5-Snapshot-Stale-Overwrite behoben** – den Snapshot **zum Emissionszeitpunkt (nach `replay_complete`)** erfassen, nicht zum Subscribe-Zeitpunkt, damit ein während des Replays zugestelltes Live-Delta nicht von einem veralteten Snapshot überschrieben wird. First-Attach-Reihenfolge definiert.
- **Nicht "überall additiv"** – die Promotion von `current_mode_update` ist eine Lockstep-Änderung; `packages/vscode-ide-companion/.../qwenSessionUpdateHandler.ts:177` ist ein namentlich genannter betroffener Consumer.
- **`previousModeId`-Capture-Point spezifiziert**; Helper-Generalisierung detailliert; Persist-Scope-Beschreibung korrigiert (`getPersistScopeForModelSelection` → Workspace oder User); Security-Aufzählung vervollständigt (`resolveTrustedClientId`); Testplan + Anchors behoben.

### v3 (2026-05-26) — zweite Runde

Umformuliert auf das Bridge-autoritative Modell (§1.1, nicht Single-Emitter); A1 drei Publish-Sites + `model_switch_failed`-Ausnahme + Timeout-Race; explizite A1-Workspace-Mirror-Entscheidung; `previousModeId`; A4 legt beide SDK-Felder offen; A5-Snapshot nach `replay_complete`; Tests erweitert.

### v2 (2026-05-26) — erste Runde

A1/A2-Asymmetrie; §2.1-Demux-Contract; §9-Tabelle; A5 `pendingPermissionIds` entfernt; Anchor-Hygiene; `voterClientId` optional.

---

## 0. Scope & Non-Goals

Vier Side-Channel-State-Coordination-Lücken, bei denen eine Session-State-Änderung auf einem Pfad für andere angehängte Clients (oder Peer-Sessions) unsichtbar ist:

| #      | One-liner                                                                                                                                                   |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A1** | In-Session-Model-Switch (`/model`, Plan-Mode) erreicht nie den Bus.                                                                                        |
| **A2** | In-Session-Approval-Mode-Änderung (`setMode`) emittiert kein Event; der HTTP-Pfad nutzt einen anderen Agent-Entry-Point; Workspace-vs-Persist-Sichtbarkeit unklar.      |
| **A4** | `permission_resolved.originatorClientId` trägt den _Voter_, während `permission_request.originatorClientId` den _Prompt-Originator_ trägt – mehrdeutig.    |
| **A5** | Ein Client, der sich über `Last-Event-ID` anhängt, erhält Ring-Replay + Live-Tail, aber keinen Snapshot des aktuellen Modells / Approval-Modes / der Commands; er muss zusätzliche Pulls absetzen. |

Non-Goals: Multimodaler User-Content-Echo (PR #4353 §D), der A3-Race-Fix (PR #4510), ClientId-Anti-Forgery (A6), der Streamable-HTTP-Transport (#4472).

**Anchor-Konvention:** vollständige Repo-Root-Pfade.

- **`packages/acp-bridge/src/bridgeClient.ts`** – der ACP→Bus-Client; `sessionUpdate()` und `extNotification()` leiten Agent-Benachrichtigungen an den EventBus weiter (die **zwei** Demux-Insertion-Points – A2 in `sessionUpdate()`, A1 in `extNotification()`; siehe §2.1).
- **`packages/acp-bridge/src/bridge.ts`** – der 3923-LOC-Orchestrator (HTTP-Control-Methoden, Publish-Sites). `packages/cli/src/serve/httpAcpBridge.ts` ist ein 101-LOC-Re-Export-Shim – kein Anchor-Target.
- **`packages/acp-bridge/src/permissionMediator.ts`** – Permission-Voting/Resolution.
- **`packages/cli/src/acp-integration/acpAgent.ts`** / **`.../session/Session.ts`** – Agent + Session.

---

## 1. Hintergrund – das Side-Channel-Coordination-Invariant

Der Daemon broadcastet _Transcript_-Deltas und über HTTP-Routen initiierte _Control_-Änderungen (`model_switched`, `approval_mode_changed`). Die Lücke: **Dieselbe logische Änderung hat zwei Eintrittspfade, und nur der HTTP-Pfad broadcastet** bei Slash/Plan-Mode-Änderungen.

`current_mode_update` existiert heute (`Session.ts:1645`; Helper `sendCurrentModeUpdateNotification` bei `Session.ts:1625`), ist aber nur mit Tool-Confirmation-Pfaden verdrahtet – `exit_plan_mode` (`Session.ts:2160`) und Edit-Tool `ProceedAlways` (`Session.ts:2168`) – nicht mit dem generischen `Session.setMode`/`setModel`. Es gibt keinen `current_model_update`-Typ. Beide fließen heute über `BridgeClient.sessionUpdate()` (`bridgeClient.ts:397`) als **generisches `session_update`** ohne Sub-Typ-Demux in den Bus.

### 1.1 Coordination-Modell (die tragende Entscheidung)

v1s "Agent ist der Single-Emitter; Bridge verwirft ihren Publish" wurde **abgelehnt** – die Bridge besitzt die Serialisierung (`modelChangeQueue`), Timeout-Behandlung, `model_switch_failed` und die Persist/Workspace-Unterscheidung. Adoptiertes Modell:

1. **Die Bridge bleibt der autoritative Emitter für Änderungen, die sie antreibt** (HTTP `setSessionModel`/`setSessionApprovalMode`, `applyModelServiceId` zur Attach-Zeit) – unveränderte Serialisierungs-/Timeout-/Failure-/Persist-Logik.
2. **In-Session-Änderungen, die die Bridge umgehen**, erhalten eine neue Agent-Benachrichtigung, die die Bridge demuxt (§2.1), über **unterschiedliche Transports** (v7):
   - **2a. A1 (Model):** `Session.setModel` emittiert `current_model_update` über den Agent→Bridge **`extNotification`**-Side-Channel (NICHT ein `sessionUpdate` – diese ACP-Union hat keine Model-Variante). `BridgeClient.extNotification()` demuxt es → `model_switched`.
   - **2b. A2 (Approval-Mode):** `Session.setMode` emittiert `current_mode_update` als echtes ACP **`sessionUpdate`**. `BridgeClient.sessionUpdate()` demuxt es → `approval_mode_changed`.
3. **Suppress-during-roundtrip – nur Model-Pfad.** Der HTTP-**Model**-Pfad fließt durch `Session.setModel` (`acpAgent.ts:935`), sodass die Agent-Benachrichtigung dort zusätzlich zum Bridge-Publish feuert; der Demux unterdrückt die Promotion, während ein Bridge-Model-Roundtrip läuft. Der HTTP-**Approval-Mode**-Pfad fließt **nicht** durch `Session.setMode` (er nutzt die ExtMethod, `acpAgent.ts:2228`), sodass dort gar keine Agent-Benachrichtigung feuert – die Bridge ist der einzige Emitter und es gibt nichts zu unterdrücken. Suppression ist nur für den Model-Pfad sinnvoll.

---

## 2. A1 – In-Session-Model-Switch auf dem Bus

### Problem

`Session.setModel` (`Session.ts:1580`) → `config.switchModel()` (`:1601`), kein `sessionUpdate`. `model_switched` wird von drei Bridge-seitigen Sites veröffentlicht: `bridge.ts:2883` (`setSessionModel`), `bridge.ts:1172` (`applyModelServiceId`), und keine für In-Session – die Lücke.

### Vorgeschlagenes Design

1. **Transport: `extNotification`, kein `sessionUpdate` (v7).** `current_model_update` ist **keine** ACP-`SessionUpdate`-Variante. Daher emittiert `Session.setModel`, nachdem `switchModel` aufgelöst ist (**nur bei Erfolg**), über den Agent→Bridge **`extNotification`**-Side-Channel mit dem **vollqualifizierten Methodennamen `qwen/notify/session/model-update`** (entsprechend der bestehenden `qwen/notify/session/*`-Konvention; Impl. in #4546) und dem Payload `{ v:1, sessionId, currentModelId }`. Kein `previousModelId` / `authType` (die Bridge leitet `previous` aus ihrem State-Cache ab §2.3; `model_switched` ist `{sessionId,modelId}`). **Implementierungshinweis:** Der aktuelle Early-Return-Guard von `BridgeClient.extNotification()` (`if (method !== 'qwen/notify/session/mcp-budget-event') return;`) muss zu einem Method-Dispatch werden, damit der Model-Update-Handler erreichbar ist (erledigt in #4546).
2. **`BridgeClient.extNotification()` (`bridgeClient.ts:491`) demuxt** die `current_model_update`-Benachrichtigung → `model_switched` (§2.1), **nur wenn kein Bridge-Model-Roundtrip** für diese Session läuft. (Das `current_mode_update` von A2 bleibt ein echtes `sessionUpdate`, das in `sessionUpdate()` demuxt wird – siehe §2.1.)
3. **`model_switch_failed` bleibt nur Bridge** – `Session.setModel` wirft ohne Benachrichtigung; die Bridge veröffentlicht es weiterhin auf beiden Failure-Pfaden.
4. **Timeout-Race (Best-Effort-Demux-Drop + autoritativer Reconciliation-Backstop – v9).** Das `withTimeout` der Bridge (`bridge.ts:2844-2849`) kann rejecten (und `model_switch_failed(A)` veröffentlichen), während der ACP-Call von A weiterläuft (FIXME `bridge.ts:2836-2840`). Wenn dann eine Änderung B erfolgreich ist (`model_switched(B)`) und As Call endlich abschließt, darf As spätes `current_model_update(A)` A nicht als scheinbaren Endzustand setzen. **Ein reiner Wertvergleich kann dies nicht entscheiden** (ein spätes, veraltetes `A` und ein frischer Switch zu `A` sehen identisch aus – ein Distributed-Ordering-Problem). Daher: Der Demux führt ein **Best-Effort-Dedup** durch (verwirft ein `current_model_update`, dessen `currentModelId` bereits `entry.currentModelId` entspricht – ein redundantes No-Op), und die **autoritative Korrektheit kommt aus der §2.2-Reconciliation**: Eine früher getimoutete Änderung entspricht immer einem _abgeschlossenen Bridge-Roundtrip_, der einen autoritativen Read nach dem Abschluss auslöst, der das wahre Modell des Agents erneut veröffentlicht. Kein Agent-seitiger Sequence-Counter erforderlich.
**Verbleibende Lücke — Zombie-Roundtrip (v13).** Die Reconciliation deckt den _ersten_ Abschluss (den Timeout) ab, aber ein Zombie-ACP-Call, der **nach** Abschluss der Reconciliation (die bereits `action=converged` ausgelöst hat) abgeschlossen wird, ist NICHT abgedeckt: Der Agent wendet das abgelaufene Modell verspätet an → emittiert `current_model_update(A)` → der Demux promoted es (kein Roundtrip läuft, kein Duplikat) → der Bus springt stillschweigend zu A zurück, was dem erfolgreichen Wechsel des Benutzers zu B widerspricht. Die langfristige Lösung ist ein ACP-Cancel-Signal (das vorhandene FIXME bei `bridge.ts:2836-2840`). Bis dahin handelt es sich um eine **bekannte verbleibende Race Condition** unter der engen Bedingung: Timeout löst aus, Reconciliation konvergiert (Agent hat noch nicht angewendet), Benutzer wechselt erfolgreich zu B, DANN schließt der Zombie ab. Die Wahrscheinlichkeit ist gering (erfordert, dass der Agent länger braucht als der Timeout + Reconciliation-Read + ein nachfolgender erfolgreicher Wechsel), aber nicht null. Wir dokumentieren dies hier, anstatt zu behaupten, dass die Reconciliation den Timeout-Race vollständig eliminiert.

### 2.1 Demux-Contract (zwei Insertion Points)

Der Demux hat **zwei Insertion Points**, da A1 und A2 unterschiedliche Transports nutzen (v7):

- **A1 — `BridgeClient.extNotification()` (`bridgeClient.ts:491`):** die `current_model_update`-Notification → `model_switched`.
- **A2 — `BridgeClient.sessionUpdate()` (`bridgeClient.ts:397`):** das `current_mode_update`-sessionUpdate → `approval_mode_changed`. Diese Methode publisht heute jede Notification wortwörtlich als `{ type: 'session_update', data: params }`; der Demux wird hier hinzugefügt.

Die folgenden Regeln gelten an dem jeweiligen Insertion Point, an dem der Sub-Type eintrifft:

- **Promotion-Table:** `current_model_update → model_switched`; `current_mode_update → approval_mode_changed` (session-scoped; auf Schritt 3 verschoben, siehe §7).
- **Payload-Mapping (beide Sub-Types müssen angegeben werden, sonst werden sie von der SDK-Validierung verworfen):**
  - `current_model_update → model_switched`: mappe `currentModelId → data.modelId` und hebe das Envelope/`params.sessionId` in `data.sessionId` an. Der SDK-Validator erfordert eine nicht-leere `data.modelId` (`events.ts:1910`); ein wortwörtliches Promote (das `currentModelId` beibehält) würde die Validierung fehlschlagen lassen und stillschweigend verworfen werden — **A1 nicht funktionsfähig**. Daher ist das Promote ein Field-Mapping, kein Relabel.
  - `current_mode_update → approval_mode_changed`: baue das vollständige Payload `{ sessionId, previous, next, persisted: false, scope: 'session' }`. `next` = die `currentModeId` der Notification; **`previous` wird aus dem Bridge-State-Cache** `entry.currentApprovalMode` genommen (der Wert vor dieser Änderung — §2.3), sodass der Agent **kein** `previousModeId` sendet (das ACP `CurrentModeUpdate` hat ohnehin kein solches Feld). Eine In-Session-Änderung wird niemals im Workspace persistiert, daher `persisted:false`, `scope:'session'`. `scope` ist **additiv** auf `DaemonApprovalModeChangedData` und orthogonal zu `persisted`: `scope` gibt an, welchen Bus (diese Session vs. Peer-Sessions) das Event adressiert; `persisted` gibt an, ob es auch Workspace-Einstellungen geschrieben hat. Der eigene `persist:true`-HTTP-Pfad der Bridge emittiert das `scope:'workspace', persisted:true`-Gegenstück (`bridge.ts:3007`).
- **Suppress-during-roundtrip (pro Change-Type, nicht pro Session):** promote ein `current_model_update` nur, wenn kein Bridge-getriebener **Modell**-Roundtrip für diese Session läuft; promote ein `current_mode_update` nur, wenn kein Bridge-getriebener **Approval-Mode**-Roundtrip läuft. Ein Modell-Roundtrip darf ein In-Session-`current_mode_update` NICHT suppressen (und umgekehrt) — eine Cross-Attribute-Suppression würde die Änderung der anderen Achse stillschweigend verwerfen.
- **Best-effort dedup (Modell):** der Demux verwirft ein `current_model_update`, dessen `currentModelId` bereits `entry.currentModelId` (§2.3) entspricht — ein redundantes No-Op. Er versucht **nicht**, nach Wert zwischen stale und fresh zu unterscheiden (allein nach Wert unmöglich); der maßgebliche Backstop für den Timeout/Concurrent-Race ist die §2.2 Reconciliation (§2 Punkt 4).
- **Drop-when-suppressed (dritte Regel):** wenn ein _promotable_ Sub-Type NICHT promoted wird (suppressed oder stale), **verwirf ihn vollständig** — falle **nicht** auf das Publizieren des generischen `session_update` zurück. Die Bridge publisht bereits das maßgebliche Named Event; das zusätzliche Emittieren des Generic Wrappers würde ein Double-Signal erzeugen. (Verbleibender Concurrent-in-Session-Drift wird durch die §2.2 Reconciliation behandelt.)
- **Generic-wrapper suppression:** ein promoted Sub-Type publisht nur das Named Event — **außer während des Dual-Emit-Transition-Windows (unten)**.
- **Dual-emit transition (IDE-Companion-Lockstep, siehe §6):** da der Daemon und der VS Code IDE-Companion über unterschiedliche Kanäle ausgeliefert werden und nicht atomar umgeschaltet werden können, publisht das ERSTE Release des `current_mode_update`-Promotes **sowohl** das promootete `approval_mode_changed` ALS AUCH das Legacy Generic `session_update{sessionUpdate:'current_mode_update'}` für einen Release-Zyklus. Das bestehende `case 'current_mode_update'` des IDE-Companions funktioniert weiterhin; sobald dessen `approval_mode_changed`-Handler ausgeliefert wird, entfernt das nächste Release das Dual-Emit. `current_model_update` ist brandneu (kein Legacy-Consumer), daher wird es direkt ohne Dual-Emit promoted. **Die Entfernung wird erzwungen, nicht dem Gedächtnis überlassen:** ein `TODO(dual-emit-removal)`-Kommentar an der Dual-Emit-Publish-Stelle verweist auf diesen Abschnitt, und §7 Schritt 3 enthält ein Tracking-Issue mit einem Ziel-Release — sodass der redundante Generic Wrapper nicht stillschweigend permanent werden kann (und kein neuer Consumer darauf aufbauen sollte).
- **Observability (erforderlich, nicht optional):** emittiere bei jeder Demux-Entscheidung ein strukturiertes Log — `[demux] session=<id> type=<sub> action=promoted|dropped|suppressed|generic reason=<why>`. `BridgeClient.sessionUpdate()` hat heute null Logging; insbesondere der `dropped`-Fall muss sichtbar sein, damit der On-Call unterscheiden kann: "Agent hat nicht emittiert" / "Demux hat verworfen" / "SSE verloren".
- **Unbekannte Sub-Types:** unverändert (generisches `session_update`).

### 2.2 Post-Roundtrip Reconciliation (Concurrent-in-Session-Drift)

Suppress + Drop geht davon aus, dass der Bridge-Roundtrip und der Agent **dieselbe** Änderung beschreiben. Das bricht bei einer gleichzeitigen In-Session-Änderung zusammen, da In-Session-`/model`-Aufrufe `Session.setModel` **direkt aufrufen und NICHT in die `modelChangeQueue` gelangen**:

1. Bridge `setSessionModel(A)` startet → Suppress-Window öffnet sich.
2. Benutzer tippt `/model B` im Terminal → `Session.setModel(B)` (umgeht die Queue) → Agent emittiert `current_model_update(B)`.
3. Demux **verwirft** B (Suppress-Window offen).
4. Bridge publisht das maßgebliche `model_switched(A)`; **Bus zeigt A, Session läuft mit B — nichts wird abgeglichen.**

**Contract (v9/v10/v11 — maßgeblicher Read, Generation-guarded, non-recursive):** die Reconciliation feuert, wenn ein Bridge-Modell-Roundtrip abschließt — auf **beiden** Pfaden, Erfolg und Misserfolg (ein `.finally` auf dem Roundtrip, da der Timeout-/Fehlerfall genau der Zeitpunkt ist, zu dem der Bus am wahrscheinlichsten divergiert ist). Er liest das **tatsächliche** aktuelle Modell des Agents über `getSessionContextStatus` (`bridge.ts:2784`, asynchrone `extMethod`) und emittiert, wenn es vom aktuellen Modell des Bus (`entry.currentModelId` — auf dem Fehlerpfad ist dies der **Pre-Roundtrip**-Wert, da `model_switch_failed` den Cache nicht aktualisiert) abweicht, ein korrigierendes `model_switched` über `publishModelSwitched`. **Warum nicht der §2.3 Cache _als Wahrheitsquelle_:** der Cache wird nur an Publish-Stellen aktualisiert, kann also eine gleichzeitige In-Session-Änderung, die der Demux **verworfen** hat, nicht beobachten — das Lesen würde fälschlicherweise "keine Divergenz" schlussfolgern. Der Agent ist die einzige Source of Truth. Der Read ist asynchron, läuft aber **post-settle, außerhalb des Demux**, daher gilt die §5 Synchronous-Block-Constraint nicht. (Langfristig: In-Session-`/model` durch die `modelChangeQueue` routen — §10 Q3 — um dies an der Quelle race-frei zu machen.) Dasselbe Reconciliation gilt für A2, sobald die `approvalModeQueue` existiert.

**Fresh-Read-Invariante (v11/v12):** der von der Reconciliation verwendete `getSessionContextStatus`-Read MUSS einen frischen Point-in-Time-Wert aus dem Agent-Prozess zurückgeben — er MUSS jeden Response-Cache, Request-Deduplication oder In-Flight-Coalescing umgehen. Ohne dies erzeugt eine gecachte Antwort, die zufällig mit `entry.currentModelId` übereinstimmt, ein falsches "converged" (reale Divergenz übersehen — der Agent könnte bereits weiter sein), und eine gecachte Antwort, die von `entry.currentModelId` abweicht, erzeugt eine falsche "Korrektur", die den Bus auf einen stale Wert setzt, anstatt auf das tatsächliche aktuelle Modell des Agents. In der Praxis: `extMethod` ist bei jedem Aufruf ein frischer JSON-RPC-`requestSessionStatus`-Call — heute existiert kein Middleware- oder Transport-Level-Caching. Die Invariante ist vertraglich festgelegt: jede zukünftige Caching-Schicht MUSS Reconciliation-Reads ausnehmen.

**Generation Guard (v10 — schließt das Read-Window-TOCTOU):** zwischen dem Settle und der Rückkehr des asynchronen Reads kann ein gleichzeitiges In-Session-`/model C` ein `model_switched(C)` promoten; der laufende Read (vor C abgesetzt) gibt den Pre-C-Wert zurück und die Reconciliation würde C überschreiben. Fix: eine sessionsbezogene `modelPublishGeneration` wird bei **jedem** `model_switched`-Publish (Bridge / Demux-Promotion / Reconciliation-Korrektur) hochgezählt — ausschließlich über den `publishModelSwitched`-Helper (v11). Die Reconciliation erfasst die Generation **vor** dem Read und **überspringt die Korrektur, wenn sie während des Reads fortgeschritten ist** — ein neueres maßgebliches Publish ist bereits angekommen, der Bus ist also aktuell.

**`publishModelSwitched`-Helper (v11/v12 — Durchsetzungsmechanismus):** eine einzelne Funktion `publishModelSwitched(entry, modelId, opts?: { originatorClientId?: string })`, die atomar (ein synchroner Turn): (1) `entry.currentModelId = modelId` setzt, (2) `entry.modelPublishGeneration` inkrementiert, (3) `model_switched` an den Bus publisht (mit `originatorClientId`, falls angegeben). **Alle** `model_switched`-Publish-Stellen — Bridge-Roundtrip-Erfolg, `applyModelServiceId`, Demux-Promotion, Reconciliation-Korrektur — MÜSSEN durch diesen Helper geleitet werden. Bridge-Roundtrip und `applyModelServiceId` übergeben die aufgelöste `originatorClientId`; Demux-Promotion und Reconciliation-Korrektur übergeben keine (kein einzelner Client hat die Änderung ausgelöst). Direktes `events.publish({type:'model_switched', ...})` ist außerhalb des Helpers verboten. Dies macht es unmöglich, einen Generation-Bump zu verpassen oder die Client-Zuordnung stillschweigend zu verwerfen, und eine Test-Invariante kann fordern: nach jedem Code-Pfad, der ein `model_switched` erzeugt, ist die Generation um genau 1 fortgeschritten.

**Non-Recursion-Regel (v11/v12 — strukturell erzwungen):** die Reconciliation-Korrektur ruft `publishModelSwitched` auf (ein lokales Bus-Publish) und plant **KEINE** nachfolgende Reconciliation. Wenn ein Implementierer `publishModelSwitched` durch einen Wrapper faktorisiert, der auch eine `.finally`-Reconciliation anhängt, ist das Ergebnis eine unendliche Korrekturschleife (reconcile → read → publish → reconcile → …). Jede Korrektur bumped die Generation, aber jede neue Reconciliation liest den Agent und könnte eine Divergenz feststellen (die Korrektur aktualisiert den _Bus_, nicht den _Agent_). **Structural Guard (v12):** ein sessionsbezogenes `reconciliationInFlight: boolean`-Flag wird vor dem asynchronen Read auf `true` und danach (in `.finally`) auf `false` gesetzt. Das Roundtrip-Settle-`.finally` prüft dieses Flag vor der Planung der Reconciliation; wenn `true`, loggt es `[reconcile] session=<id> action=skipped-reentrant` und kehrt zurück. Dies macht Non-Recursion invariant unter Refactoring — es kann nicht durch eine Reorganisation des Call-Graphs ausgehebelt werden. Der `publishModelSwitched`-Helper selbst hat keine Side-Effects über die Punkte (1)–(3) hinaus.

**Read-Error: Bounded Retry, dann Surface.** Ein vorübergehender `getSessionContextStatus`-Fehler darf den Bus nicht permanent divergiert zurücklassen, nur mit einer Log-Zeile. Retry 1–2× mit kurzem Backoff; wenn alle fehlschlagen, emittiere ein `reconciliation_failed`-Bus-Event und logge `action=read-error`.

- **Payload (v13):** `reconciliation_failed { sessionId: string, error: string, retryCount: number, trigger: 'roundtrip-settled' | 'failed' }`. Der `error` unterscheidet "Agent-Prozess abgestürzt" von "JSON-RPC-Timeout" für die Consumer-UX und On-Call-Diagnostik.
- **Consumer-Contract:** beratend — Clients KÖNNEN eine vorübergehende Warnung anzeigen und KÖNNEN ihren eigenen `getSessionContextStatus`-Pull auslösen, um sich selbst zu heilen. Kein obligatorischer Handler; ohne Consumer bleibt der Bus-Zustand wie zuletzt publisht (stale, aber nicht terminal).
- **Per-Attempt-Logging:** jeder Retry-Versuch emittiert seine eigene Log-Zeile: `[reconcile] session=<id> attempt=<n>/<max> error=<msg>`, sodass der On-Call vorübergehende von anhaltenden Fehlern unterscheiden kann, ohne das finale aggregierte Event zu benötigen.
**Failure-path Consumer-Event-Reihenfolge (v12).** Auf dem Failure-Path (Timeout/Fehler) können Consumer `model_switch_failed` beobachten, gefolgt von (nach der asynchronen Reconciliation) `model_switched(A)` für genau das Modell, das "fehlgeschlagen" ist — dies passiert, wenn der Agent das Modell trotz Bridge-Timeout tatsächlich angewendet hat. Dies ist das korrekte Verhalten: die Reconciliation-Korrektur ist maßgeblich. Consumer SOLLTEN `model_switched` unabhängig von vorangegangenen Failure-Events immer als maßgeblich betrachten (alle Fehler-Toasts für das fehlgeschlagene Modell verwerfen). §8 enthält einen Test, der diese vollständige, für Consumer sichtbare Event-Reihenfolge validiert.

**Observability:** `[reconcile] session=<id> trigger=roundtrip-settled|failed baseline=<modelId> actual=<modelId> gen_before=<N> gen_after=<M> action=corrected|converged|skipped-newer-gen|skipped-reentrant|read-error`.

### 2.3 Bridge-State-Cache (synchrone Quelle für "aktuelles" Modell/Modus/Befehle)

Der Staleness-Check (§2 Punkt 4), die §2.2 Reconciliation und der A5-Snapshot (§5) benötigen alle das **aktuelle** Modell / den Approval-Mode / die Befehle der Session. Die Bridge hatte keinen synchronen Accessor — nur `getSessionContextStatus` (`bridge.ts:2784` → `requestSessionStatus`, ein asynchroner `extMethod`-Roundtrip), und ein `await` an dieser Stelle würde genau das TOCTOU-Fenster wieder öffnen, das diese Mechanismen schließen. Daher:

- Zu `SessionEntry` hinzufügen: `currentModelId?: string`, `currentApprovalMode?: ApprovalMode`, `availableCommands?: AvailableCommand[]`.
- **Synchrones Update an jeder Publish-Stelle**, im selben synchronen Turn wie der Publish (kein `await` zwischen dem Lesen des alten und dem Schreiben des neuen Werts): Alle `model_switched`-Publishes laufen über den §2.2 `publishModelSwitched`-Helper (der atomar `entry.currentModelId` aktualisiert + `entry.modelPublishGeneration` erhöht + auf den Bus publisht); `approval_mode_changed` (`:2979` / `:3007`) aktualisiert `entry.currentApprovalMode`; `availableCommands` wird in `BridgeClient.sessionUpdate()` aktualisiert, wenn es ein generisches `available_commands_update`-sessionUpdate empfängt — der Handler setzt `entry.availableCommands = payload.commands` synchron **vor** dem generischen Forwarding-Publish. Der Helper garantiert, dass keine Publish-Stelle ein Cache- oder Generation-Update verpassen kann.
- **`availableCommands`-Spezifika (v13):** Der Typ ist `AvailableCommand[]` (passend zu `status.ts`). Anders als bei Modell/Modus gibt es für dieses Feld **kein benanntes promotetes Bus-Event** und **keine Reconciliation** — es ist ein passiver Cache, der über den generischen `session_update`-Pfad aktualisiert wird. Wenn der Implementierer den Hook verpasst, liefert der A5-Snapshot veraltete/undefinierte Befehle ohne Fallback. Der Trigger-Pfad ist explizit `BridgeClient.sessionUpdate()` → prüfe `params.type === 'available_commands_update'` → Cache aktualisieren → als generisches `session_update` weiterleiten.
- **Seed** aus der `createSession` / `loadSession` ACP-Response, wenn der Eintrag erstellt wird (anfängliches Modell/Modus), bevor eine Änderung eintritt.
- **Consumer (synchrone Feld-Lesezugriffe):**
  - **A5-Snapshot (§5):** Liest alle drei Felder in einem synchronen Block — der Hauptzweck des Caches.
  - **Best-effort Demux-Dedup (§2.1):** Verwirft ein `current_model_update`, dessen `currentModelId` bereits `entry.currentModelId` entspricht.
  - **`previous`-Ableitung (A1/A2):** Der Demux füllt `approval_mode_changed.previous` aus `entry.currentApprovalMode`, _erfasst bevor_ der neue Wert angewendet wird — **der Agent sendet also niemals `previousModeId` / `previousModelId`** (umgeht das Problem, dass das ACP-`CurrentModeUpdate`-Schema kein `previousModeId`-Feld hat).
- **KEIN Consumer: §2.2 Reconciliation.** Die Reconciliation benötigt das _tatsächliche_ Modell des Agents, was der Cache nicht liefern kann (er sieht niemals unterdrückte und verworfene Benachrichtigungen); die Reconciliation verwendet stattdessen den maßgeblichen `getSessionContextStatus`-Read (§2.2, v9). Der Cache spiegelt nur das wider, was _gepublisht_ wurde.

Dies macht den Cache zu einer erstklassigen synchronen Quelle für Snapshot + Dedup + `previous`, ohne in den Wahrheitspfad der Reconciliation einzugreifen.

### Workspace-Mirror (explizite Entscheidung)

`Session.setModel` hat standardmäßig `persistDefault:true` (`Session.ts:1610`) und schreibt `model.name` über `getPersistScopeForModelSelection(this.settings)` (`Session.ts:1611`) — **Workspace-Scope für einen vertrauenswürdigen Workspace, der `modelProviders` besitzt, andernfalls User-Scope**. In beiden Fällen **führt A1 Phase 1 nur einen Session-scoped Broadcast aus**; Begründung: Peer-Sessions übernehmen das persistierte Standardmodell beim nächsten Spawn, und es gibt kein sicherheitsrelevantes Cross-Session-Gating wie beim Approval-Mode. Ein Workspace-Mirror für persistierte Modelle ist ein explizit aufgeschobener Follow-up (§10) und wird nicht stillschweigend weggelassen.

### Risiko

Double-Broadcast (abgemildert durch §1.1 + die drei §2.1-Regeln); Verlust von Failure-Events (Ausnahme in Punkt 3). Tests in §8.

---

## 3. A2 — In-Session Approval-Mode-Änderung (asymmetrisch; blockiert durch #4510)

### Problem

1. **Stille In-Session-Änderung.** `Session.setMode` (`Session.ts:1561`) → `config.setApprovalMode()` (`:1573`), keine Benachrichtigung.
2. **HTTP umgeht `Session.setMode`.** `setSessionApprovalMode` steuert die extMethod `qwen/control/session/approval_mode` (`acpAgent.ts:2200`) → `config.setApprovalMode()` direkt (`acpAgent.ts:2228`). Das In-Session-Emit allein deckt HTTP nicht ab, und HTTP emittiert keine Agent-Benachrichtigung.
3. **Payload + Persist.** `approval_mode_changed` benötigt `{previous,next,persisted}` (`bridge.ts:2979` Session-scoped, `:3007` Workspace-scoped). `current_mode_update` trägt nur `currentModeId`; der Agent hat kein `persist`-Konzept.
4. **Noch kein Serialisierungs-Primitiv.** `approvalModeQueue` **existiert heute nicht** in der Codebasis; der Approval-Mode-HTTP-Pfad (`bridge.ts:2893-3020`) führt extMethod + Publish inline aus, ohne eine Queue pro Session (anders als der `modelChangeQueue` des Modell-Pfads). Das Suppress/Race-Fenster ist daher unbegrenzt, bis #4510 es implementiert.

### Vorgeschlagenes Design

**Session-scoped — In-Session-Emits; Bridge bleibt alleiniger Emit-Verursacher für HTTP:**

1. Emit `current_mode_update` aus `Session.setMode` (deckt ACP `setSessionMode`, `acpAgent.ts:922` und In-Session `/approval-mode` ab).
2. Der HTTP-extMethod-Pfad behält den Session-scoped `approval_mode_changed`-Publish der **Bridge** (`bridge.ts:2979`) bei und emittiert **keine** Agent-Benachrichtigung (er umgeht `Session.setMode`) — die Bridge ist der alleinige Emit-Verursacher; es gibt nichts zu unterdrücken.
3. **`previous` kommt aus dem Bridge-State-Cache — der Agent sendet KEIN `previousModeId`.** Der SDK-Normalizer `normalizeApprovalModeChanged` (`normalizer.ts:754`) erfordert `previous`, daher muss das promovierte `approval_mode_changed` diesen Wert tragen. Aber das ACP-`CurrentModeUpdate` hat nur `currentModeId` (kein `previousModeId`-Feld — dieselbe External-Union-Einschränkung, auf die v7 für A1 gestoßen ist; man kann einem spezifizierten Typ kein Pflichtfeld hinzufügen). Lösung: Der **Demux füllt `previous` aus `entry.currentApprovalMode`** (der gecachte Wert vor dieser Änderung, §2.3) und aktualisiert den Cache im selben synchronen Turn auf `currentModeId`. Das `current_mode_update` des Agents bleibt in der unveränderten ACP-Form (`{currentModeId}`), und die Bridge erzeugt immer ein vollständiges `{previous,next}` — kein SDK-Drop, keine ACP-Schema-Änderung.
4. **Helper-Generalisierung (Migrationsmodell spezifiziert):** `sendCurrentModeUpdateNotification` (`Session.ts:1625`) leitet heute `newModeId` aus einem `ToolConfirmationOutcome` ab (nur `auto-edit`/`default`/current). Es wird generalisiert, um eine explizite `currentModeId` zu akzeptieren, damit `Session.setMode` für jeden `ApprovalMode` emittieren kann (`plan`/`yolo`/`auto`/…). Die beiden bestehenden Tool-Confirmation-Caller (`Session.ts:2160`, `:2168`) behalten ihren `ToolConfirmationOutcome`-Einstiegspunkt (der `currentModeId` vorberechnet und dann delegiert) — KEINE Flag-Day-Entfernung; Deprecation wird separat verfolgt. Kein Caller muss `previous` berechnen (die Bridge leitet es ab, Punkt 3).

**Workspace-scoped (Persist) bleibt nur bei der Bridge:**

5. Der Persist- + Workspace-Broadcast (`bridge.ts:3007`) bleibt ein Publish auf Bridge-Ebene, der durch den `persist`-Flag der Bridge gesteuert wird; `persisted:true` erscheint nur auf dem Workspace-Event. Einen `scope: 'session' | 'workspace'`-Diskriminator hinzufügen.

### Harte Voraussetzung (blockiert A2)

A2 ist **blockiert, bis PR #4510 `approvalModeQueue` einbringt** (oder einen gleichwertigen In-Flight-Tracker pro Session für Approval-Mode-Roundtrips). Ohne ihn ist das Suppress/Koordinations-Fenster unbegrenzt. Konkret (die Abweichung, die dies verhindert): Bridge startet `setSessionApprovalMode('default')`; In-Session `/approval-mode yolo` feuert in der Zwischenzeit; wenn die Promotion für das gesamte unbegrenzte Fenster unterdrückt wird, wird die `yolo`-Benachrichtigung verworfen und feuert nie erneut → der Bus zeigt `default`, während der tatsächliche Modus `yolo` ist (sicherheitsrelevant). Das begrenzte `approvalModeQueue`-Fenster ist die Abhilfemaßnahme.

### Double-Emit-Edge-Case

`/approval-mode` während eines offenen Tool-Confirmation-Dialogs kann innerhalb von Millisekunden zwei `current_mode_update` auslösen (User-`setMode` + der `ProceedAlways`-Handler des Tools). Akzeptabel (konvergiert); optional kann das Emit übersprungen werden, wenn der resultierende Modus dem aktuellen entspricht. Dokumentiert, nicht blockiert.

### Risiko / Kompatibilität

Additiv auf Wire-Ebene (`current_mode_update`-Wiederverwendung + `previousModeId` + `scope`), aber **nicht** SDK-additiv für den promoteten Typ (siehe §6). Hart blockiert durch #4510.

---

## 4. A4 — `permission_resolved` Originator/Voter-Semantik

### Problem

`permission_request.originatorClientId` = Prompt-Originator. `permission_resolved.originatorClientId` = Voter — das Emit bei `permissionMediator.ts:1125` stempelt `originatorClientId` aus `resolverClientId` im Spread bei `permissionMediator.ts:1135-1137` (die vertrauenswürdige clientId des Voters, O8 pre-F3-Kompatibilität). Consumer müssen `permission_resolved` als Sonderfall behandeln.

### Vorgeschlagenes Design (additiv auf Wire- und SDK-Ebene)

- **Wire:** `voterClientId` neben `originatorClientId` emittieren (gleicher Wert). Beide **optional** — Resolutionen ohne Voter (Timer-Ablauf, Session geschlossen, Loopback-Voter ohne `X-Qwen-Client-Id`) tragen wie bisher keines von beiden.
- **SDK typisiertes Event:** **Sowohl** `originatorClientId` (unverändert — kein Rename, kein Break) **als auch** eine neue optionale `voterClientId` bereitstellen; das alte Feld wird als Deprecated-Alias für ein zukünftiges Major-Release dokumentiert.
- Der Prompt-Originator bleibt durch Korrelation mit der passenden `permission_request` verfügbar.

### Wire / Kompatibilität

Additiv auf beiden Ebenen — kein Consumer-Break. Spiegelt das D4-Aliasing wider (PR #4510).

---

## 5. A5 — Side-Channel-Snapshot beim Attach

### Problem

Ein `Last-Event-ID`-Attach erhält Replay + Live-Tail, aber keinen aktuellen Side-Channel-Snapshot. Heute zieht er `qwen/status/session/context` (`packages/acp-bridge/src/status.ts:96`), Supported-Commands, `POST /load`.

### Vorgeschlagenes Design

Opt-in via `?snapshot=1`; emittiert einen synthetischen **`session_snapshot`**-Frame nach dem Replay:

```
session_snapshot { approvalMode, model, availableCommands? }
```

- **`replay_complete` existiert bereits** (`eventBus.ts:444`, ausgeliefert durch gemergtes #4484) — A5 Phase 2 führt nur den neuen `session_snapshot`-Frame ein, nicht `replay_complete`.
- **Resume-Reihenfolge: replay → `replay_complete` → `session_snapshot`.** Der Snapshot ist das maßgebliche Endergebnis.
- **Erfassung zum Emissionszeitpunkt aus dem §2.3 Bridge-State-Cache, in einem einzigen synchronen Block.** Dies ist genau deshalb machbar, weil §2.3 `entry.currentModelId` / `currentApprovalMode` / `availableCommands` als synchrone Felder hinzufügt (bei jedem Publish aktuell gehalten + beim Session-Create geseedet). Der Snapshot liest diese drei Felder und publisht in einem synchronen Turn — kein `await` dazwischen, kein asynchroner `extMethod`-Status-Roundtrip — sodass eine gleichzeitige Mutation nicht dazwischenfunken kann. (Das "Capture at subscribe (T0), emit after replay" aus v3 hatte einen Stale-Overwrite-Bug: Ein während des Replays zugestelltes Live-`model_switched` würde durch den zuletzt angewendeten T0-Snapshot überschrieben; die Erfassung zum Emissionszeitpunkt aus dem Live-Cache behebt dies.) Ohne §2.3 gibt es keine synchrone Quelle für den "aktuellen" Zustand und dieser Contract wäre nicht implementierbar — was der v8 Critical war.
- **First-Attach-Reihenfolge** (keine `Last-Event-ID`): `replay_complete` wird NICHT forciert gepusht (es fand kein Replay statt), und das Design synthetisiert **kein** `replay_complete{replayedCount:0}` — dies würde den "replaying→live"-Contract dieses Events für bestehende Consumer erweitern. Stattdessen ist `session_snapshot` **beim First-Attach selbstbegrenzend**: er wird als erster Frame emittiert, vor dem Live-Tail; Consumer behandeln einen `session_snapshot` als "Baseline etabliert". (Resume behält die obige Reihenfolge replay → `replay_complete` → Snapshot bei.)
- **`pendingPermissionIds` ausgeschlossen** (Sicherheit, siehe unten).
- SDK: Das typisierte `session.snapshot`-Event seedet die Side-Channel-Felder des View-State-Reducers, angewendet zuletzt (beim Resume) / zuerst (beim First-Attach).
### `?snapshot=1` Sub-Contract

Erster Connect: aus, außer `?snapshot=1`. Reconnect: opt-in (am nützlichsten). Umschalten über Reconnects hinweg: erlaubt + idempotent (jedes Subscribe ist unabhängig). Atomarität: Best-Effort — Capture-at-Emission + nachfolgende Live-Deltas werden abgeglichen; der Reducer-Test deckt eine Racing-Mutation ab.

### Security: Warum keine `pendingPermissionIds`

Das Einschließen von Pending-IDs würde es einem Client ermöglichen, über einen Request abzustimmen, dessen Kontext er nie erhalten hat. `respondToSessionPermission` validiert die Session-Existenz, den requestId/Pending-Status, die **clientId-Registrierung** (`resolveTrustedClientId` gegen `entry.clientIds`, `bridge.ts:2271`) und die Zulässigkeit der Option — aber **nicht**, ob der Voter den ursprünglichen `permission_request` gesehen hat. Der Angreifer ist daher ein registrierter Session-Mitarbeiter (bereits Bearer-authentifiziert + clientId-registriert), kein anonymer Client — enger gefasst als "jeder neue Client", aber die Lücke ist real: Er könnte eine destruktive Op genehmigen, für die er keinen Kontext hat. Clients, die Pending-Permissions legitimerweise benötigen, erfahren sie durch Replay (der vollständige Kontext wird mitgeliefert). Das Weglassen des Feldes macht den Snapshot/Resolution-Race ebenfalls hinfällig.

### Wire / Compat

Additiv, opt-in. Ein älteres SDK zeigt den unbekannten Frame als `debug`-UI-Event an (laut, aber nicht kaputt) — ein weiterer Grund, es bei opt-in zu belassen.

### Alternativen

Phase 1: Nur den Pull-Contract dokumentieren (Pull nach `replay_complete`); den Frame aufschieben.

---

## 6. Querschnittsthemen

- **Bridge-authoritatives Modell (§1.1)**: Die Bridge besitzt die Events für Änderungen, die sie antreibt; In-Session-Änderungen fügen eine Notification hinzu, die die Bridge demuxt — A1 via `extNotification()` (`bridgeClient.ts:491`), A2 via `sessionUpdate()` (`bridgeClient.ts:397`); Suppress + Drop-when-suppressed verhindern Double-Signals. Suppression ist nur für den Model-Pfad relevant; der HTTP-Approval-Mode hat keine Agent-Notification.
- **Demux (§2.1) ist eine harte Voraussetzung**; A2 ist zusätzlich **blockiert durch #4510** (`approvalModeQueue`).
- **NICHT überall additiv; wird durch einen Dual-Emit-Übergang gelöst.** Die Beförderung von `current_mode_update` → `approval_mode_changed` ändert den beobachteten Event-Typ. Der Daemon und der VS Code IDE Companion werden über **unterschiedliche Kanäle** ausgeliefert (CLI-Auto-Update vs. Marketplace), daher kann der Wechsel nicht atomar erfolgen. **Betroffene Consumer-Chain (alle müssen einen `approval_mode_changed`-Pfad erhalten):**
  - `packages/vscode-ide-companion/src/services/qwenSessionUpdateHandler.ts:177` (`case 'current_mode_update'`) — der Leaf-Handler;
  - der Upstream-Dispatch, der Daemon-Events dorthin routet — `daemonIdeConnection.ts` und `DaemonChannelBridge.ts` switchen auf `event.type` und verwerfen nicht erkannte Typen via `default`, sodass selbst ein aktualisierter Leaf-Handler ein nacktes `approval_mode_changed` nie erhält, bis diese erweitert sind.
  - **Mitigation (§2.1 Dual-Emit):** Das erste Release emittiert SOWOHL das Legacy-generische `session_update{current_mode_update}` ALS AUCH das beförderte `approval_mode_changed`; der IDE Companion funktioniert weiterhin mit dem Legacy-Frame; sobald sein `approval_mode_changed`-Pfad ausgeliefert wird, entfernt das nächste Release den Dual-Emit. A4 (`voterClientId`) und A5 (opt-in Frame) SIND additiv (kein Übergang nötig).
- **Failure-Events bleiben bridge-only** (`model_switch_failed`).
- **Concurrent-in-session Drift** wird durch die Post-Roundtrip-Reconciliation in §2.2 begrenzt.
- **SDK-Reducer-Updates** (Benennung, um die A1/A2-Verwechslung zu vermeiden): A1 führt **`current_model_update`** → `model.changed` ein; A2 befördert **`current_mode_update`** → `approval_mode_changed`; A4 fügt optionale `voterClientId` hinzu; A5 seedet Side-Channel-State aus `session.snapshot`.

---

## 7. Ablauf

1. **A4** — additiver Wire + SDK-Alias. Kleinstes, nicht blockiertes Element.
2. **A1 — `current_model_update` via `extNotification`** (ausgeliefert als #4546 Core) — `Session.setModel` emittiert die `extNotification`; der Demux in `BridgeClient.extNotification()` (`bridgeClient.ts:491`) befördert sie zu `model_switched`. Core-Pfad + Suppress-per-Type + Observability in #4546 erledigt; **der §2.3-State-Cache + Staleness-Check + §2.2-Reconciliation sind das A1-Follow-up** (sie benötigen die Cache-Felder).
   - **2b. §2.3 Bridge-State-Cache** — `currentModelId`/`currentApprovalMode`/`availableCommands` zu `SessionEntry` hinzufügen, bei jedem Publish aktualisiert + beim Erstellen geseedet. Voraussetzung für das A1-Staleness/Reconciliation-Follow-up UND für A5.
   - **2c. Atomare Kopplung:** Reconciliation und `modelPublishGeneration`-Guard sind ein einzelnes atomares Deliverable; das Ausliefern von Reconciliation ohne den Guard erzeugt eine Clobber-Regression (eine gleichzeitige Beförderung während des asynchronen `getSessionContextStatus`-Reads würde einen veralteten Wert zurückschreiben). Beides muss im selben PR landen.
3. **A2 — BLOCKIERT durch PR #4510** (`approvalModeQueue`). Fügt `current_mode_update`-Beförderung hinzu (`previous` abgeleitet aus dem §2.3-Cache — kein `previousModeId` auf dem Wire), `Session.setMode`-Emit, Helper-Generalisierung, `scope`, beibehaltenes Bridge-Workspace-Publish, den **Dual-Emit-Übergang** + IDE-Companion- + Upstream-Dispatch-Updates.
   - **3b. Dual-Emit-Entfernung** — verfolgt durch ein GitHub-Issue mit einem Ziel-Release; die Dual-Emit-Publish-Stelle trägt `TODO(dual-emit-removal)` unter Verweis auf §2.1. Das Issue wird geschlossen, wenn das nächste Release den Dual-Emit entfernt.
   - **3c. A2 Post-Roundtrip-Reconciliation** — gleicher §2.2-Contract, liest den echten Approval-Mode des Agents; fügt `approvalModePublishGeneration` und `publishApprovalModeChanged`-Helper hinzu. Muss zusammen mit der A2-Beförderung landen (gleiche Begründung wie 2c — Reconciliation ohne Generation-Guard ist schlechter als keine Reconciliation).
4. **A5** — Phase 1 Pull-Contract-Docs; Phase 2 opt-in `session_snapshot` (Capture-at-Emission in einem synchronen Block; nach `replay_complete` beim Resume, selbstbegrenzendes erstes Frame beim First-Attach). `replay_complete` existiert bereits (#4484); nur `session_snapshot` ist neu.

Jedes Element landet als eigener Implementierungs-PR, nachdem dieses Design genehmigt wurde.

---

## 8. Testplan

- **Demux/§1.1:** Befördertes `current_model_update` publisht `model_switched` und unterdrückt den generischen Wrapper; eine Notification während eines laufenden Bridge-Model-Roundtrips wird **verworfen** (nicht generisch publisht, nicht befördert); eine In-Session-Notification WIRD befördert; unbekannter Sub-Typ bleibt generisch.
- **A1:** In-Session `/model` UND Plan-Mode publisht jeweils genau ein `model_switched`; HTTP `POST /model` und `applyModelServiceId` zur Attach-Zeit publisht jeweils genau eins (kein Double); fehlgeschlagenes `setModel` (In-Session + HTTP) emittiert kein `model_switched`, HTTP emittiert weiterhin `model_switch_failed`; ein `model_switched` nach einem Timeout-`model_switch_failed` wird zugestellt (authoritative-latest).
- **A2:** In-Session `setMode` publisht ein session-scoped `approval_mode_changed{scope:'session',persisted:false}`; HTTP `POST /approval-mode` publisht eins (Bridge, alleiniger Emit, kein Double); non-persisted broadcastet NICHT im Workspace; persisted fügt ein `scope:'workspace',persisted:true`-Event hinzu; fehlgeschlagenes `setMode` emittiert nichts; die unbegrenzte Window-Divergenz wird verhindert, sobald `approvalModeQueue` landet.
- **A4:** **Unterscheidungsfall** — Client A reicht den Prompt ein (also `permission_request.originatorClientId === A`), ein ANDERER Client B gibt die auflösende Stimme ab (also `permission_resolved.voterClientId === B`), assertiere, dass die beiden unterschiedlich sind (die Disambiguierung, für die A4 existiert, nicht nur der Same-Client-Wert); Timer/No-ClientId-Resolution trägt keines der beiden Felder; SDK legt beide offen; Old-Daemon-Fallback zeigt den Voter via `originatorClientId` an. (Erledigt in PR #4539.)
- **A5:** `?snapshot=1` Resume liefert `session_snapshot` (Mode/Model/Commands, keine pendingPermissionIds) nach `replay_complete`; First-Attach liefert `session_snapshot` als erstes Frame mit **keinem** synthetischen `replay_complete`; Attach OHNE das Flag liefert KEINEN Snapshot; das Umschalten des Flags über Reconnects hinweg ist idempotent; ein `model_switched`, das während des Replays zugestellt wird, wird NICHT durch den (Emission-Time, Synchronous-Capture) Snapshot überschrieben.
- **Best-Effort Dedup (§2.1):** Ein `current_model_update(A)`, das eintrifft, wenn `entry.currentModelId` **bereits A** ist, wird **verworfen** (redundantes No-Op). Ein `current_model_update(A)`, wenn der Cache B ist (A≠B), kein Roundtrip läuft, **wird befördert** (der Demux unterscheidet NICHT wertbasiert zwischen Stale-vs-Fresh — das ist Aufgabe der Reconciliation). _(Korrigiert aus einem v8-Szenario, das fälschlicherweise einen wertbasierten Drop erwartete.)_
- **Reconciliation (§2.2, authoritative + generation-guarded):**
  - _corrective:_ Bridge `setSessionModel(A)` läuft → gleichzeitiges In-Session `/model B` verworfen (suppress) → Bridge publisht `model_switched(A)` → Post-Settle `getSessionContextStatus` (gemockt → B) → corrective `model_switched(B)`; Bus konvergiert auf B (und das Corrective aktualisiert Cache + Generation).
  - _converged:_ Status-Read entspricht `entry.currentModelId` (das aktuelle Model des Busses) → kein Corrective (`action=converged`).
  - _generation-skip (TOCTOU):_ Eine Beförderung landet während des asynchronen Reads (Generation rückt vor) → Reconciliation **überspringt** das Corrective, selbst wenn ihr Read stale ist (`action=skipped-newer-gen`).
  - _failure-path trigger:_ Ein Roundtrip mit Timeout (`model_switch_failed`) triggert weiterhin die Reconciliation; die Vergleichsbasis ist `entry.currentModelId` (der Pre-Roundtrip-Wert, da `model_switch_failed` den Cache NICHT aktualisiert); wenn der Agent das Model A mit Timeout tatsächlich angewendet hat (Read gibt A zurück) und `entry.currentModelId` immer noch der alte Wert B ist, emittiert die Reconciliation corrective `model_switched(A)` via `publishModelSwitched` → Bus konvergiert auf A.
  - _read-error:_ Status-Read schlägt bei allen Retries fehl → emittiert `reconciliation_failed { sessionId, error, retryCount, trigger }` mit korrektem Payload; Pro-Attempt-Logs werden emittiert (`attempt=1/<max>`, `attempt=2/<max>`); kein Corrective.
- **Cross-Axis Non-Suppression (§2.1):** Ein laufender Bridge-**Model**-Roundtrip unterdrückt KEIN In-Session `current_mode_update` (es WIRD befördert), und umgekehrt.
- **Bridge-State-Cache (§2.3):** Jede `model_switched`-Publish-Stelle routet durch `publishModelSwitched`, was `entry.currentModelId` aktualisiert UND `entry.modelPublishGeneration` erhöht; assertiere, dass die Generation nach jedem Schritt um genau 1 vorgerückt ist (einschließlich des Reconciliation-Correctives). Die Snapshot/Dedup/Generation-Guard-Reads sehen den neuesten Wert synchron; Cache wird beim Erstellen der Session geseedet.
- **Dual-Emit-Übergang (§2.1/§6):** Während des Fensters werden SOWOHL `approval_mode_changed` ALS AUCH `session_update{current_mode_update}` emittiert; nach der Entfernung nur `approval_mode_changed`.
- **extNotification-Transport (v7):** `current_model_update` trifft via `extNotification()` ein (nicht `sessionUpdate()`) und wird zu `model_switched` befördert.
- **Compat-Migration (§2.1):** Ein SDK-Reducer, der zuvor `current_mode_update` als generisches `session_update` erhalten hat, erreicht denselben Zustand, sobald es zu `approval_mode_changed` befördert wird.
- **Helper-Regression (§3 Punkt 4):** `exit_plan_mode`- und `ProceedAlways`-Caller erzeugen weiterhin korrekte `current_mode_update`-Payloads, nachdem der Helper generalisiert wurde.
- **Double-Emit-Edge (§3):** Gleichzeitiges `/approval-mode` + `ProceedAlways` emittieren beide; Reducer konvergiert.
- **Non-Recursion Structural Guard (§2.2):** Während die Reconciliation läuft (`reconciliationInFlight === true`), wird eine gleichzeitige Beförderung, die die Reconciliation triggern würde, **übersprungen** (`action=skipped-reentrant`); das Flag wird zurückgesetzt, nachdem die laufende Reconciliation abgeschlossen ist, unabhängig vom Ergebnis. Zusätzlich: Nachdem ein Reconciliation-Corrective `model_switched` feuert, assertiere, dass `getSessionContextStatus` **genau einmal** für das triggernde Settle-Event aufgerufen wird — das Corrective-Publish betritt den Reconciliation-Pfad NICHT erneut (begrenzte Aufrufanzahl).
- **Failure-Path Converged (§2.2):** `model_switch_failed` feuert → Reconciliation liest `getSessionContextStatus` → gibt `entry.currentModelId` zurück (unverändert) → kein Corrective emittiert (`action=converged`); Bus-State unverändert.
- **Generation-Counter-Werte (§2.3):** Nach einer Promote → Reconciliation → Corrective-Sequenz entspricht `entry.modelPublishGeneration` `gen_before + 2` (eins für das initiale Promote, eins für das Corrective); `gen_before`/`gen_after`, die in der Observability geloggt werden, entsprechen den Counter-Werten beim Eintritt/Austritt der Reconciliation.
## 9. Abgeschlossene Entscheidungen (Emitter Ownership)

| Eintrag                                            | Agent-Pfad                                                                   | über `Session.*`?             | Session-gebundener Emitter                                                              | Workspace-Publish                            |
| -------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------- |
| `POST /session/:id/model`                          | `unstable_setSessionModel` (`acpAgent.ts:925`) → `session.setModel` (`:935`) | ✅                            | **Bridge** (`bridge.ts:2883`); Agent-Benachrichtigung **während des Roundtrips unterdrückt** | n/a                                          |
| `applyModelServiceId` anhängen                     | gleicher Pfad                                                                | ✅                            | **Bridge** (`bridge.ts:1172`); während des Roundtrips unterdrückt                       | n/a                                          |
| In-Session `/model`, Plan-Modus                    | `Session.setModel` direkt                                                    | ✅                            | **Agent** `current_model_update` → Demux                                                | n/a (zurückgestellt)                         |
| `POST /session/:id/approval-mode`                  | extMethod (`acpAgent.ts:2200`) → `config.setApprovalMode` (`:2228`)          | ❌ umgeht `Session.setMode`   | **Bridge** (`bridge.ts:2979`); **keine Agent-Benachrichtigung** (nichts zu unterdrücken) | Bridge, `persist`-gesteuert (`bridge.ts:3007`) |
| ACP `setSessionMode` / In-Session `/approval-mode` | `acpAgent.ts:922` → `Session.setMode`                                        | ✅                            | **Agent** `current_mode_update` → Demux                                                 | n/a                                          |

`model_switch_failed` ist auf allen Pfaden ausschließlich in der Bridge vorhanden.

**Abgeschlossen: A2 behält den extMethod-Bypass bei (den HTTP-approval-mode-Pfad NICHT durch `Session.setMode` routen).** Dies war eine offene Frage; es ist architektonisch tragend (bei einer Änderung würde der HTTP-Pfad eine Agent-Benachrichtigung auslösen und die Aussage in §1.1 "keine Agent-Benachrichtigung, nichts zu unterdrücken" wäre falsch, was zu einem Double-Emit führen würde). Entscheidung: Bypass beibehalten – die Bridge bleibt der alleinige Emitter für den HTTP-approval-mode, es wird dort keine Suppress-Logik benötigt. Eine erneute Prüfung würde erfordern, Suppress-Logik sowie die `approvalModeQueue`-Abhängigkeit zu diesem Pfad hinzuzufügen, weshalb dies ausdrücklich out of scope ist.

## 10. Offene Fragen

1. **A1 Workspace-Mirror:** Den zurückgestellten Persisted-Model-Workspace-Mirror ausliefern oder das Modell dauerhaft Session-gebunden lassen? (Der Persist-Scope selbst ist Workspace- oder User-bezogen gemäß `getPersistScopeForModelSelection`.)
2. **A5 Default:** `?snapshot=1` als Opt-in beibehalten oder für Reconnects immer aktivieren.
3. **Reconciliation vs. Serialize-at-Source (A1) — das Race-freie Ziel.** Der Suppress- + Best-Effort-Dedup- + Authoritative-Reconciliation- + Generation-Guard-Stack existiert nur, weil In-Session `/model` die `modelChangeQueue` umgeht und mit Bridge-gesteuerten Änderungen in einen Race-Zustand gerät. Das Routen von In-Session-Modelländerungen durch **dieselbe** `modelChangeQueue` (sodass alle Modelländerungen serialisiert und der Reihe nach veröffentlicht werden) eliminiert die Suppress/Dedup/Reconcile-Mechanik und jeden daraus entstandenen TOCTOU – es ist das korrekte Langzeit-Design. Es wird nur zurückgestellt, weil es erfordert, dass der In-Session-Handler (`Session.setModel` → Agent) über die ACP-Grenze hinweg mit der Queue des Bridge-Eintrags koordiniert, was eine größere Änderung darstellt. Bis dahin ist der v10-Stack die Übergangsmaßnahme mit dem oben dokumentierten Residual-Race-Verhalten. **Es wird empfohlen, das Serialize-at-Source-Refactoring zu planen, anstatt die Reconciliation auf unbestimmte Zeit zu härten.**