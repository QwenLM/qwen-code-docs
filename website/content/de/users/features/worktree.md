# Worktrees

> Isolieren Sie experimentelle Arbeit in einem temporären [git worktree](https://git-scm.com/docs/git-worktree), ohne Ihre aktuelle Sitzung zu verlassen. Nützlich, wenn das Modell umfangreiche Änderungen vornehmen wird, die Sie von Ihrem Haupt-Checkout getrennt halten möchten, oder wenn ein Sub-Agent in einer eigenen Sandbox arbeiten soll.

## Schnellstart

### Sitzung innerhalb eines Worktrees starten (`--worktree`-Flag)

Wenn Sie von vornherein wissen, dass die gesamte Sitzung in einem Worktree laufen soll, übergeben Sie `--worktree` beim Start:

```bash
# Automatisch generierter Slug (z. B. tender-jemison-037f0a)
qwen --worktree

# Expliziter Name
qwen --worktree my-feature

# `=`-Form (empfohlen, wenn Sie auch ein positionelles Prompt übergeben – siehe Tipp unten)
qwen --worktree=my-feature

# PR-Referenz – holt refs/pull/<N>/head von `origin`
qwen --worktree=#4174
qwen --worktree https://github.com/QwenLM/qwen-code/pull/4174

# Fortsetzen einer vorherigen --worktree-Sitzung – stellt Verbindung zum vorhandenen Verzeichnis wieder her
qwen --resume <session-id> --worktree=my-feature
```

> **Tipp – Bloßes `--worktree` gefolgt von einem positionellen Prompt ist mehrdeutig.** Da `--worktree` einen optionalen Wert annimmt, verarbeitet `qwen --worktree "say hi"` durch yargs `"say hi"` als Slug (und lehnt ihn wegen des Leerzeichens ab). Verwenden Sie eine der folgenden Varianten:
>
> - `qwen --worktree=my-feature "say hi"` (funktioniert immer – expliziter Slug via `=`)
> - `qwen "say hi" --worktree` (positionell zuerst, Flag am Ende → automatischer Slug)
> - `qwen --worktree --approval-mode yolo "say hi"` (ein beliebiges Flag dazwischen verankert die nackte Form)

> **Tipp – `qwen --resume --worktree foo` (ohne Sitzungs-ID) zeigt bei erster Verwendung eine leere Auswahl.** Die Auswahl beschränkt sich auf den Sitzungsspeicher des gewählten Worktrees; Sitzungen, die außerhalb dieses Worktrees gestartet wurden, werden nicht aufgelistet. Um eine Sitzung fortzusetzen, die innerhalb von `foo` gestartet wurde, verwenden Sie direkt `qwen --resume <id> --worktree foo` – die CLI stellt die Verbindung zum vorhandenen `foo/`-Verzeichnis wieder her, anstatt es neu zu erstellen.

`process.cwd()` und der Workspace des Modells werden auf den Worktree umgeschaltet, bevor die erste Runde läuft. Beenden mit `Strg+C` zweimal und der [Exit-Dialog](#exit-dialog-strgc--strgd) fragt, ob der Worktree behalten oder entfernt werden soll.

Das `--worktree`-Flag kann nicht mit `--acp`/`--experimental-acp` kombiniert werden – für ACP-Hosts (wie Zed) übergeben Sie den Worktree-Pfad als `cwd` der `loadSession`/`newSession`-Anfrage.

### Oder mitten in der Sitzung anfragen

Alternativ können Sie Qwen Code in Klartext bitten, einen Worktree aus einer bestehenden Sitzung heraus zu erstellen:

```text
> starte einen Worktree namens experiment-a
Worktree experiment-a erstellt auf Branch worktree-experiment-a
.qwen/worktrees/experiment-a
```

Ab diesem Zeitpunkt leitet das Modell jede Dateibearbeitung und jeden Shell-Befehl durch `.qwen/worktrees/experiment-a/`. Ihr ursprüngliches Arbeitsverzeichnis bleibt unberührt.

Wenn Sie fertig sind:

```text
> verlasse den Worktree und entferne ihn
Worktree experiment-a entfernt (Branch worktree-experiment-a)
```

Wenn Sie später zurückkommen möchten, bitten Sie darum, den Worktree auf der Platte zu belassen:

```text
> verlasse den Worktree, aber behalte ihn
Worktree experiment-a behalten unter .qwen/worktrees/experiment-a
```

## Wann Worktrees verwendet werden

Worktrees werden auf vier unabhängigen Wegen aktiviert:

| Auslöser                                           | Was passiert                                                                                                                       |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Sie starten mit `--worktree`                       | Die CLI erstellt den Worktree, bevor eine Modellrunde läuft, und wechselt per `chdir` in ihn. PR-Formen (`#N`, vollständige URL) holen vorher den Inhalt. |
| Sie bitten explizit mitten in der Sitzung um einen Worktree | Das Modell ruft `enter_worktree` auf; nachfolgende Dateibearbeitungen erfolgen innerhalb des Worktrees.                            |
| Sie bitten explizit, den Worktree zu verlassen      | Das Modell ruft `exit_worktree` mit `keep` oder `remove` auf.                                                                     |
| Modell startet einen Sub-Agenten mit Isolation      | Ein Wegwerf-Worktree (`agent-<hex>`) wird automatisch erstellt und bereinigt, wenn der Agent keine Diffs hat.                        |

Die beiden Werkzeuge für die Mitte der Sitzung (`enter_worktree` / `exit_worktree`) sind bewusst hinter expliziten Formulierungen versteckt – das Sagen von "behebe diesen Fehler" oder "erstelle einen Branch" wird sie **nicht** auslösen. Sie müssen etwas sagen wie "verwende einen Worktree", "starte einen Worktree" oder "in einem Worktree". Das CLI-Flag `--worktree` hat diese Einschränkung nicht; es erstellt immer einen, wenn es vorhanden ist.

## Was erstellt wird

Jeder von Qwen verwaltete Worktree wird unter dem `.qwen`-Verzeichnis Ihres Projekts abgelegt:

```
<repoRoot>/.qwen/worktrees/<slug>/         # Arbeitsverzeichnis
                          ↳ Branch worktree-<slug>   # Erstellt von Ihrem aktuellen Branch aus
```

- **Slug** – Buchstaben, Ziffern, Punkt, Unterstrich, Bindestrich; max. 64 Zeichen. Wenn Sie keinen Namen angeben, wird ein `<Adjektiv>-<Substantiv>-<6hex>`-Slug automatisch generiert (z. B. `tender-jemison-037f0a`). PR-Referenzen erzeugen `pr-<N>`.
- **Branch** – immer `worktree-<slug>`, abgezweigt von dem Branch, den Sie gerade ausgecheckt haben, wenn Sie den Worktree anfordern (nicht notwendigerweise der `HEAD` des Haupt-Arbeitsbaums). Bei PR-Worktrees ist der Branch `worktree-pr-<N>` und basiert auf `FETCH_HEAD` (der Spitze des PR auf GitHub-Seite) anstatt auf Ihrem lokalen Branch.
- **Hooks** – der `core.hooksPath` des Worktrees wird automatisch auf das `.husky/` (bevorzugt) oder `.git/hooks/` des Haupt-Repositorys gesetzt, sodass Commits innerhalb des Worktrees trotzdem Ihre vorhandenen Pre-Commit-/Commit-Msg-Hooks auslösen.
- **Optionale Symlinks** – Verzeichnisse, die in `worktree.symlinkDirectories` aufgeführt sind (siehe [Einstellungen](#einstellungen)), werden aus dem Haupt-Repo in den neuen Worktree verlinkt, damit schwere Verzeichnisse wie `node_modules` ohne Neuinstallation wiederverwendet werden können.

Der allgemeine Worktree-Pfad ist **nicht konfigurierbar** – er muss unter `<repoRoot>/.qwen/worktrees/` liegen, damit die CLI ihn beim Neustart und bei Bereinigungsdurchläufen für veraltete Einträge finden kann. (Die unabhängige Einstellung `agents.arena.worktreeBaseDir` steuert nur die [Agent Arena](./arena.md)-Worktrees, die einen separaten Pfadbaum unter `~/.qwen/arena/` verwenden.)

## Fußzeile und Statuszeile

Wenn ein Worktree aktiv ist, zeigt die Fußzeile einen abgedunkelten Indikator in einer eigenen Zeile:

```
⎇ worktree-experiment-a (experiment-a)
```

Wenn Sie ein [benutzerdefiniertes Statuszeilen-Skript](./status-line.md) verwenden, erhält es auch ein `worktree`-Objekt im JSON-Payload, das per Pipe an stdin gesendet wird:

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

Das Payload-Feld ist **nur** vorhanden, wenn ein Worktree aktiv ist, daher reicht eine `null`-Prüfung (`input.worktree?.name`).

Wenn Ihre benutzerdefinierte Statuszeile bereits Worktree-Informationen anzeigt, können Sie die eingebaute Fußzeilen-Zeile ausblenden, um Doppelungen zu vermeiden – siehe [Einstellungen](#einstellungen) unten.

## Exit-Dialog (Strg+C / Strg+D)

Das zweimalige Drücken des Beenden-Shortcuts bei aktivem Worktree öffnet den **Worktree-Exit-Dialog**, anstatt die CLI zu schließen:

```
⎇ Aktiver Worktree: "experiment-a" (worktree-experiment-a)

  • 2 neue Commit(s) auf worktree-experiment-a
  • 3 uncommittete Datei(en)
  Das Entfernen des Worktrees verwirft alles oben Genannte.

Was möchten Sie tun?
  ○ Worktree behalten (beenden ohne zu löschen)
  ○ Worktree und Branch entfernen (verwirft 2 Commit(s), 3 Datei(en))
  ○ Abbrechen (in der Sitzung bleiben)
```

Der Dialog prüft den Worktree beim Öffnen (`git status --porcelain` + `git rev-list <baseHEAD>..HEAD`) und zeigt beide Zählungen an, damit Sie genau wissen, was Sie verwerfen würden. `ESC` bricht ab.

Wenn `git status` selbst fehlschlägt (z. B. corruptes Index, Worktree-Verzeichnis wurde unter der CLI entfernt), zeigt der Dialog eine Warnung `⚠ Konnte Worktree-Zustand nicht messen` und die Zählungen können unzuverlässig sein – wählen Sie **Behalten** oder **Abbrechen**, bis Sie das zugrunde liegende Repo-Problem diagnostiziert haben.

## `--resume` Wiederherstellung

Die aktive Worktree-Bindung wird in einer Sidecar-Datei neben dem Sitzungstranskript gespeichert:

```
<chatsDir>/<sessionId>.worktree.json
```

Wenn Sie die CLI mit `--resume <sessionId>` starten (oder die Sitzung aus `/resume` auswählen), geschehen drei Dinge konsistent in den Modi **interaktive TUI**, **Headless `-p`** und **ACP/Zed**:

1. Die Sidecar wird geladen und das Worktree-Verzeichnis wird auf seine Existenz auf der Platte überprüft.
2. Falls vorhanden, erhält das Modell eine einmalige Erinnerung bei seinem allerersten nächsten Prompt:
   ```
   [Fortgesetzt] Aktiver Worktree: "<slug>" unter <path> (Branch: <branch>). Verwenden Sie diesen Pfad für alle Dateioperationen weiter.
   ```
3. Wenn das Worktree-Verzeichnis zwischen den Sitzungen gelöscht wurde, wird die veraltete Sidecar automatisch bereinigt – kein Fehler, die Fortsetzung läuft einfach ohne Worktree-Kontext weiter.

Jeder Modus wählt seinen eigenen Injektionsmechanismus, aber das sichtbare Verhalten für den Benutzer ist identisch:

| Modus              | Mechanismus                                                                                              |
| ------------------ | -------------------------------------------------------------------------------------------------------- |
| Interaktiv (TUI)   | `INFO`-History-Element + System-Erinnerungspräfix beim nächsten Benutzerprompt.                          |
| Headless (`-p`)    | `<system-reminder>`-Präfix beim Prompt + `worktree_restored` JSON-Systemereignis im Ausgabestream.       |
| ACP (z. B. Zed)    | Ausstehender Hinweis, der dem nächsten `prompt()`-Aufruf beigefügt wird.                                 |

Das Modell wird **nicht** automatisch per `chdir` in den Worktree versetzt – die Erinnerung sorgt dafür, dass es Bearbeitungen weiterhin durch den Worktree-Pfad leitet.

## Sub-Agenten-Isolation

Das `agent`-Werkzeug akzeptiert einen optionalen Parameter `isolation: "worktree"`. Wenn dieser gesetzt ist, erstellt Qwen Code einen ephemeren Worktree unter `<repoRoot>/.qwen/worktrees/agent-<7hex>/`, bevor der Sub-Agent startet, und:

- **Keine Änderungen** → der Worktree wird automatisch entfernt, wenn der Agent fertig ist.
- **Hat Änderungen** → der Worktree wird beibehalten; sein Pfad und Branch werden an das Ergebnis des Agenten angehängt, z. B.
  ```
  …Agent-Ausgabe…
  [worktree preserved: /path/to/.qwen/worktrees/agent-3f2a1b9 (branch worktree-agent-3f2a1b9)]
  ```
  Überprüfen Sie den Diff und führen Sie ihn manuell zusammen oder löschen Sie ihn.

Zwei Einschränkungen:

- `isolation: "worktree"` erfordert einen `subagent_type` – geforkte Sub-Agenten (ohne `subagent_type`) verwenden den vollständigen Gesprächskontext des Elternteils, daher würde ihre Isolation die Absicht vom Arbeitsbaum trennen.
- Hintergrund-Agenten (`run_in_background: true`) funktionieren problemlos mit Isolation; die Bereinigung läuft, wenn der Agent seinen Abschluss meldet.

### Automatische Bereinigung veralteter Einträge

Ephemere Agent-Worktrees, die einen Absturz oder ein `--no-cleanup`-Herunterfahren überlebt haben, werden bei jedem CLI-Start entfernt, mit konservativen Fail-Closed-Regeln:

| Schutz                                    | Verhalten                                            |
| ----------------------------------------- | ---------------------------------------------------- |
| Slug muss dem Muster `agent-<7hex>` entsprechen | Von Ihnen erstellte benannte Worktrees werden nie angerührt. |
| Verzeichnis `mtime` > 30 Tage             | Neuere Einträge werden übersprungen.                 |
| Irgendeine uncommittete Änderung an getrackten Dateien | Eintrag überspringen (nicht löschen).                |
| Irgendein Commit, der nicht von einem Remote aus erreichbar ist | Eintrag überspringen (nicht löschen).                |
| Irgendein Fehler beim Lesen des Git-Zustands | Eintrag überspringen (nicht löschen).                |

Benannte Benutzer-Worktrees (`enter_worktree`-Slugs) werden **nie** automatisch bereinigt – Sie behalten sie, bis Sie bitten, sie zu entfernen.

## Sicherheitsmaßnahmen bei `exit_worktree action="remove"`

Drei unabhängige Sicherungen greifen, bevor das Verzeichnis und der Branch gelöscht werden:

1. **Sitzungsbesitz** – jeder Worktree trägt einen Sidecar-Marker mit der Sitzungs-ID, die ihn erstellt hat. Eine andere Sitzung, die versucht, ihn zu entfernen, wird mit einem klaren Fehler abgewiesen, der auf `git worktree remove` als manuelle Notluke verweist.
2. **Schmutziger Arbeitsbaum** – uncommittete getrackte oder untrackte Änderungen blockieren das Entfernen. Übergeben Sie `discard_changes: true`, um dies zu überschreiben. (Umgehung erfordert explizite Benutzerbestätigung – `action: "remove"` wird im AUTO_EDIT-Modus nie automatisch genehmigt.)
3. **Unzusammengeführte Commits** – Commits auf `worktree-<slug>`, auf die kein anderer lokaler Branch oder Remote-Ref zeigt, blockieren das Entfernen bedingungslos; es gibt kein "Verwerfe Commits"-Flag, da das Verlieren von commiteter Arbeit selten das ist, was Benutzer meinen. Führen Sie zuerst merge, push oder rename des Branches woanders durch.

Die gleichen drei Sicherungen gelten für den `WorktreeExitDialog → Remove`-Button.

## Einstellungen

Zwei Einstellungen formen das allgemeine Worktree-Erlebnis:

| Schlüssel                          | Typ       | Standard   | Wirkung                                                                                                                                                                                                                                                               |
| ---------------------------------- | --------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ui.hideBuiltinWorktreeIndicator`  | boolean   | `false`    | Blendet die eingebaute `⎇ worktree-… (…)`-Fußzeilen-Zeile aus. Das `worktree`-Feld wird weiterhin an benutzerdefinierte Statuszeilen-Skripte geliefert. Setzen Sie dies nur auf `true`, wenn Ihre Statuszeile den Worktree bereits darstellt – sonst verlieren Sie jede visuelle Unterstützung. |
| `worktree.symlinkDirectories`      | `string[]`| `undefined`| Verzeichnisse unter dem Haupt-Repo, die in jeden allgemeinen Worktree bei der Erstellung symlinkiert werden sollen. Pfade sind relativ zur Repo-Wurzel; absolute Pfade und Einträge mit `..` werden abgelehnt. Fehlende Quellen und vorhandene Ziele werden stillschweigend übersprungen (keine Überschreibung). |

Beispiel:

```jsonc
// ~/.qwen/settings.json oder <repo>/.qwen/settings.json
{
  "worktree": {
    "symlinkDirectories": ["node_modules", ".turbo", "dist"],
  },
}
```

Gilt für ALLE Worktree-Erstellungspfade: `--worktree`-Flag, `enter_worktree`-Werkzeug und `agent isolation: "worktree"`.

Einstellungen, die nichts mit allgemeinen Worktrees zu tun haben, aber wissenswert sind:

- `agents.arena.worktreeBaseDir` – steuert die Platzierung von **Agent Arena**-Worktrees (Standard `~/.qwen/arena`). Hat keinen Einfluss auf allgemeine Worktrees, die immer unter `<repoRoot>/.qwen/worktrees/` liegen.

Es gibt noch kein Schema für `worktree.sparsePaths` – das ist ein Roadmap-Element (siehe [Einschränkungen](#einschränkungen)).

## Werkzeug-Referenz

### `enter_worktree`

```json
{ "name": "experiment-a" }
```

| Feld   | Typ    | Erforderlich | Hinweise                                                                                       |
| ------ | ------ | ------------ | ---------------------------------------------------------------------------------------------- |
| `name` | string | nein         | Slug. Buchstaben, Ziffern, Punkt, Unterstrich, Bindestrich; max. 64 Zeichen. Bei Weglassen automatisch generiert. |

Weigert sich auszuführen, wenn:

- Die CLI sich nicht in einem Git-Repository befindet.
- Das aktuelle Arbeitsverzeichnis bereits innerhalb von `.qwen/worktrees/` liegt (keine verschachtelten Worktrees).

### `exit_worktree`

```json
{ "name": "experiment-a", "action": "remove", "discard_changes": false }
```

| Feld              | Typ                    | Erforderlich                              | Hinweise                                                             |
| ----------------- | ---------------------- | ----------------------------------------- | -------------------------------------------------------------------- |
| `name`            | string                 | ja                                        | Muss mit dem Slug übereinstimmen, der in `enter_worktree` verwendet wurde. |
| `action`          | `"keep"` \| `"remove"`| ja                                        | `keep` erhält Verzeichnis + Branch; `remove` löscht beides.          |
| `discard_changes` | boolean                | nur wenn `action="remove"` und schmutzig  | Überschreibt die Dirty-Baum-Sicherung. Hat keine Wirkung bei `action="keep"`. |

`action: "remove"` fordert immer eine Bestätigung an, auch im `AUTO_EDIT`-Zustimmungsmodus – es wird als destruktive Shell-Operation behandelt, nicht als reines Informationswerkzeug.

### `agent` – `isolation`-Parameter

```json
{
  "subagent_type": "my-agent",
  "description": "…",
  "prompt": "…",
  "isolation": "worktree"
}
```

| Feld        | Typ          | Erforderlich | Hinweise                                                                                            |
| ----------- | ------------ | ------------ | --------------------------------------------------------------------------------------------------- |
| `isolation` | `"worktree"` | nein         | Führt den Agenten in einem frischen `agent-<7hex>`-Worktree aus. Erfordert, dass `subagent_type` gesetzt ist (keine Forks). |

Siehe [Sub-Agenten](./sub-agents.md) für den Rest der Agent-Werkzeug-Referenz.

## CLI-Referenz

### `--worktree [name | #N | url]`

```bash
qwen --worktree                                               # Slug automatisch generieren
qwen --worktree my-feature                                    # Expliziter Slug
qwen --worktree=my-feature                                    # =-Form
qwen --worktree=#123                                          # PR-Referenz
qwen --worktree https://github.com/owner/repo/pull/123        # PR-URL
```

| Eingabe                        | Ergebnis                                                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Bloßes Flag (kein Wert)        | Auto-Slug `<Adjektiv>-<Substantiv>-<6hex>`, Branch `worktree-<slug>`, Basis = aktueller Branch.                            |
| Einfacher Slug                 | Branch `worktree-<slug>`, Basis = aktueller Branch. Slug-Validierung: Buchstaben/Ziffern/Punkt/Unterstrich/Bindestrich, max. 64 Zeichen. |
| `#N` oder `<github-url>/pull/N`| Slug `pr-<N>`, Branch `worktree-pr-<N>`, Basis = `FETCH_HEAD` nach `git fetch origin pull/<N>/head` (30s Timeout).        |

`--worktree` kann nicht mit `--acp` / `--experimental-acp` kombiniert werden.

Wenn `--worktree` mit `--resume <session-id>` kombiniert wird, gewinnt der Worktree: Der gespeicherte Worktree der fortgesetzten Sitzung (falls vorhanden) wird überschrieben, und eine stderr-Zeile sowie eine Erinnerung beim ersten Prompt melden die Überschreibung.

Für interaktive (TUI) und Headless-Modi (`-p`) wird der Worktree automatisch erstellt und die Sitzung wechselt per `chdir` hinein, bevor die erste Runde läuft.

PR-Abruf-Fehlermodi (Exit-Code != 0, kein Worktree erstellt):

| Ursache                        | Meldungsauszug                                              |
| ------------------------------ | ----------------------------------------------------------- |
| Fehlender `origin`-Remote      | `erfordert einen "origin"-Remote, der auf GitHub zeigt`     |
| PR existiert nicht auf origin  | `PR #<N> konnte nicht abgerufen werden: Der PR existiert nicht auf origin` |
| 30s Netzwerk-Timeout           | `PR #<N> konnte nicht abgerufen werden: Zeitüberschreitung nach 30s` |
| PR-Nummer außerhalb des Bereichs / null | `Ungültige PR-Nummer`                                              |

## Einschränkungen

Die folgenden Punkte sind in der aktuellen Phase bewusst nicht implementiert:

- **Kein Sparse-Checkout.** Große Monorepos checken den vollständigen Baum aus. (`worktree.sparsePaths` ist ein Roadmap-Element.)
- **Keine tmux-Integration.** Die CLI startet keine Worktree-Sitzungen in neuen tmux-Fenstern.
- **Worktrees sind separate "Projekte" für die Sitzungsspeicherung.** Sitzungen, die mit `--worktree foo` gestartet wurden, werden unter dem Chats-Verzeichnis dieses Worktrees gespeichert; um sie später fortzusetzen, müssen Sie erneut `--worktree foo` übergeben. Sitzungen, die ohne `--worktree` gestartet wurden, werden unter dem Haupt-Checkout gespeichert und erscheinen nicht in der Fortsetzungsauswahl des Worktrees.
- **Keine sitzungsübergreifende Worktree-Überschreibung.** `qwen --resume <sid> --worktree second`, wobei `<sid>` mit `--worktree first` erstellt wurde, schlägt fehl, die Sitzung zu finden – Sitzungen und Worktrees sind fest durch `projectHash(cwd)` verbunden. Um den Worktree einer bestehenden Sitzung zu wechseln, müssen Sie die Sitzung beenden und dann mit dem neuen `--worktree` und einem frischen Prompt neu starten. Eine zukünftige architektonische Änderung (Verankerung des Speichers auf Repo-Ebene anstatt auf `cwd`) würde diese Einschränkung aufheben.
- **`enter_worktree` mitten in der Sitzung wechselt NICHT `process.cwd()` oder `Config.targetDir`.** Dieses Werkzeug verwendet die reine Modellkontext-Konvention (siehe [Sub-Agenten](./sub-agents.md)). Nur das Start-Flag `--worktree` wechselt tatsächlich das Arbeitsverzeichnis des Prozesses.
- **Relative Pfade in anderen Argumentfeldern werden VOR dem Worktree-chdir aufgelöst.** Pfad-annehmende Flags (`--mcp-config`, `--openai-logging-dir`, `--json-file`, `--input-file`, `--telemetry-outfile`, `--include-directories`) werden bei gesetztem `--worktree` gegen das Start-cwd zu absoluten Pfaden normalisiert. Andere pfadförmige argv-Felder, die nicht in dieser Liste sind, werden weiterhin gegen das Worktree-cwd aufgelöst – verwenden Sie absolute Pfade, um sicherzugehen.
Verfolgen Sie die Roadmap in `docs/design/worktree.md`.

## Fehlerbehebung

**Die Fußzeile zeigt keinen Worktree-Indikator, obwohl ich gerade einen erstellt habe.**
Prüfen Sie, dass `ui.hideBuiltinWorktreeIndicator` nicht auf `true` gesetzt ist. Bestätigen Sie außerdem, dass der Slug in der Erfolgsmeldung des Tools nicht leer ist.

**`--resume` stellt meinen Worktree nicht wieder her.**
Prüfen Sie, ob `<chatsDir>/<sessionId>.worktree.json` existiert. Die CLI löscht die Sidecar automatisch, wenn das Worktree-Verzeichnis verschwunden ist. Ein fehlende Sidecar und ein fehlendes Verzeichnis ist also der normale Zustand „kein Worktree wiederherzustellen“ – kein Fehler. Führen Sie mit `--debug` aus und suchen Sie mit `grep` nach `restoreWorktreeContext`, um den Grund zu sehen.

**`exit_worktree` meldet „created by a different session“.**
Das ist die Sitzungsbesitzsperre (session-ownership guard). Setzen Sie die ursprüngliche Sitzung fort und beenden Sie von dort aus, oder führen Sie den vorgeschlagenen Befehl `git worktree remove …` manuell aus.

**Veraltete `agent-<hex>`-Worktrees sammeln sich an.**
Die 30-Tage-Grenze ist konservativ; räumen Sie manuell auf mit `git worktree list && git worktree remove <path>` oder warten Sie – der nächste CLI-Start nach Ablauf der 30 Tage wird sie entfernen, solange sie sauber und gepusht sind.