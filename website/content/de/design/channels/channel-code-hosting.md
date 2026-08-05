# Code-Hosting-Channel-Adapter — Design

## Überblick

Der GitHub-Polling-Adapter lässt AI-Agenten GitHub auf Tasks überwachen, indem er die Notifications-API pollt und Agent-Antworten als Issue-/PR-Kommentare postet. Anders als IM-Adapter (Realtime-Webhooks/Long-Poll) pollt dieser Adapter in einem Intervall.

## Architektur: Notification als Wake-up-Signal

Die Kern-Erkenntnis: Plattform-Benachrichtigungen sind **Thread-Level** und **veränderlich** — jede Aktivität (Kommentar, Push, Label-Änderung) bumped `updated_at`. Notifications können nicht als zuverlässiger Pro-Kommentar-Event-Stream genutzt werden.

Stattdessen dienen Notifications nur als **Wake-up-Signal** („etwas ist in diesem Thread passiert"). Der Adapter zählt dann die tatsächlichen Kommentare über die Kommentare-API der Plattform auf und nutzt ein Pro-Thread-Watermark, um zu bestimmen, welche Kommentare neu sind.

## GitHub: Cursor-basiertes Kommentar-Fenster

### Entkopplung der Notification-/Kommentar-Zeitstempel

Ein kritisches Timing-Problem: **`updated_at` der Notification und `updated_at` des Kommentars sind entkoppelt**.

- `notification.updated_at` wird von _jeder_ Thread-Aktivität gebumpt (Kommentar, Push, Label-Änderung) und unterliegt Zustellverzögerungen
- `comment.updated_at` spiegelt wider, wann der Kommentar tatsächlich erstellt/bearbeitet wurde

Diese Zeitstempel haben keine kausale Beziehung. Eine Notification kann 16 Sekunden nach dem Kommentar eintreffen, der sie ausgelöst hat, und durch fremde Aktivität erneut gebumpt werden. Die Nutzung von Notification-Zeitstempeln als Gate für die Kommentar-Enumeration erzeugt daher zwei Fehlermodi:

1. **Doppelte Antworten** — `PUT /notifications` ist asynchron (202 Accepted) mit einem `last_read_at`-Cutoff. Die Antwort des Bots bumped `updated_at` über den Cutoff hinaus, bevor der Server die Markierung verarbeitet, sodass die Notification nie als gelesen markiert wird. Der nächste Poll holt sie erneut und verarbeitet dieselben Kommentare erneut.
2. **Verpasste Antworten** — der Cursor rückt auf `max(notification.updated_at)` vor, das Kommentare auf spät eintreffenden Notifications überspringen kann. Wenn diese Notifications schließlich eintreffen, fallen ihre Kommentare unter das Cursor-Fenster und werden stillschweigend ausgeschlossen.

### Design

Korrektheit kommt von einem **Cursor-basierten Kommentar-Fenster**, nicht vom Gelesen-Status der Notification:

Poll-Zyklus:

1. `GET /notifications?since={cursor-1s}` — ungelesene Threads entdecken
2. `windowSince = cursor.lastProcessedAt` speichern (der Cursor **bevor** dieser Poll ihn vorrückt)
3. `markNotificationsAsRead(maxUpdatedAt)` — Best-Effort-Gesamtmarkierung (räumt Nicht-Issue-Notifications auf)
4. Globalen Cursor auf `max(notification.updated_at)` vorrücken
5. Pro Thread: `listComments(since=windowSince)` — Kommentare enumerieren
6. Ausschließen: eigene Kommentare des Bots; Kommentare mit `created_at > maxUpdatedAt` (oberhalb des Fensters); Kommentare mit `created_at <= windowSince` (unterhalb des Fensters)
7. Verarbeiten: Mention-Erkennung → Envelope → `handleInbound`

Das effektive Kommentar-Fenster ist `(windowSince, maxUpdatedAt]`. Kommentare, die in einem früheren Poll verarbeitet wurden, haben `created_at <= windowSince` (das `maxUpdatedAt` des vorherigen Polls) und werden ausgeschlossen. Das verhindert Duplikate unabhängig davon, ob `PUT /notifications` erfolgreich war. Kommentar-Bearbeitungen lösen keine erneute Verarbeitung aus — nur `created_at` wird für die Fensterzugehörigkeit genutzt.

Die Gesamtmarkierung wird weiterhin aufgerufen (Schritt 3), um Nicht-Issue-/PR-Notifications aufzuräumen und die Ungelesen-Liste zu reduzieren, aber sie ist nicht tragend für die Deduplizierung.

### Bekannte Einschränkung: Späte Notification-Zustellung

Weil der Cursor global ist (nicht pro Thread), kann eine Notification, die in einem späteren Poll als der `created_at` ihrer Kommentare eintrifft, dazu führen, dass diese Kommentare vom Cursor-Fenster ausgeschlossen werden. Das erfordert, dass die Notification-Zustellung über eine Poll-Grenze hinweg verzögert ist UND dass die Kommentare eines anderen Threads den Cursor in der Zwischenzeit über sie hinaus vorrücken. In der Praxis ist dieses Fenster schmal (die Notification-Zustellung schließt typischerweise innerhalb eines Poll-Intervalls ab); der Nutzer kann zur Wiederholung erneut mentionen.

### Bekannte Einschränkung: PR-Review-Kommentare

`issues.listComments` gibt nur allgemeine Konversationskommentare zurück, keine PR-Review-Kommentare (Pro-Zeile-Diff-Kommentare). Eine @-Erwähnung in einem PR-Review-Kommentar wird stillschweigend verworfen. Nutzen Sie stattdessen einen allgemeinen Konversationskommentar am PR.

### Szenario-Verhalten

| Szenario                            | Verhalten                                                                                                                       |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Neuer Thread (@bot im Kommentar)    | Erscheint (ungelesen) → seit Cursor enumerieren → verarbeiten                                                                    |
| Bestehender Thread, neuer Kommentar | Erscheint erneut (ungelesen) → seit Cursor enumerieren → alte Kommentare durch `<= windowSince` ausgeschlossen → nur neue      |
| Nicht-Kommentar-Aktivität (Push/Label) | Erscheint → null neue Kommentare im Fenster → überspringen                                                                   |
| Nutzer markiert auf github.com als gelesen | Verschwindet aus der API → wird nicht verarbeitet                                                                         |
| markNotificationsAsRead fehlschlägt | Cursor-Fenster verhindert weiterhin Duplikate → keine Auswirkung auf die Korrektheit                                             |
| Crash nach markRead, vor Fertig     | Cursor nicht gespeichert → nächster Start holt dieselben Notifications erneut → gecrashter Batch wird erneut verarbeitet, nicht verloren |
| Bot antwortet auf einen Thread      | `updated_at` gebumpt → Notification kann ungelesen bleiben → nächster Poll holt sie → Kommentare durch Cursor-Fenster ausgeschlossen → kein Duplikat |
| Neues Issue mit @bot im Body        | Keine Kommentare → Body enthält Mention → Body als Trigger einspeisen (dedupliziert über `dispatchedBodies`)                     |

## PollingChannelBase

`PollingChannelBase<Cursor>` (in `packages/channels/base/`) erweitert `ChannelBase` und stellt die Poll-Loop-Infrastruktur bereit:

- **Poll-Loop**: Start/Stop über `startPollLoop()`/`stopPollLoop()`, aufgerufen aus `connect()`/`disconnect()`
- **Poll-Intervall**: gelesen aus der Channel-Konfiguration `pollInterval` (ms), als positive endliche Zahl validiert, Default 60000
- **Cursor-Persistenz**: JSON-Cursor wird nach jedem erfolgreichen `pollOnce()` atomar gespeichert; beim Konstruieren geladen (kaputtes oder nicht parsebares Datum → Fallback auf `createInitialCursor()`)
- **Cursor-Validierung**: virtueller Hook `validateCursor()` — die Basis lehnt Nicht-Objekte und Arrays ab; Subklassen fügen Formprüfungen hinzu (z. B. lehnt GitHub ein fehlendes/ungültiges `lastProcessedAt`-Datum ab)
- **Backoff**: exponentiell 2s → 30s bei Poll-Fehlern, Reset bei Erfolg
- **Abbrechbarer Sleep**: `abortableSleep(ms)` als protected Methode bereitgestellt — Poll-Intervall und Fehler-Backoff sind über `disconnect()` unterbrechbar

Subklassen implementieren nur:

- `pollOnce()` — die Arbeit erledigen, `this.cursor` mutieren
- `createInitialCursor()` — Default-Wert für den ersten Lauf

Das `Cursor`-Generic ist ein beliebiges JSON-serialisierbares Objekt. GitHub nutzt `{ lastProcessedAt: string; dispatchedBodies?: string[] }` (Letzteres begrenzt die First-Contact-Body-Deduplizierung auf die letzten 500 Einträge).

## Mention-Erkennung

Body-basierte, Case-insensitive-Regex. Getrennte Funktionen für Erkennung (`testBotMention`) und Entfernen (`stripBotMention`):

- Erkennung: expliziter Regex-Match, der einen Boolean zurückgibt — nie aus einem Vorher/Nachher-Vergleich des Entfernens abgeleitet (Whitespace-Unterschiede verursachen False Positives)
- Entfernen: entfernt nur `@bot`, bewahrt alle andere Formatierung (kein Whitespace-Collapsing)

## Session-Scope

Polling-Adapter nutzen `chat_thread`-Scope: Routing-Schlüssel = `channel:chatId:threadId`. Das verhindert Repo-übergreifende Session-Kollisionen (`repo-a/issue:42` vs `repo-b/issue:42`).

## Fehlerbehandlung

Zustellung ist **Best-Effort**. Bei `handleInbound`-Fehler wird ein Fehlerkommentar pro Thread und Poll-Zyklus gepostet (dann beendet `break` den Kommentar-Loop — verhindert N identische Fehlerkommentare); der Nutzer mentiont erneut, um es wieder zu versuchen. Pro-Notification-API-Fehler nutzen `continue` — eine fehlgeschlagene Notification blockiert nicht den Rest des Batches. Notifications ohne `subject.url` (Typen Discussion, SecurityAlert) werden stillschweigend übersprungen.

Wenn der Prozess mitten in der Verarbeitung crashed, wird der Cursor nicht gespeichert (er wird nur nach Abschluss von `pollOnce()` persistiert), sodass der nächste Start dieselben Notifications erneut holt — aber das Cursor-basierte Kommentar-Fenster schließt bereits verarbeitete Kommentare aus und verhindert Duplikate.

Die Duplikatverhinderung hängt **nicht** vom Erfolg von `PUT /notifications` ab. Die Gesamtmarkierung ist Best-Effort-Cleanup; das Cursor-Fenster ist der tragende Deduplizierungsmechanismus.
