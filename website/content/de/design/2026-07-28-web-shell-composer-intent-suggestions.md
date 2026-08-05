# WebShell-Composer-Intent-Vorschläge

## Zusammenfassung

Erweitere die bestehende New-Topic-Suggestion der WebShell so, dass eine
konservative Klassifikation entweder empfehlen kann, eine Nebenfrage mit
`/btw` zu stellen, oder ein substanzielles neues Thema in einer frischen
Session zu senden.

Der Composer zeigt weiterhin höchstens eine nicht blockierende Aktion. Eine
gültige `none`-Entscheidung rendert nichts. Ungültige, fehlgeschlagene oder
abgebrochene Klassifikationen rendern ebenfalls nichts.

## Entscheidungs-Vertrag

```ts
type SuggestionKind = 'btw' | 'new_session' | 'none';

interface SuggestionDecision {
  suggestion: SuggestionKind;
  confidence: number;
}
```

Nur `btw`- und `new_session`-Entscheidungen auf oder über dem bestehenden
Confidence-Schwellwert werden aktionsfähig. Der aktionsfähige Zustand zeichnet
den exakt klassifizierten Draft und die Quell-Session auf, damit beide beim
Klick erneut geprüft werden können.

## Verhalten

- `btw` ist für eine schnelle, in sich geschlossene Nebenfrage, die die
  Hauptaufgabe nicht stören soll.
- `new_session` ist für eine klar andere, substanzielle Aufgabe oder ein klar
  anderes Thema.
- `none` deckt Fortsetzungen, Unsicherheit und Drafts ab, zu denen keine der
  beiden Aktionen passt.
- Die BTW-Klassifikation startet nach einem vorherigen User-/Assistenten-
  Austausch. New-Session-Vorschläge behalten ihre strengeren bestehenden
  Kontext-Schwellwerte.
- Follow-up-artige Formulierungen dürfen für BTW klassifiziert werden, können
  aber nie über den gelockerten BTW-Schwellwert eine New-Session-Aktion
  anzeigen.
- Ein Klick auf einen `btw`-Vorschlag sendet `/btw <draft>` über den
  bestehenden Editor-Pfad, der die aktuellen Historien- und
  Composer-Clear-Semantiken des Befehls bewahrt.
- Ein Draft mit Bild oder Composer-Tag qualifiziert sich nie für `btw`.
- `new_session` behält die bestehende Clear-, Detach-, Create- und
  Auto-Submit-Sequenz, einschließlich Bild-Erhalt und
  Session-Race-Abbruch.

## Sicherheit

Der Klassifizierer bleibt konservativ und fail-closed:

- fehlerhafte Ausgabe, unbekannte Aktionen, ungültige Confidence, Fehler und
  Abbruch erzeugen keine Aktion;
- ein Session-Wechsel bricht eine ausstehende Klassifikation ab und entwertet
  einen sichtbaren Vorschlag;
- eine Änderung des Drafts oder des Anhangs entwertet einen sichtbaren
  Vorschlag;
- die Klick-Behandlung prüft den aktuellen Draft, die Quell-Session und den
  Anhang-Zustand unmittelbar vor der Ausführung;
- Anhänge gelten als vorhanden, bis der ChatEditor anderes meldet, sodass ein
  transienter unbekannter Zustand keine `/btw`-Aktion freigeben kann.

## Scope

Die Änderung bleibt innerhalb der WebShell. Sie nutzt die bestehende
Daemon-Session-Generierung, Editor-Übermittlung und das `/btw`-Verhalten
wieder. Sie fügt keine Daemon- oder SDK-Routen hinzu, ändert kein Styling und
führt kein generisches Vorschlags-Framework ein.

## Composer-Performance

Draft-Änderungen gelangen über einen stabilen Callback in den Klassifizierer.
Sie aktualisieren die Refs, den Abbruch-Zustand und den Debounce-Timer des
Klassifizierers, ohne den React-State zu aktualisieren. Die WebShell-App
rendert nur dann neu, wenn ein aktionsfähiger Vorschlag erscheint oder ein
bestehender Vorschlag entwertet wird.

Das hält die Intent-Klassifikation vom Render-Pfad des Composers fern und
bewahrt dennoch den sofortigen Abbruch, wenn sich der Draft ändert.

## Teststrategie

- Hook-Tests decken die drei Entscheidungswerte, striktes Parsen, Confidence,
  Anhang-Gating und Stale-Session-Ergebnisse ab.
- App-Tests decken die `/btw`-Ausführung und das Composer-Clearing, die
  Ablehnung von Stale-Draft/-Session, die Anhang-Ablehnung, die bestehenden
  New-Session-Races und das Ausbleiben eines App-Re-Renders während eine
  Klassifikation aussteht ab.
- ChatEditor-Tests decken die Meldung der Anhang-Vorhandenheit ab.
