# WebShell-Git-Chip schnell anzeigen: Branch zuerst + Status-Cache/Push

Datum: 2026-07-24
Status: zu bestätigen

## Hintergrund und Problem

Beim Erstellen einer neuen Session in der WebShell erscheint der Git-Chip in
der Composer-Toolbar nur langsam. Ursache (zeilengenau bestätigt):

1. **Daemon-seitig wird der Branch vom `git status`-Kindprozess
   ausgebremst**——In `WorkspaceGitState.getStatus()`
   (`packages/cli/src/serve/workspace-git-state.ts`) hat der Branch einen
   Millisekunden-Fast-Path (`resolveBranchName` liest die `HEAD`-Datei +
   Reflog-Watcher), aber die HTTP-Antwort muss warten, bis
   `getGitWorkingTreeStatus()` abgeschlossen ist——jeder Request spawnt synchron
   `git status --porcelain=v1 --branch -z` (`gitDiff.ts` runGit, 5s-Timeout,
   kein Cache).
2. **Frontend-seitig wird das Chip-Rendering vom vollständigen Status
   gegatet**——Beim Erstellen einer neuen Session akzeptiert der Chip-Text nur
   `selectedWorkspaceGitStatus?.branch` (App.tsx 7860–7871), und das wartet auf
   den kompletten HTTP- + git-status-Roundtrip (der Effect in App.tsx
   1480–1520), bevor setState erfolgt.
3. **Derselbe Endpoint wird parallel zweimal getroffen**——Der Metadata-Abruf
   von `DaemonSessionProvider` (`DaemonSessionProvider.tsx:1320`, nutzt nur
   `.branch`) und der Git-Status-Effect in App.tsx senden fast gleichzeitig
   `GET /workspaces/:ws/git`; der Daemon spawnt zwei identische Kindprozesse.
4. Sequentielles Gating: `activeWorkspaceCwd` hängt davon ab, dass
   `GET /capabilities` zuerst abgeschlossen wird.

## Ziele und Non-Goals

Ziele:

- Beim Erstellen einer neuen Session / im ersten Screen erscheint der Git-Chip
  mit dem Branch-Text **sofort** (ein lokaler HTTP-RTT, Millisekunden); die
  Zähler für dirty/ahead/behind/stash werden nachgeliefert, sobald der Daemon
  fertig gerechnet hat (`wait: true`-Fresh-Request; bei vorhandener Session
  zusätzlich SSE-Live-Push).
- Doppelte `git status`-Kindprozesse eliminieren
  (Parallelitäts-Deduplizierung + stale-while-revalidate).
- Keine Regression: Sidebar-Workspace-Chip (braucht Zähler),
  Worktree-Session-Chip, detached HEAD, Nicht-Git-Workspaces,
  Git-Fehler-Degradation.

Non-Goals:

- Für den Worktree-`?cwd=`-Pfad keinen Watcher/Cache einführen (Status quo:
  direkt berechnen, um pro Worktree keinen fs-Watcher zu leaken). Die
  Worktree-Chip-Latenz bleibt unverändert.
- Kein Daemon-Startup-Preheat (das Frontend fragt nach capabilities sofort an,
  der Preheat-Gewinn wäre gering).
- Keine Änderung der bestehenden `git_branch_changed`-Semantik.

## Lösungsüberblick

Drei Ebenen von Änderungen: Daemon-Cache + Hintergrund-Refresh + SSE-Push
(P0), zweiphasige Responses (P1), Frontend konsumiert SSE und behält den
langsamen Pfad für Aufrufer, die ihn brauchen (P2 nach Neubewertung, siehe
unten).

### P0+P1: Daemon——`WorkspaceGitState`-Cache, Deduplizierung, Hintergrund-Refresh, SSE-Push

`WorkspaceGitEntry`-Erweiterung:

```ts
interface WorkspaceGitEntry {
  branch: string | undefined; // watcher 保持新鲜（现状）
  dispose: () => void; // 现状
  status?: GitWorkingTreeStatus; // 上次计算的原始 working-tree summary
  statusComputedAt?: number; // epoch ms
  statusPromise?: Promise<void>; // in-flight 去重
  disposed?: boolean; // dispose 后禁止 publish
}
```

Die Semantik von `getStatus(cwd, bridge, opts?: { wait?: boolean })` wird zu:

- **Default (Fast Path)**: stellt sicher, dass der Entry existiert (Branch
  antwortet in Millisekunden); tritt nach stale-while-revalidate einmal einen
  Hintergrund-Refresh los (siehe unten); **gibt sofort** den zuletzt
  gecachten Status zurück (materialize: Overlay
  `entry.branch ?? status.branch`, v2-Form + `computedAt`); wenn noch nie
  berechnet, wird nur Branch `{ v, workspaceCwd, branch }` zurückgegeben (ohne
  `computedAt`; das Frontend unterscheidet danach „nicht berechnet" von
  „clean").
- **`wait: true`**: wartet auf eine frische Berechnung (oder startet eine und
  wartet, In-Flight-Reuse) und gibt den vollen Status zurück. Schlägt die
  Berechnung fehl, Degradation auf nur Branch (Status-quo-Semantik).

Hintergrund-Refresh `refreshStatus(entry)`:

- In-Flight-Reuse: existiert `statusPromise`, wird es direkt zurückgegeben.
- Throttle: weniger als 2s seit dem letzten Start → überspringen (verhindert,
  dass Fokus-Stürme Git-Kindprozesse sequenziell in die Queue stellen).
- Berechnung erfolgreich und es gibt Unterschiede zu den gecachten enriched
  Feldern → Cache aktualisieren + den materialisierten vollen Status über
  `bridge.publishWorkspaceEvent({ type: 'git_status_changed', data })` pushen
  (data ist `DaemonWorkspaceGitStatus`, enthält workspaceCwd). Die erste
  Berechnung (Cache leer) gilt als Unterschied und wird zwingend gepusht——das
  ist der Kanal, über den der Chip beim Kaltstart die Zähler nachgeliefert
  bekommt.
- Kein Unterschied → nur Cache aktualisieren, nicht pushen (vermeidet, dass
  das 30s-Polling jedes Mal ein setState/Re-Render im Frontend auslöst).
- Berechnung fehlgeschlagen / kein Git-Verzeichnis → alten Cache behalten,
  nicht pushen.
- Entry disposed → nicht pushen.

**Kein TTL**. Last-known + ein Hintergrund-Refresh pro GET + SSE-Korrektur
reichen aus; der 2s-Throttle übernimmt die „TTL-Überflutungsschutz"-Rolle.
`wait: true`-Aufrufer bekommen immer eine frische Berechnung
(In-Flight-Reuse).

Routen (`packages/cli/src/serve/routes/workspace-git.ts`):

- `/workspace/git` und `/workspaces/:workspace/git` parsen `?wait=1` und geben
  es an `getStatus` durch. Default ist fast.
- Der Worktree-`?cwd=`-Zweig bleibt im Status quo (direkt
  `getGitWorkingTreeStatus`, kein Cache).

### SDK (`packages/sdk-typescript`)

- `events.ts`: `DAEMON_KNOWN_EVENT_TYPE_VALUES` erhält `'git_status_changed'`
  (direkt nach `'git_branch_changed'`). Alte SDKs verwerfen es still über
  `asKnownDaemonEvent`——rückwärtskompatibel, kein Protokoll-Bump nötig
  (dasselbe Muster wie `followup_suggestion`).
- `ui/normalizer.ts`: `case 'git_status_changed': return [];` (wird wie
  `git_branch_changed` von den Session-Mappern behandelt und gelangt nicht in
  den UI-Normalisierungsstrom).
- Die Signatur von `DaemonClient.workspaceGit` wird ein Options-Objekt:
  `workspaceGit(opts?: { cwd?: string; wait?: boolean })`, baut den Query
  (`cwd` und `wait=1` kombinierbar). Alle 4 Aufrufstellen migrieren (App.tsx,
  WorkspaceSection, DaemonSessionProvider ×2) plus die SDK-Unit-Tests.

### webui (`packages/webui`)

- `session/types.ts`: `DaemonConnectionState` erhält
  `gitStatus?: DaemonWorkspaceGitStatus` (nur der volle Status des aktuellen
  Workspace, gepflegt über SSE).
- `session/mappers.ts`: `updateConnectionFromDaemonEvent` erhält
  `case 'git_status_changed'`——passt `data.workspaceCwd` nicht zu
  `current.workspaceCwd`, ignorieren (spiegelt den Guard von
  `git_branch_changed`), sonst
  `setConnection({ ...current, gitStatus: data })`.

### web-shell (`packages/web-shell`)

- Git-Status-Effect in `App.tsx`: Der Composer nutzt
  **clientseitiges stale-while-revalidate**——jeder Trigger feuert parallel zwei
  Requests (außer in Worktree-Sessions, siehe unten):
  1. `workspaceGit({ cwd: sessionWorktree?.path })` (fast): last-known antwortet
     sofort, wird direkt gerendert (kalter Cache: nur Branch);
  2. `workspaceGit({ wait: true })` (fresh): der Daemon liefert den vollen
     Status, sobald die Hintergrundberechnung fertig ist, und liefert die
     Zähler nach. Beide Requests teilen sich daemon-seitig dieselbe Berechnung
     (In-Flight-Deduplizierung), die Zahl der Git-Kindprozesse steigt nicht.
- **Warum der Fresh-Request existieren muss (Reverse-Audit-Befund)**: Das SSE
  `git_status_changed` läuft über den Pro-Session-Event-Stream
  (`GET /session/:id/events`); **der Zustand „neue Session" (deferred connect,
  keine sessionId) hat kein SSE-Abo**——mit nur einem Fast-GET würden die Zähler
  erst nach 30s-Polling oder Fokus nachgeliefert. Der Fresh-Request hängt nicht
  von der Existenz einer Session ab und garantiert „Branch sofort, Zähler nach
  Berechnung" in allen Session-Zuständen. (`git_branch_changed` hat heute
  denselben Session-losen Blind Spot, keine Regression.)
- `App.tsx` behält zusätzlich einen SSE-Sync-Effect: ändert sich
  `connection.gitStatus`, passt `workspaceCwd` und gibt es keinen
  `sessionWorktree`, wird `selectedWorkspaceGitStatus` geschrieben——deckt den
  Live-Push **zwischen zwei Polls bei vorhandener Session** ab (z. B. ein
  Hintergrund-Refresh, den ein anderer Client/die CLI angestoßen hat).
- Worktree-Sessions feuern nur den Fast-Request: Der `?cwd=`-Pfad umgeht den
  Cache ohnehin und berechnet direkt (fast und wait sind äquivalent), das
  Verhalten bleibt unverändert.
- `sidebar/WorkspaceSection.tsx`: `workspaceGit({ wait: true })`——der
  Sidebar-Chip braucht Zähler und hat keinen SSE/Fresh-Doppelkanal; die
  blockierende Semantik bleibt erhalten (Status-quo-Verhalten unverändert;
  inaktive Workspaces haben keinen SSE-Kanal).

### P2-Neubewertung (nach Wert beschnitten)

Das ursprüngliche P2 (Frontend-Deduplizierung: der Provider speichert beim
ersten Abruf den vollen Status für die Wiederverwendung durch App) **wird
herabgestuft und nicht umgesetzt**: Die daemon-seitige
In-Flight-Deduplizierung von P0 beseitigt bereits die doppelten
`git status`-Kindprozesse (den Kern des ursprünglichen Problems); was bleibt,
ist nur ein millisekundenschneller lokaler HTTP-Roundtrip. Den vollen Status
in den Provider zu legen und von App wiederverwenden zu lassen, führte
Cross-Layer-Kopplung ein (Provider→App-Initialwert-Protokoll) bei einem Gewinn
von nahezu null. Die beiden `workspaceGit()`-Aufrufe im Provider lesen nur
`.branch`, laufen über den Default-Fast-Path und brauchen keine Änderung.

## Kompatibilität

- Die Form der Routen-Responses bleibt unverändert (v2, die enriched Felder
  waren ohnehin optional); der neue `?wait=1`-Query ist optional.
- Semantikänderung des Default-Fast-Path: Aufrufer können statt einer frischen
  Berechnung last-known (alter Cache) erhalten. Alle bestehenden Aufrufer
  einzeln geprüft:
  - `DaemonSessionProvider` (×2): liest nur `.branch`——der Branch ist immer
    frisch (Watcher), keine Auswirkung.
  - App.tsx-Composer-Chip: genau der Adressat dieses Designs.
  - WorkspaceSection: explizit auf `wait: true` geändert, Semantik unverändert.
- Das neue SSE-Event wird von alten Clients still verworfen
  (Known-List-Mechanismus der SDK).
- `git status_changed` wird nur auf den Session-SSE-Bus des jeweiligen
  Workspace gepublisht (bestehender `publishWorkspaceEvent`-Mechanismus,
  inklusive Multi-Workspace-Isolation).

## Risiken und Gegenmaßnahmen

| Risiko                                                        | Gegenmaßnahme                                                                                         |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Chip zeigt erst Branch, dann Zähler; die Toolbar-Breite springt | Der bestehende versteckte Messzwilling (ChatEditor toolbar-measure) behandelt das Re-Measure; leichte Verschiebung wird akzeptiert |
| Nur-Branch-Response wird als „clean" fehlinterpretiert        | Nur-Branch trägt kein `computedAt`; die bestehende Logik von GitBranchIndicator zeigt ohne `computedAt` kein „clean" an |
| Gecachter Status passt nicht zum Watcher-Branch               | Beim Materialize Overlay `entry.branch ?? status.branch` (bestehende Logik bleibt erhalten)           |
| Hintergrund-Refresh leakt (publish nach dispose)              | `disposed`-Flag-Guard                                                                                 |
| Fokus-Stürme lösen sequenzielle Git-Spawns aus                | 2s-Throttle + In-Flight-Reuse                                                                         |

## Testplan

Unit-Tests:

- `workspace-git-state.test.ts` (erweitert): Fast Path gibt sofort last-known
  zurück; kalter Cache gibt nur Branch ohne `computedAt` zurück;
  Hintergrund-Refresh publisht `git_status_changed` nur bei Unterschied; die
  erste Berechnung publiziert zwingend; parallele getStatus-Aufrufe lösen nur
  einmal `getGitWorkingTreeStatus` aus; 2s-Throttle; `wait: true` wartet auf
  die frische Berechnung; bei Berechnungsfehler bleibt der alte Cache erhalten
  und es wird nicht publisht; nach dispose kein publish.
- `routes/workspace-git.test.ts` (erweitert): `?wait=1` wird durchgereicht;
  der Worktree-`?cwd=`-Pfad geht nicht in den Cache (direkte Berechnung
  bleibt).
- SDK `DaemonClient.test.ts`: Options-Objekt-Query-Assembly (cwd / wait /
  kombiniert).
- webui `mappers.test.ts`: `git_status_changed` mit passendem und nicht
  passendem workspaceCwd, beide Zweige.

E2E (`.qwen/e2e-tests/2026-07-24-git-chip-fast-branch.md`, wird in der
Verifizierungsphase ergänzt): echter Daemon + WebShell, neue Session in einem
großen Workspace——der Chip (Branch) erscheint sofort, nachdem der Editor bereit
ist, die Zähler werden danach nachgeliefert; das Verhalten des Sidebar-Chips
bleibt unverändert; Fokus/30s-Polling refresht weiterhin; der
Worktree-Session-Chip bleibt unverändert.

## Verworfene Alternativen

- **TTL-Cache (ohne Hintergrund-Refresh/SSE)**: beschleunigt nur wiederholte
  Requests; beim Kaltstart muss weiter auf git status gewartet werden——löst
  nicht die Hauptbeschwerde „Chip bei neuer Session langsam".
- **Daemon-Preheat nach capabilities**: das erste GET kommt fast gleichzeitig
  mit dem Preheat; nach In-Flight-Deduplizierung ist der Gewinn ≈ 0.
- **Frontend nur Deduplizierung/Request-Zusammenlegung**: eliminiert nicht das
  Warten auf den git-status-Kindprozess, nur Symptombekämpfung.
