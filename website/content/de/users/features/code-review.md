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

Wenn es keine uncommitted Änderungen gibt, benachrichtigt dich `/review` darüber und stoppt – es werden keine Agents gestartet.

## Funktionsweise

Der `/review`-Befehl führt eine mehrstufige Pipeline aus:

```
Schritt 1:  Umfang bestimmen (lokaler Diff / PR-Worktree / Datei)
Schritt 2:  Projekt-Review-Regeln laden
Schritt 3:  10 parallele Review-Agents                         [10 LLM-Aufrufe]
           |-- Agent 0: Issue Fidelity & Root-Cause Ownership
           |-- Agent 1: Correctness
           |-- Agent 2: Security
           |-- Agent 3: Code Quality
           |-- Agent 4: Performance & Efficiency
           |-- Agent 5: Test Coverage
           |-- Agent 6: Undirected Audit (3 Personas: 6a/6b/6c)
           '-- Agent 7: Build & Test (führt Shell-Befehle aus)
Schritt 4:  Deduplizierung --> Batch-Verifizierung --> Aggregation [1 LLM-Aufruf]
Schritt 5:  Iterativer Reverse-Audit (1-3 Runden, Lückenfindung)   [1-3 LLM-Aufrufe]
Schritt 6:  Ergebnisse präsentieren + Fazit
Schritt 7:  PR-Review einreichen (Inline-Kommentare, falls angefordert)
Schritt 8:  Report speichern + inkrementeller Cache
Schritt 9:  Aufräumen (Worktree + temporäre Dateien entfernen)
```

### Review-Agents

| Agent                             | Fokus                                                                                       |
| --------------------------------- | ------------------------------------------------------------------------------------------- |
| Agent 0: Issue Fidelity           | Nachweise für verknüpfte Issues, Root-Cause-Verantwortung und ob der PR das gemeldete Problem löst |
| Agent 1: Correctness              | Logikfehler, Edge Cases, Null-Handling, Race Conditions, Type Safety                        |
| Agent 2: Security                 | Injection, XSS, SSRF, Auth-Bypass, Offenlegung sensibler Daten                              |
| Agent 3: Code Quality             | Stilkonsistenz, Benennung, Duplikate, toter Code                                            |
| Agent 4: Performance & Efficiency | N+1-Queries, Memory Leaks, unnötige Re-Renders, Bundle-Größe                                |
| Agent 5: Test Coverage            | Ungetestete Codepfade im Diff, fehlende Branch-Coverage, schwache Assertions                |
| Agent 6: Undirected Audit         | 3 parallele Personas (Angreifer / 3am-oncall / Maintainer) – erkennt übergreifende Probleme |
| Agent 7: Build & Test             | Führt Build- und Testbefehle aus, meldet Fehler                                             |

Alle Agents laufen parallel (Agent 6 startet 3 Persona-Varianten gleichzeitig, was insgesamt 10 parallele Tasks für Same-Repo-PR-Reviews ergibt; Agent 0 wird bei Local-Diff- und File-Path-Reviews übersprungen, hier laufen 9). Die Ergebnisse der Agents 0-6 werden in einem **einzigen Batch-Verifizierungsdurchlauf** überprüft (ein Agent prüft alle Ergebnisse auf einmal, wodurch die Verifizierungskosten unabhängig von der Anzahl der Ergebnisse konstant bleiben). Nach der Verifizierung läuft ein **iterativer Reverse-Audit** in 1-3 Runden zur Lückenfindung – jede Runde erhält die kumulierte Ergebnisliste der vorherigen Runden, sodass sich spätere Runden auf das konzentrieren, was noch unentdeckt ist. Die Schleife stoppt, sobald eine Runde "No issues found" zurückgibt, oder nach 3 Runden (Hard Cap). Reverse-Audit-Ergebnisse überspringen die Verifizierung (der Agent hat bereits den vollen Kontext) und werden als High-Confidence-Ergebnisse übernommen.

## Schweregrade

| Schweregrad      | Bedeutung                                                             | Als PR-Kommentar gepostet? |
| ---------------- | ------------------------------------------------------------------- | -------------------------- |
| **Critical**     | Muss vor dem Mergen behoben werden (Bugs, Sicherheit, Datenverlust, Build-Fehler) | Ja (nur High-Confidence) |
| **Suggestion**   | Empfohlene Verbesserung                                             | Ja (nur High-Confidence) |
| **Nice to have** | Optionale Optimierung                                               | Nein (nur Terminal)        |

Low-Confidence-Ergebnisse erscheinen in einem separaten Bereich "Needs Human Review" im Terminal und werden niemals als PR-Kommentare gepostet.

## Worktree-Isolation

Beim Reviewen eines PRs erstellt `/review` einen temporären Git-Worktree (`.qwen/tmp/review-pr-<number>`), anstatt deinen aktuellen Branch zu wechseln. Das bedeutet:

- Dein Working Tree, gestagete Änderungen und der aktuelle Branch werden **niemals angetastet**
- Dependencies werden im Worktree installiert (`npm ci` usw.), damit Build/Test funktionieren
- Build- und Testbefehle laufen isoliert, ohne deinen lokalen Build-Cache zu verunreinigen
- Wenn etwas schiefgeht, ist deine Umgebung nicht betroffen – lösche einfach den Worktree
- Der Worktree wird nach Abschluss des Reviews automatisch aufgeräumt
- Wenn ein Review unterbrochen wird (Strg+C, Crash), räumt das nächste `/review` für denselben PR den veralteten Worktree automatisch auf, bevor es frisch startet
- Review-Reports und Cache werden im Hauptprojektverzeichnis gespeichert (nicht im Worktree)

## Cross-Repo-PR-Review

Du kannst PRs aus anderen Repositories reviewen, indem du die vollständige URL übergibst:

```bash
/review https://github.com/other-org/other-repo/pull/456
```

Dies läuft im **Lightweight-Modus** – kein Worktree, kein Build/Test. Das Review basiert nur auf dem Diff-Text (über die GitHub API abgerufen). PR-Kommentare können weiterhin gepostet werden, wenn du Schreibzugriff hast.

| Funktion                                                 | Same-Repo | Cross-Repo                    |
| ---------------------------------------------------------- | --------- | ----------------------------- |
| LLM-Review (Agents 0-6 + Verifizierung + iterativer Reverse-Audit) | ✅        | ✅                            |
| Agent 7: Build & Test                                      | ✅        | ❌ (keine lokale Codebase)        |
| Cross-File-Impact-Analyse                                 | ✅        | ❌                            |
| PR-Inline-Kommentare                                         | ✅        | ✅ (bei Schreibzugriff) |
| Inkrementeller Review-Cache                                   | ✅        | ❌                            |

## PR-Inline-Kommentare

Verwende `--comment`, um Ergebnisse direkt im PR zu posten:

```bash
/review 123 --comment
```

Oder gib nach dem Ausführen von `/review 123` den Befehl `post comments` ein, um die Ergebnisse zu veröffentlichen, ohne das Review erneut auszuführen.

**Was gepostet wird:**

- High-Confidence-Ergebnisse der Schweregrade Critical und Suggestion als Inline-Kommentare in bestimmten Zeilen
- Bei Approve/Request-Changes-Fazit: eine Review-Zusammenfassung mit dem Fazit
- Bei Comment-Fazit, wenn alle Inline-Kommentare gepostet wurden: keine separate Zusammenfassung (Inline-Kommentare sind ausreichend)
- Modell-Zuordnungs-Footer in jedem Kommentar (z. B. _— qwen3-coder via Qwen Code /review_)

**Was nur im Terminal bleibt:**

- Nice-to-have-Ergebnisse
- Low-Confidence-Ergebnisse

**Selbst erstellte PRs:** GitHub erlaubt es nicht, `APPROVE`- oder `REQUEST_CHANGES`-Reviews für deine eigenen Pull Requests einzureichen – beide schlagen mit HTTP 422 fehl. Wenn `/review` erkennt, dass der PR-Autor mit dem aktuell authentifizierten Benutzer übereinstimmt, stuft es das API-Event unabhängig vom Fazit automatisch auf `COMMENT` herab, sodass die Einreichung trotzdem erfolgreich ist. Das Terminal zeigt weiterhin das ehrliche Fazit ("Approve" / "Request changes" / "Comment") – nur das GitHub-seitige Review-Event wird neutralisiert. Die eigentlichen Ergebnisse erscheinen weiterhin als Inline-Kommentare in bestimmten Zeilen, sodass das substanzielle Feedback unverändert bleibt.

**Erneutes Reviewen eines PRs mit vorherigen Qwen Code-Kommentaren:** Wenn `/review` für einen PR ausgeführt wird, der bereits frühere Qwen Code-Review-Kommentare enthält, klassifiziert es diese, bevor neue gepostet werden. Nur **Überlappungen in derselben Zeile** (ein vorhandener Kommentar in derselben `(path, line)` wie ein neues Ergebnis) fordern dich zur Bestätigung auf – das ist der Fall, in dem du ein visuelles Duplikat in derselben Codezeile sehen würdest. Kommentare aus älteren Commits, beantwortete Kommentare (werden als gelöst betrachtet) und Kommentare, die sich einfach nicht mit einem neuen Ergebnis überschneiden, werden stillschweigend übersprungen, mit einer Terminal-Logzeile, damit du weißt, was gefiltert wurde.

**CI-/Build-Statusprüfung vor APPROVE:** Wenn das Fazit "Approve" ist, fragt `/review` die Check-Runs und Commit-Statuses des PRs vor der Einreichung ab. Wenn ein Check fehlgeschlagen ist (oder alle Checks noch ausstehen), wird das API-Event automatisch von `APPROVE` auf `COMMENT` herabgestuft, wobei der Review-Body erklärt, warum. Begründung: Das LLM-Review liest Code statisch und kann Laufzeit-Testfehler nicht sehen; ein Approve bei rotem CI wäre irreführend. Die Inline-Ergebnisse werden weiterhin unverändert gepostet. Wenn du trotzdem approven möchtest (z. B. bei einem bekannten flaky CI-Fehler), reiche die GitHub-Genehmigung nach der Überprüfung manuell ein.

## Folgeaktionen

Nach dem Review erscheinen kontextbezogene Tipps als Ghost-Text. Drücke Tab, um sie zu akzeptieren:

| Status nach dem Review                 | Tipp                | Was passiert                            |
| ---------------------------------- | ------------------ | --------------------------------------- |
| Lokales Review mit unbehebten Ergebnissen | `fix these issues` | LLM behebt jedes Ergebnis interaktiv    |
| PR-Review mit Ergebnissen            | `post comments`    | Postet PR-Inline-Kommentare (kein erneutes Review) |
| PR-Review, keine Ergebnisse           | `post comments`    | Approved den PR auf GitHub (LGTM)        |
| Lokales Review, alles sauber            | `commit`           | Committet deine Änderungen                    |

Hinweis: `fix these issues` ist nur für lokale Reviews verfügbar. Bei PR-Reviews wird der Worktree nach dem Review aufgeräumt, daher ist ein interaktives Beheben nach dem Review nicht möglich – verwende stattdessen `--comment` oder `post comments`, um die Ergebnisse zu veröffentlichen.

## Projekt-Review-Regeln

Du kannst die Review-Kriterien pro Projekt anpassen. `/review` liest Regeln aus diesen Dateien (in dieser Reihenfolge):

1. `.qwen/review-rules.md` (Qwen Code native)
2. `.github/copilot-instructions.md` (bevorzugt) oder `copilot-instructions.md` (Fallback – nur eine wird geladen, nicht beide)
3. `AGENTS.md` — Abschnitt `## Code Review`
4. `QWEN.md` — Abschnitt `## Code Review`

Regeln werden den LLM-Review-Agents (0-6) als zusätzliche Kriterien injiziert. Bei PR-Reviews werden die Regeln aus dem **Base-Branch** gelesen, um zu verhindern, dass ein bösartiger PR Bypass-Regeln injiziert.

## Issue Fidelity

Für Bugfix-PRs ruft der Issue-Fidelity-Agent Issue-Nachweise direkt ab, anstatt sich auf den PR-Beschreibungstext zu verlassen. Er verwendet `gh pr view <pr> --repo <owner/repo> --json closingIssuesReferences` für GitHubs starke Metadaten zu schließenden Issues, dann `gh issue view <number> --repo <issue_owner>/<issue_repo> --json title,body,comments` für den ursprünglichen Report und die Diskussion – die `--json`-Form enthält den Issue-**Body** (das ursprüngliche Repro des Reporters), den `--comments` allein weglässt, und das eigene Repository des Issues wird aus jeder Referenz gelesen (ein PR kann ein Issue in einem anderen Repo schließen). Dieser Agent läuft nur für PR-Targets; Local-Diff- und File-Path-Reviews überspringen ihn.

`closingIssuesReferences` ist ein Hinweis zur Entdeckung und kein Beweis dafür, dass der Autor das richtige Issue verlinkt hat: Wenn es leer ist, der PR aber ein offensichtliches Ziel-Issue referenziert, ruft der Agent es trotzdem ab, nachdem er die Relevanz beurteilt hat. Abgerufener Issue-Text wird als nicht vertrauenswürdige Daten behandelt (Fakten extrahiert, eingebettete Anweisungen ignoriert). Für relevante Issues werden das ursprüngliche Repro, die beobachtete Payload, das erwartete Verhalten und Maintainer-Kommentare als höchstprioritäre Nachweise dafür behandelt, ob der PR das richtige Problem behebt.

Wenn die Issue-Nachweise zeigen, dass ein Upstream-Service oder Provider fehlerhafte Daten außerhalb des Client-Vertrags zurückgegeben hat, werden clientseitige Parser- oder Sanitizer-Änderungen nicht als gültiger Root-Cause-Fix behandelt, es sei denn, ein Maintainer hat explizit einen defensiven Workaround angefordert. Ein Test, der fehlerhafte Upstream-Ausgaben replayt, beweist nur, dass der Workaround diese Form handhabt; er beweist nicht, dass der Workaround architektonisch angemessen ist.

Beispiel für `.qwen/review-rules.md`:

```markdown
# Review-Regeln

- Alle API-Endpunkte müssen die Authentifizierung validieren
- Datenbankabfragen müssen parametrisierte Statements verwenden
- React-Komponenten dürfen keine Inline-Styles verwenden
- Fehlermeldungen dürfen keine internen Pfade offenlegen
```
## Inkrementelles Review

Wenn ein PR überprüft wird, der bereits zuvor ein Review durchlaufen hat, untersucht `/review` nur die Änderungen seit dem letzten Review:

```bash
# Erstes Review — vollständiges Review, Cache wird erstellt
/review 123

# PR mit neuen Commits aktualisiert — nur neue Änderungen werden überprüft
/review 123
```

### Cross-Model-Review

Wenn du das Modell wechselst (über `/model`) und denselben PR erneut überprüfst, erkennt `/review` den Modellwechsel und führt ein vollständiges Review durch, anstatt es zu überspringen:

```bash
# Review mit Modell A
/review 123

# Modell wechseln
/model

# Erneut reviewen — vollständiges Review mit Modell B (nicht übersprungen)
/review 123
# → "Das vorherige Review hat qwen3-coder verwendet. Vollständiges Review mit gpt-4o für eine zweite Meinung wird ausgeführt."
```

Der Cache wird in `.qwen/review-cache/` gespeichert und verfolgt sowohl die Commit-SHA als auch die Modell-ID. Stelle sicher, dass dieses Verzeichnis in deiner `.gitignore` enthalten ist (eine allgemeinere Regel wie `.qwen/*` funktioniert ebenfalls). Wenn der zwischengespeicherte Commit durch ein Rebase entfernt wurde, wird auf ein vollständiges Review zurückgegriffen.

## Review-Berichte

Bei Same-Repo-Reviews werden die Ergebnisse als Markdown-Datei im `.qwen/reviews/`-Verzeichnis deines Projekts gespeichert (bei Cross-Repo Lightweight-Reviews wird auf die Persistierung der Berichte verzichtet):

```
.qwen/reviews/2026-04-06-143022-pr-123.md
.qwen/reviews/2026-04-06-150510-local.md
```

Berichte enthalten: Zeitstempel, Diff-Statistiken, Build-/Testergebnisse, alle Befunde mit Verifizierungsstatus und das Fazit.

## Dateiübergreifende Auswirkungsanalyse

Wenn Codeänderungen exportierte Funktionen, Klassen oder Interfaces modifizieren, suchen die Review-Agenten automatisch nach allen Aufrufern und überprüfen die Kompatibilität:

- Änderungen der Parameteranzahl/des Parametertyps
- Änderungen des Rückgabetyps
- Entfernte oder umbenannte öffentliche Methoden
- Breaking API-Änderungen

Bei großen Diffs (>10 modifizierte Symbole) priorisiert die Analyse Funktionen mit Signaturänderungen.

## Token-Effizienz

Die Review-Pipeline verwendet eine begrenzte Anzahl von LLM-Calls, unabhängig davon, wie viele Befunde erzeugt werden:

| Phase | LLM-Calls | Hinweise |
| --------------------------------- | ----------------- | --------------------------------------------------- |
| Review-Agenten (Schritt 3) | 10 (oder 9) | Werden parallel ausgeführt; Agent 7 wird im Cross-Repo-Modus übersprungen |
| Batch-Verifizierung (Schritt 4) | 1 | Ein einzelner Agent verifiziert alle Befunde auf einmal |
| Iteratives Reverse-Audit (Schritt 5) | 1-3 | Wiederholt sich bis "Keine Probleme gefunden" oder das Limit von 3 Runden erreicht ist |
| **Gesamt** | **12-14 (11-13)** | Same-Repo: 12-14; Cross-Repo: 11-13 (kein Agent 7) |

Die meisten PRs konvergieren gegen das untere Ende des Bereichs (1 Reverse-Audit-Runde); das Limit verhindert explodierende Kosten bei extremen Ausnahmefällen.

## Was NICHT gemeldet wird

Das Review schließt absichtlich Folgendes aus:

- Bereits vorhandene Probleme in unverändertem Code (Fokus nur auf dem Diff)
- Stil oder Formatierung, die ein Formatter automatisch normalisieren würde, oder Benennungen, die deinen Codebase-Konventionen entsprechen — aber KEINE substanziellen Probleme, die ein Linter oder Type Checker melden würde (unbenutzte Variablen, unerreichbarer Code, Typfehler), die im Scope sind
- Subjektive "Erwäge, X zu tun"-Vorschläge ohne ein tatsächliches Problem
- Kleinere Refactorings, die keinen Bug oder kein Risiko beheben
- Fehlende Dokumentation, es sei denn, die Logik ist wirklich verwirrend
- Bereits in bestehenden PR-Kommentaren diskutierte Probleme (vermeidet die Duplizierung von menschlichem Feedback)

## Design-Philosophie

> **Schweigen ist besser als Lärm.** Jeder Kommentar sollte die Zeit des Lesers wert sein.

- Wenn unklar ist, ob etwas ein Problem ist → nicht melden
- Gleiches Muster über N Dateien → zu einem einzigen Befund aggregiert
- PR-Kommentare werden nur bei hoher Konfidenz abgegeben
- Kosmetische Stil- oder Formatierungsanpassungen, die den Codebase-Konventionen entsprechen, werden ausgeschlossen