# Härtung der Autofix-Review-Thread-Auflösung

## Problem

Qwen Autofix lässt den Review-Address-Agenten bereits Inline-Review-Kommentare identifizieren, die im Code aufgelöst sind. Der Credential-führende Host-Workflow mappt diese REST-Kommentar-IDs auf GitHub-Review-Threads und ruft `resolveReviewThread` nach dem Push des Fixes auf.

Die aktuelle Reihenfolge ist generell sicher, aber sie beweist nicht, dass der Live-PR-Head, der aufgelöst wird, exakt der Commit ist, der von der deterministischen Verifikation abgedeckt wird:

- Ein abgelehnter Push kann gerettet werden, indem ein neu weitergezogener Remote-Head gemerged wird. Der gemergte Commit wird gepusht, obwohl die Verifikation vor dem Merge stattfand.
- Der PR-Autor kann erneut pushen, nachdem Autofix gepusht hat und bevor die Resolution-Mutation stattfindet.
- Eine Same-Run-Reparatur kann `resolved-comments.txt` oder `comment-replies.json` vom abgelehnten ersten Versuch erben.

Diese Lücken können eine Konversation als aufgelöst markieren, ohne Beleg, dass der aktuelle PR-Head den verifizierten Fix noch enthält.

## Aktueller Zustand

Die Verantwortlichkeiten sind bereits korrekt getrennt:

- `.qwen/skills/autofix/SKILL.md` sagt dem Agenten, wie er Findings klassifiziert und `resolved-comments.txt` oder `comment-replies.json` schreibt.
- `.github/scripts/run-autofix-review-verification.sh` führt unabhängig deterministisches Build, Typecheck, Lint und Tests der betroffenen Pakete aus.
- `.github/workflows/qwen-autofix.yml` besitzt den GitHub-PAT, pusht den Branch, holt Review-Threads und führt Mutationen aus.
- `scripts/tests/qwen-autofix-workflow.test.js` extrahiert und führt Workflow-Shell-Blöcke mit gestubbten GitHub-Responses aus.

Die GitHub-Mutation muss im vertrauenswürdigen Workflow bleiben. Der Agent darf keine GitHub-Credentials erhalten.

## Vorgeschlagene Änderungen

### Verifikations-Gate

Vor den deterministischen Checks werden ein sauberer getrackter Worktree und Index verlangt, der Commit-SHA erfasst und verlangt, dass sowohl SHA als auch getrackter Zustand nach den Struktur-Checks und erneut nach Build, Typecheck, Lint und Tests unverändert bleiben. Dann wird dieser erfasste SHA als Step-Output namens `verified_head` aufgezeichnet. Für No-op- oder fehlgeschlagene Ergebnisse wird er nicht ausgegeben. Das lehnt persistente getrackte Änderungen oder Commits ab, die von branch-kontrollierten Checks erzeugt wurden; es behauptet kein unveränderliches Dateisystem und erkennt kein Skript, das innerhalb eines Befehls den Zustand temporär ändert und wiederherstellt — das bleibt Teil des bestehenden CI-Trust-Modells.

### Finale Verifikationsauswahl

Der gewählte Verifikations-SHA wird durch den finalen Verifikationsschritt propagiert:

- den ersten Verifikations-SHA verwenden, wenn keine Reparatur lief;
- nur den Reparatur-Verifikations-SHA verwenden, wenn eine Reparatur lief;
- für ein erfolgreiches repariertes Ergebnis nie auf den ersten SHA zurückfallen.

### Reparatur-Isolation

Vor dem Aufruf des Reparatur-Agenten werden `resolved-comments.txt` und `comment-replies.json` zusammen mit den anderen Artefakten des vorherigen Versuchs entfernt. Der Reparaturversuch muss seine finalen Dispositionen explizit neu generieren. Fehlende Dateien fail-closen daher: Es wird kein Thread aufgelöst oder beantwortet.

### Post-Push-Resolution-Nachweis

Bevor ein gewählter Thread aufgelöst wird, ist alles Folgende erforderlich:

1. `verified_head` ist nicht leer.
2. Die Push-Race-Rettung hat keinen unverifizierten Merge-Commit erzeugt.
3. Der lokale `HEAD` nach dem erfolgreichen Push entspricht `verified_head`.
4. Eine Live-`gh pr view`-Abfrage ist erfolgreich.
5. Der Live-PR-`headRefOid` entspricht vor jeder Mutation `verified_head`.
6. Der Live-PR-`headRefOid` entspricht unmittelbar nach jeder Mutation weiterhin `verified_head`.

Vor jeder Mutation liest ein einzelner GraphQL-Guard sowohl den Live-`headRefOid` als auch den Live-`isResolved`-Zustand des Ziel-Threads. Ein Thread, der bereits von einem anderen Akteur aufgelöst wurde, wird übersprungen. Nach der Mutation verifiziert derselbe Guard beide Werte erneut. Dieser Post-Check läuft auch, wenn der Mutationsbefehl einen Fehler zurückgibt, denn eine verlorene Response beweist nicht, dass GitHub die Mutation nicht angewendet hat.

Wenn eine Prä-Mutations-Bedingung unbekannt oder falsch ist oder eine Post-Mutations-Bedingung mehrdeutig ist, wird das Auflösen weiterer Konversationen gestoppt. Eine fehlgeschlagene Mutation, deren Post-Guard beweist, dass der verifizierte Head unverändert ist und der Thread offen bleibt, darf mit Warnung fortgesetzt werden. Der Workflow ruft nicht `unresolveReviewThread` auf: GitHub stellt keine Compare-and-Swap-Vorbedingung oder Mutationszuordnung bereit, sodass selbst eine erfolgreiche `resolveReviewThread`-Response nicht beweisen kann, dass ein anderer Akteur den Thread nicht zwischen Pre-Guard und Mutation aufgelöst hat. Automatisches Wiedereröffnen könnte daher die Aktion eines anderen Reviewers rückgängig machen. Ein nicht erfolgreicher Mutationsbefehl, dem ein Post-Guard folgt, der den verifizierten Head und den aufgelösten Zustand bestätigt, wird als beobachteter aufgelöster Zustand gezählt, ohne ihn Autofix zuzuschreiben; jedes mehrdeutige Ergebnis stoppt die verbleibenden Mutationen.

Der verifizierte Code-Push und der normale Rundenbericht sind weiterhin erfolgreich. Antworten für bewusst offen gelassene Findings dürfen nach einem erfolgreichen Push weitergehen, weil sie nicht behaupten, dass ein Thread gefixt ist.

## Design-Entscheidungen

- **Fail-closed bei der Auflösung:** Ein unaufgelöster Thread ist wiederherstellbar; ein inkorrekt aufgelöster Thread kann einen echten Defekt verbergen.
- **Auflösung nach Race-Merge überspringen:** Das vollständige deterministische Gate im PAT-führenden Publish-Schritt erneut auszuführen, würde teure Logik duplizieren und branch-kontrollierte Skripte mit Credentials im Scope ausführen. Eine spätere Review-Runde kann den Thread sicher auflösen.
- **Live-PR-Zustand unmittelbar vor der Mutation abfragen:** Workflow-Parallelität kann direkte Contributor-Pushes nicht verhindern.
- **Bestehenden Modell-Disposition-Vertrag behalten:** Semantische Urteile bleiben beim Agenten, während exakte Commit-Identität deterministisch vom Host erzwungen wird.
- **Keinen generischen CLI/Core-Code hinzufügen:** Das ist Autofix-Workflow-Orchestrierung, kein wiederverwendbares Qwen-Code-Runtime-Feature.

## Betroffene Dateien

- `.github/scripts/run-autofix-review-verification.sh`
- `.github/workflows/qwen-autofix.yml`
- `scripts/tests/qwen-autofix-workflow.test.js`
- `.qwen/skills/autofix/SKILL.md` zur Vertragsklärung

## Scope-Grenzen

Enthalten:

- exakte Gleichheit von verifiziertem/Live-Head;
- Push-Race-Fail-closed-Verhalten;
- Dispositions-Isolation für Reparaturversuche;
- fokussierte Workflow-Vertrags- und Verhaltenstests.

Ausgeschlossen:

- GraphQL-Pagination über die bestehenden ersten 100 Threads hinaus;
- das Auflösen beliebiger Nicht-Autofix-PR-Konversationen;
- das Dismissen von `CHANGES_REQUESTED`-Reviews;
- dem Modell direkte GitHub-Credentials geben;
- Änderungen am generischen `/review`- oder CLI-Verhalten.

## Offene Fragen

Keine. Das konservative Verhalten ist vor der Mutation deterministisch: Unsicherheit verhindert, dass weitere Threads aufgelöst werden. Nach einer Mutation beobachtet der Workflow den Zustand und meldet ihn, hebt aber nie automatisch eine Auflösung auf, ohne atomaren Ownership-Beleg.
