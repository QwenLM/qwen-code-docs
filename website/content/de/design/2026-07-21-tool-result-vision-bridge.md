# Tool-result vision bridge

## Kontext

Die bestehende Vision Bridge konvertiert Bilder, die aus User-Eingaben
aufgelöst werden, während `read_file` gewöhnliche Bilder aus reinen
Text-Tool-Ergebnissen heraushält. Andere Tools können Bilder als `inlineData`
zurückgeben; `convertToFunctionResponse` speichert diese Bilder in
`functionResponse.parts`, und der Request-Slimmer ersetzt sie später durch
MIME-Platzhalter für ein Text-only-Modell. Infolgedessen werden Bilder, die
vom Modell entdeckt oder von eingebauten, MCP- und Extension-Tools
zurückgegeben werden, von einem Text-only-Primärmodell nicht verstanden,
selbst wenn ein Vision-Modell konfiguriert ist.

## Design

`read_file` bewahrt ein gewöhnliches Bild nur, wenn das aktive Zielmodell
Text-only ist und ein Vision-Bridge-Modell verfügbar ist. Es ruft das
Vision-Modell nicht selbst auf; die PDF-spezifische Transkription bleibt
unverändert.

Ein geteilter Core-Helfer verarbeitet normalisierte Tool-Antwort-Teile
unmittelbar bevor sie zu Modell-Input werden. Wenn das aktive Zielmodell
Bilder akzeptiert oder keine Vision Bridge verfügbar ist, liefert der Helfer
die Antwort unverändert zurück. Wenn das konfigurierte Vision-Modell
agent-fähig ist und der Aufrufer den Rest des Turns umschalten kann, begrenzt
der Helfer die Inline-Bildgröße, bewahrt die Tool-Bilder und wählt dieses
Modell über den bestehenden Full-Turn-Override aus. Andernfalls ruft er für
jede `functionResponse`, die Inline-Bilder enthält, die bestehende Vision
Bridge mit den Bildern und einem begrenzten Fokus-Hinweis auf, der den
Tool-Namen, Bild-Labels und bestehenden Text-Output enthält.

Der Helfer hängt die nicht vertrauenswürdige Maschinen-Transkription an das
bestehende `response.output` oder `response.error` an, bewahrt den
Funktionsnamen, die Aufruf-Id, andere Antwortfelder und Nicht-Bild-Medien und
entfernt jedes ursprüngliche Inline-Bild aus `functionResponse.parts`.
Bridge-Fehler und Abbruch ersetzen die Bilder durch einen expliziten
Nicht-verfügbar-Hinweis, statt zu erlauben, dass rohe Bilddaten den
Text-only-Provider erreichen. Bilder über dem Bridge-Zähl- oder Byte-Limit
werden ebenfalls entfernt und vom Transkriptionsblock gemeldet.

Der geteilte Helfer wird vom Core-Tool-Scheduler und dem direkten
Tool-Executor des ACP verwendet. Der interaktive Scheduler, der nicht
interaktive Runner und aktive ACP-Prompts können einen Tool-ausgelösten
Full-Turn-Override akzeptieren, sodass der nächste Modell-Request und spätere
Tool-Fortsetzungen auf dem agent-fähigen Vision-Modell bleiben. Auf Flächen,
die Inline-Modellauswahl unterstützen, hat die explizite Auswahl weiterhin
Priorität. Consumer ohne Turn-Level-Override-Kanal behalten den
Transkriptions-Fallback, statt rohe Bilder einem Text-only-Modell
auszusetzen. Die spekulative Folge-Ausführung ist die Ausnahme: Weil ihr
Output verworfen werden kann und nur zum Priming eines Caches verwendet wird,
entfernt sie Tool-Ergebnis-Bilder mit einem expliziten Nicht-verfügbar-Hinweis
und sendet sie nie an ein Vision-Modell. Eingebaute Tools, MCP-Tools und
Extension-Tools treten alle durch einen dieser Pfade ein.

Jeder echte Tool-Ergebnis-Bridge-Versuch wird auf der aktiven Fläche
offengelegt. Die Transkription meldet das ausgewählte Vision-Modell und den
Endpoint über den bestehenden Vision-Bridge-Formatter, während die
Full-Turn-Übernahme das Modell meldet, dem der Rest des Turns gehören wird.
TUI- und JSON-Output behalten die ursprüngliche Anzeige des Tools neben der
Mitteilung, und ACP emittiert dieselbe Mitteilung als Agent-Nachricht.

Nur Inline-Bild-Bytes werden konvertiert. Bild-`fileData`, URLs, reiner
Pfad-Text, Audio und Video bleiben außerhalb dieser Änderung, da ihre
Auflösung separate Dateisystem-, Netzwerk-, Authentifizierungs- und
Modalitäts-Policies einführen würde.

## Kompatibilität und Fehlerverhalten

Die öffentlichen Tool-Schemata ändern sich nicht. Bestehendes
User-Eingabe- und PDF-Vision-Bridge-Verhalten bleibt intakt. Konfigurationen
ohne Vision-Modell behalten ihr aktuelles Nicht-unterstütztes-Bild- oder
MIME-Platzhalter-Verhalten. Ein erfolgreicher Tool-Aufruf wird nicht allein
deshalb in einen Tool-Fehler umgewandelt, weil die Bridge fehlschlägt; das
Modell erhält den ursprünglichen Text plus einen bereinigten
Bild-nicht-verfügbar-Hinweis. Provider-Fehlerdetails werden geloggt, aber nie
in die Funktionsantwort eingefügt. Das Pro-Turn-Bild-Budget wird über jeden
Bridge-Pfad eines Turns geteilt: Die laufende Zählung wird mit dem
Abort-Signal des Turns als Schlüssel versehen, sodass User-Eingabe-, PDF- und
Tool-Ergebnis-Bridges aus demselben Limit schöpfen, statt jedes ein frisches
zu erhalten. Mit einem konfigurierten, aber nicht agent-fähigen Vision-Modell
werden bei einem Turn, der das Limit früh ausschöpft, spätere Tool-Bilder als
Budget-erschöpft transkribiert; die agent-fähige Übernahme ist nicht
betroffen, da sie die rohen Bilder bewahrt, statt sie zu transkribieren.

## Verifikation

Fokussierte Tests decken das Lesen gewöhnlicher Bilder, verschachtelte
Tool-Bilder, gemischte Text-und-Bild-Ergebnisse, mehrere Funktionsantworten,
Bridge-Fehler und -Abbruch, Multimodal-Ziel-Pass-through,
Full-Turn-Übernahme-Akzeptanz und -Ablehnung, User-sichtbare Offenlegung,
spekulative Bildentfernung und Bewahrung von Funktionsidentität und
Nicht-Bild-Feldern ab. Integrations-Checks üben den Core-Scheduler, die
interaktive und nicht interaktive Override-Verdrahtung, den ACP-Executor und
die Aufrufstellen des spekulativen Executors. Build, Typecheck, Bundle und
lokale CLI-Verifikation schließen die Änderung ab.
