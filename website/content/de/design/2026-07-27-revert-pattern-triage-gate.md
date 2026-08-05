# Revert-Muster-Triage-Gate

Datum: 2026-07-27
Status: Vorgeschlagen
Bereich: CI-Triage — `.github/workflows/qwen-triage.yml`, `.qwen/skills/triage/`

## Problem

Kleine verhaltensneutrale Wartungs-PRs verbrauchen derzeit dieselbe
mehrstufige Triage- und Modell-Review-Kapazität wie Verhaltensänderungen. Der
ursprüngliche Vorschlag (PR #7414) versuchte, diese herauszufiltern, aber eine
Maintainer-Messung am Live-Backlog ergab nur eine Trefferquote von ~2 % — das
Feature zielte auf ein praktisch nicht existentes Problem.

Derweil hat das Repo **111 Revert-Commits** über seine Historie (allein 19 im
Juli 2026), und **61,5 % der Reverts erfolgen innerhalb von 24 Stunden nach
dem Merge** — das heißt, das Problem wird schnell erkannt, aber erst, wenn es
bereits auf `main` ist. Die echten Kosten sind nicht das Reviewen harmloser
PRs; es ist das Mergen von PRs, die zurückgerollt werden müssen.

Dieses Design schlägt ein datengestütztes Triage-Gate vor, das auf die PRs
zielt, die tatsächlich Reverts verursachen, nicht auf jene, die bereits
harmlos sind.

## Daten

### Methodik

Dreiphasige Analyse der vollständigen Revert-Historie des Repos:

1. **Sammlung**: `git log --all --grep="^Revert "` fand 111 Revert-Commits.
   Der Body jedes Reverts wurde auf `This reverts commit <hash>` geparst, dann
   der ursprüngliche Commit über `gh api` zu seinem PR zurückverfolgt.
   Ergebnis: 46 eindeutige reverted PRs (59 Reverts auf eine PR-Nummer
   zurückführbar; 52 Reverts hatten nur den ursprünglichen Commit-Titel ohne
   PR-Link).

2. **Anreicherung**: Für jede reverted PR wurden zur Triage-Zeit beobachtbare
   Signale extrahiert: Touch-Scope (core/auth/providers/tools/services),
   Diff-Größe, Review-Runden-Anzahl, Bot-Critical-Befunde,
   CHANGES_REQUESTED-Zyklen, Merge→Revert-Zeitabstand, Self-Revert,
   E2E-Verifizierungs-Vorhandensein. 31 von 46 PRs wurden erfolgreich
   angereichert; 15 sind gelöscht und unzugänglich (HTTP 404).

3. **Kontrollgruppen-Vergleich**: 60 kürzlich gemergte, aber nicht reverted
   PRs wurden beprobt und dieselben Signale extrahiert. Präzision
   (TP / (TP + FP)) und Recall wurden für jedes Signal berechnet.

Skripte und Rohdaten (lokale Analyse-Artefakte, nicht committet):
`.qwen/scripts/revert-analysis-*.mjs`, `.qwen/scripts/revert-data-*.json`,
`.qwen/scripts/revert-analysis-report-v2.json`.

### Signal-Präzision und -Recall

| Signal                       | Präzision | Recall | Reverted (n=31) | Kontrolle (n=60) |
| ---------------------------- | --------- | ------ | --------------- | ---------------- |
| `touches_high_risk`          | **66,7%** | 32,3%  | 10              | 5                |
| `non_maintainer + high_risk` | **58,3%** | 22,6%  | 7               | 5                |
| `core + contested`           | **50,0%** | 19,4%  | 6               | 6                |
| `non_maintainer + core`      | 46,2%     | 38,7%  | 12              | 14               |
| `touches_core`               | 44,7%     | 54,8%  | 17              | 21               |
| `has_contested_pattern`      | 40,9%     | 29,0%  | 9               | 13               |
| `had_changes_requested`      | 40,7%     | 35,5%  | 11              | 16               |
| `non_maintainer`             | 39,6%     | 67,7%  | 21              | 32               |
| `large_diff_gt_200`          | 37,0%     | 54,8%  | 17              | 29               |
| `critical_count > 0`         | 28,6%     | 12,9%  | 4               | 10               |
| `fast_revert_24h`            | 100,0%    | 25,8%  | 8               | 0                |
| `self_reverted`              | 100,0%    | 9,7%   | 3               | 0                |

**Stichproben-Vorbehalt:** Die Präzision ist auf einem
Case-Control-Verhältnis von 1:1,9 berechnet (31 reverted vs. 60 Kontrolle),
während die tatsächliche Basisrate des Repos bei ~1,37 % liegt (46/3358).
Die Präzision (PPV) ist die Metrik, die am empfindlichsten auf diese
Anreicherung reagiert — der wahre positiv prädiktive Wert bei der
Repo-Basisrate ist deutlich niedriger (z. B. ~5 % für `touches_high_risk`).
Sensitivität (Recall) und Spezifität sind invariant gegenüber dem
Stichprobenverhältnis und sind die geeigneten Metriken für den Signalvergleich.
Das _Ranking_ der Signale nach Präzision ist weiterhin gültig (es ist monoton
im Likelihood-Verhältnis bei festem n), aber die absoluten Werte sollten
Contributorn nicht als Posterior-Wahrscheinlichkeiten genannt werden.

`fast_revert_24h` und `self_reverted` haben 100 % Präzision, sind aber
**Post-Merge-Signale** — sie können nicht als Triage-Gate verwendet werden,
weil sie erst beobachtbar sind, nachdem der PR bereits gemergt und reverted
ist. Sie bestätigen, dass das Problem existiert, helfen aber nicht, es zu
verhindern.

`critical_count > 0` wurde zunächst für ein starkes Signal gehalten (der Bot
markierte in Fallstudien wie PR #6866 die exakte Ursache), aber nach der
Korrektur der Regex, nur `**[Critical]**`-Tags zu matchen (nicht das bloße
Wort „critical" in Prosa wie „no critical blockers"), fiel die Präzision auf
28,6 %. Der Bot ist mit Critical-Befunden zu schnell dabei — 16,7 % der
Kontrollgruppen-PRs haben ebenfalls Critical-Tags.

### High-Risk-Pfad-Definition

Das `touches_high_risk`-Signal prüft, ob eine geänderte Datei auf eines dieser
Subsystem-Muster passt:

- `openaiContentGenerator` — Streaming-Response-Parsing
- `streamingToolCallParser` — Tool-Call-Stream-Parsing
- `geminiChat` — Gemini-Chat-Pipeline
- `acpConnection` — ACP-Prozess-Spawning
- `shell.ts` / `shellExecutionService` — Shell-Tool-Ausführung
- `mcp-client` / `mcp-pool` — MCP-Server-Verwaltung
- `LspServer` — LSP-Server-Verwaltung
- `acp-integration` — ACP-Session-Integration
- `relaunch.ts` — Desktop-App-Relaunch-Lebenszyklus
- `sandbox.ts` — Sandbox-Prozess-Verwaltung
- `electron-run-as-node` — Electron-Node-Mode-Einstiegspunkt (Pfad-Match)

Dies sind die Pfade, bei denen fehlerhafte Änderungen am ehesten beobachtbare
Regressionen verursachen, die einen Revert erfordern.

### Merge→Revert-Zeitabstand

Von 13 PRs mit gültigen (nicht-negativen, Post-Merge-)Abstandsdaten:

- Median: 4 Stunden
- Innerhalb 24h: 61,5%
- Innerhalb 72h: 84,6%
- Maximum: 97 Stunden

Das bestätigt, dass Revert-verursachende Defekte schnell nach dem Merge
sichtbar werden, der Schaden aber bereits auf `main` ist.

### Flip-Flop-PRs

8 PRs wurden mehrfach reverted (Revert → Re-Revert-Zyklen), was ungelöste
Streitigkeit anzeigt:

- PR #6754 (3 Reverts), PR #6751 (3 Reverts), PR #3433 (3 Reverts)
- PR #6869 (2 Reverts), PR #5668 (2 Reverts), PR #3567 (2 Reverts),
  PR #3478 (2 Reverts), PR #5060 (2 Reverts)

Diese Flip-Flop-PRs sind die Ergebnisse mit den höchsten Kosten — sie
verbrauchen mehrere Review-Runden, mehrere Merge-/Revert-Zyklen und erfordern
oft Patch-Releases.

## Design

### High-Risk-Pfad-Eskalation

Wenn ein Nicht-Maintainer-PR einen High-Risk-Pfad berührt (siehe Definition
oben), eskaliert die Stage-1-Triage den PR zur tiefsten Review-Stufe statt zum
normalen Pfad. Dies **blockiert oder schließt den PR nicht** — es stellt
sicher, dass die volle `/review`-Pipeline mit maximaler Agent-Abdeckung läuft.

Dies ist das stärkste Triage-Zeit-Signal: 10 von 31 reverted PRs (32,3 %
Sensitivität) berührten diese Pfade, gegenüber 5 von 60 Kontroll-PRs (91,7 %
Spezifität; Fisher p = 0,006).

Implementierung: Der Stage-1e-Skill-Text weist das Triage-Modell an,
`gh pr view --json files | grep -E '...'` gegen die High-Risk-Pfad-Muster
auszuführen. Keine Workflow-YAML-Änderung ist nötig — die Erkennung läuft
innerhalb des Skills, nicht als separater Workflow-Schritt.

### Was dieses Design NICHT tut

- **PRs nicht automatisch schließen oder ablehnen.** Das Gate eskaliert die
  Review-Tiefe und empfiehlt Maintainer-Aufmerksamkeit; es blockiert nie den
  Merge oder schließt den PR.
- **Bot-Critical-Befunde nicht als Signal verwenden.** Die Daten zeigen 28,6 %
  Präzision — der Bot markiert auch 16,7 % sicherer PRs mit Criticals.
  Criticals sind zu verrauscht, um darauf zu gaten.
- **Nicht nur nach PR-Größe filtern.** `large_diff_gt_200` hat 37,0 %
  Präzision — Größe ohne Kontext ist nicht prädiktiv.
- **E2E-Verifizierung nicht für alle PRs verlangen.** `no_e2e` ist nicht
  diskriminierend — 100 % der Kontrollgruppe fehlen ebenfalls E2E-Kommentare,
  sodass das Signal Revert-anfällige PRs nicht von sicheren unterscheiden
  kann.

## Vergleich mit PR #7414

|                     | PR #7414 (verhaltensneutral)        | Dieses Design (Revert-Muster)                  |
| ------------------- | ----------------------------------- | ---------------------------------------------- |
| Signal              | „Diff ist komplett verhaltensneutral" | „berührt High-Risk-Pfade"                    |
| Revert-Recall       | nicht gemessen (keine Reverts zum Vergleich) | 32,3% (10/31)                        |
| Spezifität          | n/v                                 | 91,7% (55/60)                                  |
| Ziele               | harmlose PRs (Kosten: niedrig)      | gefährliche PRs (Kosten: hoch)                 |
| False-Positive-Kosten | überspringt Review eines nützlichen PRs | eskaliert Review-Tiefe (extra Review-Zeit) |

## Geänderte Dateien

- `.qwen/skills/triage/references/pr-workflow.md` — fügt die
  Stage-1e-High-Risk-Pfad-Checkliste hinzu. Die Erkennung läuft innerhalb des
  Triage-Skills (das Modell führt `gh api --paginate … | grep …` selbst aus),
  daher ist keine Workflow-YAML-Änderung nötig.
- `scripts/tests/qwen-triage-workflow.test.js` — assertet, dass die
  High-Risk-Pfad-Routing-Strings im Triage-Skill-Markdown existieren.
- `.github/scripts/qwen-triage-workflow.test.mjs` — dieselben Assertions im
  node:test-Runner.

## Non-Goals / Folgeaufgaben

- **Bot-Critical-Verfeinerung.** Die aktuelle Bot-Critical-Erkennung ist zu
  verrauscht (28,6 % Präzision). Wenn der Bot „ungelöste Criticals" von
  „gelösten Criticals" unterscheiden könnte (indem er prüft, ob der
  Befund-Thread als gelöst markiert wurde), könnte das Signal nützlich werden.
  Das ist eine separate Bot-Verbesserung, keine Triage-Gate-Änderung.
- **Zeitlich abgestimmte Kontrollgruppe.** Die aktuelle Kontrollgruppe ist aus
  den 200 zuletzt gemergten PRs beprobt, aber reverted PRs umspannen
  2025–2026. Eine zeitlich abgestimmte Kontrollgruppe ergäbe präzisere
  False-Positive-Raten. Die `gh pr list`-API unterstützt keine tiefe
  Paginierung, daher erfordert dies einen GraphQL-Cursor-basierten Abruf.
- **Wiederherstellung der 15 gelöschten PRs.** 15 von 46 reverted PRs sind
  gelöscht und über die GitHub-API unzugänglich. Ihre Muster können sich von
  den 31 angereicherten unterscheiden. Es gibt keinen Wiederherstellungspfad —
  GitHub löscht geschlossene PRs in bestimmten Zuständen endgültig.
- **Flip-Flop-Erkennung als Echtzeit-Gate.** Die aktuelle Analyse erkennt
  Flip-Flops retrospektiv (nach mehreren Reverts). Eine Echtzeit-Version würde
  auf `main` nach Revert→Re-Revert-Mustern suchen und Maintainer alarmieren.
  Das erfordert einen separaten Monitoring-Workflow, kein Triage-Gate.
- **Erweiterung der High-Risk-Pfad-Liste.** Die aktuelle Liste ist manuell aus
  den Dateipfaden der reverted PRs kuratiert. Wenn sich die Codebasis
  weiterentwickelt, können neue High-Risk-Pfade entstehen. Ein periodischer
  Re-Lauf der Analyse-Skripte hält die Liste aktuell.
