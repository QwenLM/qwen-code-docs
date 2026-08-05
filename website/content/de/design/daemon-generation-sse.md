# Stateless-Generierungs-SSE des Daemons

## Ziel

Fügt `POST /session/:id/generate` hinzu, einen Request-scoped SSE-Endpunkt für
kurze, zustandslose Textgenerierung. Der Caller liefert einen einfachen
Text-`prompt`. Das ACP-Kind löst zuerst das konfigurierte Fast Model auf und
fällt auf das Hauptmodell der Session zurück, wenn das Fast Model fehlt oder
nicht aufgelöst werden kann.

## Vertrag

Der Request-Body ist `{ "prompt": string }`. Prompts müssen nicht-leer sein
und dürfen in UTF-8 nicht größer als 32 KiB sein. Der Endpunkt emittiert
`started`, optionales `thinking`, `delta`, `done` und `error` als SSE-Events.
Er wird mit `fetch` konsumiert, da natives `EventSource` keinen POST-Body
senden kann.

Die Generierung ist von der Hauptkonversation isoliert: Sie liest oder
mutiert keinen Chat-Verlauf, nutzt weder den Haupt-System-Prompt noch Memory
und sendet immer `tools: []`. Clients können weder Modell noch
Generierungs-Settings auswählen. Der Vertrag ist aufgabenunabhängig:
Übersetzung ist der erste WebShell-Konsument, nicht Teil des Endpunkt-Schemas.

## Architektur

Die Route fragt `AcpSessionBridge` nach einem Generierungs-Stream. Die Bridge
erzeugt eine Request-ID und registriert eine begrenzte Request-scoped Queue,
bevor sie `qwen/control/session/generation/start` an das ACP-Kind dispatched.
Das Kind versucht zuerst `config.getFastModel()`, fällt während der Auflösung
auf `config.getModel()` zurück, erzeugt den passenden Content-Generator über
`BaseLlmClient.resolveForModel` und konsumiert `generateContentStream`. Chunks
kehren über `qwen/notify/session/generation/event` zurück und werden nur an
die registrierte Request-Queue geroutet. Sie werden weder an die
Session-EventBus noch an den Replay-Ring publiziert.

Eine Client-Trennung sendet `qwen/control/session/generation/cancel`; das Kind
bricht den passenden Controller ab. Eine begrenzte Bridge-Queue schützt den
Daemon vor einem langsamen HTTP-Reader. Der HTTP-Writer beachtet die
`res.write()`-Backpressure.

## Modell-Fallback

Der Fallback erfolgt nur zum Auswahlzeitpunkt. Ein fehlendes oder ungültiges
Fast Model wählt das Hauptmodell aus. Sobald die Generierung gestartet ist,
beenden Provider-Fehler den Stream; ein Modellwechsel nach dem Emittieren von
Deltas würde die Ausgabe duplizieren oder vermischen.

## WebShell-Thinking-Übersetzung

Abgeschlossene Thinking-Blocks exponieren beim Hover eine Übersetzungsaktion.
Die Aktion bleibt sichtbar, während der Thinking-Block ausgeklappt ist. Die
WebShell sendet einen Übersetzungs-Prompt über diesen Endpunkt und rendert
Deltas in einem Popover. Die finalen Input- und Output-Token-Zählungen
erscheinen unterhalb der Übersetzung. Das Popover kann einen laufenden Request
abbrechen oder das gecachte Ergebnis verwerfen und erneut übersetzen. Ein
inhaltsleeres `thinking`-Event meldet Fortschritt, ohne das Reasoning
offenzulegen. Aktive Thinking-Blocks exponieren die Aktion nie.
Abgeschlossene Übersetzungen werden im Seitenspeicher nach Sprache, Nachricht
und Inhalt gecacht, sodass ein erneutes Öffnen des Popovers keinen weiteren
Modell-Request auslöst; ein Seiten-Refresh leert den Cache.

## Nicht-Ziele

- Konversationskontext oder -verlauf
- Tool-Calls
- beliebige Modell- oder Sampling-Overrides
- SSE-Replay oder Reconnect-Resume
- eine Task-Registry oder aufgabenspezifische Schemas
- Änderungen an `packages/core`
