# Code Review

> Überprüfen Sie Code-Änderungen auf Korrektheit, Sicherheit, Leistung und Codequalität mit `/review`.

## Schnellstart

```bash
# Review lokale unbestätigte Änderungen
/review

# Einen Pull Request überprüfen (nach Nummer oder URL)
/review 123
/review https://github.com/org/repo/pull/123

# Überprüfen und Inline-Kommentare zum PR posten
/review 123 --comment

# Eine bestimmte Datei überprüfen
/review src/utils/auth.ts
```

Wenn keine unbestätigten Änderungen vorliegen, meldet `/review` dies und stoppt – es werden keine Agents gestartet.

## Funktionsweise

Der Befehl `/review` durchläuft eine mehrstufige Pipeline:

```
Schritt 1:  Umfang bestimmen (lokales Diff / PR-Worktree / Datei)
Schritt 2:  Projekt-Review-Regeln laden
Schritt 3:  Deterministische Analyse ausführen (Linter, Typprüfung)     [keine LLM-Kosten]
Schritt 4:  9 parallele Review-Agents                                   [9 LLM-Aufrufe]
           |-- Agent 1: Korrektheit
           |-- Agent 2: Sicherheit
           |-- Agent 3: Codequalität
           |-- Agent 4: Leistung & Effizienz
           |-- Agent 5: Testabdeckung
           |-- Agent 6: Ungerichtetes Audit (3 Personas: 6a/6b/6c)
           '-- Agent 7: Build & Test (führt Shell-Befehle aus)
Schritt 5: Deduplizieren --> Batch-verifizieren --> Zusammenführen      [1 LLM-Aufruf]
Schritt 6: Iteratives Reverse-Audit (1-3 Runden, Lückensuche)          [1-3 LLM-Aufrufe]
Schritt 7: Ergebnisse + Bewertung präsentieren
Schritt 8: Autofix (vom Benutzer bestätigt, optional)
Schritt 9: PR-Inline-Kommentare posten (falls angefordert)
Schritt 10: Bericht speichern + inkrementellen Cache
Schritt 11: Aufräumen (Worktree + temporäre Dateien entfernen)
```

### Review-Agents

| Agent                              | Fokus                                                                                     |
| ---------------------------------- | ----------------------------------------------------------------------------------------- |
| Agent 1: Korrektheit               | Logikfehler, Randfälle, Nullbehandlung, Wettlaufsituationen, Typsicherheit                |
| Agent 2: Sicherheit                | Injection, XSS, SSRF, Umgehung der Authentifizierung, Offenlegung sensibler Daten         |
| Agent 3: Codequalität              | Stilkonsistenz, Benennung, Duplikate, toter Code                                          |
| Agent 4: Leistung & Effizienz      | N+1-Abfragen, Speicherlecks, unnötige Neu-Renderings, Bundle-Größe                        |
| Agent 5: Testabdeckung             | Ungetestete Codepfade im Diff, fehlende Zweigabdeckung, schwache Assertions               |
| Agent 6: Ungerichtetes Audit       | 3 parallele Personas (Angreifer / 3-Uhr-Nachtdienst / Maintainer) – findet querschnittliche Probleme |
| Agent 7: Build & Test              | Führt Build- und Testbefehle aus, meldet Fehler                                           |

Alle Agents laufen parallel (Agent 6 startet 3 Persona-Varianten gleichzeitig, insgesamt 9 parallele Aufgaben für Depot-interne Reviews). Die Ergebnisse von Agents 1-6 werden in einem **einzelnen Batch-Verifizierungslauf** verifiziert (ein Agent überprüft alle Resultate auf einmal, wodurch die Verifizierungskosten unabhängig von der Anzahl der Funde konstant bleiben). Nach der Verifizierung führt das **iterative Reverse-Audit** 1-3 Runden der Lückensuche durch – jede Runde erhält die kumulative Fundliste aus den vorherigen Runden, sodass sich aufeinanderfolgende Runden auf das konzentrieren, was noch unentdeckt ist. Die Schleife stoppt, sobald eine Runde „Keine Probleme gefunden“ zurückgibt, oder nach 3 Runden (harte Obergrenze). Reverse-Audit-Funde überspringen die Verifizierung (der Agent hat bereits den vollständigen Kontext) und werden als ergebnisse mit hoher Konfidenz einbezogen.

## Deterministische Analyse

Bevor die LLM-Agents ausgeführt werden, führt `/review` automatisch die vorhandenen Linter und Typprüfer des Projekts aus:

| Sprache              | Erkannte Tools                                                         |
| -------------------- | ---------------------------------------------------------------------- |
| TypeScript/JavaScript| `tsc --noEmit`, `npm run lint`, `eslint`                               |
| Python               | `ruff`, `mypy`, `flake8`                                               |
| Rust                 | `cargo clippy`                                                         |
| Go                   | `go vet`, `golangci-lint`                                              |
| Java                 | `mvn compile`, `checkstyle`, `spotbugs`, `pmd`                         |
| C/C++                | `clang-tidy` (falls `compile_commands.json` verfügbar)                 |
| Andere               | Automatisch aus der CI-Konfiguration erkannt (`.github/workflows/*.yml`, usw.) |

Für Projekte, die nicht zu Standardmustern passen (z. B. OpenJDK), liest `/review` CI-Konfigurationsdateien aus, um zu ermitteln, welche Lint-/Check-Befehle das Projekt verwendet. Es ist keine Benutzerkonfiguration erforderlich.

Deterministische Ergebnisse werden mit `[linter]` oder `[typecheck]` gekennzeichnet und überspringen die LLM-Verifizierung – sie sind Ground Truth.

- **Fehler** → Kritisch
- **Warnungen** → Nice to have (nur Terminal, werden nicht als PR-Kommentare gepostet)

Falls ein Tool nicht installiert ist oder eine Zeitüberschreitung auftritt, wird es mit einem informativen Hinweis übersprungen.

## Schweregrade

| Schweregrad      | Bedeutung                                                              | Als PR-Kommentar veröffentlicht?      |
| ---------------- | ---------------------------------------------------------------------- | ------------------------------------- |
| **Kritisch**     | Muss vor dem Zusammenführen behoben werden (Bugs, Sicherheit, Datenverlust, Build-Fehler) | Ja (nur bei hoher Konfidenz)          |
| **Vorschlag**    | Empfohlene Verbesserung                                                | Ja (nur bei hoher Konfidenz)          |
| **Nice to have** | Optionale Optimierung                                                  | Nein (nur Terminal)                   |
Ergebnisse mit niedriger Konfidenz erscheinen in einem separaten Abschnitt "Benötigt menschliche Überprüfung" im Terminal und werden niemals als PR-Kommentare veröffentlicht.

## Autofix

Nach der Präsentation der Ergebnisse bietet `/review` an, automatisch Korrekturen für Critical- und Suggestion-Ergebnisse mit klaren Lösungen anzuwenden:

```
Found 3 issues with auto-fixable suggestions. Apply auto-fixes? (y/n)
```

- Korrekturen werden mit dem `edit`-Tool angewendet (gezielte Ersetzungen, keine vollständigen Dateineuschreibungen)
- Nach den Korrekturen werden dateiweise Linter-Prüfungen durchgeführt, um sicherzustellen, dass keine neuen Probleme eingeführt werden
- Bei PR-Reviews werden Korrekturen automatisch aus dem Worktree committet und gepusht – Ihr Arbeitsbaum bleibt sauber
- Nice-to-have- und Ergebnisse mit niedriger Konfidenz werden niemals automatisch korrigiert
- Die PR-Review-Übermittlung verwendet immer das **Vor-Korrektur-Urteil** (z. B. "Request changes"), da der entfernte PR erst nach Abschluss des Autofix-Pushes aktualisiert wird

## Worktree Isolation

Bei der Überprüfung eines PRs erstellt `/review` einen temporären Git-Worktree (`.qwen/tmp/review-pr-<number>`), anstatt Ihren aktuellen Branch zu wechseln. Das bedeutet:

- Ihr Arbeitsbaum, gestaffelte Änderungen und Ihr aktueller Branch werden **niemals berührt**.
- Abhängigkeiten werden im Worktree installiert (`npm ci` usw.), sodass Linting und Build/Test funktionieren.
- Build- und Testbefehle werden isoliert ausgeführt, ohne Ihren lokalen Build-Cache zu verschmutzen.
- Falls etwas schiefgeht, bleibt Ihre Umgebung unberührt – löschen Sie einfach den Worktree.
- Der Worktree wird nach Abschluss des Reviews automatisch bereinigt.
- Falls ein Review unterbrochen wird (Strg+C, Absturz), bereinigt das nächste `/review` desselben PRs automatisch den alten Worktree, bevor es neu startet.
- Review-Berichte und Cache werden im Hauptprojektverzeichnis gespeichert (nicht im Worktree).

## Cross-repo PR Review

Sie können PRs aus anderen Repositorys übergeben, indem Sie die vollständige URL angeben:

```bash
/review https://github.com/other-org/other-repo/pull/456
```

Dies läuft im **Lightweight-Modus** – kein Worktree, kein Linter, kein Build/Test, kein Autofix. Das Review basiert nur auf dem Diff-Text (über GitHub API abgerufen). PR-Kommentare können dennoch gepostet werden, wenn Sie Schreibzugriff haben.

| Fähigkeit                                                   | Gleiches Repo | Fremdes Repo                    |
| ----------------------------------------------------------- | ------------- | ------------------------------- |
| LLM-Review (Agenten 1-6 + Verify + iteratives Reverse-Audit)| ✅            | ✅                              |
| Agent 7: Build & Test                                       | ✅            | ❌ (keine lokale Codebasis)     |
| Deterministische Analyse (Linter/Typecheck)                 | ✅            | ❌                              |
| Dateiübergreifende Auswirkungsanalyse                       | ✅            | ❌                              |
| Autofix                                                     | ✅            | ❌                              |
| Inline-Kommentare im PR                                     | ✅            | ✅ (falls Sie Schreibzugriff haben) |
| Inkrementeller Review-Cache                                 | ✅            | ❌                              |

## PR Inline Comments

Verwenden Sie `--comment`, um Ergebnisse direkt im PR zu posten:

```bash
/review 123 --comment
```

Oder geben Sie nach der Ausführung von `/review 123` `post comments` ein, um die Ergebnisse zu veröffentlichen, ohne das Review erneut auszuführen.

**Was gepostet wird:**

- Critical- und Suggestion-Ergebnisse mit hoher Konfidenz als Inline-Kommentare zu bestimmten Zeilen
- Bei Urteilen "Approve"/"Request changes": eine Review-Zusammenfassung mit dem Urteil
- Beim Urteil "Comment" mit allen geposteten Inline-Kommentaren: keine separate Zusammenfassung (Inline-Kommentare reichen aus)
- Modell-Attribution-Fußzeile auf jedem Kommentar (z. B. _— qwen3-coder via Qwen Code /review_)

**Was nur im Terminal bleibt:**

- Nice-to-have-Ergebnisse (einschließlich Linter-Warnungen)
- Ergebnisse mit niedriger Konfidenz

**Selbst erstellte PRs:** GitHub erlaubt es nicht, `APPROVE`- oder `REQUEST_CHANGES`-Reviews für den eigenen Pull-Request zu übermitteln – beide schlagen mit HTTP 422 fehl. Wenn `/review` erkennt, dass der PR-Autor mit dem aktuell authentifizierten Benutzer übereinstimmt, stuft es das API-Event automatisch auf `COMMENT` herab, unabhängig vom Urteil, sodass die Übermittlung dennoch erfolgreich ist. Das Terminal zeigt weiterhin das ehrliche Urteil ("Approve" / "Request changes" / "Comment") – nur das GitHub-seitige Review-Event wird neutralisiert. Die eigentlichen Ergebnisse erscheinen weiterhin als Inline-Kommentare auf bestimmten Zeilen, sodass sich das inhaltliche Feedback nicht ändert.

**Erneutes Review eines PRs mit vorherigen Qwen Code-Kommentaren:** Wenn `/review` auf einem PR ausgeführt wird, der bereits frühere Qwen Code-Review-Kommentare enthält, werden diese klassifiziert, bevor neue gepostet werden. Nur bei **gleicher Zeilenüberlappung** (ein vorhandener Kommentar auf derselben `(path, line)` wie ein neues Ergebnis) werden Sie zur Bestätigung aufgefordert – das ist der Fall, bei dem Sie ein visuelles Duplikat auf derselben Codezeile sehen würden. Kommentare von älteren Commits, beantwortete Kommentare (als erledigt betrachtet) und Kommentare, die einfach mit keinem neuen Ergebnis überlappen, werden stillschweigend übersprungen, mit einer Terminal-Logzeile, damit Sie wissen, was gefiltert wurde.

**CI-/Build-Status-Prüfung vor APPROVE:** Wenn das Urteil "Approve" lautet, fragt `/review` die Check-Runs und Commit-Status des PRs ab, bevor es übermittelt wird. Wenn ein Check fehlgeschlagen ist (oder alle Checks noch ausstehen), wird das API-Event automatisch von `APPROVE` auf `COMMENT` herabgestuft, mit einer Erklärung im Review-Text. Begründung: Das LLM-Review liest Code statisch und kann keine Laufzeit-Testfehler erkennen; eine Genehmigung während CI-Rot wäre irreführend. Die Inline-Ergebnisse werden weiterhin unverändert gepostet. Wenn Sie dennoch genehmigen möchten (z. B. bei einem bekannten instabilen CI-Fehler), reichen Sie die GitHub-Genehmigung nach Überprüfung manuell ein.
## Folgeaktionen

Nach der Überprüfung erscheinen kontextbezogene Tipps als Ghost Text. Drücke Tab zum Akzeptieren:

| Zustand nach Überprüfung            | Tipp                        | Ergebnis                                                  |
| ----------------------------------- | ---------------------------- | --------------------------------------------------------- |
| Lokale Überprüfung mit ungelösten Befunden | `fix these issues`           | LLM behebt interaktiv jeden Befund                        |
| PR-Überprüfung mit Befunden         | `post comments`              | Postet PR-Inline-Kommentare (keine erneute Überprüfung)    |
| PR-Überprüfung, keine Befunde       | `post comments`              | Approves the PR auf GitHub (LGTM)                         |
| Lokale Überprüfung, alles in Ordnung | `commit`                     | Commitet deine Änderungen                                  |

Hinweis: `fix these issues` ist nur bei lokalen Überprüfungen verfügbar. Verwende für PR-Überprüfungen Autofix (Schritt 8) – der Workspace wird nach der Überprüfung bereinigt, daher ist eine interaktive Fehlerbehebung nach der Überprüfung nicht möglich.

## Projekt-Überprüfungsregeln

Du kannst die Überprüfungskriterien pro Projekt anpassen. `/review` liest Regeln aus diesen Dateien (in dieser Reihenfolge):

1. `.qwen/review-rules.md` (Qwen Code nativ)
2. `.github/copilot-instructions.md` (bevorzugt) oder `copilot-instructions.md` (Fallback – es wird nur eine geladen, nicht beide)
3. `AGENTS.md` – Abschnitt `## Code Review`
4. `QWEN.md` – Abschnitt `## Code Review`

Regeln werden den LLM-Überprüfungsagenten (1-6) als zusätzliche Kriterien eingefügt. Bei PR-Überprüfungen werden die Regeln vom **Basis-Branch** gelesen, um zu verhindern, dass ein bösartiger PR Umgehungsregeln einschleust.

Beispiel `.qwen/review-rules.md`:

```markdown
# Review Rules

- Alle API-Endpunkte müssen die Authentifizierung validieren
- Datenbankabfragen müssen parametrisierte Anweisungen verwenden
- React-Komponenten dürfen keine Inline-Stile verwenden
- Fehlermeldungen dürfen keine internen Pfade preisgeben
```

## Inkrementelle Überprüfung

Wenn ein PR überprüft wird, der bereits zuvor überprüft wurde, untersucht `/review` nur die Änderungen seit der letzten Überprüfung:

```bash
# Erste Überprüfung – vollständige Überprüfung, Cache erstellt
/review 123

# PR mit neuen Commits aktualisiert – nur neue Änderungen werden überprüft
/review 123
```

### Modellübergreifende Überprüfung

Wenn du das Modell wechselst (via `/model`) und denselben PR erneut überprüfst, erkennt `/review` den Modellwechsel und führt eine vollständige Überprüfung durch, anstatt sie zu überspringen:

```bash
# Überprüfung mit Modell A
/review 123

# Modell wechseln
/model

# Erneute Überprüfung – vollständige Überprüfung mit Modell B (nicht übersprungen)
/review 123
# → "Previous review used qwen3-coder. Running full review with gpt-4o for a second opinion."
```

Der Cache wird in `.qwen/review-cache/` gespeichert und verfolgt sowohl den Commit-SHA als auch die Modell-ID. Stelle sicher, dass dieses Verzeichnis in deiner `.gitignore` ist (eine breitere Regel wie `.qwen/*` funktioniert auch). Wenn der gecachte Commit rebased wurde, wird auf eine vollständige Überprüfung zurückgegriffen.

## Überprüfungsberichte

Bei Überprüfungen im selben Repository werden die Ergebnisse als Markdown-Datei im `.qwen/reviews/`-Verzeichnis deines Projekts gespeichert (leichte Überprüfungen über Repository-Grenzen hinweg überspringen die Berichtspersistenz):

```
.qwen/reviews/2026-04-06-143022-pr-123.md
.qwen/reviews/2026-04-06-150510-local.md
```

Die Berichte enthalten: Zeitstempel, Diff-Statistiken, Ergebnisse der deterministischen Analyse, alle Befunde mit Verifizierungsstatus sowie das Urteil.

## Dateiübergreifende Auswirkungsanalyse

Wenn Codeänderungen exportierte Funktionen, Klassen oder Schnittstellen verändern, durchsuchen die Überprüfungsagenten automatisch alle Aufrufer und prüfen die Kompatibilität:

- Änderungen der Parameteranzahl / des Parametertyps
- Änderungen des Rückgabetyps
- Entfernte oder umbenannte öffentliche Methoden
- Brechende API-Änderungen

Bei großen Diffs (>10 geänderte Symbole) priorisiert die Analyse Funktionen mit Signaturänderungen.

## Token-Effizienz

Die Überprüfungspipeline verwendet eine begrenzte Anzahl von LLM-Aufrufen, unabhängig davon, wie viele Befunde erzeugt werden:

| Stufe                               | LLM-Aufrufe        | Anmerkungen                                          |
| ----------------------------------- | ------------------ | ---------------------------------------------------- |
| Deterministische Analyse (Schritt 3) | 0                  | Nur Shell-Befehle                                    |
| Überprüfungsagenten (Schritt 4)     | 9 (oder 8)         | Werden parallel ausgeführt; Agent 7 wird im Cross-Repo-Modus übersprungen |
| Batch-Verifizierung (Schritt 5)     | 1                  | Ein einzelner Agent verifiziert alle Befunde auf einmal |
| Iteratives Reverse-Audit (Schritt 6) | 1-3                | Schleift bis "Keine Probleme gefunden" oder 3-Runden-Limit |
| **Gesamt**                          | **11-13 (10-12)**  | Gleiches Repo: 11-13; Cross-Repo: 10-12 (kein Agent 7) |

Die meisten PRs konvergieren zum unteren Ende des Bereichs (1 Reverse-Audit-Runde); das Limit verhindert Kostenexplosionen bei pathologischen Fällen.

## Was NICHT beanstandet wird

Die Überprüfung schließt bewusst Folgendes aus:

- Bereits bestehende Probleme in unverändertem Code (Fokus nur auf dem Diff)
- Stil/Formatierung/Benennung, die deinen Codebase-Konventionen entspricht
- Probleme, die ein Linter oder Typprüfer erkennen würde (werden durch die deterministische Analyse abgedeckt)
- Subjektive "Du könntest X tun"-Vorschläge ohne tatsächliches Problem
- Kleine Refactorings, die keinen Fehler beheben oder kein Risiko darstellen
- Fehlende Dokumentation, es sei denn, die Logik ist wirklich verwirrend
- Probleme, die bereits in bestehenden PR-Kommentaren diskutiert wurden (vermeidet Doppelung menschlichen Feedbacks)
## Designphilosophie

> **Schweigen ist besser als Rauschen.** Jeder Kommentar sollte die Zeit des Lesers wert sein.

- Wenn unsicher, ob etwas ein Problem ist → nicht melden
- Linter-/Typcheck-Probleme werden von Tools behandelt, nicht von LLM-Vermutungen
- Gleiches Muster über N Dateien → zu einem Befund zusammengefasst
- PR-Kommentare nur bei hoher Sicherheit
- Stil-/Formatierungsprobleme, die den Codebasis-Konventionen entsprechen, werden ausgeschlossen
