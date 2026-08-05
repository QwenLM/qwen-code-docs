# Full-Turn-Multimodal-Routing

## Scope

Dies implementiert nur Phase 1 von #6988: Wenn das primäre Modell reine
Textverarbeitung ist, darf ein explizit agent-fähiges Vision-Modell den
kompletten Turn mit Bildern übernehmen.

Es fügt keinen persistenten Routen-Zustand, keine Session-Recovery, keine
dauerhaften visuellen Zusammenfassungen, keine stabilen Bildreferenzen, keine
Bereinigung historischer Medien und keine spätere erneute Bildinspektion
hinzu.

## Capability-Gate

Full-Turn-Routing erfordert sowohl Bild- als auch Agent-Capability:

```json
{
  "id": "vision-agent",
  "capabilities": {
    "vision": true,
    "agent": true
  }
}
```

Eine fehlende oder false `agent`-Capability behält das bestehende
Vision-Bridge-Transkriptionsverhalten bei.

## Routing

- Wenn das primäre Modell Bilder akzeptiert, wird der bestehende
  Primärmodell-Pfad verwendet.
- Wenn das ausgewählte Vision-Modell nicht agent-fähig ist, wird über Vision
  Bridge transkribiert und auf dem primären Modell geantwortet.
- Wenn das ausgewählte Vision-Modell agent-fähig ist, werden die
  ursprünglichen Bild-Parts behalten und ein Turn-lokaler exakter
  Modell-Selektor gesetzt.
- Der exakte Provider, das Modell und der Endpoint werden für
  Provider-Retries, Tool-Ausführung, Tool-Result-Fortsetzungen und
  blockierende ACP-Stop-Hook-Fortsetzungen wiederverwendet.
- Headless-Tool-Ausführung erhält dieselbe Runtime-Sicht wie das ausgewählte
  Bild-Modell; Queued-Notification- und Cron-Drains bleiben unabhängige Turns
  und erben sie nicht.
- Konfigurierte Fallback-Modelle sind für diesen Turn deaktiviert. Kann die
  exakte Route nicht aufgelöst werden, wird fail-closed verfahren, statt rohe
  Bilddaten an das primäre Modell zu senden.
- Der nächste unabhängige Nutzer-Turn löscht den Selektor und kehrt zum
  primären Modell zurück. Jede Modell-Anfrage, einschließlich Side-Queries,
  erhält nur Medien-Modalitäten, die von ihrem exakten Ziel unterstützt
  werden.

Der Full-Turn-Selektor fügt der bestehenden `model\0baseUrl`-Darstellung
einen angehängten NUL-Marker hinzu. Die Chat-Ebene entfernt diesen Marker vor
der Modell-Auflösung. Damit behalten gewöhnliche Endpoint-qualifizierte
Modellauswahlen ihr bestehendes Verhalten.

## Kontext-Limits

LLM-basierte automatische Chat-Kompression bleibt auf dem
Primärmodell-Pfad. Eine Full-Turn-Route überspringt diese Kompression, denn
eine Primärmodell-Kompression, während ein Bild-Turn einem anderen Provider
gehört, würde die Exakte-Route-Garantie verletzen. Bestehende lokale
History-Microcompaction und Verschlankung von Bild-Payloads greifen
weiterhin, und Request-/Cache-Kopien behalten nur Medien-Modalitäten, die von
ihrem Zielmodell unterstützt werden. Ein zu großer Full-Turn-Request schlägt
daher auf dem ausgewählten Modell fehl.

## Einstiegspunkte

Phase 1 deckt die interaktive TUI, ACP und die nicht-interaktive CLI ab.

Textuelle `@`-Pfade werden vor MIME-Erkennung, Workspace-Checks,
Ignore-Filterung und Dateilesevorgängen auf ihr kanonisches Ziel aufgelöst.
Sowohl der vom Nutzer angegebene Alias als auch das kanonische Ziel müssen
die Ignore-Filterung bestehen, damit ein Symlink keine ignorierte Datei oder
ein Nicht-Bild-Ziel tarnen kann. Hardlinks werden von `realpath` nicht
aufgelöst und sind von diesem Check nicht abgedeckt.
