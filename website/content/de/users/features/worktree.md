# Worktrees

> Isolieren Sie experimentelle Arbeiten in einem temporären [Git-Worktree](https://git-scm.com/docs/git-worktree), ohne Ihre aktuelle Sitzung zu verlassen. Nützlich, wenn das Modell weitreichende Änderungen vornehmen soll, die Sie von Ihrem Haupt-Checkout getrennt halten möchten, oder wenn ein Unter-Agent in einer eigenen Sandbox arbeiten soll.

## Schnellstart

### Sitzung innerhalb eines Worktrees starten (`--worktree`-Flag)

Wenn Sie von vornherein wissen, dass die gesamte Sitzung in einem Worktree laufen soll, übergeben Sie `--worktree` beim Start:

```bash
# Automatisch generierter Slug (z. B. tender-jemison-037f0a)
qwen --worktree

# Expliziter Name
qwen --worktree my-feature

# `=`-Form (empfohlen, wenn auch ein positionelles Prompt übergeben wird – siehe Tipp unten)
qwen --worktree=my-feature

# PR-Referenz – holt refs/pull/<N>/head von `origin`
qwen --worktree=#4174
qwen --worktree https://github.com/QwenLM/qwen-code/pull/4174

# Fortsetzen einer vorherigen --worktree-Sitzung – stellt die Verbindung zum bestehenden Verzeichnis wieder her
qwen --resume <session-id> --worktree=my-feature
```

> **Tipp – Bloßes `--worktree` gefolgt von einem positionellen Prompt ist mehrdeutig.** Da `--worktree` einen optionalen Wert annimmt, führt `qwen --worktree "say hi"` dazu, dass yargs `"say hi"` als Slug interpretiert (und wegen des Leerzeichens ablehnt). Verwenden Sie eine der folgenden Varianten:
>
> - `qwen --worktree=my-feature "say hi"` (funktioniert immer – expliziter Slug via `=`)
> - `qwen "say hi" --worktree` (positionelles Argument zuerst, Flag am Ende → automatischer Slug)
> - `qwen --worktree --approval-mode yolo "say hi"` (ein beliebiges Flag zwischen beiden verankert die nackte Form)

> **Tipp – `qwen --resume --worktree foo` (ohne Sitzungs-ID) zeigt bei erster Verwendung eine leere Auswahl.** Die Auswahl beschränkt sich auf den Sitzungsspeicher des gewählten Worktrees; außerhalb dieses Worktrees gestartete Sitzungen werden nicht aufgelistet. Um eine Sitzung fortzusetzen, die innerhalb von `foo` gestartet wurde, verwenden Sie direkt `qwen --resume <id> --worktree foo` – die CLI stellt die Verbindung zum bestehenden `foo/`-Verzeichnis wieder her, anstatt es neu zu erstellen.

`process.cwd()` und der Arbeitsbereich des Modells werden vor dem ersten Durchlauf in den Worktree umgeschaltet. Beenden Sie mit zweimal `Strg+C` und das [Beenden-Dialog](#exit-dialog-ctrlc--ctrld) fragt, ob der Worktree behalten oder entfernt werden soll.

Das `--worktree`-Flag kann nicht mit `--acp`/`--experimental-acp` kombiniert werden – für ACP-Hosts (wie Zed) übergeben Sie den Worktree-Pfad als `cwd` der `loadSession`/`newSession`-Anfrage.

### Oder mitten in der Sitzung fragen

Alternativ können Sie Qwen Code im Klartext bitten, während einer bestehenden Sitzung einen Worktree zu erstellen:

```text
> starte einen Worktree namens experiment-a
Worktree experiment-a wurde auf Branch worktree-experiment-a erstellt
.qwen/worktrees/experiment-a
```

Ab diesem Zeitpunkt leitet das Modell jede Dateibearbeitung und jeden Shell-Befehl durch `.qwen/worktrees/experiment-a/`. Ihr ursprüngliches Arbeitsverzeichnis bleibt unberührt.

Wenn Sie fertig sind:

```text
> verlasse den Worktree und entferne ihn
Worktree experiment-a entfernt (Branch worktree-experiment-a)
```

Wenn Sie später zurückkommen möchten, bitten Sie stattdessen darum, den Worktree zu verlassen und auf der Festplatte zu behalten:

```text
> verlasse den Worktree, aber behalte ihn
Worktree experiment-a unter .qwen/worktrees/experiment-a behalten
```

## Wann Worktrees verwendet werden

Worktrees werden auf vier unabhängigen Wegen aktiviert:

| Auslöser                                          | Was passiert                                                                                                                      |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Sie starten mit `--worktree`                      | Die CLI erstellt den Worktree vor dem ersten Modell-Durchlauf und wechselt das Verzeichnis der Sitzung dorthin. PR-Formen (`#N`, vollständige URL) holen zuerst. |
| Sie bitten mitten in der Sitzung explizit um einen Worktree | Modell ruft `enter_worktree` auf; nachfolgende Dateibearbeitungen erfolgen innerhalb des Worktrees.                                              |
| Sie bitten explizit darum, den Worktree zu verlassen         | Modell ruft `exit_worktree` mit `keep` oder `remove` auf.                                                                                   |
| Ein Unter-Agent wird mit aktivierter Isolation gestartet     | Ein temporärer Worktree (`agent-<hex>`) wird automatisch erstellt und bereinigt, wenn der Agent keine Diffs aufweist.                         |

Die beiden Werkzeuge für die Sitzungsmitte (`enter_worktree` / `exit_worktree`) sind bewusst hinter expliziten Formulierungen versteckt – Sätze wie „behebe diesen Fehler“ oder „erzeuge einen Branch“ werden sie **nicht** auslösen. Sie müssen etwas sagen wie „verwende einen Worktree“, „starte einen Worktree“ oder „in einem Worktree“. Das CLI-Flag `--worktree` hat keine solche Absicherung; es erstellt immer einen, wenn es vorhanden ist.

## Was erstellt wird

Jeder von Qwen verwaltete Worktree wird unter dem `.qwen`-Verzeichnis Ihres Projekts abgelegt:

```
<repoRoot>/.qwen/worktrees/<slug>/         # Arbeitsverzeichnis
                          ↳ Branch worktree-<slug>   # Von Ihrem aktuellen Branch abgezweigt
```

- **Slug** – Buchstaben, Ziffern, Punkt, Unterstrich, Bindestrich; max. 64 Zeichen. Wenn Sie keinen Namen angeben, wird ein automatisch generierter Slug der Form `<adjective>-<noun>-<6hex>` erstellt (z. B. `tender-jemison-037f0a`). PR-Referenzen erzeugen `pr-<N>`.
- **Branch** – immer `worktree-<slug>`, abgezweigt von dem Branch, den Sie ausgecheckt haben, als Sie den Worktree angefordert haben (nicht unbedingt der `HEAD` des Haupt-Worktrees). Bei PR-Worktrees ist der Branch `worktree-pr-<N>` und basiert auf `FETCH_HEAD` (der PR-Spitze auf GitHub-Seite) und nicht auf Ihrem lokalen Branch.
- **Hooks** – der `core.hooksPath` des Worktrees wird automatisch auf das `.husky/`-Verzeichnis (bevorzugt) oder `.git/hooks/` des Haupt-Repos gesetzt, sodass Commits innerhalb des Worktrees weiterhin Ihre vorhandenen Pre-Commit-/Commit-Msg-Hooks auslösen.
- **Optionale Symlinks** – Verzeichnisse, die in `worktree.symlinkDirectories` aufgeführt sind (siehe [Einstellungen](#settings)), werden vom Haupt-Repo in den neuen Worktree gesymlinkt, sodass schwere Verzeichnisse wie `node_modules` ohne Neuinstallation wiederverwendet werden können.
Der allgemeine Worktree-Pfad ist **nicht konfigurierbar** — er muss unter `<repoRoot>/.qwen/worktrees/` liegen, damit die CLI ihn beim Neustart und bei Bereinigungsdurchläufen für veraltete Worktrees finden kann. (Die nicht damit zusammenhängende Einstellung `agents.arena.worktreeBaseDir` steuert nur die Worktrees der [Agent Arena](./arena.md), die einen eigenen Pfadbaum unter `~/.qwen/arena/` verwenden.)

## Fußzeile und Statuszeile

Wenn ein Worktree aktiv ist, zeigt die Fußzeile einen abgedunkelten Indikator in einer eigenen Zeile an:

```
⎇ worktree-experiment-a (experiment-a)
```

Wenn Sie ein [benutzerdefiniertes Statuszeilenskript](./status-line.md) verwenden, erhält es ebenfalls ein `worktree`-Objekt in der JSON-Nutzlast, die an die Standardeingabe weitergeleitet wird:

```json
{
  "worktree": {
    "name": "experiment-a",
    "path": "/path/to/repo/.qwen/worktrees/experiment-a",
    "branch": "worktree-experiment-a",
    "original_cwd": "/path/to/repo",
    "original_branch": "main"
  }
}
```

Das Nutzlastfeld ist **nur** vorhanden, wenn ein Worktree aktiv ist, daher reicht eine `null`-Prüfung (`input.worktree?.name`) aus.

Wenn Ihre benutzerdefinierte Statuszeile bereits Worktree-Informationen anzeigt, können Sie die eingebaute Fußzeilenzeile ausblenden, um Doppelungen zu vermeiden — siehe [Einstellungen](#settings) weiter unten.

## Beenden-Dialog (Ctrl+C / Ctrl+D)

Durch zweimaliges Drücken der Tastenkombination zum Beenden, während ein Worktree aktiv ist, wird der **Worktree-Beenden-Dialog** geöffnet, anstatt die CLI zu schließen:

```
⎇ Active worktree: "experiment-a" (worktree-experiment-a)

  • 2 new commit(s) on worktree-experiment-a
  • 3 uncommitted file(s)
  Removing the worktree will discard everything above.

What would you like to do?
  ○ Keep worktree (exit without deleting)
  ○ Remove worktree and branch (discards 2 commit(s), 3 file(s))
  ○ Cancel (stay in session)
```

Der Dialog überprüft den Worktree beim Öffnen (`git status --porcelain` + `git rev-list <baseHEAD>..HEAD`) und zeigt beide Zählungen an, sodass Sie genau wissen, was Sie verwerfen würden. `ESC` bricht ab.

Wenn `git status` selbst fehlschlägt (z.B. beschädigter Index, Worktree-Verzeichnis wurde unter der CLI entfernt), zeigt der Dialog eine Warnung `⚠ Could not measure worktree state` an und die Zählungen können unzuverlässig sein — wählen Sie **Keep** oder **Cancel**, bis Sie das zugrunde liegende Repo-Problem diagnostiziert haben.

## `--resume` Wiederherstellung

Die Bindung des aktiven Worktrees wird in einer Sidecar-Datei zusammen mit Ihrem Sitzungstranskript gespeichert:

```
<chatsDir>/<sessionId>.worktree.json
```

Wenn Sie die CLI mit `--resume <sessionId>` starten (oder die Sitzung aus `/resume` auswählen), passieren drei Dinge konsistent in den Modi **interaktives TUI**, **headless `-p`** und **ACP/Zed**:

1. Die Sidecar-Datei wird geladen und es wird überprüft, ob das Worktree-Verzeichnis noch auf der Festplatte existiert.
2. Falls vorhanden, erhält das Modell bei seiner nächsten Eingabeaufforderung eine einmalige Erinnerung:
   ```
   [Resumed] Active worktree: "<slug>" at <path> (branch: <branch>). Continue using this path for all file operations.
   ```
3. Wenn das Worktree-Verzeichnis zwischen den Sitzungen gelöscht wurde, wird die veraltete Sidecar-Datei automatisch bereinigt — kein Fehler, die Wiederaufnahme wird einfach ohne Worktree-Kontext fortgesetzt.

Jeder Modus wählt seinen eigenen Injektionsmechanismus, aber das für den Benutzer sichtbare Verhalten ist identisch:

| Modus             | Mechanismus                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------- |
| Interaktiv (TUI)  | `INFO`-History-Element + Systemerinnerungs-Präfix in der nächsten Benutzereingabe.                       |
| Headless (`-p`)   | `<system-reminder>`-Präfix in der Eingabeaufforderung + `worktree_restored`-JSON-Systemereignis im Ausgabestream. |
| ACP (z.B. Zed)    | Anstehender Hinweis, der an den nächsten `prompt()`-Aufruf angehängt wird.                              |

Das Modell wird **nicht** automatisch per `chdir` in den Worktree versetzt — die Erinnerung sorgt dafür, dass es Bearbeitungen über den Worktree-Pfad leitet.

## Sub-Agent-Isolation

Das `agent`-Tool akzeptiert einen optionalen Parameter `isolation: "worktree"`. Wenn gesetzt, erstellt Qwen Code einen kurzlebigen Worktree unter `<repoRoot>/.qwen/worktrees/agent-<7hex>/`, bevor der Sub-Agent startet, und:

- **Keine Änderungen** → der Worktree wird automatisch entfernt, wenn der Agent fertig ist.
- **Hat Änderungen** → der Worktree wird beibehalten; sein Pfad und Branch werden an das Ergebnis des Agents angehängt, z.B.
  ```
  …agent output…
  [worktree preserved: /path/to/.qwen/worktrees/agent-3f2a1b9 (branch worktree-agent-3f2a1b9)]
  ```
  Überprüfen Sie den Diff und mergen oder löschen Sie ihn manuell.

Zwei Einschränkungen:

- `isolation: "worktree"` erfordert einen `subagent_type` — gegabelte Sub-Agents (ohne `subagent_type`) verwenden den vollständigen Gesprächskontext des übergeordneten Agents, daher würde eine Isolierung die Absicht vom Arbeitsbaum trennen.
- Hintergrund-Agents (`run_in_background: true`) funktionieren gut mit Isolation; die Bereinigung wird ausgeführt, wenn der Agent den Abschluss meldet.

### Automatische Bereinigung veralteter Worktrees

Kurzlebige Agent-Worktrees, die einen Absturz oder ein Herunterfahren mit `--no-cleanup` überstanden haben, werden bei jedem CLI-Start mit konservativen Fail-Closed-Regeln bereinigt:

| Bedingung                               | Verhalten                                       |
| --------------------------------------- | ----------------------------------------------- |
| Slug muss dem Muster `agent-<7hex>` entsprechen | Von Ihnen erstellte benannte Worktrees werden nie angetastet. |
| Verzeichnis `mtime` > 30 Tage           | Neuere Einträge werden übersprungen.            |
| Nicht committete verfolgte Änderung     | Eintrag überspringen (nicht löschen).           |
| Commit, der von keinem Remote erreichbar ist | Eintrag überspringen (nicht löschen).           |
| Fehler beim Lesen des Git-Status        | Eintrag überspringen (nicht löschen).           |
Benannte Benutzer-Worktrees ( `enter_worktree`-Slugs ) werden **niemals** automatisch bereinigt – sie bleiben bestehen, bis Sie sie entfernen lassen.

## Sicherheitsvorkehrungen für `exit_worktree action="remove"`

Drei unabhängige Sicherungen werden ausgelöst, bevor das Verzeichnis und der Branch gelöscht werden:

1. **Session-Eigentümerschaft** – jeder Worktree trägt einen Sidecar-Marker mit der Sitzungs-ID, die ihn erstellt hat. Wenn eine andere Sitzung versucht, ihn zu entfernen, wird sie mit einem klaren Fehler abgewiesen, der auf `git worktree remove` als manuelle Ausweichmöglichkeit hinweist.
2. **Veränderter Arbeitsbaum (dirty)** – nicht committete getrackte oder ungetrackte Änderungen blockieren die Entfernung. Übergeben Sie `discard_changes: true`, um dies zu überschreiben. (Der Bypass erfordert eine explizite Benutzerbestätigung – `action: "remove"` wird im AUTO_EDIT-Modus niemals automatisch genehmigt.)
3. **Unzusammengeführte Commits** – Commits auf `worktree-<slug>`, auf die kein anderer lokaler Branch oder Remote-Ref zeigt, blockieren die Entfernung bedingungslos; es gibt kein "discard commits"-Flag, da der Verlust von committed-Arbeit selten dem Benutzerwunsch entspricht. Führen Sie zuerst einen Merge, Push oder eine Umbenennung des Branches woanders durch.

Die gleichen drei Sicherungen gelten für die Schaltfläche `WorktreeExitDialog → Remove`.

## Einstellungen

Zwei Einstellungen prägen die Worktree-Erfahrung für allgemeine Zwecke:

| Schlüssel                           | Typ        | Standard   | Auswirkung                                                                                                                                                                                                                                                                                    |
| ----------------------------------- | ---------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ui.hideBuiltinWorktreeIndicator`   | boolean    | `false`    | Verbirgt die integrierte `⎇ worktree-… (…)`-Fußzeile. Das Feld `worktree` wird weiterhin an benutzerdefinierte Statuszeilenskripte übergeben. Setzen Sie es nur auf `true`, wenn Ihre Statuszeile das Worktree bereits darstellt – andernfalls verlieren Sie alle UI-Hilfsmittel.               |
| `worktree.symlinkDirectories`       | `string[]` | `undefined`| Verzeichnisse unter dem Haupt-Repository, die bei der Erstellung in jeden allgemeinen Worktree als Symlink eingefügt werden. Pfade sind relativ zum Repository-Stamm; absolute Pfade und Einträge mit `..` werden abgelehnt. Fehlende Quellen und vorhandene Ziele werden stillschweigend übersprungen (keine Überschreibung). |

Beispiel:

```jsonc
// ~/.qwen/settings.json or <repo>/.qwen/settings.json
{
  "worktree": {
    "symlinkDirectories": ["node_modules", ".turbo", "dist"],
  },
}
```

Gilt für ALLE Worktree-Erstellungspfade: `--worktree`-Flag, `enter_worktree`-Tool und `agent isolation: "worktree"`.

Einstellungen, die nicht mit allgemeinen Worktrees zusammenhängen, aber wissenswert sind:

- `agents.arena.worktreeBaseDir` – steuert die Platzierung von **Agent Arena**-Worktrees (Standard `~/.qwen/arena`). Betrifft nicht allgemeine Worktrees, die immer unter `<repoRoot>/.qwen/worktrees/` liegen.

Es gibt noch kein Schema für `worktree.sparsePaths` – das ist ein Roadmap-Punkt (siehe [Einschränkungen](#limitations)).

## Tool-Referenz

### `enter_worktree`

```json
{ "name": "experiment-a" }
```

| Feld    | Typ    | Erforderlich | Hinweise                                                                                     |
| ------- | ------ | ------------ | -------------------------------------------------------------------------------------------- |
| `name`  | string | nein         | Slug. Buchstaben, Ziffern, Punkt, Unterstrich, Bindestrich; max. 64 Zeichen. Bei Auslassung automatisch generiert. |

Weigert sich zu laufen, wenn:

- Die CLI befindet sich nicht in einem Git-Repository.
- Das aktuelle Arbeitsverzeichnis befindet sich bereits in `.qwen/worktrees/` (keine verschachtelten Worktrees).

### `exit_worktree`

```json
{ "name": "experiment-a", "action": "remove", "discard_changes": false }
```

| Feld               | Typ                   | Erforderlich                        | Hinweise                                                                           |
| ------------------ | --------------------- | ----------------------------------- | ---------------------------------------------------------------------------------- |
| `name`             | string                | ja                                  | Muss mit dem in `enter_worktree` verwendeten Slug übereinstimmen.                  |
| `action`           | `"keep"` \| `"remove"`| ja                                  | `keep` behält Verzeichnis und Branch; `remove` löscht beide.                       |
| `discard_changes`  | boolean               | nur wenn `action="remove"` und dirty | Überschreibt die Dirty-Tree-Sicherung. Hat keine Wirkung für `action="keep"`.       |

`action: "remove"` fordert immer zur Bestätigung auf, auch im `AUTO_EDIT`-Genehmigungsmodus – es wird als destruktive Shell-Operation behandelt, nicht als reines Informationswerkzeug.

### `agent` — `isolation`-Parameter

```json
{
  "subagent_type": "my-agent",
  "description": "…",
  "prompt": "…",
  "isolation": "worktree"
}
```

| Feld        | Typ          | Erforderlich | Hinweise                                                                                       |
| ----------- | ------------ | ------------ | ---------------------------------------------------------------------------------------------- |
| `isolation` | `"worktree"` | nein         | Führt den Agenten in einem frischen `agent-<7hex>`-Worktree aus. Erfordert, dass `subagent_type` gesetzt ist (keine Forks). |
Siehe [Sub-Agents](./sub-agents.md) für die restliche Referenz der Agent-Tools.

## CLI-Referenz

### `--worktree [name | #N | url]`

```bash
qwen --worktree                                               # auto-generate slug
qwen --worktree my-feature                                    # explicit slug
qwen --worktree=my-feature                                    # = form
qwen --worktree=#123                                          # PR reference
qwen --worktree https://github.com/owner/repo/pull/123        # PR URL
```

| Eingabe                        | Ergebnis                                                                                                                |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Nacktes Flag (kein Wert)          | Automatischer Slug `<adjective>-<noun>-<6hex>`, Branch `worktree-<slug>`, Basis = aktueller Branch.                               |
| Einfacher Slug                    | Branch `worktree-<slug>`, Basis = aktueller Branch. Slug-Validierung: Buchstaben/Ziffern/Punkt/Unterstrich/Bindestrich, max. 64 Zeichen. |
| `#N` oder `<github-url>/pull/N` | Slug `pr-<N>`, Branch `worktree-pr-<N>`, Basis = `FETCH_HEAD` nach `git fetch origin pull/<N>/head` (30s Timeout).    |

`--worktree` kann nicht mit `--acp` / `--experimental-acp` kombiniert werden.

Wenn `--worktree` mit `--resume <session-id>` kombiniert wird, gewinnt der Worktree: der gespeicherte Worktree der fortgesetzten Sitzung (falls vorhanden) wird überschrieben und eine stderr-Zeile sowie eine Erinnerung bei der ersten Eingabeaufforderung melden die Überschreibung.

Im interaktiven (TUI) und im Headless-Modus (`-p`) wird der Worktree automatisch erstellt und die Sitzung wechselt vor der ersten Runde per chdir hinein.

Fehlermodi beim Abrufen von PRs (Exit-Code != 0, kein Worktree erstellt):

| Ursache                         | Auszug der Meldung                                            |
| ----------------------------- | ---------------------------------------------------------- |
| Fehlender Remote `origin`       | `requires an "origin" remote that points at GitHub`        |
| PR existiert nicht auf origin    | `Failed to fetch PR #<N>: the PR does not exist on origin` |
| 30s Netzwerk-Timeout           | `Failed to fetch PR #<N>: timed out after 30s`            |
| PR-Nummer außerhalb des Bereichs / Null | `Invalid PR number`                                        |

## Einschränkungen

Die folgenden Punkte sind in der aktuellen Phase bewusst nicht implementiert:

- **Kein partielles Checkout.** Große Monorepos checken den vollständigen Baum aus. (`worktree.sparsePaths` ist ein Roadmap-Element.)
- **Keine tmux-Integration.** Die CLI startet keine Worktree-Sitzungen in neuen tmux-Fenstern.
- **Worktrees sind separate „Projekte“ für die Sitzungsspeicherung.** Sitzungen, die mit `--worktree foo` gestartet werden, werden unter dem Chats-Verzeichnis dieses Worktrees gespeichert; um sie später fortzusetzen, müssen Sie erneut `--worktree foo` übergeben. Sitzungen, die ohne `--worktree` gestartet werden, werden unter dem Haupt-Checkout gespeichert und erscheinen nicht im Fortsetzungs-Auswahlmenü des Worktrees.
- **Keine sessionsübergreifende Slug-Überschreibung.** `qwen --resume <sid> --worktree second`, wobei `<sid>` mit `--worktree first` erstellt wurde, wird die Sitzung nicht finden – Sitzungen und Worktrees sind eng über `projectHash(cwd)` verbunden. Um bei einer vorhandenen Sitzung den Worktree zu wechseln, müssen Sie die Sitzung beenden und dann mit dem neuen `--worktree` und einer neuen Eingabeaufforderung neu starten. Eine zukünftige Architekturänderung (Speicherung am Repository-Stamm statt am `cwd`) würde diese Einschränkung aufheben.
- **Mitten in der Sitzung wechselt `enter_worktree` NICHT `process.cwd()` oder `Config.targetDir`.** Dieses Tool verwendet die Modell-Kontext-Only-Konvention (siehe [Sub-Agents](./sub-agents.md)). Nur das Start-Flag `--worktree` wechselt tatsächlich das Arbeitsverzeichnis des Prozesses.
- **Relative Pfade in anderen Argumentfeldern werden VOR dem Worktree-chdir aufgelöst.** Pfadbezogene Flags (`--mcp-config`, `--openai-logging-dir`, `--json-file`, `--input-file`, `--telemetry-outfile`, `--include-directories`) werden beim Setzen von `--worktree` relativ zum Start-cwd zu absoluten Pfaden normalisiert. Andere pfadförmige argv-Felder, die nicht in dieser Liste enthalten sind, werden weiterhin relativ zum Worktree-cwd aufgelöst – verwenden Sie absolute Pfade, um sicher zu sein.

Verfolgen Sie die Roadmap in `docs/design/worktree.md`.

## Fehlerbehebung

**Die Fußzeile zeigt keinen Worktree-Indikator, obwohl ich gerade einen erstellt habe.**
Überprüfen Sie, dass `ui.hideBuiltinWorktreeIndicator` nicht auf `true` gesetzt ist. Bestätigen Sie außerdem, dass der Slug in der Erfolgsmeldung des Tools nicht leer ist.

**`--resume` stellt meinen Worktree nicht wieder her.**
Überprüfen Sie, dass `<chatsDir>/<sessionId>.worktree.json` existiert. Die CLI löscht den Beiwagen automatisch, wenn das Worktree-Verzeichnis nicht mehr vorhanden ist. Ein fehlender Beiwagen plus ein fehlendes Verzeichnis ist also der normale Zustand „kein Worktree zum Wiederherstellen“ – kein Fehler. Führen Sie das Programm mit `--debug` aus und suchen Sie in der Ausgabe nach `restoreWorktreeContext`, um den Grund zu erfahren.

**`exit_worktree` sagt „von einer anderen Sitzung erstellt“.**
Dies ist die Sitzungsbesitz-Sperre. Setzen Sie die ursprüngliche Sitzung fort und beenden Sie von dort aus, oder führen Sie den vorgeschlagenen Befehl `git worktree remove …` manuell aus.

**Veraltete `agent-<hex>`-Worktrees sammeln sich an.**
Die 30-Tage-Grenze ist konservativ; räumen Sie manuell mit `git worktree list && git worktree remove <path>` auf, oder warten Sie – der nächste CLI-Start nach Ablauf der 30 Tage wird sie entfernen, solange sie sauber und gepusht sind.
