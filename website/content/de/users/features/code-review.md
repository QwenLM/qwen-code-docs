# Code Review

> Überprüfe Code-Änderungen auf Korrektheit, Sicherheit, Performance und Codequalität mit `/review`.

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

Der Befehl `/review` führt eine mehrstufige Pipeline aus:

```
Schritt 1:  Umfang bestimmen (lokaler Diff / PR-Worktree / Datei)
Schritt 2:  Projekt-Review-Regeln laden
Schritt 3:  9 parallele Review-Agents                          [9 LLM-Aufrufe]
           |-- Agent 1: Korrektheit
           |-- Agent 2: Sicherheit
           |-- Agent 3: Codequalität
           |-- Agent 4: Performance & Effizienz
           |-- Agent 5: Testabdeckung
           |-- Agent 6: Undirected Audit (3 Personas: 6a/6b/6c)
           '-- Agent 7: Build & Test (führt Shell-Befehle aus)
Schritt 4:  Deduplizieren --> Batch-Verifizierung --> Aggregieren [1 LLM-Aufruf]
Schritt 5:  Iterativer Reverse-Audit (1-3 Runden, Lückenfindung)  [1-3 LLM-Aufrufe]
Schritt 6:  Ergebnisse + Fazit präsentieren
Schritt 7:  PR-Review einreichen (Inline-Kommentare, falls angefordert)
Schritt 8:  Bericht + inkrementellen Cache speichern
Schritt 9:  Aufräumen (Worktree + temporäre Dateien entfernen)
```

### Review-Agents

| Agent                             | Fokus                                                                                       |
| --------------------------------- | ------------------------------------------------------------------------------------------- |
| Agent 1: Korrektheit              | Logikfehler, Edge Cases, Null-Handling, Race Conditions, Type Safety                        |
| Agent 2: Sicherheit               | Injection, XSS, SSRF, Auth-Bypass, Offenlegung sensibler Daten                            |
| Agent 3: Codequalität             | Stilkonsistenz, Naming, Duplikate, Dead Code                                                |
| Agent 4: Performance & Effizienz  | N+1-Queries, Memory Leaks, unnötige Re-Renders, Bundle-Größe                                |
| Agent 5: Testabdeckung            | Ungetestete Code-Pfade im Diff, fehlende Branch-Abdeckung, schwache Assertions              |
| Agent 6: Undirected Audit         | 3 parallele Personas (Attacker / 3am-oncall / Maintainer) – erkennt übergreifende Probleme  |
| Agent 7: Build & Test             | Führt Build- und Test-Befehle aus, meldet Fehler                                            |

Alle Agents laufen parallel (Agent 6 startet 3 Persona-Varianten gleichzeitig, was bei Reviews im selben Repository insgesamt 9 parallele Tasks ergibt). Die Ergebnisse der Agents 1-6 werden in einem **einzigen Batch-Verifizierungsdurchlauf** überprüft (ein Agent prüft alle Ergebnisse auf einmal, wodurch die Verifizierungskosten unabhängig von der Anzahl der Ergebnisse konstant bleiben). Nach der Verifizierung führt ein **iterativer Reverse-Audit** 1 bis 3 Runden zur Lückenfindung durch – jede Runde erhält die kumulierte Ergebnisliste der vorherigen Runden, sodass sich nachfolgende Runden auf das konzentrieren, was noch unentdeckt ist. Die Schleife stoppt, sobald eine Runde "No issues found" zurückgibt, oder nach 3 Runden (hartes Limit). Reverse-Audit-Ergebnisse überspringen die Verifizierung (der Agent hat bereits den vollen Kontext) und werden als High-Confidence-Ergebnisse einbezogen.

## Schweregrade

| Schweregrad      | Bedeutung                                                             | Als PR-Kommentar gepostet?     |
| ---------------- | ------------------------------------------------------------------- | -------------------------- |
| **Critical**     | Muss vor dem Mergen behoben werden (Bugs, Sicherheit, Datenverlust, Build-Fehler) | Ja (nur High-Confidence) |
| **Suggestion**   | Empfohlene Verbesserung                                             | Ja (nur High-Confidence) |
| **Nice to have** | Optionale Optimierung                                               | Nein (nur Terminal)         |

Low-Confidence-Ergebnisse erscheinen in einem separaten Bereich "Needs Human Review" im Terminal und werden niemals als PR-Kommentare gepostet.

## Worktree-Isolation

Beim Reviewen eines PRs erstellt `/review` einen temporären Git-Worktree (`.qwen/tmp/review-pr-<number>`), anstatt deinen aktuellen Branch zu wechseln. Das bedeutet:

- Dein Working Tree, staged Changes und der aktuelle Branch werden **niemals angetastet**
- Dependencies werden im Worktree installiert (`npm ci` usw.), damit Build/Test funktionieren
- Build- und Test-Befehle laufen isoliert, ohne deinen lokalen Build-Cache zu verunreinigen
- Wenn etwas schiefgeht, ist deine Umgebung nicht betroffen – lösche einfach den Worktree
- Der Worktree wird nach Abschluss des Reviews automatisch aufgeräumt
- Wenn ein Review unterbrochen wird (Strg+C, Crash), räumt das nächste `/review` desselben PRs den veralteten Worktree automatisch auf, bevor es neu startet
- Review-Berichte und Cache werden im Hauptprojektverzeichnis gespeichert (nicht im Worktree)

## Cross-Repo-PR-Review

Du kannst PRs aus anderen Repositories reviewen, indem du die vollständige URL übergibst:

```bash
/review https://github.com/other-org/other-repo/pull/456
```

Dies läuft im **Lightweight-Modus** – kein Worktree, kein Build/Test. Das Review basiert nur auf dem Diff-Text (über die GitHub API abgerufen). PR-Kommentare können weiterhin gepostet werden, wenn du Schreibzugriff hast.

| Funktionsumfang                                                 | Same-Repo | Cross-Repo                    |
| ---------------------------------------------------------- | --------- | ----------------------------- |
| LLM-Review (Agents 1-6 + Verifizierung + iterativer Reverse-Audit) | ✅        | ✅                            |
| Agent 7: Build & Test                                      | ✅        | ❌ (keine lokale Codebase)        |
| Cross-File-Impact-Analyse                                 | ✅        | ❌                            |
| PR-Inline-Kommentare                                         | ✅        | ✅ (bei Schreibzugriff) |
| Inkrementeller Review-Cache                                   | ✅        | ❌                            |

## PR-Inline-Kommentare

Verwende `--comment`, um Ergebnisse direkt im PR zu posten:

```bash
/review 123 --comment
```

Oder gib nach dem Ausführen von `/review 123` den Befehl `post comments` ein, um Ergebnisse zu veröffentlichen, ohne das Review erneut auszuführen.

**Was gepostet wird:**

- High-Confidence-Ergebnisse der Schweregrade Critical und Suggestion als Inline-Kommentare zu spezifischen Zeilen
- Bei Approve/Request-Changes-Verdikten: eine Review-Zusammenfassung mit dem Verdict
- Bei Comment-Verdikten, bei denen alle Inline-Kommentare gepostet wurden: keine separate Zusammenfassung (Inline-Kommentare sind ausreichend)
- Modell-Zuordnungs-Footer in jedem Kommentar (z. B. _— qwen3-coder via Qwen Code /review_)

**Was nur im Terminal bleibt:**

- Nice-to-have-Ergebnisse
- Low-Confidence-Ergebnisse

**Selbst erstellte PRs:** GitHub erlaubt es nicht, `APPROVE`- oder `REQUEST_CHANGES`-Reviews für deine eigenen Pull Requests einzureichen – beide schlagen mit HTTP 422 fehl. Wenn `/review` erkennt, dass der PR-Autor dem aktuellen authentifizierten Benutzer entspricht, stuft es das API-Event unabhängig vom Verdict automatisch auf `COMMENT` herab, sodass die Einreichung trotzdem erfolgreich ist. Das Terminal zeigt weiterhin das ehrliche Verdict ("Approve" / "Request changes" / "Comment") – nur das GitHub-seitige Review-Event wird neutralisiert. Die eigentlichen Ergebnisse erscheinen weiterhin als Inline-Kommentare in spezifischen Zeilen, das substantive Feedback bleibt also unverändert.

**Erneutes Reviewen eines PRs mit vorherigen Qwen Code-Kommentaren:** Wenn `/review` auf einem PR ausgeführt wird, der bereits frühere Qwen Code-Review-Kommentare enthält, klassifiziert es diese, bevor neue gepostet werden. Nur **Überlappungen in derselben Zeile** (ein vorhandener Kommentar in derselben `(path, line)` wie ein neues Ergebnis) fordern dich zur Bestätigung auf – das ist der Fall, in dem du ein visuelles Duplikat in derselben Codezeile sehen würdest. Kommentare aus älteren Commits, beantwortete Kommentare (werden als gelöst betrachtet) und Kommentare, die sich einfach nicht mit einem neuen Ergebnis überschneiden, werden stillschweigend übersprungen, mit einer Terminal-Logzeile, damit du weißt, was gefiltert wurde.

**CI-/Build-Statusprüfung vor APPROVE:** Wenn das Verdict "Approve" ist, fragt `/review` die Check-Runs und Commit-Statuses des PRs vor der Einreichung ab. Wenn ein Check fehlgeschlagen ist (oder alle Checks noch ausstehen), wird das API-Event automatisch von `APPROVE` auf `COMMENT` herabgestuft, wobei der Review-Body erklärt, warum. Begründung: Das LLM-Review liest Code statisch und kann Laufzeit-Testfehler nicht sehen; ein Approve bei rotem CI wäre irreführend. Die Inline-Ergebnisse werden weiterhin unverändert gepostet. Wenn du trotzdem approven möchtest (z. B. bei einem bekannten flaky CI-Fehler), reiche die GitHub-Genehmigung nach der Überprüfung manuell ein.

## Folgeaktionen

Nach dem Review erscheinen kontextbezogene Tipps als Ghost-Text. Drücke Tab, um sie zu akzeptieren:

| Status nach dem Review                 | Tipp                | Was passiert                            |
| ---------------------------------- | ------------------ | --------------------------------------- |
| Lokales Review mit unbehobenen Ergebnissen | `fix these issues` | LLM behebt jedes Ergebnis interaktiv    |
| PR-Review mit Ergebnissen            | `post comments`    | Postet PR-Inline-Kommentare (kein erneutes Review) |
| PR-Review, keine Ergebnisse           | `post comments`    | Approved den PR auf GitHub (LGTM)        |
| Lokales Review, alles in Ordnung            | `commit`           | Committet deine Änderungen                    |

Hinweis: `fix these issues` ist nur für lokale Reviews verfügbar. Bei PR-Reviews wird der Worktree nach dem Review aufgeräumt, daher ist ein interaktives Beheben nach dem Review nicht möglich – verwende stattdessen `--comment` oder `post comments`, um Ergebnisse zu veröffentlichen.

## Projekt-Review-Regeln

Du kannst Review-Kriterien pro Projekt anpassen. `/review` liest Regeln aus diesen Dateien (in dieser Reihenfolge):

1. `.qwen/review-rules.md` (Qwen Code nativ)
2. `.github/copilot-instructions.md` (bevorzugt) oder `copilot-instructions.md` (Fallback – es wird nur eine geladen, nicht beide)
3. `AGENTS.md` – Abschnitt `## Code Review`
4. `QWEN.md` – Abschnitt `## Code Review`

Regeln werden den LLM-Review-Agents (1-6) als zusätzliche Kriterien injiziert. Bei PR-Reviews werden Regeln aus dem **Base-Branch** gelesen, um zu verhindern, dass ein bösartiger PR Bypass-Regeln injiziert.

Beispiel für `.qwen/review-rules.md`:

```markdown
# Review-Regeln

- Alle API-Endpunkte müssen die Authentifizierung validieren
- Datenbankabfragen müssen parametrisierte Statements verwenden
- React-Komponenten dürfen keine Inline-Styles verwenden
- Fehlermeldungen dürfen keine internen Pfade offenlegen
```

## Inkrementelles Review

Beim Reviewen eines PRs, der bereits zuvor reviewed wurde, untersucht `/review` nur die Änderungen seit dem letzten Review:

```bash
# Erstes Review – vollständiges Review, Cache erstellt
/review 123

# PR mit neuen Commits aktualisiert – nur neue Änderungen werden reviewed
/review 123
```

### Cross-Model-Review

Wenn du das Modell wechselst (über `/model`) und denselben PR erneut reviewst, erkennt `/review` die Modelländerung und führt ein vollständiges Review durch, anstatt es zu überspringen:

```bash
# Review mit Modell A
/review 123

# Modell wechseln
/model

# Erneut reviewen – vollständiges Review mit Modell B (nicht übersprungen)
/review 123
# → "Das vorherige Review hat qwen3-coder verwendet. Vollständiges Review mit gpt-4o für eine zweite Meinung wird durchgeführt."
```

Der Cache wird in `.qwen/review-cache/` gespeichert und trackt sowohl die Commit-SHA als auch die Modell-ID. Stelle sicher, dass dieses Verzeichnis in deiner `.gitignore` ist (eine breitere Regel wie `.qwen/*` funktioniert ebenfalls). Wenn der gecachte Commit weggerebt wurde, fällt es auf ein vollständiges Review zurück.

## Review-Berichte

Bei Same-Repo-Reviews werden die Ergebnisse als Markdown-Datei im Verzeichnis `.qwen/reviews/` deines Projekts gespeichert (Cross-Repo-Lightweight-Reviews überspringen die Persistierung von Berichten):

```
.qwen/reviews/2026-04-06-143022-pr-123.md
.qwen/reviews/2026-04-06-150510-local.md
```

Berichte enthalten: Zeitstempel, Diff-Statistiken, Build-/Test-Ergebnisse, alle Ergebnisse mit Verifizierungsstatus und das Verdict.

## Cross-File-Impact-Analyse

Wenn Codeänderungen exportierte Funktionen, Klassen oder Interfaces modifizieren, suchen die Review-Agents automatisch nach allen Aufrufern und prüfen die Kompatibilität:

- Änderungen der Parameteranzahl/des Parametertyps
- Änderungen des Return-Types
- Entfernte oder umbenannte Public-Methods
- Breaking-API-Änderungen

Bei großen Diffs (>10 modifizierte Symbole) priorisiert die Analyse Funktionen mit Signaturänderungen.

## Token-Effizienz

Die Review-Pipeline verwendet eine begrenzte Anzahl von LLM-Aufrufen, unabhängig davon, wie viele Ergebnisse produziert werden:

| Stufe                            | LLM-Aufrufe         | Hinweise                                               |
| -------------------------------- | ----------------- | --------------------------------------------------- |
| Review-Agents (Schritt 3)           | 9 (oder 8)          | Laufen parallel; Agent 7 wird im Cross-Repo-Modus übersprungen |
| Batch-Verifizierung (Schritt 4)      | 1                 | Ein einzelner Agent verifiziert alle Ergebnisse auf einmal          |
| Iterativer Reverse-Audit (Schritt 5) | 1-3               | Schleife bis "No issues found" oder 3-Runden-Limit        |
| **Gesamt**                        | **11-13 (10-12)** | Same-Repo: 11-13; Cross-Repo: 10-12 (ohne Agent 7)    |

Die meisten PRs konvergieren zum unteren Ende des Bereichs (1 Reverse-Audit-Runde); das Limit verhindert explodierende Kosten bei pathologischen Fällen.

## Was NICHT gemeldet wird

Das Review schließt absichtlich Folgendes aus:

- Bereits vorhandene Probleme in unverändertem Code (Fokus nur auf dem Diff)
- Stil oder Formatierung, die ein Formatter automatisch normalisieren würde, oder Naming, das deinen Codebase-Konventionen entspricht – aber NICHT substantive Probleme, die ein Linter oder Type Checker melden würde (ungenutzte Variablen, unerreichbarer Code, Typfehler), die im Scope sind
- Subjektive "consider doing X"-Vorschläge ohne echtes Problem
- Kleine Refactorings, die keinen Bug oder kein Risiko beheben
- Fehlende Dokumentation, es sei denn, die Logik ist wirklich verwirrend
- Probleme, die bereits in vorhandenen PR-Kommentaren diskutiert wurden (vermeidet Duplizierung von menschlichem Feedback)

## Design-Philosophie

> **Stille ist besser als Rauschen.** Jeder Kommentar sollte die Zeit des Lesers wert sein.

- Wenn du unsicher bist, ob etwas ein Problem ist → nicht melden
- Gleiches Muster über N Dateien → zu einem Ergebnis aggregiert
- PR-Kommentare sind nur High-Confidence
- Kosmetischer Stil/Formatierung, der den Codebase-Konventionen entspricht, wird ausgeschlossen