# Worktree universelles Fähigkeitsdesign

## Problemstellung

qwen-code hat derzeit nur eine interne Worktree-Implementierung (`GitWorktreeService`) für das Arena-Multi-Modell-Vergleichsszenario. Benutzer können Worktrees in normalen Sitzungen nicht zur Isolation nutzen, und `AgentTool` unterstützt keine Erstellung isolierter Worktree-Umgebungen für Sub-Agenten.

Das Ziel ist es, Worktree zu einer universellen Fähigkeit zu machen, die sowohl Sitzungsebene- als auch Agentenebene-Isolation unterstützt, während die bestehende Arena-Funktionalität vollständig erhalten bleibt.

## Statusvergleich

| Funktion                            | qwen-code       | claude-code | Phase   |
| ----------------------------------- | --------------- | ----------- | ------- |
| `EnterWorktree`-Tool                | ✅ (Phase A)    | ✅          | —       |
| `ExitWorktree`-Tool                 | ✅ (Phase A)    | ✅          | —       |
| `AgentTool` `isolation: 'worktree'` | ✅ (Phase B)    | ✅          | —       |
| Automatische Bereinigung abgelaufener Worktrees | ✅ (Phase B) | ✅ | — |
| Worktree-Sitzungsstatus persistieren und wiederherstellen | ❌ | ✅ | Phase C |
| Post-creation Setup (Hooks-Konfiguration) | ❌ | ✅ | Phase C |
| StatusLine Worktree-Statusanzeige   | ❌              | ✅          | Phase C |
| WorktreeExitDialog (Austrittshinweis) | ❌            | ✅          | Phase C |
| `--worktree` CLI-Startflag          | ✅ (Phase D)    | ✅          | —       |
| Symbolische Link-Verzeichnisse (node_modules etc.) | ✅ (Phase D) | ✅ | — |
| PR-Referenz (`--worktree=#123`)     | ✅ (Phase D)    | ✅          | —       |
| Sparse Checkout                     | ❌              | ✅          | Future  |
| tmux-Integration                    | ❌              | ✅          | Future  |
| Arena Multi-Modell Worktree-Isolation | ✅ (qwen-exklusiv) | ❌       | —       |
| Dirty-State-Überschreibung (stash + copy) | ✅       | ✅          | —       |
| Baseline-Commit-Tracking            | ✅ (qwen-exklusiv) | ❌       | —       |

## Entwurfsprinzipien

**Worktree ist eine universelle Fähigkeit, Arena ist eine darüber liegende Anwendung.**

- Universelle Worktree-Ebene: `EnterWorktree`/`ExitWorktree`-Tools, `AgentTool`-Parameter `isolation`, Sitzungszustandsverwaltung, automatische Bereinigung
- Arena-Ebene: Multi-Modell-Parallelplanung, `worktreeBaseDir`-benutzerdefinierter Pfad, Massenerstellung und Diff-Vergleich. Verwendet weiterhin die bestehende Logik von `GitWorktreeService.setupWorktrees()`, unbeeinflusst von Änderungen auf der universellen Ebene.

`AgentTool` mit `isolation: 'worktree'` folgt nur dem universellen Pfad. Arena erstellt intern keine Worktrees über diesen Parameter; beide Pfade sind unabhängig.

## Pfade und Konfiguration

### Universeller Worktree-Pfad

Worktrees, die mit dem `EnterWorktree`-Tool oder `AgentTool` `isolation: 'worktree'` erstellt werden, werden fest abgelegt unter:

```
{git-Repository-Root}/.qwen/worktrees/{slug}
```

Der Pfad ist nicht konfigurierbar. slug-Namensregeln:

- Benutzersitzungs-Worktree: vom Benutzer angegebener Name oder automatisch generiert (Format: `{Adjektiv}-{Nomen}-{4-stellige Zufallszahl}`)
- Agent-Worktree: `agent-{7-stellige Hex-Zufallszahl}`

### Arena-Worktree-Pfad (bestehend, bleibt unverändert)

Der Arena-Worktree-Pfad wird durch `agents.arena.worktreeBaseDir` gesteuert, Standard `~/.qwen/arena` (`ArenaManager.ts:125`), vollständig unabhängig vom universellen Pfad, keine Änderungen.

### Erweiterte Konfiguration

| Konfiguration                     | Typ        | Verwendung                                                                        | Phase    |
| --------------------------------- | ---------- | --------------------------------------------------------------------------------- | ------- |
| `ui.hideBuiltinWorktreeIndicator` | `boolean`  | Ausblenden der eingebauten `⎇ worktree-… (…)`-Zeile im Footer, für benutzerdefinierte Statusleiste | Phase C |
| `worktree.symlinkDirectories`     | `string[]` | Symbolische Links der angegebenen Verzeichnisse (z. B. `node_modules`) in den Worktree, um Speicherplatz zu sparen | Phase D |
| `worktree.sparsePaths`            | `string[]` | Git Sparse-Checkout-Kegelmodus, nur die angegebenen Pfade in großen Monorepos auschecken | Future  |

Phase A / B fügen keine neuen Konfigurationselemente hinzu.

## Tool-Design

### EnterWorktree

**Auslösebedingung:** Der Benutzer verwendet explizit Begriffe wie "Starte einen Worktree", "Verwende einen Worktree", "Erstelle einen Worktree" usw. Es sollte nicht automatisch ausgelöst werden, wenn der Benutzer "Fehler beheben", "Funktion entwickeln" sagt.

**Eingabe-Schema:**

```
name?: string  // Optional, slug-Format: Buchstaben/Ziffern/Punkte/Unterstriche/Bindestriche, max. 64 Zeichen
```

**Verhalten:**

1. Überprüfen, ob aktuell kein Worktree aktiv ist (Verschachtelung verhindern)
2. Auflösen des Git-Repository-Roots (behandelt Fälle, in denen man sich bereits in einem Unterverzeichnis befindet)
3. Aufruf von `GitWorktreeService` zum Erstellen des Worktrees, Pfad: `.qwen/worktrees/{slug}`
4. Schreiben der Worktree-Sitzung in `SessionService`
5. Wechseln des Arbeitsverzeichnisses in den Worktree-Pfad
6. Löschen des Dateicaches

**Ausgabe:** `worktreePath`, `worktreeBranch`, `message`

### ExitWorktree

**Auslösebedingung:** Der Benutzer sagt "Worktree verlassen", "Worktree beenden", "Zurückgehen" usw.

**Eingabe-Schema:**

```
action: 'keep' | 'remove'
discard_changes?: boolean  // Nur gültig bei action='remove'
```

**Sicherheitswächter:**

- Bearbeitet nur den Worktree, der in dieser Sitzung über `EnterWorktree` erstellt wurde
- Bei `action='remove'` und vorhandenen nicht committeten Änderungen wird die Aktion verweigert (es sei denn, `discard_changes: true`)

**Verhalten:**

- `keep`: Löscht den Worktree-Status in der Sitzung, behält das Worktree-Verzeichnis und den Branch, stellt das ursprüngliche Arbeitsverzeichnis wieder her
- `remove`: Löscht das Worktree-Verzeichnis, löscht den entsprechenden Git-Branch, löscht den Sitzungsstatus, stellt das ursprüngliche Arbeitsverzeichnis wieder her

**Ausgabe:** `action`, `originalCwd`, `worktreePath`, `worktreeBranch`

## Benutzerauslösemethoden

| Methode                   | Beispiel                                                       | Implementierungsphase |
| ------------------------- | -------------------------------------------------------------- | --------------------- |
| Explizite Anfrage in der Sitzung | Benutzer sagt "Beginne die Arbeit in einem Worktree" → Modell ruft EnterWorktree auf | Phase A |
| Agent-Isolation           | Modell setzt `isolation: 'worktree'` für Sub-Agenten           | Phase B |
| CLI-Startflag             | `qwen --worktree my-feature`                                   | Phase D |

Keine Slash-Befehle. Die Worktree-Auslösung in der Sitzung erfordert explizite Erwähnung durch den Benutzer; `isolation: 'worktree'` ist das Szenario, in dem das Modell selbstständig entscheidet.

## Stufenweise Implementierungsplanung

### Phase A: Kern-Tools (Benutzersitzungsebene Worktree)

**Ziel:** Benutzer können in der Sitzung Worktrees betreten/verlassen.

**Zu implementierende Funktionen:**

- `EnterWorktree`-Tool: Erstellen eines Worktrees, Wechseln des Arbeitsverzeichnisses, Aufzeichnen des Sitzungsstatus
- `ExitWorktree`-Tool: Zwei Austrittsmodi keep / remove, Sicherheitswächter
- `GitWorktreeService`-Erweiterung: Neue Methoden `createUserWorktree()` / `removeUserWorktree()` für einzelne Benutzersitzungen, Wiederverwendung der vorhandenen Git-Operationslogik, keine Änderungen an den von Arena verwendeten Batch-Schnittstellen
- `SessionService`-Erweiterung: Neues `WorktreeSession`-Feld, das `{ slug, worktreePath, worktreeBranch, originalCwd, originalBranch }` aufzeichnet; Wiederherstellung des Worktree-Arbeitsverzeichnisses bei `--resume`
- Tool-Prompt: Schreiben einer Gebrauchsanweisung für jedes Tool, die klarstellt, wann es aufgerufen werden soll und wann nicht

**Betroffene Dateien:**

| Datei                                                       | Änderungstyp                                       |
| ---------------------------------------------------------- | -------------------------------------------------- |
| `packages/core/src/tools/tool-names.ts`                    | Neue Konstanten `ENTER_WORKTREE`, `EXIT_WORKTREE` |
| `packages/core/src/tools/EnterWorktreeTool/`               | Neues Verzeichnis: `EnterWorktreeTool.ts`, `prompt.ts` |
| `packages/core/src/tools/ExitWorktreeTool/`                | Neues Verzeichnis: `ExitWorktreeTool.ts`, `prompt.ts` |
| `packages/core/src/services/gitWorktreeService.ts`         | Neue Benutzersitzungsschnittstelle (ohne Änderungen an Arena-Schnittstellen) |
| `packages/core/src/services/sessionService.ts`             | Neues `WorktreeSession`-Feld sowie Lese-/Schreibmethoden |
| `packages/core/src/tools/` Registrierungseinstiegspunkt    | Registrierung neuer Tools                          |

**Nicht im Umfang von Phase A:**

- Agent-Isolation (Phase B)
- Post-Creation-Setup wie Hooks-Konfiguration (Phase C)
- UI-Statusanzeige (Phase C)

---

### Phase B: Agent-Isolation (`AgentTool` `isolation: 'worktree'`) + Beschreibungsaktualisierung

**Ziel:** Das Modell kann temporäre isolierte Worktrees für Sub-Agenten erstellen, die nach Agent-Ende automatisch bereinigt werden; gleichzeitige Aktualisierung betroffener Tool-Beschreibungen und Prompts.

**Zu implementierende Funktionen:**

_Agent-Isolationskern:_

- `AgentTool` erhält neuen Parameter `isolation?: 'worktree'`
- Bei Agent-Start wird ein temporärer Worktree erstellt (slug: `agent-{7hex}`, Pfad: `.qwen/worktrees/agent-{7hex}`)
- Nach Agent-Ende: Keine Änderungen → automatisch löschen; bei Änderungen → behalten, Pfad und Branch in Ergebnis zurückgeben
- Automatische Bereinigung abgelaufener Worktrees: Scan `.qwen/worktrees/`, Muster `agent-{7hex}`, älter als 30 Tage und keine ungepushten Commits → löschen, Fail-closed-Strategie

_Beschreibungs- und Prompt-Aktualisierung:_

- `AgentTool`-Beschreibung um `isolation: 'worktree'`-Parameter ergänzen (Referenz: claude-code `AgentTool/prompt.ts:272`)
- Neue `buildWorktreeNotice()`: Wenn ein geforkter Sub-Agent in einem Worktree läuft, wird ihm Kontexthinweis eingefügt, dass er sich in einem isolierten Worktree befindet, der Pfad vom übergeordneten Agenten geerbt wird und Dateien vor der Bearbeitung erneut gelesen werden müssen (Referenz: claude-code `forkSubagent.ts:buildWorktreeNotice`)

_Keine Änderungen erforderlich:_

- Review-Skill (`SKILL.md`): Review verwendet einen unabhängigen Mechanismus (Pfad `.qwen/tmp/review-pr-<n>`, erstellt über `qwen review fetch-pr`-Befehl), komplett unterschiedlich zum universellen Worktree-Pfad und -Mechanismus, keine Verwechslungsgefahr

**Arena-Kompatibilitätsgarantie:** Arena erstellt keine Worktrees über den Parameter `isolation`. Diese Änderung berührt den Arena-Codepfad nicht.

**Betroffene Dateien:**

| Datei                                               | Änderungstyp                                       |
| --------------------------------------------------- | -------------------------------------------------- |
| `packages/core/src/tools/agent/agent.ts`            | Neuer `isolation`-Parameter und Logik zum Erstellen/Bereinigen von Worktrees |
| `packages/core/src/tools/agent/fork-subagent.ts`    | Neue `buildWorktreeNotice()` und Injektion im Worktree-Modus |
| `packages/core/src/services/gitWorktreeService.ts`  | Neue `createAgentWorktree()` / `removeAgentWorktree()` |
| `packages/core/src/services/worktreeCleanup.ts`     | Neu: automatische Bereinigung abgelaufener Worktrees |

---

### Phase C: Sitzungsintegrität (SessionService-Persistenz + UI-Sicherheitsnetz)

**Ziel:** Worktree-Status nach Sitzungsunterbrechung wiederherstellbar, Benutzer wissen stets, in welchem Worktree sie sind, Sicherheitshinweis beim Verlassen der Sitzung.

**Zu implementierende Funktionen:**

_SessionService Worktree-Status-Persistenz + `--resume`-Wiederherstellung:_

- `SessionService` erweitert das `WorktreeSession`-Feld, das `{ slug, worktreePath, worktreeBranch, originalCwd, originalBranch }` aufzeichnet
- `EnterWorktreeTool` ruft `sessionService.setWorktreeSession()` zum Schreiben des Status auf
- `ExitWorktreeTool` ruft `sessionService.clearWorktreeSession()` zum Löschen des Status auf
- Beim Start mit `--resume` wird dieses Feld gelesen, `targetDir` wiederhergestellt und dem Modell ein Kontexthinweis eingefügt

_Post-Creation-Setup:_

- Nach Erstellung des Worktrees wird automatisch `git config core.hooksPath <mainRepo>/.git/hooks` ausgeführt, um sicherzustellen, dass Commits im Worktree das gleiche Hooks-Verhalten wie im Haupt-Repository haben

_StatusLine Worktree-Anzeige:_

- `UIStateContext` erhält neues `activeWorktree`-Feld (aus Sitzungsstatus gelesen), aktualisiert beim Betreten/Verlassen des Worktrees
- `StatusLineCommandInput` erhält neues Feld `worktree?: { slug: string; branch: string }` für benutzerdefinierte Statusleisten-Skripte
- `Footer` zeigt bei nicht leerem `activeWorktree` eine eingebaute Zeile `⎇ <branch> (<slug>)` an, ohne dass der Benutzer ein Statusleisten-Skript konfigurieren muss, um grundlegende Sichtbarkeit zu erhalten

_WorktreeExitDialog:_

- Neue Komponente `WorktreeExitDialog.tsx`, angelehnt an bestehende Dialog-Schreibweise
- Änderung der Beendigungstasten (Ctrl+C / Ctrl+D): Wenn `activeWorktree` nicht leer ist, wird die zweite Bestätigung abgefangen und ein Dialog angezeigt, der den Benutzer auffordert, keep oder remove zu wählen
- keep / remove verwenden bestehende Pfade von `ExitWorktreeTool`

**Betroffene Dateien:**

| Datei                                                         | Änderungstyp                                       |
| ------------------------------------------------------------- | ------------------------------------------------- |
| `packages/core/src/services/sessionService.ts`                | Neues `WorktreeSession`-Feld sowie Lese-/Schreibmethoden |
| `packages/core/src/tools/enter-worktree.ts`                  | Aufruf von `sessionService.setWorktreeSession()`  |
| `packages/core/src/tools/exit-worktree.ts`                   | Aufruf von `sessionService.clearWorktreeSession()` |
| `packages/core/src/services/gitWorktreeService.ts`           | Nach `createUserWorktree()` / `createAgentWorktree()` Anhängen der `core.hooksPath`-Konfiguration |
| `packages/cli/src/ui/contexts/UIStateContext.tsx`             | Neues Feld `activeWorktree` und set/clear-Action |
| `packages/cli/src/ui/hooks/useStatusLine.ts`                 | Neues Feld `worktree` in `StatusLineCommandInput` |
| `packages/cli/src/ui/components/Footer.tsx`                   | Eingebaute Anzeige der Worktree-Zeile            |
| `packages/cli/src/ui/components/WorktreeExitDialog.tsx`       | Neu erstellt                                     |
| `packages/cli/src/ui/components/DialogManager.tsx`            | Registrierung von `WorktreeExitDialog`          |
| `packages/cli/src/ui/components/ExitWarning.tsx` oder Tastenbehandlung | Erkennung von `activeWorktree` und Abfangen der Beendigung |

---

### Phase D: Startkonfiguration (`--worktree` CLI-Flag + Verzeichnis-Symbolische Links + PR-Referenz)

**Ziel:** Unterstützung des direkten Eintritts in einen Worktree beim Start, Reduzierung des Speicherplatzes großer Projekte durch symbolische Links und schnelle Erstellung eines Worktrees basierend auf einem Pull Request über PR-Referenz.

**Umfang:** Drei Funktionen werden in einer Phase gemeinsam umgesetzt, da sie alle am gleichen Starteinstiegspunkt hängen und Symlink-/PR-Fetch beide unmittelbar nach der Worktree-Erstellung ausgeführt werden müssen – eine separate Aufteilung würde die Bootstrap-Sequenz mehrmals ändern.

#### D-1: `--worktree [name]` CLI-Startflag

**Parameterform:** Yargs-Option akzeptiert drei Formen:

| Form                         | Verhalten                                                   |
| ---------------------------- | ----------------------------------------------------------- |
| `qwen --worktree`            | Bare Flag, automatische slug-Erzeugung (`{Adjektiv}-{Nomen}-{6hex}`) |
| `qwen --worktree my-name`    | Expliziter slug, übernimmt slug-Validierungsregeln von `EnterWorktreeTool` |
| `qwen --worktree=my-name`    | Äquivalent zur vorherigen                                   |

Kein kurzer Alias `-w` (qwen-code reserviert kurze Aliase nur für die häufigsten Parameter, um Namenskonflikte zu vermeiden).

**Startsequenz:** Der Worktree wird an folgender Stelle erstellt:

1. `parseArguments()` parst argv (bereits vorhanden)
2. Resume-Auswahl (bereits vorhanden, Zeile 588-629 von `gemini.tsx`)
3. `loadCliConfig()` initialisiert Config + auth (bereits vorhanden, Zeile 643-653)
4. **Neu:** Wenn `argv.worktree !== undefined`, Aufruf von `createUserWorktree()`
   - Schreiben in Sidecar (`writeWorktreeSession()`)
   - Setzen von `process.chdir(worktreePath)` gleichzeitig `Config.setTargetDir(worktreePath)`
   - Re-attach-Pfad desselben Worktrees: Überspringen von `git worktree add` und direktes chdir (Phase-6-Fix). Kombination `--resume` × `--worktree` über verschiedene projectHash hinweg schlägt in der Session-Lookup-Phase fehl, siehe unten "Priorität mit `--resume`".
5. Hauptschleife (TUI / headless `-p` / ACP – alle drei Einstiegspunkte müssen Schritt 4 durchlaufen)

**Unterschied zu Phase-A-Vereinfachung:** Phase A's `EnterWorktreeTool` ändert **nicht** `Config.targetDir`, das Modell liest den absoluten Pfad aus dem Tool-Ergebnis und verwendet ihn weiter. Das CLI-Flag von Phase D wirkt bereits in der Startphase, es gibt keinen laufenden Modellkontext, der kompatibel sein muss, daher wird **direkt `targetDir` und `process.cwd()` umgeschaltet** – eine stärkere Isolationsgarantie. Die beiden Pfade verhalten sich unterschiedlich, was in der Benutzerdokumentation erläutert werden muss.

**Austrittsverhalten:** Wiederverwendung des vorhandenen `WorktreeExitDialog` (bereits in Phase C implementiert). Strg+C/D zweimal auslösen → Benutzer wählt zwischen keep / remove / cancel. Kein neuer Codepfad erforderlich.

**Priorität mit `--resume`:**

Da die Sitzungsspeicherung mit `projectHash(process.cwd())` als Schlüssel erfolgt und `--worktree` bereits vor der Resume-Auswahl / `loadCliConfig` per chdir in den Worktree wechselt, ist es **architektonisch unmöglich**, eine "in Worktree X gestartete Sitzung aus Worktree Y heraus fortzusetzen" (die projectHash sind unterschiedlich, die Sitzungsdateien liegen in verschiedenen Verzeichnissen). Die folgende Tabelle zeigt das tatsächliche Verhalten nach D-1-Implementierung + Phase-6-Re-attach-Fix:

| `--resume`-Status                 | `--worktree`-Status                  | Ergebnis                                                                                      |
| --------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------- |
| Kein                              | Kein                                 | Normale Sitzung, kein Worktree                                                                |
| Kein                              | Ja (neuer slug)                      | Neuen Worktree erstellen                                                                      |
| Kein                              | Ja (bereits vorhandener slug)        | **Re-attach** an vorhandenen Worktree (Phase-6-Fix)                                           |
| Ja                                | Kein                                 | Alten Worktree wiederherstellen (Phase-C-Verhalten, Sidecar-Treffer injiziert Reminder)       |
| Ja (sid stammt aus selbem Worktree) | Ja (selber slug, re-attach)        | Re-attach + Session-Treffer: Normales Resume                                                  |
| Ja (sid stammt aus main checkout) | Ja (beliebiger slug)                | **Session-Lookup fehlgeschlagen**: `No saved session found with ID …`, exit 1. Dokumentierte Einschränkung |
| Ja (sid stammt aus Worktree X)    | Ja (slug Y, X != Y)                  | Gleiches Problem, Session kann über verschiedene projectHash nicht gefunden werden            |

Die Semantik eines projectHash-Overrides (Übertrag des `--worktree` zwischen verschiedenen Worktrees / main-Checkout-Sessions) erfordert eine Verankerung des Speichers auf Repository-Root-Ebene statt cwd-abgeleitetem projectHash – dies gehört zu einer zukünftigen Config-Refaktorisierung. Der `overrodeResumedWorktree`-Zweig in `persistStartupWorktreeSidecar` wird für den Fall dieser Refaktorisierung beibehalten, damit er dann automatisch wirkt; derzeit wird er im Produktionspfad nicht ausgelöst.

#### D-2: `worktree.symlinkDirectories`-Konfiguration

**Schema:**

```jsonc
{
  "worktree": {
    "symlinkDirectories": ["node_modules", "dist", ".turbo"],
  },
}
```

- Typ: `string[]`, Standard `undefined` (nicht aktiviert, Opt-in)
- Der oberste Namespace `worktree` ist neu (wird in `settingsSchema.ts` alphabetisch zwischen `tools` und `ui` eingefügt)
- Pfade **relativ zum Haupt-Repository-Root**, absolute Pfade oder Pfade mit `..` werden durch einen Pfad-Traversal-Guard abgelehnt

**Anwendungsbereich:** Alle von der universellen Ebene erstellten Worktrees, einschließlich:

- `EnterWorktreeTool` (Phase A)
- `AgentTool` `isolation: 'worktree'` (Phase B)
- `--worktree` CLI-Flag (Phase D-1)

Arenas Worktrees durchlaufen nicht die universelle Ebene und **bleiben** von dieser Konfiguration **unbeeinflusst**.

**Implementierungsort:** `GitWorktreeService.performPostCreationSetup()` – direkt im Anschluss an die vorhandene `configureHooksPath()` (bereits in Phase C etabliert). Neue Methode `symlinkConfiguredDirectories()`, die für jedes konfigurierte Element `fs.symlink(absSource, absDest, 'dir')` aufruft.

**Fehlerbehandlung (Fail-open):**

| Szenario                     | Verhalten                       |
| ---------------------------- | ------------------------------- |
| Quellverzeichnis existiert nicht (ENOENT) | Stille Überspringung, Debug-Log |
| Zielpfad existiert bereits (EEXIST) | Stille Überspringung, Debug-Log (kein Überschreiben) |
| Pfad-Traversal (`../`, absolute Pfade etc.) | Element ablehnen, Debug-Log-Warnung |
| Andere I/O-Fehler            | Debug-Log-Warnung, Fortsetzung mit nächstem Element |

Die Worktree-Erstellung selbst **wird** wegen eines fehlgeschlagenen Symlinks **nicht abgebrochen** – gleiches "Best-Effort-Post-Creation-Setup"-Prinzip wie `configureHooksPath()`.

#### D-3: PR-Referenzauflösung (`--worktree=#<N>` / vollständige URL)

**Unterstützte Formen:**

| Form                                                             | Aufgelöste PR-Nummer |
| ---------------------------------------------------------------- | -------------------- |
| `--worktree=#123`                                                | 123                  |
| `--worktree '#123'`                                              | 123                  |
| `--worktree https://github.com/foo/bar/pull/123`                 | 123                  |
| `--worktree https://gh.enterprise.com/foo/bar/pull/123?baz=qux` | 123                  |

**Slug- und Branch-Benennung:**

- slug: `pr-<N>` (speziell reserviertes Präfix, zur Unterscheidung von Benutzer-Slugs)
- Branch: `worktree-pr-<N>` (übernimmt qwen-code's existierende `worktree-<slug>`-Namensregel; verwendet nicht claude-code's `pr-<N>`-direkte Benennung, um Konflikte mit lokalen `pr-<N>`-Branches zu vermeiden)

**Fetch-Strategie:**

```
git fetch origin pull/<N>/head
→ FETCH_HEAD als Basis für den neuen Worktree verwenden
```

Nicht abhängig von `gh` CLI – reiner Git-Fetch, unterstützt jede GitHub-Instanz (öffentlich oder Enterprise), solange der `origin`-Remote auf GitHub verweist.

**Fehlerpfade:**

| Szenario                          | Fehlermeldung                                                                 |
| --------------------------------- | ----------------------------------------------------------------------------- |
| `origin`-Remote fehlt             | `--worktree=#<N> erfordert einen "origin"-Remote, der auf GitHub verweist.`   |
| `git fetch` schlägt fehl          | `Fehler beim Abrufen von PR #<N>: PR existiert möglicherweise nicht oder der origin-Remote ist nicht erreichbar.` |
| Netzwerk-Timeout (30s)            | Gleiche Meldung, plus `(Zeitüberschreitung)`                                  |
| `origin`-Remote ist nicht GitHub  | Keine aktive Prüfung, Fehlschlag erfolgt natürlich über `git fetch` (PR-Protokoll ist GitHub-spezifisch) |

**Beziehung zu D-2:** PR-Worktrees **wenden ebenfalls** `symlinkDirectories` an (der Benutzer erwartet, dass er sofort Tests auf dem PR ausführen kann, abhängige Verzeichnisse müssen wiederverwendet werden).

#### Betroffene Dateien

| Datei                                                        | Änderungstyp                                       |
| ------------------------------------------------------------ | -------------------------------------------------- |
| `packages/cli/src/config/config.ts`                          | yargs erhält neue `--worktree`-Option; `CliArgs`-Schnittstelle erhält `worktree?: string \| boolean` |
| `packages/cli/src/gemini.tsx`                                | Nach `loadCliConfig()`, vor der Hauptschleife, Aufruf des neuen `setupStartupWorktree()`-Helpers |
| `packages/cli/src/startup/worktreeStartup.ts`                | Neu: `setupStartupWorktree()` für slug-Auflösung, PR-Fetch, Sidecar-Schreiben, cwd-Wechsel |
| `packages/cli/src/nonInteractiveCli.ts`                      | Wiederverwendung desselben Helpers (bereits vorhandene `restoreWorktreeContext`-Injektionslogik, keine Änderungen nötig) |
| `packages/cli/src/acp-integration/acpAgent.ts`               | Wiederverwendung desselben Helpers                 |
| `packages/core/src/services/gitWorktreeService.ts`           | Neue Methoden: `parsePRReference()`, `fetchPullRequestRef()`, `symlinkConfiguredDirectories()`; `createUserWorktree()` erhält optionalen Parameter `baseBranchRef` |
| `packages/cli/src/config/settingsSchema.ts`                  | Neues Top-Level-Element `worktree.symlinkDirectories: string[]` |
| `packages/vscode-ide-companion/schemas/settings.schema.json` | Neu generieren                                     |
| `docs/users/features/worktree.md`                            | Neuer Abschnitt für Quick Start CLI-Flag, neue Zeile in Settings-Tabelle |

#### Sicherheit und Rollback

- **Fail-open vs Fail-close:** Fehlschlag von Symlink/Hooks **bricht** die Worktree-Erstellung **nicht ab** (gleiches Muster wie Phase C); Fehlschlag von PR-Fetch **bricht** den Start **ab** (ohne Basis-Ref kann kein Worktree erstellt werden); Fehlschlag der slug-Validierung **bricht** den Start **ab** (konsistent mit `EnterWorktreeTool`).
- **Pfad-Traversal:** `symlinkDirectories`-Einträge müssen nach Auflösung innerhalb des `repoRoot` liegen, andernfalls Ablehnung des Eintrags und Log-Eintrag.
- **PR-Fetch-Timeout:** Harte 30-Sekunden-Timeout, um zu verhindern, dass ein nicht antwortendes Netzwerk den Start aufhält.
- **Nebenwirkungen des cwd-Wechsels:** Nach dem Wechsel von `process.cwd()` kann die Auflösung relativer Pfade (z. B. `--prompt-file ./foo.txt`) beeinträchtigt sein. **Gegenmaßnahme:** Vor dem cwd-Wechsel alle relativen Pfadparameter normalisieren (genauer: am Einstieg von `setupStartupWorktree()` einmal normalisieren).

#### Offene Fragen

1. **`--worktree-keep-on-exit`?** claude-code hat es nicht. Braucht qwen-code ein CLI-Flag, das den Exit-Dialog standardmäßig auf keep setzt? Vorschlag: **vorerst nicht hinzufügen**, auf Benutzerfeedback warten.
2. **Muss `worktree.symlinkDirectories` per-Projekt-Override unterstützen?** Die aktuelle Einstellungen unterstützen bereits die dreistufige Zusammenführung von User/Workspace/Project, keine spezielle Behandlung nötig.
3. **Soll PR-Fetch die `merge`-Ref (`pull/<N>/merge`, also den mit der Basis gemergten Ref) statt `head` abrufen?** claude-code wählt `head`. Begründung: Benutzer möchten normalerweise die tatsächlichen Änderungen des PR sehen. Diese Wahl wird übernommen.

---

### Future: Erweiterte Funktionen (nach Bedarf)

Die folgenden Funktionen richten sich an spezifischere Anwendungsszenarien. Sie werden derzeit nicht eingeplant, erst wenn die Benutzeranforderungen klar sind, wird die Implementierung bewertet.

| Funktion                  | Beschreibung                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------ |
| Sparse Checkout           | Konfiguration `worktree.sparsePaths`, nur angegebene Pfade in großen Monorepos auschecken, verkürzt Erstellungszeit und Speicherplatz |
| `.worktreeinclude`-Datei  | Automatisches Kopieren von gitignorierten Dateien (`.env`, `secrets.json` etc.) in den Worktree |
| tmux-Integration          | `--worktree --tmux` startet die Worktree-Sitzung in einem neuen tmux-Fenster                    |