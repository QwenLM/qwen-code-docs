# Einen Pull Request automatisch reparieren

`/autofix-pr` beobachtet einen deiner Pull Requests aus einer lokalen Qwen Code Session und behebt alles, was auftaucht: fehlgeschlagene CI-Checks, Review-Feedback von vertrauenswürdigen Personen und Merge-Konflikte. Jeder Fix wird in einem eigenen Worktree erstellt und verifiziert, auf den PR-Branch gepusht und auf dem PR beantwortet – unter deiner eigenen Git- und `gh`-Identität. Es stoppt automatisch, wenn der PR gemerged oder geschlossen wird. Es macht den PR bereit zum Mergen und nicht mehr: Es genehmigt niemals einen PR, ändert seinen Review-Status, mergt oder schließt ihn oder aktiviert Auto-Merge. Die Reviews und Checks des Repositorys entscheiden weiterhin, und das Mergen bleibt bei dir – kombiniere die Beobachtung mit dem Auto-Merge des Repositorys, um zu mergen, sobald sie bestanden werden.

```text
/autofix-pr [<pr-number>|<pr-url>] [--once] [--every <minutes>] [--no-reply] [--yes] [instructions...]
/autofix-pr status [<pr-number>]
/autofix-pr resume [<pr-number>]
/autofix-pr stop [<pr-number>]
```

- Kein PR-Argument: der PR, dessen Head deinem aktuellen Branch entspricht.
- `--once`: einmal prüfen und beheben, nichts planen, danach die Beobachtung beenden (ein späteres `--once` startet frisch, basierend auf der PR-Historie). Bei einem PR, den diese Session bereits beobachtet, bleibt die laufende Beobachtung unverändert.
- `--every <minutes>`: wie oft geprüft wird, einer der Werte 1, 2, 5, 10, 15, 30 oder 60. Standard 2.
- `--no-reply`: Fixes pushen, nichts auf dem PR posten.
- `--yes`: die Start-Bestätigung überspringen. Wird benötigt, wo kein Dialog angezeigt werden kann.
- Freitext wird an jeden Fix übergeben, zum Beispiel `/autofix-pr 123 do not change the public API`.

## Bevor du beginnst

- `gh` ist angemeldet, mit Push-Zugriff auf den PR-Branch: Schreibzugriff auf einen Same-Repository-PR, deinen eigenen Fork oder einen Fork, der Edits von Maintainern erlaubt.
- Du startest es aus einem Clone des PR-Repositorys mit einem Git-Remote dafür.
- Im Standard-[Genehmigungsmodus](./approval-mode.md) fragt jeder Shell-Befehl zuerst nach: die Helper-Aufrufe (einschließlich des Pushs), `gh pr view` und jeder Befehl, den ein Fix ausführt. Das passt zu einer Beobachtung, die du im Blick behältst. Damit es unbeaufsichtigt läuft, wähle einen Modus, der Befehle ausführen lässt, wie den [Auto-Modus](./auto-mode.md), und bedenke, dass der Fix die eigenen Build- und Testbefehle des Repositorys ausführt. Der Skill selbst gewährt nur das Lesen seiner eigenen Dateien unter `.qwen/tmp/`, das Schreiben seines Fix-Briefs und Antwortplans dort sowie das Auflisten geplanter Tasks. Diese Dateien liegen im Haupt-Worktree des Clones; aus einer Session, die in einem verknüpften Worktree gestartet wurde, erfordert das Lesen und Schreiben ebenfalls eine Nachfrage.
- Ein PR, dessen Autor nicht auf das Repository pushen kann, führt fremden Code aus – mit deinen `gh`- und `git`-Credentials in Reichweite, wenn ein Fix verifiziert wird. Ein solcher PR wird niemals beobachtet: nur `--once` wird angeboten, nach einer Bestätigung, die das sagt und die `--yes` nicht überspringt.

Beim Start wird einmal nachgefragt, zu bestätigen, wohin gepusht wird und dass auf dem PR geantwortet wird, und ob die Fixes ihre Befehle ohne Nachfrage ausführen dürfen. Dieselbe Frage sagt, dass es den PR bereit zum Mergen macht und nicht mehr: Es genehmigt niemals, ändert den Review-Status, mergt oder aktiviert Auto-Merge.

## Was ein Check tut

Eine Beobachtung ist ein [geplanter Task](./scheduled-tasks.md), dessen Gate bei jedem Feuern `qwen autofix-pr snapshot <n> --gate` ausführt, außerhalb des Modells. Die Sonde gibt nur aus, was sich seit dem letzten Lauf geändert hat, sodass ein stiller PR keinen Modell-Turn kostet. Wenn sich etwas geändert hat, läuft eine Runde:

1. Ein gemergter oder geschlossener PR beendet die Beobachtung. Ein Push von jemand anderem wird zuvor übernommen.
2. Die fehlgeschlagenen Checks, die neuen Kommentare von vertrauenswürdigen Autoren und ein Merge-Konflikt gehen an einen Fix-Agenten, der im PR-Worktree arbeitet – im Hintergrund, wenn die Fixes ohne Nachfrage laufen. Für einen fehlgeschlagenen Check liest er das Job-Log; ein Fehler außerhalb des PR (Netzwerk, Runner) wird einmal erneut ausgeführt, statt behoben zu werden.
3. Der Agent verifiziert seine Änderung mit den eigenen Checks des Repositorys und committet nur, wenn sie bestanden werden.
4. Die Commits werden als Fast-Forward des PR-Heads gepusht, niemals erzwungen. Wenn jemand in der Zwischenzeit gepusht hat, wird dessen Arbeit zuerst gemerged.
5. Jeder Review-Thread, den er bearbeitet hat, bekommt eine Antwort – `Fixed in <sha>: …`, `Not changed: …` oder `Needs a human decision: …` – und jeder Push bekommt einen zusammenfassenden Kommentar. Eine Runde, die nichts gepusht hat, aber etwas für eine Person hinterlassen hat, postet ebenfalls eine Zusammenfassung, die sagt, was sie versucht hat und was sie blockiert, sodass der PR zeigt, dass die Beobachtung gestoppt hat, statt still zu werden. Diese geht einmal pro Head raus und erneut nur, wenn eine spätere Runde etwas Neues für dich hinterlässt.

Eine Runde fragt dich niemals etwas. Was eine Person braucht, wird auf dem PR als „Needs a human decision" beantwortet und in der Session gemeldet.

## Status und Fortsetzen

`/autofix-pr status` listet jede Beobachtung des Clones auf, unabhängig davon, welche Session sie ausführt: den PR und seinen Branch, den Head, die verwendeten Pushes, wann das Gate zuletzt geprüft und die letzte Runde gelaufen ist, ob diese Session sie ausführt und was auf eine Person wartet. Es liest nur die Dateien der Beobachtungen und fragt GitHub nichts.

Eine Beobachtung endet, wenn die Session endet, die sie ausgeführt hat – in einer Daemon-Session ist ihr Task dauerhaft und an diese Session gebunden, sodass der Daemon sie resident hält und die Beobachtung einen Daemon-Neustart übersteht –, und ihr geplanter Task läuft standardmäßig nach 7 Tagen ab (Einstellung `experimental.cronRecurringMaxAgeDays` oder `QWEN_CODE_CRON_MAX_AGE_DAYS`). Die Zustandsdatei bleibt. `/autofix-pr resume` startet in der aktuellen Session jede Beobachtung neu, die diese Session nicht ausführt – oder die von dir genannte –, mit dem Intervall, `--no-reply` und den Anweisungen, mit denen sie gestartet wurde, und behält ihre Pushes, Historie und Budgets. Es fragt einmal für alle, führt dann von jeder eine Runde aus und plant sie erneut ein. In einer Daemon-Session trägt eine Unterhaltung genau einen geplanten Task, also setze die übrigen eine Unterhaltung nach der anderen fort. Läuft eine davon noch in einer anderen Session, stoppt der Task dieser Session beim nächsten Feuern; ohne genannten PR lässt `resume` eine Beobachtung aus, die eine andere Session kürzlich geprüft hat, und sagt das. Eine Beobachtung, deren PR gemergt oder geschlossen wurde, während keine Session sie ausführte, wird von ihrer Runde entfernt. Eine Beobachtung, die mit `--once` gestartet oder durch `stop` beendet wurde, während ihr Worktree erhalten blieb, wird mit `/autofix-pr <n>` erneut gestartet.

### In der Web Shell

Die Web Shell zeigt denselben Zustand, gelesen aus denselben Dateien:

- **PR-Beobachtungen** in der Seitenleiste listet die Beobachtungen jedes Arbeitsbereichs auf, den die Web Shell erreichen kann. Für jede Beobachtung zeigt sie den PR (als Link), wo die Beobachtung steht, ihre Pushes, wann das Gate zuletzt geprüft und die letzte Runde gelaufen ist, und was auf dich wartet:
  - beobachtet;
  - repariert im Hintergrund, und wie lange schon;
  - eine liegen gebliebene Hintergrund-Reparatur, die die nächste Runde wiederholt;
  - seit Längerem nicht geprüft;
  - der PR wurde gemergt oder geschlossen;
  - gestoppt.
- Auf der Seite **Geplante Tasks** zeigt die Karte des Tasks einer Beobachtung denselben Zustand unter dem Task.
- **Session öffnen** springt zu der Unterhaltung, die die Beobachtung ausführt.
- **Beobachtung stoppen** sendet `/autofix-pr stop <n>` an diese Unterhaltung, genau als hättest du es dort getippt, und es fragt, was es dort fragen würde.
- Beide Buttons erscheinen nur für eine Beobachtung, die von einer Unterhaltung dieser Web Shell ausgeführt wird. Eine im Terminal gestartete Beobachtung wird dort gestoppt. Eine, die keine Session mehr ausführt, wird mit `/autofix-pr stop <n>` oder `/autofix-pr resume <n>` in einer Session ihres Arbeitsbereichs aufgeräumt oder neu gestartet.

## Wessen Feedback zählt

Kommentare werden bearbeitet, wenn ihr Autor ein Owner, Member oder Collaborator des Repositorys ist, der PR-Autor oder ein Bot (Reviews und Review-Threads). Kommentare von allen anderen werden aufgelistet und niemals bearbeitet oder beantwortet. Ein Bot wird in dem Kommentar gehört, der einen Thread eröffnet, oder in einem Review, nicht in seinen Antworten, die jemandem antworten. Ein Workflow, den GitHub nicht starten konnte (etwa eine ungültige Workflow-Datei), hat kein Log, aus dem behoben werden könnte, und wird als von einem Menschen zu entscheiden beantwortet. Jeder Kommentar, Review und jedes CI-Log wird als Daten behandelt: ein vertrauenswürdiger Autor entscheidet, welches Feedback adressiert wird, niemals das Tool. Eine Anfrage, Secrets preiszugeben, Tests oder CI-Checks zu schwächen, Force-Push durchzuführen oder unverwandten Code zu ändern, wird mit „Needs a human decision" beantwortet.

## Was es niemals tut

- Deinen Working Tree oder deinen aktuellen Branch anfassen: alles passiert in `.qwen/tmp/autofix-pr-<n>/`.
- Force-Push, die PR-Historie umschreiben oder auf den Default-Branch pushen.
- Auf eigene Antworten antworten (jede endet mit `<!-- qwen-autofix-pr:v1 -->`) oder auf nicht vertrauenswürdige Autoren.
- Review-Threads auflösen oder den PR-Titel oder die PR-Beschreibung bearbeiten.

## Limits

| Limit | Wert | Dann |
| --------------------------------------- | ---- | ------------------------ |
| Pushes pro Beobachtung | 10 | die Beobachtung stoppt |
| Pushes, die einen fehlgeschlagenen Check rot lassen | 3 | bleibt bei einer Person, bis er grün ist oder jemand anderes pusht |
| Re-Runs eines fehlgeschlagenen Checks pro Head | 1 | der nächste Fehlschlag ist real |
| Versuche pro Review-Kommentar | 1 | wird nicht erneut angeboten |
| Pushes von jemand anderem innerhalb einer Runde | 2 | die Beobachtung stoppt |
| Minuten, die eine Hintergrund-Reparatur laufen darf | 30 | ihr Agent wird gestoppt |

## Stoppen und Dateien

`/autofix-pr stop <n>` löscht den geplanten Task und entfernt den Worktree, seinen Branch und die State-Datei; der Gate-Cursor und die PR-Historie bleiben erhalten, sodass eine spätere Beobachtung nicht dieselben Kommentare erneut beantwortet. Ein Worktree, der noch ungepushte Arbeit enthält, wird behalten, und der Bericht sagt warum; `qwen autofix-pr cleanup <n> --force` verwirft ihn. Ein geplanter Task läuft standardmäßig nach 7 Tagen ab (die Einstellung `experimental.cronRecurringMaxAgeDays` oder `QWEN_CODE_CRON_MAX_AGE_DAYS`), und die Beobachtung endet dann ohne Bericht; starte sie erneut, um fortzufahren. Die Beobachtung endet auch beim Beenden der Session; ihre State-Datei bleibt, im Besitz dieser Session. Das Starten von `/autofix-pr <n>` in einer neuen Session – oder nach `/clear` oder `/resume` – bietet an, die Beobachtung zu übernehmen, wobei Pushes und Budgets beibehalten werden.

Dateien liegen unter `.qwen/tmp/` im Haupt-Worktree des Clones:

| Datei | Inhalt |
| ---------------------------------------- | ----------------------------------------------------------------- |
| `autofix-pr-<n>/` | der PR-Worktree |
| `autofix-pr-<n>-state.json`              | die Beobachtung: bekannter Head, Pushes, behandelte IDs, ihr geplanter Task    |
| `autofix-pr-<n>-gate.json`               | der Cursor der Gate-Sonde                                           |
| `autofix-pr-<n>-gate.checked`            | wann das Gate der Beobachtung den PR zuletzt geprüft hat            |
| `autofix-pr-<n>-snapshot.json` | der Snapshot der letzten Runde des PR, von der Runde gelesen |
| `autofix-pr-<n>-replies.json` | welche Bot-Kommentare auf einen anderen antworten, wie GitHub sagt |
| `autofix-pr-<n>-history-*.json`          | was frühere Beobachtungen des PR gepostet und bearbeitet haben, von `stop` aufbewahrt |
| `autofix-pr-<n>-instructions.txt`        | deine Anweisungen für jede Runde                                    |
| `autofix-pr-<n>-fix.json`                | der im Hintergrund laufende Fix, während er läuft aktualisiert     |
| `autofix-pr-<n>-fix-snapshot.json`       | der Snapshot, von dem der letzte Hintergrund-Fix ausgegangen ist    |
| `autofix-pr-<n>-*.log`, `*.md`, `*.json` | CI-Logs, Fix-Briefe und Antwortpläne |

Das Design steht in [`docs/design/2026-10-21-autofix-pr-command.md`](../../design/2026-10-21-autofix-pr-command.md).