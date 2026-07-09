# Resolve Command Design

## Ziel

Füge einen von Maintainern ausgelösten `@qwen-code /resolve`-Befehl für Pull Requests hinzu, die durch Merge-Konflikte mit dem Default-Branch blockiert sind.

## Umfang

Die erste Version ist bewusst konservativ gehalten:

- Der Befehl läuft nur in `QwenLM/qwen-code`.
- Der Anfordernde muss über `write`-, `maintain`- oder `admin`-Berechtigungen verfügen.
- Das Ziel muss ein offener Pull Request sein.
- Der Pull-Request-Branch muss sich im Base-Repository befinden.
- Fork-Pull-Requests werden als nicht unterstützt gemeldet, anstatt gepusht zu werden.
- Der Agent erhält kein GitHub-Token. Er kann nur lokal bearbeiten und committen.
- Ein separater Publish-Schritt injiziert `CI_DEV_BOT_PAT`, um zu pushen und zu kommentieren.

## Workflow

1. Der bestehende PR-Command-Workflow verarbeitet `issue_comment` oder `workflow_dispatch` und bearbeitet den Ziel-Pull-Request.
2. Ein Authorization-Job prüft die Collaborator-Berechtigung des Anfordernden mit `CI_BOT_PAT`.
3. Der Resolve-Job bestätigt Kommentar-Trigger mit einer `eyes`-Reaktion.
4. Der Job liest die Pull-Request-Metadaten und lehnt geschlossene, Draft-, konfliktfreie oder Fork-Pull-Requests ab.
5. Für geeignete Pull Requests führt der Job einen Checkout des Pull-Request-Branches durch, wobei persistierte Credentials deaktiviert sind, fetcht den Base-Branch und prüft, ob der Branch noch auf den erwarteten Head-SHA zeigt.
6. Qwen Code wird ohne GitHub-Credentials ausgeführt, führt einen Merge von `origin/<base>` durch, löst Konflikte auf, überprüft das Ergebnis, committet und erstellt ein Summary-Artefakt.
7. Ein deterministischer Verifizierungsschritt schlägt bei ungelösten Konflikten, fehlendem Summary oder fehlgeschlagenen Checks fehl.
8. Der Publish-Schritt pusht mit `--force-with-lease` gegen den ursprünglichen Head-SHA und kommentiert mit der Zusammenfassung der Konfliktlösung.

## Nicht im Umfang enthalten

- Automatisches Pushen zu Fork-Pull-Requests.
- Erstellung von Ersatz-Pull-Requests für externe Contributors.
- Geplantes Scannen von veralteten Pull Requests mit Konflikten.
- Auflösen von Nicht-Mergeable-Zuständen, die keine direkten Merge-Konflikte sind.