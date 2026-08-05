# Daemon-Session-Runtime-Status

## Problem

Daemon-Clients können eine Live-Session über `GET /session/:id/status`
pollen und Sessions über `GET /workspace/:id/sessions` auflisten, aber das
einzige Runtime-Aktivitätssignal heute ist `hasActivePrompt`. Clients können
nicht unterscheiden, ob ein Turn auf eine gewöhnliche Berechtigung oder eine
`ask_user_question`-Antwort wartet oder ob es ein fehlgeschlagener Turn ist,
dessen Fehler sichtbar bleiben sollte, bis die Arbeit fortgesetzt wird.

## Design

Die ACP-Bridge besitzt eine kleine In-Memory-Status-Erweiterung auf jedem
Live-`SessionEntry`:

- `hasTurnError` und `turnError` speichern den terminalen Fehler des zuletzt
  fehlgeschlagenen Turns.
- `pendingInteractions` bildet die Ids pending Berechtigungsanfragen auf
  normalisierte, renderbare Berechtigungsaktionen oder Nutzerfragen ab.

Der bestehende Prompt-Lebenszyklus bleibt die Quelle für `hasActivePrompt`.
Ein fehlgeschlagener Turn zeichnet seine bereinigte `message`, den optionalen
`code` und das optionale `errorKind` auf, wenn er das bestehende
`turn_error`-SSE-Event emittiert. Der Fehler bleibt sichtbar, bis der nächste
Prompt in der Queue den Dispatch erreicht und tatsächlich startet; ein
akzeptierter, aber noch in der Queue liegender Prompt löscht ihn nicht.

Das ACP-Child markiert `ask_user_question`-Berechtigungsanfragen explizit in
den Tool-Call-Metadaten. Die Bridge liest nur diesen stabilen Marker, statt
die Kategorie aus UI-Text oder einem Tool-Namen abzuleiten.

## API

Die bestehende Live-Zusammenfassung erhält optionale additive Felder:

- `isWaitingForPermission`
- `isWaitingForUserQuestion`
- `pendingInteractionCount`
- `hasTurnError`
- `turnError` (`message`, optionaler `code`, optionales `errorKind`)
- `pendingInteractions`: Aktionstitel/-content/-input und auswählbare
  Optionen für Berechtigungen; Fragen und auswählbare Optionen für
  `ask_user_question`. Jede Frage trägt einen `answerKey` für den
  `answers: Record<string, string>`-Permission-Vote-Payload.

`GET /session/:id/status` gibt alle Felder für eine Live-Session zurück. Die
Workspace-Session-Liste trägt dieselben Runtime-Felder, einschließlich
`turnError` und `pendingInteractions`, für Live-Einträge, sodass Caller
Interaktionen während des Batch-Pollings direkt rendern und genehmigen
können. Persistierte Sessions, die nicht live sind, lassen die neuen Felder
weg, damit Caller einen nicht verfügbaren Runtime-Zustand nicht für einen
bekannten Idle-Zustand halten.

## Scope

Dies persistiert keinen Runtime-Zustand über Daemon-Neustarts hinweg, fügt
keinen neuen Endpoint hinzu und ersetzt SSE nicht für den detaillierten
Event-Konsum. Die bestehende `POST /session/:id/permission/:requestId`-Vote-Route
löst einen pending Eintrag auf; Frageantworten nutzen ihre bestehende
`answers`-Erweiterung.
