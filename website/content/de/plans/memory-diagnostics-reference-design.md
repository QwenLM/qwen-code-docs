# Referenzdesign für Speicher-Diagnose

## Kontext

Issue #3000 verfolgt Speicher- und Leistungsdiagnosen für langlebige Qwen Code-Sitzungen.
Der erste PR sollte eine kleine, risikoarme Diagnoseoberfläche schaffen, bevor umfangreichere Profiling- oder Retention-Änderungen hinzugefügt werden.

Das Design ist referenzgetrieben:

- Claude Code hält Speicherdiagnosen getrennt von Heap-Snapshot-Erstellung. Zu den Diagnosen gehören Prozessspeicher, V8-Heap-Statistiken, Heap-Bereiche, Ressourcennutzung, aktive Handles/Requests, Dateideskriptoren, Linux `smaps_rollup` und Leak-Hinweise.
- Codex konzentriert sich stark auf begrenzte Retention und Lazy Loading für langlebige Prozesszustände. Diese Ideen sollten spätere PRs leiten, die sich mit Konversations-, Befehlsausgabe- und Verlaufs-Retention befassen.

## Umfang des ersten PR

Füge einen `/doctor memory` Diagnosepfad hinzu, der eine einzelne Momentaufnahme erfasst:

- `process.memoryUsage()`
- V8-Heap-Statistiken und Heap-Bereiche
- `process.resourceUsage()`
- Anzahl aktiver Handles/Requests
- Anzahl offener Dateideskriptoren, wenn `/proc/self/fd` verfügbar ist
- Linux `smaps_rollup` wenn verfügbar
- grundlegende Risikohinweise für Heap-Druck, getrennte Kontexte, übermäßige Handles, übermäßige Requests, hohe Dateideskriptor-Anzahl und nativen Speicherdruck

Dieser Befehl sollte günstig genug sein, um in normalen Sitzungen ausgeführt zu werden, und auf Plattformen sicher sein, auf denen Linux-spezifische Prüfungen nicht verfügbar sind.

## Nicht-Ziele

Dieser PR verzichtet absichtlich auf:

- Heap-Snapshots erstellen
- kontinuierliches Polling
- Prompt-/Verlaufs-Retention ändern
- Tool-Ausgabe-Retention ändern
- Modul-Ladeverhalten ändern

Diese sind Folgen-PRs, nachdem die Diagnosebasislinie existiert.

## Folgen-PRs

1. Explizite Snapshot-/Export-Unterstützung für tiefere lokale Untersuchungen hinzufügen.
2. Begrenzte Retention für große Befehls-/Tool-Ausgaben hinzufügen, mit Codex' begrenzter Ausgabe-Retention als Hauptreferenz.
3. Lazy Loading und Modul-Startpfade überprüfen, nachdem Messungen Hot Spots identifiziert haben.
4. Wiederholbare Speicher-/Leistungs-Benchmark-Szenarien für langlebige Sitzungen hinzufügen.