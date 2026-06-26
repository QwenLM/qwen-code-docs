# Agenten-Arena

> Mehrere KI-Modelle gleichzeitig einsetzen, um dieselbe Aufgabe auszuführen, ihre Lösungen nebeneinander vergleichen und das beste Ergebnis auswählen, um es in Ihrem Arbeitsbereich anzuwenden.

> [!warning]
> Die Agenten-Arena ist experimentell. Sie hat [bekannte Einschränkungen](#einschränkungen) bei Anzeigemodi und Sitzungsverwaltung.

Die Agenten-Arena ermöglicht es Ihnen, mehrere KI-Modelle gegeneinander antreten zu lassen, um dieselbe Aufgabe zu lösen. Jedes Modell läuft als vollständig unabhängiger Agent in einem eigenen isolierten Git-Worktree, sodass Dateioperationen sich niemals gegenseitig beeinflussen. Wenn alle Agenten fertig sind, vergleichen Sie die Ergebnisse und wählen einen Gewinner aus, der in Ihren Hauptarbeitsbereich zurückgeführt wird.

Im Gegensatz zu [Subagenten](./sub-agents.md), die fokussierte Teilaufgaben innerhalb einer einzigen Sitzung delegieren, sind Arena-Agenten vollständige, übergeordnete Agenteninstanzen – jede mit eigenem Modell, eigenem Kontextfenster und vollem Tool-Zugriff.

Diese Seite behandelt:

- [Wann sollte die Agenten-Arena verwendet werden?](#wann-sollte-die-agenten-arena-verwendet-werden)
- [Eine Arena-Sitzung starten](#eine-arena-sitzung-starten)
- [Mit Agenten interagieren](#mit-agenten-interagieren), einschließlich Anzeigemodi und Navigation
- [Ergebnisse vergleichen und einen Gewinner auswählen](#ergebnisse-vergleichen-und-einen-gewinner-auswählen)
- [Best Practices](#best-practices)

## Wann sollte die Agenten-Arena verwendet werden?

Die Agenten-Arena ist am effektivsten, wenn Sie **bewerten oder vergleichen** möchten, wie verschiedene Modelle dasselbe Problem angehen. Die stärksten Anwendungsfälle sind:

- **Modell-Benchmarking**: Evaluieren Sie die Fähigkeiten verschiedener Modelle an echten Aufgaben in Ihrer tatsächlichen Codebasis, nicht an synthetischen Benchmarks.
- **Best-of-N-Auswahl**: Holen Sie mehrere unabhängige Lösungen und wählen Sie die beste Implementierung aus.
- **Ansätze erkunden**: Sehen Sie, wie verschiedene Modelle dasselbe Problem durchdenken und lösen – nützlich zum Lernen und für Erkenntnisse.
- **Risikominimierung**: Validieren Sie bei kritischen Änderungen, dass mehrere Modelle zu einem ähnlichen Ansatz gelangen, bevor Sie festschreiben.

Die Agenten-Arena verbraucht deutlich mehr Tokens als eine einzelne Sitzung (jeder Agent hat sein eigenes Kontextfenster und eigene Modellaufrufe). Sie eignet sich am besten, wenn der Wert des Vergleichs die Kosten rechtfertigt. Für Routineaufgaben, bei denen Sie Ihrem Standardmodell vertrauen, ist eine einzelne Sitzung effizienter.

## Eine Arena-Sitzung starten

Verwenden Sie den Slash-Befehl `/arena`, um eine Sitzung zu starten. Geben Sie die Modelle an, die gegeneinander antreten sollen, sowie die Aufgabe:

```
/arena --models qwen3.5-plus,glm-5,kimi-k2.5 "Refactor the authentication module to use JWT tokens"
```

Wenn Sie `--models` weglassen, erscheint ein interaktiver Modell-Auswahldialog, in dem Sie aus Ihren konfigurierten Anbietern wählen können.

### Was passiert, wenn Sie starten

1. **Worktree-Einrichtung**: Qwen Code erstellt isolierte Git-Worktrees für jeden Agenten unter `~/.qwen/arena/<session-id>/worktrees/<model-name>/`. Jeder Worktree spiegelt den genauen Zustand Ihres aktuellen Arbeitsverzeichnisses wider – einschließlich gestagter Änderungen, ungestagter Änderungen und unverfolgter Dateien.
2. **Agenten-Erzeugung**: Jeder Agent startet in seinem eigenen Worktree mit vollem Tool-Zugriff und seinem konfigurierten Modell. Die Agenten werden nacheinander gestartet, führen aber parallel aus.
3. **Ausführung**: Alle Agenten arbeiten unabhängig an der Aufgabe, ohne gemeinsamen Zustand oder Kommunikation. Sie können den Fortschritt überwachen und mit jedem Agenten interagieren.
4. **Abschluss**: Wenn alle Agenten fertig sind (oder fehlschlagen), gelangen Sie in die Phase des Ergebnisvergleichs.

## Mit Agenten interagieren

### Anzeigemodi

Die Agenten-Arena unterstützt derzeit den **In-Prozess-Modus**, bei dem alle Agenten asynchron im selben Terminalprozess laufen. Eine Registerkartenleiste am unteren Rand des Terminals ermöglicht das Umschalten zwischen den Agenten.

> [!note]
> **Split-Pane-Anzeigemodi sind für die Zukunft geplant.** Wir beabsichtigen, tmux-basierte und iTerm2-basierte Split-Pane-Layouts zu unterstützen, bei denen jeder Agent seinen eigenen Terminalbereich für eine echte Nebeneinanderansicht erhält. Derzeit ist nur das In-Prozess-Tab-Umschalten verfügbar.

### Zwischen den Agenten navigieren

Im In-Prozess-Modus können Sie mit Tastaturkürzeln zwischen den Agentenansichten wechseln:

| Tastenkürzel | Aktion                                        |
| :----------- | :-------------------------------------------- |
| `Rechts`     | Zum nächsten Agenten-Tab wechseln             |
| `Links`      | Zum vorherigen Agenten-Tab wechseln           |
| `Oben`       | Fokus auf das Eingabefeld legen               |
| `Unten`      | Fokus auf die Agenten-Tab-Leiste legen        |

Die Tab-Leiste zeigt den aktuellen Status jedes Agenten an:

| Indikator | Bedeutung                          |
| :-------- | :--------------------------------- |
| `●`       | Läuft oder im Leerlauf             |
| `✓`       | Erfolgreich abgeschlossen          |
| `✗`       | Fehlgeschlagen                     |
| `○`       | Abgebrochen                        |

### Mit einzelnen Agenten interagieren

Wenn Sie den Tab eines Agenten anzeigen, können Sie:

- **Nachrichten senden** – geben Sie im Eingabebereich zusätzliche Anweisungen für den Agenten ein
- **Tool-Aufrufe genehmigen** – wenn ein Agent eine Tool-Genehmigung anfordert, erscheint der Bestätigungsdialog in seinem Tab
- **Vollständigen Verlauf anzeigen** – scrollen Sie durch die gesamte Konversation des Agenten, einschließlich Modellausgabe, Tool-Aufrufen und Ergebnissen

Jeder Agent ist eine vollständige, unabhängige Sitzung. Alles, was Sie mit dem Hauptagenten tun können, können Sie auch mit einem Arena-Agenten tun.

## Ergebnisse vergleichen und einen Gewinner auswählen

Wenn alle Agenten abgeschlossen sind, wechselt die Arena in die Phase des Ergebnisvergleichs. Sie sehen:
- **Statusübersicht**: Welche Agents erfolgreich waren, fehlgeschlagen oder abgebrochen wurden
- **Ausführungsmetriken**: Dauer, Anzahl der Denkrunden, Tokenverbrauch und Anzahl der Tool-Aufrufe pro Agent
- **Arena-Vergleichszusammenfassung**: Gemeinsam geänderte Dateien vs. nur von einem Agent geänderte Dateien, Anzahl der Zeilenänderungen, Tokeneffizienz und eine zusammenfassende Beschreibung des Ansatzes auf hoher Ebene, die aus den Diffs, Metriken und dem Gesprächsverlauf jedes Agents generiert wurde

Ein Auswahldialog zeigt die erfolgreichen Agents an. Wählen Sie einen aus, um dessen Änderungen auf Ihren Hauptarbeitsbereich anzuwenden, oder verwerfen Sie alle Ergebnisse. Drücken Sie `p`, um eine Schnellvorschau für den markierten Agent ein-/auszuschalten, oder `d`, um den detaillierten Diff dieses Agents vor der Auswahl eines Gewinners umzuschalten.

### Was passiert, wenn Sie einen Gewinner auswählen

1. Die Änderungen des Gewinner-Agents werden als Diff gegenüber der Basisversion extrahiert.
2. Der Diff wird auf Ihr Hauptarbeitsverzeichnis angewendet.
3. Alle Worktrees und temporären Branches werden automatisch bereinigt.

Wenn Sie den vollständigen Denkpfad vor der Entscheidung überprüfen möchten, ist der vollständige Gesprächsverlauf jedes Agents über die Tab-Leiste verfügbar, während der Auswahldialog aktiv ist.

## Konfiguration

Das Arena-Verhalten kann in [settings.json](../configuration/settings.md) angepasst werden:

```json
{
  "arena": {
    "worktreeBaseDir": "~/.qwen/arena",
    "maxRoundsPerAgent": 50,
    "timeoutSeconds": 600
  }
}
```

| Einstellung                   | Beschreibung                        | Standard         |
| :---------------------------- | :---------------------------------- | :--------------- |
| `arena.worktreeBaseDir`   | Basisverzeichnis für Arena-Worktrees | `~/.qwen/arena` |
| `arena.maxRoundsPerAgent` | Maximale Anzahl von Denkrunden pro Agent | `50`            |
| `arena.timeoutSeconds`    | Timeout für jeden Agent in Sekunden  | `600`           |

## Bewährte Vorgehensweisen

### Wählen Sie Modelle, die sich ergänzen

Arena ist am wertvollsten, wenn Sie Modelle mit sinnvoll unterschiedlichen Stärken vergleichen. Zum Beispiel:

```
/arena --models qwen3.5-plus,glm-5,kimi-k2.5 "Optimize the database query layer"
```

Drei Versionen derselben Modellfamilie zu vergleichen liefert weniger Erkenntnisse als ein Vergleich über verschiedene Anbieter hinweg.

### Aufgaben in sich abgeschlossen halten

Arena-Agents arbeiten unabhängig und ohne Kommunikation. Aufgaben sollten im Prompt vollständig beschreibbar sein, ohne dass ein Hin und Her erforderlich ist:

**Gut**: "Refactor the payment module to use the strategy pattern. Update all tests."

**Weniger effektiv**: "Let's discuss how to improve the payment module" — dies profitiert von einem Gespräch, das besser für eine einzelne Sitzung geeignet ist.

### Begrenzen Sie die Anzahl der Agents

Bis zu 5 Agents können gleichzeitig ausgeführt werden. In der Praxis bieten 2-3 Agents das beste Verhältnis von Vergleichswert zu Ressourcenkosten. Mehr Agents bedeuten:

- Höhere Tokenkosten (jeder Agent hat seinen eigenen Kontext)
- Längere Gesamtausführungszeit
- Mehr zu vergleichende Ergebnisse

Beginnen Sie mit 2-3 und erhöhen Sie die Anzahl nur, wenn der Vergleichswert dies rechtfertigt.

### Setzen Sie Arena für Entscheidungen mit großer Auswirkung ein

Arena glänzt, wenn es sich lohnt, mehrere Modelle auszuführen:

- Auswahl einer Architektur für ein neues Modul
- Auswahl eines Ansatzes für eine komplexe Refaktorisierung
- Validierung einer kritischen Fehlerbehebung aus mehreren Blickwinkeln

Für Routineänderungen wie das Umbenennen einer Variable oder das Aktualisieren einer Konfigurationsdatei ist eine einzelne Sitzung schneller und günstiger.

## Fehlerbehebung

### Agents starten nicht

- Stellen Sie sicher, dass jedes Modell in `--models` ordnungsgemäß mit gültigen API-Anmeldedaten konfiguriert ist
- Überprüfen Sie, dass Ihr Arbeitsverzeichnis ein Git-Repository ist (Worktrees erfordern Git)
- Stellen Sie sicher, dass Sie Schreibzugriff auf das Worktree-Basisverzeichnis haben (`~/.qwen/arena/` standardmäßig)

### Worktree-Erstellung schlägt fehl

- Führen Sie `git worktree list` aus, um nach veralteten Worktrees aus vorherigen Sitzungen zu suchen
- Bereinigen Sie veraltete Worktrees mit `git worktree prune`
- Stellen Sie sicher, dass Ihre Git-Version Worktrees unterstützt (`git --version`, erfordert Git 2.5+)

### Agent dauert zu lange

- Erhöhen Sie das Timeout: setzen Sie `arena.timeoutSeconds` in den Einstellungen
- Reduzieren Sie die Aufgabenkomplexität – Arena-Aufgaben sollten fokussiert und klar definiert sein
- Verringern Sie `arena.maxRoundsPerAgent`, wenn Agents zu viele Runden benötigen

### Anwenden des Gewinners schlägt fehl

- Überprüfen Sie auf nicht committete Änderungen in Ihrem Hauptarbeitsverzeichnis, die zu Konflikten führen könnten
- Der Diff wird als Patch angewendet – Merge-Konflikte sind möglich, wenn sich Ihr Arbeitsverzeichnis während der Sitzung geändert hat

## Einschränkungen

Agent Arena ist experimentell. Derzeitige Einschränkungen:

- **Nur In-Prozess-Modus**: Die geteilte Bildschirmanzeige über tmux oder iTerm2 ist noch nicht verfügbar. Alle Agents laufen innerhalb eines einzigen Terminalfensters mit Tab-Umschaltung.
- **Keine Diff-Vorschau vor der Auswahl**: Sie können den Gesprächsverlauf jedes Agents einsehen, aber es gibt keinen einheitlichen Diff-Viewer, um Lösungen vor der Auswahl eines Gewinners nebeneinander zu vergleichen.
- **Keine Worktree-Aufbewahrung**: Worktrees werden nach der Auswahl immer bereinigt. Es gibt keine Möglichkeit, sie zur weiteren Überprüfung aufzubewahren.
- **Keine Sitzungswiederaufnahme**: Arena-Sitzungen können nach dem Beenden nicht fortgesetzt werden. Wenn Sie das Terminal mitten in der Sitzung schließen, bleiben die Worktrees auf der Festplatte und müssen manuell über `git worktree prune` bereinigt werden.
- **Maximal 5 Agents**: Die harte Grenze von 5 gleichzeitigen Agents kann nicht geändert werden.
- **Git-Repository erforderlich**: Arena benötigt ein Git-Repository für die Worktree-Isolierung. Es kann nicht in Nicht-Git-Verzeichnissen verwendet werden.
## Vergleich mit anderen Multi-Agent-Modi

Agent Arena ist einer von mehreren geplanten Multi-Agent-Modi in Qwen Code. **Agent Team** und **Agent Swarm** sind noch nicht implementiert – die folgende Tabelle beschreibt deren vorgesehenen Entwurf als Referenz.

|                   | **Agent Arena**                                        | **Agent Team** (geplant)                           | **Agent Swarm** (geplant)                                |
| :---------------- | :----------------------------------------------------- | :------------------------------------------------- | :------------------------------------------------------- |
| **Ziel**          | Wettbewerbsorientiert: Finde die beste Lösung für _dieselbe_ Aufgabe | Kollaborativ: Bearbeite _verschiedene_ Aspekte gemeinsam | Batch-parallel: Spawne dynamisch Worker für Massenaufgaben |
| **Agenten**       | Vorkonfigurierte Modelle konkurrieren unabhängig voneinander | Teammitglieder arbeiten mit zugewiesenen Rollen zusammen | Worker werden bei Bedarf gespawnt und nach Abschluss zerstört |
| **Kommunikation** | Keine Kommunikation zwischen Agenten                   | Direkte Peer-to-Peer-Nachrichten                   | Einweg: Ergebnisse werden vom Parent aggregiert          |
| **Isolation**     | Vollständig: separate Git-Worktrees                    | Unabhängige Sitzungen mit gemeinsamer Aufgabenliste | Leichter kurzlebiger Kontext pro Worker                  |
| **Ausgabe**       | Eine ausgewählte Lösung wird im Workspace angewandt    | Synthetisierte Ergebnisse aus mehreren Perspektiven | Aggregierte Ergebnisse aus paralleler Verarbeitung       |
| **Am besten geeignet für** | Benchmarking, Auswahl zwischen Modellansätzen | Forschung, komplexe Zusammenarbeit, schichtübergreifende Arbeit | Batch-Operationen, Datenverarbeitung, Map-Reduce-Aufgaben |

## Nächste Schritte

Erkunde verwandte Ansätze für parallele und delegierte Arbeit:

- **Leichte Delegation**: [Subagents](./sub-agents.md) bearbeiten fokussierte Teilaufgaben innerhalb deiner Sitzung – besser geeignet, wenn du keinen Modellvergleich benötigst
- **Manuelle parallele Sitzungen**: Starte mehrere Qwen Code-Sitzungen selbst in separaten Terminals mit [Git Worktrees](https://git-scm.com/docs/git-worktree) für vollständige manuelle Kontrolle
