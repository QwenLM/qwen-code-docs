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

# Review local changes and apply the findings to your working tree
/review --fix

# Continue a review of the same PR that was interrupted, instead of starting over
/review 123 --resume

# Review a specific file
/review src/utils/auth.ts

# Quick unverified pass (no subagents)
/review --effort low
/review 123 --effort medium
```

Wenn es keine uncommitted Änderungen gibt, benachrichtigt dich `/review` darüber und stoppt – es werden keine Agents gestartet.

## Effort-Stufen

`--effort low|medium|high` tauscht Tiefe gegen Geschwindigkeit:

| Stufe    | Was läuft                                                                                                                                                                                                                       | Ergebnis-Obergrenze | Fazit                               | Postet zum PR    |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ----------------------------------- | ---------------- |
| `low`    | 3–6 gezielte Inline-Blickwinkel über dem Diff (skaliert nach Diff-Größe) plus ein Gap-Sweep – keine Subagents, kein Build/Test, keine Projekt-Regeln                                                                            | 10 (unverifiziert)  | Keines                              | Niemals          |
| `medium` | Die High-Pipeline minus ihrer teuersten Durchläufe: der parallele Finder-Fan-out über einen reduzierten Dimensionssatz, plus Build/Test und ein einzelner Verifizierungsdurchlauf                                               | Unbegrenzt (verifiziert) | Approve gedeckelt auf Comment      | Niemals          |
| `high`   | Vollständige Pipeline: bis zu 16 parallele Agents → Sharded Verification → iterativer Reverse-Audit                                                                                                                              | Unbegrenzt (verifiziert) | Approve / Request changes / Comment | Mit `--comment`  |

`/review` löst den Effort in dieser Reihenfolge auf: ein explizites `--effort`, die zuletzt für dieses Projekt explizit eingegebene Stufe, die Operator-Einstellung `review.effort`, dann das eingebaute Ziel-Default (**high** für PR-Reviews, **medium** für lokale und Datei-Reviews). Wenn eine gespeicherte Stufe gilt, kündigt `/review` sie vor Arbeitsbeginn an; gib ein neues `--effort` ein, um sie zu ersetzen. Ein wirksames `--comment` erzwingt high (gepostete Kommentare müssen die Verifizierung überstehen) – bei einem Nicht-PR-Ziel wird `--comment` mit einer Warnung ignoriert und ändert **nicht** den Effort. Medium behält die Security- und Test-Coverage-Agents und Build/Test bei und lässt die adversarischen Personas, die Sprach-Fallstricke- und Wrapper/Proxy-Spezialisten (Agents 1d/1e), die Diff-Spezialfinder und den Reverse-Audit weg – ein subtiles Critical, das erst der zweite Blick aufdeckt, kann also durchrutschen; verwende `--effort high` für sicherheitskritische oder Pre-Release-Reviews. Nur `low` ist unverifiziert. Worktree-Isolation gilt für Same-Repo-PR-Reviews; Cross-Repo-PRs laufen im Lightweight-Modus (nur Diff, kein Worktree oder Build/Test). Der Low-Durchlauf wird als unverifiziert gekennzeichnet, gibt kein Fazit aus und schreibt nie den inkrementellen Review-Cache, sodass ein späterer `--effort high`-Lauf nie als "bereits reviewed" übersprungen wird; medium ist verifiziert, aber sein Approve ist auf Comment gedeckelt, weil nichts ein zweites Mal nach dem sucht, was der erste Durchlauf verpasst hat. Die Diff-Beschaffungsmechanik ist auf allen Stufen identisch – PR-Reviews verwenden immer den isolierten Worktree und dieselbe Base-Auflösung, sodass das Review nie gegen die falsche Basis läuft. Ein Scope-Unterschied bleibt: Der inkrementelle Cache ist high-exklusiv, sodass ein High-Re-Review nur die neuen Commits abdecken kann (`lastCommitSha..HEAD`), während low/medium immer das vollständige PR-Diff reviewen.

## Funktionsweise

Der `/review`-Befehl führt eine mehrstufige Pipeline aus:

```
Schritt 1:  Umfang + Effort-Stufe bestimmen (lokaler Diff / PR-Worktree / Datei)
            Diff in eine Datei erfassen + in Chunks aufteilen
Schritt 2:  Projekt-Review-Regeln laden (medium/high)
Schritt 3C: low Effort: 3-6 Inline-Blickwinkel + Gap-Sweep     [0 Subagent-Aufrufe]
Schritt 3A: high, <=500 Src UND <=3200 gesamt: bis zu 16 Agents  [16+ LLM-Aufrufe]
           |-- Agent 0: Issue Fidelity & Root-Cause Ownership
           |-- Agent 1a: Correctness — Zeile-für-Zeile-Scan
           |-- Agent 1b: Correctness — Removed-Behavior-Audit
           |-- Agent 1c: Correctness — Cross-File-Tracer
           |-- Agent 1d: Correctness — Sprach-Fallstricke-Scan
           |-- Agent 1e: Correctness — Wrapper/Proxy-Routing
           |     (nur wenn der Diff einen Wrapping-Typ signalisiert)
           |-- Agent 2: Security
           |-- Agent 3a: Reuse & Duplication
           |-- Agent 3b: Altitude & Abstraction Fit
           |-- Agent 3c: Consistency & Clarity
           |-- Agent 4: Performance & Efficiency
           |-- Agent 5: Test Coverage
           |-- Agent 6: Undirected Audit (3 Personas: 6a/6b/6c)
           |-- Agent 8: Diff-spezialisierte Finder (0-2, nur wenn
           |     die Diff-Domäne sie erfordert)
           '-- Agent 7: Build & Test (führt Shell-Befehle aus)
Schritt 3B: high, >500 Src ODER >3200 gesamt: Territory × Dim.  [N+5..7+3H Aufrufe]
           (N Chunks, 5-7 Whole-Diff-Agents, 3 Invariante-Agents
            pro stark umgeschriebener Datei H)
           |-- 1 Chunk-Agent pro ~400 Diff-Zeilen (alle Dimensionen,
           |     nur sein Territory, gibt ein Coverage-Receipt zurück)
           |-- 3 Invariante-Agents pro stark umgeschriebener
           |     Quelldatei (gesamte Datei; State/Timers, Counter/
           |      Returns/Errors, Config/Early-Returns)
           |-- Agent 0: Issue Fidelity      (gesamtes Diff)
           |-- Agent 7: Build & Test        (gesamtes Repo)
           |-- Agent 1b: Removed-behavior   (gesamtes Diff – die
           |     Cross-Chunk-Hälfte; Chunks behalten die lokale Hälfte)
           |-- Agent 1c: Cross-file tracer  (gesamtes Diff)
           |-- Agent 8: Spezialisierte Finder (gesamtes Diff, 0-2)
           '-- Test-Coverage-Matrix         (gesamtes Diff)
Schritt 4:  Deduplizierung --> Sharded Verify (<=8 Ergebnisse je Shard)
            --> Aggregation                  [ceil(F/8) Aufrufe, F=Ergebnisse]
Schritt 5:  Iterativer Reverse-Audit, pro Chunk gefächert;
            Stopp nach 2 aufeinanderfolgenden trockenen Runden (Obergrenze 10/5/3 nach Topologie)
Schritt 6:  Ergebnisse präsentieren + Fazit (high; Low-Durchlauf: nur Ergebnisse)
            Ergebnisse kanonisieren -> .qwen/tmp/...-findings.json
Schritt 6B: Ergebnisse anwenden + pro-Ergebnis Outcomes aufzeichnen (nur --fix)
Schritt 7:  PR-Review einreichen (Inline-Kommentare, falls angefordert; nur high)
Schritt 8:  Report speichern + inkrementeller Cache (Cache: nur high)
Schritt 9:  Aufräumen (Worktree + temporäre Dateien entfernen)
```

Die Schritte 3A/3B/4/5 sind die High-Effort-Pipeline; bei `--effort low|medium` ersetzt ein einzelner Inline-Durchlauf (Schritt 3C) sie.

### Review-Agents

| Agent                             | Fokus                                                                                                                                                                                                                                                                                           |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agent 0: Issue Fidelity           | Nachweise für verknüpfte Issues, Root-Cause-Verantwortung und ob der PR das gemeldete Problem löst                                                                                                                                                                                              |
| Agent 1a: Zeile-für-Zeile-Scan    | Geht jeden Hunk plus dessen umgebende Funktion durch: falsche Bedingungen, Off-by-One, fehlendes `await`, Edge Cases, Race Conditions                                                                                                                                                           |
| Agent 1b: Removed-Behavior-Audit  | Geht jede gelöschte/ersetzte Zeile durch: benennt die Invariante, die sie erzwungen hat, und sucht, wo der neue Code sie wieder herstellt – einschließlich entfernter **Exports**, deren Ersatz oft in einer anderen Datei liegt und stillschweigend einen Standardwert geändert hat. In 3B läuft er über das gesamte Diff (Chunk-Agents behalten die lokale Hälfte) |
| Agent 1c: Cross-File-Tracer       | Verfolgt jeden geänderten Symbol-Aufrufer (Consumer-Richtung) und jede hinzugefügte Feld-Lesestelle (Producer-Richtung) sowie Änderungen an Callee im selben PR                                                                                                                                  |
| Agent 1d: Sprach-Fallstricke-Scan | Trägt die Classic-Footgun-Checkliste für die Sprache des Diffs (`==`-Coercion, Falsy-Wert-Fallen, Loop-Variablen-Capture, mutable Defaults, Nil-Map-Writes, SQL-Konkatenation, DST-Arithmetik) und pattern-matcht jeden Hunk dagegen                                                          |
| Agent 1e: Wrapper/Proxy-Routing   | Für jeden Typ, den der Diff hinzufügt oder ändert und der einen anderen wrapt (Cache, Proxy, Decorator, Adapter): jede Methode routed durch die Wrapped-Instanz, und der Wrapper forwardet jede Methode, die Caller verwenden. Wird nur rostered, wenn der Diff einen Wrapping-Typ signalisiert |
| Agent 2: Security                 | Injection, XSS, SSRF, Auth-Bypass, Offenlegung sensibler Daten                                                                                                                                                                                                                                  |
| Agent 3a: Reuse & Duplication     | Gibt es das im Codebase schon? Greppt nach dem Verhalten, benennt den vorhandenen Helper, der stattdessen aufgerufen werden sollte, und markiert toten Code, den das Diff hinterlässt                                                                                                          |
| Agent 3b: Altitude & Abstraction  | Ist der Fix auf der richtigen Tiefe – oder ein Pflaster auf Shared Infrastructure, eine Downstream-Kompensation für einen Upstream-Bug oder eine Abstraktion, die nur eine Aufrufstelle bedient?                                                                                              |
| Agent 3c: Consistency & Clarity   | Geschwister-Konsistenz (eine Guard, die ein Mitglied einer parallelen Familie hat, aber sein Zwilling nicht), Konventions-Drift gegen ein zitiertes lokales Beispiel, irreführende Namen/Kommentare, unnötige Komplexität                                                                     |
| Agent 4: Performance & Efficiency | N+1-Queries, Memory Leaks, unnötige Re-Renders, Bundle-Größe                                                                                                                                                                                                                                    |
| Agent 5: Test Coverage            | Ungetestete Codepfade im Diff, fehlende Branch-Coverage, schwache Assertions                                                                                                                                                                                                                    |
| Agent 6: Undirected Audit         | 3 parallele Personas (Angreifer / 3am-oncall / Maintainer) – erkennt übergreifende Probleme                                                                                                                                                                                                     |
| Agent 7: Build & Test             | Führt Build- und Testbefehle aus, meldet Fehler                                                                                                                                                                                                                                                  |
| Agent 8: Diff-spezialisierte Finder | 0-2 zusätzliche, pro Review geschriebene Finder, wenn das Diff sich in einer Domäne mit bekannten Fehlermodi konzentriert (Reconnect-Logik, Module-Loader, Scheduler, Codecs)                                                                                                                  |

Die drei Correctness-Agents sind **prozedural**: jeder ist dadurch definiert, wie er das Diff durchläuft (Zeile für Zeile / gelöschte Zeilen / Cross-File-Kanten), nicht durch eine Bug-Taxonomie – ihre Abdeckung ist also komplementär statt überlappend. Zwei weitere dedizierte Blickwinkel (1d/1e) spalten die Sprach-Fallstricke-Checkliste und das Wrapper/Proxy-Routing aus dem Zeile-für-Zeile-Durchlauf ab: ein Checklist-Pattern-Match und eine strukturelle Routing-Erwartung sind unterschiedliche Aufmerksamkeitsmodi, und in den Durchlauf eingebettet wurden sie durch seinen Rhythmus verwässert. Dieselbe Begründung teilt **Codequalität in drei** (3a/3b/3c): ein Agent mit einer sechs Punkte umfassenden Checkliste erledigt einen Punkt – gemessen an einer stark umgeschriebenen Datei, ein Agent mit einer acht Punkte umfassenden Checkliste fand 1 von 5 Defekten, und dasselbe Modell, auf drei Teile aufgeteilt, fand alle 5 – die Qualitäts-Checkliste wird also dort geschnitten, wo die Fragen sich genuinely unterscheiden. Alle Agents laufen parallel (Agent 1 startet 3 prozedurale Varianten und 2 dedizierte Blickwinkel, Agent 3 startet 3 Checklisten-Scheiben und Agent 6 startet 3 Persona-Varianten gleichzeitig, was bis zu 16 parallele Tasks für Same-Repo-PR-Reviews ergibt – Agent 1e läuft nur, wenn der Diff einen Wrapping-Typ signalisiert – plus 0-2 Agent-8-Finder, wenn die Diff-Domäne sie erfordert, also praktisch 15-18; Agent 0 wird bei Local-Diff- und File-Path-Reviews übersprungen, die 14-17 laufen; der Cross-Repo-Lightweight-Modus überspringt auch Agents 1c und 7 und läuft mit 13-16).

Jedes Ergebnis muss ein **Fehlerszenario** angeben – den konkreten Input, State oder Timing, der es auslöst, und das falsche Ergebnis, das daraus folgt (bei Qualitäts-Ergebnissen die konkreten Kosten stattdessen). Ein Ergebnis, das sein Szenario nicht benennen kann, wird an der Quelle verworfen, und die Verifizierung verfolgt das behauptete Szenario durch den echten Code, statt die Prosa des Ergebnisses zu bewerten.

Sobald ein PR mehr als 500 Zeilen **Quellcode**-Änderung enthält – oder mehr als 3 200 Diff-Zeilen insgesamt, ab welcher die fünfzehn Whole-Diff-Leser jeweils zu verdünnt sind, um sorgfältig zu lesen (ein Attention-Limit, kein Versprechen weniger Aufrufe – stark umgeschriebene Dateien und spezialisierte Finder können 3B mehr kosten lassen) – wird dieser Dimension-Fan-out durch einen **Territory × Dimension**-Fan-out ersetzt: das Diff wird in ~400-Zeilen-Chunks aufgeteilt – Grenzen fallen auf Hunk-Grenzen, und ein Hunk, der zu groß ist, wird nur an einer Top-Level-Deklaration geteilt, nie innerhalb einer Funktion – und jeder Chunk bekommt seinen eigenen Agent, der jede Review-Dimension nur auf diesen Chunk anwendet.

Das Gate zählt absichtlich Quellzeilen statt Diff-Zeilen. Testcode, Prosa und Lockfiles dominieren die Diff-Größe – über die letzten 40 gemergten PRs dieses Repos ist das Median-Diff zu 41% Tests – ein Gate auf Rohgröße würde also eine 173-Zeilen-Produktionsänderung in Territorien zerlegen, nur weil sie 489 Zeilen neue Tests mitbringt, wodurch dieser Produktionscode mit einem Reviewer statt vierzehn Linsen auskäme (den Diff-lese-Dimensions-Agenten – sechzehn minus Issue Fidelity und Build & Test). Chunking deckt in beiden Fällen jede Zeile ab, Tests eingeschlossen; was das Gate entscheidet, ist, wie viele Reviewer es gibt und was jeder zu tun hat. Vierzehn Diff-lese-Linsen, die alle ein großes Diff durchgehen, lesen dieselben frühen Hunks vierzehnmal übereinander; ein Agent pro Chunk bedeutet, dass jede Zeile des Diffs genau einen verantwortlichen Reviewer hat. Jeder Chunk-Agent gibt ein `Covered:`-Receipt zurück, und ein Chunk ohne Receipt wird re-reviewt, bevor der Lauf fortfährt – "keine Blocker" kann also niemals über Code gemeldet werden, den niemand gelesen hat.

Eine **Quellcode**-Datei, die größtenteils umgeschrieben wurde (eine bestehende Datei mit 300+ Zeilen, die jetzt zu 40%+ neu ist, oder 800+ geänderte Zeilen hat), bekommt zusätzlich **drei Whole-File-Invariante-Agents**. Test- und generierte Dateien qualifizieren sich nie – die Checkliste fragt nach Feldern, Timern und Fehler-Taxonomien, was eine umgeschriebene Testdatei nicht hat. Ihre Bugs stecken meist nicht in einem einzelnen Hunk, sondern _zwischen_ den neuen Zeilen – ein Timer, der nahe dem Anfang der Datei gesetzt wird, und ein Teardown-Pfad zweitausend Zeilen darunter. Jeder Agent liest die gesamte Post-Change-Datei und geht zwei oder drei Punkte einer festen Checkliste durch: mutable Fields, die auf jedem Exit-Pfad bereinigt werden, Timer, die auf jedem Close abgebrochen werden (und Abbruch, der erfasste Daten nicht verwirft), Map-Inserts, die Deletes entsprechen, Retry-Counter, die bei jedem Entry erhöht werden, Status-Rückgabewerte, die tatsächlich geprüft werden, Error-Codes, die erschöpfend als permanent vs. transient klassifiziert werden, Config-Felder, die auf jedem Pfad beachtet werden, und Early Returns, die einen erforderlichen Side Effect überspringen.

Die Checkliste wird absichtlich auf drei Teile aufgeteilt. Einem Agent alle acht Prüfungen über eine 2 400-Zeilen-Datei zu geben, erledigt eine davon ordentlich; drei Agents mit je zwei oder drei Prüfungen erledigen alle. Chunk-Agents ersetzen das nicht – bei PR #6457 hielten sie jeden dieser Defekte in ihrem zugewiesenen Territory und meldeten keinen. Was ihnen fehlte, waren nicht die Zeilen, sondern die Frage.

Ergebnisse werden in **Sharded Batches** verifiziert (höchstens 8 Ergebnisse pro Verifizierungs-Agent, alle gleichzeitig gestartet). Ein Verifizierer darf ein Critical nur ablehnen, indem er den Code zitiert, der ihm widerspricht (oder wenn die Kommentare des Diffs das markierte Verhalten als absichtlich dokumentieren); alles weniger Sichere wird auf Low Confidence herabgestuft statt gelöscht – ein still verworfenes Critical ist für jede spätere Stufe unsichtbar, während ein herabgestuftes immer noch einen Menschen erreicht. Die Messlatte gilt für die Form jeder Ablehnung: sie muss aus dem Code konstruierbar sein – zitiere die Zeile, die das Ergebnis falsch liest, beweise den behaupteten Zustand als unmöglich aus einem Typ, einer Konstante oder einer Invariante, zitiere die Guard im Diff, die den Trigger abdeckt, oder matche eine reine Stiländerung ohne beobachtbaren Effekt – oder erfülle anderweitig ein Ausschlusskriterium – und "zu spekulativ" ist niemals eines davon. Ein Ergebnis, dessen Fehlerszenario einen Zustand benennt, den der Code nicht ausschließt, ist standardmäßig plausibel: eine Nebenläufigkeits-Race, nil/undefined auf einem seltenen aber erreichbaren Pfad, ein falsy Zero oder eine leere Collection, die als fehlend behandelt wird, ein Off-by-One an einer nicht ausgeschlossenen Grenze, ein Retry-Storm oder ein partieller Ausfall, ein Regex oder eine Allowlist, die einen Anker verloren hat. Eine Ablehnung, die keinen der vier Gründe konstruiert, stuft herab statt zu verwerfen. Nach der Verifizierung sucht ein **iterativer Reverse-Audit** nach Lücken, gefächert mit einem Auditor pro Chunk pro Runde, jeder mit der kumulierten Ergebnisliste. Die Schleife stoppt nach **zwei aufeinanderfolgenden trockenen Runden** (oder bei der Runden-Obergrenze des Plans – so gemeldet statt als Konvergenz). Diese Obergrenze folgt der Diff-Topologie: **10** bei einem kleinen Diff, wo eine Runde ein einzelner Auditor ist; **5** bei einem gechunkten, wo es ein Auditor pro Chunk ist; und **3** bei einem riesigen Diff (≥ 3000 effektive Zeilen) _wenn der Lauf eine Deadline hat_, weil fünf ~90-minütige Runden nicht in eine sechs-Stunden-CI-Obergrenze passen und ein mitten im Flug abgebrochenes Review nichts postet – ohne Deadline behält ein riesiges Diff die gechunkte Obergrenze von 5. Ein Operator kann die jeweils geltende Obergrenze für jedes Review mit der Einstellung `review.reverseAuditRounds` senken; erhöhen kann sie nie. Eine trockene Runde ist kein Beleg für Konvergenz, und Reverse-Audit-Ergebnisse werden wie alle anderen verifiziert.

## Schweregrade

| Schweregrad      | Bedeutung                                                             | Als PR-Kommentar gepostet?      |
| ---------------- | ------------------------------------------------------------------- | ------------------------------- |
| **Critical**     | Muss vor dem Mergen behoben werden (Bugs, Sicherheit, Datenverlust, Build-Fehler) | Ja (nur High-Confidence) |
| **Suggestion**   | Empfohlene Verbesserung                                             | Ja (nur High-Confidence)        |
| **Nice to have** | Optionale Optimierung                                               | Nein (nur Terminal)             |

Low-Confidence-Ergebnisse erscheinen in einem separaten Bereich "Needs Human Review" im Terminal und werden niemals als PR-Kommentare gepostet.

## Worktree-Isolation

Beim Reviewen eines PRs erstellt `/review` einen temporären Git-Worktree (`.qwen/tmp/review-pr-<number>`), anstatt deinen aktuellen Branch zu wechseln. Das bedeutet:

- Dein Working Tree, gestagete Änderungen und der aktuelle Branch werden **niemals angetastet**
- Dependencies werden im Worktree installiert (`npm ci` usw.), damit Build/Test funktionieren
- Build- und Testbefehle laufen isoliert, ohne deinen lokalen Build-Cache zu verunreinigen
- Wenn etwas schiefgeht, ist deine Umgebung nicht betroffen – lösche einfach den Worktree
- Der Worktree wird nach Abschluss des Reviews automatisch aufgeräumt
- Wenn ein Review unterbrochen wird (Strg+C, Crash), räumt das nächste `/review` für denselben PR den veralteten Worktree automatisch auf, bevor es frisch startet. Wenn die unterbrochene Session noch ihr Lease hinterlässt – ein Hard Kill, der das überspringt, oder ein Multi-Prompt-Review, der während eines späteren Prompts unterbrochen wurde – verweigert `/review` und nennt die zu löschende Lease-Datei. Saubere Stops geben sie frei: ein abgeschlossenes Review und die Early-Stops (leeres Diff, keine neuen Changes seit dem letzten Review) führen alle `cleanup` aus, was das Lease freigibt
- Der Worktree ist an seine Session geleast: ein zweites `/review` für einen PR, der bereits reviewed wird, verweigert den Start (nennt den Holder) statt den Worktree des laufenden Reviews abzureißen
- Review-Reports und Cache werden im Hauptprojektverzeichnis gespeichert (nicht im Worktree)
- Schritte, die Code **modifizieren**, um etwas zu messen – die Mutanten der Test-Efficacy-Prüfung und die Prüfung eines spezifischen Ergebnisses durch einen Verifizierer – laufen jeweils in ihrem eigenen Wegwerf-Worktree daneben (`…-probe`, `…-scratch-<agent>`), sodass das Experiment eines Agents für die anderen nicht sichtbar ist, die den gemeinsamen Tree lesen. Als Rückfallebene wird jedem Agent in jeder Welle auch mitgeteilt, welche Pfade (falls überhaupt) sich zum Zeitpunkt seines Starts vom zu reviewenden Commit unterscheiden, und dass ein auf diese Pfade begrenzter Fehler kein Ergebnis ist. All diese Trees werden am Ende des Reviews zusammen mit dem Worktree aufgeräumt.

## Cross-Repo-PR-Review

Du kannst PRs aus anderen Repositories reviewen, indem du die vollständige URL übergibst:

```bash
/review https://github.com/other-org/other-repo/pull/456
```

Dies läuft im **Lightweight-Modus** – kein Worktree, kein Build/Test. Das Review basiert nur auf dem Diff-Text (über die GitHub API abgerufen). PR-Kommentare können weiterhin gepostet werden, wenn du Schreibzugriff hast.

| Funktion                                                            | Same-Repo | Cross-repo                     |
| ------------------------------------------------------------------- | --------- | ------------------------------ |
| LLM-Review (Agents 0, 1a, 1b, 1d, 1e, 2-6 + Verify + iterativer Reverse-Audit) | ✅        | ✅                             |
| Agent 1c: Cross-file tracer                                         | ✅        | ❌ (keine lokale Codebase zum Greppen) |
| Agent 7: Build & Test                                               | ✅        | ❌ (keine lokale Codebase)     |
| Agent 8: Diff-spezialisierte Finder (0-2, wenn die Domäne sie erfordert) | ✅        | ✅ (braucht nur das Diff)        |
| PR-Inline-Kommentare                                                | ✅        | ✅ (bei Schreibzugriff)        |
| Inkrementeller Review-Cache                                         | ✅        | ❌                             |

## PR-Inline-Kommentare

Verwende `--comment`, um Ergebnisse direkt im PR zu posten:

```bash
/review 123 --comment
```

Oder gib nach dem Ausführen von `/review 123` den Befehl `post comments` ein, um die Ergebnisse zu veröffentlichen, ohne das Review erneut auszuführen.

**Was gepostet wird:**

- High-Confidence-Ergebnisse der Schweregrade Critical und Suggestion als Inline-Kommentare in bestimmten Zeilen, jeweils mit `**[Critical]**` oder `**[Suggestion]**` vorangestellt, sodass Blocker von Empfehlungen unterscheidbar sind
- Wenn der Fix ein einzelner lokaler Edit ist, ein ` ```suggestion `-Block, den du mit einem Klick anwenden kannst
- Bei Approve/Request-Changes-Fazit: eine Review-Zusammenfassung mit dem Fazit
- Bei Comment-Fazit, wenn alle Inline-Kommentare gepostet wurden: keine separate Zusammenfassung (Inline-Kommentare sind ausreichend)
- Modell- und CLI-Versionszuordnungs-Footer in jedem Kommentar (z. B. _— qwen3-coder via Qwen Code /review (v0.21.2)_); setze `review.attribution` auf `false` in deiner User- oder System-`settings.json` (die Workspace-`.qwen/settings.json` wird für `review.*`-Einstellungen ignoriert), um ohne ihn zu posten – Kommentare und Body-Listen verlieren dann auch die `**[Critical]**`/`**[Suggestion]**`-Schweregrad-Marker, und das Modell wird vom Machine-Ledger-Marker des Reviews zurückgehalten, sodass in frischen Umgebungen (kein Review-Cache) der wiederhergestellte inkrementelle Anker die Same-Model-Prüfung fehlschlagen lässt und das Re-Review auf Full-Range zurückfällt

**Was nur im Terminal bleibt:**

- Nice-to-have-Ergebnisse
- Low-Confidence-Ergebnisse

**Selbst erstellte PRs:** GitHub erlaubt es nicht, `APPROVE`- oder `REQUEST_CHANGES`-Reviews für deine eigenen Pull Requests einzureichen – beide schlagen mit HTTP 422 fehl. Wenn `/review` erkennt, dass der PR-Autor mit dem aktuell authentifizierten Benutzer übereinstimmt, stuft es das API-Event unabhängig vom Fazit automatisch auf `COMMENT` herab, sodass die Einreichung trotzdem erfolgreich ist. Das Terminal zeigt weiterhin das ehrliche Fazit ("Approve" / "Request changes" / "Comment") – nur das GitHub-seitige Review-Event wird neutralisiert. Die eigentlichen Ergebnisse erscheinen weiterhin als Inline-Kommentare in bestimmten Zeilen, sodass das substanzielle Feedback unverändert bleibt.

**Erneutes Reviewen eines PRs mit vorherigen Qwen Code-Kommentaren:** Wenn `/review` für einen PR ausgeführt wird, der bereits frühere Qwen Code-Review-Kommentare enthält, klassifiziert es diese, bevor neue gepostet werden. Nur **Überlappungen in derselben Zeile** (ein vorhandener Kommentar in derselben `(path, line)` wie ein neues Ergebnis) fordern dich zur Bestätigung auf – das ist der Fall, in dem du ein visuelles Duplikat in derselben Codezeile sehen würdest. Kommentare aus älteren Commits, beantwortete Kommentare (werden als gelöst betrachtet) und Kommentare, die sich einfach nicht mit einem neuen Ergebnis überschneiden, werden stillschweigend übersprungen, mit einer Terminal-Logzeile, damit du weißt, was gefiltert wurde.

**CI-/Build-Statusprüfung vor APPROVE:** Wenn das Fazit "Approve" ist, fragt `/review` die Check-Runs und Commit-Statuses des PRs vor der Einreichung ab. Wenn ein Check fehlgeschlagen ist (oder alle Checks noch ausstehen), wird das API-Event automatisch von `APPROVE` auf `COMMENT` herabgestuft, wobei der Review-Body erklärt, warum. Begründung: Das LLM-Review liest Code statisch und kann Laufzeit-Testfehler nicht sehen; ein Approve bei rotem CI wäre irreführend. Die Inline-Ergebnisse werden weiterhin unverändert gepostet. Wenn du trotzdem approven möchtest (z. B. bei einem bekannten flaky CI-Fehler), reiche die GitHub-Genehmigung nach der Überprüfung manuell ein.

## Ergebnisse anwenden (`--fix`)

`--fix` ist `--comment` gespiegelt. `--comment` schreibt in einen **Pull Request**, braucht also einen; `--fix` schreibt in einen **Working Tree**, braucht also einen, der das Review überlebt:

```bash
/review --fix                 # lokale uncommitted Änderungen
/review src/auth.ts --fix     # eine einzelne Datei
```

Bei einem **PR-Ziel wird es mit einer Warnung ignoriert** – ein PR-Review läuft in einem ephemeren Worktree, der gelöscht wird, wenn das Review endet, also werden "behobene" Edits dort Minuten später verworfen. Verwende stattdessen `--comment`, um die Ergebnisse zu veröffentlichen.

Ein wirksames `--fix` **setzt den Effort auf mindestens medium**, weil es deine Dateien editiert und `low` keine Verifizierung durchführt: ein unverifiziertes Ergebnis anzuwenden ist derselbe Fehler wie eines zu posten, nur auf deinen Working Tree statt auf jemandes PR. Es erzwingt nicht `high` – mediums Ergebnisse sind verifiziert, und der Reverse-Audit, den `high` hinzufügt, sucht nach _fehlenden_ Ergebnissen, was nicht das ist, worauf es bei der Entscheidung ankommt, ob eines angewendet wird.

Nach dem Review wird jedes Ergebnis mit dem `edit`-Tool angewendet und dann **abgerechnet**, auf eine von drei Arten:

| Outcome            | Bedeutung                                              | Liegt bei dir? |
| ------------------ | ------------------------------------------------------ | -------------- |
| `fixed`            | Der Edit ist in deinem Tree                            | Nein           |
| `skipped`          | Echt, nicht angewendet – der Grund wird daneben gemeldet | Ja             |
| `no_change_needed` | Das Ergebnis war falsch, oder der Code hat es bereits behandelt | Nein    |

Ein Ergebnis wird übersprungen, wenn sein Fix beabsichtigtes Verhalten ändern würde, Änderungen weit außerhalb des reviewten Diffs erfordern würde oder sich bei zweitem Hinsehen als False Positive herausstellt.

**Jedes Ergebnis bekommt ein Outcome, und das wird erzwungen statt nur angefordert.** Der Ledger läuft über `qwen review findings --outcomes`, das eine Menge verweigert, die nicht alle abdeckt – ein Fixer, der sechs von neun Ergebnissen anwendet und sechs meldet, hat über keines gelogen, er hat die Liste still verkürzt, und du hättest keine Möglichkeit, die drei zu sehen, die herausgefallen sind.

## Review fortsetzen (`--resume`)

Ein langes Review, das unterwegs abbricht – eine abgebrochene Verbindung, ein Timeout, ein gekilltes Terminal – hinterlässt alles, was es getan hat, auf der Festplatte: den Worktree, das erfasste Diff und die eigene Aufzeichnung des Harness über jeden ausgeführten Agenten. `--resume` setzt dort fort, statt von vorne zu beginnen:

```bash
/review 123 --resume
```

Es gilt **nur für PR-Targets** (das Diff eines lokalen Reviews kommt von einem live Working Tree, der keinen stabilen unterbrochenen Zustand zum Fortsetzen hat), und es kann jederzeit bedenkenlos übergeben werden: das Review prüft den Zustand auf der Festplatte selbst – der Worktree noch beim gefetchten Commit und clean, das erfasste Diff Byte für Byte unverändert, der PR-Head unbewegt, das Resume-Limit nicht aufgebraucht – und startet stillschweigend frisch, wenn etwas nicht mehr übereinstimmt, und sagt dir, welche Prüfung abgelehnt hat. Eine Fortsetzung verwendet die zertifizierten Agent-Ergebnisse des vorherigen Versuchs wieder, sodass der Report angibt, wie viele wiederhergestellt wurden; es wird offengelegt, niemals eine Coverage-Lücke.

Zwei Dinge zu wissen. Mit nur dem eingebauten Ziel-Default behält eine Fortsetzung den aufgezeichneten **Effort** des unterbrochenen Laufs. Ein explizites `--effort`, eine im Projekt gespeicherte Stufe, die Operator-Einstellung `review.effort` oder ein wirksames `--comment` liefert eine erforderliche Stufe; weicht sie vom unterbrochenen Lauf ab, wird das Resume verweigert und ein frischer Lauf startet auf dieser Stufe, weil anderer Effort andere Arbeit ist. Und wenn der PR-Head während der Ausfallzeit des Reviews gewandert ist, verweigert das Resume (`head-moved`) und der frische Lauf reviewed die neuen Commits – was du willst, und es zählt als der eine Neustart dieses Reviews.

## Ergebnisse als Daten

Bestätigte Ergebnisse werden in `.qwen/tmp/qwen-review-<target>-findings.json` kanonisiert, bevor etwas anderes sie konsumiert – der Terminal-Report, der gespeicherte Markdown-Report und das PR-Review-JSON lesen alle dasselbe Artefakt statt die Liste neu zu tippen. Jedes Ergebnis trägt eine eindeutige `id` (worauf Outcomes und Resolved-Anker joinen), `severity`, `confidence`, `source`, `summary`, ein `shortSummary` auf 60 Zeichen begrenzt für List-Rendering, `failureScenario` und einen oder mehrere `locations` – ein Pattern-aggregiertes Ergebnis behält **einen Ort pro Vorkommen**, sodass jedes seinen eigenen Inline-Kommentar bekommt.

**Ganz zuerst prüft das Review, dass es deinen Code ausführt.** Jeder `qwen review …`-Schritt führt das gebaute Bundle aus, nicht den Working Tree, sodass ein seit dem letzten Build editierter Review-Befehl keine Wirkung hat und der Lauf das alte Verhalten misst. Der Build zeichnet einen Digest der Review-Quellen auf, die er gebündelt hat; `parse-args` leitet ihn erneut ab und vergleicht, und `drive` prüft noch einmal, weil das Verifier-Brief die Agents direkt dorthin schickt ohne Schritt 1. Bei einer Abweichung steht auf stderr, dass das Bundle nicht aus diesen Quellen gebaut wurde, und wie man neu baut. Die Prüfung läuft, wenn der CLI auf das gebündelte `dist/cli.js` aufgelöst wird (das `qwen`-Binary oder `node dist/cli.js`); Launcher die ungebundleter Output ausführen, wie `npm start` und `npm run dev`, überspringen sie. Zwei Fälle, die nicht verglichen werden können, werden unterschiedlich behandelt: ein Checkout, dessen Build vor der Aufzeichnung liegt, bekommt mitgeteilt, dass die Prüfung nicht laufen konnte und warum, und ein installiertes Paket – das keine Quellen hat, von denen es sich unterscheiden könnte – wird stillschweigend übergangen. Der Digest umfasst die Review-Befehle, die Datei, die sie registriert, das Review-only-Lease, das sie von außerhalb ihres Verzeichnisses importieren, und das gebündelte Review-Skill; er folgt nicht denen in die gemeinsamen Helper, die sie importieren, also bedeutet ein stiller Lauf, dass der Review-Code dem Bundle entspricht, nicht dass der gesamte Tree es tut.

**Ein Critical, das im Base-Tree bereits fehlgeschlagen ist, wird zurückgehalten, nicht eingereicht.** Wenn ein Testbefehl fehlgeschlagen ist und die Merge-Basis gebaut werden konnte, zeichnet `test-delta` auf, welche fehlschlagenden Dateien auch ohne den Pull Request fehlschlagen. Die Kanonisierung liest diese Messung zurück (`qwen review findings --test-delta`, neben `--outcomes`): ein Critical, dessen eigener Text eine dieser Dateien nennt, wird auf eine Suggestion herabgestuft, behält seine Beweise, erhält die Messung, die es herabgestuft hat, und ein `heldByMeasurement`-Feld, und die Herabstufung wird angekündigt. Ein Test, der bereits rot war, ist kein Test, den dieser Pull Request rot macht – und wenn er jetzt aus einem _neuen_ Grund fehlschlägt, nenne welchen Test, zitiere beide Seiten, und reiche es wieder als Critical ein: ein Ergebnis, das bereits die Messung trägt und trotzdem heraufgestuft wird, bleibt wo du es platziert hast.

Der Befehl validiert beim Schreiben: eine doppelte ID, ein Ergebnis ohne Fehlerszenario, ein leeres Locations-Array oder ein unbekannter Schweregrad sind ein Fehler statt ein still verstümmelter Eintrag.

## Beweisbilder in PR-Kommentaren

Die GitHub-API kann keine Bilder an Review-Kommentare anhängen, daher kann `/review` Beweisbilder (TUI-Screenshots, Vergleiche gerenderter Ausgaben) in einem von dir bestimmten Repository hosten und sie per URL einbetten:

```bash
export QWEN_REVIEW_ASSETS_REPO=your-org/your-repo   # ein Repo, in das du pushen kannst
/review 123 --comment
```

Maintainer richten es typischerweise auf das zu reviewende Repo aus; alle anderen können einen Fork oder ein Scratch-Repo verwenden. Bilder landen auf dem `pr-assets/<pr>-review`-Branch mit Content-gehashten Namen, und Kommentare referenzieren sie über **Commit-gepinnte** URLs – unveränderlich, selbst wenn der Branch sich später bewegt, und unverändert funktional auf GitHub Enterprise.

Für GitHub-getriggerte Reviews (der PR-Review-Workflow) wird dieselbe Variable aus einer **Repository-Variable** desselben Namens gespeist: ohne gesetzte Variable übergibt der Workflow einen leeren Wert und das Veröffentlichen verweigert – nichts ändert sich. Ein Maintainer, der `QWEN_REVIEW_ASSETS_REPO` in den Actions-Variablen des Repos setzt (typischerweise auf das Repository selbst), ermöglicht es Review-Kommentaren, Capture-PNGs einzubetten; die Branches, die er schreibt, werden vom Visuals-Cleanup-Workflow aufgeräumt, wenn die Variable auf dasselbe Repository zeigt, während ein Fork oder Scratch-Ziel seine eigene Retention verwaltet.

Die Veröffentlichung ist genau wie das Posten gated: kein designiertes Repo bedeutet kein Veröffentlichen, und ein unautorisierter Lauf (kein wirksames `--comment`) wird genauso verweigert wie `submit`. Nur Bildtypen werden akzeptiert (SVG wird absichtlich ausgeschlossen), mit Größenlimits, und die Bytes jeder Datei müssen zum Format ihrer Extension passen – falsch gekennzeichnete oder nicht erkannte Inhalte werden abgelehnt. Ein Manifest zeichnet jede gepushte Datei auf. Ohne Designation behalten Ergebnisse ihre Beweise als lokale Dateipfade im Terminal und im gespeicherten Report – nichts bricht, Kommentare bleiben nur textbasiert.

## Folgeaktionen

Nach dem Review erscheinen kontextbezogene Tipps als Ghost-Text. Drücke Tab, um sie zu akzeptieren:

| Status nach dem Review                 | Tipp                | Was passiert                            |
| -------------------------------------- | ------------------- | --------------------------------------- |
| Lokales Review, `--fix` nicht übergeben | `fix these issues` | LLM behebt jedes Ergebnis interaktiv    |
| PR-Review mit Ergebnissen              | `post comments`     | Postet PR-Inline-Kommentare (kein erneutes Review) |
| PR-Review, keine Ergebnisse            | `post comments`     | Approved den PR auf GitHub (LGTM)       |
| Lokales Review, alles sauber           | `commit`            | Committet deine Änderungen              |

Hinweis: `fix these issues` ist nur für lokale Reviews verfügbar, aus demselben Grund wie `--fix` – bei PR-Reviews wird der Worktree nach dem Review aufgeräumt, daher ist ein interaktives Beheben nach dem Review nicht möglich – verwende stattdessen `--comment` oder `post comments`, um die Ergebnisse zu veröffentlichen. Wenn `--fix` übergeben wurde, tragen die Ergebnisse bereits Outcomes und es wird kein Fix-Tipp angeboten.

## Projekt-Review-Regeln

Du kannst die Review-Kriterien pro Projekt anpassen. `/review` liest Regeln aus diesen Dateien (in dieser Reihenfolge):

1. `.qwen/review-rules.md` (Qwen Code native)
2. `.github/copilot-instructions.md` (bevorzugt) oder `copilot-instructions.md` (Fallback – nur eine wird geladen, nicht beide)
3. `AGENTS.md` — Abschnitt `## Code Review`
4. `QWEN.md` — Abschnitt `## Code Review`

Regeln werden den LLM-Review-Agents (0-6) als zusätzliche Kriterien injiziert. Bei PR-Reviews werden die Regeln aus dem **Base-Branch** gelesen, um zu verhindern, dass ein bösartiger PR Bypass-Regeln injiziert.

## Repository-Kontext

Repositories können den Reviewern abgegrenzte, repository-spezifische Hinweise geben, indem sie ein striktes JSON-Manifest unter `.qwen/review-context.json` committen. Bei medium oder high Effort liest `/review` das Manifest nach dem Erfassen des Plans und hängt die passenden Hinweise an, bevor ein Agent startet:

```json
{
  "version": 1,
  "label": "Example repository",
  "rules": [
    {
      "paths": ["packages/*/src/**"],
      "domains": ["runtime"],
      "relatedPaths": ["packages/runtime/src/**"],
      "recommendedTests": ["npm run test:runtime"],
      "requiredConfigurations": ["debug"],
      "requiredAgents": ["test-matrix"],
      "unverifiedDimensions": ["Alternate runtime was not exercised"],
      "verificationNotes": ["Use the repository native test runner"]
    }
  ]
}
```

Eine Regel gilt, wenn eine geänderte Datei auf einen ihrer `paths`-Globs passt (`*`, `?` und `**`-Segmente; case-sensitive). Alle passenden Regeln führen ihre Hinweise zusammen: Domains und zugehörige Dateien für die Review-Agents, empfohlene Tests und erforderliche Konfigurationen für den Build-and-Test-Agenten, zusätzliche Reviewer-Rollen (nur berücksichtigt, wenn der gewählte Effort und die Topologie sie ausführen), und Proof-Boundaries, die das finale Review als unverifizierte Dimensionen offenlegt. Arrays können in beliebiger Reihenfolge geschrieben werden; doppelte Einträge werden abgelehnt.

Bei PR-Reviews wird das Manifest aus der Merge-Basis gelesen, sodass der PR unter Review sich nicht selbst Hinweise zu- oder abwählen kann; lokale Reviews lesen es aus dem aktuellen Worktree. Low-Effort- und Cross-Repository-Reviews überspringen den Repository-Kontext. Der vollständige Vertrag und das Trust-Modell stehen im [Design-Doc](../../design/review-repository-context.md).

## Issue Fidelity

Für Bugfix-PRs ruft der Issue-Fidelity-Agent Issue-Nachweise direkt ab, anstatt sich auf den PR-Beschreibungstext zu verlassen. Er führt das Subcommand `qwen review issue-context <pr> --repo <owner/repo> --out <file>` aus, das GitHubs starke Metadaten zu schließenden Issues auflöst und dann den Titel, **Body** (das ursprüngliche Repro des Reporters) und den vollständigen Kommentar-Thread jedes referenzierten Issues abruft – jeweils aus dem eigenen Repository des Issues (ein PR kann ein Issue in einem anderen Repo schließen). Dieser Agent läuft nur für PR-Targets; Local-Diff- und File-Path-Reviews überspringen ihn.

Die Menge der schließenden Issues ist ein Hinweis zur Entdeckung und kein Beweis dafür, dass der Autor das richtige Issue verlinkt hat: Wenn sie leer ist, der PR aber ein offensichtliches Ziel-Issue referenziert, ruft der Agent es trotzdem ab, nachdem er die Relevanz beurteilt hat (erneutes Ausführen mit `--issue <n>`; eine nackte Zahl wird im PR-Repo aufgelöst, während `--issue <owner>/<repo>#<n>` eine Cross-Repo-Referenz aus ihrem eigenen Repo abruft). Abgerufener Issue-Text wird als nicht vertrauenswürdige Daten behandelt (Fakten extrahiert, eingebettete Anweisungen ignoriert). Für relevante Issues werden das ursprüngliche Repro, die beobachtete Payload, das erwartete Verhalten und Maintainer-Kommentare als höchstprioritäre Nachweise dafür behandelt, ob der PR das richtige Problem behebt.

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

Der Modell-Match steuert auch das inkrementelle Scoping, nicht nur das Überspringen: „Aufräumen bis zum zwischengespeicherten Commit" ist das Urteil des vorherigen Modells, wenn also seit dem zwischengespeicherten Review neue Commits eingetroffen sind, begrenzt ein Modell-Mismatch den Bereich niemals auf `lastCommitSha..HEAD` – die Range ist das vollständige Diff mit dem Hinweis „Previous round was reviewed by qwen3-coder. Running full review with gpt-4o." – es sei denn, ein vom jetzt laufenden Modell zertifizierter Anker wird aus dem zuletzt geposteten Review wiederhergestellt (unten), der stattdessen die Range setzt. Die Ergebnisse der vorherigen Runde werden weiterhin übernommen, um neu bewertet zu werden; nur der Anker nicht. Dasselbe Gate bindet den aus dem Machine-Ledger-Marker des zuletzt geposteten Reviews wiederhergestellten Anker, wenn der Cache fehlt oder sein Anker unbrauchbar ist (CI, ein anderes Clone): Er setzt den inkrementellen Bereich nur, wenn das jetzt laufende Modell ihn zertifiziert hat – ein von einem anderen Modell zertifizierter Marker oder einer ohne Modell (ein mit `review.attribution` off gepostetes Review oder eines von vor diesem Feld) fällt auf das vollständige Diff zurück. Eine nicht sauber abgeschlossene Runde postet ihren Marker ohne Anker (sie kann keine Range zertifizieren), aber dieser Verlust ist nicht klebrig, wenn die Arbeitsliste der Runde vollständig überlebt hat: die Recovery pflanzt den Anker vom jüngsten früheren Marker fort, den dein eigener Account mit einem gepostet hat, sodass eine einzelne nicht-saubere Runde nicht mehr jede spätere Runde zwingt, das vollständige Diff neu zu lesen – die nächste Runde scoped `anchor..HEAD`, was die Range abdeckt, die die nicht-saubere Runde nicht zertifizieren konnte. Das Graft einer größenbegrenzten Runde wird abgelehnt (weggefallene Ergebnisse würden außerhalb des gegrafteten Scopes liegen und still in Rente gehen), sodass spätere Runden weiterhin das vollständige Diff neu lesen, bis ein vollständiger Marker landet.

Der Cache wird in `.qwen/review-cache/` gespeichert und verfolgt sowohl die Commit-SHA als auch die Modell-ID. Stelle sicher, dass dieses Verzeichnis in deiner `.gitignore` enthalten ist (eine allgemeinere Regel wie `.qwen/*` funktioniert ebenfalls). Auf GitHub, wenn der zwischengespeicherte Commit durch ein Rebase oder Force-Push entfernt wurde, wird auf ein vollständiges Review zurückgegriffen; Aone regelt den zwischengespeicherten Anker anders – siehe dessen Absatz unten. Nur High-Effort-Reviews konsultieren oder schreiben den Cache – ein `--effort low|medium` Quick-Pass gilt nie als "bereits reviewt".

## Review-Berichte

Bei Same-Repo-Reviews werden die Ergebnisse als Markdown-Datei im `.qwen/reviews/`-Verzeichnis deines Projekts gespeichert (bei Cross-Repo Lightweight-Reviews wird auf die Persistierung der Berichte verzichtet):

```
.qwen/reviews/2026-04-06-143022-pr-123.md
.qwen/reviews/2026-04-06-150510-local.md
```

Berichte enthalten: Zeitstempel, Diff-Statistiken, Build-/Testergebnisse, alle Befunde mit Verifizierungsstatus und das Fazit. Abschnittsnamen und beschreibende Prosa folgen der Output-Spracheinstellung; technische Identifier (SHAs, Dateipfade, Gate-Namen, Ergebnis-IDs) bleiben wortwörtlich.

Medium- und High-Effort-Reviews speichern zusätzlich einen strukturierten JSON-Begleiter mit demselben Stem (zum Beispiel `2026-04-06-143022-pr-123.json`), der die kanonischen Ergebnisse und das komponierte Fazit als Daten enthält. Qwen Codes WebShell rendert dieses Dokument als interaktive Review-Ansicht mit filterbaren Ergebnissen; der Markdown-Bericht bleibt das menschenlesbare Archiv.

Die deterministischen Hälften der Pipeline – Argument-Parsing (`qwen review parse-args`) und die Event/Body-Entscheidung (`qwen review compose-review`) – sind getestete Subcommands statt Prompt-Text, also sind `--effort`-Grammatik, `--comment`-Erzwingung, Fazit-Deckelungen und Herabstufungsverhalten durch Unit-Tests fixiert und können nicht mit dem Modell driften.

**GitHub Enterprise:** Das Reviewen einer PR-URL auf einem Nicht-`github.com`-Host routet jeden GitHub-Aufruf an diesen Host – die Review-Subcommands (`match-remote`, `meta`, `fetch-pr`, `pr-context`, `comment-status`, `issue-context`, `fetch-diff`, `comment-body`, `plan-diff`, `test-plan`, `presubmit`, `compose-review`, `submit`, `publish-assets`) akzeptieren `--host` und setzen ihn im Code, sodass ein vergessener Host das Review nicht stillschweigend auf `github.com` umleiten kann.

**Aone Code:** Für einen Clone, dessen Origin auf `gitlab.alibaba-inc.com` liegt, führe `/review` innerhalb dieses Clones aus – die Plattform wird aus der Remote erkannt und die Subcommands funktionieren, unterstützt von der `a1`-CLI (mindestens 0.1.90 – eine ältere Installation wird zum Authentifizierungszeitpunkt mit einer Upgrade-Meldung abgelehnt) – die Zielnummer ist die globale MR-ID. `fetch-pr` holt `refs/merge-requests/<id>/head` und baut den Worktree + Diff, sodass das Agent-Review des Worktrees unverändert bleibt, und `test-plan` funktioniert ebenfalls – es liest die MR-Beschreibung über denselben Reader. `pr-context` ist ebenfalls a1-gestützt: es liest die MR-Metadaten, Diskussionsthreads und zuvor gepostete Qwen-Zusammenfassungen (das Machine Ledger stellt sie aus ihnen wieder her), sodass ein Aone-Lauf die bestehende Diskussion des MRs genauso sieht wie ein GitHub-Lauf die eines PRs. `comment-status` und `presubmit` sind ebenfalls a1-gestützt (presubmit vollständig: Self-PR-Erkennung, Head-Drift, Merge-Gate-CI und Existing-Comment-Dedup), sodass wiederholte `--comment`-Runden gegen die bestehenden Kommentare des MRs deduplizieren statt sie erneut zu posten (ein Thread, den die Plattform als veraltet markiert – seine Zeile nach einem Amend nicht mehr mappt – bleibt erneut postbar), und Self-PR-Erkennung funktioniert ebenfalls. Der `publish-assets`-Schreibvorgang wird übersprungen. `--comment` **postet** das Review über die `a1`-CLI: ein Kommentar pro Inline-Ergebnis, dann der Summary-Kommentar. Aone hat keinen nativen Request-Changes-Status – bei diesem Fazit trägt der Summary-Kommentar einen blockierenden Header, und tatsächlich gepostete Inline-Criticals blockieren den Merge über das Discussion-Gate, während ihre Discussions unresolved bleiben (wenn kein Inline-Critical gepostet wurde, ist der Header nur beratend und nichts blockiert den Merge mechanisch). Die geposteten Kommentare tragen kein AI-Comment-Flag – `a1` kann keines setzen – sodass ein dedizierter `ai_comment`-Merge-Gate des Repos sie nicht verfolgt. Das native `a1 repo mr approve` feuert für ein Approve-Fazit, wenn der Lauf den MR-Kontext gelesen hat (dasselbe Gate wie GitHub; ein Lauf ohne Kontext bleibt auf Comment gedeckelt). Inkrementelles Re-Review folgt dem AGit-Flow-Update-Modell: ein Update AMENDT den einzelnen CR-Commit an Ort und Stelle, wodurch der Head, den die vorherige Runde reviewt hat, verwaist – sodass der zwischengespeicherte Anker OHNE Abstammung geregelt wird (der Anchor-behind-head-Test würde für jedes Update fehlschlagen), und das Re-Review scope-t das PR-eigene Diff auf die Dateien, die das Update berührt hat, statt auf ein vollständiges Review zurückzufallen; ein Update, das auch auf neueres Master rebased hat, behält diesen Scope nur, solange der Drift des Rebase innerhalb der CR-Dateien bleibt – Drift, die jede andere Datei berührt, fällt auf das vollständige Review zurück, und kein Drift-Byte gelangt sowieso in den veröffentlichten Scope. Siehe `docs/design/2026-08-15-review-aone-provider.md`.

Jeder Lauf endet mit einer maschinenlesbaren Zeile (`Review complete: <target> — <disposition>`), sodass Skripte und CI-Wrapper Completion und Ergebnis mit einem einzigen `^Review complete: `-Match erkennen können.

## Headless-Runs (`qwen review run`)

`/review` ist interaktiv. Wenn ein Skript oder CI-Job ein Review ausführen und auf dessen Ergebnis reagieren muss, verwende den Headless-Wrapper:

```bash
qwen review run [target] [--json] [--fail-on request-changes] [--comment] [--resume] [--quiet]
```

`target` ist eine PR-Nummer, eine PR-URL oder ein Dateipfad; lass es weg, um das lokale Working Tree zu reviewen. Der Befehl führt den eigenen CLI dieses Builds nicht-interaktiv aus (mit geschlossener Stdin, sodass Slash-Command-Erkennung überlebt), streamt den Fortschritt des Childs nach **stderr** und gibt das Fazit nach **stdout** aus – oder, mit `--json`, das vollständige Ergebnisobjekt. Das Fazit wird aus dem Artefakt gelesen, das `compose-review` schreibt (dasselbe JSON, das der Skill als Fazit-Autorität behandelt), niemals aus der Prosa des Modells geparst.

Der Exit-Code ist der Vertrag, den ein Gate lesen sollte:

| Exit | Bedeutung                                                                                           |
| ---- | ------------------------------------------------------------------------------------------------- |
| `0`  | Das Review wurde abgeschlossen (unabhängig davon, was es entschieden hat)                           |
| `1`  | Es kam nie zu einem Fazit – das Child schlug fehl, hatte einen Timeout oder hinterließ kein komponiertes Artefakt |
| `3`  | Es wurde mit `REQUEST_CHANGES` abgeschlossen **und** `--fail-on request-changes` war gesetzt (opt-in Blocking) |

`3` (nicht `2`) ermöglicht es einem Gate, "das Review blockiert" von "das Tool ist kaputt" zu unterscheiden – yargs verwendet bereits `1` für Usage-Errors – ohne Ausgabe zu parsen. `--timeout-minutes` (Standard 120, Untergrenze 1) beendet ein hängendes Review und exitet `1`, und das Abbrechen des Befehls (Strg+C / SIGTERM) beendet die Prozessgruppe des Reviews statt sie zu verwaisen.

`--resume` setzt ein unterbrochenes Review desselben PRs fort, statt von vorne zu beginnen – wenn ein langer lokaler Lauf unterwegs abbricht (eine abgebrochene Verbindung, ein Timeout, ein gekilltes Terminal), würde der Retry andernfalls erneut fetchen, erneut chunken und Agents erneut starten, deren Arbeit bereits auf der Festplatte liegt. Es kann bedenkenlos bei einem Retry übergeben werden: `fetch-pr` prüft den Zustand auf der Festplatte selbst (Worktree noch beim gefetchten SHA und clean, Diff-Bytes unverändert, PR-Head unbewegt, Resume-Obergrenze nicht aufgebraucht) und fällt stillschweigend auf ein frisches Review zurück, wenn etwas nicht mehr übereinstimmt, sodass der Flag niemals einen Run fehlschlagen lässt, der von vorne beginnen könnte. Wenn der aktuelle Aufruf nur das eingebaute Ziel-Default hat, bleibt eine Fortsetzung auf den aufgezeichneten Effort des unterbrochenen Laufs festgelegt. Ein explizites `--effort`, eine im Projekt gespeicherte Stufe, die Operator-Einstellung `review.effort` oder ein wirksames `--comment` liefert eine erforderliche Stufe; ein Mismatch verweigert das Resume und läuft frisch auf dieser Stufe. Nur PR-Targets (das Diff eines lokalen Reviews wird von einem live Working Tree erfasst, der keinen stabilen unterbrochenen Zustand zum Fortsetzen hat). Resume ist eine **lokale Bequemlichkeit**: der CI-Review-Workflow des Repositories selbst setzt **nicht** fort – jeder Retry läuft frisch, weil ein CI-Versuch No-Sandbox läuft und sein Worktree beim Exit gelöscht wird, sodass kein unterbrochener Zustand zum Fortsetzen bleibt.

Ein laufzeitbudgetierter Run kann auch eine **weiche** Deadline exportieren, sodass das Review seine Open-End-Reverse-Audit-Schleife stoppt, während noch Zeit zum Verifizieren, Komponieren und Posten bleibt: `QWEN_REVIEW_DEADLINE_EPOCH` ist der Unix-Sekunden-Moment, zu dem der Run gekillt wird, und `QWEN_REVIEW_DEADLINE_RESERVE_SECONDS` (Standard 3600; `0` behält nur die Runden-Schätzung) ist das Tail, das für die Verifizierung der letzten Runde, `compose-review` und Submission verbleiben muss. Wenn das verbleibende Budget keine weitere Runde plus dieses Tail mehr fasst, weigert sich der Round-Builder, sie zu bauen, und das komponierte Fazit legt den gekürzten Audit offen (ein sonstiges Approve-Fazit wird auf Comment gedeckelt). Eine fehlende oder fehlerhafte Deadline lässt das Review ungegated – der äußere Timeout begrenzt den Lauf weiterhin.

Verschachtelt in dieser Reserve liegt eine kleinere **Compose Floor**, `QWEN_REVIEW_DEADLINE_COMPOSE_FLOOR_SECONDS` (Standard 1200; `0` deaktiviert diese Barriere vollständig, an jedem Punkt einschließlich nach Ablauf der Deadline). Die Reserve ist eine Zahl für "Verifizierung der letzten Runde **plus** Komposition **plus** Submission", was für ein normales Per-Finding-Re-Trace ausreicht, aber nicht für ein Security-Review, dessen Verifizierung reale Dateisystem-/Git-Workloads ohne Begrenzung erneut ausführt. Daher wird der Verifizierer – nicht der Round-Builder – durch diese Floor begrenzt: sobald die Floor oder weniger verbleibt, weigert sich `agent-prompt --role verify` zu bauen (eine `VERIFY BUDGET:`-Zeile, Exit **4**), die vorhandenen Ergebnisse behalten ihren unverifizierten Tag (was das Fazit deckelt), und `compose-review` und Submission laufen. Die Floor liegt strikt unterhalb der Reserve, sodass ein gesunder Lauf zuerst auf das Reverse-Audit-Gate trifft und sie nie erreicht; sie ist die Absicherung für die Spanne, die die Reserve nicht begrenzen kann.

## Dateiübergreifende Auswirkungsanalyse

Ein dedizierter Cross-File-Tracer (Agent 1c) übernimmt diesen Durchlauf end-to-end. Wenn Codeänderungen exportierte Funktionen, Klassen oder Interfaces modifizieren, sucht er nach allen Aufrufern und prüft die Kompatibilität:

- Änderungen der Parameteranzahl/des Parametertyps
- Änderungen des Rückgabetyps
- Entfernte oder umbenannte öffentliche Methoden
- Breaking API-Änderungen

Er verfolgt auch die **Producer-Richtung**: jedes Feld, jede Option oder jeder optionale Parameter, den das Diff hinzufügt, wird zu seinen Lesestellen verfolgt – einschließlich Dateien, die das Diff nie berührt. Ein lebender Codepfad, der ein Feld liest, das nichts befüllt, bedeutet, dass das Feature, das es gated, stillschweigend nichts tut, und das wird als Critical an der Lesestelle gemeldet.

Bei großen Diffs (>10 modifizierte Symbole) priorisiert die Caller-Richtungs-Analyse Funktionen mit Signaturänderungen; die Producer-Richtung ist nie budget-limitiert, weil eine unveränderte Signatur genau ihr Punkt ist.

## Review-Budget

Die elastischen Teile der Pipeline in der Diff-Größe werden daraus skaliert, und die Skalierung wird in den Diff-Plan geschrieben, sodass jede Stufe eine Zahl liest statt selbst zu entscheiden:

| Budget-Feld     | Was es scoped                     | Wie es skaliert                                                    |
| --------------- | --------------------------------- | ---------------------------------------------------------------- |
| `inlineAngles`  | Wie viele `low`-Blickwinkel laufen (Schritt 3C) | 3, plus einer pro 60 Quellzeilen, gedeckelt bei den 6 existierenden Winkeln |
| `sweep`         | Ob der Gap-Sweep von `low` läuft  | Aus unter 25 Quellzeilen                                         |
| `specialistCap` | Die Agent-8-Obergrenze            | 0 unter 80 Quellzeilen, sonst 2                                  |
| `verifyShard`   | Ergebnisse pro Verifizierungs-Agent | Flat bei 8 – eine Eigenschaft des Verifizierers, nicht des Diffs |

Zwei Dinge, die es absichtlich nicht tut. Es **skaliert nie eine Dimension weg**: welche Agents ein Review schuldet, entscheidet der Roster, der die Effort-Stufe liest, sodass ein kleines Diff immer noch seinen Security-Pass und seinen Test-Coverage-Pass bekommt. Und es liest **Quell**-Zeilen, nicht Diff-Zeilen – eine 40-Zeilen-Produktionsänderung mit 900 Zeilen neuer Tests ist eine kleine Änderung, und dieselbe Begründung regiert bereits das Territory-Fan-out-Gate.

Warum die Floors dort sind, wo sie sind: bei einem Neun-Zeilen-Typo-Fix sind sechs Inline-Durchläufe fünf Durchläufe über nichts, und der Sweep – ein frischer Leser, der jagt, was der erste Durchlauf nicht erreicht hat – hat nichts zu jagen, wenn der erste Durchlauf alles erreicht hat. Agent 8s Floor ist der substanzielle: "eine Domäne dominiert das Diff" ist ein Urteil, und ein Urteil, das über vierzig Zeilen gefällt wird, findet jedes Mal eine dominante Domäne, weil vierzig Zeilen normalerweise alles eine Sache sind.

## Token-Effizienz

Die High-Effort-Pipeline begrenzt jede Stufe (Shard-Größe, Audit-Runden), aber die Gesamtzahl der Aufrufe skaliert mit den Ergebnissen – `ceil(F/8)` Verifizierungs-Shards – und unter 3B mit der Chunk-Anzahl (Reverse-Audit läuft pro Chunk pro Runde). Typisches 3A-Profil:

| Stufe                            | LLM-Aufrufe                    | Hinweise                                                                                                       |
| -------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Review-Agents (Schritt 3)        | 16 (+0-2)                      | Laufen parallel; Agent 1e nur wenn der Diff einen Wrapping-Typ signalisiert (15 ohne ihn); Cross-Repo überspringt Agents 1c und 7 (14), Local/File überspringt Agent 0 (15) |
| Sharded Verification (Schritt 4) | ceil(F/8)                      | F = Ergebnisse; höchstens 8 pro Verifizierungs-Agent, alle gleichzeitig gestartet                            |
| Iterativer Reverse-Audit (Schritt 5) | 2-10 (3A); Runden × Chunks (3B) | Zwei aufeinanderfolgende trockene Runden zum Stoppen; die Obergrenze folgt der Topologie – 10 bei einem kleinen Diff, 5 bei einem gechunkten, 3 bei einem riesigen wenn der Lauf eine Deadline hat. 3B fächert einen Auditor pro Chunk pro Runde |
| **Gesamt**                       | **~19-30 (~17-29)**            | 3A Same-Repo: ~19-30 (typisch ~19-21); Cross-Repo oder Local/File: ~17-29; ein weniger wenn Agent 1e nicht rostered; 3B skaliert mit Chunks (siehe DESIGN.md) |

Die meisten PRs konvergieren zum unteren Ende des Bereichs; die Obergrenzen verhindern explodierende Kosten bei pathologischen Fällen. Bei `--effort low` läuft das Review vollständig inline – **0 Subagent-Aufrufe** – und geht das Diff einmal pro Blickwinkel durch statt einmal insgesamt.

## Was NICHT gemeldet wird

Das Review schließt absichtlich Folgendes aus:

- Bereits vorhandene Probleme in unverändertem Code (Fokus nur auf dem Diff)
- Stil oder Formatierung, die ein Formatter automatisch normalisieren würde, oder Benennungen, die deinen Codebase-Konventionen entsprechen – aber KEINE substanziellen Probleme, die ein Linter oder Type Checker melden würde (unbenutzte Variablen, unerreichbarer Code, Typfehler), die im Scope sind
- Subjektive "Erwäge, X zu tun"-Vorschläge ohne ein tatsächliches Problem
- Kleinere Refactorings, die keinen Bug oder kein Risiko beheben
- Fehlende Dokumentation, es sei denn, die Logik ist wirklich verwirrend
- Bereits in bestehenden PR-Kommentaren diskutierte Probleme (vermeidet die Duplizierung von menschlichem Feedback)

## Design-Philosophie

> **Schweigen ist besser als Lärm.** Jeder Kommentar sollte die Zeit des Lesers wert sein.

- Wenn unklar ist, ob etwas ein Problem ist → nicht melden
- Jedes Ergebnis benennt ein konkretes Fehlerszenario (Trigger → falsches Ergebnis) oder konkrete Kosten – ein Ergebnis, das das nicht kann, wird verworfen, bevor es dich erreicht
- Gleiches Muster über N Dateien → zu einem einzigen Befund aggregiert
- PR-Kommentare sind nur bei hoher Konfidenz (und nur aus High-Effort, verifizierten Reviews)
- Kosmetische Stil- oder Formatierungsanpassungen, die den Codebase-Konventionen entsprechen, werden ausgeschlossen
