# Code Review

> Prüfe Codeänderungen auf Korrektheit, Sicherheit, Performance und Codequalität mit `/review`.

## Quick Start

```bash
# Prüfe lokale, nicht committete Änderungen
/review

# Prüfe einen Pull Request (nach Nummer oder URL)
/review 123
/review https://github.com/org/repo/pull/123

# Prüfe und poste Inline-Kommentare im PR
/review 123 --comment

# Prüfe eine bestimmte Datei
/review src/utils/auth.ts
```

Falls es keine nicht committeten Änderungen gibt, teilt dir `/review` dies mit und bricht ab – es werden keine Agents gestartet.

## How It Works

Der Befehl `/review` führt eine mehrstufige Pipeline aus:

```
Step 1:  Scope bestimmen (lokaler Diff / PR-Worktree / Datei)
Step 2:  Projekt-Review-Regeln laden
Step 3:  Deterministische Analyse ausführen (Linter, Typecheck)    [keine LLM-Kosten]
Step 4:  5 parallele Review-Agents                          [5 LLM-Aufrufe]
           |-- Agent 1: Korrektheit & Sicherheit
           |-- Agent 2: Codequalität
           |-- Agent 3: Performance & Effizienz
           |-- Agent 4: Undirected Audit
           '-- Agent 5: Build & Test (führt Shell-Befehle aus)
Step 5:  Deduplizieren --> Batch-Verifizierung --> Aggregieren         [1 LLM-Aufruf]
Step 6:  Reverse Audit (Coverage-Lücken finden)                 [1 LLM-Aufruf]
Step 7:  Ergebnisse + Urteil präsentieren
Step 8:  Autofix (vom Benutzer bestätigt, optional)
Step 9:  PR-Inline-Kommentare posten (falls angefordert)
Step 10: Report + inkrementellen Cache speichern
Step 11: Aufräumen (Worktree + temporäre Dateien entfernen)
```

### Review Agents

| Agent                             | Fokus                                                              |
| --------------------------------- | ------------------------------------------------------------------ |
| Agent 1: Korrektheit & Sicherheit   | Logikfehler, Null-Handling, Race Conditions, Injection, XSS, SSRF |
| Agent 2: Codequalität             | Style-Konsistenz, Naming, Duplikate, Dead Code                  |
| Agent 3: Performance & Effizienz | N+1-Queries, Memory Leaks, unnötige Re-Renders, Bundle-Größe     |
| Agent 4: Undirected Audit         | Business-Logik, Boundary-Interaktionen, versteckte Kopplung             |
| Agent 5: Build & Test             | Führt Build- und Test-Befehle aus, meldet Fehler                     |

Alle Agents laufen parallel. Die Ergebnisse der Agents 1–4 werden in einem **einheitlichen Batch-Verifizierungsdurchlauf** geprüft (ein Agent prüft alle Ergebnisse auf einmal, wodurch die Anzahl der LLM-Aufrufe konstant bleibt). Nach der Verifizierung liest ein **Reverse-Audit-Agent** den gesamten Diff erneut ein, kennt dabei alle bestätigten Ergebnisse und findet so Probleme, die alle anderen Agents übersehen haben. Ergebnisse des Reverse Audits überspringen den Verifizierungsschritt (der Agent hat bereits den vollständigen Kontext) und werden direkt als hochvertrauenswürdige Ergebnisse aufgenommen.

## Deterministic Analysis

Bevor die LLM-Agents starten, führt `/review` automatisch die vorhandenen Linter und Type-Checker deines Projekts aus:

| Sprache              | Erkannte Tools                                                   |
| --------------------- | ---------------------------------------------------------------- |
| TypeScript/JavaScript | `tsc --noEmit`, `npm run lint`, `eslint`                         |
| Python                | `ruff`, `mypy`, `flake8`                                         |
| Rust                  | `cargo clippy`                                                   |
| Go                    | `go vet`, `golangci-lint`                                        |
| Java                  | `mvn compile`, `checkstyle`, `spotbugs`, `pmd`                   |
| C/C++                 | `clang-tidy` (falls `compile_commands.json` verfügbar)              |
| Andere                 | Automatisch aus CI-Konfiguration entdeckt (`.github/workflows/*.yml`, etc.) |

Bei Projekten, die nicht den Standardmustern entsprechen (z. B. OpenJDK), liest `/review` die CI-Konfigurationsdateien aus, um die vom Projekt verwendeten Lint-/Check-Befehle zu ermitteln. Keine Benutzerkonfiguration erforderlich.

Deterministische Ergebnisse werden mit `[linter]` oder `[typecheck]` gekennzeichnet und überspringen die LLM-Verifizierung – sie gelten als gesicherte Fakten.

- **Errors** → Kritische Schwere
- **Warnings** → Nice to have (nur im Terminal, nicht als PR-Kommentare gepostet)

Falls ein Tool nicht installiert ist oder ein Timeout auftritt, wird es mit einem Hinweis übersprungen.

## Severity Levels

| Schweregrad         | Bedeutung                                                             | Als PR-Kommentar gepostet?      |
| ---------------- | ------------------------------------------------------------------- | -------------------------- |
| **Critical**     | Muss vor dem Mergen behoben werden (Bugs, Sicherheit, Datenverlust, Build-Fehler) | Ja (nur hohe Vertrauenswürdigkeit) |
| **Suggestion**   | Empfohlene Verbesserung                                             | Ja (nur hohe Vertrauenswürdigkeit) |
| **Nice to have** | Optionale Optimierung                                               | Nein (nur im Terminal)         |

Ergebnisse mit niedriger Vertrauenswürdigkeit erscheinen in einem separaten Abschnitt „Needs Human Review“ im Terminal und werden niemals als PR-Kommentare gepostet.

## Autofix

Nach der Präsentation der Ergebnisse bietet `/review` an, Fixes für Critical- und Suggestion-Ergebnisse mit klaren Lösungen automatisch anzuwenden:

```
3 Probleme mit automatisch behebbaren Vorschlägen gefunden. Auto-Fixes anwenden? (y/n)
```

- Fixes werden mit dem `edit`-Tool angewendet (gezielte Ersetzungen, keine vollständigen Datei-Rewrites)
- Nach den Fixes werden pro Datei Linter-Checks ausgeführt, um sicherzustellen, dass keine neuen Probleme entstehen
- Bei PR-Reviews werden Fixes automatisch aus dem Worktree committet und gepusht – dein lokaler Working Tree bleibt unberührt
- Nice-to-have- und Low-Confidence-Ergebnisse werden niemals automatisch gefixt
- Die PR-Review-Übermittlung verwendet immer das **Urteil vor dem Fix** (z. B. „Request changes“), da der Remote-PR erst nach Abschluss des Autofix-Pushs aktualisiert wird

## Worktree Isolation

Beim Review eines PRs erstellt `/review` einen temporären Git-Worktree (`.qwen/tmp/review-pr-<number>`), anstatt deinen aktuellen Branch zu wechseln. Das bedeutet:

- Dein Working Tree, gestagte Änderungen und aktueller Branch werden **niemals angefasst**
- Abhängigkeiten werden im Worktree installiert (`npm ci` usw.), damit Linting und Build/Test funktionieren
- Build- und Test-Befehle laufen isoliert, ohne deinen lokalen Build-Cache zu verschmutzen
- Falls etwas schiefgeht, bleibt deine Umgebung unberührt – lösche einfach den Worktree
- Der Worktree wird nach Abschluss des Reviews automatisch bereinigt
- Wird ein Review unterbrochen (Strg+C, Crash), räumt der nächste `/review`-Aufruf für denselben PR den verwaisten Worktree automatisch auf, bevor er neu startet
- Review-Reports und Cache werden im Hauptprojektverzeichnis gespeichert (nicht im Worktree)

## Cross-repo PR Review

Du kannst PRs aus anderen Repositories reviewen, indem du die vollständige URL übergibst:

```bash
/review https://github.com/other-org/other-repo/pull/456
```

Dies läuft im **Lightweight-Modus** – kein Worktree, kein Linter, kein Build/Test, kein Autofix. Das Review basiert ausschließlich auf dem Diff-Text (abgerufen über die GitHub API). PR-Kommentare können weiterhin gepostet werden, sofern du Schreibzugriff hast.

| Funktion                                       | Selbes Repo | Cross-Repo                    |
| ------------------------------------------------ | --------- | ----------------------------- |
| LLM-Review (Agents 1–4 + Verifizierung + Reverse Audit) | ✅        | ✅                            |
| Agent 5: Build & Test                            | ✅        | ❌ (kein lokaler Codebase)        |
| Deterministische Analyse (Linter/Typecheck)        | ✅        | ❌                            |
| Cross-File-Impact-Analyse                       | ✅        | ❌                            |
| Autofix                                          | ✅        | ❌                            |
| PR-Inline-Kommentare                               | ✅        | ✅ (bei Schreibzugriff) |
| Inkrementeller Review-Cache                         | ✅        | ❌                            |

## PR Inline Comments

Verwende `--comment`, um Ergebnisse direkt im PR zu posten:

```bash
/review 123 --comment
```

Oder tippe nach dem Ausführen von `/review 123` `post comments` ein, um Ergebnisse zu veröffentlichen, ohne das Review erneut auszuführen.

**Was gepostet wird:**

- High-Confidence Critical- und Suggestion-Ergebnisse als Inline-Kommentare an bestimmten Zeilen
- Für Approve/Request-changes-Urteile: eine Review-Zusammenfassung mit dem Urteil
- Für Comment-Urteile mit allen geposteten Inline-Kommentaren: keine separate Zusammenfassung (Inline-Kommentare reichen aus)
- Modell-Attributions-Footer in jedem Kommentar (z. B. _— qwen3-coder via Qwen Code /review_)

**Was nur im Terminal erscheint:**

- Nice-to-have-Ergebnisse (inklusive Linter-Warnungen)
- Low-Confidence-Ergebnisse

## Follow-up Actions

Nach dem Review erscheinen kontextbezogene Tipps als Ghost Text. Drücke Tab, um sie zu übernehmen:

| Status nach Review                 | Tipp                | Was passiert                            |
| ---------------------------------- | ------------------ | --------------------------------------- |
| Lokales Review mit ungefixten Ergebnissen | `fix these issues` | LLM fixt jedes Ergebnis interaktiv    |
| PR-Review mit Ergebnissen            | `post comments`    | Postet PR-Inline-Kommentare (kein Re-Review) |
| PR-Review, null Ergebnisse           | `post comments`    | Approved den PR auf GitHub (LGTM)        |
| Lokales Review, alles klar            | `commit`           | Committet deine Änderungen                    |

Hinweis: `fix these issues` ist nur für lokale Reviews verfügbar. Verwende bei PR-Reviews den Autofix (Schritt 8) – der Worktree wird nach dem Review bereinigt, sodass ein interaktives Fixen nach dem Review nicht möglich ist.

## Project Review Rules

Du kannst Review-Kriterien pro Projekt anpassen. `/review` liest Regeln aus folgenden Dateien (in dieser Reihenfolge):

1. `.qwen/review-rules.md` (Qwen Code native)
2. `.github/copilot-instructions.md` (bevorzugt) oder `copilot-instructions.md` (Fallback – es wird nur eine geladen, nicht beide)
3. `AGENTS.md` – Abschnitt `## Code Review`
4. `QWEN.md` – Abschnitt `## Code Review`

Regeln werden den LLM-Review-Agents (1–4) als zusätzliche Kriterien injiziert. Bei PR-Reviews werden Regeln aus dem **Base Branch** gelesen, um zu verhindern, dass ein bösartiger PR Bypass-Regeln einschleust.

Beispiel `.qwen/review-rules.md`:

```markdown
# Review Rules

- All API endpoints must validate authentication
- Database queries must use parameterized statements
- React components must not use inline styles
- Error messages must not expose internal paths
```

## Incremental Review

Beim Review eines PRs, das bereits zuvor reviewed wurde, prüft `/review` nur die Änderungen seit dem letzten Review:

```bash
# Erstes Review — vollständiges Review, Cache wird erstellt
/review 123

# PR mit neuen Commits aktualisiert — nur neue Änderungen werden reviewed
/review 123
```

### Cross-Model-Review

Wenn du das Modell wechselst (über `/model`) und denselben PR erneut reviewst, erkennt `/review` die Modelländerung und führt ein vollständiges Review durch, anstatt es zu überspringen:

```bash
# Review mit Modell A
/review 123

# Modell wechseln
/model

# Erneut reviewen — vollständiges Review mit Modell B (nicht übersprungen)
/review 123
# → "Vorheriges Review nutzte qwen3-coder. Vollständiges Review mit gpt-4o für eine zweite Meinung."
```

Der Cache wird in `.qwen/review-cache/` gespeichert und trackt sowohl den Commit-SHA als auch die Model-ID. Stelle sicher, dass dieses Verzeichnis in deiner `.gitignore` steht (eine breitere Regel wie `.qwen/*` funktioniert ebenfalls). Falls der gecachte Commit weg-rebased wurde, wird auf ein vollständiges Review zurückgegriffen.

## Review Reports

Bei Reviews im selben Repo werden die Ergebnisse als Markdown-Datei im `.qwen/reviews/`-Verzeichnis deines Projekts gespeichert (Cross-Repo-Lightweight-Reviews überspringen die Report-Persistenz):

```
.qwen/reviews/2026-04-06-143022-pr-123.md
.qwen/reviews/2026-04-06-150510-local.md
```

Reports enthalten: Zeitstempel, Diff-Statistiken, Ergebnisse der deterministischen Analyse, alle Ergebnisse mit Verifizierungsstatus und das Urteil.

## Cross-file Impact Analysis

Wenn Codeänderungen exportierte Funktionen, Klassen oder Interfaces modifizieren, durchsuchen die Review-Agents automatisch alle Aufrufer und prüfen die Kompatibilität:

- Änderungen bei Parameteranzahl/-typ
- Änderungen beim Return-Typ
- Entfernte oder umbenannte öffentliche Methoden
- Breaking API Changes

Bei großen Diffs (>10 modifizierte Symbole) priorisiert die Analyse Funktionen mit Signaturänderungen.

## Token Efficiency

Die Review-Pipeline verwendet eine feste Anzahl an LLM-Aufrufen, unabhängig davon, wie viele Ergebnisse produziert werden:

| Phase                           | LLM-Aufrufe  | Hinweise                                               |
| ------------------------------- | ---------- | --------------------------------------------------- |
| Deterministische Analyse (Schritt 3) | 0          | Nur Shell-Befehle                                 |
| Review-Agents (Schritt 4)          | 5 (oder 4)   | Laufen parallel; Agent 5 wird im Cross-Repo-Modus übersprungen |
| Batch-Verifizierung (Schritt 5)     | 1          | Ein einzelner Agent verifiziert alle Ergebnisse auf einmal          |
| Reverse Audit (Schritt 6)          | 1          | Findet Coverage-Lücken; Ergebnisse überspringen die Verifizierung     |
| **Gesamt**                       | **7 oder 6** | Selbes Repo: 7; Cross-Repo: 6 (kein Agent 5)            |

## What's NOT Flagged

Das Review schließt absichtlich Folgendes aus:

- Bestehende Probleme in unverändertem Code (Fokus liegt nur auf dem Diff)
- Style/Formatting/Naming, das deinen Codebase-Konventionen entspricht
- Probleme, die ein Linter oder Type-Checker finden würde (wird durch deterministische Analyse abgedeckt)
- Subjektive „Erwäge, X zu tun“-Vorschläge ohne echtes Problem
- Minor Refactorings, die keinen Bug oder kein Risiko beheben
- Fehlende Dokumentation, es sei denn, die Logik ist wirklich unverständlich
- Probleme, die bereits in bestehenden PR-Kommentaren diskutiert werden (vermeidet Duplizierung von menschlichem Feedback)

## Design Philosophy

> **Schweigen ist besser als Rauschen.** Jeder Kommentar sollte die Zeit des Lesers wert sein.

- Falls du unsicher bist, ob etwas ein Problem ist → melde es nicht
- Linter/Typecheck-Probleme werden von Tools behandelt, nicht von LLM-Vermutungen
- Gleiches Muster über N Dateien → wird zu einem einzigen Ergebnis aggregiert
- PR-Kommentare nur mit hoher Vertrauenswürdigkeit
- Style/Formatting-Probleme, die den Codebase-Konventionen entsprechen, werden ausgeschlossen