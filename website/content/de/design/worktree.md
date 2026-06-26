# Worktree – Allgemeiner Fähigkeitsentwurf

## Problemstellung

qwen-code verfügt derzeit nur über eine interne Worktree-Implementierung (`GitWorktreeService`), die auf das Arena-Szenario mit mehreren Modellen ausgerichtet ist. Benutzer können in normalen Sitzungen kein Worktree nutzen, um Arbeiten zu isolieren. Auch `AgentTool` unterstützt nicht das Erstellen isolierter Worktree-Umgebungen für Sub-Agenten.

Ziel ist es, Worktree zu einer allgemeinen Fähigkeit zu machen, die sowohl die Isolierung auf Benutzersitzungsebene als auch auf Agentenebene unterstützt, während die bestehende Arena-Funktionalität vollständig erhalten bleibt.

## Vergleich des aktuellen Stands

| Funktion                                | qwen-code       | claude-code | Phase    |
| --------------------------------------- | --------------- | ----------- | -------- |
| `EnterWorktree`-Tool                    | ✅ (Phase A)    | ✅          | —        |
| `ExitWorktree`-Tool                     | ✅ (Phase A)    | ✅          | —        |
| AgentTool `isolation: 'worktree'`       | ✅ (Phase B)    | ✅          | —        |
| Automatische Bereinigung abgelaufener Worktrees | ✅ (Phase B)   | ✅          | —        |
| Persistenz und Wiederherstellung des Worktree-Sitzungsstatus | ❌ | ✅          | Phase C  |
| Post-creation Setup (Hooks-Konfiguration) | ❌            | ✅          | Phase C  |
| StatusLine-Worktree-Statusanzeige       | ❌              | ✅          | Phase C  |
| WorktreeExitDialog (Beenden-Hinweis)    | ❌              | ✅          | Phase C  |
| `--worktree` CLI-Startflag              | ✅ (Phase D)    | ✅          | —        |
| Symbolische Verzeichnislinks (node_modules usw.) | ✅ (Phase D)   | ✅          | —        |
| PR-Referenz (`--worktree=#123`)         | ✅ (Phase D)    | ✅          | —        |
| Sparse Checkout                         | ❌              | ✅          | Future   |
| tmux-Integration                        | ❌              | ✅          | Future   |
| Worktree-Isolierung für mehrere Arena-Modelle | ✅ (nur qwen)  | ❌          | —        |
| Überschreibung von Dirty State (stash + copy) | ✅          | ✅          | —        |
| Baseline-Commit-Nachverfolgung           | ✅ (nur qwen)  | ❌          | —        |

## Entwurfsprinzipien

**Worktree ist eine allgemeine Fähigkeit; Arena ist ihre darüberliegende Anwendung.**

- Allgemeine Worktree-Ebene: `EnterWorktree`/`ExitWorktree`-Tools, `AgentTool`-Parameter `isolation`, Sitzungsstatusverwaltung, automatische Bereinigung
- Arena-Ebene: Parallele Planung mehrerer Modelle, benutzerdefinierter Pfad `worktreeBaseDir`, Batch-Erstellung und Diff-Vergleich; verwendet weiterhin die bestehende Logik von `GitWorktreeService.setupWorktrees()`, unbeeinflusst von Änderungen an der allgemeinen Ebene

`isolation: 'worktree'` von `AgentTool` nutzt nur den allgemeinen Pfad; Arena erstellt Worktrees nicht über diesen Parameter. Beide Pfade sind unabhängig.

## Pfade und Konfiguration

### Allgemeiner Worktree-Pfad

Worktrees, die durch das `EnterWorktree`-Tool oder `AgentTool` mit `isolation: 'worktree'` erstellt werden, werden fest abgelegt unter:

```
{git-Repository-Stamm}/.qwen/worktrees/{slug}
```

Der Pfad ist nicht konfigurierbar. Namensregeln für Slug:

- Benutzersitzungs-Worktree: Vom Benutzer angegebener Name oder automatisch generiert (Format: `{Adjektiv}-{Nomen}-{4-stellige Zufallszahl}`)
- Agent-Worktree: `agent-{7-stelliges zufälliges Hex}`

### Arena-Worktree-Pfad (bereits vorhanden, unverändert)

Der Worktree-Pfad für Arena wird durch `agents.arena.worktreeBaseDir` gesteuert, Standard ist `~/.qwen/arena` (`ArenaManager.ts:125`). Er ist völlig unabhängig vom allgemeinen Pfad und wird nicht geändert.

### Erweiterte Konfiguration

| Konfiguration                        | Typ        | Zweck                                                                 | Phase    |
| ------------------------------------ | ---------- | --------------------------------------------------------------------- | -------- |
| `ui.hideBuiltinWorktreeIndicator`    | `boolean`  | Ausblenden der eingebauten Zeile `⎇ worktree-… (…)` im Footer; Platz für benutzerdefinierte Statusleiste | Phase C |
| `worktree.symlinkDirectories`        | `string[]` | Symbolische Links auf bestimmte Verzeichnisse (z. B. `node_modules`) im Worktree, um Speicherverschwendung zu vermeiden | Phase D |
| `worktree.sparsePaths`               | `string[]` | Git-Sparse-Checkout-Kegelmodus; bei großen Monorepos nur angegebene Pfade auschecken | Future  |

Phase A/B fügen keine neuen Konfigurationsoptionen hinzu.

## Werkzeugentwurf

### EnterWorktree

**Auslösebedingungen:** Der Benutzer sagt explizit „Starte ein Worktree“, „Verwende ein Worktree“, „Erstelle ein Worktree“ o. Ä. Das Tool sollte nicht automatisch ausgelöst werden, wenn der Benutzer „Fehler beheben“ oder „Funktion entwickeln“ sagt.

**Eingabeschema:**

```
name?: string  // optional; Slug-Format: Buchstaben/Ziffern/Punkte/Unterstriche/Bindestriche, max. 64 Zeichen
```

**Verhalten:**

1. Prüfen, dass aktuell kein Worktree aktiv ist (Verschachtelung verhindern)
2. Auflösen des Git-Repository-Stamms (auch wenn bereits in einem Unterverzeichnis)
3. Aufruf von `GitWorktreeService`, um das Worktree zu erstellen; Pfad: `.qwen/worktrees/{slug}`
4. Schreiben der Worktree-Sitzung in `SessionService`
5. Wechseln des Arbeitsverzeichnisses in den Worktree-Pfad
6. Leeren des Dateicaches

**Ausgabe:** `worktreePath`, `worktreeBranch`, `message`

### ExitWorktree

**Auslösebedingungen:** Der Benutzer sagt „Beende das Worktree“, „Verlasse das Worktree“, „Geh zurück“ o. Ä.

**Eingabeschema:**

```
action: 'keep' | 'remove'
discard_changes?: boolean  // nur gültig bei action='remove'
```

**Sicherheitsvorkehrungen:**

- Arbeitet nur mit dem Worktree, das durch `EnterWorktree` in dieser Sitzung erstellt wurde.
- Bei `action='remove'` und vorhandenen nicht committeten Änderungen wird die Ausführung verweigert (außer `discard_changes: true`).

**Verhalten:**

- `keep`: Löschen des Worktree-Status in der Sitzung; Worktree-Verzeichnis und Branch bleiben erhalten; ursprüngliches Arbeitsverzeichnis wiederherstellen.
- `remove`: Löschen des Worktree-Verzeichnisses, Löschen des zugehörigen Git-Branches, Löschen des Sitzungsstatus, ursprüngliches Arbeitsverzeichnis wiederherstellen.

**Ausgabe:** `action`, `originalCwd`, `worktreePath`, `worktreeBranch`

## Auslösemechanismen für Benutzer

| Methode               | Beispiel                                                         | Implementierungsphase |
| --------------------- | ---------------------------------------------------------------- | --------------------- |
| Explizite Anfrage in der Sitzung | Benutzer sagt „Beginne mit der Arbeit in einem Worktree“ → Modell ruft EnterWorktree auf | Phase A               |
| Agent-Isolierung      | Modell setzt für Sub-Agenten `isolation: 'worktree'`             | Phase B               |
| CLI-Startflag         | `qwen --worktree my-feature`                                     | Phase D               |

Keine Slash-Befehle. Die Auslösung eines Worktrees in der Sitzung hängt von der expliziten Erwähnung durch den Benutzer ab; `isolation: 'worktree'` ist das Szenario, in dem das Modell selbstständig entscheidet.

## Stufenweiser Implementierungsplan

### Phase A: Kernwerkzeuge (Worktree auf Benutzersitzungsebene)

**Ziel:** Benutzer können in einer Sitzung ein Worktree betreten/verlassen.

**Zu implementierende Funktionen:**

- `EnterWorktree`-Tool: Worktree erstellen, Arbeitsverzeichnis wechseln, Sitzungsstatus aufzeichnen
- `ExitWorktree`-Tool: Zwei Beendigungsmodi (keep/remove), Sicherheitsvorkehrungen
- Erweiterung von `GitWorktreeService`: Neue Methoden `createUserWorktree()` / `removeUserWorktree()` für einzelne Benutzersitzungen; Wiederverwendung der vorhandenen Git-Logik; keine Änderung der von Arena verwendeten Batch-Schnittstellen
- Erweiterung von `SessionService`: Neues `WorktreeSession`-Feld mit `{ slug, worktreePath, worktreeBranch, originalCwd, originalBranch }`; Wiederherstellung des Worktree-Arbeitsverzeichnisses bei `--resume`
- Tool-Prompt: Für jedes Werkzeug eine Nutzungsanleitung erstellen, die klar angibt, wann es aufzurufen ist und wann nicht

**Betroffene Dateien:**

| Datei                                                 | Änderungsart                                    |
| ----------------------------------------------------- | ----------------------------------------------- |
| `packages/core/src/tools/tool-names.ts`               | Neue Konstanten `ENTER_WORKTREE`, `EXIT_WORKTREE` |
| `packages/core/src/tools/EnterWorktreeTool/`          | Neues Verzeichnis: `EnterWorktreeTool.ts`, `prompt.ts` |
| `packages/core/src/tools/ExitWorktreeTool/`           | Neues Verzeichnis: `ExitWorktreeTool.ts`, `prompt.ts` |
| `packages/core/src/services/gitWorktreeService.ts`    | Neue Schnittstellen auf Benutzersitzungsebene (Arena-Schnittstellen unverändert) |
| `packages/core/src/services/sessionService.ts`        | Neues Feld `WorktreeSession` sowie Lese-/Schreibmethoden |
| `packages/core/src/tools/` Registrierungseinstieg     | Neue Werkzeuge registrieren                    |
**Nicht in Phase A enthalten:**

- Agent-Isolation (Phase B)
- Hooks-Konfiguration etc. Post-Creation-Setup (Phase C)
- UI-Statusanzeige (Phase C)

---

### Phase B: Agent-Isolation (AgentTool `isolation: 'worktree'`) + Beschreibungsaktualisierung

**Ziel:** Das Modell kann für Subagenten ein temporäres isoliertes Worktree erstellen, das nach dem Agenten automatisch gelöscht wird; gleichzeitig werden die betroffenen Tool-Beschreibungen und Prompts aktualisiert.

**Zu implementierende Funktionen:**

_Agent-Isolation Kern:_

- `AgentTool` erhält neuen Parameter `isolation?: 'worktree'`
- Beim Starten des Agenten wird ein temporäres Worktree erstellt (Slug: `agent-{7hex}`, Pfad: `.qwen/worktrees/agent-{7hex}`)
- Nach Agent-Ende: Bei unverändertem Zustand automatisch löschen; bei Änderungen beibehalten, Pfad und Branch im Ergebnis zurückgeben
- Automatische Bereinigung abgelaufener Worktrees: Scanne `.qwen/worktrees/`, match `agent-{7hex}`-Muster, lösche wenn älter als 30 Tage und keine ungepushten Commits, Fail-Closed-Strategie

_Beschreibungs- und Prompt-Aktualisierung:_

- `AgentTool`-description um Parameter `isolation: 'worktree'` ergänzen (Referenz zu claude-code `AgentTool/prompt.ts:272`)
- `buildWorktreeNotice()` hinzufügen: Wenn ein Fork-Subagent in einem Worktree läuft, einen Kontexthinweis einfügen, der besagt, dass er sich in einem isolierten Worktree befindet, der Pfad vom übergeordneten Agenten übernommen wird und die Datei vor dem Bearbeiten erneut gelesen werden muss (Referenz zu claude-code `forkSubagent.ts:buildWorktreeNotice`)

_Keine Änderungen erforderlich:_

- Review-Skill (`SKILL.md`): Review verwendet einen unabhängigen Mechanismus (Pfad `.qwen/tmp/review-pr-<n>`, über `qwen review fetch-pr`-Befehl erstellt), unterscheidet sich völlig von generischen Worktree-Pfaden und Mechanismen, es gibt keine Verwechslung

**Arena-Kompatibilitätsgarantie:** Arena erstellt keine Worktrees über den `isolation`-Parameter, diese Änderung berührt keine Arena-Code-Pfade.

**Betroffene Dateien:**

| Datei                                               | Änderungsart                                             |
| --------------------------------------------------- | -------------------------------------------------------- |
| `packages/core/src/tools/agent/agent.ts`           | Neuer `isolation`-Parameter plus Worktree-Erstellungs-/Löschlogik |
| `packages/core/src/tools/agent/fork-subagent.ts`   | Neues `buildWorktreeNotice()` und Einspritzen im Worktree-Modus |
| `packages/core/src/services/gitWorktreeService.ts` | Neue `createAgentWorktree()`/`removeAgentWorktree()`      |
| `packages/core/src/services/worktreeCleanup.ts`    | Neu: Logik zur automatischen Bereinigung abgelaufener Worktrees |

---

### Phase C: Sitzungsintegrität (SessionService-Persistierung + UI-Sicherheitsnetz)

**Ziel:** Der Worktree-Zustand kann nach einer Sitzungsunterbrechung wiederhergestellt werden, der Benutzer sieht immer, in welchem Worktree er sich befindet, und beim Verlassen der Sitzung gibt es eine Sicherheitsabfrage.

**Zu implementierende Funktionen:**

_SessionService Worktree-Zustand persistieren + `--resume` Wiederherstellung:_

- `SessionService` erweitern um `WorktreeSession`-Felder, die `{ slug, worktreePath, worktreeBranch, originalCwd, originalBranch }` speichern
- `EnterWorktreeTool` ruft `sessionService.setWorktreeSession()` auf, um den Zustand zu schreiben
- `ExitWorktreeTool` ruft `sessionService.clearWorktreeSession()` auf, um den Zustand zu löschen
- `--resume`-Startpfad liest dieses Feld, stellt `targetDir` wieder her und injiziert dem Modell einen Kontexthinweis

_Post-Creation-Setup:_

- Nach Worktree-Erstellung automatisch `git config core.hooksPath <mainRepo>/.git/hooks` ausführen, um sicherzustellen, dass Commits im Worktree das gleiche Hook-Verhalten wie das Hauptrepo haben

_StatusLine Worktree-Anzeige:_

- `UIStateContext` erhält neues Feld `activeWorktree` (aus Session-Zustand gelesen), wird beim Betreten/Verlassen eines Worktrees aktualisiert
- `StatusLineCommandInput`-Payload erhält neues Feld `worktree?: { slug: string; branch: string }`, das von benutzerdefinierten Statusline-Skripten verwendet werden kann
- `Footer` zeigt bei nicht-leerem `activeWorktree` eine Zeile `⎇ <branch> (<slug>)` an, ohne dass der Benutzer ein Statusline-Skript konfigurieren muss, um grundlegende Sichtbarkeit zu gewährleisten

_WorktreeExitDialog:_

- Neue Komponente `WorktreeExitDialog.tsx`, angelehnt an vorhandene Dialog-Implementierung
- Ändern der Behandlung der Exit-Tasten (Strg+C/Strg+D): Bei gesetztem `activeWorktree` nach erstem Drücken abfangen und den Dialog anzeigen, in dem der Benutzer zwischen „Behalten“ und „Löschen“ wählen kann
- Keep-/Remove-Operationen nutzen die vorhandenen Pfade von `ExitWorktreeTool`

**Betroffene Dateien:**

| Datei                                                          | Änderungsart                                                               |
| ------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `packages/core/src/services/sessionService.ts`                | Neues `WorktreeSession`-Feld sowie Lese-/Schreibmethoden                   |
| `packages/core/src/tools/enter-worktree.ts`                   | Aufruf von `sessionService.setWorktreeSession()`                           |
| `packages/core/src/tools/exit-worktree.ts`                    | Aufruf von `sessionService.clearWorktreeSession()`                         |
| `packages/core/src/services/gitWorktreeService.ts`            | Nach `createUserWorktree()`/`createAgentWorktree()` zusätzlich `core.hooksPath` setzen |
| `packages/cli/src/ui/contexts/UIStateContext.tsx`             | Neues `activeWorktree`-Feld und set/delete-Aktion                          |
| `packages/cli/src/ui/hooks/useStatusLine.ts`                  | `StatusLineCommandInput` um `worktree`-Feld ergänzt                        |
| `packages/cli/src/ui/components/Footer.tsx`                   | Eingebaute Worktree-Zeilenanzeige                                          |
| `packages/cli/src/ui/components/WorktreeExitDialog.tsx`       | Neu                                                                        |
| `packages/cli/src/ui/components/DialogManager.tsx`            | Registrierung von `WorktreeExitDialog`                                     |
| `packages/cli/src/ui/components/ExitWarning.tsx` oder Tastenbehandlung | Erkennung von `activeWorktree` und Abfangen der Exit-Taste       |

---

### Phase D: Startkonfiguration (`--worktree` CLI-Flag + Verzeichnis-Symlink + PR-Referenz)

**Ziel:** Direktes Betreten eines Worktrees beim Start, Reduzierung des Festplattenaufwands bei großen Projekten durch Verzeichnis-Symlinks, sowie schnelles Erstellen eines Worktrees basierend auf einem Pull Request über PR-Referenz.

**Umfang:** Drei Funktionen werden in einer Phase gemeinsam umgesetzt, da sie alle am selben Starteinstiegspunkt hängen und Symlink/PR-Fetch beide sofort nach der Worktree-Erstellung ausgeführt werden müssen – eine separate Aufteilung würde die Bootstrap-Sequenz wiederholt ändern.

#### D-1: `--worktree [name]` CLI-Start-Flag

**Parameterform:** yargs-Option akzeptiert drei Formen:

| Form                      | Verhalten                                                                 |
| ------------------------- | ------------------------------------------------------------------------- |
| `qwen --worktree`         | Bare Flag, generiert automatisch einen Slug (`{Adjektiv}-{Nomen}-{6hex}`) |
| `qwen --worktree my-name` | Expliziter Slug, folgt denselben Slug-Validierungsregeln wie `EnterWorktreeTool` |
| `qwen --worktree=my-name` | Äquivalent zur vorherigen Form                                            |
Kein kurzer Alias `-w` (qwen-code behält kurze Aliase nur für die am häufigsten verwendeten Parameter vor, um Namenskonflikte zu vermeiden).

**Startreihenfolge:** Der Worktree wird an folgenden Stellen erstellt:

1. `parseArguments()` parst argv (bereits vorhanden)
2. Resume Picker (bereits vorhanden, Zeile 588-629 von `gemini.tsx`)
3. `loadCliConfig()` initialisiert Config + Auth (bereits vorhanden, Zeile 643-653)
4. **Neu:** Falls `argv.worktree !== undefined`, wird `createUserWorktree()` aufgerufen
   - Sidecar schreiben (`writeWorktreeSession()`)
   - `process.chdir(worktreePath)` setzen, gleichzeitig `Config.setTargetDir(worktreePath)`
   - Re-attach-Pfad für denselben Worktree: Überspringe `git worktree add` und chdir in-place (wird in Phase 6 behoben). Kombinationen von `--resume` × `--worktree` mit unterschiedlichem projectHash schlagen in der Session-Suche fehl, siehe unten unter "Priorität gegenüber `--resume`".
5. Hauptschleife (TUI / Headless `-p` / ACP – alle drei Einstiegspunkte müssen Schritt 4 durchlaufen)

**Unterschied zur Vereinfachung von Phase A:** Das `EnterWorktreeTool` aus Phase A ändert **nicht** `Config.targetDir`; es verlässt sich darauf, dass das Modell aus dem Tool-Ergebnis den absoluten Pfad ausliest und damit weiterarbeitet. Das CLI-Flag von Phase D wirkt bereits beim Start, ohne dass ein laufender Modellkontext kompatibel sein muss. Daher wird **direkt** `targetDir` und `process.cwd()` umgeschaltet – das bietet eine stärkere Isolationsgarantie. Die beiden Pfade verhalten sich unterschiedlich, was in der Benutzerdokumentation erläutert werden muss.

**Verhalten beim Beenden:** Der vorhandene `WorktreeExitDialog` wird wiederverwendet (bereits in Phase C implementiert). Zweimaliges Drücken von Ctrl+C/D → Benutzer wählt zwischen keep / remove / cancel. Kein neuer Codepfad erforderlich.

**Priorität gegenüber `--resume`:**

Da die Session-Speicherung mit `projectHash(process.cwd())` als Schlüssel erfolgt und `--worktree` bereits vor dem Resume Picker / `loadCliConfig` das Verzeichnis zum Worktree wechselt, ist es **architektonisch nicht erreichbar**, eine Session, die in Worktree X gestartet wurde, von Worktree Y aus fortzusetzen (die projectHashs sind unterschiedlich, die Session-Dateien liegen in verschiedenen Verzeichnissen). Die folgende Tabelle spiegelt das tatsächliche Verhalten nach der D-1-Implementierung + dem Phase-6-Re-attach-Fix wider:

| `--resume`-Status                     | `--worktree`-Status                    | Ergebnis                                                                                             |
| ------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Kein                                  | Kein                                   | Normale Session, kein Worktree                                                                       |
| Kein                                  | Ja (neuer Slug)                        | Neuen Worktree erstellen                                                                             |
| Kein                                  | Ja (bereits vorhandener Slug)          | **Re-attach** an vorhandenen Worktree (Phase-6-Fix)                                                  |
| Ja                                    | Kein                                   | Alten Worktree wiederherstellen (Phase-C-Verhalten, Sidecar-Treffer führt zu Reminder-Injection)     |
| Ja (sid stammt aus demselben Worktree) | Ja (gleicher Slug, Re-attach)          | Re-attach + Session-Treffer: normales Resume                                                         |
| Ja (sid stammt aus Main Checkout)    | Ja (beliebiger Slug)                   | **Session-Suche fehlgeschlagen**: `No saved session found with ID …`, exit 1. Dokumentierte Einschränkung |
| Ja (sid stammt aus Worktree X)       | Ja (Slug Y, X != Y)                    | Wie oben, Session kann über verschiedene projectHashs nicht gefunden werden                          |


Eine Überschreibung des projectHash (Übertragen einer `--worktree`-Session zwischen verschiedenen Worktrees / Main Checkout) würde eine Verankerung des Storages auf Repo-Root-Ebene anstelle des cwd-abgeleiteten projectHash erfordern. Dies gehört in den Bereich einer zukünftigen Config-Umstrukturierung. Der `overrodeResumedWorktree`-Zweig in `persistStartupWorktreeSidecar` bleibt erhalten, damit er nach der Umstrukturierung automatisch greift; im aktuellen Produktionspfad wird er nicht ausgelöst.

#### D-2: Konfigurationsoption `worktree.symlinkDirectories`

**Schema:**

```jsonc
{
  "worktree": {
    "symlinkDirectories": ["node_modules", "dist", ".turbo"],
  },
}
```

- Typ: `string[]`, Standardwert `undefined` (deaktiviert, Opt-in)
- Der Namespace `worktree` auf oberster Ebene ist neu (wird in `settingsSchema.ts` alphabetisch zwischen `tools` und `ui` eingefügt)
- Pfade sind **relativ zum Haupt-Repo-Root**; absolute Pfade oder Pfade mit `..` werden durch einen Path-Traversal-Guard abgewiesen

**Wirkungsbereich:** Alle von der generischen Ebene erstellten Worktrees, einschließlich:

- `EnterWorktreeTool` (Phase A)
- `AgentTool` `isolation: 'worktree'` (Phase B)
- `--worktree` CLI-Flag (Phase D-1)

Worktrees der Arena durchlaufen nicht die generische Ebene und **werden** von dieser Konfiguration **nicht** beeinflusst.

**Implementierungsort:** `GitWorktreeService.performPostCreationSetup()` – direkt im Anschluss an die bestehende `configureHooksPath()` (bereits in Phase C etabliertes Muster). Neue Methode `symlinkConfiguredDirectories()` wird hinzugefügt, die für jeden Eintrag `fs.symlink(absSource, absDest, 'dir')` aufruft.

**Fehlerbehandlung (Fail-Open):**

| Szenario                           | Verhalten                                       |
| ---------------------------------- | ----------------------------------------------- |
| Quellverzeichnis existiert nicht (ENOENT)       | Still überspringen, Debug-Log                   |
| Zielpfad existiert bereits (EEXIST)            | Still überspringen, Debug-Log (keine Überschreibung) |
| Path Traversal (`../`, absolute Pfade usw.)    | Eintrag ablehnen, Debug-Log Warnung             |
| Andere I/O-Fehler                     | Debug-Log Warnung, mit restlichen Einträgen fortfahren |

Die Worktree-Erstellung selbst wird **nicht** aufgrund eines fehlgeschlagenen Symlinks abgebrochen – identisch mit dem "Best-Effort-Post-Creation-Setup"-Prinzip von `configureHooksPath()`.

#### D-3: PR-Referenzauflösung (`--worktree=#<N>` / vollständige URL)

**Unterstützte Formate:**

| Form                                                            | Aufgelöste PR-Nummer |
| --------------------------------------------------------------- | -------------------- |
| `--worktree=#123`                                               | 123                  |
| `--worktree '#123'`                                             | 123                  |
| `--worktree https://github.com/foo/bar/pull/123`                | 123                  |
| `--worktree https://gh.enterprise.com/foo/bar/pull/123?baz=qux` | 123                  |

**Slug- und Branch-Namensgebung:**

- Slug: `pr-<N>` (spezielles reserviertes Präfix, unterscheidet sich von Benutzer-Slugs)
- Branch: `worktree-pr-<N>` (übernimmt die bestehende `worktree-<slug>`-Namenskonvention von qwen-code; verwendet nicht die direkte `pr-<N>`-Benennung von claude-code, um Konflikte mit lokalen `pr-<N>`-Branches zu vermeiden)

**Fetch-Strategie:**

```
git fetch origin pull/<N>/head
→ FETCH_HEAD als Basis für den neuen Worktree verwenden
```

Keine Abhängigkeit von der `gh`-CLI – reines `git fetch`, unterstützt jede GitHub-Instanz (öffentlich oder Enterprise), solange das Remote `origin` auf GitHub zeigt.

**Fehlerpfade:**

| Szenario                              | Fehlermeldung                                                                                |
| ------------------------------------- | -------------------------------------------------------------------------------------------- |
| Remote `origin` fehlt                 | `--worktree=#<N> requires an "origin" remote that points at GitHub.`                         |
| `git fetch` schlägt fehl             | `Failed to fetch PR #<N>: PR may not exist or origin remote is unreachable.`                 |
| Netzwerk-Timeout (30s)                | Wie oben, mit Zusatz `(timeout)`                                                             |
| Remote `origin` ist nicht GitHub      | Keine aktive Prüfung; `git fetch` schlägt dann von selbst fehl (PR-Protokoll ist GitHub-spezifisch) |
**Beziehung zu D-2:** PR-Worktree wendet **ebenfalls** `symlinkDirectories` an (Nutzer erwarten, sofort Tests im PR ausführen zu können, Abhängigkeitsverzeichnisse müssen wiederverwendet werden).

#### Betroffene Dateien

| Datei                                                         | Änderungstyp                                                                                                                             |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/cli/src/config/config.ts`                          | yargs neue Option `--worktree`; `CliArgs` Interface erhält `worktree?: string \| boolean`                                                |
| `packages/cli/src/gemini.tsx`                                | Aufruf des neuen Helpers `setupStartupWorktree()` nach `loadCliConfig()`, vor der Hauptschleife                                         |
| `packages/cli/src/startup/worktreeStartup.ts`                | Neu: `setupStartupWorktree()` behandelt Slug-Parsing, PR-Fetch, Sidecar-Schreiben, CWD-Wechsel                                           |
| `packages/cli/src/nonInteractiveCli.ts`                      | Verwendet denselben Helper (bestehende `restoreWorktreeContext` Injectionslogik, keine Änderung nötig)                                   |
| `packages/cli/src/acp-integration/acpAgent.ts`               | Verwendet denselben Helper                                                                                                               |
| `packages/core/src/services/gitWorktreeService.ts`           | Neu: `parsePRReference()`, `fetchPullRequestRef()`, `symlinkConfiguredDirectories()`; `createUserWorktree()` akzeptiert optionalen `baseBranchRef` Parameter |
| `packages/cli/src/config/settingsSchema.ts`                  | Neuer Top-Level-Eintrag `worktree.symlinkDirectories: string[]`                                                                          |
| `packages/vscode-ide-companion/schemas/settings.schema.json` | Neu generiert                                                                                                                            |
| `docs/users/features/worktree.md`                            | Neues Kapitel „Quick Start CLI flag“, Settings-Tabelle um eine Zeile erweitert                                                           |

#### Sicherheit und Rollback

- **Fail-Open vs. Fail-Close:** Fehler bei Symlinks/Hooks **unterbrechen** die Worktree-Erstellung **nicht** (gleiches Muster wie Phase C); Fehler beim PR-Fetch **unterbrechen** den Start (ohne Base-Ref kann kein Worktree erstellt werden); Fehler bei der Slug-Validierung **unterbrechen** den Start (konsistent mit `EnterWorktreeTool`).
- **Path Traversal:** Alle Einträge in `symlinkDirectories` müssen nach Auflösung noch innerhalb von `repoRoot` liegen, andernfalls wird der Eintrag abgelehnt und geloggt.
- **PR-Fetch-Timeout:** Hartes Timeout von 30 Sekunden, um hängende Netzwerke nicht den Start blockieren zu lassen.
- **Nebenwirkungen des CWD-Wechsels:** Nach dem Ändern von `process.cwd()` wird die Auflösung relativer Pfade (z. B. `--prompt-file ./foo.txt`) beeinflusst. **Gegenmaßnahme:** Alle relativen Pfadargumente werden vor dem CWD-Wechsel normalisiert (konkret einmalig zu Beginn von `setupStartupWorktree()`).

#### Offene Fragen

1. **`--worktree-keep-on-exit`?** claude-code hat das nicht. Braucht qwen-code ein CLI-Flag, damit der Exit-Dialog standardmäßig „Behalten“ wählt? Vorschlag: **zunächst nicht hinzufügen**, auf Nutzerfeedback warten.
2. **Benötigt `worktree.symlinkDirectories` ein Per-Project-Override?** Die aktuellen Einstellungen unterstützen bereits eine Drei-Ebenen-Zusammenführung (user/workspace/project), keine Sonderbehandlung nötig.
3. **Soll der PR-Fetch den `merge`-Ref (`pull/<N>/merge`, also den mit dem Base gemergten Ref) statt `head` holen?** claude-code verwendet `head` mit der Begründung, dass Nutzer normalerweise die tatsächlichen Änderungen des PR sehen möchten. Wir folgen dieser Wahl.

---

### Zukunft: Erweiterte Funktionen (nach Bedarf)

Die folgenden Funktionen sind für spezifischere Anwendungsszenarien gedacht, werden in dieser Phase nicht eingeplant und erst nach Klärung des Nutzerbedarfs umgesetzt.

| Funktion                    | Beschreibung                                                                                                                |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Sparse Checkout             | Konfigurationsoption `worktree.sparsePaths`: In großen Monorepos nur bestimmte Pfade auschecken, verkürzt Erstellungszeit und Speicherverbrauch |
| `.worktreeinclude`-Datei    | Automatisches Kopieren von gitignore-Dateien (`.env`, `secrets.json` usw.) in den Worktree                                   |
| tmux-Integration            | `--worktree --tmux`: Worktree-Session in einem neuen tmux-Fenster starten                                                  |
