# Agent Arena

> Starte mehrere KI-Modelle gleichzeitig, um dieselbe Aufgabe auszuführen, vergleiche ihre Lösungen nebeneinander und wähle das beste Ergebnis aus, um es in deinem Arbeitsbereich zu übernehmen.

> [!warning]
> Agent Arena ist experimentell. Es hat [bekannte Einschränkungen](#einschränkungen) in Bezug auf Anzeigemodi und Sitzungsverwaltung.

Agent Arena ermöglicht es dir, mehrere KI-Modelle gegeneinander antreten zu lassen, um dieselbe Aufgabe zu lösen. Jedes Modell läuft als vollständig unabhängiger Agent in einem eigenen isolierten Git-Worktree, sodass Dateioperationen sich niemals gegenseitig beeinflussen. Wenn alle Agenten fertig sind, vergleichst du die Ergebnisse und wählst einen Gewinner aus, der zurück in deinen Hauptarbeitsbereich übernommen wird.

Im Gegensatz zu [Unteragenten](./sub-agents.md), die fokussierte Teilaufgaben innerhalb einer einzelnen Sitzung delegieren, sind Arena-Agenten vollständige, übergeordnete Agenteninstanzen – jede mit eigenem Modell, eigenem Kontextfenster und vollem Tool-Zugriff.

Diese Seite behandelt:

- [Wann du Agent Arena verwenden solltest](#wann-du-agent-arena-verwenden-solltest)
- [Eine Arena-Sitzung starten](#eine-arena-sitzung-starten)
- [Interaktion mit Agenten](#interaktion-mit-agenten), einschließlich Anzeigemodi und Navigation
- [Ergebnisse vergleichen und einen Gewinner auswählen](#ergebnisse-vergleichen-und-einen-gewinner-auswählen)
- [Bewährte Vorgehensweisen](#bewährte-vorgehensweisen)
- [Konfiguration](#konfiguration)
- [Fehlerbehebung](#fehlerbehebung)
- [Einschränkungen](#einschränkungen)
- [Vergleich mit anderen Multi-Agent-Modi](#vergleich-mit-anderen-multi-agent-modi)
- [Nächste Schritte](#nächste-schritte)

## Wann du Agent Arena verwenden solltest

Agent Arena ist am effektivsten, wenn du **bewerten oder vergleichen** möchtest, wie verschiedene Modelle dasselbe Problem angehen. Die stärksten Anwendungsfälle sind:

- **Modell-Benchmarking**: Bewerte die Fähigkeiten verschiedener Modelle anhand realer Aufgaben in deiner tatsächlichen Codebasis, nicht mit synthetischen Benchmarks.
- **Best-of-N-Auswahl**: Erhalte mehrere unabhängige Lösungen und wähle die beste Implementierung aus.
- **Ansätze erkunden**: Sieh dir an, wie verschiedene Modelle über dasselbe Problem nachdenken und es lösen – nützlich für Lernen und Erkenntnisse.
- **Risikominimierung**: Für kritische Änderungen validierst du, dass mehrere Modelle zu einem ähnlichen Ansatz gelangen, bevor du committest.

Agent Arena verbraucht deutlich mehr Tokens als eine einzelne Sitzung (jeder Agent hat sein eigenes Kontextfenster und führt eigene Modellaufrufe durch). Es funktioniert am besten, wenn der Wert des Vergleichs die Kosten rechtfertigt. Für Routineaufgaben, bei denen du deinem Standardmodell vertraust, ist eine einzelne Sitzung effizienter.

## Eine Arena-Sitzung starten

Verwende den Slash-Befehl `/arena`, um eine Sitzung zu starten. Gib die Modelle an, die gegeneinander antreten sollen, sowie die Aufgabe:

```
/arena --models qwen3.5-plus,glm-5,kimi-k2.5 "Refactoriere das Authentifizierungsmodul zur Verwendung von JWT-Tokens"
```

Wenn du `--models` weglässt, erscheint ein interaktiver Modellauswahldialog, in dem du aus deinen konfigurierten Anbietern wählen kannst.

### Was passiert, wenn du startest

1. **Worktree-Einrichtung**: Qwen Code erstellt isolierte Git-Worktrees für jeden Agenten unter `~/.qwen/arena/<sitzungs-id>/worktrees/<modellname>/`. Jeder Worktree spiegelt exakt den aktuellen Zustand deines Arbeitsverzeichnisses wider – einschließlich gestagter Änderungen, ungestagter Änderungen und unversionierter Dateien.
2. **Agenten starten**: Jeder Agent startet in seinem eigenen Worktree mit vollem Tool-Zugriff und seinem konfigurierten Modell. Die Agenten werden nacheinander gestartet, führen aber parallel aus.
3. **Ausführung**: Alle Agenten arbeiten unabhängig an der Aufgabe, ohne gemeinsamen Zustand oder Kommunikation. Du kannst ihren Fortschritt überwachen und mit jedem von ihnen interagieren.
4. **Abschluss**: Wenn alle Agenten fertig sind (oder fehlschlagen), beginnst du mit der Ergebnisvergleichsphase.

## Interaktion mit Agenten

### Anzeigemodi

Agent Arena unterstützt derzeit den **In-Prozess-Modus**, bei dem alle Agenten asynchron innerhalb desselben Terminalprozesses laufen. Eine Registerkartenleiste am unteren Rand des Terminals ermöglicht es dir, zwischen den Agenten zu wechseln.

> [!note]
> **Split-Pane-Anzeigemodi sind für die Zukunft geplant.** Wir beabsichtigen, tmux-basierte und iTerm2-basierte Split-Pane-Layouts zu unterstützen, bei denen jeder Agent seinen eigenen Terminalbereich für eine echte nebeneinander Ansicht erhält. Derzeit ist nur das Wechseln zwischen Registerkarten im In-Prozess-Modus verfügbar.

### Zwischen Agenten navigieren

Im In-Prozess-Modus kannst du mit Tastenkürzeln zwischen den Agentenansichten wechseln:

| Kürzel    | Aktion                                 |
| :-------- | :------------------------------------- |
| `Rechts`  | Zur nächsten Agenten-Registerkarte     |
| `Links`   | Zur vorherigen Agenten-Registerkarte   |
| `Oben`    | Fokus auf das Eingabefeld setzen       |
| `Unten`   | Fokus auf die Agenten-Registerkartenleiste setzen |

Die Registerkartenleiste zeigt den aktuellen Status jedes Agenten:

| Indikator | Bedeutung                      |
| :-------- | :----------------------------- |
| `●`       | Wird ausgeführt oder inaktiv   |
| `✓`       | Erfolgreich abgeschlossen      |
| `✗`       | Fehlgeschlagen                 |
| `○`       | Abgebrochen                    |

### Mit einzelnen Agenten interagieren

Wenn du die Registerkarte eines Agenten betrachtest, kannst du:

- **Nachrichten senden** — gib im Eingabebereich zusätzliche Anweisungen für den Agenten ein
- **Tool-Aufrufe genehmigen** — wenn ein Agent eine Tool-Genehmigung anfordert, erscheint der Bestätigungsdialog in seiner Registerkarte
- **Vollständigen Verlauf anzeigen** — scrolle durch die gesamte Unterhaltung des Agenten, einschließlich Modellausgaben, Tool-Aufrufen und Ergebnissen

Jeder Agent ist eine vollwertige, unabhängige Sitzung. Alles, was du mit dem Hauptagenten tun kannst, kannst du auch mit einem Arena-Agenten tun.

## Ergebnisse vergleichen und einen Gewinner auswählen

Wenn alle Agenten abgeschlossen sind, beginnt die Ergebnisvergleichsphase der Arena. Du siehst:

- **Statusübersicht**: Welche Agenten erfolgreich waren, fehlgeschlagen sind oder abgebrochen wurden
- **Ausführungsmetriken**: Dauer, Anzahl der Reasoning-Runden, Token-Verbrauch und Anzahl der Tool-Aufrufe für jeden Agenten
- **Arena-Vergleichszusammenfassung**: Gemeinsam geänderte Dateien vs. Dateien, die nur von einem Agenten geändert wurden, Anzahl der Zeilenänderungen, Token-Effizienz und eine Zusammenfassung des Ansatzes auf hoher Ebene, generiert aus den Diffs, Metriken und dem Unterhaltungsverlauf jedes Agenten

Ein Auswahldialog zeigt die erfolgreichen Agenten an. Wähle einen aus, um seine Änderungen auf deinen Hauptarbeitsbereich anzuwenden, oder verwerfe alle Ergebnisse. Drücke `p`, um eine schnelle Vorschau für den hervorgehobenen Agenten umzuschalten, oder `d`, um den detaillierten Diff dieses Agenten umzuschalten, bevor du einen Gewinner auswählst.

### Was passiert, wenn du einen Gewinner auswählst

1. Die Änderungen des Gewinner-Agenten werden als Diff gegenüber der Basislinie extrahiert
2. Der Diff wird auf dein Hauptarbeitsverzeichnis angewendet
3. Alle Worktrees und temporären Branches werden automatisch bereinigt

Wenn du den vollständigen Reasoning-Pfad vor der Entscheidung überprüfen möchtest, ist der vollständige Unterhaltungsverlauf jedes Agenten über die Registerkartenleiste verfügbar, solange der Auswahldialog aktiv ist.

## Konfiguration

Das Verhalten der Arena kann in der [settings.json](../configuration/settings.md) angepasst werden:

```json
{
  "arena": {
    "worktreeBaseDir": "~/.qwen/arena",
    "maxRoundsPerAgent": 50,
    "timeoutSeconds": 600
  }
}
```

| Einstellung                   | Beschreibung                        | Standard       |
| :---------------------------- | :---------------------------------- | :------------- |
| `arena.worktreeBaseDir`       | Basisverzeichnis für Arena-Worktrees | `~/.qwen/arena` |
| `arena.maxRoundsPerAgent`     | Maximale Reasoning-Runden pro Agent | `50`           |
| `arena.timeoutSeconds`        | Timeout für jeden Agenten in Sekunden| `600`          |

## Bewährte Vorgehensweisen

### Wähle Modelle, die sich ergänzen

Die Arena ist am wertvollsten, wenn du Modelle mit sinnvoll unterschiedlichen Stärken vergleichst. Beispiel:

```
/arena --models qwen3.5-plus,glm-5,kimi-k2.5 "Optimiere die Datenbankabfrageschicht"
```

Drei Versionen derselben Modellfamilie zu vergleichen, liefert weniger Erkenntnisse als ein Vergleich über Anbieter hinweg.

### Halte Aufgaben in sich geschlossen

Arena-Agenten arbeiten unabhängig und ohne Kommunikation. Aufgaben sollten vollständig im Prompt beschreibbar sein, ohne dass ein Hin und Her erforderlich ist:

**Gut**: „Refaktoriere das Zahlungsmodul zur Verwendung des Strategiemusters. Aktualisiere alle Tests."

**Weniger effektiv**: „Lass uns besprechen, wie wir das Zahlungsmodul verbessern können" – dies profitiert von einer Unterhaltung und eignet sich besser für eine einzelne Sitzung.

### Begrenze die Anzahl der Agenten

Bis zu 5 Agenten können gleichzeitig ausgeführt werden. In der Praxis bieten 2-3 Agenten die beste Balance zwischen Vergleichswert und Ressourcenkosten. Mehr Agenten bedeuten:

- Höhere Token-Kosten (jeder Agent hat sein eigenes Kontextfenster)
- Längere Gesamtausführungszeit
- Mehr Ergebnisse zum Vergleichen

Beginne mit 2-3 und skaliere nur dann hoch, wenn der Vergleichswert es rechtfertigt.

### Verwende Arena für Entscheidungen mit großer Tragweite

Die Arena glänzt, wenn der Einsatz den Betrieb mehrerer Modelle rechtfertigt:

- Auswahl einer Architektur für ein neues Modul
- Auswahl eines Ansatzes für ein komplexes Refactoring
- Validierung eines kritischen Bugfixes aus mehreren Perspektiven

Für Routineänderungen wie das Umbenennen einer Variable oder das Aktualisieren einer Konfigurationsdatei ist eine einzelne Sitzung schneller und günstiger.

## Fehlerbehebung

### Agenten starten nicht

- Überprüfe, ob jedes Modell in `--models` ordnungsgemäß mit gültigen API-Anmeldeinformationen konfiguriert ist
- Stelle sicher, dass dein Arbeitsverzeichnis ein Git-Repository ist (Worktrees benötigen Git)
- Stelle sicher, dass du Schreibzugriff auf das Basisverzeichnis der Worktrees hast (standardmäßig `~/.qwen/arena/`)

### Worktree-Erstellung schlägt fehl

- Führe `git worktree list` aus, um nach veralteten Worktrees von vorherigen Sitzungen zu suchen
- Bereinige veraltete Worktrees mit `git worktree prune`
- Stelle sicher, dass deine Git-Version Worktrees unterstützt (`git --version`, erfordert Git 2.5+)

### Agent braucht zu lange

- Erhöhe das Timeout: setze `arena.timeoutSeconds` in den Einstellungen
- Reduziere die Aufgabenkomplexität – Arena-Aufgaben sollten fokussiert und klar definiert sein
- Senke `arena.maxRoundsPerAgent`, wenn Agenten zu viele Runden verbrauchen

### Anwenden des Gewinners schlägt fehl

- Überprüfe auf nicht committete Änderungen in deinem Hauptarbeitsverzeichnis, die möglicherweise in Konflikt stehen
- Der Diff wird als Patch angewendet – Merge-Konflikte sind möglich, wenn sich dein Arbeitsverzeichnis während der Sitzung geändert hat

## Einschränkungen

Agent Arena ist experimentell. Aktuelle Einschränkungen:

- **Nur In-Prozess-Modus**: Split-Pane-Anzeige via tmux oder iTerm2 ist noch nicht verfügbar. Alle Agenten laufen innerhalb eines einzelnen Terminalfensters mit Registerkartenwechsel.
- **Keine Diff-Vorschau vor der Auswahl**: Du kannst den Unterhaltungsverlauf jedes Agenten einsehen, aber es gibt keine einheitliche Diff-Ansicht, um Lösungen nebeneinander zu vergleichen, bevor du einen Gewinner auswählst.
- **Keine Worktree-Aufbewahrung**: Worktrees werden nach der Auswahl immer bereinigt. Es gibt keine Option, sie zur weiteren Untersuchung zu behalten.
- **Keine Sitzungswiederaufnahme**: Arena-Sitzungen können nach dem Beenden nicht wieder aufgenommen werden. Wenn du das Terminal während einer Sitzung schließt, bleiben die Worktrees auf der Festplatte und müssen manuell mit `git worktree prune` bereinigt werden.
- **Maximal 5 Agenten**: Die harte Grenze von 5 gleichzeitigen Agenten kann nicht geändert werden.
- **Git-Repository erforderlich**: Arena benötigt ein Git-Repository für die Worktree-Isolation. Es kann nicht in Verzeichnissen ohne Git verwendet werden.

## Vergleich mit anderen Multi-Agent-Modi

Agent Arena ist einer von mehreren geplanten Multi-Agent-Modi in Qwen Code. **Agent Team** und **Agent Swarm** sind noch nicht implementiert – die folgende Tabelle beschreibt ihr beabsichtigtes Design als Referenz.

|                    | **Agent Arena**                                        | **Agent Team** (geplant)                            | **Agent Swarm** (geplant)                                |
| :----------------- | :----------------------------------------------------- | :-------------------------------------------------- | :------------------------------------------------------- |
| **Ziel**           | Wettbewerbsorientiert: Finde die beste Lösung für _dieselbe_ Aufgabe | Kollaborativ: Bearbeite _verschiedene_ Aspekte gemeinsam | Stapelparallel: Spawne dynamisch Worker für Massenaufgaben |
| **Agenten**        | Vorkonfigurierte Modelle treten unabhängig gegeneinander an | Teammitglieder arbeiten mit zugewiesenen Rollen zusammen | Worker werden bei Bedarf erstellt und nach Abschluss zerstört |
| **Kommunikation**  | Keine Kommunikation zwischen den Agenten               | Direkte Peer-to-Peer-Nachrichten                    | Einweg: Ergebnisse werden vom übergeordneten Agenten aggregiert |
| **Isolation**      | Vollständig: separate Git-Worktrees                    | Unabhängige Sitzungen mit gemeinsamem Aufgabenliste | Leichter, flüchtiger Kontext pro Worker                  |
| **Ausgabe**        | Eine ausgewählte Lösung wird auf den Arbeitsbereich angewendet | Synthetisierte Ergebnisse aus mehreren Perspektiven | Aggregierte Ergebnisse aus paralleler Verarbeitung       |
| **Am besten für**  | Benchmarking, Auswahl zwischen Modellansätzen          | Recherche, komplexe Zusammenarbeit, schichtübergreifende Arbeit | Batch-Operationen, Datenverarbeitung, Map-Reduce-Aufgaben |

## Nächste Schritte

Erkunde verwandte Ansätze für parallele und delegierte Arbeit:

- **Leichte Delegation**: [Unteragenten](./sub-agents.md) bearbeiten fokussierte Teilaufgaben innerhalb deiner Sitzung – besser, wenn du keinen Modellvergleich benötigst.
- **Manuelle parallele Sitzungen**: Führe mehrere Qwen Code-Sitzungen selbst in separaten Terminals mit [Git-Worktrees](https://git-scm.com/docs/git-worktree) aus, für vollständige manuelle Kontrolle.