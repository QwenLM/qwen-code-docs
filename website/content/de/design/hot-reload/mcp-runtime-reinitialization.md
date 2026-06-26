# MCP Runtime Hot-Reload Design: Settings-gesteuerte inkrementelle Wiederverbindung (Issue #3696 Sub-task 3)

> [!note]
> Der ursprüngliche Umfang von Sub-task 3 ist „MCP/LSP Runtime Reconnect“; dieser MR liefert **nur MCP**. Für LSP bleibt nur eine Skizze + TODO in Teil C, verschoben auf einen späteren MR.

## Kontext

Issue #3696 ist das übergeordnete Tracking-Issue für das Hot-Reload-System. Sub-task 1
(`SettingsWatcher` Dateiänderungserkennung) ist gemerged, hat aber **noch keinen Abonnenten** –
`gemini.tsx:784` startet den Watcher, und das [Sub-task 1 Design](./settings-change-detection.md)
hat das Verknüpfen von Listenern explizit den Sub-tasks 2–6 überlassen. Heute führt das Hinzufügen/Entfernen/Bearbeiten eines MCP-Servers
in `settings.json` (oder das Installieren einer Erweiterung) dazu, dass die gesamte Sitzung neu gestartet werden muss, wobei der Gesprächskontext verloren geht.

Dieser MR konzentriert sich auf **MCP** und liefert zwei Dinge: (a) einen Runtime-Einstiegspunkt, der
neugeladene Einstellungen in das laufende `Config` schiebt; (b) MCP-inkrementelle Wiederverbindung, gesteuert durch
`SettingsWatcher`. LSP-Runtime-Wiederverbindung gehört zu diesem Sub-task, ist hier aber nicht implementiert,
es bleibt nur ein Teil-C-TODO.

**Kernbeobachtung**: Der „Reconnect by Diff“-inkrementelle Abgleich existiert bereits im Code
(Single-Session `discoverAllMcpToolsIncremental`, Shared-Pool `runDiscoverAllMcpToolsViaPool`,
die nur geänderte Server anhand ihres `connectionIdOf`-Fingerabdrucks berühren). Die einzige Lücke ist, dass
`Config` seinen Einstellungs-Snapshot nach dem Start nicht aktualisieren kann (`addMcpServers()` wirft,
`config.ts:3200`). Das Hinzufügen dieses Runtime-Einstiegspunkts ist **Teil A**; das Auslösen durch den Watcher
ist **Teil B** – das ist der gesamte Inhalt dieses MR. Zwei feste Kompromisse: den bestehenden inkrementellen
Abgleich wiederverwenden statt der Vollwischung `restartMcpServers()` (die eine „0 Tools“-Lücke verursacht); und der
Shared-Pool-Pfad muss die `isMcpServerPendingApproval`-Genehmigungsschleuse hinzufügen, um dem
Single-Session-Pfad zu entsprechen (Teil A Punkt 4). Siehe „Architektur“ unten für die Komponentenübersicht und
„Design“ für den schrittweisen Ablauf und Details.

---

## Architektur

In einem Satz: **den bereits existierenden inkrementellen Abgleich auf Settings-Dateiänderungen aufschalten** und
die Vertrauensgrenze sowie das UI-Feedback entlang des Weges ergänzen. Die Änderung gliedert sich nach Verantwortung
über die CLI-/Core-Pakete, entkoppelt durch `Config`-Methoden und ein UI-Event:

```text
                    CLI package                                  Core package
 ┌──────────────────────────────────────────┐       ┌────────────────────────────────────┐
 │ SettingsWatcher  (sub-task 1, merged)      │       │ Config                              │
 │   └─[Part B] hot-reload.ts                  │ calls │   └─[Part A] reinitializeMcpServers │
 │       when to fire · recompute gating · gate│ ────▶ │       setMcpServers + incr. reconcile│
 │                                             │       │         (McpClientManager pool/single)│
 │   └─[Part D] useMcpApproval · approval modal │ ◀──── │   └─[Part A④] pool-path pending gate │
 │       mid-session pending → re-prompt        │ event │                                     │
 │   └─[Part E] /mcp status view                │       └────────────────────────────────────┘
 │       show "skipped due to approval" reason  │
 └──────────────────────────────────────────┘
```

- **Schichtungsprinzip**: Core darf `settings.json` / Watcher-Semantik nicht verstehen.
  „Wann auslösen“ gehört zum CLI (Teil B), „wie aktualisieren + abgleichen“ gehört zu Core
  (Teil A), konsistent mit Sub-task 1; Teil B ist der einzige Konsument von Teil A und interagiert nur
  über `Config`-Methoden.
- **Hauptpfad**: Settings-Änderung → Teil B baut die gewünschte Liste + Sperrlisten neu auf,
  verzögerte Schleuse → ruft Teil A auf → Core-inkrementeller Abgleich (einschließlich der Pool-Pfad-Genehmigungsschleuse) →
  emittiert `mcp-client-update`, um Statusindikatoren zu aktualisieren.
- **Genehmigungszweig**: Wenn der Abgleich einen gesperrten Server als `ausstehend` hinterlässt, löst Teil D
  den Genehmigungsdialog über das `McpPendingApprovalChanged`-Ereignis aus; der Überspringungsgrund wird von Teil E in der
  `/mcp`-Ansicht angezeigt.
- **Harte Voraussetzung**: Die drei Schema-Schlüssel `mcpServers` / `mcp.allowed` / `mcp.excluded` müssen
  auf hot-reloadbar umgestellt werden, sonst verschluckt die „Neustart erforderlich“-Unterdrückungsschleuse des Watchers
  MCP-only-Bearbeitungen und die gesamte Kette bleibt träge (siehe den ⚠️-Hinweis am Anfang von „Design“).

| Teil  | Verantwortung                                                                                                                                 | Layer      | Status          |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | --------------- |
| **A** | `Config` runtime-aktualisierbare MCP-Konfiguration + inkrementeller Abgleich + Pool-Pfad-Genehmigungsschleuse                                   | Core       | dieser MR       |
| **B** | Watcher abonnieren, Sperrung neu berechnen, verzögerte Schleuse, Teil A aufrufen                                                               | CLI        | dieser MR       |
| **C** | LSP reinitialize                                                                                                                               | Core       | TODO (späterer MR) |
| **D** | Ausstehende Server während der Sitzung lösen den Genehmigungsdialog aus (und behebt vergessenen Prompt #6)                                      | CLI        | Follow-up       |
| **E** | `/mcp` zeigt den „Übersprungen aufgrund von Genehmigung“-Grund an                                                                               | CLI        | Follow-up       |
| **F** | Admissionssemantik: CLI-Allowlist ist eine obere Schranke, `mcp.allowed: []` = Alles verbieten, und Tool-not-found erklärt _warum_ ein Server nicht verfügbar ist | CLI + Core | Follow-up       |

„Design“ unten gibt den schrittweisen Datenfluss von der Festplattendatei zur Live-Verbindung, plus die
Implementierungsdetails jedes Teils.

---

## Design

Das folgende Diagramm zeigt den vollständigen Datenfluss einer Settings-Änderung von der „Festplattendatei“ bis zur
„Verbindung tritt in Kraft“ (`[CLI]` = Teil B, `[Core]` = Teil A, `[sub-task 1]` = der gemergte Watcher):

```text
① Benutzer bearbeitet .qwen/settings.json (mcpServers oder mcp.excluded / mcp.allowed hinzufügen/entfernen/bearbeiten)
       │
       ▼
② [sub-task 1] SettingsWatcher erkennt die Dateiänderung
       │   · 300ms Entprellen: aufeinanderfolgende Speicherungen zusammenfassen
       │   · Ganzdatei-semantischer Diff: nur benachrichtigen, wenn Inhalt wirklich geändert (Selbstschreiben / reine Formatierung → keine Benachrichtigung)
       ▼
③ [CLI · Part B] der von registerMcpHotReload registrierte Callback feuert (jede Settings-Änderung erreicht ihn)
       │
       ├─ a. assembleMcpServers(settings.merged.mcpServers, cwd, topTier)
       │        → Prioritäts-Merge zu vollständiger Serverliste `next` (inkl. .mcp.json / --mcp-config / session)
       ├─ b. Verbindungssperrlisten nextGating = { excluded, allowed, pending } neu berechnen
       └─ c. Schleuse: mcpServersEqual(old, next) UND mcpGatingEqual(old, nextGating) beide „unverändert“
                → frühe Rückkehr (Theme / Skills und andere MCP-irrelevante Bearbeitungen ignorieren)
       │ (nur fortfahren, wenn sich mcpServers ODER die mcp-Sperrlisten geändert haben ↓)
       ▼
④ [CLI→Core] Sperrlisten zuerst in Config schieben (Discovery liest sie während des Abgleichs):
       config.setExcludedMcpServers / setAllowedMcpServers / setPendingMcpServers
       │
       ▼
⑤ [Core · Part A] config.reinitializeMcpServers(next)
       │   (eingeschlossen durch eine „Reconcile läuft“-Sperre, um Wettläufe mit /reload zu vermeiden)
       ├─ a. setMcpServers(next): Settings-Layer-Snapshot ersetzen (Erweiterungs-/Runtime-Layer unberührt)
       └─ b. discoverAllMcpToolsIncremental: Abgleichsstil inkrementeller Abgleich
                · connectionIdOf-Fingerabdruck jedes Servers berechnen, „gewünscht“ vs. „online“ vergleichen
                · hinzugefügt → verbinden; entfernt → trennen + Tools/Prompts löschen;
                  Fingerabdruck geändert → trennen + alte Tools/Prompts löschen, dann mit neuer Konfiguration neu verbinden; unverändert → behalten
                · deaktivierte / ausstehende / nicht vertrauenswürdige Verzeichnisse überspringen; mcp-client-update emittieren
       │
       ▼
⑥ [CLI · Part B] UI-Abschluss: mcp-client-update aktualisiert die MCP-Statusindikatoren;
       (optional) MCP Prompts geändert → reloadCommands(); set needsRefresh (Sub-task 6)
```

> **Auslösezeitpunkt**: `registerMcpHotReload` läuft nur einmal beim Start (Listener anhängen,
> Entsorger zurückgeben); der registrierte Callback ist es, der **bei jeder Settings-Änderung** über den
> Watcher feuert (d.h. ab Schritt ③) – zu diesem Zeitpunkt wird der Abgleich tatsächlich ausgeführt.

> ⚠️ **Harte Voraussetzung: Drei MCP-Schema-Schlüssel müssen auf hot-reloadbar umgestellt werden (der versteckte
> Schalter in Schritt ②).** Der Watcher hat eine „Neustart erforderlich“-Unterdrückungsschleuse: Wenn **alle**
> von einer Änderung betroffenen Schlüssel `requiresRestart: true` sind, **emittiert er kein Ereignis**.
> Aber `mcpServers` / `mcp.allowed` / `mcp.excluded` waren alle `true` – also feuert eine MCP-only-Bearbeitung nie den Callback und
> Teil B bleibt träge. Dieser MR **muss** diese **drei Blätter** auf `false` setzen; der Elternknoten `mcp`
> und das nur-Startup `mcp.serverCommand` bleiben `true` (Übereinstimmung verwendet `isRestartRequiredKey`
> mit längstem Präfix-Match + `flattenSchema`, Blatt gewinnt). Alle drei sind `showInDialog: false`, also
> ändert das Umschalten nicht die Neustartaufforderung des Settings-Dialogs; der Einflussbereich ist nur der Watcher-Pfad.

Das Folgende beschreibt Teil A (Core-Fähigkeiten), Teil B (CLI-Verkabelung), Teil C (LSP, nur TODO in diesem
MR) der Reihe nach.

### Teil A — Core: Config runtime-aktualisierbar für MCP-Konfiguration machen und inkrementellen Abgleich auslösen

**Datei: `packages/core/src/config/config.ts`**

1. Einen Post-Init-Setter hinzufügen, der den Settings-Snapshot aktualisiert, den der Abgleich liest:

   ```ts
   /**
    * Runtime (Hot-Reload) Ersetzung der Settings-Layer MCP-Server-Map.
    * Im Gegensatz zu addMcpServers() umgeht es die `initialized`-Sperre und ist ein ERSATZ
    * (kein Merge), sodass Entfernungen wirksam werden. Die Runtime-Überlagerung
    * (addRuntimeMcpServer) und Erweiterungsbeiträge bleiben unberührt – getMcpServers()
    * schichtet immer noch darauf auf.
    */
   setMcpServers(servers: Record<string, MCPServerConfig> | undefined): void {
     this.mcpServers = servers;
   }
   ```

   `getMcpServers()` (`:3128`) schichtet bereits Erweiterungen + `runtimeMcpServers` auf
   `this.mcpServers`, sodass das Ersetzen nur des Settings-Layers für Runtime/Extension-Einträge sicher ist.

2. **Verbindungssperrlisten**: Die drei Namenslisten, die entscheiden, ob jeder MCP-Server verbinden darf –
   `excluded` (blockiert), `allowed` (falls gesetzt, verbinden nur diese), `pending` (gesperrte Quelle,
   benötigt Benutzergenehmigung vor dem Verbinden). Diese sind getrennt von `mcpServers` (Serverkonfiguration):
   erstere bestimmen „**ob** verbinden“, letztere „**welche Server und wie**“. Setter für diese
   drei Listen hinzufügen, die `getMcpServers()` / Discovery konsultieren: `setExcludedMcpServers()`
   existiert (`:3167`); `setAllowedMcpServers()` hinzufügen (das Feld ist derzeit `readonly` und wird als
   Filter innerhalb von `getMcpServers()` verwendet) plus einen Setter für das Pending-Approval-Set.

3. Eine leichte Orchestrierungsmethode hinzufügen: zuerst Config aktualisieren, dann den vorhandenen
   inkrementellen Abgleich ansteuern, eingeschlossen durch eine gemeinsame „Reconcile läuft“-Sperre, damit `/reload`
   (Sub-task 5) und der Watcher nicht konkurrieren:

   ```ts
   /**
    * Eine neue Settings-Layer MCP-Map anwenden und Live-Verbindungen inkrementell abgleichen
    * (Hinzugefügte verbinden, Entfernte trennen, Geänderte neu starten; Unveränderte unberührt lassen).
    * Ein Aufruf vor initialize() ist ein sicherer No-Op.
    */
   async reinitializeMcpServers(servers: Record<string, MCPServerConfig> | undefined): Promise<void> {
     this.setMcpServers(servers);
     const registry = this.getToolRegistry();
     await registry.getMcpClientManager().discoverAllMcpToolsIncremental(this);
   }
   ```

   `discoverAllMcpToolsIncremental` prüft bereits `isTrustedFolder()`, behandelt deaktivierte/SDK
   Server und emittiert `mcp-client-update`, um die UI-Statusindikatoren zu aktualisieren. Entfernter Server →
   Freigabe + Tools/Prompts löschen; Fingerabdruck geändert → Freigabe + erneut beziehen; unverändert → behalten.

4. **Die Pending-Approval-Prüfung zum Shared-Pool-Pfad hinzufügen** (Vertrauensgrenze, obligatorisch in diesem
   MR): Der Single-Session-Pfad überspringt Server, die auf Genehmigung warten. Wenn jedoch ein Shared-Pool existiert,
   delegiert `discoverAllMcpToolsIncremental` an `runDiscoverAllMcpToolsViaPool`, und **der Pool-Pfad
   überspringt nur deaktivierte / SDK, nicht `isMcpServerPendingApproval`** (um
   `mcp-client-manager.ts:1461`). Ohne diese Korrektur würde im Daemon / Shared-Pool-Modus ein Hot-Reload, das
   einen gesperrten `.mcp.json`-/Workspace-Server hinzufügt/bearbeitet, eine Pool-Verbindung erwerben und den Prozess
   **vor** der Benutzergenehmigung starten, wodurch die #4615-Genehmigungsschleuse umgangen wird. Korrektur: füge die
   `isMcpServerPendingApproval`-Prüfung im Pool-Pfad **vor dem Erstellen von `desiredIds` und vor dem
   Erwerben** hinzu, sodass ihre Admissionssemantik mit dem Single-Session-Pfad übereinstimmt.

### Teil B — CLI: SettingsWatcher abonnieren → MCP-Abgleich

**Neue Datei: `packages/cli/src/config/hot-reload.ts`**, eingebunden nach
`settingsWatcher.startWatching()` (`:785`) in `gemini.tsx`.

```ts
export function registerMcpHotReload(
  watcher: SettingsWatcher,
  settings: LoadedSettings,
  config: Config,
  topTierMcpServers: Record<string, MCPServerConfig> | undefined,
): () => void {
  return watcher.addChangeListener(async (events) => {
    // Genau so neu aufbauen, wie Config-Boot es tat – einschließlich Top-Tier (CLI/Session)-Quellen.
    const next = assembleMcpServers(
      settings.merged.mcpServers,
      config.getTargetDir(),
      topTierMcpServers,
    );
    // Sperrlisten neu berechnen (excluded/allowed/pending) – [Einstellungen zur Hot-Reload-Zeit gewinnen],
    // siehe die „Admissionshaltung“-Entscheidung unten; pending wird immer gemäß der #4615-Schleuse neu berechnet.
    const nextGating = {
      excluded: recomputeExcluded(settings, next),
      allowed: recomputeAllowed(settings, next),
      pending: recomputePending(settings, next),
    };
    // Schleuse: Abgleich nur, wenn sich mcpServers ODER die mcp-Sperrlisten geändert haben;
    // wenn beide unverändert, frühe Rückkehr (Theme / Skills und andere MCP-irrelevante Bearbeitungen ignorieren).
    const serversChanged = !mcpServersEqual(
      config.getSettingsMcpServers(),
      next,
    );
    const gatingChanged = !mcpGatingEqual(config.getMcpGating(), nextGating);
    if (!serversChanged && !gatingChanged) return;
    // Sperrlisten vor dem Abgleich in Config schieben (Discovery innerhalb von reinitializeMcpServers liest sie).
    config.setExcludedMcpServers(nextGating.excluded);
    config.setAllowedMcpServers(nextGating.allowed);
    config.setPendingMcpServers(nextGating.pending);
    await config.reinitializeMcpServers(next);
    // UI benachrichtigen: MCP Prompts geändert → reloadCommands(); set needsRefresh (Sub-task 6).
  });
}
```

> **Admissionshaltungsentscheidung (bewusst getroffen)**: Hot-Reload lässt **aktuelle Einstellungen _innerhalb_ der
> Startup-`--allowed-mcp-server-names`-Schranke gewinnen** – eine Runtime-Bearbeitung von `mcp.allowed` / `mcp.excluded` in
> `settings.json` wird sofort wirksam, **verengt aber nur die Zulassung, erweitert sie nie über das Launch-Flag hinaus**
> (siehe Teil F für die Oberschrankenregel und die `mcp.allowed: []`-Semantik). Wenn kein
> `--allowed-mcp-server-names`-Flag übergeben wurde, steuern die Einstellungen die Zulassung vollständig. **Die Pending-Approval-Schleuse
> (#4615) gibt niemals nach**, unabhängig davon: Ein gesperrter Server muss immer zuerst genehmigt werden (Teil A Punkt 4).
>
> > _Historie_: Eine frühere Revision ließ eine Runtime-Settings-Bearbeitung die Zulassung über das Startup-Flag hinaus
> > erweitern (das Flag als bloßen Namensfilter-Komfort behandelnd). Ein kritisches Review markierte dies als
> > stilles Aufweichen einer Launch-Zeit-Grenze; Teil F (Punkt K) kehrt es um – das Flag ist jetzt eine
> > unveränderliche Oberschranke.

Vorhandene Helfer wiederverwenden – **nicht** die Merge-Logik neu implementieren:

- `assembleMcpServers(settings.mcpServers, cwd, topTierMcpServers)` –
  `packages/cli/src/config/mcpServers.ts:27` (entsprechend dem Config-Boot-Aufruf in
  `packages/cli/src/config/config.ts:1812`).
- `SettingsWatcher.addChangeListener` gibt eine Abmeldefunktion zurück (`settingsWatcher.ts:253`).
- `config.getSettingsMcpServers()` (`:3124`) als Vorabbild für den `mcpServers`-Diff;
  `config.getMcpGating()` als Vorabbild für den Sperrlisten-Diff (ein kleiner neuer Getter, der
  `{ excluded, allowed, pending }` zurückgibt, gepaart mit den Settern von Teil A).

Die Schleuse verwendet zwei kleine reine Funktionen, um die Auslöseoberfläche einzuschränken (Theme / Skills und
andere irrelevante Bearbeitungen vermeiden, die redundanten Abgleich auslösen, konsistent mit dem eigenen semantischen Diff des Watchers),
beide **verwenden `fast-deep-equal`** (das CLI-Paket muss es von einer transitiven zu einer direkten
Abhängigkeit befördern):

- `mcpServersEqual(a, b)`: Objektschlüsselreihenfolge irrelevant (eliminiert falsch Positive durch Server- /
  Feldreihenfolge), Array-Reihenfolge empfindlich (`args` und andere Befehlsargumentreihenfolge haben Bedeutung);
  `undefined` ≡ `{}`.
- `mcpGatingEqual(a, b)`: `excluded` / `allowed` / `pending` verglichen als **Sets** (Kopien zuerst sortieren);
  `undefined` ≡ `[]`. Es ist genau das, was erlaubt, dass „nur `mcp.excluded` / `mcp.allowed` bearbeiten,
  `mcpServers` unberührt lassen“ trotzdem den Abgleich auslöst – Schließung der Lücke, in der ein Diff nur
  `mcpServers` die Sperrlistenänderungen übersehen würde.

Der UI-Abschluss aktualisiert die Statusindikatoren über das bestehende `mcp-client-update`-Ereignis und setzt
`needsRefresh` bei Bedarf (Sub-task 6). Die Mindestanforderung für diesen Sub-task: Config-Level-Abgleich
abgeschlossen + das bestehende Emit aktualisiert den Status.

### Teil C — LSP reinitialize (in diesem MR nicht implementiert, TODO)

Die LSP-Konfiguration stammt aus `.lsp.json` + Erweiterungskonfiguration (**nicht** `settings.json`), daher wird sie **nicht
automatisch durch SettingsWatcher ausgelöst**; die Runtime-Wiederverbindung sollte manuell durch das spätere `/reload`-Kommando
(Sub-task 5) angestoßen werden. `NativeLspService` (gesperrt durch `--experimental-lsp`) hat bereits
Lebenszyklusmethoden `discoverAndPrepare` / `start` / `stop`, genug, um eine `reinitialize()`-Primitive zu implementieren, die
für `/reload` über `LspClient.reinitialize?()` + `Config.reinitializeLsp()` freigelegt wird,
ohne größere Änderungen.

> **TODO (nächster MR)**: Implementiere `NativeLspService.reinitialize()` und seine Freilegung über
> `Config.reinitializeLsp()`, mit einem detaillierten Design in der Dokumentation dieses MR (einschließlich der Tatsache, dass
> `discoverAndPrepare()` zuerst `clearServerHandles()` aufruft, was einen inkrementellen Diff verhindert, sodass v1
> Stop-All → Start-All verwendet usw.). **Dieser MR enthält keine LSP-Codeänderungen.**

### Teil D — Follow-up: Hot-Reload löst den Runtime-Genehmigungsdialog für gesperrte Server aus (verknüpft mit #4615)

> Dieser Abschnitt wurde hinzugefügt, nachdem Teile A/B gelandet waren, während des Debuggens von „URL eines gesperrten Servers geändert, aber er verbindet sich nicht neu“. Er behebt den Bruch, bei dem „Hot-Reload einen gesperrten Server als ausstehend markiert, aber die UI keinen Genehmigungsdialog zeigt“, und behebt beiläufig einen vergessenen Prompt, der durch die Entscheidungslogik verursacht wurde (Problem #6 unten).

#### Hintergrund: Der Genehmigungsdialog wurde nur einmal beim Start berechnet

Ein Server aus gesperrter Quelle (`project`'s `.mcp.json` und `workspace`'s `.qwen/settings.json`, siehe
`isGatedMcpScope`) hat seine Benutzergenehmigung **an den Konfigurations-Hash gebunden** (`mcpApprovals.ts`'s
`getState`: kein Eintrag oder ein Eintrag, dessen Hash von der aktuellen Konfiguration abweicht → `pending`). Wenn also ein
Hot-Reload die Konfiguration eines gesperrten Servers ändert (auch nur `httpUrl`), macht seine Hash-Änderung die
alte Genehmigung ungültig und er wird wieder `pending`.

Die Teil-A/B-Kette behandelt dies **korrekt**: `recomputeMcpGating` setzt es auf `pending`,
`setPendingMcpServers` schiebt es in die Discovery, und der Abgleich überspringt es (keine Verbindung, Status
`disconnected`). Aber **die UI zeigt keinen Genehmigungsdialog** – die Ursache ist, dass `useMcpApproval`
(das Hook, das den Genehmigungsdialog steuert) seine Warteschlange nur **beim Mount** berechnet über
`useEffect(…, [config])`, und die `config`-Referenz ist über die Sitzung stabil → der Effekt läuft nie erneut. Das bedeutet:

- Core markiert den Server als ausstehend (Discovery überspringt ihn) ✓
- Die UI-Warteschlange für Genehmigungen wird nie neu berechnet → **kein Dialog** ✗ (der Benutzer sieht nur `disconnected`, ohne Möglichkeit zur Genehmigung)
Die beiden Pfade sind zur Laufzeit **getrennt**.

#### Fix: Verbindung von Core→UI über ein Event, Übergabe der Entscheidung an die UI

1. **Event hinzufügen** `AppEvent.McpPendingApprovalChanged` (`packages/cli/src/utils/events.ts`). Da
   `appEvents` in der CLI-Schicht liegt und `hot-reload.ts` ebenfalls dort ist, kann der Listener direkt emittieren, ohne
   **Änderung im Core**.

2. **`hot-reload.ts` emittiert nach dem Reconcile** (platziert nach `await reinitializeMcpServers`, sodass
   `config.getMcpServers()` bereits die neue Map reflektiert; Emit erfolgt unabhängig vom Erfolg/Misserfolg des Reconciles – ein Server, der noch aussteht, benötigt weiterhin eine Benutzerentscheidung).

3. **`useMcpApproval` extrahiert `computePending()`**: Einmal beim Mounten berechnen (bestehendes Verhalten)
   **plus** die Warteschlange neu berechnen, nachdem auf `McpPendingApprovalChanged` gehört wurde → eine nicht-leere
   Warteschlange zeigt das Modal an. `computePending` berechnet aus autoritativen Quellen (der Live-Server-Map
   + der persistierten Genehmigungsdatei) neu, sodass bereits genehmigte / bereits abgelehnte Server nicht erneut
   angefragt werden.

#### Key-Design: Emit anhand von "streng ausstehend", nicht einer Namens-Differenzmenge (Issue #6 / A1-Entscheidung)

Beachten Sie, dass die beiden Prädikate **bewusst unterschiedlich** sind, was den Kern dieses Abschnitts ausmacht:

| Funktion                              | Prädikat                                       | Verwendung                                              |
| ------------------------------------- | ---------------------------------------------- | ------------------------------------------------------- |
| `getPendingGatedMcpServers`           | `state !== 'approved'` (**inkludiert rejected**) | Versorgt Discovery: rejected muss weiterhin **übersprungen** werden |
| `getPromptableMcpServers` (neu)       | `state === 'pending'` (**exkludiert rejected**)  | Versorgt das Modal: rejected wird **nicht mehr genervt** |

Die ursprüngliche Emit-Entscheidung verwendete "die Namens-Differenzmenge von `nextGating.pending` vs. letztes Mal",
um zu entscheiden, ob das Modal angezeigt werden soll. Dies führte zu einem verpassten Prompt (Review Issue #6):

- Ein **abgelehnter** Server bleibt in der `pending`-Liste wegen `!== 'approved'`;
- Der Benutzer bearbeitet dann **die Konfiguration desselben Servers erneut** (Hash ändert sich → er wird wirklich
  `pending` und sollte erneut gefragt werden), aber sein Name war "bereits" in der Liste → die
  Differenzmenge ist leer → **kein Event → verpasster Prompt**.

A1-Fix: Verwenden Sie `getPromptableMcpServers(next, cwd)` (streng `=== 'pending'`), um das Emit zu entscheiden,
und übergeben Sie die Wahrheit der Entscheidung an `computePending`. Effekt:

- Nach Ablehnen, **Bearbeiten der Konfiguration desselben Servers** (Hash ändert sich) → `pending` erneut → **erneuter Prompt** ✓ (behebt #6)
- Nach Ablehnen, eine **unabhängige** Bearbeitung (Hash unverändert) → immer noch `rejected` → nicht promptable → **kein Prompt** ✓
- Bereits `approved` → kein Prompt; ein neuer unentschiedener Gated-Server → Prompt ✓

#### Rejected-Semantik (nach Review bestätigt)

`handleMcpApprovalSelect(REJECT)`: persistiert `rejected` (gebunden an den aktuellen Hash), ruft **kein**
`reconnect` auf, berührt **nicht** `config.pendingMcpServers` → Discovery überspringt weiterhin → der
Server bleibt `disconnected`. Kein aktives Abreißen der alten Verbindung nötig: Emit erfolgt nach dem
`await reinitializeMcpServers`; wenn das Modal erscheint, hat das Reconcile die Verbindung bereits abgerissen.
Nach einem Session-Neustart liest `computePending` den Status `rejected` → nicht in Warteschlange, bleibt getrennt,
konsistentes Verhalten.

#### Datenfluss-Addendum (fortgeführt nach ⑥ im Übersichtsdiagramm des Kapitels)

```text
⑥' [CLI · Teil D] nach dem Reconcile, falls ein streng ausstehender Gated-Server existiert:
        hot-reload → appEvents.emit(McpPendingApprovalChanged)
        → useMcpApproval.computePending() berechnet die Warteschlange neu → zeigt das Genehmigungsmodal an
        → Benutzer genehmigt: approveMcpServerForSession + discoverToolsForServer (Verbindung mit neuer Konfiguration)
          Benutzer lehnt ab: rejected persistieren, getrennt bleiben
```

#### Schlüsseldateien (Teil D)

| Datei                                             | Änderung                                                                                                                           |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `packages/cli/src/utils/events.ts`                | `AppEvent.McpPendingApprovalChanged` hinzufügen                                                                                    |
| `packages/cli/src/config/mcpApprovals.ts`         | `getPromptableMcpServers()` hinzufügen (streng `=== 'pending'`, unterschieden von rejected-inkludierendem `getPendingGatedMcpServers`) |
| `packages/cli/src/config/hot-reload.ts`           | nach Reconcile mit `getPromptableMcpServers` entscheiden; wenn nicht leer, `appEvents.emit(McpPendingApprovalChanged)`             |
| `packages/cli/src/ui/hooks/useMcpApproval.ts`     | `computePending()` extrahieren; einmal beim Mounten berechnen + auf das Event hin neu berechnen                                    |

#### Verifikation (Teil D)

- `hot-reload.test.ts`: Ein neu ausstehender Gated-Server → Emit; nicht-gated-Änderung → kein Emit;
  **Ablehnen→Konfiguration bearbeiten → erneutes Emit** (die alte Namens-Differenzmenge wäre 0 Mal gewesen, hätte die #6-Regression verursacht); Ablehnen→unabhängige Bearbeitung → kein Emit.
- `mcpApprovals.test.ts`: Die `getPromptableMcpServers`-Suite – keine Entscheidung promptet, rejected promptet nicht (vs. `getPendingGatedMcpServers` überspringt weiterhin), erneuter Prompt nach Hash-Änderung, approved promptet nicht.
- `useMcpApproval.test.ts`: Ein Session-internes Event lässt einen neuen Gated-Server das Modal anzeigen; ein bereits genehmigter wird nicht erneut angefragt.

#### Bekanntes Problem / Retrospektive TODO (hier NICHT behandelt)

1. **`getTargetDir()` vs. `getWorkingDir()`-Schlüsselkonflikt (Risiko B)**: Neuberechnung des Gating
   (`recomputeMcpGating` → `getPendingGatedMcpServers`) verwendet `config.getTargetDir()` als
   projectRoot, während `useMcpApproval` Genehmigungen mit `config.getWorkingDir()` liest/schreibt. Sie
   sind normalerweise gleich; wenn sie abweichen (benutzerdefiniertes cwd oder Symlink-Realpath-Unterschiede), wird die
   Genehmigung unter dem cwd-Key geschrieben, während das Gating unter dem targetDir-Key abfragt → **nach Genehmigung überspringt das Gating weiterhin und verbindet nie**. Ein bereits bestehendes Problem, nicht durch Teil D eingeführt. Empfehlung: auf eine einzige Wurzel vereinheitlichen (Tendenz zu `getWorkingDir()`, also der Genehmigungs-Schreibseite), oder zuerst eine Assertion einbauen, dass sie zur Laufzeit gleich sind.

### Teil E — Nachbereitung: in `/mcp` anzeigen, warum ein Gated-Server für die Genehmigung übersprungen wurde

> Dieser Abschnitt wurde nach der Auslieferung von Teil D hinzugefügt, während des Debuggens von "nach dem Ablehnen eines Gated-Servers und anschließendem Löschen und erneuten identischen Hinzufügens zeigt `/mcp` nur Disconnected ohne Hinweis". Fazit zuerst:
> **das ist kein Lebenszyklusfehler der Aufzeichnung; der einzige Fehler ist, dass der Überspringungsgrund unsichtbar ist**, daher fügen wir nur Sichtbarkeit hinzu und berühren keine Genehmigungsspeicherung / Reconcile-Logik.

#### Warum "nicht mehr prompten" ist wie entworfen

Ein Genehmigungseintrag ist gebunden an **(projectRoot, serverName, hash)** und ist **unabhängig davon, ob der
Server gerade in der Konfiguration vorhanden ist** – nichts löscht einen Eintrag, wenn ein Server aus der Konfiguration verschwindet. Somit:

- **bereits genehmigt bleibt über Entfernen/Hinzufügen erhalten**: genehmigen (hash H) → löschen → erneut identisch
  hinzufügen (immer noch hash H) → `getState` gibt `approved` zurück → stilles Wiederverbinden. Eine bewusste
  Annehmlichkeit.
- **abgelehnt, das auf dasselbe "identische erneute Hinzufügen" angewendet wird, ist symmetrisch und konsistent**:
  eine abgeschlossene Ablehnung bleibt so lange wirksam, wie der Konfigurations-Hash unverändert ist; der einzige Weg,
  es wieder aufzurufen, ist die **Konfiguration zu bearbeiten (den Hash zu ändern)** (d.h. der strenge-pending-erneute-Prompt-Pfad von `getPromptableMcpServers` in Teil D).

> Daher führen wir **bewusst kein "Eintrag bei Entfernung vergessen" ein**: das würde es zulassen, dass Präsenzübergänge persistente Entscheidungen ändern, was dem Prinzip widerspricht, dass Entscheidungen sich nur durch Hash oder explizite Aktion ändern, und eine asymmetrische Behandlung von genehmigt/abgelehnt erzeugen würde.

#### Der eigentliche Fehler und die Behebung (nur Sichtbarkeit)

`/mcp` (`ServerListStep` / `ServerDetailStep`) zeigte nur ein nacktes `Disconnected`, sodass "Ich habe es abgelehnt / warte auf Genehmigung" nicht von "einem echten Verbindungsfehler" zu unterscheiden war. Der Benutzer wusste daher nicht den Wiederherstellungspfad (Konfiguration bearbeiten, um den Hash zu ändern → erneuter Prompt). Behebung: Hinzufügen von
`approvalState?: 'pending' | 'rejected'` zu `MCPServerDisplayInfo`, berechnet in
`MCPManagementDialog.fetchServerData` mit `loadMcpApprovals` + `isGatedMcpScope`, abgeglichen mit
**`config.getWorkingDir()`** (für nicht-gated / genehmigt leer gelassen); die Listen-/Detailansichten zeigen, unter Verwendung des bestehenden `needsAuth`-Override-Musters, zuerst den Grund
(`rejected → "abgelehnt – Konfiguration bearbeiten, um erneut zu genehmigen"`, `pending → "benötigt Genehmigung"`, Warnung gelb), und schließen diese nicht-fehlerhaften Genehmigungsüberspringungen aus dem Footer-Hinweis "Fehlerprotokolle anzeigen" aus.

> Die Schlüsselung auf die Schreibseite `getWorkingDir()` hier ist genau die Richtung, die Teil D's "Bekanntes Problem 1 (Risiko B)" empfiehlt – Genehmigung mit derselben Wurzel lesen und schreiben. Die bestehende Gating-Abfrage in `hot-reload.ts` verwendet weiterhin `getTargetDir()` (sie sind heute gleich); dieser Abschnitt ändert sein Verhalten nicht. Er **berührt nicht** den Speicher von `mcpApprovals.ts`, den Entfernungs-/Wiederverbindungspfad von `hot-reload.ts` und fügt keine Genehmigungsaktion hinzu.

#### Schlüsseldateien (Teil E)

| Datei                                                            | Änderung                                                                                      |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `packages/cli/src/ui/components/mcp/types.ts`                   | `MCPServerDisplayInfo` fügt `approvalState?: 'pending' \| 'rejected'` hinzu                    |
| `packages/cli/src/ui/components/mcp/MCPManagementDialog.tsx`    | `fetchServerData` berechnet `approvalState`, abgeglichen mit `getWorkingDir()`                  |
| `packages/cli/src/ui/components/mcp/steps/ServerListStep.tsx`   | Genehmigungsgrund rendern; Genehmigungsüberspringungen vom Footer-Hinweis "Fehlerprotokolle anzeigen" ausschließen |
| `packages/cli/src/ui/components/mcp/steps/ServerDetailStep.tsx` | Genehmigungsgrund rendern (konsistent mit der Liste)                                           |

#### Verifikation (Teil E)

- `ServerListStep.test.tsx`: Gated `rejected` → zeigt den erneuten Genehmigungshinweis; `pending` → "benötigt
  Genehmigung"; ein Genehmigungsüberspringen zeigt **nicht** den Hinweis "Fehlerprotokolle anzeigen", während eine echtes
  fehlgeschlagenes Verbinden **weiterhin** diesen zeigt.
- Manuell: Einen Workspace-Server ablehnen → `/mcp` zeigt den Grund (nicht ein nacktes Disconnected) → seine
  Konfiguration bearbeiten, um den Hash zu ändern → das Teil-D-Modal erscheint erneut (der bestehende Wiederherstellungspfad, hier unverändert).

### Teil F — Nachbereitung: Admissionssemantik (CLI-Obergrenze, verbieten-alles, nicht verfügbare Gründe)

> Hinzugefügt nach einem dritten adversarialen Review-Durchlauf der Teile A/B. Drei verwandte Admission-Verfeinerungen,
> gruppiert, weil sie die gemeinsame Oberfläche "welche Server dürfen sich verbinden, und wie erklären wir, wenn einer
> das nicht kann" teilen. Items nach ihren Review-Threads mit K/H/B bezeichnet.

#### K — das Start-Flag `--allowed-mcp-server-names` ist eine unveränderliche Obergrenze

Kehrt die frühere Haltung "Einstellungen gewinnen immer" um (siehe die Notiz in Teil B). Beim Start
gibt `loadCliConfig` dem Flag Vorrang vor `settings.mcp.allowed`; aber die Hot-Reload-Neuberechnung las
`allowed` nur aus den Einstellungen, sodass jede Einstellungsänderung eine Start-Zeit-Namensbeschränkung stillschweigend aufhob – eine Lockerung, in der Session, einer Grenze, die ein Administrator genau gesetzt hatte, um zu begrenzen, welche lokalen MCP-Befehle ausgeführt werden dürfen.

Behebung: Den **Flag-Wert allein** als unveränderliche Grenze auf `Config` erfassen
(`cliAllowedMcpServerNames`-Parameter → `getCliAllowedMcpServerNames()`; unterschieden vom veränderlichen
`allowedMcpServers`, das Hot-Reload überschreibt). `recomputeMcpGating` begrenzt dann die aus Einstellungen
abgeleitete Erlaubnisliste auf diese:

- Flag gesetzt + Einstellungen haben `mcp.allowed` → **Schnittmenge** (Einstellungen können innerhalb der Grenze enger werden);
- Flag gesetzt + keine Einstellungen `mcp.allowed` → das **Flag vollständig**;
- Kein Flag → Einstellungen treiben Admission vollständig (unverändert).

Eine Laufzeitbearbeitung kann also nur MCP-Admission unter das Start-Flag einschränken, niemals darüber hinausweiten.
`mcp.excluded` schränkt weiterhin zur Discovery-Zeit ein, konsistent mit "nur strenger, niemals lockerer".

#### H — `mcp.allowed: []` ist verbieten-alles, konsistent beim Start und Hot-Reload

Der Start behandelt eine leere Erlaubnisliste als verbieten-alles (`getMcpServers()` filtert, wann immer
`allowedMcpServers` truthy ist, und `[]` ist truthy). Die Hot-Reload-Neuberechnung hat früher `[]` → `undefined`
("alle erlauben") aufgelöst – sodass das Bearbeiten von `mcp.allowed` zu `[]` in der Erwartung eines Verbieten-Alles jeden Server erreichbar ließ. Behebung:
`recomputeMcpGating` bewahrt `[]` (nur ein **fehlender** Schlüssel liefert `undefined`), und `mcpGatingEqual`
unterscheidet fehlend (alle erlauben) von `[]` (verbieten-alles) für `allowed` – sonst würde die Änderung
als gleich verglichen werden und nie ein Reconcile auslösen. `excluded` / `pending` behalten `undefined ≡ []` (beide "keine Einträge").

#### B — tool-not-found erklärt, _warum_ ein Server nicht verfügbar ist

`getMcpToolUnavailableMessage` hat bisher nur zwischen "diese Session entfernt" und "nicht konfiguriert"
unterschieden. Mit Admission-Gating klassifiziert es nun den zugehörigen Server über eine einzelne Core-API,
`Config.getMcpServerUnavailableReason(name)`, die jede Sperre abdeckt:

| Grund              | Bedeutung                                     | Vorgeschlagener Wiederherstellungshinweis                  |
| ------------------- | --------------------------------------------- | ---------------------------------------------------------- |
| `removed`           | aus der zusammengeführten Config diese Session gelöscht | zur Einstellung wieder hinzufügen                           |
| `not_allowed`       | durch `mcp.allowed` / die CLI-Grenze herausgefiltert | zu `mcp.allowed` hinzufügen                                |
| `excluded`          | in `mcp.excluded` aufgeführt                  | aus `mcp.excluded` entfernen                                |
| `pending_approval`  | Gated-Server wartet auf Genehmigung (#4615)   | genehmigen (`/mcp` ausführen)                               |
| _(keine)_           | konfiguriert & zugelassen                     | echtes "Tool nicht gefunden" (getrennt / umbenannt)         |

Zwei unterstützende Änderungen: eine private `getMergedMcpServers()` (die Zusammenführung **ohne** den Erlaubnislisten-Filter),
damit "konfiguriert" von "herausgefiltert" unterschieden werden kann; und die Entfernungsverfolgung vergleicht nun
diese **Gating-unabhängige zusammengeführte Map**, was bedeutet, dass ein durch eine verengte Erlaubnisliste
herausgefilterter Server nicht mehr fälschlicherweise als `removed` gemeldet wird (es ist `not_allowed`). Das
ermöglicht auch, den `prevEffectiveServerNames`-Snapshot-Parameter, der für den früheren Fix der Erlaubnislisten-Verengung
hinzugefügt wurde, zu entfernen – der Merge-Map-Vergleich wird nicht von den Gating-Setzern beeinflusst,
die der Aufrufer direkt vor dem Reconcile anwendet.

#### Schlüsseldateien (Teil F)

| Datei                                                  | Änderung                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/cli/src/config/config.ts` (`loadCliConfig`) | den `--allowed-mcp-server-names`-Flag-Wert allein als `cliAllowedMcpServerNames` übergeben                                                                                                                                                                                                                            |
| `packages/core/src/config/config.ts`                  | `cliAllowedMcpServerNames`-Feld + `getCliAllowedMcpServerNames()` (K); `getMergedMcpServers()` (ungefiltert) + `getMcpServerNames()`; `McpServerUnavailableReason` + `getMcpServerUnavailableReason()` (B); Entfernungsverfolgung vergleicht die zusammengeführte Map und `reinitializeMcpServers` entfernt den `prevEffectiveServerNames`-Parameter |
| `packages/cli/src/config/hot-reload.ts`               | `recomputeMcpGating` begrenzt `allowed` auf die Startgrenze (K) und bewahrt `[]` (H); `mcpGatingEqual` macht `allowed` fehlend ≠ `[]` (H)                                                                                                            |
| `packages/core/src/core/coreToolScheduler.ts`         | `getMcpToolUnavailableMessage` leitet pro `getMcpServerUnavailableReason` (B) weiter                                                                                                                                                                                                                               |

#### Verifikation (Teil F)

- `hot-reload.test.ts`: **K** — mit einem Start-Flag und keiner Einstellungs-Erlaubnisliste, wendet das Flag
  vollständig an; eine Einstellungs-Erlaubnisliste wird auf das Flag begrenzt (kann nicht erweitern) und kann es
  innerhalb verengen; ohne das Flag gewinnen Einstellungen unbegrenzt. **H** — `mcp.allowed: []` wird als
  verbieten-alles durchgereicht; `mcpGatingEqual` behandelt `allowed` fehlend vs. `[]` als unterschiedlich (aber
  `excluded` undefined ≡ `[]`).
- `config.test.ts`: `getMcpServerUnavailableReason` gibt `not_allowed` / `excluded` /
  `pending_approval` / `removed` für jede Sperre zurück und `undefined` für einen konfiguriert-zugelassenen oder
  nie-konfigurierten Server.
- `coreToolScheduler.test.ts`: Die tool-not-found-Nachricht benennt den richtigen Server und die Wiederherstellungsaktion passend zum Grund.

---

## Außerhalb des Rahmens (andere Unteraufgaben)

- **Das gesamte LSP-Laufzeit-Neuverbinden** (`NativeLspService.reinitialize()` +
  `Config.reinitializeLsp()` + Verdrahtung) – auf einen späteren MR verschoben, siehe Teil C's TODO.
- Der Slash-Befehl `/reload` (#5) – ruft `config.reinitializeMcpServers(currentSettings)` auf (der LSP-Teil
  wird verdrahtet, sobald sein Primitiv in einem späteren MR landet) + Skill/Befehl-Neuladen.
- `clearAllCaches()` (#4) und die `needsRefresh`-UI-Benachrichtigung (#6).

## Schlüsseldateien

| Datei                                            | Änderung                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/core/src/config/config.ts`            | `setMcpServers()`, `setAllowedMcpServers()` + Pending-Setter, `getMcpGating()` (gibt `{ excluded, allowed, pending }` zurück), `reinitializeMcpServers()` (mit einer Reconcile-in-Progress-Sperre)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `packages/core/src/tools/mcp-client-manager.ts` | ① `removePromptsByServer()` zu `removeServer()` und `removeRuntimeMcpServer()` hinzufügen; ② im Shared-Pool-Pfad `runDiscoverAllMcpToolsViaPool` (`:1461`), die `isMcpServerPendingApproval`-Prüfung vor dem Bau von `desiredIds` / vor dem Erwerb hinzufügen (übereinstimmend mit Single-Session-Admission); ③ **Fingerprint-Diff zum Single-Session-Pfad hinzufügen**: eine neue `connectionFingerprints`-Map; `discoverAllMcpToolsIncremental` löst auch Trennen+Neuverbinden für einen Server aus, der "verbunden ist, aber sein `connectionIdOf`-Fingerprint geändert hat" (abgestimmt mit dem Pool-Pfad's `desiredIds`), wobei die Map bei jedem Teardown-Pfad geleert wird; ④ **alte Tools/Prompts vor dem Neuverbinden löschen**: wenn `discoverMcpToolsForServerInternal` einen existierenden Client ersetzt, `removeMcpToolsByServer` + `removePromptsByServer` vor der erneuten Discovery – weil `disconnect()` das Register nicht berührt und `discover()` nur anhängt/überschreibt nach Name, sonst würden Tools, die durch eine Konfigurationsänderung gelöscht oder umbenannt wurden, an einen geschlossenen Client gebunden bleiben (und bei Discovery-Fehlern auch hängen bleiben), was mit der bestehenden Bereinigung in `removeServer` / `addRuntimeMcpServer` übereinstimmt |
| `packages/cli/src/config/settingsSchema.ts`     | **Voraussetzung**: die drei Schlüssel `mcpServers` (`:274`), `mcp.allowed`, `mcp.excluded` von `requiresRestart: true` auf `false` setzen, damit der Watcher MCP-Änderungen nicht mehr unterdrückt; der Elternschlüssel `mcp` und `mcp.serverCommand` bleiben `true` (siehe die "Harte Voraussetzung"-Notiz oben)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `packages/cli/src/config/hot-reload.ts` _(neu)_ | `registerMcpHotReload()`: Neubau via `assembleMcpServers(..., topTierMcpServers)`; die Gating-Listen aus aktuellen Einstellungen neu berechnen (siehe "Admission-Haltungs-Entscheidung"); Gaten via `mcpServersEqual` + `mcpGatingEqual` (basierend auf `fast-deep-equal`); Entprellung + Vereinigung und erneute Prüfung                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `packages/cli/package.json`                     | `fast-deep-equal` von einer transitiven zu einer **direkten** Abhängigkeit machen                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `packages/cli/src/gemini.tsx`                   | `registerMcpHotReload` nach `:785` aufrufen; den Disposer registrieren                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Tests _(zusammen mit dem Schema-Flip)_          | `settingsSchema.test.ts` fixiert die `requiresRestart`-Werte der drei MCP-Schlüssel (inkl. `mcp` / `mcp.serverCommand` bleiben `true`); `settingsWatcher.test.ts` fügt zwei positive Regressionen hinzu ("nur `mcpServers` / nur `mcp.excluded` bearbeiten → benachrichtigen dennoch"); `settingsUtils.test.ts` verwendet ein **eigenes Mock-Schema**, unabhängig vom echten Flip, keine Änderung nötig                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
> LSP-bezogene Dateien (`NativeLspService.ts` / `NativeLspClient.ts` / `lsp/types.ts`) sind in diesem MR unverändert – siehe Part C TODO.

## Verifikation

### A. Core-Komponenten-Unit-Tests (core, `config.test.ts` / `mcp-client-manager.test.ts`)

1. `setMcpServers` ist ein **Ersetzen (nicht Zusammenführen)** und wirkt nach der Initialisierung (wirft nicht mehr über die `initialized`-Guard).
2. `reinitializeMcpServers` ruft zuerst `setMcpServers` und dann `discoverAllMcpToolsIncremental` auf; ein Aufruf vor `initialize()` ist ein **sicherer No‑Op** (kein Throw, kein Connect).
3. Stelle sicher, dass `removeServer()` / `removeRuntimeMcpServer()` jetzt `removePromptsByServer()` aufrufen (Prompt-Leak-Regression-Guard). Verwende die Fixtures aus `mcp-client-manager.test.ts` wieder (die bereits `connectionIdOf` importieren).
   3b. **Single-Session-Fingerprint-Diff**: Ein Mock-Client, dessen `getStatus()` immer `CONNECTED` zurückgibt; führe `discoverAllMcpToolsIncremental` dreimal aus – beim ersten Connect wird der Fingerprint gespeichert; bei gleicher Konfiguration wird **nicht** unnötig gearbeitet (`connect` bleibt 1×); wird `args` direkt geändert (Fingerprint ändert sich) → Disconnect+Reconnect (`disconnect` 1×, `connect` 2×). Stellt sicher, dass der Single-Session-Pfad nicht mehr fälschlich "connected but config changed" als No‑Op behandelt (abgestimmt mit den `desiredIds` des Shared Pools). Prüfe außerdem, dass dieser Lauf `removeMcpToolsByServer` + `removePromptsByServer` für diesen Server vor der Neuentdeckung aufruft – schützt davor, dass alte Tools/Prompts nach einer Konfigurationsänderung, die Tools entfernt/umbenannt, hängen bleiben.

### A'. Watcher↔Schema-Integrationsguard (cli, `settingsSchema.test.ts` / `settingsWatcher.test.ts`)

> Diese beiden sind **hochkritische** Integrationsfehler: Eine reine MCP-Bearbeitung wird vom Restart-Required-Suppression-Gate des Watchers verschluckt, sodass der Part‑B-Callback nie feuert. Es **muss** eine echte Watcher-Schicht-Abdeckung geben; ein direkter Aufruf des Callbacks in `hot-reload.test.ts` kann diesen Fehler nicht abfangen.

3c. **Schema-Pinning** (`settingsSchema.test.ts`): `mcpServers` / `mcp.allowed` / `mcp.excluded` haben `requiresRestart` `false`; das übergeordnete `mcp` und `mcp.serverCommand` sind `true`. Verhindert, dass jemand MCP-Schlüssel wieder auf restart-required setzt und damit den gesamten Hot‑Reload lahmlegt.
3d. **Echter Watcher unterdrückt nicht mehr** (`settingsWatcher.test.ts` mit einem echten `SettingsWatcher` – mock fs): Nur `mcpServers` / nur `mcp.excluded` zu bearbeiten, löst jeweils **ein** `SettingsChangeEvent` aus (vor dem Flip wäre es unterdrückt worden). Dies ist der End-to-End-Regression-Guard, der sicherstellt, dass der Listener von Subtask 3 tatsächlich feuern kann.

### B. Subscriber-Gate-Branch-Unit-Tests (cli, `hot-reload.test.ts`)

Fake einen `SettingsWatcher` und decke jeden Gate-Branch ab:

4. **`mcpServers`-Änderungen** → rufe `reinitializeMcpServers` mit der **zusammengestellten** Map (inkl. Top-Level) auf.
5. **Nur `mcp.excluded` (oder `mcp.allowed` / pending) bearbeiten, `mcpServers` unberührt lassen** → **trotzdem** Reconcile auslösen, und vor dem Reconcile wurden bereits `setExcludedMcpServers` / `setAllowedMcpServers` / `setPendingMcpServers` aufgerufen. Dies verifiziert den `mcpGatingEqual`-Branch – die behobene Lücke: Nur `mcpServers` zu differenzieren hätte diese Änderung übersehen.
6. **Weder `mcpServers` noch die MCP-Gating-Listen geändert** (z. B. Theme‑/Skills‑Bearbeitung) → **ruft nicht** `reinitializeMcpServers` auf (verifiziert den frühen Rückgabepfad, wenn beide Gates "unverändert" sind).
7. **Zwei Änderungen während eines laufenden Reconciles** → Coalesce‑and‑Recheck läuft einmal erneut (Wiedereintritt).
8. **Debounce**: Mehrfache aufeinanderfolgende Speicherungen (< 300 ms) lösen **einmal** ein Reconcile aus (abgestimmt auf den 300‑ms‑Debounce des Watchers).

### C. Gate-Helper-Pure-Function-Unit-Tests (cli, `hot-reload.test.ts`)

9. `mcpServersEqual`: Unterschiedliche Schlüsselreihenfolge, gleiche Werte → `true`; Verschachtelte Konfigurationsfelder (`args` / `env` / `headers`) ändern sich → `false`; `undefined` vs `{}` → `true`; Server hinzufügen/entfernen → `false`; Reihenfolge des `args`-Arrays ändert sich → `false` (Befehlsargument-Reihenfolge hat Bedeutung).
10. `mcpGatingEqual`: Die drei Listen werden "reihenfolgeunabhängig" verglichen (`['a','b']` vs `['b','a']` → `true`); Element in einer Liste hinzufügen/entfernen → `false`; `undefined` vs `[]` → `true`.

### D. Trust-Boundary-Edge-Cases (cli + core)

> Beide sind **hochkritische** Vertrauensgrenzpunkte. Punkt 11 verifiziert die Admission-Grenze (Part F, Punkt K – Einstellungen schränken innerhalb des Start‑Flags ein, erweitern niemals darüber hinaus); Punkt 12 entspricht Part A, Punkt 4 (Pool-Pfad-Pending-Check).

11. **Hot‑Reload‑Admission schränkt innerhalb des Start‑Flags ein – erweitert aber niemals darüber hinaus** (die Grenze aus Part F, Punkt K; ersetzt die frühere Haltung "Einstellungen können erweitern"). Starte mit `--allowed-mcp-server-names=a,b`; dann setzt eine Einstellungsänderung `mcp.allowed` auf `[a, b, c]`. **Behaupte**: Nach dem Reconcile ist `c` **weiterhin ausgeschlossen** (begrenzt auf die Start‑Grenze), während `a` zugelassen ist; eine Einstellungsänderung, die auf `[a]` verkleinert, wirkt; ohne Start‑Flag hat die Einstellungs-Allow‑List unbegrenzte Gültigkeit. (Siehe Part F → Verifikation für die vollständige Matrix.)
    _Guards_: `recomputeMcpGating` schneidet die Einstellungs-Allow‑List mit `getCliAllowedMcpServerNames()` und erweitert sie nie darüber hinaus.

12. **Das Pending‑Approval‑Gate wird im Shared‑Pool‑Modus nicht umgangen** (hohes Risiko: Verbindung eines gated‑Servers vor Genehmigung). Im Daemon‑/Shared‑Pool‑Modus (`runDiscoverAllMcpToolsViaPool`) erfolgt ein Hot‑Reload der Einstellungen, der einen Server als "pending approval" hinzufügt/ändert (`.mcp.json` / Workspace). **Behaupte**: Vor der Benutzergenehmigung wird keine Pool‑Verbindung aufgebaut und kein Prozess gestartet; ein abgelehnter gated‑Server bleibt getrennt. Im Vergleich zum Single‑Session‑Pfad, der Pending bereits überspringt, schützt dieser Test den Pool‑Pfad.
    _Guards_: Part A, Punkt 4 – die Prüfung `isMcpServerPendingApproval` im Pool‑Pfad vor dem Aufbau von `desiredIds` / vor dem Acquire.

### E. Reconcile-Edge-Cases (empfohlene Abdeckung, Überprüfung "inkrementell, nicht vollständige Löschung")

13. **leer ↔ nicht‑leer**: Von 0 Servern auf 1 (den ersten), von 1 auf 0 (den letzten) – beide Reconciles funktionieren korrekt, es bleiben keine Restverbindungen / Tools / Prompts übrig.
14. **Eine Fingerprint‑Änderung betrifft nur diesen einen Server**: Änderung von `command` / `url` / `env` / `headers` eines Servers → nur dieser wird getrennt+neu verbunden, **alle anderen Verbindungen bleiben erhalten** (prüft keine Voll‑Löschung, keine "0 Tools"-Lücke).
15. **Unvertrautes Verzeichnis**: Wenn `isTrustedFolder()` `false` ist, ist Hot‑Reload ein No‑Op (es wird keine Verbindung hergestellt).
16. **`mcp.excluded` umschalten**: Hinzufügen eines verbundenen Servers zu `excluded` → er wird getrennt + Tools/Prompts gelöscht; Entfernen aus `excluded` → er wird wieder verbunden.