# F2: Gemeinsamer MCP-Transport-Pool – Design v2.2

> Zielt auf `daemon_mode_b_main` (gemäß #4175 Branching-Strategie). Ersetzt #4175 Wave 5 PR 23.
> **Single-PR-Lieferung** gemäß der Anleitung des Maintainers zur funktionskohärenten Batch-Bereitstellung (2026-05-19).
> Autor: doudouOUC. Datum: 2026-05-20. Überarbeitet: 2026-05-20 (v2.2 – Überarbeitungsfaltungen aus der Implementierungsprüfung).

---

## 0. Änderungsprotokoll

### v2.2 (2026-05-20) – PR #4336 Implementierung + 32 Überprüfungs-Faltungen

PR #4336 lieferte F2 in 6 atomaren Commits + 6 Fix-Commits über ~4 Stunden. Wenshao überprüfte kumulativ in 3 Batches; jeder Batch produzierte Inline- und kritische Korrekturen, die zurückgefaltet wurden. Die folgende Tabelle dokumentiert die Änderungen gegenüber v2.1, geordnet nach Überprüfungsbatch.

#### v2.1 → erster Überprüfungsbatch (Commits 1-4, wenshao C1-C7 + S1-S4)

| #   | Stelle                                                       | Was falsch war                                                                                                                                                                      | Fold-in-Commit |
| --- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| C1  | `acpAgent.ts:269` – IDE-close-Pfad                           | Pool-Drain lief nur im SIGTERM-Handler; normaler IDE-Schließvorgang ließ Einträge auslaufen, bis das Betriebssystem sie bereinigte. Spiegele den Pool-Drain von SIGTERM bei `await connection.closed` | `ae0b296c4`    |
| C2  | `mcp-pool-entry.ts:cancelDrainTimer`                         | `cancelDrainTimer` setzte bei jedem Flap den `maxIdleTimer` zurück, was die harte Obergrenze aus §6.3 außer Kraft setzte. Löscht jetzt nur `drainTimer`; max-idle überlebt die gesamte Entry-Lebensdauer | `ae0b296c4`    |
| C3  | `mcp-pool-entry.ts:doRestart`                                | Wiederherstellfehler hinterließ Entry im Zombie-Zustand (`localStatus=CONNECTED`, `state='active'`, veralteter Snapshot). Try/Catch + Übergang zu `'failed'` bei Fehler              | `ae0b296c4`    |
| C4  | `mcp-pool-entry.ts:forceShutdown`                            | `state='closed'` wurde NACH awaits gesetzt, sodass ein gleichzeitiges `acquire` den Zustand `'active'` sehen und eine veraltete Verbindung ausgeben konnte. Wird jetzt synchron ganz oben gesetzt | `ae0b296c4`    |
| C5  | `mcp-transport-pool.ts:drainAll`                             | Gleichzeitiges `acquire` konnte mitten im Drain eine neue Entry erzeugen. `draining`-Mutex-Flag + `await Promise.allSettled(spawnInFlight)` vor dem Löschen hinzugefügt              | `ae0b296c4`    |
| C6  | `mcp-pool-entry.ts:statusChangeListener`                     | Listener wurde nicht nach `serverName` gefiltert; jede Entry erhielt jede Statusbenachrichtigung jedes Servers + das eigene `markActive`-Write wurde zurückgespiegelt               | `ae0b296c4`    |
| C7  | `mcp-client-manager.ts:discoverAllMcpToolsIncremental`       | Pool-Mode-Gate wurde zu `discoverAllMcpTools` hinzugefügt, fehlte aber bei `Incremental` – `/mcp refresh` umging den Pool und erzeugte einen pro-Sitzung-Client                        | `ae0b296c4`    |
| S1  | `session-mcp-view.ts:passesSessionFilter`                    | Dokumentation wies nicht darauf hin, dass `excludeTools` direkte Gleichheit verwendet (keine Klammer-Form-Unterstützung); Abweichung von `mcp-client.ts:isEnabled`                    | `ae0b296c4`    |
| S2  | `pid-descendants.ts` Docstring                               | Behauptete einen Windows-spezifischen `taskkill /F`-Zweig, der nicht existierte – Node polyfillt `process.kill('SIGTERM')` zu `TerminateProcess`                                       | `ae0b296c4`    |
| S3  | `session-mcp-view.ts:applyTools` Debug-Log                   | Zeichenkette enthielt buchstäblich `"N"` anstelle einer Interpolation – Betreiber sahen `applied 12 tools (filtered to N registered)`                                                | `ae0b296c4`    |
| S4  | `mcp-transport-pool.ts:createUnpooledConnection` Status-CB   | Hartcodiert auf `() => CONNECTED`, sodass `aggregateStatusByName` nach einer Trennung log. Jetzt `() => client.getStatus()`                                                          | `ae0b296c4`    |

#### Commit-5 Selbstüberprüfungsbatch (R1-R3 klein)

| #   | Stelle                                            | Was falsch war                                                                                                                                                                    | Fold-in-Commit |
| --- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| R1  | `server.test.ts:918` `/capabilities`-Hülle        | Test behauptete `getAdvertisedServeFeatures()` (keine Toggles), aber server.ts übergibt `mcpPoolActive: opts.mcpPoolActive !== false` (standardmäßig aktiv). Toggle verankern      | `3e68c00bc`    |
| R2  | `server.test.ts` Coverage für standardmäßige Aktivierung | Kein Test startete mit Standardoptionen, um zu überprüfen, ob Pool-Tags angezeigt werden. Expliziten Test mit `mcpPoolActive: false` hinzugefügt                                        | `3e68c00bc`    |
| R3  | `events.ts:DaemonMcpServerRestartRefusedData`     | Dokumentation sagte, Pre-PR-SDKs würden "neuen Wert als unbekannt sehen und generisch anzeigen" – tatsächlich lehnt `MCP_RESTART_REFUSED_REASONS.has(...)` ab → stiller Drop       | `3e68c00bc`    |

#### Zweiter Überprüfungsbatch (Commits 1-5, wenshao R1-R10)

| #   | Stelle                                                | Was falsch war                                                                                                                                                                             | Fold-in-Commit |
| --- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- |
| WR1 | `mcp-pool-entry.ts:maxIdleTimer`                      | C2-Fix bewahrte `maxIdleTimer` korrekt über den Flap, aber die Feueraktion schloss unabhängig von `refs.size`. Aktive Sitzung mit erneutem Anhängen innerhalb der Gnadenfrist verlor Tools nach 5min | `72399f109`    |
| WR2 | `mcp-client-manager.ts:discoverAllMcpToolsViaPool`    | `releaseAllPooledConnections` + erneutes ERWERBEN ALLER bei jedem Durchlauf hinterließ kurzzeitiges Fenster ohne registrierte MCP-Tools UND setzte jeden Drain-Timer zurück. Abweichung vom gewünschten `(name, fingerprint)` | `72399f109`    |
| WR3 | `mcp-pool-entry.ts:doRestart` Snapshot-Fanout         | Neustart aktualisierte `toolsSnapshot`/`promptsSnapshot` und emittierte typisierte Events – aber keine `SessionMcpView`-Instanz abonnierte diesen Stream. Iteriere `subscribers` direkt nach Snapshot | `72399f109`    |
| WR4 | `mcp-transport-pool.ts:getSnapshot subprocessCount`   | Zählte WebSocket zu `subprocessCount` – WebSocket verbindet sich entfernt, kein lokaler Kindprozess. Auf `'stdio'` beschränkt                                                                | `72399f109`    |
| WR5 | `pid-descendants.ts` PowerShell `-Filter`             | Interpolierte `${pid}` direkt in den `-Filter`-String. Einstiegspunkt `Number.isInteger` Guard verhindert heute eine Einschleusung; zur Verteidigung gegen zukünftige Lockerungen an `$p` binden | `72399f109`    |
| WR6 | `mcp-pool-entry.ts` ctor `cfg`-Feld                   | `readonly cfg: MCPServerConfig` war implizit öffentlich, gab API-Schlüssel/Header-Auth/OAuth-Felder preis. Auf `private` gesetzt; neuer Getter `transportKind` für den einzigen externen Leser | `72399f109`    |
| WR7 | `mcp-pool-events.ts` verfrühte Exporte                | 5 PoolEvent-Typwächter + `Prompt`-Reexport + `PoolEntryConnectionStatus` hatten null Aufrufer. Entfernt; `MCPCallInterruptedError` (Design §13.4 Vorgabe) beibehalten                        | `72399f109`    |
| WR8 | `acpAgent.ts:269,300` Pool-Drain-Duplizierung         | SIGTERM + IDE-close hatten identische `if (agentInstance) { try { await shutdownMcpPool(8_000) } catch... }`-Blöcke. `drainPoolBeforeExit(label)`-Helfer extrahiert                         | `72399f109`    |

#### Commit-6 Selbstüberprüfungsbatch (R1-R3 kritischer Wettlauf)

| #   | Stelle                                    | Was falsch war                                                                                                                                                                   | Fold-in-Commit |
| --- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| 6R1 | `mcp-transport-pool.ts:onClosed`          | Slot-Freigabe-Wettlauf: A beendet Spawn, B (anderer Fingerabdruck, gleicher Name) startet Spawn, A drainiert. Close-CB prüfte nur `entries` (B noch nicht registriert) → verfrühte Freigabe | `0e58a098f`    |
| 6R2 | `events.ts:mcpBudgetWarningCount` JSDoc   | Workspace-bezogene Events fächern zu N Sitzungen auf → N Reducer-Inkremente; Verbraucher, die über Sitzungen hinweg aggregieren, zählen doppelt. Docstring aktualisiert, um den Multiplikator zu erwähnen | `0e58a098f`    |
| 6R3 | `acpAgent.ts:broadcastBudgetEvent`        | Iterierte `this.sessions.keys()` direkt während des asynchronen Fanouts; gleichzeitiges `killSession` konnte den Iterator beschädigen. Snapshot über `Array.from(...)`            | `0e58a098f`    |

#### Dritter Überprüfungsbatch (Commits 1-6, wenshao W1-W15)

| #   | Stelle                                                           | Was falsch war                                                                                                                                                                               | Fold-in-Commit |
| --- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| W1  | `mcp-transport-pool.ts:spawnEntry` catch                         | Spawn-Fehler ließ `statusChangeListener` dauerhaft hängen – nur `forceShutdown` entfernt ihn. `entry.forceShutdown('manual')` im catch hinzugefügt                                            | `4a3c5cd90`    |
| W2  | `mcp-pool-entry.ts:statusChangeListener` Querprüfung             | Modulweite `serverStatuses`-Map wird von Einträgen mit mehreren Fingerabdrücken geteilt. A's Transportfehler schrieb DISCONNECTED, B's Listener beschädigte B's `localStatus`. `client.getStatus()`-Prüfung hinzugefügt | `4a3c5cd90`    |
| W3  | `mcp-pool-entry.ts:doRestart` PID-Sweep                          | Neustart übersprang `listDescendantPids` + `sigtermPids` – jeder Neustart eines mit `npx`/`uvx` umschlossenen stdio hinterließ den tatsächlichen MCP-Enkel als Waise. Sweep vor Trennung hinzugefügt | `4a3c5cd90`    |
| W4  | `mcp-pool-entry.ts:doRestart` Drain-Timer-Wettlauf               | Drain-Timer konnte mitten im Neustart-Yield auslösen → `forceShutdown` entfernt Entry → `client.connect` erzeugt Waise. `cancelDrainTimer` + `state→active` am Anfang von `doRestart` hinzugefügt | `4a3c5cd90`    |
| W5  | `mcp-client-manager.ts:pooledConnections` tote Handles           | Wenn Entry zu `'failed'` wechselte, behielt Manager tote `PooledConnection` für immer. Subscribe auf Entry-Events; Räumung bei `'failed'` (idempotent über `get(name) === conn`-Guard)       | `4a3c5cd90`    |
| W6  | `mcp-client-manager.ts:discoverAllMcpToolsViaPool` Wiedereintritt | Zwei Durchläufe, die sich überlappen, konnten beide `set(name, conn)` aufrufen → erste Verbindung ausgelaufen. `discoveryInFlight`-Mutex hinzugefügt; zweiter Aufrufer wartet auf dasselbe Promise. Neuer Regressionstest | `4a3c5cd90`    |
| W9  | `acpAgent.ts:parsePoolDrainMs` Strenge                           | `Number.parseInt` akzeptierte `'30000ms'` / `'30000abc'`. Strenger `^\d+$`-Regex; Zurückweisung mit stderr-Warnung + Standard-Fallback                                                       | `4a3c5cd90`    |
| W10 | `mcp-transport-pool.ts:acquire` indexAttach-Reihenfolge          | `indexAttach` mutierte `sessionToEntries` VOR `entry.attach()`. Wenn `attach` einen Fehler warf, veraltete Rückwärtsindexierung. `indexAttach` nach erfolgreichem `attach` verschoben (sowohl schneller als auch in-Flight-Pfad) | `4a3c5cd90`    |
| W13 | `mcp-transport-pool.ts:subprocessCount` JSDoc                    | Doc behauptete nach WR4 immer noch `stdio + websocket`, obwohl auf stdio beschränkt. Aktualisiert                                                                                            | `4a3c5cd90`    |
| W14 | `mcp-transport-pool.ts:createUnpooledConnection` catch           | Gleicher `statusChangeListener`-Leck wie W1 im ungepoolten Pfad. Gleicher Spiegel: `forceShutdown` vor Trennung                                                                              | `4a3c5cd90`    |
| W15 | `bridge.ts:restartMcpServer` Antwort                             | `as PoolEntries`-Cast war unsicher – untypisiertes JSON vom ACP-Kind. `Array.isArray`-Prüfung + Formwächter pro Entry; fehlerhafte Einträge mit stderr-Brotkrümel übersprungen               | `4a3c5cd90`    |

#### Abgelehnt mit Antwort (als F2-Folgeaufgaben eingereicht)

| #   | Stelle                                                | Grund für Ablehnung                                                                                                                                                              |
| --- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W7  | Lücken in der Testabdeckung (4 ungetestete kritische Pfade) | 1/4 hinzugefügt (W6-Regressionstest); Rest auf fokussierten Testabdeckungs-PR nach Zusammenführung der F2-Serie verschoben                                                          |
| W8  | `maxReconnectAttempts` / `reconnectStrategy` ungenutzt | Vorwärtskompatibilitäts-Platzhalter für den verschobenen Health-Monitor-gesteuerten Wiederherstellungsvorgang (Design §6.6); Entfernen + erneutes Hinzufügen verursacht öffentlichen Typ-Churn |
| W11 | Doppelte schnelle Pfad-/in-Flight-Pfad-Anhänge-Blöcke  | ✅ In PR A erledigt: `attachPooledSession` + `rollbackReservationOnSpawnFailure` private Helfer (Commit `2d546efca`)                                                            |
| W12 | `passesSessionFilter` O(M×N) pro `applyTools`          | ✅ In PR A erledigt: `applyTools` / `applyPrompts` berechnen Filter-`Set`s einmal pro Durchlauf vor; Prädikat wird O(1) pro Tool (Commit `a4a855ab3`)                             |
| R9  | `McpClientManager` ctor 7-Positions-Wächter            | ✅ In PR A erledigt: Options-Objekt ctor + `mkManager`-Testfabrik (Commit `0cb1eaa27`)                                                                                         |
| R10 | `pgrep -P <pid>` pro-PID-pro-Ebene-Kosten              | ✅ In PR A erledigt: einzelner `ps -A -o pid=,ppid=` Snapshot + In-Memory-BFS-Durchlauf; pgrep BFS als Fallback für BusyBox <v1.28 / Distroless beibehalten (Commit landet als letztes PR-A-Stück) |

#### Fehleranzahl

- **3 Batches × 27 kritische / wichtige Korrekturen** + 5 Dokumentations-/Vorschlagsfaltungen = **32 Überprüfungs-Faltungen insgesamt**
- **2 kritische Wettläufe nur beim zweiten Hinsehen entdeckt** (6R1 Slot-Freigabe-während-Spawn-Wettlauf; W6 Discovery-Wiedereintritt)
- **0 stille Fehler ausgeliefert** — jede Korrektur trägt einen Inline-Krümel `// F2 (#4175 Commit X Überprüfung Fix — wenshao YN):`, der auf die ursprüngliche Überprüfung verweist

### v2.1 (2026-05-20) – Single-PR-Strategie + 12 Überprüfungs-Faltungen

| #      | Was                                                                                                          | Warum                                                                                                             |
| ------ | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| V21-1  | Wechsel von 6-Sub-PR-Plan zu **einem funktionskohärenten PR** mit 6 atomaren Commits                           | Gemäß Maintainer-Anleitung (#4175 Branching-Strategie); Prüfer kann Commit-für-Commit via `git log -p` lesen       |
| V21-2  | `sessionToEntries: Map<sid, Set<ConnectionId>>` Reverse-Index im Pool hinzugefügt (§6)                          | `releaseSession` O(N Einträge) → O(Refs der Sitzung); für 1000-Sitzungen-Skalierung benötigt                     |
| V21-3  | `?fingerprint=`-Abfrageparameter auf Neustart-Route (§13.1)                                                    | Betreiber möchten möglicherweise nur einen Eintrag neu starten, wenn derselbe Name mehrere Fingerabdrücke hat; minimale Kosten jetzt hinzufügen |
| V21-4  | Fehlerpfad beim Spawn gibt reservierten Slot explizit frei (§6.1, §6.5)                                        | Andernfalls Slot-Leck bis zum nächsten Health-Monitor-Durchlauf; subtiler echter Fehler                            |
| V21-5  | Neuer §13.4: In-Flight-Tool-Aufruf während Wiederherstellungssemantik                                          | `MCPCallInterruptedError`; Pool führt KEINE automatische Wiederholung aus (Schreibvorgänge unsicher)               |
| V21-6  | Neuer §10.4: `/mcp disable X` löst `SessionMcpView`-Neuanwendung aus                                           | Andernfalls entfernt das Deaktivieren während der Sitzung nicht bereits registrierte Tools                         |
| V21-7  | Status-Route gibt `entryIndex` und nicht rohen Fingerabdruck preis (§8.3)                                      | Vermeidet Seitenkanal-Offenlegung der OAuth-Token-Rotation via Fingerabdruckänderung                               |
| V21-8  | Wiederherstellungs-Backoff spezifiziert: stdio fest 5s × 3, HTTP/SSE exponentiell 1/2/4/8/16s × 5 (§6.6)       | v2 sagte nichts; HTTP benötigt längeres Wiederholungsbudget für Netzwerk-Flaps                                   |
| V21-9  | `canonicalOAuth(o)` normalisiert `{enabled: false}` ≡ `undefined` ≡ `null` (§5.1)                              | Andernfalls erzeugen funktional äquivalente Konfigurationen unterschiedliche Einträge                            |
| V21-10 | Pool-Fallback-Helfer von "Legacy-In-Prozess-Acquire" in `createUnpooledConnection` umbenannt (§5.3, §6.1)      | SDK-MCP-Umgehung ist dauerhaft, nicht Legacy                                                                       |
| V21-11 | `drainAll(opts?)` gibt `Promise<void>` zurück mit `timeoutMs` Wanduhr-Budget (§17)                              | Aufrufer muss wissen, wann Drain für die Abschaltreihenfolge beendet ist                                            |
| V21-12 | SDK-Reducer-Feldnamen gesperrt (Q1 gelöst): `mcpBudgetWarningCount` usw. mit Geltungsbereich-Semantik in JSDoc beibehalten | Keine öffentliche API-Umbenennung mitten im PR                                                                     |
| V21-13 | Q3 (Standard-Pool-aktiv, `--no-mcp-pool`-Kill-Switch), Q4 (HTTP/SSE Opt-in), Q6 (eifrige Konstruktion) gesperrt | Single-PR-Lieferung; keine Flag-Gating erforderlich                                                               |
| V21-14 | R9/R10/R11 Single-PR-Risiken hinzugefügt (§23)                                                                  | Überprüfungsermüdung, daemon_mode_b_main Merge-Konflikt, CI-Zeit                                                  |
| V21-15 | Verwaiste Einträge bei Extension-Deinstallation auf natürliches Bereinigen durch `MAX_IDLE_MS` verschoben (§16.3)| Kein explizites `invalidateByExtension`; hält Modell einheitlich                                                  |

### v2 (2026-05-20) – erste Überprüfungs-Faltungen aus v1-Skizze

| #   | Was                                                                                                  | Warum                                                                                        |
| --- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| C1  | Pool fächert **Tools + Prompts** auf (bisher nur Tools)                                                | `McpClient`-ctor nimmt beide Registrierungen; Prompts gehen sonst im Pool-Modus still verloren |
| C2  | Neuer Abschnitt zur **Koexistenz globaler Zustände** (`serverStatuses` / `mcpServerRequiresOAuth` Modul-Maps) | Sitzungsübergreifende Teilung existiert bereits heute; Pool erbt + formalisiert              |
| C3  | `connectToMcpServer`-Werkspfad **vereinheitlicht** mit der `McpClient`-Klasse in F2-1                | v1 refaktorierte nur die Klasse; würde einen parallelen, nicht gepoolten Pfad hinterlassen    |
| C4  | Snapshot-Wiedergabe beim Anhängen (EarlyEvents-ähnlich) zu `PoolEntry.attach()` hinzugefügt           | Neuer Wettlauf: Sitzung-B hängt an → Server emittiert `tools/list_changed` bevor Subscription verdrahtet |
| C5  | `spawnInFlight: Map<ConnectionId, Promise<PoolEntry>>` für gleichzeitiges Acquire-Deduplizierung      | v1 in Testmatrix erwähnt, aber im Implementierungsvertrag vergessen                                 |
| C6  | Plattformübergreifender Descendant-PID-Sweep (Linux/macOS pgrep, Windows wmic/PowerShell)            | v1 sagte "openodes `pgrep -P` kopieren" – das ist nur Unix                              |
| C7  | `trust`-Feld pro Sitzung als **Kopie** des Tool-Objekts                                                    | trust lebt auf `DiscoveredMCPTool`; gemeinsam genutzte Instanz würde pro-Sitzung-Trust vermischen         |
| C8  | HTTP/SSE-Transporte **Opt-in** zum Pooling (Standard: nur stdio + websocket)                                 | Einige MCP-HTTP-Server verwalten pro-Transport-Sitzungszustand; Teilen riskiert Zustandsverlust         |
| C9  | Explizite Umgehung des SDK-MCP-Servers (`isSdkMcpServerConfig`)                                               | `sendSdkMcpMessage` ist per Design pro Sitzung                                                         |
| C10 | OAuth-Pfad explizit **auf F3 verschoben**                                                                      | OAuth-Flow benötigt PermissionMediator-artiges Routing; nicht F2-Bereich                            |
| C11 | Neustart-Route-Semantik spezifiziert (Name → alle passenden Einträge)                                          | PR 17's `POST /workspace/mcp/:server/restart` war zuvor eindeutig (1 Eintrag); jetzt 1..N               |
| C12 | Status-Route-Refaktor-Abschnitt (neuer Pfad: `QwenAgent.getMcpPoolAccounting()`)                                | `httpAcpBridge.ts:733-770` liest derzeit den Bootstrap-Sitzungs-Manager – muss geändert werden          |
| C13 | Generierungszähler auf `PoolEntry` für veralteten `tools/list_changed`-Handler-Guard                           | Opencode-Muster: `if (s.clients[name] !== client) return`                                                         |
| C14 | Sub-PR-Aufteilung 4 → **6**                                                                                    | v1 unterschätzte; A2/B1/B3/C6 fügen jeweils echte Arbeit hinzu                                                |
| C15 | Fauler Pool-Aufbau (nur wenn N≥2 Sitzungen gesehen) – optional                                                 | `qwen serve --foreground` mit einer Sitzung profitiert nicht; spart Initialisierungskosten                    |
---

## 1. Ziele / Nicht-Ziele

**Ziele**

- N Sitzungen in 1 Workspace, die sich 1 Prozess pro eindeutiger Server-Konfiguration teilen – fingerprint-basiert
- Pro-Sitzung `ToolRegistry` / `PromptRegistry` Ansichten erhalten (Filterung, Vertrauensstufe)
- Refcount + Grace-Drain-Lebenszyklus, widerstandsfähig gegen erneutes Anhängen
- Plattformübergreifende Bereinigung von Kindprozessen
- Budget-Guardrails wechseln von Pro-Sitzung zu Pro-Workspace (PR 14 hat dies versprochen)
- Abwärtskompatibel mit Nicht-Daemon-Standalone-Qwen (Pool wird dort nicht aufgebaut)

**Nicht-Ziele (F2-Umfang)**

- Workspace-übergreifendes Pooling (1 Daemon = 1 Workspace Invariante aus PR #4113 bleibt bestehen)
- Daemon-übergreifendes Pooling (außerhalb des Rahmens – Multi-Prozess-Orchestrator-Territorium)
- Überarbeitung des OAuth-Routings (F3 mit `PermissionMediator`)
- Pool-Persistenz über Daemon-Neustart hinweg (nur In-Memory)
- Automatische Erkennung von „Pool-sicheren“ HTTP-Servern (nur Opt-In-Flag)
- Live-`MCPServerConfig`-Diff zur direkten Änderung von Einträgen (Konfigurationsänderung → neuer Eintrag, alter wird abgebaut)

---

## 2. Aktueller Stand (Ablöseziel)

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

| Kopplung                                                                         | Ort                                               | Aktion in F2                                                                        |
| -------------------------------------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `McpClient`-Konstruktor bindet 1 ToolRegistry + 1 PromptRegistry                 | mcp-client.ts:106-119                             | Pool besitzt Transport; `SessionMcpView` (pro Sitzung) besitzt die Sitzungs-Registries |
| `McpClient.discover()` ruft `toolRegistry.registerTool()` inline auf                | mcp-client.ts:178-198                             | Aufteilung: `discoverAndReturn()` gibt Snapshot zurück; View registriert            |
| `ListRootsRequestSchema`-Handler schließt über `workspaceContext.getDirectories()` | mcp-client.ts:142-153 + connectToMcpServer.ts:893 | Pool-Kontext, der an einen einzelnen Workspace gebunden ist                         |
| `workspaceContext.onDirectoriesChanged` Listener wird pro Verbindung registriert          | mcp-client.ts:907                                 | Pool registriert einmal pro Eintrag                                                 |
| `McpClientManager` wird innerhalb von ToolRegistry erstellt                                   | tool-registry.ts:199                              | Optionalen `pool?`-Konstruktorparameter hinzufügen; Injektion aus Config            |
| Budget-Durchsetzung pro Sitzung                                                   | mcp-client-manager.ts:91-95 Kommentar               | Zustandsautomat in Pool verschieben                                                 |
| `serverDiscoveryPromises` deduplizieren laufende Anfragen pro Server                            | mcp-client-manager.ts:350                         | Pool hat `spawnInFlight: Map<ConnectionId, Promise<PoolEntry>>`                     |
| `setMcpBudgetEventCallback` Registrierung pro Sitzung                             | acpAgent.ts:1851-1899                             | Pool sendet → `QwenAgent` broadcastet an alle Sitzungen                            |

**Bereits gemeinsam genutzter Zustand (Pool erbt, führt nichts Neues ein):**

| Zustand                                         | Ort                                | Hinweis                                                         |
| ----------------------------------------------- | ---------------------------------- | --------------------------------------------------------------- |
| `serverStatuses: Map<string, MCPServerStatus>`  | mcp-client.ts:292 (module-level)   | Prozessweit heute; Pool-Schlüssel noch nach Name → „any-CONNECTED-gewinnt“ |
| `mcpServerRequiresOAuth: Map<string, boolean>`  | mcp-client.ts:302 (module-level)   | Gleich                                                          |
| `MCPOAuthTokenStorage` Token auf Festplatte     | `~/.qwen/mcp-oauth/<name>.json`    | Daemon-geteilt; Pool nutzt nur effizienter                      |

---

## 3. Referenzergebnisse

| Projekt         | Pool?              | Schlüssel                                      | Lebenszyklus                                                                              | Muster zum Übernehmen                                                                                                           |
| --------------- | ------------------ | --------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **claude-code** | Nein, pro Prozess  | `name + JSON.stringify(cfg)` (lodash.memoize) | `clearServerCache` + remote Backoff×5; stdio Crash → `failed`                            | Sortierter-Schlüssel SHA-256 `hashMcpConfig` für Invalidierung/Schlüsselbildung                                                  |
| **opencode**    | Ja, pro Workspace  | Servername **nur Name** (kein Konfigurations-Hash) | Kein Refcount / keine Räumung / kein Neustart; Effect-Finalizer + `pgrep -P` rekursives SIGTERM | Rekursive PID-Bereinigung, Stale-Handler-Guard (`if (s.clients[name] !== client) return`), `tools/list_changed` Fan-out über Event-Bus |

**Was F2 von jedem übernimmt:** Konfigurations-Hash von claude-code (behandelt pro-Sitzung Env/Auth-Unterschiede, die opencode nicht handhabt), rekursive PID-Bereinigung von opencode (npx/uvx-Wrapper lecken). Was wir hinzufügen: Refcount + Drain (Multi-Client-Daemon), automatischer Neustart (lange laufender Daemon), Prompt-Fan-out, Generierungs-Guard.

---

## 4. Architektur

### 4.1 Prozesslayout

```
HTTP-Daemon (packages/cli/src/serve, qwen serve)
  │ startet
  ▼
ACP-Kind (qwen --acp, einzelner Prozess pro Workspace)
  │
  QwenAgent (acpAgent.ts)
  ├── McpTransportPool ◄── neu, Workspace-bezogen, 1 Instanz
  │     ├── entries: Map<ConnectionId, PoolEntry>
  │     ├── spawnInFlight: Map<ConnectionId, Promise<PoolEntry>>
  │     ├── workspaceContext (an Daemon-Workspace gebunden)
  │     └── Budget-Guardrails (PR 14 Zustandsautomat, hochgestuft auf Workspace)
  │
  └── sessions: Map<sessionId, Session>
        └── Session.Config → ToolRegistry → McpClientManager(pool?)
                                                     │
                                            ┌────────┴────────┐
                                            │ Pool injiziert  │
                                            ▼                 ▼
                                pool.acquire(name,cfg,sid)   legacy im Prozess
                                  → SessionMcpView            (Standalone-Qwen)
                                    .applyTools/Prompts
                                    (Filter + Registrierung in
                                     sitzungseigene Registries)
```

**Pool lebt im ACP-Kind**, nicht im HTTP-Daemon. Der HTTP-Daemon fragt den Pool-Zustand über die vorhandene `bridge.client` extMethod-Oberfläche ab (`getMcpPoolAccounting`, `restartMcpServer`). F2-Code liegt in **`packages/core/src/tools/`** (neben `mcp-client-manager.ts`), nicht in `packages/acp-bridge/`.

### 4.2 Klassendiagramm

```
McpTransportPool
  ├─ acquire(name, cfg, sid) → PooledConnection
  ├─ release(connectionId, sid) → void
  ├─ releaseSession(sid) → void   (Massenfreigabe für Sitzungsteardown)
  ├─ restartByName(name) → RestartResult[]
  ├─ getAccounting() → McpClientAccounting   (Workspace-Bereich)
  ├─ getBudgetMode/Budget()
  ├─ drainAll() → Promise<void>   (Herunterfahren)
  └─ onBudgetEvent: (event) => void   (gesetzt von QwenAgent)

PoolEntry (intern)
  ├─ refs: Set<sessionId>
  ├─ client: McpClient
  ├─ toolsSnapshot: DiscoveredMCPTool[]
  ├─ promptsSnapshot: Prompt[]
  ├─ generation: number   (++ bei erneuter Verbindung; Schutz vor veralteten Events)
  ├─ state: 'spawning' | 'active' | 'draining' | 'closed' | 'failed'
  ├─ drainTimer?: NodeJS.Timeout
  ├─ healthMonitor: { intervalTimer, consecutiveFailures, isReconnecting }
  ├─ subscribers: Map<sid, SessionMcpView>
  ├─ attach(sid, view) → PooledConnection
  └─ detach(sid) → void

PooledConnection (Handle, das an den Aufrufer zurückgegeben wird)
  ├─ id: ConnectionId
  ├─ on('toolsChanged' | 'promptsChanged' | 'disconnected' | 'reconnected' | 'failed', cb)
  ├─ callTool(name, args, { sessionId }) → CallToolResult
  ├─ readResource(uri, { sessionId, signal })
  └─ release()

SessionMcpView (pro Sitzung, pro Server)
  ├─ ctor(toolRegistry, promptRegistry, sessionId, serverName, cfg)
  ├─ applyTools(snapshot) → void   (filtert nach include/exclude, dekoriert Vertrauensstufe)
  ├─ applyPrompts(snapshot) → void
  └─ teardown() → void   (entfernt seine Registrierungen)
```

---

## 5. Pool-Schlüssel (Fingerprint)

### 5.1 Gehashte kanonische Felder

```ts
type PoolKey = string; // sha256 hex, erste 16 Zeichen ausreichend (kollisionsfrei für realistische N)
type ConnectionId = `${serverName}::${PoolKey}`;

function fingerprint(cfg: MCPServerConfig): PoolKey {
  const canonical = {
    transport: mcpTransportOf(cfg),
    command: cfg.command ?? null,
    args: cfg.args ?? [],
    cwd: cfg.cwd ?? null,
    env: sortedEntries(cfg.env ?? {}), // [[k,v],...] sortiert nach k
    url: cfg.url ?? null,
    httpUrl: cfg.httpUrl ?? null,
    headers: sortedEntries(cfg.headers ?? {}),
    timeout: cfg.timeout ?? null,
    oauth: canonicalOAuth(cfg.oauth),
  };
  return sha256(JSON.stringify(canonical)).slice(0, 16);
}

/**
 * V21-9: Normalisiert funktional äquivalente OAuth-Konfigurationen, sodass sie
 * zum gleichen Fingerprint kollabieren. `{enabled: false}`, `undefined`,
 * `null` und `{}` bedeuten alle „kein OAuth“ → alle geben `null` zurück.
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

// Ausgeschlossene Felder (Pro-Sitzungs-Filter, NICHT Transportebene):
//   includeTools, excludeTools, trust, description, extensionName
```

### 5.2 Transportklassen-Steuerung

```ts
const POOLED_TRANSPORTS_DEFAULT = new Set(['stdio', 'websocket']);

function isPoolable(cfg: MCPServerConfig, opts: PoolOptions): boolean {
  if (isSdkMcpServerConfig(cfg)) return false;
  const transport = mcpTransportOf(cfg);
  return opts.pooledTransports.has(transport);
}
```

**Standardmäßig `pooledTransports = {stdio, websocket}`**. Operatoren wählen HTTP/SSE über Folgendes ein:

- CLI: `--mcp-pool-transports=stdio,websocket,http,sse`
- Env: `QWEN_SERVE_MCP_POOL_TRANSPORTS=stdio,websocket,http`

**Warum HTTP/SSE standardmäßig ausgeschlossen:** Einige MCP-HTTP-Server-Implementierungen binden Zustand (Auth-Kontext, Gesprächsverlauf) an den TCP/SSE-Stream; mehrere ACP-Sitzungen, die ihn teilen, würden den Zustand vermischen. stdio + websocket sind echte Betriebssystemprozesse, deren Zustand beobachtbar und isolierbar ist.

### 5.3 SDK-MCP-Umgehung

`isSdkMcpServerConfig(cfg)` true → Pool gibt einen dünnen `PooledConnection`-Wrapper über `createUnpooledConnection(name, cfg, sid)` zurück, der sofort einen `McpClient` erstellt, keine gemeinsame Nutzung, kein Eintrag im Pool. Grund: `sendSdkMcpMessage` ist von Natur aus pro Sitzung (Routing über ACP-Steuerebene zurück zur ursprünglichen Sitzung). Gleicher Pfad für HTTP/SSE, wenn der Transport nicht in `pooledTransports` ist (§10.3).

V21-10: Name ist `createUnpooledConnection`, nicht `legacyInProcessAcquire` – SDK-MCP und HTTP-Opt-out sind dauerhafte Designentscheidungen, kein Legacy-Code.

---

## 6. Lebenszyklus

### 6.1 acquire / release

```ts
class McpTransportPool {
  private entries = new Map<ConnectionId, PoolEntry>();
  private spawnInFlight = new Map<ConnectionId, Promise<PoolEntry>>();

  /** V21-2: Rückwärtsindex, O(refs) releaseSession statt O(entries). */
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
          // V21-4: Reservierten Slot bei Fehlschlag des Startens freigeben. Ohne
          // dies würde der Slot lecken, bis der Health-Monitor-Pfad zur Freigabe
          // ausgeführt wird (der nicht ausgeführt wird, da kein Eintrag zu überwachen ist).
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

  /** V21-2: O(refs dieser Sitzung), nicht O(alle Einträge). */
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

### 6.2 Gleichzeitiges Acquire deduplizieren (`spawnInFlight`)

Spiegelt `McpClientManager.serverDiscoveryPromises` (mcp-client-manager.ts:350) wider. Ohne dies würden 5 Sitzungen, die beim Start aufsetzen, alle `entries.has(id) === false` sehen und sich darum kümmern, 5 Kindprozesse zu starten.

### 6.3 Drain-Gnadenfrist + Leerlaufobergrenze

```ts
const DRAIN_DELAY_MS_DEFAULT = 30_000; // Gnadenfrist nach letzter Freigabe
const MAX_IDLE_MS_DEFAULT = 5 * 60_000; // harte Obergrenze (Schutz gegen Drain-Abbruchschleife)
```

Zustandsautomat in `PoolEntry`:

```
spawning ──Spawn ok────► active ──letztes detach──► draining ──Timeout──► closed
   │                        │                          │
   │                        │                          └──attach──► active (Timer abbrechen)
   Spawn fehlgeschlagen──►failed
                           │
                           └──manueller Neustart──► spawning
```

Harte Leerlaufobergrenze: Drain-Timer kann unbegrenzt abgebrochen und neu gestartet werden (acquire/release-Flatter). `MAX_IDLE_MS` ist ein separater Timer, der **beim ersten Leerlauf** gestartet und nie zurückgesetzt wird; wenn er auslöst, wird der Eintrag zwangsweise geschlossen, selbst wenn der Drain gerade in der aktiven Gnadenfrist ist. Verhindert Zombie-Pool-Einträge durch fehlerhafte Clients, die acquire/release ständig ausführen.

### 6.4 Plattformübergreifende Bereinigung von Kindprozessen

**R10 / R23 T7 / PR A Update (22.05.2026)**: Umstellung von BFS pro PID (jeweils ein `pgrep -P <pid>` / `Get-CimInstance -Filter` Subprozess pro Knoten) auf eine einzige Momentaufnahme der Prozesstabelle, gefolgt von einem In-Memory-Baumdurchlauf. Zwei Gründe: (1) ein Fork statt viele Forks auf dem heißen Pool-Herunterfahrpfad; (2) Konsistenz der Momentaufnahme – vor dem Fix konnte BFS Nachfahren übersehen haben, die zwischen benachbarten BFS-Ebenen abgezweigt sind. Der Pfad pro PID bleibt als Fallback für BusyBox `ps` <v1.28 (keine `-o`-Unterstützung) und Distroless-Container ohne `ps` erhalten.

```ts
// packages/core/src/tools/pid-descendants.ts
export async function listDescendantPids(rootPid: number): Promise<number[]> {
  if (!Number.isInteger(rootPid) || rootPid <= 0) return [];
  try {
    if (process.platform === 'win32')
      return await listDescendantPidsWin(rootPid);
    return await listDescendantPidsUnix(rootPid);
  } catch {
    return []; // OS kümmert sich um Waisenkinder; Pool-Herunterfahren wird trotzdem fortgesetzt.
  }
}

async function listDescendantPidsUnix(root: number): Promise<number[]> {
  let tree: Map<number, number[]> | undefined;
  try {
    tree = await snapshotProcessTreeUnix(); // ps -A -o pid=,ppid=
  } catch {
    /* Fallback */
  }
  if (tree) return walkDescendants(tree, root); // O(Nachfahren), 1 Fork
  return await listDescendantPidsUnixPgrepFallback(root); // Legacy-BFS
}

async function snapshotProcessTreeUnix(): Promise<Map<number, number[]>> {
  // -A: alle Prozesse (POSIX, äquivalent zu -e aber eindeutig auf BSD).
  // -o pid=,ppid=: pid + ppid Spalten, das nachgestellte `=` unterdrückt Kopfzeilen.
  const { stdout } = await execFile('ps', ['-A', '-o', 'pid=,ppid='], {
    timeout: 2000,
    maxBuffer: 8 * 1024 * 1024, // deckt >250k-Prozess pathologische Hosts ab
  });
  const childrenByPpid = new Map<number, number[]>();
  for (const line of stdout.split('\n')) {
    const m = line.trim().match(/^(\d+)\s+(\d+)$/);
    if (!m) continue;
    /* parsen, in childrenByPpid einfügen */
  }
  return childrenByPpid;
}

// Windows: Einzige Get-CimInstance Win32_Process | ConvertTo-Csv Momentaufnahme
// aller (ProcessId, ParentProcessId) Zeilen + In-Memory-Durchlauf; pro PID
// `Get-CimInstance -Filter "ParentProcessId=$p"` als Fallback erhalten.
```

Wird von `PoolEntry.shutdown()` vor `client.disconnect()` aufgerufen. Behandelt `npx @modelcontextprotocol/server-X`, `uvx ...`, `pnpm dlx ...` Wrapper-Leaks. MAX_DESCENDANTS=256 / MAX_DEPTH=8 Schutzgrenzen bleiben erhalten.

### 6.5 Behandlung von Startfehlern

Wenn `spawnEntry` nachdem mehrere Abonnenten (via `spawnInFlight`) angehängt wurden, ablehnt:

- Alle Wartenden erhalten die Ablehnung
- `tryReserveSlot` wird **über expliziten `.catch`-Zweig in `acquire`** freigegeben (V21-4); ohne diesen Fix blieb der Slot bis zum nächsten Health-Monitor-Durchlauf undicht, der nie stattfand, da kein Eintrag zu überwachen war.
- Fehlgeschlagener Eintrag NICHT in `entries` gespeichert
- Die Codepfade der Abonnenten behandeln den Fall, als ob `acquire` ursprünglich fehlgeschlagen wäre (vorhandene Catch-Logik von `discoverMcpToolsForServer` pro Sitzung bleibt gültig)

### 6.6 Wiederherstellungs-Backoff (V21-8)

Wenn ein `PoolEntry` nach einem Transportabbruch in die Wiederherstellung eintritt:

| Transportfamilie | Strategie                                     | Obergrenze                                                        |
| ---------------- | --------------------------------------------- | ----------------------------------------------------------------- |
| stdio            | Fest 5s × 3 Versuche                         | Entspricht vorhandenem `DEFAULT_HEALTH_CONFIG.reconnectDelayMs`   |
| websocket        | Fest 5s × 3 Versuche                         | Gleich wie stdio                                                  |
| http (Opt-In)    | Exponentiell 1s, 2s, 4s, 8s, 16s × 5 Versuche | Remote-Endpunkte flattern bei vorübergehenden Netzwerkproblemen; größeres Budget |
| sse (Opt-In)     | Exponentiell 1s, 2s, 4s, 8s, 16s × 5 Versuche | Gleich wie http                                                    |

Nach Erschöpfung der Obergrenze: Eintrag wechselt in den Zustand `failed`; Abonnenten erhalten das `failed`-Event; ein neuer `acquire` für dieselbe `ConnectionId` versucht einmal einen Neustart, dann wird ausgelöst. Operatorenstart (§13) setzt den Zustand zurück.
---
## 7. Discovery / SessionMcpView

### 7.1 Tools + Prompts Dual-Fan-Out

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

### 7.2 Snapshot-Replay bei Attach (earlyEvents-Stil)

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

Spiegelt das PR-14b-Fix#1-`BridgeClient.earlyEvents`-Muster wider – löst das analoge Race-Condition beim Pool-Attach.

### 7.3 Stale-Handler-Guard (Generation Counter)

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

Ohne diese Absicherung könnte ein Stale-Handler einer vor dem Reconnect erstellten Client-Instanz den Snapshot nach dem Reconnect mit veralteten Daten überschreiben.

**Monotonie-Invariante** (V21-Präzisierung): `generation` inkrementiert nur, wird nie zurückgesetzt. Jede laufende Operation erfasst zu Beginn `myGen` und prüft nach `await`, ob `myGen === this.generation`. Entspricht „Seit meinem Start ist kein neueres Ereignis eingetreten". Begrenzt auf Number.MAX_SAFE_INTEGER (~285k Jahre bei 1Hz Reconnect), kein Überlaufproblem.

### 7.4 Pfadvereinheitlichung (F2-1 Scope-Erweiterung)

`packages/core/src/tools/mcp-client.ts` hat ZWEI Connect-to-Server-Pfade:

1. `McpClient`-Klasse (mcp-client.ts:100) – verwendet von `McpClientManager`
2. `connectToMcpServer`-Factory-Funktion (mcp-client.ts:875) – verwendet von `discoverMcpTools` (Zeile 560) und `connectAndDiscover` (Zeile 607)

F2-1 muss beide hinter `McpClient.discoverAndReturn` zusammenführen (entweder wird `connectToMcpServer` zu einem privaten Helfer von `McpClient` oder beide rufen eine gemeinsame `establishConnection()`-Primitive auf). Andernfalls deckt der Pool nur den Klassenpfad ab; der Factory-Pfad bleibt pro Session und untergräbt die gesamte Bemühung.

---

## 8. Koexistenz globaler Zustände

### 8.1 `serverStatuses` (mcp-client.ts:292) – kollisionstolerante Schreibvorgänge

Modulweite `Map<serverName, MCPServerStatus>`. Die `ConnectionId` des Pools ist `name::hash`, aber `updateMCPServerStatus(name, status)` schreibt nach Name. **Mehrere Pool-Einträge für denselben Namen (unterschiedliche Fingerabdrücke, z. B. Token-Divergenz) würden sich gegenseitig den Status überschreiben.**

**Lösung**: Pool fängt Status-Schreibvorgänge ab:

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

Die Status-Route zeigt `entryCount: number` an, sodass Bediener sehen, wenn ein Name → mehrere Einträge hat.

### 8.2 OAuth-Token-Speicher

`MCPOAuthTokenStorage` schreibt nach `~/.qwen/mcp-oauth/<serverName>.json` – bereits daemon-host-shared. Der Pool profitiert beiläufig (OAuth der ersten Session wird abgeschlossen → Token auf Platte → Pool-Eintrag holt Token beim Reconnect → alle anderen Sessions hängen sich mit dran).

**Einschränkung – Multi-Fingerprint-Fall**: 2 Einträge für denselben Namen (unterschiedliche Header/Env) aber derselbe OAuth-Provider → beide lesen dieselbe Token-Datei. Wenn Token server-scoped sind (OAuth typisch), funktioniert das. Wenn Token env-scoped sind (selten), ist eine explizite Erweiterung des Speicherschlüssels nötig. **Auf F3 verschoben** mit dokumentiertem Known-Limitation.

### 8.3 `entryCount` im Snapshot

`GET /workspace/mcp`-Zelle pro Server fügt hinzu:

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

**V21-7**: `entrySummary[].entryIndex` ist ein **stabiler, undurchsichtiger Integer**, der bei der Eintragserstellung zugewiesen wird (Einfügereihenfolge innerhalb der Namensgruppe), NICHT der rohe Fingerprint. Begründung: Fingerprints ändern sich, wenn OAuth-Tokens oder Umgebungsvariablen rotieren, was diese Information über Snapshot-Diffs durchsickern lassen würde (Operator könnte auf „Token rotiert bei T+5min" schließen aus dem Übergang `'a3b1' → 'f972'`). `entryIndex` ist innerhalb der Namensgruppe monoton, bleibt aber über Rotationen hinweg stabil, weil der alte Eintrag drainiert und der neue Eintrag den nächsten Index bekommt.

Alte SDK-Clients ignorieren unbekannte Felder laut PR-14-Vertrag; neue Clients verwenden `entryCount` für Badges. Der interne Restart-by-Fingerprint-Pfad verwendet ein undurchsichtiges Token, das nur über privilegierte extMethod zurückgegeben wird, nicht im HTTP-Snapshot.

---

## 9. WorkspaceContext / ListRoots

### 9.1 Einmalige Registrierung

Die `McpClient`-Instanzen des Pools teilen sich **einen** `WorkspaceContext` – den gebundenen Workspace-Context des Daemons (PR-#4113-Invariante). Der `ListRootsRequestSchema`-Handler von `connectToMcpServer` schließt über diesen einzigen Context.

Der `onDirectoriesChanged`-Listener wird **einmal pro Eintrag** registriert, nicht einmal pro `acquire`. Bei Shutdown des Eintrags wird er abgemeldet.

### 9.2 `roots/list_changed` Fan-Up

Server benachrichtigt Client über neue Roots → Pool verteilt:

- Pool erkennt neu (Server könnte unter neuen Roots andere Toolmengen melden) → `toolsChanged`-Event → alle Subscriber-Views wenden erneut an

### 9.3 Pro-Session `updateWorkspaceDirectories`

**Vertrag**: In Modus B sind pro-Session-Verzeichniserweiterungen nur ein weicher Hinweis, nicht autoritativ. Der `WorkspaceContext` des Pools liegt auf Daemon-Ebene.

Zwei Implementierungsoptionen:

- **v1 einfach**: Pro-Session-Hinzufügungen ignorieren, Warnung loggen wenn erkannt
- **v2 Union**: Pool pflegt `extraRoots: Map<sessionId, Set<dir>>`, ListRoots-Handler gibt Union aus gebundenem Workspace + allen Extras zurück. Entfernen pro Session löst `roots/list_changed` aus. Erhöht die Code-Komplexität um 50-80 LOC.

**Für F2 v1 einfach wählen**; v2 Union als Follow-up, falls Nutzerprobleme auftreten.

---

## 10. Pro-Session-Injektion

### 10.1 `mcpServers` aus `newSession({mcpServers})`

`newSessionConfig(cwd, mcpServers, ...)` merged die injizierte Liste mit `settings.merged.mcpServers` (acpAgent.ts:1778-1831). Der Pool konsumiert die **pro-Session-gemerge Ansicht**:

```ts
async newSessionConfig(...) {
  const config = await loadCliConfig(...);
  if (this.mcpPool) config.setMcpTransportPool(this.mcpPool);
  // ...existing setMcpBudgetEventCallback REMOVED — pool handles broadcast directly
}
```

Wenn zwei Sessions einen gleichnamigen Server mit unterschiedlichem Env/Headers injizieren → unterschiedliche Fingerprints → zwei Pool-Einträge. Pool-Sharing greift nur, wenn Sessions exakt übereinstimmen.

### 10.2 Auth-Divergenz

Statische `~/.qwen/settings.json`-mcpServers sind über Sessions hinweg identisch → alle teilen → 80%-Fall. Pro-Session injizierte mcpServers mit nutzerspezifischen Tokens → eindeutige Fingerprints → kein Sharing. Beides sicher.

### 10.3 HTTP-Transport-Opt-In (Zusammenfassung aus §5.2)

Standardmäßig `pooledTransports = {stdio, websocket}`. HTTP/SSE-Server durchlaufen den `createUnpooledConnection`-Pfad (ein McpClient pro Session), es sei denn, der Bediener optiert ein.

### 10.4 `/mcp disable X` während der Session (V21-6)

Wenn der Bediener `/mcp disable github` gegen eine laufende Session ausführt:

1. `Config.disableMcpServer('github')` fügt dem pro-Config-Set `disabledMcpServers` hinzu
2. **F2-Hook**: `Config.onDisabledMcpServersChanged` feuert; `SessionMcpView` für diesen Namen ruft `teardown()` auf (entfernt seine Tool-/Prompt-Registrierungen aus den Session-Registries)
3. Pool-Eintrag **kann bestehen bleiben**, falls andere Sessions ihn noch referenzieren (refcount > 0) – nur die deaktivierende Session trennt ihre View ab
4. Wenn alle Sessions deaktivieren → refcount → 0 → Drain-Timer startet

Ohne Schritt 2 würde eine Deaktivierung während der Session bereits registrierte Tools im `ToolRegistry` der Session belassen, bis zum nächsten Session-Neustart. Test 21.4 deckt dies ab.

`/mcp enable github` ist die Umkehrung: löst ein erneutes `pool.acquire` für die Session aus, hängt eine neue View an und wendet den Snapshot erneut an.

---

## 11. Budget-Guardrails-Graduierung

### 11.1 Zustandsmaschine wandert in den Pool

`tryReserveSlot` / `releaseSlotName` / 75%-Hysterese / `refused_batch`-Coalescing / `bulkPassDepth` / `pendingRefusalNames` – all das migriert von `McpClientManager` zu `McpTransportPool`. `McpClientManager` behält den Zustand nur, wenn er standalone läuft (kein Pool injiziert).

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

Laut PR-14-Vertrag: „Consumers MUST tolerate additional entries with unrecognized scope values (drop, don't fail)." Alte SDK-Clients sehen `scope: 'workspace'`, rendern als unbekannt (oder fallen zurück auf Top-Level-Zahlen). Neues SDK fügt den Helper `isWorkspaceScopedBudget(cell)` hinzu.

### 11.3 Event-Fan-Out

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

- `DaemonMcpBudgetWarningData` – `scope?: 'workspace' | 'session'` hinzufügen (optional für Rückwärtskompatibilität; fehlend = 'session')
- `DaemonMcpChildRefusedBatchData` – gleiche `scope?`-Erweiterung
- `DaemonMcpGuardrailEvent` – Diskriminator unverändert

Neue SDK-Helper:

```ts
export function isWorkspaceScopedBudgetEvent(
  e: DaemonMcpGuardrailEvent,
): boolean;
```

Reducer-Zustand auf `DaemonSessionViewState`:

- **Keine neuen Felder** – `mcpBudgetWarningCount` / `mcpChildRefusedBatchCount` inkrementieren unabhängig vom Scope (Scope ist eine Eigenschaft jedes Events, kein separater Stream)
- Dokumentieren, dass diese Zähler unter F2 Workspace-Level-Events widerspiegeln, die an jede Session weitergeleitet werden – sie werden bei Budgetdruck **gleichzeitig über alle angehängten Sessions** inkrementieren

**V21-12 (Q1 gelöst, in v2.1 eingefroren)**: bestehende Feldnamen behalten (`mcpBudgetWarningCount`, `mcpChildRefusedBatchCount`, `lastMcpBudgetWarning`, `lastMcpChildRefusedBatch`) mit erweiterter Scope-Semantik, dokumentiert im JSDoc:

```ts
/**
 * Count of `mcp_budget_warning` events the session has observed.
 * Under F2 (`scope: 'workspace'`), this increments simultaneously
 * across all attached sessions because budget events fan out at
 * workspace level. Use `isWorkspaceScopedBudgetEvent(lastMcpBudgetWarning)`
 * to inspect scope of the most recent event.
 */
mcpBudgetWarningCount: number;
```

Begründung: PR 14b hat diese Namen bereits als öffentliche SDK-Oberfläche ausgeliefert; eine Umbenennung wäre ein Breaking Change, der schlimmer ist als die leicht ungenaue Semantik.

---

## 12. OAuth – Explizites F3-Deferral

Der OAuth-401-Fallback in `connectToMcpServer` (mcp-client.ts:950-1010) benötigt interaktive Auflösung (Browser öffnen oder Device-Flow). Mode-B-Daemon **darf keinen Browser öffnen** (laut PR-21-Design – statischer Source-Grep-Test schlägt bei `open`/`xdg-open`/`shell.openExternal` im Build fehl).

**F2-Verhalten bei OAuth-erforderndem Server**:

1. Erstes `acquire` löst `connectToMcpServer` aus → 401 erkannt
2. Pool fängt die OAuth-erfordernde Exception, markiert Eintrag als `failed_auth_required`
3. Status-Route zeigt `errorKind: 'auth_env_error'` (bestehender PR-13-errorKind)
4. Pool **wiederholt nicht automatisch**
5. Bediener führt `/mcp auth <name>` aus (bestehende CLI) ODER verwendet PR-21-Device-Flow-Route, um ein Token auf die Platte zu bekommen → nächstes Session-`acquire` wiederholt und hat Erfolg

**F3 wird Schritte 4-5** durch `PermissionMediator` ersetzen, der die OAuth-Completion-Anfrage an angehängte Sessions zur Erstantwort weiterleitet.

Dies vermeidet, dass F2 in die Auth-State-Machine-Arbeit hineingezogen wird.

---

## 13. Neustart-Routen-Semantik

### 13.1 `POST /workspace/mcp/:server/restart` unter Pool

Heute (PR 17): Restart im Bootstrap-Session-Manager = Neustart des einzelnen Eintrags für diesen Namen.

Unter Pool: Name → möglicherweise mehrere Einträge (unterschiedliche Fingerprints für denselben Namen = unterschiedliche Sessions mit unterschiedlichen Konfigurationen).

**Spezifiziertes Verhalten**:

| Request                                            | Verhalten                                                                                   |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `POST /workspace/mcp/:server/restart`              | Alle Einträge, die zu `serverName` passen, neu starten (parallel via `Promise.allSettled`)  |
| `POST /workspace/mcp/:server/restart?entryIndex=0` | V21-3: nur Eintrag #0 neu starten (der undurchsichtige Index aus Snapshot §8.3); 404 falls nicht gefunden |
| `POST /workspace/mcp/:server/restart?entryIndex=*` | Explizit „alle" (wie ohne Parameter)                                                          |

Antwortstruktur:

```ts
type RestartResult = {
  entryIndex: number;        // V21-7: undurchsichtiger Index, nicht roher Fingerprint
  restarted: boolean;
  durationMs?: number;
  reason?: string;           // 'budget_would_exceed' | 'not_connected' | 'in_flight'
};
POST /workspace/mcp/:server/restart → { entries: RestartResult[] }
```

Alte Form `{restarted: true, durationMs}` bleibt erhalten, wenn `entries.length === 1` UND kein `entryIndex`-Query-Parameter angegeben ist (Rückwärtskompatibilität); Clients können die neue Form erkennen, indem sie auf `'entries' in response` prüfen.

### 13.2 In-Flight-Restart-Deduplizierung

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

### 13.3 Budget-Prüfung (erhält PR-17-Verhalten)

Vor dem Neustart prüft der Pool das Budget: wenn Disconnect+Reconnect noch passen, OK. Die aktuelle PR-17-Semantik `{restarted:false, skipped:true, reason:'budget_would_exceed'}` bleibt erhalten (wird jetzt pro Eintrag angewendet).

### 13.4 In-Flight-Tool-Aufruf während Reconnect (V21-5, neu)

Session A ruft `pool.callTool('git.commit', args)` auf → Anfrage trifft auf stdin des unterliegenden Child-Prozesses → Child-Prozess stürzt während des Schreibens ab → Eintrag geht in Reconnect:

```ts
class MCPCallInterruptedError extends Error {
  readonly serverName: string;
  readonly entryIndex: number;
  readonly clientGeneration: number;   // Generation vor dem Reconnect
  readonly args: unknown;              // ursprüngliche Argumente, zum erneuten Versuch durch Aufrufer, falls sicher
  constructor(serverName, entryIndex, clientGeneration, args) { ... }
}
```

**Spezifikation**:

- Das Promise des laufenden Aufrufs wird mit `MCPCallInterruptedError` abgelehnt, sobald der Transportabbruch erkannt wird (nicht auf Reconnect warten)
- Der Pool **wiederholt den Aufruf NICHT automatisch**; Semantik ist unsicher für Schreibvorgänge (Commit, Dateibearbeitung usw.) und der Pool kann Lesen von Schreiben nicht unterscheiden
- Der Aufrufer (typischerweise Tool-Ausführungsschicht in der Agentenschleife) fängt diesen Fehler ab und entscheidet: erneut versuchen / dem Benutzer anzeigen / abbrechen
- Nach dem Reconnect: Session A kann erneut aufrufen (gleicher `PooledConnection.callTool`); Pool leitet transparent zur neuen Transportinstanz weiter
- `MCPCallInterruptedError.clientGeneration` ermöglicht es dem Aufrufer, bei Bedarf mit einem folgenden `reconnected`-Event zu korrelieren

Test 21.6 muss abdecken: Einen langlebigen stdio-MCP starten, Tool-Aufruf senden, das Child während des Aufrufs töten, Ablehnung mit `MCPCallInterruptedError` und nicht-null `clientGeneration` bestätigen.

---

## 14. Status-Route-Refactoring

### 14.1 Neuer Abfragepfad

```ts
// httpAcpBridge.ts:733 buildWorkspaceMcpStatus — replace data source
let accounting: McpClientAccounting | undefined;
try {
  // NEU: Pool direkt via Bridge-extMethod abfragen, nicht Bootstrap-Session
  accounting = await this.bridge.client.getMcpPoolAccounting();
} catch (err) {
  // Fallback auf Legacy-Bootstrap-Session-Pfad für Non-Pool-Daemon
  const manager = config.getToolRegistry()?.getMcpClientManager();
  if (manager) accounting = manager.getMcpClientAccounting();
}
```

`QwenAgent` macht `getMcpPoolAccounting()` verfügbar:

```ts
class QwenAgent {
  getMcpPoolAccounting(): McpClientAccounting | undefined {
    return this.mcpPool?.getAccounting();
  }
}
```

ACP-Child-Bridges leiten über `extMethod` weiter, damit der Daemon aufrufen kann.

### 14.2 entryCount + entrySummary

Siehe §8.3.

### 14.3 Fall ohne Bootstrap-Session

Heute (PR 12) gibt `GET /workspace/mcp` `initialized: false` zurück, wenn der Daemon im Leerlauf ist (noch keine Sessions), weil keine Bootstrap-Session zum Abfragen existiert.

Unter Pool: Pool existiert ab dem `QwenAgent`-Konstruktor → Status-Route kann Live-Accounting zurückgeben **selbst bei null Sessions**. Zelle `initialized: true` sogar vor der ersten Session. **Dokumentierte Verhaltensänderung** in der PR-Beschreibung; kein Regression.

---

## 15. loadSession / resume-Interaktion (PR 6 #4222)

### 15.1 Drain-Abbruch bei Resume

```
session-A aktiv, hält Referenz auf entry-X
session-A disconnect (kein explizites Close) → irgendwann killSession → pool.releaseSession(A) → entry-X.refs.size === 0 → Drain-Timer startet (30s)
session-A resume innerhalb von 30s → neues newSessionConfig → pool.acquire gibt entry-X zurück → attach bricht Drain ab
session-A resume nach 30s → entry-X bereits geschlossen → Pool erzeugt neuen Eintrag (Kaltstart)
```
### 15.2 `restoreState`-Cache-Fenster (5 Min., aus PR 6)

`acpAgent.restoreState` wird 5 Min. nach Trennung gehalten. Pool-Drain (30s Standard) < Wiederherstellungsfenster (5 Min.) → Wiederaufnahme zwischen 30s und 5 Min. verursacht MCP-Kaltstart. Akzeptabler Kompromiss (Wiederaufnahme selbst ist seltener Pfad).

Alternative: Pool liest die Restore-Window-Konfiguration des Daemons und verlängert den Drain entsprechend. Erhöht Kopplung zwischen Pool und Session-Zustandsmaschine; **auf Folgearbeit verschieben, es sei denn, Benutzer melden Kaltstart-Schmerzen**.

### 15.3 `pendingRestoreIds`-Interaktion

`acpAgent.killSession()` MUSS `pool.releaseSession(sid)` NACH der Bereinigung von `pendingRestoreIds` aufrufen. Reihenfolge:

1. Session als wiederherstellbar markiert (`pendingRestoreIds.add(sid)`)
2. Session.close() — aber Pool-Referenz bleibt erhalten
3. Nach Ablauf von `RESTORE_WINDOW_MS` ohne Wiederaufnahme: `killSession` bereinigt endgültig → `pool.releaseSession(sid)` löst Drain aus

Vermeidet, dass Drain während eines Wiederherstellungsfensters ausgelöst wird.

---

## 16. Hot Config Reload

### 16.1 Implizites Neuladen durch Fingerprint-Änderung

Benutzer bearbeitet `~/.qwen/settings.json` während des Betriebs, ändert die Umgebung eines Servers:

1. Alte Sessions behalten alten `Config`/`McpServers`-Snapshot → behalten alten Fingerprint → Referenz auf Eintrag-Alt bleibt bestehen
2. Neue Session liest neue Einstellungen → neuer Fingerprint → Eintrag-Neu erstellt → koexistiert mit Eintrag-Alt
3. Alte Sessions schließen natürlich → Eintrag-Alt drain → schließlich geschlossen
4. Gleichgewichtszustand: nur Eintrag-Neu bleibt

**Keine Live-Mutation laufender Verbindungen** — saubere Trennung zwischen Sessions mit unterschiedlichen Konfigurationsversionen.

### 16.2 Erzwungener Neuladepfad (optional)

```
POST /workspace/mcp/reload-all
  → für jede Session: Einstellungen neu laden, Config.mcpServers austauschen
  → für jeden nicht mehr referenzierten Eintrag: Löschung einplanen
```

Nützlich für „Ich habe Umgebungsvariablen geändert und möchte sofortige Wirkung auf alle Sessions." Auf F2-Folgearbeit verschieben (nicht blockierend).

### 16.3 Erweiterungs-Deinstallation verwaiste Einträge (V21-15)

Szenario: Erweiterung `foo-ext` registriert MCP-Server `foo-server`. Operator führt `/extension uninstall foo-ext` aus. Der Erweiterungslebenszyklus entfernt `foo-server` aus `extensionMcpServers`, sodass zukünftige `loadCliConfig`-Aufrufe ihn nicht enthalten. Aber:

- Live-Sessions halten `Config`-Snapshots, die noch `foo-server` enthalten → diese Sessions nutzen den Eintrag weiter
- Neue Sessions nach Deinstallation erwerben ihn nicht (Server nicht mehr in ihrem gemergten mcpServers) → kein Referenzzähleranstieg

**Lösung**: Auf natürlichen Drain verlassen. Wenn alte Sessions schließen, sinkt der Referenzzähler; schließlich erreicht der Eintrag `MAX_IDLE_MS = 5min` und wird zwangsgeschlossen. **Keine explizite `pool.invalidateByExtension(name)`-API** — hält das Modell einheitlich mit Hot Config Reload (§16.1).

Kompromiss: Der Server der Erweiterung kann bis zu 5 Min. nach Deinstallation laufen, wenn eine lange Session ihn am Leben hält. Akzeptabel; Operatoren können `/mcp restart foo-server` und dann die Session beenden, wenn Dringlichkeit besteht.

---

## 17. Abschalt-Reihenfolge

`QwenAgent.close()`-Sequenz (muss erzwungen werden):

```
1. Setze acceptingNewSessions = false; lehne neue POST /session ab
2. Für jede laufende Eingabeaufforderung: Signalisiere Abbruch, warte auf Abschluss (bestehender PR 11 Lebenszyklus)
3. Für jede Session: Trigger close → pool.releaseSession(sid)
4. Await pool.drainAll({ force: true, timeoutMs: 10_000 })   ← umgeht 30s Gnadenfrist
   ├── Für jeden Eintrag: Brich Drain + Health-Timer ab, markiere als drainend
   ├── Für jeden Eintrag parallel: listDescendantPids → SIGTERM an Kindprozesse
   ├── Für jeden Eintrag parallel: client.disconnect()
   └── Promise.race gegen timeoutMs; verlassene Einträge erhalten SIGKILL
5. Bridge-Kanal schließen
6. Prozess beenden
```

**V21-11**: `drainAll`-Signatur:

```ts
async drainAll(opts?: {
  force?: boolean;       // Standard false; true umgeht 30s Gnadenfrist-Timer
  timeoutMs?: number;    // Standard 10_000; Wanduhr-Budget; SIGKILL für Nachzügler danach
}): Promise<DrainResult>;

type DrainResult = {
  drained: number;       // Einträge, die sauber getrennt wurden
  forced: number;        // Einträge, die nach Timeout SIGKILL erhalten haben
  errors: Array<{ entryIndex: number; serverName: string; error: string }>;
};
```

Aufrufer verwendet `DrainResult` für Abschaltprotokollierung; bei `forced > 0` eine Warnung loggen, damit der Operator weiß, dass ein Server nicht sauber heruntergefahren wurde.

---

## 18. Dateistruktur

**Neue Dateien:**

```
packages/core/src/tools/
  mcp-transport-pool.ts        # McpTransportPool Hauptdatei (~700 LOC)
  mcp-pool-key.ts              # Fingerprint + canonicalize Helfer (~150 LOC)
  mcp-pool-entry.ts            # PoolEntry: refcount + drain + health + generation (~500 LOC)
  session-mcp-view.ts          # SessionMcpView: filter + register tools/prompts (~200 LOC)
  mcp-pool-events.ts           # PoolEvent diskriminierte Union (~80 LOC)
  pid-descendants.ts           # listDescendantPids plattformübergreifend (~150 LOC, inkl. Tests)

packages/core/src/tools/
  mcp-transport-pool.test.ts   # ~900 LOC
  mcp-pool-entry.test.ts       # ~400 LOC
  session-mcp-view.test.ts     # ~250 LOC
  mcp-pool-key.test.ts         # ~150 LOC
  pid-descendants.test.ts      # ~200 LOC (Unix + Windows skip-gated)
```

**Geänderte Dateien:**

```
packages/core/src/tools/mcp-client.ts            # discoverAndReturn() aufgeteilt; connectToMcpServer vereinheitlicht
packages/core/src/tools/mcp-client-manager.ts    # optionaler Pool-Parameter; Budget-Zustand konditional
packages/core/src/tools/tool-registry.ts         # fädelt Pool von Config in McpClientManager ein
packages/core/src/config/config.ts               # setMcpTransportPool / getMcpTransportPool
packages/cli/src/acp-integration/acpAgent.ts     # QwenAgent.mcpPool-Konstruktion; broadcastBudgetEvent;
                                                 # newSessionConfig verdrahtet Pool in Config;
                                                 # killSession ruft pool.releaseSession auf
packages/cli/src/serve/run-qwen-serve.ts           # übergibt --mcp-pool-transports + Budget-Umgebung an ACP-Kind
packages/cli/src/serve/httpAcpBridge.ts          # buildWorkspaceMcpStatus liest Pool;
                                                 # restartMcpServer extMethod gibt RestartResult[] zurück
packages/cli/src/serve/capabilities.ts           # wirbt mcp_workspace_pool an
packages/sdk/src/daemon/mcpEvents.ts             # scope?: optionales Feld; isWorkspaceScopedBudgetEvent Helfer
```

---

## 19. Ein-PR-Auslieferung — Commit-Aufteilung (V21-1)

Gemäß der Richtlinie des Maintainers für funktionskohärente Batches (#4175 Branching-Strategie 2026-05-19) wird F2 als **ein PR mit 6 atomaren Commits** ausgeliefert. Der Reviewer kann mit `git log -p HEAD~6..HEAD` Schritt für Schritt vorgehen und Commit für Commit prüfen.

| Commit # | Titel                                                                                         | Umfang                                                                                                                                                                                                                                                                                                                                                                                                                  | Betrifft                                                                                                                  |
| -------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 1        | `refactor(core): McpClient.discover in reine Tool-/Prompt-Liste aufteilen und Connect-Pfade vereinheitlichen` | `discoverAndReturn()` hinzugefügt; gemeinsames `establishConnection()` extrahiert, das sowohl von `McpClient.connect()` als auch von der `connectToMcpServer()`-Factory verwendet wird; Legacy `discover()` wird dünner Wrapper, der registriert (bewahrt eigenständiges qwen-Verhalten). Keine beobachtbare Verhaltensänderung.                                                                                      | `mcp-client.ts`, `mcp-client.test.ts`                                                                                    |
| 2        | `feat(core): McpTransportPool + SessionMcpView`                                               | Pool-Kern: `fingerprint`, refcount, `spawnInFlight`-Deduplizierung, `sessionToEntries`-Rückwärtsindex, Drain-Zustandsmaschine, Snapshot-Wiedergabe bei Anhang, Generation-Guard, Tool+Prompt duales Fan-out, pro-Session-Kopieren von trust. McpClient für Unit-Tests gemockt. Keine Produktionsverdrahtung.                                                                                                            | neue `mcp-transport-pool.ts`, `mcp-pool-key.ts`, `mcp-pool-entry.ts`, `session-mcp-view.ts`, `mcp-pool-events.ts` + Tests |
| 3        | `feat(core): plattformübergreifender Abstiegs-PID-Sweep + Pool-Health-Monitor`                 | `listDescendantPids` (Unix `pgrep -P` rekursiv, Windows PowerShell CIM); vereinheitlichter Health-Monitor innerhalb von `PoolEntry` (Intervallprüfung + Fehlerzähler + Wiederverbindungs-Backoff gemäß §6.6); Subprozess-Spawn-Integrationstests gated auf `QWEN_INTEGRATION === '1'`.                                                                                                                                   | neue `pid-descendants.ts` + Tests; `mcp-pool-entry.ts`                                                                    |
| 4        | `feat(serve): McpTransportPool in QwenAgent-Daemon-Modus einbinden`                           | `Config.setMcpTransportPool` + `getMcpTransportPool`; `ToolRegistry` fädelt Pool in `McpClientManager` ein; `McpClientManager` optionaler `pool?`-Konstruktorparameter; `acpAgent.QwenAgent` konstruiert Pool bei Initialisierung; `newSessionConfig`-Injektion; `killSession` ruft `pool.releaseSession` auf; SDK MCP + HTTP/SSE umgehen via `createUnpooledConnection`; CLI-Flags `--mcp-pool-transports`, `--mcp-pool-drain-ms`, `--no-mcp-pool`. | `config.ts`, `tool-registry.ts`, `mcp-client-manager.ts`, `acpAgent.ts`, `run-qwen-serve.ts`                               |
| 5        | `feat(serve): Pool-bewusste Status- und Neustart-Routen`                                       | `QwenAgent.getMcpPoolAccounting` extMethod; `httpAcpBridge.buildWorkspaceMcpStatus` Pool-zuerst + Bootstrap-Session-Fallback; `restartMcpServer` akzeptiert `?entryIndex=` und gibt `RestartResult[]` zurück; `entryCount` + `entrySummary[].entryIndex` auf Zelle; Capability-Tags `mcp_workspace_pool` + `mcp_pool_restart`.                                                                                         | `httpAcpBridge.ts`, `capabilities.ts`, SDK-Typen                                                                          |
| 6        | `feat(serve): MCP-Budget-Schutzmechanismen auf Workspace-Bereich heben`                       | `tryReserveSlot`/`releaseSlotName`/Hysterese-Zustandsmaschine von `McpClientManager` in den Pool verschieben; pro-Session `setMcpBudgetEventCallback`-Verdrahtung in `acpAgent.newSessionConfig` entfernen; `QwenAgent.broadcastBudgetEvent` Fan-out; Snapshot-Zelle `scope: 'workspace'`; SDK `scope?`-additives Feld; `isWorkspaceScopedBudgetEvent`-Helfer; Inline-Dokumentationsaktualisierungen.                    | `mcp-transport-pool.ts`, `mcp-client-manager.ts`, `acpAgent.ts`, `httpAcpBridge.ts`, SDK                                 |

**Gesamte LOC-Schätzung**: ~4100 Produktion + ~1900 Tests = ~6000 LOC (v2-Schätzung ~3850; Wachstum absorbiert V21-Korrekturen).

**Merge-Ziel**: einzelner PR in `daemon_mode_b_main`. Periodischer Batch-Merge nach `main` gemäß #4175-Strategie.

**Selbstreview-Prozess vor PR-Eröffnung**:

1. Nach jedem Commit `code-reviewer`-Agent auf dem Commit-Diff ausführen; übernommene Erkenntnisse in denselben Commit einarbeiten
2. Für Commit 2/4/6 (höchstes Designrisiko) zusätzlich `silent-failure-hunter` + `type-design-analyzer` ausführen
3. Nachdem alle 6 Commits eingespielt sind: 3 vollständige Review-Durchgänge durch verschiedene Agent-Kombinationen auf dem gesamten PR-Diff
4. Vollständige Test-Suite + Typcheck + Lint über alle betroffenen Pakete ausführen

Spiegelt das spezialisierte Prereview-Muster von PR 21 wider.

---

## 20. Capability-Tags + SDK-Vertragsänderungen

### 20.1 Neue Capability-Tags (atomar in v0.16 beworben, V21-1)

Da F2 als ein PR ausgeliefert wird, werden alle drei Tags zusammen beworben. Pool-Konsumenten können davon ausgehen: **`mcp_workspace_pool` beworben ⇒ Felder `entryCount`/`entrySummary`/`scope?` alle vorhanden**; keine pro-Feld-Capability-Prüfung erforderlich.

| Tag                        | Wann beworben                                                                                        | Bedeutung                                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `mcp_workspace_pool`       | Wenn `QwenAgent.mcpPool !== undefined` (immer wahr im Daemon-Modus, außer `--no-mcp-pool`-Killswitch) | `GET /workspace/mcp` spiegelt Pool-Zustand wider; Felder `entryCount` + `entrySummary` vorhanden         |
| `mcp_pool_restart`         | Immer wenn `mcp_workspace_pool` aktiv ist                                                              | `POST /workspace/mcp/:server/restart` akzeptiert `?entryIndex=` und kann `entries: RestartResult[]` zurückgeben |
| (erweitert `mcp_guardrails`) | unverändert                                                                                              | Gleicher Tag, Payload um `scope` erweitert (`'workspace'` unter F2)                                       |

### 20.2 SDK-additive Oberfläche

```ts
// @qwen-code/sdk — nur additiv
export interface DaemonMcpBudgetWarningData {
  // bestehende Felder...
  scope?: 'workspace' | 'session'; // NEU — fehlt auf alten Daemons (bedeutet 'session')
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

### 21.1 Pool-Schlüssel (F2-2)

- Gleiche Konfiguration → gleicher Schlüssel (Env-Key-Permutation stabil, Header-Key-Permutation stabil)
- Env-Wert um 1 Byte unterschiedlich → anderer Schlüssel
- Header `Authorization`-Wert unterschiedlich → anderer Schlüssel
- `includeTools`/`excludeTools`/`trust` mutiert → GLEICHER Schlüssel (pro-Session-Filter)
- Zwei `new MCPServerConfig(...)` mit identischem Inhalt → gleicher Schlüssel (kanonischer Hash, nicht Identität)

### 21.2 Lebenszyklus (F2-2)

- 3 Sessions erwerben denselben Schlüssel → 1 Spawn (überprüfen via Spy auf `client.connect`)
- Freigabesequenz n,n-1,...,1 → Drain-Timer startet nur bei 1→0
- 30s Drain: Erwerb bei 25s bricht Timer ab; Erwerb bei 35s erzeugt neuen Eintrag
- `MAX_IDLE_MS` (5 Min.) harter Schließen auch bei flappendem Drain
- Spawn schlägt während „in flight" fehl: alle Wartenden erhalten Fehler; Slot freigegeben; kein Eintrag gespeichert

### 21.3 Gleichzeitiger Erwerb (F2-2)

- 5 gleichzeitige `acquire(sameKey)` während kein Eintrag existiert → genau 1 `spawnEntry`-Aufruf, alle 5 erhalten denselben Eintrag
- Spawn lehnt ab → alle 5 Wartenden erhalten denselben Fehler; nachfolgender Erwerb erneut spawn

### 21.4 Pro-Session-Isolation (F2-2)

- Session A `excludeTools: ['foo']`, Session B keine Ausschließung → A's ToolRegistry enthält foo nicht, B schon; beide aus derselben `toolsSnapshot`
- Session A `trust: true`, Session B `trust: false` → Session A's `DiscoveredMCPTool.trust === true`, B's `false`; prüfen, dass KEINE gemeinsame Referenz vorliegt (Mutation einer beeinflusst nicht die andere)
- Session A erwirbt Prompt-only-Server → A's PromptRegistry befüllt, ToolRegistry für diesen Server leer

### 21.5 Tool-/Prompt-Liste geändert (F2-2)

- Server sendet `notifications/tools/list_changed` → `applyTools` aller Abonnenten mit neuem Snapshot aufgerufen
- Veralteter Handler aus vorheriger Wiederverbindungsgeneration überschreibt Snapshot NICHT
- `notifications/prompts/list_changed` analog

### 21.6 Absturz + Wiederverbindung (F2-2)

- Subprozess via `process.kill` töten → Abonnenten erhalten `disconnected`-Ereignis
- 3 Wiederverbindungsversuche (unter Verwendung der bestehenden `MCPHealthMonitorConfig`) → Erfolg → `reconnected` + frischer Snapshot
- Erschöpfte Wiederholungen → alle Abonnenten erhalten `failed`; Eintrag wechselt in `failed`-Zustand; neue Erwerbe versuchen es einmal erneut, werfen dann Fehler

### 21.7 Abstiegs-PID-Sweep (F2-2b)

- Linux/macOS: `bash -c "sleep 60 & sleep 60"` als stdio-Befehl spawnen → Root töten → überprüfen, dass beide Nachkommen bereinigt sind (`/proc/<pid>/status` Poll, oder `kill(0, pid) === false`)
- Windows: `cmd /c "ping -t localhost"` Wrapper spawnen → töten → überprüfen, dass ping-Subprozess weg
- `pgrep` nicht verfügbar (PATH fehlt) → sanfte Degradierung: Warnung loggen, nur SIGTERM an Root, nicht abstürzen

### 21.8 Budget auf Workspace-Bereich (F2-4)

- 4 Sessions × `--mcp-client-budget=2` mit 3 statischen MCP-Servern → Workspace-Gesamtsumme = 3 (nicht 12); Snapshot-Zelle `scope: 'workspace'`, `liveCount: 3`
- Budget-Warnung feuert einmal pro 75%-Aufwärtsüberschreitung über den gesamten Workspace; sendet gleichzeitig an alle 4 Sessions
- Hysterese-Wiederbewaffnung: Abfall auf 37,5% → nächste Überschreitung feuert erneut

### 21.9 Rückwärtskompatibilität (F2-3)

- Eigenständiges `qwen` (kein Daemon) → `mcpPool === undefined` → alle bestehenden `mcp-client-manager.test.ts`-Tests bestehen unverändert
- `--no-mcp-pool`-Daemon-Flag → fällt auf pro-Session zurück, alle bestehenden Daemon-E2E-Tests bestehen

### 21.10 Credential-Isolation (F2-3)

- Session A injiziert `{name: 'github', headers: {Authorization: 'Bearer tokenA'}}`, Session B `tokenB` → 2 separate Prozesse; überprüfen durch Snapshot `entryCount: 2`; überprüfen, dass A's Tool-Aufrufe durch A's Transport gehen (durch Header-Inspektion in stdin/log)

### 21.11 LoadSession / Wiederaufnahme (F2-3)

- Session schließt → Drain startet → Wiederaufnahme innerhalb von 30s → Pool-Eintrag wiederverwendet (kein Kaltstart, bestätigt via `client.connect` Spy-Zähler)
- Wiederaufnahme nach 30s aber vor Ablauf des Restore-Window → Pool-Kaltstart; restoreState-Inhalt bleibt erhalten

### 21.12 Restart-Route (F2-3b)

- 1 Eintrag für Name → `POST /workspace/mcp/foo/restart` gibt Legacy-Form `{restarted: true, durationMs}` zurück
- 2 Einträge für Name (verschiedene Fingerprints) → gibt `{entries: [{fingerprint, restarted, ...}, ...]}` zurück
- Neustart während ein anderer Neustart läuft → zweiter Aufruf gibt dasselbe Promise zurück (dedupliziert)
- Neustart, wenn Budget überschritten würde → `{restarted: false, skipped: true, reason: 'budget_would_exceed'}` pro Eintrag

### 21.13 Status-Route (F2-3b)

- Leerlauf-Daemon (keine Sessions), aber Pool hat zwischengespeicherte Einträge von vorheriger Session → `GET /workspace/mcp` gibt `initialized: true` mit Live-Erfassung zurück
- Bootstrap-Session existiert nicht → Fallback auf Pool-direkten Pfad; kein Fehler
- Pool-Abfrage schlägt fehl → Fallback auf Bootstrap-Session-Pfad; Snapshot stürzt nie ab

### 21.14 SDK-Reducer (F2-4)

- `mcpBudgetWarningCount` erhöht sich gleichzeitig bei allen abonnierenden Sessions, wenn Workspace-Ereignis gesendet wird
- `isWorkspaceScopedBudgetEvent(e)` identifiziert Bereich korrekt aus Payload
- Alter Daemon (kein `scope`-Feld) → standardmäßig auf 'session'-Interpretation

### 21.15 Hot Config Reload (F2-3)

- Während des Betriebs Änderung an settings.json → alte Session behält alten Eintrag, neue Session erstellt neuen Eintrag, beide koexistieren; alter drainet natürlich, wenn letzte alte Session schließt
- 0 Sessions nachdem alte Session geschlossen hat → Drain-Timer feuert → alter Eintrag GC'd → nur neuer Eintrag bleibt

### 21.16 Abschalt-Reihenfolge (F2-3)

- `QwenAgent.close()` löst in Reihenfolge aus: Annehmen stoppen → Eingabeaufforderungen drainen → Sessions schließen → `pool.drainAll` → keine Zombie-PIDs in `pgrep -P <acpChildPid>` nach Beenden
---
## 22. Offene Fragen

V21 hat Q1/Q3/Q4/Q6 in den Designvorgaben festgelegt (Einzel-PR-Auslieferung). Q2/Q5/Q7/Q8/Q9 bleiben offen.

| #     | Frage                                                                                                                         | F2-Designvorgabe                                                                         | Entscheidung erforderlich vor |
| ----- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------- |
| Q1 ✅ | SDK-Reducer-Feldnamen – umbenennen oder beibehalten?                                                                          | **FESTGELEGT v2.1**: `mcpBudgetWarningCount` etc. mit erweiterter Scope-Semantik im JSDoc beibehalten | erledigt                      |
| Q2    | `mcp_workspace_pool`-Fähigkeit – `protocolVersions` erhöhen ('v1' → 'v1.1') oder additiv bei 'v1' bleiben?                    | **Additiv bei 'v1' bleiben** (konsistent mit PR-14b-Präzedenzfall)                       | Commit 5                      |
| Q3 ✅ | `--no-mcp-pool`-Flag – standardmäßig aktiv oder opt-in?                                                                       | **FESTGELEGT v2.1**: standardmäßig aktiv; `--no-mcp-pool` ist Kill-Schalter              | erledigt                      |
| Q4 ✅ | HTTP/SSE-Standard – Pool aus oder an?                                                                                         | **FESTGELEGT v2.1**: Pool aus; opt-in über `--mcp-pool-transports`                       | erledigt                      |
| Q5    | `POST /workspace/mcp/reload-all` – in F2 aufnehmen oder als Folge?                                                            | **Als Folge**                                                                             | n/a (zurückgestellt)          |
| Q6 ✅ | Lazy Pool-Konstruktion – lohnt sich die Bedingung?                                                                            | **FESTGELEGT v2.1**: eager (immer im `QwenAgent`-Konstruktor konstruieren)                | erledigt                      |
| Q7    | `restoreState`-Fenster vs. Pool-Drain – getrennt lassen, angleichen oder aus den Einstellungen lesen?                         | **Getrennt mit 30s Standard** + Konfigurationsknopf `--mcp-pool-drain-ms`                 | Commit 4                      |
| Q8    | OAuth-Handling – F3-Verschiebung bestätigen, Workaround dokumentieren?                                                        | **Auf F3 verschoben**, Workaround `/mcp auth <name>` dokumentieren                        | Commit 4                      |
| Q9    | `entrySummary`-Offenlegung – immer einbinden oder hinter einem verbose-Flag?                                                  | **Immer einbinden** (kleines Payload, nützlich für Betrieb)                               | Commit 5                      |
| Q10   | `codeagents/qwen-code-daemon-design/02-architectural-decisions.md` Entscheidung #3 – mit @wenshao abstimmen?                  | F2-PR-Beschreibung verlinkt codeagents-PR; zwei PRs werden unabhängig reviewed           | PR offen                      |

---

## 23. Risiken

### Hoch

- **R1 (A2 globaler Zustand)**: Kollision von `serverStatuses` bei mehreren Einträgen mit gleichem Namen. Abgemildert durch Aggregat-Status-Funktion; Restrisiko: SDK-Konsumenten lesen die rohe globale Map (unwahrscheinlich – nur über Accessor `getMCPServerStatus(name)` genutzt).
- **R2 (PromptRegistry-Symmetrie)**: Auslassen des Prompt-Fan-Outs in einem Codepfad lässt stumm Prompts verschwinden. Abgemildert durch F2-2-Test 21.4 dritter Aufzählungspunkt + Integrationstest, der Prompt-Parität gegenüber vor F2 bestätigt.
- **R3 (HTTP-Transport-Zustandsübertragung)**: Bei opt-in HTTP-Pool für einen Server, der pro-Transport-Zustand verwaltet, werden Sitzungskontexte beschädigt. Abgemildert durch Standard-aus + Dokumentation; automatische Erkennung nicht möglich.

### Mittel

- **R4 (Pfadvereinheitlichung F2-1)**: Fabrikmethode `connectToMcpServer` und Klasse `McpClient` haben subtile Verhaltensunterschiede (z.B. Fähigkeiten, die zum Konstruktionszeitpunkt vs. Verbindungszeitpunkt angekündigt werden). Abgemildert dadurch, dass F2-1 ein reiner Refactor-PR mit vollständiger Regressionsabdeckung vor Beginn der Pool-Arbeit ist.
- **R5 (Windows-Child-PID)**: PowerShell `Get-CimInstance` kann langsam sein (Spawn-Kosten) oder durch AppLocker blockiert werden. Abgemildert durch 2s Timeout + Graceful Degradation.
- **R6 (Pool-Event-Broadcast-Verstärkung)**: Fan-Out einer Budget-Warnung an 100 Sitzungen führt zu 100 extNotification-Aufrufen in enger Schleife. Abgemildert durch `Promise.all`-Parallelisierung + pro-Sitzung-catch (bestehendes PR-14b-Muster).

### Niedrig

- **R7 (Fingerabdruck-Stabilität über MCPServerConfig-Versionen)**: Zukünftige Felder in `MCPServerConfig`, die nicht im Fingerabdruck enthalten sind, würden stillschweigend falsches Sharing erlauben. Abgemildert durch explizite Kanonikalisierungsfunktion + Test, der alle `MCPServerConfig`-Felder aufzählt und Abdeckung bestätigt.
- **R8 (Generationenzähler-Rennbedingungen)**: Schnelle Neustart-Zyklen könnten die JS-Zahlenpräzision erschöpfen (≈ 2^53 = ~285k Jahre bei 1/Sek.). Kein praktisches Problem.

### Einzel-PR-spezifisch (V21-14)

- **R9 (Review-Ermüdung bei ~6000 LOC Einzel-PR)**: Reviewer-Bandbreite wird zum Engpass. F3 ist blockiert bis F2 gemerged → blockiert andere Mitwirkende. Abmilderung: (a) Pre-Review mit 3 Spezialagenten und Zusammenlegen von P0/P1 vor Öffnung, analog zum Muster von PR 21; (b) Strukturierung in 6 atomare Commits, damit der Reviewer schrittweise vorgehen kann; (c) Koordination des Review-Fensters mit @wenshao im Voraus via #4175-Kommentar.
- **R10 (`daemon_mode_b_main`-Mergekonflikt-Akkumulation)**: F2 berührt `acpAgent.ts`, `httpAcpBridge.ts`, `capabilities.ts`, `mcp-client*.ts` – alles Hot Paths. F3/F4-Mitwirkende, die gleichzeitig landen, riskieren Konflikte während des 1–2-wöchigen Review-Fensters von F2. Abmilderung: tägliches `git rebase origin/daemon_mode_b_main`; Koordination via #4175-Update, dass F2 in Bearbeitung ist + Bitte an F3/F4, Hot-File-Änderungen bis zum F2-Merge zurückzustellen.
- **R11 (CI-Ausführungszeit)**: ~1900 LOC neue Tests inklusive Subprozess-Spawn + plattformübergreifender PID-Sweep könnten CI von 30min auf 50min erhöhen. Abmilderung: (a) Subprozess-Tests hinter `process.env.QWEN_INTEGRATION === '1'` verbergen, Teilmenge in PR-CI + vollständiger Satz in nächtlichen CI; (b) Vitest-Parallelität ≥ 4; (c) Windows-PID-Sweep-Tests überspringen, nur auf GHA-Windows-Runner.

---

## 24. Dokumentationsaktualisierungen

| Dokument                                                                       | Aktualisierung                                                                                                                                                  | Zeitpunkt                                  |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `codeagents/qwen-code-daemon-design/02-architectural-decisions.md`             | Entscheidung #3 „MCP-Server-Lebensdauer": aktuell „pro Sitzung"; aktualisieren auf „im Workspace-Pool mit Config-Hash-Key unter Daemon-Modus; pro Sitzung eigenständig" | F2-3 merged (Koordination mit @wenshao codeagents-PR) |
| `codeagents/qwen-code-daemon-design/06-roadmap.md`                             | Wave 5 PR 23 → als F2-Serie markieren; zu PRs verlinken                                                                                                        | F2-3 merged                                |
| `packages/cli/src/serve/README.md` (falls vorhanden) oder neues `docs/serve/mcp-pool.md` | Neuer Abschnitt: Pool-Semantik, Fingerabdruck-Schlüssel, Transport-Opt-in, Neustartsemantik, Status-Snapshot-Interpretation                                            | F2-3b                                      |
| `packages/sdk/README.md`                                                       | Feld `scope?` bei Guardrail-Events, `entryCount` bei Server-Status, Hilfsfunktion `isWorkspaceScopedBudgetEvent`                                                | F2-4                                       |
| Issue #4175 Body                                                               | F2-Eintrag mit Sub-PR-Tabelle aktualisieren, Link zu Design v2 (dieses Dokument)                                                                                | Vor F2-1-Öffnung                           |
| Issue #3803 Body                                                               | Zeile Entscheidung #3: „Aktuell pro Sitzung" → „Workspace-Pooled unter Daemon (F2)"                                                                             | Nach F2-3-Merge                            |
| `acpAgent.ts:869-936` Inline-Kommentar                                         | Vorwärtsreferenz „Wave 5 PR 23" entfernen; aktualisieren auf „durch F2 zu `scope: 'workspace'` hochgestuft"                                                    | F2-4-PR                                    |
| CHANGELOG / Release Notes (Wave 6 / F5)                                       | Schlagzeile: „MCP-Prozesse werden jetzt über Sitzungen in einem Workspace geteilt"                                                                              | F5-Release                                 |

---

## 25. PR-Beschreibungsvorlage (Einzel-PR-Auslieferung)

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

F2 v2.1 = einzelner PR mit 6 atomaren Commits (~6000 LOC), Ziel `daemon_mode_b_main`. Zentrale Designpfeiler:

1. **`McpTransportPool`** in `packages/core` (ACP-Child-Seite), workspace-bezogen, Referenzzählung + 30s Drain
2. **Fingerabdruck-Schlüssel** SHA-256 über kanonische Konfiguration inklusive Umgebungsvariablen/Header (claude-code-Muster), ohne pro-Sitzung-Filter (includeTools/trust)
3. **`SessionMcpView`** pro-Sitzung Tool+Prompt-Registry-Projektion mit Trust-Kopie
4. **Snapshot-Reply + Generationenschutz** für Attach-Race-Zustand und veraltete Benachrichtigungen
5. **Plattformübergreifender Descendant-PID-Sweep** (opencode-Muster + Windows-Port)
6. **HTTP/SSE-Opt-in**, SDK-MCP-Umgehung, OAuth auf F3 verschoben
7. **Budget-Statusmaschine** wird auf Workspace-Scope hochgestuft; Snapshot-Zelle + Push-Events werden additiv erweitert (`scope?`)
8. **Status + Neustart-Routen** umgestaltet: Pool-first mit Bootstrap-Sitzung-Fallback; `entryCount` + `RestartResult[]`

**Offene Fragen Q1–Q10** in §22 benötigen Maintainer-Entscheidungen, bevor die entsprechenden Sub-PRs geöffnet werden. Empfehlung: Q1–Q4 vor F2-3-Beginn zu klären (diese geben die grobe Richtung vor); Q5–Q10 können schrittweise gelöst werden.