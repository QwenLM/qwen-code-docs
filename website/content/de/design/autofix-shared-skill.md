# Ein Autofix-Skill für lokale und CI-Läufe

## Kontext

Qwen Code hat bereits ein vom Repository verwaltetes Autofix-Skill, das von GitHub Actions genutzt wird. Es enthält Triage- und Verifikationsregeln für Review-Feedback, während der Workflow Scheduling, Trust-Filterung, Credentials, GitHub-Writes und Runden-Budgets besitzt.

Lokales Autofix sollte dieses Skill wiederverwenden, statt ein Bundled-Skill oder eine zweite Wartungs-Engine hinzuzufügen. Seine Eingabe ist der aktuelle Working Tree, kein Remote-Pull-Request: gestagte, ungestagte und ungetrackte Änderungen werden zusammen gereviewt.

## Design

Das bestehende `.qwen/skills/autofix/SKILL.md` bleibt das einzige Autofix-Skill. Es hat zwei Entry-Pfade:

- Ein direkter `/autofix`-Aufruf reviewt und fixt den aktuellen Working Tree synchron.
- Der bestehende Actions-Runner liefert entweder `assess-candidates`, `develop-issue` oder `address-review` plus vertrauenswürdige, vom Workflow vorbereitete Dateien.

Der lokale Pfad führt wiederholt den bestehenden maschinenlesbaren Review-Befehl aus:

```bash
env -u SANDBOX QWEN_SANDBOX=true "${QWEN_CODE_CLI:-qwen}" review run --approval-mode auto --effort high --json --quiet
```

Der Befehl läuft als verwaltete Hintergrund-Shell, damit sein eigener Timeout und nicht das kürzere Vordergrund-Tool-Limit maßgeblich bleibt. Autofix wartet weiterhin synchron darauf: Die interaktive TUI setzt über die Terminal-Task-Benachrichtigung fort, während ACP-, Stream-json- und Headless-Sessions den Status-Sidecar in einem begrenzten, wachsenden Rhythmus inspizieren. Working-Tree-Fingerabdrücke rund um das Review und unmittelbar vor der Konvergenz machen jeden Review-Nebeneffekt oder gleichzeitige Bearbeitung zu einem sichtbaren `BLOCKED`-Ergebnis.

Das verschachtelte Headless-Review nutzt den Auto-Genehmigungsmodus innerhalb der Qwen-Sandbox. Autofix löscht einen geerbten `SANDBOX`-Marker vor dem Start, damit er die Containment-Umgebung nicht umgehen kann; ein nicht verfügbarer Genehmigungs-Classifier oder eine nicht verfügbare Sandbox erzeugen ein unvollständiges Review und fail-closen. Vor dem Start erklärt Autofix, dass das Review Repository-definierte Checks in einem sandboxed Prozess ausführen kann, der Modell-Credentials und Netzwerkzugang behält, und verlangt dann eine explizite Bestätigung, dass der Nutzer dem Repository vertraut. Wenn ungetrackte, nicht ignorierte Dateien existieren, listet Autofix sie außerdem auf, bevor ihr Inhalt in den Review-Modell-Kontext gelangt. Nicht-interaktive Läufe stoppen `BLOCKED`, wenn keine Bestätigung verfügbar ist. Unter Windows erfordert lokales Autofix Git Bash/MSYS, weil der gebündelte Review-Workflow POSIX-Shell-Syntax nutzt; natives cmd.exe und PowerShell fail-closen, bevor das Review startet.

Nach jedem vollständigen Review liest Autofix den ausgegebenen Report, verifiziert jedes Finding gegen den Code, wendet einen minimalen kohärenten Fix-Batch an, führt die engsten relevanten Checks aus und reviewt den resultierenden Working Tree erneut. Es pollt nicht GitHub und nutzt nicht `/loop`.

Es gibt keine feste lokale Rundenzahl. Der Prozess stoppt bei Beleg:

- `NO_CHANGES`: Der Working Tree war vor dem Review sauber.
- `CONVERGED`: Ein vollständiges, nicht begrenztes Review hat keine umsetzbaren Findings und alle erforderlichen Checks bestehen.
- `BLOCKED`: Review-Belege sind unvollständig, ein erforderlicher Check hat keinen sicheren In-Scope-Fix, oder eine Maintainer-/Produktentscheidung ist erforderlich.
- `STALLED`: Dasselbe umsetzbare Finding überlebt ohne neue Hypothese, es gibt keinen Working-Tree-Fortschritt oder die Änderungen oszillieren.

Lokales Autofix stagt, commitet, pusht nie, schreibt nie Historie um, ändert nie den Index und schreibt nie zu GitHub. Der bestehende gestagte Zustand des Nutzers bleibt intakt; Fixes bleiben als Working-Tree-Änderungen zur Inspektion liegen.

## Workflow-Grenze

GitHub Actions behält die gesamte deterministische Policy: Trigger, Autorisierung, Checkout, Trusted-Feedback-Auswahl, Retry- und Runden-Budgets, Watermarks, Commits, Pushes, Kommentare und finale Gates. Nur Modell-Entscheidungs-Policy gehört in das Skill. Insbesondere darf der Workflow Feedback als deferred markieren, während das Skill entscheidet, wie ein Agent diesen Abschnitt behandeln muss.

## Abgelehnte Alternativen

- Ein Bundled-Autofix-Skill würde mit dem Repository-Skill kollidieren und den Modell-Vertrag spalten.
- `on`, `off` oder `status` würden den Remote-Workflow steuern, statt lokale Änderungen zu fixen.
- Ein neuer Watcher, Scheduler oder eine Runtime-Zustandsmaschine dupliziert bestehende Review- und Actions-Infrastruktur.
- Eine feste lokale Runden-Obergrenze kann eine fortschreitende Reparatur stoppen; fortschrittsbasierte Stoppbedingungen begrenzen nicht konvergierende Läufe, ohne eine beliebige Gesamtzahl aufzuzwingen.
