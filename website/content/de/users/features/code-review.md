# Code Review

> Überprüfe Codeänderungen auf Korrektheit, Sicherheit, Performance und Codequalität mit `/review`.

## Quick Start

```bash
# Review local uncommitted changes
/review

# Review a pull request (by number or URL)
/review 123
/review https://github.com/org/repo/pull/123

# Review and post inline comments on the PR
/review 123 --comment

# Review a specific file
/review src/utils/auth.ts
```

Wenn es keine uncommitted Änderungen gibt, informiert dich `/review` darüber und stoppt – es werden keine Agents gestartet.

## Funktionsweise

Der `/review`-Befehl führt eine mehrstufige Pipeline aus:

```
Step 1:  Scope bestimmen (local diff / PR worktree / file)
Step 2:  Projekt-Review-Regeln laden
Step 3:  10 parallele Review-Agents                         [10 LLM calls]
           |-- Agent 0: Issue Fidelity & Root-Cause Ownership
           |-- Agent 1: Correctness
           |-- Agent 2: Security
           |-- Agent 3: Code Quality
           |-- Agent 4: Performance & Efficiency
           |-- Agent 5: Test Coverage
           |-- Agent 6: Undirected Audit (3 Personas: 6a/6b/6c)
           '-- Agent 7: Build & Test (führt Shell-Befehle aus)
Step 4:  Deduplizieren --> Batch-Verifizierung --> Aggregieren [1 LLM call]
Step 5:  Iterativer Reverse Audit (1-3 Runden, Gap-Finding)   [1-3 LLM calls]
Step 6:  Ergebnisse + Fazit präsentieren
Step 7:  PR-Review einreichen (Inline-Kommentare, falls angefordert)
Step 8:  Report + inkrementellen Cache speichern
Step 9:  Aufräumen (Worktree + temporäre Dateien entfernen)
```

### Review-Agents

| Agent                             | Fokus                                                                                       |
| --------------------------------- | ------------------------------------------------------------------------------------------- |
| Agent 0: Issue Fidelity           | Verknüpfte Issue-Nachweise, Root-Cause-Ownership und ob der PR das gemeldete Problem löst |
| Agent 1: Correctness              | Logikfehler, Edge Cases, Null-Handling, Race Conditions, Type Safety                        |
| Agent 2: Security                 | Injection, XSS, SSRF, Auth-Bypass, Offenlegung sensibler Daten                            |
| Agent 3: Code Quality             | Style-Konsistenz, Naming, Duplikate, Dead Code                                              |
| Agent 4: Performance & Efficiency | N+1-Queries, Memory Leaks, unnötige Re-Renders, Bundle-Größe                                |
| Agent 5: Test Coverage            | Ungetestete Code-Pfade im Diff, fehlende Branch-Coverage, schwache Assertions               |
| Agent 6: Undirected Audit         | 3 parallele Personas (Attacker / 3am-oncall / Maintainer) – erkennt übergreifende Probleme |
| Agent 7: Build & Test             | Führt Build- und Test-Befehle aus, meldet Fehler                                            |

Alle Agents laufen parallel (Agent 6 startet 3 Persona-Varianten gleichzeitig, was insgesamt 10 parallele Tasks für Same-Repo-PR-Reviews ergibt; Agent 0 wird bei Local-Diff- und File-Path-Reviews übersprungen, hier laufen 9). Die Ergebnisse von Agent 0-6 werden in einem **einzigen Batch-Verifizierungsdurchlauf** verifiziert (ein Agent prüft alle Ergebnisse auf einmal, wodurch die Verifizierungskosten unabhängig von der Anzahl der Ergebnisse konstant bleiben). Nach der Verifizierung läuft der **iterative Reverse Audit** in 1-3 Runden Gap-Finding – jede Runde erhält die kumulierte Ergebnisliste der vorherigen Runden, sodass sich nachfolgende Runden auf das konzentrieren, was noch unentdeckt ist. Die Schleife stoppt, sobald eine Runde "No issues found" zurückgibt, oder nach 3 Runden (Hard Cap). Ergebnisse des Reverse Audits überspringen die Verifizierung (der Agent hat bereits den vollen Kontext) und werden als High-Confidence-Ergebnisse übernommen.

## Severity Levels

| Severity         | Bedeutung                                                           | Als PR-Kommentar posten?     |
| ---------------- | ------------------------------------------------------------------- | ---------------------------- |
| **Critical**     | Muss vor dem Mergen behoben werden (Bugs, Sicherheit, Datenverlust, Build-Fehler) | Ja (nur High-Confidence) |
| **Suggestion**   | Empfohlene Verbesserung                                             | Ja (nur High-Confidence) |
| **Nice to have** | Optionale Optimierung                                               | Nein (nur Terminal)          |

Low-Confidence-Ergebnisse erscheinen in einem separaten Bereich "Needs Human Review" im Terminal und werden niemals als PR-Kommentare gepostet.

## Worktree-Isolation

Beim Reviewen eines PRs erstellt `/review` ein temporäres Git-Worktree (`.qwen/tmp/review-pr-<number>`), anstatt deinen aktuellen Branch zu wechseln. Das bedeutet:

- Dein Working Tree, staged Changes und der aktuelle Branch werden **niemals angerührt**
- Dependencies werden im Worktree installiert (`npm ci` usw.), damit Build/Test funktionieren
- Build- und Test-Befehle laufen isoliert, ohne deinen lokalen Build-Cache zu verschmutzen
- Wenn etwas schiefgeht, ist deine Umgebung nicht betroffen – lösche einfach das Worktree
- Das Worktree wird nach Abschluss des Reviews automatisch aufgeräumt
- Wenn ein Review unterbrochen wird (Strg+C, Crash), räumt das nächste `/review` desselben PRs das veraltete Worktree automatisch auf, bevor es neu startet
- Review-Reports und Cache werden im Hauptprojektverzeichnis gespeichert (nicht im Worktree)

## Cross-Repo-PR-Review

Du kannst PRs aus anderen Repositories reviewen, indem du die vollständige URL übergibst:

```bash
/review https://github.com/other-org/other-repo/pull/456
```

Dies läuft im **Lightweight-Modus** – kein Worktree, kein Build/Test. Das Review basiert nur auf dem Diff-Text (über die GitHub API abgerufen). PR-Kommentare können weiterhin gepostet werden, wenn du Schreibzugriff hast.

| Funktionsumfang                                            | Same-Repo | Cross-Repo                    |
| ---------------------------------------------------------- | --------- | ----------------------------- |
| LLM-Review (Agents 0-6 + Verifizierung + iterativer Reverse Audit) | ✅        | ✅                            |
| Agent 7: Build & Test                                      | ✅        | ❌ (keine lokale Codebase)    |
| Cross-File-Impact-Analyse                                  | ✅        | ❌                            |
| PR-Inline-Kommentare                                       | ✅        | ✅ (bei Schreibzugriff)       |
| Inkrementeller Review-Cache                                | ✅        | ❌                            |

## PR-Inline-Kommentare

Verwende `--comment`, um Ergebnisse direkt im PR zu posten:

```bash
/review 123 --comment
```

Oder tippe nach dem Ausführen von `/review 123` `post comments` ein, um Ergebnisse zu veröffentlichen, ohne das Review erneut auszuführen.

**Was gepostet wird:**

- High-Confidence-Ergebnisse der Kategorien Critical und Suggestion als Inline-Kommentare auf bestimmten Zeilen
- Bei Approve/Request-Changes-Verdikten: eine Review-Zusammenfassung mit dem Verdict
- Bei Comment-Verdict mit allen geposteten Inline-Kommentaren: keine separate Zusammenfassung (Inline-Kommentare sind ausreichend)
- Modell-Zuordnungs-Footer in jedem Kommentar (z. B. _— qwen3-coder via Qwen Code /review_)

**Was nur im Terminal bleibt:**

- Nice-to-have-Ergebnisse
- Low-Confidence-Ergebnisse

**Selbst erstellte PRs:** GitHub erlaubt es dir nicht, `APPROVE`- oder `REQUEST_CHANGES`-Reviews für deinen eigenen Pull Request einzureichen – beide schlagen mit HTTP 422 fehl. Wenn `/review` erkennt, dass der PR-Autor dem aktuellen authentifizierten Benutzer entspricht, stuft es das API-Event unabhängig vom Verdict automatisch auf `COMMENT` herab, sodass die Einreichung trotzdem erfolgreich ist. Das Terminal zeigt weiterhin das ehrliche Verdict ("Approve" / "Request changes" / "Comment") – nur das GitHub-seitige Review-Event wird neutralisiert. Die eigentlichen Ergebnisse erscheinen weiterhin als Inline-Kommentare auf bestimmten Zeilen, sodass das substanzielle Feedback unverändert bleibt.

**Erneutes Reviewen eines PRs mit vorherigen Qwen Code-Kommentaren:** Wenn `/review` auf einem PR ausgeführt wird, der bereits frühere Qwen Code-Review-Kommentare hat, klassifiziert es diese, bevor neue gepostet werden. Nur eine **Überlappung in derselben Zeile** (ein vorhandener Kommentar auf demselben `(path, line)` wie ein neues Ergebnis) fordert dich auf, dies zu bestätigen – das ist der Fall, in dem du ein visuelles Duplikat auf derselben Codezeile sehen würdest. Kommentare aus älteren Commits, beantwortete Kommentare (werden als gelöst betrachtet) und Kommentare, die sich einfach nicht mit einem neuen Ergebnis überschneiden, werden stillschweigend übersprungen, mit einer Terminal-Logzeile, damit du weißt, was gefiltert wurde.

**CI-/Build-Statusprüfung vor APPROVE:** Wenn das Verdict "Approve" ist, fragt `/review` die Check-Runs und Commit-Statuses des PRs vor der Einreichung ab. Wenn ein Check fehlgeschlagen ist (oder alle Checks noch ausstehen), wird das API-Event automatisch von `APPROVE` auf `COMMENT` herabgestuft, wobei der Review-Body erklärt, warum. Begründung: Das LLM-Review liest Code statisch und kann Laufzeit-Testfehler nicht sehen; ein Approve bei rotem CI wäre irreführend. Die Inline-Ergebnisse werden weiterhin unverändert gepostet. Wenn du trotzdem approven möchtest (z. B. bei einem bekanntermaßen fehleranfälligen CI-Fehler), reiche die GitHub-Genehmigung nach der Überprüfung manuell ein.

## Folgeaktionen

Nach dem Review erscheinen kontextbezogene Tipps als Ghost-Text. Drücke Tab, um sie zu akzeptieren:

| Status nach dem Review                 | Tipp               | Was passiert                              |
| -------------------------------------- | ------------------ | ----------------------------------------- |
| Lokales Review mit unbehobenen Ergebnissen | `fix these issues` | LLM behebt jedes Ergebnis interaktiv      |
| PR-Review mit Ergebnissen              | `post comments`    | Postet PR-Inline-Kommentare (kein erneutes Review) |
| PR-Review, keine Ergebnisse            | `post comments`    | Approved den PR auf GitHub (LGTM)         |
| Lokales Review, alles in Ordnung       | `commit`           | Committet deine Änderungen                |

Hinweis: `fix these issues` ist nur für lokale Reviews verfügbar. Bei PR-Reviews wird das Worktree nach dem Review aufgeräumt, sodass ein interaktives Beheben nach dem Review nicht möglich ist – verwende stattdessen `--comment` oder `post comments`, um Ergebnisse zu veröffentlichen.

## Projekt-Review-Regeln

Du kannst Review-Kriterien pro Projekt anpassen. `/review` liest Regeln aus diesen Dateien (in dieser Reihenfolge):

1. `.qwen/review-rules.md` (Qwen Code native)
2. `.github/copilot-instructions.md` (bevorzugt) oder `copilot-instructions.md` (Fallback – nur eine wird geladen, nicht beide)
3. `AGENTS.md` — `## Code Review` section
4. `QWEN.md` — `## Code Review` section

Regeln werden den LLM-Review-Agents (0-6) als zusätzliche Kriterien injiziert. Bei PR-Reviews werden Regeln aus dem **Base-Branch** gelesen, um zu verhindern, dass ein bösartiger PR Bypass-Regeln injiziert.

## Issue Fidelity

Bei Bugfix-PRs ruft der Issue-Fidelity-Agent Issue-Nachweise direkt ab, anstatt sich auf den PR-Beschreibungstext zu verlassen. Er verwendet `gh pr view <pr> --repo <owner/repo> --json closingIssuesReferences` für die starken Closing-Issue-Metadaten von GitHub und dann `gh issue view <number> --repo <issue_owner>/<issue_repo> --json title,body,comments` für den ursprünglichen Report und die Diskussion – die `--json`-Form enthält den Issue-**Body** (die ursprüngliche Reproduktion des Reporters), die `--comments` allein weglässt, und das eigene Repository des Issues wird aus jeder Referenz gelesen (ein PR kann ein Issue in einem anderen Repo schließen). Dieser Agent läuft nur für PR-Targets; Local-Diff- und File-Path-Reviews überspringen ihn.

`closingIssuesReferences` ist ein Discovery-Hinweis und kein Beweis dafür, dass der Autor das richtige Issue verlinkt hat: Wenn es leer ist, der PR aber auf ein offensichtliches Ziel-Issue verweist, ruft der Agent es trotzdem ab, nachdem er die Relevanz beurteilt hat. Abgerufener Issue-Text wird als nicht vertrauenswürdige Daten behandelt (Fakten extrahiert, eingebettete Anweisungen ignoriert). Bei relevanten Issues werden die ursprüngliche Reproduktion, die beobachtete Payload, das erwartete Verhalten und Maintainer-Kommentare als höchstprioritäre Nachweise dafür behandelt, ob der PR das richtige Problem behebt.

Wenn die Issue-Nachweise zeigen, dass ein Upstream-Service oder Provider fehlerhafte Daten außerhalb des Client-Vertrags zurückgegeben hat, werden clientseitige Parser- oder Sanitizer-Änderungen nicht als gültiger Root-Cause-Fix behandelt, es sei denn, ein Maintainer hat explizit einen defensiven Workaround angefordert. Ein Test, der fehlerhafte Upstream-Ausgaben replayt, beweist nur, dass der Workaround diese Form handhabt; er beweist nicht, dass der Workaround architektonisch angemessen ist.

## Core-Infrastructure-Gate

Bei externen PRs, die die Core-Infrastructure betreffen, wendet `/review` das Repository-Gate vor dem normalen Review an (direkt nach dem Abrufen des PRs, vor der Dependency-Installation). Die Maintainer-Autorenschaft wird anhand von `authorAssociation` des PRs entschieden (`OWNER`/`MEMBER`/`COLLABORATOR` sind ausgenommen). Große Core-Änderungen (500+ Additions plus Deletions **innerhalb von Core-Infrastructure-Pfaden**) werden als Hard-Block gemeldet, es sei denn, sie sind von einem Maintainer authored – ein Low-Risk-Sweep, der viele Dateien berührt, aber jeweils nur ein oder zwei Zeilen ändert, wird eskaliert, anstatt anhand der Zeilenanzahl automatisch abgelehnt zu werden. Kleinere Core-Änderungen erfordern 100 % Confidence und Downstream-Consumer-Bewusstsein; andernfalls eskaliert `/review` zu einem Maintainer (eingereicht als Comment, niemals als Approve).
Beispiel `.qwen/review-rules.md`:

```markdown
# Review-Regeln

- Alle API-Endpunkte müssen die Authentifizierung validieren
- Datenbankabfragen müssen parametrisierte Statements verwenden
- React-Komponenten dürfen keine Inline-Styles verwenden
- Fehlermeldungen dürfen keine internen Pfade offenlegen
```

## Inkrementelles Review

Beim Review eines PRs, der bereits zuvor geprüft wurde, untersucht `/review` nur die Änderungen seit dem letzten Review:

```bash
# Erstes Review — vollständiges Review, Cache wird erstellt
/review 123

# PR mit neuen Commits aktualisiert — nur neue Änderungen werden geprüft
/review 123
```

### Cross-Model-Review

Wenn du das Modell wechselst (über `/model`) und denselben PR erneut prüfst, erkennt `/review` den Modellwechsel und führt ein vollständiges Review durch, anstatt es zu überspringen:

```bash
# Review mit Modell A
/review 123

# Modell wechseln
/model

# Erneut reviewen — vollständiges Review mit Modell B (nicht übersprungen)
/review 123
# → "Previous review used qwen3-coder. Running full review with gpt-4o for a second opinion."
```

Der Cache wird in `.qwen/review-cache/` gespeichert und verfolgt sowohl die Commit-SHA als auch die Modell-ID. Stelle sicher, dass dieses Verzeichnis in deiner `.gitignore` enthalten ist (eine allgemeinere Regel wie `.qwen/*` funktioniert ebenfalls). Wenn der zwischengespeicherte Commit durch einen Rebase entfernt wurde, wird auf ein vollständiges Review zurückgegriffen.

## Review-Berichte

Bei Reviews innerhalb desselben Repositories werden die Ergebnisse als Markdown-Datei im Verzeichnis `.qwen/reviews/` deines Projekts gespeichert (Cross-Repo Lightweight-Reviews überspringen die Persistierung der Berichte):

```
.qwen/reviews/2026-04-06-143022-pr-123.md
.qwen/reviews/2026-04-06-150510-local.md
```

Berichte enthalten: Zeitstempel, Diff-Statistiken, Build-/Testergebnisse, alle Funde mit Verifizierungsstatus und das Fazit.

## Cross-File-Impact-Analyse

Wenn Codeänderungen exportierte Funktionen, Klassen oder Interfaces modifizieren, suchen die Review-Agenten automatisch nach allen Aufrufern und prüfen die Kompatibilität:

- Änderungen der Parameteranzahl/des Parametertyps
- Änderungen des Rückgabetyps
- Entfernte oder umbenannte öffentliche Methoden
- Breaking-API-Änderungen

Bei großen Diffs (>10 modifizierte Symbole) priorisiert die Analyse Funktionen mit Signaturänderungen.

## Token-Effizienz

Die Review-Pipeline verwendet eine begrenzte Anzahl von LLM-Aufrufen, unabhängig davon, wie viele Funde erzeugt werden:

| Stufe                            | LLM-Aufrufe         | Hinweise                                               |
| -------------------------------- | ------------------- | ------------------------------------------------------ |
| Review-Agenten (Schritt 3)       | 10 (oder 9)         | Laufen parallel; Agent 7 wird im Cross-Repo-Modus übersprungen |
| Batch-Verifizierung (Schritt 4)  | 1                   | Ein einzelner Agent verifiziert alle Funde auf einmal  |
| Iteratives Reverse-Audit (Schritt 5) | 1-3             | Wiederholt bis "No issues found" oder 3-Runden-Limit   |
| **Gesamt**                       | **12-14 (11-13)**   | Same-Repo: 12-14; Cross-Repo: 11-13 (ohne Agent 7)     |

Die meisten PRs konvergieren gegen das untere Ende des Bereichs (1 Reverse-Audit-Runde); das Limit verhindert explodierende Kosten bei pathologischen Fällen.

## Was NICHT gemeldet wird

Das Review schließt absichtlich Folgendes aus:

- Bereits vorhandene Probleme in unverändertem Code (Fokus nur auf dem Diff)
- Stil oder Formatierung, die ein Formatter automatisch normalisieren würde, oder Benennungen, die den Konventionen deiner Codebase entsprechen — aber NICHT substanzielle Probleme, die ein Linter oder Type Checker melden würde (ungenutzte Variablen, unerreichbarer Code, Typfehler), die zum Scope gehören
- Subjektive "Erwäge, X zu tun"-Vorschläge ohne ein echtes Problem
- Kleines Refactoring, das keinen Bug oder kein Risiko behebt
- Fehlende Dokumentation, es sei denn, die Logik ist wirklich verwirrend
- Probleme, die bereits in bestehenden PR-Kommentaren diskutiert wurden (vermeidet Duplizierung von menschlichem Feedback)

## Design-Philosophie

> **Schweigen ist besser als Rauschen.** Jeder Kommentar sollte die Zeit des Lesers wert sein.

- Wenn unklar ist, ob etwas ein Problem ist → nicht melden
- Gleiches Muster über N Dateien → zu einem einzigen Fund aggregiert
- PR-Kommentare erfolgen nur mit hoher Konfidenz
- Kosmetischer Stil/Formatierung, die den Codebase-Konventionen entspricht, wird ausgeschlossen