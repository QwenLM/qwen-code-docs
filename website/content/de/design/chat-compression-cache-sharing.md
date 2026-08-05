# Chat-Compression-Cache-Sharing

## Kontext

Chat-Compression sendet aktuell eine kalte Side-Query mit einer dedizierten System-Instruktion, ohne Tool-Deklarationen der Haupt-Session und mit einer Medien-reduzierten Kopie der Konversation. Provider, deren Prompt-Cache-Schlüssel mit Tools und der System-Instruktion beginnt, können den gecachten Präfix der Haupt-Session nicht wiederverwenden.

## Design

Compression versucht zuerst einen spezialisierten Single-Turn-Request, wenn alles Folgende zutrifft:

- das Compression-Modell ist das aktuelle Hauptmodell;
- der aktive Provider ist Anthropic oder DashScope und Cache Control ist aktiviert;
- der Chat hat einen vom Provider gemeldeten Prompt-Token-Count, an dem die Schätzung verankert wird;
- der effektive Prompt-Token-Count plus die begrenzte Compression-Output-Reserve passt in das Kontextfenster des Modells.

Der Request nutzt die effektive Generierungs-Konfiguration des aktuellen Turns, einschließlich der Pro-Request-Tool-Overrides, die von Subagents genutzt werden, und die vollständige kuratierte Historie einschließlich Medien. Die normale Modell-Modalitäts-Filterung wird beim Senden des Requests angewendet, sodass unterstützte Medien unverändert bleiben und nicht unterstützte Medien dieselben Platzhalter nutzen wie andere Modell-Requests. Die bestehende Compression-Instruktion wird als finale Nutzernachricht angehängt.
Nichts konsumiert oder führt Function-Call aus diesem Request aus. Eine Response, die einen Function-Call enthält, eine leere Response, ein fehlerhafter Zustands-Snapshot oder ein Request-Fehler wird verworfen und einmal über die bestehende kalte Side-Query erneut versucht. Deren Medien-reduzierte Eingabe wird nur lazy gebaut, wenn dieser Fallback benötigt wird. Abbruch löst den Fallback nicht aus.

Die Nutzung des aktuellen `GeminiChat` hält den Request auf die Live-Session beschränkt. Der prozessglobale Fork-Cache wird bewusst nicht genutzt, weil er nur ein kurzes Historien-Ende behält und zu einer anderen gleichzeitigen Session gehören kann.

Sessions, die ein abweichendes Compaction-Modell nutzen, bleiben auf dem bestehenden Pfad, weil ihre Cache-Identität sich von der Haupt-Session unterscheidet. Medien-tragende Historien nutzen zuerst den geteilten Pfad, damit der unveränderte Provider-seitige Präfix den Cache der Haupt-Session wiederverwenden kann.

## Verifikation

Unit-Tests prüfen die exakte System-, Tools-, Voll-Historie- und Trailing-Directive-Konstruktion; Provider-/Modell-Gates; Medien-Erhaltung auf dem geteilten Pfad; Window-Preflight; Medien-Reduzierung nach Fallback; Tool-Call- und Fehlerhafte-Response-Fallback; und Abbruchverhalten. Provider-Tests sollten den serialisierten Request-Präfix und die Cached-Token-Nutzung für den Haupt-Turn und den Compression-Request vergleichen.
