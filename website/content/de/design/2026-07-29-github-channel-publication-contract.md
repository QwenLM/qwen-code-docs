# GitHub-Channel-Publikationsvertrag

## Ziel

GitHub-Channel-Antworten sicher automatisch publizierbar und nachträglich
nachvollziehbar machen. Der Channel publiziert nur die finale Antwort des
Agenten über den Adapter; Zwischen-Reasoning, Tool-Ausgaben und
Streaming-Chunks werden nie zu GitHub-Kommentaren.

## Vertrag

- Der GitHub-Adapter deaktiviert Block-Streaming, sodass jedes akzeptierte
  eingehende Event höchstens einen finalen
  Response-Zustellungsversuch erzeugt.
- Die finale Zustellung nutzt den Issue-/PR-Thread des aktiven Prompts statt
  eines potenziell veralteten Shared-Session-Targets.
- Die Channel-Anweisungen sagen dem Agenten, `gh` oder die GitHub-API nicht
  zum Erstellen von Kommentaren oder Reviews zu verwenden. Der Adapter besitzt
  die öffentliche Zustellung.
- Eine finale Antwort, deren getrimmter Inhalt nur das `<no-reply/>`-Sentinel
  ist, wird absichtlich unterdrückt. Whitespace, Groß-/Kleinschreibung, ein
  Leerzeichen vor `/>` und ein einzelner umschließender Code-Zaun werden
  normalisiert; jeder andere Inhalt wird unverändert publiziert.
- Unterdrückung und Publikation werden in einer lokalen Append-only-
  JSONL-Audit-Datei unter
  `~/.qwen/channels/<workspace-scope>/<channel>-<name-hash>-github-audit.jsonl`
  aufgezeichnet. Datensätze enthalten Zeit, Channel, Session, Quellnachricht,
  Thread, Ergebnis, GitHub-Kommentar-Identität/URL falls vorhanden sowie einen
  SHA-256-Hash und die Zeichenanzahl der Antwort. Sie enthalten nie
  Antworttext, Zugangsdaten oder ein GitHub-Token.
- Audit-Schreibvorgänge sind Best-Effort. Ein Audit-Fehler wird protokolliert,
  ohne das Publikationsergebnis zu ändern. Eine mehrdeutige
  GitHub-API-Fehlerantwort bleibt ein Zustellungsfehler und wird nicht
  erneut versucht; definitive No-Write-Antworten werden in eine private
  Pending-Delivery-Datei geschrieben und beim nächsten Channel-Start erneut
  versucht.

## Ablauf

1. Der GitHub-Adapter dispatched ein akzeptiertes Event in `ChannelBase`.
2. Der aktive Prompt hält die eingehende Nachricht und den Issue-/PR-Thread
   verfügbar, bis die finale Zustellung abgeschlossen ist.
3. Der Agent gibt eine finale Antwort zurück.
4. Der Adapter unterdrückt entweder das exakte Sentinel oder erstellt einen
   Issue-Kommentar.
5. Der Adapter hängt einen Publikations-Audit-Datensatz an. Der terminale
   Task-Lifecycle bleibt in der Verantwortung von `ChannelBase`.
6. Schlägt die finale Zustellung mit einer definitiven No-Write-Antwort fehl,
   speichert der Adapter den finalen Text mit privaten Dateiberechtigungen in
   `~/.qwen/channels/<workspace-scope>/<channel>-<name-hash>-github-pending-deliveries.json`
   und versucht ihn nach einem Neustart erneut, ohne den Agenten erneut
   laufen zu lassen.

## Non-Goals

- Mehrdeutige Publikationsfehler werden nicht erneut versucht, es werden keine
  Status-Kommentare erstellt und kein Response-Streaming aktiviert. Das sind
  separate Teile von Issue #8012.
- Die Anweisung gegen direkte `gh`/API-Publikation ist eine operative Grenze
  für den Agenten, keine Sandbox-Durchsetzung. Die Durchsetzung von
  GitHub-Schreibbeschränkungen auf Tool-Ebene gehört zum
  Runtime-Berechtigungsmodell.
- Die Pending-Delivery-Aufbewahrungspolitik, einschließlich Maximalversuche,
  maximales Alter, Größenlimits, Behandlung veralteter Antworten und Cleanup
  verwaister temporärer Dateien, wird separat in #8142 verfolgt.

## Verifizierung

Fokussierte GitHub-Adapter-Tests decken Sentinel-Unterdrückung, normale
Final-Kommentar-Zustellung, Audit-Felder ohne Antworttext und nicht
blockierende Audit-Schreibfehler ab. Bestehende Routing- und
Zustellungs-Tests bleiben unverändert.
