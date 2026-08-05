# Legacy-Session-Workspace-Telemetrie

## Kontext

Die Daemon-Telemetrie-Middleware klassifiziert HTTP-Requests, bevor
Express-Route-Handler laufen. Legacy-Singular-Session-Routen können auf jeden
registrierten Workspace auflösen, aber die Middleware kann den gewählten
Runtime nicht allein aus der URL kennen. Den live Owner sowohl in der
Middleware als auch im Handler aufzulösen dupliziert Arbeit und kann zu
Abweichungen führen, wenn sich die Registry zwischen den beiden Lookups
ändert.

Dieses Design gibt jeder expliziten Legacy-`/session`-, `/sessions`- und
`/permission`-Route einen stabilen Request-Span, während dynamische Routen
der vom Handler gewählten Runtime zugerechnet werden.

## Routen-Inventar

Der Routen-Katalog enthält alle 48 expliziten Legacy-Routen. Jeder Eintrag
deklariert seine HTTP-Methode, sein Express-Pfad-Template, sein kanonisches
Routen-Label und einen von zwei Attributionsmodi:

- `handler_resolved` (41 Routen): `POST /session`, load/resume, die
  Legacy-Transkript-Route und jede Singular-Session-Route, die einen live
  Owner auflöst. Der Handler publiziert den gewählten Runtime-Workspace an
  die Telemetrie.
- `pre_resolved` (7 Routen): Legacy-Export, A2UI-Aktion, Legacy-Organisation,
  die drei globalen Batch-Mutationen und der globale Permission-Vote. Diese
  Routen bleiben an den primären Workspace gebunden.

Der Katalog-Matcher folgt den relevanten Express-5-Defaults: Statische
Segmente sind case-insensitive, ein einzelner Trailing-Slash wird akzeptiert
und Parameter-Segmente werden erst dekodiert, nachdem ihre rohe Pfadgrenze
erfasst wurde. Eine fehlerhafte Session-Id wird als Rohwert behalten.
Permission-Request-Ids werden vor ihrer bestehenden Längen- und
Zeichensatz-Validierung dekodiert. Das emittierte `http.route` verwendet
immer das kanonische Katalog-Template.

## Verzögerte Attribuierung

Handler-resolved Requests starten ohne `qwen-code.workspace.hash`. Die
Middleware speichert einen privaten Kontext auf der Express-Response.
Routen-Code ruft `setDaemonTelemetryWorkspace(res, runtime.workspaceCwd)`
auf, nachdem eine eindeutige Runtime gewählt wurde. Der Setter ist
best-effort und first-selection-wins: Ein wiederholter identischer Wert ist
idempotent und ein späterer anderer Wert wird ignoriert.

Die vier Publikationsnähte sind:

1. `requireSessionRuntime`, geteilt von Live-Owner-Routen.
2. Session-Erzeugung nach der Workspace-Auswahl.
3. Session-Load/Resume nach der Ziel-Runtime-Auswahl.
4. Legacy-Transkript-Auflösung, nachdem ein eindeutiger live oder
   persistierter Owner gefunden wurde.

Die Publikation erfolgt vor späteren Trust-, Unsupported-Secondary-,
Konflikt- und Request-Validierungsprüfungen. Folglich behalten diese Fehler
die eindeutig gewählte Runtime. Requests, die vor der eindeutigen Auswahl
scheitern, einschließlich Not-found-, Ambiguous- und
Workspace-Mismatch-Fällen, lassen den Workspace-Hash weg. Die Attribuierung
verwendet `runtime.workspaceCwd`, nicht die angeforderte oder temporäre cwd
einer Session.

Bei Response-`finish` oder `close` hasht die Middleware den publizierten
Workspace, setzt das Span-Attribut, zeichnet die Response auf und beendet den
Span. Auflösung, Hashing und Span-Updates sind best-effort und können die
Request-Verarbeitung oder das Metrics-Settlement nicht beeinflussen. Der
Kontext wird nach einem Settlement geleert.

Pre-resolved Requests hashen weiterhin den von der Middleware gewählten
Workspace, wenn der Span startet. Das Entfernen des Live-Owner-Callbacks der
Middleware stellt sicher, dass ein live Owner höchstens einmal pro Request
aufgelöst wird.

## Streaming und Metriken

Alle 48 Katalog-Routen erzeugen Request-Spans. Eine erfolgreiche
`GET /session/:id/events`-Response beendet ihren Span, wenn die
SSE-Verbindung schließt, ist aber von der gewöhnlichen
HTTP-Request-Zähl/Dauer und dem WebShell-Status-Metriken-Ring ausgenommen,
weil ihre Dauer die Verbindungslaufzeit ist. SSE-Handshake-Fehler werden als
gewöhnliche kurze HTTP-Requests aufgezeichnet.

`POST /session/:id/generate` ist eine begrenzte Request-scoped SSE-Operation.
Ihre Verbindung endet, wenn die Generierung abschließt, daher bleibt ihre
Dauer eine aussagekräftige Request-Latenz und fließt weiterhin in die
gewöhnlichen HTTP-Metriken ein.

Heartbeat-Requests bleiben in den OpenTelemetry-HTTP-Metriken, sind aber
weiterhin vom Status-Metriken-Ring ausgenommen. `GET /daemon/status` bleibt
ebenfalls nur von diesem Ring ausgenommen. Ein geteilter Settlement-Guard
verhindert doppelte Aufzeichnung, wenn sowohl `finish` als auch `close`
feuern.

HTTP-Metriken und der WebShell-Metriken-Ring bleiben daemon-global. Eine
Workspace-Metrik-Dimension hinzuzufügen erfordert eine separate Kardinalitäts-
und Dashboard-Kompatibilitätsprüfung.

## Kompatibilität und Grenzen

Diese Änderung ändert keine Routen, Request- oder Response-Schemata, SDKs,
Capabilities, Persistenz, Authentifizierung, Trust-Reihenfolge,
Archive-Leases, Bridge-Fehler-Mapping oder Session-Ausführung. Sie fügt keine
öffentlichen Telemetrie-Attribute hinzu.

Die Telemetrie-Middleware wird nach Bearer-Authentifizierung, Rate-Limiting
und JSON-Parsing installiert, sodass Requests, die von diesen früheren Gates
abgelehnt werden, außerhalb dieser Request-Span-Abdeckung bleiben. Implizites
HEAD/OPTIONS, Access-Log-Verhalten, Rate-Limit-Pfadnormalisierung,
Workspace-Session-Gruppen-Routen, Workspace-qualifizierte Organisation,
ACP-/WebSocket-Telemetrie und das Aktivieren von sekundärer
Branch-/Fork-/cd-Ausführung liegen außerhalb des Umfangs.

## Verifikation

- Ein Drift-Guard vergleicht die bei Express registrierten expliziten
  Legacy-Routen mit dem Katalog und assertet das 48/41/7-Inventar.
- Matcher-Tests decken Groß-/Kleinschreibung, Trailing-Slash, kodierten
  Slash, Unicode, fehlerhafte Kodierung, Permission-Id-Validierung,
  Methoden-/Pfad-Mismatch und kanonische Labels ab.
- Middleware-Tests decken verzögerte Attribuierung, First-selection-wins,
  Hash-Caching, Telemetrie-Fehler, einmaliges Settlement, SSE-Metriken,
  Heartbeat und Status-Ausnahmen ab.
- Routen-Tests decken Live-Owner-, Erzeugungs-, Wiederherstellungs- und
  Transkript-Publikation für primäre, sekundäre, nicht vertrauenswürdige,
  fehlende, mehrdeutige und Konflikt-Fälle ab.
- Ein Dual-Workspace-Outfile-Test verifiziert sekundäre, primär-gebundene und
  weggelassene Hashes, ohne rohe Workspace-Pfade offenzulegen.
