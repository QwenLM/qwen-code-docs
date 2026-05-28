---
description: "Nutzen Sie Qwen Code für AI Code Review, um Bugs, Stilprobleme und Sicherheitsrisiken vor dem Commit schneller zu finden und PR-Qualität zu erhöhen."
---

# Code Review

> Überprüfe Code-Änderungen auf Korrektheit, Sicherheit, Performance und Code-Qualität mit `/review`.

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

Wenn es keine uncommitted Änderungen gibt, informiert dich `/review` und stoppt – es werden keine Agents gestartet.

## How It Works

Der `/review`-Befehl führt eine mehrstufige Pipeline aus:

```
Step 1:  Determine scope (local diff / PR worktree / file)
Step 2:  Load project review rules
Step 3:  Run deterministic analysis (linter, typecheck)    [zero LLM cost]
Step 4:  9 parallel review agents                          [9 LLM calls]
           |-- Agent 1: Correctness
           |-- Agent 2: Security
           |-- Agent 3: Code Quality
           |-- Agent 4: Performance & Efficiency
           |-- Agent 5: Test Coverage
           |-- Agent 6: Undirected Audit (3 personas: 6a/6b/6c)
           '-- Agent 7: Build & Test (runs shell commands)
Step 5:  Deduplicate --> Batch verify --> Aggregate         [1 LLM call]
Step 6:  Iterative reverse audit (1-3 rounds, gap finding) [1-3 LLM calls]
Step 7:  Present findings + verdict
Step 8:  Autofix (user-confirmed, optional)
Step 9:  Post PR inline comments (if requested)
Step 10: Save report + incremental cache
Step 11: Clean up (remove worktree + temp files)
```

### Review Agents

| Agent                             | Focus                                                                                       |
| --------------------------------- | ------------------------------------------------------------------------------------------- |
| Agent 1: Correctness              | Logikfehler, Edge Cases, Null-Handling, Race Conditions, Type Safety                        |
| Agent 2: Security                 | Injection, XSS, SSRF, Auth-Bypass, Exposition sensibler Daten                               |
| Agent 3: Code Quality             | Style-Konsistenz, Naming, Duplikate, Dead Code                                              |
| Agent 4: Performance & Efficiency | N+1 Queries, Memory Leaks, unnötige Re-Renders, Bundle-Größe                                |
| Agent 5: Test Coverage            | Ungetestete Code-Pfade im Diff, fehlende Branch Coverage, schwache Assertions               |
| Agent 6: Undirected Audit         | 3 parallele Personas (Angreifer / 3am-oncall / Maintainer) – erkennt übergreifende Probleme |
| Agent 7: Build & Test             | Führt Build- und Test-Befehle aus, meldet Fehler                                            |

Alle Agents laufen parallel (Agent 6 startet 3 Persona-Varianten gleichzeitig, was bei Reviews im selben Repository insgesamt 9 parallele Tasks ergibt). Die Ergebnisse der Agents 1–6 werden in einem **einzelnen Batch-Verifizierungsdurchlauf** geprüft (ein Agent prüft alle Ergebnisse auf einmal, wodurch die Verifizierungskosten unabhängig von der Anzahl der Funde konstant bleiben). Nach der Verifizierung läuft ein **iteratives Reverse-Audit** in 1–3 Runden zur Lückenfindung – jede Runde erhält die kumulative Fundliste der vorherigen Runden, sodass sich nachfolgende Runden auf das konzentrieren, was noch unentdeckt ist. Die Schleife stoppt, sobald eine Runde „No issues found“ zurückgibt, oder nach 3 Runden (hartes Limit). Ergebnisse aus dem Reverse-Audit umgehen die Verifizierung (der Agent hat bereits den vollen Kontext) und werden als hochvertrauenswürdige Ergebnisse aufgenommen.

## Deterministic Analysis

Bevor die LLM-Agents starten, führt `/review` automatisch die vorhandenen Linter und Type-Checker deines Projekts aus:

| Language              | Tools detected                                                   |
| --------------------- | ---------------------------------------------------------------- |
| TypeScript/JavaScript | `tsc --noEmit`, `npm run lint`, `eslint`                         |
| Python                | `ruff`, `mypy`, `flake8`                                         |
| Rust                  | `cargo clippy`                                                   |
| Go                    | `go vet`, `golangci-lint`                                        |
| Java                  | `mvn compile`, `checkstyle`, `spotbugs`, `pmd`                   |
| C/C++                 | `clang-tidy` (if `compile_commands.json` available)              |
| Other                 | Auto-discovered from CI config (`.github/workflows/*.yml`, etc.) |

Für Projekte, die nicht den Standardmustern entsprechen (z. B. OpenJDK), liest `/review` CI-Konfigurationsdateien, um die vom Projekt verwendeten Lint-/Check-Befehle zu ermitteln. Keine Benutzerkonfiguration erforderlich.

Deterministische Funde werden mit `[linter]` oder `[typecheck]` getaggt und umgehen die LLM-Verifizierung – sie gelten als gesicherte Fakten.

- **Errors** → Kritischer Schweregrad
- **Warnings** → Nice to have (nur im Terminal, nicht als PR-Kommentar gepostet)

Wenn ein Tool nicht installiert ist oder ein Timeout auftritt, wird es mit einem Hinweis übersprungen.

## Severity Levels

| Severity         | Bedeutung                                                             | Als PR-Kommentar gepostet?   |
| ---------------- | --------------------------------------------------------------------- | ---------------------------- |
| **Critical**     | Muss vor dem Merge behoben werden (Bugs, Sicherheit, Datenverlust, Build-Fehler) | Ja (nur hochvertrauenswürdige) |
| **Suggestion**   | Empfohlene Verbesserung                                               | Ja (nur hochvertrauenswürdige) |
| **Nice to have** | Optionale Optimierung                                                 | Nein (nur im Terminal)       |

Ergebnisse mit niedriger Vertrauenswürdigkeit erscheinen im Terminal in einem separaten Abschnitt „Needs Human Review“ und werden niemals als PR-Kommentare gepostet.

## Autofix

Nach der Präsentation der Funde bietet `/review` an, Fixes für Critical- und Suggestion-Ergebnisse mit klaren Lösungen automatisch anzuwenden:

```
Found 3 issues with auto-fixable suggestions. Apply auto-fixes? (y/n)
```

- Fixes werden mit dem `edit`-Tool angewendet (gezielte Ersetzungen, keine vollständigen Datei-Rewrites)
- Pro-Datei-Linter-Checks laufen nach den Fixes, um sicherzustellen, dass keine neuen Probleme eingeführt werden
- Bei PR-Reviews werden Fixes automatisch aus dem Worktree committet und gepusht – dein Working Tree bleibt sauber
- Nice-to-have- und Low-Confidence-Ergebnisse werden niemals automatisch gefixt
- Die PR-Review-Übermittlung verwendet immer das **Pre-Fix-Verdict** (z. B. „Request changes“), da der Remote-PR erst nach Abschluss des Autofix-Pushs aktualisiert wird

## Worktree Isolation

Beim Review eines PRs erstellt `/review` einen temporären Git-Worktree (`.qwen/tmp/review-pr-<number>`) anstatt deinen aktuellen Branch zu wechseln. Das bedeutet:

- Dein Working Tree, staged Changes und aktueller Branch werden **niemals angefasst**
- Dependencies werden im Worktree installiert (`npm ci` usw.), damit Linting und Build/Test funktionieren
- Build- und Test-Befehle laufen isoliert, ohne deinen lokalen Build-Cache zu verschmutzen
- Falls etwas schiefgeht, bleibt deine Umgebung unberührt – lösche einfach den Worktree
- Der Worktree wird nach Abschluss des Reviews automatisch bereinigt
- Wird ein Review unterbrochen (Strg+C, Crash), bereinigt der nächste `/review` desselben PRs automatisch den verwaisten Worktree, bevor er neu startet
- Review-Reports und Cache werden im Hauptprojektverzeichnis gespeichert (nicht im Worktree)

## Cross-repo PR Review

Du kannst PRs aus anderen Repositories überprüfen, indem du die vollständige URL angibst:

```bash
/review https://github.com/other-org/other-repo/pull/456
```

Dies läuft im **Lightweight-Modus** – kein Worktree, kein Linter, kein Build/Test, kein Autofix. Das Review basiert ausschließlich auf dem Diff-Text (abgerufen über die GitHub API). PR-Kommentare können weiterhin gepostet werden, wenn du Schreibzugriff hast.

| Funktion                                       | Selbes Repo | Cross-Repo                    |
| ------------------------------------------------ | --------- | ----------------------------- |
| LLM-Review (Agents 1–6 + Verifizierung + iteratives Reverse-Audit) | ✅        | ✅                            |
| Agent 7: Build & Test                                      | ✅        | ❌ (kein lokaler Codebase)        |
| Deterministische Analyse (Linter/Typecheck)        | ✅        | ❌                            |
| Cross-File-Impact-Analyse                       | ✅        | ❌                            |
| Autofix                                          | ✅        | ❌                            |
| PR-Inline-Kommentare                               | ✅        | ✅ (bei Schreibzugriff) |
| Inkrementeller Review-Cache                         | ✅        | ❌                            |

## PR Inline Comments

Verwende `--comment`, um Funde direkt im PR zu posten:

```bash
/review 123 --comment
```

Oder tippe nach dem Ausführen von `/review 123` `post comments` ein, um Funde zu veröffentlichen, ohne das Review erneut auszuführen.

**Was gepostet wird:**

- Hochvertrauenswürdige Critical- und Suggestion-Funde als Inline-Kommentare an bestimmten Zeilen
- Für Approve/Request-Changes-Verdicts: eine Review-Zusammenfassung mit dem Verdict
- Für Comment-Verdicts, bei denen alle Inline-Kommentare gepostet wurden: keine separate Zusammenfassung (Inline-Kommentare sind ausreichend)
- Modell-Attribution im Footer jedes Kommentars (z. B. _— qwen3-coder via Qwen Code /review_)

**Was nur im Terminal bleibt:**

- Nice-to-have-Funde (einschließlich Linter-Warnungen)
- Low-Confidence-Funde

**Eigene PRs:** GitHub erlaubt es nicht, `APPROVE`- oder `REQUEST_CHANGES`-Reviews für eigene Pull Requests einzureichen – beide scheitern mit HTTP 422. Wenn `/review` erkennt, dass der PR-Autor mit dem aktuell authentifizierten Benutzer übereinstimmt, stuft es das API-Event automatisch auf `COMMENT` herab, unabhängig vom Verdict, sodass die Einreichung trotzdem erfolgreich ist. Im Terminal wird weiterhin das ehrliche Verdict angezeigt („Approve“ / „Request changes“ / „Comment“) – nur das GitHub-seitige Review-Event wird neutralisiert. Die tatsächlichen Funde erscheinen weiterhin als Inline-Kommentare an bestimmten Zeilen, sodass das fachliche Feedback unverändert bleibt.

**Erneutes Review eines PRs mit früheren Qwen-Code-Kommentaren:** Wenn `/review` auf einem PR ausgeführt wird, der bereits frühere Qwen-Code-Review-Kommentare enthält, klassifiziert es diese vor dem Posten neuer Kommentare. Nur bei **Überschneidungen in derselben Zeile** (ein bestehender Kommentar auf derselben `(path, line)` wie ein neuer Fund) wirst du zur Bestätigung aufgefordert – das ist der Fall, bei dem du ein visuelles Duplikat in derselben Code-Zeile sehen würdest. Kommentare von älteren Commits, beantwortete Kommentare (als gelöst behandelt) und Kommentare, die sich einfach nicht mit einem neuen Fund überschneiden, werden stillschweigend übersprungen, mit einer Terminal-Log-Zeile, damit du weißt, was gefiltert wurde.

**CI-/Build-Status-Check vor APPROVE:** Wenn das Verdict „Approve“ lautet, fragt `/review` vor der Einreichung die Check-Runs und Commit-Status des PRs ab. Wenn ein Check fehlgeschlagen ist (oder alle Checks noch ausstehen), wird das API-Event automatisch von `APPROVE` auf `COMMENT` herabgestuft, wobei der Review-Body den Grund erklärt. Begründung: Das LLM-Review liest Code statisch und kann keine Runtime-Test-Fehler sehen; ein Approve bei roter CI wäre irreführend. Die Inline-Funde werden weiterhin unverändert gepostet. Wenn du trotzdem approven möchtest (z. B. bei einem bekannten flaky CI-Fehler), reiche die GitHub-Approval manuell nach der Überprüfung ein.

## Follow-up Actions

Nach dem Review erscheinen kontextbezogene Tipps als Ghost-Text. Drücke Tab, um sie zu akzeptieren:

| Status nach Review                 | Tipp                | Was passiert                            |
| ---------------------------------- | ------------------ | --------------------------------------- |
| Lokales Review mit unfixten Funden | `fix these issues` | LLM fixt jeden Fund interaktiv    |
| PR-Review mit Funden            | `post comments`    | Postet PR-Inline-Kommentare (kein erneutes Review) |
| PR-Review, null Funden           | `post comments`    | Approvet den PR auf GitHub (LGTM)        |
| Lokales Review, alles klar            | `commit`           | Committet deine Änderungen                    |

Hinweis: `fix these issues` ist nur für lokale Reviews verfügbar. Für PR-Reviews verwende Autofix (Schritt 8) – der Worktree wird nach dem Review bereinigt, sodass interaktives Fixen nach dem Review nicht möglich ist.

## Project Review Rules

Du kannst Review-Kriterien pro Projekt anpassen. `/review` liest Regeln aus diesen Dateien (in dieser Reihenfolge):

1. `.qwen/review-rules.md` (Qwen Code nativ)
2. `.github/copilot-instructions.md` (bevorzugt) oder `copilot-instructions.md` (Fallback – nur eine wird geladen, nicht beide)
3. `AGENTS.md` — `## Code Review`-Abschnitt
4. `QWEN.md` — `## Code Review`-Abschnitt

Regeln werden den LLM-Review-Agents (1–6) als zusätzliche Kriterien injiziert. Für PR-Reviews werden Regeln aus dem **Base Branch** gelesen, um zu verhindern, dass ein bösartiger PR Bypass-Regeln einschleust.

Beispiel `.qwen/review-rules.md`:

```markdown
# Review Rules

- All API endpoints must validate authentication
- Database queries must use parameterized statements
- React components must not use inline styles
- Error messages must not expose internal paths
```

## Incremental Review

Beim Review eines PRs, der bereits zuvor überprüft wurde, untersucht `/review` nur die Änderungen seit dem letzten Review:

```bash
# First review — full review, cache created
/review 123

# PR updated with new commits — only new changes reviewed
/review 123
```

### Cross-model review

Wenn du das Modell wechselst (via `/model`) und denselben PR erneut reviewst, erkennt `/review` die Modelländerung und führt ein vollständiges Review durch, anstatt es zu überspringen:

```bash
# Review with model A
/review 123

# Switch model
/model

# Review again — full review with model B (not skipped)
/review 123
# → "Previous review used qwen3-coder. Running full review with gpt-4o for a second opinion."
```

Der Cache wird in `.qwen/review-cache/` gespeichert und trackt sowohl den Commit-SHA als auch die Model-ID. Stelle sicher, dass dieses Verzeichnis in deiner `.gitignore` ist (eine breitere Regel wie `.qwen/*` funktioniert ebenfalls). Wenn der gecachte Commit weg-rebased wurde, fällt es auf ein vollständiges Review zurück.

## Review Reports

Für Reviews im selben Repo werden die Ergebnisse als Markdown-Datei im `.qwen/reviews/`-Verzeichnis deines Projekts gespeichert (Cross-Repo-Lightweight-Reviews überspringen die Report-Persistenz):

```
.qwen/reviews/2026-04-06-143022-pr-123.md
.qwen/reviews/2026-04-06-150510-local.md
```

Reports enthalten: Zeitstempel, Diff-Statistiken, Ergebnisse der deterministischen Analyse, alle Funde mit Verifizierungsstatus und das Verdict.

## Cross-file Impact Analysis

Wenn Code-Änderungen exportierte Funktionen, Klassen oder Interfaces modifizieren, suchen die Review-Agents automatisch nach allen Aufrufern und prüfen die Kompatibilität:

- Änderungen der Parameteranzahl/-typen
- Änderungen des Return-Typs
- Entfernte oder umbenannte Public Methods
- Breaking API Changes

Bei großen Diffs (>10 modifizierte Symbole) priorisiert die Analyse Funktionen mit Signatur-Änderungen.

## Token Efficiency

Die Review-Pipeline verwendet eine begrenzte Anzahl an LLM-Calls, unabhängig davon, wie viele Funde erzeugt werden:

| Phase                            | LLM-Calls         | Hinweise                                                |
| -------------------------------- | ----------------- | ---------------------------------------------------- |
| Deterministische Analyse (Schritt 3)  | 0                 | Nur Shell-Befehle                                  |
| Review-Agents (Schritt 4)           | 9 (oder 8)          | Laufen parallel; Agent 7 wird im Cross-Repo-Modus übersprungen  |
| Batch-Verifizierung (Schritt 5)      | 1                 | Ein einzelner Agent verifiziert alle Funde auf einmal           |
| Iteratives Reverse-Audit (Schritt 6) | 1–3               | Schleife bis „No issues found“ oder 3-Runden-Limit         |
| **Gesamt**                        | **11–13 (10–12)** | Selbes Repo: 11–13; Cross-Repo: 10–12 (kein Agent 7)     |

Die meisten PRs konvergieren zum unteren Ende des Bereichs (1 Reverse-Audit-Runde); das Limit verhindert explodierende Kosten bei pathologischen Fällen.

## What's NOT Flagged

Das Review schließt absichtlich aus:

- Vorhandene Probleme in unverändertem Code (Fokus nur auf dem Diff)
- Style/Formatting/Naming, das deinen Codebase-Konventionen entspricht
- Probleme, die ein Linter oder Type-Checker erkennen würde (wird durch deterministische Analyse abgedeckt)
- Subjektive „consider doing X“-Vorschläge ohne echtes Problem
- Minor Refactorings, die keinen Bug oder Risiko beheben
- Fehlende Dokumentation, es sei denn, die Logik ist wirklich verwirrend
- Probleme, die bereits in bestehenden PR-Kommentaren diskutiert wurden (vermeidet Duplizierung von menschlichem Feedback)

## Design Philosophy

> **Schweigen ist besser als Rauschen.** Jeder Kommentar sollte die Zeit des Lesers wert sein.

- Wenn du unsicher bist, ob etwas ein Problem ist → melde es nicht
- Linter/Typecheck-Probleme werden von Tools behandelt, nicht von LLM-Vermutungen
- Gleiches Muster über N Dateien → zu einem Fund aggregiert
- PR-Kommentare sind nur hochvertrauenswürdig
- Style/Formatting-Probleme, die Codebase-Konventionen entsprechen, werden ausgeschlossen