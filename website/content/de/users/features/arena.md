# Agent Arena

> Starte mehrere KI-Modelle gleichzeitig, um dieselbe Aufgabe auszuführen, vergleiche ihre Lösungen nebeneinander und wähle das beste Ergebnis aus, um es auf deinen Workspace anzuwenden.

> [!warning]
> Agent Arena ist experimentell. Es gibt [bekannte Einschränkungen](#limitations) bezüglich der Anzeigemodi und der Sitzungsverwaltung.

Mit Agent Arena kannst du mehrere KI-Modelle bei derselben Aufgabe gegeneinander antreten lassen. Jedes Modell läuft als vollständig unabhängiger Agent in einem eigenen isolierten Git-Worktree, sodass Dateioperationen sich niemals gegenseitig beeinflussen. Wenn alle Agenten fertig sind, vergleichst du die Ergebnisse und wählst einen Gewinner aus, dessen Änderungen in deinen Haupt-Workspace gemergt werden.

Im Gegensatz zu [Subagents](/users/features/sub-agents), die fokussierte Teilaufgaben innerhalb einer einzelnen Sitzung delegieren, sind Arena-Agenten vollständige, eigenständige Agenten-Instanzen – jeweils mit eigenem Modell, Kontextfenster und vollem Tool-Zugriff.

Diese Seite behandelt:

- [Wann du Agent Arena verwenden solltest](#when-to-use-agent-arena)
- [Eine Arena-Sitzung starten](#start-an-arena-session)
- [Mit Agenten interagieren](#interacting-with-agents), einschließlich Anzeigemodi und Navigation
- [Ergebnisse vergleichen und einen Gewinner auswählen](#compare-results-and-select-a-winner)
- [Best Practices](#best-practices)

## When to use Agent Arena

Agent Arena ist am effektivsten, wenn du **bewerten oder vergleichen** möchtest, wie verschiedene Modelle dasselbe Problem lösen. Die stärksten Anwendungsfälle sind:

- **Modell-Benchmarking**: Bewerte die Fähigkeiten verschiedener Modelle an realen Aufgaben in deinem tatsächlichen Codebase, nicht an synthetischen Benchmarks
- **Best-of-N-Auswahl**: Erhalte mehrere unabhängige Lösungen und wähle die beste Implementierung aus
- **Ansätze erkunden**: Sieh dir an, wie verschiedene Modelle über dasselbe Problem nachdenken und es lösen – nützlich zum Lernen und für neue Erkenntnisse
- **Risikominimierung**: Bei kritischen Änderungen validiere, dass mehrere Modelle zu einem ähnlichen Ansatz konvergieren, bevor du sie committest

Agent Arena verbraucht deutlich mehr Tokens als eine einzelne Sitzung (jeder Agent hat sein eigenes Kontextfenster und eigene Modellaufrufe). Es funktioniert am besten, wenn der Mehrwert des Vergleichs die Kosten rechtfertigt. Für Routineaufgaben, bei denen du deinem Standardmodell vertraust, ist eine einzelne Sitzung effizienter.

## Start an arena session

Verwende den Slash-Befehl `/arena`, um eine Sitzung zu starten. Gib die Modelle an, die gegeneinander antreten sollen, sowie die Aufgabe:

```
/arena --models qwen3.5-plus,glm-5,kimi-k2.5 "Refactor the authentication module to use JWT tokens"
```

Wenn du `--models` weglässt, erscheint ein interaktiver Dialog zur Modellauswahl, in dem du aus deinen konfigurierten Providern auswählen kannst.

### What happens when you start

1. **Worktree-Einrichtung**: Qwen Code erstellt für jeden Agenten isolierte Git-Worktrees unter `~/.qwen/arena/<session-id>/worktrees/<model-name>/`. Jeder Worktree spiegelt exakt den Zustand deines aktuellen Arbeitsverzeichnisses wider – einschließlich staged, unstaged und untracked Dateien.
2. **Agenten-Start**: Jeder Agent wird in seinem eigenen Worktree mit vollem Tool-Zugriff und seinem konfigurierten Modell gestartet. Die Agenten werden sequenziell gestartet, arbeiten aber parallel.
3. **Ausführung**: Alle Agenten arbeiten unabhängig an der Aufgabe, ohne gemeinsamen State oder Kommunikation. Du kannst ihren Fortschritt überwachen und mit jedem von ihnen interagieren.
4. **Abschluss**: Wenn alle Agenten fertig sind (oder fehlschlagen), wechselst du in die Phase des Ergebnisvergleichs.

## Interact with agents

### Display modes

Agent Arena unterstützt aktuell den **In-Process-Modus**, in dem alle Agenten asynchron innerhalb desselben Terminal-Prozesses laufen. Eine Tab-Leiste am unteren Rand des Terminals ermöglicht das Wechseln zwischen den Agenten.

> [!note]
> **Split-Pane-Anzeigemodi sind für die Zukunft geplant.** Wir intendieren, tmux- und iTerm2-basierte Split-Pane-Layouts zu unterstützen, bei denen jeder Agent sein eigenes Terminal-Pane für eine echte nebeneinanderliegende Ansicht erhält. Aktuell ist nur das Tab-Wechseln im In-Process-Modus verfügbar.

### Navigate between agents

Im In-Process-Modus verwende Tastenkürzel, um zwischen den Agenten-Ansichten zu wechseln:

| Shortcut | Aktion                            |
| :------- | :-------------------------------- |
| `Right`  | Zum nächsten Agenten-Tab wechseln |
| `Left`   | Zum vorherigen Agenten-Tab wechseln |
| `Up`     | Fokus auf die Eingabebox legen    |
| `Down`   | Fokus auf die Agenten-Tab-Leiste legen |

Die Tab-Leiste zeigt den aktuellen Status jedes Agenten:

| Indikator | Bedeutung                |
| :-------- | :----------------------- |
| `●`       | Läuft oder im Leerlauf   |
| `✓`       | Erfolgreich abgeschlossen|
| `✗`       | Fehlgeschlagen           |
| `○`       | Abgebrochen              |

### Interact with individual agents

Wenn du den Tab eines Agenten ansiehst, kannst du:

- **Nachrichten senden** – Gib im Eingabebereich zusätzliche Anweisungen für den Agenten ein
- **Tool-Aufrufe genehmigen** – Wenn ein Agent eine Tool-Genehmigung anfordert, erscheint der Bestätigungsdialog in seinem Tab
- **Vollständige Historie anzeigen** – Scrolle durch die komplette Konversation des Agenten, einschließlich Modellausgabe, Tool-Aufrufe und Ergebnisse

Jeder Agent ist eine vollständige, unabhängige Sitzung. Alles, was du mit dem Hauptagenten machen kannst, kannst du auch mit einem Arena-Agenten tun.

## Compare results and select a winner

Wenn alle Agenten abgeschlossen sind, wechselt die Arena in die Phase des Ergebnisvergleichs. Du siehst:

- **Statusübersicht**: Welche Agenten erfolgreich waren, fehlgeschlagen sind oder abgebrochen wurden
- **Ausführungsmetriken**: Dauer, Reasoning-Runden, Token-Verbrauch und Anzahl der Tool-Aufrufe für jeden Agenten
- **Arena-Vergleichsübersicht**: Gemeinsam geänderte Dateien vs. nur von einem Agenten geänderte Dateien, Anzahl der geänderten Zeilen, Token-Effizienz und eine hochrangige Zusammenfassung des Ansatzes, generiert aus dem Diff, den Metriken und der Konversationshistorie jedes Agenten

Ein Auswahldialog präsentiert die erfolgreichen Agenten. Wähle einen aus, um seine Änderungen auf deinen Haupt-Workspace anzuwenden, oder verwirf alle Ergebnisse. Drücke `p`, um eine Schnellvorschau für den hervorgehobenen Agenten ein-/auszublenden, oder `d`, um den detaillierten Diff dieses Agenten vor der Auswahl eines Gewinners anzuzeigen.

### What happens when you select a winner

1. Die Änderungen des Gewinner-Agenten werden als Diff gegen die Baseline extrahiert
2. Der Diff wird auf dein Hauptarbeitsverzeichnis angewendet
3. Alle Worktrees und temporären Branches werden automatisch bereinigt

Wenn du den vollständigen Reasoning-Pfad vor der Entscheidung prüfen möchtest, ist die komplette Konversationshistorie jedes Agenten weiterhin über die Tab-Leiste verfügbar, solange der Auswahldialog aktiv ist.

## Configuration

Das Verhalten der Arena kann in [settings.json](/users/configuration/settings) angepasst werden:

```json
{
  "arena": {
    "worktreeBaseDir": "~/.qwen/arena",
    "maxRoundsPerAgent": 50,
    "timeoutSeconds": 600
  }
}
```

| Setting                   | Beschreibung                        | Standardwert    |
| :------------------------ | :---------------------------------- | :-------------- |
| `arena.worktreeBaseDir`   | Basisverzeichnis für Arena-Worktrees| `~/.qwen/arena` |
| `arena.maxRoundsPerAgent` | Maximale Anzahl an Reasoning-Runden pro Agent | `50`      |
| `arena.timeoutSeconds`    | Timeout für jeden Agenten in Sekunden | `600`         |

## Best practices

### Choose models that complement each other

Arena ist am wertvollsten, wenn du Modelle mit deutlich unterschiedlichen Stärken vergleichst. Zum Beispiel:

```
/arena --models qwen3.5-plus,glm-5,kimi-k2.5 "Optimize the database query layer"
```

Der Vergleich von drei Versionen derselben Modellfamilie liefert weniger Erkenntnisse als ein Vergleich über verschiedene Provider hinweg.

### Keep tasks self-contained

Arena-Agenten arbeiten unabhängig voneinander ohne Kommunikation. Aufgaben sollten vollständig im Prompt beschreibbar sein, ohne dass ein Hin und Her erforderlich ist:

**Gut**: „Refaktorisiere das Zahlungsmodul, um das Strategy-Pattern zu verwenden. Aktualisiere alle Tests.“

**Weniger effektiv**: „Lass uns diskutieren, wie wir das Zahlungsmodul verbessern können“ – dies profitiert von einer Konversation, die besser für eine einzelne Sitzung geeignet ist.

### Limit the number of agents

Bis zu 5 Agenten können gleichzeitig laufen. In der Praxis bieten 2–3 Agenten die beste Balance zwischen Vergleichswert und Ressourcenverbrauch. Mehr Agenten bedeuten:

- Höhere Token-Kosten (jeder Agent hat sein eigenes Kontextfenster)
- Längere Gesamtausführungszeit
- Mehr Ergebnisse zum Vergleichen

Beginne mit 2–3 und skaliere nur hoch, wenn der Vergleichswert dies rechtfertigt.

### Use Arena for high-impact decisions

Arena glänzt, wenn die Bedeutung den Einsatz mehrerer Modelle rechtfertigt:

- Auswahl einer Architektur für ein neues Modul
- Auswahl eines Ansatzes für ein komplexes Refactoring
- Validierung eines kritischen Bugfixes aus mehreren Perspektiven

Für Routineänderungen wie das Umbenennen einer Variable oder das Aktualisieren einer Konfigurationsdatei ist eine einzelne Sitzung schneller und günstiger.

## Troubleshooting

### Agents failing to start

- Stelle sicher, dass jedes Modell in `--models` ordnungsgemäß mit gültigen API-Credentials konfiguriert ist
- Prüfe, ob dein Arbeitsverzeichnis ein Git-Repository ist (Worktrees benötigen Git)
- Stelle sicher, dass du Schreibzugriff auf das Worktree-Basisverzeichnis hast (standardmäßig `~/.qwen/arena/`)

### Worktree creation fails

- Führe `git worktree list` aus, um veraltete Worktrees aus vorherigen Sitzungen zu prüfen
- Bereinige veraltete Worktrees mit `git worktree prune`
- Stelle sicher, dass deine Git-Version Worktrees unterstützt (`git --version`, erfordert Git 2.5+)

### Agent takes too long

- Erhöhe das Timeout: Setze `arena.timeoutSeconds` in den Einstellungen
- Reduziere die Aufgabenkomplexität – Arena-Aufgaben sollten fokussiert und klar definiert sein
- Reduziere `arena.maxRoundsPerAgent`, wenn Agenten zu viele Runden benötigen

### Applying winner fails

- Prüfe auf nicht committete Änderungen in deinem Hauptarbeitsverzeichnis, die Konflikte verursachen könnten
- Der Diff wird als Patch angewendet – Merge-Konflikte sind möglich, wenn sich dein Arbeitsverzeichnis während der Sitzung geändert hat

## Limitations

Agent Arena ist experimentell. Aktuelle Einschränkungen:

- **Nur In-Process-Modus**: Split-Pane-Anzeige über tmux oder iTerm2 ist noch nicht verfügbar. Alle Agenten laufen in einem einzigen Terminalfenster mit Tab-Wechsel.
- **Keine Diff-Vorschau vor der Auswahl**: Du kannst die Konversationshistorie jedes Agenten einsehen, aber es gibt keinen einheitlichen Diff-Viewer, um Lösungen vor der Gewinnerauswahl nebeneinander zu vergleichen.
- **Keine Worktree-Aufbewahrung**: Worktrees werden nach der Auswahl immer bereinigt. Es gibt keine Option, sie zur weiteren Inspektion zu behalten.
- **Keine Sitzungswiederaufnahme**: Arena-Sitzungen können nach dem Beenden nicht fortgesetzt werden. Wenn du das Terminal mitten in der Sitzung schließt, verbleiben Worktrees auf der Festplatte und müssen manuell über `git worktree prune` bereinigt werden.
- **Maximal 5 Agenten**: Das Hard-Limit von 5 gleichzeitigen Agenten kann nicht geändert werden.
- **Git-Repository erforderlich**: Arena benötigt ein Git-Repository für die Worktree-Isolierung. Es kann nicht in Verzeichnissen ohne Git verwendet werden.

## Comparison with other multi-agent modes

Agent Arena ist einer von mehreren geplanten Multi-Agent-Modi in Qwen Code. **Agent Team** und **Agent Swarm** sind noch nicht implementiert – die folgende Tabelle beschreibt ihr geplantes Design als Referenz.

|                   | **Agent Arena**                                        | **Agent Team** (geplant)                           | **Agent Swarm** (geplant)                                |
| :---------------- | :----------------------------------------------------- | :------------------------------------------------- | :------------------------------------------------------- |
| **Ziel**          | Wettbewerbsorientiert: Finde die beste Lösung für dieselbe Aufgabe | Kollaborativ: Bearbeite verschiedene Aspekte gemeinsam | Batch-Parallel: Dynamisches Spawnen von Workern für Bulk-Aufgaben |
| **Agenten**       | Vorkonfigurierte Modelle konkurrieren unabhängig       | Teammitglieder kollaborieren mit zugewiesenen Rollen | Worker werden on-the-fly erzeugt und nach Abschluss zerstört |
| **Kommunikation** | Keine Inter-Agent-Kommunikation                        | Direkte Peer-to-Peer-Nachrichten                   | Einseitig: Ergebnisse werden vom Parent aggregiert       |
| **Isolierung**    | Vollständig: separate Git-Worktrees                    | Unabhängige Sitzungen mit gemeinsamer Aufgabenliste | Leichter ephemerer Kontext pro Worker                    |
| **Ausgabe**       | Eine ausgewählte Lösung wird auf den Workspace angewendet | Synthetisierte Ergebnisse aus mehreren Perspektiven | Aggregierte Ergebnisse aus paralleler Verarbeitung       |
| **Am besten geeignet für** | Benchmarking, Auswahl zwischen Modellansätzen | Recherche, komplexe Kollaboration, Cross-Layer-Arbeit | Batch-Operationen, Datenverarbeitung, Map-Reduce-Aufgaben |

## Next steps

Erkunde verwandte Ansätze für parallele und delegierte Arbeit:

- **Leichte Delegierung**: [Subagents](/users/features/sub-agents) bearbeiten fokussierte Teilaufgaben innerhalb deiner Sitzung – besser, wenn du keinen Modellvergleich benötigst
- **Manuelle parallele Sitzungen**: Starte mehrere Qwen Code-Sitzungen selbst in separaten Terminals mit [Git worktrees](https://git-scm.com/docs/git-worktree) für volle manuelle Kontrolle