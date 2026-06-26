# Code Review

> Überprüfen Sie Code-Änderungen auf Korrektheit, Sicherheit, Leistung und Codequalität mit `/review`.

## Schnellstart

```bash
# Uncommittete lokale Änderungen überprüfen
/review

# Einen Pull Request (nach Nummer oder URL) überprüfen
/review 123
/review https://github.com/org/repo/pull/123

# Überprüfen und Inline-Kommentare auf dem PR posten
/review 123 --comment

# Eine bestimmte Datei überprüfen
/review src/utils/auth.ts
```

Wenn keine uncommitteten Änderungen vorliegen, teilt `/review` dies mit und stoppt – es werden keine Agents gestartet.

## Funktionsweise

Der Befehl `/review` führt eine mehrstufige Pipeline aus:

```
Schritt 1:  Scope bestimmen (lokaler Diff / PR-Worktree / Datei)
Schritt 2:  Projekt-Review-Regeln laden
Schritt 3:  Deterministische Analyse ausführen (Linter, Typecheck)    [0 LLM-Aufrufe]
Schritt 4:  9 parallele Review-Agents                                [9 LLM-Aufrufe]
           |-- Agent 1: Korrektheit
           |-- Agent 2: Sicherheit
           |-- Agent 3: Codequalität
           |-- Agent 4: Leistung & Effizienz
           |-- Agent 5: Testabdeckung
           |-- Agent 6: Ungerichtetes Audit (3 Personas: 6a/6b/6c)
           '-- Agent 7: Build & Test (führt Shell-Befehle aus)
Schritt 5:  Deduplizieren --> Batch-Verifizieren --> Aggregieren      [1 LLM-Aufruf]
Schritt 6:  Iteratives Reverse-Audit (1-3 Runden, Lückenfindung)     [1-3 LLM-Aufrufe]
Schritt 7:  Ergebnisse + Urteil präsentieren
Schritt 8:  Automatische Korrektur (benutzerbestätigt, optional)
Schritt 9:  PR-Inline-Kommentare posten (falls angefordert)
Schritt 10: Bericht + inkrementellen Cache speichern
Schritt 11: Aufräumen (Worktree + temporäre Dateien entfernen)
```

### Review-Agents

| Agent                            | Fokus                                                                                   |
| -------------------------------- | --------------------------------------------------------------------------------------- |
| Agent 1: Korrektheit             | Logikfehler, Randfälle, Null-Behandlung, Race Conditions, Typsicherheit                 |
| Agent 2: Sicherheit              | Injection, XSS, SSRF, Auth-Bypass, Offenlegung sensibler Daten                          |
| Agent 3: Codequalität            | Stilkonsistenz, Benennung, Duplikate, toter Code                                        |
| Agent 4: Leistung & Effizienz    | N+1-Abfragen, Speicherlecks, unnötige Re-Renders, Bundle-Größe                          |
| Agent 5: Testabdeckung           | Ungetestete Codepfade im Diff, fehlende Branch-Abdeckung, schwache Assertions           |
| Agent 6: Ungerichtetes Audit     | 3 parallele Personas (Angreifer / 3-Uhr-Nachtbereitschaft / Maintainer) – fängt bereichsübergreifende Probleme |
| Agent 7: Build & Test            | Führt Build- und Testbefehle aus, meldet Fehler                                         |

Alle Agents laufen parallel (Agent 6 startet 3 Persona-Varianten gleichzeitig, insgesamt 9 parallele Aufgaben für Reviews im selben Repository). Ergebnisse der Agents 1-6 werden in einem **einzelnen Batch-Verifizierungsdurchgang** verifiziert (ein Agent überprüft alle Ergebnisse auf einmal, die Verifizierungskosten bleiben unabhängig von der Anzahl der Ergebnisse konstant). Nach der Verifizierung führt das **iterative Reverse-Audit** 1-3 Runden der Lückenfindung durch – jede Runde erhält die kumulative Ergebnisliste der vorherigen Runden, sodass sich die nachfolgenden Runden auf das konzentrieren, was noch unentdeckt ist. Die Schleife stoppt, sobald eine Runde „Keine Probleme gefunden" zurückgibt, oder nach 3 Runden (harte Obergrenze). Reverse-Audit-Ergebnisse überspringen die Verifizierung (der Agent hat bereits den vollständigen Kontext) und werden als Ergebnisse mit hoher Vertrauenswürdigkeit eingestuft.

## Deterministische Analyse

Bevor die LLM-Agents ausgeführt werden, führt `/review` automatisch die vorhandenen Linter und Typ-Prüfer Ihres Projekts aus:

| Sprache             | Erkannte Tools                                                          |
| ------------------- | ----------------------------------------------------------------------- |
| TypeScript/JavaScript | `tsc --noEmit`, `npm run lint`, `eslint`                                |
| Python              | `ruff`, `mypy`, `flake8`                                                |
| Rust                | `cargo clippy`                                                          |
| Go                  | `go vet`, `golangci-lint`                                               |
| Java                | `mvn compile`, `checkstyle`, `spotbugs`, `pmd`                          |
| C/C++               | `clang-tidy` (wenn `compile_commands.json` verfügbar)                   |
| Andere              | Automatisch aus CI-Konfiguration erkannt (`.github/workflows/*.yml`, usw.) |

Für Projekte, die nicht den Standardmustern entsprechen (z.B. OpenJDK), liest `/review` CI-Konfigurationsdateien, um herauszufinden, welche Lint/Check-Befehle das Projekt verwendet. Keine Benutzerkonfiguration erforderlich.

Deterministische Ergebnisse werden mit `[linter]` oder `[typecheck]` gekennzeichnet und überspringen die LLM-Verifizierung – sie sind Ground Truth.

- **Fehler** → Kritischer Schweregrad
- **Warnungen** → Nice to have (nur im Terminal, nicht als PR-Kommentare gepostet)

Wenn ein Tool nicht installiert ist oder eine Zeitüberschreitung auftritt, wird es mit einem informativen Hinweis übersprungen.

## Schweregrade

| Schweregrad       | Bedeutung                                                            | Als PR-Kommentar gepostet?      |
| ----------------- | -------------------------------------------------------------------- | ------------------------------- |
| **Kritisch**      | Muss vor dem Mergen behoben werden (Bugs, Sicherheit, Datenverlust, Build-Fehler) | Ja (nur hohe Vertrauenswürdigkeit) |
| **Vorschlag**     | Empfohlene Verbesserung                                              | Ja (nur hohe Vertrauenswürdigkeit) |
| **Nice to have**  | Optionale Optimierung                                                | Nein (nur Terminal)            |

Ergebnisse mit geringer Vertrauenswürdigkeit erscheinen in einem separaten Bereich „Benötigt menschliche Überprüfung" im Terminal und werden niemals als PR-Kommentare gepostet.

## Automatische Korrektur

Nach der Präsentation der Ergebnisse bietet `/review` an, automatische Korrekturen für kritische und vorschlagende Ergebnisse mit klaren Lösungen anzuwenden:

```
3 Probleme mit automatisch korrigierbaren Vorschlägen gefunden. Automatische Korrekturen anwenden? (j/n)
```

- Korrekturen werden mit dem `edit`-Tool angewendet (gezielte Ersetzungen, keine vollständigen Datei-Neuschreibungen)
- Nach den Korrekturen werden dateibasierte Linter-Prüfungen durchgeführt, um sicherzustellen, dass keine neuen Probleme eingeführt wurden
- Bei PR-Reviews werden Korrekturen automatisch committet und vom Worktree aus gepusht – Ihr Arbeitsverzeichnis bleibt sauber
- Nice-to-have- und Ergebnisse mit geringer Vertrauenswürdigkeit werden niemals automatisch korrigiert
- Die PR-Review-Einreichung verwendet immer das **Vor-Korrektur-Urteil** (z.B. „Änderungen anfordern"), da der entfernte PR erst aktualisiert wird, wenn der Autofix-Push abgeschlossen ist

## Worktree-Isolation

Wenn ein PR überprüft wird, erstellt `/review` einen temporären git Worktree (`.qwen/tmp/review-pr-<numero>`) anstatt Ihren aktuellen Branch zu wechseln. Das bedeutet:

- Ihr Arbeitsverzeichnis, gestagte Änderungen und Ihr aktueller Branch werden **niemals berührt**
- Abhängigkeiten werden im Worktree installiert (`npm ci`, usw.), damit Linting und Build/Test funktionieren
- Build- und Testbefehle laufen isoliert, ohne Ihren lokalen Build-Cache zu verschmutzen
- Wenn etwas schiefgeht, ist Ihre Umgebung nicht betroffen – löschen Sie einfach den Worktree
- Der Worktree wird nach Abschluss des Reviews automatisch bereinigt
- Wenn ein Review unterbrochen wird (Strg+C, Absturz), bereinigt das nächste `/review` desselben PRs automatisch den veralteten Worktree, bevor es neu startet
- Review-Berichte und Cache werden im Hauptprojektverzeichnis gespeichert (nicht im Worktree)

## PR-Review über Repositories hinweg

Sie können PRs aus anderen Repositories überprüfen, indem Sie die vollständige URL angeben:

```bash
/review https://github.com/other-org/other-repo/pull/456
```

Dies läuft im **Lightweight-Modus** – kein Worktree, kein Linter, kein Build/Test, keine automatische Korrektur. Die Überprüfung basiert nur auf dem Diff-Text (über die GitHub-API abgerufen). PR-Kommentare können dennoch gepostet werden, wenn Sie Schreibzugriff haben.

| Fähigkeit                                                   | Gleiches Repository | Remote-Repository           |
| ----------------------------------------------------------- | ------------------- | --------------------------- |
| LLM-Review (Agents 1-6 + Verifizierung + iteratives Reverse-Audit) | ✅                  | ✅                          |
| Agent 7: Build & Test                                      | ✅                  | ❌ (keine lokale Codebasis) |
| Deterministische Analyse (Linter/Typecheck)                  | ✅                  | ❌                          |
| Analyse der Auswirkungen auf mehrere Dateien                  | ✅                  | ❌                          |
| Automatische Korrektur                                      | ✅                  | ❌                          |
| PR-Inline-Kommentare                                         | ✅                  | ✅ (bei Schreibzugriff)     |
| Inkrementeller Review-Cache                                 | ✅                  | ❌                          |

## PR-Inline-Kommentare

Verwenden Sie `--comment`, um Ergebnisse direkt auf dem PR zu posten:

```bash
/review 123 --comment
```

Oder geben Sie nach dem Ausführen von `/review 123` `post comments` ein, um Ergebnisse zu veröffentlichen, ohne das Review erneut auszuführen.

**Was gepostet wird:**

- Ergebnisse mit hoher Vertrauenswürdigkeit (Kritisch und Vorschlag) als Inline-Kommentare auf bestimmten Zeilen
- Für Urteile „Genehmigen"/„Änderungen anfordern": eine Review-Zusammenfassung mit dem Urteil
- Für das Urteil „Kommentieren" mit allen geposteten Inline-Kommentaren: keine separate Zusammenfassung (die Inline-Kommentare sind ausreichend)
- Modellzuweisungs-Fußzeile auf jedem Kommentar (z.B. _— qwen3-coder via Qwen Code /review_)

**Was nur im Terminal bleibt:**

- Nice-to-have-Ergebnisse (einschließlich Linter-Warnungen)
- Ergebnisse mit geringer Vertrauenswürdigkeit

**Selbst verfasste PRs:** GitHub erlaubt es nicht, `APPROVE`- oder `REQUEST_CHANGES`-Reviews auf dem eigenen Pull Request einzureichen – beide schlagen mit HTTP 422 fehl. Wenn `/review` erkennt, dass der PR-Autor mit dem aktuell authentifizierten Benutzer übereinstimmt, wird das API-Ereignis automatisch auf `COMMENT` herabgestuft, unabhängig vom Urteil, sodass die Einreichung dennoch erfolgreich ist. Das Terminal zeigt weiterhin das ehrliche Urteil an („Genehmigen" / „Änderungen anfordern" / „Kommentieren") – nur das GitHub-seitige Review-Ereignis wird neutralisiert. Die tatsächlichen Ergebnisse erscheinen weiterhin als Inline-Kommentare auf bestimmten Zeilen, sodass das inhaltliche Feedback unverändert bleibt.

**Erneutes Review eines PRs mit vorherigen Qwen Code-Kommentaren:** Wenn `/review` auf einem PR ausgeführt wird, der bereits frühere Qwen Code-Review-Kommentare enthält, klassifiziert es diese, bevor es neue postet. Nur bei **gleichen Zeilenüberlappungen** (ein vorhandener Kommentar auf derselben `(Pfad, Zeile)` wie ein neues Ergebnis) werden Sie zur Bestätigung aufgefordert – das ist der Fall, bei dem Sie ein visuelles Duplikat auf derselben Codezeile sehen würden. Kommentare von älteren Commits, beantwortete Kommentare (als erledigt betrachtet) und Kommentare, die einfach kein neues Ergebnis überlappen, werden stillschweigend übersprungen, mit einer Terminal-Protokollzeile, damit Sie wissen, was gefiltert wurde.

**CI / Build-Status-Prüfung vor APPROVE:** Wenn das Urteil „Genehmigen" lautet, fragt `/review` die Check-Runs und Commit-Status des PRs ab, bevor es einreicht. Wenn ein Check fehlgeschlagen ist (oder alle Checks noch ausstehen), wird das API-Ereignis automatisch von `APPROVE` auf `COMMENT` herabgestuft, wobei der Review-Body den Grund erläutert. Begründung: Das LLM-Review liest Code statisch und kann keine Laufzeit-Testfehler sehen; eine Genehmigung bei rotem CI wäre irreführend. Die Inline-Ergebnisse werden dennoch unverändert gepostet. Wenn Sie trotzdem genehmigen möchten (z.B. bei einem bekannten flaky CI-Fehler), reichen Sie die GitHub-Genehmigung nach der Überprüfung manuell ein.

## Folgeaktionen

Nach dem Review erscheinen kontextbezogene Tipps als Ghost-Text. Drücken Sie Tab, um zu akzeptieren:

| Status nach Review                              | Tipp                     | Was passiert                                    |
| ----------------------------------------------- | ------------------------ | ----------------------------------------------- |
| Lokales Review mit unkorrigierten Ergebnissen | `fix these issues`       | LLM korrigiert interaktiv jedes Ergebnis        |
| PR-Review mit Ergebnissen                      | `post comments`          | Postet PR-Inline-Kommentare (kein erneutes Review) |
| PR-Review, null Ergebnisse                     | `post comments`          | Genehmigt den PR auf GitHub (LGTM)              |
| Lokales Review, alles klar                     | `commit`                 | Committet Ihre Änderungen                       |

Hinweis: `fix these issues` ist nur für lokale Reviews verfügbar. Verwenden Sie für PR-Reviews die automatische Korrektur (Schritt 8) – der Worktree wird nach dem Review bereinigt, sodass eine interaktive Korrektur nach dem Review nicht möglich ist.

## Projekt-Review-Regeln

Sie können die Review-Kriterien pro Projekt anpassen. `/review` liest Regeln aus folgenden Dateien (in dieser Reihenfolge):

1. `.qwen/review-rules.md` (Qwen Code nativ)
2. `.github/copilot-instructions.md` (bevorzugt) oder `copilot-instructions.md` (Fallback – es wird nur eine geladen, nicht beide)
3. `AGENTS.md` – Abschnitt `## Code Review`
4. `QWEN.md` – Abschnitt `## Code Review`

Regeln werden den LLM-Review-Agents (1-6) als zusätzliche Kriterien injiziert. Bei PR-Reviews werden die Regeln aus dem **Basis-Branch** gelesen, um zu verhindern, dass ein böswilliger PR Umgehungsregeln einschleust.

Beispiel `.qwen/review-rules.md`:

```markdown
# Review-Regeln

- Alle API-Endpunkte müssen die Authentifizierung validieren
- Datenbankabfragen müssen parametrisierte Anweisungen verwenden
- React-Komponenten dürfen keine Inline-Stile verwenden
- Fehlermeldungen dürfen keine internen Pfade preisgeben
```

## Inkrementelles Review

Wenn ein PR überprüft wird, der zuvor bereits überprüft wurde, untersucht `/review` nur die Änderungen seit dem letzten Review:

```bash
# Erstes Review – vollständiges Review, Cache wird erstellt
/review 123

# PR mit neuen Commits aktualisiert – nur neue Änderungen werden überprüft
/review 123
### Cross-Model-Review

Wenn Sie das Modell wechseln (via `/model`) und denselben PR erneut überprüfen, erkennt `/review` den Modellwechsel und führt ein vollständiges Review anstelle eines Überspringens durch:

```bash
# Review mit Modell A
/review 123

# Modell wechseln
/model

# Erneutes Review – vollständiges Review mit Modell B (nicht übersprungen)
/review 123
# → „Vorheriges Review verwendete qwen3-coder. Führe vollständiges Review mit gpt-4o für eine zweite Meinung durch."
```

Der Cache wird in `.qwen/review-cache/` gespeichert und verfolgt sowohl den Commit-SHA als auch die Modell-ID. Stellen Sie sicher, dass dieses Verzeichnis in Ihrer `.gitignore` enthalten ist (eine breitere Regel wie `.qwen/*` funktioniert ebenfalls). Wenn der zwischengespeicherte Commit rebased wurde, wird auf ein vollständiges Review zurückgegriffen.

## Review-Berichte

Für Reviews im selben Repository werden die Ergebnisse als Markdown-Datei im Verzeichnis `.qwen/reviews/` Ihres Projekts gespeichert (Cross-Repo-Lightweight-Reviews überspringen die Berichtspersistenz):

```
.qwen/reviews/2026-04-06-143022-pr-123.md
.qwen/reviews/2026-04-06-150510-local.md
```

Berichte enthalten: Zeitstempel, Diff-Statistiken, Ergebnisse der deterministischen Analyse, alle Ergebnisse mit Verifizierungsstatus und das Urteil.

## Analyse der Auswirkungen auf mehrere Dateien

Wenn Codeänderungen exportierte Funktionen, Klassen oder Schnittstellen verändern, durchsuchen die Review-Agents automatisch alle Aufrufer und prüfen die Kompatibilität:

- Änderungen der Parameteranzahl / des Parametertyps
- Änderungen des Rückgabetyps
- Entfernte oder umbenannte öffentliche Methoden
- Breaking-API-Änderungen

Bei großen Diffs (>10 geänderte Symbole) priorisiert die Analyse Funktionen mit Signaturänderungen.

## Token-Effizienz

Die Review-Pipeline verwendet eine begrenzte Anzahl von LLM-Aufrufen, unabhängig davon, wie viele Ergebnisse produziert werden:

| Phase                                 | LLM-Aufrufe        | Hinweise                                             |
| ------------------------------------- | ------------------ | ---------------------------------------------------- |
| Deterministische Analyse (Schritt 3)  | 0                  | Nur Shell-Befehle                                    |
| Review-Agents (Schritt 4)             | 9 (oder 8)         | Laufen parallel; Agent 7 wird im Cross-Repo-Modus übersprungen |
| Batch-Verifizierung (Schritt 5)       | 1                  | Ein einzelner Agent verifiziert alle Ergebnisse auf einmal |
| Iteratives Reverse-Audit (Schritt 6)  | 1-3                | Schleife bis „Keine Probleme gefunden" oder 3-Runden-Obergrenze |
| **Gesamt**                            | **11-13 (10-12)** | Gleiches Repository: 11-13; Cross-Repo: 10-12 (kein Agent 7) |

Die meisten PRs konvergieren zum unteren Ende des Bereichs (1 Reverse-Audit-Runde); die Obergrenze verhindert unkontrollierte Kosten bei pathologischen Fällen.

## Was NICHT gemeldet wird

Das Review schließt bewusst aus:

- Bereits bestehende Probleme in unverändertem Code (Fokus nur auf dem Diff)
- Stil/Formatierung/Benennung, die den Konventionen Ihrer Codebasis entsprechen
- Probleme, die ein Linter oder Typprüfer erkennen würde (werden durch die deterministische Analyse behandelt)
- Subjektive „Überlegen Sie, X zu tun"-Vorschläge ohne tatsächliches Problem
- Kleine Refactoring-Vorschläge, die keinen Bug oder kein Risiko beheben
- Fehlende Dokumentation, es sei denn, die Logik ist wirklich verwirrend
- Bereits in vorhandenen PR-Kommentaren diskutierte Probleme (vermeidet Duplizierung von menschlichem Feedback)

## Design-Philosophie

> **Schweigen ist besser als Rauschen.** Jeder Kommentar sollte die Zeit des Lesers wert sein.

- Wenn Sie sich nicht sicher sind, ob etwas ein Problem ist → melden Sie es nicht
- Linter/Typecheck-Probleme werden von Tools behandelt, nicht von LLM-Vermutungen
- Gleiches Muster über N Dateien hinweg → zu einem Ergebnis zusammengefasst
- PR-Kommentare sind nur mit hoher Vertrauenswürdigkeit
- Stil/Formatierungsprobleme, die den Konventionen der Codebase entsprechen, werden ausgeschlossen