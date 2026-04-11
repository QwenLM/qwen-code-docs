# Agent Arena

> Starte mehrere KI-Modelle gleichzeitig, um dieselbe Aufgabe auszuführen, vergleiche ihre Lösungen nebeneinander und wähle das beste Ergebnis aus, um es auf deinen Workspace anzuwenden.

> [!warning]
> Agent Arena ist experimentell. Es gibt [bekannte Einschränkungen](#limitations) bezüglich der Anzeigemodi und des Session-Managements.

Mit Agent Arena kannst du mehrere KI-Modelle bei derselben Aufgabe gegeneinander antreten lassen. Jedes Modell läuft als vollständig unabhängiger Agent in einem eigenen isolierten Git Worktree, sodass Dateioperationen sich niemals gegenseitig beeinflussen. Wenn alle Agenten fertig sind, vergleichst du die Ergebnisse und wählst einen Gewinner aus, dessen Änderungen in deinen Haupt-Workspace gemergt werden.

Im Gegensatz zu [Subagents](/users/features/sub-agents), die fokussierte Teilaufgaben innerhalb einer einzigen Session delegieren, sind Arena-Agenten vollständige, eigenständige Agent-Instanzen – jeweils mit eigenem Modell, Context Window und vollem Tool-Zugriff.

Diese Seite behandelt:

- [Wann du Agent Arena verwenden solltest](#when-to-use-agent-arena)
- [Starten einer Arena-Session](#start-an-arena-session)
- [Interaktion mit Agenten](#interact-with-agents), einschließlich Anzeigemodi und Navigation
- [Ergebnisse vergleichen und einen Gewinner auswählen](#compare-results-and-select-a-winner)
- [Best Practices](#best-practices)

## Wann du Agent Arena verwenden solltest

Agent Arena ist am effektivsten, wenn du **evaluiieren oder vergleichen** möchtest, wie verschiedene Modelle dasselbe Problem angehen. Die stärksten Anwendungsfälle sind:

- **Modell-Benchmarking**: Evaluiere die Fähigkeiten verschiedener Modelle an realen Aufgaben in deiner tatsächlichen Codebase, nicht an synthetischen Benchmarks
- **Best-of-N-Auswahl**: Erhalte mehrere unabhängige Lösungen und wähle die beste Implementierung aus
- **Erkunden von Ansätzen**: Sieh dir an, wie verschiedene Modelle über dasselbe Problem nachdenken und es lösen – nützlich zum Lernen und für neue Erkenntnisse
- **Risikominimierung**: Bei kritischen Änderungen validiere, dass mehrere Modelle zu einem ähnlichen Ansatz konvergieren, bevor du committest

Agent Arena verbraucht deutlich mehr Tokens als eine einzelne Session (jeder Agent hat sein eigenes Context Window und eigene Modell-Aufrufe). Es funktioniert am besten, wenn der Mehrwert des Vergleichs die Kosten rechtfertigt. Für Routineaufgaben, bei denen du deinem Standardmodell vertraust, ist eine einzelne Session effizienter.

## Starten einer Arena-Session

Verwende den Slash-Befehl `/arena`, um eine Session zu starten. Gib die Modelle an, die gegeneinander antreten sollen, sowie die Aufgabe:

```
/arena --models qwen3.5-plus,glm-5,kimi-k2.5 "Refactor the authentication module to use JWT tokens"
```

Wenn du `--models` weglässt, erscheint ein interaktiver Dialog zur Modellauswahl, in dem du aus deinen konfigurierten Providern wählen kannst.

### Was beim Start passiert

1. **Worktree-Einrichtung**: Qwen Code erstellt isolierte Git Worktrees für jeden Agenten unter `~/.qwen/arena/<session-id>/worktrees/<model-name>/`. Jeder Worktree spiegelt exakt den Zustand deines aktuellen Arbeitsverzeichnisses wider – einschließlich staged, unstaged und untracked Dateien.
2. **Agenten-Start**: Jeder Agent startet in seinem eigenen Worktree mit vollem Tool-Zugriff und seinem konfigurierten Modell. Die Agenten werden sequenziell gestartet, führen die Ausführung jedoch parallel aus.
3. **Ausführung**: Alle Agenten arbeiten unabhängig an der Aufgabe, ohne gemeinsamen State oder Kommunikation. Du kannst ihren Fortschritt überwachen und mit jedem von ihnen interagieren.
4. **Abschluss**: Wenn alle Agenten fertig sind (oder fehlschlagen), wechselst du in die Phase des Ergebnisvergleichs.

## Interaktion mit Agenten

### Anzeigemodi

Agent Arena unterstützt derzeit den **In-Process-Modus**, bei dem alle Agenten asynchron innerhalb desselben Terminal-Prozesses laufen. Eine Tab-Leiste am unteren Rand des Terminals ermöglicht das Wechseln zwischen den Agenten.

> [!note]
> **Split-Pane-Anzeigemodi sind für die Zukunft geplant.** Wir beabsichtigen, tmux-basierte und iTerm2-basierte Split-Pane-Layouts zu unterstützen, bei denen jeder Agent einen eigenen Terminal-Bereich für eine echte Side-by-Side-Ansicht erhält. Derzeit ist nur das Tab-Wechseln im In-Process-Modus verfügbar.

### Navigation zwischen Agenten

Im In-Process-Modus verwendest du Tastenkürzel, um zwischen den Agenten-Ansichten zu wechseln:

| Shortcut | Aktion                            |
| :------- | :-------------------------------- |
| `Right`  | Zum nächsten Agenten-Tab wechseln      |
| `Left`   | Zum vorherigen Agenten-Tab wechseln  |
| `Up`     | Fokus auf das Eingabefeld legen     |
| `Down`   | Fokus auf die Agenten-Tab-Leiste legen |

Die Tab-Leiste zeigt den aktuellen Status jedes Agenten:

| Indikator | Bedeutung                |
| :-------- | :--------------------- |
| `●`       | Läuft oder im Leerlauf        |
| `✓`       | Erfolgreich abgeschlossen |
| `✗`       | Fehlgeschlagen                 |
| `○`       | Abgebrochen              |

### Interaktion mit einzelnen Agenten

Wenn du den Tab eines Agenten ansiehst, kannst du:

- **Nachrichten senden** – tippe im Eingabebereich, um dem Agenten weitere Anweisungen zu geben
- **Tool-Aufrufe genehmigen** – wenn ein Agent eine Tool-Genehmigung anfordert, erscheint der Bestätigungsdialog in seinem Tab
- **Vollständigen Verlauf anzeigen** – scrolle durch die komplette Konversation des Agenten, einschließlich Modell-Ausgabe, Tool-Aufrufe und Ergebnisse

Jeder Agent ist eine vollständige, unabhängige Session. Alles, was du mit dem Hauptagenten machen kannst, kannst du auch mit einem Arena-Agenten tun.

## Ergebnisse vergleichen und einen Gewinner auswählen

Wenn alle Agenten abgeschlossen sind, wechselt die Arena in die Phase des Ergebnisvergleichs. Du siehst:

- **Statusübersicht**: Welche Agenten erfolgreich waren, fehlgeschlagen sind oder abgebrochen wurden
- **Ausführungsmetriken**: Dauer, Reasoning-Runden, Token-Verbrauch und Anzahl der Tool-Aufrufe für jeden Agenten

Ein Auswahldialog zeigt die erfolgreichen Agenten. Wähle einen aus, um seine Änderungen auf deinen Haupt-Workspace anzuwenden, oder verwerfe alle Ergebnisse.

### Was passiert, wenn du einen Gewinner auswählst

1. Die Änderungen des Gewinner-Agenten werden als Diff gegen die Baseline extrahiert
2. Der Diff wird auf dein Haupt-Arbeitsverzeichnis angewendet
3. Alle Worktrees und temporären Branches werden automatisch bereinigt

Wenn du die Ergebnisse vor der Entscheidung prüfen möchtest, ist der vollständige Konversationsverlauf jedes Agenten über die Tab-Leiste verfügbar, solange der Auswahldialog aktiv ist.

## Konfiguration

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

| Einstellung                   | Beschreibung                        | Standardwert         |
| :------------------------ | :--------------------------------- | :-------------- |
| `arena.worktreeBaseDir`   | Basisverzeichnis für Arena-Worktrees | `~/.qwen/arena` |
| `arena.maxRoundsPerAgent` | Maximale Anzahl an Reasoning-Runden pro Agent | `50`            |
| `arena.timeoutSeconds`    | Timeout für jeden Agenten in Sekunden  | `600`           |

## Best Practices

### Wähle Modelle, die sich ergänzen

Die Arena ist am wertvollsten, wenn du Modelle mit deutlich unterschiedlichen Stärken vergleichst. Zum Beispiel:

```
/arena --models qwen3.5-plus,glm-5,kimi-k2.5 "Optimize the database query layer"
```

Der Vergleich von drei Versionen derselben Modellfamilie liefert weniger Erkenntnisse als ein Vergleich über verschiedene Provider hinweg.

### Halte Aufgaben in sich geschlossen

Arena-Agenten arbeiten unabhängig voneinander ohne Kommunikation. Aufgaben sollten vollständig im Prompt beschreibbar sein, ohne dass ein Hin und Her erforderlich ist:

**Gut**: „Refaktorisiere das Zahlungsmodul, um das Strategy-Pattern zu verwenden. Aktualisiere alle Tests.“

**Weniger effektiv**: „Lass uns besprechen, wie wir das Zahlungsmodul verbessern können“ – dies profitiert von einem Gespräch, das besser für eine einzelne Session geeignet ist.

### Begrenze die Anzahl der Agenten

Es können bis zu 5 Agenten gleichzeitig laufen. In der Praxis bieten 2–3 Agenten die beste Balance zwischen Vergleichswert und Ressourcenverbrauch. Mehr Agenten bedeuten:

- Höhere Token-Kosten (jeder Agent hat sein eigenes Context Window)
- Längere Gesamtausführungszeit
- Mehr Ergebnisse zum Vergleichen

Beginne mit 2–3 und skaliere nur hoch, wenn der Mehrwert des Vergleichs dies rechtfertigt.

### Verwende die Arena für Entscheidungen mit hoher Tragweite

Die Arena glänzt, wenn die Bedeutung der Aufgabe den Einsatz mehrerer Modelle rechtfertigt:

- Auswahl einer Architektur für ein neues Modul
- Auswahl eines Ansatzes für ein komplexes Refactoring
- Validierung eines kritischen Bugfixes aus mehreren Perspektiven

Für Routineänderungen wie das Umbenennen einer Variable oder das Aktualisieren einer Config-Datei ist eine einzelne Session schneller und günstiger.

## Fehlerbehebung

### Agenten starten nicht

- Stelle sicher, dass jedes Modell in `--models` ordnungsgemäß mit gültigen API-Credentials konfiguriert ist
- Prüfe, ob dein Arbeitsverzeichnis ein Git-Repository ist (Worktrees benötigen Git)
- Stelle sicher, dass du Schreibzugriff auf das Worktree-Basisverzeichnis hast (standardmäßig `~/.qwen/arena/`)

### Worktree-Erstellung schlägt fehl

- Führe `git worktree list` aus, um veraltete Worktrees aus früheren Sessions zu prüfen
- Bereinige veraltete Worktrees mit `git worktree prune`
- Stelle sicher, dass deine Git-Version Worktrees unterstützt (`git --version`, erfordert Git 2.5+)

### Agent benötigt zu lange

- Erhöhe das Timeout: setze `arena.timeoutSeconds` in den Einstellungen
- Reduziere die Aufgabenkomplexität – Arena-Aufgaben sollten fokussiert und klar definiert sein
- Senke `arena.maxRoundsPerAgent`, wenn Agenten zu viele Runden benötigen

### Anwenden des Gewinners schlägt fehl

- Prüfe auf uncommittete Änderungen in deinem Haupt-Arbeitsverzeichnis, die zu Konflikten führen könnten
- Der Diff wird als Patch angewendet – Merge-Konflikte sind möglich, wenn sich dein Arbeitsverzeichnis während der Session geändert hat

## Einschränkungen

Agent Arena ist experimentell. Aktuelle Einschränkungen:

- **Nur In-Process-Modus**: Split-Pane-Anzeige über tmux oder iTerm2 ist noch nicht verfügbar. Alle Agenten laufen in einem einzigen Terminal-Fenster mit Tab-Wechsel.
- **Kein Diff-Preview vor der Auswahl**: Du kannst den Konversationsverlauf jedes Agenten einsehen, aber es gibt keinen unified Diff-Viewer, um Lösungen vor der Gewinnerauswahl nebeneinander zu vergleichen.
- **Keine Worktree-Aufbewahrung**: Worktrees werden nach der Auswahl immer bereinigt. Es gibt keine Option, sie zur weiteren Inspektion aufzubewahren.
- **Keine Session-Fortsetzung**: Arena-Sessions können nach dem Beenden nicht fortgesetzt werden. Wenn du das Terminal mitten in der Session schließt, verbleiben die Worktrees auf der Festplatte und müssen manuell über `git worktree prune` bereinigt werden.
- **Maximal 5 Agenten**: Das harte Limit von 5 gleichzeitigen Agenten kann nicht geändert werden.
- **Git-Repository erforderlich**: Die Arena benötigt ein Git-Repository für die Worktree-Isolation. Sie kann nicht in Nicht-Git-Verzeichnissen verwendet werden.

## Vergleich mit anderen Multi-Agent-Modi

Agent Arena ist einer von mehreren geplanten Multi-Agent-Modi in Qwen Code. **Agent Team** und **Agent Swarm** sind noch nicht implementiert – die folgende Tabelle beschreibt ihr geplantes Design als Referenz.

|                   | **Agent Arena**                                        | **Agent Team** (geplant)                           | **Agent Swarm** (geplant)                                |
| :---------------- | :----------------------------------------------------- | :------------------------------------------------- | :------------------------------------------------------- |
| **Ziel**          | Wettbewerbsorientiert: Finde die beste Lösung für _dieselbe_ Aufgabe | Kollaborativ: Bearbeite _verschiedene_ Aspekte gemeinsam | Batch-parallel: Dynamisches Spawnen von Workern für Massenaufgaben |
| **Agenten**        | Vorkonfigurierte Modelle treten unabhängig gegeneinander an            | Teammitglieder arbeiten mit zugewiesenen Rollen zusammen          | Worker werden on-the-fly erzeugt und nach Abschluss zerstört      |
| **Kommunikation** | Keine Kommunikation zwischen Agenten                           | Direktes Peer-to-Peer-Messaging                      | Einseitig: Ergebnisse werden vom Parent aggregiert                    |
| **Isolation**     | Vollständig: separate Git Worktrees                           | Unabhängige Sessions mit gemeinsamer Aufgabenliste         | Leichtgewichtiger, ephemerer Context pro Worker                 |
| **Output**        | Eine ausgewählte Lösung wird auf den Workspace angewendet             | Synthetisierte Ergebnisse aus mehreren Perspektiven     | Aggregierte Ergebnisse aus der parallelen Verarbeitung              |
| **Am besten geeignet für**      | Benchmarking, Auswahl zwischen Modell-Ansätzen        | Recherche, komplexe Kollaboration, Cross-Layer-Arbeit  | Batch-Operationen, Datenverarbeitung, Map-Reduce-Aufgaben      |

## Nächste Schritte

Erkunde verwandte Ansätze für parallele und delegierte Arbeit:

- **Leichtgewichtige Delegation**: [Subagents](/users/features/sub-agents) bearbeiten fokussierte Teilaufgaben innerhalb deiner Session – besser, wenn du keinen Modellvergleich benötigst
- **Manuelle parallele Sessions**: Starte mehrere Qwen Code Sessions selbst in separaten Terminals mit [Git worktrees](https://git-scm.com/docs/git-worktree) für volle manuelle Kontrolle