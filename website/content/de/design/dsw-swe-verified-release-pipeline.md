# DSW SWE-bench Verified Release Pipeline

Diese Pipeline ist eine isolierte Implementierung von:

`GitHub Release -> self-hosted DSW runner -> short run submission -> persistent Coordinator + 10 Executors -> Publisher -> Release result`

Sie verwendet oder verändert weder den Workflow, den Service, den State noch die
Ergebnis-Marker aus PR #7584.

## Produktionsverhalten

- Ein stabiles `vX.Y.0`-Release startet den Workflow vom Ziel-Commit des
  Release-Tags. Patch-Releases, Prereleases und andere Tag-Familien werden übersprungen.
- Der Release-Tag wird in seinen unveränderlichen Git-Commit aufgelöst.
- Das vollständige SWE-bench-Verified-Manifest mit 500 Instanzen wird vor dem
  Dispatch eingefroren.
- Der Self-Hosted-Runner empfängt den Actions-Job über seine ausgehende
  GitHub-Verbindung. Das One-Shot-Dispatch-Skript friert das Manifest ein und ruft
  `qwen-benchmark-pool submit` auf, um den Run und die initialen Tasks zu erzeugen.
- Die Action zeichnet die Pool-`run_id` auf und endet, ohne auf den Benchmark zu
  warten.
- Ein persistenter Coordinator und zehn persistente Executors verarbeiten den Run.
  Jeder Executor claimt atomar einen Task und führt jeweils einen Harbor/Docker-Trial aus.
- Die Live-Trial-Verzeichnisse von Harbor bleiben auf dem lokalen NVMe.
  Abgeschlossene Attempt-Artefakte werden nach OSS kopiert, ohne auf
  POSIX-Berechtigungsoperationen von OSS angewiesen zu sein.
- Executors senden Heartbeats für ihre Leases und reichen Ergebnisse atomar ein.
  Retrybare Infrastrukturfehler erhalten bis zu vier Versuche mit 60, 120 und 240
  Sekunden Backoff.
- Der Coordinator stellt abgelaufene Leases wieder her, führt die Reconciliation
  der Run-Zähler durch und wendet die Completion- und Publication-Gates des
  Manifests an. Isolierte terminale Fehler brechen die verbleibenden Tasks nicht ab.
- Ein persistenter DSW-Publisher überwacht terminale Runs und aktualisiert das
  auslösende Release aktiv mit dem öffentlichen Ergebnis-JSON und einem
  Trajectory-Archiv pro Fall.
- Ein Score wird erst geschrieben, nachdem alle 500 Instanzen einen eindeutigen
  terminalen Zustand erreicht haben, kein Task abgebrochen wurde und
  `EXECUTION_ERROR + INFRA_FAILED < 10` gilt. Der Score ist
  `RESOLVED / (RESOLVED + UNRESOLVED)`, wobei nur gültige Grader-Ergebnisse als
  Nenner verwendet werden.
- Zehn oder mehr terminale Fehler, ein abgebrochener Task, ein fehlendes Ergebnis
  oder eine fehlende Trajectory für einen bewertbaren Fall machen den Run
  `QUARANTINED`; Status und Zählungen werden ohne Score geschrieben.

## Isolationsgrenzen

- Runner-Label: `qwen-benchmark-dsw`
- Workflow: `.github/workflows/dsw-swe-verified-release.yml`
- Suite: `dsw_release_swe_verified_v1`
- PostgreSQL-Datenbank: `qwen_benchmark_dsw_release_v1`
- Runtime: `/mnt/workspace/qwen-benchmark-dsw-release-v1`
- Modell-Credential: `/mnt/workspace/qwen-benchmark-dsw-release-v1/config/model.key`
  (`root:github-runner`, Modus `0640`)
- OSS: `/mnt/data/qwen-benchmark/dsw-release-v1`
- Release-Marker: `qwen-code-dsw-swe-verified`

Docker-Image-Layer dürfen den DSW-Host-Cache verwenden, aber Experimentstatus und
Artefakte teilen keine Pfade oder Tabellen mit einer anderen Benchmark-Pipeline.

## Branch-Validierung

Verwende `workflow_dispatch` von diesem Branch und ziele auf ein isoliertes
Prerelease. Automatische `release.published`-Runs sind bewusst auf stabile
`vX.Y.0`-Releases beschränkt.

Für ein manuell angestoßenes Test-Prerelease wählt eine einzelne Body-Zeile wie
`Benchmark-Qwen-Ref: v0.20.0-nightly.20260722.b98306b7e` eine bestehende
veröffentlichte Qwen-npm-Version aus, während das Ergebnis auf dem isolierten
POC-Release bleibt. Dieser Override wird nur für Prereleases akzeptiert. Ein
normales Release wertet immer den eigenen Tag aus.

`workflow_dispatch` bleibt für explizite Diagnose und erneute Runs verfügbar. Die
manuelle Validierung nutzt standardmäßig eine Instanz, um Zeit und Modellkosten zu
begrenzen; Runs mit 5 und 500 Instanzen leiten die `instance_id` des Einzelfalls
nicht weiter. Beide Trigger sind asynchron: Actions zeichnet eine Dispatch-Bestätigung
auf, bleibt aber für die Dauer des Benchmarks nicht am Leben.

## Komponentengrenze

- GitHub Self-Hosted-Runner: langlebiger GitHub-Job-Empfänger.
- Dispatch / Pool-Submit: One-Shot-Erzeuger für Run und Tasks.
- PostgreSQL: geteilter persistenter State-Speicher, nicht der Scheduler.
- Coordinator: Wiederherstellung abgelaufener Leases, Run-Abgleich und
  Completion-Gate.
- Executors: Task-Claim, Ausführung von Harbor/Qwen Code/Grader, Heartbeat und
  Ergebnis-Einreichung.
- Publisher: Validierung terminaler Runs, Erzeugung des öffentlichen Ergebnis- und
  Trajectory-Bundles und aktives Writeback in das GitHub-Release.

Die DSW-Implementierung wird separat im internen Repository
`qwen-code-benchmark-dsw` gepflegt. Dieser PR enthält nur den GitHub-Trigger, das
Manifest, den Dispatch-Adapter und den öffentlichen Design-Vertrag.

## Full-Suite-Validierung

Die isolierte Prerelease-Validierung wurde am 25.07.2026 abgeschlossen:

- Test-Release:
  `dsw-swe-full-async-poc-20260724-2c5ad4a5d0-r3`
- GitHub-Actions-Run: `30079405895`
- Pool-Run: `pool-31a24bc8acca49d2`
- Dataset: `swe-bench/swe-bench-verified@2`, 500 eingefrorene Instanzen
- Ausführung: 10 persistente Executors, höchstens zwei Versuche pro Instanz
- Qwen Code: `v0.20.0-nightly.20260722.b98306b7e`
- Modell: `qwen3.7-max`
- Laufzeit: etwa 12 Stunden 27 Minuten
- Ergebnisse: 332 `RESOLVED`, 107 `UNRESOLVED`, 56 `EXECUTION_ERROR`,
  5 `INFRA_FAILED`
- Gültige Grader-Abdeckung: 439/500 (87,8 %)
- Diagnostic-Resolved-Rate unter den gültigen Grader-Ergebnissen: 332/439 (75,6 %)
- Run-Status: `QUARANTINED`; es wurde kein offizieller Score veröffentlicht
- Öffentliches JSON: 500 Datensätze und 500 eindeutige Instanz-IDs

Nachweise:

- https://github.com/QwenLM/qwen-code/releases/tag/dsw-swe-full-async-poc-20260724-2c5ad4a5d0-r3
- https://github.com/QwenLM/qwen-code/actions/runs/30079405895
- https://github.com/QwenLM/qwen-code/releases/download/dsw-swe-full-async-poc-20260724-2c5ad4a5d0-r3/swe-bench-verified-dsw-swe-full-async-poc-20260724-2c5ad4a5d0-r3.json

Die vollständige Kette wurde validiert, einschließlich asynchronem Dispatch,
Task-Pool-Ausführung, strikter Quarantäne und Publisher-Writeback. Der Run ist kein
offizieller Modell-Score: 61 Instanzen hatten keine gültigen Grader-Ergebnisse, und
ein laufender Executor-Pool behielt nach einem Source-Hot-Update einen älteren
Fehler-Classifier bei. Ein sauberer vollständiger Rerun erfordert einen gepinnten
Worker-Commit/Digest sowie neu gestartete, versionsgeprüfte Executors.
