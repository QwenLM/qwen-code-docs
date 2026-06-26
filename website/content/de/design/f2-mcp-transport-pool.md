# F2: Shared MCP Transport Pool — Design v2.2

> Targets `daemon_mode_b_main` (gemäß #4175 Branching-Strategie). Ersetzt #4175 Wave 5 PR 23.
> **Ein-PR-Auslieferung** gemäß der Richtlinie des Maintainers für funktional kohärente Batches (2026-05-19).
> Autor: doudouOUC. Datum: 2026-05-20. Überarbeitet: 2026-05-20 (v2.2 — Zusammenführung von Implementierungs-Reviews).

---

## 0. Änderungsprotokoll

### v2.2 (2026-05-20) — PR #4336 Implementierung + 32 Übernahme-Reviews

PR #4336 lieferte F2 als 6 atomare Commits + 6 Fix-Commits über ~4 Stunden aus. Wenshao hat kumulativ in 3 Batches reviewt; jeder Batch erzeugte Inline- + kritische Fixes, die zurückgefaltet wurden. Die folgende Tabelle zeigt die Änderungen gegenüber v2.1, gruppiert nach Review-Batch.

#### v2.1 → Erster Review-Batch (Commits 1-4, wenshao C1-C7 + S1-S4)

| #   | Fundstelle                                                  | Fehlerbeschreibung                                                                                                                                                                                                                          | Eingefalteter Commit |
| --- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| C1  | `acpAgent.ts:269` — IDE-close Pfad                          | Pool-Leeren lief nur im SIGTERM-Handler; ein vom IDE initiierter normaler Schließen-Vorgang ließ Einträge auslaufen, bis das Betriebssystem sie einsammelte. Spiegelt das SIGTERM-Pool-Leeren bei `await connection.closed`                  | `ae0b296c4`          |
| C2  | `mcp-pool-entry.ts:cancelDrainTimer`                        | `cancelDrainTimer` setzte `maxIdleTimer` bei jedem Flackern zurück, wodurch die harte Obergrenze von §6.3 außer Kraft gesetzt wurde. Löscht jetzt nur `drainTimer`; max-idle überlebt die gesamte Lebensdauer eines Eintrags                 | `ae0b296c4`          |
| C3  | `mcp-pool-entry.ts:doRestart`                               | Fehlgeschlagener Verbindungsaufbau ließ den Eintrag in einem Zombie-Zustand zurück (`localStatus=CONNECTED`, `state='active'`, veralteter Snapshot). Try/catch + Übergang zu `'failed'` bei Fehlschlag                                       | `ae0b296c4`          |
| C4  | `mcp-pool-entry.ts:forceShutdown`                           | `state='closed'` wurde NACH `await`s gesetzt, sodass ein gleichzeitiger `acquire` `'active'` sehen und eine veraltete Verbindung ausgeben konnte. Wird jetzt synchron am Anfang gesetzt                                                     | `ae0b296c4`          |
| C5  | `mcp-transport-pool.ts:drainAll`                            | Gleichzeitiger `acquire` konnte mitten im Leeren einen neuen Eintrag erzeugen. `draining`-Mutex-Flag + `await Promise.allSettled(spawnInFlight)` vor dem Löschen hinzugefügt                                                               | `ae0b296c4`          |
| C6  | `mcp-pool-entry.ts:statusChangeListener`                    | Listener wurde nicht nach `serverName` gefiltert; jeder Eintrag erhielt Statusbenachrichtigungen von jedem Server + die eigenen `markActive`-Schreibvorgänge wurden zurückgeworfen                                                         | `ae0b296c4`          |
| C7  | `mcp-client-manager.ts:discoverAllMcpToolsIncremental`      | Pool-Mode-Gate wurde zu `discoverAllMcpTools` hinzugefügt, aber in `Incremental` übersehen — `/mcp refresh` umging den Pool und erzeugte einen Client pro Sitzung                                                                          | `ae0b296c4`          |
| S1  | `session-mcp-view.ts:passesSessionFilter`                   | Dokumentation hob nicht hervor, dass `excludeTools` direkte Gleichheit verwendet (keine Klammern-Form-Unterstützung); Abweichung gegenüber `mcp-client.ts:isEnabled`                                                                        | `ae0b296c4`          |
| S2  | `pid-descendants.ts` Docstring                              | Behauptete einen Windows-spezifischen `taskkill /F`-Zweig, der nicht existierte — Node polyfillt `process.kill('SIGTERM')` zu `TerminateProcess`                                                                                            | `ae0b296c4`          |
| S3  | `session-mcp-view.ts:applyTools` Debug-Log                  | String enthielt buchstäblich `"N"` anstelle einer Interpolation — Operatoren sahen `applied 12 tools (filtered to N registered)`                                                                                                             | `ae0b296c4`          |
| S4  | `mcp-transport-pool.ts:createUnpooledConnection` Status-CB  | Hartcodiert auf `() => CONNECTED`, sodass `aggregateStatusByName` nach einer Trennung log. Jetzt `() => client.getStatus()`                                                                                                                 | `ae0b296c4`          |

#### Commit-5 Selbstprüfungs-Batch (R1-R3 klein)

| #   | Fundstelle                                                 | Fehlerbeschreibung                                                                                                                                                                                                                       | Eingefalteter Commit |
| --- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| R1  | `server.test.ts:918` `/capabilities` Envelope              | Test bestätigte `getAdvertisedServeFeatures()` (keine Umschaltungen), aber server.ts übergibt `mcpPoolActive: opts.mcpPoolActive !== false` (standardmäßig aktiv). Umschaltung verankern                                                | `3e68c00bc`          |
| R2  | `server.test.ts` Standardmäßig-aktiv-Abedeckung            | Kein Test startete mit Standardoptionen, um zu prüfen, ob Pool-Tags angekündigt werden. Expliziten Test mit `mcpPoolActive: false` hinzugefügt                                                                                          | `3e68c00bc`          |
| R3  | `events.ts:DaemonMcpServerRestartRefusedData`              | Dokumentation besagte, dass SDKs vor dem PR "den neuen Wert als unbekannt sehen und generisch anzeigen" würden — tatsächlich lehnt `MCP_RESTART_REFUSED_REASONS.has(...)` ab → stilles Verwerfen                                        | `3e68c00bc`          |
#### Zweiter Review-Durchlauf (Commits 1-5, wenshao R1-R10)

| #   | Stelle                                               | Was falsch war                                                                                                                                                                                                                            | Einarbeitungs-Commit |
| --- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| WR1 | `mcp-pool-entry.ts:maxIdleTimer`                     | C2-Fix bewahrte `maxIdleTimer` korrekt über das Flapping, aber die Fire-Action schloss unabhängig von `refs.size` zwangsweise. Eine aktive Sitzung mit Wiederverbindung innerhalb der Gnadenfrist würde nach 5 Minuten Werkzeuge verlieren | `72399f109`          |
| WR2 | `mcp-client-manager.ts:discoverAllMcpToolsViaPool`   | `releaseAllPooledConnections` + erneutes Akquirieren aller Verbindungen bei jedem Durchlauf hinterließ ein kurzes Fenster mit null registrierten MCP-Werkzeugen und setzte jeden Drain-Timer zurück. Differenz gegen gewünschtes `(name, fingerprint)` | `72399f109`          |
| WR3 | `mcp-pool-entry.ts:doRestart` snapshot fan-out       | Neustart aktualisierte `toolsSnapshot`/`promptsSnapshot` und sandte getippte Ereignisse – aber keine `SessionMcpView`-Instanz hatte diesen Stream abonniert. Iteriere `subscribers` direkt nach dem Snapshot                                       | `72399f109`          |
| WR4 | `mcp-transport-pool.ts:getSnapshot subprocessCount`  | Zählte WebSocket zu `subprocessCount` – WebSocket verbindet remote, kein lokaler Kindprozess. Auf `'stdio'` beschränkt                                                                                                                     | `72399f109`          |
| WR5 | `pid-descendants.ts` PowerShell `-Filter`            | Interpolierte `${pid}` direkt in den `-Filter`-String. Der Einstiegspunkt `Number.isInteger` verhindert heute Injection; Bindung an `$p` für Defense-in-Depth gegen zukünftige Lockerungen der Guard                                             | `72399f109`          |
| WR6 | `mcp-pool-entry.ts` ctor `cfg` field                 | `readonly cfg: MCPServerConfig` war implizit öffentlich, machte Umgebungs-API-Schlüssel / Header-Auth / OAuth-Felder zugänglich. Auf `private` gesetzt; neuer `transportKind`-Getter für den einzigen externen Leser                              | `72399f109`          |
| WR7 | `mcp-pool-events.ts` premature exports               | 5 PoolEvent-Typwächter + `Prompt`-Reexport + `PoolEntryConnectionStatus` hatten keine Aufrufer. Entfernt; `MCPCallInterruptedError` beibehalten (Design §13.4 vorgeschrieben)                                                                 | `72399f109`          |
| WR8 | `acpAgent.ts:269,300` pool drain duplication         | SIGTERM + IDE-Schließen hatten identische `if (agentInstance) { try { await shutdownMcpPool(8_000) } catch... }`-Blöcke. `drainPoolBeforeExit(label)`-Helfer extrahiert                                                                      | `72399f109`          |

#### Commit-6 Selbstüberprüfungsdurchlauf (R1-R3 kritischer Wettlauf)

| #   | Stelle                                    | Was falsch war                                                                                                                                                                                              | Einarbeitungs-Commit |
| --- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| 6R1 | `mcp-transport-pool.ts:onClosed`          | Slot-Freigabe-Wettlauf: A beendet Spawn, B (anderer Fingerabdruck, gleicher Name) startet Spawn, A wird entladen. Close-cb prüfte nur `entries` (B noch nicht registriert) → vorzeitige Freigabe               | `0e58a098f`          |
| 6R2 | `events.ts:mcpBudgetWarningCount` JSDoc   | Workspace-weite Ereignisse werden an N Sitzungen verteilt → N Inkremente im Reducer; Verbraucher, die über Sitzungen aggregieren, zählen doppelt. Docstring aktualisiert, um den Multiplikator zu erwähnen | `0e58a098f`          |
| 6R3 | `acpAgent.ts:broadcastBudgetEvent`        | Iterierte direkt über `this.sessions.keys()` während asynchronem Fan-Out; gleichzeitiges `killSession` könnte Iterator beschädigen. Snapshot via `Array.from(...)`                                          | `0e58a098f`          |

#### Dritter Review-Durchlauf (Commits 1-6, wenshao W1-W15)

| #   | Stelle                                                          | Was falsch war                                                                                                                                                                                                                               | Einarbeitungs-Commit |
| --- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| W1  | `mcp-transport-pool.ts:spawnEntry` catch                        | Spawn-Fehler ließ `statusChangeListener` dauerhaft hängen – nur `forceShutdown` entfernt ihn. `entry.forceShutdown('manual')` zum Catch hinzugefügt                                                                                             | `4a3c5cd90`          |
| W2  | `mcp-pool-entry.ts:statusChangeListener` cross-check            | Modulweite `serverStatuses`-Map wird von Multi-Fingerabdruck-Einträgen gemeinsam genutzt. A's Transportfehler schrieb DISCONNECTED, B's Listener beschädigte B's `localStatus`. `client.getStatus()`-Prüfung hinzugefügt                       | `4a3c5cd90`          |
| W3  | `mcp-pool-entry.ts:doRestart` pid sweep                         | Neustart übersprang `listDescendantPids` + `sigtermPids` – jeder Neustart von `npx`/`uvx`-gewickeltem stdio verwaiste den eigentlichen MCP-Enkel. Bereinigung vor disconnect hinzugefügt                                                       | `4a3c5cd90`          |
| W4  | `mcp-pool-entry.ts:doRestart` drain timer race                  | Drain-Timer könnte während des Neustart-Yields feuern → `forceShutdown` entfernt Eintrag → `client.connect` erzeugt eine Waise. `cancelDrainTimer` + `state→active` am Anfang von `doRestart` hinzugefügt                                      | `4a3c5cd90`          |
| W5  | `mcp-client-manager.ts:pooledConnections` dead handles          | Wenn ein Eintrag zu `'failed'` wechselte, hielt der Manager die tote `PooledConnection` für immer. Abonniere Eintragsereignisse; entferne bei `'failed'` (idempotent via `get(name) === conn` Guard)                                            | `4a3c5cd90`          |
| W6  | `mcp-client-manager.ts:discoverAllMcpToolsViaPool` Reentranz    | Zwei sich überlappende Durchläufe könnten beide `set(name, conn)` aufrufen → erste Verbindung leakte. `discoveryInFlight`-Mutex hinzugefügt; zweiter Aufrufer wartet auf dasselbe Promise. Neuer Regressionstest                                   | `4a3c5cd90`          |
| W9  | `acpAgent.ts:parsePoolDrainMs` Strenge                          | `Number.parseInt` akzeptierte `'30000ms'` / `'30000abc'`. Strenger `^\d+$`-Regex; Ablehnung mit stderr-Warnung + Standardfallback                                                                                                              | `4a3c5cd90`          |
| W10 | `mcp-transport-pool.ts:acquire` indexAttach Reihenfolge         | `indexAttach` mutierte `sessionToEntries` VOR `entry.attach()`. Wenn `attach` einen Fehler warf, veraltete Reverse-Index-Zuordnung. `indexAttach` nach erfolgreichem `attach` verschoben (sowohl schnelle als auch in-flight-Pfade)               | `4a3c5cd90`          |
| W13 | `mcp-transport-pool.ts:subprocessCount` JSDoc                  | Dokumentation behauptete noch `stdio + websocket`, nachdem WR4 auf stdio beschränkte. Aktualisiert.                                                                                                                                         | `4a3c5cd90`          |
| W14 | `mcp-transport-pool.ts:createUnpooledConnection` catch          | Gleicher `statusChangeListener`-Leak wie W1 im ungepoolten Pfad. Gleicher Spiegel: `forceShutdown` vor disconnect                                                                                                                            | `4a3c5cd90`          |
| W15 | `bridge.ts:restartMcpServer` response                          | `as PoolEntries`-Cast war unsicher – ungetyptes JSON von ACP-Kind. `Array.isArray`-Prüfung + Shape-Guard pro Eintrag; fehlerhafte Einträge mit stderr-Brotkrümel übersprungen                                                                  | `4a3c5cd90`          |
#### Abgelehnt mit Antwort (als F2-Folgen erfasst)

| #   | Stelle                                              | Grund für Ablehnung                                                                                                                                                             |
| --- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W7  | Testabdeckungslücken (4 ungetestete kritische Pfade)      | 1/4 hinzugefügt (W6-Regressionstest); Rest auf fokussierten Testabdeckungs-PR nach Zusammenführung der F2-Serie verschoben                                                                                 |
| W8  | `maxReconnectAttempts` / `reconnectStrategy` ungenutzt | Forward-compat-Platzhalter für das verschobene, vom Gesundheitsmonitor gesteuerte Wiederherstellen der Verbindung (Design §6.6); Entfernen und erneutes Hinzufügen verursacht öffentliche Typänderungen                                          |
| W11 | Doppelte Fast-Path- / In-Flight-Path-Anhängeblöcke | ✅ Erledigt in PR A: Private Hilfsfunktionen `attachPooledSession` + `rollbackReservationOnSpawnFailure` (Commit `2d546efca`)                                                                |
| W12 | `passesSessionFilter` O(M×N) pro `applyTools`       | ✅ Erledigt in PR A: `applyTools` / `applyPrompts` berechnen Filter-`Set`s einmal pro Durchlauf vor; Prädikat wird O(1) pro Tool (Commit `a4a855ab3`)                                      |
| R9  | `McpClientManager` ctor 7 Positions-Sentinels      | ✅ Erledigt in PR A: Options-Objekt ctor + `mkManager`-Testfabrik (Commit `0cb1eaa27`)                                                                                             |
| R10 | `pgrep -P <pid>` Kosten pro PID und Ebene             | ✅ Erledigt in PR A: Einzelner `ps -A -o pid=,ppid=` Snapshot + In-Memory-BFS-Durchlauf; pgrep-BFS als Fallback für BusyBox <v1.28 / Distroless beibehalten (Commit landet als letzter PR-A-Teil) |

#### Fehleranzahl

- **3 Batches × 27 kritische / wichtige Korrekturen** + 5 Dokumentations-/Vorschlagsfaltungen = **32 Review-Einarbeitungen** insgesamt
- **2 kritische Race Conditions, die erst beim zweiten Blick entdeckt wurden** (6R1 Slot-Freigabe-während-Spawn-Race; W6 Wiedereintritts-Race bei Erkennung)
- **0 stille Fehler ausgeliefert** — jede Korrektur trägt einen Inline-`// F2 (#4175 Commit X Review-Korrektur — wenshao YN):` Brotkrümel, der auf die ursprüngliche Überprüfung verweist

### v2.1 (2026-05-20) — Single-PR-Strategie + 12 Review-Einarbeitungen

| #      | Was                                                                                                          | Warum                                                                                                             |
| ------ | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| V21-1  | Wechsel von 6-Unter-PR-Plan zu **einem funktional kohärenten PR** mit 6 atomaren Commits                           | Gemäß Maintainer-Anleitung (#4175 Branchenstrategie); Reviewer können Commit für Commit via `git log -p` lesen         |
| V21-2  | Hinzugefügt `sessionToEntries: Map<sid, Set<ConnectionId>>` Reverse-Index im Pool (§6)                              | `releaseSession` O(N Einträge) → O(Refs der Session); für 1000-Session-Skalierung erforderlich                               |
| V21-3  | `?fingerprint=` Query-Parameter auf Neustart-Route (§13.1)                                                          | Operator möchte möglicherweise nur einen Eintrag neu starten, wenn derselbe Name mehrere Fingerabdrücke hat; fast keine Kosten, es jetzt hinzuzufügen |
| V21-4  | Spawn-Fehlerpfad gibt reservierten Slot explizit frei (§6.1, §6.5)                                             | Andernfalls läuft der Slot bis zum nächsten Gesundheitsmonitor-Durchlauf; subtiler echter Fehler                                            |
| V21-5  | Neuer §13.4: Semantik für laufende Tool-Aufrufe während Wiederverbindung                                                     | `MCPCallInterruptedError`; Pool wiederholt NICHT automatisch (Schreibvorgänge unsicher)                                            |
| V21-6  | Neuer §10.4: `/mcp disable X` löst erneutes Anwenden von `SessionMcpView` aus                                                | Andernfalls entfernt eine Deaktivierung während der Sitzung nicht bereits registrierte Tools                                             |
| V21-7  | Status-Route gibt `entryIndex` aus, nicht rohen Fingerabdruck (§8.3)                                                 | Vermeidet Seitenkanal-Offenlegung der OAuth-Token-Rotation durch Fingerabdruckänderung                                     |
| V21-8  | Wiederholungsintervall für Wiederverbindung spezifiziert: stdio fest 5s × 3, HTTP/SSE exponentiell 1/2/4/8/16s × 5 (§6.6)                     | v2 hat nichts gesagt; HTTP benötigt längeres Wiederholungsbudget für Netzwerkflatter                                                  |
| V21-9  | `canonicalOAuth(o)` normalisiert `{enabled: false}` ≡ `undefined` ≡ `null` (§5.1)                               | Andernfalls erzeugen funktional äquivalente Konfigurationen unterschiedliche Einträge                                              |
| V21-10 | Pool-Fallback-Helfer umbenannt von "Legacy-In-Prozess-Acquire" zu `createUnpooledConnection` (§5.3, §6.1)      | SDK-MCP-Umgehung ist permanent, nicht Legacy                                                                         |
| V21-11 | `drainAll(opts?)` gibt `Promise<void>` mit `timeoutMs` Wanduhr-Budget zurück (§17)                            | Aufrufer muss wissen, wann der Drain abgeschlossen ist, um die Reihenfolge des Herunterfahrens zu bestimmen                                                  |
| V21-12 | SDK-Reduzierer-Feldnamen fixiert (Q1 gelöst): `mcpBudgetWarningCount` etc. mit Bereichssemantik in JSDoc beibehalten | Keine öffentliche API-Umbenennung während des PR                                                                                     |
| V21-13 | Fixiert Q3 (Standard-Pool-an, `--no-mcp-pool` Kill-Switch), Q4 (HTTP/SSE Opt-in), Q6 (Eager-Konstruktion)       | Single-PR-Auslieferung; keine Flag-Schaltung erforderlich                                                                       |
| V21-14 | Hinzugefügt R9/R10/R11 Single-PR-Risiken (§23)                                                                        | Review-Ermüdung, Merge-Konflikt mit daemon_mode_b_main, CI-Zeit                                                      |
| V21-15 | Behandlung von Waisen-Einträgen bei Deinstallation von Erweiterungen auf natürliches `MAX_IDLE_MS`-Reaping verschoben (§16.3)                      | Kein explizites `invalidateByExtension`; hält das Modell einheitlich                                                        |
### v2 (2026-05-20) — initial review fold-ins from v1 sketch

| #   | Was                                                                                                  | Warum                                                                                     |
| --- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| C1  | Pool verteilt **Werkzeuge + Prompts** (war: nur Werkzeuge)                                            | `McpClient`-Konstruktor akzeptiert beide Registries; Prompts gehen sonst im Pool-Modus still verloren       |
| C2  | Neuer Abschnitt über **Koexistenz globaler Zustände** (`serverStatuses` / `mcpServerRequiresOAuth` Modul-Maps) | Sitzungsübergreifende Nutzung existiert bereits heute; Pool übernimmt und formalisiert                     |
| C3  | Factory-Pfad von `connectToMcpServer` **vereinheitlicht** mit der `McpClient`-Klasse in F2-1                          | v1 hat nur die Klasse umstrukturiert; würde einen parallelen nicht-gepoolten Pfad hinterlassen                       |
| C4  | Snapshot-Wiedergabe beim Anhängen (earlyEvents-Stil) zu `PoolEntry.attach()` hinzugefügt                           | Neues Wettrennen: Sitzung B hängt an → Server sendet `tools/list_changed` bevor das Abonnement eingerichtet ist |
| C5  | `spawnInFlight: Map<ConnectionId, Promise<PoolEntry>>` zur Deduplizierung bei gleichzeitigem Abruf                  | v1 im Testmatrix erwähnt, aber im Implementierungsvertrag übersehen                          |
| C6  | Plattformübergreifende Absteiger-PID-Bereinigung (Linux/macOS pgrep, Windows wmic/PowerShell)                      | v1 sagte "opencode's `pgrep -P` kopieren" — das ist nur Unix-kompatibel                                    |
| C7  | `trust`-Feld als **Kopie** des Tool-Objekts pro Sitzung                                                     | trust lebt in `DiscoveredMCPTool`; eine gemeinsam genutzte Instanz würde das pro-Sitzung-Vertrauen vermischen            |
| C8  | HTTP/SSE-Transporte **Opt-in** für Pooling (Standard: nur stdio + Websocket)                           | Einige MCP-HTTP-Server verwalten einen sitzungsspezifischen Transportzustand; Teilen riskiert Zustandsverlust      |
| C9  | SDK-MCP-Server (`isSdkMcpServerConfig`) explizit umgehen                                               | `sendSdkMcpMessage` ist per Design pro Sitzung                                               |
| C10 | OAuth-Pfad explizit **auf F3 verschoben**                                                              | OAuth-Ablauf benötigt PermissionMediator-ähnliches Routing; nicht im Umfang von F2                            |
| C11 | Semantik der Neustart-Route spezifiziert (Name → alle passenden Einträge)                                          | PR 17s `POST /workspace/mcp/:server/restart` war zuvor eindeutig (1 Eintrag); jetzt 1..N   |
| C12 | Status-Routen-Refaktor-Abschnitt (neuer Pfad: `QwenAgent.getMcpPoolAccounting()`)                          | `httpAcpBridge.ts:733-770` liest derzeit den Manager der Bootstrap-Sitzung — muss geändert werden       |
| C13 | Generationszähler auf `PoolEntry` zum Schutz vor veralteten `tools/list_changed`-Handlern                        | Opencode-Muster: `if (s.clients[name] !== client) return`                                 |
| C14 | Aufteilung der Unter-PRs 4 → **6**                                                                            | v1 unterschätzt; A2/B1/B3/C6 fügen jeweils echte Arbeit hinzu                                          |
| C15 | Lazy Pool-Erstellung (nur wenn N≥2 Sitzungen gesehen) — optional                                       | `qwen serve --foreground` Einzelsitzung profitiert nicht; spart Initialisierungskosten                              |

---

## 1. Ziele / Nicht-Ziele

**Ziele**

- N Sitzungen in 1 Arbeitsbereich teilen sich 1 Prozess pro eindeutiger Serverkonfiguration — fingerabdruck-basiert
- Pro-Sitzungsansichten von `ToolRegistry` / `PromptRegistry` bleiben erhalten (Filterung, Vertrauen)
- Refcount + Grace-Drain-Lebenszyklus robust gegenüber erneutem Anhängen
- Plattformübergreifende Bereinigung von Absteiger-PIDs
- Budget-Begrenzungen werden von pro Sitzung auf pro Arbeitsbereich erweitert (PR 14 hat dies versprochen)
- Rückwärtskompatibilität mit nicht-Daemon standalone qwen (dort wird kein Pool erstellt)

**Nicht-Ziele (F2-Umfang)**

- Sitzungsübergreifendes Pooling (1 Daemon = 1 Arbeitsbereich, Invariante aus PR #4113 bleibt bestehen)
- Daemon-übergreifendes Pooling (außerhalb des Umfangs — Bereich des Multi-Prozess-Orchestrators)
- Überarbeitung des OAuth-Routings (F3 mit `PermissionMediator`)
- Pool-Persistenz über Daemon-Neustart hinweg (nur im Speicher)
- Automatische Erkennung von "pool-sicheren" HTTP-Servern (nur Opt-in-Flag)
- Live-`MCPServerConfig`-Diff zur direkten Änderung von Einträgen (Konfigurationsänderung → neuer Eintrag, alter wird abgebaut)

---

## 2. Aktueller Zustand (Ersetzungsziel)

```
acpAgent.newSession(sessionId)
  → newSessionConfig(cwd, mcpServers)                  // acpAgent.ts:1771
  → loadCliConfig → new Config → config.initialize()
  → ToolRegistry ctor → new McpClientManager(config, ...)   // tool-registry.ts:199
  → for (name, cfg) in config.getMcpServers():
      new McpClient(name, cfg, toolRegistry, promptRegistry, workspaceContext, ...)
      → client.connect() → client.discover(config)
```

**Kopplungsdiagramm (was aufgebrochen oder durchgereicht werden muss):**
| Kopplung                                                                         | Ort                                              | Aktion in F2                                                                        |
| -------------------------------------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `McpClient`-Konstruktor bindet 1 ToolRegistry + 1 PromptRegistry                         | mcp-client.ts:106-119                             | Pool besitzt Transport; `SessionMcpView` (pro Session) besitzt die Session-eigenen Registries |
| `McpClient.discover()` ruft `toolRegistry.registerTool()` inline auf                | mcp-client.ts:178-198                             | Aufteilung: `discoverAndReturn()` gibt Snapshot zurück; View registriert                       |
| `ListRootsRequestSchema`-Handler schließt über `workspaceContext.getDirectories()` | mcp-client.ts:142-153 + connectToMcpServer.ts:893 | Der an den Arbeitsbereich gebundene Kontext des Pools                                               |
| `workspaceContext.onDirectoriesChanged`-Listener wird pro Verbindung registriert          | mcp-client.ts:907                                 | Pool registriert einmal pro Eintrag                                                       |
| `McpClientManager` wird innerhalb von `ToolRegistry` instanziiert                                   | tool-registry.ts:199                              | Optionalen `pool?`-Konstruktorparameter hinzufügen; Injektion aus der Konfiguration                              |
| Budget-Durchsetzung pro Session                                                   | mcp-client-manager.ts:91-95 Kommentar               | Zustandsautomat in den Pool verschieben                                                        |
| `serverDiscoveryPromises` dedupliziert in-flight pro Server                            | mcp-client-manager.ts:350                         | Pool hat `spawnInFlight: Map<ConnectionId, Promise<PoolEntry>>`                     |
| `setMcpBudgetEventCallback`-Registrierung pro Session                             | acpAgent.ts:1851-1899                             | Pool emittiert → `QwenAgent` sendet an alle Sessions                                 |

**Bereits gemeinsam genutzter Zustand (Pool erbt, führt nicht neu ein):**

| Zustand                                          | Ort                         | Hinweis                                                              |
| ---------------------------------------------- | -------------------------------- | ----------------------------------------------------------------- |
| `serverStatuses: Map<string, MCPServerStatus>` | mcp-client.ts:292 (Modulebene) | Prozessweit derzeit; Pool-Schlüssel weiterhin nach Name → „any-CONNECTED-gewinnt“ |
| `mcpServerRequiresOAuth: Map<string, boolean>` | mcp-client.ts:302 (Modulebene) | Gleiches                                                              |
| `MCPOAuthTokenStorage`-Token auf Datenträger          | `~/.qwen/mcp-oauth/<name>.json`  | Daemon-übergreifend gemeinsam genutzt; Pool nutzt es nur effizienter               |

---

## 3. Referenzfunde

| Projekt         | Pool?              | Schlüssel                                           | Lebenszyklus                                                                               | Zu übernehmende Muster                                                                                                                |
| --------------- | ------------------ | --------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| **claude-code** | Nein, pro Prozess    | `name + JSON.stringify(cfg)` (lodash.memoize)       | `clearServerCache` + Remote-Backoff×5; Stdio-Absturz → `failed`                           | Sortiertes Schlüssel-SHA-256 `hashMcpConfig` für Invalidierung/Schlüsselvergabe                                                                       |
| **opencode**    | Ja, pro Arbeitsbereich | Server **nur Name** (kein Konfigurations-Hash)      | Kein Referenzzähler / keine Verdrängung / kein Neustart; Effect-Finalizer + `pgrep -P` rekursives SIGTERM | Nachkommen-PID-Bereinigung, Stale-Handler-Schutz (`if (s.clients[name] !== client) return`), `tools/list_changed`-Fan-out über Event-Bus |

**Was F2 von jedem erbt:** Konfigurations-Hash von claude-code (behandelt pro Session unterschiedliche Umgebungen/Authentifizierungen, was opencode nicht tut), Nachkommen-PID-Bereinigung von opencode (npx/uvx-Wrapper lecken). Was wir hinzufügen: Referenzzähler + Drain (Multi-Client-Daemon), automatischer Neustart (lange laufender Daemon), Prompt-Fan-out, Generierungs-Schutz.

---

## 4. Architektur

### 4.1 Prozess-Layout

```
HTTP daemon (packages/cli/src/serve, qwen serve)
  │ spawns
  ▼
ACP child (qwen --acp, single process per workspace)
  │
  QwenAgent (acpAgent.ts)
  ├── McpTransportPool ◄── new, workspace-scoped, 1 instance
  │     ├── entries: Map<ConnectionId, PoolEntry>
  │     ├── spawnInFlight: Map<ConnectionId, Promise<PoolEntry>>
  │     ├── workspaceContext (bound to daemon workspace)
  │     └── budget guardrails (PR 14 state machine, graduated to workspace)
  │
  └── sessions: Map<sessionId, Session>
        └── Session.Config → ToolRegistry → McpClientManager(pool?)
                                                     │
                                            ┌────────┴────────┐
                                            │ pool injected   │
                                            ▼                 ▼
                                pool.acquire(name,cfg,sid)   legacy in-process
                                  → SessionMcpView            (standalone qwen)
                                    .applyTools/Prompts
                                    (filter + register into
                                     session's own registries)
```
**Pool lebt im ACP-Child**, nicht im HTTP-Daemon. Der HTTP-Daemon fragt den Pool-Zustand über die vorhandene `bridge.client` extMethod-Oberfläche ab (`getMcpPoolAccounting`, `restartMcpServer`). Der F2-Code befindet sich in **`packages/core/src/tools/`** (neben `mcp-client-manager.ts`), nicht in `packages/acp-bridge/`.

### 4.2 Klassendiagramm

```
McpTransportPool
  ├─ acquire(name, cfg, sid) → PooledConnection
  ├─ release(connectionId, sid) → void
  ├─ releaseSession(sid) → void   (bulk release for session teardown)
  ├─ restartByName(name) → RestartResult[]
  ├─ getAccounting() → McpClientAccounting   (workspace-scope)
  ├─ getBudgetMode/Budget()
  ├─ drainAll() → Promise<void>   (shutdown)
  └─ onBudgetEvent: (event) => void   (set by QwenAgent)

PoolEntry (internal)
  ├─ refs: Set<sessionId>
  ├─ client: McpClient
  ├─ toolsSnapshot: DiscoveredMCPTool[]
  ├─ promptsSnapshot: Prompt[]
  ├─ generation: number   (++ on reconnect; stale-event guard)
  ├─ state: 'spawning' | 'active' | 'draining' | 'closed' | 'failed'
  ├─ drainTimer?: NodeJS.Timeout
  ├─ healthMonitor: { intervalTimer, consecutiveFailures, isReconnecting }
  ├─ subscribers: Map<sid, SessionMcpView>
  ├─ attach(sid, view) → PooledConnection
  └─ detach(sid) → void

PooledConnection (handle returned to caller)
  ├─ id: ConnectionId
  ├─ on('toolsChanged' | 'promptsChanged' | 'disconnected' | 'reconnected' | 'failed', cb)
  ├─ callTool(name, args, { sessionId }) → CallToolResult
  ├─ readResource(uri, { sessionId, signal })
  └─ release()

SessionMcpView (per session, per server)
  ├─ ctor(toolRegistry, promptRegistry, sessionId, serverName, cfg)
  ├─ applyTools(snapshot) → void   (filters by include/exclude, decorates trust)
  ├─ applyPrompts(snapshot) → void
  └─ teardown() → void   (removes its registrations)
```

---

## 5. Pool-Schlüssel (Fingerprint)

### 5.1 Gehashte kanonische Felder

```ts
type PoolKey = string; // sha256 hex, first 16 chars sufficient (collision-free for realistic N)
type ConnectionId = `${serverName}::${PoolKey}`;

function fingerprint(cfg: MCPServerConfig): PoolKey {
  const canonical = {
    transport: mcpTransportOf(cfg),
    command: cfg.command ?? null,
    args: cfg.args ?? [],
    cwd: cfg.cwd ?? null,
    env: sortedEntries(cfg.env ?? {}), // [[k,v],...] sorted by k
    url: cfg.url ?? null,
    httpUrl: cfg.httpUrl ?? null,
    headers: sortedEntries(cfg.headers ?? {}),
    timeout: cfg.timeout ?? null,
    oauth: canonicalOAuth(cfg.oauth),
  };
  return sha256(JSON.stringify(canonical)).slice(0, 16);
}

/**
 * V21-9: normalize functionally-equivalent OAuth configs so they
 * collapse to the same fingerprint. `{enabled: false}`, `undefined`,
 * `null`, and `{}` all mean "no OAuth" → all return `null`.
 */
function canonicalOAuth(o?: OAuthConfig | null): OAuthConfig | null {
  if (!o || !o.enabled) return null;
  return {
    enabled: true,
    clientId: o.clientId ?? null,
    scopes: o.scopes ? [...o.scopes].sort() : null,
    authorizationUrl: o.authorizationUrl ?? null,
    tokenUrl: o.tokenUrl ?? null,
  };
}

// Excluded fields (per-session filters, NOT transport-level):
//   includeTools, excludeTools, trust, description, extensionName
```

### 5.2 Transport-Klassengatter

```ts
const POOLED_TRANSPORTS_DEFAULT = new Set(['stdio', 'websocket']);

function isPoolable(cfg: MCPServerConfig, opts: PoolOptions): boolean {
  if (isSdkMcpServerConfig(cfg)) return false;
  const transport = mcpTransportOf(cfg);
  return opts.pooledTransports.has(transport);
}
```

**Standardmäßig `pooledTransports = {stdio, websocket}`**. Betreiber optieren HTTP/SSE ein über:

- CLI: `--mcp-pool-transports=stdio,websocket,http,sse`
- Env: `QWEN_SERVE_MCP_POOL_TRANSPORTS=stdio,websocket,http`

**Warum HTTP/SSE standardmäßig ausschließen**: Einige MCP-HTTP-Serverimplementierungen binden Zustand (Auth-Kontext, Gesprächsspeicher) an den TCP/SSE-Stream; mehrere ACP-Sitzungen, die diesen teilen, würden den Zustand vermischen. stdio + Websocket sind echte OS-Prozesse, deren Zustand beobachtbar und isolierbar ist.

### 5.3 SDK MCP-Umgehung

`isSdkMcpServerConfig(cfg)` wahr → Pool gibt einen dünnen `PooledConnection`-Wrapper über `createUnpooledConnection(name, cfg, sid)` zurück, der sofort einen `McpClient` erstellt, keine gemeinsame Nutzung, kein Eintrag im Pool gespeichert. Grund: `sendSdkMcpMessage` ist per Design sitzungsbezogen (durch die ACP-Steuerungsebene zurück zur ursprünglichen Sitzung). Derselbe Pfad wird für HTTP/SSE verwendet, wenn der Transport nicht in `pooledTransports` enthalten ist (§10.3).

V21-10: Name ist `createUnpooledConnection`, nicht `legacyInProcessAcquire` – SDK MCP und HTTP-Opt-out sind dauerhafte Designentscheidungen, kein Legacy-Code.

---

## 6. Lebenszyklus

### 6.1 acquire / release

```ts
class McpTransportPool {
  private entries = new Map<ConnectionId, PoolEntry>();
  private spawnInFlight = new Map<ConnectionId, Promise<PoolEntry>>();

  /** V21-2: reverse index, O(refs) releaseSession instead of O(entries). */
  private sessionToEntries = new Map<string, Set<ConnectionId>>();

  async acquire(
    name: string,
    cfg: MCPServerConfig,
    sid: string,
  ): Promise<PooledConnection> {
    if (!isPoolable(cfg, this.opts)) {
      return this.createUnpooledConnection(name, cfg, sid);
    }
    const id: ConnectionId = `${name}::${fingerprint(cfg)}`;

    if (this.entries.has(id)) {
      this.indexAttach(sid, id);
      return this.entries.get(id)!.attach(sid);
    }
    let inFlight = this.spawnInFlight.get(id);
    if (!inFlight) {
      const slot = this.tryReserveSlot(name);
      if (slot === 'refused') {
        throw new BudgetExhaustedError(
          name,
          this.clientBudget!,
          this.reservedSlots.size,
        );
      }
      inFlight = this.spawnEntry(name, cfg, id)
        .catch((err) => {
          // V21-4: release reserved slot on spawn failure. Without
          // this, slot leaks until health monitor's release path
          // runs (which it doesn't, because there's no entry to monitor).
          if (slot === 'reserved') this.releaseSlotName(name);
          throw err;
        })
        .finally(() => this.spawnInFlight.delete(id));
      this.spawnInFlight.set(id, inFlight);
    }
    const entry = await inFlight;
    this.indexAttach(sid, id);
    return entry.attach(sid);
  }

  release(id: ConnectionId, sid: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    entry.detach(sid);
    this.indexDetach(sid, id);
    if (entry.refs.size === 0) entry.startDrainTimer(this.opts.drainDelayMs);
  }

  /** V21-2: O(refs of this session), not O(all entries). */
  releaseSession(sid: string): void {
    const ids = this.sessionToEntries.get(sid);
    if (!ids) return;
    for (const id of ids) {
      const entry = this.entries.get(id);
      if (!entry) continue;
      entry.detach(sid);
      if (entry.refs.size === 0) entry.startDrainTimer(this.opts.drainDelayMs);
    }
    this.sessionToEntries.delete(sid);
  }

  private indexAttach(sid: string, id: ConnectionId): void {
    let ids = this.sessionToEntries.get(sid);
    if (!ids) {
      ids = new Set();
      this.sessionToEntries.set(sid, ids);
    }
    ids.add(id);
  }

  private indexDetach(sid: string, id: ConnectionId): void {
    const ids = this.sessionToEntries.get(sid);
    if (!ids) return;
    ids.delete(id);
    if (ids.size === 0) this.sessionToEntries.delete(sid);
  }
}
```
### 6.2 Deduplizierung paralleler Acquire-Vorgänge (`spawnInFlight`)

Spiegelt `McpClientManager.serverDiscoveryPromises` wider (mcp-client-manager.ts:350). Ohne sie sehen 5 Sitzungen, die beim Start spawnen, alle `entries.has(id) === false` und konkurrieren darum, 5 Kindprozesse zu spawnen.

### 6.3 Entleerungs-Gnadenfrist + Leerlauf-Obergrenze

```ts
const DRAIN_DELAY_MS_DEFAULT = 30_000; // Gnadenfrist nach letzter Freigabe
const MAX_IDLE_MS_DEFAULT = 5 * 60_000; // harte Obergrenze (Schutz vor Schleife durch Entleerungs-Abbruch)
```

Zustandsmaschine in `PoolEntry`:

```
spawning ──spawn ok──► active ──last detach──► draining ──timeout──► closed
   │                     │                       │
   │                     │                       └──attach──► active (Timer abbrechen)
   spawn fail───────────►failed
                          │
                          └──manual restart──► spawning
```

Harte Leerlauf-Obergrenze: Der Entleerungs-Timer kann unbegrenzt abgebrochen und neu gestartet werden (Acquire/Release-Flattern). `MAX_IDLE_MS` ist ein separater Timer, der **beim ersten Leerlauf** gestartet und nie zurückgesetzt wird; wenn er auslöst, wird der Eintrag zwangsgeschlossen, selbst wenn die Entleerung gerade in der aktiven Gnadenfrist ist. Verhindert Zombie-Pool-Einträge durch fehlerhafte Clients, die Acquire/Release übermäßig auslösen.

### 6.4 Plattformübergreifende Nachfahren-PID-Bereinigung

**R10 / R23 T7 / PR A Update (2026-05-22)**: Wechsel von pro-PID-BFS (ein `pgrep -P <pid>` / `Get-CimInstance -Filter`-Unterprozess pro Knoten) zu einem einzelnen Prozess-Tabellen-Snapshot gefolgt von einem In-Memory-Baumdurchlauf. Zwei Motivationen: (1) eine Fork anstelle von B^D Forks auf dem heißen Pool-Shutdown-Pfad; (2) Snapshot-Konsistenz – vor der Korrektur konnte BFS Nachfahren übersehen, die zwischen benachbarten BFS-Ebenen forkten. Der pro-PID-Pfad wurde als Fallback für BusyBox `ps` <v1.28 (keine `-o`-Unterstützung) und Distroless-Container ohne `ps` beibehalten.

```ts
// packages/core/src/tools/pid-descendants.ts
export async function listDescendantPids(rootPid: number): Promise<number[]> {
  if (!Number.isInteger(rootPid) || rootPid <= 0) return [];
  try {
    if (process.platform === 'win32')
      return await listDescendantPidsWin(rootPid);
    return await listDescendantPidsUnix(rootPid);
  } catch {
    return []; // OS räumt Waisenkinder auf; Pool-Shutdown wird trotzdem fortgesetzt.
  }
}

async function listDescendantPidsUnix(root: number): Promise<number[]> {
  let tree: Map<number, number[]> | undefined;
  try {
    tree = await snapshotProcessTreeUnix(); // ps -A -o pid=,ppid=
  } catch {
    /* fällt auf Fallback zurück */
  }
  if (tree) return walkDescendants(tree, root); // O(Nachfahren), 1 Fork
  return await listDescendantPidsUnixPgrepFallback(root); // Legacy-BFS
}

async function snapshotProcessTreeUnix(): Promise<Map<number, number[]>> {
  // -A: alle Prozesse (POSIX, äquivalent zu -e aber eindeutig auf BSD).
  // -o pid=,ppid=: pid + ppid Spalten, nachgestelltes `=` unterdrückt Kopfzeilen.
  const { stdout } = await execFile('ps', ['-A', '-o', 'pid=,ppid='], {
    timeout: 2000,
    maxBuffer: 8 * 1024 * 1024, // deckt pathologische Hosts mit >250k Prozessen ab
  });
  const childrenByPpid = new Map<number, number[]>();
  for (const line of stdout.split('\n')) {
    const m = line.trim().match(/^(\d+)\s+(\d+)$/);
    if (!m) continue;
    /* parsen, in childrenByPpid einfügen */
  }
  return childrenByPpid;
}

// Windows: einzelner Get-CimInstance Win32_Process | ConvertTo-Csv Snapshot
// aller (ProcessId, ParentProcessId) Zeilen + In-Memory-Baumdurchlauf; pro-PID
// `Get-CimInstance -Filter "ParentProcessId=$p"` als Fallback beibehalten.
```

Wird von `PoolEntry.shutdown()` vor `client.disconnect()` aufgerufen. Behandelt Wrapper-Lecks wie `npx @modelcontextprotocol/server-X`, `uvx ...`, `pnpm dlx ...`. Die Begrenzungen MAX_DESCENDANTS=256 / MAX_DEPTH=8 bleiben erhalten.

### 6.5 Behandlung von Spawn-Fehlern

Wenn `spawnEntry` ablehnt, nachdem mehrere Abonnenten angehängt wurden (via `spawnInFlight`):

- Alle Wartenden erhalten die Ablehnung
- `tryReserveSlot` wird **über einen expliziten `.catch`-Zweig in `acquire`** freigegeben (V21-4); ohne diese Korrektur lief der Slot bis zum nächsten Health-Monitor-Durchlauf aus, der nie stattfand, da kein Eintrag zum Überwachen existierte.
- Fehlgeschlagener Eintrag wird NICHT in `entries` gespeichert
- Die Codepfade der Abonnenten behandeln dies, als ob `acquire` ursprünglich fehlgeschlagen wäre (die vorhandene Abfanglogik für `discoverMcpToolsForServer` pro Sitzung bleibt gültig)

### 6.6 Wiederverbindungs-Backoff (V21-8)

Wenn ein `PoolEntry` nach einem Transportausfall in die Wiederverbindung eintritt:

| Transportfamilie | Strategie                                     | Obergrenze                                                      |
| ---------------- | -------------------------------------------- | ---------------------------------------------------------------- |
| stdio            | Fest 5 s × 3 Versuche                        | Laut vorhandenem `DEFAULT_HEALTH_CONFIG.reconnectDelayMs`            |
| websocket        | Fest 5 s × 3 Versuche                        | Wie stdio                                                    |
| http (opt-in)    | Exponentiell 1 s, 2 s, 4 s, 8 s, 16 s × 5 Versuche | Remote-Endpunkte flattern bei vorübergehenden Netzwerkproblemen; größeres Budget |
| sse (opt-in)     | Exponentiell 1 s, 2 s, 4 s, 8 s, 16 s × 5 Versuche | Wie http                                                     |
Nach Erschöpfung der Obergrenze: Eintrag wechselt in den Status `failed`; Abonnenten erhalten das `failed`-Ereignis; ein neues `acquire` für dieselbe `ConnectionId` wiederholt einmal und wirft dann einen Fehler. Neustart des Operators (§13) setzt den Status zurück.

---

## 7. Entdeckung / SessionMcpView

### 7.1 Tools + Prompts Dual-Fan-out

```ts
// packages/core/src/tools/mcp-client.ts — split discover into pure
async discoverAndReturn(cliConfig: Config): Promise<{
  tools: DiscoveredMCPTool[];
  prompts: Prompt[];
}> {
  if (this.status !== MCPServerStatus.CONNECTED) throw new Error('Client is not connected.');
  try {
    const [prompts, tools] = await Promise.all([
      discoverPrompts(this.serverName, this.client, /* no registry */),
      discoverTools(this.client, this.serverConfig, this.serverName, this.debugMode, this.workspaceContext),
    ]);
    if (prompts.length === 0 && tools.length === 0) {
      throw new Error('No prompts or tools found on the server.');
    }
    return { tools, prompts };
  } catch (e) {
    this.updateStatus(MCPServerStatus.DISCONNECTED);
    throw e;
  }
}

// Legacy discover() retained, delegates to discoverAndReturn + registers (for standalone qwen)
async discover(cliConfig: Config): Promise<void> {
  const { tools, prompts } = await this.discoverAndReturn(cliConfig);
  for (const t of tools) this.toolRegistry.registerTool(t);
  for (const p of prompts) this.promptRegistry.registerPrompt(p);
}
```

```ts
class SessionMcpView {
  applyTools(snapshot: DiscoveredMCPTool[]) {
    this.sessionToolRegistry.removeToolsByServer(this.serverName);
    for (const tool of snapshot) {
      if (!this.passesFilter(tool)) continue;
      // C7: per-session copy of trust (don't mutate shared snapshot)
      const localTool = tool.withTrust(this.cfg.trust);
      this.sessionToolRegistry.registerTool(localTool);
    }
  }
  applyPrompts(snapshot: Prompt[]) {
    this.sessionPromptRegistry.removePromptsByServer(this.serverName);
    for (const p of snapshot) this.sessionPromptRegistry.registerPrompt(p);
  }
}
```

### 7.2 Snapshot-Replay beim Anhängen (earlyEvents-Stil)

```ts
class PoolEntry {
  attach(sid: string): PooledConnection {
    this.refs.add(sid);
    this.cancelDrainTimer();
    const view = new SessionMcpView(...);
    this.subscribers.set(sid, view);
    // Immediately replay current snapshot so subscriber doesn't miss
    // updates that landed between in-flight discover completion and
    // attach.
    if (this.state === 'active') {
      view.applyTools(this.toolsSnapshot);
      view.applyPrompts(this.promptsSnapshot);
    }
    return this.makeHandle(sid, view);
  }
}
```

Spiegelt das `BridgeClient.earlyEvents`-Muster aus PR 14b Fix #1 wider – löst eine analoge Race-Condition beim Anhängen an den Pool.

### 7.3 Stale-Handler-Schutz (Generationszähler)

```ts
class PoolEntry {
  private generation = 0;

  private async reconnect(): Promise<void> {
    this.generation += 1;
    const myGen = this.generation;
    await this.client.disconnect();
    await this.client.connect();
    if (myGen !== this.generation) return; // superseded by another reconnect
    const snap = await this.client.discoverAndReturn(this.cfg);
    if (myGen !== this.generation) return;
    this.toolsSnapshot = snap.tools;
    this.promptsSnapshot = snap.prompts;
    this.fanOut('toolsChanged');
    this.fanOut('promptsChanged');
  }

  private onServerToolsListChanged = () => {
    const myGen = this.generation;
    this.client
      .discoverAndReturn(this.cfg)
      .then((snap) => {
        if (myGen !== this.generation) return;
        this.toolsSnapshot = snap.tools;
        this.fanOut('toolsChanged');
      })
      .catch(/* swallow + log */);
  };
}
```

Ohne diesen Schutz könnte ein alter Handler aus einer vorherigen Client-Instanz den Snapshot nach dem erneuten Verbinden mit veralteten Daten überschreiben.

**Monotonie-Invariante** (Klarstellung V21): `generation` wird nur erhöht, niemals zurückgesetzt. Jeder in Bearbeitung befindliche Vorgang erfasst `myGen` beim Start und prüft nach `await`, ob `myGen === this.generation`. Das entspricht: "Seit meinem Start ist kein überholendes Ereignis eingetreten." Begrenzt durch Number.MAX_SAFE_INTEGER (~285k Jahre bei 1 Hz Wiederverbindung), keine Überlaufgefahr.

### 7.4 Pfadvereinheitlichung (F2-1 Bereichserweiterung)

`packages/core/src/tools/mcp-client.ts` hat ZWEI Pfade zum Verbinden mit einem Server:

1. `McpClient`-Klasse (mcp-client.ts:100) – verwendet von `McpClientManager`
2. `connectToMcpServer`-Factory-Funktion (mcp-client.ts:875) – verwendet von `discoverMcpTools` (Zeile 560) und `connectAndDiscover` (Zeile 607)

F2-1 muss beide hinter `McpClient.discoverAndReturn` zusammenführen (wobei `connectToMcpServer` entweder ein privater Helfer von `McpClient` wird oder beide eine gemeinsame `establishConnection()`-Primitive aufrufen). Andernfalls deckt der Pool nur den Klassenpfad ab; der Factory-Pfad bleibt pro Sitzung und untergräbt die gesamte Bemühung.

---

## 8. Koexistenz globaler Zustände

### 8.1 `serverStatuses` (mcp-client.ts:292) – kollisionstolerantes Schreiben

Modulweite `Map<serverName, MCPServerStatus>`. Die `ConnectionId` des Pools ist `name::hash`, aber `updateMCPServerStatus(name, status)` schreibt nach Name. **Mehrere Pool-Einträge für denselben Namen (unterschiedliche Fingerabdrücke, z. B. Token-Abweichung) würden sich gegenseitig den Status überschreiben.**
**Auflösung**: Der Pool fängt Status-Schreibvorgänge ab:

```ts
class PoolEntry {
  updateStatus(s: MCPServerStatus) {
    this.localStatus = s;
    const aggregated = this.pool.aggregateStatusByName(this.serverName);
    updateMCPServerStatus(this.serverName, aggregated);
  }
}

class McpTransportPool {
  aggregateStatusByName(name: string): MCPServerStatus {
    // Any CONNECTED ⇒ CONNECTED
    // Else any CONNECTING ⇒ CONNECTING
    // Else DISCONNECTED
    const entries = [...this.entries.values()].filter(
      (e) => e.serverName === name,
    );
    if (entries.some((e) => e.localStatus === CONNECTED)) return CONNECTED;
    if (entries.some((e) => e.localStatus === CONNECTING)) return CONNECTING;
    return DISCONNECTED;
  }
}
```

Die Status-Route gibt `entryCount: number` aus, sodass Betreiber sehen, wenn Name → mehrere Einträge.

### 8.2 OAuth-Token-Speicher

`MCPOAuthTokenStorage` schreibt nach `~/.qwen/mcp-oauth/<serverName>.json` – bereits Daemon-Host-geteilt. Der Pool profitiert beiläufig (erste Sitzung schließt OAuth ab → Token auf Platte → Wiederverbindung des Pool-Eintrags nimmt Token auf → alle anderen Sitzungen profitieren).

**Einschränkung – Multi-Fingerprint-Fall**: 2 Einträge für denselben Namen (unterschiedliche Header/Umgebung), aber gleicher OAuth-Anbieter → beide lesen dieselbe Token-Datei. Wenn Token serverbezogen sind (bei OAuth üblich), funktioniert dies. Wenn Token umgebungsbezogen sind (selten), ist eine explizite Speichererweiterung erforderlich. **Auf F3 verschieben** mit dokumentierter bekannter Einschränkung.

### 8.3 `entryCount` im Snapshot

`GET /workspace/mcp` Pro-Server-Zelle fügt hinzu:

```ts
{
  kind: 'mcp_server',
  name: 'github',
  status: 'ok',
  mcpStatus: 'connected',
  entryCount: 2,                          // NEU — N Pool-Einträge für diesen Namen
  entrySummary?: [                        // NEU — undurchsichtige Aufschlüsselung pro Eintrag
    { entryIndex: 0, refs: 2, status: 'connected' },
    { entryIndex: 1, refs: 1, status: 'connecting' },
  ],
  ...
}
```

**V21-7**: `entrySummary[].entryIndex` ist ein **stabiler undurchsichtiger Integer**, der bei der Erstellung des Eintrags vergeben wird (Einfügereihenfolge innerhalb der Namensgruppe), NICHT der rohe Fingerprint. Begründung: Der Fingerprint ändert sich, wenn OAuth-Tokens oder Umgebungsvariablen rotieren, was diese Informationen durch Snapshot-Diffs preisgeben würde (Betreiber könnte aus dem Übergang von `'a3b1'` zu `'f972'` auf „Token rotiert bei T+5min“ schließen). `entryIndex` ist innerhalb der Namensgruppe monoton, bleibt aber bei Rotationen stabil, weil alter Eintrag abgebaut wird und neuer Eintrag den nächsten Index erhält.

Alte SDK-Clients ignorieren unbekannte Felder gemäß PR-14-Vertrag; neue Clients verwenden `entryCount` für Badges. Der interne Neustart-nach-Fingerprint-Pfad verwendet ein undurchsichtiges Token, das nur über privilegiertes extMethod zurückgegeben wird, nicht im HTTP-Snapshot offengelegt.

---

## 9. WorkspaceContext / ListRoots

### 9.1 Einzelne Registrierung

Die `McpClient`-Instanzen des Pools teilen sich **einen** `WorkspaceContext` – den gebundenen Workspace-Kontext des Daemons (Invariante PR #4113). Der `ListRootsRequestSchema`-Handler von `connectToMcpServer` schließt über diesen einzelnen Kontext.

Der Listener `onDirectoriesChanged` wird **einmal pro Eintrag** registriert, nicht einmal pro `acquire`. Wird beim Herunterfahren des Eintrags entfernt.

### 9.2 `roots/list_changed` nach oben

Server benachrichtigt Client über neue Roots → Pool verteilt nach oben:

- Pool erkennt neu (Server kann unter neuen Roots andere Tool-Menge melden) → `toolsChanged`-Ereignis → alle Abonnenten-Views wenden erneut an

### 9.3 Pro-Sitzung `updateWorkspaceDirectories`

**Vertrag**: In Modus B sind pro Sitzung hinzugefügte Verzeichnisse ein weicher Hinweis, nicht autoritativ. Der `WorkspaceContext` des Pools befindet sich auf Daemon-Ebene.

Zwei Implementierungsoptionen:

- **v1 einfach**: Ignoriere pro-Sitzung Hinzufügungen, protokolliere Warnung bei Erkennung
- **v2 Vereinigung**: Pool pflegt `extraRoots: Map<sessionId, Set<dir>>`, der ListRoots-Handler gibt die Vereinigung von gebundenem Workspace und allen Extras zurück. Entfernung pro Sitzung löst `roots/list_changed` aus. Fügt 50-80 LOC Komplexität hinzu.

**Wähle v1 einfach für F2**; v2 Vereinigung als Nachfolger, wenn Benutzerleid auftritt.

---

## 10. Pro-Sitzung Injektion

### 10.1 `mcpServers` von `newSession({mcpServers})`

`newSessionConfig(cwd, mcpServers, ...)` fügt die injizierte Liste mit `settings.merged.mcpServers` zusammen (acpAgent.ts:1778-1831). Der Pool verbraucht die **pro-Sitzung zusammengeführte Ansicht**:

```ts
async newSessionConfig(...) {
  const config = await loadCliConfig(...);
  if (this.mcpPool) config.setMcpTransportPool(this.mcpPool);
  // ...vorhandener setMcpBudgetEventCallback ENTFERNT — Pool übernimmt Broadcast direkt
}
```

Wenn zwei Sitzungen denselben Servernamen mit unterschiedlichen Umgebungen/Headern injizieren → unterschiedliche Fingerprints → zwei Pool-Einträge. Pool-Sharing greift nur, wenn Sitzungen exakt übereinstimmen.

### 10.2 Auth-Divergenz

Statische `~/.qwen/settings.json`-mcpServers sind über Sitzungen hinweg identisch → alle teilen sich → 80%-Fall. Pro Sitzung injizierte mcpServers mit Benutzer-Tokens → einzigartige Fingerprints → keine Teilung. Beides sicher.

### 10.3 HTTP-Transport-Opt-in (Zusammenfassung von §5.2)

Standardmäßig `pooledTransports = {stdio, websocket}`. HTTP/SSE-Server durchlaufen den `createUnpooledConnection`-Pfad (ein McpClient pro Sitzung), es sei denn, der Betreiber entscheidet sich für das Opt-in.

### 10.4 `/mcp disable X` während der Sitzung (V21-6)

Wenn der Betreiber `/mcp disable github` gegen eine laufende Sitzung ausführt:
1. `Config.disableMcpServer('github')` fügt zur pro-Config-Menge `disabledMcpServers` hinzu
2. **F2-Hook**: `Config.onDisabledMcpServersChanged` wird ausgelöst; `SessionMcpView` für diesen Namen ruft `teardown()` auf (entfernt die Tool/Prompt-Registrierungen aus den Session-Registries).
3. Der Pool-Eintrag **kann am Leben bleiben**, wenn andere Sessions ihn noch referenzieren (refcount > 0) – nur die deaktivierende Session-Ansicht wird abgekoppelt.
4. Wenn alle Sessions deaktivieren → refcount → 0 → Drain-Timer startet.

Ohne Schritt 2 würde eine Deaktivierung während einer Session bereits registrierte Tools in der `ToolRegistry` der Session belassen, bis zum nächsten Session-Neustart. Test 21.4 deckt dies ab.

`/mcp enable github` ist die Umkehrung: löst ein neues `pool.acquire` für die Session aus, hängt eine neue Ansicht an und wendet den Snapshot erneut an.

---

## 11. Budget Guardrails – Graduierung

### 11.1 Zustandsautomat wechselt in den Pool

`tryReserveSlot` / `releaseSlotName` / 75% Hysterese / refused_batch-Koaleszenz / `bulkPassDepth` / `pendingRefusalNames` – all dies wandert von `McpClientManager` in `McpTransportPool`. `McpClientManager` behält den Zustand nur, wenn er eigenständig läuft (kein Pool injiziert).

### 11.2 Snapshot-Zellen-Scope

```ts
{
  kind: 'mcp_budget',
  scope: 'workspace',          // NEUER Wert (PR 14 v1 gab 'session' zurück)
  liveCount: 5,
  clientBudget: 10,
  budgetMode: 'enforce',
  status: 'ok',
}
```

Laut PR-14-Vertrag: „Consumers MUST tolerate additional entries with unrecognized scope values (drop, don't fail).“ Alte SDK-Clients sehen `scope: 'workspace'`, rendern es als unbekannt (oder fallen auf die Top-Level-Zahlen zurück). Das neue SDK fügt die Hilfsfunktion `isWorkspaceScopedBudget(cell)` hinzu.

### 11.3 Event-Verteilung (Fan-out)

```ts
class QwenAgent {
  constructor() {
    this.mcpPool = new McpTransportPool({
      onBudgetEvent: (event) => this.broadcastBudgetEvent(event),
    });
  }

  private broadcastBudgetEvent(event: McpBudgetEvent) {
    for (const [sid, session] of this.sessions) {
      const enriched = {
        ...event,
        scope: 'workspace' as const,
        sessionId: sid,
      };
      session.connection
        .extNotification('qwen/notify/session/mcp-budget-event', enriched)
        .catch((err) =>
          debugLogger.debug('budget event delivery failed', { sid, err }),
        );
    }
  }
}
```

### 11.4 SDK-Typvertragsänderungen

PR 14b exportierte diese (müssen additiv erweitert werden):

- `DaemonMcpBudgetWarningData` – füge `scope?: 'workspace' | 'session'` hinzu (optional für Abwärtskompatibilität; nicht vorhanden = 'session')
- `DaemonMcpChildRefusedBatchData` – gleiche `scope?`-Erweiterung
- `DaemonMcpGuardrailEvent` – Diskriminator unverändert

Neue SDK-Hilfsfunktionen:

```ts
export function isWorkspaceScopedBudgetEvent(
  e: DaemonMcpGuardrailEvent,
): boolean;
```

Reducer-Zustand auf `DaemonSessionViewState`:

- **Keine neuen Felder** – `mcpBudgetWarningCount` / `mcpChildRefusedBatchCount` werden unabhängig vom Scope erhöht (Scope ist eine Eigenschaft jedes Events, kein separater Stream).
- Dokumentieren, dass diese Zählwerte unter F2 Workspace-weite Events widerspiegeln, die an jede Session verteilt werden – sie werden **gleichzeitig in allen angehängten Sessions** erhöht, wenn Budgetdruck auftritt.

**V21-12 (Q1 gelöst, in v2.1 festgeschrieben)**: die vorhandenen Feldnamen (`mcpBudgetWarningCount`, `mcpChildRefusedBatchCount`, `lastMcpBudgetWarning`, `lastMcpChildRefusedBatch`) beibehalten, mit erweiterter Scope-Semantik, dokumentiert im JSDoc:

```ts
/**
 * Anzahl der `mcp_budget_warning`-Ereignisse, die die Session beobachtet hat.
 * Unter F2 (`scope: 'workspace'`) wird dieser Wert gleichzeitig in allen
 * angehängten Sessions erhöht, da Budget-Ereignisse auf Workspace-Ebene
 * verteilt werden. Verwende `isWorkspaceScopedBudgetEvent(lastMcpBudgetWarning)`,
 * um den Scope des letzten Ereignisses zu prüfen.
 */
mcpBudgetWarningCount: number;
```

Begründung: PR 14b hat diese Namen bereits als öffentliche SDK-Oberfläche ausgeliefert; eine Umbenennung wäre ein noch schwerwiegenderer Breaking Change als die leicht unpräzise Semantik.

---

## 12. OAuth – explizite Verschiebung auf F3

Der OAuth-401-Fallback in `connectToMcpServer` (mcp-client.ts:950-1010) erfordert interaktive Auflösung (Browser öffnen oder Device-Flow). Der Mode-B-Daemon **darf keinen Browser starten** (gemäß PR-21-Design – der statische Quellcode-Grep-Test schlägt bei `open`/`xdg-open`/`shell.openExternal` fehl).

**F2-Verhalten bei einem Server, der OAuth erfordert**:

1. Erstes Acquire löst `connectToMcpServer` aus → 401 erkannt
2. Der Pool fängt die OAuth-erfordernde Ausnahme ab, markiert den Eintrag als `failed_auth_required`
3. Die Status-Route zeigt `errorKind: 'auth_env_error'` (bestehendes PR-13-errorKind)
4. Der Pool **wiederholt nicht automatisch**
5. Der Bediener führt `/mcp auth <name>` (bestehendes CLI) aus ODER verwendet die PR-21-Device-Flow-Route, um ein Token auf die Festplatte zu bekommen → nächster Session-Acquire-Versuch wiederholt und gelingt.

**F3 wird die Schritte 4-5** durch `PermissionMediator` ersetzen, der die OAuth-Abschlussanfrage an die angehängten Sessions als Ersthelfer weiterleitet.

Dies vermeidet, dass F2 in die Auth-Zustandsmaschinenarbeit eingreift.

---

## 13. Semantik der Restart-Route

### 13.1 `POST /workspace/mcp/:server/restart` unter dem Pool

Heute (PR 17): Neustart im Manager der Bootstrap-Session = Neustart des einzelnen Eintrags für diesen Namen.

Unter dem Pool: Name → möglicherweise mehrere Einträge (unterschiedliche Fingerprints für den gleichen Namen = verschiedene Sessions mit unterschiedlichen Konfigurationen).
**Spezifiziertes Verhalten**:

| Anfrage                                            | Verhalten                                                                             |
| -------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `POST /workspace/mcp/:server/restart`              | Neustart **aller** Einträge, die `serverName` entsprechen (parallel via `Promise.allSettled`)    |
| `POST /workspace/mcp/:server/restart?entryIndex=0` | V21-3: nur Eintrag #0 neustarten (der undurchsichtige Index aus Snapshot §8.3); 404 wenn nicht gefunden |
| `POST /workspace/mcp/:server/restart?entryIndex=*` | Explizit "all" (gleich wie kein Parameter)                                                    |

Antwortform:

```ts
type RestartResult = {
  entryIndex: number;        // V21-7: undurchsichtiger Index, nicht roher Fingerabdruck
  restarted: boolean;
  durationMs?: number;
  reason?: string;           // 'budget_would_exceed' | 'not_connected' | 'in_flight'
};
POST /workspace/mcp/:server/restart → { entries: RestartResult[] }
```

Alte Form `{restarted: true, durationMs}` wird beibehalten, wenn `entries.length === 1` UND kein `entryIndex`-Query-Parameter, aus Gründen der Abwärtskompatibilität; Clients können die neue Form erkennen, indem sie prüfen, ob `'entries' in response`.

### 13.2 Deduplizierung von Neustarts während laufender Vorgänge

```ts
class PoolEntry {
  private restartInFlight?: Promise<void>;
  async restart(): Promise<void> {
    if (this.restartInFlight) return this.restartInFlight;
    this.restartInFlight = this.doRestart().finally(() => {
      this.restartInFlight = undefined;
    });
    return this.restartInFlight;
  }
}
```

### 13.3 Budgetprüfung (behält PR 17 Verhalten bei)

Vor dem Neustart prüft der Pool das Budget: wenn Trennung+Wiederverbindung noch passen würden, OK. Die aktuelle PR 17-Semantik `{restarted:false, skipped:true, reason:'budget_would_exceed'}` wird beibehalten (jetzt pro Eintrag angewendet).

### 13.4 Tool-Aufruf während laufender Wiederverbindung (V21-5, neu)

Sitzung A ruft `pool.callTool('git.commit', args)` auf → Anfrage erreicht stdin des zugrunde liegenden Child-Prozesses → Child-Prozess stürzt während des Schreibens ab → Eintrag wechselt in den Wiederverbindungsmodus:

```ts
class MCPCallInterruptedError extends Error {
  readonly serverName: string;
  readonly entryIndex: number;
  readonly clientGeneration: number;   // Generation vor der Wiederverbindung
  readonly args: unknown;              // ursprüngliche Argumente, damit der Aufrufer bei Bedarf wiederholen kann
  constructor(serverName, entryIndex, clientGeneration, args) { ... }
}
```

**Spezifikation**:

- Das Promise des laufenden Aufrufs wird mit `MCPCallInterruptedError` abgelehnt, sobald der Transportabbruch erkannt wird (nicht auf Wiederverbindung warten)
- Der Pool **wiederholt den Aufruf NICHT automatisch**; die Semantik ist für Schreibvorgänge unsicher (Commit, Dateibearbeitung usw.) und der Pool kann nicht zwischen Lese- und Schreibvorgängen unterscheiden
- Der Aufrufer (typischerweise die Tool-Ausführungsschicht in der Agentenschleife) fängt diesen Fehler ab und entscheidet: wiederholen / dem Benutzer anzeigen / abbrechen
- Nach der Wiederverbindung: Sitzung A kann erneut aufrufen (gleicher `PooledConnection.callTool`); der Pool leitet transparent an die neue Transportinstanz weiter
- `MCPCallInterruptedError.clientGeneration` ermöglicht es dem Aufrufer, bei Bedarf eine Korrelation mit dem nachfolgenden `reconnected`-Ereignis herzustellen

Test 21.6 muss abdecken: einen langlaufenden stdio-MCP starten, Tool-Aufruf senden, den Child-Prozess während des Aufrufs töten, Ablehnung mit `MCPCallInterruptedError` und nicht null `clientGeneration` bestätigen.

---

## 14. Umstrukturierung der Status-Route

### 14.1 Neuer Abfragepfad

```ts
// httpAcpBridge.ts:733 buildWorkspaceMcpStatus — replace data source
let accounting: McpClientAccounting | undefined;
try {
  // NEW: query pool directly via bridge extMethod, not bootstrap session
  accounting = await this.bridge.client.getMcpPoolAccounting();
} catch (err) {
  // Fallback to legacy bootstrap session path for non-pool daemon
  const manager = config.getToolRegistry()?.getMcpClientManager();
  if (manager) accounting = manager.getMcpClientAccounting();
}
```

`QwenAgent` stellt `getMcpPoolAccounting()` bereit:

```ts
class QwenAgent {
  getMcpPoolAccounting(): McpClientAccounting | undefined {
    return this.mcpPool?.getAccounting();
  }
}
```

ACP-Child bridgt über `extMethod`, damit der Daemon aufrufen kann.

### 14.2 entryCount + entrySummary

Siehe §8.3.

### 14.3 Fall ohne Bootstrap-Sitzung

Derzeit (PR 12) gibt `GET /workspace/mcp` den Wert `initialized: false` zurück, wenn der Daemon im Leerlauf ist (noch keine Sitzungen), da keine Bootstrap-Sitzung zum Abfragen vorhanden ist.

Unter Pool: Pool existiert ab dem Konstruktor von `QwenAgent` → Status-Route kann Live-Accounting **selbst bei null Sitzungen** zurückgeben. Zelle `initialized: true` bereits vor der ersten Sitzung. **Dokumentierte Verhaltensänderung** in der PR-Beschreibung; kein Regression.

---

## 15. Interaktion zwischen loadSession / resume (PR 6 #4222)

### 15.1 Abbruch des Drain bei Wiederaufnahme

```
session-A aktiv, hält Referenz auf entry-X
session-A trennt Verbindung (kein explizites Schließen) → irgendwann killSession → pool.releaseSession(A) → entry-X.refs.size === 0 → Drain-Timer startet (30s)
session-A Wiederaufnahme innerhalb von 30s → neues newSessionConfig → pool.acquire gibt entry-X zurück → attach bricht Drain ab
session-A Wiederaufnahme nach 30s → entry-X bereits geschlossen → pool erzeugt neuen Eintrag (Kaltstart)
```

### 15.2 `restoreState`-Cache-Fenster (5 Min., aus PR 6)
`acpAgent.restoreState` wird 5 Minuten nach der Trennung gehalten. Pool-Drain (Standard 30s) < Wiederherstellungsfenster (5min) → eine Wiederaufnahme zwischen 30s und 5min erfordert einen MCP-Kaltstart. Akzeptabler Kompromiss (die Wiederaufnahme selbst ist ein seltener Pfad).

Alternative: Der Pool liest die Konfiguration des Daemon-Wiederherstellungsfensters und verlängert den Drain entsprechend. Erhöht die Kopplung zwischen Pool und Session-Zustandsmaschine; **auf ein Follow-Up verschieben, es sei denn, Benutzer melden Probleme mit Kaltstarts**.

### 15.3 `pendingRestoreIds` Interaktion

`acpAgent.killSession()` muss `pool.releaseSession(sid)` aufrufen, NACHDEM `pendingRestoreIds` bereinigt wurden. Reihenfolge:

1. Session als wiederherstellbar markiert (`pendingRestoreIds.add(sid)`)
2. `Session.close()` – aber die Pool-Referenz wird noch gehalten
3. Nach Ablauf von `RESTORE_WINDOW_MS` ohne Wiederaufnahme: `killSession` bereinigt endgültig → `pool.releaseSession(sid)` löst Drain aus

Verhindert, dass Drain während eines Wiederherstellungsfensters ausgelöst wird.

---

## 16. Heißes Neuladen der Konfiguration

### 16.1 Implizites Neuladen durch Fingerprint-Änderung

Benutzer bearbeitet `~/.qwen/settings.json` während des Betriebs und ändert die Umgebung eines Servers:

1. Alte Sessions behalten den alten Config/McpServers-Snapshot → erwerben weiterhin den alten Fingerprint → entry-OLD Referenz bleibt bestehen
2. Neue Session liest die aktualisierten Einstellungen → neuer Fingerprint → entry-NEW wird erstellt → existiert parallel zu entry-OLD
3. Alte Sessions schließen sich auf natürliche Weise → entry-OLD wird gedraint → schließlich geschlossen
4. Gleichgewichtszustand: Nur entry-NEW bleibt übrig

**Keine Live-Mutation von laufenden Verbindungen** — saubere Trennung zwischen Sessions mit verschiedenen Konfigurationsversionen.

### 16.2 Erzwungener Neuladungsweg (optional)

```
POST /workspace/mcp/reload-all
  → for each session: re-load settings, swap Config.mcpServers
  → for each entry no longer referenced: schedule eviction
```

Nützlich für „Ich habe Umgebungsvariablen geändert und möchte sofortige Auswirkungen auf alle Sessions.“ Auf F2-Follow-Up verschieben (nicht blockierend).

### 16.3 Extension-Deinstallation verwaiste Einträge (V21-15)

Szenario: Extension `foo-ext` registriert MCP-Server `foo-server`. Operator führt `/extension uninstall foo-ext` aus. Der Extension-Lebenszyklus entfernt `foo-server` aus `extensionMcpServers`, sodass zukünftige `loadCliConfig`-Aufrufe ihn nicht mehr enthalten. Aber:

- Live-Sessions halten Config-Snapshots, die noch `foo-server` enthalten → diese Sessions nutzen den Eintrag weiter
- Neue Sessions nach der Deinstallation erwerben ihn nicht (Server ist nicht mehr in ihrem zusammengeführten mcpServers) → keine Erhöhung des Referenzzählers

**Lösung**: Auf natürlichen Drain vertrauen. Wenn alte Sessions geschlossen werden, sinkt der Referenzzähler; schließlich erreicht der Eintrag `MAX_IDLE_MS = 5min` und wird zwangsgeschlossen. **Keine explizite `pool.invalidateByExtension(name)` API** — hält das Modell einheitlich mit dem heißen Konfigurationsneuladen (§16.1).

Kompromiss: Der Server der Extension kann bis zu 5 Minuten nach der Deinstallation laufen, wenn eine lange Session ihn am Leben hält. Akzeptabel; Betreiber können `/mcp restart foo-server` ausführen und dann die Session beenden, falls Dringlichkeit erforderlich ist.

---

## 17. Abschaltreihenfolge

`QwenAgent.close()` Ablauf (muss erzwungen werden):

```
1. Setze acceptingNewSessions = false; lehne neue POST /session ab
2. Für jede laufende Prompt: Abbruchsignal senden, auf Abschluss warten (bestehender PR 11 Lebenszyklus)
3. Für jede Session: close auslösen → pool.releaseSession(sid)
4. await pool.drainAll({ force: true, timeoutMs: 10_000 })   ← umgeht 30s Gnadenfrist
   ├── Für jeden Eintrag: Drain- und Health-Timer abbrechen, als draining markieren
   ├── Für jeden Eintrag parallel: listDescendantPids → SIGTERM an Kindprozesse
   ├── Für jeden Eintrag parallel: client.disconnect()
   └── Promise.race gegen timeoutMs; aufgegebene Einträge erhalten SIGKILL
5. Bridge-Kanal schließen
6. Prozess beenden
```

**V21-11**: `drainAll` Signatur:

```ts
async drainAll(opts?: {
  force?: boolean;       // default false; true bypasses 30s grace timer
  timeoutMs?: number;    // default 10_000; wall-clock budget; SIGKILL stragglers after
}): Promise<DrainResult>;

type DrainResult = {
  drained: number;       // entries that disconnected cleanly
  forced: number;        // entries SIGKILLed after timeout
  errors: Array<{ entryIndex: number; serverName: string; error: string }>;
};
```

Der Aufrufer verwendet `DrainResult` für Shutdown-Logging; bei `forced > 0` eine Warnung loggen, damit der Betreiber weiß, dass ein Server nicht sauber heruntergefahren wurde.

---

## 18. Dateistruktur

**Neue Dateien:**

```
packages/core/src/tools/
  mcp-transport-pool.ts        # McpTransportPool main (~700 LOC)
  mcp-pool-key.ts              # fingerprint + canonicalize helpers (~150 LOC)
  mcp-pool-entry.ts            # PoolEntry: refcount + drain + health + generation (~500 LOC)
  session-mcp-view.ts          # SessionMcpView: filter + register tools/prompts (~200 LOC)
  mcp-pool-events.ts           # PoolEvent discriminated union (~80 LOC)
  pid-descendants.ts           # listDescendantPids cross-platform (~150 LOC, incl. tests)

packages/core/src/tools/
  mcp-transport-pool.test.ts   # ~900 LOC
  mcp-pool-entry.test.ts       # ~400 LOC
  session-mcp-view.test.ts     # ~250 LOC
  mcp-pool-key.test.ts         # ~150 LOC
  pid-descendants.test.ts      # ~200 LOC (Unix + Windows skip-gated)
```

**Geänderte Dateien:**

```
packages/core/src/tools/mcp-client.ts            # discoverAndReturn() split; connectToMcpServer unified
packages/core/src/tools/mcp-client-manager.ts    # optional pool param; budget state conditional
packages/core/src/tools/tool-registry.ts         # threads pool from config into McpClientManager
packages/core/src/config/config.ts               # setMcpTransportPool / getMcpTransportPool
packages/cli/src/acp-integration/acpAgent.ts     # QwenAgent.mcpPool construction; broadcastBudgetEvent;
                                                 # newSessionConfig wires pool into Config;
                                                 # killSession calls pool.releaseSession
packages/cli/src/serve/run-qwen-serve.ts           # pass --mcp-pool-transports + budget env to ACP child
packages/cli/src/serve/httpAcpBridge.ts          # buildWorkspaceMcpStatus reads pool;
                                                 # restartMcpServer extMethod returns RestartResult[]
packages/cli/src/serve/capabilities.ts           # advertise mcp_workspace_pool
packages/sdk/src/daemon/mcpEvents.ts             # scope?: optional field; isWorkspaceScopedBudgetEvent helper
```
---

## 19. Single-PR-Auslieferung — Commit-Aufschlüsselung (V21-1)

Gemäß der Anleitung des Maintainers zur funktionszusammenhängenden Bündelung (#4175 Branching-Strategie 2026-05-19) wird F2 als **ein PR mit 6 atomaren Commits** ausgeliefert. Der Review kann schrittweise mit `git log -p HEAD~6..HEAD` erfolgen und commitweise geprüft werden.

| Commit-Nr. | Titel                                                                                         | Bereich                                                                                                                                                                                                                                                                                                                                                                                                                  | Betrifft                                                                                                                  |
| ---------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| 1          | `refactor(core): split McpClient.discover into pure tool/prompt list and unify connect paths` | Fügt `discoverAndReturn()` hinzu; extrahiert die gemeinsame `establishConnection()`, die sowohl von `McpClient.connect()` als auch von der `connectToMcpServer()`-Factory verwendet wird; die alte `discover()` wird zu einem dünnen Wrapper, der registriert (bewahrt das eigenständige Qwen-Verhalten). Keine beobachtbare Verhaltensänderung.                                                                         | `mcp-client.ts`, `mcp-client.test.ts`                                                                                    |
| 2          | `feat(core): McpTransportPool + SessionMcpView`                                               | Pool-Kern: `fingerprint`, Referenzzähler, `spawnInFlight`-Deduplizierung, `sessionToEntries`-Rückwärtsindex, Drain-Zustandsautomat, Snapshot-Wiederholung bei Verbindung, Generations-Guard, Tool+Prompt Dual-Fan-Out, pro-Sitzungs-Vertrauenskopie. Mock-McpClient für Komponententests. Keine Produktionsverdrahtung.                                                                                               | neu `mcp-transport-pool.ts`, `mcp-pool-key.ts`, `mcp-pool-entry.ts`, `session-mcp-view.ts`, `mcp-pool-events.ts` + Tests |
| 3          | `feat(core): cross-platform descendant pid sweep + pool health monitor`                       | `listDescendantPids` (Unix `pgrep -P` rekursiv, Windows PowerShell CIM); einheitlicher Health-Monitor innerhalb von `PoolEntry` (Intervallprüfung + Fehleranzahl + Wiederverbindungs-Backoff gemäß §6.6); Subprozess-Spawn-Integrationstests, geschützt durch `QWEN_INTEGRATION === '1'`.                                                                                                                               | neu `pid-descendants.ts` + Tests; `mcp-pool-entry.ts`                                                                    |
| 4          | `feat(serve): wire McpTransportPool into QwenAgent daemon mode`                               | `Config.setMcpTransportPool` + `getMcpTransportPool`; `ToolRegistry` fädelt Pool in `McpClientManager` ein; `McpClientManager` optionaler `pool?`-Konstruktorparameter; `acpAgent.QwenAgent` erstellt Pool bei Initialisierung; `newSessionConfig`-Injektion; `killSession` ruft `pool.releaseSession` auf; SDK MCP + HTTP/SSE-Umgehung über `createUnpooledConnection`; CLI-Flags `--mcp-pool-transports`, `--mcp-pool-drain-ms`, `--no-mcp-pool`. | `config.ts`, `tool-registry.ts`, `mcp-client-manager.ts`, `acpAgent.ts`, `run-qwen-serve.ts`                               |
| 5          | `feat(serve): pool-aware status + restart routes`                                             | `QwenAgent.getMcpPoolAccounting`-Erweiterungsmethode; `httpAcpBridge.buildWorkspaceMcpStatus` pool-first + Bootstrap-Sitzung-Fallback; `restartMcpServer` akzeptiert `?entryIndex=` und gibt `RestartResult[]` zurück; `entryCount` + `entrySummary[].entryIndex` auf Zelle; Fähigkeits-Tags `mcp_workspace_pool` + `mcp_pool_restart`.                                                                               | `httpAcpBridge.ts`, `capabilities.ts`, SDK-Typen                                                                         |
| 6          | `feat(serve): graduate MCP budget guardrails to workspace scope`                              | Verschiebt `tryReserveSlot`/`releaseSlotName`/Hysterese-Zustandsautomat von `McpClientManager` in den Pool; entfernt die pro-Sitzung `setMcpBudgetEventCallback`-Verdrahtung in `acpAgent.newSessionConfig`; `QwenAgent.broadcastBudgetEvent`-Fan-Out; Snapshot-Zelle `scope: 'workspace'`; SDK `scope?`-additives Feld; `isWorkspaceScopedBudgetEvent`-Hilfsfunktion; Inline-Dokumentationsupdates.                  | `mcp-transport-pool.ts`, `mcp-client-manager.ts`, `acpAgent.ts`, `httpAcpBridge.ts`, SDK                                 |
**Gesamte LOC-Schätzung**: ~4100 Produktion + ~1900 Tests = ~6000 LOC (v2-Schätzung ~3850; Wachstum absorbiert V21-Korrekturen).

**Merge-Ziel**: Ein einzelner PR in `daemon_mode_b_main`. Periodischer Batch-Merge nach `main` gemäß #4175-Strategie.

**Self-Review-Prozess vor Eröffnung des PRs**:

1. Nach jedem Commit `code-reviewer`-Agent auf dem Commit-Diff ausführen; übernommene Erkenntnisse in denselben Commit einfließen lassen
2. Bei Commit 2/4/6 (höchstes Designrisiko) zusätzlich `silent-failure-hunter` + `type-design-analyzer` ausführen
3. Nach allen 6 Commits: 3 vollständige Review-Durchgänge von verschiedenen Agent-Kombinationen auf dem vollständigen PR-Diff
4. Vollständige Testsuite + Typecheck + Lint über alle betroffenen Pakete ausführen

Spiegelung des spezialisierten Pre-Review-Musters von PR 21.

---

## 20. Capability-Tags + SDK-Vertragsänderungen

### 20.1 Neue Capability-Tags (atomar in v0.16, V21-1 beworben)

Da F2 als ein PR ausgeliefert wird, werden alle drei Tags gemeinsam beworben. Pool-Consumer dürfen davon ausgehen, dass **`mcp_workspace_pool` angekündigt ⇒ `entryCount`/`entrySummary`/`scope?`-Felder alle vorhanden** sind; keine feldbezogene Capability-Prüfung erforderlich.

| Tag                        | Wann beworben                                                                                          | Bedeutung                                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `mcp_workspace_pool`       | Wenn `QwenAgent.mcpPool !== undefined` (im Daemon-Mode immer wahr, es sei denn `--no-mcp-pool`-Kill-Switch) | `GET /workspace/mcp` spiegelt Pool-Status wider; `entryCount` + `entrySummary`-Felder vorhanden           |
| `mcp_pool_restart`         | Immer wenn `mcp_workspace_pool` aktiv ist                                                              | `POST /workspace/mcp/:server/restart` akzeptiert `?entryIndex=` und kann `entries: RestartResult[]` zurückgeben |
| (erweitert `mcp_guardrails`) | unverändert                                                                                           | Gleiches Tag, Payload erweitert um `scope` (`'workspace'` unter F2)                                       |

### 20.2 SDK-additive Oberfläche

```ts
// @qwen-code/sdk — nur additiv
export interface DaemonMcpBudgetWarningData {
  // bestehende Felder...
  scope?: 'workspace' | 'session'; // NEU — fehlt bei alten Daemons (bedeutet 'session')
}

export interface DaemonMcpChildRefusedBatchData {
  // bestehende Felder...
  scope?: 'workspace' | 'session';
}

export interface ServeWorkspaceMcpServerStatus {
  // bestehende Felder...
  entryCount?: number;
  entrySummary?: Array<{
    fingerprint: string;
    refs: number;
    status: MCPServerStatus;
  }>;
}

export function isWorkspaceScopedBudgetEvent(
  e: DaemonMcpGuardrailEvent,
): boolean;
```

`EVENT_SCHEMA_VERSION` bleibt bei `1` (additiv).

---

## 21. Testmatrix

### 21.1 Pool-Key (F2-2)

- Gleiche Konfiguration → gleicher Key (Env-Key-Permutation stabil, Header-Key-Permutation stabil)
- Env-Wert unterscheidet sich um 1 Byte → anderer Key
- Header `Authorization`-Wert unterscheidet sich → anderer Key
- `includeTools`/`excludeTools`/`trust` geändert → GLEICHER Key (pro-Sitzung-Filter)
- Zwei `new MCPServerConfig(...)` mit identischem Inhalt → gleicher Key (kanonischer Hash, nicht Identität)

### 21.2 Lebenszyklus (F2-2)

- 3 Sitzungen erwerben denselben Key → 1 Startvorgang (überprüft durch Spy auf `client.connect`)
- Freigabesequenz n,n-1,...,1 → Drain-Timer startet nur bei 1→0
- 30s Drain: Erwerb nach 25s bricht Timer ab; Erwerb nach 35s startet neuen Eintrag
- `MAX_IDLE_MS` (5min) harte Schließung auch bei Drain-Flattern
- Start fehlschlägt während laufender Anfragen: alle Wartenden erhalten Fehler; Slot wird freigegeben; kein Eintrag gespeichert

### 21.3 Gleichzeitiger Erwerb (F2-2)

- 5 gleichzeitige `acquire(sameKey)` während kein Eintrag existiert → genau 1 `spawnEntry`-Aufruf, alle 5 erhalten denselben Eintrag
- Start abgelehnt → alle 5 Wartenden lehnen mit demselben Fehler ab; nachfolgender Erwerb startet neu

### 21.4 Pro-Sitzungs-Isolation (F2-2)

- Sitzung A `excludeTools: ['foo']`, Sitzung B ohne Ausschluss → A's ToolRegistry lässt foo aus, B hat es; beide stammen aus derselben `toolsSnapshot`
- Sitzung A `trust: true`, Sitzung B `trust: false` → Sitzung A's `DiscoveredMCPTool.trust === true`, B's `false`; überprüfen, dass es sich NICHT um eine gemeinsame Referenz handelt (Mutation einer beeinflusst nicht die andere)
- Sitzung A erwirbt nur Prompt-Server → A's PromptRegistry befüllt, ToolRegistry für diesen Server leer

### 21.5 Tool-/Prompt-Listenänderung (F2-2)

- Server sendet `notifications/tools/list_changed` → alle Abonnenten erhalten `applyTools` mit neuer Snapshot
- Veralteter Handler aus einer Generation vor der Wiederverbindung überschreibt die Snapshot NICHT
- `notifications/prompts/list_changed` analog

### 21.6 Absturz + Wiederverbindung (F2-2)

- Subprozess via `process.kill` beenden → Abonnenten erhalten `disconnected`-Ereignis
- 3 Wiederverbindungsversuche (unter Verwendung bestehender `MCPHealthMonitorConfig`) → Erfolg → `reconnected` + neue Snapshot
- Erschöpfte Wiederholungen → alle Abonnenten erhalten `failed`; Eintrag wechselt in den Zustand `failed`; neue Erwerbe versuchen es einmal erneut und werfen dann einen Fehler
### 21.7 Nachfolger-PID-Bereinigung (F2-2b)

- Linux/macOS: `bash -c "sleep 60 & sleep 60"` als stdio-Befehl starten → root-Prozess töten → bestätigen, dass beide Nachfolger bereinigt wurden (`/proc/<pid>/status` abfragen oder `kill(0, pid) === false`)
- Windows: Wrapper `cmd /c "ping -t localhost"` starten → töten → bestätigen, dass der ping-Unterprozess verschwunden ist
- `pgrep` nicht verfügbar (PATH fehlt) → Graceful Degradation: Warnung protokollieren, nur SIGTERM an root senden, nicht abstürzen

### 21.8 Budget im Workspace-Bereich (F2-4)

- 4 Sessions × `--mcp-client-budget=2` mit 3 statischen MCP-Servern → Workspace-Gesamtsumme = 3 (nicht 12); Snapshot-Zelle `scope: 'workspace'`, `liveCount: 3`
- Budget-Warnung wird einmal pro 75%-Aufwärtsüberschreitung im gesamten Workspace ausgelöst; wird gleichzeitig an alle 4 Sessions übertragen
- Hysterese erneut scharf: Abfall auf 37,5% → nächste Überschreitung löst erneut aus

### 21.9 Rückwärtskompatibilität (F2-3)

- Standalone `qwen` (ohne Daemon) → `mcpPool === undefined` → alle vorhandenen Tests in `mcp-client-manager.test.ts` bestehen unverändert
- Daemon-Flag `--no-mcp-pool` → fällt auf pro-Session zurück, alle vorhandenen Daemon-E2E-Tests bestehen

### 21.10 Anmeldedaten-Isolation (F2-3)

- Session A injiziert `{name: 'github', headers: {Authorization: 'Bearer tokenA'}}`, Session B `tokenB` → 2 getrennte Prozesse; durch Snapshot `entryCount: 2` bestätigen; bestätigen, dass A's Tool-Aufrufe über A's Transport erfolgen (durch Header-Inspektion in stdin/log)

### 21.11 LoadSession / Fortsetzen (F2-3)

- Session schließen → Drain beginnt → innerhalb von 30s fortsetzen → Pool-Eintrag wiederverwendet (kein Kaltstart, bestätigt durch `client.connect`-Spy-Zählung)
- Fortsetzen nach 30s, aber vor Ablauf des Restore-Window → Pool-Kaltstart; restoreState-Inhalt bleibt erhalten

### 21.12 Restart-Route (F2-3b)

- 1 Eintrag für Name → `POST /workspace/mcp/foo/restart` gibt legacy-Form `{restarted: true, durationMs}` zurück
- 2 Einträge für Name (verschiedene Fingerabdrücke) → gibt `{entries: [{fingerprint, restarted, ...}, ...]}` zurück
- Neustart während ein anderer Neustart läuft → zweiter Aufruf gibt dasselbe Promise zurück (dedupliziert)
- Neustart, wenn Budget überschritten würde → `{restarted: false, skipped: true, reason: 'budget_would_exceed'}` pro Eintrag

### 21.13 Status-Route (F2-3b)

- Leerlauf-Daemon (keine Sessions), aber Pool hat zwischengespeicherte Einträge von vorheriger Session → `GET /workspace/mcp` gibt `initialized: true` mit Live-Abrechnung zurück
- Bootstrap-Session nicht vorhanden → Fallback auf Pool-Direktpfad; kein Fehler
- Pool-Abfrage wirft Fehler → fällt auf Bootstrap-Session-Pfad zurück; Snapshot stürzt nie ab

### 21.14 SDK-Reducer (F2-4)

- `mcpBudgetWarningCount` wird gleichzeitig über alle Abonnenten-Sessions erhöht, wenn das Workspace-Ereignis gesendet wird
- `isWorkspaceScopedBudgetEvent(e)` identifiziert korrekt den Bereich aus der Nutzlast
- Alter Daemon (kein `scope`-Feld) → standardmäßig 'session'-Interpretation

### 21.15 Hot-Config-Neuladen (F2-3)

- Änderung von settings.json während des Betriebs → alte Session behält alten Eintrag, neue Session erstellt neuen Eintrag, beide koexistieren; alter wird auf natürliche Weise geleert, wenn die letzte alte Session geschlossen wird
- 0 Sessions nach Schließen der alten Session → Drain-Timer feuert → alter Eintrag wird GC't → nur neuer Eintrag bleibt

### 21.16 Reihenfolge beim Herunterfahren (F2-3)

- `QwenAgent.close()` löst in Reihenfolge aus: Annahme stoppen → Prompts leeren → Sessions schließen → `pool.drainAll` → keine Zombie-PIDs in `pgrep -P <acpChildPid>` nach Beenden

---

## 22. Offene Fragen

V21 hat Q1/Q3/Q4/Q6 in den Design-Voreinstellungen festgelegt (Single-PR-Auslieferung). Q2/Q5/Q7/Q8/Q9 bleiben offen.

| #     | Frage                                                                                                          | F2-Designvoreinstellung                                                                         | Entscheidung fällig vor |
| ----- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------- |
| Q1 ✅ | SDK-Reducer-Feldnamen — umbenennen oder behalten?                                                                         | **FESTGELEGT v2.1**: `mcpBudgetWarningCount` usw. mit erweiterten Bereichs-Semantiken in JSDoc behalten | gelöst               |
| Q2    | `mcp_workspace_pool`-Fähigkeit — `protocolVersions` erhöhen ('v1' → 'v1.1') oder bei 'v1' additiv bleiben?                 | **Bei 'v1' additiv bleiben** (konsistent mit PR-14b-Präzedenzfall)                                 | commit 5               |
| Q3 ✅ | `--no-mcp-pool`-Flag — standardmäßig aktiviert oder Opt-in?                                                                      | **FESTGELEGT v2.1**: standardmäßig aktiviert; `--no-mcp-pool` ist der Kill-Switch                               | gelöst               |
| Q4 ✅ | HTTP/SSE-Standard — Pool aus oder an?                                                                                | **FESTGELEGT v2.1**: Pool aus; Opt-in via `--mcp-pool-transports`                             | gelöst               |
| Q5    | `POST /workspace/mcp/reload-all` — in F2 enthalten oder Folge?                                                    | **Folge**                                                                             | n. z. (verschoben)         |
| Q6 ✅ | Lazy Pool-Konstruktion — lohnt sich die Bedingung?                                                                   | **FESTGELEGT v2.1**: eager (immer im `QwenAgent`-Konstruktor erstellen)                             | gelöst               |
| Q7    | `restoreState`-Fenster vs. Pool-Drain — getrennt halten, angleichen oder aus Einstellungen lesen?                                | **Getrennt halten, 30s Standard + Konfigurationsregler `--mcp-pool-drain-ms`**                         | commit 4               |
| Q8    | OAuth-Behandlung — Verschiebung auf F3 bestätigen, Workaround dokumentieren?                                                        | **Auf F3 verschoben**, Workaround `/mcp auth <name>` dokumentieren                                | commit 4               |
| Q9    | `entrySummary`-Offenlegung — immer einschließen oder hinter verbose-Flag?                                                 | **Immer einschließen** (kleine Nutzlast, nützlich für Betrieb)                                        | commit 5               |
| Q10   | Update der Entscheidung #3 in `codeagents/qwen-code-daemon-design/02-architectural-decisions.md` — mit @wenshao abstimmen? | F2 PR-Beschreibung verlinkt codeagents PR; zwei PRs unabhängig überprüft                     | PR offen                |
## 23. Risiken

### Hoch

- **R1 (A2 globaler Zustand)**: Kollision von `serverStatuses` bei mehreren Einträgen mit gleichem Namen. Gemildert durch die Aggregat-Status-Funktion; verbleibendes Risiko: SDK-Konsumenten, die die rohe globale Map lesen (unwahrscheinlich — wird nur über den Accessor `getMCPServerStatus(name)` verwendet).
- **R2 (Symmetrie des PromptRegistry)**: Vergessen des Prompt-Fan-outs in einem Code-Pfad führt stillschweigend zum Verlust von Prompts. Gemildert durch F2-2 Test 21.4 dritter Punkt + Integrationstest, der die Prompt-Parität vor/nach F2 bestätigt.
- **R3 (HTTP-Transport-Zustandsverschleppung)**: Die Aktivierung des HTTP-Pools für einen Server, der pro Transport Zustand hält, korrumpiert Sitzungskontexte. Gemildert durch standardmäßig deaktiviert + Dokumentation; nicht automatisch erkennbar.

### Mittel

- **R4 (Pfadvereinheitlichung F2-1)**: Die Factory `connectToMcpServer` und die Klasse `McpClient` haben subtile Verhaltensunterschiede (z. B. Fähigkeiten, die zum Zeitpunkt der Konstruktion vs. Verbindung angekündigt werden). Gemildert dadurch, dass F2-1 ein reiner Refactoring-PR mit vollständiger Regressionstestabdeckung ist, bevor die Pool-Arbeit beginnt.
- **R5 (Windows-Prozess-PID)**: PowerShell `Get-CimInstance` kann langsam sein (Erzeugungskosten) oder durch AppLocker blockiert werden. Gemildert durch 2s Timeout + Graceful Degradation.
- **R6 (Pool-Event-Broadcast-Verstärkung)**: Budget-Warnung, die an 100 Sitzungen gesendet wird, führt zu 100 extNotification-Aufrufen in einer engen Schleife. Gemildert durch `Promise.all`-Parallelisierung + pro Sitzung Catch (bestehendes PR-14b-Muster).

### Niedrig

- **R7 (Fingerabdruck-Stabilität über MCPServerConfig-Versionen hinweg)**: Zukünftige Felder, die zu `MCPServerConfig` hinzugefügt werden und nicht im Fingerabdruck enthalten sind, würden stillschweigend falsches Teilen erlauben. Gemildert durch explizite Kanonikalisierungsfunktion + Test, der alle Felder von `MCPServerConfig` aufzählt und die Abdeckung bestätigt.
- **R8 (Generierungszähler-Wettläufe)**: Schnelle Neustartzyklen könnten die JS-Zahlenpräzision erschöpfen (≈ 2^53 = ~285k Jahre bei 1/Sekunde). Kein praktisches Problem.

### Einzel-PR-spezifisch (V21-14)

- **R9 (Review-Ermüdung bei ~6000 LOC einzelner PR)**: Reviewer-Bandbreite wird zum kritischen Pfad. F3 blockiert auf F2-Merge → blockiert andere Mitwirkende. Milderung: (a) Vorab-Review mit 3 Spezialisten-Agenten und Falten von P0/P1 vor dem Öffnen, analog zum Muster von PR 21; (b) Aufbau als 6 atomare Commits, sodass der Reviewer schrittweise vorgehen kann; (c) Review-Fenster mit @wenshao per #4175-Kommentar im Voraus koordinieren.
- **R10 (Merge-Konflikt-Akkumulation `daemon_mode_b_main`)**: F2 berührt `acpAgent.ts`, `httpAcpBridge.ts`, `capabilities.ts`, `mcp-client*.ts` — alles heiße Pfade. F3-/F4-Mitwirkende, die gleichzeitig landen, riskieren Konflikte während F2s 1–2-wöchigem Review-Fenster. Milderung: täglich `git rebase origin/daemon_mode_b_main`; Koordination per #4175-Update, dass F2 im Flug ist + Aufforderung an F3/F4, heiße Dateiänderungen bis zum Merge von F2 zurückzustellen.
- **R11 (CI-Ausführungszeit)**: ~1900 LOC neuer Tests inkl. Subprozess-Erzeugung + plattformübergreifender PID-Sweep könnten CI von 30min auf 50min erhöhen. Milderung: (a) Subprozess-Tests hinter `process.env.QWEN_INTEGRATION === '1'` gaten, Teilmenge in PR CI + voller Satz nachts ausführen; (b) Vitest-Parallelität ≥ 4; (c) Windows-PID-Sweep-Tests nur auf GHA-Windows-Runner skip-gaten.

---

## 24. Dokumentationsaktualisierungen

| Dokument                                                                       | Aktualisierung                                                                                                                                                                   | Wann                                                  |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `codeagents/qwen-code-daemon-design/02-architectural-decisions.md`             | Entscheidung #3 „MCP-Server-Lebensdauer": derzeit „pro Sitzung"; aktualisiert auf „vom Arbeitsbereich gepoolt mit Konfigurations-Hash-Schlüssel im Daemon-Modus; pro Sitzung eigenständig" | F2-3 wird gemergt (Koordination mit @wenshao codeagents PR) |
| `codeagents/qwen-code-daemon-design/06-roadmap.md`                             | Wave 5 PR 23 → als F2-Serie markieren; auf PRs verlinken                                                                                                                         | F2-3 wird gemergt                                     |
| `packages/cli/src/serve/README.md` (falls vorhanden) oder neu `docs/serve/mcp-pool.md` | Neuer Abschnitt: Pool-Semantik, Fingerabdruck-Schlüssel, Transport-Opt-in, Neustart-Semantik, Status-Snapshot-Interpretation                                                     | F2-3b                                                 |
| `packages/sdk/README.md`                                                       | `scope?`-Feld bei Guardrail-Ereignissen, `entryCount` beim Server-Status, Hilfsfunktion `isWorkspaceScopedBudgetEvent`                                                            | F2-4                                                  |
| Issue #4175 Body                                                               | F2-Eintrag mit Unter-PR-Tabelle aktualisieren, Link zu Design v2 (dieses Dokument)                                                                                               | Bevor F2-1 geöffnet wird                              |
| Issue #3803 Body                                                               | Entscheidung #3 Zeile: Aktualisieren von „Derzeit pro Sitzung" auf „Vom Arbeitsbereich gepoolt im Daemon-Modus (F2)"                                                              | Nach F2-3 Merge                                       |
| `acpAgent.ts:869-936` Inline-Kommentar                                         | Entferne „Wave 5 PR 23" Vorwärtsverweis; aktualisiere auf „durch F2 zu `scope: 'workspace'` abgestuft"                                                       | F2-4 PR                                               |
| CHANGELOG / Versionshinweise (Wave 6 / F5)                                     | „MCP-Prozesse jetzt über Sitzungen in einem Arbeitsbereich geteilt" Schlagzeile                                                                                                  | F5-Release                                            |
---

## 25. PR Description Template (single-PR delivery)

```markdown
## feat(serve): shared MCP transport pool (workspace-scoped) [F2]

Single feature-cohesive PR per #4175 branching strategy (2026-05-19).
Replaces what was originally planned as Wave 5 PR 23 + sub-PRs F2-1..F2-4.

### Scope

~4100 LOC production + ~1900 LOC tests across 6 atomic commits.
Step through with `git log -p HEAD~6..HEAD` for commit-by-commit review.

### Design doc

See `docs/design/f2-mcp-transport-pool.md` (v2.1).

### Pre-review specialist agents (per PR 21 pattern)

Folded into first commit before opening:

- code-reviewer: N findings, all adopted
- silent-failure-hunter: N findings, all adopted
- type-design-analyzer: N findings, all adopted

### Closes

(none — F2 entry in #4175 stays open until PR merges into main batch)

### Related

- #3803 decision #3 update (codeagents PR <link>)
- PR 14b (#4271 merged) — budget guardrail base; F2 graduates scope to workspace
- F1 (#4319 merged) — acp-bridge package; F2 depends on injection seams

### Backward compatibility

- Standalone `qwen` (non-daemon): pool not constructed; existing behavior preserved
- Daemon `qwen serve --no-mcp-pool`: kill switch falls back to per-session
- SDK: all new fields additive (`entryCount`, `scope?`); EVENT_SCHEMA_VERSION stays at 1
- Old SDK clients: unknown `scope: 'workspace'` ignored per PR 14 contract
- Old daemons: SDK consumers can detect absence of `mcp_workspace_pool` capability and fall back

### Test plan

- [ ] Pool key: env permutation stability, header divergence, per-session filter exclusion
- [ ] Lifecycle: 3-session sharing, drain grace, concurrent acquire dedupe, spawn failure slot release
- [ ] Tools + Prompts dual fan-out, per-session trust copy, snapshot replay on attach
- [ ] Generation guard: pre-reconnect handler doesn't overwrite post-reconnect snapshot
- [ ] Crash + reconnect with stdio backoff (5s × 3) and HTTP backoff (1/2/4/8/16s × 5)
- [ ] Descendant pid sweep: Linux/macOS pgrep recursion, Windows PowerShell CIM
- [ ] Budget at workspace scope: 4 sessions × budget=2 → 3 max (not 12); fan-out to all attached
- [ ] LoadSession resume within drain window: pool entry reused, no cold start
- [ ] Hot config reload: old/new entries coexist; old drains naturally
- [ ] Restart route: `?entryIndex=` selectivity; legacy single-entry response shape preserved
- [ ] In-flight tool call during reconnect: `MCPCallInterruptedError` rejection
- [ ] Standalone qwen: all existing mcp-client-manager tests pass unchanged
```

## Zusammenfassung

F2 v2.1 = ein einzelner PR mit 6 atomaren Commits (~6000 LOC), Zielbranche `daemon_mode_b_main`. Wichtigste Entwurfssäulen:

1. **`McpTransportPool`** in `packages/core` (ACP-Kindseite), Workspace-Scope, Referenzzähler + 30s Drain
2. **Fingerprint-Key** SHA-256 über kanonische Konfiguration inkl. Umgebungsvariablen/Header (Claude-Code-Muster), ohne session-spezifische Filter (includeTools/trust)
3. **`SessionMcpView`** session-spezifische Tool+Prompt-Registry-Projektion mit Trust-Kopie
4. **Snapshot-Replay + Generation Guard** für Attach-Race und veraltete Benachrichtigungen
5. **Plattformübergreifender Descendant-PID-Sweep** (opencode-Muster + Windows-Port)
6. **HTTP/SSE-Opt-in**, SDK-MCP-Bypass, OAuth auf F3 verschoben
7. **Budget-Zustandsmaschine** wechselt in Workspace-Scope; Snapshot-Zelle + Push-Events werden additiv erweitert (`scope?`)
8. **Status + Restart-Routen** Refactoring: Pool-first mit Bootstrap-Session-Fallback; `entryCount` + `RestartResult[]`

**Offene Fragen Q1–Q10** in §22 benötigen Maintainer-Entscheidungen, bevor die entsprechenden Sub-PRs geöffnet werden. Es wird empfohlen, Q1–Q4 vor F2-3 zu klären (diese geben die grobe Richtung vor); Q5–Q10 können inkrementell gelöst werden.
